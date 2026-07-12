import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canTriggerSpecial, specialOperator, resolveSpecial, specialTimerMs } from './specialRules.js';

describe('canTriggerSpecial', () => {
  test('needs full momentum AND grade 2+', () => {
    assert.equal(canTriggerSpecial({ momentum: 1.0, grade: 2 }), true);
    assert.equal(canTriggerSpecial({ momentum: 0.9, grade: 5 }), false);
    assert.equal(canTriggerSpecial({ momentum: 1.0, grade: 1 }), false, 'K-1 keep the tap team attack');
  });
});

describe('specialOperator', () => {
  test('arithmetic floors keep their operator', () => {
    for (const op of ['+', '-', '*', '/']) {
      assert.equal(specialOperator({ floorOperator: op, grade: 4 }), op);
    }
  });
  test('special-format floors force a typable integer op', () => {
    assert.equal(specialOperator({ floorOperator: 'frac', grade: 4 }), '*');
    assert.equal(specialOperator({ floorOperator: 'word', grade: 2 }), '+');
    assert.equal(specialOperator({ floorOperator: 'money', grade: 5 }), '*');
    assert.equal(specialOperator({ floorOperator: 'mixed', grade: 2 }), '+');
  });
});

describe('resolveSpecial', () => {
  test('correct: 3x damage with splash, momentum reseats at neutral', () => {
    assert.deepEqual(resolveSpecial({ correct: true }),
      { momentumAfter: 0.5, damageMult: 3.0, splashMult: 0.5 });
  });
  test('wrong: forgiving — normal strike, no splash, momentum 0.5 not 0', () => {
    assert.deepEqual(resolveSpecial({ correct: false }),
      { momentumAfter: 0.5, damageMult: 1.0, splashMult: 0 });
  });
});

describe('specialTimerMs', () => {
  test('1.5x the boss clock', () => {
    assert.equal(specialTimerMs(12000), 18000);
  });
});
