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
 */
export function invokeAbility(name, hook, ctx) {
  const ability = getAbility(name);
  const fn = ability[hook];
  if (typeof fn === 'function') {
    try {
      fn(ctx);
    } catch (err) {
      console.warn(`[ability] ${name}.${hook} threw:`, err);
    }
  }
}
