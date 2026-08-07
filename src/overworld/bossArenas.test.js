/**
 * Boss lair contract tests.
 *
 * Screenshots judge the art; these protect the three things a screenshot cannot
 * catch until it is too late:
 *
 *   PLACEMENT. Every lair has to stand in its own biome, on ground it does not
 *   float above, clear of the portal pads, the collectibles and the two spiral
 *   climb ramps. A landmark parked on the only route up Sky Cliffs makes floor 3
 *   unreachable and looks perfectly fine in a still.
 *
 *   THE APPROACH BEAT. onLairNear drives a music swell and a name card, so it
 *   must fire exactly once per approach. Double-firing stutters the score and no
 *   test of the geometry would ever notice.
 *
 *   ESCALATION. The measured complaint that started this work was that the final
 *   boss carried the LEAST art of the nine. The Theorem's spire is asserted here
 *   to be the tallest and the heaviest by a wide margin, so that regression is
 *   now a failing test rather than a thing someone has to remember.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBossLairs, createLairTracker, nearestLair, lairForFloor,
  LAIRS, LEAVE_SCALE, DETAIL_RANGE,
} from './bossArenas.js';
import { createHeightfield } from './heightfield.js';
import {
  WORLD, PORTALS, COLLECTIBLES, BUILDINGS, SPAWN, BIOMES,
} from './worldSpec.js';
import { BOSS_IDS } from '../data/enemies.js';
import { PAPER } from '../config.js';

// ── The table ──────────────────────────────────────────────────────────────

test('lairs: one per floor, one per boss, in floor order', () => {
  assert.equal(LAIRS.length, 9);
  assert.deepEqual(LAIRS.map((l) => l.floorId), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(LAIRS.map((l) => l.bossId)).size, 9);
  // Every boss in the game has a lair, and no lair invents a boss.
  assert.deepEqual([...LAIRS.map((l) => l.bossId)].sort(), [...BOSS_IDS].sort());
});

test('lairs: every lair belongs to a real biome, and every floor biome has one', () => {
  const floors = BIOMES.filter((b) => b.floorId);
  for (const l of LAIRS) {
    const b = floors.find((x) => x.id === l.biomeId);
    assert.ok(b, `${l.bossId} names a real biome`);
    assert.equal(b.floorId, l.floorId, `${l.bossId} sits in its own floor's biome`);
  }
  assert.equal(new Set(LAIRS.map((l) => l.biomeId)).size, floors.length);
});

test('lairs: PALETTE LAW — every colour is a PAPER token, nothing invented', () => {
  const paper = new Set(Object.values(PAPER));
  for (const l of LAIRS) {
    for (const [key, hex] of Object.entries(l.pal)) {
      assert.ok(paper.has(hex), `${l.bossId}.${key} = ${hex.toString(16)} is a PAPER token`);
    }
  }
});

test('lairs: each has a name and a boss name for the approach card', () => {
  for (const l of LAIRS) {
    assert.ok(l.name && l.name.length > 3, `${l.bossId} has a landmark name`);
    assert.ok(l.boss && l.boss.length > 2, `${l.bossId} has a boss name`);
    assert.ok(l.near >= 30 && l.near <= 70, `${l.bossId} approach radius is playable`);
  }
});

test('lairs: THE FINAL BOSS IS THE MOST SPECTACULAR — height', () => {
  const theorem = lairForFloor(9);
  const others = LAIRS.filter((l) => l.floorId !== 9);
  const tallestOther = Math.max(...others.map((l) => l.height));
  assert.ok(theorem.height >= tallestOther * 1.8,
    `the Theorem's spire (${theorem.height} m) must tower over the next tallest (${tallestOther} m)`);
  // And the back half is not weaker than the front half.
  const front = LAIRS.slice(0, 4).reduce((a, l) => a + l.height, 0) / 4;
  const back = LAIRS.slice(4).reduce((a, l) => a + l.height, 0) / 5;
  assert.ok(back > front, `back-half lairs average ${back} m > front-half ${front} m`);
});

// ── nearestLair / tracker ──────────────────────────────────────────────────

test('nearestLair: inside its circle, and null everywhere else', () => {
  const l = LAIRS[0];
  assert.equal(nearestLair(l.x, l.z), l);
  assert.equal(nearestLair(l.x + l.near - 1, l.z), l);
  assert.equal(nearestLair(l.x + l.near + 1, l.z), null);
  // Mid-ocean.
  assert.equal(nearestLair(WORLD.HALF - 5, WORLD.HALF - 5), null);
});

test('tracker: ENTER fires exactly once, however long you stand there', () => {
  const t = createLairTracker();
  const l = lairForFloor(1);
  assert.equal(t.step(l.x, l.z), 'enter');
  assert.equal(t.current.floorId, 1);
  for (let i = 0; i < 200; i++) {
    assert.equal(t.step(l.x + Math.sin(i) * 0.5, l.z + Math.cos(i) * 0.5), null,
      'standing inside must not re-announce');
  }
});

test('tracker: LEAVE needs the wider radius — a boundary jitter cannot machine-gun it', () => {
  const t = createLairTracker();
  const l = lairForFloor(4);
  t.step(l.x, l.z);
  // Just outside `near` but inside near * LEAVE_SCALE: still inside, no event.
  const mid = l.near * (1 + LEAVE_SCALE) / 2;
  assert.equal(t.step(l.x + mid, l.z), null);
  assert.equal(t.current, l);
  // Well outside: one leave, then silence.
  assert.equal(t.step(l.x + l.near * LEAVE_SCALE + 5, l.z), 'leave');
  assert.equal(t.current, null);
  assert.equal(t.step(l.x + 400, l.z), null);
});

test('tracker: reset() lets a teleport re-announce the lair it lands in', () => {
  const t = createLairTracker();
  const l = lairForFloor(9);
  assert.equal(t.step(l.x, l.z), 'enter');
  assert.equal(t.step(l.x, l.z), null);
  t.reset();
  assert.equal(t.current, null);
  assert.equal(t.step(l.x, l.z), 'enter');
});

test('tracker: crossing straight from one lair to another SWITCHES', () => {
  const a = lairForFloor(1);
  const b = lairForFloor(2);
  // A synthetic pair whose circles touch, so the transition is reachable.
  const lairs = [
    { ...a, x: 0, z: 0, near: 20 },
    { ...b, x: 30, z: 0, near: 20 },
  ];
  const t = createLairTracker(lairs);
  assert.equal(t.step(0, 0), 'enter');
  assert.equal(t.step(30, 0), 'switch');
  assert.equal(t.current.floorId, 2);
  assert.equal(t.previous.floorId, 1);
});

// ── The built landmarks ────────────────────────────────────────────────────

const hf = createHeightfield(WORLD.SEED);
const bl = createBossLairs(hf);

test('lairs: all nine build, and each has a far silhouette', () => {
  assert.equal(bl.stats.lairs, 9);
  for (const l of bl.lairs) {
    assert.ok(l.farMesh, `${l.bossId} has a far mesh`);
    assert.ok(l.farTriangles > 250, `${l.bossId} far silhouette is not a stub`);
    assert.equal(l.nearMesh.visible, false, 'detail starts switched off');
    assert.equal(l.glowMesh.visible, false);
    // `near` must stay the APPROACH RADIUS — a mesh on that key would NaN out
    // every radius test and silence the approach beat entirely.
    assert.equal(typeof l.near, 'number', `${l.bossId}.near is still a radius`);
  }
});

test('lairs: THE FINAL BOSS IS THE MOST SPECTACULAR — geometry', () => {
  const by = Object.fromEntries(bl.stats.trianglesByFloor.map((r) => [r.floorId, r]));
  const nine = by[9].total;
  for (let f = 1; f <= 8; f++) {
    assert.ok(nine > by[f].total * 1.9,
      `floor 9 (${nine} tris) must dwarf floor ${f} (${by[f].total})`);
  }
  // It also carries more silhouette than the four garden-side lairs combined —
  // "the back half must end up the most spectacular" measured, not asserted.
  const frontFar = [1, 2, 3, 4].reduce((a, f) => a + by[f].far, 0);
  assert.ok(by[9].far > frontFar * 0.9,
    `floor 9 far (${by[9].far}) vs floors 1-4 combined (${frontFar})`);
});

test('lairs: the whole set fits the shared budget', () => {
  // Nine landmarks, two materials, and a worst case that assumes every far mesh
  // is in frustum at once (they never are — the closest pair is 90 m apart).
  assert.equal(bl.stats.materials, 2);
  assert.ok(bl.stats.drawCalls <= 26, `worst-case ${bl.stats.drawCalls} draw calls <= 26`);
  assert.ok(bl.stats.triangles < 40_000, `${bl.stats.triangles} triangles well inside budget`);
  assert.ok(bl.stats.farTriangles < 16_000, `${bl.stats.farTriangles} always-resident triangles`);
});

test('lairs: every lair stands in its own biome, on its own ground', () => {
  for (const l of bl.lairs) {
    assert.equal(hf.biomeAt(l.x, l.z), l.biomeId, `${l.bossId} is inside ${l.biomeId}`);
    const ground = hf.sampleHeight(l.x, l.z);
    // The buried terraced footing absorbs the slope; it can absorb about 8 m,
    // and anything past ~5 would start showing bare drum on the downhill side.
    const exposed = ground - l.y;
    assert.ok(exposed < 5, `${l.bossId} exposes ${exposed.toFixed(1)} m of footing`);
    assert.ok(exposed > -6, `${l.bossId} is not buried (${exposed.toFixed(1)} m)`);
  }
});

test('lairs: nothing the player interacts with is swallowed by a landmark', () => {
  for (const l of bl.lairs) {
    for (const p of PORTALS) {
      const d = Math.hypot(p.x - l.x, p.z - l.z);
      assert.ok(d > l.collider + 4, `${l.bossId} leaves ${p.id} approachable (${d.toFixed(1)} m)`);
    }
    for (const c of COLLECTIBLES) {
      const d = Math.hypot(c.x - l.x, c.z - l.z);
      assert.ok(d > l.collider + 3, `${l.bossId} does not sit on ${c.id} (${d.toFixed(1)} m)`);
    }
    for (const b of BUILDINGS) {
      assert.ok(Math.hypot(b.x - l.x, b.z - l.z) > 20, `${l.bossId} clears ${b.id}`);
    }
    assert.ok(Math.hypot(SPAWN.x - l.x, SPAWN.z - l.z) > 30, `${l.bossId} clears the spawn`);
  }
});

test('lairs: neither spiral climb ramp is blocked — floors 3 and 9 stay reachable', () => {
  for (const l of bl.lairs) {
    const b = BIOMES.find((x) => x.id === l.biomeId);
    if (!b || !b.ramp) continue;
    const { r0, r1, turns, theta0 } = b.ramp;
    let closest = Infinity;
    for (let i = 0; i <= 600; i++) {
      const t = i / 600;
      const r = r0 + (r1 - r0) * t;
      const th = theta0 + t * turns * Math.PI * 2;
      const d = Math.hypot(b.center[0] + Math.cos(th) * r - l.x, b.center[1] + Math.sin(th) * r - l.z);
      if (d < closest) closest = d;
    }
    assert.ok(closest > l.collider + 6,
      `${l.bossId} leaves the ${b.id} ramp walkable (${closest.toFixed(1)} m)`);
  }
});

test('lairs: colliders are solid but never a wall', () => {
  assert.equal(bl.colliders.length, 9);
  for (const c of bl.colliders) {
    assert.equal(c.kind, 'circle');
    assert.ok(c.r >= 3 && c.r <= 7, `${c.id} radius ${c.r} is a monument, not a fence`);
  }
  // Ids are unique so collisionWorld's Map cannot silently drop one.
  assert.equal(new Set(bl.colliders.map((c) => c.id)).size, 9);
});

test('lairs: detail and glow switch on with distance and off again', () => {
  const l = bl.lairs.find((x) => x.floorId === 6);
  bl.update(0, { x: l.x, z: l.z });
  assert.equal(l.nearMesh.visible, true, 'standing at the lair, detail is on');
  assert.equal(l.glowMesh.visible, true);
  bl.update(0, { x: l.x + DETAIL_RANGE + 20, z: l.z });
  assert.equal(l.nearMesh.visible, false, 'past the detail range it sheds its trim');
  bl.update(0, { x: WORLD.HALF, z: WORLD.HALF });
  assert.equal(l.glowMesh.visible, false);
  // The far silhouette is never switched off — that is the whole point of it.
  assert.equal(l.farMesh.visible, true);
});

test('lairs: checkApproach drives the hooks exactly once per crossing', () => {
  const near = [];
  const leave = [];
  const onNear = (floorId) => near.push(floorId);
  const onLeave = (floorId) => leave.push(floorId);
  bl.resetApproach();
  const l = lairForFloor(5);
  for (let i = 0; i < 50; i++) bl.checkApproach(l.x, l.z, onNear, onLeave);
  assert.deepEqual(near, [5]);
  assert.deepEqual(leave, []);
  for (let i = 0; i < 50; i++) bl.checkApproach(WORLD.HALF - 4, 0, onNear, onLeave);
  assert.deepEqual(near, [5]);
  assert.deepEqual(leave, [5]);
  bl.resetApproach();
});

test('lairs: update() survives a null player position', () => {
  bl.update(3.5, null);
  bl.update(3.5, { x: 0, z: 0 });
});

test('lairs: dispose() releases everything', () => {
  const one = createBossLairs(hf);
  const geos = [];
  one.group.traverse((o) => { if (o.geometry) geos.push(o.geometry); });
  assert.ok(geos.length >= 9);
  one.dispose();
  assert.equal(one.group.children.length, 0);
  assert.equal(one.lairs.length, 0);
  assert.equal(one.colliders.length, 0);
});
