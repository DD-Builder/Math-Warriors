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
 *   │ (base)  │<─────────────────────────────│       │      │ shimmy│
 *   └─┬─────▲─┘   land / jump folds it away  └───┬───┘      └───┬───┘
 *     │     │                                    │              │
 *     │     │  ground rises past the exit depth  │ splashdown   │ top of the
 *     │     │  ┌───────┐                         │ in deep      │ face reached
 *     │     └──│ SWIM  │<────────────────────────┘ water        v  (or the
 *     │        │ +dive │                                    ┌────────┐ "so
 *     └───────>│       │  deep water under the body         │ MANTLE │ close"
 *  wade out    └───────┘                                    │(timed) │ grace)
 *  past the depth threshold                                 └───┬────┘
 *                                                               │ pops onto
 *   CLIMB also leaves to WALK on: jump off the wall (outward     │ the ledge
 *   hop), stamina exhausted (gentle release), or climbing down   │
 *   onto ground the walk controller can stand on. ───────────────┘
 *
 * Stamina is one shared pool: climbing and sprinting spend it, standing still
 * refills it fast. There is NO drowning, no fall damage and no death state
 * anywhere in this file — running dry in deep water only starts a gentle drift
 * toward the nearest shore, and running dry on a wall within arm's reach of the
 * top hands you the top anyway (the "so close" grace). This is a game for
 * five-year-olds: every failure state in here is a soft landing.
 *
 * ── The three kindnesses ───────────────────────────────────────────────────
 *
 *   1. SO-CLOSE GRACE.  Empty pool on a wall whose lip is within graceRise
 *      metres = a free mantle, once per latch. A child who almost made it
 *      made it.
 *   2. AUTO-CANOPY.     Fall for glideAutoFallT seconds with glideAutoHeight
 *      metres of air still below you and the glider opens ITSELF. Walking off
 *      the palace can never be a plummet, even if nobody presses anything.
 *   3. SHORE TOW.       Empty pool in deep water is not a timer, it is a tow
 *      rope toward the nearest shallows, and the pool refills while it tows.
 *
 * ── The one-shot `event` field ─────────────────────────────────────────────
 * Every frame the state carries `event`: null, or the name of the single
 * notable thing that happened on THAT step ('grab', 'mantle', 'canopy',
 * 'touchdown', 'splash', 'submerge', 'surface', 'shimmy', 'thermal',
 * 'spent', 'rescue'). The rig, the audio bus and the FX layer read it and
 * nothing has to diff two states to notice a landing. It is part of the pure
 * output, so a replay reproduces every sound effect exactly.
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

/** Every one-shot `event` name the machine can emit. Frozen so a typo in a
 *  consumer's switch is a lookup miss here rather than a silent dead branch. */
export const EVENTS = Object.freeze({
  GRAB: 'grab',            // latched onto a face
  SHIMMY: 'shimmy',        // started moving sideways on a face
  MANTLE: 'mantle',        // ledge pop began
  RESCUE: 'rescue',        // ...and it began because of the so-close grace
  SPENT: 'spent',          // pool hit zero and the hands opened
  CANOPY: 'canopy',        // glider deployed
  AUTOCANOPY: 'autocanopy',// ...and it deployed itself
  THERMAL: 'thermal',      // caught a rising column
  TOUCHDOWN: 'touchdown',  // glider landing, feet down
  SPLASH: 'splash',        // entered deep water
  SUBMERGE: 'submerge',    // head went under
  SURFACE: 'surface',      // head came back up
  SHORE: 'shore',          // stood up out of the water
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
  climbUpSpeed: 2.8,      // m/s up the face — slower than a walk, reads as effort
  climbDownSpeed: 3.6,    // coming down is always quicker than going up
  climbSideSpeed: 2.4,    // the shimmy. Nearly a walk: sliding along a ledge
                          // hunting for the next hold should never feel slow.
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
  // ── The "so close" grace ─────────────────────────────────────────────────
  graceRise: 4.0,         // m of face left when the pool empties that still
                          // counts as "you made it". Four metres is about a
                          // second and a half of climbing: comfortably more
                          // than the distance a child notices losing.
  graceProbe: 1.15,       // how far INTO the face the lip is looked for. Roughly
                          // mantleForward, so "the probe found the top" and "the
                          // pop can reach the top" are the same question.
  mantleSlack: 12,        // degrees past the walk limit a mantle target may be.
                          // A mantle must land somewhere a child can STAND — the
                          // slack only covers a top whose sampled normal is a
                          // hair over the limit, never a rescue onto a cliff.
  // ── Glide ────────────────────────────────────────────────────────────────
  glideMinHeight: 2.5,    // m of air below you before the glider will open
  glideDeployVy: 2.0,     // must be past the top of the jump arc
  glideFall: -2.2,        // m/s terminal descent under canopy  (4.5 : 1 glide)
  glideDiveFall: -4.6,    // …with the run button held           (2.7 : 1)
  glideSpeed: 10.0,       // faster than a sprint: the reward for the climb
  glideDiveSpeed: 12.5,
  glideAccel: 24,         // m/s^2 toward the steering target. Sized so a FULL
                          // reversal (+glideSpeed to -glideSpeed) takes ~0.85 s:
                          // any slower and a child steering away from a cliff
                          // arrives after the cliff does.
  glideVyAccel: 9,        // m/s^2 toward the descent rate (the canopy "catching")
  glideDeployPop: -0.8,   // vy is lifted to at least this on deploy — a visible catch
  glideAutoFallT: 0.85,   // s of unbroken falling after which the canopy opens
  glideAutoHeight: 9.0,   // …provided this much air is still under the feet
  glideFlareSpeed: 0.55,  // horizontal speed kept on touchdown — the flourish is
                          // a run-out, not a stop
  glideFlareHeight: 1.6,  // m above ground where the canopy flares (vy eased to
                          // a third) so nobody ever slams into the deck
  // ── Thermals ─────────────────────────────────────────────────────────────
  thermalGain: 1.0,       // multiplier on whatever the field reports
  thermalMax: 6.5,        // m/s hard ceiling on lift, so a vent cannot fling
  thermalAccel: 5.0,      // m/s^2 the canopy accepts lift at — a swell, not a kick
  thermalNoticeAt: 1.2,   // m/s of lift that fires the 'thermal' event once
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
  submergeAt: 0.55,       // dive depth at which the head is under and the world
                          // goes green — the caustic view's one threshold
  shoreAssist: 1.6,       // m/s of free help when the pool runs dry in deep water
  shoreProbe: 3.0,        // gradient probe arm used to find which way is shallow
  // ── Stamina (one shared pool) ────────────────────────────────────────────
  staminaMax: 100,
  staminaClimbMove: 5,    // /s — 20 s of continuous climbing, ~56 m of face.
                          // The tallest authored face on the island is 42 m.
  staminaClimbSide: 3,    // /s — a shimmy is cheaper than a haul
  staminaClimbHold: 2,    // /s — hanging still is cheap, panic is free
  staminaClimbJump: 8,
  staminaMantle: 4,
  staminaSprint: 9,
  staminaSwimFast: 7,
  staminaRegenIdle: 34,   // /s — a full refill in ~3 s of standing still
  staminaRegenMove: 16,
  staminaRegenSwim: 6,    // floating recovers too, so nobody can get stuck offshore
  staminaRegenGlide: 12,  // the canopy is a rest: you land ready to climb again
  staminaRecover: 22,     // exhausted -> must reach this before climbing/sprinting
  staminaLowAt: 0.28,     // fraction below which the gauge should start shouting
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
  // Number.isFinite, not typeof: a NaN that reached a save (or a half-written
  // state) must read as a FULL pool, never as a NaN that poisons the HUD's
  // arc geometry and draws nothing at all.
  const s = Number.isFinite(state?.stamina) ? state.stamina : max;
  return clamp(s / max, 0, 1);
}

/**
 * Should the stamina gauge be on screen at all? A ring that is always visible
 * is HUD clutter; a ring that appears the moment the pool is being spent and
 * fades once it is full again is feedback. Pure, so the HUD test can pin it.
 */
export function staminaVisible(state, tuning = DEFAULT_TRAVERSAL_TUNING) {
  if (!state) return false;
  if (state.mode === MODES.CLIMB || state.mode === MODES.MANTLE) return true;
  if (state.tired) return true;
  return staminaFraction(state, tuning) < 0.999;
}

/** True while the head is under water — the cue the caustic view keys off. */
export function isUnderwater(state, tuning = DEFAULT_TRAVERSAL_TUNING) {
  return state?.mode === MODES.SWIM && (state.dive || 0) >= tuning.submergeAt;
}

/**
 * Traversal-mode flags for heroRig.update(). Kept here rather than in the rig
 * so exactly one file knows what MODES mean.
 */
export function rigFlags(state, out = {}) {
  out.climbing = state?.mode === MODES.CLIMB || state?.mode === MODES.MANTLE;
  out.gliding = state?.mode === MODES.GLIDE;
  out.swimming = state?.mode === MODES.SWIM;
  return out;
}

/**
 * @param {ReturnType<import('./collision.js').createCollisionWorld>} collisionWorld
 * @param {Partial<typeof DEFAULT_TUNING & typeof DEFAULT_TRAVERSAL_TUNING>} [tuning]
 * @param {{thermalAt?: (x:number,y:number,z:number,t:number)=>number}} [field]
 *        Optional environment sampler. `thermalAt` returns metres per second of
 *        rising air at a point — Ember vents, sun-warmed rock. It MUST be a
 *        pure function of its four arguments (the fourth is the sim clock,
 *        which lives in the state) or replays stop matching.
 */
export function createTraversalController(collisionWorld, tuning = {}, field = {}) {
  const t = { ...DEFAULT_TUNING, ...DEFAULT_TRAVERSAL_TUNING, ...tuning };
  // The base controller filters this down to its own seven keys itself.
  const base = createController(collisionWorld, t);
  const slopeCos = Math.cos((t.slopeLimitDeg * Math.PI) / 180);
  // Mantles are judged against a slightly relaxed limit — see mantleSlack.
  const mantleCos = Math.cos(((t.slopeLimitDeg + t.mantleSlack) * Math.PI) / 180);
  const thermalAt = typeof field.thermalAt === 'function' ? field.thermalAt : null;

  const groundY = (x, z) => collisionWorld.groundHeight(x, z);

  // ── Shared field/state helpers ─────────────────────────────────────────

  /** Water depth under (x, z). Negative on dry land. */
  function depthAt(x, z) {
    return WATER_Y - groundY(x, z);
  }

  /** Rising air at a point, clamped. 0 when no field is wired. */
  function liftAt(x, y, z, simT) {
    if (!thermalAt) return 0;
    const v = thermalAt(x, y, z, simT);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(v * t.thermalGain, t.thermalMax);
  }

  /**
   * THE ONE STATE BUILDER. Every return in this file goes through here, which
   * is the only reason a fourteen-field record with five modes stays honest:
   * a new field is added once, defaults once, and no branch can forget it.
   * `b` supplies pos/vel/yaw/grounded/wading (a base-controller result or a
   * traversal state); `extra` overrides anything.
   */
  function mk(b, extra) {
    const s = {
      pos: b.pos,
      vel: b.vel,
      yaw: b.yaw,
      grounded: !!b.grounded,
      wading: !!b.wading,
      mode: MODES.WALK,
      stamina: typeof b.stamina === 'number' ? b.stamina : t.staminaMax,
      tired: !!b.tired,
      wall: null,
      mantle: null,
      swimT: 0,
      dive: 0,
      airTime: 0,
      latchLock: 0,
      simT: typeof b.simT === 'number' ? b.simT : 0,
      climbT: 0,
      shimmy: 0,
      grace: false,
      autoOff: false,
      towing: false,
      lift: 0,
      underwater: false,
      event: null,
      ...extra,
    };
    return s;
  }

  /** Accept a bare base state (or a half-written save) as a traversal state. */
  function normalize(state) {
    if (state && typeof state.mode === 'string' && typeof state.simT === 'number') return state;
    if (state && typeof state.mode === 'string') return { ...mk(state, {}), ...state, simT: 0 };
    return mk(state || { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0 }, {});
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
  function enterClimb(s, wall) {
    const moved = collisionWorld.resolveMove(
      s.pos,
      { x: wall.nx * -wall.reach, z: wall.nz * -wall.reach },
      PLAYER_RADIUS,
    );
    const x = moved.pos.x;
    const z = moved.pos.z;
    const g = groundY(x, z);
    const y = g > s.pos.y ? g : s.pos.y;
    return mk(s, {
      pos: { x, y, z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: Math.atan2(-wall.nx, -wall.nz), // face the rock
      grounded: false,
      wading: false,
      mode: MODES.CLIMB,
      wall: { x: wall.nx, z: wall.nz },
      event: EVENTS.GRAB,
    });
  }

  /**
   * How much face is left above the body, in metres, capped at `cap`. Used by
   * the so-close grace: the question "would one more second have done it?"
   * answered by sampling the ground one graceProbe INTO the face — if that is
   * the plateau, this is exactly the height of the remaining lip; if it is
   * still wall, the number comes out bigger than the cap and the grace does
   * not fire.
   *
   * The bias is deliberate and correct: the steeper the face, the more of it
   * the probe forgives (a sheer wall gets the full graceRise, a 76-degree
   * slab gets about half of it). Scary walls are the ones a child needs the
   * help on. beginMantle() then has the final say — a rescue that cannot land
   * somewhere standable is not a rescue.
   *
   * Returns Infinity when the face runs past the cap — i.e. not close at all.
   */
  function faceLeft(s, nx, nz, cap) {
    const px = s.pos.x - nx * t.graceProbe;
    const pz = s.pos.z - nz * t.graceProbe;
    const top = groundY(px, pz);
    const left = top - s.pos.y;
    if (left <= 0) return 0;
    return left <= cap ? left : Infinity;
  }

  /**
   * Start the ledge pop. Returns null when the "top" turns out to still be
   * wall — the climb then simply continues, which is what keeps a bumpy face
   * from firing a mantle every few metres.
   *
   * `rise` lifts the launch point before the arc is built, which is what makes
   * the so-close grace possible: the pop starts from where the child ALMOST
   * got to, not from where their hands actually gave out.
   */
  function beginMantle(s, nx, nz, { rise = 0, free = false } = {}) {
    const fromY = s.pos.y + rise;
    const fx = -nx * t.mantleForward;
    const fz = -nz * t.mantleForward;
    const moved = collisionWorld.resolveMove(s.pos, { x: fx, z: fz }, PLAYER_RADIUS);
    const tx = moved.pos.x;
    const tz = moved.pos.z;
    const ty = groundY(tx, tz);
    if (ty > fromY + t.mantleRise) return null; // not a top after all
    // ...and the top must be somewhere you can stand. Without this a rescue on
    // a moderate slope pops the player half a face up onto more cliff.
    if (collisionWorld.groundNormal(tx, tz)[1] < mantleCos) return null;
    const st = free
      ? { stamina: s.stamina, tired: s.tired }
      : settleStamina(s.stamina - t.staminaMantle, s.tired);
    return mk(s, {
      pos: { x: s.pos.x, y: fromY, z: s.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      grounded: false,
      wading: false,
      mode: MODES.MANTLE,
      stamina: st.stamina,
      tired: st.tired,
      wall: s.wall,
      mantle: {
        t: 0,
        from: { x: s.pos.x, y: fromY, z: s.pos.z },
        to: { x: tx, y: ty, z: tz },
      },
      grace: s.grace || free,
      event: free ? EVENTS.RESCUE : EVENTS.MANTLE,
    });
  }

  /** Let go of the wall: a short outward hop so the player clears the face. */
  function releaseClimb(s, push, up, staminaAfter, event) {
    const st = settleStamina(staminaAfter, s.tired);
    const nx = s.wall ? s.wall.x : 0;
    const nz = s.wall ? s.wall.z : 0;
    return mk(s, {
      pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
      vel: { x: nx * push, y: up, z: nz * push },
      grounded: false,
      wading: false,
      mode: MODES.WALK,
      stamina: st.stamina,
      tired: st.tired,
      latchLock: t.climbLatchLock,
      event: event || null,
    });
  }

  /** Drop into surface swimming at the body's current column. */
  function enterSwim(s, stamina, tired) {
    return mk(s, {
      pos: { x: s.pos.x, y: WATER_Y - t.swimSink, z: s.pos.z },
      vel: { x: s.vel.x, y: 0, z: s.vel.z },
      grounded: false,
      wading: false,
      mode: MODES.SWIM,
      stamina,
      tired,
      event: EVENTS.SPLASH,
    });
  }

  /** Open the canopy on a body that is already in the air. */
  function deployGlide(b, s, stamina, tired, airTime, auto) {
    return mk(s, {
      pos: b.pos,
      vel: { x: b.vel.x, y: Math.max(b.vel.y, t.glideDeployPop), z: b.vel.z },
      yaw: b.yaw,
      grounded: false,
      wading: false,
      mode: MODES.GLIDE,
      stamina,
      tired,
      airTime,
      event: auto ? EVENTS.AUTOCANOPY : EVENTS.CANOPY,
    });
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
    const carry = s; // simT was advanced once in step(); nothing else survives a mode change

    // 1. Water wins: you cannot climb or open a glider once you are in the sea.
    if (depthAt(b.pos.x, b.pos.z) >= t.swimDepth && b.pos.y <= WATER_Y + t.swimEntryAbove) {
      return enterSwim({ ...carry, ...b }, st.stamina, st.tired);
    }

    // 2. Climb latch — grounded OR airborne, so a jump can catch a face.
    if (mag > 0.3 && latchLock <= 0 && !st.tired && st.stamina >= t.climbLatchStamina) {
      const wall = findWall(b.pos.x, b.pos.y, b.pos.z, ix / mag, iz / mag);
      // st.stamina / st.tired, not s.stamina: a latch is paid for out of what
      // is left AFTER this frame's regen, so the climb starts from the number
      // the gauge is about to draw.
      if (wall) return enterClimb({ ...carry, ...b, stamina: st.stamina, tired: st.tired }, wall);
    }

    // 3. Glider, deployed on purpose. `s.grounded` (not b.grounded) gates it:
    //    on the frame a jump fires, the body is already airborne but the button
    //    was spent on the jump, and opening the canopy at ankle height is not a
    //    glide.
    const airBelow = b.pos.y - groundY(b.pos.x, b.pos.z);
    if (
      input.jump && !b.grounded && !s.grounded
      && b.vel.y <= t.glideDeployVy
      && airBelow >= t.glideMinHeight
    ) {
      return deployGlide(b, carry, st.stamina, st.tired, airTime, false);
    }

    // 4. AUTO-CANOPY. Nobody pressed anything, the ground is a long way down
    //    and the fall has gone on long enough to be frightening. The glider
    //    opens itself. This is the single kindest line in the movement code:
    //    a five-year-old who walks off the palace flies instead of falling.
    if (
      !b.grounded && !s.autoOff && b.vel.y < 0
      && airTime >= t.glideAutoFallT && airBelow >= t.glideAutoHeight
    ) {
      return deployGlide(b, carry, st.stamina, st.tired, airTime, true);
    }

    return mk(carry, {
      pos: b.pos,
      vel: b.vel,
      yaw: b.yaw,
      grounded: b.grounded,
      wading: b.wading,
      mode: MODES.WALK,
      stamina: st.stamina,
      tired: st.tired,
      airTime,
      latchLock,
      // A deliberately folded canopy stays folded until the feet touch down.
      // Without this the auto-canopy re-opens what the player just closed and
      // the fold button does nothing.
      autoOff: b.grounded ? false : s.autoOff,
    });
  }

  // ── CLIMB ──────────────────────────────────────────────────────────────

  function stepClimb(s, input, dt) {
    const wallX = s.wall ? s.wall.x : 0;
    const wallZ = s.wall ? s.wall.z : 0;
    const carry = s; // see stepWalk: the sim clock is advanced once, in step()

    // Re-read the face every frame so a curving cliff steers the climber.
    const n = faceNormal(s.pos.x, s.pos.z, wallX, wallZ);
    const hl = Math.hypot(n[0], n[2]);
    const walkable = n[1] >= slopeCos || hl < 1e-6;

    // Stick input, resolved into the wall's own frame:
    //   up   = pushing INTO the face (the inward horizontal direction)
    //   lat  = sliding along it (the shimmy)
    const ix = input.x || 0;
    const iz = input.y || 0;
    const up = ix * -wallX + iz * -wallZ;
    const lat = ix * -wallZ + iz * wallX;
    const active = Math.abs(up) + Math.abs(lat) > 0.05;
    // A shimmy is any frame where the sideways intent dominates. It is cheaper
    // than hauling, and it is its own animation, so the rig needs to know.
    const shimmying = Math.abs(lat) > 0.25 && Math.abs(lat) > Math.abs(up);

    // Jump off: a real hop away from the rock, and the lock stops the still-held
    // stick from re-latching on the very next frame.
    if (input.jump) {
      return releaseClimb(
        carry, t.wallJumpOut, t.jumpV * t.wallJumpUp,
        s.stamina - t.staminaClimbJump, null,
      );
    }

    let cost = t.staminaClimbHold;
    if (active) cost = shimmying ? t.staminaClimbSide : t.staminaClimbMove;
    const pool = s.stamina - cost * dt;
    if (pool <= 0) {
      // THE SO-CLOSE GRACE. Out of puff — but if the lip of this face is within
      // arm's reach, the child made it. One free mantle per latch (`grace`),
      // launched from the top of the remaining face rather than from here, so
      // the pop lands on the ledge and not halfway up the wall.
      if (!s.grace) {
        const left = faceLeft(s, wallX, wallZ, t.graceRise);
        if (left < Infinity) {
          const m = beginMantle(
            { ...carry, stamina: 0, tired: true },
            wallX, wallZ, { rise: left, free: true },
          );
          if (m) return m;
        }
      }
      // No lip in reach: peel off gently. A small push, no launch — the fall is
      // the consequence, and the walk controller (or the auto-canopy) lands it.
      return releaseClimb(carry, t.wallJumpOut * 0.35, 0, 0, EVENTS.SPENT);
    }
    const st = settleStamina(pool, s.tired);
    const climbT = s.climbT + dt;
    const shimmyEvent = shimmying && Math.abs(s.shimmy) <= 0.25 ? EVENTS.SHIMMY : null;

    // Already standing on ground the walk controller can hold? Only true at the
    // bottom of a face (the top is handled after the move, as a mantle).
    if (walkable && up <= 0) {
      const g = groundY(s.pos.x, s.pos.z);
      return mk(carry, {
        pos: { x: s.pos.x, y: g, z: s.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        grounded: true,
        wading: collisionWorld.isWater(s.pos.x, s.pos.z),
        mode: MODES.WALK,
        stamina: st.stamina,
        tired: st.tired,
      });
    }
    if (walkable && up > 0) {
      const m = beginMantle({ ...carry, stamina: st.stamina, tired: st.tired }, wallX, wallZ);
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
        { ...carry, pos: { x: nx2, y: y2, z: nz2 }, stamina: st.stamina, tired: st.tired },
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

    return mk(carry, {
      pos: { x: nx2, y: y2, z: nz2 },
      vel: { x: (nx2 - s.pos.x) / dt, y: (y2 - s.pos.y) / dt, z: (nz2 - s.pos.z) / dt },
      yaw: Math.atan2(-outX, -outZ),
      grounded: false,
      wading: false,
      mode: MODES.CLIMB,
      stamina: st.stamina,
      tired: st.tired,
      wall: { x: outX, z: outZ },
      climbT,
      shimmy: shimmying ? clamp(lat, -1, 1) : 0,
      grace: s.grace,   // one so-close rescue per latch, and enterClimb clears it
      event: shimmyEvent,
    });
  }

  // ── MANTLE ─────────────────────────────────────────────────────────────

  /**
   * The ledge pop. Uninterruptible on purpose: once a child has earned the top
   * of a cliff, no stray input takes it away from them. y leads the horizontal
   * (finished at 60% of the clip) so the body rises THEN slides in, which is
   * what makes it read as climbing over an edge rather than sliding through it.
   */
  function stepMantle(s, input, dt) {
    const carry = s; // see stepWalk: the sim clock is advanced once, in step()
    const m = s.mantle;
    const nt = m.t + dt;
    const p = clamp(nt / t.mantleTime, 0, 1);
    if (p >= 1) {
      const g = groundY(m.to.x, m.to.z);
      return mk(carry, {
        pos: { x: m.to.x, y: g, z: m.to.z },
        vel: { x: 0, y: 0, z: 0 },
        grounded: true,
        wading: collisionWorld.isWater(m.to.x, m.to.z),
        mode: MODES.WALK,
      });
    }
    const eh = smoothstep(p);
    const ev = smoothstep(p / 0.6);
    const x = m.from.x + (m.to.x - m.from.x) * eh;
    const z = m.from.z + (m.to.z - m.from.z) * eh;
    const y = m.from.y + (m.to.y - m.from.y) * ev;
    return mk(carry, {
      pos: { x, y, z },
      vel: { x: (x - s.pos.x) / dt, y: (y - s.pos.y) / dt, z: (z - s.pos.z) / dt },
      grounded: false,
      wading: false,
      mode: MODES.MANTLE,
      wall: s.wall,
      mantle: { t: nt, from: m.from, to: m.to },
      grace: s.grace,
    });
  }

  // ── GLIDE ──────────────────────────────────────────────────────────────

  function stepGlide(s, input, dt) {
    const carry = s; // see stepWalk: the sim clock is advanced once, in step()
    // Tap jump again to fold the canopy — the only way to cancel a glide short
    // of landing, and it hands the body straight back to gravity.
    if (input.jump) {
      return mk(carry, {
        pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        vel: { x: s.vel.x, y: s.vel.y, z: s.vel.z },
        grounded: false,
        wading: false,
        mode: MODES.WALK,
        airTime: s.airTime + dt,
        latchLock: t.climbLatchLock,
        autoOff: true,
      });
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

    // THERMALS. A rising column simply raises the descent rate the canopy is
    // easing toward; strong enough lift makes that target positive and the
    // glider CLIMBS. Ember's vents are how you cross the island without ever
    // touching the ground, which is the whole reward this ability exists for.
    const lift = liftAt(s.pos.x, s.pos.y, s.pos.z, s.simT);
    const sinkTarget = (diving ? t.glideDiveFall : t.glideFall) + lift;
    let vy = approach(s.vel.y, sinkTarget, (lift > 0 ? t.thermalAccel : t.glideVyAccel) * dt);

    let yaw = s.yaw;
    const hs = Math.hypot(vx, vz);
    if (hs > 0.05) yaw = turnToward(yaw, vx / hs, vz / hs, dt);

    const moved = collisionWorld.resolveMove(s.pos, { x: vx * dt, z: vz * dt }, PLAYER_RADIUS);
    let px = moved.pos.x;
    let pz = moved.pos.z;
    let hvx = vx;
    let hvz = vz;

    // THE FLARE. Inside the last glideFlareHeight metres the sink rate is eased
    // to a third, so every landing is a soft settle with the canopy billowing
    // — the flourish. Nobody ever hits the deck at full descent.
    const gNow = groundY(s.pos.x, s.pos.z);
    if (s.pos.y - gNow < t.glideFlareHeight && vy < 0) vy *= 0.34;

    const y = s.pos.y + vy * dt;
    // Same airborne wall rule the walk controller uses: never clip sideways
    // into a hillside just because you are flying.
    if (groundY(px, pz) > y + AIR_WALL_EPS) {
      px = s.pos.x;
      pz = s.pos.z;
      hvx = 0;
      hvz = 0;
    }

    // The canopy is a rest: the pool refills while you fly, so a long glide
    // pays for the next climb.
    const st = settleStamina(s.stamina + t.staminaRegenGlide * dt, s.tired);

    const g = groundY(px, pz);
    // Splashdown: deep water catches you, the canopy folds, you are swimming.
    if (depthAt(px, pz) >= t.swimDepth && y <= WATER_Y + t.swimEntryAbove) {
      return enterSwim(
        { ...carry, pos: { x: px, y, z: pz }, vel: { x: hvx, y: 0, z: hvz }, yaw },
        st.stamina, st.tired,
      );
    }
    if (y <= g) {
      // Touchdown folds the glider away. No fall damage: this is a landing, and
      // the flare above means it is a landing with speed still on — the hero
      // runs it out rather than stopping dead.
      return mk(carry, {
        pos: { x: px, y: g, z: pz },
        vel: { x: hvx * t.glideFlareSpeed, y: 0, z: hvz * t.glideFlareSpeed },
        yaw,
        grounded: true,
        wading: collisionWorld.isWater(px, pz),
        mode: MODES.WALK,
        stamina: st.stamina,
        tired: st.tired,
        event: EVENTS.TOUCHDOWN,
      });
    }

    return mk(carry, {
      pos: { x: px, y, z: pz },
      vel: { x: hvx, y: vy, z: hvz },
      yaw,
      grounded: false,
      wading: false,
      mode: MODES.GLIDE,
      stamina: st.stamina,
      tired: st.tired,
      airTime: s.airTime + dt,
      lift,
      event: lift >= t.thermalNoticeAt && s.lift < t.thermalNoticeAt ? EVENTS.THERMAL : null,
    });
  }

  // ── SWIM ───────────────────────────────────────────────────────────────

  function stepSwim(s, input, dt) {
    const carry = s; // see stepWalk: the sim clock is advanced once, in step()
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
    //
    // `towing` LATCHES. Tying the tow to `stamina <= 0` instead was a bug with
    // a very quiet failure mode: the pool refills at staminaRegenSwim, so the
    // condition was false again one frame later and the help lasted 16 ms. The
    // latch only clears when the feet are back on the seabed, which is the
    // actual promise — running out of puff offshore ALWAYS ends on a beach.
    const towing = s.towing || s.stamina <= 0;
    if (towing) {
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
      return mk(carry, {
        pos: { x: px, y: g, z: pz },
        vel: { x: vx, y: 0, z: vz },
        yaw,
        grounded: true,
        wading: collisionWorld.isWater(px, pz),
        mode: MODES.WALK,
        stamina: st.stamina,
        tired: st.tired,
        event: EVENTS.SHORE,
      });
    }

    // Diving is optional and always reversible: let go (or tap jump) and you
    // float back to the surface on your own. There is no breath meter, because
    // a breath meter is a death timer with a friendly hat on.
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

    const under = dive >= t.submergeAt;
    let event = null;
    if (under && !s.underwater) event = EVENTS.SUBMERGE;
    else if (!under && s.underwater) event = EVENTS.SURFACE;

    return mk(carry, {
      pos: { x: px, y, z: pz },
      vel: { x: vx, y: dt > 1e-9 ? (y - s.pos.y) / dt : 0, z: vz },
      yaw,
      grounded: false,
      wading: false,
      mode: MODES.SWIM,
      stamina: st.stamina,
      tired: st.tired,
      swimT,
      dive,
      towing,
      underwater: under,
      event,
    });
  }

  // ── Public surface (drop-in for createController) ──────────────────────

  /** Fresh state with feet on the ground — or afloat, if that is deep water. */
  function spawnState(opts = {}) {
    const b = base.spawnState(opts);
    const s = mk(b, {});
    if (depthAt(b.pos.x, b.pos.z) >= t.swimDepth) {
      return { ...enterSwim(s, t.staminaMax, false), event: null };
    }
    return s;
  }

  /**
   * Advance one frame. Returns a NEW state; `state` and `input` are read-only.
   * input: { x, y (world-space move vector, y maps to z), jump, run, dive }.
   */
  function step(state, input, dt) {
    const n = normalize(state);
    // ONE clock advance for the whole step. Every branch below then reads
    // `s.simT` as "now", and no branch has to remember to tick it — which is
    // what keeps a thermal sampled during a glide and a bob sampled during a
    // swim on the same timeline across a mode change.
    const s = { ...n, simT: n.simT + dt };
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
