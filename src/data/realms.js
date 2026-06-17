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

export const REALM_2 = { id: 2, name: 'Tidepool Ruins', rooms: [
  { id: 'entrance', type: 'entrance', name: 'Tidal Shelf', startX: 1, startY: 4,
    tiles: [[W,W,W,W,W,W,W,W,W,W],[W,F,F,Q,Q,Q,F,F,F,W],[W,F,F,Q,Q,Q,F,F,F,W],[W,F,F,F,Q,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,W],[W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'fountain', x: 7, y: 2 }],
    exits: [{ direction: 'east', targetRoom: 'coral_tunnel', x: 9, y: 4 }] },
  { id: 'coral_tunnel', type: 'corridor', name: 'Coral Tunnel',
    tiles: [[W,W,W,W,W,W,W,W,W,W],[W,F,F,W,Q,Q,W,F,F,W],[W,F,F,F,Q,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,W],[W,F,F,F,Q,F,F,F,F,W],[W,F,F,W,Q,Q,W,F,F,W],[W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'encounter', x: 4, y: 3 },{ type: 'gold', x: 7, y: 2 }],
    exits: [{ direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },{ direction: 'east', targetRoom: 'valve_chamber', x: 9, y: 3 },{ direction: 'south', targetRoom: 'sunken_hall', x: 5, y: 6 }] },
  { id: 'sunken_hall', type: 'treasure', name: 'Sunken Hall',
    tiles: [[W,W,W,W,W,W,W,W],[W,F,F,Q,Q,F,F,W],[W,F,F,F,F,F,F,W],[W,F,F,F,F,F,F,W],[W,F,F,Q,Q,F,F,W],[W,W,W,W,W,W,W,W]],
    objects: [{ type: 'chest', x: 2, y: 2 },{ type: 'chest', x: 5, y: 3 },{ type: 'potion', x: 2, y: 3 }],
    exits: [{ direction: 'north', targetRoom: 'coral_tunnel', x: 3, y: 0 }] },
  { id: 'valve_chamber', type: 'challenge', name: 'Drain Chamber',
    tiles: [[W,W,W,W,W,W,W,W,W,W,W],[W,F,F,F,Q,Q,Q,F,F,F,W],[W,F,F,F,Q,Q,Q,F,F,F,W],[W,F,F,F,F,Q,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,F,W],[W,W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'valve', x: 5, y: 3 },{ type: 'encounter', x: 8, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'coral_tunnel', x: 0, y: 3 },{ direction: 'east', targetRoom: 'flooded_aqueduct', x: 10, y: 4 }] },
  { id: 'flooded_aqueduct', type: 'puzzle', name: 'Flooded Aqueduct',
    tiles: [[W,W,W,W,W,W,W,W,W,W],[W,F,F,Q,Q,Q,Q,F,F,W],[W,F,F,Q,Q,Q,Q,F,F,W],[W,F,F,P,Q,Q,P,F,F,W],[W,F,F,F,Q,Q,F,F,F,W],[W,F,F,F,F,F,F,F,F,W],[W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'mathdoor', x: 5, y: 3 }],
    exits: [{ direction: 'west', targetRoom: 'valve_chamber', x: 0, y: 3 },{ direction: 'east', targetRoom: 'valve_pool', x: 9, y: 4 }] },
  { id: 'valve_pool', type: 'challenge', name: 'Deep Pool',
    tiles: [[W,W,W,W,W,W,W,W,W,W],[W,F,F,Q,Q,F,F,Q,F,W],[W,F,F,Q,Q,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,W],[W,F,F,F,F,F,Q,Q,F,W],[W,F,F,F,F,F,Q,Q,F,W],[W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'valve', x: 4, y: 2 },{ type: 'encounter', x: 7, y: 4 },{ type: 'chest', x: 2, y: 1 }],
    exits: [{ direction: 'west', targetRoom: 'flooded_aqueduct', x: 0, y: 3 },{ direction: 'east', targetRoom: 'ruin_passage', x: 9, y: 3 }] },
  { id: 'ruin_passage', type: 'corridor', name: 'Ruin Passage',
    tiles: [[W,W,W,W,W,W,W,W],[W,F,F,F,F,F,F,W],[W,F,Q,F,F,Q,F,W],[W,F,F,F,F,F,F,W],[W,F,Q,F,F,Q,F,W],[W,F,F,F,F,F,F,W],[W,W,W,W,W,W,W,W]],
    objects: [{ type: 'encounter', x: 3, y: 2 },{ type: 'encounter', x: 5, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'valve_pool', x: 0, y: 3 },{ direction: 'east', targetRoom: 'pressure_chamber', x: 7, y: 3 }] },
  { id: 'pressure_chamber', type: 'boss', name: 'Pressure Chamber',
    tiles: [[W,W,W,W,W,W,W,W,W,W,W,W,W,W],[W,F,F,F,F,F,F,F,F,F,F,F,F,W],[W,F,F,Q,F,F,F,F,F,F,Q,F,F,W],[W,F,F,F,F,F,F,F,F,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,F,F,F,F,W],[W,F,F,F,F,F,F,F,F,F,F,F,F,W],[W,F,F,Q,F,F,F,F,F,F,Q,F,F,W],[W,F,F,F,F,F,F,F,F,F,F,F,F,W],[W,W,W,W,W,W,W,W,W,W,W,W,W,W]],
    objects: [{ type: 'valve', x: 4, y: 4 },{ type: 'boss', x: 7, y: 3, enemyId: 'pressure' },{ type: 'golden', x: 7, y: 2 },{ type: 'exit', x: 7, y: 1 }],
    exits: [{ direction: 'west', targetRoom: 'ruin_passage', x: 0, y: 4 }] },
] };
export const REALM_3 = { id: 3, name: 'Cloud Maze', rooms: [
  { id: 'entrance', type: 'entrance', name: 'Cloud Landing', startX: 1, startY: 3,
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'fountain', x: 5, y: 3 }],
    exits: [{ direction: 'east', targetRoom: 'sky_bridge', x: 9, y: 3 }] },
  { id: 'sky_bridge', type: 'corridor', name: 'Sky Bridge',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,3,3,3,3,3,3,3,3,0],[0,3,1,1,2,2,1,1,3,0],[0,3,1,1,2,2,1,1,3,0],[0,3,1,1,2,2,1,1,3,0],[0,3,3,3,3,3,3,3,3,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 4, y: 3 },{ type: 'gold', x: 6, y: 2 }],
    exits: [{ direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },{ direction: 'east', targetRoom: 'beacon_spire', x: 9, y: 3 },{ direction: 'south', targetRoom: 'wind_loft', x: 5, y: 6 }] },
  { id: 'wind_loft', type: 'treasure', name: 'Wind Loft',
    tiles: [[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,3,1,1,1,1,3,0],[0,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'chest', x: 3, y: 2 },{ type: 'potion', x: 5, y: 2 },{ type: 'chest', x: 4, y: 4 }],
    exits: [{ direction: 'north', targetRoom: 'sky_bridge', x: 3, y: 0 }] },
  { id: 'beacon_spire', type: 'challenge', name: 'Beacon Spire',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,3,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,3,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'beacon', x: 5, y: 3 },{ type: 'encounter', x: 7, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'sky_bridge', x: 0, y: 3 },{ direction: 'east', targetRoom: 'cloud_gap', x: 9, y: 3 }] },
  { id: 'cloud_gap', type: 'puzzle', name: 'Cloud Gap',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,2,3,3,2,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'mathdoor', x: 5, y: 3 }],
    exits: [{ direction: 'west', targetRoom: 'beacon_spire', x: 0, y: 3 },{ direction: 'east', targetRoom: 'beacon_ring', x: 9, y: 3 }] },
  { id: 'beacon_ring', type: 'challenge', name: 'Beacon Ring',
    tiles: [[0,0,0,0,0,0,0,0,0,0,0],[0,3,1,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,1,3,0],[0,0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'beacon', x: 5, y: 3 },{ type: 'encounter', x: 3, y: 2 },{ type: 'chest', x: 8, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'cloud_gap', x: 0, y: 3 },{ direction: 'east', targetRoom: 'storm_walk', x: 10, y: 3 }] },
  { id: 'storm_walk', type: 'corridor', name: 'Storm Walk',
    tiles: [[0,0,0,0,0,0,0,0],[0,3,1,1,1,1,3,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,3,1,1,1,1,3,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 3, y: 2 },{ type: 'encounter', x: 5, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'beacon_ring', x: 0, y: 3 },{ direction: 'east', targetRoom: 'boss_room', x: 7, y: 3 }] },
  { id: 'boss_room', type: 'boss', name: 'Eye of the Storm',
    tiles: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,3,1,1,1,1,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'beacon', x: 3, y: 4 },{ type: 'boss', x: 7, y: 3, enemyId: 'skywhale' },{ type: 'golden', x: 7, y: 2 },{ type: 'exit', x: 7, y: 1 }],
    exits: [{ direction: 'west', targetRoom: 'storm_walk', x: 0, y: 4 }] },
] };
export const REALM_4 = { id: 4, name: 'Ember Caves', rooms: [
  { id: 'entrance', type: 'entrance', name: 'Cave Mouth', startX: 1, startY: 3,
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,3,3,1,1,1,0],[0,1,1,1,3,3,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'fountain', x: 7, y: 2 }],
    exits: [{ direction: 'east', targetRoom: 'magma_tube', x: 9, y: 3 }] },
  { id: 'magma_tube', type: 'corridor', name: 'Magma Tube',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 4, y: 3 },{ type: 'gold', x: 7, y: 2 }],
    exits: [{ direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },{ direction: 'east', targetRoom: 'vent_pit', x: 9, y: 3 },{ direction: 'south', targetRoom: 'ore_cache', x: 5, y: 6 }] },
  { id: 'ore_cache', type: 'treasure', name: 'Ore Cache',
    tiles: [[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'chest', x: 2, y: 2 },{ type: 'chest', x: 5, y: 3 },{ type: 'potion', x: 4, y: 2 }],
    exits: [{ direction: 'north', targetRoom: 'magma_tube', x: 3, y: 0 }] },
  { id: 'vent_pit', type: 'challenge', name: 'Vent Pit',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,3,3,1,1,1,0],[0,1,1,1,3,3,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,3,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'vent', x: 5, y: 3 },{ type: 'encounter', x: 7, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'magma_tube', x: 0, y: 3 },{ direction: 'east', targetRoom: 'lava_bridge', x: 9, y: 3 }] },
  { id: 'lava_bridge', type: 'puzzle', name: 'Lava Bridge',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,2,3,3,2,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'mathdoor', x: 5, y: 3 }],
    exits: [{ direction: 'west', targetRoom: 'vent_pit', x: 0, y: 3 },{ direction: 'east', targetRoom: 'vent_gallery', x: 9, y: 3 }] },
  { id: 'vent_gallery', type: 'challenge', name: 'Vent Gallery',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'vent', x: 4, y: 3 },{ type: 'encounter', x: 7, y: 2 },{ type: 'chest', x: 2, y: 5 }],
    exits: [{ direction: 'west', targetRoom: 'lava_bridge', x: 0, y: 3 },{ direction: 'east', targetRoom: 'cinder_path', x: 9, y: 3 }] },
  { id: 'cinder_path', type: 'corridor', name: 'Cinder Path',
    tiles: [[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,0],[0,3,1,1,1,1,3,0],[0,1,1,1,1,1,1,0],[0,3,1,1,1,1,3,0],[0,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 3, y: 3 },{ type: 'encounter', x: 5, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'vent_gallery', x: 0, y: 3 },{ direction: 'east', targetRoom: 'boss_room', x: 7, y: 3 }] },
  { id: 'boss_room', type: 'boss', name: "Pyroclast's Forge",
    tiles: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,3,1,1,1,1,3,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,3,1,1,1,1,3,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'vent', x: 3, y: 4 },{ type: 'boss', x: 7, y: 3, enemyId: 'pyroclast' },{ type: 'golden', x: 7, y: 2 },{ type: 'exit', x: 7, y: 1 }],
    exits: [{ direction: 'west', targetRoom: 'cinder_path', x: 0, y: 4 }] },
] };
export const REALM_5 = { id: 5, name: 'Frozen Peak', rooms: [
  { id: 'entrance', type: 'entrance', name: 'Frost Gate', startX: 1, startY: 3,
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'fountain', x: 5, y: 3 }],
    exits: [{ direction: 'east', targetRoom: 'ice_corridor', x: 9, y: 3 }] },
  { id: 'ice_corridor', type: 'corridor', name: 'Ice Corridor',
    tiles: [[0,0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,1,1,0],[0,3,1,1,1,1,1,1,1,1,3,0],[0,1,1,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 5, y: 3 },{ type: 'gold', x: 9, y: 2 }],
    exits: [{ direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },{ direction: 'east', targetRoom: 'crystal_cave', x: 11, y: 3 },{ direction: 'south', targetRoom: 'snow_den', x: 6, y: 6 }] },
  { id: 'snow_den', type: 'treasure', name: 'Snow Den',
    tiles: [[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,0],[0,1,1,3,3,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'chest', x: 2, y: 2 },{ type: 'chest', x: 5, y: 3 },{ type: 'potion', x: 3, y: 4 }],
    exits: [{ direction: 'north', targetRoom: 'ice_corridor', x: 3, y: 0 }] },
  { id: 'crystal_cave', type: 'challenge', name: 'Crystal Cave',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'crystal', x: 5, y: 3 },{ type: 'encounter', x: 7, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'ice_corridor', x: 0, y: 3 },{ direction: 'east', targetRoom: 'frozen_bridge', x: 9, y: 3 }] },
  { id: 'frozen_bridge', type: 'puzzle', name: 'Frozen Bridge',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,2,3,3,2,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,1,1,3,3,3,3,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'mathdoor', x: 5, y: 3 }],
    exits: [{ direction: 'west', targetRoom: 'crystal_cave', x: 0, y: 3 },{ direction: 'east', targetRoom: 'crystal_gallery', x: 9, y: 3 }] },
  { id: 'crystal_gallery', type: 'challenge', name: 'Crystal Gallery',
    tiles: [[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,3,1,1,1,1,3,1,0],[0,1,1,1,1,1,1,1,1,0],[0,1,3,1,1,1,1,3,1,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'crystal', x: 5, y: 3 },{ type: 'encounter', x: 3, y: 2 },{ type: 'chest', x: 7, y: 5 }],
    exits: [{ direction: 'west', targetRoom: 'frozen_bridge', x: 0, y: 3 },{ direction: 'east', targetRoom: 'blizzard_pass', x: 9, y: 3 }] },
  { id: 'blizzard_pass', type: 'corridor', name: 'Blizzard Pass',
    tiles: [[0,0,0,0,0,0,0,0],[0,1,1,3,3,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,0],[0,1,1,3,3,1,1,0],[0,0,0,0,0,0,0,0]],
    objects: [{ type: 'encounter', x: 3, y: 3 },{ type: 'encounter', x: 5, y: 4 }],
    exits: [{ direction: 'west', targetRoom: 'crystal_gallery', x: 0, y: 3 },{ direction: 'east', targetRoom: 'boss_room', x: 7, y: 3 }] },
  { id: 'boss_room', type: 'boss', name: 'Ice Throne',
    tiles: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,1,3,1,1,1,1,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,1,1,3,1,1,1,1,1,1,3,1,1,0],[0,1,1,1,1,1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
    objects: [{ type: 'crystal', x: 3, y: 4 },{ type: 'boss', x: 7, y: 3, enemyId: 'absolutezero' },{ type: 'golden', x: 7, y: 2 },{ type: 'exit', x: 7, y: 1 }],
    exits: [{ direction: 'west', targetRoom: 'blizzard_pass', x: 0, y: 4 }] },
] };
export const REALM_6 = {
  id: 6,
  name: 'Crystal Caverns',
  rooms: [
    {
      id: 'entrance',
      type: 'entrance',
      name: 'Cavern Mouth',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,F,F,F,W],
        [W,F,F,F,Q,Q,Q,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'crystal', x: 5, y: 4 },
        { type: 'sign', x: 2, y: 2 },
      ],
      exits: [
        { direction: 'east', targetRoom: 'shard_tunnel', x: 11, y: 3 },
      ],
      startX: 1, startY: 6,
    },
    {
      id: 'shard_tunnel',
      type: 'corridor',
      name: 'Shard Tunnel',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,W,F,F,F,F,F,W,W,W],
        [W,F,F,F,F,F,F,F,W,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,W,W],
        [W,W,F,F,F,F,F,W,W,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 4, y: 3 },
        { type: 'gold', x: 7, y: 3 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'geode_chamber', x: 9, y: 3 },
        { direction: 'south', targetRoom: 'crystal_vault', x: 4, y: 6 },
      ],
    },
    {
      id: 'crystal_vault',
      type: 'treasure',
      name: 'Crystal Vault',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,Q,Q,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'chest', x: 2, y: 2 },
        { type: 'chest', x: 5, y: 4 },
        { type: 'potion', x: 5, y: 2 },
      ],
      exits: [
        { direction: 'north', targetRoom: 'shard_tunnel', x: 3, y: 0 },
      ],
    },
    {
      id: 'geode_chamber',
      type: 'challenge',
      name: 'Geode Chamber',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'geoshard', x: 5, y: 4 },
        { type: 'encounter', x: 9, y: 2 },
        { type: 'chest', x: 2, y: 6 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'shard_tunnel', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'mirror_hall', x: 11, y: 3 },
      ],
    },
    {
      id: 'mirror_hall',
      type: 'puzzle',
      name: 'Mirror Hall',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,P,P,P,P,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,Q,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'mathdoor', x: 5, y: 3 },
        { type: 'encounter', x: 2, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'geode_chamber', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'refraction_cave', x: 9, y: 3 },
      ],
    },
    {
      id: 'refraction_cave',
      type: 'challenge',
      name: 'Refraction Cave',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'geoshard', x: 5, y: 3 },
        { type: 'encounter', x: 9, y: 5 },
        { type: 'crystal', x: 2, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'mirror_hall', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'deep_fissure', x: 11, y: 4 },
      ],
    },
    {
      id: 'deep_fissure',
      type: 'corridor',
      name: 'Deep Fissure',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,W,F,F,F,F,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,F,F,F,F,W,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 3, y: 2 },
        { type: 'encounter', x: 4, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'refraction_cave', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'prism_arena', x: 7, y: 3 },
      ],
    },
    {
      id: 'prism_arena',
      type: 'boss',
      name: 'The Prism Chamber',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,Q,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,F,F,Q,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'boss', x: 7, y: 4, enemyId: 'theprism' },
        { type: 'golden', x: 7, y: 2 },
        { type: 'exit', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'deep_fissure', x: 0, y: 4 },
      ],
    },
  ],
};
export const REALM_7 = {
  id: 7,
  name: 'Market Square',
  rooms: [
    {
      id: 'entrance',
      type: 'entrance',
      name: 'Market Gate',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,P,P,F,F,F,W],
        [W,F,F,F,P,P,F,F,F,W],
        [W,F,F,F,P,P,F,F,F,W],
        [W,F,F,F,P,P,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'sign', x: 4, y: 1 },
        { type: 'npc', x: 2, y: 5 },
      ],
      exits: [
        { direction: 'east', targetRoom: 'vendor_row', x: 9, y: 3 },
      ],
      startX: 4, startY: 6,
    },
    {
      id: 'vendor_row',
      type: 'shop',
      name: 'Vendor Row',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,W,F,F,W,F,F,W,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,W,F,F,W,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'merchant', x: 2, y: 1 },
        { type: 'merchant', x: 5, y: 1 },
        { type: 'merchant', x: 8, y: 1 },
        { type: 'gold', x: 6, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'fountain_plaza', x: 11, y: 3 },
        { direction: 'south', targetRoom: 'back_alley', x: 5, y: 6 },
      ],
    },
    {
      id: 'back_alley',
      type: 'treasure',
      name: 'Back Alley',
      tiles: [
        [W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,W],
        [W,F,F,W,W,W,F,F,W],
        [W,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'chest', x: 2, y: 1 },
        { type: 'potion', x: 6, y: 3 },
        { type: 'chest', x: 6, y: 1 },
      ],
      exits: [
        { direction: 'north', targetRoom: 'vendor_row', x: 4, y: 0 },
      ],
    },
    {
      id: 'fountain_plaza',
      type: 'challenge',
      name: 'Fountain Plaza',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,Q,F,F,F,F,W],
        [W,F,F,F,Q,Q,Q,Q,F,F,F,W],
        [W,F,F,F,F,Q,Q,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'token', x: 5, y: 3 },
        { type: 'encounter', x: 9, y: 5 },
        { type: 'fountain', x: 5, y: 3 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'vendor_row', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'auction_tent', x: 11, y: 4 },
      ],
    },
    {
      id: 'auction_tent',
      type: 'puzzle',
      name: 'Auction Tent',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,P,P,P,P,F,F,W],
        [W,F,F,P,F,F,P,F,F,W],
        [W,F,F,P,P,P,P,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'mathdoor', x: 5, y: 3 },
        { type: 'encounter', x: 2, y: 5 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'fountain_plaza', x: 0, y: 4 },
        { direction: 'east', targetRoom: 'coin_exchange', x: 9, y: 3 },
      ],
    },
    {
      id: 'coin_exchange',
      type: 'challenge',
      name: 'Coin Exchange',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'token', x: 5, y: 4 },
        { type: 'encounter', x: 9, y: 2 },
        { type: 'gold', x: 2, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'auction_tent', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'warehouse', x: 11, y: 4 },
      ],
    },
    {
      id: 'warehouse',
      type: 'corridor',
      name: 'Warehouse',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,W,W,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,W,W,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 2, y: 3 },
        { type: 'encounter', x: 5, y: 5 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'coin_exchange', x: 0, y: 4 },
        { direction: 'east', targetRoom: 'counterfeit_den', x: 7, y: 3 },
      ],
    },
    {
      id: 'counterfeit_den',
      type: 'boss',
      name: 'Counterfeit Den',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,Q,Q,Q,Q,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'boss', x: 7, y: 4, enemyId: 'counterfeiter' },
        { type: 'golden', x: 7, y: 2 },
        { type: 'exit', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'warehouse', x: 0, y: 4 },
      ],
    },
  ],
};
export const REALM_8 = {
  id: 8,
  name: 'Infinity Library',
  rooms: [
    {
      id: 'entrance',
      type: 'entrance',
      name: 'Grand Foyer',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,P,P,P,P,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,P,P,P,P,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'sign', x: 5, y: 1 },
        { type: 'npc', x: 3, y: 4 },
      ],
      exits: [
        { direction: 'east', targetRoom: 'reading_hall', x: 11, y: 3 },
      ],
      startX: 1, startY: 6,
    },
    {
      id: 'reading_hall',
      type: 'corridor',
      name: 'Reading Hall',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,W,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 4, y: 3 },
        { type: 'gold', x: 7, y: 2 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'card_catalog', x: 9, y: 3 },
        { direction: 'south', targetRoom: 'restricted_wing', x: 5, y: 6 },
      ],
    },
    {
      id: 'restricted_wing',
      type: 'treasure',
      name: 'Restricted Wing',
      tiles: [
        [W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'chest', x: 2, y: 1 },
        { type: 'chest', x: 6, y: 5 },
        { type: 'potion', x: 4, y: 3 },
      ],
      exits: [
        { direction: 'north', targetRoom: 'reading_hall', x: 4, y: 0 },
      ],
    },
    {
      id: 'card_catalog',
      type: 'challenge',
      name: 'Card Catalog',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,W,F,W,F,W,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,W,F,W,F,W,F,W,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'page', x: 5, y: 3 },
        { type: 'encounter', x: 9, y: 6 },
        { type: 'chest', x: 1, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'reading_hall', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'spiral_stacks', x: 11, y: 4 },
      ],
    },
    {
      id: 'spiral_stacks',
      type: 'puzzle',
      name: 'Spiral Stacks',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,Q,F,F,Q,F,F,W],
        [W,F,F,F,P,P,F,F,F,W],
        [W,F,F,Q,F,F,Q,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'mathdoor', x: 5, y: 3 },
        { type: 'encounter', x: 7, y: 5 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'card_catalog', x: 0, y: 4 },
        { direction: 'east', targetRoom: 'cipher_alcove', x: 9, y: 3 },
      ],
    },
    {
      id: 'cipher_alcove',
      type: 'challenge',
      name: 'Cipher Alcove',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,W,F,F,F,W,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'page', x: 5, y: 4 },
        { type: 'encounter', x: 9, y: 2 },
        { type: 'gold', x: 2, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'spiral_stacks', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'index_corridor', x: 11, y: 3 },
      ],
    },
    {
      id: 'index_corridor',
      type: 'corridor',
      name: 'Index Corridor',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,W,F,F,F,F,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,F,F,F,F,W,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 3, y: 2 },
        { type: 'encounter', x: 4, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'cipher_alcove', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'paradox_hall', x: 7, y: 3 },
      ],
    },
    {
      id: 'paradox_hall',
      type: 'boss',
      name: 'Paradox Hall',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'boss', x: 7, y: 4, enemyId: 'theparadox' },
        { type: 'golden', x: 7, y: 2 },
        { type: 'exit', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'index_corridor', x: 0, y: 4 },
      ],
    },
  ],
};
export const REALM_9 = {
  id: 9,
  name: 'The Mending Room',
  rooms: [
    {
      id: 'entrance',
      type: 'entrance',
      name: 'Threshold of Mending',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,Q,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,P,F,F,F,F,F,W],
        [W,F,F,F,P,P,P,F,F,F,F,W],
        [W,F,F,F,F,P,F,F,F,F,F,W],
        [W,F,F,Q,F,F,F,Q,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'sign', x: 5, y: 4 },
        { type: 'crystal', x: 3, y: 2 },
      ],
      exits: [
        { direction: 'east', targetRoom: 'broken_hall', x: 11, y: 3 },
      ],
      startX: 1, startY: 6,
    },
    {
      id: 'broken_hall',
      type: 'corridor',
      name: 'Broken Hall',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,Q,F,F,Q,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,W],
        [W,F,F,Q,F,F,Q,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 4, y: 3 },
        { type: 'gold', x: 7, y: 2 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'entrance', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'fragment_nexus', x: 9, y: 3 },
        { direction: 'south', targetRoom: 'shard_vault', x: 5, y: 6 },
      ],
    },
    {
      id: 'shard_vault',
      type: 'treasure',
      name: 'Shard Vault',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,Q,Q,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,Q,Q,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'chest', x: 1, y: 1 },
        { type: 'chest', x: 6, y: 5 },
        { type: 'potion', x: 1, y: 5 },
      ],
      exits: [
        { direction: 'north', targetRoom: 'broken_hall', x: 3, y: 0 },
      ],
    },
    {
      id: 'fragment_nexus',
      type: 'challenge',
      name: 'Fragment Nexus',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'fragment', x: 5, y: 3 },
        { type: 'encounter', x: 9, y: 5 },
        { type: 'chest', x: 2, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'broken_hall', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'rift_bridge', x: 11, y: 4 },
      ],
    },
    {
      id: 'rift_bridge',
      type: 'puzzle',
      name: 'Rift Bridge',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W],
        [W,F,F,Q,Q,Q,Q,F,F,W],
        [W,F,F,Q,Q,Q,Q,F,F,W],
        [W,F,F,P,P,P,P,F,F,W],
        [W,F,F,Q,Q,Q,Q,F,F,W],
        [W,F,F,Q,Q,Q,Q,F,F,W],
        [W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'mathdoor', x: 5, y: 3 },
        { type: 'encounter', x: 2, y: 3 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'fragment_nexus', x: 0, y: 4 },
        { direction: 'east', targetRoom: 'woven_chamber', x: 9, y: 3 },
      ],
    },
    {
      id: 'woven_chamber',
      type: 'challenge',
      name: 'Woven Chamber',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,S,F,F,F,S,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,S,F,F,F,S,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'fragment', x: 5, y: 4 },
        { type: 'encounter', x: 9, y: 2 },
        { type: 'gold', x: 2, y: 6 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'rift_bridge', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'proof_corridor', x: 11, y: 3 },
      ],
    },
    {
      id: 'proof_corridor',
      type: 'story',
      name: 'Proof Corridor',
      tiles: [
        [W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,W],
        [W,F,F,P,P,F,F,W],
        [W,F,F,P,P,F,F,W],
        [W,F,F,P,P,F,F,W],
        [W,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'encounter', x: 2, y: 2 },
        { type: 'encounter', x: 5, y: 4 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'woven_chamber', x: 0, y: 3 },
        { direction: 'east', targetRoom: 'theorem_sanctum', x: 7, y: 3 },
      ],
      onEnter: 'final_revelation',
    },
    {
      id: 'theorem_sanctum',
      type: 'boss',
      name: 'Theorem Sanctum',
      tiles: [
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,Q,F,F,F,F,Q,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,F,F,F,F,F,F,F,F,F,F,F,F,W],
        [W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      ],
      objects: [
        { type: 'boss', x: 7, y: 4, enemyId: 'theorem' },
        { type: 'golden', x: 7, y: 2 },
        { type: 'exit', x: 7, y: 1 },
      ],
      exits: [
        { direction: 'west', targetRoom: 'proof_corridor', x: 0, y: 4 },
      ],
    },
  ],
};

export const REALMS = [null, REALM_1, REALM_2, REALM_3, REALM_4, REALM_5, REALM_6, REALM_7, REALM_8, REALM_9];

export function getRealm(floorId) {
  return REALMS[floorId] || REALM_1;
}

