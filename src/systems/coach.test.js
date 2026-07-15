import { test } from 'node:test';
import assert from 'node:assert';
import {
  HINT_TIERS, createCoachQuestionState, takeHint, hintDamageMult,
  applyHintMomentum, retryEligible, eliminateForRetry, retryDamageMult,
} from './coach.js';

const Q = { op: '+', a: 27, b: 35, answer: 62, choices: [62, 60, 52, 12], correctIndex: 0 };

test('hint ladder advances 0 → tip → scaffold → null', () => {
  const s = createCoachQuestionState();
  assert.equal(s.tier, HINT_TIERS.NONE);
  const t1 = takeHint(s, Q);
  assert.equal(t1.tier, HINT_TIERS.TIP);
  assert.match(t1.text, /Tip:/);
  const t2 = takeHint(s, Q);
  assert.equal(t2.tier, HINT_TIERS.SCAFFOLD);
  assert.match(t2.text, /\?/);              // scaffold masks the answer
  assert.doesNotMatch(t2.text, /= 62\s*$/);
  assert.equal(takeHint(s, Q), null);       // no rung beyond scaffold
  assert.equal(s.tier, HINT_TIERS.SCAFFOLD);
});

test('hintDamageMult table', () => {
  assert.equal(hintDamageMult(0), 1);
  assert.equal(hintDamageMult(1), 0.75);
  assert.equal(hintDamageMult(2), 0.5);
  assert.equal(hintDamageMult(5), 0.5);     // clamped
});

test('applyHintMomentum: identity at tier 0, dampened above, clamped', () => {
  assert.equal(applyHintMomentum(0.4, 0.9, 0), 0.9);          // full swing
  assert.ok(Math.abs(applyHintMomentum(0.4, 0.9, 1) - 0.7) < 1e-9);  // 60%
  assert.ok(Math.abs(applyHintMomentum(0.4, 0.9, 2) - 0.55) < 1e-9); // 30%
  assert.equal(applyHintMomentum(0.9, 1.6, 0), 1);            // clamp high
  assert.equal(applyHintMomentum(0.2, -0.5, 0), 0);           // clamp low
});

test('retryDamageMult is 0.5', () => {
  assert.equal(retryDamageMult(), 0.5);
});

test('retryEligible: fresh yes; retried/timeout/consumed no', () => {
  assert.equal(retryEligible(Q, {}), true);
  assert.equal(retryEligible(Q, { retryUsed: true }), false);
  assert.equal(retryEligible(Q, { timedOut: true }), false);
  // a consumed distractor leaves only two live distractors → decline
  assert.equal(retryEligible(Q, { consumedButtonIdx: 1 }), false);
  // consuming the correct button is not a distractor removal (defensive)
  assert.equal(retryEligible(Q, { consumedButtonIdx: 0 }), true);
});

test('eliminateForRetry: includes pick + farthest other, never correct', () => {
  // answer 62 at idx0; distractors 60(idx1) 52(idx2) 12(idx3)
  // pick idx1(60). others: 52(d10) 12(d50) → farthest is 12(idx3)
  const r = eliminateForRetry(Q, 1);
  assert.deepEqual(r.sort(), [1, 3]);
  assert.ok(!r.includes(0));               // never the correct answer
  // leaves answer(0) + closest distractor(2=52) lit
});

test('eliminateForRetry: fraction strings compare by value', () => {
  // answer 3/8 = .375; choices 3/8(0) 1/2=.5(1) 7/8=.875(2) 1/8=.125(3)
  const fq = { choices: ['3/8', '1/2', '7/8', '1/8'], correctIndex: 0, answer: '3/8' };
  // pick idx1 (1/2, dist .125). others: 7/8(dist .5) 1/8(dist .25) → farthest 7/8(idx2)
  const r = eliminateForRetry(fq, 1);
  assert.deepEqual(r.sort(), [1, 2]);
});

test('eliminateForRetry: ties break to lower index', () => {
  // answer 10 at idx0; distractors 5(idx1) 15(idx2) 20(idx3)
  // pick idx3(20). others 5(dist5) 15(dist5) tie → lower index 1
  const tq = { choices: [10, 5, 15, 20], correctIndex: 0, answer: 10 };
  const r = eliminateForRetry(tq, 3);
  assert.deepEqual(r.sort(), [1, 3]);
});
