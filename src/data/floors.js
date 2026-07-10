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
 *   potion     - pickup, +1 potion
 *   gold       - pickup, +gold
 *   fairy      - fairy chest — freeing all 3 reveals the golden chest
 *   golden     - golden treasure chest — only appears after all fairies freed
 *   encounter  - triggers a random battle when stepped on (randomized position)
 *   boss       - boss battle, guards the golden chest area
 *   exit       - appears after boss defeat; returns to world map
 *   mathdoor   - math-locked gate; solve math problem to open
 *   fountain   - healing fountain; restores party HP (limited uses)
 *
 * Floor-specific challenge items (3 per floor):
 *   fairy, valve, beacon, vent, crystal, geoshard, token, page, fragment
 *
 * Tile codes: 0=wall, 1=floor, 2=path, 3=water, 4=secret
 *
 * Room-based maze generation:
 *   Each floor now includes a `mazeConfig` object that drives procedural
 *   room-based maze generation via mazeArchitect.js. The old hand-crafted
 *   tile grids remain as fallback / reference layouts.
 *
 *   mazeConfig fields:
 *     width, height       — grid dimensions (15-20 range)
 *     roomTemplates       — array of { w, h } room size options
 *     challengeType       — the floor's signature mechanic item type
 *     challengeCount      — number of challenge items (2-3)
 *     enemyCount          — number of corridor encounters (3-5)
 *     corridorWidth       — corridor width in tiles (2-3)
 *     bossEnemyId         — the boss enemy identifier
 *
 * Dynamic challenge objects (world-altering):
 *   Challenge objects include targetTiles, fromTile, toTile fields
 *   so MazeScene can use LV_setTile to transform the maze when
 *   the player activates them.
 */

import { generateMaze } from '../systems/mazeArchitect.js';

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
  [W,F,W,W,W,W,W,F,S,F,F,F,W,W,W,P,W,F,W],
  [W,F,F,F,F,F,F,F,W,F,W,W,W,F,W,P,W,F,W],
  [W,W,W,W,W,W,W,W,W,F,W,F,F,F,W,P,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,S,F,W,W,W,P,W,W,W],
  [W,F,W,W,W,W,W,W,W,W,W,F,W,F,F,P,F,F,W],
  [W,F,W,F,F,F,F,F,F,F,W,F,W,F,W,W,W,F,W],
  [W,F,F,F,W,W,W,W,W,F,F,F,W,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 2 — Tidepool Ruins (22x29)
// Three diagonal zones: top-left marsh, middle beach, bottom-right water.
// Player starts bottom-left (water zone), boss top-left (marsh zone).
// 3 drain valves — one per zone.
const FLOOR_2_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,W,W,W,W,W,W,W,W,W,W],
  [W,F,W,W,F,F,F,F,W,W,F,F,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,Q,F,W,F,F,F,W,F,F,F,W,W,W,W,W,W,W,W,W],
  [W,W,F,W,F,F,F,W,F,F,F,W,F,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,W,F,F,F,W,F,P,P,P,P,W,W,W,W,W,W,W,W],
  [W,F,W,F,F,F,W,F,F,P,P,W,P,P,W,W,W,W,W,W,W,W],
  [W,F,W,W,F,F,F,F,P,P,W,P,W,P,P,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,S,P,P,W,P,P,W,W,P,W,W,W,W,W,W,W],
  [W,W,F,W,F,F,P,P,W,P,P,W,W,P,P,P,W,W,W,W,W,W],
  [W,F,F,F,F,P,P,W,P,P,W,W,P,P,W,P,P,W,W,W,W,W],
  [W,W,W,F,P,P,S,P,P,W,P,W,W,P,W,W,P,W,W,W,W,W],
  [W,W,W,P,P,W,P,P,W,P,P,W,W,P,P,W,P,P,Q,Q,W,W],
  [W,W,W,W,P,P,P,W,P,P,W,P,W,W,P,P,Q,Q,Q,W,Q,W],
  [W,W,W,W,W,P,P,P,W,W,P,P,P,W,P,Q,Q,W,Q,Q,Q,W],
  [W,W,W,W,W,W,P,P,P,W,W,P,P,P,Q,Q,W,Q,Q,W,Q,W],
  [W,W,W,W,W,W,W,P,W,P,P,W,P,Q,Q,Q,Q,Q,W,Q,Q,W],
  [W,W,W,W,W,W,W,W,P,P,W,P,Q,Q,W,Q,Q,W,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,P,P,Q,Q,W,Q,Q,W,Q,Q,W,Q,W],
  [W,W,W,W,W,W,W,W,W,W,P,Q,Q,Q,Q,W,Q,Q,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,W,Q,Q,Q,W,Q,W,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,Q,Q,W,Q,Q,Q,Q,W,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,W,Q,Q,Q,Q,W,Q,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,Q,W,Q,Q,Q,W,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,Q,Q,Q,W,Q,Q,Q,W,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,W,Q,Q,Q,Q,Q,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,Q,Q,Q,Q,Q,W,Q,Q,Q,Q,Q,W],
  [W,P,P,P,P,P,P,P,P,P,Q,Q,Q,Q,Q,Q,Q,Q,Q,Q,Q,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Floor 3 — Cloud Maze (25x33)
// Three diagonal zones: Calm Sky (top-left, d<16), Storm Zone (middle, 16<=d<36), Sunset Heights (bottom-right, d>=36).
// Player starts bottom-left (1,31), boss in calm zone near (5,3). 3 sky beacons (one per zone).
const FLOOR_3_TILES = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,F,F,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,W,W,F,F,F,F,W,W,F,F,F,F,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,Q,F,F,F,F,F,W,F,F,F,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,W,F,W,F,F,F,W,F,F,F,W,F,F,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,W,F,F,F,W,F,F,F,F,F,F,W,W,W,W,W,W,W,W,W,W],
  [W,F,W,F,F,F,W,F,F,F,F,W,F,F,F,F,W,W,W,W,W,W,W,W,W],
  [W,F,W,W,F,F,F,F,F,F,W,F,F,W,F,F,F,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,S,F,F,W,F,F,W,F,F,F,F,F,W,W,W,W,W,W,W],
  [W,W,F,W,F,F,F,F,W,F,F,W,F,F,W,F,F,F,F,W,W,W,W,W,W],
  [W,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,F,W,W,W,W,W],
  [W,W,W,F,F,F,W,F,F,F,W,F,F,F,F,F,W,F,F,F,F,W,W,W,W],
  [W,W,W,F,F,W,F,F,W,F,F,F,F,W,F,F,F,F,W,F,F,F,W,W,W],
  [W,W,W,W,F,F,F,W,F,F,F,W,F,F,F,F,W,F,F,F,F,F,F,W,W],
  [W,W,W,W,W,F,F,F,F,F,W,F,F,F,F,W,F,F,F,W,F,F,F,F,W],
  [W,W,W,W,W,W,F,F,F,W,F,F,F,W,F,F,F,F,W,F,F,F,Q,F,W],
  [W,W,W,W,W,W,W,F,F,F,F,F,W,F,F,F,W,F,F,F,W,F,F,F,W],
  [W,W,W,W,W,W,W,W,F,F,F,W,F,F,F,F,F,F,S,F,F,F,W,F,W],
  [W,W,W,W,W,W,W,W,W,F,F,F,F,F,W,F,F,W,F,F,F,W,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,F,W,F,F,F,F,F,W,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,W,F,F,F,W,F,F,F,F,F,W,F,W],
  [W,W,W,W,W,W,W,W,W,W,Q,F,F,F,F,W,F,F,F,W,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,F,W,F,F,F,F,W,F,F,F,F,W,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,W,F,F,F,F,W,F,F,P,P,P,P,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,F,F,F,W,F,F,F,P,P,W,P,P,W],
  [W,W,W,W,W,W,W,W,W,W,Q,F,F,F,W,F,F,F,P,P,W,P,W,P,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,F,W,F,F,F,P,P,W,P,P,W,P,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,W,F,F,F,P,P,W,P,P,W,P,P,W],
  [W,W,W,W,W,W,W,W,W,W,F,F,F,F,F,P,P,W,P,P,W,P,W,P,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,P,P,W,P,P,W,P,P,W,P,W],
  [W,F,W,W,W,W,W,W,W,W,F,F,F,P,P,W,P,P,W,P,P,W,P,P,W],
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
  [W,W,W,W,W,W,W,W,W,S,W,W,W,F,W,W,W,W,W,W,W,W,W,W,F,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,F,W],
  [W,F,W,F,F,F,W,F,F,F,W,F,F,F,W,F,W,F,F,F,W,F,F,F,W,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,W,W,F,W,F,W,F,W,F,W,W,W,F,W,F,W,F,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,F,S,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W],
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
  [W,W,W,W,W,W,W,F,S,W,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,W,F,F,F,F,F,W,F,W,F,F,F,W,F,W,F,F,F,W,F,F,F,W,F,W,F,F,F,W,F,W],
  [W,F,W,F,W,W,W,F,W,F,W,F,W,F,W,F,W,F,W,W,W,F,W,F,W,F,W,F,W,F,W,F,W],
  [W,F,F,F,W,Q,W,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,W],
  [W,W,W,F,W,Q,W,W,W,W,W,F,W,W,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W],
  [W,F,F,F,F,Q,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,F,W,W,W,F,W,W,W,W,W,F,W,W,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,F,S,W,W,W,W,W,W,F,W,W,W,W,W,W,W,F,W,W,W,W,W,W,W],
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

// Reuse existing tile grids for floors 6-8 (25x33) and floor 9 (33x43).
// The tile art won't match themed tilesets yet, but the layout is playable.
const FLOOR_6_TILES = FLOOR_3_TILES;
const FLOOR_7_TILES = FLOOR_3_TILES;
const FLOOR_8_TILES = FLOOR_3_TILES;
const FLOOR_9_TILES = FLOOR_5_TILES;

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
    challenge: { type: 'fairy', count: 3, label: 'FAIRY', verb: 'freed', allDoneMsg: 'All fairies free!', phase2: { type: 'rune', count: 2, label: 'RUNE STONE', verb: 'activated', allDoneMsg: 'Rune stones glow! The boss awakens!' } },
    mazeConfig: {
      width: 19, height: 25,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 6 }, { w: 7, h: 7 }, { w: 8, h: 5 }],
      challengeType: 'fairy',
      challengeCount: 3,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'briarking',
    },
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
      { type: 'chest',     x: 1,  y: 14, loot: { gold: 20 } },
      { type: 'potion',    x: 11, y: 3 },
      { type: 'gold',      x: 3,  y: 6 },
      { type: 'gold',      x: 15, y: 16 },
      { type: 'gold',      x: 11, y: 23 },
      { type: 'mathdoor',  x: 7,  y: 6, id: 'f1door1' },
      { type: 'mathdoor',  x: 15, y: 14, id: 'f1door2' },
      { type: 'fountain',  x: 9,  y: 14, id: 'f1fountain1', uses: 3 },
      { type: 'encounter', x: 3,  y: 1 },
      { type: 'encounter', x: 15, y: 10 },
      { type: 'encounter', x: 1,  y: 16 },
      { type: 'encounter', x: 9,  y: 19 },
      { type: 'encounter', x: 13, y: 13 },
      { type: 'encounter', x: 7,  y: 17 },
      { type: 'encounter', x: 4,  y: 8 },
      { type: 'encounter', x: 17, y: 8 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 9,  y: 3, enemyId: 'briarking' },
      { type: 'golden',    x: 9,  y: 2 },
      { type: 'exit',      x: 9,  y: 1 },
    ],
  },
    {
    id: 2,
    name: 'Tidepool Ruins',
    tileset: 'ocean',
    width: 22, height: 29, tiles: FLOOR_2_TILES, startX: 1, startY: 27,
    palette: { wall: 0x0e2040, floor: 0x1a3858, path: 0x3060a0, water: 0x1a4880, decor: 0x184068 },
    challenge: { type: 'valve', count: 4, label: 'SLUICE', verb: 'opened', allDoneMsg: 'The Deep Basin drains! The Pressure surfaces!' },
    mazeConfig: {
      width: 18, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 5 }, { w: 7, h: 6 }, { w: 5, h: 7 }],
      challengeType: 'valve',
      challengeCount: 3,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'pressure',
    },
    objects: [
      // Valves — four sluice gates (this floors.js objects list is legacy/
      // reference; the playable map is levels.js FLOOR_2). Count matches
      // challenge.count (4) for internal consistency.
      { type: 'valve',     x: 4,  y: 4 },
      { type: 'valve',     x: 7,  y: 14 },
      { type: 'valve',     x: 16, y: 24 },
      { type: 'valve',     x: 10, y: 20 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 3,  y: 1, enemyId: 'pressure' },
      { type: 'golden',    x: 2,  y: 1 },
      { type: 'exit',      x: 1,  y: 1 },
      // Chests across zones
      { type: 'chest',     x: 5,  y: 6,  loot: { gold: 20 } },
      { type: 'chest',     x: 12, y: 17, loot: { gold: 20 } },
      // Gold pickups
      { type: 'gold',      x: 7,  y: 8 },
      { type: 'gold',      x: 13, y: 21 },
      // Potions
      { type: 'potion',    x: 9,  y: 10 },
      { type: 'mathdoor',  x: 9,  y: 5, id: 'f2door1' },
      { type: 'fountain',  x: 14, y: 14, id: 'f2fountain1', uses: 3 },
      // Encounters spread across zones
      { type: 'encounter', x: 1,  y: 5 },
      { type: 'encounter', x: 6,  y: 3 },
      { type: 'encounter', x: 7,  y: 9 },
      { type: 'encounter', x: 10, y: 12 },
      { type: 'encounter', x: 6,  y: 14 },
      { type: 'encounter', x: 13, y: 19 },
      { type: 'encounter', x: 18, y: 21 },
      { type: 'encounter', x: 20, y: 26 },
    ],
  },
  {
    id: 3,
    name: 'The Shattered Sky',
    tileset: 'sky',
    width: 25, height: 33, tiles: FLOOR_3_TILES, startX: 1, startY: 31,
    palette: { wall: 0x1a2838, floor: 0x5a6878, path: 0x7898b8, water: 0xb0c8e0, decor: 0x4a5868 },
    challenge: { type: 'beacon', count: 4, label: 'SKY BEACON', verb: 'lit', allDoneMsg: 'FOUR beacons — the light floods the Eye!' },
    mazeConfig: {
      width: 19, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 6 }, { w: 7, h: 5 }, { w: 5, h: 8 }],
      challengeType: 'beacon',
      challengeCount: 4,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'skywhale',
    },
    objects: [
      // Beacons: one per island — the light doubles with each
      { type: 'beacon',    x: 5,  y: 5 },
      { type: 'beacon',    x: 10, y: 16 },
      { type: 'beacon',    x: 20, y: 26 },
      { type: 'beacon',    x: 20, y: 5 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 3,  y: 1, enemyId: 'skywhale' },
      { type: 'golden',    x: 2,  y: 1 },
      { type: 'exit',      x: 1,  y: 1 },
      // Chests across zones
      { type: 'chest',     x: 7,  y: 8, loot: { gold: 25 } },
      { type: 'chest',     x: 18, y: 20, loot: { gold: 25 } },
      // Gold pickups
      { type: 'gold',      x: 3,  y: 8 },
      { type: 'gold',      x: 16, y: 17 },
      // Potions
      { type: 'potion',    x: 10, y: 10 },
      { type: 'mathdoor',  x: 12, y: 8, id: 'f3door1' },
      { type: 'fountain',  x: 15, y: 18, id: 'f3fountain1', uses: 3 },
      // Encounters spread across all zones (calm, storm, sunset)
      { type: 'encounter', x: 3,  y: 6 },
      { type: 'encounter', x: 7,  y: 7 },
      { type: 'encounter', x: 9,  y: 11 },
      { type: 'encounter', x: 14, y: 15 },
      { type: 'encounter', x: 11, y: 19 },
      { type: 'encounter', x: 16, y: 17 },
      { type: 'encounter', x: 20, y: 24 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'encounter', x: 21, y: 28 },
    ],
  },
  {
    id: 4,
    name: 'Ember Caves',
    tileset: 'lava',
    width: 29, height: 38, tiles: FLOOR_4_TILES, startX: 1, startY: 36,
    palette: { wall: 0x1a0808, floor: 0x4a2810, path: 0x8a2010, water: 0xa03008, decor: 0x3a1808 },
    challenge: { type: 'vent', count: 4, label: 'LAVA VENT', verb: 'sealed', allDoneMsg: 'The fire is divided — the caldera cools!' },
    mazeConfig: {
      width: 20, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 5 }, { w: 5, h: 6 }, { w: 7, h: 7 }],
      challengeType: 'vent',
      challengeCount: 4,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'pyroclast',
    },
    objects: [
      { type: 'vent',      x: 3,  y: 3 },
      { type: 'vent',      x: 25, y: 11 },
      { type: 'vent',      x: 14, y: 29 },
      { type: 'vent',      x: 21, y: 21 },
      { type: 'chest',     x: 5,  y: 13, loot: { gold: 30 } },
      { type: 'chest',     x: 23, y: 25, loot: { gold: 30 } },
      { type: 'potion',    x: 14, y: 17 },
      { type: 'potion',    x: 7,  y: 31 },
      { type: 'mathdoor',  x: 13, y: 6, id: 'f4door1' },
      { type: 'mathdoor',  x: 15, y: 24, id: 'f4door2' },
      { type: 'fountain',  x: 1,  y: 17, id: 'f4fountain1', uses: 3 },
      { type: 'gold',      x: 21, y: 5 },
      { type: 'gold',      x: 3,  y: 21 },
      { type: 'gold',      x: 25, y: 33 },
      { type: 'encounter', x: 9,  y: 5 },
      { type: 'encounter', x: 19, y: 9 },
      { type: 'encounter', x: 5,  y: 17 },
      { type: 'encounter', x: 23, y: 17 },
      { type: 'encounter', x: 9,  y: 25 },
      { type: 'encounter', x: 19, y: 31 },
      { type: 'encounter', x: 14, y: 13 },
      { type: 'encounter', x: 3,  y: 7 },
      { type: 'encounter', x: 25, y: 25 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 14, y: 3, enemyId: 'pyroclast' },
      { type: 'golden',    x: 14, y: 2 },
      { type: 'exit',      x: 14, y: 1 },
    ],
  },
  {
    id: 5, name: 'Frozen Peak', tileset: 'ice',
    width: 25, height: 33, tiles: FLOOR_3_TILES, startX: 1, startY: 31,
    challenge: { type: 'crystal', count: 4, label: 'THAW CRYSTAL', verb: 'woken', allDoneMsg: 'All four keys turn — the summit thaws!' },
    palette: { wall: 0x4080b0, floor: 0x90b8d8, path: 0xb0d0e8, water: 0x60a0c8, decor: 0x7098b8 },
    mazeConfig: {
      width: 19, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 7 }, { w: 8, h: 6 }, { w: 7, h: 5 }],
      challengeType: 'crystal',
      challengeCount: 4,
      enemyCount: 5,
      corridorWidth: 3,
      bossEnemyId: 'absolutezero',
    },
    objects: [
      { type: 'crystal',   x: 5,  y: 5 },
      { type: 'crystal',   x: 20, y: 16 },
      { type: 'crystal',   x: 10, y: 26 },
      { type: 'crystal',   x: 15, y: 10 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 12, y: 3, enemyId: 'absolutezero' },
      { type: 'golden',    x: 12, y: 2 },
      { type: 'exit',      x: 12, y: 1 },
      { type: 'mathdoor',  x: 10, y: 15, id: 'f5door1' },
      { type: 'fountain',  x: 8,  y: 25, id: 'f5fountain1', uses: 3 },
      { type: 'chest',     x: 3, y: 10, loot: { gold: 30 } },
      { type: 'chest',     x: 21, y: 22, loot: { gold: 30 } },
      { type: 'potion',    x: 15, y: 12 },
      { type: 'gold',      x: 7,  y: 8 },
      { type: 'gold',      x: 18, y: 20 },
      { type: 'encounter', x: 3,  y: 6 },
      { type: 'encounter', x: 9,  y: 11 },
      { type: 'encounter', x: 15, y: 15 },
      { type: 'encounter', x: 20, y: 20 },
      { type: 'encounter', x: 7,  y: 25 },
      { type: 'encounter', x: 14, y: 28 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'encounter', x: 21, y: 28 },
    ],
  },
  {
    id: 6, name: 'Crystal Caverns', tileset: 'crystal',
    width: 25, height: 33, tiles: FLOOR_6_TILES, startX: 1, startY: 31,
    challenge: { type: 'geoshard', count: 4, label: 'GEO SHARD', verb: 'restored', allDoneMsg: 'Four beams — the Octagon opens!' },
    palette: { wall: 0x5030a0, floor: 0x7850c0, path: 0xa080e0, water: 0x6040b0, decor: 0x6840b0 },
    mazeConfig: {
      width: 19, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 7, h: 7 }, { w: 6, h: 6 }, { w: 9, h: 5 }],
      challengeType: 'geoshard',
      challengeCount: 4,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'theprism',
    },
    objects: [
      { type: 'geoshard',  x: 5,  y: 5 },
      { type: 'geoshard',  x: 20, y: 16 },
      { type: 'geoshard',  x: 10, y: 26 },
      { type: 'geoshard',  x: 15, y: 20 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 12, y: 3, enemyId: 'theprism' },
      { type: 'golden',    x: 12, y: 2 },
      { type: 'exit',      x: 12, y: 1 },
      { type: 'chest',     x: 3, y: 10, loot: { gold: 35 } },
      { type: 'chest',     x: 21, y: 22, loot: { gold: 35 } },
      { type: 'potion',    x: 15, y: 12 },
      { type: 'gold',      x: 7,  y: 8 },
      { type: 'gold',      x: 18, y: 20 },
      { type: 'encounter', x: 3,  y: 6 },
      { type: 'encounter', x: 9,  y: 11 },
      { type: 'encounter', x: 15, y: 15 },
      { type: 'encounter', x: 20, y: 20 },
      { type: 'encounter', x: 7,  y: 25 },
      { type: 'encounter', x: 14, y: 28 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'encounter', x: 21, y: 28 },
      { type: 'mathdoor',  x: 14, y: 14, id: 'f6door1' },
      { type: 'mathdoor',  x: 17, y: 22, id: 'f6door2' },
      { type: 'fountain',  x: 11, y: 19, id: 'f6fountain1', uses: 3 },
    ],
  },
  {
    id: 7, name: 'Coinford Market', tileset: 'market',
    width: 25, height: 33, tiles: FLOOR_7_TILES, startX: 1, startY: 31,
    challenge: { type: 'token', count: 3, label: 'GOLD TOKEN', verb: 'recovered', allDoneMsg: 'Three real tokens — the drawbridge falls!' },
    palette: { wall: 0x6a5020, floor: 0xa08040, path: 0xc8a858, water: 0x806830, decor: 0x887038 },
    mazeConfig: {
      width: 19, height: 20,
      roomTemplates: [{ w: 5, h: 5 }, { w: 6, h: 5 }, { w: 8, h: 6 }, { w: 5, h: 8 }],
      challengeType: 'token',
      challengeCount: 3,
      enemyCount: 5,
      corridorWidth: 3,
      bossEnemyId: 'counterfeiter',
    },
    objects: [
      { type: 'token',     x: 5,  y: 5 },
      { type: 'token',     x: 20, y: 16 },
      { type: 'token',     x: 10, y: 26 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 12, y: 3, enemyId: 'counterfeiter' },
      { type: 'golden',    x: 12, y: 2 },
      { type: 'exit',      x: 12, y: 1 },
      { type: 'chest',     x: 3, y: 10, loot: { gold: 40 } },
      { type: 'chest',     x: 21, y: 22, loot: { gold: 40 } },
      { type: 'potion',    x: 15, y: 12 },
      { type: 'potion',    x: 8,  y: 20 },
      { type: 'gold',      x: 7,  y: 8 },
      { type: 'gold',      x: 18, y: 20 },
      { type: 'gold',      x: 3,  y: 28 },
      { type: 'encounter', x: 3,  y: 6 },
      { type: 'encounter', x: 9,  y: 11 },
      { type: 'encounter', x: 15, y: 15 },
      { type: 'encounter', x: 20, y: 20 },
      { type: 'encounter', x: 7,  y: 25 },
      { type: 'encounter', x: 14, y: 28 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'encounter', x: 21, y: 28 },
      { type: 'mathdoor',  x: 16, y: 17, id: 'f7door1' },
      { type: 'fountain',  x: 13, y: 13, id: 'f7fountain1', uses: 3 },
    ],
  },
  {
    id: 8, name: 'Infinity Library', tileset: 'library',
    width: 25, height: 33, tiles: FLOOR_8_TILES, startX: 1, startY: 31,
    challenge: { type: 'page', count: 3, label: 'LOST PAGE', verb: 'restored', allDoneMsg: 'All pages restored!', phase2: { type: 'chapterseal', count: 2, label: 'CHAPTER SEAL', verb: 'bound', allDoneMsg: 'Chapters sealed! The Paradox emerges!' } },
    palette: { wall: 0x2a1808, floor: 0x4a3018, path: 0x6a4828, water: 0x3a2010, decor: 0x3a2010 },
    mazeConfig: {
      width: 19, height: 20,
      roomTemplates: [{ w: 5, h: 7 }, { w: 5, h: 8 }, { w: 5, h: 9 }, { w: 6, h: 5 }],
      challengeType: 'page',
      challengeCount: 3,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'theparadox',
    },
    objects: [
      { type: 'page',      x: 5,  y: 5 },
      { type: 'page',      x: 20, y: 16 },
      { type: 'page',      x: 10, y: 26 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 12, y: 3, enemyId: 'theparadox' },
      { type: 'golden',    x: 12, y: 2 },
      { type: 'exit',      x: 12, y: 1 },
      { type: 'chest',     x: 3, y: 10, loot: { gold: 45 } },
      { type: 'chest',     x: 21, y: 22, loot: { gold: 45 } },
      { type: 'potion',    x: 15, y: 12 },
      { type: 'potion',    x: 8,  y: 20 },
      { type: 'gold',      x: 7,  y: 8 },
      { type: 'gold',      x: 18, y: 20 },
      { type: 'encounter', x: 3,  y: 6 },
      { type: 'encounter', x: 9,  y: 11 },
      { type: 'encounter', x: 15, y: 15 },
      { type: 'encounter', x: 20, y: 20 },
      { type: 'encounter', x: 7,  y: 25 },
      { type: 'encounter', x: 14, y: 28 },
      { type: 'encounter', x: 3,  y: 29 },
      { type: 'encounter', x: 21, y: 28 },
      { type: 'mathdoor',  x: 12, y: 8, id: 'f8door1' },
      { type: 'fountain',  x: 19, y: 19, id: 'f8fountain1', uses: 3 },
    ],
  },
  {
    id: 9, name: 'The Mending Room', tileset: 'arcane',
    width: 33, height: 43, tiles: FLOOR_9_TILES, startX: 1, startY: 41,
    challenge: { type: 'fragment', count: 3, label: 'EQUATION FRAGMENT', verb: 'placed', allDoneMsg: 'All fragments aligned!', phase2: { type: 'eqanchor', count: 2, label: 'EQUATION ANCHOR', verb: 'set', allDoneMsg: 'Anchors set! Face The Theorem!' } },
    palette: { wall: 0x140828, floor: 0x301850, path: 0x5830a0, water: 0x4018a0, decor: 0x281040 },
    mazeConfig: {
      width: 20, height: 20,
      roomTemplates: [{ w: 6, h: 6 }, { w: 7, h: 7 }, { w: 8, h: 6 }, { w: 5, h: 5 }],
      challengeType: 'fragment',
      challengeCount: 3,
      enemyCount: 5,
      corridorWidth: 2,
      bossEnemyId: 'theorem',
    },
    objects: [
      { type: 'fragment',  x: 5,  y: 5 },
      { type: 'fragment',  x: 27, y: 11 },
      { type: 'fragment',  x: 16, y: 33 },
      // Boss -> Golden Chest -> Exit (linear dead-end sequence)
      { type: 'boss',      x: 16, y: 3, enemyId: 'theorem' },
      { type: 'golden',    x: 16, y: 2 },
      { type: 'exit',      x: 16, y: 1 },
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
      { type: 'encounter', x: 16, y: 17 },
      { type: 'encounter', x: 3,  y: 37 },
      { type: 'encounter', x: 29, y: 7 },
      { type: 'mathdoor',  x: 17, y: 16, id: 'f9door1' },
      { type: 'fountain',  x: 9,  y: 23, id: 'f9fountain1', uses: 3 },
    ],
  },
];

export function getFloor(id) {
  return FLOORS.find((f) => f.id === id) ?? null;
}

// ------------------------------------------------------------------
// BATTLE SCENE VARIANTS
// ------------------------------------------------------------------
// Each floor has 2-3 distinct battle backgrounds tied to maze tile types.
// Boss fights always use variant 2 (the dramatic scene).
// tileTypes: which TILE codes trigger this variant in the maze.

const BATTLE_SCENES = {
  1: [
    { name: 'Meadow',        variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Pond Clearing',  variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Briar Throne',   variant: 2, tileTypes: [], boss: true },
  ],
  2: [
    { name: 'Shallow Reef',    variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Deep Grotto',     variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Pressure Chamber', variant: 2, tileTypes: [], boss: true },
  ],
  3: [
    { name: 'Cloudtop',       variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Storm Front',    variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Eye of the Storm', variant: 2, tileTypes: [], boss: true },
  ],
  4: [
    { name: 'Lava Tunnel',     variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Caldera',         variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Pyroclasts Forge', variant: 2, tileTypes: [], boss: true },
  ],
  5: [
    { name: 'Ice Shelf',      variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Frozen Lake',    variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Summit Throne',  variant: 2, tileTypes: [], boss: true },
  ],
  6: [
    { name: 'Crystal Gallery',  variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Prism Depths',     variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Prism Chamber',    variant: 2, tileTypes: [], boss: true },
  ],
  7: [
    { name: 'Market Alley',   variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Fountain Square', variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Grand Bazaar',   variant: 2, tileTypes: [], boss: true },
  ],
  8: [
    { name: 'Reading Room',   variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Archive Depths',  variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Theorem Sanctum', variant: 2, tileTypes: [], boss: true },
  ],
  9: [
    { name: 'Mending Hall',    variant: 0, tileTypes: [TILE.FLOOR, TILE.PATH] },
    { name: 'Dream Pool',      variant: 1, tileTypes: [TILE.WATER] },
    { name: 'Final Threshold',  variant: 2, tileTypes: [], boss: true },
  ],
};

/**
 * Get the battle scene variant for a given floor, tile type, and boss flag.
 * @param {number} floorId
 * @param {number} tileType - TILE constant from the maze
 * @param {boolean} isBoss
 * @returns {object} - { name, variant }
 */
export function getBattleSceneVariant(floorId, tileType, isBoss) {
  const scenes = BATTLE_SCENES[floorId] ?? BATTLE_SCENES[1];
  if (isBoss) {
    return scenes.find(s => s.boss) ?? scenes[scenes.length - 1];
  }
  const match = scenes.find(s => !s.boss && s.tileTypes.includes(tileType));
  return match ?? scenes[0];
}

// ------------------------------------------------------------------
// PROCEDURAL MAZE GENERATION
// ------------------------------------------------------------------

/**
 * Generate a room-based maze for a given floor using its mazeConfig.
 *
 * Returns a result object compatible with the floor definition structure:
 *   { tiles, objects, startX, startY, width, height }
 *
 * If the floor has no mazeConfig, returns null (caller should fall back
 * to the hand-crafted tiles/objects).
 *
 * @param {number} floorId - Floor id (1-9)
 * @param {number} [seed] - RNG seed (defaults to Date.now())
 * @returns {object|null}
 */
export function generateFloorMaze(floorId, seed) {
  const floor = getFloor(floorId);
  if (!floor || !floor.mazeConfig) return null;

  const mc = floor.mazeConfig;
  const s = seed ?? Date.now();

  const result = generateMaze(floorId, mc.width, mc.height, s, mc);

  // Inject the correct boss enemyId from the floor definition
  const bossDef = floor.objects.find(o => o.type === 'boss');
  if (bossDef) {
    const bossObj = result.objects.find(o => o.type === 'boss');
    if (bossObj) bossObj.enemyId = bossDef.enemyId;
  }

  return {
    tiles: result.tiles,
    objects: result.objects,
    startX: result.startX,
    startY: result.startY,
    width: mc.width,
    height: mc.height,
  };
}
