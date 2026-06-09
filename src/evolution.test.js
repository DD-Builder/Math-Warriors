/**
 * Unit tests for src/systems/evolution.js
 *
 * Saves are hand-built plain objects. Mastery windows (save.skillStats)
 * are constructed with controlled recent[] arrays so accuracy tiers are
 * exact (see systems/mastery.js: learning < 65%, practicing 65-84%,
 * mastered >= 85% with 20+ attempts; first 10 attempts always learning).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMasteryId,
  getEvolutionStage,
  getEvolutionPath,
  canEvolveStage2,
  canEvolveStage3,
  evolveStage2,
  evolveStage3,
  getEvolvedName,
  getEvolvedTitle,
  getEvolutionStatBoosts,
  getEvolutionSupers,
} from './systems/evolution.js';
import { HERO_EVOLUTIONS, getHeroById } from './data/heroes.js';

const HERO = 'knight-shadow'; // stage2: level 5 + floor 2; stage3 paths: addition / subtraction, level 8

/** Build a minimal save. */
function makeSave({ stage = null, path = null, floorsComplete = [] } = {}) {
  const save = {
    floors: [1, 2, 3, 4, 5].map((id) => ({ id, unlocked: true, complete: floorsComplete.includes(id) })),
    skillStats: {},
  };
  if (stage) {
    save.heroEvolution = { [HERO]: { stage, path } };
  }
  return save;
}

/** Build a skillStats entry with an exact rolling-accuracy window. */
function skillWindow(correctCount, wrongCount) {
  const recent = [
    ...Array(correctCount).fill(1),
    ...Array(wrongCount).fill(0),
  ];
  return { correct: correctCount, total: recent.length, recent };
}

// ------------------------------------------------------------------
// canEvolveStage2
// ------------------------------------------------------------------

describe('canEvolveStage2', () => {
  test('eligible at level 5 with floor 2 complete', () => {
    const save = makeSave({ floorsComplete: [1, 2] });
    assert.deepEqual(canEvolveStage2(save, HERO, 5), { eligible: true });
  });

  test('level gate: rejected below required level', () => {
    const save = makeSave({ floorsComplete: [1, 2] });
    const r = canEvolveStage2(save, HERO, 4);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /level 5/);
  });

  test('floor gate: rejected when required floor not complete', () => {
    const save = makeSave({ floorsComplete: [1] });
    const r = canEvolveStage2(save, HERO, 5);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /floor 2/);
  });

  test('floor gate: rejected when floors array missing entirely', () => {
    const r = canEvolveStage2({ }, HERO, 5);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /floor/);
  });

  test('already evolved to stage 2 is rejected', () => {
    const save = makeSave({ stage: 2, floorsComplete: [1, 2] });
    const r = canEvolveStage2(save, HERO, 9);
    assert.equal(r.eligible, false);
    assert.match(r.reason, /Already evolved/);
  });

  test('unknown hero id is rejected', () => {
    const r = canEvolveStage2(makeSave(), 'no-such-hero', 99);
    assert.equal(r.eligible, false);
  });
});

// ------------------------------------------------------------------
// canEvolveStage3
// ------------------------------------------------------------------

describe('canEvolveStage3', () => {
  test('requires stage 2 first', () => {
    const save = makeSave(); // stage 1
    assert.deepEqual(canEvolveStage3(save, HERO, 10), { eligible: false, paths: [] });
  });

  test('already at stage 3 is rejected', () => {
    const save = makeSave({ stage: 3, path: 'shadow-paladin' });
    assert.deepEqual(canEvolveStage3(save, HERO, 10), { eligible: false, paths: [] });
  });

  test("'practicing' mastery (65-84%, 10+ attempts) qualifies", () => {
    const save = makeSave({ stage: 2 });
    // addition: 7/10 correct = 70% accuracy -> practicing
    save.skillStats['+'] = skillWindow(7, 3);
    const r = canEvolveStage3(save, HERO, 8);
    assert.equal(r.eligible, true);

    const paladin = r.paths.find((p) => p.id === 'shadow-paladin');
    assert.equal(paladin.masteryMet, true);
    assert.equal(paladin.masteryLevel, 'practicing');
    assert.equal(paladin.levelMet, true);
  });

  test("'mastered' mastery (85%+, 20+ attempts) also qualifies", () => {
    const save = makeSave({ stage: 2 });
    save.skillStats['+'] = skillWindow(20, 0); // 100%, 20 attempts -> mastered
    const r = canEvolveStage3(save, HERO, 8);
    const paladin = r.paths.find((p) => p.id === 'shadow-paladin');
    assert.equal(paladin.masteryLevel, 'mastered');
    assert.equal(paladin.masteryMet, true);
    assert.equal(r.eligible, true);
  });

  test('learning-tier mastery does not qualify', () => {
    const save = makeSave({ stage: 2 });
    save.skillStats['+'] = skillWindow(5, 5); // 50% -> learning
    const r = canEvolveStage3(save, HERO, 8);
    const paladin = r.paths.find((p) => p.id === 'shadow-paladin');
    assert.equal(paladin.masteryMet, false);
    assert.equal(paladin.masteryLevel, 'learning');
    assert.equal(r.eligible, false);
  });

  test('fewer than 10 attempts is always learning even at 100%', () => {
    const save = makeSave({ stage: 2 });
    save.skillStats['+'] = skillWindow(9, 0); // 9 attempts -> learning regardless
    const r = canEvolveStage3(save, HERO, 8);
    assert.equal(r.paths.find((p) => p.id === 'shadow-paladin').masteryMet, false);
    assert.equal(r.eligible, false);
  });

  test('paths report masteryMet independently per skill', () => {
    const save = makeSave({ stage: 2 });
    save.skillStats['+'] = skillWindow(5, 5);  // addition: learning
    save.skillStats['-'] = skillWindow(8, 2);  // subtraction: 80% practicing
    const r = canEvolveStage3(save, HERO, 8);

    assert.equal(r.paths.find((p) => p.id === 'shadow-paladin').masteryMet, false);
    assert.equal(r.paths.find((p) => p.id === 'shadow-assassin').masteryMet, true);
    assert.equal(r.eligible, true); // one qualifying path is enough
  });

  test('level gate: mastery met but level too low blocks eligibility', () => {
    const save = makeSave({ stage: 2 });
    save.skillStats['+'] = skillWindow(20, 0);
    const r = canEvolveStage3(save, HERO, 7);
    const paladin = r.paths.find((p) => p.id === 'shadow-paladin');
    assert.equal(paladin.masteryMet, true);
    assert.equal(paladin.levelMet, false);
    assert.equal(r.eligible, false);
  });

  test('resolveMasteryId maps descriptive names to skill ids', () => {
    assert.equal(resolveMasteryId('addition'), '+');
    assert.equal(resolveMasteryId('subtraction'), '-');
    assert.equal(resolveMasteryId('multiplication'), '*');
    assert.equal(resolveMasteryId('division'), '/');
    assert.equal(resolveMasteryId('fractions'), 'frac');
    assert.equal(resolveMasteryId('geometry'), 'geo');
    // unknown names pass through
    assert.equal(resolveMasteryId('frac'), 'frac');
  });
});

// ------------------------------------------------------------------
// evolveStage2 / evolveStage3
// ------------------------------------------------------------------

describe('evolveStage2', () => {
  test('writes save shape and returns the display payload', () => {
    const save = makeSave();
    const evoDef = HERO_EVOLUTIONS[HERO];
    const payload = evolveStage2(save, HERO);

    assert.deepEqual(save.heroEvolution[HERO], { stage: 2, path: null });
    assert.equal(getEvolutionStage(save, HERO), 2);
    assert.equal(getEvolutionPath(save, HERO), null);

    assert.deepEqual(payload, {
      heroId: HERO,
      stage: 2,
      name: evoDef.stage2.name,            // 'Shadow Knight'
      title: evoDef.stage2.title,
      statBoosts: evoDef.stage2.statBoost, // { maxHp: 5, atk: 2, def: 1 }
      superMove: evoDef.stage2.newSuper,   // Dark Cleave x2.5
    });
    assert.equal(payload.name, 'Shadow Knight');
    assert.deepEqual(payload.statBoosts, { maxHp: 5, atk: 2, def: 1 });
    assert.equal(payload.superMove.name, 'Dark Cleave');
  });

  test('creates heroEvolution map when missing', () => {
    const save = {};
    evolveStage2(save, HERO);
    assert.deepEqual(save.heroEvolution[HERO], { stage: 2, path: null });
  });

  test('returns null for unknown hero and does not touch the save', () => {
    const save = makeSave();
    assert.equal(evolveStage2(save, 'no-such-hero'), null);
    assert.equal(save.heroEvolution, undefined);
  });
});

describe('evolveStage3', () => {
  test('writes save shape with chosen path and returns the display payload', () => {
    const save = makeSave({ stage: 2 });
    const payload = evolveStage3(save, HERO, 'shadow-assassin');

    assert.deepEqual(save.heroEvolution[HERO], { stage: 3, path: 'shadow-assassin' });
    assert.equal(getEvolutionStage(save, HERO), 3);
    assert.equal(getEvolutionPath(save, HERO), 'shadow-assassin');

    assert.equal(payload.stage, 3);
    assert.equal(payload.pathId, 'shadow-assassin');
    assert.equal(payload.name, 'Shadow Assassin');
    assert.deepEqual(payload.statBoosts, { maxHp: 3, atk: 5, def: 1 });
    assert.equal(payload.superMove.name, 'Void Slash');
    assert.equal(payload.superMove.multiplier, 4);
  });

  test('rejects an unknown path id without mutating the save', () => {
    const save = makeSave({ stage: 2 });
    assert.equal(evolveStage3(save, HERO, 'not-a-path'), null);
    assert.deepEqual(save.heroEvolution[HERO], { stage: 2, path: null });
  });
});

// ------------------------------------------------------------------
// getEvolutionStatBoosts / getEvolutionSupers
// ------------------------------------------------------------------

describe('getEvolutionStatBoosts', () => {
  test('stage 1 has no boosts', () => {
    assert.deepEqual(getEvolutionStatBoosts(makeSave(), HERO), { atk: 0, def: 0, maxHp: 0 });
  });

  test('stage 2 returns the stage 2 boosts', () => {
    const save = makeSave({ stage: 2 });
    assert.deepEqual(getEvolutionStatBoosts(save, HERO), { atk: 2, def: 1, maxHp: 5 });
  });

  test('stage 3 accumulates stage2 + chosen path boosts', () => {
    const save = makeSave({ stage: 3, path: 'shadow-assassin' });
    // stage2 {5,2,1} + assassin {3,5,1}
    assert.deepEqual(getEvolutionStatBoosts(save, HERO), { atk: 7, def: 2, maxHp: 8 });
  });

  test('the two stage-3 paths accumulate differently', () => {
    const paladin = getEvolutionStatBoosts(makeSave({ stage: 3, path: 'shadow-paladin' }), HERO);
    const assassin = getEvolutionStatBoosts(makeSave({ stage: 3, path: 'shadow-assassin' }), HERO);
    assert.deepEqual(paladin, { atk: 4, def: 5, maxHp: 13 });
    assert.notDeepEqual(paladin, assassin);
  });
});

describe('getEvolutionSupers', () => {
  const baseCount = getHeroById(HERO).superMoves.length;

  test('stage 1 returns only the base supers', () => {
    const supers = getEvolutionSupers(makeSave(), HERO);
    assert.equal(supers.length, baseCount);
  });

  test('stage 2 appends the stage2 newSuper', () => {
    const supers = getEvolutionSupers(makeSave({ stage: 2 }), HERO);
    assert.equal(supers.length, baseCount + 1);
    assert.equal(supers.at(-1).name, 'Dark Cleave');
  });

  test('stage 3 includes both stage2 and path newSuper entries', () => {
    const supers = getEvolutionSupers(makeSave({ stage: 3, path: 'shadow-assassin' }), HERO);
    assert.equal(supers.length, baseCount + 2);
    const names = supers.map((s) => s.name);
    assert.ok(names.includes('Dark Cleave'));
    assert.equal(supers.at(-1).name, 'Void Slash');
  });

  test('does not mutate the hero definition superMoves array', () => {
    getEvolutionSupers(makeSave({ stage: 3, path: 'shadow-assassin' }), HERO);
    assert.equal(getHeroById(HERO).superMoves.length, baseCount);
  });
});

// ------------------------------------------------------------------
// getEvolvedName / getEvolvedTitle
// ------------------------------------------------------------------

describe('getEvolvedName', () => {
  test('stage 1 uses the base hero name', () => {
    assert.equal(getEvolvedName(makeSave(), HERO), 'Shadow');
  });

  test('stage 2 uses the stage2 name', () => {
    assert.equal(getEvolvedName(makeSave({ stage: 2 }), HERO), 'Shadow Knight');
  });

  test('stage 3 uses the chosen path name', () => {
    assert.equal(getEvolvedName(makeSave({ stage: 3, path: 'shadow-paladin' }), HERO), 'Shadow Paladin');
  });

  test('falls back safely to the stage2 name for a missing/unknown path', () => {
    assert.equal(getEvolvedName(makeSave({ stage: 3, path: 'bogus-path' }), HERO), 'Shadow Knight');
    assert.equal(getEvolvedName(makeSave({ stage: 3, path: null }), HERO), 'Shadow Knight');
  });

  test('unknown hero id returns empty string', () => {
    assert.equal(getEvolvedName(makeSave(), 'no-such-hero'), '');
  });

  test('getEvolvedTitle follows the same fallback rules', () => {
    assert.equal(getEvolvedTitle(makeSave({ stage: 2 }), HERO), 'Shadow Knight');
    assert.equal(getEvolvedTitle(makeSave({ stage: 3, path: 'bogus-path' }), HERO), 'Shadow Knight');
    assert.equal(getEvolvedTitle(makeSave({ stage: 3, path: 'shadow-assassin' }), HERO), 'Shadow Assassin');
  });
});
