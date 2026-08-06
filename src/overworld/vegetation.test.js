/**
 * Vegetation contract tests.
 *
 * These are BUDGET tests, not pixel tests. The art is judged from screenshots;
 * what a unit test can actually protect is the set of invariants that make the
 * art affordable — instance counts inside the authored band, a draw-call
 * ceiling, ground cover that never stands in the sea or on a cliff, LOD that
 * genuinely sheds instances with distance, and a dispose() that lets go of
 * everything. Every one of these has a way of silently regressing while the
 * screenshots still look fine, which is exactly what a test is for.
 *
 * three's core runs headless in plain Node (no DOM is touched until a WebGL
 * context is requested), so this exercises the real module, not a stub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHeightfield } from './heightfield.js';
import { WORLD } from './worldSpec.js';
import {
  createVegetation, GROUND_ARCHETYPES, TREE_SPECIES_NAMES, PLANT_MIN_H, TREE_MIN_H,
} from './vegetation.js';

// One island, one build: createVegetation places ~90 k instances and is far too
// expensive to run per assertion.
const hf = createHeightfield(WORLD.SEED);
const veg = createVegetation(hf);
const s = veg.stats;

test('vegetation: ground cover is lush', () => {
  // The authored band. Below ~60 k the field stops overlapping and reads as
  // scattered sprites on bare ground; above ~120 k the resident instance
  // buffers stop being worth their memory.
  assert.ok(s.groundCover >= 60_000, `ground cover ${s.groundCover} >= 60k`);
  assert.ok(s.groundCover <= 120_000, `ground cover ${s.groundCover} <= 120k`);
});

test('vegetation: several ground-cover archetypes, all of them used', () => {
  assert.ok(Object.keys(GROUND_ARCHETYPES).length >= 5);
  const used = Object.entries(s.groundCoverByArchetype).filter(([, n]) => n > 0);
  assert.ok(used.length >= 5, `archetypes in use: ${used.map(([k]) => k).join(',')}`);
  // No single archetype may swallow the field — that is uniformity by another
  // name.
  for (const [name, n] of used) {
    assert.ok(n / s.groundCover < 0.6, `${name} is ${(100 * n / s.groundCover).toFixed(0)}% of cover`);
  }
});

test('vegetation: four or more tree species actually get planted', () => {
  assert.ok(TREE_SPECIES_NAMES.length >= 4);
  const planted = Object.entries(s.treesBySpecies).filter(([, n]) => n > 0);
  assert.ok(planted.length >= 4, `species planted: ${planted.map(([k]) => k).join(',')}`);
  assert.ok(s.trees > 300, `tree count ${s.trees}`);
});

test('vegetation: draw calls stay inside the vegetation budget', () => {
  // Worst case: every sector inside the cull radius, nothing frustum-culled.
  // The whole scene's hard cap is 250 (see e2e/overworld-boot.spec.js) and
  // terrain alone is 64 chunks, so vegetation may not spend more than ~90.
  assert.ok(s.drawCalls <= 90, `vegetation worst-case draw calls ${s.drawCalls}`);
  // Trees and petals are unsectored and therefore always resident.
  assert.ok(s.treeMeshes <= 12, `tree meshes ${s.treeMeshes}`);
  // Petal swarms are grouped by canopy height, not by tree.
  assert.ok(s.petalMeshes <= 4, `petal meshes ${s.petalMeshes}`);
});

test('vegetation: nothing grows in the sea or on a cliff', () => {
  let checked = 0;
  for (const t of veg.trees) {
    assert.ok(t.y > TREE_MIN_H - 1e-6, `tree at y=${t.y}`);
    checked++;
  }
  assert.ok(checked > 300);

  // Ground cover: sample instance origins straight out of the packed matrices.
  const cover = [];
  veg.group.traverse((o) => { if (o.name.startsWith('cover-')) cover.push(o); });
  assert.ok(cover.length > 0);
  let sampled = 0;
  for (const mesh of cover) {
    const a = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i += 37) {
      const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14];
      // The instance sits 0.02 m into the ground so blades meet the surface.
      assert.ok(y + 0.02 > PLANT_MIN_H - 1e-6, `${mesh.name} instance at y=${y}`);
      assert.ok(Math.abs(x) <= WORLD.HALF && Math.abs(z) <= WORLD.HALF);
      sampled++;
    }
  }
  assert.ok(sampled > 500, `sampled ${sampled} ground-cover instances`);
});

test('vegetation: colours are jittered, not uniform, within an archetype', () => {
  const tufts = [];
  veg.group.traverse((o) => { if (o.name === 'cover-tuft') tufts.push(o); });
  assert.ok(tufts.length > 0);
  const seen = new Set();
  for (const mesh of tufts) {
    const c = mesh.instanceColor.array;
    for (let i = 0; i < mesh.count; i += 13) {
      seen.add(`${c[i * 3].toFixed(3)},${c[i * 3 + 1].toFixed(3)},${c[i * 3 + 2].toFixed(3)}`);
    }
  }
  assert.ok(seen.size > 200, `distinct tuft tints: ${seen.size}`);
});

test('vegetation: distance LOD sheds instances and hides far sectors', () => {
  const cover = [];
  veg.group.traverse((o) => { if (o.name.startsWith('cover-')) cover.push(o); });

  const drawn = (pos) => {
    veg.update(4, pos);
    let n = 0, meshes = 0;
    for (const m of cover) if (m.visible) { n += m.count; meshes++; }
    return { n, meshes };
  };

  const near = drawn({ x: 0, z: 150 });     // deep in the garden
  const far = drawn({ x: 0, z: 235 });      // out past the north shore
  assert.ok(near.n < s.groundCover * 0.55,
    `near-camera cover ${near.n} should be a fraction of ${s.groundCover}`);
  assert.ok(near.n > 8_000, `near-camera cover ${near.n} is too thin to read as a field`);
  assert.ok(far.n < near.n, `offshore ${far.n} should draw less than in-field ${near.n}`);
  assert.ok(far.meshes < near.meshes);
  assert.ok(near.meshes <= s.visibleCoverCalls,
    `${near.meshes} visible sectors exceeds the reported worst case ${s.visibleCoverCalls}`);
});

test('vegetation: update() allocates nothing and is stable', () => {
  const pos = { x: 12, z: 140 };
  veg.update(1, pos);
  const before = [];
  veg.group.traverse((o) => { if (o.isInstancedMesh) before.push(o.count); });
  veg.update(1, pos);
  const after = [];
  veg.group.traverse((o) => { if (o.isInstancedMesh) after.push(o.count); });
  assert.deepEqual(after, before);
  // A null player (boot, before the controller has a state) must not throw.
  veg.update(2, null);
});

test('vegetation: deterministic for a fixed seed', () => {
  const a = createVegetation(createHeightfield(WORLD.SEED), { density: 0.05 });
  const b = createVegetation(createHeightfield(WORLD.SEED), { density: 0.05 });
  assert.equal(a.stats.groundCover, b.stats.groundCover);
  assert.deepEqual(a.stats.treesBySpecies, b.stats.treesBySpecies);
  assert.deepEqual(a.trees, b.trees);
  a.dispose();
  b.dispose();
});

test('vegetation: dispose releases the group', () => {
  const v = createVegetation(createHeightfield(WORLD.SEED), { density: 0.05 });
  assert.ok(v.group.children.length > 0);
  v.dispose();
  assert.equal(v.group.children.length, 0);
  assert.equal(v.trees.length, 0);
});
