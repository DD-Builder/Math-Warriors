import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_MOVES, getBossMove, isSpecialTurn, isTelegraphTurn, specialDamagePerHero,
  BOSS_EPITHETS, getBossEpithet,
} from './bossPresentation.js';
import { BOSS_IDS } from '../data/enemies.js';
import { PAPER } from '../config.js';

describe('boss moves', () => {
  test('every real boss has a signature move', () => {
    for (const id of BOSS_IDS) {
      assert.ok(BOSS_MOVES[id], `boss ${id} has no signature move`);
      assert.ok(BOSS_MOVES[id].name.length <= 20);
    }
  });
  // ART LAW: a special splashes its colour over a papercut stage, so
  // the colour has to be cut from the same paper.
  test('every signature colour is a PAPER token', () => {
    const palette = new Set(Object.values(PAPER));
    for (const id of BOSS_IDS) {
      assert.ok(palette.has(BOSS_MOVES[id].color), `${id} move colour is off-palette`);
    }
    assert.ok(palette.has(getBossMove('mystery').color), 'default move colour is off-palette');
  });
  test('unknown bosses get a themed default', () => {
    assert.equal(getBossMove('mystery').name, 'FURY UNLEASHED');
  });
});

describe('special cadence', () => {
  // NOTE: call through an arrow — Array#map passes (value, index) and the
  // second argument is now the phase, which silently changed the cadence.
  test('every third boss turn is the special in phase 1', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(n => isSpecialTurn(n)),
      [false, false, true, false, false, true, false]);
  });
  test('a transformed boss fires every second turn', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => isSpecialTurn(n, 2)),
      [false, true, false, true, false, true]);
    assert.deepEqual([1, 2, 3, 4].map(n => isSpecialTurn(n, 3)),
      [false, true, false, true]);
  });
  test('the telegraph shows on the player turn before it', () => {
    // bossTurnCount is the number of boss turns TAKEN so far
    assert.equal(isTelegraphTurn(2), true);   // next boss turn (3rd) is special
    assert.equal(isTelegraphTurn(3), false);
    assert.equal(isTelegraphTurn(5), true);
  });
  test('the telegraph tracks the phase cadence', () => {
    assert.equal(isTelegraphTurn(1, 2), true);  // next boss turn (2nd) is special
    assert.equal(isTelegraphTurn(2, 2), false);
    assert.equal(isTelegraphTurn(3, 3), true);
  });
});

describe('special damage', () => {
  test('reduced per hero, never zero', () => {
    assert.equal(specialDamagePerHero(10), 7);
    assert.equal(specialDamagePerHero(1), 1);
  });
  test('later phases hit harder, but never full strength', () => {
    assert.equal(specialDamagePerHero(100, 1), 70);
    assert.equal(specialDamagePerHero(100, 2), 78);
    assert.equal(specialDamagePerHero(100, 3), 88);
  });
});

// The entrance banner announces a boss by NAME and by EPITHET. Every
// boss needs one, and it has to fit the banner: two lines of paper at
// 25px, so anything much past 34 characters starts clipping the notch.
describe('boss epithets', () => {
  test('every real boss has an epithet', () => {
    for (const id of BOSS_IDS) {
      assert.ok(BOSS_EPITHETS[id], `boss ${id} has no epithet`);
    }
  });
  test('epithets fit the banner and read as titles, not threats', () => {
    for (const id of BOSS_IDS) {
      const e = BOSS_EPITHETS[id];
      assert.ok(e.length <= 34, `${id} epithet is ${e.length} chars — it will clip the banner`);
      assert.equal(e, e.toUpperCase(), `${id} epithet must be set in caps`);
      // Awe, never horror: the banner is the first thing a five-year-old
      // reads about this creature.
      assert.ok(!/kill|death|dead|blood|die/i.test(e), `${id} epithet is too dark for K-5`);
    }
  });
  test('unknown bosses still get a banner line', () => {
    assert.equal(getBossEpithet('mystery'), 'A CHALLENGER APPEARS');
  });
});
