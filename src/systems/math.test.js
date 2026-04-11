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
  assert.equal(q.answer, expected, `${context}: ${q.a} ${q.op} ${q.b} = ${expected}, got answer=${q.answer}`);

  // Division must be clean (no fractions)
  if (q.op === '/') {
    assert.equal(q.a % q.b, 0, `${context}: division ${q.a} / ${q.b} is not clean`);
  }

  // Subtraction must not go negative
  if (q.op === '-') {
    assert.ok(q.a >= q.b, `${context}: subtraction ${q.a} - ${q.b} would be negative`);
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
