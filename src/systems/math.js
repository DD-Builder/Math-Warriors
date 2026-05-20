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
// NEW PROBLEM TYPE GENERATORS (Fractions, Geometry, Money, Word)
// ------------------------------------------------------------------
// These return a full question object (not just { a, b, answer })
// because they need custom formats, text, and string-based choices.

const FRAC_DENOMS = [2, 3, 4, 6, 8];

/** Greatest common divisor (Euclidean). */
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/** Simplify a fraction and return "num/den" or a whole number string. */
function simplifyFrac(num, den) {
  if (num === 0) return '0';
  const g = gcd(Math.abs(num), Math.abs(den));
  const sn = num / g;
  const sd = den / g;
  if (sd === 1) return String(sn);
  return `${sn}/${sd}`;
}

/** Generate fraction distractor strings distinct from the answer. */
function fractionDistractors(ansStr) {
  const pool = [];
  for (const d of FRAC_DENOMS) {
    for (let n = 1; n < d; n++) {
      const s = simplifyFrac(n, d);
      if (s !== ansStr && !pool.includes(s)) pool.push(s);
    }
  }
  // Also add some whole numbers
  for (let w = 1; w <= 3; w++) {
    const s = String(w);
    if (s !== ansStr && !pool.includes(s)) pool.push(s);
  }
  shuffle(pool);
  return pool.slice(0, 3);
}

/**
 * Generate a fraction problem. Returns a full question object.
 * answer is a numeric value; choices are fraction strings.
 */
function genFraction(grade) {
  const g = clampGrade(grade);

  if (g <= 1) {
    // Compare fractions: "Which is bigger: 1/2 or 1/4?"
    const pairs = [
      { a: '1/2', b: '1/4', ans: '1/2' },
      { a: '1/3', b: '1/6', ans: '1/3' },
      { a: '1/2', b: '1/3', ans: '1/2' },
      { a: '1/4', b: '1/8', ans: '1/4' },
      { a: '3/4', b: '1/2', ans: '3/4' },
      { a: '2/3', b: '1/3', ans: '2/3' },
    ];
    const pick = pairs[randInt(0, pairs.length - 1)];
    const ansStr = pick.ans;
    const distractors = fractionDistractors(ansStr);
    // Ensure pick.a and pick.b that aren't the answer appear as distractors
    const other = pick.a === ansStr ? pick.b : pick.a;
    if (!distractors.includes(other)) {
      distractors[0] = other;
    }
    const choices = shuffle([ansStr, ...distractors.slice(0, 3)]);
    const correctIndex = choices.indexOf(ansStr);
    return {
      a: 0, b: 0, op: 'frac', answer: ansStr,
      choices, correctIndex,
      format: 'fraction',
      text: `Which is bigger: ${pick.a} or ${pick.b}?`,
    };
  }

  if (g <= 3) {
    // Add fractions with same denominator
    const den = FRAC_DENOMS[randInt(0, FRAC_DENOMS.length - 1)];
    const maxNum = den - 1;
    const n1 = randInt(1, Math.max(1, maxNum - 1));
    const n2 = randInt(1, Math.max(1, den - n1 - 1) || 1);
    // Ensure sum is a proper fraction or whole number
    const sumNum = n1 + n2;
    const ansStr = simplifyFrac(sumNum, den);
    const distractors = fractionDistractors(ansStr);
    const choices = shuffle([ansStr, ...distractors.slice(0, 3)]);
    const correctIndex = choices.indexOf(ansStr);
    return {
      a: 0, b: 0, op: 'frac', answer: ansStr,
      choices, correctIndex,
      format: 'fraction',
      text: `${simplifyFrac(n1, den)} + ${simplifyFrac(n2, den)} = ?`,
    };
  }

  // Grade 4-5: Add fractions with different denominators
  const d1 = FRAC_DENOMS[randInt(0, FRAC_DENOMS.length - 1)];
  let d2;
  do { d2 = FRAC_DENOMS[randInt(0, FRAC_DENOMS.length - 1)]; } while (d2 === d1);
  const n1 = randInt(1, d1 - 1);
  const n2 = randInt(1, d2 - 1);
  // Common denominator
  const lcd = (d1 * d2) / gcd(d1, d2);
  const sumNum = n1 * (lcd / d1) + n2 * (lcd / d2);
  const ansStr = simplifyFrac(sumNum, lcd);
  const distractors = fractionDistractors(ansStr);
  const choices = shuffle([ansStr, ...distractors.slice(0, 3)]);
  const correctIndex = choices.indexOf(ansStr);
  return {
    a: 0, b: 0, op: 'frac', answer: ansStr,
    choices, correctIndex,
    format: 'fraction',
    text: `${simplifyFrac(n1, d1)} + ${simplifyFrac(n2, d2)} = ?`,
  };
}

/**
 * Generate a geometry problem. Returns a full question object.
 */
function genGeometry(grade) {
  const g = clampGrade(grade);

  const shapeQuestions = [
    { text: 'How many sides does a triangle have?', answer: 3 },
    { text: 'How many sides does a square have?', answer: 4 },
    { text: 'How many sides does a pentagon have?', answer: 5 },
    { text: 'How many sides does a hexagon have?', answer: 6 },
    { text: 'How many sides does an octagon have?', answer: 8 },
  ];

  if (g <= 2) {
    // Shape identification only
    const pick = shapeQuestions[randInt(0, shapeQuestions.length - 1)];
    const distractors = generateDistractors(pick.answer);
    const choices = shuffle([pick.answer, ...distractors]);
    const correctIndex = choices.indexOf(pick.answer);
    return {
      a: pick.answer, b: 0, op: 'geo', answer: pick.answer,
      choices, correctIndex,
      format: 'geometry',
      text: pick.text,
    };
  }

  // Grade 3-5: area and perimeter calculations
  const problemType = randInt(0, 2);
  if (problemType === 0) {
    // Area of rectangle
    const w = randInt(2, 10);
    const h = randInt(2, 10);
    const answer = w * h;
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    return {
      a: answer, b: 0, op: 'geo', answer,
      choices, correctIndex,
      format: 'geometry',
      text: `Area of rectangle: ${w} × ${h} = ?`,
    };
  } else if (problemType === 1) {
    // Perimeter of square
    const side = randInt(2, 12);
    const answer = side * 4;
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    return {
      a: answer, b: 0, op: 'geo', answer,
      choices, correctIndex,
      format: 'geometry',
      text: `Perimeter of square with side ${side} = ?`,
    };
  } else {
    // Perimeter of rectangle
    const w = randInt(2, 10);
    const h = randInt(2, 10);
    const answer = 2 * (w + h);
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    return {
      a: answer, b: 0, op: 'geo', answer,
      choices, correctIndex,
      format: 'geometry',
      text: `Perimeter of rectangle: ${w} and ${h} = ?`,
    };
  }
}

/**
 * Generate a money math problem. Returns a full question object.
 * All answers are in whole cents.
 */
function genMoney(grade) {
  const g = clampGrade(grade);

  if (g <= 1) {
    // Count coins
    const cents = randInt(2, 10);
    const coinTypes = [
      { name: 'pennies', value: 1 },
      { name: 'nickels', value: 5 },
    ];
    const coin = coinTypes[randInt(0, coinTypes.length - 1)];
    const totalCents = cents * coin.value;
    const answer = cents;
    const text = `How many ${coin.name} in ${totalCents} cents?`;
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    return {
      a: answer, b: 0, op: 'money', answer,
      choices, correctIndex,
      format: 'money',
      text,
    };
  }

  if (g <= 3) {
    // Make change
    const prices = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
    const price = prices[randInt(0, prices.length - 1)];
    const paid = 100;
    const answer = paid - price;
    const text = `You pay $1.00 for a $0.${String(price).padStart(2, '0')} item. Change = ? cents`;
    const distractors = generateDistractors(answer);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    return {
      a: answer, b: 0, op: 'money', answer,
      choices, correctIndex,
      format: 'money',
      text,
    };
  }

  // Grade 4-5: Multi-item purchase
  const count = randInt(2, 5);
  const itemPrices = [10, 15, 20, 25, 30, 35, 40, 50];
  const unitPrice = itemPrices[randInt(0, itemPrices.length - 1)];
  const answer = count * unitPrice;
  const text = `${count} items at $0.${String(unitPrice).padStart(2, '0')} each = ? cents`;
  const distractors = generateDistractors(answer);
  const choices = shuffle([answer, ...distractors]);
  const correctIndex = choices.indexOf(answer);
  return {
    a: answer, b: 0, op: 'money', answer,
    choices, correctIndex,
    format: 'money',
    text,
  };
}

/**
 * Generate a word problem using basic operations. Returns a full question object.
 */
function genWord(grade) {
  const g = clampGrade(grade);
  const table = GRADE_TABLE[g];

  const templates = [
    {
      // Addition
      make: () => {
        const a = randInt(table.minOperand, table.maxOperand);
        const b = randInt(table.minOperand, table.maxOperand);
        return { a, b, answer: a + b, op: '+',
          text: `Found ${a} coins, then ${b} more. Total?` };
      },
    },
    {
      // Subtraction
      make: () => {
        const a = randInt(Math.max(5, table.minOperand), table.maxOperand);
        const b = randInt(table.minOperand, Math.max(1, a - 3));
        return { a, b, answer: a - b, op: '-',
          text: `A hero has ${a} potions. Uses ${b}. How many left?` };
      },
    },
    {
      // Multiplication (only if grade supports it)
      make: () => {
        const cap = Math.min(table.maxOperand, 12);
        const a = randInt(Math.max(2, table.minOperand), cap);
        const b = randInt(Math.max(2, table.minOperand), cap);
        return { a, b, answer: a * b, op: '*',
          text: `${a} chests with ${b} gold each. Total gold?` };
      },
      minGrade: 2,
    },
    {
      // Division (only if grade supports it)
      make: () => {
        const cap = Math.min(table.maxOperand, 12);
        const quotient = randInt(Math.max(1, table.minOperand), cap);
        const divisor = randInt(2, cap);
        const total = quotient * divisor;
        return { a: divisor, b: quotient, answer: quotient, op: '/',
          text: `${divisor} heroes share ${total} gold equally. Each gets?` };
      },
      minGrade: 3,
    },
  ];

  // Filter to templates available at this grade
  const available = templates.filter(t => !t.minGrade || g >= t.minGrade);
  const pick = available[randInt(0, available.length - 1)];
  const prob = pick.make();

  const answer = prob.answer;
  const distractors = generateDistractors(answer);
  const choices = shuffle([answer, ...distractors]);
  const correctIndex = choices.indexOf(answer);
  return {
    a: prob.a, b: prob.b, op: prob.op, answer,
    choices, correctIndex,
    format: 'word',
    text: prob.text,
  };
}

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
  const requestedOp = opts.operator;

  // --- Dispatch to special problem type generators ---
  // These operators produce complete question objects with custom formats.
  const SPECIAL_GENERATORS = { frac: genFraction, geo: genGeometry, money: genMoney, word: genWord };

  if (requestedOp && SPECIAL_GENERATORS[requestedOp]) {
    const q = SPECIAL_GENERATORS[requestedOp](grade);
    // Record in history (use numeric answer for history, or 0 for string answers)
    const histAnswer = typeof q.answer === 'number' ? q.answer : 0;
    _problemHistory.push({ op: q.op, a: q.a, b: q.b, answer: histAnswer, correct: null, timestamp: Date.now() });
    if (_problemHistory.length > MAX_HISTORY) _problemHistory.shift();
    return q;
  }

  // For 'mixed' on floor 9+, randomly pick from ALL operators including specials
  if (requestedOp === 'mixed' && floor >= 9) {
    const allOps = [...baseTable.ops, 'frac', 'money', 'word'];
    const pick = allOps[randInt(0, allOps.length - 1)];
    if (SPECIAL_GENERATORS[pick]) {
      const q = SPECIAL_GENERATORS[pick](grade);
      const histAnswer = typeof q.answer === 'number' ? q.answer : 0;
      _problemHistory.push({ op: q.op, a: q.a, b: q.b, answer: histAnswer, correct: null, timestamp: Date.now() });
      if (_problemHistory.length > MAX_HISTORY) _problemHistory.shift();
      return q;
    }
    // Fall through to standard generation with the picked arithmetic op
    opts = { ...opts, operator: pick };
  }

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
 * For special formats (fraction, geometry, money, word), use the text field.
 */
export function formatQuestion(q) {
  if (q.text) return q.text;
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
    case 'frac':
      return 3;    // small fraction answers
    case 'geo':
      return 10;   // sides/area/perimeter
    case 'money':
      return 25;   // cents
    case 'word': {
      // same as the underlying operation — average of basic ops
      const wOps = table.ops;
      const wTotal = wOps.reduce((s, o) => s + expectedAnswer(o, g), 0);
      return Math.max(1, Math.round(wTotal / wOps.length));
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
