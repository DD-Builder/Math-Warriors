/**
 * Story dialogue — text for every narrative trigger point.
 *
 * Each key maps to an array of { speaker, text } lines shown via
 * DialogueOverlay. Speakers: 'Elder Fairy', boss names, 'Narrator'.
 */

export const DIALOGUE = {
  // ── FLOOR 1: THE GARDEN (Challenge: Free 3 fairies) ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'Heroes! The Great Equation has shattered into nine fragments!' },
    { speaker: 'Elder Fairy', text: 'The Number Eaters have swallowed each piece and hidden in their lairs.' },
    { speaker: 'Elder Fairy', text: 'Three fairies are trapped in enchanted chests throughout this garden. Free them all to unlock the golden treasure — then face the Briar King!' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'Foolish heroes! I AM addition — I grow stronger with every number!' },
    { speaker: 'Narrator', text: 'The Briar King towers before you. Show him the power of your math!' },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment is restored! The garden blooms again!' },
    { speaker: 'Elder Fairy', text: 'Eight fragments remain. The Tidepool Ruins await...' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS (Challenge: Activate 3 drain valves) ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'The tides are flooding these ruins! The Subtraction Fragment has been stolen by The Pressure.' },
    { speaker: 'Water Fairy', text: 'Three ancient drain valves are hidden in the depths. Find and activate all three to lower the water and reach the boss lair!' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'I will subtract your courage... your hope... your very ANSWERS!' },
    { speaker: 'Narrator', text: 'The deep rumbles. The Pressure awaits in the darkness below.' },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment returns! The tides flow true again.' },
    { speaker: 'Water Fairy', text: 'Keep going! The clouds above hold the next fragment...' },
  ],

  // ── FLOOR 3: CLOUD MAZE (Challenge: Light 3 sky beacons) ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'A terrible storm rages across the sky realm! The Multiplication Fragment has thrown everything into chaos.' },
    { speaker: 'Sky Fairy', text: 'Three sky beacons must be lit to part the clouds and reveal the Skywhale\'s lair. Find them scattered across the floating islands!' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'Ha ha ha! I multiply! For every one of me, a THOUSAND appear!' },
    { speaker: 'Narrator', text: 'The massive Skywhale fills the sky. Can you out-multiply it?' },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'The Multiplication Fragment is safe! The skies clear at last.' },
    { speaker: 'Sky Fairy', text: 'Onward! Descend into the Ember Caves...' },
  ],

  // ── FLOOR 4: EMBER CAVES (Challenge: Seal 3 lava vents) ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves are splitting apart! Lava pours through every crack!' },
    { speaker: 'Fire Fairy', text: 'Three volcanic vents must be sealed before you can reach Pyroclast. Find them deep in the tunnels and shut them down!' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: 'I divide EVERYTHING into ash! Your team, your numbers, your hopes!' },
    { speaker: 'Narrator', text: 'Pyroclast erupts with fury. Divide and conquer!' },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The Division Fragment is whole again! The caves grow still.' },
    { speaker: 'Fire Fairy', text: 'The journey continues. The Frozen Peak awaits above...' },
  ],

  // ── FLOOR 5: FROZEN PEAK (Challenge: Find 3 frozen crystals) ──
  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'Brrr! The mountain is frozen solid!' },
    { speaker: 'Ice Fairy', text: 'Find three frozen crystals to melt the path to Absolute Zero!' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'I am the coldest number... ZERO! Nothing escapes my freeze!' },
    { speaker: 'Narrator', text: 'Absolute Zero radiates icy power. Use fractions to crack the ice!' },
  ],
  floor5_victory: [
    { speaker: 'Ice Fairy', text: 'The Fractions Fragment is free! The peak thaws!' },
    { speaker: 'Ice Fairy', text: 'Deeper still... the Crystal Caverns glow below...' },
  ],

  // ── FLOOR 6: CRYSTAL CAVERNS (Challenge: Collect 3 geo shards) ──
  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'These caverns are alive with light and shape!' },
    { speaker: 'Crystal Fairy', text: 'Collect three geo shards to break The Prism\'s spell!' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'I bend light itself! Can you see through MY angles?' },
    { speaker: 'Narrator', text: 'The Prism shifts and shimmers. Think in shapes!' },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'The Geometry Fragment shines bright! The caverns are safe!' },
    { speaker: 'Crystal Fairy', text: 'Above ground, the Market Square needs help...' },
  ],

  // ── FLOOR 7: MARKET SQUARE (Challenge: Recover 3 gold tokens) ──
  floor7_entry: [
    { speaker: 'Market Fairy', text: 'The Market Square is in chaos! Fake coins everywhere!' },
    { speaker: 'Market Fairy', text: 'Find three real gold tokens to expose the Counterfeiter!' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: 'Real? Fake? Can YOU tell the difference? Ha ha ha!' },
    { speaker: 'Narrator', text: 'The Counterfeiter juggles coins. Count carefully!' },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'The Money Fragment is restored! Trade flows again!' },
    { speaker: 'Market Fairy', text: 'The ancient library holds the next secret...' },
  ],

  // ── FLOOR 8: INFINITY LIBRARY (Challenge: Restore 3 lost pages) ──
  floor8_entry: [
    { speaker: 'Book Fairy', text: 'The library\'s pages are scrambled! Nothing makes sense!' },
    { speaker: 'Book Fairy', text: 'Restore three lost pages to challenge The Paradox!' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: 'Words twist! Numbers flip! Can you solve a PARADOX?' },
    { speaker: 'Narrator', text: 'The Paradox warps reality. Read carefully!' },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'The Word Fragment is rewritten! Knowledge is power!' },
    { speaker: 'Book Fairy', text: 'One final challenge remains... The Mending Room calls...' },
  ],

  // ── FLOOR 9: THE MENDING ROOM (Challenge: Place 3 equation fragments) ──
  floor9_entry: [
    { speaker: 'All Fairies', text: 'This is it — the final chamber where the Great Equation can be restored.' },
    { speaker: 'All Fairies', text: 'Three equation fragments are scattered on pedestals throughout this vast hall. Place each one to awaken The Theorem — then defeat it!' },
    { speaker: 'All Fairies', text: 'You must use EVERYTHING you\'ve learned. We believe in you!' },
  ],
  floor9_boss: [
    { speaker: 'The Theorem', text: 'I am the final equation. The unknown variable. Can you solve... ME?' },
    { speaker: 'Narrator', text: 'The Theorem shifts between all operations. Use everything you have learned!' },
  ],
  floor9_victory: [
    { speaker: 'All Fairies', text: 'The Great Equation is WHOLE again!' },
    { speaker: 'Elder Fairy', text: 'You did it, heroes! Math holds the world together, and you proved it.' },
    { speaker: 'Elder Fairy', text: 'The Number Eaters are defeated. Peace returns to every realm.' },
    { speaker: 'Narrator', text: 'Thank you for playing Math Warriors!' },
  ],

  // ── BOSS HALF-HP REACTIONS ──
  floor1_boss_half: [
    { speaker: 'Briar King', text: 'Impossible! My roots are weakening!' },
  ],
  floor2_boss_half: [
    { speaker: 'The Pressure', text: 'The cracks are showing... NO!' },
  ],
  floor3_boss_half: [
    { speaker: 'Skywhale', text: 'I\'m... shrinking?!' },
  ],
  floor4_boss_half: [
    { speaker: 'Pyroclast', text: 'My core... it\'s cooling!' },
  ],
  floor5_boss_half: [
    { speaker: 'Absolute Zero', text: 'M-my ice... it\'s MELTING!' },
  ],
  floor6_boss_half: [
    { speaker: 'The Prism', text: 'My facets... cracking!' },
  ],
  floor7_boss_half: [
    { speaker: 'The Counterfeiter', text: 'My fakes... they\'re worthless!' },
  ],
  floor8_boss_half: [
    { speaker: 'The Paradox', text: 'The answer... it CAN\'T be right!' },
  ],
  floor9_boss_half: [
    { speaker: 'The Theorem', text: 'You... you actually understand!' },
  ],

  // ── CHALLENGE PROGRESS ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you for freeing me! I was so scared in that chest!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All three of us are free! The golden treasure chest has appeared — but beware, the guardian stands watch!' },
  ],
};
