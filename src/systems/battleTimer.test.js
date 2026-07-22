import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getQuestionTimer, timerColor, BOSS_BASE_MS, FORMAT_MULT } from './battleTimer.js';

describe('getQuestionTimer', () => {
  test('boss timers are hard and grade-scaled', () => {
    for (let g = 0; g <= 5; g++) {
      const t = getQuestionTimer({ grade: g, format: '+', isBoss: true });
      assert.equal(t.hard, true);
      assert.equal(t.ms, BOSS_BASE_MS[g]);
    }
  });

  test('boss table is more generous than the v1 [12,11,10,8,9,10]s', () => {
    const v1 = [12000, 11000, 10000, 8000, 9000, 10000];
    for (let g = 0; g <= 5; g++) {
      const t = getQuestionTimer({ grade: g, format: '+', isBoss: true });
      assert.ok(t.ms >= v1[g], `grade ${g}: ${t.ms} < v1 ${v1[g]}`);
    }
  });

  test('reading-heavy formats get more time, never from stars', () => {
    const plain = getQuestionTimer({ grade: 3, format: '+', isBoss: true }).ms;
    const frac = getQuestionTimer({ grade: 3, format: 'frac', isBoss: true }).ms;
    const word = getQuestionTimer({ grade: 3, format: 'word', isBoss: true }).ms;
    const geo = getQuestionTimer({ grade: 3, format: 'geo', isBoss: true }).ms;
    assert.equal(frac, Math.round(plain * FORMAT_MULT.frac));
    assert.equal(word, frac);
    assert.ok(geo > plain && geo < frac);
  });

  test('normal battles have NO timer at any grade — only bosses are timed', () => {
    for (let g = 0; g <= 5; g++) {
      assert.equal(getQuestionTimer({ grade: g, format: '+', isBoss: false }), null);
      assert.equal(getQuestionTimer({ grade: g, format: 'word', isBoss: false }), null);
    }
  });

  test('unknown formats fall back to a middle multiplier', () => {
    const t = getQuestionTimer({ grade: 2, format: 'mystery', isBoss: true });
    assert.equal(t.ms, Math.round(BOSS_BASE_MS[2] * 1.2));
  });

  test('out-of-range grades clamp', () => {
    assert.equal(getQuestionTimer({ grade: 99, format: '+', isBoss: true }).ms, BOSS_BASE_MS[5]);
    assert.equal(getQuestionTimer({ grade: -3, format: '+', isBoss: true }).ms, BOSS_BASE_MS[0]);
  });
});

describe('timerColor', () => {
  test('green > half, amber > quarter, red below', () => {
    assert.equal(timerColor(0.9), 0x4aa848);
    assert.equal(timerColor(0.4), 0xe8a030);
    assert.equal(timerColor(0.1), 0xd84030);
  });
});
