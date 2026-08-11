import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLS, wrapAngle, applyStick, pickSource, speedFraction, resolveJump,
  resolveInput, toControllerInput, createOrbitState, stepOrbit, actionLabel,
  readGamepad, padButtonBits,
} from './controls3d.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const T = CONTROLS;

/** A raw frame with everything neutral; spread over it to vary one thing. */
function frame(over = {}) {
  return {
    stick: { x: 0, y: 0, active: false },
    pad: null,
    keys: {},
    look: { dx: 0, dy: 0 },
    dt: 1 / 60,
    now: 1000,
    grounded: true,
    pressedAt: null,
    groundedAt: 1000,
    prevMoveX: 0,
    prevMoveZ: 0,
    touchAction: false,
    ...over,
  };
}

/** Run resolveInput n times, threading the previous move (what poll() does). */
function settle(over, yaw = 0, n = 120, tuning = T) {
  const f = frame(over);
  let r = { moveX: 0, moveZ: 0 };
  for (let i = 0; i < n; i++) {
    f.prevMoveX = r.moveX;
    f.prevMoveZ = r.moveZ;
    r = resolveInput(f, yaw, tuning, {});
  }
  return r;
}

describe('wrapAngle', () => {
  test('wraps into [-PI, PI)', () => {
    near(wrapAngle(0), 0);
    near(Math.abs(wrapAngle(Math.PI * 3)), Math.PI, 1e-9);
    near(Math.abs(wrapAngle(-Math.PI * 3)), Math.PI, 1e-9);
    near(wrapAngle(Math.PI * 1.5), -Math.PI * 0.5, 1e-9);
    for (const a of [-9, -3, -0.4, 0.4, 3, 9, 100]) {
      const w = wrapAngle(a);
      assert.ok(w >= -Math.PI && w < Math.PI + 1e-12, `${a} -> ${w}`);
      near(Math.cos(w), Math.cos(a), 1e-9);
      near(Math.sin(w), Math.sin(a), 1e-9);
    }
  });
});

describe('applyStick — dead zone, saturation, curve', () => {
  test('inside the dead zone is exactly nothing', () => {
    const r = applyStick(T.stickDead * 0.99, 0);
    assert.equal(r.mag, 0);
    assert.equal(r.x, 0);
    assert.equal(r.y, 0);
  });

  test('a resting thumb never creeps: tiny offsets in every direction are dead', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const r = applyStick(Math.cos(a) * 0.1, Math.sin(a) * 0.1);
      assert.equal(r.mag, 0);
    }
  });

  test('outer saturation reaches full before the painted rim', () => {
    near(applyStick(T.stickSat, 0).mag, 1, 1e-9);
    near(applyStick(1, 0).mag, 1, 1e-9);
    // ...and beyond the rim it is still clamped, never >1.
    assert.ok(applyStick(3, 4).mag <= 1);
  });

  test('conditioning is RADIAL — direction survives exactly', () => {
    const r = applyStick(0.6, 0.6);
    near(r.x, r.y, 1e-12);
    const a = applyStick(0.3, 0.9);
    near(Math.atan2(a.y, a.x), Math.atan2(0.9, 0.3), 1e-12);
  });

  test('the response curve favours fine control near centre', () => {
    // Half deflection must produce LESS than half output with curve > 1.
    const half = (T.stickDead + T.stickSat) / 2;
    assert.ok(T.stickCurve > 1);
    assert.ok(applyStick(half, 0).mag < 0.5);
  });

  test('magnitude is monotonic in deflection', () => {
    let prev = -1;
    for (let d = 0; d <= 1.0001; d += 0.05) {
      const m = applyStick(d, 0).mag;
      assert.ok(m >= prev - 1e-12, `not monotonic at ${d}`);
      prev = m;
    }
  });
});

describe('pickSource — one driver at a time', () => {
  test('a resting gamepad cannot fight a pushed thumb', () => {
    const s = pickSource(frame({
      stick: { x: 0, y: -1, active: true },
      pad: { x: 0.15, y: 0.15 },
    }));
    near(s.x, 0);
    assert.ok(s.y < -0.9);
  });

  test('keyboard is a WALK by default and a RUN with shift', () => {
    const walk = pickSource(frame({ keys: { up: true } }));
    near(walk.mag, T.keyWalk);
    assert.ok(walk.mag < T.runAt, 'plain WASD must not sprint');
    const run = pickSource(frame({ keys: { up: true, run: true } }));
    near(run.mag, 1);
  });

  test('diagonal keys are normalised, never faster than a straight line', () => {
    const d = pickSource(frame({ keys: { up: true, right: true } }));
    near(d.mag, T.keyWalk, 1e-12);
    near(Math.hypot(d.x, d.y), T.keyWalk, 1e-12);
  });

  test('a run modifier promotes a partial pad push to full', () => {
    const s = pickSource(frame({ pad: { x: 0, y: -0.6, run: true } }));
    near(s.mag, 1, 1e-9);
  });

  test('the gamepad dead zone is larger than the touch one', () => {
    assert.ok(T.padDead > T.stickDead);
    const s = pickSource(frame({ pad: { x: 0.2, y: 0 } }));
    assert.equal(s.mag, 0);
  });
});

describe('speedFraction — the walk/run seam', () => {
  test('full walk is exactly the controller walk speed', () => {
    near(speedFraction(T.runAt - 1e-9), T.walkTop, 1e-6);
  });

  test('the seam is continuous — no speed step where the run begins', () => {
    const below = speedFraction(T.runAt - 1e-6);
    const above = speedFraction(T.runAt + 1e-6);
    assert.ok(Math.abs(above - below) < 1e-4, `step of ${above - below} at the seam`);
  });

  test('full deflection is a full run, with no run button anywhere', () => {
    near(speedFraction(1), 1, 1e-9);
  });

  test('monotonic across the whole range', () => {
    let prev = -1;
    for (let m = 0; m <= 1.0001; m += 0.02) {
      const f = speedFraction(m);
      assert.ok(f >= prev - 1e-12, `not monotonic at ${m}`);
      prev = f;
    }
  });
});

describe('resolveJump — coyote time and buffering', () => {
  const t0 = 10_000;

  test('a press with feet down jumps', () => {
    assert.equal(resolveJump({ now: t0, grounded: true, pressedAt: t0, groundedAt: t0 }), true);
  });

  test('no press, no jump — however grounded', () => {
    assert.equal(resolveJump({ now: t0, grounded: true, pressedAt: null, groundedAt: t0 }), false);
  });

  test('COYOTE: pressing just after walking off a ledge still jumps', () => {
    const airborne = { now: t0, grounded: false, groundedAt: t0 - (T.coyoteMs - 20) };
    assert.equal(resolveJump({ ...airborne, pressedAt: t0 }), true);
  });

  test('...but not once the coyote window has closed', () => {
    const late = { now: t0, grounded: false, groundedAt: t0 - (T.coyoteMs + 20), pressedAt: t0 };
    assert.equal(resolveJump(late), false);
  });

  test('BUFFER: a press made just before landing fires on touchdown', () => {
    const early = { now: t0, grounded: true, groundedAt: t0, pressedAt: t0 - (T.bufferMs - 20) };
    assert.equal(resolveJump(early), true);
  });

  test('...but a stale press is forgotten, not hoarded', () => {
    const stale = { now: t0, grounded: true, groundedAt: t0, pressedAt: t0 - (T.bufferMs + 50) };
    assert.equal(resolveJump(stale), false);
  });

  test('both windows are forgiving enough to matter (>=100ms)', () => {
    assert.ok(T.coyoteMs >= 100);
    assert.ok(T.bufferMs >= 100);
  });
});

describe('resolveInput — camera-relative movement', () => {
  test('stick up walks AWAY from the eye at camera yaw 0', () => {
    const r = settle({ stick: { x: 0, y: -1, active: true } }, 0);
    near(r.moveX, 0, 1e-9);
    assert.ok(r.moveZ > 0.9, `expected +Z forward, got ${r.moveZ}`);
  });

  test('stick up walks away from the eye at ANY camera yaw', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, 2.5, Math.PI, -1.3]) {
      const r = settle({ stick: { x: 0, y: -1, active: true } }, yaw);
      const m = Math.hypot(r.moveX, r.moveZ);
      near(wrapAngle(Math.atan2(r.moveX / m, r.moveZ / m) - yaw), 0, 1e-6);
    }
  });

  test('stick right strafes to the camera\'s right, 90 degrees off forward', () => {
    const yaw = 1.1;
    const f = settle({ stick: { x: 0, y: -1, active: true } }, yaw);
    const r = settle({ stick: { x: 1, y: 0, active: true } }, yaw);
    const dot = (f.moveX * r.moveX + f.moveZ * r.moveZ)
      / (Math.hypot(f.moveX, f.moveZ) * Math.hypot(r.moveX, r.moveZ));
    near(dot, 0, 1e-6);
    // Right of forward means the cross product forward x right points down.
    assert.ok(f.moveZ * r.moveX - f.moveX * r.moveZ > 0);
  });

  test('full deflection RUNS; a gentle push does not', () => {
    const run = settle({ stick: { x: 0, y: -1, active: true } });
    assert.equal(run.run, true);
    const creep = settle({ stick: { x: 0, y: -0.45, active: true } });
    assert.equal(creep.run, false);
  });

  test('the analog middle is real: half a push is a fraction of the speed', () => {
    const full = settle({ stick: { x: 0, y: -1, active: true } });
    const half = settle({ stick: { x: 0, y: -0.55, active: true } });
    const fm = Math.hypot(full.moveX, full.moveZ);
    const hm = Math.hypot(half.moveX, half.moveZ);
    assert.ok(hm > 0.05 && hm < fm * 0.75, `half push gave ${hm} vs full ${fm}`);
  });
});

describe('resolveInput — acceleration and turn feel', () => {
  test('the hero does not snap to full speed in one frame', () => {
    const r = resolveInput(frame({ stick: { x: 0, y: -1, active: true } }), 0, T, {});
    const m = Math.hypot(r.moveX, r.moveZ);
    assert.ok(m > 0, 'must start moving immediately');
    assert.ok(m < 0.25, `one frame reached ${m} — that is a snap, not a start`);
  });

  test('acceleration reaches full speed in roughly the advertised time', () => {
    const f = frame({ stick: { x: 0, y: -1, active: true } });
    let r = { moveX: 0, moveZ: 0 };
    let frames = 0;
    while (Math.hypot(r.moveX, r.moveZ) < 0.99 && frames < 600) {
      f.prevMoveX = r.moveX; f.prevMoveZ = r.moveZ;
      r = resolveInput(f, 0, T, {});
      frames++;
    }
    const secs = frames / 60;
    assert.ok(secs > 0.08 && secs < 0.30, `0->full took ${secs.toFixed(3)}s`);
  });

  test('deceleration is quicker than acceleration — you stop on the ledge', () => {
    assert.ok(T.decel > T.accel);
    const f = frame({ prevMoveX: 0, prevMoveZ: 1 });
    let r = resolveInput(f, 0, T, {});
    let frames = 1;
    while (Math.hypot(r.moveX, r.moveZ) > 0 && frames < 600) {
      f.prevMoveX = r.moveX; f.prevMoveZ = r.moveZ;
      r = resolveInput(f, 0, T, {});
      frames++;
    }
    assert.ok(frames / 60 < 0.2, `full->stop took ${(frames / 60).toFixed(3)}s`);
  });

  test('the first step goes exactly where the thumb points (no sweep)', () => {
    const r = resolveInput(frame({ stick: { x: 1, y: 0, active: true } }), 0, T, {});
    near(Math.atan2(r.moveX, r.moveZ), Math.PI / 2, 1e-9);
  });

  test('turning at speed is an ARC, not a teleport', () => {
    // Running +Z, then ask for +X: one frame must not deliver the new heading.
    const f = frame({ stick: { x: 1, y: 0, active: true }, prevMoveX: 0, prevMoveZ: 1 });
    const r = resolveInput(f, 0, T, {});
    const ang = Math.atan2(r.moveX, r.moveZ);
    assert.ok(ang > 0.01, 'must begin turning at once');
    assert.ok(ang < Math.PI / 2 - 0.05, `snapped to ${ang} in one frame`);
  });

  test('a standing pivot is far quicker than a sprinting one', () => {
    const slow = resolveInput(frame({ stick: { x: 1, y: 0, active: true }, prevMoveX: 0, prevMoveZ: 1 }), 0, T, {});
    const fast = resolveInput(frame({ stick: { x: 1, y: 0, active: true }, prevMoveX: 0, prevMoveZ: 0.05 }), 0, T, {});
    assert.ok(Math.atan2(fast.moveX, fast.moveZ) > Math.atan2(slow.moveX, slow.moveZ));
  });

  test('a hard reversal bleeds speed so the hero plants a foot', () => {
    // Sprinting +Z. A 180 flick must cost speed; a 90 turn must not.
    const flip = resolveInput(frame({ stick: { x: 0, y: 1, active: true }, prevMoveX: 0, prevMoveZ: 1 }), 0, T, {});
    const side = resolveInput(frame({ stick: { x: 1, y: 0, active: true }, prevMoveX: 0, prevMoveZ: 1 }), 0, T, {});
    assert.ok(Math.hypot(flip.moveX, flip.moveZ) < 0.8, 'a reversal must cost speed');
    assert.ok(Math.hypot(flip.moveX, flip.moveZ) < Math.hypot(side.moveX, side.moveZ) - 0.2);
  });

  test('a reversal in mid-air does NOT bleed speed (you cannot plant a foot)', () => {
    const air = resolveInput(frame({ stick: { x: 0, y: 1, active: true }, prevMoveX: 0, prevMoveZ: 1, grounded: false }), 0, T, {});
    assert.ok(Math.hypot(air.moveX, air.moveZ) > 0.95);
  });

  test('mid-air steering is weaker than ground steering', () => {
    assert.ok(T.airAccel < T.accel);
    const air = resolveInput(frame({ stick: { x: 0, y: -1, active: true }, grounded: false }), 0, T, {});
    const gnd = resolveInput(frame({ stick: { x: 0, y: -1, active: true }, grounded: true }), 0, T, {});
    assert.ok(Math.hypot(air.moveX, air.moveZ) < Math.hypot(gnd.moveX, gnd.moveZ));
  });

  test('released stick always settles at exactly zero (no residual drift)', () => {
    const r = settle({ prevMoveX: 0.3, prevMoveZ: -0.4 });
    assert.equal(r.moveX, 0);
    assert.equal(r.moveZ, 0);
    assert.equal(r.run, false);
  });

  test('resolveInput never allocates when handed an out object', () => {
    const out = { moveX: 0, moveZ: 0, run: false, jump: false, action: false, camYawDelta: 0, camPitchDelta: 0 };
    const a = resolveInput(frame({ stick: { x: 0, y: -1, active: true } }), 0, T, out);
    assert.equal(a, out);
  });

  test('a stalled tab cannot teleport the hero (dt is clamped)', () => {
    const huge = resolveInput(frame({ stick: { x: 0, y: -1, active: true }, dt: 30 }), 0, T, {});
    assert.ok(Math.hypot(huge.moveX, huge.moveZ) <= 1 + 1e-9);
  });
});

describe('resolveInput — camera deltas', () => {
  test('drag right pans the view right (yaw increases)', () => {
    const r = resolveInput(frame({ look: { dx: 100, dy: 0 } }), 0, T, {});
    assert.ok(r.camYawDelta > 0);
    near(r.camYawDelta, 100 * T.lookScaleX, 1e-12);
  });

  test('pitch is slower than yaw — vertical overshoot is what nauseates', () => {
    assert.ok(T.lookScaleY < T.lookScaleX);
    const r = resolveInput(frame({ look: { dx: 100, dy: 100 } }), 0, T, {});
    assert.ok(Math.abs(r.camPitchDelta) < Math.abs(r.camYawDelta));
  });

  test('a pointer-locked mouse uses the finer scale', () => {
    const m = resolveInput(frame({ look: { dx: 100, dy: 0, mouse: true } }), 0, T, {});
    const t = resolveInput(frame({ look: { dx: 100, dy: 0, mouse: false } }), 0, T, {});
    assert.ok(Math.abs(m.camYawDelta) < Math.abs(t.camYawDelta));
  });

  test('the gamepad right stick orbits, and is rate- not pixel-based', () => {
    const a = resolveInput(frame({ pad: { camX: 1, camY: 0 }, dt: 1 / 60 }), 0, T, {});
    const b = resolveInput(frame({ pad: { camX: 1, camY: 0 }, dt: 2 / 60 }), 0, T, {});
    assert.ok(a.camYawDelta > 0);
    near(b.camYawDelta, a.camYawDelta * 2, 1e-9);
  });

  test('a resting right stick does not drift the camera', () => {
    const r = resolveInput(frame({ pad: { camX: 0.15, camY: -0.15 } }), 0, T, {});
    assert.equal(r.camYawDelta, 0);
    assert.equal(r.camPitchDelta, 0);
  });
});

describe('toControllerInput — the two speed scales', () => {
  test('a run passes straight through', () => {
    const o = toControllerInput({ moveX: 0, moveZ: 1, run: true });
    near(o.z, 1);
    assert.equal(o.run, true);
  });

  test('full walk becomes full magnitude on the WALK speed', () => {
    const o = toControllerInput({ moveX: 0, moveZ: T.walkTop, run: false });
    near(o.z, 1, 1e-9);
    assert.equal(o.run, false);
  });

  test('speed is continuous across the walk/run handoff', () => {
    // controller speed = (run ? runSpeed : speed) * min(mag,1)
    const RUN = 8.5;
    const WALK = 6;
    const spd = (m) => {
      const res = { moveX: 0, moveZ: m, run: m > T.walkTop + 1e-4 };
      const o = toControllerInput(res);
      return (o.run ? RUN : WALK) * Math.min(1, Math.hypot(o.x, o.z));
    };
    const lo = spd(T.walkTop - 1e-5);
    const hi = spd(T.walkTop + 1e-3);
    assert.ok(Math.abs(hi - lo) < 0.05, `speed jumps ${lo} -> ${hi} at the handoff`);
    near(spd(1), RUN, 1e-6);
  });

  test('direction is never altered by the rescale', () => {
    const o = toControllerInput({ moveX: 0.3, moveZ: 0.4, run: false });
    near(Math.atan2(o.x, o.z), Math.atan2(0.3, 0.4), 1e-12);
  });

  test('zero is zero', () => {
    const o = toControllerInput({ moveX: 0, moveZ: 0, run: false });
    assert.equal(o.x, 0);
    assert.equal(o.z, 0);
  });
});

describe('stepOrbit — the camera the old build did not have', () => {
  const dt = 1 / 60;
  const drive = (over = {}) => ({ yawDelta: 0, pitchDelta: 0, zoomWant: 1, touched: false, moveN: 0, playerYaw: 0, ...over });

  test('a drag turns the camera by exactly what was asked', () => {
    const s = stepOrbit(createOrbitState(0), drive({ touched: true, yawDelta: 0.3 }), dt, T, {});
    near(s.yaw, 0.3, 1e-12);
  });

  test('pitch is clamped both ways, and the clamp kills the inertia', () => {
    let s = createOrbitState(0);
    for (let i = 0; i < 200; i++) s = stepOrbit(s, drive({ touched: true, pitchDelta: 0.1 }), dt, T, {});
    near(s.pitch, T.pitchMax, 1e-9);
    assert.equal(s.pitchVel, 0);
    for (let i = 0; i < 400; i++) s = stepOrbit(s, drive({ touched: true, pitchDelta: -0.1 }), dt, T, {});
    near(s.pitch, T.pitchMin, 1e-9);
  });

  test('you can look all the way around — yaw never clamps', () => {
    let s = createOrbitState(0);
    for (let i = 0; i < 500; i++) s = stepOrbit(s, drive({ touched: true, yawDelta: 0.05 }), dt, T, {});
    assert.ok(s.yaw >= -Math.PI && s.yaw <= Math.PI, 'yaw stays wrapped');
  });

  test('a flick coasts after release, then settles', () => {
    let s = stepOrbit(createOrbitState(0), drive({ touched: true, yawDelta: 0.05 }), dt, T, {});
    assert.ok(s.yawVel > 0, 'release velocity captured');
    const atRelease = s.yaw;
    s = stepOrbit(s, drive(), dt, T, {});
    assert.ok(s.yaw > atRelease, 'must keep gliding for a frame or two');
    for (let i = 0; i < 240; i++) s = stepOrbit(s, drive(), dt, T, {});
    assert.equal(s.yawVel, 0, 'and must come to rest');
  });

  test('inertia is capped so a dropped frame cannot spin the world', () => {
    const s = stepOrbit(createOrbitState(0), drive({ touched: true, yawDelta: 3 }), 0.001, T, {});
    assert.ok(Math.abs(s.yawVel) <= T.orbitFlickMax);
  });

  test('a MOVING player is slowly recentred behind — and it is slow', () => {
    let s = createOrbitState(2.0);
    s.idle = 99;
    const d = drive({ moveN: 1, playerYaw: 0 });
    // One frame right after the delay must move only a hair.
    const one = stepOrbit({ ...s, idle: T.recentreDelay + T.recentreEase }, d, dt, T, {});
    assert.ok(Math.abs(wrapAngle(one.yaw - 2.0)) < 0.05, 'recentre must never yank');
    for (let i = 0; i < 600; i++) s = stepOrbit(s, d, dt, T, {});
    assert.ok(Math.abs(wrapAngle(s.yaw)) < 0.05, `did not recentre, ended at ${s.yaw}`);
  });

  test('recentre takes the SHORT way round', () => {
    let s = createOrbitState(-3.0);
    s.idle = 99;
    const first = stepOrbit(s, drive({ moveN: 1, playerYaw: 3.0 }), dt, T, {});
    assert.ok(first.yaw < -3.0, 'should wrap downward, not sweep 6 radians up');
  });

  test('a STILL player is never recentred — a parked camera stays parked', () => {
    let s = createOrbitState(2.0);
    s.idle = 99;
    for (let i = 0; i < 600; i++) s = stepOrbit(s, drive({ moveN: 0, playerYaw: 0 }), dt, T, {});
    near(s.yaw, 2.0, 1e-9);
  });

  test('a camera being touched is never recentred', () => {
    let s = createOrbitState(2.0);
    s.idle = 99;
    for (let i = 0; i < 600; i++) s = stepOrbit(s, drive({ touched: true, moveN: 1, playerYaw: 0 }), dt, T, {});
    near(s.yaw, 2.0, 1e-9);
  });

  test('the recentre delay is long enough to look sideways while walking', () => {
    assert.ok(T.recentreDelay >= 1.0);
    let s = createOrbitState(2.0);
    s.idle = 0; // the thumb just lifted
    for (let i = 0; i < 55; i++) s = stepOrbit(s, drive({ moveN: 1, playerYaw: 0 }), dt, T, {});
    near(s.yaw, 2.0, 1e-9);
  });

  test('zoom eases toward the pinch target and is clamped both ways', () => {
    let s = createOrbitState(0);
    for (let i = 0; i < 300; i++) s = stepOrbit(s, drive({ zoomWant: 99 }), dt, T, {});
    near(s.zoom, T.zoomMax, 1e-6);
    for (let i = 0; i < 300; i++) s = stepOrbit(s, drive({ zoomWant: -99 }), dt, T, {});
    near(s.zoom, T.zoomMin, 1e-6);
  });

  test('zoom never jumps in a single frame', () => {
    const s = stepOrbit(createOrbitState(0), drive({ zoomWant: T.zoomMax }), dt, T, {});
    assert.ok(s.zoom < T.zoomMax);
    assert.ok(s.zoom > 1);
  });

  test('it can write in place without corrupting the step', () => {
    const s = createOrbitState(0);
    const r = stepOrbit(s, drive({ touched: true, yawDelta: 0.2 }), dt, T, s);
    assert.equal(r, s);
    near(s.yaw, 0.2, 1e-12);
  });
});

describe('actionLabel — the label IS the tutorial', () => {
  test('nothing nearby means no button', () => {
    assert.equal(actionLabel(null), null);
    assert.equal(actionLabel({ kind: '' }), null);
  });

  test('a portal says ENTER', () => {
    assert.equal(actionLabel('portal'), 'ENTER');
    assert.equal(actionLabel({ kind: 'portal' }), 'ENTER');
    assert.equal(actionLabel({ type: 'exit' }), 'ENTER');
  });

  test('a person says TALK', () => {
    assert.equal(actionLabel({ type: 'hero' }), 'TALK');
    assert.equal(actionLabel({ type: 'npc' }), 'TALK');
  });

  test('a thing says OPEN', () => {
    for (const k of ['chest', 'gearkit', 'gold', 'potion', 'golden', 'mathdoor']) {
      assert.equal(actionLabel({ type: k }), 'OPEN', k);
    }
  });
});

describe('readGamepad', () => {
  const btn = (n, downIdx = []) => Array.from({ length: n }, (_, i) => ({ pressed: downIdx.includes(i), value: 0 }));

  test('no pad reads as neutral', () => {
    const r = readGamepad(null, null, {});
    assert.deepEqual(
      { x: r.x, y: r.y, run: r.run, jumpPressed: r.jumpPressed },
      { x: 0, y: 0, run: false, jumpPressed: false },
    );
  });

  test('sticks map to move and look', () => {
    const r = readGamepad({ axes: [0.5, -0.4, -0.9, 0.2], buttons: btn(16) }, null, {});
    near(r.x, 0.5); near(r.y, -0.4); near(r.camX, -0.9); near(r.camY, 0.2);
  });

  test('the d-pad is full deflection on the left stick', () => {
    const r = readGamepad({ axes: [0, 0], buttons: btn(16, [12, 15]) }, null, {});
    near(r.y, -1);
    near(r.x, 1);
  });

  test('A is an EDGE — holding it does not jump every frame', () => {
    const pad = { axes: [0, 0], buttons: btn(16, [0]) };
    const first = readGamepad(pad, null, {});
    assert.equal(first.jumpPressed, true);
    const bits = padButtonBits(pad);
    const held = readGamepad(pad, bits, {});
    assert.equal(held.jumpPressed, false);
  });

  test('shoulder/trigger/L3 all run', () => {
    for (const i of [5, 7, 10]) {
      assert.equal(readGamepad({ axes: [0, 0], buttons: btn(16, [i]) }, null, {}).run, true, `button ${i}`);
    }
  });
});

describe('CONTROLS — the tuning contract', () => {
  test('the stick base is fixed and on screen', () => {
    assert.ok(Number.isFinite(T.stickX) && Number.isFinite(T.stickY));
    assert.ok(T.stickX > T.stickRadius && T.stickY > T.stickRadius);
  });

  test('the capture radius is genuinely generous', () => {
    assert.ok(T.stickCapture > T.stickRadius * 2);
  });

  test('the dead zone sits below the saturation point below full', () => {
    assert.ok(0 < T.stickDead && T.stickDead < T.stickSat && T.stickSat <= 1);
  });

  test('walkTop matches the controller speed ratio (6 / 8.5)', () => {
    near(T.walkTop, 6 / 8.5, 0.005);
  });

  test('the on-screen buttons do not overlap', () => {
    const d = Math.hypot(T.jumpX - T.actionX, T.jumpY - T.actionY);
    assert.ok(d > T.jumpR + T.actionR, `buttons overlap by ${T.jumpR + T.actionR - d}px`);
  });

  test('the stick and the buttons are on opposite sides', () => {
    assert.ok(T.stickX < 720 && T.jumpX > 720 && T.actionX > 720);
  });
});
