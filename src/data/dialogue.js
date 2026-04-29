/**
 * Story dialogue — text for every narrative trigger point.
 *
 * Each key maps to an array of { speaker, text } lines shown via
 * DialogueOverlay. Speakers: 'Elder Fairy', boss names, 'Narrator'.
 */

export const DIALOGUE = {
  // ── FLOOR 1: THE GARDEN ──
  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'Heroes! The Great Equation that holds our world together has shattered into five fragments.' },
    { speaker: 'Elder Fairy', text: 'The Number Eaters have swallowed each piece and hidden in their lairs.' },
    { speaker: 'Elder Fairy', text: 'This garden was once beautiful, but the Addition Fragment is fading. Find my three sisters trapped in fairy chests, then face the guardian!' },
  ],
  floor1_boss: [
    { speaker: 'Briar King', text: 'You think you can just ADD things up and win? Numbers mean nothing in MY garden!' },
    { speaker: 'Narrator', text: 'The Briar King blocks your path. Answer quickly — he grows stronger with every mistake!' },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The Addition Fragment is restored! The garden blooms again!' },
    { speaker: 'Elder Fairy', text: 'Four fragments remain. The Tidepool Ruins await...' },
  ],

  // ── FLOOR 2: TIDEPOOL RUINS ──
  floor2_entry: [
    { speaker: 'Water Fairy', text: 'The tides are wrong. Things that should be here are... missing.' },
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment was stolen by The Pressure. It hides deep in these ruins.' },
    { speaker: 'Water Fairy', text: 'Be careful — these creatures drain your strength!' },
  ],
  floor2_boss: [
    { speaker: 'The Pressure', text: 'I will subtract EVERYTHING from you. Your strength. Your hope. Your answers.' },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'The Subtraction Fragment returns! The tides flow true again.' },
    { speaker: 'Water Fairy', text: 'Three more fragments to find. The clouds above hold the next...' },
  ],

  // ── FLOOR 3: CLOUD MAZE ──
  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'Up here, the clouds are multiplying out of control!' },
    { speaker: 'Sky Fairy', text: 'The Multiplication Fragment powers this realm. Without it, everything duplicates endlessly.' },
  ],
  floor3_boss: [
    { speaker: 'Skywhale', text: 'I contain MULTITUDES! For every one of you, there are a thousand of me!' },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'The Multiplication Fragment is safe! The skies clear at last.' },
    { speaker: 'Sky Fairy', text: 'Two fragments remain. Descend into the Ember Caves...' },
  ],

  // ── FLOOR 4: EMBER CAVES ──
  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The caves are splitting apart! Lava divides every path!' },
    { speaker: 'Fire Fairy', text: 'The Division Fragment is cracking the earth itself. Please, stop Pyroclast before it\'s too late!' },
  ],
  floor4_boss: [
    { speaker: 'Pyroclast', text: 'I will DIVIDE you into ashes! Nothing survives the core!' },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'The Division Fragment is whole again! The caves grow still.' },
    { speaker: 'Fire Fairy', text: 'One final fragment. The Mending Room holds the last piece of the Great Equation...' },
  ],

  // ── FLOOR 5: MENDING ROOM ──
  floor5_entry: [
    { speaker: 'All Fairies', text: 'This is it. The final fragment lies within the Mending Room.' },
    { speaker: 'All Fairies', text: 'The Theorem guards the last piece. It knows every operation — addition, subtraction, multiplication, and division.' },
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

  // ── FAIRY FREED ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Thank you for freeing me! I was so scared in that chest!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All three of us are free! The golden treasure chest has appeared — but beware, the guardian stands watch!' },
  ],
};
