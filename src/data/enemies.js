/**
 * Enemy roster — 45 enemies, 5 per floor (9 floors)
 *
 * Data-only module. Scenes read this to pick an appropriate enemy
 * for the current encounter.
 *
 * HP is computed at spawn time from the player's grade so every
 * battle takes a consistent number of problems regardless of age:
 *   - mob: ~3-5 problems   - boss: ~10-12 problems
 *
 * Enemy abilities are declared here by name only. Implementations live
 * in systems/abilities.js; scenes trigger them via invokeAbility().
 *
 * THE ESCALATION CONTRACT (enforced by combatSim.test.js — read this
 * before touching a stat line):
 *   · every boss's atk, def and hp weight is STRICTLY greater than the
 *     boss on the floor below it;
 *   · each floor's mob roster beats the floor below it on average atk,
 *     def and hp weight;
 *   · the Theorem is the hardest fight in the game at every grade.
 * These held nowhere before v0.9.6: floor 9's mobs hit softer than
 * floor 8's (avg atk 19.8 vs 21.8) and the final boss was weaker than
 * the Paradox on every axis. That is the "bosses go downhill fast"
 * regression. Do not let the curve invert again.
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
  mk('sproutling',   'Sproutling',    1, 16, 11, 3, 'sporulate',   0x3a8a20),
  mk('thornwall',    'Thornwall',     1, 22, 12, 6, 'accumulate',  0x1e5010),
  mk('blossomfiend', 'Blossom Fiend', 1, 18, 13, 4, 'sweet_add',   0xc02880),
  mk('puffshroom',   'Puffshroom',    1, 24, 12, 5, 'pressure',    0x7040c0),
  mk('briarking',    'Briar King',    1, 36, 14, 8, 'crown_tally', 0x1a3c10),
];

// ------------------------------------------------------------------
// FLOOR 2 — TIDEPOOL RUINS (Subtraction)
// ------------------------------------------------------------------

export const FLOOR_2 = [
  mk('drifter',     'Drifter',       2, 18, 12, 4, 'sting_drain',  0x1848a0),
  mk('gulper',      'Gulper',        2, 26, 13, 5, 'consume',      0x102840),
  mk('inkspitter',  'Inkspitter',    2, 20, 12, 5, 'ink_cloud',    0x081820),
  mk('abyssaleel',  'Abyssal Eel',   2, 28, 14, 6, 'drain_current',0x102848),
  mk('pressure',    'The Pressure',  2, 42, 16, 9, 'abs_reduction',0x08101c),
];

// ------------------------------------------------------------------
// FLOOR 3 — CLOUD MAZE (Multiplication)
// ------------------------------------------------------------------

export const FLOOR_3 = [
  mk('stormwing',   'Stormwing',     3, 24, 13, 5, 'thunder_mul',  0x284068),
  mk('hailshot',    'Hailshot',      3, 22, 12, 6, 'volley',       0x304858),
  mk('cycloneimp',  'Cyclone Imp',   3, 20, 14, 4, 'spin_up',      0x5060a0),
  mk('thunderclap', 'Thunderclap',   3, 30, 15, 7, 'clap_charge',  0x202840),
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
  mk('pyroclast',   'Pyroclast',     4, 54, 20, 11, 'core_divide', 0x901808),
];

// ------------------------------------------------------------------
// FLOOR 5 — FROZEN PEAK (Fractions)
// ------------------------------------------------------------------

export const FLOOR_5 = [
  mk('frostbite',    'Frostbite',      5, 28, 17, 8,  'chill_snap',   0x60a8d8),
  mk('icicle',       'Icicle Imp',     5, 22, 18, 6,  'freeze_ray',   0x80c8e8),
  mk('snowdrift',    'Snowdrift',      5, 30, 16, 10, 'blizzard',     0xa0d0f0),
  mk('glacial',      'Glacial Golem',  5, 34, 18, 12, 'ice_armor',    0x4890b8),
  mk('absolutezero', 'Absolute Zero',  5, 60, 22, 13, 'deep_freeze',  0x2868a0),
];

// ------------------------------------------------------------------
// FLOOR 6 — CRYSTAL CAVERNS (Geometry)
// ------------------------------------------------------------------

export const FLOOR_6 = [
  mk('shard',      'Crystal Shard',   6, 30, 18, 9,  'refract',       0xc080f0),
  mk('geode',      'Geode',           6, 26, 20, 7,  'crystal_burst', 0xa060d0),
  mk('prismling',  'Prismling',       6, 24, 22, 6,  'light_split',   0xd0a0ff),
  mk('facet',      'Facet Guardian',  6, 36, 19, 15, 'mirror_shield', 0x8040c0),
  mk('theprism',   'The Prism',       6, 66, 24, 15, 'shape_shift',   0x6020a0),
];

// ------------------------------------------------------------------
// FLOOR 7 — MARKET SQUARE (Money)
// ------------------------------------------------------------------

export const FLOOR_7 = [
  mk('pickpocket',    'Pickpocket',        7, 30, 21, 8,  'steal_gold',  0xc0a060),
  mk('taxcollector',  'Tax Collector',     7, 34, 20, 11, 'levy',        0xa08040),
  mk('merchant',      'Rogue Merchant',    7, 28, 23, 7,  'price_hike',  0xd0b070),
  mk('banker',        'Corrupt Banker',    7, 36, 20, 15, 'interest',    0x806020),
  mk('counterfeiter', 'The Counterfeiter', 7, 72, 26, 17, 'fake_coins',  0x604010),
];

// ------------------------------------------------------------------
// FLOOR 8 — INFINITY LIBRARY (Word Problems)
// ------------------------------------------------------------------

export const FLOOR_8 = [
  mk('bookworm_e', 'Bookworm',       8, 34, 23, 10, 'page_turn',  0x604830),
  mk('inkblot',    'Inkblot',        8, 30, 24, 8,  'smudge',     0x1a1018),
  mk('riddler',    'The Riddler',    8, 32, 26, 9,  'riddle_me',  0x483828),
  mk('archivist',  'Dark Archivist', 8, 40, 23, 16, 'silence',    0x302018),
  mk('theparadox', 'The Paradox',    8, 78, 27, 19, 'reversal',   0x201010),
];

// ------------------------------------------------------------------
// FLOOR 9 — THE MENDING ROOM (Boss Gauntlet — All Operations)
// ------------------------------------------------------------------

export const FLOOR_9 = [
  mk('runebound',   'Runebound',     9, 40, 26, 13, 'op_shift',    0x281848),
  mk('hexweave',    'Hexweave',      9, 34, 27, 10, 'geo_lock',    0x381060),
  mk('grimoire',    'Grimoire',      9, 36, 25, 12, 'flip_page',   0x201040),
  mk('familiar',    'Familiar',      9, 30, 29, 9,  'phase_lock',  0x501878),
  mk('theorem',     'The Theorem',   9, 92, 33, 23, 'the_unknown', 0x100828),
];

// ------------------------------------------------------------------
// FLAT ARRAY + LOOKUP
// ------------------------------------------------------------------

export const ALL_ENEMIES = [...FLOOR_1, ...FLOOR_2, ...FLOOR_3, ...FLOOR_4, ...FLOOR_5, ...FLOOR_6, ...FLOOR_7, ...FLOOR_8, ...FLOOR_9];

/** Look up an enemy by id. */
export function getEnemyById(id) {
  return ALL_ENEMIES.find((e) => e.id === id) ?? null;
}

/** Get all enemies assigned to a given floor (1-9). */
export function getEnemiesForFloor(floor) {
  return ALL_ENEMIES.filter((e) => e.floor === floor);
}

/** Pick a random NON-BOSS enemy for the given floor. */
export const BOSS_IDS = ['briarking', 'pressure', 'skywhale', 'pyroclast', 'absolutezero', 'theprism', 'counterfeiter', 'theparadox', 'theorem'];
export function pickEnemyForFloor(floor, rng = Math.random) {
  const pool = getEnemiesForFloor(floor).filter(e => !BOSS_IDS.includes(e.id));
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
  // Damage is stats-based (4 + atk*1.2 - def*0.3), so HP is anchored
  // to the damage a typical party deals per correct answer — NOT the
  // math answer magnitude. A typical lead hero runs ATK ≈ 16 + grade
  // (base stats plus expected level pacing per grade tier).
  const heroAtk = 16 + grade;
  const avgHit = Math.max(8, Math.round(4 + heroAtk * 1.2 - (def.def || 0) * 0.3));

  // Target battle length in correct answers, tuned per grade so young
  // kids (slow readers) get short fights and older kids get meatier ones.
  const problemsTarget = isBoss
    ? (grade <= 1 ? 10 : grade <= 3 ? 14 : 18)
    : (grade <= 1 ? 4 : 5);

  // Relative difficulty within floor: use the original maxHp as a
  // weight against the floor's median original maxHp. Gives variety
  // (tanks vs glass cannons) without letting absolute values drift.
  // Bosses escalate by floor instead — the Theorem must feel bigger
  // than the Briar King, not identical.
  const floorPool = ALL_ENEMIES.filter((e) => e.floor === def.floor && !isLegacyBoss(e));
  const medianOriginalHp = median(floorPool.map((e) => e.maxHp)) || def.maxHp;
  const weight = isBoss
    ? bossFloorWeight(def.floor || 1)
    : clamp(def.maxHp / medianOriginalHp, 0.75, 1.4);

  const hp = Math.round(avgHit * problemsTarget * weight);
  const minMob = isBoss ? Math.max(80, 40 + grade * 15) : 12;
  return Math.max(minMob, hp);
}

/** The last floor. Its boss is the game's climax and is weighted as such. */
export const FINAL_FLOOR = 9;

/**
 * Boss HP multiplier by floor.
 *
 * Bosses ignore the within-floor median weighting that mobs use and
 * scale purely on depth, so a boss fight always runs long enough to
 * show all three of its phases. The linear ramp (×1.00 at floor 1 →
 * ×1.44 at floor 9) is topped with a deliberate CROWN BONUS on the
 * final floor: without it the Theorem simulated as an easier fight
 * than the Paradox at several grades, which is exactly the "bosses go
 * downhill" regression this pass exists to kill.
 */
export function bossFloorWeight(floor) {
  const base = 1 + (Math.max(1, floor) - 1) * 0.055;
  return floor === FINAL_FLOOR ? base + 0.12 : base;
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
  return BOSS_IDS.includes(e.id);
}

/** Map floor → primary operator. Used to choose math questions.
 *  The math IS each floor's theme: geometry lives in the Crystal
 *  Caverns (geo shards, shapes), money in the Market, fractions in
 *  the Library (torn pages — fractions of a whole story). */
export const FLOOR_OPERATORS = {
  1: '+',
  2: '-',
  3: '*',
  4: '/',
  5: 'mixed',
  6: 'geo',
  7: 'money',
  8: 'frac',
  9: 'word',
};
