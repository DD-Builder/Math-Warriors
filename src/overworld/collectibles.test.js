import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isCollected, collectItem, ensureOverworld } from './collectibles.js';
import { makeDefaultSave } from '../systems/save.js';

describe('collectibles', () => {
  test('container auto-created on a v5-shaped save', () => {
    const save = makeDefaultSave();
    delete save.overworld; // simulate a pre-v6 save that never migrated
    assert.equal(save.overworld, undefined);
    const result = collectItem(save, { id: 'coin_1', kind: 'gold', amount: 10 });
    assert.deepEqual(result, { granted: true, already: false });
    assert.deepEqual(save.overworld.collected, ['coin_1']);
    assert.equal(save.overworld.pos, null);
    assert.equal(save.overworld.yaw, 0);
    assert.equal(save.overworld.portalId, null);
  });

  test('gold adds to save.gold', () => {
    const save = makeDefaultSave();
    save.gold = 5;
    collectItem(save, { id: 'coin_1', kind: 'gold', amount: 25 });
    assert.equal(save.gold, 30);
  });

  test('potion adds to save.potions', () => {
    const save = makeDefaultSave();
    const before = save.potions;
    collectItem(save, { id: 'pot_1', kind: 'potion', amount: 2 });
    assert.equal(save.potions, before + 2);
  });

  test('grant-once: second collect reports already and does not double grant', () => {
    const save = makeDefaultSave();
    collectItem(save, { id: 'coin_1', kind: 'gold', amount: 25 });
    const second = collectItem(save, { id: 'coin_1', kind: 'gold', amount: 25 });
    assert.deepEqual(second, { granted: false, already: true });
    assert.equal(save.gold, 25);
    assert.deepEqual(save.overworld.collected, ['coin_1']);
  });

  test('isCollected tracks ids, tolerates missing container', () => {
    const save = makeDefaultSave();
    assert.equal(isCollected(save, 'coin_1'), false);
    collectItem(save, { id: 'coin_1', kind: 'gold', amount: 1 });
    assert.equal(isCollected(save, 'coin_1'), true);
    assert.equal(isCollected(save, 'coin_2'), false);
  });

  test('ensureOverworld repairs a malformed collected field', () => {
    const save = makeDefaultSave();
    save.overworld = { pos: { x: 1, y: 2, z: 3 }, yaw: 0.5, portalId: 'p1', collected: null };
    const ow = ensureOverworld(save);
    assert.deepEqual(ow.collected, []);
    assert.deepEqual(ow.pos, { x: 1, y: 2, z: 3 });
  });
});
