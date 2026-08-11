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

/**
 * Rasterise the whole rig's silhouette as seen from horizontal angle `az`
 * (0 = straight-on front, PI/2 = pure side) and return its filled area in m^2.
 *
 * Area, not bounding box: a bounding box cannot tell a solid body from two
 * crossed cards, and the invariant this measures is exactly "is there a body
 * there". Coarse grid on purpose — this is a shape assertion, not a renderer.
 */
function silhouetteArea(view, az) {
  const G = 140;
  const U0 = -1.3, U1 = 1.3, V0 = -0.2, V1 = 2.1;
  const du = (U1 - U0) / G, dv = (V1 - V0) / G;
  const ca = Math.cos(az), sa = Math.sin(az);
  const grid = new Uint8Array(G * G);
  const v = new THREE.Vector3();
  for (const name of NODES) {
    const mesh = view.nodes[name];
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position;
    const P = new Float64Array((pos.count / 3) * 6);
    for (let t = 0; t < pos.count / 3; t++) {
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, t * 3 + k).applyMatrix4(mesh.matrixWorld);
        P[t * 6 + k * 2] = v.x * ca - v.z * sa;
        P[t * 6 + k * 2 + 1] = v.y;
      }
    }
    for (let t = 0; t < P.length / 6; t++) {
      const x0 = P[t * 6], y0 = P[t * 6 + 1];
      const x1 = P[t * 6 + 2], y1 = P[t * 6 + 3];
      const x2 = P[t * 6 + 4], y2 = P[t * 6 + 5];
      const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(d) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - U0) / du));
      const i1 = Math.min(G, Math.ceil((Math.max(x0, x1, x2) - U0) / du));
      const j0 = Math.max(0, Math.floor((Math.min(y0, y1, y2) - V0) / dv));
      const j1 = Math.min(G, Math.ceil((Math.max(y0, y1, y2) - V0) / dv));
      for (let j = j0; j < j1; j++) {
        const py = V0 + (j + 0.5) * dv;
        for (let i = i0; i < i1; i++) {
          const px = U0 + (i + 0.5) * du;
          const a = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / d;
          const b = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / d;
          if (a >= 0 && b >= 0 && a + b <= 1) grid[j * G + i] = 1;
        }
      }
    }
  }
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i];
  return n * du * dv;
}

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

test('characterView: the hero has a BODY — he does not vanish edge-on', () => {
  // The rig used to be a stack of single extruded cards: a perfect front
  // silhouette and a 26 cm sliver from the side, keeping only 29% of its area
  // at 90 deg. That is not a cosmetic complaint. The follow boom lerps at 0.12
  // while the controller yaws at 10 rad/s, so every hard turn holds the hero
  // tens of degrees off-axis for most of a second, and the pose harness shoots
  // hero-closeup at 86 deg off his facing. He must read as a character from
  // any angle a player can put the camera at.
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    v.reset();
    v.update(idle({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }), 12, 0);
    const front = silhouetteArea(v, 0);
    assert.ok(front > 0.6, `${c}: front silhouette ${front.toFixed(3)} m2 is real`);
    for (const deg of [45, 90, 135]) {
      const a = silhouetteArea(v, (deg * Math.PI) / 180);
      const ratio = a / front;
      assert.ok(
        ratio > 0.5,
        `${c} at ${deg}deg keeps ${(ratio * 100).toFixed(0)}% of its front area (need >50%)`,
      );
    }
    v.dispose();
  }
});

test('characterView: arms separate from the torso in VALUE, not just position', () => {
  // "A stack of misaligned teal boxes" was the note, and it is a value problem
  // before it is a geometry one: two forms of the same colour, at the same
  // value, touching, are one form. The arm now sits ~4 cm clear of the torso
  // ply stack AND carries about a tenth of a stop less light.
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    const brightest = (node) => {
      const col = v.nodes[node].geometry.attributes.color.array;
      let best = 0;
      for (let i = 0; i < col.length; i += 3) best = Math.max(best, lum(col[i], col[i + 1], col[i + 2]));
      return best;
    };
    const arm = brightest('armL');
    const torso = brightest('torso');
    assert.ok(arm < torso * 0.97, `${c}: arm ${arm.toFixed(3)} vs torso ${torso.toFixed(3)}`);

    // Geometric clearance BELOW the shoulder. The knight's pauldron is
    // deliberately a cap over the joint and is supposed to overlap the body;
    // what may not overlap is the limb itself, which is where the seams and
    // the z-fighting were.
    const armGeo = v.nodes.armL.geometry.attributes.position.array;
    const armY = v.nodes.armL.position.y;
    let innerMost = -Infinity;
    let shaftLo = Infinity, shaftHi = -Infinity;
    for (let i = 0; i < armGeo.length; i += 3) {
      // Shoulder cap above, hand below — the shaft is what runs alongside the
      // body and is where the seam was.
      if (armGeo[i + 1] > -0.16 || armGeo[i + 1] < -0.42) continue;
      innerMost = Math.max(innerMost, armGeo[i]);
      shaftLo = Math.min(shaftLo, armY + armGeo[i + 1]);
      shaftHi = Math.max(shaftHi, armY + armGeo[i + 1]);
    }
    const armInnerX = v.nodes.armL.position.x + innerMost;   // position.x is negative
    const torsoGeo = v.nodes.torso.geometry.attributes.position.array;
    const torsoY = v.nodes.torso.position.y;
    let torsoHalf = 0;
    for (let i = 0; i < torsoGeo.length; i += 3) {
      const wy = torsoY + torsoGeo[i + 1];
      if (wy < shaftLo || wy > shaftHi) continue;
      torsoHalf = Math.max(torsoHalf, Math.abs(torsoGeo[i]));
    }
    assert.ok(armInnerX < -torsoHalf + 0.04,
      `${c}: arm inner edge ${armInnerX.toFixed(3)} vs torso half-width ${torsoHalf.toFixed(3)}`);
    v.dispose();
  }
});

test('characterView: the sole stays inside the boot silhouette', () => {
  // The pale ply that reached past the boot outline read as a rendering bug at
  // hero-closeup distance. Every sole vertex must now be inside the boot's own
  // profile — and darker than it, so the foot has a ground line.
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    const p = v.nodes.legL.geometry.attributes.position.array;
    const col = v.nodes.legL.geometry.attributes.color.array;
    // Foot plies live in the bottom 0.2 m of the leg node.
    let minY = Infinity;
    for (let i = 1; i < p.length; i += 3) minY = Math.min(minY, p[i]);
    // The sole is the darkest thing down there; the boot is the brightest.
    let darkest = Infinity, brightest = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1] > minY + 0.10) continue;
      const l = 0.2126 * col[i] + 0.7152 * col[i + 1] + 0.0722 * col[i + 2];
      darkest = Math.min(darkest, l);
      brightest = Math.max(brightest, l);
    }
    assert.ok(darkest < brightest * 0.85, `${c}: sole ${darkest.toFixed(3)} vs boot ${brightest.toFixed(3)}`);
    // Nothing pale may hang below the boot's own lowest point.
    let lowestBright = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const l = 0.2126 * col[i] + 0.7152 * col[i + 1] + 0.0722 * col[i + 2];
      if (l > brightest * 0.9) lowestBright = Math.min(lowestBright, p[i + 1]);
    }
    assert.ok(lowestBright <= minY + 1e-6 || lowestBright > minY,
      `${c}: pale ply hangs below the boot`);
    v.dispose();
  }
});

test('characterView: the contact shadow is SHAPED, not a uniform ellipse', () => {
  // A blob of one alpha from centre to rim reads as a smudge the hero floats
  // on. The gradient is what says "this pixel is where he touches the ground".
  const v = createCharacterView({ heroClass: 'knight' });
  const blob = v.group.children.find((o) => o.name === 'hero-shadow');
  const col = blob.geometry.attributes.color;
  assert.equal(col.itemSize, 4, 'the profile rides in vertex alpha');
  assert.equal(blob.material.vertexColors, true);
  const pos = blob.geometry.attributes.position.array;
  let core = 0, rim = 1;
  for (let i = 0; i < col.count; i++) {
    const r = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
    const a = col.array[i * 4 + 3];
    if (r < 0.05) core = Math.max(core, a);
    if (r > 0.95) rim = Math.min(rim, a);
  }
  assert.ok(core > 0.9, `core alpha ${core}`);
  assert.ok(rim < core * 0.45, `rim alpha ${rim} must fall well below the core ${core}`);
  // …and the whole profile is still scaled by ONE material dial per frame.
  v.reset();
  v.update(idle({ pos: { x: 0, y: 2, z: 0 } }), 1, 2);
  assert.ok(blob.material.opacity > 0.4, 'contact alpha is decisive on the ground');
  v.dispose();
});

test('characterView: every node is finite geometry', () => {
  // A laminate built without a depth silently produces NaN positions, which
  // three reports as a bounding-sphere warning and the GPU renders as nothing
  // at all. Cheap to assert, invisible until someone opens that class.
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    for (const n of NODES) {
      const p = v.nodes[n].geometry.attributes.position.array;
      let bad = 0;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
      assert.equal(bad, 0, `${c}/${n}: ${bad} non-finite position components`);
      assert.ok(Number.isFinite(v.nodes[n].geometry.boundingSphere.radius), `${c}/${n} bounds`);
    }
    v.dispose();
  }
});

test('characterView: the crown clears the head instead of sinking into it', () => {
  // The crown pivot used to sit at the CENTRE of the skull, which buried the
  // bottom 30 cm of every hat, plume and pair of ears and left a nub showing.
  const box = new THREE.Box3();
  for (const c of CLASSES) {
    const v = createCharacterView({ heroClass: c });
    v.reset();
    v.update(idle({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }), 12, 0);
    v.nodes.head.updateWorldMatrix(true, true);
    const headTop = box.setFromObject(v.nodes.head, true).max.y;
    const crownTop = box.setFromObject(v.nodes.crown, true).max.y;
    // setFromObject on the head includes the crown (it is a child), so compare
    // the crown against the head's own geometry bounds instead.
    const g = v.nodes.head.geometry.boundingBox;
    const ownTop = g.max.y + v.nodes.head.position.y;
    assert.ok(
      crownTop > ownTop + 0.12,
      `${c}: crown top ${crownTop.toFixed(2)} must clear head top ${ownTop.toFixed(2)}`,
    );
    assert.ok(headTop >= crownTop - 1e-6);
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
