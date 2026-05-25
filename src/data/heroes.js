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

function make(id, name, className, trait, tweak = {}, unlockedAtFloor = 0, superMoves = []) {
  const base = CLASS_BASE[className];
  const rarity = unlockedAtFloor >= 5 ? 'legendary' : unlockedAtFloor >= 3 ? 'epic' : unlockedAtFloor >= 1 ? 'rare' : 'common';
  return {
    id,
    name,
    class: className,
    trait,
    rarity,
    maxHp: base.maxHp + (tweak.maxHp ?? 0),
    atk:   base.atk   + (tweak.atk   ?? 0),
    def:   base.def   + (tweak.def   ?? 0),
    sprite: `heroes/${id}`,
    displayColor: HERO_COLORS[className],
    unlockedAtFloor,
    superMoves,
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
  make('knight-shadow',   'Shadow',     'knight', 'Unseen. Unstoppable.',             { atk: 2, def: -1 }, 0, [
    { name: 'Shadow Strike', type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Dark Cleave',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Void Slash',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('knight-crusader', 'Crusader',   'knight', 'Holy. Righteous. Relentless.',     { def: 2, maxHp: -3 }, 1, [
    { name: 'Holy Slam',       type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Radiant Smash',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Divine Judgment',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('knight-paladin',  'Paladin',    'knight', 'Light in darkness. Grace in battle.', { maxHp: 3 }, 3, [
    { name: 'Shield Bash',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Guardian Rush',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Light Nova',     type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('knight-berserker','Berserker',  'knight', 'Pure fury. Zero chill.',            { atk: 3, def: -3 }, 4, [
    { name: 'Rage Blow',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Fury Storm',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Chaos Rend',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('knight-greathelm','Great Helm', 'knight', 'Noble. Steadfast. Legendary.',     { def: 3 }, 6, [
    { name: 'Iron Wall',     type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Steel Crush',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Titan Strike',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
];

// ------------------------------------------------------------------
// WIZARDS — ranged casters, high attack, low defense
// ------------------------------------------------------------------

export const WIZARDS = [
  make('wizard-stargazer',  'Stargazer', 'wizard', 'The cosmos bends to her will.',   { atk: 2 }, 0, [
    { name: 'Star Burst',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Cosmic Ray',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Galaxy Blast',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('wizard-toadstool',  'Toadstool', 'wizard', 'Brews chaos. Serves it hot.',    { atk: 1, def: 1 }, 1, [
    { name: 'Spore Cloud',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Mushroom Bomb',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Toxic Nova',     type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('wizard-spellblade', 'Spellblade','wizard', 'Magic fists. Still counts.',     { def: 3, atk: -1 }, 2, [
    { name: 'Magic Fist',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Arcane Slash',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Ether Blade',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('wizard-bookworm',   'Bookworm',  'wizard', 'Knows every spell. Uses them all.', { maxHp: 3 }, 4, [
    { name: 'Ink Splash',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Page Storm',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Knowledge Blast',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('wizard-grandmage',  'Grand Mage','wizard', 'Ancient power. Zero patience.',  { atk: 3, maxHp: -3 }, 6, [
    { name: 'Fire Bolt',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Thunder Wave',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Meteor Rain',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
];

// ------------------------------------------------------------------
// BATTLE BUNNIES — fast melee, balanced
// ------------------------------------------------------------------

export const BUNNIES = [
  make('bunny-pepper',   'Pepper',   'bunny', 'Tiny. Fast. Absolutely feral.',           { atk: 3, def: -2 }, 0, [
    { name: 'Pepper Dash',     type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Spicy Rush',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Inferno Sprint',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('bunny-nova',     'Nova',     'bunny', 'She sparkles. Then she wins.',            { atk: 2, maxHp: -2 }, 2, [
    { name: 'Spark Jump',  type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Flash Leap',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Nova Burst',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('bunny-boulder',  'Boulder',  'bunny', 'Heaviest punch in the kingdom.',          { atk: -1, def: 3, maxHp: 3 }, 3, [
    { name: 'Rock Toss',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Quake Slam',     type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Mountain Drop',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('bunny-blaze',    'Blaze',    'bunny', 'Fire magic. Fire attitude.',              { atk: 2 }, 5, [
    { name: 'Flame Hop',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Fire Dance',     type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Blaze Tornado',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
  make('bunny-duchess',  'Duchess',  'bunny', 'Royal blood. Royal fury.',                { def: 2, maxHp: 2 }, 7, [
    { name: 'Royal Strike',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Crown Slam',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Sovereign Fury',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ]),
];

// ------------------------------------------------------------------
// FLAT ARRAY + LOOKUP
// ------------------------------------------------------------------

export const ALL_HEROES = [...KNIGHTS, ...WIZARDS, ...BUNNIES];

/** Look up a hero by id. Returns null if not found. */
export function getHeroById(id) {
  return ALL_HEROES.find((h) => h.id === id) ?? null;
}

/** Return the super moves available to a hero at the given level. */
export function getAvailableSupers(heroId, level) {
  const hero = getHeroById(heroId);
  if (!hero) return [];
  return hero.superMoves.filter((m) => level >= m.unlockLevel);
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
const LEVEL_THRESHOLDS = [0, 0, 80, 180, 320, 500, 750, 1050, 1400, 1850, 2400];

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

const RARITY_COLORS = {
  common:    { glow: 0xa0a0a0, label: '#b0b0b0', border: 0x909090 },
  rare:      { glow: 0x4488e0, label: '#60a0f0', border: 0x3070c0 },
  epic:      { glow: 0xa040d0, label: '#c060f0', border: 0x8030b0 },
  legendary: { glow: 0xf0c040, label: '#f0d060', border: 0xd0a020 },
};

export function getRarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.common;
}

export function getRarityLabel(rarity) {
  return (rarity || 'common').toUpperCase();
}

const HERO_SKINS = {
  'knight-shadow':    [{ id: 'default', name: 'Shadow' }, { id: 'golden', name: 'Golden Shadow', cost: 150 }, { id: 'crimson', name: 'Crimson Shadow', cost: 200 }],
  'wizard-stargazer': [{ id: 'default', name: 'Stargazer' }, { id: 'nebula', name: 'Nebula', cost: 150 }, { id: 'eclipse', name: 'Eclipse', cost: 200 }],
  'bunny-pepper':     [{ id: 'default', name: 'Pepper' }, { id: 'frost', name: 'Frost Pepper', cost: 150 }, { id: 'blaze', name: 'Blaze Pepper', cost: 200 }],
  'knight-crusader':  [{ id: 'default', name: 'Crusader' }, { id: 'dark', name: 'Dark Crusader', cost: 200 }],
  'wizard-toadstool': [{ id: 'default', name: 'Toadstool' }, { id: 'toxic', name: 'Toxic Bloom', cost: 200 }],
  'bunny-nova':       [{ id: 'default', name: 'Nova' }, { id: 'stellar', name: 'Stellar Nova', cost: 200 }],
  'knight-paladin':   [{ id: 'default', name: 'Paladin' }, { id: 'radiant', name: 'Radiant Paladin', cost: 250 }],
  'bunny-boulder':    [{ id: 'default', name: 'Boulder' }, { id: 'crystal', name: 'Crystal Boulder', cost: 250 }],
  'knight-berserker': [{ id: 'default', name: 'Berserker' }, { id: 'bloodrage', name: 'Blood Rage', cost: 300 }],
  'wizard-bookworm':  [{ id: 'default', name: 'Bookworm' }, { id: 'arcane', name: 'Arcane Scholar', cost: 300 }],
  'bunny-blaze':      [{ id: 'default', name: 'Blaze' }, { id: 'inferno', name: 'Inferno Blaze', cost: 350 }],
  'knight-greathelm': [{ id: 'default', name: 'Great Helm' }, { id: 'titan', name: 'Titan Helm', cost: 400 }],
  'wizard-grandmage': [{ id: 'default', name: 'Grand Mage' }, { id: 'archmage', name: 'Archmage', cost: 400 }],
  'bunny-duchess':    [{ id: 'default', name: 'Duchess' }, { id: 'empress', name: 'Empress', cost: 400 }],
  'wizard-spellblade':[{ id: 'default', name: 'Spellblade' }, { id: 'void', name: 'Void Blade', cost: 250 }],
};

export function getHeroSkins(heroId) {
  return HERO_SKINS[heroId] || [{ id: 'default', name: 'Default', cost: 0 }];
}

