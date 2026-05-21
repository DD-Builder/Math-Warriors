/**
 * Story dialogue — graphic-novel-style panels.
 *
 * Each key maps to an array of panel objects shown via CutsceneScene
 * or DialogueOverlay. Max ~50 chars per line, 1 sentence per panel.
 *
 * Fields: speaker, text, sprite (hero/enemy id), side ('left'/'right'), wide (bool)
 */

export const DIALOGUE = {
  // ── GAME INTRO (plays before Floor 1 on first game) ──
  game_intro: [
    { speaker: 'Elder Fairy', text: 'Welcome, brave heroes!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'I am Elara, keeper of balance.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Great Equation kept our world safe.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But it shattered into nine pieces!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Number Eaters stole every fragment.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Will you help us get them back?', side: 'left' },
  ],

  // ── WORLD MAP INTRO ──
  world_map_intro: [
    { speaker: 'Narrator', text: 'Nine realms. Nine fragments. One quest.', wide: true },
  ],

  // ── FIRST BATTLE ──
  first_battle: [
    { speaker: 'Elder Fairy', text: 'A Number Eater! Get ready!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Answer math to attack. You can do it!', side: 'left' },
  ],

  // ── HERO UNLOCK ──
  hero_unlock: [
    { speaker: 'Elder Fairy', text: 'The magic freed a new ally!', side: 'left' },
  ],

  // ── MID-FLOOR ENCOURAGEMENT ──
  mid_floor_encourage: [
    { speaker: 'Elder Fairy', text: "You're doing great! Keep going!", side: 'left' },
  ],

  // ── FLOOR 1: THE GARDEN ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'This is the Garden of Addition.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Walk carefully. The thorns listen.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Three fairies are trapped in cages!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Free them all to find the treasure.', side: 'left' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'Every wrong answer makes me STRONGER!', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'Answer quickly — it grows each turn!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment glows bright!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'One piece restored. Eight remain.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Tidepool Ruins call to us...', side: 'left' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'Oh no — the tides are rising fast!', side: 'left' },
    { speaker: 'Water Fairy', text: "We'll drown if we don't act!", side: 'left' },
    { speaker: 'Water Fairy', text: 'Find three drain valves! Please!', side: 'left' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'Down, down, down you go...', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'Subtract its power before it crushes you!', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'Oh thank goodness! The water recedes!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment is safe!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The clouds above hold the next piece...', side: 'left' },
  ],

  // ── FLOOR 3: CLOUD MAZE ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'Ha! A storm? I LOVE storms!', side: 'left' },
    { speaker: 'Sky Fairy', text: "Don't worry — I know these skies.", side: 'left' },
    { speaker: 'Sky Fairy', text: 'Light three sky beacons. Follow me!', side: 'left' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'One of me? Ha! Try a THOUSAND!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'Solve multiplication to shrink it down!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'HA! That whale never stood a chance!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiplication Fragment — ours!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Now dive into the Ember Caves!', side: 'left' },
  ],

  // ── FLOOR 4: EMBER CAVES ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves crack open! Move NOW!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Lava pours through every crack.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Seal three volcanic vents! GO!', side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: "I'll split you into pieces!", sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Use division to break through its armor!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The lava cools. We survived.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Division Fragment — secured!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Climb higher. The Frozen Peak awaits.', side: 'left' },
  ],

  // ── FLOOR 5: FROZEN PEAK ──
  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'B-brrr! I c-can barely move!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Everything is f-frozen solid!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Find three frozen c-crystals!', side: 'left' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'Feel that chill? Your courage... freezing.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Narrator', text: 'Fractions can crack the ice — aim true!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Ice Fairy', text: 'The ice m-melts! I can feel again!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'The Fractions Fragment is free!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'The Crystal Caverns glow b-below...', side: 'left' },
  ],

  // ── FLOOR 6: CRYSTAL CAVERNS ──
  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'Fascinating. Every facet is data.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The patterns here follow geometry.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Collect three geo shards. Precisely.', side: 'left' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'Every angle hides a trick.', sprite: 'theprism', side: 'right' },
    { speaker: 'Narrator', text: 'Think in shapes to see through it!', wide: true },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'Correct. The geometry resolves.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Geometry Fragment — catalogued.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The Market Square needs assistance.', side: 'left' },
  ],

  // ── FLOOR 7: MARKET SQUARE ──
  floor7_entry: [
    { speaker: 'Market Fairy', text: 'Ooh! Shiny coins everywhere!', side: 'left' },
    { speaker: 'Market Fairy', text: 'But careful — most are FAKES!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Find three real gold tokens!', side: 'left' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: "Real? Fake? Even I can't tell! Ha!", sprite: 'counterfeiter', side: 'right' },
    { speaker: 'Narrator', text: 'Count carefully — every coin matters!', wide: true },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'Best deal of the century!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Money Fragment — priceless!', side: 'left' },
    { speaker: 'Market Fairy', text: 'The ancient library holds secrets...', side: 'left' },
  ],

  // ── FLOOR 8: INFINITY LIBRARY ──
  floor8_entry: [
    { speaker: 'Book Fairy', text: 'The pages drift like lost poems...', side: 'left' },
    { speaker: 'Book Fairy', text: 'Every word has been scrambled.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Restore three lost pages. Gently.', side: 'left' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: "If I'm wrong, I'm right.", sprite: 'theparadox', side: 'right' },
    { speaker: 'The Paradox', text: "If I'm right... YOU'RE WRONG!", sprite: 'theparadox', side: 'right' },
    { speaker: 'Narrator', text: 'Read carefully — words twist here!', wide: true },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'The words settle back into place.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Word Fragment rewritten. Beautiful.', side: 'left' },
    { speaker: 'Book Fairy', text: 'One final chapter remains...', side: 'left' },
  ],

  // ── FLOOR 9: THE MENDING ROOM ──
  floor9_entry: [
    { speaker: 'All Fairies', text: 'Together at last! The final door!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'This is the Mending Room.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Place three equation fragments.', side: 'left' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you have learned!', side: 'left' },
  ],
  floor9_boss: [
    { speaker: 'The Theorem', text: 'I am every question you ever feared.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'Solve me... if you can.', sprite: 'theorem', side: 'right' },
  ],
  floor9_victory: [
    { speaker: 'The Theorem', text: 'You... solved me.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'The answer was inside you all along.', sprite: 'theorem', side: 'right' },
    { speaker: 'Water Fairy', text: 'The tides flow true again!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The skies are clear! Finally!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The flames rest. Well fought.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Great Equation glows bright.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You brought balance back to our world.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'True heroes. Every one of you.', side: 'left' },
  ],

  // ── BOSS HALF-HP REACTIONS (in-battle toasts) ──
  floor1_boss_half: [
    { speaker: 'Briar King', text: 'My roots are weakening!' },
  ],
  floor2_boss_half: [
    { speaker: 'The Pressure', text: 'The cracks are showing!' },
  ],
  floor3_boss_half: [
    { speaker: 'Skywhale', text: "I'm... shrinking?!" },
  ],
  floor4_boss_half: [
    { speaker: 'Pyroclast', text: "My core... it's cooling!" },
  ],
  floor5_boss_half: [
    { speaker: 'Absolute Zero', text: "My ice... it's MELTING!" },
  ],
  floor6_boss_half: [
    { speaker: 'The Prism', text: 'My facets... cracking!' },
  ],
  floor7_boss_half: [
    { speaker: 'The Counterfeiter', text: "My fakes... they're worthless!" },
  ],
  floor8_boss_half: [
    { speaker: 'The Paradox', text: "The answer... it CAN'T be right!" },
  ],
  floor9_boss_half: [
    { speaker: 'The Theorem', text: 'You... you actually understand!' },
  ],

  // ── IN-MAZE SMALL MOMENTS (DialogueOverlay) ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you! I was so scared!' },
    { speaker: 'Rescued Fairy', text: 'Keep going — the others need you!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All of us are free!' },
    { speaker: 'Rescued Fairy', text: 'The golden treasure has appeared!' },
  ],
};
