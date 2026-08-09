/**
 * abilityWiring.test.js — the ASSEMBLY, driven the way index.js drives it.
 *
 * The unit suites prove each part works. This one proves the parts are
 * REACHABLE FROM ONE CALL: that a host with a save, a heightfield and a stub
 * physics handle can shove a crate, swap a hero, level one up, walk into a
 * vista and finish a floor without ever importing abilities.js, progression.js
 * or rewardCadence.js itself.
 *
 * This is the suite that would have caught the failure this project keeps
 * repeating. If the runtime cannot be driven from (dt, player) plus a handful
 * of button calls, it will not get wired, and everything above it is dead code
 * with good tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { SFX, SFX_ALIASES } from '../systems/sfxLibrary.js';
import { createHeightfield } from './heightfield.js';
import { WORLD, PORTALS, COLLECTIBLES } from './worldSpec.js';
import { FIELD_ABILITIES, ABILITY_GATES, SWAP_LOCKOUT, gateById } from './abilities.js';
import { MOMENT } from './progression.js';
import { CADENCE_FILLS, CADENCE_COLLECTIBLES, fillsOfKind } from './rewardCadence.js';
import {
  ABILITY_SFX, BLOCKED_HINT,
  createAbilityRuntime, installAbilityFx, abilityFxInstalled, auditWorld,
} from './abilityWiring.js';

// ── A host, in about thirty lines — which is the claim being tested ─────────

const PARTY = [
  { id: 'knight-shadow', name: 'Shadow', cls: 'knight', level: 3, xp: 200 },
  { id: 'wizard-stargazer', name: 'Stargazer', cls: 'wizard', level: 2, xp: 100 },
  { id: 'bunny-pepper', name: 'Pepper', cls: 'bunny', level: 4, xp: 340 },
];

function stubPhysics(bodies = []) {
  const XFORM_STRIDE = 7;
  const xforms = new Float32Array(bodies.length * XFORM_STRIDE);
  const recs = bodies.map((b, i) => {
    const o = i * XFORM_STRIDE;
    xforms[o] = b.x; xforms[o + 1] = b.y; xforms[o + 2] = b.z; xforms[o + 6] = 1;
    return { id: b.id, kind: b.kind, slot: i, mass: b.mass, volume: b.volume };
  });
  const log = { impulse: [], teleport: [] };
  return {
    xforms, XFORM_STRIDE, log, recs,
    forEach(fn) { for (const r of recs) fn(r); },
    impulse(id, ix, iy, iz) { log.impulse.push({ id, ix, iy, iz }); return true; },
    teleport(id, x, y, z) {
      log.teleport.push({ id, x, y, z });
      const i = recs.findIndex((r) => r.id === id);
      if (i < 0) return false;
      const o = i * XFORM_STRIDE;
      xforms[o] = x; xforms[o + 1] = y; xforms[o + 2] = z;
      return true;
    },
  };
}

/** physicsProps' real numbers: crate 0.55 density, kerbstone 2.40. */
const CRATE = (id, x, z) => ({ id, kind: 'crate', x, y: 0.47, z, mass: 0.401, volume: 0.729 });
const STONE = (id, x, z) => ({ id, kind: 'stone', x, y: 0.26, z, mass: 0.415, volume: 0.173 });

function makePlayer(over = {}) {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true, ...over };
}

function host(opts = {}) {
  const save = makeDefaultSave();
  save.party = PARTY.map((p) => ({ ...p }));
  const events = { ability: [], swap: [], moment: [], staged: [], sound: [], gate: [], beat: [], vista: [], coin: [], blocked: [] };
  const rt = createAbilityRuntime({
    save,
    fx: false,
    groundAt: () => 0,
    hooks: {
      onAbility: (e) => events.ability.push({ ...e }),
      onSwap: (e) => events.swap.push(e),
      onMoment: (m) => events.moment.push(m),
      onStaged: (m) => { events.staged.push(m); return true; },
      onSound: (k) => events.sound.push(k),
      onGate: (g, can, who) => events.gate.push({ g, can, who }),
      onCameraBeat: (b) => events.beat.push(b),
      onVista: (f, p) => events.vista.push({ f, p }),
      onCoin: (c) => events.coin.push(c),
      onBlocked: (r, hint) => events.blocked.push({ r, hint }),
    },
    ...opts,
  });
  return { save, rt, events };
}

// ── It builds, from nothing ─────────────────────────────────────────────────

test('the runtime builds with no save, no physics, no heightfield and no hooks', () => {
  const rt = createAbilityRuntime({ fx: false });
  rt.update(1 / 60, makePlayer());
  rt.draw(1 / 60, 0);
  assert.equal(rt.group, null);
  rt.dispose();
});

test('the runtime builds on a save that has never seen the overworld', () => {
  const save = makeDefaultSave();
  delete save.overworld;
  const rt = createAbilityRuntime({ save, fx: false });
  rt.update(1 / 60, makePlayer());
  assert.ok(save.overworld, 'the ledgers must be created eagerly');
  rt.dispose();
});

test('it starts pointed at the first hero in the party', () => {
  const { rt } = host();
  assert.equal(rt.activeHero().id, 'knight-shadow');
  assert.equal(rt.chip().verb, 'SHOVE');
});

test('the FX layer is optional and its absence is not an error', () => {
  const { rt } = host();
  assert.equal(rt.group, null);
  assert.equal(rt.fx, null);
  // installAbilityFx has not been called in this process, and nothing broke.
  assert.equal(abilityFxInstalled(), false);
  rt.dispose();
});

test('asking for FX without installing a renderer fails loudly, not silently', () => {
  assert.throws(() => createAbilityRuntime({ fx: true }), /abilityFx not installed/);
});

// ── The verbs, through the assembly ─────────────────────────────────────────

test('a knight shoves a real kerbstone through the physics handle', () => {
  const physics = stubPhysics([STONE('s1', 0, 2)]);
  const { rt, events } = host({ physics });
  const p = makePlayer();

  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(1 / 60, p);
  assert.equal(physics.log.impulse.length, 0, 'the shove landed on the press frame');
  rt.update(FIELD_ABILITIES.knight.windup, p);

  assert.equal(physics.log.impulse.length, 1);
  assert.equal(physics.log.impulse[0].id, 's1');
  assert.ok(events.ability.some((e) => e.type === 'shove'));
  // ...and it made a noise.
  assert.ok(events.sound.includes(ABILITY_SFX.shove));
});

test('the shove derives density from the engine record, so heavy means heavy', () => {
  const physics = stubPhysics([STONE('s1', 0, 2)]);
  const { rt } = host({ physics });
  const p = makePlayer();
  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(0, p);
  rt.update(FIELD_ABILITIES.knight.windup, p);
  const imp = physics.log.impulse[0];
  // mass 0.415 x dv 12 = 4.98 N.s, well under the panic guard.
  assert.ok(Math.abs(Math.hypot(imp.ix, imp.iz) - 0.415 * FIELD_ABILITIES.knight.dv) < 1e-4);
});

test('a wizard lifts a crate through the same handle', () => {
  const physics = stubPhysics([CRATE('c1', 0, 2)]);
  const { rt } = host({ physics });
  rt.swapTo('wizard');
  assert.equal(rt.chip().verb, 'LIFT');

  const p = makePlayer();
  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(0, p);
  rt.update(FIELD_ABILITIES.wizard.windup, p);
  for (let i = 0; i < 90; i++) rt.update(1 / 60, p);

  assert.ok(physics.log.teleport.length > 30, 'the crate was never carried');
  const last = physics.log.teleport.at(-1);
  assert.ok(Math.abs(last.z - FIELD_ABILITIES.wizard.carryDist) < 0.1);
  assert.ok(Math.abs(last.y - FIELD_ABILITIES.wizard.carryHeight) < 0.1);
});

test('a bunny gets the second hop through the assembly, and nobody else does', () => {
  const { save, rt } = host();
  const air = makePlayer({ grounded: false });
  const ground = makePlayer();

  // Knight, in the air: no hop.
  rt.update(1 / 60, ground);
  rt.update(1 / 60, air);
  assert.equal(rt.jump(air), 0);

  rt.swapTo('bunny');
  rt.update(1 / 60, ground);
  rt.update(1 / 60, air);
  assert.equal(rt.jump(air), FIELD_ABILITIES.bunny.hopV);
  assert.equal(rt.jump(air), 0, 'one hop only');
});

test('a press with nothing in front produces a hint the HUD can print', () => {
  const { rt, events } = host({ physics: stubPhysics([]) });
  const p = makePlayer();
  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(1 / 60, p);
  assert.equal(events.blocked.length, 1);
  assert.ok(events.blocked[0].hint.length > 0, 'a refusal with no words is a bug report');
});

test('every sound this layer asks for exists in the library', () => {
  for (const [event, key] of Object.entries(ABILITY_SFX)) {
    assert.ok(SFX[key] || SFX[SFX_ALIASES[key]], `${event} plays "${key}", which is silence`);
  }
});

test('every blocked reason has a hint', () => {
  for (const [reason, hint] of Object.entries(BLOCKED_HINT)) {
    assert.equal(typeof hint, 'string', `${reason} has no words`);
  }
});

// ── Switching, through the assembly ─────────────────────────────────────────

test('swapping changes the verb and tells the host to swap the rig', () => {
  const { rt, events } = host();
  assert.equal(rt.chip().verb, 'SHOVE');
  rt.swapNext();
  assert.equal(rt.chip().verb, 'LIFT');
  assert.equal(events.swap.length, 1);
  assert.equal(events.swap[0].to.id, 'wizard-stargazer');
  assert.equal(events.swap[0].ability.id, 'levitate');
});

test('swapping mid-carry puts the crate down', () => {
  const physics = stubPhysics([CRATE('c1', 0, 2)]);
  const { rt } = host({ physics });
  rt.swapTo('wizard');
  const p = makePlayer();
  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(0, p);
  rt.update(FIELD_ABILITIES.wizard.windup, p);
  assert.equal(rt.stats().carrying, 'c1');

  // Inside the swap lockout the ring refuses, and a refused swap must not
  // drop the crate — a half-applied swap is how a body ends up frozen in mid
  // air with nobody holding it.
  assert.equal(rt.swapNext(), null);
  assert.equal(rt.stats().carrying, 'c1');

  rt.update(SWAP_LOCKOUT + 0.01, p);
  assert.ok(rt.swapNext());
  assert.equal(rt.stats().carrying, null);
});

test('a locked world refuses swaps and verbs, and does not throw', () => {
  let locked = true;
  const physics = stubPhysics([STONE('s1', 0, 2)]);
  const { rt } = host({ physics, gate: () => !locked });
  const p = makePlayer();
  rt.update(1 / 60, p);
  assert.equal(rt.swapNext(), null);
  rt.pressAbility();
  rt.update(1 / 60, p);
  assert.equal(physics.log.impulse.length, 0);
  locked = false;
  rt.update(1 / 60, p);
  assert.ok(rt.swapNext());
});

test('refreshParty keeps you as whoever you were, and re-arms the verb', () => {
  const { save, rt } = host();
  rt.swapTo('bunny');
  assert.equal(rt.chip().verb, 'HOP');
  save.party = [PARTY[1], PARTY[2]];          // the knight left the party
  rt.refreshParty();
  assert.equal(rt.activeHero().id, 'bunny-pepper');
  assert.equal(rt.chip().verb, 'HOP');
  save.party = [PARTY[0], PARTY[1]];          // ...and now so has the bunny
  rt.refreshParty();
  assert.equal(rt.activeHero().id, 'knight-shadow');
  assert.equal(rt.chip().verb, 'SHOVE');
});

test('the HUD can render the whole party ring from one call', () => {
  const { rt } = host();
  const chips = rt.chips();
  assert.equal(chips.length, 3);
  assert.equal(chips.filter((c) => c.active).length, 1);
  assert.deepEqual(chips.map((c) => c.verb), ['SHOVE', 'LIFT', 'HOP']);
});

// ── Gates ───────────────────────────────────────────────────────────────────

test('standing at a gate tells the host who can open it', () => {
  const { rt, events } = host();
  const g = gateById('gate-market-stack');
  rt.update(1 / 60, makePlayer({ pos: { x: g.at.x, y: 0, z: g.at.z } }));
  assert.equal(events.gate.length, 1);
  assert.equal(events.gate[0].g.id, g.id);
  assert.equal(events.gate[0].can, true);
  assert.equal(events.gate[0].who.cls, 'wizard');
});

test('a party without the right class is told so', () => {
  const { save, rt, events } = host();
  save.party = [PARTY[0]];                       // knights only
  rt.refreshParty();
  const g = gateById('gate-market-stack');
  rt.update(1 / 60, makePlayer({ pos: { x: g.at.x, y: 0, z: g.at.z } }));
  assert.equal(events.gate[0].can, false);
  assert.equal(events.gate[0].who, null);
});

test('the gate prompt fires on change, not every frame', () => {
  const { rt, events } = host();
  const g = ABILITY_GATES[0];
  const at = makePlayer({ pos: { x: g.at.x, y: 0, z: g.at.z } });
  for (let i = 0; i < 40; i++) rt.update(1 / 60, at);
  assert.equal(events.gate.length, 1);
  for (let i = 0; i < 10; i++) rt.update(1 / 60, makePlayer({ pos: { x: 9999, y: 0, z: 0 } }));
  assert.equal(events.gate.length, 2);
  assert.equal(events.gate[1].g, null);
});

test('clearing the reach gate by jumping high enough fires the beat', () => {
  const { rt, events } = host();
  const g = gateById('gate-garden-perch');
  const low = makePlayer({ pos: { x: g.at.x, y: 1.0, z: g.at.z }, groundY: 0 });
  const high = makePlayer({ pos: { x: g.at.x, y: g.standHeight + 0.2, z: g.at.z }, groundY: 0 });
  rt.update(1 / 60, low);
  assert.equal(events.moment.length, 0);
  rt.update(1 / 60, high);
  for (let i = 0; i < 8; i++) rt.update(0.6, low);
  const gates = events.moment.filter((m) => m.kind === MOMENT.ABILITY_GATE);
  assert.equal(gates.length, 1);
  assert.equal(gates[0].id, g.id);
  // ...and it does not fire again on the next hop.
  rt.update(1 / 60, high);
  for (let i = 0; i < 4; i++) rt.update(0.6, low);
  assert.equal(events.moment.filter((m) => m.kind === MOMENT.ABILITY_GATE).length, 1);
});

test('a solved physics puzzle turns into the same gate beat', () => {
  const { rt, events } = host();
  const p = makePlayer();
  assert.equal(rt.notePuzzlesSolved(['phz-market-stack']), 1);
  assert.equal(rt.notePuzzlesSolved(['phz-market-stack']), 0, 'solved twice');
  assert.equal(rt.notePuzzlesSolved(['phz-something-else']), 0);
  for (let i = 0; i < 4; i++) rt.update(0.6, p);
  assert.ok(events.moment.some((m) => m.kind === MOMENT.ABILITY_GATE));
});

test('gateAudit is reachable from the runtime, for the map screen', () => {
  const { save, rt } = host();
  assert.equal(rt.gateAudit().complete, true);
  save.party = [PARTY[0]];
  rt.refreshParty();
  assert.equal(rt.gateAudit().shut.length, 2);
});

// ── Progression, through the assembly ───────────────────────────────────────

test('a level-up between sweeps becomes a beat, with a camera punch', () => {
  const { save, rt, events } = host();
  rt.sweep();                                  // baseline
  events.moment.length = 0;
  events.beat.length = 0;
  save.party[0].level = 4;
  const got = rt.sweep();
  assert.ok(got.some((m) => m.kind === MOMENT.LEVEL_UP));
  const p = makePlayer();
  for (let i = 0; i < 10; i++) rt.update(0.6, p);
  assert.ok(events.moment.some((m) => m.kind === MOMENT.LEVEL_UP));
  assert.ok(events.beat.length > 0, 'a level-up that the camera ignores is a toast');
});

test('an evolution goes to the cinematic director, not to a toast', () => {
  const { save, rt, events } = host();
  rt.sweep();
  save.heroEvolution = { 'knight-shadow': { stage: 2, path: null } };
  rt.sweep();
  const p = makePlayer();
  for (let i = 0; i < 4; i++) rt.update(0.6, p);
  assert.ok(events.staged.some((m) => m.kind === MOMENT.EVOLUTION));
  // ...and it holds the queue until the director reports back.
  const before = events.moment.length;
  for (let i = 0; i < 10; i++) rt.update(0.6, p);
  assert.equal(events.moment.length, before);
  rt.stagedDone();
  for (let i = 0; i < 10; i++) rt.update(0.6, p);
});

test('cinematicFor hands back a playable sequence anchored where the player is', () => {
  const { rt } = host();
  rt.update(1 / 60, makePlayer({ pos: { x: 12, y: 3, z: -4 } }));
  const seq = rt.cinematicFor({ kind: MOMENT.EVOLUTION, heroId: 'knight-shadow', stage: 2, name: 'X' });
  assert.ok(seq && seq.steps.length > 0);
  const cam = seq.steps[0].find((b) => b.t === 'camera');
  assert.ok(Math.abs(cam.to.look.x - 12) < 1e-9, 'the shot is not where the hero is');
});

test('a clump of rewards is paced, not dumped', () => {
  const { save, rt, events } = host();
  rt.sweep();
  save.party[0].level = 5;
  save.party[1].level = 4;
  save.stats.totalBattles = 1;
  save.stats.bestStreak = 8;
  rt.sweep();
  const p = makePlayer();
  rt.update(0, p);
  assert.equal(events.moment.length, 1, 'the whole clump fired in one frame');
  for (let i = 0; i < 12; i++) rt.update(0.6, p);
  assert.ok(events.moment.length >= 4);
});

// ── Finishing a floor ───────────────────────────────────────────────────────

test('floorComplete returns a sequence that runs rewards, transform, stamp', () => {
  const { rt } = host();
  rt.update(1 / 60, makePlayer());
  const order = [];
  const seq = rt.floorComplete({
    floorId: 3,
    at: { x: 5, y: 1, z: 5 },
    rewards: { gold: 180, xp: 90, potions: 1 },
    title: 'The Shattered Sky',
    onTransform: () => order.push('transform'),
    onStamp: () => order.push('stamp'),
  });
  for (const step of seq.steps) {
    const list = Array.isArray(step) ? step : [step];
    for (const b of list) if (b.t === 'do') b.run();
  }
  assert.deepEqual(order, ['transform', 'stamp']);
  const card = seq.steps.flat().find((b) => b && b.t === 'card');
  assert.equal(card.kind, 'complete');
  assert.equal(card.title, 'The Shattered Sky');
});

test('floorComplete works with no rewards and no FX', () => {
  const { rt } = host();
  const seq = rt.floorComplete({ floorId: 9 });
  assert.ok(seq.steps.length > 0);
});

// ── The cadence layer, through the assembly ─────────────────────────────────

test('walking to a vista fires it once, through the runtime', () => {
  const { rt, events } = host();
  const v = fillsOfKind('vista')[0];
  rt.update(1, makePlayer({ pos: { x: v.at.x, y: 0, z: v.at.z } }));
  assert.equal(events.vista.length, 1);
  assert.equal(events.vista[0].p.gold > 0, true);
  for (let i = 0; i < 20; i++) rt.update(1, makePlayer({ pos: { x: v.at.x, y: 0, z: v.at.z } }));
  assert.equal(events.vista.length, 1);
});

test('walking over a trail coin pays out through the runtime', () => {
  const { rt, events } = host();
  const trail = fillsOfKind('trail')[0];
  const first = CADENCE_COLLECTIBLES.find((k) => k.trail === trail.id);
  rt.update(1 / 60, makePlayer({ pos: { x: first.x, y: 0, z: first.z } }));
  assert.equal(events.coin.length, 1);
  assert.equal(events.coin[0].id, first.id);
  assert.equal(events.coin[0].amount > 0, true);
});

test('cadence progress is readable from the runtime', () => {
  const { rt } = host();
  assert.equal(rt.cadenceProgress(), 0);
  for (const f of CADENCE_FILLS) {
    if (!f.once) continue;
    rt.update(1, makePlayer({ pos: { x: f.at.x + 900, y: 0, z: f.at.z } }));
    rt.update(1, makePlayer({ pos: { x: f.at.x, y: 0, z: f.at.z } }));
  }
  assert.equal(rt.cadenceProgress(), 1);
});

// ── The audit, through the assembly ─────────────────────────────────────────

test('auditWorld runs off a heightfield and the specs the host has', () => {
  const hf = createHeightfield(WORLD.SEED);
  const r = auditWorld({ heightfield: hf, specs: { portals: PORTALS, collectibles: COLLECTIBLES } });
  assert.ok(r.cells > 3000);
  assert.ok(r.deadFraction > 0 && r.deadFraction <= 1);
  assert.ok(r.bands.length > 5);
});

test('auditWorld refuses to guess at the terrain', () => {
  assert.throws(() => auditWorld({}), TypeError);
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

test('cancel drops a carry and leaves the runtime usable', () => {
  const physics = stubPhysics([CRATE('c1', 0, 2)]);
  const { rt } = host({ physics });
  rt.swapTo('wizard');
  const p = makePlayer();
  rt.update(1 / 60, p);
  rt.pressAbility();
  rt.update(0, p);
  rt.update(FIELD_ABILITIES.wizard.windup, p);
  assert.equal(rt.stats().carrying, 'c1');
  rt.cancel();
  assert.equal(rt.stats().carrying, null);
  rt.update(1 / 60, p);
});

test('dispose is idempotent and leaves nothing running', () => {
  const { rt } = host();
  rt.dispose();
  rt.dispose();
  assert.equal(rt.stats().bodies, 0);
});

test('stats never throws, at any point in the lifecycle', () => {
  const { rt } = host({ physics: stubPhysics([STONE('s', 0, 2)]) });
  assert.ok(rt.stats());
  rt.update(1 / 60, makePlayer());
  assert.equal(rt.stats().bodies, 1);
  assert.equal(rt.stats().party, 3);
  rt.dispose();
  assert.ok(rt.stats());
});

test('the runtime re-exports the build-time data the host needs', () => {
  const { rt } = host();
  assert.ok(rt.ABILITY_PROPS.length > 0);
  assert.ok(rt.ABILITY_PUZZLES.length > 0);
  assert.ok(rt.ABILITY_GATES.length === 3);
  assert.ok(rt.BINDINGS.ability);
  const merged = rt.mergeToybox([], []);
  assert.equal(merged.placements.length, rt.ABILITY_PROPS.length);
});

// ── The toybox, when it lands ───────────────────────────────────────────────

test('a toybox handed to the runtime is driven by the runtime', () => {
  // The point of this is that index.js loses a line and, more importantly,
  // that the puzzle poll and the gate ledger cannot see different frames.
  const ticks = [];
  let solved = null;
  const toybox = { update(dt) { ticks.push(dt); const s = solved; solved = null; return s; } };
  const { rt, events } = host({ toybox });
  const p = makePlayer();

  rt.update(1 / 60, p);
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0], 1 / 60);

  solved = ['phz-garden-stones'];
  rt.update(1 / 60, p);
  for (let i = 0; i < 4; i++) rt.update(0.6, p);
  const beats = events.moment.filter((m) => m.kind === MOMENT.ABILITY_GATE);
  assert.equal(beats.length, 1);
  assert.equal(beats[0].id, 'gate-garden-stones');
});

test('a toybox without an update method is ignored, not a crash', () => {
  const { rt } = host({ toybox: {} });
  rt.update(1 / 60, makePlayer());
});

test('momentTitle is re-exported so a host needs one import', async () => {
  const mod = await import('./abilityWiring.js');
  assert.equal(typeof mod.momentTitle, 'function');
  assert.equal(typeof mod.momentLine, 'function');
  assert.ok(mod.momentTitle({ kind: MOMENT.LEVEL_UP, name: 'Shadow', level: 4 }).includes('4'));
});
