/**
 * Everything the player sees standing ON the island: the nine portal gates,
 * the three town buildings, the vegetation carpet and the pickups.
 *
 * WHY one module: ground (terrainMesh) and water own the *surface*; this owns
 * the *silhouettes*. Composition is the whole job — a 480 m island reads as a
 * place only if the eye is led by big landmarks (arches, buildings) sitting in
 * a soft field of small repeated shapes (trees, grass, flowers). Splitting that
 * across files would scatter the one budget that governs all of it: draw calls.
 *
 * WHY instanced-with-baked-vertex-colour instead of "one Mesh per thing":
 * 9 portals x 3 layers + 36 pickups x 2 layers would be ~90 draw calls before a
 * single blade of grass. So every repeated shape is an InstancedMesh whose
 * geometry carries RELATIVE layer shades in its vertex colours (1.0 / 0.84 /
 * 0.68 ...) and whose per-object hue arrives through instanceColor. Three
 * multiplies them (vColor = color * instanceColor), which is exactly the
 * papercut model: one sheet of coloured paper, cut into lighter and darker
 * plies. Absolute palette colours are baked where a shape needs several hues at
 * once (trees, buildings).
 *
 * WHY the caller gets Object3D *handles* rather than real scene meshes: the
 * contract is `portal.mesh.visible = false` / `collectible.mesh.visible =
 * false`. Instances have no `.visible`, so each entry gets a real THREE.Object3D
 * (position/quaternion all work) whose `visible` property is an accessor that
 * zeroes the backing instance matrices. Callers keep their one-liner; we keep
 * the draw-call budget.
 *
 * WHY vegetation is sectorised: an InstancedMesh has one bounding sphere. A
 * single 14 k-instance grass mesh spanning the island can never be culled, so
 * grass is split into a 4x4 world grid (flowers 3x3) and three's
 * Frustum.intersectsObject uses InstancedMesh.computeBoundingSphere() per
 * sector automatically. Typical view = 4-6 of 16 sectors.
 *
 * WIND: one shared `uWindTime` uniform object patched into the plant and tree
 * materials via onBeforeCompile. The offset is two summed sines at
 * incommensurate rates (0.55 / 0.225 Hz-ish) phased by a hash of the instance
 * origin, weighted by (height above the sway base)^2 — soft, rhythmic, never
 * jittery, and zero CPU cost. Trees get the same patch on a customDepthMaterial
 * so the shadow map sways with the canopy instead of tearing away from it.
 *
 * Constraints honoured: three r170 only (no examples/ imports), no
 * post-processing, no depth-texture reads, no fwidth/derivative tricks, no
 * per-frame allocation in update(), every colour resolves from PAPER, shadows
 * come from the shared teal-tinted toon ramp — never black, never grey, no
 * outlines. Everything created here is disposed in dispose().
 */
import * as THREE from 'three';
import { WORLD, BIOMES, PORTALS, BUILDINGS, COLLECTIBLES, SPAWN } from './worldSpec.js';
import { toonMaterial, PAPER } from './materials/toon.js';
import { makeRng } from '../systems/rng.js';

const TAU = Math.PI * 2;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

// ── Portal gate dimensions (metres) ─────────────────────────────────────
// These are DOORS INTO THE GAME, so they are monuments: a 4.8 m opening and
// an 8.6 m inner apex against a ~1.8 m hero. Readable from the far side of a
// biome, which is the whole point.
const ARCH_PILLAR_X = 3.1;      // pillar centre offset
const ARCH_PILLAR_TOP = 6.2;    // where the pillars stop and the arc begins
const ARCH_R_IN = 2.4;          // inner radius of the arc == half the opening
const ARCH_T = 1.4;             // voussoir thickness
const ARCH_DEPTH = 1.5;
const ARCH_VOUSSOIRS = 11;
const BANNER_Y = 12.2;
const PORTAL_RADIUS = 3;        // trigger radius handed back to the caller

// ── Vegetation gates ────────────────────────────────────────────────────
const PLANT_MIN_H = WORLD.WATER_Y + 0.3;   // never on water (spec)
const TREE_MIN_H = WORLD.WATER_Y + 0.9;
const MAX_SLOPE_NY = Math.cos(40 * Math.PI / 180);  // ~0.766, no cliff faces
const GRASS_SECTORS = 4;   // 4x4 = 120 m cells
const FLOWER_SECTORS = 3;  // 3x3 = 160 m cells

// Clearings so landmarks keep clean silhouettes and approaches stay walkable.
const CLEAR_PORTAL_TREE = 11, CLEAR_PORTAL_PLANT = 6.0;
const CLEAR_BUILDING_TREE = 13, CLEAR_BUILDING_PLANT = 8.0;
const CLEAR_SPAWN = 7;

// ── Small helpers ───────────────────────────────────────────────────────

/** GLSL float literal (never emits an int — "1" would fail to compile). */
const g = (n) => Number(n).toFixed(4);

/** PAPER int -> linear-space rgb triple, optionally scaled (layer shading). */
function lin(hex, scale = 1) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  if (scale !== 1) c.multiplyScalar(scale);
  return [c.r, c.g, c.b];
}

// Scratch for mixHex — it runs once per grass instance during the build, and
// every caller hands the result straight to setColorAt (which copies), so a
// shared colour saves ~30 k allocations at load with no aliasing risk.
const _mixA = new THREE.Color();
const _mixB = new THREE.Color();

/** Linear-space blend of two PAPER ints. Returns SHARED scratch — copy it. */
function mixHex(a, b, t) {
  _mixA.setHex(a, THREE.SRGBColorSpace);
  _mixB.setHex(b, THREE.SRGBColorSpace);
  return _mixA.lerp(_mixB, t);
}

/** Relative layer shade (multiplied by instanceColor at draw time). */
const shade = (v) => [v, v, v];

// Build-time only (never called from update) — allocation here is free.
function trs(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

// ── Geometry sink: merge primitives into one buffer with baked colours ──
// Hand-rolled because BufferGeometryUtils lives in three/examples and this
// build only imports the `three` package proper.

function sink(withAlpha = false) {
  return { pos: [], nrm: [], col: [], alpha: withAlpha };
}

/**
 * Stamp a primitive into the sink. CONSUMES `geo` (disposes it) — every call
 * site constructs the primitive inline, so nothing leaks.
 */
function stamp(s, geo, matrix, rgb, a = 1) {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  if (matrix) ni.applyMatrix4(matrix);
  const p = ni.attributes.position.array;
  const n = ni.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) {
    s.pos.push(p[i], p[i + 1], p[i + 2]);
    s.nrm.push(n[i], n[i + 1], n[i + 2]);
    if (s.alpha) s.col.push(rgb[0], rgb[1], rgb[2], a);
    else s.col.push(rgb[0], rgb[1], rgb[2]);
  }
  if (ni !== geo) ni.dispose();
  geo.dispose();
}

function bake(s) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(s.nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s.col), s.alpha ? 4 : 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Fan a closed 2D outline into triangles around a centre point, in the XY
 * plane (normal +Z). `pts` is [[x,y], ...] in order. Alpha ramps centre->rim,
 * which is how the glow gets its soft edge with no texture and no derivatives.
 */
function fanXY(s, pts, cx, cy, z, rgb, aCentre, aRim) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    s.pos.push(cx, cy, z, p0[0], p0[1], z, p1[0], p1[1], z);
    for (let k = 0; k < 3; k++) s.nrm.push(0, 0, 1);
    s.col.push(rgb[0], rgb[1], rgb[2], aCentre);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
  }
}

/** Same idea, flat in XZ (normal +Y) — the ground glow discs under pickups. */
function fanXZ(s, radius, segments, y, rgb, aCentre, aRim) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU, a1 = ((i + 1) / segments) * TAU;
    s.pos.push(0, y, 0);
    s.pos.push(Math.cos(a0) * radius, y, Math.sin(a0) * radius);
    s.pos.push(Math.cos(a1) * radius, y, Math.sin(a1) * radius);
    for (let k = 0; k < 3; k++) s.nrm.push(0, 1, 0);
    s.col.push(rgb[0], rgb[1], rgb[2], aCentre);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
  }
}

// ── Shader patches ──────────────────────────────────────────────────────

/**
 * Shared animation clock. One object handed to every patched shader's
 * uniforms map, so update() writes a single number per frame.
 */
const WIND = { value: 0 };

/**
 * Soft rhythmic wind. Two summed sines at incommensurate rates never repeat
 * visibly and never snap; the phase is a hash of the instance origin so a
 * field does not breathe in unison. Weight is (height above base)^2 → the
 * root stays planted, the tip carries the motion.
 */
function patchWind(material, { base, span, amp, lean = 0.55, speed = 0.55 }) {
  material.onBeforeCompile = (shader) => {
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
  float mwS = sin( uWindTime * ${g(speed)} + mwPh ) * 0.68
            + sin( uWindTime * ${g(speed * 0.41)} + mwPh * 1.7 + 1.3 ) * 0.32;
  transformed.x += mwS * ${g(amp)} * mwW;
  transformed.z += mwS * ${g(amp * lean)} * mwW;`);
  };
  material.customProgramCacheKey = () => `mw-wind|${base}|${span}|${amp}|${lean}|${speed}`;
}

/**
 * Gentle glow breathing for the portal pages and pickup discs. Rides on the
 * vertex ALPHA (the geometries carry a 4-component colour attribute, which is
 * what makes three define USE_COLOR_ALPHA and give us a vec4 vColor), so it
 * costs one sine in the vertex shader and no extra draw state.
 */
function patchPulse(material, { amp = 0.24, speed = 1.05 }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <color_vertex>', `#include <color_vertex>
  #ifdef USE_INSTANCING
    vec2 mwSeed = instanceMatrix[3].xz;
  #else
    vec2 mwSeed = vec2( 0.0 );
  #endif
  float mwPh = dot( mwSeed, vec2( 0.17, 0.29 ) );
  float mwP = sin( uWindTime * ${g(speed)} + mwPh ) * 0.5 + 0.5;
  vColor.a *= ${g(1 - amp)} + ${g(amp)} * mwP;`);
  };
  material.customProgramCacheKey = () => `mw-pulse|${amp}|${speed}`;
}

/**
 * Per-instance atlas cell + a slow float, for the floor-number banners. One
 * canvas atlas + one instanced vec2 offset = nine different signs in one draw
 * call; without this each banner would need its own texture and its own call.
 */
function patchBanner(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  #ifdef USE_MAP
    vMapUv += aCell;
  #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec2 mwSeed = instanceMatrix[3].xz;
  #else
    vec2 mwSeed = vec2( 0.0 );
  #endif
  float mwPh = dot( mwSeed, vec2( 0.11, 0.19 ) );
  transformed.y += sin( uWindTime * 0.7 + mwPh ) * 0.22;
  transformed.x += sin( uWindTime * 0.43 + mwPh * 1.3 ) * 0.10;`);
  };
  material.customProgramCacheKey = () => 'mw-banner';
}

// ── Biome theming tables ────────────────────────────────────────────────

/**
 * Deep in-palette "ink" per biome. Several biome accents are near-white
 * (frost, crystal) or near-cream (sky, library), so accent alone cannot carry
 * the arch trim or the banner plate — cream numerals on a cream ground is
 * unreadable. Every value here is a PAPER colour; none is a darkened invention.
 */
const BIOME_INK = {
  garden: PAPER.forestD,
  tidepool: PAPER.tealD,
  sky: PAPER.tealD,
  ember: PAPER.coralD,
  frost: PAPER.tealD,
  crystal: PAPER.lavenderD,
  market: PAPER.coralD,
  library: PAPER.coralD,
  palace: PAPER.lavenderD,
  meadow: PAPER.forestD,
};

/**
 * Vegetation character per biome. Counts are ATTEMPTS — water, slope and
 * clearing rejections trim them, and the realised totals are reported back.
 * The mix is the art direction: garden/meadow lush, market a town (bare),
 * frost sparse, palace formal (blossom avenues only).
 */
const BIOME_FLORA = {
  garden: { trees: 95, grass: 3200, flowers: 1000, species: ['broadleaf', 'broadleaf', 'blossom'], grassTint: PAPER.leaf, petals: [PAPER.white, PAPER.rose, PAPER.gold] },
  meadow: { trees: 45, grass: 2800, flowers: 1200, species: ['blossom', 'broadleaf'], grassTint: PAPER.sageD, petals: [PAPER.rose, PAPER.white, PAPER.lavender] },
  tidepool: { trees: 40, grass: 1400, flowers: 300, species: ['broadleaf'], grassTint: PAPER.leaf, petals: [PAPER.white, PAPER.tealL] },
  sky: { trees: 35, grass: 1300, flowers: 220, species: ['conifer'], grassTint: PAPER.sage, petals: [PAPER.white, PAPER.sky] },
  ember: { trees: 55, grass: 1000, flowers: 200, species: ['ember', 'ember', 'conifer'], grassTint: PAPER.sageD, petals: [PAPER.orange, PAPER.gold] },
  frost: { trees: 22, grass: 600, flowers: 90, species: ['frostpine'], grassTint: PAPER.tealL, petals: [PAPER.white, PAPER.sky] },
  crystal: { trees: 40, grass: 1100, flowers: 380, species: ['frostpine', 'blossom'], grassTint: PAPER.sage, petals: [PAPER.lavender, PAPER.white] },
  market: { trees: 12, grass: 450, flowers: 200, species: ['broadleaf'], grassTint: PAPER.sageD, petals: [PAPER.gold, PAPER.peach] },
  library: { trees: 55, grass: 1300, flowers: 230, species: ['broadleaf', 'conifer'], grassTint: PAPER.sageD, petals: [PAPER.cream, PAPER.gold] },
  palace: { trees: 26, grass: 800, flowers: 500, species: ['blossom'], grassTint: PAPER.leaf, petals: [PAPER.gold, PAPER.white, PAPER.lavender], formal: true },
};

/**
 * Tree species. A tree is a small trunk plus 2-3 stacked flat canopy slabs of
 * slightly different greens — the classic papercut tree. Slabs are low-sided
 * tapered cylinders because a 7-gon disc reads as hand-cut paper where a
 * smooth cone reads as CG.
 */
const TREE_SPECIES = {
  broadleaf: {
    trunk: [PAPER.sand, 0.86], trunkR: [0.34, 0.25], trunkH: 2.3, sides: 7,
    slabs: [
      { y: 2.0, r: 2.35, h: 0.60, taper: 0.74, color: PAPER.forest, spin: 0.0 },
      { y: 3.05, r: 1.85, h: 0.55, taper: 0.72, color: PAPER.forestL, spin: 0.4 },
      { y: 3.95, r: 1.20, h: 0.50, taper: 0.60, color: PAPER.leaf, spin: 0.8 },
    ],
  },
  conifer: {
    trunk: [PAPER.sand, 0.70], trunkR: [0.30, 0.22], trunkH: 2.0, sides: 7,
    slabs: [
      { y: 1.70, r: 1.95, h: 1.55, taper: 0.42, color: PAPER.forestD, spin: 0.0 },
      { y: 3.00, r: 1.50, h: 1.40, taper: 0.38, color: PAPER.forest, spin: 0.45 },
      { y: 4.15, r: 1.00, h: 1.25, taper: 0.14, color: PAPER.forestL, spin: 0.9 },
    ],
  },
  frostpine: {
    trunk: [PAPER.creamD, 0.78], trunkR: [0.30, 0.22], trunkH: 2.0, sides: 7,
    slabs: [
      { y: 1.70, r: 1.90, h: 1.50, taper: 0.42, color: PAPER.tealD, spin: 0.0 },
      { y: 2.95, r: 1.45, h: 1.35, taper: 0.38, color: PAPER.teal, spin: 0.45 },
      { y: 4.05, r: 0.95, h: 1.20, taper: 0.14, color: PAPER.white, spin: 0.9 },
    ],
  },
  blossom: {
    trunk: [PAPER.sand, 0.90], trunkR: [0.30, 0.22], trunkH: 2.2, sides: 7,
    slabs: [
      { y: 1.95, r: 2.10, h: 0.55, taper: 0.76, color: PAPER.rose, spin: 0.0 },
      { y: 2.85, r: 1.65, h: 0.50, taper: 0.74, color: PAPER.peach, spin: 0.5 },
      { y: 3.60, r: 1.05, h: 0.45, taper: 0.62, color: PAPER.white, spin: 1.0 },
    ],
  },
  ember: {
    trunk: [PAPER.coralD, 0.80], trunkR: [0.32, 0.24], trunkH: 2.4, sides: 7,
    slabs: [
      { y: 2.10, r: 2.20, h: 0.58, taper: 0.75, color: PAPER.coralD, spin: 0.0 },
      { y: 3.05, r: 1.70, h: 0.52, taper: 0.72, color: PAPER.coral, spin: 0.45 },
      { y: 3.85, r: 1.10, h: 0.46, taper: 0.60, color: PAPER.gold, spin: 0.9 },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Geometry builders
// ═══════════════════════════════════════════════════════════════════════

/** Arch "stone": pedestal, tapered side pillars, voussoir arc. Relative
 *  shades only — hue arrives via instanceColor (a warm cream leaning to the
 *  biome ground, so a gate never camouflages against its own terrain). */
function buildArchStone() {
  const s = sink();
  // Ground plate: buried 1.6 m so it never floats on a slope.
  stamp(s, new THREE.CylinderGeometry(4.4, 4.7, 2.2, 12), trs(0, -0.55, 0), shade(0.94));
  stamp(s, new THREE.CylinderGeometry(3.9, 4.1, 0.34, 12), trs(0, 0.62, 0), shade(1.10));
  for (const sx of [-1, 1]) {
    stamp(s, new THREE.CylinderGeometry(0.72, 0.90, ARCH_PILLAR_TOP, 6),
      trs(sx * ARCH_PILLAR_X, ARCH_PILLAR_TOP / 2 + 0.5, 0), shade(1.0));
  }
  // Voussoir arc: flat slabs swept over the half-circle, alternating ply so
  // the arc reads as cut segments rather than an extruded tube.
  const rMid = ARCH_R_IN + ARCH_T / 2;
  const chord = 2 * rMid * Math.sin(Math.PI / (2 * ARCH_VOUSSOIRS)) * 1.10;
  for (let k = 0; k < ARCH_VOUSSOIRS; k++) {
    const th = Math.PI * (k + 0.5) / ARCH_VOUSSOIRS;
    stamp(s, new THREE.BoxGeometry(chord, ARCH_T, ARCH_DEPTH),
      trs(rMid * Math.cos(th), ARCH_PILLAR_TOP + 0.5 + rMid * Math.sin(th), 0, 0, 0, th - Math.PI / 2),
      shade(k % 2 === 0 ? 1.0 : 0.87));
  }
  return bake(s);
}

/** Arch trim: caps, keystone, base ring, crest. instanceColor = biome ink, so
 *  each gate gets a deep themed silhouette that reads at 150 m. */
function buildArchTrim() {
  const s = sink();
  stamp(s, new THREE.CylinderGeometry(4.9, 4.9, 0.22, 12), trs(0, 0.16, 0), shade(1.0));
  for (const sx of [-1, 1]) {
    stamp(s, new THREE.CylinderGeometry(1.02, 1.02, 0.42, 6),
      trs(sx * ARCH_PILLAR_X, ARCH_PILLAR_TOP + 0.62, 0), shade(1.0));
    stamp(s, new THREE.CylinderGeometry(1.06, 1.06, 0.36, 6),
      trs(sx * ARCH_PILLAR_X, 0.86, 0), shade(0.88));
  }
  const rMid = ARCH_R_IN + ARCH_T / 2;
  // Keystone at the apex + a crest slab above it.
  stamp(s, new THREE.BoxGeometry(1.5, ARCH_T + 0.5, ARCH_DEPTH + 0.3),
    trs(0, ARCH_PILLAR_TOP + 0.5 + rMid, 0), shade(1.0));
  stamp(s, new THREE.BoxGeometry(2.6, 0.5, ARCH_DEPTH + 0.5),
    trs(0, ARCH_PILLAR_TOP + 0.5 + rMid + ARCH_T / 2 + 0.45, 0), shade(0.9));
  return bake(s);
}

/** The glowing "page" filling the opening: rectangle + semicircular head,
 *  fanned so alpha falls off to the rim, plus an oversized halo behind it. */
function buildArchPage() {
  const s = sink(true);
  const W = ARCH_R_IN, Y0 = 1.0, YTOP = ARCH_PILLAR_TOP + 0.5;
  const outline = (k) => {
    const pts = [];
    pts.push([W * k, Y0]);
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI;
      pts.push([Math.cos(a) * W * k, YTOP + Math.sin(a) * W * k]);
    }
    pts.push([-W * k, Y0]);
    return pts;
  };
  const cy = (Y0 + YTOP + W) * 0.5;
  // Halo first, page second: both depthWrite:false, so in-mesh order decides
  // the stack and it stays correct viewed from either side of the gate.
  fanXY(s, outline(1.16), 0, cy, -0.01, shade(1.0), 0.34, 0.0);
  fanXY(s, outline(1.0), 0, cy, 0.0, shade(1.0), 0.86, 0.16);
  return bake(s);
}

/** Floor-number banner: a pennant with a notched foot, front and back, UVs
 *  covering one atlas cell (the per-instance cell offset is added in-shader). */
function buildBannerGeo(cols, rows) {
  const HW = 1.9, HH = 1.3, NOTCH = -0.65, GAP = 0.05;
  const cu = 1 / cols, cv = 1 / rows;
  const P = [[-HW, HH], [HW, HH], [HW, -HH], [0, NOTCH], [-HW, -HH]];
  const tris = [[0, 4, 3], [0, 3, 2], [0, 2, 1]];
  const pos = [], nrm = [], uv = [];
  const toUv = (p, mirror) => {
    const u = (p[0] + HW) / (2 * HW);
    return [(mirror ? 1 - u : u) * cu, ((p[1] + HH) / (2 * HH)) * cv];
  };
  for (const t of tris) {
    for (const i of t) {
      pos.push(P[i][0], P[i][1], GAP); nrm.push(0, 0, 1);
      const q = toUv(P[i], false); uv.push(q[0], q[1]);
    }
    for (const i of [t[2], t[1], t[0]]) {
      pos.push(P[i][0], P[i][1], -GAP); nrm.push(0, 0, -1);
      const q = toUv(P[i], true); uv.push(q[0], q[1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Nine floor numbers on one 1024x1024 canvas (4x4 grid of 256 px cells, 9
 * used). Power-of-two so mipmapping is safe everywhere including the software
 * GL used by the screenshot harness. Generic sans stack only — no web fonts.
 * Returns null in a non-DOM environment so the module stays unit-testable.
 */
function buildBannerAtlas(entries) {
  if (typeof document === 'undefined') return null;
  const CELL = 256, COLS = 4, ROWS = 4;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
  const FONT = '"Trebuchet MS", "Verdana", "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillStyle = css(PAPER.cream);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  entries.forEach((e, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col * CELL, y = row * CELL;
    // Accent field, deep ink plate, cream numeral: three cut plies.
    ctx.fillStyle = css(e.accent);
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = css(e.ink);
    ctx.fillRect(x + CELL * 0.10, y + CELL * 0.10, CELL * 0.80, CELL * 0.80);
    ctx.fillStyle = css(PAPER.cream);
    ctx.font = `bold ${Math.round(CELL * 0.13)}px ${FONT}`;
    ctx.fillText('FLOOR', x + CELL / 2, y + CELL * 0.28);
    ctx.font = `bold ${Math.round(CELL * 0.52)}px ${FONT}`;
    ctx.fillText(String(e.floorId), x + CELL / 2, y + CELL * 0.63);
    // Cell UV origin. flipY is on for canvas textures, so canvas row 0 is the
    // TOP row but v=0 is the BOTTOM — invert the row when handing out offsets.
    e.cell = [col / COLS, (ROWS - 1 - row) / ROWS];
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, cols: COLS, rows: ROWS };
}

/** One papercut tree: trunk + stacked canopy slabs, absolute PAPER colours. */
function buildTree(spec) {
  const s = sink();
  stamp(s, new THREE.CylinderGeometry(spec.trunkR[1], spec.trunkR[0], spec.trunkH, spec.sides),
    trs(0, spec.trunkH / 2, 0), lin(spec.trunk[0], spec.trunk[1]));
  for (const sl of spec.slabs) {
    stamp(s, new THREE.CylinderGeometry(sl.r * sl.taper, sl.r, sl.h, spec.sides),
      trs(0, sl.y, 0, 0, sl.spin, 0), lin(sl.color));
  }
  return bake(s);
}

/**
 * Grass tuft: four single-triangle blades. A triangle IS the papercut blade
 * shape, and at 14 k instances the vertex count is the budget — 12 verts and
 * 4 triangles per tuft. Normals are hand-authored toward +Y so blades pick up
 * the lit ramp step instead of reading as dark verticals.
 */
function buildGrassTuft() {
  const BLADES = 4;
  const pos = [], nrm = [], col = [];
  for (let k = 0; k < BLADES; k++) {
    const a = (k / BLADES) * TAU + 0.55;
    const lean = 0.15 + (k % 2) * 0.06;
    const h = 0.40 + (k % 3) * 0.05;
    const w = 0.055;
    const dx = Math.sin(a), dz = Math.cos(a);
    pos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, dx * lean, h, dz * lean);
    const nx = dx * 0.45, nz = dz * 0.45;
    const inv = 1 / Math.hypot(nx, 0.9, nz);
    for (let v = 0; v < 3; v++) nrm.push(nx * inv, 0.9 * inv, nz * inv);
    col.push(0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 1.0, 1.0, 1.0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Flower: a six-petal star fan, tilted and lifted in GEOMETRY space (not in
 * the instance matrix) for two reasons — the wind weight reads transformed.y,
 * and a baked tilt plus a random instance yaw gives every blossom a different
 * facing for free. Centre vertex is a warm multiplier of the petal colour, so
 * one instanceColor yields petal + heart.
 */
function buildFlower() {
  const PET = 6, RIN = 0.13, ROUT = 0.30;
  const pos = [0, 0, 0], col = [1.0, 0.82, 0.48], idx = [];
  const n = PET * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = (i % 2 === 0) ? ROUT : RIN;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    col.push(1, 1, 1);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const nrm = [];
  for (let i = 0; i <= n; i++) nrm.push(0, 1, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.rotateX(0.55);
  geo.translate(0, 0.26, 0);
  geo.computeBoundingSphere();
  return geo;
}

/** Spinning papercut coin: a flat 14-gon disc with an inset face ply. */
function buildCoin() {
  const s = sink();
  stamp(s, new THREE.CylinderGeometry(0.42, 0.42, 0.11, 14), trs(0, 0, 0, Math.PI / 2, 0, 0), lin(PAPER.gold));
  for (const sz of [-1, 1]) {
    stamp(s, new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), trs(0, 0, sz * 0.065, Math.PI / 2, 0, 0), lin(PAPER.orange));
  }
  return bake(s);
}

/** Potion: a rounded coral flask with a rose neck and a sand cork. */
function buildPotion() {
  const s = sink();
  stamp(s, new THREE.SphereGeometry(0.30, 9, 6), trs(0, 0.30, 0, 0, 0, 0, 1, 1.12, 1), lin(PAPER.coral));
  stamp(s, new THREE.CylinderGeometry(0.10, 0.15, 0.22, 7), trs(0, 0.66, 0), lin(PAPER.rose));
  stamp(s, new THREE.CylinderGeometry(0.115, 0.115, 0.10, 7), trs(0, 0.81, 0), lin(PAPER.sand));
  return bake(s);
}

/** Soft glow disc that sits on the ground under a pickup. */
function buildAuraDisc() {
  const s = sink(true);
  fanXZ(s, 0.95, 16, 0, shade(1.0), 0.55, 0.0);
  return bake(s);
}

// ── Buildings ───────────────────────────────────────────────────────────
// Stacked boxes with offset roof slabs: warm gold/peach for the market pair,
// deep lavender/gold for the spire gate on its offshore islet. Each is a
// single merged mesh (one draw + one shadow) with absolute PAPER colours.

function buildShop() {
  const s = sink();
  stamp(s, new THREE.BoxGeometry(8.4, 2.0, 7.4), trs(0, -0.85, 0), lin(PAPER.sand));
  stamp(s, new THREE.BoxGeometry(6.2, 3.4, 5.2), trs(0, 1.70, 0), lin(PAPER.cream));
  stamp(s, new THREE.BoxGeometry(7.4, 0.55, 6.2), trs(0, 3.65, 0), lin(PAPER.coral));
  stamp(s, new THREE.BoxGeometry(3.4, 2.0, 3.0), trs(0, 4.90, -0.4), lin(PAPER.peach));
  stamp(s, new THREE.BoxGeometry(4.4, 0.45, 3.8), trs(0, 6.10, -0.4), lin(PAPER.coralD));
  stamp(s, new THREE.CylinderGeometry(0.10, 0.18, 1.0, 6), trs(0, 6.80, -0.4), lin(PAPER.gold));
  // Striped awning: alternating plies, the market read at a glance.
  for (let i = 0; i < 4; i++) {
    stamp(s, new THREE.BoxGeometry(1.45, 0.16, 1.9),
      trs(-2.175 + i * 1.45, 2.62, 3.35, -0.34, 0, 0),
      lin(i % 2 === 0 ? PAPER.cream : PAPER.coral));
  }
  stamp(s, new THREE.BoxGeometry(1.5, 2.4, 0.10), trs(0, 1.20, 2.63), lin(PAPER.tealD));
  stamp(s, new THREE.BoxGeometry(0.5, 0.5, 0.10), trs(0.5, 1.35, 2.70), lin(PAPER.gold));
  for (const sx of [-1, 1]) {
    stamp(s, new THREE.BoxGeometry(1.05, 1.05, 0.10), trs(sx * 2.05, 2.35, 2.63), lin(PAPER.sky));
  }
  return bake(s);
}

function buildGallery() {
  const s = sink();
  stamp(s, new THREE.BoxGeometry(8.0, 2.2, 6.6), trs(0, -0.85, 0), lin(PAPER.creamD));
  stamp(s, new THREE.BoxGeometry(6.0, 0.30, 1.2), trs(0, 0.40, 3.5), lin(PAPER.sand));
  stamp(s, new THREE.BoxGeometry(6.4, 4.2, 4.8), trs(0, 2.60, -0.2), lin(PAPER.cream));
  for (const x of [-2.4, -0.8, 0.8, 2.4]) {
    stamp(s, new THREE.CylinderGeometry(0.28, 0.32, 3.8, 8), trs(x, 2.40, 2.55), lin(PAPER.white));
  }
  stamp(s, new THREE.BoxGeometry(7.2, 0.60, 6.0), trs(0, 4.65, 0.2), lin(PAPER.peach));
  stamp(s, new THREE.ConeGeometry(5.0, 2.2, 4), trs(0, 6.05, 0.2, 0, Math.PI / 4, 0), lin(PAPER.coral));
  stamp(s, new THREE.CylinderGeometry(0.09, 0.16, 0.9, 6), trs(0, 7.40, 0.2), lin(PAPER.gold));
  stamp(s, new THREE.BoxGeometry(1.6, 2.8, 0.10), trs(0, 1.90, 2.25), lin(PAPER.lavenderD));
  for (const sx of [-1, 1]) {
    stamp(s, new THREE.BoxGeometry(0.9, 1.6, 0.10), trs(sx * 2.4, 2.80, 2.25), lin(PAPER.sky));
  }
  return bake(s);
}

function buildSpireGate() {
  const s = sink();
  stamp(s, new THREE.BoxGeometry(8.0, 2.2, 5.4), trs(0, -0.80, 0), lin(PAPER.sand));
  stamp(s, new THREE.BoxGeometry(5.0, 0.35, 1.4), trs(0, 0.45, 3.1), lin(PAPER.creamD));
  for (const sx of [-1, 1]) {
    stamp(s, new THREE.CylinderGeometry(0.70, 1.15, 8.0, 6), trs(sx * 2.7, 4.30, 0), lin(PAPER.lavenderD));
    stamp(s, new THREE.ConeGeometry(1.15, 1.5, 6), trs(sx * 2.7, 9.05, 0), lin(PAPER.gold));
  }
  stamp(s, new THREE.BoxGeometry(7.2, 0.95, 1.9), trs(0, 8.35, 0), lin(PAPER.lavender));
  stamp(s, new THREE.BoxGeometry(3.0, 1.4, 1.1), trs(0, 9.45, 0), lin(PAPER.gold));
  // Contrasting doorway ply — the gate is a door, so it says "door".
  stamp(s, new THREE.BoxGeometry(3.6, 6.4, 0.12), trs(0, 3.50, 0.4), lin(PAPER.tealL));
  stamp(s, new THREE.BoxGeometry(4.2, 0.4, 0.5), trs(0, 6.90, 0.4), lin(PAPER.cream));
  return bake(s);
}

const BUILDING_BUILDERS = { shop: buildShop, gallery: buildGallery, gate: buildSpireGate };

// ═══════════════════════════════════════════════════════════════════════
// Placement
// ═══════════════════════════════════════════════════════════════════════

/**
 * Instance-backed stand-in for a scene Mesh. Real THREE.Object3D (so
 * position/quaternion/getWorldPosition all behave), but `visible` is an
 * accessor that zeroes the backing instance matrices — the caller's
 * `mesh.visible = false` genuinely hides the thing.
 */
function makeHandle(x, y, z, onVisible) {
  const h = new THREE.Object3D();
  h.position.set(x, y, z);
  h.matrixAutoUpdate = false;
  h.updateMatrix();
  let vis = true;
  Object.defineProperty(h, 'visible', {
    get() { return vis; },
    set(v) { const b = !!v; if (b === vis) return; vis = b; onVisible(b); },
    configurable: true,
    enumerable: true,
  });
  return h;
}

/**
 * Lowest ground height across a footprint. Big props must sit on the LOW
 * corner of a slope and bury their plinth, never hover over the low side.
 */
function footprintY(sampleHeight, x, z, radius) {
  let y = sampleHeight(x, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    y = Math.min(y, sampleHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius));
  }
  return y;
}

/**
 * Rejection-sample `count` points inside a biome disc. Two forward-difference
 * height samples give the slope gate (3 sampleHeight calls per accepted
 * candidate) — a full sampleNormal would be 5, and at ~20 k plants that
 * difference is the whole load-time budget.
 */
function scatter(rng, cx, cz, radius, count, minH, clearings, sampleHeight, out) {
  const maxTries = count * 6 + 256;
  let placed = 0;
  for (let t = 0; t < maxTries && placed < count; t++) {
    const a = rng() * TAU;
    const r = radius * Math.sqrt(rng());
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;

    let blocked = false;
    for (let i = 0; i < clearings.length; i += 3) {
      const dx = x - clearings[i], dz = z - clearings[i + 1];
      const cr = clearings[i + 2];
      if (dx * dx + dz * dz < cr * cr) { blocked = true; break; }
    }
    if (blocked) continue;

    const h = sampleHeight(x, z);
    if (h <= minH) continue;
    const e = 1.2;
    const gx = (sampleHeight(x + e, z) - h) / e;
    const gz = (sampleHeight(x, z + e) - h) / e;
    if (1 / Math.sqrt(gx * gx + 1 + gz * gz) < MAX_SLOPE_NY) continue;

    out.push({ x, y: h, z, a: rng(), b: rng(), c: rng() });
    placed++;
  }
  return placed;
}

/**
 * Build one InstancedMesh per non-empty world sector so the frustum can throw
 * most of the vegetation away. three's Frustum.intersectsObject calls
 * InstancedMesh.computeBoundingSphere() for us, so sectoring is all it takes.
 */
function sectorise(items, sectors) {
  const buckets = new Map();
  const cell = WORLD.SIZE / sectors;
  for (const it of items) {
    const sx = Math.min(sectors - 1, Math.max(0, Math.floor((it.x + WORLD.HALF) / cell)));
    const sz = Math.min(sectors - 1, Math.max(0, Math.floor((it.z + WORLD.HALF) / cell)));
    const key = sz * sectors + sx;
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(it);
  }
  return [...buckets.values()];
}

// ═══════════════════════════════════════════════════════════════════════
// createProps
// ═══════════════════════════════════════════════════════════════════════

/**
 * @param {{sampleHeight:Function, seed?:number}} heightfield
 * @param {{seed?:number, density?:number, castShadow?:boolean}} [opts]
 * @returns {{ group:THREE.Group,
 *             portals:Array<{id:string,floorId:number,x:number,y:number,z:number,yaw:number,
 *                            mesh:THREE.Object3D,radius:number,pillarOffset:number,pillarRadius:number}>,
 *             buildings:Array<{id:string,kind:string,x:number,z:number,yaw:number,r:number}>,
 *             trees:Array<{x:number,y:number,z:number,r:number}>,
 *             collectibles:Array<{id:string,kind:string,amount:number,x:number,z:number,mesh:THREE.Object3D}>,
 *             stats:object, update:(simTime:number, playerPos:object)=>void, dispose:Function }}
 */
export function createProps(heightfield, opts = {}) {
  const { sampleHeight } = heightfield;
  const seed = (opts.seed ?? heightfield.seed ?? WORLD.SEED) | 0;
  const density = opts.density ?? 1;
  const castShadow = opts.castShadow !== false;

  const group = new THREE.Group();
  group.name = 'props';
  const geometries = [];
  const materials = [];
  const textures = [];

  const track = (geo) => { geometries.push(geo); return geo; };
  const trackMat = (m) => { materials.push(m); return m; };

  // ── Materials (8 total; every repeated shape shares one) ──
  const structMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const treeMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const plantMat = trackMat(toonMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  const pickupMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const auraMat = trackMat(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, fog: true,
  }));
  const bannerMat = trackMat(new THREE.MeshBasicMaterial({
    transparent: false, side: THREE.FrontSide, fog: true,
  }));

  patchWind(treeMat, { base: 1.4, span: 3.2, amp: 0.22, lean: 0.5, speed: 0.42 });
  patchWind(plantMat, { base: 0.0, span: 0.42, amp: 0.10, lean: 0.6, speed: 0.62 });
  patchPulse(auraMat, { amp: 0.26, speed: 1.0 });
  patchBanner(bannerMat);

  // Trees sway in the shadow map too, or the canopy shadow tears off the tree.
  const treeDepthMat = trackMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  patchWind(treeDepthMat, { base: 1.4, span: 3.2, amp: 0.22, lean: 0.5, speed: 0.42 });

  const biomeById = new Map(BIOMES.map((b) => [b.id, b]));

  // ── Clearings, filled as landmarks are placed ──
  const treeClear = [], plantClear = [];
  const addClear = (x, z, rTree, rPlant) => {
    treeClear.push(x, z, rTree);
    plantClear.push(x, z, rPlant);
  };
  addClear(SPAWN.x, SPAWN.z, CLEAR_SPAWN, CLEAR_SPAWN * 0.6);

  // ═══ 1. PORTAL GATES ═══
  const portalEntries = PORTALS.map((p) => {
    const biome = BIOMES.find((b) => b.floorId === p.floorId) || BIOMES[0];
    return {
      id: p.id, floorId: p.floorId, x: p.x, z: p.z, yaw: p.yaw,
      y: footprintY(sampleHeight, p.x, p.z, 4.2),
      accent: biome.palette.accent,
      ground: biome.palette.ground,
      ink: BIOME_INK[biome.id] ?? PAPER.tealD,
      cell: [0, 0],
    };
  });
  for (const p of portalEntries) addClear(p.x, p.z, CLEAR_PORTAL_TREE, CLEAR_PORTAL_PLANT);

  const atlas = buildBannerAtlas(portalEntries);
  if (atlas) {
    bannerMat.map = atlas.texture;
    textures.push(atlas.texture);
  }

  const nP = portalEntries.length;
  const archStone = new THREE.InstancedMesh(track(buildArchStone()), structMat, nP);
  const archTrim = new THREE.InstancedMesh(track(buildArchTrim()), structMat, nP);
  const archPage = new THREE.InstancedMesh(track(buildArchPage()), auraMat, nP);
  const banners = atlas
    ? new THREE.InstancedMesh(track(buildBannerGeo(atlas.cols, atlas.rows)), bannerMat, nP)
    : null;
  archStone.name = 'portal-stone';
  archTrim.name = 'portal-trim';
  archPage.name = 'portal-page';

  const _m4 = new THREE.Matrix4();
  const _v3 = new THREE.Vector3();
  const _q4 = new THREE.Quaternion();
  const _s3 = new THREE.Vector3(1, 1, 1);
  const _col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  if (banners) {
    const cells = new Float32Array(nP * 2);
    portalEntries.forEach((p, i) => { cells[i * 2] = p.cell[0]; cells[i * 2 + 1] = p.cell[1]; });
    banners.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    banners.name = 'portal-banner';
  }

  const portals = portalEntries.map((p, i) => {
    _q4.setFromAxisAngle(AXIS_Y, p.yaw);
    _v3.set(p.x, p.y, p.z);
    _m4.compose(_v3, _q4, _s3);
    archStone.setMatrixAt(i, _m4);
    archTrim.setMatrixAt(i, _m4);
    archPage.setMatrixAt(i, _m4);
    // Stone leans a quarter toward the biome ground so a gate is themed but
    // never camouflaged against the terrain it stands on.
    archStone.setColorAt(i, mixHex(PAPER.cream, p.ground, 0.28));
    archTrim.setColorAt(i, _col.setHex(p.ink, THREE.SRGBColorSpace));
    archPage.setColorAt(i, _col.setHex(p.accent, THREE.SRGBColorSpace));
    if (banners) {
      _v3.set(p.x, p.y + BANNER_Y, p.z);
      _m4.compose(_v3, _q4, _s3);
      banners.setMatrixAt(i, _m4);
    }

    const bannerRestore = banners ? new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y + BANNER_Y, p.z), _q4.clone(), _s3) : null;
    const stoneRestore = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z), _q4.clone(), _s3);

    const mesh = makeHandle(p.x, p.y, p.z, (v) => {
      const m = v ? stoneRestore : ZERO;
      archStone.setMatrixAt(i, m);
      archTrim.setMatrixAt(i, m);
      archPage.setMatrixAt(i, m);
      archStone.instanceMatrix.needsUpdate = true;
      archTrim.instanceMatrix.needsUpdate = true;
      archPage.instanceMatrix.needsUpdate = true;
      if (banners) {
        banners.setMatrixAt(i, v ? bannerRestore : ZERO);
        banners.instanceMatrix.needsUpdate = true;
      }
    });
    // yaw + pillarOffset let the caller place the two pillar colliders
    // without re-deriving the arch's internal dimensions.
    return {
      id: p.id, floorId: p.floorId, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
      mesh, radius: PORTAL_RADIUS, pillarOffset: ARCH_PILLAR_X, pillarRadius: 0.9,
    };
  });

  for (const m of [archStone, archTrim, archPage]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = true;
  }
  archStone.castShadow = castShadow;
  archStone.receiveShadow = true;
  archTrim.castShadow = castShadow;
  archTrim.receiveShadow = true;
  archPage.castShadow = false;
  archPage.receiveShadow = false;
  group.add(archStone, archTrim, archPage);
  if (banners) {
    banners.instanceMatrix.needsUpdate = true;
    banners.castShadow = false;
    banners.receiveShadow = false;
    group.add(banners);
  }

  // ═══ 2. BUILDINGS ═══
  const buildingMeshes = [];
  // Footprint circles for the collision world. Every building shell is ~8 m
  // across; 3.4 keeps the walls solid while letting a child brush past the
  // awning corners instead of catching on them.
  const buildingBodies = [];
  for (const b of BUILDINGS) {
    const builder = BUILDING_BUILDERS[b.kind];
    if (!builder) continue;
    const geo = track(builder());
    const mesh = new THREE.Mesh(geo, structMat);
    mesh.name = `building-${b.id}`;
    buildingBodies.push({ id: b.id, kind: b.kind, x: b.x, z: b.z, yaw: b.yaw, r: 3.4 });
    mesh.position.set(b.x, footprintY(sampleHeight, b.x, b.z, 4.5), b.z);
    mesh.rotation.y = b.yaw;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    buildingMeshes.push(mesh);
    addClear(b.x, b.z, CLEAR_BUILDING_TREE, CLEAR_BUILDING_PLANT);
  }
  // Buildings use absolute baked colours, so no instanceColor — but they share
  // structMat with the arches, which do. Give them a neutral vertex-colour
  // pass by leaving material.color white; nothing else is needed.

  // ═══ 3. VEGETATION ═══
  const treeGeos = {};
  const treeItems = {};
  for (const name of Object.keys(TREE_SPECIES)) {
    treeGeos[name] = track(buildTree(TREE_SPECIES[name]));
    treeItems[name] = [];
  }
  const grassItems = [];
  const flowerItems = [];

  const rng = makeRng(seed ^ 0x5eed17);

  for (const biome of BIOMES) {
    const flora = BIOME_FLORA[biome.id];
    if (!flora) continue;
    const [cx, cz] = biome.center;
    const R = biome.radius;

    // --- trees ---
    const nTrees = Math.round(flora.trees * density);
    const raw = [];
    if (flora.formal) {
      // Palace: a formal avenue — evenly spaced rings, tiny jitter. Order and
      // rhythm are the read here, not scatter.
      const rings = [R * 0.55, R * 0.82];
      let made = 0;
      for (let ri = 0; ri < rings.length && made < nTrees; ri++) {
        const per = Math.ceil(nTrees / rings.length);
        for (let k = 0; k < per && made < nTrees; k++) {
          const a = (k / per) * TAU + ri * 0.32;
          const x = cx + Math.cos(a) * rings[ri] + (rng() - 0.5) * 3;
          const z = cz + Math.sin(a) * rings[ri] + (rng() - 0.5) * 3;
          const h = sampleHeight(x, z);
          if (h <= TREE_MIN_H) continue;
          // Same slope gate as scatter(): the palace flanks are the steepest
          // ground on the island and a formal ring must not walk up a cliff.
          const e = 1.2;
          const gx = (sampleHeight(x + e, z) - h) / e;
          const gz = (sampleHeight(x, z + e) - h) / e;
          if (1 / Math.sqrt(gx * gx + 1 + gz * gz) < MAX_SLOPE_NY) continue;
          let blocked = false;
          for (let i = 0; i < treeClear.length; i += 3) {
            const dx = x - treeClear[i], dz = z - treeClear[i + 1];
            if (dx * dx + dz * dz < treeClear[i + 2] * treeClear[i + 2]) { blocked = true; break; }
          }
          if (blocked) continue;
          raw.push({ x, y: h, z, a: rng(), b: rng(), c: rng() });
          made++;
        }
      }
    } else {
      scatter(rng, cx, cz, R * 0.94, nTrees, TREE_MIN_H, treeClear, sampleHeight, raw);
    }
    for (const it of raw) {
      const sp = flora.species[Math.floor(it.a * flora.species.length) % flora.species.length];
      treeItems[sp].push(it);
    }

    // --- grass + flowers ---
    const gStart = grassItems.length;
    scatter(rng, cx, cz, R, Math.round(flora.grass * density), PLANT_MIN_H, plantClear, sampleHeight, grassItems);
    for (let i = gStart; i < grassItems.length; i++) grassItems[i].tint = flora.grassTint;

    const fStart = flowerItems.length;
    scatter(rng, cx, cz, R, Math.round(flora.flowers * density), PLANT_MIN_H, plantClear, sampleHeight, flowerItems);
    for (let i = fStart; i < flowerItems.length; i++) {
      flowerItems[i].tint = flora.petals[Math.floor(flowerItems[i].b * flora.petals.length) % flora.petals.length];
    }
  }

  const vegMeshes = [];
  // Trunk footprints handed to the collision world. Only the trunk, only the
  // realised (post-rejection) instances, and radius scales with the instance
  // — a canopy is not a wall, and this is a kids' game.
  const trees = [];
  let treeCount = 0;
  for (const name of Object.keys(treeGeos)) {
    const items = treeItems[name];
    if (!items.length) continue;   // geometry is already tracked for dispose()
    const trunkR = TREE_SPECIES[name].trunkR[0];
    const im = new THREE.InstancedMesh(treeGeos[name], treeMat, items.length);
    im.name = `trees-${name}`;
    items.forEach((it, i) => {
      const s = 0.80 + it.b * 0.55;
      trees.push({ x: it.x, y: it.y, z: it.z, r: trunkR * s });
      _q4.setFromAxisAngle(AXIS_Y, it.a * TAU);
      _v3.set(it.x, it.y - 0.15, it.z);
      _s3.set(s, s * (0.92 + it.c * 0.22), s);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      // Near-neutral tone jitter only: instanceColor multiplies the WHOLE
      // tree, so anything hue-shifted would drag the trunk with it.
      const tone = 0.90 + it.c * 0.14;
      im.setColorAt(i, _col.setRGB(tone, tone, tone, THREE.LinearSRGBColorSpace));
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = castShadow;
    im.receiveShadow = true;
    if (castShadow) im.customDepthMaterial = treeDepthMat;
    group.add(im);
    vegMeshes.push(im);
    treeCount += items.length;
  }

  const grassGeo = track(buildGrassTuft());
  const grassSectors = sectorise(grassItems, GRASS_SECTORS);
  for (const bucket of grassSectors) {
    const im = new THREE.InstancedMesh(grassGeo, plantMat, bucket.length);
    im.name = 'grass';
    bucket.forEach((it, i) => {
      const s = 0.75 + it.b * 0.75;
      _q4.setFromAxisAngle(AXIS_Y, it.a * TAU);
      _v3.set(it.x, it.y - 0.02, it.z);
      _s3.set(s, s * (0.85 + it.c * 0.5), s);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      im.setColorAt(i, mixHex(it.tint, PAPER.sageD, it.c * 0.30).multiplyScalar(0.92 + it.b * 0.16));
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    group.add(im);
    vegMeshes.push(im);
  }

  const flowerGeo = track(buildFlower());
  const flowerSectors = sectorise(flowerItems, FLOWER_SECTORS);
  for (const bucket of flowerSectors) {
    const im = new THREE.InstancedMesh(flowerGeo, plantMat, bucket.length);
    im.name = 'flowers';
    bucket.forEach((it, i) => {
      const s = 0.80 + it.c * 0.55;
      _q4.setFromAxisAngle(AXIS_Y, it.a * TAU);
      _v3.set(it.x, it.y - 0.02, it.z);
      _s3.set(s, s, s);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      im.setColorAt(i, _col.setHex(it.tint, THREE.SRGBColorSpace).multiplyScalar(0.94 + it.a * 0.12));
    });
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    group.add(im);
    vegMeshes.push(im);
  }

  // ═══ 4. COLLECTIBLES ═══
  const golds = COLLECTIBLES.filter((c) => c.kind === 'gold');
  const potionsSpec = COLLECTIBLES.filter((c) => c.kind !== 'gold');
  const coinMesh = golds.length ? new THREE.InstancedMesh(track(buildCoin()), pickupMat, golds.length) : null;
  const potionMesh = potionsSpec.length ? new THREE.InstancedMesh(track(buildPotion()), pickupMat, potionsSpec.length) : null;
  const auraMesh = new THREE.InstancedMesh(track(buildAuraDisc()), auraMat, COLLECTIBLES.length);
  if (coinMesh) coinMesh.name = 'pickup-coin';
  if (potionMesh) potionMesh.name = 'pickup-potion';
  auraMesh.name = 'pickup-aura';

  // Flat records the update loop walks — no property lookups on spec objects,
  // no allocation per frame.
  const pickups = [];
  const collectibles = COLLECTIBLES.map((c, ci) => {
    const gy = sampleHeight(c.x, c.z);
    const isGold = c.kind === 'gold';
    const body = isGold ? coinMesh : potionMesh;
    const bi = isGold ? golds.indexOf(c) : potionsSpec.indexOf(c);
    const baseY = gy + (isGold ? 0.95 : 0.55);
    const phase = ((c.x * 0.37 + c.z * 0.61) % TAU + TAU) % TAU;

    _q4.identity();
    _v3.set(c.x, baseY, c.z);
    _m4.compose(_v3, _q4, _s3);
    body.setMatrixAt(bi, _m4);

    _v3.set(c.x, gy + 0.07, c.z);
    _m4.compose(_v3, _q4, _s3);
    auraMesh.setMatrixAt(ci, _m4);
    auraMesh.setColorAt(ci, _col.setHex(isGold ? PAPER.gold : PAPER.rose, THREE.SRGBColorSpace));

    const rec = { body, bi, ci, x: c.x, z: c.z, baseY, phase, isGold, hidden: false };
    pickups.push(rec);

    const mesh = makeHandle(c.x, baseY, c.z, (v) => {
      rec.hidden = !v;
      if (!v) {
        body.setMatrixAt(bi, ZERO);
        auraMesh.setMatrixAt(ci, ZERO);
      } else {
        _q4.identity();
        _v3.set(rec.x, rec.baseY, rec.z);
        _m4.compose(_v3, _q4, _s3);
        body.setMatrixAt(bi, _m4);
        _v3.set(rec.x, rec.baseY - (rec.isGold ? 0.88 : 0.48), rec.z);
        _m4.compose(_v3, _q4, _s3);
        auraMesh.setMatrixAt(ci, _m4);
      }
      body.instanceMatrix.needsUpdate = true;
      auraMesh.instanceMatrix.needsUpdate = true;
    });
    return { id: c.id, kind: c.kind, amount: c.amount, x: c.x, z: c.z, mesh };
  });

  for (const m of [coinMesh, potionMesh, auraMesh]) {
    if (!m) continue;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
  }

  // ── update ──────────────────────────────────────────────────────────
  // No allocation: every Vector3/Quaternion/Matrix4 above is reused. Pickups
  // beyond ANIM_RANGE are past the fog wall, so their matrices are simply left
  // where they were rather than recomputed.
  const ANIM_RANGE2 = 130 * 130;

  function update(simTime, playerPos) {
    WIND.value = simTime;
    const px = playerPos ? (playerPos.x ?? 0) : 0;
    const pz = playerPos ? (playerPos.z ?? 0) : 0;
    let coinDirty = false, potionDirty = false;
    for (let i = 0; i < pickups.length; i++) {
      const r = pickups[i];
      if (r.hidden) continue;
      const dx = r.x - px, dz = r.z - pz;
      if (dx * dx + dz * dz > ANIM_RANGE2) continue;
      const bob = Math.sin(simTime * 1.7 + r.phase) * (r.isGold ? 0.16 : 0.11);
      _v3.set(r.x, r.baseY + bob, r.z);
      if (r.isGold) {
        _q4.setFromAxisAngle(AXIS_Y, simTime * 1.6 + r.phase);
        coinDirty = true;
      } else {
        _q4.setFromAxisAngle(AXIS_Y, Math.sin(simTime * 0.8 + r.phase) * 0.45);
        potionDirty = true;
      }
      _m4.compose(_v3, _q4, _s3);
      r.body.setMatrixAt(r.bi, _m4);
    }
    if (coinDirty && coinMesh) coinMesh.instanceMatrix.needsUpdate = true;
    if (potionDirty && potionMesh) potionMesh.instanceMatrix.needsUpdate = true;
  }

  // ── stats ───────────────────────────────────────────────────────────
  const shadowCalls = castShadow ? (2 + buildingMeshes.length + Object.keys(treeItems).filter((k) => treeItems[k].length).length) : 0;
  const colorCalls = 3 + (banners ? 1 : 0) + buildingMeshes.length + vegMeshes.length
    + (coinMesh ? 1 : 0) + (potionMesh ? 1 : 0) + 1;
  const stats = {
    portals: portals.length,
    buildings: buildingMeshes.length,
    trees: treeCount,
    treesBySpecies: Object.fromEntries(Object.entries(treeItems).map(([k, v]) => [k, v.length])),
    grass: grassItems.length,
    flowers: flowerItems.length,
    groundCover: grassItems.length + flowerItems.length,
    coins: golds.length,
    potions: potionsSpec.length,
    grassSectors: grassSectors.length,
    flowerSectors: flowerSectors.length,
    drawCalls: colorCalls + shadowCalls,
    colorPassCalls: colorCalls,
    shadowPassCalls: shadowCalls,
    materials: materials.length,
  };

  function dispose() {
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const t of textures) t.dispose();
    textures.length = 0;
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    group.clear();
    pickups.length = 0;
    trees.length = 0;
    buildingBodies.length = 0;
  }

  return { group, portals, buildings: buildingBodies, trees, collectibles, stats, update, dispose };
}
