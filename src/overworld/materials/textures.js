/**
 * Procedural PAPER textures — the surface identity of the whole 3D hub.
 *
 * Everything on screen was flat vertex colour before this module existed, and
 * flat vertex colour is exactly what makes a stylised world read as an untextured
 * prototype: light lands on it evenly, so a 50 m mountain and a 2 m rock share
 * the same visual density and the eye finds nothing to hold on to. Real cut
 * paper has two things a flat fill does not — a fibrous *pigment* grain and a
 * pressed *tooth* that catches raking light — and this module manufactures both.
 *
 * WHY procedural instead of authored PNGs: the game ships as a static bundle to
 * an iPad; a pair of 1024 PNGs is ~1.5 MB of download for something that is, by
 * construction, band-limited noise. Generating it costs ~40 ms once at boot,
 * adds zero bytes to the bundle, is deterministic from a seed (so the
 * screenshot-critique harness compares like with like), and lets the art
 * direction live as *numbers we can tune* rather than as binary assets nobody
 * can diff.
 *
 * WHY DataTexture and not a 2D canvas: `node --test` runs these modules with no
 * DOM, and the shore-map bake in water.js already proved the pattern. Filling a
 * Uint8Array directly is also 3-4x faster than canvas ImageData round-trips and
 * gives us exact control of the byte encoding, which matters because these are
 * DATA textures (NoColorSpace) whose channels are decoded by our own shader.
 *
 * WHY every field is TILEABLE by construction: the terrain samples these in
 * WORLD space so the grain does not swim between the 64 chunk meshes, which
 * means the texture wraps thousands of times across the island. Each noise
 * octave is therefore built on an integer lattice of period P that is sampled
 * over exactly P cells, so texel N-1 interpolates back to texel 0 — no seams,
 * ever. Low-frequency content is deliberately kept WEAK for the same reason: a
 * big soft blob would announce the tile. The large-scale tonal variation the
 * terrain needs already exists as vertex mottling in terrainMesh.js; this
 * module's job is the small stuff that vertex colours cannot reach.
 *
 * WHY the amplitude lives in the SHADER and not in the texture: an 8-bit
 * channel that only swings +-6% around neutral would spend 4 of its 8 bits on
 * nothing and band visibly on a gradient. So each field is normalised to fill
 * the whole byte range (+-3 sigma) and materials/toon.js applies the real,
 * deliberately tiny amplitude as a compile-time GLSL literal. Full precision,
 * subtle result, and one shared texture serves a 6% grain and a 2% grain alike.
 *
 * Channel contracts (all textures are NoColorSpace DATA, never sRGB):
 *   paperFiber  RGB = normalised fibre field, slightly de-correlated per channel
 *                     so the grain drifts warm/cool instead of reading as grey
 *                     noise. Neutral is 0.5. A = 1.
 *   paperTooth  RG  = tangent-space normal XY, neutral 0.5 (Z is implied, and
 *                     rebuilt by the shader from an analytic basis — no tangent
 *                     attribute and no derivative tricks).
 *               B   = the height that produced it, used as a cavity/AO term.
 *   deckleDisc  RGBA = torn-edge disc mask (all four channels carry the mask so
 *                      it works as three's `alphaMap`, which samples .g).
 *   deckleEdge  RGBA = same, as a horizontally tiling torn strip.
 *
 * Constraints honoured: three r170 package only, no post-processing, no
 * external files, no Math.random (seeded hash only), power-of-two and mipmapped
 * so minification is stable on both the iPad and the SwiftShader harness,
 * default anisotropy (an anisotropic filter the software GL might not have
 * would make harness and device disagree), one shared instance per texture via
 * the cache below, and dispose() releases all of it.
 */
import * as THREE from 'three';
import { PAPER } from '../../config.js';

// ── Defaults ────────────────────────────────────────────────────────────
// 512 is the sweet spot: at the 3.5 m world tile the terrain uses that is
// 6.8 mm per texel — finer than anything a player can resolve — while costing
// a quarter of a 1024's generation time and VRAM. Masks are smaller because a
// torn edge is a low-frequency shape.
export const TEXTURE_DEFAULTS = {
  fiberSize: 512,
  toothSize: 512,
  deckleDiscSize: 256,
  deckleEdgeWidth: 256,
  deckleEdgeHeight: 64,
  seed: 0x50a9e2,
};

// ── Seeded lattice noise ────────────────────────────────────────────────

/** Integer lattice hash -> [0,1). Same avalanche as heightfield.js. */
function hashi(ix, iy, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Pre-hashed PxQ lattice. Periods here are small (3..128), so baking the hash
 * once turns the inner loop into four array reads instead of four avalanches —
 * the single biggest win in generation time.
 */
function lattice(px, py, seed) {
  const a = new Float32Array(px * py);
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) a[y * px + x] = hashi(x, y, seed);
  }
  return { a, px, py };
}

/**
 * Bilinear value noise on a wrapped lattice -> [0,1). x/y must be >= 0, which
 * every caller satisfies (they sample u*period with u in [0,1)). Wrapping the
 * far corner back to index 0 is what makes the result tile exactly.
 */
function latNoise(L, x, y) {
  const { a, px, py } = L;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ix % px, y0 = iy % py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const r0 = y0 * px, r1 = y1 * px;
  const A = a[r0 + x0], B = a[r0 + x1], C = a[r1 + x0], D = a[r1 + x1];
  return A + (B - A) * ux + (C - A) * uy + (A - B - C + D) * ux * uy;
}

/**
 * Normalise a field to a byte-friendly [0,1] centred on 0.5.
 *
 * Mapping by mean/sigma rather than min/max is deliberate: a single freak texel
 * must not be allowed to compress the other 262 143. +-3 sigma keeps >99.7% of
 * the field inside the range while using essentially the whole byte, so the
 * shader's `(t - 0.5) * 2 * amplitude` has a stable, predictable meaning across
 * every texture this module makes.
 */
function normalise(field, sigmaSpan = 3) {
  const n = field.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += field[i];
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < n; i++) { const d = field[i] - mean; acc += d * d; }
  const sd = Math.sqrt(acc / n) || 1e-6;
  const k = 1 / (2 * sigmaSpan * sd);
  for (let i = 0; i < n; i++) {
    const v = 0.5 + (field[i] - mean) * k;
    field[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return field;
}

const b8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** Common texture setup: data, wrapping, mips, no colour-space decode. */
function finish(tex, { wrap = THREE.RepeatWrapping, wrapT = wrap, mips = true } = {}) {
  tex.wrapS = wrap;
  tex.wrapT = wrapT;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = mips;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // Left at 1 on purpose: an anisotropic filter the SwiftShader harness may not
  // expose would make the reference screenshots disagree with the device.
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

// ── Cache ───────────────────────────────────────────────────────────────
// One instance per (kind, options) so a dozen materials share a single upload.
const _cache = new Map();

function cached(key, build) {
  let t = _cache.get(key);
  if (!t) { t = build(); _cache.set(key, t); }
  return t;
}

// ═══════════════════════════════════════════════════════════════════════
// paperFiber — the pigment grain
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handmade-paper fibre grain, as an albedo multiplier.
 *
 * Six tiling octaves, weighted so the character is FIBROUS rather than noisy:
 * a pair of long directional streak layers (slow across the sheet, fast along
 * it — that ratio is what makes a streak a streak) carry most of the energy, a
 * weaker cross-grain layer weaves against them, a fine fleck layer stands in
 * for pulp specks, and two soft mottle layers give the sheet a hand-pressed
 * unevenness. Mottle is kept deliberately quiet: it is the only content big
 * enough to reveal the tile.
 *
 * The three output channels are the same field with a slow warm/cool offset
 * applied in opposite directions on R and B. That costs nothing (same fetch)
 * and is the difference between "this surface has grain" and "this surface has
 * grey noise on it" — real paper drifts in hue as its fibres bunch.
 */
export function paperFiber(opts = {}) {
  const size = opts.size ?? TEXTURE_DEFAULTS.fiberSize;
  const seed = (opts.seed ?? TEXTURE_DEFAULTS.seed) | 0;
  return cached(`fiber:${size}:${seed}`, () => finish(buildFiber(size, seed)));
}

function buildFiber(size, seed) {
  const n = size * size;
  const field = new Float32Array(n);
  const warmF = new Float32Array(n);

  // [lattice, periodX, periodY, weight]. Periods are integers so every layer
  // wraps. The balance matters more than the amplitude: an early version put
  // 45% of the energy into two long, low-frequency streak layers and the
  // ground came out looking like faint scan lines. Handmade paper is a WEAVE —
  // most of its energy sits in isotropic pulp and flecks, with directional
  // fibre as a minority voice pulling in both axes at once.
  const layers = [
    [lattice(5, 5, seed ^ 0x11), 5, 5, 0.10],         // soft sheet unevenness
    [lattice(13, 13, seed ^ 0x27), 13, 13, 0.14],     // (kept quiet: it is the
    [lattice(34, 34, seed ^ 0x35), 34, 34, 0.20],     //  only content big
    [lattice(14, 110, seed ^ 0x3d), 14, 110, 0.17],   //  enough to reveal the
    [lattice(6, 52, seed ^ 0x59), 6, 52, 0.11],       //  tile) + pulp body,
    [lattice(120, 9, seed ^ 0x6b), 120, 9, 0.11],     //  fibre along X, coarse
    [lattice(128, 128, seed ^ 0x87), 128, 128, 0.17], //  bundles, cross grain,
  ];                                                  //  and flecks.
  const warmL = lattice(3, 3, seed ^ 0x9f);

  const inv = 1 / size;
  for (let j = 0; j < size; j++) {
    const v = j * inv;
    const row = j * size;
    for (let i = 0; i < size; i++) {
      const u = i * inv;
      let f = 0;
      for (let k = 0; k < layers.length; k++) {
        const [L, px, py, w] = layers[k];
        f += latNoise(L, u * px, v * py) * w;
      }
      field[row + i] = f;
      warmF[row + i] = latNoise(warmL, u * 3, v * 3) - 0.5;
    }
  }

  normalise(field, 3);

  // Warm drift: R rises where the sheet is warm, B falls, G holds the centre.
  // 0.22 is tuned so the maximum channel separation after the shader's
  // amplitude is a few thousandths of a linear unit — a tint, not a fringe.
  const WARM = 0.22;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const f = field[i];
    const w = warmF[i] * WARM;
    const o = i * 4;
    data[o] = b8(f + w);
    data[o + 1] = b8(f);
    data[o + 2] = b8(f - w);
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'paper-fiber';
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════
// paperTooth — the pressed surface relief
// ═══════════════════════════════════════════════════════════════════════

/**
 * Soft pressed-paper tooth as a tangent-space normal map (+ its height in B).
 *
 * WHY a normal map at all when the whole world is toon-shaded into three flat
 * steps: because that is precisely what makes it work. A perturbed normal near
 * a ramp threshold breaks the step boundary into a ragged, fibrous edge instead
 * of a machined curve — the same reason a hand-cut paper edge looks handmade.
 * Away from a threshold the perturbation is invisible, which is why the
 * amplitude can stay tiny and still change how the whole frame reads.
 *
 * The gradient is a central difference on the WRAPPED grid (CPU-side finite
 * differences — nothing to do with the banned GPU derivative instructions), and
 * it is scaled by measured sigma so the encoded XY lands in a known range no
 * matter how the octave weights are re-tuned later.
 */
export function paperTooth(opts = {}) {
  const size = opts.size ?? TEXTURE_DEFAULTS.toothSize;
  const seed = (opts.seed ?? TEXTURE_DEFAULTS.seed) | 0;
  return cached(`tooth:${size}:${seed}`, () => finish(buildTooth(size, seed)));
}

/** Target standard deviation of the encoded normal XY, in [-1,1] units. */
const TOOTH_SIGMA = 0.30;

function buildTooth(size, seed) {
  const n = size * size;
  const h = new Float32Array(n);

  const layers = [
    [lattice(48, 48, seed ^ 0xa1), 48, 48, 0.44],
    [lattice(96, 96, seed ^ 0xb3), 96, 96, 0.28],
    [lattice(24, 24, seed ^ 0xc7), 24, 24, 0.15],
    [lattice(9, 72, seed ^ 0xd9), 9, 72, 0.13],   // faint fibre direction
  ];

  const inv = 1 / size;
  for (let j = 0; j < size; j++) {
    const v = j * inv;
    const row = j * size;
    for (let i = 0; i < size; i++) {
      const u = i * inv;
      let f = 0;
      for (let k = 0; k < layers.length; k++) {
        const [L, px, py, w] = layers[k];
        f += latNoise(L, u * px, v * py) * w;
      }
      h[row + i] = f;
    }
  }
  normalise(h, 3);

  // Central differences on the wrapped grid.
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let j = 0; j < size; j++) {
    const row = j * size;
    const up = ((j + size - 1) % size) * size;
    const dn = ((j + 1) % size) * size;
    for (let i = 0; i < size; i++) {
      const l = (i + size - 1) % size;
      const r = (i + 1) % size;
      gx[row + i] = (h[row + r] - h[row + l]) * 0.5;
      gy[row + i] = (h[dn + i] - h[up + i]) * 0.5;
    }
  }
  // Scale by measured sigma so the encoding is stable under re-tuning.
  let acc = 0;
  for (let i = 0; i < n; i++) acc += gx[i] * gx[i] + gy[i] * gy[i];
  const sd = Math.sqrt(acc / (2 * n)) || 1e-6;
  const k = TOOTH_SIGMA / sd;

  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    data[o] = b8(0.5 - gx[i] * k * 0.5);   // normal.x (negated: height -> normal)
    data[o + 1] = b8(0.5 - gy[i] * k * 0.5);
    data[o + 2] = b8(h[i]);                 // height, reused as a cavity term
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'paper-tooth';
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════
// Deckle masks — torn paper edges
// ═══════════════════════════════════════════════════════════════════════

/**
 * Torn-edge disc mask, for anything that would otherwise be a perfect circle:
 * the hero's contact shadow, the glow plate under a pickup, any ground decal.
 *
 * A machine-cut circle is the single loudest "this is CG" tell in a papercut
 * scene. The rim here is a two-octave angular wobble (both periods wrap over
 * 2*pi, so the seam at theta=0 is invisible), softened over a narrow band and
 * then chewed by a fleck field so the transition ends in fibres rather than in
 * a clean feather.
 *
 * All four channels carry the mask: three's alphaMap samples .g, but the same
 * texture then also works as a plain luminance mask anywhere else.
 */
export function deckleDisc(opts = {}) {
  const size = opts.size ?? TEXTURE_DEFAULTS.deckleDiscSize;
  const seed = (opts.seed ?? TEXTURE_DEFAULTS.seed) | 0;
  return cached(`deckleDisc:${size}:${seed}`, () =>
    finish(buildDeckleDisc(size, seed), { wrap: THREE.ClampToEdgeWrapping }));
}

const TAU = Math.PI * 2;

function buildDeckleDisc(size, seed) {
  const n = size * size;
  const data = new Uint8Array(n * 4);
  const rimA = lattice(23, 1, seed ^ 0x1357);   // slow lobes
  const rimB = lattice(61, 1, seed ^ 0x2468);   // fine notches
  const fleck = lattice(64, 64, seed ^ 0x369c);

  const c = (size - 1) * 0.5;
  const invR = 1 / (size * 0.5);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (i - c) * invR;
      const dy = (j - c) * invR;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const t = (a < 0 ? a + TAU : a) / TAU;     // [0,1) around the rim
      // Rim radius: mean 0.84 so the torn edge sits inside the geometry.
      const R = 0.84
        + (latNoise(rimA, t * 23, 0.5) - 0.5) * 0.10
        + (latNoise(rimB, t * 61, 0.5) - 0.5) * 0.045;
      let m = 1 - smoothstep(R - 0.085, R, r);
      // Fibres: only the transition band is chewed, so the interior stays solid.
      const band = m * (1 - m) * 4;
      if (band > 0) {
        m *= 1 - band * 0.55 * smoothstep(0.45, 0.95, latNoise(fleck, (dx * 0.5 + 0.5) * 64, (dy * 0.5 + 0.5) * 64));
      }
      const v = b8(m);
      const o = (j * size + i) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'deckle-disc';
  return tex;
}

/**
 * Torn strip mask that tiles horizontally: solid at v=0, gone by v=1, with the
 * boundary running raggedly across the middle. For banner hems, awning edges,
 * paper ledges — any layer that should end in a tear rather than in a ruler
 * line. Width is the tiling axis, so only that one needs to wrap.
 */
export function deckleEdge(opts = {}) {
  const w = opts.width ?? TEXTURE_DEFAULTS.deckleEdgeWidth;
  const h = opts.height ?? TEXTURE_DEFAULTS.deckleEdgeHeight;
  const seed = (opts.seed ?? TEXTURE_DEFAULTS.seed) | 0;
  return cached(`deckleEdge:${w}:${h}:${seed}`, () => finish(
    buildDeckleEdge(w, h, seed),
    // Tiles along the hem, clamps across it: repeating the tear vertically
    // would put a second torn line above the first.
    { wrap: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping },
  ));
}

function buildDeckleEdge(w, h, seed) {
  const data = new Uint8Array(w * h * 4);
  const lo = lattice(9, 1, seed ^ 0x4a2b);
  const hi = lattice(37, 1, seed ^ 0x5c3d);
  const fleck = lattice(48, 8, seed ^ 0x6e4f);
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = i / w;
      const edge = 0.55
        + (latNoise(lo, u * 9, 0.5) - 0.5) * 0.34
        + (latNoise(hi, u * 37, 0.5) - 0.5) * 0.14;
      let m = 1 - smoothstep(edge - 0.14, edge + 0.03, v);
      const band = m * (1 - m) * 4;
      if (band > 0) {
        m *= 1 - band * 0.5 * smoothstep(0.45, 0.95, latNoise(fleck, u * 48, v * 8));
      }
      const b = b8(m);
      const o = (j * w + i) * 4;
      data[o] = b; data[o + 1] = b; data[o + 2] = b; data[o + 3] = b;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'deckle-edge';
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════
// Budget reporting + teardown
// ═══════════════════════════════════════════════════════════════════════

/**
 * VRAM cost of everything currently generated. Mipmapped RGBA8 costs 4/3 of the
 * base level, which is the number that actually lands on the GPU — report that,
 * not the flattering base figure.
 */
export function textureStats() {
  const entries = [];
  let total = 0;
  for (const [key, tex] of _cache) {
    const w = tex.image.width, h = tex.image.height;
    const base = w * h * 4;
    const bytes = tex.generateMipmaps ? Math.round(base * 4 / 3) : base;
    total += bytes;
    entries.push({ key, name: tex.name, width: w, height: h, baseBytes: base, bytes });
  }
  return { entries, count: entries.length, totalBytes: total, totalMB: +(total / 1048576).toFixed(3) };
}

/**
 * Warm the textures the world actually uses, before any material asks for one.
 *
 * deckleEdge is deliberately NOT in here: nothing in the world wears a torn hem
 * yet, and a texture generated for nobody is CPU time at boot plus VRAM for the
 * whole session. It stays lazy — the first material that asks for it pays.
 */
export function preloadPaperTextures(opts = {}) {
  paperFiber(opts);
  paperTooth(opts);
  deckleDisc(opts);
  return textureStats();
}

/**
 * Release every cached texture. Safe to call more than once; the cache
 * repopulates on the next request, so a second overworld boots clean.
 */
export function disposePaperTextures() {
  for (const tex of _cache.values()) tex.dispose();
  _cache.clear();
}

/** Live cache size — tests assert that materials really do share instances. */
export function paperTextureCacheSize() {
  return _cache.size;
}

/**
 * The teal-leaning micro-shadow used by the cavity term, derived from
 * PAPER.shadow rather than invented: take the palette's shadow hue, normalise
 * it to its brightest channel so only the HUE survives, wash it most of the way
 * to white, and darken the whole thing a touch. The result is a multiplier that
 * can only ever push a surface toward teal — never toward grey, never toward
 * black. Exported so materials/toon.js bakes the same numbers the palette says.
 */
export function cavityTint(strengthToWhite = 0.86, darken = 0.9) {
  const r = ((PAPER.shadow >> 16) & 255) / 255;
  const g = ((PAPER.shadow >> 8) & 255) / 255;
  const b = (PAPER.shadow & 255) / 255;
  const peak = Math.max(r, g, b) || 1;
  const mix = (c) => (c / peak) * (1 - strengthToWhite) + strengthToWhite;
  return [mix(r) * darken, mix(g) * darken, mix(b) * darken];
}
