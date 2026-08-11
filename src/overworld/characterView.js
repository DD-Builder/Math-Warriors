/**
 * The hero — a paper-doll rig cut from the same stock as the world.
 *
 * WHY EXTRUDED SILHOUETTES AND NOT A MODEL
 * Everything else in this world is a shape someone cut out of coloured paper
 * and laid on top of another shape. The hero was the one thing that wasn't: a
 * stack of capsules and cones, which is exactly what a prototype's placeholder
 * looks like from any distance. So he is built the way the 2D art is built —
 * a THREE.Shape outline per PLY, extruded ~7 cm, stacked front-to-back with
 * millimetre z-gaps so the sun can put a hairline of teal shadow between the
 * plies. No sculpting, no bevels, no outline geometry: the silhouette IS the
 * character, and the depth exists only so the layers can shadow each other.
 *
 * WHY SEVEN NODES AND NOT SEVENTEEN
 * One draw call per animated node, so the node list is a budget, not a wish.
 * torso / head / crown / armL / armR / legL / legR is the smallest set that can
 * carry a walk cycle, a look-at, and the secondary motion that sells weight
 * (the crown — helm crest, wizard hat, bunny ears — lags every rotation the
 * head makes, and that lag is most of the charm). Every node is a MERGE of
 * several plies stamped into one buffer via geobuild's sink, with the ply
 * colour baked into the vertex attribute, so 25 pieces of paper cost 7 calls.
 *
 * WHY THE FRONT FACES GET FAKE ROUND NORMALS
 * A flat card lit by a 3-step toon ramp is one flat tone — legible, but dead.
 * `roundFace` splays each front-cap normal outward from the ply's centre before
 * the ply is baked, so a ramp step lands INSIDE the card near its rim. The card
 * still reads as a flat cut-out in silhouette and now has a soft turned edge in
 * shading. Build-time, zero runtime cost, no derivatives (SwiftShader law).
 *
 * WHY THE ANIMATION IS PROCEDURAL AND DRIVEN OFF CONTROLLER STATE
 * The controller is pure and deterministic (controller.js), so a pose harness
 * that reproduces a state reproduces the pose. `update()` derives everything —
 * cycle phase, lean, tuck, squash — from { pos, vel, yaw, grounded, wading }
 * and its own dt, and `reset()` returns the rig to a canonical idle so a
 * screenshot pose is the same image on every machine. Nothing here samples a
 * wall clock and nothing here allocates.
 *
 * WHY THE SHADOW IS A TORN TEAL SCRAP
 * Papercut law: shadows go teal, never grey, never black, and never a perfect
 * vector circle — the blob is a deckle-masked disc that tightens under the feet
 * when grounded and blooms as the hero rises, which is the only altitude cue a
 * player gets mid-jump.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth reads, no
 * fwidth, InstancedMesh for both particle pools, zero allocation in update(),
 * every colour derived from PAPER, dispose() releases everything.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { papercutMaterial, paperColor, applyRimLight } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { sink, stamp, bake, lin, trs } from './geobuild.js';
import { DEFAULT_TUNING } from './controller.js';

// ── Proportions ────────────────────────────────────────────────────────────
// Chibi on purpose: a big head and short legs is what a 5-year-old draws when
// you ask them to draw a hero, and it stays readable at the 11 m camera boom.
const HIP_Y = 0.60;      // leg pivot / torso base
const SHOULDER_Y = 1.12;
// Shoulders sit OUTBOARD of the 0.60-wide torso, not flush with it. Flush
// shoulders hide the arms inside the body silhouette from the front and the
// back — two of the three angles the follow camera actually shows — and a
// character with no visible arms cannot read as a character.
// 0.375, not 0.345: at the old offset the arm's inner edge (0.25) sat 5 cm
// INSIDE the torso's half-width (0.30), so two laminated stacks interpenetrated
// down their whole length — which is what produced the visible seams and the
// z-fighting flicker along the hero's sides. The arm now clears the torso ply
// stack by ~4 cm and reads as a separate limb from every angle.
const SHOULDER_X = 0.375;
const HEAD_Y = 1.24;     // neck pivot
const LEG_LEN = 0.60;
const ARM_LEN = 0.52;

/**
 * Crown pivot, in head-local space, per crown kind.
 *
 * The head ball spans head-local y 0 .. 0.60, so a pivot at 0.30 is the CENTRE
 * of the skull — which buried the bottom 30 cm of every hat, plume and ear
 * inside the head and left only a nub showing. These sit just under the crown
 * of the skull, which is both where headgear actually rests and where an ear
 * actually hinges.
 */
const CROWN_Y = { crest: 0.44, hat: 0.52, ears: 0.47 };

/** Trim thickness. ~7 cm reads as card stock at this scale, not as a slab. */
const DEPTH = 0.07;

// Form depths — the numbers that give the hero a side view.
//
// The body forms are LAMINATED to these depths (see `laminate`); only trim
// stays a single 7 cm card. A head is very nearly as deep as it is wide because
// a head is a ball; a torso is about half its width; limbs are round-ish. The
// feet are the one form cut side-on, so FOOT_D is their WIDTH and their length
// lives in the outline.
const TORSO_D = 0.34;
const HEAD_D = 0.42;
const ARM_D = 0.20;
const LEG_D = 0.22;
const FOOT_D = 0.19;

// ── Class dress ────────────────────────────────────────────────────────────
// Every entry is a PAPER key. Darker plies are NOT new colours — they are the
// same colour multiplied down (geobuild's `lin`), exactly as props.js shades
// its layers, so the hero can never drift out of palette.
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

/** Ink for eyes. PAPER.inkTeal is the palette's stand-in for black — it is the
 *  ONLY place a near-dark is allowed, and it is a hue, not a neutral. */
const INK = PAPER.inkTeal;

/**
 * Resolve a party leader (hero object, hero id, or bare class name) to one of
 * the three dress kits. Unknown input dresses as a knight rather than throwing:
 * a corrupt save must never cost the player their avatar.
 */
export function heroClassOf(leader) {
  if (!leader) return 'knight';
  const raw = typeof leader === 'string' ? leader : (leader.class || leader.id || '');
  const s = String(raw).toLowerCase();
  if (s.includes('wizard')) return 'wizard';
  if (s.includes('bunny')) return 'bunny';
  return 'knight';
}

// ── Outline kit ────────────────────────────────────────────────────────────
// Point lists, not curves: THREE.Shape would happily take beziers, but every
// curve costs triangulation time and this silhouette language is deliberately
// faceted — a shape cut with scissors has straight runs between its turns.

function arcInto(pts, cx, cy, rx, ry, a0, a1, seg) {
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
}

/** Closed ellipse outline, centred on the origin. */
function ellipse(rx, ry, seg = 14) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

/** Rounded rectangle, centred on the origin. */
function roundRect(w, h, r, seg = 3) {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.max(0.001, Math.min(r, hw - 0.001, hh - 0.001));
  const pts = [];
  arcInto(pts, hw - rr, hh - rr, rr, rr, 0, Math.PI / 2, seg);
  arcInto(pts, -hw + rr, hh - rr, rr, rr, Math.PI / 2, Math.PI, seg);
  arcInto(pts, -hw + rr, -hh + rr, rr, rr, Math.PI, Math.PI * 1.5, seg);
  arcInto(pts, hw - rr, -hh + rr, rr, rr, Math.PI * 1.5, Math.PI * 2, seg);
  return pts;
}

/** Trapezoid: `wTop` wide at +h/2, `wBot` wide at -h/2, corners softened. */
function taper(wTop, wBot, h, r = 0.05) {
  const ht = h / 2;
  return [
    [wTop / 2 - r, ht], [wTop / 2, ht - r],
    [wBot / 2, -ht + r], [wBot / 2 - r, -ht],
    [-wBot / 2 + r, -ht], [-wBot / 2, -ht + r],
    [-wTop / 2, ht - r], [-wTop / 2 + r, ht],
  ];
}

/** Limb blank: a stadium (capsule outline) hanging DOWN from the origin. */
function limb(w, len, r = null) {
  const rr = r == null ? w / 2 : r;
  const pts = [];
  arcInto(pts, 0, -rr * 0.15, w / 2 - (w / 2 - rr), rr, 0, Math.PI, 6);
  // Straight run down the back, cap, straight run up the front.
  pts.push([-w / 2, -len + rr]);
  arcInto(pts, 0, -len + rr, w / 2, rr, Math.PI, Math.PI * 2, 6);
  pts.push([w / 2, -rr * 0.15]);
  return pts;
}

/** Five-pointed star, for the wizard's hat and the knight's chest emblem. */
function star(rOuter, rInner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// ── Ply stamping ───────────────────────────────────────────────────────────

function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

/**
 * Splay the front/back cap normals outward from (cx, cy) so a flat card shades
 * like a softly domed one under the toon ramp. Only the caps are touched; the
 * extrusion walls keep their true normals, which is what keeps the silhouette
 * crisp. See the header for why this exists.
 */
function roundFace(geo, cx, cy, amount) {
  const n = geo.attributes.normal.array;
  const p = geo.attributes.position.array;
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(n[i + 2]) < 0.7) continue;
    const dx = p[i] - cx;
    const dy = p[i + 1] - cy;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    const nx = n[i] + (dx / l) * amount;
    const ny = n[i + 1] + (dy / l) * amount;
    const nz = n[i + 2];
    const m = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / m;
    n[i + 1] = ny / m;
    n[i + 2] = nz / m;
  }
}

/**
 * Stamp one ply into a node sink.
 *
 * `axis` picks which way the sheet faces. 'z' (default) lays the outline in the
 * X-Y plane and extrudes toward the hero's front — the normal case, where the
 * silhouette that matters is the front view. 'x' lays it in the Z-Y plane and
 * extrudes sideways, for the handful of forms whose CHARACTER is their side
 * view and not their front one: a foot is a foot because of its profile, and
 * cutting it from the front leaves a 12 cm stub.
 *
 * @param {object} s      geobuild sink
 * @param {number[][]} pts outline, authored around its own origin
 * @param {object} o      { color, shade, x, y, z, rot, depth, round, axis, sx, sy }
 */
function ply(s, pts, o) {
  const depth = o.depth ?? DEPTH;
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth, bevelEnabled: false, curveSegments: 2, steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  roundFace(geo, 0, 0, o.round ?? 0.42);
  // Ry(-90 deg) sends the outline's +x to world +z (the hero's facing) and the
  // extrusion to world -x, so an 'x' sheet stacks sideways with its profile
  // pointing forward. Rz still runs first, so `rot` keeps meaning "turn the
  // outline in its own plane" for both axes.
  const ry = o.axis === 'x' ? -Math.PI / 2 : 0;
  stamp(
    s, geo,
    trs(o.x || 0, o.y || 0, o.z || 0, 0, ry, o.rot || 0, o.sx ?? 1, o.sy ?? 1, 1),
    lin(o.color, o.shade ?? 1),
  );
  return 1;
}

/**
 * Laminate a FORM out of `sheets` plies stacked along the depth axis, each cut
 * from the same outline and scaled by a depth profile.
 *
 * THIS IS THE WHOLE REASON THE HERO HAS A BODY.
 *
 * A single extruded card is a perfect front silhouette and nothing at all from
 * the side — at 90 deg the old rig lost 71% of its area and collapsed to a
 * 26 cm sliver, which the follow camera exposes on every turn (it lerps at
 * 0.12 while the controller yaws at 10 rad/s, so a hard turn holds tens of
 * degrees of offset for most of a second). Billboarding the rig would fix the
 * picture and break the art: the hero would swim against a world that is
 * honestly modelled.
 *
 * So he is built the way layered-papercut sculpture is actually built — a stack
 * of sheets, each cut a little smaller than the one behind it, where the
 * STACK's envelope is the form. The side view is now a real profile, every
 * sheet rim catches the sun as a lit step, and the laminations give the
 * silhouette an implicit edge without a single dark outline. One node is still
 * one draw call: every sheet lands in the same sink.
 *
 * The profile is a two-sided superellipse — `pF` shapes the front half and `pB`
 * the back — because a body is not symmetric front-to-back. A chest is broad
 * and flat and the back of a skull is round, and one exponent each says so.
 *
 * @param {object} o { color, shade, x, y, z, rot, depth, sheets, round, axis,
 *                     pF, pB, q, flatY, back }
 */
function laminate(s, pts, o) {
  const n = o.sheets ?? 5;
  const D = o.depth;
  // Sheets overlap (fill > 1) so the stack reads as one solid form rather than
  // a louvre with daylight between the slats. 1.16, not 1.06: at the old value
  // the stack still read as discrete STEPS from a three-quarter view — which is
  // the angle the follow camera actually holds — and stepped forms are exactly
  // what "a stack of misaligned teal boxes" describes. The extra overlap costs
  // nothing (the sheets are already drawn) and closes the envelope.
  const sheetD = (D / n) * (o.fill ?? 1.16);
  const pF = o.pF ?? 6;
  const pB = o.pB ?? 3;
  const q = o.q ?? 0.30;
  // How much less the HEIGHT tapers than the width. A torso keeps its length
  // as it rounds off; a head is a ball and tapers equally.
  const flatY = o.flatY ?? 0.5;
  // Shade at the BACK-most sheet, ramping to 1.0 at the front. Keep this
  // SHALLOW. The front sheet is the smallest one, so every darker sheet behind
  // it shows as a rim — and a steep ramp turns that rim into a dark vignette
  // around every form, which read as mud on the coral bunny and cost the
  // palette its warmth. The lamination only has to be legible as an edge, and
  // a tenth of a stop is plenty for that.
  const back = o.back ?? 0.90;
  const shade = o.shade ?? 1;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;              // 0 = back sheet, 1 = front sheet
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
  return n;
}

/** Where a laminated form's front face sits, so trim can be laid on top of it. */
function faceZ(depth, sheets = 5, fill = 1.06) {
  return depth * 0.5 * ((sheets - 1) / sheets) + (depth / sheets) * fill * 0.5;
}

/** Lateral scale of a laminated form's front sheet — trim must fit inside it. */
function faceK(sheets = 5, pF = 6, q = 0.30) {
  const t = 1 - 1 / sheets;
  return Math.pow(Math.max(0, 1 - Math.pow(t, pF)), q);
}

// ── Node builders ──────────────────────────────────────────────────────────
// Each returns { geo, plies }. Origins are the ANIMATION PIVOTS: the torso is
// built up from its hip, the limbs hang down from their joint, the head sits on
// its neck. That is what lets update() write raw rotations with no correction.

function buildTorso(C, cls) {
  const s = sink();
  let n = 0;
  const h = 0.66;
  const midY = h / 2;
  // The body: one laminated block, broad and flat across the chest (pF 6) and
  // rounding away toward the back (pB 2.6), which is the difference between a
  // torso and a brick.
  // The body sits a step DOWN from the head. Head, torso and arms were all cut
  // from one colour at one value, so from any angle that hides the face the
  // hero was a single teal column — no neck, no shoulder line, no head. Three
  // values (head 1.08 / torso 0.94 / arms 0.88) is the cheapest way to give a
  // 40-pixel character three readable masses, and because every one of them is
  // a multiply on the same PAPER colour the dress kit cannot drift.
  n += laminate(s, roundRect(0.60, h, 0.17), {
    color: C.base, shade: 0.94, y: midY, depth: TORSO_D,
    sheets: 5, pF: 4.2, pB: 2.6, q: 0.30, flatY: 0.45,
  });
  // Front face of the stack — everything below is laid ON it, not floating.
  const fz = faceZ(TORSO_D);
  // A band (belt, sash, collar) goes AROUND a body, so it is laminated too.
  // Trim that only exists on the front is exactly how the old rig ended up
  // with a blank side view.
  const band = (pts, y, color, shade, rot) => laminate(s, pts, {
    color, shade, y, rot, depth: TORSO_D * 1.03,
    sheets: 3, pF: 5, pB: 3, q: 0.22, flatY: 0.15, back: 0.91,
  });
  if (cls === 'knight') {
    n += ply(s, taper(0.40, 0.32, 0.40, 0.08), { color: C.light, y: midY + 0.08, z: fz + 0.006 });
    n += ply(s, star(0.10, 0.045), { color: C.trim, y: midY + 0.12, z: fz + 0.028, round: 0.2 });
    n += band(roundRect(0.62, 0.11, 0.04), 0.10, C.trim, 1, 0);
    n += band(taper(0.66, 0.42, 0.13, 0.05), h - 0.05, C.light, 1.06, 0);
  } else if (cls === 'wizard') {
    n += ply(s, taper(0.24, 0.44, h - 0.06, 0.07), { color: C.light, y: midY - 0.02, z: fz + 0.006 });
    n += ply(s, star(0.085, 0.038), { color: C.trim, y: midY + 0.13, z: fz + 0.028, round: 0.2 });
    n += band(roundRect(0.60, 0.10, 0.04), 0.13, C.trim, 1, -0.10);
    n += band(taper(0.62, 0.36, 0.15, 0.06), h - 0.04, C.accent, 1, 0);
  } else {
    n += ply(s, ellipse(0.19, 0.23, 12), { color: C.trim, y: midY - 0.05, z: fz + 0.006 });
    n += ply(s, ellipse(0.055, 0.055, 8), { color: C.accent, y: midY + 0.17, z: fz + 0.026, round: 0.2 });
    n += band(roundRect(0.58, 0.09, 0.04), 0.11, C.accent, 1, 0);
    n += band(taper(0.54, 0.32, 0.12, 0.05), h - 0.04, C.light, 1, 0);
  }
  // A tail of paper at the small of the back — the one ply whose whole job is
  // to be seen from behind and from the side, where a front card shows nothing.
  n += laminate(s, taper(0.34, 0.20, 0.26, 0.06), {
    color: C.base, shade: 0.80, y: 0.16, z: -TORSO_D * 0.42, rot: 0,
    sheets: 2, depth: 0.09, pF: 4, pB: 4, q: 0.25, flatY: 0.2, back: 0.934,
  });
  return { geo: bake(s), plies: n };
}

function buildHead(C, cls) {
  const s = sink();
  let n = 0;
  const R = 0.30;
  // A very flat face (pF 8) on a round cranium (pB 2.2): the profile that makes
  // a head read as a head from the side and still gives the features a broad
  // flat card to sit on from the front.
  const core = cls === 'wizard' ? C.skin : C.base;
  // pF 4.6, not 8. A superellipse exponent that high keeps the front sheets at
  // nearly full size, so the stack came out a DRUM — straight sides, a hard top
  // rim and a flat face, which is most of why the rig read as boxes. 4.6 still
  // leaves the front sheet broad enough to carry the features (they are laid on
  // it below, and faceK() measures exactly that) while the envelope actually
  // turns into a skull.
  n += laminate(s, ellipse(R, R, 16), {
    color: core, shade: 1.08, y: R, depth: HEAD_D,
    sheets: 5, pF: 4.6, pB: 2.4, q: 0.32, flatY: 1, back: 0.88,
  });
  // Neck: a dark collar ring under the skull. Without it the head's bottom
  // edge lands straight on the torso's top edge and the two masses fuse — the
  // single most damaging thing that can happen to a character silhouette.
  n += laminate(s, ellipse(R * 0.62, R * 0.24, 10), {
    color: core, shade: 0.72, y: 0.02, depth: HEAD_D * 0.74,
    sheets: 2, pF: 3, pB: 2.4, q: 0.30, flatY: 0.4, back: 0.94,
  });
  const fz = faceZ(HEAD_D);
  if (cls === 'knight') {
    // Face opening in the helm, then the brow BAND (laminated — a helm wraps a
    // skull) and a nose guard dropping out of it.
    n += ply(s, ellipse(0.205, 0.215, 14), { color: C.skin, y: R - 0.015, z: fz + 0.005 });
    // The brow band of the helm. pF 7 at nearly the head's own depth made this
    // a BOX sitting on a ball, and because it is the widest thing at head
    // height it was the silhouette the whole character was being judged on.
    // A low exponent wraps it round the skull instead.
    n += laminate(s, taper(0.54, 0.58, 0.20, 0.08), {
      color: C.base, shade: 1.14, y: R + 0.160, depth: HEAD_D * 0.90,
      sheets: 3, pF: 3.0, pB: 2.4, q: 0.30, flatY: 0.3, back: 0.904,
    });
    n += ply(s, roundRect(0.085, 0.28, 0.04), { color: C.base, shade: 1.12, y: R + 0.015, z: fz + 0.022 });
  } else if (cls === 'wizard') {
    // Hair: a fringe card in front and a laminated mass at the back, so the
    // side view has a head of hair rather than a bald profile.
    n += ply(s, taper(0.48, 0.30, 0.15, 0.06), { color: C.trim, shade: 0.92, y: R + 0.185, z: fz + 0.004 });
    // Under-ply first: a darker mass set back and slightly larger than the
    // lobes in front of it, so the hair has a shaded root rather than a flat
    // silhouette. Without it a laminated ellipse is one orange blob whichever
    // way it is lit.
    n += laminate(s, ellipse(R * 0.98, R * 0.90, 12), {
      color: C.trim, shade: 0.70, y: R + 0.02, z: -HEAD_D * 0.24, depth: HEAD_D * 0.52,
      sheets: 2, pF: 3, pB: 2.2, q: 0.30, flatY: 0.9, back: 0.93,
    });
    // Three offset lobes. Hair is a bundle of masses catching light at
    // different angles; ONE ellipse is a helmet, and the eye reads a helmet as
    // "the modeller stopped here".
    for (const [ox, oy, sc, sh] of [
      [-0.135, 0.005, 0.80, 0.80],
      [0.140, -0.010, 0.76, 0.88],
      [0.005, 0.075, 0.94, 0.98],
    ]) {
      n += laminate(s, ellipse(R * 0.80 * sc, R * 0.74 * sc, 12), {
        color: C.trim, shade: 0.86 * sh + 0.14, x: ox, y: R + 0.04 + oy,
        z: -HEAD_D * 0.14, depth: HEAD_D * 0.62,
        sheets: 2, pF: 3, pB: 2.2, q: 0.30, flatY: 0.9, back: 0.91,
      });
    }
  } else {
    n += ply(s, ellipse(0.175, 0.135, 12), { color: C.trim, y: R - 0.105, z: fz + 0.006 });
    n += ply(s, ellipse(0.035, 0.028, 8), { color: C.accent, y: R - 0.05, z: fz + 0.026, round: 0.2 });
    // Cheek tufts, one per side, angled out — reads from three-quarter and side.
    for (const side of [-1, 1]) {
      n += ply(s, taper(0.05, 0.14, 0.15, 0.03), {
        color: C.light, x: side * 0.245, y: R - 0.055, z: fz - 0.05,
        rot: side * -0.5, depth: 0.10,
      });
    }
  }
  // Eyes last, sitting proud of everything. Two plies, and they are the whole
  // reason the rig reads as a character rather than a mannequin.
  const eyeY = cls === 'knight' ? R + 0.03 : R + 0.045;
  const eyeX = 0.115;
  const eyeR = 0.042;
  const ez = fz + 0.032;
  n += ply(s, ellipse(eyeR, eyeR * 1.15, 8), { color: INK, x: -eyeX, y: eyeY, z: ez, depth: 0.02, round: 0.15 });
  n += ply(s, ellipse(eyeR, eyeR * 1.15, 8), { color: INK, x: eyeX, y: eyeY, z: ez, depth: 0.02, round: 0.15 });
  return { geo: bake(s), plies: n };
}

/** Crown = whatever sits on the head and lags behind it. */
function buildCrown(C, cls) {
  const s = sink();
  let n = 0;
  if (cls === 'crest') {
    // A plume: a laminated fin running FRONT-TO-BACK over the helm, so it is
    // widest exactly where a card would have been invisible.
    // A comb that RISES and sweeps back. Cut side-on, so its shape lives in the
    // profile where a helm crest is actually read, and laminated only 14 cm
    // across so it stays a plume and not a fin.
    const comb = [
      [0.07, -0.02], [0.11, 0.11], [0.05, 0.23], [-0.07, 0.29],
      [-0.18, 0.25], [-0.21, 0.13], [-0.15, 0.03], [-0.07, -0.02],
    ];
    // Two plies: a darker ply set back, a bright one proud of it. This is the
    // one place the lamination is SUPPOSED to read as separate sheets.
    // Two plies with a REAL value step between them (0.82 / 1.16). At 1.00 and
    // 1.08 the plume read as one coral blob sitting on the helm; a plume is a
    // bundle of feathers and needs a lit edge over a shaded body to say so.
    n += laminate(s, comb.map(([u, v]) => [u * 0.88, v * 0.90]), {
      color: C.accent, shade: 0.82, y: 0.05, z: -0.02, axis: 'x', depth: 0.10,
      sheets: 3, pF: 2.6, pB: 2.6, q: 0.40, flatY: 0.55, back: 0.94,
    });
    n += laminate(s, comb.map(([u, v]) => [u * 0.66, v * 0.74]), {
      color: C.accent, shade: 1.16, y: 0.085, z: 0.015, axis: 'x', depth: 0.108,
      sheets: 2, pF: 2.6, pB: 2.6, q: 0.40, flatY: 0.55, back: 0.95,
    });
    // Helm ridge the comb is socketed into.
    n += laminate(s, roundRect(0.26, 0.075, 0.03), {
      color: C.trim, y: 0.005, depth: 0.28,
      sheets: 3, pF: 4, pB: 4, q: 0.26, flatY: 0.2, back: 0.94,
    });
  } else if (cls === 'hat') {
    // Wizard cone with a flopped tip. Laminated to a near-circular profile so
    // it is a cone from every side instead of a card from one.
    const cone = [
      [-0.30, 0.0], [0.30, 0.0], [0.20, 0.26], [0.11, 0.46],
      [0.12, 0.60], [0.02, 0.62], [-0.02, 0.46], [-0.10, 0.24],
    ];
    n += laminate(s, cone, {
      color: C.base, y: 0.03, depth: 0.40,
      sheets: 5, pF: 2.4, pB: 2.4, q: 0.44, flatY: 0.85, back: 0.898,
    });
    n += laminate(s, roundRect(0.64, 0.09, 0.035), {
      color: C.trim, y: 0.03, depth: 0.52,
      sheets: 3, pF: 3.4, pB: 3.4, q: 0.30, flatY: 0.2, back: 0.916,
    });
    n += ply(s, star(0.065, 0.028), { color: C.trim, shade: 1.15, x: 0.02, y: 0.30, z: 0.10, depth: 0.03, round: 0.2 });
  } else {
    // Bunny ears. An ear IS a flat thing, so this is the one form the old
    // construction had right — but it still gets laminated, because an ear seen
    // edge-on should be a lens, not a razor.
    const ear = [
      [-0.075, 0], [0.075, 0], [0.085, 0.22], [0.055, 0.42],
      [0, 0.50], [-0.055, 0.42], [-0.085, 0.22],
    ];
    const inner = ear.map(([x, y]) => [x * 0.52, y * 0.86 - 0.01]);
    for (const side of [-1, 1]) {
      n += laminate(s, ear, {
        color: C.base, x: side * 0.12, y: 0, rot: side * 0.22, depth: 0.11,
        sheets: 3, pF: 2.4, pB: 2.4, q: 0.40, flatY: 0.25, back: 0.91,
      });
      n += ply(s, inner, {
        color: C.accent, x: side * 0.135, y: 0.03, z: 0.05, rot: side * 0.22, depth: 0.03,
      });
    }
  }
  return { geo: bake(s), plies: n };
}

/**
 * How much darker an arm is than the torso it hangs beside.
 *
 * The hero read as one teal mass at 40 px because the arms were cut from the
 * same value as the body: two forms in the same colour, at the same value,
 * touching, are one form. A tenth of a stop of separation is all it takes, and
 * because it is a MULTIPLY on the same palette colour it cannot introduce a
 * hue the dress kit did not already have.
 */
const ARM_SHADE = 0.88;

function buildArm(C, cls, side) {
  const s = sink();
  let n = 0;
  n += laminate(s, limb(0.19, ARM_LEN), {
    color: C.base, shade: ARM_SHADE, y: 0, depth: ARM_D,
    sheets: 3, pF: 3.2, pB: 3.2, q: 0.36, flatY: 0.15, back: 0.916,
  });
  // Hand / paw / cuff at the far end — a ball, laminated round.
  n += laminate(s, ellipse(0.105, 0.098, 10), {
    color: cls === 'bunny' ? C.trim : C.light, shade: ARM_SHADE,
    y: -ARM_LEN + 0.03, depth: ARM_D * 1.05,
    sheets: 3, pF: 2.2, pB: 2.2, q: 0.42, flatY: 0.9, back: 0.922,
  });
  if (cls === 'knight') {
    // Pauldron: the form that gives the knight a shoulder line, capped over the
    // whole joint rather than pinned to its front.
    n += laminate(s, taper(0.30, 0.21, 0.17, 0.07), {
      color: C.light, shade: ARM_SHADE, x: side * 0.02, y: -0.05, depth: ARM_D * 1.3,
      sheets: 3, pF: 2.8, pB: 2.8, q: 0.38, flatY: 0.35, back: 0.91,
    });
  }
  return { geo: bake(s), plies: n };
}

function buildLeg(C, cls) {
  const s = sink();
  let n = 0;
  const col = cls === 'wizard' ? C.accent : C.base;
  n += laminate(s, limb(0.21, LEG_LEN), {
    color: col, shade: 0.92, y: 0, depth: LEG_D,
    sheets: 3, pF: 3.2, pB: 3.2, q: 0.36, flatY: 0.12, back: 0.916,
  });
  // Boot cuff. A leg that runs from hip to floor in one colour is a peg; the
  // cuff is where the eye reads the knee-to-ankle length, and it is the only
  // thing giving the lower leg a joint from behind.
  n += laminate(s, roundRect(0.235, 0.10, 0.04), {
    color: C.shoe, shade: 0.92, y: -LEG_LEN + 0.16, depth: LEG_D * 1.06,
    sheets: 2, pF: 3.4, pB: 3.4, q: 0.28, flatY: 0.2, back: 0.94,
  });
  // Foot. Cut SIDE-ON (axis 'x') and laminated across: a foot's silhouette is
  // its profile, and the old front-cut card left a 12 cm stub that read as a
  // block. Toe forward at +z, heel behind — so a leg swing shows a footfall.
  const footSide = [
    [-0.085, 0.105], [0.075, 0.105], [0.145, 0.062], [0.155, 0.012],
    [0.115, -0.022], [-0.095, -0.022], [-0.115, 0.02], [-0.11, 0.075],
  ];
  n += laminate(s, footSide, {
    color: C.shoe, y: -LEG_LEN + 0.045, z: 0.012, axis: 'x', depth: FOOT_D,
    sheets: 3, pF: 3.6, pB: 3.6, q: 0.30, flatY: 0.25, back: 0.916,
  });
  // SOLE. Every vertex of this outline is strictly INSIDE the boot's — the old
  // rig had a pale ply reaching past the boot silhouette, which at hero-closeup
  // distance read as a white wedge and was reported as a rendering bug rather
  // than as a shoe. It is also darker, which gives the foot a ground line: a
  // pale boot with no sole meets the grass at no value at all.
  const sole = [
    [-0.098, 0.020], [0.120, 0.020], [0.140, 0.004],
    [0.106, -0.016], [-0.086, -0.016], [-0.106, 0.002],
  ];
  n += laminate(s, sole, {
    color: C.shoe, shade: 0.74, y: -LEG_LEN + 0.045, z: 0.012, axis: 'x', depth: FOOT_D * 0.94,
    sheets: 2, pF: 3.6, pB: 3.6, q: 0.28, flatY: 0.2, back: 0.94,
  });
  return { geo: bake(s), plies: n };
}

// ── Animation tuning ───────────────────────────────────────────────────────
const ANIM = {
  walkSpeed: DEFAULT_TUNING.speed,
  runSpeed: DEFAULT_TUNING.runSpeed,
  strideHz: 3.35,       // cycle radians per metre travelled
  armSwing: 0.42,       // radians at walk, scaled up toward run
  armSwingRun: 0.52,
  legSwing: 0.50,
  legSwingRun: 0.42,
  bob: 0.055,           // metres, at walk
  bobRun: 0.045,
  leanRun: 0.20,        // forward pitch at full run
  turnLean: 0.115,      // roll per rad/s of yaw rate
  turnLeanMax: 0.34,
  breathHz: 1.45,
  swayHz: 0.62,
  wadeSink: 0.20,
  wadeSplay: 0.42,
  squashDecay: 4.4,
  landMinFall: 2.5,     // m/s of descent before a landing registers
  speedDamp: 11,
  yawDamp: 7,
};

// ── Contact shadow ─────────────────────────────────────────────────────────

/**
 * Alpha at the shadow's core, before the altitude falloff.
 *
 * The old blob was a UNIFORM ellipse at 0.26 — the same value under the boots
 * as at its outer edge — which is why the hero read as floating on a soft grey
 * smudge instead of standing on the ground. A real contact shadow is nearly
 * opaque where the form touches and gone a body-width away, and that GRADIENT
 * is the whole cue: it is what tells a five-year-old which pixel is the point
 * of contact.
 */
const BLOB_ALPHA = 0.46;

/**
 * Radial alpha profile of the contact shadow, as [normalised radius, alpha].
 *
 * Read against the ~1.2 m outer radius the rig scales this to: full strength
 * inside 0.3 m of the feet, roughly a third of it by 1.2 m. The falloff is
 * carried in VERTEX ALPHA rather than in the material, so `material.opacity`
 * stays free to be the single dial altitude and wading fade the whole thing
 * with — one number per frame, no texture, no second draw call.
 */
const BLOB_STOPS = [[0, 1.0], [0.26, 0.96], [0.55, 0.58], [1.0, 0.30]];
const BLOB_SEGMENTS = 20;

/** Ring-fanned disc carrying the profile above, plus UVs for the deckle tear. */
function buildContactBlobGeo() {
  const pos = [], nrm = [], col = [], uv = [];
  const push = (r, a, ang) => {
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    pos.push(x, 0, z);
    nrm.push(0, 1, 0);
    col.push(1, 1, 1, a);
    // The deckle mask's mean tear sits at 0.84 of its own radius, so mapping
    // the geometric rim to mask radius 1.0 lets the tear bite inside the
    // triangles instead of at an edge nobody can see.
    uv.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  };
  for (let k = 0; k < BLOB_STOPS.length - 1; k++) {
    const [r0, a0] = BLOB_STOPS[k];
    const [r1, a1] = BLOB_STOPS[k + 1];
    for (let i = 0; i < BLOB_SEGMENTS; i++) {
      const t0 = (i / BLOB_SEGMENTS) * Math.PI * 2;
      const t1 = ((i + 1) / BLOB_SEGMENTS) * Math.PI * 2;
      if (r0 === 0) {
        push(0, a0, t0); push(r1, a1, t0); push(r1, a1, t1);
      } else {
        push(r0, a0, t0); push(r1, a1, t0); push(r1, a1, t1);
        push(r0, a0, t0); push(r1, a1, t1); push(r0, a0, t1);
      }
    }
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

// ── Particle pools ─────────────────────────────────────────────────────────
const DUST_MAX = 20;
const MOTE_MAX = 24;

function makePool(n) {
  const pool = new Array(n);
  for (let i = 0; i < n; i++) {
    pool[i] = {
      live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      age: 0, life: 1, size: 0.2, grow: 0.4, tilt: 0, spin: 0, twist: 0, hue: 0, dirty: true,
    };
  }
  return pool;
}

/**
 * Build the hero.
 * @param {{ leader?:any, heroClass?:string, castShadow?:boolean }} [opts]
 */
export function createCharacterView(opts = {}) {
  const cls = opts.heroClass ? heroClassOf(opts.heroClass) : heroClassOf(opts.leader);
  const C = CLASSES[cls];
  const castShadow = opts.castShadow !== false;

  const geometries = [];
  const materials = [];

  // ONE material for every ply of every node: the plies differ by vertex
  // colour, not by material, which is what keeps 25 pieces of paper at 7 draw
  // calls. `space: 'local'` pins the paper grain to the mesh so it cannot swim
  // across the hero as he runs — he is the closest thing to the camera and is
  // the one surface where swimming grain would be obvious.
  const skin = papercutMaterial(0xffffff, {
    vertexColors: true,
    grain: 0.075, normal: 0.10, roughnessLike: 0.17, scale: 0.42, space: 'local',
    // Sun-bleach: shoulders, the crown of the head and the tops of the boots
    // fade warm while every tucked-under ply holds the teal cavity. On a rig
    // built entirely from flat cards that is a free form cue, and it does not
    // fade out when the hero walks into a tree's shadow.
    bleach: 0.28,
  });
  // THE HERO IS THE ONE SURFACE IN THE WORLD THAT GETS A RIM.
  //
  // Odyssey keeps Mario value-separated from his backdrop as a hard rule, and
  // ours broke it outright: a mid-teal knight on mid-green grass at effectively
  // equal luma, which is a character who dissolves into the exact frame that
  // exists to show him off. The palette law forbids the obvious fix (a dark
  // outline), and we cannot control what he happens to be standing in front
  // of. A rim solves it from the character's side: cream light catching the
  // paper edge, additive after the toon ramp so it survives into shade, which
  // is precisely when he most needs an edge.
  applyRimLight(skin, { strength: 0.36, power: 3.0 });
  materials.push(skin);

  const group = new THREE.Group();
  group.name = 'hero';

  /** World-space effects. NOT a child of `group` — a dust puff is left behind,
   *  not carried. index.js adds this to the scene alongside the hero. */
  const fx = new THREE.Group();
  fx.name = 'hero-fx';

  const nodes = {};
  let plyCount = 0;
  const addNode = (name, built, parent, x, y, z) => {
    geometries.push(built.geo);
    plyCount += built.plies;
    const mesh = new THREE.Mesh(built.geo, skin);
    mesh.name = `hero-${name}`;
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    nodes[name] = mesh;
    return mesh;
  };

  // `rig` carries every whole-body transform (bob, lean, squash) so the contact
  // shadow — a sibling, not a child — never inherits them.
  const rig = new THREE.Group();
  rig.name = 'hero-rig';
  group.add(rig);

  const torso = addNode('torso', buildTorso(C, cls), rig, 0, HIP_Y, 0);
  const head = addNode('head', buildHead(C, cls), rig, 0, HEAD_Y, 0);
  const crownKind = cls === 'knight' ? 'crest' : cls === 'wizard' ? 'hat' : 'ears';
  addNode('crown', buildCrown(C, crownKind), head, 0, CROWN_Y[crownKind], 0);
  addNode('armL', buildArm(C, cls, -1), rig, -SHOULDER_X, SHOULDER_Y, 0);
  addNode('armR', buildArm(C, cls, 1), rig, SHOULDER_X, SHOULDER_Y, 0);
  addNode('legL', buildLeg(C, cls), rig, -0.155, HIP_Y, 0);
  addNode('legR', buildLeg(C, cls), rig, 0.155, HIP_Y, 0);
  const crown = nodes.crown;
  const armL = nodes.armL;
  const armR = nodes.armR;
  const legL = nodes.legL;
  const legR = nodes.legR;

  // ── Contact shadow ───────────────────────────────────────────────────────
  const blobGeo = buildContactBlobGeo();
  const blobMat = new THREE.MeshBasicMaterial({
    color: paperColor(PAPER.shadow), vertexColors: true, transparent: true,
    opacity: BLOB_ALPHA, depthWrite: false, fog: true, alphaMap: deckleDisc(),
  });
  geometries.push(blobGeo);
  materials.push(blobMat);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.name = 'hero-shadow';
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.035;
  blob.renderOrder = 1;
  group.add(blob);

  // ── Dust + motes ─────────────────────────────────────────────────────────
  // Flat torn discs lying near-horizontal: from a boom camera a horizontal
  // scrap reads as a puff of ground, and it needs no billboarding — which is
  // the point, because billboarding would need the camera in here.
  const puffGeo = new THREE.CircleGeometry(0.5, 9);
  puffGeo.rotateX(-Math.PI / 2);
  // A white vertex colour is REQUIRED, not decorative: three only compiles the
  // `diffuseColor *= vColor` line under USE_COLOR (material.vertexColors), and
  // instanceColor is folded into that same vColor. Without the attribute the
  // shader would read the unbound generic attribute — black — and swallow every
  // per-instance tint we set below.
  puffGeo.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(puffGeo.attributes.position.count * 3).fill(1), 3));
  geometries.push(puffGeo);
  const puffMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.55, depthWrite: false, fog: true,
    side: THREE.DoubleSide, alphaMap: deckleDisc(), vertexColors: true,
  });
  materials.push(puffMat);

  const mkPool = (max) => {
    const m = new THREE.InstancedMesh(puffGeo, puffMat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    m.frustumCulled = false;   // instances roam; the group's own bounds lie
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 2;
    m.count = max;
    return m;
  };
  const dustMesh = mkPool(DUST_MAX);
  dustMesh.name = 'hero-dust';
  const moteMesh = mkPool(MOTE_MAX);
  moteMesh.name = 'hero-motes';
  fx.add(dustMesh, moteMesh);

  const dust = makePool(DUST_MAX);
  const motes = makePool(MOTE_MAX);
  let dustHead = 0;
  let moteHead = 0;

  // Particle colours, resolved once. Dust is ground-coloured, splash is the
  // water's own teal, and every one of them fades by drifting toward cream
  // (the sky/fog colour) rather than by going transparent — per-instance alpha
  // would cost a custom attribute and a shader patch for 44 quads.
  const COL_DUST = new THREE.Color().setHex(PAPER.sand, THREE.SRGBColorSpace);
  const COL_STEP = new THREE.Color().setHex(PAPER.sage, THREE.SRGBColorSpace);
  const COL_SPLASH = new THREE.Color().setHex(PAPER.tealL, THREE.SRGBColorSpace);
  const COL_FADE = new THREE.Color().setHex(PAPER.cream, THREE.SRGBColorSpace);
  const PARTICLE_HUES = [COL_DUST, COL_STEP, COL_SPLASH];

  // ── Scratch (the whole no-allocation contract lives in these six) ────────
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  // ── Rig state ────────────────────────────────────────────────────────────
  const st = {
    t: null,          // last animation clock reading; null = "no dt yet"
    phase: 0,         // walk cycle, radians
    prevSin: 0,
    spd: 0,           // damped horizontal speed
    yaw: 0,
    yawRate: 0,
    grounded: true,
    airT: 0,
    fallV: 0,
    squash: 0,
    crownLag: 0,
    crownVel: 0,
    wade: 0,
    rnd: 0x9e3779b9,
  };

  /** Deterministic scatter. Math.random would desync the screenshot harness. */
  function rnd() {
    st.rnd = (Math.imul(st.rnd, 1664525) + 1013904223) >>> 0;
    return st.rnd / 4294967296;
  }

  function emit(pool, headIdx, x, y, z, o) {
    const p = pool[headIdx];
    p.live = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
    p.age = 0; p.life = o.life;
    p.size = o.size; p.grow = o.grow;
    p.tilt = o.tilt; p.spin = o.spin; p.twist = o.twist;
    p.hue = o.hue;
    p.dirty = true;
  }

  /** Landing: one expanding ground ring plus a scatter of kicked-up scraps. */
  function burst(x, y, z, power, water) {
    const hue = water ? 2 : 0;
    emit(dust, dustHead, x, y + 0.02, z, {
      vx: 0, vy: 0, vz: 0, life: 0.42 + 0.2 * power,
      size: 0.30, grow: 2.6 + 2.2 * power, tilt: 0, spin: rnd() * 6.28, twist: 0.6, hue,
    });
    dustHead = (dustHead + 1) % DUST_MAX;
    const n = 3 + Math.round(power * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
      const sp = (1.1 + rnd() * 1.5) * (0.5 + power);
      emit(dust, dustHead, x, y + 0.05, z, {
        vx: Math.cos(a) * sp, vy: 1.1 + rnd() * 1.4 * (water ? 1.9 : 1), vz: Math.sin(a) * sp,
        life: 0.45 + rnd() * 0.35,
        size: 0.16 + rnd() * 0.12, grow: 1.5, tilt: 0.5 + rnd() * 0.7, spin: rnd() * 6.28, twist: 2.2, hue,
      });
      dustHead = (dustHead + 1) % DUST_MAX;
    }
  }

  /** One footfall: a couple of scraps flicked backward off the planted foot. */
  function footMote(x, y, z, back, water) {
    const n = water ? 3 : 2;
    for (let i = 0; i < n; i++) {
      emit(motes, moteHead, x + (rnd() - 0.5) * 0.18, y + 0.04, z + (rnd() - 0.5) * 0.18, {
        vx: -back.x * (0.5 + rnd() * 0.7) + (rnd() - 0.5) * 0.5,
        vy: (water ? 1.5 : 0.75) + rnd() * 0.6,
        vz: -back.z * (0.5 + rnd() * 0.7) + (rnd() - 0.5) * 0.5,
        life: 0.35 + rnd() * 0.3,
        size: 0.075 + rnd() * 0.06, grow: 1.25,
        tilt: 0.4 + rnd() * 0.9, spin: rnd() * 6.28, twist: 3.0,
        hue: water ? 2 : 1,
      });
      moteHead = (moteHead + 1) % MOTE_MAX;
    }
  }
  const _back = { x: 0, z: 0 };

  function stepPool(pool, mesh, dt) {
    let dirtyM = false;
    let dirtyC = false;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.live) {
        if (p.dirty) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); p.dirty = false; dirtyM = true; }
        continue;
      }
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) { p.live = false; p.dirty = true; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 5.2 * dt;          // gentle, papery gravity — scraps float
      p.vx -= p.vx * 2.2 * dt;   // air drag
      p.vz -= p.vz * 2.2 * dt;
      p.spin += p.twist * dt;
      // Size envelope: pop open, then close. Shrinking IS the fade (see above).
      const sz = p.size * (1 + p.grow * u) * (u < 0.18 ? u / 0.18 : 1 - (u - 0.18) / 0.82 * 0.75);
      _v.set(p.x, p.y, p.z);
      _e.set(p.tilt * (1 - u), p.spin, 0);
      _q.setFromEuler(_e);
      _s.set(sz, sz, sz);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
      dirtyM = true;
      _c.copy(PARTICLE_HUES[p.hue]).lerp(COL_FADE, u * 0.85);
      mesh.setColorAt(i, _c);
      dirtyC = true;
    }
    if (dirtyM) mesh.instanceMatrix.needsUpdate = true;
    if (dirtyC && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function clearPool(pool, mesh) {
    for (let i = 0; i < pool.length; i++) {
      pool[i].live = false;
      pool[i].dirty = false;
      _m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Advance the rig.
   *
   * @param {{pos:{x,y,z}, vel:{x,y,z}, yaw:number, grounded:boolean, wading:boolean}} state
   *        the controller's state object — read only, never retained
   * @param {number} animT the animation clock (POSE_TIME while a pose is held,
   *        which pins dt to 0 and makes every pose screenshot reproducible)
   * @param {number} groundY terrain height under the player, for the shadow
   */
  function update(state, animT, groundY) {
    const dt = st.t == null ? 0 : Math.min(Math.max(animT - st.t, 0), 0.05);
    st.t = animT;

    group.position.set(state.pos.x, state.pos.y, state.pos.z);
    group.rotation.y = state.yaw;

    // ── Derived motion ──
    const rawSpd = Math.hypot(state.vel.x, state.vel.z);
    st.spd += (rawSpd - st.spd) * Math.min(1, ANIM.speedDamp * dt);
    const moveN = Math.min(1, st.spd / ANIM.walkSpeed);
    const runN = Math.max(0, Math.min(1, (st.spd - ANIM.walkSpeed) / (ANIM.runSpeed - ANIM.walkSpeed)));

    let dYaw = state.yaw - st.yaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    st.yaw = state.yaw;
    const rate = dt > 0 ? dYaw / dt : 0;
    st.yawRate += (rate - st.yawRate) * Math.min(1, ANIM.yawDamp * dt);

    const wadeTarget = state.wading ? 1 : 0;
    st.wade += (wadeTarget - st.wade) * Math.min(1, 6 * dt);

    const air = !state.grounded;
    if (air) {
      st.airT += dt;
      st.fallV = state.vel.y;
    } else if (st.airT > 0) {
      // Landing. Impact is the descent speed we were carrying one frame ago;
      // the controller has already zeroed vel.y by the time we see grounded.
      const impact = Math.max(0, -st.fallV);
      if (impact > ANIM.landMinFall) {
        const power = Math.min(1, (impact - ANIM.landMinFall) / 7);
        st.squash = Math.max(st.squash, 0.35 + 0.65 * power);
        if (dt > 0) burst(state.pos.x, state.pos.y, state.pos.z, power, state.wading);
      }
      st.airT = 0;
      st.fallV = 0;
    }
    const airW = air ? Math.min(1, st.airT / 0.14) : 0;
    st.squash = Math.max(0, st.squash - dt * ANIM.squashDecay);
    const sq = st.squash * st.squash * (3 - 2 * st.squash); // smoothstep ease-out

    // ── Walk cycle ──
    // Phase advances with DISTANCE, not with time, so a slow wade and a sprint
    // land the same number of footfalls per metre and the feet never skate.
    if (dt > 0) st.phase += st.spd * ANIM.strideHz * dt;
    const sw = Math.sin(st.phase);
    const cw = Math.cos(st.phase);

    // Footfall detection: a zero-crossing of the swing. Emits nothing while a
    // pose holds dt at 0, which is exactly what determinism requires.
    if (dt > 0 && !air && st.spd > 1.2) {
      const crossed = (st.prevSin <= 0 && sw > 0) || (st.prevSin >= 0 && sw < 0);
      if (crossed) {
        const side = sw > 0 ? 1 : -1;
        const sy = Math.sin(state.yaw);
        const cy = Math.cos(state.yaw);
        _back.x = sy;
        _back.z = cy;
        footMote(
          state.pos.x + cy * side * 0.16, state.pos.y, state.pos.z - sy * side * 0.16,
          _back, state.wading,
        );
      }
    }
    st.prevSin = sw;

    // ── Whole-body ──
    const breath = Math.sin(animT * ANIM.breathHz);
    const idle = 1 - moveN;
    const bobAmp = (ANIM.bob + (ANIM.bobRun - ANIM.bob) * runN) * moveN;
    const bob = -Math.abs(cw) * bobAmp + bobAmp * 0.5;
    const tuck = airW * (st.fallV > 0 ? 0.55 : 1);

    rig.position.y = bob
      + idle * breath * 0.012
      - st.wade * ANIM.wadeSink
      - sq * 0.10
      + airW * 0.04;
    rig.rotation.x = ANIM.leanRun * runN * 0.55 + moveN * 0.06
      + airW * (st.fallV > 0 ? 0.16 : -0.10)
      - st.wade * 0.05;
    let roll = -st.yawRate * ANIM.turnLean;
    if (roll > ANIM.turnLeanMax) roll = ANIM.turnLeanMax;
    else if (roll < -ANIM.turnLeanMax) roll = -ANIM.turnLeanMax;
    rig.rotation.z = roll * (0.35 + 0.65 * moveN) + idle * Math.sin(animT * ANIM.swayHz) * 0.014;
    // Squash on landing, a touch of stretch on the way up.
    const stretch = airW * (st.fallV > 0 ? 0.06 : 0.02);
    rig.scale.set(1 + sq * 0.16 - stretch * 0.5, 1 - sq * 0.22 + stretch, 1 + sq * 0.16 - stretch * 0.5);

    // ── Torso ──
    torso.rotation.y = -sw * 0.16 * moveN;
    torso.rotation.z = sw * 0.035 * moveN;
    torso.scale.set(1 + idle * breath * 0.012, 1 + idle * breath * 0.018, 1);

    // ── Head: counter-rotates the torso and holds the horizon ──
    head.rotation.y = sw * 0.09 * moveN + idle * Math.sin(animT * 0.41) * 0.10;
    head.rotation.x = -rig.rotation.x * 0.62 + Math.abs(cw) * 0.03 * moveN
      + idle * Math.sin(animT * 0.53 + 1.1) * 0.025;
    head.rotation.z = -roll * 0.4;

    // ── Crown: a spring chasing the head. This is the secondary motion that
    // makes ears flop and a plume trail; it is worth its own draw call. ──
    const crownTarget = -head.rotation.x * 0.9 - rig.rotation.x * 0.5 + sw * 0.05 * moveN
      + airW * 0.30 + sq * 0.35;
    if (dt > 0) {
      st.crownVel += (crownTarget - st.crownLag) * 55 * dt;
      st.crownVel -= st.crownVel * Math.min(1, 7.5 * dt);
      st.crownLag += st.crownVel * dt;
    } else {
      st.crownLag = crownTarget;
      st.crownVel = 0;
    }
    crown.rotation.x = st.crownLag;
    crown.rotation.z = roll * 0.55 + idle * Math.sin(animT * ANIM.swayHz + 0.8) * 0.03;

    // ── Arms ──
    const armAmp = (ANIM.armSwing + ANIM.armSwingRun * runN) * moveN;
    const armIdle = idle * (0.06 + breath * 0.03);
    const airArm = airW * (st.fallV > 0 ? -1.05 : -0.55);
    armL.rotation.x = -sw * armAmp * (1 - airW) + armIdle + airArm;
    armR.rotation.x = sw * armAmp * (1 - airW) + armIdle + airArm;
    const splay = 0.12 + runN * 0.05 + st.wade * ANIM.wadeSplay + airW * 0.28;
    armL.rotation.z = splay + idle * breath * 0.02;
    armR.rotation.z = -splay - idle * breath * 0.02;
    armL.rotation.y = -st.wade * 0.25;
    armR.rotation.y = st.wade * 0.25;

    // ── Legs ──
    const legAmp = (ANIM.legSwing + ANIM.legSwingRun * runN) * moveN;
    // Airborne: front knee up, back leg trailing — a tuck, not a T-pose.
    const tuckL = tuck * -0.85;
    const tuckR = tuck * 0.30;
    legL.rotation.x = sw * legAmp * (1 - airW) + tuckL;
    legR.rotation.x = -sw * legAmp * (1 - airW) + tuckR;
    legL.rotation.z = 0.02 + st.wade * 0.10;
    legR.rotation.z = -0.02 - st.wade * 0.10;
    const legSquash = 1 - sq * 0.30 - airW * 0.06;
    legL.scale.y = legSquash;
    legR.scale.y = legSquash;

    // ── Contact shadow ──
    // Tight and dark on the ground, wide and faint in the air: on a papercut
    // world with no ambient occlusion this blob is the only thing telling a
    // child how high they jumped.
    const gy = groundY == null ? state.pos.y : groundY;
    const alt = Math.max(0, state.pos.y - gy);
    const spread = Math.min(alt, 5) * 0.20;
    // 1.22 m at rest: the geometry is authored on a unit disc whose profile
    // (BLOB_STOPS) is written against exactly that outer radius.
    const bs = 1.22 + spread + sq * 0.42;
    blob.position.y = (gy - state.pos.y) + 0.035;
    blob.scale.set(bs, bs, 1);
    blobMat.opacity = BLOB_ALPHA / (1 + alt * 0.55) * (1 - st.wade * 0.5);

    // ── FX ──
    if (dt > 0) {
      stepPool(dust, dustMesh, dt);
      stepPool(motes, moteMesh, dt);
    }
  }

  /**
   * Return the rig to a canonical idle and drop every live particle. setPose /
   * teleport call this so a screenshot never inherits mid-stride state from
   * whatever the player was doing a frame earlier.
   */
  function reset() {
    st.t = null;
    st.phase = 0;
    st.prevSin = 0;
    st.spd = 0;
    st.yawRate = 0;
    st.airT = 0;
    st.fallV = 0;
    st.squash = 0;
    st.crownLag = 0;
    st.crownVel = 0;
    st.wade = 0;
    st.rnd = 0x9e3779b9;
    dustHead = 0;
    moteHead = 0;
    clearPool(dust, dustMesh);
    clearPool(motes, moteMesh);
  }
  reset();

  const nodeNames = Object.keys(nodes);
  let triangles = 0;
  for (const g of geometries) {
    if (g === puffGeo) continue; // pooled: counted per instance below
    const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    triangles += n / 3;
  }
  const puffTris = (puffGeo.index ? puffGeo.index.count : puffGeo.attributes.position.count) / 3;
  triangles += puffTris * (DUST_MAX + MOTE_MAX);

  const stats = {
    heroClass: cls,
    nodes: nodeNames.length,
    parts: nodeNames.length + 3,        // + shadow blob + two particle pools
    plies: plyCount,
    dustPool: DUST_MAX,
    motePool: MOTE_MAX,
    // 7 nodes + blob + 2 pools in colour; the nodes again in the shadow pass.
    colorPassCalls: nodeNames.length + 3,
    shadowPassCalls: castShadow ? nodeNames.length : 0,
    drawCalls: nodeNames.length + 3 + (castShadow ? nodeNames.length : 0),
    triangles: Math.round(triangles),
  };

  function dispose() {
    dustMesh.dispose();
    moteMesh.dispose();
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    fx.clear();
    group.clear();
    rig.clear();
    head.clear();
  }

  return { group, fx, nodes, update, reset, stats, dispose };
}
