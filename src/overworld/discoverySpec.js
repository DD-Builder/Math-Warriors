/**
 * discoverySpec — REASONS TO EXPLORE. The island's authored content, as data.
 *
 * ── THE PROBLEM THIS FILE IS THE ANSWER TO ─────────────────────────────────
 * The island is beautiful and it is empty. You can climb the Palace face, glide
 * off the Sky Cliffs and swim the shallows, and the only thing any of it leads
 * to is a coin on a levelled pad. Odyssey is a joy to move in BEFORE you do
 * anything; the reason it is also a joy to play is that every silhouette on the
 * horizon turns out to have been hiding something specific and hand-placed.
 *
 * So: thirty-nine hand-placed things, in four families.
 *
 *   SHRINES (9)   One per biome-with-a-floor. A small self-contained room whose
 *                 door is a PHYSICAL puzzle and whose lock is that floor's
 *                 maths operator. Solving the physical half buys the questions;
 *                 answering them opens the reward. Reward is real: a permanent
 *                 small buff, or a cosmetic, plus gold.
 *   GROTTOS (10)  One per biome INCLUDING the meadow, which otherwise has
 *                 nothing. Each is genuinely concealed — behind a waterfall,
 *                 under a rock arch, atop a sky ledge, inside a hollow tree —
 *                 and each has a discovery MOMENT: camera beat, chime, reward.
 *   LANDMARK
 *   PUZZLES (8)   Environmental puzzles readable with no text at all. Light the
 *                 braziers in ascending order. Stand on the plates that make
 *                 the target. Find the statue that is not like the others.
 *                 Level the market's balance.
 *   STORY
 *   PAGES (12)    A collection with MEANING: papercut pages of the Chaos King's
 *                 discarded proof, scattered worst-first across the island. Nine
 *                 are the proof itself (data/story.js PROOF_FRAGMENTS); three
 *                 are the margin notes nobody was supposed to read. Find them
 *                 all and the last line changes.
 *
 * ── EVERY COORDINATE IN HERE WAS MEASURED, NOT GUESSED ─────────────────────
 * Same discipline as traversalSpec.js: every position was found by sweeping
 * bearings and radii around the real biome regions in worldSpec.js, sampling
 * the ACTUAL heightfield, and keeping only spots that are above the water line
 * and inside the controller's 50-degree walk limit — then thinned so nothing
 * lands within 11 m of an existing portal, building, coin, climb base or the
 * spawn. discoverySpec.test.js re-runs exactly that audit against the live
 * heightfield, so a terrain edit that drowns a grotto turns a test red instead
 * of quietly deleting an hour of content.
 *
 * ── ART LAW ────────────────────────────────────────────────────────────────
 * Every colour in this file comes from PAPER. Shrine doors, page seals and
 * puzzle pips are cut paper in the biome's own accent, shadowed teal.
 *
 * Pure data plus pure selectors. No three, no phaser, no DOM, no RNG.
 */
import { PAPER } from '../config.js';
import { FLOOR_OPERATORS } from '../data/enemies.js';
import { normalizePuzzle } from './puzzles.js';

/** Kinds of discoverable thing, in the order the meter displays them. */
export const DISCOVERY_KINDS = ['shrine', 'grotto', 'puzzle', 'page'];

/**
 * How close you have to be for a thing to notice you.
 *
 * Grottos are deliberately the TIGHTEST: a grotto you trip over from nine
 * metres away is not hidden, it is signposted. Pages are the most generous
 * because a page you walked past and never saw is a collection item a child
 * will never finish.
 */
export const TRIGGER_RADIUS = { shrine: 5.0, grotto: 3.2, puzzle: 6.5, page: 4.0 };

// ═══════════════════════════════════════════════════════════════════════════
// THE PERMANENT BUFFS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Nine small, permanent, additive buffs — one per shrine. Every one is a
 * NUMBER other systems read through discovery.js `buffValue()`, never a branch
 * they have to know about, so adopting a buff is a one-line change at the read
 * site and nothing here reaches into another module.
 *
 * They are deliberately small. A child should notice the world got slightly
 * kinder, not that the game got easier — the ceiling on the whole set is about
 * a fifteen percent nudge, and none of them touch a maths answer.
 */
export const BUFFS = [
  { id: 'buff-sure-step', name: 'Sure Step', key: 'climbStamina', add: 0.18, tint: PAPER.leaf,
    blurb: 'Your fingers remember the holds. Climbs last a little longer.' },
  { id: 'buff-deep-breath', name: 'Deep Breath', key: 'swimSpeed', add: 0.15, tint: PAPER.teal,
    blurb: 'The shallows stopped arguing with you.' },
  { id: 'buff-long-glide', name: 'Long Glide', key: 'glideSink', add: -0.12, tint: PAPER.sky,
    blurb: 'Paper falls slowly when it is folded right.' },
  { id: 'buff-warm-boots', name: 'Warm Boots', key: 'emberGrip', add: 0.20, tint: PAPER.orange,
    blurb: 'Cinder slope, cool feet.' },
  { id: 'buff-paper-heart', name: 'Paper Heart', key: 'maxHpBonus', add: 5, tint: PAPER.rose,
    blurb: 'Five more hit points, folded in and creased flat.' },
  { id: 'buff-keen-eye', name: 'Keen Eye', key: 'senseRadius', add: 0.40, tint: PAPER.lavender,
    blurb: 'You notice things forty per cent further away than you used to.' },
  { id: 'buff-lucky-purse', name: 'Lucky Purse', key: 'goldFind', add: 0.10, tint: PAPER.gold,
    blurb: 'Coins on the island come in tens, not nines.' },
  { id: 'buff-calm-mind', name: 'Calm Mind', key: 'bonusHints', add: 1, tint: PAPER.sand,
    blurb: 'One more hint, every floor, forever.' },
  { id: 'buff-open-hand', name: 'Open Hand', key: 'potionPower', add: 0.15, tint: PAPER.coral,
    blurb: 'Potions go a little further when you share them.' },
];

/** Buff record by id, or null. */
export function buffById(id) { return BUFFS.find((b) => b.id === id) || null; }

// ═══════════════════════════════════════════════════════════════════════════
// THE COSMETICS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Twelve cosmetics: ten grotto trophies, the Palace shrine's wings, and the
 * one you can only get by finding every page. Purely visual — a cosmetic that
 * changes a number is a buff wearing a hat, and a child can tell.
 */
export const COSMETICS = [
  { id: 'cos-leafcloak', name: 'Leaf Cloak', slot: 'cloak', tint: PAPER.leaf },
  { id: 'cos-tidecrown', name: 'Tide Crown', slot: 'head', tint: PAPER.tealL },
  { id: 'cos-cloudsash', name: 'Cloud Sash', slot: 'sash', tint: PAPER.sky },
  { id: 'cos-emberlantern', name: 'Ember Lantern', slot: 'held', tint: PAPER.orange },
  { id: 'cos-frostscarf', name: 'Frost Scarf', slot: 'neck', tint: PAPER.white },
  { id: 'cos-prismpin', name: 'Prism Pin', slot: 'pin', tint: PAPER.lavender },
  { id: 'cos-coinbadge', name: 'Coinford Badge', slot: 'pin', tint: PAPER.gold },
  { id: 'cos-inkfeather', name: 'Ink Feather', slot: 'head', tint: PAPER.sand },
  { id: 'cos-foldedcrown', name: 'Folded Crown', slot: 'head', tint: PAPER.lavenderD },
  { id: 'cos-petalcrown', name: 'Petal Crown', slot: 'head', tint: PAPER.rose },
  { id: 'cos-paperwings', name: 'Paper Wings', slot: 'back', tint: PAPER.cream },
  { id: 'cos-storycloak', name: 'Story Cloak', slot: 'cloak', tint: PAPER.creamD },
];

export function cosmeticById(id) { return COSMETICS.find((c) => c.id === id) || null; }

// ═══════════════════════════════════════════════════════════════════════════
// THE SHRINES — one per biome, physics puzzle + that floor's operator
// ═══════════════════════════════════════════════════════════════════════════
/**
 * A shrine is three beats, in this order, always:
 *
 *   1. THE TRIAL   A physical/traversal puzzle in the shrine's little room.
 *                  It is the same five state machines everything else uses
 *                  (puzzles.js), so a child who lit the Ember braziers already
 *                  knows how the Sky shrine works.
 *   2. THE LOCKS   The trial pays out TOKENS (puzzles.trialTokens), and each
 *                  token is one maths question on this floor's operator, from
 *                  systems/math.js generateRatedQuestion. There is exactly one
 *                  question generator in this game and this is not a second
 *                  one — shrines.js calls it and nothing else.
 *   3. THE REWARD  Gold, plus a permanent buff (or, at the Palace, the wings).
 *
 * `approach` is standable ground in front of the door; `gate` names the
 * traversal ability the approach expects, purely so traversalFx can chalk the
 * right cue on the rock. Nothing is HARD-gated on an ability: every shrine can
 * be walked to, because a five-year-old who has not found the glider yet must
 * not be locked out of a third of the island.
 */
export const SHRINES = [
  {
    id: 'shrine-garden', name: 'Shrine of the First Count', biome: 'garden', floorId: 1,
    at: { x: -34.3, z: 110.9 }, approach: { x: -34.3, z: 116.4 }, gate: 'walk',
    tint: PAPER.leaf, doorGlyph: 'seed',
    line: 'Six stones in the grass, and one of them is warm.',
    trial: {
      kind: 'sum', target: 9,
      plates: [
        { id: 'gp1', value: 1 }, { id: 'gp2', value: 2 }, { id: 'gp3', value: 3 },
        { id: 'gp4', value: 4 }, { id: 'gp5', value: 5 }, { id: 'gp6', value: 6 },
      ],
    },
    reward: { gold: 60, buff: 'buff-sure-step' },
  },
  {
    id: 'shrine-tidepool', name: 'Shrine of the Ebb', biome: 'tidepool', floorId: 2,
    at: { x: 129.2, z: 113.9 }, approach: { x: 129.2, z: 119.4 }, gate: 'swim',
    tint: PAPER.tealL, doorGlyph: 'shell',
    line: 'The tide took something out of here, and left the shape of it.',
    trial: {
      kind: 'balance',
      weights: [
        { id: 'tw1', value: 2 }, { id: 'tw2', value: 3 }, { id: 'tw3', value: 4 },
        { id: 'tw4', value: 5 }, { id: 'tw5', value: 6 },
      ],
    },
    reward: { gold: 65, buff: 'buff-deep-breath' },
  },
  {
    id: 'shrine-sky', name: 'Shrine of the Long Fall', biome: 'sky', floorId: 3,
    at: { x: 131.2, z: 9.8 }, approach: { x: 131.2, z: 15.3 }, gate: 'glide',
    tint: PAPER.sky, doorGlyph: 'chime',
    line: 'Wind chimes, in a room with no wind. They are waiting to be asked.',
    trial: {
      kind: 'order',
      nodes: [
        { id: 'sc1', value: 2 }, { id: 'sc2', value: 4 }, { id: 'sc3', value: 6 },
        { id: 'sc4', value: 8 }, { id: 'sc5', value: 10 }, { id: 'sc6', value: 12 },
      ],
    },
    reward: { gold: 80, buff: 'buff-long-glide' },
  },
  {
    id: 'shrine-ember', name: 'Shrine of the Banked Fire', biome: 'ember', floorId: 4,
    at: { x: 121.5, z: -71.3 }, approach: { x: 121.5, z: -65.8 }, gate: 'climb',
    tint: PAPER.orange, doorGlyph: 'flame',
    line: 'Somebody banked this fire before they left. It has been patient.',
    trial: {
      kind: 'order',
      nodes: [
        { id: 'eb1', value: 3 }, { id: 'eb2', value: 6 }, { id: 'eb3', value: 9 },
        { id: 'eb4', value: 12 }, { id: 'eb5', value: 15 },
      ],
    },
    reward: { gold: 75, buff: 'buff-warm-boots' },
  },
  {
    id: 'shrine-frost', name: 'Shrine of the Still Hour', biome: 'frost', floorId: 5,
    at: { x: -34.8, z: -162.3 }, approach: { x: -34.8, z: -156.8 }, gate: 'walk',
    tint: PAPER.white, doorGlyph: 'flake',
    line: 'Six snow figures. Five of them were made the same afternoon.',
    trial: {
      kind: 'oddOne', oddId: 'fs4',
      items: [
        { id: 'fs1', trait: 'six-points' }, { id: 'fs2', trait: 'six-points' },
        { id: 'fs3', trait: 'six-points' }, { id: 'fs4', trait: 'five-points' },
        { id: 'fs5', trait: 'six-points' }, { id: 'fs6', trait: 'six-points' },
      ],
    },
    reward: { gold: 70, buff: 'buff-paper-heart' },
  },
  {
    id: 'shrine-crystal', name: 'Shrine of the Split Light', biome: 'crystal', floorId: 6,
    at: { x: -115.1, z: -75.2 }, approach: { x: -115.1, z: -69.7 }, gate: 'walk',
    tint: PAPER.lavender, doorGlyph: 'facet',
    line: 'One beam comes in. Where it goes next is entirely up to you.',
    trial: {
      kind: 'mirror', facings: 4,
      mirrors: [
        { id: 'cm1', start: 1, solution: 0 }, { id: 'cm2', start: 3, solution: 1 },
        { id: 'cm3', start: 0, solution: 2 }, { id: 'cm4', start: 2, solution: 3 },
      ],
    },
    reward: { gold: 85, buff: 'buff-keen-eye' },
  },
  {
    id: 'shrine-market', name: 'Shrine of the Fair Price', biome: 'market', floorId: 7,
    at: { x: -117.9, z: -9.9 }, approach: { x: -117.9, z: -4.4 }, gate: 'walk',
    tint: PAPER.gold, doorGlyph: 'scale',
    line: 'The oldest scale in Coinford, and nobody has cheated it yet.',
    trial: {
      kind: 'balance',
      weights: [
        { id: 'mw1', value: 1 }, { id: 'mw2', value: 2 }, { id: 'mw3', value: 3 },
        { id: 'mw4', value: 4 }, { id: 'mw5', value: 5 }, { id: 'mw6', value: 7 },
      ],
    },
    reward: { gold: 95, buff: 'buff-lucky-purse' },
  },
  {
    id: 'shrine-library', name: 'Shrine of the Unfinished Shelf', biome: 'library', floorId: 8,
    at: { x: -105.4, z: 99.4 }, approach: { x: -105.4, z: 104.9 }, gate: 'climb',
    tint: PAPER.sand, doorGlyph: 'book',
    line: 'A shelf with a gap in it, exactly one book wide.',
    trial: {
      kind: 'sum', target: 12,
      plates: [
        { id: 'lp1', value: 2 }, { id: 'lp2', value: 3 }, { id: 'lp3', value: 4 },
        { id: 'lp4', value: 5 }, { id: 'lp5', value: 7 }, { id: 'lp6', value: 8 },
      ],
    },
    reward: { gold: 90, buff: 'buff-calm-mind' },
  },
  {
    id: 'shrine-palace', name: 'Shrine of the Last Line', biome: 'palace', floorId: 9,
    // Approach measured on the roof terrace itself: the point 5.5 m due south
    // of the door is the 66-degree parapet face, which is not standable.
    at: { x: -28.5, z: 7.6 }, approach: { x: -26.3, z: 9.6 }, gate: 'climb',
    tint: PAPER.gold, doorGlyph: 'crown',
    line: 'Nine folded birds on a sill, and one of them was folded by a stranger.',
    trial: {
      kind: 'oddOne', oddId: 'pb7',
      items: [
        { id: 'pb1', trait: 'crane' }, { id: 'pb2', trait: 'crane' }, { id: 'pb3', trait: 'crane' },
        { id: 'pb4', trait: 'crane' }, { id: 'pb5', trait: 'crane' }, { id: 'pb6', trait: 'crane' },
        { id: 'pb7', trait: 'unfolded' }, { id: 'pb8', trait: 'crane' }, { id: 'pb9', trait: 'crane' },
      ],
    },
    reward: { gold: 120, cosmetic: 'cos-paperwings', buff: 'buff-open-hand' },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// THE GROTTOS — ten concealed places, ten discovery moments
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `conceal` is the thing the player has to see THROUGH, and it is the whole
 * design of the moment: level3dBuild reads it to build the right hiding place,
 * discoveryReveal.js reads it to pick the right camera push and the right
 * chime. `y` is the mouth's height; `depth` is how far in the pocket runs, so
 * the reveal camera has somewhere to dolly to.
 *
 * The meadow gets one even though it has no floor, no portal and no maths. It
 * is the connective tissue between garden and market and it has never once
 * rewarded a child for crossing it.
 */
export const GROTTOS = [
  {
    id: 'grotto-hollow-oak', name: 'The Hollow Oak', biome: 'garden',
    at: { x: -16.3, z: 160.9 }, conceal: 'tree', depth: 5.5, tint: PAPER.forest,
    line: 'The big oak is a door. It has always been a door.',
    reward: { gold: 45, cosmetic: 'cos-leafcloak' },
  },
  {
    id: 'grotto-tide-falls', name: 'Behind the Falls', biome: 'tidepool',
    at: { x: 111.3, z: 81.7 }, conceal: 'waterfall', depth: 7.0, tint: PAPER.teal,
    line: 'You can walk through it. Of course you can walk through it.',
    reward: { gold: 55, cosmetic: 'cos-tidecrown' },
  },
  {
    id: 'grotto-cloud-shelf', name: 'The Cloud Shelf', biome: 'sky',
    at: { x: 115.5, z: 39.0 }, conceal: 'sky-ledge', depth: 6.0, tint: PAPER.sky,
    line: 'A shelf of rock with nothing under it and a lamp still burning on it.',
    reward: { gold: 70, cosmetic: 'cos-cloudsash' },
  },
  {
    id: 'grotto-ember-flue', name: 'The Cooled Flue', biome: 'ember',
    at: { x: 85.0, z: -105.3 }, conceal: 'vent', depth: 8.0, tint: PAPER.coralD,
    line: 'This vent went out a long time ago. Somebody moved in.',
    reward: { gold: 60, cosmetic: 'cos-emberlantern' },
  },
  {
    id: 'grotto-ice-lens', name: 'Under the Lens', biome: 'frost',
    at: { x: -64.4, z: -151.5 }, conceal: 'ice', depth: 5.0, tint: PAPER.tealL,
    line: 'Clear ice, and a room on the other side of it, lit blue.',
    reward: { gold: 60, cosmetic: 'cos-frostscarf' },
  },
  {
    id: 'grotto-arch-under', name: 'Under the Arch', biome: 'crystal',
    at: { x: -78.4, z: -151.9 }, conceal: 'arch', depth: 6.5, tint: PAPER.lavender,
    line: 'Everyone walks over the arch. Nobody has ever gone under it.',
    reward: { gold: 65, cosmetic: 'cos-prismpin' },
  },
  {
    id: 'grotto-undercroft', name: 'The Undercroft', biome: 'market',
    at: { x: -103.0, z: 30.0 }, conceal: 'hatch', depth: 7.5, tint: PAPER.peach,
    line: 'Coinford keeps its oldest coins where nobody has to look at them.',
    reward: { gold: 80, cosmetic: 'cos-coinbadge' },
  },
  {
    id: 'grotto-stack-nine', name: 'Stack Nine', biome: 'library',
    at: { x: -82.8, z: 130.9 }, conceal: 'niche', depth: 6.0, tint: PAPER.sand,
    line: 'The shelves stop at eight. There is an eighth-and-a-half.',
    reward: { gold: 70, cosmetic: 'cos-inkfeather' },
  },
  {
    id: 'grotto-palace-eaves', name: 'Under the Eaves', biome: 'palace',
    at: { x: 44.0, z: -15.0 }, conceal: 'eaves', depth: 5.5, tint: PAPER.lavenderD,
    line: 'A fold in the Palace roof, big enough for one person to sit and think.',
    reward: { gold: 100, cosmetic: 'cos-foldedcrown' },
  },
  {
    id: 'grotto-petal-hollow', name: 'The Petal Hollow', biome: 'meadow',
    at: { x: -54.4, z: 158.1 }, conceal: 'petals', depth: 4.5, tint: PAPER.rose,
    line: 'The petals were not falling. They were going somewhere.',
    reward: { gold: 50, cosmetic: 'cos-petalcrown' },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// THE LANDMARK PUZZLES — eight, readable with no words at all
// ═══════════════════════════════════════════════════════════════════════════
/**
 * These sit out in the OPEN, unlike shrines and grottos, because their job is
 * to be seen from a distance and walked toward. Every one of them is a shape a
 * child can read: a row of unlit braziers with pips carved on them, a ring of
 * plates around a stone with four dots on it, six statues with the same number
 * of arms and a seventh with five.
 *
 * `spread` is the radius the pieces are scattered over, which is what makes a
 * puzzle a PLACE rather than a control panel: the plates that make eight are
 * eleven metres apart, so solving one is a small journey.
 */
export const LANDMARK_PUZZLES = [
  {
    id: 'puz-garden-plates', name: 'The Counting Ring', biome: 'garden',
    at: { x: -51.7, z: 147.2 }, spread: 11, tint: PAPER.sage,
    line: 'Four dots on the stone. Stand on what makes four.',
    puzzle: {
      kind: 'sum', target: 8,
      plates: [{ id: 'gr1', value: 1 }, { id: 'gr2', value: 2 }, { id: 'gr3', value: 3 },
        { id: 'gr4', value: 5 }, { id: 'gr5', value: 6 }],
    },
    reward: { gold: 35, potions: 1 },
  },
  {
    id: 'puz-tidepool-lamps', name: 'The Tide Lamps', biome: 'tidepool',
    at: { x: 143.2, z: 91.8 }, spread: 13, tint: PAPER.teal,
    line: 'Five lamps on five rocks, and the tide only ever reaches them in one order.',
    puzzle: {
      kind: 'order',
      nodes: [{ id: 'tl1', value: 1 }, { id: 'tl2', value: 2 }, { id: 'tl3', value: 3 },
        { id: 'tl4', value: 4 }, { id: 'tl5', value: 5 }],
    },
    reward: { gold: 40, potions: 1 },
  },
  {
    id: 'puz-sky-chimes', name: 'The Wind Ladder', biome: 'sky',
    at: { x: 156.5, z: -26.6 }, spread: 14, tint: PAPER.lavender,
    line: 'Six chimes down the cliff, hung lowest note first. Play them going up.',
    puzzle: {
      kind: 'order',
      nodes: [{ id: 'wc1', value: 5 }, { id: 'wc2', value: 10 }, { id: 'wc3', value: 15 },
        { id: 'wc4', value: 20 }, { id: 'wc5', value: 25 }, { id: 'wc6', value: 30 }],
    },
    reward: { gold: 55, potions: 1 },
  },
  {
    id: 'puz-ember-braziers', name: 'The Banked Row', biome: 'ember',
    at: { x: 82.8, z: -139.3 }, spread: 12, tint: PAPER.orange,
    line: 'Five braziers, five numbers carved in them. Smallest fire first.',
    puzzle: {
      kind: 'order',
      nodes: [{ id: 'eb-a', value: 2 }, { id: 'eb-b', value: 4 }, { id: 'eb-c', value: 7 },
        { id: 'eb-d', value: 11 }, { id: 'eb-e', value: 16 }],
    },
    reward: { gold: 45, potions: 1 },
  },
  {
    id: 'puz-frost-statues', name: 'The Six Watchers', biome: 'frost',
    at: { x: -43.6, z: -126.5 }, spread: 10, tint: PAPER.white,
    line: 'Six watchers on the snow. One of them was carved by somebody else.',
    puzzle: {
      kind: 'oddOne', oddId: 'fw5',
      items: [{ id: 'fw1', trait: 'three-arms' }, { id: 'fw2', trait: 'three-arms' },
        { id: 'fw3', trait: 'three-arms' }, { id: 'fw4', trait: 'three-arms' },
        { id: 'fw5', trait: 'four-arms' }, { id: 'fw6', trait: 'three-arms' }],
    },
    reward: { gold: 45, potions: 1 },
  },
  {
    id: 'puz-crystal-mirrors', name: 'The Facet Walk', biome: 'crystal',
    at: { x: -76.0, z: -111.9 }, spread: 15, tint: PAPER.lavender,
    line: 'Turn the stones until the light gets all the way to the end.',
    puzzle: {
      kind: 'mirror', facings: 4,
      mirrors: [{ id: 'fw-m1', start: 2, solution: 0 }, { id: 'fw-m2', start: 1, solution: 3 },
        { id: 'fw-m3', start: 3, solution: 1 }],
    },
    reward: { gold: 50, potions: 1 },
  },
  {
    id: 'puz-market-balance', name: 'The Old Scale', biome: 'market',
    at: { x: -149.6, z: -15.9 }, spread: 9, tint: PAPER.gold,
    line: 'Four crates and a scale nobody has levelled in a hundred years.',
    puzzle: {
      kind: 'balance',
      weights: [{ id: 'oc1', value: 3 }, { id: 'oc2', value: 4 },
        { id: 'oc3', value: 5 }, { id: 'oc4', value: 6 }],
    },
    reward: { gold: 60, potions: 1 },
  },
  {
    id: 'puz-library-shelves', name: 'The Missing Volumes', biome: 'library',
    at: { x: -65.5, z: 117.2 }, spread: 12, tint: PAPER.cream,
    line: 'The gap in the shelf is fifteen wide. The books are on the floor.',
    puzzle: {
      kind: 'sum', target: 15,
      plates: [{ id: 'mv1', value: 2 }, { id: 'mv2', value: 4 }, { id: 'mv3', value: 5 },
        { id: 'mv4', value: 6 }, { id: 'mv5', value: 9 }, { id: 'mv6', value: 11 }],
    },
    reward: { gold: 55, potions: 1 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// THE STORY PAGES — a collection with meaning
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Twelve papercut pages, torn out of the same proof, scattered across every
 * biome on the island. The nine numbered ones ARE the Chaos King's argument,
 * which data/story.js already carries as PROOF_FRAGMENTS — storyPages.js reads
 * them from there when it can and falls back to the text below when it cannot,
 * so this file cannot break if story.js is being edited by somebody else.
 *
 * The three MARGIN pages are new, and they are the point of the collection:
 * the proof reads as a monster's manifesto until you find the margin notes,
 * at which point it reads as somebody frightened, checking their own work at
 * three in the morning and not liking the answer.
 *
 * `hard` marks the four that need a real traversal ability to reach. A child
 * who only walks can still finish eight of twelve, which is enough to feel the
 * shape of the story; the last four are what the glider is FOR.
 */
export const STORY_PAGES = [
  { id: 'page-1', order: 1, floorId: 1, biome: 'garden', at: { x: -33.8, z: 140.9 }, hard: false,
    fallback: 'Let the world be W.', margin: false },
  { id: 'page-2', order: 2, floorId: 2, biome: 'tidepool', at: { x: 126.9, z: 74.1 }, hard: false,
    fallback: 'Take away one. And one. And one.', margin: false },
  { id: 'page-3', order: 3, floorId: 3, biome: 'sky', at: { x: 135.2, z: -6.6 }, hard: true,
    fallback: 'Repeat until nothing remains.', margin: false },
  { id: 'page-4', order: 4, floorId: 4, biome: 'ember', at: { x: 142.4, z: -67.8 }, hard: false,
    fallback: 'Divide what is left. It gets smaller.', margin: false },
  { id: 'page-5', order: 5, floorId: 5, biome: 'frost', at: { x: 31.4, z: -105.6 }, hard: false,
    fallback: 'Therefore the world runs out.', margin: false },
  { id: 'page-6', order: 6, floorId: 6, biome: 'crystal', at: { x: -101.7, z: -90.1 }, hard: false,
    fallback: 'Therefore the world does not add up.', margin: false },
  { id: 'page-7', order: 7, floorId: 7, biome: 'market', at: { x: -143.7, z: -56.9 }, hard: false,
    fallback: '(This step was never checked.)', margin: false },
  { id: 'page-8', order: 8, floorId: 8, biome: 'library', at: { x: -86.8, z: 86.8 }, hard: false,
    fallback: '— first draft. Crossed out. —', margin: false },
  { id: 'page-9', order: 9, floorId: 9, biome: 'palace', at: { x: 0.0, z: 23.8 }, hard: true,
    fallback: 'Nothing was ever counted alone. + everyone.', margin: false },

  // The margin notes. Same handwriting, much smaller, and not part of the proof.
  { id: 'page-m1', order: 10, floorId: null, biome: 'meadow', at: { x: -98.5, z: 147.1 }, hard: false,
    margin: true, fallback: 'I have checked step four eleven times.' },
  { id: 'page-m2', order: 11, floorId: null, biome: 'tidepool', at: { x: 152.0, z: 147.0 }, hard: true,
    margin: true, fallback: 'If I am wrong about this I am not anything.' },
  { id: 'page-m3', order: 12, floorId: null, biome: 'sky', at: { x: 136.9, z: 26.3 }, hard: true,
    margin: true, fallback: 'Somebody please find this and tell me I am wrong.' },
];

/** Finding every page is worth more than the sum of the pages. */
export const PAGE_SET_REWARD = { gold: 400, cosmetic: 'cos-storycloak' };

// ═══════════════════════════════════════════════════════════════════════════
// THE METER
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Ranks. Five of them, none of them a scold — "Wanderer" is what you ARE at
 * zero per cent, not what you failed to stop being.
 */
export const RANKS = [
  { id: 'wanderer', name: 'Wanderer', at: 0, tint: PAPER.sage },
  { id: 'pathfinder', name: 'Pathfinder', at: 0.25, tint: PAPER.teal },
  { id: 'cartographer', name: 'Cartographer', at: 0.50, tint: PAPER.gold },
  { id: 'islandheart', name: 'Islandheart', at: 0.75, tint: PAPER.coral },
  { id: 'papermind', name: 'Papermind', at: 1.0, tint: PAPER.lavenderD },
];

/**
 * Milestone payouts, claimed once each as the meter crosses them. These exist
 * so the meter is a REASON and not a scoreboard: a child at 24 per cent has
 * something concrete two grottos away.
 */
export const MILESTONES = [
  { id: 'ms-25', at: 0.25, reward: { gold: 100 }, line: 'A quarter of the island knows your name.' },
  { id: 'ms-50', at: 0.50, reward: { gold: 200 }, line: 'Half. You have walked over half of everything.' },
  { id: 'ms-75', at: 0.75, reward: { gold: 300 }, line: 'Three quarters. The island has almost run out of secrets.' },
  { id: 'ms-100', at: 1.0, reward: { gold: 500, cosmetic: 'cos-foldedcrown' }, line: 'Every last one. There is nothing here you have not seen.' },
];

// ═══════════════════════════════════════════════════════════════════════════
// THE FLAT INDEX — one array everything else reads
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Every discoverable thing, normalised to ONE record shape so the meter, the
 * compass and the proximity runtime never have to switch on kind:
 *
 *   { id, kind, biome, floorId, name, x, z, radius, hidden, tint, line, reward }
 *
 * `hidden` means the thing is not visible until found — grottos and pages are;
 * shrines and landmark puzzles are landmarks you can see from across the biome,
 * which is the whole reason they pull you across it.
 */
export const DISCOVERIES = [
  ...SHRINES.map((s) => ({
    id: s.id, kind: 'shrine', biome: s.biome, floorId: s.floorId, name: s.name,
    x: s.at.x, z: s.at.z, radius: TRIGGER_RADIUS.shrine, hidden: false,
    tint: s.tint, line: s.line, reward: s.reward,
  })),
  ...GROTTOS.map((g) => ({
    id: g.id, kind: 'grotto', biome: g.biome, floorId: null, name: g.name,
    x: g.at.x, z: g.at.z, radius: TRIGGER_RADIUS.grotto, hidden: true,
    tint: g.tint, line: g.line, reward: g.reward,
  })),
  ...LANDMARK_PUZZLES.map((p) => ({
    id: p.id, kind: 'puzzle', biome: p.biome, floorId: null, name: p.name,
    x: p.at.x, z: p.at.z, radius: TRIGGER_RADIUS.puzzle, hidden: false,
    tint: p.tint, line: p.line, reward: p.reward,
  })),
  ...STORY_PAGES.map((p) => ({
    id: p.id, kind: 'page', biome: p.biome, floorId: p.floorId,
    name: p.margin ? 'A margin note' : `Page ${p.order}`,
    x: p.at.x, z: p.at.z, radius: TRIGGER_RADIUS.page, hidden: true,
    tint: p.margin ? PAPER.creamD : PAPER.cream, line: null,
    reward: { page: p.id },
  })),
];

/** How many things there are to find, total. The denominator of the meter. */
export const DISCOVERY_TOTAL = DISCOVERIES.length;

/** Totals per kind, for the meter's four sub-bars. */
export const DISCOVERY_TOTALS_BY_KIND = DISCOVERY_KINDS.reduce((acc, k) => {
  acc[k] = DISCOVERIES.filter((d) => d.kind === k).length;
  return acc;
}, {});

/** Totals per biome, for the map screen's per-region counts. */
export const DISCOVERY_TOTALS_BY_BIOME = DISCOVERIES.reduce((acc, d) => {
  acc[d.biome] = (acc[d.biome] || 0) + 1;
  return acc;
}, {});

// ── Selectors ──────────────────────────────────────────────────────────────

const BY_ID = new Map(DISCOVERIES.map((d) => [d.id, d]));

/** A normalised discovery record by id, or null. */
export function discoveryById(id) { return BY_ID.get(id) || null; }

/** Every discovery in a biome. */
export function discoveriesInBiome(biome) { return DISCOVERIES.filter((d) => d.biome === biome); }

/** The full shrine record (trial, approach, gate) by id, or null. */
export function shrineById(id) { return SHRINES.find((s) => s.id === id) || null; }

/** The full landmark-puzzle record by id, or null. */
export function landmarkPuzzleById(id) { return LANDMARK_PUZZLES.find((p) => p.id === id) || null; }

/** The full grotto record by id, or null. */
export function grottoById(id) { return GROTTOS.find((g) => g.id === id) || null; }

/** The full page record by id, or null. */
export function storyPageById(id) { return STORY_PAGES.find((p) => p.id === id) || null; }

/**
 * The maths operator a shrine's locks use — that floor's operator, from the
 * same table the 2D maze and the 3D floor both read. A shrine on Floor 4 asks
 * division questions because Floor 4 IS division; there is no second table.
 */
export function shrineOperator(shrine) {
  const s = typeof shrine === 'string' ? shrineById(shrine) : shrine;
  return (s && FLOOR_OPERATORS[s.floorId]) || '+';
}

/** The puzzle spec a shrine's trial runs, normalised. */
export function shrineTrial(shrine) {
  const s = typeof shrine === 'string' ? shrineById(shrine) : shrine;
  return s ? normalizePuzzle(s.trial) : null;
}

/** The puzzle spec a landmark puzzle runs, normalised. */
export function landmarkTrial(puzzle) {
  const p = typeof puzzle === 'string' ? landmarkPuzzleById(puzzle) : puzzle;
  return p ? normalizePuzzle(p.puzzle) : null;
}

/** The rank for a 0..1 fraction of the island found. */
export function rankFor(pct) {
  let best = RANKS[0];
  for (const r of RANKS) if (pct >= r.at) best = r;
  return best;
}
