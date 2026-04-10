/**
 * Hero roster — the 15 playable characters
 *
 * Data-only module. Scenes read this to build the party select screen
 * and to instantiate combat-ready heroes.
 *
 * v0.2: only the stats matter; the `sprite` key points at a placeholder
 * for now. When we wire real art, we update the sprite paths and nothing
 * else changes.
 *
 * Class base stats are deliberately *slightly* differentiated. The
 * prototype made all 5 knights identical; we can do better.
 */

// Base stats per class — each individual hero slightly tweaks these.
const CLASS_BASE = {
  knight: { maxHp: 50, atk: 14, def: 14 },
  wizard: { maxHp: 40, atk: 18, def: 8  },
  bunny:  { maxHp: 45, atk: 16, def: 10 },
};

/**
 * Helper: build a hero record from class + individual tweaks.
 * Individual tweaks are small (+/- 1-3 on any stat).
 */
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
    // Sprite path resolved by asset loader. Placeholder for v0.2.
    sprite: `heroes/${id}`,
    // Display color used for placeholder rendering before real art lands.
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
