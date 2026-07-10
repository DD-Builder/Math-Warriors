/**
 * Story dialogue — graphic-novel-style panels.
 *
 * CutsceneScene splits lines into 3 visual scenes:
 *   Scene 1 (fairy solo, big sparkly) — first third of lines
 *   Scene 2 (fairy + hero party) — middle third
 *   Scene 3 (fairy solo close) — final third
 * Multiple lines per scene — player taps to advance within each.
 * Max ~55 chars per line to prevent overflow.
 *
 * THE NINE HARMONIES — story arc:
 *   The Kingdom of Numeria is held together by nine Harmonies,
 *   one per realm. The Chaos King shattered them, breaking each
 *   realm in a themed way. Each floor's math concept is the tool
 *   that repairs it. (The final boss "The Theorem" in the enemy
 *   data is the Chaos King's battle name.)
 */

export const DIALOGUE = {
  // ── GAME INTRO ──
  game_intro: [
    { speaker: 'Narrator', text: 'The Kingdom of Numeria hums with nine Harmonies.', wide: true },
    { speaker: 'Narrator', text: 'One for each realm. Together, they sing.', wide: true },
    { speaker: 'Elara', text: 'I am Elara, keeper of the Harmonies.', side: 'left' },
    { speaker: 'Elara', text: 'The Chaos King smashed them. Every one!', side: 'left' },
    { speaker: 'Elara', text: 'Now each realm is broken in its own way.', side: 'left' },
    { speaker: 'Elara', text: 'Bridges gone. Tides stuck. Lava loose!', side: 'left' },
    { speaker: 'Elara', text: 'But math can mend what chaos breaks.', side: 'left' },
    { speaker: 'Elara', text: 'I need heroes who love a good puzzle.', side: 'left' },
    { speaker: 'Elara', text: 'Will you help me fix Numeria?', side: 'left' },
  ],

  world_map_intro: [
    { speaker: 'Narrator', text: 'Nine realms. Nine broken Harmonies.', wide: true },
    { speaker: 'Narrator', text: 'Mend them all to reach the Chaos King.', wide: true },
  ],

  first_battle: [
    { speaker: 'Elara', text: 'A Number Eater blocks the way!', side: 'left' },
    { speaker: 'Elara', text: 'Solve the math to send it packing!', side: 'left' },
    { speaker: 'Elara', text: 'Show it what heroes can do!', side: 'left' },
  ],

  hero_unlock: [
    { speaker: 'Elara', text: 'You freed a new ally!', side: 'left' },
  ],

  mid_floor_encourage: [
    { speaker: 'Elara', text: 'Almost there! Keep solving!', side: 'left' },
  ],

  phase2_start: [
    { speaker: 'Elara', text: 'New things to find have appeared!', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 1: THE GARDEN — "The Missing Bridge"
  // Math: ADDITION. Free 3 fairies; their magic
  // ADDS together to weave the flower bridge.
  // ══════════════════════════════════════

  floor1_entry: [
    { speaker: 'Elara', text: 'Welcome to the Garden... oh dear.', side: 'left' },
    { speaker: 'Elara', text: 'The Briar King caged the 3 garden fairies!', side: 'left' },
    { speaker: 'Elara', text: 'Without them, nothing new can grow.', side: 'left' },
    { speaker: 'Elara', text: 'And the flower bridge is GONE.', side: 'left' },
    { speaker: 'Elara', text: 'Free all three fairies, my hero.', side: 'left' },
    { speaker: 'Elara', text: 'Their magic ADDS together, you see.', side: 'left' },
    { speaker: 'Elara', text: 'Enough added magic can weave a bridge!', side: 'left' },
    { speaker: 'Elara', text: 'Watch out for thorns. Let us go!', side: 'left' },
  ],
  floor1_mid_explore: [
    { speaker: 'Elara', text: 'These briars were not here before.' },
    { speaker: 'Elara', text: 'The Briar King is hiding something.' },
    { speaker: 'Elara', text: 'Keep adding! The fairies need you!' },
  ],
  floor1_boss: [
    { speaker: 'Elara', text: 'The Briar King guards his grove!', side: 'left' },
    { speaker: 'Briar King', text: 'My thorns grew one by one by one!', sprite: 'briarking', side: 'right' },
    { speaker: 'Briar King', text: 'No bridge! No blooms! No PASSING!', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'Add fast and prune this grump!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elara', text: 'You did it! You added their magic!', side: 'left' },
    { speaker: 'Elara', text: 'One fairy, plus one, plus one more!', side: 'left' },
    { speaker: 'Elara', text: 'Together they wove the flower bridge!', side: 'left' },
    { speaker: 'Elara', text: 'The Garden Harmony sings again!', side: 'left' },
    { speaker: 'Elara', text: 'One Harmony mended. Eight to go!', side: 'left' },
    { speaker: 'Elara', text: 'I hear water sloshing next door.', side: 'left' },
    { speaker: 'Elara', text: 'The Tidepool tide is stuck too high!', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 2: TIDEPOOL RUINS — "The Stuck Tide"
  // Math: SUBTRACTION. Open 4 tide sluices;
  // each one SUBTRACTS the flood and surfaces
  // a drowned district of Ebbport.
  // ══════════════════════════════════════

  floor2_entry: [
    { speaker: 'Marlow', text: 'A hundred years I kept this lantern lit.', side: 'left' },
    { speaker: 'Marlow', text: 'Welcome to Ebbport. What the sea left of it.', side: 'left' },
    { speaker: 'Elara', text: 'A whole city... drowned?', side: 'right' },
    { speaker: 'Marlow', text: 'The Pressure jammed our tide-heart HIGH.', side: 'left' },
    { speaker: 'Marlow', text: 'Four sluices can walk the sea back down.', side: 'left' },
    { speaker: 'Marlow', text: 'Each one SUBTRACTS a measure of flood.', side: 'left' },
    { speaker: 'Marlow', text: 'Less water, less water... until dry land.', side: 'left' },
    { speaker: 'Marlow', text: 'Open them, and Ebbport breathes again.', side: 'left' },
  ],
  floor2_fairy_talk: [
    { speaker: 'Marlow', text: 'Market Row! Surfacing after a hundred years!' },
    { speaker: 'Marlow', text: 'The stalls, the cobbles... all still here.' },
    { speaker: 'Elara', text: 'Every answer sinks the tide a little more.' },
    { speaker: 'Marlow', text: 'Keep subtracting. Drain it street by street.' },
  ],
  floor2_boss: [
    { speaker: 'Marlow', text: 'The Deep Basin! And the thing that jammed it.', side: 'left' },
    { speaker: 'The Pressure', text: 'Who DARES subtract my beautiful flood?!', sprite: 'pressure', side: 'right' },
    { speaker: 'The Pressure', text: 'I am the high tide! Endless! RISING!', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'Take the flood away. Subtract it to nothing!', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Marlow', text: 'The tide-heart turns. Feel it breathe!', side: 'left' },
    { speaker: 'Marlow', text: 'Low tide. Real, honest low tide again!', side: 'left' },
    { speaker: 'Elara', text: 'Ebbport rises from the water at last.', side: 'left' },
    { speaker: 'Elara', text: 'The Tide Harmony hums, mended and whole.', side: 'left' },
    { speaker: 'Elara', text: 'Two Harmonies mended! Seven to go.', side: 'left' },
    { speaker: 'Elara', text: 'Next: the sky-maze, where light MULTIPLIES.', side: 'left' },
    { speaker: 'Elara', text: 'I hope you like heights!', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 3: THE SHATTERED SKY — "The Doubling Light"
  // Math: MULTIPLICATION. Each of 4 beacons DOUBLES
  // the light: bridges of 2, 4, 8 tiles — then 16 at
  // once flood the Eye of the Storm. Guide: Zephyr,
  // the sky-shepherd who lost his cloud-sheep.
  // ══════════════════════════════════════

  floor3_entry: [
    { speaker: 'Zephyr', text: 'Mind the gap! The sky is in PIECES.', side: 'left' },
    { speaker: 'Zephyr', text: 'The Skywhale swallowed the Sun-Seed.', side: 'left' },
    { speaker: 'Zephyr', text: 'No light, no bridges. My sheep scattered!', side: 'left' },
    { speaker: 'Elara', text: 'Then we relight the beacons.', side: 'right' },
    { speaker: 'Zephyr', text: 'One beacon makes a LITTLE bridge.', side: 'left' },
    { speaker: 'Zephyr', text: 'But light MULTIPLIES: two, four, eight!', side: 'left' },
    { speaker: 'Zephyr', text: 'Four beacons — SIXTEEN bridges at once!', side: 'left' },
    { speaker: 'Zephyr', text: 'Enough to reach the Eye of the Storm.', side: 'left' },
  ],
  floor3_mid_explore: [
    { speaker: 'Zephyr', text: 'Feel that? The wind is grumpy.' },
    { speaker: 'Zephyr', text: 'The Skywhale circles the Eye below us.' },
    { speaker: 'Elara', text: 'Is it dangerous, Zephyr?' },
    { speaker: 'Zephyr', text: 'Only until we relight the sky!' },
    { speaker: 'Zephyr', text: 'Keep doubling that glow. And heroes —' },
    { speaker: 'Zephyr', text: 'if you spot my sheep, give them a pat.' },
  ],
  floor3_boss: [
    { speaker: 'Zephyr', text: 'The Eye of the Storm! Hold on tight!', side: 'left' },
    { speaker: 'Skywhale', text: 'WHO multiplied all this LIGHT?!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Skywhale', text: 'I ate the sun to nap in the dark!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'Double your light until it bursts free!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Zephyr', text: 'The Skywhale coughed up the Sun-Seed!', side: 'left' },
    { speaker: 'Zephyr', text: 'Two, four, eight, SIXTEEN bridges!', side: 'left' },
    { speaker: 'Zephyr', text: 'Light reaches every island again.', side: 'left' },
    { speaker: 'Elara', text: 'The Sky Harmony shines once more.', side: 'left' },
    { speaker: 'Elara', text: 'Three mended! You are on a roll.', side: 'left' },
    { speaker: 'Zephyr', text: 'The next realm is toasty. VERY toasty.', side: 'left' },
    { speaker: 'Elara', text: 'The Ember Caves. Pack a fan!', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 4: EMBER CAVES — "Divide the Fire"
  // Math: DIVISION. Seal 4 vents; the ONE giant
  // lava flow DIVIDES — in two, in four — until
  // thin streams cool into crossings and the
  // caldera itself cools. Guide: Cinder, the
  // last forge-imp.
  // ══════════════════════════════════════

  floor4_entry: [
    { speaker: 'Cinder', text: 'Watch your boots! ONE giant flow!', side: 'left' },
    { speaker: 'Cinder', text: 'Pyroclast merged every tame stream.', side: 'left' },
    { speaker: 'Cinder', text: 'Now NOBODY crosses. Not even imps.', side: 'left' },
    { speaker: 'Elara', text: 'Then how do we reach the caldera?', side: 'right' },
    { speaker: 'Cinder', text: 'Division! Seal a vent — the flow SPLITS.', side: 'left' },
    { speaker: 'Cinder', text: 'Halve it, halve it again: thin streams.', side: 'left' },
    { speaker: 'Cinder', text: 'Thin streams cool into rock you can walk.', side: 'left' },
    { speaker: 'Cinder', text: 'What you cannot cross whole... cross in PARTS.', side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Cinder', text: 'The caldera! And its fiery keeper!', side: 'left' },
    { speaker: 'Pyroclast', text: 'ONE big lava river! My masterpiece!', sprite: 'pyroclast', side: 'right' },
    { speaker: 'Pyroclast', text: 'You DIVIDED it into drizzles?!', sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Divide his fire until it cools!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Cinder', text: 'You divided that mega-flow to bits!', side: 'left' },
    { speaker: 'Cinder', text: 'Halved, and halved, and halved again!', side: 'left' },
    { speaker: 'Cinder', text: 'The tame streams sing in the forge!', side: 'left' },
    { speaker: 'Elara', text: 'The Ember Harmony crackles with joy.', side: 'left' },
    { speaker: 'Cinder', text: 'Four Harmonies fixed! You rock!', side: 'left' },
    { speaker: 'Elara', text: 'The next peak is the opposite of toasty.', side: 'left' },
    { speaker: 'Elara', text: 'The Frozen Peak. Bring mittens!', side: 'left' },
    { speaker: 'Cinder', text: 'Take an ember. For your toes.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 5: FROZEN PEAK — "The Frozen Falls"
  // Math: MIXED OPERATIONS. Kindle thaw-crystals
  // (each needs a different operation) to MELT
  // the falls into climbable steps.
  // ══════════════════════════════════════

  floor5_entry: [
    { speaker: 'Frost', text: 'B-brrr! Welcome to the Frozen Peak!', side: 'left' },
    { speaker: 'Frost', text: 'Absolute Zero froze the Great Spring.', side: 'left' },
    { speaker: 'Frost', text: 'Every river in Numeria starts up there.', side: 'left' },
    { speaker: 'Elara', text: 'How do we climb, Frost?', side: 'left' },
    { speaker: 'Frost', text: 'The Four Keys of Thaw! Four crystals:', side: 'left' },
    { speaker: 'Frost', text: 'Sums, Differences, Products, Quotients.', side: 'left' },
    { speaker: 'Frost', text: 'Each answers ONLY to its own math.', side: 'left' },
    { speaker: 'Frost', text: 'Wake one, and one wall of ice melts.', side: 'left' },
    { speaker: 'Elara', text: 'Then let us warm this mountain up!', side: 'left' },
  ],
  floor5_mid_explore: [
    { speaker: 'Frost', text: 'Br-r-r. The wind has icicles in it.' },
    { speaker: 'Elara', text: 'Every right answer warms the air.' },
    { speaker: 'Frost', text: 'Then answer LOTS! I want a scarf.' },
    { speaker: 'Frost', text: 'Psst — something WARM is up there.' },
    { speaker: 'Frost', text: 'Frozen mid-hop, poor thing.' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'Welcome to my perfectly frozen falls.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'Not one drip. Not one drop. Lovely.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Frost', text: 'Water is meant to MOVE, you ice cube!', side: 'left' },
    { speaker: 'Frost', text: 'Melt him, heroes! Mix up your math!', side: 'left' },
    { speaker: 'Narrator', text: 'Use every operation to thaw the spring!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Absolute Zero', text: 'My falls! They are... flowing.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'Drip. Drop. Hmm. It IS a nice sound.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Frost', text: 'All four Keys of Thaw, turned true!', side: 'left' },
    { speaker: 'Frost', text: 'Adding, times, take-away, sharing!', side: 'left' },
    { speaker: 'Frost', text: 'The Great Spring flows down the peak!', side: 'left' },
    { speaker: 'Elara', text: 'The Frost Harmony twinkles again.', side: 'left' },
    { speaker: 'Elara', text: 'Five mended! More than halfway!', side: 'left' },
    { speaker: 'Frost', text: 'Blaze says thanks for the defrost.', side: 'left' },
    { speaker: 'Elara', text: 'Next: caverns where light has SHAPES.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 6: CRYSTAL CAVERNS — "The Humming Wall"
  // Math: MATH FACTS. Tune 3 geodes to the right
  // numbers to SHATTER the resonant crystal wall.
  // ══════════════════════════════════════

  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'Shh! Hear that hum? That is the wall.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'A crystal wall seals the Prism Chamber.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Only a perfect chord can crack it.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Tune three geodes to the right numbers!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Like singing, but with math facts!', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Exactly! Quick facts, true notes.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'I call the loudest geode!', side: 'left' },
    { speaker: 'Elara', text: 'Fast facts and steady hands, heroes.', side: 'left' },
    { speaker: 'Elara', text: 'Let us tune this cave!', side: 'left' },
  ],
  floor6_fairy_talk: [
    { speaker: 'Crystal Fairy', text: 'Each geode hums a number.' },
    { speaker: 'Water Fairy', text: 'This one hums a seven. I think.' },
    { speaker: 'Fire Fairy', text: 'Mine hums OFF-KEY. Rude.' },
    { speaker: 'Elara', text: 'Then tune it true, quick as a wink!' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'Who is tapping on my lovely wall?', sprite: 'theprism', side: 'right' },
    { speaker: 'The Prism', text: 'It took AGES to hum it shut!', sprite: 'theprism', side: 'right' },
    { speaker: 'Elara', text: 'Your math facts are the true notes!', side: 'left' },
    { speaker: 'Narrator', text: 'Answer fast! Shatter the wall!', wide: true },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'The chord rang true, and CRASH!', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'You tuned every geode perfectly!', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Your fast facts shattered the wall!', side: 'left' },
    { speaker: 'Elara', text: 'The Crystal Harmony glitters again.', side: 'left' },
    { speaker: 'Elara', text: 'Six Harmonies mended! Three left.', side: 'left' },
    { speaker: 'Water Fairy', text: 'Next is the Market Square!', side: 'left' },
    { speaker: 'Elara', text: 'Bring your counting coins, hero.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 7: MARKET SQUARE — "The Stolen Ledgers"
  // Math: MONEY MATH. The Counterfeiter stole the
  // town ledgers; balancing the books with real
  // coins lowers the stuck drawbridge.
  // ══════════════════════════════════════

  floor7_entry: [
    { speaker: 'Market Fairy', text: 'Oh no, oh no! The books are GONE!', side: 'left' },
    { speaker: 'Market Fairy', text: 'The Counterfeiter swiped our ledgers!', side: 'left' },
    { speaker: 'Market Fairy', text: 'He locked them in his big brass vault', side: 'left' },
    { speaker: 'Market Fairy', text: 'and flooded the square with fake coins!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Now the drawbridge is stuck straight UP!', side: 'left' },
    { speaker: 'Market Fairy', text: 'It will not budge till the books balance.', side: 'left' },
    { speaker: 'Market Fairy', text: 'Find the three REAL gold tokens first.', side: 'left' },
    { speaker: 'Elara', text: 'Money math to the rescue!', side: 'left' },
    { speaker: 'Elara', text: 'Count carefully, hero. Off we go!', side: 'left' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: 'Going once! Going twice! All FAKE!', sprite: 'counterfeiter', side: 'right' },
    { speaker: 'The Counterfeiter', text: 'Your precious ledgers? MINE now!', sprite: 'counterfeiter', side: 'right' },
    { speaker: 'Market Fairy', text: 'Give back our books, you swindler!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Count him down, hero!', side: 'left' },
    { speaker: 'Narrator', text: 'Count every coin to win!', wide: true },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'The ledgers are back! Every page!', side: 'left' },
    { speaker: 'Market Fairy', text: 'You counted every coin just right!', side: 'left' },
    { speaker: 'Market Fairy', text: 'The books balance to the last penny!', side: 'left' },
    { speaker: 'Narrator', text: 'CREEEAK... the drawbridge lowers!', wide: true },
    { speaker: 'Elara', text: 'The Market Harmony rings like a till.', side: 'left' },
    { speaker: 'Elara', text: 'Seven mended! Two Harmonies left.', side: 'left' },
    { speaker: 'Market Fairy', text: 'Across the bridge is the great Library.', side: 'left' },
    { speaker: 'Elara', text: 'I hear its story got torn apart...', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 8: THE LIBRARY — "The Torn Story"
  // Math: FRACTIONS. Restore 3 torn pages; whole
  // pages rebuild the story stairs to the Archive.
  // ══════════════════════════════════════

  floor8_entry: [
    { speaker: 'Book Fairy', text: 'The great story! It is torn to bits!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Halves and thirds and quarters, everywhere!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Pages flutter around like snow.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Each piece is a fraction of the tale.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Match the fractions to mend each page.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Whole pages rebuild the story stairs!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Up the shelf canyon to the Archive!', side: 'left' },
    { speaker: 'Elara', text: 'Piece by piece, part by part.', side: 'left' },
    { speaker: 'Elara', text: 'Let us put this tale back together!', side: 'left' },
  ],
  floor8_mid_explore: [
    { speaker: 'Book Fairy', text: 'Look! Half a page over here!' },
    { speaker: 'Book Fairy', text: 'And a quarter stuck to a shelf!' },
    { speaker: 'Elara', text: 'A half plus two quarters makes...' },
    { speaker: 'Book Fairy', text: 'A whole page! You are getting it!' },
    { speaker: 'Elara', text: 'Fractions make wholes. On we go!' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: 'I tore the tale into tiny pieces!', sprite: 'theparadox', side: 'right' },
    { speaker: 'The Paradox', text: 'Half of a half of a half! Ha!', sprite: 'theparadox', side: 'right' },
    { speaker: 'Book Fairy', text: 'Stories want to be WHOLE!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Show it your fractions, hero!', side: 'left' },
    { speaker: 'Narrator', text: 'Make the pieces whole to win!', wide: true },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'Every torn page is whole again!', side: 'left' },
    { speaker: 'Book Fairy', text: 'You matched every fraction perfectly!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Halves and quarters, back to wholes!', side: 'left' },
    { speaker: 'Narrator', text: 'The story stairs stack themselves up!', wide: true },
    { speaker: 'Elara', text: 'The Story Harmony whispers its thanks.', side: 'left' },
    { speaker: 'Elara', text: 'Eight mended. One Harmony left.', side: 'left' },
    { speaker: 'Book Fairy', text: 'The last page shows a dark castle.', side: 'left' },
    { speaker: 'All Fairies', text: 'The Castle of Chaos!', side: 'left' },
    { speaker: 'Elara', text: 'Time to meet the Chaos King.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 9: CASTLE OF CHAOS — "The Void Breach"
  // Math: EVERYTHING. Light 3 harmony sigils (one
  // per mastered skill) to SEAL the breach; the
  // final bridge forms to the Chaos King's throne.
  // ══════════════════════════════════════

  floor9_entry: [
    { speaker: 'All Fairies', text: 'The Castle of Chaos. Gulp.', side: 'left' },
    { speaker: 'Elara', text: 'Steady, friends. See that great crack?', side: 'left' },
    { speaker: 'Elara', text: 'A void breach splits the whole castle.', side: 'left' },
    { speaker: 'Elara', text: 'The Chaos King made it, hero.', side: 'left' },
    { speaker: 'Elara', text: 'Light the three harmony sigils.', side: 'left' },
    { speaker: 'Elara', text: 'One for each math skill you mastered.', side: 'left' },
    { speaker: 'Elara', text: 'Their light will SEAL the breach.', side: 'left' },
    { speaker: 'Elara', text: 'Then a bridge will form to his throne.', side: 'left' },
    { speaker: 'All Fairies', text: 'Every Harmony is cheering for you!', side: 'left' },
  ],
  floor9_mid_explore: [
    { speaker: 'Chaos King', text: 'Heroes? In MY splendidly messy castle?' },
    { speaker: 'Chaos King', text: 'I like my numbers scrambled!' },
    { speaker: 'Chaos King', text: 'Seven plus banana equals Tuesday!' },
    { speaker: 'Elara', text: 'Oh dear. He really needs our help.' },
    { speaker: 'Elara', text: 'Light those sigils, quick!' },
  ],
  floor9_boss: [
    { speaker: 'Elara', text: 'The Chaos King! Called The Theorem!', side: 'left' },
    { speaker: 'Chaos King', text: 'I smashed all nine Harmonies! ME!', sprite: 'theorem', side: 'right' },
    { speaker: 'Chaos King', text: 'Chaos forever! No more neat answers!', sprite: 'theorem', side: 'right' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you have learned!', side: 'left' },
    { speaker: 'Narrator', text: 'The final challenge begins!', wide: true },
  ],
  floor9_victory: [
    { speaker: 'Chaos King', text: 'My breach! It is... sealed?', sprite: 'theorem', side: 'right' },
    { speaker: 'Chaos King', text: 'Your answers fit together so neatly.', sprite: 'theorem', side: 'right' },
    { speaker: 'Chaos King', text: 'Adding, sharing, halves, coins...', sprite: 'theorem', side: 'right' },
    { speaker: 'Chaos King', text: 'Maybe order is not so boring after all.', sprite: 'theorem', side: 'right' },
    { speaker: 'Elara', text: 'All nine Harmonies are singing!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The tide rolls just right!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The beacons blaze bright!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The lava naps in its streams!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'The falls splash and sparkle!', side: 'left' },
    { speaker: 'Elara', text: 'You mended a whole kingdom with math.', side: 'left' },
    { speaker: 'Elara', text: 'Adding, subtracting, sharing, solving!', side: 'left' },
    { speaker: 'Elara', text: 'Numeria will sing your name forever.', side: 'left' },
    { speaker: 'Elara', text: 'True heroes. Every one of you.', side: 'left' },
  ],

  // ── BOSS HALF-HP REACTIONS (repair moments) ──
  floor1_boss_half: [{ speaker: 'Briar King', text: 'My thorns! Your adding untangles them!' }],
  floor2_boss_half: [{ speaker: 'The Pressure', text: 'Glub! You subtract faster than I flood!' }],
  floor3_boss_half: [{ speaker: 'Skywhale', text: 'Your light multiplies! Too bright! TOO BRIGHT!' }],
  floor4_boss_half: [{ speaker: 'Pyroclast', text: 'You split my mighty fire into puny sparks!' }],
  floor5_boss_half: [{ speaker: 'Absolute Zero', text: 'Brrr... is it getting WARM in here?' }],
  floor6_boss_half: [{ speaker: 'The Prism', text: 'That note! You tuned it TRUE!' }],
  floor7_boss_half: [{ speaker: 'The Counterfeiter', text: 'You counted my coins CORRECTLY?!' }],
  floor8_boss_half: [{ speaker: 'The Paradox', text: 'You put my torn pieces back in ORDER?!' }],
  floor9_boss_half: [{ speaker: 'The Theorem', text: 'My lovely chaos... it is adding UP?!' }],

  // ── BOSS QUARTER-HP (key moments only) ──
  floor1_boss_quarter: [{ speaker: 'Briar King', text: 'My briars droop... ooh, pretty petals!' }],
  floor5_boss_quarter: [{ speaker: 'Absolute Zero', text: 'My throne is dripping! How undignified!' }],
  floor9_boss_quarter: [{ speaker: 'The Theorem', text: 'These Harmonies... are rather catchy.' }],

  // ── FLOOR-SPECIFIC DEFEAT ENCOURAGEMENT ──
  floor1_defeat: [
    { speaker: 'Elara', text: 'The fairies still believe in you!' },
    { speaker: 'Elara', text: 'Rest up, add up, and try again!' },
  ],
  floor5_defeat: [
    { speaker: 'Ice Fairy', text: 'Even glaciers move, bit by bit.' },
    { speaker: 'Ice Fairy', text: 'Warm up and try again, hero!' },
  ],
  floor9_defeat: [
    { speaker: 'Elara', text: 'The Chaos King is tricky, not unbeatable.' },
    { speaker: 'Elara', text: 'Every try makes you stronger.' },
    { speaker: 'Elara', text: 'The Harmonies are still cheering!' },
  ],

  // ── ENDING EPILOGUE ──
  game_ending: [
    { speaker: 'Narrator', text: 'Nine Harmonies. Nine mended realms.', wide: true },
    { speaker: 'Narrator', text: 'Bridges bloom. Tides behave.', wide: true },
    { speaker: 'Narrator', text: 'Beacons blaze and lava naps.', wide: true },
    { speaker: 'Narrator', text: 'Stories stand whole on their stairs.', wide: true },
    { speaker: 'Narrator', text: 'And Numeria sings in perfect time.', wide: true },
    { speaker: 'Elara', text: 'You fixed a kingdom, one problem at a time.', side: 'left' },
    { speaker: 'Elara', text: 'Because math does not just count...', side: 'left' },
    { speaker: 'All Fairies', text: 'It mends, it builds, it SINGS!', side: 'left' },
  ],

  // ── IN-MAZE SMALL MOMENTS ──
  fairy_freed: [
    { speaker: 'Rescued Fairy', text: 'Whee! I am free! Thank you!' },
    { speaker: 'Rescued Fairy', text: 'Find the others! Our magic adds up!' },
  ],
  all_fairies_freed: [
    { speaker: 'Rescued Fairy', text: 'All of us are free! Hooray!' },
    { speaker: 'Rescued Fairy', text: 'Look! A golden treasure appeared!' },
  ],

  // ── PER-FLOOR PHASE 1 COMPLETION ──
  floor1_phase1_done: [
    { speaker: 'Elara', text: 'All three fairies are free!' },
    { speaker: 'Elara', text: 'Their magic is adding up fast!' },
    { speaker: 'Elara', text: 'Now wake the sleeping Rune Stones!' },
  ],
  floor2_phase1_done: [
    { speaker: 'Marlow', text: 'The last sluice! The Deep Basin is draining!' },
    { speaker: 'Marlow', text: 'A century of flood, pouring out at once!' },
    { speaker: 'Elara', text: 'Something huge is stirring down there...' },
  ],
  floor3_phase1_done: [
    { speaker: 'Zephyr', text: 'FOUR beacons! Sixteen bridges of light!' },
    { speaker: 'Zephyr', text: 'They flood the Eye from every side!' },
    { speaker: 'Elara', text: 'The Skywhale has nowhere left to hide.' },
  ],
  floor4_phase1_done: [
    { speaker: 'Cinder', text: 'The LAST vent! The fire is divided!' },
    { speaker: 'Cinder', text: 'The caldera moat cools to stone!' },
    { speaker: 'Elara', text: 'Pyroclast stands exposed. Go!' },
  ],
  floor5_phase1_done: [
    { speaker: 'Frost', text: 'The fourth Key turns — QUOTIENTS!' },
    { speaker: 'Frost', text: 'The summit gate is melting away!' },
    { speaker: 'Elara', text: 'Up we go. Bring the warm math.' },
  ],
  floor6_phase1_done: [
    { speaker: 'Crystal Fairy', text: 'All three geodes hum the right numbers!' },
    { speaker: 'Crystal Fairy', text: 'What a chord! The wall is wobbling!' },
    { speaker: 'Crystal Fairy', text: 'Now align the Prism Shards!' },
  ],
  floor7_phase1_done: [
    { speaker: 'Market Fairy', text: 'All three real gold tokens found!' },
    { speaker: 'Market Fairy', text: 'The fakes crumble next to real gold!' },
    { speaker: 'Market Fairy', text: 'Now crack the Vault Seals!' },
  ],
  floor8_phase1_done: [
    { speaker: 'Book Fairy', text: 'All three torn pages are whole!' },
    { speaker: 'Book Fairy', text: 'Your fractions fit them perfectly!' },
    { speaker: 'Book Fairy', text: 'Now bind the Chapter Seals!' },
  ],
  floor9_phase1_done: [
    { speaker: 'Elara', text: 'All three harmony sigils are lit!' },
    { speaker: 'Elara', text: 'One for every skill you mastered!' },
    { speaker: 'Elara', text: 'Now set the two bridge anchors!' },
  ],

  // ── PER-FLOOR PHASE 2 COMPLETION ──
  floor1_phase2_done: [
    { speaker: 'Elara', text: 'The Rune Stones blaze with fairy magic!' },
    { speaker: 'Elara', text: 'The flower bridge weaves over the stream!' },
    { speaker: 'Elara', text: "The Briar King's grove is open. Go!" },
  ],
  floor2_phase2_done: [
    { speaker: 'Marlow', text: 'The Deep Basin is dry! The last water is gone!' },
    { speaker: 'Marlow', text: 'The Pressure has nowhere left to hide.' },
    { speaker: 'Elara', text: 'The lair lies open. Go and face it!' },
  ],
  floor3_phase2_done: [
    { speaker: 'Sky Fairy', text: 'The Wind Chimes sing with the light!' },
    { speaker: 'Sky Fairy', text: 'Cloud bridges stretch across the gap!' },
    { speaker: 'Sky Fairy', text: 'To the Eye of the Storm! Flap flap!' },
  ],
  floor4_phase2_done: [
    { speaker: 'Fire Fairy', text: 'The Lava Bridges are solid!' },
    { speaker: 'Fire Fairy', text: 'Cooled rock leads right to the Forge!' },
    { speaker: 'Fire Fairy', text: 'The Pyroclast awaits. Stay crispy!' },
  ],
  floor5_phase2_done: [
    { speaker: 'Ice Fairy', text: 'The Thaw Crystals glow like tiny suns!' },
    { speaker: 'Ice Fairy', text: 'The waterfall is melting into steps!' },
    { speaker: 'Ice Fairy', text: 'Climb to the Ice Throne, hero!' },
  ],
  floor6_phase2_done: [
    { speaker: 'Crystal Fairy', text: 'The Prism Shards focus the chord!' },
    { speaker: 'Crystal Fairy', text: 'CRACK! The crystal wall shatters!' },
    { speaker: 'Crystal Fairy', text: 'The Prism Chamber is open. Tiptoe in!' },
  ],
  floor7_phase2_done: [
    { speaker: 'Market Fairy', text: 'Both Vault Seals cracked wide open!' },
    { speaker: 'Market Fairy', text: 'There are our ledgers! So close!' },
    { speaker: 'Market Fairy', text: 'The Counterfeiter blocks the way. Go!' },
  ],
  floor8_phase2_done: [
    { speaker: 'Book Fairy', text: 'The Chapter Seals snap shut!' },
    { speaker: 'Book Fairy', text: 'The story stairs stack up the canyon!' },
    { speaker: 'Book Fairy', text: 'The Paradox flutters out of the Archive!' },
  ],
  floor9_phase2_done: [
    { speaker: 'Elara', text: 'The anchors hold! The breach is sealed!' },
    { speaker: 'All Fairies', text: 'The final bridge glows into place!' },
    { speaker: 'Elara', text: 'To the throne! Face the Chaos King!' },
  ],
};

// ══════════════════════════════════════════════════════════════════
// HERO RESCUE DIALOGUES
// Shown after a floor boss is defeated and new heroes are unlocked.
// Each floor key maps hero IDs to 3-4 lines of rescue dialogue
// featuring the hero speaking in their personality voice.
// ══════════════════════════════════════════════════════════════════

const HERO_RESCUE = {
  // ── FLOOR 1: THE GARDEN — tangled in the Briar King's thorns ──
  1: {
    'knight-crusader': [
      { speaker: 'Elara', text: 'Someone is stuck in the thorns!' },
      { speaker: 'Crusader', text: 'Free at last! The Briar King' },
      { speaker: 'Crusader', text: 'tangled me up in his briars.' },
      { speaker: 'Crusader', text: 'My holy aura shields the party.' },
      { speaker: 'Crusader', text: 'Point me at the math!' },
      { speaker: 'Elara', text: 'Welcome, Crusader. We need you.' },
    ],
    'wizard-toadstool': [
      { speaker: 'Elara', text: 'A mushroom wizard in the vines?' },
      { speaker: 'Toadstool', text: 'Hee hee! Finally!' },
      { speaker: 'Toadstool', text: 'Those thorns were NOT comfy.' },
      { speaker: 'Toadstool', text: 'I brew sneaky spores. Let me help!' },
      { speaker: 'Elara', text: 'Your funny magic is welcome!' },
    ],
  },

  // ── FLOOR 2: TIDEPOOL RUINS — pinned by the stuck-high tide ──
  2: {
    'wizard-spellblade': [
      { speaker: 'Water Fairy', text: 'Someone is stuck in the coral!' },
      { speaker: 'Spellblade', text: 'The stuck tide pinned me' },
      { speaker: 'Spellblade', text: 'to this reef. Soggy business.' },
      { speaker: 'Spellblade', text: 'Very soggy.' },
      { speaker: 'Spellblade', text: 'My blade is ready. Let us go.' },
      { speaker: 'Water Fairy', text: 'Fight well, Spellblade!' },
    ],
    'bunny-nova': [
      { speaker: 'Water Fairy', text: 'A light in the tide pool!' },
      { speaker: 'Nova', text: 'Yay, you found me!' },
      { speaker: 'Nova', text: 'The flood dimmed my sparkle' },
      { speaker: 'Nova', text: 'but I never stopped shining!' },
      { speaker: 'Nova', text: 'My sparks zap ALL the enemies!' },
      { speaker: 'Water Fairy', text: 'Your light is what we need!' },
    ],
  },

  // ── FLOOR 3: CLOUD MAZE — stranded when the beacons went dark ──
  3: {
    'knight-paladin': [
      { speaker: 'Zephyr', text: 'A knight marooned on the storm isle!' },
      { speaker: 'Paladin', text: 'I held this beacon when the sky broke.' },
      { speaker: 'Paladin', text: 'I pushed. I pulled. It stayed dark.' },
      { speaker: 'Paladin', text: 'Strength alone does not multiply.' },
      { speaker: 'Paladin', text: 'But YOUR light reached me. I am yours.' },
      { speaker: 'Zephyr', text: 'Told you. Light finds everyone.' },
    ],
    'bunny-boulder': [
      { speaker: 'Zephyr', text: 'A boulder bunny on the sunset isle?' },
      { speaker: 'Boulder', text: 'Yep. Bridge vanished. I stayed put.' },
      { speaker: 'Boulder', text: 'Guarded the sheep treasure for you.' },
      { speaker: 'Boulder', text: 'Ready to bonk things. With rocks.' },
      { speaker: 'Zephyr', text: 'Glad to have you, Boulder.' },
    ],
  },

  // ── FLOOR 4: EMBER CAVES — cut off by the one giant lava flow ──
  4: {
    'knight-berserker': [
      { speaker: 'Cinder', text: 'Someone rattles that ember cage!' },
      { speaker: 'Berserker', text: 'FINALLY! The big lava flow' },
      { speaker: 'Berserker', text: 'trapped me in this cage of embers.' },
      { speaker: 'Berserker', text: 'BIG MISTAKE.' },
      { speaker: 'Berserker', text: 'I get STRONGER when I am hurt!' },
      { speaker: 'Cinder', text: 'Channel that fury. We need it.' },
    ],
    'wizard-bookworm': [
      { speaker: 'Cinder', text: 'A wizard in a hidden study!' },
      { speaker: 'Bookworm', text: 'I was calculating my escape.' },
      { speaker: 'Bookworm', text: 'Seventeen possible routes.' },
      { speaker: 'Bookworm', text: 'Glad you tried number one.' },
      { speaker: 'Bookworm', text: 'My research buys us more time.' },
      { speaker: 'Cinder', text: 'A scholar in flames. Welcome.' },
    ],
  },

  // ── FLOOR 5: FROZEN PEAK — frozen in ice (fire bunny in ice, ironic) ──
  5: {
    'bunny-blaze': [
      { speaker: 'Frost', text: 'A fire bunny frozen in ice?' },
      { speaker: 'Frost', text: 'That is just plain mean.' },
      { speaker: 'Blaze', text: 'I tried to melt the peak ALONE.' },
      { speaker: 'Blaze', text: 'Me! The warmest bunny alive!' },
      { speaker: 'Blaze', text: 'Well GUESS WHAT. I am BACK.' },
      { speaker: 'Blaze', text: 'FEEL THE HEAT!' },
      { speaker: 'Frost', text: 'Look — his flame melts the pass!' },
    ],
  },

  // ── FLOOR 6: CRYSTAL CAVERNS — sealed inside the humming crystal ──
  6: {
    'knight-greathelm': [
      { speaker: 'Crystal Fairy', text: 'A legendary knight in crystal!' },
      { speaker: 'Great Helm', text: 'The humming wall sang me to sleep' },
      { speaker: 'Great Helm', text: 'and sealed me in a geode.' },
      { speaker: 'Great Helm', text: 'A grave error.' },
      { speaker: 'Great Helm', text: 'I am Unbreakable. You have my sword.' },
      { speaker: 'Elara', text: 'A legendary hero returns!' },
    ],
    'wizard-grandmage': [
      { speaker: 'Crystal Fairy', text: 'Ancient magic pulses in there!' },
      { speaker: 'Grand Mage', text: 'Do you know how LONG I waited?' },
      { speaker: 'Grand Mage', text: 'Sealed in crystal. Insufferable.' },
      { speaker: 'Grand Mage', text: 'Hard questions fuel my wrath.' },
      { speaker: 'Grand Mage', text: 'Enemies will KNEEL.' },
      { speaker: 'Elara', text: 'Two legends freed. Onward!' },
    ],
  },

  // ── FLOOR 7: MARKET SQUARE — put up for auction with the fakes ──
  7: {
    'bunny-duchess': [
      { speaker: 'Market Fairy', text: 'That bunny is royalty!' },
      { speaker: 'Duchess', text: 'The indignity. AUCTIONED off' },
      { speaker: 'Duchess', text: 'like a used teapot.' },
      { speaker: 'Duchess', text: 'Someone will PAY for this.' },
      { speaker: 'Duchess', text: 'My command strengthens allies.' },
      { speaker: 'Duchess', text: 'The crown joins your cause.' },
      { speaker: 'Market Fairy', text: 'Forgive us, Duchess.' },
    ],
  },
};

/**
 * Return rescue dialogue lines for heroes just unlocked on a floor.
 * Returns a flat array of dialogue lines ready for CutsceneScene,
 * or an empty array if no rescue dialogue exists for the given floor/heroes.
 *
 * @param {object} save        The current save data
 * @param {number} floorId     The floor that was just completed
 * @param {string[]} heroIds   Array of hero IDs that were just rescued
 * @returns {{ speaker: string, text: string }[]}
 */
export function getRescueDialogue(floorId, heroIds) {
  const floorRescues = HERO_RESCUE[floorId];
  if (!floorRescues) return [];
  const lines = [];
  for (const id of heroIds) {
    const heroLines = floorRescues[id];
    if (heroLines) {
      lines.push(...heroLines);
    }
  }
  return lines;
}

// ══════════════════════════════════════════════════════════════════
// HERO REACTIONS — party-aware cutscene dialogue additions
// Maps floorId -> heroId -> { text, trigger }
// trigger: 'intro' = after floor_entry, 'boss' = after floor_boss
// ══════════════════════════════════════════════════════════════════

export const HERO_REACTIONS = {
  // ── FLOOR 1: THE GARDEN ──
  1: {
    'knight-crusader': { text: '"This garden deserves a protector."', trigger: 'intro' },
    'wizard-bookworm': { text: '"Fascinating! The vines add up in threes."', trigger: 'intro' },
    'bunny-pepper': { text: '"I smell ADVENTURE! Let\'s MOVE!"', trigger: 'intro' },
    'knight-shadow': { text: '"...The Briar King watches from the thorns."', trigger: 'intro' },
  },
  // ── FLOOR 2: TIDEPOOL RUINS ──
  2: {
    'wizard-bookworm': { text: '"A stuck tide! Chapter 7 of my notes!"', trigger: 'intro' },
    'bunny-pepper': { text: '"The path is UNDERWATER?! Splashy!"', trigger: 'intro' },
    'knight-crusader': { text: '"These ruins hold old truths. I feel it."', trigger: 'intro' },
    'wizard-stargazer': { text: '"Even the stars look soggy tonight."', trigger: 'intro' },
  },
  // ── FLOOR 3: CLOUD MAZE ──
  3: {
    'bunny-pepper': { text: '"CLOUDS! Can I bounce on them?!"', trigger: 'intro' },
    'wizard-stargazer': { text: '"So close to the stars. They miss the light."', trigger: 'intro' },
    'knight-paladin': { text: '"I will shield us from the storm."', trigger: 'intro' },
    'knight-shadow': { text: '"Good visibility. Bad for hiding."', trigger: 'intro' },
  },
  // ── FLOOR 4: EMBER CAVES — Berserker was caged here ──
  4: {
    'knight-berserker': { text: '"I remember these cages. NEVER AGAIN!"', trigger: 'intro' },
    'wizard-bookworm': { text: '"One flow, divided, cools faster. Noted!"', trigger: 'intro' },
    'bunny-pepper': { text: '"HOT HOT HOT! But I\'m FASTER!"', trigger: 'intro' },
    'knight-crusader': { text: '"Ember, we will cool these caves."', trigger: 'intro' },
    'bunny-blaze': { text: '"This heat... feels like home."', trigger: 'intro' },
  },
  // ── FLOOR 5: FROZEN PEAK ──
  5: {
    'bunny-blaze': { text: '"ICE?! My sworn enemy! Let me at it!"', trigger: 'intro' },
    'wizard-bookworm': { text: '"A waterfall paused mid-splash. Amazing."', trigger: 'intro' },
    'knight-shadow': { text: '"Fresh footprints in the frost. Recent."', trigger: 'intro' },
    'bunny-pepper': { text: '"B-b-brrr! My EARS are freezing off!"', trigger: 'intro' },
  },
  // ── FLOOR 6: CRYSTAL CAVERNS ──
  6: {
    'wizard-stargazer': { text: '"These crystals hum like tiny stars."', trigger: 'intro' },
    'wizard-bookworm': { text: '"Each geode hums a number. Taking notes."', trigger: 'intro' },
    'knight-greathelm': { text: '"The wall sealed me here. Payback time."', trigger: 'intro' },
    'bunny-pepper': { text: '"SO SHINY! Can I keep one? PLEASE?!"', trigger: 'intro' },
  },
  // ── FLOOR 7: MARKET SQUARE — Duchess was auctioned here ──
  7: {
    'bunny-duchess': { text: '"This market... they AUCTIONED me here."', trigger: 'intro' },
    'knight-crusader': { text: '"Trade without honor is just theft."', trigger: 'intro' },
    'bunny-pepper': { text: '"Ooh, free samples! Wait... all fake."', trigger: 'intro' },
    'wizard-bookworm': { text: '"These prices break seventeen laws."', trigger: 'intro' },
    'knight-shadow': { text: '"...I can always spot a fake."', trigger: 'intro' },
  },
  // ── FLOOR 8: THE LIBRARY ──
  8: {
    'wizard-bookworm': { text: '"These tear marks... the Chaos King was here!"', trigger: 'boss' },
    'wizard-stargazer': { text: '"The constellations on these pages move."', trigger: 'intro' },
    'bunny-pepper': { text: '"Books?! Wait, this one has PICTURES!"', trigger: 'intro' },
    'knight-paladin': { text: '"Mind the falling pages. Stay alert."', trigger: 'intro' },
    'wizard-grandmage': { text: '"These texts... I wrote some. Long ago."', trigger: 'intro' },
  },
  // ── FLOOR 9: CASTLE OF CHAOS ──
  9: {
    'knight-crusader': { text: '"We mend things. That is what heroes do."', trigger: 'intro' },
    'knight-shadow': { text: '"...The final shadow falls here."', trigger: 'intro' },
    'wizard-bookworm': { text: '"Every mess can be sorted. Even this one."', trigger: 'intro' },
    'bunny-pepper': { text: '"FINAL BOSS TIME! LET\'S GOOOOO!"', trigger: 'intro' },
    'bunny-duchess': { text: '"By royal decree: we end this today."', trigger: 'intro' },
    'knight-berserker': { text: '"No more breaches. No more chaos. CHARGE!"', trigger: 'boss' },
  },
};
