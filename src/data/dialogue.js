/**
 * Story dialogue — graphic-novel-style panels.
 *
 * CutsceneScene splits lines into 3 visual scenes:
 *   Scene 1 (fairy solo, big sparkly) — first third of lines
 *   Scene 2 (fairy + hero party) — middle third
 *   Scene 3 (fairy solo close) — final third
 * Multiple lines per scene — player taps to advance within each.
 * Max ~38 chars per line to prevent overflow.
 */

export const DIALOGUE = {
  // ── GAME INTRO ──
  game_intro: [
    { speaker: 'Elder Fairy', text: 'Welcome, brave heroes!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'I am Elara, keeper of balance.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Our Great Equation shattered!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Nine pieces, stolen by monsters.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Each piece hides in a new realm.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Will you help us get them back?', side: 'left' },
  ],

  world_map_intro: [
    { speaker: 'Narrator', text: 'Nine realms. Nine fragments.', wide: true },
  ],

  first_battle: [
    { speaker: 'Elder Fairy', text: 'A Number Eater! Get ready!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Answer math to attack!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You can do it, heroes!', side: 'left' },
  ],

  hero_unlock: [
    { speaker: 'Elder Fairy', text: 'The magic freed a new ally!', side: 'left' },
  ],

  mid_floor_encourage: [
    { speaker: 'Elder Fairy', text: "Great job! Keep going!", side: 'left' },
  ],

  phase2_start: [
    { speaker: 'Elder Fairy', text: 'New items appeared! Find them!', side: 'left' },
  ],

  // ── FLOOR 1: THE GARDEN ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'This is the Garden of Addition.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Walk carefully. Thorns listen.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Three fairies are trapped here!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Free them to find the treasure.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then find the Rune Stones.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The boss guards the Fragment.', side: 'left' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'Wrong answers make me STRONGER!', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'Answer fast! It grows each turn!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment glows!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'One piece found. Eight remain.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Tidepool Ruins call us...', side: 'left' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'Oh no! The tides are rising!', side: 'left' },
    { speaker: 'Water Fairy', text: "We'll drown if we don't act!", side: 'left' },
    { speaker: 'Water Fairy', text: 'Find three drain valves!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Then seal the Coral Keys!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Please hurry! Please!', side: 'left' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'Down, down, down you go...', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'Subtract its power! Quickly!', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'Oh thank goodness! We did it!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtraction Fragment is safe!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The clouds hold the next one.', side: 'left' },
  ],

  // ── FLOOR 3: CLOUD MAZE ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'Ha! A storm? I LOVE storms!', side: 'left' },
    { speaker: 'Sky Fairy', text: "Don't worry. I know these skies.", side: 'left' },
    { speaker: 'Sky Fairy', text: 'Light three sky beacons!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Then ring the Wind Chimes!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Follow me! Onward and up!', side: 'left' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'One of me? Try a THOUSAND!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'Multiply to shrink it down!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'HA! That whale had no chance!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply Fragment is ours!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Dive into the Ember Caves!', side: 'left' },
  ],

  // ── FLOOR 4: EMBER CAVES ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves crack open! Move!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Lava pours through the cracks.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Seal three volcanic vents!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Then build the Lava Bridges!', side: 'left' },
    { speaker: 'Fire Fairy', text: "No time to waste. Let's GO!", side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: "I'll split you into pieces!", sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Use division to break through!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The lava cools. We survived.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Division Fragment secured!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The Frozen Peak awaits above.', side: 'left' },
  ],

  // ── FLOOR 5: FROZEN PEAK ──
  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'B-brrr! I c-can barely move!', side: 'left' },
    { speaker: 'Ice Fairy', text: "It's all f-frozen solid!", side: 'left' },
    { speaker: 'Ice Fairy', text: 'Find three frozen c-crystals!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Then melt the Thaw Crystals!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'S-stay warm out there!', side: 'left' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'Your courage... freezing.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Narrator', text: 'Fractions can crack the ice!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Ice Fairy', text: 'The ice melts! I can move!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Fractions Fragment is free!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Crystal Caverns glow below...', side: 'left' },
  ],

  // ── FLOOR 6: CRYSTAL CAVERNS ──
  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'Fascinating. Every facet is data.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The patterns follow geometry.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Collect three geo shards.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Then align the Prism Shards.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Precisely. No errors.', side: 'left' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'Every angle hides a trick.', sprite: 'theprism', side: 'right' },
    { speaker: 'Narrator', text: 'Think in shapes to win!', wide: true },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'The geometry resolves.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Geometry Fragment catalogued.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The Market Square needs help.', side: 'left' },
  ],

  // ── FLOOR 7: MARKET SQUARE ──
  floor7_entry: [
    { speaker: 'Market Fairy', text: 'Ooh! Shiny coins everywhere!', side: 'left' },
    { speaker: 'Market Fairy', text: 'But careful! Most are FAKES!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Find three real gold tokens!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Then crack the Vault Seals!', side: 'left' },
    { speaker: 'Market Fairy', text: 'A good deal awaits the clever!', side: 'left' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: "Real? Fake? I can't tell!", sprite: 'counterfeiter', side: 'right' },
    { speaker: 'Narrator', text: 'Count carefully. Every coin!', wide: true },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'Best deal of the century!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Money Fragment is priceless!', side: 'left' },
    { speaker: 'Market Fairy', text: 'The ancient library awaits...', side: 'left' },
  ],

  // ── FLOOR 8: INFINITY LIBRARY ──
  floor8_entry: [
    { speaker: 'Book Fairy', text: 'Pages drift like lost poems...', side: 'left' },
    { speaker: 'Book Fairy', text: 'Every word has been scrambled.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Restore three lost pages.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Then bind the Chapter Seals.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Handle them gently, please.', side: 'left' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: "If I'm wrong, I'm right!", sprite: 'theparadox', side: 'right' },
    { speaker: 'Narrator', text: 'Read carefully. Words twist!', wide: true },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'The words settle into place.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Word Fragment rewritten.', side: 'left' },
    { speaker: 'Book Fairy', text: 'One final chapter remains...', side: 'left' },
  ],

  // ── FLOOR 9: THE MENDING ROOM ──
  floor9_entry: [
    { speaker: 'All Fairies', text: 'Together at last!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'This is the Mending Room.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Place three equation pieces.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then set the Equation Anchors.', side: 'left' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you learned!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The final battle awaits.', side: 'left' },
  ],
  floor9_boss: [
    { speaker: 'The Theorem', text: 'I am every question you feared.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'Solve me... if you can.', sprite: 'theorem', side: 'right' },
  ],
  floor9_victory: [
    { speaker: 'The Theorem', text: 'You solved me. Well done.', sprite: 'theorem', side: 'right' },
    { speaker: 'Elder Fairy', text: 'The Great Equation glows!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The tides flow true again!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The skies are clear! Finally!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The flames rest. Well fought.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You brought balance back.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'True heroes. Every one of you.', side: 'left' },
  ],

  // ── BOSS HALF-HP REACTIONS ──
  floor1_boss_half: [{ speaker: 'Briar King', text: 'My roots are weakening!' }],
  floor2_boss_half: [{ speaker: 'The Pressure', text: 'The cracks are showing!' }],
  floor3_boss_half: [{ speaker: 'Skywhale', text: "I'm... shrinking?!" }],
  floor4_boss_half: [{ speaker: 'Pyroclast', text: "My core... it's cooling!" }],
  floor5_boss_half: [{ speaker: 'Absolute Zero', text: "My ice... MELTING!" }],
  floor6_boss_half: [{ speaker: 'The Prism', text: 'My facets... cracking!' }],
  floor7_boss_half: [{ speaker: 'The Counterfeiter', text: "My fakes are worthless!" }],
  floor8_boss_half: [{ speaker: 'The Paradox', text: "It CAN'T be right!" }],
  floor9_boss_half: [{ speaker: 'The Theorem', text: 'You... actually understand!' }],

  // ── IN-MAZE SMALL MOMENTS ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you! I was so scared!' },
    { speaker: 'Rescued Fairy', text: 'Keep going! Find the others!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All of us are free!' },
    { speaker: 'Rescued Fairy', text: 'The golden treasure appeared!' },
  ],
};
