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
export const LEVEL_THRESHOLDS = [0, 0, 80, 180, 320, 500, 750, 1050, 1400, 1850, 2400];

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

// ------------------------------------------------------------------
// HERO EVOLUTIONS — stage progression data per hero
// ------------------------------------------------------------------
// Each hero can evolve through 3 stages:
//   Stage 1: Starting form (default)
//   Stage 2: Warrior form (requires level + floor beaten)
//   Stage 3: Master form (requires level + math domain mastery, branching choice)

export const HERO_EVOLUTIONS = {
  // --- KNIGHTS ---
  'knight-shadow': {
    stage2: { level: 5, floor: 3, name: 'Shadow Knight', title: 'Blade of Dusk', statBoosts: { atk: 2, def: 1, maxHp: 5 }, superMove: { name: 'Umbral Edge', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'shadow-assassin', name: 'Shadow Assassin', title: 'Phantom of the Abyss', level: 8, mastery: '*', statBoosts: { atk: 4, def: 1, maxHp: 5 }, superMove: { name: 'Phantom Blade', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'shadow-guardian', name: 'Shadow Guardian', title: 'Shield of Night', level: 8, mastery: '-', statBoosts: { atk: 2, def: 3, maxHp: 10 }, superMove: { name: 'Night Barrier', type: 'damage', multiplier: 3.2, unlockLevel: 8 } },
    ] },
  },
  'knight-crusader': {
    stage2: { level: 5, floor: 3, name: 'Holy Crusader', title: 'Champion of Light', statBoosts: { atk: 1, def: 2, maxHp: 5 }, superMove: { name: 'Sacred Charge', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'crusader-templar', name: 'Templar', title: 'Wrath of Heaven', level: 8, mastery: '+', statBoosts: { atk: 3, def: 2, maxHp: 8 }, superMove: { name: 'Holy Wrath', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'crusader-saint', name: 'Saint', title: 'Healer of Realms', level: 8, mastery: '-', statBoosts: { atk: 1, def: 4, maxHp: 12 }, superMove: { name: 'Blessed Light', type: 'damage', multiplier: 3.2, unlockLevel: 8 } },
    ] },
  },
  'knight-paladin': {
    stage2: { level: 5, floor: 4, name: 'Radiant Paladin', title: 'Light Incarnate', statBoosts: { atk: 1, def: 2, maxHp: 8 }, superMove: { name: 'Radiant Shield', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'paladin-sunlord', name: 'Sun Lord', title: 'Dawn Bringer', level: 8, mastery: 'geo', statBoosts: { atk: 3, def: 3, maxHp: 8 }, superMove: { name: 'Solar Flare', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'paladin-aegis', name: 'Aegis', title: 'The Unbreakable', level: 8, mastery: '+', statBoosts: { atk: 1, def: 5, maxHp: 15 }, superMove: { name: 'Aegis Wall', type: 'damage', multiplier: 3.0, unlockLevel: 8 } },
    ] },
  },
  'knight-berserker': {
    stage2: { level: 5, floor: 5, name: 'War Berserker', title: 'Fury Incarnate', statBoosts: { atk: 3, def: 0, maxHp: 5 }, superMove: { name: 'Blood Frenzy', type: 'damage', multiplier: 3.0, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'berserker-warlord', name: 'Warlord', title: 'The Unstoppable', level: 8, mastery: '*', statBoosts: { atk: 5, def: 1, maxHp: 5 }, superMove: { name: 'Rampage', type: 'damage', multiplier: 3.8, unlockLevel: 8 } },
      { id: 'berserker-ravager', name: 'Ravager', title: 'Storm of Steel', level: 8, mastery: '/', statBoosts: { atk: 4, def: 2, maxHp: 8 }, superMove: { name: 'Devastation', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
  'knight-greathelm': {
    stage2: { level: 5, floor: 7, name: 'Grand Champion', title: 'Living Fortress', statBoosts: { atk: 1, def: 3, maxHp: 10 }, superMove: { name: 'Fortress Slam', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'greathelm-emperor', name: 'Emperor', title: 'Ruler of Steel', level: 8, mastery: 'money', statBoosts: { atk: 2, def: 5, maxHp: 15 }, superMove: { name: 'Imperial Decree', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'greathelm-colossus', name: 'Colossus', title: 'The Immovable', level: 8, mastery: 'geo', statBoosts: { atk: 3, def: 4, maxHp: 12 }, superMove: { name: 'Tectonic Crash', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },

  // --- WIZARDS ---
  'wizard-stargazer': {
    stage2: { level: 5, floor: 3, name: 'Star Seer', title: 'Reader of Fates', statBoosts: { atk: 3, def: 0, maxHp: 5 }, superMove: { name: 'Constellation Beam', type: 'damage', multiplier: 3.0, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'constellation-mage', name: 'Constellation Mage', title: 'Weaver of Stars', level: 8, mastery: '*', statBoosts: { atk: 5, def: 1, maxHp: 5 }, superMove: { name: 'Zodiac Storm', type: 'damage', multiplier: 3.8, unlockLevel: 8 } },
      { id: 'nebula-witch', name: 'Nebula Witch', title: 'Mistress of Void', level: 8, mastery: 'frac', statBoosts: { atk: 4, def: 2, maxHp: 8 }, superMove: { name: 'Nebula Vortex', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
  'wizard-toadstool': {
    stage2: { level: 5, floor: 3, name: 'Fungal Witch', title: 'Mistress of Spores', statBoosts: { atk: 2, def: 1, maxHp: 5 }, superMove: { name: 'Plague Cloud', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'toadstool-blight', name: 'Blight Queen', title: 'Rot Incarnate', level: 8, mastery: '-', statBoosts: { atk: 4, def: 2, maxHp: 8 }, superMove: { name: 'Pandemic', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'toadstool-bloom', name: 'Bloom Sage', title: 'Garden of Power', level: 8, mastery: '+', statBoosts: { atk: 3, def: 2, maxHp: 10 }, superMove: { name: 'Life Bloom', type: 'damage', multiplier: 3.2, unlockLevel: 8 } },
    ] },
  },
  'wizard-spellblade': {
    stage2: { level: 5, floor: 4, name: 'Arcane Knight', title: 'Sword and Sorcery', statBoosts: { atk: 2, def: 2, maxHp: 5 }, superMove: { name: 'Arcane Rush', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'spellblade-runic', name: 'Rune Lord', title: 'Master of Glyphs', level: 8, mastery: 'word', statBoosts: { atk: 4, def: 2, maxHp: 5 }, superMove: { name: 'Rune Barrage', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'spellblade-warder', name: 'Spell Warder', title: 'Arcane Fortress', level: 8, mastery: '/', statBoosts: { atk: 2, def: 4, maxHp: 10 }, superMove: { name: 'Ward Storm', type: 'damage', multiplier: 3.2, unlockLevel: 8 } },
    ] },
  },
  'wizard-bookworm': {
    stage2: { level: 5, floor: 5, name: 'Lore Master', title: 'Walking Library', statBoosts: { atk: 2, def: 1, maxHp: 8 }, superMove: { name: 'Tome Barrage', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'bookworm-archivist', name: 'Grand Archivist', title: 'Keeper of All Knowledge', level: 8, mastery: 'word', statBoosts: { atk: 4, def: 2, maxHp: 10 }, superMove: { name: 'Forbidden Text', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'bookworm-scribe', name: 'Fate Scribe', title: 'Writer of Destiny', level: 8, mastery: 'frac', statBoosts: { atk: 3, def: 3, maxHp: 8 }, superMove: { name: 'Rewrite Reality', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
  'wizard-grandmage': {
    stage2: { level: 5, floor: 7, name: 'Archmage', title: 'Supreme Sorcerer', statBoosts: { atk: 3, def: 1, maxHp: 5 }, superMove: { name: 'Elemental Storm', type: 'damage', multiplier: 3.0, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'grandmage-elder', name: 'Elder Sage', title: 'Timeless One', level: 8, mastery: '*', statBoosts: { atk: 5, def: 2, maxHp: 8 }, superMove: { name: 'Time Rift', type: 'damage', multiplier: 3.8, unlockLevel: 8 } },
      { id: 'grandmage-chaos', name: 'Chaos Mage', title: 'Master of Entropy', level: 8, mastery: '/', statBoosts: { atk: 6, def: 0, maxHp: 5 }, superMove: { name: 'Chaos Nova', type: 'damage', multiplier: 4.0, unlockLevel: 8 } },
    ] },
  },

  // --- BUNNIES ---
  'bunny-pepper': {
    stage2: { level: 5, floor: 3, name: 'Pepper Knight', title: 'Spicy Warrior', statBoosts: { atk: 3, def: 0, maxHp: 5 }, superMove: { name: 'Chili Rush', type: 'damage', multiplier: 3.0, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'pepper-inferno', name: 'Inferno Pepper', title: 'Blazing Fury', level: 8, mastery: '+', statBoosts: { atk: 5, def: 0, maxHp: 5 }, superMove: { name: 'Pepper Firestorm', type: 'damage', multiplier: 3.8, unlockLevel: 8 } },
      { id: 'pepper-ghost', name: 'Ghost Pepper', title: 'Unseen Heat', level: 8, mastery: '-', statBoosts: { atk: 4, def: 2, maxHp: 8 }, superMove: { name: 'Ghost Dash', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
  'bunny-nova': {
    stage2: { level: 5, floor: 4, name: 'Supernova', title: 'Dazzling Force', statBoosts: { atk: 2, def: 1, maxHp: 5 }, superMove: { name: 'Photon Burst', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'nova-pulsar', name: 'Pulsar', title: 'Heartbeat of Stars', level: 8, mastery: '*', statBoosts: { atk: 4, def: 1, maxHp: 5 }, superMove: { name: 'Pulsar Wave', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'nova-quasar', name: 'Quasar', title: 'Cosmic Engine', level: 8, mastery: 'frac', statBoosts: { atk: 3, def: 2, maxHp: 10 }, superMove: { name: 'Quasar Beam', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
  'bunny-boulder': {
    stage2: { level: 5, floor: 4, name: 'Granite Boulder', title: 'Living Mountain', statBoosts: { atk: 0, def: 3, maxHp: 10 }, superMove: { name: 'Earthquake', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'boulder-titan', name: 'Titan Boulder', title: 'World Shaker', level: 8, mastery: 'geo', statBoosts: { atk: 2, def: 4, maxHp: 15 }, superMove: { name: 'Continental Crush', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'boulder-diamond', name: 'Diamond Boulder', title: 'Unbreakable', level: 8, mastery: '*', statBoosts: { atk: 1, def: 5, maxHp: 12 }, superMove: { name: 'Diamond Storm', type: 'damage', multiplier: 3.2, unlockLevel: 8 } },
    ] },
  },
  'bunny-blaze': {
    stage2: { level: 5, floor: 6, name: 'Flame Dancer', title: 'Fire Spirit', statBoosts: { atk: 3, def: 0, maxHp: 5 }, superMove: { name: 'Fire Waltz', type: 'damage', multiplier: 3.0, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'blaze-phoenix', name: 'Phoenix Blaze', title: 'Rebirth in Flames', level: 8, mastery: '+', statBoosts: { atk: 4, def: 1, maxHp: 10 }, superMove: { name: 'Phoenix Rise', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'blaze-dragon', name: 'Dragon Blaze', title: 'Dragonheart', level: 8, mastery: '/', statBoosts: { atk: 5, def: 1, maxHp: 5 }, superMove: { name: 'Dragon Breath', type: 'damage', multiplier: 3.8, unlockLevel: 8 } },
    ] },
  },
  'bunny-duchess': {
    stage2: { level: 5, floor: 8, name: 'Grand Duchess', title: 'Royal Commander', statBoosts: { atk: 1, def: 2, maxHp: 8 }, superMove: { name: 'Royal Decree', type: 'damage', multiplier: 2.8, unlockLevel: 5 } },
    stage3: { paths: [
      { id: 'duchess-empress', name: 'Empress', title: 'Ruler of All', level: 8, mastery: 'money', statBoosts: { atk: 3, def: 3, maxHp: 12 }, superMove: { name: 'Imperial Wrath', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
      { id: 'duchess-queen', name: 'Warrior Queen', title: 'Crown of Thorns', level: 8, mastery: 'word', statBoosts: { atk: 4, def: 2, maxHp: 10 }, superMove: { name: 'Queens Gambit', type: 'damage', multiplier: 3.5, unlockLevel: 8 } },
    ] },
  },
};

// ------------------------------------------------------------------
// HERO BONDS — relationship combos between hero pairs
// ------------------------------------------------------------------
// Defines special combo attacks unlocked when bonded heroes fight together.

export const HERO_BONDS = [
  { heroes: ['knight-shadow', 'wizard-stargazer'], name: 'Starlit Shadow', description: 'Shadow and Stargazer combine darkness and starlight.', combo: { name: 'Eclipse Strike', type: 'damage', multiplier: 4.0 }, dialogues: { C: 'We make a good team.', B: 'I trust you at my side.', A: 'Together, we are unstoppable.', S: 'Our bond transcends the stars.' } },
  { heroes: ['knight-shadow', 'bunny-pepper'], name: 'Spicy Shadows', description: 'Shadow and Pepper strike from the dark with fiery speed.', combo: { name: 'Phantom Pepper', type: 'damage', multiplier: 3.8 }, dialogues: { C: 'Keep up, slow poke!', B: 'Not bad for a knight.', A: 'We are the fastest duo alive!', S: 'Nobody sees us coming.' } },
  { heroes: ['wizard-stargazer', 'bunny-pepper'], name: 'Cosmic Spice', description: 'Stargazer and Pepper rain stars and fire.', combo: { name: 'Meteor Pepper', type: 'damage', multiplier: 3.8 }, dialogues: { C: 'Stars and spice!', B: 'A blazing combination.', A: 'The sky burns for us!', S: 'We light up the universe.' } },
  { heroes: ['knight-crusader', 'wizard-toadstool'], name: 'Holy Blight', description: 'Crusader and Toadstool mix holy light with toxic spores.', combo: { name: 'Sacred Plague', type: 'damage', multiplier: 3.8 }, dialogues: { C: 'An odd pairing.', B: 'Your potions are useful.', A: 'Light and shadow, perfectly balanced.', S: 'We heal and harm as one.' } },
  { heroes: ['knight-paladin', 'bunny-boulder'], name: 'Stone Shield', description: 'Paladin and Boulder form an impenetrable wall.', combo: { name: 'Fortress Wall', type: 'damage', multiplier: 3.5 }, dialogues: { C: 'Stand firm!', B: 'Nothing gets past us.', A: 'We are the wall.', S: 'An unbreakable bond.' } },
  { heroes: ['knight-berserker', 'bunny-blaze'], name: 'Fury Flames', description: 'Berserker and Blaze unleash pure destructive force.', combo: { name: 'Infernal Rage', type: 'damage', multiplier: 4.2 }, dialogues: { C: 'BURN IT ALL!', B: 'More fire! More fury!', A: 'Nothing survives our wrath!', S: 'We are the storm of destruction.' } },
  { heroes: ['wizard-spellblade', 'bunny-nova'], name: 'Arcane Flash', description: 'Spellblade and Nova blend magic and light-speed strikes.', combo: { name: 'Prismatic Rush', type: 'damage', multiplier: 3.8 }, dialogues: { C: 'Fast and magical.', B: 'Your speed, my spells!', A: 'We dazzle and destroy.', S: 'Light-speed sorcery.' } },
  { heroes: ['wizard-bookworm', 'knight-greathelm'], name: 'Knowledge Shield', description: 'Bookworm and Great Helm combine wisdom and fortitude.', combo: { name: 'Tome Fortress', type: 'damage', multiplier: 3.5 }, dialogues: { C: 'Read while I guard.', B: 'Knowledge is our armor.', A: 'Brains and brawn united.', S: 'The pen and the sword, perfected.' } },
  { heroes: ['wizard-grandmage', 'bunny-duchess'], name: 'Royal Arcana', description: 'Grand Mage and Duchess command supreme magical authority.', combo: { name: 'Sovereign Spell', type: 'damage', multiplier: 4.0 }, dialogues: { C: 'Royalty meets mastery.', B: 'Power recognizes power.', A: 'We rule this battlefield.', S: 'The throne and the tower, eternal.' } },
  { heroes: ['bunny-pepper', 'bunny-boulder'], name: 'Spice and Stone', description: 'Pepper dashes while Boulder smashes.', combo: { name: 'Pepper Quake', type: 'damage', multiplier: 3.5 }, dialogues: { C: 'Fast and heavy!', B: 'You smash, I dash!', A: 'An unstoppable combo.', S: 'Speed and strength, forever bonded.' } },
];

