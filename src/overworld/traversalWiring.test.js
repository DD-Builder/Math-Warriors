/**
 * traversalWiring.test.js — the assembled stack, over the real island.
 *
 * The unit suites prove each piece works. This one proves they were plugged
 * together in the right ORDER: rafts inside the collision world the controller
 * sees, thermals inside the glider, and a drop-in shape index.js can swap for
 * createController() without touching anything else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeightfield } from './heightfield.js';
import { createCollisionWorld, WATER_Y } from './collision.js';
import { createController, DEFAULT_TUNING } from './controller.js';
import { MODES, EVENTS } from './traversal.js';
import { WORLD, SPAWN } from './worldSpec.js';
import { CLIMB_ROUTES, FLOATABLES } from './traversalSpec.js';
import {
  createIslandTraversal, createFloorTraversal, createWalkOnly,
  dispatchTraversalEvent, applyRigFlags, jumpLabel, SOUND_FOR,
} from './traversalWiring.js';

const DT = 1 / 60;
const hf = createHeightfield(WORLD.SEED);
const mk = (opts) => createIslandTraversal(hf, createCollisionWorld(hf), opts);

// ── The drop-in contract ──────────────────────────────────────────────────

test('the controller is shape-compatible with createController', () => {
  const t = mk();
  const walk = createController(createCollisionWorld(hf), DEFAULT_TUNING);
  for (const k of ['spawnState', 'step']) {
    assert.equal(typeof t.controller[k], typeof walk[k], `missing ${k}`);
  }
  const a = t.controller.spawnState(SPAWN);
  const b = walk.spawnState(SPAWN);
  for (const k of ['pos', 'vel', 'yaw', 'grounded', 'wading']) {
    assert.ok(k in a, `traversal state is missing the walk field '${k}'`);
    assert.notEqual(b[k], undefined);
  }
  assert.ok(Math.abs(a.pos.y - b.pos.y) < 1e-9, 'the two spawn at different heights');
});

test('a save written by the plain walk controller still loads', () => {
  const t = mk();
  const walk = createController(createCollisionWorld(hf), DEFAULT_TUNING);
  let old = walk.spawnState(SPAWN);
  for (let i = 0; i < 60; i++) old = walk.step(old, { x: 0, y: 1 }, DT);
  const legacy = JSON.parse(JSON.stringify(old));   // exactly what a save holds
  const next = t.controller.step(legacy, { x: 0, y: 1 }, DT);
  assert.equal(next.mode, MODES.WALK);
  assert.equal(next.stamina, t.tuning.staminaMax);
  assert.ok(Number.isFinite(next.pos.y));
});

test('the tuning passed in reaches the walk controller underneath', () => {
  const t = mk({ tuning: { ...DEFAULT_TUNING, turnRate: 17 } });
  assert.equal(t.tuning.turnRate, 17);
  assert.equal(t.tuning.speed, DEFAULT_TUNING.speed);
});

test('prop colliders added to the base world are still felt through the wrapper', () => {
  const base = createCollisionWorld(hf);
  const t = createIslandTraversal(hf, base);
  base.addCollider({ id: 'tree', kind: 'circle', x: SPAWN.x + 2, z: SPAWN.z, r: 1.5 });
  const moved = t.collisionWorld.resolveMove(
    { x: SPAWN.x, y: 0, z: SPAWN.z }, { x: 1, z: 0 }, 0.6,
  );
  assert.equal(moved.blocked, true, 'the raft wrapper swallowed a prop collider');
});

// ── The composition ───────────────────────────────────────────────────────

test('rafts are inside the collision world the controller sees', () => {
  const t = mk();
  const raft = t.floatables.items[0];
  assert.ok(raft, 'the island has no floatables');
  t.stepWorld(DT, null);
  const g = t.collisionWorld.groundHeight(raft.x, raft.z);
  assert.ok(g > WATER_Y, `the deck at ${raft.x},${raft.z} reads as ${g} — the wrapper is not in the chain`);
  // …and the undecorated world still says "sea" there, so this is the wrapper.
  assert.ok(t.baseCollisionWorld.groundHeight(raft.x, raft.z) < WATER_Y);
});

test('thermals are inside the glider — a column actually lifts a real flight', () => {
  const t = mk();
  const vent = t.spec.thermals.find((c) => c.id === 'th-ember-crater');
  let s = t.controller.spawnState({ x: vent.x, z: vent.z });
  // Drop the hero into the column, well above the crater, already gliding.
  s = { ...s, pos: { x: vent.x, y: hf.sampleHeight(vent.x, vent.z) + 25, z: vent.z },
    vel: { x: 0, y: -3, z: 0 }, grounded: false, mode: MODES.GLIDE };
  let lift = 0;
  for (let i = 0; i < 180; i++) {
    s = t.controller.step(s, { x: 0, y: 0 }, DT);
    lift = Math.max(lift, s.lift);
  }
  assert.ok(lift > 2, `the vent only produced ${lift.toFixed(2)} m/s of lift`);
  assert.ok(s.vel.y > 0, 'the glider is not climbing inside a 5.5 m/s column');
});

test('thermals: false and floatables: false really do switch them off', () => {
  const t = mk({ thermals: false, floatables: false });
  assert.equal(t.spec.thermals.length, 0);
  assert.equal(t.floatables.items.length, 0);
  assert.equal(t.thermalField.thermalAt(125, 40, -125, 0), 0);
});

test('the whole stack climbs the Palace face and lands the hero on top', () => {
  const t = mk();
  const r = CLIMB_ROUTES.find((q) => q.id === 'climb-palace-face');
  let s = t.controller.spawnState({ x: r.base.x, z: r.base.z });
  let peak = s.pos.y;
  let mantled = false;
  for (let i = 0; i < 60 * 26; i++) {
    t.stepWorld(DT, s);
    s = t.controller.step(s, { x: r.dir.x, y: r.dir.z }, DT);
    if (s.mode === MODES.MANTLE) mantled = true;
    peak = Math.max(peak, s.pos.y);
  }
  assert.ok(mantled, 'never topped out');
  assert.ok(peak > 50, `only reached ${peak.toFixed(1)} m up a 55 m mesa`);
});

test('a swimmer can climb onto one of the island\'s real rafts', () => {
  const t = mk();
  const raft = t.floatables.items[0];
  const spec = FLOATABLES.find((f) => f.id === raft.id);
  // Start in open water a little way off the raft.
  let s = t.controller.spawnState({ x: spec.x + 9, z: spec.z });
  assert.equal(s.mode, MODES.SWIM, 'the raft is not in open water');
  for (let i = 0; i < 60 * 12; i++) {
    t.stepWorld(DT, s);
    const dx = raft.x - s.pos.x;
    const dz = raft.z - s.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    s = t.controller.step(s, { x: dx / d, y: dz / d }, DT);
    if (s.grounded) break;
  }
  assert.equal(s.grounded, true, 'never got aboard');
  assert.ok(s.pos.y > WATER_Y, `standing at y=${s.pos.y.toFixed(2)}, under the sea`);
  assert.equal(s.wading, false, 'a deck must not read as wading');
});

test('the save round-trips the rafts', () => {
  const a = mk();
  for (let i = 0; i < 200; i++) {
    a.stepWorld(DT, { pos: { x: a.floatables.items[0].x - 4, y: WATER_Y - 0.3, z: a.floatables.items[0].z } });
  }
  const data = JSON.parse(JSON.stringify(a.toSave()));
  const b = mk();
  b.fromSave(data);
  assert.ok(Math.abs(b.floatables.items[0].x - a.floatables.items[0].x) < 1e-9);
  assert.doesNotThrow(() => b.fromSave(null));
  assert.doesNotThrow(() => b.fromSave({}));
});

// ── The other two factories ───────────────────────────────────────────────

test('a floor gets climbing and gliding but no ocean, vents or boats', () => {
  const flat = createCollisionWorld({
    sampleHeight: () => 6,
    sampleNormal: () => [0, 1, 0],
  });
  const c = createFloorTraversal(flat);
  const s = c.spawnState({ x: 0, z: 0 });
  assert.equal(s.mode, MODES.WALK);
  // No field wired: a glide over a floor sinks at the plain rate, always.
  let g = { ...s, pos: { x: 0, y: 60, z: 0 }, vel: { x: 0, y: -3, z: 0 }, grounded: false, mode: MODES.GLIDE };
  for (let i = 0; i < 120; i++) g = c.step(g, { x: 0, y: 1 }, DT);
  assert.equal(g.lift, 0);
  assert.ok(g.vel.y < 0);
});

test('createWalkOnly is the untouched walk controller, for a hard off switch', () => {
  const w = createWalkOnly(createCollisionWorld(hf));
  const s = w.spawnState(SPAWN);
  assert.equal(s.mode, undefined, 'walk-only must not fake a traversal state');
  assert.equal(w.step(s, { x: 0, y: 1 }, DT).mode, undefined);
});

// ── Dispatch, rig flags, labels ───────────────────────────────────────────

test('dispatchTraversalEvent fires the FX and the sound exactly once', () => {
  const seen = [];
  const sounds = [];
  const fx = { onEvent: (e, s) => seen.push([e, s.pos.x]) };
  const state = { event: EVENTS.SPLASH, pos: { x: 3, y: 0, z: 0 } };
  assert.equal(dispatchTraversalEvent(state, fx, (k) => sounds.push(k)), EVENTS.SPLASH);
  assert.deepEqual(seen, [[EVENTS.SPLASH, 3]]);
  assert.deepEqual(sounds, [SOUND_FOR[EVENTS.SPLASH]]);
});

test('dispatchTraversalEvent is a no-op on a quiet frame, and never throws', () => {
  assert.equal(dispatchTraversalEvent({ event: null }, null, null), null);
  assert.equal(dispatchTraversalEvent(null, null, null), null);
  assert.equal(dispatchTraversalEvent({ event: 'unheard-of', pos: { x: 0 } }, null, null), 'unheard-of');
});

test('every event the machine can emit has a sound key', () => {
  for (const e of Object.values(EVENTS)) {
    assert.ok(SOUND_FOR[e], `no sound mapped for '${e}'`);
  }
});

test('applyRigFlags writes the three flags the hero rig reads', () => {
  const s = { mode: MODES.CLIMB };
  assert.equal(applyRigFlags(s), s, 'the rig wants one object, not a copy');
  assert.deepEqual(
    { climbing: s.climbing, gliding: s.gliding, swimming: s.swimming },
    { climbing: true, gliding: false, swimming: false },
  );
  const g = applyRigFlags({ mode: MODES.GLIDE });
  assert.equal(g.gliding, true);
  assert.equal(applyRigFlags(null), null);
});

test('the jump button never lies about what it will do', () => {
  assert.equal(jumpLabel({ mode: MODES.WALK, grounded: true }), 'JUMP');
  assert.equal(jumpLabel({ mode: MODES.WALK, grounded: false, vel: { y: -4 } }), 'GLIDE');
  assert.equal(jumpLabel({ mode: MODES.WALK, grounded: false, vel: { y: 4 } }), 'JUMP');
  assert.equal(jumpLabel({ mode: MODES.CLIMB }), 'LET GO');
  assert.equal(jumpLabel({ mode: MODES.GLIDE }), 'FOLD');
  assert.equal(jumpLabel({ mode: MODES.SWIM, dive: 0 }), 'JUMP');
  assert.equal(jumpLabel({ mode: MODES.SWIM, dive: 1.2 }), 'UP');
  assert.equal(jumpLabel({ mode: MODES.MANTLE }), null, 'a mantle is uninterruptible');
  assert.equal(jumpLabel(null), 'JUMP');
});

// ── The long soak ─────────────────────────────────────────────────────────

test('ten thousand frames of nonsense input never breaks the assembled stack', () => {
  const t = mk();
  let s = t.controller.spawnState(SPAWN);
  for (let i = 0; i < 10000; i++) {
    t.stepWorld(DT, s);
    s = t.controller.step(s, {
      x: Math.sin(i * 0.037) * 1.4,          // deliberately over-unit
      y: Math.cos(i * 0.019) * 1.4,
      jump: i % 53 === 0,
      run: (i % 7) < 3,
      dive: (i % 11) < 4,
    }, DT);
    assert.ok(Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y) && Number.isFinite(s.pos.z),
      `frame ${i}: position went non-finite`);
    assert.ok(s.stamina >= 0 && s.stamina <= t.tuning.staminaMax, `frame ${i}: stamina ${s.stamina}`);
    assert.ok(Math.abs(s.pos.x) <= WORLD.HALF && Math.abs(s.pos.z) <= WORLD.HALF,
      `frame ${i}: left the island`);
    assert.ok(s.pos.y > -20, `frame ${i}: fell through the world to ${s.pos.y}`);
  }
});

test('the assembled stack is deterministic frame for frame', () => {
  const play = () => {
    const t = mk();
    let s = t.controller.spawnState(SPAWN);
    const trace = [];
    for (let i = 0; i < 900; i++) {
      t.stepWorld(DT, s);
      s = t.controller.step(s, {
        x: Math.sin(i * 0.05), y: Math.cos(i * 0.03), jump: i % 61 === 0, dive: i % 9 === 0,
      }, DT);
      trace.push(s.mode, s.pos.x, s.pos.y, s.pos.z, s.event, t.floatables.items[0].x);
    }
    return JSON.stringify(trace);
  };
  assert.equal(play(), play());
});
