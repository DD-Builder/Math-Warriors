import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionWorld, SIZE, HALF, WATER_Y } from './collision.js';

// Analytic stub heightfield — no import of the real terrain so these tests
// pin collision behavior alone.
function stubField(height = () => 0, normal = () => [0, 1, 0]) {
  return {
    sampleHeight: height,
    sampleNormal: normal,
    biomeAt: () => 'meadow',
    shoreDistance: () => 10,
    seed: 1,
  };
}

describe('collision world', () => {
  test('world constants match the shared contract', () => {
    assert.equal(SIZE, 480);
    assert.equal(HALF, 240);
    assert.equal(WATER_Y, 0);
  });

  test('groundHeight passes through the heightfield', () => {
    const w = createCollisionWorld(stubField((x, z) => x * 2 + z));
    assert.equal(w.groundHeight(3, 1), 7);
    assert.equal(w.groundHeight(-1, 0), -2);
  });

  test('isWater is true below WATER_Y + 0.05', () => {
    const w = createCollisionWorld(stubField((x) => x));
    assert.equal(w.isWater(-0.5, 0), true);
    assert.equal(w.isWater(0.04, 0), true);
    assert.equal(w.isWater(0.06, 0), false);
    assert.equal(w.isWater(2, 0), false);
  });

  test('free move applies the delta unchanged', () => {
    const w = createCollisionWorld(stubField());
    const r = w.resolveMove({ x: 1, y: 0, z: 2 }, { x: 0.5, z: -0.25 }, 0.5);
    assert.deepEqual(r.pos, { x: 1.5, y: 0, z: 1.75 });
    assert.equal(r.blocked, false);
  });

  test('circle collider pushes the body out radially — cannot end inside', () => {
    const w = createCollisionWorld(stubField());
    w.addCollider({ id: 'rock', kind: 'circle', x: 5, z: 0, r: 1 });
    const r = w.resolveMove({ x: 3.9, y: 0, z: 0 }, { x: 1, z: 0 }, 0.5);
    assert.equal(r.blocked, true);
    const d = Math.hypot(r.pos.x - 5, r.pos.z - 0);
    assert.ok(d >= 1.5 - 1e-9, `ended ${d} from center, need >= 1.5`);
    // pushed straight back along the approach axis
    assert.ok(Math.abs(r.pos.x - 3.5) < 1e-9);
    assert.ok(Math.abs(r.pos.z) < 1e-9);
  });

  test('push-out is radial for off-axis approaches', () => {
    const w = createCollisionWorld(stubField());
    w.addCollider({ id: 'rock', kind: 'circle', x: 0, z: 0, r: 2 });
    const r = w.resolveMove({ x: 2.2, y: 0, z: 0.4 }, { x: -0.5, z: 0 }, 0.5);
    const d = Math.hypot(r.pos.x, r.pos.z);
    assert.ok(d >= 2.5 - 1e-9);
    assert.equal(r.blocked, true);
  });

  test('removeCollider stops the push-out', () => {
    const w = createCollisionWorld(stubField());
    w.addCollider({ id: 'rock', kind: 'circle', x: 5, z: 0, r: 1 });
    w.removeCollider('rock');
    const r = w.resolveMove({ x: 4, y: 0, z: 0 }, { x: 1, z: 0 }, 0.5);
    assert.deepEqual(r.pos, { x: 5, y: 0, z: 0 });
    assert.equal(r.blocked, false);
  });

  test('world bounds clamp to [-HALF+2, HALF-2]', () => {
    const w = createCollisionWorld(stubField());
    const east = w.resolveMove({ x: 237, y: 0, z: 0 }, { x: 10, z: 0 }, 0.5);
    assert.equal(east.pos.x, HALF - 2);
    assert.equal(east.blocked, true);
    const sw = w.resolveMove({ x: -239, y: 0, z: -239 }, { x: -5, z: -5 }, 0.5);
    assert.equal(sw.pos.x, -HALF + 2);
    assert.equal(sw.pos.z, -HALF + 2);
    assert.equal(sw.blocked, true);
  });

  test('resolveMove preserves y and does not mutate the input pos', () => {
    const w = createCollisionWorld(stubField());
    const pos = Object.freeze({ x: 1, y: 3.25, z: 2 });
    const r = w.resolveMove(pos, { x: 1, z: 1 }, 0.5);
    assert.equal(r.pos.y, 3.25);
    assert.deepEqual(pos, { x: 1, y: 3.25, z: 2 });
  });
});
