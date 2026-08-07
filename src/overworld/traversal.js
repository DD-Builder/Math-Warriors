/**
 * Overworld TRAVERSAL controller — climbing, gliding and swimming layered on
 * top of the walk controller as one deterministic state machine.
 *
 * This is the module that turns a walkable map into an OPEN WORLD: every
 * surface the walk controller calls a wall (>50 degrees) is now a ladder, every
 * drop is a flight path, and every stretch of deep water is a road. Nothing
 * here knows about three, the DOM or the real heightfield — it is pure logic
 * over the collision world contract, so plain Node can test every transition.
 *
 * WHY it WRAPS createController instead of replacing it: walking is already
 * correct, tuned and covered by controller.test.js. The walk case here is a
 * straight delegation to base.step() plus a transition scan on the result, so
 * a change to walk physics can never drift out of sync with a change to climb
 * physics — there is exactly one implementation of walking in the codebase.
 *
 * WHY the state stays a plain JSON record: the render loop replaces the state
 * object every fixed step (step() is pure — it never mutates its inputs), the
 * save writer serialises it, and the determinism harness JSON-compares two
 * runs. Anything non-serialisable in here would break all three.
 *
 * ── The state machine ──────────────────────────────────────────────────────
 *
 *                  press into a steep face (stamina, not tired)
 *        ┌──────────────────────────────────────────────────────┐
 *        │                                                      v
 *   ┌────┴────┐  jump mid-air, high enough   ┌───────┐      ┌───────┐
 *   │  WALK   │─────────────────────────────>│ GLIDE │      │ CLIMB │
 *   │ (base)  │<─────────────────────────────│       │      │       │
 *   └─┬─────▲─┘   land / jump folds it away  └───┬───┘      └───┬───┘
 *     │     │                                    │              │
 *     │     │  ground rises past the exit depth  │ splashdown   │ top of the
 *     │     │  ┌───────┐                         │ in deep      │ face reached
 *     │     └──│ SWIM  │<────────────────────────┘ water        v
 *     │        │       │                                    ┌────────┐
 *     └───────>│       │  deep water under the body         │ MANTLE │
 *  wade out    └───────┘                                    │(timed) │
 *  past the depth threshold                                 └───┬────┘
 *                                                               │ pops onto
 *   CLIMB also leaves to WALK on: jump off the wall (outward     │ the ledge
 *   hop), stamina exhausted (gentle release), or climbing down   │
 *   onto ground the walk controller can stand on. ───────────────┘
 *
 * Stamina is one shared pool: climbing and sprinting spend it, standing still
 * refills it fast. There is NO drowning, no fall damage and no death state
 * anywhere in this file — running dry in deep water only starts a gentle drift
 * toward the nearest shore, which is the water-facing echo of the walk
 * controller's "water slows you down, it never punishes you" rule.
 */
import { createController, DEFAULT_TUNING, PLAYER_RADIUS } from './controller.js';
import { WATER_Y } from './collision.js';

/** The traversal modes. `state.mode` is always exactly one of these. */
export const MODES = Object.freeze({
  WALK: 'walk',
  CLIMB: 'climb',
  MANTLE: 'mantle',
  GLIDE: 'glide',
  SWIM: 'swim',
});

/**
 * Traversal tuning. Merged over (and alongside) controller.js DEFAULT_TUNING,
 * so one object configures the whole character.
 *
 * The numbers are chosen for a 5-10 year old with a thumb, not a speedrunner:
 * the pool is huge, regen is faster than drain, and every failure state is a
 * soft landing rather than a restart.
 */
export const DEFAULT_TRAVERSAL_TUNING = {
  // ── Climb ────────────────────────────────────────────────────────────────
  climbUpSpeed: 2.4,      // m/s up the face — slower than a walk, reads as effort
  climbDownSpeed: 3.2,    // coming down is always quicker than going up
  climbSideSpeed: 2.0,
  climbReach: 0.95,       // PLAYER_RADIUS + a forearm: how far ahead a wall is felt
  climbMinRise: 0.9,      // a face must out-top the head, else it is just a bump
  climbFacing: 0.3,       // stick must push into the face (dot < -0.3, ~72 deg cone)
  climbHug: 0.25,         // normals are sampled here INSIDE the face as well as at
                          // the body, and the steeper sample wins: a heightfield
                          // kink at the exact foot of a cliff must not read as flat
  climbStickTol: 0.4,     // how far y may deviate from the sampled face per frame
  climbLatchStamina: 10,  // never latch on fumes — that is a drop, not a climb
  climbLatchLock: 0.35,   // s of no-relatch after letting go (the stick is still held)
  wallJumpOut: 4.5,       // m/s pushed off the face
  wallJumpUp: 0.75,       // x base jumpV
  // ── Mantle ───────────────────────────────────────────────────────────────
  mantleTime: 0.32,       // s — long enough to read, short enough to feel snappy
  mantleTol: 0.25,        // body this far off the face = the face ended
  mantleForward: 1.1,     // how far onto the ledge the pop lands
  mantleRise: 0.6,        // target ground above this is not a top, keep climbing
  // ── Glide ────────────────────────────────────────────────────────────────
  glideMinHeight: 2.5,    // m of air below you before the glider will open
  glideDeployVy: 2.0,     // must be past the top of the jump arc
  glideFall: -2.2,        // m/s terminal descent under canopy
  glideDiveFall: -4.6,    // …with the run button held
  glideSpeed: 10.0,       // faster than a sprint: the reward for the climb
  glideDiveSpeed: 12.5,
  glideAccel: 14,         // m/s^2 toward the steering target — deliberately snappy
  glideVyAccel: 9,        // m/s^2 toward the descent rate (the canopy "catching")
  glideDeployPop: -0.8,   // vy is lifted to at least this on deploy — a visible catch
  // ── Swim ─────────────────────────────────────────────────────────────────
  swimDepth: 1.4,         // water deeper than this swims…
  swimExitDepth: 0.9,     // …and shallower than this walks. The gap is hysteresis:
                          // no flicker while bobbing along a beach.
  swimEntryAbove: 0.3,    // body must have reached the surface to start swimming
  swimSpeed: 4.2,         // faster than wading (0.45 x 6 = 2.7): water is a road
  swimFastSpeed: 5.6,
  swimSink: 0.25,         // how low the body floats below the water plane
  swimBobAmp: 0.07,
  swimBobRate: 1.7,
  diveSpeed: 2.2,
  riseSpeed: 1.6,         // released, you always float back up
  diveMax: 3.0,
  diveClearance: 0.5,     // never dive into the seabed
  shoreAssist: 1.6,       // m/s of free help when the pool runs dry in deep water
  shoreProbe: 3.0,        // gradient probe arm used to find which way is shallow
  // ── Stamina (one shared pool) ────────────────────────────────────────────
  staminaMax: 100,
  staminaClimbMove: 6,    // /s — ~16 s of continuous climbing, ~40 m of face
  staminaClimbHold: 2.5,  // /s — hanging still is cheap, panic is free
  staminaClimbJump: 8,
  staminaMantle: 4,
  staminaSprint: 9,
  staminaSwimFast: 7,
  staminaRegenIdle: 34,   // /s — a full refill in ~3 s of standing still
  staminaRegenMove: 16,
  staminaRegenSwim: 6,    // floating recovers too, so nobody can get stuck offshore
  staminaRecover: 22,     // exhausted -> must reach this before climbing/sprinting
};

const TAU = Math.PI * 2;
/** Airborne bodies may never clip sideways into terrain above this margin. */
const AIR_WALL_EPS = 0.01;

function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** Move `cur` toward `target` by at most `maxStep` (frame-rate independent). */
function approach(cur, target, maxStep) {
  const d = target - cur;
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return target;
}

/** Classic 3t^2-2t^3 ease — flat at both ends, which is what makes a mantle
 *  land without a velocity pop. */
function smoothstep(p) {
  const x = clamp(p, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 0..1 stamina, for a meter. Safe on any state (including a raw base state). */
export function staminaFraction(state, tuning = DEFAULT_TRAVERSAL_TUNING) {
  const max = tuning.staminaMax || DEFAULT_TRAVERSAL_TUNING.staminaMax;
  const s = typeof state?.stamina === 'number' ? state.stamina : max;
  return clamp(s / max, 0, 1);
}

/**
 * @param {ReturnType<import('./collision.js').createCollisionWorld>} collisionWorld
 * @param {Partial<typeof DEFAULT_TUNING & typeof DEFAULT_TRAVERSAL_TUNING>} [tuning]
 */
export function createTraversalController(collisionWorld, tuning = {}) {
  const t = { ...DEFAULT_TUNING, ...DEFAULT_TRAVERSAL_TUNING, ...tuning };
  // The base controller filters this down to its own seven keys itself.
  const base = createController(collisionWorld, t);
  const slopeCos = Math.cos((t.slopeLimitDeg * Math.PI) / 180);

  const groundY = (x, z) => collisionWorld.groundHeight(x, z);

  // ── Shared field/state helpers ─────────────────────────────────────────

  /** Water depth under (x, z). Negative on dry land. */
  function depthAt(x, z) {
    return WATER_Y - groundY(x, z);
  }

  /**
   * Fold the traversal fields onto a base-controller result. Every exit path
   * goes through here, so no branch can forget a field and no state object
   * can ever be missing one (the save writer and the view both index them).
   */
  function pack(b, extra) {
    return {
      pos: b.pos,
      vel: b.vel,
      yaw: b.yaw,
      grounded: b.grounded,
      wading: b.wading,
      mode: MODES.WALK,
      stamina: t.staminaMax,
      tired: false,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
      ...extra,
    };
  }

  /** Accept a bare base state (or a half-written save) as a traversal state. */
  function normalize(state) {
    if (state && typeof state.mode === 'string') return state;
    return pack(state, {});
  }

  /**
   * Apply a stamina delta and keep the exhaustion latch honest. `tired` only
   * clears once the pool is back above staminaRecover, so a child cannot
   * chatter between climbing and falling one frame at a time.
   */
  function settleStamina(value, wasTired) {
    let s = value;
    let tired = wasTired;
    if (s <= 0) { s = 0; tired = true; }
    if (s > t.staminaMax) s = t.staminaMax;
    if (tired && s >= t.staminaRecover) tired = false;
    return { stamina: s, tired };
  }

  /**
   * The steeper of the normal under the body and the normal one hug-length
   * INTO the face. A heightfield has a kink exactly at the foot of a cliff;
   * sampling only the body's own column there reads flat and drops the
   * climber the instant they grab on.
   */
  function faceNormal(x, z, nx, nz) {
    const a = collisionWorld.groundNormal(x, z);
    const b = collisionWorld.groundNormal(x - nx * t.climbHug, z - nz * t.climbHug);
    return a[1] <= b[1] ? a : b;
  }

  // Shore-gradient scratch: two scalars in the closure rather than a returned
  // array, so the swim path allocates nothing beyond the state record.
  let _shoreX = 0;
  let _shoreZ = 0;
  /** Point (_shoreX, _shoreZ) uphill — i.e. at the nearest shallows. */
  function shoreDir(x, z) {
    const p = t.shoreProbe;
    const gx = groundY(x + p, z) - groundY(x - p, z);
    const gz = groundY(x, z + p) - groundY(x, z - p);
    const l = Math.hypot(gx, gz);
    if (l < 1e-9) { _shoreX = 0; _shoreZ = 0; return; }
    _shoreX = gx / l;
    _shoreZ = gz / l;
  }

  function turnToward(yaw, dirX, dirZ, dt) {
    const diff = wrapAngle(Math.atan2(dirX, dirZ) - yaw);
    const m = t.turnRate * dt;
    return wrapAngle(yaw + clamp(diff, -m, m));
  }

  // ── Transitions into the special modes ─────────────────────────────────

  /**
   * Is there a climbable face in front of the body, and is the stick pushing
   * into it? Returns the exact contact point (bisected along the reach ray)
   * plus the face's horizontal outward normal, or null.
   */
  function findWall(px, py, pz, dirX, dirZ) {
    const rx = px + dirX * t.climbReach;
    const rz = pz + dirZ * t.climbReach;
    if (groundY(rx, rz) < py + t.climbMinRise) return null; // a bump, not a wall
    const n = collisionWorld.groundNormal(rx, rz);
    if (n[1] >= slopeCos) return null;                      // walkable: just walk
    const hl = Math.hypot(n[0], n[2]);
    if (hl < 1e-6) return null;
    const nx = n[0] / hl;
    const nz = n[2] / hl;
    if (dirX * nx + dirZ * nz > -t.climbFacing) return null; // not pushing into it

    // Bisect for where the face crosses the body's height: grabbing on should
    // not teleport the player up or into the cliff.
    let hi = t.climbReach;
    if (groundY(px, pz) < py) {
      let lo = 0;
      for (let i = 0; i < 8; i++) {
        const m = (lo + hi) * 0.5;
        if (groundY(px + dirX * m, pz + dirZ * m) >= py) hi = m; else lo = m;
      }
    } else {
      hi = 0; // already touching
    }
    return { nx, nz, reach: hi };
  }

  /** Latch onto the face found by findWall(). */
  function enterClimb(s, wall, dt) {
    const moved = collisionWorld.resolveMove(
      s.pos,
      { x: wall.nx * -wall.reach, z: wall.nz * -wall.reach },
      PLAYER_RADIUS,
    );
    const x = moved.pos.x;
    const z = moved.pos.z;
    const g = groundY(x, z);
    const y = g > s.pos.y ? g : s.pos.y;
    return {
      pos: { x, y, z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: Math.atan2(-wall.nx, -wall.nz), // face the rock
      grounded: false,
      wading: false,
      mode: MODES.CLIMB,
      stamina: s.stamina,
      tired: s.tired,
      wall: { x: wall.nx, z: wall.nz },
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
    };
  }

  /**
   * Start the ledge pop. Returns null when the "top" turns out to still be
   * wall — the climb then simply continues, which is what keeps a bumpy face
   * from firing a mantle every few metres.
   */
  function beginMantle(s, nx, nz) {
    const fx = -nx * t.mantleForward;
    const fz = -nz * t.mantleForward;
    const moved = collisionWorld.resolveMove(s.pos, { x: fx, z: fz }, PLAYER_RADIUS);
    const tx = moved.pos.x;
    const tz = moved.pos.z;
    const ty = groundY(tx, tz);
    if (ty > s.pos.y + t.mantleRise) return null; // not a top after all
    const st = settleStamina(s.stamina - t.staminaMantle, s.tired);
    return {
      pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: s.yaw,
      grounded: false,
      wading: false,
      mode: MODES.MANTLE,
      stamina: st.stamina,
      tired: st.tired,
      wall: s.wall,
      mantle: {
        t: 0,
        from: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        to: { x: tx, y: ty, z: tz },
      },
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
    };
  }

  /** Let go of the wall: a short outward hop so the player clears the face. */
  function releaseClimb(s, push, up, staminaAfter) {
    const st = settleStamina(staminaAfter, s.tired);
    const nx = s.wall ? s.wall.x : 0;
    const nz = s.wall ? s.wall.z : 0;
    return {
      pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
      vel: { x: nx * push, y: up, z: nz * push },
      yaw: s.yaw,
      grounded: false,
      wading: false,
      mode: MODES.WALK,
      stamina: st.stamina,
      tired: st.tired,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: t.climbLatchLock,
    };
  }

  /** Drop into surface swimming at the body's current column. */
  function enterSwim(s, stamina, tired) {
    return {
      pos: { x: s.pos.x, y: WATER_Y - t.swimSink, z: s.pos.z },
      vel: { x: s.vel.x, y: 0, z: s.vel.z },
      yaw: s.yaw,
      grounded: false,
      wading: false,
      mode: MODES.SWIM,
      stamina,
      tired,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
    };
  }

  // ── WALK ───────────────────────────────────────────────────────────────

  function stepWalk(s, input, dt) {
    const ix = input.x || 0;
    const iz = input.y || 0;
    const mag = Math.hypot(ix, iz);
    // Sprinting is the pool's other customer. Out of stamina, the run button
    // is simply ignored — never a stumble, never a stagger.
    const canRun = !!input.run && !s.tired && s.stamina > 0;
    const b = base.step(s, { x: ix, y: iz, jump: !!input.jump, run: canRun }, dt);

    // Stamina bookkeeping first: every transition below wants the post-frame
    // pool (a latch must be paid for out of what is left this frame).
    let pool = s.stamina;
    if (b.grounded) {
      if (canRun && mag > 0.05) pool -= t.staminaSprint * dt;
      else pool += (mag > 0.05 ? t.staminaRegenMove : t.staminaRegenIdle) * dt;
    }
    const st = settleStamina(pool, s.tired);
    const latchLock = s.latchLock > 0 ? Math.max(0, s.latchLock - dt) : 0;
    const airTime = b.grounded ? 0 : s.airTime + dt;

    // 1. Water wins: you cannot climb or open a glider once you are in the sea.
    if (depthAt(b.pos.x, b.pos.z) >= t.swimDepth && b.pos.y <= WATER_Y + t.swimEntryAbove) {
      return enterSwim(b, st.stamina, st.tired);
    }

    // 2. Climb latch — grounded OR airborne, so a jump can catch a face.
    if (mag > 0.3 && latchLock <= 0 && !st.tired && st.stamina >= t.climbLatchStamina) {
      const wall = findWall(b.pos.x, b.pos.y, b.pos.z, ix / mag, iz / mag);
      if (wall) {
        return enterClimb({ ...b, stamina: st.stamina, tired: st.tired }, wall, dt);
      }
    }

    // 3. Glider. `s.grounded` (not b.grounded) gates it: on the frame a jump
    //    fires, the body is already airborne but the button was spent on the
    //    jump, and opening the canopy at ankle height is not a glide.
    if (
      input.jump && !b.grounded && !s.grounded
      && b.vel.y <= t.glideDeployVy
      && b.pos.y - groundY(b.pos.x, b.pos.z) >= t.glideMinHeight
    ) {
      return {
        pos: b.pos,
        vel: { x: b.vel.x, y: Math.max(b.vel.y, t.glideDeployPop), z: b.vel.z },
        yaw: b.yaw,
        grounded: false,
        wading: false,
        mode: MODES.GLIDE,
        stamina: st.stamina,
        tired: st.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime,
        latchLock: 0,
      };
    }

    return {
      pos: b.pos,
      vel: b.vel,
      yaw: b.yaw,
      grounded: b.grounded,
      wading: b.wading,
      mode: MODES.WALK,
      stamina: st.stamina,
      tired: st.tired,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime,
      latchLock,
    };
  }

  // ── CLIMB ──────────────────────────────────────────────────────────────

  function stepClimb(s, input, dt) {
    const wallX = s.wall ? s.wall.x : 0;
    const wallZ = s.wall ? s.wall.z : 0;

    // Re-read the face every frame so a curving cliff steers the climber.
    const n = faceNormal(s.pos.x, s.pos.z, wallX, wallZ);
    const hl = Math.hypot(n[0], n[2]);
    const walkable = n[1] >= slopeCos || hl < 1e-6;

    // Stick input, resolved into the wall's own frame:
    //   up   = pushing INTO the face (the inward horizontal direction)
    //   lat  = sliding along it
    const ix = input.x || 0;
    const iz = input.y || 0;
    const up = ix * -wallX + iz * -wallZ;
    const lat = ix * -wallZ + iz * wallX;
    const active = Math.abs(up) + Math.abs(lat) > 0.05;

    // Jump off: a real hop away from the rock, and the lock stops the still-held
    // stick from re-latching on the very next frame.
    if (input.jump) {
      return releaseClimb(s, t.wallJumpOut, t.jumpV * t.wallJumpUp, s.stamina - t.staminaClimbJump);
    }

    const pool = s.stamina - (active ? t.staminaClimbMove : t.staminaClimbHold) * dt;
    if (pool <= 0) {
      // Out of puff: peel off gently. A small push, no launch — the fall is the
      // consequence, and the walk controller lands it.
      return releaseClimb(s, t.wallJumpOut * 0.35, 0, 0);
    }
    const st = settleStamina(pool, s.tired);

    // Already standing on ground the walk controller can hold? Only true at the
    // bottom of a face (the top is handled after the move, as a mantle).
    if (walkable && up <= 0) {
      const g = groundY(s.pos.x, s.pos.z);
      return {
        pos: { x: s.pos.x, y: g, z: s.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        yaw: s.yaw,
        grounded: true,
        wading: collisionWorld.isWater(s.pos.x, s.pos.z),
        mode: MODES.WALK,
        stamina: st.stamina,
        tired: st.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime: 0,
        latchLock: 0,
      };
    }
    if (walkable && up > 0) {
      const m = beginMantle({ ...s, stamina: st.stamina, tired: st.tired }, wallX, wallZ);
      if (m) return m;
    }

    // Vertical intent, then the horizontal advance that keeps the body ON the
    // face. For a plane of normal n, moving inward by dy*ny/|n_h| raises the
    // surface under you by exactly dy — so the inward creep IS the climb.
    const dy = (up >= 0 ? up * t.climbUpSpeed : up * t.climbDownSpeed) * dt;
    const ratio = hl > 1e-6 ? n[1] / hl : 0;
    const inward = clamp(dy * ratio, -t.climbStickTol, t.climbStickTol);
    const dx = -wallZ * lat * t.climbSideSpeed * dt + -wallX * inward;
    const dz = wallX * lat * t.climbSideSpeed * dt + -wallZ * inward;

    const moved = collisionWorld.resolveMove(s.pos, { x: dx, z: dz }, PLAYER_RADIUS);
    const nx2 = moved.pos.x;
    const nz2 = moved.pos.z;
    const g2 = groundY(nx2, nz2);
    const want = s.pos.y + dy;
    const y2 = clamp(g2, want - t.climbStickTol, want + t.climbStickTol);

    // Hanging in space this far off the sampled face means the face ran out
    // above us — that is a ledge, and a ledge is a mantle.
    if (y2 - g2 > t.mantleTol) {
      const m = beginMantle(
        { ...s, pos: { x: nx2, y: y2, z: nz2 }, stamina: st.stamina, tired: st.tired },
        wallX, wallZ,
      );
      if (m) return m;
    }

    // Keep the wall normal fresh for the next frame's frame-of-reference.
    let outX = wallX;
    let outZ = wallZ;
    const n2 = faceNormal(nx2, nz2, wallX, wallZ);
    const hl2 = Math.hypot(n2[0], n2[2]);
    if (n2[1] < slopeCos && hl2 > 1e-6) {
      outX = n2[0] / hl2;
      outZ = n2[2] / hl2;
    }

    return {
      pos: { x: nx2, y: y2, z: nz2 },
      vel: { x: (nx2 - s.pos.x) / dt, y: (y2 - s.pos.y) / dt, z: (nz2 - s.pos.z) / dt },
      yaw: Math.atan2(-outX, -outZ),
      grounded: false,
      wading: false,
      mode: MODES.CLIMB,
      stamina: st.stamina,
      tired: st.tired,
      wall: { x: outX, z: outZ },
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
    };
  }

  // ── MANTLE ─────────────────────────────────────────────────────────────

  /**
   * The ledge pop. Uninterruptible on purpose: once a child has earned the top
   * of a cliff, no stray input takes it away from them. y leads the horizontal
   * (finished at 60% of the clip) so the body rises THEN slides in, which is
   * what makes it read as climbing over an edge rather than sliding through it.
   */
  function stepMantle(s, input, dt) {
    const m = s.mantle;
    const nt = m.t + dt;
    const p = clamp(nt / t.mantleTime, 0, 1);
    if (p >= 1) {
      const g = groundY(m.to.x, m.to.z);
      return {
        pos: { x: m.to.x, y: g, z: m.to.z },
        vel: { x: 0, y: 0, z: 0 },
        yaw: s.yaw,
        grounded: true,
        wading: collisionWorld.isWater(m.to.x, m.to.z),
        mode: MODES.WALK,
        stamina: s.stamina,
        tired: s.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime: 0,
        latchLock: 0,
      };
    }
    const eh = smoothstep(p);
    const ev = smoothstep(p / 0.6);
    const x = m.from.x + (m.to.x - m.from.x) * eh;
    const z = m.from.z + (m.to.z - m.from.z) * eh;
    const y = m.from.y + (m.to.y - m.from.y) * ev;
    return {
      pos: { x, y, z },
      vel: { x: (x - s.pos.x) / dt, y: (y - s.pos.y) / dt, z: (z - s.pos.z) / dt },
      yaw: s.yaw,
      grounded: false,
      wading: false,
      mode: MODES.MANTLE,
      stamina: s.stamina,
      tired: s.tired,
      wall: s.wall,
      mantle: { t: nt, from: m.from, to: m.to },
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
    };
  }

  // ── GLIDE ──────────────────────────────────────────────────────────────

  function stepGlide(s, input, dt) {
    // Tap jump again to fold the canopy — the only way to cancel a glide short
    // of landing, and it hands the body straight back to gravity.
    if (input.jump) {
      return {
        pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        vel: { x: s.vel.x, y: s.vel.y, z: s.vel.z },
        yaw: s.yaw,
        grounded: false,
        wading: false,
        mode: MODES.WALK,
        stamina: s.stamina,
        tired: s.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime: s.airTime + dt,
        latchLock: t.climbLatchLock,
      };
    }

    const diving = !!input.run;
    const ix = input.x || 0;
    const iz = input.y || 0;
    const mag = Math.hypot(ix, iz);
    const spd = diving ? t.glideDiveSpeed : t.glideSpeed;

    // With no stick the canopy keeps flying the way it is pointed, at a
    // reduced cruise — a glider never hovers.
    let tx;
    let tz;
    if (mag > 1e-6) {
      const throttle = Math.min(mag, 1);
      tx = (ix / mag) * spd * throttle;
      tz = (iz / mag) * spd * throttle;
    } else {
      tx = Math.sin(s.yaw) * spd * 0.7;
      tz = Math.cos(s.yaw) * spd * 0.7;
    }
    const acc = t.glideAccel * dt;
    const vx = approach(s.vel.x, tx, acc);
    const vz = approach(s.vel.z, tz, acc);
    const vy = approach(s.vel.y, diving ? t.glideDiveFall : t.glideFall, t.glideVyAccel * dt);

    let yaw = s.yaw;
    const hs = Math.hypot(vx, vz);
    if (hs > 0.05) yaw = turnToward(yaw, vx / hs, vz / hs, dt);

    const moved = collisionWorld.resolveMove(s.pos, { x: vx * dt, z: vz * dt }, PLAYER_RADIUS);
    let px = moved.pos.x;
    let pz = moved.pos.z;
    let hvx = vx;
    let hvz = vz;
    const y = s.pos.y + vy * dt;
    // Same airborne wall rule the walk controller uses: never clip sideways
    // into a hillside just because you are flying.
    if (groundY(px, pz) > y + AIR_WALL_EPS) {
      px = s.pos.x;
      pz = s.pos.z;
      hvx = 0;
      hvz = 0;
    }

    const g = groundY(px, pz);
    // Splashdown: deep water catches you, the canopy folds, you are swimming.
    if (depthAt(px, pz) >= t.swimDepth && y <= WATER_Y + t.swimEntryAbove) {
      return enterSwim(
        { pos: { x: px, y, z: pz }, vel: { x: hvx, y: 0, z: hvz }, yaw },
        s.stamina, s.tired,
      );
    }
    if (y <= g) {
      // Touchdown folds the glider away. No fall damage: this is a landing.
      return {
        pos: { x: px, y: g, z: pz },
        vel: { x: hvx, y: 0, z: hvz },
        yaw,
        grounded: true,
        wading: collisionWorld.isWater(px, pz),
        mode: MODES.WALK,
        stamina: s.stamina,
        tired: s.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime: 0,
        latchLock: 0,
      };
    }

    return {
      pos: { x: px, y, z: pz },
      vel: { x: hvx, y: vy, z: hvz },
      yaw,
      grounded: false,
      wading: false,
      mode: MODES.GLIDE,
      stamina: s.stamina,
      tired: s.tired,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: s.airTime + dt,
      latchLock: 0,
    };
  }

  // ── SWIM ───────────────────────────────────────────────────────────────

  function stepSwim(s, input, dt) {
    const ix = input.x || 0;
    const iz = input.y || 0;
    const mag = Math.hypot(ix, iz);
    const fast = !!input.run && !s.tired && s.stamina > 0;

    let vx = 0;
    let vz = 0;
    let yaw = s.yaw;
    if (mag > 1e-6) {
      const throttle = Math.min(mag, 1);
      const spd = (fast ? t.swimFastSpeed : t.swimSpeed) * throttle;
      vx = (ix / mag) * spd;
      vz = (iz / mag) * spd;
      yaw = turnToward(yaw, ix / mag, iz / mag, dt);
    }
    // THE NO-DROWNING RULE. An empty pool in deep water is not a death timer,
    // it is a tow rope: the current takes you toward the nearest shallows and
    // the pool refills while it does.
    if (s.stamina <= 0) {
      shoreDir(s.pos.x, s.pos.z);
      vx += _shoreX * t.shoreAssist;
      vz += _shoreZ * t.shoreAssist;
    }

    let pool = s.stamina;
    if (fast && mag > 0.05) pool -= t.staminaSwimFast * dt;
    else pool += t.staminaRegenSwim * dt;
    const st = settleStamina(pool, s.tired);

    const moved = collisionWorld.resolveMove(s.pos, { x: vx * dt, z: vz * dt }, PLAYER_RADIUS);
    const px = moved.pos.x;
    const pz = moved.pos.z;
    const g = groundY(px, pz);
    const swimT = s.swimT + dt;

    // Beach exit: the seabed has risen into wading depth, so hand the body
    // back to the walk controller standing up. Hysteresis against swimDepth
    // means the transition cannot chatter in the surf.
    if (g >= WATER_Y - t.swimExitDepth) {
      return {
        pos: { x: px, y: g, z: pz },
        vel: { x: vx, y: 0, z: vz },
        yaw,
        grounded: true,
        wading: collisionWorld.isWater(px, pz),
        mode: MODES.WALK,
        stamina: st.stamina,
        tired: st.tired,
        wall: null,
        mantle: null,
        swimT: 0,
        dive: 0,
        airTime: 0,
        latchLock: 0,
      };
    }

    // Diving is optional and always reversible: let go (or tap jump) and you
    // float back to the surface on your own.
    const maxDive = Math.max(0, Math.min(t.diveMax, (WATER_Y - g) - t.diveClearance));
    const wantDown = !!input.dive && !input.jump;
    const dive = clamp(
      s.dive + (wantDown ? t.diveSpeed : -t.riseSpeed) * dt,
      0,
      maxDive,
    );
    const bobFade = 1 - Math.min(1, dive / 0.5);
    const y = WATER_Y - t.swimSink - dive
      + Math.sin(swimT * t.swimBobRate) * t.swimBobAmp * bobFade;

    return {
      pos: { x: px, y, z: pz },
      vel: { x: vx, y: dt > 1e-9 ? (y - s.pos.y) / dt : 0, z: vz },
      yaw,
      grounded: false,
      wading: false,
      mode: MODES.SWIM,
      stamina: st.stamina,
      tired: st.tired,
      wall: null,
      mantle: null,
      swimT,
      dive,
      airTime: 0,
      latchLock: 0,
    };
  }

  // ── Public surface (drop-in for createController) ──────────────────────

  /** Fresh state with feet on the ground — or afloat, if that is deep water. */
  function spawnState(opts = {}) {
    const b = base.spawnState(opts);
    const s = pack(b, {});
    if (depthAt(b.pos.x, b.pos.z) >= t.swimDepth) {
      return enterSwim(s, t.staminaMax, false);
    }
    return s;
  }

  /**
   * Advance one frame. Returns a NEW state; `state` and `input` are read-only.
   * input: { x, y (world-space move vector, y maps to z), jump, run, dive }.
   */
  function step(state, input, dt) {
    const s = normalize(state);
    switch (s.mode) {
      case MODES.CLIMB: return stepClimb(s, input, dt);
      case MODES.MANTLE: return stepMantle(s, input, dt);
      case MODES.GLIDE: return stepGlide(s, input, dt);
      case MODES.SWIM: return stepSwim(s, input, dt);
      default: return stepWalk(s, input, dt);
    }
  }

  return {
    spawnState,
    step,
    /** The merged tuning, for HUD/meters and tests. */
    tuning: t,
    MODES,
  };
}
