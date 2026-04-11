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
 * v0.5: only Floor 1 has a real layout. Floors 2-5 are placeholders
 * (same layout with a different palette) until per-floor map design is done.
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

// Floor 1 — The Garden
// 15x15 grid with a spiral-ish path that has several branches and
// dead ends. Player starts bottom-left, boss sits top-center, exit
// is just above the boss.
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
      floor: 0x3a2010,
      path:  0x8a6830,
      water: 0x1a4060,
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
  // Floors 2-5 use the same layout as placeholder data until we
  // hand-design their mazes. Palette shifts to match the theme.
  {
    id: 2,
    name: 'Tidepool Ruins',
    tileset: 'ocean',
    width: 15, height: 15, tiles: FLOOR_1_TILES, startX: 1, startY: 13,
    palette: { wall: 0x0e2040, floor: 0x182848, path: 0x3060a0, water: 0x1a4880 },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 20 } },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'boss',      x: 7,  y: 3, enemyId: 'pressure' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 3,
    name: 'Cloud Maze',
    tileset: 'sky',
    width: 15, height: 15, tiles: FLOOR_1_TILES, startX: 1, startY: 13,
    palette: { wall: 0x1a2838, floor: 0x3a4858, path: 0x7898b8, water: 0xb0c8e0 },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 25 } },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'boss',      x: 7,  y: 3, enemyId: 'skywhale' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 4,
    name: 'Ember Caves',
    tileset: 'lava',
    width: 15, height: 15, tiles: FLOOR_1_TILES, startX: 1, startY: 13,
    palette: { wall: 0x1a0808, floor: 0x3a1608, path: 0x8a2010, water: 0xa03008 },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 30 } },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'boss',      x: 7,  y: 3, enemyId: 'pyroclast' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
  {
    id: 5,
    name: 'Mending Room',
    tileset: 'arcane',
    width: 15, height: 15, tiles: FLOOR_1_TILES, startX: 1, startY: 13,
    palette: { wall: 0x140828, floor: 0x281048, path: 0x5830a0, water: 0x4018a0 },
    objects: [
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 50 } },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 9,  y: 9 },
      { type: 'encounter', x: 11, y: 5 },
      { type: 'boss',      x: 7,  y: 3, enemyId: 'theorem' },
      { type: 'exit',      x: 7,  y: 1 },
    ],
  },
];

export function getFloor(id) {
  return FLOORS.find((f) => f.id === id) ?? null;
}
