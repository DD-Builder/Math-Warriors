/**
 * Evolution system — tracks and triggers hero evolution stages.
 *
 * Each hero has 3 stages:
 *   Stage 1: Starting form (levels 1-4)
 *   Stage 2: Warrior form (requires level 5 + beating a floor)
 *   Stage 3: Master form (requires level 8 + math domain mastery, branching choice)
 *
 * Evolution data is stored in save.heroEvolution:
 *   { 'knight-shadow': { stage: 2, path: null },
 *     'wizard-stargazer': { stage: 3, path: 'constellation-mage' } }
 */

import { getHeroById, HERO_EVOLUTIONS } from '../data/heroes.js';
import { getSkillMastery } from './mastery.js';

// ------------------------------------------------------------------
// STAGE QUERIES
// ------------------------------------------------------------------

/**
 * Get the current evolution stage for a hero from save data.
 * Returns 1 if no evolution data exists.
 */
export function getEvolutionStage(save, heroId) {
  const evo = save.heroEvolution?.[heroId];
  return evo ? evo.stage : 1;
}

/**
 * Get the chosen evolution path for a Stage 3 hero.
 * Returns null if not yet at Stage 3 or no path chosen.
 */
export function getEvolutionPath(save, heroId) {
  const evo = save.heroEvolution?.[heroId];
  return evo?.path ?? null;
}

// ------------------------------------------------------------------
// ELIGIBILITY CHECKS
// ------------------------------------------------------------------

/**
 * Check if a hero is eligible for Stage 2 evolution.
 * Requirements: hero level >= stage2.level AND floor requirement met.
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function canEvolveStage2(save, heroId, heroLevel) {
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return { eligible: false, reason: 'Hero has no evolution data.' };

  const currentStage = getEvolutionStage(save, heroId);
  if (currentStage >= 2) return { eligible: false, reason: 'Already evolved to Stage 2 or higher.' };

  const { level, floor } = evoDef.stage2;

  if (heroLevel < level) {
    return { eligible: false, reason: `Requires level ${level} (current: ${heroLevel}).` };
  }

  const floorData = (save.floors || []).find(f => f && f.id === floor);
  if (!floorData || !floorData.complete) {
    return { eligible: false, reason: `Requires floor ${floor} beaten.` };
  }

  return { eligible: true };
}

/**
 * Check if a hero is eligible for Stage 3 evolution.
 * Requirements: hero level >= stage3.paths[i].level AND mastery requirement met.
 * @returns {{ eligible: boolean, paths: Array<{ id, name, masteryMet: boolean }> }}
 */
export function canEvolveStage3(save, heroId, heroLevel) {
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return { eligible: false, paths: [] };

  const currentStage = getEvolutionStage(save, heroId);
  if (currentStage < 2) return { eligible: false, paths: [] };
  if (currentStage >= 3) return { eligible: false, paths: [] };

  const paths = evoDef.stage3.paths.map(p => {
    const levelMet = heroLevel >= p.level;
    const mastery = getSkillMastery(save, p.mastery);
    const masteryMet = mastery.level === 'mastered';
    return {
      id: p.id,
      name: p.name,
      levelMet,
      masteryMet,
      masterySkill: p.mastery,
      requiredLevel: p.level,
    };
  });

  const eligible = paths.some(p => p.levelMet && p.masteryMet);
  return { eligible, paths };
}

// ------------------------------------------------------------------
// EVOLUTION ACTIONS
// ------------------------------------------------------------------

/**
 * Perform Stage 2 evolution. Updates save data.
 * Returns the evolution data for display in the evolution ceremony.
 */
export function evolveStage2(save, heroId) {
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return null;

  if (!save.heroEvolution) save.heroEvolution = {};
  save.heroEvolution[heroId] = { stage: 2, path: null };

  return {
    heroId,
    stage: 2,
    name: evoDef.stage2.name,
    title: evoDef.stage2.title,
    statBoosts: evoDef.stage2.statBoosts,
    superMove: evoDef.stage2.superMove,
  };
}

/**
 * Perform Stage 3 evolution with chosen path. Updates save data.
 * Returns the evolution data for display in the evolution ceremony.
 */
export function evolveStage3(save, heroId, pathId) {
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return null;

  const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
  if (!pathDef) return null;

  if (!save.heroEvolution) save.heroEvolution = {};
  save.heroEvolution[heroId] = { stage: 3, path: pathId };

  return {
    heroId,
    stage: 3,
    pathId,
    name: pathDef.name,
    title: pathDef.title,
    statBoosts: pathDef.statBoosts,
    superMove: pathDef.superMove,
  };
}

// ------------------------------------------------------------------
// DISPLAY HELPERS
// ------------------------------------------------------------------

/**
 * Get the display name for a hero at their current evolution stage.
 */
export function getEvolvedName(save, heroId) {
  const hero = getHeroById(heroId);
  if (!hero) return '';

  const stage = getEvolutionStage(save, heroId);
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return hero.name;

  if (stage === 2) return evoDef.stage2.name;
  if (stage === 3) {
    const pathId = getEvolutionPath(save, heroId);
    const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
    return pathDef ? pathDef.name : evoDef.stage2.name;
  }
  return hero.name;
}

/**
 * Get the display title for a hero at their current evolution stage.
 */
export function getEvolvedTitle(save, heroId) {
  const hero = getHeroById(heroId);
  if (!hero) return '';

  const stage = getEvolutionStage(save, heroId);
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef) return hero.trait;

  if (stage === 2) return evoDef.stage2.title;
  if (stage === 3) {
    const pathId = getEvolutionPath(save, heroId);
    const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
    return pathDef ? pathDef.title : evoDef.stage2.title;
  }
  return hero.trait;
}

// ------------------------------------------------------------------
// STAT / SUPER HELPERS
// ------------------------------------------------------------------

/**
 * Get stat boosts from evolution stages.
 * Returns cumulative boosts from all completed evolutions.
 */
export function getEvolutionStatBoosts(save, heroId) {
  const stage = getEvolutionStage(save, heroId);
  const evoDef = HERO_EVOLUTIONS[heroId];
  if (!evoDef || stage < 2) return { atk: 0, def: 0, maxHp: 0 };

  const boosts = { atk: 0, def: 0, maxHp: 0 };

  // Stage 2 boosts
  const s2 = evoDef.stage2.statBoosts;
  boosts.atk += s2.atk || 0;
  boosts.def += s2.def || 0;
  boosts.maxHp += s2.maxHp || 0;

  // Stage 3 boosts (cumulative on top of Stage 2)
  if (stage >= 3) {
    const pathId = getEvolutionPath(save, heroId);
    const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
    if (pathDef) {
      const s3 = pathDef.statBoosts;
      boosts.atk += s3.atk || 0;
      boosts.def += s3.def || 0;
      boosts.maxHp += s3.maxHp || 0;
    }
  }

  return boosts;
}

/**
 * Get all super moves available at current evolution stage.
 * Includes base supers + any evolution-granted supers.
 */
export function getEvolutionSupers(save, heroId) {
  const hero = getHeroById(heroId);
  if (!hero) return [];

  const stage = getEvolutionStage(save, heroId);
  const evoDef = HERO_EVOLUTIONS[heroId];
  const supers = [...hero.superMoves];

  if (evoDef && stage >= 2 && evoDef.stage2.superMove) {
    supers.push(evoDef.stage2.superMove);
  }

  if (evoDef && stage >= 3) {
    const pathId = getEvolutionPath(save, heroId);
    const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
    if (pathDef?.superMove) {
      supers.push(pathDef.superMove);
    }
  }

  return supers;
}
