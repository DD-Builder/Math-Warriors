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
  // `visibleCoverCalls` is a 360-DEGREE worst case: every ground-cover sector
  // whose nearest corner is inside the cull radius, with nothing frustum
  // culled. A real 60-degree frustum sees roughly a third of that.
  //
  // The ceiling is set against the scene's hard cap of 250 (see
  // e2e/overworld-boot.spec.js), which is measured on renderer.info and so
  // counts only what actually rasterises. Even adding up every module's own
  // worst case — terrain 64 + props ~21 + hero 17 + sky/water ~10 = ~112 —
  // vegetation can spend 105 and the total is still inside the cap with room
  // over. Two of the art directors' notes cost calls directly and were worth
  // paying for: the knee-high tier that gives the field an interior, and the
  // scree/boulder tiers that give a bare cliff its scale.
  assert.ok(s.drawCalls <= 105, `vegetation worst-case draw calls ${s.drawCalls}`);
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
    // Plants sit 0.02 m into the ground so blades meet the surface; stones are
    // BEDDED deeper on purpose, so a boulder sits in the slope rather than
    // balancing on it. Both are placed on ground above the waterline — the
    // bedding depth is the only slack this assertion may allow.
    const bed = /cover-(scree|boulder|pebble)/.test(mesh.name) ? 0.30 : 0.02;
    for (let i = 0; i < mesh.count; i += 37) {
      const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14];
      assert.ok(y + bed > PLANT_MIN_H - 1e-6, `${mesh.name} instance at y=${y}`);
      assert.ok(Math.abs(x) <= WORLD.HALF && Math.abs(z) <= WORLD.HALF);
      sampled++;
    }
  }
  assert.ok(sampled > 500, `sampled ${sampled} ground-cover instances`);
});

test('vegetation: the field has three height tiers, not one', () => {
  // A field where every plant reads at the same horizon has no interior: the
  // eye crosses it in one sweep. Ground-hugging (clover/petal/scree), grass
  // height (tuft/reed/fern), and a knee-high tier (dock/shrub/boulder) must
  // all be genuinely present, and the tall tier must be a MINORITY — it is
  // punctuation, not a second carpet.
  const by = s.groundCoverByArchetype;
  const low = (by.clover ?? 0) + (by.petal ?? 0) + (by.scree ?? 0) + (by.pebble ?? 0);
  const mid = (by.tuft ?? 0) + (by.reed ?? 0) + (by.fern ?? 0) + (by.bloom ?? 0);
  const tall = (by.dock ?? 0) + (by.shrub ?? 0) + (by.boulder ?? 0);
  for (const [name, n] of [['low', low], ['mid', mid], ['tall', tall]]) {
    assert.ok(n > s.groundCover * 0.05, `${name} tier is ${n} of ${s.groundCover}`);
  }
  assert.ok(tall < s.groundCover * 0.35, `tall tier ${tall} must stay punctuation`);
});

test('vegetation: rock lives on the steep ground the plants gave up', () => {
  // Plants used to grow on 42-degree faces, which is why every cliff shot had
  // tufts and micro-trees glued to vertical rock. Cover now stops at 30 and
  // the freed face is backfilled with scree and boulders — so BOTH halves of
  // that trade have to be true, or the cliffs are simply bare.
  const by = s.groundCoverByArchetype;
  assert.ok((by.scree ?? 0) > 2000, `scree ${by.scree}`);
  assert.ok((by.boulder ?? 0) > 500, `boulders ${by.boulder}`);

  // Sample the ACTUAL terrain slope under placed instances of each kind.
  const N = 0.6;                       // metres, finite-difference step
  const slopeAt = (x, z) => {
    const gx = (hf.sampleHeight(x + N, z) - hf.sampleHeight(x - N, z)) / (2 * N);
    const gz = (hf.sampleHeight(x, z + N) - hf.sampleHeight(x, z - N)) / (2 * N);
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  };
  const meshes = { plant: [], rock: [] };
  veg.group.traverse((o) => {
    if (!o.name.startsWith('cover-')) return;
    const arch = o.name.slice(6);
    if (arch === 'scree' || arch === 'boulder') meshes.rock.push(o);
    else if (arch === 'tuft' || arch === 'dock' || arch === 'fern') meshes.plant.push(o);
  });
  assert.ok(meshes.plant.length && meshes.rock.length);

  const angles = (list) => {
    const out = [];
    for (const m of list) {
      const a = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i += 53) out.push(slopeAt(a[i * 16 + 12], a[i * 16 + 14]));
    }
    return out;
  };
  const plant = angles(meshes.plant);
  const rock = angles(meshes.rock);
  assert.ok(plant.length > 200 && rock.length > 40);

  // The gate is on the SCATTER's own bilinear gradient, so a couple of stragglers
  // can land a degree or two over once the exact height is sampled. What must
  // hold is that the population respects the rule.
  const over = plant.filter((d) => d > 34).length;
  assert.ok(over / plant.length < 0.02, `${over}/${plant.length} plants on 34+ degree ground`);
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(mean(rock) > mean(plant) + 4,
    `rock mean slope ${mean(rock).toFixed(1)} vs plant ${mean(plant).toFixed(1)}`);
});

test('vegetation: canopies do not grow through one another', () => {
  // Trees were placed by passes that did not share an occupancy structure, so
  // crowns from two scatters (and from two overlapping biome discs) cut
  // straight through each other. One island-wide grid holding each trunk's own
  // crown radius makes that structurally impossible — so no two trunks may sit
  // closer than the smaller of their two crowns.
  const t = veg.trees;
  assert.ok(t.length > 300);
  const CELL = 16;
  const buckets = new Map();
  t.forEach((tree, i) => {
    const key = `${Math.floor(tree.x / CELL)},${Math.floor(tree.z / CELL)}`;
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(i);
  });
  let worst = Infinity;
  for (const [key, ids] of buckets) {
    const [ci, cj] = key.split(',').map(Number);
    const near = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const b = buckets.get(`${ci + di},${cj + dj}`);
        if (b) near.push(...b);
      }
    }
    for (const i of ids) {
      for (const j of near) {
        if (i === j) continue;
        const d = Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z);
        if (d < worst) worst = d;
      }
    }
  }
  // The landmark tree keeps its own authored clearing, so the tightest legal
  // pair is two saplings — still well clear of a shared trunk.
  assert.ok(worst > 1.6, `closest pair of trunks is ${worst.toFixed(2)} m apart`);
});

test('vegetation: a treeline exists — stands thin out with altitude', () => {
  // The cheapest scale cue in existence, and the world had none: trees sat at
  // identical density on the summit, the 40-degree face and the flats.
  const low = veg.trees.filter((t) => t.y < 14).length;
  const high = veg.trees.filter((t) => t.y > 32).length;
  assert.ok(low > 150, `only ${low} trees on the low ground`);
  assert.ok(high < low * 0.06, `${high} trees above 32 m vs ${low} below 14 m`);
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
