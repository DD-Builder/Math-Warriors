/**
 * Contract tests for GAME FEEL.
 *
 * Everything asserted here is a FEEL RULE, not an implementation detail: the
 * apex is lighter than the rise, a tap is shorter than a hold, a run into a
 * jump keeps its speed, a landing never taxes you, a slam-turn skids. These
 * are the properties that make the character good to move, so they are the
 * properties that get pinned — if a tuning pass breaks one of them it breaks
 * a build, which is exactly the point.
 *
 * Analytic stub heightfields only: no terrain import, so the physics is
 * measured against exact geometry.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCollisionWorld } from './collision.js';
import { PAPER } from '../config.js';
import {
  FEEL,
  createGameFeel,
  createFeelFx,
  surfaceKey,
  surfaceOf,
  turnRateFor,
  classifyTurn,
  accelStep,
  gravityScale,
  resolveJumpFeel,
  landingImpact,
  slopeResponse,
  fovKickFor,
  speedLinesFor,
  trailRate,
  rigScale,
  fovOffsetDeg,
  wrapAngle,
} from './gameFeel.js';

const DT = 1 / 60;
const DRY = 1;   // dry land sits above WATER_Y so stubs never read as water

function stubField(height = () => DRY, normal = () => [0, 1, 0]) {
  return {
    sampleHeight: height,
    sampleNormal: normal,
    biomeAt: () => 'meadow',
    shoreDistance: () => 10,
    seed: 1,
  };
}

const flat = () => createCollisionWorld(stubField());

/** Ramp rising along +x at `deg`, flat behind the origin. */
function rampWorld(deg) {
  const rad = deg * (Math.PI / 180);
  return createCollisionWorld(stubField(
    (x) => DRY + (x > 0 ? x * Math.tan(rad) : 0),
    (x) => (x > 0 ? [-Math.sin(rad), Math.cos(rad), 0] : [0, 1, 0]),
  ));
}

/** Flat plateau at DRY for x < 0, a drop to `low` beyond it. */
const cliffWorld = (low) => createCollisionWorld(stubField((x) => (x < 0 ? DRY : low)));

/** A gap: ground at DRY for x < 0, a pit from 0..gap, then a lip at `lipY`. */
function gapWorld(gap, lipY) {
  return createCollisionWorld(stubField(
    (x) => (x < 0 ? DRY : x > gap ? lipY : -20),
  ));
}

const MOVE = (x, z, extra = {}) => ({ x, z, run: true, jumpHeld: false, ...extra });

/** Run n fixed steps of the same input. */
function run(c, s, input, n) {
  for (let i = 0; i < n; i++) s = c.step(s, input, DT);
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('FEEL tuning table', () => {
  test('every constant is a finite number and every surface is complete', () => {
    for (const [k, v] of Object.entries(FEEL)) {
      if (k === 'surface' || k === 'fx') continue;
      assert.equal(typeof v, 'number', `${k} must be a number`);
      assert.ok(Number.isFinite(v), `${k} must be finite`);
    }
    for (const key of ['ground', 'air', 'water', 'ice']) {
      const s = FEEL.surface[key];
      assert.ok(s, `missing surface ${key}`);
      for (const f of ['accel', 'brake', 'drag', 'turn', 'top']) {
        assert.equal(typeof s[f], 'number', `${key}.${f}`);
        assert.ok(s[f] >= 0, `${key}.${f} must be >= 0`);
      }
    }
  });

  test('the four surfaces are actually DISTINCT — ice slips, air floats', () => {
    const g = FEEL.surface.ground;
    const a = FEEL.surface.air;
    const i = FEEL.surface.ice;
    const w = FEEL.surface.water;
    assert.ok(i.accel < g.accel * 0.5, 'ice must be far less grippy than dirt');
    assert.ok(i.drag < g.drag * 0.25, 'ice must barely slow you down');
    assert.ok(a.drag < g.drag * 0.2, 'air must preserve momentum');
    assert.ok(a.turn < g.turn, 'you cannot pirouette in mid-air');
    assert.ok(w.top < 1, 'water is slower than dry land');
    // Ice being marginally faster is deliberate: a hazard must also be a toy.
    assert.ok(i.top >= g.top);
  });

  test('gravity multipliers are ordered: apex < rise < fall < fast-fall', () => {
    assert.ok(FEEL.apexGravity < FEEL.riseGravity);
    assert.ok(FEEL.riseGravity < FEEL.fallGravity);
    assert.ok(FEEL.fallGravity < FEEL.fastFallGravity);
    assert.ok(FEEL.cutGravity > FEEL.riseGravity, 'releasing must cut the rise');
  });

  test('forgiveness windows are long enough for a five-year-old', () => {
    assert.ok(FEEL.coyoteT >= 0.10, 'coyote under 100 ms reads as "it did not jump"');
    assert.ok(FEEL.bufferT >= 0.12, 'buffer must survive a mistimed press');
    assert.ok(FEEL.landGraceT > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('surface selection', () => {
  test('airborne beats everything; ice beats water', () => {
    assert.equal(surfaceKey({ grounded: false, ice: true, water: true }), 'air');
    assert.equal(surfaceKey({ grounded: true, ice: true, water: true }), 'ice');
    assert.equal(surfaceKey({ grounded: true, water: true }), 'water');
    assert.equal(surfaceKey({}), 'ground');
  });

  test('an unknown surface falls back to ground rather than exploding', () => {
    assert.equal(surfaceOf('lava'), FEEL.surface.ground);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('acceleration curve', () => {
  test('reaches full sprint in the advertised time and never overshoots', () => {
    let v = 0;
    let n = 0;
    while (v < FEEL.runSpeed - 1e-9 && n < 600) { v = accelStep(v, FEEL.runSpeed, 'ground', DT); n++; }
    assert.equal(v, FEEL.runSpeed, 'must land exactly on the target, not past it');
    const secs = n * DT;
    assert.ok(secs > 0.12 && secs < 0.30, `0 -> sprint took ${secs.toFixed(3)}s`);
  });

  test('braking is faster than accelerating — stopping at a ledge must work', () => {
    let up = 0; let a = 0;
    while (up < FEEL.runSpeed - 1e-9 && a < 600) { up = accelStep(up, FEEL.runSpeed, 'ground', DT); a++; }
    let dn = FEEL.runSpeed; let b = 0;
    while (dn > 0.01 && b < 600) { dn = accelStep(dn, 0.0001, 'ground', DT); b++; }
    assert.ok(b < a, 'brake must beat accel');
  });

  test('passive drag is much gentler than an active brake', () => {
    const braked = accelStep(8, 0.0001, 'ground', DT);
    const coasted = accelStep(8, 0, 'ground', DT);
    assert.ok(coasted > braked, 'letting go must coast, not stop');
  });

  test('the landing grace window suspends friction entirely', () => {
    assert.equal(accelStep(8.5, 0, 'ground', DT, FEEL, { grace: true }), 8.5);
  });

  test('ice takes ~6x longer to get going than dirt', () => {
    let g = 0; let i = 0;
    for (let k = 0; k < 12; k++) {
      g = accelStep(g, FEEL.runSpeed, 'ground', DT);
      i = accelStep(i, FEEL.runSpeed, 'ice', DT);
    }
    assert.ok(i < g * 0.3, `ice ${i.toFixed(2)} vs ground ${g.toFixed(2)}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('turning', () => {
  test('turn authority falls monotonically with speed', () => {
    let prev = Infinity;
    for (let v = 0; v <= 10; v += 0.5) {
      const r = turnRateFor(v);
      assert.ok(r <= prev + 1e-9, `turn rate rose at v=${v}`);
      prev = r;
    }
    assert.ok(turnRateFor(0) > turnRateFor(FEEL.runSpeed) * 2,
      'a standing pivot must be dramatically quicker than a sprint arc');
  });

  test('air steering is a fraction of ground steering at the same speed', () => {
    assert.ok(turnRateFor(6, 'air') < turnRateFor(6, 'ground') * 0.6);
  });

  test('a slam backwards at speed is a SKID; the same slam while slow is not', () => {
    assert.equal(classifyTurn(Math.PI, FEEL.skidMinSpeed + 1, true), 'skid');
    assert.equal(classifyTurn(Math.PI, FEEL.skidMinSpeed - 1, true), 'arc');
    assert.equal(classifyTurn(Math.PI, 0.2, true), 'pivot');
    assert.notEqual(classifyTurn(Math.PI, 9, false), 'skid', 'no skids in mid-air');
    assert.equal(classifyTurn(0.1, 8, true), 'pivot');
    assert.equal(classifyTurn(1.0, 8, true), 'arc');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('jump curves', () => {
  test('the apex is the lightest gravity in the whole arc', () => {
    const apex = gravityScale(0, { held: true });
    assert.ok(apex < gravityScale(6, { held: true }), 'apex lighter than the rise');
    assert.ok(apex < gravityScale(-6, {}), 'apex lighter than the fall');
    assert.equal(apex, FEEL.apexGravity);
  });

  test('the hang is capped — nobody may hover', () => {
    const spent = gravityScale(0, { held: true, apexT: FEEL.apexMaxT + 0.01 });
    assert.notEqual(spent, FEEL.apexGravity);
    assert.equal(spent, FEEL.fallGravity);
    assert.equal(gravityScale(1, { held: true, apexT: FEEL.apexMaxT + 0.01 }), FEEL.riseGravity);
  });

  test('releasing the button mid-rise cuts the climb hard', () => {
    assert.ok(gravityScale(6, { held: false }) > gravityScale(6, { held: true }) * 2);
  });

  test('fast-fall only arms past the apex, never on the way up', () => {
    assert.equal(gravityScale(6, { held: true, fastFall: true }), FEEL.riseGravity);
    assert.equal(gravityScale(-6, { fastFall: true }), FEEL.fastFallGravity);
  });

  test('coyote time serves a press made just after walking off', () => {
    assert.equal(resolveJumpFeel({
      bufferT: 0, coyoteT: FEEL.coyoteT - 0.01, grounded: false,
    }), 'ground');
    assert.equal(resolveJumpFeel({
      bufferT: 0, coyoteT: FEEL.coyoteT + 0.05, grounded: false, airT: 0.5, airJumps: 1,
    }), null);
  });

  test('a press made just before landing is buffered, not eaten', () => {
    assert.equal(resolveJumpFeel({ bufferT: FEEL.bufferT - 0.01, grounded: true }), 'ground');
    assert.equal(resolveJumpFeel({ bufferT: FEEL.bufferT + 0.01, grounded: true }), null);
    assert.equal(resolveJumpFeel({ bufferT: null, grounded: true }), null);
  });

  test('the air jump needs air time, and there is exactly one of it', () => {
    const airborne = { bufferT: 0, coyoteT: 99, grounded: false };
    assert.equal(resolveJumpFeel({ ...airborne, airT: 0.01, airJumps: 0 }), null);
    assert.equal(resolveJumpFeel({ ...airborne, airT: 0.5, airJumps: 0 }), 'air');
    assert.equal(resolveJumpFeel({ ...airborne, airT: 0.5, airJumps: 1 }), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('landing', () => {
  test('a small step off a kerb is silent', () => {
    const soft = landingImpact(FEEL.landSoft - 0.5);
    assert.equal(soft.strength, 0);
    assert.equal(soft.dust, 0);
  });

  test('squash, dip and dust all rise together and all saturate at landHard', () => {
    let prev = -1;
    for (let v = 0; v <= 20; v += 1) {
      const h = landingImpact(v);
      assert.ok(h.strength >= prev - 1e-9);
      assert.ok(h.strength <= 1);
      assert.ok(h.dip <= FEEL.dipMax + 1e-9);
      prev = h.strength;
    }
    assert.equal(landingImpact(FEEL.landHard).strength, 1);
    assert.equal(landingImpact(100).dip, FEEL.dipMax);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('slopes', () => {
  test('flat ground never slides and gives no free speed', () => {
    const r = slopeResponse([0, 1, 0], 1, 0);
    assert.equal(r.slide, false);
    assert.equal(r.along, 0);
    assert.equal(r.steepness, 0);
  });

  test('past the slide angle the ground slides; under it, it does not', () => {
    const at = (deg) => {
      const a = deg * (Math.PI / 180);
      return slopeResponse([-Math.sin(a), Math.cos(a), 0], 1, 0);
    };
    assert.equal(at(FEEL.slideDeg - 5).slide, false);
    assert.equal(at(FEEL.slideDeg + 5).slide, true);
  });

  test('downhill gains speed and uphill costs it, on the same slope', () => {
    const a = 30 * (Math.PI / 180);
    const n = [-Math.sin(a), Math.cos(a), 0];      // uphill is +x
    const down = slopeResponse(n, -1, 0);          // heading -x = downhill
    const up = slopeResponse(n, 1, 0);
    assert.ok(down.along > 0, 'downhill must accelerate');
    assert.ok(up.along < 0, 'uphill must drag');
    assert.ok(Math.abs(up.along) > down.along, 'a climb costs more than a descent pays');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('speed presentation curves', () => {
  test('the FOV opens before the speed lines arrive', () => {
    assert.ok(FEEL.fovStart < FEEL.lineStart);
    const mid = FEEL.runSpeed * (FEEL.fovStart + FEEL.lineStart) / 2;
    assert.ok(fovKickFor(mid) > 0);
    assert.equal(speedLinesFor(mid), 0);
  });

  test('both saturate at exactly 1 at run speed and clamp above it', () => {
    assert.equal(fovKickFor(FEEL.runSpeed), 1);
    assert.equal(speedLinesFor(FEEL.runSpeed), 1);
    assert.equal(fovKickFor(FEEL.speedCap), 1);
    assert.equal(fovKickFor(0), 0);
  });

  test('scraps only shed above the trail speed, and shed denser when faster', () => {
    assert.equal(trailRate(FEEL.trailSpeed - 0.1), Infinity);
    const slow = trailRate(FEEL.trailSpeed + 0.01);
    const fast = trailRate(FEEL.speedCap);
    assert.ok(Number.isFinite(slow) && fast < slow);
  });

  test('rigScale trades height for width — squash is impact, not shrinking', () => {
    const s = rigScale({ squash: 1, stretch: 0 });
    assert.ok(s.sy < 1 && s.sx > 1 && s.sz === s.sx);
    const n = rigScale({ squash: 0, stretch: 0 });
    assert.deepEqual(n, { sx: 1, sy: 1, sz: 1 });
    const air = rigScale({ squash: 0, stretch: 1 });
    assert.ok(air.sy > 1 && air.sx < 1);
  });

  test('fovOffsetDeg is bounded by the tuning table', () => {
    assert.equal(fovOffsetDeg({ fovKick: 1 }), FEEL.fovDeg);
    assert.equal(fovOffsetDeg({ fovKick: 5 }), FEEL.fovDeg);
    assert.equal(fovOffsetDeg({}), 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: momentum', () => {
  test('spawnState matches the controller contract', () => {
    const c = createGameFeel(flat());
    const s = c.spawnState({ x: 2, z: -3, yaw: 0.5 });
    assert.equal(s.pos.y, DRY);
    assert.equal(s.grounded, true);
    assert.equal(s.wading, false);
    assert.equal(s.speed, 0);
    assert.ok(s.ev);
  });

  test('step never mutates its inputs', () => {
    const c = createGameFeel(flat());
    const s = c.spawnState({});
    const before = JSON.stringify(s);
    const input = Object.freeze(MOVE(0, 1));
    c.step(s, input, DT);
    assert.equal(JSON.stringify(s), before);
  });

  test('identical input replays to an identical state (determinism)', () => {
    const seq = (i) => MOVE(Math.sin(i * 0.11), Math.cos(i * 0.07), {
      jump: i % 37 === 0, jumpHeld: i % 37 < 10, fastFall: i % 53 === 0,
    });
    const runOnce = () => {
      const c = createGameFeel(rampWorld(20));
      let s = c.spawnState({ x: -4, z: 0 });
      for (let i = 0; i < 400; i++) s = c.step(s, seq(i), DT);
      return JSON.stringify(s);
    };
    assert.equal(runOnce(), runOnce());
  });

  test('the body has MASS: releasing the stick coasts instead of stopping dead', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    assert.ok(s.speed > FEEL.runSpeed * 0.9, `never reached speed: ${s.speed}`);
    const at = s.pos.z;
    s = c.step(s, MOVE(0, 0), DT);
    assert.ok(s.speed > 0, 'the controller this replaces would be at zero here');
    s = run(c, s, MOVE(0, 0), 40);
    assert.equal(s.speed, 0, 'but it must settle, not creep forever');
    // The coast is a spec, not a side effect: under ~0.5 m there is no
    // momentum to feel, over ~1.6 m it walks a five-year-old off a platform.
    const coast = s.pos.z - at;
    assert.ok(coast > 0.5 && coast < 1.6, `coast of ${coast.toFixed(2)}m`);
  });

  test('a run into a jump CARRIES: horizontal speed survives the whole arc', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    const launch = s.speed;
    s = c.step(s, MOVE(0, 1, { jump: true, jumpHeld: true }), DT);
    assert.equal(s.grounded, false);
    let minAir = Infinity;
    for (let i = 0; i < 60 && !s.grounded; i++) {
      s = c.step(s, MOVE(0, 1, { jumpHeld: true }), DT);
      minAir = Math.min(minAir, s.speed);
    }
    assert.ok(minAir > launch * 0.9, `air speed sagged to ${minAir} from ${launch}`);
  });

  test('landing does not tax the run — the grace window holds the speed', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    s = c.step(s, MOVE(0, 1, { jump: true, jumpHeld: true }), DT);
    for (let i = 0; i < 200 && !s.grounded; i++) s = c.step(s, MOVE(0, 1, { jumpHeld: true }), DT);
    assert.equal(s.grounded, true);
    const onTouch = s.speed;
    s = run(c, s, MOVE(0, 1), 5);
    assert.ok(s.speed >= onTouch * 0.95, 'the touchdown must not eat the sprint');
  });

  test('speed is capped even downhill, and never goes NaN anywhere', () => {
    const c = createGameFeel(rampWorld(35));
    let s = c.spawnState({ x: 8, z: 0 });
    for (let i = 0; i < 600; i++) {
      s = c.step(s, MOVE(-1, 0, { jump: i % 23 === 0, jumpHeld: true }), DT);
      assert.ok(Number.isFinite(s.speed) && Number.isFinite(s.pos.y) && Number.isFinite(s.yaw));
      assert.ok(s.speed <= FEEL.speedCap + 1e-6, `overspeed ${s.speed}`);
    }
  });

  test('water is slower than dry land, without changing the stick', () => {
    const wet = createCollisionWorld(stubField(() => -0.5));
    const dry = createGameFeel(flat());
    const sea = createGameFeel(wet);
    const a = run(dry, dry.spawnState({}), MOVE(0, 1), 90);
    const b = run(sea, sea.spawnState({}), MOVE(0, 1), 90);
    assert.equal(b.wading, true);
    assert.ok(b.speed < a.speed * 0.6, `water ${b.speed} vs land ${a.speed}`);
  });

  test('ice keeps its momentum long after the stick is released', () => {
    const icy = createCollisionWorld(stubField());
    icy.isIce = () => true;
    const c = createGameFeel(icy);
    let s = run(c, c.spawnState({}), MOVE(0, 1), 200);
    assert.equal(s.surface, 'ice');
    s = run(c, s, MOVE(0, 0), 30);
    assert.ok(s.speed > 1, `ice let go of the momentum too fast: ${s.speed}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: turning and skids', () => {
  test('a standing hero faces the stick on the very first step', () => {
    const c = createGameFeel(flat());
    const s = c.step(c.spawnState({ yaw: 0 }), MOVE(1, 0), DT);
    assert.ok(Math.abs(wrapAngle(s.yaw - Math.PI / 2)) < 1e-6);
  });

  test('slamming the stick backwards at speed starts a visible skid', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    const before = s.speed;
    s = c.step(s, MOVE(0, -1), DT);
    assert.ok(s.skidT > 0, 'no skid started');
    assert.equal(s.ev.skid, 1);
    assert.ok(s.ev.dust > 0, 'a skid must throw dust');
    // The slide is VISIBLE: the body has begun to turn while the momentum
    // still points the old way. That mismatch is the whole effect.
    let maxMismatch = 0;
    for (let i = 0; i < 30 && s.skidT > 0; i++) {
      s = c.step(s, MOVE(0, -1), DT);
      maxMismatch = Math.max(maxMismatch, Math.abs(wrapAngle(s.yaw - Math.atan2(s.headX, s.headZ))));
    }
    assert.ok(maxMismatch > 0.5, `body never diverged from momentum (${maxMismatch})`);
    assert.ok(s.speed < before, 'a skid must scrub speed');
  });

  test('the skid resolves facing the new way, with speed to spare', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    s = run(c, s, MOVE(0, -1), 40);
    assert.equal(s.skidT, 0);
    assert.ok(s.speed >= 1, 'a 180 must relaunch you, not strand you');
    assert.ok(s.headZ < -0.5, `heading did not come round: ${s.headZ}`);
  });

  test('a gentle direction change is an arc, not a skid', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    s = c.step(s, MOVE(0.5, 0.87), DT);
    assert.equal(s.skidT, 0);
    assert.equal(s.ev.skid, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: jump feel', () => {
  const apexOf = (c, input) => {
    let s = c.step(c.spawnState({}), { ...input, jump: true }, DT);
    let top = s.pos.y;
    for (let i = 0; i < 200 && !s.grounded; i++) {
      s = c.step(s, input, DT);
      top = Math.max(top, s.pos.y);
    }
    return top - DRY;
  };

  test('variable height: a tap is a fraction of a hold', () => {
    const c = createGameFeel(flat());
    const hold = apexOf(c, { x: 0, z: 0, jumpHeld: true });
    const tap = apexOf(c, { x: 0, z: 0, jumpHeld: false });
    assert.ok(hold > tap * 1.5, `hold ${hold.toFixed(2)} vs tap ${tap.toFixed(2)}`);
    assert.ok(tap > 0.3, 'a tap must still be a real hop');
  });

  test('apex hang: the hero spends longer near the top than the maths says', () => {
    const c = createGameFeel(flat());
    const input = { x: 0, z: 0, jumpHeld: true };
    let s = c.step(c.spawnState({}), { ...input, jump: true }, DT);
    let top = 0;
    const frames = [];
    for (let i = 0; i < 200 && !s.grounded; i++) {
      s = c.step(s, input, DT);
      frames.push(s.pos.y - DRY);
      top = Math.max(top, s.pos.y - DRY);
    }
    const nearTop = frames.filter((y) => y > top - 0.15).length;
    const total = frames.length;
    // Under constant gravity a ballistic arc spends ~sqrt(0.15/top) of its
    // time in the top 0.15 m. The apex band must beat that comfortably.
    const ballistic = Math.sqrt(0.15 / top);
    assert.ok(nearTop / total > ballistic * 1.15,
      `hang ${(nearTop / total).toFixed(3)} vs ballistic ${ballistic.toFixed(3)}`);
  });

  test('fast-fall cuts the DESCENT roughly in half', () => {
    const c = createGameFeel(flat());
    // Only the descent is comparable: the rise is identical either way, and
    // averaging it in would hide the effect behind the climb.
    const descent = (fastFall) => {
      let s = c.step(c.spawnState({}), { x: 0, z: 0, jump: true, jumpHeld: true }, DT);
      while (s.vel.y > 0) s = c.step(s, { x: 0, z: 0, jumpHeld: true }, DT);
      let n = 0;
      while (!s.grounded && n < 400) { s = c.step(s, { x: 0, z: 0, jumpHeld: true, fastFall }, DT); n++; }
      return n;
    };
    assert.ok(descent(true) <= descent(false) * 0.8,
      `${descent(true)} vs ${descent(false)} frames of fall`);
  });

  test('a running jump goes higher than a standing one', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 60);
    s = c.step(s, MOVE(0, 1, { jump: true, jumpHeld: true }), DT);
    const running = s.vel.y;
    const standing = c.step(c.spawnState({}), { x: 0, z: 0, jump: true, jumpHeld: true }, DT).vel.y;
    assert.ok(running > standing, `${running} should beat ${standing}`);
  });

  test('coyote time works off a real cliff', () => {
    const c = createGameFeel(cliffWorld(-30));
    let s = c.spawnState({ x: -1, z: 0 });
    // Walk off the edge along +x.
    for (let i = 0; i < 40 && s.grounded; i++) s = c.step(s, MOVE(1, 0), DT);
    assert.equal(s.grounded, false, 'never left the plateau');
    assert.ok(s.coyoteT < FEEL.coyoteT, 'window should still be open');
    const jumped = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    assert.ok(jumped.vel.y > 5, 'the coyote jump did not fire');
  });

  test('coyote time is consumed — it never hands out a free double jump', () => {
    const c = createGameFeel(cliffWorld(-30));
    let s = c.spawnState({ x: -1, z: 0 });
    for (let i = 0; i < 40 && s.grounded; i++) s = c.step(s, MOVE(1, 0), DT);
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    const first = s.vel.y;
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    // The second press may only be served by the AIR jump, which is weaker
    // and increments the counter. It must never be a second ground jump.
    assert.equal(s.airJumps, 0, 'air jump fired before airJumpMinT');
    assert.ok(s.vel.y < first);
  });

  test('input buffering fires the jump on touchdown', () => {
    // Air jumps OFF: with one available, a press in mid-air is correctly
    // spent on the double jump, and the buffer only matters once the double
    // is gone. This test is about the buffer, so the double is taken away.
    const c = createGameFeel(flat(), { airJumps: 0 });
    let s = c.step(c.spawnState({}), { x: 0, z: 0, jump: true, jumpHeld: true }, DT);
    // Fall until we are within the buffer window of landing, then press.
    while (!s.grounded && (s.vel.y > 0 || s.pos.y - DRY > 0.45)) {
      s = c.step(s, { x: 0, z: 0, jumpHeld: false }, DT);
    }
    s = c.step(s, { x: 0, z: 0, jump: true, jumpHeld: true }, DT);
    let relaunched = false;
    for (let i = 0; i < 12; i++) {
      s = c.step(s, { x: 0, z: 0, jumpHeld: true }, DT);
      if (s.ev.jump > 0) { relaunched = true; break; }
    }
    assert.ok(relaunched, 'the buffered press was eaten by the landing');
  });

  test('the spin double jump exists, fires once, and saves a bad fall', () => {
    const c = createGameFeel(cliffWorld(-30));
    let s = c.spawnState({ x: -1, z: 0 });
    for (let i = 0; i < 40 && s.grounded; i++) s = c.step(s, MOVE(1, 0), DT);
    // Fall well past the coyote window, gathering downward speed.
    for (let i = 0; i < 30; i++) s = c.step(s, MOVE(1, 0), DT);
    assert.ok(s.vel.y < -3);
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    assert.equal(s.airJumps, 1);
    assert.ok(s.ev.airJump > 0);
    assert.ok(s.spinT > 0, 'the rig was never told to spin');
    assert.ok(s.vel.y > 0, 'the save must actually reverse the fall');
    // ...and there is exactly one.
    let t2 = s;
    for (let i = 0; i < 30; i++) t2 = c.step(t2, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    assert.equal(t2.airJumps, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: landing reactions', () => {
  test('a big fall squashes the rig, dips the camera and throws dust', () => {
    const c = createGameFeel(cliffWorld(-6));
    let s = c.spawnState({ x: -1, z: 0 });
    for (let i = 0; i < 40 && s.grounded; i++) s = c.step(s, MOVE(1, 0), DT);
    let landed = null;
    for (let i = 0; i < 200 && !landed; i++) {
      s = c.step(s, MOVE(1, 0), DT);
      if (s.ev.land > 0) landed = s;
    }
    assert.ok(landed, 'never landed');
    assert.ok(landed.squash > 0.2, `squash ${landed.squash}`);
    assert.ok(landed.camDip < -0.05, `camera did not dip: ${landed.camDip}`);
    assert.ok(landed.ev.dust > 0);
    assert.ok(landed.graceT > 0);
  });

  test('the camera dip returns to rest and does not oscillate forever', () => {
    const c = createGameFeel(cliffWorld(-6));
    let s = c.spawnState({ x: -1, z: 0 });
    for (let i = 0; i < 300; i++) s = c.step(s, MOVE(1, 0), DT);
    s = run(c, s, MOVE(0, 0), 120);
    assert.ok(Math.abs(s.camDip) < 0.01, `dip never settled: ${s.camDip}`);
    assert.ok(s.squash < 0.01);
  });

  test('stepping off a kerb produces no squash at all', () => {
    const c = createGameFeel(cliffWorld(DRY - 0.3));
    let s = c.spawnState({ x: -1, z: 0 });
    for (let i = 0; i < 90; i++) s = c.step(s, MOVE(1, 0), DT);
    assert.ok(s.squash < 0.05, `a kerb squashed the hero: ${s.squash}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: slopes', () => {
  test('a gentle ramp is walkable and costs speed uphill', () => {
    const c = createGameFeel(rampWorld(20));
    const up = run(c, c.spawnState({ x: 1, z: 0 }), MOVE(1, 0), 90);
    const flatRun = run(createGameFeel(flat()), createGameFeel(flat()).spawnState({}), MOVE(1, 0), 90);
    assert.ok(up.pos.y > DRY, 'never climbed');
    assert.ok(up.speed < flatRun.speed, 'a climb must cost something');
  });

  test('a steep face SLIDES, and the slide is still steerable', () => {
    const c = createGameFeel(rampWorld(FEEL.slideDeg + 12));
    let s = c.spawnState({ x: 6, z: 0 });
    s = run(c, s, MOVE(0, 0), 30);
    assert.equal(s.sliding, true);
    assert.ok(s.pos.x < 6, 'a slide must actually move you downhill');
    assert.ok(s.speed > 1, 'a slide must build speed');
    // Steering: pushing sideways must deflect the slide.
    const straight = run(c, s, MOVE(0, 0), 30);
    const steered = run(c, s, MOVE(0, 1), 30);
    assert.ok(Math.abs(steered.pos.z - straight.pos.z) > 0.05, 'the slide is not steerable');
  });

  test('running downhill is faster than running on the flat', () => {
    const ramp = createGameFeel(rampWorld(25));
    const level = createGameFeel(flat());
    const down = run(ramp, ramp.spawnState({ x: 12, z: 0 }), MOVE(-1, 0), 60);
    const even = run(level, level.spawnState({}), MOVE(-1, 0), 60);
    assert.ok(down.speed > even.speed, `downhill ${down.speed} vs flat ${even.speed}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: ledge grab and mantle', () => {
  test('a jump that just barely misses is caught and mantled', () => {
    // A 3 m gap with a lip 1 m above the take-off. The jump clears the gap
    // horizontally but comes down short of standing height on the lip.
    const c = createGameFeel(gapWorld(3, DRY + 1.0));
    let s = c.spawnState({ x: -6, z: 0 });
    s = run(c, s, MOVE(1, 0), 60);
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    let grabbed = false;
    for (let i = 0; i < 200; i++) {
      s = c.step(s, MOVE(1, 0, { jumpHeld: true }), DT);
      if (s.ev.mantle > 0) { grabbed = true; break; }
      if (s.pos.y < -10) break;
    }
    assert.ok(grabbed, 'the ledge was not caught — the jump was punished');
    // ...and the pull-up completes onto the lip.
    for (let i = 0; i < 60 && s.ledge; i++) s = c.step(s, MOVE(1, 0), DT);
    assert.equal(s.ledge, null);
    assert.equal(s.grounded, true);
    assert.ok(Math.abs(s.pos.y - (DRY + 1.0)) < 1e-6, `landed at ${s.pos.y}`);
    assert.ok(s.speed > 0, 'the mantle must hand back some momentum');
  });

  test('a cliff far taller than a ledge is NOT mantled — the climb is preserved', () => {
    const c = createGameFeel(gapWorld(3, DRY + 6));
    let s = c.spawnState({ x: -6, z: 0 });
    s = run(c, s, MOVE(1, 0), 60);
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    for (let i = 0; i < 120; i++) {
      s = c.step(s, MOVE(1, 0, { jumpHeld: true }), DT);
      assert.equal(s.ev.mantle, 0, 'a 6 m wall must not be a ledge grab');
      if (s.pos.y < -10) break;
    }
  });

  test('the mantle is uninterruptible and deterministic', () => {
    const c = createGameFeel(gapWorld(3, DRY + 1.0));
    let s = c.spawnState({ x: -6, z: 0 });
    s = run(c, s, MOVE(1, 0), 60);
    s = c.step(s, MOVE(1, 0, { jump: true, jumpHeld: true }), DT);
    for (let i = 0; i < 200 && !s.ledge; i++) s = c.step(s, MOVE(1, 0, { jumpHeld: true }), DT);
    assert.ok(s.ledge);
    const a = JSON.stringify(c.step(s, MOVE(-1, 0, { jump: true }), DT));
    const b = JSON.stringify(c.step(s, MOVE(0, 0), DT));
    // Different input, same result: nothing steers a pull-up.
    assert.equal(JSON.parse(a).pos.x, JSON.parse(b).pos.x);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the controller: presentation channels', () => {
  test('a sprint opens the FOV, raises the speed lines and sheds scraps', () => {
    const c = createGameFeel(flat());
    let s = run(c, c.spawnState({}), MOVE(0, 1), 120);
    assert.ok(s.fovKick > 0.8, `fov ${s.fovKick}`);
    assert.ok(s.speedLines > 0.5, `lines ${s.speedLines}`);
    let scraps = 0;
    for (let i = 0; i < 60; i++) { s = c.step(s, MOVE(0, 1), DT); scraps += s.trailSpawn; }
    assert.ok(scraps > 6, `only ${scraps} scraps in a second of sprinting`);
  });

  test('a walk sheds nothing and kicks nothing', () => {
    const c = createGameFeel(flat());
    let s = c.spawnState({});
    let scraps = 0;
    for (let i = 0; i < 120; i++) {
      s = c.step(s, { x: 0, z: 0.6, run: false }, DT);
      scraps += s.trailSpawn;
    }
    assert.equal(scraps, 0);
    assert.ok(s.fovKick < 0.05, `a walk kicked the FOV: ${s.fovKick}`);
  });

  test('a slide throws dust on a throttle, never every frame', () => {
    const c = createGameFeel(rampWorld(FEEL.slideDeg + 12));
    let s = c.spawnState({ x: 6, z: 0 });
    let puffs = 0;
    for (let i = 0; i < 120; i++) { s = c.step(s, MOVE(0, 0), DT); if (s.ev.dust > 0) puffs++; }
    assert.ok(puffs > 4, 'a slide must smoke');
    assert.ok(puffs < 60, `dust every frame (${puffs}/120) would drown the hero`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('composition with traversal', () => {
  test('any non-walk mode is delegated to the base controller untouched', () => {
    let seen = null;
    const base = {
      spawnState: () => ({}),
      step: (s, i, dt) => { seen = { s, i, dt }; return { ...s, tag: 'base' }; },
    };
    const c = createGameFeel(flat(), {}, { base });
    const climbing = { ...c.spawnState({}), mode: 'climb' };
    const out = c.step(climbing, MOVE(0, 1), DT);
    assert.equal(out.tag, 'base');
    assert.equal(seen.s, climbing);
    // ...and a walk-mode state is handled here, not delegated.
    seen = null;
    c.step({ ...c.spawnState({}), mode: 'walk' }, MOVE(0, 1), DT);
    assert.equal(seen, null);
  });

  test('a bare controller state is accepted and upgraded', () => {
    const c = createGameFeel(flat());
    const bare = { pos: { x: 1, y: DRY, z: 2 }, vel: { x: 3, y: 0, z: 0 }, yaw: 0.2, grounded: true };
    const s = c.step(bare, MOVE(1, 0), DT);
    assert.ok(Number.isFinite(s.speed));
    assert.ok(s.speed > 2, 'the incoming velocity must become momentum');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the FX rig', () => {
  const PALETTE = new Set(Object.values(PAPER));

  test('is three instanced meshes — three draw calls, on budget', () => {
    const parent = new THREE.Group();
    const fx = createFeelFx({ parent });
    assert.equal(parent.children[0], fx.group);
    const meshes = [...fx.group.children, ...fx.lineGroup.children];
    assert.equal(meshes.length, 3, 'the whole rig must be three draw calls');
    for (const m of meshes) assert.ok(m.isInstancedMesh, `${m.name} is not instanced`);
    assert.equal(fx.stats.drawCalls, 3);
    fx.dispose();
  });

  test('every colour is a PAPER colour and every shadow ply is TEAL', () => {
    const fx = createFeelFx({});
    const [dust, trail] = fx.group.children;
    for (const m of [dust, trail, fx.lineGroup.children[0]]) {
      assert.ok(PALETTE.has(m.material.color.getHex()), `${m.name} is off-palette`);
    }
    // The dust's shadow ply: odd slots carry the teal, not a grey.
    const c = new THREE.Color();
    dust.getColorAt(1, c);
    assert.equal(c.getHex(), PAPER.tealL);
    dust.getColorAt(0, c);
    assert.equal(c.getHex(), PAPER.cream);
    fx.dispose();
  });

  test('a landing event puts dust on the ground and the pool recycles', () => {
    const fx = createFeelFx({});
    const [dust] = fx.group.children;
    assert.equal(dust.visible, false);
    const feel = {
      pos: { x: 2, y: 5, z: -1 }, groundY: 4.5, vel: { x: 0, y: 0, z: 0 },
      speedLines: 0, trailSpawn: 0, ev: { dust: 1 },
    };
    fx.emit(feel);
    fx.update(1 / 60, feel, 0);
    assert.equal(dust.visible, true);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    dust.getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    assert.ok(Math.abs(p.x - 2) < 0.5 && Math.abs(p.y - 4.5) < 0.3,
      'the puff must sit at the FEET, not at the hips');
    // Left alone, it dies and the mesh goes quiet again.
    for (let i = 0; i < 120; i++) fx.update(1 / 60, { ...feel, ev: { dust: 0 } }, 0);
    assert.equal(dust.visible, false);
    fx.dispose();
  });

  test('scraps shed only when the sim asks, and speed lines follow intensity', () => {
    const fx = createFeelFx({});
    const [, trail] = fx.group.children;
    const idle = {
      pos: { x: 0, y: 1, z: 0 }, groundY: 1, vel: { x: 0, y: 0, z: 0 },
      speedLines: 0, trailSpawn: 0, ev: { dust: 0 },
    };
    fx.update(1 / 60, idle, 0);
    assert.equal(trail.visible, false);
    assert.equal(fx.lineGroup.visible, false);
    const fast = { ...idle, trailSpawn: 3, vel: { x: 9, y: 0, z: 0 }, speedLines: 0.9 };
    fx.emit(fast);
    fx.update(1 / 60, fast, 0);
    assert.equal(trail.visible, true);
    assert.equal(fx.lineGroup.visible, true);
    assert.ok(fx.lineGroup.children[0].material.opacity > 0.3);
    fx.dispose();
  });

  test('the pools are deterministic — two runs place every scrap identically', () => {
    const snapshot = () => {
      const fx = createFeelFx({});
      const feel = {
        pos: { x: 0, y: 1, z: 0 }, groundY: 1, vel: { x: 8, y: 0, z: 0 },
        speedLines: 1, trailSpawn: 1, ev: { dust: 0.6 },
      };
      for (let i = 0; i < 40; i++) { fx.emit(feel); fx.update(1 / 60, feel, 0.25); }
      const out = [
        [...fx.group.children[0].instanceMatrix.array],
        [...fx.group.children[1].instanceMatrix.array],
        [...fx.lineGroup.children[0].instanceMatrix.array],
      ];
      fx.dispose();
      return JSON.stringify(out);
    };
    assert.equal(snapshot(), snapshot());
  });

  test('reset empties the pools and dispose releases everything', () => {
    const parent = new THREE.Group();
    const fx = createFeelFx({ parent });
    const feel = {
      pos: { x: 0, y: 1, z: 0 }, groundY: 1, vel: { x: 8, y: 0, z: 0 },
      speedLines: 1, trailSpawn: 2, ev: { dust: 1 },
    };
    fx.emit(feel);
    fx.update(1 / 60, feel, 0);
    fx.reset();
    assert.equal(fx.group.children[0].visible, false);
    assert.equal(fx.group.children[1].visible, false);
    assert.equal(fx.lineGroup.visible, false);

    const disposed = [];
    for (const m of [...fx.group.children, ...fx.lineGroup.children]) {
      m.geometry.dispose = () => disposed.push(`${m.name}:geo`);
      m.material.dispose = () => disposed.push(`${m.name}:mat`);
    }
    fx.dispose();
    assert.equal(disposed.length, 6, `only disposed ${disposed.join(', ')}`);
    assert.equal(parent.children.length, 0, 'the group must detach itself');
  });

  test('a hidden instance is scaled to zero, never left floating at the origin', () => {
    const fx = createFeelFx({});
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    fx.group.children[0].getMatrixAt(5, m);
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    assert.equal(s.lengthSq(), 0);
    fx.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the FX rig: the step/draw split', () => {
  const feelAt = (dust) => ({
    pos: { x: 0, y: 1, z: 0 }, groundY: 1, vel: { x: 0, y: 0, z: 0 },
    speedLines: 0, trailSpawn: 0, ev: { dust },
  });

  test('drawing without stepping never re-fires an event', () => {
    // renderer.js draws once per rAF but steps on a fixed accumulator, so a
    // fast frame draws with NO sim step behind it. That must not double the
    // dust — which is exactly what reading `ev` at draw time used to do.
    const fx = createFeelFx({});
    const dust = fx.group.children[0];
    fx.emit(feelAt(1));
    fx.update(1 / 240, feelAt(1), 0);
    const first = countLive(dust);
    for (let i = 0; i < 5; i++) fx.update(1 / 240, feelAt(1), 0);
    assert.equal(countLive(dust), first, 'a draw spawned dust on its own');
    fx.dispose();
  });

  test('stepping twice between draws keeps BOTH bursts', () => {
    const fx = createFeelFx({});
    const dust = fx.group.children[0];
    fx.emit(feelAt(1));
    fx.emit(feelAt(1));
    fx.update(1 / 60, feelAt(0), 0);
    const two = countLive(dust);
    const fx1 = createFeelFx({});
    fx1.emit(feelAt(1));
    fx1.update(1 / 60, feelAt(0), 0);
    assert.ok(two > countLive(fx1.group.children[0]), 'a swallowed sim step');
    fx.dispose();
    fx1.dispose();
  });

  function countLive(mesh) {
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < mesh.instanceMatrix.count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      if (s.lengthSq() > 0) n++;
    }
    return n;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the shape of the jump, measured', () => {
  test('a full-hold jump is chest-high and lasts under a second', () => {
    const c = createGameFeel(flat());
    let s = c.step(c.spawnState({}), { x: 0, z: 0, jump: true, jumpHeld: true }, DT);
    let top = 0;
    let n = 0;
    while (!s.grounded && n < 400) {
      s = c.step(s, { x: 0, z: 0, jumpHeld: true }, DT);
      top = Math.max(top, s.pos.y - DRY);
      n++;
    }
    // These are the numbers the level builder designs against, so they are
    // pinned: change them on purpose or not at all.
    assert.ok(top > 1.5 && top < 2.1, `apex ${top.toFixed(2)}m`);
    assert.ok(n * DT < 1.0, `hang time ${(n * DT).toFixed(2)}s is a moon jump`);
  });

  test('a running jump clears a gap a standing one cannot', () => {
    const c = createGameFeel(flat());
    const gapOf = (windup) => {
      let s = c.spawnState({});
      for (let i = 0; i < windup; i++) s = c.step(s, MOVE(0, 1), DT);
      const z0 = s.pos.z;
      s = c.step(s, MOVE(0, 1, { jump: true, jumpHeld: true }), DT);
      let n = 0;
      while (!s.grounded && n < 400) { s = c.step(s, MOVE(0, 1, { jumpHeld: true }), DT); n++; }
      return s.pos.z - z0;
    };
    const running = gapOf(80);
    const standing = gapOf(0);
    assert.ok(running > 6, `a run-up only bought ${running.toFixed(2)}m`);
    assert.ok(running > standing * 1.3, `${running.toFixed(2)} vs ${standing.toFixed(2)}`);
  });
});
