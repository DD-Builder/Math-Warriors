import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aerialFogFactor, applyAerialFog, FOG_UNIFORMS, setAerialFrame, setFogColor } from './aerialFog.js';
import { createRenderFrame, applyWeather, weatherByName } from '../weather.js';
import { timeOfDay } from '../timeOfDay.js';
import { PAPER } from '../../config.js';

// Clear-day reference air, matching the noon keyframe.
const CLEAR = { density: 0.0060, heightK: 0.030, baseY: 0, start: 9, max: 1 };
const MIST = { density: 0.0060 * 4.2, heightK: 0.030 * 2.9, baseY: 1.5, start: 3, max: 1 };

describe('aerial fog chunks', () => {
  test('three\'s fog chunks are replaced by the aerial model', () => {
    // Importing the module installs them — every fogged material in the world
    // inherits the same atmosphere with no per-call-site opt-in.
    assert.match(THREE.ShaderChunk.fog_pars_vertex, /varying vec3 vFogWorld/);
    assert.match(THREE.ShaderChunk.fog_vertex, /modelMatrix/);
    assert.match(THREE.ShaderChunk.fog_pars_fragment, /uFogHeightK/);
    assert.match(THREE.ShaderChunk.fog_fragment, /uFogDensity/);
  });

  test('the chunks use no banned instruction', () => {
    const all = THREE.ShaderChunk.fog_pars_vertex + THREE.ShaderChunk.fog_vertex
      + THREE.ShaderChunk.fog_pars_fragment + THREE.ShaderChunk.fog_fragment;
    for (const banned of ['fwidth', 'dFdx', 'dFdy', 'textureLod', 'gl_FragDepth']) {
      assert.ok(!all.includes(banned), `fog chunk uses ${banned}`);
    }
  });

  test('the instanced path is guarded so non-instanced shaders still compile', () => {
    assert.match(THREE.ShaderChunk.fog_vertex, /#ifdef USE_INSTANCING[\s\S]*instanceMatrix[\s\S]*#endif/);
  });
});

describe('applyAerialFog', () => {
  test('hands a fogged material the shared uniform objects', () => {
    const mat = new THREE.MeshToonMaterial({ fog: true });
    applyAerialFog(mat);
    const shader = { uniforms: {} };
    mat.onBeforeCompile(shader, null);
    for (const k of Object.keys(FOG_UNIFORMS)) {
      assert.equal(shader.uniforms[k], FOG_UNIFORMS[k], `${k} must be SHARED, not copied`);
    }
    mat.dispose();
  });

  test('is idempotent and chains onto an existing onBeforeCompile', () => {
    const mat = new THREE.MeshToonMaterial({ fog: true });
    let prevCalls = 0;
    mat.onBeforeCompile = () => { prevCalls++; };
    applyAerialFog(mat);
    applyAerialFog(mat);   // second call must not double-wrap
    const shader = { uniforms: {} };
    mat.onBeforeCompile(shader, null);
    assert.equal(prevCalls, 1, 'the pre-existing patch ran exactly once');
    assert.equal(shader.uniforms.uFogDensity, FOG_UNIFORMS.uFogDensity);
    mat.dispose();
  });

  test('skips materials that opted out of fog', () => {
    const mat = new THREE.MeshBasicMaterial({ fog: false });
    const before = mat.onBeforeCompile;
    applyAerialFog(mat);
    assert.equal(mat.onBeforeCompile, before);
    mat.dispose();
  });
});

describe('setAerialFrame', () => {
  test('pushes a composed render frame into the shared uniforms', () => {
    const out = createRenderFrame();
    applyWeather(timeOfDay(0.32), weatherByName('mist'), out);
    setAerialFrame(out);
    assert.equal(FOG_UNIFORMS.uFogDensity.value, out.fogDensity);
    assert.equal(FOG_UNIFORMS.uFogHeightK.value, out.fogHeightK);
    assert.equal(FOG_UNIFORMS.uFogBaseY.value, 1.5);
    assert.deepEqual(FOG_UNIFORMS.uFogSunDir.value.toArray(), out.sunDir);
  });

  test('fog colours land in OUTPUT space, matching three\'s own fog uniform', () => {
    // `<fog_fragment>` runs after `<colorspace_fragment>`, so a colour left in
    // working (linear) space would render visibly dark. This mirrors three's
    // refreshFogUniforms exactly.
    const got = setFogColor(new THREE.Color(), PAPER.cream);
    const want = new THREE.Color();
    new THREE.Fog(PAPER.cream).color.getRGB(want, THREE.SRGBColorSpace);
    assert.ok(Math.abs(got.r - want.r) < 1e-6);
    assert.ok(Math.abs(got.g - want.g) < 1e-6);
    assert.ok(Math.abs(got.b - want.b) < 1e-6);
    // ...and it is NOT the linear value, or the mirror would be pointless.
    assert.ok(Math.abs(got.r - new THREE.Color(PAPER.cream).r) > 0.01);
  });
});

describe('aerialFogFactor', () => {
  test('the near field is clear and the far field dissolves', () => {
    assert.equal(aerialFogFactor(10, 10, 0, CLEAR), 0);
    assert.equal(aerialFogFactor(10, 10, 9, CLEAR), 0, 'inside uFogStart');
    assert.ok(aerialFogFactor(10, 10, 40, CLEAR) < 0.05, 'foreground stays crisp');
    assert.ok(aerialFogFactor(10, 10, 480, CLEAR) > 0.9, 'the horizon is sky');
  });

  test('monotonically increases with distance', () => {
    let prev = -1;
    for (let d = 0; d <= 500; d += 10) {
      const f = aerialFogFactor(14, 6, d, CLEAR);
      assert.ok(f >= prev, `non-monotonic at ${d}`);
      prev = f;
    }
  });

  test('exp2, not linear: the curve is convex through the near field', () => {
    // A linear ramp would make these three equal. exp2 puts almost nothing in
    // the first third and everything in the last — that is the whole look.
    const a = aerialFogFactor(10, 10, 60, CLEAR);
    const b = aerialFogFactor(10, 10, 120, CLEAR);
    const c = aerialFogFactor(10, 10, 180, CLEAR);
    assert.ok(b - a > (a - 0) * 1.5, 'second slice hazes far more than the first');
    assert.ok(c - b > b - a, 'and the third more than the second');
  });

  test('HEIGHT falloff: valleys hold the haze, peaks stay clear', () => {
    // Same 200 m sight line, once along the valley floor and once from the
    // palace crown. This is the single comparison the whole model exists for.
    const valley = aerialFogFactor(3, 3, 200, CLEAR);
    const crown = aerialFogFactor(55, 55, 200, CLEAR);
    assert.ok(valley > crown * 2, `valley ${valley} vs crown ${crown}`);
  });

  test('mist is a LOW bank: unusable at the shore, transparent at the summit', () => {
    const inBank = aerialFogFactor(2, 2, 70, MIST);
    const aboveBank = aerialFogFactor(52, 52, 200, MIST);
    assert.ok(inBank > 0.75, `standing in mist: ${inBank}`);
    assert.ok(aboveBank < 0.15, `peaks poke through: ${aboveBank}`);
    // ...and a peak seen FROM the bank is still swallowed.
    assert.ok(aerialFogFactor(2, 52, 200, MIST) > 0.3);
  });

  test('looking down into a valley from a peak is hazier than looking up out of it', () => {
    const down = aerialFogFactor(50, 4, 150, CLEAR);
    const up = aerialFogFactor(50, 90, 150, CLEAR);
    assert.ok(down > up, `down ${down} vs up ${up}`);
  });

  test('respects the extinction ceiling', () => {
    assert.ok(aerialFogFactor(2, 2, 5000, { ...CLEAR, max: 0.8 }) <= 0.8);
  });

  test('is finite for absurd cameras', () => {
    for (const camY of [-400, -1, 0, 400, 5000]) {
      const f = aerialFogFactor(camY, 10, 300, CLEAR);
      assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `camY=${camY} -> ${f}`);
    }
  });
});
