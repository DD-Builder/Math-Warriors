/**
 * traversalSpec.test.js — the island's climbs and flights, flown.
 *
 * This suite does not check that the data file parses. It runs the REAL
 * traversal controller over the REAL heightfield and asserts that every
 * authored route can actually be climbed and every authored line can actually
 * be flown. That makes the spec structurally true rather than luckily true: a
 * terrain edit that softens the Palace face, or a tuning edit that cuts the
 * glide ratio, turns a test red instead of silently deleting a landmark.
 *
 * It is the slowest suite in src/overworld (a few seconds of simulation) and
 * it earns every millisecond.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeightfield } from './heightfield.js';
import { createCollisionWorld, WATER_Y } from './collision.js';
import { createTraversalController, MODES, DEFAULT_TRAVERSAL_TUNING } from './traversal.js';
import { WORLD } from './worldSpec.js';
import {
  CLIMB_ROUTES, GLIDE_LINES, THERMALS, FLOATABLES, LAUNCH_PADS,
  createThermalField, glideRatio, nearestClimbRoute, nearestLaunchPad, lineMetrics,
  linesFromPad,
} from './traversalSpec.js';

const DT = 1 / 60;
const hf = createHeightfield(WORLD.SEED);
const groundAt = (x, z) => hf.sampleHeight(x, z);
const world = () => createCollisionWorld(hf);
const field = createThermalField(THERMALS, groundAt);
const SLOPE_COS = Math.cos((DEFAULT_TRAVERSAL_TUNING.slopeLimitDeg ?? 50) * Math.PI / 180);

// ── Data hygiene ──────────────────────────────────────────────────────────

test('every id in the spec is unique', () => {
  const all = [...CLIMB_ROUTES, ...GLIDE_LINES, ...THERMALS, ...FLOATABLES, ...LAUNCH_PADS]
    .map((e) => e.id);
  assert.equal(new Set(all).size, all.length, 'duplicate id in traversalSpec');
});

test('every climb direction is a unit vector', () => {
  for (const r of CLIMB_ROUTES) {
    const m = Math.hypot(r.dir.x, r.dir.z);
    assert.ok(Math.abs(m - 1) < 1e-3, `${r.id}: dir has length ${m}`);
  }
});

test('everything authored sits inside the island bounds', () => {
  const lim = WORLD.HALF - 4;
  const pts = [
    ...CLIMB_ROUTES.map((r) => [r.id, r.base.x, r.base.z]),
    ...GLIDE_LINES.flatMap((g) => [[`${g.id}.from`, g.from.x, g.from.z], [`${g.id}.to`, g.to.x, g.to.z]]),
    ...THERMALS.map((t) => [t.id, t.x, t.z]),
    ...FLOATABLES.map((f) => [f.id, f.x, f.z]),
  ];
  for (const [id, x, z] of pts) {
    assert.ok(Math.abs(x) < lim && Math.abs(z) < lim, `${id} is outside the world at ${x},${z}`);
  }
});

test('the island offers climbs at every difficulty, spread over the biomes', () => {
  const grades = new Set(CLIMB_ROUTES.map((r) => r.grade));
  assert.ok(grades.has('easy') && grades.has('fair') && grades.has('epic'));
  assert.ok(CLIMB_ROUTES.filter((r) => r.grade === 'easy').length >= 3,
    'a five-year-old needs several climbs they cannot fail');
  const biomes = new Set(CLIMB_ROUTES.map((r) => r.biome));
  assert.ok(biomes.size >= 8, `only ${biomes.size} biomes have a named climb`);
});

// ── The climbs, actually climbed ──────────────────────────────────────────

/** Push into a route's face for `secs` and report what happened. */
function climb(route, secs = 24) {
  const c = createTraversalController(world(), {}, field);
  let s = c.spawnState({ x: route.base.x, z: route.base.z });
  const start = s;
  let grabbed = false;
  let mantled = false;
  let rescued = false;
  let latchSeconds = Infinity;
  // Height is measured ON THE WALL only: peak minus the height at the moment
  // the hands went on. Measuring from the spawn would credit the climb with
  // whatever the hero walked up afterwards, which is how a gentle hill scores
  // as a cliff.
  let grabY = null;
  let peak = -Infinity;
  let minStamina = s.stamina;
  for (let i = 0; i < secs * 60; i++) {
    s = c.step(s, { x: route.dir.x, y: route.dir.z }, DT);
    const onWall = s.mode === MODES.CLIMB || s.mode === MODES.MANTLE;
    if (onWall) {
      if (grabY === null) { grabY = s.pos.y; latchSeconds = i * DT; }
      if (s.pos.y > peak) peak = s.pos.y;
      if (s.stamina < minStamina) minStamina = s.stamina;
    }
    if (s.mode === MODES.CLIMB) grabbed = true;
    if (s.mode === MODES.MANTLE) mantled = true;
    if (s.event === 'rescue') rescued = true;
    assert.ok(Number.isFinite(s.pos.y), `${route.id}: y went non-finite`);
  }
  return {
    start, end: s, grabbed, mantled, rescued, latchSeconds, minStamina,
    peak: grabY === null ? start.pos.y : peak,
    gain: grabY === null ? 0 : peak - grabY,
  };
}

test('every climb route starts on dry ground the hero can stand on', () => {
  for (const r of CLIMB_ROUTES) {
    const y = groundAt(r.base.x, r.base.z);
    assert.ok(y > WATER_Y + 0.4, `${r.id}: base at y=${y.toFixed(1)} is in the sea`);
    const n = hf.sampleNormal(r.base.x, r.base.z);
    assert.ok(n[1] >= SLOPE_COS,
      `${r.id}: base is a ${(Math.acos(n[1]) * 57.3).toFixed(0)}-degree slope, not a standing spot`);
    const c = createTraversalController(world(), {}, field);
    const s = c.spawnState({ x: r.base.x, z: r.base.z });
    assert.equal(s.mode, MODES.WALK, `${r.id}: you do not arrive walking`);
    assert.equal(s.grounded, true, `${r.id}: you do not arrive on your feet`);
  }
});

for (const r of CLIMB_ROUTES) {
  test(`climb route "${r.name}" (${r.id}) can be climbed`, () => {
    const res = climb(r);
    assert.ok(res.grabbed, `${r.id}: pushing into the face never latched on`);
    assert.ok(res.latchSeconds < 3,
      `${r.id}: took ${res.latchSeconds.toFixed(1)}s to find the wall — that is not a landmark`);
    assert.ok(res.mantled, `${r.id}: never reached a ledge to mantle`);
    assert.ok(res.gain > r.gain * 0.75,
      `${r.id}: only gained ${res.gain.toFixed(1)} m of the authored ${r.gain} m`);
    assert.ok(res.peak > r.topY - 3,
      `${r.id}: topped out at ${res.peak.toFixed(1)}, authored ${r.topY}`);
  });
}

test('the two epic climbs are genuinely hard and still finishable', () => {
  for (const r of CLIMB_ROUTES.filter((q) => q.grade === 'epic')) {
    const res = climb(r);
    assert.ok(res.minStamina < 40,
      `${r.id}: never dipped below ${res.minStamina.toFixed(0)} stamina — that is not epic`);
    assert.ok(res.gain > 40, `${r.id}: an epic climb must be worth 40+ m`);
  }
});

test('the easy climbs never scare anyone: the pool stays comfortably full', () => {
  for (const r of CLIMB_ROUTES.filter((q) => q.grade === 'easy')) {
    const res = climb(r);
    assert.ok(res.minStamina > 55,
      `${r.id}: an "easy" climb dropped the pool to ${res.minStamina.toFixed(0)}`);
    assert.equal(res.rescued, false, `${r.id}: an easy climb must never need the grace`);
  }
});

test('no authored climb ever ends with the hero stuck, falling forever, or in a bad state', () => {
  for (const r of CLIMB_ROUTES) {
    const res = climb(r, 30);
    assert.ok(Object.values(MODES).includes(res.end.mode));
    assert.ok(res.end.stamina >= 0 && res.end.stamina <= 100);
    assert.ok(res.end.pos.y > -50, `${r.id}: fell through the world`);
  }
});

// ── The flights, actually flown ───────────────────────────────────────────

/**
 * Walk off a launch perch toward the target and steer at it. Returns the
 * closest horizontal approach and how the flight ended.
 *
 * The steering is a plain homing vector — no skill, no anticipation, no
 * thermal hunting. If a line only closes for an expert it does not count.
 */
function fly(line, secs = 70) {
  const c = createTraversalController(world(), {}, field);
  let s = c.spawnState({ x: line.from.x, z: line.from.z });
  assert.equal(s.mode, MODES.WALK, `${line.id}: the perch is not standable`);
  const startY = s.pos.y;
  let closest = Infinity;
  let opened = false;
  let glideFrames = 0;
  let maxLift = 0;
  let transit = 0;
  for (let i = 0; i < secs * 60; i++) {
    const dx = line.to.x - s.pos.x;
    const dz = line.to.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < closest) closest = d;
    if (d < 12) break;                       // arrived overhead: that counts
    if (s.mode === MODES.GLIDE) { opened = true; glideFrames++; }
    if (s.lift > maxLift) maxLift = s.lift;
    transit = i * DT;
    // A child leaving a rim: hold jump to hop off, keep tapping it to open the
    // canopy, then stop the moment it is open (another tap would fold it).
    const jump = s.mode !== MODES.GLIDE && (s.grounded || s.vel.y <= 0);
    s = c.step(s, { x: d > 1e-6 ? dx / d : 0, y: d > 1e-6 ? dz / d : 0, jump }, DT);
  }
  return { end: s, closest, opened, glideSeconds: glideFrames * DT, transit, startY, maxLift };
}

test('every launch perch is standable ground with real air under the next step', () => {
  for (const p of LAUNCH_PADS) {
    const y = groundAt(p.x, p.z);
    assert.ok(y > 12, `${p.id}: a launch perch at y=${y.toFixed(1)} is not a summit`);
    const n = hf.sampleNormal(p.x, p.z);
    assert.ok(n[1] >= SLOPE_COS, `${p.id}: you cannot stand on the perch`);
  }
});

for (const g of GLIDE_LINES) {
  test(`glide line "${g.name}" (${g.id}) can be flown`, () => {
    const res = fly(g);
    assert.ok(res.opened, `${g.id}: the canopy never opened — no drop off the perch`);
    assert.ok(res.closest < 12,
      `${g.id}: came within ${res.closest.toFixed(0)} m of the target, not 12`);
    assert.ok(res.glideSeconds > 2.5, `${g.id}: only ${res.glideSeconds.toFixed(1)}s under canopy`);
    assert.ok(res.glideSeconds > res.transit * 0.5,
      `${g.id}: most of the journey was not a glide`);
  });
}

test('the hero line — Palace summit to the offshore spire — is a real crossing', () => {
  const hero = GLIDE_LINES.find((g) => g.hero);
  assert.ok(hero, 'the island must have one flagship glide');
  const m = lineMetrics(hero, groundAt);
  assert.ok(m.dist > 180, `the flagship glide is only ${m.dist.toFixed(0)} m long`);
  const res = fly(hero);
  assert.ok(res.glideSeconds > 15,
    `only ${res.glideSeconds.toFixed(1)}s in the air — that is not a highlight`);
  assert.ok(res.closest < 12);
  assert.equal(hero.thermal, undefined,
    'the flagship glide must not depend on catching anything');
});

test('the thermal-assisted lines really do need the thermals', () => {
  const assisted = GLIDE_LINES.filter((g) => g.thermal);
  assert.ok(assisted.length >= 2, 'thermals need lines that depend on them or they are decoration');
  for (const g of assisted) {
    const m = lineMetrics(g, groundAt);
    assert.ok(m.needRatio > glideRatio(),
      `${g.id} is flagged thermal but closes on glide ratio alone (${m.needRatio.toFixed(2)})`);
    const res = fly(g);
    assert.ok(res.maxLift > 1, `${g.id}: the flight never actually found a column`);
  }
});

test('the plain lines do NOT need thermals — they close on the ratio alone', () => {
  for (const g of GLIDE_LINES.filter((q) => !q.thermal)) {
    const m = lineMetrics(g, groundAt);
    assert.ok(m.needRatio < glideRatio(),
      `${g.id} needs ${m.needRatio.toFixed(2)} : 1 but the canopy only does ${glideRatio().toFixed(2)}`);
  }
});

// ── Thermals ──────────────────────────────────────────────────────────────

test('the thermal field is pure, finite, non-negative and clamped everywhere', () => {
  const { thermalAt } = field;
  for (let i = 0; i < 4000; i++) {
    const x = (i * 37) % 460 - 230;
    const z = (i * 91) % 460 - 230;
    const y = (i % 90) - 5;
    const t = i * 0.031;
    const a = thermalAt(x, y, z, t);
    const b = thermalAt(x, y, z, t);
    assert.equal(a, b, 'thermalAt is not a pure function of its arguments');
    assert.ok(Number.isFinite(a) && a >= 0, `bad lift ${a} at ${x},${y},${z}`);
    assert.ok(a <= 6, `lift ${a} at ${x},${y},${z} is stronger than any authored column`);
  }
});

test('a column lifts inside its radius, does nothing outside it, and has a ceiling', () => {
  // One column alone, so a neighbour cannot answer for it.
  const t = { id: 'solo', x: 0, z: 0, r: 20, strength: 5, rise: 40, kind: 'vent' };
  const f = createThermalField([t], () => 0);
  assert.ok(f.thermalAt(0, 5, 0, 0) > t.strength * 0.7, 'no lift in the core');
  assert.equal(f.thermalAt(0, 5, t.r * 2.2, 0), 0, 'lift leaked outside 2r');
  assert.equal(f.thermalAt(0, t.rise * 1.6, 0, 0), 0, 'the column has no ceiling');
  assert.equal(f.thermalAt(0, -8, 0, 0), 0, 'lift below the vent');
  // …and it fades rather than cutting off, at both the rim and the ceiling.
  assert.ok(f.thermalAt(t.r * 1.4, 5, 0, 0) > 0);
  assert.ok(f.thermalAt(0, t.rise * 1.2, 0, 0) > 0);
});

test('columns do not stack — a cluster is wide lift, never a rocket', () => {
  const cluster = [
    { id: 'a', x: 0, z: 0, r: 20, strength: 5, rise: 40 },
    { id: 'b', x: 1, z: 0, r: 20, strength: 5, rise: 40 },
    { id: 'c', x: 0, z: 1, r: 20, strength: 5, rise: 40 },
  ];
  const f = createThermalField(cluster, () => 0);
  assert.ok(f.thermalAt(0.5, 5, 0.5, 0) <= 5.001);
});

test('every thermal sits over ground a child has a reason to believe in', () => {
  for (const t of THERMALS) {
    assert.ok(t.strength > 0 && t.strength <= 6, `${t.id}: implausible strength`);
    assert.ok(t.r >= 12, `${t.id}: a column this narrow can never be found`);
    assert.ok(['vent', 'rock', 'paver', 'shallow'].includes(t.kind), `${t.id}: unknown kind`);
    if (t.kind !== 'shallow') {
      assert.ok(groundAt(t.x, t.z) > WATER_Y, `${t.id}: a rock thermal over open sea`);
    }
  }
});

// ── Floatables ────────────────────────────────────────────────────────────

test('every floatable is in genuinely swimmable water', () => {
  for (const f of FLOATABLES) {
    const g = groundAt(f.x, f.z);
    assert.ok(WATER_Y - g >= DEFAULT_TRAVERSAL_TUNING.swimDepth,
      `${f.id}: only ${(WATER_Y - g).toFixed(1)} m of water — you would be wading`);
  }
});

test('floatable decks sit above the waterline and are big enough to stand on', () => {
  for (const f of FLOATABLES) {
    assert.ok(f.lift > 0.1, `${f.id}: the deck is under water`);
    assert.ok(f.r >= 1.8, `${f.id}: too small a target for a thumb`);
  }
});

// ── Lookups ───────────────────────────────────────────────────────────────

test('nearestClimbRoute finds the route you are standing at, and nothing else', () => {
  const r = CLIMB_ROUTES[0];
  assert.equal(nearestClimbRoute(r.base.x, r.base.z)?.id, r.id);
  assert.equal(nearestClimbRoute(r.base.x + 400, r.base.z), null);
  // No two route bases may sit inside one prompt radius, or the prompt lies.
  for (const a of CLIMB_ROUTES) {
    assert.equal(nearestClimbRoute(a.base.x, a.base.z, 12)?.id, a.id,
      `${a.id} is shadowed by another route's base`);
  }
});

test('nearestLaunchPad finds a perch you are standing on', () => {
  const p = LAUNCH_PADS[0];
  assert.equal(nearestLaunchPad(p.x, p.z)?.id, p.id);
  assert.equal(nearestLaunchPad(p.x + 999, p.z), null);
});

test('every line names a real pad, and every pad is used', () => {
  for (const g of GLIDE_LINES) {
    const p = LAUNCH_PADS.find((q) => q.id === g.pad);
    assert.ok(p, `${g.id} names unknown pad ${g.pad}`);
    // `from` is materialised from the pad, so the two can never drift.
    assert.equal(g.from.x, p.x);
    assert.equal(g.from.z, p.z);
  }
  for (const p of LAUNCH_PADS) {
    assert.ok(linesFromPad(p.id).length >= 1, `${p.id} has no flights`);
  }
});
