/**
 * progression.test.js — the growth beats, driven the way the game drives them.
 *
 * The suite that matters most here is "a clump reads as a list": five rewards
 * arriving in one frame is the normal case at the end of a floor, and the old
 * behaviour (five toasts on top of each other) is the bug this module exists
 * to fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { SFX, SFX_ALIASES } from '../systems/sfxLibrary.js';
import { BEATS, compile } from './cinematics.js';
import { PAPER } from '../config.js';
import {
  MOMENT, TIER, MOMENT_STYLE, MIN_GAP, REWARD_STAGGER,
  styleFor, momentTitle, momentLine, sortMoments,
  snapshotProgress, diffProgress, sweepProgress, ensureNudges, bondMoment,
  createMomentQueue, rewardFlight, rewardFlightDuration,
  evolutionCinematic, discoveryRankCinematic, floorCompleteSequence, stagedCinematic,
} from './progression.js';

const fresh = () => makeDefaultSave();

function withParty(save, party) {
  save.party = party.map((p) => ({ level: 1, xp: 0, ...p }));
  return save;
}

// ── The presentation table ──────────────────────────────────────────────────

test('every moment kind has a style row', () => {
  for (const kind of Object.values(MOMENT)) {
    assert.ok(MOMENT_STYLE[kind], `${kind} has no presentation`);
  }
});

test('every sfx key in the table actually exists in the library', () => {
  // A renamed recipe should break here, loudly, and not go silent in the game.
  for (const [kind, s] of Object.entries(MOMENT_STYLE)) {
    const ok = !!SFX[s.sfx] || !!SFX[SFX_ALIASES[s.sfx]];
    assert.ok(ok, `${kind} plays "${s.sfx}", which the library does not have`);
  }
});

test('every tint is a PAPER colour — art law', () => {
  const paper = new Set(Object.values(PAPER));
  for (const [kind, s] of Object.entries(MOMENT_STYLE)) {
    assert.ok(paper.has(s.tint), `${kind} is off-palette`);
  }
});

test('staged moments never punch the follow boom — the director owns the eye', () => {
  for (const s of Object.values(MOMENT_STYLE)) {
    if (s.tier !== TIER.STAGED) continue;
    assert.equal(s.beat.punch, 0);
    assert.equal(s.beat.shake, 0);
  }
});

test('the common moments are beats, the rare ones are staged', () => {
  // Letterboxing a level-up would make the game unplayable inside an hour.
  assert.equal(styleFor(MOMENT.LEVEL_UP).tier, TIER.BEAT);
  assert.equal(styleFor(MOMENT.BOND).tier, TIER.BEAT);
  assert.equal(styleFor(MOMENT.ACHIEVEMENT).tier, TIER.BEAT);
  assert.equal(styleFor(MOMENT.EVOLUTION).tier, TIER.STAGED);
  assert.equal(styleFor(MOMENT.FLOOR_COMPLETE).tier, TIER.STAGED);
});

test('an unknown kind falls back instead of throwing', () => {
  assert.ok(styleFor('nonsense'));
});

test('every kind has words', () => {
  for (const kind of Object.values(MOMENT)) {
    const m = { kind, name: 'Shadow', level: 4, rank: 'B', a: 'A', b: 'B', floorId: 1 };
    assert.ok(momentTitle(m).length > 0, `${kind} has no title`);
    assert.equal(typeof momentLine(m), 'string');
  }
});

// ── Detection ───────────────────────────────────────────────────────────────

test('a level-up is detected and named', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 3 }]);
  const before = snapshotProgress(save);
  save.party[0].level = 4;
  const got = diffProgress(before, snapshotProgress(save), save);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, MOMENT.LEVEL_UP);
  assert.equal(got[0].level, 4);
  assert.equal(got[0].name, 'Shadow');
});

test('an evolution is detected as its own, bigger moment', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 5 }]);
  const before = snapshotProgress(save);
  save.heroEvolution = { 'knight-shadow': { stage: 2, path: null } };
  const got = diffProgress(before, snapshotProgress(save), save);
  assert.equal(got[0].kind, MOMENT.EVOLUTION);
  assert.equal(got[0].stage, 2);
});

test('a bond rank crossing is detected, and a re-report is not', () => {
  const save = fresh();
  save.heroBonds = { 'knight-shadow|wizard-stargazer': { battles: 6, rank: 'C' } };
  const before = snapshotProgress(save);
  save.heroBonds['knight-shadow|wizard-stargazer'] = { battles: 16, rank: 'B' };
  const got = diffProgress(before, snapshotProgress(save), save);
  assert.equal(got.length, 1);
  assert.equal(got[0].rank, 'B');
  // Same snapshot twice: nothing new.
  const after = snapshotProgress(save);
  assert.equal(diffProgress(after, after, save).length, 0);
});

test('a rank cannot go backwards into a moment', () => {
  const save = fresh();
  save.heroBonds = { 'a|b': { battles: 40, rank: 'A' } };
  const before = snapshotProgress(save);
  save.heroBonds['a|b'] = { battles: 6, rank: 'C' };
  assert.equal(diffProgress(before, snapshotProgress(save), save).length, 0);
});

test('bondMoment reports only a genuine crossing', () => {
  const save = fresh();
  save.heroBonds = { [['knight-shadow', 'bunny-pepper'].sort().join('|')]: { battles: 16, rank: 'B' } };
  assert.ok(bondMoment(save, 'knight-shadow', 'bunny-pepper', 'C'));
  assert.equal(bondMoment(save, 'knight-shadow', 'bunny-pepper', 'B'), null);
  assert.equal(bondMoment(save, 'knight-shadow', 'bunny-pepper', 'S'), null);
});

test('the biggest thing that happened is offered first', () => {
  const list = sortMoments([
    { kind: MOMENT.QUEST },
    { kind: MOMENT.FLOOR_COMPLETE },
    { kind: MOMENT.LEVEL_UP },
    { kind: MOMENT.EVOLUTION },
  ]);
  assert.deepEqual(list.map((m) => m.kind), [
    MOMENT.FLOOR_COMPLETE, MOMENT.EVOLUTION, MOMENT.LEVEL_UP, MOMENT.QUEST,
  ]);
});

test('sorting is stable inside a rank, so two level-ups keep party order', () => {
  const list = sortMoments([
    { kind: MOMENT.LEVEL_UP, heroId: 'a' },
    { kind: MOMENT.LEVEL_UP, heroId: 'b' },
    { kind: MOMENT.LEVEL_UP, heroId: 'c' },
  ]);
  assert.deepEqual(list.map((m) => m.heroId), ['a', 'b', 'c']);
});

test('a snapshot of a fresh save is empty, not undefined', () => {
  const s = snapshotProgress(fresh());
  assert.deepEqual(s.heroes, {});
  assert.deepEqual(s.bonds, {});
  assert.deepEqual(s.achievements, []);
});

test('snapshotProgress survives a save with no party and no overworld', () => {
  const s = snapshotProgress({});
  assert.ok(s && s.heroes);
});

// ── The sweep ───────────────────────────────────────────────────────────────

test('the sweep grants achievements exactly once', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 1 }]);
  save.stats.totalBattles = 1;
  const first = sweepProgress(save);
  assert.ok(first.moments.some((m) => m.kind === MOMENT.ACHIEVEMENT && m.id === 'first_blood'));
  const second = sweepProgress(save, first.snapshot);
  assert.ok(!second.moments.some((m) => m.id === 'first_blood'), 'granted twice');
});

test('the sweep does not double-report an achievement through the diff', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 1 }]);
  save.stats.totalBattles = 1;
  save.stats.bestStreak = 8;
  const { moments } = sweepProgress(save);
  const ids = moments.filter((m) => m.kind === MOMENT.ACHIEVEMENT).map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'an achievement appeared twice');
});

test('the evolution nudge fires once per hero per stage', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 9 }]);
  save.floors.find((f) => f.id === 2).complete = true;
  const a = sweepProgress(save);
  const nudges = a.moments.filter((m) => m.kind === MOMENT.EVOLUTION_READY);
  assert.equal(nudges.length, 1, 'expected exactly one nudge');
  assert.equal(nudges[0].heroId, 'knight-shadow');
  const b = sweepProgress(save, a.snapshot);
  assert.equal(b.moments.filter((m) => m.kind === MOMENT.EVOLUTION_READY).length, 0);
});

test('the nudge ledger lives on the save and needs no migration', () => {
  const save = fresh();
  delete save.overworld;
  const list = ensureNudges(save);
  assert.ok(Array.isArray(list));
  assert.equal(ensureNudges(save), list, 'created twice');
});

test('the sweep never nudges a hero who cannot actually evolve', () => {
  const save = withParty(fresh(), [{ id: 'knight-shadow', level: 1 }]);
  const { moments } = sweepProgress(save);
  assert.equal(moments.filter((m) => m.kind === MOMENT.EVOLUTION_READY).length, 0);
});

// ── The queue ───────────────────────────────────────────────────────────────

test('a clump of five rewards is played as five, spaced out', () => {
  const beats = [];
  const q = createMomentQueue({ hooks: { onBeat: (m) => beats.push(m.kind) } });
  q.push([
    { kind: MOMENT.LEVEL_UP, name: 'A', level: 2 },
    { kind: MOMENT.BOND, rank: 'C', a: 'A', b: 'B' },
    { kind: MOMENT.ACHIEVEMENT, name: 'X' },
    { kind: MOMENT.QUEST },
    { kind: MOMENT.ABILITY_GATE, name: 'Door' },
  ]);
  // One per pump-with-gap; nothing doubles up inside a gap.
  q.pump(0);
  assert.equal(beats.length, 1);
  q.pump(0.01);
  assert.equal(beats.length, 1, 'two beats inside one gap');
  for (let i = 0; i < 8; i++) q.pump(MIN_GAP);
  assert.equal(beats.length, 5);
  assert.equal(q.pending, 0);
});

test('the queue plays the biggest thing first', () => {
  const beats = [];
  const q = createMomentQueue({ hooks: { onBeat: (m) => beats.push(m.kind) } });
  q.push({ kind: MOMENT.QUEST });
  q.push({ kind: MOMENT.ABILITY_GATE, name: 'Door' });
  q.pump(0);
  assert.equal(beats[0], MOMENT.ABILITY_GATE);
});

test('a staged moment holds the queue until the host says it is done', () => {
  const seen = [];
  const q = createMomentQueue({
    hooks: {
      onBeat: (m) => seen.push(['beat', m.kind]),
      onStaged: (m) => { seen.push(['staged', m.kind]); return true; },
    },
  });
  q.push([{ kind: MOMENT.EVOLUTION, heroId: 'h', stage: 2 }, { kind: MOMENT.LEVEL_UP, level: 3 }]);
  q.pump(0);
  assert.deepEqual(seen, [['staged', MOMENT.EVOLUTION]]);
  for (let i = 0; i < 5; i++) q.pump(1);
  assert.equal(seen.length, 1, 'the level-up jumped the cutscene');
  q.done();
  q.pump(MIN_GAP);
  assert.deepEqual(seen[1], ['beat', MOMENT.LEVEL_UP]);
});

test('a staged moment the host refuses degrades to a beat, never vanishes', () => {
  const seen = [];
  const q = createMomentQueue({
    hooks: {
      onBeat: (m) => seen.push(m.kind),
      onStaged: () => false,          // already seen, or no director
    },
  });
  q.push({ kind: MOMENT.EVOLUTION, heroId: 'h', stage: 2 });
  q.pump(0);
  assert.deepEqual(seen, [MOMENT.EVOLUTION]);
  assert.equal(q.busy, false);
});

test('a host with no hooks at all does not crash the queue', () => {
  const q = createMomentQueue({});
  q.push({ kind: MOMENT.LEVEL_UP });
  q.push({ kind: MOMENT.EVOLUTION });
  for (let i = 0; i < 6; i++) q.pump(1);
  assert.equal(q.pending, 0);
});

test('onIdle fires once when the queue drains, and not before', () => {
  let idle = 0;
  const q = createMomentQueue({ hooks: { onIdle: () => idle++ } });
  q.pump(1);
  assert.equal(idle, 0, 'an empty queue was never busy');
  q.push({ kind: MOMENT.QUEST });
  q.pump(0);
  assert.equal(idle, 0);
  q.pump(MIN_GAP);
  assert.equal(idle, 1);
  q.pump(MIN_GAP);
  assert.equal(idle, 1);
});

test('clear() drops everything, including a moment mid-flight', () => {
  const q = createMomentQueue({ hooks: { onStaged: () => true } });
  q.push([{ kind: MOMENT.EVOLUTION }, { kind: MOMENT.QUEST }]);
  q.pump(0);
  assert.ok(q.blocking);
  q.clear();
  assert.equal(q.busy, false);
  assert.equal(q.blocking, null);
});

test('garbage pushed into the queue is ignored, not queued', () => {
  const q = createMomentQueue({});
  assert.equal(q.push(null), 0);
  assert.equal(q.push([null, undefined, {}]), 0);
  assert.equal(q.pending, 0);
});

// ── The reward flight ───────────────────────────────────────────────────────

test('gold arrives as several coins, not one number', () => {
  const f = rewardFlight({ gold: 220 });
  const coins = f.filter((r) => r.kind === 'gold');
  assert.ok(coins.length > 1 && coins.length <= 11);
  assert.equal(coins.reduce((a, c) => a + c.amount, 0), 220, 'the coins must add up');
});

test('one gold is one coin', () => {
  assert.equal(rewardFlight({ gold: 1 }).length, 1);
});

test('the flight is ordered smallest kind to biggest and staggered in time', () => {
  const f = rewardFlight({ gold: 100, xp: 40, potions: 1, heroId: 'bunny-nova' });
  assert.equal(f[0].kind, 'potion');
  assert.equal(f[1].kind, 'xp');
  assert.equal(f.at(-1).kind, 'hero');
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].at > f[i - 1].at, 'two rewards fly at once');
  }
  assert.ok(Math.abs(f[1].at - f[0].at - REWARD_STAGGER) < 1e-9);
});

test('an empty reward set flies nothing and takes no time', () => {
  const f = rewardFlight({});
  assert.equal(f.length, 0);
  assert.equal(rewardFlightDuration(f), 0);
});

test('every flown reward carries a PAPER tint', () => {
  const paper = new Set(Object.values(PAPER));
  for (const r of rewardFlight({ gold: 50, xp: 10, potions: 2, heroId: 'x' })) {
    assert.ok(paper.has(r.tint));
  }
});

// ── The sequences ───────────────────────────────────────────────────────────

const BEAT_SET = new Set(BEATS);

function assertCompiles(seq) {
  for (const step of seq.steps) {
    const list = Array.isArray(step) ? step : [step];
    for (const b of list) assert.ok(BEAT_SET.has(b.t), `unknown beat type "${b.t}"`);
  }
  const c = compile(seq);
  assert.ok(c.steps.length > 0, 'compiled to nothing');
  return c;
}

test('the floor-complete sequence compiles under the real cinematics compiler', () => {
  const seq = floorCompleteSequence({
    floorId: 3, at: { x: 4, y: 1, z: -2 }, rewards: { gold: 180, xp: 90, potions: 1 },
  });
  assertCompiles(seq);
});

test('the floor-complete sequence runs rewards, then transform, then stamp', () => {
  const order = [];
  const seq = floorCompleteSequence({
    floorId: 1,
    rewards: { gold: 100 },
    onRewards: () => order.push('rewards'),
    onTransform: () => order.push('transform'),
    onStamp: () => order.push('stamp'),
  });
  // Fire every 'do' in authored order — that IS the sequence's contract.
  for (const step of seq.steps) {
    const list = Array.isArray(step) ? step : [step];
    for (const b of list) if (b.t === 'do') b.run();
  }
  assert.deepEqual(order, ['rewards', 'transform', 'stamp']);
});

test('the stamp beat carries the word COMPLETE', () => {
  const seq = floorCompleteSequence({ floorId: 2, title: 'Tidepool Ruins' });
  const cards = seq.steps.flatMap((s) => (Array.isArray(s) ? s : [s])).filter((b) => b.t === 'card');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, 'complete');
  assert.equal(cards[0].title, 'Tidepool Ruins');
});

test('a floor with no rewards and no transform still stamps', () => {
  const seq = floorCompleteSequence({ floorId: 9 });
  assertCompiles(seq);
  const cards = seq.steps.flatMap((s) => (Array.isArray(s) ? s : [s])).filter((b) => b.t === 'card');
  assert.equal(cards.length, 1);
});

test('the letterbox that goes on always comes back off', () => {
  for (const seq of [
    floorCompleteSequence({ floorId: 1, rewards: { gold: 20 } }),
    floorCompleteSequence({ floorId: 1 }),
    evolutionCinematic({ kind: MOMENT.EVOLUTION, heroId: 'h', stage: 2, name: 'X' }, {}),
    discoveryRankCinematic({ kind: MOMENT.DISCOVERY_RANK, name: 'Pathfinder' }, {}),
  ]) {
    const boxes = seq.steps
      .flatMap((s) => (Array.isArray(s) ? s : [s]))
      .filter((b) => b.t === 'letterbox');
    assert.equal(boxes.at(0).on, true);
    assert.equal(boxes.at(-1).on, false, `${seq.id} leaves the bars closed`);
  }
});

test('the evolution cinematic swaps the rig on camera, not before', () => {
  let swapped = false;
  const seq = evolutionCinematic(
    { kind: MOMENT.EVOLUTION, heroId: 'knight-shadow', stage: 2, name: 'Shadow Knight' },
    { at: { x: 1, y: 0, z: 2 }, onEvolve: () => { swapped = true; } },
  );
  assertCompiles(seq);
  // The swap must not be in the first step — the camera has to arrive first.
  const first = seq.steps[0];
  assert.ok(!first.some((b) => b.t === 'do'), 'the hero changed before we looked at them');
  for (const b of seq.steps[1]) if (b.t === 'do') b.run();
  assert.ok(swapped);
});

test('stagedCinematic returns a sequence for staged kinds and null otherwise', () => {
  assert.ok(stagedCinematic({ kind: MOMENT.EVOLUTION, heroId: 'h', stage: 2, name: 'x' }));
  assert.ok(stagedCinematic({ kind: MOMENT.FLOOR_COMPLETE, floorId: 1 }));
  assert.equal(stagedCinematic({ kind: MOMENT.LEVEL_UP }), null);
});

test('a staged sequence never leaves the player locked out', () => {
  // compile() is what the director runs; a sequence with zero duration would
  // lock input and never release it.
  const c = compile(floorCompleteSequence({ floorId: 4, rewards: { gold: 60 } }));
  assert.ok(c.steps.every((s) => s.dur >= 0));
  assert.ok(c.steps.reduce((a, s) => a + s.dur, 0) > 0);
});
