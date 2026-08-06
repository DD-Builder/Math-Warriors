/**
 * Contract tests for the papercut material patch.
 *
 * There is no GL context under `node --test`, so these drive onBeforeCompile
 * with three's REAL MeshToonMaterial shader source and assert on the strings
 * that come out. That catches the failure mode that actually bites — an anchor
 * chunk we expected to be there having moved or been renamed in three, which
 * would silently produce an unpatched (and therefore untextured) world rather
 * than an error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  toonMaterial, toonRamp, papercutMaterial, applyPapercut, PAPERCUT_DEFAULTS,
} from './toon.js';
import { disposePaperTextures, paperTextureCacheSize } from './textures.js';

/** A shader object shaped like the one three hands to onBeforeCompile. */
function compileWith(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
  };
  material.onBeforeCompile(shader, null);
  return shader;
}

const count = (s, sub) => s.split(sub).length - 1;

test('overworld/materials/toon', async (t) => {
  t.afterEach(() => disposePaperTextures());

  await t.test('toonRamp shadow texel is teal, never grey or black', () => {
    const d = toonRamp().image.data;
    const [r, g, b] = [d[0], d[1], d[2]];
    assert.ok(g > r && b > r, `shade step ${r},${g},${b} is not teal-leaning`);
    assert.ok(r > 70, 'no step may approach black');
    assert.ok(Math.abs(g - b) < 12, 'shade step should read teal, not green');
  });

  await t.test('papercutMaterial is still a fogged toon material', () => {
    const m = papercutMaterial(0xff8800, { vertexColors: true });
    assert.ok(m.isMeshToonMaterial);
    assert.equal(m.gradientMap, toonRamp());
    assert.equal(m.fog, true);
    assert.equal(m.vertexColors, true);
    // Papercut options must be consumed, never leaked into the material.
    assert.equal(m.grain, undefined);
    assert.equal(m.roughnessLike, undefined);
    m.dispose();
  });

  await t.test('omitted options fall back to the defaults, not to undefined', () => {
    const a = papercutMaterial(0xffffff);
    const b = toonMaterial(0xffffff);
    applyPapercut(b, PAPERCUT_DEFAULTS);
    assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
    assert.ok(a.customProgramCacheKey().includes('|mw-paper|'));
    assert.ok(!a.customProgramCacheKey().includes('undefined'));
    a.dispose(); b.dispose();
  });

  await t.test('every anchor chunk is patched exactly once', () => {
    const m = papercutMaterial(0xffffff, { space: 'world' });
    const s = compileWith(m);
    assert.equal(count(s.vertexShader, 'varying vec4 vPaper;'), 1);
    assert.equal(count(s.fragmentShader, 'varying vec4 vPaper;'), 1);
    assert.ok(s.vertexShader.includes('#include <project_vertex>'));
    assert.ok(s.fragmentShader.includes('uniform sampler2D uPaperFiber;'));
    assert.ok(s.fragmentShader.includes('uniform sampler2D uPaperTooth;'));
    assert.ok(s.fragmentShader.includes('diffuseColor.rgb *='), 'grain multiply missing');
    assert.ok(s.fragmentShader.includes('normal = normalize( normal +'), 'tooth perturbation missing');
    // Both textures must arrive as uniforms, and as the SHARED instances.
    assert.ok(s.uniforms.uPaperFiber.value.isTexture);
    assert.ok(s.uniforms.uPaperTooth.value.isTexture);
    m.dispose();
  });

  await t.test('the patch never emits a banned derivative instruction', () => {
    const m = papercutMaterial(0xffffff);
    const s = compileWith(m);
    const added = s.fragmentShader.split('#include <color_fragment>')[1] || '';
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) {
      assert.ok(!added.includes(banned), `patch emitted ${banned}`);
    }
    m.dispose();
  });

  await t.test('float literals are always floats — "1" would fail to compile', () => {
    const m = papercutMaterial(0xffffff, { grain: 0.5, normal: 0.5, roughnessLike: 1, scale: 1 });
    const s = compileWith(m);
    const added = s.fragmentShader.split('#include <color_fragment>')[1].split('#include <alphamap_fragment>')[0];
    // Any bare integer multiplier would be a GLSL type error against a float.
    assert.ok(!/\*\s*1;/.test(added), `bare int literal in: ${added}`);
    assert.ok(added.includes('1.00000'));
    m.dispose();
  });

  await t.test('zero-amplitude options compile the work away entirely', () => {
    const m = papercutMaterial(0xffffff, { grain: 0.06, normal: 0, roughnessLike: 0 });
    const s = compileWith(m);
    assert.ok(!s.fragmentShader.includes('uPaperTooth'), 'tooth fetch should not exist');
    assert.equal(paperTextureCacheSize(), 1, 'tooth texture should not be generated');
    m.dispose();
  });

  await t.test('non-triplanar materials pay for exactly one fetch', () => {
    const m = papercutMaterial(0xffffff, { triplanar: false, normal: 0, roughnessLike: 0 });
    const s = compileWith(m);
    assert.equal(count(s.fragmentShader, 'texture2D( uPaperFiber'), 1);
    assert.ok(!s.fragmentShader.includes('mwUvSide'));
    m.dispose();
  });

  await t.test('local space reads the raw attribute so grain cannot crawl', () => {
    const world = compileWith(papercutMaterial(0xffffff, { space: 'world' }));
    const local = compileWith(papercutMaterial(0xffffff, { space: 'local' }));
    assert.ok(world.vertexShader.includes('modelMatrix * mwPaperP'));
    assert.ok(world.vertexShader.includes('#ifdef USE_INSTANCING'));
    assert.ok(local.vertexShader.includes('vPaper = vec4( position,'));
    assert.ok(!local.vertexShader.includes('mwPaperP'), 'local space must not follow the instance');
  });

  await t.test('the patch CHAINS onto an existing onBeforeCompile', () => {
    // props.js patches wind before we ever see the material; losing that patch
    // would freeze every tree on the island.
    const m = toonMaterial(0xffffff);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\t// WIND');
    };
    m.customProgramCacheKey = () => 'mw-wind|test';
    applyPapercut(m, { space: 'local' });

    const s = compileWith(m);
    assert.ok(s.uniforms.uWindTime, 'earlier patch lost its uniform');
    assert.ok(s.vertexShader.includes('// WIND'), 'earlier patch lost its code');
    assert.ok(s.vertexShader.includes('vPaper = vec4( position,'), 'papercut patch missing');
    assert.ok(s.uniforms.uPaperFiber, 'papercut uniform missing');
    const key = m.customProgramCacheKey();
    assert.ok(key.startsWith('mw-wind|test|'), `cache key dropped the wind key: ${key}`);
    assert.ok(key.includes('mw-paper|'));
    m.dispose();
  });

  await t.test('materials share one texture instance, never a copy each', () => {
    const a = papercutMaterial(0xffffff, { scale: 1 });
    const b = papercutMaterial(0x00ff00, { scale: 9 });
    const sa = compileWith(a);
    const sb = compileWith(b);
    assert.equal(sa.uniforms.uPaperFiber.value, sb.uniforms.uPaperFiber.value);
    assert.equal(sa.uniforms.uPaperTooth.value, sb.uniforms.uPaperTooth.value);
    assert.equal(paperTextureCacheSize(), 2, 'only fiber + tooth should exist');
    // Different scales must still compile to different programs.
    assert.notEqual(a.customProgramCacheKey(), b.customProgramCacheKey());
    a.dispose(); b.dispose();
  });

  await t.test('only ONE extra varying vector is spent', () => {
    // GLSL ES guarantees very few varying slots and MeshToonMaterial has
    // already spent most of them; two would be a real risk on old hardware.
    const s = compileWith(papercutMaterial(0xffffff));
    const added = s.vertexShader.match(/^varying .*vPaper.*$/gm) || [];
    assert.equal(added.length, 1);
    assert.ok(added[0].startsWith('varying vec4'));
  });
});
