/**
 * Boss lairs — nine papercut landmarks that give the island its skyline.
 *
 * WHY THIS EXISTS
 * The hub had nine portals and nothing else to walk toward. A portal is 9 m of
 * arch: it does not read from across a 480 m island, so from anywhere but the
 * gate's own doorstep the world was terrain with no destinations in it. A child
 * who cannot see where to go does not explore, they wander.
 *
 * So each biome grows one enormous structure on its high ground, silhouetted
 * against the sky, and each one is a picture of the boss who waits below it: the
 * Briar King's thorn crown over the garden meadow, the Pressure's sunken basin
 * at the tideline, the Theorem's manuscript spire on the palace summit. They are
 * signposts made of shape alone — you can identify all nine from a black cutout,
 * which is the only test of a landmark that matters.
 *
 * ── THE FOUR RULES EVERY LAIR OBEYS ────────────────────────────────────────
 *
 * 1. SILHOUETTE FIRST. Each lair splits into a `far` buffer (the masses that
 *    make the shape) and a `near` buffer (trim, ribbing, ruled lines, scattered
 *    debris). `far` is always resident; `near` switches on inside DETAIL_RANGE.
 *    That is a real LOD — it is also the discipline that stops detail being
 *    added where the shape should have been.
 *
 * 2. IT SITS ON THE GROUND. Every lair stands on a stepped plinth whose lowest
 *    step is buried, and the whole group is placed at the MINIMUM terrain height
 *    around its footprint. Neither of those is optional on authored terrain: a
 *    landmark placed at its centre sample floats one side and buries the other
 *    on any slope at all, and a floating landmark is a bug the eye finds
 *    instantly.
 *
 * 3. ESCALATION IS THE POINT. The nine are deliberately not equal. Floors 1-4
 *    run 19-24 m; 5-8 run 21-25 m and gain a second structural idea each; floor
 *    9 is 46 m tall, carries three armillary rings and an unfinished golden
 *    proof, and costs more triangles than the four garden-side lairs combined.
 *    The final boss must be the most spectacular thing in the game, and the
 *    landmark says so before the child ever fights him.
 *
 * 4. PALETTE LAW. Every colour is a PAPER token. Shades are the same token
 *    multiplied down (geobuild's `lin`), never a new darker invention, so a
 *    lair can no more drift out of palette than a tree can. Nothing is black,
 *    nothing is grey, and the deepest value anywhere is PAPER.inkTeal.
 *
 * ── THE APPROACH BEAT ──────────────────────────────────────────────────────
 * createLairTracker is a pure hysteresis state machine over the nine circles:
 * it fires ENTER once when the player crosses a lair's `near` radius and LEAVE
 * once when they pass 1.3x it, so a player standing on the boundary cannot
 * machine-gun the music swell. index.js drives it from the fixed step and calls
 * hooks.onLairNear(floorId, lair) — the app swells the score and shows the name
 * card. Pure, allocation-free, and unit-tested, because a hook that double-fires
 * is a hook that stutters the music.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth reads, no
 * fwidth, one shared material per pass across all nine lairs, zero allocation in
 * update(), dispose() releases everything.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { toonMaterial, applyPapercut } from './materials/toon.js';
import { sink, stamp, bake, lin, trs } from './geobuild.js';

const TAU = Math.PI * 2;

/** Detail buffers switch on inside this range, metres. */
export const DETAIL_RANGE = 95;
/** Glow buffers switch on inside this range — they are small and read late. */
export const GLOW_RANGE = 150;
/** Leave hysteresis: the approach beat clears at this multiple of `near`. */
export const LEAVE_SCALE = 1.3;

/**
 * The nine lairs.
 *
 * Sites were chosen by sweeping each biome for high, walkable, flat-enough
 * ground that clears every portal pad, collectible, building, the spawn, the
 * authored roads and — critically — the two spiral climb ramps, because a
 * landmark parked on the only route up Sky Cliffs would make floor 3
 * unreachable. `near` is the approach radius; `foot` is the footprint the
 * placement levels against; `collider` is the walk-around radius handed to the
 * collision world (a solid you can stroll through is not a solid).
 *
 *   yaw     rotates the lair's "front" toward its own floor's portal, so the
 *           dramatic face is the one you see while walking to the gate.
 */
export const LAIRS = [
  {
    floorId: 1, bossId: 'briarking', biomeId: 'garden',
    name: 'The Thorn Crown', boss: 'The Briar King',
    x: 46, z: 130, yaw: -1.298, near: 42, foot: 8.5, collider: 5.4, height: 19,
    pal: {
      deep: PAPER.forestD, mid: PAPER.forest, lite: PAPER.leaf,
      stone: PAPER.sand, trim: PAPER.coralD, glow: PAPER.peach,
    },
  },
  {
    floorId: 2, bossId: 'pressure', biomeId: 'tidepool',
    name: 'The Sunken Basin', boss: 'The Pressure',
    // `lift` raises the whole landmark off its footing. The basin is the one
    // lair whose mass goes DOWN, so placing it on the ground would put its rim
    // under the tideline and delete it; 3.6 m puts the eye below sea level and
    // the rim proudly above it.
    x: 177, z: 100, yaw: -1.051, near: 42, foot: 8, lift: 3.6, collider: 4.2, height: 15,
    pal: {
      deep: PAPER.inkTeal, mid: PAPER.tealD, lite: PAPER.teal,
      stone: PAPER.tealL, trim: PAPER.sky, glow: PAPER.tealL,
    },
  },
  {
    floorId: 3, bossId: 'skywhale', biomeId: 'sky',
    name: 'The Rib Vault', boss: 'the Skywhale',
    x: 160, z: 8, yaw: -2.678, near: 44, foot: 8, collider: 3.6, height: 21,
    pal: {
      deep: PAPER.tealD, mid: PAPER.sand, lite: PAPER.cream,
      stone: PAPER.creamD, trim: PAPER.teal, glow: PAPER.sky,
    },
  },
  {
    floorId: 4, bossId: 'pyroclast', biomeId: 'ember',
    name: 'The Cinder Spire', boss: 'Pyroclast',
    x: 132, z: -99, yaw: -2.451, near: 42, foot: 8.5, collider: 5.0, height: 23,
    pal: {
      deep: PAPER.coralD, mid: PAPER.coral, lite: PAPER.peach,
      stone: PAPER.sand, trim: PAPER.orange, glow: PAPER.gold,
    },
  },
  {
    floorId: 5, bossId: 'absolutezero', biomeId: 'frost',
    name: 'The Frozen Vault', boss: 'Absolute Zero',
    x: 31, z: -117, yaw: -2.532, near: 45, foot: 9.5, collider: 3.2, height: 22,
    pal: {
      deep: PAPER.tealD, mid: PAPER.tealL, lite: PAPER.white,
      stone: PAPER.cream, trim: PAPER.sky, glow: PAPER.sky,
    },
  },
  {
    floorId: 6, bossId: 'theprism', biomeId: 'crystal',
    name: 'The Facet', boss: 'The Prism',
    x: -125, z: -125, yaw: 0.909, near: 45, foot: 8, collider: 4.0, height: 23,
    pal: {
      deep: PAPER.lavenderD, mid: PAPER.lavender, lite: PAPER.white,
      stone: PAPER.cream, trim: PAPER.gold, glow: PAPER.tealL,
    },
  },
  {
    floorId: 7, bossId: 'counterfeiter', biomeId: 'market',
    name: 'The Crooked Mint', boss: 'The Counterfeiter',
    x: -164, z: 49, yaw: 2.752, near: 44, foot: 8.5, collider: 4.4, height: 21,
    pal: {
      deep: PAPER.coralD, mid: PAPER.orange, lite: PAPER.gold,
      stone: PAPER.sand, trim: PAPER.creamD, glow: PAPER.gold,
    },
  },
  {
    floorId: 8, bossId: 'theparadox', biomeId: 'library',
    name: 'The Impossible Stair', boss: 'The Paradox',
    x: -93, z: 135, yaw: -2.219, near: 46, foot: 9, collider: 4.0, height: 24,
    pal: {
      deep: PAPER.coralD, mid: PAPER.sand, lite: PAPER.cream,
      stone: PAPER.creamD, trim: PAPER.coral, glow: PAPER.coral,
    },
  },
  {
    floorId: 9, bossId: 'theorem', biomeId: 'palace',
    name: 'The Manuscript Spire', boss: 'The Theorem',
    x: 0, z: 8, yaw: Math.PI, near: 52, foot: 9, collider: 6.2, height: 46,
    pal: {
      deep: PAPER.lavenderD, mid: PAPER.lavender, lite: PAPER.cream,
      stone: PAPER.sand, trim: PAPER.gold, glow: PAPER.gold,
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Pure approach logic — the tested half. No three, no scene.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The lair the point is inside, or null. Ties break on the closer centre, so
 * two overlapping approach circles can never both claim the player.
 * @returns {object|null}
 */
export function nearestLair(x, z, lairs = LAIRS, scale = 1) {
  let best = null;
  let bestD2 = Infinity;
  for (const l of lairs) {
    const dx = x - l.x;
    const dz = z - l.z;
    const d2 = dx * dx + dz * dz;
    const r = l.near * scale;
    if (d2 <= r * r && d2 < bestD2) { best = l; bestD2 = d2; }
  }
  return best;
}

/**
 * Hysteresis state machine over the nine approach circles.
 *
 * WHY HYSTERESIS AND NOT A PLAIN RADIUS TEST: the music swell and the name card
 * are one-shot events, and a plain test fires them on every frame the player
 * spends jittering across the boundary — which is exactly where a player who is
 * deciding whether to go in stands. Entering uses `near`; leaving needs
 * LEAVE_SCALE x near, so the two thresholds cannot alias.
 *
 * `step` returns an interned string (or null) rather than an object, so driving
 * it from the fixed step allocates nothing.
 *
 * @param {object[]} [lairs]
 * @param {{leaveScale?:number}} [opts]
 */
export function createLairTracker(lairs = LAIRS, opts = {}) {
  const leaveScale = opts.leaveScale ?? LEAVE_SCALE;
  let current = null;
  let previous = null;

  return {
    get current() { return current; },
    get previous() { return previous; },
    /**
     * @returns {'enter'|'leave'|'switch'|null} what happened this step
     */
    step(x, z) {
      previous = current;
      if (current) {
        // Still inside the (widened) circle we already announced?
        const dx = x - current.x;
        const dz = z - current.z;
        const r = current.near * leaveScale;
        if (dx * dx + dz * dz <= r * r) {
          // Unless a TIGHTER lair now claims us — two lairs' circles can touch
          // on the frost/garden seam, and the nearer one should win.
          const inner = nearestLair(x, z, lairs);
          if (inner && inner !== current) { current = inner; return 'switch'; }
          return null;
        }
        const next = nearestLair(x, z, lairs);
        current = next;
        return next ? 'switch' : 'leave';
      }
      const found = nearestLair(x, z, lairs);
      if (!found) return null;
      current = found;
      return 'enter';
    },
    reset() { current = null; previous = null; },
  };
}

/** Look a lair up by its floor id. */
export function lairForFloor(floorId, lairs = LAIRS) {
  return lairs.find((l) => l.floorId === floorId) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometry kit
// ═══════════════════════════════════════════════════════════════════════════

/** Relative layer shade of a palette token — never a new colour. */
const T = (hex, shade = 1) => lin(hex, shade);

function box(s, w, h, d, x, y, z, rx, ry, rz, tone) {
  stamp(s, new THREE.BoxGeometry(w, h, d), trs(x, y, z, rx, ry, rz), tone);
}
function cyl(s, rTop, rBot, h, seg, x, y, z, tone, rx = 0, ry = 0, rz = 0) {
  stamp(s, new THREE.CylinderGeometry(rTop, rBot, h, seg), trs(x, y, z, rx, ry, rz), tone);
}
function cone(s, r, h, seg, x, y, z, tone, rx = 0, ry = 0, rz = 0) {
  stamp(s, new THREE.ConeGeometry(r, h, seg), trs(x, y, z, rx, ry, rz), tone);
}
function orb(s, r, x, y, z, tone, wseg = 7, hseg = 5) {
  stamp(s, new THREE.SphereGeometry(r, wseg, hseg), trs(x, y, z), tone);
}

/**
 * Extruded polygon — the papercut primitive. `pts` is authored in the outline's
 * own XY plane and extruded along local +Z, which is how every cut shape in this
 * world is made (see props.js / characterView.js).
 */
function prism(s, pts, depth, x, y, z, rx, ry, rz, tone, sx = 1, sy = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  stamp(s, geo, trs(x, y, z, rx, ry, rz, sx, sy, 1), tone);
}

/**
 * Place something on a ring at bearing `a`, leaning OUTWARD by `tilt`.
 *
 * three's default Euler order is XYZ, i.e. Rz runs first and Ry second, so a
 * lean about Z followed by a yaw of -a sends the lean out along the bearing.
 * Every crown, colonnade and spoke in this file is placed through this, which
 * is the only reason nine radial structures fit in a readable amount of code.
 */
function ringAt(a, r, y, tilt = 0) {
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, ry: -a, rz: tilt };
}

const _fv = new THREE.Vector3();
/**
 * A soft radial glow, as a triangle fan with alpha ramping centre -> rim.
 *
 * No texture, no derivatives, no billboarding: the falloff is in the vertex
 * alpha, which is the same trick props.js uses for the portal page. `m` places
 * the disc, which is authored in its own XY plane.
 */
function fanDisc(s, m, r, seg, rgb, aC, aR) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU;
    const a1 = ((i + 1) / seg) * TAU;
    const p = [[0, 0], [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]];
    const al = [aC, aR, aR];
    for (let k = 0; k < 3; k++) {
      _fv.set(p[k][0], p[k][1], 0).applyMatrix4(m);
      s.pos.push(_fv.x, _fv.y, _fv.z);
      s.nrm.push(0, 1, 0);
      s.col.push(rgb[0], rgb[1], rgb[2], al[k]);
    }
  }
}

/** Horizontal ground halo, lying just above the plinth. */
function halo(s, r, y, rgb, aC = 0.34, aR = 0) {
  fanDisc(s, trs(0, y, 0, -Math.PI / 2, 0, 0), r, 18, rgb, aC, aR);
}

/** A glowing point light source, as a low-poly translucent ball. */
function spark(s, r, x, y, z, rgb, a = 0.62) {
  const geo = new THREE.SphereGeometry(r, 6, 4);
  const ni = geo.toNonIndexed();
  const p = ni.attributes.position.array;
  const n = ni.attributes.normal.array;
  const m = trs(x, y, z);
  for (let i = 0; i < p.length; i += 3) {
    _fv.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
    s.pos.push(_fv.x, _fv.y, _fv.z);
    s.nrm.push(n[i], n[i + 1], n[i + 2]);
    s.col.push(rgb[0], rgb[1], rgb[2], a);
  }
  ni.dispose();
  geo.dispose();
}

/**
 * The shared footing. Three stepped discs, the lowest one buried 2.4 m so no
 * slope can lift a corner of the landmark off the ground. Every lair starts
 * with one, which is also what makes them read as one family of objects.
 */
function plinth(s, r, P) {
  footing(s, r, P);
  cyl(s, r * 0.86, r * 0.94, 0.55, 14, 0, 0.42, 0, T(P.stone, 1.08));
  cyl(s, r * 0.72, r * 0.80, 0.45, 12, 0, 0.85, 0, T(P.stone, 0.96));
}

/**
 * The buried terraced footing every lair stands on.
 *
 * WHY IT IS TERRACED AND NOT ONE DEEP CYLINDER: the sites are on real authored
 * terrain, which drops up to ~3.5 m across a 5 m footprint, so SOMETHING has to
 * be buried or the landmark floats its downhill side. A single deep drum solves
 * the floating and creates a new problem — a smooth 4 m pipe emerging from a
 * hillside, which reads as a modelling mistake. Four stepped rings mean that
 * whatever the slope happens to expose reads as retaining terraces, which is
 * what a real monument on a slope actually has. Costs ~190 triangles and it is
 * the reason nine landmarks can be placed on dramatic ground instead of on the
 * flattest ground available.
 */
function footing(s, r, P) {
  cyl(s, r * 1.06, r * 1.10, 2.4, 14, 0, -1.15, 0, T(P.stone, 0.92));
  cyl(s, r * 0.98, r * 1.03, 2.4, 12, 0, -3.4, 0, T(P.stone, 0.84));
  cyl(s, r * 0.88, r * 0.93, 2.6, 12, 0, -5.8, 0, T(P.stone, 0.92));
  cyl(s, r * 0.76, r * 0.80, 3.4, 10, 0, -8.6, 0, T(P.stone, 0.82));
}

/** Fluting / step ribs on a plinth — pure `near` surface, no silhouette change. */
function plinthTrim(s, r, P, count = 14) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const g = ringAt(a, r * 0.90, 0.1);
    box(s, 0.30, 0.9, 0.30, g.x, g.y, g.z, 0, g.ry, 0, T(P.stone, i % 2 ? 1.10 : 0.88));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The nine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FLOOR 1 — THE THORN CROWN.
 * A ring of nine briar spikes bursting out of a knotted stump: the crown the
 * Briar King wears, planted in the meadow at the scale of a building. Alternating
 * spike heights are what make it read as a CROWN and not a fence.
 */
function buildBriarCrown(far, near, glow, P) {
  plinth(far, 8.5, P);
  // Knotted stump: three tapering drums.
  cyl(far, 5.2, 6.4, 2.6, 12, 0, 2.1, 0, T(P.stone, 0.94));
  cyl(far, 3.9, 5.0, 2.4, 12, 0, 4.5, 0, T(P.deep, 1.0));
  cyl(far, 2.8, 3.6, 2.2, 10, 0, 6.6, 0, T(P.mid, 1.05));

  const H = [13.0, 8.2, 11.2, 9.0, 12.4, 8.6, 11.6, 9.4, 12.0];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const h = H[i];
    const g = ringAt(a, 4.6, 6.4 + h * 0.46, 0.20 + (i % 2) * 0.06);
    cone(far, 1.05 + (i % 3) * 0.14, h, 6, g.x, g.y, g.z, T(P.trim, 0.92), 0, g.ry, g.rz);
    // Inner ply: a brighter, thinner spike set a little forward, so each thorn
    // is two values instead of one flat cone.
    cone(near, 0.58 + (i % 3) * 0.08, h * 0.78, 5,
      g.x * 0.98, g.y + h * 0.05, g.z * 0.98, T(PAPER.coral, 1.12), 0, g.ry, g.rz);
    spark(glow, 0.55, g.x * 1.06, 6.4 + h * 0.96, g.z * 1.06, T(P.glow), 0.58);
  }

  // Two briar hoops, woven around the stump. Tangential boxes, alternating ply,
  // so the ring reads as cut segments rather than an extruded tube.
  for (const [ry, rad, n] of [[3.4, 6.4, 12], [6.9, 5.1, 10]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const chord = 2 * rad * Math.sin(Math.PI / n) * 1.12;
      const g = ringAt(a, rad, ry + Math.sin(a * 3) * 0.42);
      box(far, 0.44, 0.50, chord, g.x, g.y, g.z, 0, g.ry, 0,
        T(P.deep, i % 2 ? 1.10 : 0.90));
    }
  }

  // Near: leaves along the hoops, and buttress roots gripping the plinth.
  const leaf = [[0, 0], [0.5, 0.35], [1.05, 0], [0.5, -0.35]];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2;
    const g = ringAt(a, 6.1, 3.6 + (i % 3) * 1.4);
    prism(near, leaf, 0.12, g.x, g.y, g.z, 0, g.ry, 0.5 + (i % 4) * 0.3,
      T(P.lite, 1.0), 1.5, 1.5);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.4;
    const g = ringAt(a, 6.0, 1.1, 0.55);
    cone(near, 0.62, 3.4, 5, g.x, g.y, g.z, T(P.deep, 0.94), 0, g.ry, g.rz);
  }
  plinthTrim(near, 8.5, P, 16);
  halo(glow, 7.4, 1.2, T(P.glow), 0.20, 0);
}

/**
 * FLOOR 2 — THE SUNKEN BASIN.
 * A stepped funnel cut into the tideline with a deep-teal eye at the bottom, and
 * a great spiral shell leaning over the lip. The Pressure lives at the bottom of
 * something; the landmark is therefore the only lair whose main mass goes DOWN,
 * and the leaning whorl exists to give it a silhouette anyway.
 */
function buildSunkenBasin(far, near, glow, P) {
  // A basin is a hole, and a hole still needs a footing to hold it up — this
  // one is buried in exactly the same terraced drum every other lair stands on.
  footing(far, 10.2, P);
  // The funnel: four rings, each smaller and lower than the last.
  for (let k = 0; k < 4; k++) {
    const r = 9.6 - k * 1.55;
    cyl(far, r, r + 0.8, 1.5, 16, 0, 0.7 - k * 1.25, 0, T(P.mid, k % 2 ? 0.90 : 1.06));
  }
  // The eye at the bottom — the deepest value the palette allows.
  cyl(far, 3.7, 4.0, 0.6, 14, 0, -4.6, 0, T(P.deep, 1.0));

  // The whorl: a tapered shell leaning across the basin, wrapped by a helix.
  const WA = 0.9;
  const wg = ringAt(WA, 6.2, 7.6, 0.36);
  cone(far, 4.5, 14.5, 9, wg.x, wg.y, wg.z, T(P.lite, 0.96), 0, wg.ry, wg.rz);
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const rr = 4.2 * (1 - t * 0.86);
    const spin = t * TAU * 2.2;
    // Follow the cone's leaning axis: lift along it, then step out by rr.
    const ax = Math.cos(WA) * Math.sin(0.36);
    const az = Math.sin(WA) * Math.sin(0.36);
    const ay = Math.cos(0.36);
    const s0 = -7.2 + t * 14.5;
    const cx = wg.x + ax * s0 + Math.cos(spin) * rr;
    const cy = wg.y + ay * s0;
    const cz = wg.z + az * s0 + Math.sin(spin) * rr;
    box(far, 0.9, 0.55, 0.9, cx, cy, cz, 0, -spin, 0.3, T(P.stone, i % 2 ? 1.10 : 0.88));
  }

  // Six pressure vanes fanning off the rim: thin tapered fins, arcing outward.
  const fin = [[0, 0], [0.9, 2.6], [0.3, 6.0], [-0.6, 6.4], [-1.1, 2.4], [-0.7, 0]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const g = ringAt(a, 9.0, 1.0, 0.42);
    prism(far, fin, 0.5, g.x, g.y, g.z, 0, g.ry + Math.PI / 2, g.rz,
      T(P.mid, i % 2 ? 1.08 : 0.92), 1.3, 1.25);
  }

  // Near: rim barnacles, step lips, and the ribbed inner wall.
  for (let k = 0; k < 4; k++) {
    const r = 9.6 - k * 1.55;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + k * 0.22;
      const g = ringAt(a, r * 0.97, 1.35 - k * 1.25);
      box(near, 0.34, 0.42, 1.0, g.x, g.y, g.z, 0, g.ry, 0, T(P.stone, i % 2 ? 1.12 : 0.9));
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.7;
    const g = ringAt(a, 9.9, 1.5);
    orb(near, 0.5 + (i % 3) * 0.16, g.x, g.y, g.z, T(P.stone, 1.06), 6, 4);
  }
  // Glow: the deep light in the basin, the whorl's eye, four vane tips.
  halo(glow, 3.9, -4.0, T(P.glow), 0.56, 0);
  spark(glow, 1.15, wg.x * 0.72, wg.y + 6.0, wg.z * 0.72, T(P.trim), 0.62);
  for (let i = 0; i < 6; i += 2) {
    const a = (i / 6) * TAU + 0.3;
    const g = ringAt(a, 10.4, 7.4);
    spark(glow, 0.48, g.x, g.y, g.z, T(P.glow), 0.5);
  }
}

/**
 * FLOOR 3 — THE RIB VAULT.
 * Five bone arches marching away from the cliff edge, a spine of vertebrae along
 * their crowns, and a tail fluke thrown up at the far end: the Skywhale's
 * skeleton, big enough to walk through. Reads as a tunnel from any bearing,
 * which is what makes an arch better skyline than a tower on a plateau that is
 * already the highest ground in the world.
 */
function buildRibVault(far, near, glow, P) {
  plinth(far, 9.5, P);
  const R = [9.4, 8.6, 7.6, 6.6, 5.6];
  for (let k = 0; k < 5; k++) {
    const zz = -8.4 + k * 4.2;
    const rad = R[k];
    const SEG = 9;
    for (let i = 0; i < SEG; i++) {
      const th = Math.PI * (i + 0.5) / SEG;
      const chord = 2 * rad * Math.sin(Math.PI / (2 * SEG)) * 1.18;
      box(far, 1.05, chord, 1.15,
        Math.cos(th) * rad, 1.0 + Math.sin(th) * rad, zz,
        0, 0, th - Math.PI / 2, T(P.lite, i % 2 ? 1.06 : 0.90));
    }
    // Vertebra at the crown of every arch.
    cyl(far, 1.15, 1.15, 1.5, 8, 0, 1.0 + rad + 0.5, zz, T(P.stone, 1.04), Math.PI / 2, 0, 0);
  }
  // Tail fluke: two swept slabs thrown up behind the last arch.
  const fluke = [[0, 0], [3.4, 2.2], [5.6, 6.4], [3.0, 6.0], [0.6, 2.6]];
  for (const side of [-1, 1]) {
    prism(far, fluke, 0.85, side * 1.2, 2.0, 11.6, 0, 0, side > 0 ? 0 : 0,
      T(P.trim, side > 0 ? 1.0 : 0.88), side, 1.35);
  }
  cyl(far, 1.0, 1.7, 6.0, 8, 0, 3.4, 9.4, T(P.stone, 0.98), 0.5, 0, 0);

  // Near: rib ridging, barnacle clusters, hanging lantern rods.
  for (let k = 0; k < 5; k++) {
    const zz = -8.4 + k * 4.2;
    const rad = R[k];
    for (let i = 1; i < 9; i += 2) {
      const th = Math.PI * (i + 0.5) / 9;
      box(near, 0.30, 0.9, 1.35, Math.cos(th) * rad, 1.0 + Math.sin(th) * rad, zz,
        0, 0, th - Math.PI / 2, T(P.stone, 1.1));
    }
    if (k % 2 === 0) {
      const th = Math.PI * 0.30;
      const bx = Math.cos(th) * rad;
      const by = 1.0 + Math.sin(th) * rad;
      orb(near, 0.7, bx, by, zz, T(P.trim, 1.0), 6, 4);
      orb(near, 0.44, bx * 0.9, by - 0.7, zz + 0.5, T(P.stone, 1.08), 6, 4);
      box(near, 0.14, 1.8, 0.14, -bx, by - 1.0, zz, 0, 0, 0, T(P.stone, 0.9));
      spark(glow, 0.62, -bx, by - 2.0, zz, T(P.glow), 0.60);
    }
  }
  plinthTrim(near, 9.5, P, 16);
  halo(glow, 8.0, 1.3, T(P.glow), 0.18, 0);
}

/**
 * FLOOR 4 — THE CINDER SPIRE.
 * Five obsidian shards stacked into a leaning tower, each rotated off the last,
 * with molten seams glowing in the gaps and a ring of splinters kicked out
 * around the base. The lean is the whole idea: a vertical tower on a crater rim
 * is architecture, a leaning one is something that erupted.
 */
function buildCinderSpire(far, near, glow, P) {
  plinth(far, 8.5, P);
  const shard = [[-1, -1], [0.9, -1.15], [1.25, 0.2], [0.35, 1.1], [-0.85, 0.85], [-1.25, -0.1]];
  let y = 1.2;
  let lean = 0;
  const S = [3.9, 3.4, 2.8, 2.1, 1.4];
  const HH = [5.0, 4.6, 4.0, 3.4, 2.6];
  const seams = [];
  for (let k = 0; k < 5; k++) {
    const h = HH[k];
    lean += 0.030;
    const off = lean * (y - 1.2) * 0.9;
    prism(far, shard, h, off, y + h * 0.5, 0, Math.PI / 2, k * 1.05, 0,
      T(P.deep, k % 2 ? 1.0 : 0.88), S[k], S[k]);
    seams.push([off, y + h * 0.5, S[k]]);
    y += h * 0.94;
  }
  // Crown ember: the vent itself.
  cone(far, 1.5, 3.4, 6, lean * (y - 1.2) * 0.9, y + 1.2, 0, T(P.mid, 1.06));

  // Eight splinters kicked out around the base.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.25;
    const h = 3.2 + (i % 3) * 1.9;
    const g = ringAt(a, 6.2, 1.0 + h * 0.42, 0.34 + (i % 2) * 0.12);
    cone(far, 0.85, h, 5, g.x, g.y, g.z, T(P.deep, i % 2 ? 1.06 : 0.9), 0, g.ry, g.rz);
  }

  // Near: cracked plates laid over the shards, and cooled crust at the foot.
  for (let k = 0; k < 5; k++) {
    const [ox, oy, sc] = seams[k];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + k * 0.6;
      const g = ringAt(a, sc * 1.05, oy + (i % 2) * 0.9);
      box(near, 0.9, 1.5, 0.35, ox + g.x, g.y, g.z, 0, g.ry, 0.25,
        T(P.stone, i % 2 ? 1.1 : 0.9));
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const g = ringAt(a, 7.6, 0.9, 0.7);
    cone(near, 0.5, 1.8, 4, g.x, g.y, g.z, T(P.mid, 0.95), 0, g.ry, g.rz);
  }
  plinthTrim(near, 8.5, P, 14);

  // Glow: molten seams between the shards, embers in the splinter ring, and the
  // caldera light washing the plinth.
  for (let k = 0; k < 5; k++) {
    const [ox, oy, sc] = seams[k];
    fanDisc(glow, trs(ox, oy - HH[k] * 0.5, 0, -Math.PI / 2, 0, 0), sc * 1.25, 12,
      T(P.glow), 0.5, 0);
  }
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * TAU + 0.25;
    const g = ringAt(a, 6.6, 4.4);
    spark(glow, 0.55, g.x, g.y, g.z, T(P.glow), 0.62);
  }
  spark(glow, 1.5, lean * (y - 1.2) * 0.9, y + 2.6, 0, T(P.glow), 0.66);
  halo(glow, 7.8, 1.2, T(P.glow), 0.30, 0);
}

/**
 * FLOOR 5 — THE FROZEN VAULT.
 * Six ice pillars leaning into a ring, three lintels across their heads, and a
 * frozen orb hanging in the middle of the vault they make. The lintels are the
 * escalation: the first four lairs are one idea each, and from here every lair
 * has to have two.
 */
function buildFrozenVault(far, near, glow, P) {
  plinth(far, 9.5, P);
  const N = 6;
  const H = [16.5, 12.0, 14.5, 11.0, 15.5, 12.5];
  const tops = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const h = H[i];
    const g = ringAt(a, 7.2, 1.0 + h * 0.5, -0.055);
    cyl(far, 1.15, 1.75, h, 6, g.x, g.y, g.z, T(P.mid, i % 2 ? 1.06 : 0.9), 0, g.ry, g.rz);
    tops.push([g.x * 0.93, 1.0 + h, g.z * 0.93]);
  }
  // Lintels across alternate heads — this is what turns a stone circle into a
  // vault, and it costs three boxes.
  for (let i = 0; i < N; i += 2) {
    const j = (i + 2) % N;
    const ax = tops[i][0];
    const az = tops[i][2];
    const bx = tops[j][0];
    const bz = tops[j][2];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const my = (tops[i][1] + tops[j][1]) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    box(far, 1.5, 1.3, len, mx, my + 0.5, mz, 0, -Math.atan2(bz - az, bx - ax) + Math.PI / 2, 0,
      T(P.lite, 1.0));
  }
  // The orb, held in the middle of the vault.
  orb(far, 2.7, 0, 12.5, 0, T(P.lite, 1.04), 9, 6);
  cyl(far, 0.35, 0.35, 3.2, 6, 0, 15.6, 0, T(P.mid, 0.92));

  // Near: facet ribs down every pillar, a shattered apron, and orb facets.
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    for (let k = 0; k < 3; k++) {
      const g = ringAt(a, 7.2 + (k - 1) * 0.9, 1.0 + H[i] * 0.5, -0.055);
      box(near, 0.24, H[i] * 0.86, 0.24, g.x, g.y, g.z, 0, g.ry, g.rz,
        T(P.lite, k % 2 ? 1.1 : 0.92));
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.2;
    const g = ringAt(a, 8.8, 1.1, 0.5 + (i % 3) * 0.2);
    cone(near, 0.42, 1.6 + (i % 4) * 0.7, 4, g.x, g.y, g.z, T(P.mid, 1.05), 0, g.ry, g.rz);
  }
  plinthTrim(near, 9.5, P, 16);

  // Glow: the cold light off the orb, and a bead on every pillar head.
  fanDisc(glow, trs(0, 12.5, 0, -Math.PI / 2, 0, 0), 5.4, 16, T(P.glow), 0.42, 0);
  spark(glow, 1.35, 0, 12.5, 0, T(P.glow), 0.44);
  for (let i = 0; i < N; i++) spark(glow, 0.42, tops[i][0], tops[i][1] + 0.3, tops[i][2], T(P.glow), 0.55);
  halo(glow, 8.2, 1.3, T(P.glow), 0.24, 0);
}

/**
 * FLOOR 6 — THE FACET.
 * A vast octahedral prism balanced on a tripod, six mirror shards standing
 * around it, and a fan of split light thrown out at five heights. The spectrum
 * fan is drawn from four PAPER tokens rather than a rainbow: a real rainbow
 * would be the first thing in this world to leave the palette.
 */
function buildFacet(far, near, glow, P) {
  plinth(far, 9, P);
  // Tripod.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const g = ringAt(a, 3.0, 3.6, 0.30);
    cyl(far, 0.65, 1.15, 6.6, 6, g.x, g.y, g.z, T(P.deep, i % 2 ? 1.05 : 0.9), 0, g.ry, g.rz);
  }
  cyl(far, 2.4, 2.9, 1.2, 8, 0, 6.6, 0, T(P.deep, 1.06));
  // The prism: two cones base to base.
  cone(far, 4.8, 10.5, 8, 0, 12.6, 0, T(P.mid, 1.02));
  cone(far, 4.8, 7.4, 8, 0, 5.9, 0, T(P.mid, 0.9), Math.PI, 0, 0);
  cone(far, 3.1, 5.0, 8, 0, 19.4, 0, T(P.lite, 1.06));

  // Six mirror shards, standing and tilted so they catch the sun at angles.
  const sh = [[-1, 0], [1, -0.4], [1.25, 4.6], [-0.5, 5.6], [-1.2, 3.0]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.25;
    const g = ringAt(a, 9.2, 1.0, 0.16 + (i % 3) * 0.09);
    prism(far, sh, 0.42, g.x, g.y, g.z, 0, g.ry + Math.PI / 2, g.rz,
      T(P.lite, i % 2 ? 1.05 : 0.9), 1.25, 1.3 + (i % 3) * 0.25);
  }

  // Near: facet banding round the prism, shard frames, tripod collars.
  for (let k = 0; k < 5; k++) {
    const yy = 7.4 + k * 2.6;
    const rr = 4.7 * (1 - Math.abs(k - 1.2) / 5.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + k * 0.2;
      const g = ringAt(a, rr, yy);
      box(near, 0.22, 1.5, 0.9, g.x, g.y, g.z, 0, g.ry, 0.2,
        T(P.lite, i % 2 ? 1.12 : 0.9));
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.25;
    const g = ringAt(a, 9.2, 1.4, 0.16);
    box(near, 0.3, 0.5, 3.0, g.x, g.y, g.z, 0, g.ry + Math.PI / 2, 0, T(P.trim, 1.0));
  }
  plinthTrim(near, 9, P, 15);

  // Glow: the split spectrum — five long fans at five heights, each a different
  // PAPER token, plus the core.
  const SPEC = [PAPER.coral, PAPER.gold, PAPER.tealL, PAPER.lavender, PAPER.sky];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.4;
    const yy = 9.5 + k * 2.4;
    fanDisc(glow, trs(Math.cos(a) * 7.5, yy, Math.sin(a) * 7.5, -Math.PI / 2, 0, 0),
      4.6, 10, T(SPEC[k]), 0.46, 0);
  }
  spark(glow, 1.9, 0, 12.4, 0, T(P.glow), 0.40);
  halo(glow, 8.0, 1.3, T(P.glow), 0.24, 0);
}

/**
 * FLOOR 7 — THE CROOKED MINT.
 * Fourteen coins stacked into a leaning tower, crowned by a bent balance whose
 * pans will never level, with spilled coins all round the foot. The Counterfeiter
 * is a cheat, so the landmark is a thing that is visibly, cheerfully WRONG —
 * a scale that cannot balance, which a five-year-old reads instantly.
 */
function buildCrookedMint(far, near, glow, P) {
  plinth(far, 8.5, P);
  let cx = 0;
  let cz = 0;
  let y = 1.0;
  const stack = [];
  for (let k = 0; k < 14; k++) {
    const t = k / 13;
    const r = 4.6 - t * 2.0;
    const h = 0.95;
    // The lean: a smooth drift, plus a per-coin wobble, so no two coins align.
    cx += 0.30 + Math.sin(k * 1.7) * 0.10;
    cz += 0.14 + Math.cos(k * 2.3) * 0.12;
    cyl(far, r, r, h, 14, cx, y + h * 0.5, cz,
      T(k % 3 === 0 ? P.lite : (k % 3 === 1 ? P.mid : P.stone), k % 2 ? 1.05 : 0.92),
      0, k * 0.4, 0.02 * k * 0.12);
    stack.push([cx, y + h, cz, r]);
    y += h * 0.96;
  }
  // The balance: a bent beam, one pan slung low.
  const topY = y + 0.6;
  cyl(far, 0.34, 0.42, 2.6, 6, cx, topY + 1.3, cz, T(P.deep, 1.0));
  box(far, 12.5, 0.55, 0.75, cx, topY + 2.6, cz, 0, 0.6, 0.20, T(P.deep, 1.02));
  for (const side of [-1, 1]) {
    const dx = Math.cos(0.6) * side * 5.9;
    const dz = -Math.sin(0.6) * side * 5.9;
    const drop = side > 0 ? 3.6 : 1.7;   // the cheat: one pan always wins
    box(far, 0.13, drop, 0.13, cx + dx, topY + 2.6 + side * 1.18 - drop / 2, cz + dz,
      0, 0, 0, T(P.deep, 0.9));
    cyl(far, 2.0, 1.7, 0.35, 12, cx + dx, topY + 2.6 + side * 1.18 - drop, cz + dz,
      T(P.trim, 1.0));
  }

  // Near: coin rims, mint marks, and spilled change on the plinth.
  for (let k = 0; k < 14; k += 2) {
    const [sx, sy, sz, r] = stack[k];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + k * 0.3;
      const g = ringAt(a, r * 0.99, sy - 0.5);
      box(near, 0.14, 0.7, 0.5, sx + g.x, g.y, sz + g.z, 0, g.ry, 0, T(P.stone, i % 2 ? 1.1 : 0.9));
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.3;
    const rr = 6.0 + (i % 3) * 1.1;
    cyl(near, 1.05, 1.05, 0.20, 10, Math.cos(a) * rr, 1.05, Math.sin(a) * rr,
      T(i % 2 ? P.lite : P.mid, 1.02), (i % 3) * 0.18, a, (i % 2) * 0.22);
  }
  plinthTrim(near, 8.5, P, 14);

  // Glow: a shimmer on every third coin and on both pans.
  for (let k = 2; k < 14; k += 4) {
    const [sx, sy, sz, r] = stack[k];
    fanDisc(glow, trs(sx, sy + 0.05, sz, -Math.PI / 2, 0, 0), r * 1.15, 12, T(P.glow), 0.34, 0);
  }
  spark(glow, 0.9, cx + Math.cos(0.6) * 5.9, topY + 2.6 + 1.18 - 3.6, cz - Math.sin(0.6) * 5.9,
    T(P.glow), 0.5);
  halo(glow, 7.6, 1.2, T(P.glow), 0.24, 0);
}

/**
 * FLOOR 8 — THE IMPOSSIBLE STAIR.
 * Three flights that climb into each other and arrive where they started, an
 * arch built upside down beside them, and four tablets hanging in the air with
 * nothing holding them. Every part of it is individually ordinary; the wrongness
 * is only in how they meet, which is exactly what the Paradox is.
 */
function buildImpossibleStair(far, near, glow, P) {
  plinth(far, 10, P);
  const STEP = 1.05;
  const RUN = 1.5;
  /** One flight: `n` treads climbing from (x0,z0) along a bearing. */
  const flight = (s, n, x0, y0, z0, bearing, tone) => {
    for (let i = 0; i < n; i++) {
      const d = i * RUN;
      box(s, 3.2, STEP, RUN * 1.02,
        x0 + Math.cos(bearing) * d, y0 + i * STEP + STEP * 0.5, z0 + Math.sin(bearing) * d,
        0, -bearing, 0, T(tone, i % 2 ? 1.06 : 0.9));
    }
  };
  // A: climbs north-east. B: climbs off A's head at a right angle. C: climbs off
  // B's head back OVER A's foot, which is where the loop closes.
  flight(far, 9, -8.5, 1.0, -6.0, 0.6, P.lite);
  flight(far, 9, -8.5 + Math.cos(0.6) * 13.5, 1.0 + 9 * STEP, -6.0 + Math.sin(0.6) * 13.5,
    0.6 + Math.PI / 2, P.stone);
  flight(far, 9,
    -8.5 + Math.cos(0.6) * 13.5 + Math.cos(0.6 + Math.PI / 2) * 13.5,
    1.0 + 18 * STEP,
    -6.0 + Math.sin(0.6) * 13.5 + Math.sin(0.6 + Math.PI / 2) * 13.5,
    0.6 + Math.PI, P.lite);
  // Landing slabs where the flights meet, so the joins read as deliberate.
  for (const [ax, az, yy] of [
    [-8.5 + Math.cos(0.6) * 13.5, -6.0 + Math.sin(0.6) * 13.5, 1.0 + 9 * STEP],
    [-8.5 + Math.cos(0.6) * 13.5 + Math.cos(0.6 + Math.PI / 2) * 13.5,
      -6.0 + Math.sin(0.6) * 13.5 + Math.sin(0.6 + Math.PI / 2) * 13.5, 1.0 + 18 * STEP],
  ]) {
    box(far, 4.4, 0.7, 4.4, ax, yy, az, 0, 0.6, 0, T(P.deep, 1.0));
  }

  // The inverted arch: voussoirs sprung from ABOVE, keystone at the bottom.
  const rMid = 4.6;
  for (let k = 0; k < 11; k++) {
    const th = Math.PI * (k + 0.5) / 11;
    const chord = 2 * rMid * Math.sin(Math.PI / 22) * 1.14;
    box(far, chord, 1.15, 1.5,
      -12.0 + rMid * Math.cos(th), 13.5 - rMid * Math.sin(th), 9.5,
      0, 0, Math.PI / 2 - th, T(P.stone, k % 2 ? 1.06 : 0.9));
  }
  for (const sx of [-1, 1]) {
    box(far, 1.5, 12.0, 1.5, -12.0 + sx * rMid, 7.5, 9.5, 0, 0, 0, T(P.stone, 1.0));
  }

  // Four tablets, hanging.
  const TAB = [[6.0, 15.0, -6.0, 0.4], [-4.0, 19.5, 5.0, -0.5], [10.0, 11.5, 6.5, 0.9],
    [-2.0, 22.5, -8.5, -0.2]];
  for (const [tx, ty, tz, rot] of TAB) {
    box(far, 3.0, 4.0, 0.35, tx, ty, tz, rot * 0.4, rot, rot * 0.3, T(P.mid, 1.04));
  }

  // Near: tread nosings, balustrade posts, tablet glyph cut-outs.
  for (let i = 0; i < 9; i += 2) {
    const d = i * RUN;
    box(near, 3.3, 0.18, 0.24, -8.5 + Math.cos(0.6) * d, 1.0 + i * STEP + STEP,
      -6.0 + Math.sin(0.6) * d, 0, -0.6, 0, T(P.trim, 1.0));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const g = ringAt(a, 9.4, 1.7);
    box(near, 0.30, 1.6, 0.30, g.x, g.y, g.z, 0, g.ry, 0, T(P.stone, i % 2 ? 1.1 : 0.9));
  }
  for (const [tx, ty, tz, rot] of TAB) {
    // A question mark, cut as three scraps: it is the Paradox's whole thesis.
    box(near, 1.5, 0.42, 0.2, tx, ty + 1.2, tz + 0.2, rot * 0.4, rot, rot * 0.3, T(P.trim, 1.06));
    box(near, 0.42, 1.1, 0.2, tx + 0.55, ty + 0.5, tz + 0.2, rot * 0.4, rot, rot * 0.3, T(P.trim, 1.06));
    box(near, 0.42, 0.42, 0.2, tx, ty - 1.2, tz + 0.2, rot * 0.4, rot, rot * 0.3, T(P.trim, 1.06));
  }
  plinthTrim(near, 10, P, 16);

  // Glow: each tablet, and a wash under the inverted keystone.
  for (const [tx, ty, tz] of TAB) spark(glow, 0.8, tx, ty, tz + 0.4, T(P.glow), 0.46);
  spark(glow, 1.2, -12.0, 13.5 - rMid, 9.5, T(P.glow), 0.5);
  halo(glow, 8.6, 1.3, T(P.glow), 0.22, 0);
}

/**
 * FLOOR 9 — THE MANUSCRIPT SPIRE.
 *
 * THE MOST SPECTACULAR OBJECT IN THE GAME, AND IT HAS TO BE.
 *
 * Forty-eight manuscript leaves spiralling forty metres up a tapering core;
 * twelve more standing guard round a four-step plinth; three armillary rings
 * turning through each other at three heights; a ring of torn proof-chits
 * hanging in the air; four flying buttresses; and at the very top a golden
 * circle with a piece MISSING — the proof he never finished, which is the whole
 * of the final boss in one silhouette.
 *
 * The measured complaint that started this work was that the final boss carried
 * less art than any other. This landmark alone carries more geometry than the
 * four garden-side lairs put together, it is more than twice the height of
 * anything else on the island, and it is visible from the spawn meadow on the
 * far side of the world. The last floor should announce itself from the first
 * minute of play.
 */
function buildManuscriptSpire(far, near, glow, P) {
  // Four-step plinth on the shared terraced footing — the only lair that gets
  // four steps, because it is the only lair the whole island can see.
  footing(far, 9.6, P);
  cyl(far, 8.8, 9.5, 0.7, 18, 0, 0.65, 0, T(P.stone, 1.08));
  cyl(far, 7.8, 8.4, 0.6, 16, 0, 1.30, 0, T(P.deep, 0.96));
  cyl(far, 6.8, 7.4, 0.55, 16, 0, 1.87, 0, T(P.stone, 1.05));

  /** One manuscript leaf: a torn, ruled page. Authored in its own XY plane. */
  const LEAF = [
    [-0.5, 0], [0.5, 0], [1.0, 0.55], [0.62, 0.90], [0.14, 1.0],
    [-0.30, 0.95], [-0.95, 0.5],
  ];

  // Twelve standing leaves round the plinth: the honour guard.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const h = 7.4 + (i % 3) * 1.6;
    const g = ringAt(a, 6.4, 2.1, 0.10);
    prism(far, LEAF, 0.42, g.x, g.y, g.z, 0, g.ry + Math.PI / 2, g.rz,
      T(P.deep, i % 2 ? 1.04 : 0.9), 2.6, h);
    prism(near, LEAF, 0.20, g.x * 0.97, g.y + 0.3, g.z * 0.97, 0, g.ry + Math.PI / 2, g.rz,
      T(P.stone, 1.06), 1.9, h * 0.78);
    prism(near, LEAF, 0.12, g.x * 0.94, g.y + 0.5, g.z * 0.94, 0, g.ry + Math.PI / 2, g.rz,
      T(P.lite, 1.02), 1.3, h * 0.58);
  }

  // The core: eight tapering drums, banded so the taper reads as stacked reams.
  const CORE_H = 34;
  let y = 2.1;
  for (let k = 0; k < 8; k++) {
    const t0 = k / 8;
    const t1 = (k + 1) / 8;
    const h = CORE_H / 8;
    cyl(far, 3.4 - t1 * 2.8, 3.4 - t0 * 2.8, h, 12, 0, y + h * 0.5, 0,
      T(P.deep, k % 2 ? 1.05 : 0.92));
    cyl(near, 3.5 - t0 * 2.8, 3.5 - t0 * 2.8, 0.22, 12, 0, y + 0.1, 0, T(P.trim, 1.0));
    y += h;
  }

  // The spiral: forty-eight leaves winding the core, shrinking as they climb.
  for (let i = 0; i < 48; i++) {
    const t = i / 47;
    const a = i * 0.62;
    const yy = 2.6 + t * 32.0;
    const rr = (3.4 - t * 2.7) + 1.5 * (1 - t * 0.55);
    const sc = 3.1 * (1 - t * 0.70);
    const g = ringAt(a, rr, yy, 0.22 + t * 0.28);
    prism(far, LEAF, 0.26, g.x, g.y, g.z, 0, g.ry + Math.PI / 2, g.rz,
      T(i % 3 === 0 ? P.lite : (i % 3 === 1 ? P.stone : P.deep), i % 2 ? 1.05 : 0.92),
      sc, sc * 1.15);
    // Ruled lines, in the near buffer only: they are what makes a page a PAGE,
    // and they are invisible past the detail range by construction.
    if (i % 2 === 0) {
      box(near, 0.06, sc * 0.9, 0.9, g.x * 1.02, g.y + sc * 0.3, g.z * 1.02,
        0, g.ry + Math.PI / 2, g.rz, T(P.trim, 1.0));
    }
  }

  // Four flying buttresses, springing from the plinth to the core's waist.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    for (let k = 0; k < 8; k++) {
      const t = k / 7;
      const rr = 8.6 - t * 6.0;
      const yy = 2.0 + Math.sin(t * Math.PI * 0.5) * 13.0;
      const g = ringAt(a, rr, yy, 0);
      box(far, 0.7, 1.5, 1.5, g.x, g.y, g.z, 0, g.ry, -0.5 - t * 0.6,
        T(P.deep, k % 2 ? 1.06 : 0.9));
    }
  }

  // Three armillary rings, each on its own axis. An orrery around a tower is the
  // one motif that says "this thing is thinking".
  const RINGS = [
    { r: 9.0, y: 20.0, tilt: 0.30, spin: 0.0, n: 24 },
    { r: 7.2, y: 26.5, tilt: -0.42, spin: 1.1, n: 22 },
    { r: 5.6, y: 32.0, tilt: 0.55, spin: 2.2, n: 20 },
  ];
  for (const R of RINGS) {
    for (let i = 0; i < R.n; i++) {
      const a = (i / R.n) * TAU;
      const chord = 2 * R.r * Math.sin(Math.PI / R.n) * 1.16;
      // Ring in its own plane, then tipped: build the point, tip it about X.
      const px = Math.cos(a) * R.r;
      const pz = Math.sin(a) * R.r;
      const ct = Math.cos(R.tilt);
      const stt = Math.sin(R.tilt);
      const yy = R.y + pz * stt;
      const zz = pz * ct;
      const cs = Math.cos(R.spin);
      const sn = Math.sin(R.spin);
      box(far, 0.55, 0.72, chord,
        px * cs - zz * sn, yy, px * sn + zz * cs,
        R.tilt, -a - R.spin, 0, T(P.trim, i % 2 ? 1.06 : 0.88));
    }
  }

  // The crown: an unfinished circle. Twenty segments, five of them missing.
  const CR = 4.6;
  const CY = 40.5;
  for (let i = 0; i < 20; i++) {
    if (i >= 6 && i < 11) continue;      // THE GAP — the proof he never closed
    const a = (i / 20) * TAU;
    const chord = 2 * CR * Math.sin(Math.PI / 20) * 1.16;
    box(far, 0.85, chord, 0.85,
      Math.cos(a) * CR, CY + Math.sin(a) * CR, 0, 0, 0, a + Math.PI / 2,
      T(P.trim, i % 2 ? 1.08 : 0.9));
  }
  cyl(far, 0.5, 1.4, 5.4, 8, 0, CY - CR - 2.4, 0, T(P.deep, 1.02));

  // A ring of torn proof-chits, hanging at three heights.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const yy = 14.0 + (i % 5) * 4.4;
    const rr = 9.5 - (i % 3) * 1.4;
    const g = ringAt(a, rr, yy);
    prism(far, [[-1, -0.75], [0.95, -0.85], [1, 0.7], [-0.9, 0.8]], 0.16,
      g.x, g.y, g.z, (i % 3) * 0.3, g.ry, (i % 4) * 0.4 - 0.6,
      T(P.stone, i % 2 ? 1.05 : 0.92), 1.5, 1.5);
  }

  // Near: plinth fluting, and a glyph tablet on each of the four cardinal steps.
  plinthTrim(near, 10.4, P, 22);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const g = ringAt(a, 8.2, 2.4, 0.16);
    box(near, 2.2, 2.8, 0.3, g.x, g.y, g.z, 0, g.ry, g.rz, T(P.lite, 1.04));
    box(near, 1.4, 0.22, 0.2, g.x * 0.97, g.y + 0.5, g.z * 0.97, 0, g.ry, g.rz, T(P.trim, 1.06));
    box(near, 1.4, 0.22, 0.2, g.x * 0.97, g.y - 0.1, g.z * 0.97, 0, g.ry, g.rz, T(P.trim, 1.06));
  }

  // Glow. The unfinished circle burns at its gap — the single most important
  // 60 cm of geometry in the game, and the only place the eye should land.
  for (let i = 6; i < 11; i++) {
    const a = (i / 20) * TAU;
    spark(glow, 0.42, Math.cos(a) * CR, CY + Math.sin(a) * CR, 0, T(P.glow), 0.66);
  }
  fanDisc(glow, trs(0, CY, 0, 0, 0, 0), 6.4, 20, T(P.glow), 0.34, 0);
  for (const R of RINGS) halo(glow, R.r * 1.12, R.y, T(P.glow), 0.20, 0);
  for (let i = 0; i < 10; i += 2) {
    const a = (i / 10) * TAU + 0.3;
    const g = ringAt(a, 9.5 - (i % 3) * 1.4, 14.0 + (i % 5) * 4.4);
    spark(glow, 0.4, g.x, g.y, g.z, T(P.glow), 0.5);
  }
  halo(glow, 10.4, 2.0, T(P.glow), 0.28, 0);
}

const BUILDERS = {
  briarking: buildBriarCrown,
  pressure: buildSunkenBasin,
  skywhale: buildRibVault,
  pyroclast: buildCinderSpire,
  absolutezero: buildFrozenVault,
  theprism: buildFacet,
  counterfeiter: buildCrookedMint,
  theparadox: buildImpossibleStair,
  theorem: buildManuscriptSpire,
};

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Level a landmark's footing.
 *
 * Samples the terrain on two rings and takes the MINIMUM, then drops a little
 * further. A landmark placed at its centre sample floats its downhill side on
 * any slope at all; taking the minimum guarantees the buried plinth step eats
 * the difference instead. (props.js does the same thing for its buildings; that
 * helper is private, so this is the same six lines said again rather than a
 * reach into someone else's module.)
 */
function footY(sampleHeight, x, z, radius) {
  let lo = sampleHeight(x, z);
  // The INNER ring only (0.6 of the footprint). Sampling the full footprint
  // would drag the whole landmark down to whatever the outermost step happens
  // to overhang — on a plateau lip that is a fifteen metre cliff, and the lair
  // would sink out of sight to chase it. The terraced footing (see `footing`)
  // is what absorbs the outer ring instead.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const h = sampleHeight(x + Math.cos(a) * radius * 0.6, z + Math.sin(a) * radius * 0.6);
    if (h < lo) lo = h;
  }
  return lo - 0.35;
}

/**
 * Build all nine lairs.
 *
 * @param {{sampleHeight:(x:number,z:number)=>number}} heightfield  READ ONLY
 * @param {object} [opts] { lairs, castShadow, detailRange, glowRange }
 */
export function createBossLairs(heightfield, opts = {}) {
  const specs = opts.lairs || LAIRS;
  const castShadow = opts.castShadow !== false;
  const detailRange = opts.detailRange ?? DETAIL_RANGE;
  const glowRange = opts.glowRange ?? GLOW_RANGE;
  const sampleHeight = heightfield.sampleHeight;

  const group = new THREE.Group();
  group.name = 'boss-lairs';

  const geometries = [];
  const materials = [];

  // ONE lit material for all nine, and one unlit material for all nine glows.
  // The lairs differ by vertex colour, exactly like every other papercut object
  // in this world, so nine landmarks cost two materials.
  //
  // The surface recipe matches props.js's structMat deliberately: these are
  // buildings at building scale, and the MACRO patina is the layer that lets a
  // 40 m spire have a colour that changes across itself instead of reading as
  // one flat fill from the far side of the island.
  const solidMat = toonMaterial(0xffffff, { vertexColors: true });
  applyPapercut(solidMat, {
    grain: 0.10, normal: 0.14, roughnessLike: 0.22, scale: 2.0, space: 'world',
    macro: 0.09, macroScale: 18, bleach: 0.34,
  });
  materials.push(solidMat);

  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, fog: true, opacity: 1,
  });
  materials.push(glowMat);

  /** @type {object[]} */
  const lairs = [];
  const colliders = [];
  let farTris = 0;
  let nearTris = 0;
  let glowTris = 0;

  for (const spec of specs) {
    const build = BUILDERS[spec.bossId];
    if (!build) continue;

    const farSink = sink();
    const nearSink = sink();
    const glowSink = sink(true);
    build(farSink, nearSink, glowSink, spec.pal);

    const y = footY(sampleHeight, spec.x, spec.z, spec.foot) + (spec.lift || 0);
    const root = new THREE.Group();
    root.name = `lair-${spec.bossId}`;
    root.position.set(spec.x, y, spec.z);
    root.rotation.y = spec.yaw || 0;
    group.add(root);

    const mk = (s, mat, name, shadow) => {
      if (s.pos.length === 0) return null;
      const geo = bake(s);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${root.name}-${name}`;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      root.add(mesh);
      return mesh;
    };

    const farMesh = mk(farSink, solidMat, 'far', castShadow);
    const nearMesh = mk(nearSink, solidMat, 'near', false);
    const glowMesh = mk(glowSink, glowMat, 'glow', false);
    if (nearMesh) nearMesh.visible = false;
    if (glowMesh) {
      glowMesh.visible = false;
      glowMesh.renderOrder = 3;
    }

    const triCount = (m) => (m
      ? (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
      : 0);
    farTris += triCount(farMesh);
    nearTris += triCount(nearMesh);
    glowTris += triCount(glowMesh);

    lairs.push({
      ...spec, y, root, far: farMesh, near: nearMesh, glow: glowMesh,
      farTriangles: triCount(farMesh),
      nearTriangles: triCount(nearMesh),
      glowTriangles: triCount(glowMesh),
    });
    if (spec.collider > 0) {
      colliders.push({
        id: `lair-${spec.bossId}`, kind: 'circle', x: spec.x, z: spec.z, r: spec.collider,
      });
    }
  }

  const tracker = createLairTracker(lairs);

  /**
   * Distance LOD + a slow shared pulse on the glow.
   *
   * The pulse is one material-level opacity write for all nine lairs, which is
   * why they breathe together — at 40 m apart minimum that is unobservable, and
   * it saves nine uniform updates a frame.
   */
  function update(simTime, playerPos) {
    const px = playerPos ? (playerPos.x ?? 0) : 0;
    const pz = playerPos ? (playerPos.z ?? 0) : 0;
    for (let i = 0; i < lairs.length; i++) {
      const l = lairs[i];
      const dx = l.x - px;
      const dz = l.z - pz;
      const d2 = dx * dx + dz * dz;
      if (l.near) l.near.visible = d2 < detailRange * detailRange;
      if (l.glow) l.glow.visible = d2 < glowRange * glowRange;
    }
    glowMat.opacity = 0.80 + Math.sin(simTime * 0.9) * 0.18;
  }

  /**
   * Drive the approach beat. Allocation-free: the callbacks are invoked at most
   * once per transition and the tracker returns interned strings.
   *
   * @param {number} x
   * @param {number} z
   * @param {(floorId:number, lair:object)=>void} [onNear]
   * @param {(floorId:number, lair:object)=>void} [onLeave]
   */
  function checkApproach(x, z, onNear, onLeave) {
    const evt = tracker.step(x, z);
    if (evt === null) return null;
    if (evt === 'enter') {
      onNear?.(tracker.current.floorId, tracker.current);
    } else if (evt === 'leave') {
      if (tracker.previous) onLeave?.(tracker.previous.floorId, tracker.previous);
    } else {
      if (tracker.previous) onLeave?.(tracker.previous.floorId, tracker.previous);
      onNear?.(tracker.current.floorId, tracker.current);
    }
    return evt;
  }

  /** Forget the current lair — teleport / setPose must be able to re-announce. */
  function resetApproach() { tracker.reset(); }

  const stats = {
    lairs: lairs.length,
    tallest: lairs.reduce((m, l) => Math.max(m, l.height), 0),
    farTriangles: Math.round(farTris),
    nearTriangles: Math.round(nearTris),
    glowTriangles: Math.round(glowTris),
    triangles: Math.round(farTris + nearTris + glowTris),
    trianglesByFloor: lairs.map((l) => ({
      floorId: l.floorId,
      far: Math.round(l.farTriangles),
      near: Math.round(l.nearTriangles),
      glow: Math.round(l.glowTriangles),
      total: Math.round(l.farTriangles + l.nearTriangles + l.glowTriangles),
    })),
    // Worst case, not typical: every `far` in frustum at once (they are 40+ m
    // apart and the boom sees at most a handful), plus the one neighbourhood
    // whose detail and glow are switched on.
    colorPassCalls: lairs.length + 2 + 2,
    shadowPassCalls: castShadow ? lairs.length : 0,
    drawCalls: lairs.length + 4 + (castShadow ? lairs.length : 0),
    materials: materials.length,
    colliders: colliders.length,
  };

  function dispose() {
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const l of lairs) l.root.clear();
    lairs.length = 0;
    colliders.length = 0;
    group.clear();
  }

  return {
    group,
    lairs,
    colliders,
    tracker,
    update,
    checkApproach,
    resetApproach,
    stats,
    dispose,
  };
}
