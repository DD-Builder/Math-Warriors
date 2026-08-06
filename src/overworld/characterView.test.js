/**
 * Hero rig contract tests.
 *
 * The rig is judged from screenshots, so these are the invariants a picture
 * cannot protect: the palette law (every ply is a scalar multiple of a PAPER
 * colour — no stray hex ever creeps in), the draw-call budget that lets the
 * hero cost 17 calls instead of 40, the determinism the screenshot harness
 * depends on (reset + a fixed clock = the same pose, twice, on any machine),
 * the fixed-size particle pools that keep update() allocation-free, and a
 * dispose() that actually lets go.
 *
 * three's core runs headless in plain Node, so this exercises the real module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createCharacterView, heroClassOf } from './characterView.js';
import { PAPER } from '../config.js';

const CLASSES = ['knight', 'wizard', 'bunny'];
const NODES = ['torso', 'head', 'crown', 'armL', 'armR', 'legL', 'legR'];

const idle = (over = {}) => ({
  pos: { x: 4, y: 3, z: -2 }, vel: { x: 0, y: 0, z: 0 },
  yaw: 0.5, grounded: true, wading: false, ...over,
});

test('characterView: dresses from the party leader, and never throws on junk', () => {
  assert.equal(heroClassOf({ id: 'knight-shadow', class: 'knight' }), 'knight');
  assert.equal(heroClassOf({ id: 'wizard-stargazer', class: 'wizard' }), 'wizard');
  assert.equal(heroClassOf({ id: 'bunny-pepper', class: 'bunny' }), 'bunny');
  // id alone is enough — a v5 save stores no class field.
  assert.equal(heroClassOf('wizard-toadstool'), 'wizard');
  assert.equal(heroClassOf('bunny-nova'), 'bunny');
  // A corrupt save must cost the player nothing worse than a knight.
  assert.equal(heroClassOf(null), 'knight');
  assert.equal(heroClassOf({}), 'knight');
  assert.equal(heroClassOf(42), 'knight');
});

test('characterView: seven animated nodes, hero group name preserved', () => {
  const v = createCharacterView({ heroClass: 'knight' });
  assert.equal(v.group.name, 'hero', 'index.js and every pose key off this name');
  assert.equal(Object.keys(v.nodes).length, NODES.length);
  for (const n of NODES) assert.ok(v.nodes[n], `node ${n} exists`);
  // FX must NOT ride the hero: dust is left on the ground, not carried.
  assert.notEqual(v.fx.parent, v.group);
  assert.ok(v.fx.children.length >= 2, 'dust + mote pools');
  v.dispose();
});

test('characterView: every class is built from real papercut plies', () => {
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    assert.equal(v.stats.heroClass, c);
    assert.ok(v.stats.plies >= 20, `${c}: ${v.stats.plies} plies >= 20`);
    for (const n of NODES) {
      const geo = v.nodes[n].geometry;
      assert.ok(geo.attributes.position.count > 0, `${c}/${n} has geometry`);
      assert.ok(geo.attributes.color, `${c}/${n} carries ply colour`);
      assert.ok(geo.boundingSphere, `${c}/${n} baked its bounds`);
    }
    v.dispose();
  }
});

test('characterView: every ply colour is a PAPER colour (palette law)', () => {
  // Layer shading multiplies a palette colour by a scalar, so a legal ply is
  // one whose linear RGB is PARALLEL to some PAPER entry. Anything else is a
  // hex somebody typed by hand, which is exactly what this test exists to stop.
  const dirs = Object.values(PAPER).map((hex) => {
    const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
    const l = Math.hypot(c.r, c.g, c.b) || 1;
    return [c.r / l, c.g / l, c.b / l];
  });
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    for (const n of NODES) {
      const col = v.nodes[n].geometry.attributes.color.array;
      for (let i = 0; i < col.length; i += 3) {
        const l = Math.hypot(col[i], col[i + 1], col[i + 2]);
        assert.ok(l > 0.01, `${c}/${n}: no black plies — shadows are teal here`);
        const ok = dirs.some((d) =>
          Math.abs(col[i] / l - d[0]) < 2e-3
          && Math.abs(col[i + 1] / l - d[1]) < 2e-3
          && Math.abs(col[i + 2] / l - d[2]) < 2e-3);
        assert.ok(ok, `${c}/${n}: ply colour is off-palette`);
      }
    }
    v.dispose();
  }
});

test('characterView: hero fits its slice of the draw-call budget', () => {
  const v = createCharacterView({ heroClass: 'wizard' });
  // 7 nodes + shadow blob + 2 pools in colour, the 7 nodes again in the shadow
  // pass. The whole frame's ceiling is 250, and the hero is one character.
  assert.equal(v.stats.colorPassCalls, 10);
  assert.equal(v.stats.shadowPassCalls, 7);
  assert.equal(v.stats.drawCalls, 17);
  assert.ok(v.stats.triangles < 8000, `hero triangles ${v.stats.triangles} < 8k`);
  v.dispose();
});

test('characterView: shadow casting can be switched off for a low tier', () => {
  const v = createCharacterView({ heroClass: 'bunny', castShadow: false });
  assert.equal(v.stats.shadowPassCalls, 0);
  assert.equal(v.nodes.torso.castShadow, false);
  v.dispose();
});

test('characterView: reset + a fixed clock is bit-identical across instances', () => {
  // This IS the screenshot harness contract: setPose() resets the rig and pins
  // the clock, so two runs of one pose must produce the same joint angles.
  const a = createCharacterView({ heroClass: 'knight' });
  const b = createCharacterView({ heroClass: 'knight' });
  // Give `a` a completely different history first — it must not survive reset.
  const running = idle({ vel: { x: 6, y: 0, z: 4 }, yaw: 1.2 });
  for (let i = 0; i < 120; i++) a.update(running, i * 0.016, 2.4);
  a.reset();

  const st = idle();
  a.update(st, 12, 2.4);
  b.update(st, 12, 2.4);
  for (const n of NODES) {
    const x = a.nodes[n];
    const y = b.nodes[n];
    assert.deepEqual(
      [x.rotation.x, x.rotation.y, x.rotation.z, x.scale.y],
      [y.rotation.x, y.rotation.y, y.rotation.z, y.scale.y],
      `node ${n} reproduces`,
    );
  }
  assert.equal(a.group.position.x, 4);
  assert.equal(a.group.rotation.y, 0.5);
  a.dispose();
  b.dispose();
});

test('characterView: a held pose (dt = 0) spawns no particles', () => {
  const v = createCharacterView({ heroClass: 'bunny' });
  v.reset();
  // Land hard, twice, at a frozen clock — a pose renders more than once.
  const air = idle({ grounded: false, vel: { x: 4, y: -9, z: 0 } });
  v.update(air, 12, 0);
  v.update(idle({ vel: { x: 4, y: 0, z: 0 } }), 12, 0);
  v.update(idle({ vel: { x: 4, y: 0, z: 0 } }), 12, 0);
  const dust = v.fx.children[0];
  let live = 0;
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  for (let i = 0; i < dust.count; i++) {
    dust.getMatrixAt(i, m);
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    if (s.x > 1e-6) live++;
  }
  assert.equal(live, 0, 'frozen frames must not spawn dust');
  v.dispose();
});

test('characterView: landing squashes the rig and kicks up dust', () => {
  const v = createCharacterView({ heroClass: 'knight' });
  v.reset();
  let t = 0;
  const airborne = idle({ grounded: false, vel: { x: 0, y: -9, z: 0 } });
  for (let i = 0; i < 20; i++, t += 0.016) v.update(airborne, t, 0);
  const rig = v.group.children[0];
  const airborneScaleY = rig.scale.y;
  t += 0.016;
  v.update(idle(), t, 0);
  assert.ok(rig.scale.y < airborneScaleY - 0.05, 'landing squashes vertically');
  assert.ok(rig.scale.x > 1.02, 'and widens');

  const dust = v.fx.children[0];
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  let live = 0;
  for (let i = 0; i < dust.count; i++) {
    dust.getMatrixAt(i, m);
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    if (s.x > 1e-6) live++;
  }
  assert.ok(live > 0, 'a hard landing throws dust');

  // …and the squash releases on its own.
  for (let i = 0; i < 60; i++, t += 0.016) v.update(idle(), t, 0);
  assert.ok(Math.abs(rig.scale.y - 1) < 0.02, 'squash decays back to rest');
  v.dispose();
});

test('characterView: particle pools are fixed size and never grow', () => {
  const v = createCharacterView({ heroClass: 'bunny' });
  const [dust, motes] = v.fx.children;
  const dCount = dust.count;
  const mCount = motes.count;
  const dLen = dust.instanceMatrix.array.length;
  const mLen = motes.instanceMatrix.array.length;
  let t = 0;
  // Sprint through water for ten seconds — the heaviest emitter in the rig.
  const wading = idle({ vel: { x: 8, y: 0, z: 3 }, wading: true });
  for (let i = 0; i < 620; i++, t += 0.016) v.update(wading, t, 0);
  assert.equal(dust.count, dCount);
  assert.equal(motes.count, mCount);
  assert.equal(dust.instanceMatrix.array.length, dLen, 'no reallocation under load');
  assert.equal(motes.instanceMatrix.array.length, mLen);
  assert.ok(dust.instanceColor, 'instance colour buffer was preallocated');
  v.dispose();
});

test('characterView: the walk cycle actually swings, and stillness is still', () => {
  const v = createCharacterView({ heroClass: 'wizard' });
  v.reset();
  let t = 0;
  let minLeg = Infinity;
  let maxLeg = -Infinity;
  const walk = idle({ vel: { x: 6, y: 0, z: 0 }, yaw: Math.PI / 2 });
  for (let i = 0; i < 200; i++, t += 0.016) {
    v.update(walk, t, 0);
    minLeg = Math.min(minLeg, v.nodes.legL.rotation.x);
    maxLeg = Math.max(maxLeg, v.nodes.legL.rotation.x);
  }
  assert.ok(maxLeg - minLeg > 0.5, `leg swings ${(maxLeg - minLeg).toFixed(2)} rad`);
  // Arms must oppose the legs, or the hero pantomimes rather than walks.
  assert.ok(v.nodes.armL.rotation.x * v.nodes.armR.rotation.x < 0.02);

  v.reset();
  let minTorso = Infinity;
  let maxTorso = -Infinity;
  for (let i = 0; i < 200; i++, t += 0.016) {
    v.update(idle(), t, 0);
    minTorso = Math.min(minTorso, v.nodes.torso.rotation.y);
    maxTorso = Math.max(maxTorso, v.nodes.torso.rotation.y);
  }
  assert.ok(maxTorso - minTorso < 0.01, 'standing still does not swing the torso');
  v.dispose();
});

test('characterView: the contact shadow tightens on the ground and blooms in air', () => {
  const v = createCharacterView({ heroClass: 'knight' });
  const blob = v.group.children.find((o) => o.name === 'hero-shadow');
  assert.ok(blob, 'hero carries a contact shadow');
  v.reset();
  v.update(idle({ pos: { x: 0, y: 2, z: 0 } }), 1, 2);
  const groundScale = blob.scale.x;
  const groundAlpha = blob.material.opacity;
  assert.ok(Math.abs(blob.position.y - 0.035) < 1e-6, 'sits on the ground plane');

  v.update(idle({ pos: { x: 0, y: 5.5, z: 0 }, grounded: false }), 1.05, 2);
  assert.ok(blob.scale.x > groundScale + 0.4, 'blooms with altitude');
  assert.ok(blob.material.opacity < groundAlpha, 'and softens');
  assert.ok(Math.abs(blob.position.y - (2 - 5.5 + 0.035)) < 1e-6, 'stays on the ground');
  // Teal, never grey: the papercut law has exactly one shadow hue.
  assert.equal(blob.material.color.getHex(THREE.SRGBColorSpace), PAPER.shadow);
  v.dispose();
});

test('characterView: wading sinks the hero and splays the arms', () => {
  const v = createCharacterView({ heroClass: 'bunny' });
  v.reset();
  let t = 0;
  for (let i = 0; i < 40; i++, t += 0.016) v.update(idle(), t, 3);
  const rig = v.group.children[0];
  const dryY = rig.position.y;
  const drySplay = v.nodes.armL.rotation.z;
  for (let i = 0; i < 90; i++, t += 0.016) v.update(idle({ wading: true }), t, 3);
  assert.ok(rig.position.y < dryY - 0.1, 'wading sinks the body');
  assert.ok(v.nodes.armL.rotation.z > drySplay + 0.2, 'and lifts the arms clear');
  v.dispose();
});

test('characterView: dispose releases every geometry and material', () => {
  const v = createCharacterView({ heroClass: 'wizard' });
  const geos = new Set();
  const mats = new Set();
  for (const root of [v.group, v.fx]) {
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) mats.add(o.material);
    });
  }
  assert.ok(geos.size >= 8);
  let disposed = 0;
  for (const g of geos) g.addEventListener('dispose', () => { disposed++; });
  for (const m of mats) m.addEventListener('dispose', () => { disposed++; });
  v.dispose();
  assert.equal(disposed, geos.size + mats.size, 'everything got a dispose event');
  assert.equal(v.group.children.length, 0);
  assert.equal(v.fx.children.length, 0);
});
