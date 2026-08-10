/**
 * controls3d — the overworld's whole input layer, in one place.
 *
 * WHAT WAS WRONG (this file is the fix):
 *
 *   1. The old virtual stick RE-ANCHORED under the thumb on every pointerdown.
 *      The origin therefore jumped mid-move, so a child who slid their thumb
 *      while walking got a stick whose centre kept teleporting to wherever
 *      they happened to be. The base here is FIXED and always visible; the
 *      capture radius around it is huge, so a sloppy thumb still grabs it, but
 *      the origin never moves.
 *   2. There was NO camera control at all. The eye rode the hero's facing, so
 *      you could not look around, could not see what was behind you, and could
 *      not line up a jump. The right half of the screen is now a camera orbit
 *      (yaw + clamped pitch, with inertia and a slow auto-recentre), and a
 *      pinch zooms the boom.
 *   3. Movement was world-axis, not camera-relative, and had no acceleration:
 *      the hero snapped from 0 to full speed and back. Movement here is
 *      resolved against the CAMERA's yaw and integrated through accel/decel
 *      curves with a weighted turn, so the hero has mass.
 *   4. Jump was a raw edge: a press one frame before landing, or one frame
 *      after walking off a ledge, was simply eaten. Coyote time and input
 *      buffering fix both.
 *
 * SHAPE OF THIS MODULE:
 *
 *   PURE (node-testable, no three/phaser/DOM at import time):
 *     CONTROLS            the one tuning table
 *     applyStick          dead zone + outer saturation + response curve
 *     pickSource          which of touch/pad/keys is driving this frame
 *     resolveInput        raw -> { moveX, moveZ, run, jump, action, cam* }
 *     stepOrbit           camera orbit integrator (inertia, clamp, recentre)
 *     toControllerInput   frac-of-run-speed -> controller.js input scale
 *     actionLabel         proximity -> ENTER / OPEN / TALK
 *     readGamepad         a Gamepad-shaped object -> raw fragment
 *
 *   IMPURE (thin Phaser widget factories, duck-typed on `scene`):
 *     createTouchControls stick + jump + context action button
 *     createLookInput     right-half drag orbit + pinch zoom
 *     createControls3D    the two above + keyboard + gamepad, one poll()
 *
 * Nothing below allocates per frame in the hot path: resolveInput and
 * stepOrbit both write into caller-supplied `out` objects.
 */
import { GAME_WIDTH, GAME_HEIGHT, PAPER } from '../config.js';

const TAU = Math.PI * 2;

/** Wrap into [-PI, PI) so every turn takes the short way round. */
export function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * THE tuning table. One object, one place, every number annotated with the
 * FEEL it buys — not with what it does. If a control complaint arrives, the
 * fix is a number in here.
 */
export const CONTROLS = {
  // ── LEFT STICK: layout ────────────────────────────────────────────────
  // A fixed base, low and inboard enough that a thumb resting on the bezel
  // sits on it naturally, and far enough from the edge that the ring is never
  // half off-screen on a rounded display.
  stickX: 250,          // px: base centre. Never moves. Ever.
  stickY: GAME_HEIGHT - 250,
  stickRadius: 118,     // px of throw for full deflection — long enough that
                        // the analog middle is usable, short enough for a thumb
  stickKnob: 50,        // px: knob is big and obvious, not a dot
  stickCapture: 330,    // px: GENEROUS grab radius around the fixed base. A
                        // five-year-old aims a thumb at "down there on the
                        // left", not at a circle.
  stickFloatMinY: 190,  // px: any touch on the LEFT HALF below this line that
                        // misses the capture disc still gets a stick — a
                        // temporary one anchored under the finger. Before this,
                        // a third of the screen was a silent dead zone (the
                        // measured D1-C): a child dragging "on the left but not
                        // on the circle" got nothing and no feedback. The FIXED
                        // base never moves; the float is a guest that leaves on
                        // release.
  stickHomeEase: 0.30,  // per-frame ease of the knob back to centre on release
                        // — springs home in ~5 frames, reads as "let go", and
                        // never snaps (a snap looks like a dropped input)

  // ── LEFT STICK: response ──────────────────────────────────────────────
  stickDead: 0.16,      // deflection below this is NOTHING. Kills the drift
                        // that makes a resting thumb creep the hero downhill.
  stickSat: 0.90,       // ...and this much deflection is already FULL, so you
                        // do not have to reach the painted rim to sprint
  stickCurve: 1.30,     // >1 bends the curve toward fine control near centre:
                        // creeping to a ledge edge is possible, sprinting is
                        // still one shove away
  runAt: 0.82,          // deflection at which the walk becomes a RUN. No run
                        // button exists — shoving the stick is the run button.
  walkTop: 0.706,       // = controller speed/runSpeed (6/8.5). The walk band
                        // tops out exactly where the run band starts, so the
                        // handoff is continuous — no speed step at the seam.
  keyWalk: 0.70,        // digital WASD deflection: a WALK by default (below
                        // runAt), because keyboards have a Shift for the rest
  padDead: 0.22,        // gamepad sticks rest noisier than a touchscreen

  // ── MOVEMENT: input shaping ───────────────────────────────────────────
  // Fractions of run speed per second. IMPORTANT: the sim (gameFeel.js) runs
  // the ONE real momentum model — accel 55, brake 70, drag 68 on ground. This
  // filter therefore only takes the digital edge off the stick; it must be
  // FAST, because two stacked inertia filters is exactly the floaty, sliding,
  // overshooting hero a playtest called "abysmal" (measured: 1.57 m of coast
  // where the tables promised 0.47 m).
  accel: 11,            // 0 -> full in ~90 ms — a shaping ramp, not a mass
  decel: 26,            // full -> 0 in ~38 ms: release means STOP ASKING;
                        // the visible coast is gameFeel's drag, and only its
  airAccel: 2.4,        // mid-air steering is a nudge, not a rethink
  airDecel: 1.6,        // and you keep your momentum across a gap
  turnRate: 14,         // rad/s of heading change at full tilt. gameFeel arcs
                        // the BODY; this only aims the request, so it must
                        // never be the slower of the two (that is how an
                        // optimal-path walk overshoots a portal twice)
  turnBoostStill: 2.4,  // multiplier as speed -> 0: pivoting on the spot is
                        // instant, so nudging a direction never feels laggy
  reverseAngle: 2.36,   // rad (135 deg): past this a flick is a REVERSAL...
  reverseBleed: 0.55,   // ...and speed is cut to this so the hero plants a
                        // foot instead of carving a slow U-turn

  // ── JUMP: forgiveness ─────────────────────────────────────────────────
  coyoteMs: 120,        // you may still jump this long after leaving ground.
                        // Below ~100 ms kids report "it didn't jump".
  bufferMs: 150,        // a jump pressed this long before landing still fires
                        // on touchdown — makes bunny-hopping actually work

  // ── CAMERA ORBIT ──────────────────────────────────────────────────────
  lookScaleX: 0.0023,   // rad per px of drag: a half-screen swipe (~700 px)
                        // is a bit over a quarter turn (700 x 0.0023 = 92°).
                        // The old 0.0062 measured 179° for a 400 px drag —
                        // two casual swipes and a child has no idea which way
                        // they face. THIS NUMBER IS THE "abysmal" FIX.
  lookScaleY: 0.0015,   // pitch is deliberately SLOWER than yaw — vertical
                        // overshoot is what makes players seasick
  lookInvertY: false,   // finger direction == view direction by default
  lookDeadPx: 6,        // px of slop before a tap becomes a drag, so tapping
                        // the ACTION button never jogs the camera
  padLookX: 2.8,        // rad/s at full right-stick deflection
  padLookY: 1.7,
  mouseScaleX: 0.0016,  // pointer-lock mouse look, a touch finer than a thumb
  mouseScaleY: 0.0011,
  pitchMin: -0.35,      // rad BELOW the rig's base elevation: a low, heroic
                        // up-angle at the hero's shoulders
  pitchMax: 0.80,       // rad above: near top-down, for reading a platform gap
  orbitDamp: 12,        // 1/s decay of flick inertia — the coast is a soft
                        // landing (~80 ms), never a spin that keeps going
                        // after the finger has stopped
  orbitFlickMax: 1.2,   // rad/s cap on that coast. Measured on the old 6.0:
                        // up to ~0.9 rad of uncommanded swing per flick — the
                        // camera was "almost never where the player put it"
  recentreDelay: 2.2,   // s of untouched camera before it starts drifting back
                        // behind the hero. Long enough that deliberately
                        // looking sideways while walking is not fought.
  recentreEase: 0.9,    // s to ramp the recentre up to full rate: it arrives
                        // as a drift, never as a yank
  recentreRate: 0.85,   // rad/s max recentre speed while running — an assist,
                        // never an author. A recentre a child can feel fight
                        // their thumb changes what "up on the stick" means
                        // mid-walk, which is the worst bug a camera can have.
  recentrePitch: 1.1,   // 1/s ease of pitch back to the base framing
  zoomMin: 0.62,        // boom multipliers. In tight for a close-up...
  zoomMax: 1.85,        // ...out for "where am I", never far enough to lose
                        // the hero's face
  zoomEase: 0.18,       // per-frame ease toward the pinch target — a pinch is
                        // noisy and an undamped boom pumps
  wheelZoom: 0.0011,    // zoom per wheel delta unit (desktop)

  // ── ON-SCREEN BUTTONS ─────────────────────────────────────────────────
  jumpX: GAME_WIDTH - 190,
  jumpY: GAME_HEIGHT - 210,
  jumpR: 88,            // px: the primary verb gets the biggest target
  actionX: GAME_WIDTH - 380,
  actionY: GAME_HEIGHT - 330,
  actionR: 76,          // up-left of jump, thumb-reachable without covering it
  abilityX: GAME_WIDTH - 380,   // the party verb (SHOVE / LIFT / DROP) —
  abilityY: GAME_HEIGHT - 150,  // below ACTION, left of JUMP, its own colour
  abilityR: 64,
  swapX: 610,           // the party ring: outside the stick capture disc but
  swapY: GAME_HEIGHT - 140,     // still on the movement thumb's side
  swapR: 56,
  diveX: GAME_WIDTH - 570,      // shown ONLY while swimming: hold to go under
  diveY: GAME_HEIGHT - 150,
  diveR: 64,
  buttonPad: 26,        // px of extra no-camera-drag margin around a button,
                        // so a fat-fingered tap never also spins the view
};

// ── PURE: stick conditioning ────────────────────────────────────────────

/**
 * Dead zone, outer saturation and response curve, applied RADIALLY so the
 * conditioned vector keeps its direction exactly. Component-wise dead zones
 * are why cheap sticks snap to the diagonals.
 *
 * @returns {{x:number, y:number, mag:number}} unit-ish vector, mag in [0,1]
 */
export function applyStick(x, y, dead = CONTROLS.stickDead, sat = CONTROLS.stickSat, curve = CONTROLS.stickCurve) {
  const len = Math.hypot(x, y);
  if (!(len > dead)) return { x: 0, y: 0, mag: 0 };
  const span = sat - dead;
  const m01 = span > 1e-6 ? Math.min(1, (len - dead) / span) : 1;
  const mag = curve === 1 ? m01 : Math.pow(m01, curve);
  return { x: (x / len) * mag, y: (y / len) * mag, mag };
}

/**
 * Pick the driving source for this frame: whichever of touch / gamepad /
 * keyboard is pushing hardest. Sources are never summed — a resting gamepad
 * stick must not fight a thumb, and holding W while nudging the pad must not
 * produce a diagonal nobody asked for.
 *
 * @returns {{x:number, y:number, mag:number, digital:boolean}}
 *          x right-positive, y DOWN-positive (screen convention)
 */
export function pickSource(raw, t = CONTROLS) {
  const stick = raw.stick && raw.stick.active
    ? applyStick(raw.stick.x || 0, raw.stick.y || 0, t.stickDead, t.stickSat, t.stickCurve)
    : { x: 0, y: 0, mag: 0 };

  const pad = raw.pad
    ? applyStick(raw.pad.x || 0, raw.pad.y || 0, t.padDead, t.stickSat, t.stickCurve)
    : { x: 0, y: 0, mag: 0 };

  const k = raw.keys || {};
  let kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  let ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  let key = { x: 0, y: 0, mag: 0 };
  if (kx !== 0 || ky !== 0) {
    const l = Math.hypot(kx, ky);
    // Digital keys are a WALK unless Shift is held: a keyboard has no analog
    // middle, so the modifier is the only way to offer both.
    const m = k.run ? 1 : t.keyWalk;
    key = { x: (kx / l) * m, y: (ky / l) * m, mag: m };
  }

  let best = stick;
  let digital = false;
  if (pad.mag > best.mag) { best = pad; digital = false; }
  if (key.mag > best.mag) { best = key; digital = true; }
  if (best === stick) digital = false;

  // A run modifier on pad/keys promotes whatever is being pushed to full.
  const runHeld = !!(k.run || (raw.pad && raw.pad.run));
  if (runHeld && best.mag > 0 && best.mag < 1) {
    const s = 1 / best.mag;
    best = { x: best.x * s, y: best.y * s, mag: 1 };
  }
  return { x: best.x, y: best.y, mag: best.mag, digital };
}

/**
 * Deflection (0..1) -> target speed as a FRACTION OF RUN SPEED.
 *
 * Two bands with a continuous seam. Below `runAt` you are walking and the
 * band tops out at `walkTop` (= walkSpeed/runSpeed), so full-walk is exactly
 * the controller's walk speed. Above `runAt` the same curve keeps climbing to
 * 1.0 = full sprint. Because both bands are expressed in the SAME unit, the
 * acceleration filter downstream never sees a discontinuity at the seam —
 * which is the bug you get from filtering a magnitude that changes meaning.
 */
export function speedFraction(mag, t = CONTROLS) {
  if (mag <= 0) return 0;
  if (mag < t.runAt) return t.walkTop * (mag / t.runAt);
  const over = (mag - t.runAt) / Math.max(1e-6, 1 - t.runAt);
  return t.walkTop + Math.min(1, over) * (1 - t.walkTop);
}

// ── PURE: jump forgiveness ──────────────────────────────────────────────

/**
 * Coyote time + input buffering.
 *
 * `pressedAt` is when the player last asked to jump and has not been served;
 * `groundedAt` is when the feet were last on something. A jump is granted if
 * the ask is fresh (buffer) AND the ground is fresh (coyote). The caller
 * clears BOTH stamps when this returns true — otherwise the still-open coyote
 * window would serve the same press twice and give a free double jump.
 */
export function resolveJump({ now, grounded, pressedAt, groundedAt }, t = CONTROLS) {
  const asked = pressedAt != null && now - pressedAt <= t.bufferMs;
  if (!asked) return false;
  const footing = grounded || (groundedAt != null && now - groundedAt <= t.coyoteMs);
  return footing;
}

// ── PURE: the resolver ──────────────────────────────────────────────────

const _res = {
  moveX: 0, moveZ: 0, run: false, jump: false, action: false,
  camYawDelta: 0, camPitchDelta: 0,
};

/**
 * THE pure input resolution. No hidden state: everything that has to persist
 * between frames (the previous move vector, the jump stamps) is threaded in
 * through `raw`, exactly like controller.step.
 *
 * `moveX`/`moveZ` come out in WORLD space, already rotated by `cameraYaw`, as
 * a fraction of RUN speed. Feed them straight back in as prevMoveX/prevMoveZ
 * next frame; convert to controller.js's scale with toControllerInput().
 *
 * @param {object} raw
 *   stick   {x, y, active}   touch deflection, y DOWN-positive, pre-dead-zone
 *   pad     {x, y, camX, camY, run, jumpPressed, actionPressed}
 *   keys    {left,right,up,down,run,jumpPressed,actionPressed}
 *   look    {dx, dy, mouse}  camera drag/mouse pixels accumulated this frame
 *   dt, now, grounded, pressedAt, groundedAt
 *   prevMoveX, prevMoveZ     last frame's result (world space, frac units)
 *   touchJump, touchAction   on-screen button edges
 * @param {number} cameraYaw   world yaw the camera is looking ALONG (rad)
 * @param {typeof CONTROLS} tuning
 * @param {object} [out]       reused result object; nothing is allocated
 */
export function resolveInput(raw, cameraYaw = 0, tuning = CONTROLS, out = _res) {
  const t = tuning;
  const dt = clamp(raw.dt || 0, 0, 0.05); // a stalled tab must not teleport

  // ── Direction & throttle ────────────────────────────────────────────
  const src = pickSource(raw, t);
  const frac = speedFraction(src.mag, t);

  // Camera-relative: "up" is away from the eye, always. forward = (sin, cos)
  // of the camera yaw, right = (cos, -sin) — the same basis index.js uses to
  // place the boom, so stick-up and camera-forward can never disagree.
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  const fwd = -src.y;            // screen y is down-positive; forward is up
  const rgt = src.x;
  let tx = 0;
  let tz = 0;
  if (frac > 0) {
    const dirX = c * rgt + s * fwd;
    const dirZ = -s * rgt + c * fwd;
    const dl = Math.hypot(dirX, dirZ) || 1;
    tx = (dirX / dl) * frac;
    tz = (dirZ / dl) * frac;
  }

  // ── Mass: accelerate the magnitude, arc the heading ─────────────────
  let px = raw.prevMoveX || 0;
  let pz = raw.prevMoveZ || 0;
  let cm = Math.hypot(px, pz);
  const tm = Math.hypot(tx, tz);
  const airborne = raw.grounded === false;
  const accel = airborne ? t.airAccel : t.accel;
  const decel = airborne ? t.airDecel : t.decel;

  let hx = cm > 1e-5 ? px / cm : 0;
  let hz = cm > 1e-5 ? pz / cm : 0;

  if (tm > 1e-5) {
    const gx = tx / tm;
    const gz = tz / tm;
    if (cm <= 1e-5) {
      // From a standstill the heading is simply taken: a first step must go
      // where the thumb points, not sweep there from an arbitrary old facing.
      hx = gx; hz = gz;
    } else {
      const diff = wrapAngle(Math.atan2(gx, gz) - Math.atan2(hx, hz));
      // Turning is rate-limited, but the limit RELAXES as speed drops, so a
      // standing player pivots instantly and a sprinting one carves.
      const speedN = Math.min(1, cm);
      const rate = t.turnRate * (1 + t.turnBoostStill * (1 - speedN));
      const maxTurn = rate * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      const a = Math.atan2(hx, hz) + turn;
      hx = Math.sin(a); hz = Math.cos(a);
      // A hard reversal bleeds speed: the hero plants and re-launches instead
      // of skating a wide arc through a wall.
      if (Math.abs(diff) > t.reverseAngle && !airborne) cm *= t.reverseBleed;
    }
    cm = tm > cm ? Math.min(tm, cm + accel * dt) : Math.max(tm, cm - decel * dt);
  } else {
    cm = Math.max(0, cm - decel * dt);
  }

  if (cm < 1e-4) { cm = 0; hx = 0; hz = 0; }
  out.moveX = hx * cm;
  out.moveZ = hz * cm;
  out.run = cm > t.walkTop + 1e-4;

  // ── Jump ────────────────────────────────────────────────────────────
  out.jump = resolveJump(raw, t);

  // ── Action ──────────────────────────────────────────────────────────
  out.action = !!(raw.touchAction
    || (raw.keys && raw.keys.actionPressed)
    || (raw.pad && raw.pad.actionPressed));

  // ── Camera ──────────────────────────────────────────────────────────
  const look = raw.look || {};
  const sx = look.mouse ? t.mouseScaleX : t.lookScaleX;
  const sy = look.mouse ? t.mouseScaleY : t.lookScaleY;
  const padX = raw.pad ? raw.pad.camX || 0 : 0;
  const padY = raw.pad ? raw.pad.camY || 0 : 0;
  const padC = applyStick(padX, padY, t.padDead, t.stickSat, t.stickCurve);
  out.camYawDelta = (look.dx || 0) * sx + padC.x * t.padLookX * dt;
  out.camPitchDelta = ((look.dy || 0) * sy + padC.y * t.padLookY * dt)
    * (t.lookInvertY ? -1 : 1);
  return out;
}

/**
 * Convert a resolved move (fraction of RUN speed) into controller.js's input
 * scale, where the magnitude is a fraction of whichever speed `run` selects.
 * Split out and pure so the seam between the two scales is testable — this is
 * exactly where a silent 40% speed error would otherwise hide.
 */
export function toControllerInput(res, out = { x: 0, z: 0, run: false }, t = CONTROLS) {
  const m = Math.hypot(res.moveX, res.moveZ);
  if (m < 1e-6) { out.x = 0; out.z = 0; out.run = false; return out; }
  const scale = res.run ? 1 : Math.min(1, m / t.walkTop) / m;
  out.x = res.moveX * scale;
  out.z = res.moveZ * scale;
  out.run = res.run;
  return out;
}

// ── PURE: camera orbit ──────────────────────────────────────────────────

/** Fresh orbit state parked directly behind a hero facing `yaw`. */
export function createOrbitState(yaw = 0) {
  return { yaw, pitch: 0, zoom: 1, zoomWant: 1, yawVel: 0, pitchVel: 0, idle: 99 };
}

/**
 * Integrate the orbit one frame. Pure: writes into `out` (may be `state`).
 *
 * @param {ReturnType<createOrbitState>} state
 * @param {object} drive
 *   yawDelta, pitchDelta  radians requested this frame
 *   zoomWant              absolute boom multiplier target (pinch/wheel)
 *   touched               a finger/mouse is currently driving the camera
 *   moveN                 0..1 how fast the hero is moving (gates recentre)
 *   playerYaw             the hero's facing — where "behind" is
 * @param {number} dt
 */
export function stepOrbit(state, drive, dt, t = CONTROLS, out = state) {
  const d = clamp(dt || 0, 0, 0.05);
  let yaw = state.yaw;
  let pitch = state.pitch;
  let yawVel = state.yawVel;
  let pitchVel = state.pitchVel;
  let idle = state.idle;

  if (drive.touched) {
    yaw = wrapAngle(yaw + (drive.yawDelta || 0));
    pitch += drive.pitchDelta || 0;
    // Remember the release velocity so a flick coasts. Capped: a 200 ms hitch
    // turns a 1 cm drag into a 50 rad/s spin without this.
    if (d > 1e-4) {
      yawVel = clamp((drive.yawDelta || 0) / d, -t.orbitFlickMax, t.orbitFlickMax);
      pitchVel = clamp((drive.pitchDelta || 0) / d, -t.orbitFlickMax, t.orbitFlickMax);
    }
    idle = 0;
  } else {
    // Coast, then decay. Exponential so the stop is asymptotic, never a wall.
    yaw = wrapAngle(yaw + yawVel * d);
    pitch += pitchVel * d;
    const k = Math.exp(-t.orbitDamp * d);
    yawVel *= k;
    pitchVel *= k;
    if (Math.abs(yawVel) < 0.02) yawVel = 0;
    if (Math.abs(pitchVel) < 0.02) pitchVel = 0;
    idle += d;

    // Slow auto-recentre behind the hero — ONLY while actually moving, only
    // after the delay, and only once the flick has died. Recentring a still
    // camera would fight a player who deliberately parked it sideways.
    const moveN = clamp(drive.moveN || 0, 0, 1);
    if (moveN > 0.05 && idle > t.recentreDelay && yawVel === 0) {
      const ramp = Math.min(1, (idle - t.recentreDelay) / t.recentreEase);
      const diff = wrapAngle((drive.playerYaw || 0) - yaw);
      const step = Math.min(Math.abs(diff), t.recentreRate * moveN * ramp * d);
      yaw = wrapAngle(yaw + (diff < 0 ? -step : step));
      pitch += (0 - pitch) * Math.min(1, t.recentrePitch * ramp * d);
    }
  }

  // Pitch is HARD clamped, and hitting the clamp kills the inertia — a
  // coasting camera that grinds against the ceiling looks broken.
  const cp = clamp(pitch, t.pitchMin, t.pitchMax);
  if (cp !== pitch) pitchVel = 0;

  const want = clamp(drive.zoomWant != null ? drive.zoomWant : state.zoomWant, t.zoomMin, t.zoomMax);
  const zoom = state.zoom + (want - state.zoom) * t.zoomEase;

  out.yaw = yaw;
  out.pitch = cp;
  out.yawVel = yawVel;
  out.pitchVel = pitchVel;
  out.idle = idle;
  out.zoomWant = want;
  out.zoom = zoom;
  return out;
}

// ── PURE: the context action label ──────────────────────────────────────

/**
 * What the one context button says right now. The label IS the tutorial for a
 * five-year-old: they never learn "the E key", they learn "press the word".
 * Order matters — a portal you are standing in beats a chest beside it.
 */
export function actionLabel(near) {
  if (!near) return null;
  const kind = typeof near === 'string' ? near : (near.kind || near.type || '');
  switch (kind) {
    case 'portal':
    case 'exit':
      return 'ENTER';
    case 'hero':
    case 'npc':
    case 'fountain':
    case 'seqmark':
      return 'TALK';
    case '':
      return null;
    default:
      // Everything else you physically open or take: chest, gearkit, gold,
      // potion, golden, mathdoor, zerodoor, challenge pickups.
      return 'OPEN';
  }
}

// ── PURE: gamepad ───────────────────────────────────────────────────────

const PAD_OUT = {
  x: 0, y: 0, camX: 0, camY: 0, run: false, jumpPressed: false, actionPressed: false,
  jumpDown: false, dive: false, abilityPressed: false, abilityDown: false, swapPressed: false,
};

/**
 * Standard-mapping gamepad -> the `pad` fragment resolveInput wants.
 * `prev` is the previous frame's button-pressed array so A/X come through as
 * EDGES (a held A must not fire a jump every frame).
 */
export function readGamepad(pad, prev = null, out = PAD_OUT) {
  out.x = 0; out.y = 0; out.camX = 0; out.camY = 0;
  out.run = false; out.jumpPressed = false; out.actionPressed = false;
  out.jumpDown = false; out.dive = false;
  out.abilityPressed = false; out.abilityDown = false; out.swapPressed = false;
  if (!pad) return out;
  const ax = pad.axes || [];
  const b = pad.buttons || [];
  const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
  const edge = (i) => down(i) && !(prev && prev[i]);

  out.x = ax[0] || 0;
  out.y = ax[1] || 0;
  out.camX = ax[2] || 0;
  out.camY = ax[3] || 0;
  // D-pad folds into the left stick as full deflection.
  if (down(14)) out.x -= 1;
  if (down(15)) out.x += 1;
  if (down(12)) out.y -= 1;
  if (down(13)) out.y += 1;
  out.run = down(5) || down(7) || down(10);   // R-shoulder / R-trigger / L3
  out.jumpPressed = edge(0);                   // A
  // HELD A is variable jump height; HELD B is "go under" while swimming. Both
  // are levels, not edges — see the touch pad's jumpDown for the same reason.
  out.jumpDown = down(0);
  out.dive = down(1);                          // B
  out.actionPressed = edge(3) || edge(1);      // Y or a tapped B
  // X is the party verb (BINDINGS in abilities.js: ability = pad 2), both as
  // an edge (a SHOVE) and a level (LEVITATE is a hold). LB cycles the ring.
  out.abilityPressed = edge(2);
  out.abilityDown = down(2);
  out.swapPressed = edge(4);
  return out;
}

/** Snapshot a gamepad's button-down bits for next frame's edge test. */
export function padButtonBits(pad, out = []) {
  out.length = 0;
  const b = (pad && pad.buttons) || [];
  for (let i = 0; i < b.length; i++) out.push(!!(b[i] && (b[i].pressed || b[i].value > 0.5)));
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// IMPURE: Phaser widgets. Duck-typed on `scene` (add / input / tweens), so a
// test double is a plain object. Nothing below is imported by a pure test.
// ══════════════════════════════════════════════════════════════════════════

const DEPTH_PAD = 90;
const DEPTH_KNOB = 91;
const DEPTH_LABEL = 92;

/**
 * The left stick, the jump button and the context action button.
 *
 * The base is FIXED (see the file header). Capture is a radius test around
 * that fixed base, not a "left half of screen" rectangle, so the jump thumb
 * can never accidentally become the movement thumb.
 */
export function createTouchControls(scene, { tuning = CONTROLS, onJump, onAction } = {}) {
  const t = tuning;
  // Four simultaneous touches: move, look, jump, action. Phaser ships with
  // one, which is why the old build could not walk and jump at the same time.
  scene.input?.addPointer?.(3);

  const ring = scene.add.circle(t.stickX, t.stickY, t.stickRadius, PAPER.inkTeal, 0.26)
    .setStrokeStyle(5, PAPER.cream, 0.55).setDepth(DEPTH_PAD).setScrollFactor(0);
  // Teal-tinted shadow under the knob — never black, never grey.
  const knobShadow = scene.add.circle(t.stickX + 5, t.stickY + 9, t.stickKnob, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const knob = scene.add.circle(t.stickX, t.stickY, t.stickKnob, PAPER.cream, 0.88)
    .setStrokeStyle(4, PAPER.teal, 0.7).setDepth(DEPTH_KNOB).setScrollFactor(0);

  const state = { x: 0, y: 0, active: false, id: null };
  let knobX = t.stickX;
  let knobY = t.stickY;
  // Where the CURRENT grab is measured from. The fixed base for a capture-disc
  // grab; the touch point itself for a left-half grab outside the disc (the
  // "floating guest" — see stickFloatMinY). Reset to the base on release.
  let originX = t.stickX;
  let originY = t.stickY;

  const jumpShadow = scene.add.circle(t.jumpX + 6, t.jumpY + 10, t.jumpR, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const jumpBg = scene.add.circle(t.jumpX, t.jumpY, t.jumpR, PAPER.gold, 0.94)
    .setStrokeStyle(5, PAPER.cream, 0.75).setDepth(DEPTH_KNOB).setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  const jumpText = scene.add.text(t.jumpX, t.jumpY, 'JUMP', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '28px', color: '#3a2410',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);

  const actShadow = scene.add.circle(t.actionX + 6, t.actionY + 10, t.actionR, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const actBg = scene.add.circle(t.actionX, t.actionY, t.actionR, PAPER.coral, 0.94)
    .setStrokeStyle(5, PAPER.cream, 0.75).setDepth(DEPTH_KNOB).setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  const actText = scene.add.text(t.actionX, t.actionY, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '24px', color: '#fff6e6',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);
  const actParts = [actShadow, actBg, actText];
  let actionVisible = false;
  const setActionVisible = (v) => {
    if (v === actionVisible) return;
    actionVisible = v;
    actParts.forEach((o) => o.setVisible(v));
    if (v) actBg.setInteractive({ useHandCursor: true });
    else actBg.disableInteractive();
  };
  actParts.forEach((o) => o.setVisible(false));
  actBg.disableInteractive();

  // ── ABILITY: the party verb (SHOVE / LIFT / DROP) ─────────────────────
  // Hidden until the scene feeds a chip (setAbilityChip) — a button with no
  // verb behind it teaches a child that buttons lie.
  const abShadow = scene.add.circle(t.abilityX + 5, t.abilityY + 9, t.abilityR, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const abBg = scene.add.circle(t.abilityX, t.abilityY, t.abilityR, PAPER.teal, 0.94)
    .setStrokeStyle(5, PAPER.cream, 0.75).setDepth(DEPTH_KNOB).setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  const abText = scene.add.text(t.abilityX, t.abilityY, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '22px', color: '#fff6e6',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);
  const abParts = [abShadow, abBg, abText];
  let abilityVisible = false;
  const setAbilityVisible = (v) => {
    if (v === abilityVisible) return;
    abilityVisible = v;
    abParts.forEach((o) => o.setVisible(v));
    if (v) abBg.setInteractive({ useHandCursor: true });
    else abBg.disableInteractive();
  };
  abParts.forEach((o) => o.setVisible(false));
  abBg.disableInteractive();

  // ── SWAP: the party ring chip ─────────────────────────────────────────
  // Shows the ACTIVE hero's initial with pips for the rest of the party.
  // Hidden until the scene feeds chips (a party of one has nothing to swap).
  const swShadow = scene.add.circle(t.swapX + 4, t.swapY + 8, t.swapR, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const swBg = scene.add.circle(t.swapX, t.swapY, t.swapR, PAPER.cream, 0.92)
    .setStrokeStyle(4, PAPER.teal, 0.8).setDepth(DEPTH_KNOB).setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  const swText = scene.add.text(t.swapX, t.swapY - 6, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '30px', color: '#1d5f63',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);
  const swLabel = scene.add.text(t.swapX, t.swapY + 26, 'SWAP', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '14px', color: '#1d5f63',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);
  /** One pip per party member, lit for the active slot. */
  const swPips = [0, 1, 2].map((i) => scene.add.circle(
    t.swapX - 22 + i * 22, t.swapY - t.swapR - 16, 7, PAPER.teal, 0.4,
  ).setDepth(DEPTH_LABEL).setScrollFactor(0));
  const swParts = [swShadow, swBg, swText, swLabel, ...swPips];
  let swapVisible = false;
  const setSwapVisible = (v) => {
    if (v === swapVisible) return;
    swapVisible = v;
    swParts.forEach((o) => o.setVisible(v));
    if (v) swBg.setInteractive({ useHandCursor: true });
    else swBg.disableInteractive();
  };
  swParts.forEach((o) => o.setVisible(false));
  swBg.disableInteractive();

  // ── DIVE: shown only while swimming — HOLD to go under ────────────────
  const dvShadow = scene.add.circle(t.diveX + 5, t.diveY + 9, t.diveR, PAPER.shadow, 0.30)
    .setDepth(DEPTH_PAD).setScrollFactor(0);
  const dvBg = scene.add.circle(t.diveX, t.diveY, t.diveR, PAPER.inkTeal, 0.94)
    .setStrokeStyle(5, PAPER.cream, 0.75).setDepth(DEPTH_KNOB).setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  const dvText = scene.add.text(t.diveX, t.diveY, 'DIVE', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '22px', color: '#fff6e6',
  }).setOrigin(0.5).setDepth(DEPTH_LABEL).setScrollFactor(0);
  const dvParts = [dvShadow, dvBg, dvText];
  let diveVisible = false;
  const setDiveVisible = (v) => {
    if (v === diveVisible) return;
    diveVisible = v;
    dvParts.forEach((o) => o.setVisible(v));
    if (v) dvBg.setInteractive({ useHandCursor: true });
    else { dvBg.disableInteractive(); diveDown = false; }
  };
  dvParts.forEach((o) => o.setVisible(false));
  dvBg.disableInteractive();

  let jumpEdge = false;
  let jumpDown = false;
  let actionEdge = false;
  let abilityEdge = false;
  let abilityDown = false;
  let swapEdge = false;
  let diveDown = false;
  jumpBg.on('pointerdown', () => { jumpEdge = true; jumpDown = true; onJump?.(); });
  // HELD, not just pressed. gameFeel.js cuts a jump short the moment the button
  // comes up — that is the whole of variable jump height — so the touch pad has
  // to report a sustained press and not only its leading edge. `pointerout`
  // matters as much as `pointerup`: a thumb that slides off the disc has let go
  // as far as the player is concerned.
  for (const ev of ['pointerup', 'pointerout', 'pointerupoutside']) {
    jumpBg.on(ev, () => { jumpDown = false; });
  }
  actBg.on('pointerdown', () => { actionEdge = true; onAction?.(); });
  abBg.on('pointerdown', () => { abilityEdge = true; abilityDown = true; });
  for (const ev of ['pointerup', 'pointerout', 'pointerupoutside']) {
    abBg.on(ev, () => { abilityDown = false; });
  }
  swBg.on('pointerdown', () => { swapEdge = true; });
  dvBg.on('pointerdown', () => { diveDown = true; });
  for (const ev of ['pointerup', 'pointerout', 'pointerupoutside']) {
    dvBg.on(ev, () => { diveDown = false; });
  }

  /** Is this pointer inside the stick's (generous) capture disc? */
  const inCapture = (p) => Math.hypot(p.x - t.stickX, p.y - t.stickY) <= t.stickCapture;
  /**
   * A left-half touch that missed the disc but is clearly a movement ask —
   * below the HUD chips, left of the look surface. It gets a floating origin
   * under the finger, so no part of the left half is ever a dead zone.
   */
  const inFloatZone = (p) => p.x < GAME_WIDTH * 0.5 && p.y > t.stickFloatMinY;

  const setFromPointer = (p) => {
    const dx = p.x - originX;
    const dy = p.y - originY;
    const len = Math.hypot(dx, dy);
    const capped = Math.min(len, t.stickRadius);
    const nx = len > 1e-4 ? dx / len : 0;
    const ny = len > 1e-4 ? dy / len : 0;
    knobX = originX + nx * capped;
    knobY = originY + ny * capped;
    state.x = nx * (capped / t.stickRadius);
    state.y = ny * (capped / t.stickRadius);
  };

  const onDown = (p) => {
    if (state.active) return;
    // Never steal a press that landed on a button.
    if (Math.hypot(p.x - t.jumpX, p.y - t.jumpY) <= t.jumpR) return;
    if (actionVisible && Math.hypot(p.x - t.actionX, p.y - t.actionY) <= t.actionR) return;
    if (abilityVisible && Math.hypot(p.x - t.abilityX, p.y - t.abilityY) <= t.abilityR) return;
    if (swapVisible && Math.hypot(p.x - t.swapX, p.y - t.swapY) <= t.swapR) return;
    if (diveVisible && Math.hypot(p.x - t.diveX, p.y - t.diveY) <= t.diveR) return;
    const captured = inCapture(p);
    if (!captured && !inFloatZone(p)) return;
    if (captured) {
      originX = t.stickX;
      originY = t.stickY;
    } else {
      // Floating grab: the ring travels to the finger so the child SEES the
      // stick they are holding, and travels home again on release.
      originX = p.x;
      originY = p.y;
    }
    ring.setPosition(originX, originY);
    state.active = true;
    state.id = p.id;
    setFromPointer(p);
  };
  const onMove = (p) => { if (state.active && p.id === state.id) setFromPointer(p); };
  const onUp = (p) => {
    if (!state.active || (p && p.id !== state.id)) return;
    state.active = false;
    state.id = null;
    state.x = 0;
    state.y = 0;
    originX = t.stickX;
    originY = t.stickY;
    ring.setPosition(t.stickX, t.stickY);
  };

  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);

  return {
    state,
    /** True once per press, then cleared — the caller owns the edge. */
    consumeJump() { const v = jumpEdge; jumpEdge = false; return v; },
    /** Is the JUMP pad still held? Drives variable jump height. */
    get jumpDown() { return jumpDown; },
    consumeAction() { const v = actionEdge; actionEdge = false; return v; },
    consumeAbility() { const v = abilityEdge; abilityEdge = false; return v; },
    /** Is the ABILITY chip still held? LEVITATE is a hold, not a tap. */
    get abilityDown() { return abilityDown; },
    consumeSwap() { const v = swapEdge; swapEdge = false; return v; },
    /** Is the DIVE pad held? Releasing floats a swimmer straight back up. */
    get diveDown() { return diveDown; },
    /** null hides the button; any string shows it. */
    setActionLabel(label) {
      if (!label) { setActionVisible(false); return; }
      if (actText.text !== label) actText.setText(label);
      setActionVisible(true);
    },
    /**
     * The party verb chip. null hides it (no verb on the active hero); a chip
     * ({verb, tint, enabled}) shows it, at its ability's tint, dimmed while it
     * cannot fire — a lying button teaches a child to stop pressing buttons.
     */
    setAbilityChip(chip) {
      if (!chip || !chip.verb) { setAbilityVisible(false); return; }
      if (abText.text !== chip.verb) abText.setText(chip.verb);
      if (Number.isFinite(chip.tint)) abBg.fillColor = chip.tint;
      const a = chip.enabled === false ? 0.45 : 0.94;
      if (abBg.fillAlpha !== a) abBg.setFillStyle(abBg.fillColor, a);
      setAbilityVisible(true);
    },
    /**
     * The party ring. `chips` is abilities.chips() — [{name, active, ...}].
     * Hidden for a party of 0 or 1: there is nothing to swap to.
     */
    setPartyChips(chips) {
      if (!chips || chips.length < 2) { setSwapVisible(false); return; }
      const act = chips.find((c) => c.active) || chips[0];
      const initial = (act.name || act.id || '?').charAt(0).toUpperCase();
      if (swText.text !== initial) swText.setText(initial);
      for (let i = 0; i < swPips.length; i++) {
        const on = i < chips.length;
        swPips[i].setVisible(on && swapVisible);
        if (on) swPips[i].setFillStyle(PAPER.teal, chips[i].active ? 0.95 : 0.35);
      }
      setSwapVisible(true);
      // setSwapVisible flips every part including pips beyond the party size.
      for (let i = chips.length; i < swPips.length; i++) swPips[i].setVisible(false);
    },
    /** Swimming? The DIVE pad exists only while it means something. */
    setDiveVisible(v) { setDiveVisible(!!v); },
    /** Ease the knob home on release. Called every frame by poll(). */
    update() {
      if (!state.active) {
        knobX += (t.stickX - knobX) * t.stickHomeEase;
        knobY += (t.stickY - knobY) * t.stickHomeEase;
      }
      knob.setPosition(knobX, knobY);
      knobShadow.setPosition(knobX + 5, knobY + 9);
    },
    setVisible(v) {
      [ring, knobShadow, knob, jumpShadow, jumpBg, jumpText].forEach((o) => o.setVisible(v));
      if (!v) {
        setActionVisible(false);
        setAbilityVisible(false);
        setSwapVisible(false);
        setDiveVisible(false);
      }
    },
    destroy() {
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('pointerupoutside', onUp);
      [ring, knobShadow, knob, jumpShadow, jumpBg, jumpText,
        ...actParts, ...abParts, ...swParts, ...dvParts].forEach((o) => o.destroy());
    },
  };
}

/**
 * Right-half camera orbit by drag, plus pinch-to-zoom the boom.
 *
 * Accumulates PIXELS between polls rather than reacting per event, so the
 * orbit rate is frame-rate independent and a burst of coalesced pointermove
 * events cannot spin the world.
 */
export function createLookInput(scene, { tuning = CONTROLS, minX = GAME_WIDTH * 0.5 } = {}) {
  const t = tuning;
  scene.input?.addPointer?.(3);

  /** Pointer id -> last {x,y}. Two at once means pinch. */
  const touches = new Map();
  const acc = { dx: 0, dy: 0, mouse: false };
  let touched = false;
  let zoomWant = 1;
  let pinchBase = 0;      // finger distance when the pinch started
  let pinchZoom0 = 1;     // zoom at that moment

  const owned = (p) => {
    if (p.x < minX) return false;
    // Buttons keep their own margin — a tap on JUMP must not also pan.
    if (Math.hypot(p.x - t.jumpX, p.y - t.jumpY) <= t.jumpR + t.buttonPad) return false;
    if (Math.hypot(p.x - t.actionX, p.y - t.actionY) <= t.actionR + t.buttonPad) return false;
    if (Math.hypot(p.x - t.abilityX, p.y - t.abilityY) <= t.abilityR + t.buttonPad) return false;
    if (Math.hypot(p.x - t.diveX, p.y - t.diveY) <= t.diveR + t.buttonPad) return false;
    return true;
  };

  const pinchDist = () => {
    const it = touches.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onDown = (p) => {
    if (!owned(p)) return;
    touches.set(p.id, { x: p.x, y: p.y, moved: 0 });
    touched = true;
    if (touches.size === 2) { pinchBase = pinchDist(); pinchZoom0 = zoomWant; }
  };
  const onMove = (p) => {
    const prev = touches.get(p.id);
    if (!prev) return;
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    prev.x = p.x; prev.y = p.y;
    prev.moved += Math.hypot(dx, dy);
    if (touches.size >= 2) {
      // Two fingers = zoom only. Orbiting during a pinch is how you end up
      // looking at the sky every time a child spreads their fingers.
      const d = pinchDist();
      if (pinchBase > 10 && d > 10) zoomWant = clamp(pinchZoom0 * (pinchBase / d), t.zoomMin, t.zoomMax);
      return;
    }
    // A tap wobbles. Ignore the first few pixels so taps never jog the view.
    if (prev.moved < t.lookDeadPx) return;
    acc.dx += dx;
    acc.dy += dy;
    acc.mouse = false;
  };
  const onUp = (p) => {
    if (!touches.delete(p.id)) return;
    if (touches.size < 2) pinchBase = 0;
    if (touches.size === 0) touched = false;
  };
  const onWheel = (_p, _o, _dx, dy) => { zoomWant = clamp(zoomWant + dy * t.wheelZoom, t.zoomMin, t.zoomMax); };

  // Desktop mouse-look: hold the right button anywhere, or drag the right
  // half. movementX/Y is used when it exists so pointer-lock works too.
  const onDomMove = (e) => {
    if (!touched || touches.size !== 1) return;
    if (typeof e.movementX !== 'number' || !document.pointerLockElement) return;
    acc.dx += e.movementX;
    acc.dy += e.movementY;
    acc.mouse = true;
  };
  if (typeof document !== 'undefined') document.addEventListener('mousemove', onDomMove);

  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);
  scene.input.on('wheel', onWheel);

  const frag = { dx: 0, dy: 0, mouse: false };
  return {
    /** Pixels since the last poll, then reset. Never allocates. */
    consume() {
      frag.dx = acc.dx; frag.dy = acc.dy; frag.mouse = acc.mouse;
      acc.dx = 0; acc.dy = 0;
      return frag;
    },
    get touched() { return touched; },
    get zoomWant() { return zoomWant; },
    setZoom(v) { zoomWant = clamp(v, t.zoomMin, t.zoomMax); },
    /** Drop every tracked finger (a modal opened, the scene paused). */
    reset() { touches.clear(); touched = false; acc.dx = 0; acc.dy = 0; },
    destroy() {
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('pointerupoutside', onUp);
      scene.input.off('wheel', onWheel);
      if (typeof document !== 'undefined') document.removeEventListener('mousemove', onDomMove);
      touches.clear();
    },
  };
}

/**
 * Everything together: touch widgets + keyboard + gamepad + orbit, behind a
 * single poll(). This is what OverworldScene holds.
 *
 * poll() returns the SAME object every frame (zero allocation):
 *   { x, z, run, jump, action, yaw, pitch, zoom }
 * where x/z are already in controller.js's input scale.
 */
export function createControls3D(scene, { tuning = CONTROLS, startYaw = 0 } = {}) {
  const t = tuning;
  const touch = createTouchControls(scene, { tuning: t });
  const look = createLookInput(scene, { tuning: t });

  const kb = scene.input?.keyboard;
  // C/CTRL dive (HELD), F/X ability, Q swap-next, ONE..THREE direct slots.
  // E and ENTER stay ACTION, SHIFT stays RUN — the BINDINGS table in
  // abilities.js matches this list; keep the two in agreement.
  const keyDefs = kb
    ? kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT,E,ENTER,C,CTRL,F,X,Q,ONE,TWO,THREE')
    : null;
  const keys = {
    left: false, right: false, up: false, down: false, run: false,
    jumpPressed: false, actionPressed: false, jumpDown: false, dive: false,
    abilityPressed: false, abilityDown: false, swapPressed: false, swapSlot: null,
  };

  /**
   * EDGE keys (jump/action/ability/swap/slots) are captured off the RAW DOM
   * keydown, not by diffing `key.isDown` between two poll()s.
   *
   * Why: Phaser's `Key.onUp()` unconditionally zeroes `_justDown` the instant
   * the key comes up — see node_modules/phaser/.../Key.js — so BOTH the naive
   * "isDown && !prevIsDown" idiom this file used to use AND Phaser's own
   * `JustDown()` helper lose a press outright if the keydown+keyup pair lands
   * between two polls. That is not a corner case here: this scene targets a
   * three.js + shadows + Rapier + Phaser stack under SwiftShader/an iPad,
   * where a single frame can run 150-500 ms (D1-B), and a keyboard test rig
   * or an impatient player's tap easily fits inside one gap. MEASURED on the
   * build: `page.keyboard.press('e')`, and even an explicit 200 ms HOLD, at
   * a portal's ENTER prompt produced zero response — `_justDown` was set by
   * the keydown, then wiped by the keyup before any poll() ever read it,
   * even though `_nearPortal` and every "unlocked" gate were correct. The
   * fix: a `keydown-<CODE>` listener (fired once per real press — the
   * plugin itself suppresses OS auto-repeat via its own `key.isDown` check)
   * flips a flag with no per-frame window to fall through; poll() drains it
   * whenever it next runs, however late.
   */
  let kbJumpEdge = false;
  let kbActionEdge = false;
  let kbAbilityEdge = false;
  let kbSwapEdge = false;
  let kbSwapSlot = null;
  const onKbJump = () => { kbJumpEdge = true; };
  const onKbAction = () => { kbActionEdge = true; };
  const onKbAbility = () => { kbAbilityEdge = true; };
  const onKbSwap = () => { kbSwapEdge = true; };
  const onKbSlot0 = () => { kbSwapSlot = 0; };
  const onKbSlot1 = () => { kbSwapSlot = 1; };
  const onKbSlot2 = () => { kbSwapSlot = 2; };
  if (kb) {
    kb.on('keydown-SPACE', onKbJump);
    kb.on('keydown-E', onKbAction);
    kb.on('keydown-ENTER', onKbAction);
    kb.on('keydown-F', onKbAbility);
    kb.on('keydown-X', onKbAbility);
    kb.on('keydown-Q', onKbSwap);
    kb.on('keydown-ONE', onKbSlot0);
    kb.on('keydown-TWO', onKbSlot1);
    kb.on('keydown-THREE', onKbSlot2);
  }

  let padBits = [];
  const padFrag = {
    x: 0, y: 0, camX: 0, camY: 0, run: false,
    jumpPressed: false, actionPressed: false, jumpDown: false, dive: false,
    abilityPressed: false, abilityDown: false, swapPressed: false,
  };

  const orbit = createOrbitState(startYaw);
  const raw = {
    stick: touch.state,
    pad: padFrag,
    keys,
    look: null,
    dt: 0, now: 0, grounded: true,
    pressedAt: null, groundedAt: null,
    prevMoveX: 0, prevMoveZ: 0,
    touchAction: false,
  };
  const res = { moveX: 0, moveZ: 0, run: false, jump: false, action: false, camYawDelta: 0, camPitchDelta: 0 };
  const drive = { yawDelta: 0, pitchDelta: 0, zoomWant: 1, touched: false, moveN: 0, playerYaw: 0 };
  /** The look pixels for ONE substep — frag/n, rewritten each poll. */
  const _subLook = { dx: 0, dy: 0, mouse: false };
  const ctrl = { x: 0, z: 0, run: false };
  const outFrame = {
    x: 0, z: 0, run: false, jump: false, action: false, yaw: 0, pitch: 0, zoom: 1,
    // Two LEVELS alongside the edges above. `jumpHeld` is what makes a jump
    // variable-height (gameFeel.js cuts the rise the frame it goes false);
    // `dive` is what takes a swimmer under (traversal.js). Both are false in
    // every locked frame, exactly like the stick.
    jumpHeld: false, dive: false,
    // The party verbs, as edge + level + swap ask — the scene forwards these
    // to the ability runtime (app.pressAbility / releaseAbility / swapHero).
    abilityPressed: false, abilityHeld: false, swapPressed: false, swapSlot: null,
  };

  const down = (k) => !!(k && k.isDown);

  /**
   * @param {object} ctx
   *   dt, now      seconds / ms
   *   grounded     hero feet state (coyote time)
   *   playerYaw    hero facing (auto-recentre target)
   *   moveN        0..1 hero speed (gates auto-recentre)
   *   locked       a modal owns the screen: neutralise everything
   *   actionKind   proximity kind for the button label, or null
   */
  function poll(ctx) {
    const now = ctx.now;
    const dt = ctx.dt;

    // ── Keyboard ────────────────────────────────────────────────────
    const k = keyDefs;
    keys.left = down(k?.A) || down(k?.LEFT);
    keys.right = down(k?.D) || down(k?.RIGHT);
    keys.up = down(k?.W) || down(k?.UP);
    keys.down = down(k?.S) || down(k?.DOWN);
    keys.run = down(k?.SHIFT);
    // LEVELS (held state) are fine sampled per frame — a hold spans many
    // polls by definition. EDGES (jump/action/ability/swap/slot) come off
    // the robust keydown-* flags above, not an isDown diff — see the big
    // comment where those listeners are installed.
    keys.jumpDown = down(k?.SPACE);
    // C or CTRL takes a swimmer under. Held, not tapped: releasing floats you
    // straight back up, which is the only dive control a five-year-old can be
    // trusted with. (Both keys ARE registered above — a read of a key addKeys
    // never registered is how dive shipped dead the first time.)
    keys.dive = down(k?.C) || down(k?.CTRL);
    keys.jumpPressed = kbJumpEdge; kbJumpEdge = false;
    keys.actionPressed = kbActionEdge; kbActionEdge = false;
    // F (or X, for the platformer hands) is the party verb; Q cycles the ring;
    // 1/2/3 pick a slot directly. E/Shift were NOT used for the ability on
    // purpose — they already mean ACTION and RUN here.
    keys.abilityDown = down(k?.F) || down(k?.X);
    keys.abilityPressed = kbAbilityEdge; kbAbilityEdge = false;
    keys.swapPressed = kbSwapEdge; kbSwapEdge = false;
    keys.swapSlot = kbSwapSlot; kbSwapSlot = null;

    // ── Gamepad ─────────────────────────────────────────────────────
    let pad = null;
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const list = navigator.getGamepads();
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { pad = list[i]; break; }
    }
    readGamepad(pad, padBits, padFrag);
    padBits = padButtonBits(pad, padBits);

    // ── Assemble ────────────────────────────────────────────────────
    const jumpEdge = touch.consumeJump() || keys.jumpPressed || padFrag.jumpPressed;
    const actionEdge = touch.consumeAction();
    const abilityEdge = touch.consumeAbility() || keys.abilityPressed || padFrag.abilityPressed;
    const swapEdge = touch.consumeSwap() || keys.swapPressed || padFrag.swapPressed;
    if (jumpEdge) raw.pressedAt = now;
    if (ctx.grounded) raw.groundedAt = now;

    const frag = look.consume();
    raw.now = now;
    raw.grounded = ctx.grounded;

    if (ctx.locked) {
      // A modal is up: no movement, no jump, no orbit. The knob still eases
      // home so the widget does not freeze mid-throw behind the dialogue.
      raw.prevMoveX = 0; raw.prevMoveZ = 0;
      raw.pressedAt = null;
      look.reset();
      touch.update();
      touch.setActionLabel(null);
      touch.setDiveVisible(false);
      outFrame.x = 0; outFrame.z = 0; outFrame.run = false;
      outFrame.jump = false; outFrame.action = false;
      outFrame.jumpHeld = false; outFrame.dive = false;
      outFrame.abilityPressed = false; outFrame.abilityHeld = false;
      outFrame.swapPressed = false; outFrame.swapSlot = null;
      outFrame.yaw = orbit.yaw; outFrame.pitch = orbit.pitch; outFrame.zoom = orbit.zoom;
      return outFrame;
    }

    // ── Integrate, in fixed-size SUBSTEPS ───────────────────────────
    // The accel/turn filter and the orbit inertia/recentre integrate on the
    // PHASER frame's dt. On a device running below 20 fps a single clamped
    // step under-integrates all of them — the measured "controls get mushier
    // as the device gets slower" (D1-B). Splitting the frame into <=33 ms
    // slices makes the integration identical at 20 fps and at 120 fps; at a
    // healthy 60 fps n is 1 and nothing changes.
    const n = Math.max(1, Math.min(8, Math.ceil((dt || 0) / (1 / 30))));
    const sub = (dt || 0) / n;
    _subLook.mouse = frag.mouse;
    _subLook.dx = frag.dx / n;
    _subLook.dy = frag.dy / n;
    raw.look = _subLook;
    raw.dt = sub;
    let jumped = false;
    let actioned = false;
    for (let i = 0; i < n; i++) {
      raw.touchAction = i === 0 ? actionEdge : false;
      resolveInput(raw, orbit.yaw, t, res);
      if (res.jump) { jumped = true; raw.pressedAt = null; raw.groundedAt = null; }
      if (res.action) actioned = true;
      raw.prevMoveX = res.moveX;
      raw.prevMoveZ = res.moveZ;

      drive.yawDelta = res.camYawDelta;
      drive.pitchDelta = res.camPitchDelta;
      drive.zoomWant = look.zoomWant;
      drive.touched = look.touched || res.camYawDelta !== 0 || res.camPitchDelta !== 0;
      drive.moveN = ctx.moveN || 0;
      drive.playerYaw = ctx.playerYaw || 0;
      stepOrbit(orbit, drive, sub, t, orbit);
    }

    toControllerInput(res, ctrl, t);
    touch.update();
    touch.setActionLabel(actionLabel(ctx.actionKind));
    touch.setDiveVisible(!!ctx.swimming);

    outFrame.x = ctrl.x;
    outFrame.z = ctrl.z;
    outFrame.run = ctrl.run;
    outFrame.jump = jumped;
    outFrame.action = actioned;
    outFrame.jumpHeld = touch.jumpDown || keys.jumpDown || padFrag.jumpDown;
    outFrame.dive = touch.diveDown || keys.dive || padFrag.dive;
    outFrame.abilityPressed = abilityEdge;
    outFrame.abilityHeld = touch.abilityDown || keys.abilityDown || padFrag.abilityDown;
    outFrame.swapPressed = swapEdge;
    outFrame.swapSlot = keys.swapSlot;
    outFrame.yaw = orbit.yaw;
    outFrame.pitch = orbit.pitch;
    outFrame.zoom = orbit.zoom;
    return outFrame;
  }

  return {
    poll,
    orbit,
    /** Live stick deflection, measured from the FIXED base. Read-only. */
    stick: touch.state,
    /** Park the orbit behind a facing without a swing (boot, teleport). */
    snapTo(yaw) {
      orbit.yaw = yaw;
      orbit.pitch = 0;
      orbit.yawVel = 0;
      orbit.pitchVel = 0;
      orbit.idle = 99;
    },
    setVisible(v) { touch.setVisible(v); },
    /** The party verb chip — forward app.abilityChip() here every frame. */
    setAbilityChip(chip) { touch.setAbilityChip(chip); },
    /** The party ring — forward app.partyChips() here when the party changes. */
    setPartyChips(chips) { touch.setPartyChips(chips); },
    destroy() {
      touch.destroy();
      look.destroy();
      if (kb) {
        kb.off('keydown-SPACE', onKbJump);
        kb.off('keydown-E', onKbAction);
        kb.off('keydown-ENTER', onKbAction);
        kb.off('keydown-F', onKbAbility);
        kb.off('keydown-X', onKbAbility);
        kb.off('keydown-Q', onKbSwap);
        kb.off('keydown-ONE', onKbSlot0);
        kb.off('keydown-TWO', onKbSlot1);
        kb.off('keydown-THREE', onKbSlot2);
      }
    },
  };
}
