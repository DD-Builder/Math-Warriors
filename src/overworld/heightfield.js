/**
 * Deterministic seeded island heightfield — pure math, no engine imports.
 *
 * The whole overworld (mesh, physics, spawning, save-restore) must agree on
 * the exact same terrain across sessions and devices, so height is a pure
 * function of (seed, x, z): hash-based 2D value noise + 4-octave fBm shaped
 * by a radial island falloff, then reshaped by the authored biome regions
 * from worldSpec (skyCliffs rises, market flattens, palace is the summit).
 * sampleHeight is called per-frame for physics — no allocation in that path.
 */
import { WORLD, BIOMES, ISLETS } from './worldSpec.js';

export { WORLD };

// Island shaping (meters). Land fades out from FALL_IN to FALL_OUT; the
// seabed sink ramp guarantees water beyond SINK_OUT so the ocean plane at
// WATER_Y always wins near the world edge.
const BASE_LIFT = 2.5;      // beach plateau above WATER_Y before noise
const HILL_AMP = 18;        // fBm hill amplitude (interior hills)
const FALL_IN = 150;
const FALL_OUT = 230;
const SINK_IN = 205;
const SINK_OUT = 235;
const SINK_DEPTH = 16;
const NOISE_FREQ = 1 / 64;  // base wavelength of the largest octave
const OCTAVES = 4;
const NORMAL_EPS = 0.6;

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

// Integer lattice hash → [0,1). mulberry32-style avalanche so neighboring
// cells decorrelate; seed folds in so every world seed is a new island.
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bilinear value noise with smoothstep fade → [0,1).
function valueNoise(x, z, seed) {
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

// 4-octave fBm normalized to [0,1).
function fbm(x, z, seed) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < OCTAVES; o++) {
    sum += valueNoise(x * freq, z * freq, (seed + o * 0x9e37) | 0) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Create the island terrain for a seed. Returns the SHARED WORLD CONTRACT
 * surface: { sampleHeight, sampleNormal, biomeAt, shoreDistance, seed }.
 */
export function createHeightfield(seed = WORLD.SEED) {
  const s = seed | 0;
  const n = BIOMES.length;
  // Flatten biome data into parallel arrays so the hot path touches no
  // object properties beyond plain array reads.
  const bx = new Float64Array(n), bz = new Float64Array(n);
  const br2 = new Float64Array(n), bBoost = new Float64Array(n), bRough = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    bx[i] = BIOMES[i].center[0];
    bz[i] = BIOMES[i].center[1];
    br2[i] = BIOMES[i].radius * BIOMES[i].radius;
    bBoost[i] = BIOMES[i].heightBoost;
    bRough[i] = BIOMES[i].roughness;
  }
  const m = ISLETS.length;
  const ix_ = new Float64Array(m), iz_ = new Float64Array(m);
  const ir2 = new Float64Array(m), ih = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    ix_[i] = ISLETS[i].center[0];
    iz_[i] = ISLETS[i].center[1];
    ir2[i] = ISLETS[i].radius * ISLETS[i].radius;
    ih[i] = ISLETS[i].height;
  }

  function sampleHeight(x, z) {
    const r = Math.sqrt(x * x + z * z);
    // Authored biome reshaping: smooth radial weight (1-q)^2, q = (d/R)^2.
    let boost = 0, rough = 1;
    for (let i = 0; i < n; i++) {
      const dx = x - bx[i], dz = z - bz[i];
      const q = (dx * dx + dz * dz) / br2[i];
      if (q < 1) {
        const w = (1 - q) * (1 - q);
        boost += bBoost[i] * w;
        rough += (bRough[i] - 1) * w;
      }
    }
    if (rough < 0.1) rough = 0.1;
    const hills = fbm(x * NOISE_FREQ, z * NOISE_FREQ, s) * HILL_AMP * rough;
    const mask = 1 - smoothstep(FALL_IN, FALL_OUT, r);
    const sink = smoothstep(SINK_IN, SINK_OUT, r) * SINK_DEPTH
      + Math.max(0, r - SINK_OUT) * 0.25;
    let h = (BASE_LIFT + hills + boost) * mask - sink;
    // Offshore islets rise straight from the seabed sink.
    for (let i = 0; i < m; i++) {
      const dx = x - ix_[i], dz = z - iz_[i];
      const q = (dx * dx + dz * dz) / ir2[i];
      if (q < 1) h += ih[i] * (1 - q) * (1 - q);
    }
    return h;
  }

  function sampleNormal(x, z) {
    const e = NORMAL_EPS;
    const gx = (sampleHeight(x + e, z) - sampleHeight(x - e, z)) / (2 * e);
    const gz = (sampleHeight(x, z + e) - sampleHeight(x, z - e)) / (2 * e);
    const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    return [-gx * inv, inv, -gz * inv];
  }

  function biomeAt(x, z) {
    if (sampleHeight(x, z) <= WORLD.WATER_Y) return 'ocean';
    // Nearest region by normalized distance so every patch of land belongs
    // to a biome even between authored radii.
    let best = 'ocean', bestQ = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = x - bx[i], dz = z - bz[i];
      const q = (dx * dx + dz * dz) / br2[i];
      if (q < bestQ) { bestQ = q; best = BIOMES[i].id; }
    }
    return best;
  }

  // Approximate signed distance (meters) to the waterline: first-order
  // height / |gradient|, sign follows the land side. Good enough for wading
  // audio and foam bands; not an exact SDF.
  function shoreDistance(x, z) {
    const h = sampleHeight(x, z) - WORLD.WATER_Y;
    const e = 2;
    const gx = (sampleHeight(x + e, z) - sampleHeight(x - e, z)) / (2 * e);
    const gz = (sampleHeight(x, z + e) - sampleHeight(x, z - e)) / (2 * e);
    const g = Math.max(0.05, Math.sqrt(gx * gx + gz * gz));
    return h / g;
  }

  return { sampleHeight, sampleNormal, biomeAt, shoreDistance, seed: s };
}
