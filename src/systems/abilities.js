/**
 * Enemy abilities
 *
 * Wires the ability *names* defined in src/data/enemies.js to actual
 * behavior in combat. Each ability is a set of three hook functions:
 *
 *   onBattleStart(ctx) - called when the battle scene boots
 *   onHeroCorrect(ctx) - called after the player answers correctly
 *   onHeroWrong(ctx)   - called after the player answers wrong
 *
 * ctx provides:
 *   enemy       - the current enemy combatant
 *   party       - array of hero combatants
 *   scene       - BattleScene instance (for visual effects, toasts)
 *   activeHero  - the hero whose turn it is
 *
 * Most abilities are no-ops for now. The ones implemented here create
 * meaningful tactical differences:
 *
 *   - sporulate   - enemy gains +2 ATK on every wrong answer
 *   - accumulate  - enemy gains +1 ATK every turn (hero or enemy)
 *   - shell_split - at half HP, enemy gets a second attack on its next turn
 *   - consume     - on wrong answer, the correct-answer button is disabled
 *                   next turn (the enemy "ate" the answer)
 *   - crown_tally - enemy gains +1 ATK per correct answer streak break
 *
 * The rest of the ability names in enemies.js are wired as no-ops for
 * now so the ability declaration never crashes. We can flesh them out
 * in future passes.
 */

import { playAbilityVfx } from './abilityVfx.js';

// ------------------------------------------------------------------
// INDIVIDUAL ABILITY IMPLEMENTATIONS
// ------------------------------------------------------------------

const NOOP = {};

const sporulate = {
  onBattleStart(ctx) {
    ctx.enemy._sporulateBoost = 0;
  },
  onHeroWrong(ctx) {
    ctx.enemy._sporulateBoost = (ctx.enemy._sporulateBoost || 0) + 2;
    ctx.enemy.atk += 2;
    ctx.scene.showToast('Sproutling releases spores! +2 ATK', '#e8a030');
  },
};

const accumulate = {
  onBattleStart(ctx) {
    ctx.enemy._turnCount = 0;
  },
  onHeroCorrect(ctx) {
    ctx.enemy._turnCount++;
    if (ctx.enemy._turnCount >= 2) {
      ctx.enemy.atk += 1;
      ctx.enemy._turnCount = 0;
      ctx.scene.showToast('Thornwall accumulates! +1 ATK', '#e8a030');
    }
  },
  onHeroWrong(ctx) {
    ctx.enemy._turnCount++;
    if (ctx.enemy._turnCount >= 2) {
      ctx.enemy.atk += 1;
      ctx.enemy._turnCount = 0;
      ctx.scene.showToast('Thornwall accumulates! +1 ATK', '#e8a030');
    }
  },
};

const shell_split = {
  onBattleStart(ctx) {
    ctx.enemy._split = false;
  },
  onHeroCorrect(ctx) {
    // Trigger once at half HP
    if (!ctx.enemy._split && ctx.enemy.hp <= ctx.enemy.maxHp / 2) {
      ctx.enemy._split = true;
      ctx.enemy.atk = Math.round(ctx.enemy.atk * 1.4);
      ctx.scene.showToast('Cindercrab splits! +40% ATK', '#c04030');
    }
  },
};

const consume = {
  onHeroWrong(ctx) {
    // On next hero turn, disable the correct answer button for 1 turn
    ctx.scene._consumeNextTurn = true;
    ctx.scene.showToast('Gulper swallows an answer!', '#4040c0');
  },
  onHeroCorrect(ctx) {
    // Clean up after a successful turn
    ctx.scene._consumeNextTurn = false;
  },
};

const crown_tally = {
  onBattleStart(ctx) {
    ctx.enemy._crownStacks = 0;
  },
  onHeroWrong(ctx) {
    ctx.enemy._crownStacks = (ctx.enemy._crownStacks || 0) + 1;
    ctx.enemy.atk += 1;
    ctx.scene.showToast(`Briar King's crown: ×${ctx.enemy._crownStacks}!`, '#8a1010');
  },
};

// ------------------------------------------------------------------
// REGISTRY
// ------------------------------------------------------------------

export const ABILITIES = {
  sporulate,
  accumulate,
  shell_split,
  consume,
  crown_tally,

  // ── FLOOR 1: GARDEN (growth theme) ──
  sweet_add: {
    onHeroWrong(ctx) {
      const heal = Math.round(ctx.enemy.maxHp * 0.05);
      ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + heal);
      ctx.scene.showToast(`Blossom Fiend heals ${heal} HP!`, '#e04870');
      ctx.scene.updateEnemyHp();
    },
  },
  pressure: {
    onBattleStart(ctx) { ctx.enemy._pressureStacks = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._pressureStacks++;
      if (ctx.enemy._pressureStacks >= 2) {
        ctx.enemy.atk += 2;
        ctx.enemy._pressureStacks = 0;
        ctx.scene.showToast('Puffshroom pressure builds! +2 ATK', '#e6c018');
      }
    },
  },

  // ── FLOOR 2: TIDEPOOL (drain theme) ──
  sting_drain: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.25) {
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + 3);
        ctx.scene.showToast('Drifter drains life!', '#3aa0d8');
        ctx.scene.updateEnemyHp();
      }
    },
  },
  ink_cloud: {
    onHeroWrong(ctx) {
      ctx.scene._consumeNextTurn = true;
      ctx.scene.showToast('Inkspitter clouds an answer!', '#081820');
    },
  },
  drain_current: {
    onHeroWrong(ctx) {
      const hero = ctx.activeHero;
      if (hero && hero.hp > 0) {
        const drain = 3;
        hero.hp = Math.max(1, hero.hp - drain);
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + drain);
        ctx.scene.showToast(`Abyssal Eel drains ${drain} HP!`, '#1cd8c8');
        ctx.scene.updateEnemyHp();
      }
    },
  },
  abs_reduction: {
    onBattleStart(ctx) { ctx.enemy._absStacks = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._absStacks++;
      ctx.enemy.def += 1;
      ctx.scene.showToast(`The Pressure hardens! +1 DEF (×${ctx.enemy._absStacks})`, '#244878');
    },
  },

  // ── FLOOR 3: CLOUD (multiply theme) ──
  thunder_mul: {
    onHeroCorrect(ctx) {
      if (ctx.scene.streak >= 2 && Math.random() < 0.3) {
        ctx.enemy.atk = Math.round(ctx.enemy.atk * 1.3);
        ctx.scene.showToast('Stormwing channels thunder! ATK up!', '#f0e01e');
      }
    },
  },
  volley: {
    onHeroWrong(ctx) {
      const targets = ctx.party.filter(h => h.hp > 0);
      if (targets.length > 1) {
        const extra = targets[Math.floor(Math.random() * targets.length)];
        extra.hp = Math.max(1, extra.hp - 3);
        ctx.scene.showToast('Hailshot volleys the party! -3 HP', '#b0d4ea');
      }
    },
  },
  spin_up: {
    onBattleStart(ctx) { ctx.enemy._spinStacks = 0; },
    onHeroCorrect(ctx) {
      ctx.enemy._spinStacks++;
      if (ctx.enemy._spinStacks >= 3) {
        ctx.enemy.atk += 3;
        ctx.enemy._spinStacks = 0;
        ctx.scene.showToast('Cyclone Imp spins up! +3 ATK', '#e8d81a');
      }
    },
  },
  clap_charge: {
    onBattleStart(ctx) { ctx.enemy._charged = false; },
    onHeroWrong(ctx) {
      ctx.enemy._charged = true;
      ctx.scene.showToast('Thunderclap charges up...', '#f0e01e');
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy._charged) {
        ctx.enemy._charged = false;
        ctx.enemy.atk += 4;
        ctx.scene.showToast('THUNDERCLAP! +4 ATK from charge!', '#ffffff');
      }
    },
  },
  mass_matters: {
    onHeroWrong(ctx) {
      ctx.enemy.def += 2;
      ctx.scene.showToast('Skywhale grows heavier! +2 DEF', '#526280');
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy.def > 0) {
        ctx.enemy.def = Math.max(0, ctx.enemy.def - 1);
      }
    },
  },

  // ── FLOOR 4: EMBER (split theme) ──
  ash_divide: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.2) {
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + Math.round(ctx.enemy.maxHp * 0.03));
        ctx.scene.showToast('Ashwalker regenerates from ash!', '#de3e0e');
        ctx.scene.updateEnemyHp();
      }
    },
  },
  split_tongue: {
    onHeroWrong(ctx) {
      const targets = ctx.party.filter(h => h.hp > 0);
      targets.forEach(h => { h.hp = Math.max(1, h.hp - 2); });
      ctx.scene.showToast('Magma Toad splashes everyone! -2 HP', '#e04a08');
    },
  },
  shard_volley: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.3) {
        const hero = ctx.activeHero;
        if (hero) { hero.hp = Math.max(1, hero.hp - 4); }
        ctx.scene.showToast('Spineshard retaliates! -4 HP', '#e04008');
      }
    },
  },
  core_divide: {
    onBattleStart(ctx) { ctx.enemy._corePhase = false; },
    onHeroCorrect(ctx) {
      if (!ctx.enemy._corePhase && ctx.enemy.hp <= ctx.enemy.maxHp * 0.3) {
        ctx.enemy._corePhase = true;
        ctx.enemy.atk = Math.round(ctx.enemy.atk * 1.5);
        ctx.enemy.def = 0;
        ctx.scene.showToast('Pyroclast enters CORE MELTDOWN! ATK surges!', '#f0a010');
      }
    },
  },

  // ── FLOOR 5: ARCANE (shift theme) ──
  op_shift: {
    onHeroWrong(ctx) {
      ctx.enemy.atk += 1;
      ctx.enemy.def += 1;
      ctx.scene.showToast('Runebound absorbs the mistake! +1 ATK/DEF', '#c080f0');
    },
  },
  geo_lock: {
    onBattleStart(ctx) { ctx.enemy._lockCount = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._lockCount++;
      if (ctx.enemy._lockCount >= 2) {
        ctx.scene._consumeNextTurn = true;
        ctx.enemy._lockCount = 0;
        ctx.scene.showToast('Hexweave locks an answer!', '#9060f8');
      }
    },
  },
  flip_page: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.2) {
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + Math.round(ctx.enemy.maxHp * 0.04));
        ctx.scene.showToast('Grimoire flips to a healing page!', '#d0a030');
        ctx.scene.updateEnemyHp();
      }
    },
    onHeroWrong(ctx) {
      ctx.enemy.atk += 1;
      ctx.scene.showToast('Grimoire writes your mistake! +1 ATK', '#d0a030');
    },
  },
  phase_lock: {
    onHeroWrong(ctx) {
      if (Math.random() < 0.4) {
        const hero = ctx.activeHero;
        if (hero) { hero.def = Math.max(0, hero.def - 2); }
        ctx.scene.showToast('Familiar phases through armor! -2 DEF', '#c040f0');
      }
    },
  },
  the_unknown: {
    onBattleStart(ctx) { ctx.enemy._unknownPhase = 0; },
    onHeroCorrect(ctx) {
      ctx.enemy._unknownPhase++;
      if (ctx.enemy._unknownPhase % 4 === 0) {
        ctx.enemy.atk += 2;
        ctx.enemy.def += 1;
        ctx.scene.showToast('The Theorem evolves! Stats grow!', '#b888ff');
      }
    },
    onHeroWrong(ctx) {
      ctx.enemy._unknownPhase += 2;
      ctx.enemy.atk += 1;
      ctx.scene.showToast('The Theorem absorbs confusion! +1 ATK', '#7040d8');
    },
  },

  // ── FLOOR 5: FROZEN PEAK (Fractions) ──

  chill_snap: {
    onHeroWrong(ctx) {
      const hero = ctx.activeHero;
      if (hero) { hero.atk = Math.max(1, hero.atk - 1); }
      ctx.scene.showToast('Frostbite chills your attack! -1 ATK', '#80c8f0');
    },
  },
  freeze_ray: {
    onBattleStart(ctx) { ctx.enemy._frozenTurns = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._frozenTurns = 2;
      ctx.scene.showToast('Icicle Imp freezes you! Slowed 2 turns', '#90d8ff');
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy._frozenTurns > 0) {
        ctx.enemy._frozenTurns--;
        ctx.enemy.def += 1;
        ctx.scene.showToast('Still frozen... enemy DEF +1', '#a0e0ff');
      }
    },
  },
  blizzard: {
    onHeroWrong(ctx) {
      ctx.party.filter(h => h.hp > 0).forEach(h => {
        h.hp = Math.max(1, h.hp - 2);
      });
      ctx.scene.showToast('Snowdrift blizzard hits everyone! -2 HP', '#c0e8ff');
    },
  },
  ice_armor: {
    onBattleStart(ctx) { ctx.enemy._iceShield = 3; },
    onHeroCorrect(ctx) {
      if (ctx.enemy._iceShield > 0) {
        ctx.enemy._iceShield--;
        ctx.enemy.def += 2;
        ctx.scene.showToast(`Ice armor cracks! ${ctx.enemy._iceShield} layers left`, '#60a8d0');
      }
    },
    onHeroWrong(ctx) {
      if (ctx.enemy._iceShield < 3) {
        ctx.enemy._iceShield++;
        ctx.scene.showToast('Ice armor reforms!', '#80c0e0');
      }
    },
  },
  deep_freeze: {
    onBattleStart(ctx) {
      ctx.enemy._freezeStacks = 0;
      ctx.enemy._frozenHero = null;
    },
    onHeroWrong(ctx) {
      ctx.enemy._freezeStacks++;
      if (ctx.enemy._freezeStacks >= 3) {
        ctx.enemy._freezeStacks = 0;
        const hero = ctx.activeHero;
        if (hero) {
          ctx.enemy._frozenHero = hero;
          hero.def = Math.max(0, hero.def - 3);
          ctx.scene.showToast(`DEEP FREEZE! ${hero.name} loses 3 DEF!`, '#2060c0');
        }
      } else {
        ctx.scene.showToast(`Freeze building... ${ctx.enemy._freezeStacks}/3`, '#60a0d8');
      }
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy._freezeStacks > 0) {
        ctx.enemy._freezeStacks = Math.max(0, ctx.enemy._freezeStacks - 1);
      }
      if (ctx.enemy._frozenHero) {
        ctx.enemy._frozenHero.def += 1;
        ctx.enemy._frozenHero = null;
        ctx.scene.showToast('The ice thaws a little...', '#80d0ff');
      }
    },
  },

  // ── FLOOR 6: CRYSTAL CAVERNS (Geometry) ──

  refract: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.25) {
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + Math.round(ctx.enemy.maxHp * 0.03));
        ctx.scene.showToast('Crystal refracts the hit! Heals!', '#d0a0ff');
        ctx.scene.updateEnemyHp();
      }
    },
  },
  crystal_burst: {
    onHeroWrong(ctx) {
      const hero = ctx.activeHero;
      if (hero) { hero.hp = Math.max(1, hero.hp - 5); }
      ctx.scene.showToast('Geode bursts! -5 HP!', '#c080f0');
    },
  },
  light_split: {
    onHeroCorrect(ctx) {
      if (ctx.scene.streak >= 3 && Math.random() < 0.3) {
        ctx.enemy.def += 2;
        ctx.scene.showToast('Prismling splits the light! +2 DEF', '#e0c0ff');
      }
    },
  },
  mirror_shield: {
    onBattleStart(ctx) { ctx.enemy._mirrorUp = true; },
    onHeroCorrect(ctx) {
      if (ctx.enemy._mirrorUp) {
        ctx.enemy._mirrorUp = false;
        const hero = ctx.activeHero;
        if (hero) { hero.hp = Math.max(1, hero.hp - 3); }
        ctx.scene.showToast('Mirror shield reflects! -3 HP to hero!', '#e0b0ff');
      }
    },
    onHeroWrong(ctx) {
      ctx.enemy._mirrorUp = true;
      ctx.scene.showToast('Mirror shield reforms!', '#b080e0');
    },
  },
  shape_shift: {
    onBattleStart(ctx) { ctx.enemy._shiftCount = 0; ctx.enemy._baseAtk = ctx.enemy.atk; ctx.enemy._baseDef = ctx.enemy.def; },
    onHeroCorrect(ctx) {
      ctx.enemy._shiftCount++;
      if (ctx.enemy._shiftCount % 3 === 0) {
        const shift = Math.random() < 0.5;
        if (shift) {
          ctx.enemy.atk = ctx.enemy._baseAtk + Math.floor(ctx.enemy._shiftCount / 3) * 3;
          ctx.enemy.def = Math.max(0, ctx.enemy._baseDef - 2);
          ctx.scene.showToast('The Prism shifts to ATTACK form! +ATK, -DEF', '#ff80d0');
        } else {
          ctx.enemy.def = ctx.enemy._baseDef + Math.floor(ctx.enemy._shiftCount / 3) * 3;
          ctx.enemy.atk = Math.max(1, ctx.enemy._baseAtk - 2);
          ctx.scene.showToast('The Prism shifts to DEFENSE form! +DEF, -ATK', '#80d0ff');
        }
      }
    },
    onHeroWrong(ctx) {
      ctx.enemy.atk += 1;
      ctx.enemy.def += 1;
      ctx.scene.showToast('The Prism absorbs chaos! +1 ATK/DEF', '#c060f0');
    },
  },

  // ── FLOOR 7: MARKET SQUARE (Money) ──

  steal_gold: {
    onHeroWrong(ctx) {
      const hero = ctx.activeHero;
      if (hero) { hero.atk = Math.max(1, hero.atk - 1); }
      ctx.scene.showToast('Pickpocket steals your focus! -1 ATK', '#d0a040');
    },
  },
  levy: {
    onBattleStart(ctx) { ctx.enemy._levyCount = 0; },
    onHeroCorrect(ctx) {
      ctx.enemy._levyCount++;
      if (ctx.enemy._levyCount >= 3) {
        ctx.enemy._levyCount = 0;
        ctx.enemy.def += 2;
        ctx.scene.showToast('Tax Collector levies a tax! +2 DEF', '#a08040');
      }
    },
  },
  price_hike: {
    onHeroWrong(ctx) {
      ctx.enemy.atk += 2;
      ctx.scene.showToast('Rogue Merchant hikes the price! +2 ATK', '#e0c060');
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy.atk > 10) { ctx.enemy.atk -= 1; }
    },
  },
  interest: {
    onBattleStart(ctx) { ctx.enemy._interestTurns = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._interestTurns++;
      const bonus = Math.floor(ctx.enemy._interestTurns / 2);
      if (bonus > 0) {
        ctx.enemy.atk += bonus;
        ctx.scene.showToast(`Interest compounds! +${bonus} ATK`, '#c09020');
      }
    },
    onHeroCorrect(ctx) {
      ctx.enemy._interestTurns = Math.max(0, ctx.enemy._interestTurns - 1);
    },
  },
  fake_coins: {
    onBattleStart(ctx) { ctx.enemy._fakeStacks = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._fakeStacks++;
      ctx.scene._consumeNextTurn = true;
      ctx.scene.showToast(`Counterfeiter plants a fake! (${ctx.enemy._fakeStacks} fakes)`, '#806020');
    },
    onHeroCorrect(ctx) {
      if (ctx.enemy._fakeStacks > 0) {
        ctx.enemy._fakeStacks--;
      }
      if (ctx.enemy._fakeStacks >= 3) {
        ctx.enemy.atk += 3;
        ctx.enemy._fakeStacks = 0;
        ctx.scene.showToast('Too many fakes! Counterfeiter surges! +3 ATK', '#e0a010');
      }
    },
  },

  // ── FLOOR 8: INFINITY LIBRARY (Word Problems) ──

  page_turn: {
    onHeroCorrect(ctx) {
      if (Math.random() < 0.2) {
        ctx.enemy.hp = Math.min(ctx.enemy.maxHp, ctx.enemy.hp + Math.round(ctx.enemy.maxHp * 0.03));
        ctx.scene.showToast('Bookworm eats a page! Heals!', '#806040');
        ctx.scene.updateEnemyHp();
      }
    },
  },
  smudge: {
    onHeroWrong(ctx) {
      ctx.scene._consumeNextTurn = true;
      ctx.scene.showToast('Inkblot smudges an answer!', '#301828');
    },
  },
  riddle_me: {
    onBattleStart(ctx) { ctx.enemy._riddleCount = 0; },
    onHeroWrong(ctx) {
      ctx.enemy._riddleCount++;
      if (ctx.enemy._riddleCount >= 2) {
        ctx.enemy._riddleCount = 0;
        ctx.enemy.atk += 3;
        ctx.scene.showToast('Riddler stumps you! +3 ATK!', '#604030');
      } else {
        ctx.scene.showToast('Riddler chuckles... 1 more wrong and...', '#483020');
      }
    },
    onHeroCorrect(ctx) {
      ctx.enemy._riddleCount = 0;
    },
  },
  silence: {
    onHeroWrong(ctx) {
      ctx.party.filter(h => h.hp > 0).forEach(h => {
        h.atk = Math.max(1, h.atk - 1);
      });
      ctx.scene.showToast('Dark Archivist silences the party! -1 ATK each', '#402018');
    },
  },
  reversal: {
    onBattleStart(ctx) {
      ctx.enemy._reversalMode = 'normal';
      ctx.enemy._reversalTimer = 0;
    },
    onHeroCorrect(ctx) {
      ctx.enemy._reversalTimer++;
      if (ctx.enemy._reversalTimer >= 4) {
        ctx.enemy._reversalTimer = 0;
        if (ctx.enemy._reversalMode === 'normal') {
          ctx.enemy._reversalMode = 'reversed';
          const tmp = ctx.enemy.atk;
          ctx.enemy.atk = ctx.enemy.def;
          ctx.enemy.def = tmp;
          ctx.scene.showToast('The Paradox REVERSES! ATK/DEF swapped!', '#f04040');
        } else {
          ctx.enemy._reversalMode = 'normal';
          const tmp = ctx.enemy.atk;
          ctx.enemy.atk = ctx.enemy.def;
          ctx.enemy.def = tmp;
          ctx.scene.showToast('The Paradox reverts to normal form!', '#4040f0');
        }
      }
    },
    onHeroWrong(ctx) {
      ctx.enemy._reversalTimer += 2;
      ctx.enemy.atk += 1;
      ctx.scene.showToast('The Paradox feeds on confusion! +1 ATK', '#801010');
    },
  },
};

/**
 * Look up an ability by name. Always returns an object (possibly empty)
 * so callers can safely call any of the three hooks without checking.
 */
export function getAbility(name) {
  return ABILITIES[name] || NOOP;
}

/**
 * Invoke a hook by name. Safely no-ops for abilities that don't
 * implement that hook or don't exist.
 *
 * Every hook announces the moment it visibly fires with
 * ctx.scene.showToast — so this is the one choke point where the
 * ability's category VFX plays. showToast is patched for the
 * (synchronous) duration of the hook and always restored.
 */
export function invokeAbility(name, hook, ctx) {
  const ability = getAbility(name);
  const fn = ability[hook];
  if (typeof fn !== 'function') return;
  const scene = ctx?.scene;
  const origToast = scene && typeof scene.showToast === 'function' ? scene.showToast : null;
  if (origToast) {
    let fired = false;
    scene.showToast = (msg, color) => {
      if (!fired) {
        fired = true;
        try { playAbilityVfx(scene, name, ctx.enemy, ctx.activeHero); } catch { /* vfx never blocks */ }
      }
      return origToast.call(scene, msg, color);
    };
  }
  try {
    fn(ctx);
  } catch (err) {
    console.warn(`[ability] ${name}.${hook} threw:`, err);
  } finally {
    if (origToast) scene.showToast = origToast;
  }
}
