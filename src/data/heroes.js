/**
 * Hero roster — the 15 playable characters.
 *
 * Data-only module. Scenes read this to build the party select screen
 * and to instantiate combat-ready heroes. Each class has its own base
 * stats; individual heroes tweak those bases by +/- a couple points so
 * every hero in a class feels distinct.
 */

const CLASS_BASE = {
  knight: { maxHp: 50, atk: 14, def: 14 },
  wizard: { maxHp: 40, atk: 18, def: 8  },
  bunny:  { maxHp: 45, atk: 16, def: 10 },
};

function make(id, name, className, trait, tweak = {}) {
  const base = CLASS_BASE[className];
  return {
    id,
    name,
    class: className,
    trait,
    maxHp: base.maxHp + (tweak.maxHp ?? 0),
    atk:   base.atk   + (tweak.atk   ?? 0),
    def:   base.def   + (tweak.def   ?? 0),
    sprite: `heroes/${id}`,
    displayColor: HERO_COLORS[className],
  };
}

const HERO_COLORS = {
  knight: 0x2e4e88,  // cobalt
  wizard: 0x5a1878,  // plum
  bunny:  0xc02860,  // rose
};

// ------------------------------------------------------------------
// KNIGHTS — melee tanks, high HP and defense
// ------------------------------------------------------------------

export const KNIGHTS = [
  make('knight-shadow',   'Shadow',     'knight', 'Unseen. Unstoppable.',             { atk: 2, def: -1 }),
  make('knight-crusader', 'Crusader',   'knight', 'Holy. Righteous. Relentless.',     { def: 2, maxHp: -3 }),
  make('knight-paladin',  'Paladin',    'knight', 'Light in darkness. Grace in battle.', { maxHp: 3 }),
  make('knight-berserker','Berserker',  'knight', 'Pure fury. Zero chill.',            { atk: 3, def: -3 }),
  make('knight-greathelm','Great Helm', 'knight', 'Noble. Steadfast. Legendary.',     { def: 3 }),
];

// ------------------------------------------------------------------
// WIZARDS — ranged casters, high attack, low defense
// ------------------------------------------------------------------

export const WIZARDS = [
  make('wizard-stargazer',  'Stargazer', 'wizard', 'The cosmos bends to her will.',   { atk: 2 }),
  make('wizard-toadstool',  'Toadstool', 'wizard', 'Brews chaos. Serves it hot.',    { atk: 1, def: 1 }),
  make('wizard-spellblade', 'Spellblade','wizard', 'Magic fists. Still counts.',     { def: 3, atk: -1 }),
  make('wizard-bookworm',   'Bookworm',  'wizard', 'Knows every spell. Uses them all.', { maxHp: 3 }),
  make('wizard-grandmage',  'Grand Mage','wizard', 'Ancient power. Zero patience.',  { atk: 3, maxHp: -3 }),
];

// ------------------------------------------------------------------
// BATTLE BUNNIES — fast melee, balanced
// ------------------------------------------------------------------

export const BUNNIES = [
  make('bunny-pepper',   'Pepper',   'bunny', 'Tiny. Fast. Absolutely feral.',           { atk: 3, def: -2 }),
  make('bunny-nova',     'Nova',     'bunny', 'She sparkles. Then she wins.',            { atk: 2, maxHp: -2 }),
  make('bunny-boulder',  'Boulder',  'bunny', 'Heaviest punch in the kingdom.',          { atk: -1, def: 3, maxHp: 3 }),
  make('bunny-blaze',    'Blaze',    'bunny', 'Fire magic. Fire attitude.',              { atk: 2 }),
  make('bunny-duchess',  'Duchess',  'bunny', 'Royal blood. Royal fury.',                { def: 2, maxHp: 2 }),
];

// ------------------------------------------------------------------
// FLAT ARRAY + LOOKUP
// ------------------------------------------------------------------

export const ALL_HEROES = [...KNIGHTS, ...WIZARDS, ...BUNNIES];

/** Look up a hero by id. Returns null if not found. */
export function getHeroById(id) {
  return ALL_HEROES.find((h) => h.id === id) ?? null;
}

/**
 * Create a combat-ready hero instance from a hero definition.
 * Starts at full HP. Safe to mutate — it's a fresh object.
 */
export function spawnHero(idOrHero) {
  const def = typeof idOrHero === 'string' ? getHeroById(idOrHero) : idOrHero;
  if (!def) return null;
  return {
    id: def.id,
    name: def.name,
    class: def.class,
    trait: def.trait,
    sprite: def.sprite,
    displayColor: def.displayColor,
    maxHp: def.maxHp,
    hp: def.maxHp,
    atk: def.atk,
    def: def.def,
  };
}

// XP thresholds per level. Index = level (1-based), value = total XP needed.
const LEVEL_THRESHOLDS = [0, 0, 100, 250, 500, 800, 1200, 1800, 2600, 3600, 5000];

/**
 * Compute the stat bonuses for a given level.
 * Each level above 1 grants +3 maxHp, +1 atk, +1 def.
 */
export function levelBonuses(level) {
  const lvl = Math.max(1, level || 1);
  return {
    maxHp: (lvl - 1) * 3,
    atk: (lvl - 1),
    def: (lvl - 1),
  };
}

/**
 * Check if a hero's XP qualifies for a level up.
 * Returns the new level (may be same as current if no level up).
 */
export function computeLevel(xp) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i; break; }
  }
  return level;
}

/**
 * XP needed to reach the next level from current level.
 */
export function xpToNextLevel(level) {
  const next = Math.min(level + 1, LEVEL_THRESHOLDS.length - 1);
  return LEVEL_THRESHOLDS[next] || 9999;
}
