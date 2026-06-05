/**
 * Signature Effects — hooks for hero signature abilities in combat.
 *
 * Each hero has a unique signature with an `effect` field that maps to
 * a combat behavior. This module provides hook functions that the
 * BattleScene calls at key combat moments. If the hero has no matching
 * signature, the unmodified value is returned.
 *
 * Hook functions:
 *   onHeroDamageDealt(hero, target, baseDamage, ctx) -> modified damage
 *   onHeroDamageReceived(hero, attacker, baseDamage, party, battleState) -> modified damage
 *   onTurnStart(party, battleState) -> resets per-turn flags
 *   onEnemyTurnStart(enemies, party, battleState, scene) -> applies poison/burn ticks
 *   onBattleStart(party, battleState) -> initializes per-battle flags
 */

// ------------------------------------------------------------------
// BATTLE STATE INITIALIZATION
// ------------------------------------------------------------------

/**
 * Create the per-battle signature state object.
 * Call once at battle start and store on the scene.
 */
export function createSignatureState(party) {
  const state = {
    // Great Helm: lastStand one-time flag per hero index
    lastStandUsed: new Array(party.length).fill(false),
    // Pepper: first strike used flag
    firstStrikeUsed: false,
    // Boulder: double-def flag per hero index (reset each turn)
    doubleDefActive: new Array(party.length).fill(true),
    // Stargazer: reveal wrong answer flag (for question UI)
    revealWrongActive: false,
    // Bookworm: timer bonus flag (for question timer)
    timerBonusSeconds: 0,
    // Blaze: burn tracking per enemy index { turnsLeft, damage }
    burns: [],
    // Nova: correct streak for splash (uses scene.streak, stored here for reference)
    // Paladin: guard-ally tracking per hero index
    paladinGuardTarget: new Array(party.length).fill(false),
    // Low HP battle cry shown flags per hero index
    lowHpCryShown: new Array(party.length).fill(false),
  };

  // Scan party for passive flags
  for (let i = 0; i < party.length; i++) {
    const hero = party[i];
    if (!hero || !hero.signature) continue;

    if (hero.signature.effect === 'revealWrong') {
      state.revealWrongActive = true;
    }
    if (hero.signature.effect === 'timerBonus') {
      state.timerBonusSeconds += hero.signature.value;
    }
  }

  return state;
}

// ------------------------------------------------------------------
// HOOKS
// ------------------------------------------------------------------

/**
 * Modify outgoing hero damage. Called after base damage is computed.
 *
 * @param {object} hero - The attacking hero
 * @param {object} target - The enemy being attacked
 * @param {number} baseDamage - Computed damage before signature
 * @param {object} ctx - { party, battleState, command, streak, questionStars }
 * @returns {number} Modified damage
 */
export function onHeroDamageDealt(hero, target, baseDamage, ctx) {
  if (!hero || !hero.signature) return baseDamage;
  let damage = baseDamage;
  const effect = hero.signature.effect;
  const value = hero.signature.value;
  const state = ctx.battleState;

  // Spellblade: hybridDamage — FIGHT and MAGIC both deal value× damage
  if (effect === 'hybridDamage') {
    damage = Math.round(damage * value);
  }

  // Berserker: rageAtk — bonus ATK based on missing HP (already applied to atk in the scene,
  // but as a fallback, we apply the multiplier here if the scene didn't handle it)
  // Note: rageAtk is handled in getEffectiveAtk() instead

  // Pepper: firstStrike — +value damage on first hero attack of battle
  if (effect === 'firstStrike' && state && !state.firstStrikeUsed) {
    state.firstStrikeUsed = true;
    damage = Math.round(damage * (1 + value));
  }

  // Grand Mage: hardBonus — correct answers on 4-5 star questions deal value× damage
  if (effect === 'hardBonus' && ctx.questionStars >= 4) {
    damage = Math.round(damage * value);
  }

  return damage;
}

/**
 * Modify incoming damage to a hero. Called after base enemy damage is computed.
 *
 * @param {object} hero - The hero being hit
 * @param {object} attacker - The enemy attacking
 * @param {number} baseDamage - Computed damage before signature
 * @param {object} ctx - { party, battleState, heroIndex }
 * @returns {{ damage: number, dodged: boolean, lastStand: boolean }}
 */
export function onHeroDamageReceived(hero, attacker, baseDamage, ctx) {
  const result = { damage: baseDamage, dodged: false, lastStand: false };
  if (!hero) return result;

  const party = ctx.party || [];
  const state = ctx.battleState;
  const heroIndex = ctx.heroIndex ?? -1;

  // Shadow: dodge — random < value means damage = 0
  if (hero.signature && hero.signature.effect === 'dodge') {
    if (Math.random() < hero.signature.value) {
      result.damage = 0;
      result.dodged = true;
      return result;
    }
  }

  // Crusader: partyDamageReduce — if Crusader alive in party, reduce damage
  for (const ally of party) {
    if (!ally || ally.hp <= 0 || ally === hero) continue;
    if (ally.signature && ally.signature.effect === 'partyDamageReduce') {
      result.damage = Math.max(1, Math.round(result.damage * (1 - ally.signature.value)));
    }
  }

  // Boulder: doubleDef — on first hit received each turn, double DEF for calc
  if (hero.signature && hero.signature.effect === 'doubleDef') {
    if (state && state.doubleDefActive[heroIndex]) {
      // Approximate: reduce damage by hero.def (since DEF was counted once, count it again)
      const defReduction = Math.round((hero.def || 0) * 0.3);
      result.damage = Math.max(1, result.damage - defReduction);
      state.doubleDefActive[heroIndex] = false;
    }
  }

  // Duchess: leaderAura is stat-based, handled in getEffectiveStats

  // Great Helm: lastStand — when hero would die, set HP to 1 once
  // This is checked AFTER damage is applied in the scene, not here.
  // We return a flag so the scene can check.

  return result;
}

/**
 * Check lastStand after damage is applied. If hero HP <= 0 and
 * lastStand hasn't been used, set HP to 1.
 *
 * @param {object} hero - The hero that just took damage
 * @param {number} heroIndex - Index in party
 * @param {object} battleState - Signature battle state
 * @returns {boolean} True if lastStand activated
 */
export function checkLastStand(hero, heroIndex, battleState) {
  if (!hero || hero.hp > 0) return false;
  if (!hero.signature || hero.signature.effect !== 'lastStand') return false;
  if (!battleState || battleState.lastStandUsed[heroIndex]) return false;

  battleState.lastStandUsed[heroIndex] = true;
  hero.hp = 1;
  return true;
}

/**
 * Called at the start of each hero turn. Resets per-turn flags.
 */
export function onTurnStart(party, battleState) {
  if (!battleState) return;
  // Reset Boulder's doubleDef for all heroes
  for (let i = 0; i < party.length; i++) {
    battleState.doubleDefActive[i] = true;
  }
}

/**
 * Called at the start of the enemy turn phase. Applies poison and burn ticks.
 * Returns an array of { enemyIndex, damage, type } for the scene to animate.
 *
 * @param {Array} enemies - Enemy array
 * @param {Array} party - Hero party
 * @param {object} battleState - Signature state
 * @returns {Array<{ enemyIndex: number, damage: number, type: string }>}
 */
export function onEnemyTurnStart(enemies, party, battleState) {
  const ticks = [];
  if (!battleState) return ticks;

  // Toadstool: poison — if alive, deal value damage to all enemies
  for (const hero of party) {
    if (!hero || hero.hp <= 0) continue;
    if (hero.signature && hero.signature.effect === 'poison') {
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) {
          ticks.push({ enemyIndex: i, damage: hero.signature.value, type: 'poison' });
        }
      }
    }
  }

  // Blaze: burn ticks
  for (let i = 0; i < battleState.burns.length; i++) {
    const burn = battleState.burns[i];
    if (!burn || burn.turnsLeft <= 0) continue;
    if (enemies[burn.enemyIndex] && enemies[burn.enemyIndex].hp > 0) {
      ticks.push({ enemyIndex: burn.enemyIndex, damage: burn.damage, type: 'burn' });
      burn.turnsLeft--;
    }
  }
  // Clean up expired burns
  battleState.burns = battleState.burns.filter(b => b && b.turnsLeft > 0);

  return ticks;
}

/**
 * After Blaze attacks, mark the target with burn.
 */
export function applyBurnOnAttack(hero, enemyIndex, battleState) {
  if (!hero || !hero.signature || hero.signature.effect !== 'burn') return;
  if (!battleState) return;
  const value = hero.signature.value;
  // Check if already burning
  const existing = battleState.burns.find(b => b.enemyIndex === enemyIndex);
  if (existing) {
    existing.turnsLeft = value;
    existing.damage = value;
  } else {
    battleState.burns.push({ enemyIndex, damage: value, turnsLeft: value });
  }
}

/**
 * Nova: splashStreak — after 3+ correct streak, deal 30% splash to other enemies.
 * Returns array of { enemyIndex, damage } for other enemies.
 */
export function getSplashDamage(hero, targetIndex, baseDamage, enemies, streak) {
  if (!hero || !hero.signature || hero.signature.effect !== 'splashStreak') return [];
  if (streak < (hero.signature.value || 3)) return [];

  const splashDmg = Math.max(1, Math.round(baseDamage * 0.3));
  const splashes = [];
  for (let i = 0; i < enemies.length; i++) {
    if (i === targetIndex || enemies[i].hp <= 0) continue;
    splashes.push({ enemyIndex: i, damage: splashDmg });
  }
  return splashes;
}

// ------------------------------------------------------------------
// STAT MODIFIERS
// ------------------------------------------------------------------

/**
 * Get effective ATK for a hero, including signature bonuses.
 * Call this instead of raw hero.atk when computing damage.
 */
export function getEffectiveAtk(hero, party) {
  if (!hero) return 0;
  let atk = hero.atk || 0;

  // Berserker: rageAtk — +value per 10 HP lost
  if (hero.signature && hero.signature.effect === 'rageAtk') {
    const missingHp = (hero.maxHp || 0) - (hero.hp || 0);
    atk += hero.signature.value * Math.floor(missingHp / 10);
  }

  // Duchess: leaderAura — other heroes get +value ATK
  if (party) {
    for (const ally of party) {
      if (!ally || ally === hero || ally.hp <= 0) continue;
      if (ally.signature && ally.signature.effect === 'leaderAura') {
        atk += ally.signature.value;
      }
    }
  }

  return atk;
}

/**
 * Get effective DEF for a hero, including signature bonuses.
 */
export function getEffectiveDef(hero, party) {
  if (!hero) return 0;
  let def = hero.def || 0;

  // Duchess: leaderAura — other heroes get +value DEF
  if (party) {
    for (const ally of party) {
      if (!ally || ally === hero || ally.hp <= 0) continue;
      if (ally.signature && ally.signature.effect === 'leaderAura') {
        def += ally.signature.value;
      }
    }
  }

  return def;
}

/**
 * Check if Paladin guardAlly should trigger (ally dropped below threshold).
 * Sets a flag so Paladin blocks the next hit for that ally.
 */
export function checkPaladinGuard(hero, heroIndex, party, battleState) {
  if (!battleState) return;
  // Check if any Paladin in party should guard this hero
  for (let i = 0; i < party.length; i++) {
    const ally = party[i];
    if (!ally || ally.hp <= 0 || i === heroIndex) continue;
    if (ally.signature && ally.signature.effect === 'guardAlly') {
      const threshold = ally.signature.value * (hero.maxHp || 1);
      if (hero.hp > 0 && hero.hp <= threshold && !battleState.paladinGuardTarget[heroIndex]) {
        battleState.paladinGuardTarget[heroIndex] = true;
      }
    }
  }
}

/**
 * Check if Paladin guard blocks an incoming hit for a hero.
 * Returns true if blocked (consumes the guard).
 */
export function consumePaladinGuard(heroIndex, battleState) {
  if (!battleState) return false;
  if (battleState.paladinGuardTarget[heroIndex]) {
    battleState.paladinGuardTarget[heroIndex] = false;
    return true;
  }
  return false;
}
