/**
 * Enemy roster — 25 enemies, 5 per floor
 *
 * Data-only module. Scenes read this to pick an appropriate enemy
 * for the current encounter.
 *
 * HP is computed at spawn time from the player's grade so every
 * battle takes a consistent number of problems regardless of age:
 *   - mob: ~3-5 problems   - boss: ~10-12 problems
 *
 * Enemy abilities are declared here by name only. Their implementation
 * lives in combat.js / BattleScene.js once we actually wire them up.
 * For v0.2 all abilities are inert — the enemy just attacks normally.
 */

import { expectedAnswer } from '../systems/math.js';

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
 *
 * HP is now calculated from the expected math-answer damage for the
 * player's grade so every battle takes a consistent number of correct
 * answers regardless of grade level:
 *   - mob enemies:  ~3-5 problems to defeat  (HP ≈ 4 * avgAnswer)
 *   - boss enemies: ~10-12 problems to defeat (HP ≈ 12 * avgAnswer)
 *
 * The per-enemy base maxHp in the roster is kept as a *relative*
 * difficulty weight inside its floor (tanky vs. fragile) — we normalize
 * it against the floor's median and apply a small +/- 20% variance.
 *
 * @param {string|object} idOrEnemy
 * @param {object} [opts]
 * @param {number} [opts.grade]  Player's grade (0-5). Defaults to 3.
 * @param {boolean} [opts.isBoss] True for boss fights.
 */
export function spawnEnemy(idOrEnemy, opts = {}) {
  const def = typeof idOrEnemy === 'string' ? getEnemyById(idOrEnemy) : idOrEnemy;
  if (!def) return null;

  const grade = opts.grade ?? 3;
  const isBoss = opts.isBoss ?? false;
  const maxHp = computeEnemyHp(def, grade, isBoss);

  return {
    id: def.id,
    name: def.name,
    floor: def.floor,
    sprite: def.sprite,
    displayColor: def.displayColor,
    maxHp,
    hp: maxHp,
    atk: def.atk,
    def: def.def,
    ability: def.ability,
    isBoss,
  };
}

/**
 * Pick HP for this enemy so the battle takes the intended number of
 * correct answers. Pulled out for unit testing.
 */
export function computeEnemyHp(def, grade, isBoss) {
  const op = FLOOR_OPERATORS[def.floor] || '+';
  const avg = Math.max(1, expectedAnswer(op, grade));

  // Base target in "problems to defeat"
  const problemsTarget = isBoss ? 12 : 4;

  // Relative difficulty within floor: use the original maxHp as a
  // weight against the floor's median original maxHp. Gives variety
  // (tanks vs glass cannons) without letting absolute values drift.
  const floorPool = ALL_ENEMIES.filter((e) => e.floor === def.floor && !isLegacyBoss(e));
  const medianOriginalHp = median(floorPool.map((e) => e.maxHp)) || def.maxHp;
  const weight = isBoss ? 1 : clamp(def.maxHp / medianOriginalHp, 0.75, 1.4);

  const hp = Math.round(avg * problemsTarget * weight);
  // Floor at a minimum that still takes at least a couple problems even
  // when the expected answer is tiny (K-grade subtraction avg ~2).
  const minMob = isBoss ? 40 : 12;
  return Math.max(minMob, hp);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Detect which enemy in each floor is the "boss" by hand-authored HP
// outlier. Used only to exclude the boss from the mob median.
function isLegacyBoss(e) {
  return ['briarking', 'pressure', 'skywhale', 'pyroclast', 'theorem'].includes(e.id);
}

/** Map floor → primary operator. Used to choose math questions. */
export const FLOOR_OPERATORS = {
  1: '+',
  2: '-',
  3: '*',
  4: '/',
  5: 'mixed',
};
