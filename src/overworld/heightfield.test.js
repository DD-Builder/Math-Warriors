import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHeightfield, WORLD } from './heightfield.js';
import { BIOMES, PORTALS, BUILDINGS, COLLECTIBLES, SPAWN, biomeForFloor } from './worldSpec.js';
import { makeRng } from '../systems/rng.js';

// Walkable = solidly above water on a slope gentler than 50 degrees.
const MIN_NY = Math.cos(50 * Math.PI / 180);

describe('heightfield', () => {
  test('deterministic: two instances agree at 50 seeded random points', () => {
    const a = createHeightfield(WORLD.SEED);
    const b = createHeightfield(WORLD.SEED);
    const rng = makeRng(1234);
    for (let i = 0; i < 50; i++) {
      const x = (rng() * 2 - 1) * WORLD.HALF;
      const z = (rng() * 2 - 1) * WORLD.HALF;
      assert.equal(a.sampleHeight(x, z), b.sampleHeight(x, z), `height diverged at (${x},${z})`);
    }
  });

  test('island: high center, water beyond radius 235 on all 16 compass points', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.sampleHeight(0, 0) > 5, `center too low: ${hf.sampleHeight(0, 0)}`);
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const h = hf.sampleHeight(236 * Math.cos(a), 236 * Math.sin(a));
      assert.ok(h < WORLD.WATER_Y, `land above water at edge angle ${k}: ${h}`);
    }
  });

  test('placement audit: every portal, building, collectible and spawn is walkable', () => {
    const hf = createHeightfield(WORLD.SEED);
    const spots = [
      ...PORTALS.map((p) => [p.id, p.x, p.z]),
      ...BUILDINGS.map((b) => [b.id, b.x, b.z]),
      ...COLLECTIBLES.map((c) => [c.id, c.x, c.z]),
      ['spawn', SPAWN.x, SPAWN.z],
    ];
    for (const [id, x, z] of spots) {
      const h = hf.sampleHeight(x, z);
      const ny = hf.sampleNormal(x, z)[1];
      assert.ok(h > WORLD.WATER_Y + 0.4, `${id} at (${x},${z}) is not on dry land: h=${h}`);
      assert.ok(ny > MIN_NY, `${id} at (${x},${z}) is too steep: normal.y=${ny}`);
    }
  });

  test('sampleNormal is unit-length and upward on land', () => {
    const hf = createHeightfield(WORLD.SEED);
    const [nx, ny, nz] = hf.sampleNormal(SPAWN.x, SPAWN.z);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-9);
    assert.ok(ny > 0);
  });

  test('biomeAt: owning id at each biome center, ocean far outside', () => {
    const hf = createHeightfield(WORLD.SEED);
    for (const b of BIOMES) {
      assert.equal(hf.biomeAt(b.center[0], b.center[1]), b.id);
    }
    assert.equal(hf.biomeAt(239, 239), 'ocean');
    assert.equal(hf.biomeAt(-239, -239), 'ocean');
  });

  test('shoreDistance sign flips across the beach', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.shoreDistance(SPAWN.x, SPAWN.z) > 0, 'spawn should be on land');
    assert.ok(hf.shoreDistance(0, 238) < 0, 'open water should be negative');
    // Walking south from the garden, the sign must flip exactly where the
    // terrain crosses the waterline.
    for (let z = 150; z <= 239; z += 1) {
      const d = hf.shoreDistance(0, z);
      const h = hf.sampleHeight(0, z) - WORLD.WATER_Y;
      if (h > 0.01) assert.ok(d > 0, `land at z=${z} but shoreDistance=${d}`);
      if (h < -0.01) assert.ok(d < 0, `water at z=${z} but shoreDistance=${d}`);
    }
  });

  test('worldSpec lookups', () => {
    assert.equal(biomeForFloor(9).id, 'palace');
    assert.equal(biomeForFloor(1).id, 'garden');
    assert.equal(biomeForFloor(99), null);
    assert.equal(COLLECTIBLES.length, 36);
    for (const c of COLLECTIBLES) {
      if (c.kind === 'gold') assert.ok(c.amount >= 15 && c.amount <= 40, c.id);
      else assert.equal(c.amount, 1, c.id);
    }
  });
});
