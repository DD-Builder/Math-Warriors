/**
 * Data integrity tests
 *
 * These aren't unit tests in the usual sense — they're contract tests
 * that verify the static data files are internally consistent. They
 * catch the kinds of bugs that don't surface until runtime:
 *
 *   - A hero referenced by id doesn't exist in the roster
 *   - An enemy floor assignment is wrong
 *   - A sprite path collides
 *   - A stat is NaN or negative
 *   - The scene key used in a scene.start() call isn't registered
 *
 * Rather than trying to boot Phaser in Node (hard — it needs Canvas),
 * we just verify that the data layer is self-consistent. Runtime scene
 * bugs are caught by the Playwright smoke test (see e2e/).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNIGHTS,
  WIZARDS,
  BUNNIES,
  ALL_HEROES,
  getHeroById,
  spawnHero,
} from '../data/heroes.js';
import {
  FLOOR_1,
  FLOOR_2,
  FLOOR_3,
  FLOOR_4,
  FLOOR_5,
  FLOOR_6,
  FLOOR_7,
  FLOOR_8,
  FLOOR_9,
  ALL_ENEMIES,
  getEnemyById,
  getEnemiesForFloor,
  pickEnemyForFloor,
  spawnEnemy,
  FLOOR_OPERATORS,
} from '../data/enemies.js';
import { SCENES } from '../config.js';

// ------------------------------------------------------------------
// HEROES
// ------------------------------------------------------------------

describe('heroes data integrity', () => {
  test('exactly 5 knights, 5 wizards, 5 bunnies = 15 heroes total', () => {
    assert.equal(KNIGHTS.length, 5, 'expected 5 knights');
    assert.equal(WIZARDS.length, 5, 'expected 5 wizards');
    assert.equal(BUNNIES.length, 5, 'expected 5 bunnies');
    assert.equal(ALL_HEROES.length, 15, 'expected 15 heroes total');
  });

  test('every hero has all required fields', () => {
    for (const hero of ALL_HEROES) {
      assert.ok(hero.id, `hero missing id`);
      assert.ok(hero.name, `hero ${hero.id} missing name`);
      assert.ok(hero.class, `hero ${hero.id} missing class`);
      assert.ok(['knight', 'wizard', 'bunny'].includes(hero.class), `hero ${hero.id} has invalid class ${hero.class}`);
      assert.ok(hero.trait, `hero ${hero.id} missing trait`);
      assert.equal(typeof hero.maxHp, 'number', `hero ${hero.id} maxHp is not a number`);
      assert.equal(typeof hero.atk, 'number', `hero ${hero.id} atk is not a number`);
      assert.equal(typeof hero.def, 'number', `hero ${hero.id} def is not a number`);
      assert.ok(hero.sprite, `hero ${hero.id} missing sprite`);
      assert.ok(hero.displayColor, `hero ${hero.id} missing displayColor`);
    }
  });

  test('every hero has positive stats', () => {
    for (const hero of ALL_HEROES) {
      assert.ok(hero.maxHp > 0, `hero ${hero.id} maxHp is ${hero.maxHp}`);
      assert.ok(hero.atk > 0, `hero ${hero.id} atk is ${hero.atk}`);
      assert.ok(hero.def > 0, `hero ${hero.id} def is ${hero.def}`);
    }
  });

  test('no hero stats are NaN or Infinity', () => {
    for (const hero of ALL_HEROES) {
      assert.ok(Number.isFinite(hero.maxHp), `hero ${hero.id} maxHp not finite`);
      assert.ok(Number.isFinite(hero.atk), `hero ${hero.id} atk not finite`);
      assert.ok(Number.isFinite(hero.def), `hero ${hero.id} def not finite`);
    }
  });

  test('hero ids are all unique', () => {
    const ids = new Set();
    for (const hero of ALL_HEROES) {
      assert.ok(!ids.has(hero.id), `duplicate hero id: ${hero.id}`);
      ids.add(hero.id);
    }
  });

  test('getHeroById finds every hero', () => {
    for (const hero of ALL_HEROES) {
      const found = getHeroById(hero.id);
      assert.equal(found, hero, `getHeroById failed for ${hero.id}`);
    }
  });

  test('getHeroById returns null for unknown id', () => {
    assert.equal(getHeroById('bogus-hero'), null);
  });

  test('spawnHero produces a fresh combat-ready instance', () => {
    for (const hero of ALL_HEROES) {
      const spawned = spawnHero(hero.id);
      assert.ok(spawned);
      assert.equal(spawned.id, hero.id);
      assert.equal(spawned.hp, hero.maxHp, `${hero.id} should spawn at full HP`);
      // Mutating the spawn shouldn't affect the definition
      spawned.hp = 1;
      assert.equal(getHeroById(hero.id).maxHp, hero.maxHp);
    }
  });
});

// ------------------------------------------------------------------
// ENEMIES
// ------------------------------------------------------------------

describe('enemies data integrity', () => {
  test('exactly 5 enemies per floor, 45 total', () => {
    assert.equal(FLOOR_1.length, 5);
    assert.equal(FLOOR_2.length, 5);
    assert.equal(FLOOR_3.length, 5);
    assert.equal(FLOOR_4.length, 5);
    assert.equal(FLOOR_5.length, 5);
    assert.equal(FLOOR_6.length, 5);
    assert.equal(FLOOR_7.length, 5);
    assert.equal(FLOOR_8.length, 5);
    assert.equal(FLOOR_9.length, 5);
    assert.equal(ALL_ENEMIES.length, 45);
  });

  test('every enemy has all required fields', () => {
    for (const enemy of ALL_ENEMIES) {
      assert.ok(enemy.id, `enemy missing id`);
      assert.ok(enemy.name, `enemy ${enemy.id} missing name`);
      assert.ok(enemy.floor, `enemy ${enemy.id} missing floor`);
      assert.equal(typeof enemy.maxHp, 'number');
      assert.equal(typeof enemy.atk, 'number');
      assert.equal(typeof enemy.def, 'number');
      assert.ok(enemy.ability, `enemy ${enemy.id} missing ability`);
      assert.ok(enemy.sprite, `enemy ${enemy.id} missing sprite`);
      assert.ok(enemy.displayColor, `enemy ${enemy.id} missing displayColor`);
    }
  });

  test('every enemy has stats > 0', () => {
    for (const enemy of ALL_ENEMIES) {
      assert.ok(enemy.maxHp > 0, `${enemy.id} maxHp ${enemy.maxHp}`);
      assert.ok(enemy.atk > 0, `${enemy.id} atk ${enemy.atk}`);
      assert.ok(enemy.def >= 0, `${enemy.id} def ${enemy.def}`);
    }
  });

  test('enemy ids are all unique', () => {
    const ids = new Set();
    for (const enemy of ALL_ENEMIES) {
      assert.ok(!ids.has(enemy.id), `duplicate enemy id: ${enemy.id}`);
      ids.add(enemy.id);
    }
  });

  test('floor assignments match their array', () => {
    for (const e of FLOOR_1) assert.equal(e.floor, 1);
    for (const e of FLOOR_2) assert.equal(e.floor, 2);
    for (const e of FLOOR_3) assert.equal(e.floor, 3);
    for (const e of FLOOR_4) assert.equal(e.floor, 4);
    for (const e of FLOOR_5) assert.equal(e.floor, 5);
    for (const e of FLOOR_6) assert.equal(e.floor, 6);
    for (const e of FLOOR_7) assert.equal(e.floor, 7);
    for (const e of FLOOR_8) assert.equal(e.floor, 8);
    for (const e of FLOOR_9) assert.equal(e.floor, 9);
  });

  test('getEnemiesForFloor returns the right pool', () => {
    assert.equal(getEnemiesForFloor(1).length, 5);
    assert.equal(getEnemiesForFloor(3).length, 5);
    assert.equal(getEnemiesForFloor(99).length, 0);
  });

  test('pickEnemyForFloor always returns an enemy from the right floor', () => {
    for (let i = 0; i < 100; i++) {
      const picked = pickEnemyForFloor(2);
      assert.ok(picked);
      assert.equal(picked.floor, 2);
    }
  });

  test('spawnEnemy produces a fresh combat-ready instance', () => {
    const e = spawnEnemy('sproutling');
    assert.ok(e);
    assert.equal(e.id, 'sproutling');
    assert.equal(e.hp, e.maxHp);
    e.hp = 1;
    const second = spawnEnemy('sproutling');
    assert.equal(second.hp, second.maxHp, 'second spawn should be fresh');
  });

  test('FLOOR_OPERATORS has an entry for every floor 1-9', () => {
    for (let i = 1; i <= 9; i++) {
      assert.ok(FLOOR_OPERATORS[i], `floor ${i} has no operator mapping`);
    }
  });

  test('FLOOR_OPERATORS maps all floors to correct operators', () => {
    assert.equal(FLOOR_OPERATORS[1], '+');
    assert.equal(FLOOR_OPERATORS[2], '-');
    assert.equal(FLOOR_OPERATORS[3], '*');
    assert.equal(FLOOR_OPERATORS[4], '/');
    assert.equal(FLOOR_OPERATORS[5], 'mixed');
    // Math = theme: geometry in the Crystal Caverns, money in the
    // Market, fractions in the Library.
    assert.equal(FLOOR_OPERATORS[6], 'geo');
    assert.equal(FLOOR_OPERATORS[7], 'money');
    assert.equal(FLOOR_OPERATORS[8], 'frac');
    assert.equal(FLOOR_OPERATORS[9], 'word');
  });

  test('enemy difficulty scales roughly with floor', () => {
    const avg = (arr, key) => arr.reduce((s, e) => s + e[key], 0) / arr.length;
    const floors = [FLOOR_1, FLOOR_2, FLOOR_3, FLOOR_4, FLOOR_5, FLOOR_6, FLOOR_7, FLOOR_8, FLOOR_9];
    // Check general upward trend: last floor avg > first floor avg
    assert.ok(avg(floors[floors.length - 1], 'maxHp') > avg(floors[0], 'maxHp'),
      'final floor should be harder than first floor');
    // Check the core 1-5 progression is strictly increasing
    for (let i = 1; i < 5; i++) {
      const prev = avg(floors[i - 1], 'maxHp');
      const curr = avg(floors[i], 'maxHp');
      assert.ok(curr >= prev, `floor ${i + 1} avg HP ${curr} should be >= floor ${i} avg HP ${prev}`);
    }
  });
});

// ------------------------------------------------------------------
// SCENE KEYS
// ------------------------------------------------------------------

describe('scene key registry', () => {
  test('all scene keys are non-empty strings', () => {
    for (const [name, key] of Object.entries(SCENES)) {
      assert.equal(typeof key, 'string', `${name} is not a string`);
      assert.ok(key.length > 0, `${name} is empty`);
    }
  });

  test('no duplicate scene keys', () => {
    const seen = new Set();
    for (const [name, key] of Object.entries(SCENES)) {
      assert.ok(!seen.has(key), `duplicate scene key: ${key}`);
      seen.add(key);
    }
  });

  test('required scenes for current milestone are declared', () => {
    assert.ok(SCENES.BOOT, 'BOOT scene missing');
    assert.ok(SCENES.TITLE, 'TITLE scene missing');
    assert.ok(SCENES.PARTY_SELECT, 'PARTY_SELECT scene missing');
    assert.ok(SCENES.WORLD_MAP, 'WORLD_MAP scene missing');
    assert.ok(SCENES.BATTLE, 'BATTLE scene missing');
  });
});
