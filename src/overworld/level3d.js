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
 * Six things separate a place from a floor plan, and each costs almost
 * nothing:
 *
 *   TERRACES     the ground climbs in bands as you walk in, so the level has
 *                foreground/midground/background instead of one plane. The
 *                boss sits on the highest of them, and the ENTRANCE sits on a
 *                plateau of its own, so the opening shot looks DOWN across a
 *                step instead of out across the flattest ground in the build.
 *   LANDMARKS    one 14-18 m structure at the objective end plus up to three
 *                6-9 m masts, hosted on wall tiles so they cost no collider
 *                and no draw call. Odyssey and TotK both navigate by
 *                silhouette — you see the thing, you walk to the thing — and
 *                a floor whose tallest object is the same height as every
 *                other object has no "over there" in it at all.
 *   SILHOUETTE   a wall run is never one extruded ribbon. Every tile is a
 *                STACK of cut-paper plies of different size, hue and yaw with
 *                teal shadow slivers between them, wearing a crown that breaks
 *                the skyline (lobes, broken merlons, faceted spikes, uneven
 *                book rows) and caps at every end and corner. Roughly one
 *                straight tile in four drops to a planter you can see over,
 *                and no two neighbours share a top edge, a yaw or a seam
 *                altitude. Nine floors, nine vocabularies — see
 *                level3dBuild.wallProfile.
 *   ENCLOSURE    the outermost ring of wall stands 4.8-6.4 m on a plinth of
 *                stepped courses, so a floor reads as a place with a top edge
 *                rather than as furniture on an endless lawn. It fades back
 *                down within four tiles of the spawn — the establishing shot
 *                must not open on a six-metre wall in the player's face.
 *   VALUE        wall stacks cross paper families and reach a genuinely light
 *                crown (2.6-4.8x base luma once the baked face tone is in),
 *                because a solid whose top is no lighter than its side is a
 *                flat shape however many plies it has.
 *   MATERIAL     everything is layered plies of PAPER stock with teal-tinted
 *                shade — the same toon ramp and the same procedural fibre the
 *                hub island uses, so walking through a portal is a change of
 *                place, not a change of engine. Nothing is ever darker than
 *                PAPER.shadow; that is clamped in the albedo, before light.
 *
 * ── PERFORMANCE: WHERE THE DRAW CALLS GO ───────────────────────────────────
 * A floor is up to 42x36 tiles. Naively that is 1500 meshes. Instead:
 *
 *   ground      ONE welded, vertex-coloured lattice for the whole walkable
 *               region — heights, paver ribbons, colour field and boundary
 *               skirts all in a single geometry with no interior edges at all.
 *               10-44 k triangles depending on the floor. 1 call.
 *   walls       one MERGED geometry per 12x12 tile chunk (5-13 chunks on a
 *               real floor), because instancing can only repeat one hedge and
 *               the art direction forbids exactly that. Interior walls — the
 *               ones buried in other walls — are culled entirely; on Crystal
 *               Caverns that is 831 tiles down to ~250.
 *   landmarks   0 calls. They stand on wall tiles, so their pieces merge into
 *               the chunk that tile already belongs to.
 *   liquid      2 calls: the animated sheet and its foam rim.
 *   detail      one InstancedMesh per scatter archetype — 3 or 4 calls for
 *               the ~1300 tufts, pebbles, petals and pages that dress a floor.
 *   objects     one InstancedMesh per furniture family, ~11 calls for the
 *               whole floor regardless of how many objects it holds.
 *   transform   1 call, hidden until the payoff.
 *
 * Measured in the renderer (SwiftShader harness, camera in play): floor 1 is
 * 25 draw calls / 42 k tris, floor 4 is 33 / 127 k, floor 8 is 30 / 120 k.
 * Worst case over all nine floors is 58 calls / 184 k triangles counted at
 * build time, before any culling. Budget is 250 calls / 500 k tris shared
 * across the whole frame, so a level costs about 23% of the calls and 37% of
 * the tris — and while a level is loaded the hub's terrain and vegetation are
 * not. `level3dBuild.architecture.test.js` asserts both ceilings.
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
  wallTiles, wallProfile, liquidTiles, groundTiles, levelColliders, objectSpecs,
  levelSpawn, levelBounds, themeForFloor,
  buildGroundSurface, groundScatter,
  landmarkSpecs, landmarkProfile, paperLinear,
} from './level3dBuild.js';

const TAU = Math.PI * 2;

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
// Walls — merged cut paper, not instanced boxes
//
// The vocabulary itself (which plies, which crown, where the caps go) lives in
// level3dBuild.wallProfile, which is pure data. All that is left here is
// turning a tile's piece list into triangles.
//
// WHY MERGED AND NOT INSTANCED: an InstancedMesh can only repeat ONE geometry,
// so every hedge on the floor has to be the same hedge — which is exactly the
// "one extruded ribbon" the art direction forbids. Merging per chunk buys
// genuinely per-tile silhouettes (different lobe count, different broken
// merlon, different book heights) and per-vertex papers, and still costs only
// one draw call per chunk.
// ═══════════════════════════════════════════════════════════════════════

/** Tiles per merged wall chunk. 12 keeps the largest floor (42x36) at twelve
 *  chunks — twelve colour plus twelve shadow draws for every wall on the
 *  floor — while still leaving the frustum something to reject. */
const WALL_CHUNK = 12;

/**
 * FACE TONE — the fix for "the hedge top is darker than the hedge front".
 *
 * Measured on the build this replaces: a hedge's sun-facing crown came out at
 * L=55 and its shaded front face at L=59. A ratio of 0.93, where Odyssey's
 * Steam Gardens hedge runs about 2.0 the other way — and that ratio is the
 * entire reason its hedges read as volumes instead of as dark shapes.
 *
 * The cause is architectural, not a bad number: the toon ramp only knows the
 * SUN direction, and at the elevations this world's key light runs at, NdotL
 * on a hedge crown and on its south face are within a few per cent. So form
 * cannot come from the ramp. It has to be baked, and baking it is what layered
 * cut paper means anyway — the cut edge facing the sky is the pale side of the
 * sheet, at every hour of the day, which a sun-driven term can never be.
 *
 * +Y faces lift 28%, -Y faces drop 20%, sides unchanged, interpolated by ny so
 * a tapered prism's raked flank grades between them instead of banding. The
 * result is clamped to PAPER.shadow at stamp time (see `stampWallPieces`), so
 * the downward faces cannot slide past the palette's floor into black.
 */
const FACE_LIFT = 0.28;
const FACE_DROP = 0.20;
function faceTone(nx, ny, nz) {
  return ny >= 0 ? 1 + FACE_LIFT * ny : 1 - FACE_DROP * (-ny);
}

/**
 * The albedo floor for wall pieces, PRE-tone.
 *
 * PAPER.shadow is the deepest colour this world owns; nothing may go past it.
 * The floor is divided by the steepest darkening `faceTone` can apply, so a
 * fully downward face on an already-floored ply lands EXACTLY on PAPER.shadow
 * rather than 20% under it. That makes the palette law a property of the
 * arithmetic instead of a hope about which faces end up visible.
 */
const SHADOW_LIN = paperLinear(PAPER.shadow);
const SHADOW_FLOOR = SHADOW_LIN.map((v) => v / (1 - FACE_DROP));

/**
 * Stamp one tile's piece list into a merged sink, in world space.
 *
 * Pieces arrive in TILE-LOCAL metres; the tile contributes its world centre,
 * its ground height and a yaw. The yaw rotates the piece OFFSETS as well as
 * each piece's own rotation, so a crown lobe stays over the ply it grew out of.
 */
function stampWallPieces(s, w, pieces) {
  const cy = Math.cos(w.yaw), sy = Math.sin(w.yaw);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const lx = p.ox + (w.ox || 0), lz = p.oz + (w.oz || 0);
    const px = w.x + lx * cy + lz * sy;
    const pz = w.z - lx * sy + lz * cy;
    const hgt = Math.max(0.02, p.y1 - p.y0);
    const m = trs(px, w.y + (p.y0 + p.y1) / 2, pz, p.tilt, w.yaw + p.rot, 0);
    const c = lin(p.hex, p.tone);
    // Clamp the ALBEDO to the palette floor before any light touches it, the
    // same way the ground surface does. The ply seams used to land on #0e3423
    // — 10% luma — and then get multiplied again by the ramp's shade texel,
    // which is how a papercut world ended up with black slots cut into it.
    const rgb = [
      Math.max(c[0], SHADOW_FLOOR[0]),
      Math.max(c[1], SHADOW_FLOOR[1]),
      Math.max(c[2], SHADOW_FLOOR[2]),
    ];
    if (p.shape === 'box') stamp(s, new THREE.BoxGeometry(p.w, hgt, p.d), m, rgb, 1, faceTone);
    else stamp(s, new THREE.CylinderGeometry(p.r1, p.r0, hgt, p.seg, 1, false), m, rgb, 1, faceTone);
  }
}

/**
 * Retraction for the wall chunks a transform or a secret opens.
 *
 * A merged chunk cannot be scaled per tile the way an instance could, so each
 * vertex carries the ground height of the tile it belongs to (`aBaseY`) and
 * the whole chunk folds down into its own footing as the uniform runs 0 -> 1.
 * Chains onto any patch already installed, so applyPapercut may be applied
 * before OR after this.
 */
function patchWallSink(material, uSink) {
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.transparent = true;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    shader.uniforms.uSink = uSink;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSink;\nattribute float aBaseY;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float mwS = clamp( uSink, 0.0, 1.0 );
  transformed.y = mix( transformed.y, aBaseY - ${g(0.25)}, mwS );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSink;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  gl_FragColor.a *= 1.0 - clamp( uSink, 0.0, 1.0 );`);
  };
  material.customProgramCacheKey = () => {
    const prev = prevKey ? prevKey.call(material) : '';
    return `${prev}|mw-wall-sink`;
  };
  material.needsUpdate = true;
  return material;
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

/**
 * A fan of single-triangle blades — copied vertex for vertex from
 * vegetation.buildBladeTuft, which is what the island's ground cover is made
 * of. Using the island's own primitive here is the point: a floor and the
 * island have to look cut from the same stock, and a triangle whose root ply
 * is dark and whose tip runs over 1.0 is the whole papercut blade in one
 * primitive. It also costs ONE triangle per blade, against thirty-six for the
 * stack of prisms this replaced, which is what makes a thousand of them free.
 */
function bladeFan(s, { blades, h, hVar, w, lean, phase = 0.55, tip = shade(1.10) }) {
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * TAU + phase;
    const ln = lean * (0.68 + (k % 3) * 0.24);
    const hh = h * (1 + ((k % 3) - 1) * hVar);
    const dx = Math.sin(a), dz = Math.cos(a);
    const inv = 1 / Math.hypot(dx * 0.42, 0.9, dz * 0.42);
    tri(s,
      [-dz * w, 0, dx * w],
      [dz * w, 0, -dx * w],
      [dx * ln, hh, dz * ln],
      [dx * 0.42 * inv, 0.9 * inv, dz * 0.42 * inv],
      shade(0.56), shade(0.56), tip);
  }
}

/**
 * One ground-scatter archetype.
 *
 * The three added below (pebble, petal, leaf) are what the floors were missing
 * against the island: a scatter of ONE shape reads as wallpaper no matter how
 * well it is placed, and it takes a tall thing, a ground-hugging thing and a
 * hard thing before ground stops looking swept. The soft ones are blade fans
 * at three different heights and reaches — 0.6 m grass, a 0.12 m leaf lying
 * almost flat, a 0.05 m petal — so the dressing has an interior instead of one
 * horizon, which is the same note vegetation.js records about the island.
 */
function buildDetail(kind) {
  const s = sink();
  switch (kind) {
    case 'pebble':
      // The one hard archetype: a solid, so it holds a lit face and a shaded
      // one instead of reading as another blade.
      prism(s, 0.19, 0.15, 0.00, 0.10, 5, shade(0.90), { tilt: 0.05 });
      prism(s, 0.12, 0.09, 0.08, 0.14, 5, shade(1.14));
      break;
    case 'petal':
      bladeFan(s, { blades: 4, h: 0.055, hVar: 0.4, w: 0.055, lean: 0.10, phase: 0.9, tip: shade(1.30) });
      break;
    case 'leaf':
      bladeFan(s, { blades: 3, h: 0.13, hVar: 0.3, w: 0.11, lean: 0.26, phase: 0.2, tip: shade(1.22) });
      break;
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
    default:  // tuft — the tall tier, at the island's own grass height
      bladeFan(s, { blades: 7, h: 0.58, hVar: 0.26, w: 0.048, lean: 0.20 });
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
  // CHAIN, never assign. toonMaterial() has already installed the aerial-fog
  // and teal-shadow-floor patches on this material; overwriting the hook drops
  // both and leaves the floor's water as the one surface in the place with a
  // different atmosphere and a different shadow.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
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
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|mw-level-liquid`;
}

/** Grow-in patch for the transform ground: the bridge of flowers / thawed
 *  causeway rises out of the drained bed instead of popping into existence. */
function patchGrow(material, grow) {
  // Chains, for the same reason patchLiquid does.
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
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
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|mw-level-grow`;
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
  // ONE welded, vertex-coloured surface for the whole walkable region — see
  // the long note over `buildGroundSurface` in ./level3dBuild.js for why it is
  // a shared lattice and not a quad per tile. Nothing is decided here: the
  // heights, the colour field, the paver ribbon and the boundary skirts all
  // arrive as finished Float32Arrays, and this file only wraps them in a
  // BufferGeometry. Transform/secret ground comes back as its own array so it
  // can still be grown in later.
  const surf = buildGroundSurface(level, hf, theme);

  const wx = (i) => (i - level.width / 2) * TILE_M;
  const wz = (j) => (j - level.height / 2) * TILE_M;

  const openSet = new Set();
  for (const t of groundTiles(level)) openSet.add(t.key);

  const surfaceGeo = (a) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  };

  const groundGeo = track(countTris(surfaceGeo(surf.solid)));
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.name = 'level-ground';
  groundMesh.receiveShadow = true;
  groundMesh.castShadow = false;
  groundMesh.matrixAutoUpdate = false;
  groundMesh.updateMatrix();
  group.add(groundMesh);

  // ── TRANSFORM GROUND ──────────────────────────────────────────────────
  let transformMesh = null;
  if (surf.transient) {
    const xgeo = track(countTris(surfaceGeo(surf.transient)));
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
  // One merged geometry per WALL_CHUNK x WALL_CHUNK block of tiles. Tiles that
  // a transform or a secret opens later go to their own merged mesh instead,
  // so exactly those can fold away without touching the static chunks.
  const walls = wallTiles(level, hf);
  const wallMeshes = [];
  const wallChunks = new Map();
  const transientChunks = new Map();
  const uSinkX = { value: 0 };
  const uSinkS = { value: 0 };
  let wallPieces = 0;

  for (const w of walls) {
    const pieces = wallProfile(w, theme);
    wallPieces += pieces.length;
    if (w.transient) {
      let rec = transientChunks.get(w.transient);
      if (!rec) { rec = { s: sink(), baseY: [] }; transientChunks.set(w.transient, rec); }
      const before = rec.s.pos.length / 3;
      stampWallPieces(rec.s, w, pieces);
      for (let v = before; v < rec.s.pos.length / 3; v++) rec.baseY.push(w.y);
    } else {
      const ck = `${Math.floor(w.tx / WALL_CHUNK)}-${Math.floor(w.ty / WALL_CHUNK)}`;
      let cs = wallChunks.get(ck);
      if (!cs) { cs = sink(); wallChunks.set(ck, cs); }
      stampWallPieces(cs, w, pieces);
    }
  }

  // ── LANDMARKS ─────────────────────────────────────────────────────────
  // One 13-17 m hero structure at the objective end plus up to three 6-9 m
  // masts spread across the floor. They are hosted on wall tiles that already
  // have colliders (see level3dBuild.landmarkSpecs), and their pieces are
  // merged into the wall chunk that tile already belongs to — so the tallest
  // thing on the floor costs zero extra draw calls and zero gameplay surface.
  //
  // This is the fix for the flattest defect in the build: nothing in any floor
  // was taller than 2.9 m, so every horizon was a straight line and there was
  // nothing to walk toward.
  const landmarks = landmarkSpecs(level, hf, theme, dist);
  let landmarkPieces = 0;
  for (const lm of landmarks) {
    const pieces = landmarkProfile(lm, theme);
    landmarkPieces += pieces.length;
    const ck = `${Math.floor(lm.tx / WALL_CHUNK)}-${Math.floor(lm.ty / WALL_CHUNK)}`;
    let cs = wallChunks.get(ck);
    if (!cs) { cs = sink(); wallChunks.set(ck, cs); }
    stampWallPieces(cs, { x: lm.x, z: lm.z, y: lm.y, yaw: 0, ox: 0, oz: 0 }, pieces);
  }

  for (const [ck, cs] of wallChunks) {
    if (!cs.pos.length) continue;
    const geo = track(countTris(bake(cs)));
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.name = `level-wall-${ck}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    wallMeshes.push(mesh);
    group.add(mesh);
  }

  /** { kind, mesh } for the runtime to fold away on its cue. */
  const transientWalls = [];
  for (const [kind, rec] of transientChunks) {
    if (!rec.s.pos.length) continue;
    const geo = track(countTris(bake(rec.s)));
    geo.setAttribute('aBaseY', new THREE.BufferAttribute(new Float32Array(rec.baseY), 1));
    const mat = trackMat(toonMaterial(0xffffff, { vertexColors: true }));
    patchWallSink(mat, kind === 'transform' ? uSinkX : uSinkS);
    applyPapercut(mat, { ...paperOpts, scale: 1.25 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `level-wall-${kind}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    transientWalls.push({ kind, mesh });
    wallMeshes.push(mesh);
    group.add(mesh);
  }

  function hideTransientWalls(kind) {
    for (const t of transientWalls) if (t.kind === kind) t.mesh.visible = false;
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
  // Three or four archetypes per floor — grass tufts, pebbles, petals, fallen
  // leaves or pages — clumped on noise, thickened along the verge of the paver
  // ribbon and kept off the ribbon itself. Placement is decided in
  // level3dBuild.groundScatter (pure, deterministic); all this loop does is
  // pack each archetype into one InstancedMesh, so the whole dressing of a
  // floor costs three or four draw calls no matter how many pieces it holds.
  const detailMeshes = [];
  {
    const scatter = groundScatter(level, hf, theme, sampleHeight, {
      density: Math.max(0.15, detailDensity),
      cap: Math.round(1300 * Math.max(0.15, detailDensity)),
    });
    const byKind = new Map();
    for (const sp of scatter) {
      let rows = byKind.get(sp.kind);
      if (!rows) { rows = []; byKind.set(sp.kind, rows); }
      rows.push(sp);
    }
    for (const [kind, rows] of byKind) {
      const dgeo = track(countTris(buildDetail(kind), rows.length));
      const im = new THREE.InstancedMesh(dgeo, propMat, rows.length);
      im.name = `level-detail-${kind}`;
      im.castShadow = false;
      im.receiveShadow = true;
      for (let i = 0; i < rows.length; i++) {
        const sp = rows[i];
        _v3.set(sp.x, sp.y, sp.z);
        _eu.set(0, sp.yaw, 0);
        _q4.setFromEuler(_eu);
        _s3.set(sp.scale, sp.scale, sp.scale);
        _m4.compose(_v3, _q4, _s3);
        im.setMatrixAt(i, _m4);
        _col.setHex(sp.hex, THREE.SRGBColorSpace).multiplyScalar(sp.tone);
        im.setColorAt(i, _col);
      }
      _s3.set(1, 1, 1);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      detailMeshes.push(im);
      group.add(im);
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

    // The wall chunks a transform or a secret opens fold into their own
    // footings on a uniform — one number per chunk, no per-instance rewrite.
    if (transformT >= 0) {
      transformT = Math.min(TRANSFORM_SECS, transformT + 1 / 60);
      const t = transformT / TRANSFORM_SECS;
      const e = t * t * (3 - 2 * t);
      uXform.value = e;
      uGrow.value = e;
      uSinkX.value = e;
      if (transformT >= TRANSFORM_SECS) {
        transformT = -1;
        uSinkX.value = 1;
        hideTransientWalls('transform');
      }
    }
    if (revealT >= 0) {
      revealT = Math.min(REVEAL_SECS, revealT + 1 / 60);
      const t = revealT / REVEAL_SECS;
      uSinkS.value = t * t * (3 - 2 * t);
      if (revealT >= REVEAL_SECS) {
        revealT = -1;
        uSinkS.value = 1;
        hideTransientWalls('secret');
      }
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
    wallTiles: walls.length,
    wallChunks: wallMeshes.length,
    wallPieces,
    landmarks: landmarks.length,
    landmarkPieces,
    landmarkHeight: landmarks.reduce((a, l) => Math.max(a, l.h), 0),
    planters: walls.reduce((a, w) => a + (w.planter ? 1 : 0), 0),
    groundTriangles: surf.triangles,
    groundVertices: surf.vertices,
    detailMeshes: detailMeshes.length,
    detailInstances: detailMeshes.reduce((a, m) => a + m.count, 0),
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
