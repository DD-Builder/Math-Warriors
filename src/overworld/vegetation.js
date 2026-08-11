/**
 * The living half of the island: ground cover, trees, hero set-pieces.
 *
 * Split out of props.js because vegetation is the only subsystem whose budget
 * is measured in HUNDREDS OF THOUSANDS of instances rather than in dozens of
 * objects, and it needs its own machinery to survive that: a cached height
 * grid, a clustered scatter, a per-sector distance LOD and a layered wind. The
 * gates, buildings and pickups next door have none of those problems.
 *
 * ── WHY ~90 k ground-cover items instead of ~18 k ────────────────────────
 * A field of grass reads as a field only when the blades OVERLAP. Below about
 * one item per square metre the eye resolves individual sprites standing on
 * bare paint and the whole island looks like a prototype. So the island is
 * seeded at ~1.2 items/m² of habitable ground and the cost is paid back at
 * DRAW time, not at build time:
 *
 *   SECTORS   every archetype is bucketed into a 60 m world grid, so three's
 *             frustum test throws away everything behind the camera for free
 *             (one bounding sphere per sector, computed once at build).
 *   PREFIX    each sector's instances are SHUFFLED at build, which makes any
 *             prefix of the buffer a uniform random subset of the sector. So
 *             thinning a distant sector to 10 % costs one integer write to
 *             `mesh.count` — no re-upload, no re-sort, no allocation.
 *   CULL      past 112 m a sector is simply hidden. The fog wall is at ~120 m
 *             at the default time of day and a 0.4 m blade is sub-pixel long
 *             before that.
 *
 * Net: ~90 k instances resident, ~20-30 k rasterised, and the number of draw
 * calls a frame actually issues is the number of sectors in the frustum — a
 * few dozen — not the number of instances.
 *
 * ── WHY clustered scatter instead of uniform ─────────────────────────────
 * Uniform rejection sampling produces the one thing nature never does: even
 * spacing. Real ground cover is groves and glades. Every field here is drawn
 * from a mixture — ~75 % of samples fall inside one of a handful of blob
 * "clusters", the rest are uniform — and a set of "glade" discs punch clearings
 * back out. Trees additionally run a min-distance rejection through a spatial
 * hash, so a grove is dense but never interpenetrating. The result has
 * texture at every scale: thickets, meadows, and lone trees on open ground.
 *
 * ── WHY the colour varies with the ground, not just the biome ────────────
 * Ground cover that ignores what it grows on is stickers on a map. Each item's
 * tint is: the biome's two greens blended by a low-frequency patch noise (so
 * the field mottles), pulled toward SAND near the waterline (drier, sandier
 * beaches — the same cue terrainMesh.js paints the ground with, so the two
 * agree), pulled toward pale cream on steep ground (thin, dry soil), then
 * jittered per instance. Near the shore the SPECIES change too, not just the
 * hue: ferns and clover give way to reeds and pebbles.
 *
 * ── WHY the wind is three layers ─────────────────────────────────────────
 * One sine is a jitter. Grass reads as WIND when a large-scale gust front
 * travels across the island and the field ripples in bands as it passes. So
 * every plant material sums:
 *
 *   gust     a plane wave in world XZ (wavelength ~60 m) travelling at a few
 *            m/s, squared so the field is mostly calm with sharp pulses;
 *   sway     two incommensurate sines phased by a hash of the instance origin
 *            — the body of the motion, never in unison, never repeating;
 *   flutter  a fast small sine on a different phase multiplier — the leaf-edge
 *            chatter that sells scale.
 *
 * All three ride a (height above base)² weight so roots stay planted. Cost:
 * ~10 ALU in the vertex shader, zero CPU, zero allocation.
 *
 * Constraints honoured: three r170 package only, no post-processing, no
 * depth-texture reads, no fwidth/derivative tricks (the screenshot harness is
 * software GL and must match the device), InstancedMesh for everything
 * repeated, zero allocation in update(), every colour resolves from PAPER,
 * shadows come from the shared teal-tinted toon ramp — never black, never
 * grey, no outlines. Everything created here is released by dispose().
 */
import * as THREE from 'three';
import { WORLD, BIOMES } from './worldSpec.js';
import { toonMaterial, applyPapercut, PAPER } from './materials/toon.js';
import { g, lin, mixHex, shade, trs, sink, stamp, tri, bake } from './geobuild.js';
import { makeRng } from '../systems/rng.js';

const TAU = Math.PI * 2;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

// ── Placement gates ─────────────────────────────────────────────────────
//
// These numbers used to be permissive (42 deg for cover, 34 for trees) and the
// result was tufts and micro-trees stuck to near-vertical rock in every cliff
// shot — plants standing where a plant could not physically hold on, which is
// the single loudest "this was scattered by a script" tell a stylised world
// can have. Plants now stop where soil stops, and the cliff face they vacate
// is backfilled with the thing that actually lives there: rock. A cliff needs
// ROCK detail, not plant detail.
//
// Each limit is paired with a SOFT band above it over which acceptance falls
// off linearly instead of stopping dead. A hard cutoff draws a stencil line
// across a hillside; a soft one thins out, which is what a real treeline does.
export const PLANT_MIN_H = WORLD.WATER_Y + 0.26;   // never on water (spec)
export const TREE_MIN_H = WORLD.WATER_Y + 0.9;
const MAX_SLOPE_NY = Math.cos(30 * Math.PI / 180);  // ground cover: ~0.866
const COVER_SLOPE_SOFT = 0.075;
const TREE_SLOPE_NY = Math.cos(22 * Math.PI / 180); // trees: ~0.927
const TREE_SLOPE_SOFT = 0.055;
// Talus and scree take the ground the plants just gave up: steeper than cover
// can hold, shallower than an overhang where nothing would rest.
const ROCK_MIN_NY = Math.cos(74 * Math.PI / 180);   // ~0.276
const ROCK_MAX_NY = Math.cos(21 * Math.PI / 180);   // ~0.934
// Crown separation. A tree's exclusion radius is its own CROWN radius times
// this, so two neighbours must be ~1.5 crowns apart: groves stay dense, but a
// canopy can no longer cut through the canopy beside it (which is what
// garden-portal was showing). Per-species, because a 7 m umbrella and a 1.5 m
// sapling do not want the same spacing.
const CROWN_GAP_F = 0.76;

// ── Ground-cover sectors + distance LOD ─────────────────────────────────
// 60 m cells: big enough that a frame only ever touches ~20 of them, small
// enough that the LOD step between neighbouring cells is invisible.
// 80 m cells: the LOD is graded by distance to the CELL, so smaller cells
// grade more finely — but every extra cell is another draw call, and the call
// budget is the binding constraint. 72 m is where the two curves cross for a
// 480 m island: ~26 land cells, ~10 of them inside the cull radius at once.
const COVER_CELL = 120;
const COVER_CELLS = Math.max(1, Math.round(WORLD.SIZE / COVER_CELL));
const LOD_FULL = 30;     // <= this: every instance in the sector draws
const LOD_MID = 52;
const LOD_CULL = 112;    // > this: the sector is hidden outright
const LOD_MID_F = 0.27;
const LOD_FAR_F = 0.065;

// Height cache. sampleHeight is ~40 flops of noise; the scatter rejects far
// more candidates than it keeps, so every REJECTION is served from a 2 m
// bilinear grid (58 k samples, built once) and only ACCEPTED points pay for an
// exact evaluation. That is the difference between a 0.4 s and a 3 s build.
const GRID_STEP = 2;

// ── Wind ────────────────────────────────────────────────────────────────
// Shared clock object handed to every patched shader's uniform map, so
// update() writes exactly one number per frame.
const WIND = { value: 0 };
// Prevailing wind bearing. Gust fronts travel along it; every material uses
// the same one, so trees, grass and petals lean together.
const GUST_DIR = [Math.cos(0.62), Math.sin(0.62)];

// ── Small helpers ───────────────────────────────────────────────────────

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** Integer lattice hash -> [0,1). Local copy: the heightfield's is private and
 *  its noise stream must not be perturbed. */
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Two-octave fBm over patchNoise -> [0,1). This is the MOISTURE field.
 *
 * Ground cover placed by uniform random ignores the land it grows on, and the
 * eye reads that instantly: identical density on the summit, on the 40-degree
 * face and on the flats. A moisture field is the cheapest correction there is
 * — one low-frequency lobe says where the ground holds water, and everything
 * else (how thick the cover is, which species wins, how green it stays, where
 * the treeline runs) hangs off that one number. Two octaves only: the shape
 * has to be readable from 100 m, so its features are 60-90 m across.
 */
function moistureAt(x, z, seed) {
  return patchNoise(x * 0.0135, z * 0.0135, seed) * 0.68
    + patchNoise(x * 0.037, z * 0.037, seed ^ 0x77) * 0.32;
}

/**
 * Discrete Laplacian of the cached height grid — POSITIVE in a gully or a
 * shelf, NEGATIVE on a nose or a crest.
 *
 * This is the term that stops the scatter being statistical and makes it
 * topographic: dense stands collect in the concave ground where water and soil
 * collect, exposed convex faces go bare, and boulders pile at the slope breaks
 * where talus actually accumulates. `_gx`/`_gz` are globals written by gridAt,
 * so they are saved and restored — every caller reads them right afterwards.
 */
function curvOf(G, x, z, s = 6) {
  const sx = _gx, sz = _gz;
  const c = gridAt(G, x, z);
  const e = gridAt(G, x + s, z), w = gridAt(G, x - s, z);
  const n = gridAt(G, x, z + s), t = gridAt(G, x, z - s);
  _gx = sx; _gz = sz;
  return (e + w + n + t - 4 * c) / (s * s);
}

/**
 * Bake the Laplacian once over the whole island rather than five times per
 * candidate.
 *
 * The scatter rejects far more candidates than it keeps — that is the point of
 * a weighted sampler — so anything evaluated per CANDIDATE is evaluated a
 * million times. Curvature is a pure function of the height grid, so it is
 * computed once into a grid of the same shape and read back with the same
 * bilinear lookup, which is the difference between a half-second added to boot
 * and a hundredth of one.
 */
function makeCurvGrid(G, s = 6) {
  const n = G.n;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -WORLD.HALF + j * GRID_STEP;
    for (let i = 0; i < n; i++) {
      h[j * n + i] = curvOf(G, -WORLD.HALF + i * GRID_STEP, z, s);
    }
  }
  return { n, h };
}

/** Curvature at (x,z), off the baked grid. Clobbers _gx/_gz, so save first. */
function curvAt(C, x, z) {
  const sx = _gx, sz = _gz;
  const v = gridAt(C, x, z);
  _gx = sx; _gz = sz;
  return v;
}

/** Bilinear value noise -> [0,1). Used only for tonal patch mottling. */
function patchNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// ═══════════════════════════════════════════════════════════════════════
// Shader patches
// ═══════════════════════════════════════════════════════════════════════

/**
 * Layered plant wind: travelling gust front x rhythmic sway x fast flutter.
 * See the module header for why all three exist. `base`/`span` define the
 * height window over which the (squared) weight ramps from planted root to
 * fully mobile tip.
 *
 * `mwSeed` is the instance's world XZ (instanceMatrix column 3) — vegetation
 * is placed in world coordinates under a group at the origin, so it doubles as
 * both the per-instance phase hash AND the position the gust wave is sampled
 * at. That is what makes the ripple travel across the field instead of every
 * blade pulsing in place.
 */
function patchPlantWind(material, o) {
  const {
    base, span, amp, lean = 0.55, speed = 0.55,
    flutter = 0.2, flutterSpeed = 3.2,
    gust = 0.55, gustLen = 60, gustSpeed = 9,
  } = o;
  const k = TAU / gustLen;
  const calm = 1 - gust;
  // CHAIN. Every tree, plant and grass blade is born in toonMaterial(), which
  // installs the aerial-fog uniforms and the teal shadow floor; assigning over
  // the hook would drop both, and the canopies are the single biggest thing in
  // the frame that both casts and receives a shadow.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    shader.uniforms.uWindTime = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec2 mwSeed = instanceMatrix[3].xz;
  #else
    vec2 mwSeed = vec2( 0.0 );
  #endif
  float mwW = clamp( ( transformed.y - ${g(base)} ) / ${g(span)}, 0.0, 1.0 );
  mwW *= mwW;
  float mwPh = dot( mwSeed, vec2( 0.21, 0.13 ) );
  float mwG = sin( ( dot( mwSeed, vec2( ${g(GUST_DIR[0])}, ${g(GUST_DIR[1])} ) )
                     - uWindTime * ${g(gustSpeed)} ) * ${g(k)} ) * 0.5 + 0.5;
  mwG = ${g(calm)} + ${g(gust)} * mwG * mwG;
  float mwS = sin( uWindTime * ${g(speed)} + mwPh ) * 0.68
            + sin( uWindTime * ${g(speed * 0.41)} + mwPh * 1.7 + 1.3 ) * 0.32;
  float mwF = sin( uWindTime * ${g(flutterSpeed)} + mwPh * 4.7 ) * ${g(flutter)};
  float mwA = ( mwS + mwF ) * mwG;
  transformed.x += mwA * ${g(amp)} * mwW;
  transformed.z += mwA * ${g(amp * lean)} * mwW;`);
  };
  material.customProgramCacheKey = () =>
    `${prevKey ? prevKey.call(material) : ''}`
    + `|mw-wind2|${base}|${span}|${amp}|${lean}|${speed}|${flutter}|${flutterSpeed}|${gust}|${gustLen}|${gustSpeed}`;
}

/**
 * Falling blossom petals, entirely in the vertex shader.
 *
 * Each instance is a PARKED COLUMN: its matrix puts it on the ground somewhere
 * under a hero tree, and the shader lifts it to `top` and lets it fall on a
 * loop whose phase is a linear hash of that world position. `transformed` is
 * scaled by a fade window first (the petal shrinks to nothing at both ends of
 * the loop, so nothing ever pops), then swirled, then dropped.
 *
 * The phase hash is a plain dot product, NOT the usual `fract(sin(dot(…)) *
 * 43758.5)`: that idiom's result depends on the precision of `sin` at huge
 * arguments, which differs between the software GL the screenshot harness runs
 * and a real mobile GPU. A linear hash over coordinates bounded by ±240 is
 * exactly reproducible on both.
 */
function patchPetalFall(material, { top = 6, spread = 1.4, fall = 0.055, swirl = 1.3 }) {
  // Chains, for the same reason patchPlantWind does.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    shader.uniforms.uWindTime = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec2 mwSeed = instanceMatrix[3].xz;
  #else
    vec2 mwSeed = vec2( 0.0 );
  #endif
  float mwH = fract( dot( mwSeed, vec2( 0.1031, 0.11369 ) ) );
  float mwK = fract( mwH + uWindTime * ${g(fall)} );
  float mwFade = smoothstep( 0.0, 0.12, mwK ) * smoothstep( 1.0, 0.86, mwK );
  float mwSw = uWindTime * ${g(swirl)} + mwH * 37.0;
  transformed *= mwFade;
  transformed.xz += vec2( sin( mwSw ), cos( mwSw * 0.83 ) ) * ${g(spread)} * ( 1.0 - mwK );
  transformed.y += ${g(top)} * ( 1.0 - mwK );`);
  };
  material.customProgramCacheKey = () =>
    `${prevKey ? prevKey.call(material) : ''}|mw-petalfall|${top}|${spread}|${fall}|${swirl}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Height grid
// ═══════════════════════════════════════════════════════════════════════

let _gx = 0, _gz = 0;   // gradient written by gridAt (build-time only)

function makeHeightGrid(sampleHeight) {
  const n = Math.round(WORLD.SIZE / GRID_STEP) + 1;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -WORLD.HALF + j * GRID_STEP;
    for (let i = 0; i < n; i++) {
      h[j * n + i] = sampleHeight(-WORLD.HALF + i * GRID_STEP, z);
    }
  }
  return { n, h };
}

/** Bilinear height at (x,z); also writes the local gradient to _gx/_gz. */
function gridAt(G, x, z) {
  const n = G.n;
  const fx = (x + WORLD.HALF) / GRID_STEP;
  const fz = (z + WORLD.HALF) / GRID_STEP;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0) i = 0; else if (i > n - 2) i = n - 2;
  if (j < 0) j = 0; else if (j > n - 2) j = n - 2;
  const tx = Math.min(1, Math.max(0, fx - i));
  const tz = Math.min(1, Math.max(0, fz - j));
  const a = G.h[j * n + i], b = G.h[j * n + i + 1];
  const c = G.h[(j + 1) * n + i], d = G.h[(j + 1) * n + i + 1];
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  _gx = ((b - a) + ((d - c) - (b - a)) * tz) / GRID_STEP;
  _gz = (cd - ab) / GRID_STEP;
  return ab + (cd - ab) * tz;
}

// ═══════════════════════════════════════════════════════════════════════
// Ground-cover archetypes
// ═══════════════════════════════════════════════════════════════════════
//
// Relative layer shades only: instanceColor carries the hue, the vertex colour
// carries the ply. Root plies are dark so a tuft has its own contact shadow
// without costing a shadow-map draw; tips run slightly over 1.0 so a lit blade
// reads above the ground it stands on.

const ROOT = shade(0.54);
const MID = shade(0.80);
const TIP = shade(1.07);
const DRYTIP = shade(1.14);
const BRIGHT = shade(1.24);   // flat leaves face the sun square-on
const HEART = [1.06, 0.94, 0.70];  // warm PALE centre of a bloom

/** A tuft of single-triangle blades — the papercut blade IS a triangle. */
function buildBladeTuft({ blades, h, hVar, w, lean, tip = TIP, phase = 0.55 }) {
  const s = sink();
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * TAU + phase;
    const ln = lean * (0.68 + (k % 3) * 0.24);
    const hh = h * (1 + ((k % 3) - 1) * hVar);
    const dx = Math.sin(a), dz = Math.cos(a);
    const nx = dx * 0.42, nz = dz * 0.42;
    const inv = 1 / Math.hypot(nx, 0.9, nz);
    tri(s,
      [-dz * w, 0, dx * w],
      [dz * w, 0, -dx * w],
      [dx * ln, hh, dz * ln],
      [nx * inv, 0.9 * inv, nz * inv], ROOT, ROOT, tip);
  }
  return bake(s);
}

/**
 * Ground-hugging clover: four fan leaflets, wide edge outward, wide enough
 * that neighbouring leaflets nearly meet. This is the archetype that CLOSES
 * the field — tufts alone leave bare paint between them however many you
 * scatter, because a tuft is vertical and the gaps are horizontal.
 */
function buildCloverGeo() {
  const s = sink();
  const L = 0.17, W = 0.118;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    const dx = Math.sin(a), dz = Math.cos(a);
    const px = -dz, pz = dx;
    tri(s,
      [0, 0.03, 0],
      [dx * L + px * W, 0.07, dz * L + pz * W],
      [dx * L - px * W, 0.07, dz * L - pz * W],
      [dx * 0.18, 0.98, dz * 0.18], TIP, BRIGHT, BRIGHT);
  }
  return bake(s);
}

/** Arching fern frond: leaflets hung alternately off a rising spine curve. */
function buildFernGeo() {
  const s = sink();
  const FRONDS = 2, SEG = 3, R = 0.42, H = 0.52;
  for (let f = 0; f < FRONDS; f++) {
    const a = f * 2.45 + 0.7;
    const dx = Math.sin(a), dz = Math.cos(a);
    const px = -dz, pz = dx;
    const sp = (t) => [dx * R * t, 0.06 + H * Math.sin(t * 1.28), dz * R * t];
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG, tm = (t0 + t1) * 0.5;
      const w = 0.17 * (1 - tm * 0.62);
      const side = (i % 2 === 0) ? 1 : -1;
      const A = sp(t0), B = sp(t1), M = sp(tm);
      const inv = 1 / Math.hypot(px * side * 0.32, 0.9, pz * side * 0.32);
      tri(s, A, B,
        [M[0] + px * w * side, M[1] - 0.02, M[2] + pz * w * side],
        [px * side * 0.32 * inv, 0.9 * inv, pz * side * 0.32 * inv],
        MID, TIP, TIP);
    }
  }
  return bake(s);
}

/** Small bush: three crossed plies, each a lower body and a lighter crown. */
function buildShrubGeo() {
  const s = sink();
  const H = 0.72, W = 0.42, TW = 0.20;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const nrm = [dz * 0.3, 0.94, -dx * 0.3];
    const p = (u, y) => [dx * u, y, dz * u];
    tri(s, p(-W, 0.02), p(W, 0.02), p(TW, H), nrm, ROOT, ROOT, TIP);
    tri(s, p(-W, 0.02), p(TW, H), p(-TW, H), nrm, ROOT, TIP, TIP);
  }
  return bake(s);
}

/**
 * Dock leaf — the KNEE-HIGH tier.
 *
 * Everything in this field used to read at one horizon: tufts at 0.5 m, clover
 * at 0.1 m, and nothing between them and a 5 m tree. A field with one height
 * has no interior — the eye crosses it in a single sweep and finds nothing to
 * rest on. This is the missing storey: broad paddle leaves on short stems,
 * about 0.8 m, scattered at roughly a sixth of the tuft count so it reads as
 * punctuation rather than as a second carpet.
 *
 * Wide blades on purpose. A tall thin thing at this scale is just a bigger
 * blade of grass; what makes a dock leaf legible from twenty metres is that it
 * presents AREA to the light, so it catches the lit ramp step while the grass
 * around it is still in the mid step.
 */
function buildDockGeo() {
  const s = sink();
  const N = 3;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU + 0.9;
    const dx = Math.sin(a), dz = Math.cos(a);
    const px = -dz, pz = dx;
    const reach = 0.30 + (k % 3) * 0.075;
    const H = 0.56 * (1 - (k % 3) * 0.13);
    const W = 0.112 * (1 - (k % 2) * 0.16);
    const inv = 1 / Math.hypot(dx * 0.30, 0.92, dz * 0.30);
    const nrm = [dx * 0.30 * inv, 0.92 * inv, dz * 0.30 * inv];
    const base = [dx * 0.03, 0.03, dz * 0.03];
    const midX = dx * reach * 0.55, midZ = dz * reach * 0.55, midY = H * 0.66;
    const tip = [dx * reach, H, dz * reach];
    tri(s, base, [midX + px * W, midY, midZ + pz * W], tip, nrm, ROOT, TIP, DRYTIP);
    tri(s, base, tip, [midX - px * W, midY, midZ - pz * W], nrm, ROOT, DRYTIP, TIP);
  }
  return bake(s);
}

/**
 * Scree — a handful of angular chips lying where a slope sheds them.
 *
 * Cut as flat propped triangles rather than as little solids: at 10 cm the
 * silhouette is all that survives, and a propped chip gives a lit top face and
 * a shaded edge for three vertices instead of twelve.
 */
function buildScreeGeo() {
  const s = sink();
  for (let k = 0; k < 4; k++) {
    const a = k * 1.83 + 0.35;
    const ox = Math.cos(a) * 0.13, oz = Math.sin(a) * 0.13;
    const r = 0.075 + (k % 3) * 0.028;
    const lx = Math.cos(a * 1.7), lz = Math.sin(a * 1.7);
    const tilt = 0.45;
    const pt = (ang) => {
      const px = Math.cos(ang) * r, pz = Math.sin(ang) * r;
      const across = px * -lz + pz * lx;
      return [ox + px, 0.008 + Math.abs(across) * tilt, oz + pz];
    };
    tri(s, pt(a), pt(a + 2.2), pt(a + 4.3),
      [-lz * 0.30, 0.95, lx * 0.30],
      shade(1.0), shade(0.82), shade(0.92));
  }
  return bake(s);
}

/**
 * Boulder — the biggest rock tier, and the one that gives a bare cliff its
 * scale. An open 6-gon drum with a cone cap: 18 triangles for a form that
 * reads as a faceted stone from every angle, where a sphere would cost 36 and
 * look machined.
 */
function buildBoulderGeo() {
  const s = sink();
  // Two open hexagonal cones, squashed and tilted against each other: 12
  // triangles for a form that reads as a faceted stone from any angle. A drum
  // plus a cap looked marginally better and cost 18 — and at ~4 000 boulders
  // across the island that difference is a fifth of the whole ground-cover
  // triangle budget, which is not what a background rock should be spending.
  stamp(s, new THREE.ConeGeometry(0.52, 0.74, 6, 1, true),
    trs(0, 0.30, 0, 0.10, 0.4, 0.06, 1.12, 1, 0.90), shade(1.02));
  stamp(s, new THREE.ConeGeometry(0.30, 0.42, 6, 1, true),
    trs(0.34, 0.16, -0.20, -0.08, 1.3, -0.10, 1.0, 1, 0.94), shade(0.86));
  return bake(s);
}

/** Two faceted paper stones. Open cones: four triangles each, no wasted base. */
function buildPebbleGeo() {
  const s = sink();
  stamp(s, new THREE.ConeGeometry(0.115, 0.13, 4, 1, true),
    trs(0, 0.05, 0, 0.14, 0.6, 0, 1, 0.72, 1.15), shade(1.0));
  stamp(s, new THREE.ConeGeometry(0.075, 0.10, 4, 1, true),
    trs(0.135, 0.035, -0.085, -0.1, 1.9, 0.08, 1.1, 0.7, 1), shade(0.84));
  return bake(s);
}

/**
 * Fallen petals: three scraps propped at a slight angle rather than lying
 * dead flat. A perfectly flat triangle is invisible from a standing camera and
 * reads as a stray dash at a grazing one; a 25-degree prop gives each scrap a
 * lit face and a soft edge, which is what a petal on grass actually looks like.
 */
function buildFallenPetalGeo() {
  const s = sink();
  for (let k = 0; k < 4; k++) {
    const a = k * 1.75 + 0.4;
    const ox = Math.cos(a) * 0.085, oz = Math.sin(a) * 0.085;
    const b = a * 1.7, r = 0.062;
    const tilt = 0.62;                       // radians of prop
    const lx = Math.cos(b), lz = Math.sin(b);   // hinge axis of this scrap
    const pt = (ang, lift) => {
      const px = Math.cos(ang) * r, pz2 = Math.sin(ang) * r;
      // Height rises with distance from the hinge line, so the scrap tips up.
      const across = px * -lz + pz2 * lx;
      return [ox + px, 0.012 + lift + Math.abs(across) * tilt, oz + pz2];
    };
    tri(s, pt(b, 0), pt(b + 2.094, 0.004), pt(b + 4.188, 0.002),
      [-lz * 0.34, 0.94, lx * 0.34], TIP, MID, TIP);
  }
  return bake(s);
}

/**
 * Five-petal bloom on a short dark stalk, tilted so it catches the lit step.
 *
 * Each petal is a QUAD, not a wedge: a wedge running from a single centre
 * point out to a wide rim is geometrically a pinwheel, and at this scale that
 * is exactly what the eye calls it. A paddle — narrow inner edge, wide rounded
 * outer edge, wide enough that neighbours overlap at the rim — reads as a
 * flower from any angle for one extra triangle.
 */
function buildBloomGeo() {
  const s = sink();
  const PET = 5, RIN = 0.028, ROUT = 0.165, WI = 0.026, WO = 0.118, Y = 0.19;
  const up = [0, 0.94, 0.34];
  tri(s, [-0.026, 0, 0], [0.026, 0, 0], [0, Y, 0], [0, 0.4, 0.92],
    shade(0.30), shade(0.30), shade(0.50));
  for (let i = 0; i < PET; i++) {
    const a = (i / PET) * TAU + 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz, pz = dx;
    const inA = [dx * RIN + px * WI, Y + 0.004, dz * RIN + pz * WI];
    const inB = [dx * RIN - px * WI, Y + 0.004, dz * RIN - pz * WI];
    const outA = [dx * ROUT + px * WO, Y + 0.016, dz * ROUT + pz * WO];
    const outB = [dx * ROUT - px * WO, Y + 0.016, dz * ROUT - pz * WO];
    // The warm heart is painted on the INNER vertices rather than built as a
    // separate centre disc: the petal bases already meet over the stalk, so a
    // disc would be three triangles buying a colour we can have for free.
    tri(s, inA, outA, outB, up, HEART, TIP, TIP);
    tri(s, inA, outB, inB, up, HEART, TIP, HEART);
  }
  const geo = bake(s);
  geo.rotateX(0.36);
  geo.computeBoundingSphere();
  return geo;
}

/** One airborne blossom petal: two triangles with a folded crease. */
function buildFlyingPetalGeo(topReach) {
  const s = sink();
  const L = 0.15, W = 0.085;
  tri(s, [0, 0, -L * 0.7], [-W, 0.018, L * 0.5], [0, 0, L * 0.5], [0.35, 0.93, 0], TIP, TIP, MID);
  tri(s, [0, 0, -L * 0.7], [0, 0, L * 0.5], [W, 0.018, L * 0.5], [-0.35, 0.93, 0], TIP, MID, TIP);
  const geo = bake(s);
  // The shader lifts each petal up to `topReach` above its parked origin, and
  // three sizes an InstancedMesh's bounding sphere from the GEOMETRY's. Without
  // this the whole swarm would be culled the moment the tree's base left the
  // frustum, which is exactly when the petals are most visible.
  geo.boundingSphere.center.set(0, topReach * 0.5, 0);
  geo.boundingSphere.radius = topReach * 0.5 + 2;
  return geo;
}

/**
 * Ground-cover archetype table. `tris` is documentation for the budget review;
 * `wind` picks which material (and therefore which sway) an archetype rides.
 */
/**
 * Ground-cover archetype table.
 *
 * `s0`/`sv` are the per-instance scale band (s0 .. s0+sv). They are per
 * ARCHETYPE, not global, because these things are not the same size in life: a
 * grass tuft may double and still be grass, while a flower head at twice its
 * size stops being a flower and becomes a hubcap. `stretch` says whether the
 * instance may also be squashed or drawn out vertically — right for anything
 * that grows, wrong for a stone or a fallen petal, which would just look
 * melted. `tris` is documentation for the budget review; `mat` picks which
 * material (and therefore which sway) the archetype rides.
 */
export const GROUND_ARCHETYPES = {
  tuft: { tris: 4, mat: 'plant', s0: 0.70, sv: 0.70, stretch: true, build: () => buildBladeTuft({ blades: 4, h: 0.50, hVar: 0.20, w: 0.058, lean: 0.24 }) },
  reed: { tris: 3, mat: 'plant', s0: 0.66, sv: 0.52, stretch: true, build: () => buildBladeTuft({ blades: 3, h: 0.86, hVar: 0.2, w: 0.034, lean: 0.1, tip: DRYTIP, phase: 1.1 }) },
  clover: { tris: 4, mat: 'plant', s0: 0.72, sv: 0.66, stretch: false, build: buildCloverGeo },
  fern: { tris: 6, mat: 'plant', s0: 0.68, sv: 0.56, stretch: true, build: buildFernGeo },
  shrub: { tris: 6, mat: 'plant', s0: 0.80, sv: 0.80, stretch: true, build: buildShrubGeo },
  bloom: { tris: 11, mat: 'plant', s0: 0.66, sv: 0.42, stretch: false, build: buildBloomGeo },
  petal: { tris: 4, mat: 'plant', s0: 0.70, sv: 0.55, stretch: false, build: buildFallenPetalGeo },
  dock: { tris: 6, mat: 'plant', s0: 0.66, sv: 0.44, stretch: true, build: buildDockGeo },
  pebble: { tris: 8, mat: 'rock', s0: 0.66, sv: 0.80, stretch: false, build: buildPebbleGeo },
  // Rock tiers. `scree` and `boulder` are placed by their own pass (see
  // scatterRock) on the STEEP ground the plants were just forbidden — they are
  // in this table because they share the sector bucketing, the distance LOD
  // and the instance-colour path with everything else that carpets the ground.
  scree: { tris: 4, mat: 'rock', s0: 0.70, sv: 1.05, stretch: false, build: buildScreeGeo },
  boulder: { tris: 12, mat: 'rock', s0: 0.55, sv: 1.70, stretch: false, build: buildBoulderGeo },
};

const ARCH_NAMES = Object.keys(GROUND_ARCHETYPES);
// Archetypes whose instanceColor is a FLOWER hue rather than a foliage green.
const BLOOM_ARCH = new Set(['bloom', 'petal']);
// Archetypes that are STONE: tinted from the biome's rock, never from its
// foliage, and never pulled toward the shoreline sand.
const ROCK_ARCH = new Set(['pebble', 'scree', 'boulder']);

// ═══════════════════════════════════════════════════════════════════════
// Tree species
// ═══════════════════════════════════════════════════════════════════════
//
// A tree is a trunk plus stacked flat plies of slightly different greens — the
// classic papercut tree. Low-sided (7-gon) discs read as hand-cut paper where a
// smooth cone reads as CG. Species differ by SILHOUETTE, which is the only
// difference the eye actually registers at 60 m:
//
//   broadleaf  round dome        conifer/frostpine  tall narrow spire
//   blossom    low wide dome     ember              broad warm dome
//   willow     weeping curtains  umbrella           bare pole, flat parasol
//
// Every species then carries a VARIANT table (scale / proportion / tone), and a
// per-instance continuous jitter rides on top of that, so neighbouring trees of
// the same species never present the same outline.

/** @returns {THREE.Matrix4} a transform whose local +Y leans `tilt` toward bearing `dir`. */
function leanM(px, py, pz, dir, tilt, sx = 1, sy = 1, sz = 1) {
  const axis = new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir));
  const q = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz));
}

// ── THE PROPORTION LAW (playtest defect: "trees look like umbrellas or
// mushrooms", "you can walk through trees") ─────────────────────────────
//
// The first tables authored 3.5-4.7 m trees with crowns as wide as they were
// tall, and the scale band then skewed DOWN — so most placed trees stood
// 1.2-2.8x the 1.72 m hero with their canopy underside at face height. A child
// reads that silhouette as a mushroom, and walks head-first through foliage a
// 30 cm trunk collider cannot represent. Every species below is therefore
// written against three hard rules:
//
//   TALLER THAN WIDE   canopy top 5.5-8 m at unit scale (3-5x the hero placed;
//                      conifers taller still), and height >= 1.3x crown
//                      diameter for every round-crown species.
//   CANOPY OFF THE HEAD the lowest foliage of every species clears 2.4 m at
//                      the minimum placed scale — you walk UNDER a tree's
//                      crown and INTO its trunk, never through its face.
//   COLLIDER = LOW MASS `collider` is the radius of the solid body a child
//                      can actually run into (trunk flare, willow curtain
//                      skirt), in unit metres; index.js registers it scaled.
const TREE_SPECIES = {
  broadleaf: {
    trunk: { color: PAPER.sand, shade: 0.86, rTop: 0.26, rBot: 0.36, h: 3.4, sides: 7 },
    collider: 0.44,
    slabs: [
      { y: 3.10, r: 2.35, h: 0.72, taper: 0.82, color: PAPER.forest, spin: 0.0 },
      { y: 4.15, r: 2.05, h: 0.66, taper: 0.78, color: PAPER.forestL, spin: 0.4 },
      { y: 5.15, r: 1.55, h: 0.58, taper: 0.68, color: PAPER.leaf, spin: 0.8 },
      { y: 6.00, r: 0.95, h: 0.50, taper: 0.52, color: PAPER.leaf, spin: 1.2 },
    ],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.03, tone: [1.00, 1.00, 1.00] },
      { s: 1.18, wide: 1.06, tall: 0.98, lean: 0.05, tone: [0.94, 0.99, 0.93] },
      { s: 0.90, wide: 0.94, tall: 1.10, lean: 0.08, tone: [1.05, 1.00, 0.92] },
      { s: 1.06, wide: 0.90, tall: 1.06, lean: 0.02, tone: [0.96, 1.02, 1.00] },
    ],
  },
  conifer: {
    trunk: { color: PAPER.sand, shade: 0.70, rTop: 0.22, rBot: 0.34, h: 2.6, sides: 7 },
    collider: 0.40,
    slabs: [
      { y: 2.10, r: 2.10, h: 1.80, taper: 0.40, color: PAPER.forestD, spin: 0.0 },
      { y: 3.55, r: 1.68, h: 1.65, taper: 0.38, color: PAPER.forest, spin: 0.45 },
      { y: 4.85, r: 1.26, h: 1.50, taper: 0.34, color: PAPER.forestL, spin: 0.9 },
    ],
    cones: [{ y: 6.05, r: 0.88, h: 2.00, color: PAPER.leaf, spin: 1.3 }],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.02, tone: [1.00, 1.00, 1.00] },
      { s: 1.15, wide: 0.92, tall: 1.12, lean: 0.01, tone: [0.93, 0.98, 0.95] },
      { s: 0.90, wide: 1.08, tall: 0.94, lean: 0.05, tone: [1.06, 1.01, 0.94] },
      { s: 1.08, wide: 1.02, tall: 1.06, lean: 0.03, tone: [0.98, 1.00, 1.04] },
    ],
  },
  frostpine: {
    trunk: { color: PAPER.creamD, shade: 0.78, rTop: 0.22, rBot: 0.32, h: 2.4, sides: 7 },
    collider: 0.38,
    slabs: [
      { y: 2.05, r: 1.95, h: 1.70, taper: 0.42, color: PAPER.tealD, spin: 0.0 },
      { y: 3.45, r: 1.50, h: 1.55, taper: 0.38, color: PAPER.teal, spin: 0.45 },
      { y: 4.70, r: 1.08, h: 1.40, taper: 0.30, color: PAPER.tealL, spin: 0.9 },
    ],
    cones: [{ y: 5.80, r: 0.72, h: 1.80, color: PAPER.white, spin: 1.3 }],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.02, tone: [1.00, 1.00, 1.00] },
      { s: 1.15, wide: 0.94, tall: 1.10, lean: 0.01, tone: [0.96, 1.00, 1.02] },
      { s: 0.90, wide: 1.06, tall: 0.95, lean: 0.04, tone: [1.04, 1.01, 0.97] },
      { s: 1.08, wide: 1.00, tall: 1.04, lean: 0.02, tone: [0.99, 1.03, 1.03] },
    ],
  },
  blossom: {
    trunk: { color: PAPER.sand, shade: 0.90, rTop: 0.24, rBot: 0.34, h: 3.2, sides: 7 },
    collider: 0.40,
    slabs: [
      { y: 2.95, r: 1.85, h: 0.62, taper: 0.80, color: PAPER.rose, spin: 0.0 },
      { y: 3.80, r: 1.65, h: 0.56, taper: 0.76, color: PAPER.white, spin: 0.5 },
      { y: 4.60, r: 1.15, h: 0.50, taper: 0.60, color: PAPER.peach, spin: 1.0 },
      { y: 5.25, r: 0.62, h: 0.44, taper: 0.50, color: PAPER.rose, spin: 1.5 },
    ],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.05, tone: [1.00, 1.00, 1.00] },
      { s: 1.16, wide: 1.05, tall: 0.98, lean: 0.07, tone: [1.02, 0.96, 0.98] },
      { s: 0.90, wide: 0.94, tall: 1.10, lean: 0.09, tone: [0.97, 1.00, 1.03] },
      { s: 1.08, wide: 0.98, tall: 1.04, lean: 0.04, tone: [1.03, 1.01, 0.96] },
    ],
  },
  ember: {
    trunk: { color: PAPER.coralD, shade: 0.80, rTop: 0.26, rBot: 0.38, h: 3.6, sides: 7 },
    collider: 0.46,
    slabs: [
      { y: 3.30, r: 2.15, h: 0.66, taper: 0.78, color: PAPER.coralD, spin: 0.0 },
      { y: 4.25, r: 1.85, h: 0.60, taper: 0.74, color: PAPER.coral, spin: 0.45 },
      { y: 5.15, r: 1.30, h: 0.54, taper: 0.60, color: PAPER.gold, spin: 0.9 },
      { y: 5.95, r: 0.78, h: 0.46, taper: 0.50, color: PAPER.gold, spin: 1.35 },
    ],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.04, tone: [1.00, 1.00, 1.00] },
      { s: 1.16, wide: 1.06, tall: 0.98, lean: 0.06, tone: [1.03, 0.98, 0.94] },
      { s: 0.90, wide: 0.92, tall: 1.10, lean: 0.09, tone: [0.96, 0.99, 1.00] },
      { s: 1.06, wide: 0.96, tall: 1.04, lean: 0.03, tone: [1.01, 1.02, 0.97] },
    ],
  },
  willow: {
    trunk: { color: PAPER.sand, shade: 0.92, rTop: 0.22, rBot: 0.36, h: 4.6, sides: 7 },
    // The hanging curtain skirt is the willow's visible body at ground level;
    // its collider is that skirt, not the pole hidden inside it — this was the
    // species you could walk clean through.
    collider: 0.85,
    slabs: [
      { y: 4.95, r: 2.30, h: 0.78, taper: 0.52, color: PAPER.forestL, spin: 0.0 },
      { y: 5.60, r: 1.40, h: 0.56, taper: 0.44, color: PAPER.leaf, spin: 0.6 },
    ],
    // Weeping curtains: tapered plies hung from the crown rim, wide end up.
    // tilt 2.7 hangs them near-vertically (a real weeping willow) so their
    // tips stop just above head height instead of curtaining the hero's face.
    droops: {
      count: 9, attachR: 1.80, attachY: 4.85, len: 3.2, tilt: 2.7,
      rTop: 0.11, rBot: 0.38, sides: 5,
      colors: [PAPER.forest, PAPER.leaf, PAPER.forestL],
    },
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.05, tone: [1.00, 1.00, 1.00] },
      { s: 1.15, wide: 1.05, tall: 1.05, lean: 0.03, tone: [0.95, 1.00, 0.95] },
      { s: 0.92, wide: 0.95, tall: 0.98, lean: 0.09, tone: [1.05, 1.00, 0.94] },
      { s: 1.06, wide: 1.00, tall: 1.08, lean: 0.06, tone: [0.98, 1.01, 1.02] },
    ],
  },
  umbrella: {
    // Reworked from the flat-parasol-on-a-pole that NAMED the "umbrella" bug
    // into a stone-pine silhouette: long bare trunk, high stacked crown that
    // is still wider at its base than its top but now clearly a TREE.
    trunk: { color: PAPER.sand, shade: 0.88, rTop: 0.26, rBot: 0.40, h: 5.0, sides: 7 },
    collider: 0.50,
    slabs: [
      { y: 5.05, r: 2.55, h: 0.72, taper: 0.86, color: PAPER.forest, spin: 0.0 },
      { y: 5.85, r: 2.00, h: 0.60, taper: 0.78, color: PAPER.forestL, spin: 0.5 },
      { y: 6.50, r: 1.25, h: 0.52, taper: 0.66, color: PAPER.leaf, spin: 1.0 },
    ],
    variants: [
      { s: 1.00, wide: 1.00, tall: 1.00, lean: 0.06, tone: [1.00, 1.00, 1.00] },
      { s: 1.16, wide: 1.05, tall: 0.98, lean: 0.09, tone: [0.95, 0.99, 0.94] },
      { s: 0.90, wide: 0.94, tall: 1.08, lean: 0.11, tone: [1.05, 1.00, 0.93] },
      { s: 1.08, wide: 1.02, tall: 1.02, lean: 0.04, tone: [0.98, 1.02, 1.01] },
    ],
  },
};

export const TREE_SPECIES_NAMES = Object.keys(TREE_SPECIES);

/**
 * Widest crown radius each species presents at unit scale, measured off its own
 * slab/cone/droop table rather than typed in — so a species retuned above can
 * never quietly fall out of step with the spacing rule below it.
 */
const SPECIES_CROWN = Object.fromEntries(TREE_SPECIES_NAMES.map((name) => {
  const spec = TREE_SPECIES[name];
  let r = spec.trunk.rBot;
  for (const sl of spec.slabs || []) r = Math.max(r, sl.r);
  for (const c of spec.cones || []) r = Math.max(r, c.r);
  if (spec.droops) r = Math.max(r, spec.droops.attachR + Math.sin(spec.droops.tilt) * spec.droops.len * 0.5);
  return [name, r];
}));
const MAX_CROWN = Math.max(...Object.values(SPECIES_CROWN));

/**
 * Resolve one placed item into its variant and its final lateral/vertical
 * scale. Called TWICE — once during the scatter (to know how much room the
 * crown needs) and once when the instance matrix is written — so it has to be
 * a pure function of the item's four random draws, and both callers have to go
 * through it or the spacing stops matching the geometry.
 *
 * The per-instance band is deliberately wide: ±45% on top of a variant table
 * that already spans 0.78-1.30. A stand of trees whose crowns all land within
 * a few percent of one height reads as a flat band of equal domes — the exact
 * note the art directors wrote against the canopy line — and no amount of
 * silhouette variety in the species table fixes it, because the SKYLINE is one
 * curve regardless of what is under it.
 */
function treeScale(spec, it, hero) {
  const nv = spec.variants.length;
  const v = spec.variants[Math.floor(it.b * nv) % nv];
  // The band's FLOOR is the load-bearing number: it used to be 0.78x on top of
  // 0.78x variants, which put most placed trees at 1.2-1.6x the hero — the
  // "mushroom field" defect. 0.88 x a 0.90 variant keeps the smallest tree at
  // ~3x hero height while the ceiling still buys real skyline variety.
  const s = v.s * (0.88 + it.c * 0.42) * (hero ? 1.45 : 1);
  return { v, sx: s * v.wide * (0.94 + it.d * 0.13), sy: s * v.tall * (0.96 + it.a * 0.16) };
}

/** One papercut tree, absolute PAPER colours, merged into a single buffer. */
function buildTreeGeo(spec) {
  const s = sink();
  const t = spec.trunk;
  stamp(s, new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, t.sides),
    trs(0, t.h / 2, 0), lin(t.color, t.shade));
  for (const sl of spec.slabs || []) {
    stamp(s, new THREE.CylinderGeometry(sl.r * sl.taper, sl.r, sl.h, t.sides),
      trs(0, sl.y, 0, 0, sl.spin, 0), lin(sl.color));
  }
  for (const c of spec.cones || []) {
    stamp(s, new THREE.ConeGeometry(c.r, c.h, t.sides),
      trs(0, c.y + c.h / 2, 0, 0, c.spin, 0), lin(c.color));
  }
  const d = spec.droops;
  if (d) {
    const dirY = Math.cos(d.tilt), dirR = Math.sin(d.tilt);
    for (let k = 0; k < d.count; k++) {
      const a = (k / d.count) * TAU + 0.31;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Hang each curtain from the crown rim: walk half its length down the
      // tilted axis so the wide end meets the canopy instead of floating.
      const cx = ca * d.attachR + ca * dirR * d.len * 0.5;
      const cz = sa * d.attachR + sa * dirR * d.len * 0.5;
      const cy = d.attachY + dirY * d.len * 0.5;
      stamp(s, new THREE.CylinderGeometry(d.rTop, d.rBot, d.len, d.sides),
        leanM(cx, cy, cz, a, d.tilt), lin(d.colors[k % d.colors.length]));
    }
  }
  return bake(s);
}

/**
 * The garden landmark. Not instanced, not repeated, deliberately 3x the mass
 * of anything around it: the spawn vista needs ONE object in the middle
 * distance that establishes the scale of everything behind it, and a field of
 * identical 5 m trees cannot do that job.
 */
function buildLandmarkTreeGeo() {
  const s = sink();
  // Buttress roots, so a 14 m tree meets the ground instead of stopping at it.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4;
    stamp(s, new THREE.CylinderGeometry(0.30, 0.72, 1.9, 5),
      leanM(Math.cos(a) * 0.72, 0.72, Math.sin(a) * 0.72, a, 0.42), lin(PAPER.sand, 0.80));
  }
  stamp(s, new THREE.CylinderGeometry(0.72, 1.28, 5.4, 9), trs(0, 2.7, 0), lin(PAPER.sand, 0.88));
  // Two boughs reaching out of the trunk break the lathe-turned read.
  for (const [a, tl] of [[0.9, 0.85], [3.7, 0.72]]) {
    stamp(s, new THREE.CylinderGeometry(0.22, 0.46, 3.4, 6),
      leanM(Math.cos(a) * 1.25, 5.1, Math.sin(a) * 1.25, a, tl), lin(PAPER.sand, 0.84));
  }
  const canopy = [
    { y: 5.9, r: 7.6, h: 1.30, taper: 0.86, color: PAPER.forestD, spin: 0.0 },
    { y: 7.3, r: 8.3, h: 1.20, taper: 0.90, color: PAPER.forest, spin: 0.42 },
    { y: 8.7, r: 7.2, h: 1.10, taper: 0.84, color: PAPER.forestL, spin: 0.84 },
    { y: 10.0, r: 5.5, h: 1.00, taper: 0.74, color: PAPER.leaf, spin: 1.26 },
    { y: 11.1, r: 3.5, h: 0.90, taper: 0.60, color: PAPER.leaf, spin: 1.68 },
    { y: 12.0, r: 1.9, h: 0.80, taper: 0.44, color: PAPER.sage, spin: 2.1 },
  ];
  for (const c of canopy) {
    stamp(s, new THREE.CylinderGeometry(c.r * c.taper, c.r, c.h, 11),
      trs(0, c.y, 0, 0, c.spin, 0), lin(c.color));
  }
  // Blossom clusters caught in the canopy — this is the tree the petals fall
  // from, so the source has to be visible in the silhouette.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.7;
    const rr = 4.4 + (k % 3) * 1.3;
    const yy = 6.6 + (k % 4) * 1.35;
    stamp(s, new THREE.CylinderGeometry(0.62, 0.86, 0.46, 6),
      trs(Math.cos(a) * rr, yy, Math.sin(a) * rr, 0, a, 0),
      lin(k % 3 === 0 ? PAPER.white : (k % 3 === 1 ? PAPER.rose : PAPER.peach)));
  }
  return bake(s);
}

// ═══════════════════════════════════════════════════════════════════════
// Biome flora tables
// ═══════════════════════════════════════════════════════════════════════
//
// `cover` and `trees` are ATTEMPTS — water, slope, clearing and min-distance
// rejections trim them, and the realised totals are what stats reports.
// `mix` entries are [archetype, weight]; weights are normalised at build.
// `grove` is the fraction of samples that land inside a cluster rather than
// uniformly, i.e. how thicket-y the biome is.

// `rock` is the scree/boulder budget for the biome's STEEP ground, and `stone`
// is the pair of PAPER colours that ground is cut from — a cliff wears its own
// rock, not a recolour of the meadow next door.
//
// Every `treeMix` carries 3-4 species now. Two-species regions were producing
// canopy lines built from one silhouette repeated: broadleaf+conifer across a
// whole frame is not a forest, it is a texture.

const BIOME_FLORA = {
  garden: {
    trees: 145, treeMix: [['broadleaf', 0.34], ['willow', 0.16], ['blossom', 0.18], ['umbrella', 0.12], ['conifer', 0.10], ['ember', 0.10]],
    cover: 19000, mix: [['tuft', 0.38], ['clover', 0.19], ['fern', 0.18], ['bloom', 0.13], ['dock', 0.12]],
    rock: 900, stone: [PAPER.sand, PAPER.creamD],
    tintA: PAPER.leaf, tintB: PAPER.forestL,
    petals: [PAPER.white, PAPER.rose, PAPER.gold],
    grove: 0.74, clusters: 16, glades: 6, hero: 2,
  },
  meadow: {
    trees: 70, treeMix: [['blossom', 0.38], ['broadleaf', 0.28], ['willow', 0.18], ['umbrella', 0.16]],
    cover: 14000, mix: [['tuft', 0.34], ['bloom', 0.21], ['clover', 0.16], ['petal', 0.16], ['dock', 0.13]],
    rock: 500, stone: [PAPER.sand, PAPER.creamD],
    tintA: PAPER.sageD, tintB: PAPER.leaf,
    petals: [PAPER.rose, PAPER.white, PAPER.lavender],
    grove: 0.66, clusters: 12, glades: 5, hero: 1,
  },
  tidepool: {
    trees: 62, treeMix: [['umbrella', 0.36], ['broadleaf', 0.28], ['willow', 0.18], ['blossom', 0.18]],
    cover: 10500, mix: [['tuft', 0.38], ['reed', 0.26], ['pebble', 0.22], ['dock', 0.14]],
    rock: 1100, stone: [PAPER.sand, PAPER.creamD],
    tintA: PAPER.leaf, tintB: PAPER.sage,
    petals: [PAPER.white, PAPER.tealL],
    grove: 0.7, clusters: 11, glades: 4, hero: 0,
  },
  sky: {
    trees: 56, treeMix: [['conifer', 0.50], ['frostpine', 0.22], ['broadleaf', 0.16], ['umbrella', 0.12]],
    cover: 8000, mix: [['tuft', 0.44], ['pebble', 0.22], ['shrub', 0.22], ['dock', 0.12]],
    // The cliff biome, so the biggest rock budget on the island: this is the
    // frame that was 80% one grey albedo with tufts glued to a vertical face.
    rock: 3200, stone: [PAPER.creamD, PAPER.sand],
    tintA: PAPER.sage, tintB: PAPER.sageD,
    petals: [PAPER.white, PAPER.sky],
    grove: 0.72, clusters: 10, glades: 5, hero: 0,
  },
  ember: {
    trees: 82, treeMix: [['ember', 0.46], ['conifer', 0.22], ['umbrella', 0.16], ['broadleaf', 0.16]],
    cover: 8000, mix: [['tuft', 0.36], ['reed', 0.26], ['shrub', 0.24], ['dock', 0.14]],
    rock: 2400, stone: [PAPER.coralD, PAPER.sand],
    tintA: PAPER.sageD, tintB: PAPER.sage,
    petals: [PAPER.orange, PAPER.gold],
    grove: 0.78, clusters: 12, glades: 5, hero: 0,
  },
  frost: {
    trees: 36, treeMix: [['frostpine', 0.58], ['conifer', 0.20], ['broadleaf', 0.12], ['blossom', 0.10]],
    cover: 5000, mix: [['tuft', 0.44], ['pebble', 0.26], ['shrub', 0.18], ['dock', 0.12]],
    rock: 1600, stone: [PAPER.creamD, PAPER.white],
    tintA: PAPER.tealL, tintB: PAPER.sage,
    petals: [PAPER.white, PAPER.sky],
    grove: 0.8, clusters: 8, glades: 6, hero: 0,
  },
  crystal: {
    trees: 62, treeMix: [['frostpine', 0.36], ['blossom', 0.28], ['conifer', 0.20], ['willow', 0.16]],
    cover: 8000, mix: [['tuft', 0.38], ['bloom', 0.26], ['pebble', 0.22], ['dock', 0.14]],
    rock: 2600, stone: [PAPER.lavenderD, PAPER.creamD],
    tintA: PAPER.sage, tintB: PAPER.tealL,
    petals: [PAPER.lavender, PAPER.white],
    grove: 0.76, clusters: 10, glades: 5, hero: 1,
  },
  market: {
    trees: 22, treeMix: [['broadleaf', 0.40], ['umbrella', 0.32], ['blossom', 0.16], ['ember', 0.12]],
    cover: 4200, mix: [['tuft', 0.42], ['clover', 0.24], ['pebble', 0.20], ['dock', 0.14]],
    rock: 700, stone: [PAPER.sand, PAPER.creamD],
    tintA: PAPER.sageD, tintB: PAPER.sage,
    petals: [PAPER.gold, PAPER.peach],
    grove: 0.5, clusters: 7, glades: 6, hero: 0,
  },
  library: {
    trees: 84, treeMix: [['broadleaf', 0.34], ['conifer', 0.24], ['umbrella', 0.20], ['willow', 0.12], ['blossom', 0.10]],
    cover: 8800, mix: [['tuft', 0.36], ['fern', 0.28], ['shrub', 0.22], ['dock', 0.14]],
    rock: 2200, stone: [PAPER.sand, PAPER.creamD],
    tintA: PAPER.sageD, tintB: PAPER.forestL,
    petals: [PAPER.cream, PAPER.gold],
    grove: 0.76, clusters: 11, glades: 5, hero: 0,
  },
  palace: {
    trees: 44, treeMix: [['blossom', 0.48], ['conifer', 0.20], ['broadleaf', 0.16], ['frostpine', 0.16]],
    cover: 10000, mix: [['tuft', 0.36], ['clover', 0.21], ['bloom', 0.18], ['petal', 0.13], ['dock', 0.12]],
    rock: 2600, stone: [PAPER.lavenderD, PAPER.sand],
    tintA: PAPER.leaf, tintB: PAPER.sage,
    petals: [PAPER.gold, PAPER.white, PAPER.lavender],
    grove: 0.42, clusters: 9, glades: 4, formal: true, hero: 2,
  },
};

/** Landmark tree: garden, mid-ground of the spawn vista, west of the axis. */
const LANDMARK = { x: -18, z: 126, clearTree: 13, clearPlant: 5.5, petals: 260, petalTop: 13.5, petalSpread: 7.2 };

// ═══════════════════════════════════════════════════════════════════════
// Scatter
// ═══════════════════════════════════════════════════════════════════════

/** Normalise a [name, weight] mix into a cumulative table. */
function cumulative(mix) {
  let total = 0;
  for (const m of mix) total += m[1];
  const names = [], cdf = [];
  let acc = 0;
  for (const m of mix) { acc += m[1] / total; names.push(m[0]); cdf.push(acc); }
  cdf[cdf.length - 1] = 1;
  return { names, cdf };
}

function pick(table, u) {
  const { names, cdf } = table;
  for (let i = 0; i < cdf.length; i++) if (u <= cdf[i]) return names[i];
  return names[names.length - 1];
}

/**
 * Blob centres a field concentrates into, and the clearings it avoids.
 *
 * `tone` is the load-bearing addition. Every instance drawn from a blob
 * inherits it, so a patch of ground cover shares a tint the patch beside it
 * does not — which is the difference between "grass with per-instance jitter"
 * (still one flat field, because independent jitter averages out over any area
 * bigger than a plant) and "a plant community" (patches you can point at).
 * Independent noise cannot buy this: variation has to be CORRELATED over metres
 * before the eye reads it as a place rather than as dither.
 */
function makeBlobs(rng, cx, cz, R, n, rMin, rMax) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const r = R * 0.86 * Math.sqrt(rng());
    out.push({
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
      r: R * (rMin + rng() * (rMax - rMin)), w: 0.55 + rng(),
      tone: rng(), hue: rng(),
    });
  }
  return out;
}

// ── Shared occupancy grid ───────────────────────────────────────────────
//
// ONE grid for every tree pass on the island, not one per call. Trees used to
// be placed by independent passes that did not share an occupancy structure,
// so crowns from two different scatters (and from two neighbouring biomes,
// whose discs overlap) cut straight through each other. A single grid, keyed
// on world position and holding each trunk's own crown radius, makes that
// structurally impossible.
//
// `cell` must be at least twice the largest exclusion radius, because the
// lookup only walks the 3x3 neighbourhood: a pair whose radii sum to 2*rMax
// can be two cells apart at most, and 3x3 covers exactly that.

function makeGapGrid(rMax) {
  return { cells: new Map(), cell: Math.max(1, rMax * 2) };
}

/** Test (x,z,r) against the grid; INSERTS and returns true when it fits. */
function gapTake(G, x, z, r) {
  const ci = Math.floor(x / G.cell), cj = Math.floor(z / G.cell);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const b = G.cells.get((cj + dj) * 4093 + (ci + di));
      if (!b) continue;
      for (let k = 0; k < b.length; k += 3) {
        const dx = x - b[k], dz = z - b[k + 1], rr = r + b[k + 2];
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
  }
  const key = cj * 4093 + ci;
  let b = G.cells.get(key);
  if (!b) { b = []; G.cells.set(key, b); }
  b.push(x, z, r);
  return true;
}

/**
 * Clustered rejection sampler.
 *
 * A candidate is drawn either from inside one of `clusters` (weighted, with a
 * radius^0.7 profile so blobs are dense in the middle and feather at the edge)
 * or uniformly over the biome disc. `glades` then punch it back out. Height,
 * slope, authored clearings and — for trees — a min-distance spatial hash do
 * the rest of the filtering.
 *
 * Rejections are answered from the cached height grid; only survivors pay for
 * an exact sampleHeight. `out` is appended in place.
 */
function scatterField(rng, o) {
  const {
    cx, cz, R, count, minH, slopeNy, slopeSoft = 0, slopeMaxNy = 2,
    clearings, clusters, glades, grove, grid, sampleHeight, out,
    gap = null, gapRadius = null, weight = null,
  } = o;
  // Six, not five: the weighting field below rejects on purpose, and a sampler
  // that runs out of tries before it runs out of budget silently under-fills
  // exactly the wet, sheltered ground the weight was written to favour.
  const maxTries = count * 6 + 512;
  let placed = 0;

  for (let t = 0; t < maxTries && placed < count; t++) {
    let x, z, blob = null;
    if (clusters.length && rng() < grove) {
      // Weighted blob pick, then a concentrated radial sample inside it.
      let u = rng() * clusters.length;
      blob = clusters[Math.min(clusters.length - 1, Math.floor(u))];
      u = rng();
      if (u > blob.w * 0.62) continue;           // per-blob density weighting
      const a = rng() * TAU;
      const r = blob.r * Math.pow(rng(), 0.7);
      x = blob.x + Math.cos(a) * r;
      z = blob.z + Math.sin(a) * r;
      const dx0 = x - cx, dz0 = z - cz;
      if (dx0 * dx0 + dz0 * dz0 > R * R) continue;
    } else {
      const a = rng() * TAU;
      const r = R * Math.sqrt(rng());
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
    }

    let blocked = false;
    for (let i = 0; i < glades.length; i++) {
      const gl = glades[i];
      const dx = x - gl.x, dz = z - gl.z;
      if (dx * dx + dz * dz < gl.r * gl.r) { blocked = true; break; }
    }
    if (blocked) continue;
    for (let i = 0; i < clearings.length; i += 3) {
      const dx = x - clearings[i], dz = z - clearings[i + 1];
      const cr = clearings[i + 2];
      if (dx * dx + dz * dz < cr * cr) { blocked = true; break; }
    }
    if (blocked) continue;

    // Cheap gates first, off the cached grid.
    const hg = gridAt(grid, x, z);
    if (hg <= minH + 0.15) continue;
    const gx = _gx, gz = _gz;
    const ny = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    if (ny < slopeNy || ny > slopeMaxNy) continue;
    // Soft band above the limit: thin out toward it rather than stopping at a
    // contour line. This is what turns the slope gate into a treeline.
    if (slopeSoft > 0 && ny < slopeNy + slopeSoft
      && rng() * slopeSoft > ny - slopeNy) continue;

    // Landform weighting (moisture, curvature, altitude). Runs AFTER the cheap
    // gates and BEFORE anything that allocates: this sampler throws away far
    // more candidates than it keeps, so a rejected candidate must not have cost
    // an object. Hence the positional signature rather than an item record.
    if (weight && rng() >= weight(x, z, hg, ny, gx, gz)) continue;

    const it = {
      x, y: hg, z, gx, gz, ny, h: hg,
      a: rng(), b: rng(), c: rng(), d: rng(),
      // Every item carries its patch's tone even when it was drawn uniformly:
      // 0.5 is "no patch", which lands mid-range and reads as the field's
      // baseline between the patches.
      tone: blob ? blob.tone : 0.5,
      hue: blob ? blob.hue : 0.5,
    };

    // Crown-aware spacing, against the island-wide grid.
    if (gap && !gapTake(gap, x, z, gapRadius ? gapRadius(it) : 1)) continue;

    // Survivor: pay for the exact height so nothing floats or sinks.
    const h = sampleHeight(x, z);
    if (h <= minH) continue;
    it.y = h;
    it.h = h;
    out.push(it);
    placed++;
  }
  return placed;
}

/** Even rings with a small jitter — order and rhythm, not scatter. */
function formalRings(rng, o) {
  const {
    cx, cz, R, count, minH, slopeNy, clearings, grid, sampleHeight, out,
    gap = null, gapRadius = null, weight = null,
  } = o;
  const rings = [R * 0.55, R * 0.82];
  const per = Math.ceil(count / rings.length);
  let placed = 0;
  for (let ri = 0; ri < rings.length && placed < count; ri++) {
    for (let k = 0; k < per && placed < count; k++) {
      const a = (k / per) * TAU + ri * 0.32;
      const x = cx + Math.cos(a) * rings[ri] + (rng() - 0.5) * 3;
      const z = cz + Math.sin(a) * rings[ri] + (rng() - 0.5) * 3;
      let blocked = false;
      for (let i = 0; i < clearings.length; i += 3) {
        const dx = x - clearings[i], dz = z - clearings[i + 1];
        if (dx * dx + dz * dz < clearings[i + 2] * clearings[i + 2]) { blocked = true; break; }
      }
      if (blocked) continue;
      const hg = gridAt(grid, x, z);
      if (hg <= minH + 0.15) continue;
      const gx = _gx, gz = _gz;
      const ny = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      if (ny < slopeNy) continue;
      if (weight && rng() >= weight(x, z, hg, ny, gx, gz)) continue;
      const it = {
        x, y: hg, z, gx, gz, ny, h: hg,
        a: rng(), b: rng(), c: rng(), d: rng(), tone: 0.5, hue: 0.5,
      };
      if (gap && !gapTake(gap, x, z, gapRadius ? gapRadius(it) : 1)) continue;
      const h = sampleHeight(x, z);
      if (h <= minH) continue;
      it.y = h;
      it.h = h;
      out.push(it);
      placed++;
    }
  }
  return placed;
}

/** Fisher-Yates. Makes any PREFIX of a sector a uniform subset of it. */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

const cellIndex = (v) => {
  const i = Math.floor((v + WORLD.HALF) / COVER_CELL);
  return i < 0 ? 0 : (i > COVER_CELLS - 1 ? COVER_CELLS - 1 : i);
};

// ═══════════════════════════════════════════════════════════════════════
// createVegetation
// ═══════════════════════════════════════════════════════════════════════

/**
 * @param {{sampleHeight:Function, seed?:number}} heightfield
 * @param {{seed?:number, density?:number, castShadow?:boolean,
 *          treeClear?:number[], plantClear?:number[]}} [opts]
 *   treeClear / plantClear are flat [x, z, radius, ...] triples the caller has
 *   already reserved for landmarks (gates, buildings, the spawn apron).
 * @returns {{ group:THREE.Group, trees:Array<{x,y,z,r}>, stats:object,
 *             update:(simTime:number, playerPos:object)=>void, dispose:Function }}
 */
export function createVegetation(heightfield, opts = {}) {
  const { sampleHeight } = heightfield;
  const seed = (opts.seed ?? heightfield.seed ?? WORLD.SEED) | 0;
  const density = opts.density ?? 1;
  const castShadow = opts.castShadow !== false;
  const treeClear = opts.treeClear ? opts.treeClear.slice() : [];
  const plantClear = opts.plantClear ? opts.plantClear.slice() : [];

  const group = new THREE.Group();
  group.name = 'vegetation';
  const geometries = [];
  const materials = [];
  const track = (geo) => { geometries.push(geo); return geo; };
  const trackMat = (m) => { materials.push(m); return m; };

  // ── Materials ──────────────────────────────────────────────────────────
  // Four, and only four: foliage that sways as a canopy, ground cover that
  // ripples as a field, stone that does neither, and petals that fall. Every
  // sector and every species shares them, so the material count has no bearing
  // on the draw-call budget — mesh count does.
  const treeMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const plantMat = trackMat(toonMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  const rockMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const petalMat = trackMat(new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: true,
  }));
  const heroMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));

  patchPlantWind(treeMat, {
    base: 1.4, span: 3.6, amp: 0.26, lean: 0.5, speed: 0.40,
    flutter: 0.10, flutterSpeed: 1.9, gust: 0.5, gustLen: 92, gustSpeed: 12,
  });
  patchPlantWind(plantMat, {
    base: 0.02, span: 0.50, amp: 0.13, lean: 0.6, speed: 0.72,
    flutter: 0.22, flutterSpeed: 3.4, gust: 0.6, gustLen: 58, gustSpeed: 9,
  });
  patchPlantWind(heroMat, {
    base: 4.0, span: 9.0, amp: 0.46, lean: 0.45, speed: 0.31,
    flutter: 0.08, flutterSpeed: 1.5, gust: 0.45, gustLen: 110, gustSpeed: 13,
  });
  patchPetalFall(petalMat, {
    top: LANDMARK.petalTop, spread: 1.6, fall: 0.045, swirl: 1.2,
  });

  // Paper surface. Trees and stones are solid enough to carry the pressed
  // tooth; blades and petals are two-triangle scraps where a normal map would
  // only fight the toon ramp, so they take pigment grain alone on one top-down
  // projection (a single fetch across ~90 k instances).
  // `bleach` is the cheap directional read (see PAPERCUT_DEFAULTS): the top of
  // a canopy slab fades warm, its underside holds the palette's teal cavity.
  // On a stack of flat discs that is the whole difference between a tree and a
  // pile of coloured plates, and unlike lighting it survives into shadow — so
  // a tree on the shaded side of a hill still has a top and a bottom.
  applyPapercut(treeMat, { grain: 0.075, normal: 0.10, roughnessLike: 0.18, scale: 1.1, space: 'local', bleach: 0.30 });
  applyPapercut(heroMat, { grain: 0.08, normal: 0.11, roughnessLike: 0.19, scale: 2.4, space: 'local', bleach: 0.30 });
  applyPapercut(rockMat, { grain: 0.09, normal: 0.13, roughnessLike: 0.2, scale: 0.3, space: 'local', bleach: 0.26 });
  applyPapercut(plantMat, { grain: 0.07, normal: 0, roughnessLike: 0, scale: 0.7, triplanar: false, space: 'local' });
  applyPapercut(petalMat, { grain: 0.06, normal: 0, roughnessLike: 0, scale: 0.3, triplanar: false, space: 'local' });

  // Canopies must sway in the shadow map too, or the shadow tears off the tree.
  const treeDepthMat = trackMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  patchPlantWind(treeDepthMat, {
    base: 1.4, span: 3.6, amp: 0.26, lean: 0.5, speed: 0.40,
    flutter: 0.10, flutterSpeed: 1.9, gust: 0.5, gustLen: 92, gustSpeed: 12,
  });
  const heroDepthMat = trackMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  patchPlantWind(heroDepthMat, {
    base: 4.0, span: 9.0, amp: 0.46, lean: 0.45, speed: 0.31,
    flutter: 0.08, flutterSpeed: 1.5, gust: 0.45, gustLen: 110, gustSpeed: 13,
  });

  const matFor = { plant: plantMat, rock: rockMat };

  // ── Placement ──────────────────────────────────────────────────────────
  const rng = makeRng(seed ^ 0x5eed17);
  const grid = makeHeightGrid(sampleHeight);
  // Baked once — see makeCurvGrid. Every weighting field below reads it.
  const curv = makeCurvGrid(grid, 6);

  // The landmark reserves its own clearing before anything else is scattered.
  treeClear.push(LANDMARK.x, LANDMARK.z, LANDMARK.clearTree);
  plantClear.push(LANDMARK.x, LANDMARK.z, LANDMARK.clearPlant);

  /** @type {Record<string, Array>} */
  const treeItems = {};
  for (const name of TREE_SPECIES_NAMES) treeItems[name] = [];
  /** @type {Map<string, Array>} */
  const coverBuckets = new Map();   // `${arch}|${cell}` -> items
  const heroTrees = [];             // blossom set-pieces that shed petals

  const SANDC = new THREE.Color().setHex(PAPER.sand, THREE.SRGBColorSpace);
  const PALEC = new THREE.Color().setHex(PAPER.creamD, THREE.SRGBColorSpace);
  let coverTotal = 0;
  const coverByArch = Object.fromEntries(ARCH_NAMES.map((k) => [k, 0]));

  // ONE occupancy grid for every tree on the island — see makeGapGrid. The
  // largest exclusion radius is the widest crown at the top of the (now much
  // wider) instance scale band.
  const treeGap = makeGapGrid(MAX_CROWN * 1.7 * CROWN_GAP_F);

  for (const biome of BIOMES) {
    const flora = BIOME_FLORA[biome.id];
    if (!flora) continue;
    const [cx, cz] = biome.center;
    const R = biome.radius;
    const treeTable = cumulative(flora.treeMix);

    // Species has to be resolved DURING the scatter, not after it: the room a
    // tree needs is its own crown's, and a pass that spaces every trunk alike
    // either packs umbrellas into each other or wastes a whole biome's worth
    // of ground keeping saplings apart.
    const gapRadius = (it) => {
      const sp = pick(treeTable, it.a);
      const spec = TREE_SPECIES[sp];
      return SPECIES_CROWN[sp] * treeScale(spec, it, false).sx * CROWN_GAP_F;
    };

    /**
     * Where trees can grow, as a probability.
     *
     * Two terms, both of them scale cues the world had none of:
     *   TREELINE  a moisture-jittered altitude above which the stand thins and
     *             then stops. Nothing tells a player how tall a mesa is like a
     *             band of trees that gives up part-way up it.
     *   SHELTER   concave ground (gullies, benches, the lee of a ridge) gets a
     *             real bonus, convex noses get penalised. Trees collect where
     *             water and soil do.
     */
    const treeWeight = (x, z, h) => {
      const m = moistureAt(x, z, seed ^ 0x4d15);
      const line = 20 + m * 20;
      const alt = 1 - smoothstep(line - 5, line + 7, h);
      const shelter = 1 + Math.max(-0.55, Math.min(0.9, curvAt(curv, x, z) * 260));
      return (0.30 + 0.85 * m) * alt * shelter;
    };

    // ---- trees ----
    const nTrees = Math.round(flora.trees * density);
    const raw = [];
    const treeGlades = makeBlobs(rng, cx, cz, R, flora.glades, 0.10, 0.19);
    if (flora.formal) {
      formalRings(rng, {
        cx, cz, R, count: nTrees, minH: TREE_MIN_H, slopeNy: TREE_SLOPE_NY,
        clearings: treeClear, grid, sampleHeight, out: raw,
        gap: treeGap, gapRadius,
      });
    } else {
      scatterField(rng, {
        cx, cz, R: R * 0.94, count: nTrees, minH: TREE_MIN_H,
        slopeNy: TREE_SLOPE_NY, slopeSoft: TREE_SLOPE_SOFT,
        clearings: treeClear, clusters: makeBlobs(rng, cx, cz, R, flora.clusters, 0.09, 0.17),
        glades: treeGlades, grove: flora.grove, grid, sampleHeight,
        gap: treeGap, gapRadius, weight: treeWeight, out: raw,
      });
    }
    for (const it of raw) {
      const sp = pick(treeTable, it.a);
      it.species = sp;
      treeItems[sp].push(it);
    }
    // Hero blossoms: the biggest, most spread-out blossom trees in the biome
    // get scaled up and given a petal fall. Chosen by stride rather than at
    // random so they never clump.
    if (flora.hero > 0) {
      const pool = raw.filter((it) => it.species === 'blossom' || it.species === 'willow');
      const stride = Math.max(1, Math.floor(pool.length / (flora.hero + 1)));
      for (let k = 1; k <= flora.hero && k * stride < pool.length; k++) {
        const it = pool[k * stride];
        it.hero = true;
        heroTrees.push({ x: it.x, y: it.y, z: it.z, petals: 150, top: 7.4, spread: 3.4, hues: flora.petals });
      }
    }

    // ---- ground cover ----
    //
    // Pass 1 seeds the patch centres (makeBlobs, each carrying its own tone and
    // hue); pass 2 is the scatter, which now also asks the LANDFORM whether a
    // plant belongs where it landed. Moisture is the spine of it: wet hollows
    // fill, dry exposed convex ground goes sparse, and the boundary between
    // the two is soft and metres wide, which is what a plant community looks
    // like from a distance.
    const coverWeight = (x, z, h, ny, gx, gz) => {
      const m = moistureAt(x, z, seed ^ 0x4d15);
      const cv = Math.max(-0.5, Math.min(0.85, curvAt(curv, x, z) * 300));
      const exposure = Math.min(1, Math.hypot(gx, gz) * 1.15);
      return (0.34 + 0.86 * m) * (1 + cv) * (1 - 0.45 * exposure);
    };
    const cover = [];
    scatterField(rng, {
      cx, cz, R, count: Math.round(flora.cover * density), minH: PLANT_MIN_H,
      slopeNy: MAX_SLOPE_NY, slopeSoft: COVER_SLOPE_SOFT, clearings: plantClear,
      clusters: makeBlobs(rng, cx, cz, R, flora.clusters + 6, 0.12, 0.26),
      glades: makeBlobs(rng, cx, cz, R, flora.glades, 0.07, 0.14),
      grove: flora.grove * 0.86, grid, sampleHeight, weight: coverWeight, out: cover,
    });

    // ---- scree and boulders ----
    //
    // The ground the plants just gave up. A cliff with nothing on it is one
    // albedo across 80% of frame; a cliff with talus on it has scale, because
    // a boulder is a thing whose size a five-year-old already knows. Placement
    // is the inverse of the plant rule — steeper is BETTER — with a convexity
    // bonus so stones gather at slope breaks and at the foot of a face, the
    // way talus actually accumulates.
    const rockWeight = (x, z, h, ny) => {
      const steep = smoothstep(ROCK_MAX_NY, 0.62, ny);         // 0 flat -> 1 steep
      const cv = Math.max(-0.6, Math.min(1.0, curvAt(curv, x, z) * 320));
      return 0.18 + 0.72 * steep + 0.34 * Math.max(0, cv);
    };
    if (flora.rock) {
      const rocks = [];
      scatterField(rng, {
        cx, cz, R: R * 1.04, count: Math.round(flora.rock * density), minH: PLANT_MIN_H,
        slopeNy: ROCK_MIN_NY, slopeMaxNy: ROCK_MAX_NY, clearings: plantClear,
        clusters: makeBlobs(rng, cx, cz, R, flora.clusters + 3, 0.08, 0.20),
        glades: [], grove: 0.62, grid, sampleHeight, weight: rockWeight, out: rocks,
      });
      for (const it of rocks) { it.rockPass = true; cover.push(it); }
      rocks.length = 0;
    }

    const coverTable = cumulative(flora.mix);
    for (let i = 0; i < cover.length; i++) {
      const it = cover[i];
      // Shore-ness and dryness drive BOTH the species and the tint, which is
      // what makes a beach read as a beach rather than as green grass that
      // happens to be near water.
      const shore = 1 - smoothstep(1.3, 8.5, it.y);
      const slope = Math.sqrt(it.gx * it.gx + it.gz * it.gz);
      const dry = Math.min(1, slope * 0.8);
      const moist = moistureAt(it.x, it.z, seed ^ 0x4d15);
      let arch;
      if (it.rockPass) {
        // Three size tiers out of two geometries: chips dominate, boulders are
        // the punctuation, and the instance scale band inside each archetype
        // does the rest.
        arch = it.b < 0.74 ? 'scree' : 'boulder';
      } else {
        arch = pick(coverTable, it.b);
        if (shore > 0.6 && (arch === 'fern' || arch === 'clover' || arch === 'bloom' || arch === 'dock')) {
          arch = it.c < 0.5 ? 'reed' : 'pebble';
        } else if (dry > 0.7 && arch === 'fern') {
          arch = 'tuft';
        } else if (moist < 0.34 && (arch === 'fern' || arch === 'dock')) {
          // Broad soft leaves do not grow on dry ground. Swapping the SPECIES
          // on the moisture field (not just the tint) is what makes the field
          // change character across the biome instead of merely changing hue.
          arch = it.c < 0.42 ? 'tuft' : 'shrub';
        }
      }

      let col;
      if (ROCK_ARCH.has(arch)) {
        const st = flora.stone || [PAPER.sand, PAPER.creamD];
        col = mixHex(st[0], st[1], patchNoise(it.x * 0.06, it.z * 0.06, seed ^ 0x9a1));
      } else if (BLOOM_ARCH.has(arch)) {
        const hues = flora.petals;
        col = mixHex(hues[Math.floor(it.d * hues.length) % hues.length], PAPER.white, it.a * 0.22);
      } else {
        // Moisture picks the green, the patch's own hue draw nudges it, and
        // only then does the fine noise ride on top. Patch first: correlated
        // variation is the thing the eye can actually see.
        col = mixHex(flora.tintA, flora.tintB,
          Math.min(1, Math.max(0, moist * 0.62 + it.hue * 0.26
            + patchNoise(it.x * 0.042, it.z * 0.042, seed ^ 0x51) * 0.30 - 0.09)));
        if (shore > 0) col.lerp(SANDC, shore * 0.62);
        if (dry > 0) col.lerp(PALEC, dry * 0.24);
        if (moist < 0.5) col.lerp(PALEC, (0.5 - moist) * 0.44);
      }
      // Three scales of tonal variation now: the PATCH (correlated over tens of
      // metres — the one that reads), a 6 m noise, and the per-instance jitter.
      col.multiplyScalar((0.88 + it.tone * 0.22)
        * (0.88 + it.c * 0.24)
        * (0.94 + patchNoise(it.x * 0.17, it.z * 0.17, seed ^ 0x2f) * 0.13));
      it.arch = arch;
      it.r = col.r; it.g = col.g; it.bl = col.b;
      it.shore = shore;

      const key = `${arch}|${cellIndex(it.z) * COVER_CELLS + cellIndex(it.x)}`;
      let bucket = coverBuckets.get(key);
      if (!bucket) { bucket = []; coverBuckets.set(key, bucket); }
      bucket.push(it);
      coverByArch[arch]++;
      coverTotal++;
    }
    cover.length = 0;
  }

  // ── Meshes: trees ──────────────────────────────────────────────────────
  const _m4 = new THREE.Matrix4();
  const _v3 = new THREE.Vector3();
  const _q4 = new THREE.Quaternion();
  const _q5 = new THREE.Quaternion();
  const _s3 = new THREE.Vector3(1, 1, 1);
  const _ax = new THREE.Vector3();
  const _col = new THREE.Color();

  const trees = [];
  const treeMeshes = [];
  let treeCount = 0;
  for (const name of TREE_SPECIES_NAMES) {
    const items = treeItems[name];
    if (!items.length) continue;
    const spec = TREE_SPECIES[name];
    const geo = track(buildTreeGeo(spec));
    const im = new THREE.InstancedMesh(geo, treeMat, items.length);
    im.name = `trees-${name}`;
    items.forEach((it, i) => {
      // Same resolver the scatter's spacing rule used — see treeScale.
      const { v, sx, sy } = treeScale(spec, it, it.hero);
      // `r` is the COLLIDER the world registers, and it is the species' low
      // solid mass (trunk flare, willow skirt) — not the bare trunk-top
      // radius. See the PROPORTION LAW note above TREE_SPECIES.
      trees.push({
        x: it.x, y: it.y, z: it.z,
        r: (spec.collider ?? spec.trunk.rBot) * sx,
        species: name,
      });
      // Yaw, then a small lean about a random bearing: a forest of perfectly
      // vertical poles is the tell that nothing here grew.
      _q4.setFromAxisAngle(AXIS_Y, it.c * TAU);
      const dir = it.d * TAU;
      _ax.set(Math.sin(dir), 0, -Math.cos(dir));
      _q5.setFromAxisAngle(_ax, v.lean * (0.4 + it.a));
      _q4.multiply(_q5);
      _v3.set(it.x, it.y - 0.15, it.z);
      _s3.set(sx, sy, sx);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      // Near-neutral only: instanceColor multiplies the WHOLE tree, so a real
      // hue shift would drag the trunk with it.
      const t = v.tone, k = 0.93 + it.a * 0.13;
      im.setColorAt(i, _col.setRGB(t[0] * k, t[1] * k, t[2] * k, THREE.LinearSRGBColorSpace));
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = castShadow;
    im.receiveShadow = true;
    if (castShadow) im.customDepthMaterial = treeDepthMat;
    im.computeBoundingSphere();
    group.add(im);
    treeMeshes.push(im);
    treeCount += items.length;
  }

  // ── Mesh: the landmark tree ────────────────────────────────────────────
  // An InstancedMesh of one. It costs the same single draw call as a Mesh and
  // it inherits the instanced wind path (which reads instanceMatrix for its
  // world-space gust phase) instead of needing a second shader variant.
  const landY = sampleHeight(LANDMARK.x, LANDMARK.z);
  const landmark = new THREE.InstancedMesh(track(buildLandmarkTreeGeo()), heroMat, 1);
  landmark.name = 'landmark-tree';
  _q4.setFromAxisAngle(AXIS_Y, 0.7);
  _v3.set(LANDMARK.x, landY - 0.4, LANDMARK.z);
  _s3.set(1, 1, 1);
  _m4.compose(_v3, _q4, _s3);
  landmark.setMatrixAt(0, _m4);
  landmark.setColorAt(0, _col.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace));
  landmark.instanceMatrix.needsUpdate = true;
  if (landmark.instanceColor) landmark.instanceColor.needsUpdate = true;
  landmark.castShadow = castShadow;
  landmark.receiveShadow = true;
  if (castShadow) landmark.customDepthMaterial = heroDepthMat;
  landmark.computeBoundingSphere();
  group.add(landmark);
  trees.push({ x: LANDMARK.x, y: landY, z: LANDMARK.z, r: 1.5 });

  // ── Meshes: falling petals ─────────────────────────────────────────────
  // Grouped by CANOPY HEIGHT, not by tree. The fall height is a GLSL literal
  // (it never animates, and a literal lets the compiler fold the whole
  // expression), so each distinct height is one program, one geometry and one
  // material — and therefore one draw call for every hero tree that shares it.
  //
  // The alternative, one mesh per tree, buys per-tree frustum culling for six
  // swarms of ~150 two-triangle scraps. That trade is backwards: it spends five
  // draw calls out of the worst-case budget to save about two thousand
  // triangles, and the worst case is the number the scene budget is written
  // against.
  const petalMeshes = [];
  let petalCount = 0;
  const emitters = [
    { x: LANDMARK.x, y: landY, z: LANDMARK.z, petals: LANDMARK.petals,
      top: LANDMARK.petalTop, spread: LANDMARK.petalSpread,
      hues: [PAPER.white, PAPER.rose, PAPER.peach] },
    ...heroTrees,
  ];
  const petalGroups = new Map();
  for (const e of emitters) {
    let grp = petalGroups.get(e.top);
    if (!grp) { grp = []; petalGroups.set(e.top, grp); }
    grp.push(e);
  }
  for (const [top, group_] of petalGroups) {
    const counts = group_.map((e) => Math.max(8, Math.round(e.petals * density)));
    const total = counts.reduce((a, b) => a + b, 0);
    const geo = track(buildFlyingPetalGeo(top));
    let mat;
    if (top === LANDMARK.petalTop) {
      mat = petalMat;
    } else {
      mat = trackMat(new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, fog: true,
      }));
      patchPetalFall(mat, { top, spread: 1.1, fall: 0.06, swirl: 1.4 });
      applyPapercut(mat, { grain: 0.06, normal: 0, roughnessLike: 0, scale: 0.3, triplanar: false, space: 'local' });
    }
    const im = new THREE.InstancedMesh(geo, mat, total);
    im.name = `petal-fall-${Math.round(top * 10)}`;
    let w = 0;
    group_.forEach((e, gi) => {
      for (let i = 0; i < counts[gi]; i++, w++) {
        const a = rng() * TAU;
        const r = e.spread * Math.sqrt(rng());
        const px = e.x + Math.cos(a) * r;
        const pz = e.z + Math.sin(a) * r;
        _q4.setFromAxisAngle(AXIS_Y, rng() * TAU);
        _v3.set(px, sampleHeight(px, pz) + 0.1, pz);
        const sc = 0.8 + rng() * 0.7;
        _s3.set(sc, sc, sc);
        _m4.compose(_v3, _q4, _s3);
        im.setMatrixAt(w, _m4);
        im.setColorAt(w, _col.setHex(e.hues[i % e.hues.length], THREE.SRGBColorSpace)
          .multiplyScalar(0.94 + (i % 5) * 0.03));
      }
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    group.add(im);
    petalMeshes.push(im);
    petalCount += total;
  }

  // ── Meshes: ground cover ───────────────────────────────────────────────
  const coverGeos = {};
  /** @type {Array<{mesh:THREE.InstancedMesh,total:number,x0:number,z0:number,x1:number,z1:number}>} */
  const covers = [];
  for (const [key, bucket] of coverBuckets) {
    const arch = key.slice(0, key.indexOf('|'));
    const spec = GROUND_ARCHETYPES[arch];
    if (!coverGeos[arch]) coverGeos[arch] = track(spec.build());
    shuffle(bucket, rng);
    const im = new THREE.InstancedMesh(coverGeos[arch], matFor[spec.mat], bucket.length);
    im.name = `cover-${arch}`;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const isRock = ROCK_ARCH.has(arch);
    bucket.forEach((it, i) => {
      const sc = spec.s0 + it.d * spec.sv;
      _q4.setFromAxisAngle(AXIS_Y, it.a * TAU);
      // A stone lies ON the slope; a plant grows UP out of it. Boulders and
      // scree chips are laid into the surface normal (and bedded a little
      // deeper, so they sit in the ground rather than on it) — a boulder
      // standing bolt upright on a 40-degree face is the single most obvious
      // way a rock scatter announces itself as a scatter.
      let sink = 0.02;
      if (isRock) {
        _ax.set(-it.gx, 1, -it.gz).normalize();
        _q5.setFromUnitVectors(AXIS_Y, _ax);
        _q4.premultiply(_q5);
        sink = 0.06 + sc * 0.10;
      }
      _v3.set(it.x, it.y - sink, it.z);
      // Foliage is drawn out or squashed vertically; a stone or a fallen petal
      // is not, because a non-uniform stone reads as a melted stone.
      _s3.set(sc, spec.stretch ? sc * (0.82 + it.b * 0.40) : sc * (0.94 + it.b * 0.14), sc);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      im.setColorAt(i, _col.setRGB(it.r, it.g, it.bl, THREE.LinearSRGBColorSpace));
      if (it.x < x0) x0 = it.x;
      if (it.x > x1) x1 = it.x;
      if (it.z < z0) z0 = it.z;
      if (it.z > z1) z1 = it.z;
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    // Ground cover RECEIVES: lush grass that stays bright inside a tree's
    // shadow is the tell that the plants and the light belong to different
    // renderers. It costs shader work, never a draw call — these meshes are
    // never in the shadow pass.
    im.receiveShadow = true;
    // Computed ONCE, at full count, and never invalidated: update() only ever
    // SHRINKS mesh.count, and a prefix's true extent is inside the whole
    // sector's. If this were recomputed after a thinning the sector would
    // start culling itself at the edges of the frame.
    im.computeBoundingSphere();
    group.add(im);
    covers.push({ mesh: im, total: bucket.length, x0, z0, x1, z1 });
    bucket.length = 0;
  }
  coverBuckets.clear();
  for (const name of TREE_SPECIES_NAMES) treeItems[name].length = 0;

  // ── update ─────────────────────────────────────────────────────────────
  // One shared clock write, then a distance-graded instance count per sector.
  // No allocation, no matrix writes, no buffer uploads.
  // See props.js: the wind runs on its own weather-scaled clock, defaulting
  // to the sim clock.
  function update(simTime, playerPos, windTime = simTime) {
    WIND.value = windTime;
    const px = playerPos ? (playerPos.x ?? 0) : 0;
    const pz = playerPos ? (playerPos.z ?? 0) : 0;
    for (let i = 0; i < covers.length; i++) {
      const c = covers[i];
      const dx = px < c.x0 ? c.x0 - px : (px > c.x1 ? px - c.x1 : 0);
      const dz = pz < c.z0 ? c.z0 - pz : (pz > c.z1 ? pz - c.z1 : 0);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= LOD_CULL) {
        if (c.mesh.visible) c.mesh.visible = false;
        continue;
      }
      if (!c.mesh.visible) c.mesh.visible = true;
      let f;
      if (d <= LOD_FULL) f = 1;
      else if (d <= LOD_MID) f = 1 + (LOD_MID_F - 1) * ((d - LOD_FULL) / (LOD_MID - LOD_FULL));
      else f = LOD_MID_F + (LOD_FAR_F - LOD_MID_F) * ((d - LOD_MID) / (LOD_CULL - LOD_MID));
      const n = f >= 1 ? c.total : (c.total * f) | 0;
      c.mesh.count = n < 1 ? 1 : n;
    }
  }

  // ── stats ──────────────────────────────────────────────────────────────
  // `visibleCoverCalls` is the honest worst case a frame can pay for ground
  // cover: every sector whose nearest corner is inside LOD_CULL, with nothing
  // frustum-culled. Real frames run about half of it.
  const cellSpan = COVER_CELL;
  const reach = LOD_CULL + cellSpan * Math.SQRT1_2;
  let worstCover = 0;
  {
    // Count the sectors a single point could see, by walking the actual mesh
    // list from the densest spot on the island rather than guessing.
    let best = 0;
    for (const probe of covers) {
      const cx = (probe.x0 + probe.x1) * 0.5, cz = (probe.z0 + probe.z1) * 0.5;
      let n = 0;
      for (const c of covers) {
        const dx = cx < c.x0 ? c.x0 - cx : (cx > c.x1 ? cx - c.x1 : 0);
        const dz = cz < c.z0 ? c.z0 - cz : (cz > c.z1 ? cz - c.z1 : 0);
        if (dx * dx + dz * dz < LOD_CULL * LOD_CULL) n++;
      }
      if (n > best) best = n;
    }
    worstCover = best;
  }

  const treeTris = treeMeshes.reduce(
    (a, m) => a + (m.geometry.attributes.position.count / 3) * m.count, 0);
  let coverTris = 0;
  for (const c of covers) coverTris += GROUND_ARCHETYPES[c.mesh.name.slice(6)].tris * c.total;

  const stats = {
    groundCover: coverTotal,
    groundCoverByArchetype: coverByArch,
    coverSectors: covers.length,
    coverCellMetres: cellSpan,
    coverCullMetres: LOD_CULL,
    coverReachMetres: reach,
    trees: treeCount + 1,
    treesBySpecies: Object.fromEntries(TREE_SPECIES_NAMES.map(
      (k) => [k, treeMeshes.find((m) => m.name === `trees-${k}`)?.count ?? 0])),
    heroTrees: heroTrees.length + 1,
    petals: petalCount,
    petalMeshes: petalMeshes.length,
    treeMeshes: treeMeshes.length + 1,
    meshes: treeMeshes.length + 1 + petalMeshes.length + covers.length,
    // Draw-call accounting. Trees and petals are unsectored (they are sparse
    // and big), so they always cost their mesh count; ground cover costs only
    // the sectors within LOD_CULL.
    visibleCoverCalls: worstCover,
    colorPassCalls: treeMeshes.length + 1 + petalMeshes.length + worstCover,
    shadowPassCalls: castShadow ? treeMeshes.length + 1 : 0,
    resolvedTris: coverTris + treeTris,
    materials: materials.length,
  };
  stats.drawCalls = stats.colorPassCalls + stats.shadowPassCalls;

  function dispose() {
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    group.clear();
    covers.length = 0;
    treeMeshes.length = 0;
    petalMeshes.length = 0;
    trees.length = 0;
  }

  return { group, trees, stats, update, dispose };
}
