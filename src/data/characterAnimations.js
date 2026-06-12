/**
 * Character animation keyframe data.
 *
 * Each animation is { duration (ms), loop (bool), ease, keyframes }.
 * Keyframes: [{ t: 0..1, pose: { partName: angleRadians } }].
 *
 * Part names: leftLeg, rightLeg, torso, armL, armR, weapon, head.
 * Angles are in radians. Positive = clockwise.
 */

// ──────────────────────────────────────────────────────────────
// WALK — alternating leg swing with counter-arm movement
// ──────────────────────────────────────────────────────────────
export const WALK_CYCLE = {
  duration: 500,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { leftLeg: -0.35, rightLeg: 0.35, armL: 0.25, armR: -0.25, torso: 0.02, head: 0.01, weapon: -0.15 } },
    { t: 0.5,  pose: { leftLeg: 0.35, rightLeg: -0.35, armL: -0.25, armR: 0.25, torso: -0.02, head: -0.01, weapon: 0.15 } },
    { t: 1.0,  pose: { leftLeg: -0.35, rightLeg: 0.35, armL: 0.25, armR: -0.25, torso: 0.02, head: 0.01, weapon: -0.15 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// IDLE — gentle breathing with subtle limb sway
// ──────────────────────────────────────────────────────────────
export const IDLE_BREATHE = {
  duration: 2400,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0.04, armR: -0.04, leftLeg: 0, rightLeg: 0, weapon: 0.02 } },
    { t: 0.5,  pose: { torso: 0.025, head: 0.015, armL: 0.08, armR: -0.02, leftLeg: 0.01, rightLeg: -0.01, weapon: 0.05 } },
    { t: 1.0,  pose: { torso: 0, head: 0, armL: 0.04, armR: -0.04, leftLeg: 0, rightLeg: 0, weapon: 0.02 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// SELECTION SWAY — gentle rocking for menus/gallery
// ──────────────────────────────────────────────────────────────
export const SELECTION_SWAY = {
  duration: 3000,
  loop: true,
  ease: 'Sine.inOut',
  keyframes: [
    { t: 0.0,  pose: { torso: -0.03, head: -0.02, armL: 0.06, armR: -0.06, weapon: -0.04 } },
    { t: 0.5,  pose: { torso: 0.03, head: 0.02, armL: -0.02, armR: 0.06, weapon: 0.04 } },
    { t: 1.0,  pose: { torso: -0.03, head: -0.02, armL: 0.06, armR: -0.06, weapon: -0.04 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// KNIGHT SLASH — weapon arm swings forward
// ──────────────────────────────────────────────────────────────
export const KNIGHT_SLASH = {
  duration: 400,
  loop: false,
  ease: 'Back.out',
  keyframes: [
    { t: 0.0,  pose: { armR: -0.4, weapon: -0.6, torso: 0.08, armL: 0.15, head: 0.05 } },
    { t: 0.4,  pose: { armR: 0.8, weapon: 1.2, torso: -0.1, armL: -0.2, head: -0.05 } },
    { t: 0.7,  pose: { armR: 0.6, weapon: 0.9, torso: -0.05, armL: -0.1, head: 0 } },
    { t: 1.0,  pose: { armR: 0, weapon: 0, torso: 0, armL: 0, head: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// WIZARD CAST — arms raise, staff lifts, head tilts back
// ──────────────────────────────────────────────────────────────
export const WIZARD_CAST = {
  duration: 600,
  loop: false,
  ease: 'Quad.out',
  keyframes: [
    { t: 0.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, head: 0 } },
    { t: 0.3,  pose: { armL: -0.6, armR: -0.5, weapon: -0.8, torso: -0.05, head: -0.1 } },
    { t: 0.6,  pose: { armL: -0.8, armR: -0.7, weapon: -1.0, torso: -0.08, head: -0.15 } },
    { t: 0.8,  pose: { armL: -0.4, armR: -0.3, weapon: -0.5, torso: 0.05, head: 0.05 } },
    { t: 1.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, head: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// BUNNY PUNCH — rapid jab sequence
// ──────────────────────────────────────────────────────────────
export const BUNNY_PUNCH = {
  duration: 350,
  loop: false,
  ease: 'Cubic.out',
  keyframes: [
    { t: 0.0,  pose: { armR: 0, armL: 0, torso: 0.05, leftLeg: -0.1, rightLeg: 0.1 } },
    { t: 0.2,  pose: { armR: 0.9, armL: -0.3, torso: -0.08, leftLeg: 0.15, rightLeg: -0.05 } },
    { t: 0.4,  pose: { armR: 0.2, armL: 0.8, torso: -0.06, leftLeg: -0.05, rightLeg: 0.15 } },
    { t: 0.6,  pose: { armR: 1.0, armL: -0.2, torso: -0.1, leftLeg: 0.2, rightLeg: -0.1 } },
    { t: 1.0,  pose: { armR: 0, armL: 0, torso: 0, leftLeg: 0, rightLeg: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// GUARD — defensive stance
// ──────────────────────────────────────────────────────────────
export const GUARD_STANCE = {
  duration: 300,
  loop: false,
  ease: 'Back.out',
  keyframes: [
    { t: 0.0,  pose: { armL: 0, armR: 0, weapon: 0, torso: 0, leftLeg: 0, rightLeg: 0 } },
    { t: 1.0,  pose: { armL: -0.4, armR: 0.3, weapon: -0.5, torso: 0.05, leftLeg: -0.08, rightLeg: 0.12 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// HIT — flinch backward
// ──────────────────────────────────────────────────────────────
export const HIT_FLINCH = {
  duration: 300,
  loop: false,
  ease: 'Quad.out',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0 } },
    { t: 0.3,  pose: { torso: 0.15, head: 0.1, armL: 0.3, armR: 0.25, leftLeg: -0.1, rightLeg: 0.05 } },
    { t: 1.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, leftLeg: 0, rightLeg: 0 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// KO — collapse
// ──────────────────────────────────────────────────────────────
export const KO_COLLAPSE = {
  duration: 600,
  loop: false,
  ease: 'Quad.in',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0 } },
    { t: 0.5,  pose: { torso: 0.3, head: 0.4, armL: 0.5, armR: 0.6, weapon: 0.8, leftLeg: -0.2, rightLeg: 0.3 } },
    { t: 1.0,  pose: { torso: 0.5, head: 0.6, armL: 0.7, armR: 0.8, weapon: 1.2, leftLeg: -0.3, rightLeg: 0.4 } },
  ],
};

// ──────────────────────────────────────────────────────────────
// VICTORY — jump and arm raise
// ──────────────────────────────────────────────────────────────
export const VICTORY_CHEER = {
  duration: 800,
  loop: false,
  ease: 'Back.out',
  keyframes: [
    { t: 0.0,  pose: { torso: 0, head: 0, armL: 0, armR: 0, weapon: 0 } },
    { t: 0.3,  pose: { torso: -0.05, armL: -0.9, armR: -0.8, weapon: -1.0, head: -0.15, leftLeg: 0.1, rightLeg: -0.1 } },
    { t: 0.6,  pose: { torso: -0.08, armL: -1.1, armR: -1.0, weapon: -1.2, head: -0.2, leftLeg: 0.15, rightLeg: -0.15 } },
    { t: 1.0,  pose: { torso: -0.03, armL: -0.7, armR: -0.6, weapon: -0.8, head: -0.1, leftLeg: 0.05, rightLeg: -0.05 } },
  ],
};
