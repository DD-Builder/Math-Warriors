/**
 * Evolution visual modifiers — tints, glows, auras, and particles
 * applied to hero sprites at each evolution stage.
 *
 * Stage 1: no visual change (returns null).
 * Stage 2: subtle glow + slight tint per class.
 * Stage 3: vibrant glow + strong tint per path + orbiting particles.
 */

import { PAPER } from '../config.js';
import { getHeroById, HERO_EVOLUTIONS } from './heroes.js';

// ── MASTERY → COLOR MAP ──────────────────────────────────────────────
// Each math domain gets a distinct accent color so Stage 3 paths that
// require different masteries look visually distinct.
const MASTERY_COLORS = {
  addition:      PAPER.gold,       // warm gold
  subtraction:   PAPER.coralD,     // deep coral
  multiplication:PAPER.teal,       // teal
  division:      PAPER.lavenderD,  // deep lavender
  fractions:     PAPER.peach,      // warm peach
  geometry:      PAPER.sky,        // cool sky blue
  measurement:   PAPER.sage,       // sage green
  time:          PAPER.lavender,   // lavender
  patterns:      PAPER.rose,       // rose pink
};

// ── CLASS DEFAULTS (STAGE 2) ─────────────────────────────────────────
const CLASS_STAGE2 = {
  knight: {
    tintColor: PAPER.tealL,
    glowColor: PAPER.teal,
    glowAlpha: 0.2,
    scaleBoost: 1.05,
    auraRadius: 70,
    particleColor: null,
    particleCount: 0,
  },
  wizard: {
    tintColor: PAPER.lavender,
    glowColor: PAPER.lavender,
    glowAlpha: 0.2,
    scaleBoost: 1.05,
    auraRadius: 65,
    particleColor: null,
    particleCount: 0,
  },
  bunny: {
    tintColor: PAPER.coral,
    glowColor: PAPER.coral,
    glowAlpha: 0.2,
    scaleBoost: 1.05,
    auraRadius: 60,
    particleColor: null,
    particleCount: 0,
  },
};

/**
 * Look up the mastery skill required by a specific Stage 3 path.
 * Returns the mastery string (e.g. 'addition') or null.
 */
function getPathMastery(heroId, pathId) {
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef?.stage3?.paths) return null;
  const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
  return pathDef?.mastery ?? null;
}

/**
 * Get visual evolution modifiers for a hero at a given stage/path.
 *
 * @param {string} heroId   - Hero identifier (e.g. 'knight-shadow')
 * @param {number} stage    - Evolution stage (1, 2, or 3)
 * @param {string|null} pathId - Stage 3 path id, or null for stages 1-2
 * @returns {object|null}   Modifier object, or null for stage 1
 *   { tintColor, glowColor, glowAlpha, scaleBoost, auraRadius,
 *     particleColor, particleCount }
 */
export function getEvolutionModifiers(heroId, stage, pathId) {
  if (stage <= 1) return null;

  const hero = getHeroById(heroId);
  if (!hero) return null;

  const heroClass = hero.class; // 'knight' | 'wizard' | 'bunny'

  // ── Stage 2: subtle class-based glow ─────────────────────────────
  if (stage === 2) {
    const base = CLASS_STAGE2[heroClass];
    if (!base) return null;
    return { ...base };
  }

  // ── Stage 3: vibrant path-based glow + orbiting particles ────────
  const mastery = getPathMastery(heroId, pathId);
  const accentColor = MASTERY_COLORS[mastery] || PAPER.gold;

  // Derive a slightly lighter tint from the accent
  const classBase = CLASS_STAGE2[heroClass];
  const baseGlow = classBase ? classBase.glowColor : PAPER.gold;

  return {
    tintColor: accentColor,
    glowColor: accentColor,
    glowAlpha: 0.35,
    scaleBoost: 1.1,
    auraRadius: 85,
    particleColor: accentColor,
    particleCount: 4,
  };
}
