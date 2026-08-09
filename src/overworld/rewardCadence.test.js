/**
 * rewardCadence.test.js
 *
 * Two jobs. The first half proves the AUDIT is a measurement and not an
 * opinion — run it against the real island and against a synthetic one whose
 * answer is known by construction. The second half proves the FILLS are real:
 * on land, in the holes the audit found, and reachable from a runtime the host
 * drives with one line.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { PAPER } from '../config.js';
import { createHeightfield } from './heightfield.js';
import {
  WORLD, PORTALS, COLLECTIBLES, BUILDINGS, PATHS,
} from './worldSpec.js';
import {
  SHRINES, GROTTOS, LANDMARK_PUZZLES, STORY_PAGES,
} from './discoverySpec.js';
import {
  WALK_SPEED, DEAD_RADIUS, FILL_KINDS, CADENCE_FILLS, CADENCE_COLLECTIBLES,
  auditCadence, nearestGap, collectPoints, fillsOfKind, trailCollectibles,
  mergeCollectibles, createCadenceRuntime,
} from './rewardCadence.js';

const hf = createHeightfield(WORLD.SEED);
const heightAt = (x, z) => hf.sampleHeight(x, z);
const slopeAt = (x, z) => {
  const n = hf.sampleNormal(x, z);
  return Math.acos(Math.max(-1, Math.min(1, n[1]))) * 180 / Math.PI;
};

/** Everything the shipped island authors, minus the toybox (not required). */
const islandPoints = () => collectPoints({
  portals: PORTALS,
  collectibles: COLLECTIBLES,
  buildings: BUILDINGS,
  shrines: SHRINES,
  grottos: GROTTOS,
  landmarks: LANDMARK_PUZZLES,
  pages: STORY_PAGES,
});

// ── The audit, on ground whose answer is known ──────────────────────────────

test('nearestGap is a distance, and an empty world is infinitely empty', () => {
  assert.equal(nearestGap([{ x: 3, z: 4 }], 0, 0), 5);
  assert.equal(nearestGap([], 0, 0), Infinity);
});

test('a flat plane with one thing on it is almost entirely dead', () => {
  const r = auditCadence({
    points: [{ x: 0, z: 0 }], heightAt: () => 10, extent: 100, step: 10,
  });
  assert.ok(r.deadFraction > 0.9, `expected a desert, got ${r.deadFraction}`);
  assert.equal(r.bands[0].deadFraction, 0, 'the band around the one thing is alive');
});

test('a plane packed with things is not dead at all', () => {
  const points = [];
  for (let x = -100; x <= 100; x += 20) for (let z = -100; z <= 100; z += 20) points.push({ x, z });
  const r = auditCadence({ points, heightAt: () => 10, extent: 100, step: 10 });
  assert.equal(r.dead, 0);
});

test('the sea and the cliffs are not counted as dead ground', () => {
  // An island of one hill in an ocean: only the hill may be sampled.
  const r = auditCadence({
    points: [], heightAt: (x, z) => (Math.hypot(x, z) < 30 ? 10 : 0), extent: 100, step: 5,
  });
  assert.ok(r.cells > 0);
  // A disc of radius 30 sampled at 5 m is ~113 cells; the 41x41 square is 1681.
  assert.ok(r.cells < 200, `sampled ${r.cells} cells — the ocean got counted`);
});

test('auditCadence refuses to guess at the terrain', () => {
  assert.throws(() => auditCadence({ points: [] }), TypeError);
});

// ── The audit, on the real island ───────────────────────────────────────────

test('the shipped island has a measurable amount of dead ground', () => {
  const r = auditCadence({ points: islandPoints(), heightAt, slopeAt });
  assert.ok(r.cells > 3000, `only ${r.cells} walkable cells — the sampler is wrong`);
  // The number in the module header. If someone fills the island in, this
  // test should fail and the header should be rewritten — that is the point.
  assert.ok(r.deadFraction > 0.25 && r.deadFraction < 0.6,
    `dead fraction ${(r.deadFraction * 100).toFixed(0)}% is outside the audited range`);
});

test('the doughnut is the worst band, and it is the ring road', () => {
  const r = auditCadence({ points: islandPoints(), heightAt, slopeAt });
  const band = (r0) => r.bands.find((b) => b.r0 === r0);
  const doughnut = band(60);
  assert.ok(doughnut, 'no r 60-79 band was sampled');
  assert.ok(doughnut.deadFraction > 0.7,
    `r 60-79 is only ${(doughnut.deadFraction * 100).toFixed(0)}% dead`);
  // ...and the biome ring is fine, which is why the fix is targeted.
  assert.ok(band(140).deadFraction < 0.25, 'the biome ring is not the problem');
});

test('the worst points are far enough apart to be different places', () => {
  const r = auditCadence({ points: islandPoints(), heightAt, slopeAt });
  assert.ok(r.worst.length >= 8);
  for (let i = 0; i < r.worst.length; i++) {
    for (let j = i + 1; j < r.worst.length; j++) {
      assert.ok(Math.hypot(r.worst[i].x - r.worst[j].x, r.worst[i].z - r.worst[j].z) > 39);
    }
  }
  assert.ok(r.worst[0].seconds >= DEAD_RADIUS / WALK_SPEED);
});

test('collectPoints tolerates every spec being absent', () => {
  assert.deepEqual(collectPoints(), []);
  assert.deepEqual(collectPoints({}), []);
  assert.equal(collectPoints({ portals: PORTALS }).length, PORTALS.length);
});

test('collectPoints reads a puzzle through its zone', () => {
  const pts = collectPoints({ puzzles: [{ id: 'p', zones: [{ x: 5, z: 6 }] }] });
  assert.deepEqual(pts, [{ x: 5, z: 6, kind: 'puzzle', id: 'p' }]);
});

// ── The fills ───────────────────────────────────────────────────────────────

test('every fill is a known kind, sited, and has a payload', () => {
  for (const f of CADENCE_FILLS) {
    assert.ok(FILL_KINDS.includes(f.kind), `${f.id} is a "${f.kind}"`);
    assert.ok(Number.isFinite(f.at.x) && Number.isFinite(f.at.z), `${f.id} has no place`);
    assert.ok(f.radius > 0);
    assert.ok(f.payload, `${f.id} promises nothing`);
  }
});

test('fill ids are unique', () => {
  const ids = CADENCE_FILLS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every fill is on walkable land, not in the sea', () => {
  for (const f of CADENCE_FILLS) {
    const y = heightAt(f.at.x, f.at.z);
    assert.ok(y > WORLD.WATER_Y + 1, `${f.id} at (${f.at.x}, ${f.at.z}) is at y=${y.toFixed(2)}`);
  }
});

test('every fill lands in ground the audit actually called dead', () => {
  // This is the test that stops the fills becoming decoration next to things
  // that already existed.
  const pts = islandPoints();
  for (const f of CADENCE_FILLS) {
    const gap = nearestGap(pts, f.at.x, f.at.z);
    assert.ok(gap >= 22,
      `${f.id} is only ${gap.toFixed(0)} m from something that was already there`);
  }
});

test('all four kinds are used — forty more coins is not the fix', () => {
  for (const k of FILL_KINDS) {
    assert.ok(fillsOfKind(k).length > 0, `nothing is a ${k}`);
  }
});

test('the doughnut gets most of the fills, because it is most of the problem', () => {
  const inDoughnut = CADENCE_FILLS.filter((f) => {
    const r = Math.hypot(f.at.x, f.at.z);
    return r >= 55 && r <= 110;
  });
  assert.ok(inDoughnut.length >= 10, `only ${inDoughnut.length} fills on the ring road`);
});

test('a vista points somewhere real and pays for the walk', () => {
  for (const f of fillsOfKind('vista')) {
    const p = f.payload;
    assert.ok(Number.isFinite(p.look.x) && Number.isFinite(p.look.z), `${f.id} looks nowhere`);
    const d = Math.hypot(p.look.x - f.at.x, p.look.z - f.at.z);
    assert.ok(d > 40, `${f.id} "vista" is only ${d.toFixed(0)} m — that is not a view`);
    assert.ok(p.gold > 0 && p.line.length > 0);
    assert.ok(Object.values(PAPER).includes(p.tint), `${f.id} is off-palette`);
    assert.equal(f.once, true, 'a reveal that repeats is not a reveal');
  }
});

test('every vista sits on ground that can actually SEE its subject', () => {
  // Prominence: metres above the mean of a 22 m ring. A "vista" on flat ground
  // is a lie a child spots in half a second.
  const prom = (x, z) => {
    let s = 0;
    for (let a = 0; a < 12; a++) {
      const t = (a * Math.PI) / 6;
      s += heightAt(x + Math.cos(t) * 22, z + Math.sin(t) * 22);
    }
    return heightAt(x, z) - s / 12;
  };
  for (const f of fillsOfKind('vista')) {
    assert.ok(prom(f.at.x, f.at.z) > 4,
      `${f.id} has ${prom(f.at.x, f.at.z).toFixed(1)} m of prominence — flat ground`);
  }
});

test('every trail ends somewhere worth ending', () => {
  // A destination is either authored content OR the end of an authored road.
  // The palace approach is the second kind: worldSpec carves that road on
  // purpose, and a coin trail that hands you to it has done its job.
  const dests = [
    ...islandPoints(),
    ...PATHS.flatMap((p) => p.pts.map(([x, z]) => ({ x, z, kind: 'road' }))),
  ];
  for (const f of fillsOfKind('trail')) {
    const { to } = f.payload;
    const gap = nearestGap(dests, to.x, to.z);
    assert.ok(gap < 25, `${f.id} leads to nothing (${gap.toFixed(0)} m from anything)`);
    assert.ok(heightAt(to.x, to.z) > WORLD.WATER_Y + 1, `${f.id} leads into the sea`);
  }
});

test('a banter fill repeats, on a cooldown', () => {
  for (const f of fillsOfKind('banter')) {
    assert.equal(f.once, false);
    assert.ok(f.cooldown > 0, `${f.id} would fire every time you crossed the ring road`);
  }
});

// ── The trail coins ─────────────────────────────────────────────────────────

test('trail coins are laid between the start and the destination', () => {
  const f = fillsOfKind('trail')[0];
  const coins = trailCollectibles([f]);
  assert.equal(coins.length, f.payload.coins);
  const span = Math.hypot(f.payload.to.x - f.at.x, f.payload.to.z - f.at.z);
  for (const c of coins) {
    assert.ok(Math.hypot(c.x - f.at.x, c.z - f.at.z) < span * 1.3, 'a coin went wandering');
    assert.equal(c.trail, f.id);
    assert.equal(c.kind, 'gold');
    assert.ok(c.amount > 0);
  }
});

test('a trail is a curve, not a fence', () => {
  const f = fillsOfKind('trail')[0];
  const coins = trailCollectibles([f]);
  const dx = f.payload.to.x - f.at.x;
  const dz = f.payload.to.z - f.at.z;
  const len = Math.hypot(dx, dz);
  // Perpendicular offset of the middle coin must be non-trivial.
  const mid = coins[Math.floor(coins.length / 2)];
  const off = Math.abs((mid.x - f.at.x) * (-dz / len) + (mid.z - f.at.z) * (dx / len));
  assert.ok(off > 2, `the trail bows by only ${off.toFixed(1)} m`);
});

test('every trail coin is on dry land', () => {
  for (const c of CADENCE_COLLECTIBLES) {
    assert.ok(heightAt(c.x, c.z) > WORLD.WATER_Y + 0.5,
      `${c.id} at (${c.x}, ${c.z}) is at y=${heightAt(c.x, c.z).toFixed(2)}`);
  }
});

test('coin ids are unique and never collide with the shipped pickups', () => {
  const shipped = new Set(COLLECTIBLES.map((c) => c.id));
  const ids = new Set();
  for (const c of CADENCE_COLLECTIBLES) {
    assert.ok(!ids.has(c.id), `${c.id} twice`);
    assert.ok(!shipped.has(c.id), `${c.id} collides with a worldSpec pickup`);
    ids.add(c.id);
  }
});

test('mergeCollectibles is additive and idempotent', () => {
  const once = mergeCollectibles(COLLECTIBLES);
  assert.equal(once.length, COLLECTIBLES.length + CADENCE_COLLECTIBLES.length);
  assert.equal(mergeCollectibles(once).length, once.length);
  assert.equal(mergeCollectibles().length, CADENCE_COLLECTIBLES.length);
});

test('the fills actually close the holes they were sited in', () => {
  const before = auditCadence({ points: islandPoints(), heightAt, slopeAt });
  const after = auditCadence({
    points: [
      ...islandPoints(),
      ...CADENCE_FILLS.map((f) => ({ x: f.at.x, z: f.at.z, kind: f.kind })),
      ...CADENCE_COLLECTIBLES.map((c) => ({ x: c.x, z: c.z, kind: 'pickup' })),
    ],
    heightAt,
    slopeAt,
  });
  assert.ok(after.deadFraction < before.deadFraction, 'the fills changed nothing');
  const band = (r, res) => res.bands.find((b) => b.r0 === r);
  assert.ok(band(60, after).deadFraction < band(60, before).deadFraction - 0.25,
    'the doughnut is still the doughnut');
  assert.ok(band(80, after).deadFraction < band(80, before).deadFraction - 0.15);
});

// ── The runtime ─────────────────────────────────────────────────────────────

const fresh = () => makeDefaultSave();

test('walking into a vista fires it, once, ever', () => {
  const seen = [];
  const save = fresh();
  const rt = createCadenceRuntime({ save, hooks: { onVista: (f) => seen.push(f.id) } });
  const v = fillsOfKind('vista')[0];

  rt.update(v.at.x + 400, v.at.z, 1);
  assert.equal(seen.length, 0);
  rt.update(v.at.x, v.at.z, 1);
  assert.equal(seen.length, 1);

  // Standing there does not re-fire it...
  for (let i = 0; i < 30; i++) rt.update(v.at.x, v.at.z, 1);
  assert.equal(seen.length, 1);
  // ...and neither does coming back in a later session.
  const rt2 = createCadenceRuntime({ save, hooks: { onVista: (f) => seen.push(f.id) } });
  rt2.update(v.at.x, v.at.z, 1);
  assert.equal(seen.length, 1);
});

test('banter repeats, but only after its cooldown', () => {
  const said = [];
  const b = fillsOfKind('banter')[0];
  const rt = createCadenceRuntime({ save: fresh(), hooks: { onBanter: (f) => said.push(f.id) } });
  rt.update(b.at.x, b.at.z, 1);
  assert.equal(said.length, 1);
  // Walk out and back inside the cooldown: silence.
  rt.update(b.at.x + 500, b.at.z, 1);
  rt.update(b.at.x, b.at.z, 1);
  assert.equal(said.length, 1);
  // Wait it out, walk out and back: they speak again.
  rt.update(b.at.x + 500, b.at.z, b.cooldown + 1);
  rt.update(b.at.x, b.at.z, 1);
  assert.equal(said.length, 2);
});

test('re-entering a fill radius is one event, not one per frame', () => {
  const hits = [];
  const p = fillsOfKind('ping')[0];
  const rt = createCadenceRuntime({ save: fresh(), hooks: { onPing: (f) => hits.push(f.id) } });
  for (let i = 0; i < 60; i++) rt.update(p.at.x, p.at.z, 1 / 60);
  assert.equal(hits.length, 1);
});

test('trail coins are collected by walking over them, and stay collected', () => {
  const got = [];
  const save = fresh();
  const rt = createCadenceRuntime({ save, hooks: { onCoin: (c) => got.push(c.id) } });
  const c = CADENCE_COLLECTIBLES[0];
  rt.update(c.x, c.z, 1 / 60);
  assert.deepEqual(got, [c.id]);
  rt.update(c.x, c.z, 1 / 60);
  assert.equal(got.length, 1);
  const rt2 = createCadenceRuntime({ save, hooks: { onCoin: (x) => got.push(x.id) } });
  rt2.update(c.x, c.z, 1 / 60);
  assert.equal(got.length, 1, 'a coin came back after a reload');
});

test('a host that would rather serve its own coins can switch them off', () => {
  const got = [];
  const rt = createCadenceRuntime({
    save: fresh(), serveCoins: false, hooks: { onCoin: (c) => got.push(c.id) },
  });
  const c = CADENCE_COLLECTIBLES[0];
  rt.update(c.x, c.z, 1 / 60);
  assert.equal(got.length, 0);
});

test('progress climbs as the sights are seen', () => {
  const save = fresh();
  const rt = createCadenceRuntime({ save });
  assert.equal(rt.progress(), 0);
  for (const f of CADENCE_FILLS) {
    if (!f.once) continue;
    rt.update(f.at.x + 500, f.at.z + 500, 1);
    rt.update(f.at.x, f.at.z, 1);
  }
  assert.equal(rt.progress(), 1);
  rt.reset();
  assert.equal(rt.progress(), 0);
});

test('the runtime survives a save that has never seen the overworld', () => {
  const save = fresh();
  delete save.overworld;
  const rt = createCadenceRuntime({ save });
  rt.update(0, 0, 1);
  assert.ok(save.overworld.cadence, 'the ledger must be created eagerly');
});

test('the runtime runs with no save and no hooks at all', () => {
  const rt = createCadenceRuntime({});
  for (const f of CADENCE_FILLS) rt.update(f.at.x, f.at.z, 1);
  assert.ok(rt.progress() >= 0);
});
