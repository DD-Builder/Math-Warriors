import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleForY, heroFormation, monsterFormation, tileDepth, heroBehinds,
  BATTLE_PERSPECTIVE, MAZE_PERSPECTIVE,
} from './perspective.js';

test('scaleForY returns maxScale at groundBottom', () => {
  const s = scaleForY(BATTLE_PERSPECTIVE.groundBottomY);
  assert.equal(s, BATTLE_PERSPECTIVE.maxScale);
});

test('scaleForY returns minScale at groundTop', () => {
  const s = scaleForY(BATTLE_PERSPECTIVE.groundTopY);
  assert.equal(s, BATTLE_PERSPECTIVE.minScale);
});

test('scaleForY interpolates between top and bottom', () => {
  const mid = (BATTLE_PERSPECTIVE.groundTopY + BATTLE_PERSPECTIVE.groundBottomY) / 2;
  const s = scaleForY(mid);
  const expected = (BATTLE_PERSPECTIVE.minScale + BATTLE_PERSPECTIVE.maxScale) / 2;
  assert.ok(Math.abs(s - expected) < 0.01, `Scale ${s} should be ~${expected}`);
});

test('scaleForY clamps above and below bounds', () => {
  assert.equal(scaleForY(-100), BATTLE_PERSPECTIVE.minScale);
  assert.equal(scaleForY(9999), BATTLE_PERSPECTIVE.maxScale);
});

test('heroFormation returns correct count', () => {
  assert.equal(heroFormation(3).length, 3);
  assert.equal(heroFormation(1).length, 1);
  assert.equal(heroFormation(0).length, 0);
});

test('heroFormation: front hero is lower Y (nearer camera) and larger scale', () => {
  const pos = heroFormation(3);
  assert.ok(pos[0].y > pos[2].y, 'Front hero should have higher Y (closer to camera)');
  assert.ok(pos[0].scale > pos[2].scale, 'Front hero should be larger');
});

test('heroFormation: depths are ordered by Y', () => {
  const pos = heroFormation(3);
  for (let i = 0; i < pos.length - 1; i++) {
    assert.ok(pos[i].depth > pos[i + 1].depth || pos[i].y >= pos[i + 1].y);
  }
});

test('monsterFormation handles 1, 2, 3 enemies', () => {
  assert.equal(monsterFormation(1).length, 1);
  assert.equal(monsterFormation(2).length, 2);
  assert.equal(monsterFormation(3).length, 3);
});

test('monsterFormation: monsters have smaller scale than hero front', () => {
  const heroes = heroFormation(3);
  const monsters = monsterFormation(1);
  assert.ok(monsters[0].scale <= heroes[0].scale);
});

test('tileDepth orders by row then column', () => {
  assert.ok(tileDepth(0, 0) < tileDepth(1, 0));
  assert.ok(tileDepth(1, 0) < tileDepth(1, 1));
  assert.ok(tileDepth(2, 5) > tileDepth(1, 9));
});

test('heroBehinds returns true when hero row < wall row', () => {
  assert.ok(heroBehinds(3, 5));
  assert.ok(!heroBehinds(5, 3));
  assert.ok(!heroBehinds(4, 4));
});

test('BATTLE_PERSPECTIVE has required config keys', () => {
  const required = ['horizonY', 'groundTopY', 'groundBottomY', 'vanishX', 'minScale', 'maxScale'];
  for (const key of required) {
    assert.ok(key in BATTLE_PERSPECTIVE, `Missing ${key}`);
    assert.equal(typeof BATTLE_PERSPECTIVE[key], 'number');
  }
});

test('MAZE_PERSPECTIVE has required config keys', () => {
  const required = ['tileScaleNear', 'tileScaleFar', 'heightFactor', 'depthShade'];
  for (const key of required) {
    assert.ok(key in MAZE_PERSPECTIVE, `Missing ${key}`);
  }
});
