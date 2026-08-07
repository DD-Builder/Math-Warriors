/**
 * The island — 64 chunked terrain meshes built by hand from the heightfield.
 *
 * This is the hero visual of the 3D hub, so it is authored, not generated:
 * PlaneGeometry + a displacement map cannot give us papercut faceting, biome
 * paper that gradients into its neighbour, cliff faces that read as a
 * different sheet of paper, or beaches that fade to sand. So every vertex is
 * placed and coloured on the CPU here, once, at load.
 *
 * WHY chunks: one 256x256 mesh is a single draw call that is always in the
 * frustum and always fully shadow-rendered. 8x8 chunks of 32x32 quads give
 * the GPU real bounding spheres to cull against (only ~6-12 chunks are ever
 * on screen, ~4-9 in the tight sun shadow frustum) at a worst case of 64
 * draw calls sharing ONE material and ONE index buffer.
 *
 * WHY vertex colours instead of a splat texture: no UV seams across chunks, and
 * colour blending happens in the vertex stream where we can hand-author it.
 * Faceted lighting over smoothly graded pigment — hard light steps, soft
 * colour — is exactly what layered cut paper looks like, so the colours stay
 * interpolated while the normals stay flat.
 *
 * The one thing vertex colour cannot reach is the metre-and-below scale: at
 * 1.875 m between lattice points, everything finer than a facet is a flat
 * fill. That is what materials/textures.js is for, and the material below
 * wears it — a fibre grain multiplying the pigment and a pressed tooth
 * perturbing the normal, both keyed to WORLD space so they run continuously
 * across all 64 chunks, and both blended between a top-down and a diagonal
 * side projection so a cliff face gets grain instead of smear. The division of
 * labour is: vertices own everything above ~4 m, the paper owns everything
 * below it.
 *
 * WHY non-indexed geometry with BAKED face normals instead of the material's
 * `flatShading` flag: (1) three r170's MeshToonMaterial does not declare
 * flatShading at all — it warns and silently ignores it, so the spec'd flag
 * is a no-op today; (2) three's FLAT_SHADED path derives the normal with
 * dFdx/dFdy, and TECH LAW bans derivative tricks because the SwiftShader
 * screenshot harness must match the iPad exactly. Three verts per triangle
 * carrying the true cross-product normal gives identical faceting with zero
 * shader risk, at 14 MB of static VRAM we can easily afford.
 *
 * Palette law: every colour resolves from PAPER via the biome palettes; the
 * only darkening applied anywhere is a teal (PAPER.tealD) seabed tint. No
 * black, no gray, no outlines.
 *
 * Constraints honoured: no post-processing, no depth reads, no derivative
 * tricks, no per-frame allocation (this module allocates only during
 * createTerrain), everything disposable.
 */
import * as THREE from 'three';
import { WORLD, BIOMES } from './worldSpec.js';
import { TERRACE_BAND } from './heightfield.js';
import { papercutMaterial, PAPER } from './materials/toon.js';

// ── Tessellation ────────────────────────────────────────────────────────
// Two resolutions. The island at large is fine at 1.875 m facets, but the two
// hero landforms — the Paper Palace mesa and the Sky Cliffs table mountain —
// are built from 4 m-wide cliff bands stacked between walkable benches, and a
// 4 m feature sampled every 1.875 m is a smudge. Those regions get half-size
// facets (0.9375 m), which is the difference between "a step" and "a step you
// can see the edge of". Everything else stays coarse so the budget holds:
// 54 coarse chunks + 10 fine ones is ~193 k triangles in 64 draw calls.
const CHUNKS = 8;                          // per axis -> 64 meshes
const QUADS = 32;                          // coarse quads per chunk axis
const FINE_QUADS = 64;                     // hero-region quads per chunk axis
const CHUNK_SIZE = WORLD.SIZE / CHUNKS;    // 60 m
const STEP = CHUNK_SIZE / QUADS;           // 1.875 m between grid lines
const FINE_STEP = CHUNK_SIZE / FINE_QUADS; // 0.9375 m — also the jitter lattice
const MAX_VERTS = FINE_QUADS + 1;
const MAX_PAD = MAX_VERTS + 2;             // padded height grid for normals

// Circles (world x, z, radius) that earn the fine grid. Kept deliberately
// tight: a chunk qualifies if the circle reaches its bounding box at all, so
// a generous radius here costs whole 8192-triangle chunks.
const HERO_REGIONS = [
  { x: 0, z: 0, r: 56 },      // Paper Palace mesa
  { x: 160, z: 0, r: 48 },    // Sky Cliffs plateau + its cliff bands
];

// ── Colour shaping ──────────────────────────────────────────────────────
// Shepard-style inverse-power blend over normalised biome distance. POWER
// controls how wide the paper-to-paper gradient at a border is: higher =
// crisper cores, narrower seam. 2.5 gives roughly a 12-25 m gradient band
// between neighbouring biome discs, which reads as a deliberate blend rather
// than either a hard edge or mud.
const BLEND_POWER = 2.5;
const BLEND_EPS = 0.02;    // keeps the biome centre finite and saturated
const BLEND_K = 3;         // only the 3 nearest biomes contribute

// Slope -> biome accent, i.e. hillsides and cliffs are a second sheet of
// paper laid over the ground sheet. Calibrated against THIS heightfield: on
// the shipped seed only the palace flanks and the sky cliffs ever pass
// cos(45 deg), so a ramp that starts there would be invisible on 98% of the
// island. Instead the ramp OPENS at ~17 deg (a touch of accent on ordinary
// hillsides, which is what gives the terrain large-scale tonal structure)
// and reaches FULL accent at cos(45 deg) exactly, so real cliffs still read
// as a hard second layer.
const CLIFF_NY_FLAT = 0.955;    // cos(17 deg) — ramp opens
const CLIFF_NY_STEEP = 0.707;   // cos(45 deg) — ramp saturates
const CLIFF_MIX = 0.85;         // max pull toward accent on a cliff face

// Beaches. shoreDistance() is first-order height/|gradient|, which blows up
// on the flat coastal shelf (23 m "from shore" while standing 3 m above the
// waterline), so it alone yields a hairline beach. Height above water is the
// reliable cue on flats, shoreDistance the reliable one on slopes — take
// whichever says we are CLOSER and the band hugs the waterline everywhere.
const SHORE_FULL = 0.5;    // <= this is all sand
const SHORE_FADE = 10.0;   // >= this is pure biome ground
const SHORE_MIX = 0.9;
const HEIGHT_TO_SHORE = 2.2;   // metres of altitude -> metres of "shore-ness"
const SHORE_GUARD = 18;    // skip the shoreDistance() call outside this |h|
const CLIFF_KEEPS_ROCK = 0.7;  // sea cliffs stay cliff paper, not beach

// Wet sand — the band the swash keeps damp between waves.
//
// This is the cue that glues the water sheet to the beach. Without it the
// ocean is a coloured plane LAID ON the island; with it the island is visibly
// wet where the sea has just been, and the eye reads one continuous surface.
// It has to live here rather than in the water shader because the wet paper is
// *land*: it must still be there when the swash has drawn back off it.
//
// Damp paper goes darker and COOLER, so the tint leans toward PAPER.tealD —
// the palette law's shadow family. Darkening toward grey (what a photograph
// would do) is exactly the move that would break the papercut read.
const WET_BAND = 2.8;      // metres of shore-ness that stay damp
const WET_MIX = 0.45;      // strength at the waterline
const WET_TEAL = 0.55;     // how far damp sand leans into the teal shadow
const WET_LOW = -1.6;      // below this the seabed tint already owns the colour

// Cliff strata — what actually sells "cut paper geology". Steep faces are
// banded by altitude, each band cut from one of three sheets (see
// strataSheet): the accent as laid, a pale sheet, or a pull back toward the
// biome ground paper. Two like bands in a row read as one thick layer, which is
// how real strata look.
//
// TWO decisions here are load-bearing.
//
// (1) The band is applied PER VERTEX, not per triangle.
//
//     It used to be per triangle, on the reasoning that a flat tint per facet
//     gives a hard papercut step while interpolating turns the edge to mush.
//     That reasoning is right about a FACE and wrong about a BOUNDARY. A band
//     edge is a horizontal plane; a facet on a 74 deg cliff is 0.94 m wide and
//     3.3 m tall in altitude; so the two triangles of one quad straddle that
//     plane at different centroid heights and land in different bands. The
//     boundary therefore zigzags by half a facet, all the way along itself, and
//     that zigzag was the single most-cited artifact in the critique: "sawtooth
//     vertical striping that reads as a shading artifact rather than
//     stratigraphy". It is not fixable by tuning the tear, because it is not
//     caused by the tear — it is per-facet quantisation of a sub-facet feature.
//
//     Per vertex, the boundary interpolates across ONE facet instead of
//     zigzagging along its whole length. On the hero landforms that is a 3.3 m
//     transition inside a 13 m band: 25% soft edge, 75% flat sheet, which is
//     what a torn paper edge looks like anyway. The papercut hardness the old
//     comment was protecting still comes from where it always came from — the
//     baked flat face normals — plus a small per-facet tone below.
//
// (2) STRATA_BAND is five terrace bands, not one. A 74 deg cliff sampled every
//     0.94 m only carries a vertex every ~3.3 m of ALTITUDE, so a 2.6 m band is
//     below the mesh's Nyquist limit and aliases into blotches (this was
//     measured, not guessed). At 13 m each cliff tier reads as one or two clean
//     sheets — which is exactly the layered-paper read we want anyway.
const STRATA_BAND = TERRACE_BAND * 5;
const STRATA_CREAM = 0.50;   // pull toward cream on a light band
const STRATA_GROUND = 0.80;   // pull back toward ground paper on a dark band
// (0.80 is high on purpose: with the accent mix at 0.85 a cliff is otherwise
// ALL accent, and the palace mesa reads as one uniform tan mass. The dark
// stratum has to pull most of the way back to the ground paper to put the
// biome's second colour back on the rock.)
const STRATA_PHASE = 0.35;   // offsets the tint edge off the terrace riser
const STRATA_NY_IN = 0.38;   // in units of `steep`: ~31 deg, strata fade in
const STRATA_NY_FULL = 0.8;  // ~41 deg, full strata — rock, not hillside

// The deckle edge on a band boundary, in bands.
//
// This number used to be 0.85, and it was the single most visible artifact in
// the whole build: a 0.94 m facet on a 74-degree face spans ~3.3 m of ALTITUDE,
// so ±4.4 m of boundary wander re-rolls the band from one triangle to the next
// and the cliff grows a field of triangular teeth. The teeth were the mesh
// resolution made visible, not geology. 0.26 (≈2.7 m) wanders the edge at ROCK
// scale — a couple of facets — and reads as a torn sheet rather than a saw.
//
// It is driven by two octaves: a 6 m one for the tear itself and an 18 m one to
// stop the tear repeating at a single frequency, both sampled in WORLD space at
// the vertex, so the wander is continuous across chunk seams.
const STRATA_TEAR = 0.26;
const STRATA_TEAR_FREQ = 1 / 6;

// Alternate strata differ in VALUE, not only in hue. Without this every band on
// a cliff carried the same luminance, three hues of it, and the face read flat
// however many bands it had. Applied as a mix toward the teal shadow paper (odd
// bands) or the cream paper (even) rather than as a multiply, so a darker
// stratum is a different colour FAMILY — which is the papercut law and also
// exactly what real bedding looks like.
const STRATA_VALUE = 0.24;

// How much of each band feathers into the next.
//
// Even per vertex, a HARD band index still switches inside one lattice row, and
// on a 70-degree face one lattice row is 2.5 m of altitude — so the boundary is
// a jagged polyline through the lattice and reads, again, as interlocking
// triangles. Feathering the top of every band spreads the transition over two
// or three rows, which is what turns a quantisation edge into a torn one.
const STRATA_SOFT = 0.28;

// Per-facet value jitter. Deliberately tiny: it keeps every triangle its own
// sheet of paper (which is the whole look) while staying well under the
// threshold at which per-facet variation organises itself into visible teeth.
const FACET_TONE = 0.020;

// ── Ground splat: three sheets over the biome paper ─────────────────────
// A single albedo per biome is why the cliffs read as one grey, the palace as
// two flat bands and the market as uniform saffron. These are the cheapest
// three masks that carry real information about the surface:
//
//   DRY    a low-frequency mask — patches of parched grass on the flats.
//   HUE    a second low-frequency mask drifting the flat ground toward its own
//          biome accent, so a meadow is two greens and not one.
//   DIRT   concave curvature — gullies and the inside corners of benches,
//          where water and debris collect.
//   SCREE  convex curvature on steep ground — the slope breaks and lips where
//          rock is stripped bare. This is what backfills the cliff faces that
//          used to be one flat value with plants dusted over them.
const SPLAT_DRY_FREQ = 1 / 34;
const SPLAT_DRY_MIX = 0.17;
const SPLAT_HUE_FREQ = 1 / 23;
const SPLAT_HUE_MIX = 0.16;
const DIRT_MIX = 0.34;
const SCREE_MIX = 0.42;
// Curvature stencil, and the thresholds keyed to what it actually measures on
// this island: at a 3 m stencil the land is symmetric about zero with p75 at
// 0.06 and p90 at 0.24, so a threshold of ~0.3 means "the top tenth of hollows
// and lips", which is where dirt collects and rock is stripped. Thresholds an
// order of magnitude lower (the first attempt) saturate on every hillside and
// turn the ground into confetti.
// PROBE_N covers a 60 m chunk at PROBE_STEP plus the two-node margin the
// central differences and the bilinear lookup each need on both sides.
const CURV_EPS = 3.0;
const PROBE_N = Math.ceil(CHUNK_SIZE / CURV_EPS) + 4;
const DIRT_K = 0.36;         // curvature (1/m) at which a gully is full dirt
const SCREE_K = 0.30;

// ── Baked curvature shading ────────────────────────────────────────────
// Discrete Laplacian of the (unjittered) height grid, i.e. concavity. Concave
// ground picks up the teal shadow paper, convex ground picks up cream. That is
// contact darkening in the inside corner of every bench and a lift on every
// lip — form, at zero runtime cost, on ground the sun barely differentiates.
// It is a MIX toward PAPER.shadow, never a multiply: darkening a sage by
// scaling it heads toward black, and there is no black in this world.
const AO_K = 0.30;
const AO_DARK = 0.19;
const AO_LIFT = 0.07;

// Roads, plazas and building footings. heightfield.wearAt() measures exactly
// the same falloffs that CUT the ground, so paint and cut cannot drift: a pad
// that levels the geometry but leaves the colour alone still reads as a
// building standing on a lawn.
const WEAR_MIX = 0.72;

// Submerged shelf fades to deep teal so the coastline reads through water.
const SEABED_DEPTH = 9;
const SEABED_MIX = 0.65;

// Paper is never perfectly even; keep the total swing inside +-4%.
// Paper is never perfectly even, and NEITHER IS GROUND. Two octaves, because
// one 26 m patch field is invisible inside a 15 m close-up frame and invisible
// again at 200 m: the coarse octave gives the establishing shot its tonal
// structure, the 7 m octave gives the close-up something per square metre.
const TONE_PATCH = 0.052;  // low-frequency mottling
const TONE_FINE = 0.030;   // metre-scale mottling
const TONE_GRAIN = 0.012;  // per-vertex fibre
const TONE_PATCH_FREQ = 1 / 26;
const TONE_FINE_FREQ = 1 / 7;
const ALTITUDE_LIFT = 0.05;   // summits read lighter (aerial separation)
const ALTITUDE_SPAN = 70;

// Breaks the visible grid: verts slide within +-JITTER*step in XZ. Keyed off
// indices on the GLOBAL FINE lattice — a coarse vertex simply lands on an even
// index — so a vertex shared by two chunks gets the same offset whatever the
// two chunks' resolutions are, and the seam stays watertight.
//
// The ceiling is set by triangle flipping, not by taste. A quad's short
// diagonal clears the opposite corner by step/sqrt(2); if the corner and the
// two diagonal ends can between them cover that gap, the triangle turns inside
// out, its baked face normal points down, and back-face culling punches a hole
// in the cliff. Two vertices leaning at JITTER*step along the diagonal spend
// 2*sqrt(2)*JITTER*step, so JITTER must stay under 0.25; 0.22 leaves a 12%
// margin and is still enough to kill the corduroy read of a regular grid.
// (This is also why amplitude is chosen by lattice NEIGHBOURHOOD below rather
// than by the vertex's own spacing — a coarse-amplitude vertex sitting inside
// a fine chunk was exactly the case that flipped.)
const JITTER = 0.22;
// ...scaled down to this fraction on a cliff face. See the long note at the
// jitter site: on steep ground the same lateral offset becomes a large vertical
// one, and the facet-normal scatter it produces is what a toon ramp turns into
// sawtooth striping.
const JITTER_CLIFF = 0.18;

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** Integer hash -> [0,1). Local copy: heightfield's is private and we must
 *  not perturb its noise stream. */
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bilinear value noise -> [0,1). Used only for tonal mottling. */
function toneNoise(x, z, seed) {
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

/**
 * Which of the three sheets a stratum band is cut from: 0 = the accent as
 * laid, 1 = the pale sheet, 2 = pulled back toward the biome ground paper.
 *
 * CYCLED, not hashed. A pure hash draws each band independently, and a hero
 * landform only carries four or five bands in total — so the palace mesa drew
 * "accent" for every visible band on the shipped seed and rendered as one
 * uniform tan mass, which is exactly the "two flat bands / one albedo" note in
 * the critique. Cycling guarantees all three sheets appear on any face tall
 * enough to have three bands; the hashed skip keeps it from reading as a
 * repeating pattern and produces the occasional doubled band, which is what
 * makes two adjacent layers read as one thick bed.
 */
function strataSheet(band, seed) {
  let idx = band % 3;
  if (idx < 0) idx += 3;
  if (hash2(band, 7, seed) > 0.72) idx = (idx + 1) % 3;
  return idx;
}

/** PAPER int -> linear-space rgb triple (vertex colours are linear in r170). */
function linearRGB(hex) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

/**
 * Build the island.
 *
 * @param {{sampleHeight:Function, shoreDistance:Function, seed:number}} heightfield
 * @param {{ chunks?:number, quads?:number, castShadow?:boolean }} [opts]
 * @returns {{ group:THREE.Group, chunkCount:number, triangleCount:number,
 *             vertexCount:number, material:THREE.Material, dispose:Function }}
 */
export function createTerrain(heightfield, opts = {}) {
  const { sampleHeight, shoreDistance } = heightfield;
  // Tolerated missing on hand-rolled test doubles; a world with no civil layer
  // simply has nothing worn in it.
  const wearAt = heightfield.wearAt || (() => 0);
  const seed = (heightfield.seed ?? WORLD.SEED) | 0;
  const castShadow = opts.castShadow !== false;

  // ── Flattened biome tables (hot loop touches arrays only) ──
  const nB = BIOMES.length;
  const bx = new Float64Array(nB), bz = new Float64Array(nB), br2 = new Float64Array(nB);
  const gR = new Float64Array(nB), gG = new Float64Array(nB), gB = new Float64Array(nB);
  const aR = new Float64Array(nB), aG = new Float64Array(nB), aB = new Float64Array(nB);
  for (let i = 0; i < nB; i++) {
    const b = BIOMES[i];
    bx[i] = b.center[0]; bz[i] = b.center[1];
    br2[i] = b.radius * b.radius;
    const g = linearRGB(b.palette.ground), a = linearRGB(b.palette.accent);
    gR[i] = g[0]; gG[i] = g[1]; gB[i] = g[2];
    aR[i] = a[0]; aG[i] = a[1]; aB[i] = a[2];
  }
  const SAND = linearRGB(PAPER.sand);
  const SEABED = linearRGB(PAPER.tealD);
  const CREAM = linearRGB(PAPER.cream);   // the pale stratum
  const SHADOW = linearRGB(PAPER.shadow); // the only darkening paper we own
  // Damp sand: the beach paper leaning into the teal shadow family.
  const WETSAND = SAND.map((v, i) => v + (SEABED[i] - v) * WET_TEAL);
  // Splat sheets, all mixed from PAPER — damp earth is sand walked toward the
  // teal shadow family, scree is cream walked toward sand, pavers are sand
  // walked toward shaded cream.
  const DIRT = SAND.map((v, i) => v + (SEABED[i] - v) * 0.30);
  const SCREE = CREAM.map((v, i) => v + (SAND[i] - v) * 0.55);
  const CREAMD = linearRGB(PAPER.creamD);
  // Pavers lean CREAM, not sand: against Market Town's gold ground a sand-based
  // stone was a 4% value shift and the plaza simply did not read. Cream-based
  // flagstone separates from gold ochre AND from meadow sage, which is what a
  // road has to do to be a road in both places.
  const PAVER = CREAM.map((v, i) => v + (SAND[i] - v) * 0.30);

  // ── Triangle corner order, one table per resolution ──
  // Diagonals alternate in a checkerboard so the facets do not form a
  // corduroy grain running one way across the whole island. Winding is CCW
  // seen from +Y, so every face normal points up out of the ground.
  function cornerTable(q) {
    const v = q + 1;
    const t = new Uint16Array(q * q * 6);
    let ci = 0;
    for (let j = 0; j < q; j++) {
      for (let i = 0; i < q; i++) {
        const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
        if (((i + j) & 1) === 0) {
          t[ci++] = a; t[ci++] = c; t[ci++] = b;
          t[ci++] = b; t[ci++] = c; t[ci++] = d;
        } else {
          t[ci++] = a; t[ci++] = c; t[ci++] = d;
          t[ci++] = a; t[ci++] = d; t[ci++] = b;
        }
      }
    }
    return t;
  }
  const CORNER = [cornerTable(QUADS), cornerTable(FINE_QUADS)];

  // ── Which chunks earn the fine grid (circle vs chunk AABB) ──
  const fineChunk = new Uint8Array(CHUNKS * CHUNKS);
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const x0 = -WORLD.HALF + cx * CHUNK_SIZE;
      const z0 = -WORLD.HALF + cz * CHUNK_SIZE;
      for (const R of HERO_REGIONS) {
        const px = Math.min(x0 + CHUNK_SIZE, Math.max(x0, R.x));
        const pz = Math.min(z0 + CHUNK_SIZE, Math.max(z0, R.z));
        const dx = R.x - px, dz = R.z - pz;
        if (dx * dx + dz * dz < R.r * R.r) { fineChunk[cz * CHUNKS + cx] = 1; break; }
      }
    }
  }

  // ── Shared material: white base so vertex colour IS the colour ──
  // No flatShading flag — see the header; the facets live in the geometry.
  //
  // The paper layer is keyed to WORLD space, which is the only choice that
  // works here: every chunk has its own local origin, so local-space grain
  // would restart at each of the 64 seams. The 3.5 m tile puts the fibre field
  // at roughly two tiles per terrain facet — fine enough to read as surface
  // rather than as pattern, coarse enough that the far side of the island is
  // safely in the mip chain and never shimmers. Triplanar on, because cliff
  // faces are exactly where a top-down projection would smear.
  const material = papercutMaterial(0xffffff, {
    vertexColors: true,
    grain: 0.09,
    normal: 0.13,
    roughnessLike: 0.22,
    scale: 2.6,
    triplanar: true,
    space: 'world',
  });

  const group = new THREE.Group();
  group.name = 'terrain';

  /**
   * Jitter amplitude for a point on the global fine lattice.
   *
   * MUST be a pure function of (gi, gj) and the resolution map, because a
   * vertex on a chunk seam is computed independently by both chunks and the
   * two answers have to agree to the bit. Coarse-lattice points get the full
   * coarse amplitude only where every chunk touching them is coarse; anywhere
   * a fine chunk is involved, the fine amplitude applies to everyone, which is
   * what keeps fine quads from inverting (see JITTER).
   */
  function jitterAmp(gi, gj) {
    if (((gi | gj) & 1) !== 0) return JITTER * FINE_STEP;
    const clamp = (v) => (v < 0 ? 0 : v > CHUNKS - 1 ? CHUNKS - 1 : v);
    const c0 = clamp(Math.floor((gi - 1) / FINE_QUADS));
    const c1 = clamp(Math.floor(gi / FINE_QUADS));
    const r0 = clamp(Math.floor((gj - 1) / FINE_QUADS));
    const r1 = clamp(Math.floor(gj / FINE_QUADS));
    if (fineChunk[r0 * CHUNKS + c0] || fineChunk[r0 * CHUNKS + c1]
      || fineChunk[r1 * CHUNKS + c0] || fineChunk[r1 * CHUNKS + c1]) return JITTER * FINE_STEP;
    return JITTER * STEP;
  }

  // Scratch reused across chunks — no allocation inside the vertex loops.
  // Sized for the FINE grid so one buffer serves both resolutions.
  const grid = new Float64Array(MAX_PAD * MAX_PAD);   // padded lattice heights
  // Landform probe: height, concavity and slope on a GLOBAL 3 m lattice.
  //
  // Sampling those four extra heights per terrain vertex costs ~400 k
  // sampleHeight calls and a third of the build; sampling them once per 3 m and
  // interpolating costs 34 k. And because the lattice is global — indexed off
  // -WORLD.HALF, not off the chunk origin — every chunk that touches a probe
  // node computes the identical value from it and the identical bilinear
  // weights, so the result is still bit-identical across a chunk seam. That is
  // the property the jitter damping depends on: disagree by one ULP there and
  // the seam opens a crack.
  const probeH = new Float64Array(PROBE_N * PROBE_N);
  const probeCurv = new Float64Array(PROBE_N * PROBE_N);
  const probeNy = new Float64Array(PROBE_N * PROBE_N);
  const latPos = new Float64Array(MAX_VERTS * MAX_VERTS * 3);  // chunk-local
  const latCol = new Float64Array(MAX_VERTS * MAX_VERTS * 3);
  const wIdx = new Int32Array(BLEND_K);
  const wVal = new Float64Array(BLEND_K);
  const geometries = [];
  const GLOBAL_FINE = CHUNKS * FINE_QUADS;   // world lattice index range
  let triangleCount = 0;

  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const isFine = fineChunk[cz * CHUNKS + cx] === 1;
      const quads = isFine ? FINE_QUADS : QUADS;
      const VERTS = quads + 1;
      const PAD = VERTS + 2;
      const step = CHUNK_SIZE / quads;
      const sub = isFine ? 1 : 2;         // global fine indices per vertex step
      const corner = CORNER[isFine ? 1 : 0];
      const TRIS = quads * quads * 2;
      const x0 = -WORLD.HALF + cx * CHUNK_SIZE;
      const z0 = -WORLD.HALF + cz * CHUNK_SIZE;
      const ox = x0 + CHUNK_SIZE / 2;   // chunk centre -> mesh position
      const oz = z0 + CHUNK_SIZE / 2;

      // Probe lattice for this chunk, snapped to the global 3 m grid.
      const pi0 = Math.floor((x0 + WORLD.HALF) / CURV_EPS) - 1;
      const pj0 = Math.floor((z0 + WORLD.HALF) / CURV_EPS) - 1;
      for (let j = 0; j < PROBE_N; j++) {
        const pz = -WORLD.HALF + (pj0 + j) * CURV_EPS;
        for (let i = 0; i < PROBE_N; i++) {
          probeH[j * PROBE_N + i] = sampleHeight(-WORLD.HALF + (pi0 + i) * CURV_EPS, pz);
        }
      }
      for (let j = 1; j < PROBE_N - 1; j++) {
        for (let i = 1; i < PROBE_N - 1; i++) {
          const q = j * PROBE_N + i;
          const hpx = probeH[q + 1], hmx = probeH[q - 1];
          const hpz = probeH[q + PROBE_N], hmz = probeH[q - PROBE_N];
          probeCurv[q] = (hpx + hmx + hpz + hmz - 4 * probeH[q]) / (CURV_EPS * CURV_EPS);
          const pgx = (hpx - hmx) / (2 * CURV_EPS), pgz = (hpz - hmz) / (2 * CURV_EPS);
          probeNy[q] = 1 / Math.sqrt(pgx * pgx + 1 + pgz * pgz);
        }
      }

      // Regular height grid with a one-node ring of padding, so the slope at
      // every lattice point below has neighbours on both sides.
      for (let j = -1; j <= VERTS; j++) {
        const wz = z0 + j * step;
        for (let i = -1; i <= VERTS; i++) {
          grid[(j + 1) * PAD + (i + 1)] = sampleHeight(x0 + i * step, wz);
        }
      }

      // ── Pass 1: lattice. Place and colour the grid points. ──
      for (let j = 0; j < VERTS; j++) {
        const gj = cz * FINE_QUADS + j * sub;    // global FINE lattice row
        for (let i = 0; i < VERTS; i++) {
          const gi = cx * FINE_QUADS + i * sub;  // global FINE lattice column
          const v = j * VERTS + i;

          // --- landform probe at a FIXED 3 m scale, on the UNJITTERED point ---
          //
          // Bilinear lookup into the probe lattice built above. It buys two
          // things nothing else here can provide, and both are read at the
          // LATTICE position rather than the jittered one so both are pure
          // functions of (gi, gj):
          //
          //   curv     concavity for the baked AO and the dirt/scree splat. The
          //            free Laplacian of the padded grid measures curvature at
          //            whatever the chunk's own spacing happens to be — 0.94 m
          //            on the fine chunks, small enough that the answer is
          //            dominated by the terrain's finest noise octave. Measured:
          //            adjacent facets on a FLAT bench came out 65% apart in
          //            colour, i.e. those terms were reading noise and painting
          //            it as form. A 3 m stencil leaves landform curvature.
          //   wideNy   slope at a resolution-independent scale, which is what
          //            makes the jitter damping below safe on a chunk seam.
          const ux0 = x0 + i * step, uz0 = z0 + j * step;
          const p = (j + 1) * PAD + (i + 1);
          const pfx = (ux0 + WORLD.HALF) / CURV_EPS - pi0;
          const pfz = (uz0 + WORLD.HALF) / CURV_EPS - pj0;
          const pix = Math.floor(pfx), piz = Math.floor(pfz);
          const tpx = pfx - pix, tpz = pfz - piz;
          const q00 = piz * PROBE_N + pix, q10 = q00 + 1;
          const q01 = q00 + PROBE_N, q11 = q01 + 1;
          const curv = (probeCurv[q00] * (1 - tpx) + probeCurv[q10] * tpx) * (1 - tpz)
            + (probeCurv[q01] * (1 - tpx) + probeCurv[q11] * tpx) * tpz;
          const wideNy = (probeNy[q00] * (1 - tpx) + probeNy[q10] * tpx) * (1 - tpz)
            + (probeNy[q01] * (1 - tpx) + probeNy[q11] * tpx) * tpz;

          // --- position (jittered, seam-safe) ---
          // Amplitude is a function of the GLOBAL lattice parity, not of this
          // chunk's resolution, so a vertex shared by a coarse and a fine
          // chunk gets bit-identical x/z from both. Coarse-lattice points
          // (even/even) keep the full 26% of the coarse step; the in-between
          // fine points get 26% of the fine step, which is small enough that
          // no neighbouring pair can ever cross and flip a triangle.
          //
          // ...and it is damped on steep ground, which is the OTHER half of the
          // sawtooth fix. Jitter exists to break the corduroy read of a regular
          // grid on open ground, where sliding a vertex 20 cm sideways barely
          // moves it vertically. On a 70-degree face the same 20 cm moves it
          // 55 cm up or down, neighbouring facets end up several degrees apart
          // in normal, and a toon ramp turns a few degrees of disagreement into
          // a hard step that zigzags along the triangle edges. That is the
          // interlocking-triangle striping the critique read as "a shading
          // artifact rather than stratigraphy". The damping is keyed to wideNy
          // above precisely BECAUSE it is resolution-independent: a shared
          // lattice point must get an identical offset from both chunks or the
          // seam opens.
          const onEdge = gi === 0 || gj === 0 || gi === GLOBAL_FINE || gj === GLOBAL_FINE;
          let jx = 0, jz = 0;
          if (!onEdge) {
            const amp = jitterAmp(gi, gj)
              * (JITTER_CLIFF + (1 - JITTER_CLIFF) * smoothstep(0.52, 0.90, wideNy));
            jx = (hash2(gi, gj, seed ^ 0x51ed) - 0.5) * 2 * amp;
            jz = (hash2(gi, gj, seed ^ 0x2f13) - 0.5) * 2 * amp;
          }
          const wx = ux0 + jx;
          const wz = uz0 + jz;
          const h = sampleHeight(wx, wz);
          latPos[v * 3] = wx - ox;
          latPos[v * 3 + 1] = h;
          latPos[v * 3 + 2] = wz - oz;

          // --- slope, for the cliff test ---
          // Central differences at MESH resolution describe the facet the
          // player actually sees, and reuse the grid above instead of
          // spending 4 more samples.
          const gx = (grid[p + 1] - grid[p - 1]) / (2 * step);
          const gz = (grid[p + PAD] - grid[p - PAD]) / (2 * step);
          const ny = 1 / Math.sqrt(gx * gx + 1 + gz * gz);   // normal.y

          // --- biome blend: 3 nearest by normalised distance ---
          wIdx[0] = wIdx[1] = wIdx[2] = -1;
          wVal[0] = wVal[1] = wVal[2] = Infinity;
          for (let b = 0; b < nB; b++) {
            const dx = wx - bx[b], dz = wz - bz[b];
            const q = (dx * dx + dz * dz) / br2[b];
            if (q < wVal[0]) {
              wVal[2] = wVal[1]; wIdx[2] = wIdx[1];
              wVal[1] = wVal[0]; wIdx[1] = wIdx[0];
              wVal[0] = q; wIdx[0] = b;
            } else if (q < wVal[1]) {
              wVal[2] = wVal[1]; wIdx[2] = wIdx[1];
              wVal[1] = q; wIdx[1] = b;
            } else if (q < wVal[2]) {
              wVal[2] = q; wIdx[2] = b;
            }
          }
          let r = 0, g = 0, bl = 0, ar = 0, ag = 0, ab = 0, wsum = 0;
          for (let k = 0; k < BLEND_K; k++) {
            const b = wIdx[k];
            if (b < 0) continue;
            const w = Math.pow(wVal[k] + BLEND_EPS, -BLEND_POWER);
            wsum += w;
            r += gR[b] * w; g += gG[b] * w; bl += gB[b] * w;
            ar += aR[b] * w; ag += aG[b] * w; ab += aB[b] * w;
          }
          const iw = 1 / wsum;
          r *= iw; g *= iw; bl *= iw;
          ar *= iw; ag *= iw; ab *= iw;

          // --- cliffs become the accent sheet ---
          // The ground sheet is stashed FIRST, because the strata block below
          // pulls its dark stratum back toward it and the accent mix would
          // otherwise have already destroyed it.
          const gnd0 = r, gnd1 = g, gnd2 = bl;
          const steep = 1 - smoothstep(CLIFF_NY_STEEP, CLIFF_NY_FLAT, ny);
          if (steep > 0) {
            const t = steep * CLIFF_MIX;
            r += (ar - r) * t; g += (ag - g) * t; bl += (ab - bl) * t;
          }

          // --- cliff strata ---
          // Banded by altitude, each band hashed to one of three sheets, and
          // independently stepped in value by band parity. Steepness is
          // re-ramped rather than reused: the accent mix opens at 17 deg so
          // ordinary hillsides pick up tonal structure, but strata on a 30 deg
          // grass slope are just pale blotches. Strata belong to rock.
          const steepT = smoothstep(STRATA_NY_IN, STRATA_NY_FULL, steep);
          if (steepT > 0.02) {
            const tear = (toneNoise(wx * STRATA_TEAR_FREQ, wz * STRATA_TEAR_FREQ, seed ^ 0x3c8b) - 0.5) * 0.7
              + (toneNoise(wx * STRATA_TEAR_FREQ * 0.34 + 19.1, wz * STRATA_TEAR_FREQ * 0.34 - 5.3,
                seed ^ 0x91a7) - 0.5) * 1.3;
            const bf = (h + tear * STRATA_BAND * STRATA_TEAR) / STRATA_BAND + STRATA_PHASE;
            const b0 = Math.floor(bf);
            const feather = smoothstep(1 - STRATA_SOFT, 1, bf - b0);
            // Sheet weights for this band and the next, lerped by the feather.
            let cA = 0, gA = 0, dA = 0, lA = 0;
            const shA = strataSheet(b0, seed ^ 0x5747);
            if (shA === 1) cA = STRATA_CREAM; else if (shA === 2) gA = STRATA_GROUND;
            if (b0 & 1) dA = STRATA_VALUE; else lA = STRATA_VALUE * 0.5;
            let cM = cA, gM = gA, dM = dA, lM = lA;
            if (feather > 0) {
              const b1 = b0 + 1;
              let cB = 0, gB = 0, dB = 0, lB = 0;
              const shB = strataSheet(b1, seed ^ 0x5747);
              if (shB === 1) cB = STRATA_CREAM; else if (shB === 2) gB = STRATA_GROUND;
              if (b1 & 1) dB = STRATA_VALUE; else lB = STRATA_VALUE * 0.5;
              cM += (cB - cA) * feather; gM += (gB - gA) * feather;
              dM += (dB - dA) * feather; lM += (lB - lA) * feather;
            }
            if (cM > 0) {
              const t = steepT * cM;
              r += (CREAM[0] - r) * t; g += (CREAM[1] - g) * t; bl += (CREAM[2] - bl) * t;
            }
            if (gM > 0) {
              const t = steepT * gM;
              r += (gnd0 - r) * t; g += (gnd1 - g) * t; bl += (gnd2 - bl) * t;
            }
            if (dM > 0) {
              const t = steepT * dM;
              r += (SHADOW[0] - r) * t; g += (SHADOW[1] - g) * t; bl += (SHADOW[2] - bl) * t;
            }
            if (lM > 0) {
              const t = steepT * lM;
              r += (CREAM[0] - r) * t; g += (CREAM[1] - g) * t; bl += (CREAM[2] - bl) * t;
            }
          }

          // --- splat: dry grass, hue drift, gully dirt, slope-break scree ---
          // Ordered BEFORE the beach so sand still wins at the waterline, and
          // before the tone pass so the mottling rides on top of it.
          const flatT = 1 - steep;
          if (flatT > 0.02) {
            const dryN = toneNoise(wx * SPLAT_DRY_FREQ, wz * SPLAT_DRY_FREQ, seed ^ 0x2d4f) * 0.68
              + toneNoise(wx * SPLAT_DRY_FREQ * 3.7 + 4.2, wz * SPLAT_DRY_FREQ * 3.7 + 9.6, seed ^ 0x8c05) * 0.32;
            const dry = smoothstep(0.44, 0.88, dryN) * flatT * SPLAT_DRY_MIX;
            if (dry > 0) {
              r += (SAND[0] - r) * dry; g += (SAND[1] - g) * dry; bl += (SAND[2] - bl) * dry;
            }
            // Second sheet of the biome's OWN accent over its flats. A meadow
            // made of one green is a billiard table; two greens in soft
            // low-frequency patches is a meadow.
            const hueN = toneNoise(wx * SPLAT_HUE_FREQ + 11.3, wz * SPLAT_HUE_FREQ - 7.7, seed ^ 0x6b21) * 0.66
              + toneNoise(wx * SPLAT_HUE_FREQ * 3.1 - 2.4, wz * SPLAT_HUE_FREQ * 3.1 + 6.8, seed ^ 0x3f19) * 0.34;
            const hue = smoothstep(0.32, 0.90, hueN) * flatT * SPLAT_HUE_MIX;
            if (hue > 0) {
              r += (ar - r) * hue; g += (ag - g) * hue; bl += (ab - bl) * hue;
            }
          }
          const dirt = smoothstep(0, DIRT_K, curv) * DIRT_MIX * (0.35 + 0.65 * steep);
          if (dirt > 0) {
            r += (DIRT[0] - r) * dirt; g += (DIRT[1] - g) * dirt; bl += (DIRT[2] - bl) * dirt;
          }
          const scree = smoothstep(0, SCREE_K, -curv) * steep * SCREE_MIX;
          if (scree > 0) {
            r += (SCREE[0] - r) * scree; g += (SCREE[1] - g) * scree; bl += (SCREE[2] - bl) * scree;
          }

          // --- beaches (flat coast only; sea cliffs keep their rock) ---
          if (h > -SHORE_GUARD && h < SHORE_GUARD) {
            const dh = (h - WORLD.WATER_Y) * HEIGHT_TO_SHORE;
            const d = Math.min(shoreDistance(wx, wz), dh);
            let sand = 1 - smoothstep(SHORE_FULL, SHORE_FADE, d);
            sand *= 1 - steep * CLIFF_KEEPS_ROCK;
            if (sand > 0) {
              const t = sand * SHORE_MIX;
              r += (SAND[0] - r) * t; g += (SAND[1] - g) * t; bl += (SAND[2] - bl) * t;
            }
            // Wet sand. Keyed to the SAME `d` the beach uses, so the damp band
            // and the water shader's foam bands are measured off one shoreline
            // and cannot drift apart. The upper edge of the smoothstep is the
            // high-tide line, which is what makes the beach read as a beach
            // rather than as a strip of pale ground.
            if (h > WET_LOW) {
              const wet = (1 - smoothstep(0.25, WET_BAND, d)) * (1 - steep * CLIFF_KEEPS_ROCK);
              if (wet > 0) {
                const t = wet * WET_MIX;
                r += (WETSAND[0] - r) * t; g += (WETSAND[1] - g) * t; bl += (WETSAND[2] - bl) * t;
              }
            }
          }

          // --- submerged shelf sinks toward deep teal ---
          if (h < WORLD.WATER_Y) {
            const t = smoothstep(0, SEABED_DEPTH, WORLD.WATER_Y - h) * SEABED_MIX;
            r += (SEABED[0] - r) * t; g += (SEABED[1] - g) * t; bl += (SEABED[2] - bl) * t;
          }

          // --- worn ground: roads, plaza, building footings ---
          if (h > WORLD.WATER_Y - 0.5) {
            const wear = wearAt(wx, wz);
            if (wear > 0) {
              const t = wear * WEAR_MIX;
              r += (PAVER[0] - r) * t; g += (PAVER[1] - g) * t; bl += (PAVER[2] - bl) * t;
            }
          }

          // --- baked curvature: teal in the hollows, cream on the lips ---
          const aoC = smoothstep(0, AO_K, curv) * AO_DARK;
          if (aoC > 0) {
            r += (SHADOW[0] - r) * aoC; g += (SHADOW[1] - g) * aoC; bl += (SHADOW[2] - bl) * aoC;
          } else {
            const aoV = smoothstep(0, AO_K, -curv) * AO_LIFT;
            if (aoV > 0) {
              r += (CREAM[0] - r) * aoV; g += (CREAM[1] - g) * aoV; bl += (CREAM[2] - bl) * aoV;
            }
          }

          // --- paper tone: patchy mottling + fibre grain + altitude lift ---
          const patch = toneNoise(wx * TONE_PATCH_FREQ, wz * TONE_PATCH_FREQ, seed ^ 0x7a11) - 0.5;
          const fine = toneNoise(wx * TONE_FINE_FREQ + 5.7, wz * TONE_FINE_FREQ - 3.1, seed ^ 0x4e63) - 0.5;
          const grain = hash2(gi, gj, seed ^ 0x1b9d) - 0.5;
          const alt = Math.min(1, Math.max(0, h / ALTITUDE_SPAN));
          const tone = 1 + patch * 2 * TONE_PATCH + fine * 2 * TONE_FINE
            + grain * 2 * TONE_GRAIN + alt * ALTITUDE_LIFT;
          latCol[v * 3] = Math.min(1, r * tone);
          latCol[v * 3 + 1] = Math.min(1, g * tone);
          latCol[v * 3 + 2] = Math.min(1, bl * tone);
        }
      }

      // ── Pass 1b: stitch fine edges that face a coarse neighbour. ──
      // A fine chunk carries a vertex halfway along every coarse edge span.
      // Left on the true surface it would hang off the coarse neighbour's
      // straight triangle edge and open a hairline crack. Snapping it to the
      // midpoint of its two coarse-lattice neighbours — position AND colour,
      // both of which the coarse side interpolates linearly — puts it exactly
      // on that edge. Watertight, and no T-junction is left visible.
      if (isFine) {
        const stitch = (a, b, c) => {          // b := midpoint of a and c
          for (let k = 0; k < 3; k++) {
            latPos[b * 3 + k] = (latPos[a * 3 + k] + latPos[c * 3 + k]) * 0.5;
            latCol[b * 3 + k] = (latCol[a * 3 + k] + latCol[c * 3 + k]) * 0.5;
          }
        };
        const coarseNb = (dx, dz) => {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= CHUNKS || nz >= CHUNKS) return false;
          return fineChunk[nz * CHUNKS + nx] === 0;
        };
        const last = VERTS - 1;
        if (coarseNb(0, -1)) for (let i = 1; i < last; i += 2) stitch(i - 1, i, i + 1);
        if (coarseNb(0, 1)) {
          const row = last * VERTS;
          for (let i = 1; i < last; i += 2) stitch(row + i - 1, row + i, row + i + 1);
        }
        if (coarseNb(-1, 0)) for (let j = 1; j < last; j += 2) stitch((j - 1) * VERTS, j * VERTS, (j + 1) * VERTS);
        if (coarseNb(1, 0)) {
          for (let j = 1; j < last; j += 2) {
            stitch((j - 1) * VERTS + last, j * VERTS + last, (j + 1) * VERTS + last);
          }
        }
      }

      // ── Pass 2: expand to non-indexed triangles with baked face normals.
      // Colour stays per-corner (smooth pigment); the normal is constant
      // across the triangle (hard papercut facet).
      const pos = new Float32Array(TRIS * 9);
      const nrm = new Float32Array(TRIS * 9);
      const col = new Float32Array(TRIS * 9);
      for (let t = 0; t < TRIS; t++) {
        const i0 = corner[t * 3] * 3, i1 = corner[t * 3 + 1] * 3, i2 = corner[t * 3 + 2] * 3;
        const ax = latPos[i0], ay = latPos[i0 + 1], az = latPos[i0 + 2];
        const e1x = latPos[i1] - ax, e1y = latPos[i1 + 1] - ay, e1z = latPos[i1 + 2] - az;
        const e2x = latPos[i2] - ax, e2y = latPos[i2 + 1] - ay, e2z = latPos[i2 + 2] - az;
        let fx = e1y * e2z - e1z * e2y;
        let fy = e1z * e2x - e1x * e2z;
        let fz = e1x * e2y - e1y * e2x;
        const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;

        // Every facet is its own sheet of paper: a tiny flat value jitter,
        // hashed off the facet index. All the BANDED work now happens per
        // vertex in pass 1 — see the strata note at the top of the file for why
        // a per-facet band boundary is unfixable at this mesh resolution.
        const ft = 1 + (hash2(t, cz * CHUNKS + cx, seed ^ 0x2b7d) - 0.5) * 2 * FACET_TONE;

        const o = t * 9;
        for (let k = 0; k < 3; k++) {
          const src = corner[t * 3 + k] * 3, dst = o + k * 3;
          pos[dst] = latPos[src]; pos[dst + 1] = latPos[src + 1]; pos[dst + 2] = latPos[src + 2];
          nrm[dst] = fx; nrm[dst + 1] = fy; nrm[dst + 2] = fz;
          col[dst] = latCol[src] * ft;
          col[dst + 1] = latCol[src + 1] * ft;
          col[dst + 2] = latCol[src + 2] * ft;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // Explicit: culling is the entire reason this is chunked.
      geo.computeBoundingSphere();
      geo.computeBoundingBox();

      triangleCount += TRIS;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `terrain-${cx}-${cz}`;
      mesh.position.set(ox, 0, oz);
      mesh.receiveShadow = true;
      mesh.castShadow = castShadow;
      mesh.matrixAutoUpdate = false;   // static geometry, never moves
      mesh.updateMatrix();
      group.add(mesh);
      geometries.push(geo);
    }
  }

  const chunkCount = geometries.length;
  const vertexCount = triangleCount * 3;

  return {
    group,
    material,
    chunkCount,
    triangleCount,
    vertexCount,
    drawCalls: chunkCount,
    dispose() {
      for (const geo of geometries) geo.dispose();
      geometries.length = 0;
      material.dispose();
      group.clear();
    },
  };
}

/**
 * Static budget report — safe to call without building the mesh (tests,
 * boot logging). Draw calls equal chunkCount because all chunks share one
 * material; visible is the typical on-screen subset after frustum culling.
 */
export function terrainStats() {
  const chunkCount = CHUNKS * CHUNKS;
  // Recount the fine chunks the same way createTerrain does, so the budget
  // report can never quietly disagree with what actually gets built.
  let fine = 0;
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const x0 = -WORLD.HALF + cx * CHUNK_SIZE;
      const z0 = -WORLD.HALF + cz * CHUNK_SIZE;
      for (const R of HERO_REGIONS) {
        const px = Math.min(x0 + CHUNK_SIZE, Math.max(x0, R.x));
        const pz = Math.min(z0 + CHUNK_SIZE, Math.max(z0, R.z));
        const dx = R.x - px, dz = R.z - pz;
        if (dx * dx + dz * dz < R.r * R.r) { fine++; break; }
      }
    }
  }
  const coarseTris = QUADS * QUADS * 2;
  const fineTris = FINE_QUADS * FINE_QUADS * 2;
  const triangleCount = (chunkCount - fine) * coarseTris + fine * fineTris;
  return {
    chunkCount,
    drawCalls: chunkCount,
    fineChunkCount: fine,
    quadsPerChunk: QUADS * QUADS,
    trianglesPerChunk: coarseTris,
    trianglesPerFineChunk: fineTris,
    triangleCount,
    // Geometry is non-indexed (baked face normals), so 3 verts per triangle.
    vertexCount: triangleCount * 3,
    latticePointsPerChunk: (QUADS + 1) * (QUADS + 1),
    chunkSize: CHUNK_SIZE,
    vertexSpacing: STEP,
    fineVertexSpacing: FINE_STEP,
  };
}
