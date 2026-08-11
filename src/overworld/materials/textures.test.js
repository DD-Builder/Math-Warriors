/**
 * Contract tests for the procedural paper textures.
 *
 * These run under plain `node --test` with no DOM, which is itself part of the
 * contract: the generators must never reach for a canvas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  paperFiber, paperTooth, paperMottle, deckleDisc, deckleEdge,
  preloadPaperTextures, textureStats, disposePaperTextures,
  paperTextureCacheSize, cavityTint, TEXTURE_DEFAULTS,
} from './textures.js';

const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;

function stats(data, stride, offset, size) {
  let min = 255, max = 0, sum = 0;
  const n = size * size;
  for (let i = 0; i < n; i++) {
    const v = data[i * stride + offset];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / n };
}

test('overworld/textures', async (t) => {
  t.afterEach(() => disposePaperTextures());

  await t.test('paperFiber is a mipmapped power-of-two RGBA data texture', () => {
    const tex = paperFiber();
    assert.ok(tex instanceof THREE.DataTexture);
    assert.equal(tex.image.width, TEXTURE_DEFAULTS.fiberSize);
    assert.equal(tex.image.height, TEXTURE_DEFAULTS.fiberSize);
    assert.ok(isPow2(tex.image.width), 'mipmapping needs a power of two');
    assert.equal(tex.format, THREE.RGBAFormat);
    assert.equal(tex.generateMipmaps, true);
    assert.equal(tex.minFilter, THREE.LinearMipmapLinearFilter);
    // DATA, not colour: an sRGB decode would silently re-curve the grain.
    assert.equal(tex.colorSpace, THREE.NoColorSpace);
    // World-space tiling across 64 terrain chunks depends on this.
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.wrapT, THREE.RepeatWrapping);
    // The harness must not diverge from the device over a filter extension.
    assert.equal(tex.anisotropy, 1);
  });

  await t.test('paperFiber fills the byte range and stays centred on neutral', () => {
    const tex = paperFiber();
    const size = tex.image.width;
    const g = stats(tex.image.data, 4, 1, size);
    // Normalisation is by +-3 sigma, so the field should use nearly the whole
    // range while its mean sits on the shader's neutral (0.5 -> 127.5).
    assert.ok(g.max - g.min > 200, `expected wide range, got ${g.min}..${g.max}`);
    assert.ok(Math.abs(g.mean - 127.5) < 6, `mean drifted to ${g.mean}`);
  });

  await t.test('paperFiber drifts warm/cool rather than reading as grey noise', () => {
    const tex = paperFiber();
    const d = tex.image.data;
    let separated = 0;
    const n = tex.image.width * tex.image.height;
    for (let i = 0; i < n; i++) if (Math.abs(d[i * 4] - d[i * 4 + 2]) > 4) separated++;
    assert.ok(separated > n * 0.5, 'R and B should differ over most of the sheet');
  });

  await t.test('paperFiber tiles seamlessly on both axes', () => {
    // Wrap continuity: the last column must be as close to the first as
    // neighbouring interior columns are, or the world-space tiling shows seams.
    const tex = paperFiber();
    const s = tex.image.width, d = tex.image.data;
    let seam = 0, interior = 0;
    for (let j = 0; j < s; j++) {
      const row = j * s * 4;
      seam += Math.abs(d[row + (s - 1) * 4 + 1] - d[row + 1]);
      interior += Math.abs(d[row + 4 + 1] - d[row + 1]);
    }
    assert.ok(seam <= interior * 3, `x seam step ${seam / s} vs interior ${interior / s}`);

    let seamY = 0, interiorY = 0;
    for (let i = 0; i < s; i++) {
      seamY += Math.abs(d[((s - 1) * s + i) * 4 + 1] - d[i * 4 + 1]);
      interiorY += Math.abs(d[(s + i) * 4 + 1] - d[i * 4 + 1]);
    }
    assert.ok(seamY <= interiorY * 3, `y seam step ${seamY / s} vs interior ${interiorY / s}`);
  });

  await t.test('paperTooth encodes a low-amplitude normal plus its height', () => {
    const tex = paperTooth();
    const size = tex.image.width;
    assert.ok(isPow2(size));
    const r = stats(tex.image.data, 4, 0, size);
    const g = stats(tex.image.data, 4, 1, size);
    const b = stats(tex.image.data, 4, 2, size);
    // XY neutral is 0.5; a normal map whose mean drifted would tilt every
    // surface in the world in one direction.
    assert.ok(Math.abs(r.mean - 127.5) < 6, `normal.x mean ${r.mean}`);
    assert.ok(Math.abs(g.mean - 127.5) < 6, `normal.y mean ${g.mean}`);
    // Height channel is the normalised field, so it should span the range.
    assert.ok(b.max - b.min > 200, `height range ${b.min}..${b.max}`);
  });

  await t.test('paperTooth stays a TOOTH, not a rock face', () => {
    // The encoded XY targets ~0.30 sigma. If the bulk of the map ever left the
    // gentle band the toon ramp would break into speckle instead of a torn
    // step edge, which is the entire point of the effect.
    const tex = paperTooth();
    const d = tex.image.data;
    const n = tex.image.width * tex.image.height;
    let gentle = 0;
    for (let i = 0; i < n; i++) {
      const x = (d[i * 4] - 127.5) / 127.5;
      const y = (d[i * 4 + 1] - 127.5) / 127.5;
      if (Math.hypot(x, y) < 0.75) gentle++;
    }
    assert.ok(gentle > n * 0.9, `only ${(gentle / n * 100).toFixed(1)}% of the tooth is gentle`);
  });

  await t.test('deckleDisc is solid in the middle and torn at the rim', () => {
    const tex = deckleDisc();
    const s = tex.image.width, d = tex.image.data;
    const c = (s - 1) / 2;
    const at = (x, y) => d[((y * s) + x) * 4 + 1];   // alphaMap samples .g
    assert.equal(at(Math.round(c), Math.round(c)), 255, 'centre must be opaque');
    assert.equal(at(0, 0), 0, 'corners must be fully cut away');
    // The rim must actually wobble — a constant radius is the circle we are
    // trying to get rid of.
    const radii = [];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      let r = 0;
      for (let step = 0; step < s / 2; step++) {
        const x = Math.round(c + Math.cos(a) * step);
        const y = Math.round(c + Math.sin(a) * step);
        if (at(x, y) < 128) break;
        r = step;
      }
      radii.push(r / (s / 2));
    }
    const min = Math.min(...radii), max = Math.max(...radii);
    assert.ok(max - min > 0.05, `rim too regular: ${min.toFixed(3)}..${max.toFixed(3)}`);
    assert.ok(max < 0.99, 'the tear must bite inside the geometry');
    // All four channels carry the mask so it doubles as a luminance mask.
    const o = ((Math.round(c) * s) + Math.round(c)) * 4;
    assert.equal(d[o], d[o + 1]);
    assert.equal(d[o + 2], d[o + 3]);
  });

  await t.test('deckleEdge is a horizontally tiling torn strip', () => {
    const tex = deckleEdge();
    const w = tex.image.width, h = tex.image.height, d = tex.image.data;
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.wrapT, THREE.ClampToEdgeWrapping);
    const at = (x, y) => d[((y * w) + x) * 4 + 1];
    for (let x = 0; x < w; x += 17) {
      assert.equal(at(x, 0), 255, `solid edge broken at x=${x}`);
      assert.equal(at(x, h - 1), 0, `far edge not clear at x=${x}`);
    }
    // Tear line must vary across the strip.
    const line = (x) => {
      for (let y = 0; y < h; y++) if (at(x, y) < 128) return y;
      return h;
    };
    const ys = [];
    for (let x = 0; x < w; x += 4) ys.push(line(x));
    assert.ok(Math.max(...ys) - Math.min(...ys) > h * 0.15, 'tear line is too straight');
  });

  await t.test('paperMottle is a big-feature field that tiles and drifts in hue', () => {
    const tex = paperMottle();
    const size = TEXTURE_DEFAULTS.mottleSize;
    assert.ok(tex instanceof THREE.DataTexture);
    assert.equal(tex.image.width, size);
    assert.ok(isPow2(size));
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.colorSpace, THREE.NoColorSpace);
    const d = tex.image.data;

    // Centred on neutral and using most of the byte range: this is what lets
    // the shader apply a tiny amplitude without banding.
    const g = stats(d, 4, 1, size);
    assert.ok(Math.abs(g.mean - 127.5) < 12, `mottle mean ${g.mean}`);
    assert.ok(g.max - g.min > 170, `mottle range ${g.min}..${g.max}`);

    // Tiles exactly: the far column must interpolate back to the first.
    for (let y = 0; y < size; y += 29) {
      const a = d[(y * size) * 4 + 1];
      const b = d[(y * size + size - 1) * 4 + 1];
      assert.ok(Math.abs(a - b) < 26, `mottle seam at y=${y}: ${a} vs ${b}`);
    }

    // BIG features. A macro patina whose neighbouring texels differ wildly is
    // just noise — the whole reason this field exists is that paperFiber's low
    // frequencies are deliberately weak.
    let step = 0;
    for (let i = 0; i < size * (size - 1); i += 7) step += Math.abs(d[i * 4 + 1] - d[(i + 1) * 4 + 1]);
    assert.ok(step / Math.ceil(size * (size - 1) / 7) < 6, 'mottle must be smooth, not noise');

    // Hue drifts: R and B must separate somewhere, or this is grey mottling
    // and the surface only changes value.
    let maxSep = 0;
    for (let i = 0; i < size * size; i += 13) {
      maxSep = Math.max(maxSep, Math.abs(d[i * 4] - d[i * 4 + 2]));
    }
    assert.ok(maxSep > 16, `mottle hue separation ${maxSep} is too flat`);
  });

  await t.test('every texture is shared, cached and re-creatable after dispose', () => {
    assert.equal(paperTextureCacheSize(), 0);
    const a = paperFiber();
    const b = paperFiber();
    assert.equal(a, b, 'materials must share ONE instance');
    assert.equal(paperTextureCacheSize(), 1);
    preloadPaperTextures();
    // Four, not five: deckleEdge stays lazy until something wears a torn hem.
    assert.equal(paperTextureCacheSize(), 4);
    deckleEdge();
    assert.equal(paperTextureCacheSize(), 5);
    disposePaperTextures();
    assert.equal(paperTextureCacheSize(), 0);
    const c = paperFiber();
    assert.notEqual(a, c, 'a disposed cache must rebuild, not hand back the corpse');
  });

  await t.test('textureStats reports mipmapped RGBA8 cost', () => {
    preloadPaperTextures();
    deckleEdge();
    const s = textureStats();
    assert.equal(s.count, 5);
    for (const e of s.entries) {
      assert.equal(e.baseBytes, e.width * e.height * 4);
      assert.equal(e.bytes, Math.round(e.baseBytes * 4 / 3));
    }
    // Whole library must stay a rounding error against the frame budget.
    assert.ok(s.totalMB < 4, `paper textures cost ${s.totalMB} MB`);
  });

  await t.test('cavityTint can only ever push a surface toward teal', () => {
    const [r, g, b] = cavityTint();
    // Teal-leaning: green and blue survive, red is pulled down.
    assert.ok(r < g && r < b, `cavity tint ${r},${g},${b} is not teal-leaning`);
    // Never black, never grey mud: this is a gentle multiplier.
    assert.ok(r > 0.7, 'cavity must not darken toward black');
    assert.ok(b <= 1.0 && g <= 1.0);
  });
});
