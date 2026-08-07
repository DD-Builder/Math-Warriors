/**
 * The party — two companions who follow the hero through the 3D world.
 *
 * WHY THEY EXIST AT ALL
 * The 2D game is about a party of three. The 3D hub shipped with one figure
 * walking an empty island, which quietly told the child their two friends stop
 * existing between battles. Two followers cost eleven draw calls and put the
 * whole party back on screen.
 *
 * ── THE FORMATION ALGORITHM ────────────────────────────────────────────────
 * The naive follower is a rigid offset from the leader ("stand 2 m behind and
 * 1 m left"). It fails in exactly the places this world is made of: the offset
 * point sweeps sideways through a tree when the leader turns, it sits inside a
 * cliff when the leader walks along one, and it whips around the leader's hip
 * every time a thumb nudges the stick, because the offset is rigid in the
 * LEADER'S FRAME and the leader's frame rotates at 10 rad/s.
 *
 * So the companions do not follow the leader. They follow his PATH.
 *
 *   1. BREADCRUMB TRAIL. Every leader position is pushed into a ring buffer,
 *      but only once it is TRAIL_STEP (22 cm) from the previous sample, with
 *      the running arc length stored alongside. Distance-gated, so the trail
 *      is identical at 30 fps and at 120 fps — which is what makes the whole
 *      rig reproducible for the screenshot harness.
 *   2. ARC-LENGTH LOOKUP. Companion i targets the point `lag_i` metres BACK
 *      along that polyline, with its lateral offset applied perpendicular to
 *      the LOCAL TANGENT there rather than to the leader's current facing.
 *      That single change is what makes them walk the route the player walked:
 *      round the tree, along the ledge, up the switchback — for free, with no
 *      pathfinding and no collider.
 *   3. CRITICALLY DAMPED SPRING. The companion's actual position chases that
 *      target through a spring, so a sprint stretches the file out and a stop
 *      lets them coast in and settle. A pure lerp would arrive dead, and dead
 *      arrivals are what make followers read as dragged props.
 *   4. SPEED-COLLAPSING FILE. The lateral offsets shrink with speed, so an
 *      idle party stands in a loose V and a sprinting one is single file. Real
 *      groups do this, it keeps them out of the scenery on narrow paths, and
 *      it is the cheapest possible "they are reacting to you".
 *   5. SCATTER, THEN REGROUP. A sprint start or a jump sets `scatter` to 1.
 *      While it is up, the lateral offsets bloom, the lag grows and the spring
 *      SOFTENS, so the pair fans out and falls behind; as it decays over ~0.9 s
 *      the spring stiffens again and they visibly converge back into formation.
 *      One scalar, no state machine, and it reads as a reaction rather than a
 *      constraint.
 *   6. LEASH. Any companion more than LEASH metres from its target has been
 *      left behind by something the spring cannot fix — a portal return, a
 *      teleport, a fall off the palace — so it is placed on the target
 *      outright and given a scale punch, which reads as "caught up" instead of
 *      as a glitch.
 *
 * WHY THEY HAVE NO COLLIDER
 * A follower that can push the player is a follower that pins them against a
 * wall, and the one thing a five-year-old must never lose is control of their
 * own character. Companions sample the ground for their height and are
 * otherwise ghosts: they never enter the collision world, and they may pass
 * through props and each other.
 *
 * WHY THE ART IS REBUILT HERE INSTEAD OF REUSING characterView
 * The hero is laminated out of five sheets per form because he fills a quarter
 * of the frame. A companion is 3-6 m behind him and never does; at that range
 * the lamination is invisible and the cost is not. These rigs are cut from the
 * same stock and the same PAPER dress kits, at three sheets and five nodes, so
 * they read as the same characters at a third of the triangles. The dress table
 * below is a verbatim copy of characterView's private CLASSES, and `heroClassOf`
 * is imported from it rather than re-derived, so a companion can never disagree
 * with the hero about what a wizard looks like.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth reads, no
 * fwidth, one InstancedMesh for both contact shadows, zero allocation in
 * update(), every colour from PAPER, dispose() releases everything.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { papercutMaterial, paperColor, applyRimLight } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { sink, stamp, bake, lin, trs } from './geobuild.js';
import { heroClassOf } from './characterView.js';
import { DEFAULT_TUNING } from './controller.js';

// ── Formation ──────────────────────────────────────────────────────────────

/** Trail sampling gate, metres. Distance-gated so frame rate cannot change it. */
export const TRAIL_STEP = 0.22;
/** Ring capacity. 64 * 0.22 = 14 m of history — twice the longest lag + leash. */
export const TRAIL_CAP = 64;

/**
 * The formation. Two slots only: three followers behind one leader is a queue,
 * two is a group, and the party is three heroes of which one is the player.
 *
 *   lag     metres back along the leader's PATH (not along his facing)
 *   side    lateral offset, +right of the path tangent
 *   phase   animation phase offset so the pair never steps in lockstep
 *   glance  seconds between idle head-turns, jittered per companion
 *
 * The lags are deliberately unequal and the sides deliberately not mirrored:
 * a symmetric pair reads as a UI element flanking the player, an asymmetric
 * one reads as two people who happened to end up walking with you.
 */
export const SLOTS = [
  { lag: 2.35, side: -1.15, phase: 0.0, glance: 2.6 },
  { lag: 3.40, side: 1.05, phase: 1.9, glance: 3.4 },
];

const FORM = {
  /** Spring constant at rest. Critically damped: d = 2*sqrt(k). */
  stiff: 26,
  /** How much a full scatter softens the spring (they fall behind, then close). */
  scatterSoft: 0.52,
  /** Lateral bloom at full scatter. */
  scatterSpread: 1.35,
  /** Extra lag at full scatter, metres. */
  scatterLag: 1.5,
  /** Seconds for scatter to fall to 1/e. */
  scatterTau: 0.9,
  /** Lateral offsets collapse toward single file by this fraction at full run. */
  fileCollapse: 0.55,
  /** Speed ceiling as a multiple of the hero's sprint, so they can close a gap. */
  maxSpeedMult: 1.45,
  /** Beyond this distance from its target a companion is placed, not sprung. */
  leash: 11.5,
  /** Sprint onset threshold (normalised leader speed) that triggers a scatter. */
  sprintTrigger: 0.72,
  /** Seconds of stillness before idle glances begin. */
  idleDelay: 0.8,
};

// ── Animation ──────────────────────────────────────────────────────────────
const ANIM = {
  walkSpeed: DEFAULT_TUNING.speed,
  runSpeed: DEFAULT_TUNING.runSpeed,
  strideHz: 1.45,     // cycle radians per metre travelled
  speedDamp: 9,
  bob: 0.055,
  bobRun: 0.10,
  armSwing: 0.34,     // applied as a TORSO twist — see buildTorso
  legSwing: 0.62,
  legSwingRun: 0.30,
  leanRun: 0.20,
  breathHz: 1.05,
  swayHz: 0.62,
  /** Sympathy hop when the leader jumps: height and duration. */
  hopH: 0.52,
  hopT: 0.42,
};

// ── Proportions ────────────────────────────────────────────────────────────
// The hero's chibi proportions at 0.88, so a companion is legibly the same
// species and legibly not the one you are driving.
const SCALE = 0.88;
const HIP_Y = 0.60 * SCALE;
const SHOULDER_Y = 1.12 * SCALE;
const SHOULDER_X = 0.375 * SCALE;
const HEAD_Y = 1.24 * SCALE;
const LEG_LEN = 0.60 * SCALE;
const ARM_LEN = 0.52 * SCALE;
const CROWN_Y = { crest: 0.44 * SCALE, hat: 0.52 * SCALE, ears: 0.47 * SCALE };

/** Trim thickness — the same 7 cm card stock the hero and the world are cut from. */
const DEPTH = 0.07;
const TORSO_D = 0.30 * SCALE;
const HEAD_D = 0.38 * SCALE;
const ARM_D = 0.18 * SCALE;
const LEG_D = 0.20 * SCALE;

/** Sheets per laminated form. Three, not five — see the header. */
const SHEETS = 3;

/**
 * Class dress. A VERBATIM copy of characterView's private CLASSES table: the
 * hero and his party are cut from one sheet of paper or they are not the same
 * game. If that table ever moves, this one follows it.
 */
const CLASSES = {
  knight: {
    base: PAPER.teal, light: PAPER.tealL, trim: PAPER.gold,
    skin: PAPER.peach, accent: PAPER.coral, shoe: PAPER.sand, crown: 'crest',
  },
  wizard: {
    base: PAPER.lavender, light: PAPER.sky, trim: PAPER.gold,
    skin: PAPER.peach, accent: PAPER.lavenderD, shoe: PAPER.sand, crown: 'hat',
  },
  bunny: {
    base: PAPER.coral, light: PAPER.peach, trim: PAPER.cream,
    skin: PAPER.peach, accent: PAPER.rose, shoe: PAPER.cream, crown: 'ears',
  },
};

/** The palette's stand-in for black. A hue, never a neutral. */
const INK = PAPER.inkTeal;

const BLOB_ALPHA = 0.30;
const WATER_Y = 0;
const TAU = Math.PI * 2;

// ═══════════════════════════════════════════════════════════════════════════
// Pure formation logic (no three, no scene) — this is the tested half.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the two followers from a save.
 *
 * Party entries are the battle-scene shape ({ id, name, hp, ... }) and often
 * carry no `class` field at all, so the class is derived exactly the way the
 * hero derives his (heroClassOf falls through to the id, and every hero id is
 * prefixed with its class). Slot 0 is the player's own avatar and is skipped.
 * A short, missing or malformed party yields fewer companions rather than
 * throwing: a corrupt save must cost the child nothing.
 *
 * @param {object|null} save
 * @param {number} [max] how many followers to take
 * @returns {{id:string, name:string, heroClass:string}[]}
 */
export function partyFollowers(save, max = SLOTS.length) {
  const party = save && Array.isArray(save.party) ? save.party : [];
  const out = [];
  for (let i = 1; i < party.length && out.length < max; i++) {
    const h = party[i];
    if (!h) continue;
    const id = typeof h === 'string' ? h : (h.id || h.name || '');
    if (!id) continue;
    out.push({
      id: String(id),
      name: String((typeof h === 'string' ? h : h.name) || id),
      heroClass: heroClassOf(h),
    });
  }
  return out;
}

/**
 * The leader's recent path as an arc-length-parameterised ring buffer.
 *
 * Pure, allocation-free after construction, and deterministic: samples are
 * gated on DISTANCE, so the same route produces the same trail whatever the
 * frame rate did. See the module header for why followers need a path at all.
 *
 * @param {number} [capacity]
 * @param {number} [minStep] metres between stored samples
 */
export function createTrail(capacity = TRAIL_CAP, minStep = TRAIL_STEP) {
  const cap = Math.max(2, capacity | 0);
  const xs = new Float64Array(cap);
  const zs = new Float64Array(cap);
  const ss = new Float64Array(cap);
  let head = 0;
  let count = 0;
  let total = 0;

  /** Drop the whole path and restart it at (x, z). */
  function reset(x = 0, z = 0) {
    head = 0;
    count = 1;
    total = 0;
    xs[0] = x;
    zs[0] = z;
    ss[0] = 0;
  }

  /** @returns {boolean} true when the point was far enough to be stored. */
  function push(x, z) {
    if (count === 0) { reset(x, z); return true; }
    const dx = x - xs[head];
    const dz = z - zs[head];
    const d = Math.hypot(dx, dz);
    if (d < minStep) return false;
    total += d;
    head = (head + 1) % cap;
    xs[head] = x;
    zs[head] = z;
    ss[head] = total;
    if (count < cap) count++;
    return true;
  }

  /**
   * The point `back` metres behind the newest sample, plus the unit tangent
   * there (pointing forward, i.e. the direction the leader was travelling).
   *
   * Writes into `out` — never allocates. When the trail is shorter than `back`
   * the oldest sample's tangent is EXTRAPOLATED backwards so a fresh spawn
   * still produces a sane formation, and the return value says so.
   *
   * @param {number} back metres
   * @param {{x:number,z:number,tx:number,tz:number}} out
   * @returns {boolean} true when the answer came from real path history
   */
  function sampleBack(back, out) {
    if (count === 0) return false;
    const want = ss[head] - back;
    let newer = head;
    for (let k = 1; k < count; k++) {
      const older = (head - k + cap) % cap;
      if (ss[older] <= want) {
        const span = ss[newer] - ss[older];
        const t = span > 1e-9 ? (want - ss[older]) / span : 0;
        out.x = xs[older] + (xs[newer] - xs[older]) * t;
        out.z = zs[older] + (zs[newer] - zs[older]) * t;
        let tx = xs[newer] - xs[older];
        let tz = zs[newer] - zs[older];
        const l = Math.hypot(tx, tz) || 1;
        out.tx = tx / l;
        out.tz = tz / l;
        return true;
      }
      newer = older;
    }
    // Not enough history. `newer` is now the oldest stored sample.
    const oldest = newer;
    let tx = 0;
    let tz = 1;
    if (count > 1) {
      const next = (oldest + 1) % cap;
      const dx = xs[next] - xs[oldest];
      const dz = zs[next] - zs[oldest];
      const l = Math.hypot(dx, dz);
      if (l > 1e-9) { tx = dx / l; tz = dz / l; }
    }
    const rem = ss[oldest] - want;   // how far past the end we still owe
    out.x = xs[oldest] - tx * rem;
    out.z = zs[oldest] - tz * rem;
    out.tx = tx;
    out.tz = tz;
    return false;
  }

  return {
    push,
    sampleBack,
    reset,
    get length() { return count; },
    get arcLength() { return count === 0 ? 0 : ss[head] - ss[(head - count + 1 + cap) % cap]; },
  };
}

/**
 * The formation offset for one slot, given how fast the leader is moving and
 * how scattered the party currently is.
 *
 * Pure so it can be reasoned about (and tested) without a scene: the two
 * behaviours that matter — the file collapsing at speed and blooming on a
 * scatter — are entirely in these four lines.
 *
 * @param {number} index slot index
 * @param {number} speedN 0..1 leader speed, normalised to sprint
 * @param {number} scatter 0..1 scatter energy
 * @returns {{lag:number, side:number}}
 */
export function formationOffset(index, speedN, scatter) {
  const slot = SLOTS[index % SLOTS.length];
  const file = 1 - FORM.fileCollapse * Math.min(1, Math.max(0, speedN));
  const bloom = 1 + FORM.scatterSpread * scatter;
  return {
    lag: slot.lag + FORM.scatterLag * scatter,
    side: slot.side * file * bloom,
  };
}

/** Wrap an angle into (-PI, PI] for shortest-arc turning. */
function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

// ═══════════════════════════════════════════════════════════════════════════
// Outline kit — point lists, faceted on purpose (scissors leave straight runs)
// ═══════════════════════════════════════════════════════════════════════════

function arcInto(pts, cx, cy, rx, ry, a0, a1, seg) {
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
}

function ellipse(rx, ry, seg = 9) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

/** Trapezoid with softened corners: `wTop` at +h/2, `wBot` at -h/2. */
function taper(wTop, wBot, h, r = 0.04) {
  const ht = h / 2;
  return [
    [wTop / 2 - r, ht], [wTop / 2, ht - r],
    [wBot / 2, -ht + r], [wBot / 2 - r, -ht],
    [-wBot / 2 + r, -ht], [-wBot / 2, -ht + r],
    [-wTop / 2, ht - r], [-wTop / 2 + r, ht],
  ];
}

/** Limb blank: a stadium hanging DOWN from the origin. */
function limb(w, len) {
  const r = w / 2;
  const pts = [];
  arcInto(pts, 0, -r * 0.15, r, r, 0, Math.PI, 3);
  pts.push([-w / 2, -len + r]);
  arcInto(pts, 0, -len + r, r, r, Math.PI, TAU, 3);
  return pts;
}

/** Five-pointed star — the wizard's hat badge and the knight's chest emblem. */
function star(rOuter, rInner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

/**
 * Splay the front/back cap normals outward from the ply centre so a flat card
 * shades like a softly domed one under the 3-step toon ramp. Build-time, no
 * derivatives (SwiftShader law), and it is what stops a companion reading as a
 * single flat tone at the range they are actually seen from.
 */
function roundFace(geo, amount) {
  const n = geo.attributes.normal.array;
  const p = geo.attributes.position.array;
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(n[i + 2]) < 0.7) continue;
    const dx = p[i];
    const dy = p[i + 1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    const nx = n[i] + (dx / l) * amount;
    const ny = n[i + 1] + (dy / l) * amount;
    const m = Math.hypot(nx, ny, n[i + 2]) || 1;
    n[i] = nx / m;
    n[i + 1] = ny / m;
    n[i + 2] = n[i + 2] / m;
  }
}

/**
 * Stamp one ply into a node sink. `axis: 'x'` lays the outline in the Z-Y plane
 * for the handful of forms whose character is their PROFILE (feet, ears).
 * @param {object} o { color, shade, x, y, z, rot, depth, round, axis, sx, sy }
 */
function ply(s, pts, o) {
  const depth = o.depth ?? DEPTH;
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth, bevelEnabled: false, curveSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  roundFace(geo, o.round ?? 0.42);
  const ry = o.axis === 'x' ? -Math.PI / 2 : 0;
  stamp(
    s, geo,
    trs(o.x || 0, o.y || 0, o.z || 0, 0, ry, o.rot || 0, o.sx ?? 1, o.sy ?? 1, 1),
    lin(o.color, o.shade ?? 1),
  );
  return 1;
}

/**
 * Laminate a FORM out of SHEETS plies cut from one outline and scaled by a
 * two-sided superellipse depth profile.
 *
 * The hero's header explains why this exists at all: a single card is a perfect
 * front silhouette and a 7 cm sliver from the side, and the follow camera shows
 * the side constantly. Three sheets is the cheapest stack that still closes
 * into a form; the hero pays for five because he is twice the size on screen.
 */
function laminate(s, pts, o) {
  const D = o.depth;
  // Limbs take TWO sheets, not three. A limb's outline is already a stadium —
  // convex, thin, and read almost entirely in silhouette — so the middle sheet
  // of a three-stack adds nothing but 30% of the rig's triangle budget. Bodies
  // and heads keep three, because those are the forms whose side profile the
  // follow camera actually resolves.
  const n = o.sheets ?? SHEETS;
  const sheetD = (D / n) * 1.2;
  const pF = o.pF ?? 6;
  const pB = o.pB ?? 3;
  const q = o.q ?? 0.30;
  const flatY = o.flatY ?? 0.5;
  const back = o.back ?? 0.90;
  const shade = o.shade ?? 1;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const t = 2 * u - 1;
    const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), t >= 0 ? pF : pB)), q);
    const off = t * 0.5 * D;
    ply(s, pts, {
      color: o.color,
      shade: shade * (back + (1 - back) * u),
      x: (o.x || 0) + (o.axis === 'x' ? off : 0),
      y: o.y || 0,
      z: (o.z || 0) + (o.axis === 'x' ? 0 : off),
      rot: o.rot || 0,
      depth: sheetD,
      round: o.round,
      axis: o.axis,
      sx: k,
      sy: 1 - (1 - k) * flatY,
    });
  }
  return SHEETS;
}

/** Front face of a laminated form, so trim can be laid on top of it. */
function faceZ(depth) {
  return depth * 0.5 * ((SHEETS - 1) / SHEETS) + (depth / SHEETS) * 0.6;
}

// ═══════════════════════════════════════════════════════════════════════════
// Node builders
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Torso, WITH BOTH ARMS MERGED IN.
 *
 * This is the one real economy in the rig, and it is not a compromise. The
 * torso node twists about y through the walk cycle; because the arms are baked
 * into that same buffer at ±SHOULDER_X, the twist carries one arm forward and
 * the other back — which IS an arm swing, obtained from a rotation the rig was
 * already doing. Two nodes and two draw calls saved, and the only thing lost is
 * independent elbow work that nothing at this range could resolve anyway.
 */
function buildTorso(C, cls) {
  const s = sink();
  let plies = 0;
  const W = 0.60 * SCALE;
  const H = 0.56 * SCALE;
  const body = taper(W * 0.94, W * 0.82, H, 0.06 * SCALE);
  plies += laminate(s, body, {
    color: C.base, y: H / 2, depth: TORSO_D, pF: 7, pB: 3.4, flatY: 0.42,
  });
  const fz = faceZ(TORSO_D);
  // Belt: the one horizontal that gives a torso a waist at 6 m.
  plies += ply(s, taper(W * 0.86, W * 0.86, 0.10 * SCALE, 0.02),
    { color: C.trim, y: 0.10 * SCALE, z: fz, depth: DEPTH * 0.7, round: 0.2 });
  // Chest ply: a lighter panel so the front is two values, not one.
  plies += ply(s, taper(W * 0.48, W * 0.56, H * 0.60, 0.05 * SCALE),
    { color: C.light, y: H * 0.62, z: fz, depth: DEPTH * 0.6, round: 0.5 });
  // Class badge.
  if (cls === 'knight') {
    plies += ply(s, star(0.11 * SCALE, 0.05 * SCALE),
      { color: C.trim, y: H * 0.66, z: fz + 0.012, depth: DEPTH * 0.5, round: 0.3 });
  } else if (cls === 'wizard') {
    plies += ply(s, ellipse(0.09 * SCALE, 0.09 * SCALE, 6),
      { color: C.trim, y: H * 0.66, z: fz + 0.012, depth: DEPTH * 0.5, round: 0.6 });
  } else {
    plies += ply(s, ellipse(0.10 * SCALE, 0.07 * SCALE, 6),
      { color: C.trim, y: H * 0.62, z: fz + 0.012, depth: DEPTH * 0.5, round: 0.6 });
  }
  // Arms, baked at the shoulders with a resting splay. The torso twist swings
  // them; see the header above.
  const armY = SHOULDER_Y - HIP_Y;
  for (const side of [-1, 1]) {
    plies += laminate(s, limb(0.19 * SCALE, ARM_LEN), {
      color: C.base, x: side * SHOULDER_X, y: armY, depth: ARM_D, sheets: 2,
      rot: side * 0.13, pF: 4, pB: 4, flatY: 0.85, shade: 0.97,
    });
    // Cuff — a hand-sized light scrap at the wrist, which is all a hand needs
    // to be from six metres.
    plies += ply(s, ellipse(0.085 * SCALE, 0.075 * SCALE, 6), {
      color: C.skin, x: side * (SHOULDER_X + Math.sin(side * 0.13) * ARM_LEN * 0.9),
      y: armY - ARM_LEN * 0.94, depth: ARM_D * 0.8, round: 0.7,
    });
  }
  return { geo: bake(s), plies };
}

/** Head: one laminated ball plus a face. */
function buildHead(C, cls) {
  const s = sink();
  let plies = 0;
  const R = 0.30 * SCALE;
  plies += laminate(s, ellipse(R, R * 1.02, 9), {
    color: C.skin, y: R, depth: HEAD_D, pF: 3.2, pB: 3.0, flatY: 1.0,
  });
  const fz = faceZ(HEAD_D);
  // Eyes. Two ink scraps and a cream glint — the entire face budget, and the
  // only near-dark the palette allows.
  for (const side of [-1, 1]) {
    plies += ply(s, ellipse(0.045 * SCALE, 0.062 * SCALE, 6), {
      color: INK, x: side * 0.105 * SCALE, y: R * 1.02, z: fz, depth: DEPTH * 0.5, round: 0.2,
    });
  }
  if (cls === 'bunny') {
    // Muzzle: the one extra ply that separates a bunny head from a round head.
    plies += ply(s, ellipse(0.10 * SCALE, 0.07 * SCALE, 6), {
      color: C.light, y: R * 0.74, z: fz + 0.004, depth: DEPTH * 0.5, round: 0.6,
    });
  } else {
    // Hair/helm fringe across the brow.
    plies += ply(s, taper(R * 1.7, R * 1.5, R * 0.42, 0.03), {
      color: cls === 'knight' ? C.light : C.accent,
      y: R * 1.44, z: fz - 0.01, depth: DEPTH * 0.7, round: 0.4,
    });
  }
  return { geo: bake(s), plies };
}

/**
 * Crown — helm crest, wizard hat, bunny ears.
 *
 * It gets its own node purely so it can LAG. The spring in update() is most of
 * the charm in the rig: ears that flop a beat behind the head are the single
 * cheapest thing that makes a paper doll read as alive.
 */
function buildCrown(C, kind) {
  const s = sink();
  let plies = 0;
  if (kind === 'crest') {
    // A plume: a swept fin, cut side-on so it reads from the profile the
    // follow camera actually holds.
    const fin = [
      [-0.05 * SCALE, 0], [0.10 * SCALE, 0.02 * SCALE], [0.16 * SCALE, 0.18 * SCALE],
      [0.06 * SCALE, 0.34 * SCALE], [-0.08 * SCALE, 0.40 * SCALE],
      [-0.16 * SCALE, 0.30 * SCALE], [-0.14 * SCALE, 0.10 * SCALE],
    ];
    plies += ply(s, fin, { color: C.accent, depth: 0.10 * SCALE, axis: 'x', round: 0.3 });
    plies += ply(s, fin, {
      color: C.trim, depth: 0.05 * SCALE, axis: 'x', sx: 0.62, sy: 0.72,
      y: 0.03 * SCALE, round: 0.3,
    });
    // Helm band under it.
    plies += ply(s, ellipse(0.30 * SCALE, 0.07 * SCALE, 8), {
      color: C.trim, y: -0.03 * SCALE, depth: HEAD_D * 0.86, round: 0.4,
    });
  } else if (kind === 'hat') {
    const cone = [
      [-0.30 * SCALE, 0], [0.30 * SCALE, 0], [0.10 * SCALE, 0.34 * SCALE],
      [0.02 * SCALE, 0.52 * SCALE], [-0.08 * SCALE, 0.44 * SCALE],
    ];
    plies += laminate(s, cone, { color: C.accent, depth: 0.22 * SCALE, pF: 4, pB: 4, flatY: 0.9 });
    plies += ply(s, ellipse(0.40 * SCALE, 0.10 * SCALE, 8), {
      color: C.base, y: 0.01 * SCALE, depth: 0.30 * SCALE, round: 0.5,
    });
    plies += ply(s, star(0.075 * SCALE, 0.033 * SCALE), {
      color: C.trim, y: 0.24 * SCALE, z: 0.12 * SCALE, depth: DEPTH * 0.5, round: 0.3,
    });
  } else {
    // Ears: two long leaves, cut side-on so they have a real profile, with an
    // inner ply in the accent so they are two values and not one.
    const ear = [
      [-0.06 * SCALE, 0], [0.06 * SCALE, 0], [0.08 * SCALE, 0.26 * SCALE],
      [0.02 * SCALE, 0.46 * SCALE], [-0.05 * SCALE, 0.44 * SCALE], [-0.08 * SCALE, 0.22 * SCALE],
    ];
    for (const side of [-1, 1]) {
      plies += ply(s, ear, {
        color: C.base, x: side * 0.11 * SCALE, rot: side * 0.20,
        depth: 0.09 * SCALE, axis: 'x', round: 0.3,
      });
      plies += ply(s, ear, {
        color: C.accent, x: side * 0.11 * SCALE, rot: side * 0.20, z: 0.05 * SCALE,
        depth: 0.04 * SCALE, axis: 'x', sx: 0.55, sy: 0.80, y: 0.03 * SCALE, round: 0.3,
      });
    }
  }
  return { geo: bake(s), plies };
}

/** Leg: one laminated limb and a side-cut foot. */
function buildLeg(C) {
  const s = sink();
  let plies = 0;
  plies += laminate(s, limb(0.20 * SCALE, LEG_LEN), {
    color: C.accent, depth: LEG_D, sheets: 2, pF: 4, pB: 4, flatY: 0.86,
  });
  // The foot is the one form whose character is its PROFILE, so it is cut
  // side-on: a front-cut foot is a 14 cm stub.
  const boot = [
    [-0.09 * SCALE, 0], [0.19 * SCALE, 0], [0.21 * SCALE, 0.06 * SCALE],
    [-0.09 * SCALE, 0.10 * SCALE], [-0.12 * SCALE, 0.05 * SCALE],
  ];
  plies += ply(s, boot, {
    color: C.shoe, y: -LEG_LEN - 0.01, depth: 0.17 * SCALE, axis: 'x', round: 0.35,
  });
  return { geo: bake(s), plies };
}

/** Contact shadow disc. Deckle-masked in the material, so 12 segments is plenty. */
function buildBlobGeo() {
  const geo = new THREE.CircleGeometry(0.5, 12);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the follower party.
 *
 * @param {object} opts
 * @param {object|null} opts.save            read for save.party
 * @param {{sampleHeight:(x:number,z:number)=>number}} opts.heightfield
 * @param {boolean} [opts.castShadow]        default false — see the budget note
 * @param {{id:string,heroClass:string}[]} [opts.followers] override for tests
 */
export function createCompanions(opts = {}) {
  const heightfield = opts.heightfield || null;
  const castShadow = opts.castShadow === true;
  const followers = (opts.followers || partyFollowers(opts.save)).slice(0, SLOTS.length);

  const group = new THREE.Group();
  group.name = 'companions';

  const geometries = [];
  const materials = [];
  /** @type {object[]} one entry per live companion */
  const crew = [];

  // ONE material for every ply of every node of every companion: plies differ
  // by vertex colour, not by material. `space: 'local'` pins the grain to the
  // mesh so it cannot swim as they run.
  const skin = papercutMaterial(0xffffff, {
    vertexColors: true,
    grain: 0.075, normal: 0.10, roughnessLike: 0.17, scale: 0.42, space: 'local',
    bleach: 0.26,
  });
  // The same cream rim the hero wears, at slightly less strength. Without it a
  // teal knight on green grass at equal luma dissolves into the frame — and a
  // companion that dissolves is a companion the child stops believing in.
  applyRimLight(skin, { strength: 0.30, power: 3.0 });
  materials.push(skin);

  const blobGeo = buildBlobGeo();
  geometries.push(blobGeo);
  const blobMat = new THREE.MeshBasicMaterial({
    color: paperColor(PAPER.shadow), vertexColors: true, transparent: true,
    opacity: BLOB_ALPHA, depthWrite: false, fog: true, alphaMap: deckleDisc(),
  });
  materials.push(blobMat);
  // One InstancedMesh for BOTH shadows. Per-instance alpha would need a custom
  // attribute and a shader patch for two quads; a hopping companion shrinks its
  // blob instead, which reads as altitude just as well.
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, Math.max(1, followers.length));
  blobs.name = 'companion-shadows';
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.castShadow = false;
  blobs.receiveShadow = false;
  blobs.renderOrder = 1;
  blobs.count = followers.length;
  if (followers.length > 0) group.add(blobs);

  let plyCount = 0;

  followers.forEach((f, i) => {
    const cls = f.heroClass;
    const C = CLASSES[cls] || CLASSES.knight;
    const root = new THREE.Group();
    root.name = `companion-${i}`;
    const rig = new THREE.Group();
    rig.name = `companion-${i}-rig`;
    root.add(rig);
    group.add(root);

    const nodes = {};
    const addNode = (name, built, parent, x, y, z) => {
      geometries.push(built.geo);
      plyCount += built.plies;
      const mesh = new THREE.Mesh(built.geo, skin);
      mesh.name = `companion-${i}-${name}`;
      mesh.position.set(x, y, z);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      nodes[name] = mesh;
      return mesh;
    };

    const torso = addNode('torso', buildTorso(C, cls), rig, 0, HIP_Y, 0);
    const head = addNode('head', buildHead(C, cls), rig, 0, HEAD_Y, 0);
    const kind = C.crown;
    addNode('crown', buildCrown(C, kind), head, 0, CROWN_Y[kind], 0);
    const legL = addNode('legL', buildLeg(C), rig, -0.145 * SCALE, HIP_Y, 0);
    const legR = addNode('legR', buildLeg(C), rig, 0.145 * SCALE, HIP_Y, 0);

    crew.push({
      slot: SLOTS[i % SLOTS.length],
      index: i,
      id: f.id,
      name: f.name,
      heroClass: cls,
      root, rig, torso, head, crown: nodes.crown, legL, legR,
      // Kinematics
      x: 0, z: 0, y: 0, vx: 0, vz: 0,
      yaw: 0, yawVis: 0,
      // Animation
      phase: 0, spd: 0, crownLag: 0, crownVel: 0,
      hopT: -1, popT: 0,
      glanceT: 0, glanceYaw: 0, glanceTarget: 0,
      rnd: (0x9e3779b9 ^ (i * 0x85ebca6b)) >>> 0,
      catchUps: 0,
    });
  });

  // ── Shared runtime state ─────────────────────────────────────────────────
  const trail = createTrail();
  const st = {
    t: null,
    scatter: 0,
    speedN: 0,
    prevSpeedN: 0,
    grounded: true,
    stillT: 0,
    seeded: false,
  };

  // Scratch — the entire no-allocation contract lives in these.
  const _path = { x: 0, z: 0, tx: 0, tz: 1 };
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3(1, 1, 1);
  const _flat = new THREE.Euler(-Math.PI / 2, 0, 0);

  /** Deterministic scatter. Math.random would desync the screenshot harness. */
  function rnd(c) {
    c.rnd = (Math.imul(c.rnd, 1664525) + 1013904223) >>> 0;
    return c.rnd / 4294967296;
  }

  function groundY(x, z) {
    if (!heightfield) return 0;
    const g = heightfield.sampleHeight(x, z);
    return g > WATER_Y ? g : WATER_Y;
  }

  /** Place a companion exactly on its formation target. Used by leash + reset. */
  function snapTo(c, speedN) {
    const off = formationOffset(c.index, speedN, 0);
    trail.sampleBack(off.lag, _path);
    c.x = _path.x - _path.tz * off.side;
    c.z = _path.z + _path.tx * off.side;
    c.vx = 0;
    c.vz = 0;
    c.y = groundY(c.x, c.z);
    c.yaw = Math.atan2(_path.tx, _path.tz);
    c.yawVis = c.yaw;
    c.hopT = -1;
  }

  /**
   * Advance the party.
   *
   * @param {{pos:{x,y,z}, vel:{x,y,z}, yaw:number, grounded:boolean}} leader
   *        the controller state, exactly as the hero rig receives it
   * @param {number} animT animation clock (frozen by the pose harness)
   */
  function update(leader, animT) {
    if (crew.length === 0) return;
    const dt = st.t == null ? 0 : Math.min(Math.max(animT - st.t, 0), 0.05);
    st.t = animT;

    if (!st.seeded) {
      trail.reset(leader.pos.x, leader.pos.z);
      st.seeded = true;
      for (const c of crew) snapTo(c, 0);
    }
    trail.push(leader.pos.x, leader.pos.z);

    // ── Leader-derived signals ──
    const lspd = Math.hypot(leader.vel.x, leader.vel.z);
    st.prevSpeedN = st.speedN;
    st.speedN = Math.min(1, lspd / ANIM.runSpeed);
    const moving = lspd > 0.05 || !leader.grounded;
    st.stillT = moving ? 0 : st.stillT + dt;

    // ── Scatter triggers: a sprint start, or leaving the ground ──
    let triggered = false;
    if (st.speedN >= FORM.sprintTrigger && st.prevSpeedN < FORM.sprintTrigger) triggered = true;
    if (!leader.grounded && st.grounded) triggered = true;
    if (leader.grounded !== st.grounded && !leader.grounded) {
      for (const c of crew) c.hopT = 0;   // sympathy hop, staggered below by phase
    }
    st.grounded = leader.grounded;
    if (triggered && dt > 0) {
      st.scatter = 1;
      // A sideways kick each, in opposite directions, so the pair FANS rather
      // than both drifting the same way.
      for (const c of crew) {
        const dir = c.index % 2 === 0 ? -1 : 1;
        const kick = 1.6 + rnd(c) * 1.1;
        c.vx += -Math.cos(leader.yaw) * dir * kick;
        c.vz += Math.sin(leader.yaw) * dir * kick;
      }
    }
    if (dt > 0 && st.scatter > 0) {
      st.scatter -= st.scatter * Math.min(1, dt / FORM.scatterTau);
      if (st.scatter < 0.002) st.scatter = 0;
    }

    const stiff = FORM.stiff * (1 - FORM.scatterSoft * st.scatter);
    const damp = 2 * Math.sqrt(stiff);
    const maxSpeed = ANIM.runSpeed * FORM.maxSpeedMult;
    const idleOn = st.stillT > FORM.idleDelay;

    for (let i = 0; i < crew.length; i++) {
      const c = crew[i];

      // ── 1. Target: a point on the leader's PATH, offset across its tangent ──
      const off = formationOffset(c.index, st.speedN, st.scatter);
      trail.sampleBack(off.lag, _path);
      const tx = _path.x - _path.tz * off.side;
      const tz = _path.z + _path.tx * off.side;

      // ── 2. Leash: anything the spring cannot fix in a second is a warp ──
      const gapX = tx - c.x;
      const gapZ = tz - c.z;
      const gap = Math.hypot(gapX, gapZ);
      if (gap > FORM.leash) {
        c.x = tx;
        c.z = tz;
        c.vx = 0;
        c.vz = 0;
        c.popT = 1;
        c.catchUps++;
      } else if (dt > 0) {
        // ── 3. Critically damped spring ──
        c.vx += (gapX * stiff - c.vx * damp) * dt;
        c.vz += (gapZ * stiff - c.vz * damp) * dt;
        const v = Math.hypot(c.vx, c.vz);
        if (v > maxSpeed) {
          const k = maxSpeed / v;
          c.vx *= k;
          c.vz *= k;
        }
        c.x += c.vx * dt;
        c.z += c.vz * dt;
      }

      const spd = Math.hypot(c.vx, c.vz);
      if (dt > 0) c.spd += (spd - c.spd) * Math.min(1, ANIM.speedDamp * dt);
      const moveN = Math.min(1, c.spd / ANIM.walkSpeed);
      const runN = Math.max(0, Math.min(1,
        (c.spd - ANIM.walkSpeed) / (ANIM.runSpeed - ANIM.walkSpeed)));

      // ── 4. Ground + sympathy hop ──
      const gy = groundY(c.x, c.z);
      let hop = 0;
      if (c.hopT >= 0) {
        const lead = c.index * 0.09;   // staggered so they do not hop as one
        const u = (c.hopT - lead) / ANIM.hopT;
        if (u >= 1) c.hopT = -1;
        else if (u > 0) hop = Math.sin(Math.PI * u) * ANIM.hopH;
        if (dt > 0 && c.hopT >= 0) c.hopT += dt;
      }
      c.y = gy + hop;
      c.root.position.set(c.x, c.y, c.z);

      // ── 5. Facing: velocity while moving, the LEADER while idle ──
      const wantYaw = spd > 0.55
        ? Math.atan2(c.vx, c.vz)
        : Math.atan2(leader.pos.x - c.x, leader.pos.z - c.z);
      c.yaw += wrapAngle(wantYaw - c.yaw) * Math.min(1, 9 * dt);

      // ── 6. Idle glances ──
      // A companion who stands facing you for ninety seconds is furniture.
      // Every few seconds an idle one looks somewhere else, holds it, and comes
      // back — deterministic, so a pose screenshot is reproducible.
      if (idleOn && moveN < 0.05) {
        if (dt > 0) c.glanceT -= dt;
        if (c.glanceT <= 0) {
          c.glanceT = c.slot.glance + rnd(c) * 1.8;
          c.glanceTarget = (rnd(c) * 2 - 1) * 0.62;
        }
      } else {
        c.glanceTarget = 0;
        c.glanceT = 0;
      }
      c.glanceYaw += (c.glanceTarget - c.glanceYaw) * Math.min(1, 3.2 * dt);
      c.yawVis = c.yaw + c.glanceYaw * 0.35;
      c.root.rotation.y = c.yawVis;

      // ── 7. Walk cycle ──
      // Phase advances with DISTANCE so the feet never skate, whatever the
      // spring is doing to their speed.
      if (dt > 0) c.phase += c.spd * ANIM.strideHz * dt;
      const ph = c.phase + c.slot.phase;
      const sw = Math.sin(ph);
      const cw = Math.cos(ph);
      const idle = 1 - moveN;
      const breath = Math.sin(animT * ANIM.breathHz + c.slot.phase);

      const bobAmp = (ANIM.bob + (ANIM.bobRun - ANIM.bob) * runN) * moveN;
      c.rig.position.y = -Math.abs(cw) * bobAmp + bobAmp * 0.5
        + idle * breath * 0.012
        + (hop > 0 ? -0.03 : 0);
      c.rig.rotation.x = ANIM.leanRun * runN * 0.55 + moveN * 0.06;
      c.rig.rotation.z = idle * Math.sin(animT * ANIM.swayHz + c.slot.phase) * 0.016;

      // Pop: the leash landing gets one frame of squash so a catch-up reads as
      // a character arriving, not as a teleport.
      if (c.popT > 0 && dt > 0) c.popT = Math.max(0, c.popT - dt * 3.2);
      const pop = c.popT * c.popT;
      c.rig.scale.set(1 + pop * 0.20, 1 - pop * 0.26, 1 + pop * 0.20);

      // Torso twist — this is the arm swing (see buildTorso).
      c.torso.rotation.y = -sw * ANIM.armSwing * moveN;
      c.torso.rotation.z = sw * 0.03 * moveN;

      c.head.rotation.y = sw * 0.08 * moveN + c.glanceYaw;
      c.head.rotation.x = -c.rig.rotation.x * 0.62 + idle * Math.sin(animT * 0.51) * 0.03;

      // Crown spring — the lag that makes ears flop and a plume trail.
      const crownTarget = -c.head.rotation.x * 0.9 - c.rig.rotation.x * 0.5
        + sw * 0.05 * moveN + (hop > 0 ? 0.28 : 0) + pop * 0.3;
      if (dt > 0) {
        c.crownVel += (crownTarget - c.crownLag) * 55 * dt;
        c.crownVel -= c.crownVel * Math.min(1, 7.5 * dt);
        c.crownLag += c.crownVel * dt;
      } else {
        c.crownLag = crownTarget;
        c.crownVel = 0;
      }
      c.crown.rotation.x = c.crownLag;
      c.crown.rotation.z = idle * Math.sin(animT * ANIM.swayHz + c.slot.phase + 0.8) * 0.035;

      const legAmp = (ANIM.legSwing + ANIM.legSwingRun * runN) * moveN;
      const tuck = hop > 0 ? 0.45 : 0;
      c.legL.rotation.x = sw * legAmp - tuck * 0.9;
      c.legR.rotation.x = -sw * legAmp + tuck * 0.3;
      c.legL.scale.y = 1 - pop * 0.30;
      c.legR.scale.y = 1 - pop * 0.30;

      // ── 8. Contact shadow ──
      const alt = Math.max(0, c.y - gy);
      const bs = (1.05 + alt * 0.20 + pop * 0.35) * SCALE;
      _p.set(c.x, gy + 0.035, c.z);
      _q.setFromEuler(_flat);
      _s.set(bs, bs, 1);
      _m.compose(_p, _q, _s);
      blobs.setMatrixAt(i, _m);
    }
    blobs.instanceMatrix.needsUpdate = true;
  }

  /**
   * Return the party to a canonical formation behind `leader` and drop every
   * spring, glance and hop. teleport / setPose call this so a screenshot never
   * inherits mid-stride state.
   */
  function reset(leader = null) {
    st.t = null;
    st.scatter = 0;
    st.speedN = 0;
    st.prevSpeedN = 0;
    st.grounded = true;
    st.stillT = 0;
    if (leader) {
      // Seed the trail as a straight run INTO the leader's facing, so the
      // companions fall in behind him instead of piling on his position.
      const s = Math.sin(leader.yaw);
      const c0 = Math.cos(leader.yaw);
      trail.reset(leader.pos.x - s * 12, leader.pos.z - c0 * 12);
      for (let k = 1; k <= 24; k++) {
        trail.push(leader.pos.x - s * (12 - k * 0.5), leader.pos.z - c0 * (12 - k * 0.5));
      }
      st.seeded = true;
    } else {
      st.seeded = false;
    }
    for (const c of crew) {
      c.phase = 0;
      c.spd = 0;
      c.crownLag = 0;
      c.crownVel = 0;
      c.hopT = -1;
      c.popT = 0;
      c.glanceT = 0;
      c.glanceYaw = 0;
      c.glanceTarget = 0;
      c.rnd = (0x9e3779b9 ^ (c.index * 0x85ebca6b)) >>> 0;
      c.torso.rotation.set(0, 0, 0);
      c.head.rotation.set(0, 0, 0);
      c.crown.rotation.set(0, 0, 0);
      c.legL.rotation.set(0, 0, 0);
      c.legR.rotation.set(0, 0, 0);
      c.legL.scale.set(1, 1, 1);
      c.legR.scale.set(1, 1, 1);
      c.rig.position.set(0, 0, 0);
      c.rig.rotation.set(0, 0, 0);
      c.rig.scale.set(1, 1, 1);
      if (leader && st.seeded) snapTo(c, 0);
      c.root.position.set(c.x, c.y, c.z);
      c.root.rotation.y = c.yawVis;
    }
    if (crew.length > 0) {
      for (let i = 0; i < crew.length; i++) {
        const c = crew[i];
        const bs = 1.05 * SCALE;
        _p.set(c.x, groundY(c.x, c.z) + 0.035, c.z);
        _q.setFromEuler(_flat);
        _s.set(bs, bs, 1);
        _m.compose(_p, _q, _s);
        blobs.setMatrixAt(i, _m);
      }
      blobs.instanceMatrix.needsUpdate = true;
    }
  }
  reset();

  // ── stats ────────────────────────────────────────────────────────────────
  const NODES_PER = 5;
  let triangles = 0;
  const perCompanion = [];
  for (const c of crew) {
    let t = 0;
    for (const mesh of [c.torso, c.head, c.crown, c.legL, c.legR]) {
      const g = mesh.geometry;
      const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
      t += n / 3;
    }
    perCompanion.push(Math.round(t));
    triangles += t;
  }
  const blobTris = blobGeo.index
    ? blobGeo.index.count / 3
    : blobGeo.attributes.position.count / 3;
  triangles += blobTris * crew.length;

  const colorCalls = crew.length * NODES_PER + (crew.length > 0 ? 1 : 0);
  const shadowCalls = castShadow ? crew.length * NODES_PER : 0;
  const stats = {
    count: crew.length,
    classes: crew.map((c) => c.heroClass),
    ids: crew.map((c) => c.id),
    nodesEach: NODES_PER,
    plies: plyCount,
    trianglesEach: perCompanion,
    triangles: Math.round(triangles),
    colorPassCalls: colorCalls,
    shadowPassCalls: shadowCalls,
    drawCalls: colorCalls + shadowCalls,
    materials: materials.length,
    trailCapacity: TRAIL_CAP,
  };

  function dispose() {
    blobs.dispose();
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const c of crew) {
      c.head.clear();
      c.rig.clear();
      c.root.clear();
    }
    crew.length = 0;
    group.clear();
  }

  return {
    group,
    update,
    reset,
    stats,
    /** Live read for tests/debug: world transforms of each companion. */
    get members() { return crew; },
    dispose,
  };
}
