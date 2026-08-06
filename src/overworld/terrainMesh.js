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
 * WHY vertex colours instead of a splat texture: no texture fetch, no UV
 * seams across chunks, and colour blending happens in the vertex stream where
 * we can hand-author it. Faceted lighting over smoothly graded pigment —
 * hard light steps, soft colour — is exactly what layered cut paper looks
 * like, so the colours stay interpolated while the normals stay flat.
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
import { toonMaterial, PAPER } from './materials/toon.js';

// ── Tessellation ────────────────────────────────────────────────────────
const CHUNKS = 8;                          // per axis -> 64 meshes
const QUADS = 32;                          // per chunk axis
const CHUNK_SIZE = WORLD.SIZE / CHUNKS;    // 60 m
const STEP = CHUNK_SIZE / QUADS;           // 1.875 m between grid lines
const VERTS = QUADS + 1;                   // 33 verts per chunk axis
const PAD = VERTS + 2;                     // padded height grid for normals

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

// Submerged shelf fades to deep teal so the coastline reads through water.
const SEABED_DEPTH = 9;
const SEABED_MIX = 0.65;

// Paper is never perfectly even; keep the total swing inside +-4%.
const TONE_PATCH = 0.028;  // low-frequency mottling
const TONE_GRAIN = 0.012;  // per-vertex fibre
const TONE_PATCH_FREQ = 1 / 26;
const ALTITUDE_LIFT = 0.05;   // summits read lighter (aerial separation)
const ALTITUDE_SPAN = 70;

// Breaks the visible grid: verts slide within +-JITTER*STEP in XZ. Keyed off
// GLOBAL grid indices so a vertex shared by two chunks gets the same offset
// and the chunk seam stays watertight.
const JITTER = 0.26;

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

  // ── Triangle corner order, shared by all 64 chunks (identical topology) ──
  // Diagonals alternate in a checkerboard so the facets do not form a
  // corduroy grain running one way across the whole island. Winding is CCW
  // seen from +Y, so every face normal points up out of the ground.
  const corner = new Uint16Array(QUADS * QUADS * 6);
  let ci = 0;
  for (let j = 0; j < QUADS; j++) {
    for (let i = 0; i < QUADS; i++) {
      const a = j * VERTS + i, b = a + 1, c = a + VERTS, d = c + 1;
      if (((i + j) & 1) === 0) {
        corner[ci++] = a; corner[ci++] = c; corner[ci++] = b;
        corner[ci++] = b; corner[ci++] = c; corner[ci++] = d;
      } else {
        corner[ci++] = a; corner[ci++] = c; corner[ci++] = d;
        corner[ci++] = a; corner[ci++] = d; corner[ci++] = b;
      }
    }
  }
  const TRIS = QUADS * QUADS * 2;

  // ── Shared material: white base so vertex colour IS the colour ──
  // No flatShading flag — see the header; the facets live in the geometry.
  const material = toonMaterial(0xffffff, { vertexColors: true });

  const group = new THREE.Group();
  group.name = 'terrain';

  // Scratch reused across chunks — no allocation inside the vertex loops.
  const grid = new Float64Array(PAD * PAD);      // padded regular-grid heights
  const latPos = new Float64Array(VERTS * VERTS * 3);  // chunk-local lattice
  const latCol = new Float64Array(VERTS * VERTS * 3);
  const wIdx = new Int32Array(BLEND_K);
  const wVal = new Float64Array(BLEND_K);
  const geometries = [];

  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const x0 = -WORLD.HALF + cx * CHUNK_SIZE;
      const z0 = -WORLD.HALF + cz * CHUNK_SIZE;
      const ox = x0 + CHUNK_SIZE / 2;   // chunk centre -> mesh position
      const oz = z0 + CHUNK_SIZE / 2;

      // Regular height grid with a one-node ring of padding, so the slope at
      // every lattice point below has neighbours on both sides.
      for (let j = -1; j <= VERTS; j++) {
        const wz = z0 + j * STEP;
        for (let i = -1; i <= VERTS; i++) {
          grid[(j + 1) * PAD + (i + 1)] = sampleHeight(x0 + i * STEP, wz);
        }
      }

      // ── Pass 1: lattice. Place and colour the 33x33 grid points. ──
      for (let j = 0; j < VERTS; j++) {
        const gj = cz * QUADS + j;               // global grid row
        for (let i = 0; i < VERTS; i++) {
          const gi = cx * QUADS + i;             // global grid column
          const v = j * VERTS + i;

          // --- position (jittered, seam-safe) ---
          const onEdge = gi === 0 || gj === 0 || gi === CHUNKS * QUADS || gj === CHUNKS * QUADS;
          let jx = 0, jz = 0;
          if (!onEdge) {
            jx = (hash2(gi, gj, seed ^ 0x51ed) - 0.5) * 2 * JITTER * STEP;
            jz = (hash2(gi, gj, seed ^ 0x2f13) - 0.5) * 2 * JITTER * STEP;
          }
          const wx = x0 + i * STEP + jx;
          const wz = z0 + j * STEP + jz;
          const h = sampleHeight(wx, wz);
          latPos[v * 3] = wx - ox;
          latPos[v * 3 + 1] = h;
          latPos[v * 3 + 2] = wz - oz;

          // --- slope, for the cliff test ---
          // Central differences at MESH resolution (1.875 m) describe the
          // facet the player actually sees, and reuse the grid above instead
          // of spending the 4 extra samples sampleNormal would cost.
          const p = (j + 1) * PAD + (i + 1);
          const gx = (grid[p + 1] - grid[p - 1]) / (2 * STEP);
          const gz = (grid[p + PAD] - grid[p - PAD]) / (2 * STEP);
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
          const steep = 1 - smoothstep(CLIFF_NY_STEEP, CLIFF_NY_FLAT, ny);
          if (steep > 0) {
            const t = steep * CLIFF_MIX;
            r += (ar - r) * t; g += (ag - g) * t; bl += (ab - bl) * t;
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
          }

          // --- submerged shelf sinks toward deep teal ---
          if (h < WORLD.WATER_Y) {
            const t = smoothstep(0, SEABED_DEPTH, WORLD.WATER_Y - h) * SEABED_MIX;
            r += (SEABED[0] - r) * t; g += (SEABED[1] - g) * t; bl += (SEABED[2] - bl) * t;
          }

          // --- paper tone: patchy mottling + fibre grain + altitude lift ---
          const patch = toneNoise(wx * TONE_PATCH_FREQ, wz * TONE_PATCH_FREQ, seed ^ 0x7a11) - 0.5;
          const grain = hash2(gi, gj, seed ^ 0x1b9d) - 0.5;
          const alt = Math.min(1, Math.max(0, h / ALTITUDE_SPAN));
          const tone = 1 + patch * 2 * TONE_PATCH + grain * 2 * TONE_GRAIN + alt * ALTITUDE_LIFT;
          latCol[v * 3] = Math.min(1, r * tone);
          latCol[v * 3 + 1] = Math.min(1, g * tone);
          latCol[v * 3 + 2] = Math.min(1, bl * tone);
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
        const o = t * 9;
        for (let k = 0; k < 3; k++) {
          const src = corner[t * 3 + k] * 3, dst = o + k * 3;
          pos[dst] = latPos[src]; pos[dst + 1] = latPos[src + 1]; pos[dst + 2] = latPos[src + 2];
          col[dst] = latCol[src]; col[dst + 1] = latCol[src + 1]; col[dst + 2] = latCol[src + 2];
          nrm[dst] = fx; nrm[dst + 1] = fy; nrm[dst + 2] = fz;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // Explicit: culling is the entire reason this is chunked.
      geo.computeBoundingSphere();
      geo.computeBoundingBox();

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
  const triangleCount = chunkCount * TRIS;
  const vertexCount = chunkCount * TRIS * 3;

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
  return {
    chunkCount,
    drawCalls: chunkCount,
    quadsPerChunk: QUADS * QUADS,
    trianglesPerChunk: QUADS * QUADS * 2,
    triangleCount: chunkCount * QUADS * QUADS * 2,
    // Geometry is non-indexed (baked face normals), so 3 verts per triangle.
    vertexCount: chunkCount * QUADS * QUADS * 2 * 3,
    latticePointsPerChunk: VERTS * VERTS,
    chunkSize: CHUNK_SIZE,
    vertexSpacing: STEP,
  };
}
