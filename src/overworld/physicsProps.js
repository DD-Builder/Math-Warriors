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
 * WHY they are in clusters and not spread: one crate is scenery. Five crates
 * beside a ledge is a QUESTION. Every cluster below is placed to suggest its
 * verb — logs sit at the tops of the garden's knolls where the slope will take
 * them, planks lie beside the pond where the gap is, balls sit on the market's
 * flat paving where they will run.
 *
 * Coordinates avoid the levelled pads under portals, buildings and pickups
 * (see worldSpec.PADS) so nothing is born inside a monument.
 */
export const SANDBOX = [
  // ── Sprout Garden: the meadow round the spawn at (6, 158) ────────────────
  // Push pile, twenty metres from where the player lands. First thing you see.
  { id: 'phx-g-crate-1', kind: 'crate', x: 17.5, z: 149.0, yaw: 0.3 },
  { id: 'phx-g-crate-2', kind: 'crate', x: 19.2, z: 147.2, yaw: 1.1 },
  { id: 'phx-g-crate-3', kind: 'crate', x: 16.2, z: 146.6, yaw: 2.4 },
  { id: 'phx-g-crate-4', kind: 'crate', x: 18.0, z: 145.0, yaw: 0.8 },
  // Stack puzzle stock, at the foot of the garden's south-west knoll.
  { id: 'phx-g-crate-5', kind: 'crate', x: -22.0, z: 140.5, yaw: 0.2 },
  { id: 'phx-g-crate-6', kind: 'crate', x: -23.6, z: 138.8, yaw: 1.7 },
  { id: 'phx-g-crate-7', kind: 'crate', x: -20.6, z: 138.2, yaw: 2.9 },
  { id: 'phx-g-crate-8', kind: 'crate', x: -24.4, z: 141.9, yaw: 0.6 },
  // Logs on the knoll crowns — they are already pointing across the fall line,
  // so the first nudge sends them down.
  { id: 'phx-g-log-1', kind: 'log', x: 32.5, z: 167.0, yaw: 1.35 },
  { id: 'phx-g-log-2', kind: 'log', x: 29.5, z: 170.0, yaw: 0.55 },
  // A third log with the timber by the pool, where the planks are — the two
  // long objects belong together, and a log is the fulcrum a child needs if
  // they want to make a second see-saw of their own.
  { id: 'phx-g-log-3', kind: 'log', x: -19.5, z: 148.0, yaw: 2.15 },
  // Planks beside the garden pool at (-8, 154), r 7.5.
  { id: 'phx-g-plank-1', kind: 'plank', x: -16.5, z: 151.0, yaw: 0.9 },
  { id: 'phx-g-plank-2', kind: 'plank', x: -15.0, z: 158.5, yaw: 2.2 },
  { id: 'phx-g-plank-3', kind: 'plank', x: -1.0, z: 150.5, yaw: 1.4 },
  { id: 'phx-g-plank-4', kind: 'plank', x: -0.5, z: 157.0, yaw: 0.2 },
  { id: 'phx-g-plank-5', kind: 'plank', x: -17.5, z: 145.5, yaw: 2.7 },
  // See-saw kit: a log for the fulcrum and a plank across it, pre-assembled so
  // the toy is legible from the path rather than being a pile of parts.
  { id: 'phx-g-log-4', kind: 'log', x: 31.0, z: 152.0, yaw: 0 },
  { id: 'phx-g-plank-6', kind: 'plank', x: 31.0, z: 152.0, yaw: Math.PI / 2, lift: 0.78 },
  // Balls where the ground already tilts.
  { id: 'phx-g-ball-1', kind: 'ball', x: 28.5, z: 149.0 },
  { id: 'phx-g-ball-2', kind: 'ball', x: 34.0, z: 172.5 },
  { id: 'phx-g-ball-3', kind: 'ball', x: 11.0, z: 176.0 },
  // Drift of leaves across the open meadow, where the wind has the fetch.
  { id: 'phx-g-leaf-1', kind: 'leaf', x: 4.0, z: 168.0, yaw: 0.4 },
  { id: 'phx-g-leaf-2', kind: 'leaf', x: 7.2, z: 170.5, yaw: 1.9 },
  { id: 'phx-g-leaf-3', kind: 'leaf', x: 1.5, z: 172.0, yaw: 3.1 },
  { id: 'phx-g-leaf-4', kind: 'leaf', x: 10.5, z: 166.0, yaw: 2.4 },
  // This one starts ON the garden pool. It is the cheapest possible tutorial:
  // the first floating object a child sees is already floating, before they
  // have pushed anything in.
  { id: 'phx-g-leaf-5', kind: 'leaf', x: -2.0, z: 154.0, yaw: 0.9 },
  { id: 'phx-g-leaf-6', kind: 'leaf', x: 13.5, z: 172.5, yaw: 1.2 },

  // ── Market: the plaza and the main street ────────────────────────────────
  // Stall goods. The street runs [-106,34] -> [-178,-34]; the plaza is ~[-155,3].
  { id: 'phx-m-crate-1', kind: 'crate', x: -149.0, z: 8.5, yaw: 0.5 },
  { id: 'phx-m-crate-2', kind: 'crate', x: -151.5, z: -1.5, yaw: 1.6 },
  { id: 'phx-m-crate-3', kind: 'crate', x: -157.5, z: 6.0, yaw: 2.8 },
  { id: 'phx-m-crate-4', kind: 'crate', x: -148.5, z: -3.5, yaw: 0.1 },
  { id: 'phx-m-crate-5', kind: 'crate', x: -159.5, z: -3.0, yaw: 2.0 },
  { id: 'phx-m-crate-6', kind: 'crate', x: -166.0, z: -18.0, yaw: 1.1 },
  // Loose balls on the paving — the flattest ground in the world, so they run.
  { id: 'phx-m-ball-1', kind: 'ball', x: -139.0, z: 4.5 },
  { id: 'phx-m-ball-2', kind: 'ball', x: -164.0, z: 9.0 },
  // Sitting just outside the ball pen, which is the whole hint the puzzle needs.
  { id: 'phx-m-ball-3', kind: 'ball', x: -170.0, z: -13.0 },
  // Timber leaning by the shop.
  { id: 'phx-m-plank-1', kind: 'plank', x: -147.5, z: 20.0, yaw: 1.0 },
  { id: 'phx-m-plank-2', kind: 'plank', x: -169.5, z: -21.5, yaw: 2.5 },
  { id: 'phx-m-log-1', kind: 'log', x: -132.0, z: 16.5, yaw: 0.7 },
  { id: 'phx-m-log-2', kind: 'log', x: -173.0, z: -26.0, yaw: 1.8 },
  // Kerbstones — the sinkers. See PROP_KINDS.stone.
  { id: 'phx-m-stone-1', kind: 'stone', x: -153.0, z: 12.0, yaw: 0.3 },
  { id: 'phx-m-stone-2', kind: 'stone', x: -156.5, z: 13.5, yaw: 1.2 },
  // Leaves blowing up the street.
  { id: 'phx-m-leaf-1', kind: 'leaf', x: -128.0, z: 22.0, yaw: 0.6 },
  { id: 'phx-m-leaf-2', kind: 'leaf', x: -134.0, z: 17.0, yaw: 2.1 },
  { id: 'phx-m-leaf-3', kind: 'leaf', x: -142.0, z: 11.5, yaw: 1.5 },
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
 *   check     'in'    body centre inside the cylinder and the height window
 *             'float' as 'in', and the body is floating (partly wet, not sunk)
 *   need      exact count required
 *   pair      for 'balance': the id of the zone that must MATCH this one
 */
export const PUZZLES = [
  {
    id: 'phz-garden-steps',
    place: 'garden',
    name: 'Steps Up',
    prompt: '1 + 2',
    answer: 3,
    hint: 'Stack that many crates to reach the ledge.',
    sign: { x: -25.5, z: 144.0, yaw: 0.5 },
    reward: 'ledge-coin',
    zones: [{ id: 'stack', kind: 'crate', check: 'in', x: -26.0, z: 142.0, r: 2.3, y0: -0.6, y1: 6.0 }],
    need: 3,
  },
  {
    id: 'phz-garden-bridge',
    place: 'garden',
    name: 'Cross the Pool',
    prompt: '2 + 2',
    answer: 4,
    hint: 'Float that many planks to walk across.',
    sign: { x: -14.0, z: 147.0, yaw: 2.2 },
    reward: 'pool-island',
    // The garden pool is at (-8, 154) with radius 7.5.
    zones: [{ id: 'pool', kind: 'plank', check: 'float', x: -8.0, z: 154.0, r: 8.4, y0: -1.2, y1: 1.6 }],
    need: 4,
  },
  {
    id: 'phz-garden-seesaw',
    place: 'garden',
    name: 'Balance the Beam',
    prompt: '3 + 3',
    answer: 6,
    hint: 'Same number on each end — three and three.',
    sign: { x: 34.5, z: 149.5, yaw: -0.7 },
    reward: 'seesaw-chime',
    // Two ends of the plank at (31, 152), which lies along +X.
    zones: [
      { id: 'left', kind: null, check: 'in', x: 29.4, z: 152.0, r: 1.5, y0: 0.4, y1: 3.2, pair: 'right' },
      { id: 'right', kind: null, check: 'in', x: 32.6, z: 152.0, r: 1.5, y0: 0.4, y1: 3.2, pair: 'left' },
    ],
    need: 6,
  },
  {
    id: 'phz-market-plate',
    place: 'market',
    name: 'The Heavy Door',
    prompt: '2 x 3',
    answer: 6,
    hint: 'Two rows of three — anything heavy will do.',
    sign: { x: -152.0, z: 17.5, yaw: 1.4 },
    reward: 'market-gate',
    plate: { x: -154.0, z: 14.0, r: 2.7 },
    zones: [{ id: 'plate', kind: null, check: 'in', x: -154.0, z: 14.0, r: 2.7, y0: -0.2, y1: 2.4 }],
    need: 6,
  },
  {
    id: 'phz-market-pen',
    place: 'market',
    name: 'Roll Them Home',
    prompt: '5 - 3',
    answer: 2,
    hint: 'Five balls, take three away. Roll the rest in.',
    sign: { x: -165.0, z: -11.0, yaw: 2.6 },
    reward: 'pen-prize',
    plate: { x: -168.0, z: -14.5, r: 2.4 },
    zones: [{ id: 'pen', kind: 'ball', check: 'in', x: -168.0, z: -14.5, r: 2.4, y0: -0.3, y1: 1.8 }],
    need: 2,
  },
];

/** Seconds a puzzle's condition must hold before it latches as solved. */
export const PUZZLE_HOLD = 0.7;

/**
 * Is one body inside one zone?
 *
 * `groundY` is the terrain height under the zone centre; the y window is quoted
 * relative to it. `body` is {kind, x, y, z, wet}.
 */
export function bodyInZone(zone, body, groundY = 0) {
  if (zone.kind && body.kind !== zone.kind) return false;
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
  const plateSites = puzzles.filter((p) => p.plate);
  let plates = null;
  if (plateSites.length) {
    const geo = buildPlate();
    geometries.push(geo);
    plates = new THREE.InstancedMesh(geo, mat, plateSites.length);
    plates.name = 'phx-plates';
    plates.receiveShadow = true;
    plates.castShadow = false;   // a 20 cm dais casting a shadow reads as a hole
    for (let i = 0; i < plateSites.length; i++) {
      const site = plateSites[i].plate;
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
  /** body id -> { kind, slot } */
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
    placed.set(place.id, { kind: place.kind, slot });
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
          const st = tracker.get(plateSites[i].id);
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
        const a = p.sign || p.plate || p.zones[0];
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
        puzzlesSolved: tracker.solvedCount(),
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
