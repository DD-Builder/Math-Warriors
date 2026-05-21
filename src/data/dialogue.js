/**
 * Story dialogue — graphic-novel-style panels.
 *
 * Each key maps to an array of panel objects shown via CutsceneScene.
 * Panels are full-screen with character art + speech bubble.
 *
 * Fields per panel:
 *   speaker  - character name shown in gold
 *   text     - max ~50 chars, 1 short sentence per panel
 *   sprite   - hero/enemy id for character art (optional)
 *   side     - 'left' or 'right' for character placement (optional)
 *   wide     - true for centered narrator text, no character art
 */

export const DIALOGUE = {
  // ── FLOOR 1: THE GARDEN ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'Heroes! The Great Equation shattered!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Nine fragments... scattered everywhere!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Three fairies are trapped here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Free them all! Find the treasure!', side: 'left' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'I AM addition! I only grow!', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'The Briar King blocks your path!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment is restored!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Tidepool Ruins await...', side: 'left' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'The tides are flooding everything!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Find three drain valves. Hurry!', side: 'left' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'I subtract your courage!', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'The deep rumbles with danger...', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment is safe!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The clouds hold the next piece...', side: 'left' },
  ],

  // ── FLOOR 3: CLOUD MAZE ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'A terrible storm rages above!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Light three sky beacons!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Part the clouds. Find the lair!', side: 'left' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'I multiply! A THOUSAND of me!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'The Skywhale fills the sky!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'Multiplication Fragment secured!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Onward! Into the Ember Caves!', side: 'left' },
  ],

  // ── FLOOR 4: EMBER CAVES ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves are splitting apart!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Seal three volcanic vents!', side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: 'I divide EVERYTHING into ash!', sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Pyroclast erupts with fury!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The Division Fragment is whole!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The Frozen Peak awaits above...', side: 'left' },
  ],

  // ── FLOOR 5: FROZEN PEAK ──
  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'Brrr! Everything is frozen solid!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Find three frozen crystals!', side: 'left' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'I am the coldest number... ZERO!', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Narrator', text: 'Use fractions to crack the ice!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Ice Fairy', text: 'The Fractions Fragment is free!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'The Crystal Caverns glow below...', side: 'left' },
  ],

  // ── FLOOR 6: CRYSTAL CAVERNS ──
  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'These caverns shimmer with light!', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Collect three geo shards!', side: 'left' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'I bend light itself!', sprite: 'theprism', side: 'right' },
    { speaker: 'Narrator', text: 'The Prism shifts and shimmers!', wide: true },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'The Geometry Fragment shines!', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'The Market Square needs help...', side: 'left' },
  ],

  // ── FLOOR 7: MARKET SQUARE ──
  floor7_entry: [
    { speaker: 'Market Fairy', text: 'Chaos! Fake coins everywhere!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Find three real gold tokens!', side: 'left' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: 'Real? Fake? Can YOU tell?', sprite: 'counterfeiter', side: 'right' },
    { speaker: 'Narrator', text: 'Count your coins carefully!', wide: true },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'The Money Fragment is restored!', side: 'left' },
    { speaker: 'Market Fairy', text: 'The ancient library awaits...', side: 'left' },
  ],

  // ── FLOOR 8: INFINITY LIBRARY ──
  floor8_entry: [
    { speaker: 'Book Fairy', text: 'The pages are all scrambled!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Restore three lost pages!', side: 'left' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: 'Words twist! Numbers flip!', sprite: 'theparadox', side: 'right' },
    { speaker: 'Narrator', text: 'The Paradox warps reality!', wide: true },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'The Word Fragment is rewritten!', side: 'left' },
    { speaker: 'Book Fairy', text: 'One final challenge remains...', side: 'left' },
  ],

  // ── FLOOR 9: THE MENDING ROOM ──
  floor9_entry: [
    { speaker: 'All Fairies', text: 'This is it. The final chamber!', side: 'left' },
    { speaker: 'All Fairies', text: 'Place three equation fragments!', side: 'left' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you learned!', side: 'left' },
  ],
  floor9_boss: [
    { speaker: 'The Theorem', text: 'I am the final equation!', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'Can you solve... ME?', sprite: 'theorem', side: 'right' },
  ],
  floor9_victory: [
    { speaker: 'All Fairies', text: 'The Great Equation is WHOLE!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You did it, heroes!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Math holds the world together.', side: 'left' },
    { speaker: 'Narrator', text: 'Thank you for playing!', wide: true },
  ],

  // ── BOSS HALF-HP REACTIONS (shown as in-battle toasts) ──
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

  // ── IN-MAZE SMALL MOMENTS (still use DialogueOverlay) ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you for freeing me!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All free! The treasure appeared!' },
  ],
};
