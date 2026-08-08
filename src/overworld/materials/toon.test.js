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
  toonMaterial, toonRamp, papercutMaterial, applyPapercut, applyRimLight,
  applyShadowFloor, shadowFloorPatchIsLive, toonRampIsRGB,
  PAPERCUT_DEFAULTS, RIM_UNIFORMS, TOON_RAMP_STEPS, FORM_UP, FORM_DOWN,
  SHADOW_FLOOR, SHADOW_FLOOR_LUMA, SHADOW_CHROMA, SHADOW_LEAN, SHADE_KNEE, LUMA, PAPER,
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
    // "Never black" is a statement about LUMA and HUE, not about any one
    // channel. The shade texel is deliberately anisotropic — red gives up far
    // more than blue — because that is what walks a shadow into PAPER.shadow's
    // teal instead of merely dimming it toward grey. Guarding the red channel
    // alone would forbid exactly the move the palette law asks for, so the
    // floor lives on perceived brightness and the chroma is checked separately.
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    assert.ok(luma > 0.22, `shade step luma ${luma.toFixed(3)} approaches black`);
    assert.ok(g - r > 12, 'shade step must carry real chroma, not be grey');
    assert.ok(Math.abs(g - b) < 22, 'shade step should read teal, not green');
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

  await t.test('the macro patina is off by default and costs nothing', () => {
    // paperFiber is sampled at a ~2 m tile and is invisible at ten metres by
    // design, which used to leave every big surface one flat fill. The macro
    // layer fixes that — but it is a second texture fetch, so anything that is
    // small enough not to need it must not pay for it.
    const off = compileWith(papercutMaterial(0xffffff));
    assert.ok(!off.fragmentShader.includes('uPaperMottle'));
    assert.equal(PAPERCUT_DEFAULTS.macro, 0);

    const on = compileWith(papercutMaterial(0xffffff, { macro: 0.09, macroScale: 14 }));
    assert.equal(count(on.fragmentShader, 'texture2D( uPaperMottle'), 1,
      'the macro layer is ONE top-down fetch — a triplanar blend buys nothing at 14 m');
    assert.ok(on.fragmentShader.includes('uniform sampler2D uPaperMottle;'));
  });

  await t.test('sun-bleach mixes between two palette-derived multipliers', () => {
    const s = compileWith(papercutMaterial(0xffffff, { bleach: 0.5 }));
    const added = s.fragmentShader.split('#include <color_fragment>')[1];
    assert.ok(added.includes('mwFlat'), 'bleach must ride the up-facing weight');
    // Both ends straddle 1.0 — this is a MULTIPLIER pair, so it can only ever
    // push a surface toward the palette's teal cavity or toward cream.
    const nums = (added.match(/vec3\( [0-9.]+, [0-9.]+, [0-9.]+ \)/g) || []);
    assert.ok(nums.length >= 2, `expected the bleach pair, got ${nums.join(' ')}`);
    // Never a derivative, even in the new blocks.
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) assert.ok(!added.includes(banned));
  });

  await t.test('form bakes value structure from the FACE NORMAL', () => {
    // The measurement that made this necessary: a hedge whose sun-facing TOP
    // plane read L=55 against a shadow-side FRONT face at L=59. A three-step
    // toon ramp cannot separate those two — at this world's sun elevation they
    // land on the same step — so the separation has to be in the albedo.
    const off = compileWith(papercutMaterial(0xffffff));
    assert.ok(!off.fragmentShader.includes('max( vPaper.w, 0.0 )'), 'form is not free by default');
    assert.equal(PAPERCUT_DEFAULTS.form, 0);

    const on = compileWith(papercutMaterial(0xffffff, { form: 1 }));
    const added = on.fragmentShader.split('#include <color_fragment>')[1];
    assert.ok(added.includes('max( vPaper.w, 0.0 )'), 'up-facing lift missing');
    assert.ok(added.includes('max( -vPaper.w, 0.0 )'), 'down-facing drop missing');
    // A LIFT above and a DROP below, or it is a brightness dial, not a form.
    assert.ok(FORM_UP > 0 && FORM_DOWN > 0);
    // Odyssey's hedge runs about 2x crown-to-face; with the light doing its
    // share this ratio has to be well clear of the 0.93 that was measured.
    assert.ok((1 + FORM_UP) / (1 - FORM_DOWN) > 1.5,
      `crown:underside is only ${((1 + FORM_UP) / (1 - FORM_DOWN)).toFixed(2)}x`);
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) assert.ok(!added.includes(banned));
  });

  await t.test('the up-facing weight is SIGNED, and the old users take abs()', () => {
    // vPaper.w now carries a sign so `form` can tell sky-facing paper from
    // tucked-under paper. Everything that used it before wanted the magnitude,
    // and must be byte-identical or the triplanar blend flips on undersides.
    const s = compileWith(papercutMaterial(0xffffff, { bleach: 0.3, form: 0.5 }));
    assert.ok(s.vertexShader.includes('( mwPaperN.y < 0.0 ? -1.0 : 1.0 )'), 'sign not carried');
    assert.ok(s.fragmentShader.includes('float mwFlat = abs( vPaper.w );'),
      'the projection blend must still see the MAGNITUDE');
    // Still one varying — the sign rides in the same slot.
    const added = s.vertexShader.match(/^varying .*vPaper.*$/gm) || [];
    assert.equal(added.length, 1);
  });

  await t.test('the rim light is additive AFTER the ramp and chains cleanly', () => {
    // The hero is the only surface that gets one: it exists so he stays
    // value-separated from whatever he happens to be standing in front of, and
    // it has to survive into shade, which means it lands on outgoingLight.
    const m = papercutMaterial(0xffffff, { space: 'local' });
    applyRimLight(m, { strength: 0.36 });
    const s = compileWith(m);
    assert.ok(s.fragmentShader.includes('outgoingLight += uRimColor'));
    assert.ok(s.fragmentShader.includes('uniform float uRimStrength;'));
    assert.equal(s.uniforms.uRimColor, RIM_UNIFORMS.uRimColor, 'one shared uniform object');
    // The papercut patch underneath must survive.
    assert.ok(s.fragmentShader.includes('uPaperFiber'));
    assert.ok(s.vertexShader.includes('vPaper = vec4( position,'));
    const key = m.customProgramCacheKey();
    assert.ok(key.includes('mw-paper|') && key.includes('mw-rim|'), key);
    // No derivatives, and a real float literal for the exponent.
    const added = s.fragmentShader.split('mwRimV')[1] || '';
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) assert.ok(!added.includes(banned));
    assert.ok(/3\.0{2,}/.test(s.fragmentShader), 'the fresnel exponent must be a float literal');
    m.dispose();
  });

  // ── Shadow floor ───────────────────────────────────────────────────────
  //
  // These guard the defect that shipped: three multiplies DIRECT light by the
  // shadow mask BEFORE MeshToonMaterial's ramp ever runs, so a cast shadow was
  // `directLight.color == 0` and the teal shade texel never touched it. The
  // measured result on the shipped frames was rgb(5,34,17) — 12% of the lit
  // ground and still green. Nothing above this line could have caught that:
  // the ramp was correct the whole time, it simply was not in the path.

  await t.test('the ramp is sampled in COLOUR, not as its red channel', () => {
    // three ships `return vec3( texture2D( gradientMap, coord ).r );` — the
    // red channel splatted to grey. Under that line the teal shade texel above
    // shaded at a flat 0.22 GREY: the palette law's central rule was being
    // discarded one instruction after the texture fetch, and every screenshot
    // note about "shadows are grey/black" was reporting it faithfully.
    assert.ok(toonRampIsRGB(), 'the ramp is still being sampled greyscale');
    const chunk = THREE.ShaderChunk.gradientmap_pars_fragment;
    assert.ok(chunk.includes('return texture2D( gradientMap, coord ).rgb;'));
    assert.ok(!chunk.includes('texture2D( gradientMap, coord ).r )'));
    // The shade texel only means anything if all three channels survive, so
    // guard the property that makes the fix worth having.
    const [r, g, b] = TOON_RAMP_STEPS[0];
    assert.ok(b > g && g > r, 'the shade texel must be teal for this to matter');
  });

  await t.test('the shadow floor is teal-leaning and above the luma floor', () => {
    const [r, g, b] = SHADOW_FLOOR;
    // Teal means BLUE leads and RED gives up the most. Grey would be r==g==b
    // and "just darker" is what the palette law forbids by name.
    assert.ok(b > g && g > r, `shadow floor ${SHADOW_FLOOR} is not teal-leaning`);
    assert.ok(b - r > 0.10, `shadow floor ${SHADOW_FLOOR} carries no real chroma`);
    // THE LUMA FLOOR. A fully occluded surface keeps at least this fraction of
    // its key light, before the hemisphere fill is even added on top. Below
    // ~0.30 a shadow on dark paper reads as black, which is the whole defect.
    assert.ok(
      SHADOW_FLOOR_LUMA >= 0.30,
      `a fully shadowed surface keeps only ${(SHADOW_FLOOR_LUMA * 100).toFixed(1)}% of the key`,
    );
    // Deliberately not a free constant: the floor IS the ramp's shade texel, so
    // "the sun is behind me" and "something is between me and the sun" land on
    // the same step. If these ever diverge the world has two shade values.
    assert.deepEqual([...SHADOW_FLOOR], [...TOON_RAMP_STEPS[0]]);
  });

  await t.test('the shadow hue walks to PAPER.shadow, at unchanged luminance', () => {
    const [r, g, b] = SHADOW_CHROMA;
    assert.ok(b > r * 2, `shadow chroma ${SHADOW_CHROMA} is not teal`);
    assert.ok(b >= g, 'teal, not green: blue must not sit under green');
    // Unit luminance by construction — the hue mix must not double as a
    // brightness dial, because SHADOW_FLOOR already owns brightness.
    const lum = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    assert.ok(Math.abs(lum - 1) < 1e-9, `chroma luma ${lum} must be exactly 1`);
    // And it must really be PAPER.shadow's hue, not some other teal.
    const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const want = [16, 8, 0].map((sh) => s2l((((PAPER.shadow >> sh) & 0xff) / 255)));
    const wl = LUMA[0] * want[0] + LUMA[1] * want[1] + LUMA[2] * want[2];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(SHADOW_CHROMA[i] - want[i] / wl) < 1e-9);
    assert.ok(SHADOW_LEAN > 0.2 && SHADOW_LEAN < 0.8, 'a lean, not a repaint');
  });

  await t.test('no combination of facing and occlusion falls near black', () => {
    // Walk the exact arithmetic the shader now does — min( ramp, mix(floor,1,s) )
    // — over every ramp step crossed with lit and fully occluded, on the darkest
    // ground paper in the game. The hemisphere fill is ignored, so every number
    // here is a LOWER bound on what ships.
    const lum = (c) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
    const albedo = [0.16, 0.44, 0.29];
    const direct = (ramp, s) =>
      ramp.map((v, i) => Math.min(v, SHADOW_FLOOR[i] + (1 - SHADOW_FLOOR[i]) * s) * albedo[i]);
    const lit = direct(TOON_RAMP_STEPS[2], 1);
    for (const ramp of TOON_RAMP_STEPS) {
      for (const s of [0, 0.5, 1]) {
        const ratio = lum(direct(ramp, s)) / lum(lit);
        assert.ok(ratio >= 0.30, `ramp ${ramp} at shadow ${s} keeps only ${ratio.toFixed(3)}`);
      }
    }
    // THE MULTIPLY THIS min() REPLACED: a face turned away from the sun that
    // also lies inside a cast shadow used to be shaded TWICE, squaring the
    // shade step. That is the second route to a near-black pixel and the reason
    // min() is not a stylistic preference.
    const squared = TOON_RAMP_STEPS[0].map((v, i) => v * SHADOW_FLOOR[i] * albedo[i]);
    assert.ok(lum(squared) / lum(lit) < 0.15, 'the multiply form was not the darker one');
    assert.ok(
      lum(direct(TOON_RAMP_STEPS[0], 0)) > lum(squared) * 2,
      'min() must actually rescue the back-face-in-shadow case',
    );
    // …and the hue rotation must move the result toward teal, never away.
    const shaded = direct(TOON_RAMP_STEPS[2], 0);
    const tinted = shaded.map((c, i) => c + (lum(shaded) * SHADOW_CHROMA[i] - c) * SHADOW_LEAN);
    const cool = (c) => c[2] - c[0];
    assert.ok(cool(tinted) > cool(shaded), 'the shadow tint must cool the surface');
    assert.ok(Math.abs(lum(tinted) - lum(shaded)) < 1e-9, 'the tint must not change value');
  });

  await t.test('the shadow floor is actually patched into three r170', () => {
    // The anchor lives inside THREE.ShaderChunk.lights_fragment_begin, which
    // three does not expand until AFTER onBeforeCompile — so the patch is built
    // from the chunk at load. A three upgrade that renames the line would
    // silently restore the black shadows; this is the tripwire for that.
    assert.ok(shadowFloorPatchIsLive(), 'lights_fragment_begin anchor not found');
    const s = compileWith(toonMaterial(0x88aa66));
    const f = s.fragmentShader;
    assert.ok(!f.includes('#include <lights_fragment_begin>'), 'chunk not replaced');
    // The killer line is gone: direct light is no longer multiplied BY the
    // mask, it is mixed from the floor TO full by it.
    assert.ok(
      !/directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap/.test(f),
      'the raw multiply-to-zero survived',
    );
    assert.ok(f.includes('vec3 mwWant = min( mwRamp, mix( vec3( 0.22000, 0.32000, 0.36000 ), vec3( 1.0 ), mwShadow ) );'));
    assert.ok(f.includes('mwShadowMask = min( mwShadowMask, mwShadow );'));
    // The rescale must read the SAME ramp RE_Direct_Toon will, or the two
    // disagree and the shadow lands on the wrong step.
    assert.ok(f.includes('getGradientIrradiance( geometryNormal, directLight.direction )'));
    // The teal rotation, before opaque_fragment so fog still lands on top.
    const tint = f.indexOf('mwSl * vec3( 0.34361');
    assert.ok(tint > 0, 'the teal hue mix is missing');
    assert.ok(tint < f.indexOf('#include <opaque_fragment>'), 'tint must precede opaque_fragment');
    // SwiftShader parity: not one derivative anywhere in what we added.
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) assert.ok(!f.includes(banned));
  });

  await t.test('the teal rotation reaches SHADED faces, not just occluded ones', () => {
    // The defect: the hue mix rode `mwShadowMask`, which is the CAST-shadow
    // term only. Every pixel that was merely turned away from the sun — the
    // whole terminator, every north flank, most of the shaded area in any
    // frame — was darkened by a multiply and never rotated. A multiply toward
    // a dark texel scales chroma with luma, so those pixels desaturate as they
    // darken: that is how a shaded surface reaches neutral grey (measured
    // `#6f7675`, chroma 1, on floor 8) without any number in the palette ever
    // being grey. `mwShadeMask` is the ramp's own surviving key term, so the
    // rotation now follows darkness from EITHER cause.
    const f = compileWith(toonMaterial(0x88aa66)).fragmentShader;
    assert.ok(f.includes('float mwShadeMask = 1.0;'), 'no shade mask');
    assert.ok(f.includes('mwShadeMask = min( mwShadeMask, dot( mwWant,'),
      'the shade mask must track the ramp term the surface actually kept');
    assert.ok(f.includes('min( mwShadowMask, mwShadeMask ) )'),
      'the tint must be driven by whichever made the pixel darker');
    // …through a KNEE, so a merely half-lit surface is not dragged toward
    // teal. See SHADE_KNEE: without it the mid ramp step alone would rotate
    // every big up-facing plane in the world by a fifth.
    assert.ok(f.includes(`smoothstep( 0.0, ${SHADE_KNEE.toFixed(5)},`), 'no shade knee');
    // Declared outside the light loop, like its siblings — a float declared
    // inside would be redeclared once per light by unrolling.
    assert.equal(count(f, 'float mwShadeMask'), 1);
    assert.ok(f.indexOf('float mwShadeMask') < f.indexOf('#pragma unroll_loop_start'));
  });

  await t.test('a fully SHADED face still ends up teal, at any albedo', () => {
    // Walk the shader's arithmetic on warm paper — the case that used to fail,
    // because a warm surface darkened by a near-neutral multiply lands on
    // warm-grey and there is nothing in the old path to stop it.
    const lum = (c) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
    const smooth = (e0, e1, x) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const shadeMask = lum(TOON_RAMP_STEPS[0]);          // what dot(mwWant, LUMA) gives
    const sd = (1 - smooth(0, SHADE_KNEE, shadeMask)) * SHADOW_LEAN;
    assert.ok(sd > 0.15, `the shade side barely rotates at all (${sd.toFixed(3)})`);
    // …and the HALF-lit step must be left completely alone, or every warm
    // paper in the game goes grey the moment it turns away from the sun.
    assert.equal(1 - smooth(0, SHADE_KNEE, lum(TOON_RAMP_STEPS[1])), 0,
      'the knee must clear the mid ramp step');
    for (const albedo of [[0.72, 0.55, 0.36], [0.86, 0.84, 0.78], [0.16, 0.44, 0.29]]) {
      const shaded = albedo.map((c, i) => c * TOON_RAMP_STEPS[0][i]);
      const out = shaded.map((c, i) => c + (lum(shaded) * SHADOW_CHROMA[i] - c) * sd);
      // Chroma is what the reviews measured and what the palette law is about:
      // the shaded side must be a COOLER FAMILY, never a darker copy.
      assert.ok(out[2] - out[0] > shaded[2] - shaded[0],
        `albedo ${albedo} shaded to ${out.map((v) => v.toFixed(3))} did not cool`);
      assert.ok(Math.abs(lum(out) - lum(shaded)) < 1e-9, 'the rotation changed value');
    }
  });

  await t.test('cast shadows fade at the edge of the shadow map, never step', () => {
    // "A shadow slab with straight vertical edges slicing the entire midground
    // with no caster in frame" — there was no caster because there was no
    // shadow: that edge is the boundary of the one ortho box the rig fits
    // around the player. Past it getShadow returns 1.0 and every shadow in the
    // frame stops along a straight line.
    const f = compileWith(toonMaterial(0xffffff)).fragmentShader;
    assert.ok(f.includes('vec3 mwSc = vDirectionalShadowCoord[ i ].xyz'),
      'the fade must read the shadow coord three already interpolates');
    assert.ok(/smoothstep\( 0\.4\d, 0\.50, max\( mwSe\.x, mwSe\.y \) \)/.test(f),
      'the fade must ramp toward the rim of the [0,1] shadow square');
    // It fades toward UNSHADOWED (1.0), never toward more shadow.
    assert.ok(f.includes('mwShadow = mix( 1.0, mwShadow,'));
    // Inside the shadow-map guard, so a material with no shadows still builds.
    const at = f.indexOf('vec3 mwSc = vDirectionalShadowCoord');
    const guard = f.lastIndexOf('#if defined( USE_SHADOWMAP )', at);
    assert.ok(guard > 0 && guard < at, 'the fade escaped the USE_SHADOWMAP guard');
    for (const banned of ['dFdx', 'dFdy', 'fwidth']) assert.ok(!f.includes(banned));
  });

  await t.test('the shadow scratch floats survive loop unrolling', () => {
    // WebGLProgram unrolls `#pragma unroll_loop_start` by repeating the body
    // with NO enclosing braces. A `float` declared inside the light loop would
    // therefore be redeclared once per light and fail to compile the moment the
    // rig has two directionals — and overworld/index.js has exactly two.
    const f = compileWith(toonMaterial(0xffffff)).fragmentShader;
    assert.equal(count(f, 'float mwShadowMask'), 1);
    assert.equal(count(f, 'float mwShadow ='), 1);
    const decl = f.indexOf('float mwShadow =');
    assert.ok(decl < f.indexOf('#pragma unroll_loop_start'), 'declared inside the loop');
    assert.ok(decl < f.indexOf('mwShadow = ( directLight.visible'), 'used before declared');
  });

  await t.test('EVERY world surface is born with the shadow floor', () => {
    // The one thing that makes this a palette law rather than a suggestion:
    // it is installed at the single place lit materials are created, so the
    // island, the nine 3D floors and the hero cannot diverge.
    for (const m of [toonMaterial(0x333333), papercutMaterial(0x333333, { space: 'local' })]) {
      const s = compileWith(m);
      assert.ok(s.fragmentShader.includes('mwShadowMask'), 'no shadow floor');
      assert.ok(m.customProgramCacheKey().includes('mw-shadowfloor|'));
      m.dispose();
    }
    // …and it chains: the papercut and rim patches still land on top of it.
    const hero = papercutMaterial(0xffffff, { space: 'local', bleach: 0.28 });
    applyRimLight(hero, { strength: 0.36 });
    const s = compileWith(hero);
    assert.ok(s.fragmentShader.includes('mwShadowMask'));
    assert.ok(s.fragmentShader.includes('uPaperFiber'));
    assert.ok(s.fragmentShader.includes('outgoingLight += uRimColor'));
    const key = hero.customProgramCacheKey();
    for (const part of ['mw-shadowfloor|', 'mw-paper|', 'mw-rim|']) assert.ok(key.includes(part), key);
    hero.dispose();
  });

  await t.test('an unlit material is left alone rather than broken', () => {
    // MeshBasicMaterial compiles no lighting chunk, so a blind patch would
    // emit a reference to an undeclared mwShadowMask and drop the draw call.
    const m = applyShadowFloor(new THREE.MeshBasicMaterial());
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    };
    m.onBeforeCompile(shader, null);
    assert.ok(!shader.fragmentShader.includes('mwShadowMask'));
    m.dispose();
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
