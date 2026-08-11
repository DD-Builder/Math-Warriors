import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_THRESHOLDS, MAX_PHASE, phaseForHp, phaseDueByQuestions,
  phaseCadence, counterMitigation, getPhaseBeat, phaseScale,
  BOSS_PHASE_TABLE, PHASE_QUESTION_FALLBACK,
} from './bossPhases.js';
import { BOSS_IDS } from '../data/enemies.js';
import { PAPER } from '../config.js';

const PAPER_VALUES = new Set(Object.values(PAPER));

describe('phase thresholds', () => {
  test('60% opens phase 2, 30% opens phase 3', () => {
    assert.equal(phaseForHp(100, 100), 1);
    assert.equal(phaseForHp(61, 100), 1);
    assert.equal(phaseForHp(60, 100), 2);
    assert.equal(phaseForHp(31, 100), 2);
    assert.equal(phaseForHp(30, 100), 3);
    assert.equal(phaseForHp(1, 100), 3);
  });
  test('degenerate HP never throws or leaves the 1-3 range', () => {
    for (const [hp, max] of [[0, 0], [-5, 100], [10, 0], [NaN, 100]]) {
      const p = phaseForHp(hp, max);
      assert.ok(p >= 1 && p <= MAX_PHASE, `phaseForHp(${hp},${max}) = ${p}`);
    }
  });
  test('thresholds descend', () => {
    assert.ok(PHASE_THRESHOLDS[0] > PHASE_THRESHOLDS[1]);
  });
});

describe('question-count fallback', () => {
  test('a phase becomes due once enough answers have landed', () => {
    assert.equal(phaseDueByQuestions(PHASE_QUESTION_FALLBACK[0] - 1, 2), false);
    assert.equal(phaseDueByQuestions(PHASE_QUESTION_FALLBACK[0], 2), true);
    assert.equal(phaseDueByQuestions(PHASE_QUESTION_FALLBACK[1], 3), true);
  });
  test('phase 1 has no fallback (it is the starting state)', () => {
    assert.equal(phaseDueByQuestions(999, 1), false);
  });
});

describe('phase cadence', () => {
  test('escalates: more often, harder, more waves, bigger shake', () => {
    const [p1, p2, p3] = [1, 2, 3].map(phaseCadence);
    assert.ok(p2.specialEvery < p1.specialEvery, 'phase 2 must fire more often');
    assert.ok(p3.damageMul > p2.damageMul && p2.damageMul > p1.damageMul);
    assert.ok(p3.waves > p1.waves, 'phase 3 must add a wave');
    assert.ok(p3.shakeMul > p2.shakeMul && p2.shakeMul > p1.shakeMul);
  });
  test('the special never reaches full strength — spectacle, not slaughter', () => {
    for (const p of [1, 2, 3]) assert.ok(phaseCadence(p).damageMul < 1);
  });
  test('the wind-up window stays readable (1.5-3s) at every phase', () => {
    for (const p of [1, 2, 3]) {
      const ms = phaseCadence(p).windupMs;
      assert.ok(ms >= 1500 && ms <= 3000, `phase ${p} wind-up ${ms}ms`);
    }
  });
  test('out-of-range phases clamp instead of returning undefined', () => {
    assert.deepEqual(phaseCadence(0), phaseCadence(1));
    assert.deepEqual(phaseCadence(99), phaseCadence(3));
  });
  test('body scale grows with phase', () => {
    assert.ok(phaseScale(3) > phaseScale(2) && phaseScale(2) > phaseScale(1));
  });
});

describe('counter reward', () => {
  test('more correct answers in the window = a smaller hit', () => {
    assert.equal(counterMitigation(0), 1);
    assert.ok(counterMitigation(1) < counterMitigation(0));
    assert.ok(counterMitigation(3) < counterMitigation(2));
  });
  test('never fully negates the move — the spectacle still lands', () => {
    for (const n of [0, 1, 2, 3, 9]) assert.ok(counterMitigation(n) >= 0.5);
  });
  test('extra sparks clamp instead of going negative', () => {
    assert.equal(counterMitigation(99), counterMitigation(3));
    assert.equal(counterMitigation(-4), counterMitigation(0));
  });
});

describe('phase table', () => {
  test('every boss transforms twice, with a title, a line and a tell', () => {
    for (const id of BOSS_IDS) {
      const row = BOSS_PHASE_TABLE[id];
      assert.ok(row, `${id} has no phase table`);
      for (const p of [2, 3]) {
        const beat = row[p];
        assert.ok(beat, `${id} phase ${p} missing`);
        assert.ok(beat.title && beat.title.length <= 24, `${id} p${p} title`);
        assert.ok(beat.line && beat.line.length <= 60, `${id} p${p} line`);
        assert.ok(beat.tell && beat.tell.length <= 40, `${id} p${p} tell`);
      }
    }
  });

  // ART LAW: every colour in the game comes from the PAPER palette.
  test('every phase colour is a PAPER token', () => {
    for (const id of BOSS_IDS) {
      for (const p of [2, 3]) {
        const beat = BOSS_PHASE_TABLE[id][p];
        assert.ok(PAPER_VALUES.has(beat.flash), `${id} p${p} flash is off-palette`);
        assert.ok(PAPER_VALUES.has(beat.aura), `${id} p${p} aura is off-palette`);
      }
    }
  });

  test('unknown bosses still get a usable beat', () => {
    const beat = getPhaseBeat('mystery', 2);
    assert.ok(beat.title && beat.line && beat.tell);
    assert.ok(PAPER_VALUES.has(beat.flash));
  });
});
