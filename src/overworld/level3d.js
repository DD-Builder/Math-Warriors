/**
 * 3D PLAYABLE LEVELS — the nine floors of the tower, cut from paper.
 *
 * Entering a floor used to drop the player out of the 3D world and into the
 * flat 2D tile maze. This module is the replacement: it turns the SAME data
 * (src/data/levels.js — same tiles, same objects, same transform, same secret,
 * so every rule the game already enforces still holds) into a real place you
 * walk around in, and hands the integrator a self-contained group plus the
 * triggers it needs to fire the EXISTING gameplay logic.
 *
 * The decisions live next door in ./level3dBuild.js (pure, tested). This file
 * is only the cutting: geometry, materials, instancing, animation, disposal.
 *
 * ── COMPOSITION: WHY THIS IS NOT AN EXTRUDED MAZE ──────────────────────────
 * Four things separate a place from a floor plan, and each costs almost
 * nothing:
 *
 *   TERRACES     the ground climbs in bands as you walk in, so the level has
 *                foreground/midground/background instead of one plane. The
 *                boss sits on the highest of them, visible from the entrance.
 *   SILHOUETTE   a wall run is never one extruded ribbon: every tile varies in
 *                height, yaw, in-tile offset and width, banded by value noise
 *                so the variation reads as growth rather than as shuffling,
 *                and each floor has its own构 archetype (hedgerow, ruin course,
 *                cloudbank, basalt column, ice slab, crystal, market stall,
 *                bookcase, manuscript screen).
 *   OPENNESS     there is no ceiling and walls top out at 3-7 m against a
 *                camera that sits above them, so landmarks stay in sightline
 *                across the whole floor. These are outdoor places.
 *   MATERIAL     everything is layered plies of PAPER stock with teal-tinted
 *                shade — the same toon ramp and the same procedural fibre the
 *                hub island uses, so walking through a portal is a change of
 *                place, not a change of engine.
 *
 * ── PERFORMANCE: WHERE THE DRAW CALLS GO ───────────────────────────────────
 * A floor is up to 42x36 tiles. Naively that is 1500 meshes. Instead:
 *
 *   ground      ONE merged geometry — every walkable tile, its raised path
 *               ribbons, and the skirts that bury its edges. 1 call.
 *   walls       3 InstancedMeshes (one per silhouette variant) + 1 crown.
 *               Interior walls — the ones buried in other walls — are culled
 *               entirely; on Crystal Caverns that is 831 tiles down to ~250.
 *   liquid      2 calls: the animated sheet and its foam rim.
 *   detail      1 InstancedMesh of ground scatter.
 *   objects     one InstancedMesh per furniture family, ~11 calls for the
 *               whole floor regardless of how many objects it holds.
 *   transform   1 call, hidden until the payoff.
 *
 * Measured worst case (floor 9, the largest): 24 colour + 9 shadow = 33 draw
 * calls, ~96 k triangles. Budget is 250 calls / 500 k tris shared across the
 * whole frame, so a level costs about 13% of the calls and 19% of the tris —
 * and while a level is loaded the hub's terrain and vegetation are not.
 *
 * TECH LAW honoured: three r170 only (no examples/ imports — merging is done
 * through ./geobuild.js's primitive sink, which is the same operation as
 * BufferGeometryUtils.mergeGeometries and is what the rest of this world
 * already uses), no post-processing, no depth-texture reads, no fwidth, no
 * per-frame allocation in update(), everything disposed.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { toonMaterial, applyPapercut } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { g, lin, shade, trs, sink, stamp, tri, bake } from './geobuild.js';
import {
  TILE_M, LIQUID_DROP,
  readLevel, distanceField, heightField, makeHeightSampler,
  wallTiles, liquidTiles, groundTiles, levelColliders, objectSpecs,
  levelSpawn, levelBounds, themeForFloor, tileCenter,
} from './level3dBuild.js';

const TAU = Math.PI * 2;

/** Footprint of one wall block. Slightly over a tile so a run joins solidly. */
const WALL_W = 4.05;
/** Path ribbons ride this far proud of the ground they cross. */
const PATH_LIFT = 0.16;
/** How far a ground edge is buried where it meets a wall or a basin. */
const SKIRT_DEPTH = 2.8;
/** Liquid surface relative to the land beside it. */
const LIQUID_FREEBOARD = 0.9;
/** Seconds the world-changing payoff takes to play out. */
const TRANSFORM_SECS = 2.4;
const REVEAL_SECS = 1.1;
/** Pickups past this distance are not animated — they are past the haze. */
const ANIM_RANGE2 = 110 * 110;

// ── Zero-allocation scratch. Every one of these is written and consumed
// inside a single update() statement; nothing here is ever retained. ────────
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _q4 = new THREE.Quaternion();
const _s3 = new THREE.Vector3(1, 1, 1);
const _m4 = new THREE.Matrix4();
const _eu = new THREE.Euler();
const _col = new THREE.Color();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** One clock object shared by every patched shader on the level. */
function makeClock() { return { value: 0 }; }

// ═══════════════════════════════════════════════════════════════════════
// Primitive helpers — all build-time, allocation is free here
// ═══════════════════════════════════════════════════════════════════════

function plate(s, w, d, y0, y1, rgb, { rot = 0, ox = 0, oz = 0, tilt = 0 } = {}) {
  stamp(s, new THREE.BoxGeometry(w, Math.max(0.01, y1 - y0), d),
    trs(ox, (y0 + y1) / 2, oz, tilt, rot, 0), rgb);
}

function prism(s, rBot, rTop, y0, y1, seg, rgb, { rot = 0, ox = 0, oz = 0, tilt = 0 } = {}) {
  stamp(s, new THREE.CylinderGeometry(rTop, rBot, Math.max(0.01, y1 - y0), seg, 1, false),
    trs(ox, (y0 + y1) / 2, oz, tilt, rot, 0), rgb);
}

/** A triangle with its true geometric normal — used by the merged ground. */
function triN(s, p0, p1, p2, c0, c1 = c0, c2 = c1) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  tri(s, p0, p1, p2, [nx, ny, nz], c0, c1, c2);
}

/** Soft aura disc, alpha ramped centre->rim. No texture, no derivatives. */
function auraDiscGeo(radius, segments) {
  const pos = [], nrm = [], col = [], uv = [];
  const push = (x, z, a) => {
    pos.push(x, 0, z); nrm.push(0, 1, 0); col.push(1, 1, 1, a);
    uv.push(x / (2 * radius) + 0.5, z / (2 * radius) + 0.5);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU, a1 = ((i + 1) / segments) * TAU;
    push(0, 0, 0.85);
    push(Math.cos(a0) * radius, Math.sin(a0) * radius, 0.0);
    push(Math.cos(a1) * radius, Math.sin(a1) * radius, 0.0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

/**
 * Instance-backed stand-in for a scene Mesh, so the integrator can write
 * `obj.mesh.visible = false` on a thing that is really one row of an
 * InstancedMesh. Same contract props.js exposes for portals and pickups.
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
    configurable: true, enumerable: true,
  });
  return h;
}

// ═══════════════════════════════════════════════════════════════════════
// Wall archetypes — nine floors, nine silhouettes
//
// Each builder returns THREE variant geometries, unit height (the instance
// scales y to the tile's own height) and roughly WALL_W across. Colours are
// RELATIVE ply shades; the floor's actual papers arrive per instance through
// instanceColor, which is what lets one material carry a whole hedgerow.
// ═══════════════════════════════════════════════════════════════════════

/** Floor 1 — layered papercut hedgerow. Four plies, each yawed a little off
 *  the last, so the cut edges of the paper show along the whole run. */
function buildHedge(v) {
  const s = sink();
  const w = WALL_W * (1 - v * 0.03);
  plate(s, w, w * 0.86, 0.00, 0.24, shade(0.72));                     // leaf litter
  plate(s, w * 0.96, w * 0.80, 0.20, 0.55, shade(0.86), { rot: 0.06 });
  plate(s, w * 0.92, w * 0.74, 0.50, 0.80, shade(1.00), { rot: -0.09 });
  plate(s, w * 0.84, w * 0.66, 0.76, 0.96, shade(1.12), { rot: 0.13 });
  // Scalloped crest: three lobes so the top is never a straight line.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + v * 0.8;
    prism(s, w * 0.20, w * 0.15, 0.90, 1.00 + (i === v % 3 ? 0.10 : 0.02), 6, shade(1.18),
      { ox: Math.cos(a) * w * 0.24, oz: Math.sin(a) * w * 0.24 });
  }
  return bake(s);
}

/** Floor 2 — weathered sunken-ruin wall. Three masonry courses, the top one
 *  broken away on one side; variant 2 is a stub pillar. */
function buildMasonry(v) {
  const s = sink();
  const w = WALL_W;
  plate(s, w, w * 0.9, 0.00, 0.30, shade(0.78));
  plate(s, w * 0.97, w * 0.86, 0.26, 0.58, shade(0.94), { ox: 0.06 });
  plate(s, w * 0.94, w * 0.84, 0.54, 0.84, shade(1.06), { ox: -0.08 });
  if (v === 2) {
    plate(s, w * 0.44, w * 0.80, 0.80, 1.00, shade(1.14), { ox: -w * 0.22 });
  } else {
    plate(s, w * 0.90, w * 0.80, 0.80, 0.94 + v * 0.06, shade(1.14));
    plate(s, w * 0.34, w * 0.70, 0.92, 1.00, shade(1.20), { ox: w * (v ? 0.24 : -0.24) });
  }
  return bake(s);
}

/** Floor 3 — cloud bank, with a sky-stone pillar for variant 2. */
function buildCloudbank(v) {
  const s = sink();
  const w = WALL_W;
  if (v === 2) {
    prism(s, w * 0.30, w * 0.22, 0.00, 0.70, 6, shade(0.88));
    prism(s, w * 0.24, w * 0.28, 0.66, 1.00, 6, shade(1.06));
    prism(s, w * 0.34, w * 0.30, 0.96, 1.06, 6, shade(1.16));
    return bake(s);
  }
  const lobes = [
    [-0.26, 0.00, 0.30, 0.34, 0.86],
    [0.22, 0.10, 0.34, 0.58, 1.00],
    [0.02, -0.22, 0.26, 0.74, 1.10],
    [-0.16, 0.20, 0.22, 0.86, 1.18],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [ox, oz, r, y0, sh] = lobes[i];
    prism(s, w * r, w * r * 0.88, y0 * 1.0, (y0 + 0.30) * 1.0, 8, shade(sh + v * 0.02),
      { ox: ox * w, oz: oz * w });
  }
  return bake(s);
}

/** Floor 4 — basalt columns. Hexagonal prisms clustered at three heights, so
 *  a wall run reads as a fractured colonnade, not a fence. */
function buildColumn(v) {
  const s = sink();
  const w = WALL_W;
  const cols = [
    [-0.24, -0.18, 0.26, 1.00],
    [0.22, -0.10, 0.22, 0.74],
    [0.00, 0.26, 0.24, 0.88],
  ];
  for (let i = 0; i < cols.length; i++) {
    const [ox, oz, r, top] = cols[i];
    const h = top * (0.86 + ((i + v) % 3) * 0.09);
    prism(s, w * r, w * r * 0.94, 0.00, h, 6, shade(0.82 + i * 0.13),
      { ox: ox * w, oz: oz * w, rot: (i + v) * 0.4 });
    prism(s, w * r * 0.98, w * r * 0.72, h - 0.06, h + 0.05, 6, shade(1.14),
      { ox: ox * w, oz: oz * w, rot: (i + v) * 0.4 });
  }
  return bake(s);
}

/** Floor 5 — ice wall. Tilted slabs, bright plies, a cracked shoulder. */
function buildSlab(v) {
  const s = sink();
  const w = WALL_W;
  plate(s, w, w * 0.8, 0.00, 0.20, shade(0.80));
  plate(s, w * 0.86, w * 0.52, 0.14, 0.92 - v * 0.06, shade(1.00), { tilt: 0.09, ox: -w * 0.12 });
  plate(s, w * 0.64, w * 0.44, 0.20, 1.00, shade(1.14), { tilt: -0.12, ox: w * 0.18, rot: 0.22 });
  plate(s, w * 0.40, w * 0.34, 0.60, 0.86, shade(1.22), { tilt: 0.18, oz: -w * 0.16 });
  return bake(s);
}

/** Floor 6 — crystal formation. Tapered points at splayed angles. */
function buildCrystal(v) {
  const s = sink();
  const w = WALL_W;
  prism(s, w * 0.36, w * 0.30, 0.00, 0.22, 6, shade(0.78));
  const pts = [
    [-0.20, -0.12, 0.20, 0.96, 0.16],
    [0.20, 0.06, 0.17, 0.78, -0.20],
    [0.02, 0.24, 0.14, 1.00, 0.10],
    [-0.06, -0.26, 0.12, 0.62, -0.14],
  ];
  for (let i = 0; i < pts.length; i++) {
    const [ox, oz, r, top, tilt] = pts[i];
    prism(s, w * r, w * r * 0.10, 0.16, top * (0.9 + ((i + v) % 3) * 0.07), 5,
      shade(0.90 + i * 0.10), { ox: ox * w, oz: oz * w, tilt: tilt + v * 0.04, rot: i * 0.7 });
  }
  return bake(s);
}

/** Floor 7 — market stall. Counter, posts, striped awning. */
function buildStall(v) {
  const s = sink();
  const w = WALL_W;
  plate(s, w * 0.92, w * 0.54, 0.00, 0.52, shade(0.86), { oz: w * 0.12 });   // counter
  plate(s, w * 0.96, w * 0.58, 0.50, 0.58, shade(1.02), { oz: w * 0.12 });   // counter top
  for (const sx of [-1, 1]) {
    plate(s, w * 0.07, w * 0.07, 0.00, 0.92, shade(0.78), { ox: sx * w * 0.40, oz: -w * 0.14 });
  }
  // Awning: alternating stripes as separate plies, tilted forward.
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const x0 = (-0.44 + (i / stripes) * 0.88) * w;
    plate(s, (w * 0.88) / stripes, w * 0.62, 0.88, 0.96,
      shade(i % 2 ? 1.18 : 0.96), { ox: x0 + (w * 0.44) / stripes, oz: 0, tilt: -0.20 });
  }
  plate(s, w * 0.90, w * 0.10, 0.80, 0.90, shade(1.10), { oz: w * 0.26 });   // valance
  if (v === 2) plate(s, w * 0.30, w * 0.30, 0.58, 0.80, shade(1.06), { oz: w * 0.10 }); // crate of goods
  return bake(s);
}

/** Floor 8 — towering bookcase. Frame, shelves, and a run of spines whose
 *  varying heights are the whole silhouette. */
function buildShelf(v) {
  const s = sink();
  const w = WALL_W;
  plate(s, w * 0.96, w * 0.46, 0.00, 0.08, shade(0.76));
  for (const sx of [-1, 1]) {
    plate(s, w * 0.08, w * 0.46, 0.00, 1.00, shade(0.86), { ox: sx * w * 0.44 });
  }
  plate(s, w * 0.96, w * 0.46, 0.96, 1.04, shade(1.10));
  for (let sh = 0; sh < 3; sh++) {
    const y = 0.10 + sh * 0.30;
    plate(s, w * 0.86, w * 0.44, y, y + 0.05, shade(0.94));
    for (let b = 0; b < 6; b++) {
      const bh = 0.14 + ((b * 7 + sh * 3 + v * 5) % 5) * 0.022;
      plate(s, w * 0.10, w * 0.30, y + 0.05, y + 0.05 + bh,
        shade(0.90 + ((b + sh + v) % 4) * 0.10),
        { ox: (-0.36 + b * 0.145) * w, oz: -w * 0.03 });
    }
  }
  return bake(s);
}

/** Floor 9 — manuscript screen. Framed paper panels, one leaf folded back. */
function buildScreen(v) {
  const s = sink();
  const w = WALL_W;
  plate(s, w * 0.92, w * 0.26, 0.00, 0.09, shade(0.80));
  const leaves = v === 2 ? 2 : 3;
  for (let i = 0; i < leaves; i++) {
    const t = leaves === 1 ? 0 : i / (leaves - 1) - 0.5;
    const rot = t * 0.55 + (v === 2 ? 0.3 : 0);
    const ox = t * w * 0.32;
    plate(s, w * 0.44, w * 0.06, 0.06, 1.00, shade(1.06), { ox, rot });         // panel
    plate(s, w * 0.46, w * 0.09, 0.06, 0.14, shade(0.88), { ox, rot });         // foot rail
    plate(s, w * 0.46, w * 0.09, 0.94, 1.02, shade(0.88), { ox, rot });         // head rail
    plate(s, w * 0.30, w * 0.03, 0.40 + i * 0.06, 0.52 + i * 0.06, shade(1.18), { ox, rot }); // glyph band
  }
  return bake(s);
}

const WALL_BUILDERS = {
  hedge: buildHedge, masonry: buildMasonry, cloudbank: buildCloudbank,
  column: buildColumn, slab: buildSlab, crystal: buildCrystal,
  stall: buildStall, shelf: buildShelf, screen: buildScreen,
};

/** What grows out of a wall top. Sits in its own InstancedMesh so it can carry
 *  the bright accent papers without dragging the wall body's hue with it. */
function buildCrown(kind) {
  const s = sink();
  switch (kind) {
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        prism(s, 0.22, 0.20, 0.00, 0.10, 6, shade(1.0),
          { ox: Math.cos(a) * 0.62, oz: Math.sin(a) * 0.62 });
        prism(s, 0.09, 0.07, 0.08, 0.20, 5, shade(1.18),
          { ox: Math.cos(a) * 0.62, oz: Math.sin(a) * 0.62 });
      }
      return bake(s);
    case 'moss':
      plate(s, 1.5, 1.2, 0.00, 0.10, shade(1.0));
      plate(s, 0.9, 0.7, 0.08, 0.20, shade(1.14), { rot: 0.5 });
      return bake(s);
    case 'spike':
      prism(s, 0.34, 0.02, 0.00, 1.10, 5, shade(1.0));
      prism(s, 0.20, 0.02, 0.00, 0.70, 5, shade(1.16), { ox: 0.44, tilt: 0.28 });
      return bake(s);
    case 'glow':
      prism(s, 0.46, 0.30, 0.00, 0.16, 6, shade(1.0));
      prism(s, 0.24, 0.16, 0.12, 0.44, 6, shade(1.24));
      return bake(s);
    case 'lantern':
      plate(s, 0.10, 0.10, 0.00, 0.42, shade(0.84));
      plate(s, 0.38, 0.38, 0.40, 0.76, shade(1.22));
      plate(s, 0.46, 0.46, 0.74, 0.82, shade(1.0));
      return bake(s);
    case 'glyph':
      plate(s, 0.90, 0.06, 0.00, 0.60, shade(1.0));
      plate(s, 0.44, 0.09, 0.20, 0.34, shade(1.24));
      return bake(s);
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Object furniture
// ═══════════════════════════════════════════════════════════════════════

function buildCoin() {
  const s = sink();
  prism(s, 0.46, 0.46, -0.06, 0.06, 10, shade(1.0), { tilt: Math.PI / 2 });
  prism(s, 0.30, 0.30, 0.05, 0.09, 10, shade(1.20), { tilt: Math.PI / 2 });
  prism(s, 0.30, 0.30, -0.09, -0.05, 10, shade(0.86), { tilt: Math.PI / 2 });
  return bake(s);
}

function buildFlask() {
  const s = sink();
  prism(s, 0.34, 0.40, 0.00, 0.46, 8, shade(1.0));
  prism(s, 0.16, 0.14, 0.44, 0.68, 6, shade(0.88));
  prism(s, 0.22, 0.22, 0.66, 0.76, 6, shade(1.20));
  return bake(s);
}

function buildChest() {
  const s = sink();
  plate(s, 1.30, 0.92, 0.00, 0.62, shade(1.0));
  plate(s, 1.36, 0.98, 0.58, 0.74, shade(0.86));
  prism(s, 0.50, 0.50, 0.72, 0.94, 8, shade(1.12), { tilt: Math.PI / 2, rot: 0 });
  plate(s, 0.22, 1.02, 0.02, 0.80, shade(1.24));     // clasp band
  return bake(s);
}

function buildGate() {
  const s = sink();
  for (const sx of [-1, 1]) {
    plate(s, 0.42, 0.60, 0.00, 2.30, shade(0.92), { ox: sx * 1.35 });
    plate(s, 0.62, 0.78, 0.00, 0.26, shade(0.80), { ox: sx * 1.35 });
    plate(s, 0.58, 0.74, 2.20, 2.42, shade(1.10), { ox: sx * 1.35 });
  }
  plate(s, 3.20, 0.52, 2.34, 2.72, shade(1.04));
  plate(s, 2.40, 0.14, 0.30, 2.20, shade(1.22));      // the glowing page
  return bake(s);
}

function buildPlinth() {
  const s = sink();
  prism(s, 0.86, 0.78, 0.00, 0.28, 8, shade(0.84));
  prism(s, 0.66, 0.60, 0.24, 0.72, 8, shade(1.0));
  prism(s, 0.80, 0.74, 0.68, 0.82, 8, shade(1.16));
  return bake(s);
}

/** The floating challenge token. One shape per floor (the challenge type is a
 *  floor-level property), so this is exactly one extra draw call per level. */
function buildToken(shape) {
  const s = sink();
  switch (shape) {
    case 'wheel':
      prism(s, 0.52, 0.52, -0.08, 0.08, 8, shade(1.0), { tilt: Math.PI / 2 });
      for (let i = 0; i < 4; i++) {
        plate(s, 0.90, 0.10, -0.05, 0.05, shade(1.16), { rot: 0, tilt: Math.PI / 2 + (i / 4) * Math.PI });
      }
      break;
    case 'flame':
      prism(s, 0.34, 0.02, 0.00, 0.86, 6, shade(1.0));
      prism(s, 0.18, 0.02, 0.10, 0.62, 5, shade(1.26), { ox: 0.10 });
      break;
    case 'shard':
      prism(s, 0.32, 0.02, 0.00, 0.92, 4, shade(1.0));
      prism(s, 0.18, 0.02, -0.44, 0.10, 4, shade(0.86));
      break;
    case 'coin':
      prism(s, 0.46, 0.46, -0.07, 0.07, 10, shade(1.0), { tilt: Math.PI / 2 });
      prism(s, 0.28, 0.28, 0.06, 0.10, 10, shade(1.22), { tilt: Math.PI / 2 });
      break;
    case 'sheet':
      plate(s, 0.72, 0.05, 0.00, 0.92, shade(1.0));
      plate(s, 0.50, 0.07, 0.20, 0.30, shade(1.24));
      plate(s, 0.50, 0.07, 0.48, 0.58, shade(1.24));
      break;
    default:  // orb
      stamp(s, new THREE.IcosahedronGeometry(0.42, 0), trs(0, 0.42, 0), shade(1.0));
      stamp(s, new THREE.IcosahedronGeometry(0.22, 0), trs(0, 0.86, 0), shade(1.24));
      break;
  }
  return bake(s);
}

function buildFigure() {
  const s = sink();
  plate(s, 0.66, 0.44, 0.00, 0.86, shade(1.0));           // body
  plate(s, 0.78, 0.16, 0.10, 0.80, shade(0.88));          // cloak ply
  prism(s, 0.28, 0.26, 0.84, 1.20, 8, shade(1.16));       // head
  plate(s, 0.52, 0.18, 1.14, 1.30, shade(1.24));          // crest
  return bake(s);
}

function buildCage() {
  const s = sink();
  prism(s, 1.05, 1.00, 0.00, 0.18, 8, shade(0.82));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    plate(s, 0.11, 0.11, 0.14, 1.86, shade(1.0),
      { ox: Math.cos(a) * 0.86, oz: Math.sin(a) * 0.86 });
  }
  prism(s, 1.00, 0.60, 1.80, 2.14, 8, shade(1.14));
  return bake(s);
}

function buildMarker() {
  const s = sink();
  prism(s, 0.34, 0.30, 0.00, 0.16, 8, shade(0.84));
  plate(s, 0.16, 0.16, 0.12, 0.86, shade(1.0));
  prism(s, 0.16, 0.02, 0.84, 1.16, 5, shade(1.28));
  return bake(s);
}

function buildPlate() {
  const s = sink();
  prism(s, 0.98, 0.92, 0.00, 0.10, 10, shade(0.88));
  prism(s, 0.72, 0.68, 0.08, 0.17, 10, shade(1.16));
  return bake(s);
}

function buildFountain() {
  const s = sink();
  prism(s, 2.10, 1.95, 0.00, 0.30, 12, shade(0.84));
  prism(s, 1.80, 1.72, 0.26, 0.72, 12, shade(1.0));
  prism(s, 1.58, 1.55, 0.60, 0.68, 12, shade(1.22));   // the water disc
  prism(s, 0.46, 0.38, 0.66, 1.60, 8, shade(0.94));    // pillar
  prism(s, 0.86, 0.30, 1.54, 1.86, 8, shade(1.16));    // bowl
  return bake(s);
}

/** The boss dais. The one real Mesh on the floor, and the biggest silhouette:
 *  it is what the player should see from the entrance and walk toward. */
function buildBossDais() {
  const s = sink();
  prism(s, 5.20, 4.90, -0.60, 0.36, 12, shade(0.80));
  prism(s, 4.40, 4.20, 0.30, 0.74, 12, shade(0.96));
  prism(s, 3.50, 3.44, 0.68, 0.86, 12, shade(1.10));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    const h = 2.4 + (i % 3) * 0.7;
    prism(s, 0.44, 0.30, 0.80, 0.80 + h, 6, shade(0.90),
      { ox: Math.cos(a) * 4.05, oz: Math.sin(a) * 4.05, rot: a });
    prism(s, 0.56, 0.20, 0.80 + h, 1.30 + h, 6, shade(1.22),
      { ox: Math.cos(a) * 4.05, oz: Math.sin(a) * 4.05, rot: a });
  }
  return bake(s);
}

/** The way home. Same arch language as the hub's portals so it reads as an
 *  exit on sight. */
function buildExitArch() {
  const s = sink();
  prism(s, 2.60, 2.45, -0.40, 0.24, 12, shade(0.84));
  for (const sx of [-1, 1]) {
    plate(s, 0.56, 0.72, 0.18, 3.10, shade(0.96), { ox: sx * 1.75 });
    plate(s, 0.80, 0.94, 0.18, 0.52, shade(0.84), { ox: sx * 1.75 });
  }
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.12 + 0.19 * i);
    plate(s, 0.72, 0.66, 0.00, 0.40, shade(1.06),
      { ox: -Math.cos(a) * 1.95, rot: 0, tilt: 0 });
    // arc voussoirs, stacked by height rather than rotated into place
    plate(s, 0.60, 0.60, 3.02 + Math.sin(a) * 0.55, 3.34 + Math.sin(a) * 0.55, shade(1.14),
      { ox: -Math.cos(a) * 1.95 });
  }
  plate(s, 3.10, 0.16, 0.60, 3.05, shade(1.26));   // the page you step through
  return bake(s);
}

/** Ground scatter — one archetype per theme, six triangles each. */
function buildDetail(kind) {
  const s = sink();
  switch (kind) {
    case 'shell':
      prism(s, 0.26, 0.10, 0.00, 0.16, 6, shade(1.0), { tilt: 0.3 });
      prism(s, 0.14, 0.06, 0.00, 0.10, 5, shade(1.18), { ox: 0.24 });
      break;
    case 'crystal':
      prism(s, 0.13, 0.02, 0.00, 0.52, 4, shade(1.0));
      prism(s, 0.09, 0.02, 0.00, 0.30, 4, shade(1.20), { ox: 0.18, tilt: 0.3 });
      break;
    case 'ember':
      prism(s, 0.22, 0.14, 0.00, 0.12, 6, shade(0.9));
      prism(s, 0.10, 0.02, 0.08, 0.34, 5, shade(1.30));
      break;
    case 'page':
      plate(s, 0.44, 0.03, 0.00, 0.32, shade(1.0), { tilt: 0.22 });
      plate(s, 0.34, 0.03, 0.00, 0.22, shade(1.16), { ox: 0.16, rot: 0.7 });
      break;
    default:  // tuft
      for (let i = 0; i < 3; i++) {
        prism(s, 0.07, 0.01, 0.00, 0.34 + i * 0.09, 3, shade(0.94 + i * 0.10),
          { ox: (i - 1) * 0.16, tilt: (i - 1) * 0.24 });
      }
      break;
  }
  return bake(s);
}

// ═══════════════════════════════════════════════════════════════════════
// Liquid — the floor's water, lava, cloud-sea or void, cut the same way
// water.js cuts the ocean: layered plies of paper, teal-family shade, a foam
// rim that follows the real boundary. Waves are analytic in the vertex shader
// and re-read in the fragment through a varying, so there is not one
// derivative instruction anywhere (SwiftShader parity, per the tech law).
// ═══════════════════════════════════════════════════════════════════════

function patchLiquid(material, clock, xform, crestHex) {
  const crest = lin(crestHex);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLiqTime = clock;
    shader.uniforms.uXform = xform;
    shader.uniforms.uCrest = { value: new THREE.Vector3(crest[0], crest[1], crest[2]) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uLiqTime;
uniform float uXform;
attribute float aXform;
varying float vCrest;
varying float vXf;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float mwA = sin( transformed.x * 0.42 + uLiqTime * 0.90 )
            + sin( transformed.z * 0.31 - uLiqTime * 0.66 ) * 0.8
            + sin( ( transformed.x + transformed.z ) * 0.17 + uLiqTime * 0.41 ) * 1.1;
  transformed.y += mwA * ${g(0.075)};
  vCrest = clamp( mwA * 0.34 + 0.34, 0.0, 1.0 );
  vXf = aXform;
  transformed.y -= aXform * uXform * ${g(3.2)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uXform;
uniform vec3 uCrest;
varying float vCrest;
varying float vXf;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uCrest, vCrest * ${g(0.42)} );
  gl_FragColor.a *= 1.0 - vXf * uXform;`);
  };
  material.customProgramCacheKey = () => 'mw-level-liquid';
}

/** Grow-in patch for the transform ground: the bridge of flowers / thawed
 *  causeway rises out of the drained bed instead of popping into existence. */
function patchGrow(material, grow) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = grow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrow;\nvarying float vGrow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float mwG = clamp( uGrow, 0.0, 1.0 );
  transformed.y -= ( 1.0 - mwG ) * ${g(2.6)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGrow;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  gl_FragColor.a *= clamp( uGrow, 0.0, 1.0 );`);
  };
  material.customProgramCacheKey = () => 'mw-level-grow';
}

// ═══════════════════════════════════════════════════════════════════════
// buildLevel3D
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build one floor as a self-contained 3D place.
 *
 * @param {number} floorId 1..9
 * @param {object} [opts]
 * @param {boolean} [opts.castShadow=true] wall/object shadow casting
 * @param {number}  [opts.detailDensity=1] scales the ground scatter (quality tier)
 * @returns {{
 *   group: THREE.Group,
 *   colliders: Array<{id:string,kind:'circle',x:number,z:number,r:number,tag:?string}>,
 *   spawn: {x:number,y:number,z:number,yaw:number},
 *   objects: Array<{id:string,type:string,kind:string,x:number,z:number,y:number,
 *                   mesh:THREE.Object3D|null,radius:number,data:object,
 *                   tile:{x:number,y:number},hidden:boolean}>,
 *   bounds: {minX:number,maxX:number,minZ:number,maxZ:number,width:number,depth:number},
 *   theme: object, stats: object,
 *   sampleHeight:(x:number,z:number)=>number,
 *   sampleNormal:(x:number,z:number)=>number[],
 *   applyTransform:()=>{removed:string[]},
 *   revealSecret:()=>{removed:string[]},
 *   openGate:(id:string)=>{removed:string[]},
 *   update:(simTime:number, playerPos?:{x:number,z:number})=>void,
 *   dispose:()=>void }}
 */
export function buildLevel3D(floorId, opts = {}) {
  const { castShadow = true, detailDensity = 1 } = opts;

  const level = readLevel(floorId);
  const theme = themeForFloor(level.id);
  const dist = distanceField(level);
  const hf = heightField(level, dist);
  const { sampleHeight, sampleNormal } = makeHeightSampler(hf, level.width, level.height);

  const group = new THREE.Group();
  group.name = `level3d-${level.id}`;

  const geometries = [];
  const materials = [];
  const track = (geo) => { geometries.push(geo); return geo; };
  const trackMat = (m) => { materials.push(m); return m; };

  const liqClock = makeClock();
  const uXform = { value: 0 };
  const uGrow = { value: 0 };
  const uPulse = makeClock();

  let triangleCount = 0;
  const countTris = (geo, instances = 1) => {
    const n = geo.getAttribute('position').count / 3;
    triangleCount += n * instances;
    return geo;
  };

  // ── Shared surfaces ──────────────────────────────────────────────────
  const paperOpts = { grain: 0.16, normal: 0.14, roughnessLike: 0.24, scale: 1.6, triplanar: true, space: 'world' };

  const groundMat = trackMat(applyPapercut(
    toonMaterial(0xffffff, { vertexColors: true, flatShading: false }), paperOpts));
  const wallMat = trackMat(applyPapercut(
    toonMaterial(0xffffff, { vertexColors: true }), { ...paperOpts, scale: 1.25 }));
  const propMat = trackMat(applyPapercut(
    toonMaterial(0xffffff, { vertexColors: true }), { ...paperOpts, space: 'local', scale: 1.1 }));

  // ── GROUND ────────────────────────────────────────────────────────────
  // Every walkable tile, its raised path ribbons and the skirts that bury its
  // edges, in ONE merged geometry. Transform/secret tiles go to a second sink
  // so they can be grown in later without touching this one.
  const gs = sink();
  const xs = sink();
  const cw = hf.cw;
  const cornerAt = (i, j) => hf.cornerH[j * cw + i];
  const wx = (i) => (i - level.width / 2) * TILE_M;
  const wz = (j) => (j - level.height / 2) * TILE_M;

  const openSet = new Set();
  for (const t of groundTiles(level)) openSet.add(t.key);

  const groundPly = (tx, ty, ch) => {
    // Two-paper blend keyed to the same noise the shelf relief uses, plus an
    // accent speckle, so the ground has pigment density instead of a flat fill.
    const n = (Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
    const t = (n < 0 ? n + 1 : n);
    if (ch === 'P') return lin(theme.path, 0.98 + t * 0.08);
    if (ch === 'S') return lin(theme.special, 0.94 + t * 0.12);
    return t > 0.86 ? lin(theme.groundAccent, 0.96) : lin(theme.ground[t > 0.45 ? 0 : 1], 0.92 + t * 0.18);
  };

  for (const tile of groundTiles(level)) {
    const s = tile.transient ? xs : gs;
    const { tx, ty, ch } = tile;
    const lift = ch === 'P' ? PATH_LIFT : 0;
    const x0 = wx(tx), x1 = wx(tx + 1), z0 = wz(ty), z1 = wz(ty + 1);
    const h00 = cornerAt(tx, ty) + lift, h10 = cornerAt(tx + 1, ty) + lift;
    const h01 = cornerAt(tx, ty + 1) + lift, h11 = cornerAt(tx + 1, ty + 1) + lift;
    const c = groundPly(tx, ty, ch);
    const p00 = [x0, h00, z0], p10 = [x1, h10, z0], p01 = [x0, h01, z1], p11 = [x1, h11, z1];
    triN(s, p00, p01, p11, c);
    triN(s, p00, p11, p10, c);

    // A path ribbon needs a visible border or it disappears at distance.
    if (ch === 'P') {
      const rim = lin(theme.pathRim, 0.92);
      const edges = [[p00, p10], [p10, p11], [p11, p01], [p01, p00]];
      for (const [a, b] of edges) {
        const la = [a[0], a[1] - PATH_LIFT - 0.05, a[2]];
        const lb = [b[0], b[1] - PATH_LIFT - 0.05, b[2]];
        triN(s, a, la, lb, rim);
        triN(s, a, lb, b, rim);
      }
    }

    // Skirt every edge that faces something that is not ground, so no tile
    // floats above the basin or the wall footing beside it.
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nb) {
      const nk = (ty + dy) * level.width + (tx + dx);
      const inBounds = tx + dx >= 0 && ty + dy >= 0 && tx + dx < level.width && ty + dy < level.height;
      if (inBounds && openSet.has(nk)) continue;
      let a, b;
      if (dx === 1) { a = p10; b = p11; } else if (dx === -1) { a = p01; b = p00; }
      else if (dy === 1) { a = p11; b = p01; } else { a = p00; b = p10; }
      const la = [a[0], a[1] - SKIRT_DEPTH, a[2]];
      const lb = [b[0], b[1] - SKIRT_DEPTH, b[2]];
      const sc = lin(theme.ground[1], 0.66);
      triN(s, a, la, lb, sc);
      triN(s, a, lb, b, sc);
    }
  }

  const groundGeo = track(countTris(bake(gs)));
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.name = 'level-ground';
  groundMesh.receiveShadow = true;
  groundMesh.castShadow = false;
  groundMesh.matrixAutoUpdate = false;
  groundMesh.updateMatrix();
  group.add(groundMesh);

  // ── TRANSFORM GROUND ──────────────────────────────────────────────────
  let transformMesh = null;
  if (xs.pos.length) {
    const xgeo = track(countTris(bake(xs)));
    const xmat = trackMat(applyPapercut(
      toonMaterial(0xffffff, { vertexColors: true, transparent: true, opacity: 1 }), paperOpts));
    patchGrow(xmat, uGrow);
    applyPapercut(xmat, paperOpts);
    transformMesh = new THREE.Mesh(xgeo, xmat);
    transformMesh.name = 'level-transform';
    transformMesh.receiveShadow = true;
    transformMesh.castShadow = false;
    transformMesh.visible = false;
    transformMesh.matrixAutoUpdate = false;
    transformMesh.updateMatrix();
    group.add(transformMesh);
  }

  // ── WALLS ─────────────────────────────────────────────────────────────
  const walls = wallTiles(level, hf);
  const builder = WALL_BUILDERS[theme.wall] || buildHedge;
  const wallGeos = [0, 1, 2].map((v) => track(builder(v)));
  const buckets = [[], [], []];
  for (const w of walls) buckets[w.variant % 3].push(w);

  /** Retractable instances (transform / secret) keep their base transform so
   *  update() can recompose them without allocating. */
  const transientWalls = [];
  const wallMeshes = [];

  for (let v = 0; v < 3; v++) {
    const list = buckets[v];
    if (!list.length) continue;
    const geo = wallGeos[v];
    countTris(geo, list.length);
    const im = new THREE.InstancedMesh(geo, wallMat, list.length);
    im.name = `level-wall-${v}`;
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      _v3.set(w.x + w.ox, w.y, w.z + w.oz);
      _eu.set(0, w.yaw, 0);
      _q4.setFromEuler(_eu);
      _s3.set(w.sx, w.h, w.sx);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      // Hue jitter between two of the theme's three papers keeps a long run
      // from reading as one printed colour.
      const a = theme.wallPlies[0], b = theme.wallPlies[w.tint > 0.5 ? 1 : 2];
      _col.setHex(a, THREE.SRGBColorSpace).lerp(_col.clone().setHex(b, THREE.SRGBColorSpace), w.tint);
      im.setColorAt(i, _col);
      if (w.transient) transientWalls.push({ mesh: im, i, w });
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    wallMeshes.push(im);
    group.add(im);
  }
  _s3.set(1, 1, 1);

  // ── WALL CROWNS ───────────────────────────────────────────────────────
  let crownMesh = null;
  const crownGeo = buildCrown(theme.crown);
  if (crownGeo && walls.length) {
    track(crownGeo);
    // Every third wall wears a crown — a solid field of flowers reads as
    // wallpaper; a scattered one reads as a hedge that is actually growing.
    const crowned = walls.filter((w, i) => (i % 3) === (level.id % 3));
    if (crowned.length) {
      countTris(crownGeo, crowned.length);
      crownMesh = new THREE.InstancedMesh(crownGeo, wallMat, crowned.length);
      crownMesh.name = 'level-wall-crown';
      crownMesh.castShadow = false;
      crownMesh.receiveShadow = true;
      for (let i = 0; i < crowned.length; i++) {
        const w = crowned[i];
        _v3.set(w.x + w.ox, w.y + w.h, w.z + w.oz);
        _eu.set(0, w.yaw, 0);
        _q4.setFromEuler(_eu);
        _m4.compose(_v3, _q4, _s3);
        crownMesh.setMatrixAt(i, _m4);
        _col.setHex(theme.crownPapers[i % theme.crownPapers.length], THREE.SRGBColorSpace);
        crownMesh.setColorAt(i, _col);
      }
      crownMesh.instanceMatrix.needsUpdate = true;
      if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
      group.add(crownMesh);
    }
  }

  // ── LIQUID ────────────────────────────────────────────────────────────
  const liquids = liquidTiles(level);
  let liquidMesh = null, rimMesh = null;
  if (liquids.length) {
    const ls = sink(false);
    const xmark = [];
    const rs = sink();
    const surfaceOf = (tx, ty, transient) => {
      const base = hf.tileH[ty * level.width + tx];
      // A transform tile keeps its walkable height (the bridge under it is
      // already built), so its flood is a shallow film rather than a basin.
      return transient ? base + 0.35 : base + LIQUID_DROP - LIQUID_FREEBOARD;
    };
    for (const q of liquids) {
      const { tx, ty } = q;
      const y = surfaceOf(tx, ty, q.transient);
      const x0 = wx(tx), x1 = wx(tx + 1), z0 = wz(ty), z1 = wz(ty + 1);
      const p00 = [x0, y, z0], p10 = [x1, y, z0], p01 = [x0, y, z1], p11 = [x1, y, z1];
      const deep = q.boundary ? theme.liquid.shallow : theme.liquid.deep;
      const c = lin(deep, 0.98);
      const cm = lin(theme.liquid.mid, 1.0);
      triN(ls, p00, p01, p11, c, cm, c);
      triN(ls, p00, p11, p10, c, c, cm);
      const f = q.transient ? 1 : 0;
      for (let k = 0; k < 6; k++) xmark.push(f);

      // Foam rim: a thin band on every edge that touches land.
      if (q.boundary) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
          if (!openSet.has(ny * level.width + nx)) continue;
          let a, b;
          if (dx === 1) { a = p10; b = p11; } else if (dx === -1) { a = p01; b = p00; }
          else if (dy === 1) { a = p11; b = p01; } else { a = p00; b = p10; }
          const inset = 0.55;
          const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          const ux = (cx - mx), uz = (cz - mz);
          const ul = Math.hypot(ux, uz) || 1;
          const ia = [a[0] + (ux / ul) * inset, y + 0.035, a[2] + (uz / ul) * inset];
          const ib = [b[0] + (ux / ul) * inset, y + 0.035, b[2] + (uz / ul) * inset];
          const fa = [a[0], y + 0.035, a[2]], fb = [b[0], y + 0.035, b[2]];
          const fc = lin(theme.liquid.edge, 1.0);
          triN(rs, fa, ia, ib, fc);
          triN(rs, fa, ib, fb, fc);
        }
      }
    }

    const lgeo = track(countTris(bake(ls)));
    lgeo.setAttribute('aXform', new THREE.BufferAttribute(new Float32Array(xmark), 1));
    const lmat = trackMat(toonMaterial(0xffffff, {
      vertexColors: true, transparent: true, opacity: 0.93, depthWrite: true,
    }));
    patchLiquid(lmat, liqClock, uXform, theme.liquid.shallow);
    applyPapercut(lmat, { grain: 0.10, normal: 0.0, roughnessLike: 0.14, scale: 2.2, triplanar: false, space: 'world' });
    liquidMesh = new THREE.Mesh(lgeo, lmat);
    liquidMesh.name = 'level-liquid';
    liquidMesh.castShadow = false;
    liquidMesh.receiveShadow = false;
    liquidMesh.renderOrder = 1;
    liquidMesh.matrixAutoUpdate = false;
    liquidMesh.updateMatrix();
    group.add(liquidMesh);

    if (rs.pos.length) {
      const rgeo = track(countTris(bake(rs)));
      const rmat = trackMat(applyPapercut(
        toonMaterial(0xffffff, { vertexColors: true, transparent: true, opacity: 0.85 }),
        { grain: 0.14, normal: 0.0, roughnessLike: 0.10, scale: 2.0, triplanar: false, space: 'world' }));
      rimMesh = new THREE.Mesh(rgeo, rmat);
      rimMesh.name = 'level-liquid-rim';
      rimMesh.castShadow = false;
      rimMesh.receiveShadow = false;
      rimMesh.renderOrder = 2;
      rimMesh.matrixAutoUpdate = false;
      rimMesh.updateMatrix();
      group.add(rimMesh);
    }
  }

  // ── GROUND DETAIL SCATTER ─────────────────────────────────────────────
  let detailMesh = null;
  {
    const spots = [];
    const stride = Math.max(1, Math.round(3 / Math.max(0.15, detailDensity)));
    let n = 0;
    for (const t of groundTiles(level)) {
      if (t.ch !== 'F' || t.transient) continue;
      if ((n++ % stride) !== 0) continue;
      const c = tileCenter(t.tx, t.ty, level.width, level.height);
      const r0 = ((Math.sin(t.tx * 91.7 + t.ty * 47.3) * 9137.7) % 1 + 1) % 1;
      const r1 = ((Math.sin(t.tx * 13.1 + t.ty * 71.9) * 3271.3) % 1 + 1) % 1;
      const ox = (r0 - 0.5) * TILE_M * 0.7, oz = (r1 - 0.5) * TILE_M * 0.7;
      spots.push({ x: c.x + ox, z: c.z + oz, s: 0.75 + r0 * 0.7, yaw: r1 * TAU, t: r0 });
    }
    if (spots.length) {
      const dgeo = track(countTris(buildDetail(theme.detail), spots.length));
      detailMesh = new THREE.InstancedMesh(dgeo, propMat, spots.length);
      detailMesh.name = 'level-detail';
      detailMesh.castShadow = false;
      detailMesh.receiveShadow = true;
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i];
        _v3.set(sp.x, sampleHeight(sp.x, sp.z), sp.z);
        _eu.set(0, sp.yaw, 0);
        _q4.setFromEuler(_eu);
        _s3.set(sp.s, sp.s, sp.s);
        _m4.compose(_v3, _q4, _s3);
        detailMesh.setMatrixAt(i, _m4);
        _col.setHex(theme.groundAccent, THREE.SRGBColorSpace)
          .lerp(_col.clone().setHex(theme.ground[0], THREE.SRGBColorSpace), sp.t);
        detailMesh.setColorAt(i, _col);
      }
      _s3.set(1, 1, 1);
      detailMesh.instanceMatrix.needsUpdate = true;
      if (detailMesh.instanceColor) detailMesh.instanceColor.needsUpdate = true;
      group.add(detailMesh);
    }
  }

  // ── OBJECTS ───────────────────────────────────────────────────────────
  const specs = objectSpecs(level, sampleHeight);
  const challengeShape = specs.find((o) => o.kind === 'challenge')?.shape || 'orb';

  // One InstancedMesh per furniture family. Families are chosen so that the
  // whole floor — 26 to 51 objects — costs a fixed ~11 draw calls.
  const FAMILY = {
    coin: { geo: buildCoin, kinds: ['coin'], paper: () => PAPER.gold, yaw: true },
    flask: { geo: buildFlask, kinds: ['flask'], paper: () => PAPER.rose },
    chest: { geo: buildChest, kinds: ['chest', 'golden'], paper: (o) => (o.kind === 'golden' ? PAPER.gold : PAPER.orange) },
    gate: { geo: buildGate, kinds: ['gate'], paper: () => theme.wallPlies[1] },
    plinth: { geo: buildPlinth, kinds: ['challenge', 'statue', 'marker', 'plate'], paper: () => theme.ground[0] },
    token: { geo: () => buildToken(challengeShape), kinds: ['challenge'], paper: () => theme.special, float: true },
    figure: { geo: buildFigure, kinds: ['statue', 'cage'], paper: (o) => (o.kind === 'cage' ? PAPER.tealL : theme.wallPlies[2]) },
    cage: { geo: buildCage, kinds: ['cage'], paper: () => theme.wallPlies[0] },
    marker: { geo: buildMarker, kinds: ['marker'], paper: () => theme.special },
    plate: { geo: buildPlate, kinds: ['plate'], paper: () => theme.pathRim },
    fountain: { geo: buildFountain, kinds: ['fountain'], paper: () => PAPER.tealL },
    boss: { geo: buildBossDais, kinds: ['boss'], paper: () => theme.wallPlies[0] },
    exit: { geo: buildExitArch, kinds: ['exit'], paper: () => PAPER.cream },
  };

  const famMeshes = {};
  const famRows = {};
  const objectMeshOwners = new Map();   // spec.id -> [{mesh, i}]

  for (const [name, fam] of Object.entries(FAMILY)) {
    const rows = specs.filter((o) => fam.kinds.includes(o.kind));
    if (!rows.length) continue;
    const geo = track(countTris(fam.geo(), rows.length));
    const im = new THREE.InstancedMesh(geo, propMat, rows.length);
    im.name = `level-obj-${name}`;
    im.castShadow = castShadow && name !== 'plate';
    im.receiveShadow = true;
    famMeshes[name] = im;
    famRows[name] = rows;
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      const lift = fam.float ? 1.25 : 0;
      const plinthLift = (name === 'token') ? 0.82 : 0;
      _v3.set(o.x, o.y + lift + plinthLift, o.z);
      _eu.set(0, ((o.tile.x * 7 + o.tile.y * 13) % 8) / 8 * TAU, 0);
      _q4.setFromEuler(_eu);
      const sc = o.kind === 'golden' ? 1.25 : 1;
      _s3.set(sc, sc, sc);
      _m4.compose(_v3, _q4, _s3);
      im.setMatrixAt(i, _m4);
      _col.setHex(fam.paper(o), THREE.SRGBColorSpace);
      im.setColorAt(i, _col);
      const list = objectMeshOwners.get(o.id) || [];
      list.push({ mesh: im, i, name, base: { x: _v3.x, y: _v3.y, z: _v3.z }, yaw: _eu.y, sc });
      objectMeshOwners.set(o.id, list);
    }
    _s3.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }

  // ── AURAS ─────────────────────────────────────────────────────────────
  // A soft in-palette disc under every interactable. This is the single
  // cheapest legibility win for a 5-year-old: "the glowing circle is a thing".
  const auraKinds = new Set(['challenge', 'chest', 'golden', 'coin', 'flask', 'fountain', 'gate', 'cage', 'exit', 'boss']);
  const auraRows = specs.filter((o) => auraKinds.has(o.kind));
  let auraMesh = null;
  if (auraRows.length) {
    const ageo = track(countTris(auraDiscGeo(1.0, 18), auraRows.length));
    const amat = trackMat(new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      alphaMap: deckleDisc(), blending: THREE.NormalBlending, fog: true,
      side: THREE.DoubleSide, opacity: 0.5,
    }));
    auraMesh = new THREE.InstancedMesh(ageo, amat, auraRows.length);
    auraMesh.name = 'level-aura';
    auraMesh.renderOrder = 3;
    for (let i = 0; i < auraRows.length; i++) {
      const o = auraRows[i];
      const r = o.radius * 1.05;
      _v3.set(o.x, o.y + 0.06, o.z);
      _q4.identity();
      _s3.set(r, 1, r);
      _m4.compose(_v3, _q4, _s3);
      auraMesh.setMatrixAt(i, _m4);
      _col.setHex(o.kind === 'boss' ? theme.special : theme.liquid.shallow, THREE.SRGBColorSpace);
      auraMesh.setColorAt(i, _col);
      const list = objectMeshOwners.get(o.id) || [];
      list.push({ mesh: auraMesh, i, name: 'aura', base: { x: _v3.x, y: _v3.y, z: _v3.z }, yaw: 0, sc: r });
      objectMeshOwners.set(o.id, list);
    }
    _s3.set(1, 1, 1);
    auraMesh.instanceMatrix.needsUpdate = true;
    if (auraMesh.instanceColor) auraMesh.instanceColor.needsUpdate = true;
    group.add(auraMesh);
  }

  // ── Object handles ────────────────────────────────────────────────────
  // `mesh` is null for encounters — an earlier design decision says monsters
  // stay UNSEEN until you walk into them, so an encounter is a trigger volume
  // and nothing else. Everything else gets a handle whose `visible` setter
  // really hides the backing instance rows.
  const objects = specs.map((spec) => {
    const owners = objectMeshOwners.get(spec.id);
    let mesh = null;
    if (owners && owners.length) {
      mesh = makeHandle(spec.x, spec.y, spec.z, (vis) => {
        for (const o of owners) {
          if (vis) {
            _v3.set(o.base.x, o.base.y, o.base.z);
            _eu.set(0, o.yaw, 0);
            _q4.setFromEuler(_eu);
            _s3.set(o.name === 'aura' ? o.sc : o.sc, o.name === 'aura' ? 1 : o.sc, o.sc);
            _m4.compose(_v3, _q4, _s3);
          } else {
            _m4.makeScale(0, 0, 0);
          }
          o.mesh.setMatrixAt(o.i, _m4);
          o.mesh.instanceMatrix.needsUpdate = true;
        }
        _s3.set(1, 1, 1);
      });
    }
    return {
      id: spec.id, type: spec.type, kind: spec.kind, tile: spec.tile,
      x: spec.x, y: spec.y, z: spec.z, radius: spec.radius,
      mesh, data: spec.data, hidden: spec.hidden,
    };
  });
  // Secret rewards start concealed.
  for (const o of objects) if (o.hidden && o.mesh) o.mesh.visible = false;

  // ── Colliders ─────────────────────────────────────────────────────────
  const colliders = levelColliders(level);

  // ── Animation state ───────────────────────────────────────────────────
  const bobbers = objects
    .filter((o) => o.kind === 'coin' || o.kind === 'flask' || o.kind === 'challenge')
    .map((o) => {
      const owners = (objectMeshOwners.get(o.id) || []).filter((w) => w.name === 'coin' || w.name === 'flask' || w.name === 'token');
      return { o, owners, phase: ((o.tile.x * 3 + o.tile.y * 5) % 17) / 17 * TAU };
    })
    .filter((b) => b.owners.length);

  let transformT = -1;      // <0 idle, else seconds elapsed
  let transformDone = false;
  let revealT = -1;
  let revealDone = false;
  const openGates = new Set();
  const gateAnims = [];

  function retractIds(tag) {
    const out = [];
    for (const c of colliders) if (c.tag === tag) out.push(c.id);
    return out;
  }

  /**
   * The payoff. The floor's `transform.tiles` become real: the flood drains
   * (or the wall folds away) and the bridge grows out of the bed beneath it.
   * Returns the collider ids the integrator must remove from its collision
   * world — the level does not own that world, so it cannot remove them itself.
   */
  function applyTransform() {
    if (transformDone) return { removed: [] };
    transformDone = true;
    transformT = 0;
    if (transformMesh) transformMesh.visible = true;
    return { removed: retractIds('transform') };
  }

  /** The hidden garden / star vault / smuggler's cache opens. */
  function revealSecret() {
    if (revealDone) return { removed: [] };
    revealDone = true;
    revealT = 0;
    for (const o of objects) if (o.hidden && o.mesh) o.mesh.visible = true;
    return { removed: retractIds('secret') };
  }

  /** A math door has been answered. Swings its page open and unbars the tile. */
  function openGate(id) {
    const tag = `gate:${id}`;
    if (openGates.has(tag)) return { removed: [] };
    openGates.add(tag);
    for (const o of objects) {
      if (o.kind !== 'gate') continue;
      const oid = o.data.id ?? `${o.tile.x}-${o.tile.y}`;
      if (oid !== id) continue;
      const owners = (objectMeshOwners.get(o.id) || []).filter((w) => w.name === 'gate');
      if (owners.length) gateAnims.push({ owners, t: 0 });
    }
    return { removed: retractIds(tag) };
  }

  // ── update ────────────────────────────────────────────────────────────
  // Zero allocation. Everything below writes into the module-scope scratch.
  function update(simTime, playerPos) {
    liqClock.value = simTime;
    uPulse.value = simTime;

    if (transformT >= 0) {
      transformT = Math.min(TRANSFORM_SECS, transformT + 1 / 60);
      const t = transformT / TRANSFORM_SECS;
      const e = t * t * (3 - 2 * t);
      uXform.value = e;
      uGrow.value = e;
      if (transformT >= TRANSFORM_SECS) transformT = -1;
    }
    if (revealT >= 0) {
      revealT = Math.min(REVEAL_SECS, revealT + 1 / 60);
      const t = revealT / REVEAL_SECS;
      for (const a of transientWalls) {
        if (a.w.transient !== 'secret') continue;
        const k = Math.max(0.001, 1 - t);
        _v3.set(a.w.x + a.w.ox, a.w.y - (1 - k) * 0.6, a.w.z + a.w.oz);
        _eu.set(0, a.w.yaw, 0);
        _q4.setFromEuler(_eu);
        _s3.set(a.w.sx, a.w.h * k, a.w.sx);
        _m4.compose(_v3, _q4, _s3);
        a.mesh.setMatrixAt(a.i, _m4);
        a.mesh.instanceMatrix.needsUpdate = true;
      }
      _s3.set(1, 1, 1);
      if (revealT >= REVEAL_SECS) revealT = -1;
    }
    if (transformDone && uXform.value < 1) {
      for (const a of transientWalls) {
        if (a.w.transient !== 'transform') continue;
        const k = Math.max(0.001, 1 - uXform.value);
        _v3.set(a.w.x + a.w.ox, a.w.y - (1 - k) * 0.6, a.w.z + a.w.oz);
        _eu.set(0, a.w.yaw, 0);
        _q4.setFromEuler(_eu);
        _s3.set(a.w.sx, a.w.h * k, a.w.sx);
        _m4.compose(_v3, _q4, _s3);
        a.mesh.setMatrixAt(a.i, _m4);
        a.mesh.instanceMatrix.needsUpdate = true;
      }
      _s3.set(1, 1, 1);
    }

    for (let gi = gateAnims.length - 1; gi >= 0; gi--) {
      const ga = gateAnims[gi];
      ga.t = Math.min(1, ga.t + 1 / 45);
      for (const o of ga.owners) {
        _v3.set(o.base.x, o.base.y, o.base.z);
        _eu.set(0, o.yaw + ga.t * 1.15, 0);
        _q4.setFromEuler(_eu);
        _s3.set(o.sc, o.sc * (1 - ga.t * 0.06), o.sc);
        _m4.compose(_v3, _q4, _s3);
        o.mesh.setMatrixAt(o.i, _m4);
        o.mesh.instanceMatrix.needsUpdate = true;
      }
      if (ga.t >= 1) gateAnims.splice(gi, 1);
    }
    _s3.set(1, 1, 1);

    const px = playerPos ? (playerPos.x ?? 0) : 0;
    const pz = playerPos ? (playerPos.z ?? 0) : 0;
    for (let i = 0; i < bobbers.length; i++) {
      const b = bobbers[i];
      if (b.o.mesh && !b.o.mesh.visible) continue;
      const dx = b.o.x - px, dz = b.o.z - pz;
      if (dx * dx + dz * dz > ANIM_RANGE2) continue;
      const bob = Math.sin(simTime * 1.7 + b.phase) * (b.o.kind === 'challenge' ? 0.22 : 0.15);
      for (const w of b.owners) {
        _v3.set(w.base.x, w.base.y + bob, w.base.z);
        if (b.o.kind === 'flask') {
          _eu.set(0, w.yaw + Math.sin(simTime * 0.8 + b.phase) * 0.45, 0);
          _q4.setFromEuler(_eu);
        } else {
          _q4.setFromAxisAngle(AXIS_Y, simTime * (b.o.kind === 'challenge' ? 0.9 : 1.6) + b.phase);
        }
        _s3.set(w.sc, w.sc, w.sc);
        _m4.compose(_v3, _q4, _s3);
        w.mesh.setMatrixAt(w.i, _m4);
        w.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    _s3.set(1, 1, 1);
    _v3b.set(0, 0, 0);
  }

  // ── stats ─────────────────────────────────────────────────────────────
  const colourCalls = group.children.length;
  const shadowCalls = castShadow ? (wallMeshes.length + Object.keys(famMeshes).length) : 0;
  const stats = {
    floorId: level.id,
    theme: theme.key,
    tiles: level.width * level.height,
    metres: `${level.width * TILE_M}x${level.height * TILE_M}`,
    wallInstances: walls.length,
    liquidTiles: liquids.length,
    objects: objects.length,
    colliders: colliders.length,
    triangleCount,
    drawCalls: colourCalls + shadowCalls,
    colorPassCalls: colourCalls,
    shadowPassCalls: shadowCalls,
    materials: materials.length,
    terraceHeight: hf.maxH - hf.minH,
  };

  function dispose() {
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    group.clear();
    objects.length = 0;
    colliders.length = 0;
    bobbers.length = 0;
    transientWalls.length = 0;
    gateAnims.length = 0;
  }

  return {
    group,
    colliders,
    spawn: levelSpawn(level, sampleHeight),
    objects,
    bounds: levelBounds(level),
    theme,
    stats,
    level,
    sampleHeight,
    sampleNormal,
    applyTransform,
    revealSecret,
    openGate,
    update,
    dispose,
  };
}
