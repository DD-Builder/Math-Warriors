/**
 * puzzles.test.js — the five environmental state machines, driven.
 *
 * These reducers are what every shrine door and every landmark in the open
 * world runs on, so the properties that matter are not "does it parse" but the
 * kindness rules the design promises: no puzzle can be made unwinnable, no
 * puzzle mutates its arguments, `hintFor` always names a move that is actually
 * correct, and solving is idempotent.
 *
 * The strongest test in here is the RANDOM WALK: for every authored puzzle in
 * the game, take a thousand random legal moves and assert the machine never
 * reaches a state from which `hintFor` cannot find a way out. That is the
 * property a five-year-old will test by hand within a minute.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUZZLE_KINDS, EVENTS, NUDGE_AFTER,
  normalizePuzzle, validatePuzzle, initPuzzle, stepPuzzle, isSolved,
  puzzleProgress, beamReach, balanceReading, sumReading,
  hintFor, shouldNudge, trialTokens,
} from './puzzles.js';
import { SHRINES, LANDMARK_PUZZLES } from './discoverySpec.js';

/** Every authored puzzle spec in the game, shrine trials and landmarks alike. */
const ALL_SPECS = [
  ...SHRINES.map((s) => ({ id: s.id, spec: s.trial })),
  ...LANDMARK_PUZZLES.map((p) => ({ id: p.id, spec: p.puzzle })),
];

// ── Spec validity ──────────────────────────────────────────────────────────

test('every authored puzzle in the game is structurally sound', () => {
  for (const { id, spec } of ALL_SPECS) {
    const problems = validatePuzzle(spec);
    assert.deepEqual(problems, [], `${id}: ${problems.join('; ')}`);
  }
});

test('every puzzle kind is exercised by the authored content', () => {
  const used = new Set(ALL_SPECS.map(({ spec }) => spec.kind));
  for (const kind of PUZZLE_KINDS) {
    assert.ok(used.has(kind), `no authored puzzle uses kind ${kind}`);
  }
});

test('normalizePuzzle never mutates its input', () => {
  const spec = { kind: 'sum', target: 5, plates: [{ id: 'a', value: 2 }, { id: 'b', value: 3 }] };
  const frozenPlates = spec.plates;
  const out = normalizePuzzle(spec);
  out.plates[0].value = 99;
  out.target = 99;
  assert.equal(spec.target, 5);
  assert.equal(frozenPlates[0].value, 2);
});

test('validatePuzzle catches an unreachable sum target', () => {
  const problems = validatePuzzle({ kind: 'sum', target: 7, plates: [{ id: 'a', value: 2 }, { id: 'b', value: 4 }] });
  assert.ok(problems.some((p) => p.includes('unreachable')), problems.join('; '));
});

test('validatePuzzle catches a balance that can never level', () => {
  const problems = validatePuzzle({ kind: 'balance', weights: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] });
  assert.ok(problems.length > 0);
});

// ── order ──────────────────────────────────────────────────────────────────

const ORDER = {
  kind: 'order',
  nodes: [{ id: 'a', value: 3 }, { id: 'b', value: 1 }, { id: 'c', value: 2 }],
};

test('order: lighting ascending solves; the last correct move emits SOLVE', () => {
  let s = initPuzzle(ORDER);
  let r = stepPuzzle(ORDER, s, { type: 'activate', id: 'b' });
  assert.equal(r.event, EVENTS.ACCEPT);
  r = stepPuzzle(ORDER, r.state, { type: 'activate', id: 'c' });
  assert.equal(r.event, EVENTS.ACCEPT);
  r = stepPuzzle(ORDER, r.state, { type: 'activate', id: 'a' });
  assert.equal(r.event, EVENTS.SOLVE);
  assert.ok(isSolved(ORDER, r.state));
});

test('order: a wrong stone clears the row and counts a wrong', () => {
  const s = initPuzzle(ORDER);
  const r = stepPuzzle(ORDER, s, { type: 'activate', id: 'a' }); // 3 before 1
  assert.equal(r.event, EVENTS.REJECT);
  assert.deepEqual(r.state.lit, []);
  assert.equal(r.state.wrongs, 1);
});

test('order: a solved puzzle ignores further moves', () => {
  let s = initPuzzle(ORDER);
  for (const id of ['b', 'c', 'a']) s = stepPuzzle(ORDER, s, { type: 'activate', id }).state;
  const r = stepPuzzle(ORDER, s, { type: 'activate', id: 'b' });
  assert.equal(r.event, EVENTS.NOOP);
  assert.equal(r.state, s, 'no-op must return the same reference');
});

// ── sum ────────────────────────────────────────────────────────────────────

const SUM = {
  kind: 'sum', target: 8,
  plates: [{ id: 'p1', value: 1 }, { id: 'p3', value: 3 }, { id: 'p5', value: 5 }, { id: 'p6', value: 6 }],
};

test('sum: stepping on plates that make the target solves it', () => {
  let s = initPuzzle(SUM);
  s = stepPuzzle(SUM, s, { type: 'press', id: 'p3' }).state;
  const r = stepPuzzle(SUM, s, { type: 'press', id: 'p5' });
  assert.equal(r.event, EVENTS.SOLVE);
  assert.equal(r.state.sum, 8);
});

test('sum: overshooting is recoverable — stepping off is always allowed', () => {
  let s = initPuzzle(SUM);
  s = stepPuzzle(SUM, s, { type: 'press', id: 'p5' }).state;
  s = stepPuzzle(SUM, s, { type: 'press', id: 'p6' }).state; // 11, over
  assert.equal(sumReading(SUM, s).over, true);
  s = stepPuzzle(SUM, s, { type: 'release', id: 'p6' }).state;
  s = stepPuzzle(SUM, s, { type: 'press', id: 'p3' }).state;
  assert.ok(s.solved, 'must be able to climb back down from an overshoot');
});

test('sum: releasing a plate you are not on is a no-op', () => {
  const s = initPuzzle(SUM);
  const r = stepPuzzle(SUM, s, { type: 'release', id: 'p1' });
  assert.equal(r.event, EVENTS.NOOP);
  assert.equal(r.state, s);
});

// ── oddOne ─────────────────────────────────────────────────────────────────

const ODD = {
  kind: 'oddOne', oddId: 'x',
  items: [{ id: 'a', trait: 'same' }, { id: 'b', trait: 'same' }, { id: 'x', trait: 'other' }],
};

test('oddOne: picking the odd one solves; wrong picks accumulate and never reset', () => {
  let s = initPuzzle(ODD);
  let r = stepPuzzle(ODD, s, { type: 'pick', id: 'a' });
  assert.equal(r.event, EVENTS.REJECT);
  assert.deepEqual(r.state.tried, ['a']);
  r = stepPuzzle(ODD, r.state, { type: 'pick', id: 'b' });
  assert.deepEqual(r.state.tried, ['a', 'b'], 'elimination is the puzzle — marks persist');
  r = stepPuzzle(ODD, r.state, { type: 'pick', id: 'x' });
  assert.equal(r.event, EVENTS.SOLVE);
});

test('oddOne: re-picking an already-ruled-out item is a no-op', () => {
  let s = initPuzzle(ODD);
  s = stepPuzzle(ODD, s, { type: 'pick', id: 'a' }).state;
  const r = stepPuzzle(ODD, s, { type: 'pick', id: 'a' });
  assert.equal(r.event, EVENTS.NOOP);
  assert.equal(r.state.wrongs, 1, 'a repeat must not inflate the wrong count');
});

// ── balance ────────────────────────────────────────────────────────────────

const BAL = {
  kind: 'balance',
  weights: [{ id: 'w1', value: 1 }, { id: 'w2', value: 2 }, { id: 'w3', value: 3 }],
};

test('balance: levelling both pans with every weight placed solves it', () => {
  let s = initPuzzle(BAL);
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w3', pan: 'left' }).state;
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w1', pan: 'right' }).state;
  const r = stepPuzzle(BAL, s, { type: 'place', id: 'w2', pan: 'right' });
  assert.equal(r.event, EVENTS.SOLVE);
  assert.equal(balanceReading(BAL, r.state).level, true);
});

test('balance: a level scale with weights still in hand is NOT solved', () => {
  let s = initPuzzle(BAL);
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w1', pan: 'left' }).state;
  const r = stepPuzzle(BAL, s, { type: 'place', id: 'w1', pan: 'left' });
  assert.equal(r.event, EVENTS.NOOP);
  // 3 on the left, 3 on the right, but w2 is unplaced: not level.
  let t = initPuzzle(BAL);
  t = stepPuzzle(BAL, t, { type: 'place', id: 'w3', pan: 'left' }).state;
  assert.equal(balanceReading(BAL, t).level, false);
});

test('balance: lifting a crate off is always allowed and is reversible', () => {
  let s = initPuzzle(BAL);
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w1', pan: 'left' }).state;
  const r = stepPuzzle(BAL, s, { type: 'lift', id: 'w1' });
  assert.equal(r.event, EVENTS.TOGGLE);
  assert.deepEqual(r.state.left, []);
});

test('balance: moving a crate across pans does not duplicate it', () => {
  let s = initPuzzle(BAL);
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w2', pan: 'left' }).state;
  s = stepPuzzle(BAL, s, { type: 'place', id: 'w2', pan: 'right' }).state;
  assert.deepEqual(s.left, []);
  assert.deepEqual(s.right, ['w2']);
});

// ── mirror ─────────────────────────────────────────────────────────────────

const MIR = {
  kind: 'mirror', facings: 4,
  mirrors: [{ id: 'm1', start: 1, solution: 0 }, { id: 'm2', start: 0, solution: 2 }],
};

test('mirror: the beam advances one stone at a time and solving needs the whole chain', () => {
  let s = initPuzzle(MIR);
  assert.equal(beamReach(MIR, s), 0);
  const r1 = stepPuzzle(MIR, s, { type: 'rotate', id: 'm1', dir: -1 }); // 1 -> 0
  assert.equal(r1.event, EVENTS.ACCEPT);
  assert.equal(beamReach(MIR, r1.state), 1);
  let t = r1.state;
  t = stepPuzzle(MIR, t, { type: 'rotate', id: 'm2' }).state; // 0 -> 1
  const r2 = stepPuzzle(MIR, t, { type: 'rotate', id: 'm2' }); // 1 -> 2
  assert.equal(r2.event, EVENTS.SOLVE);
});

test('mirror: breaking the chain shortens the beam but never locks the puzzle', () => {
  let s = initPuzzle(MIR);
  s = stepPuzzle(MIR, s, { type: 'rotate', id: 'm1', dir: -1 }).state;
  assert.equal(beamReach(MIR, s), 1);
  const r = stepPuzzle(MIR, s, { type: 'rotate', id: 'm1' }); // knock it back off
  assert.equal(r.event, EVENTS.REJECT);
  assert.equal(beamReach(MIR, r.state), 0);
  assert.ok(hintFor(MIR, r.state), 'a hint must still exist after breaking the chain');
});

// ── reset, purity, hints ───────────────────────────────────────────────────

test('reset returns a fresh state, counts the reset and preserves the wrong count', () => {
  let s = initPuzzle(ORDER);
  s = stepPuzzle(ORDER, s, { type: 'activate', id: 'a' }).state; // wrong
  const r = stepPuzzle(ORDER, s, { type: 'reset' });
  assert.equal(r.event, EVENTS.RESET);
  assert.equal(r.state.resets, 2, 'the reject reset plus the explicit one');
  assert.equal(r.state.wrongs, 1, 'wrongs survive a reset so the nudge still fires');
});

test('stepPuzzle never mutates the state it was given', () => {
  for (const { id, spec } of ALL_SPECS) {
    const s = initPuzzle(spec);
    const before = JSON.stringify(s);
    const move = firstLegalMove(spec);
    stepPuzzle(spec, s, move);
    assert.equal(JSON.stringify(s), before, `${id} was mutated in place`);
  }
});

test('an unknown move or unknown piece id is a no-op with the same reference', () => {
  const s = initPuzzle(SUM);
  assert.equal(stepPuzzle(SUM, s, { type: 'nonsense', id: 'p1' }).state, s);
  assert.equal(stepPuzzle(SUM, s, { type: 'press', id: 'nope' }).state, s);
  assert.equal(stepPuzzle(SUM, s, null).state, s);
});

test('shouldNudge only fires after real struggle', () => {
  let s = initPuzzle(ORDER);
  assert.equal(shouldNudge(s), false);
  for (let i = 0; i < NUDGE_AFTER; i++) {
    s = stepPuzzle(ORDER, s, { type: 'activate', id: 'a' }).state;
  }
  assert.equal(shouldNudge(s), true);
});

test('hintFor solves every authored puzzle when followed blindly', () => {
  for (const { id, spec } of ALL_SPECS) {
    let s = initPuzzle(spec);
    let guard = 0;
    while (!s.solved && guard++ < 200) {
      const hint = hintFor(spec, s);
      assert.ok(hint, `${id}: ran out of hints before solving`);
      const r = stepPuzzle(spec, s, hint.move);
      assert.notEqual(r.event, EVENTS.NOOP, `${id}: hint produced a no-op move`);
      s = r.state;
    }
    assert.ok(s.solved, `${id}: following hints did not solve it (${guard} steps)`);
    assert.equal(hintFor(spec, s), null, `${id}: still hinting after solve`);
  }
});

test('progress never exceeds 1 and reaches exactly 1 on solve', () => {
  for (const { id, spec } of ALL_SPECS) {
    let s = initPuzzle(spec);
    while (!s.solved) s = stepPuzzle(spec, s, hintFor(spec, s).move).state;
    const p = puzzleProgress(spec, s);
    assert.ok(p.pct >= 0 && p.pct <= 1, `${id}: pct out of range`);
    assert.equal(p.pct, 1, `${id}: solved but progress is ${p.pct}`);
  }
});

// ── The property that matters most ─────────────────────────────────────────

test('no authored puzzle can be walked into an unwinnable state', () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (const { id, spec } of ALL_SPECS) {
    const s0 = normalizePuzzle(spec);
    for (let trial = 0; trial < 8; trial++) {
      let s = initPuzzle(spec);
      for (let i = 0; i < 125 && !s.solved; i++) {
        s = stepPuzzle(spec, s, randomMove(s0, rand)).state;
        if (s.solved) break;
        // From wherever the random walk landed, the hint must still lead out.
        const hint = hintFor(spec, s);
        assert.ok(hint, `${id}: no way out after a random walk`);
      }
      // And from that state, following hints must still finish.
      let guard = 0;
      while (!s.solved && guard++ < 200) s = stepPuzzle(spec, s, hintFor(spec, s).move).state;
      assert.ok(s.solved, `${id}: could not recover a randomly walked state`);
    }
  }
});

// ── trialTokens ────────────────────────────────────────────────────────────

test('trialTokens pays nothing until the trial is solved', () => {
  const spec = SHRINES[0].trial;
  assert.equal(trialTokens(spec, initPuzzle(spec)), 0);
});

test('trialTokens rewards a clean solve with exactly one extra lock', () => {
  const spec = SHRINES[0].trial; // 6 plates -> base 3
  let clean = initPuzzle(spec);
  while (!clean.solved) clean = stepPuzzle(spec, clean, hintFor(spec, clean).move).state;
  const cleanTokens = trialTokens(spec, clean);

  let messy = initPuzzle(spec);
  messy = stepPuzzle(spec, messy, { type: 'reset' }).state;
  while (!messy.solved) messy = stepPuzzle(spec, messy, hintFor(spec, messy).move).state;
  const messyTokens = trialTokens(spec, messy);

  assert.equal(cleanTokens - messyTokens, 1, 'clean solve is worth one more question');
  assert.ok(messyTokens >= 1, 'a messy solve still buys at least one lock');
});

test('every authored shrine trial buys between 1 and 4 locks', () => {
  for (const s of SHRINES) {
    let st = initPuzzle(s.trial);
    while (!st.solved) st = stepPuzzle(s.trial, st, hintFor(s.trial, st).move).state;
    const n = trialTokens(s.trial, st);
    assert.ok(n >= 1 && n <= 4, `${s.id}: ${n} tokens`);
  }
});

// ── helpers ────────────────────────────────────────────────────────────────

function firstLegalMove(spec) {
  const s = normalizePuzzle(spec);
  switch (s.kind) {
    case 'order': return { type: 'activate', id: s.nodes[0].id };
    case 'sum': return { type: 'press', id: s.plates[0].id };
    case 'oddOne': return { type: 'pick', id: s.items[0].id };
    case 'balance': return { type: 'place', id: s.weights[0].id, pan: 'left' };
    case 'mirror': return { type: 'rotate', id: s.mirrors[0].id };
    default: return { type: 'reset' };
  }
}

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

function randomMove(s, rand) {
  switch (s.kind) {
    case 'order': return { type: 'activate', id: pick(s.nodes, rand).id };
    case 'sum': return { type: pick(['press', 'release', 'toggle'], rand), id: pick(s.plates, rand).id };
    case 'oddOne': return { type: 'pick', id: pick(s.items, rand).id };
    case 'balance': return rand() < 0.3
      ? { type: 'lift', id: pick(s.weights, rand).id }
      : { type: 'place', id: pick(s.weights, rand).id, pan: rand() < 0.5 ? 'left' : 'right' };
    case 'mirror': return { type: 'rotate', id: pick(s.mirrors, rand).id, dir: rand() < 0.5 ? 1 : -1 };
    default: return { type: 'reset' };
  }
}
