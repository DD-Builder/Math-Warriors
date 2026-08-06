/**
 * Water contract tests.
 *
 * These run in plain Node with no GL context, so they cannot compile the
 * shader. What they CAN do — and what has actually caught bugs here — is check
 * the two things that break silently on a device we are not looking at:
 *
 *   1. Every `uniform` the GLSL declares exists in the material's uniform
 *      block. A typo there is not a compile error, it is a uniform that reads
 *      as zero, i.e. black water or no foam, and only on the device.
 *   2. Every literal-edged `smoothstep(a, b, x)` has a < b. Reversed edges are
 *      UNDEFINED in GLSL: they work on desktop drivers and go wrong on the
 *      tile-based GPU we ship to.
 *
 * Plus the geometry/placement invariants the art depends on.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWater, POND_SITES } from './water.js';
import { createHeightfield } from './heightfield.js';
import { WORLD } from './worldSpec.js';

// One build for the whole file: the shore bake costs ~270k heightfield
// samples and there is nothing per-test about it.
const heightfield = createHeightfield(WORLD.SEED);
const water = createWater(heightfield);

/** Drop `//` comments so prose about the shader is never mistaken for code. */
function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, '');
}

/**
 * Resolve the one preprocessor branch this module uses (`#ifdef MW_SHORE_TEX`,
 * flat, never nested) so the test sees the code the device would actually
 * compile, not both halves of it.
 */
function preprocess(src, defines) {
  const out = [];
  let taking = true, inBlock = false, cond = false;
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (s.startsWith('#ifdef ')) {
      inBlock = true;
      cond = s.slice(7).trim() in defines;
      taking = cond;
      continue;
    }
    if (inBlock && s === '#else') { taking = !cond; continue; }
    if (inBlock && s === '#endif') { inBlock = false; taking = true; continue; }
    if (taking) out.push(line);
  }
  return out.join('\n');
}

/** Uniform names declared in a GLSL source. */
function declaredUniforms(src, defines) {
  const names = [];
  for (const line of preprocess(stripComments(src), defines).split('\n')) {
    const m = /^\s*uniform\s+\w+\s+(\w+)\s*;/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Every smoothstep with two numeric literal edges, as [edge0, edge1] pairs. */
function literalSmoothsteps(src) {
  const out = [];
  const re = /smoothstep\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push([Number(m[1]), Number(m[2]), m[0]]);
  return out;
}

describe('water: shader contract', () => {
  const ocean = water.ocean;
  const pond = water.ponds[0] ? water.ponds[0].mesh : null;

  test('every uniform the ocean shader declares is supplied', () => {
    const d = ocean.material.defines;
    const names = [
      ...declaredUniforms(ocean.material.vertexShader, d),
      ...declaredUniforms(ocean.material.fragmentShader, d),
    ];
    assert.ok(names.length > 25, `expected a real uniform block, got ${names.length}`);
    for (const n of names) {
      assert.ok(n in ocean.material.uniforms, `ocean shader uses undeclared uniform ${n}`);
    }
  });

  test('every uniform the pool shader declares is supplied', () => {
    if (!pond) return;   // no site fit the terrain; nothing to check
    const d = pond.material.defines;
    const names = [
      ...declaredUniforms(pond.material.vertexShader, d),
      ...declaredUniforms(pond.material.fragmentShader, d),
    ];
    for (const n of names) {
      assert.ok(n in pond.material.uniforms, `pool shader uses undeclared uniform ${n}`);
    }
  });

  test('the ocean path is compiled in, the pool path is not', () => {
    assert.ok('MW_SHORE_TEX' in ocean.material.defines);
    assert.ok(ocean.material.uniforms.uShore.value.isTexture);
    if (pond) {
      assert.ok(!('MW_SHORE_TEX' in pond.material.defines));
      assert.ok(pond.material.uniforms.uBedDeep.value.isColor);
    }
  });

  test('no smoothstep has reversed literal edges (undefined in GLSL)', () => {
    for (const raw of [ocean.material.vertexShader, ocean.material.fragmentShader]) {
      const src = stripComments(raw);
      for (const [a, b, text] of literalSmoothsteps(src)) {
        assert.ok(a < b, `reversed smoothstep edges: ${text} (${a} >= ${b})`);
      }
    }
  });

  test('nothing is post-processed, depth-sampled or derivative-based', () => {
    const src = stripComments(water.ocean.material.vertexShader)
      + stripComments(water.ocean.material.fragmentShader);
    for (const banned of ['fwidth', 'dFdx', 'dFdy', 'GL_OES_standard_derivatives', 'depthTexture']) {
      assert.ok(!src.includes(banned), `water shader uses banned feature ${banned}`);
    }
  });

  test('the surface never writes depth and always fogs', () => {
    assert.equal(water.ocean.material.depthWrite, false);
    assert.equal(water.ocean.material.transparent, true);
    assert.equal(water.ocean.material.fog, true);
  });
});

describe('water: ocean geometry', () => {
  const u = water.ocean.material.uniforms;
  const tex = u.uShore.value;

  /** Decode the baked signed shore distance (metres) at a world point. */
  function bakedShore(x, z) {
    const res = tex.image.width;
    const min = u.uShoreMin.value.x;
    const span = u.uShoreSize.value.x;
    const cl = (v) => (v < 0 ? 0 : v > res - 1 ? res - 1 : v);
    const i = cl(Math.round(((x - min) / span) * res - 0.5));
    const j = cl(Math.round(((z - min) / span) * res - 0.5));
    const a = tex.image.data[(j * res + i) * 4 + 3] / 255;
    return a * 2 * u.uShoreRange.value - u.uShoreRange.value;
  }

  test('the disc is anchored on the mesh, not the world — no baked shore attribute', () => {
    // The mesh slides with the camera, so a per-vertex shore distance would be
    // wrong the moment the eye moved. It must come from the texture instead.
    assert.equal(water.ocean.geometry.getAttribute('aShore'), undefined);
    assert.ok(water.ocean.material.vertexShader.includes('texture2D(uShore'),
      'the vertex stage must read shore distance from the bake');
  });

  test('the bake reads negative offshore and positive inland', () => {
    assert.ok(bakedShore(0, 0) > 0, 'island centre must be land');
    assert.ok(bakedShore(120, 120) > 0, 'tidepool shelf must be land');
    assert.ok(bakedShore(0, 238) < 0, 'open water must be negative');
    assert.ok(bakedShore(-238, 0) < 0, 'open water must be negative');
    // The waterline on the 45 deg bearing sits at r = 206.
    assert.ok(Math.abs(bakedShore(145.7, 145.7)) < 3,
      `waterline should read near zero, got ${bakedShore(145.7, 145.7)}`);
  });

  test('the seabed colour channel darkens toward teal with depth', () => {
    const res = tex.image.width;
    const min = u.uShoreMin.value.x;
    const span = u.uShoreSize.value.x;
    const at = (x, z, c) => {
      const i = Math.round(((x - min) / span) * res - 0.5);
      const j = Math.round(((z - min) / span) * res - 0.5);
      return tex.image.data[(j * res + i) * 4 + c];
    };
    // Beach sand is warm (R > B); deep seabed is teal (B >= R).
    assert.ok(at(120, 120, 0) > at(120, 120, 2), 'shallow bed should read as sand');
    assert.ok(at(0, 238, 2) > at(0, 238, 0), 'deep bed should read as teal');
  });

  test('stays inside the draw-call and triangle budget', () => {
    assert.ok(water.stats.drawCalls <= 6, `water draw calls ${water.stats.drawCalls}`);
    assert.ok(water.stats.triangleCount < 40000, `water tris ${water.stats.triangleCount}`);
  });

  test('the disc reaches past the fog horizon', () => {
    const s = water.ocean.geometry.boundingSphere;
    assert.ok(s.radius > 300, `water disc radius ${s.radius}`);
  });
});

describe('water: inland pools', () => {
  test('every authored site is inland, and every built pool clears its ground', () => {
    for (const s of POND_SITES) {
      assert.ok(heightfield.sampleHeight(s.x, s.z) > WORLD.WATER_Y,
        `pond site ${s.id} is not on land`);
    }
    for (const p of water.ponds) {
      // The surface must clear every point it covers, or terrain pokes through.
      for (let k = 0; k < 24; k++) {
        const th = (k / 24) * Math.PI * 2;
        for (const t of [0, 0.5, 1]) {
          const x = p.x + Math.cos(th) * p.radius * t;
          const z = p.z + Math.sin(th) * p.radius * t;
          assert.ok(heightfield.sampleHeight(x, z) <= p.level,
            `pool ${p.id} is under its own ground at (${x}, ${z})`);
        }
      }
    }
  });

  test('each pool ships a surface and a bank', () => {
    for (const p of water.ponds) {
      assert.ok(p.mesh.isMesh && p.bank.isMesh);
      assert.ok(p.bank.geometry.getAttribute('color'), 'bank must be vertex-coloured');
    }
  });
});

describe('water: frame update', () => {
  const frame = {
    sunDir: [0.3, 0.9, 0.2],
    sunColor: 0xf5eedd,
    skyMid: 0xa4c8d8,
    fogColor: 0xf5eedd,
    sunIntensity: 1.1,
    night: 0,
  };

  test('advances time on every surface and keeps the plies in the teal family', () => {
    water.update(frame, 12.5);
    const u = water.ocean.material.uniforms;
    assert.equal(u.uTime.value, 12.5);
    // Deep water must stay a dark teal: blue-green dominant, never grey.
    const d = u.uDeep.value;
    assert.ok(d.b > d.r && d.g > d.r, `deep water is not teal: ${d.getHexString()}`);
    for (const p of water.ponds) assert.equal(p.mesh.material.uniforms.uTime.value, 12.5);
  });

  test('night dims the glitter without touching the palette', () => {
    water.update({ ...frame, night: 1, sunIntensity: 0.35 }, 1);
    const day = 1.1;
    assert.ok(water.ocean.material.uniforms.uSunUp.value < 0.35 * day);
    water.update(frame, 1);
    assert.ok(water.ocean.material.uniforms.uSunUp.value > 0.9);
  });

  test('allocates nothing per frame', () => {
    const u = water.ocean.material.uniforms;
    const dirRef = u.uSunDir.value;
    const deepRef = u.uDeep.value;
    water.update(frame, 3);
    water.update(frame, 4);
    assert.equal(u.uSunDir.value, dirRef);
    assert.equal(u.uDeep.value, deepRef);
  });

  test('a null frame still advances the clock', () => {
    water.update(null, 99);
    assert.equal(water.ocean.material.uniforms.uTime.value, 99);
  });
});

describe('water: dispose', () => {
  test('releases geometry, materials and the baked texture exactly once', () => {
    const w = createWater(heightfield, { ponds: false });
    let disposals = 0;
    const geo = w.ocean.geometry;
    const mat = w.ocean.material;
    const tex = mat.uniforms.uShore.value;
    for (const o of [geo, mat, tex]) o.addEventListener('dispose', () => { disposals++; });
    w.dispose();
    assert.equal(disposals, 3);
    assert.equal(w.group.children.length, 0);
    assert.ok(THREE.Group);
  });
});
