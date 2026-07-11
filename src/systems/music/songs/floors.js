/**
 * The nine floor themes — one exploration piece per realm.
 *
 * Every theme is a variation on the Paper Meadow motif (the rising
 * E–G–C figure from the title), re-keyed, re-timed and re-orchestrated
 * to its realm — and each one plays with its floor's MATH idea in the
 * music itself:
 *
 *  1 Garden (addition)        — phrases that stack, one voice added per pass
 *  2 Ebbport (subtraction)    — ebbing lines, each answer shorter than the call
 *  3 Sky (multiplication)     — the motif doubles: quarters → eighths
 *  4 Ember (division)         — a forge riff split in half, then in half again
 *  5 Frozen (mixed review)    — four keys' fragments under one slow thaw
 *  6 Crystal (geometry)       — three-note cells turning against 4/4 like facets
 *  7 Market (money)           — oom-pah stalls, coins counted on the offbeat
 *  8 Library (fractions)      — a whole phrase answered by its half and quarter
 *  9 Mending Room (all math)  — every realm's fragment, mended into one tune
 */

import { seq, prog, every, arp, chord } from '../theory.js';

/* ------------------------------------------------------------------ */
/* Floor 1 — "Garden of Sums" (C major, 104). Kalimba states the      */
/* meadow motif; each 8-beat pass ADDS a voice: melody, then sparkle,  */
/* then bass runs — addition you can hear.                             */
/* ------------------------------------------------------------------ */

const F1_MELODY_A = [
  ...seq('E5 G5 C6 . G5 E5 G5 .', { step: 0.5, v: 0.85 }),
  ...seq('A5 G5 E5 G5 D5~ .', { step: 0.5, t0: 4, v: 0.8 }),
  ...seq('E5 G5 C6 . D6 C6 A5 G5', { step: 0.5, t0: 8, v: 0.85 }),
  ...seq('A5 G5 E5 D5 C5~ .', { step: 0.5, t0: 12, v: 0.82 }),
  ...seq('F5 A5 C6 . A5 F5 A5 .', { step: 0.5, t0: 16, v: 0.83 }),
  ...seq('G5 E5 C5 E5 G5~ .', { step: 0.5, t0: 20, v: 0.8 }),
  ...seq('A5 B5 C6 G5 E5 G5 D5 E5', { step: 0.5, t0: 24, v: 0.85 }),
  { n: 'C5', t: 28, d: 1.5, v: 0.85 }, { n: 'E5', t: 29.5, d: 0.5, v: 0.75 },
  { n: 'C6', t: 30, d: 2, v: 0.9 },
];
const F1_SPARKLE_B = [
  { n: 'C6', t: 1.5, d: 0.5, v: 0.5 }, { n: 'E6', t: 5.5, d: 0.5, v: 0.5 },
  { n: 'G6', t: 9.5, d: 0.5, v: 0.48 }, { n: 'C6', t: 13.5, d: 0.5, v: 0.5 },
  ...seq('C6 D6 E6 G6', { step: 0.5, t0: 17.5, v: 0.5 }),
  { n: 'A5', t: 21.5, d: 0.5, v: 0.48 }, { n: 'E6', t: 25.5, d: 0.5, v: 0.5 },
  { n: 'G6', t: 29, d: 2, v: 0.52 },
];
const F1_CHORDS = [
  ['C4', 'maj'], ['A3', 'min'], ['F3', 'maj'], ['G3', 'maj'],
  ['C4', 'maj'], ['F3', 'maj'], ['G3', 'sus4'], ['C4', 'maj'],
];

export const FLOOR1_SONG = {
  bpm: 104,
  beatsPerBar: 4,
  gain: 0.82,
  fx: { delayBeats: 0.75, delayFb: 0.28, delayWet: 0.2 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 8 }],
  tracks: [
    { id: 'lead', instrument: 'kalimba', gain: 0.8, pan: -0.1, send: 0.3, patterns: { A: F1_MELODY_A, B: F1_MELODY_A } },
    { id: 'sparkle', instrument: 'musicbox', gain: 0.55, pan: 0.25, send: 0.4, patterns: { B: F1_SPARKLE_B } },
    { id: 'pad', instrument: 'warmpad', gain: 0.4, send: 0.35, patterns: {
      A: prog(F1_CHORDS, { beatsEach: 4, v: 0.45 }),
      B: prog(F1_CHORDS, { beatsEach: 4, v: 0.48 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.5, patterns: {
      A: seq('C3 . . . A2 . . . F2 . . . G2 . . . C3 . . . F2 . . . G2 . . . C3 . . .', { step: 1, d: 2.5, v: 0.6 }),
      B: seq('C3 . G3 . A2 . E3 . F2 . C3 . G2 . B2 . C3 . G3 . F2 . A2 . G2 . B2 . C3 . . .', { step: 1, d: 0.9, v: 0.62 }),
    } },
    { id: 'perc', instrument: 'perc', gain: 0.35, patterns: {
      A: every(4, 32, 'shk', { v: 0.35, t0: 2 }),
      B: [...every(4, 32, 'shk', { v: 0.38, t0: 2 }), ...every(2, 32, 'hat', { v: 0.3, t0: 1.5 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 2 — "The Tide Ledger" (A minor, 72). Harp calls, and every    */
/* answer is SHORTER than the call — lines that ebb away like the      */
/* harbor water. Low pad underneath like a held breath.                */
/* ------------------------------------------------------------------ */

const F2_HARP_A = [
  // Call: 6 notes falling. Answer: 4. Then 2. The tide going out.
  ...seq('A5 G5 E5 D5 C5 A4', { step: 1, v: 0.8 }),
  ...seq('G5 E5 D5 B4', { step: 1, t0: 8, v: 0.75 }),
  { n: 'E5', t: 13, d: 1.5, v: 0.7 }, { n: 'A4', t: 14.5, d: 1.5, v: 0.68 },
  ...seq('C6 A5 G5 E5 D5 C5', { step: 1, t0: 16, v: 0.8 }),
  ...seq('A5 G5 E5 C5', { step: 1, t0: 24, v: 0.73 }),
  { n: 'D5', t: 29, d: 1.2, v: 0.68 }, { n: 'A4', t: 30.5, d: 1.5, v: 0.7 },
];
const F2_RIPPLE_A = [
  ...arp(chord('A3', 'min'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 2, v: 0.35 }),
  ...arp(chord('F3', 'maj'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 2, v: 0.33, t0: 8 }),
  ...arp(chord('C4', 'maj'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 2, v: 0.35, t0: 16 }),
  ...arp(chord('E3', 'min'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 1, v: 0.33, t0: 24 }),
  ...arp(chord('A3', 'min'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 1, v: 0.32, t0: 28 }),
];

export const FLOOR2_SONG = {
  bpm: 72,
  beatsPerBar: 4,
  gain: 0.8,
  fx: { delayBeats: 1.5, delayFb: 0.35, delayWet: 0.3 },
  sections: [{ name: 'A', bars: 8 }],
  loop: 'A',
  tracks: [
    { id: 'lead', instrument: 'harp', gain: 0.75, pan: -0.1, send: 0.45, patterns: { A: F2_HARP_A } },
    { id: 'ripple', instrument: 'kalimba', gain: 0.4, pan: 0.3, send: 0.4, patterns: { A: F2_RIPPLE_A } },
    { id: 'pad', instrument: 'warmpad', gain: 0.48, send: 0.4, patterns: {
      A: prog([['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['E2', 'min']], { beatsEach: 8, v: 0.5 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.45, patterns: {
      A: seq('A2 . . . . . . . F2 . . . . . . . C3 . . . . . . . E2 . . . A2 . . .', { step: 1, d: 6, v: 0.55 }),
    } },
    { id: 'perc', instrument: 'perc', gain: 0.25, patterns: {
      A: every(8, 32, 'shk', { v: 0.3, t0: 6 }),
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 3 — "The Doubling Light" (G major, 112). Ocarina sings the    */
/* motif in QUARTER notes, then the same shape doubled into EIGHTHS —  */
/* multiplication as rhythm. Bells mark each doubling.                 */
/* ------------------------------------------------------------------ */

const F3_MOTIF_Q = [
  ...seq('B4 D5 G5 . D5 G5 B5 .', { step: 1, v: 0.8 }),
  ...seq('A5 G5 D5 B4', { step: 1, t0: 8, v: 0.75 }),
  { n: 'A4', t: 12, d: 2, v: 0.72 }, { n: 'D5', t: 14, d: 2, v: 0.75 },
];
const F3_MOTIF_8TH = [
  // the same rising shape, twice as fast, twice through — ×2
  ...seq('B4 D5 G5 . D5 G5 B5 .', { step: 0.5, v: 0.82 }),
  ...seq('B4 D5 G5 B5 G5 B5 D6 .', { step: 0.5, t0: 4, v: 0.85 }),
  ...seq('E5 D5 B4 D5 A5 G5 D5 G5', { step: 0.5, t0: 8, v: 0.8 }),
  { n: 'B5', t: 12, d: 1.5, v: 0.85 }, { n: 'A5', t: 13.5, d: 0.5, v: 0.75 },
  { n: 'G5', t: 14, d: 2, v: 0.85 },
];

export const FLOOR3_SONG = {
  bpm: 112,
  beatsPerBar: 4,
  gain: 0.82,
  fx: { delayBeats: 0.5, delayFb: 0.3, delayWet: 0.24 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'lead', instrument: 'ocarina', gain: 0.72, send: 0.4, patterns: { A: F3_MOTIF_Q, B: F3_MOTIF_8TH } },
    { id: 'bells', instrument: 'bell', gain: 0.45, pan: 0.3, send: 0.5, patterns: {
      A: [{ n: 'G5', t: 0, d: 1, v: 0.4 }, { n: 'G6', t: 8, d: 1, v: 0.38 }],
      B: [{ n: 'D6', t: 0, d: 1, v: 0.4 }, { n: 'G6', t: 14, d: 2, v: 0.42 }],
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.42, send: 0.35, patterns: {
      A: prog([['G3', 'maj'], ['C4', 'maj'], ['E3', 'min'], ['D3', 'maj']], { beatsEach: 4, v: 0.45 }),
      B: prog([['G3', 'maj'], ['B3', 'min'], ['C4', 'maj'], ['D3', 'sus4']], { beatsEach: 4, v: 0.45 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.5, patterns: {
      A: seq('G2 . D3 . C3 . G2 . E2 . B2 . D3 . D2 .', { step: 1, d: 1.6, v: 0.6 }),
      B: seq('G2 G2 D3 D3 B2 B2 C3 C3 E2 E2 C3 C3 D3 D3 G2 .', { step: 1, d: 0.8, v: 0.62 }),
    } },
    { id: 'perc', instrument: 'perc', gain: 0.4, patterns: {
      A: every(2, 16, 'shk', { v: 0.35, t0: 1 }),
      B: [...every(1, 16, 'hat', { v: 0.32, t0: 0.5 }), ...every(2, 16, 'shk', { v: 0.38, t0: 1 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 4 — "Emberworks" (D minor, 96). A low forge riff stated in    */
/* WHOLE (8 beats), then HALVED (4), then QUARTERED (2) — division     */
/* hammered out on toms.                                               */
/* ------------------------------------------------------------------ */

const F4_RIFF = [
  // whole (8 beats)
  ...seq('D3 F3 A3 D4 C4 A3 F3 E3', { step: 1, v: 0.8 }),
  // half (4 beats): same shape at double speed
  ...seq('D3 F3 A3 D4 C4 A3 F3 E3', { step: 0.5, t0: 8, v: 0.82 }),
  // quarter (2 beats), twice
  ...seq('D4 C4 A3 F3', { step: 0.5, t0: 12, v: 0.85 }),
  { n: 'D3', t: 14, d: 2, v: 0.85 },
];
const F4_EMBER_B = [
  ...seq('A4 . F4 . G4 A4 F4 .', { step: 0.5, v: 0.7 }),
  ...seq('G4 . E4 . F4 G4 E4 .', { step: 0.5, t0: 4, v: 0.68 }),
  ...seq('A4 C5 D5 C5 A4 G4 F4 G4', { step: 0.5, t0: 8, v: 0.72 }),
  { n: 'A4', t: 12, d: 1.5, v: 0.72 }, { n: 'F4', t: 13.5, d: 0.5, v: 0.65 },
  { n: 'D4', t: 14, d: 2, v: 0.72 },
];
const F4_TOMS = (beats) => [
  ...every(2, beats, 'tom', { v: 0.5 }),
  ...every(4, beats, 'kick', { v: 0.55, t0: 1 }),
  ...every(2, beats, 'hat', { v: 0.25, t0: 1.5 }),
];

export const FLOOR4_SONG = {
  bpm: 96,
  beatsPerBar: 4,
  gain: 0.82,
  fx: { delayBeats: 0.75, delayFb: 0.25, delayWet: 0.18 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'riff', instrument: 'pluck', gain: 0.7, send: 0.2, patterns: { A: F4_RIFF, B: F4_RIFF } },
    { id: 'glow', instrument: 'ocarina', gain: 0.5, pan: 0.2, send: 0.4, patterns: { B: F4_EMBER_B } },
    { id: 'pad', instrument: 'warmpad', gain: 0.38, send: 0.3, patterns: {
      A: prog([['D3', 'min'], ['D3', 'min'], ['C3', 'maj'], ['D3', 'min']], { beatsEach: 4, v: 0.42 }),
      B: prog([['D3', 'min'], ['F3', 'maj'], ['C3', 'maj'], ['D3', 'min']], { beatsEach: 4, v: 0.42 }),
    } },
    { id: 'toms', instrument: 'perc', gain: 0.55, patterns: { A: F4_TOMS(16), B: F4_TOMS(16) } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 5 — "Four Keys of Thaw" (F major, 66). Music box in the cold: */
/* four little melodic keys, one per wing, each a different fragment   */
/* — and the pad slowly warms under them. Sparse and glittering.       */
/* ------------------------------------------------------------------ */

const F5_BOX_A = [
  // key of sums (rising)
  ...seq('F5 A5 C6~ .', { step: 0.5, v: 0.7 }),
  // key of tides (falling)
  ...seq('D6 C6 A5 F5', { step: 0.5, t0: 8, v: 0.66 }),
  // key of doubling (echoed twice, faster)
  ...seq('G5 A5 C6 .', { step: 0.5, t0: 16, v: 0.68 }),
  ...seq('G5 A5 C6 .', { step: 0.25, t0: 18.5, v: 0.6 }),
  // key of halves (long then short)
  { n: 'A5', t: 24, d: 2, v: 0.7 }, { n: 'G5', t: 26, d: 1, v: 0.62 },
  { n: 'F5', t: 27.5, d: 0.5, v: 0.55 }, { n: 'C5', t: 28, d: 3.5, v: 0.68 },
];
const F5_GLINTS = [
  { n: 'C7', t: 5.5, d: 0.5, v: 0.3 }, { n: 'A6', t: 13, d: 0.5, v: 0.28 },
  { n: 'F6', t: 21.5, d: 0.5, v: 0.3 }, { n: 'C7', t: 30, d: 1, v: 0.32 },
];

export const FLOOR5_SONG = {
  bpm: 66,
  beatsPerBar: 4,
  gain: 0.78,
  fx: { delayBeats: 1.5, delayFb: 0.4, delayWet: 0.32 },
  sections: [{ name: 'A', bars: 8 }],
  loop: 'A',
  tracks: [
    { id: 'box', instrument: 'musicbox', gain: 0.75, send: 0.5, patterns: { A: F5_BOX_A } },
    { id: 'glint', instrument: 'bell', gain: 0.4, pan: -0.3, send: 0.55, patterns: { A: F5_GLINTS } },
    { id: 'pad', instrument: 'warmpad', gain: 0.5, send: 0.4, patterns: {
      A: prog([['F3', 'maj'], ['D3', 'min'], ['A2', 'min'], ['C3', 'sus4']], { beatsEach: 8, v: 0.5 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.4, patterns: {
      A: seq('F2 . . . . . . . D2 . . . . . . . A2 . . . . . . . C3 . . . . . . .', { step: 1, d: 7, v: 0.5 }),
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 6 — "The Shape of Light" (E minor, 84). Kalimba turns         */
/* THREE-note cells against the 4/4 grid — triangles rotating inside   */
/* a square — while bells strike on the true corners.                  */
/* ------------------------------------------------------------------ */

const F6_FACETS_A = [
  // 3-note cell over 4/4: realigns every 3 bars, like a turning facet
  ...arp(['E4', 'G4', 'B4'], { pattern: [0, 1, 2], step: 0.5, bars: 3, v: 0.6 }),
  ...arp(['C4', 'E4', 'G4'], { pattern: [0, 1, 2], step: 0.5, bars: 3, v: 0.58, t0: 12 }),
  ...arp(['A3', 'C4', 'E4'], { pattern: [0, 1, 2], step: 0.5, bars: 1, v: 0.56, t0: 24 }),
  ...arp(['B3', 'D4', 'F#4'], { pattern: [0, 1, 2], step: 0.5, bars: 1, v: 0.58, t0: 28 }),
];
const F6_LEAD_B = [
  ...seq('B4 E5 G5 . F#5 E5 B4 .', { step: 0.5, v: 0.72 }),
  ...seq('G5 A5 B5 . A5 G5 E5 .', { step: 0.5, t0: 4, v: 0.74 }),
  ...seq('C5 E5 A5 G5 F#5 E5 D5 B4', { step: 0.5, t0: 8, v: 0.72 }),
  { n: 'B4', t: 12, d: 1.5, v: 0.7 }, { n: 'D5', t: 13.5, d: 0.5, v: 0.65 },
  { n: 'E5', t: 14, d: 2, v: 0.75 },
];
const F6_CORNERS = (beats) => every(4, beats, 'hatO', { v: 0.3 });

export const FLOOR6_SONG = {
  bpm: 84,
  beatsPerBar: 4,
  gain: 0.8,
  fx: { delayBeats: 0.75, delayFb: 0.35, delayWet: 0.28 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'facets', instrument: 'kalimba', gain: 0.68, pan: -0.15, send: 0.4, patterns: {
      A: F6_FACETS_A,
      B: arp(['E4', 'G4', 'B4'], { pattern: [0, 1, 2], step: 0.5, bars: 4, v: 0.5 }),
    } },
    { id: 'lead', instrument: 'bell', gain: 0.5, pan: 0.2, send: 0.5, patterns: {
      A: [{ n: 'E6', t: 0, d: 2, v: 0.35 }, { n: 'B5', t: 12, d: 2, v: 0.33 }, { n: 'G5', t: 24, d: 2, v: 0.35 }],
      B: F6_LEAD_B,
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.45, send: 0.4, patterns: {
      A: prog([['E3', 'min'], ['C3', 'maj'], ['A2', 'min'], ['B2', 'min']], { beatsEach: 8, v: 0.48 }),
      B: prog([['E3', 'min'], ['G3', 'maj'], ['C3', 'maj'], ['B2', 'maj']], { beatsEach: 4, v: 0.48 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.45, patterns: {
      A: seq('E2 . . . . . B2 . C3 . . . . . G2 . A2 . . . . . E2 . B2 . . . . . B2 .', { step: 1, d: 4, v: 0.55 }),
      B: seq('E2 . B2 . G2 . C3 . C3 . G2 . B2 . E2 .', { step: 1, d: 1.6, v: 0.55 }),
    } },
    { id: 'corners', instrument: 'perc', gain: 0.3, patterns: { A: F6_CORNERS(32), B: F6_CORNERS(16) } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 7 — "Penny Lanes" (C major, 120). Market bustle: oom-pah      */
/* bass, staccato pluck stalls, and coins counted out on the offbeat   */
/* music box. The B section is the barker's pitch.                     */
/* ------------------------------------------------------------------ */

const F7_STALLS_A = [
  ...seq('E5 E5 G5 . C5 C5 E5 .', { step: 0.5, v: 0.72 }),
  ...seq('D5 D5 F5 . B4 B4 D5 .', { step: 0.5, t0: 4, v: 0.7 }),
  ...seq('E5 E5 G5 . A5 G5 E5 C5', { step: 0.5, t0: 8, v: 0.74 }),
  ...seq('D5 E5 F5 D5 C5~ .', { step: 0.5, t0: 12, v: 0.72 }),
];
const F7_BARKER_B = [
  ...seq('G5 . E5 G5 C6 . G5 .', { step: 0.5, v: 0.8 }),
  ...seq('A5 . F5 A5 D6 . A5 .', { step: 0.5, t0: 4, v: 0.78 }),
  ...seq('G5 A5 B5 C6 D6 C6 B5 G5', { step: 0.5, t0: 8, v: 0.8 }),
  { n: 'A5', t: 12, d: 1, v: 0.78 }, { n: 'B5', t: 13, d: 1, v: 0.8 },
  { n: 'C6', t: 14, d: 2, v: 0.85 },
];
const F7_COINS = [
  { n: 'C6', t: 1.5, d: 0.25, v: 0.4 }, { n: 'E6', t: 3.5, d: 0.25, v: 0.38 },
  { n: 'G6', t: 5.5, d: 0.25, v: 0.4 }, { n: 'C6', t: 7.5, d: 0.25, v: 0.38 },
  { n: 'D6', t: 9.5, d: 0.25, v: 0.4 }, { n: 'F6', t: 11.5, d: 0.25, v: 0.38 },
  { n: 'E6', t: 13.5, d: 0.25, v: 0.4 }, { n: 'C6', t: 15.5, d: 0.25, v: 0.42 },
];
const F7_OOMPAH = seq('C3 G3 E3 G3 F2 C3 G2 D3 C3 G3 E3 G3 G2 D3 C3 G3', { step: 1, d: 0.5, v: 0.62 });

export const FLOOR7_SONG = {
  bpm: 120,
  beatsPerBar: 4,
  gain: 0.82,
  fx: { delayBeats: 0.5, delayFb: 0.2, delayWet: 0.14 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'stalls', instrument: 'pluck', gain: 0.68, send: 0.2, patterns: { A: F7_STALLS_A, B: F7_BARKER_B } },
    { id: 'coins', instrument: 'musicbox', gain: 0.5, pan: 0.3, send: 0.35, patterns: { A: F7_COINS, B: F7_COINS } },
    { id: 'oompah', instrument: 'softbass', gain: 0.6, patterns: { A: F7_OOMPAH, B: F7_OOMPAH } },
    { id: 'pad', instrument: 'warmpad', gain: 0.28, send: 0.3, patterns: {
      B: prog([['C4', 'maj'], ['F3', 'maj'], ['G3', 'maj'], ['C4', 'maj']], { beatsEach: 4, v: 0.4 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.45, patterns: {
      A: [...every(1, 16, 'hat', { v: 0.3, t0: 0.5 }), ...every(4, 16, 'shk', { v: 0.42, t0: 2 })],
      B: [...every(1, 16, 'hat', { v: 0.32, t0: 0.5 }), ...every(2, 16, 'shk', { v: 0.4, t0: 1 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 8 — "The Quiet Stacks" (A minor, 58). A slow harp in a tall   */
/* room: a WHOLE phrase, answered by its HALF, answered by its         */
/* QUARTER — fractions of the same sentence, fading like an echo.      */
/* ------------------------------------------------------------------ */

const F8_WHOLE = [
  { n: 'A4', t: 0, d: 2, v: 0.72 }, { n: 'C5', t: 2, d: 2, v: 0.74 },
  { n: 'E5', t: 4, d: 2, v: 0.76 }, { n: 'D5', t: 6, d: 1, v: 0.7 }, { n: 'C5', t: 7, d: 1, v: 0.68 },
  { n: 'B4', t: 8, d: 3, v: 0.7 }, { n: 'G4', t: 11, d: 1, v: 0.62 },
  { n: 'A4', t: 12, d: 4, v: 0.72 },
  // half: same contour, half the length, softer
  { n: 'A4', t: 16, d: 1, v: 0.55 }, { n: 'C5', t: 17, d: 1, v: 0.56 },
  { n: 'E5', t: 18, d: 1, v: 0.58 }, { n: 'D5', t: 19, d: 0.5, v: 0.52 }, { n: 'C5', t: 19.5, d: 0.5, v: 0.5 },
  { n: 'B4', t: 20, d: 1.5, v: 0.52 }, { n: 'A4', t: 22, d: 2, v: 0.55 },
  // quarter: the last whisper
  ...seq('A4 C5 E5 D5', { step: 0.5, t0: 24, v: 0.4 }),
  { n: 'A4', t: 26, d: 2, v: 0.42 },
  // page turn: a gentle upward question into the loop
  { n: 'E4', t: 29, d: 1, v: 0.5 }, { n: 'G4', t: 30, d: 2, v: 0.52 },
];
const F8_DUST = [
  { n: 'E6', t: 7.5, d: 1, v: 0.22 }, { n: 'C6', t: 15.5, d: 1, v: 0.2 },
  { n: 'A5', t: 23.5, d: 1, v: 0.22 }, { n: 'E6', t: 30.5, d: 1, v: 0.2 },
];

export const FLOOR8_SONG = {
  bpm: 58,
  beatsPerBar: 4,
  gain: 0.76,
  fx: { delayBeats: 2, delayFb: 0.42, delayWet: 0.35 },
  sections: [{ name: 'A', bars: 8 }],
  loop: 'A',
  tracks: [
    { id: 'harp', instrument: 'harp', gain: 0.78, send: 0.5, patterns: { A: F8_WHOLE } },
    { id: 'dust', instrument: 'musicbox', gain: 0.35, pan: 0.35, send: 0.55, patterns: { A: F8_DUST } },
    { id: 'pad', instrument: 'warmpad', gain: 0.45, send: 0.45, patterns: {
      A: prog([['A2', 'min'], ['F2', 'maj'], ['D3', 'min'], ['E3', 'min']], { beatsEach: 8, v: 0.45 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.35, patterns: {
      A: seq('A2 . . . . . . . F2 . . . . . . . D2 . . . . . . . E2 . . . . . . .', { step: 1, d: 7, v: 0.45 }),
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Floor 9 — "The Mending Room" (C major, 62). The finale hub: every   */
/* realm's fragment returns — the garden rise, the tide fall, the      */
/* doubled wing-beat, the halved echo — mended into one quiet tune     */
/* over a breathing pad. This is the game's heart, played slow.        */
/* ------------------------------------------------------------------ */

const F9_MENDED = [
  // garden rise (floor 1)
  { n: 'E5', t: 0, d: 1, v: 0.6 }, { n: 'G5', t: 1, d: 1, v: 0.62 }, { n: 'C6', t: 2, d: 3, v: 0.68 },
  // tide fall (floor 2)
  ...seq('A5 G5 E5 D5', { step: 1, t0: 6, v: 0.55 }),
  // doubling wing-beat (floor 3): stated, then twice as fast
  ...seq('G4 A4 C5 .', { step: 1, t0: 10, v: 0.55 }),
  ...seq('G4 A4 C5 .', { step: 0.5, t0: 14, v: 0.5 }),
  // the halves (floor 8): long, then its half
  { n: 'F5', t: 16, d: 2, v: 0.6 }, { n: 'E5', t: 18, d: 1, v: 0.55 }, { n: 'D5', t: 19, d: 1, v: 0.52 },
  { n: 'F5', t: 20, d: 1, v: 0.45 }, { n: 'E5', t: 21, d: 0.5, v: 0.42 }, { n: 'D5', t: 21.5, d: 0.5, v: 0.4 },
  // and the mend: the full meadow phrase, whole again
  { n: 'E5', t: 24, d: 1, v: 0.65 }, { n: 'G5', t: 25, d: 1, v: 0.68 },
  { n: 'C6', t: 26, d: 2, v: 0.72 }, { n: 'B5', t: 28, d: 1, v: 0.62 },
  { n: 'A5', t: 29, d: 1, v: 0.6 }, { n: 'C6', t: 30, d: 2, v: 0.7 },
];
const F9_UNDER = [
  ...arp(chord('C4', 'maj7'), { pattern: [0, 1, 2, 3, 2, 1], step: 1, bars: 2, v: 0.3 }),
  ...arp(chord('A3', 'min7'), { pattern: [0, 1, 2, 3, 2, 1], step: 1, bars: 2, v: 0.28, t0: 8 }),
  ...arp(chord('F3', 'maj7'), { pattern: [0, 1, 2, 3, 2, 1], step: 1, bars: 2, v: 0.3, t0: 16 }),
  ...arp(chord('G3', 'dom7'), { pattern: [0, 1, 2, 3, 2, 1], step: 1, bars: 1, v: 0.28, t0: 24 }),
  ...arp(chord('C4', 'maj'), { pattern: [0, 1, 2, 1], step: 1, bars: 1, v: 0.3, t0: 28 }),
];

export const FLOOR9_SONG = {
  bpm: 62,
  beatsPerBar: 4,
  gain: 0.78,
  fx: { delayBeats: 1.5, delayFb: 0.38, delayWet: 0.3 },
  sections: [{ name: 'A', bars: 8 }],
  loop: 'A',
  tracks: [
    { id: 'mended', instrument: 'musicbox', gain: 0.7, send: 0.45, patterns: { A: F9_MENDED } },
    { id: 'under', instrument: 'harp', gain: 0.5, pan: -0.2, send: 0.4, patterns: { A: F9_UNDER } },
    { id: 'pad', instrument: 'warmpad', gain: 0.52, send: 0.45, patterns: {
      A: prog([['C3', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['G2', 'sus4']], { beatsEach: 8, v: 0.5 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.38, patterns: {
      A: seq('C3 . . . . . . . A2 . . . . . . . F2 . . . . . . . G2 . . . . . . .', { step: 1, d: 7, v: 0.5 }),
    } },
  ],
};

export const FLOOR_SONGS = [
  FLOOR1_SONG, FLOOR2_SONG, FLOOR3_SONG, FLOOR4_SONG, FLOOR5_SONG,
  FLOOR6_SONG, FLOOR7_SONG, FLOOR8_SONG, FLOOR9_SONG,
];
