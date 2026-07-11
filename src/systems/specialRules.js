/**
 * Rules for the momentum-charged FILL-IN SPECIAL.
 *
 * When the momentum bar fills, grades 2+ can spend it on a special
 * attack — but they must TYPE the answer on the numpad instead of
 * picking from four choices. Forgiving by design: a wrong answer
 * still converts into a normal-strength strike (never a wasted turn,
 * no HP penalty), shows the correct answer, and re-seats momentum at
 * the neutral 0.5 rather than zero. K-1 players keep the tap-to-fire
 * team attack — they shouldn't need multi-digit typing to feel cool.
 */

export function canTriggerSpecial({ momentum, grade }) {
  return momentum >= 1.0 && grade >= 2;
}

/**
 * The special's question must have a plain integer answer a child can
 * type. Arithmetic floors keep their operator; special-format floors
 * (fractions/geometry/money/word/mixed) fall back to times tables for
 * grades 3+ or addition below that.
 */
export function specialOperator({ floorOperator, grade }) {
  if (floorOperator === '+' || floorOperator === '-' || floorOperator === '*' || floorOperator === '/') {
    return floorOperator;
  }
  return grade >= 3 ? '*' : '+';
}

export function resolveSpecial({ correct }) {
  return correct
    ? { momentumAfter: 0.5, damageMult: 3.0, splashMult: 0.5 }
    : { momentumAfter: 0.5, damageMult: 1.0, splashMult: 0 };
}

/** Special answer window: more generous than the boss clock. */
export function specialTimerMs(bossMs) {
  return Math.round(bossMs * 1.5);
}
