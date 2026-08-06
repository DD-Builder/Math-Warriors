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
import { papercutMaterial, paperColor } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { sink, stamp, bake, lin, trs } from './geobuild.js';
import { DEFAULT_TUNING } from './controller.js';

// ── Proportions ────────────────────────────────────────────────────────────
// Chibi on purpose: a big head and short legs is what a 5-year-old draws when
// you ask them to draw a hero, and it stays readable at the 11 m camera boom.
const HIP_Y = 0.60;      // leg pivot / torso base
const SHOULDER_Y = 1.12;
const SHOULDER_X = 0.30;
const HEAD_Y = 1.24;     // neck pivot
const CROWN_Y = 0.30;    // crown pivot, in head-local space
const LEG_LEN = 0.60;
const ARM_LEN = 0.52;

/** Ply thickness. ~7 cm reads as card stock at this scale, not as a slab. */
const DEPTH = 0.07;

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
 * @param {object} s      geobuild sink
 * @param {number[][]} pts outline, authored around its own origin
 * @param {object} o      { color, shade, x, y, z, rot, depth, round }
 */
function ply(s, pts, o) {
  const depth = o.depth ?? DEPTH;
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth, bevelEnabled: false, curveSegments: 2, steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  roundFace(geo, 0, 0, o.round ?? 0.42);
  stamp(s, geo, trs(o.x || 0, o.y || 0, o.z || 0, 0, 0, o.rot || 0), lin(o.color, o.shade ?? 1));
  return 1;
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
  // Back ply first, a shade darker and a hair wider: the cut-paper trick that
  // gives a body an edge without an outline.
  n += ply(s, roundRect(0.62, h + 0.02, 0.17), { color: C.base, shade: 0.72, y: midY, z: -0.028 });
  n += ply(s, roundRect(0.56, h, 0.15), { color: C.base, y: midY, z: 0.018 });
  if (cls === 'knight') {
    n += ply(s, taper(0.42, 0.34, 0.40, 0.08), { color: C.light, y: midY + 0.08, z: 0.052 });
    n += ply(s, star(0.10, 0.045), { color: C.trim, y: midY + 0.12, z: 0.072, round: 0.2 });
    n += ply(s, roundRect(0.60, 0.11, 0.04), { color: C.trim, y: 0.10, z: 0.058 });
    n += ply(s, taper(0.66, 0.40, 0.13, 0.05), { color: C.light, shade: 1.06, y: h - 0.05, z: 0.046 });
  } else if (cls === 'wizard') {
    // Robe front: a long pale panel, then the sash across it.
    n += ply(s, taper(0.26, 0.46, h - 0.06, 0.07), { color: C.light, y: midY - 0.02, z: 0.052 });
    n += ply(s, star(0.085, 0.038), { color: C.trim, y: midY + 0.13, z: 0.072, round: 0.2 });
    n += ply(s, roundRect(0.58, 0.10, 0.04), { color: C.trim, y: 0.13, z: 0.058, rot: -0.10 });
    n += ply(s, taper(0.60, 0.34, 0.15, 0.06), { color: C.accent, y: h - 0.04, z: 0.040 });
  } else {
    n += ply(s, ellipse(0.19, 0.23, 12), { color: C.trim, y: midY - 0.05, z: 0.052 });
    n += ply(s, ellipse(0.055, 0.055, 8), { color: C.accent, y: midY + 0.17, z: 0.070, round: 0.2 });
    n += ply(s, roundRect(0.56, 0.09, 0.04), { color: C.accent, y: 0.11, z: 0.058 });
    n += ply(s, taper(0.52, 0.30, 0.12, 0.05), { color: C.light, y: h - 0.04, z: 0.040 });
  }
  return { geo: bake(s), plies: n };
}

function buildHead(C, cls) {
  const s = sink();
  let n = 0;
  const R = 0.30;
  const D = DEPTH * 1.6; // the head is the one form allowed real thickness
  // Back ply, then the face card, then features front-to-back in 1 cm steps.
  n += ply(s, ellipse(R + 0.02, R + 0.02, 16), { color: C.base, shade: 0.70, y: R, z: -0.03, depth: D });
  n += ply(s, ellipse(R, R, 16), { color: cls === 'bunny' ? C.base : C.skin, y: R, z: 0.02, depth: D });
  if (cls === 'knight') {
    // Helm brow: a band across the top third with a nose guard dropping out of
    // it. Reads as armour at 11 m and as a face at 2 m.
    n += ply(s, taper(0.56, 0.60, 0.22, 0.08), { color: C.base, y: R + 0.16, z: 0.075, depth: D * 0.6 });
    n += ply(s, roundRect(0.09, 0.30, 0.04), { color: C.base, shade: 1.12, y: R + 0.02, z: 0.085, depth: D * 0.6 });
  } else if (cls === 'wizard') {
    n += ply(s, taper(0.50, 0.30, 0.16, 0.06), { color: C.trim, shade: 0.92, y: R + 0.19, z: 0.070, depth: D * 0.6 });
  } else {
    n += ply(s, ellipse(0.17, 0.13, 12), { color: C.trim, y: R - 0.11, z: 0.078, depth: D * 0.5 });
    n += ply(s, ellipse(0.035, 0.028, 8), { color: C.accent, y: R - 0.055, z: 0.10, depth: D * 0.4, round: 0.2 });
  }
  // Eyes last, sitting proud of everything. Two plies, and they are the whole
  // reason the rig reads as a character rather than a mannequin.
  const eyeY = cls === 'knight' ? R + 0.03 : R + 0.045;
  const eyeX = 0.115;
  const eyeR = 0.042;
  n += ply(s, ellipse(eyeR, eyeR * 1.15, 8), { color: INK, x: -eyeX, y: eyeY, z: 0.095, depth: 0.02, round: 0.15 });
  n += ply(s, ellipse(eyeR, eyeR * 1.15, 8), { color: INK, x: eyeX, y: eyeY, z: 0.095, depth: 0.02, round: 0.15 });
  return { geo: bake(s), plies: n };
}

/** Crown = whatever sits on the head and lags behind it. */
function buildCrown(C, cls) {
  const s = sink();
  let n = 0;
  if (cls === 'crest') {
    // A plume: two overlapping teardrops leaning back off the helm.
    const plume = [[0, 0.34], [0.09, 0.16], [0.10, -0.02], [0.02, -0.10], [-0.07, -0.04], [-0.09, 0.14]];
    n += ply(s, plume, { color: C.accent, shade: 0.82, x: -0.03, y: 0.04, z: -0.02, rot: -0.22, depth: 0.05 });
    n += ply(s, plume, { color: C.accent, y: 0.06, z: 0.03, rot: -0.06, depth: 0.05 });
    n += ply(s, roundRect(0.30, 0.07, 0.03), { color: C.trim, y: -0.03, z: 0.05, depth: 0.05 });
  } else if (cls === 'hat') {
    // Wizard cone with a flopped tip — one ply, authored as a bent silhouette.
    const cone = [
      [-0.30, 0.0], [0.30, 0.0], [0.20, 0.26], [0.11, 0.46],
      [0.12, 0.60], [0.02, 0.62], [-0.02, 0.46], [-0.10, 0.24],
    ];
    n += ply(s, cone, { color: C.accent, shade: 0.80, y: 0.02, z: -0.03, depth: 0.09 });
    n += ply(s, cone, { color: C.base, y: 0.04, z: 0.03, depth: 0.09 });
    n += ply(s, roundRect(0.62, 0.09, 0.035), { color: C.trim, y: 0.03, z: 0.075, depth: 0.06 });
    n += ply(s, star(0.065, 0.028), { color: C.trim, shade: 1.15, x: 0.02, y: 0.30, z: 0.085, depth: 0.03, round: 0.2 });
  } else {
    // Bunny ears: outer + inner ply each, splayed apart so the pair has a V.
    const ear = [
      [-0.075, 0], [0.075, 0], [0.085, 0.22], [0.055, 0.42],
      [0, 0.50], [-0.055, 0.42], [-0.085, 0.22],
    ];
    const inner = ear.map(([x, y]) => [x * 0.52, y * 0.86 - 0.01]);
    for (const side of [-1, 1]) {
      n += ply(s, ear, { color: C.base, x: side * 0.12, y: 0.0, z: 0, rot: side * 0.22, depth: 0.055 });
      n += ply(s, inner, { color: C.accent, x: side * 0.135, y: 0.03, z: 0.032, rot: side * 0.22, depth: 0.03 });
    }
  }
  return { geo: bake(s), plies: n };
}

function buildArm(C, cls, side) {
  const s = sink();
  let n = 0;
  n += ply(s, limb(0.19, ARM_LEN), { color: C.base, shade: 0.94, z: 0 });
  n += ply(s, limb(0.165, ARM_LEN - 0.04), { color: C.base, shade: 1.06, z: 0.028 });
  // Hand / paw / cuff at the far end.
  n += ply(s, ellipse(0.105, 0.095, 10), {
    color: cls === 'bunny' ? C.trim : C.light, y: -ARM_LEN + 0.03, z: 0.038, depth: DEPTH * 1.1,
  });
  if (cls === 'knight') {
    // Pauldron: the one ply that gives the knight a shoulder line.
    n += ply(s, taper(0.30, 0.20, 0.17, 0.07), { color: C.light, x: side * 0.02, y: -0.05, z: 0.05 });
  }
  return { geo: bake(s), plies: n };
}

function buildLeg(C, cls) {
  const s = sink();
  let n = 0;
  const col = cls === 'wizard' ? C.accent : C.base;
  n += ply(s, limb(0.21, LEG_LEN), { color: col, shade: 0.78, z: -0.01 });
  n += ply(s, limb(0.185, LEG_LEN - 0.05), { color: col, shade: 0.90, z: 0.022 });
  // Foot: a wedge poking forward (+Z is the hero's facing), so a leg swing
  // actually shows a footfall instead of a floating stick.
  n += ply(s, roundRect(0.20, 0.13, 0.05), {
    color: C.shoe, y: -LEG_LEN + 0.045, z: 0.055, depth: DEPTH * 1.7,
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
  });
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
  addNode('crown', buildCrown(C, cls === 'knight' ? 'crest' : cls === 'wizard' ? 'hat' : 'ears'), head, 0, CROWN_Y, 0);
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
  const blobGeo = new THREE.CircleGeometry(0.62, 20);
  const blobMat = new THREE.MeshBasicMaterial({
    color: paperColor(PAPER.shadow), transparent: true, opacity: 0.26,
    depthWrite: false, fog: true, alphaMap: deckleDisc(),
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
    const bs = 0.90 + spread + sq * 0.42;
    blob.position.y = (gy - state.pos.y) + 0.035;
    blob.scale.set(bs, bs, 1);
    blobMat.opacity = 0.30 / (1 + alt * 0.55) * (1 - st.wade * 0.5);

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
