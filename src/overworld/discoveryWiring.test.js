/**
 * discoveryWiring.test.js — the assembled runtime, driven like the game drives it.
 *
 * The unit suites prove each part works. This one proves the ASSEMBLY works:
 * that walking the player's position into a grotto fires the host's hook with a
 * reward attached, that the compass re-aims on its own timer, and that a full
 * shrine can be run end to end through the runtime's own surface without the
 * host ever importing puzzles.js or discoverySpec.js.
 *
 * This is the suite that would have caught "the module is written but nothing
 * calls it": if the runtime cannot be driven from position + dt alone, the host
 * cannot wire it in two lines, and it will not get wired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { generateRatedQuestion } from '../systems/math.js';
import { DISCOVERIES, GROTTOS, SHRINES, STORY_PAGES } from './discoverySpec.js';
import { hintFor } from './puzzles.js';
import { PHASES } from './shrines.js';
import { createDiscoveryRuntime } from './discoveryWiring.js';

const fresh = () => makeDefaultSave();

test('the runtime builds on a save that has never seen discovery', () => {
  const save = fresh();
  delete save.overworld;
  const rt = createDiscoveryRuntime({ save });
  assert.equal(rt.progress().done, 0);
  assert.ok(save.overworld.discovery, 'the container must be created eagerly');
});

test('walking into a grotto fires onDiscovery with its reward', () => {
  const save = fresh();
  const events = [];
  const rt = createDiscoveryRuntime({ save, hooks: { onDiscovery: (e) => events.push(e) } });
  const g = GROTTOS[0];

  rt.update(g.at.x + 500, g.at.z, 0.016);
  assert.equal(events.length, 0, 'nothing should fire from across the island');

  const found = rt.update(g.at.x, g.at.z, 0.016);
  assert.equal(found, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'grotto');
  assert.equal(events[0].record.id, g.id);
  assert.ok(events[0].reward.granted);
  assert.ok(save.gold > 0);
});

test('standing in a grotto for many frames fires exactly once', () => {
  const save = fresh();
  const events = [];
  const rt = createDiscoveryRuntime({ save, hooks: { onDiscovery: (e) => events.push(e) } });
  const g = GROTTOS[1];
  for (let i = 0; i < 120; i++) rt.update(g.at.x, g.at.z, 0.016);
  assert.equal(events.length, 1, 'the discovery beat repeated');
  const gold = save.gold;
  for (let i = 0; i < 60; i++) rt.update(g.at.x, g.at.z, 0.016);
  assert.equal(save.gold, gold);
});

test('the progress hook fires only when the meter actually moves', () => {
  const save = fresh();
  const moves = [];
  const rt = createDiscoveryRuntime({ save, hooks: { onProgress: (p) => moves.push(p.done) } });
  const g = GROTTOS[2];
  for (let i = 0; i < 30; i++) rt.update(0, 0, 0.016);
  assert.equal(moves.length, 0);
  rt.update(g.at.x, g.at.z, 0.016);
  assert.equal(moves.length, 1);
  assert.equal(moves[0], 1);
});

test('the compass re-aims on its own timer, not every frame', () => {
  const save = fresh();
  const aims = [];
  const rt = createDiscoveryRuntime({ save, hooks: { onCompass: (h) => aims.push(h) } });
  const shrine = SHRINES[0];
  // Sit still, well away from anything hidden, for one simulated second.
  for (let i = 0; i < 60; i++) rt.update(shrine.at.x + 40, shrine.at.z, 1 / 60);
  assert.ok(aims.length >= 1, 'the compass never aimed');
  assert.ok(aims.length <= 10, `the compass re-aimed ${aims.length} times in a second`);
  assert.ok(aims[0], 'there is content to point at');
});

test('a page pickup reaches the journal through the runtime', () => {
  const save = fresh();
  const rt = createDiscoveryRuntime({ save });
  const page = STORY_PAGES[0];
  rt.update(page.at.x, page.at.z, 0.016);
  const pages = rt.pages();
  assert.equal(pages.found, 1);
  assert.equal(rt.journal().find((p) => p.id === page.id).found, true);
  assert.ok(rt.closingLine().length > 0);
});

test('a whole shrine runs end to end through the runtime surface alone', () => {
  const save = fresh();
  const rt = createDiscoveryRuntime({ save });
  const rec = SHRINES.find((s) => s.floorId === 1);

  const session = rt.beginShrine(rec.id);
  assert.equal(session.phase, PHASES.TRIAL);

  // The physical half. The host drives it with moves, nothing else.
  let guard = 0;
  while (rt.session.phase === PHASES.TRIAL && guard++ < 100) {
    const hint = hintFor(rt.session.trialSpec, rt.session.trial);
    rt.shrineMove(hint.move);
  }
  assert.equal(rt.session.phase, PHASES.LOCKS);
  assert.ok(rt.session.tokens >= 1);

  // The maths half, with the REAL shared generator.
  guard = 0;
  let payout = null;
  while (!payout && guard++ < 20) {
    const q = rt.shrineAsk({ generate: generateRatedQuestion, grade: 3 });
    assert.ok(q, 'the shrine stopped asking before it was finished');
    const res = rt.shrineAnswer(q.answer);
    if (res.payout) payout = res.payout;
  }
  assert.ok(payout && payout.granted, 'the shrine never paid');
  assert.ok(save.gold > 0);
  assert.equal(rt.buff('climbStamina') > 0, true, 'the permanent buff is readable through the runtime');
  assert.equal(rt.progress().byKind.shrine.done, 1);
});

test('solving a landmark puzzle pays once through the runtime', () => {
  const save = fresh();
  const rt = createDiscoveryRuntime({ save });
  const first = rt.solveLandmark('puz-garden-plates');
  assert.equal(first.granted, true);
  const gold = save.gold;
  const second = rt.solveLandmark('puz-garden-plates');
  assert.equal(second.already, true);
  assert.equal(save.gold, gold);
});

test('the map stays empty until something is found', () => {
  const save = fresh();
  const rt = createDiscoveryRuntime({ save });
  assert.deepEqual(rt.markers(), []);
  const g = GROTTOS[3];
  rt.update(g.at.x, g.at.z, 0.016);
  assert.equal(rt.markers().length, 1);
});

test('a full sweep of the island reaches 100 per cent and stops firing', () => {
  const save = fresh();
  let discoveries = 0;
  const rt = createDiscoveryRuntime({ save, hooks: { onDiscovery: () => discoveries++ } });
  for (const d of DISCOVERIES) {
    rt.update(d.x, d.z, 0.016);
    if (d.kind === 'shrine' || d.kind === 'puzzle') rt.solveLandmark(d.id);
  }
  assert.equal(discoveries, DISCOVERIES.length, 'something on the island never triggered');
  assert.equal(rt.progress().pct, 1);
  assert.equal(rt.progress().rank.id, 'papermind');
  assert.equal(rt.compass(0, 0), null, 'a finished island still points somewhere');
  assert.deepEqual(rt.sweepMilestones(), [], 'a finished island still owes a milestone');
});

test('the runtime never throws on a hostile save', () => {
  for (const junk of [{}, { overworld: null }, { overworld: [] }, { overworld: { discovery: 'nope' } }]) {
    const rt = createDiscoveryRuntime({ save: junk });
    assert.doesNotThrow(() => {
      rt.update(0, 0, 0.016);
      rt.progress();
      rt.markers();
      rt.pages();
      rt.compass(0, 0);
    });
  }
});

test('hooks are optional — a host can wire the runtime and add them later', () => {
  const save = fresh();
  const rt = createDiscoveryRuntime({ save });
  const g = GROTTOS[4];
  assert.doesNotThrow(() => rt.update(g.at.x, g.at.z, 0.016));
  assert.equal(rt.progress().done, 1);
});
