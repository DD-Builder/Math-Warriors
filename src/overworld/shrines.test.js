/**
 * shrines.test.js — the three-beat shrine session.
 *
 * The properties that matter: the physical trial genuinely gates the maths, the
 * maths comes from the ONE shared generator on the floor's own operator, a
 * wrong answer never closes a shrine, and the reward is paid exactly once by
 * discovery.js. The generator is injected, so every run here is deterministic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { generateRatedQuestion } from '../systems/math.js';
import { FLOOR_OPERATORS } from '../data/enemies.js';
import { SHRINES } from './discoverySpec.js';
import { initPuzzle, stepPuzzle, hintFor } from './puzzles.js';
import { completeTrial, isComplete, hasBuff, ensureDiscovery } from './discovery.js';
import {
  PHASES, MERCY_AFTER,
  openShrine, stepTrial, askLock, answerLock, trialHint,
  shrineProgress, isShrineComplete, shrineReward, matchesAnswer,
} from './shrines.js';

/** A deterministic stand-in for generateRatedQuestion. */
function fakeGen(calls = []) {
  let n = 0;
  return (opts) => {
    calls.push(opts);
    n++;
    return { text: `q${n}`, answer: n * 10, operator: opts.operator, stars: 3 };
  };
}

/** Drive a session's physical trial to solved by following hints. */
function solveTrial(session, { messy = false } = {}) {
  let s = session;
  if (messy) s = stepTrial(s, { type: 'reset' }).session;
  let guard = 0;
  while (s.phase === PHASES.TRIAL && guard++ < 200) {
    const hint = hintFor(s.trialSpec, s.trial);
    if (!hint) break;
    s = stepTrial(s, hint.move).session;
  }
  return s;
}

// ── Opening ────────────────────────────────────────────────────────────────

test('openShrine returns a session in the trial phase, or null for a stranger', () => {
  const s = openShrine('shrine-garden');
  assert.ok(s);
  assert.equal(s.phase, PHASES.TRIAL);
  assert.equal(s.opened, 0);
  assert.equal(s.tokens, 0);
  assert.equal(openShrine('nope'), null);
});

test('every shrine opens on its own floor operator, from the shared table', () => {
  for (const rec of SHRINES) {
    const s = openShrine(rec.id);
    assert.equal(s.operator, FLOOR_OPERATORS[rec.floorId], `${rec.id} asks the wrong operator`);
    assert.equal(s.floorId, rec.floorId);
  }
});

// ── The trial gates the maths ──────────────────────────────────────────────

test('no question can be asked until the physical trial is solved', () => {
  const s = openShrine('shrine-garden');
  const q = askLock(s, { generate: fakeGen() }).question;
  assert.equal(q, null, 'the trial must buy the questions');
  assert.equal(answerLock(s, 10).correct, false);
});

test('solving the trial moves to the locks phase and buys at least one question', () => {
  const s = solveTrial(openShrine('shrine-garden'));
  assert.equal(s.phase, PHASES.LOCKS);
  assert.ok(s.tokens >= 1);
  assert.equal(s.trial.solved, true);
});

test('a clean trial buys exactly one more lock than a fumbled one', () => {
  const clean = solveTrial(openShrine('shrine-garden'));
  const messy = solveTrial(openShrine('shrine-garden'), { messy: true });
  assert.equal(clean.clean, true);
  assert.equal(messy.clean, false);
  assert.equal(clean.tokens - messy.tokens, 1);
});

test('stepTrial returns the same session reference on a no-op', () => {
  const s = openShrine('shrine-garden');
  const r = stepTrial(s, { type: 'press', id: 'no-such-plate' });
  assert.equal(r.session, s);
});

test('trialHint stays quiet until the player has genuinely struggled', () => {
  let s = openShrine('shrine-frost'); // oddOne
  assert.equal(trialHint(s), null, 'the world must not lean in immediately');
  const wrong = s.trialSpec.items.filter((i) => i.id !== s.trialSpec.oddId);
  for (let i = 0; i < MERCY_AFTER; i++) s = stepTrial(s, { type: 'pick', id: wrong[i].id }).session;
  assert.ok(trialHint(s), 'after real struggle the world must offer a hand');
});

// ── The locks ──────────────────────────────────────────────────────────────

test('askLock calls the shared generator with the floor operator and grade', () => {
  const calls = [];
  let s = solveTrial(openShrine('shrine-ember')); // floor 4 -> '/'
  const r = askLock(s, { generate: fakeGen(calls), grade: 4 });
  assert.ok(r.question);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operator, FLOOR_OPERATORS[4]);
  assert.equal(calls[0].floor, 4);
  assert.equal(calls[0].grade, 4);
});

test('later locks lean harder', () => {
  const calls = [];
  const gen = fakeGen(calls);
  let s = solveTrial(openShrine('shrine-garden'));
  for (let i = 0; i < s.tokens; i++) {
    const r = askLock(s, { generate: gen, grade: 3 });
    s = r.session;
    s = answerLock(s, r.question.answer).session;
  }
  assert.ok(calls.length >= 3);
  assert.deepEqual(calls[0].targetStars, [2, 3]);
  assert.deepEqual(calls[calls.length - 1].targetStars, [3, 4]);
  assert.ok(calls[calls.length - 1].streak > calls[0].streak, 'streak must climb');
});

test('a correct answer opens one lock; the last one finishes the shrine', () => {
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-garden'));
  const total = s.tokens;
  for (let i = 0; i < total; i++) {
    assert.equal(isShrineComplete(s), false);
    const r = askLock(s, { generate: gen });
    s = r.session;
    const a = answerLock(s, r.question.answer);
    assert.equal(a.correct, true);
    s = a.session;
    assert.equal(s.opened, i + 1);
  }
  assert.equal(isShrineComplete(s), true);
  assert.equal(s.phase, PHASES.DONE);
});

test('a string answer is accepted — the numpad hands up text', () => {
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-garden'));
  const r = askLock(s, { generate: gen });
  const a = answerLock(r.session, ` ${r.question.answer} `);
  assert.equal(a.correct, true);
});

test('a wrong answer never closes the shrine and never opens a lock early', () => {
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-garden'));
  const r = askLock(s, { generate: gen });
  const a = answerLock(r.session, r.question.answer + 1);
  assert.equal(a.correct, false);
  assert.equal(a.mercy, false);
  assert.equal(a.session.opened, 0);
  assert.equal(a.session.phase, PHASES.LOCKS, 'a shrine cannot be failed');
  assert.equal(a.session.totalMisses, 1);
});

test('the shrine forgives a lock after enough misses, and says it was mercy', () => {
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-garden'));
  let mercied = false;
  for (let i = 0; i < MERCY_AFTER; i++) {
    const r = askLock(s, { generate: gen });
    s = r.session;
    const a = answerLock(s, r.question.answer + 1);
    s = a.session;
    if (a.mercy) mercied = true;
  }
  assert.equal(mercied, true, 'a child must never be stuck at a shrine door');
  assert.equal(s.opened, 1);
});

test('a nonsense answer is wrong, not a crash', () => {
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-garden'));
  const r = askLock(s, { generate: gen });
  for (const bad of ['', 'abc', null, undefined, NaN]) {
    const a = answerLock(r.session, bad);
    assert.equal(a.correct, false);
  }
});

test('askLock without a generator is a safe no-op rather than a throw', () => {
  const s = solveTrial(openShrine('shrine-garden'));
  assert.equal(askLock(s, {}).question, null);
  assert.equal(askLock(null, { generate: fakeGen() }).question, null);
});

// ── Progress & reward ──────────────────────────────────────────────────────

test('shrineProgress reads 0 during the trial and 1 when every lock is open', () => {
  let s = openShrine('shrine-garden');
  assert.equal(shrineProgress(s).pct, 0);
  s = solveTrial(s);
  const gen = fakeGen();
  while (!isShrineComplete(s)) {
    const r = askLock(s, { generate: gen });
    s = answerLock(r.session, r.question.answer).session;
  }
  const p = shrineProgress(s);
  assert.equal(p.pct, 1);
  assert.equal(p.done, p.total);
  assert.equal(shrineProgress(null).pct, 0);
});

test('no reward is owed until every lock is open', () => {
  let s = solveTrial(openShrine('shrine-garden'));
  assert.equal(shrineReward(s), null);
  const gen = fakeGen();
  const r = askLock(s, { generate: gen });
  s = answerLock(r.session, r.question.answer).session;
  if (!isShrineComplete(s)) assert.equal(shrineReward(s), null);
});

test('a clean solve adds gold but never a second buff', () => {
  const gen = fakeGen();
  const run = (messy) => {
    let s = solveTrial(openShrine('shrine-garden'), { messy });
    while (!isShrineComplete(s)) {
      const r = askLock(s, { generate: gen });
      s = answerLock(r.session, r.question.answer).session;
    }
    return shrineReward(s);
  };
  const clean = run(false);
  const messy = run(true);
  assert.ok(clean.gold > messy.gold, 'a clean solve must be worth more');
  assert.equal(clean.buff, messy.buff, 'the permanent thing must not depend on skill');
});

test('the whole shrine, end to end, pays exactly once into the save', () => {
  const save = makeDefaultSave();
  const gen = fakeGen();
  let s = solveTrial(openShrine('shrine-tidepool'));
  while (!isShrineComplete(s)) {
    const r = askLock(s, { generate: gen });
    s = answerLock(r.session, r.question.answer).session;
  }
  const first = completeTrial(save, s.shrineId, shrineReward(s));
  assert.equal(first.granted, true);
  const gold = save.gold;
  assert.ok(gold > 0);
  assert.equal(hasBuff(save, 'buff-deep-breath'), true);
  assert.equal(isComplete(save, 'shrine-tidepool'), true);

  const second = completeTrial(save, s.shrineId, shrineReward(s));
  assert.equal(second.already, true);
  assert.equal(save.gold, gold, 'a re-run of the shrine paid again');
  assert.equal(ensureDiscovery(save).buffs.length, 1);
});

test('every shrine in the game can be completed end to end', () => {
  const gen = fakeGen();
  for (const rec of SHRINES) {
    let s = solveTrial(openShrine(rec.id));
    assert.equal(s.phase, PHASES.LOCKS, `${rec.id}: trial did not solve`);
    let guard = 0;
    while (!isShrineComplete(s) && guard++ < 20) {
      const r = askLock(s, { generate: gen });
      s = answerLock(r.session, r.question.answer).session;
    }
    assert.ok(isShrineComplete(s), `${rec.id} cannot be finished`);
    const reward = shrineReward(s);
    assert.ok(reward.gold > 0, `${rec.id} pays no gold`);
  }
});

// ── The real generator ─────────────────────────────────────────────────────

test('the REAL generateRatedQuestion answers every shrine operator', () => {
  for (const rec of SHRINES) {
    // Several rounds each: the generator is random, and floor 8 in particular
    // answers with fraction STRINGS ("2/3"), not numbers.
    for (let i = 0; i < 25; i++) {
      const s = solveTrial(openShrine(rec.id));
      const r = askLock(s, { generate: generateRatedQuestion, grade: 3 });
      assert.ok(r.question, `${rec.id}: the shared generator produced nothing`);
      assert.ok(r.question.answer != null, `${rec.id}: no answer`);
      const a = answerLock(r.session, r.question.answer);
      assert.equal(a.correct, true,
        `${rec.id}: rejected its own correct answer ${JSON.stringify(r.question.answer)}`);
      // And the same answer as text, which is what a numpad or a chooser hands up.
      const b = answerLock(r.session, String(r.question.answer));
      assert.equal(b.correct, true, `${rec.id}: rejected the correct answer as text`);
    }
  }
});

test('matchesAnswer handles fraction strings, numeric text and rubbish', () => {
  assert.equal(matchesAnswer({ answer: 42 }, 42), true);
  assert.equal(matchesAnswer({ answer: 42 }, '42'), true);
  assert.equal(matchesAnswer({ answer: 42 }, ' 42 '), true);
  assert.equal(matchesAnswer({ answer: 42 }, 41), false);
  assert.equal(matchesAnswer({ answer: 42 }, 'forty-two'), false);
  // Floor 8 answers with strings.
  assert.equal(matchesAnswer({ answer: '2/3' }, '2/3'), true);
  assert.equal(matchesAnswer({ answer: '2/3' }, ' 2 / 3 '), true);
  assert.equal(matchesAnswer({ answer: '2/3' }, '1/3'), false);
  assert.equal(matchesAnswer({ answer: '0.5' }, 0.5), true);
  assert.equal(matchesAnswer({ answer: 1 }, null), false);
  assert.equal(matchesAnswer(null, 1), false);
  // An empty box is never an answer, even when the answer happens to be zero.
  assert.equal(matchesAnswer({ answer: 0 }, ''), false);
  assert.equal(matchesAnswer({ answer: 0 }, '   '), false);
  assert.equal(matchesAnswer({ answer: 0 }, 0), true);
});

test('a fraction shrine can actually be completed with correct answers only', () => {
  // Floor 8 is the fraction floor; before matchesAnswer existed, every correct
  // answer here was rejected and the shrine could only be opened by mercy.
  const rec = SHRINES.find((r) => r.floorId === 8);
  let s = solveTrial(openShrine(rec.id));
  let guard = 0;
  while (!isShrineComplete(s) && guard++ < 20) {
    const r = askLock(s, { generate: generateRatedQuestion, grade: 3 });
    const a = answerLock(r.session, r.question.answer);
    assert.equal(a.correct, true, `rejected a correct fraction answer: ${r.question.answer}`);
    assert.equal(a.mercy, false, 'the shrine opened out of pity, not because the answer was right');
    s = a.session;
  }
  assert.ok(isShrineComplete(s));
});
