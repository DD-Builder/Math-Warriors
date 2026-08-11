/**
 * Companion contract tests.
 *
 * Two things are worth a unit test here, and they are not the art.
 *
 * The first is the FORMATION MATHS — the breadcrumb trail and the offset table.
 * Both are pure, both are the difference between followers who walk your route
 * and followers who slide through scenery, and both fail silently: a trail that
 * quietly loses its oldest sample or an offset that stops collapsing at speed
 * still produces a screenshot that looks fine and gameplay that does not.
 *
 * The second is the BUDGET. The brief is 800 triangles a companion and no
 * shadow pass, and a rig grows by one more ply at a time until it does not
 * notice it has tripled. Both numbers are asserted here so a future edit has to
 * argue with a test instead of with a frame counter.
 *
 * three's core runs headless in plain Node (nothing touches the DOM until a
 * WebGL context is asked for), so these exercise the real module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompanions, createTrail, partyFollowers, formationOffset,
  SLOTS, TRAIL_STEP, TRAIL_CAP,
} from './companions.js';
import { createHeightfield } from './heightfield.js';
import { WORLD } from './worldSpec.js';

const PARTY = {
  party: [
    { id: 'knight-shadow', name: 'Shadow' },
    { id: 'wizard-stargazer', name: 'Star' },
    { id: 'bunny-pepper', name: 'Pepper' },
  ],
};

// ── partyFollowers ─────────────────────────────────────────────────────────

test('companions: followers are party slots 1..2, never the player avatar', () => {
  const f = partyFollowers(PARTY);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.id), ['wizard-stargazer', 'bunny-pepper']);
  assert.deepEqual(f.map((x) => x.heroClass), ['wizard', 'bunny']);
});

test('companions: a class is derived from the id when the save carries none', () => {
  // Battle saves write { id, name, hp, maxHp } and no `class` at all — this is
  // the shape that actually reaches the overworld.
  const f = partyFollowers({ party: [{ id: 'a' }, { id: 'bunny-nova', hp: 3 }] });
  assert.equal(f[0].heroClass, 'bunny');
});

test('companions: a broken or short party costs the child nothing', () => {
  assert.deepEqual(partyFollowers(null), []);
  assert.deepEqual(partyFollowers({}), []);
  assert.deepEqual(partyFollowers({ party: 'nope' }), []);
  assert.deepEqual(partyFollowers({ party: [{ id: 'knight-shadow' }] }), []);
  const holes = partyFollowers({ party: [{ id: 'a' }, null, { id: 'wizard-nova' }] });
  assert.equal(holes.length, 1);
  assert.equal(holes[0].heroClass, 'wizard');
});

// ── createTrail ────────────────────────────────────────────────────────────

test('trail: sampling is gated on DISTANCE, not on calls', () => {
  const t = createTrail(16, 0.5);
  t.reset(0, 0);
  assert.equal(t.length, 1);
  for (let i = 0; i < 20; i++) t.push(0.01 * i, 0);   // never 0.5 m from the last
  assert.equal(t.length, 1, 'sub-step pushes must not grow the trail');
  assert.equal(t.push(0.6, 0), true);
  assert.equal(t.length, 2);
});

test('trail: sampleBack returns the point that far along the path', () => {
  const t = createTrail(64, 0.2);
  t.reset(0, 0);
  for (let i = 1; i <= 40; i++) t.push(i * 0.25, 0);   // a straight run east
  const out = { x: 0, z: 0, tx: 0, tz: 0 };
  assert.equal(t.sampleBack(3, out), true);
  assert.ok(Math.abs(out.x - 7) < 1e-6, `x ${out.x} == 10 - 3`);
  assert.equal(out.z, 0);
  // Tangent points the way the leader was travelling.
  assert.ok(Math.abs(out.tx - 1) < 1e-6);
  assert.ok(Math.abs(out.tz) < 1e-6);
});

test('trail: a corner is followed round, not cut across', () => {
  const t = createTrail(64, 0.2);
  t.reset(0, 0);
  for (let i = 1; i <= 20; i++) t.push(i * 0.5, 0);      // 10 m east
  for (let i = 1; i <= 20; i++) t.push(10, i * 0.5);     // then 10 m south
  const out = { x: 0, z: 0, tx: 0, tz: 0 };
  // 4 m back from the end is still on the SOUTHBOUND leg…
  t.sampleBack(4, out);
  assert.ok(Math.abs(out.x - 10) < 1e-6 && Math.abs(out.z - 6) < 1e-6, `${out.x},${out.z}`);
  // …and 14 m back is on the EASTBOUND leg, i.e. round the corner. A rigid
  // offset follower would be standing in the middle of the turn instead.
  t.sampleBack(14, out);
  assert.ok(Math.abs(out.z) < 1e-6 && Math.abs(out.x - 6) < 1e-6, `${out.x},${out.z}`);
});

test('trail: too little history extrapolates instead of collapsing', () => {
  const t = createTrail(64, 0.2);
  t.reset(0, 0);
  for (let i = 1; i <= 4; i++) t.push(i * 0.25, 0);   // only 1 m of path
  const out = { x: 0, z: 0, tx: 0, tz: 0 };
  assert.equal(t.sampleBack(5, out), false, 'reports that it had to extrapolate');
  // Extrapolated backwards along the path direction, not clamped onto the end.
  assert.ok(out.x < -3.5, `x ${out.x} extrapolated behind the oldest sample`);
});

test('trail: the ring wraps without corrupting the arc length', () => {
  const cap = 8;
  const t = createTrail(cap, 0.5);
  t.reset(0, 0);
  for (let i = 1; i <= 40; i++) t.push(i, 0);   // far more pushes than capacity
  assert.equal(t.length, cap);
  const out = { x: 0, z: 0, tx: 0, tz: 0 };
  assert.equal(t.sampleBack(3, out), true);
  assert.ok(Math.abs(out.x - 37) < 1e-6, `x ${out.x} == 40 - 3`);
});

test('trail: capacity covers the longest formation lag with room to spare', () => {
  const longest = Math.max(...SLOTS.map((s) => s.lag));
  assert.ok(TRAIL_CAP * TRAIL_STEP > longest * 3,
    `${TRAIL_CAP} * ${TRAIL_STEP} m must comfortably exceed the ${longest} m lag`);
});

// ── formationOffset ────────────────────────────────────────────────────────

test('formation: the file collapses toward single file at speed', () => {
  const idle = formationOffset(0, 0, 0);
  const sprint = formationOffset(0, 1, 0);
  assert.ok(Math.abs(sprint.side) < Math.abs(idle.side),
    'a sprinting party must tuck in behind, not run abreast');
  assert.equal(idle.lag, SLOTS[0].lag);
});

test('formation: a scatter blooms the file and lengthens the lag', () => {
  const calm = formationOffset(1, 0, 0);
  const blown = formationOffset(1, 0, 1);
  assert.ok(Math.abs(blown.side) > Math.abs(calm.side) * 2, 'scatter fans them out');
  assert.ok(blown.lag > calm.lag, 'scatter drops them back');
});

test('formation: the two slots are asymmetric on purpose', () => {
  assert.notEqual(SLOTS[0].lag, SLOTS[1].lag);
  assert.notEqual(Math.abs(SLOTS[0].side), Math.abs(SLOTS[1].side));
  // Opposite sides — a party, not a queue.
  assert.ok(SLOTS[0].side * SLOTS[1].side < 0);
});

// ── The built rig ──────────────────────────────────────────────────────────

const hf = createHeightfield(WORLD.SEED);

/**
 * Advance the rig at a fixed 60 Hz. The clock is a caller-owned object because
 * the companions derive dt from the animation clock they are handed: a helper
 * with its own local `t` would hand time BACKWARDS on its second call, every dt
 * would clamp to zero, and every assertion after the first would silently pass
 * against a frozen rig.
 */
function drive(co, clock, steps, fn) {
  let leader = null;
  for (let i = 0; i < steps; i++) {
    clock.t += 1 / 60;
    leader = fn(i, clock.t);
    co.update(leader, clock.t);
  }
  return leader;
}
const clock = () => ({ t: 0 });

test('companions: budget — 5 nodes, <=800 triangles each, no shadow pass', () => {
  for (const pair of [
    ['knight-shadow', 'knight-crusader'],
    ['wizard-stargazer', 'wizard-bookworm'],
    ['bunny-pepper', 'bunny-nova'],
  ]) {
    const co = createCompanions({
      save: { party: [{ id: 'knight-shadow' }, { id: pair[0] }, { id: pair[1] }] },
      heightfield: hf,
    });
    assert.equal(co.stats.count, 2);
    assert.equal(co.stats.nodesEach, 5);
    for (const n of co.stats.trianglesEach) {
      assert.ok(n <= 800, `${pair[0]} companion ${n} tris <= 800`);
      assert.ok(n > 350, `${pair[0]} companion ${n} tris — a stick figure is not a hero`);
    }
    // 5 nodes x 2 companions + one InstancedMesh carrying both contact shadows.
    assert.equal(co.stats.colorPassCalls, 11);
    assert.equal(co.stats.shadowPassCalls, 0);
    co.dispose();
  }
});

test('companions: an empty party builds nothing at all', () => {
  const co = createCompanions({ save: { party: [{ id: 'knight-shadow' }] }, heightfield: hf });
  assert.equal(co.stats.count, 0);
  assert.equal(co.stats.drawCalls, 0);
  assert.equal(co.group.children.length, 0);
  // update() on an empty party must be a no-op, not a crash.
  co.update({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true }, 1);
  co.dispose();
});

test('companions: they trail the leader at roughly their authored lags', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  const start = { pos: { x: 0, y: hf.sampleHeight(0, 0), z: 60 }, vel: { x: 0, y: 0, z: 0 }, yaw: Math.PI, grounded: true };
  co.reset(start);
  const ck = clock();
  let z = 60;
  drive(co, ck, 600, () => {
    z -= 6 / 60;
    return { pos: { x: 0, y: hf.sampleHeight(0, z), z }, vel: { x: 0, y: 0, z: -6 }, yaw: Math.PI, grounded: true };
  });
  const gaps = co.members.map((m) => Math.hypot(m.x - 0, m.z - z));
  gaps.forEach((g, i) => {
    assert.ok(g > SLOTS[i].lag * 0.6 && g < SLOTS[i].lag + 3,
      `companion ${i} gap ${g.toFixed(2)} near its ${SLOTS[i].lag} m lag`);
  });
  assert.ok(gaps[1] > gaps[0], 'the second slot trails the first');
  co.dispose();
});

test('companions: a teleport is caught up by the leash, not chased forever', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  const here = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true };
  here.pos.y = hf.sampleHeight(0, 0);
  co.reset(here);
  const before = co.members.map((m) => m.catchUps);
  // The player is now 120 m away on the far side of the island.
  const far = { pos: { x: 120, y: hf.sampleHeight(120, 90), z: 90 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true };
  drive(co, clock(), 30, () => far);
  for (const m of co.members) {
    assert.ok(m.catchUps > before[m.index], 'the leash fired');
    assert.ok(Math.hypot(m.x - 120, m.z - 90) < 12,
      `companion landed near the leader, not at ${m.x.toFixed(0)},${m.z.toFixed(0)}`);
  }
  co.dispose();
});

test('companions: a jump scatters them and they visibly regroup afterwards', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  const base = (z, grounded) => ({
    pos: { x: 0, y: hf.sampleHeight(0, z), z }, vel: { x: 0, y: 0, z: -8.5 },
    yaw: Math.PI, grounded,
  });
  co.reset(base(0, true));
  const ck = clock();
  let z = 0;
  // Settle into formation at a run.
  drive(co, ck, 240, () => { z -= 8.5 / 60; return base(z, true); });
  const settled = co.members.map((m) => Math.hypot(m.x, m.z - z));
  // Leave the ground: scatter.
  drive(co, ck, 20, () => { z -= 8.5 / 60; return base(z, false); });
  const scattered = co.members.map((m) => Math.hypot(m.x, m.z - z));
  assert.ok(scattered.some((d, i) => d > settled[i] + 0.2), 'the jump threw them off formation');
  // …then let it decay.
  drive(co, ck, 300, () => { z -= 8.5 / 60; return base(z, true); });
  const regrouped = co.members.map((m) => Math.hypot(m.x, m.z - z));
  regrouped.forEach((d, i) => {
    assert.ok(Math.abs(d - settled[i]) < 0.6,
      `companion ${i} returned to formation (${d.toFixed(2)} vs ${settled[i].toFixed(2)})`);
  });
  co.dispose();
});

test('companions: standing still, they turn to face the leader', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  const still = { pos: { x: 0, y: hf.sampleHeight(0, 0), z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true };
  co.reset(still);
  drive(co, clock(), 240, () => still);
  for (const m of co.members) {
    const want = Math.atan2(0 - m.x, 0 - m.z);
    let d = m.yaw - want;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    assert.ok(Math.abs(d) < 0.25, `companion ${m.index} faces the leader (off by ${d.toFixed(2)})`);
  }
  co.dispose();
});

test('companions: reset() is deterministic — the pose harness depends on it', () => {
  const make = () => createCompanions({ save: PARTY, heightfield: hf });
  const spawn = { pos: { x: 12, y: hf.sampleHeight(12, -30), z: -30 }, vel: { x: 0, y: 0, z: 0 }, yaw: 1.1, grounded: true };
  const a = make();
  const b = make();
  a.reset(spawn);
  b.reset(spawn);
  // Drive one of them hard, then reset it back to the same spawn.
  const ck = clock();
  let z = -30;
  drive(a, ck, 400, (i) => {
    z -= 8.5 / 60;
    return { pos: { x: 12, y: hf.sampleHeight(12, z), z }, vel: { x: 0, y: 0, z: -8.5 }, yaw: 1.1, grounded: i % 90 !== 0 };
  });
  a.reset(spawn);
  a.members.forEach((m, i) => {
    const n = b.members[i];
    assert.ok(Math.abs(m.x - n.x) < 1e-9 && Math.abs(m.z - n.z) < 1e-9,
      `companion ${i} resets to the same place`);
    assert.equal(m.rnd, n.rnd, 'and to the same random stream');
  });
  a.dispose();
  b.dispose();
});

test('companions: they stand on the ground, never under the sea', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  // A shoreline walk, where the ground goes below the water plane.
  const start = { pos: { x: 180, y: 0, z: 140 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true };
  start.pos.y = hf.sampleHeight(180, 140);
  co.reset(start);
  const ck = clock();
  let x = 180;
  drive(co, ck, 400, () => {
    x -= 6 / 60;
    return { pos: { x, y: hf.sampleHeight(x, 140), z: 140 }, vel: { x: -6, y: 0, z: 0 }, yaw: -Math.PI / 2, grounded: true };
  });
  for (const m of co.members) {
    assert.ok(m.y >= WORLD.WATER_Y - 1e-6, `companion y ${m.y.toFixed(2)} is not under the sea`);
    assert.ok(Number.isFinite(m.x) && Number.isFinite(m.z));
  }
  co.dispose();
});

test('companions: dispose() lets go of every geometry and material', () => {
  const co = createCompanions({ save: PARTY, heightfield: hf });
  const seen = [];
  co.group.traverse((o) => { if (o.geometry) seen.push(o.geometry); });
  assert.ok(seen.length > 0);
  co.dispose();
  assert.equal(co.group.children.length, 0);
  assert.equal(co.stats.materials, 2, 'one papercut skin + one shadow material, shared by both');
});
