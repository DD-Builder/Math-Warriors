/**
 * THE STORY — the narrative spine of Math Warriors.
 *
 * Pure data + pure selectors. No Phaser, no three, no DOM. Safe to
 * import from node:test siblings and from any scene.
 *
 * ─────────────────────────────────────────────────────────────────
 * THE ARC IN NINE BEATS
 *
 *   1 GARDEN    The world is quietly losing its numbers. A scrap of
 *               someone's handwriting is scratched into a thorn.
 *   2 TIDEPOOL  The scraps are pages. Page two only knows how to
 *               subtract. The first heroes are freed from the flood —
 *               the hero becomes a PARTY.
 *   3 SKY       The pages are one proof, in one hand, written large
 *               enough to cover the sky. Someone wanted to be read.
 *   4 EMBER     The handwriting is furious — but the old cold anvil
 *               under it says the writer used to MAKE things.
 *   5 FROST     Absolute Zero froze the world so it could not be
 *               wrong. The party's own doubt: what if he IS right?
 *   6 CRYSTAL   In the great facet the party sees the writer: a shape
 *               with one side missing. The proof has no last line.
 *   7 MARKET    Coinford sells bottled endings. You cannot buy a
 *               finish. A finish is work — and one step was never
 *               checked.
 *   8 LIBRARY   The truth. The Chaos King is the Great Story's first
 *               draft, crossed out and thrown away, who concluded the
 *               world does not add up — and has been trying to prove
 *               himself right ever since, because being wrong would
 *               mean being nothing.
 *   9 MENDING   The party does not erase him. They write the missing
 *               last line: nothing here was ever counted alone.
 *               Plus everyone. The world adds up. So does he.
 * ─────────────────────────────────────────────────────────────────
 *
 * Everything below is consumable by DialogueOverlay: arrays of
 * { speaker, text } (plus the optional side/wide/sprite hints the
 * overlay already understands). Lines are kept to <= 54 characters
 * so the bubble never overflows on the narrowest supported screen.
 */

import { ALL_HEROES } from './heroes.js';

export const STORY_VERSION = 1;

/** Hard cap enforced by story.test.js — matches DialogueOverlay's wrap. */
export const MAX_LINE_CHARS = 54;

// ══════════════════════════════════════════════════════════════════
// BIOMES — the vocabulary banter is keyed to
// ══════════════════════════════════════════════════════════════════

export const FLOOR_BIOME = {
  1: 'garden',
  2: 'tidepool',
  3: 'sky',
  4: 'ember',
  5: 'frost',
  6: 'crystal',
  7: 'market',
  8: 'library',
  9: 'mending',
};

export const BIOMES = Object.values(FLOOR_BIOME);

/** Guide who narrates each floor (matches guideArt.js portrait keys). */
export const FLOOR_GUIDE = {
  1: 'Elara', 2: 'Marlow', 3: 'Zephyr', 4: 'Cinder', 5: 'Frost',
  6: 'Faceta', 7: 'Penny', 8: 'Folio', 9: 'Elara',
};

export function biomeForFloor(floorId) {
  return FLOOR_BIOME[floorId] || 'garden';
}

// ══════════════════════════════════════════════════════════════════
// THE ARC — nine beats, one sentence of stake each
// ══════════════════════════════════════════════════════════════════

export const STORY_ARC = [
  {
    floor: 1,
    title: 'The Roses Stop Counting',
    stake: 'Numeria is quietly losing its numbers.',
    discovery: 'A line of handwriting scratched into a thorn.',
    turn: 'Someone is WRITING this. It is page one.',
  },
  {
    floor: 2,
    title: 'A Hundred Years of High Tide',
    stake: 'A city drowned because a number would not count down.',
    discovery: 'Page two, carved in the sea wall: only subtraction.',
    turn: 'The hero stops being alone. The party begins.',
  },
  {
    floor: 3,
    title: 'Words Written on the Sky',
    stake: 'The sky is in pieces and the light will not repeat.',
    discovery: 'The clouds are letters. Same tidy hand.',
    turn: 'One proof, written big enough to beg to be read.',
  },
  {
    floor: 4,
    title: 'The Anvil That Went Cold',
    stake: 'One lava flow has cut every road in the deep.',
    discovery: 'An old forge-mark under the fourth page.',
    turn: 'The angry writer used to MAKE things.',
  },
  {
    floor: 5,
    title: 'Nothing Moves, Nothing Breaks',
    stake: 'Absolute Zero froze the spring that feeds every river.',
    discovery: 'Page five, iced in: THE WORLD RUNS OUT.',
    turn: 'The party admits its doubt — and thaws anyway.',
  },
  {
    floor: 6,
    title: 'The Shape With a Side Missing',
    stake: 'Light lost its shapes; the deep halls are sealed.',
    discovery: 'The great facet shows the writer, incomplete.',
    turn: 'He is not wicked. He is UNFINISHED.',
  },
  {
    floor: 7,
    title: 'Endings, Two Coppers Each',
    stake: 'Coinford is drowning in fakes, including fake endings.',
    discovery: 'A till scrap: THIS STEP WAS NEVER CHECKED.',
    turn: 'A finish cannot be bought. A finish is work.',
  },
  {
    floor: 8,
    title: 'The Draft in the Bottom Drawer',
    stake: 'The Great Story is torn to quarters, sinking in ink.',
    discovery: "The Author's Study, and a page crossed out.",
    turn: 'The Chaos King is the Story\u2019s discarded first draft.',
  },
  {
    floor: 9,
    title: 'Plus Everyone',
    stake: 'The Theorem will empty the world to be proved right.',
    discovery: 'His proof is complete except for its final line.',
    turn: 'The party completes him instead of erasing him.',
  },
];

export function getArcBeat(floorId) {
  return STORY_ARC.find(b => b.floor === floorId) || null;
}

// ══════════════════════════════════════════════════════════════════
// THE PROOF — one fragment per floor. Read in order it is the whole
// villain: a proof that the world runs out, and the line that fixes it.
// ══════════════════════════════════════════════════════════════════

export const PROOF_FRAGMENTS = [
  { floor: 1, title: 'Page One',   text: 'Let the world be W.' },
  { floor: 2, title: 'Page Two',   text: 'Take away one. And one. And one.' },
  { floor: 3, title: 'Page Three', text: 'Repeat until nothing remains.' },
  { floor: 4, title: 'Page Four',  text: 'Divide what is left. It gets smaller.' },
  { floor: 5, title: 'Page Five',  text: 'Therefore the world runs out.' },
  { floor: 6, title: 'Page Six',   text: 'Therefore the world does not add up.' },
  { floor: 7, title: 'Page Seven', text: '(This step was never checked.)' },
  { floor: 8, title: 'Page Eight', text: '— first draft. Crossed out. —' },
  { floor: 9, title: 'The Last Line', text: 'Nothing was ever counted alone. + everyone.' },
];

export function getProofFragment(floorId) {
  return PROOF_FRAGMENTS.find(p => p.floor === floorId) || null;
}

/** Fragments the player has earned, in reading order. */
export function proofSoFar(highestFloorCleared) {
  return PROOF_FRAGMENTS.filter(p => p.floor <= highestFloorCleared);
}

// ══════════════════════════════════════════════════════════════════
// PER-FLOOR BEATS — arrival / midpoint / departure
// Arrival plays on entering. Midpoint plays at the halfway discovery.
// Departure plays after the floor is won, before the world map.
// ══════════════════════════════════════════════════════════════════

export const FLOOR_BEATS = {
  1: {
    arrival: [
      { speaker: 'Elara', text: 'Count the roses with me. One, two, three—', side: 'left' },
      { speaker: 'Elara', text: '...four. There were forty. I counted Tuesday.', side: 'left' },
      { speaker: 'Elara', text: 'Numeria is losing its numbers, hero.', side: 'left' },
      { speaker: 'Elara', text: 'Adding is how we take them back. Ready?', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Elara', text: 'Stop. Look at that thorn. Read it.' },
      { speaker: 'Narrator', text: 'Scratched in the briar: LET THE WORLD BE W.', wide: true },
      { speaker: 'Elara', text: 'That is handwriting. Somebody WROTE this.' },
      { speaker: 'Elara', text: 'Pocket it. I think it is page one.' },
    ],
    departure: [
      { speaker: 'Elara', text: 'Three fairies. One bridge. Forty roses.', side: 'left' },
      { speaker: 'Elara', text: 'I recounted. Twice. It adds up again.', side: 'left' },
      { speaker: 'Elara', text: 'But page one is still in my pocket.', side: 'left' },
      { speaker: 'Elara', text: 'Whoever wrote it was only getting started.', side: 'left' },
    ],
  },

  2: {
    arrival: [
      { speaker: 'Marlow', text: 'The tide has not gone out in a hundred years.', side: 'left' },
      { speaker: 'Marlow', text: 'It forgot how to count down, poor thing.', side: 'left' },
      { speaker: 'Elara', text: 'Then we count for it. Backwards.', side: 'right' },
      { speaker: 'Marlow', text: 'Aye. Take the sea away, measure by measure.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Marlow', text: 'Market Row! Dry cobbles! HOY!' },
      { speaker: 'Marlow', text: 'Hero — the sea wall. Someone carved on it.' },
      { speaker: 'Narrator', text: 'TAKE AWAY ONE. AND ONE. AND ONE.', wide: true },
      { speaker: 'Elara', text: 'Same hand as the briar. Page two.' },
      { speaker: 'Marlow', text: 'A writer who only knows how to subtract.' },
    ],
    departure: [
      { speaker: 'Marlow', text: 'A century of low tide, all in one afternoon.', side: 'left' },
      { speaker: 'Marlow', text: 'My lantern can finally go out. Ha!', side: 'left' },
      { speaker: 'Elara', text: 'And you are not one hero any more.', side: 'left' },
      { speaker: 'Elara', text: 'Look who you pulled out of the reef.', side: 'left' },
      { speaker: 'Elara', text: 'Two pages. They rhyme, in a sad way.', side: 'left' },
    ],
  },

  3: {
    arrival: [
      { speaker: 'Zephyr', text: 'Mind the gap. The sky is in PIECES.', side: 'left' },
      { speaker: 'Zephyr', text: 'One lamp is one lamp. Two lamps is four.', side: 'left' },
      { speaker: 'Elara', text: 'Light multiplies. So do we.', side: 'right' },
      { speaker: 'Zephyr', text: 'Then let us be extremely multiple.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Zephyr', text: 'See the clouds? Those are not clouds.' },
      { speaker: 'Narrator', text: 'They spell: REPEAT UNTIL NOTHING REMAINS.', wide: true },
      { speaker: 'Zephyr', text: 'Same tidy letters as your two pages.' },
      { speaker: 'Elara', text: 'He wrote it across the whole SKY, Zephyr.' },
      { speaker: 'Zephyr', text: 'Big feelings need a big margin, I reckon.' },
    ],
    departure: [
      { speaker: 'Zephyr', text: 'Sixteen bridges. My sheep are delighted.', side: 'left' },
      { speaker: 'Elara', text: 'Three pages now. It is all one proof.', side: 'left' },
      { speaker: 'Zephyr', text: 'And it keeps arriving at nothing.', side: 'left' },
      { speaker: 'Zephyr', text: 'Rude. There is loads of something up here.', side: 'left' },
    ],
  },

  4: {
    arrival: [
      { speaker: 'Cinder', text: 'One flow. No crossings. Mind your boots.', side: 'left' },
      { speaker: 'Cinder', text: 'Split it and it cools. Small is walkable.', side: 'left' },
      { speaker: 'Elara', text: 'Divide the fire. Cross it in parts.', side: 'right' },
      { speaker: 'Cinder', text: 'That is the whole trick, aye.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Cinder', text: 'Hero. This anvil is older than the caves.' },
      { speaker: 'Narrator', text: 'Stamped beneath: DIVIDE WHAT IS LEFT.', wide: true },
      { speaker: 'Cinder', text: 'Same hand. But look at the anvil itself.' },
      { speaker: 'Cinder', text: 'Somebody MADE things down here. Once.' },
      { speaker: 'Elara', text: 'A maker who stopped making. That is sad.' },
    ],
    departure: [
      { speaker: 'Cinder', text: 'Streams tame. Forge lit. Boots intact!', side: 'left' },
      { speaker: 'Elara', text: 'Four pages. And one anvil gone cold.', side: 'left' },
      { speaker: 'Cinder', text: 'Anyone that angry got hurt first.', side: 'left' },
      { speaker: 'Cinder', text: 'Take an ember. The next peak is cruel.', side: 'left' },
    ],
  },

  5: {
    arrival: [
      { speaker: 'Frost', text: 'B-brr. Everything up here has STOPPED.', side: 'left' },
      { speaker: 'Frost', text: 'Absolute Zero froze the Great Spring.', side: 'left' },
      { speaker: 'Elara', text: 'Why would anyone freeze a river?', side: 'right' },
      { speaker: 'Frost', text: 'So it cannot go wrong, he says.', side: 'left' },
      { speaker: 'Frost', text: 'Nothing moves. Nothing breaks. Nothing lives.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Frost', text: 'Four keys. Four kinds of math. Mix them!' },
      { speaker: 'Narrator', text: 'Iced into the falls: THE WORLD RUNS OUT.', wide: true },
      { speaker: 'Elara', text: '...What if he is right? What if it does?' },
      { speaker: 'Frost', text: 'Then we warm it up anyway. Come on.' },
    ],
    departure: [
      { speaker: 'Frost', text: 'Drip. Drop. Best sound in Numeria.', side: 'left' },
      { speaker: 'Frost', text: 'Even Zero liked it. I watched his face.', side: 'left' },
      { speaker: 'Elara', text: 'He was never cruel. He was AFRAID.', side: 'left' },
      { speaker: 'Elara', text: 'Five pages. I am starting to understand.', side: 'left' },
    ],
  },

  6: {
    arrival: [
      { speaker: 'Faceta', text: 'Mind the dark. Light broke down here.', side: 'left' },
      { speaker: 'Faceta', text: 'Give a beam a SHAPE and it cuts stone.', side: 'left' },
      { speaker: 'Elara', text: 'Triangles first. Count the corners.', side: 'right' },
      { speaker: 'Faceta', text: 'Every hall down here IS a shape. Walk it.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Faceta', text: 'Stand still. Look into the big facet.' },
      { speaker: 'Narrator', text: 'Your reflection — and one more beside it.', wide: true },
      { speaker: 'Faceta', text: 'A shape with one side missing. See the gap?' },
      { speaker: 'Elara', text: 'That is our writer. Unfinished. Literally.' },
      { speaker: 'Faceta', text: 'Six pages, one proof, and no last line.' },
    ],
    departure: [
      { speaker: 'Faceta', text: 'The Great Geode glows whole again.', side: 'left' },
      { speaker: 'Elara', text: 'Whole. That word keeps following us.', side: 'left' },
      { speaker: 'Faceta', text: 'Shapes cannot lie. Neither can he.', side: 'left' },
      { speaker: 'Faceta', text: 'He is not wicked. He is INCOMPLETE.', side: 'left' },
    ],
  },

  7: {
    arrival: [
      { speaker: 'Penny', text: 'Welcome to Coinford. Trust nothing shiny.', side: 'left' },
      { speaker: 'Penny', text: 'Fakes on every stall. Count before you grab.', side: 'left' },
      { speaker: 'Elara', text: 'Real math. Real coins. Off we go.', side: 'right' },
    ],
    midpoint: [
      { speaker: 'Penny', text: 'Stall nine is selling ENDINGS. In bottles.' },
      { speaker: 'Penny', text: 'Two coppers for "and they were fine".' },
      { speaker: 'Elara', text: 'You cannot buy a finish, Penny.' },
      { speaker: 'Penny', text: 'Papa says a finish is WORK, not gold.' },
      { speaker: 'Narrator', text: 'A scrap in the till: THIS STEP UNCHECKED.', wide: true },
    ],
    departure: [
      { speaker: 'Penny', text: 'Books balance! To the very last penny!', side: 'left' },
      { speaker: 'Elara', text: 'Seven pages. And a step nobody checked.', side: 'left' },
      { speaker: 'Penny', text: 'So check it. That is what heroes do.', side: 'left' },
      { speaker: 'Penny', text: 'Over the bridge: the Library. Good luck.', side: 'left' },
    ],
  },

  8: {
    arrival: [
      { speaker: 'Folio', text: 'Hoo. Mind the ink. It drowns whole shelves.', side: 'left' },
      { speaker: 'Folio', text: 'The Paradox tore the Great Story apart.', side: 'left' },
      { speaker: 'Elara', text: 'Quarters and halves. Make it whole.', side: 'right' },
      { speaker: 'Folio', text: 'And bring me every scrap you carry. Hoo.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'Folio', text: "The Author's Study. Nobody comes here." },
      { speaker: 'Narrator', text: 'A page, crossed out, in the bottom drawer.', wide: true },
      { speaker: 'Folio', text: 'The Great Story\u2019s FIRST DRAFT.' },
      { speaker: 'Folio', text: 'It proved the world does not add up.' },
      { speaker: 'Folio', text: 'So it was crossed out. And then it WOKE.' },
      { speaker: 'Elara', text: 'He is not a monster. He is a rough draft.' },
    ],
    departure: [
      { speaker: 'Folio', text: '4/4. One whole story, stair and all.', side: 'left' },
      { speaker: 'Elara', text: 'Eight pages. All in his handwriting.', side: 'left' },
      { speaker: 'Folio', text: 'Being wrong would mean being nothing.', side: 'left' },
      { speaker: 'Folio', text: 'So he set out to make himself true.', side: 'left' },
      { speaker: 'Elara', text: 'Then we finish his proof. Kindly.', side: 'left' },
      { speaker: 'Elara', text: 'To the Mending Room. All of us.', side: 'left' },
    ],
  },

  9: {
    arrival: [
      { speaker: 'Narrator', text: 'The Mending Room. Where it all began.', wide: true },
      { speaker: 'Elara', text: 'Look behind you. Every hero you freed.', side: 'left' },
      { speaker: 'Elara', text: 'Names he could not subtract. Not one.', side: 'left' },
      { speaker: 'Elara', text: 'Four wings. Four fragments. One proof.', side: 'left' },
      { speaker: 'Elara', text: 'We do not erase him. We FINISH him.', side: 'left' },
    ],
    midpoint: [
      { speaker: 'The Theorem', text: 'You brought my pages back to me?' },
      { speaker: 'The Theorem', text: 'Nobody brings a draft back. Nobody.' },
      { speaker: 'Elara', text: 'Read the last line with us.' },
      { speaker: 'The Theorem', text: 'There is no last line. I never wrote—' },
      { speaker: 'Elara', text: 'Then we write one. Place the fragments.' },
    ],
    departure: [
      { speaker: 'The Theorem', text: 'Nothing here was ever counted alone.', sprite: 'theorem', side: 'right' },
      { speaker: 'The Theorem', text: 'Not the roses. Not the tide. Not me.', sprite: 'theorem', side: 'right' },
      { speaker: 'Elara', text: 'Plus everyone. That is the whole proof.', side: 'left' },
      { speaker: 'Narrator', text: 'The Great Story makes room for its draft.', wide: true },
      { speaker: 'The Theorem', text: 'I add up. ...I would like to help.', sprite: 'theorem', side: 'right' },
      { speaker: 'Elara', text: 'Then take a pen. There is lots to write.', side: 'left' },
    ],
  },
};

/**
 * @param {number} floorId
 * @param {'arrival'|'midpoint'|'departure'} phase
 * @returns {{speaker:string,text:string}[]}
 */
export function getFloorBeat(floorId, phase) {
  const beats = FLOOR_BEATS[floorId];
  if (!beats) return [];
  return beats[phase] ? beats[phase].slice() : [];
}

// ══════════════════════════════════════════════════════════════════
// BOSS VOICES — one characterful pre-fight line, one defeat line
// that lands the theme. Defeat lines are never humiliating: each
// boss discovers the thing they were afraid of is actually nice.
// ══════════════════════════════════════════════════════════════════

export const BOSS_VOICE = {
  briarking: {
    name: 'Briar King',
    floor: 1,
    theme: 'Growth hoarded instead of shared.',
    prefight: 'I grew one thorn a day for a hundred years.',
    defeat: 'Oh. Petals. I forgot I could do petals.',
  },
  pressure: {
    name: 'The Pressure',
    floor: 2,
    theme: 'Holding on so hard nothing can leave.',
    prefight: 'I held the whole sea up so it could not go.',
    defeat: 'Low tide. ...It was tiring, being high.',
  },
  skywhale: {
    name: 'Skywhale',
    floor: 3,
    theme: 'Swallowing the light to keep things quiet.',
    prefight: 'I swallowed the sun to make a quiet dark.',
    defeat: 'The light is warm. I forgot about warm.',
  },
  pyroclast: {
    name: 'Pyroclast',
    floor: 4,
    theme: 'One road, mine, and nobody else may cross.',
    prefight: 'One flow. One road. And nobody crosses it.',
    defeat: 'Split into streams. Still burning. Huh.',
  },
  absolutezero: {
    name: 'Absolute Zero',
    floor: 5,
    theme: 'Stopping the world so it cannot be wrong.',
    prefight: 'Nothing moving. Nothing wrong. Perfect.',
    defeat: 'Drip. Drop. ...That is a nice sound.',
  },
  theprism: {
    name: 'The Prism',
    floor: 6,
    theme: 'Bending everything until true looks crooked.',
    prefight: 'Bend a beam enough and it forgets true.',
    defeat: 'You aimed me straight. I hate it. I love it.',
  },
  counterfeiter: {
    name: 'The Counterfeiter',
    floor: 7,
    theme: 'If nothing is real, nothing can be lost.',
    prefight: 'Everything is worth what I SAY it is worth.',
    defeat: 'Counted. Every coin. Nobody ever bothered.',
  },
  theparadox: {
    name: 'The Paradox',
    floor: 8,
    theme: 'Tearing the story so it can never end badly.',
    prefight: 'Half of a half of a half of a half. Forever!',
    defeat: 'You put me back in ORDER. Ugh. ...Thank you.',
  },
  theorem: {
    name: 'The Theorem',
    floor: 9,
    theme: 'A draft that will make itself true or make nothing.',
    prefight: 'I proved the world runs out. Watch me be right.',
    defeat: 'You did not erase me. You COUNTED me.',
  },
};

export const BOSS_ORDER = [
  'briarking', 'pressure', 'skywhale', 'pyroclast', 'absolutezero',
  'theprism', 'counterfeiter', 'theparadox', 'theorem',
];

export function getBossVoice(bossId) {
  return BOSS_VOICE[bossId] || null;
}

/**
 * @param {string} bossId
 * @param {'prefight'|'defeat'} which
 * @returns {{speaker:string,text:string,sprite:string,side:string}[]}
 */
export function getBossLine(bossId, which) {
  const v = BOSS_VOICE[bossId];
  if (!v || !v[which]) return [];
  return [{ speaker: v.name, text: v[which], sprite: bossId, side: 'right' }];
}

// ══════════════════════════════════════════════════════════════════
// HERO VOICES — 15 distinct ways of talking.
//
// voice     one-line direction for anyone writing more lines
// tic       the thing this hero always does with language
// lines     battle / rescue / idle signature lines
// perspective  what this hero adds to understanding the Theorem
//              (surfaced on floor 9 — "each hero adds a perspective")
// ══════════════════════════════════════════════════════════════════

export const HERO_VOICES = {
  'knight-shadow': {
    name: 'Shadow',
    voice: 'Five words or fewer. Sees what nobody else sees.',
    tic: 'Starts on an ellipsis. Never explains.',
    lines: {
      battle: ['"...Found the gap."', '"...Behind you. Handled."'],
      rescue: ['"...You came. Noted."'],
      idle: ['"...Someone counted these stones."', '"...Three exits. I checked."'],
    },
    perspective: '"...He hid because he was crossed out. I know that."',
  },
  'knight-crusader': {
    name: 'Crusader',
    voice: 'Earnest oath-speak. Slightly too formal. Means every word.',
    tic: 'Swears small promises out loud and then keeps them.',
    lines: {
      battle: ['"For everyone still counting!"', '"I swear it. And I keep my oaths."'],
      rescue: ['"Free! Now point me at the math."'],
      idle: ['"A kingdom is a promise kept daily."', '"I shield the small numbers too."'],
    },
    perspective: '"Nobody ever swore an oath to HIM. That is the wound."',
  },
  'knight-paladin': {
    name: 'Paladin',
    voice: 'Gentle. Checks on everybody. Says "we" instead of "I".',
    tic: 'Asks a caring question before doing anything brave.',
    lines: {
      battle: ['"Behind me — all of you."', '"Are we all right? Good. Again."'],
      rescue: ['"Strength alone does not multiply."'],
      idle: ['"Everyone drink water. That is an order."', '"You did the hard one. I saw."'],
    },
    perspective: '"He fought alone for a very long time. Not any more."',
  },
  'knight-berserker': {
    name: 'Berserker',
    voice: 'Volume of a thunderstorm, heart of a puppy.',
    tic: 'SHOUTS IN CAPS, then adds something unexpectedly sweet.',
    lines: {
      battle: ['"I LOVE THIS PART!"', '"HIT IT WITH A NUMBER!"'],
      rescue: ['"CAGES?! NEVER AGAIN! ...hi, friends."'],
      idle: ['"THIS ROCK IS MY FRIEND NOW."', '"IS THAT A SNACK? IT IS NOW."'],
    },
    perspective: '"HE IS JUST ANGRY! I KNOW ANGRY! ANGRY IS SCARED!"',
  },
  'knight-greathelm': {
    name: 'Great Helm',
    voice: 'Old, dry, unbothered. Long words delivered flatly.',
    tic: 'Undercuts every grand moment with a mild remark.',
    lines: {
      battle: ['"Proceed. I shall be immovable."', '"A tidy sum. Do it again."'],
      rescue: ['"The Prism called me a trophy. Hm."'],
      idle: ['"I have stood in far worse weather."', '"Legends are mostly just showing up."'],
    },
    perspective: '"I was a trophy in a case. He was a page in a drawer."',
  },

  'wizard-stargazer': {
    name: 'Stargazer',
    voice: 'Dreamy. Half-asleep. Beautiful non-sequiturs that turn out true.',
    tic: 'Describes the world as if it were weather in the sky.',
    lines: {
      battle: ['"The stars already saw this."', '"Hold still. You are in a constellation."'],
      rescue: ['"You found me. The sky said you would."'],
      idle: ['"Everything here is a triangle, softly."', '"I dreamed this floor. It had more birds."'],
    },
    perspective: '"Old stars are drafts too. We keep them anyway."',
  },
  'wizard-toadstool': {
    name: 'Toadstool',
    voice: 'Giggly imp. Calls everyone sprout. Brews things nobody ordered.',
    tic: 'Hee hee. Rhymes when excited. Offers you soup.',
    lines: {
      battle: ['"Hee hee! Spore you!"', '"Little bang, little brew, little BOO!"'],
      rescue: ['"Free at last! Who wants soup?"'],
      idle: ['"I planted a mushroom. It is doing great."', '"Sprout, you smell like brave."'],
    },
    perspective: '"Mushrooms grow on thrown-out things. The best ones."',
  },
  'wizard-spellblade': {
    name: 'Spellblade',
    voice: 'Deadpan cool. One-liners. Refuses to be impressed.',
    tic: 'Answers big questions with small flat sentences.',
    lines: {
      battle: ['"Punching is a spell. Look it up."', '"Too easy. Next."'],
      rescue: ['"Pinned to a reef. Soggy. Moving on."'],
      idle: ['"I do not read spellbooks. They read me."', '"Nice cave. Needs fewer monsters."'],
    },
    perspective: '"He wrote a whole proof to avoid saying one thing."',
  },
  'wizard-bookworm': {
    name: 'Bookworm',
    voice: 'Cites chapter and verse. Counts everything. Footnotes her jokes.',
    tic: 'Quotes a number nobody asked for, precisely.',
    lines: {
      battle: ['"Per chapter nine: hit it."', '"Predicted damage: satisfying."'],
      rescue: ['"Seventeen escape routes. You used mine."'],
      idle: ['"I counted 412 tiles. Two are lying."', '"Taking notes. You are in them."'],
    },
    perspective: '"No last line is not wrong. It is WAITING."',
  },
  'wizard-grandmage': {
    name: 'Grand Mage',
    voice: 'Imperious and impatient. Kind exactly once, when it matters.',
    tic: 'Complains about how long everything is taking.',
    lines: {
      battle: ['"Begone. I am busy being ancient."', '"You wasted my time. Correctly."'],
      rescue: ['"Do you know how LONG I waited?"'],
      idle: ['"In my day the walls were politer."', '"Do not touch that. ...Fine. Touch it."'],
    },
    perspective: '"I was a first draft once. Somebody kept me."',
  },

  'bunny-pepper': {
    name: 'Pepper',
    voice: 'No volume control, no brakes, interrupts herself.',
    tic: 'Says the plan while already doing the plan.',
    lines: {
      battle: ['"ZOOM ZOOM SMACK!"', '"I did a math AND a flip!"'],
      rescue: ['"YOU FOUND ME! I WAS SO BORED!"'],
      idle: ['"Can I bounce on it? Can I? CAN I?"', '"I named every rock. That one is Gary."'],
    },
    perspective: '"He needs a friend and like nine snacks. I have both."',
  },
  'bunny-nova': {
    name: 'Nova',
    voice: 'Sunny. Cheers for other people by name. Means it.',
    tic: 'Compliments somebody else in the middle of her own line.',
    lines: {
      battle: ['"Sparkle time! Go team!"', '"Nice one! That was YOUR number!"'],
      rescue: ['"The flood dimmed me. I kept shining."'],
      idle: ['"You are doing amazing. Objectively."', '"I saved you a shiny. It is a leaf."'],
    },
    perspective: '"Nobody ever told him he did a good job. Not once."',
  },
  'bunny-boulder': {
    name: 'Boulder',
    voice: 'Three words at a time. Calm. Accidentally profound.',
    tic: 'Says the shortest true thing available.',
    lines: {
      battle: ['"Heads up."', '"Big rock. Bye."'],
      rescue: ['"Bridge went. I stayed."'],
      idle: ['"Good rock. Solid."', '"Slow is still forward."'],
    },
    perspective: '"Unfinished is fine. Rocks take ages."',
  },
  'bunny-blaze': {
    name: 'Blaze',
    voice: 'Brags constantly. Measures the world in temperature.',
    tic: 'Turns every compliment into a hot take about himself.',
    lines: {
      battle: ['"Feel the HEAT!"', '"That answer? Medium rare."'],
      rescue: ['"Frozen. ME. The warmest bunny alive!"'],
      idle: ['"This cave is room temperature. Weak."', '"I am not showing off. I am glowing."'],
    },
    perspective: '"I tried to melt a mountain alone. Bad plan."',
  },
  'bunny-duchess': {
    name: 'Duchess',
    voice: 'Royal decrees, delivered precisely, to the penny.',
    tic: 'Audits things nobody asked her to audit.',
    lines: {
      battle: ['"By royal decree: subtract them."', '"Exact change. Always."'],
      rescue: ['"He locked me in my own vault. Rude."'],
      idle: ['"I audited this hallway. It is fine."', '"Manners cost nothing. Fakes cost plenty."'],
    },
    perspective: '"By royal decree, he is a citizen. Draft or not."',
  },
};

export function getHeroVoice(heroId) {
  return HERO_VOICES[heroId] || null;
}

/**
 * @param {string} heroId
 * @param {'battle'|'rescue'|'idle'} category
 * @returns {string[]}
 */
export function getHeroLines(heroId, category) {
  const v = HERO_VOICES[heroId];
  if (!v || !v.lines[category]) return [];
  return v.lines[category].slice();
}

/** All signature lines for a hero, flattened (battle + rescue + idle). */
export function getSignatureLines(heroId) {
  const v = HERO_VOICES[heroId];
  if (!v) return [];
  return [...v.lines.battle, ...v.lines.rescue, ...v.lines.idle];
}

/**
 * Deterministic when given an index; random otherwise.
 * @returns {string|null}
 */
export function pickHeroLine(heroId, category, index = null) {
  const lines = getHeroLines(heroId, category);
  if (!lines.length) return null;
  const i = index == null
    ? Math.floor(Math.random() * lines.length)
    : ((index % lines.length) + lines.length) % lines.length;
  return lines[i];
}

/** Floor-9 "each hero adds a perspective" chorus, in party order. */
export function getPerspectiveLines(partyIds) {
  const out = [];
  for (const id of partyIds || []) {
    const v = HERO_VOICES[id];
    if (v && v.perspective) out.push({ speaker: v.name, text: v.perspective });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// PARTY BANTER — the cheapest, highest-value storytelling there is.
//
// Three kinds:
//   SOLO_BANTER  one hero reacts to a biome (single-line toast)
//   PAIR_BANTER  two heroes riff off each other (2-4 lines)
//   COMP_BANTER  triggered by party SHAPE (class counts), not names
//
// Every entry: { id, biome, requires|classes, lines }
//   biome: a biome name or 'any'
//   lines: [{ who: heroId, text }] or [{ whoClass: 'knight', text }]
// ══════════════════════════════════════════════════════════════════

const solo = (id, biome, who, text) => ({ id, biome, requires: [who], lines: [{ who, text }] });

export const SOLO_BANTER = [
  // ── GARDEN ──
  solo('s_garden_pepper', 'garden', 'bunny-pepper', '"I will smell EVERY flower. Time me."'),
  solo('s_garden_boulder', 'garden', 'bunny-boulder', '"Nice dirt. Ten out of ten."'),
  solo('s_garden_stargazer', 'garden', 'wizard-stargazer', '"The bees fly in little spirals. Lovely."'),
  solo('s_garden_crusader', 'garden', 'knight-crusader', '"A garden is a promise somebody kept."'),
  solo('s_garden_toadstool', 'garden', 'wizard-toadstool', '"Ooh! Cousins! Hello, mushrooms!"'),

  // ── TIDEPOOL ──
  solo('s_tide_blaze', 'tidepool', 'bunny-blaze', '"Water. My nemesis. We have history."'),
  solo('s_tide_nova', 'tidepool', 'bunny-nova', '"Look! The puddles are doing sparkles!"'),
  solo('s_tide_shadow', 'tidepool', 'knight-shadow', '"...Something down there is still counting."'),
  solo('s_tide_bookworm', 'tidepool', 'wizard-bookworm', '"Tide charts! I could read these all day."'),
  solo('s_tide_duchess', 'tidepool', 'bunny-duchess', '"This city was rich once. I can tell."'),

  // ── SKY ──
  solo('s_sky_pepper', 'sky', 'bunny-pepper', '"CLOUDS! Can I bounce? I am bouncing!"'),
  solo('s_sky_greathelm', 'sky', 'knight-greathelm', '"A long way down. I shall not look."'),
  solo('s_sky_paladin', 'sky', 'knight-paladin', '"Stay near the middle, everyone. Please."'),
  solo('s_sky_stargazer', 'sky', 'wizard-stargazer', '"The stars are close enough to file."'),
  solo('s_sky_spellblade', 'sky', 'wizard-spellblade', '"Nice view. Terrible floor."'),

  // ── EMBER ──
  solo('s_ember_blaze', 'ember', 'bunny-blaze', '"NOW this is a proper room temperature."'),
  solo('s_ember_boulder', 'ember', 'bunny-boulder', '"Warm rock. Very warm rock. Ow."'),
  solo('s_ember_berserker', 'ember', 'knight-berserker', '"THE FLOOR IS SPICY! I LOVE IT!"'),
  solo('s_ember_grandmage', 'ember', 'wizard-grandmage', '"I have burned brighter. Barely."'),
  solo('s_ember_bookworm', 'ember', 'wizard-bookworm', '"A divided flow cools four times faster."'),

  // ── FROST ──
  solo('s_frost_pepper', 'frost', 'bunny-pepper', '"My EARS are ice cubes! ICE EARS!"'),
  solo('s_frost_blaze', 'frost', 'bunny-blaze', '"Stand near me. I am basically a stove."'),
  solo('s_frost_shadow', 'frost', 'knight-shadow', '"...Fresh tracks. Small ones. Hopping."'),
  solo('s_frost_toadstool', 'frost', 'wizard-toadstool', '"Frost mushrooms! Do NOT lick those."'),
  solo('s_frost_nova', 'frost', 'bunny-nova', '"I made a snow bunny. It is you!"'),

  // ── CRYSTAL ──
  solo('s_crystal_nova', 'crystal', 'bunny-nova', '"Everything is SHINY. I might cry."'),
  solo('s_crystal_duchess', 'crystal', 'bunny-duchess', '"Pocket no geodes. ...Fine. One geode."'),
  solo('s_crystal_greathelm', 'crystal', 'knight-greathelm', '"I was a decoration here. Never again."'),
  solo('s_crystal_stargazer', 'crystal', 'wizard-stargazer', '"The crystals hum. In tune, mostly."'),
  solo('s_crystal_spellblade', 'crystal', 'wizard-spellblade', '"Careful. Every wall is a mirror."'),

  // ── MARKET ──
  solo('s_market_duchess', 'market', 'bunny-duchess', '"Prices up nine percent. Explain that."'),
  solo('s_market_pepper', 'market', 'bunny-pepper', '"FREE SAMPLES! ...they are painted wood."'),
  solo('s_market_bookworm', 'market', 'wizard-bookworm', '"That sign breaks seventeen trade laws."'),
  solo('s_market_crusader', 'market', 'knight-crusader', '"Trade without honour is only theft."'),
  solo('s_market_toadstool', 'market', 'wizard-toadstool', '"I traded a spore for a hat! Good hat!"'),

  // ── LIBRARY ──
  solo('s_lib_bookworm', 'library', 'wizard-bookworm', '"I need a year in here. Minimum."'),
  solo('s_lib_grandmage', 'library', 'wizard-grandmage', '"I wrote shelf four. It has aged badly."'),
  solo('s_lib_pepper', 'library', 'bunny-pepper', '"This book has PICTURES. It is mine now."'),
  solo('s_lib_paladin', 'library', 'knight-paladin', '"Mind the falling pages. And your heads."'),
  solo('s_lib_shadow', 'library', 'knight-shadow', '"...That shelf is pretending to be a shelf."'),

  // ── MENDING ROOM ──
  solo('s_mend_berserker', 'mending', 'knight-berserker', '"LAST FLOOR! I AM EMOTIONAL ABOUT IT!"'),
  solo('s_mend_greathelm', 'mending', 'knight-greathelm', '"Well. Here we are, then."'),
  solo('s_mend_nova', 'mending', 'bunny-nova', '"Group hug afterwards. That is the plan."'),
  solo('s_mend_boulder', 'mending', 'bunny-boulder', '"Long walk. Good walk."'),
  solo('s_mend_paladin', 'mending', 'knight-paladin', '"Whatever happens, we go in together."'),
];

export const PAIR_BANTER = [
  // ── ANY BIOME ──
  {
    id: 'p_pepper_boulder', biome: 'any',
    requires: ['bunny-pepper', 'bunny-boulder'],
    lines: [
      { who: 'bunny-pepper', text: '"Boulder! Race you to the end!"' },
      { who: 'bunny-boulder', text: '"No."' },
      { who: 'bunny-pepper', text: '"...Fine. But I already won."' },
    ],
  },
  {
    id: 'p_shadow_nova', biome: 'any',
    requires: ['knight-shadow', 'bunny-nova'],
    lines: [
      { who: 'bunny-nova', text: '"Shadow! I saved you a sparkle!"' },
      { who: 'knight-shadow', text: '"...I do not sparkle."' },
      { who: 'bunny-nova', text: '"You do a little. On the inside."' },
    ],
  },
  {
    id: 'p_bookworm_stargazer', biome: 'any',
    requires: ['wizard-bookworm', 'wizard-stargazer'],
    lines: [
      { who: 'wizard-bookworm', text: '"I count the tiles. You count the stars."' },
      { who: 'wizard-stargazer', text: '"Same job. Different ceiling."' },
    ],
  },
  {
    id: 'p_crusader_duchess', biome: 'any',
    requires: ['knight-crusader', 'bunny-duchess'],
    lines: [
      { who: 'bunny-duchess', text: '"You kneel far too much, Crusader."' },
      { who: 'knight-crusader', text: '"I kneel to the work, Your Grace."' },
      { who: 'bunny-duchess', text: '"...Acceptable. Carry on."' },
    ],
  },
  {
    id: 'p_berserker_paladin', biome: 'any',
    requires: ['knight-berserker', 'knight-paladin'],
    lines: [
      { who: 'knight-paladin', text: '"Berserker. Please stay behind the shield."' },
      { who: 'knight-berserker', text: '"THE SHIELD IS BEHIND ME NOW!"' },
      { who: 'knight-paladin', text: '"...That is not how shields work."' },
    ],
  },
  {
    id: 'p_grandmage_bookworm', biome: 'any',
    requires: ['wizard-grandmage', 'wizard-bookworm'],
    lines: [
      { who: 'wizard-bookworm', text: '"Grand Mage. Is chapter six yours?"' },
      { who: 'wizard-grandmage', text: '"Chapter six was a draft."' },
      { who: 'wizard-bookworm', text: '"It is cited four hundred times."' },
      { who: 'wizard-grandmage', text: '"...Hm. Then it stays."' },
    ],
  },
  {
    id: 'p_toadstool_duchess', biome: 'any',
    requires: ['wizard-toadstool', 'bunny-duchess'],
    lines: [
      { who: 'wizard-toadstool', text: '"Duchess! Soup? I made soup."' },
      { who: 'bunny-duchess', text: '"What is in it?"' },
      { who: 'wizard-toadstool', text: '"Hee hee. Adventure."' },
      { who: 'bunny-duchess', text: '"...A small bowl."' },
    ],
  },
  {
    id: 'p_spellblade_greathelm', biome: 'any',
    requires: ['wizard-spellblade', 'knight-greathelm'],
    lines: [
      { who: 'knight-greathelm', text: '"You fight with your fists, wizard."' },
      { who: 'wizard-spellblade', text: '"They are enchanted fists."' },
      { who: 'knight-greathelm', text: '"They are fists."' },
      { who: 'wizard-spellblade', text: '"Enchanted ones."' },
    ],
  },
  {
    id: 'p_shadow_paladin', biome: 'any',
    requires: ['knight-shadow', 'knight-paladin'],
    lines: [
      { who: 'knight-paladin', text: '"Shadow. You have been quiet."' },
      { who: 'knight-shadow', text: '"...I have been counting."' },
      { who: 'knight-paladin', text: '"Counting what?"' },
      { who: 'knight-shadow', text: '"...Us. Still all here."' },
    ],
  },
  {
    id: 'p_pepper_bookworm', biome: 'any',
    requires: ['bunny-pepper', 'wizard-bookworm'],
    lines: [
      { who: 'wizard-bookworm', text: '"Pepper. Do not touch the—"' },
      { who: 'bunny-pepper', text: '"TOUCHED IT!"' },
      { who: 'wizard-bookworm', text: '"...Adding that to the notes."' },
    ],
  },
  {
    id: 'p_nova_paladin', biome: 'any',
    requires: ['bunny-nova', 'knight-paladin'],
    lines: [
      { who: 'bunny-nova', text: '"Paladin, who protects YOU?"' },
      { who: 'knight-paladin', text: '"...I had not thought about it."' },
      { who: 'bunny-nova', text: '"Me. It is me. Decided."' },
    ],
  },
  {
    id: 'p_crusader_shadow', biome: 'any',
    requires: ['knight-crusader', 'knight-shadow'],
    lines: [
      { who: 'knight-crusader', text: '"Shadow. Do you believe in the mending?"' },
      { who: 'knight-shadow', text: '"...I believe in you lot."' },
      { who: 'knight-crusader', text: '"That will do."' },
    ],
  },
  {
    id: 'p_berserker_grandmage', biome: 'any',
    requires: ['knight-berserker', 'wizard-grandmage'],
    lines: [
      { who: 'wizard-grandmage', text: '"Must you shout every single number?"' },
      { who: 'knight-berserker', text: '"SEVEN!"' },
      { who: 'wizard-grandmage', text: '"...I walked into that."' },
    ],
  },
  {
    id: 'p_duchess_nova', biome: 'any',
    requires: ['bunny-duchess', 'bunny-nova'],
    lines: [
      { who: 'bunny-duchess', text: '"Nova. Your posture is atrocious."' },
      { who: 'bunny-nova', text: '"Thank you! I worked on it!"' },
      { who: 'bunny-duchess', text: '"...That is not— never mind."' },
    ],
  },
  {
    id: 'p_boulder_stargazer', biome: 'any',
    requires: ['bunny-boulder', 'wizard-stargazer'],
    lines: [
      { who: 'wizard-stargazer', text: '"Boulder. Do rocks dream?"' },
      { who: 'bunny-boulder', text: '"Slowly."' },
      { who: 'wizard-stargazer', text: '"...Best answer I have ever had."' },
    ],
  },
  {
    id: 'p_blaze_berserker', biome: 'any',
    requires: ['bunny-blaze', 'knight-berserker'],
    lines: [
      { who: 'knight-berserker', text: '"BLAZE! WE SHOULD FIGHT EVERYTHING!"' },
      { who: 'bunny-blaze', text: '"Finally. Someone with taste."' },
    ],
  },
  {
    id: 'p_toadstool_bookworm', biome: 'any',
    requires: ['wizard-toadstool', 'wizard-bookworm'],
    lines: [
      { who: 'wizard-bookworm', text: '"Toadstool. Is that spore safe?"' },
      { who: 'wizard-toadstool', text: '"Define safe, sprout."' },
      { who: 'wizard-bookworm', text: '"...I am stepping back now."' },
    ],
  },
  {
    id: 'p_spellblade_pepper', biome: 'any',
    requires: ['wizard-spellblade', 'bunny-pepper'],
    lines: [
      { who: 'bunny-pepper', text: '"Spellblade! Teach me the punchy spell!"' },
      { who: 'wizard-spellblade', text: '"Step one: punch. Step two: mean it."' },
      { who: 'bunny-pepper', text: '"BEST LESSON EVER."' },
    ],
  },
  {
    id: 'p_greathelm_crusader', biome: 'any',
    requires: ['knight-greathelm', 'knight-crusader'],
    lines: [
      { who: 'knight-crusader', text: '"Sir. It is an honour to march with you."' },
      { who: 'knight-greathelm', text: '"It is a Tuesday, lad. But thank you."' },
    ],
  },
  {
    id: 'p_shadow_greathelm', biome: 'any',
    requires: ['knight-shadow', 'knight-greathelm'],
    lines: [
      { who: 'knight-greathelm', text: '"Shadow. Where exactly do you sleep?"' },
      { who: 'knight-shadow', text: '"...Nearby."' },
      { who: 'knight-greathelm', text: '"Comforting. Somehow."' },
    ],
  },
  {
    id: 'p_nova_berserker', biome: 'any',
    requires: ['bunny-nova', 'knight-berserker'],
    lines: [
      { who: 'knight-berserker', text: '"NOVA! DO THE SPARKLE!"' },
      { who: 'bunny-nova', text: '"Sparkle!"' },
      { who: 'knight-berserker', text: '"BEST DAY."' },
    ],
  },
  {
    id: 'p_crusader_toadstool', biome: 'any',
    requires: ['knight-crusader', 'wizard-toadstool'],
    lines: [
      { who: 'wizard-toadstool', text: '"Crusader! Want a lucky spore?"' },
      { who: 'knight-crusader', text: '"I make my own luck."' },
      { who: 'wizard-toadstool', text: '"...Put one in your helmet anyway."' },
    ],
  },
  {
    id: 'p_spellblade_bookworm', biome: 'any',
    requires: ['wizard-spellblade', 'wizard-bookworm'],
    lines: [
      { who: 'wizard-bookworm', text: '"Your technique has no theory."' },
      { who: 'wizard-spellblade', text: '"My technique has results."' },
      { who: 'wizard-bookworm', text: '"...Noted. Grudgingly."' },
    ],
  },
  {
    id: 'p_duchess_boulder', biome: 'any',
    requires: ['bunny-duchess', 'bunny-boulder'],
    lines: [
      { who: 'bunny-duchess', text: '"Boulder. Your opinion on the plan?"' },
      { who: 'bunny-boulder', text: '"Plan good. Walk now."' },
      { who: 'bunny-duchess', text: '"The finest briefing I have had."' },
    ],
  },
  {
    id: 'p_pepper_paladin', biome: 'any',
    requires: ['bunny-pepper', 'knight-paladin'],
    lines: [
      { who: 'knight-paladin', text: '"Pepper. Do not run ahead."' },
      { who: 'bunny-pepper', text: '"Not running! ARRIVING EARLY!"' },
    ],
  },
  {
    id: 'p_blaze_duchess', biome: 'any',
    requires: ['bunny-blaze', 'bunny-duchess'],
    lines: [
      { who: 'bunny-duchess', text: '"Blaze. You singed my cloak."' },
      { who: 'bunny-blaze', text: '"You are welcome. It was damp."' },
    ],
  },
  {
    id: 'p_stargazer_grandmage', biome: 'any',
    requires: ['wizard-stargazer', 'wizard-grandmage'],
    lines: [
      { who: 'wizard-grandmage', text: '"Star-child. Do you ever hurry?"' },
      { who: 'wizard-stargazer', text: '"The sky never does."' },
      { who: 'wizard-grandmage', text: '"...Insufferable. And correct."' },
    ],
  },
  {
    id: 'p_boulder_berserker', biome: 'any',
    requires: ['bunny-boulder', 'knight-berserker'],
    lines: [
      { who: 'knight-berserker', text: '"BOULDER! THROW ME AT IT!"' },
      { who: 'bunny-boulder', text: '"...Okay."' },
      { who: 'knight-berserker', text: '"WAIT REALLY—"' },
    ],
  },
  {
    id: 'p_nova_bookworm', biome: 'any',
    requires: ['bunny-nova', 'wizard-bookworm'],
    lines: [
      { who: 'wizard-bookworm', text: '"Nova. My notes say you glow at 2 lux."' },
      { who: 'bunny-nova', text: '"Is that a lot?"' },
      { who: 'wizard-bookworm', text: '"It is exactly enough."' },
    ],
  },
  {
    id: 'p_shadow_spellblade', biome: 'any',
    requires: ['knight-shadow', 'wizard-spellblade'],
    lines: [
      { who: 'wizard-spellblade', text: '"You ever going to finish a sentence?"' },
      { who: 'knight-shadow', text: '"...No."' },
      { who: 'wizard-spellblade', text: '"Respect."' },
    ],
  },
  {
    id: 'p_greathelm_grandmage', biome: 'any',
    requires: ['knight-greathelm', 'wizard-grandmage'],
    lines: [
      { who: 'wizard-grandmage', text: '"Helm. We are the two oldest here."' },
      { who: 'knight-greathelm', text: '"Speak for yourself, spark."' },
    ],
  },
  {
    id: 'p_blaze_nova', biome: 'any',
    requires: ['bunny-blaze', 'bunny-nova'],
    lines: [
      { who: 'bunny-nova', text: '"Blaze, you are lighting the whole path!"' },
      { who: 'bunny-blaze', text: '"I am NOT being helpful. Coincidence."' },
      { who: 'bunny-nova', text: '"Sure. Thank you anyway!"' },
    ],
  },
  {
    id: 'p_crusader_bookworm', biome: 'any',
    requires: ['knight-crusader', 'wizard-bookworm'],
    lines: [
      { who: 'knight-crusader', text: '"Scholar. Is courage in your books?"' },
      { who: 'wizard-bookworm', text: '"Chapter one. It is very short."' },
    ],
  },
  {
    id: 'p_toadstool_pepper', biome: 'any',
    requires: ['wizard-toadstool', 'bunny-pepper'],
    lines: [
      { who: 'bunny-pepper', text: '"Toadstool! What does this button do?"' },
      { who: 'wizard-toadstool', text: '"Hee hee! It is not a button."' },
      { who: 'bunny-pepper', text: '"...It blinked at me."' },
    ],
  },
  {
    id: 'p_paladin_greathelm', biome: 'any',
    requires: ['knight-paladin', 'knight-greathelm'],
    lines: [
      { who: 'knight-paladin', text: '"Sir, your armour is dented badly."' },
      { who: 'knight-greathelm', text: '"Every dent is a hero who is fine."' },
    ],
  },

  // ── GARDEN ──
  {
    id: 'p_garden_toadstool_pepper', biome: 'garden',
    requires: ['wizard-toadstool', 'bunny-pepper'],
    lines: [
      { who: 'wizard-toadstool', text: '"Pepper. That flower is a mushroom."' },
      { who: 'bunny-pepper', text: '"It smells GREAT."' },
      { who: 'wizard-toadstool', text: '"It is also me. Hee hee."' },
    ],
  },
  {
    id: 'p_garden_paladin_nova', biome: 'garden',
    requires: ['knight-paladin', 'bunny-nova'],
    lines: [
      { who: 'bunny-nova', text: '"Paladin, look! The bridge is BLOOMING!"' },
      { who: 'knight-paladin', text: '"So it is. Well done, all of you."' },
    ],
  },

  // ── TIDEPOOL ──
  {
    id: 'p_tide_bookworm_duchess', biome: 'tidepool',
    requires: ['wizard-bookworm', 'bunny-duchess'],
    lines: [
      { who: 'wizard-bookworm', text: '"Ebbport sank owing forty thousand coins."' },
      { who: 'bunny-duchess', text: '"Then we are its auditors. Later."' },
    ],
  },
  {
    id: 'p_tide_boulder_blaze', biome: 'tidepool',
    requires: ['bunny-boulder', 'bunny-blaze'],
    lines: [
      { who: 'bunny-blaze', text: '"Boulder. Do NOT let me fall in."' },
      { who: 'bunny-boulder', text: '"Got you."' },
      { who: 'bunny-blaze', text: '"...Thanks. Never speak of this."' },
    ],
  },

  // ── SKY ──
  {
    id: 'p_sky_stargazer_shadow', biome: 'sky',
    requires: ['wizard-stargazer', 'knight-shadow'],
    lines: [
      { who: 'wizard-stargazer', text: '"Shadow, there is nowhere to hide here."' },
      { who: 'knight-shadow', text: '"...There is always somewhere."' },
      { who: 'wizard-stargazer', text: '"...Where did he go."' },
    ],
  },
  {
    id: 'p_sky_pepper_greathelm', biome: 'sky',
    requires: ['bunny-pepper', 'knight-greathelm'],
    lines: [
      { who: 'bunny-pepper', text: '"Great Helm! Look down! LOOK DOWN!"' },
      { who: 'knight-greathelm', text: '"Absolutely not."' },
    ],
  },

  // ── EMBER ──
  {
    id: 'p_ember_blaze_grandmage', biome: 'ember',
    requires: ['bunny-blaze', 'wizard-grandmage'],
    lines: [
      { who: 'wizard-grandmage', text: '"Bunny. Your flame is adequate."' },
      { who: 'bunny-blaze', text: '"ADEQUATE?!"' },
      { who: 'wizard-grandmage', text: '"Hotter now. Good. It worked."' },
    ],
  },
  {
    id: 'p_ember_berserker_paladin', biome: 'ember',
    requires: ['knight-berserker', 'knight-paladin'],
    lines: [
      { who: 'knight-berserker', text: '"I REMEMBER THESE CAGES."' },
      { who: 'knight-paladin', text: '"I know. Walk with me. Slowly."' },
      { who: 'knight-berserker', text: '"...Okay. Slowly."' },
    ],
  },

  // ── FROST ──
  {
    id: 'p_frost_blaze_pepper', biome: 'frost',
    requires: ['bunny-blaze', 'bunny-pepper'],
    lines: [
      { who: 'bunny-pepper', text: '"Blaze! Be a campfire! PLEASE be one!"' },
      { who: 'bunny-blaze', text: '"I am a WARRIOR."' },
      { who: 'bunny-pepper', text: '"A warm one!"' },
      { who: 'bunny-blaze', text: '"...Fine. Two minutes."' },
    ],
  },
  {
    id: 'p_frost_nova_shadow', biome: 'frost',
    requires: ['bunny-nova', 'knight-shadow'],
    lines: [
      { who: 'bunny-nova', text: '"Shadow, your footprints are so tidy!"' },
      { who: 'knight-shadow', text: '"...Those are Frost\u2019s. He hops."' },
    ],
  },

  // ── CRYSTAL ──
  {
    id: 'p_crystal_greathelm_duchess', biome: 'crystal',
    requires: ['knight-greathelm', 'bunny-duchess'],
    lines: [
      { who: 'bunny-duchess', text: '"They kept you in a display case?"' },
      { who: 'knight-greathelm', text: '"With a small brass label."' },
      { who: 'bunny-duchess', text: '"...We are burning that label."' },
    ],
  },
  {
    id: 'p_crystal_stargazer_nova', biome: 'crystal',
    requires: ['wizard-stargazer', 'bunny-nova'],
    lines: [
      { who: 'bunny-nova', text: '"It is like standing inside a lamp!"' },
      { who: 'wizard-stargazer', text: '"Or inside a star. A polite one."' },
    ],
  },

  // ── MARKET ──
  {
    id: 'p_market_duchess_spellblade', biome: 'market',
    requires: ['bunny-duchess', 'wizard-spellblade'],
    lines: [
      { who: 'wizard-spellblade', text: '"That gold is fake."' },
      { who: 'bunny-duchess', text: '"How can you possibly tell?"' },
      { who: 'wizard-spellblade', text: '"It apologised when I picked it up."' },
    ],
  },
  {
    id: 'p_market_pepper_boulder', biome: 'market',
    requires: ['bunny-pepper', 'bunny-boulder'],
    lines: [
      { who: 'bunny-pepper', text: '"Boulder! Buy me EVERYTHING!"' },
      { who: 'bunny-boulder', text: '"No money."' },
      { who: 'bunny-pepper', text: '"Buy me NOTHING then. But loudly."' },
    ],
  },

  // ── LIBRARY ──
  {
    id: 'p_lib_bookworm_shadow', biome: 'library',
    requires: ['wizard-bookworm', 'knight-shadow'],
    lines: [
      { who: 'wizard-bookworm', text: '"Shadow. Help me find shelf twelve."' },
      { who: 'knight-shadow', text: '"...Already read it."' },
      { who: 'wizard-bookworm', text: '"You READ?"' },
      { who: 'knight-shadow', text: '"...Constantly."' },
    ],
  },
  {
    id: 'p_lib_toadstool_paladin', biome: 'library',
    requires: ['wizard-toadstool', 'knight-paladin'],
    lines: [
      { who: 'wizard-toadstool', text: '"Paladin! This book bit me!"' },
      { who: 'knight-paladin', text: '"Are you hurt?"' },
      { who: 'wizard-toadstool', text: '"No! I bit it back!"' },
    ],
  },

  // ── MENDING ROOM (the emotional turn, said by the party) ──
  {
    id: 'p_mend_crusader_berserker', biome: 'mending',
    requires: ['knight-crusader', 'knight-berserker'],
    lines: [
      { who: 'knight-berserker', text: '"CRUSADER. AFTER THIS. SNACKS?"' },
      { who: 'knight-crusader', text: '"After this, my friend, a feast."' },
    ],
  },
  {
    id: 'p_mend_duchess_nova', biome: 'mending',
    requires: ['bunny-duchess', 'bunny-nova'],
    lines: [
      { who: 'bunny-nova', text: '"Duchess. Are you scared?"' },
      { who: 'bunny-duchess', text: '"Terrified. Do not tell the crown."' },
      { who: 'bunny-nova', text: '"Same. Holding your paw anyway."' },
    ],
  },
  {
    id: 'p_mend_bookworm_stargazer', biome: 'mending',
    requires: ['wizard-bookworm', 'wizard-stargazer'],
    lines: [
      { who: 'wizard-bookworm', text: '"He wrote all of this. Every page."' },
      { who: 'wizard-stargazer', text: '"And nobody ever wrote back."' },
      { who: 'wizard-bookworm', text: '"...We are about to."' },
    ],
  },
  {
    id: 'p_mend_grandmage_paladin', biome: 'mending',
    requires: ['wizard-grandmage', 'knight-paladin'],
    lines: [
      { who: 'knight-paladin', text: '"Grand Mage. You have gone quiet."' },
      { who: 'wizard-grandmage', text: '"I was a first draft once. Long ago."' },
      { who: 'knight-paladin', text: '"And look at you now."' },
    ],
  },
  {
    id: 'p_mend_boulder_pepper', biome: 'mending',
    requires: ['bunny-boulder', 'bunny-pepper'],
    lines: [
      { who: 'bunny-pepper', text: '"Boulder. Am I brave? Say I am brave."' },
      { who: 'bunny-boulder', text: '"You are brave."' },
      { who: 'bunny-pepper', text: '"...Okay. Okay. Let us go."' },
    ],
  },
];

/** Party-SHAPE banter. Keyed to class counts, so it always has somebody. */
export const COMP_BANTER = [
  {
    id: 'c_three_knights', biome: 'any', classes: { knight: 3 },
    lines: [{ whoClass: 'knight', text: '"Three shields. The walls may apologise."' }],
  },
  {
    id: 'c_three_wizards', biome: 'any', classes: { wizard: 3 },
    lines: [{ whoClass: 'wizard', text: '"Three wizards. Someone hide the ceiling."' }],
  },
  {
    id: 'c_three_bunnies', biome: 'any', classes: { bunny: 3 },
    lines: [{ whoClass: 'bunny', text: '"Three bunnies. This is now a stampede."' }],
  },
  {
    id: 'c_balanced', biome: 'any', classes: { knight: 1, wizard: 1, bunny: 1 },
    lines: [
      { whoClass: 'knight', text: '"Shield, spell, and speed. Balanced."' },
      { whoClass: 'bunny', text: '"Mostly speed. But sure!"' },
    ],
  },
  {
    id: 'c_two_two_knight_bunny', biome: 'any', classes: { knight: 2, bunny: 2 },
    lines: [
      { whoClass: 'bunny', text: '"Two big ones, two fast ones. Perfect."' },
      { whoClass: 'knight', text: '"Do not let it go to your ears."' },
    ],
  },
];

/** Every banter entry, in one list. */
export const PARTY_BANTER = [...SOLO_BANTER, ...PAIR_BANTER, ...COMP_BANTER];

export const BANTER_COUNT = PARTY_BANTER.length;

// ── banter selection ─────────────────────────────────────────────

const NAME_BY_ID = {};
const CLASS_BY_ID = {};
for (const h of ALL_HEROES) {
  NAME_BY_ID[h.id] = h.name;
  CLASS_BY_ID[h.id] = h.class;
}

export function heroDisplayName(heroId) {
  return NAME_BY_ID[heroId] || HERO_VOICES[heroId]?.name || heroId;
}

function classCounts(partyIds) {
  const counts = { knight: 0, wizard: 0, bunny: 0 };
  for (const id of partyIds) {
    const c = CLASS_BY_ID[id];
    if (c && counts[c] != null) counts[c] += 1;
  }
  return counts;
}

function firstOfClass(partyIds, className) {
  return partyIds.find(id => CLASS_BY_ID[id] === className) || null;
}

/** Does this party satisfy a banter entry's requirements? */
export function banterMatches(entry, partyIds, biome) {
  if (entry.biome && entry.biome !== 'any' && entry.biome !== biome) return false;
  if (entry.requires) {
    for (const id of entry.requires) if (!partyIds.includes(id)) return false;
  }
  if (entry.classes) {
    const counts = classCounts(partyIds);
    for (const [cls, n] of Object.entries(entry.classes)) {
      if ((counts[cls] || 0) < n) return false;
      // a line spoken by a class must have a speaker available
      if (!firstOfClass(partyIds, cls)) return false;
    }
  }
  return true;
}

/**
 * All banter this party can hear in this biome.
 * @param {string[]} partyIds
 * @param {string} biome
 * @param {{ exclude?: Iterable<string> }} [opts]
 */
export function availableBanter(partyIds, biome, opts = {}) {
  const ids = Array.isArray(partyIds) ? partyIds : [];
  const skip = new Set(opts.exclude || []);
  return PARTY_BANTER.filter(e => !skip.has(e.id) && banterMatches(e, ids, biome));
}

/**
 * Resolve a banter entry into DialogueOverlay lines.
 * @returns {{speaker:string,text:string}[]}
 */
export function resolveBanter(entry, partyIds) {
  const ids = Array.isArray(partyIds) ? partyIds : [];
  const out = [];
  for (const l of entry.lines) {
    const heroId = l.who || (l.whoClass ? firstOfClass(ids, l.whoClass) : null);
    if (!heroId) continue;
    out.push({ speaker: heroDisplayName(heroId), text: l.text });
  }
  return out;
}

/**
 * Pick one banter exchange for this party/biome.
 * Deterministic when `index` is supplied (tests, replays); otherwise
 * uses the provided rng (defaults to Math.random).
 *
 * @returns {{ id: string, lines: {speaker:string,text:string}[] } | null}
 */
export function pickBanter(partyIds, biome, opts = {}) {
  const pool = availableBanter(partyIds, biome, opts);
  if (!pool.length) return null;
  const rng = opts.rng || Math.random;
  const i = opts.index == null
    ? Math.floor(rng() * pool.length) % pool.length
    : ((opts.index % pool.length) + pool.length) % pool.length;
  const entry = pool[i];
  return { id: entry.id, lines: resolveBanter(entry, partyIds) };
}

// ══════════════════════════════════════════════════════════════════
// RECAP — a one-line "previously on Numeria" for returning players
// ══════════════════════════════════════════════════════════════════

export function getRecap(highestFloorCleared) {
  const done = STORY_ARC.filter(b => b.floor <= highestFloorCleared);
  if (!done.length) {
    return [{ speaker: 'Elara', text: 'Numeria is losing its numbers. Shall we?' }];
  }
  const last = done[done.length - 1];
  const lines = [{ speaker: 'Elara', text: `Last time: ${last.title}.` }];
  lines.push({ speaker: 'Elara', text: last.turn });
  const next = STORY_ARC.find(b => b.floor === highestFloorCleared + 1);
  if (next) lines.push({ speaker: 'Elara', text: next.stake });
  return lines;
}
