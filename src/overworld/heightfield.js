/**
 * Deterministic seeded island heightfield — pure math, no engine imports.
 *
 * The whole overworld (mesh, physics, spawning, save-restore) must agree on
 * the exact same terrain across sessions and devices, so height is a pure
 * function of (seed, x, z), evaluated in this order:
 *
 *   1. RELIEF   domain-warped fBm blended with a ridged multifractal. fBm
 *               alone gives blobs; ridged noise (1-|2n-1|, squared, with
 *               per-octave amplitude damped by the previous octave) gives
 *               crisp crest lines over broad smooth basins — the cheapest
 *               honest imitation of erosion we can afford in a hot path.
 *   2. LANDFORM authored per-biome shapes from worldSpec. A biome may be a
 *               simple radial bump (heightBoost, as before) or carry a
 *               `profile`: a radius->height curve of alternating flat benches
 *               and short risers, i.e. a terraced mesa. The profile radius is
 *               lobed by noise so the mesa has buttresses and gullies instead
 *               of being a lathe-turned cone.
 *   3. RAMP     a profile biome may also carry a spiral `ramp`, a helical
 *               shelf carved into its flanks at constant grade. Without it a
 *               mesa with 70-degree cliff bands is literally unclimbable
 *               (controller.js treats >50 degrees as a wall), so the ramp is
 *               gameplay, not decoration.
 *   4. TERRACE  the summed land height is quantised into bands with a wide
 *               flat bench and a short soft riser. This is the single move
 *               that makes the island read as stacked cut paper rather than
 *               moulded clay, and it is applied island-wide at low strength,
 *               hard on the palace and the sky cliffs.
 *   5. SHELL    radial island mask + seabed sink. The width of the falloff
 *               band varies with a noise sampled ON THE UNIT CIRCLE (so it is
 *               a pure function of compass bearing and therefore continuous),
 *               which gives long stretches of sheer sea cliff between long
 *               stretches of gentle beach.
 *
 * sampleHeight is called per-frame for physics and ~400k times at load — no
 * allocation anywhere in this file after createHeightfield returns.
 */
import { WORLD, BIOMES, ISLETS } from './worldSpec.js';

export { WORLD };

// ── Island shell (meters) ───────────────────────────────────────────────
const BASE_LIFT = 2.5;        // beach plateau above WATER_Y before noise
const HILL_AMP = 18;          // relief amplitude (interior hills)
// The waterline sits at COAST_MID on every bearing; only the WIDTH of the
// falloff band varies, so the island keeps its size while its coast alternates
// between sheer headland (narrow band) and shelving beach (wide band).
const COAST_MID = 190;
const COAST_SPAN_MIN = 26;
const COAST_SPAN_MAX = 80;
const COAST_LOBES = 2.6;      // noise-circle radius -> ~5 headlands per island
const SINK_IN = 205;
const SINK_OUT = 235;
const SINK_DEPTH = 16;
const NORMAL_EPS = 0.6;

// ── Relief ──────────────────────────────────────────────────────────────
const NOISE_FREQ = 1 / 64;    // base wavelength of the largest fBm octave
const OCTAVES = 4;
const RIDGE_FREQ = 1 / 110;   // ridge lines are a larger feature than hills
const RIDGE_OCTAVES = 4;
const RIDGE_GAIN = 2.05;      // rescales the multifractal back toward [0,1]
const RIDGE_BASE = 0.34;      // island-wide ridged/fBm blend
const WARP_FREQ = 1 / 150;
const WARP_AMP = 30;          // domain warp, meters — sinuous valleys

// ── Terracing (strata) ──────────────────────────────────────────────────
// TERRACE_BAND is exported so terrainMesh can key its cliff-strata colouring
// to exactly the bands the geometry steps on; if the two drifted apart the
// paint would slide off the rock.
export const TERRACE_BAND = 2.6;   // meters per stratum
// Bench fraction sets how hard the risers get: the terraced slope is up to
// 1.5/(1-BENCH) times the natural one, so 0.45 caps the amplification at 2.7x.
// Push it toward 1 and ordinary hillsides start failing the walkable-slope
// audit in heightfield.test.js.
const TERRACE_BENCH = 0.45;
const TERRACE_BASE = 0.2;          // island-wide strength

const TAU = Math.PI * 2;

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
 * Ridged multifractal → [0,1].
 *
 * `1 - |2n-1|` folds the noise about its midline, so the former zero-crossings
 * become C0 crest lines: sharp ridges instead of rounded lumps. Squaring drops
 * the mid-range, which broadens and smooths the basins between crests (the
 * "erosion bias": ridges crisp, valleys soft). Damping each octave by the
 * previous one keeps fine detail on the ridges and off the valley floors,
 * which is what real drainage does.
 */
function ridgedFbm(x, z, seed) {
  let sum = 0, amp = 1, freq = 1, norm = 0, prev = 1;
  for (let o = 0; o < RIDGE_OCTAVES; o++) {
    let n = valueNoise(x * freq, z * freq, (seed + o * 0x9e37) | 0);
    n = 1 - Math.abs(n * 2 - 1);
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n * 1.6;
    if (prev > 1) prev = 1;
    amp *= 0.5;
    freq *= 2.07;
  }
  const v = (sum / norm) * RIDGE_GAIN;
  return v > 1 ? 1 : v;
}

/**
 * Quantise a height into strata: a flat bench of TERRACE_BENCH of each band,
 * then a smoothstep riser. `mix` fades the effect in, so callers can leave
 * gentle ground almost untouched and snap cliffs hard.
 */
function terrace(h, mix) {
  if (mix <= 0) return h;
  const t = h / TERRACE_BAND;
  const i = Math.floor(t);
  const f = t - i;
  let u = f <= TERRACE_BENCH ? 0 : (f - TERRACE_BENCH) / (1 - TERRACE_BENCH);
  u = u * u * (3 - 2 * u);
  return h + ((i + u) * TERRACE_BAND - h) * mix;
}

/**
 * Piecewise-smoothstep radius→height curve. Stops are stored flattened as
 * t0,h0,t1,h1,... in `P` from index `o`, `n` stops total. smoothstep between
 * stops means the curve is FLAT at every stop, so two stops at the same height
 * make a true bench and two stops close together in t make a near-vertical
 * riser. That is the whole terraced-mesa vocabulary in one function.
 */
function profileEval(P, o, n, t) {
  if (t <= P[o]) return P[o + 1];
  const last = o + (n - 1) * 2;
  for (let k = 1; k < n; k++) {
    const i1 = o + k * 2;
    const t1 = P[i1];
    if (t <= t1) {
      const i0 = i1 - 2;
      const t0 = P[i0];
      const span = t1 - t0;
      let u = span > 1e-9 ? (t - t0) / span : 1;
      u = u * u * (3 - 2 * u);
      return P[i0 + 1] + (P[i1 + 1] - P[i0 + 1]) * u;
    }
  }
  return P[last + 1];
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
  const br = new Float64Array(n), br2 = new Float64Array(n);
  const bBoost = new Float64Array(n), bRough = new Float64Array(n);
  const bTerr = new Float64Array(n), bRidge = new Float64Array(n), bWarp = new Float64Array(n);
  // Profiles concatenated into one buffer; pOff < 0 means "plain radial bump".
  const pOff = new Int32Array(n), pLen = new Int32Array(n);
  let pTotal = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].profile) pTotal += BIOMES[i].profile.length * 2;
  const pBuf = new Float64Array(pTotal);
  // Ramp params flattened: r0, r1, phiMax, theta0, wIn, wOut, hTop, dr, sTot.
  const RAMP_STRIDE = 9;
  const rampOff = new Int32Array(n);
  const rampReach2 = new Float64Array(n);   // (r0 + blend width)^2
  let rampCount = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].ramp) rampCount++;
  const rBuf = new Float64Array(rampCount * RAMP_STRIDE);

  let pw = 0, rw = 0;
  for (let i = 0; i < n; i++) {
    const b = BIOMES[i];
    bx[i] = b.center[0];
    bz[i] = b.center[1];
    br[i] = b.radius;
    br2[i] = b.radius * b.radius;
    bBoost[i] = b.heightBoost;
    bRough[i] = b.roughness;
    bTerr[i] = b.terrace ?? TERRACE_BASE;
    bRidge[i] = b.ridge ?? RIDGE_BASE;
    bWarp[i] = b.warp ?? 0;
    if (b.profile) {
      pOff[i] = pw;
      pLen[i] = b.profile.length;
      for (const [t, hv] of b.profile) { pBuf[pw++] = t; pBuf[pw++] = hv; }
    } else {
      pOff[i] = -1;
      pLen[i] = 0;
    }
    if (b.ramp) {
      const rp = b.ramp;
      const phiMax = rp.turns * TAU;
      const dr = rp.r0 - rp.r1;
      const o = rw * RAMP_STRIDE;
      rBuf[o] = rp.r0;
      rBuf[o + 1] = rp.r1;
      rBuf[o + 2] = phiMax;
      rBuf[o + 3] = rp.theta0;
      rBuf[o + 4] = rp.widthIn ?? 3.2;
      rBuf[o + 5] = rp.widthOut ?? 6.4;
      // Height at the top of the ramp = the profile height where it lands.
      rBuf[o + 6] = b.heightBoost * profileEval(pBuf, pOff[i], pLen[i], rp.r1 / b.radius);
      rBuf[o + 7] = dr;
      rBuf[o + 8] = phiMax * (rp.r0 + rp.r1) * 0.5;   // total arc length
      rampOff[i] = o;
      // The road must start on open ground OUTSIDE the landform, otherwise
      // its first metre is a step off the biome's edge.
      const reach = rp.r0 + rBuf[o + 5];
      rampReach2[i] = reach * reach;
      rw++;
    } else {
      rampOff[i] = -1;
      rampReach2[i] = 0;
    }
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

  // Ramp evaluation writes here instead of returning a pair — sampleHeight is
  // the hot path and must not allocate. Never re-entered (no recursion).
  let _rampW = 0, _rampH = 0;

  /**
   * Nearest point on the spiral shelf. Walks every winding whose bearing
   * matches this point's bearing and keeps the closest.
   */
  function evalRamp(o, dx, dz, r) {
    _rampW = 0; _rampH = 0;
    const r0 = rBuf[o], phiMax = rBuf[o + 2], theta0 = rBuf[o + 3];
    const wIn = rBuf[o + 4], wOut = rBuf[o + 5], hTop = rBuf[o + 6];
    const dr = rBuf[o + 7], sTot = rBuf[o + 8];
    let base = Math.atan2(dz, dx) - theta0;
    base -= Math.floor(base / TAU) * TAU;              // → [0, TAU)
    for (let phi = base; phi <= phiMax; phi += TAU) {
      const rs = r0 - dr * (phi / phiMax);
      const d = r - rs;
      const ad = d < 0 ? -d : d;
      if (ad >= wOut) continue;
      const w = 1 - smoothstep(wIn, wOut, ad);
      if (w <= _rampW) continue;
      _rampW = w;
      // Height ∝ arc length travelled, so the grade is constant even though
      // the spiral tightens as it climbs.
      const sArc = r0 * phi - (dr * phi * phi) / (2 * phiMax);
      _rampH = hTop * (sArc / sTot);
    }
  }

  function sampleHeight(x, z) {
    const r = Math.sqrt(x * x + z * z);

    // ── Authored landform: radial bumps, terraced mesas and their ramps ──
    let boost = 0, rough = 1, terr = TERRACE_BASE, ridge = RIDGE_BASE, flat = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - bx[i], dz = z - bz[i];
      const d2 = dx * dx + dz * dz;
      const q = d2 / br2[i];
      const inside = q < 1;
      // A ramp reaches PAST the landform's own radius so the road starts on
      // open ground; without that the first metre of road is a step.
      if (!inside && (rampOff[i] < 0 || d2 > rampReach2[i])) continue;
      if (inside) {
        const w = (1 - q) * (1 - q);
        rough += (bRough[i] - 1) * w;
        terr += (bTerr[i] - TERRACE_BASE) * w;
        ridge += (bRidge[i] - RIDGE_BASE) * w;
        if (pOff[i] < 0) {
          boost += bBoost[i] * w;
          continue;
        }
      } else if (pOff[i] < 0) {
        continue;
      }
      // Terraced landform. The normalised radius is pushed in and out by
      // noise so the mesa grows buttresses and gullies; the lobing fades
      // toward the summit so the crown plateau stays a readable silhouette.
      let t = Math.sqrt(q);
      if (t > 1) t = 1;
      if (bWarp[i] > 0) {
        const lobe = (ridgedFbm(x * 0.021, z * 0.021, s ^ 0x4b1d) - 0.45) * 1.5
          + (valueNoise(x * 0.075, z * 0.075, s ^ 0x77c1) - 0.5) * 0.8;
        t *= 1 + bWarp[i] * lobe * (0.35 + 0.65 * t);
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      let hb = bBoost[i] * profileEval(pBuf, pOff[i], pLen[i], t);
      if (rampOff[i] >= 0) {
        const rr = Math.sqrt(d2);
        evalRamp(rampOff[i], dx, dz, rr);
        if (_rampW > 0) {
          hb += (_rampH - hb) * _rampW;
          if (_rampW > flat) flat = _rampW;
        }
      }
      boost += hb;
    }
    // The road surface must stay a road: strata risers are cut away along it.
    // Hill noise is deliberately NOT damped — the road rides the same relief
    // as the ground beside it, so its edge never becomes a step.
    if (flat > 0) terr *= 1 - flat;
    if (rough < 0.04) rough = 0.04;
    if (terr < 0) terr = 0; else if (terr > 1) terr = 1;
    if (ridge < 0) ridge = 0; else if (ridge > 1) ridge = 1;

    // ── Relief: domain-warped fBm blended toward a ridged multifractal ──
    const wx = x + (valueNoise(x * WARP_FREQ, z * WARP_FREQ, s ^ 0x2ab1) - 0.5) * 2 * WARP_AMP;
    const wz = z + (valueNoise(x * WARP_FREQ + 41.7, z * WARP_FREQ - 17.3, s ^ 0x5cd3) - 0.5) * 2 * WARP_AMP;
    const roll = fbm(wx * NOISE_FREQ, wz * NOISE_FREQ, s);
    let relief = roll;
    if (ridge > 0) {
      relief = roll + (ridgedFbm(wx * RIDGE_FREQ, wz * RIDGE_FREQ, s ^ 0x1f83) - roll) * ridge;
    }
    const hills = relief * HILL_AMP * rough;

    // ── Shell: bearing-dependent coast width, then the seabed sink ──
    // The noise is sampled on a circle of radius COAST_LOBES, i.e. it is a
    // function of compass bearing only — a closed curve in the noise domain, so
    // it wraps continuously and gives long headlands and long beaches instead
    // of per-pixel coastal hash. Bearing is undefined at the origin, which does
    // not matter: mask is exactly 1 (and flat) anywhere near the middle of the
    // island, so cN cannot influence the height there.
    const inv = r > 1e-6 ? COAST_LOBES / r : 0;
    const cN = valueNoise(x * inv + 8.3, z * inv + 4.1, s ^ 0x3d09);
    const span = COAST_SPAN_MIN + (COAST_SPAN_MAX - COAST_SPAN_MIN) * cN;
    const mask = 1 - smoothstep(COAST_MID - span * 0.5, COAST_MID + span * 0.5, r);
    const sink = smoothstep(SINK_IN, SINK_OUT, r) * SINK_DEPTH
      + Math.max(0, r - SINK_OUT) * 0.25;

    let h = terrace(BASE_LIFT + hills + boost, terr) * mask - sink;
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
