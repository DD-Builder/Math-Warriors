/**
 * Pose animator — keyframed pose cycles for the parametric character
 * model. Each cycle is a list of keyframes { t: 0..1, pose } that are
 * interpolated smoothly (smoothstep) and looped or played once.
 *
 * WALK is a real 4-phase gait per leg (contact → down → passing → up)
 * with knee flexion during swing, arm counter-swing with elbow drive,
 * body bob at 2× stride frequency, and slight spine lean. Because the
 * character model draws limbs THROUGH their joints, these angles read
 * as genuine stepping, not part-flapping.
 *
 * Class personalities:
 *   knight — grounded march: modest cadence, strong arm drive
 *   wizard — smooth glide: long cycle, small steps, robe does the work
 *   bunny  — bounding hop: both legs gather + extend, big vertical, ear flop
 */

// ── helpers ─────────────────────────────────────────────────────
const smooth = (a) => a * a * (3 - 2 * a);

function lerpPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? 0, bv = b[k] ?? 0;
    out[k] = av + (bv - av) * t;
  }
  return out;
}

export function sampleCycle(cycle, timeMs) {
  const { duration, keyframes, loop = true } = cycle;
  let t = timeMs / duration;
  if (loop) t -= Math.floor(t);
  else t = Math.min(1, t);
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].t < t) i++;
  const k0 = keyframes[i], k1 = keyframes[Math.min(i + 1, keyframes.length - 1)];
  const span = (k1.t - k0.t) || 1;
  const f = smooth(Math.min(1, Math.max(0, (t - k0.t) / span)));
  return lerpPose(k0.pose, k1.pose, f);
}

export function cycleDone(cycle, timeMs) {
  return !cycle.loop && timeMs >= cycle.duration;
}

// ── WALK (side view) — biomechanical 4-phase gait ───────────────
// Right leg leads. Angles: thigh + = forward swing; knee + = flexion.
function walkCycle(dur, stride, kneeLift, armSwing, bob, spineLean, earAmp = 0) {
  return {
    duration: dur, loop: true,
    keyframes: [
      // R contact (heel strike), L toe-off behind
      { t: 0.0, pose: { thighR: stride, kneeR: 0.06, thighL: -stride * 0.9, kneeL: kneeLift * 0.45, shoulderL: armSwing, elbowL: 0.35, shoulderR: -armSwing, elbowR: 0.15, hipY: bob * 0.4, spine: spineLean, head: -spineLean * 0.5, earFlop: earAmp * 0.4 } },
      // R support (body passes over), L mid-swing knee high
      { t: 0.25, pose: { thighR: 0.05, kneeR: 0.12, thighL: 0.1, kneeL: kneeLift, shoulderL: armSwing * 0.2, elbowL: 0.3, shoulderR: -armSwing * 0.2, elbowR: 0.3, hipY: -bob, spine: spineLean * 0.7, head: 0, earFlop: -earAmp } },
      // L contact, R toe-off
      { t: 0.5, pose: { thighL: stride, kneeL: 0.06, thighR: -stride * 0.9, kneeR: kneeLift * 0.45, shoulderR: armSwing, elbowR: 0.35, shoulderL: -armSwing, elbowL: 0.15, hipY: bob * 0.4, spine: spineLean, head: -spineLean * 0.5, earFlop: earAmp * 0.4 } },
      // L support, R mid-swing
      { t: 0.75, pose: { thighL: 0.05, kneeL: 0.12, thighR: 0.1, kneeR: kneeLift, shoulderR: armSwing * 0.2, elbowR: 0.3, shoulderL: -armSwing * 0.2, elbowL: 0.3, hipY: -bob, spine: spineLean * 0.7, head: 0, earFlop: -earAmp } },
      { t: 1.0, pose: { thighR: stride, kneeR: 0.06, thighL: -stride * 0.9, kneeL: kneeLift * 0.45, shoulderL: armSwing, elbowL: 0.35, shoulderR: -armSwing, elbowR: 0.15, hipY: bob * 0.4, spine: spineLean, head: -spineLean * 0.5, earFlop: earAmp * 0.4 } },
    ],
  };
}

// Bunny bounding hop — gather, launch, airborne tuck, land
function hopCycle(dur) {
  return {
    duration: dur, loop: true,
    keyframes: [
      { t: 0.0,  pose: { thighL: -0.35, kneeL: 0.9, thighR: -0.35, kneeR: 0.9, hipY: 7, squash: 0.9, spine: 0.18, earFlop: 0.35, shoulderL: -0.3, shoulderR: -0.3, elbowL: 0.6, elbowR: 0.6, head: -0.06 } },      // crouch/gather
      { t: 0.28, pose: { thighL: 0.35, kneeL: 0.05, thighR: 0.35, kneeR: 0.05, hipY: -14, squash: 1.08, spine: -0.08, earFlop: -0.45, shoulderL: 0.5, shoulderR: 0.5, elbowL: 0.2, elbowR: 0.2, head: 0.06 } },      // launch/extend
      { t: 0.52, pose: { thighL: 0.1, kneeL: 0.55, thighR: 0.1, kneeR: 0.55, hipY: -18, squash: 1.0, spine: 0, earFlop: -0.2, shoulderL: 0.15, shoulderR: 0.15, elbowL: 0.4, elbowR: 0.4, head: 0.02 } },            // airborne tuck
      { t: 0.75, pose: { thighL: -0.2, kneeL: 0.5, thighR: -0.2, kneeR: 0.5, hipY: 2, squash: 0.94, spine: 0.12, earFlop: 0.5, shoulderL: -0.15, shoulderR: -0.15, elbowL: 0.5, elbowR: 0.5, head: -0.04 } },        // landing absorb
      { t: 1.0,  pose: { thighL: -0.35, kneeL: 0.9, thighR: -0.35, kneeR: 0.9, hipY: 7, squash: 0.9, spine: 0.18, earFlop: 0.35, shoulderL: -0.3, shoulderR: -0.3, elbowL: 0.6, elbowR: 0.6, head: -0.06 } },
    ],
  };
}

// ── IDLE — coordinated breathing with weight settle ─────────────
function idleCycle(dur, breathe, sway, earAmp = 0) {
  return {
    duration: dur, loop: true,
    keyframes: [
      { t: 0.0,  pose: { squash: 1, hipY: 0, spine: sway * 0.3, shoulderL: 0.04, shoulderR: -0.02, elbowL: 0.16, elbowR: 0.14, head: 0.01, kneeL: 0.03, kneeR: 0.05, earFlop: 0 } },
      { t: 0.45, pose: { squash: 1 + breathe, hipY: -breathe * 14, spine: -sway * 0.2, shoulderL: 0.07, shoulderR: -0.05, elbowL: 0.2, elbowR: 0.18, head: -0.02, kneeL: 0.02, kneeR: 0.04, earFlop: earAmp } },
      { t: 0.72, pose: { squash: 1 + breathe * 0.3, hipY: -breathe * 4, spine: sway * 0.4, shoulderL: 0.05, shoulderR: -0.03, elbowL: 0.17, elbowR: 0.15, head: 0.02, kneeL: 0.04, kneeR: 0.05, earFlop: -earAmp * 0.5 } },
      { t: 1.0,  pose: { squash: 1, hipY: 0, spine: sway * 0.3, shoulderL: 0.04, shoulderR: -0.02, elbowL: 0.16, elbowR: 0.14, head: 0.01, kneeL: 0.03, kneeR: 0.05, earFlop: 0 } },
    ],
  };
}

// ── ATTACKS — anticipation → strike → follow-through → settle ───
const SLASH = {
  duration: 520, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    // wind-up: weapon arm cocks back-up, spine coils back, weight to rear leg
    { t: 0.22, pose: { shoulderR: -1.5, elbowR: 0.9, weapon: -0.5, spine: -0.16, head: -0.08, thighL: -0.12, kneeL: 0.15, thighR: 0.18, kneeR: 0.08, shoulderL: 0.5, elbowL: 0.4, hipY: 2 } },
    // strike: arm whips forward and extends at the elbow, lunge onto front leg
    { t: 0.42, pose: { shoulderR: 1.3, elbowR: 0.08, weapon: 0.55, spine: 0.22, head: 0.1, thighL: 0.3, kneeL: 0.06, thighR: -0.28, kneeR: 0.35, shoulderL: -0.5, elbowL: 0.25, hipY: 4 } },
    // follow-through: momentum carries slightly past
    { t: 0.58, pose: { shoulderR: 1.5, elbowR: 0.12, weapon: 0.7, spine: 0.26, head: 0.12, thighL: 0.32, kneeL: 0.06, thighR: -0.3, kneeR: 0.38, shoulderL: -0.55, elbowL: 0.3, hipY: 5 } },
    // recover
    { t: 0.82, pose: { shoulderR: 0.3, elbowR: 0.2, weapon: 0.1, spine: 0.05, thighL: 0.08, thighR: -0.06, kneeR: 0.12, hipY: 1 } },
    { t: 1.0,  pose: {} },
  ],
};

const CAST = {
  duration: 680, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    // gather: both arms rise, staff lifts, head tips back watching the spell
    { t: 0.3,  pose: { shoulderL: -2.2, elbowL: 0.4, shoulderR: -2.0, elbowR: 0.35, weapon: -0.4, spine: -0.1, head: -0.14, hipY: -2, squash: 1.03 } },
    // channel: hold at apex with a tremble
    { t: 0.5,  pose: { shoulderL: -2.35, elbowL: 0.3, shoulderR: -2.15, elbowR: 0.28, weapon: -0.5, spine: -0.12, head: -0.16, hipY: -3, squash: 1.04 } },
    // release: thrust forward at the target
    { t: 0.68, pose: { shoulderL: -0.9, elbowL: 0.1, shoulderR: -1.1, elbowR: 0.08, weapon: 0.45, spine: 0.18, head: 0.08, hipY: 3, squash: 0.97, thighL: 0.15, thighR: -0.12, kneeR: 0.2 } },
    { t: 1.0,  pose: {} },
  ],
};

const PUNCH = {
  duration: 420, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    // gather into a crouch
    { t: 0.2,  pose: { hipY: 5, squash: 0.92, spine: 0.15, thighL: -0.25, kneeL: 0.6, thighR: -0.25, kneeR: 0.6, shoulderR: -0.9, elbowR: 1.1, shoulderL: 0.3, elbowL: 0.5, earFlop: 0.3 } },
    // leaping cross — body extends, fist drives forward
    { t: 0.45, pose: { hipY: -10, squash: 1.06, spine: 0.3, thighL: 0.3, kneeL: 0.1, thighR: 0.25, kneeR: 0.15, shoulderR: 1.7, elbowR: 0.05, shoulderL: -0.6, elbowL: 0.4, head: 0.1, earFlop: -0.5 } },
    // second jab on the way down
    { t: 0.65, pose: { hipY: -2, squash: 1.0, spine: 0.2, shoulderL: 1.3, elbowL: 0.08, shoulderR: 0.2, elbowR: 0.5, earFlop: 0.2 } },
    { t: 1.0,  pose: {} },
  ],
};

// ── reactions ───────────────────────────────────────────────────
const HIT = {
  duration: 340, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    { t: 0.25, pose: { spine: -0.3, head: -0.22, hipY: 3, hipX: -4, shoulderL: -0.5, shoulderR: -0.4, elbowL: 0.5, elbowR: 0.5, kneeL: 0.25, kneeR: 0.2, earFlop: 0.5, squash: 0.95 } },
    { t: 0.6,  pose: { spine: -0.1, head: 0.06, hipX: -1, kneeL: 0.1, kneeR: 0.08, earFlop: -0.15 } },
    { t: 1.0,  pose: {} },
  ],
};

const KO = {
  duration: 700, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    // knees buckle first
    { t: 0.3,  pose: { kneeL: 0.9, kneeR: 0.85, thighL: -0.3, thighR: -0.32, hipY: 12, spine: 0.15, head: 0.1, shoulderL: 0.2, shoulderR: 0.2, squash: 0.95 } },
    // torso folds, arms go slack
    { t: 0.6,  pose: { kneeL: 1.3, kneeR: 1.25, thighL: -0.6, thighR: -0.62, hipY: 26, spine: 0.45, head: 0.35, shoulderL: 0.35, shoulderR: 0.4, elbowL: 0.15, elbowR: 0.1, squash: 0.9, earFlop: 0.7 } },
    // settle in a slump
    { t: 1.0,  pose: { kneeL: 1.4, kneeR: 1.35, thighL: -0.7, thighR: -0.72, hipY: 30, spine: 0.55, head: 0.45, shoulderL: 0.4, shoulderR: 0.45, elbowL: 0.1, elbowR: 0.08, squash: 0.88, earFlop: 0.8 } },
  ],
};

const VICTORY = {
  duration: 900, loop: false,
  keyframes: [
    { t: 0.0,  pose: {} },
    // crouch
    { t: 0.18, pose: { hipY: 8, squash: 0.9, kneeL: 0.7, kneeR: 0.7, thighL: -0.3, thighR: -0.3, spine: 0.1, shoulderL: -0.3, shoulderR: -0.3 } },
    // leap! arms thrown up
    { t: 0.42, pose: { hipY: -22, squash: 1.06, kneeL: 0.15, kneeR: 0.2, thighL: 0.2, thighR: 0.15, spine: -0.06, head: -0.1, shoulderL: -2.6, shoulderR: -2.5, elbowL: 0.15, elbowR: 0.2, weapon: -0.3, earFlop: -0.6 } },
    // land soft
    { t: 0.7,  pose: { hipY: 2, squash: 0.96, kneeL: 0.3, kneeR: 0.3, shoulderL: -2.3, shoulderR: -2.2, elbowL: 0.25, elbowR: 0.3, earFlop: 0.4 } },
    // hold the pose proudly
    { t: 1.0,  pose: { shoulderL: -2.4, shoulderR: -2.3, elbowL: 0.2, elbowR: 0.25, head: -0.06, weapon: -0.2 } },
  ],
};

const GUARD = {
  duration: 400, loop: false,
  keyframes: [
    { t: 0.0, pose: {} },
    { t: 1.0, pose: { hipY: 4, squash: 0.96, kneeL: 0.25, kneeR: 0.25, thighL: -0.1, thighR: -0.1, spine: 0.1, head: 0.04, shoulderL: -1.2, elbowL: 1.2, shoulderR: -0.8, elbowR: 1.0, weapon: -0.9 } },
  ],
};

const SWAY = {
  duration: 3000, loop: true,
  keyframes: [
    { t: 0.0,  pose: { spine: -0.05, hipX: -2, head: 0.03, shoulderL: 0.08, shoulderR: -0.04, kneeL: 0.06, kneeR: 0.02, earFlop: 0.1 } },
    { t: 0.5,  pose: { spine: 0.05, hipX: 2, head: -0.03, shoulderL: -0.04, shoulderR: 0.08, kneeL: 0.02, kneeR: 0.06, earFlop: -0.1 } },
    { t: 1.0,  pose: { spine: -0.05, hipX: -2, head: 0.03, shoulderL: 0.08, shoulderR: -0.04, kneeL: 0.06, kneeR: 0.02, earFlop: 0.1 } },
  ],
};

// ── per-class cycle registry ────────────────────────────────────
export const CYCLES = {
  knight: {
    idle: idleCycle(2600, 0.028, 0.02),
    walk: walkCycle(620, 0.5, 0.85, 0.55, 3.2, 0.06),
    attack: SLASH, cast: CAST, hit: HIT, ko: KO, victory: VICTORY, guard: GUARD, sway: SWAY,
  },
  wizard: {
    idle: idleCycle(3200, 0.024, 0.03),
    walk: walkCycle(760, 0.32, 0.55, 0.35, 2.0, 0.03),
    attack: CAST, cast: CAST, hit: HIT, ko: KO, victory: VICTORY, guard: GUARD, sway: SWAY,
  },
  bunny: {
    idle: idleCycle(1700, 0.04, 0.03, 0.18),
    walk: hopCycle(460),
    attack: PUNCH, cast: PUNCH, hit: HIT, ko: KO, victory: VICTORY, guard: GUARD, sway: SWAY,
  },
};

export function getCycle(heroClass, name) {
  const set = CYCLES[heroClass] || CYCLES.knight;
  return set[name] || set.idle;
}
