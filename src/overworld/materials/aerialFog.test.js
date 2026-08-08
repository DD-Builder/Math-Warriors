import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  aerialFogFactor, applyAerialFog, FOG_UNIFORMS, setAerialFrame, setFogColor,
  setFogDomain, fogDomainActive, levelAtmosphere, LEVEL_ATMOSPHERE,
} from './aerialFog.js';
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

describe('per-domain atmosphere', () => {
  const frame = () => {
    const out = createRenderFrame();
    applyWeather(timeOfDay(0.42), weatherByName('clear'), out);
    return out;
  };

  test('the island is untouched: far haze IS near haze', () => {
    setFogDomain(null);
    const f = frame();
    setAerialFrame(f);
    assert.equal(fogDomainActive(), false);
    assert.equal(FOG_UNIFORMS.uFogDensity.value, f.fogDensity);
    assert.equal(FOG_UNIFORMS.uFogStart.value, f.fogStart);
    // uFogFar == uFogLow makes the whole near/far split an exact identity, so
    // the reference vista renders byte-for-byte as it did before it existed.
    assert.deepEqual(
      FOG_UNIFORMS.uFogFar.value.toArray(),
      FOG_UNIFORMS.uFogLow.value.toArray(),
    );
  });

  test('a domain overrides the composed frame and survives recomposition', () => {
    const f = frame();
    setAerialFrame(f);
    setFogDomain('library');
    const lib = LEVEL_ATMOSPHERE.library;
    assert.ok(Math.abs(FOG_UNIFORMS.uFogDensity.value - f.fogDensity * lib.density) < 1e-12);
    assert.equal(FOG_UNIFORMS.uFogStart.value, lib.start);
    assert.equal(FOG_UNIFORMS.uFogDesat.value, lib.desat);
    // The day clock keeps recomposing frames; the room must not be lost.
    setAerialFrame(frame());
    assert.equal(FOG_UNIFORMS.uFogStart.value, lib.start);
    setFogDomain(null);
    assert.equal(FOG_UNIFORMS.uFogStart.value, f.fogStart);
  });

  /**
   * What a floor's air ACTUALLY does, at the ranges a floor spans.
   *
   * Asserting on `density` alone stopped being meaningful once `heightMul`
   * landed: two floors with the same multiplier now hold very different
   * amounts of haze at eye level. Every assertion below therefore runs the
   * real extinction curve at a real eye height, which is the number that
   * reaches the screen.
   */
  const EYE_Y = 4.6;      // the level camera profile's eye over flat ground
  const GROUND_Y = 1.0;
  function extinction(key, dist, fragY = GROUND_Y) {
    const a = LEVEL_ATMOSPHERE[key];
    const f = frame();
    return aerialFogFactor(EYE_Y, fragY, dist, {
      density: f.fogDensity * a.density,
      heightK: f.fogHeightK * a.heightMul,
      baseY: 0,
      start: a.start,
      max: a.max,
    });
  }

  test('the Library is the thin one and the Garden is the thick one', () => {
    // The two reviews disagreed about the fog because the floors disagreed:
    // "dissolves to grey-purple mush at mid-range" (library) and "effectively
    // none" (garden) were both true under ONE set of island numbers.
    const lib = extinction('library', 55);
    const gdn = extinction('garden', 55);
    assert.ok(lib < gdn * 0.62, `library ${lib.toFixed(3)} vs garden ${gdn.toFixed(3)} at 55 m`);
    assert.ok(lib > 0.04, `the library cut went all the way to nothing (${lib.toFixed(3)})`);
    assert.ok(gdn > 0.12, `the garden still has no air in it (${gdn.toFixed(3)})`);
  });

  test('the near field is untouched and the far field is still climbing', () => {
    for (const key of Object.keys(LEVEL_ATMOSPHERE)) {
      // A room is 60-90 m across: haze on a wall twenty metres away is a bug.
      assert.ok(extinction(key, 20) < 0.05,
        `${key}: ${extinction(key, 20).toFixed(3)} of haze at 20 m — the near field is not clear`);
      // THE CEILING IS NOT THE DIAL. If the curve reaches `max` inside the play
      // space then everything beyond that point is one flat wash, which is the
      // exact failure ("dissolves into mush") this table exists to prevent.
      const far = extinction(key, 95);
      assert.ok(far < LEVEL_ATMOSPHERE[key].max * 0.92,
        `${key}: extinction ${far.toFixed(3)} has hit its ${LEVEL_ATMOSPHERE[key].max} ceiling`
        + ' inside the room — the far half of the floor is one flat tint');
      // And it has to actually separate the far plane from the near one.
      assert.ok(far > 0.2, `${key}: ${far.toFixed(3)} at 95 m is no aerial perspective at all`);
    }
  });

  test('the haze POOLS: a landmark crown stays clearer than the ground under it', () => {
    // The whole point of the per-floor heightMul. A 16 m crown at 55 m must be
    // markedly crisper than the ground at 55 m, or distance eats the very
    // silhouette the player is meant to navigate by.
    for (const key of Object.keys(LEVEL_ATMOSPHERE)) {
      const ground = extinction(key, 55, GROUND_Y);
      const crown = extinction(key, 55, 16);
      assert.ok(crown < ground * 0.72,
        `${key}: crown ${crown.toFixed(3)} vs ground ${ground.toFixed(3)} — the fog is a flat sheet`);
    }
  });

  test('every domain declares a whole atmosphere', () => {
    for (const [key, a] of Object.entries(LEVEL_ATMOSPHERE)) {
      assert.ok(a.start >= 6, `${key} starts hazing at ${a.start} m`);
      // Indoors there is no sky behind the far wall, so full extinction would
      // punch a hole in the room rather than reading as distance.
      assert.ok(a.max <= 0.92, `${key} lets the far wall dissolve to ${a.max}`);
      assert.ok(a.desat > 0 && a.desat <= 1, `${key} desat ${a.desat}`);
      assert.ok(a.heightMul >= 1, `${key} thins its air slower than the island's`);
      assert.ok(a.split >= 40 && a.split <= 120, `${key} split ${a.split}`);
      assert.ok(a.far === null || (a.far >= 0 && a.far <= 0xffffff), `${key} far`);
    }
  });

  test('the near/far split is driven by DEPTH, not by extinction', () => {
    // It used to be `mix(near, far, f)`, which inside a floor delivered the far
    // paper at ~9% of its intended strength — the split existed and did nothing.
    setFogDomain(null);
    setAerialFrame(frame());
    assert.equal(FOG_UNIFORMS.uFogSplitInv.value, 0, 'the island must have no split');
    setFogDomain('library');
    setAerialFrame(frame());
    assert.ok(Math.abs(FOG_UNIFORMS.uFogSplitInv.value
      - 1 / LEVEL_ATMOSPHERE.library.split) < 1e-12);
    // And the vertical gradient really is steeper than the island's.
    const f = frame();
    assert.ok(Math.abs(FOG_UNIFORMS.uFogHeightK.value
      - f.fogHeightK * LEVEL_ATMOSPHERE.library.heightMul) < 1e-12);
    setFogDomain(null);
    setAerialFrame(f);
    assert.equal(FOG_UNIFORMS.uFogHeightK.value, f.fogHeightK);
    assert.equal(FOG_UNIFORMS.uFogSplitInv.value, 0);
  });

  test('an unknown theme falls back to the island rather than throwing', () => {
    assert.equal(levelAtmosphere('no-such-floor'), null);
    setFogDomain('no-such-floor');
    assert.equal(fogDomainActive(), false);
    setFogDomain(null);
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
