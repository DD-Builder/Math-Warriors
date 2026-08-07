/**
 * The island's WILDLIFE — the 2D enemy roster, cut out of paper and set loose
 * on the 3D terrain.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * A hub world with no animals in it is a diorama, not a place. Worse, the
 * roster in data/enemies.js is the game's whole bestiary and until now it was
 * only ever visible for the ten seconds of a battle. Putting a Sproutling in
 * the Sprout Garden and a Cindercrab on the Ember Slopes does three jobs at
 * once: it gives every biome a reason to be walked through, it makes the
 * bestiary feel like a population rather than a menu, and it turns starting a
 * fight into something the child *chooses* by walking up to a creature instead
 * of something a random-encounter timer does to them.
 *
 * ── THE ART CONTRACT (identity — read before adding a species) ────────────
 * Every creature here is the SAME CHARACTER as its 2D portrait in
 * data/monsterArt.js, rebuilt in the one construction the whole game is made
 * of: layered cut paper. A species is a stack of PLIES — closed silhouettes
 * extruded a few millimetres, each one a little smaller and a little lighter
 * than the ply behind it, offset forward so the cut edges of the sheets below
 * stay visible. The extruded rim of every ply is tinted toward PAPER.shadow,
 * which is the teal-tinted crease you get where one sheet of paper lies on
 * another. That rim is the entire reason these read as paper and not as
 * low-poly plastic, and it is why NO colour in this file is black or grey:
 * a black crease would turn a cheerful garden bulb into a horror prop.
 *
 * Shapes are transcribed from the 2D draw functions in the SAME coordinate
 * frame the canvas art uses (x right, y DOWN, ~100 units to a body) so a
 * silhouette can be lifted straight across and still be recognisable. The kit
 * flips y and rescales each finished species to its authored world height.
 *
 * ── THE BEHAVIOUR CONTRACT ───────────────────────────────────────────────
 * Pure, seeded, fixed-step, wall-clock-free. `stepSim` is a function of
 * (creature list, player position, elapsed sim time) and nothing else, so the
 * same seed and the same walk produce the same island every session and the
 * screenshot harness can freeze a frame and get it back byte-identical.
 *
 * Creatures idle inside a home radius, notice the player at ~12 m and turn to
 * face, then approach or flee by temperament. Two safety rules make this
 * charming instead of harassing, and both are enforced structurally rather
 * than hoped for:
 *
 *   PERSONAL SPACE  an approaching creature aims at a point on the line
 *                   between itself and the player, `keep` metres out. It
 *                   therefore never orbits round behind the child, and for
 *                   the timid half of the roster `keep` is larger than the
 *                   contact radius, so those species can never start a fight
 *                   — the player does, by stepping in.
 *   ESCAPE ARC      the creatures crowded around the player must all fit
 *                   inside one arc; if the widest gap in their bearings ever
 *                   falls below 180 degrees the sim demotes the farthest one
 *                   until it opens again. The child can always walk away.
 *                   `largestAngularGap` is exported and unit-tested because
 *                   "you can't get surrounded" is a promise, not a vibe.
 *
 * Touching a creature calls hooks.onEncounter(enemyId, info) — the app then
 * launches the existing 2D BattleScene. Nothing in this file knows what a
 * battle is.
 *
 * ── COST ─────────────────────────────────────────────────────────────────
 * One InstancedMesh per species (27 hostile + 3 ambient) plus one shared
 * ground-shadow mesh. Every mesh is hidden outright when no instance of it is
 * within CULL_R, and biomes are ~300 m apart on a 480 m island, so a frame
 * only ever touches the two or three biomes in view. Nothing allocates after
 * build; update() writes into pre-sized instance buffers and moves
 * `mesh.count`.
 *
 * Constraints honoured: three r170 core only, no post-processing, no
 * depth-texture reads, no derivatives, InstancedMesh for everything repeated,
 * zero allocation in update(), every colour from PAPER, teal creases only,
 * dispose() releases all of it.
 */
import * as THREE from 'three';
import { WORLD, BIOMES, PORTALS, BUILDINGS, SPAWN, biomeForFloor } from './worldSpec.js';
import { papercutMaterial, PAPER } from './materials/toon.js';
import { sink, bake, tri, lin } from './geobuild.js';
import { makeRng } from '../systems/rng.js';

const TAU = Math.PI * 2;

// ── Authoring units ─────────────────────────────────────────────────────
// Shapes are written in the SAME numbers as the 2D canvas art (a body is
// roughly 100 units tall, y points DOWN). U converts one of those units to a
// metre; every species is then rescaled to its authored `height` anyway, so U
// only sets how thick a ply reads relative to its outline.
const U = 0.01;

// ── Behaviour constants ─────────────────────────────────────────────────
export const SIM_HZ = 30;
const SIM_DT = 1 / SIM_HZ;
const MAX_STEPS = 6;              // one frame may never simulate more than 0.2 s

export const NOTICE_R = 12;       // "notices you" — the brief says ~12 m
const FORGET_R = 17;              // hysteresis, so a creature at 12.0 m does not flicker
const CONTACT_R = 1.05;           // battle trigger
const CROWD_R = 3.6;              // radius the escape-arc rule polices
export const ESCAPE_ARC = Math.PI;// the child must always have a 180-degree exit
const MAX_APPROACHERS = 2;        // a welcoming party, not a mob
const LEASH_SLACK = 1.6;          // how far outside home radius a chase may stray
const MIN_LAND_Y = 0.5;           // never wander into the sea
const ENCOUNTER_COOLDOWN = 26;    // seconds before a beaten creature re-engages
const GLOBAL_ENCOUNTER_LOCK = 1.5;// one step can never fire two battles
const STARTLE_TIME = 0.7;

// Distance past which a species stops drawing entirely. Biome centres are
// ~300 m apart, so this keeps a frame to the two or three biomes in view.
const CULL_R = 95;
const CULL_R2 = CULL_R * CULL_R;

// Temperaments. `keep` is the distance an approacher settles at: below
// CONTACT_R the creature will nuzzle into the player and start the fight
// itself; above it, only the player can.
const TEMPERAMENTS = {
  curious:  { approach: true,  keep: 0.85, speed: 1.5, flee: 0 },
  bouncy:   { approach: true,  keep: 0.80, speed: 2.1, flee: 0 },
  shy:      { approach: false, keep: 3.2,  speed: 1.7, flee: 1 },
  skittish: { approach: false, keep: 4.5,  speed: 2.6, flee: 1 },
  drifty:   { approach: true,  keep: 2.4,  speed: 0.9, flee: 0 },
  stoic:    { approach: false, keep: 2.0,  speed: 0.8, flee: 0 },
};

// ── Colour helpers ──────────────────────────────────────────────────────

/** sRGB-int blend. Build-time only. */
function mixInt(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * The cut edge of a sheet of paper: the face colour pulled toward the shared
 * teal shadow. This single line is what separates "layered paper" from
 * "extruded vector art", and it is the reason the palette law survives 3D.
 */
function edgeOf(hex, amount = 0.34) {
  return mixInt(hex, PAPER.shadow, amount);
}

// ── The papercut ply kit ────────────────────────────────────────────────

/** Regular-ish organic blob outline. `lobe` wobbles the radius per vertex. */
export function blob(cx, cy, rx, ry, n = 10, lobe = 0, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase;
    const w = 1 + Math.sin(a * 3 + phase * 2.3) * lobe;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return pts;
}

/** Regular polygon — the crystal / geometry vocabulary. */
export function facet(cx, cy, r, n = 6, rot = 0, squash = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rot;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  return pts;
}

/** Teardrop: fat at the base, tapering to a point at (cx, cy - h). */
export function drop(cx, cy, r, h, n = 9) {
  const pts = [[cx, cy - h]];
  for (let i = 1; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
  }
  return pts;
}

/** A leaf / fin / petal blade from (x,y) reaching `len` along `ang` (radians). */
export function blade(x, y, len, wid, ang, curl = 0.35) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  const nx = -cy, ny = cx;
  return [
    [x, y],
    [x + cx * len * 0.42 + nx * wid, y + cy * len * 0.42 + ny * wid],
    [x + cx * len + nx * wid * curl, y + cy * len + ny * wid * curl],
    [x + cx * len * 0.96 - nx * wid * curl, y + cy * len * 0.96 - ny * wid * curl],
    [x + cx * len * 0.40 - nx * wid, y + cy * len * 0.40 - ny * wid],
  ];
}

/** A spike: base `w` wide at (x,y), tip `h` away along `ang`. */
export function spike(x, y, w, h, ang = -Math.PI / 2) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  const nx = -cy, ny = cx;
  return [
    [x + nx * w * 0.5, y + ny * w * 0.5],
    [x + cx * h, y + cy * h],
    [x - nx * w * 0.5, y - ny * w * 0.5],
  ];
}

/**
 * Stamp one ply: a closed 2D silhouette extruded along +Z.
 *
 * Front cap and rim always; the back cap is optional because a decorative ply
 * pressed onto a body can never be seen from behind and its triangles are the
 * cheapest ones to give back.
 *
 * Cost: n (front) + 2n (rim) + n (optional back) triangles.
 */
export function ply(s, pts, o) {
  const z0 = (o.z ?? 0) * U;
  const d = (o.d ?? 5) * U;
  const face = lin(o.c);
  const rim = lin(edgeOf(o.c, o.edge ?? 0.34));
  const back = o.back !== false;

  // Local space: canvas y points down, the world's does not.
  const p = pts.map((q) => [q[0] * U, -q[1] * U]);
  // Fan triangles must wind CCW as seen from +Z or the front cap culls away.
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) p.reverse();

  let cx = 0, cy = 0;
  for (const q of p) { cx += q[0]; cy += q[1]; }
  cx /= p.length; cy /= p.length;

  const zf = z0 + d;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    tri(s, [cx, cy, zf], [a[0], a[1], zf], [b[0], b[1], zf], [0, 0, 1], face);
    if (back) tri(s, [cx, cy, z0], [b[0], b[1], z0], [a[0], a[1], z0], [0, 0, -1], rim);
    // Rim quad. Its normal is the outward 2D edge normal, so a near-vertical
    // paper edge still catches the lit step of the toon ramp instead of
    // reading as a dark line — which is how we get depth with no outlines.
    let ex = b[1] - a[1], ey = a[0] - b[0];
    const el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    const nr = [ex, ey, 0];
    tri(s, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], zf], nr, rim);
    tri(s, [a[0], a[1], z0], [b[0], b[1], zf], [a[0], a[1], zf], nr, rim);
  }
}

/**
 * The signature move: one silhouette built as a SOLID CORE with lighter,
 * smaller sheets laid on its front face, so the cut edge of every sheet below
 * stays on show. `cols` runs back (the core, darkest) to front (smallest,
 * lightest).
 *
 * ── WHY THE CORE IS DEEP ─────────────────────────────────────────────────
 * The first version of this stacked every ply a few millimetres apart, which
 * looked perfect head-on and revealed a 10-%-deep cardboard standee the moment
 * the camera swung round. In an open world the camera swings round constantly.
 * So the core is now extruded to ~60 % of the silhouette's SHORT axis and
 * centred on z=0: the creature is a chunky papercraft solid you can walk all
 * the way around, and the decorative plies ride its face. Costs nothing —
 * same triangles, bigger numbers — and mirrorZ (which defaults to the z=0
 * plane the core is centred on) gives the back face the same detail as the
 * front.
 */
export function plies(s, pts, cols, o = {}) {
  const step = o.step ?? 3.2;
  const shrink = o.shrink ?? 0.86;
  const d = o.d ?? 4.5;
  let cx = 0, cy = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of pts) {
    cx += q[0]; cy += q[1];
    if (q[0] < minX) minX = q[0];
    if (q[0] > maxX) maxX = q[0];
    if (q[1] < minY) minY = q[1];
    if (q[1] > maxY) maxY = q[1];
  }
  cx /= pts.length; cy /= pts.length;
  const ax = o.ax ?? cx, ay = o.ay ?? cy;
  const core = o.core ?? Math.min(maxX - minX, maxY - minY) * 0.6;
  const zc = o.z ?? 0;

  ply(s, pts, { z: zc - core * 0.5, d: core, c: cols[0], edge: o.edge });
  let front = zc + core * 0.5;
  for (let i = 1; i < cols.length; i++) {
    const k = Math.pow(shrink, i);
    const sc = pts.map((q) => [ax + (q[0] - ax) * k, ay + (q[1] - ay) * k]);
    ply(s, sc, { z: front, d, c: cols[i], back: false, edge: o.edge });
    front += i === cols.length - 1 ? d : step;
  }
  // Where the next sheet goes. Species read `s.face` instead of hard-coding a
  // depth, so a change to the core thickness can never leave a creature's eyes
  // buried inside its own head.
  s.face = Math.max(front, s.face ?? -Infinity);
  return front;
}

/**
 * Mirror the last-stamped run of triangles about the body plane so a creature
 * has a back as well as a front. Cheaper and more reliable than authoring the
 * far side by hand, and it keeps a species readable from every compass point —
 * a paper standee that vanishes edge-on is the classic failure of this style.
 */
export function mirrorZ(s, from, about = 0) {
  const c = s.alpha ? 4 : 3;
  const n = s.pos.length;
  // z=0 by default, because `plies` centres every body core there. Mirroring
  // about the body's own mid-plane is what gives the back of a creature the
  // same detail as its front for free.
  const az = about * U * 2;
  for (let i = from; i < n; i += 9) {
    // Reverse winding (a mirror flips handedness) and negate z + normal z.
    for (const k of [2, 1, 0]) {
      s.pos.push(s.pos[i + k * 3], s.pos[i + k * 3 + 1], az - s.pos[i + k * 3 + 2]);
    }
    const ni = (i / 3) * 3;
    for (const k of [2, 1, 0]) {
      s.nrm.push(s.nrm[ni + k * 3], s.nrm[ni + k * 3 + 1], -s.nrm[ni + k * 3 + 2]);
    }
    const ci = (i / 3) * c;
    for (const k of [2, 1, 0]) {
      for (let j = 0; j < c; j++) s.col.push(s.col[ci + k * c + j]);
    }
  }
}

/** Eyes: an ink-teal lens with a cream catchlight. Never black. */
export function eyes(s, x, y, r, z, spread, tilt = 0) {
  for (const sx of [-1, 1]) {
    const ex = x + sx * spread;
    ply(s, blob(ex, y, r, r * 0.82, 7, 0, tilt * sx), { z, d: 2.2, c: PAPER.inkTeal, back: false, edge: 0.12 });
    ply(s, blob(ex - sx * r * 0.24, y - r * 0.28, r * 0.34, r * 0.30, 6), {
      z: z + 2.2, d: 1.6, c: PAPER.white, back: false, edge: 0.1,
    });
  }
}

/** A soft glowing core — the "lit from inside" note several species carry. */
export function core(s, x, y, r, z, hot, halo) {
  ply(s, blob(x, y, r * 1.7, r * 1.7, 8), { z, d: 2, c: halo, back: false, edge: 0.2 });
  ply(s, blob(x, y, r, r, 7), { z: z + 2, d: 2, c: hot, back: false, edge: 0.12 });
}

// ── Palettes ────────────────────────────────────────────────────────────
//
// Every entry is a PAPER value and nothing else — creatures.test.js asserts
// it, because "the whole game comes out of one palette" is the identity and it
// is exactly the kind of law that erodes one convenient hex at a time.
//
// The 2D portraits are drawn from a slightly muted cousin of this palette
// (#2a6063 where PAPER has tealD, and so on). In 3D the creatures are standing
// on terrain, grass and water that are painted from PAPER directly, so they
// take the PAPER value: a creature has to belong to the ground it is standing
// on before it has to match a canvas the child is not currently looking at.
// The relationships — dark ply, mid ply, light ply — are preserved exactly,
// and those are what make a silhouette recognisable.
export const C = {
  // Garden greens (sproutling, thornwall, puffshroom)
  gDark: PAPER.forestD, gMid: PAPER.forest, gSage: PAPER.forestL, gLite: PAPER.leaf,
  sage: PAPER.sage, sageD: PAPER.sageD,
  coralD: PAPER.coralD, coral: PAPER.coral, peach: PAPER.peach,
  // Tidepool / sky / palace teals
  tDeep: PAPER.tealD, tMid: PAPER.teal, tLite: PAPER.tealL, tPale: PAPER.sky,
  // Ember
  emD: PAPER.coralD, em: PAPER.coral, emL: PAPER.peach, emO: PAPER.orange, emG: PAPER.gold,
  // Frost
  ice: PAPER.sky, iceL: PAPER.white, iceM: PAPER.tealL, iceD: PAPER.teal,
  // Crystal
  cry: PAPER.lavender, cryD: PAPER.lavenderD, cryL: PAPER.white, cryS: PAPER.sky, cryR: PAPER.rose,
  // Market
  mk: PAPER.gold, mkD: PAPER.orange, mkP: PAPER.sand, mkL: PAPER.creamD, mkC: PAPER.cream,
  // Library
  lb: PAPER.sand, lbL: PAPER.cream, lbW: PAPER.white,
  // Shared
  cream: PAPER.cream, white: PAPER.white, ink: PAPER.inkTeal, gold: PAPER.gold,
  rose: PAPER.rose, lav: PAPER.lavenderD,
};

// ── The bestiary ────────────────────────────────────────────────────────
//
// Three mobs from every floor's roster, in that floor's biome. Bosses are
// deliberately absent: a boss is an EVENT you climb to, and one wandering
// past the shops would spend the surprise the battle rig exists to deliver.
//
//   height       metres, tip to toe. A K-5 hero is ~1.6 m, so nothing here is
//                taller than the child's own avatar except by intent.
//   temperament  see TEMPERAMENTS
//   gait         how it moves (see the animator at the bottom of the file)
//   build(s)     stamps the species into a geometry sink, in canvas units

export const SPECIES = [
  // ── FLOOR 1 · SPROUT GARDEN ──────────────────────────────────────────
  {
    id: 'sproutling', enemyId: 'sproutling', floor: 1, height: 0.85,
    temperament: 'curious', gait: 'hop', hopH: 0.20, rate: 1.15,
    build(s) {
      // Stem and root feet first — they sit BEHIND the seed head.
      ply(s, [[-6, 0], [6, 0], [5, 34], [-5, 34]], { z: -6, d: 12, c: C.gMid });
      for (const sx of [-1, 1]) {
        ply(s, blade(sx * 8, 10, 34, 9, sx > 0 ? -0.32 : Math.PI + 0.32), { z: -6, d: 12, c: C.gDark });
        ply(s, [[sx * 7, 34], [sx * 16, 52], [sx * 20, 66], [sx * 12, 68], [sx * 7, 56]],
          { z: -7, d: 14, c: C.gDark });
      }
      // Seed head: three plies of coral warming to peach — the character's
      // whole silhouette, lifted straight from the 2D art's dome.
      const dome = [[-56, 8], [-60, -12], [-52, -34], [-34, -52], [-12, -64], [8, -66],
        [28, -60], [44, -46], [54, -26], [52, -6], [34, 4], [10, 8], [-24, 8]];
      const F = plies(s, dome, [C.coralD, C.coral, C.peach], { step: 5, d: 6, shrink: 0.87 });
      const start = s.pos.length;
      // Cream spots — the freckles that make it friendly rather than fungal.
      for (const p of [[-4, -46], [20, -38], [-26, -30], [12, -56], [30, -48]]) {
        ply(s, blob(p[0], p[1], 6, 5, 6, 0.12, p[0]), { z: F, d: 2, c: C.cream, back: false, edge: 0.16 });
      }
      mirrorZ(s, start);
      eyes(s, 0, -14, 7, F + 1, 12, 0.2);
    },
  },
  {
    id: 'thornwall', enemyId: 'thornwall', floor: 1, height: 0.72,
    temperament: 'stoic', gait: 'roll', hopH: 0.06, rate: 0.6,
    build(s) {
      const ball = blob(0, 0, 26, 26, 12, 0.16, 1.3);
      // Thorns radiate all the way round the ball, in three depth rings, so
      // the hedgehog silhouette survives being looked at from behind.
      for (let ring = -1; ring <= 1; ring++) {
        const rk = 1 - Math.abs(ring) * 0.42;
        const n = ring === 0 ? 10 : 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + ring * 0.31;
          const tl = (22 + Math.sin(i * 1.9) * 7) * rk;
          ply(s, spike(Math.cos(a) * 22 * rk, Math.sin(a) * 22 * rk, 9 * rk, tl, a),
            { z: ring * 13 - 5, d: 10, c: C.sage });
        }
      }
      const F = plies(s, ball, [C.gDark, C.gMid, C.gLite], { step: 5, d: 6, shrink: 0.8 });
      core(s, 0, 0, 6, F, C.peach, C.coral);
      eyes(s, 0, 2, 4.5, F + 4, 7);
    },
  },
  {
    id: 'puffshroom', enemyId: 'puffshroom', floor: 1, height: 0.80,
    temperament: 'drifty', gait: 'bob', hopH: 0.10, rate: 0.75,
    build(s) {
      ply(s, [[-11, 24], [11, 24], [9, 56], [-9, 56]], { z: -11, d: 22, c: C.cream });
      for (const sx of [-1, 1]) ply(s, blob(sx * 14, 60, 10, 6, 7), { z: -9, d: 18, c: C.gMid });
      const cap = [[-54, 12], [-60, -6], [-56, -28], [-42, -50], [-18, -64], [0, -68],
        [18, -64], [42, -50], [56, -28], [60, -6], [54, 12], [26, 20], [0, 22], [-26, 20]];
      const F = plies(s, cap, [C.emO, C.gold, C.cream], { step: 5, d: 6, shrink: 0.86, ay: 12 });
      const start = s.pos.length;
      for (const p of [[-12, -36], [14, -46], [0, -58], [-32, -20], [30, -18]]) {
        ply(s, blob(p[0], p[1], 6, 4, 6), { z: F, d: 2, c: C.coralD, back: false, edge: 0.16 });
      }
      mirrorZ(s, start);
      eyes(s, 0, 14, 6, F + 1, 11);
    },
  },

  // ── FLOOR 2 · TIDEPOOL SHALLOWS ──────────────────────────────────────
  {
    id: 'drifter', enemyId: 'drifter', floor: 2, height: 0.95,
    temperament: 'drifty', gait: 'float', hopH: 0.22, rate: 0.5,
    build(s) {
      // Tendrils hang all round the bell, spaced in z as well as x, so this
      // one reads as a jellyfish from any bearing.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const tx = Math.cos(a) * 20, tz = Math.sin(a) * 18;
        ply(s, [[tx - 3.5, 4], [tx + 3.5, 4], [tx * 1.3 + 2.5, 44], [tx * 1.3 - 2.5, 44]],
          { z: tz - 3.5, d: 7, c: i % 3 === 0 ? C.tMid : C.tDeep });
      }
      const bell = [[-36, 4], [-40, -12], [-36, -26], [-24, -36], [-10, -42], [0, -44],
        [10, -42], [24, -36], [36, -26], [40, -12], [36, 4], [20, 8], [0, 10], [-20, 8]];
      const F = plies(s, bell, [C.tDeep, C.tMid, C.tLite], { step: 5, d: 6, shrink: 0.83 });
      const start = s.pos.length;
      ply(s, [[-14, -20], [14, -20], [14, -14], [-14, -14]], { z: F, d: 2.5, c: C.tPale, back: false, edge: 0.2 });
      mirrorZ(s, start);
      eyes(s, 0, -10, 5, F + 1, 8);
    },
  },
  {
    id: 'gulper', enemyId: 'gulper', floor: 2, height: 0.62,
    temperament: 'curious', gait: 'swim', hopH: 0.09, rate: 1.0,
    build(s) {
      // Tail fin first (it is thin by nature), then the body, then the grin.
      ply(s, [[28, -6], [54, -18], [60, -4], [54, 12], [28, 2]], { z: -4, d: 8, c: C.tDeep });
      const body = [[-58, -14], [-30, -22], [0, -22], [26, -16], [32, 0], [24, 16],
        [-6, 22], [-40, 18], [-60, 4]];
      const F = plies(s, body, [C.tDeep, C.tMid, C.tLite], { step: 5, d: 6, shrink: 0.84 });
      const start = s.pos.length;
      // Teeth: the friendly-goofy kind, blunt cream wedges, never fangs.
      for (let i = 0; i < 7; i++) {
        const x = -46 + i * 12;
        ply(s, spike(x, -8, 7, 11, Math.PI / 2), { z: F, d: 2, c: C.cream, back: false, edge: 0.14 });
        ply(s, spike(x + 6, 10, 6, -9, Math.PI / 2), { z: F, d: 2, c: C.cream, back: false, edge: 0.14 });
      }
      mirrorZ(s, start);
      // Lure on its stalk — the character's one unmistakable feature.
      ply(s, [[13, -20], [18, -20], [12, -44], [7, -44]], { z: -2.5, d: 5, c: C.tDeep });
      core(s, 9, -50, 7, 4, C.white, C.tLite);
      eyes(s, 12, -8, 5, F + 1, 0);
    },
  },
  {
    id: 'inkspitter', enemyId: 'inkspitter', floor: 2, height: 0.90,
    temperament: 'shy', gait: 'float', hopH: 0.14, rate: 0.7,
    build(s) {
      // Eight arms fanned across the lower half (canvas y runs DOWN, so
      // bearings near PI/2 point at the ground) and spread through z.
      for (let i = 0; i < 8; i++) {
        const a = 0.42 + i * 0.32;
        ply(s, blade(Math.cos(a) * 14, 24 + Math.sin(a) * 8, 50, 7, a, 0.2),
          { z: Math.sin(i * 2.1) * 13 - 4, d: 8, c: i % 2 ? C.tMid : C.tDeep });
      }
      const head = [[-26, 30], [-30, 12], [-24, -8], [-14, -26], [-6, -40], [0, -48],
        [6, -40], [14, -26], [24, -8], [30, 12], [26, 30], [12, 34], [-12, 34]];
      const F = plies(s, head, [C.tDeep, C.tMid, C.tLite], { step: 5, d: 6, shrink: 0.85, ay: 20 });
      const start = s.pos.length;
      ply(s, [[-12, 10], [12, 10], [12, 15], [-12, 15]], { z: F, d: 2.5, c: C.tPale, back: false, edge: 0.2 });
      ply(s, [[-4, 16], [4, 16], [2, 26], [-2, 26]], { z: F, d: 3, c: C.cream, back: false, edge: 0.18 });
      mirrorZ(s, start);
      eyes(s, 0, -6, 6.5, F + 1, 9, 0.3);
    },
  },

  // ── FLOOR 3 · SKY CLIFFS ─────────────────────────────────────────────
  {
    id: 'stormwing', enemyId: 'stormwing', floor: 3, height: 0.80,
    temperament: 'skittish', gait: 'flap', hopH: 0.30, rate: 1.9,
    build(s) {
      // A wing IS a sheet of paper, so it keeps a thin core on purpose — the
      // contrast against the chunky body is what makes both read.
      for (const sx of [-1, 1]) {
        const w = [[0, -4], [sx * 16, 0], [sx * 38, -12], [sx * 62, -4], [sx * 72, 6],
          [sx * 70, 20], [sx * 52, 28], [sx * 28, 22], [sx * 10, 12], [0, 8]];
        const WF = plies(s, w, [C.tDeep, C.tMid, C.tLite], { core: 9, step: 3, d: 3.5, shrink: 0.88 });
        // Gold bolt flicks at the trailing edge — the lightning motif.
        for (let i = 0; i < 3; i++) {
          const b = s.pos.length;
          ply(s, spike(sx * (56 + i * 4), -2 + i * 10, 6, 12, Math.PI / 2 + sx * 0.5),
            { z: WF, d: 2.5, c: C.gold, back: false, edge: 0.2 });
          mirrorZ(s, b);
        }
      }
      const body = [[0, -24], [11, -16], [14, 0], [10, 18], [0, 24], [-10, 18], [-14, 0], [-11, -16]];
      const F = plies(s, body, [C.tDeep, C.tMid], { core: 24, step: 4, d: 6, shrink: 0.8 });
      const start = s.pos.length;
      ply(s, [[-7, -9], [-1, -9], [7, 9], [1, 9]], { z: F, d: 2.5, c: C.gold, back: false, edge: 0.2 });
      mirrorZ(s, start);
      const CF = plies(s, [[0, -24], [10, -28], [13, -38], [7, -47], [0, -50], [-7, -47], [-13, -38], [-10, -28]],
        [C.tDeep, C.tMid], { core: 20, step: 4, d: 5, shrink: 0.8 });
      eyes(s, 0, -36, 5, CF + 1, 7);
    },
  },
  {
    id: 'hailshot', enemyId: 'hailshot', floor: 3, height: 0.68,
    temperament: 'bouncy', gait: 'hop', hopH: 0.34, rate: 1.5,
    build(s) {
      const cloud = [[-40, 12], [-46, -2], [-38, -18], [-20, -26], [-4, -30], [12, -28],
        [30, -20], [42, -6], [40, 10], [20, 18], [-4, 20], [-24, 18]];
      const F = plies(s, cloud, [C.tMid, C.tLite, C.white], { step: 5, d: 6, shrink: 0.84 });
      // Hail pellets orbit BELOW in a real ring, not a flat arc — pale
      // facets, never grey.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ply(s, facet(Math.cos(a) * 26, 26 + Math.sin(a * 2) * 4, 6, 5, a),
          { z: Math.sin(a) * 20 - 3, d: 6, c: C.tPale });
      }
      eyes(s, 0, -4, 6, F + 1, 11);
    },
  },
  {
    id: 'cycloneimp', enemyId: 'cycloneimp', floor: 3, height: 0.86,
    temperament: 'skittish', gait: 'spin', hopH: 0.12, rate: 2.4,
    build(s) {
      // A stacked funnel: four discs tapering upward. Each disc is a wide,
      // shallow slab, which is exactly what a whirl of paper looks like.
      const rings = [[32, 34], [25, 12], [18, -8], [12, -26]];
      const cols = [C.tDeep, C.tMid, C.tLite, C.tPale];
      rings.forEach((r, i) => {
        ply(s, blob(0, r[1], r[0], r[0] * 0.40, 10, 0.1, i * 0.7),
          { z: -r[0], d: r[0] * 2, c: cols[i] });
      });
      for (const sx of [-1, 1]) {
        ply(s, blade(sx * 15, -12, 22, 6, sx > 0 ? -0.7 : Math.PI + 0.7), { z: -5, d: 10, c: C.tMid });
      }
      ply(s, spike(0, -34, 14, 16, -Math.PI / 2), { z: -7, d: 14, c: C.gold });
      eyes(s, 0, -22, 5, 13, 8);
    },
  },

  // ── FLOOR 4 · EMBER SLOPES ───────────────────────────────────────────
  {
    id: 'cindercrab', enemyId: 'cindercrab', floor: 4, height: 0.55,
    temperament: 'stoic', gait: 'scuttle', hopH: 0.05, rate: 1.8,
    build(s) {
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ply(s, [[sx * 24, 4 + i * 7], [sx * 44, 10 + i * 9], [sx * 44, 16 + i * 9], [sx * 24, 10 + i * 7]],
            { z: -22 + i * 16, d: 6, c: C.emD });
        }
        // Claws — big, blunt, cartoon. A pincer that could pinch is a threat;
        // one shaped like a mitten is a personality.
        ply(s, [[sx * 34, -12], [sx * 56, -22], [sx * 66, -10], [sx * 58, 4], [sx * 38, 2]],
          { z: -11, d: 22, c: C.emD });
        const b = s.pos.length;
        ply(s, [[sx * 40, -12], [sx * 56, -19], [sx * 62, -10], [sx * 54, 0], [sx * 42, 0]],
          { z: 11, d: 4, c: C.em, back: false });
        mirrorZ(s, b);
      }
      const shell = [[-42, 6], [-46, -8], [-36, -22], [-16, -30], [0, -32], [18, -30],
        [38, -22], [46, -8], [42, 6], [20, 14], [0, 16], [-22, 14]];
      const F = plies(s, shell, [C.emD, C.em, C.emL], { step: 5, d: 6, shrink: 0.84 });
      const start = s.pos.length;
      for (const p of [[-18, -14], [16, -18], [0, -6]]) {
        ply(s, spike(p[0], p[1], 9, 10, -Math.PI / 2), { z: F, d: 2.5, c: C.emG, back: false, edge: 0.2 });
      }
      mirrorZ(s, start);
      eyes(s, 0, -20, 6, F + 1, 13);
    },
  },
  {
    id: 'magmatoad', enemyId: 'magmatoad', floor: 4, height: 0.66,
    temperament: 'bouncy', gait: 'hop', hopH: 0.46, rate: 0.85,
    build(s) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          ply(s, blob(sx * 32, 20, 14, 10, 7), { z: sz * 20 - 8, d: 16, c: C.emD });
          ply(s, blob(sx * 40, 28, 10, 6, 5), { z: sz * 20 - 6, d: 12, c: C.em });
        }
      }
      const body = [[-44, 24], [-48, 6], [-40, -12], [-22, -24], [0, -28], [22, -24],
        [40, -12], [48, 6], [44, 24], [20, 32], [0, 34], [-20, 32]];
      const F = plies(s, body, [C.emD, C.em, C.emL], { step: 5, d: 7, shrink: 0.85 });
      const start = s.pos.length;
      // A wide friendly mouth line and warm back spots.
      ply(s, [[-30, 10], [30, 10], [28, 16], [-28, 16]], { z: F, d: 2.5, c: C.emG, back: false, edge: 0.22 });
      for (const p of [[-22, -6], [12, -12], [26, 2]]) {
        ply(s, blob(p[0], p[1], 7, 5, 6), { z: F, d: 2, c: C.emG, back: false, edge: 0.2 });
      }
      mirrorZ(s, start);
      // Eyes ride on TOP, toad-style, so this one reads from above too.
      for (const sx of [-1, 1]) ply(s, blob(sx * 17, -28, 12, 11, 8), { z: -11, d: 22, c: C.emL });
      eyes(s, 0, -30, 6.5, 12, 17);
    },
  },
  {
    id: 'spineshard', enemyId: 'spineshard', floor: 4, height: 0.74,
    temperament: 'stoic', gait: 'bob', hopH: 0.08, rate: 0.9,
    build(s) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.34;
        ply(s, spike(Math.cos(a) * 16, 4 + Math.sin(a) * 16, 12, 30 - Math.abs(3 - i) * 4, a),
          { z: ((i % 3) - 1) * 13 - 5, d: 10, c: i % 2 ? C.emO : C.emD });
      }
      const F = plies(s, facet(0, 6, 30, 6, 0.4, 0.9), [C.emD, C.em, C.emL], { step: 5, d: 6, shrink: 0.82 });
      core(s, 0, 6, 8, F, C.emG, C.emO);
      eyes(s, 0, 2, 5, F + 4, 9);
    },
  },

  // ── FLOOR 5 · FROST FIELDS ───────────────────────────────────────────
  {
    id: 'frostbite', enemyId: 'frostbite', floor: 5, height: 0.62,
    temperament: 'curious', gait: 'hop', hopH: 0.24, rate: 1.3,
    build(s) {
      const F = plies(s, blob(0, 0, 30, 28, 10, 0.11, 0.6), [C.iceD, C.iceM, C.iceL],
        { step: 5, d: 6, shrink: 0.84 });
      // A little ice crest instead of horns — cold, not cruel. It runs over
      // the crown in z as well, so it is a mohawk and not a decal.
      for (let i = 0; i < 3; i++) {
        for (const sz of [-1, 0, 1]) {
          ply(s, spike(-12 + i * 12, -24, 9, 14 + (i === 1 ? 6 : 0), -Math.PI / 2),
            { z: sz * 11 - 3, d: 6, c: C.ice });
        }
      }
      const start = s.pos.length;
      // Two blunt cream tusks. Round tips: a fang that could bite is a scare.
      for (const sx of [-1, 1]) {
        ply(s, blob(sx * 11, 16, 5, 8, 7), { z: F, d: 3, c: C.white, back: false, edge: 0.16 });
      }
      mirrorZ(s, start);
      eyes(s, 0, -4, 7, F + 1, 11);
    },
  },
  {
    id: 'icicle', enemyId: 'icicle', floor: 5, height: 0.78,
    temperament: 'shy', gait: 'bob', hopH: 0.10, rate: 1.0,
    build(s) {
      const shape = [[-20, 24], [-14, -10], [-6, -34], [0, -44], [6, -34], [14, -10], [20, 24], [0, 30]];
      const F = plies(s, shape, [C.iceD, C.iceM, C.ice], { step: 5, d: 6, shrink: 0.8, ay: 10 });
      const start = s.pos.length;
      ply(s, blob(0, -32, 13, 8, 8, 0.16), { z: F, d: 3, c: C.iceL, back: false, edge: 0.18 });
      mirrorZ(s, start);
      for (const sx of [-1, 1]) {
        ply(s, blade(sx * 16, 6, 18, 5, sx > 0 ? -0.2 : Math.PI + 0.2), { z: -4, d: 8, c: C.iceM });
      }
      eyes(s, 0, -6, 5.5, F + 1, 8);
    },
  },
  {
    id: 'snowdrift', enemyId: 'snowdrift', floor: 5, height: 0.60,
    temperament: 'drifty', gait: 'bob', hopH: 0.07, rate: 0.45,
    build(s) {
      // Three drifts of settled snow, stacked. The sleepiest thing on the
      // island, and the only creature with its eyes shut.
      ply(s, blob(0, 20, 46, 18, 11, 0.1, 0.2), { z: -26, d: 52, c: C.mkL });
      ply(s, blob(-6, 0, 34, 20, 10, 0.12, 1.1), { z: -22, d: 44, c: C.lbL });
      const F = plies(s, blob(4, -18, 24, 16, 10, 0.14, 2.0), [C.iceL, C.white],
        { core: 34, step: 4, d: 5, shrink: 0.88 });
      for (const sx of [-1, 1]) {
        const ex = 4 + sx * 10;
        ply(s, [[ex - 7, -14], [ex - 3, -17], [ex + 3, -17], [ex + 7, -14], [ex + 3, -12], [ex - 3, -12]],
          { z: F, d: 2, c: PAPER.inkTeal, back: false, edge: 0.12 });
      }
    },
  },

  // ── FLOOR 6 · CRYSTAL HOLLOW ─────────────────────────────────────────
  {
    id: 'shard', enemyId: 'shard', floor: 6, height: 0.92,
    temperament: 'drifty', gait: 'float', hopH: 0.18, rate: 0.6,
    build(s) {
      const body = [[-16, 30], [-20, 0], [-10, -30], [0, -46], [10, -30], [20, 0], [16, 30], [0, 36]];
      const F = plies(s, body, [C.cryD, C.cry, C.cryL], { core: 30, step: 5, d: 7, shrink: 0.78, ay: 8 });
      // Two smaller shards orbiting the main one, offset in depth so the trio
      // reads as a cluster rather than a decal.
      for (const sx of [-1, 1]) {
        ply(s, [[sx * 30, 8], [sx * 36, -8], [sx * 30, -24], [sx * 24, -8]],
          { z: sx * 6 - 9, d: 18, c: C.cry });
      }
      eyes(s, 0, -6, 5.5, F + 1, 8);
    },
  },
  {
    id: 'geode', enemyId: 'geode', floor: 6, height: 0.58,
    temperament: 'stoic', gait: 'bob', hopH: 0.05, rate: 0.5,
    build(s) {
      const rock = blob(0, 0, 34, 32, 11, 0.13, 0.9);
      const F = plies(s, rock, [C.mkP, C.mkL, C.lbL], { step: 5, d: 7, shrink: 0.88 });
      const start = s.pos.length;
      // Cracked open: a nest of lavender crystals in the face. This is the
      // character — a rock with a secret.
      ply(s, blob(0, 0, 20, 18, 8, 0.2, 2.1), { z: F, d: 3, c: C.cryD, back: false, edge: 0.22 });
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        ply(s, spike(Math.cos(a) * 5, Math.sin(a) * 5, 8, 15, a),
          { z: F + 3, d: 3, c: i % 2 ? C.cry : C.cryL, back: false, edge: 0.2 });
      }
      mirrorZ(s, start);
      eyes(s, 0, 12, 4.5, F + 6, 8);
    },
  },
  {
    id: 'prismling', enemyId: 'prismling', floor: 6, height: 0.64,
    temperament: 'bouncy', gait: 'hop', hopH: 0.28, rate: 1.6,
    build(s) {
      // The split light fans out BEHIND the prism — coral, gold, sky.
      const fan = [C.cryR, C.gold, C.cryS];
      fan.forEach((c, i) => {
        const a = -Math.PI / 2 + (i - 1) * 0.5;
        ply(s, blade(0, 4, 44, 11, a, 0.5), { z: -22 + i * 6, d: 5, c });
      });
      const F = plies(s, facet(0, 0, 28, 3, -Math.PI / 2), [C.cryD, C.cry, C.cryL],
        { core: 28, step: 5, d: 6, shrink: 0.78, ay: 6 });
      eyes(s, 0, 4, 5, F + 1, 8);
    },
  },

  // ── FLOOR 7 · MARKET TOWN ────────────────────────────────────────────
  {
    id: 'pickpocket', enemyId: 'pickpocket', floor: 7, height: 0.88,
    temperament: 'skittish', gait: 'walk', hopH: 0.06, rate: 2.0,
    build(s) {
      const cloak = [[-26, 40], [-20, 6], [-10, -18], [0, -26], [10, -18], [20, 6], [26, 40], [0, 44]];
      const F = plies(s, cloak, [C.mkP, C.mkL, C.mkC], { core: 34, step: 5, d: 6, shrink: 0.85, ay: 24 });
      // Hood brim, worn all the way round the head like a real hood.
      ply(s, blob(0, -20, 26, 13, 9), { z: -14, d: 28, c: C.mkD });
      const start = s.pos.length;
      // ...and a coin purse: half the read of the character.
      ply(s, blob(18, 20, 12, 13, 8, 0.1), { z: F, d: 3.5, c: C.gold, back: false, edge: 0.2 });
      ply(s, [[10, 10], [26, 10], [22, 16], [14, 16]], { z: F + 3.5, d: 2, c: C.mkD, back: false, edge: 0.2 });
      mirrorZ(s, start);
      eyes(s, 0, -16, 4.5, 15, 7);
    },
  },
  {
    id: 'taxcollector', enemyId: 'taxcollector', floor: 7, height: 1.05,
    temperament: 'stoic', gait: 'walk', hopH: 0.04, rate: 1.2,
    build(s) {
      const body = [[-20, 46], [-18, 0], [-12, -30], [0, -38], [12, -30], [18, 0], [20, 46], [0, 50]];
      const F = plies(s, body, [C.mkP, C.mkL, C.mkC], { core: 30, step: 5, d: 6, shrink: 0.87, ay: 28 });
      const start = s.pos.length;
      // The ledger — a cream page ruled with gold, held across the chest.
      ply(s, [[-18, 4], [18, 4], [18, 28], [-18, 28]], { z: F, d: 3, c: C.lbL, back: false, edge: 0.2 });
      for (let i = 0; i < 3; i++) {
        ply(s, [[-13, 10 + i * 6], [13, 10 + i * 6], [13, 12 + i * 6], [-13, 12 + i * 6]],
          { z: F + 3, d: 1.5, c: C.gold, back: false, edge: 0.18 });
      }
      mirrorZ(s, start);
      // Quill on top, so the silhouette has a hook.
      ply(s, blade(8, -38, 26, 6, -1.15, 0.4), { z: -3, d: 6, c: C.white });
      eyes(s, 0, -22, 4.5, F + 1, 7);
    },
  },
  {
    id: 'merchant', enemyId: 'merchant', floor: 7, height: 0.82,
    temperament: 'curious', gait: 'walk', hopH: 0.07, rate: 1.4,
    build(s) {
      const F = plies(s, blob(0, 8, 30, 30, 10, 0.08, 0.4), [C.mkD, C.mk, C.emL],
        { step: 5, d: 6, shrink: 0.85 });
      // A wide market awning worn as a hat — striped, of course, and it sits
      // ON the head rather than hovering in front of it.
      ply(s, blob(0, -26, 44, 9, 10), { z: -20, d: 40, c: C.mkD });
      const start = s.pos.length;
      for (let i = -2; i <= 2; i++) {
        ply(s, [[i * 16 - 4, -20], [i * 16 + 4, -20], [i * 16 + 3, -33], [i * 16 - 3, -33]],
          { z: 20, d: 2, c: C.mkC, back: false, edge: 0.18 });
      }
      for (const sx of [-1, 1]) {
        ply(s, blob(sx * 30, 12, 9, 9, 7), { z: F, d: 3, c: C.gold, back: false, edge: 0.2 });
      }
      mirrorZ(s, start);
      eyes(s, 0, -8, 5.5, F + 1, 9);
    },
  },

  // ── FLOOR 8 · CANYON LIBRARY ─────────────────────────────────────────
  {
    id: 'bookworm_e', enemyId: 'bookworm_e', floor: 8, height: 0.50,
    temperament: 'curious', gait: 'crawl', hopH: 0.11, rate: 1.7,
    build(s) {
      // Four segments in a rising arc — the classic caterpillar read.
      const seg = [[-40, 18, 15], [-16, 8, 17], [10, 0, 18], [34, -6, 16]];
      let F = 0;
      seg.forEach((p, i) => {
        F = plies(s, blob(p[0], p[1], p[2], p[2] * 0.92, 9, 0.08, i),
          [i % 2 ? C.lb : C.lbL], { core: p[2] * 1.9 });
      });
      const start = s.pos.length;
      // A page collar — this one lives in a book.
      ply(s, [[16, -18], [50, -18], [50, 6], [16, 6]], { z: 17, d: 2.5, c: C.lbW, back: false, edge: 0.2 });
      ply(s, [[33, -18], [35, -18], [35, 6], [33, 6]], { z: 19.5, d: 1.5, c: C.lb, back: false, edge: 0.16 });
      mirrorZ(s, start);
      eyes(s, 36, -10, 5, F + 1, 8);
    },
  },
  {
    id: 'inkblot', enemyId: 'inkblot', floor: 8, height: 0.56,
    temperament: 'shy', gait: 'bob', hopH: 0.12, rate: 1.1,
    build(s) {
      // A splat: lobed outline with drips, deepest teal into lavender.
      const splat = blob(0, 0, 32, 26, 13, 0.26, 1.7);
      const F = plies(s, splat, [C.tDeep, C.cryD, C.cry], { step: 5, d: 6, shrink: 0.84 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4;
        ply(s, blob(Math.cos(a) * 28, 8 + Math.sin(a) * 6, 6, 9, 7),
          { z: Math.sin(a) * 15 - 3, d: 6, c: C.tDeep });
      }
      // One big single eye — the character's whole joke.
      ply(s, blob(0, -4, 12, 12, 9), { z: F, d: 3, c: C.white, back: false, edge: 0.14 });
      ply(s, blob(2, -4, 5.5, 5.5, 7), { z: F + 3, d: 2, c: PAPER.inkTeal, back: false, edge: 0.12 });
    },
  },
  {
    id: 'riddler', enemyId: 'riddler', floor: 8, height: 0.86,
    temperament: 'drifty', gait: 'float', hopH: 0.16, rate: 0.65,
    build(s) {
      // A living question mark. The hook is CONCAVE, so it is assembled from
      // convex segments rather than cut as one outline — a fan triangulation
      // of a hook folds back on itself and reads as a blob.
      const F = plies(s, blob(0, 2, 26, 30, 10, 0.07, 0.9), [C.cryD, C.cry, C.cryL],
        { step: 5, d: 6, shrink: 0.86 });
      const start = s.pos.length;
      ply(s, [[-11, -20], [-5, -26], [5, -26], [11, -20], [6, -18], [0, -20], [-6, -18]],
        { z: F, d: 2.5, c: C.gold, back: false, edge: 0.2 });
      ply(s, [[11, -20], [15, -14], [10, -6], [3, -2], [1, -7], [7, -11]],
        { z: F, d: 2.5, c: C.gold, back: false, edge: 0.2 });
      ply(s, [[-3, -2], [3, -2], [3, 8], [-3, 8]], { z: F, d: 2.5, c: C.gold, back: false, edge: 0.2 });
      ply(s, blob(0, 16, 5, 5, 7), { z: F, d: 2.5, c: C.gold, back: false, edge: 0.2 });
      mirrorZ(s, start);
      eyes(s, 0, 24, 4.5, F + 3, 8);
    },
  },

  // ── FLOOR 9 · PAPER PALACE ───────────────────────────────────────────
  {
    id: 'runebound', enemyId: 'runebound', floor: 9, height: 0.94,
    temperament: 'stoic', gait: 'float', hopH: 0.14, rate: 0.4,
    build(s) {
      const tablet = [[-24, 34], [-26, -20], [-14, -36], [14, -36], [26, -20], [24, 34]];
      const F = plies(s, tablet, [C.tDeep, C.tMid, C.tLite], { core: 22, step: 5, d: 6, shrink: 0.88 });
      const start = s.pos.length;
      // The carved glyph — a plus and a bar, the game's own alphabet.
      ply(s, [[-3, -18], [3, -18], [3, 20], [-3, 20]], { z: F, d: 2.5, c: C.white, back: false, edge: 0.16 });
      ply(s, [[-14, -2], [14, -2], [14, 4], [-14, 4]], { z: F, d: 2.5, c: C.white, back: false, edge: 0.16 });
      mirrorZ(s, start);
      // Two little cubes that keep it company.
      for (const sx of [-1, 1]) ply(s, facet(sx * 36, -6, 9, 4, Math.PI / 4), { z: -9, d: 18, c: C.tPale });
    },
  },
  {
    id: 'hexweave', enemyId: 'hexweave', floor: 9, height: 0.88,
    temperament: 'drifty', gait: 'spin', hopH: 0.10, rate: 0.9,
    build(s) {
      // A hex ring — six rim segments and six spokes, so it reads as WOVEN
      // rather than solid. Spoke width is taken perpendicular to the spoke, or
      // a spoke lying along x would collapse to a line.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const b = ((i + 1) / 6) * TAU;
        ply(s, [[Math.cos(a) * 34, Math.sin(a) * 34], [Math.cos(b) * 34, Math.sin(b) * 34],
          [Math.cos(b) * 26, Math.sin(b) * 26], [Math.cos(a) * 26, Math.sin(a) * 26]],
        { z: -11, d: 22, c: i % 2 ? C.tMid : C.tDeep });
        const nx = -Math.sin(a) * 2.5, ny = Math.cos(a) * 2.5;
        const ox = Math.cos(a) * 26, oy = Math.sin(a) * 26;
        ply(s, [[ox + nx, oy + ny], [ox - nx, oy - ny], [-nx, -ny], [nx, ny]],
          { z: -7, d: 14, c: C.tLite });
      }
      core(s, 0, 0, 8, 8, C.white, C.tLite);
      eyes(s, 0, 2, 4, 13, 6);
    },
  },
  {
    id: 'familiar', enemyId: 'familiar', floor: 9, height: 0.66,
    temperament: 'curious', gait: 'walk', hopH: 0.12, rate: 1.6,
    build(s) {
      // Tail first — it sweeps out behind the body.
      ply(s, blade(24, 12, 30, 7, -0.75, 0.45), { z: -6, d: 12, c: C.tDeep });
      const F = plies(s, blob(0, 8, 26, 24, 10, 0.08, 0.5), [C.tDeep, C.tMid, C.tLite],
        { step: 5, d: 6, shrink: 0.85 });
      // Ears are solid wedges through the whole head depth — a paper cat with
      // decal ears loses its whole silhouette in profile.
      for (const sx of [-1, 1]) {
        ply(s, spike(sx * 15, -16, 14, 26, -Math.PI / 2 + sx * 0.3), { z: -8, d: 16, c: C.tDeep });
        const b = s.pos.length;
        ply(s, spike(sx * 15, -16, 8, 18, -Math.PI / 2 + sx * 0.3), { z: 8, d: 3, c: C.tPale, back: false, edge: 0.2 });
        mirrorZ(s, b);
      }
      eyes(s, 0, 0, 7, F + 1, 10, 0.25);
    },
  },
];

/**
 * Ambient life. No stats, no encounter, no purpose but to move: a world where
 * the only thing that stirs is a thing that fights you is a world a child
 * reads as hostile. These are the counterweight.
 */
export const AMBIENT = [
  {
    id: 'butterfly', floor: null, height: 0.16, count: 64, kind: 'flit',
    build(s) {
      // Wings stay genuinely paper-thin — this is the one creature whose
      // whole charm is being a scrap of paper caught in the air.
      for (const sx of [-1, 1]) {
        ply(s, [[0, 0], [sx * 30, -22], [sx * 40, 0], [sx * 26, 18], [0, 8]],
          { z: -1.5, d: 3, c: C.white, edge: 0.28 });
        const b = s.pos.length;
        ply(s, [[0, 2], [sx * 22, -14], [sx * 28, 0], [sx * 18, 12], [0, 8]],
          { z: 1.5, d: 1.5, c: C.rose, back: false, edge: 0.24 });
        mirrorZ(s, b);
      }
      ply(s, blob(0, 2, 4, 11, 7), { z: -5, d: 10, c: C.lav });
    },
  },
  {
    id: 'bunny', floor: null, height: 0.34, count: 20, kind: 'hop',
    build(s) {
      ply(s, blob(-26, 6, 11, 11, 8), { z: -11, d: 22, c: C.white });
      const F = plies(s, blob(0, 0, 24, 21, 10, 0.08, 0.3), [C.sageD, C.sage, PAPER.creamD],
        { step: 5, d: 6, shrink: 0.85 });
      for (const sx of [-1, 1]) {
        ply(s, blob(18 + sx * 4, -30, 6, 18, 8), { z: -5, d: 10, c: C.sageD });
        const b = s.pos.length;
        ply(s, blob(18 + sx * 4, -30, 3.5, 13, 7), { z: 5, d: 2.5, c: C.rose, back: false, edge: 0.2 });
        mirrorZ(s, b);
      }
      eyes(s, 20, -6, 4.5, F + 1, 0);
    },
  },
  {
    id: 'fish', floor: null, height: 0.22, count: 26, kind: 'leap',
    build(s) {
      ply(s, [[22, 0], [42, -14], [46, 0], [42, 14], [22, 0]], { z: -2, d: 4, c: C.tDeep });
      const body = [[-40, 0], [-22, -14], [4, -16], [24, -6], [26, 4], [6, 14], [-20, 12]];
      const F = plies(s, body, [C.tDeep, C.tMid, C.tLite], { core: 20, step: 4, d: 5, shrink: 0.82 });
      const start = s.pos.length;
      ply(s, blade(0, -12, 20, 6, -1.4, 0.4), { z: F, d: 2.5, c: C.cryS, back: false, edge: 0.2 });
      mirrorZ(s, start);
      eyes(s, -26, -2, 4, F + 1, 0);
    },
  },
];

// ── Pure behaviour ──────────────────────────────────────────────────────

/** Deterministic [0,1) hash of two integers. No state, no wall clock. */
export function hash01(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Widest empty wedge in a set of bearings, in radians.
 *
 * This is the escape-arc test. An empty set is a fully open circle; a single
 * bearing leaves a full circle minus nothing, i.e. TAU. Anything below
 * ESCAPE_ARC means the creatures have closed off more than half the compass
 * and the child would feel trapped.
 */
export function largestAngularGap(bearings) {
  const n = bearings.length;
  if (n === 0) return TAU;
  if (n === 1) return TAU;
  const sorted = bearings.slice().sort((a, b) => a - b);
  let best = sorted[0] + TAU - sorted[n - 1];
  for (let i = 1; i < n; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > best) best = g;
  }
  return best;
}

/**
 * One creature's decision for this tick. Writes desired velocity onto the
 * record; integration and the crowd rules happen in stepSim.
 */
function decide(c, px, pz, t) {
  const tm = TEMPERAMENTS[c.temperament];
  const dx = px - c.x, dz = pz - c.z;
  const d2 = dx * dx + dz * dz;
  c.dist2 = d2;
  const d = Math.sqrt(d2);
  const aware = c.cooldown <= 0;

  if (c.state === 'idle' && aware && d < NOTICE_R) {
    c.state = 'alert';
    c.stateT = 0;
    c.startle = STARTLE_TIME;
  } else if (c.state !== 'idle' && (d > FORGET_R || !aware)) {
    c.state = 'idle';
    c.stateT = 0;
  }

  let tx, tz, sp;
  if (c.state === 'idle') {
    // Wander: a new home-relative target every wanderPeriod seconds, chosen
    // from a hash of (creature, tick bucket) so the walk is reproducible.
    const bucket = Math.floor(t / c.wanderPeriod);
    if (bucket !== c.wanderBucket) {
      c.wanderBucket = bucket;
      const a = hash01(c.seed, bucket) * TAU;
      const r = 0.35 + hash01(c.seed ^ 0x5bf03635, bucket) * 0.65;
      c.tx = c.hx + Math.cos(a) * c.homeR * r;
      c.tz = c.hz + Math.sin(a) * c.homeR * r;
      // A creature that only ever walks is a conveyor belt; half the buckets
      // are a PAUSE, which is what makes the other half read as a decision.
      c.resting = hash01(c.seed ^ 0x9e3779b9, bucket) < 0.42;
    }
    tx = c.tx; tz = c.tz;
    sp = c.resting ? 0 : tm.speed * 0.34;
  } else if (tm.flee) {
    // Flee: away from the player, but curved back toward home so a shy
    // creature never runs off the edge of its biome (or the island).
    const inv = d > 1e-4 ? 1 / d : 0;
    const away = Math.max(0, 1 - d / FORGET_R);
    const hx = c.hx - c.x, hz = c.hz - c.z;
    tx = c.x - dx * inv * 8 + hx * 0.4;
    tz = c.z - dz * inv * 8 + hz * 0.4;
    sp = tm.speed * (0.45 + away * 0.85);
    c.state = d < tm.keep ? 'flee' : 'alert';
  } else if (tm.approach && c.yield <= 0) {
    // Approach: stop `keep` metres out ALONG ITS OWN BEARING. It closes the
    // gap in front of itself and never swings round behind the player, which
    // is the whole personal-space guarantee.
    const inv = d > 1e-4 ? 1 / d : 0;
    tx = px - dx * inv * tm.keep;
    tz = pz - dz * inv * tm.keep;
    const gap = d - tm.keep;
    sp = gap > 0.1 ? tm.speed * Math.min(1, 0.25 + gap * 0.4) : 0;
    c.state = gap > 0.1 ? 'approach' : 'greet';
  } else {
    // Alert, or yielding to keep the escape arc open: hold position and watch.
    tx = c.x; tz = c.z;
    sp = 0;
    c.state = 'alert';
  }

  const vx = tx - c.x, vz = tz - c.z;
  const vl = Math.hypot(vx, vz);
  if (vl > 1e-4 && sp > 0) {
    c.vx = (vx / vl) * sp;
    c.vz = (vz / vl) * sp;
  } else {
    c.vx = 0;
    c.vz = 0;
  }

  // Facing: toward the player once noticed, toward travel otherwise.
  if (c.state !== 'idle') c.targetYaw = Math.atan2(px - c.x, pz - c.z);
  else if (vl > 0.05 && sp > 0) c.targetYaw = Math.atan2(vx, vz);
}

/**
 * Advance the whole population by exactly one fixed tick.
 *
 * Order matters: decide, then police the crowd, then integrate, then test for
 * contact. Policing before integration means a creature that would have closed
 * the escape arc never actually moves there — the rule is a constraint on the
 * world, not a correction applied after the child already felt boxed in.
 *
 * @param {Array} list creature records, mutated in place
 * @param {object} ctx { px, pz, t, ground, hooks, encountersOn, lock }
 * @returns {number} remaining global encounter lock, in seconds
 */
export function stepSim(list, ctx) {
  const { px, pz, t } = ctx;
  const dt = SIM_DT;

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.cooldown > 0) c.cooldown -= dt;
    if (c.startle > 0) c.startle -= dt;
    if (c.yield > 0) c.yield -= dt;
    c.stateT += dt;
    decide(c, px, pz, t);
  }

  // ── Crowd control ────────────────────────────────────────────────────
  // Only the nearest MAX_APPROACHERS may close in; everyone else holds.
  let near = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.state === 'approach' || c.state === 'greet') near++;
  }
  if (near > MAX_APPROACHERS) {
    // Deterministic: farthest first, ties broken by index.
    const idx = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].state === 'approach' || list[i].state === 'greet') idx.push(i);
    }
    idx.sort((a, b) => (list[b].dist2 - list[a].dist2) || (a - b));
    for (let k = 0; k < idx.length - MAX_APPROACHERS; k++) {
      const c = list[idx[k]];
      c.state = 'alert';
      c.vx = 0; c.vz = 0;
      c.yield = 1.2;
    }
  }

  // Escape arc: whoever is crowding the player must all fit in one wedge.
  const crowd = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].dist2 <= CROWD_R * CROWD_R) crowd.push(i);
  }
  if (crowd.length > 1) {
    const bearings = crowd.map((i) => Math.atan2(list[i].z - pz, list[i].x - px));
    let guard = crowd.length;
    while (guard-- > 0 && crowd.length > 1 && largestAngularGap(bearings) < ESCAPE_ARC) {
      // Drop the farthest crowder — it is the one with the least claim to
      // be there, and removing it is what re-opens the widest wedge.
      let worst = 0;
      for (let k = 1; k < crowd.length; k++) {
        const a = list[crowd[k]], b = list[crowd[worst]];
        if (a.dist2 > b.dist2 || (a.dist2 === b.dist2 && crowd[k] < crowd[worst])) worst = k;
      }
      const c = list[crowd[worst]];
      c.state = 'alert';
      c.yield = 1.6;
      // Push it gently outward so it actually leaves the ring.
      const d = Math.sqrt(c.dist2) || 1;
      c.vx = ((c.x - px) / d) * TEMPERAMENTS[c.temperament].speed * 0.6;
      c.vz = ((c.z - pz) / d) * TEMPERAMENTS[c.temperament].speed * 0.6;
      crowd.splice(worst, 1);
      bearings.splice(worst, 1);
    }
  }

  // ── Integrate ────────────────────────────────────────────────────────
  const ground = ctx.ground;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const nx = c.x + c.vx * dt;
    const nz = c.z + c.vz * dt;
    // Leash + land test. Both are cheap enough to run every tick for the
    // whole population and both are what stop a chase turning into a swim.
    const lx = nx - c.hx, lz = nz - c.hz;
    const leash = c.homeR * LEASH_SLACK;
    const okLeash = lx * lx + lz * lz <= leash * leash;
    const okLand = !ground || ground(nx, nz) > MIN_LAND_Y;
    if (okLeash && okLand) {
      c.x = nx;
      c.z = nz;
      c.moving = c.vx !== 0 || c.vz !== 0;
    } else {
      // Blocked: turn for home rather than grinding against the invisible
      // wall, which is the difference between "it lives here" and "it is stuck".
      c.vx = 0; c.vz = 0;
      c.moving = false;
      c.targetYaw = Math.atan2(c.hx - c.x, c.hz - c.z);
    }
    c.yaw += angleDelta(c.yaw, c.targetYaw) * Math.min(1, c.turn * dt);
    c.dist2 = (px - c.x) * (px - c.x) + (pz - c.z) * (pz - c.z);
  }

  // ── Contact ──────────────────────────────────────────────────────────
  let lock = ctx.lock > 0 ? ctx.lock - dt : 0;
  if (ctx.encountersOn && lock <= 0) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.enemyId || c.cooldown > 0) continue;
      if (c.dist2 > CONTACT_R * CONTACT_R) continue;
      c.cooldown = ENCOUNTER_COOLDOWN;
      c.state = 'idle';
      c.startle = STARTLE_TIME;
      lock = GLOBAL_ENCOUNTER_LOCK;
      ctx.hooks?.onEncounter?.(c.enemyId, {
        speciesId: c.speciesId, creatureId: c.id, floor: c.floor,
        biome: c.biome, x: c.x, z: c.z,
      });
      break;
    }
  }
  return lock;
}

// ── Placement ───────────────────────────────────────────────────────────

/** Keep-out discs: gates, buildings and the spawn all want elbow room. */
function buildKeepOut() {
  const out = [];
  for (const p of PORTALS) out.push([p.x, p.z, 9]);
  for (const b of BUILDINGS) out.push([b.x, b.z, 9]);
  out.push([SPAWN.x, SPAWN.z, 8]);
  return out;
}

function blocked(keepOut, x, z) {
  for (let i = 0; i < keepOut.length; i++) {
    const k = keepOut[i];
    const dx = x - k[0], dz = z - k[1];
    if (dx * dx + dz * dz < k[2] * k[2]) return true;
  }
  return false;
}

/**
 * Choose a home for one creature inside its floor's biome.
 * Rejection-sampled against water, cliffs and the keep-out discs; falls back
 * to the biome centre so a species can never silently fail to appear.
 */
function pickHome(hf, biome, keepOut, rnd) {
  for (let tries = 0; tries < 40; tries++) {
    const a = rnd() * TAU;
    // sqrt keeps the scatter area-uniform instead of clumping at the centre;
    // the 0.28 floor keeps creatures off the portal that sits on the crown.
    const r = biome.radius * (0.28 + Math.sqrt(rnd()) * 0.62);
    const x = biome.center[0] + Math.cos(a) * r;
    const z = biome.center[1] + Math.sin(a) * r;
    if (Math.abs(x) > WORLD.HALF - 12 || Math.abs(z) > WORLD.HALF - 12) continue;
    if (hf.sampleHeight(x, z) < MIN_LAND_Y + 0.6) continue;
    if (hf.sampleNormal(x, z)[1] < 0.86) continue;   // ~31 deg: creatures need footing
    if (blocked(keepOut, x, z)) continue;
    return [x, z];
  }
  return [biome.center[0], biome.center[1]];
}

// ── The view ────────────────────────────────────────────────────────────

// Per-frame scratch. Nothing in update() may allocate.
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _eul = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Bake one species into a geometry, normalised so its feet are at y=0 and its
 * total height is exactly `spec.height` metres. Authoring in canvas units and
 * normalising here is what lets a silhouette be transcribed from the 2D art
 * without anyone having to do the arithmetic twice.
 */
function buildSpeciesGeometry(spec) {
  const s = sink(false);
  spec.build(s);
  const geo = bake(s);
  const bb = geo.boundingBox;
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  const k = spec.height / h;
  geo.scale(k, k, k);
  geo.translate(
    -(bb.min.x + bb.max.x) * 0.5 * k,
    -bb.min.y * k,
    -(bb.min.z + bb.max.z) * 0.5 * k,
  );
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * The animator. Pure function of (creature, simTime) writing into the shared
 * scratch — hop height, squash-and-stretch and the startle pop all live here
 * so the sim stays about intent and this stays about charm.
 *
 * Squash conserves volume (x/z scale by 1/sqrt of the y scale), which is the
 * one rule that separates a bouncing character from a wobbling blob.
 */
function poseCreature(c, t, groundY) {
  const ph = (t * c.rate + c.phase) % 1;
  let lift = 0;
  let sy = 1;
  switch (c.gait) {
    case 'hop': {
      const air = c.moving || c.state === 'approach' ? 1 : 0.42;
      lift = Math.max(0, Math.sin(ph * Math.PI)) * c.hopH * air;
      sy = 1 + Math.sin(ph * TAU - 0.7) * 0.18 * air;
      break;
    }
    case 'crawl':
      lift = Math.abs(Math.sin(ph * TAU)) * c.hopH * 0.6;
      sy = 1 + Math.sin(ph * TAU) * 0.12;
      break;
    case 'walk':
      lift = Math.abs(Math.sin(ph * TAU)) * c.hopH;
      sy = 1 + Math.sin(ph * 2 * TAU) * 0.055;
      break;
    case 'scuttle':
      lift = Math.abs(Math.sin(ph * TAU * 2)) * c.hopH;
      sy = 1 + Math.sin(ph * TAU) * 0.05;
      break;
    case 'roll':
      lift = c.hopH * (0.5 + 0.5 * Math.sin(ph * TAU));
      sy = 1 + Math.sin(ph * TAU + 1.1) * 0.09;
      break;
    case 'swim':
    case 'float':
    case 'bob':
      lift = c.hopH * (0.6 + 0.5 * Math.sin(ph * TAU));
      sy = 1 + Math.sin(ph * TAU * 0.5) * 0.05;
      break;
    case 'flap':
      lift = c.hopH * (0.7 + 0.5 * Math.sin(ph * TAU));
      sy = 1 + Math.sin(ph * TAU) * 0.09;
      break;
    case 'spin':
      lift = c.hopH * (0.6 + 0.4 * Math.sin(ph * TAU));
      sy = 1;
      break;
    default:
      break;
  }
  // Startle: a fast vertical pop that decays. One cue, strongly read, and it
  // is the moment the creature acknowledges the child exists.
  if (c.startle > 0) {
    const k = c.startle / STARTLE_TIME;
    lift += k * k * 0.16;
    sy += k * 0.22;
  }
  const sxz = 1 / Math.sqrt(Math.max(0.2, sy));
  _pos.set(c.x, groundY + lift, c.z);
  _eul.set(0, c.gait === 'spin' ? c.yaw + t * 1.6 : c.yaw, 0);
  _quat.setFromEuler(_eul);
  _scl.set(sxz, sy, sxz);
  _m.compose(_pos, _quat, _scl);
  return lift;
}

/**
 * Populate the island.
 *
 * @param {object} heightfield READ-ONLY: sampleHeight / sampleNormal / biomeAt
 * @param {object} [opts] { seed, hooks, castShadow, perSpecies }
 * @returns {{ group:THREE.Group, creatures:Array, ambient:Array, stats:object,
 *             setEncountersEnabled:Function, update:Function, dispose:Function }}
 */
export function createCreatures(heightfield, opts = {}) {
  const seed = opts.seed ?? (WORLD.SEED ^ 0x63726561);
  const perSpecies = opts.perSpecies ?? 2;
  const castShadow = opts.castShadow !== false;
  const hooks = opts.hooks || {};
  const rnd = makeRng(seed);
  const keepOut = buildKeepOut();

  const group = new THREE.Group();
  group.name = 'creatures';

  // One material for the whole bestiary: every colour is already in the
  // vertex stream, so 30 species cost one shader program, not thirty.
  const bodyMat = papercutMaterial(0xffffff, {
    vertexColors: true,
    space: 'local',
    scale: 0.35,
    grain: 0.055,
    normal: 0.07,
    bleach: 0.05,
  });

  const disposables = [bodyMat];
  const meshes = [];        // { spec, mesh, list }
  const creatures = [];     // hostile, simulated
  const ambient = [];       // analytic drifters

  let triangles = 0;
  const trisBySpecies = {};

  // ── Hostile roster ───────────────────────────────────────────────────
  for (const spec of SPECIES) {
    const geo = buildSpeciesGeometry(spec);
    disposables.push(geo);
    const tris = geo.attributes.position.count / 3;
    trisBySpecies[spec.id] = tris;

    const biome = biomeForFloor(spec.floor) || BIOMES[0];
    const list = [];
    for (let i = 0; i < perSpecies; i++) {
      const [hx, hz] = pickHome(heightfield, biome, keepOut, rnd);
      const tm = TEMPERAMENTS[spec.temperament];
      list.push({
        id: `${spec.id}-${i}`,
        speciesId: spec.id,
        enemyId: spec.enemyId,
        floor: spec.floor,
        biome: biome.id,
        x: hx, z: hz, hx, hz,
        homeR: 5 + rnd() * 4,
        tx: hx, tz: hz,
        yaw: rnd() * TAU, targetYaw: 0, turn: 3.4,
        vx: 0, vz: 0, moving: false, resting: false,
        state: 'idle', stateT: 0, startle: 0, cooldown: 0, yield: 0,
        dist2: Infinity,
        seed: (Math.floor(rnd() * 0x7fffffff)) | 0,
        phase: rnd(),
        wanderPeriod: 3.4 + rnd() * 3.2,
        wanderBucket: -1,
        temperament: spec.temperament,
        gait: spec.gait,
        hopH: spec.hopH,
        rate: spec.rate * (0.9 + rnd() * 0.2),
        speed: tm.speed,
      });
    }
    creatures.push(...list);
    triangles += tris * list.length;

    const mesh = new THREE.InstancedMesh(geo, bodyMat, list.length);
    mesh.name = `creature-${spec.id}`;
    mesh.frustumCulled = false;   // we cull by distance ourselves, per instance
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;   // a creature standing in tree shade must darken with it
    mesh.count = 0;
    group.add(mesh);
    meshes.push({ spec, mesh, list, ambient: false });
  }

  // ── Ambient life ─────────────────────────────────────────────────────
  // Butterflies ride the meadow and garden; bunnies graze the gentle biomes;
  // fish leap in the shallows just off the beach.
  const softBiomes = BIOMES.filter((b) => ['garden', 'meadow', 'market', 'frost'].includes(b.id));
  for (const spec of AMBIENT) {
    const geo = buildSpeciesGeometry(spec);
    disposables.push(geo);
    trisBySpecies[spec.id] = geo.attributes.position.count / 3;
    const list = [];
    for (let i = 0; i < spec.count; i++) {
      let x, z, y;
      if (spec.kind === 'leap') {
        // Shallows: walk outward from a random bearing until the ground drops
        // just under the waterline. Deterministic and needs no water mesh.
        const a = rnd() * TAU;
        let r = WORLD.HALF * 0.42;
        for (let k = 0; k < 90; k++) {
          const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
          if (heightfield.sampleHeight(hx, hz) < WORLD.WATER_Y - 0.15) break;
          r += 1.6;
        }
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = WORLD.WATER_Y;
      } else {
        const b = softBiomes[Math.floor(rnd() * softBiomes.length)] || BIOMES[0];
        const [ax, az] = pickHome(heightfield, b, keepOut, rnd);
        x = ax; z = az; y = heightfield.sampleHeight(ax, az);
      }
      list.push({
        id: `${spec.id}-${i}`, speciesId: spec.id, kind: spec.kind,
        x, z, y, hx: x, hz: z,
        r: 1.6 + rnd() * 3.4,
        rate: 0.25 + rnd() * 0.5,
        phase: rnd(),
        lift: spec.kind === 'flit' ? 0.7 + rnd() * 1.4 : 0,
        yaw: rnd() * TAU,
      });
    }
    ambient.push(...list);
    triangles += trisBySpecies[spec.id] * list.length;

    const mesh = new THREE.InstancedMesh(geo, bodyMat, list.length);
    mesh.name = `ambient-${spec.id}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    group.add(mesh);
    meshes.push({ spec, mesh, list, ambient: true });
  }

  // ── One shared contact shadow ────────────────────────────────────────
  // A soft teal disc under every walking thing. It is the single strongest
  // altitude cue a child has when a creature hops, and one InstancedMesh
  // serves the whole population for one draw call.
  const shadowGeo = new THREE.CircleGeometry(0.5, 12);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: PAPER.shadow, transparent: true, opacity: 0.24,
    depthWrite: false, fog: true,
  });
  disposables.push(shadowGeo, shadowMat);
  const groundShadows = new THREE.InstancedMesh(shadowGeo, shadowMat, creatures.length + ambient.length);
  groundShadows.name = 'creature-shadows';
  groundShadows.frustumCulled = false;
  groundShadows.renderOrder = 1;
  groundShadows.count = 0;
  group.add(groundShadows);

  // Ground height is resampled lazily — sampleHeight is not free and a
  // creature that has not moved has not changed altitude.
  for (const c of creatures) c.groundY = heightfield.sampleHeight(c.x, c.z);

  let simTime = 0;
  let accum = 0;
  let lock = 0;
  let encountersOn = opts.encountersEnabled !== false;
  const ctx = { px: 0, pz: 0, t: 0, ground: heightfield.sampleHeight, hooks, encountersOn, lock: 0 };

  const stats = {
    species: SPECIES.length,
    ambientSpecies: AMBIENT.length,
    creatures: creatures.length,
    ambient: ambient.length,
    triangles,
    trisBySpecies,
    maxSpeciesTriangles: Math.max(...Object.values(trisBySpecies)),
    // Worst case, everything in range at once — unreachable in practice: the
    // nine biomes sit ~300 m apart on a 480 m island and CULL_R is 95 m, so a
    // frame only ever touches two or three of them. Measured on the shipped
    // layout, standing at any biome centre: 5-10 species meshes + the shared
    // shadow disc, 14-63 instances, ~11-25 k triangles.
    drawCalls: meshes.length + 1,
    drawCallsTypical: 11,
    shadowPassCalls: SPECIES.length,
    materials: 2,
    /** Live: meshes actually submitted by the last draw(). */
    get visibleMeshes() {
      let n = groundShadows.visible ? 1 : 0;
      for (let i = 0; i < meshes.length; i++) if (meshes[i].mesh.visible) n++;
      return n;
    },
  };

  /**
   * Advance the population. Belongs on the host's FIXED step, beside the
   * player controller — it re-accumulates internally anyway, so a variable dt
   * is safe, but keeping the two on the same clock is what makes "the creature
   * reached me" agree with "I reached the creature".
   *
   * @param {number} dt seconds
   * @param {THREE.Vector3|{x,z}} playerPos
   */
  function step(dt, playerPos) {
    const px = playerPos.x, pz = playerPos.z;
    // Identical results regardless of frame rate, and the step budget stops a
    // stalled tab from simulating a minute of wandering in one frame.
    accum += Math.min(0.25, Math.max(0, dt));
    let steps = 0;
    while (accum >= SIM_DT && steps < MAX_STEPS) {
      simTime += SIM_DT;
      ctx.px = px; ctx.pz = pz; ctx.t = simTime;
      ctx.encountersOn = encountersOn;
      ctx.lock = lock;
      lock = stepSim(creatures, ctx);
      accum -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS) accum = 0;
  }

  /**
   * Pose and cull. Reads the ANIMATION clock, which the screenshot harness
   * pins to a constant — so a frozen pose reproduces to the pixel while the
   * sim state stays exactly where the step loop left it.
   *
   * @param {number} t animation clock (seconds)
   * @param {THREE.Vector3|{x,z}} playerPos
   */
  function draw(t, playerPos) {
    const px = playerPos.x, pz = playerPos.z;
    let shadowN = 0;
    for (let mi = 0; mi < meshes.length; mi++) {
      const entry = meshes[mi];
      const list = entry.list;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const dx = c.x - px, dz = c.z - pz;
        if (dx * dx + dz * dz > CULL_R2) continue;

        let lift;
        if (entry.ambient) {
          lift = poseAmbient(c, t, heightfield);
        } else {
          if (c.moving) c.groundY = heightfield.sampleHeight(c.x, c.z);
          lift = poseCreature(c, t, c.groundY);
        }
        entry.mesh.setMatrixAt(n++, _m);

        // Contact shadow: shrinks and fades as the creature leaves the ground.
        if (!entry.ambient || c.kind === 'hop') {
          const base = entry.ambient ? c.y : c.groundY;
          const k = Math.max(0.45, 1 - lift * 1.5);
          _pos.set(c.x, base + 0.035, c.z);
          _quat.identity();
          const w = (entry.spec.height || 0.6) * 1.15 * k;
          _scl.set(w, 1, w);
          _m.compose(_pos, _quat, _scl);
          groundShadows.setMatrixAt(shadowN++, _m);
        }
      }
      entry.mesh.count = n;
      entry.mesh.visible = n > 0;
      if (n > 0) entry.mesh.instanceMatrix.needsUpdate = true;
    }
    groundShadows.count = shadowN;
    groundShadows.visible = shadowN > 0;
    if (shadowN > 0) groundShadows.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    group.clear();
    for (const d of disposables) d.dispose();
    creatures.length = 0;
    ambient.length = 0;
    meshes.length = 0;
  }

  return {
    group,
    creatures,
    ambient,
    stats,
    /** Suspend contact encounters (e.g. while a battle transition plays). */
    setEncountersEnabled(on) { encountersOn = !!on; },
    /** Current sim clock, for save/debug. */
    get simTime() { return simTime; },
    step,
    draw,
    /** step + draw in one call, for tests and any host without a split loop. */
    update(dt, t, playerPos) { step(dt, playerPos); draw(t, playerPos); },
    dispose,
  };
}

/**
 * Ambient motion, analytic and stateless: butterflies orbit a home point on a
 * lissajous, bunnies hop a small circuit, fish arc out of the shallows and
 * back. No sim record, no branching AI — they exist to be alive in the corner
 * of the frame, and anything cleverer would cost more than it shows.
 */
function poseAmbient(c, t, hf) {
  const ph = t * c.rate + c.phase * TAU;
  let lift = 0, yaw = c.yaw, sy = 1;
  if (c.kind === 'flit') {
    c.x = c.hx + Math.cos(ph) * c.r;
    c.z = c.hz + Math.sin(ph * 1.37) * c.r;
    lift = c.lift + Math.sin(ph * 2.3) * 0.35;
    yaw = ph * 1.2;
    // Wingbeat, faked with a hard x-squash — the wings are the silhouette.
    sy = 1 + Math.sin(t * 11 + c.phase * TAU) * 0.05;
    _pos.set(c.x, c.y + lift, c.z);
    _eul.set(0, yaw, Math.sin(t * 11 + c.phase * TAU) * 0.5);
    _quat.setFromEuler(_eul);
    const w = 0.45 + Math.abs(Math.cos(t * 11 + c.phase * TAU)) * 0.55;
    _scl.set(w, sy, 1);
    _m.compose(_pos, _quat, _scl);
    return lift;
  }
  if (c.kind === 'hop') {
    const hop = (t * c.rate * 1.6 + c.phase) % 1;
    const travel = Math.floor(t * c.rate * 1.6 + c.phase);
    const a = hash01(travel, Math.floor(c.hx * 7)) * TAU;
    c.x = c.hx + Math.cos(a) * c.r * 0.6;
    c.z = c.hz + Math.sin(a) * c.r * 0.6;
    c.y = hf.sampleHeight(c.x, c.z);
    lift = Math.max(0, Math.sin(hop * Math.PI)) * 0.24;
    sy = 1 + Math.sin(hop * TAU - 0.7) * 0.2;
    yaw = a;
  } else {
    // leap: mostly submerged, breaching on a slow cycle.
    const leap = (t * c.rate * 0.5 + c.phase) % 1;
    const arc = Math.max(0, Math.sin(leap * Math.PI * 3 - Math.PI * 2));
    lift = arc * 0.85 - 0.18;
    yaw = c.yaw + leap * 0.6;
    sy = 1;
  }
  const sxz = 1 / Math.sqrt(Math.max(0.2, sy));
  _pos.set(c.x, c.y + lift, c.z);
  _eul.set(c.kind === 'leap' ? -0.9 + (t * c.rate * 0.5 + c.phase) % 1 * 1.8 : 0, yaw, 0);
  _quat.setFromEuler(_eul);
  _scl.set(sxz, sy, sxz);
  _m.compose(_pos, _quat, _scl);
  return lift;
}
