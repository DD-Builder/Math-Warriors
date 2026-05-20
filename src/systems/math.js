/**
 * Math question generator
 *
 * Produces well-formed, grade-appropriate math questions for battles.
 * Pure module with no Phaser dependencies — easy to unit test.
 *
 * Core contract:
 *   generateQuestion({ operator, grade, recent }) → Question
 *
 * Guarantees (tested in math.test.js):
 *   - `choices` is ALWAYS length 4
 *   - all four `choices` are distinct non-negative integers
 *   - `choices[correctIndex] === answer` is ALWAYS true
 *   - `answer` is ALWAYS a non-negative whole number
 *   - no undefined / NaN / Infinity values ever appear
 *   - for operator '-', answer is non-negative (a >= b)
 *   - for operator '/', a is always a clean multiple of b (no fractions)
 *
 * Distractor generation uses a tiered fallback (small offsets → wider
 * offsets → walk from zero) so it always terminates with distinct values.
 */

// ------------------------------------------------------------------
// SPACED REPETITION STATE (Phase 2.1)
// ------------------------------------------------------------------
// Module-level problem history for spaced repetition. Max 100 entries.
// Each entry: { op, a, b, answer, correct: null, timestamp }

let _problemHistory = [];
const MAX_HISTORY = 100;

// Rolling accuracy state (Phase 2.2) — tracks last 20 answers
let _rollingResults = [];       // array of booleans (true = correct)
const ROLLING_WINDOW = 20;
let _rollingAccuracy = -1;      // -1 means "not enough data yet"

// Adaptive range adjustment factor from rolling accuracy
let _adaptiveRangeFactor = 0;   // -0.2 to +0.15

/**
 * Record whether the most recent problem was answered correctly.
 * Updates both problem history and rolling accuracy.
 */
export function recordAnswer(correct) {
  const last = _problemHistory[_problemHistory.length - 1];
  if (last && last.correct === null) {
    last.correct = !!correct;
  }

  // Update rolling accuracy
  _rollingResults.push(!!correct);
  if (_rollingResults.length > ROLLING_WINDOW) {
    _rollingResults.shift();
  }
  if (_rollingResults.length >= 5) {
    const sum = _rollingResults.reduce((s, v) => s + (v ? 1 : 0), 0);
    _rollingAccuracy = sum / _rollingResults.length;

    // Adaptive difficulty (Phase 2.2)
    if (_rollingAccuracy > 0.85) {
      _adaptiveRangeFactor = 0.15;      // increase range by 15%
    } else if (_rollingAccuracy < 0.55) {
      _adaptiveRangeFactor = -0.20;     // decrease range by 20%
    } else {
      _adaptiveRangeFactor = 0;         // sweet spot — maintain
    }
  }
}

/**
 * Returns problems answered wrong in the last 30 history entries.
 * Used for spaced repetition: re-present weak problems.
 */
export function getWeakProblems() {
  const recent = _problemHistory.slice(-30);
  return recent.filter(p => p.correct === false);
}

/**
 * FOR TESTS ONLY: reset all module-level state.
 */
export function __resetState() {
  _problemHistory = [];
  _rollingResults = [];
  _rollingAccuracy = -1;
  _adaptiveRangeFactor = 0;
}

/**
 * FOR TESTS ONLY: get the current problem history.
 */
export function __getProblemHistory() {
  return _problemHistory;
}

/**
 * FOR TESTS ONLY: get the current rolling accuracy.
 */
export function __getRollingAccuracy() {
  return _rollingAccuracy;
}

// ------------------------------------------------------------------
// DIFFICULTY TABLES
// ------------------------------------------------------------------
// Each grade defines:
//   ops:        which operators are available at that grade
//   maxOperand: upper bound for the primary operand
//   minOperand: lower bound (usually 1, K allows 0)
//
// These are intentionally conservative. We can tune after playtest.

export const GRADE_TABLE = {
  // Kindergarten — counting feel, single digit, add/subtract only
  0: { ops: ['+', '-'],            minOperand: 0,  maxOperand: 5   },
  // 1st — simple facts to 10
  1: { ops: ['+', '-'],            minOperand: 1,  maxOperand: 8  },
  // 2nd — intro multiplication, numbers to 20
  2: { ops: ['+', '-', '*'],       minOperand: 1,  maxOperand: 15  },
  // 3rd — times tables to 10×10, division starts
  3: { ops: ['+', '-', '*', '/'],  minOperand: 1,  maxOperand: 40  },
  // 4th — multi-digit
  4: { ops: ['+', '-', '*', '/'],  minOperand: 2,  maxOperand: 80 },
  // 5th — full times tables, long division
  5: { ops: ['+', '-', '*', '/'],  minOperand: 2,  maxOperand: 120 },
};

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

/** Inclusive integer in [min, max]. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Fisher-Yates shuffle in place. Returns the same array. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Picks an operator for this question.
 *   - If `operator` is a specific op, returns it.
 *   - If `operator` is 'mixed' or omitted, picks randomly from the
 *     grade's available ops.
 *   - If the requested operator isn't available at this grade, falls
 *     back to the grade's available ops rather than producing garbage.
 */
function resolveOperator(operator, gradeTable) {
  const available = gradeTable.ops;
  if (operator && operator !== 'mixed' && available.includes(operator)) {
    return operator;
  }
  return available[randInt(0, available.length - 1)];
}

// ------------------------------------------------------------------
// OPERAND GENERATION PER OPERATOR
// ------------------------------------------------------------------
// Each of these returns { a, b, answer } where answer === a OP b and
// the constraints for that op are satisfied.

function genAdd(table) {
  const a = randInt(table.minOperand, table.maxOperand);
  const b = randInt(table.minOperand, table.maxOperand);
  return { a, b, answer: a + b };
}

function genSub(table) {
  // Ensure a >= b so answer is non-negative, and answer >= 3 so
  // subtraction problems always produce meaningful damage values.
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = randInt(table.minOperand, table.maxOperand);
    const b = randInt(table.minOperand, a);
    const answer = a - b;
    if (answer >= 3) return { a, b, answer };
  }
  // Fallback: force a valid answer >= 3
  const extra = randInt(0, 5);
  const b = randInt(table.minOperand, table.maxOperand);
  const a = b + 3 + extra;
  return { a, b, answer: a - b };
}

function genMul(table) {
  // For multiplication, cap operand to 12 for grades 2-3 to keep things
  // fair; grade 4+ can go higher. We use the smaller of the grade's
  // maxOperand and a scaling cap.
  const cap = Math.min(table.maxOperand, 12);
  const a = randInt(Math.max(2, table.minOperand), cap);
  const b = randInt(Math.max(2, table.minOperand), cap);
  return { a, b, answer: a * b };
}

function genDiv(table) {
  // Build division by starting from a clean quotient and a divisor,
  // then computing the dividend. Guarantees answer is a whole number.
  const cap = Math.min(table.maxOperand, 12);
  const answer  = randInt(Math.max(1, table.minOperand), cap);
  const divisor = randInt(2, cap);
  const a = answer * divisor;
  return { a, b: divisor, answer };
}

const OPERATOR_GENERATORS = {
  '+': genAdd,
  '-': genSub,
  '*': genMul,
  '/': genDiv,
};

// ------------------------------------------------------------------
// DISTRACTOR GENERATION
// ------------------------------------------------------------------
// We need exactly 3 wrong answers that are:
//   - positive integers (>= 0)
//   - distinct from each other AND from the correct answer
//   - close to the correct answer (so they're believable distractors)
//
// Strategy: tiered fallback.
//   Tier 1: offsets of ±1..±5 from the answer
//   Tier 2: offsets of ±6..±15
//   Tier 3: any positive integer not yet used
//
// We walk the tiers until we have 3 distinct distractors. Tier 3
// always terminates because there are infinite positive integers.

function generateDistractors(answer) {
  const used = new Set([answer]);
  const distractors = [];

  // Tier 1: small offsets
  const tier1 = [];
  for (let delta = 1; delta <= 5; delta++) {
    tier1.push(answer + delta);
    if (answer - delta >= 0) tier1.push(answer - delta);
  }
  shuffle(tier1);
  for (const n of tier1) {
    if (distractors.length >= 3) break;
    if (n >= 0 && !used.has(n)) {
      distractors.push(n);
      used.add(n);
    }
  }

  // Tier 2: wider offsets
  if (distractors.length < 3) {
    const tier2 = [];
    for (let delta = 6; delta <= 15; delta++) {
      tier2.push(answer + delta);
      if (answer - delta >= 0) tier2.push(answer - delta);
    }
    shuffle(tier2);
    for (const n of tier2) {
      if (distractors.length >= 3) break;
      if (n >= 0 && !used.has(n)) {
        distractors.push(n);
        used.add(n);
      }
    }
  }

  // Tier 3: walk upward from zero until we fill the remaining slots.
  // This branch is a safety net and should be extremely rare.
  let probe = 0;
  while (distractors.length < 3) {
    if (!used.has(probe)) {
      distractors.push(probe);
      used.add(probe);
    }
    probe++;
  }

  return distractors;
}

// ------------------------------------------------------------------
// PUBLIC API
// ------------------------------------------------------------------

/**
 * Generate a math question.
 *
 * @param {object} opts
 * @param {string} [opts.operator]  One of '+', '-', '*', '/', 'mixed'.
 *                                  If 'mixed' or omitted, random from grade.
 * @param {number} [opts.grade]     0-5, defaults to 3.
 * @param {number} [opts.streak]    Correct-answer streak. Positive values
 *                                  nudge difficulty up (toward the ceiling
 *                                  of the grade); negative/zero pull it
 *                                  back toward easier questions after a
 *                                  losing streak.
 * @returns {Question}
 *
 * @typedef {object} Question
 * @property {number} a
 * @property {number} b
 * @property {'+' | '-' | '*' | '/'} op
 * @property {number} answer
 * @property {number[]} choices       Length 4, all distinct.
 * @property {number} correctIndex    Index in `choices` of the correct answer.
 */
export function generateQuestion(opts = {}) {
  const grade = clampGrade(opts.grade ?? 3);
  const baseTable = GRADE_TABLE[grade];
  const streak = opts.streak ?? 0;
  const floor = opts.floor ?? 0;

  // --- Phase 2.1: Spaced Repetition ---
  // 20% of the time, re-present a weak problem instead of generating fresh
  const weakProblems = getWeakProblems();
  if (weakProblems.length > 0 && Math.random() < 0.2) {
    const weak = weakProblems[Math.floor(Math.random() * weakProblems.length)];
    const answer = weak.answer;
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    const q = { a: weak.a, b: weak.b, op: weak.op, answer, choices, correctIndex };

    // Record in history
    _problemHistory.push({ op: q.op, a: q.a, b: q.b, answer: q.answer, correct: null, timestamp: Date.now() });
    if (_problemHistory.length > MAX_HISTORY) _problemHistory.shift();

    return q;
  }

  // --- Phase 2.2: Adaptive Difficulty via rolling accuracy ---
  // Combine streak-based and accuracy-based adjustments
  const adjFactor = Math.max(-0.5, Math.min(0.5, streak * 0.08));
  const range = baseTable.maxOperand - baseTable.minOperand;

  // Apply rolling accuracy adjustment on top of streak adjustment
  const accuracyShift = _adaptiveRangeFactor * range;

  const adjMax = Math.max(baseTable.minOperand + 1, Math.round(
    baseTable.maxOperand - range * Math.max(0, -adjFactor) + accuracyShift
  ));
  const adjMin = Math.min(adjMax - 1, Math.round(baseTable.minOperand + range * Math.max(0, adjFactor) * 0.5));
  const table = {
    ops: baseTable.ops,
    minOperand: Math.max(baseTable.minOperand, adjMin),
    maxOperand: Math.min(baseTable.maxOperand, Math.max(baseTable.minOperand + 1, adjMax)),
  };

  const op = resolveOperator(opts.operator, table);
  const gen = OPERATOR_GENERATORS[op];
  if (!gen) {
    throw new Error(`math.generateQuestion: no generator for operator "${op}"`);
  }

  const { a, b, answer } = gen(table);

  if (!Number.isFinite(answer) || answer < 0 || !Number.isInteger(answer)) {
    throw new Error(`math.generateQuestion: invalid answer ${answer} from ${a} ${op} ${b}`);
  }

  // --- Phase 2.3: Missing operand format for Floor 5+ ---
  let format = 'standard';
  let displayAnswer = answer; // The value the student must provide
  if (floor >= 5 && Math.random() < 0.3) {
    // "? [op] b = answer" — student solves for a (the missing operand)
    format = 'missing';
    displayAnswer = a; // the correct answer is 'a', the missing operand
  }

  const finalAnswer = format === 'missing' ? displayAnswer : answer;
  const distractors = generateDistractors(finalAnswer);
  const choices = shuffle([finalAnswer, ...distractors]);
  const correctIndex = choices.indexOf(finalAnswer);

  const q = { a, b, op, answer: finalAnswer, choices, correctIndex, format };
  // Store original answer for reference (the full computation result)
  if (format === 'missing') {
    q.fullAnswer = answer;
  }

  // Record in history
  _problemHistory.push({ op: q.op, a, b, answer: q.answer, correct: null, timestamp: Date.now() });
  if (_problemHistory.length > MAX_HISTORY) _problemHistory.shift();

  return q;
}

/** Clamp any input to a known grade level. */
function clampGrade(g) {
  const n = Math.round(Number(g));
  if (Number.isNaN(n)) return 3;
  return Math.max(0, Math.min(5, n));
}

/**
 * Convenience: convert an operator character to its display symbol.
 * Multiplication → × , division → ÷ , others passthrough.
 */
export function opSymbol(op) {
  if (op === '*') return '\u00d7'; // ×
  if (op === '/') return '\u00f7'; // ÷
  return op;
}

/**
 * Convenience: format a question as a display string like "3 + 4 = ?"
 */
export function formatQuestion(q) {
  return `${q.a} ${opSymbol(q.op)} ${q.b} = ?`;
}

/**
 * Estimate the mean answer value for questions generated with a given
 * operator + grade. Used to size enemy HP so a mob takes ~3-5 problems
 * to defeat and a boss takes ~10-12.
 *
 * Returns a number >= 1.
 */
export function expectedAnswer(operator, grade) {
  const g = clampGrade(grade);
  const table = GRADE_TABLE[g];
  const midLo = Math.max(0, table.minOperand);
  const midHi = table.maxOperand;
  const midA = (midLo + midHi) / 2;

  switch (operator) {
    case '+': {
      // (a + b) where both in [min, max]  →  mean ≈ 2 * midA
      return Math.max(1, Math.round(2 * midA));
    }
    case '-': {
      // With a >= b and both uniformly distributed in [min, max],
      // mean(a - b) ≈ (max - min) / 3 ~ half the operand range.
      return Math.max(1, Math.round((midHi - midLo) / 2));
    }
    case '*': {
      // capped at 12 to match genMul
      const cap = Math.min(midHi, 12);
      const lo = Math.max(2, midLo);
      const mid = (lo + cap) / 2;
      return Math.max(1, Math.round(mid * mid));
    }
    case '/': {
      // answer is the quotient, cap 12
      const cap = Math.min(midHi, 12);
      const lo = Math.max(1, midLo);
      return Math.max(1, Math.round((lo + cap) / 2));
    }
    case 'mixed':
    default: {
      // average of the ops available in this grade
      const ops = table.ops;
      const total = ops.reduce((s, o) => s + expectedAnswer(o, g), 0);
      return Math.max(1, Math.round(total / ops.length));
    }
  }
}
