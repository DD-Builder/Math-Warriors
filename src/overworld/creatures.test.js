/**
 * Creature contract tests.
 *
 * The art is judged from screenshots; what a unit test can protect is the set
 * of promises that make the wildlife affordable and KIND:
 *
 *   · every floor's own monsters live in that floor's biome, on dry walkable
 *     ground, never inside a gate or on the spawn pad;
 *   · a species costs no more than the authored triangle ceiling and the whole
 *     population fits the draw-call budget;
 *   · the sim is deterministic — same seed, same walk, same island;
 *   · a child can never be surrounded, and the timid half of the roster can
 *     never start a fight on its own;
 *   · dispose() lets go of everything.
 *
 * Every one of these can regress silently while the screenshots still look
 * fine, which is exactly what a test is for.
 *
 * three's core runs headless in plain Node, so this exercises the real module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { PAPER } from './materials/toon.js';

import { createHeightfield } from './heightfield.js';
import { WORLD, BIOMES, PORTALS, SPAWN } from './worldSpec.js';
import { ALL_ENEMIES, BOSS_IDS, getEnemyById } from '../data/enemies.js';
import {
  createCreatures, SPECIES, AMBIENT, stepSim, largestAngularGap, angleDelta,
  hash01, blob, facet, ply, C, ESCAPE_ARC, NOTICE_R, SIM_HZ,
} from './creatures.js';
import { sink, bake } from './geobuild.js';

// One island, one population: createCreatures bakes 30 geometries and is far
// too expensive to run per assertion.
const hf = createHeightfield(WORLD.SEED);
const pop = createCreatures(hf);
const s = pop.stats;

// ── Roster ──────────────────────────────────────────────────────────────

test('creatures: every floor 1-9 is represented by its own monsters', () => {
  for (let floor = 1; floor <= 9; floor++) {
    const here = SPECIES.filter((sp) => sp.floor === floor);
    assert.ok(here.length >= 3, `floor ${floor} has ${here.length} species`);
  }
});

test('creatures: every species is a real non-boss enemy from the roster', () => {
  for (const sp of SPECIES) {
    const e = getEnemyById(sp.enemyId);
    assert.ok(e, `${sp.id} -> unknown enemy id ${sp.enemyId}`);
    assert.equal(e.floor, sp.floor, `${sp.id} floor mismatch`);
    // A boss is an event you climb to. One wandering past the shops would
    // spend the surprise the boss rig exists to deliver.
    assert.ok(!BOSS_IDS.includes(sp.enemyId), `${sp.id} is a boss`);
  }
});

test('creatures: no duplicate species ids', () => {
  const ids = SPECIES.concat(AMBIENT).map((sp) => sp.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('creatures: the roster is a real subset of the game bestiary', () => {
  const mobs = ALL_ENEMIES.filter((e) => !BOSS_IDS.includes(e.id));
  assert.ok(SPECIES.length >= mobs.length * 0.7,
    `${SPECIES.length} of ${mobs.length} mobs inhabit the island`);
});

// ── Population and placement ────────────────────────────────────────────

test('creatures: 40-60 roaming creatures across the island', () => {
  assert.ok(s.creatures >= 40, `${s.creatures} >= 40`);
  assert.ok(s.creatures <= 60, `${s.creatures} <= 60`);
});

test('creatures: every biome hosts its OWN floor roster, and only that', () => {
  const byBiome = new Map();
  for (const c of pop.creatures) {
    const biome = BIOMES.find((b) => b.id === c.biome);
    assert.ok(biome, `${c.id} in unknown biome ${c.biome}`);
    assert.equal(biome.floorId, c.floor, `${c.id} (floor ${c.floor}) in ${c.biome}`);
    byBiome.set(c.biome, (byBiome.get(c.biome) || 0) + 1);
  }
  // All nine themed biomes are inhabited — an empty region is a dead region.
  assert.equal(byBiome.size, 9, `inhabited biomes: ${[...byBiome.keys()].join(',')}`);
});

test('creatures: nobody stands in the sea, on a cliff, or on a gate', () => {
  for (const c of pop.creatures) {
    const h = hf.sampleHeight(c.hx, c.hz);
    assert.ok(h > WORLD.WATER_Y + 0.5, `${c.id} at height ${h.toFixed(2)}`);
    assert.ok(hf.sampleNormal(c.hx, c.hz)[1] >= 0.86, `${c.id} on a cliff`);
    for (const p of PORTALS) {
      const d = Math.hypot(c.hx - p.x, c.hz - p.z);
      assert.ok(d >= 9, `${c.id} is ${d.toFixed(1)} m from ${p.id}`);
    }
    const ds = Math.hypot(c.hx - SPAWN.x, c.hz - SPAWN.z);
    assert.ok(ds >= 8, `${c.id} is ${ds.toFixed(1)} m from the spawn`);
  }
});

test('creatures: homes are scattered, not stacked on the biome centre', () => {
  // A silent rejection-sampling failure would park every creature of a biome
  // on the fallback point, which looks exactly like a bug in the art.
  const seen = new Set(pop.creatures.map((c) => `${c.hx.toFixed(1)},${c.hz.toFixed(1)}`));
  assert.equal(seen.size, pop.creatures.length);
});

test('creatures: ambient life exists and is non-hostile', () => {
  assert.ok(AMBIENT.length >= 3);
  assert.ok(pop.ambient.length >= 60, `${pop.ambient.length} ambient critters`);
  for (const a of pop.ambient) assert.equal(a.enemyId, undefined);
});

// ── Budget ──────────────────────────────────────────────────────────────

test('creatures: no species exceeds 600 triangles', () => {
  for (const [id, n] of Object.entries(s.trisBySpecies)) {
    assert.ok(n <= 600, `${id} is ${n} triangles`);
    // A species under ~90 triangles is a lozenge, not a character.
    assert.ok(n >= 90, `${id} is only ${n} triangles`);
  }
});

test('creatures: the whole population fits the shared budget', () => {
  assert.ok(s.triangles <= 120_000, `${s.triangles} triangles resident`);
  // Worst case: every species inside the cull radius at once. Biomes are
  // ~300 m apart on a 480 m island, so the real figure is a third of this.
  assert.ok(s.drawCalls <= 40, `${s.drawCalls} draw calls`);
});

test('creatures: distance culling actually sheds meshes', () => {
  const meshes = pop.group.children.filter((m) => m.isInstancedMesh);
  pop.update(1 / 60, 0, { x: SPAWN.x, y: 0, z: SPAWN.z });
  const nearSpawn = meshes.filter((m) => m.visible).length;
  pop.update(1 / 60, 0.05, { x: 0, y: 0, z: 4000 });
  const faraway = meshes.filter((m) => m.visible).length;
  assert.equal(faraway, 0, 'everything culls when the player is off the map');
  assert.ok(nearSpawn > 0, 'something is visible at the spawn');
  assert.ok(nearSpawn < meshes.length, `${nearSpawn}/${meshes.length} visible at spawn`);
});

// ── Papercut kit ────────────────────────────────────────────────────────

test('creatures: a ply costs exactly the triangles it promises', () => {
  const a = sink(false);
  ply(a, blob(0, 0, 10, 10, 8), { z: 0, d: 4, c: 0xffffff });
  assert.equal(bake(a).attributes.position.count / 3, 8 * 4);   // front + rim + back
  const b = sink(false);
  ply(b, facet(0, 0, 10, 6), { z: 0, d: 4, c: 0xffffff, back: false });
  assert.equal(bake(b).attributes.position.count / 3, 6 * 3);   // front + rim
});

test('creatures: a ply winds its front cap toward +Z whichever way it is authored', () => {
  const cw = sink(false);
  ply(cw, [[-10, -10], [10, -10], [10, 10], [-10, 10]], { z: 0, d: 2, c: 0xffffff });
  const ccw = sink(false);
  ply(ccw, [[-10, 10], [10, 10], [10, -10], [-10, -10]], { z: 0, d: 2, c: 0xffffff });
  // Same solid either way: the signed-area flip inside ply() is what stops a
  // silhouette from vanishing because it was transcribed backwards.
  const ga = bake(cw), gb = bake(ccw);
  assert.equal(ga.attributes.position.count, gb.attributes.position.count);
  assert.deepEqual([...ga.attributes.position.array], [...gb.attributes.position.array]);
});

// ── Palette law ─────────────────────────────────────────────────────────

test('creatures: every authored colour is a PAPER value', () => {
  const allowed = new Set(Object.values(PAPER));
  for (const [name, hex] of Object.entries(C)) {
    assert.ok(allowed.has(hex), `C.${name} = #${hex.toString(16)} is not in PAPER`);
  }
});

test('creatures: no shadow is ever black, grey or brown — creases lean teal', () => {
  // The single loudest way this art style dies is a dark outline. Every dark
  // value baked into a creature must be a TEAL-tinted paper crease, so a dark
  // colour with no teal lean is a bug by definition, not a taste call.
  const col = new THREE.Color();
  for (const spec of SPECIES.concat(AMBIENT)) {
    const sk = sink(false);
    spec.build(sk);
    const c = bake(sk).attributes.color.array;
    for (let i = 0; i < c.length; i += 3) {
      col.setRGB(c[i], c[i + 1], c[i + 2], THREE.LinearSRGBColorSpace).convertLinearToSRGB();
      const r = col.r * 255, g = col.g * 255, b = col.b * 255;
      if (Math.max(r, g, b) > 105) continue;    // a light or saturated paper
      assert.ok(g >= r - 1 && b >= r - 1,
        `${spec.id} has a dark neutral/warm value rgb(${r | 0},${g | 0},${b | 0})`);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) > 8,
        `${spec.id} has a dark GREY value rgb(${r | 0},${g | 0},${b | 0})`);
    }
  }
});

// ── Behaviour ───────────────────────────────────────────────────────────

test('creatures: largestAngularGap finds the escape wedge', () => {
  assert.equal(largestAngularGap([]), Math.PI * 2);
  assert.equal(largestAngularGap([0.3]), Math.PI * 2);
  // Two creatures side by side leave nearly the whole circle open.
  assert.ok(Math.abs(largestAngularGap([0, 0.4]) - (Math.PI * 2 - 0.4)) < 1e-9);
  assert.ok(largestAngularGap([0, 0.4]) > ESCAPE_ARC);
  // Two on opposite sides leave exactly half each — the boundary case.
  assert.ok(Math.abs(largestAngularGap([0, Math.PI]) - Math.PI) < 1e-9);
  // Four spread evenly leave only a quarter turn — this is being surrounded.
  const ring = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  assert.ok(Math.abs(largestAngularGap(ring) - Math.PI / 2) < 1e-9);
});

test('creatures: angleDelta takes the short way round', () => {
  assert.ok(Math.abs(angleDelta(3.0, -3.0) - (Math.PI * 2 - 6.0)) < 1e-9);
  assert.ok(Math.abs(angleDelta(0, Math.PI / 2) - Math.PI / 2) < 1e-9);
});

test('creatures: hash01 is a stable, spread, wall-clock-free source', () => {
  assert.equal(hash01(7, 11), hash01(7, 11));
  assert.notEqual(hash01(7, 11), hash01(7, 12));
  let sum = 0;
  for (let i = 0; i < 4000; i++) {
    const v = hash01(i, 3);
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  assert.ok(Math.abs(sum / 4000 - 0.5) < 0.03);
});

test('creatures: the sim is deterministic across identical runs', () => {
  const snapshot = () => {
    const p = createCreatures(hf);
    const pos = { x: SPAWN.x, y: 0, z: SPAWN.z };
    for (let f = 0; f < 400; f++) {
      pos.z -= 0.08;
      p.update(1 / 60, f / 60, pos);
    }
    const out = p.creatures.map((c) => `${c.x.toFixed(6)},${c.z.toFixed(6)},${c.yaw.toFixed(6)}`).join('|');
    p.dispose();
    return out;
  };
  assert.equal(snapshot(), snapshot());
});

test('creatures: a curious one walks up, and touching it starts a battle', () => {
  const fired = [];
  const p = createCreatures(hf, { hooks: { onEncounter: (id, info) => fired.push([id, info]) } });
  const target = p.creatures.find((c) => c.temperament === 'curious');
  const pos = { x: target.hx + 9, y: 0, z: target.hz };
  for (let f = 0; f < 900 && !fired.length; f++) p.update(1 / 60, f / 60, pos);
  assert.equal(fired.length, 1, 'exactly one encounter');
  assert.equal(fired[0][0], target.enemyId);
  const info = fired[0][1];
  assert.equal(info.speciesId, target.speciesId);
  assert.equal(info.floor, target.floor);
  assert.equal(typeof info.x, 'number');
  p.dispose();
});

test('creatures: encounters can be suspended while a battle loads', () => {
  const fired = [];
  const p = createCreatures(hf, { hooks: { onEncounter: (id) => fired.push(id) } });
  p.setEncountersEnabled(false);
  const target = p.creatures.find((c) => c.temperament === 'curious');
  const pos = { x: target.hx + 2, y: 0, z: target.hz };
  for (let f = 0; f < 600; f++) p.update(1 / 60, f / 60, pos);
  assert.equal(fired.length, 0);
  p.dispose();
});

test('creatures: one encounter at a time, and a beaten creature backs off', () => {
  const fired = [];
  const p = createCreatures(hf, { hooks: { onEncounter: (id) => fired.push(id) } });
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z };
  // Stand ON a whole cluster of homes at once — the worst case for a
  // battle-launch storm.
  const c0 = p.creatures[0];
  for (let i = 0; i < 6; i++) {
    const c = p.creatures[i];
    c.x = c.hx = c0.hx + Math.cos(i) * 0.4;
    c.z = c.hz = c0.hz + Math.sin(i) * 0.4;
  }
  pos.x = c0.hx; pos.z = c0.hz;
  for (let f = 0; f < 30; f++) p.update(1 / 60, f / 60, pos);
  assert.equal(fired.length, 1, `fired ${fired.length} battles in half a second`);
  p.dispose();
});

test('creatures: the child can never be surrounded', () => {
  // Eight of the friendliest species, evenly ringed at 7 m — comfortably
  // outside the crowd radius — all of them wanting to come and say hello.
  // Left to itself that is a closing circle; the escape-arc rule has to keep
  // half the compass open the entire time.
  const p = createCreatures(hf, { hooks: {} });
  const px = p.creatures[0].hx, pz = p.creatures[0].hz;
  p.creatures.forEach((c, i) => {
    const a = (i / 8) * Math.PI * 2;
    c.temperament = i < 8 ? 'curious' : c.temperament;
    c.hx = px; c.hz = pz; c.homeR = 14;
    c.x = px + Math.cos(a) * (i < 8 ? 7 : 60);
    c.z = pz + Math.sin(a) * (i < 8 ? 7 : 60);
  });
  const ctx = { px, pz, t: 0, ground: hf.sampleHeight, hooks: {}, encountersOn: false, lock: 0 };
  let worst = Math.PI * 2;
  let everCrowded = false;
  for (let k = 0; k < SIM_HZ * 12; k++) {
    ctx.t = k / SIM_HZ;
    stepSim(p.creatures, ctx);
    const near = p.creatures.filter((c) => c.dist2 <= 3.6 * 3.6);
    if (near.length > 1) {
      everCrowded = true;
      worst = Math.min(worst, largestAngularGap(near.map((c) => Math.atan2(c.z - pz, c.x - px))));
    }
  }
  assert.ok(everCrowded, 'the test never actually produced a crowd');
  assert.ok(worst >= ESCAPE_ARC - 1e-6,
    `widest exit shrank to ${(worst * 180 / Math.PI).toFixed(0)} deg`);
  p.dispose();
});

test('creatures: timid species keep their distance and never start a fight', () => {
  const fired = [];
  const p = createCreatures(hf, { hooks: { onEncounter: (id) => fired.push(id) } });
  const timid = p.creatures.filter((c) => c.temperament === 'shy' || c.temperament === 'skittish');
  assert.ok(timid.length > 0);
  const c = timid[0];
  // Stand 4 m off and hold still: it must not close the gap by itself.
  const pos = { x: c.hx + 4, y: 0, z: c.hz };
  let closest = Infinity;
  for (let f = 0; f < 900; f++) {
    p.update(1 / 60, f / 60, pos);
    closest = Math.min(closest, Math.hypot(c.x - pos.x, c.z - pos.z));
  }
  assert.ok(closest > 1.05, `a ${c.temperament} creature closed to ${closest.toFixed(2)} m`);
  assert.equal(fired.length, 0);
  p.dispose();
});

test('creatures: nobody notices the player from beyond the notice radius', () => {
  const p = createCreatures(hf, { hooks: {} });
  const c = p.creatures[0];
  const pos = { x: c.hx + NOTICE_R + 25, y: 0, z: c.hz };
  for (let f = 0; f < 300; f++) p.update(1 / 60, f / 60, pos);
  assert.equal(c.state, 'idle');
  assert.equal(c.startle, 0);
  p.dispose();
});

test('creatures: a startled creature reacts, then settles', () => {
  const p = createCreatures(hf, { hooks: {} });
  const c = p.creatures.find((x) => x.temperament === 'stoic');
  const pos = { x: c.hx + 6, y: 0, z: c.hz };
  p.update(1 / 30, 0, pos);
  assert.ok(c.startle > 0, 'startle fires on first notice');
  for (let f = 1; f < 120; f++) p.update(1 / 60, f / 60, pos);
  assert.equal(c.startle <= 0, true, 'and decays');
  // ...and it is now facing the player.
  const want = Math.atan2(pos.x - c.x, pos.z - c.z);
  assert.ok(Math.abs(angleDelta(c.yaw, want)) < 0.2, 'turned to face');
  p.dispose();
});

test('creatures: nobody leaves their home range or walks into the sea', () => {
  const p = createCreatures(hf, { hooks: {} });
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z };
  for (let f = 0; f < 3000; f++) {
    pos.x = SPAWN.x + Math.sin(f * 0.01) * 60;
    pos.z = SPAWN.z + Math.cos(f * 0.01) * 60;
    p.update(1 / 60, f / 60, pos);
  }
  for (const c of p.creatures) {
    const d = Math.hypot(c.x - c.hx, c.z - c.hz);
    assert.ok(d <= c.homeR * 1.6 + 1e-6, `${c.id} strayed ${d.toFixed(1)} m from home`);
    assert.ok(hf.sampleHeight(c.x, c.z) > WORLD.WATER_Y, `${c.id} is swimming`);
  }
  p.dispose();
});

test('creatures: the sim is frame-rate independent', () => {
  const run = (dt, frames) => {
    const p = createCreatures(hf, { hooks: {} });
    const pos = { x: SPAWN.x, y: 0, z: SPAWN.z };
    for (let f = 0; f < frames; f++) p.update(dt, f * dt, pos);
    const out = p.creatures.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`).join('|');
    p.dispose();
    return out;
  };
  // 2 s at 60 fps and 2 s at 30 fps land on the same fixed ticks.
  assert.equal(run(1 / 60, 120), run(1 / 30, 60));
});

test('creatures: update() survives a stalled tab without simulating a minute', () => {
  const p = createCreatures(hf, { hooks: {} });
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z };
  p.update(90, 0, pos);      // browser was backgrounded
  for (const c of p.creatures) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
  }
  assert.ok(p.simTime < 1, `sim jumped ${p.simTime.toFixed(2)} s in one frame`);
  p.dispose();
});

// ── Teardown ────────────────────────────────────────────────────────────

test('creatures: dispose releases every geometry and material', () => {
  const p = createCreatures(hf, { hooks: {} });
  const geos = new Set();
  const mats = new Set();
  p.group.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) mats.add(o.material);
  });
  assert.ok(geos.size >= SPECIES.length);
  let disposed = 0;
  for (const g of geos) g.addEventListener('dispose', () => { disposed++; });
  for (const m of mats) m.addEventListener('dispose', () => { disposed++; });
  const want = geos.size + mats.size;
  p.dispose();
  assert.equal(disposed, want, `${disposed}/${want} resources released`);
  assert.equal(p.group.children.length, 0);
});
