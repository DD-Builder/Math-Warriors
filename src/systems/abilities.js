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

  // Not yet implemented — declared as no-ops so lookups never crash
  sweet_add:      NOOP,
  pressure:       NOOP,
  sting_drain:    NOOP,
  ink_cloud:      NOOP,
  drain_current:  NOOP,
  abs_reduction:  NOOP,
  thunder_mul:    NOOP,
  volley:         NOOP,
  spin_up:        NOOP,
  clap_charge:    NOOP,
  mass_matters:   NOOP,
  ash_divide:     NOOP,
  split_tongue:   NOOP,
  shard_volley:   NOOP,
  core_divide:    NOOP,
  op_shift:       NOOP,
  geo_lock:       NOOP,
  flip_page:      NOOP,
  phase_lock:     NOOP,
  the_unknown:    NOOP,
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
