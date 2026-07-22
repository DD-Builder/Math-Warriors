/**
 * Question-timer rules for battles.
 *
 * Design for kids:
 *  - The clock ALWAYS starts when the player commits to FIGHT/MAGIC,
 *    never while they're still reading the menu (the scene enforces
 *    this; the module only decides durations).
 *  - Duration comes from grade AND question format — word problems
 *    and fractions take longer to read than 3+4. Star ratings never
 *    touch the clock.
 *  - Boss battles: a hard timer (timeout = wrong answer), generous.
 *  - Normal battles: NO timer at all, any grade. Regular monster fights
 *    are for practice without clock pressure; only bosses are timed.
 */

// Base milliseconds by grade index (K, 1, 2, 3, 4, 5) for BOSS fights.
export const BOSS_BASE_MS = [20000, 18000, 15000, 13000, 12000, 12000];

// Reading-load multipliers by question format/operator.
export const FORMAT_MULT = {
  '+': 1.0,
  '-': 1.0,
  '*': 1.15,
  '/': 1.3,
  frac: 1.75,
  word: 1.75,
  geo: 1.5,
  money: 1.5,
  mixed: 1.15,
};

/**
 * @returns {{ms: number, hard: boolean} | null}
 *   null   → no timer at all (every non-boss battle)
 *   hard   → timeout auto-answers wrong (boss fights only)
 */
export function getQuestionTimer({ grade = 0, format = '+', isBoss = false }) {
  // Only bosses are timed now. Regular monster battles have no clock so kids
  // can work at their own pace; the pressure is reserved for the boss.
  if (!isBoss) return null;
  const g = Math.max(0, Math.min(BOSS_BASE_MS.length - 1, grade | 0));
  const mult = FORMAT_MULT[format] ?? 1.2;
  return { ms: Math.round(BOSS_BASE_MS[g] * mult), hard: true };
}

/** Momentum granted for beating a soft timer. */
export const SOFT_TIMER_BONUS = 0.02;

/** Bar color by fraction remaining: green → amber → red. */
export function timerColor(fracLeft) {
  if (fracLeft > 0.5) return 0x4aa848;
  if (fracLeft > 0.25) return 0xe8a030;
  return 0xd84030;
}
