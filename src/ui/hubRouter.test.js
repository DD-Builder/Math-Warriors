import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chooseHub } from './hubRouter.js';
import { SCENES } from '../config.js';

describe('hubRouter.chooseHub', () => {
  test('WebGL available + enabled → 3D overworld is the hub', () => {
    assert.equal(chooseHub({ webglOk: true, enabled: true }), SCENES.OVERWORLD);
  });

  test('enabled defaults to true when undefined (old saves)', () => {
    assert.equal(chooseHub({ webglOk: true, enabled: undefined }), SCENES.OVERWORLD);
  });

  test('no WebGL → 2D world map remains the hub', () => {
    assert.equal(chooseHub({ webglOk: false, enabled: true }), SCENES.WORLD_MAP);
  });

  test('explicitly disabled → 2D world map even with WebGL', () => {
    assert.equal(chooseHub({ webglOk: true, enabled: false }), SCENES.WORLD_MAP);
  });
});
