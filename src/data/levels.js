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
    // trapped heroes — freed in-maze, they join the quest
    { type: 'hero', x: 7, y: 14, id: 'hero-wizard-toadstool', heroId: 'wizard-toadstool', prison: 'vine' },  // SE hedge maze
    { type: 'hero', x: 20, y: 7, id: 'hero-knight-crusader', heroId: 'knight-crusader', prison: 'vine' },    // east grove, past the bridge
    // east grove — reachable only after the bridge grows
    { type: 'boss', x: 18, y: 5, enemyId: 'briarking' },
    { type: 'golden', x: 18, y: 4 },
    { type: 'exit', x: 18, y: 3 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOOR 2 — EBBPORT, THE DROWNED TIDE-CITY (Subtraction)
//
// Ebbport is stuck at eternal high tide — the leviathan "the Pressure"
// jammed the Tide-Heart a century ago and drowned the city. The sea can
// only be lowered by SUBTRACTION: each of four Sluice Gates is a lock
// ("the basin holds N fathoms — release M — what remains?") that, once
// worked, drains the tide a STAGE and surfaces a whole new district.
//
// This is NOT "collect 3 → boss": the four sluices sit in districts that
// only EXIST once you've drained the previous one (metroidvania gating).
// Progress = exploration + subtraction, and every drain re-shapes the map.
//
// Map (36×30, ≈3× Floor 1). Everything starts underwater except the NW
// Harbor. The tx+ty diagonal paints marsh(NW)→beach→deep-water(SE), so
// the Deep Basin (boss) sits in the deepest SE water.
//
//   A Harbor Steps (NW, dry)  → Sluice 1 → drains causeway to
//   B Market Row (N)          → Sluice 2 → drains cistern channel to
//   C Temple Terraces (center)→ Sluice 3 → drains floodgate to
//   D Sunken Boulevard (E)    → Sluice 4 (final) → transform drains
//   E The Deep Basin (SE)     → cage-lock → Pressure → golden → exit
//
// Secrets (S auto-reveal on contact): Harbor cellar, Temple grotto,
// Boulevard smuggler's cache. A math-vault in B rewards a subtraction
// detour. Each sluice is gated by a subtraction math-door (the lock).
// ════════════════════════════════════════════════════════════════
const P_ = (list) => list.map(([x, y]) => [x, y, 'P']);
const FLOOR_2 = {
  id: 2,
  tiles: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQFFFFFFFFFFQQFFFFFFFFFFFFQQQQQQQQQW',
    'WQFFFFWFFFFFQQFFFFFFFFFFFFQQQQQQQQQW',
    'WQFSPPPPPFFFQQFFPPPPPPPPFFQQQQQQQQQW',
    'WQFFPPPPPFFFQQFFFFFFFFFFFFQQQQQQQQQW',
    'WQFFPPPPPWWFQQFFFFFWFFFFFFQQQQQQQQQW',
    'WQFFFFFFFFFWQQFWFFFFFFWFFFQQQQQQQQQW',
    'WQFFWFFFFFFWQQFFFWWWFFFFFFQQQQQQQQQW',
    'WQFFFFFFFFFFQQFFFWFFWFFFFFQQQQQQQQQW',
    'WQQQQQQQQQQQQQFFFFFFWFFFFFQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQFWFWFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQFFPFFFFQW',
    'WQQQQQQQQQQFFFFFFFFFFFFFFQQFFPFFFFQW',
    'WQQQQQQQQQQFFFFFFFFFFFFFFQQFFPFWFFQW',
    'WQQQQQQQQQQFFPPPPPPPPPPFFQQFFPFFFFQW',
    'WQQQQQQQQQQFWWFFFFFFFFFFFQQFWPFFFFQW',
    'WQQQQQQQQQQWFFWWFFFFFFFFFQQFFPFFFFQW',
    'WQQQQQQQQQQWFFWFFFFWFFSSFQQFFPFWSFQW',
    'WQQQQQQQQQQFFFFFFWFFFFFFFQQFFPFWFFQW',
    'WQQQQQQQQQQFFFFFFFFFFFFFFQQFFPFWFFQW',
    'WQQQQQQQQQQFFFFFFFFFFFFFFQQFFPFFWFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFQW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 2, startY: 8,
  objective: [
    { key: 'challenge', label: 'Open the four sluices — walk the sea down' },
    { key: 'transform', label: 'Cross the drained streets to the Deep Basin' },
    { key: 'boss', label: 'Face the Pressure' },
  ],
  transform: {
    message: 'The Deep Basin drains — the Pressure surfaces!',
    tiles: [[30, 25, 'P'], [30, 26, 'P']],
  },
  objects: [
    // ── A Harbor Steps ──
    { type: 'mathdoor', x: 8, y: 7, id: 'f2sluice1lock' },
    { type: 'valve', x: 10, y: 7, drain: P_([[12, 6], [13, 6]]), drainMessage: 'The Harbor Sluice opens — the sea falls to Market Row!' },
    { type: 'chest', x: 2, y: 2, loot: { gold: 20 } },   // secret cellar
    { type: 'potion', x: 3, y: 2 },
    { type: 'gold', x: 7, y: 9 },
    { type: 'encounter', x: 6, y: 5 },
    // ── B Market Row ──
    { type: 'mathdoor', x: 17, y: 10, id: 'f2sluice2lock' },
    { type: 'valve', x: 18, y: 10, drain: P_([[18, 11], [18, 12], [18, 13], [18, 14]]), drainMessage: 'The Cistern Sluice opens — the sea falls to the Temple!' },
    { type: 'mathdoor', x: 16, y: 7, id: 'f2vault' },
    { type: 'chest', x: 16, y: 9, loot: { gold: 60 } },  // math-vault
    { type: 'gold', x: 24, y: 3 },
    { type: 'encounter', x: 21, y: 3 },
    { type: 'encounter', x: 15, y: 5 },
    // ── C Temple Terraces ──
    { type: 'mathdoor', x: 13, y: 20, id: 'f2sluice3lock' },
    { type: 'valve', x: 12, y: 19, drain: P_([[25, 19], [26, 19]]), drainMessage: 'The Temple Floodgate opens — the sea falls to the Boulevard!' },
    { type: 'fountain', x: 20, y: 18, id: 'f2fount', uses: 3 },
    { type: 'chest', x: 23, y: 22, loot: { gold: 40 } },  // secret grotto
    { type: 'gold', x: 15, y: 22 },
    { type: 'encounter', x: 18, y: 16 },
    { type: 'encounter', x: 16, y: 22 },
    // ── D Sunken Boulevard ──
    { type: 'mathdoor', x: 30, y: 13, id: 'f2sluice4lock' },
    { type: 'valve', x: 29, y: 13 },   // FINAL sluice — triggers the Deep Basin transform
    { type: 'chest', x: 32, y: 22, loot: { gold: 50 } },  // smuggler's cache (secret)
    { type: 'gold', x: 32, y: 21 },
    { type: 'potion', x: 28, y: 23 },
    { type: 'encounter', x: 29, y: 17 },
    { type: 'encounter', x: 30, y: 22 },
    // ── trapped heroes — Ebbport survivors, freed as districts surface ──
    { type: 'hero', x: 24, y: 7, id: 'hero-wizard-spellblade', heroId: 'wizard-spellblade', prison: 'coral' },  // Market Row
    { type: 'hero', x: 21, y: 21, id: 'hero-bunny-nova', heroId: 'bunny-nova', prison: 'coral' },               // Temple Terraces
    // ── E Deep Basin (boss lair) ──
    { type: 'mathdoor', x: 30, y: 27, id: 'f2cagelock' },
    { type: 'boss', x: 31, y: 27, enemyId: 'pressure' },
    { type: 'golden', x: 32, y: 28 },
    { type: 'exit', x: 33, y: 27 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOOR 3 — THE SHATTERED SKY, "The Doubling Light" (Multiplication)
//
// The Skywhale swallowed the Sun-Seed; the light-bridges between the
// sky islands faded and Zephyr the sky-shepherd's cloud-sheep
// scattered. Each Sky Beacon lit DOUBLES the light: bridges of
// 2 → 4 → 8 tiles grow, and the fourth beacon floods the sky with
// SIXTEEN tiles of light at once — a quad-bridge into the Eye of the
// Storm from all four sides. Multiplication made visible.
//
// Map (30×34). Zone = tx+ty: <16 calm blue, <36 storm dark, else
// sunset gold. The EYE (boss island) sits dead-center in the storm
// band, sealed by sky on every side; the island chain orbits it:
//
//   A start isle (calm NW)  → beacon 1 → bridge east (×2 = 2 tiles)
//   B north isle            → beacon 2 → the light SPLITS south + east
//                                        (×2 = 4 tiles, pick a branch!)
//   C south isle            → beacon 3 → sunset stair (×2 = 8 tiles)
//   D east isle             → beacon 4 → THE TRANSFORM (×2 = 16 tiles)
//   E sunset treasure isle  — riches + Boulder, via the sunset stair
//
// Secrets: three walled "cloud-sheep pens" (S doors) hide Zephyr's
// lost flock with treasure. Paladin is marooned on D — he held the
// beacon but strength alone doesn't multiply.
// ════════════════════════════════════════════════════════════════
const FLOOR_3 = {
  id: 3,
  tiles: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQFFWFFFFFQQFFFFFFWFFQQQQQQQQW',
    'WQWSWFFFFFQQFFFFFFWSWQQQQQQQQW',
    'WQFFFFFFFFQQFFFFFFFFFQQQQQQQQW',
    'WQFPPPPPPFQQFPPPPPPPFQQQQQQQQW',
    'WQFFFFFFFFQQFFFFFFFFFQQQQQQQQW',
    'WQFFFFFFFFQQFFFFFFFFFQQQQQQQQW',
    'WQFFFFFFFFQQFFFFFFFFFQQFFFFFQW',
    'WQFFFFFFFFQQQQQQQQQQQQQFPFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQFPFFFQW',
    'WQQQQQQQQQQQQQQQQQQQQQQFPFFFQW',
    'WQQFFFFFFQQQQQQQQQQQQQQFPFFFQW',
    'WQQFFPFFFQQQQFFFFFFQQQQFPFFFQW',
    'WQQFFPFFFQQQQFFFFFFQQQQFFFFFQW',
    'WQQFFPFFFQQQQFPPPPFQQQQQQQQQQW',
    'WQQFFPFFFQQQQFPPPPFQQQQQQQQQQW',
    'WQQFFPFFFQQQQFFFFFFQQQQQQQQQQW',
    'WQQFFFFFFQQQQFFFFFFQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQFFFFFFFFFFFFFFFQQQQW',
    'WQQQQQQQQQFFFFFFFFFFFFFFFQQQQW',
    'WQQQQQQQQQFPPPPPPPPPPPPPFQQQQW',
    'WQQQQQQQQQFFFFFFFFFFFFFFFQQQQW',
    'WQQQQQQQQQFFFFFFFFFFFFWSWQQQQW',
    'WQQQQQQQQQFFFFFFFFFFFFWFFQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 3, startY: 6,
  objective: [
    { key: 'challenge', label: 'Light the four Sky Beacons — the light doubles' },
    { key: 'transform', label: 'Cross the great light-bridge into the Eye' },
    { key: 'boss', label: 'Face the Skywhale' },
  ],
  transform: {
    message: 'FOUR beacons — SIXTEEN bridges of light! The Eye opens!',
    tiles: P_([[15, 9], [15, 10], [15, 11], [15, 12], [9, 15], [10, 15], [11, 15], [12, 15], [19, 16], [20, 16], [21, 16], [22, 16], [16, 19], [16, 20], [16, 21], [16, 22]]),
  },
  objects: [
    // ── A: start isle (calm) ──
    { type: 'mathdoor', x: 6, y: 5, id: 'f3lock1' },
    { type: 'beacon', x: 8, y: 5, drain: P_([[10, 5], [11, 5]]), drainMessage: 'One beacon — the light DOUBLES! A sky-bridge grows east!' },
    { type: 'encounter', x: 4, y: 8 },
    { type: 'gold', x: 2, y: 2 },            // sheep pen 1
    { type: 'potion', x: 8, y: 8 },
    // ── B: north isle ──
    { type: 'mathdoor', x: 14, y: 5, id: 'f3lock2' },
    { type: 'beacon', x: 16, y: 5, drain: P_([[5, 10], [5, 11], [21, 8], [22, 8]]), drainMessage: 'TWO beacons — the light SPLITS! Bridges south AND east!' },
    { type: 'chest', x: 13, y: 3, loot: { gold: 30 } },
    { type: 'gold', x: 19, y: 2 },           // sheep pen 2
    { type: 'encounter', x: 18, y: 7 },
    { type: 'encounter', x: 13, y: 7 },
    // ── C: south isle ──
    { type: 'mathdoor', x: 5, y: 14, id: 'f3lock3' },
    { type: 'beacon', x: 5, y: 16, drain: P_([[6, 19], [7, 19], [7, 20], [8, 20], [8, 21], [9, 21], [9, 22], [10, 22]]), drainMessage: 'THREE beacons — EIGHT stairs of light climb to the sunset isle!' },
    { type: 'fountain', x: 4, y: 12, id: 'f3fount', uses: 3 },
    { type: 'encounter', x: 7, y: 17 },
    { type: 'gold', x: 3, y: 18 },
    // ── D: east isle — Paladin marooned with the final beacon ──
    { type: 'mathdoor', x: 24, y: 10, id: 'f3lock4' },
    { type: 'beacon', x: 24, y: 12 },        // FINAL beacon → quad-bridge transform
    { type: 'hero', x: 26, y: 9, id: 'hero-knight-paladin', heroId: 'knight-paladin', prison: 'cloud' },
    { type: 'encounter', x: 26, y: 13 },
    { type: 'potion', x: 27, y: 8 },
    // ── E: sunset treasure isle — Boulder and the flock's riches ──
    { type: 'hero', x: 20, y: 26, id: 'hero-bunny-boulder', heroId: 'bunny-boulder', prison: 'cloud' },
    { type: 'chest', x: 12, y: 27, loot: { gold: 45 } },
    { type: 'chest', x: 24, y: 28, loot: { gold: 40 } },  // sheep pen 3
    { type: 'gold', x: 23, y: 28 },
    { type: 'gold', x: 15, y: 27 },
    { type: 'potion', x: 11, y: 24 },
    { type: 'encounter', x: 17, y: 24 },
    { type: 'encounter', x: 22, y: 26 },
    // ── THE EYE: the Skywhale's storm-heart ──
    { type: 'mathdoor', x: 15, y: 14, id: 'f3cagelock' },
    { type: 'boss', x: 16, y: 15, enemyId: 'skywhale' },
    { type: 'golden', x: 15, y: 16 },
    { type: 'exit', x: 17, y: 16 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOOR 4 — EMBER CAVES, "Divide the Fire" (Division)
//
// Pyroclast merged every tame forge-stream into ONE monstrous lava
// river no one can cross. Cinder the forge-imp knows the answer:
// what can't be crossed whole can be crossed in PARTS. Each sealed
// vent DIVIDES the flow — in two, in four — until thin cooled
// crossings appear, and the final vent cools the caldera moat itself.
//
// Map (38×30). The great river (y14-16) halves the cave; two lava
// falls split the north into three chambers; a moat rings the boss.
// BRANCHING: West Galleries (vent 1 → west crossing → NW chamber →
// vent 3 breaches the west fall) and East Forge (vent 2 → east
// crossing → NE chamber → vent 4, the FINAL seal) — play either
// wing first; drains interleave. Secrets: magma-tube S passages
// across both falls, Bookworm's hidden study (SW), a forge cache (E).
// Berserker charged the fire alone and sits caged in the East Forge.
// ════════════════════════════════════════════════════════════════
const FLOOR_4 = {
  id: 4,
  tiles: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WFFFFFFFQQFFFFFFFFFFFFFFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFFFFFFFFFFFFFFFFFQQFFFFFFFW',
    'WFFFFFFFSSFFFFFFFFFFFFFFFFFFSSFFFFFFFW',
    'WFFFFFFFQQFFFFFQQQQQQQQFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFFFFQFFFFFFQFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFFFFQFPPPPFQFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFFFFQFPPPPFQFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFFFFQFPPPPFQFFFFFQQFFFFFFFW',
    'WFFFFFFFQQFFWFFQFFFFFFQFFWFFQQFFFFFFFW',
    'WFFFPFFFQQFFWFFQQQQQQQQFFWFFQQFFFPFFFW',
    'WFFFPFFFQQFFWFFFFFFFFFFFFWFFQQFFFPFFFW',
    'WFFFPFFFQQFFWFFFFFFFFFFFFWFFQQFFFPFFFW',
    'WFFFPFFFQQFFFFFFFFFFFFFFFFFFQQFFFPFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFWFFFFPFFFFFWFFFFFFWFFFFFW',
    'WFFFFFFFFFFFFWFFFFPFFFFFWFFFFFFWFFFFFW',
    'WFFFFFFFFFFFFWFFFFPFFFFFWFFFFFFWFFFFFW',
    'WFFPPPPPPPPPFWFFFFPFFFFFWFPPPPPPPPPPFW',
    'WFFFFFFFFFFFFFFPPPPPPPPFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFWWSWWFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFWFFWWFFFFFFFFFFFFFFFFFFFFFFFFFFWWWFW',
    'WFWFFWWFFFFFFFFFFFFFFFFFFFFFFFFFFSFFFW',
    'WFWWWWWFFFFFFFFFFFFFFFFFFFFFFFFFFWWWFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 18, startY: 25,
  objective: [
    { key: 'challenge', label: 'Seal the four vents — divide the great fire' },
    { key: 'transform', label: 'Cross the cooled flows to the caldera' },
    { key: 'boss', label: 'Face Pyroclast' },
  ],
  transform: {
    message: 'The last vent seals — the caldera COOLS! Pyroclast is exposed!',
    tiles: P_([[17, 10], [18, 10], [19, 10]]),
  },
  objects: [
    // ── Entry hall (south center) ──
    { type: 'encounter', x: 15, y: 23 },
    { type: 'fountain', x: 21, y: 24, id: 'f4fount', uses: 3 },
    { type: 'gold', x: 16, y: 27 },
    // ── West Galleries: vent 1 + Bookworm's hidden study ──
    { type: 'mathdoor', x: 7, y: 21, id: 'f4lock1' },
    { type: 'vent', x: 4, y: 21, drain: P_([[5, 14], [5, 15], [5, 16]]), drainMessage: 'The fire DIVIDES in two — a cooled crossing to the west!' },
    { type: 'hero', x: 3, y: 26, id: 'hero-wizard-bookworm', heroId: 'wizard-bookworm', prison: 'ember' },
    { type: 'encounter', x: 4, y: 19 },
    { type: 'potion', x: 2, y: 18 },
    { type: 'gold', x: 10, y: 26 },
    // ── East Forge: vent 2 + Berserker's cage ──
    { type: 'mathdoor', x: 30, y: 21, id: 'f4lock2' },
    { type: 'vent', x: 33, y: 21, drain: P_([[32, 14], [32, 15], [32, 16]]), drainMessage: 'Divided AGAIN — four thin flows! A crossing cools east!' },
    { type: 'hero', x: 27, y: 25, id: 'hero-knight-berserker', heroId: 'knight-berserker', prison: 'ember' },
    { type: 'encounter', x: 27, y: 20 },
    { type: 'encounter', x: 32, y: 25 },
    { type: 'chest', x: 35, y: 26, loot: { gold: 50 } },   // forge cache (secret)
    { type: 'gold', x: 34, y: 26 },
    { type: 'potion', x: 35, y: 18 },
    // ── NW chamber: vent 3 breaches the west fall ──
    { type: 'mathdoor', x: 4, y: 9, id: 'f4lock3' },
    { type: 'vent', x: 4, y: 6, drain: P_([[8, 8], [9, 8]]), drainMessage: 'The west fall parts — halved, and halved again!' },
    { type: 'chest', x: 2, y: 2, loot: { gold: 35 } },
    { type: 'encounter', x: 3, y: 11 },
    { type: 'gold', x: 6, y: 3 },
    // ── NE chamber: vent 4 — the FINAL division ──
    { type: 'mathdoor', x: 33, y: 9, id: 'f4lock4' },
    { type: 'vent', x: 33, y: 6 },   // final vent → caldera transform
    { type: 'encounter', x: 34, y: 11 },
    { type: 'potion', x: 36, y: 2 },
    { type: 'gold', x: 31, y: 3 },
    // ── North center: the Forgeworks around the caldera ──
    { type: 'chest', x: 26, y: 3, loot: { gold: 40 } },
    { type: 'encounter', x: 12, y: 6 },
    { type: 'encounter', x: 24, y: 12 },
    { type: 'gold', x: 14, y: 3 },
    // ── The caldera: Pyroclast's island ──
    { type: 'mathdoor', x: 18, y: 9, id: 'f4cagelock' },
    { type: 'boss', x: 18, y: 7, enemyId: 'pyroclast' },
    { type: 'golden', x: 17, y: 6 },
    { type: 'exit', x: 19, y: 6 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOOR 5 — FROZEN PEAK, "The Four Keys of Thaw" (Mixed operations)
//
// Absolute Zero froze the spring that feeds every river in Numeria.
// The mountain is a switchback ASCENT of five terraces, each sealed
// behind a wall of ice. Four Thaw Crystals hold the spring's warmth —
// the Crystals of SUMS, DIFFERENCES, PRODUCTS and QUOTIENTS — and
// each answers only to its own operation (op-keyed math doors).
// Mixed review made literal: every kind of math melts its own wall.
//
// Map (30×36, climbed bottom-to-top). Mid-mountain, BLAZE the fire
// bunny sits frozen in the ice (the irony is not lost on him);
// freeing him melts a second hidden pass — the rescued hero opens
// the world. Secrets: a crevasse cache and an echo cave.
// ════════════════════════════════════════════════════════════════
const FLOOR_5 = {
  id: 5,
  tiles: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFPPPPPPFFFFFFFFFFW',
    'WFFFFFFFFFFFFPPPPPPFFFFFFFFFFW',
    'WFFFFFFFFFFFFFPPPPFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFPPPPFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFPPPPFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WFWWWWFFFFFFFFFFWFFFFFFFFFFFFW',
    'WFFFSWFFFWFFFFFFWFFFFFFFFFFFFW',
    'WFFFPPPPPPPPPPPPPPPPPPPPPPFFFW',
    'WFFFFFFFFWFFFFFFWFFFFFFFFFFFFW',
    'WFFFFFFFFWFFFFFFFFFFFFFFFFFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WFFFFFFFFFFFWFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFWFFFFFFFWFFFFFFFFW',
    'WFFFPPPPPPPPPPPPPPPPPPPPPPPFFW',
    'WFFFFFFFFFFFWFFFFFFFWFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFWFFFFFFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WFFFFFFFWFFFFFFFFFFFFFFWFFFFFW',
    'WFFFPPPPPPPPPPPPPPPPPPPPPPPFFW',
    'WFFFFFFFWFFFFFFFWFFFFFFFFWSWWW',
    'WFFFFFFFFFFFFFFFWFFFFFFFFWFFWW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQW',
    'WFFFFFFFFFFFFFFFFFFFFFWFFFFFFW',
    'WFFFFFFFFFWFFFFFFFFFFFWFFFFFFW',
    'WFFPPPPPPPPPPPPPPPPPPFWFFFFFFW',
    'WFFFFFFFFFWFFFFFFFFFFFWFFFFFFW',
    'WFFFFFFFFFWFFFFFFFFFFFFFFFFFFW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 15, startY: 32,
  objective: [
    { key: 'challenge', label: 'Wake the four Thaw Crystals — one for each operation' },
    { key: 'transform', label: 'Climb the thawed switchbacks to the summit' },
    { key: 'boss', label: 'Face Absolute Zero' },
  ],
  transform: {
    message: 'The Crystal of Quotients sings — the summit gate THAWS!',
    tiles: P_([[15, 8], [15, 9], [16, 8], [16, 9]]),
  },
  objects: [
    // ── T0 base camp: the Crystal of Sums (+) ──
    { type: 'mathdoor', x: 8, y: 32, id: 'f5lock1', operator: '+' },
    { type: 'crystal', x: 5, y: 32, drain: P_([[14, 28], [14, 29], [15, 28], [15, 29]]), drainMessage: 'The Crystal of SUMS wakes — the first ice wall melts!' },
    { type: 'encounter', x: 20, y: 31 },
    { type: 'gold', x: 3, y: 34 },
    { type: 'potion', x: 26, y: 33 },
    // ── T1: the Crystal of Differences (−) + crevasse cache ──
    { type: 'mathdoor', x: 6, y: 25, id: 'f5lock2', operator: '-' },
    { type: 'crystal', x: 4, y: 26, drain: P_([[22, 22], [22, 23], [23, 22], [23, 23]]), drainMessage: 'The Crystal of DIFFERENCES hums — another wall falls!' },
    { type: 'encounter', x: 12, y: 26 },
    { type: 'encounter', x: 25, y: 24 },
    { type: 'chest', x: 27, y: 27, loot: { gold: 35 } },   // crevasse cache (secret)
    { type: 'gold', x: 2, y: 24 },
    // ── T2: the Crystal of Products (×) + BLAZE frozen in the ice ──
    { type: 'mathdoor', x: 7, y: 19, id: 'f5lock3', operator: '*' },
    { type: 'crystal', x: 5, y: 18, drain: P_([[8, 15], [8, 16], [9, 15], [9, 16]]), drainMessage: 'The Crystal of PRODUCTS blazes — the high pass opens!' },
    { type: 'hero', x: 25, y: 18, id: 'hero-bunny-blaze', heroId: 'bunny-blaze', prison: 'ice', drain: P_([[24, 15], [24, 16], [25, 15], [25, 16]]), drainMessage: 'Blaze bursts free — his flame melts a hidden pass!' },
    { type: 'fountain', x: 17, y: 20, id: 'f5fount', uses: 3 },
    { type: 'encounter', x: 14, y: 18 },
    { type: 'encounter', x: 27, y: 20 },
    { type: 'potion', x: 2, y: 20 },
    // ── T3: the Crystal of Quotients (÷, the FINAL key) + echo cave ──
    { type: 'mathdoor', x: 20, y: 12, id: 'f5lock4', operator: '/' },
    { type: 'crystal', x: 23, y: 12 },   // final crystal → summit transform
    { type: 'chest', x: 2, y: 11, loot: { gold: 45 } },    // echo cave (secret)
    { type: 'gold', x: 3, y: 13 },
    { type: 'encounter', x: 6, y: 12 },
    { type: 'encounter', x: 26, y: 11 },
    // ── SUMMIT: Absolute Zero's frozen throne ──
    { type: 'mathdoor', x: 15, y: 6, id: 'f5cagelock' },
    { type: 'boss', x: 15, y: 4, enemyId: 'absolutezero' },
    { type: 'golden', x: 14, y: 3 },
    { type: 'exit', x: 17, y: 3 },
    { type: 'chest', x: 12, y: 3, loot: { gold: 50 } },
  ],
};


// ════════════════════════════════════════════════════════════════
// FLOOR 6 — CRYSTAL CAVERNS, "The Shape of Light" (Geometry)
//
// The Prism shattered the Great Geode, and the caverns' light bends
// at wrong angles: every deep hall sealed behind solid crystal. The
// caverns are GEOMETRY — each carved chamber IS a shape (rectangle
// entry, Triangle Hall, Square Gallery, Hexagon Vault, and the
// Prism's Octagon), and each restored geo-shard fires a straight
// BEAM of light that cuts the next passage through solid rock.
// Darkest floor in the game: the fog of war is the antagonist.
//
// Great Helm and Grand Mage hang sealed in crystal — the Prism
// collects strong warriors as trophies. Secrets: the Geode Heart
// and the Diamond Nook. Guide: Faceta, the geode-keeper.
// ════════════════════════════════════════════════════════════════
const FLOOR_6 = {
  id: 6,
  tiles: [
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWFFFFFFFFWWWWWWWWWWFFFFFWWWWWWW',
    'WWWWWWFFFFFFFFWWWWWWWWWFFFFFFFWWWWWW',
    'WWWWWWFFPPPPFFWWWWWWWWFFFFFFFFFWWWWW',
    'WWFFFWFFPPPPFFWWWWWWWWFFFFFFFFFWWWWW',
    'WWFFFSFFPPPPFFWWWWWWWWFFFFFFFFFWWWWW',
    'WWFFFWFFPPPPFFWWWWWWWWFFFFFFFFFWWWWW',
    'WWWWWWFFFFFFFFWWWWWWWWFFFFFFFFFWWWWW',
    'WWWWWWFFFFFFFFWWWWWWWWWFFFFFFFWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWFFFFFWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWFWWWWWWWWWWWWWWWFFFFFWWWWWWW',
    'WWWWWWWFFFWWWWWWWWWWWWWFFFFFFFWWWWWW',
    'WWWWWWWFFFWWWWWWWWWWWWFFFFFFFFFWWWWW',
    'WWWWWWFFFFFWWWWWWWWWWWFFFPPPFFFWWWWW',
    'WWWWWFFFFFFFWWWWWWWWWWFFFPPPFFFWWWWW',
    'WWWWWFFFFFFFWWWWWWWWWWFFFPPPFFFWWWWW',
    'WWWWFFFFFFFFFWFFFFFFFWFFFFFFFFFWWWWW',
    'WWWWFFFFFFFFFWFFFFFFFWWFFFFFFFWWWWWW',
    'WWWFFFFFFFFFFWFFPPPPFWWWFFFFFWWWWWWW',
    'WWWWWWWWWWWWWWFFPPPPFWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWFFFFFFFSFFFFWWWWWWWWWW',
    'WWWWWWWWWWWWWWFFFFFFFWFFFFWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWFFFFWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 17, startY: 28,
  objective: [
    { key: 'challenge', label: 'Restore the four geo-shards — light takes shape' },
    { key: 'transform', label: 'Follow the beams to the Octagon' },
    { key: 'boss', label: 'Face The Prism' },
  ],
  transform: {
    message: 'The fourth beam fires — an octagon of light opens the vault!',
    tiles: P_([[26, 15], [26, 16], [26, 17]]),
  },
  objects: [
    // ── Entry hall (rectangle) ──
    { type: 'mathdoor', x: 14, y: 26, id: 'f6lock1' },
    { type: 'geoshard', x: 16, y: 25, drain: P_([[13, 26]]), drainMessage: 'A beam of light cuts WEST — into the Triangle Hall!' },
    { type: 'encounter', x: 15, y: 28 },
    { type: 'gold', x: 20, y: 29 },
    // ── Geode Heart (secret) ──
    { type: 'chest', x: 23, y: 29, loot: { gold: 55 } },
    { type: 'gold', x: 24, y: 30 },
    // ── TRIANGLE hall: Great Helm sealed in crystal ──
    { type: 'mathdoor', x: 8, y: 19, id: 'f6lock2' },
    { type: 'geoshard', x: 8, y: 18, drain: P_([[8, 17], [8, 16], [8, 15], [8, 14]]), drainMessage: 'A beam fires NORTH through the rock — to the Square Gallery!' },
    { type: 'hero', x: 4, y: 26, id: 'hero-knight-greathelm', heroId: 'knight-greathelm', prison: 'crystal' },
    { type: 'encounter', x: 6, y: 24 },
    { type: 'encounter', x: 10, y: 22 },
    { type: 'chest', x: 12, y: 26, loot: { gold: 35 } },
    { type: 'potion', x: 3, y: 26 },
    // ── SQUARE gallery: Grand Mage sealed in crystal + Diamond Nook ──
    { type: 'mathdoor', x: 12, y: 10, id: 'f6lock3' },
    { type: 'geoshard', x: 9, y: 9, drain: P_([[14, 10], [15, 10], [16, 10], [17, 10], [18, 10], [19, 10], [20, 10], [21, 10]]), drainMessage: 'A LONG beam fires EAST — eight tiles to the Hexagon Vault!' },
    { type: 'hero', x: 7, y: 12, id: 'hero-wizard-grandmage', heroId: 'wizard-grandmage', prison: 'crystal' },
    { type: 'fountain', x: 7, y: 7, id: 'f6fount', uses: 3 },
    { type: 'encounter', x: 11, y: 12 },
    { type: 'chest', x: 3, y: 10, loot: { gold: 40 } },   // Diamond Nook (secret)
    { type: 'gold', x: 2, y: 9 },
    // ── HEXAGON vault: the final shard ──
    { type: 'mathdoor', x: 26, y: 13, id: 'f6lock4' },
    { type: 'geoshard', x: 26, y: 9 },   // FINAL shard → octagon transform
    { type: 'encounter', x: 24, y: 8 },
    { type: 'encounter', x: 28, y: 12 },
    { type: 'chest', x: 29, y: 9, loot: { gold: 45 } },
    { type: 'potion', x: 23, y: 12 },
    { type: 'gold', x: 24, y: 14 },
    // ── OCTAGON: The Prism ──
    { type: 'mathdoor', x: 26, y: 19, id: 'f6cagelock' },
    { type: 'encounter', x: 24, y: 24 },
    { type: 'boss', x: 26, y: 22, enemyId: 'theprism' },
    { type: 'golden', x: 25, y: 23 },
    { type: 'exit', x: 27, y: 23 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOOR 7 — COINFORD MARKET, "The Counterfeit Carnival" (Money)
//
// The Counterfeiter flooded Coinford with fake gold: the mint is
// locked, honest shops shuttered, the drawbridge to the Grand Bazaar
// raised. Recover the 3 REAL Gold Tokens — each reopens a mint lock
// and drains a canal crossing (south market → north quarter → bazaar
// strip → the drawbridge falls). DECEPTION mechanic: mimic gold
// piles (encounters disguised as gold) sit right next to real ones —
// verify before you trust. Richest loot floor in the game.
//
// Duchess, the royal auditor the Counterfeiter framed, is locked in
// the mint vault behind the biggest money-door — rescuing royalty is
// the floor's crown moment. Guide: Penny, the mint-keeper's daughter.
// Secrets: a smuggler alley across the great canal, a stall pocket.
// ════════════════════════════════════════════════════════════════
const FLOOR_7 = {
  id: 7,
  tiles: [
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFQQFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFQQFFFFFFW',
    'WFFPPPPPPPPPPPPPPPPPPPPPPPFQQFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFQQFFFFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFW',
    'WQQQQQQQQQQQQQQQQQQQQQQQQQQQQFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFQQFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFQQQQQQQQW',
    'WFFWWWWWWWFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFFWFFFFFWFFFWWFFFWWFFFFFFFFFFFFFFFW',
    'WFFWFFFFFWFFFWWFFFWWFFFFFFFFFFFFFFFW',
    'WFFWFFFFFFFPPPPPPPPPPPPPPPFFFFFFFFFW',
    'WFFWFFFFFWFFFWWFFFWWFFFFFFFFFFFFFFFW',
    'WFFWWWWWWWFFFWWFFFWWFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WQQQQQQQQQQQQQQQQQSQQQQQQQQQQQQQQQQW',
    'WQQQQQQQQQQQQQQQQQSQQQQQQQQQQQQQQQQW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFPFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFPFFFFFFFFFFFFFFFFFW',
    'WFFFFWWFFFFWWFFFFPFFFWWFFFFWWFFFFFFW',
    'WFFFFWWFFFFWWFFFFPFFFWWFFFFWWFFFFFFW',
    'WFFPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPFFW',
    'WFFFFFFFFFFFFFFFFPFFFFFFFFFFFFFFFFFW',
    'WFFFFWWFFFFWWFFFFPFFFWWFFFWSWWFFFFFW',
    'WFFFFWWFFFFWWFFFFPFFFWWFFFWFFWFFFFFW',
    'WFFFFFFFFFFFFFFFFPFFFFFFFFWWWWFFFFFW',
    'WFFFFFFFFFFFFFFFFPFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  startX: 17, startY: 26,
  objective: [
    { key: 'challenge', label: 'Recover the 3 REAL Gold Tokens — beware fake gold' },
    { key: 'transform', label: 'Lower the drawbridge to the Grand Bazaar' },
    { key: 'boss', label: 'Face The Counterfeiter' },
  ],
  transform: {
    message: 'The mint sings — the drawbridge falls! To the Grand Bazaar!',
    tiles: P_([[27, 3], [28, 3], [27, 4], [28, 4]]),
  },
  objects: [
    // ── South market: token 1 + mimics among real gold ──
    { type: 'mathdoor', x: 8, y: 22, id: 'f7lock1' },
    { type: 'token', x: 8, y: 21, drain: P_([[12, 17], [12, 18]]), drainMessage: 'A REAL token! A canal crossing drains to the north quarter!' },
    { type: 'encounter', x: 22, y: 25, disguise: 'gold' },   // mimic!
    { type: 'gold', x: 23, y: 26 },                          // ...next to real gold
    { type: 'encounter', x: 5, y: 21 },
    { type: 'encounter', x: 28, y: 25 },
    { type: 'gold', x: 3, y: 28 },
    { type: 'gold', x: 13, y: 21 },
    { type: 'potion', x: 32, y: 28 },
    { type: 'fountain', x: 30, y: 21, id: 'f7fount', uses: 3 },
    { type: 'chest', x: 28, y: 27, loot: { gold: 50 } },     // stall pocket (secret)
    // ── North quarter: token 2, the MINT, more mimics ──
    { type: 'mathdoor', x: 23, y: 12, id: 'f7lock2' },
    { type: 'token', x: 25, y: 12, drain: P_([[20, 5], [20, 6]]), drainMessage: 'Two of three! A crossing drains to the bazaar strip!' },
    { type: 'encounter', x: 15, y: 12, disguise: 'gold' },   // mimic!
    { type: 'gold', x: 16, y: 14 },
    { type: 'encounter', x: 31, y: 12 },
    { type: 'gold', x: 33, y: 15 },
    { type: 'potion', x: 2, y: 16 },
    // the mint vault: Duchess + the royal treasury
    { type: 'mathdoor', x: 9, y: 12, id: 'f7vault' },
    { type: 'hero', x: 5, y: 11, id: 'hero-bunny-duchess', heroId: 'bunny-duchess', prison: 'vault' },
    { type: 'chest', x: 7, y: 10, loot: { gold: 60 } },
    { type: 'gold', x: 4, y: 13 },
    { type: 'gold', x: 7, y: 13 },
    // ── Bazaar strip: token 3 (the FINAL) ──
    { type: 'mathdoor', x: 24, y: 3, id: 'f7lock3' },
    { type: 'token', x: 26, y: 3 },   // final token → drawbridge transform
    { type: 'encounter', x: 16, y: 3, disguise: 'gold' },    // mimic!
    { type: 'encounter', x: 10, y: 3 },
    { type: 'chest', x: 4, y: 2, loot: { gold: 45 } },
    { type: 'potion', x: 12, y: 2 },
    // ── Grand Bazaar: The Counterfeiter ──
    { type: 'mathdoor', x: 29, y: 4, id: 'f7cagelock' },
    { type: 'encounter', x: 30, y: 6 },
    { type: 'boss', x: 31, y: 4, enemyId: 'counterfeiter' },
    { type: 'golden', x: 30, y: 3 },
    { type: 'exit', x: 32, y: 3 },
  ],
};

// ════════════════════════════════════════════════════════════════
// FLOORS 8–9 — same contract, themed transformations:
//   2 Tidepool (−): close 3 drain valves → the tide DRAINS, sunken
//     causeway tiles Q→P reveal the route to the Pressure Chamber.
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
function makeStub(id, challengeType, bossId, heroes = []) {
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
      { type: 'mathdoor', x: 3, y: 3, id: `f${id}door1` },
      { type: 'encounter', x: 6, y: 2 },
      { type: 'encounter', x: 9, y: 9 },
      { type: 'encounter', x: 5, y: 6 },
      { type: 'encounter', x: 17, y: 8 },
      { type: 'chest', x: 17, y: 1, loot: { gold: 25 } },
      { type: 'fountain', x: 1, y: 1, id: `f${id}fountain1`, uses: 3 },
      { type: 'gold', x: 10, y: 1 },
      { type: 'gold', x: 6, y: 10 },
      { type: 'potion', x: 1, y: 8 },
      // trapped heroes (this floor's in-maze unlocks) at fixed free tiles
      ...heroes.map((h, i) => ({
        type: 'hero',
        x: i === 0 ? 12 : 8, y: i === 0 ? 1 : 10,
        id: `hero-${h.heroId}`, heroId: h.heroId, prison: h.prison,
      })),
      { type: 'boss', x: 17, y: 4, enemyId: bossId },
      { type: 'golden', x: 17, y: 3 },
      { type: 'exit', x: 17, y: 2 },
    ],
  };
}

FLOOR_STUBS[8] = makeStub(8, 'page', 'theparadox');
FLOOR_STUBS[9] = makeStub(9, 'fragment', 'theorem');

const LEVELS = { ...FLOOR_STUBS, 1: FLOOR_1, 2: FLOOR_2, 3: FLOOR_3, 4: FLOOR_4, 5: FLOOR_5, 6: FLOOR_6, 7: FLOOR_7 };

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
