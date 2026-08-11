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
 *               simple radial bump (heightBoost) or carry a `profile`: a
 *               radius->height curve of alternating flat benches and short
 *               risers, i.e. a terraced mesa.
 *   3. ASYMMETRY the profile radius is bent TWICE before it is sampled: by
 *               noise (`warp`, buttresses and gullies) and by BEARING
 *               (`profileAsym` + `escarp`). See the long note above
 *               profileEval — this is the step that stops every landform in
 *               the world from being a radially symmetric muffin, and it is
 *               the highest-value 30 lines in the file.
 *   4. ARMS     RIDGES (authored polyline masses) and per-biome `tors`
 *               (seeded steep monoliths) are added on top. Ridges are
 *               composition; tors are the mid-ground occluders that give a
 *               frame its third depth layer.
 *   5. RAMP     a profile biome may also carry a spiral `ramp`, a helical
 *               shelf carved into its flanks at constant grade. Without it a
 *               mesa with 70-degree cliff bands is literally unclimbable
 *               (controller.js treats >50 degrees as a wall), so the ramp is
 *               gameplay, not decoration.
 *   6. TERRACE  the summed land height is quantised into bands with a wide
 *               flat bench and a short soft riser. This is the single move
 *               that makes the island read as stacked cut paper rather than
 *               moulded clay.
 *   7. SHELL    radial island mask + seabed sink. The width of the falloff
 *               band varies with a noise sampled ON THE UNIT CIRCLE (so it is
 *               a pure function of compass bearing and therefore continuous),
 *               which gives long stretches of sheer sea cliff between long
 *               stretches of gentle beach.
 *
 * Steps 1-7 are `baseHeight`. On top of it sit three CIVIL constructs, applied
 * in this order because each one is authored against the result of the one
 * before it:
 *
 *   8. TERRACES raised flat plinths (the market plaza).
 *   9. PATHS    carved level roads between authored nodes.
 *  10. PADS     level footings under portals, buildings, collectibles, spawn.
 *
 * Their reference heights are all sampled ONCE at createHeightfield time from
 * the stage below them, so there is no recursion and sampleHeight stays a pure
 * function of (x, z).
 *
 * sampleHeight is called per-frame for physics and ~800k times at load — no
 * allocation anywhere in this file after createHeightfield returns.
 */
import { WORLD, BIOMES, ISLETS, RIDGES, TERRACES, PATHS, PADS } from './worldSpec.js';

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

// ── Terracing vs. the mesh's Nyquist limit ──────────────────────────────
//
// This is the fix for the sawtooth striping that made every cliff in the build
// read as a shading artifact rather than as stratigraphy, and it is a GEOMETRY
// bug, not a colour one.
//
// terrainMesh samples the hero landforms every 0.9375 m horizontally. On a
// 74-degree face that is 3.3 m of ALTITUDE per facet — so quantising that face
// into 2.6 m terrace bands asks the mesh to render a staircase whose steps are
// smaller than its own sample spacing. It cannot: the facets land at random
// phases on the risers, their baked normals swing between near-horizontal and
// near-vertical, and the result is a field of alternating light/dark triangles.
// Exactly the teeth the critique kept pointing at.
//
// So terracing is faded out where the AUTHORED landform is already steep. The
// grade is measured analytically from the profile, escarpment, ridges and tors
// as they are summed (a second profile sample plus closed-form derivatives for
// the rest — no extra height evaluations), and the fade is keyed to it:
// hillsides under ~40 degrees keep the full papercut stepping, faces over ~65
// degrees keep almost none. Nothing is lost visually — a cliff face already
// carries the profile's own 10 m benches, which the mesh CAN resolve, and those
// are the strata the eye actually reads.
const TERRACE_GRADE_IN = 0.85;    // dh/dr ~ 40 deg — stepping starts to fade
const TERRACE_GRADE_OUT = 2.1;    // dh/dr ~ 65 deg — stepping is gone
const TERRACE_GRADE_CUT = 0.92;   // how much is removed at full fade
const PROFILE_DT = 0.02;          // normalised-radius step for the grade probe

// ── Spatial index ───────────────────────────────────────────────────────
// Ridges, tors, paths and pads are all "sparse things with a footprint", and
// sampleHeight must not walk all ~130 of them per call. One uniform grid over
// the world, CSR-packed, gives an O(1) candidate list per sample. 20 m cells:
// large enough that the biggest tor spans only a few, small enough that a
// typical cell holds 0-2 items.
const GRID_N = 24;
const GRID_CELL = WORLD.SIZE / GRID_N;
const GRID_CELLS = GRID_N * GRID_N;

// Erosion channels: noise-circle radius sets the channel COUNT (about 2*pi*k
// around the flank), so 1.45 gives roughly 9 gullies with broad spurs between.
const GULLY_LOBES = 1.45;

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

/** Seeded scalar RNG — used ONLY at build time (tor scatter), never per frame. */
function mulberry32(a) {
  let s = a | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
 * Periodic [turns, value] curve, smoothstep-interpolated, wrapping through the
 * last stop back to the first. `u` is a bearing in turns, already in [0,1).
 *
 * Used for `profileAsym`, whose value is a REACH EXPONENT: the profile is then
 * sampled at t**reach rather than at t. That exponent form is deliberate and
 * not interchangeable with the obvious `t * scale`:
 *
 *   - it fixes BOTH endpoints (0**k = 0, 1**k = 1), so however hard a flank is
 *     pushed the landform still lands exactly on the surrounding ground. A
 *     multiplicative scale leaves a cliff-shaped step at the biome boundary on
 *     any flank scaled above 1, because the profile never reaches its zero
 *     stop inside the disc.
 *   - reach > 1 pulls the whole stack of benches OUTWARD (long shallow apron);
 *     reach < 1 compresses it inward (short, steep, silhouette ends early).
 *     One number per bearing therefore controls both the extent and the
 *     steepness of that flank, which is exactly how a real mesa is asymmetric.
 */
function asymEval(A, o, n, u) {
  let k = 0;
  while (k < n && A[o + k * 2] <= u) k++;
  const i1 = o + (k % n) * 2;
  const i0 = o + ((k + n - 1) % n) * 2;
  const t0 = A[i0];
  let t1 = A[i1];
  if (t1 <= t0) t1 += 1;
  let uu = u;
  if (uu < t0) uu += 1;
  let f = (uu - t0) / (t1 - t0);
  if (f < 0) f = 0; else if (f > 1) f = 1;
  f = f * f * (3 - 2 * f);
  return A[i0 + 1] + (A[i1 + 1] - A[i0 + 1]) * f;
}

// Closest point on a segment — writes to module scratch so the hot path never
// allocates a pair. Never re-entered (no recursion through these).
let _segD2 = 0, _segT = 0;
function segClosest(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az;
  const len2 = ex * ex + ez * ez;
  let t = len2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = px - (ax + ex * t), dz = pz - (az + ez * t);
  _segD2 = dx * dx + dz * dz;
  _segT = t;
}

function gridIndex(v) {
  const c = Math.floor((v + WORLD.HALF) / GRID_CELL);
  return c < 0 ? 0 : c >= GRID_N ? GRID_N - 1 : c;
}

/**
 * CSR bucket grid over world XZ. `bounds` is a flat [minx,minz,maxx,maxz]*count
 * array; every item is registered in every cell its AABB touches.
 */
function buildGrid(bounds) {
  const count = bounds.length >> 2;
  const counts = new Int32Array(GRID_CELLS);
  for (let i = 0; i < count; i++) {
    const c0 = gridIndex(bounds[i * 4]), c1 = gridIndex(bounds[i * 4 + 2]);
    const r0 = gridIndex(bounds[i * 4 + 1]), r1 = gridIndex(bounds[i * 4 + 3]);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) counts[r * GRID_N + c]++;
  }
  const starts = new Int32Array(GRID_CELLS + 1);
  for (let k = 0; k < GRID_CELLS; k++) starts[k + 1] = starts[k] + counts[k];
  const items = new Int32Array(starts[GRID_CELLS]);
  const cur = starts.slice(0, GRID_CELLS);
  for (let i = 0; i < count; i++) {
    const c0 = gridIndex(bounds[i * 4]), c1 = gridIndex(bounds[i * 4 + 2]);
    const r0 = gridIndex(bounds[i * 4 + 1]), r1 = gridIndex(bounds[i * 4 + 3]);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[cur[r * GRID_N + c]++] = i;
  }
  return { starts, items };
}

/**
 * Create the island terrain for a seed. Returns the SHARED WORLD CONTRACT
 * surface: { sampleHeight, sampleNormal, biomeAt, shoreDistance, seed },
 * plus `wearAt` — see below, which terrainMesh uses to paint the ground the
 * civil layer has cut.
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
  const bGully = new Float64Array(n);
  // Profiles concatenated into one buffer; pOff < 0 means "plain radial bump".
  const pOff = new Int32Array(n), pLen = new Int32Array(n);
  let pTotal = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].profile) pTotal += BIOMES[i].profile.length * 2;
  const pBuf = new Float64Array(pTotal);
  // profileAsym concatenated the same way; aOff < 0 means "radially symmetric".
  const aOff = new Int32Array(n), aLen = new Int32Array(n);
  let aTotal = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].profileAsym) aTotal += BIOMES[i].profileAsym.length * 2;
  const aBuf = new Float64Array(aTotal);
  // Escarpments: dirTurns, arcIn, arcOut, t0, t1, drop.
  const ESCARP_STRIDE = 6;
  const eOff = new Int32Array(n);
  let escarpCount = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].escarp) escarpCount++;
  const eBuf = new Float64Array(escarpCount * ESCARP_STRIDE);
  // Ramp params flattened: r0, r1, phiMax, theta0, wIn, wOut, hTop, dr, sTot.
  const RAMP_STRIDE = 9;
  const rampOff = new Int32Array(n);
  const rampReach2 = new Float64Array(n);   // (r0 + blend width)^2
  let rampCount = 0;
  for (let i = 0; i < n; i++) if (BIOMES[i].ramp) rampCount++;
  const rBuf = new Float64Array(rampCount * RAMP_STRIDE);

  let pw = 0, aw = 0, ew = 0, rw = 0;
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
    bGully[i] = b.gully ?? 0;
    if (b.profile) {
      pOff[i] = pw;
      pLen[i] = b.profile.length;
      for (const [t, hv] of b.profile) { pBuf[pw++] = t; pBuf[pw++] = hv; }
    } else {
      pOff[i] = -1;
      pLen[i] = 0;
    }
    if (b.profileAsym) {
      aOff[i] = aw;
      aLen[i] = b.profileAsym.length;
      // Authored in ascending turns; normalise defensively so asymEval's
      // wrap-through-the-last-stop assumption always holds.
      const sorted = b.profileAsym.slice().sort((u, v) => u[0] - v[0]);
      for (const [t, reach] of sorted) { aBuf[aw++] = t - Math.floor(t); aBuf[aw++] = reach; }
    } else {
      aOff[i] = -1;
      aLen[i] = 0;
    }
    if (b.escarp) {
      const es = b.escarp;
      const o = ew * ESCARP_STRIDE;
      eBuf[o] = es.dirTurns - Math.floor(es.dirTurns);
      eBuf[o + 1] = es.arcTurns * 0.45;
      eBuf[o + 2] = es.arcTurns;
      eBuf[o + 3] = es.t0;
      eBuf[o + 4] = es.t1;
      eBuf[o + 5] = es.drop;
      eOff[i] = o;
      ew++;
    } else {
      eOff[i] = -1;
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

  // ── Ridge arms: polylines flattened to segments, indexed by a grid ──
  const nR = RIDGES.length;
  const rgWidth = new Float64Array(nR), rgHeight = new Float64Array(nR);
  const rgCrest = new Float64Array(nR), rgUndul = new Float64Array(nR);
  const rgSegOff = new Int32Array(nR), rgSegLen = new Int32Array(nR);
  const rgTotal = new Float64Array(nR);
  let segTotal = 0;
  for (const rg of RIDGES) segTotal += rg.pts.length - 1;
  // per segment: ax, az, bx, bz, s0 (arclength at a), len
  const RSEG_STRIDE = 6;
  const rgSeg = new Float64Array(segTotal * RSEG_STRIDE);
  const rgBounds = new Float64Array(nR * 4);
  let sw = 0;
  for (let i = 0; i < nR; i++) {
    const rg = RIDGES[i];
    rgWidth[i] = rg.width;
    rgHeight[i] = rg.height;
    rgCrest[i] = rg.crest ?? 0.4;
    rgUndul[i] = rg.undul ?? 0.3;
    rgSegOff[i] = sw;
    rgSegLen[i] = rg.pts.length - 1;
    let acc = 0;
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (let k = 0; k < rg.pts.length - 1; k++) {
      const [ax, az] = rg.pts[k];
      const [bx2, bz2] = rg.pts[k + 1];
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const o = sw * RSEG_STRIDE;
      rgSeg[o] = ax; rgSeg[o + 1] = az; rgSeg[o + 2] = bx2; rgSeg[o + 3] = bz2;
      rgSeg[o + 4] = acc; rgSeg[o + 5] = len;
      acc += len;
      sw++;
    }
    rgTotal[i] = acc;
    for (const [px, pz] of rg.pts) {
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (pz < minz) minz = pz; if (pz > maxz) maxz = pz;
    }
    // Footprint reaches 1.55x the nominal half-width once the meander and the
    // width modulation below are accounted for.
    const reach = rg.width * 1.6;
    rgBounds[i * 4] = minx - reach; rgBounds[i * 4 + 1] = minz - reach;
    rgBounds[i * 4 + 2] = maxx + reach; rgBounds[i * 4 + 3] = maxz + reach;
  }
  const rgGrid = buildGrid(rgBounds);

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

  /** True if (x,z) is within `pad` metres of any biome's spiral road. */
  function nearAnyRamp(x, z, pad) {
    for (let i = 0; i < n; i++) {
      if (rampOff[i] < 0) continue;
      const dx = x - bx[i], dz = z - bz[i];
      const d2 = dx * dx + dz * dz;
      const o = rampOff[i];
      const reach = rBuf[o] + rBuf[o + 5] + pad;
      if (d2 > reach * reach) continue;
      const r = Math.sqrt(d2);
      const r0 = rBuf[o], phiMax = rBuf[o + 2], theta0 = rBuf[o + 3], wOut = rBuf[o + 5];
      const dr = rBuf[o + 7];
      let base = Math.atan2(dz, dx) - theta0;
      base -= Math.floor(base / TAU) * TAU;
      for (let phi = base; phi <= phiMax; phi += TAU) {
        const rs = r0 - dr * (phi / phiMax);
        if (Math.abs(r - rs) < wOut + pad) return true;
      }
    }
    return false;
  }

  // ── Tors: seeded steep monoliths, the mid-ground occluder layer ──
  //
  // WHY these exist: WARP_AMP only makes valleys sinuous — nothing in the old
  // field ever rose INDEPENDENTLY of the main mass, so every frame had exactly
  // two depth layers (ground, landmark) and no way to read the distance
  // between them. A tor is a steep capped bump at 0.3-1.2 of a biome radius:
  // it stands between the camera and the landmark, and the parallax between
  // the two is what a frame's third ply actually is.
  //
  // Placement is rejection-sampled against everything gameplay owns — pads,
  // paths, terraces, the spiral roads and each other — so a tor can never
  // land on a portal, a coin or the only way up a mesa.
  const torX = [], torZ = [], torR = [], torH = [], torCap = [], torSeed = [];
  const torCos = [], torSin = [], torElong = [], torReach = [];
  // Hot-path view of the above, filled in once the scatter is finished.
  const tor = {
    x: null, z: null, r: null, h: null, cap: null,
    seed: null, cos: null, sin: null, elong: null, reach: null,
  };

  // Path/terrace/pad geometry is needed BY tor rejection, so flatten it first.
  const nT = TERRACES.length;
  const tcX = new Float64Array(nT), tcZ = new Float64Array(nT);
  const tcHX = new Float64Array(nT), tcHZ = new Float64Array(nT);
  const tcCos = new Float64Array(nT), tcSin = new Float64Array(nT);
  const tcSkirt = new Float64Array(nT), tcLift = new Float64Array(nT);
  const tcPaint = new Float64Array(nT), tcLevel = new Float64Array(nT);
  const tcRound = new Float64Array(nT);
  for (let i = 0; i < nT; i++) {
    const t = TERRACES[i];
    const round = t.round ?? 0;
    tcX[i] = t.x; tcZ[i] = t.z;
    tcRound[i] = round;
    tcHX[i] = t.hx - round; tcHZ[i] = t.hz - round;
    tcCos[i] = Math.cos(-(t.rot ?? 0)); tcSin[i] = Math.sin(-(t.rot ?? 0));
    tcSkirt[i] = t.skirt; tcLift[i] = t.lift;
    tcPaint[i] = t.paint ?? 0;
  }

  const nP = PATHS.length;
  const paWidth = new Float64Array(nP), paBlend = new Float64Array(nP), paPaint = new Float64Array(nP);
  const paNodeOff = new Int32Array(nP), paNodeLen = new Int32Array(nP);
  let nodeTotal = 0;
  for (const p of PATHS) nodeTotal += p.pts.length;
  const paNodeX = new Float64Array(nodeTotal), paNodeZ = new Float64Array(nodeTotal);
  const paNodeY = new Float64Array(nodeTotal);
  const paBounds = new Float64Array(nP * 4);
  let nw = 0;
  for (let i = 0; i < nP; i++) {
    const p = PATHS[i];
    paWidth[i] = p.width; paBlend[i] = p.blend; paPaint[i] = p.paint ?? 0.6;
    paNodeOff[i] = nw; paNodeLen[i] = p.pts.length;
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const [px, pz] of p.pts) {
      paNodeX[nw] = px; paNodeZ[nw] = pz; nw++;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (pz < minz) minz = pz; if (pz > maxz) maxz = pz;
    }
    const pad = p.width + p.blend;
    paBounds[i * 4] = minx - pad; paBounds[i * 4 + 1] = minz - pad;
    paBounds[i * 4 + 2] = maxx + pad; paBounds[i * 4 + 3] = maxz + pad;
  }
  const paGrid = buildGrid(paBounds);

  const nPad = PADS.length;
  const pdX = new Float64Array(nPad), pdZ = new Float64Array(nPad);
  const pdR = new Float64Array(nPad), pdSkirt = new Float64Array(nPad);
  const pdPaint = new Float64Array(nPad), pdLevel = new Float64Array(nPad);
  const pdBounds = new Float64Array(nPad * 4);
  for (let i = 0; i < nPad; i++) {
    const p = PADS[i];
    pdX[i] = p.x; pdZ[i] = p.z; pdR[i] = p.r; pdSkirt[i] = p.skirt;
    pdPaint[i] = p.paint ?? 0;
    const reach = p.r + p.skirt;
    pdBounds[i * 4] = p.x - reach; pdBounds[i * 4 + 1] = p.z - reach;
    pdBounds[i * 4 + 2] = p.x + reach; pdBounds[i * 4 + 3] = p.z + reach;
  }
  const pdGrid = buildGrid(pdBounds);

  // ── Pad groups ──
  //
  // Pads are applied one after another, each blending the ground toward ITS own
  // level, so two overlapping pads fight: inside portal-f6's flat disc the coin
  // pad 6.7 m away still carries 0.77 weight, and the "level" footing came out
  // 2.9 m out of true across its own 3.5 m footprint. Levels also cannot simply
  // be max-blended, because then the two discs meet at a step.
  //
  // The fix is to agree on the answer BEFORE blending: union-find every pair of
  // pads whose skirts genuinely overlap, then give the whole group one shared
  // level. Blending sequentially toward a single level is idempotent, so a
  // cluster of pads levels its union as one platform — which is also the right
  // ANSWER for a gate with two coins beside it.
  const pdGroup = new Int32Array(nPad);
  for (let i = 0; i < nPad; i++) pdGroup[i] = i;
  const findRoot = (i) => { while (pdGroup[i] !== i) { pdGroup[i] = pdGroup[pdGroup[i]]; i = pdGroup[i]; } return i; };
  for (let i = 0; i < nPad; i++) {
    for (let k = i + 1; k < nPad; k++) {
      const dx = pdX[i] - pdX[k], dz = pdZ[i] - pdZ[k];
      // Overlap test uses the FLAT radius plus the shorter skirt: two pads whose
      // skirts merely graze can keep their own levels without visible conflict.
      const reach = pdR[i] + pdR[k] + Math.min(pdSkirt[i], pdSkirt[k]);
      if (dx * dx + dz * dz > reach * reach) continue;
      const a = findRoot(i), b = findRoot(k);
      if (a !== b) pdGroup[a] = b;
    }
  }
  for (let i = 0; i < nPad; i++) pdGroup[i] = findRoot(i);

  /** Average each group's independently-sampled levels, weighted by footprint. */
  function unifyPadLevels() {
    const sum = new Float64Array(nPad), wsum = new Float64Array(nPad);
    for (let i = 0; i < nPad; i++) {
      const gI = pdGroup[i], w = pdR[i] * pdR[i];
      sum[gI] += pdLevel[i] * w;
      wsum[gI] += w;
    }
    for (let i = 0; i < nPad; i++) {
      const gI = pdGroup[i];
      if (wsum[gI] > 0) pdLevel[i] = sum[gI] / wsum[gI];
    }
  }

  /** Distance from (x,z) to path i's polyline. */
  function pathDist(i, x, z) {
    const o = paNodeOff[i], cnt = paNodeLen[i];
    let best = Infinity;
    for (let k = 0; k < cnt - 1; k++) {
      segClosest(x, z, paNodeX[o + k], paNodeZ[o + k], paNodeX[o + k + 1], paNodeZ[o + k + 1]);
      if (_segD2 < best) best = _segD2;
    }
    return Math.sqrt(best);
  }

  /**
   * Rounded-rectangle distance to terrace i (0 inside). The corner radius is
   * not cosmetic: a square plinth on organic ground reads as a bug, and a
   * plaza is the one built thing the player walks the whole edge of.
   */
  function terraceDist(i, x, z) {
    const dx = x - tcX[i], dz = z - tcZ[i];
    const rx = dx * tcCos[i] - dz * tcSin[i];
    const rz = dx * tcSin[i] + dz * tcCos[i];
    const ax = Math.abs(rx) - tcHX[i];
    const az = Math.abs(rz) - tcHZ[i];
    const qx = ax > 0 ? ax : 0, qz = az > 0 ? az : 0;
    const d = Math.sqrt(qx * qx + qz * qz) - tcRound[i];
    return d > 0 ? d : 0;
  }

  // `torsLive` gates tors out of baseHeight while the scatter is choosing where
  // to put them — the rejection test needs the ground WITHOUT tors on it, and
  // this is a build-time flag, never touched again afterwards.
  let torsLive = false;
  let torGrid = { starts: new Int32Array(GRID_CELLS + 1), items: new Int32Array(0) };

  function baseHeight(x, z) {
    const r = Math.sqrt(x * x + z * z);

    // ── Authored landform: radial bumps, terraced mesas and their ramps ──
    let boost = 0, rough = 1, terr = TERRACE_BASE, ridge = RIDGE_BASE, flat = 0;
    // Steepness of the AUTHORED landform (dh/dr), accumulated as it is built.
    // Terracing is faded out against it — see TERRACE_GRADE_IN.
    let gradeAcc = 0;
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
      // Bearing-dependent reach: the flank facing one way runs long and
      // shallow, the flank facing the other shears off short. Endpoints are
      // fixed by construction (see asymEval), so this can never open a step at
      // the biome boundary however hard a flank is pushed.
      let uTurn = 0;
      const hasAsym = aOff[i] >= 0, hasEsc = eOff[i] >= 0, hasGully = bGully[i] > 0;
      if (hasAsym || hasEsc || hasGully) {
        uTurn = Math.atan2(dz, dx) / TAU;
        uTurn -= Math.floor(uTurn);
      }
      // Everything from here on is evaluated at TWO radii, `t` and a probe one
      // PROFILE_DT of the biome radius further out, purely so the landform can
      // report its own steepness to the terracing stage. Two profileEvals and
      // two pows are far cheaper than a second full sampleHeight, and unlike a
      // finite difference of the finished height it measures ONLY the authored
      // shape — relief noise must not switch the papercut stepping off.
      let tB = t + PROFILE_DT;
      if (tB > 1) tB = 1;
      if (hasAsym && t > 0) {
        const reach = asymEval(aBuf, aOff[i], aLen[i], uTurn);
        t = Math.pow(t, reach);
        tB = Math.pow(tB, reach);
      }
      let hb = bBoost[i] * profileEval(pBuf, pOff[i], pLen[i], t);
      let hbB = bBoost[i] * profileEval(pBuf, pOff[i], pLen[i], tB);
      if (hasEsc) {
        const o = eOff[i];
        let du = uTurn - eBuf[o];
        du -= Math.floor(du + 0.5);            // → [-0.5, 0.5)
        const ad = du < 0 ? -du : du;
        const gate = 1 - smoothstep(eBuf[o + 1], eBuf[o + 2], ad);
        if (gate > 0) {
          const k = eBuf[o + 5] * gate;
          hb *= 1 - k * smoothstep(eBuf[o + 3], eBuf[o + 4], t);
          hbB *= 1 - k * smoothstep(eBuf[o + 3], eBuf[o + 4], tB);
        }
      }
      // ── Erosion channels ──
      // Noise sampled on a circle of radius GULLY_LOBES is periodic in bearing
      // (so the channels close on themselves), and cubing the FOLDED noise
      // turns a smooth wave into narrow V-shaped incisions with broad spurs
      // between them — which is the difference between a fluted cone and a
      // flank that has had water running down it. Windowed to the mid radii so
      // the crown plateau and the apron both stay intact, and applied BEFORE
      // the ramp blend so the road can never be cut in half by one.
      if (hasGully) {
        const ga = uTurn * TAU;
        const gn = valueNoise(Math.cos(ga) * GULLY_LOBES + 17.4, Math.sin(ga) * GULLY_LOBES - 9.1, s ^ 0x64c3);
        let chan = 1 - Math.abs(gn * 2 - 1);
        chan = chan * chan * chan;
        const depth = bBoost[i] * bGully[i] * chan;
        hb -= depth * smoothstep(0.28, 0.62, t) * (1 - smoothstep(0.80, 0.98, t));
        hbB -= depth * smoothstep(0.28, 0.62, tB) * (1 - smoothstep(0.80, 0.98, tB));
        if (hb < 0) hb = 0;
        if (hbB < 0) hbB = 0;
      }
      gradeAcc += Math.abs(hbB - hb) / (PROFILE_DT * br[i]);
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

    // ── Ridge arms ──
    //
    // A polyline swept at constant width and height is an extruded prism, and
    // an extruded prism on a landscape reads as a road embankment. Four cheap
    // modulations, all keyed to arclength along the arm, turn it into rock:
    //
    //   MEANDER    the effective centreline slides sideways within +-0.28 of
    //              the half-width, so the two flanks are never the same angle
    //              at the same station — which is what makes a ridge look like
    //              it was cut by water running down ONE side of it.
    //   WIDTH      +-25%, so the arm pinches and swells instead of tracking a
    //              constant offset.
    //   UNDULATION crest height, so the skyline has summits and cols.
    //   END TAPER  height falls to zero over the last half-width at each end,
    //              so the arm merges into the ground rather than terminating
    //              in a bar end. This one is the difference between "buttress"
    //              and "someone left a wall here".
    {
      const cell = gridIndex(z) * GRID_N + gridIndex(x);
      const e = rgGrid.starts[cell + 1];
      for (let k = rgGrid.starts[cell]; k < e; k++) {
        const i = rgGrid.items[k];
        const W = rgWidth[i];
        const so = rgSegOff[i], sc = rgSegLen[i];
        let bd2 = Infinity, bs = 0, sign = 1;
        for (let g = 0; g < sc; g++) {
          const o = (so + g) * RSEG_STRIDE;
          segClosest(x, z, rgSeg[o], rgSeg[o + 1], rgSeg[o + 2], rgSeg[o + 3]);
          if (_segD2 < bd2) {
            bd2 = _segD2;
            bs = rgSeg[o + 4] + _segT * rgSeg[o + 5];
            const ex = rgSeg[o + 2] - rgSeg[o], ez = rgSeg[o + 3] - rgSeg[o + 1];
            sign = ex * (z - rgSeg[o + 1]) - ez * (x - rgSeg[o]) >= 0 ? 1 : -1;
          }
        }
        if (bd2 >= W * W * 2.56) continue;
        const sN = bs * 0.045;
        const shift = (valueNoise(sN, i * 11.7, s ^ 0x1d3f) - 0.5) * 0.56;
        const wmod = 0.75 + 0.5 * valueNoise(sN * 0.62 + 31.4, i * 5.1, s ^ 0x77a3);
        let dn = (Math.sqrt(bd2) * sign / W - shift) / wmod;
        if (dn < 0) dn = -dn;
        if (dn >= 1) continue;
        const und = 1 - rgUndul[i] * (1 - valueNoise(sN * 1.9 + i * 3.3, i * 2.7, s ^ 0x6ea5));
        const taper = smoothstep(0, W * 1.05, bs) * smoothstep(0, W * 1.05, rgTotal[i] - bs);
        const amp = rgHeight[i] * und * taper;
        const crest = rgCrest[i];
        boost += amp * (1 - smoothstep(crest, 1, dn));
        // Closed-form flank gradient: d/dx of smoothstep(a,b,x) is 6y(1-y)/(b-a).
        let y = (dn - crest) / (1 - crest);
        if (y > 0 && y < 1) gradeAcc += amp * 6 * y * (1 - y) / ((1 - crest) * W * wmod);
      }
    }

    // ── Tors ──
    //
    // Two shaping terms, because a bump of revolution is a dome and a dome is
    // the thing this whole file exists to stop producing:
    //
    //   ELONGATION  the footprint is an ellipse on a per-tor axis, so a tor has
    //               a long face and a short face and therefore a bearing you
    //               can read it from.
    //   LOBING      the radius is modulated by TWO octaves of noise sampled ON
    //               A CIRCLE (so it is a continuous function of bearing and the
    //               silhouette closes), giving buttresses and clefts at rock
    //               scale rather than the 3-lobe cloverleaf a single octave
    //               produces.
    if (torsLive) {
      const cell = gridIndex(z) * GRID_N + gridIndex(x);
      const e = torGrid.starts[cell + 1];
      for (let k = torGrid.starts[cell]; k < e; k++) {
        const i = torGrid.items[k];
        const dx = x - tor.x[i], dz = z - tor.z[i];
        const reach = tor.reach[i];
        if (dx * dx + dz * dz >= reach * reach) continue;
        const ca = tor.cos[i], sa = tor.sin[i], el = tor.elong[i];
        const ux = (dx * ca + dz * sa) / el;
        const uz = (-dx * sa + dz * ca) * el;
        const d = Math.sqrt(ux * ux + uz * uz);
        const R = tor.r[i];
        if (d >= R * 1.22) continue;
        // Circle radius sets the LOBE COUNT: the noise lattice is 1 unit, so a
        // circle of radius k carries about 2*pi*k lobes. 1.15 gives ~7 — rock
        // buttresses. (An earlier 3.4 gave ~21, which at tor scale is a 3 m
        // sawtooth: the shape read as a sea urchin, not a monolith.)
        const inv = d > 1e-6 ? 1.15 / d : 0;
        const nx = ux * inv, nz = uz * inv;
        const sd = tor.seed[i];
        const lobe = 0.86 + 0.30 * (valueNoise(nx + sd, nz - sd, s ^ 0x2c77) * 0.68
          + valueNoise(nx * 2.1 - sd, nz * 2.1 + sd, s ^ 0x51bb) * 0.32);
        const Reff = R * lobe;
        if (d >= Reff) continue;
        const cap = tor.cap[i], hT = tor.h[i];
        boost += hT * (1 - smoothstep(cap * Reff, Reff, d));
        const y = (d - cap * Reff) / ((1 - cap) * Reff);
        if (y > 0 && y < 1) gradeAcc += hT * 6 * y * (1 - y) / ((1 - cap) * Reff);
      }
    }

    // The road surface must stay a road: strata risers are cut away along it.
    // Hill noise is deliberately NOT damped — the road rides the same relief
    // as the ground beside it, so its edge never becomes a step.
    if (flat > 0) terr *= 1 - flat;
    // Fade the papercut stepping out of anything the mesh cannot resolve as a
    // staircase. See TERRACE_GRADE_IN — this is the sawtooth fix.
    if (gradeAcc > TERRACE_GRADE_IN) {
      terr *= 1 - TERRACE_GRADE_CUT * smoothstep(TERRACE_GRADE_IN, TERRACE_GRADE_OUT, gradeAcc);
    }
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

  // ── Civil layer: terraces, then paths, then pads ──
  // Each is authored against the stage below it, so their reference heights are
  // sampled in that order at build time and frozen.

  function applyTerraces(x, z, h) {
    for (let i = 0; i < nT; i++) {
      const d = terraceDist(i, x, z);
      if (d >= tcSkirt[i]) continue;
      const w = 1 - smoothstep(0, tcSkirt[i], d);
      h += (tcLevel[i] - h) * w;
    }
    return h;
  }

  function applyPaths(x, z, h) {
    const cell = gridIndex(z) * GRID_N + gridIndex(x);
    const e = paGrid.starts[cell + 1];
    let bestW = 0, bestY = 0;
    for (let k = paGrid.starts[cell]; k < e; k++) {
      const i = paGrid.items[k];
      const o = paNodeOff[i], cnt = paNodeLen[i];
      const reach = paWidth[i] + paBlend[i];
      let bd2 = Infinity, by = 0;
      for (let g = 0; g < cnt - 1; g++) {
        segClosest(x, z, paNodeX[o + g], paNodeZ[o + g], paNodeX[o + g + 1], paNodeZ[o + g + 1]);
        if (_segD2 < bd2) {
          bd2 = _segD2;
          by = paNodeY[o + g] + (paNodeY[o + g + 1] - paNodeY[o + g]) * _segT;
        }
      }
      if (bd2 >= reach * reach) continue;
      const w = 1 - smoothstep(paWidth[i], reach, Math.sqrt(bd2));
      if (w > bestW) { bestW = w; bestY = by; }
    }
    // ROAD_KEEP leaves a hair of the natural surface in the road so it still
    // breathes with the ground it crosses instead of reading as a decal.
    if (bestW > 0) h += (bestY - h) * bestW * 0.94;
    return h;
  }

  function applyPads(x, z, h) {
    const cell = gridIndex(z) * GRID_N + gridIndex(x);
    const e = pdGrid.starts[cell + 1];
    for (let k = pdGrid.starts[cell]; k < e; k++) {
      const i = pdGrid.items[k];
      const dx = x - pdX[i], dz = z - pdZ[i];
      const reach = pdR[i] + pdSkirt[i];
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
      const w = 1 - smoothstep(pdR[i], reach, Math.sqrt(d2));
      h += (pdLevel[i] - h) * w;
    }
    return h;
  }

  function sampleHeight(x, z) {
    return applyPads(x, z, applyPaths(x, z, applyTerraces(x, z, baseHeight(x, z))));
  }

  // ── Build-time initialisation, in dependency order ──

  // 1. Terrace levels: mean of the base field over the plinth, plus its lift.
  for (let i = 0; i < nT; i++) {
    let sum = baseHeight(tcX[i], tcZ[i]), cnt = 1;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      sum += baseHeight(tcX[i] + Math.cos(a) * tcHX[i] * 0.7, tcZ[i] + Math.sin(a) * tcHZ[i] * 0.7);
      cnt++;
    }
    tcLevel[i] = sum / cnt + tcLift[i];
  }

  // 2. Path node heights, sampled on the terraced field then relaxed. The
  //    relaxation is what turns "a line of terrain samples" into a road: an
  //    unrelaxed polyline inherits every bump it crosses and the grade
  //    oscillates, which is exactly what a road is built to avoid.
  for (let i = 0; i < nP; i++) {
    const o = paNodeOff[i], cnt = paNodeLen[i];
    for (let k = 0; k < cnt; k++) {
      paNodeY[o + k] = applyTerraces(paNodeX[o + k], paNodeZ[o + k],
        baseHeight(paNodeX[o + k], paNodeZ[o + k]));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 1; k < cnt - 1; k++) {
        paNodeY[o + k] = (paNodeY[o + k - 1] + paNodeY[o + k] * 2 + paNodeY[o + k + 1]) * 0.25;
      }
    }
  }

  // 3. Pad levels: mean of centre and a ring at 0.8r on the terraced+roaded
  //    field, so a pad on a slope half cuts and half fills instead of standing
  //    on a plinth or sinking into a pit.
  for (let i = 0; i < nPad; i++) {
    const px = pdX[i], pz = pdZ[i], rr = pdR[i] * 0.8;
    let sum = applyPaths(px, pz, applyTerraces(px, pz, baseHeight(px, pz)));
    let cnt = 1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const qx = px + Math.cos(a) * rr, qz = pz + Math.sin(a) * rr;
      sum += applyPaths(qx, qz, applyTerraces(qx, qz, baseHeight(qx, qz)));
      cnt++;
    }
    pdLevel[i] = sum / cnt;
  }
  unifyPadLevels();

  // 4. Tor scatter. Rejection-sampled against pads, paths, terraces, the
  //    spiral roads and each other; `torsLive` stays false throughout so the
  //    ground being tested is the ground WITHOUT tors.
  for (let i = 0; i < n; i++) {
    const spec = BIOMES[i].tors;
    if (!spec) continue;
    const rng = mulberry32((s ^ 0x9e3b5f) + i * 0x2545f49);
    const want = spec.count;
    const cap = spec.cap ?? 0.3;
    let placed = 0;
    for (let attempt = 0; attempt < want * 40 && placed < want; attempt++) {
      const ang = rng() * TAU;
      const rn = spec.rIn + (spec.rOut - spec.rIn) * Math.sqrt(rng());
      const px = bx[i] + Math.cos(ang) * br[i] * rn;
      const pz = bz[i] + Math.sin(ang) * br[i] * rn;
      // Size is drawn on a squared curve so most tors are small and a few are
      // genuinely big. A uniform draw gives a field of same-sized lumps, which
      // is the "confetti" read; a skewed one gives a hierarchy the eye can use
      // to judge distance.
      const sz = rng();
      const R = spec.wMin + (spec.wMax - spec.wMin) * sz * sz;
      const H = spec.hMin + (spec.hMax - spec.hMin) * (0.25 + 0.75 * sz);
      const el = 1 + rng() * 0.75;
      const ang2 = rng() * Math.PI;
      const reach = R * 1.22 * el;
      if (Math.abs(px) > WORLD.HALF - 12 || Math.abs(pz) > WORLD.HALF - 12) continue;
      // Never bury a coin, a gate, a door or the spawn.
      let bad = false;
      for (let k = 0; k < nPad && !bad; k++) {
        const dx = px - pdX[k], dz = pz - pdZ[k];
        const keep = reach + pdR[k] + 7;
        if (dx * dx + dz * dz < keep * keep) bad = true;
      }
      if (bad) continue;
      for (let k = 0; k < nP && !bad; k++) {
        if (pathDist(k, px, pz) < reach + paWidth[k] + paBlend[k] + 3) bad = true;
      }
      if (bad) continue;
      for (let k = 0; k < nT && !bad; k++) {
        if (terraceDist(k, px, pz) < reach + tcSkirt[k]) bad = true;
      }
      if (bad) continue;
      // A tor across the only ramp up a mesa is a wall, not a landmark.
      if (nearAnyRamp(px, pz, reach + 3)) continue;
      for (let k = 0; k < torX.length && !bad; k++) {
        const dx = px - torX[k], dz = pz - torZ[k];
        const keep = (reach + torReach[k]) * 0.78;
        if (dx * dx + dz * dz < keep * keep) bad = true;
      }
      if (bad) continue;
      // Keep them out of deep water — a monolith rising from 12 m down reads
      // as a bug, not as a sea stack.
      if (baseHeight(px, pz) < -5) continue;
      torX.push(px); torZ.push(pz); torR.push(R); torH.push(H);
      torCap.push(cap); torSeed.push(rng() * 64);
      torCos.push(Math.cos(ang2)); torSin.push(Math.sin(ang2));
      torElong.push(el); torReach.push(reach);
      placed++;
    }
  }
  {
    const cnt = torX.length;
    const bounds = new Float64Array(cnt * 4);
    for (let i = 0; i < cnt; i++) {
      bounds[i * 4] = torX[i] - torReach[i]; bounds[i * 4 + 1] = torZ[i] - torReach[i];
      bounds[i * 4 + 2] = torX[i] + torReach[i]; bounds[i * 4 + 3] = torZ[i] + torReach[i];
    }
    torGrid = buildGrid(bounds);
    // The scatter needs push(); the hot path needs flat contiguous doubles.
    // Freeze the JS arrays into typed ones now that the count is final.
    tor.x = Float64Array.from(torX); tor.z = Float64Array.from(torZ);
    tor.r = Float64Array.from(torR); tor.h = Float64Array.from(torH);
    tor.cap = Float64Array.from(torCap); tor.seed = Float64Array.from(torSeed);
    tor.cos = Float64Array.from(torCos); tor.sin = Float64Array.from(torSin);
    tor.elong = Float64Array.from(torElong); tor.reach = Float64Array.from(torReach);
    torsLive = true;
  }

  // 5. Re-level pads and path nodes now that the tors exist. A tor cannot
  //    touch a pad or a road (rejection above guarantees it), but its SKIRT
  //    can graze one, and a footing computed against the pre-tor ground would
  //    then sit slightly proud. Cheap, and it keeps the civil layer exact.
  for (let i = 0; i < nP; i++) {
    const o = paNodeOff[i], cnt = paNodeLen[i];
    for (let k = 0; k < cnt; k++) {
      paNodeY[o + k] = applyTerraces(paNodeX[o + k], paNodeZ[o + k],
        baseHeight(paNodeX[o + k], paNodeZ[o + k]));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 1; k < cnt - 1; k++) {
        paNodeY[o + k] = (paNodeY[o + k - 1] + paNodeY[o + k] * 2 + paNodeY[o + k + 1]) * 0.25;
      }
    }
  }
  for (let i = 0; i < nPad; i++) {
    const px = pdX[i], pz = pdZ[i], rr = pdR[i] * 0.8;
    let sum = applyPaths(px, pz, applyTerraces(px, pz, baseHeight(px, pz)));
    let cnt = 1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const qx = px + Math.cos(a) * rr, qz = pz + Math.sin(a) * rr;
      sum += applyPaths(qx, qz, applyTerraces(qx, qz, baseHeight(qx, qz)));
      cnt++;
    }
    pdLevel[i] = sum / cnt;
  }
  unifyPadLevels();

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

  /**
   * How WORN this patch of ground is: 0 = untouched biome paper, 1 = the middle
   * of a plaza or a road. terrainMesh paints with it, which is the whole point
   * — a pad that levels the geometry but leaves the colour untouched still
   * reads as a building floating on a lawn. The paint has to agree with the
   * cut, so both are measured off exactly the same falloffs here.
   */
  function wearAt(x, z) {
    let w = 0;
    for (let i = 0; i < nT; i++) {
      if (tcPaint[i] <= 0) continue;
      const d = terraceDist(i, x, z);
      if (d >= tcSkirt[i]) continue;
      const v = (1 - smoothstep(0, tcSkirt[i] * 0.75, d)) * tcPaint[i];
      if (v > w) w = v;
    }
    const cellP = gridIndex(z) * GRID_N + gridIndex(x);
    let e = paGrid.starts[cellP + 1];
    for (let k = paGrid.starts[cellP]; k < e; k++) {
      const i = paGrid.items[k];
      if (paPaint[i] <= 0) continue;
      const reach = paWidth[i] + paBlend[i];
      const d = pathDist(i, x, z);
      if (d >= reach) continue;
      const v = (1 - smoothstep(paWidth[i] * 0.6, reach, d)) * paPaint[i];
      if (v > w) w = v;
    }
    e = pdGrid.starts[cellP + 1];
    for (let k = pdGrid.starts[cellP]; k < e; k++) {
      const i = pdGrid.items[k];
      if (pdPaint[i] <= 0) continue;
      const dx = x - pdX[i], dz = z - pdZ[i];
      const reach = pdR[i] + pdSkirt[i] * 0.45;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
      const v = (1 - smoothstep(pdR[i], reach, Math.sqrt(d2))) * pdPaint[i];
      if (v > w) w = v;
    }
    return w;
  }

  return {
    sampleHeight,
    sampleNormal,
    biomeAt,
    shoreDistance,
    wearAt,
    seed: s,
    torCount: torX.length,
  };
}
