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
 * All palette values derive from PAPER (papercut law: teal shadows, no black).
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
//   ramp         { r0, r1, turns, theta0 } spiral shelf carved at constant
//                grade from r0 (outer, ground level) up to r1 (on the crown).
//                A profile with 70-degree cliff bands is unclimbable without
//                one — controller.js treats >50 degrees as a wall.
export const BIOMES = [
  { id: 'garden',   floorId: 1, name: 'Sprout Garden',   center: [0, 150],     radius: 70, heightBoost: 3,  roughness: 0.7,
    ridge: 0.16, terrace: 0.12,
    palette: { ground: PAPER.sage,     accent: PAPER.leaf } },
  { id: 'tidepool', floorId: 2, name: 'Tidepool Shallows', center: [140, 140], radius: 65, heightBoost: 1, roughness: 0.55,
    ridge: 0.1, terrace: 0.08,
    palette: { ground: PAPER.teal,     accent: PAPER.tealL } },
  // Sky Cliffs: a table mountain. Crown plateau, three cliff bands stepping
  // down to the sea, and a spiral shelf up the landward (west) face.
  { id: 'sky',      floorId: 3, name: 'Sky Cliffs',      center: [160, 0],     radius: 70, heightBoost: 40, roughness: 0.5,
    ridge: 0.55, terrace: 0.85, warp: 0.16,
    profile: [[0, 1], [0.30, 1], [0.37, 0.70], [0.47, 0.70], [0.55, 0.34], [0.66, 0.34], [0.74, 0.12], [0.88, 0.03], [1, 0]],
    ramp: { r0: 70, r1: 16, turns: 1.2, theta0: Math.PI, widthIn: 4.0, widthOut: 7.6 },
    palette: { ground: PAPER.sky,      accent: PAPER.cream } },
  { id: 'ember',    floorId: 4, name: 'Ember Slopes',    center: [125, -125],  radius: 60, heightBoost: 10, roughness: 1.05,
    ridge: 0.8, terrace: 0.34,
    palette: { ground: PAPER.coral,    accent: PAPER.orange } },
  // Frost Fields: a broad low plateau with soft shoulders — the calm shape
  // between two dramatic ones.
  { id: 'frost',    floorId: 5, name: 'Frost Fields',    center: [0, -160],    radius: 65, heightBoost: 16, roughness: 0.7,
    ridge: 0.35, terrace: 0.4,
    profile: [[0, 1], [0.34, 1], [0.50, 0.66], [0.66, 0.62], [0.82, 0.24], [1, 0]],
    palette: { ground: PAPER.tealL,    accent: PAPER.white } },
  { id: 'crystal',  floorId: 6, name: 'Crystal Hollow',  center: [-125, -125], radius: 60, heightBoost: 12, roughness: 1.2,
    ridge: 0.85, terrace: 0.46,
    palette: { ground: PAPER.lavender, accent: PAPER.white } },
  { id: 'market',   floorId: 7, name: 'Market Town',     center: [-155, 0],    radius: 60, heightBoost: 3,  roughness: 0.15,
    ridge: 0, terrace: 0.05,
    palette: { ground: PAPER.gold,     accent: PAPER.peach } },
  // Canyon Library: a sunken amphitheatre — flat reading floor, terraced
  // walls rising to a rim, then stepping back down to the coast.
  { id: 'library',  floorId: 8, name: 'Canyon Library',  center: [-125, 125],  radius: 60, heightBoost: 18, roughness: 0.9,
    ridge: 0.7, terrace: 0.55, warp: 0.22,
    profile: [[0, 0.30], [0.24, 0.30], [0.34, 0.40], [0.46, 0.88], [0.56, 0.92], [0.68, 0.52], [0.78, 0.54], [0.90, 0.14], [1, 0]],
    palette: { ground: PAPER.sand,     accent: PAPER.cream } },
  // Paper Palace: the hero landmark. Crown plateau at ~58 m, four cliff bands
  // with walkable benches between them, and a switchback road that starts on
  // the garden (south) side so the spawn vista shows the whole climb.
  { id: 'palace',   floorId: 9, name: 'Paper Palace',    center: [0, 0],       radius: 55, heightBoost: 55, roughness: 0.18,
    ridge: 0.3, terrace: 0.9, warp: 0.13,
    profile: [[0, 1], [0.34, 1], [0.41, 0.79], [0.50, 0.79], [0.57, 0.545], [0.67, 0.545],
      [0.745, 0.285], [0.85, 0.285], [0.93, 0.09], [1, 0]],
    ramp: { r0: 55, r1: 15, turns: 1.25, theta0: Math.PI / 2, widthIn: 3.4, widthOut: 6.6 },
    palette: { ground: PAPER.lavenderD, accent: PAPER.gold } },
  // Connective meadow between garden and market — no floor of its own.
  { id: 'meadow',   floorId: null, name: 'Petal Meadow', center: [-80, 165],   radius: 45, heightBoost: 2,  roughness: 0.8,
    ridge: 0.2, terrace: 0.12,
    palette: { ground: PAPER.sageD,    accent: PAPER.rose } },
];

// Small offshore islets get their own terrain bumps (read by heightfield).
export const ISLETS = [
  { center: [218, 60], radius: 11, height: 18 },
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

export function biomeForFloor(floorId) {
  return BIOMES.find((b) => b.floorId === floorId) || null;
}
