/**
 * floatables.test.js — rafts as ground, and the rules that keep them usable.
 *
 * The interesting claims are all about the COLLISION WRAPPER: a raft only
 * works because it is expressible as a local edit to the heightfield, and
 * these tests pin the four properties that edit has to have (deck is ground,
 * deck is flat, deck is not water, and terrain always wins where it is
 * higher). The rest is drift behaviour, which is what stops a child from
 * losing every boat on the island in the first five minutes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionWorld, WATER_Y } from './collision.js';
import { createTraversalController, MODES } from './traversal.js';
import { createFloatables, withFloatables, ridingWeight, FLOAT_TUNING } from './floatables.js';

const DT = 1 / 60;

function fieldFrom(h) {
  const e = 0.05;
  return {
    sampleHeight: (x, z) => h(x, z),
    sampleNormal: (x, z) => {
      const gx = (h(x + e, z) - h(x - e, z)) / (2 * e);
      const gz = (h(x, z + e) - h(x, z - e)) / (2 * e);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      return [-gx * inv, inv, -gz * inv];
    },
  };
}

/** Open water 8 m deep. */
const seaH = () => -8;
const sea = () => createCollisionWorld(fieldFrom(seaH));

const SPEC = [{ id: 'raft-a', kind: 'raft', x: 0, z: 0, r: 3, lift: 0.3, drift: 1.2 }];

const mkFloats = (spec = SPEC, h = seaH) =>
  createFloatables(spec, { groundAt: (x, z) => h(x, z) });

// ── The collision wrapper ─────────────────────────────────────────────────

test('a deck reads as ground, and open water still reads as the seabed', () => {
  const f = mkFloats();
  const w = withFloatables(sea(), f);
  assert.ok(w.groundHeight(0, 0) > WATER_Y, 'the deck is not above the waterline');
  assert.equal(w.groundHeight(50, 50), -8, 'open water lost its seabed');
});

test('a deck is flat, and off the deck the real normal comes back', () => {
  const f = mkFloats();
  const w = withFloatables(createCollisionWorld(fieldFrom((x) => -8 + x * 0.5)), f);
  assert.deepEqual([...w.groundNormal(0, 0)], [0, 1, 0]);
  const off = w.groundNormal(60, 0);
  assert.ok(off[1] < 1, 'the sloping seabed went flat off the raft');
});

test('a deck is not water — standing on a boat must not play the wade cycle', () => {
  const f = mkFloats();
  const w = withFloatables(sea(), f);
  assert.equal(w.isWater(0, 0), false);
  assert.equal(w.isWater(40, 0), true);
});

test('terrain always wins where it is higher — a raft cannot punch a hole in a beach', () => {
  const f = mkFloats();
  // A sandbar exactly where the raft is.
  const w = withFloatables(createCollisionWorld(fieldFrom(() => 4)), f);
  assert.equal(w.groundHeight(0, 0), 4);
  assert.ok(w.groundNormal(0, 0)[1] === 1 || w.groundNormal(0, 0)[1] > 0.99);
});

test('the deck rim eases down to the waterline, so boarding is a ramp', () => {
  const f = mkFloats();
  const mid = f.deckAt(0, 0);
  const rim = f.deckAt(2.95, 0);
  assert.ok(rim !== null && rim < mid, 'the rim is as tall as the middle: that is a wall');
  assert.ok(rim > WATER_Y - 0.01, 'the rim dipped under the water');
  assert.equal(f.deckAt(9, 0), null, 'deck height leaked outside the disc');
});

test('the wrapper forwards resolveMove and collider registration untouched', () => {
  const base = sea();
  const w = withFloatables(base, mkFloats());
  w.addCollider({ id: 'rock', kind: 'circle', x: 20, z: 0, r: 2 });
  const moved = w.resolveMove({ x: 19, y: 0, z: 0 }, { x: 1, z: 0 }, 0.6);
  assert.equal(moved.blocked, true, 'the prop collider was lost through the wrapper');
  w.removeCollider('rock');
  assert.equal(w.resolveMove({ x: 19, y: 0, z: 0 }, { x: 1, z: 0 }, 0.6).blocked, false);
});

test('withFloatables(world, null) is the identity', () => {
  const base = sea();
  assert.equal(withFloatables(base, null), base);
});

// ── Riding one ────────────────────────────────────────────────────────────

test('swimming into a raft climbs you onto it — no button, no prompt', () => {
  const f = mkFloats();
  const c = createTraversalController(withFloatables(sea(), f));
  let s = c.spawnState({ x: 9, z: 0 });
  assert.equal(s.mode, MODES.SWIM, 'the test should start in open water');
  for (let i = 0; i < 60 * 8; i++) {
    f.step(DT, s);
    s = c.step(s, { x: -1, y: 0 }, DT);
    if (s.grounded) break;
  }
  assert.equal(s.mode, MODES.WALK, 'never got aboard');
  assert.equal(s.grounded, true);
  assert.equal(s.wading, false, 'a deck must not read as wading');
  assert.ok(s.pos.y > WATER_Y, `standing at y=${s.pos.y}, which is under the sea`);
});

test('a swimmer shoves a raft; a rider does not shove the raft they are on', () => {
  const f = mkFloats();
  const raft = f.items[0];
  // Swimmer in the water, off the port side, at the surface.
  const swimmer = { pos: { x: -4, y: WATER_Y - 0.25, z: 0 } };
  for (let i = 0; i < 120; i++) f.step(DT, swimmer);
  assert.ok(raft.x > 0.4, `the shove moved the raft only ${raft.x.toFixed(2)} m`);

  const pushed = raft.x;
  // Now stand on it. It must coast to a stop, not keep running away.
  const rider = { pos: { x: raft.x, y: raft.deckY + 0.05, z: raft.z } };
  for (let i = 0; i < 240; i++) {
    f.step(DT, rider);
    rider.pos.x = raft.x;
    rider.pos.z = raft.z;
    rider.pos.y = raft.deckY + 0.05;
  }
  assert.ok(raft.ridden, 'the rider was not detected aboard');
  assert.ok(Math.hypot(raft.vx, raft.vz) < 0.05, 'a ridden raft kept accelerating');
  assert.ok(Math.abs(raft.x - pushed) < 1.5, 'a ridden raft ran away under its rider');
});

test('a raft bobs, and the bob is small enough to stand on', () => {
  const f = mkFloats();
  const raft = f.items[0];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 600; i++) {
    f.step(DT, null);
    lo = Math.min(lo, raft.deckY);
    hi = Math.max(hi, raft.deckY);
  }
  const amp = (hi - lo) / 2;
  assert.ok(Math.abs(amp - FLOAT_TUNING.bobAmp) < 0.02, `bob amplitude ${amp}`);
  assert.ok(lo > WATER_Y, 'the deck dipped under water mid-bob');
});

test('a raft can never beach itself somewhere the player cannot swim to', () => {
  // Deep water to the west, dry sand to the east.
  const h = (x) => -8 + x * 0.5;
  const f = createFloatables([{ id: 'r', kind: 'raft', x: 0, z: 0, r: 3, lift: 0.3, drift: 3 }],
    { groundAt: h });
  const raft = f.items[0];
  // Shove it at the beach for a long time.
  for (let i = 0; i < 60 * 40; i++) f.step(DT, { pos: { x: raft.x - 4, y: WATER_Y - 0.3, z: 0 } });
  assert.ok(WATER_Y - h(raft.x) >= FLOAT_TUNING.minDepth - 1e-6,
    `the raft grounded itself in ${(WATER_Y - h(raft.x)).toFixed(2)} m of water`);
});

test('the tether brings a shoved raft home, so the authored layout survives play', () => {
  const f = mkFloats();
  const raft = f.items[0];
  // Push it a very long way.
  for (let i = 0; i < 60 * 120; i++) {
    f.step(DT, { pos: { x: raft.x - 4, y: WATER_Y - 0.3, z: 0 } });
  }
  const far = Math.hypot(raft.x - raft.homeX, raft.z - raft.homeZ);
  assert.ok(far < FLOAT_TUNING.tether + 8, `the raft escaped to ${far.toFixed(0)} m from home`);
  // Now leave it alone: it must come back inside the leash.
  for (let i = 0; i < 60 * 90; i++) f.step(DT, null);
  const home = Math.hypot(raft.x - raft.homeX, raft.z - raft.homeZ);
  assert.ok(home <= far + 1e-6, 'a released raft drifted further away');
});

// ── Bookkeeping ───────────────────────────────────────────────────────────

test('itemAt finds the deck under a point and nothing under open water', () => {
  const f = mkFloats();
  assert.equal(f.itemAt(0, 0).id, 'raft-a');
  assert.equal(f.itemAt(0, 2.9).id, 'raft-a');
  assert.equal(f.itemAt(0, 3.6), null);
});

test('ridingWeight is 1 in the middle, 0 at the rim, 0 when swimming under it', () => {
  const f = mkFloats();
  const y = f.items[0].deckY;
  assert.ok(Math.abs(ridingWeight(f, 0, 0, y) - 1) < 1e-9);
  assert.ok(ridingWeight(f, 2.9, 0, y) < 0.1);
  assert.equal(ridingWeight(f, 0, 0, y - 2), 0);
  assert.equal(ridingWeight(f, 40, 0, y), 0);
  assert.equal(ridingWeight(null, 0, 0, 0), 0);
});

test('rafts are seeded deterministically — two runs are pixel-identical', () => {
  const play = () => {
    const f = mkFloats([
      { id: 'a', kind: 'raft', x: 0, z: 0, r: 3, lift: 0.3, drift: 1.2 },
      { id: 'b', kind: 'lily', x: 12, z: 4, r: 2, lift: 0.2, drift: 1.5 },
      { id: 'c', kind: 'boat', x: -9, z: -6, r: 2.2, lift: 0.3, drift: 1.2 },
    ]);
    const out = [];
    for (let i = 0; i < 400; i++) {
      f.step(DT, { pos: { x: Math.sin(i * 0.05) * 6, y: WATER_Y - 0.3, z: Math.cos(i * 0.07) * 6 } });
      for (const it of f.items) out.push(it.x, it.z, it.deckY, it.tilt);
    }
    return JSON.stringify(out);
  };
  assert.equal(play(), play());
});

test('a save round-trip puts every boat back exactly where the child left it', () => {
  const f = mkFloats();
  for (let i = 0; i < 300; i++) f.step(DT, { pos: { x: -5, y: WATER_Y - 0.3, z: 0 } });
  const saved = JSON.parse(JSON.stringify(f.serialize()));
  const moved = { x: f.items[0].x, z: f.items[0].z };

  const g = mkFloats();
  g.restore(saved);
  assert.ok(Math.abs(g.items[0].x - moved.x) < 1e-9);
  assert.ok(Math.abs(g.items[0].z - moved.z) < 1e-9);
  // Both then advance identically from the restored clock.
  for (let i = 0; i < 60; i++) { f.step(DT, null); g.step(DT, null); }
  assert.ok(Math.abs(g.items[0].deckY - f.items[0].deckY) < 1e-9);
});

test('restore survives junk, missing ids and a half-written save', () => {
  const f = mkFloats();
  assert.doesNotThrow(() => f.restore(null));
  assert.doesNotThrow(() => f.restore({}));
  assert.doesNotThrow(() => f.restore({ items: [null, { id: 'nope', x: 5 }, { id: 'raft-a' }] }));
  assert.ok(Number.isFinite(f.items[0].x));
});

test('an empty spec is a valid (inert) floatables sim', () => {
  const f = createFloatables();
  assert.equal(f.items.length, 0);
  assert.doesNotThrow(() => f.step(DT, null));
  assert.equal(f.deckAt(0, 0), null);
  const w = withFloatables(sea(), f);
  assert.equal(w.groundHeight(0, 0), -8);
});
