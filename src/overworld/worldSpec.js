/**
 * Authored overworld layout — pure data, no engine imports.
 *
 * The 3D hub is a single seamless island. Every floor of the tower gets a
 * themed biome region arranged like a compass rose around the central
 * palace summit; the heightfield (./heightfield.js) reads these radial
 * regions to reshape terrain, and scenes read portals/buildings/loot from
 * here so world layout lives in exactly one place.
 *
 * Coordinates: x east(+)/west(-), z south(+)/north(-), y up.
 * Bearings are measured as atan2(dz, dx), so 0 = east, +PI/2 = south,
 * PI = west, -PI/2 = north. Anywhere a bearing is authored below it is
 * written in TURNS (bearing / 2PI) because a periodic table is much easier to
 * read and edit in turns than in radians.
 *
 * All palette values derive from PAPER (papercut law: teal shadows, no black).
 *
 * ── WHY THIS FILE GREW A LANDFORM VOCABULARY ───────────────────────────────
 * Every landform used to be a 1-D `profile` swept around a centre, which made
 * the terrain generator structurally incapable of producing anything but a
 * radially symmetric muffin: blacken any frame and six of eight became the
 * same blob. The four constructs added here exist to break that, in order of
 * how much silhouette they buy:
 *
 *   profileAsym  bends the sweep by bearing, so one flank runs long and the
 *                opposite flank cuts off short. Asymmetric mass, one edit.
 *   escarp       collapses a narrow radius window on ONE bearing sector into a
 *                sheer face, so a mesa gets a cliff side and a ramp side.
 *   tors         sparse steep monoliths seeded per biome at 0.4-1.1 of its
 *                radius. These are the mid-ground occluders that put a THIRD
 *                depth layer between camera and landmark.
 *   RIDGES       hand-authored polyline arms. Where tors are statistical,
 *                ridges are composition: buttresses that give the hero mesa
 *                shoulders, and spurs that frame the establishing shot.
 *
 * And three constructs that anchor built things to the ground instead of
 * letting them float on it:
 *
 *   TERRACES     raised flat plinths (the market plaza).
 *   PATHS        carved level roads between authored nodes.
 *   PADS         auto-derived level footings under every portal, building,
 *                collectible and the spawn. These also make the placement
 *                audit structurally true rather than luckily true.
 */
import { PAPER } from '../config.js';

export const WORLD = { SIZE: 480, HALF: 240, WATER_Y: 0, SEED: 20260717 };

// Each biome is a radial region that reshapes terrain.
//
//   heightBoost  peak lift (meters) the region adds at its center
//   roughness    scales the relief noise inside the region
//   ridge        0..1 blend of the ridged multifractal over plain fBm —
//                high = crisp crest lines and broad smooth basins
//   terrace      0..1 strength of height quantisation into paper strata
//   warp         (profile biomes) how hard noise lobes the profile radius,
//                i.e. how much the mesa grows buttresses and gullies
//   profile      [normalisedRadius, heightFraction] stops, interpolated with
//                smoothstep so the curve is FLAT at every stop. Two stops at
//                the same height = a walkable bench; two stops close together
//                in radius = a near-vertical cliff band. This is how the hero
//                landmarks become stacked mesas instead of cones.
//   profileAsym  [turns, reach] stops, periodic over one full turn. `reach` is
//                applied as t -> t**reach BEFORE the profile is sampled, which
//                is the one form of asymmetry that cannot break the landform:
//                t**reach fixes both endpoints (0 stays 0, 1 stays 1), so the
//                mesa still lands exactly on the surrounding ground no matter
//                how hard a flank is pushed. reach > 1 runs that flank LONG
//                (shallow apron, mass extends outward); reach < 1 CUTS it off
//                (compressed, steeper, silhouette ends early).
//   gully        0..1 depth (as a fraction of heightBoost) of radial erosion
//                channels incised down the mid-flanks. Cheap, and the one cue
//                that separates "eroded landform" from "lathe-turned solid".
//   escarp       { dirTurns, arcTurns, t0, t1, drop } — inside the bearing
//                sector, the profile height is multiplied down by `drop` across
//                the narrow radius window t0..t1. That is a sheer face on one
//                side only: the single cheapest way to turn a dome into a
//                landmark you could identify from a black cutout.
//   tors         { count, rIn, rOut, hMin, hMax, wMin, wMax } — steep monolith
//                scatter, radii normalised to the biome radius (rOut may exceed
//                1: talus and outlying stacks belong OUTSIDE the mass).
//   ramp         { r0, r1, turns, theta0 } spiral shelf carved at constant
//                grade from r0 (outer, ground level) up to r1 (on the crown).
//                A profile with 70-degree cliff bands is unclimbable without
//                one — controller.js treats >50 degrees as a wall.
export const BIOMES = [
  // Sprout Garden: the spawn meadow. Deliberately the gentlest ground on the
  // island, but no longer a bedsheet — six broad knolls give the establishing
  // shot something between the hero and the palace.
  { id: 'garden',   floorId: 1, name: 'Sprout Garden',   center: [0, 150],     radius: 70, heightBoost: 3,  roughness: 0.72,
    ridge: 0.16, terrace: 0.14,
    tors: { count: 7, rIn: 0.34, rOut: 1.02, hMin: 2.6, hMax: 7.5, wMin: 13, wMax: 26, cap: 0.42 },
    palette: { ground: PAPER.sage,     accent: PAPER.leaf } },
  // Tidepool Shallows: flat by design (it is the beach), so its silhouette
  // interest is entirely offshore — see ISLETS, which puts rock stacks in the
  // water where tidepool-foam had 70% empty frame.
  { id: 'tidepool', floorId: 2, name: 'Tidepool Shallows', center: [140, 140], radius: 65, heightBoost: 1, roughness: 0.55,
    ridge: 0.1, terrace: 0.08,
    tors: { count: 5, rIn: 0.55, rOut: 1.12, hMin: 2.0, hMax: 6.5, wMin: 6, wMax: 13, cap: 0.30 },
    palette: { ground: PAPER.teal,     accent: PAPER.tealL } },
  // Sky Cliffs: a table mountain, now a HALF one. The seaward (east) flank is
  // cut off short and carries the escarpment, so the wall drops sheer into the
  // water; the landward (west) flank runs long and shallow and carries the
  // spiral shelf. That is a readable notch and an asymmetric silhouette, which
  // is the whole difference between a mesa and a muffin.
  { id: 'sky',      floorId: 3, name: 'Sky Cliffs',      center: [160, 0],     radius: 70, heightBoost: 40, roughness: 0.5,
    ridge: 0.55, terrace: 0.85, warp: 0.24, gully: 0.15,
    profile: [[0, 1], [0.30, 1], [0.37, 0.70], [0.47, 0.70], [0.55, 0.34], [0.66, 0.34], [0.74, 0.12], [0.88, 0.03], [1, 0]],
    profileAsym: [[0.000, 0.62], [0.125, 0.72], [0.250, 0.94], [0.375, 1.16],
      [0.500, 1.30], [0.625, 1.12], [0.750, 0.86], [0.875, 0.66]],
    escarp: { dirTurns: 0.0, arcTurns: 0.21, t0: 0.335, t1: 0.395, drop: 0.46 },
    tors: { count: 8, rIn: 0.74, rOut: 1.16, hMin: 4, hMax: 15, wMin: 7, wMax: 16, cap: 0.26 },
    ramp: { r0: 70, r1: 16, turns: 1.2, theta0: Math.PI, widthIn: 4.0, widthOut: 7.6 },
    // Ground is the pale plateau paper, accent is a COOL VIOLET rock. The old
    // pairing was sky-blue over cream — two pale neutrals — which is why the
    // whole table mountain read as "one desaturated grey value" with no
    // stratigraphy in it at all. Lavender against sky separates in value and in
    // hue while staying inside the papercut palette.
    palette: { ground: PAPER.sky,      accent: PAPER.lavender } },
  // Ember Slopes: was a plain radial bump, i.e. a dome. Now a breached cinder
  // cone — crater floor, high rim, and a blown-out flank to the north-west
  // where the asym reach collapses the rim into a saddle you can walk through.
  { id: 'ember',    floorId: 4, name: 'Ember Slopes',    center: [125, -125],  radius: 60, heightBoost: 11, roughness: 1.0,
    ridge: 0.8, terrace: 0.36, warp: 0.14, gully: 0.14,
    profile: [[0, 0.56], [0.19, 0.56], [0.30, 0.90], [0.41, 0.94], [0.55, 0.62], [0.70, 0.34], [0.85, 0.11], [1, 0]],
    profileAsym: [[0.000, 1.10], [0.250, 1.22], [0.500, 0.78], [0.625, 0.66], [0.750, 0.80]],
    tors: { count: 9, rIn: 0.46, rOut: 1.06, hMin: 2.6, hMax: 8.5, wMin: 6, wMax: 13, cap: 0.30 },
    palette: { ground: PAPER.coral,    accent: PAPER.orange } },
  // Frost Fields: a broad low plateau with soft shoulders — the calm shape
  // between two dramatic ones. Mild asym only; the island needs one place the
  // eye can rest.
  { id: 'frost',    floorId: 5, name: 'Frost Fields',    center: [0, -160],    radius: 65, heightBoost: 16, roughness: 0.7,
    ridge: 0.35, terrace: 0.4,
    profile: [[0, 1], [0.34, 1], [0.50, 0.66], [0.66, 0.62], [0.82, 0.24], [1, 0]],
    profileAsym: [[0.000, 0.86], [0.250, 1.14], [0.500, 1.06], [0.750, 0.84]],
    tors: { count: 6, rIn: 0.52, rOut: 1.04, hMin: 3, hMax: 9, wMin: 8, wMax: 17, cap: 0.34 },
    palette: { ground: PAPER.tealL,    accent: PAPER.white } },
  // Crystal Hollow: was a dome too. Now a low shattered mesa whose real
  // silhouette is its spires — narrow, tall tors packed from the crown out.
  { id: 'crystal',  floorId: 6, name: 'Crystal Hollow',  center: [-125, -125], radius: 60, heightBoost: 13, roughness: 1.15,
    ridge: 0.85, terrace: 0.5, warp: 0.2, gully: 0.18,
    profile: [[0, 1], [0.22, 1], [0.31, 0.60], [0.45, 0.56], [0.56, 0.30], [0.71, 0.26], [0.87, 0.07], [1, 0]],
    profileAsym: [[0.000, 0.72], [0.125, 0.80], [0.375, 1.20], [0.500, 1.26], [0.750, 0.90]],
    escarp: { dirTurns: 0.06, arcTurns: 0.17, t0: 0.285, t1: 0.335, drop: 0.40 },
    tors: { count: 13, rIn: 0.28, rOut: 1.02, hMin: 4, hMax: 17, wMin: 4.5, wMax: 10, cap: 0.22 },
    palette: { ground: PAPER.lavender, accent: PAPER.white } },
  // Market Town: intentionally the flattest ground on the island, because the
  // level change here is BUILT, not eroded — see TERRACES (the plaza plinth)
  // and PATHS (the road that ties the three structures together).
  { id: 'market',   floorId: 7, name: 'Market Town',     center: [-155, 0],    radius: 60, heightBoost: 3,  roughness: 0.34,
    ridge: 0.12, terrace: 0.05,
    palette: { ground: PAPER.gold,     accent: PAPER.peach } },
  // Canyon Library: a sunken amphitheatre — flat reading floor, terraced walls
  // rising to a rim, then stepping back down to the coast. The asym collapses
  // the rim on the north-east bearing, which is the ENTRANCE: an amphitheatre
  // with an unbroken rim is a bowl, and a bowl has no silhouette.
  { id: 'library',  floorId: 8, name: 'Canyon Library',  center: [-125, 125],  radius: 60, heightBoost: 18, roughness: 0.9,
    ridge: 0.7, terrace: 0.55, warp: 0.26, gully: 0.13,
    profile: [[0, 0.30], [0.24, 0.30], [0.34, 0.40], [0.46, 0.88], [0.56, 0.92], [0.68, 0.52], [0.78, 0.54], [0.90, 0.14], [1, 0]],
    profileAsym: [[0.000, 1.04], [0.250, 1.16], [0.500, 1.10], [0.750, 0.90], [0.875, 0.80]],
    tors: { count: 7, rIn: 0.68, rOut: 1.08, hMin: 3, hMax: 10, wMin: 6, wMax: 14, cap: 0.28 },
    palette: { ground: PAPER.sand,     accent: PAPER.cream } },
  // Paper Palace: the hero landmark. Crown plateau at ~58 m, four cliff bands
  // with walkable benches between them, and a switchback road that starts on
  // the garden (south) side so the spawn vista shows the whole climb.
  //
  // The asym is the single most load-bearing edit in this file. The SW flank
  // (0.375 turns — the one the spawn camera looks at) runs to reach 1.32, a
  // long shallow apron the road climbs; the NE flank cuts to 0.62 and carries
  // the escarpment. From the spawn the mesa is therefore a long ramp on the
  // left rising to a summit that shears off on the right, which is a shape,
  // not a muffin.
  { id: 'palace',   floorId: 9, name: 'Paper Palace',    center: [0, 0],       radius: 55, heightBoost: 55, roughness: 0.18,
    ridge: 0.3, terrace: 0.9, warp: 0.21, gully: 0.17,
    profile: [[0, 1], [0.34, 1], [0.41, 0.79], [0.50, 0.79], [0.57, 0.545], [0.67, 0.545],
      [0.745, 0.285], [0.85, 0.285], [0.93, 0.09], [1, 0]],
    profileAsym: [[0.000, 0.86], [0.125, 1.02], [0.250, 1.18], [0.375, 1.32],
      [0.500, 1.22], [0.625, 0.94], [0.750, 0.70], [0.875, 0.62]],
    escarp: { dirTurns: 0.845, arcTurns: 0.19, t0: 0.505, t1: 0.565, drop: 0.44 },
    tors: { count: 11, rIn: 0.80, rOut: 1.18, hMin: 3.5, hMax: 12, wMin: 8, wMax: 18, cap: 0.30 },
    ramp: { r0: 55, r1: 15, turns: 1.25, theta0: Math.PI / 2, widthIn: 3.4, widthOut: 6.6 },
    palette: { ground: PAPER.lavenderD, accent: PAPER.gold } },
  // Connective meadow between garden and market — no floor of its own.
  { id: 'meadow',   floorId: null, name: 'Petal Meadow', center: [-80, 165],   radius: 45, heightBoost: 2.5,  roughness: 0.8,
    ridge: 0.2, terrace: 0.12,
    tors: { count: 4, rIn: 0.40, rOut: 1.0, hMin: 2.4, hMax: 6, wMin: 11, wMax: 20, cap: 0.40 },
    palette: { ground: PAPER.sageD,    accent: PAPER.rose } },
];

/**
 * Hand-authored ridge arms — polyline masses added on top of everything else.
 *
 * Tors are statistical; these are COMPOSITION. Each one exists to put a
 * specific mass in a specific frame:
 *
 *   width   half-width in metres of the ridge's footprint
 *   height  crest lift in metres at the centreline
 *   crest   0..1 — how much of the width is crown vs flank (higher = flatter
 *           top, sharper shoulders)
 *   undul   0..1 — how hard the crest height undulates along the length, so a
 *           ridge reads as eroded rock rather than an extruded prism
 */
export const RIDGES = [
  // Palace buttress arms. The hero mesa used to be one isolated lump with
  // nothing to bridge the scale gap; these give it shoulders, and the SW arm
  // is what the spawn camera reads as the mid-ground bench.
  { id: 'palace-arm-sw', pts: [[-34, 26], [-58, 52], [-80, 82], [-96, 116]], width: 27, height: 18, crest: 0.16, undul: 0.42 },
  { id: 'palace-arm-ne', pts: [[28, -28], [50, -54], [62, -86], [58, -114]], width: 24, height: 15, crest: 0.14, undul: 0.46 },
  // Establishing-shot framing: a low spur down each side of the spawn vista.
  // These are the occluders that give the frame a foreground ply.
  { id: 'garden-spur-w', pts: [[-22, 202], [-36, 174], [-32, 146], [-18, 126]], width: 20, height: 11.5, crest: 0.14, undul: 0.40 },
  { id: 'garden-spur-e', pts: [[42, 194], [54, 166], [46, 138], [32, 118]], width: 19, height: 10.5, crest: 0.14, undul: 0.42 },
  // Sky Cliffs landward saddle — the table mountain now connects to the island
  // through a ridgeline instead of rising out of nothing.
  { id: 'sky-saddle',    pts: [[100, 18], [76, 40], [56, 64]], width: 25, height: 13, crest: 0.15, undul: 0.44 },
  // Ember/frost divide: mid-ground interest across the ember-dusk foreground,
  // which was 55% undifferentiated clay ramp.
  { id: 'ember-divide',  pts: [[74, -98], [44, -116], [12, -124]], width: 23, height: 12, crest: 0.13, undul: 0.48 },
  // Market's sheltering back wall — gives the town a horizon that is not just
  // a flat ochre plain meeting a dead sea.
  { id: 'market-backwall', pts: [[-186, -50], [-200, -4], [-190, 44]], width: 21, height: 14.5, crest: 0.18, undul: 0.36 },
  // ...and a bluff closing the town's northern side, so Market Town sits in a
  // sheltered nook with landform on two sides instead of on an open plain.
  { id: 'market-nook',   pts: [[-122, -46], [-150, -58], [-180, -54]], width: 21, height: 13.5, crest: 0.16, undul: 0.40 },
  // Library outer rampart, so the amphitheatre reads against something.
  { id: 'library-rampart', pts: [[-170, 94], [-178, 128], [-158, 160]], width: 20, height: 11, crest: 0.15, undul: 0.42 },
];

/**
 * Raised flat plinths. Terrain inside the rounded rectangle is levelled to
 * (base at centre + lift) and feathered out over `skirt`.
 */
export const TERRACES = [
  // Market plaza. Three unrelated buildings on flat sand is why market-town
  // scored a 3; putting them on one shared terrace with a road through it is
  // the fix that costs no draw calls.
  // The plinth is deliberately SHORT-SKIRTED. Market Town's natural ground is a
  // shallow bowl, so a plaza with a wide feathered edge simply becomes the bowl
  // floor again and no level change reads from any approach. 3.2 m of lift with
  // a 5.5 m skirt is a ~30-degree retaining bank: walkable, and visible as an
  // edge from every direction the town is ever framed from. The main road
  // crosses it and re-smooths a ramp exactly where it needs one.
  { id: 'market-plaza', x: -155, z: 3, hx: 16, hz: 22, round: 8, rot: 0.16, lift: 3.2, skirt: 5.5, paint: 0.5 },
];

/**
 * Carved level roads. Node heights are sampled from the terraced base at load,
 * relaxed so the grade stays walkable, then the terrain is blended toward the
 * polyline inside `width` and feathered over `blend`.
 */
export const PATHS = [
  // The market's main street, running in from the garden side, through the
  // plaza, and out the back — with two short spurs to the shop and gallery
  // doors. This is the connective tissue "object scatter on a plane" lacked.
  { id: 'market-main', width: 3.8, blend: 7.0, paint: 0.72,
    pts: [[-106, 34], [-126, 20], [-144, 11], [-157, 3], [-170, -12], [-178, -34]] },
  { id: 'market-shop', width: 2.6, blend: 5.0, paint: 0.66, pts: [[-155, 3], [-161, -11]] },
  { id: 'market-gallery', width: 2.6, blend: 5.0, paint: 0.66, pts: [[-155, 3], [-146, 13]] },
  // The palace approach. A shot called "palace-approach" with no road on it is
  // the critique in one line; this runs from the spawn meadow to the foot of
  // the spiral ramp on the mesa's south flank.
  { id: 'palace-road', width: 4.4, blend: 9.0, paint: 0.62,
    pts: [[10, 128], [7, 108], [3, 88], [0, 72], [1, 58]] },
];

// Small offshore islets get their own terrain bumps (read by heightfield).
// The tidepool group exists purely for silhouette: tidepool-foam was 70% empty
// water with no offshore mass to measure the distance against.
export const ISLETS = [
  { center: [218, 60], radius: 11, height: 18 },
  { center: [152, 147], radius: 7.0, height: 14 },
  { center: [138, 164], radius: 4.6, height: 9.5 },
  { center: [167, 132], radius: 5.2, height: 8 },
];

export const PORTALS = [
  { id: 'portal-f1', floorId: 1, x: 10,   z: 140,  yaw: Math.PI },
  { id: 'portal-f2', floorId: 2, x: 128,  z: 128,  yaw: -Math.PI * 0.75 },
  { id: 'portal-f3', floorId: 3, x: 150,  z: -12,  yaw: -Math.PI / 2 },
  { id: 'portal-f4', floorId: 4, x: 118,  z: -116, yaw: -Math.PI * 0.25 },
  { id: 'portal-f5', floorId: 5, x: 8,    z: -150, yaw: 0 },
  { id: 'portal-f6', floorId: 6, x: -116, z: -118, yaw: Math.PI * 0.25 },
  { id: 'portal-f7', floorId: 7, x: -148, z: 10,   yaw: Math.PI / 2 },
  { id: 'portal-f8', floorId: 8, x: -118, z: 116,  yaw: Math.PI * 0.75 },
  { id: 'portal-f9', floorId: 9, x: 0,    z: -10,  yaw: 0 },
];

export const BUILDINGS = [
  { id: 'shop',       kind: 'shop',    x: -162, z: -14, yaw: Math.PI / 2 },
  { id: 'gallery',    kind: 'gallery', x: -146, z: 16,  yaw: Math.PI / 2 },
  { id: 'spire-gate', kind: 'gate',    x: 218,  z: 60,  yaw: -Math.PI / 2 },
];

export const COLLECTIBLES = [
  { id: 'ow-garden-1',   kind: 'gold',   x: -20,  z: 135,  amount: 20 },
  { id: 'ow-garden-2',   kind: 'gold',   x: 25,   z: 160,  amount: 25 },
  { id: 'ow-garden-3',   kind: 'potion', x: -5,   z: 175,  amount: 1 },
  { id: 'ow-garden-4',   kind: 'gold',   x: 30,   z: 130,  amount: 30 },
  { id: 'ow-tidepool-1', kind: 'gold',   x: 128,  z: 148,  amount: 20 },
  { id: 'ow-tidepool-2', kind: 'gold',   x: 148,  z: 120,  amount: 25 },
  { id: 'ow-tidepool-3', kind: 'potion', x: 120,  z: 132,  amount: 1 },
  { id: 'ow-tidepool-4', kind: 'gold',   x: 140,  z: 110,  amount: 30 },
  { id: 'ow-sky-1',      kind: 'gold',   x: 150,  z: 16,   amount: 35 },
  { id: 'ow-sky-2',      kind: 'gold',   x: 172,  z: -10,  amount: 30 },
  { id: 'ow-sky-3',      kind: 'potion', x: 145,  z: -25,  amount: 1 },
  { id: 'ow-sky-4',      kind: 'gold',   x: 185,  z: 8,    amount: 40 },
  { id: 'ow-ember-1',    kind: 'gold',   x: 110,  z: -112, amount: 25 },
  { id: 'ow-ember-2',    kind: 'gold',   x: 138,  z: -130, amount: 30 },
  { id: 'ow-ember-3',    kind: 'potion', x: 118,  z: -140, amount: 1 },
  { id: 'ow-ember-4',    kind: 'gold',   x: 100,  z: -130, amount: 20 },
  { id: 'ow-frost-1',    kind: 'gold',   x: -18,  z: -150, amount: 25 },
  { id: 'ow-frost-2',    kind: 'gold',   x: 15,   z: -168, amount: 30 },
  { id: 'ow-frost-3',    kind: 'potion', x: 0,    z: -140, amount: 1 },
  { id: 'ow-frost-4',    kind: 'gold',   x: -25,  z: -172, amount: 35 },
  { id: 'ow-crystal-1',  kind: 'gold',   x: -110, z: -115, amount: 30 },
  { id: 'ow-crystal-2',  kind: 'gold',   x: -138, z: -130, amount: 35 },
  { id: 'ow-crystal-3',  kind: 'potion', x: -120, z: -142, amount: 1 },
  { id: 'ow-crystal-4',  kind: 'gold',   x: -100, z: -120, amount: 20 },
  { id: 'ow-market-1',   kind: 'gold',   x: -165, z: 12,   amount: 15 },
  { id: 'ow-market-2',   kind: 'gold',   x: -140, z: -10,  amount: 20 },
  { id: 'ow-market-3',   kind: 'potion', x: -150, z: 22,   amount: 1 },
  { id: 'ow-market-4',   kind: 'gold',   x: -170, z: -8,   amount: 25 },
  // Nudged off the amphitheatre's cliff riser onto the bench beside it —
  // the terraced library walls exceed the 50-degree walk limit.
  { id: 'ow-library-1',  kind: 'gold',   x: -111.5, z: 113.5, amount: 25 },
  { id: 'ow-library-2',  kind: 'gold',   x: -138, z: 132,  amount: 30 },
  { id: 'ow-library-3',  kind: 'potion', x: -118, z: 142,  amount: 1 },
  { id: 'ow-library-4',  kind: 'gold',   x: -97,  z: 119,  amount: 20 },
  { id: 'ow-palace-1',   kind: 'gold',   x: 12,   z: 8,    amount: 40 },
  { id: 'ow-palace-2',   kind: 'gold',   x: -10,  z: 12,   amount: 40 },
  { id: 'ow-palace-3',   kind: 'potion', x: 8,    z: -14,  amount: 1 },
  { id: 'ow-palace-4',   kind: 'gold',   x: -14,  z: -6,   amount: 35 },
];

// Player arrives on the garden meadow facing the palace (north).
export const SPAWN = { x: 6, z: 158, yaw: Math.PI };

/**
 * Level footings under everything the player interacts with.
 *
 * WHY these are derived rather than authored: footprintY() in props.js levels a
 * PROP to its footprint but leaves the ground alone, so a gate on a 20-degree
 * slope floats on one corner and buries the other — "object scatter on a
 * plane". Cutting the ground instead means the prop, its shadow and its contact
 * line all agree, and it makes the walkable-placement audit structurally true
 * (a levelled pad has normal.y = 1) instead of luckily true.
 *
 *   r       radius levelled dead flat
 *   skirt   radius over which the cut feathers back into natural ground
 *   paint   0..1 how much the terrain mesh tints this as worn ground/pavers.
 *           Collectibles get 0: a bald patch under every coin would read as
 *           49 bugs, but a flat perch under one reads as level design.
 */
export const PADS = [
  ...PORTALS.map((p) => ({ id: `pad-${p.id}`, x: p.x, z: p.z, r: 4.8, skirt: 9.0, paint: 0.55 })),
  ...BUILDINGS.map((b) => ({ id: `pad-${b.id}`, x: b.x, z: b.z, r: 5.6, skirt: 10.0, paint: 0.6 })),
  ...COLLECTIBLES.map((c) => ({ id: `pad-${c.id}`, x: c.x, z: c.z, r: 1.4, skirt: 5.5, paint: 0 })),
  { id: 'pad-spawn', x: SPAWN.x, z: SPAWN.z, r: 3.4, skirt: 8.5, paint: 0.25 },
];

export function biomeForFloor(floorId) {
  return BIOMES.find((b) => b.floorId === floorId) || null;
}
