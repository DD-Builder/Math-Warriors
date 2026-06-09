/**
 * Hero roster — the 15 playable characters.
 *
 * Data-only module. Scenes read this to build the party select screen
 * and to instantiate combat-ready heroes. Each class has its own base
 * stats; individual heroes tweak those bases by +/- a couple points so
 * every hero in a class feels distinct.
 *
 * Extended systems:
 *   - Signature abilities  (unique passive/trigger per hero)
 *   - Evolution stages     (3 tiers with branching stage-3 paths)
 *   - Personalities        (type + battle cries)
 *   - Hero bonds           (cross-hero combo attacks)
 */

const CLASS_BASE = {
  knight: { maxHp: 50, atk: 14, def: 14 },
  wizard: { maxHp: 40, atk: 18, def: 8  },
  bunny:  { maxHp: 45, atk: 16, def: 10 },
};

function make(id, name, className, trait, tweak = {}, unlockedAtFloor = 0, superMoves = [], signature = null, evolution = null, personality = null, affinity = null) {
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
    signature,
    evolution,
    personality,
    affinity,
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
  make('knight-shadow', 'Shadow', 'knight', 'Unseen. Unstoppable.', { atk: 2, def: -1 }, 0, [
    { name: 'Shadow Strike', type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Dark Cleave',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Void Slash',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  // --- signature ---
  {
    name: 'Shadow Step',
    description: 'Has a 30% chance to dodge any attack',
    type: 'passive',
    effect: 'dodge',
    value: 0.3,
  },
  // --- evolution ---
  {
    stage1: { name: 'Shadow', title: 'Shadow Apprentice' },
    stage2: {
      name: 'Shadow Knight',
      title: 'Shadow Knight',
      level: 5,
      floor: 2,
      statBoost: { maxHp: 5, atk: 2, def: 1 },
      newSuper: { name: 'Dark Cleave', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'shadow-paladin',
          name: 'Shadow Paladin',
          title: 'Shadow Paladin',
          level: 8,
          mastery: 'addition',
          statBoost: { maxHp: 8, atk: 2, def: 4 },
          newSuper: { name: 'Void Shield', type: 'damage', multiplier: 3.5 },
          description: 'Defensive shadow warrior who shields allies in darkness',
        },
        {
          id: 'shadow-assassin',
          name: 'Shadow Assassin',
          title: 'Shadow Assassin',
          level: 8,
          mastery: 'subtraction',
          statBoost: { maxHp: 3, atk: 5, def: 1 },
          newSuper: { name: 'Void Slash', type: 'damage', multiplier: 4 },
          description: 'Offensive shadow warrior who strikes from the darkness',
        },
      ],
    },
  },
  // --- personality ---
  {
    type: 'stoic',
    battleCries: {
      attack: '"..."',
      correctAnswer: '"As expected."',
      wrongAnswer: '"..."',
      superMove: '"From the shadows!"',
      lowHp: '"Not yet..."',
      victory: '"It is done."',
      defeat: '"..."',
      bossEncounter: '"..."',
    },
  }, 9),

  make('knight-crusader', 'Crusader', 'knight', 'Holy. Righteous. Relentless.', { def: 2, maxHp: -3 }, 1, [
    { name: 'Holy Slam',       type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Radiant Smash',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Divine Judgment',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Holy Aura',
    description: 'Party takes 15% less damage',
    type: 'passive',
    effect: 'partyDamageReduce',
    value: 0.15,
  },
  {
    stage1: { name: 'Crusader', title: 'Crusader Squire' },
    stage2: {
      name: 'Holy Crusader',
      title: 'Holy Crusader',
      level: 5,
      floor: 2,
      statBoost: { maxHp: 4, atk: 2, def: 2 },
      newSuper: { name: 'Radiant Smash', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'crusader-templar',
          name: 'Templar',
          title: 'Holy Templar',
          level: 8,
          mastery: 'multiplication',
          statBoost: { maxHp: 6, atk: 2, def: 5 },
          newSuper: { name: 'Divine Barrier', type: 'damage', multiplier: 3.5 },
          description: 'Unbreakable holy defender who shields the party',
        },
        {
          id: 'crusader-inquisitor',
          name: 'Inquisitor',
          title: 'Grand Inquisitor',
          level: 8,
          mastery: 'division',
          statBoost: { maxHp: 3, atk: 5, def: 2 },
          newSuper: { name: 'Judgment Ray', type: 'damage', multiplier: 4 },
          description: 'Righteous avenger who punishes foes with holy fire',
        },
      ],
    },
  },
  {
    type: 'noble',
    battleCries: {
      attack: '"For justice!"',
      correctAnswer: '"Honor prevails!"',
      wrongAnswer: '"I shall atone."',
      superMove: '"By the light!"',
      lowHp: '"Still standing!"',
      victory: '"Justice is served."',
      defeat: '"Not... in vain..."',
      bossEncounter: '"Face judgment!"',
    },
  }, 1),

  make('knight-paladin', 'Paladin', 'knight', 'Light in darkness. Grace in battle.', { maxHp: 3 }, 3, [
    { name: 'Shield Bash',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Guardian Rush',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Light Nova',     type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: "Guardian's Oath",
    description: 'When an ally drops below 25% HP, Paladin auto-blocks the next hit for them',
    type: 'trigger',
    effect: 'guardAlly',
    value: 0.25,
  },
  {
    stage1: { name: 'Paladin', title: 'Paladin Initiate' },
    stage2: {
      name: 'Holy Paladin',
      title: 'Holy Paladin',
      level: 5,
      floor: 3,
      statBoost: { maxHp: 6, atk: 1, def: 3 },
      newSuper: { name: 'Guardian Rush', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'paladin-champion',
          name: 'Champion',
          title: 'Radiant Champion',
          level: 8,
          mastery: 'addition',
          statBoost: { maxHp: 10, atk: 1, def: 5 },
          newSuper: { name: 'Aegis of Light', type: 'damage', multiplier: 3.5 },
          description: 'Ultimate protector who can shield the entire party',
        },
        {
          id: 'paladin-avenger',
          name: 'Avenger',
          title: 'Holy Avenger',
          level: 8,
          mastery: 'fractions',
          statBoost: { maxHp: 5, atk: 4, def: 2 },
          newSuper: { name: 'Smite', type: 'damage', multiplier: 4 },
          description: 'Righteous warrior who turns defense into devastating offense',
        },
      ],
    },
  },
  {
    type: 'gentle',
    battleCries: {
      attack: '"Stay safe!"',
      correctAnswer: '"Well done!"',
      wrongAnswer: '"It is okay."',
      superMove: '"I will protect!"',
      lowHp: '"Keep going..."',
      victory: '"Everyone safe?"',
      defeat: '"I am sorry..."',
      bossEncounter: '"Behind me!"',
    },
  }, 6),

  make('knight-berserker', 'Berserker', 'knight', 'Pure fury. Zero chill.', { atk: 3, def: -3 }, 4, [
    { name: 'Rage Blow',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Fury Storm',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Chaos Rend',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Blood Rage',
    description: 'ATK increases by +2 for every 10 HP lost',
    type: 'passive',
    effect: 'rageAtk',
    value: 2,
  },
  {
    stage1: { name: 'Berserker', title: 'Berserker Pup' },
    stage2: {
      name: 'War Berserker',
      title: 'War Berserker',
      level: 5,
      floor: 4,
      statBoost: { maxHp: 4, atk: 3, def: 1 },
      newSuper: { name: 'Fury Storm', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'berserker-warlord',
          name: 'Warlord',
          title: 'Blood Warlord',
          level: 8,
          mastery: 'subtraction',
          statBoost: { maxHp: 8, atk: 4, def: 2 },
          newSuper: { name: 'Carnage', type: 'damage', multiplier: 4 },
          description: 'Unstoppable force who gets stronger the longer the fight lasts',
        },
        {
          id: 'berserker-ravager',
          name: 'Ravager',
          title: 'Chaos Ravager',
          level: 8,
          mastery: 'measurement',
          statBoost: { maxHp: 2, atk: 6, def: 0 },
          newSuper: { name: 'World Breaker', type: 'damage', multiplier: 4.5 },
          description: 'Glass cannon who sacrifices everything for maximum damage',
        },
      ],
    },
  },
  {
    type: 'fierce',
    battleCries: {
      attack: '"SMASH!"',
      correctAnswer: '"HA! Easy!"',
      wrongAnswer: '"GRRR!"',
      superMove: '"RAAAAGE!"',
      lowHp: '"MORE! MORE!"',
      victory: '"Who is next?!"',
      defeat: '"Not... done..."',
      bossEncounter: '"FINALLY!"',
    },
  }, 4),

  make('knight-greathelm', 'Great Helm', 'knight', 'Noble. Steadfast. Legendary.', { def: 3 }, 6, [
    { name: 'Iron Wall',     type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Steel Crush',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Titan Strike',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Unbreakable',
    description: 'Cannot be knocked below 1 HP more than once per battle',
    type: 'trigger',
    effect: 'lastStand',
    value: 1,
  },
  {
    stage1: { name: 'Great Helm', title: 'Great Helm Cadet' },
    stage2: {
      name: 'Iron Helm',
      title: 'Iron Helm',
      level: 5,
      floor: 5,
      statBoost: { maxHp: 6, atk: 1, def: 4 },
      newSuper: { name: 'Steel Crush', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'greathelm-fortress',
          name: 'Fortress',
          title: 'Living Fortress',
          level: 8,
          mastery: 'geometry',
          statBoost: { maxHp: 12, atk: 0, def: 6 },
          newSuper: { name: 'Eternal Bastion', type: 'damage', multiplier: 3.5 },
          description: 'Immovable wall of armor who can absorb any attack',
        },
        {
          id: 'greathelm-conqueror',
          name: 'Conqueror',
          title: 'Grand Conqueror',
          level: 8,
          mastery: 'multiplication',
          statBoost: { maxHp: 6, atk: 4, def: 3 },
          newSuper: { name: 'Empire Breaker', type: 'damage', multiplier: 4 },
          description: 'Balanced legendary warrior who excels in all areas',
        },
      ],
    },
  },
  {
    type: 'regal',
    battleCries: {
      attack: '"Proceed."',
      correctAnswer: '"Naturally."',
      wrongAnswer: '"Hmm. Noted."',
      superMove: '"Witness me."',
      lowHp: '"Merely a scratch."',
      victory: '"As it should be."',
      defeat: '"Impossible..."',
      bossEncounter: '"A worthy foe."',
    },
  }, 5),
];

// ------------------------------------------------------------------
// WIZARDS — ranged casters, high attack, low defense
// ------------------------------------------------------------------

export const WIZARDS = [
  make('wizard-stargazer', 'Stargazer', 'wizard', 'The cosmos bends to her will.', { atk: 2 }, 0, [
    { name: 'Star Burst',   type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Cosmic Ray',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Galaxy Blast',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Star Reading',
    description: 'Reveals one wrong answer choice per question',
    type: 'passive',
    effect: 'revealWrong',
    value: 1,
  },
  {
    stage1: { name: 'Stargazer', title: 'Star Pupil' },
    stage2: {
      name: 'Star Mage',
      title: 'Star Mage',
      level: 5,
      floor: 2,
      statBoost: { maxHp: 3, atk: 3, def: 1 },
      newSuper: { name: 'Cosmic Ray', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'stargazer-oracle',
          name: 'Star Oracle',
          title: 'Celestial Oracle',
          level: 8,
          mastery: 'patterns',
          statBoost: { maxHp: 5, atk: 3, def: 3 },
          newSuper: { name: 'Constellation', type: 'damage', multiplier: 3.5 },
          description: 'Cosmic seer who reveals enemy weaknesses and aids the party',
        },
        {
          id: 'stargazer-supernova',
          name: 'Supernova',
          title: 'Supernova',
          level: 8,
          mastery: 'addition',
          statBoost: { maxHp: 2, atk: 6, def: 1 },
          newSuper: { name: 'Big Bang', type: 'damage', multiplier: 4.5 },
          description: 'Explosive cosmic mage who unleashes devastating star power',
        },
      ],
    },
  },
  {
    type: 'dreamy',
    battleCries: {
      attack: '"Stars, guide me."',
      correctAnswer: '"The stars knew."',
      wrongAnswer: '"Hmm, curious..."',
      superMove: '"Cosmic power!"',
      lowHp: '"Fading light..."',
      victory: '"Written in stars."',
      defeat: '"The stars dim..."',
      bossEncounter: '"I foresee... pain."',
    },
  }, 3),

  make('wizard-toadstool', 'Toadstool', 'wizard', 'Brews chaos. Serves it hot.', { atk: 1, def: 1 }, 1, [
    { name: 'Spore Cloud',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Mushroom Bomb',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Toxic Nova',     type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Toxic Spores',
    description: 'Enemies take 3 damage at start of each enemy turn',
    type: 'passive',
    effect: 'poison',
    value: 3,
  },
  {
    stage1: { name: 'Toadstool', title: 'Sprout' },
    stage2: {
      name: 'Fungal Mage',
      title: 'Fungal Mage',
      level: 5,
      floor: 2,
      statBoost: { maxHp: 4, atk: 2, def: 2 },
      newSuper: { name: 'Mushroom Bomb', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'toadstool-plaguemaster',
          name: 'Plague Master',
          title: 'Plague Master',
          level: 8,
          mastery: 'subtraction',
          statBoost: { maxHp: 4, atk: 4, def: 2 },
          newSuper: { name: 'Pandemic', type: 'damage', multiplier: 4 },
          description: 'Master of poison who deals damage over time to all enemies',
        },
        {
          id: 'toadstool-mycologist',
          name: 'Mycologist',
          title: 'Grand Mycologist',
          level: 8,
          mastery: 'measurement',
          statBoost: { maxHp: 8, atk: 2, def: 3 },
          newSuper: { name: 'Healing Spores', type: 'damage', multiplier: 3.5 },
          description: 'Supportive fungal mage who heals allies with restorative mushrooms',
        },
      ],
    },
  },
  {
    type: 'mischievous',
    battleCries: {
      attack: '"Hee hee hee!"',
      correctAnswer: '"Ooh, smarty!"',
      wrongAnswer: '"Oopsie daisy!"',
      superMove: '"Taste my spores!"',
      lowHp: '"Ow ow ow!"',
      victory: '"Toad wins!"',
      defeat: '"Bleh..."',
      bossEncounter: '"Ooh, a big one!"',
    },
  }, 1),

  make('wizard-spellblade', 'Spellblade', 'wizard', 'Magic fists. Still counts.', { def: 3, atk: -1 }, 2, [
    { name: 'Magic Fist',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Arcane Slash',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Ether Blade',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Spell Weave',
    description: 'FIGHT and MAGIC commands both deal 1.5x damage',
    type: 'passive',
    effect: 'hybridDamage',
    value: 1.5,
  },
  {
    stage1: { name: 'Spellblade', title: 'Blade Initiate' },
    stage2: {
      name: 'Arcane Blade',
      title: 'Arcane Blade',
      level: 5,
      floor: 3,
      statBoost: { maxHp: 3, atk: 2, def: 3 },
      newSuper: { name: 'Arcane Slash', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'spellblade-battlemage',
          name: 'Battle Mage',
          title: 'Battle Mage',
          level: 8,
          mastery: 'multiplication',
          statBoost: { maxHp: 5, atk: 3, def: 4 },
          newSuper: { name: 'Mystic Barrage', type: 'damage', multiplier: 3.5 },
          description: 'Armored mage who balances magic and melee perfectly',
        },
        {
          id: 'spellblade-sworddancer',
          name: 'Sword Dancer',
          title: 'Sword Dancer',
          level: 8,
          mastery: 'patterns',
          statBoost: { maxHp: 2, atk: 5, def: 2 },
          newSuper: { name: 'Blade Storm', type: 'damage', multiplier: 4 },
          description: 'Lightning-fast attacker who weaves spells between strikes',
        },
      ],
    },
  },
  {
    type: 'confident',
    battleCries: {
      attack: '"Too easy."',
      correctAnswer: '"Obviously."',
      wrongAnswer: '"Whatever."',
      superMove: '"Watch this."',
      lowHp: '"Just warming up."',
      victory: '"Was there doubt?"',
      defeat: '"Lucky shot."',
      bossEncounter: '"My kind of fight."',
    },
  }, 2),

  make('wizard-bookworm', 'Bookworm', 'wizard', 'Knows every spell. Uses them all.', { maxHp: 3 }, 4, [
    { name: 'Ink Splash',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Page Storm',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Knowledge Blast',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Speed Reader',
    description: 'Math question timer extended by 5 seconds',
    type: 'passive',
    effect: 'timerBonus',
    value: 5,
  },
  {
    stage1: { name: 'Bookworm', title: 'Page Turner' },
    stage2: {
      name: 'Lore Keeper',
      title: 'Lore Keeper',
      level: 5,
      floor: 4,
      statBoost: { maxHp: 4, atk: 3, def: 1 },
      newSuper: { name: 'Page Storm', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'bookworm-archivist',
          name: 'Archivist',
          title: 'Grand Archivist',
          level: 8,
          mastery: 'division',
          statBoost: { maxHp: 6, atk: 2, def: 4 },
          newSuper: { name: 'Tome of Ages', type: 'damage', multiplier: 3.5 },
          description: 'Defensive scholar who uses ancient knowledge to protect allies',
        },
        {
          id: 'bookworm-sage',
          name: 'Sage',
          title: 'Arcane Sage',
          level: 8,
          mastery: 'fractions',
          statBoost: { maxHp: 3, atk: 5, def: 1 },
          newSuper: { name: 'Forbidden Chapter', type: 'damage', multiplier: 4 },
          description: 'Offensive scholar who channels forbidden knowledge into power',
        },
      ],
    },
  },
  {
    type: 'studious',
    battleCries: {
      attack: '"Per my research..."',
      correctAnswer: '"Precisely right!"',
      wrongAnswer: '"Recalculating..."',
      superMove: '"Chapter eleven!"',
      lowHp: '"Need more data..."',
      victory: '"As I predicted."',
      defeat: '"Back to study..."',
      bossEncounter: '"Fascinating..."',
    },
  }, 8),

  make('wizard-grandmage', 'Grand Mage', 'wizard', 'Ancient power. Zero patience.', { atk: 3, maxHp: -3 }, 6, [
    { name: 'Fire Bolt',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Thunder Wave',   type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Meteor Rain',    type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Arcane Overflow',
    description: 'Correct answers on hard (4-5 star) questions deal 3x damage',
    type: 'trigger',
    effect: 'hardBonus',
    value: 3,
  },
  {
    stage1: { name: 'Grand Mage', title: 'Apprentice Mage' },
    stage2: {
      name: 'Arch Mage',
      title: 'Arch Mage',
      level: 5,
      floor: 5,
      statBoost: { maxHp: 2, atk: 4, def: 1 },
      newSuper: { name: 'Thunder Wave', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'grandmage-elementalist',
          name: 'Elementalist',
          title: 'Elemental Lord',
          level: 8,
          mastery: 'geometry',
          statBoost: { maxHp: 4, atk: 5, def: 2 },
          newSuper: { name: 'Elemental Cataclysm', type: 'damage', multiplier: 4.5 },
          description: 'Master of all elements who can devastate entire enemy groups',
        },
        {
          id: 'grandmage-chronomancer',
          name: 'Chronomancer',
          title: 'Chronomancer',
          level: 8,
          mastery: 'time',
          statBoost: { maxHp: 5, atk: 3, def: 3 },
          newSuper: { name: 'Time Fracture', type: 'damage', multiplier: 3.5 },
          description: 'Time-bending mage who manipulates turn order and cooldowns',
        },
      ],
    },
  },
  {
    type: 'imperious',
    battleCries: {
      attack: '"Begone."',
      correctAnswer: '"Child\'s play."',
      wrongAnswer: '"Tch. Wasted."',
      superMove: '"KNEEL."',
      lowHp: '"Impossible!"',
      victory: '"Beneath me."',
      defeat: '"This means nothing."',
      bossEncounter: '"You bore me."',
    },
  }, 6),
];

// ------------------------------------------------------------------
// BATTLE BUNNIES — fast melee, balanced
// ------------------------------------------------------------------

export const BUNNIES = [
  make('bunny-pepper', 'Pepper', 'bunny', 'Tiny. Fast. Absolutely feral.', { atk: 3, def: -2 }, 0, [
    { name: 'Pepper Dash',     type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Spicy Rush',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Inferno Sprint',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Pepper Dash',
    description: 'Always acts first; +20% damage on first attack each battle',
    type: 'passive',
    effect: 'firstStrike',
    value: 0.2,
  },
  {
    stage1: { name: 'Pepper', title: 'Little Pepper' },
    stage2: {
      name: 'Spicy Pepper',
      title: 'Spicy Pepper',
      level: 5,
      floor: 2,
      statBoost: { maxHp: 3, atk: 3, def: 1 },
      newSuper: { name: 'Spicy Rush', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'pepper-blazekick',
          name: 'Blaze Kicker',
          title: 'Blaze Kicker',
          level: 8,
          mastery: 'addition',
          statBoost: { maxHp: 3, atk: 6, def: 1 },
          newSuper: { name: 'Inferno Blitz', type: 'damage', multiplier: 4.5 },
          description: 'Ultimate speed attacker who overwhelms enemies with rapid strikes',
        },
        {
          id: 'pepper-scout',
          name: 'Pepper Scout',
          title: 'Shadow Scout',
          level: 8,
          mastery: 'subtraction',
          statBoost: { maxHp: 5, atk: 3, def: 3 },
          newSuper: { name: 'Ambush Rush', type: 'damage', multiplier: 3.5 },
          description: 'Tactical striker who scouts enemies and sets up team combos',
        },
      ],
    },
  },
  {
    type: 'chaotic',
    battleCries: {
      attack: '"ZOOM ZOOM!"',
      correctAnswer: '"YES YES YES!"',
      wrongAnswer: '"Wait, what?!"',
      superMove: '"CATCH MEEE!"',
      lowHp: '"Ow! Hey! OW!"',
      victory: '"I WON I WON!"',
      defeat: '"No fair..."',
      bossEncounter: '"Ooh big! BIG!"',
    },
  }, 4),

  make('bunny-nova', 'Nova', 'bunny', 'She sparkles. Then she wins.', { atk: 2, maxHp: -2 }, 2, [
    { name: 'Spark Jump',  type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Flash Leap',  type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Nova Burst',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Spark Chain',
    description: 'Correct answer streaks of 3+ deal splash damage to all enemies',
    type: 'trigger',
    effect: 'splashStreak',
    value: 3,
  },
  {
    stage1: { name: 'Nova', title: 'Little Spark' },
    stage2: {
      name: 'Bright Nova',
      title: 'Bright Nova',
      level: 5,
      floor: 3,
      statBoost: { maxHp: 3, atk: 3, def: 1 },
      newSuper: { name: 'Flash Leap', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'nova-pulsar',
          name: 'Pulsar',
          title: 'Pulsar',
          level: 8,
          mastery: 'multiplication',
          statBoost: { maxHp: 2, atk: 5, def: 2 },
          newSuper: { name: 'Radiant Pulse', type: 'damage', multiplier: 4 },
          description: 'AoE specialist who damages all enemies with pulsing energy',
        },
        {
          id: 'nova-prism',
          name: 'Prism',
          title: 'Prism Guardian',
          level: 8,
          mastery: 'geometry',
          statBoost: { maxHp: 5, atk: 2, def: 4 },
          newSuper: { name: 'Prismatic Shield', type: 'damage', multiplier: 3.5 },
          description: 'Supportive sparkle warrior who buffs allies and debuffs enemies',
        },
      ],
    },
  },
  {
    type: 'cheerful',
    battleCries: {
      attack: '"Sparkle time!"',
      correctAnswer: '"Yay, I got it!"',
      wrongAnswer: '"Oops, almost!"',
      superMove: '"Shine bright!"',
      lowHp: '"Still sparkling!"',
      victory: '"We did it!"',
      defeat: '"Next time..."',
      bossEncounter: '"Let\'s glow!"',
    },
  }, 3),

  make('bunny-boulder', 'Boulder', 'bunny', 'Heaviest punch in the kingdom.', { atk: -1, def: 3, maxHp: 3 }, 3, [
    { name: 'Rock Toss',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Quake Slam',     type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Mountain Drop',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Tough Hide',
    description: 'DEF counts double against the first hit each turn',
    type: 'passive',
    effect: 'doubleDef',
    value: 1,
  },
  {
    stage1: { name: 'Boulder', title: 'Pebble' },
    stage2: {
      name: 'Stone Boulder',
      title: 'Stone Boulder',
      level: 5,
      floor: 3,
      statBoost: { maxHp: 5, atk: 1, def: 3 },
      newSuper: { name: 'Quake Slam', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'boulder-colossus',
          name: 'Colossus',
          title: 'Colossus',
          level: 8,
          mastery: 'measurement',
          statBoost: { maxHp: 10, atk: 1, def: 5 },
          newSuper: { name: 'Continental Crush', type: 'damage', multiplier: 3.5 },
          description: 'Massive stone warrior who is nearly impossible to bring down',
        },
        {
          id: 'boulder-avalanche',
          name: 'Avalanche',
          title: 'Avalanche',
          level: 8,
          mastery: 'division',
          statBoost: { maxHp: 5, atk: 4, def: 3 },
          newSuper: { name: 'Landslide', type: 'damage', multiplier: 4 },
          description: 'Offensive rock warrior who crushes enemies under rolling stone',
        },
      ],
    },
  },
  {
    type: 'calm',
    battleCries: {
      attack: '"Here goes."',
      correctAnswer: '"Yep."',
      wrongAnswer: '"Hmm. Oh well."',
      superMove: '"Heads up."',
      lowHp: '"Still good."',
      victory: '"Cool."',
      defeat: '"Dang."',
      bossEncounter: '"Big guy, huh."',
    },
  }, 5),

  make('bunny-blaze', 'Blaze', 'bunny', 'Fire magic. Fire attitude.', { atk: 2 }, 5, [
    { name: 'Flame Hop',      type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Fire Dance',     type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Blaze Tornado',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Flame Trail',
    description: 'After attacking, enemy takes 2 burn damage for 2 turns',
    type: 'passive',
    effect: 'burn',
    value: 2,
  },
  {
    stage1: { name: 'Blaze', title: 'Little Flame' },
    stage2: {
      name: 'Fire Blaze',
      title: 'Fire Blaze',
      level: 5,
      floor: 5,
      statBoost: { maxHp: 3, atk: 3, def: 1 },
      newSuper: { name: 'Fire Dance', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'blaze-inferno',
          name: 'Inferno',
          title: 'Inferno',
          level: 8,
          mastery: 'fractions',
          statBoost: { maxHp: 3, atk: 6, def: 1 },
          newSuper: { name: 'Wildfire', type: 'damage', multiplier: 4.5 },
          description: 'Uncontrollable fire warrior who burns everything in sight',
        },
        {
          id: 'blaze-phoenix',
          name: 'Phoenix',
          title: 'Phoenix',
          level: 8,
          mastery: 'time',
          statBoost: { maxHp: 6, atk: 3, def: 3 },
          newSuper: { name: 'Rebirth Flame', type: 'damage', multiplier: 3.5 },
          description: 'Resilient fire warrior who can revive from defeat once per battle',
        },
      ],
    },
  },
  {
    type: 'fierce',
    battleCries: {
      attack: '"Burn, baby!"',
      correctAnswer: '"On fire!"',
      wrongAnswer: '"Grr, whatever!"',
      superMove: '"FEEL THE HEAT!"',
      lowHp: '"Still burning!"',
      victory: '"Too hot for you!"',
      defeat: '"Flame... out..."',
      bossEncounter: '"Let\'s heat up!"',
    },
  }, 4),

  make('bunny-duchess', 'Duchess', 'bunny', 'Royal blood. Royal fury.', { def: 2, maxHp: 2 }, 7, [
    { name: 'Royal Strike',    type: 'damage', multiplier: 2, unlockLevel: 1 },
    { name: 'Crown Slam',      type: 'damage', multiplier: 2.5, unlockLevel: 4 },
    { name: 'Sovereign Fury',  type: 'damage', multiplier: 3, unlockLevel: 7 },
  ],
  {
    name: 'Royal Command',
    description: 'Other party members gain +1 ATK/+1 DEF',
    type: 'passive',
    effect: 'leaderAura',
    value: 1,
  },
  {
    stage1: { name: 'Duchess', title: 'Young Duchess' },
    stage2: {
      name: 'Grand Duchess',
      title: 'Grand Duchess',
      level: 5,
      floor: 6,
      statBoost: { maxHp: 4, atk: 2, def: 3 },
      newSuper: { name: 'Crown Slam', type: 'damage', multiplier: 2.5 },
    },
    stage3: {
      paths: [
        {
          id: 'duchess-empress',
          name: 'Empress',
          title: 'Empress',
          level: 8,
          mastery: 'patterns',
          statBoost: { maxHp: 6, atk: 3, def: 4 },
          newSuper: { name: 'Imperial Decree', type: 'damage', multiplier: 4 },
          description: 'Supreme leader who empowers the entire party with royal might',
        },
        {
          id: 'duchess-warchief',
          name: 'War Duchess',
          title: 'War Duchess',
          level: 8,
          mastery: 'time',
          statBoost: { maxHp: 4, atk: 5, def: 2 },
          newSuper: { name: 'Royal Rampage', type: 'damage', multiplier: 4.5 },
          description: 'Fierce royal warrior who leads the charge into battle',
        },
      ],
    },
  },
  {
    type: 'regal',
    battleCries: {
      attack: '"By royal decree!"',
      correctAnswer: '"As expected."',
      wrongAnswer: '"Unacceptable."',
      superMove: '"Bow before me!"',
      lowHp: '"How dare you!"',
      victory: '"The crown prevails."',
      defeat: '"Retreat... for now."',
      bossEncounter: '"Kneel."',
    },
  }, 7),
];

// ------------------------------------------------------------------
// FLAT ARRAY + LOOKUP
// ------------------------------------------------------------------

export const ALL_HEROES = [...KNIGHTS, ...WIZARDS, ...BUNNIES];

// Build a { heroId: evolutionData } lookup from the hero roster.
// The evolution system imports this to avoid searching ALL_HEROES every time.
export const HERO_EVOLUTIONS = {};
ALL_HEROES.forEach(h => {
  if (h.evolution) HERO_EVOLUTIONS[h.id] = h.evolution;
});

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
    signature: def.signature ?? null,
    personality: def.personality ?? null,
    affinity: def.affinity ?? null,
  };
}

// XP thresholds per level. Index = level (1-based), value = total XP needed.
export const LEVEL_THRESHOLDS = [0, 0, 80, 180, 320, 500, 750, 1050, 1200, 1500, 1900];

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
function xpToNextLevel(level) {
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
// NEW LOOKUP HELPERS — signature, evolution, personality
// ------------------------------------------------------------------

/** Get the signature ability data for a hero. Returns null if not found. */
export function getHeroSignature(heroId) {
  const hero = getHeroById(heroId);
  return hero?.signature ?? null;
}

/** Get the evolution data for a hero. Returns null if not found. */
export function getEvolutionData(heroId) {
  const hero = getHeroById(heroId);
  return hero?.evolution ?? null;
}

/** Get the personality data for a hero. Returns null if not found. */
export function getPersonality(heroId) {
  const hero = getHeroById(heroId);
  return hero?.personality ?? null;
}

// ------------------------------------------------------------------
// HERO BONDS — cross-hero combo attacks
// ------------------------------------------------------------------

export const HERO_BONDS = [
  // --- Cross-class: Knight + Wizard ---
  {
    heroes: ['knight-shadow', 'wizard-stargazer'],
    name: 'Eclipse',
    description: 'Shadow cloaks Stargazer who fires a massive star beam from hiding',
    multiplier: 4,
    dialogueC: ['Shadow: "..."', 'Stargazer: "The stars see what shadows hide."'],
    dialogueA: ['Shadow: "You see too much."', 'Stargazer: "And you hide too much. We balance."'],
    dialogueB: ['Shadow: "We work well."', 'Stargazer: "The stars agree!"'],
    dialogueS: ['Shadow: "I trust you."', 'Stargazer: "And I trust the shadows."'],
  },
  {
    heroes: ['knight-crusader', 'wizard-grandmage'],
    name: 'Sacred Inferno',
    description: 'Crusader channels holy light while Grand Mage ignites it into a divine firestorm',
    multiplier: 4.5,
    dialogueC: ['Crusader: "Lend me your flame."', 'Grand Mage: "Try not to waste it."'],
    dialogueA: ['Crusader: "Your power serves justice."', 'Grand Mage: "Justice? I just like explosions."'],
    dialogueB: ['Crusader: "Your flames are holy."', 'Grand Mage: "Flattery. Continue."'],
    dialogueS: ['Crusader: "Brother in arms."', 'Grand Mage: "...Fine. Brother."'],
  },
  {
    heroes: ['knight-paladin', 'wizard-bookworm'],
    name: 'Guiding Light',
    description: 'Paladin raises a shield of light while Bookworm inscribes ancient runes on it',
    multiplier: 3.5,
    dialogueC: ['Paladin: "I will protect you."', 'Bookworm: "Um, thanks."'],
    dialogueA: ['Paladin: "Your knowledge saves lives."', 'Bookworm: "And your shield saves mine!"'],
    dialogueB: ['Paladin: "Read to me sometime?"', 'Bookworm: "I have just the book!"'],
    dialogueS: ['Paladin: "My shield is yours."', 'Bookworm: "And my spells are yours."'],
  },
  {
    heroes: ['knight-berserker', 'wizard-spellblade'],
    name: 'Chaos Edge',
    description: 'Berserker charges while Spellblade enchants the attack with explosive magic',
    multiplier: 4.5,
    dialogueC: ['Berserker: "OUTTA MY WAY!"', 'Spellblade: "After you, big guy."'],
    dialogueA: ['Berserker: "You fight good!"', 'Spellblade: "I know."'],
    dialogueB: ['Berserker: "More smashing!"', 'Spellblade: "More style, please."'],
    dialogueS: ['Berserker: "You make me better."', 'Spellblade: "Likewise, big guy."'],
  },
  // --- Cross-class: Knight + Bunny ---
  {
    heroes: ['knight-greathelm', 'bunny-duchess'],
    name: 'Royal Guard',
    description: 'Great Helm kneels as Duchess leaps off the armor for a devastating aerial strike',
    multiplier: 4,
    dialogueC: ['Great Helm: "Your Highness."', 'Duchess: "You may rise."'],
    dialogueA: ['Great Helm: "A worthy liege."', 'Duchess: "A worthy champion."'],
    dialogueB: ['Great Helm: "Command me."', 'Duchess: "Gladly."'],
    dialogueS: ['Great Helm: "My life for yours."', 'Duchess: "Together, always."'],
  },
  {
    heroes: ['knight-shadow', 'bunny-pepper'],
    name: 'Ghost Pepper',
    description: 'Shadow vanishes and Pepper dashes through the confusion at blinding speed',
    multiplier: 4,
    dialogueC: ['Shadow: "Be quiet."', 'Pepper: "NEVER!"'],
    dialogueA: ['Shadow: "You are... loud."', 'Pepper: "And YOU need to loosen up!"'],
    dialogueB: ['Shadow: "You are fast."', 'Pepper: "You are SNEAKY!"'],
    dialogueS: ['Shadow: "Stay close, Pepper."', 'Pepper: "BFFs FOREVER!"'],
  },
  {
    heroes: ['knight-crusader', 'bunny-boulder'],
    name: 'Holy Quake',
    description: 'Crusader blesses the ground as Boulder slams it with a holy shockwave',
    multiplier: 3.5,
    dialogueC: ['Crusader: "Ready yourself!"', 'Boulder: "Yep."'],
    dialogueA: ['Crusader: "Your strength is a gift!"', 'Boulder: "Cool. Thanks."'],
    dialogueB: ['Crusader: "Stand firm!"', 'Boulder: "Always do."'],
    dialogueS: ['Crusader: "You are my rock."', 'Boulder: "Literally."'],
  },
  {
    heroes: ['knight-paladin', 'bunny-nova'],
    name: 'Radiant Spark',
    description: 'Paladin channels a shield of light and Nova detonates it in a blinding flash',
    multiplier: 3.5,
    dialogueC: ['Paladin: "Stay close."', 'Nova: "Ooh, shiny!"'],
    dialogueA: ['Paladin: "You light up the dark."', 'Nova: "Aww, you too!"'],
    dialogueB: ['Paladin: "Your light inspires."', 'Nova: "Your shield rocks!"'],
    dialogueS: ['Paladin: "Shine on, Nova."', 'Nova: "Always, for you!"'],
  },
  // --- Cross-class: Wizard + Bunny ---
  {
    heroes: ['wizard-toadstool', 'bunny-blaze'],
    name: 'Blazing Spores',
    description: 'Toadstool releases spores and Blaze ignites them in a chain of explosions',
    multiplier: 4,
    dialogueC: ['Toadstool: "Hee hee, catch!"', 'Blaze: "Burn, baby!"'],
    dialogueA: ['Toadstool: "You make everything better!"', 'Blaze: "Everything is better on fire!"'],
    dialogueB: ['Toadstool: "More booms please!"', 'Blaze: "You got it, shroomy!"'],
    dialogueS: ['Toadstool: "Best fire friend!"', 'Blaze: "Best spore pal!"'],
  },
  {
    heroes: ['wizard-stargazer', 'bunny-nova'],
    name: 'Starfall',
    description: 'Stargazer summons a meteor while Nova rides it down in a blazing descent',
    multiplier: 4.5,
    dialogueC: ['Stargazer: "A star descends."', 'Nova: "Wheee!"'],
    dialogueA: ['Stargazer: "You shine so brightly."', 'Nova: "Right back at you!"'],
    dialogueB: ['Stargazer: "Our light merges."', 'Nova: "Double sparkle power!"'],
    dialogueS: ['Stargazer: "My constellation."', 'Nova: "My stargazer!"'],
  },
  {
    heroes: ['wizard-bookworm', 'bunny-pepper'],
    name: 'Speed Study',
    description: 'Bookworm launches enchanted pages that Pepper delivers at supersonic speed',
    multiplier: 3.5,
    dialogueC: ['Bookworm: "Hold still please."', 'Pepper: "CAN\'T! WON\'T!"'],
    dialogueA: ['Bookworm: "Fascinating velocity."', 'Pepper: "Big words! Let\'s GO!"'],
    dialogueB: ['Bookworm: "You deliver well."', 'Pepper: "SPEED READING!"'],
    dialogueS: ['Bookworm: "My favorite chapter."', 'Pepper: "Aww! ZOOM HUG!"'],
  },
  // --- Personality contrast pairs ---
  {
    heroes: ['knight-paladin', 'knight-berserker'],
    name: 'Order and Chaos',
    description: 'Paladin and Berserker charge from opposite sides in a devastating pincer attack',
    multiplier: 4,
    dialogueC: ['Paladin: "Please be careful."', 'Berserker: "NO PROMISES!"'],
    dialogueA: ['Paladin: "I believe in you."', 'Berserker: "...thanks."'],
    dialogueB: ['Paladin: "Temper your rage."', 'Berserker: "You temper yours!"'],
    dialogueS: ['Paladin: "I need your fire."', 'Berserker: "I need your calm."'],
  },
  {
    heroes: ['wizard-grandmage', 'wizard-toadstool'],
    name: 'Arcane Brew',
    description: 'Grand Mage supercharges Toadstool\'s potions into an unstable magical explosion',
    multiplier: 4,
    dialogueC: ['Grand Mage: "Stand back, fungus."', 'Toadstool: "Ooh, grumpy!"'],
    dialogueA: ['Grand Mage: "Your methods are... unorthodox."', 'Toadstool: "That means fun, right?"'],
    dialogueB: ['Grand Mage: "Acceptable brews."', 'Toadstool: "High praise! Hee!"'],
    dialogueS: ['Grand Mage: "You... grew on me."', 'Toadstool: "Like a mushroom!"'],
  },
];
