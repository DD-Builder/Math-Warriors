/**
 * Floor layouts
 *
 * Each floor is a hand-crafted tilemap plus a list of objects. The
 * tilemap is a 2D array of tile codes:
 *
 *   0 = wall       (blocks movement, rendered dark)
 *   1 = floor      (walkable)
 *   2 = path       (walkable, decorative)
 *   3 = water      (walkable decorative, visual contrast)
 *
 * Objects declare their tile position and type. Types:
 *
 *   chest      - gives gold + (eventually) potion on interact
 *   encounter  - triggers a random battle when stepped on, then removes itself
 *   boss       - boss battle, unique per floor, marks floor complete
 *   exit       - appears after boss defeat; tapping it returns to world map
 *   potion     - pickup, +1 potion
 *   gold       - pickup, +gold
 *
 * Floor 1 has a bespoke layout; floors 2-5 currently reuse the same
 * shape with a different palette and will get their own maps later.
 */

export const TILE = {
  WALL:  0,
  FLOOR: 1,
  PATH:  2,
  WATER: 3,
};

// Shorthand for readability
const W = TILE.WALL;
const F = TILE.FLOOR;
const P = TILE.PATH;
const Q = TILE.WATER;

// Floor 1 — The Garden
// Spiral inward: player starts bottom-left, boss at top-center.
// Several outer loops with dead-end chests, inner sanctum holds boss.
const FLOOR_1_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,F,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,W,W,W,W,F,W,F,W],
  [W,F,W,F,W,F,F,F,F,F,W,F,W,F,W],
  [W,F,W,F,W,F,W,W,W,F,W,F,W,F,W],
  [W,F,P,P,P,F,W,F,W,F,P,P,P,F,W],
  [W,F,W,F,W,F,W,F,W,F,W,F,W,F,W],
  [W,F,W,F,W,F,F,F,F,F,W,F,W,F,W],
  [W,F,W,F,W,W,W,W,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,F,F,F,F,F,F,W,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 2 — Tidepool Ruins
// Left-right split with central water pool and bridges crossing it.
// Player starts bottom-left, boss at top-right of the pool.
const FLOOR_2_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,W,W,F,F,F,W,W,F,F,F,W],
  [W,F,W,F,W,W,F,W,F,W,W,F,W,F,W],
  [W,F,W,F,F,F,F,W,F,F,F,F,W,F,W],
  [W,F,W,W,W,W,W,W,F,W,W,W,W,F,W],
  [W,F,F,F,Q,Q,Q,F,F,F,Q,Q,F,F,W],
  [W,W,W,F,Q,Q,Q,W,W,F,Q,Q,F,W,W],
  [W,F,F,F,P,P,P,F,F,F,P,P,F,F,W],
  [W,F,W,F,Q,Q,Q,F,W,F,Q,Q,F,W,W],
  [W,F,W,F,Q,Q,Q,W,F,F,Q,Q,F,F,W],
  [W,F,W,W,W,W,W,W,F,W,W,W,W,W,W],
  [W,F,W,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,F,W,W,F,W,W,W,W,W,W,F,W],
  [W,F,F,F,W,W,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 3 — Cloud Maze
// Open arena feel: many rooms connected by open paths. Floating
// islands of floor separated by narrow walls.
const FLOOR_3_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,F,W,W,W,W,F,W,W,W,W,F,W,W],
  [W,F,F,F,F,F,W,F,W,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,F,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,F,F,F,F,W,F,W],
  [W,F,W,W,W,F,W,F,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,W,F,W,F,F,F,F,F,W],
  [W,W,F,W,W,W,W,F,W,W,W,W,F,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 4 — Ember Caves
// Narrow tunnels, multiple branching paths toward the boss.
// Feels claustrophobic and dangerous.
const FLOOR_4_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,F,W,F,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,W,F,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,W,W,W,W,F,W,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,F,W,F,W,W,W,F,W,F,W,W,W],
  [W,F,F,F,W,F,W,F,W,F,W,F,F,F,W],
  [W,F,W,W,W,F,W,F,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,F,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,W,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,F,W,F,F,F,F,W,F,W],
  [W,F,W,W,W,W,F,W,F,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 5 — Mending Room
// Symmetric hub-and-spoke. Four wings meeting at the center.
// The theorem of the whole game comes together here.
const FLOOR_5_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,F,W,F,W,F,W,W,W,F,W,F,W,F,W],
  [W,F,W,F,F,F,W,F,W,F,F,F,W,F,W],
  [W,F,W,W,W,F,W,F,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,F,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,F,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,F,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,W,F,W,F,F,F,W,F,W],
  [W,F,W,F,W,F,W,W,W,F,W,F,W,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

export const FLOORS = [
  {
    id: 1,
    name: 'The Garden',
    tileset: 'garden',
    width:  15,
    height: 15,
    tiles: FLOOR_1_TILES,
    startX: 1,
    startY: 13,
    // Palette overrides for the tile renderer. Placeholder until real
    // art arrives — drives the mood of each floor.
    palette: {
      wall:  0x1e4018,
      floor: 0x3a7028,
      path:  0x8a6830,
      water: 0x1a4060,
      decor: 0x2a5818,
    },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 15 } },
      { type: 'chest',     x: 11, y: 11, loot: { gold: 15 } },
      { type: 'potion',    x: 11, y: 3 },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'encounter', x: 3,  y: 11 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'boss',      x: 7,  y: 3, enemyId: 'briarking' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 2,
    name: 'Tidepool Ruins',
    tileset: 'ocean',
    width: 15, height: 15, tiles: FLOOR_2_TILES, startX: 1, startY: 13,
    palette: { wall: 0x0e2040, floor: 0x1a3858, path: 0x3060a0, water: 0x1a4880, decor: 0x184068 },
    objects: [
      { type: 'chest',     x: 2,  y: 1,  loot: { gold: 20 } },
      { type: 'chest',     x: 12, y: 13, loot: { gold: 20 } },
      { type: 'potion',    x: 12, y: 1 },
      { type: 'encounter', x: 5,  y: 3 },
      { type: 'encounter', x: 9,  y: 3 },
      { type: 'encounter', x: 3,  y: 11 },
      { type: 'encounter', x: 11, y: 11 },
      { type: 'boss',      x: 7,  y: 7, enemyId: 'pressure' },
      { type: 'exit',      x: 13, y: 7 },
    ],
  },
  {
    id: 3,
    name: 'Cloud Maze',
    tileset: 'sky',
    width: 15, height: 15, tiles: FLOOR_3_TILES, startX: 1, startY: 13,
    palette: { wall: 0x1a2838, floor: 0x5a6878, path: 0x7898b8, water: 0xb0c8e0, decor: 0x4a5868 },
    objects: [
      { type: 'chest',     x: 2,  y: 1,  loot: { gold: 25 } },
      { type: 'chest',     x: 12, y: 13, loot: { gold: 25 } },
      { type: 'potion',    x: 7,  y: 3 },
      { type: 'encounter', x: 3,  y: 5 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'encounter', x: 3,  y: 9 },
      { type: 'encounter', x: 11, y: 9 },
      { type: 'boss',      x: 7,  y: 7, enemyId: 'skywhale' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 4,
    name: 'Ember Caves',
    tileset: 'lava',
    width: 15, height: 15, tiles: FLOOR_4_TILES, startX: 1, startY: 13,
    palette: { wall: 0x1a0808, floor: 0x4a2810, path: 0x8a2010, water: 0xa03008, decor: 0x3a1808 },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 30 } },
      { type: 'chest',     x: 11, y: 11, loot: { gold: 30 } },
      { type: 'potion',    x: 11, y: 3 },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 5 },
      { type: 'encounter', x: 5,  y: 9 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'boss',      x: 7,  y: 7, enemyId: 'pyroclast' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 5,
    name: 'Mending Room',
    tileset: 'arcane',
    width: 15, height: 15, tiles: FLOOR_5_TILES, startX: 1, startY: 13,
    palette: { wall: 0x140828, floor: 0x301850, path: 0x5830a0, water: 0x4018a0, decor: 0x281040 },
    objects: [
      { type: 'chest',     x: 2,  y: 1,  loot: { gold: 50 } },
      { type: 'chest',     x: 12, y: 1,  loot: { gold: 50 } },
      { type: 'chest',     x: 2,  y: 13, loot: { gold: 50 } },
      { type: 'chest',     x: 12, y: 13, loot: { gold: 50 } },
      { type: 'potion',    x: 7,  y: 3 },
      { type: 'potion',    x: 7,  y: 11 },
      { type: 'encounter', x: 3,  y: 5 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'encounter', x: 3,  y: 9 },
      { type: 'encounter', x: 11, y: 9 },
      { type: 'boss',      x: 7,  y: 7, enemyId: 'theorem' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
];

export function getFloor(id) {
  return FLOORS.find((f) => f.id === id) ?? null;
}
