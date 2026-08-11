/**
 * traversal.test.js — the traversal state machine, pinned.
 *
 * Everything in traversal.js is pure logic over the collision-world contract,
 * so every rule in it is testable in plain Node against a synthetic
 * heightfield. That matters more here than almost anywhere else in the
 * codebase: this file is the difference between "climbing works on my machine"
 * and "a five-year-old cannot get stuck, cannot drown, and cannot fall off a
 * cliff they had already climbed".
 *
 * The four properties every test group leans on:
 *   PURITY        step() never mutates the state or input handed to it.
 *   DETERMINISM   the same input sequence replays to a byte-identical state.
 *   TOTALITY      every returned state carries every field, always defined.
 *   KINDNESS      no branch anywhere produces a death, a drown, or a stuck.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionWorld, WATER_Y } from './collision.js';
import {
  createTraversalController,
  DEFAULT_TRAVERSAL_TUNING,
  MODES,
  EVENTS,
  staminaFraction,
  staminaVisible,
  isUnderwater,
  rigFlags,
} from './traversal.js';

// ── Synthetic worlds ──────────────────────────────────────────────────────
// A heightfield is just { sampleHeight, sampleNormal }. Building them from a
// scalar function and a central difference gives the same normal convention
// the real heightfield uses (-dh/dx, 1, -dh/dz), normalised.

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

const worldFrom = (h) => createCollisionWorld(fieldFrom(h));

/** Dead flat ground at y = 2. */
const FLAT = () => worldFrom(() => 2);

/**
 * A 76-degree face: flat at 0 out to x = 10, rising 4:1 to a plateau at
 * y = 20 from x = 15 on. Steeper than the 50-degree walk limit, so the walk
 * controller calls it a wall and traversal calls it a ladder.
 */
const CLIFF_TOP = 20;
const cliffH = (x) => (x < 10 ? 0 : x > 15 ? CLIFF_TOP : (x - 10) * 4);
const CLIFF = () => worldFrom((x) => cliffH(x));

/**
 * A near-sheer wall (83 degrees): 0 out to x = 10, up 8:1 to a plateau at
 * y = 12. Not literally vertical on purpose — a heightfield samples its
 * normals by central difference, so a true step function reads as FLAT
 * everywhere except the one sample that straddles it, and the real island
 * has no such surface either.
 */
const SHEER_TOP = 12;
const SHEER = () => worldFrom((x) => (x < 10 ? 0 : Math.min(SHEER_TOP, (x - 10) * 8)));

/** Open ocean, seabed 6 m down everywhere. */
const OCEAN = () => worldFrom(() => -6);

/** A beach: seabed climbs out of the water going +x, dry land past x = 20. */
const beachH = (x) => -6 + x * 0.4;
const BEACH = () => worldFrom(beachH);

/** Ground far below, for glide tests: a plain at y = 0 with the body up high. */
const PLAIN = () => worldFrom(() => 0);

const DT = 1 / 60;

/** Run `n` fixed steps of one input and return the final state. */
function run(ctrl, state, input, n, dt = DT) {
  let s = state;
  for (let i = 0; i < n; i++) s = ctrl.step(s, input, dt);
  return s;
}

/** Run until `pred(state)` or `n` steps elapse. Returns { state, steps, hit }. */
function until(ctrl, state, input, pred, n = 4000, dt = DT) {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = ctrl.step(s, input, dt);
    if (pred(s)) return { state: s, steps: i + 1, hit: true };
  }
  return { state: s, steps: n, hit: false };
}

/** Collect every non-null `event` a run emits. */
function events(ctrl, state, input, n, dt = DT) {
  const out = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    s = ctrl.step(s, input, dt);
    if (s.event) out.push(s.event);
  }
  return out;
}

const STATE_FIELDS = [
  'pos', 'vel', 'yaw', 'grounded', 'wading', 'mode', 'stamina', 'tired',
  'wall', 'mantle', 'swimT', 'dive', 'airTime', 'latchLock', 'simT',
  'climbT', 'shimmy', 'grace', 'autoOff', 'towing', 'lift', 'underwater', 'event',
];

function assertWellFormed(s, where) {
  for (const k of STATE_FIELDS) {
    assert.ok(k in s, `${where}: state is missing '${k}'`);
    assert.notEqual(s[k], undefined, `${where}: '${k}' is undefined`);
  }
  for (const k of ['x', 'y', 'z']) {
    assert.ok(Number.isFinite(s.pos[k]), `${where}: pos.${k} is not finite`);
    assert.ok(Number.isFinite(s.vel[k]), `${where}: vel.${k} is not finite`);
  }
  assert.ok(Number.isFinite(s.yaw), `${where}: yaw is not finite`);
  assert.ok(Number.isFinite(s.stamina), `${where}: stamina is not finite`);
  assert.ok(s.stamina >= 0, `${where}: stamina went negative`);
  assert.ok(Object.values(MODES).includes(s.mode), `${where}: bad mode ${s.mode}`);
}

// ── Shape, purity, determinism ────────────────────────────────────────────

test('spawnState is well formed and starts walking on dry land', () => {
  const c = createTraversalController(FLAT());
  const s = c.spawnState({ x: 0, z: 0 });
  assertWellFormed(s, 'spawn');
  assert.equal(s.mode, MODES.WALK);
  assert.equal(s.grounded, true);
  assert.equal(s.stamina, c.tuning.staminaMax);
  assert.equal(s.event, null);
  assert.equal(s.pos.y, 2);
});

test('spawning in deep water starts you swimming, not drowning', () => {
  const c = createTraversalController(OCEAN());
  const s = c.spawnState({ x: 0, z: 0 });
  assert.equal(s.mode, MODES.SWIM);
  assert.equal(s.event, null, 'a spawn is not a splash');
  assert.ok(s.pos.y < WATER_Y && s.pos.y > WATER_Y - 1);
  assertWellFormed(s, 'ocean spawn');
});

test('step() does not mutate the state or the input it is given', () => {
  const c = createTraversalController(CLIFF());
  const s0 = c.spawnState({ x: 9.6, z: 0 });
  const before = JSON.parse(JSON.stringify(s0));
  const input = { x: 1, y: 0, jump: true, run: true, dive: true };
  const inputBefore = { ...input };
  c.step(s0, input, DT);
  assert.deepEqual(JSON.parse(JSON.stringify(s0)), before, 'state was mutated');
  assert.deepEqual(input, inputBefore, 'input was mutated');
});

test('a long mixed run is deterministic and never leaves the state malformed', () => {
  const mk = () => createTraversalController(CLIFF());
  const script = (i) => ({
    x: Math.sin(i * 0.11), y: Math.cos(i * 0.07),
    jump: i % 97 === 0, run: i % 5 === 0, dive: i % 13 === 0,
  });
  const play = () => {
    const c = mk();
    let s = c.spawnState({ x: 4, z: 0 });
    const trace = [];
    for (let i = 0; i < 1500; i++) {
      s = c.step(s, script(i), DT);
      assertWellFormed(s, `step ${i}`);
      trace.push(s.mode, s.pos.x, s.pos.y, s.pos.z, s.stamina, s.event);
    }
    return JSON.stringify(trace);
  };
  assert.equal(play(), play());
});

test('a state round-tripped through JSON replays identically (save/load)', () => {
  const c = createTraversalController(CLIFF());
  let a = run(c, c.spawnState({ x: 9.8, z: 0 }), { x: 1, y: 0 }, 90);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 120; i++) {
    a = c.step(a, { x: 1, y: 0 }, DT);
  }
  let bb = b;
  for (let i = 0; i < 120; i++) {
    bb = c.step(bb, { x: 1, y: 0 }, DT);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(bb)), JSON.parse(JSON.stringify(a)));
});

test('a bare walk-controller state is accepted and upgraded', () => {
  const c = createTraversalController(FLAT());
  const bare = { pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true, wading: false };
  const s = c.step(bare, { x: 0, y: 0 }, DT);
  assertWellFormed(s, 'upgraded');
  assert.equal(s.mode, MODES.WALK);
  assert.equal(s.stamina, c.tuning.staminaMax);
});

test('the sim clock advances by exactly dt every step, in every mode', () => {
  const c = createTraversalController(CLIFF());
  let s = c.spawnState({ x: 9.8, z: 0 });
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const prev = s.simT;
    s = c.step(s, { x: 1, y: 0, jump: i === 400 }, DT);
    seen.add(s.mode);
    assert.ok(Math.abs(s.simT - (prev + DT)) < 1e-12, `clock skipped in ${s.mode}`);
  }
  assert.ok(seen.size >= 2, 'this run should have crossed at least one mode');
});

// ── WALK + stamina ────────────────────────────────────────────────────────

test('standing still refills the pool fast; sprinting drains it', () => {
  const c = createTraversalController(FLAT());
  const t = c.tuning;
  let s = c.spawnState({ x: 0, z: 0 });
  s = { ...s, stamina: 10 };
  s = run(c, s, { x: 0, y: 0 }, 60); // one second idle
  assert.ok(s.stamina > 10 + t.staminaRegenIdle * 0.9, 'idle regen too slow');

  let d = c.spawnState({ x: 0, z: 0 });
  d = run(c, d, { x: 0, y: 1, run: true }, 60);
  assert.ok(d.stamina < t.staminaMax, 'sprinting must cost something');
  assert.ok(d.stamina > t.staminaMax - t.staminaSprint * 1.2, 'sprinting must not cost much');
});

test('an exhausted hero keeps walking — the run button is ignored, never a stumble', () => {
  const c = createTraversalController(FLAT());
  let s = c.spawnState({ x: 0, z: 0 });
  s = { ...s, stamina: 0, tired: true };
  const a = run(c, s, { x: 0, y: 1, run: true }, 30);
  assert.equal(a.mode, MODES.WALK);
  assert.equal(a.grounded, true);
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 0, 'a tired hero still moves');
  assert.ok(Math.hypot(a.vel.x, a.vel.z) <= c.tuning.speed + 1e-6, 'but never at run speed');
});

test('the tired latch only clears once the pool is back above staminaRecover', () => {
  const c = createTraversalController(FLAT());
  const t = c.tuning;
  let s = { ...c.spawnState({ x: 0, z: 0 }), stamina: 0, tired: true };
  s = c.step(s, { x: 0, y: 0 }, DT);
  assert.equal(s.tired, true, 'one frame of regen must not clear exhaustion');
  s = until(c, s, { x: 0, y: 0 }, (q) => !q.tired, 600).state;
  assert.equal(s.tired, false);
  assert.ok(s.stamina >= t.staminaRecover);
});

test('stamina is clamped into [0, max] no matter what a save contained', () => {
  const c = createTraversalController(FLAT());
  const over = run(c, { ...c.spawnState({ x: 0, z: 0 }), stamina: 1e6 }, { x: 0, y: 0 }, 5);
  assert.equal(over.stamina, c.tuning.staminaMax);
  const under = run(c, { ...c.spawnState({ x: 0, z: 0 }), stamina: -50 }, { x: 0, y: 1, run: true }, 5);
  assert.ok(under.stamina >= 0);
});

// ── CLIMB ─────────────────────────────────────────────────────────────────

test('pushing into a steep face latches on and emits grab', () => {
  const c = createTraversalController(CLIFF());
  const s0 = c.spawnState({ x: 9.7, z: 0 });
  const s = c.step(s0, { x: 1, y: 0 }, DT);
  assert.equal(s.mode, MODES.CLIMB);
  assert.equal(s.event, EVENTS.GRAB);
  assert.ok(s.wall && Math.abs(Math.hypot(s.wall.x, s.wall.z) - 1) < 1e-6, 'wall normal must be unit');
  assert.ok(s.wall.x < 0, 'the outward normal points away from the hill');
  assert.equal(s.grounded, false);
});

test('a walkable slope is walked, not climbed', () => {
  const c = createTraversalController(worldFrom((x) => Math.max(0, (x - 10) * 0.5))); // 26 degrees
  const s = run(c, c.spawnState({ x: 9.5, z: 0 }), { x: 1, y: 0 }, 60);
  assert.equal(s.mode, MODES.WALK);
  assert.ok(s.pos.y > 0.5, 'and the slope is actually ascended');
});

test('a knee-high bump is not a wall', () => {
  const c = createTraversalController(worldFrom((x) => (x < 10 ? 0 : 0.4)));
  const s = run(c, c.spawnState({ x: 9.5, z: 0 }), { x: 1, y: 0 }, 60);
  assert.equal(s.mode, MODES.WALK);
});

test('you cannot latch onto a face you are moving along instead of into', () => {
  const c = createTraversalController(CLIFF());
  const s = run(c, c.spawnState({ x: 9.7, z: 0 }), { x: 0, y: 1 }, 30);
  assert.equal(s.mode, MODES.WALK);
});

test('a full 20 m face is climbed to the top and mantled, well inside the pool', () => {
  const c = createTraversalController(CLIFF());
  const s0 = c.spawnState({ x: 9.9, z: 0 });
  const r = until(c, s0, { x: 1, y: 0 }, (q) => q.mode === MODES.MANTLE, 3000);
  assert.ok(r.hit, 'the climber never reached a ledge');
  assert.ok(r.state.stamina > 0, 'the pool must survive the tallest test face');
  const done = until(c, r.state, { x: 0, y: 0 }, (q) => q.grounded, 200);
  assert.ok(done.hit, 'the mantle never finished');
  assert.equal(done.state.mode, MODES.WALK);
  assert.ok(done.state.pos.y > CLIFF_TOP - 0.5, `landed at ${done.state.pos.y}, not the top`);
  assert.ok(done.state.pos.x > 15, 'and landed ON the plateau, not on the face');
});

test('climbing costs stamina; hanging still costs much less', () => {
  const c = createTraversalController(CLIFF());
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  const climbed = run(c, grab, { x: 1, y: 0 }, 60);
  const hung = run(c, grab, { x: 0, y: 0 }, 60);
  assert.ok(climbed.stamina < hung.stamina, 'hauling must cost more than hanging');
  assert.ok(hung.stamina > grab.stamina - c.tuning.staminaClimbHold * 1.2);
});

test('a shimmy is cheaper than a haul, moves sideways, and announces itself', () => {
  const c = createTraversalController(CLIFF());
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  const up = run(c, grab, { x: 1, y: 0 }, 60);
  const side = run(c, grab, { x: 0, y: 1 }, 60);
  assert.equal(side.mode, MODES.CLIMB, 'a shimmy must stay on the wall');
  assert.ok(Math.abs(side.pos.z - grab.pos.z) > 1.5, 'a shimmy must actually travel');
  assert.ok(side.stamina > up.stamina, 'a shimmy must be cheaper than a haul');
  assert.notEqual(side.shimmy, 0, 'the rig needs to know a shimmy is happening');
  assert.ok(events(c, grab, { x: 0, y: 1 }, 30).includes(EVENTS.SHIMMY));
});

test('jumping off the wall pushes outward, and the still-held stick cannot re-latch', () => {
  const c = createTraversalController(CLIFF());
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  const climbed = run(c, grab, { x: 1, y: 0 }, 90);
  const off = c.step(climbed, { x: 1, y: 0, jump: true }, DT);
  assert.equal(off.mode, MODES.WALK);
  assert.ok(off.vel.x < 0, 'the hop must be away from the face');
  assert.ok(off.vel.y > 0, 'and upward');
  assert.ok(off.latchLock > 0);
  // The stick is still pushing into the rock; the lock must hold for a while.
  const s2 = run(c, off, { x: 1, y: 0 }, 10);
  assert.equal(s2.mode, MODES.WALK, 're-latched during the lock');
});

test('climbing back DOWN onto standable ground hands you to the walk controller', () => {
  const c = createTraversalController(CLIFF());
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  const up = run(c, grab, { x: 1, y: 0 }, 60);
  const down = until(c, up, { x: -1, y: 0 }, (q) => q.mode === MODES.WALK, 600);
  assert.ok(down.hit, 'never got back down');
  assert.equal(down.state.grounded, true);
  assert.ok(down.state.pos.y < 4, 'came down to the bottom of the face');
});

test('an empty pool mid-face lets go gently — no launch, no damage, no death', () => {
  const c = createTraversalController(CLIFF());
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  // Halfway up, and out of puff. Nowhere near the lip, so no grace.
  const mid = { ...run(c, grab, { x: 1, y: 0 }, 90), stamina: 0.01 };
  const spent = c.step(mid, { x: 1, y: 0 }, DT);
  assert.equal(spent.mode, MODES.WALK);
  assert.equal(spent.event, EVENTS.SPENT);
  assert.equal(spent.stamina, 0);
  assert.equal(spent.tired, true);
  assert.ok(spent.vel.y === 0, 'letting go is a release, not a launch');
  assert.ok(Math.hypot(spent.vel.x, spent.vel.z) < c.tuning.wallJumpOut,
    'and a gentler push than a wall jump');
  // …and the fall is survivable: the body ends up standing, somewhere.
  const landed = until(c, spent, { x: 0, y: 0 }, (q) => q.grounded, 900);
  assert.ok(landed.hit, 'the hero never landed');
  assertWellFormed(landed.state, 'after a spent fall');
});

test('THE SO-CLOSE GRACE: running dry within reach of the lip still gets you the top', () => {
  const c = createTraversalController(SHEER());
  // Climb for real until the lip is about a second and a half away, then take
  // the pool away. This is exactly the moment the grace exists for.
  const high = until(c, c.spawnState({ x: 9.7, z: 0 }), { x: 1, y: 0 },
    (q) => q.mode === MODES.CLIMB && q.pos.y > SHEER_TOP - 1.6, 3000);
  assert.ok(high.hit, 'never climbed near the lip');
  const nearTop = { ...high.state, stamina: 0.01 };
  const s = c.step(nearTop, { x: 1, y: 0 }, DT);
  assert.equal(s.mode, MODES.MANTLE, 'the grace did not fire');
  assert.equal(s.event, EVENTS.RESCUE);
  assert.equal(s.grace, true);
  assert.equal(s.stamina, 0, 'the rescue is free — it does not go into debt');
  const done = until(c, s, { x: 0, y: 0 }, (q) => q.grounded, 200);
  assert.ok(done.hit && done.state.pos.y > SHEER_TOP - 0.5,
    `the rescue landed at ${done.state.pos.y}, not on the plateau`);
});

test('the grace does NOT fire from the bottom of a tall face', () => {
  const c = createTraversalController(SHEER());
  const low = until(c, c.spawnState({ x: 9.7, z: 0 }), { x: 1, y: 0 },
    (q) => q.mode === MODES.CLIMB && q.pos.y > 1.5, 600);
  assert.ok(low.hit);
  const s = c.step({ ...low.state, stamina: 0.01 }, { x: 1, y: 0 }, DT);
  assert.equal(s.mode, MODES.WALK, '10 m below the lip is not "so close"');
  assert.equal(s.event, EVENTS.SPENT);
});

test('a mantle never drops you onto ground you cannot stand on', () => {
  // A 65-degree face: steep enough to climb, too steep to be a mantle target.
  const c = createTraversalController(worldFrom((x) => (x < 10 ? 0 : (x - 10) * 2.14)));
  const grab = c.step(c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 }, DT);
  const mid = { ...run(c, grab, { x: 1, y: 0 }, 60), stamina: 0.01 };
  const s = c.step(mid, { x: 1, y: 0 }, DT);
  assert.notEqual(s.mode, MODES.MANTLE, 'rescued onto a cliff face');
});

test('a mantle is uninterruptible — no stray input takes the summit away', () => {
  const c = createTraversalController(CLIFF());
  const r = until(c, c.spawnState({ x: 9.9, z: 0 }), { x: 1, y: 0 },
    (q) => q.mode === MODES.MANTLE, 3000);
  assert.ok(r.hit);
  const target = { ...r.state.mantle.to };
  const chaos = until(c, r.state, { x: -1, y: 1, jump: true, run: true, dive: true },
    (q) => q.mode !== MODES.MANTLE, 200);
  assert.ok(chaos.hit, 'the mantle never completed');
  assert.equal(chaos.state.mode, MODES.WALK);
  assert.ok(Math.abs(chaos.state.pos.x - target.x) < 1e-9);
  assert.ok(Math.abs(chaos.state.pos.z - target.z) < 1e-9);
});

test('a mantle takes about mantleTime and rises before it slides in', () => {
  const c = createTraversalController(PLAIN());
  // A hand-built pop with real travel in BOTH axes, so the easing split is
  // measurable. (Mantling a flat plateau has no rise to measure.)
  const from = { x: 0, y: 0, z: 0 };
  const to = { x: 2, y: 3, z: 0 };
  const start = {
    ...c.spawnState({ x: 0, z: 0 }),
    pos: { ...from }, grounded: false, mode: MODES.MANTLE,
    mantle: { t: 0, from, to },
  };
  const half = run(c, start, { x: 0, y: 0 }, Math.round(c.tuning.mantleTime / DT / 2));
  const fx = (half.pos.x - from.x) / (to.x - from.x);
  const fy = (half.pos.y - from.y) / (to.y - from.y);
  assert.ok(fy > fx + 0.1, `height must lead: fy ${fy.toFixed(2)} vs fx ${fx.toFixed(2)}`);
  const done = until(c, start, { x: 0, y: 0 }, (q) => q.mode !== MODES.MANTLE, 200);
  assert.ok(Math.abs(done.steps * DT - c.tuning.mantleTime) < 0.05);
});

test('you cannot latch on with an empty pool, or while exhausted', () => {
  const c = createTraversalController(CLIFF());
  const base = c.spawnState({ x: 9.7, z: 0 });
  const low = c.step({ ...base, stamina: c.tuning.climbLatchStamina - 1 }, { x: 1, y: 0 }, DT);
  assert.equal(low.mode, MODES.WALK, 'latched on fumes');
  const tired = c.step({ ...base, stamina: 5, tired: true }, { x: 1, y: 0 }, DT);
  assert.equal(tired.mode, MODES.WALK, 'latched while exhausted');
});

// ── GLIDE ─────────────────────────────────────────────────────────────────

/** Put a body in the air at height y over the plain, already falling. */
function airborne(c, y, vy = -3) {
  const s = c.spawnState({ x: 0, z: 0 });
  return { ...s, pos: { x: 0, y, z: 0 }, vel: { x: 0, y: vy, z: 0 }, grounded: false, airTime: 0.3 };
}

test('jump in the air with height below you opens the canopy', () => {
  const c = createTraversalController(PLAIN());
  const s = c.step(airborne(c, 40), { x: 0, y: 0, jump: true }, DT);
  assert.equal(s.mode, MODES.GLIDE);
  assert.equal(s.event, EVENTS.CANOPY);
  assert.ok(s.vel.y >= c.tuning.glideDeployPop - 1e-9, 'deploy must visibly catch the air');
});

test('the canopy will not open at ankle height', () => {
  const c = createTraversalController(PLAIN());
  const s = c.step(airborne(c, 1.2), { x: 0, y: 0, jump: true }, DT);
  assert.notEqual(s.mode, MODES.GLIDE);
});

test('AUTO-CANOPY: a long fall over a long drop opens the glider by itself', () => {
  const c = createTraversalController(PLAIN());
  const r = until(c, airborne(c, 60, 0), { x: 0, y: 0 }, (q) => q.mode === MODES.GLIDE, 600);
  assert.ok(r.hit, 'nobody caught the child');
  assert.equal(r.state.event, EVENTS.AUTOCANOPY);
  assert.ok(r.steps * DT < c.tuning.glideAutoFallT + 0.4, 'the rescue must be prompt');
});

test('a short hop never triggers the auto-canopy', () => {
  const c = createTraversalController(PLAIN());
  const s = c.spawnState({ x: 0, z: 0 });
  const hop = run(c, s, { x: 0, y: 1, jump: true }, 120);
  assert.notEqual(hop.mode, MODES.GLIDE);
});

test('a glide sinks at the tuned rate and flies faster than a sprint', () => {
  const c = createTraversalController(PLAIN());
  const t = c.tuning;
  let s = c.step(airborne(c, 200), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1 }, 120); // two seconds of settling
  assert.ok(Math.abs(s.vel.y - t.glideFall) < 0.05, `sink ${s.vel.y} != ${t.glideFall}`);
  assert.ok(Math.abs(Math.hypot(s.vel.x, s.vel.z) - t.glideSpeed) < 0.05);
  assert.ok(t.glideSpeed > t.runSpeed, 'gliding must beat running or nobody will climb');
});

test('the glide ratio carries the Palace height across the island', () => {
  const c = createTraversalController(PLAIN());
  const t = c.tuning;
  const ratio = t.glideSpeed / -t.glideFall;
  assert.ok(ratio > 4, `glide ratio ${ratio} is too poor to be a reward`);
  // From a 55 m summit that is 240 m of range: the radius of the whole island.
  assert.ok(55 * ratio > 240, 'a summit launch must be able to reach the coast');
});

test('holding run dives: faster, steeper, and reversible', () => {
  const c = createTraversalController(PLAIN());
  let s = c.step(airborne(c, 300), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1, run: true }, 120);
  assert.ok(s.vel.y < c.tuning.glideFall, 'a dive must sink faster');
  assert.ok(Math.hypot(s.vel.x, s.vel.z) > c.tuning.glideSpeed);
  const back = run(c, s, { x: 0, y: 1 }, 120);
  assert.ok(Math.abs(back.vel.y - c.tuning.glideFall) < 0.05, 'letting go must restore the cruise');
});

test('steering is responsive: a full reversal takes well under a second', () => {
  const c = createTraversalController(PLAIN());
  let s = c.step(airborne(c, 400), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1 }, 120);
  const r = until(c, s, { x: 0, y: -1 }, (q) => q.vel.z < -c.tuning.glideSpeed * 0.9, 120);
  assert.ok(r.hit, 'the canopy never came around');
  assert.ok(r.steps * DT < 1.0, `reversal took ${(r.steps * DT).toFixed(2)}s`);
});

test('tapping jump folds the canopy and hands the body back to gravity', () => {
  const c = createTraversalController(PLAIN());
  let s = c.step(airborne(c, 100), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1 }, 60);
  const fold = c.step(s, { x: 0, y: 1, jump: true }, DT);
  assert.equal(fold.mode, MODES.WALK);
  assert.equal(fold.grounded, false);
  const later = run(c, fold, { x: 0, y: 1 }, 30);
  assert.ok(later.vel.y < c.tuning.glideFall, 'gravity must have the body back');
});

test('THERMALS: a rising column turns a glide into a climb, and says so once', () => {
  const c = createTraversalController(PLAIN(), {}, {
    // A 30 m column at the origin pushing 5 m/s.
    thermalAt: (x, y, z) => (Math.hypot(x, z) < 30 ? 5 : 0),
  });
  let s = c.step(airborne(c, 60), { x: 0, y: 0, jump: true }, DT);
  const ev = [];
  for (let i = 0; i < 240; i++) {
    s = c.step(s, { x: 0, y: 0 }, DT);
    if (s.event) ev.push(s.event);
  }
  assert.ok(s.pos.y > 60, `the thermal must lift: ended at ${s.pos.y.toFixed(1)}`);
  assert.ok(s.vel.y > 0);
  assert.ok(s.lift > 0, 'the FX layer needs to know a thermal is being ridden');
  assert.equal(ev.filter((e) => e === EVENTS.THERMAL).length, 1, 'exactly one thermal chime');
});

test('thermal lift is clamped, so no vent can ever fling a child', () => {
  const c = createTraversalController(PLAIN(), {}, { thermalAt: () => 1e6 });
  let s = c.step(airborne(c, 60), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 0 }, 240);
  assert.ok(s.vel.y <= c.tuning.thermalMax + 1e-6, `vy ${s.vel.y} exceeded the clamp`);
  assert.ok(s.lift <= c.tuning.thermalMax + 1e-6);
});

test('a broken thermal field cannot corrupt the flight', () => {
  const c = createTraversalController(PLAIN(), {}, { thermalAt: () => NaN });
  let s = c.step(airborne(c, 60), { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1 }, 120);
  assertWellFormed(s, 'NaN thermal');
  assert.equal(s.lift, 0);
});

test('touchdown flares, keeps some speed, and folds the canopy', () => {
  const c = createTraversalController(PLAIN());
  let s = c.step(airborne(c, 40), { x: 0, y: 0, jump: true }, DT);
  const r = until(c, s, { x: 0, y: 1 }, (q) => q.grounded, 3000);
  assert.ok(r.hit, 'the glider never landed');
  assert.equal(r.state.mode, MODES.WALK);
  assert.equal(r.state.event, EVENTS.TOUCHDOWN);
  assert.ok(Math.hypot(r.state.vel.x, r.state.vel.z) > 1,
    'a landing is a run-out, not a full stop');
  assert.ok(Math.abs(r.state.pos.y) < 1e-6, 'feet on the deck');
});

test('the pool refills under canopy, so a long flight pays for the next climb', () => {
  const c = createTraversalController(PLAIN());
  let s = c.step({ ...airborne(c, 300), stamina: 5, tired: true }, { x: 0, y: 0, jump: true }, DT);
  s = run(c, s, { x: 0, y: 1 }, 300); // five seconds aloft
  assert.ok(s.stamina > 50, `only recovered to ${s.stamina}`);
  assert.equal(s.tired, false);
});

test('gliding into deep water is a splashdown, not a crash', () => {
  const c = createTraversalController(OCEAN());
  let s = { ...c.spawnState({ x: 0, z: 0 }), pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: -3, z: 0 }, grounded: false, mode: MODES.WALK, airTime: 0.4 };
  s = c.step(s, { x: 0, y: 0, jump: true }, DT);
  assert.equal(s.mode, MODES.GLIDE);
  const r = until(c, s, { x: 0, y: 1 }, (q) => q.mode === MODES.SWIM, 3000);
  assert.ok(r.hit, 'never hit the water');
  assert.equal(r.state.event, EVENTS.SPLASH);
});

// ── SWIM ──────────────────────────────────────────────────────────────────

test('wading out past the depth threshold starts a swim, and it splashes', () => {
  const c = createTraversalController(BEACH());
  const s0 = c.spawnState({ x: 18, z: 0 }); // dry-ish land
  assert.equal(s0.mode, MODES.WALK);
  const r = until(c, s0, { x: -1, y: 0 }, (q) => q.mode === MODES.SWIM, 600);
  assert.ok(r.hit, 'never started swimming');
  assert.equal(r.state.event, EVENTS.SPLASH);
  assert.ok(r.state.pos.y < WATER_Y, 'the body floats at the surface');
});

test('swimming back to the beach stands you up, and the seam does not chatter', () => {
  const c = createTraversalController(BEACH());
  const wet = until(c, c.spawnState({ x: 18, z: 0 }), { x: -1, y: 0 },
    (q) => q.mode === MODES.SWIM, 600).state;
  const back = until(c, wet, { x: 1, y: 0 }, (q) => q.mode === MODES.WALK, 900);
  assert.ok(back.hit, 'never got back to shore');
  assert.equal(back.state.event, EVENTS.SHORE);
  assert.equal(back.state.grounded, true);
  // Now hold still in the surf: hysteresis means the mode must settle.
  let s = back.state;
  const modes = new Set();
  for (let i = 0; i < 240; i++) { s = c.step(s, { x: 0, y: 0 }, DT); modes.add(s.mode); }
  assert.equal(modes.size, 1, `the shoreline flickered between ${[...modes]}`);
});

test('a surface swim bobs, and the bob is a smooth function of the swim clock', () => {
  const c = createTraversalController(OCEAN());
  let s = c.spawnState({ x: 0, z: 0 });
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 300; i++) {
    s = c.step(s, { x: 0, y: 0 }, DT);
    lo = Math.min(lo, s.pos.y);
    hi = Math.max(hi, s.pos.y);
  }
  const amp = (hi - lo) / 2;
  assert.ok(amp > c.tuning.swimBobAmp * 0.8 && amp < c.tuning.swimBobAmp * 1.2,
    `bob amplitude ${amp} is not the tuned ${c.tuning.swimBobAmp}`);
  assert.ok(hi < WATER_Y, 'the body never breaches the water plane');
});

test('diving goes under, surfaces on release, and fires exactly one event each way', () => {
  const c = createTraversalController(OCEAN());
  let s = c.spawnState({ x: 0, z: 0 });
  const down = [];
  for (let i = 0; i < 180; i++) { s = c.step(s, { x: 0, y: 0, dive: true }, DT); if (s.event) down.push(s.event); }
  assert.equal(s.underwater, true);
  assert.equal(isUnderwater(s, c.tuning), true);
  assert.equal(down.filter((e) => e === EVENTS.SUBMERGE).length, 1);
  assert.ok(s.dive > 1, `only reached ${s.dive} m down`);

  const up = [];
  for (let i = 0; i < 300; i++) { s = c.step(s, { x: 0, y: 0 }, DT); if (s.event) up.push(s.event); }
  assert.equal(s.underwater, false);
  assert.equal(s.dive, 0, 'you always float back up on your own');
  assert.equal(up.filter((e) => e === EVENTS.SURFACE).length, 1);
});

test('a dive can never reach the seabed', () => {
  const c = createTraversalController(worldFrom(() => -2.0)); // 2 m of water
  let s = c.spawnState({ x: 0, z: 0 });
  s = run(c, s, { x: 0, y: 0, dive: true }, 600);
  assert.ok(s.pos.y > -2.0 + c.tuning.diveClearance - 0.3, `dived to ${s.pos.y} over a -2 m bed`);
  assert.equal(s.mode, MODES.SWIM);
});

test('tapping jump under water always wins over the dive button', () => {
  const c = createTraversalController(OCEAN());
  let s = run(c, c.spawnState({ x: 0, z: 0 }), { x: 0, y: 0, dive: true }, 120);
  assert.ok(s.dive > 0.5);
  s = run(c, s, { x: 0, y: 0, dive: true, jump: true }, 180);
  assert.equal(s.dive, 0, 'jump must surface you even with dive held');
});

test('NO DROWNING: an empty pool in open water is towed to shore, not sunk', () => {
  const c = createTraversalController(BEACH());
  // Well offshore, out of puff, with the stick released — the worst case.
  let s = c.spawnState({ x: 2, z: 0 });
  assert.equal(s.mode, MODES.SWIM);
  s = { ...s, stamina: 0, tired: true };
  const x0 = s.pos.x;
  const r = until(c, s, { x: 0, y: 0 }, (q) => q.grounded, 3000);
  assert.ok(r.hit, 'the tow never reached land');
  assert.ok(r.state.pos.x > x0, 'the tow must go toward the shallows');
  assertWellFormed(r.state, 'after a rescue tow');
});

test('the pool refills while floating, so nobody can get stranded offshore', () => {
  const c = createTraversalController(OCEAN());
  let s = { ...c.spawnState({ x: 0, z: 0 }), stamina: 0, tired: true };
  s = run(c, s, { x: 0, y: 0 }, 60 * 30);
  assert.equal(s.stamina, c.tuning.staminaMax);
  assert.equal(s.tired, false);
});

test('a fast swim costs stamina and is faster; an empty pool just slows you down', () => {
  const c = createTraversalController(OCEAN());
  const s0 = c.spawnState({ x: 0, z: 0 });
  const fast = run(c, s0, { x: 1, y: 0, run: true }, 60);
  const easy = run(c, s0, { x: 1, y: 0 }, 60);
  assert.ok(fast.pos.x > easy.pos.x);
  assert.ok(fast.stamina < easy.stamina);
  const empty = run(c, { ...s0, stamina: 0, tired: true }, { x: 1, y: 0, run: true }, 60);
  assert.equal(empty.mode, MODES.SWIM, 'an empty pool is never a fail state');
});

test('you cannot latch onto a cliff or open a glider while in the sea', () => {
  const c = createTraversalController(worldFrom((x) => (x < 0 ? -6 : 12)));
  let s = c.spawnState({ x: -1, z: 0 });
  assert.equal(s.mode, MODES.SWIM);
  s = run(c, s, { x: 1, y: 0, jump: true }, 120);
  assert.ok(s.mode === MODES.SWIM || s.mode === MODES.WALK, `ended in ${s.mode}`);
  assert.notEqual(s.mode, MODES.GLIDE);
});

// ── HUD / view helpers ────────────────────────────────────────────────────

test('staminaFraction is safe on anything and always in [0, 1]', () => {
  const t = DEFAULT_TRAVERSAL_TUNING;
  assert.equal(staminaFraction(null, t), 1);
  assert.equal(staminaFraction({}, t), 1);
  assert.equal(staminaFraction({ stamina: 0 }, t), 0);
  assert.equal(staminaFraction({ stamina: 50 }, t), 0.5);
  assert.equal(staminaFraction({ stamina: -9 }, t), 0);
  assert.equal(staminaFraction({ stamina: 1e9 }, t), 1);
});

test('the gauge hides on a full pool and shows the moment it matters', () => {
  const t = DEFAULT_TRAVERSAL_TUNING;
  assert.equal(staminaVisible({ mode: MODES.WALK, stamina: t.staminaMax }, t), false);
  assert.equal(staminaVisible({ mode: MODES.WALK, stamina: t.staminaMax - 1 }, t), true);
  assert.equal(staminaVisible({ mode: MODES.CLIMB, stamina: t.staminaMax }, t), true);
  assert.equal(staminaVisible({ mode: MODES.WALK, stamina: t.staminaMax, tired: true }, t), true);
  assert.equal(staminaVisible(null, t), false);
});

test('rigFlags maps modes onto the animation flags the hero rig reads', () => {
  const f = {};
  assert.deepEqual(rigFlags({ mode: MODES.CLIMB }, f), { climbing: true, gliding: false, swimming: false });
  assert.deepEqual(rigFlags({ mode: MODES.MANTLE }, f), { climbing: true, gliding: false, swimming: false });
  assert.deepEqual(rigFlags({ mode: MODES.GLIDE }, f), { climbing: false, gliding: true, swimming: false });
  assert.deepEqual(rigFlags({ mode: MODES.SWIM }, f), { climbing: false, gliding: false, swimming: true });
  assert.deepEqual(rigFlags({ mode: MODES.WALK }, f), { climbing: false, gliding: false, swimming: false });
  // Allocation-free: the same out object is reused.
  assert.equal(rigFlags({ mode: MODES.WALK }, f), f);
});

test('the tuning is generous enough for the ability to be usable by a child', () => {
  const t = DEFAULT_TRAVERSAL_TUNING;
  const climbSeconds = t.staminaMax / t.staminaClimbMove;
  assert.ok(climbSeconds >= 18, `only ${climbSeconds}s of climbing in a full pool`);
  assert.ok(climbSeconds * t.climbUpSpeed >= 50, 'a full pool must out-climb the tallest cliff');
  assert.ok(t.staminaRegenIdle > t.staminaClimbMove * 3, 'refilling must beat draining');
  assert.ok(t.staminaMax / t.staminaRegenIdle < 4, 'a full refill must take seconds, not a minute');
  assert.ok(t.graceRise >= 3, 'the so-close grace must be worth having');
});

// ── The whole loop ────────────────────────────────────────────────────────

test('climb a cliff, walk off the top, and fly down: the full traversal loop', () => {
  // A cliff into an ocean: climb the face, walk off the far side, auto-glide,
  // splash down, and swim home. Every mode, one uninterrupted state chain.
  const c = createTraversalController(worldFrom((x) => {
    if (x < 10) return 0;
    if (x <= 15) return (x - 10) * 4;
    if (x <= 30) return 20;
    return -8;              // the cliff's far side falls into deep water
  }));
  let s = c.spawnState({ x: 9.9, z: 0 });
  const seen = [];
  const note = () => { if (seen[seen.length - 1] !== s.mode) seen.push(s.mode); };
  note();
  for (let i = 0; i < 4000; i++) {
    s = c.step(s, { x: 1, y: 0 }, DT);
    assertWellFormed(s, `loop step ${i}`);
    note();
    if (s.mode === MODES.SWIM && s.swimT > 1) break;
  }
  assert.deepEqual(
    seen.filter((m, i) => m !== seen[i - 1]),
    [MODES.WALK, MODES.CLIMB, MODES.MANTLE, MODES.WALK, MODES.GLIDE, MODES.SWIM],
    `the loop went ${seen.join(' -> ')}`,
  );
  assert.ok(s.stamina >= 0 && s.stamina <= c.tuning.staminaMax);
});
