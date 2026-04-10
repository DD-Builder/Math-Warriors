/**
 * Enemy roster — 25 enemies, 5 per floor
 *
 * Data-only module. Scenes read this to pick an appropriate enemy
 * for the current encounter.
 *
 * v0.2 scope: we only use Floor 1 enemies in the first playable battle.
 * Later floors exist in data but won't be instantiated until v0.3+.
 *
 * Enemy abilities are declared here by name only. Their implementation
 * lives in combat.js / BattleScene.js once we actually wire them up.
 * For v0.2 all abilities are inert — the enemy just attacks normally.
 */

/**
 * Helper: build an enemy record. Keeps the roster data compact.
 */
function mk(id, name, floor, maxHp, atk, def, ability, displayColor) {
  return {
    id,
    name,
    floor,
    maxHp,
    atk,
    def,
    ability,         // string name; resolved to behavior later
    sprite: `enemies/${id}`,
    displayColor,
  };
}

// ------------------------------------------------------------------
// FLOOR 1 — THE GARDEN (Addition)
// ------------------------------------------------------------------

export const FLOOR_1 = [
  mk('sproutling',   'Sproutling',    1, 16, 8,  3, 'sporulate',   0x3a8a20),
  mk('thornwall',    'Thornwall',     1, 22, 10, 6, 'accumulate',  0x1e5010),
  mk('blossomfiend', 'Blossom Fiend', 1, 18, 11, 4, 'sweet_add',   0xc02880),
  mk('puffshroom',   'Puffshroom',    1, 24, 9,  5, 'pressure',    0x7040c0),
  mk('briarking',    'Briar King',    1, 36, 14, 8, 'crown_tally', 0x1a3c10),
];

// ------------------------------------------------------------------
// FLOOR 2 — TIDEPOOL RUINS (Subtraction)
// ------------------------------------------------------------------

export const FLOOR_2 = [
  mk('drifter',     'Drifter',       2, 18, 10, 4, 'sting_drain',  0x1848a0),
  mk('gulper',      'Gulper',        2, 26, 12, 5, 'consume',      0x102840),
  mk('inkspitter',  'Inkspitter',    2, 20, 11, 5, 'ink_cloud',    0x081820),
  mk('abyssaleel',  'Abyssal Eel',   2, 28, 13, 6, 'drain_current',0x102848),
  mk('pressure',    'The Pressure',  2, 42, 16, 9, 'abs_reduction',0x08101c),
];

// ------------------------------------------------------------------
// FLOOR 3 — CLOUD MAZE (Multiplication)
// ------------------------------------------------------------------

export const FLOOR_3 = [
  mk('stormwing',   'Stormwing',     3, 22, 13, 5, 'thunder_mul',  0x284068),
  mk('hailshot',    'Hailshot',      3, 20, 12, 6, 'volley',       0x304858),
  mk('cycloneimp',  'Cyclone Imp',   3, 18, 14, 4, 'spin_up',      0x5060a0),
  mk('thunderclap', 'Thunderclap',   3, 28, 15, 7, 'clap_charge',  0x202840),
  mk('skywhale',    'Skywhale',      3, 48, 18, 10, 'mass_matters',0x384860),
];

// ------------------------------------------------------------------
// FLOOR 4 — EMBER CAVES (Division)
// ------------------------------------------------------------------

export const FLOOR_4 = [
  mk('cindercrab',  'Cindercrab',    4, 26, 15, 7, 'shell_split',  0x802010),
  mk('ashwalker',   'Ashwalker',     4, 28, 16, 6, 'ash_divide',   0x503020),
  mk('magmatoad',   'Magma Toad',    4, 30, 17, 7, 'split_tongue', 0xa03010),
  mk('spineshard',  'Spineshard',    4, 22, 18, 4, 'shard_volley', 0x601808),
  mk('pyroclast',   'Pyroclast',     4, 38, 20, 9, 'core_divide',  0x901808),
];

// ------------------------------------------------------------------
// FLOOR 5 — THE MENDING ROOM (All Operations)
// ------------------------------------------------------------------

export const FLOOR_5 = [
  mk('runebound',   'Runebound',     5, 32, 18, 10, 'op_shift',    0x281848),
  mk('hexweave',    'Hexweave',      5, 28, 20, 7,  'geo_lock',    0x381060),
  mk('grimoire',    'Grimoire',      5, 30, 19, 8,  'flip_page',   0x201040),
  mk('familiar',    'Familiar',      5, 24, 22, 6,  'phase_lock',  0x501878),
  mk('theorem',     'The Theorem',   5, 54, 24, 12, 'the_unknown', 0x100828),
];

// ------------------------------------------------------------------
// FLAT ARRAY + LOOKUP
// ------------------------------------------------------------------

export const ALL_ENEMIES = [...FLOOR_1, ...FLOOR_2, ...FLOOR_3, ...FLOOR_4, ...FLOOR_5];

/** Look up an enemy by id. */
export function getEnemyById(id) {
  return ALL_ENEMIES.find((e) => e.id === id) ?? null;
}

/** Get all enemies assigned to a given floor (1-5). */
export function getEnemiesForFloor(floor) {
  return ALL_ENEMIES.filter((e) => e.floor === floor);
}

/** Pick a random enemy for the given floor. */
export function pickEnemyForFloor(floor, rng = Math.random) {
  const pool = getEnemiesForFloor(floor);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Instantiate a combat-ready enemy from a definition. Starts at full HP,
 * safe to mutate.
 */
export function spawnEnemy(idOrEnemy) {
  const def = typeof idOrEnemy === 'string' ? getEnemyById(idOrEnemy) : idOrEnemy;
  if (!def) return null;
  return {
    id: def.id,
    name: def.name,
    floor: def.floor,
    sprite: def.sprite,
    displayColor: def.displayColor,
    maxHp: def.maxHp,
    hp: def.maxHp,
    atk: def.atk,
    def: def.def,
    ability: def.ability,
  };
}

/** Map floor → primary operator. Used to choose math questions. */
export const FLOOR_OPERATORS = {
  1: '+',
  2: '-',
  3: '*',
  4: '/',
  5: 'mixed',
};
