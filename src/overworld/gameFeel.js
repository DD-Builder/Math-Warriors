/**
 * gameFeel — the layer that turns "the character TRANSLATES" into "the
 * character MOVES".
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * controller.js is correct and it is not fun. Read its step(): the horizontal
 * velocity is recomputed from the stick EVERY frame (`hvx = nx * s`), so the
 * body has no momentum at all — release the stick mid-sprint and the hero is
 * stationary on the very next frame. Jump is one constant impulse under one
 * constant gravity, so every jump is the same jump. A steep face is a wall.
 * A landing is a co-ordinate change. Nothing in the file knows how fast you
 * were going a moment ago, and *that* — not the art — is the difference
 * between this and Odyssey, where the first thirty seconds in an empty field
 * are already a good time.
 *
 * controls3d.js added a mass filter, but it filters a SCALAR "fraction of run
 * speed" in input space, upstream of the world. It cannot know about slopes,
 * it cannot survive a landing, and it has one accel pair for every surface.
 *
 * So this module owns movement. It is the successor to controller.step's
 * horizontal+vertical rules, not a decoration on them:
 *
 *   MOMENTUM      speed and heading are STATE, integrated by acceleration and
 *                 friction curves that differ per surface (ground/air/water/
 *                 ice). A run into a jump carries across the launch, across
 *                 the whole arc, and across the landing.
 *   TURNING       the turn rate falls off with speed, so a standing hero
 *                 pivots instantly and a sprinting hero carves; slam the
 *                 stick backwards at speed and you get a real SKID — the body
 *                 turns while the feet keep going, throwing dust.
 *   JUMP          variable height by hold, reduced gravity through the apex
 *                 (the single biggest "feels good" trick in the genre), a
 *                 fast-fall, coyote time, input buffering, and a spin double
 *                 jump as the skill expression.
 *   LANDING       squash, dust, a camera dip proportional to the fall, and a
 *                 grace window where friction is suspended so a landing never
 *                 eats the speed you earned.
 *   SLOPES        steep ground SLIDES, with steering; downhill gives speed.
 *   LEDGES        a jump that just barely misses is caught and mantled.
 *                 Forgiveness is what makes platforming generous.
 *   PRESENTATION  squash/stretch, FOV kick, speed lines and a papercut-scrap
 *                 motion trail, all driven off the same state.
 *
 * ── WHY IT DOES NOT WRAP controller.step ───────────────────────────────────
 *
 * traversal.js wraps it, correctly, because climbing is genuinely a different
 * mode layered on top of walking. This is not another mode: it REPLACES the
 * two rules controller.step gets wrong for a platformer — "steep ground is a
 * wall" (we want a slide) and "gravity is one constant" (we want an apex).
 * Delegating and then rewriting both would be two implementations of walking
 * pretending to be one. What is shared instead is the *contract*: the same
 * collision world, the same PLAYER_RADIUS, the same DEFAULT_TUNING numbers,
 * the same pure `{ spawnState, step }` shape, and a state object that is a
 * strict SUPERSET of controller's, so heroRig, the save writer and the camera
 * keep working unchanged.
 *
 * ── DETERMINISM ────────────────────────────────────────────────────────────
 *
 * step() is pure: it never mutates its inputs and keeps no closure state, so
 * an identical input sequence replays to an identical state. Every timer is
 * in SECONDS accumulated on the fixed step (renderer.js: 1/60), never in
 * wall-clock milliseconds, so the screenshot harness and the tests reproduce
 * exactly. The FX pool uses a hashed integer per slot, never Math.random.
 *
 * ── SHAPE ──────────────────────────────────────────────────────────────────
 *
 *   PURE (node-testable):
 *     FEEL              THE tuning table — one object, every number annotated
 *     surfaceKey        which accel/friction set is in force
 *     turnRateFor       speed -> rad/s of heading authority
 *     classifyTurn      'pivot' | 'arc' | 'skid'
 *     gravityScale      the rise/apex/fall/fast-fall gravity curve
 *     accelStep         one frame of the speed integrator
 *     resolveJumpFeel   coyote + buffer + air jumps
 *     landingImpact     fall speed -> squash / dip / dust
 *     slopeResponse     normal + heading -> slide + along-slope accel
 *     fovKickFor / speedLinesFor / trailRate
 *     createGameFeel    the controller itself
 *
 *   IMPURE (three):
 *     createFeelFx      dust puffs, scrap trail, speed lines — 3 draw calls
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { DEFAULT_TUNING, PLAYER_RADIUS } from './controller.js';
import { papercutMaterial } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Wrap into (-PI, PI] so every turn takes the short way round. */
export function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** 3t^2-2t^3 — flat at both ends, which is what makes a mantle land clean. */
const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

// ═══════════════════════════════════════════════════════════════════════════
// THE TUNING TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ONE object. Every constant is annotated with the FEEL it buys, not with
 * what it does — if a playtest says "it feels floaty" or "it feels like ice",
 * the fix is a number in here and nowhere else.
 *
 * Times are SECONDS (accumulated on the fixed step — never wall clock).
 * Speeds are m/s, accelerations m/s^2, angles radians unless a name says deg.
 */
export const FEEL = {
  // Longest step the integrator will honour. A backgrounded tab hands the
  // loop a half-second dt; without this the hero teleports through a wall.
  maxDt: 1 / 30,

  // ── SPEED ────────────────────────────────────────────────────────────────
  // Seeded from controller.js so there is exactly one walk/run pair in the
  // codebase and a change there moves the whole character.
  walkSpeed: DEFAULT_TUNING.speed,      // 6.0 m/s — a purposeful walk
  runSpeed: DEFAULT_TUNING.runSpeed,    // 8.5 m/s — the sprint the stick asks for
  speedCap: 13.5,        // m/s HARD ceiling. Downhill gain and skid exits can
                         // push past runSpeed — that overspeed is the reward
                         // for reading the terrain — but never past a speed a
                         // child can still steer at this camera distance.
  stopSpeed: 0.05,       // m/s below which the body is simply stopped, so a
                         // released stick settles instead of creeping forever

  // ── SURFACES ─────────────────────────────────────────────────────────────
  // Four distinct personalities. `accel` climbs toward the stick's target,
  // `brake` fights it when the stick asks for LESS or for the other way,
  // `drag` is the passive friction with no stick at all, `turn` scales the
  // heading authority, `top` scales the maximum speed this surface allows.
  surface: {
    ground: {
      accel: 55,  // 0 -> full sprint in ~0.155 s. Slower reads as ice; faster
                  // reads as a teleport and kills the sense of weight. This is
                  // THE momentum model — controls3d's input shaping is a fast
                  // digital-edge filter on top (accel 11 / decel 26), so these
                  // numbers must carry the whole feel alone. When both were
                  // slow the two filters STACKED: 0.35 s to full speed and a
                  // 1.57 m stop slide, measured on the build (the D1-F
                  // "abysmal"). One mass, one place, and it is this table.
      brake: 70,  // sprint -> 0 in ~0.12 s. This is the number that decides
                  // whether a child can stop at the edge of a platform.
      drag: 60,   // stick released at a sprint: coasts ~0.60 m (v²/2a) over
                  // ~0.14 s — a visible plant, never a slide, and inside the
                  // 0.5–1.6 m band the momentum spec pins. The old 34 coasted
                  // 1.06 m of ITS OWN on top of the input filter's tail
                  // (1.57 m measured total); a five-year-old walked off
                  // ledges they had released the stick before.
      turn: 1.00,
      top: 1.00,
    },
    air: {
      accel: 15,  // mid-air steering is a NUDGE, not a rethink — you commit
                  // to a jump, which is what makes the jump a decision
      brake: 4,
      drag: 0.9,  // almost nothing: momentum is the whole point of a gap
      turn: 0.45, // you cannot pirouette in the air; heading barely moves
      top: 1.00,
    },
    water: {
      accel: 14,  // wading is heavy off the mark...
      brake: 20,
      drag: 11,   // ...and the water stops you for free
      turn: 0.75,
      top: 0.45,  // matches controller.js's WADE_SPEED_MULT exactly, so
                  // walking into the shallows does not change speed twice
    },
    ice: {
      accel: 6.5, // a quarter of the grip: the stick becomes a suggestion
      brake: 2.5,
      drag: 1.1,  // and you keep going for about four metres
      turn: 0.30,
      top: 1.06,  // ice is slightly FASTER than dirt — sliding is a shortcut,
                  // never only a punishment (ages 5-10: hazards must be toys)
    },
  },

  // ── TURNING ──────────────────────────────────────────────────────────────
  pivotTurn: 22,        // rad/s at a standstill. Effectively instant: nudging
                        // a new direction while still must never feel laggy.
  sprintTurn: 7.0,      // rad/s at full run — a wide, weighty arc. A sprint
                        // that turns on a pin has no mass.
  turnSpeedRef: 8.5,    // m/s at which sprintTurn is reached (= runSpeed)
  turnCurve: 0.8,       // <1 keeps authority high through the low-mid speeds,
                        // so only a real sprint feels committed

  skidAngle: 140 * DEG, // stick this far from your heading = a REVERSAL, not
                        // a turn. 140 deg means a deliberate slam, never a
                        // sloppy diagonal.
  skidMinSpeed: 5.4,    // and you must actually be moving. Below this the
                        // reversal is just a pivot — no skid, no dust.
  skidTime: 0.30,       // s of visible slide. Long enough to SEE, short
                        // enough that it never feels like lost control.
  skidBrake: 22,        // m/s^2 bled while sliding: the feet are scrubbing
  skidYawRate: 13,      // rad/s the BODY turns during the slide. Faster than
                        // the heading changes — that mismatch IS the skid:
                        // you are facing the new way while still going the old.
  skidExitSpeed: 3.2,   // m/s handed back when the slide resolves, so a
                        // 180 launches you instead of dumping you at zero
  skidDust: 0.85,       // dust burst strength at the start of a slide

  // ── JUMP ─────────────────────────────────────────────────────────────────
  gravity: 24,          // m/s^2 base. Everything below is a MULTIPLIER on it,
                        // which is the whole trick: one arc, four gravities.
  jumpV: 9.2,           // m/s launch. ~1.5 m at full hold — clears the props
                        // and reads as athletic without being a moon jump.
  jumpSpeedBonus: 0.16, // + this x horizontal speed added to the launch. A
                        // running jump goes visibly HIGHER as well as further:
                        // speed is rewarded twice, so running is worth it.
  riseGravity: 0.86,    // while rising WITH the button held: a lighter climb,
                        // so a full-hold jump reads as an effort of will
  cutGravity: 2.30,     // release early and the rise is cut hard. This is
                        // variable jump height — a tap is ~40% of a hold.
  holdMaxT: 0.22,       // s past which holding buys nothing more. Caps the
                        // arc so the ceiling of the jump is knowable.
  apexBand: 2.4,        // m/s: |vy| under this is "the apex"...
  apexGravity: 0.42,    // ...and gravity is nearly halved through it. THE
                        // hang time. This one number is the largest single
                        // contributor to "the jump feels good" — it buys the
                        // player a beat at the top to aim the landing.
  apexMaxT: 0.28,       // s cap on the hang, so nobody can hover
  fallGravity: 1.18,    // coming down is HEAVIER than going up. Asymmetric
                        // gravity is why a good jump feels snappy, not floaty.
  fastFallGravity: 2.6, // pull the stick down mid-fall and drop like a stone.
                        // A player-controlled landing time is real expression.
  fastFallMinVy: 0.5,   // and it only arms once past the apex, so a fast-fall
                        // input can never cancel your own jump on frame two
  maxFall: 26,          // m/s terminal. Bounded so the landing dip is bounded.

  coyoteT: 0.12,        // s after walking off a ledge in which jump still
                        // works. Below ~0.10 s children report "it didn't jump".
  bufferT: 0.15,        // s before landing in which a jump press is REMEMBERED
                        // and fires on touchdown. This is what makes chaining
                        // hops possible instead of a rhythm test.
  airJumps: 1,          // one mid-air jump: the skill expression...
  airJumpV: 8.0,        // ...slightly weaker than the ground jump, so the
                        // double is a rescue and a flourish, not a better jump
  airJumpMinT: 0.08,    // s airborne before it arms — a double-tap on the
                        // ground can never eat the second jump instantly
  airJumpKeep: 0.55,    // fraction of DOWNWARD velocity forgiven on the air
                        // jump: saving a botched fall must actually save it
  spinTime: 0.50,       // s of spin animation the air jump requests

  // ── LANDING ──────────────────────────────────────────────────────────────
  landSoft: 3.0,        // m/s of impact below which a landing is silent —
                        // stepping off a kerb must not squash the hero
  landHard: 14,         // m/s at which squash, dip and dust are all maxed
  squashDecay: 4.6,     // 1/s — the squash pops back in about a fifth of a
                        // second. Slower looks like damage, not impact.
  stretchAir: 0.16,     // peak vertical stretch while falling fast. Small:
                        // papercut is layered card, it does not deform much.
  dipMax: 0.42,         // m the camera drops on the hardest landing. Any more
                        // and the horizon leaves frame, which reads as a hit.
  dipSpring: 46,        // stiffness of the dip's return...
  dipDamp: 11,          // ...damped just under critical, so it settles with
                        // one small overshoot — a breath, not a bounce
  landGraceT: 0.12,     // s after touchdown in which passive drag is
                        // SUSPENDED. A run -> jump -> land -> run keeps every
                        // metre per second it earned; landing never taxes you.
  dustMin: 4.5,         // m/s of impact that first throws a dust puff

  // ── SLOPES ───────────────────────────────────────────────────────────────
  slideDeg: 46,         // deg past which ground is a SLIDE. Deliberately
                        // under controller.js's 50 deg wall limit, so the band
                        // between them is slide-able rather than a hard stop.
  slideAccel: 15,       // m/s^2 downhill once sliding — a real commitment
  slideControl: 0.35,   // steering authority kept while sliding: you can aim
                        // the slide, you cannot cancel it. Aiming is the fun.
  slideDrag: 2.0,       // gentle scrub so a slide reaches a terminal speed
  slideDust: 0.5,       // strength of each puff thrown while sliding
  dustInterval: 0.075,  // s between CONTINUOUS puffs (slides only). Impacts
                        // are instantaneous and unthrottled; without this gate
                        // a slide empties the whole pool in seven frames and
                        // the hero vanishes into a fog of their own making.
  downhillGain: 7.0,    // m/s^2 x (downhill component of heading). Running
                        // down a hill FEELS fast because it is fast.
  uphillDrag: 9.0,      // m/s^2 x (uphill component). A climb costs you, so
                        // the terrain is something you read, not wallpaper.

  // ── LEDGE GRAB / MANTLE ──────────────────────────────────────────────────
  ledgeReach: 0.85,     // m ahead of the body the hands search. About one
                        // forearm past PLAYER_RADIUS.
  ledgeMinRise: 0.25,   // m above the feet: below this you would have landed
  ledgeMaxRise: 1.55,   // m above the feet: above this it is a cliff, not a
                        // ledge, and pretending otherwise steals the climb
  ledgeMaxVy: -1.0,     // m/s: must be DESCENDING. A grab on the way up would
                        // eat the jump the player is still enjoying.
  ledgeMinSpeed: 1.2,   // m/s of momentum that counts as "reaching for it"
                        // when the stick is NOT being held — a passenger
                        // drifting past a lip should not be hauled onto it
  ledgeClear: 0.45,     // m of headroom needed above the lip, so the mantle
                        // never pops the hero inside geometry
  mantleTime: 0.26,     // s of pull-up. Short: forgiveness should feel like
                        // the jump worked, not like a cutscene.
  mantleExitSpeed: 2.4, // m/s handed back on top, aimed the way you were going
  mantleCooldown: 0.30, // s before another grab can latch — stops a chatter
                        // loop on a staircase of tiny lips

  // ── SPEED PRESENTATION ───────────────────────────────────────────────────
  fovStart: 0.72,       // fraction of runSpeed at which the FOV starts to open
  fovDeg: 6.5,          // deg of extra FOV at full sprint. Big enough to feel
                        // in the gut, small enough that nothing warps.
  fovEaseUp: 3.0,       // 1/s toward the kick — arrives over ~0.3 s so the
                        // widening is felt rather than seen
  fovEaseDown: 5.0,     // and closes faster, so stopping feels like braking
  lineStart: 0.85,      // fraction of runSpeed at which speed lines appear.
                        // Later than the FOV: lines are the TOP of the range.
  lineEase: 5.0,        // 1/s ease of the line intensity
  trailSpeed: 7.0,      // m/s above which papercut scraps shed off the hero
  trailInterval: 0.055, // s between scraps at full speed — a legible dotted
                        // ribbon, not a blur (this world has no motion blur)
  trailLife: 0.42,      // s a scrap survives

  // ── FX POOLS (three) ─────────────────────────────────────────────────────
  fx: {
    dustMax: 40,        // instances. A landing spends up to 10 of them.
    dustLife: 0.55,     // s
    dustRise: 0.9,      // m/s the puff drifts up as it expands
    dustSpread: 1.5,    // m/s outward
    dustSize: 0.34,     // m radius at birth
    dustGrow: 2.6,      // x size by the end of its life
    trailMax: 28,       // instances
    trailSize: 0.16,    // m
    trailSpin: 5.0,     // rad/s a scrap tumbles
    trailDrift: 0.55,   // m/s it falls away behind you
    lineCount: 16,      // speed-line slivers around the camera ring
    lineRadius: 1.35,   // m from the eye axis at z = -lineDist
    lineDist: 2.2,      // m in front of the camera
    lineLength: 0.95,   // m of sliver at full intensity
    lineWidth: 0.022,   // m
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PURE CURVES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Which of the four personalities is in force this frame.
 * Airborne beats everything (you cannot be on ice mid-jump), then ice, then
 * water — a frozen pond is ice, not water, which is what a child expects.
 */
export function surfaceKey({ grounded = true, ice = false, water = false } = {}) {
  if (!grounded) return 'air';
  if (ice) return 'ice';
  if (water) return 'water';
  return 'ground';
}

/** The surface record, always defined (unknown keys fall back to ground). */
export function surfaceOf(key, t = FEEL) {
  return t.surface[key] || t.surface.ground;
}

/**
 * Heading authority in rad/s at a given speed.
 *
 * Standing still you snap; at a sprint you carve. The curve is what makes a
 * single stick feel like two different characters without a mode switch.
 */
export function turnRateFor(speed, surfKey = 'ground', t = FEEL) {
  const n = clamp01(Math.abs(speed) / Math.max(1e-6, t.turnSpeedRef));
  const k = Math.pow(n, t.turnCurve);
  const base = t.pivotTurn + (t.sprintTurn - t.pivotTurn) * k;
  return base * surfaceOf(surfKey, t).turn;
}

/**
 * Is this stick input a pivot, an arc, or a full skid-turn?
 *
 * `diff` is the signed angle from the current HEADING to the stick, already
 * wrapped. Only a grounded body at speed can skid — a skid in mid-air is a
 * loss of control, and this game never takes control away.
 */
export function classifyTurn(diff, speed, grounded = true, t = FEEL) {
  const a = Math.abs(diff);
  if (grounded && a >= t.skidAngle && speed >= t.skidMinSpeed) return 'skid';
  if (a < 0.35 || speed < 0.6) return 'pivot';
  return 'arc';
}

/**
 * One frame of the speed integrator.
 *
 * Three regimes, and the distinction is the whole feel: pushing UP toward the
 * target uses `accel`, pushing DOWN toward a lower target uses `brake` (an
 * active deceleration — the player asked to slow), and no input at all uses
 * `drag` (passive friction, much gentler, which is what preserves momentum).
 */
export function accelStep(speed, target, surfKey, dt, t = FEEL, opts = {}) {
  const s = surfaceOf(surfKey, t);
  if (target > speed) return Math.min(target, speed + s.accel * dt);
  if (target > 0) return Math.max(target, speed - s.brake * dt);
  // No stick. During the post-landing grace window friction is suspended
  // entirely, so touching down never costs you the run-up you earned.
  if (opts.grace) return speed;
  return Math.max(0, speed - s.drag * dt);
}

/**
 * THE gravity curve — the four-regime multiplier that every good platformer
 * has and every mediocre one lacks.
 *
 *   rise + held      light      the jump is an act of will
 *   rise + released  very heavy variable height: a tap is a small hop
 *   apex             lightest   the HANG — a beat at the top to aim
 *   fall             heavy      snappy, never floaty
 *   fast-fall        heaviest   the player decides when to land
 *
 * @param {number} vy        current vertical velocity (m/s, up positive)
 * @param {object} o
 *   held      jump button still down
 *   fastFall  player is asking to drop
 *   apexT     seconds already spent in the apex band (caps the hang)
 */
export function gravityScale(vy, o = {}, t = FEEL) {
  const inApex = Math.abs(vy) < t.apexBand && (o.apexT || 0) < t.apexMaxT;
  if (inApex) return t.apexGravity;
  if (vy > 0) return o.held ? t.riseGravity : t.cutGravity;
  if (o.fastFall && vy < -t.fastFallMinVy) return t.fastFallGravity;
  return t.fallGravity;
}

/**
 * Coyote time, input buffering and air jumps, in one decision.
 *
 * Returns 'ground' | 'air' | null. The caller MUST clear the buffer on a
 * non-null answer — an unconsumed press plus a still-open coyote window
 * serves the same intent twice and hands out a free double jump.
 *
 * @param {object} s
 *   bufferT   seconds since the press (null/undefined = nothing asked)
 *   coyoteT   seconds since the feet last had ground
 *   grounded  feet are on something right now
 *   airT      seconds airborne (arms the air jump)
 *   airJumps  air jumps already spent this flight
 */
export function resolveJumpFeel(s = {}, t = FEEL) {
  const asked = s.bufferT != null && s.bufferT <= t.bufferT;
  if (!asked) return null;
  if (s.grounded || (s.coyoteT != null && s.coyoteT <= t.coyoteT)) return 'ground';
  if ((s.airJumps || 0) < t.airJumps && (s.airT || 0) >= t.airJumpMinT) return 'air';
  return null;
}

/**
 * Fall speed -> the three landing reactions, all on the same 0..1 ramp so
 * they can never disagree about how hard the landing was.
 *
 * @param {number} impact  m/s of downward speed at touchdown (positive)
 */
export function landingImpact(impact, t = FEEL) {
  const n = clamp01((impact - t.landSoft) / Math.max(1e-6, t.landHard - t.landSoft));
  return {
    strength: n,
    squash: n,                        // 0..1 into the rig's squash channel
    dip: n * t.dipMax,                // metres of camera drop
    dust: impact >= t.dustMin ? Math.max(n, 0.25) : 0,
  };
}

/**
 * How the ground under the feet answers a heading.
 *
 * @param {number[]} normal  surface normal [x, y, z]
 * @param {number} hx        unit heading x
 * @param {number} hz        unit heading z
 * @returns {{ slide:boolean, steepness:number, along:number,
 *             downX:number, downZ:number }}
 *   along     m/s^2 of ALONG-HEADING acceleration from the grade (signed:
 *             positive downhill, negative uphill). This is the speed gain.
 *   downX/Z   unit horizontal downhill direction (0,0 on the flat)
 */
export function slopeResponse(normal, hx, hz, t = FEEL) {
  const ny = normal ? normal[1] : 1;
  const gx = normal ? normal[0] : 0;
  const gz = normal ? normal[2] : 0;
  const hl = Math.hypot(gx, gz);
  const downX = hl > 1e-9 ? gx / hl : 0;   // the normal leans UPHILL, so its
  const downZ = hl > 1e-9 ? gz / hl : 0;   // horizontal part points downhill
  const steepness = clamp01(1 - ny);       // 0 flat .. 1 vertical
  const slide = ny < Math.cos(t.slideDeg * DEG);
  // dot > 0 means the heading points downhill.
  const dot = hx * downX + hz * downZ;
  const grade = hl; // sin(angle): 0 flat, 1 vertical
  const along = dot >= 0
    ? dot * grade * t.downhillGain
    : dot * grade * t.uphillDrag;
  return { slide, steepness, along, downX, downZ };
}

/** Sprint FOV kick target, 0..1. Zero below fovStart, 1 at full run. */
export function fovKickFor(speed, t = FEEL) {
  const n = speed / Math.max(1e-6, t.runSpeed);
  return clamp01((n - t.fovStart) / Math.max(1e-6, 1 - t.fovStart));
}

/** Speed-line intensity target, 0..1. Arms later than the FOV on purpose. */
export function speedLinesFor(speed, t = FEEL) {
  const n = speed / Math.max(1e-6, t.runSpeed);
  return clamp01((n - t.lineStart) / Math.max(1e-6, 1 - t.lineStart));
}

/** Seconds between shed scraps at this speed; Infinity below the threshold. */
export function trailRate(speed, t = FEEL) {
  if (speed < t.trailSpeed) return Infinity;
  const over = clamp01((speed - t.trailSpeed) / Math.max(1e-6, t.speedCap - t.trailSpeed));
  // Faster = denser, down to two thirds of the base interval.
  return t.trailInterval * (1 - 0.33 * over);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/** Airborne bodies may never clip sideways into terrain above this margin. */
const AIR_WALL_EPS = 0.01;

/** A fresh one-frame event record. Consumers read it and forget it. */
function noEvents() {
  return {
    jump: 0,        // >0 = launched this frame (the launch vy)
    airJump: 0,     // >0 = spin/double jump fired
    land: 0,        // >0 = touched down (0..1 strength)
    dust: 0,        // >0 = throw a dust puff (0..1 strength)
    skid: 0,        // >0 = a skid-turn started
    mantle: 0,      // >0 = a ledge grab latched
    slideOn: 0,     // >0 = a slope slide began
  };
}

/**
 * Build the feel controller.
 *
 * Drop-in for createController: the returned object has the same
 * `{ spawnState, step }` shape and its state is a strict superset of the
 * controller's, so every existing consumer (heroRig, the camera, the save
 * writer) reads the fields it already knows and ignores the rest.
 *
 * @param {ReturnType<import('./collision.js').createCollisionWorld>} collisionWorld
 *   May optionally expose `isIce(x, z)` — without it, nothing is ever icy.
 * @param {Partial<typeof FEEL & typeof DEFAULT_TUNING>} [tuning]
 * @param {{ base?: { step:Function, spawnState:Function } }} [opts]
 *   `base` is an optional traversal controller. When supplied, any state whose
 *   `mode` is not 'walk' (climb / mantle / glide / swim) is delegated to it
 *   untouched — this module owns the ground game, traversal owns the rest, and
 *   neither has to know the other's rules.
 */
export function createGameFeel(collisionWorld, tuning = {}, opts = {}) {
  // Nested surface records must merge per-surface, not be replaced wholesale.
  const t = {
    ...FEEL,
    ...tuning,
    surface: { ...FEEL.surface, ...(tuning.surface || {}) },
    fx: { ...FEEL.fx, ...(tuning.fx || {}) },
  };
  const base = opts.base || null;
  const stepUp = tuning.stepUp ?? DEFAULT_TUNING.stepUp;
  const wallCos = Math.cos((tuning.slopeLimitDeg ?? DEFAULT_TUNING.slopeLimitDeg) * DEG);
  const isIce = typeof collisionWorld.isIce === 'function'
    ? (x, z) => !!collisionWorld.isIce(x, z)
    : () => false;

  /** Fresh state with feet snapped to the ground under (x, z). */
  function spawnState({ x = 0, z = 0, yaw = 0 } = {}) {
    const y = collisionWorld.groundHeight(x, z);
    return {
      // ── controller.js contract (do not rename: heroRig + save read these) ─
      pos: { x, y, z },
      vel: { x: 0, y: 0, z: 0 },
      yaw,
      grounded: true,
      wading: collisionWorld.isWater(x, z),
      // ── momentum ─────────────────────────────────────────────────────────
      speed: 0,
      headX: Math.sin(yaw),
      headZ: Math.cos(yaw),
      surface: 'ground',
      // ── timers (seconds, fixed step) ─────────────────────────────────────
      airT: 0,
      coyoteT: 0,
      bufferT: null,
      holdT: 0,
      apexT: 0,
      graceT: 0,
      skidT: 0,
      slideT: 0,
      spinT: 0,
      mantleT: 0,
      mantleCd: 0,
      dustT: 0,
      airJumps: 0,
      jumpHeld: false,
      sliding: false,
      // ── ledge grab in progress (null = none) ─────────────────────────────
      ledge: null,
      // ── presentation channels ────────────────────────────────────────────
      squash: 0,      // 0..1 compress on landing (rig scale y down, xz up)
      stretch: 0,     // 0..1 elongate while falling fast
      camDip: 0,      // metres the eye should drop
      camDipV: 0,     // its spring velocity
      fovKick: 0,     // 0..1 -> FEEL.fovDeg of extra FOV
      speedLines: 0,  // 0..1 intensity
      trailT: 0,      // scrap shed timer
      trailSpawn: 0,  // scraps to shed THIS frame (integer)
      ev: noEvents(),
    };
  }

  /** Accept a bare controller state (or a half-written save) as a feel state. */
  function normalize(s) {
    if (s && typeof s.speed === 'number' && s.ev) return s;
    const fresh = spawnState({
      x: s?.pos?.x ?? 0, z: s?.pos?.z ?? 0, yaw: s?.yaw ?? 0,
    });
    if (s?.pos) fresh.pos = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    if (s?.vel) {
      fresh.vel = { x: s.vel.x, y: s.vel.y, z: s.vel.z };
      fresh.speed = Math.min(t.speedCap, Math.hypot(s.vel.x || 0, s.vel.z || 0));
      if (fresh.speed > 1e-5) {
        fresh.headX = s.vel.x / fresh.speed;
        fresh.headZ = s.vel.z / fresh.speed;
      }
    }
    if (typeof s?.grounded === 'boolean') fresh.grounded = s.grounded;
    return fresh;
  }

  /**
   * Advance one fixed step. Pure — `state` and `input` are read-only and a
   * NEW state object comes back.
   *
   * @param {object} state
   * @param {object} input
   *   x, z / y   WORLD-space move vector (magnitude 0..1 is the throttle).
   *              `y` is accepted as an alias for `z`, matching controller.js.
   *   run        select the run speed band
   *   jump       jump PRESS this frame (an edge; latch it upstream)
   *   jumpHeld   jump button still down (drives variable height). Absent =>
   *              treated as held, so a caller that only has an edge still
   *              gets a full-height jump rather than a permanent stub hop.
   *   fastFall   player is asking to drop (stick down / dedicated button)
   * @param {number} dt  seconds (renderer.js feeds a fixed 1/60)
   */
  function step(state, input, dt) {
    // Traversal owns anything that is not walking; do not fight it.
    if (base && state && typeof state.mode === 'string' && state.mode !== 'walk') {
      return base.step(state, input, dt);
    }

    const s = normalize(state);
    const d = clamp(dt || 0, 0, t.maxDt);
    const ev = noEvents();

    const px = s.pos.x;
    const py = s.pos.y;
    const pz = s.pos.z;

    // ── A mantle owns the frame ──────────────────────────────────────────
    // Once the hands are on the lip the pull-up plays out on a clock. It is
    // interpolated with a smoothstep so the pop has no velocity discontinuity
    // at either end — a linear mantle reads as a teleport.
    if (s.ledge) {
      return stepMantle(s, d, ev);
    }

    // ── Read the world under the feet ────────────────────────────────────
    const gyHere = collisionWorld.groundHeight(px, pz);
    const normal = collisionWorld.groundNormal(px, pz);
    const inWater = collisionWorld.isWater(px, pz);
    const onIce = isIce(px, pz);
    const grounded0 = s.grounded;
    const surf = surfaceKey({ grounded: grounded0, ice: onIce, water: inWater });
    const sr = surfaceOf(surf, t);

    // ── Stick -> target speed and target heading ─────────────────────────
    const ix = input.x || 0;
    const iz = input.z != null ? input.z : (input.y || 0);
    const mag = Math.hypot(ix, iz);
    const throttle = Math.min(mag, 1);
    const hasStick = mag > 1e-6;
    const bandSpeed = input.run ? t.runSpeed : t.walkSpeed;
    let target = hasStick ? bandSpeed * throttle * sr.top : 0;

    let headX = s.headX;
    let headZ = s.headZ;
    let speed = s.speed;
    let yaw = s.yaw;
    let skidT = Math.max(0, s.skidT - d);

    const slope = slopeResponse(normal, headX, headZ, t);
    const sliding = grounded0 && slope.slide;
    if (sliding && !s.sliding) ev.slideOn = 1;

    // Continuous-emitter clock. Only slides use it; every other dust burst in
    // this file is a one-frame impact and fires unthrottled.
    let dustT = sliding ? s.dustT + d : 0;
    let dustTick = false;
    if (dustT >= t.dustInterval) { dustT -= t.dustInterval; dustTick = true; }

    // ── Turning ──────────────────────────────────────────────────────────
    if (hasStick) {
      const tx = ix / mag;
      const tz = iz / mag;
      const stickAng = Math.atan2(tx, tz);
      if (speed <= 1e-5) {
        // From a standstill the first step goes exactly where the thumb
        // points. Sweeping there from a stale facing is the classic "the
        // controls are laggy" complaint and it is entirely avoidable.
        headX = tx; headZ = tz; yaw = stickAng;
      } else {
        const headAng = Math.atan2(headX, headZ);
        const diff = wrapAngle(stickAng - headAng);
        const kind = classifyTurn(diff, speed, grounded0, t);
        if (kind === 'skid' && skidT <= 0 && s.skidT <= 0) {
          // SLAM. Start the slide: the feet keep the old heading and scrub,
          // the body spins to face the new one. The mismatch is the drama.
          skidT = t.skidTime;
          ev.skid = 1;
          ev.dust = Math.max(ev.dust, t.skidDust);
        }
        if (skidT > 0) {
          // Sliding: heading is FROZEN (that is what a slide is), the body
          // turns fast toward the stick, and speed is scrubbed off.
          yaw = wrapAngle(yaw + clamp(wrapAngle(stickAng - yaw), -t.skidYawRate * d, t.skidYawRate * d));
          speed = Math.max(0, speed - t.skidBrake * d);
          target = 0; // no stick authority mid-slide
          if (skidT - d <= 0) {
            // Resolve: the feet catch up, and the exit keeps enough speed
            // that a 180 launches you the other way instead of stranding you.
            headX = Math.sin(yaw); headZ = Math.cos(yaw);
            speed = Math.max(speed, t.skidExitSpeed);
          }
        } else {
          const authority = sliding ? t.slideControl : 1;
          const maxTurn = turnRateFor(speed, surf, t) * authority * d;
          const a = headAng + clamp(diff, -maxTurn, maxTurn);
          headX = Math.sin(a); headZ = Math.cos(a);
          yaw = a;
        }
      }
    } else if (skidT > 0) {
      // Stick released mid-slide: the slide still resolves on its clock.
      speed = Math.max(0, speed - t.skidBrake * d);
      if (skidT - d <= 0) { headX = Math.sin(yaw); headZ = Math.cos(yaw); }
    }

    // ── Speed integration ────────────────────────────────────────────────
    // Passive drag is suspended in two places, and both are deliberate: the
    // post-landing grace window (a landing must never tax a run) and a slide
    // (the slope's own slideDrag governs it — leaving ground drag switched on
    // here scrubs 16 m/s^2 against the slide's 7 and the hero stands still on
    // a 58-degree face, which is the opposite of a slide).
    const grace = s.graceT > 0;
    if (skidT <= 0) {
      speed = accelStep(speed, target, surf, d, t, { grace: grace || sliding });
    }

    // ── Slopes: the grade is an acceleration, not a speed limit ──────────
    if (grounded0) {
      speed += slope.along * d;
      if (sliding) {
        // A slide is a downhill acceleration you steer, plus a scrub that
        // gives it a terminal speed. It is never a loss of agency.
        const dot = headX * slope.downX + headZ * slope.downZ;
        speed += t.slideAccel * Math.max(0, slope.steepness) * d;
        speed -= t.slideDrag * d;
        // Bias the heading downhill so the body always faces the fall line
        // enough for the slide to read, while the stick still aims it.
        if (dot < 0.999) {
          const bias = clamp(1 - dot, 0, 1) * (1 - t.slideControl) * d * 6;
          headX += (slope.downX - headX) * clamp01(bias);
          headZ += (slope.downZ - headZ) * clamp01(bias);
          const hl = Math.hypot(headX, headZ) || 1;
          headX /= hl; headZ /= hl;
        }
        if (dustTick) ev.dust = Math.max(ev.dust, t.slideDust);
      }
    }
    speed = clamp(speed, 0, t.speedCap * sr.top);
    if (speed < t.stopSpeed && target <= 0 && !sliding) speed = 0;

    // ── Horizontal resolve (props, bounds, step-up, walls) ───────────────
    let dx = headX * speed * d;
    let dz = headZ * speed * d;

    // A too-steep DESTINATION still refuses the uphill component: sliding is
    // for ground you are already on, not a licence to walk up a cliff.
    if (dx !== 0 || dz !== 0) {
      const nDest = collisionWorld.groundNormal(px + dx, pz + dz);
      if (nDest[1] < wallCos) {
        const hl = Math.hypot(nDest[0], nDest[2]);
        if (hl > 1e-9) {
          const ux = -nDest[0] / hl;
          const uz = -nDest[2] / hl;
          const up = dx * ux + dz * uz;
          if (up > 0) { dx -= up * ux; dz -= up * uz; }
        }
      }
    }

    let moved = collisionWorld.resolveMove(s.pos, { x: dx, z: dz }, PLAYER_RADIUS);
    let nx = moved.pos.x;
    let nz = moved.pos.z;

    const gyDest = collisionWorld.groundHeight(nx, nz);
    const wallStep = grounded0 ? gyDest - py > stepUp : gyDest > py + AIR_WALL_EPS;
    if (wallStep && (dx !== 0 || dz !== 0)) {
      moved = collisionWorld.resolveMove(s.pos, { x: 0, z: 0 }, PLAYER_RADIUS);
      nx = moved.pos.x;
      nz = moved.pos.z;
    }

    // Speed is scrubbed by HOW MUCH of the intended move actually happened.
    // controller.js zeroes horizontal velocity the instant a body touches
    // anything, which is why grazing a rock at a sprint stops you dead — the
    // single most common "the world is sticky" complaint. Here a graze keeps
    // nearly all its speed (ratio ~1) and only a head-on hit scrubs (ratio 0).
    const intended = Math.hypot(dx, dz);
    if (intended > 1e-6) {
      const ratio = clamp(Math.hypot(nx - px, nz - pz) / intended, 0, 1);
      speed *= 0.25 + 0.75 * ratio;
      if (speed < t.stopSpeed) speed = 0;
    }

    // ── Jump bookkeeping ─────────────────────────────────────────────────
    let bufferT = s.bufferT == null ? null : s.bufferT + d;
    if (input.jump) bufferT = 0;                    // fresh ask
    if (bufferT != null && bufferT > t.bufferT) bufferT = null;  // expired

    const held = input.jumpHeld == null ? true : !!input.jumpHeld;
    let holdT = s.holdT;
    let apexT = s.apexT;
    let airT = s.airT;
    let coyoteT = grounded0 ? 0 : s.coyoteT + d;
    let airJumps = s.airJumps;
    let spinT = Math.max(0, s.spinT - d);
    let vy = s.vel.y;
    let grounded = grounded0;

    const want = resolveJumpFeel({
      bufferT, coyoteT, grounded: grounded0, airT, airJumps,
    }, t);

    if (want === 'ground') {
      // Speed is rewarded twice: a running jump goes further AND higher.
      vy = t.jumpV + speed * t.jumpSpeedBonus;
      grounded = false;
      holdT = 0;
      apexT = 0;
      airT = 0;
      coyoteT = t.coyoteT + 1;   // consumed: no second serving from the window
      bufferT = null;
      ev.jump = vy;
      ev.dust = Math.max(ev.dust, 0.35);
    } else if (want === 'air') {
      // The spin jump. Forgives most of a botched fall, so a child who
      // mistimed a gap gets a save instead of a reset.
      vy = t.airJumpV + Math.max(0, vy) * 0.25 + Math.min(0, vy) * (1 - t.airJumpKeep);
      airJumps += 1;
      holdT = 0;
      apexT = 0;
      spinT = t.spinTime;
      bufferT = null;
      ev.airJump = vy;
    }

    // ── Vertical ─────────────────────────────────────────────────────────
    let ny = py;
    const gy = collisionWorld.groundHeight(nx, nz);
    let landImpact = 0;

    if (grounded) {
      if (gy >= py - stepUp) {
        ny = gy;      // follow the ground, including step-up snaps
        vy = 0;
      } else {
        grounded = false;   // walked off a drop taller than a step
        vy = 0;
        coyoteT = 0;        // the coyote window opens HERE, not on a jump
      }
    }

    if (!grounded) {
      airT += d;
      if (held && vy > 0) holdT += d;
      const cutting = !held || holdT >= t.holdMaxT;
      const g = t.gravity * gravityScale(vy, {
        held: !cutting,
        fastFall: !!input.fastFall,
        apexT,
      }, t);
      if (Math.abs(vy) < t.apexBand) apexT += d;
      vy = Math.max(-t.maxFall, vy - g * d);
      ny += vy * d;

      if (ny <= gy) {
        landImpact = Math.max(0, -vy);
        ny = gy;
        vy = 0;
        grounded = true;
      }
    }

    // ── Ledge grab: catch the jump that just barely missed ───────────────
    let ledge = null;
    let mantleCd = Math.max(0, s.mantleCd - d);
    // The hands search along the stick when there IS one, and along momentum
    // otherwise. This matters: by the time you are falling beside a lip the
    // airborne wall rule has already scrubbed your horizontal speed to
    // nothing, so gating the grab on speed alone means the grab never fires
    // in exactly the situation it exists for. Holding toward the wall IS the
    // ask, and answering it is the whole point of forgiveness.
    const reachX = hasStick ? ix / mag : headX;
    const reachZ = hasStick ? iz / mag : headZ;
    const reaching = hasStick || speed >= t.ledgeMinSpeed;
    if (!grounded && vy <= t.ledgeMaxVy && reaching && mantleCd <= 0) {
      const lx = nx + reachX * t.ledgeReach;
      const lz = nz + reachZ * t.ledgeReach;
      const lipY = collisionWorld.groundHeight(lx, lz);
      const rise = lipY - ny;
      const clearY = collisionWorld.groundHeight(
        lx + reachX * t.ledgeClear, lz + reachZ * t.ledgeClear,
      );
      // A real lip: high enough that we would have missed it, low enough to
      // be a ledge rather than a cliff, and FLAT enough just past the edge
      // that the pull-up lands on something standable.
      if (rise > t.ledgeMinRise && rise < t.ledgeMaxRise
          && clearY <= lipY + t.ledgeMinRise) {
        ledge = {
          t: 0,
          fromX: nx, fromY: ny, fromZ: nz,
          toX: lx + reachX * 0.25, toY: lipY, toZ: lz + reachZ * 0.25,
          dirX: reachX, dirZ: reachZ,
        };
        ev.mantle = 1;
        vy = 0;
      }
    }

    // ── Landing ──────────────────────────────────────────────────────────
    let squash = s.squash;
    let camDip = s.camDip;
    let camDipV = s.camDipV;
    let graceT = Math.max(0, s.graceT - d);
    if (landImpact > 0) {
      const hit = landingImpact(landImpact, t);
      squash = Math.max(squash, hit.squash);
      // ADD the drop rather than assign it: two landings in quick succession
      // should stack into a bigger jolt, not cancel each other out.
      camDip = clamp(camDip - hit.dip, -t.dipMax, t.dipMax * 0.35);
      ev.land = Math.max(0.05, hit.strength);
      ev.dust = Math.max(ev.dust, hit.dust);
      graceT = t.landGraceT;
      airJumps = 0;
      airT = 0;
      apexT = 0;
      holdT = 0;
      spinT = 0;
    }
    if (grounded) { airJumps = 0; airT = 0; }

    // ── Presentation channels ────────────────────────────────────────────
    squash = Math.max(0, squash - t.squashDecay * d * (squash + 0.25));
    const stretch = !grounded && vy < -2
      ? clamp01(-vy / t.maxFall) * t.stretchAir
      : Math.max(0, s.stretch - 6 * d);

    // Camera dip: a damped spring toward zero. Kicked (not set) on landing so
    // two landings in quick succession add up instead of cancelling.
    camDipV += (0 - camDip) * t.dipSpring * d;
    camDipV *= Math.max(0, 1 - t.dipDamp * d);
    camDip = clamp(camDip + camDipV * d, -t.dipMax, t.dipMax * 0.35);

    const fovTarget = fovKickFor(speed, t);
    const fovEase = fovTarget > s.fovKick ? t.fovEaseUp : t.fovEaseDown;
    const fovKick = s.fovKick + (fovTarget - s.fovKick) * Math.min(1, fovEase * d);

    const lineTarget = speedLinesFor(speed, t);
    const speedLines = s.speedLines + (lineTarget - s.speedLines) * Math.min(1, t.lineEase * d);

    // Scrap trail: a fixed-interval shed, so the ribbon spacing is a function
    // of DISTANCE travelled, not of frame rate.
    let trailT = s.trailT + d;
    let trailSpawn = 0;
    const interval = trailRate(speed, t);
    if (Number.isFinite(interval)) {
      while (trailT >= interval && trailSpawn < 3) { trailT -= interval; trailSpawn += 1; }
    } else {
      trailT = 0;
    }

    // Yaw follows the heading whenever we are not mid-skid (the skid already
    // wrote yaw itself, and that divergence is the point).
    if (skidT <= 0 && speed > 1e-4) yaw = Math.atan2(headX, headZ);

    return {
      pos: { x: nx, y: ny, z: nz },
      vel: { x: headX * speed, y: vy, z: headZ * speed },
      yaw,
      grounded,
      wading: grounded && collisionWorld.isWater(nx, nz),
      speed,
      headX,
      headZ,
      surface: surf,
      airT,
      coyoteT,
      bufferT,
      holdT,
      apexT,
      graceT,
      skidT,
      slideT: sliding ? s.slideT + d : 0,
      spinT,
      mantleT: 0,
      mantleCd,
      dustT,
      airJumps,
      jumpHeld: held,
      sliding,
      ledge,
      squash,
      stretch,
      camDip,
      camDipV,
      fovKick,
      speedLines,
      trailT,
      trailSpawn,
      ev,
    };
  }

  /**
   * The pull-up. Position is a smoothstep from lip-grab to standing, gravity
   * is off, and nothing else in the world can interrupt it — 0.26 s of "the
   * jump worked after all".
   */
  function stepMantle(s, d, ev) {
    const L = s.ledge;
    const nt = L.t + d;
    const p = clamp01(nt / t.mantleTime);
    const e = smoothstep(p);
    const x = L.fromX + (L.toX - L.fromX) * e;
    const z = L.fromZ + (L.toZ - L.fromZ) * e;
    // The vertical leads the horizontal: hands up first, then the body over.
    const ey = smoothstep(clamp01(p * 1.35));
    const y = L.fromY + (L.toY - L.fromY) * ey;
    const done = p >= 1;
    if (done) {
      ev.dust = 0.3;
      ev.land = 0.15;
    }
    // You come over the lip going the way you reached, not the way your
    // momentum happened to be pointing when the wall stopped you.
    const dirX = L.dirX ?? s.headX;
    const dirZ = L.dirZ ?? s.headZ;
    return {
      ...s,
      pos: { x, y, z },
      vel: {
        x: dirX * (done ? t.mantleExitSpeed : 0),
        y: 0,
        z: dirZ * (done ? t.mantleExitSpeed : 0),
      },
      headX: dirX,
      headZ: dirZ,
      yaw: Math.atan2(dirX, dirZ),
      grounded: done,
      wading: done && collisionWorld.isWater(x, z),
      speed: done ? t.mantleExitSpeed : 0,
      airT: 0,
      coyoteT: 0,
      apexT: 0,
      holdT: 0,
      airJumps: 0,
      graceT: done ? t.landGraceT : 0,
      mantleT: nt,
      mantleCd: done ? t.mantleCooldown : 0,
      ledge: done ? null : { ...L, t: nt },
      // A pull-up is a pause: the speed cues must not hang on the screen while
      // the hero is hauling themselves over a lip at zero metres per second.
      fovKick: Math.max(0, s.fovKick - t.fovEaseDown * d),
      speedLines: Math.max(0, s.speedLines - t.lineEase * d),
      squash: Math.max(0, s.squash - t.squashDecay * d),
      trailSpawn: 0,
      dustT: 0,
      ev,
    };
  }

  return { spawnState, step, tuning: t, PLAYER_RADIUS };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION HELPERS (pure)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The rig's whole-body scale for this frame, from the feel state's squash and
 * stretch channels. Volume-preserving-ish: what leaves the height goes into
 * the width, which is what makes squash read as impact and not as shrinking.
 *
 * @returns {{ sx:number, sy:number, sz:number }}
 */
export function rigScale(feel, out = { sx: 1, sy: 1, sz: 1 }) {
  const sq = clamp01(feel?.squash || 0);
  const st = clamp01(feel?.stretch || 0);
  const e = sq * sq * (3 - 2 * sq);
  out.sy = 1 - e * 0.22 + st;
  out.sx = 1 + e * 0.16 - st * 0.5;
  out.sz = out.sx;
  return out;
}

/** Degrees of extra camera FOV this frame. Add to the rig's base FOV. */
export function fovOffsetDeg(feel, t = FEEL) {
  return clamp01(feel?.fovKick || 0) * t.fovDeg;
}

// ═══════════════════════════════════════════════════════════════════════════
// FX: dust, scraps, speed lines — three draw calls, zero per-frame allocation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deterministic per-slot jitter in [0, 1). A hash, never Math.random: two
 * runs of the screenshot harness must place the same scrap in the same place.
 */
function hash01(i) {
  let h = (i | 0) * 0x27d4eb2d;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 65536) / 65536;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _col = new THREE.Color();
const _zero = new THREE.Vector3(0, 0, 0);

/**
 * Build the game-feel FX rig.
 *
 * THREE meshes, three draw calls, all instanced, nothing allocated per frame:
 *
 *   dust    flat papercut discs that expand on the ground where a foot lands
 *           or a slide scrubs. Half the slots are tinted TEAL — the shadow
 *           ply of the same puff — because a papercut cloud is two layers of
 *           card, and the shadow in this world is always teal, never grey.
 *   trail   small scraps of cut paper shed off a sprinting hero. NOT a blur:
 *           this world has no post-processing and no motion blur, so speed is
 *           communicated with more paper, which is the honest material answer.
 *   lines   a ring of slivers parented to the CAMERA. Add `lineGroup` as a
 *           child of the camera; it never touches the world.
 *
 * @param {{ parent?:THREE.Object3D, tuning?:typeof FEEL }} o
 *   `parent` is the world group the dust and scraps live in.
 */
export function createFeelFx({ parent = null, tuning = FEEL } = {}) {
  const t = { ...FEEL, ...tuning, fx: { ...FEEL.fx, ...(tuning.fx || {}) } };
  const F = t.fx;

  const group = new THREE.Group();
  group.name = 'feel-fx';

  // ── DUST ───────────────────────────────────────────────────────────────
  const dustGeo = new THREE.CircleGeometry(1, 9);
  dustGeo.rotateX(-Math.PI / 2);          // lies flat on the ground
  const dustMat = papercutMaterial(PAPER.cream, {
    transparent: true,
    opacity: 0.85,
    alphaMap: deckleDisc(),               // torn rim: never a clean circle
    depthWrite: false,
    side: THREE.DoubleSide,
    space: 'local',                       // grain rides the instance, no crawl
  });
  const dust = new THREE.InstancedMesh(dustGeo, dustMat, F.dustMax);
  dust.name = 'feel-dust';
  dust.frustumCulled = false;
  dust.castShadow = false;
  dust.receiveShadow = false;
  dust.count = 0;
  // Two-ply: even slots are cream paper, odd slots are the TEAL shadow under
  // it. Set once — an instanceColor upload per frame would be the one
  // allocation-free rule this file breaks.
  for (let i = 0; i < F.dustMax; i++) {
    dust.setColorAt(i, _col.setHex(i % 2 === 0 ? PAPER.cream : PAPER.tealL));
  }
  if (dust.instanceColor) dust.instanceColor.needsUpdate = true;
  group.add(dust);

  // ── TRAIL ──────────────────────────────────────────────────────────────
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  const trailMat = papercutMaterial(PAPER.creamD, {
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    space: 'local',
  });
  const trail = new THREE.InstancedMesh(trailGeo, trailMat, F.trailMax);
  trail.name = 'feel-trail';
  trail.frustumCulled = false;
  trail.count = 0;
  for (let i = 0; i < F.trailMax; i++) {
    trailPlyColor(i, _col);
    trail.setColorAt(i, _col);
  }
  if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
  group.add(trail);

  // ── SPEED LINES ────────────────────────────────────────────────────────
  // Unlit: they are a graphic overlay drawn in the world, not a lit surface,
  // and a toon ramp on a 2 cm sliver is just noise. Fog off for the same
  // reason — they live 2.2 m from the eye and must not tint with distance.
  const lineGeo = new THREE.PlaneGeometry(1, 1);
  const lineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PAPER.white),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, F.lineCount);
  lines.name = 'feel-speedlines';
  lines.frustumCulled = false;
  lines.renderOrder = 900;
  lines.count = F.lineCount;
  const lineGroup = new THREE.Group();
  lineGroup.name = 'feel-speedlines-rig';
  lineGroup.add(lines);
  lineGroup.visible = false;

  if (parent) parent.add(group);

  // ── Pools. Flat typed arrays: no objects, no GC, no per-frame allocation.
  const DP = 8;   // x, y, z, vx, vy, vz, life, age
  const dustP = new Float32Array(F.dustMax * DP);
  let dustHead = 0;
  const TP = 8;   // x, y, z, vx, vy, vz, age, spin
  const trailP = new Float32Array(F.trailMax * TP);
  let trailHead = 0;
  let spawnCounter = 0;   // drives the deterministic jitter hash

  function spawnDust(x, y, z, strength) {
    const n = Math.min(F.dustMax, 3 + Math.round(strength * 7));
    for (let k = 0; k < n; k++) {
      const i = dustHead;
      dustHead = (dustHead + 1) % F.dustMax;
      const h1 = hash01(spawnCounter * 7 + k * 3 + 1);
      const h2 = hash01(spawnCounter * 11 + k * 5 + 2);
      const a = h1 * TAU;
      const sp = F.dustSpread * (0.35 + 0.65 * h2) * (0.4 + 0.6 * strength);
      const o = i * DP;
      dustP[o] = x + Math.sin(a) * 0.12;
      dustP[o + 1] = y + 0.04;
      dustP[o + 2] = z + Math.cos(a) * 0.12;
      dustP[o + 3] = Math.sin(a) * sp;
      dustP[o + 4] = F.dustRise * (0.5 + 0.5 * h2);
      dustP[o + 5] = Math.cos(a) * sp;
      dustP[o + 6] = F.dustLife * (0.75 + 0.5 * h1);
      dustP[o + 7] = 0;
      spawnCounter += 1;
    }
  }

  function spawnScrap(x, y, z, vx, vz) {
    const i = trailHead;
    trailHead = (trailHead + 1) % F.trailMax;
    const h = hash01(spawnCounter * 13 + 7);
    const o = i * TP;
    trailP[o] = x + (h - 0.5) * 0.3;
    trailP[o + 1] = y + 0.35 + h * 0.5;
    trailP[o + 2] = z + (hash01(spawnCounter * 17 + 3) - 0.5) * 0.3;
    // Scraps are shed BACKWARD out of the run, then fall away.
    trailP[o + 3] = -vx * 0.18 + (h - 0.5) * 0.4;
    trailP[o + 4] = 0.35 + h * 0.4;
    trailP[o + 5] = -vz * 0.18 + (hash01(spawnCounter * 19 + 5) - 0.5) * 0.4;
    trailP[o + 6] = 0;
    trailP[o + 7] = (h - 0.5) * 2 * F.trailSpin;
    spawnCounter += 1;
  }

  /**
   * Consume ONE FIXED SIM STEP's worth of events. Call from step(), never
   * from draw().
   *
   * The split matters and it is not fussiness: renderer.js runs the sim on a
   * fixed 1/60 accumulator and draws once per rAF, so a slow frame runs two
   * or three sim steps between draws and a fast one runs none. Reading the
   * one-frame `ev` record at DRAW time would therefore silently swallow the
   * dust from every step but the last, and double-fire it whenever a draw
   * happened with no step in between. Events are consumed here, on the same
   * clock that produces them; continuous channels are read in update().
   *
   * @param {object} feel  the state returned by createGameFeel().step
   */
  function emit(feel) {
    if (!feel) return;
    const p = feel.pos || _zero;
    const gy = feel.groundY != null ? feel.groundY : p.y;
    if (feel.ev && feel.ev.dust > 0) spawnDust(p.x, gy, p.z, clamp01(feel.ev.dust));
    const n = feel.trailSpawn | 0;
    for (let k = 0; k < n; k++) {
      spawnScrap(p.x, p.y, p.z, feel.vel ? feel.vel.x : 0, feel.vel ? feel.vel.z : 0);
    }
  }

  /**
   * Integrate and draw. Call once per DRAW. Reads only the CONTINUOUS
   * channels of the feel state (speedLines), never the one-frame events —
   * see emit() for why.
   *
   * @param {number} dt      seconds since the last DRAW (not the sim step)
   * @param {object} feel    the state returned by createGameFeel().step
   * @param {number} camYaw  world yaw the camera looks along, so the scrap
   *                         cards turn their face to the eye
   */
  function update(dt, feel, camYaw = 0) {
    const d = clamp(dt || 0, 0, t.maxDt);

    // ── Dust ─────────────────────────────────────────────────────────────
    let live = 0;
    for (let i = 0; i < F.dustMax; i++) {
      const o = i * DP;
      const life = dustP[o + 6];
      if (life <= 0) { hide(dust, i); continue; }
      const age = dustP[o + 7] + d;
      if (age >= life) { dustP[o + 6] = 0; hide(dust, i); continue; }
      dustP[o + 7] = age;
      const u = age / life;
      dustP[o] += dustP[o + 3] * d;
      dustP[o + 1] += dustP[o + 4] * d;
      dustP[o + 2] += dustP[o + 5] * d;
      dustP[o + 3] *= Math.max(0, 1 - 3.2 * d);   // air resistance
      dustP[o + 4] *= Math.max(0, 1 - 2.0 * d);
      dustP[o + 5] *= Math.max(0, 1 - 3.2 * d);
      // Grow out, then shrink to nothing: with no per-instance alpha, the
      // scale IS the fade, and a puff that vanishes by shrinking reads as
      // paper curling away rather than as a dropped frame.
      const grow = 1 + (F.dustGrow - 1) * u;
      const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      const r = F.dustSize * grow * fade;
      _v.set(dustP[o], dustP[o + 1], dustP[o + 2]);
      _e.set(0, hash01(i) * TAU, 0);
      _q.setFromEuler(_e);
      _sc.set(r, r, r);
      _m.compose(_v, _q, _sc);
      dust.setMatrixAt(i, _m);
      live++;
    }
    dust.count = F.dustMax;
    dust.instanceMatrix.needsUpdate = true;
    dust.visible = live > 0;

    // ── Trail scraps ─────────────────────────────────────────────────────
    let tlive = 0;
    for (let i = 0; i < F.trailMax; i++) {
      const o = i * TP;
      const age = trailP[o + 6];
      if (age < 0) { hide(trail, i); continue; }
      const na = age + d;
      if (na >= t.trailLife) { trailP[o + 6] = -1; hide(trail, i); continue; }
      trailP[o + 6] = na;
      const u = na / t.trailLife;
      trailP[o] += trailP[o + 3] * d;
      trailP[o + 1] += (trailP[o + 4] - F.trailDrift) * d;
      trailP[o + 2] += trailP[o + 5] * d;
      trailP[o + 4] -= 3.2 * d;                    // gravity on a scrap
      const r = F.trailSize * (1 - u * 0.85);
      _v.set(trailP[o], trailP[o + 1], trailP[o + 2]);
      _e.set(0, camYaw, na * trailP[o + 7]);       // face the eye, tumble in plane
      _q.setFromEuler(_e);
      _sc.set(r, r * 1.6, r);
      _m.compose(_v, _q, _sc);
      trail.setMatrixAt(i, _m);
      tlive++;
    }
    trail.count = F.trailMax;
    trail.instanceMatrix.needsUpdate = true;
    trail.visible = tlive > 0;

    // ── Speed lines ──────────────────────────────────────────────────────
    const inten = feel ? clamp01(feel.speedLines || 0) : 0;
    lineGroup.visible = inten > 0.01;
    if (lineGroup.visible) {
      lineMat.opacity = 0.10 + 0.45 * inten;
      for (let i = 0; i < F.lineCount; i++) {
        const a = (i / F.lineCount) * TAU + hash01(i) * 0.25;
        // Slivers sit on a ring around the view axis and rush outward as the
        // intensity climbs, so the frame edge streaks and the middle — where
        // the child is looking — stays completely clear.
        const rr = F.lineRadius * (0.85 + 0.5 * inten + hash01(i + 97) * 0.25);
        _v.set(Math.cos(a) * rr, Math.sin(a) * rr, -F.lineDist);
        _e.set(0, 0, a - Math.PI / 2);   // long axis points radially outward
        _q.setFromEuler(_e);
        const len = F.lineLength * (0.4 + 0.6 * inten) * (0.6 + 0.8 * hash01(i + 41));
        _sc.set(F.lineWidth, len, 1);
        _m.compose(_v, _q, _sc);
        lines.setMatrixAt(i, _m);
      }
      lines.instanceMatrix.needsUpdate = true;
    }
  }

  function hide(mesh, i) {
    _m.compose(_zero, _q.identity(), _sc.set(0, 0, 0));
    mesh.setMatrixAt(i, _m);
  }

  function reset() {
    dustP.fill(0);
    trailP.fill(0);
    for (let i = 0; i < F.trailMax; i++) trailP[i * TP + 6] = -1;
    for (let i = 0; i < F.dustMax; i++) hide(dust, i);
    for (let i = 0; i < F.trailMax; i++) hide(trail, i);
    dust.instanceMatrix.needsUpdate = true;
    trail.instanceMatrix.needsUpdate = true;
    dust.visible = false;
    trail.visible = false;
    lineGroup.visible = false;
    dustHead = 0;
    trailHead = 0;
    spawnCounter = 0;
  }
  reset();

  function dispose() {
    group.parent?.remove(group);
    lineGroup.parent?.remove(lineGroup);
    dustGeo.dispose();
    dustMat.dispose();
    trailGeo.dispose();
    trailMat.dispose();
    lineGeo.dispose();
    lineMat.dispose();
    dust.dispose();
    trail.dispose();
    lines.dispose();
  }

  return {
    group,        // add to the WORLD
    lineGroup,    // add to the CAMERA
    emit,         // call from step()  — one fixed sim step's events
    update,       // call from draw()  — integrate + write instance matrices
    reset,
    dispose,
    /** Draw-call and pool budget, for the perf test. */
    stats: { drawCalls: 3, dustMax: F.dustMax, trailMax: F.trailMax, lines: F.lineCount },
  };
}

/** Scraps alternate cream / white / teal-shadow, so the ribbon has plies. */
function trailPlyColor(i, out) {
  const k = i % 3;
  return out.setHex(k === 0 ? PAPER.cream : k === 1 ? PAPER.white : PAPER.tealL);
}
