import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_MOVES, getBossMove, isSpecialTurn, isTelegraphTurn, specialDamagePerHero } from './bossPresentation.js';
import { BOSS_IDS } from '../data/enemies.js';

describe('boss moves', () => {
  test('every real boss has a signature move', () => {
    for (const id of BOSS_IDS) {
      assert.ok(BOSS_MOVES[id], `boss ${id} has no signature move`);
      assert.ok(BOSS_MOVES[id].name.length <= 20);
    }
  });
  test('unknown bosses get a themed default', () => {
    assert.equal(getBossMove('mystery').name, 'FURY UNLEASHED');
  });
});

describe('special cadence', () => {
  test('every third boss turn is the special', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(isSpecialTurn),
      [false, false, true, false, false, true, false]);
  });
  test('the telegraph shows on the player turn before it', () => {
    // bossTurnCount is the number of boss turns TAKEN so far
    assert.equal(isTelegraphTurn(2), true);   // next boss turn (3rd) is special
    assert.equal(isTelegraphTurn(3), false);
    assert.equal(isTelegraphTurn(5), true);
  });
});

describe('special damage', () => {
  test('reduced per hero, never zero', () => {
    assert.equal(specialDamagePerHero(10), 7);
    assert.equal(specialDamagePerHero(1), 1);
  });
});
