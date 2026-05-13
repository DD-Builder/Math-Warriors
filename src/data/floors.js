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
 *   chest      - gives gold on interact
 *   fairy      - fairy chest — freeing all 3 reveals the golden chest
 *   golden     - golden treasure chest — only appears after all fairies freed
 *   encounter  - triggers a random battle when stepped on, then removes itself
 *   boss       - boss battle, guards the golden chest area
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
  SECRET: 4,
};

// Shorthand for readability
const W = TILE.WALL;
const F = TILE.FLOOR;
const P = TILE.PATH;
const Q = TILE.WATER;
const S = TILE.SECRET;

// Floor 1 — The Garden (19x25, ported from v0.2 reference)
const FLOOR_1_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,P,P,P,P,P,W,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,P,W,W,W,P,W,F,W,F,W,F,W,F,W,F,W,F,W],
  [W,P,W,F,W,P,W,F,W,F,W,F,W,F,W,F,W,F,W],
  [W,P,W,F,F,P,P,P,W,F,W,F,F,F,W,F,W,F,W],
  [W,P,W,W,F,W,W,P,W,W,W,W,W,W,W,W,W,F,W],
  [W,P,P,P,W,F,W,P,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,P,W,F,W,P,W,F,W,W,W,F,W,W,W,W,W],
  [W,F,F,P,F,F,S,P,P,P,W,F,F,F,F,F,F,F,W],
  [W,F,W,P,W,W,W,W,W,P,W,F,W,W,W,W,W,F,W],
  [W,F,W,P,P,P,P,P,W,P,W,F,F,F,F,F,W,F,W],
  [W,F,W,W,W,W,W,P,W,P,W,W,W,W,W,F,W,F,W],
  [W,F,F,F,F,F,W,P,W,P,P,P,P,P,W,F,W,F,W],
  [W,W,W,W,W,F,W,P,W,W,W,W,W,P,W,F,W,W,W],
  [W,F,F,F,W,F,W,P,F,F,F,F,W,P,W,F,F,F,W],
  [W,F,W,F,W,F,W,W,W,Q,Q,F,W,P,W,W,W,F,W],
  [W,F,W,F,F,F,W,F,W,Q,Q,F,W,P,P,P,W,F,W],
  [W,F,W,W,W,W,W,F,W,F,F,F,W,W,W,P,W,F,W],
  [W,F,F,F,F,F,F,F,W,F,W,W,W,F,W,P,W,F,W],
  [W,W,W,W,W,W,W,W,W,F,W,F,F,F,W,P,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,W,F,W,W,W,P,W,W,W],
  [W,F,W,W,W,W,W,W,W,W,W,F,W,F,F,P,F,F,W],
  [W,F,W,F,F,F,F,F,F,F,W,F,W,F,W,W,W,F,W],
  [W,F,F,F,W,W,W,W,W,F,F,F,W,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 2 — Tidepool Ruins (22x29)
// Underwater ruins with tide pools, coral passages, deep water channels.
// Player starts bottom-left, boss top-center. 3 drain valves to find.
const FLOOR_2_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,Q,Q,Q,Q,Q,W,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,Q,W,W,W,Q,W,F,W,W,W,W,W,F,W,W],
  [W,F,W,F,F,F,F,Q,W,F,W,Q,F,F,F,F,F,F,W,F,F,W],
  [W,F,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,F,W],
  [W,F,F,F,W,F,F,F,F,F,F,F,F,F,W,Q,Q,F,F,W,F,W],
  [W,W,W,F,W,F,W,W,W,W,W,W,W,F,W,Q,Q,W,F,W,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,Q,Q,W,F,F,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,W,Q,W,F,F,F,F,F,F,F,F,W,F,W],
  [W,W,W,W,W,W,W,F,W,Q,W,W,W,W,W,W,W,W,F,W,F,W],
  [W,P,P,P,P,P,W,F,W,Q,Q,Q,Q,Q,W,F,F,W,F,F,F,W],
  [W,P,W,W,W,P,W,F,W,W,W,W,W,Q,W,F,W,W,W,W,F,W],
  [W,P,W,F,F,P,F,F,F,F,F,F,W,Q,F,F,F,F,F,W,F,W],
  [W,P,W,F,W,W,W,W,W,W,W,F,W,Q,W,W,W,W,F,W,F,W],
  [W,P,F,F,W,F,F,F,F,F,W,F,F,Q,F,F,F,W,F,F,F,W],
  [W,P,W,W,W,F,W,W,W,F,W,W,W,W,W,W,F,W,W,W,W,W],
  [W,P,P,P,P,F,W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,P,W,W,F,W,W,W,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,P,F,F,F,W,F,F,F,F,F,W,F,F,F,F,W,F,W],
  [W,F,W,W,W,W,W,F,W,F,W,W,W,F,W,F,W,W,F,W,F,W],
  [W,F,F,F,F,F,W,F,F,F,W,Q,W,F,F,F,W,F,F,F,F,W],
  [W,W,W,W,W,F,W,W,W,W,W,Q,W,W,W,W,W,F,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,Q,F,F,F,F,F,F,W,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,Q,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,Q,Q,Q,Q,Q,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 3 — Cloud Maze (25x33)
// Floating islands connected by narrow sky bridges. Open chambers.
// Player starts bottom-left, boss at summit. 3 sky beacons to light.
const FLOOR_3_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,F,W,W,W,F,W,F,W,W,W,F,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,F,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,W,F,F,F,W,F,W,F,F,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,F,W,F,W,F,W,F,W,F,W,W,W,F,W,F,W],
  [W,F,F,F,W,Q,W,F,F,F,F,F,W,F,F,F,F,F,W,Q,W,F,F,F,W],
  [W,W,W,F,W,Q,W,W,W,W,W,F,W,F,W,W,W,F,W,Q,W,W,W,W,W],
  [W,F,F,F,F,Q,F,F,F,F,W,F,F,F,W,F,F,F,F,Q,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,W,F,W],
  [W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 4 — Ember Caves (29x38)
// Narrow winding tunnels through volcanic rock. Lava rivers block paths.
// Player starts bottom-left, boss deep inside. 3 lava vents to seal.
const FLOOR_4_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,W],
  [W,F,W,W,F,W,F,W,W,W,F,W,F,W,W,W,F,W,F,W,W,W,F,W,F,W,W,F,W],
  [W,F,W,F,F,F,F,W,Q,W,F,F,F,W,Q,W,F,F,F,W,F,F,F,F,F,W,F,F,W],
  [W,F,W,F,W,W,W,W,Q,W,W,W,W,W,Q,W,W,W,W,W,F,W,W,W,W,W,F,W,W],
  [W,F,F,F,F,F,F,F,Q,F,F,F,F,F,Q,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,W,F,F,F,W,F,F,F,W,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,W,W,F,W,F,W,F,W,F,W,W,W,F,W,F,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,W],
  [W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,W,F,F,F,F,F,W,F,W,F,F,F,F,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,F,W,F,W,W,W,F,W,F,W,F,W,W,W,W,W,F,W,F,W],
  [W,F,F,F,W,Q,W,F,F,F,F,F,W,Q,W,F,F,F,F,F,W,Q,Q,F,F,F,F,F,W],
  [W,W,W,F,W,Q,W,W,W,W,W,F,W,Q,W,W,W,W,W,F,W,Q,Q,W,W,W,W,W,W],
  [W,F,F,F,F,Q,F,F,F,F,W,F,F,Q,F,F,F,F,W,F,F,Q,Q,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 5 — The Mending Room (33x43)
// A vast arcane cathedral. Rune-lit corridors, void pools, equation pedestals.
// Player starts bottom-left. 3 equation fragments to place. Boss at center.
const FLOOR_5_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,F,W,W,W,F,W,F,W,W,W,W,W,F,W,F,W,W,W,F,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W,F,F,F,W,F,F,F,W],
  [W,F,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,W,F,F,F,W,F,W,F,F,F,W,F,F,F,W,F,W,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,F,W,F,W,F,W,F,W,F,W,W,W,F,W,F,W,F,W,F,W,F,W,F,W],
  [W,F,F,F,W,Q,W,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,F,W,Q,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,Q,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,W,F,W],
  [W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,F,W,W,W,W,W,F,W,W,W,F,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W],
  [W,F,W,F,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,F,F,F,F,W,F,F,F,W,F,F,F,W,F,W],
  [W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

export const FLOORS = [
  {
    id: 1,
    name: 'The Garden',
    tileset: 'garden',
    width:  19,
    height: 25,
    tiles: FLOOR_1_TILES,
    startX: 1,
    startY: 23,
    challenge: { type: 'fairy', count: 3, label: 'FAIRY', verb: 'freed', allDoneMsg: 'All fairies free! The golden chest has appeared!' },
    palette: {
      wall:  0x1e4018,
      floor: 0x3a7028,
      path:  0x8a6830,
      water: 0x1a4060,
      decor: 0x2a5818,
    },
    objects: [
      { type: 'fairy',     x: 3,  y: 3 },
      { type: 'fairy',     x: 15, y: 11 },
      { type: 'fairy',     x: 9,  y: 20 },
      { type: 'golden',    x: 9,  y: 3 },
      { type: 'chest',     x: 1,  y: 14, loot: { gold: 20 } },
      { type: 'potion',    x: 11, y: 3 },
      { type: 'gold',      x: 3,  y: 6 },
      { type: 'gold',      x: 15, y: 16 },
      { type: 'gold',      x: 11, y: 23 },
      { type: 'encounter', x: 3,  y: 1 },
      { type: 'encounter', x: 15, y: 10 },
      { type: 'encounter', x: 1,  y: 16 },
      { type: 'encounter', x: 9,  y: 19 },
      { type: 'encounter', x: 13, y: 13 },
      { type: 'boss',      x: 9,  y: 2, enemyId: 'briarking' },
      { type: 'exit',      x: 9,  y: 1 },
    ],
  },
    {
    id: 2,
    name: 'Tidepool Ruins',
    tileset: 'ocean',
    width: 22, height: 29, tiles: FLOOR_2_TILES, startX: 1, startY: 27,
    palette: { wall: 0x0e2040, floor: 0x1a3858, path: 0x3060a0, water: 0x1a4880, decor: 0x184068 },
    challenge: { type: 'valve', count: 3, label: 'DRAIN VALVE', verb: 'activated', allDoneMsg: 'All valves open! The path to the boss is clear!' },
    objects: [
      { type: 'valve',     x: 1,  y: 11 },
      { type: 'valve',     x: 20, y: 5 },
      { type: 'valve',     x: 11, y: 23 },
      { type: 'golden',    x: 11, y: 1 },
      { type: 'chest',     x: 3,  y: 3,  loot: { gold: 20 } },
      { type: 'chest',     x: 19, y: 19, loot: { gold: 20 } },
      { type: 'potion',    x: 7,  y: 17 },
      { type: 'gold',      x: 15, y: 7 },
      { type: 'gold',      x: 5,  y: 25 },
      { type: 'encounter', x: 5,  y: 5 },
      { type: 'encounter', x: 15, y: 13 },
      { type: 'encounter', x: 9,  y: 19 },
      { type: 'encounter', x: 19, y: 25 },
      { type: 'encounter', x: 3,  y: 15 },
      { type: 'boss',      x: 11, y: 2, enemyId: 'pressure' },
      { type: 'exit',      x: 11, y: 1 },
    ],
  },
  {
    id: 3,
    name: 'Cloud Maze',
    tileset: 'sky',
    width: 25, height: 33, tiles: FLOOR_3_TILES, startX: 1, startY: 31,
    palette: { wall: 0x1a2838, floor: 0x5a6878, path: 0x7898b8, water: 0xb0c8e0, decor: 0x4a5868 },
    challenge: { type: 'beacon', count: 3, label: 'SKY BEACON', verb: 'lit', allDoneMsg: 'All beacons lit! The storm parts — the boss awaits!' },
    objects: [
      { type: 'beacon',    x: 3,  y: 3 },
      { type: 'beacon',    x: 21, y: 11 },
      { type: 'beacon',    x: 12, y: 27 },
      { type: 'golden',    x: 12, y: 1 },
      { type: 'chest',     x: 5,  y: 11, loot: { gold: 25 } },
      { type: 'chest',     x: 19, y: 21, loot: { gold: 25 } },
      { type: 'potion',    x: 12, y: 15 },
      { type: 'gold',      x: 1,  y: 23 },
      { type: 'gold',      x: 23, y: 5 },
      { type: 'encounter', x: 7,  y: 7 },
      { type: 'encounter', x: 17, y: 7 },
      { type: 'encounter', x: 7,  y: 21 },
      { type: 'encounter', x: 17, y: 21 },
      { type: 'encounter', x: 12, y: 17 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'boss',      x: 12, y: 2, enemyId: 'skywhale' },
      { type: 'exit',      x: 12, y: 1 },
    ],
  },
  {
    id: 4,
    name: 'Ember Caves',
    tileset: 'lava',
    width: 29, height: 38, tiles: FLOOR_4_TILES, startX: 1, startY: 36,
    palette: { wall: 0x1a0808, floor: 0x4a2810, path: 0x8a2010, water: 0xa03008, decor: 0x3a1808 },
    challenge: { type: 'vent', count: 3, label: 'LAVA VENT', verb: 'sealed', allDoneMsg: 'All vents sealed! The caves cool — face the boss!' },
    objects: [
      { type: 'vent',      x: 3,  y: 3 },
      { type: 'vent',      x: 25, y: 11 },
      { type: 'vent',      x: 14, y: 29 },
      { type: 'golden',    x: 14, y: 1 },
      { type: 'chest',     x: 5,  y: 13, loot: { gold: 30 } },
      { type: 'chest',     x: 23, y: 25, loot: { gold: 30 } },
      { type: 'potion',    x: 14, y: 17 },
      { type: 'potion',    x: 7,  y: 31 },
      { type: 'gold',      x: 21, y: 5 },
      { type: 'gold',      x: 3,  y: 21 },
      { type: 'gold',      x: 25, y: 33 },
      { type: 'encounter', x: 9,  y: 5 },
      { type: 'encounter', x: 19, y: 9 },
      { type: 'encounter', x: 5,  y: 17 },
      { type: 'encounter', x: 23, y: 17 },
      { type: 'encounter', x: 9,  y: 25 },
      { type: 'encounter', x: 19, y: 31 },
      { type: 'boss',      x: 14, y: 2, enemyId: 'pyroclast' },
      { type: 'exit',      x: 14, y: 1 },
    ],
  },
  {
    id: 5,
    name: 'The Mending Room',
    tileset: 'arcane',
    width: 33, height: 43, tiles: FLOOR_5_TILES, startX: 1, startY: 41,
    palette: { wall: 0x140828, floor: 0x301850, path: 0x5830a0, water: 0x4018a0, decor: 0x281040 },
    challenge: { type: 'fragment', count: 3, label: 'EQUATION FRAGMENT', verb: 'placed', allDoneMsg: 'All fragments aligned! The Great Equation stirs — face The Theorem!' },
    objects: [
      { type: 'fragment',  x: 5,  y: 5 },
      { type: 'fragment',  x: 27, y: 11 },
      { type: 'fragment',  x: 16, y: 33 },
      { type: 'golden',    x: 16, y: 1 },
      { type: 'chest',     x: 3,  y: 15, loot: { gold: 50 } },
      { type: 'chest',     x: 29, y: 9, loot: { gold: 50 } },
      { type: 'chest',     x: 16, y: 23, loot: { gold: 50 } },
      { type: 'potion',    x: 9,  y: 17 },
      { type: 'potion',    x: 23, y: 29 },
      { type: 'gold',      x: 27, y: 5 },
      { type: 'gold',      x: 5,  y: 25 },
      { type: 'gold',      x: 21, y: 37 },
      { type: 'encounter', x: 9,  y: 7 },
      { type: 'encounter', x: 23, y: 7 },
      { type: 'encounter', x: 7,  y: 17 },
      { type: 'encounter', x: 25, y: 17 },
      { type: 'encounter', x: 9,  y: 29 },
      { type: 'encounter', x: 23, y: 29 },
      { type: 'encounter', x: 16, y: 39 },
      { type: 'boss',      x: 16, y: 2, enemyId: 'theorem' },
      { type: 'exit',      x: 16, y: 1 },
    ],
  },
];

export function getFloor(id) {
  return FLOORS.find((f) => f.id === id) ?? null;
}
