import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_VFX, VFX_CATEGORIES, abilityVfxCategory, playAbilityVfx } from './abilityVfx.js';
import { invokeAbility } from './abilities.js';
import { ALL_ENEMIES } from '../data/enemies.js';

describe('ability vfx coverage', () => {
  test('every ability used by an enemy has a category', () => {
    const used = [...new Set(ALL_ENEMIES.map((e) => e.ability))];
    for (const id of used) {
      assert.ok(ABILITY_VFX[id], `ability ${id} has no vfx category`);
    }
  });

  test('every mapped category is from the vocabulary', () => {
    for (const [id, cat] of Object.entries(ABILITY_VFX)) {
      assert.ok(VFX_CATEGORIES.includes(cat), `${id} maps to unknown category ${cat}`);
    }
  });

  test('unknown abilities fall back to buffSelf', () => {
    assert.equal(abilityVfxCategory('made_up_power'), 'buffSelf');
  });
});

describe('playAbilityVfx safety', () => {
  test('no-ops without a real scene', () => {
    playAbilityVfx(null, 'sporulate', {});
    playAbilityVfx({}, 'sporulate', {});
    playAbilityVfx({ tweens: { add() {} }, add: { text: () => ({}) } }, 'sporulate', {});
  });
});

describe('invokeAbility toast patching', () => {
  function stubScene() {
    const toasts = [];
    return {
      toasts,
      showToast(msg, color) { toasts.push([msg, color]); },
    };
  }

  test('hook toasts still reach the real showToast and it is restored', () => {
    const scene = stubScene();
    const orig = scene.showToast;
    const enemy = { _sporulateBoost: 0, atk: 10 };
    invokeAbility('sporulate', 'onHeroWrong', { enemy, scene, party: [] });
    assert.equal(scene.toasts.length, 1);
    assert.equal(enemy.atk, 12);
    assert.equal(scene.showToast, orig, 'showToast restored after hook');
  });

  test('showToast restored even when the hook throws', () => {
    const scene = stubScene();
    const orig = scene.showToast;
    // consume's onHeroWrong writes to ctx.scene._consumeNextTurn — give
    // it a hostile ctx missing the enemy so downstream access throws.
    invokeAbility('sweet_add', 'onHeroWrong', { enemy: null, scene, party: [] });
    assert.equal(scene.showToast, orig);
  });

  test('scene state writes from hooks land on the real scene', () => {
    const scene = stubScene();
    invokeAbility('consume', 'onHeroWrong', { enemy: {}, scene, party: [] });
    assert.equal(scene._consumeNextTurn, true);
  });
});
