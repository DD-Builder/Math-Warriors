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
    { speaker: 'Elder Fairy', text: 'Welcome to the Garden!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Addition makes things grow here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Free three fairies from cages!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then find the Rune Stones.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Briar King guards the way.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Add your strength! You can do it!', side: 'left' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'My vines ADD up every second!', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'Add fast to cut through!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment glows!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'One piece found. Eight remain.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Tidepool Ruins call us...', side: 'left' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'Welcome to the Tidepool Ruins!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtraction drains the water!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Turn three drain valves!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Then find the Coral Keys.', side: 'left' },
    { speaker: 'Water Fairy', text: 'The Pressure lurks below...', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtract the flood! Hurry!', side: 'left' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'The deeper you go, the less air!', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'Subtract its strength! Fast!', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'Oh thank goodness! We did it!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtraction Fragment is safe!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The clouds hold the next one.', side: 'left' },
  ],

  // ── FLOOR 3: CLOUD MAZE ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'Welcome to the Cloud Maze!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply the light to clear it!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Light three sky beacons!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Then ring the Wind Chimes.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The Skywhale hides in clouds...', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply your courage! Go!', side: 'left' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'I MULTIPLY with every breath!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'Multiply faster than it grows!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'HA! That whale had no chance!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply Fragment is ours!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Dive into the Ember Caves!', side: 'left' },
  ],

  // ── FLOOR 4: EMBER CAVES ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'Welcome to the Ember Caves!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Division splits the lava flow!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Seal three volcanic vents!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Then build the Lava Bridges.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Pyroclast burns deep inside...', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Divide and conquer! Move!', side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: "I'll DIVIDE you to nothing!", sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Divide to break it apart!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The lava cools. We survived.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Division Fragment secured!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The Frozen Peak awaits above.', side: 'left' },
  ],

  // ── FLOOR 5: FROZEN PEAK ──
  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'W-welcome to Frozen Peak!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Use every math skill to thaw!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Find three f-frozen crystals!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Then melt the Thaw Crystals.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Absolute Zero waits in ice...', side: 'left' },
    { speaker: 'Ice Fairy', text: 'All your skills together! Go!', side: 'left' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'Every answer freezes here!', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Narrator', text: 'Use every skill to melt it!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Ice Fairy', text: 'The ice melts! I can move!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Fractions Fragment is free!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Crystal Caverns glow below...', side: 'left' },
  ],

  // ── FLOOR 6: CRYSTAL CAVERNS ──
  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'Welcome to Crystal Caverns.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Fractions shape every crystal.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Collect three geo shards.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Then align the Prism Shards.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The Prism bends all light...', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Piece the fractions together!', side: 'left' },
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
    { speaker: 'Market Fairy', text: 'Welcome to Market Square!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Money math spots the fakes!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Find three real gold tokens!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Then crack the Vault Seals.', side: 'left' },
    { speaker: 'Market Fairy', text: 'The Counterfeiter hides here...', side: 'left' },
    { speaker: 'Market Fairy', text: 'Count every coin! Let us go!', side: 'left' },
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
    { speaker: 'Book Fairy', text: 'Welcome to Infinity Library.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Word problems fill these shelves.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Restore three lost pages.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Then bind the Chapter Seals.', side: 'left' },
    { speaker: 'Book Fairy', text: 'The Paradox twists all words...', side: 'left' },
    { speaker: 'Book Fairy', text: 'Read carefully and solve on!', side: 'left' },
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
    { speaker: 'All Fairies', text: 'The Mending Room! At last!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Every math skill matters here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Place three equation fragments.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then set the Equation Anchors.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Theorem awaits within...', side: 'left' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you learned!', side: 'left' },
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

  // ── PER-FLOOR PHASE 1 COMPLETION ──
  floor1_phase1_done: [
    { speaker: 'Elder Fairy', text: 'All three fairies are free!' },
    { speaker: 'Elder Fairy', text: 'Now find the hidden Rune Stones!' },
    { speaker: 'Elder Fairy', text: 'They glow when the garden heals.' },
  ],
  floor2_phase1_done: [
    { speaker: 'Water Fairy', text: 'All drain valves are open!' },
    { speaker: 'Water Fairy', text: 'The water is going down!' },
    { speaker: 'Water Fairy', text: 'Now find the Coral Keys!' },
  ],
  floor3_phase1_done: [
    { speaker: 'Sky Fairy', text: 'All beacons are lit! YES!' },
    { speaker: 'Sky Fairy', text: 'The storm clouds are breaking!' },
    { speaker: 'Sky Fairy', text: 'Now ring the Wind Chimes!' },
  ],
  floor4_phase1_done: [
    { speaker: 'Fire Fairy', text: 'All lava vents are sealed!' },
    { speaker: 'Fire Fairy', text: 'The caves are cooling down!' },
    { speaker: 'Fire Fairy', text: 'Now build the Lava Bridges!' },
  ],
  floor5_phase1_done: [
    { speaker: 'Ice Fairy', text: 'All f-frozen crystals found!' },
    { speaker: 'Ice Fairy', text: 'The frost is starting to lift!' },
    { speaker: 'Ice Fairy', text: 'Now melt the Thaw Crystals!' },
  ],
  floor6_phase1_done: [
    { speaker: 'Crystal Fairy', text: 'All geo shards collected.' },
    { speaker: 'Crystal Fairy', text: 'The cavern hums with energy.' },
    { speaker: 'Crystal Fairy', text: 'Now align the Prism Shards.' },
  ],
  floor7_phase1_done: [
    { speaker: 'Market Fairy', text: 'All real tokens recovered!' },
    { speaker: 'Market Fairy', text: 'The fakes are crumbling!' },
    { speaker: 'Market Fairy', text: 'Now crack the Vault Seals!' },
  ],
  floor8_phase1_done: [
    { speaker: 'Book Fairy', text: 'All lost pages are restored.' },
    { speaker: 'Book Fairy', text: 'The book breathes again.' },
    { speaker: 'Book Fairy', text: 'Now bind the Chapter Seals.' },
  ],
  floor9_phase1_done: [
    { speaker: 'Elder Fairy', text: 'All equation pieces placed!' },
    { speaker: 'Elder Fairy', text: 'The equation is taking shape!' },
    { speaker: 'Elder Fairy', text: 'Now set the Equation Anchors!' },
  ],

  // ── PER-FLOOR PHASE 2 COMPLETION ──
  floor1_phase2_done: [
    { speaker: 'Elder Fairy', text: 'The Rune Stones glow bright!' },
    { speaker: 'Elder Fairy', text: 'The garden gate rumbles open.' },
    { speaker: 'Elder Fairy', text: 'The Briar King awaits you!' },
  ],
  floor2_phase2_done: [
    { speaker: 'Water Fairy', text: 'The Coral Keys shimmer!' },
    { speaker: 'Water Fairy', text: 'The tides are locked away!' },
    { speaker: 'Water Fairy', text: 'Face The Pressure now!' },
  ],
  floor3_phase2_done: [
    { speaker: 'Sky Fairy', text: 'The Wind Chimes sing!' },
    { speaker: 'Sky Fairy', text: 'Winds calm. Skies clear!' },
    { speaker: 'Sky Fairy', text: 'Time to face the Skywhale!' },
  ],
  floor4_phase2_done: [
    { speaker: 'Fire Fairy', text: 'The Lava Bridges hold!' },
    { speaker: 'Fire Fairy', text: 'A path to the Pyroclast!' },
    { speaker: 'Fire Fairy', text: 'Charge! No turning back!' },
  ],
  floor5_phase2_done: [
    { speaker: 'Ice Fairy', text: 'The Thaw Crystals melt!' },
    { speaker: 'Ice Fairy', text: 'The ice throne cracks open!' },
    { speaker: 'Ice Fairy', text: 'Absolute Zero trembles!' },
  ],
  floor6_phase2_done: [
    { speaker: 'Crystal Fairy', text: 'Prism Shards aligned.' },
    { speaker: 'Crystal Fairy', text: 'Light bends. Boss revealed.' },
    { speaker: 'Crystal Fairy', text: 'The Prism cannot hide now.' },
  ],
  floor7_phase2_done: [
    { speaker: 'Market Fairy', text: 'Vault Seals cracked!' },
    { speaker: 'Market Fairy', text: "The Counterfeiter's exposed!" },
    { speaker: 'Market Fairy', text: 'Time to settle the debt!' },
  ],
  floor8_phase2_done: [
    { speaker: 'Book Fairy', text: 'Chapter Seals bound tight.' },
    { speaker: 'Book Fairy', text: 'The book is whole again.' },
    { speaker: 'Book Fairy', text: 'The Paradox has nowhere to hide.' },
  ],
  floor9_phase2_done: [
    { speaker: 'Elder Fairy', text: 'Equation Anchors set!' },
    { speaker: 'All Fairies', text: 'The Great Equation holds!' },
    { speaker: 'Elder Fairy', text: 'Face The Theorem. End this!' },
  ],
};
