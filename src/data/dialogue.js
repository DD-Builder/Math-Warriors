/**
 * Story dialogue — graphic-novel-style panels.
 *
 * CutsceneScene splits lines into 3 visual scenes:
 *   Scene 1 (fairy solo, big sparkly) — first third of lines
 *   Scene 2 (fairy + hero party) — middle third
 *   Scene 3 (fairy solo close) — final third
 * Multiple lines per scene — player taps to advance within each.
 * Max ~38 chars per line to prevent overflow.
 *
 * THE THEOREM'S FEAR — story arc:
 *   The Great Equation was deliberately shattered by The Theorem,
 *   a former guardian afraid that being answered means ceasing
 *   to exist. The player uncovers this mystery floor-by-floor.
 */

export const DIALOGUE = {
  // ── GAME INTRO ──
  game_intro: [
    { speaker: 'Narrator', text: 'Once, numbers made the world.', wide: true },
    { speaker: 'Narrator', text: 'A Great Equation kept it whole.', wide: true },
    { speaker: 'Elder Fairy', text: 'I am Elara. I guard balance.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But something BROKE it.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Not an accident. A choice.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Nine pieces. Nine hurt realms.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'I do not know WHO did this.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But I know where to start.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Will you help us find out?', side: 'left' },
  ],

  world_map_intro: [
    { speaker: 'Narrator', text: 'Nine realms. Nine fragments.', wide: true },
    { speaker: 'Narrator', text: 'Something waits at the end.', wide: true },
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
    { speaker: 'Elder Fairy', text: 'Keep going! You are close!', side: 'left' },
  ],

  phase2_start: [
    { speaker: 'Elder Fairy', text: 'New items appeared! Find them!', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 1: THE GARDEN — "The First Crack"
  // Theme: Wonder → something is deliberately wrong
  // ══════════════════════════════════════

  floor1_entry: [
    { speaker: 'Elder Fairy', text: 'The Garden is dying!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Flowers grow backward now.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Addition is broken here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Things that should grow shrink.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Free the trapped fairies!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then find the Rune Stones.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Something guards the gate...', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Add your courage. Let us go!', side: 'left' },
  ],
  floor1_mid_explore: [
    { speaker: 'Elder Fairy', text: 'Wait. Look at these marks.' },
    { speaker: 'Elder Fairy', text: 'Something big did this.' },
    { speaker: 'Elder Fairy', text: 'This was not just an accident.' },
  ],
  floor1_boss: [
    { speaker: 'Elder Fairy', text: 'The Briar King! It blocks us!', side: 'left' },
    { speaker: 'Briar King', text: 'My vines grow with every sum!', sprite: 'briarking', side: 'right' },
    { speaker: 'Briar King', text: 'No one passes. NO ONE.', sprite: 'briarking', side: 'right' },
    { speaker: 'Narrator', text: 'Add fast to cut through!', wide: true },
  ],
  floor1_victory: [
    { speaker: 'Elder Fairy', text: 'The first fragment glows!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But look. Claw marks on it.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Someone RIPPED this out.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'This was no accident.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'I hear water ahead...', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But it sounds wrong.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Like it flows uphill.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 2: TIDEPOOL RUINS — "Against the Current"
  // Theme: Concern → the bosses are being controlled
  // ══════════════════════════════════════

  floor2_entry: [
    { speaker: 'Water Fairy', text: 'The tides flow backward!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtraction makes things grow.', side: 'left' },
    { speaker: 'Water Fairy', text: 'I... I grew up here.', side: 'left' },
    { speaker: 'Water Fairy', text: 'This was beautiful once.', side: 'left' },
    { speaker: 'Water Fairy', text: 'Open the drain valves!', side: 'left' },
    { speaker: 'Water Fairy', text: 'Then find the Coral Keys.', side: 'left' },
    { speaker: 'Water Fairy', text: 'Something lurks in the deep.', side: 'left' },
    { speaker: 'Water Fairy', text: 'Subtract the flood! Hurry!', side: 'left' },
  ],
  floor2_fairy_talk: [
    { speaker: 'Elder Fairy', text: 'Marina, are you alright?' },
    { speaker: 'Water Fairy', text: 'I know these halls, Elara.' },
    { speaker: 'Water Fairy', text: 'The Pressure was our friend.' },
    { speaker: 'Elder Fairy', text: '...Was?' },
  ],
  floor2_boss: [
    { speaker: 'Water Fairy', text: 'Oh no. I know that shadow.', side: 'left' },
    { speaker: 'The Pressure', text: 'The deep takes everything!', sprite: 'pressure', side: 'right' },
    { speaker: 'The Pressure', text: 'Even old friends.', sprite: 'pressure', side: 'right' },
    { speaker: 'Narrator', text: 'Subtract its strength! Fast!', wide: true },
  ],
  floor2_victory: [
    { speaker: 'Water Fairy', text: 'The tides calm. We did it.', side: 'left' },
    { speaker: 'Water Fairy', text: 'But what it said...', side: 'left' },
    { speaker: 'Water Fairy', text: '"Answers are chains."', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Someone convinced them.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Told the old guardians that', side: 'left' },
    { speaker: 'Elder Fairy', text: 'answers are the enemy.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'We must find out who. And why.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 3: CLOUD MAZE — "Broken Wings"
  // Theme: Revelation → bosses were once guardians
  // ══════════════════════════════════════

  floor3_entry: [
    { speaker: 'Sky Fairy', text: 'The clouds are tearing apart!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply should make MORE.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'But up here it divides.', side: 'left' },
    { speaker: 'Sky Fairy', text: '...I used to play here.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Light the three sky beacons!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Then ring the Wind Chimes.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The Skywhale hides above...', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Multiply your courage! Go!', side: 'left' },
  ],
  floor3_mid_explore: [
    { speaker: 'Sky Fairy', text: 'These beasts were not here.' },
    { speaker: 'Sky Fairy', text: 'The guardians WERE good.' },
    { speaker: 'Elder Fairy', text: 'What do you mean, Zephyr?' },
    { speaker: 'Sky Fairy', text: 'They protected these realms.' },
    { speaker: 'Sky Fairy', text: 'Someone turned them.' },
  ],
  floor3_boss: [
    { speaker: 'Sky Fairy', text: 'Skywhale... old friend...', side: 'left' },
    { speaker: 'Skywhale', text: 'I will NEVER give answers!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Skywhale', text: 'It promised me freedom!', sprite: 'skywhale', side: 'right' },
    { speaker: 'Narrator', text: 'Multiply to break the spell!', wide: true },
  ],
  floor3_victory: [
    { speaker: 'Sky Fairy', text: 'It is free. The whale is free.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'It whispered as it faded.', side: 'left' },
    { speaker: 'Sky Fairy', text: '"No more same answers."', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Someone promised the guardians', side: 'left' },
    { speaker: 'Sky Fairy', text: 'freedom from repetition.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'We have to SAVE them.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'Not just beat them.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 4: EMBER CAVES — "What Burns Inside"
  // Theme: Grief → fighting old friends, villain named
  // ══════════════════════════════════════

  floor4_entry: [
    { speaker: 'Fire Fairy', text: 'The lava will not divide!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'It should split into streams.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Instead it multiplies!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The caves are flooding.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Seal the three lava vents!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Then build the Lava Bridges.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'I know who is down there.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Pyra. She was... kind once.', side: 'left' },
  ],
  floor4_boss: [
    { speaker: 'Fire Fairy', text: 'Pyra! It is me, Ember!', side: 'left' },
    { speaker: 'Pyroclast', text: 'EMBER? Not here! Go back!', sprite: 'pyroclast', side: 'right' },
    { speaker: 'Pyroclast', text: 'It said I would be FREE!', sprite: 'pyroclast', side: 'right' },
    { speaker: 'Narrator', text: 'Divide to cool the core!', wide: true },
  ],
  floor4_victory: [
    { speaker: 'Fire Fairy', text: 'Pyra is free. She spoke.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'She said one word.', side: 'left' },
    { speaker: 'Fire Fairy', text: '"Theorem."', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Theorem. A name at last.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'I KNOW that name.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'It guards the Mending Room.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Then we know where to go.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But we are not ready yet.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 5: FROZEN PEAK — "The Cold Truth" (MIDPOINT)
  // Theme: Crisis → the Theorem's fear revealed
  // ══════════════════════════════════════

  floor5_entry: [
    { speaker: 'Ice Fairy', text: 'Everything is f-frozen.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Not just the water. The MATH.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Answers freeze before you...', side: 'left' },
    { speaker: 'Ice Fairy', text: 'before you can reach them.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Frost, what happened here?', side: 'left' },
    { speaker: 'Ice Fairy', text: 'The Theorem f-froze me too.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'It said answers do not matter.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'I b-believed it. I was wrong.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'We will fix this. Together.', side: 'left' },
  ],
  floor5_mid_explore: [
    { speaker: 'Ice Fairy', text: 'The cold is getting worse.' },
    { speaker: 'Elder Fairy', text: 'Stay close. Keep solving.' },
    { speaker: 'Ice Fairy', text: 'Every answer makes me warmer.' },
  ],
  floor5_boss: [
    { speaker: 'Absolute Zero', text: 'Why do you keep trying?', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'There is no point to answers.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Ice Fairy', text: 'There IS a point!', side: 'left' },
    { speaker: 'Ice Fairy', text: 'Answers connect us!', side: 'left' },
    { speaker: 'Narrator', text: 'Use every skill to thaw it!', wide: true },
  ],
  floor5_victory: [
    { speaker: 'Absolute Zero', text: 'You won. Listen.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'The Theorem is afraid.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'If you solve the Equation...', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'it becomes... finished.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Absolute Zero', text: 'It fears being answered.', sprite: 'absolutezero', side: 'right' },
    { speaker: 'Ice Fairy', text: 'I am not cold anymore.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Theorem is not evil.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'It is afraid of being solved.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'But we MUST restore balance.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 6: CRYSTAL CAVERNS — "Fractures"
  // Theme: Doubt → team nearly splits, then reconciles
  // ══════════════════════════════════════

  floor6_entry: [
    { speaker: 'Crystal Fairy', text: 'Shapes are falling apart.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Geometry cannot hold.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'Crystals crack into chaos.', side: 'left' },
    { speaker: 'Water Fairy', text: 'Wait. Are these pieces safe?', side: 'left' },
    { speaker: 'Sky Fairy', text: 'What do you mean, Marina?', side: 'left' },
    { speaker: 'Water Fairy', text: 'What if they are traps?', side: 'left' },
    { speaker: 'Fire Fairy', text: 'We cannot stop now!', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Focus. Collect the shards.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'We will figure it out.', side: 'left' },
  ],
  floor6_fairy_talk: [
    { speaker: 'Water Fairy', text: 'Elara, I am scared.' },
    { speaker: 'Fire Fairy', text: 'Arguing will not help us.' },
    { speaker: 'Sky Fairy', text: 'We have come too far to stop.' },
    { speaker: 'Elder Fairy', text: 'Trust each other. Trust THEM.' },
  ],
  floor6_boss: [
    { speaker: 'The Prism', text: 'I see your doubts.', sprite: 'theprism', side: 'right' },
    { speaker: 'The Prism', text: 'You do not trust each other!', sprite: 'theprism', side: 'right' },
    { speaker: 'Elder Fairy', text: 'We trust our heroes.', side: 'left' },
    { speaker: 'Narrator', text: 'Think in shapes to shatter it!', wide: true },
  ],
  floor6_victory: [
    { speaker: 'Crystal Fairy', text: 'A prism splits light.', side: 'left' },
    { speaker: 'Crystal Fairy', text: 'But it also makes rainbows.', side: 'left' },
    { speaker: 'Water Fairy', text: 'I am sorry I doubted us.', side: 'left' },
    { speaker: 'Sky Fairy', text: 'We are stronger together.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Always.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Six fragments glow as one.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Three more. We can do this.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 7: MARKET SQUARE — "The Real Cost"
  // Theme: Unity → confession, forgiveness, "I AM SORRY"
  // ══════════════════════════════════════

  floor7_entry: [
    { speaker: 'Market Fairy', text: 'Nothing costs what it should!', side: 'left' },
    { speaker: 'Market Fairy', text: 'Gold coins turn to copper.', side: 'left' },
    { speaker: 'Market Fairy', text: 'Copper coins act like gold.', side: 'left' },
    { speaker: 'Market Fairy', text: 'Money math is all wrong.', side: 'left' },
    { speaker: 'Market Fairy', text: 'I have to tell you something.', side: 'left' },
    { speaker: 'Market Fairy', text: 'The Theorem paid me.', side: 'left' },
    { speaker: 'Market Fairy', text: 'I hid a fragment for gold.', side: 'left' },
    { speaker: 'Market Fairy', text: 'I was wrong. I am sorry.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You are helping now. Go.', side: 'left' },
  ],
  floor7_boss: [
    { speaker: 'The Counterfeiter', text: 'Everything has a price!', sprite: 'counterfeiter', side: 'right' },
    { speaker: 'The Counterfeiter', text: 'Even the truth!', sprite: 'counterfeiter', side: 'right' },
    { speaker: 'Market Fairy', text: 'Some things cost nothing.', side: 'left' },
    { speaker: 'Market Fairy', text: 'Like doing what is right.', side: 'left' },
    { speaker: 'Narrator', text: 'Count every coin to win!', wide: true },
  ],
  floor7_victory: [
    { speaker: 'Market Fairy', text: 'Some things are worth more', side: 'left' },
    { speaker: 'Market Fairy', text: 'than gold.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Look inside the fragment.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Words are etched there.', side: 'left' },
    { speaker: 'Narrator', text: '"I AM SORRY."', wide: true },
    { speaker: 'Elder Fairy', text: 'The Theorem wrote this.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'It regrets what it did.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'Two fragments left.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Library holds the truth.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 8: INFINITY LIBRARY — "The Theorem's Story"
  // Theme: Understanding → the journal reveals its fear
  // ══════════════════════════════════════

  floor8_entry: [
    { speaker: 'Book Fairy', text: 'Words are scrambling!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Stories rewrite themselves!', side: 'left' },
    { speaker: 'Book Fairy', text: 'Word problems lie on purpose.', side: 'left' },
    { speaker: 'Book Fairy', text: 'But there are lost pages here.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Pages from a journal.', side: 'left' },
    { speaker: 'Book Fairy', text: 'The Theorem wrote them.', side: 'left' },
    { speaker: 'Book Fairy', text: 'Its own story is here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Find the pages. Read them.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Understand why it did this.', side: 'left' },
  ],
  floor8_mid_explore: [
    { speaker: 'Book Fairy', text: 'This page... listen.' },
    { speaker: 'Narrator', text: '"I was made to be solved."', wide: true },
    { speaker: 'Narrator', text: '"But if I am solved..."', wide: true },
    { speaker: 'Narrator', text: '"do I stop being a question?"', wide: true },
    { speaker: 'Elder Fairy', text: 'It was afraid of its answer.' },
  ],
  floor8_boss: [
    { speaker: 'The Paradox', text: 'If I am wrong, I am right!', sprite: 'theparadox', side: 'right' },
    { speaker: 'The Paradox', text: 'If solved, do I disappear?', sprite: 'theparadox', side: 'right' },
    { speaker: 'Book Fairy', text: 'Questions do not end.', side: 'left' },
    { speaker: 'Book Fairy', text: 'They lead to NEW questions.', side: 'left' },
    { speaker: 'Narrator', text: 'Read carefully to win!', wide: true },
  ],
  floor8_victory: [
    { speaker: 'Book Fairy', text: 'The last page reads...', side: 'left' },
    { speaker: 'Narrator', text: '"All questions deserve answers."', wide: true },
    { speaker: 'Narrator', text: '"Even the scared ones."', wide: true },
    { speaker: 'Elder Fairy', text: 'The Theorem waits for us.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Not to fight us.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'To ask the hardest question.', side: 'left' },
    { speaker: 'Fire Fairy', text: 'One room left.', side: 'left' },
    { speaker: 'All Fairies', text: 'The Mending Room.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Where it all ends.', side: 'left' },
  ],

  // ══════════════════════════════════════
  // FLOOR 9: THE MENDING ROOM — "The Answer"
  // Theme: Compassion → being solved is a beginning
  // ══════════════════════════════════════

  floor9_entry: [
    { speaker: 'All Fairies', text: 'The Mending Room. At last.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Everything you learned matters.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Every add. Every subtract.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'Every shape and every word.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'The Theorem is here.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'It is not a monster.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'It is a question afraid', side: 'left' },
    { speaker: 'Elder Fairy', text: 'of its own answer.', side: 'left' },
    { speaker: 'All Fairies', text: 'Show it answers are OK.', side: 'left' },
  ],
  floor9_mid_explore: [
    { speaker: 'The Theorem', text: 'Why do you keep coming?' },
    { speaker: 'The Theorem', text: 'When you solve me...' },
    { speaker: 'The Theorem', text: 'there is nothing left.' },
    { speaker: 'Elder Fairy', text: 'That is not true.' },
    { speaker: 'Elder Fairy', text: 'Every answer starts something.' },
  ],
  floor9_boss: [
    { speaker: 'The Theorem', text: 'I am every question you fear.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'If you answer me, I end.', sprite: 'theorem', side: 'right' },
    { speaker: 'Elder Fairy', text: 'No. You become something new.', side: 'left' },
    { speaker: 'All Fairies', text: 'Use EVERYTHING you know!', side: 'left' },
    { speaker: 'Narrator', text: 'The final question awaits!', wide: true },
  ],
  floor9_victory: [
    { speaker: 'The Theorem', text: 'You solved me.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'And I am still here.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'Being answered is not ending.', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'It is the start of the next', sprite: 'theorem', side: 'right' },
    { speaker: 'The Theorem', text: 'question.', sprite: 'theorem', side: 'right' },
    { speaker: 'Elder Fairy', text: 'The Great Equation glows!', side: 'left' },
    { speaker: 'Water Fairy', text: 'The tides flow true again!', side: 'left' },
    { speaker: 'Sky Fairy', text: 'The clouds are whole!', side: 'left' },
    { speaker: 'Fire Fairy', text: 'The flames rest. Well done.', side: 'left' },
    { speaker: 'Ice Fairy', text: 'I feel warm. Thank you.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'You taught a question that', side: 'left' },
    { speaker: 'Elder Fairy', text: 'it is OK to be answered.', side: 'left' },
    { speaker: 'Elder Fairy', text: 'True heroes. Every one of you.', side: 'left' },
  ],

  // ── BOSS HALF-HP REACTIONS (story reveals) ──
  floor1_boss_half: [{ speaker: 'Briar King', text: 'Who... told me to fight you?' }],
  floor2_boss_half: [{ speaker: 'The Pressure', text: 'Answers... are... chains...' }],
  floor3_boss_half: [{ speaker: 'Skywhale', text: 'It said... no more repeating...' }],
  floor4_boss_half: [{ speaker: 'Pyroclast', text: 'Ember... I remember you...' }],
  floor5_boss_half: [{ speaker: 'Absolute Zero', text: 'You actually... care?' }],
  floor6_boss_half: [{ speaker: 'The Prism', text: 'Light splits. So do friends.' }],
  floor7_boss_half: [{ speaker: 'The Counterfeiter', text: 'My fakes... crumbling...' }],
  floor8_boss_half: [{ speaker: 'The Paradox', text: 'If you solve me... then what?' }],
  floor9_boss_half: [{ speaker: 'The Theorem', text: 'You... understand me?' }],

  // ── BOSS QUARTER-HP (key moments only) ──
  floor1_boss_quarter: [{ speaker: 'Briar King', text: 'My roots... remember light...' }],
  floor5_boss_quarter: [{ speaker: 'Absolute Zero', text: 'The Theorem... lied to me.' }],
  floor9_boss_quarter: [{ speaker: 'The Theorem', text: 'Maybe answers are not endings.' }],

  // ── FLOOR-SPECIFIC DEFEAT ENCOURAGEMENT ──
  floor1_defeat: [
    { speaker: 'Elder Fairy', text: 'The garden still waits.' },
    { speaker: 'Elder Fairy', text: 'Come back when you are ready!' },
  ],
  floor5_defeat: [
    { speaker: 'Ice Fairy', text: 'Even ice melts with time.' },
    { speaker: 'Ice Fairy', text: 'You are getting warmer!' },
  ],
  floor9_defeat: [
    { speaker: 'Elder Fairy', text: 'The Theorem is still waiting.' },
    { speaker: 'Elder Fairy', text: 'It WANTS you to try again.' },
    { speaker: 'Elder Fairy', text: 'Every try teaches something.' },
  ],

  // ── ENDING EPILOGUE ──
  game_ending: [
    { speaker: 'Narrator', text: 'The nine realms breathe again.', wide: true },
    { speaker: 'Narrator', text: 'Numbers find their place.', wide: true },
    { speaker: 'Narrator', text: 'Flowers add and grow.', wide: true },
    { speaker: 'Narrator', text: 'Tides subtract and calm.', wide: true },
    { speaker: 'Narrator', text: 'Clouds multiply and form.', wide: true },
    { speaker: 'Narrator', text: 'Lava divides and cools.', wide: true },
    { speaker: 'Elder Fairy', text: 'And one scared question', side: 'left' },
    { speaker: 'Elder Fairy', text: 'learned the best answer:', side: 'left' },
    { speaker: 'All Fairies', text: 'Every ending is a beginning.', side: 'left' },
  ],

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
    { speaker: 'Elder Fairy', text: 'Now find the hidden Rune Stones.' },
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
    { speaker: 'Ice Fairy', text: 'The crystals are thawing!' },
    { speaker: 'Ice Fairy', text: 'I can feel warmth returning.' },
    { speaker: 'Elder Fairy', text: 'Now find the Thaw Crystals!' },
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
    { speaker: 'Book Fairy', text: 'All pages are restored.' },
    { speaker: 'Book Fairy', text: 'The stories breathe again.' },
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

// ══════════════════════════════════════════════════════════════════
// HERO RESCUE DIALOGUES
// Shown after a floor boss is defeated and new heroes are unlocked.
// Each floor key maps hero IDs to 3-4 lines of rescue dialogue
// featuring the hero speaking in their personality voice.
// ══════════════════════════════════════════════════════════════════

export const HERO_RESCUE = {
  // ── FLOOR 1: THE GARDEN — trapped in thorns/vines by the Briar King ──
  1: {
    'knight-crusader': [
      { speaker: 'Elder Fairy', text: 'Someone is in the thorns!' },
      { speaker: 'Crusader', text: 'You freed me? The Briar King' },
      { speaker: 'Crusader', text: 'bound me to stop anyone who' },
      { speaker: 'Crusader', text: 'believes in justice.' },
      { speaker: 'Crusader', text: 'My holy aura shields the party.' },
      { speaker: 'Crusader', text: 'Let me fight alongside you!' },
      { speaker: 'Elder Fairy', text: 'Welcome, Crusader. We need you.' },
    ],
    'wizard-toadstool': [
      { speaker: 'Elder Fairy', text: 'A mushroom wizard in the vines?' },
      { speaker: 'Toadstool', text: 'Hee hee! Finally!' },
      { speaker: 'Toadstool', text: 'Those thorns were NOT fun.' },
      { speaker: 'Toadstool', text: 'I brew toxic spores. Let me help!' },
      { speaker: 'Elder Fairy', text: 'Your chaos magic is welcome.' },
    ],
  },

  // ── FLOOR 2: TIDEPOOL RUINS — trapped in tide pools, magic drained ──
  2: {
    'wizard-spellblade': [
      { speaker: 'Water Fairy', text: 'Someone is trapped in the reef!' },
      { speaker: 'Spellblade', text: 'About time. The Pressure' },
      { speaker: 'Spellblade', text: 'drained my magic and left me' },
      { speaker: 'Spellblade', text: 'stuck in coral.' },
      { speaker: 'Spellblade', text: 'My blade is ready. Let us go.' },
      { speaker: 'Water Fairy', text: 'Fight well, Spellblade.' },
    ],
    'bunny-nova': [
      { speaker: 'Water Fairy', text: 'A light in the tide pool!' },
      { speaker: 'Nova', text: 'Yay, you found me!' },
      { speaker: 'Nova', text: 'The water dimmed my sparkle' },
      { speaker: 'Nova', text: 'but I never stopped shining!' },
      { speaker: 'Nova', text: 'My sparks zap ALL the enemies!' },
      { speaker: 'Water Fairy', text: 'Your light is what we need.' },
    ],
  },

  // ── FLOOR 3: CLOUD MAZE — frozen mid-flight, used as cloud anchors ──
  3: {
    'knight-paladin': [
      { speaker: 'Sky Fairy', text: 'A knight frozen in the clouds!' },
      { speaker: 'Paladin', text: 'The Skywhale used me as' },
      { speaker: 'Paladin', text: 'a cloud anchor. I could not move.' },
      { speaker: 'Paladin', text: 'But I heard everything.' },
      { speaker: 'Paladin', text: 'I will protect this party.' },
      { speaker: 'Sky Fairy', text: 'Your heart makes you strong.' },
    ],
    'bunny-boulder': [
      { speaker: 'Sky Fairy', text: 'A boulder bunny stuck in the sky?' },
      { speaker: 'Boulder', text: 'Yep. Been up here a while.' },
      { speaker: 'Boulder', text: 'Pretty patient though.' },
      { speaker: 'Boulder', text: 'Ready to hit things. With rocks.' },
      { speaker: 'Sky Fairy', text: 'Glad to have you, Boulder.' },
    ],
  },

  // ── FLOOR 4: EMBER CAVES — imprisoned in ember cages ──
  4: {
    'knight-berserker': [
      { speaker: 'Fire Fairy', text: 'Someone rages in that ember cage!' },
      { speaker: 'Berserker', text: 'FINALLY! Pyroclast locked me up' },
      { speaker: 'Berserker', text: 'because I fought back.' },
      { speaker: 'Berserker', text: 'BIG MISTAKE.' },
      { speaker: 'Berserker', text: 'I get STRONGER when I am hurt!' },
      { speaker: 'Fire Fairy', text: 'Channel that fury. We need it.' },
    ],
    'wizard-bookworm': [
      { speaker: 'Fire Fairy', text: 'A wizard reading in a cage?' },
      { speaker: 'Bookworm', text: 'I was calculating my escape.' },
      { speaker: 'Bookworm', text: 'Seventeen possible routes.' },
      { speaker: 'Bookworm', text: 'Glad you tried number one.' },
      { speaker: 'Bookworm', text: 'My research buys us more time.' },
      { speaker: 'Fire Fairy', text: 'A scholar in flames. Welcome.' },
    ],
  },

  // ── FLOOR 5: FROZEN PEAK — frozen in ice (fire bunny in ice, ironic) ──
  5: {
    'bunny-blaze': [
      { speaker: 'Ice Fairy', text: 'A fire bunny frozen in ice?' },
      { speaker: 'Ice Fairy', text: 'That is just cruel.' },
      { speaker: 'Blaze', text: 'The Theorem froze me because' },
      { speaker: 'Blaze', text: 'fire asks the hardest questions.' },
      { speaker: 'Blaze', text: 'Well GUESS WHAT. I am BACK.' },
      { speaker: 'Blaze', text: 'FEEL THE HEAT!' },
      { speaker: 'Ice Fairy', text: 'Your fire will light our way.' },
    ],
  },

  // ── FLOOR 6: CRYSTAL CAVERNS — embedded in crystal, legendary power sealed ──
  6: {
    'knight-greathelm': [
      { speaker: 'Crystal Fairy', text: 'A legendary knight in crystal!' },
      { speaker: 'Great Helm', text: 'At last. The Prism sealed me' },
      { speaker: 'Great Helm', text: 'to contain my power.' },
      { speaker: 'Great Helm', text: 'A grave error.' },
      { speaker: 'Great Helm', text: 'I am Unbreakable. You have my sword.' },
      { speaker: 'Elder Fairy', text: 'A legendary hero returns!' },
    ],
    'wizard-grandmage': [
      { speaker: 'Crystal Fairy', text: 'Ancient magic pulses in there!' },
      { speaker: 'Grand Mage', text: 'Do you know how LONG I waited?' },
      { speaker: 'Grand Mage', text: 'The Prism feared my power.' },
      { speaker: 'Grand Mage', text: 'Insufferable.' },
      { speaker: 'Grand Mage', text: 'Hard questions fuel my wrath.' },
      { speaker: 'Grand Mage', text: 'Enemies will KNEEL.' },
      { speaker: 'Elder Fairy', text: 'Two legends freed. The tide turns.' },
    ],
  },

  // ── FLOOR 7: MARKET SQUARE — held as priceless merchandise ──
  7: {
    'bunny-duchess': [
      { speaker: 'Market Fairy', text: 'That bunny is royalty!' },
      { speaker: 'Duchess', text: 'The indignity. Sold as goods.' },
      { speaker: 'Duchess', text: 'By royal decree, someone' },
      { speaker: 'Duchess', text: 'will PAY for this.' },
      { speaker: 'Duchess', text: 'My command strengthens allies.' },
      { speaker: 'Duchess', text: 'The crown joins your cause.' },
      { speaker: 'Market Fairy', text: 'Forgive me, Duchess.' },
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
