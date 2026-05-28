/**
 * Combat system
 *
 * Pure functions for damage, momentum, and turn order. No Phaser
 * dependencies — trivial to unit test.
 *
 * Invariants:
 *   - Momentum multipliers are symmetric: COOL favors the enemy,
 *     HEAT favors the hero, ZONE is 1x on both sides.
 *   - Callers always pass an explicit target to damage functions —
 *     there is no implicit "current hero".
 *   - `applyDamageResult` is the only place HP mutates.
 *   - Combat functions never touch the save file; the scene layer does.
 */

// ------------------------------------------------------------------
// MOMENTUM ZONES
// ------------------------------------------------------------------
// Momentum is a single number in [0, 1]. Three zones:
//
//   COOL  (0.00 – 0.33)  — player is struggling
//     Enemy damage: 1.15x   Hero damage: 0.85x
//
//   ZONE  (0.33 – 0.66)  — balanced middle
//     Enemy damage: 1.00x   Hero damage: 1.00x
//
//   HEAT  (0.66 – 1.00)  — player is in flow
//     Enemy damage: 0.85x   Hero damage: 1.20x
//
// Symmetric multipliers = no free wins, no cheap losses. Players who
// stay in HEAT are rewarded; players who slip to COOL pay for it.
//
// "Zone" labels match what the prototype displayed, but the *effects*
// are now logically consistent with those labels.

export const MOMENTUM_ZONES = {
  COOL: { min: 0.00, max: 0.33, heroMult: 0.85, enemyMult: 1.15, label: 'COOL' },
  ZONE: { min: 0.33, max: 0.66, heroMult: 1.00, enemyMult: 1.00, label: 'ZONE' },
  HEAT: { min: 0.66, max: 1.00, heroMult: 1.20, enemyMult: 0.85, label: 'HEAT' },
};

/** Which zone is the current momentum in? Returns one of MOMENTUM_ZONES. */
export function getZone(momentum) {
  if (momentum < MOMENTUM_ZONES.COOL.max) return MOMENTUM_ZONES.COOL;
  if (momentum < MOMENTUM_ZONES.ZONE.max) return MOMENTUM_ZONES.ZONE;
  return MOMENTUM_ZONES.HEAT;
}

// ------------------------------------------------------------------
// MOMENTUM DELTAS
// ------------------------------------------------------------------
// Correct answers push momentum up. Wrong answers push it down. A
// streak bonus accelerates the climb but does NOT accelerate the drop
// (that would feel punishing).

const CORRECT_BASE_DELTA = 0.08;
const WRONG_BASE_DELTA   = 0.12;
const STREAK_BONUS_STEP  = 0.015;   // extra per streak level, capped
const STREAK_BONUS_CAP   = 0.05;    // max additional per correct answer

/**
 * Compute the new momentum after a correct or wrong answer.
 *
 * @param {number} current  Current momentum in [0, 1].
 * @param {boolean} correct Whether the answer was correct.
 * @param {number} streak   Current correct streak (0 if just wrong).
 * @returns {number}        New momentum, clamped to [0, 1].
 */
export function advanceMomentum(current, correct, streak = 0) {
  if (correct) {
    const bonus = Math.min(streak * STREAK_BONUS_STEP, STREAK_BONUS_CAP);
    return clamp01(current + CORRECT_BASE_DELTA + bonus);
  }
  return clamp01(current - WRONG_BASE_DELTA);
}

function clamp01(n) {
  if (n < 0.15) return 0.15;
  if (n > 1) return 1;
  return n;
}

// ------------------------------------------------------------------
// DAMAGE
// ------------------------------------------------------------------

/**
 * @typedef {object} Combatant
 * @property {number} hp      Current HP
 * @property {number} maxHp   Maximum HP
 * @property {number} [atk]   Attack stat (defaults to 10)
 * @property {number} [def]   Defense stat (defaults to 0)
 */

/**
 * @typedef {object} DamageResult
 * @property {number} baseDamage     Before momentum adjustment
 * @property {number} modifiedDamage After momentum adjustment (what was applied)
 * @property {number} newHp          Target HP after damage
 * @property {boolean} killed        True if this hit dropped HP to 0
 */

const BASE_HERO_DAMAGE  = 6;
const BASE_ENEMY_DAMAGE = 5;

/**
 * Compute damage for a hero attacking an enemy. Pure — does not mutate.
 *
 * @param {Combatant} attacker
 * @param {Combatant} target
 * @param {object} ctx
 * @param {number} ctx.momentum
 * @param {number} [ctx.streak]   Correct answer streak, boosts damage slightly
 * @returns {DamageResult}
 */
export function computeHeroDamage(attacker, target, ctx) {
  const atk = attacker.atk ?? 10;
  const def = target.def ?? 0;
  const zone = getZone(ctx.momentum);
  const streakBonus = Math.floor((ctx.streak ?? 0) / 3);

  const baseDamage = Math.max(1, Math.round(BASE_HERO_DAMAGE + (atk - 10) * 0.4 - def * 0.3 + streakBonus));
  const modified = Math.max(1, Math.round(baseDamage * zone.heroMult));
  const newHp = Math.max(0, target.hp - modified);

  return {
    baseDamage,
    modifiedDamage: modified,
    newHp,
    killed: newHp === 0 && target.hp > 0,
  };
}

/**
 * Compute damage for an enemy attacking a hero. Pure — does not mutate.
 *
 * @param {Combatant} attacker
 * @param {Combatant} target
 * @param {object} ctx
 * @param {number} ctx.momentum
 * @returns {DamageResult}
 */
export function computeEnemyDamage(attacker, target, ctx) {
  const atk = attacker.atk ?? 10;
  const def = target.def ?? 0;
  const zone = getZone(ctx.momentum);

  const baseDamage = Math.max(1, Math.round(BASE_ENEMY_DAMAGE + (atk - 10) * 0.4 - def * 0.3));
  const modified = Math.max(1, Math.round(baseDamage * zone.enemyMult));
  const newHp = Math.max(0, target.hp - modified);

  return {
    baseDamage,
    modifiedDamage: modified,
    newHp,
    killed: newHp === 0 && target.hp > 0,
  };
}

/**
 * Apply a damage result to a target. This is the ONLY place in the
 * codebase that should mutate HP. Returns the mutated target for chaining.
 *
 * @param {Combatant} target
 * @param {DamageResult} result
 * @returns {Combatant}
 */
export function applyDamageResult(target, result) {
  target.hp = result.newHp;
  return target;
}

// ------------------------------------------------------------------
// TURN ORDER
// ------------------------------------------------------------------

/**
 * Build the turn sequence for a battle. Format: alternating hero / enemy
 * turns, cycling through the party. Dead party members are filtered out
 * at runtime via `nextLivingHero`, not at build time.
 *
 * @param {number} partySize Number of heroes in the party (typically 3)
 * @returns {Turn[]}
 *
 * @typedef {object} Turn
 * @property {'hero' | 'enemy'} who
 * @property {number} [heroIndex] Only set when who === 'hero'
 */
export function buildTurnSequence(partySize) {
  const seq = [];
  for (let i = 0; i < partySize; i++) {
    seq.push({ who: 'hero', heroIndex: i });
    seq.push({ who: 'enemy' });
  }
  return seq;
}

/**
 * Advance the turn index, skipping dead heroes. Returns the new index
 * and the turn descriptor. If the entire party is dead, returns null.
 *
 * @param {Turn[]} sequence
 * @param {number} currentIndex
 * @param {Combatant[]} party
 * @returns {{ index: number, turn: Turn } | null}
 */
export function advanceTurn(sequence, currentIndex, party) {
  const len = sequence.length;
  if (len === 0) return null;

  for (let step = 1; step <= len; step++) {
    const idx = (currentIndex + step) % len;
    const turn = sequence[idx];
    if (turn.who === 'enemy') {
      return { index: idx, turn };
    }
    // Hero turn — skip if that hero is dead
    const hero = party[turn.heroIndex];
    if (hero && hero.hp > 0) {
      return { index: idx, turn };
    }
  }
  // Walked the whole sequence and nothing was alive — total party defeat
  return null;
}

// ------------------------------------------------------------------
// COMMAND-AWARE DAMAGE
// ------------------------------------------------------------------

/**
 * Compute damage for a hero attack using the command system.
 * Integrates difficulty stars, command multiplier, momentum, and class.
 *
 * @param {Combatant} attacker
 * @param {Combatant} target
 * @param {object} ctx
 * @param {number} ctx.momentum
 * @param {number} [ctx.streak]
 * @param {number} [ctx.difficultyStars]  1-5 star rating of the question
 * @param {number} [ctx.commandMult]      Command multiplier (1.0 for FIGHT, 2.0 for MAGIC)
 * @param {number} [ctx.difficultyMult]   Pre-computed difficulty multiplier
 * @returns {DamageResult}
 */
export function computeCommandDamage(attacker, target, ctx) {
  const atk = attacker.atk ?? 10;
  const def = target.def ?? 0;
  const zone = getZone(ctx.momentum);
  const streakBonus = Math.floor((ctx.streak ?? 0) / 3);

  const baseDamage = Math.max(1, Math.round(
    BASE_HERO_DAMAGE + (atk - 10) * 0.4 - def * 0.3 + streakBonus
  ));

  const diffMult = ctx.difficultyMult ?? 1.0;
  const cmdMult = ctx.commandMult ?? 1.0;

  const modified = Math.max(1, Math.round(
    baseDamage * diffMult * cmdMult * zone.heroMult
  ));
  const newHp = Math.max(0, target.hp - modified);

  return {
    baseDamage,
    modifiedDamage: modified,
    newHp,
    killed: newHp === 0 && target.hp > 0,
  };
}

/**
 * Apply guard damage reduction. Halves incoming damage.
 * @param {DamageResult} result - Original damage result
 * @returns {DamageResult}      - Modified result with halved damage
 */
export function applyGuardReduction(result, targetHp) {
  const reduced = Math.max(1, Math.ceil(result.modifiedDamage * 0.5));
  const newHp = Math.max(0, targetHp - reduced);
  return {
    baseDamage: result.baseDamage,
    modifiedDamage: reduced,
    newHp,
    killed: newHp === 0 && targetHp > 0,
  };
}

/** Are all party members dead? */
export function isPartyDefeated(party) {
  return party.every((h) => !h || h.hp <= 0);
}

/** Pick a random living hero from the party, or null if none. */
export function pickRandomLivingHero(party, rng = Math.random) {
  const living = party.filter((h) => h && h.hp > 0);
  if (living.length === 0) return null;
  return living[Math.floor(rng() * living.length)];
}
