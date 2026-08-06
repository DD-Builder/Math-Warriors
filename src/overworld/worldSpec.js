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

// Each biome is a radial region that reshapes terrain: heightBoost lifts
// (or sinks) the land toward its center, roughness scales the fBm detail.
export const BIOMES = [
  { id: 'garden',   floorId: 1, name: 'Sprout Garden',   center: [0, 150],     radius: 70, heightBoost: 3,  roughness: 0.7,
    palette: { ground: PAPER.sage,     accent: PAPER.leaf } },
  { id: 'tidepool', floorId: 2, name: 'Tidepool Shallows', center: [140, 140], radius: 65, heightBoost: -1, roughness: 0.6,
    palette: { ground: PAPER.teal,     accent: PAPER.tealL } },
  { id: 'sky',      floorId: 3, name: 'Sky Cliffs',      center: [160, 0],     radius: 70, heightBoost: 22, roughness: 1.5,
    palette: { ground: PAPER.sky,      accent: PAPER.cream } },
  { id: 'ember',    floorId: 4, name: 'Ember Slopes',    center: [125, -125],  radius: 60, heightBoost: 9,  roughness: 1.15,
    palette: { ground: PAPER.coral,    accent: PAPER.orange } },
  { id: 'frost',    floorId: 5, name: 'Frost Fields',    center: [0, -160],    radius: 65, heightBoost: 14, roughness: 0.9,
    palette: { ground: PAPER.tealL,    accent: PAPER.white } },
  { id: 'crystal',  floorId: 6, name: 'Crystal Hollow',  center: [-125, -125], radius: 60, heightBoost: 11, roughness: 1.25,
    palette: { ground: PAPER.lavender, accent: PAPER.white } },
  { id: 'market',   floorId: 7, name: 'Market Town',     center: [-155, 0],    radius: 60, heightBoost: 3,  roughness: 0.15,
    palette: { ground: PAPER.gold,     accent: PAPER.peach } },
  { id: 'library',  floorId: 8, name: 'Canyon Library',  center: [-125, 125],  radius: 60, heightBoost: 7,  roughness: 1.35,
    palette: { ground: PAPER.sand,     accent: PAPER.cream } },
  { id: 'palace',   floorId: 9, name: 'Paper Palace',    center: [0, 0],       radius: 55, heightBoost: 50, roughness: 0.6,
    palette: { ground: PAPER.lavenderD, accent: PAPER.gold } },
  // Connective meadow between garden and market — no floor of its own.
  { id: 'meadow',   floorId: null, name: 'Petal Meadow', center: [-80, 165],   radius: 45, heightBoost: 2,  roughness: 0.8,
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
  { id: 'ow-sky-1',      kind: 'gold',   x: 150,  z: 20,   amount: 35 },
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
  { id: 'ow-library-1',  kind: 'gold',   x: -110, z: 112,  amount: 25 },
  { id: 'ow-library-2',  kind: 'gold',   x: -138, z: 132,  amount: 30 },
  { id: 'ow-library-3',  kind: 'potion', x: -118, z: 142,  amount: 1 },
  { id: 'ow-library-4',  kind: 'gold',   x: -100, z: 120,  amount: 20 },
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
