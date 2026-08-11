/**
 * abilityFx.test.js — the renderer, checked against the TECH LAW and against
 * the one failure mode a pooled particle system actually has: leaking.
 *
 * These run under plain node with the real three package (no WebGL context is
 * ever created — nothing here calls render), which is how battle3d.test.js
 * already tests the shard pool it borrows from.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { MOMENT_STYLE, MOMENT, rewardFlight } from './progression.js';
import { CADENCE_COLLECTIBLES } from './rewardCadence.js';
import { createAbilityFx, SHARD_CAP, COIN_CAP } from './abilityFx.js';

const fx = (opts = {}) => createAbilityFx({ groundAt: () => 0, ...opts });

/** Every mesh in the tree, so the budget checks are on what is really there. */
function meshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// ── Budget ──────────────────────────────────────────────────────────────────

test('the whole layer is a handful of draw calls', () => {
  const f = fx();
  // Instanced meshes are one call each however full they are; the ring and the
  // tether are one each and both are usually hidden.
  assert.ok(meshes(f.group).length <= 5, `${meshes(f.group).length} meshes`);
  f.dispose();
});

test('the shard and coin pools are instanced, not one mesh per particle', () => {
  const f = fx();
  const inst = meshes(f.group).filter((m) => m.isInstancedMesh);
  assert.equal(inst.length, 2);
  assert.equal(inst.find((m) => m.name === 'abl-shards').count, SHARD_CAP);
  assert.equal(inst.find((m) => m.name === 'abl-coins').count, COIN_CAP);
  f.dispose();
});

test('nothing in here reads depth, post-processes or casts 160 shadows', () => {
  const f = fx();
  const shards = meshes(f.group).find((m) => m.name === 'abl-shards');
  assert.equal(shards.castShadow, false, '160 shadow casters for a 1 s effect');
  for (const m of meshes(f.group)) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      assert.equal(mat.depthTest, true);
      assert.equal(mat.transparent, false, 'a transparent shard would need sorting');
    }
  }
  f.dispose();
});

test('every colour is a PAPER colour — art law', () => {
  const f = fx();
  const paper = new Set(Object.values(PAPER).map((c) => new THREE.Color(c).getHex()));
  for (const m of meshes(f.group)) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      // The shard/coin material is white and carries colour per instance.
      if (mat.color.getHex() === 0xffffff) continue;
      assert.ok(paper.has(mat.color.getHex()), `${m.name} is off-palette`);
    }
  }
  f.dispose();
});

// ── Bursts ──────────────────────────────────────────────────────────────────

test('a burst spawns, lives and returns its shards to the pool', () => {
  const f = fx();
  assert.equal(f.stats.live, 0);
  f.burst(0, 1, 0, { count: 20, life: 0.5, tint: PAPER.gold });
  assert.equal(f.stats.live, 20);
  for (let i = 0; i < 60; i++) f.update(1 / 60, 0);
  assert.equal(f.stats.live, 0, 'shards leaked');
  f.dispose();
});

test('a progression style plugs straight into burst() with no adapter', () => {
  // This is the contract that keeps the two modules from drifting apart.
  const f = fx();
  const style = MOMENT_STYLE[MOMENT.LEVEL_UP];
  f.burst(0, 1, 0, { ...style.burst, tint: style.tint });
  assert.equal(f.stats.live, style.burst.count);
  f.dispose();
});

test('the pool saturates instead of growing', () => {
  const f = fx();
  for (let i = 0; i < 20; i++) f.burst(0, 1, 0, { count: 40, life: 4 });
  assert.ok(f.stats.live <= SHARD_CAP);
  const shards = meshes(f.group).find((m) => m.name === 'abl-shards');
  assert.equal(shards.count, SHARD_CAP, 'the pool was resized mid-frame');
  f.dispose();
});

test('a burst of zero is a burst of zero, not a crash', () => {
  const f = fx();
  f.burst(0, 0, 0, { count: 0 });
  f.update(1 / 60, 0);
  assert.equal(f.stats.live, 0);
  f.dispose();
});

// ── The reward flight ───────────────────────────────────────────────────────

test('a reward flight honours the stagger progression authored', () => {
  const f = fx();
  const flight = rewardFlight({ gold: 100, xp: 40, potions: 1 });
  const arrived = [];
  f.flyRewards({ x: 0, y: 1, z: 0 }, { x: 0, y: 6, z: 0 }, flight, (it) => arrived.push(it.kind));
  assert.equal(f.stats.live, flight.length);
  // Nothing has landed on the first frame — they are still leaving.
  f.update(1 / 60, 0);
  assert.equal(arrived.length, 0);
  for (let i = 0; i < 240; i++) f.update(1 / 60, 0);
  assert.equal(arrived.length, flight.length, 'a reward never landed');
  assert.equal(f.stats.live, 0);
  // The potion is authored first, so it lands first.
  assert.equal(arrived[0], 'potion');
  f.dispose();
});

test('a reward flight into a full pool drops rewards rather than growing it', () => {
  const f = fx();
  f.burst(0, 0, 0, { count: SHARD_CAP, life: 9 });
  const n = f.flyRewards({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }, rewardFlight({ gold: 90 }));
  assert.equal(n, 0);
  f.dispose();
});

// ── The aim ring and the tether ─────────────────────────────────────────────

test('the aim ring appears on a target and vanishes without one', () => {
  const f = fx();
  const ring = f.group.children.find((c) => c.name === 'abl-telegraph');
  assert.equal(ring.visible, false);
  f.aim({ x: 3, y: 0, z: 4 }, PAPER.teal);
  f.update(1 / 60, 0);
  assert.equal(ring.visible, true);
  assert.equal(ring.position.x, 3);
  assert.equal(ring.position.z, 4);
  f.aim(null);
  assert.equal(ring.visible, false);
  f.dispose();
});

test('the ring sits on the GROUND, not at the body it is under', () => {
  const f = createAbilityFx({ groundAt: () => 12.5 });
  f.aim({ x: 0, y: 40, z: 0 });
  f.update(1 / 60, 0);
  const ring = f.group.children.find((c) => c.name === 'abl-telegraph');
  assert.ok(Math.abs(ring.position.y - 12.55) < 1e-6, `ring at y=${ring.position.y}`);
  f.dispose();
});

test('the tether spans the two points it is given', () => {
  const f = fx();
  const t = f.group.children.find((c) => c.name === 'abl-tether');
  assert.equal(t.visible, false);
  f.setTether({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 0 });
  assert.equal(t.visible, true);
  assert.ok(Math.abs(t.scale.y - 3) < 1e-6);
  f.setTether(null, null);
  assert.equal(t.visible, false);
  f.dispose();
});

test('a zero-length tether does not produce NaN', () => {
  const f = fx();
  f.setTether({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });
  const t = f.group.children.find((c) => c.name === 'abl-tether');
  assert.ok(Number.isFinite(t.scale.y));
  assert.ok(Number.isFinite(t.quaternion.x));
  f.dispose();
});

// ── Coins ───────────────────────────────────────────────────────────────────

test('the real cadence trail fits in the coin pool', () => {
  assert.ok(CADENCE_COLLECTIBLES.length <= COIN_CAP,
    `${CADENCE_COLLECTIBLES.length} coins against a cap of ${COIN_CAP}`);
});

test('coins are placed, bob, and pop when taken', () => {
  const f = fx();
  f.setCoins(CADENCE_COLLECTIBLES);
  assert.equal(f.stats.coins, CADENCE_COLLECTIBLES.length);
  f.update(1 / 60, 0);
  const first = CADENCE_COLLECTIBLES[0];
  assert.equal(f.takeCoin(first.id), true);
  assert.equal(f.stats.coins, CADENCE_COLLECTIBLES.length - 1);
  assert.ok(f.stats.live > 0, 'a collected coin should burst');
  assert.equal(f.takeCoin(first.id), false, 'taken twice');
  assert.equal(f.takeCoin('not-a-coin'), false);
  f.dispose();
});

test('more coins than the pool holds is a clamp, not a crash', () => {
  const f = fx();
  const many = [];
  for (let i = 0; i < COIN_CAP * 2; i++) many.push({ id: `c${i}`, x: i, z: 0, kind: 'gold', amount: 1 });
  f.setCoins(many);
  assert.equal(f.stats.coins, COIN_CAP);
  f.dispose();
});

test('setCoins twice replaces rather than accumulates', () => {
  const f = fx();
  f.setCoins(CADENCE_COLLECTIBLES);
  f.setCoins(CADENCE_COLLECTIBLES.slice(0, 3));
  assert.equal(f.stats.coins, 3);
  f.dispose();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

test('reset silences everything and leaves the layer usable', () => {
  const f = fx();
  f.burst(0, 0, 0, { count: 30, life: 5 });
  f.aim({ x: 1, y: 0, z: 1 });
  f.setTether({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  f.reset();
  assert.equal(f.stats.live, 0);
  assert.equal(f.group.children.find((c) => c.name === 'abl-telegraph').visible, false);
  assert.equal(f.group.children.find((c) => c.name === 'abl-tether').visible, false);
  f.burst(0, 0, 0, { count: 5 });
  assert.equal(f.stats.live, 5);
  f.dispose();
});

test('dispose releases every geometry and material, exactly once', () => {
  const f = fx();
  const geos = new Set();
  const mats = new Set();
  for (const m of meshes(f.group)) {
    geos.add(m.geometry);
    for (const mm of (Array.isArray(m.material) ? m.material : [m.material])) mats.add(mm);
  }
  let disposed = 0;
  for (const g of geos) { const o = g.dispose.bind(g); g.dispose = () => { disposed++; o(); }; }
  for (const m of mats) { const o = m.dispose.bind(m); m.dispose = () => { disposed++; o(); }; }
  f.dispose();
  assert.equal(disposed, geos.size + mats.size);
  f.dispose();
  assert.equal(disposed, geos.size + mats.size, 'dispose is not idempotent');
});

test('a long run never grows the scene graph', () => {
  const f = fx();
  const before = meshes(f.group).length;
  for (let i = 0; i < 400; i++) {
    if (i % 20 === 0) f.burst(0, 1, 0, { count: 12, life: 0.6 });
    f.update(1 / 60, i * 0.01);
  }
  assert.equal(meshes(f.group).length, before);
  f.dispose();
});
