/**
 * Hand-crafted realm layouts — room-chain dungeons.
 *
 * Each realm is a sequence of connected rooms with specific purposes.
 * Rooms are defined by their tile grid (small, focused areas) and
 * connected by doorways. The hero walks through rooms in order,
 * encountering battles, puzzles, treasure, and story moments.
 *
 * Room types:
 *   entrance  — starting room with story/tutorial
 *   corridor  — connecting passage (may have encounters)
 *   puzzle    — math puzzle that opens the way forward
 *   battle    — guaranteed encounter room
 *   treasure  — optional side room with loot
 *   shop      — merchant NPC
 *   story     — cutscene/dialogue trigger
 *   challenge — floor's signature mechanic
 *   boss      — boss encounter arena
 *
 * Each room has:
 *   id        — unique within the realm
 *   type      — room purpose (determines behavior)
 *   name      — display name ("Hedge Clearing", "Coral Grotto")
 *   tiles     — 2D array of tile codes (small grid, typically 8-14 wide, 6-10 tall)
 *   objects   — items/NPCs/triggers placed in the room
 *   exits     — doorways connecting to other rooms { direction, targetRoom, x, y }
 *   palette   — optional per-room color override
 *   onEnter   — optional event key triggered when hero enters
 */

// Tile shorthand
const W = 0; // wall
const F = 1; // floor
const P = 2; // path
const Q = 3; // water/hazard
const S = 4; // secret

// ════════════════════════════════════════════════════════════════
// REALM 1: THE GARDEN (Addition)
// A sunlit garden with hedge corridors, flower clearings, a greenhouse,
// and a bramble-choked boss clearing. Peaceful but overgrown.
// ════════════════════════════════════════════════════════════════
export const REALM_1 = {
  id: 1,
  name: 'The Garden',
  rooms: [
    {
      id: 'entrance',
      type: 'entrance',
      name: 'Garden Gate',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,F,F,W],
        [W,F,F,Q,Q,Q,Q,F,F,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,P,P,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'fountain', x: 4, y: 3 },
      ],
      exits: [
        { direction: 'east', targetRoom: 'hedge_path', x: 11, y: 3 },
      ],
      startX: 1, startY: 5,
    },
    {
      id: 'hedge_path',
      type: 'corridor',
      name: 'Hedge Corridor',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 3, y: 3 },
        { type: 'gold', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'flower_clearing', x: 9, y: 3 },
        { direction: 'south', targetRoom: 'greenhouse', x: 5, y: 6 },
      ],
    },
    {
      id: 'flower_clearing',
      type: 'challenge',
      name: 'Flower Clearing',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,F,F,F,W],
        [W,F,F,F,Q,Q,Q,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'fairy', x: 5, y: 3 },
        { type: 'encounter', x: 9, y: 5 },
        { type: 'chest', x: 2, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'hedge_path', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'garden_bridge', x: 11, y: 5 },
      ],
    },
    {
      id: 'greenhouse',
      type: 'treasure',
      name: 'Old Greenhouse',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'chest', x: 2, y: 2 },
        { type: 'potion', x: 5, y: 3 },
        { type: 'chest', x: 5, y: 2 },
      ],
      exits: [
        { direction: 'north', targetRoom: 'hedge_path', x: 3, y: 0 },
      ],
    },
    {
      id: 'garden_bridge',
      type: 'puzzle',
      name: 'Broken Bridge',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,F,F,P,Q,Q,P,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'mathdoor', x: 4, y: 3 },
        { type: 'encounter', x: 2, y: 2 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'flower_clearing', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'fairy_grove', x: 9, y: 3 },
      ],
    },
    {
      id: 'fairy_grove',
      type: 'challenge',
      name: 'Fairy Grove',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,Q,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,Q,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'fairy', x: 3, y: 2 },
        { type: 'fairy', x: 7, y: 5 },
        { type: 'encounter', x: 5, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'garden_bridge', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'thorn_passage', x: 11, y: 4 },
      ],
    },
    {
      id: 'thorn_passage',
      type: 'corridor',
      name: 'Thorn Passage',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,W,F,F,F,F,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,F,F,F,F,W,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 3, y: 2 },
        { type: 'encounter', x: 5, y: 3 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'fairy_grove', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'boss_clearing', x: 7, y: 2 },
      ],
    },
    {
      id: 'boss_clearing',
      type: 'boss',
      name: 'Briar Throne',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'boss', x: 7, y: 3, enemyId: 'briarking' },
        { type: 'golden', x: 7, y: 2 },
        { type: 'exit', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'thorn_passage', x: 0, y: 4 },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════
// REALM 2-9: Defined with the same structure.
// Each realm has 8-12 rooms with unique layouts and purposes.
// Placeholder exports — will be filled with crafted layouts.
// ════════════════════════════════════════════════════════════════

export const REALM_2 = { id: 2, name: 'Tidepool Ruins', rooms: [] };
export const REALM_3 = { id: 3, name: 'Cloud Maze', rooms: [] };
export const REALM_4 = { id: 4, name: 'Ember Caves', rooms: [] };
export const REALM_5 = { id: 5, name: 'Frozen Peak', rooms: [] };
export const REALM_6 = { id: 6, name: 'Crystal Caverns', rooms: [] };
export const REALM_7 = { id: 7, name: 'Market Square', rooms: [] };
export const REALM_8 = { id: 8, name: 'Infinity Library', rooms: [] };
export const REALM_9 = { id: 9, name: 'The Mending Room', rooms: [] };

export const REALMS = [null, REALM_1, REALM_2, REALM_3, REALM_4, REALM_5, REALM_6, REALM_7, REALM_8, REALM_9];

export function getRealm(floorId) {
  return REALMS[floorId] || REALM_1;
}
