/**
 * Character animation keyframe data — grounded in actual body mechanics.
 *
 * BIOMECHANICS PRINCIPLES APPLIED:
 *   1. Weight transfer: when one leg is forward, the body's center of
 *      gravity shifts to it. The torso tilts slightly toward the
 *      planted foot.
 *   2. Counter-rotation: arms swing opposite to legs (left leg forward
 *      = right arm forward). The torso rotates subtly in opposition
 *      to the hips.
 *   3. Anticipation: before any action, the body "winds up" in the
 *      opposite direction (sword goes back before slashing forward).
 *   4. Follow-through: after an action, momentum carries the body
 *      past the target before recovering.
 *   5. Settle: movements don't snap to rest — they ease into a
 *      slightly-past-neutral position then drift back.
 *   6. Secondary motion: the head trails the body slightly (drag),
 *      the weapon follows the arm with a delay.
 *
 * Each animation is { duration (ms), loop (bool), ease, keyframes }.
 * Keyframes: [{ t: 0..1, pose: { partName: angleRadians } }].
 * Part names (articulated): thighL, shinL, thighR, shinR,
 *   upperArmL, forearmL, upperArmR, forearmR, torso, weapon, head.
 * Legacy names (leftLeg, rightLeg, armL, armR) still supported
 *   via LEGACY_MAP in characterRig.js.
 * Positive angle = clockwise (forward lean, forward swing).
 */

// ──────────────────────────────────────────────────────────────
// WALK CYCLES — class-specific gaits with articulated joints
// ──────────────────────────────────────────────────────────────

// Knight walk: heavy, deliberate march. Weight settles on each foot.
// Knee bends visible on planted leg, elbows pump with arm swing.
export const WALK_KNIGHT = {
  duration: 600,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    // Contact: left foot plants, right lifts. Knee bends absorb weight.
    { t: 0.0,  pose: { thighL: -0.35, shinL: 0.40, thighR: 0.38, shinR: -0.50,
                       upperArmL: 0.28, forearmL: 0.35, upperArmR: -0.18, forearmR: -0.25,
                       torso: 0.04, head: 0.025, weapon: -0.10 } },
    // Passing: right leg swings through, shin tucks up.
    { t: 0.25, pose: { thighL: -0.12, shinL: 0.15, thighR: 0.06, shinR: -0.20,
                       upperArmL: 0.10, forearmL: 0.12, upperArmR: 0.03, forearmR: 0.05,
                       torso: 0.01, head: 0.008, weapon: -0.03 } },
    // Contact: right foot plants, left lifts. Mirror of frame 0.
    { t: 0.5,  pose: { thighL: 0.38, shinL: -0.50, thighR: -0.35, shinR: 0.40,
                       upperArmL: -0.18, forearmL: -0.25, upperArmR: 0.28, forearmR: 0.35,
                       torso: -0.04, head: -0.025, weapon: 0.12 } },
    // Passing: left leg swings through.
    { t: 0.75, pose: { thighL: 0.06, shinL: -0.20, thighR: -0.12, shinR: 0.15,
                       upperArmL: 0.03, forearmL: 0.05, upperArmR: 0.10, forearmR: 0.12,
                       torso: -0.01, head: -0.008, weapon: 0.04 } },
    // Loop back.
    { t: 1.0,  pose: { thighL: -0.35, shinL: 0.40, thighR: 0.38, shinR: -0.50,
                       upperArmL: 0.28, forearmL: 0.35, upperArmR: -0.18, forearmR: -0.25,
                       torso: 0.04, head: 0.025, weapon: -0.10 } },
  ],
};

// Wizard walk: light, floating glide. Subtle knee flex, staff sway.
export const WALK_WIZARD = {
  duration: 700,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { thighL: -0.18, shinL: 0.22, thighR: 0.22, shinR: -0.28,
                       upperArmL: 0.15, forearmL: 0.18, upperArmR: -0.10, forearmR: -0.14,
                       torso: 0.02, head: 0.012, weapon: -0.05 } },
    { t: 0.25, pose: { thighL: -0.06, shinL: 0.08, thighR: 0.04, shinR: -0.10,
                       upperArmL: 0.05, forearmL: 0.06, upperArmR: 0.02, forearmR: 0.03,
                       torso: 0.006, head: 0, weapon: -0.01 } },
    { t: 0.5,  pose: { thighL: 0.22, shinL: -0.28, thighR: -0.18, shinR: 0.22,
                       upperArmL: -0.10, forearmL: -0.14, upperArmR: 0.15, forearmR: 0.18,
                       torso: -0.02, head: -0.012, weapon: 0.06 } },
    { t: 0.75, pose: { thighL: 0.04, shinL: -0.10, thighR: -0.06, shinR: 0.08,
                       upperArmL: 0.02, forearmL: 0.03, upperArmR: 0.05, forearmR: 0.06,
                       torso: -0.006, head: 0, weapon: 0.02 } },
    { t: 1.0,  pose: { thighL: -0.18, shinL: 0.22, thighR: 0.22, shinR: -0.28,
                       upperArmL: 0.15, forearmL: 0.18, upperArmR: -0.10, forearmR: -0.14,
                       torso: 0.02, head: 0.012, weapon: -0.05 } },
  ],
};

// Bunny walk: bouncy hop. Both legs compress/extend together with
// visible knee bend on landing, spring extension on launch.
export const WALK_BUNNY = {
  duration: 400,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    // Crouch: knees deeply bent, body compressed
    { t: 0.0,  pose: { thighL: 0.30, shinL: -0.55, thighR: 0.30, shinR: -0.55,
                       torso: 0.07, head: 0.04, weapon: 0.08 } },
    // Launch: legs extend powerfully, body straightens
    { t: 0.3,  pose: { thighL: -0.30, shinL: 0.15, thighR: -0.30, shinR: 0.15,
                       torso: -0.05, head: -0.04, weapon: -0.10 } },
    // Air: legs tuck, body compact
    { t: 0.5,  pose: { thighL: -0.12, shinL: -0.30, thighR: -0.12, shinR: -0.30,
                       torso: -0.03, head: -0.02, weapon: -0.04 } },
    // Land: knees absorb impact, deep flex
    { t: 0.7,  pose: { thighL: 0.20, shinL: -0.45, thighR: 0.20, shinR: -0.45,
                       torso: 0.05, head: 0.03, weapon: 0.06 } },
    // Settle back to crouch
    { t: 1.0,  pose: { thighL: 0.30, shinL: -0.55, thighR: 0.30, shinR: -0.55,
                       torso: 0.07, head: 0.04, weapon: 0.08 } },
  ],
};

// Default walk (used when class is unknown)
export const WALK_CYCLE = WALK_KNIGHT;

// ──────────────────────────────────────────────────────────────
// IDLE — class-specific resting poses with breathing
// ──────────────────────────────────────────────────────────────

// Knight idle: weight on back foot, sword lowered, alert stance.
// Breathing visible in chest expansion + slight head lift.
export const IDLE_KNIGHT = {
  duration: 2800,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0.02, head: 0.01, upperArmL: 0.06, forearmL: 0.10, upperArmR: -0.03, forearmR: -0.08,
                       thighL: -0.04, shinL: 0.06, thighR: 0.06, shinR: -0.04, weapon: 0.03 } },
    { t: 0.4,  pose: { torso: -0.01, head: -0.015, upperArmL: 0.08, forearmL: 0.14, upperArmR: -0.05, forearmR: -0.10,
                       thighL: -0.03, shinL: 0.05, thighR: 0.05, shinR: -0.03, weapon: 0.05 } },
    { t: 0.7,  pose: { torso: 0.025, head: 0.02, upperArmL: 0.05, forearmL: 0.08, upperArmR: -0.02, forearmR: -0.06,
                       thighL: -0.05, shinL: 0.07, thighR: 0.07, shinR: -0.05, weapon: 0.02 } },
    { t: 1.0,  pose: { torso: 0.02, head: 0.01, upperArmL: 0.06, forearmL: 0.10, upperArmR: -0.03, forearmR: -0.08,
                       thighL: -0.04, shinL: 0.06, thighR: 0.06, shinR: -0.04, weapon: 0.03 } },
  ],
};

export const IDLE_WIZARD = {
  duration: 3200,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0.01, head: 0.02, upperArmL: 0.05, forearmL: 0.08, upperArmR: -0.02, forearmR: -0.05,
                       weapon: 0.04, thighL: 0, shinL: 0.02, thighR: 0, shinR: 0.02 } },
    { t: 0.35, pose: { torso: -0.015, head: -0.01, upperArmL: 0.10, forearmL: 0.16, upperArmR: -0.06, forearmR: -0.10,
                       weapon: -0.03, thighL: 0.01, shinL: 0.03, thighR: -0.01, shinR: 0.01 } },
    { t: 0.65, pose: { torso: 0.02, head: 0.015, upperArmL: 0.03, forearmL: 0.05, upperArmR: 0.02, forearmR: 0.03,
                       weapon: 0.06, thighL: -0.01, shinL: 0.01, thighR: 0.01, shinR: 0.03 } },
    { t: 1.0,  pose: { torso: 0.01, head: 0.02, upperArmL: 0.05, forearmL: 0.08, upperArmR: -0.02, forearmR: -0.05,
                       weapon: 0.04, thighL: 0, shinL: 0.02, thighR: 0, shinR: 0.02 } },
  ],
};

export const IDLE_BUNNY = {
  duration: 1800,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0.02, head: 0, thighL: 0.06, shinL: -0.10, thighR: -0.04, shinR: 0.06, weapon: 0.04 } },
    { t: 0.2,  pose: { torso: -0.01, head: -0.03, thighL: -0.02, shinL: -0.04, thighR: -0.02, shinR: -0.04, weapon: 0 } },
    { t: 0.5,  pose: { torso: -0.02, head: 0.02, thighL: -0.04, shinL: 0.06, thighR: 0.06, shinR: -0.10, weapon: -0.03 } },
    { t: 0.7,  pose: { torso: 0.01, head: 0.03, thighL: -0.01, shinL: -0.02, thighR: -0.01, shinR: -0.02, weapon: 0.02 } },
    { t: 1.0,  pose: { torso: 0.02, head: 0, thighL: 0.06, shinL: -0.10, thighR: -0.04, shinR: 0.06, weapon: 0.04 } },
  ],
};

// Default idle
export const IDLE_BREATHE = IDLE_KNIGHT;

// ──────────────────────────────────────────────────────────────
// SELECTION SWAY — weight shift side to side, relaxed posture
// ──────────────────────────────────────────────────────────────
export const SELECTION_SWAY = {
  duration: 3200,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    // Weight on left foot
    { t: 0.0,  pose: { torso: -0.025, head: -0.015, armL: 0.08, armR: -0.04, leftLeg: 0.04, rightLeg: -0.06, weapon: -0.03 } },
    // Transition through center
    { t: 0.25, pose: { torso: 0, head: 0.01, armL: 0.03, armR: 0.01, leftLeg: 0, rightLeg: 0, weapon: 0.01 } },
    // Weight on right foot
    { t: 0.5,  pose: { torso: 0.025, head: 0.02, armL: -0.04, armR: 0.08, leftLeg: -0.06, rightLeg: 0.04, weapon: 0.04 } },
    // Transition back
    { t: 0.75, pose: { torso: 0, head: -0.005, armL: 0.01, armR: 0.03, leftLeg: 0, rightLeg: 0, weapon: 0 } },
    { t: 1.0,  pose: { torso: -0.025, head: -0.015, armL: 0.08, armR: -0.04, leftLeg: 0.04, rightLeg: -0.06, weapon: -0.03 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// ATTACKS — anticipation → strike → follow-through → recover
// ──────────────────────────────────────────────────────────────

// Knight slash: overhead to diagonal. Weight transfers forward
// through the cut, then pulls back.
export const KNIGHT_SLASH = {
  duration: 500,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    // Neutral
    { t: 0.0,  pose: { armR: 0, weapon: 0, torso: 0, armL: 0, head: 0, leftLeg: 0, rightLeg: 0 } },
    // ANTICIPATION: sword goes up and back, weight shifts to rear foot
    { t: 0.2,  pose: { armR: -0.6, weapon: -0.9, torso: 0.10, armL: 0.15, head: 0.06, leftLeg: 0.08, rightLeg: -0.12 } },
    // STRIKE: sword arcs forward and down, weight lunges onto front foot
    { t: 0.45, pose: { armR: 0.7, weapon: 1.1, torso: -0.12, armL: -0.20, head: -0.04, leftLeg: -0.15, rightLeg: 0.20 } },
    // FOLLOW-THROUGH: sword continues past, body momentum carries forward
    { t: 0.6,  pose: { armR: 0.85, weapon: 1.3, torso: -0.15, armL: -0.25, head: -0.06, leftLeg: -0.18, rightLeg: 0.22 } },
    // RECOVER: pull back to guard, settle weight
    { t: 0.8,  pose: { armR: 0.15, weapon: 0.2, torso: -0.02, armL: -0.05, head: 0, leftLeg: -0.03, rightLeg: 0.05 } },
    // SETTLE: micro-overshoot past neutral, then rest
    { t: 1.0,  pose: { armR: 0, weapon: 0, torso: 0, armL: 0, head: 0, leftLeg: 0, rightLeg: 0 } },
  ],
};

// Wizard cast: staff plants, both hands rise channeling energy,
// then thrust forward releasing the spell. Staff leads the motion.
export const WIZARD_CAST = {
  duration: 700,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    // Neutral
    { t: 0.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, head: 0, leftLeg: 0, rightLeg: 0 } },
    // GATHER: arms rise, staff lifts, head tilts back (looking up at the spell forming)
    { t: 0.25, pose: { armL: -0.50, armR: -0.45, weapon: -0.70, torso: -0.05, head: -0.10, leftLeg: 0.03, rightLeg: -0.03 } },
    // CHANNEL: hold at peak, slight tremble (arms fully extended)
    { t: 0.45, pose: { armL: -0.65, armR: -0.60, weapon: -0.85, torso: -0.07, head: -0.12, leftLeg: 0.04, rightLeg: -0.02 } },
    // RELEASE: thrust forward, staff points at target, body follows
    { t: 0.6,  pose: { armL: 0.30, armR: 0.35, weapon: 0.50, torso: 0.08, head: 0.04, leftLeg: -0.06, rightLeg: 0.10 } },
    // FOLLOW-THROUGH: arms extend past, recoil from spell release
    { t: 0.75, pose: { armL: 0.15, armR: 0.20, weapon: 0.30, torso: 0.04, head: 0.02, leftLeg: -0.03, rightLeg: 0.06 } },
    // RECOVER
    { t: 1.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, head: 0, leftLeg: 0, rightLeg: 0 } },
  ],
};

// Bunny punch: boxing combo — jab, cross, hook. Fast and snappy.
// Legs drive the power: each punch starts from the ground up.
export const BUNNY_PUNCH = {
  duration: 450,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    // Stance: guard up, weight centered
    { t: 0.0,  pose: { armR: -0.15, armL: -0.15, torso: 0.04, leftLeg: 0.06, rightLeg: -0.04, head: 0, weapon: -0.08 } },
    // JAB: right arm snaps out, left guards, rear leg pushes
    { t: 0.15, pose: { armR: 0.75, armL: -0.25, torso: -0.06, leftLeg: 0.10, rightLeg: -0.12, head: -0.02, weapon: 0.30 } },
    // RETRACT jab, load cross
    { t: 0.30, pose: { armR: -0.10, armL: -0.20, torso: 0.08, leftLeg: 0.04, rightLeg: 0.06, head: 0.02, weapon: -0.05 } },
    // CROSS: left arm drives through, hips rotate, rear foot pivots
    { t: 0.45, pose: { armR: -0.20, armL: 0.80, torso: -0.10, leftLeg: -0.08, rightLeg: 0.15, head: -0.03, weapon: -0.12 } },
    // RETRACT cross, load hook
    { t: 0.55, pose: { armR: -0.15, armL: -0.10, torso: 0.06, leftLeg: 0.02, rightLeg: 0.04, head: 0.01, weapon: -0.06 } },
    // HOOK: right arm arcs wide, full hip rotation, front foot plants
    { t: 0.70, pose: { armR: 0.90, armL: -0.30, torso: -0.14, leftLeg: -0.12, rightLeg: 0.18, head: -0.05, weapon: 0.40 } },
    // FOLLOW-THROUGH: momentum carry
    { t: 0.82, pose: { armR: 0.50, armL: -0.15, torso: -0.08, leftLeg: -0.06, rightLeg: 0.10, head: -0.02, weapon: 0.20 } },
    // RECOVER to guard
    { t: 1.0,  pose: { armR: 0, armL: 0, torso: 0, leftLeg: 0, rightLeg: 0, head: 0, weapon: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// GUARD — class-specific defensive stances
// ──────────────────────────────────────────────────────────────

// Knight guard: shield-up posture (arm and weapon cross body)
export const GUARD_KNIGHT = {
  duration: 350,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, leftLeg: 0, rightLeg: 0, head: 0 } },
    // Tuck behind weapon, lower center of gravity
    { t: 0.6,  pose: { armL: -0.30, armR: 0.25, weapon: -0.40, torso: 0.06, leftLeg: 0.08, rightLeg: -0.10, head: 0.04 } },
    // Settle into hold
    { t: 1.0,  pose: { armL: -0.25, armR: 0.20, weapon: -0.35, torso: 0.05, leftLeg: 0.06, rightLeg: -0.08, head: 0.03 } },
  ],
};

export const GUARD_STANCE = GUARD_KNIGHT;

// ──────────────────────────────────────────────────────────────
// HIT — pain reaction with proper body mechanics
// Weight goes backward, head snaps back (whiplash), arms flail
// ──────────────────────────────────────────────────────────────
export const HIT_FLINCH = {
  duration: 400,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, leftLeg: 0, rightLeg: 0, weapon: 0 } },
    // IMPACT: body jolts backward, head whips back (delayed from torso)
    { t: 0.15, pose: { torso: 0.18, head: 0.06, armL: 0.25, armR: 0.30, leftLeg: -0.08, rightLeg: 0.05, weapon: 0.20 } },
    // HEAD CATCHES UP (whiplash): head snaps further back than torso
    { t: 0.30, pose: { torso: 0.12, head: 0.20, armL: 0.35, armR: 0.40, leftLeg: -0.12, rightLeg: 0.08, weapon: 0.30 } },
    // RECOVERY: body begins to right itself
    { t: 0.55, pose: { torso: 0.06, head: 0.08, armL: 0.15, armR: 0.18, leftLeg: -0.05, rightLeg: 0.03, weapon: 0.12 } },
    // SETTLE: slight overshoot forward then rest
    { t: 0.80, pose: { torso: -0.02, head: -0.01, armL: 0.03, armR: 0.04, leftLeg: 0.01, rightLeg: -0.01, weapon: 0.02 } },
    { t: 1.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, leftLeg: 0, rightLeg: 0, weapon: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// KO — staged collapse (not a stiff timber-fall)
// Knees buckle first, then torso folds, then head drops last
// ──────────────────────────────────────────────────────────────
export const KO_COLLAPSE = {
  duration: 800,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, weapon: 0, leftLeg: 0, rightLeg: 0 } },
    // KNEES BUCKLE: legs give out, torso still upright
    { t: 0.25, pose: { leftLeg: 0.25, rightLeg: 0.30, torso: 0.08, head: 0.02, armL: 0.10, armR: 0.12, weapon: 0.15 } },
    // TORSO FOLDS: upper body follows the legs down
    { t: 0.50, pose: { leftLeg: 0.35, rightLeg: 0.40, torso: 0.30, head: 0.15, armL: 0.40, armR: 0.45, weapon: 0.60 } },
    // HEAD DROPS LAST: ragdoll settles
    { t: 0.75, pose: { leftLeg: 0.30, rightLeg: 0.35, torso: 0.45, head: 0.50, armL: 0.55, armR: 0.65, weapon: 0.90 } },
    // FINAL: limp
    { t: 1.0,  pose: { leftLeg: 0.28, rightLeg: 0.32, torso: 0.48, head: 0.55, armL: 0.60, armR: 0.70, weapon: 1.0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// VICTORY — genuine celebration with personality
// Crouch first (anticipation), then leap with arms up
// ──────────────────────────────────────────────────────────────
export const VICTORY_CHEER = {
  duration: 900,
  loop: false,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, weapon: 0, leftLeg: 0, rightLeg: 0 } },
    // ANTICIPATION: crouch down, gather energy
    { t: 0.15, pose: { torso: 0.06, head: 0.03, armL: 0.15, armR: 0.12, weapon: 0.10, leftLeg: 0.12, rightLeg: 0.12 } },
    // LAUNCH: spring up, arms thrust skyward, weapon raised
    { t: 0.35, pose: { torso: -0.08, head: -0.12, armL: -0.85, armR: -0.90, weapon: -1.10, leftLeg: -0.15, rightLeg: -0.15 } },
    // PEAK: maximum extension, slight arch
    { t: 0.50, pose: { torso: -0.10, head: -0.18, armL: -1.0, armR: -1.05, weapon: -1.25, leftLeg: -0.10, rightLeg: -0.10 } },
    // LAND: absorb with legs, arms still up
    { t: 0.65, pose: { torso: 0.03, head: -0.10, armL: -0.75, armR: -0.80, weapon: -0.95, leftLeg: 0.08, rightLeg: 0.08 } },
    // SETTLE: relax into proud stance
    { t: 0.85, pose: { torso: -0.03, head: -0.06, armL: -0.50, armR: -0.55, weapon: -0.65, leftLeg: 0.02, rightLeg: 0.02 } },
    // HOLD: proud pose
    { t: 1.0,  pose: { torso: -0.02, head: -0.05, armL: -0.45, armR: -0.50, weapon: -0.60, leftLeg: 0, rightLeg: 0 } },
  ],
};
