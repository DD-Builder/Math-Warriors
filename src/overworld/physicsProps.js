/**
 * The toybox's CONTENTS: five papercut objects, the forty-odd of them scattered
 * across the Garden and the Market, and the five puzzles where shoving them
 * about turns into arithmetic.
 *
 * WHY this is not part of physics.js: that module is an ENGINE — it knows about
 * mass, buoyancy and substeps and nothing at all about this game. This one is
 * CONTENT — it knows what a crate looks like, where the crates are, and what a
 * child has to do with them. The seam between them is `bodySpecFor`, which
 * turns "a crate, here" into the plain numbers the engine wants. Keeping the
 * seam means the engine can be tested without a single papercut triangle and
 * the puzzles can be tested without loading Rapier.
 *
 * ── WHY FIVE OBJECTS AND NOT FIFTEEN ──────────────────────────────────────
 * A toybox is judged by how many DIFFERENT THINGS you can do in it, not by how
 * many nouns it has. Five is the smallest set that spans the verbs:
 *
 *   crate   push, stack, weigh down.  Flat faces, high friction: it stays
 *           where you put it and it holds another crate on top, which is the
 *           entire foundation of "build a solution".
 *   ball    roll, launch, chase. Zero flat faces: it NEVER stays put, which is
 *           the opposite affordance and therefore the second one worth having.
 *   log     roll along one axis only. The interesting middle: it stays where
 *           you put it across a slope and runs away down one, so a hill stops
 *           being scenery and becomes a machine.
 *   plank   span, bridge, see-saw. The only long thin one, and the only object
 *           whose usefulness is about what it CONNECTS.
 *   leaf    blow. Almost massless and almost all sail, so it is the object that
 *           makes the weather visible — a garden that moves when the wind picks
 *           up is a garden that feels alive before you have touched anything.
 *
 * And their densities span the water: leaf 0.10, plank 0.50, crate 0.55, log
 * 0.62 all float at visibly different draughts, and the stone in the Market
 * sinks. A child can discover the rule.
 *
 * ── THE PAPERCUT LAW, APPLIED TO A THING THAT TUMBLES ─────────────────────
 * Every object here is built the same way the rest of the island is: layered
 * plies of cut paper with the layer shade baked into the vertex colour, one
 * merged geometry per kind, one InstancedMesh per kind. Two rules are specific
 * to these props because they are the only props in the world that ROTATE
 * freely:
 *
 *   1. TAPE SEAMS ARE MANDATORY, not decoration. A cube of coloured paper with
 *      no seam on it reads as a plastic box the moment it tumbles — there is
 *      nothing on the surface to tell you it turned. The tape strips wrap the
 *      silhouette across an edge, so they cross the profile as the body rolls
 *      and the rotation becomes legible. Same reason the log has a band round
 *      its middle and the ball has a belt over the pole.
 *   2. EVERY PLY IS PROUD OF THE ONE BELOW by 2-4 cm, so the cut edge catches
 *      the key light and lays a teal shadow on its neighbour. A flush lamination
 *      is invisible; a proud one is the whole look.
 *
 * The paper grain is sampled in LOCAL space for all five, because grain that
 * stays put while its surface rolls is the one way this effect reads as wrong.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth reads, no
 * fwidth, one InstancedMesh per kind (7 draw calls for the whole toybox), zero
 * allocation in update(), every colour from PAPER, and dispose() releases every
 * geometry, material and body this module made.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { toonMaterial, applyPapercut } from './materials/toon.js';
import { lin, trs, sink, stamp, bake } from './geobuild.js';
import { PHYS, shapeVolume, sailOf, windAccel } from './physics.js';

const TAU = Math.PI * 2;

// Shared scratch. Used at build time AND inside update(); none of it escapes,
// and the frame loop below must allocate nothing.
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

// ────────────────────────────────────────────────────────────────────────
// Pure data — kinds, materials, layout, puzzles. No three, all unit tested.
// ────────────────────────────────────────────────────────────────────────

/**
 * The five kinds, as plain numbers.
 *
 * `density` is relative to water (PHYS.fluidDensity === 1), so the column reads
 * as the answer to "does it float?" straight down the page.
 *
 * `sail` is a REAL drag group, 0.5 * rho_air * Cd * A, written through
 * `sailOf(area, cd)` so the table says what the object is rather than how
 * windy it feels. That distinction is not pedantry: the first version of this
 * file wrote `sail: 1.05` on the leaf meaning "very", and since a leaf masses
 * 8.6e-4 the resulting acceleration was 7e5 m/s^2 and Rapier's Rust core
 * trapped on frame one. What makes a leaf blow and a crate not is that
 * sail/mass differs between them by three orders of magnitude — and that
 * ratio comes out right on its own once the physical constant is in there.
 *
 * `flutter` is the lever arm, in metres, at which the wind push is applied:
 * how much this thing cartwheels rather than slides. Only the flat things
 * have one.
 *
 * `buoys` are local [x, y, z, share, span]:
 *   share  fraction of the displaced volume this point carries (sums to 1)
 *   span   vertical thickness of the slice it stands for — see physics.js
 *          `pointSubmergence` for why a point needs a thickness at all.
 */
export const PROP_KINDS = {
  crate: {
    shape: 'box', hx: 0.45, hy: 0.45, hz: 0.45,
    density: 0.55,                    // pine crate: floats, over half under
    friction: 0.86, restitution: 0.02,
    sail: sailOf(0.81, 1.05),         // one 0.9 m face, bluff body
    flutter: 0,
    // Four columns rather than one centre point: a crate that has been shoved
    // half off a ledge into a pond should tip in, not levitate flat.
    buoys: [
      [-0.26, 0, -0.26, 0.25, 0.9], [0.26, 0, -0.26, 0.25, 0.9],
      [-0.26, 0, 0.26, 0.25, 0.9], [0.26, 0, 0.26, 0.25, 0.9],
    ],
  },
  ball: {
    shape: 'ball', r: 0.44,
    density: 0.30,                    // rides high and bobs
    friction: 0.42, restitution: 0.48, // the only bouncy thing in the world
    // GRASS. Without this a ball never stops — see the damping note in
    // physics.js addBody. 0.85 lets a good shove carry it a satisfying 8-12 m
    // and then bleeds the spin so it settles instead of finding the sea.
    angDamp: 0.85, linDamp: 0.20,
    sail: sailOf(Math.PI * 0.44 * 0.44, 0.47),   // a sphere is a slippery shape
    flutter: 0,
    buoys: [[0, 0, 0, 1]],            // exact spherical cap; see physics.js
  },
  log: {
    // Rapier's cylinder axis is local +Y, so the log is MODELLED standing up
    // and laid down by the spawn rotation. Everything downstream — the render
    // geometry, the buoy points — is in that same standing frame.
    shape: 'cylinder', r: 0.34, halfHeight: 0.95,
    density: 0.62,                    // oak: floats low, rolls well
    friction: 0.62, restitution: 0.05,
    // Same reason as the ball, a little heavier-handed: a log rolls on ONE
    // axis, so once it finds the fall line nothing turns it off again. Measured
    // before this: four logs rolled 23-37 m in fifteen seconds of calm.
    angDamp: 1.05, linDamp: 0.22,
    sail: sailOf(1.9 * 0.68, 0.82),   // side-on cylinder
    flutter: 0,
    // One at each end, so a log lying in water rocks along its length instead
    // of bobbing like a cork.
    buoys: [[0, -0.58, 0, 0.5, 0.68], [0, 0.58, 0, 0.5, 0.68]],
  },
  plank: {
    shape: 'box', hx: 1.30, hy: 0.07, hz: 0.31,
    density: 0.50,                    // planed deal: floats dead level
    friction: 0.74, restitution: 0.02,
    sail: sailOf(2.6 * 0.62, 1.10),   // a big flat face, but a heavy one
    flutter: 0.16,
    // Four corners. This is the see-saw: stand on one end of a floating plank
    // and that corner's point leaves the water while the far one drives in.
    buoys: [
      [-1.08, 0, -0.22, 0.25, 0.14], [1.08, 0, -0.22, 0.25, 0.14],
      [-1.08, 0, 0.22, 0.25, 0.14], [1.08, 0, 0.22, 0.25, 0.14],
    ],
  },
  leaf: {
    shape: 'box', hx: 0.30, hy: 0.018, hz: 0.20,
    density: 0.10,                    // sits on the surface film
    friction: 0.30, restitution: 0.0,
    // A leaf's sail is SMALLER than a crate's in absolute terms — it is a much
    // smaller object. What makes it the thing the weather moves is that its
    // mass is smaller still, by a factor of nearly five hundred. See the
    // sail/mass assertions in physicsProps.test.js.
    sail: sailOf(0.6 * 0.4, 1.20),
    flutter: 0.30,
    // A leaf with air damping alone reaches the wind's own speed and STAYS
    // there: measured, 30 s of storm carried the drift 200-430 m, off the
    // island and out of the world. Real leaves skitter and snag. This damping
    // is that snag — it caps the drift at a few metres per gust, which is the
    // motion that makes the weather visible, without the leaf ever leaving the
    // meadow it decorates.
    angDamp: 1.60, linDamp: 1.35,
    buoys: [[0, 0, 0, 1, 0.036]],
  },
  // A sixth entry that is not a toy: the market's kerbstones. They exist for
  // exactly one reason — so a child who drops one in the fountain watches it go
  // straight to the bottom, and learns that the floating was a property of the
  // WOOD and not a property of the water.
  stone: {
    shape: 'box', hx: 0.30, hy: 0.24, hz: 0.30,
    density: 2.40,                    // granite: sinks, hard
    friction: 0.92, restitution: 0.01,
    sail: 0,                          // nothing the wind can do with a kerbstone
    flutter: 0,
    buoys: [[0, 0, 0, 1, 0.48]],
  },
};

/** Kinds that get an InstancedMesh, in draw order. */
export const PROP_ORDER = ['crate', 'ball', 'log', 'plank', 'leaf', 'stone'];

/** Does a free body of this kind come to rest with part of it dry? */
export function kindFloats(kind) {
  const k = PROP_KINDS[kind];
  return !!k && k.density < PHYS.fluidDensity;
}

/** Displaced volume of one body of this kind, m^3. */
export function kindVolume(kind) {
  const k = PROP_KINDS[kind];
  return k ? shapeVolume(k) : 0;
}

/**
 * Wind acceleration this kind feels at `airSpeed`, m/s^2.
 *
 * The one number that says whether the weather can move an object. Compare it
 * to PHYS.gravity's 22 and to the friction holding the thing down: a leaf at
 * a clear day's 5.6 m/s is around 6, so it sits still until a gust; a crate is
 * around 0.03, so it never moves at all, which is correct.
 */
export function windResponse(kind, airSpeed = PHYS.windSpeed) {
  const k = PROP_KINDS[kind];
  if (!k) return 0;
  return windAccel(k.sail, kindMass(kind), airSpeed);
}

/** Mass of one body of this kind, in the world's units. */
export function kindMass(kind) {
  const k = PROP_KINDS[kind];
  return k ? shapeVolume(k) * k.density : 0;
}

/**
 * Turn a placement into the spec physics.js `addBody` wants.
 *
 * Pure, so `physicsProps.test.js` can assert that a log is spawned lying down
 * and that a crate's buoy shares still sum to 1 after a lifetime of edits —
 * both of which are silent, invisible-until-shipped failures otherwise.
 *
 * @param {{kind:string,id:string,x:number,z:number,yaw?:number,lay?:boolean}} place
 * @param {number} y  world Y of the body's CENTRE
 */
export function bodySpecFor(place, y) {
  const k = PROP_KINDS[place.kind];
  if (!k) return null;
  const yaw = place.yaw || 0;
  const spec = {
    id: place.id,
    kind: place.kind,
    shape: k.shape,
    density: k.density,
    friction: k.friction,
    restitution: k.restitution,
    sail: k.sail,
    flutter: k.flutter || 0,
    // Undefined for the kinds that are happy with plain air damping; physics.js
    // falls back to PHYS.airLinearDrag / airAngularDrag for those.
    linDamp: k.linDamp,
    angDamp: k.angDamp,
    buoys: k.buoys,
    x: place.x, y, z: place.z,
    pinned: place.pinned !== false,   // sandbox furniture is pinned by default
  };
  if (k.shape === 'ball') spec.r = k.r;
  else if (k.shape === 'cylinder') { spec.r = k.r; spec.halfHeight = k.halfHeight; }
  else { spec.hx = k.hx; spec.hy = k.hy; spec.hz = k.hz; }
  if (place.lay || k.shape === 'cylinder') spec.rot = layQuat(yaw);
  else spec.yaw = yaw;
  return spec;
}

/**
 * Quaternion that tips a +Y-axis body onto its side and then spins it to
 * `yaw` about the world up — i.e. how a log comes to be lying across a hill.
 * Composed as yaw(Y) * roll(Z, 90deg) so the yaw is applied in world space and
 * a placement's `yaw` means "which way does the log point", which is the only
 * meaning a level author will ever want.
 */
export function layQuat(yaw = 0) {
  const hy = yaw * 0.5, c = Math.cos(hy), s = Math.sin(hy);
  const r = Math.SQRT1_2;             // cos(45deg) = sin(45deg) for a 90deg roll
  // Hamilton product (0, s, 0, c) * (0, 0, r, r). Worth writing out: getting
  // this wrong lays the log on a diagonal, which looks like a bug in the
  // terrain rather than a bug in a quaternion and costs an afternoon.
  return { x: s * r, y: s * r, z: c * r, w: c * r };
}

/** Metres of clearance a kind needs above the ground when it is dropped in. */
export function spawnLift(kind) {
  const k = PROP_KINDS[kind];
  if (!k) return 0.5;
  // Half its own height plus a couple of centimetres, so nothing is born
  // interpenetrating the terrain and gets shot out of the ground at load.
  if (k.shape === 'ball') return k.r + 0.02;
  if (k.shape === 'cylinder') return k.r + 0.02;   // laid on its side
  return k.hy + 0.02;
}

/**
 * THE SANDBOX — 42 objects across the two places a child spends their first
 * half hour.
 *
 * WHY the Garden and the Market and nowhere else: a toy the player does not
 * find is not a toy. These are the spawn meadow and the town, the two areas
 * every route passes through, and concentrating the objects there means a
 * child trips over the physics inside the first minute instead of discovering
 * it on floor six. Scattering forty objects evenly over a 480 m island would
 * put roughly two in shouting distance of anywhere, which is indistinguishable
 * from none.
 *
 * WHY they are in clusters and not spread: one crate is scenery. Six crates
 * beside two plates is a QUESTION. Every cluster below is placed to suggest its
 * verb, and every cluster sits next to the puzzle that consumes it.
 *
 * ── EVERY COORDINATE HERE IS MEASURED, NOT IMAGINED ───────────────────────
 * The first version of this table was authored against a mental picture of the
 * island and it did not survive contact with the heightfield. Six placements
 * were on 35-40 degree slopes; within twelve seconds of calm the crates had
 * slid off the knoll, three logs had rolled 23-44 m, and four balls were in the
 * sea. Three planks and both kerbstones spawned INSIDE puzzle zones, which
 * pre-solved two puzzles before the player arrived.
 *
 * So each kind now has a slope budget it is placed within, and
 * `physicsProps.test.js` re-derives every one of these coordinates against the
 * real `createHeightfield(WORLD.SEED)` on every run:
 *
 *   ball 0.05   it rolls on anything; it needs a bowl, not a flat
 *   log  0.09   rolls on one axis, so it tolerates a little more
 *   crate/plank 0.13   flat faces and high friction hold a slight tilt
 *   leaf/stone  0.17   too light or too heavy to care
 *
 * A slope budget is not a substitute for a backstop — a child can still shove a
 * ball down a hill — so LEASH below brings home anything that leaves. But the
 * budget is what stops the world from emptying itself while nobody is playing.
 *
 * Coordinates avoid the levelled pads under portals, buildings and pickups
 * (see worldSpec.PADS) so nothing is born inside a monument, and avoid every
 * puzzle zone so nothing is born pre-solving one.
 */
export const SANDBOX = [
  // ── Sprout Garden: the meadow round the spawn at (6, 158) ────────────────
  // Share-it-Fair stock: six crates on the flat between the spawn and the two
  // plates, close enough that the plates are visible from the pile.
  { id: 'phx-g-crate-1', kind: 'crate', x: 9.3, z: 154.9, yaw: 0.3 },
  { id: 'phx-g-crate-2', kind: 'crate', x: 11.2, z: 154.9, yaw: 1.1 },
  { id: 'phx-g-crate-3', kind: 'crate', x: 13.1, z: 155.9, yaw: 2.4 },
  { id: 'phx-g-crate-4', kind: 'crate', x: 10.7, z: 157.3, yaw: 0.8 },
  { id: 'phx-g-crate-5', kind: 'crate', x: 12.7, z: 158.5, yaw: 1.9 },
  { id: 'phx-g-crate-6', kind: 'crate', x: 12.3, z: 160.3, yaw: 2.7 },
  // Two SPARE crates, deliberately off to one side. Six is the answer and eight
  // are in reach, so "put them all on" is a wrong answer a child can make and
  // undo — which is the whole point of an exact count.
  { id: 'phx-g-crate-7', kind: 'crate', x: 24.3, z: 164.9, yaw: 0.6 },
  { id: 'phx-g-crate-8', kind: 'crate', x: 25.8, z: 162.9, yaw: 2.2 },
  // Timber for the rack, lying a few metres east of it.
  { id: 'phx-g-log-1', kind: 'log', x: 13.8, z: 162.5, yaw: 1.35 },
  { id: 'phx-g-log-2', kind: 'log', x: 23.5, z: 162.6, yaw: 0.55 },
  { id: 'phx-g-log-3', kind: 'log', x: 10.5, z: 164.4, yaw: 2.15 },
  // A fourth log, so the rack's "three" is a choice and not just "all of them".
  { id: 'phx-g-log-5', kind: 'log', x: 9.4, z: 162.5, yaw: 0.9 },
  // Planks on the BANK of the garden pool at (-8, 154), r 7.5 — dry, every one
  // of them. Floating a plank has to be something the player DID; a plank that
  // was already afloat at load teaches nothing and silently pre-solves the
  // bridge. (It did exactly that: three of the five used to spawn in the water.)
  { id: 'phx-g-plank-1', kind: 'plank', x: 1.1, z: 157.3, yaw: 0.9 },
  { id: 'phx-g-plank-2', kind: 'plank', x: 1.4, z: 160.6, yaw: 2.2 },
  { id: 'phx-g-plank-3', kind: 'plank', x: 3.3, z: 163.5, yaw: 1.4 },
  { id: 'phx-g-plank-4', kind: 'plank', x: -1.7, z: 161.4, yaw: 0.2 },
  { id: 'phx-g-plank-5', kind: 'plank', x: 2.0, z: 154.0, yaw: 2.7 },
  // See-saw kit: a log for the fulcrum and a plank laid across it, on its own
  // flat shelf south of the meadow. Not a puzzle — a TOY, and the one place the
  // multi-point buoyancy's sibling behaviour (a beam that tips about a contact)
  // is on show without any counting attached.
  { id: 'phx-g-log-4', kind: 'log', x: 16.0, z: 140.0, yaw: 0 },
  { id: 'phx-g-plank-6', kind: 'plank', x: 16.0, z: 140.0, yaw: Math.PI / 2, lift: 0.78 },
  // Two crates beside it. A see-saw with nothing to put on it is half a toy —
  // these are the weights, and they are what makes the beam tip.
  { id: 'phx-g-crate-9', kind: 'crate', x: 18.2, z: 140.0, yaw: 1.3 },
  { id: 'phx-g-crate-10', kind: 'crate', x: 17.1, z: 141.9, yaw: 0.4 },
  // Balls, in the flattest bowls the meadow has. A ball on any real gradient
  // leaves and does not come back; see LEASH for the backstop, and see the
  // per-kind slope budget in physicsProps.test.js for why these are where
  // they are rather than anywhere prettier.
  { id: 'phx-g-ball-1', kind: 'ball', x: 9.1, z: 160.4 },
  { id: 'phx-g-ball-2', kind: 'ball', x: 0.0, z: 159.0 },
  { id: 'phx-g-ball-3', kind: 'ball', x: 10.8, z: 159.0 },
  // Drift of leaves across the open meadow, where the wind has the fetch.
  { id: 'phx-g-leaf-1', kind: 'leaf', x: 4.0, z: 168.0, yaw: 0.4 },
  { id: 'phx-g-leaf-2', kind: 'leaf', x: 7.2, z: 170.5, yaw: 1.9 },
  { id: 'phx-g-leaf-3', kind: 'leaf', x: 2.3, z: 169.6, yaw: 3.1 },
  { id: 'phx-g-leaf-4', kind: 'leaf', x: 9.1, z: 167.4, yaw: 2.4 },
  // This one starts ON the garden pool. It is the cheapest possible tutorial:
  // the first floating object a child sees is already floating, before they
  // have pushed anything in. It is a LEAF and the bridge counts PLANKS, so it
  // decorates the puzzle without pre-loading it.
  { id: 'phx-g-leaf-5', kind: 'leaf', x: -6.0, z: 154.0, yaw: 0.9 },
  { id: 'phx-g-leaf-6', kind: 'leaf', x: 10.3, z: 171.0, yaw: 1.2 },

  // ── Market: the plaza and the main street ────────────────────────────────
  // Stall goods on the paving, six of them — exactly the Heavy Door's answer,
  // with the two kerbstones as the alternative sixth and seventh so "anything
  // heavy will do" is literally true.
  { id: 'phx-m-crate-1', kind: 'crate', x: -150.8, z: 4.7, yaw: 0.5 },
  { id: 'phx-m-crate-2', kind: 'crate', x: -147.8, z: 4.0, yaw: 1.6 },
  { id: 'phx-m-crate-3', kind: 'crate', x: -144.8, z: 4.7, yaw: 2.8 },
  { id: 'phx-m-crate-4', kind: 'crate', x: -149.5, z: 3.6, yaw: 0.1 },
  { id: 'phx-m-crate-5', kind: 'crate', x: -147.1, z: 2.3, yaw: 2.0 },
  { id: 'phx-m-crate-6', kind: 'crate', x: -143.0, z: 5.1, yaw: 1.1 },
  // Kerbstones — the sinkers. See PROP_KINDS.stone. Clear of the pressure
  // plate: they used to spawn ON it and started the Heavy Door at 2 of 6.
  { id: 'phx-m-stone-1', kind: 'stone', x: -159.0, z: 8.0, yaw: 0.3 },
  { id: 'phx-m-stone-2', kind: 'stone', x: -161.0, z: 10.0, yaw: 1.2 },
  // FIVE balls, because the pen's sign says five and a sign that lies is worse
  // than no sign. Three sit near the pen, two are a walk away.
  { id: 'phx-m-ball-1', kind: 'ball', x: -164.8, z: -7.7 },
  { id: 'phx-m-ball-2', kind: 'ball', x: -168.9, z: -18.0 },
  { id: 'phx-m-ball-3', kind: 'ball', x: -166.5, z: -19.0 },
  { id: 'phx-m-ball-4', kind: 'ball', x: -152.5, z: 5.9 },
  { id: 'phx-m-ball-5', kind: 'ball', x: -162.5, z: -3.2 },
  // Timber leaning by the shop.
  { id: 'phx-m-plank-1', kind: 'plank', x: -152.9, z: 18.3, yaw: 1.0 },
  { id: 'phx-m-plank-2', kind: 'plank', x: -169.5, z: -21.5, yaw: 2.5 },
  { id: 'phx-m-log-1', kind: 'log', x: -128.5, z: 16.5, yaw: 0.7 },
  { id: 'phx-m-log-2', kind: 'log', x: -173.0, z: -26.0, yaw: 1.8 },
  // Leaves blowing up the street.
  { id: 'phx-m-leaf-1', kind: 'leaf', x: -128.0, z: 22.0, yaw: 0.6 },
  { id: 'phx-m-leaf-2', kind: 'leaf', x: -131.5, z: 17.0, yaw: 2.1 },
  { id: 'phx-m-leaf-3', kind: 'leaf', x: -142.0, z: 10.5, yaw: 1.5 },
  { id: 'phx-m-leaf-4', kind: 'leaf', x: -176.0, z: -30.0, yaw: 0.2 },
];

// ────────────────────────────────────────────────────────────────────────
// Puzzles
// ────────────────────────────────────────────────────────────────────────

/**
 * WHERE PHYSICS AND ARITHMETIC MEET.
 *
 * ── THE DESIGN RULE THESE ALL OBEY ────────────────────────────────────────
 * The answer must be a THING YOU CAN SEE IN THE WORLD, not a number you type.
 * `2 + 2` on a signboard by a pond is not a maths question with a bridge as a
 * reward; it is a bridge whose length happens to be four. A five-year-old who
 * cannot do 2 + 2 can still solve it by floating planks until they reach the
 * far bank, and in doing so has laid out four objects and counted them, which
 * is what 2 + 2 IS. The arithmetic is the shortcut, not the toll gate. That is
 * the difference between a game that teaches and a worksheet with a hero on it.
 *
 * ── EVERY PUZZLE HERE IS SOLVABLE BY PUSHING, AND THAT IS A HARD CONSTRAINT ─
 * The hero has no carry verb. controls3d.js publishes move, run, jump, action
 * and dive, and the hero meets this world as a KINEMATIC CAPSULE (see
 * physics.js): it shoves dynamic bodies and is never shoved back. It cannot
 * pick a crate up, so it cannot put one down on top of another.
 *
 * The brief for this module asked for "stack exactly N crates to reach a
 * ledge". It is a lovely puzzle and it is unplayable here: with push as the
 * only verb, a second crate can never get on top of a first. It was authored
 * anyway, on a 40-degree slope where the crates slid away before the player
 * arrived, and it passed its unit tests the whole time because they only ever
 * asked whether the numbers added up. So the rule this list now obeys:
 *
 *     A puzzle may only require verbs the hero actually has.
 *
 * Which leaves push, roll and float — and they are enough. Pushing N crates
 * onto a plate is the same arithmetic as stacking N crates, and a five-year-old
 * can actually do it. Height stays in the world as the see-saw TOY, which needs
 * no counting and so needs no lifting.
 *
 * If a carry verb ever lands, the stacking puzzle should come back; it wants a
 * hold/drop button in controls3d.js, a carried-body slot on the controller, and
 * a zone whose y window runs to 6 m. Until then it is not in this list.
 *
 * ── AND WHY THE COUNT MUST BE EXACT ───────────────────────────────────────
 * "At least N" is the forgiving choice and it is the wrong one: it teaches
 * "pile everything on", which is not a number fact. Exact-N means the child has
 * to take one back off, and taking one back off is subtraction happening in
 * their hands. The forgiveness lives in the HOLD instead (see
 * `createPuzzleTracker`): you get 0.7 s of "that's it, that's right" before it
 * latches, so a crate rolling through a zone never steals the solve and a
 * wobbling stack is not punished for wobbling.
 *
 * Zones are cylinders (x, z, r) with a vertical window (y0, y1) measured
 * RELATIVE TO THE GROUND under the zone centre, so an author never has to know
 * the terrain height and the puzzle cannot break when the heightfield is
 * retuned.
 *
 *   kind      body kind the zone counts, or null for anything
 *   minDensity  with a null kind, the lightest thing that still counts. Without
 *             it "anything" includes a leaf the wind put there.
 *   check     'in'    body centre inside the cylinder and the height window
 *             'float' as 'in', and the body is floating (partly wet, not sunk)
 *   need      exact count required
 *   pair      for 'balance': the id of the zone that must MATCH this one
 */
export const PUZZLES = [
  {
    id: 'phz-garden-logs',
    place: 'garden',
    name: 'Roll the Timber',
    prompt: '1 + 2',
    answer: 3,
    hint: 'Roll that many logs onto the rack.',
    sign: { x: 3.0, z: 161.6, yaw: 0.6 },
    reward: 'timber-coin',
    plates: [{ x: 6.1, z: 164.6, r: 2.6 }],
    zones: [{ id: 'rack', kind: 'log', check: 'in', x: 6.1, z: 164.6, r: 2.6, y0: -0.9, y1: 2.0 }],
    need: 3,
  },
  {
    id: 'phz-garden-share',
    place: 'garden',
    name: 'Share it Fair',
    prompt: '3 + 3',
    answer: 6,
    hint: 'Six crates, the same number on each plate.',
    sign: { x: 19.0, z: 156.2, yaw: 2.4 },
    reward: 'share-chime',
    plates: [{ x: 16.3, z: 159.9, r: 2.2 }, { x: 21.7, z: 159.9, r: 2.2 }],
    // The two plates are 5.4 m apart, so a crate is unambiguously on one or the
    // other. `pair` makes 5-and-1 fail: six crates split evenly is the lesson,
    // and six crates in a heap on one plate is not it.
    zones: [
      { id: 'left', kind: 'crate', check: 'in', x: 16.3, z: 159.9, r: 2.2, y0: -0.9, y1: 2.4, pair: 'right' },
      { id: 'right', kind: 'crate', check: 'in', x: 21.7, z: 159.9, r: 2.2, y0: -0.9, y1: 2.4, pair: 'left' },
    ],
    need: 6,
  },
  {
    id: 'phz-garden-bridge',
    place: 'garden',
    name: 'Cross the Pool',
    prompt: '2 + 2',
    answer: 4,
    hint: 'Float that many planks to walk across.',
    sign: { x: -1.1, z: 159.8, yaw: 2.2 },
    reward: 'pool-island',
    // The garden pool is at (-8, 154) with radius 7.5, surface at 11.45.
    zones: [{ id: 'pool', kind: 'plank', check: 'float', x: -8.0, z: 154.0, r: 8.4, y0: -1.2, y1: 1.6 }],
    need: 4,
  },
  {
    id: 'phz-market-plate',
    place: 'market',
    name: 'The Heavy Door',
    prompt: '2 x 3',
    answer: 6,
    hint: 'Two rows of three — anything heavy will do.',
    sign: { x: -151.2, z: 16.4, yaw: 1.4 },
    reward: 'market-gate',
    plates: [{ x: -154.0, z: 14.0, r: 2.7 }],
    zones: [{ id: 'plate', kind: null, minDensity: 0.25, check: 'in', x: -154.0, z: 14.0, r: 2.7, y0: -0.9, y1: 2.4 }],
    need: 6,
  },
  {
    id: 'phz-market-pen',
    place: 'market',
    name: 'Roll Them Home',
    prompt: '5 - 3',
    answer: 2,
    hint: 'Five balls, take three away. Roll the rest in.',
    sign: { x: -165.2, z: -12.4, yaw: 2.6 },
    reward: 'pen-prize',
    plates: [{ x: -168.0, z: -14.5, r: 2.4 }],
    zones: [{ id: 'pen', kind: 'ball', check: 'in', x: -168.0, z: -14.5, r: 2.4, y0: -0.9, y1: 1.8 }],
    need: 2,
  },
];

/** Seconds a puzzle's condition must hold before it latches as solved. */
export const PUZZLE_HOLD = 0.7;

// ────────────────────────────────────────────────────────────────────────
// The leash
// ────────────────────────────────────────────────────────────────────────

/**
 * A TOYBOX THAT EMPTIES ITSELF IS NOT A TOYBOX.
 *
 * Slope budgets (see SANDBOX) stop the world running away on its own, but they
 * cannot stop a player, and they cannot stop the wind. Measured on the shipped
 * island before this existed: 30 s of breezy weather put seven of the ten
 * leaves in the sea, and 30 s of storm carried two of them clean off the world
 * to x = -437. Balls shoved downhill went the same way. Come back after five
 * minutes and the garden is bare — the objects are all still simulated, still
 * eating the body cap, just sitting on the seabed where nobody will ever find
 * them.
 *
 * So every sandbox body remembers where it was born, and comes home when it is
 * either DROWNED (below the sea surface, where nothing is recoverable) or has
 * STRAYED past a per-kind radius. Homing is a teleport with the velocity
 * zeroed, polled at 2 Hz.
 *
 * WHY a leash and not a wall: a wall round the garden is visible, and the thing
 * a toybox must never say is "you may not". The leash only fires where a body
 * is already lost — in the sea, or far enough away that the player who pushed
 * it there has long since walked off. Inside the radius a child may shove a
 * crate as far as they like.
 *
 * WHY the radii differ: they are roughly "how far could the player plausibly
 * still care about this object". A leaf is scenery and 34 m is well past the
 * end of its meadow; a crate may be a puzzle piece halfway to a plate, so it
 * gets more rope. Balls get the most, because rolling one a long way IS the toy.
 */
export const LEASH = {
  /** Metres from home a body of each kind may wander before it is brought back. */
  radius: { crate: 40, ball: 30, log: 30, plank: 40, leaf: 34, stone: 26 },
  /** Fallback for a kind not listed. */
  defaultRadius: 40,
  /**
   * Height above the ocean below which a body counts as drowned. The sea is at
   * PHYS.waterY; 1.6 m is high enough to catch a body that is sinking and low
   * enough that nothing on the island's lowest beach trips it.
   */
  drownY: 1.6,
};

/** Leash radius for a kind. */
export function leashRadius(kind) {
  return LEASH.radius[kind] ?? LEASH.defaultRadius;
}

/**
 * Should this body be brought home?
 *
 * Pure, so the test suite can pin the boundary without a physics world: the
 * exact metre at which a leaf is recalled is a design number, and a design
 * number that only exists inside a frame loop is a design number nobody can
 * check.
 *
 * @param {string} kind
 * @param {{x:number,z:number}} home  where the placement put it
 * @param {number} x @param {number} y @param {number} z  where it is now
 * @param {number} [oceanY]
 * @returns {''|'drowned'|'strayed'}  falsy when the body is fine
 */
export function recallReason(kind, home, x, y, z, oceanY = PHYS.waterY) {
  if (y < oceanY + LEASH.drownY) return 'drowned';
  const r = leashRadius(kind);
  const dx = x - home.x;
  const dz = z - home.z;
  return dx * dx + dz * dz > r * r ? 'strayed' : '';
}

/**
 * Is one body inside one zone?
 *
 * `groundY` is the terrain height under the zone centre; the y window is quoted
 * relative to it. `body` is {kind, x, y, z, wet}.
 */
export function bodyInZone(zone, body, groundY = 0) {
  if (zone.kind && body.kind !== zone.kind) return false;
  // ── WHY A KINDLESS ZONE STILL HAS A FLOOR ────────────────────────────────
  // "The Heavy Door" takes anything heavy, so its zone names no kind. Without
  // a density floor that means anything AT ALL, and the wind has opinions: a
  // 60 s storm blew a leaf onto the plate and a correct six-crate solution
  // counted seven, so the door refused to open and the child had no way to see
  // why. `minDensity` is the sign's own word "heavy", made checkable — 0.25
  // passes every solid in the toybox and stops the 0.10 leaf.
  if (zone.minDensity) {
    const k = PROP_KINDS[body.kind];
    if (!k || k.density < zone.minDensity) return false;
  }
  const dx = body.x - zone.x;
  const dz = body.z - zone.z;
  if (dx * dx + dz * dz > zone.r * zone.r) return false;
  const rel = body.y - groundY;
  if (rel < zone.y0 || rel > zone.y1) return false;
  if (zone.check === 'float') {
    // Floating means PARTLY wet. A body sitting dry on the bank does not
    // count, and neither does one that has sunk to the bottom — which is how
    // "float the planks" refuses to be solved with the market's kerbstones.
    const w = body.wet || 0;
    if (w <= 0.04 || w >= 0.985) return false;
  }
  return true;
}

/**
 * Count of bodies in a zone.
 *
 * `bodies` is an ARRAY and `len` an explicit length, not an iterable: the
 * caller reuses one growing scratch array of body views across frames, and a
 * `for...of` over it would allocate an iterator on every zone of every puzzle.
 */
export function countInZone(zone, bodies, groundY = 0, len = bodies.length) {
  let n = 0;
  for (let i = 0; i < len; i++) if (bodyInZone(zone, bodies[i], groundY)) n++;
  return n;
}

/**
 * Evaluate one puzzle against the world.
 *
 * A single-zone puzzle is solved when its count equals `need`. A PAIRED puzzle
 * (the see-saw) additionally requires the two zones to hold the SAME number,
 * because "six things on a see-saw" with five on one end is a see-saw on the
 * floor, not a balance — and the equal split is the arithmetic the sign is
 * actually asking about.
 *
 * @param {(x:number,z:number)=>number} [groundAt]
 * @returns {{ solved:boolean, total:number, need:number, counts:number[] }}
 */
export function evaluatePuzzle(puzzle, bodies, groundAt = null, len = bodies.length, out = null) {
  const zones = puzzle.zones;
  const counts = out ? (out.counts.length = 0, out.counts) : [];
  let total = 0;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const g = groundAt ? groundAt(z.x, z.z) : 0;
    const n = countInZone(z, bodies, g, len);
    counts.push(n);
    total += n;
  }
  let solved = total === puzzle.need;
  if (solved) {
    for (let i = 0; i < zones.length; i++) {
      const pair = zones[i].pair;
      if (!pair) continue;
      let j = -1;
      for (let k = 0; k < zones.length; k++) if (zones[k].id === pair) { j = k; break; }
      if (j < 0 || counts[j] !== counts[i] || counts[i] === 0) { solved = false; break; }
    }
  }
  if (out) { out.solved = solved; out.total = total; out.need = puzzle.need; return out; }
  return { solved, total, need: puzzle.need, counts };
}

/**
 * Latching tracker with a hold time.
 *
 * Deterministic: it advances on the dt it is given and reads no clock, so the
 * screenshot harness can drive a puzzle to solved in a fixed number of steps.
 * Once solved a puzzle STAYS solved — a child who knocks their own tower over
 * two seconds after the chime has not un-earned it, and a reward that can be
 * taken back is a reward that teaches you not to touch anything.
 */
export function createPuzzleTracker(puzzles = PUZZLES, hold = PUZZLE_HOLD) {
  const state = new Map();
  for (const p of puzzles) {
    state.set(p.id, { id: p.id, solved: false, holding: 0, total: 0, need: p.need, counts: [] });
  }
  // ONE scratch result, reused across every puzzle every poll.
  //
  // It must NOT be the state object itself, tempting as that is: evaluatePuzzle
  // writes `solved` for "the arrangement is right this instant", while the
  // state's `solved` means "this has been held long enough to latch". Aliasing
  // them makes every puzzle solve on the first correct frame and quietly
  // deletes the hold, which is the whole anti-flicker mechanism.
  const scratch = { solved: false, total: 0, need: 0, counts: [] };

  return {
    get(id) { return state.get(id) || null; },
    states() { return [...state.values()]; },
    solvedCount() {
      let n = 0;
      for (const s of state.values()) if (s.solved) n++;
      return n;
    },
    /** Force a state in from a save file. */
    restore(ids) {
      if (!ids) return;
      for (const id of ids) { const s = state.get(id); if (s) { s.solved = true; s.holding = hold; } }
    },
    solvedIds() {
      const out = [];
      for (const s of state.values()) if (s.solved) out.push(s.id);
      return out;
    },
    /**
     * @returns {string[]|null} ids that latched THIS step — null when none, so
     *   the common case allocates nothing at all.
     */
    step(dt, bodies, groundAt = null, len = bodies.length) {
      let fired = null;
      for (let i = 0; i < puzzles.length; i++) {
        const p = puzzles[i];
        const s = state.get(p.id);
        if (s.solved) continue;
        // Into shared scratch, so a steady state (five puzzles polled six
        // times a second, none of them solved) allocates nothing at all.
        const r = evaluatePuzzle(p, bodies, groundAt, len, scratch);
        s.total = r.total;
        s.counts.length = 0;
        for (let k = 0; k < r.counts.length; k++) s.counts.push(r.counts[k]);
        if (r.solved) {
          s.holding += dt;
          if (s.holding >= hold) {
            s.solved = true;
            (fired || (fired = [])).push(p.id);
          }
        } else {
          s.holding = 0;
        }
      }
      return fired;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Papercut geometry
// ────────────────────────────────────────────────────────────────────────

/**
 * Tape strip: a thin, slightly-proud rectangle of a warm second paper (always
 * PAPER.peach, so every taped thing in the world is taped with the same roll).
 * Callers place four of them to WRAP an edge, which is the detail that makes
 * the tape read as tape rather than as a painted stripe — and the detail that
 * makes a tumbling crate legible, since a strip that crosses the silhouette
 * moves when the body turns.
 */
function stampTape(s, w, h, d, x, y, z, tone = 1) {
  stamp(s, new THREE.BoxGeometry(w, h, d), trs(x, y, z), lin(PAPER.peach, tone));
}

/** One ply: a box in a colour, at a layer shade. */
function stampPly(s, w, h, d, x, y, z, colour, tone = 1, rx = 0, ry = 0, rz = 0) {
  stamp(s, new THREE.BoxGeometry(w, h, d), trs(x, y, z, rx, ry, rz), lin(colour, tone));
}

/**
 * CRATE — 0.9 m of stacked, taped cardboard.
 *
 * Six recessed panels on a proud frame, four corner posts, a band of tape round
 * the middle and a cross of it on the lid. The frame is DARKER than the panels
 * on purpose: the papercut idiom is that the cut edge catches the light and the
 * face behind it falls away, so a lighter face inside a darker frame reads as a
 * box with depth even under a flat toon ramp with no ambient occlusion.
 */
function buildCrate() {
  const s = sink();
  const H = 0.45;                     // half extent
  const frame = PAPER.sand;
  const panel = PAPER.creamD;
  // Frame block, slightly inset so the corner posts stand proud of it.
  stampPly(s, H * 1.94, H * 1.94, H * 1.94, 0, 0, 0, frame, 0.80);
  // Six panels, each proud of the frame by 2 cm.
  const pw = H * 1.42, pt = 0.05;
  for (const [ax, sx] of [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]]) {
    const o = H * 0.99;
    if (ax === 'x') stampPly(s, pt, pw, pw, sx * o, 0, 0, panel, sx > 0 ? 1.0 : 0.86);
    else if (ax === 'y') stampPly(s, pw, pt, pw, 0, sx * o, 0, panel, sx > 0 ? 1.06 : 0.74);
    else stampPly(s, pw, pw, pt, 0, 0, sx * o, panel, sx > 0 ? 0.98 : 0.86);
  }
  // Four corner posts. These are the layered EDGES — they are what a child sees
  // when a crate is silhouetted against the sky.
  const post = 0.11;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      stampPly(s, post, H * 2.02, post, sx * (H - post * 0.42), 0, sz * (H - post * 0.42), frame, 0.68);
    }
  }
  // Tape. FOUR strips make one continuous band round the waist — the band has
  // to be built face by face, because a single box through the middle of the
  // crate would only be visible where it pokes out and would read as a fin.
  // The band crosses all four vertical silhouette edges, so however the crate
  // is turned there is a seam on the profile telling you it turned.
  const span = H * 2.02, tw = 0.17, tt = 0.014;
  const off = H + tt * 0.5;
  stampTape(s, span, tw, tt, 0, 0, off, 1.00);
  stampTape(s, span, tw, tt, 0, 0, -off, 0.86);
  stampTape(s, tt, tw, span, off, 0, 0, 0.94);
  stampTape(s, tt, tw, span, -off, 0, 0, 0.90);
  // Cross on the lid, laid over the band's shoulders.
  stampTape(s, span, tt, 0.14, 0, H + tt, 0, 1.06);
  stampTape(s, 0.14, tt, span, 0, H + tt * 2.2, 0, 0.98);
  return bake(s);
}

/**
 * BALL — a paper lantern, not a sphere.
 *
 * A smooth ball has no surface features, so when it rolls nothing on it appears
 * to move and the eye reads it as sliding. Three belts of paper round it — one
 * at the equator, two at the tropics — plus a tape meridian over the pole give
 * the roll something to carry. Icosahedron core at detail 1 keeps it to 80
 * triangles and, being faceted, catches the toon ramp in bands as it turns.
 */
function buildBall() {
  const s = sink();
  const R = 0.44;
  stamp(s, new THREE.IcosahedronGeometry(R * 0.965, 1), null, lin(PAPER.coral, 0.94));
  // Belts: short cylinders proud of the core.
  const belt = (y, rr, tone, colour) => {
    const r = Math.sqrt(Math.max(0.0001, R * R - y * y)) * rr;
    stamp(s, new THREE.CylinderGeometry(r, r, 0.09, 16, 1, true), trs(0, y, 0), lin(colour, tone));
  };
  belt(0, 1.035, 1.0, PAPER.peach);
  belt(R * 0.55, 1.03, 0.92, PAPER.peach);
  belt(-R * 0.55, 1.03, 0.86, PAPER.peach);
  // Meridian tape: a torus standing in the XY plane, i.e. a great circle over
  // both poles. A flat plate through the middle was the cheaper idea and it is
  // invisible — it only shows where it pokes out at the poles. The torus is a
  // real band on the surface, so it sweeps across the silhouette as the ball
  // rolls, which is the entire point of putting a seam on a sphere.
  stamp(s, new THREE.TorusGeometry(R * 1.005, 0.036, 5, 20), trs(0, 0, 0), lin(PAPER.peach, 1.06));
  return bake(s);
}

/**
 * LOG — modelled STANDING (local +Y is the axis, matching Rapier's cylinder)
 * and laid down by the spawn rotation. See PROP_KINDS.log.
 *
 * Three nested drums of decreasing radius and increasing height make the bark
 * a stack of visible plies rather than a tube, and the two end caps get
 * concentric rings in a pale paper — the growth rings are the single cue that
 * says "this was cut", and they are the thing the eye tracks as it rolls.
 */
function buildLog() {
  const s = sink();
  const R = 0.34, HL = 0.95;
  const bark = PAPER.coralD;
  stamp(s, new THREE.CylinderGeometry(R, R, HL * 1.86, 12), trs(0, 0, 0), lin(bark, 0.80));
  stamp(s, new THREE.CylinderGeometry(R * 0.955, R * 0.955, HL * 1.94, 12), trs(0, 0, 0), lin(bark, 0.92));
  stamp(s, new THREE.CylinderGeometry(R * 0.90, R * 0.90, HL * 1.99, 12), trs(0, 0, 0), lin(PAPER.coral, 1.0));
  // End caps: pale cut face plus two rings.
  for (const sy of [1, -1]) {
    const y = sy * HL * 0.998;
    stamp(s, new THREE.CylinderGeometry(R * 0.90, R * 0.90, 0.022, 12), trs(0, y, 0), lin(PAPER.sand, 1.04));
    stamp(s, new THREE.CylinderGeometry(R * 0.58, R * 0.58, 0.03, 12), trs(0, y + sy * 0.014, 0), lin(PAPER.cream, 1.0));
    stamp(s, new THREE.CylinderGeometry(R * 0.24, R * 0.24, 0.036, 10), trs(0, y + sy * 0.02, 0), lin(PAPER.peach, 0.98));
  }
  // Waist tape — crosses the silhouette on the long axis, so the roll shows.
  stamp(s, new THREE.CylinderGeometry(R * 1.035, R * 1.035, 0.18, 12, 1, true), trs(0, 0, 0), lin(PAPER.peach, 1.0));
  // Two knot stubs: asymmetry, so a rolling log does not look like a wheel.
  stampPly(s, 0.13, 0.10, 0.13, R * 0.86, HL * 0.34, 0.0, PAPER.coralD, 0.72, 0, 0, 0.4);
  stampPly(s, 0.10, 0.09, 0.10, -R * 0.80, -HL * 0.46, R * 0.30, PAPER.coralD, 0.70, 0.3, 0, 0);
  return bake(s);
}

/**
 * PLANK — two laminated sheets with the top one INSET, so there is a visible
 * ply edge running all the way round, and a tape strap over each end.
 *
 * The inset is 3 cm. Flush would be invisible; more than about 5 cm and the
 * plank starts to read as two planks.
 */
function buildPlank() {
  const s = sink();
  const HX = 1.30, HY = 0.07, HZ = 0.31;
  stampPly(s, HX * 2, HY, HZ * 2, 0, -HY * 0.5, 0, PAPER.orange, 0.74);
  stampPly(s, HX * 2 - 0.06, HY, HZ * 2 - 0.06, 0, HY * 0.5, 0, PAPER.gold, 1.0);
  // Grain: three shallow darker strips down the top face.
  for (const z of [-HZ * 0.52, 0.02, HZ * 0.55]) {
    stampPly(s, HX * 1.9, 0.012, 0.045, 0, HY + 0.002, z, PAPER.orange, 0.82);
  }
  // Straps near each end: over the top and down both long edges, so a plank
  // seen edge-on from a see-saw still shows its seams.
  for (const sx of [-1, 1]) {
    const x = sx * HX * 0.74;
    stampTape(s, 0.15, 0.014, HZ * 2.04, x, HY + 0.007, 0, 1.02);
    stampTape(s, 0.15, HY * 2.3, 0.014, x, 0, HZ + 0.007, 0.90);
    stampTape(s, 0.15, HY * 2.3, 0.014, x, 0, -HZ - 0.007, 0.84);
    stampTape(s, 0.15, 0.014, HZ * 2.04, x, -HY - 0.007, 0, 0.76);
  }
  return bake(s);
}

/**
 * LEAF — three plies and a midrib, cut as a hexagon rather than a rectangle so
 * the silhouette is a leaf at the twenty metres you usually see it from.
 * Built from raw triangles because a leaf IS a papercut: two flat outlines,
 * one proud of the other by 8 mm.
 */
function buildLeaf() {
  const s = sink();
  const outline = (sx, sz) => [
    [0, -sz * 1.0], [sx * 0.62, -sz * 0.42], [sx * 1.0, sz * 0.10],
    [sx * 0.52, sz * 0.86], [0, sz * 1.0], [-sx * 0.52, sz * 0.86],
    [-sx * 1.0, sz * 0.10], [-sx * 0.62, -sz * 0.42],
  ];
  const fan = (pts, y, colour, tone) => {
    const rgb = lin(colour, tone);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s.pos.push(0, y, 0, a[0], y, a[1], b[0], y, b[1]);
      for (let k = 0; k < 3; k++) s.nrm.push(0, 1, 0);
      for (let k = 0; k < 3; k++) s.col.push(rgb[0], rgb[1], rgb[2]);
    }
    // Underside, wound the other way so the leaf is solid from below too.
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s.pos.push(0, y - 0.008, 0, b[0], y - 0.008, b[1], a[0], y - 0.008, a[1]);
      for (let k = 0; k < 3; k++) s.nrm.push(0, -1, 0);
      for (let k = 0; k < 3; k++) s.col.push(rgb[0] * 0.72, rgb[1] * 0.72, rgb[2] * 0.72);
    }
  };
  fan(outline(0.30, 0.21), -0.008, PAPER.sageD, 0.86);
  fan(outline(0.255, 0.175), 0.006, PAPER.sage, 1.0);
  // Midrib + two veins. Thin proud strips: the tape-seam idea, on a leaf.
  stampPly(s, 0.026, 0.008, 0.40, 0, 0.013, 0, PAPER.leaf, 1.0);
  stampPly(s, 0.20, 0.006, 0.018, 0.08, 0.014, -0.05, PAPER.leaf, 0.9, 0, 0.5, 0);
  stampPly(s, 0.20, 0.006, 0.018, -0.08, 0.014, 0.05, PAPER.leaf, 0.9, 0, -0.5, 0);
  return bake(s);
}

/** KERBSTONE — the sinker. Chipped, layered, and pointedly NOT taped. */
function buildStone() {
  const s = sink();
  stampPly(s, 0.60, 0.28, 0.60, 0, -0.10, 0, PAPER.sky, 0.62);
  stampPly(s, 0.56, 0.16, 0.56, 0, 0.06, 0, PAPER.lavender, 0.80);
  stampPly(s, 0.48, 0.10, 0.48, 0, 0.17, 0, PAPER.lavender, 1.0);
  stampPly(s, 0.30, 0.06, 0.34, 0.06, 0.23, -0.04, PAPER.sky, 1.06, 0, 0.35, 0);
  return bake(s);
}

const BUILDERS = {
  crate: buildCrate, ball: buildBall, log: buildLog,
  plank: buildPlank, leaf: buildLeaf, stone: buildStone,
};

/**
 * PRESSURE PLATE — a paper dais with a ring that goes gold when the count is
 * right. One geometry, two instances per plate (pad + ring), so both plates in
 * the world cost one draw call between them.
 */
function buildPlate() {
  const s = sink();
  stamp(s, new THREE.CylinderGeometry(1.0, 1.06, 0.10, 24), trs(0, 0.05, 0), lin(PAPER.tealD, 0.72));
  stamp(s, new THREE.CylinderGeometry(0.90, 0.94, 0.09, 24), trs(0, 0.13, 0), lin(PAPER.teal, 0.92));
  stamp(s, new THREE.CylinderGeometry(0.76, 0.80, 0.07, 24), trs(0, 0.20, 0), lin(PAPER.tealL, 1.0));
  // Four registration marks — they turn the pad into a place you PUT things.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.39;
    stampPly(s, 0.30, 0.03, 0.09, Math.cos(a) * 0.55, 0.245, Math.sin(a) * 0.55, PAPER.cream, 1.0, 0, -a, 0);
  }
  return bake(s);
}

/**
 * SIGNBOARD — a post and a cream board with a coral border, standing beside
 * each puzzle. The board is deliberately BLANK here: the equation on it is
 * live text and belongs to the HUD, which already owns every glyph in the game
 * and can size them for a five-year-old's eyes. Baking `1 + 2` into a texture
 * would fork the typography and freeze the difficulty.
 */
function buildSign() {
  const s = sink();
  stampPly(s, 0.14, 1.5, 0.14, 0, 0.75, 0, PAPER.coralD, 0.70);
  stampPly(s, 1.30, 0.86, 0.09, 0, 1.62, 0, PAPER.coralD, 0.78);
  stampPly(s, 1.16, 0.72, 0.06, 0, 1.62, 0.045, PAPER.cream, 1.06);
  stampPly(s, 1.02, 0.10, 0.03, 0, 1.30, 0.07, PAPER.peach, 1.0);
  return bake(s);
}

// ────────────────────────────────────────────────────────────────────────
// Assembly
// ────────────────────────────────────────────────────────────────────────

/**
 * Build the toybox: geometry, instances, bodies, puzzles.
 *
 * @param {object} opts
 * @param {object} opts.physics   a createPhysicsWorld() handle
 * @param {{sampleHeight:Function}} opts.heightfield
 * @param {number} [opts.extraPerKind]  spare instances above the sandbox count,
 *   so gameplay may spawn more of a kind without a geometry rebuild
 * @returns a handle with .group (add to the scene), .update(dt, ctx), .dispose()
 */
export function createPhysicsProps({
  physics,
  heightfield,
  placements = SANDBOX,
  puzzles = PUZZLES,
  extraPerKind = 8,
  castShadow = true,
} = {}) {
  const group = new THREE.Group();
  group.name = 'physics-props';
  const geometries = [];
  const materials = [];

  // One material for the whole toybox. Every kind bakes its colour into vertex
  // colours, so six kinds share one program and one paper surface — and the
  // grain is LOCAL space because all six of them rotate. See the header.
  const mat = toonMaterial(0xffffff, { vertexColors: true });
  applyPapercut(mat, {
    grain: 0.09, normal: 0.13, roughnessLike: 0.20, scale: 0.55, space: 'local',
    bleach: 0.24,
  });
  materials.push(mat);

  // ── Instanced meshes, one per kind ──────────────────────────────────────
  const counts = {};
  for (const p of placements) counts[p.kind] = (counts[p.kind] || 0) + 1;
  /** kind -> { mesh, cap, used, slotOfBody: Map, bodyOfSlot: [] } */
  const banks = new Map();
  for (const kind of PROP_ORDER) {
    const cap = (counts[kind] || 0) + extraPerKind;
    if (cap <= 0) continue;
    const geo = BUILDERS[kind]();
    geometries.push(geo);
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = `phx-${kind}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;      // bodies move; one bank bound is meaningless
    // Everything starts collapsed; a slot is only sized when a body takes it.
    for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO_MATRIX);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    banks.set(kind, { mesh, cap, used: 0, ids: new Array(cap).fill(null) });
  }

  // ── Plates and signs ────────────────────────────────────────────────────
  // Flattened across puzzles: "Share it Fair" needs TWO daises, one per zone,
  // and a child has to see two circles to believe in two shares. So the render
  // list is one entry per plate, each carrying the puzzle it belongs to so the
  // solved-gold pass can find it again.
  const plateSites = [];
  for (const p of puzzles) {
    if (!p.plates) continue;
    for (const site of p.plates) plateSites.push({ puzzle: p, site });
  }
  let plates = null;
  if (plateSites.length) {
    const geo = buildPlate();
    geometries.push(geo);
    plates = new THREE.InstancedMesh(geo, mat, plateSites.length);
    plates.name = 'phx-plates';
    plates.receiveShadow = true;
    plates.castShadow = false;   // a 20 cm dais casting a shadow reads as a hole
    for (let i = 0; i < plateSites.length; i++) {
      const site = plateSites[i].site;
      const y = heightfield.sampleHeight(site.x, site.z);
      _m.compose(
        _v.set(site.x, y, site.z),
        _q.identity(),
        // The dais is modelled at radius 1.06; scaling it to the zone's radius
        // is what guarantees the pad a child sees and the cylinder the puzzle
        // counts inside are the same circle.
        _s.set(site.r / 1.06, 1, site.r / 1.06),
      );
      plates.setMatrixAt(i, _m);
      // setColorAt allocates the instanceColor attribute on first use; seeding
      // every plate white here means the solved-gold write later is a value
      // change and never a buffer resize mid-frame.
      plates.setColorAt(i, WHITE);
    }
    plates.instanceMatrix.needsUpdate = true;
    group.add(plates);
  }

  const signSites = puzzles.filter((p) => p.sign);
  if (signSites.length) {
    const geo = buildSign();
    geometries.push(geo);
    const signs = new THREE.InstancedMesh(geo, mat, signSites.length);
    signs.name = 'phx-signs';
    signs.castShadow = castShadow;
    signs.receiveShadow = true;
    for (let i = 0; i < signSites.length; i++) {
      const site = signSites[i].sign;
      const y = heightfield.sampleHeight(site.x, site.z);
      _m.compose(_v.set(site.x, y, site.z), _q.setFromAxisAngle(AXIS_Y, site.yaw || 0), ONE);
      signs.setMatrixAt(i, _m);
    }
    signs.instanceMatrix.needsUpdate = true;
    group.add(signs);
  }

  // ── Bodies ──────────────────────────────────────────────────────────────
  /** body id -> { kind, slot, home } — `home` is what the leash brings it back to. */
  const placed = new Map();
  function spawn(place) {
    const bank = banks.get(place.kind);
    if (!bank || bank.used >= bank.cap) return null;
    const ground = heightfield.sampleHeight(place.x, place.z);
    const y = ground + (place.lift ?? spawnLift(place.kind));
    const spec = bodySpecFor(place, y);
    if (!spec) return null;
    const rec = physics.addBody(spec);
    if (!rec) return null;
    const slot = bank.used++;
    bank.ids[slot] = place.id;
    placed.set(place.id, { kind: place.kind, slot, home: { x: place.x, y, z: place.z } });
    return rec;
  }
  for (const p of placements) spawn(p);

  // ── Puzzle tracking ─────────────────────────────────────────────────────
  const tracker = createPuzzleTracker(puzzles);
  // Reusable body views: the tracker wants {kind,x,y,z,wet} and must not
  // allocate one per body per frame.
  const views = [];
  const groundAt = (x, z) => heightfield.sampleHeight(x, z);
  // Puzzles are cheap but not free (five puzzles x six zones x N bodies), and
  // nothing in them can change in under a tenth of a second of real play. This
  // is the one place a fixed-rate poll buys more than it costs.
  const PUZZLE_HZ = 6;
  let puzzleAcc = 0;
  // The leash runs slower still — nothing is ever urgent about a body that has
  // already left the world, and half a second of extra sinking costs nothing.
  const LEASH_HZ = 2;
  let leashAcc = 0;
  let recalls = 0;
  const oceanY = PHYS.waterY;

  /**
   * Bring home anything drowned or strayed. See LEASH.
   *
   * Skipped for sleeping bodies: a body at rest is by definition not running
   * away, and this is the difference between two Rapier reads per body per poll
   * and none at all once the garden has settled.
   */
  function runLeash() {
    const buf = physics.xforms;
    const stride = physics.XFORM_STRIDE;
    for (const [id, info] of placed) {
      const slot = physics.slotOf(id);
      if (slot < 0) continue;                    // recycled; not ours any more
      const o = slot * stride;
      const why = recallReason(info.kind, info.home, buf[o], buf[o + 1], buf[o + 2], oceanY);
      if (!why) continue;
      physics.teleport(id, info.home.x, info.home.y, info.home.z);
      recalls++;
    }
  }
  const solvedColour = new THREE.Color(PAPER.gold);
  // Reused result object — nearestPuzzle is polled every frame by the HUD.
  const _near = { puzzle: null, state: null, distance: 0 };

  /**
   * Push physics transforms into the instance matrices.
   *
   * Reads straight from the engine's dense Float32Array, so this loop touches
   * no Rapier object and allocates nothing. Only bodies the engine reported as
   * awake have moved, but writing a sleeping body's matrix is three memcpys
   * and skipping it would need a second parallel dirty list — so all live
   * slots are written and `instanceMatrix.needsUpdate` is set once per bank.
   */
  function syncMeshes() {
    const buf = physics.xforms;
    const stride = physics.XFORM_STRIDE;
    for (const [, bank] of banks) {
      let dirty = false;
      for (let i = 0; i < bank.used; i++) {
        const id = bank.ids[i];
        if (!id) continue;
        const pslot = physics.slotOf(id);
        if (pslot < 0) {
          // Recycled out from under us — collapse the instance.
          bank.mesh.setMatrixAt(i, ZERO_MATRIX);
          bank.ids[i] = null;
          dirty = true;
          continue;
        }
        const o = pslot * stride;
        _v.set(buf[o], buf[o + 1], buf[o + 2]);
        _q.set(buf[o + 3], buf[o + 4], buf[o + 5], buf[o + 6]);
        _m.compose(_v, _q, ONE);
        bank.mesh.setMatrixAt(i, _m);
        dirty = true;
      }
      if (dirty) bank.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Hoisted so `physics.forEach` is handed the SAME function object every poll
  // rather than a fresh closure — the whole point of the reusable view array.
  let viewCount = 0;
  function pushView(rec) {
    const buf = physics.xforms;
    const o = rec.slot * physics.XFORM_STRIDE;
    let v = views[viewCount];
    if (!v) v = views[viewCount] = { kind: '', x: 0, y: 0, z: 0, wet: 0 };
    v.kind = rec.kind;
    v.x = buf[o]; v.y = buf[o + 1]; v.z = buf[o + 2];
    v.wet = rec.wet;
    viewCount++;
  }
  function refreshViews() {
    viewCount = 0;
    physics.forEach(pushView);
    return viewCount;
  }

  return {
    group,
    tracker,
    puzzles,
    /** Placement ids currently backed by a live body. */
    ids() { return [...placed.keys()]; },
    /** Spawn one more of a kind at runtime (a thrown crate, say). */
    spawn,
    /**
     * @param {number} dt   frame seconds
     * @returns {string[]|null} puzzle ids solved this frame
     */
    update(dt) {
      syncMeshes();
      leashAcc += dt;
      const leashTick = 1 / LEASH_HZ;
      while (leashAcc >= leashTick) { leashAcc -= leashTick; runLeash(); }
      puzzleAcc += dt;
      const tick = 1 / PUZZLE_HZ;
      let fired = null;
      while (puzzleAcc >= tick) {
        puzzleAcc -= tick;
        const n = refreshViews();
        const f = tracker.step(tick, views, groundAt, n);
        if (f) fired = fired ? fired.concat(f) : f;
      }
      if (fired && plates) {
        for (let i = 0; i < plateSites.length; i++) {
          const st = tracker.get(plateSites[i].puzzle.id);
          if (!st || !st.solved) continue;
          plates.setColorAt(i, solvedColour);
          plates.instanceColor.needsUpdate = true;
        }
      }
      return fired;
    },
    /**
     * Puzzle nearest to (x, z) within `maxDist`, for the HUD prompt. Returns
     * the AUTHORED puzzle plus its live state so the caller can render
     * "1 + 2  —  2 of 3 stacked" without reaching into two objects.
     */
    nearestPuzzle(x, z, maxDist = 14) {
      let best = null, bestD2 = maxDist * maxDist;
      for (let i = 0; i < puzzles.length; i++) {
        const p = puzzles[i];
        const a = p.sign || (p.plates && p.plates[0]) || p.zones[0];
        const dx = x - a.x, dz = z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      if (!best) return null;
      _near.puzzle = best;
      _near.state = tracker.get(best.id);
      _near.distance = Math.sqrt(bestD2);
      return _near;
    },
    stats() {
      const perKind = {};
      for (const [kind, bank] of banks) perKind[kind] = bank.used;
      return {
        drawCalls: banks.size + (plates ? 1 : 0) + (signSites.length ? 1 : 0),
        bodies: placed.size,
        perKind,
        plates: plateSites.length,
        puzzlesSolved: tracker.solvedCount(),
        /** Bodies the leash has brought home. A rising count means bad placement. */
        recalls,
      };
    },
    dispose() {
      for (const id of placed.keys()) physics.removeBody(id);
      placed.clear();
      group.clear();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      geometries.length = 0;
      materials.length = 0;
      banks.clear();
    },
  };
}
