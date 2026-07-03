/**
 * Handcrafted levels — one purposeful map per floor.
 *
 * DESIGN CONTRACT (every floor):
 *   1. ONE big scrolling map (not room-boxes) with landmarks, loops,
 *      and pockets worth exploring.
 *   2. The map is physically DIVIDED: the boss area is unreachable
 *      until the floor's challenge is completed.
 *   3. Completing the challenge TRANSFORMS the world — tiles change
 *      (a bridge grows, a tide drains, lava cools) and the way opens.
 *      Doing things makes a structural difference.
 *   4. Challenges, theme, and math concept are the same idea:
 *      Garden/addition = growing MORE, Tidepool/subtraction = taking
 *      water AWAY, Cloud/multiplication = beacons REPEATING light,
 *      Ember/division = SPLITTING lava flows, etc.
 *   5. Everything is hand-placed. No randomization.
 *
 * Tile legend (string maps, parsed to the engine's numeric codes):
 *   W = wall (theme: hedge/rock/cloudbank/basalt/ice...)
 *   F = floor (walkable)
 *   P = path  (walkable, decorative)
 *   Q = water/hazard (NOT walkable here — it's what transforms)
 *   S = secret (walkable after reveal)
 *
 * Level fields:
 *   tiles      string rows (must be rectangular)
 *   startX/Y   hero spawn
 *   objects    hand-placed items/encounters/boss/golden/exit
 *   objective  ordered steps for the on-screen tracker
 *   transform  { message, tiles: [[x, y, 'P'|'F'|...], ...] } applied
 *              when the challenge completes
 *
 * Palettes, challenge config (type/count/labels/phase2), tileset and
 * battle variants continue to come from floors.js — this file owns
 *   layout + content + objective + transformation.
 */

const CODE = { W: 0, F: 1, P: 2, Q: 3, S: 4 };

function parseTiles(rows) {
  return rows.map(r => [...r].map(ch => CODE[ch] ?? 1));
}

// ════════════════════════════════════════════════════════════════
// FLOOR 1 — THE GARDEN (Addition)
//
// A walled garden split by a spring-fed stream. The Briar King has
// caged the three garden fairies; without them nothing new can grow
// and the flower bridge across the stream is gone. Free all three
// (adding them back together!) and they weave the bridge anew —
// opening the east grove where the Briar King waits.
//
// Map notes (22 × 16):
//   • stream runs down columns 14–15; bridge grows at rows 7–8
//   • NW pocket: fairy #1 behind an addition door
//   • pond garden center: fairy #2 in the flower clearing
//   • SE hedge maze: fairy #3 behind an addition door
//   • greenhouse nook NE holds a chest reward loop
// ════════════════════════════════════════════════════════════════
const FLOOR_1 = {
  id: 1,
  tiles: [
    'WWWWWWWWWWWWWWWWWWWWWW', // 0
    'WFFFWFFFFFFFFFQQWFFFFW', // 1
    'WFFFWFPPPPPPFFQQWFFFFW', // 2
    'WWFWWFPFFFFPFFQQWWFWWW', // 3
    'WFFFFFPFQQFPFFQQFFFFFW', // 4
    'WFFFFFPFQQFPFFQQFFFFFW', // 5
    'WFWWWFPFFFFPFFQQWWWFWW', // 6
    'WFFFFFPPPPPPFFQQFFFFFW', // 7  ← bridge grows at x14,15
    'WFFFFFFFFFFPFFQQFFFFFW', // 8  ← bridge grows at x14,15
    'WWWFWWFFFFFPFFQQWFWWWW', // 9
    'WFFFFFFFFFFPFFQQWFFFFW', // 10
    'WFPPPPPPPPPPFFQQWFFFFW', // 11
    'WWPWWWWWWWFFFFQQWWFWWW', // 12  ← SE pocket sealed; door at x2 is the only way in
    'WFPFFFFFFWFFFFQQFFFFFW', // 13
    'WFFFFFFFFWFFFFQQFFFFFW', // 14
    'WWWWWWWWWWWWWWWWWWWWWW', // 15
  ],
  startX: 2, startY: 10,
  objective: [
    { key: 'challenge', label: 'Free the 3 garden fairies' },
    { key: 'transform', label: 'Cross the flower bridge' },
    { key: 'boss', label: 'Defeat the Briar King' },
  ],
  transform: {
    message: 'The fairies weave a bridge of flowers!',
    tiles: [[14, 7, 'P'], [15, 7, 'P'], [14, 8, 'P'], [15, 8, 'P']],
  },
  objects: [
    // fairies — the challenge (type comes from floors.js challenge config)
    { type: 'fairy', x: 2, y: 1 },     // NW pocket, behind door
    { type: 'fairy', x: 10, y: 5 },    // pond clearing, at the water's edge
    { type: 'fairy', x: 5, y: 13 },    // SE hedge maze
    // math doors gate the pockets — addition problems open the way
    { type: 'mathdoor', x: 2, y: 3, id: 'f1door1' },
    { type: 'mathdoor', x: 2, y: 12, id: 'f1door2' },
    // hand-placed encounters guarding the routes
    { type: 'encounter', x: 6, y: 2 },
    { type: 'encounter', x: 11, y: 7 },
    { type: 'encounter', x: 8, y: 11 },
    { type: 'encounter', x: 12, y: 13 },
    { type: 'encounter', x: 18, y: 8 },   // east grove guard
    // rewards worth exploring for
    { type: 'chest', x: 18, y: 1, loot: { gold: 25 } },   // NE grove pocket
    { type: 'chest', x: 1, y: 8, loot: { gold: 20 } },
    { type: 'fountain', x: 6, y: 8, id: 'f1fountain1', uses: 3 },
    { type: 'gold', x: 12, y: 1 },
    { type: 'gold', x: 3, y: 10 },
    { type: 'gold', x: 19, y: 13 },
    { type: 'potion', x: 8, y: 13 },
    { type: 'potion', x: 20, y: 4 },
    // east grove — reachable only after the bridge grows
    { type: 'boss', x: 18, y: 5, enemyId: 'briarking' },
    { type: 'golden', x: 18, y: 4 },
    { type: 'exit', x: 18, y: 3 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOORS 2–9 — same contract, themed transformations:
//   2 Tidepool (−): close 3 drain valves → the tide DRAINS, sunken
//     causeway tiles Q→P reveal the route to the Pressure Chamber.
//   3 Cloud (×): light 3 beacons → their light MULTIPLIES across the
//     gap, cloud-bridge tiles Q→P extend to the Storm's Eye.
//   4 Ember (÷): seal 3 vents → the lava flow is SPLIT and starved,
//     cooled-rock tiles Q→P cross the flow to the Forge.
//   5 Frozen (mixed): kindle 3 thaw-crystals → the frozen falls MELT,
//     Q→P steps climb to the Ice Throne.
//   6 Crystal (facts): tune 3 geodes → resonance SHATTERS the crystal
//     wall, W→F opening the Prism Chamber.
//   7 Market (money): return 3 stolen ledgers → the drawbridge LOWERS,
//     Q→P over the canal to the Auction Hall.
//   8 Library (fractions): restore 3 torn pages → the story STAIRS
//     assemble, Q→P up the shelf canyon to the Archive.
//   9 Castle (all): light 3 harmony sigils → the void SEALS, Q→P
//     across the breach to the Chaos King's throne.
// ════════════════════════════════════════════════════════════════

const FLOOR_STUBS = {}; // populated below by makeStub for any floor not yet hand-crafted

/**
 * Temporary stub generator — a compact but REAL level obeying the
 * contract (divided map + transform opens boss) so unfinished floors
 * are playable while hand-crafting proceeds. Replaced floor-by-floor.
 */
function makeStub(id, challengeType, bossId) {
  return {
    id,
    tiles: [
      'WWWWWWWWWWWWWWWWWWWW',
      'WFFFFFFFPFFFFQQFFFFW',
      'WFPPPPFFPFFFFQQFFFFW',
      'WFPFFPFFPPPFFQQWWFWW',
      'WFPFFPFFFFPFFQQFFFFW',
      'WFPPFPWWFFPFFQQFFFFW', // ← bridge row 5 (x13,14)
      'WFFPFPFWFFPFFQQFFFFW', // ← bridge row 6 (x13,14)
      'WWFPFPFWFFPFFQQWFWWW',
      'WFFPFFFFFFPFFQQWFFFW',
      'WFPPPPPPPPPFFQQWFFFW',
      'WFPFFFFFFFFFFQQFFFFW',
      'WWWWWWWWWWWWWWWWWWWW',
    ],
    startX: 2, startY: 10,
    objective: [
      { key: 'challenge', label: 'Complete the 3 challenges' },
      { key: 'transform', label: 'Cross to the far side' },
      { key: 'boss', label: 'Defeat the boss' },
    ],
    transform: {
      message: 'The way across is open!',
      tiles: [[13, 5, 'P'], [14, 5, 'P'], [13, 6, 'P'], [14, 6, 'P']],
    },
    objects: [
      { type: challengeType, x: 2, y: 1 },
      { type: challengeType, x: 10, y: 4 },
      { type: challengeType, x: 3, y: 8 },
      // (no mathdoor here — it would sit on open floor gating nothing;
      //  the transform bridge is what opens the boss on stub floors)
      { type: 'encounter', x: 6, y: 2 },
      { type: 'encounter', x: 9, y: 9 },
      { type: 'encounter', x: 5, y: 6 },
      { type: 'encounter', x: 17, y: 8 },
      { type: 'chest', x: 17, y: 1, loot: { gold: 25 } },
      { type: 'fountain', x: 1, y: 1, id: `f${id}fountain1`, uses: 3 },
      { type: 'gold', x: 10, y: 1 },
      { type: 'gold', x: 6, y: 10 },
      { type: 'potion', x: 1, y: 8 },
      { type: 'boss', x: 17, y: 4, enemyId: bossId },
      { type: 'golden', x: 17, y: 3 },
      { type: 'exit', x: 17, y: 2 },
    ],
  };
}

FLOOR_STUBS[2] = makeStub(2, 'valve', 'pressure');
FLOOR_STUBS[3] = makeStub(3, 'beacon', 'skywhale');
FLOOR_STUBS[4] = makeStub(4, 'vent', 'pyroclast');
FLOOR_STUBS[5] = makeStub(5, 'crystal', 'absolutezero');
FLOOR_STUBS[6] = makeStub(6, 'geoshard', 'theprism');
FLOOR_STUBS[7] = makeStub(7, 'token', 'auctioneer');
FLOOR_STUBS[8] = makeStub(8, 'page', 'inkwyrm');
FLOOR_STUBS[9] = makeStub(9, 'fragment', 'chaosking');

const LEVELS = { 1: FLOOR_1, ...FLOOR_STUBS };

/** Register/replace a hand-crafted floor (used as floors are finished). */
export function registerLevel(def) { LEVELS[def.id] = def; }

export function getLevel(floorId) {
  const def = LEVELS[floorId] || LEVELS[1];
  return {
    ...def,
    tiles: parseTiles(def.tiles),
    width: def.tiles[0].length,
    height: def.tiles.length,
  };
}

export { LEVELS as LEVEL_DEFS, parseTiles, CODE as TILE_CODE };
