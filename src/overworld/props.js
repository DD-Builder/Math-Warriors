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
 * WHY vegetation lives next door: ground cover and trees are measured in tens
 * of thousands of instances and need their own machinery (cached height grid,
 * clustered scatter, per-sector distance LOD, layered wind) that none of the
 * landmarks here want. ./vegetation.js owns all of it; this module hands it
 * the clearings it must respect and folds its stats and its trunk colliders
 * back into the contract the caller already has.
 *
 * PAPER SURFACE: every lit material here is run through applyPapercut (see
 * materials/toon.js), which layers the procedural fibre grain and pressed
 * tooth from materials/textures.js on top of the baked vertex colours. It
 * chains onto the wind/pulse patches below rather than replacing them, and it
 * costs one shared texture pair for the whole island. Static landmarks sample
 * that paper in WORLD space (so no two gates wear the same patch of sheet);
 * anything that moves samples it in LOCAL space, because grain that stays put
 * while its surface travels is the one way this effect reads as wrong.
 *
 * PULSE: one shared `uWindTime` uniform object patched into the glowing portal
 * page, the pickup discs and the banners via onBeforeCompile — one number
 * written per frame, no extra draw state. (Vegetation runs its own clock; see
 * ./vegetation.js.)
 *
 * Constraints honoured: three r170 only (no examples/ imports), no
 * post-processing, no depth-texture reads, no fwidth/derivative tricks, no
 * per-frame allocation in update(), every colour resolves from PAPER, shadows
 * come from the shared teal-tinted toon ramp — never black, never grey, no
 * outlines. Everything created here is disposed in dispose().
 */
import * as THREE from 'three';
import { WORLD, BIOMES, PORTALS, BUILDINGS, COLLECTIBLES, SPAWN, PATHS, TERRACES } from './worldSpec.js';
import { toonMaterial, applyPapercut, PAPER } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { g, lin, mixHex, shade, trs, sink, stamp, tri, bake, fanXY } from './geobuild.js';
import { createVegetation } from './vegetation.js';
import { resolvePonds } from './water.js';
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

// Clearings so landmarks keep clean silhouettes and approaches stay walkable.
// Handed to ./vegetation.js, which respects them for every scatter it runs.
const CLEAR_PORTAL_TREE = 11, CLEAR_PORTAL_PLANT = 6.0;
const CLEAR_BUILDING_TREE = 13, CLEAR_BUILDING_PLANT = 8.0;
const CLEAR_SPAWN = 7;

/**
 * Ground glow disc under a pickup, flat in XZ (normal +Y), carrying UVs.
 *
 * Built by hand rather than through the sink because it is the one shape here
 * that needs a UV channel: its rim is cut by the deckle mask from
 * materials/textures.js, which is what turns a perfect CG circle into a torn
 * ply of glowing paper. The vertex alpha therefore stops at a plateau instead
 * of feathering to zero — if the geometry faded out on its own the torn edge
 * would land where the disc is already invisible and nobody would ever see it.
 *
 * UVs put the geometric rim at mask radius 1.0, so the mask's mean tear (0.84)
 * bites comfortably inside the triangles.
 */
function buildAuraDiscGeo(radius, segments, aCentre, aRim) {
  const pos = [], nrm = [], col = [], uv = [];
  const push = (x, z, a) => {
    pos.push(x, 0, z);
    nrm.push(0, 1, 0);
    col.push(1, 1, 1, a);
    uv.push(x / (2 * radius) + 0.5, z / (2 * radius) + 0.5);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU, a1 = ((i + 1) / segments) * TAU;
    push(0, 0, aCentre);
    push(Math.cos(a0) * radius, Math.sin(a0) * radius, aRim);
    push(Math.cos(a1) * radius, Math.sin(a1) * radius, aRim);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ── Shader patches ──────────────────────────────────────────────────────

/**
 * Shared animation clock. One object handed to every patched shader's
 * uniforms map, so update() writes a single number per frame.
 */
const WIND = { value: 0 };

/**
 * Gentle glow breathing for the portal pages and pickup discs. Rides on the
 * vertex ALPHA (the geometries carry a 4-component colour attribute, which is
 * what makes three define USE_COLOR_ALPHA and give us a vec4 vColor), so it
 * costs one sine in the vertex shader and no extra draw state.
 */
function patchPulse(material, { amp = 0.24, speed = 1.05 }) {
  // CHAIN. toonMaterial() has already installed the aerial-fog uniforms and the
  // teal shadow floor on this material; assigning over the hook would drop both
  // and leave these props lit — and shadowed — differently from everything
  // around them.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
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
  material.customProgramCacheKey = () =>
    `${prevKey ? prevKey.call(material) : ''}|mw-pulse|${amp}|${speed}`;
}

/**
 * Per-instance atlas cell + a slow float, for the floor-number banners. One
 * canvas atlas + one instanced vec2 offset = nine different signs in one draw
 * call; without this each banner would need its own texture and its own call.
 */
function patchBanner(material) {
  // Chains, for the same reason patchPulse does.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
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
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|mw-banner`;
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
  stampArchCarving(s);
  return bake(s);
}

/**
 * Fluting and a stepped base, stamped onto the arch stone.
 *
 * Split out because it is pure SURFACE: six shallow ribs down each pillar and
 * two plinth steps under them. None of it changes the gate's silhouette and
 * none of it costs a draw call (it lands in the same merged buffer), but it is
 * the difference between a monument and an untextured grey primitive — a
 * cylinder with a flat fill has no scale, and ribs at 40 cm spacing tell a
 * child exactly how big the thing is before they walk up to it.
 */
function stampArchCarving(s) {
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI - Math.PI / 2 + 0.26;
      stamp(s, new THREE.BoxGeometry(0.14, ARCH_PILLAR_TOP - 1.5, 0.14),
        trs(sx * ARCH_PILLAR_X + Math.sin(a) * 0.80, ARCH_PILLAR_TOP / 2 + 0.62,
          Math.cos(a) * 0.80, 0, -a, 0),
        shade(k % 2 === 0 ? 1.09 : 0.90));
    }
    // Two plinth steps. A pillar that meets the ground in one plane is a peg;
    // a pillar that steps down to it is architecture.
    stamp(s, new THREE.CylinderGeometry(1.16, 1.24, 0.30, 8),
      trs(sx * ARCH_PILLAR_X, 0.95, 0), shade(0.95));
    stamp(s, new THREE.CylinderGeometry(1.30, 1.40, 0.26, 8),
      trs(sx * ARCH_PILLAR_X, 0.70, 0), shade(1.06));
  }
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
  return buildAuraDiscGeo(0.95, 20, 0.52, 0.24);
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
    // Shutters, hinged open either side of each window: three plies each, and
    // the only thing on this wall that casts a shadow onto it.
    for (const dx of [-0.62, 0.62]) {
      stamp(s, new THREE.BoxGeometry(0.34, 1.62, 0.08),
        trs(sx * 2.4 + dx, 2.80, 2.32, 0, dx > 0 ? -0.42 : 0.42, 0), lin(PAPER.teal, 0.94));
    }
  }
  // Awning over the entrance, striped like the shop's — the two buildings are
  // in the same town and should look it.
  for (let i = 0; i < 4; i++) {
    stamp(s, new THREE.BoxGeometry(0.95, 0.14, 1.7),
      trs(-1.425 + i * 0.95, 3.55, 3.05, -0.30, 0, 0),
      lin(i % 2 === 0 ? PAPER.cream : PAPER.lavender));
  }
  // Sign board and a hanging lantern by the door.
  stamp(s, new THREE.BoxGeometry(1.9, 0.52, 0.10), trs(0, 3.95, 2.42, -0.12, 0, 0), lin(PAPER.cream, 1.05));
  stamp(s, new THREE.BoxGeometry(1.25, 0.15, 0.12), trs(0, 3.96, 2.48, -0.12, 0, 0), lin(PAPER.lavenderD));
  stampLantern(s, 2.10, 3.30, 2.65, 0.18);
  // Crates stacked against the side wall — a gallery receives deliveries too.
  stampCrate(s, -3.55, 0.42, 1.30, 0.62, 0.28, PAPER.sand);
  stampCrate(s, -3.40, 0.95, 1.22, 0.48, -0.36, PAPER.creamD);
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

// ── Market kit ──────────────────────────────────────────────────────────
//
// A place called Market Town contained two buildings and nothing else: no
// stalls, no awnings, no crates, no lanterns, no signage. A town does not read
// as inhabited because of its architecture — it reads as inhabited because of
// the forty small objects a person left lying around it. That is the entire
// job of this section.
//
// Every piece is merged into ONE geometry per stall variant and drawn as an
// InstancedMesh, so a dozen stalls plus their goods cost three draw calls, not
// forty. Two variants exist rather than one because a row of identical stalls
// is a texture; two alternating silhouettes with different awning hues and
// different goods read as a market.

const STALL_W = 2.7, STALL_D = 2.1, STALL_H = 2.3;

/** Striped gable awning, cut as raw triangles — an awning IS two flat sheets. */
function stampAwning(s, cA, cB, stripes = 5) {
  const OVER = 0.30;
  const RIDGE = STALL_H + 0.58, EAVE = STALL_H + 0.04;
  const span = STALL_W + 2 * OVER;
  const zE = STALL_D / 2 + OVER;
  const drop = RIDGE - EAVE;
  const inv = 1 / Math.hypot(0, zE, drop);
  for (let i = 0; i < stripes; i++) {
    const x0 = -span / 2 + span * (i / stripes);
    const x1 = -span / 2 + span * ((i + 1) / stripes);
    const col = lin(i % 2 === 0 ? cA : cB);
    for (const sz of [-1, 1]) {
      // Up and outward from the ridge: (0, zE, +-drop) normalised.
      const nrm = [0, zE * inv, sz * drop * inv];
      tri(s, [x0, RIDGE, 0], [x1, RIDGE, 0], [x1, EAVE, sz * zE], nrm, col);
      tri(s, [x0, RIDGE, 0], [x1, EAVE, sz * zE], [x0, EAVE, sz * zE], nrm, col);
    }
  }
  // Scalloped hem: little tabs hanging off the eaves. This is what makes an
  // awning read as CLOTH at 30 m instead of as a folded card.
  for (let i = 0; i < stripes; i++) {
    const xm = -span / 2 + span * ((i + 0.5) / stripes);
    const col = lin(i % 2 === 0 ? cB : cA, 0.94);
    for (const sz of [-1, 1]) {
      const w = span / (stripes * 2.3);
      tri(s, [xm - w, EAVE, sz * zE], [xm + w, EAVE, sz * zE],
        [xm, EAVE - 0.20, sz * (zE + 0.04)], [0, 0.30, sz * 0.95], col);
    }
  }
}

/** A crate: a box with a lighter lid ply and two darker banding straps. */
function stampCrate(s, x, y, z, size, rot, tone) {
  stamp(s, new THREE.BoxGeometry(size, size * 0.86, size), trs(x, y + size * 0.43, z, 0, rot, 0), lin(tone));
  stamp(s, new THREE.BoxGeometry(size * 1.04, size * 0.09, size * 1.04),
    trs(x, y + size * 0.86, z, 0, rot, 0), lin(PAPER.sand, 1.06));
  stamp(s, new THREE.BoxGeometry(size * 1.06, size * 0.10, size * 0.16),
    trs(x, y + size * 0.44, z, 0, rot, 0), lin(PAPER.coralD, 0.92));
}

/** A barrel: an open drum with a lid, two hoops baked as ply colour changes. */
function stampBarrel(s, x, y, z, r, h, rot, tone) {
  stamp(s, new THREE.CylinderGeometry(r * 0.86, r * 0.86, h * 0.30, 7, 1, true),
    trs(x, y + h * 0.15, z, 0, rot, 0), lin(tone, 0.90));
  stamp(s, new THREE.CylinderGeometry(r, r, h * 0.42, 7, 1, true),
    trs(x, y + h * 0.51, z, 0, rot, 0), lin(tone));
  stamp(s, new THREE.CylinderGeometry(r * 0.86, r * 0.86, h * 0.30, 7, 1, true),
    trs(x, y + h * 0.86, z, 0, rot, 0), lin(tone, 0.90));
  stamp(s, new THREE.CylinderGeometry(r * 0.80, r * 0.86, 0.07, 7),
    trs(x, y + h, z, 0, rot, 0), lin(PAPER.sand, 1.08));
}

/** A hanging paper lantern: cream body, gold cap, dark cord. */
function stampLantern(s, x, y, z, r) {
  stamp(s, new THREE.CylinderGeometry(0.02, 0.02, 0.26, 4), trs(x, y + 0.13, z), lin(PAPER.sand, 0.8));
  stamp(s, new THREE.CylinderGeometry(r * 0.62, r, r * 1.5, 6, 1, true), trs(x, y - r * 0.6, z), lin(PAPER.cream, 1.14));
  stamp(s, new THREE.CylinderGeometry(r, r * 0.62, r * 1.5, 6, 1, true), trs(x, y - r * 2.1, z), lin(PAPER.gold, 1.10));
}

/**
 * One market stall.
 *
 * Variant 0 is a produce stall (coral/cream awning, crates and a barrel);
 * variant 1 is a cloth-and-lantern stall (teal/cream awning, bolts of paper
 * and a lantern pair). Both stand on a rug, because the single cheapest way to
 * anchor an object to the ground is to put something flat under it.
 */
function buildStall(variant) {
  const s = sink();
  const warm = variant === 0;
  // Rug first — the ground contact ply.
  stamp(s, new THREE.BoxGeometry(STALL_W + 1.5, 0.06, STALL_D + 1.3),
    trs(0, 0.03, 0.25, 0, 0.06, 0), lin(warm ? PAPER.coralD : PAPER.lavenderD, 0.95));
  stamp(s, new THREE.BoxGeometry(STALL_W + 1.1, 0.05, STALL_D + 0.9),
    trs(0, 0.07, 0.25, 0, 0.06, 0), lin(warm ? PAPER.coral : PAPER.lavender));
  // Four posts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      stamp(s, new THREE.CylinderGeometry(0.065, 0.085, STALL_H, 5, 1, true),
        trs(sx * STALL_W / 2, STALL_H / 2, sz * STALL_D / 2), lin(PAPER.sand, 0.90));
    }
  }
  stampAwning(s, warm ? PAPER.coral : PAPER.teal, PAPER.cream);
  // Counter across the front, with a board top.
  stamp(s, new THREE.BoxGeometry(STALL_W + 0.2, 0.78, 0.62),
    trs(0, 0.46, STALL_D / 2 - 0.05), lin(PAPER.sand, 0.94));
  stamp(s, new THREE.BoxGeometry(STALL_W + 0.5, 0.10, 0.82),
    trs(0, 0.90, STALL_D / 2 - 0.05), lin(PAPER.creamD, 1.06));
  // Signboard on the ridge.
  stamp(s, new THREE.BoxGeometry(1.30, 0.46, 0.07),
    trs(0, STALL_H + 0.94, STALL_D / 2 + 0.22, -0.16, 0, 0), lin(PAPER.cream, 1.05));
  stamp(s, new THREE.BoxGeometry(0.86, 0.13, 0.09),
    trs(0, STALL_H + 0.96, STALL_D / 2 + 0.26, -0.16, 0, 0),
    lin(warm ? PAPER.coralD : PAPER.tealD));

  if (warm) {
    // Produce: fruit domes on the counter, crates and a barrel behind.
    for (let i = 0; i < 5; i++) {
      const x = -1.0 + i * 0.5;
      stamp(s, new THREE.SphereGeometry(0.15, 6, 4),
        trs(x, 1.05, STALL_D / 2 - 0.05, 0, i * 0.7, 0, 1, 0.78, 1),
        lin(i % 3 === 0 ? PAPER.coral : (i % 3 === 1 ? PAPER.gold : PAPER.rose)));
    }
    stampCrate(s, -0.85, 0.09, -0.45, 0.62, 0.22, PAPER.sand);
    stampCrate(s, -0.80, 0.62, -0.40, 0.48, -0.34, PAPER.creamD);
    stampBarrel(s, 0.92, 0.09, -0.50, 0.34, 0.80, 0.5, PAPER.coralD);
  } else {
    // Cloth: rolled bolts leaning on the counter, two hanging lanterns.
    for (let i = 0; i < 4; i++) {
      const x = -0.95 + i * 0.62;
      stamp(s, new THREE.CylinderGeometry(0.13, 0.13, 1.05, 6),
        trs(x, 1.35, STALL_D / 2 - 0.30, 0.38, 0, i * 0.10 - 0.15),
        lin([PAPER.tealL, PAPER.lavender, PAPER.rose, PAPER.sky][i]));
    }
    stampLantern(s, -STALL_W / 2 + 0.10, STALL_H + 0.02, STALL_D / 2 - 0.08, 0.16);
    stampLantern(s, STALL_W / 2 - 0.10, STALL_H + 0.02, STALL_D / 2 - 0.08, 0.16);
    stampCrate(s, 0.70, 0.09, -0.52, 0.55, -0.18, PAPER.creamD);
  }
  return bake(s);
}

/**
 * A loose pile of goods — crates, a barrel and a sack — for the ground between
 * stalls and against building walls. One geometry, scattered with a per-pile
 * yaw and tint, which is what turns a plaza from a floor into a place people
 * have been working in.
 */
function buildCargoPile() {
  const s = sink();
  stampCrate(s, 0, 0, 0, 0.66, 0.12, PAPER.sand);
  stampCrate(s, 0.62, 0, 0.28, 0.50, -0.42, PAPER.creamD);
  stampCrate(s, 0.04, 0.57, -0.02, 0.46, 0.55, PAPER.creamD);
  stampBarrel(s, -0.55, 0, 0.34, 0.29, 0.70, 0.9, PAPER.coralD);
  // A sack: a squashed dome, the one soft shape in a pile of boxes.
  stamp(s, new THREE.SphereGeometry(0.30, 7, 5),
    trs(-0.30, 0.24, -0.48, 0, 0.4, 0.12, 1, 0.86, 1), lin(PAPER.sand, 1.06));
  stamp(s, new THREE.CylinderGeometry(0.07, 0.13, 0.16, 6),
    trs(-0.30, 0.52, -0.48), lin(PAPER.creamD));
  return bake(s);
}

/**
 * Contact apron: a torn disc of teal-tinted paper laid on the ground under a
 * built thing.
 *
 * "No AO at the ground contact" was written against every building in the set,
 * and it is the note that makes objects look pasted on rather than placed. A
 * papercut world has no ambient occlusion to give — but it does have a shadow
 * hue, and one flat ply of it under a wall is exactly how the 2D game already
 * says "this sheet is on top of that sheet". Alpha ramps from the centre out,
 * and the deckle mask stops it being a vector circle.
 */
function buildApronGeo() {
  return buildAuraDiscGeo(1.0, 18, 0.86, 0.16);
}

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
 * Lay the market out ALONG ITS OWN STREET.
 *
 * The three structures used to stand at independent authored positions on flat
 * ground, which is why the frame read as object scatter on a plane rather than
 * as a town. worldSpec.js already carves a road (PATHS 'market-main') and
 * raises a plaza (TERRACES 'market-plaza'); this reads that same polyline and
 * hangs everything off it, so the stalls flank the road by construction and
 * cannot drift out of step with it when the road is retuned.
 *
 * Stalls alternate variant along each side, and the two sides are offset by
 * half a pitch so the row never reads as a grid. Anything that would land on a
 * building's footprint is dropped rather than nudged — a gap in a market row is
 * a side alley, and side alleys are free composition.
 */
function marketLayout(rng, buildings) {
  const street = PATHS.find((p) => p.id === 'market-main');
  const plaza = TERRACES.find((t) => t.id === 'market-plaza');
  const stalls = [], piles = [];
  if (!street || street.pts.length < 2) return { stalls, piles };

  // Arc-length parameterisation of the polyline, so stalls are evenly spaced
  // in METRES rather than in node index (the nodes are not evenly spaced).
  const pts = street.pts;
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d);
    total += d;
  }
  const at = (u) => {
    let want = Math.min(1, Math.max(0, u)) * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const t = seg[i] > 0 ? Math.min(1, want / seg[i]) : 0;
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
        const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
        const dx = (pts[i + 1][0] - pts[i][0]) / (seg[i] || 1);
        const dz = (pts[i + 1][1] - pts[i][1]) / (seg[i] || 1);
        return { x, z, dx, dz };
      }
      want -= seg[i];
    }
    return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
  };

  const blocked = (x, z, r) => buildings.some((b) =>
    (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z) < (r + 3.9) * (r + 3.9));
  // Keep the row inside the plaza's own reach: a stall out on natural ground
  // beyond the plinth is back to being an object on a plane.
  const onPlaza = (x, z) => !plaza
    || Math.hypot(x - plaza.x, z - plaza.z) < Math.max(plaza.hx, plaza.hz) + plaza.skirt * 0.65;

  const PITCH = 0.063;          // fraction of the street per stall slot
  const OFFSET = 5.1;           // metres from the centreline to a stall's post
  let v = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const u = 0.36 + (k + (side > 0 ? 0.5 : 0)) * PITCH;
      const p = at(u);
      // Perpendicular to the road, in world XZ.
      const px = -p.dz, pz = p.dx;
      const x = p.x + px * side * OFFSET;
      const z = p.z + pz * side * OFFSET;
      v = (v + 1) % 2;
      if (!onPlaza(x, z) || blocked(x, z, 2.6)) continue;
      // The counter (+z in stall-local space) turns to face the road.
      stalls.push({ x, z, yaw: Math.atan2(-px * side, -pz * side), variant: v });
      // A pile of goods tucked behind most stalls.
      if (rng() < 0.62) {
        const bx = x + px * side * 2.6 + p.dx * (rng() - 0.5) * 2.2;
        const bz = z + pz * side * 2.6 + p.dz * (rng() - 0.5) * 2.2;
        piles.push({ x: bx, z: bz, yaw: rng() * TAU, tone: rng() });
      }
    }
  }
  // A few more piles loose along the street itself, so the plaza floor is not
  // swept clean between the rows.
  for (let i = 0; i < 5; i++) {
    const p = at(0.34 + i * 0.11);
    const px = -p.dz, pz = p.dx;
    const off = (rng() < 0.5 ? -1 : 1) * (7.6 + rng() * 2.4);
    const x = p.x + px * off, z = p.z + pz * off;
    if (!onPlaza(x, z) || blocked(x, z, 1.4)) continue;
    piles.push({ x, z, yaw: rng() * TAU, tone: rng() });
  }
  return { stalls, piles };
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

  // ── Materials (every repeated shape shares one) ──
  const structMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  const pickupMat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
  // The glowing arch page and the pickup ground-glow used to share one
  // material. They are split now because only the disc carries UVs, and an
  // alphaMap on a geometry without them would sample one corner texel and
  // silently erase the portal glow. Separate meshes already, so the split
  // costs zero draw calls.
  const pageMat = trackMat(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, fog: true,
  }));
  const discMat = trackMat(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, fog: true,
    alphaMap: deckleDisc(),          // shared instance — never disposed here
  }));
  const bannerMat = trackMat(new THREE.MeshBasicMaterial({
    transparent: false, side: THREE.FrontSide, fog: true,
  }));
  // Ground contact. Unlit on purpose: this ply IS a shadow, so relighting it
  // would be relighting a shadow. It takes the palette's own shadow hue at low
  // alpha and the deckle mask cuts its rim, exactly like the hero's blob.
  const apronMat = trackMat(new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHex(PAPER.shadow, THREE.SRGBColorSpace),
    vertexColors: true, transparent: true, depthWrite: false,
    opacity: 0.30, fog: true, alphaMap: deckleDisc(),
  }));

  patchPulse(pageMat, { amp: 0.26, speed: 1.0 });
  patchPulse(discMat, { amp: 0.26, speed: 1.0 });
  patchBanner(bannerMat);

  // ── Paper surface (chains onto the wind/pulse patches above) ──
  // Scales are per-object-class, in world metres per texture tile, chosen so
  // the fibre reads at the size the thing actually is: a 9 m gate wants a
  // coarser weave than a 0.4 m coin or the grain becomes invisible on one and
  // a pattern on the other.
  //
  // Space is the load-bearing choice. Landmarks are static, so WORLD space
  // gives every gate and every building its own patch of paper for free.
  // Anything that moves — a tree in the wind, a spinning coin, a swaying blade
  // — takes LOCAL space, because world-space grain on a moving surface crawls
  // across it, which is the one way this effect can look wrong.
  //
  // structMat additionally wears the MACRO layer (see PAPERCUT_DEFAULTS.macro).
  // A 9 m gate and a 6 m building are exactly the objects the fibre grain
  // cannot reach: it is tuned for arm's length and is invisible at the range
  // the establishing shots are taken from, which is why the arches read as
  // "untextured flat grey" however much grain was on them. The 15 m patina
  // gives a wall a colour that changes across itself, and the sun-bleach pair
  // gives every roof slab and every ledge a directional read that survives
  // into shadow.
  applyPapercut(structMat, {
    grain: 0.10, normal: 0.14, roughnessLike: 0.22, scale: 1.6, space: 'world',
    macro: 0.085, macroScale: 15, bleach: 0.34,
  });
  applyPapercut(pickupMat, {
    grain: 0.07, normal: 0.09, roughnessLike: 0.16, scale: 0.42, space: 'local',
    bleach: 0.20,
  });

  // ── Clearings, filled as landmarks are placed ──
  const treeClear = [], plantClear = [];
  const addClear = (x, z, rTree, rPlant) => {
    treeClear.push(x, z, rTree);
    plantClear.push(x, z, rPlant);
  };
  addClear(SPAWN.x, SPAWN.z, CLEAR_SPAWN, CLEAR_SPAWN * 0.6);
  // Inland pools. water.js fits them to the terrain, and resolvePonds() is a
  // pure re-run of exactly that fit — so a pool and its clearing can never end
  // up in different places. Plants stop a hair outside the deckle rim (the
  // outline wobbles +-17%, hence the 1.25); trees keep well back so no trunk
  // grows out of the water.
  for (const p of resolvePonds(heightfield)) {
    addClear(p.x, p.z, p.radius * 2.0, p.radius * 1.25);
  }

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
  const archPage = new THREE.InstancedMesh(track(buildArchPage()), pageMat, nP);
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

  // ═══ 2b. THE MARKET ═══
  // Twelve stalls flanking the authored street, plus loose goods. Two stall
  // geometries and one cargo geometry, so the whole market costs three colour
  // calls and three shadow calls — about what one un-instanced building costs.
  const mkRng = makeRng(seed ^ 0x9a7c15);
  const market = marketLayout(mkRng, buildingBodies);
  const stallMeshes = [];
  const apronSpots = [];
  for (const b of buildingBodies) apronSpots.push({ x: b.x, z: b.z, r: 6.4 });

  for (let v = 0; v < 2; v++) {
    const items = market.stalls.filter((st) => st.variant === v);
    const geo = track(buildStall(v));
    if (!items.length) continue;
    const im = new THREE.InstancedMesh(geo, structMat, items.length);
    im.name = `market-stall-${v}`;
    items.forEach((st, i) => {
      const y = footprintY(sampleHeight, st.x, st.z, 2.3);
      _q4.setFromAxisAngle(AXIS_Y, st.yaw);
      _v3.set(st.x, y, st.z);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      // Near-neutral per-stall tone: enough that no two awnings in a row are
      // the same paper, nowhere near enough to leave the palette.
      im.setColorAt(i, _col.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace)
        .multiplyScalar(0.93 + ((i * 7) % 5) * 0.035));
      addClear(st.x, st.z, 6.5, 3.4);
      apronSpots.push({ x: st.x, z: st.z, r: 3.1 });
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    stallMeshes.push(im);
  }

  let cargoMesh = null;
  if (market.piles.length) {
    cargoMesh = new THREE.InstancedMesh(track(buildCargoPile()), structMat, market.piles.length);
    cargoMesh.name = 'market-cargo';
    market.piles.forEach((p, i) => {
      const y = footprintY(sampleHeight, p.x, p.z, 1.0);
      _q4.setFromAxisAngle(AXIS_Y, p.yaw);
      _v3.set(p.x, y, p.z);
      const sc = 0.82 + p.tone * 0.42;
      _s3.set(sc, sc, sc);
      _m4.compose(_v3, _q4, _s3);
      cargoMesh.setMatrixAt(i, _m4);
      cargoMesh.setColorAt(i, _col.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace)
        .multiplyScalar(0.90 + p.tone * 0.18));
      addClear(p.x, p.z, 3.0, 1.8);
    });
    _s3.set(1, 1, 1);
    cargoMesh.instanceMatrix.needsUpdate = true;
    if (cargoMesh.instanceColor) cargoMesh.instanceColor.needsUpdate = true;
    cargoMesh.castShadow = castShadow;
    cargoMesh.receiveShadow = true;
    cargoMesh.computeBoundingSphere();
    group.add(cargoMesh);
  }

  // ═══ 2c. GROUND CONTACT ═══
  // One torn ply of teal paper under every built thing. See buildApronGeo: a
  // papercut world has no ambient occlusion to give, but it does have a shadow
  // hue, and this is how the 2D game already says one sheet sits on another.
  const apronMesh = apronSpots.length
    ? new THREE.InstancedMesh(track(buildApronGeo()), apronMat, apronSpots.length)
    : null;
  if (apronMesh) {
    apronMesh.name = 'ground-apron';
    apronSpots.forEach((a, i) => {
      _q4.identity();
      _v3.set(a.x, sampleHeight(a.x, a.z) + 0.045, a.z);
      _s3.set(a.r, 1, a.r);
      _m4.compose(_v3, _q4, _s3);
      apronMesh.setMatrixAt(i, _m4);
    });
    _s3.set(1, 1, 1);
    apronMesh.instanceMatrix.needsUpdate = true;
    apronMesh.castShadow = false;
    apronMesh.receiveShadow = false;
    apronMesh.renderOrder = 1;
    apronMesh.computeBoundingSphere();
    group.add(apronMesh);
  }

  // ═══ 3. VEGETATION ═══
  // Ground cover, trees and the hero set-pieces live in ./vegetation.js — see
  // that module for why they need a cached height grid, a clustered scatter and
  // a per-sector distance LOD that nothing else on the island does. All this
  // module owes them is the clearing list it just finished filling in.
  const veg = createVegetation(heightfield, {
    seed, density, castShadow, treeClear, plantClear,
  });
  group.add(veg.group);
  const trees = veg.trees;

  // ═══ 4. COLLECTIBLES ═══
  const golds = COLLECTIBLES.filter((c) => c.kind === 'gold');
  const potionsSpec = COLLECTIBLES.filter((c) => c.kind !== 'gold');
  const coinMesh = golds.length ? new THREE.InstancedMesh(track(buildCoin()), pickupMat, golds.length) : null;
  const potionMesh = potionsSpec.length ? new THREE.InstancedMesh(track(buildPotion()), pickupMat, potionsSpec.length) : null;
  const auraMesh = new THREE.InstancedMesh(track(buildAuraDisc()), discMat, COLLECTIBLES.length);
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

  // `windTime` is a SEPARATE clock so weather can drive the foliage harder
  // (see weather.js `wind`) without also spinning coins and pulsing portals
  // faster. It defaults to simTime, so every existing caller is unaffected.
  function update(simTime, playerPos, windTime = simTime) {
    WIND.value = windTime;
    veg.update(simTime, playerPos, windTime);
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
  // Landmark calls are exact (these meshes are always resident). Vegetation
  // reports its own worst case — every ground-cover sector inside the LOD cull
  // radius, nothing frustum-culled — which is roughly twice what a real frame
  // pays.
  const marketCalls = stallMeshes.length + (cargoMesh ? 1 : 0);
  const shadowCalls = castShadow ? (2 + buildingMeshes.length + marketCalls) : 0;
  const colorCalls = 3 + (banners ? 1 : 0) + buildingMeshes.length
    + marketCalls + (apronMesh ? 1 : 0)
    + (coinMesh ? 1 : 0) + (potionMesh ? 1 : 0) + 1;
  const stats = {
    portals: portals.length,
    buildings: buildingMeshes.length,
    stalls: market.stalls.length,
    cargo: market.piles.length,
    aprons: apronSpots.length,
    coins: golds.length,
    potions: potionsSpec.length,
    vegetation: veg.stats,
    trees: veg.stats.trees,
    treesBySpecies: veg.stats.treesBySpecies,
    groundCover: veg.stats.groundCover,
    groundCoverByArchetype: veg.stats.groundCoverByArchetype,
    petals: veg.stats.petals,
    drawCalls: colorCalls + shadowCalls + veg.stats.drawCalls,
    colorPassCalls: colorCalls + veg.stats.colorPassCalls,
    shadowPassCalls: shadowCalls + veg.stats.shadowPassCalls,
    materials: materials.length + veg.stats.materials,
  };

  function dispose() {
    veg.dispose();
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
