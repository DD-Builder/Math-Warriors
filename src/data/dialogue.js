/**
 * Story dialogue — text for every narrative trigger point.
 *
 * Each key maps to an array of { speaker, text } lines shown via
 * DialogueOverlay. Speakers: 'Elder Fairy', boss names, 'Narrator'.
 */

export const DIALOGUE = {
  // ── FLOOR 1: THE GARDEN (Challenge: Free 3 fairies) ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'Heroes! The Great Equation that holds our world together has shattered into five fragments.' },
    { speaker: 'Elder Fairy', text: 'The Number Eaters have swallowed each piece and hidden in their lairs.' },
    { speaker: 'Elder Fairy', text: 'Three fairies are trapped in enchanted chests throughout this garden. Free them all to unlock the golden treasure — then face the Briar King!' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'You think you can just ADD things up and win? Numbers mean nothing in MY garden!' },
    { speaker: 'Narrator', text: 'The Briar King blocks your path. Answer quickly!' },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment is restored! The garden blooms again!' },
    { speaker: 'Elder Fairy', text: 'Four fragments remain. The Tidepool Ruins await...' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS (Challenge: Activate 3 drain valves) ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'The tides are flooding these ruins! The Subtraction Fragment has been stolen by The Pressure.' },
    { speaker: 'Water Fairy', text: 'Three ancient drain valves are hidden in the depths. Find and activate all three to lower the water and reach the boss lair!' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'I will subtract EVERYTHING from you. Your strength. Your hope. Your answers.' },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment returns! The tides flow true again.' },
    { speaker: 'Water Fairy', text: 'Three more fragments to find. The clouds above hold the next...' },
  ],

  // ── FLOOR 3: CLOUD MAZE (Challenge: Light 3 sky beacons) ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'A terrible storm rages across the sky realm! The Multiplication Fragment has thrown everything into chaos.' },
    { speaker: 'Sky Fairy', text: 'Three sky beacons must be lit to part the clouds and reveal the Skywhale\'s lair. Find them scattered across the floating islands!' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'I contain MULTITUDES! For every one of you, there are a thousand of me!' },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'The Multiplication Fragment is safe! The skies clear at last.' },
    { speaker: 'Sky Fairy', text: 'Two fragments remain. Descend into the Ember Caves...' },
  ],

  // ── FLOOR 4: EMBER CAVES (Challenge: Seal 3 lava vents) ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves are splitting apart! Lava pours through every crack!' },
    { speaker: 'Fire Fairy', text: 'Three volcanic vents must be sealed before you can reach Pyroclast. Find them deep in the tunnels and shut them down!' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: 'I will DIVIDE you into ashes! Nothing survives the core!' },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The Division Fragment is whole again! The caves grow still.' },
    { speaker: 'Fire Fairy', text: 'One final fragment. The Mending Room holds the last piece of the Great Equation...' },
  ],

  // ── FLOOR 5: THE MENDING ROOM (Challenge: Place 3 equation fragments) ──
  floor5_entry: [
    { speaker: 'All Fairies', text: 'This is it — the final chamber where the Great Equation can be restored.' },
    { speaker: 'All Fairies', text: 'Three equation fragments are scattered on pedestals throughout this vast hall. Place each one to awaken The Theorem — then defeat it!' },
    { speaker: 'All Fairies', text: 'You must use EVERYTHING you\'ve learned. We believe in you!' },
  ],
  floor5_boss: [
    { speaker: 'The Theorem', text: 'I am the final equation. The unknown variable. Can you solve what you don\'t understand?' },
    { speaker: 'Narrator', text: 'The Theorem shifts between all four operations. Stay sharp!' },
  ],
  floor5_victory: [
    { speaker: 'All Fairies', text: 'The Great Equation is WHOLE again!' },
    { speaker: 'Elder Fairy', text: 'You did it, heroes! Math holds the world together, and you proved it.' },
    { speaker: 'Elder Fairy', text: 'The Number Eaters are defeated. Peace returns to every realm.' },
    { speaker: 'Narrator', text: 'Thank you for playing Math Warriors!' },
  ],

  // ── CHALLENGE PROGRESS ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you for freeing me! I was so scared in that chest!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All three of us are free! The golden treasure chest has appeared — but beware, the guardian stands watch!' },
  ],
};
