/**
 * Unit tests for src/systems/math.js
 *
 * Uses Node's built-in test runner (node:test) so there's no extra
 * dependency. Run with:
 *
 *   npm test
 *
 * We run the generator many times with many seeds to probabilistically
 * verify the contract — because the generator uses Math.random, a single
 * call can't prove correctness, but 10,000 calls can.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQuestion,
  formatQuestion,
  opSymbol,
  GRADE_TABLE,
  expectedAnswer,
  recordAnswer,
  getWeakProblems,
  __resetState,
  __getProblemHistory,
  __getRollingAccuracy,
} from './math.js';

const ITERATIONS = 10_000;

// ------------------------------------------------------------------
// CONTRACT INVARIANTS
// ------------------------------------------------------------------
// Every question returned must satisfy these properties, regardless of
// grade or operator. Run them 10k times to catch rare edge cases.

function assertValidQuestion(q, context = '') {
  // Basic shape
  assert.ok(q, `${context}: result is falsy`);
  assert.equal(typeof q.a, 'number', `${context}: a is not a number`);
  assert.equal(typeof q.b, 'number', `${context}: b is not a number`);
  assert.equal(typeof q.op, 'string', `${context}: op is not a string`);
  assert.equal(typeof q.answer, 'number', `${context}: answer is not a number`);
  assert.ok(Array.isArray(q.choices), `${context}: choices is not an array`);

  // Operand integrity
  assert.ok(Number.isFinite(q.a), `${context}: a is not finite`);
  assert.ok(Number.isFinite(q.b), `${context}: b is not finite`);
  assert.ok(Number.isFinite(q.answer), `${context}: answer is not finite`);
  assert.ok(Number.isInteger(q.a), `${context}: a is not integer`);
  assert.ok(Number.isInteger(q.b), `${context}: b is not integer`);
  assert.ok(Number.isInteger(q.answer), `${context}: answer is not integer`);
  assert.ok(q.answer >= 0, `${context}: answer is negative: ${q.answer}`);

  // Operator sanity
  assert.ok(['+', '-', '*', '/'].includes(q.op), `${context}: invalid op "${q.op}"`);

  // Choices array is length 4, all distinct positive integers
  assert.equal(q.choices.length, 4, `${context}: choices length is not 4`);
  const uniqueChoices = new Set(q.choices);
  assert.equal(uniqueChoices.size, 4, `${context}: choices not unique: ${q.choices.join(',')}`);
  for (const c of q.choices) {
    assert.ok(Number.isFinite(c), `${context}: choice ${c} is not finite`);
    assert.ok(Number.isInteger(c), `${context}: choice ${c} is not integer`);
    assert.ok(c >= 0, `${context}: choice ${c} is negative`);
  }

  // correctIndex points to the answer
  assert.equal(typeof q.correctIndex, 'number', `${context}: correctIndex is not a number`);
  assert.ok(q.correctIndex >= 0 && q.correctIndex < 4, `${context}: correctIndex out of range`);
  assert.equal(q.choices[q.correctIndex], q.answer, `${context}: choices[correctIndex] !== answer`);

  // Math actually checks out
  let expected;
  if (q.op === '+') expected = q.a + q.b;
  else if (q.op === '-') expected = q.a - q.b;
  else if (q.op === '*') expected = q.a * q.b;
  else if (q.op === '/') expected = q.a / q.b;

  if (q.format === 'missing') {
    // For missing operand format, answer is 'a' (the missing operand),
    // and fullAnswer holds the actual computation result (a OP b)
    assert.equal(q.answer, q.a, `${context}: missing format answer should be a=${q.a}, got ${q.answer}`);
    assert.equal(q.fullAnswer, expected, `${context}: missing format fullAnswer should be ${expected}, got ${q.fullAnswer}`);
  } else {
    assert.equal(q.answer, expected, `${context}: ${q.a} ${q.op} ${q.b} = ${expected}, got answer=${q.answer}`);
  }

  // Division must be clean (no fractions)
  if (q.op === '/') {
    assert.equal(q.a % q.b, 0, `${context}: division ${q.a} / ${q.b} is not clean`);
  }

  // Subtraction must not go negative and must produce answer >= 3
  if (q.op === '-') {
    assert.ok(q.a >= q.b, `${context}: subtraction ${q.a} - ${q.b} would be negative`);
    // For missing format, the computation answer is fullAnswer, not answer
    const subAnswer = q.format === 'missing' ? q.fullAnswer : q.answer;
    assert.ok(subAnswer >= 3, `${context}: subtraction answer ${subAnswer} is less than 3 (${q.a} - ${q.b})`);
  }
}

// ------------------------------------------------------------------
// TESTS
// ------------------------------------------------------------------

describe('generateQuestion — contract invariants', () => {
  test('produces valid questions for every grade (smoke)', () => {
    for (let grade = 0; grade <= 5; grade++) {
      const q = generateQuestion({ grade });
      assertValidQuestion(q, `grade ${grade}`);
    }
  });

  test('produces valid questions across 10k random runs, mixed grades', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade });
      assertValidQuestion(q, `iter ${i}, grade ${grade}`);
    }
  });

  test('produces valid questions for every operator explicitly', () => {
    const ops = ['+', '-', '*', '/'];
    for (const op of ops) {
      // Use grade 5 so every op is available
      for (let i = 0; i < 1000; i++) {
        const q = generateQuestion({ grade: 5, operator: op });
        assertValidQuestion(q, `op ${op}, iter ${i}`);
        assert.equal(q.op, op, `requested ${op}, got ${q.op}`);
      }
    }
  });

  test('respects grade operator availability (K never gets * or /)', () => {
    for (let i = 0; i < 1000; i++) {
      const q = generateQuestion({ grade: 0 });
      assertValidQuestion(q, `K iter ${i}`);
      assert.ok(['+', '-'].includes(q.op), `K got invalid op ${q.op}`);
    }
  });

  test('respects grade 1 operator availability', () => {
    for (let i = 0; i < 1000; i++) {
      const q = generateQuestion({ grade: 1 });
      assert.ok(['+', '-'].includes(q.op), `grade 1 got invalid op ${q.op}`);
    }
  });

  test('grade 2 allows multiplication but never division', () => {
    let sawMul = false;
    for (let i = 0; i < 2000; i++) {
      const q = generateQuestion({ grade: 2 });
      assertValidQuestion(q, `grade 2 iter ${i}`);
      assert.notEqual(q.op, '/', `grade 2 produced division`);
      if (q.op === '*') sawMul = true;
    }
    assert.ok(sawMul, 'grade 2 never produced multiplication in 2000 runs');
  });

  test('falling back: requesting an unavailable op uses grade fallback', () => {
    // Requesting division at grade 0 should fall back silently, not crash
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 0, operator: '/' });
      assertValidQuestion(q, `fallback iter ${i}`);
      assert.ok(['+', '-'].includes(q.op), `fallback produced invalid op ${q.op}`);
    }
  });

  test('clamps out-of-range grades', () => {
    const low  = generateQuestion({ grade: -3 });
    const high = generateQuestion({ grade: 99 });
    assertValidQuestion(low, 'grade -3');
    assertValidQuestion(high, 'grade 99');
  });

  test('handles missing opts', () => {
    const q = generateQuestion();
    assertValidQuestion(q, 'no opts');
  });

  test('never produces undefined, NaN, or Infinity anywhere', () => {
    for (let i = 0; i < 5000; i++) {
      const q = generateQuestion({ grade: Math.floor(Math.random() * 6) });
      const all = [q.a, q.b, q.answer, q.correctIndex, ...q.choices];
      for (const v of all) {
        assert.notEqual(v, undefined, `undefined in question ${JSON.stringify(q)}`);
        assert.ok(!Number.isNaN(v), `NaN in question ${JSON.stringify(q)}`);
        assert.ok(Number.isFinite(v), `Infinity in question ${JSON.stringify(q)}`);
      }
    }
  });
});

describe('subtraction answer floor', () => {
  test('subtraction answers are always >= 3 across 5k runs', () => {
    for (let i = 0; i < 5000; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade, operator: '-' });
      assertValidQuestion(q, `sub floor iter ${i}`);
      assert.ok(q.answer >= 3, `subtraction answer ${q.answer} < 3 at grade ${grade}: ${q.a} - ${q.b}`);
    }
  });
});

describe('adaptive difficulty via streak', () => {
  test('positive streak does not break generation', () => {
    for (const streak of [1, 3, 5, 10, 25, 100]) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade: 3, streak });
        assertValidQuestion(q, `streak ${streak} iter ${i}`);
      }
    }
  });

  test('negative streak does not break generation', () => {
    for (const streak of [-1, -3, -10]) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade: 3, streak });
        assertValidQuestion(q, `neg streak ${streak} iter ${i}`);
      }
    }
  });

  test('streak 0 behaves like no streak', () => {
    // Can't assert exact output because of random, just assert no throw
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 3, streak: 0 });
      assertValidQuestion(q);
    }
  });

  test('high streak in K still only uses K operators', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 0, streak: 50 });
      assertValidQuestion(q);
      assert.ok(['+', '-'].includes(q.op), `K with streak produced op ${q.op}`);
    }
  });
});

describe('GRADE_TABLE', () => {
  test('every grade 0-5 is defined', () => {
    for (let g = 0; g <= 5; g++) {
      assert.ok(GRADE_TABLE[g], `grade ${g} missing`);
      assert.ok(Array.isArray(GRADE_TABLE[g].ops), `grade ${g} ops not an array`);
      assert.ok(GRADE_TABLE[g].ops.length > 0, `grade ${g} has no ops`);
    }
  });

  test('grades have monotonically non-decreasing operand ranges', () => {
    for (let g = 1; g <= 5; g++) {
      assert.ok(
        GRADE_TABLE[g].maxOperand >= GRADE_TABLE[g - 1].maxOperand,
        `grade ${g} maxOperand decreased from grade ${g - 1}`
      );
    }
  });

  test('grades have monotonically non-decreasing op sets', () => {
    for (let g = 1; g <= 5; g++) {
      const prevOps = new Set(GRADE_TABLE[g - 1].ops);
      for (const op of prevOps) {
        assert.ok(
          GRADE_TABLE[g].ops.includes(op),
          `grade ${g} lost op ${op} from grade ${g - 1}`
        );
      }
    }
  });
});

describe('formatQuestion / opSymbol', () => {
  test('opSymbol maps * and / correctly', () => {
    assert.equal(opSymbol('+'), '+');
    assert.equal(opSymbol('-'), '-');
    assert.equal(opSymbol('*'), '\u00d7');
    assert.equal(opSymbol('/'), '\u00f7');
  });

  test('formatQuestion renders a readable equation', () => {
    const s = formatQuestion({ a: 3, b: 4, op: '+', answer: 7, choices: [], correctIndex: 0 });
    assert.equal(s, '3 + 4 = ?');
  });

  test('formatQuestion uses the display symbol for * and /', () => {
    assert.equal(
      formatQuestion({ a: 6, b: 2, op: '*', answer: 12, choices: [], correctIndex: 0 }),
      '6 \u00d7 2 = ?'
    );
    assert.equal(
      formatQuestion({ a: 12, b: 3, op: '/', answer: 4, choices: [], correctIndex: 0 }),
      '12 \u00f7 3 = ?'
    );
  });
});

// ------------------------------------------------------------------
// PHASE 2: SPACED REPETITION, ADAPTIVE DIFFICULTY, PROBLEM VARIETY
// ------------------------------------------------------------------

describe('Phase 2.1 \u2014 spaced repetition', () => {
  test('problemHistory is populated after generating questions', () => {
    __resetState();
    generateQuestion({ grade: 3 });
    generateQuestion({ grade: 3 });
    generateQuestion({ grade: 3 });
    const history = __getProblemHistory();
    assert.equal(history.length, 3);
    for (const entry of history) {
      assert.equal(typeof entry.op, 'string');
      assert.equal(typeof entry.a, 'number');
      assert.equal(typeof entry.b, 'number');
      assert.equal(typeof entry.answer, 'number');
      assert.equal(entry.correct, null);
      assert.equal(typeof entry.timestamp, 'number');
    }
  });

  test('recordAnswer marks the most recent entry', () => {
    __resetState();
    generateQuestion({ grade: 3 });
    recordAnswer(true);
    const history = __getProblemHistory();
    assert.equal(history[0].correct, true);

    generateQuestion({ grade: 3 });
    recordAnswer(false);
    assert.equal(history[1].correct, false);
  });

  test('getWeakProblems returns wrong answers from last 30', () => {
    __resetState();
    // Generate 5 questions, all wrong
    for (let i = 0; i < 5; i++) {
      generateQuestion({ grade: 3 });
      recordAnswer(false);
    }
    const weak = getWeakProblems();
    assert.equal(weak.length, 5);

    // Generate 3 correct questions
    for (let i = 0; i < 3; i++) {
      generateQuestion({ grade: 3 });
      recordAnswer(true);
    }
    const weak2 = getWeakProblems();
    assert.equal(weak2.length, 5); // still 5 wrong from the first batch
  });

  test('problem history caps at 100 entries', () => {
    __resetState();
    for (let i = 0; i < 120; i++) {
      generateQuestion({ grade: 3 });
    }
    const history = __getProblemHistory();
    assert.ok(history.length <= 100, `history length ${history.length} exceeds 100`);
  });

  test('spaced repetition can re-present weak problems (statistical)', () => {
    __resetState();
    // Seed weak problems
    for (let i = 0; i < 10; i++) {
      generateQuestion({ grade: 3, operator: '+' });
      recordAnswer(false);
    }
    // Generate many questions \u2014 at least some should be from weak pool
    // (20% chance each time, with 10 weak problems)
    let reusedCount = 0;
    const weakProblems = getWeakProblems();
    const weakKeys = new Set(weakProblems.map(p => `${p.a}:${p.op}:${p.b}`));
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 3, operator: '+' });
      if (weakKeys.has(`${q.a}:${q.op}:${q.b}`)) reusedCount++;
    }
    // With 20% chance and 500 tries, we expect ~100 reused, but set low bar
    assert.ok(reusedCount > 5, `Expected some weak problem reuse, got only ${reusedCount} in 500 runs`);
  });
});

describe('Phase 2.2 \u2014 adaptive difficulty via rolling accuracy', () => {
  test('rolling accuracy tracks after enough answers', () => {
    __resetState();
    for (let i = 0; i < 10; i++) {
      generateQuestion({ grade: 3 });
      recordAnswer(true);
    }
    const accuracy = __getRollingAccuracy();
    assert.ok(accuracy >= 0 && accuracy <= 1, `accuracy ${accuracy} out of range`);
    assert.equal(accuracy, 1.0); // all correct
  });

  test('rolling accuracy window is 20', () => {
    __resetState();
    // 10 correct then 10 wrong = 50% accuracy
    for (let i = 0; i < 10; i++) {
      generateQuestion({ grade: 3 });
      recordAnswer(true);
    }
    for (let i = 0; i < 10; i++) {
      generateQuestion({ grade: 3 });
      recordAnswer(false);
    }
    const accuracy = __getRollingAccuracy();
    assert.ok(Math.abs(accuracy - 0.5) < 0.01, `expected ~0.5, got ${accuracy}`);
  });

  test('high accuracy does not break question generation', () => {
    __resetState();
    for (let i = 0; i < 20; i++) {
      generateQuestion({ grade: 3, operator: '+' });
      recordAnswer(true);
    }
    // Now generate more \u2014 should work fine with boosted range
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion({ grade: 3, operator: '+' });
      assertValidQuestion(q, `high accuracy iter ${i}`);
    }
  });

  test('low accuracy does not break question generation', () => {
    __resetState();
    for (let i = 0; i < 20; i++) {
      generateQuestion({ grade: 3, operator: '+' });
      recordAnswer(false);
    }
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion({ grade: 3, operator: '+' });
      assertValidQuestion(q, `low accuracy iter ${i}`);
    }
  });
});

describe('Phase 2.3 \u2014 missing operand format', () => {
  test('floor >= 5 sometimes generates missing format', () => {
    __resetState();
    let sawMissing = false;
    let sawStandard = false;
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 5, operator: '+', floor: 5 });
      assertValidQuestion(q, `missing format iter ${i}`);
      if (q.format === 'missing') sawMissing = true;
      if (q.format === 'standard') sawStandard = true;
    }
    assert.ok(sawMissing, 'never produced missing format in 500 runs at floor 5');
    assert.ok(sawStandard, 'never produced standard format in 500 runs at floor 5');
  });

  test('floor < 5 never generates missing format', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 3, operator: '+', floor: 3 });
      assert.notEqual(q.format, 'missing', `floor 3 produced missing format at iter ${i}`);
    }
  });

  test('missing format has correct answer = a (the missing operand)', () => {
    __resetState();
    for (let i = 0; i < 1000; i++) {
      const q = generateQuestion({ grade: 5, operator: '+', floor: 5 });
      if (q.format === 'missing') {
        assert.equal(q.answer, q.a, `missing format answer should be a=${q.a}, got ${q.answer}`);
        assert.equal(typeof q.fullAnswer, 'number', 'missing format should have fullAnswer');
        assert.equal(q.choices[q.correctIndex], q.a, 'correctIndex should point to a');
        return; // found and verified one
      }
    }
    assert.fail('could not find a missing format question in 1000 tries');
  });

  test('missing format questions are always valid', () => {
    __resetState();
    for (let i = 0; i < 2000; i++) {
      const q = generateQuestion({ grade: 5, operator: '+', floor: 5 });
      assertValidQuestion(q, `floor 5 iter ${i}`);
    }
  });
});

// ------------------------------------------------------------------
// NEW PROBLEM TYPES: Fractions, Geometry, Money, Word Problems
// ------------------------------------------------------------------

/** Validate a special-format question (fraction/geometry/money/word). */
function assertValidSpecialQuestion(q, context = '') {
  assert.ok(q, `${context}: result is falsy`);
  assert.ok(Array.isArray(q.choices), `${context}: choices is not an array`);
  assert.equal(q.choices.length, 4, `${context}: choices length is not 4`);
  const uniqueChoices = new Set(q.choices.map(String));
  assert.equal(uniqueChoices.size, 4, `${context}: choices not unique: ${q.choices.join(',')}`);
  assert.equal(typeof q.correctIndex, 'number', `${context}: correctIndex is not a number`);
  assert.ok(q.correctIndex >= 0 && q.correctIndex < 4, `${context}: correctIndex out of range`);
  assert.equal(q.choices[q.correctIndex], q.answer, `${context}: choices[correctIndex] !== answer`);
}

describe('Fraction problems (operator: frac)', () => {
  test('produces valid fraction questions for every grade', () => {
    __resetState();
    for (let grade = 0; grade <= 5; grade++) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade, operator: 'frac' });
        assertValidSpecialQuestion(q, `frac grade ${grade} iter ${i}`);
        assert.equal(q.format, 'fraction', `${q.format} should be fraction`);
        assert.equal(typeof q.text, 'string', 'fraction question should have text');
        assert.ok(q.text.length > 0, 'fraction question text should not be empty');
      }
    }
  });

  test('fraction answers are valid fraction strings', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade, operator: 'frac' });
      const ans = q.answer;
      assert.equal(typeof ans, 'string', `fraction answer should be string, got ${typeof ans}`);
      // Answer should match pattern: "N" (whole number) or "N/M" (fraction)
      assert.ok(/^\d+$/.test(ans) || /^\d+\/\d+$/.test(ans),
        `fraction answer "${ans}" does not match expected format`);
    }
  });

  test('fraction choices are all fraction strings', () => {
    __resetState();
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion({ grade: 3, operator: 'frac' });
      for (const c of q.choices) {
        assert.equal(typeof c, 'string', `fraction choice should be string, got ${typeof c}: ${c}`);
        assert.ok(/^\d+$/.test(c) || /^\d+\/\d+$/.test(c),
          `fraction choice "${c}" does not match expected format`);
      }
    }
  });

  test('grade 0-1 produces comparison questions', () => {
    __resetState();
    let sawCompare = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 0, operator: 'frac' });
      if (q.text.includes('Which is bigger')) sawCompare = true;
    }
    assert.ok(sawCompare, 'grade 0 should produce fraction comparison questions');
  });

  test('grade 2-3 produces addition with same denominator', () => {
    __resetState();
    let sawAdd = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 2, operator: 'frac' });
      if (q.text.includes('+')) sawAdd = true;
    }
    assert.ok(sawAdd, 'grade 2 should produce fraction addition questions');
  });

  test('grade 4-5 produces addition with different denominators', () => {
    __resetState();
    let sawDiffDenom = false;
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion({ grade: 5, operator: 'frac' });
      if (q.text.includes('+')) sawDiffDenom = true;
    }
    assert.ok(sawDiffDenom, 'grade 5 should produce fraction addition questions');
  });
});

describe('Geometry problems (operator: geo)', () => {
  test('produces valid geometry questions for every grade', () => {
    __resetState();
    for (let grade = 0; grade <= 5; grade++) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade, operator: 'geo' });
        assertValidSpecialQuestion(q, `geo grade ${grade} iter ${i}`);
        assert.equal(q.format, 'geometry', `format should be geometry`);
        assert.equal(typeof q.text, 'string', 'geometry question should have text');
        assert.ok(q.text.length > 0, 'geometry question text should not be empty');
      }
    }
  });

  test('geometry answers are positive integers', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade, operator: 'geo' });
      assert.equal(typeof q.answer, 'number', `geometry answer should be number`);
      assert.ok(Number.isInteger(q.answer), `geometry answer should be integer: ${q.answer}`);
      assert.ok(q.answer > 0, `geometry answer should be positive: ${q.answer}`);
    }
  });

  test('grade 0-2 produces shape identification questions', () => {
    __resetState();
    let sawShapes = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 0, operator: 'geo' });
      if (q.text.includes('sides')) sawShapes = true;
    }
    assert.ok(sawShapes, 'grade 0 should produce shape identification questions');
  });

  test('shape answers are correct (3-8 sides)', () => {
    __resetState();
    const shapeAnswers = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, octagon: 8 };
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 1, operator: 'geo' });
      for (const [shape, sides] of Object.entries(shapeAnswers)) {
        if (q.text.includes(shape)) {
          assert.equal(q.answer, sides, `${shape} should have ${sides} sides, got ${q.answer}`);
        }
      }
    }
  });

  test('grade 3-5 produces area and perimeter questions', () => {
    __resetState();
    let sawArea = false;
    let sawPerimeter = false;
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 4, operator: 'geo' });
      if (q.text.includes('Area')) sawArea = true;
      if (q.text.includes('Perimeter')) sawPerimeter = true;
    }
    assert.ok(sawArea, 'grade 4 should produce area questions');
    assert.ok(sawPerimeter, 'grade 4 should produce perimeter questions');
  });
});

describe('Money problems (operator: money)', () => {
  test('produces valid money questions for every grade', () => {
    __resetState();
    for (let grade = 0; grade <= 5; grade++) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade, operator: 'money' });
        assertValidSpecialQuestion(q, `money grade ${grade} iter ${i}`);
        assert.equal(q.format, 'money', `format should be money`);
        assert.equal(typeof q.text, 'string', 'money question should have text');
        assert.ok(q.text.length > 0, 'money question text should not be empty');
      }
    }
  });

  test('money answers are positive whole numbers (cents)', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade, operator: 'money' });
      assert.equal(typeof q.answer, 'number', `money answer should be number`);
      assert.ok(Number.isInteger(q.answer), `money answer should be whole number: ${q.answer}`);
      assert.ok(q.answer > 0, `money answer should be positive: ${q.answer}`);
    }
  });

  test('grade 0-1 produces coin counting questions', () => {
    __resetState();
    let sawCoins = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 0, operator: 'money' });
      if (q.text.includes('pennies') || q.text.includes('nickels')) sawCoins = true;
    }
    assert.ok(sawCoins, 'grade 0 should produce coin counting questions');
  });

  test('grade 2-3 produces change-making questions', () => {
    __resetState();
    let sawChange = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 2, operator: 'money' });
      if (q.text.includes('Change')) sawChange = true;
    }
    assert.ok(sawChange, 'grade 2 should produce change-making questions');
  });

  test('grade 4-5 produces multi-item purchase questions', () => {
    __resetState();
    let sawMulti = false;
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion({ grade: 5, operator: 'money' });
      if (q.text.includes('items at')) sawMulti = true;
    }
    assert.ok(sawMulti, 'grade 5 should produce multi-item purchase questions');
  });
});

describe('Word problems (operator: word)', () => {
  test('produces valid word problems for every grade', () => {
    __resetState();
    for (let grade = 0; grade <= 5; grade++) {
      for (let i = 0; i < 200; i++) {
        const q = generateQuestion({ grade, operator: 'word' });
        assertValidSpecialQuestion(q, `word grade ${grade} iter ${i}`);
        assert.equal(q.format, 'word', `format should be word`);
        assert.equal(typeof q.text, 'string', 'word problem should have text');
        assert.ok(q.text.length > 0, 'word problem text should not be empty');
      }
    }
  });

  test('word problem answers are non-negative integers', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const grade = Math.floor(Math.random() * 6);
      const q = generateQuestion({ grade, operator: 'word' });
      assert.equal(typeof q.answer, 'number', `word answer should be number`);
      assert.ok(Number.isInteger(q.answer), `word answer should be integer: ${q.answer}`);
      assert.ok(q.answer >= 0, `word answer should be non-negative: ${q.answer}`);
    }
  });

  test('word problems use contextual text', () => {
    __resetState();
    const keywords = ['coins', 'potions', 'chests', 'heroes', 'gold'];
    let hitCount = 0;
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion({ grade: 4, operator: 'word' });
      if (keywords.some(kw => q.text.includes(kw))) hitCount++;
    }
    assert.ok(hitCount > 100, `word problems should use contextual text, only ${hitCount}/200 had keywords`);
  });

  test('word problems use basic operations from grade', () => {
    __resetState();
    const ops = new Set();
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 5, operator: 'word' });
      ops.add(q.op);
    }
    // Grade 5 has +, -, *, / so word problems should use all of them
    assert.ok(ops.has('+'), 'word problems should include addition');
    assert.ok(ops.has('-'), 'word problems should include subtraction');
    assert.ok(ops.has('*'), 'word problems should include multiplication');
    assert.ok(ops.has('/'), 'word problems should include division');
  });

  test('grade 0-1 word problems only use + and -', () => {
    __resetState();
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ grade: 0, operator: 'word' });
      assert.ok(['+', '-'].includes(q.op), `grade 0 word problem used op ${q.op}`);
    }
  });
});

describe('expectedAnswer for new problem types', () => {
  test('frac expectedAnswer returns 3', () => {
    assert.equal(expectedAnswer('frac', 3), 3);
  });

  test('geo expectedAnswer returns 10', () => {
    assert.equal(expectedAnswer('geo', 3), 10);
  });

  test('money expectedAnswer returns 25', () => {
    assert.equal(expectedAnswer('money', 3), 25);
  });

  test('word expectedAnswer returns a positive number', () => {
    const val = expectedAnswer('word', 3);
    assert.ok(val > 0, `word expectedAnswer should be positive, got ${val}`);
  });
});

describe('Floor 9 mixed mode includes special types', () => {
  test('floor 9 mixed can produce special problem types', () => {
    __resetState();
    const formats = new Set();
    for (let i = 0; i < 2000; i++) {
      const q = generateQuestion({ grade: 5, operator: 'mixed', floor: 9 });
      if (q.format) formats.add(q.format);
    }
    // Should include at least some special formats
    const hasSpecial = formats.has('fraction') || formats.has('money') || formats.has('word');
    assert.ok(hasSpecial, `floor 9 mixed should produce special types, only got: ${[...formats].join(',')}`);
  });
});
