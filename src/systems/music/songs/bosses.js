/**
 * Nine boss scores — a unique piece per boss, matched to personality.
 *
 *  1 Briar King     — "Thorn Waltz": a garden waltz with teeth (3/4)
 *  2 The Pressure   — "Fathom King": deep-water dread, heartbeat toms
 *  3 Sky-Whale      — "Stormbreach": a chase through thunderheads
 *  4 Pyroclast      — "Magma Heart": hammering forge-metal riffing
 *  5 Absolute Zero  — "White Silence": an icy ostinato that finally moves
 *  6 The Prism      — "Shatterlight": facets turning 3-, then 5-against-4
 *  7 Counterfeiter  — "The Crooked Fair": circus music gone wrong
 *  8 The Paradox    — "Ink Eclipse": bells accelerating in a dark library
 *  9 The Theorem    — "Q.E.D.": five movements, dread to completion
 *
 * All in the same hand-built engine as the floor themes: composed note
 * data, no samples. Each keeps a kid-safe brightness under the menace.
 *
 * ── WHY THIS FILE WAS REWORKED ──────────────────────────────────────
 * The shipped set did not ESCALATE. Measured across the nine, the back
 * half was the *thinnest* music in the game: bosses 2, 5 and 8 were
 * single-section loops that repeated verbatim forever, boss 8 (the
 * penultimate fight) had one 8-bar idea, and the finale ran 12 bars —
 * shorter than the floor-1 waltz's 16. The last third of a game has to
 * be the biggest thing in it, so form now grows monotonically:
 *
 *     boss   1   2   3   4   5   6   7   8   9
 *     bars  16  16   8  12  16  12  12  24  18(+intro)
 *   sections 2   2   2   3   2   3   3   3   5
 *     tracks 6   6   6   6   7   7   7   8  10
 *
 * ── PER-PHASE INTENSITY ─────────────────────────────────────────────
 * Every score carries `layer: 2` and `layer: 3` tracks. They are SILENT
 * until the director is driven to that intensity (see
 * director.setSongIntensity), which BattleScene does the instant a boss
 * transforms. A phase change is therefore audible: the kit doubles, a
 * counter-line arrives, the score thickens under the same tune. Layer
 * tracks are written to sit *under* the core mix — escalation should
 * read as "more is happening", never as "it got louder".
 */

import { seq, prog, every, arp, chord } from '../theory.js';

/* ------------------------------------------------------------------ */
/* Boss 1 — "Thorn Waltz" (A minor, 3/4 at 141). The garden's own      */
/* dance, overgrown: oom-pah-pah bass, a pluck melody with thorn-prick */
/* accidentals, kalimba trills like snapping vines.                    */
/* Layers: a running bramble figure, then a crown of bells.            */
/* ------------------------------------------------------------------ */

const B1_WALTZ_A = [
  ...seq('A4 C5 E5', { step: 1, v: 0.85 }),
  ...seq('D#5 E5 C5', { step: 1, t0: 3, v: 0.82 }),
  ...seq('B4 D5 F5', { step: 1, t0: 6, v: 0.85 }),
  ...seq('E5 D5 B4', { step: 1, t0: 9, v: 0.8 }),
  ...seq('A4 C5 E5', { step: 1, t0: 12, v: 0.85 }),
  ...seq('F5 E5 D#5', { step: 1, t0: 15, v: 0.85 }),
  { n: 'E5', t: 18, d: 2, v: 0.88 }, { n: 'B4', t: 20, d: 1, v: 0.75 },
  { n: 'A4', t: 21, d: 3, v: 0.85 },
];
const B1_WALTZ_B = [
  ...seq('E5 A5 C6', { step: 1, v: 0.88 }),
  ...seq('B5 A5 E5', { step: 1, t0: 3, v: 0.85 }),
  ...seq('F5 A5 D6', { step: 1, t0: 6, v: 0.88 }),
  ...seq('C6 B5 G#5', { step: 1, t0: 9, v: 0.85 }),
  ...seq('A5 E5 C5', { step: 1, t0: 12, v: 0.85 }),
  ...seq('D5 F5 G#4', { step: 1, t0: 15, v: 0.82 }),
  { n: 'A4', t: 18, d: 3, v: 0.85 },
  ...seq('E5 D#5 E5', { step: 1, t0: 21, v: 0.82 }),
];
const B1_OOMPAH = (bars) => {
  const out = [];
  const roots = ['A2', 'A2', 'D3', 'E3', 'A2', 'D3', 'E3', 'A2'];
  for (let b = 0; b < bars; b++) {
    const r = roots[b % roots.length];
    out.push({ n: r, t: b * 3, d: 0.8, v: 0.75 });
    for (const n of chord(r === 'E3' ? 'E3' : r, r === 'A2' ? 'min' : 'maj')) {
      out.push({ n, t: b * 3 + 1, d: 0.4, v: 0.4 }, { n, t: b * 3 + 2, d: 0.4, v: 0.38 });
    }
  }
  return out;
};
const B1_TRILL = [
  ...seq('E6 F6 E6 F6 E6 .', { step: 0.25, t0: 10.5, v: 0.5 }),
  ...seq('B5 C6 B5 C6 B5 .', { step: 0.25, t0: 22.5, v: 0.48 }),
];
// LAYER 2 — the bramble. Once the King has grown, nothing rests: a
// continuous under-arpeggio fills every gap the waltz used to breathe in.
const B1_BRAMBLE = (notes) => arp(notes, { pattern: [0, 1, 2, 1], step: 0.5, bars: 8, beatsPerBar: 3, v: 0.4 });
// LAYER 3 — the crown itself, tolling on every bar's downbeat pair.
const B1_CROWN = [
  { n: 'A5', t: 0, d: 3, v: 0.5 }, { n: 'E5', t: 6, d: 3, v: 0.44 },
  { n: 'F5', t: 12, d: 3, v: 0.5 }, { n: 'E5', t: 18, d: 3, v: 0.46 },
];

export const BOSS1_SONG = {
  bpm: 141,
  beatsPerBar: 3,
  gain: 0.88,
  fx: { delayBeats: 0.75, delayFb: 0.25, delayWet: 0.18 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 8 }],
  tracks: [
    { id: 'waltz', instrument: 'pluck', gain: 0.78, send: 0.25, patterns: { A: B1_WALTZ_A, B: B1_WALTZ_B } },
    { id: 'thorns', instrument: 'kalimba', gain: 0.5, pan: 0.3, send: 0.35, patterns: { A: B1_TRILL, B: B1_TRILL } },
    { id: 'oompah', instrument: 'softbass', gain: 0.62, patterns: { A: B1_OOMPAH(8), B: B1_OOMPAH(8) } },
    { id: 'kit', instrument: 'perc', gain: 0.5, patterns: {
      A: [...every(3, 24, 'kick', { v: 0.7 }), ...every(3, 24, 'shk', { v: 0.4, t0: 1 }), ...every(3, 24, 'hat', { v: 0.35, t0: 2 })],
      B: [...every(3, 24, 'kick', { v: 0.7 }), ...every(1, 24, 'hat', { v: 0.3, t0: 0.5 }), ...every(3, 24, 'tom', { v: 0.45, t0: 2.5 })],
    } },
    { id: 'bramble', instrument: 'harp', layer: 2, gain: 0.34, pan: -0.25, send: 0.3, patterns: {
      A: B1_BRAMBLE(['A3', 'E4', 'C4']), B: B1_BRAMBLE(['E4', 'B4', 'G4']),
    } },
    { id: 'crown', instrument: 'bell', layer: 3, gain: 0.42, pan: 0.15, send: 0.5, patterns: { A: B1_CROWN, B: B1_CROWN } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 2 — "Fathom King" (D minor, 80). The deepest water: a slow     */
/* two-note heartbeat in the toms, pressure-swell pads, harp lines     */
/* that rise like bubbles and never reach the surface.                 */
/* The B section is the hull giving: the bass walks down past A to G#, */
/* the harp descends instead of rising, and the heartbeat doubles.     */
/* ------------------------------------------------------------------ */

const B2_BUBBLES = [
  ...seq('D4 F4 A4 D5', { step: 0.5, t0: 2, v: 0.6 }),
  { n: 'C5', t: 4.5, d: 1.5, v: 0.55 },
  ...seq('G4 A#4 D5 G5', { step: 0.5, t0: 10, v: 0.62 }),
  { n: 'F5', t: 12.5, d: 1.5, v: 0.55 },
  ...seq('D4 F4 A4 D5 F5 A5', { step: 0.5, t0: 18, v: 0.65 }),
  { n: 'G#5', t: 21, d: 2, v: 0.6 },
  { n: 'A5', t: 26, d: 1.5, v: 0.62 }, { n: 'E5', t: 27.5, d: 1, v: 0.55 },
  { n: 'D5', t: 29, d: 3, v: 0.6 },
];
// B — everything that rose now sinks. Same intervals, run backwards.
const B2_SINK_B = [
  ...seq('A5 F5 D5 A4', { step: 0.5, t0: 1, v: 0.62 }),
  { n: 'G#4', t: 3.5, d: 2, v: 0.58 },
  ...seq('G5 D5 A#4 G4', { step: 0.5, t0: 9, v: 0.62 }),
  { n: 'F4', t: 11.5, d: 2, v: 0.58 },
  ...seq('F5 D5 A4 F4 D4', { step: 0.5, t0: 17, v: 0.6 }),
  { n: 'C#4', t: 20, d: 3, v: 0.62 },
  { n: 'D4', t: 25, d: 2, v: 0.6 }, { n: 'A3', t: 27, d: 1, v: 0.55 },
  { n: 'D4', t: 28, d: 4, v: 0.62 },
];
const B2_DEPTH = [
  { n: 'D2', t: 0, d: 7, v: 0.7 }, { n: 'D2', t: 8, d: 7, v: 0.68 },
  { n: 'A#1', t: 16, d: 7, v: 0.7 }, { n: 'A1', t: 24, d: 7, v: 0.72 },
];
const B2_DEPTH_B = [
  { n: 'D2', t: 0, d: 7, v: 0.72 }, { n: 'C2', t: 8, d: 7, v: 0.7 },
  { n: 'A#1', t: 16, d: 7, v: 0.72 }, { n: 'G#1', t: 24, d: 4, v: 0.74 },
  { n: 'A1', t: 28, d: 4, v: 0.74 },
];
// LAYER 2 — the second heartbeat. Two hearts in the dark, not one.
const B2_SECOND_HEART = (beats) => [
  ...every(4, beats, 'tom', { v: 0.45, t0: 2 }),
  ...every(4, beats, 'kick', { v: 0.36, t0: 2.75 }),
];
// LAYER 3 — the hull. A held low fifth that never resolves.
const B2_HULL = [
  { n: 'D2', t: 0, d: 15, v: 0.4 }, { n: 'A2', t: 0, d: 15, v: 0.3 },
  { n: 'D2', t: 16, d: 15, v: 0.4 }, { n: 'G#2', t: 16, d: 15, v: 0.32 },
];

export const BOSS2_SONG = {
  bpm: 80,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 1.5, delayFb: 0.4, delayWet: 0.3 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 8 }],
  tracks: [
    { id: 'bubbles', instrument: 'harp', gain: 0.62, send: 0.5, patterns: { A: B2_BUBBLES, B: B2_SINK_B } },
    { id: 'pressure', instrument: 'warmpad', gain: 0.6, send: 0.45, patterns: {
      A: prog([['D3', 'min'], ['D3', 'min'], ['A#2', 'maj'], ['A2', 'five']], { beatsEach: 8, v: 0.55 }),
      B: prog([['D3', 'min'], ['C3', 'maj'], ['A#2', 'maj'], ['G#2', 'dim']], { beatsEach: 8, v: 0.55 }),
    } },
    { id: 'depth', instrument: 'softbass', gain: 0.6, patterns: { A: B2_DEPTH, B: B2_DEPTH_B } },
    { id: 'heartbeat', instrument: 'perc', gain: 0.65, patterns: {
      A: [
        ...every(4, 32, 'tom', { v: 0.75 }),
        ...every(4, 32, 'tom', { v: 0.5, t0: 0.75 }),
        ...every(8, 32, 'hatO', { v: 0.2, t0: 6 }),
      ],
      B: [
        ...every(4, 32, 'tom', { v: 0.8 }),
        ...every(4, 32, 'tom', { v: 0.55, t0: 0.75 }),
        ...every(8, 32, 'hatO', { v: 0.24, t0: 3 }),
      ],
    } },
    { id: 'secondheart', instrument: 'perc', layer: 2, gain: 0.4, patterns: {
      A: B2_SECOND_HEART(32), B: B2_SECOND_HEART(32),
    } },
    { id: 'hull', instrument: 'warmpad', layer: 3, gain: 0.36, pan: -0.2, send: 0.4, patterns: { A: B2_HULL, B: B2_HULL } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 3 — "Stormbreach" (E minor, 138). A chase above the clouds:    */
/* ocarina siren over a galloping bass, thunder on the kick, the       */
/* B section climbing like an updraft.                                 */
/* Layers: the whale answers itself an octave up, then the sky opens.  */
/* ------------------------------------------------------------------ */

const B3_SIREN_A = [
  { n: 'B4', t: 0, d: 2, v: 0.85 }, { n: 'E5', t: 2, d: 2, v: 0.88 },
  { n: 'D5', t: 4, d: 1, v: 0.8 }, { n: 'B4', t: 5, d: 1, v: 0.78 }, { n: 'G4', t: 6, d: 2, v: 0.8 },
  { n: 'A4', t: 8, d: 2, v: 0.82 }, { n: 'C5', t: 10, d: 2, v: 0.85 },
  { n: 'B4', t: 12, d: 3, v: 0.85 }, { n: 'E4', t: 15, d: 1, v: 0.7 },
];
const B3_SIREN_B = [
  ...seq('E5 F#5 G5 A5', { step: 0.5, v: 0.85 }),
  { n: 'B5', t: 2, d: 2, v: 0.9 },
  ...seq('A5 G5 F#5 E5', { step: 0.5, t0: 4, v: 0.82 }),
  { n: 'D#5', t: 6, d: 2, v: 0.85 },
  ...seq('E5 G5 B5 E6', { step: 0.5, t0: 8, v: 0.9 }),
  { n: 'D6', t: 10, d: 1.5, v: 0.85 }, { n: 'B5', t: 11.5, d: 0.5, v: 0.78 },
  { n: 'C6', t: 12, d: 2, v: 0.88 }, { n: 'B5', t: 14, d: 2, v: 0.85 },
];
const B3_GALLOP = (beats) => {
  const out = [];
  const roots = ['E2', 'E2', 'G2', 'G2', 'A2', 'A2', 'B2', 'B2'];
  for (let b = 0; b < beats / 2; b++) {
    const r = roots[b % roots.length];
    out.push({ n: r, t: b * 2, d: 0.4, v: 0.75 });
    out.push({ n: r, t: b * 2 + 0.75, d: 0.2, v: 0.5 });
    out.push({ n: r, t: b * 2 + 1, d: 0.4, v: 0.65 });
  }
  return out;
};
// LAYER 2 — the answering call, a bar behind and an octave up: the
// storm-song now has a second voice in it.
const B3_ANSWER_A = [
  { n: 'B5', t: 4, d: 1.5, v: 0.5 }, { n: 'E6', t: 6, d: 1.5, v: 0.52 },
  { n: 'D6', t: 10, d: 1, v: 0.48 }, { n: 'B5', t: 12, d: 3, v: 0.5 },
];
const B3_ANSWER_B = [
  { n: 'E6', t: 2, d: 1.5, v: 0.5 }, { n: 'B5', t: 6, d: 1.5, v: 0.48 },
  { n: 'E6', t: 10, d: 1, v: 0.5 }, { n: 'F#6', t: 12, d: 1, v: 0.5 },
  { n: 'E6', t: 14, d: 2, v: 0.52 },
];
// LAYER 3 — the sky breaks: rolling toms under everything.
const B3_ROLL = (beats) => [
  ...every(1, beats, 'tom', { v: 0.34, t0: 0.5 }),
  ...every(4, beats, 'hatO', { v: 0.3, t0: 3.5 }),
];

export const BOSS3_SONG = {
  bpm: 138,
  beatsPerBar: 4,
  gain: 0.9,
  fx: { delayBeats: 0.5, delayFb: 0.25, delayWet: 0.2 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'siren', instrument: 'ocarina', gain: 0.72, send: 0.4, patterns: { A: B3_SIREN_A, B: B3_SIREN_B } },
    { id: 'gallop', instrument: 'softbass', gain: 0.68, patterns: { A: B3_GALLOP(16), B: B3_GALLOP(16) } },
    { id: 'pad', instrument: 'warmpad', gain: 0.4, send: 0.35, patterns: {
      A: prog([['E3', 'min'], ['G3', 'maj'], ['A3', 'min'], ['B2', 'maj']], { beatsEach: 4, v: 0.45 }),
      B: prog([['E3', 'min'], ['B2', 'maj'], ['C3', 'maj'], ['B2', 'maj']], { beatsEach: 4, v: 0.45 }),
    } },
    { id: 'thunder', instrument: 'perc', gain: 0.6, patterns: {
      A: [...every(2, 16, 'kick', { v: 0.75 }), ...every(1, 16, 'hat', { v: 0.4, t0: 0.5 }), { n: 'tom', t: 15, d: 0.1, v: 0.7 }, { n: 'tom', t: 15.5, d: 0.1, v: 0.75 }],
      B: [...every(2, 16, 'kick', { v: 0.75 }), ...every(0.5, 16, 'hat', { v: 0.28, t0: 0.25 }), ...every(4, 16, 'tom', { v: 0.55, t0: 3.5 })],
    } },
    { id: 'answer', instrument: 'ocarina', layer: 2, gain: 0.4, pan: -0.3, send: 0.5, patterns: { A: B3_ANSWER_A, B: B3_ANSWER_B } },
    { id: 'skyroll', instrument: 'perc', layer: 3, gain: 0.4, patterns: { A: B3_ROLL(16), B: B3_ROLL(16) } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 4 — "Magma Heart" (D minor, 148). The forge at full roar:      */
/* a hammering low riff, double-time kicks, toms like collapsing       */
/* slag — the most aggressive score in the game, still in papercraft.  */
/* The new C section is the breath before the pour: the kit drops to   */
/* half time, the pad opens, and the hammer comes back twice as hard.  */
/* ------------------------------------------------------------------ */

const B4_HAMMER_A = [
  ...seq('D3 D3 F3 D3 G3 F3 D3 C3', { step: 0.5, v: 0.85 }),
  ...seq('D3 D3 F3 D3 G#3 G3 F3 D3', { step: 0.5, t0: 4, v: 0.87 }),
  ...seq('D3 D3 F3 D3 A3 G3 F3 E3', { step: 0.5, t0: 8, v: 0.85 }),
  ...seq('D3 C3 D3 F3 D3~ .', { step: 0.5, t0: 12, v: 0.88 }),
  { n: 'A2', t: 15, d: 1, v: 0.8 },
];
const B4_LAVA_B = [
  ...seq('D5 . C5 D5 F5 . D5 .', { step: 0.5, v: 0.82 }),
  ...seq('G5 . F5 G5 A5 . G5 .', { step: 0.5, t0: 4, v: 0.85 }),
  ...seq('A#4 C5 D5 F5 G5 F5 D5 C5', { step: 0.5, t0: 8, v: 0.82 }),
  { n: 'D5', t: 12, d: 1.5, v: 0.88 }, { n: 'C5', t: 13.5, d: 0.5, v: 0.75 },
  { n: 'D5', t: 14, d: 2, v: 0.88 },
];
// C — the pour. Whole-note hammer strikes, then the riff returns.
const B4_POUR_C = [
  { n: 'D3', t: 0, d: 2, v: 0.9 }, { n: 'D3', t: 2, d: 1, v: 0.7 },
  { n: 'A#2', t: 4, d: 2, v: 0.9 }, { n: 'A#2', t: 6, d: 1, v: 0.7 },
  { n: 'C3', t: 8, d: 2, v: 0.9 }, { n: 'C3', t: 10, d: 1, v: 0.72 },
  ...seq('D3 F3 G3 A3 A#3 A3 G3 F3', { step: 0.5, t0: 12, v: 0.9 }),
];
const B4_KIT = (beats) => [
  ...every(1, beats, 'kick', { v: 0.72 }),
  ...every(2, beats, 'tom', { v: 0.55, t0: 1.5 }),
  ...every(0.5, beats, 'hat', { v: 0.25, t0: 0.25 }),
  ...every(4, beats, 'hatO', { v: 0.4, t0: 3.5 }),
];
const B4_KIT_C = (beats) => [
  ...every(2, beats, 'kick', { v: 0.8 }),
  ...every(4, beats, 'tom', { v: 0.6, t0: 3 }),
  ...every(1, beats, 'hat', { v: 0.22, t0: 0.5 }),
];
// LAYER 2 — the bellows: a churning 16th under-riff that never stops.
const B4_BELLOWS = (t0 = 0) => {
  const out = [];
  const cycle = ['D2', 'D2', 'F2', 'D2'];
  for (let i = 0; i < 64; i++) {
    out.push({ n: cycle[i % cycle.length], t: t0 + i * 0.25, d: 0.2, v: i % 4 === 0 ? 0.42 : 0.26 });
  }
  return out;
};
// LAYER 3 — the core cracks: bells on the off-beats, the only bright
// thing in the caldera, so meltdown reads as awe rather than dread.
const B4_EMBERS = [
  { n: 'D6', t: 1.5, d: 1, v: 0.4 }, { n: 'F6', t: 5.5, d: 1, v: 0.42 },
  { n: 'A#5', t: 9.5, d: 1, v: 0.4 }, { n: 'D6', t: 13.5, d: 2, v: 0.44 },
];

export const BOSS4_SONG = {
  bpm: 148,
  beatsPerBar: 4,
  gain: 0.9,
  fx: { delayBeats: 0.5, delayFb: 0.2, delayWet: 0.12 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }, { name: 'C', bars: 4 }],
  tracks: [
    { id: 'hammer', instrument: 'pluck', gain: 0.8, patterns: { A: B4_HAMMER_A, B: B4_HAMMER_A, C: B4_POUR_C } },
    { id: 'lava', instrument: 'ocarina', gain: 0.55, pan: 0.15, send: 0.35, patterns: {
      B: B4_LAVA_B,
      C: [{ n: 'D5', t: 0, d: 4, v: 0.7 }, { n: 'F5', t: 4, d: 4, v: 0.72 }, { n: 'G5', t: 8, d: 3, v: 0.75 }, { n: 'A5', t: 11, d: 5, v: 0.8 }],
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.35, send: 0.25, patterns: {
      A: prog([['D3', 'five'], ['D3', 'five'], ['G3', 'five'], ['A2', 'five']], { beatsEach: 4, v: 0.45 }),
      B: prog([['D3', 'min'], ['G3', 'min'], ['A#2', 'maj'], ['D3', 'min']], { beatsEach: 4, v: 0.45 }),
      C: prog([['D3', 'min'], ['A#2', 'maj'], ['C3', 'maj'], ['D3', 'min']], { beatsEach: 4, v: 0.52 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.68, patterns: { A: B4_KIT(16), B: B4_KIT(16), C: B4_KIT_C(16) } },
    { id: 'bellows', instrument: 'softbass', layer: 2, gain: 0.3, pan: -0.2, patterns: {
      A: B4_BELLOWS(), B: B4_BELLOWS(), C: B4_BELLOWS(),
    } },
    { id: 'embers', instrument: 'bell', layer: 3, gain: 0.36, pan: 0.3, send: 0.5, patterns: {
      A: B4_EMBERS, B: B4_EMBERS, C: B4_EMBERS,
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 5 — "White Silence" (A minor, 100). Absolute Zero doesn't      */
/* rage — it waits. An unblinking music-box ostinato, bell strikes     */
/* like cracking ice, and a bass that steps down one cold degree at    */
/* a time.                                                            */
/*                                                                     */
/* The shipped piece was ONE 8-bar loop, which made the coldest boss   */
/* also the most forgettable. Section B is the moment the ice starts   */
/* moving: the ostinato transposes up a minor third to C, the bass     */
/* keeps walking down under it, and the two pull apart.                */
/* ------------------------------------------------------------------ */

const B5_OSTINATO = (bars, t0 = 0) => arp(['A4', 'E5', 'C5', 'E5'], { pattern: [0, 1, 2, 1], step: 0.5, bars, v: 0.55, t0 });
const B5_OSTINATO_B = (bars, t0 = 0) => arp(['C5', 'G5', 'D#5', 'G5'], { pattern: [0, 1, 2, 1], step: 0.5, bars, v: 0.58, t0 });
const B5_CRACKS = [
  { n: 'E6', t: 3.5, d: 1, v: 0.5 }, { n: 'B5', t: 11.5, d: 1, v: 0.48 },
  { n: 'G#5', t: 19.5, d: 1, v: 0.52 }, { n: 'E6', t: 27, d: 2, v: 0.55 },
  { n: 'D#6', t: 30, d: 2, v: 0.5 },
];
// B — the cracks come faster, and closer together each time.
const B5_CRACKS_B = [
  { n: 'G6', t: 1.5, d: 1, v: 0.5 }, { n: 'D#6', t: 7.5, d: 1, v: 0.5 },
  { n: 'C6', t: 12.5, d: 1, v: 0.52 }, { n: 'G6', t: 17, d: 1, v: 0.54 },
  { n: 'D#6', t: 21, d: 1, v: 0.54 }, { n: 'C6', t: 24.5, d: 1, v: 0.56 },
  { n: 'B5', t: 27, d: 1, v: 0.56 }, { n: 'A#5', t: 29, d: 3, v: 0.58 },
];
const B5_LEAD = [
  { n: 'E5', t: 0, d: 3, v: 0.6 }, { n: 'D5', t: 3, d: 1, v: 0.5 },
  { n: 'C5', t: 4, d: 3, v: 0.58 }, { n: 'B4', t: 7, d: 1, v: 0.5 },
  { n: 'A4', t: 8, d: 4, v: 0.6 },
  { n: 'G#4', t: 12, d: 4, v: 0.62 },
  { n: 'A4', t: 16, d: 2, v: 0.6 }, { n: 'C5', t: 18, d: 2, v: 0.6 },
  { n: 'E5', t: 20, d: 2, v: 0.62 }, { n: 'A5', t: 22, d: 2, v: 0.65 },
  { n: 'G#5', t: 24, d: 4, v: 0.62 },
  { n: 'E5', t: 28, d: 4, v: 0.6 },
];
const B5_LEAD_B = [
  { n: 'C6', t: 0, d: 4, v: 0.64 },
  { n: 'A#5', t: 4, d: 2, v: 0.6 }, { n: 'G5', t: 6, d: 2, v: 0.6 },
  { n: 'G#5', t: 8, d: 4, v: 0.64 },
  { n: 'G5', t: 12, d: 2, v: 0.62 }, { n: 'D#5', t: 14, d: 2, v: 0.6 },
  { n: 'F5', t: 16, d: 3, v: 0.62 }, { n: 'E5', t: 19, d: 1, v: 0.55 },
  { n: 'D#5', t: 20, d: 4, v: 0.64 },
  { n: 'C5', t: 24, d: 2, v: 0.6 }, { n: 'B4', t: 26, d: 2, v: 0.6 },
  { n: 'A4', t: 28, d: 4, v: 0.66 },
];
// LAYER 2 — the second music box, a half-beat behind and slightly
// detuned in register: the same clock, no longer keeping the same time.
const B5_ECHO = (bars, t0 = 0.25) => arp(['A5', 'E6', 'C6', 'E6'], { pattern: [0, 2, 1, 2], step: 0.5, bars, v: 0.3, t0 });
const B5_ECHO_B = (bars, t0 = 0.25) => arp(['C6', 'G6', 'D#6', 'G6'], { pattern: [0, 2, 1, 2], step: 0.5, bars, v: 0.32, t0 });
// LAYER 3 — TRUE ZERO. A subsonic drone and a slow tom, the only pulse
// left when everything else has frozen.
const B5_ZERO = [
  { n: 'A1', t: 0, d: 15, v: 0.55 }, { n: 'G#1', t: 16, d: 8, v: 0.55 },
  { n: 'A1', t: 24, d: 8, v: 0.58 },
];

export const BOSS5_SONG = {
  bpm: 100,
  beatsPerBar: 4,
  gain: 0.86,
  fx: { delayBeats: 1, delayFb: 0.38, delayWet: 0.28 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 8 }],
  tracks: [
    { id: 'ostinato', instrument: 'musicbox', gain: 0.6, pan: -0.2, send: 0.4, patterns: { A: B5_OSTINATO(8), B: B5_OSTINATO_B(8) } },
    { id: 'cracks', instrument: 'bell', gain: 0.5, pan: 0.3, send: 0.55, patterns: { A: B5_CRACKS, B: B5_CRACKS_B } },
    { id: 'lead', instrument: 'ocarina', gain: 0.5, send: 0.45, patterns: { A: B5_LEAD, B: B5_LEAD_B } },
    { id: 'bass', instrument: 'softbass', gain: 0.55, patterns: {
      A: seq('A2 . . . G2 . . . F2 . . . E2 . . . A2 . . . G#2 . . . A2 . . . E2 . . .', { step: 1, d: 3.5, v: 0.6 }),
      B: seq('C3 . . . B2 . . . A#2 . . . A2 . . . G#2 . . . G2 . . . F2 . . . E2 . . .', { step: 1, d: 3.5, v: 0.62 }),
    } },
    { id: 'pulse', instrument: 'perc', gain: 0.4, patterns: {
      A: [...every(2, 32, 'kick', { v: 0.45 }), ...every(4, 32, 'hatO', { v: 0.25, t0: 3 })],
      B: [...every(2, 32, 'kick', { v: 0.5 }), ...every(2, 32, 'hat', { v: 0.22, t0: 1 }), ...every(8, 32, 'hatO', { v: 0.28, t0: 7 })],
    } },
    { id: 'echo', instrument: 'musicbox', layer: 2, gain: 0.26, pan: 0.35, send: 0.6, patterns: { A: B5_ECHO(8), B: B5_ECHO_B(8) } },
    { id: 'zero', instrument: 'softbass', layer: 3, gain: 0.42, patterns: { A: B5_ZERO, B: B5_ZERO } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 6 — "Shatterlight" (E minor, 126). The Prism turns: kalimba    */
/* facets in 3-against-4, bell shards on the corners, and a chorus     */
/* that blooms wide before snapping back to a single point of light.   */
/*                                                                     */
/* New C section = TOTAL REFRACTION. The facet cycle grows from three  */
/* notes to five over the same 4/4 kit, so the pattern only lines up   */
/* every five bars — the aural equivalent of an image that will not    */
/* resolve. It is the single strangest bar of music in the game, which */
/* is exactly what the sixth boss should own.                          */
/* ------------------------------------------------------------------ */

const B6_FACETS = (bars, t0 = 0) => [
  ...arp(['E4', 'B4', 'G4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.6, t0 }),
  ...arp(['C4', 'G4', 'E4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.58, t0: t0 + (bars / 2) * 4 }),
];
// Five chord tones on a 0.5-beat grid = a 2.5-beat cycle against 4/4.
const B6_FIVE = (t0 = 0, notes = ['E4', 'G4', 'B4', 'E5', 'D#5']) => {
  const out = [];
  for (let i = 0; i < 32; i++) {
    out.push({ n: notes[i % notes.length], t: t0 + i * 0.5, d: 0.45, v: i % 5 === 0 ? 0.66 : 0.5 });
  }
  return out;
};
const B6_SHARDS_A = [
  { n: 'B5', t: 0, d: 1, v: 0.5 }, { n: 'F#5', t: 4, d: 1, v: 0.45 },
  { n: 'G5', t: 8, d: 1, v: 0.5 }, { n: 'D#5', t: 12, d: 1, v: 0.48 },
];
const B6_SHARDS_C = [
  { n: 'E6', t: 0, d: 1.5, v: 0.55 }, { n: 'G6', t: 2.5, d: 1, v: 0.5 },
  { n: 'B6', t: 5, d: 1, v: 0.52 }, { n: 'D#6', t: 7.5, d: 1, v: 0.5 },
  { n: 'C6', t: 10, d: 1, v: 0.52 }, { n: 'G6', t: 12.5, d: 1, v: 0.54 },
  { n: 'E6', t: 15, d: 1, v: 0.56 },
];
const B6_BLOOM_B = [
  ...seq('E5 G5 B5 E6', { step: 0.5, v: 0.78 }),
  { n: 'D#6', t: 2, d: 2, v: 0.8 },
  ...seq('C6 B5 G5 F#5', { step: 0.5, t0: 4, v: 0.75 }),
  { n: 'G5', t: 6, d: 2, v: 0.78 },
  ...seq('A5 B5 C6 D#6', { step: 0.5, t0: 8, v: 0.8 }),
  { n: 'E6', t: 10, d: 2, v: 0.85 },
  { n: 'B5', t: 12, d: 2, v: 0.78 }, { n: 'E5', t: 14, d: 2, v: 0.75 },
];
const B6_BLOOM_C = [
  { n: 'E5', t: 0, d: 4, v: 0.82 }, { n: 'G5', t: 4, d: 4, v: 0.84 },
  { n: 'B5', t: 8, d: 2, v: 0.86 }, { n: 'D#6', t: 10, d: 2, v: 0.86 },
  { n: 'E6', t: 12, d: 4, v: 0.9 },
];
// LAYER 2 — the mirrored facet, running the same cycle backwards.
const B6_MIRROR = (bars, t0 = 0.25) => [
  ...arp(['B4', 'G4', 'E4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.34, t0 }),
  ...arp(['G4', 'E4', 'C4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.34, t0: t0 + (bars / 2) * 4 }),
];
// LAYER 3 — every colour at once: a wide pad chord stack that only
// exists when the Prism has stopped hiding which facet it is.
const B6_ALLCOLOUR = [
  ...prog([['E4', 'min7'], ['C4', 'maj7'], ['A3', 'min7'], ['B3', 'sus4']], { beatsEach: 4, v: 0.34 }),
];

export const BOSS6_SONG = {
  bpm: 126,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 0.75, delayFb: 0.32, delayWet: 0.24 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }, { name: 'C', bars: 4 }],
  tracks: [
    { id: 'facets', instrument: 'kalimba', gain: 0.68, pan: -0.15, send: 0.35, patterns: { A: B6_FACETS(4), B: B6_FACETS(4), C: B6_FIVE() } },
    { id: 'shards', instrument: 'bell', gain: 0.52, pan: 0.25, send: 0.5, patterns: { A: B6_SHARDS_A, B: B6_SHARDS_A, C: B6_SHARDS_C } },
    { id: 'bloom', instrument: 'pluck', gain: 0.6, send: 0.3, patterns: { B: B6_BLOOM_B, C: B6_BLOOM_C } },
    { id: 'bass', instrument: 'softbass', gain: 0.58, patterns: {
      A: seq('E2 . E2 . C3 . C3 . E2 . E2 . B2 . B2 .', { step: 1, d: 0.9, v: 0.65 }),
      B: seq('E2 E3 C3 C3 A2 A2 B2 B2 E2 E3 C3 C3 B2 B2 E2 .', { step: 1, d: 0.8, v: 0.65 }),
      C: seq('E2 . . . C3 . . . A2 . . . B2 . . .', { step: 1, d: 3.6, v: 0.7 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.52, patterns: {
      A: [...every(2, 16, 'kick', { v: 0.65 }), ...every(1.5, 16, 'hat', { v: 0.35, t0: 0.5 })],
      B: [...every(2, 16, 'kick', { v: 0.68 }), ...every(1, 16, 'hat', { v: 0.35, t0: 0.5 }), ...every(4, 16, 'shk', { v: 0.4, t0: 2 })],
      C: [...every(1, 16, 'kick', { v: 0.62 }), ...every(0.5, 16, 'hat', { v: 0.26, t0: 0.25 }), ...every(2, 16, 'shk', { v: 0.42, t0: 1 })],
    } },
    { id: 'mirror', instrument: 'kalimba', layer: 2, gain: 0.3, pan: 0.4, send: 0.45, patterns: {
      A: B6_MIRROR(4), B: B6_MIRROR(4), C: B6_FIVE(0.25, ['B4', 'E5', 'G4', 'D#5', 'E4']),
    } },
    { id: 'allcolour', instrument: 'warmpad', layer: 3, gain: 0.34, send: 0.4, patterns: {
      A: B6_ALLCOLOUR, B: B6_ALLCOLOUR, C: B6_ALLCOLOUR,
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 7 — "The Crooked Fair" (A minor, 128). Circus music with a     */
/* forger's grin: the oom-pah keeps slipping onto WRONG notes, the     */
/* melody leers chromatically, and the shaker never quite lands where  */
/* an honest shaker would.                                            */
/*                                                                     */
/* New C section = THE MINT RUNS. The crooked bass finally gives up    */
/* pretending and slides down in whole steps while the kit goes to     */
/* 16ths — the fair packing up and running for it.                     */
/* ------------------------------------------------------------------ */

const B7_LEER_A = [
  ...seq('A4 B4 C5 C#5 D5 . C5 .', { step: 0.5, v: 0.8 }),
  ...seq('E5 D#5 D5 C#5 C5 . B4 .', { step: 0.5, t0: 4, v: 0.78 }),
  ...seq('A4 C5 E5 D#5 E5 G5 F#5 F5', { step: 0.5, t0: 8, v: 0.8 }),
  { n: 'E5', t: 12, d: 1.5, v: 0.82 }, { n: 'D#5', t: 13.5, d: 0.5, v: 0.7 },
  { n: 'E5', t: 14, d: 2, v: 0.82 },
];
const B7_LEER_B = [
  ...seq('A5 . G#5 A5 C6 . A5 .', { step: 0.5, v: 0.85 }),
  ...seq('B5 A#5 A5 G#5 G5 . E5 .', { step: 0.5, t0: 4, v: 0.8 }),
  ...seq('F5 E5 D#5 E5 A5 G#5 A5 C6', { step: 0.5, t0: 8, v: 0.82 }),
  { n: 'B5', t: 12, d: 1, v: 0.82 }, { n: 'D#5', t: 13, d: 1, v: 0.75 },
  { n: 'E5', t: 14, d: 2, v: 0.85 },
];
const B7_RUN_C = [
  ...seq('A5 G5 F5 E5 D5 C5 B4 A4', { step: 0.25, v: 0.84 }),
  ...seq('G4 A4 B4 C5 D5 E5 F5 G5', { step: 0.25, t0: 2, v: 0.82 }),
  ...seq('A5 G#5 G5 F#5 F5 E5 D#5 D5', { step: 0.25, t0: 4, v: 0.86 }),
  ...seq('C#5 C5 B4 A#4 A4 . . .', { step: 0.25, t0: 6, v: 0.84 }),
  ...seq('A4 C5 E5 A5 C6 A5 E5 C5', { step: 0.5, t0: 8, v: 0.86 }),
  { n: 'D#5', t: 12, d: 1, v: 0.8 }, { n: 'E5', t: 13, d: 1, v: 0.86 },
  { n: 'A5', t: 14, d: 2, v: 0.9 },
];
// Honest bars land A–E; crooked bars slip to D# — the counterfeit.
const B7_CROOKED_OOMPAH = seq(
  'A2 E3 A2 E3 A2 D#3 A2 E3 F2 C3 F2 C3 E2 D#3 E2 E3',
  { step: 1, d: 0.5, v: 0.68 },
);
// C — the pretence drops: straight whole steps down, no oom-pah at all.
const B7_RUNAWAY_BASS = seq(
  'A2 A2 G2 G2 F2 F2 E2 E2 D#2 D#2 D2 D2 C#2 C#2 E2 E3',
  { step: 1, d: 0.7, v: 0.74 },
);
// LAYER 2 — the barker's second calliope, a tritone out of tune with
// the first. Two fairs, both crooked, neither agreeing.
const B7_SECOND_CALLIOPE = [
  { n: 'D#6', t: 0.5, d: 0.5, v: 0.3 }, { n: 'A5', t: 2.5, d: 0.5, v: 0.28 },
  { n: 'D#6', t: 4.5, d: 0.5, v: 0.3 }, { n: 'G#5', t: 6.5, d: 0.5, v: 0.28 },
  { n: 'A#5', t: 8.5, d: 0.5, v: 0.3 }, { n: 'E6', t: 10.5, d: 0.5, v: 0.3 },
  { n: 'D#6', t: 12.5, d: 0.5, v: 0.32 }, { n: 'A5', t: 14.5, d: 1, v: 0.32 },
];
// LAYER 3 — the coin stampede: 16th shakers, the sound of a mint that
// cannot stop printing.
const B7_STAMPEDE = (beats) => [
  ...every(0.25, beats, 'shk', { v: 0.16, t0: 0.125 }),
  ...every(2, beats, 'tom', { v: 0.4, t0: 1.5 }),
];

export const BOSS7_SONG = {
  bpm: 128,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 0.5, delayFb: 0.22, delayWet: 0.16 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }, { name: 'C', bars: 4 }],
  tracks: [
    { id: 'leer', instrument: 'pluck', gain: 0.72, send: 0.25, patterns: { A: B7_LEER_A, B: B7_LEER_B, C: B7_RUN_C } },
    { id: 'calliope', instrument: 'musicbox', gain: 0.45, pan: 0.3, send: 0.35, patterns: {
      A: [{ n: 'E6', t: 1.5, d: 0.5, v: 0.42 }, { n: 'C6', t: 5.5, d: 0.5, v: 0.4 }, { n: 'D#6', t: 9.5, d: 0.5, v: 0.44 }, { n: 'E6', t: 13.5, d: 0.5, v: 0.42 }],
      B: [{ n: 'A6', t: 3.5, d: 0.5, v: 0.42 }, { n: 'G#6', t: 7.5, d: 0.5, v: 0.42 }, { n: 'E6', t: 11.5, d: 0.5, v: 0.4 }, { n: 'B6', t: 15, d: 1, v: 0.44 }],
      C: [{ n: 'A6', t: 0, d: 1, v: 0.46 }, { n: 'E6', t: 4, d: 1, v: 0.44 }, { n: 'C6', t: 8, d: 1, v: 0.44 }, { n: 'A6', t: 12, d: 2, v: 0.48 }],
    } },
    { id: 'oompah', instrument: 'softbass', gain: 0.62, patterns: { A: B7_CROOKED_OOMPAH, B: B7_CROOKED_OOMPAH, C: B7_RUNAWAY_BASS } },
    { id: 'kit', instrument: 'perc', gain: 0.5, patterns: {
      A: [...every(2, 16, 'kick', { v: 0.65 }), ...every(2, 16, 'shk', { v: 0.42, t0: 1.25 }), ...every(4, 16, 'hatO', { v: 0.3, t0: 3.5 })],
      B: [...every(2, 16, 'kick', { v: 0.68 }), ...every(1, 16, 'hat', { v: 0.3, t0: 0.75 }), ...every(4, 16, 'tom', { v: 0.4, t0: 3 })],
      C: [...every(1, 16, 'kick', { v: 0.7 }), ...every(0.5, 16, 'hat', { v: 0.24, t0: 0.25 }), ...every(4, 16, 'hatO', { v: 0.34, t0: 3.5 })],
    } },
    { id: 'secondfair', instrument: 'musicbox', layer: 2, gain: 0.28, pan: -0.35, send: 0.4, patterns: {
      A: B7_SECOND_CALLIOPE, B: B7_SECOND_CALLIOPE, C: B7_SECOND_CALLIOPE,
    } },
    { id: 'stampede', instrument: 'perc', layer: 3, gain: 0.4, patterns: {
      A: B7_STAMPEDE(16), B: B7_STAMPEDE(16), C: B7_STAMPEDE(16),
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 8 — "Ink Eclipse" (D minor, 66). The Paradox blots out the     */
/* library's light: deep bell tolls, a harp spelling slow half-step    */
/* dread, clusters in the pad like spilled ink spreading — the         */
/* quietest boss score, and the heaviest.                             */
/*                                                                     */
/* The shipped piece was one 8-bar loop at the SECOND-TO-LAST fight:   */
/* the point in the game where the music should be at its most         */
/* enormous, it was at its smallest. It is now a three-section arc     */
/* built on one idea — ACCELERATION. The bell tolls once every eight   */
/* beats in A, once every four in B, once every two in C, while the    */
/* harp's half-step dread turns into a full chromatic cascade. Nothing */
/* gets louder; time itself closes in, which is what a paradox should  */
/* sound like.                                                        */
/* ------------------------------------------------------------------ */

const B8_TOLL = [
  { n: 'D4', t: 0, d: 4, v: 0.6 }, { n: 'C#4', t: 8, d: 4, v: 0.58 },
  { n: 'D4', t: 16, d: 4, v: 0.6 }, { n: 'G#3', t: 24, d: 4, v: 0.62 },
];
const B8_TOLL_B = [
  { n: 'D4', t: 0, d: 3, v: 0.6 }, { n: 'E4', t: 4, d: 3, v: 0.56 },
  { n: 'C#4', t: 8, d: 3, v: 0.6 }, { n: 'D4', t: 12, d: 3, v: 0.58 },
  { n: 'A#3', t: 16, d: 3, v: 0.62 }, { n: 'A3', t: 20, d: 3, v: 0.6 },
  { n: 'G#3', t: 24, d: 3, v: 0.64 }, { n: 'A3', t: 28, d: 3, v: 0.62 },
];
const B8_TOLL_C = (() => {
  // Every two beats — sixteen tolls, walking the chromatic line down
  // and then back to D. The last page turns fast.
  const line = ['D4', 'C#4', 'C4', 'B3', 'A#3', 'A3', 'G#3', 'G3',
    'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D4'];
  return line.map((n, i) => ({ n, t: i * 2, d: 1.8, v: 0.5 + (i % 4 === 0 ? 0.12 : 0) }));
})();
const B8_SPELL = [
  ...seq('D5 C#5 D5 E5 F5 E5 D5 C#5', { step: 1, v: 0.55 }),
  { n: 'D5', t: 8, d: 2, v: 0.55 }, { n: 'A4', t: 10, d: 2, v: 0.5 },
  { n: 'A#4', t: 12, d: 2, v: 0.55 }, { n: 'G#4', t: 14, d: 2, v: 0.52 },
  ...seq('A4 A#4 A4 G4 F4 G4 A4 A#4', { step: 1, t0: 16, v: 0.55 }),
  { n: 'A4', t: 24, d: 3, v: 0.55 }, { n: 'C#5', t: 27, d: 1, v: 0.5 },
  { n: 'D5', t: 28, d: 4, v: 0.58 },
];
const B8_SPELL_B = [
  ...seq('D5 E5 F5 G5 F5 E5 D5 C#5', { step: 0.5, v: 0.56 }),
  ...seq('D5 F5 A5 F5 D5 C#5 D5 .', { step: 0.5, t0: 4, v: 0.56 }),
  ...seq('A#4 C5 D5 F5 D5 C5 A#4 A4', { step: 0.5, t0: 8, v: 0.58 }),
  ...seq('G#4 A#4 C#5 A#4 G#4 G4 G#4 .', { step: 0.5, t0: 12, v: 0.56 }),
  ...seq('A4 C5 E5 A5 G5 F5 E5 D5', { step: 0.5, t0: 16, v: 0.6 }),
  ...seq('C#5 E5 A5 C#6 A5 E5 C#5 .', { step: 0.5, t0: 20, v: 0.6 }),
  { n: 'D5', t: 24, d: 4, v: 0.62 }, { n: 'A4', t: 28, d: 2, v: 0.56 },
  { n: 'C#5', t: 30, d: 2, v: 0.58 },
];
// C — the cascade. Chromatic runs falling faster than the tolls, so the
// page is being read out from under you.
const B8_CASCADE_C = (() => {
  const out = [];
  const runs = [
    ['D6', 'C#6', 'C6', 'B5', 'A#5', 'A5', 'G#5', 'G5'],
    ['A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5'],
    ['F5', 'E5', 'D#5', 'D5', 'C#5', 'C5', 'B4', 'A#4'],
    ['D5', 'E5', 'F5', 'G5', 'A5', 'A#5', 'C#6', 'D6'],
  ];
  runs.forEach((run, r) => {
    run.forEach((n, i) => out.push({ n, t: r * 8 + i * 0.5, d: 0.45, v: 0.5 + r * 0.03 }));
  });
  out.push({ n: 'D6', t: 28, d: 4, v: 0.66 });
  return out;
})();
// LAYER 2 — the margin notes: a second harp answering in the gaps, one
// octave down, always a half-step out.
const B8_MARGIN = [
  { n: 'C#4', t: 2, d: 2, v: 0.34 }, { n: 'D4', t: 6, d: 2, v: 0.32 },
  { n: 'A#3', t: 10, d: 2, v: 0.34 }, { n: 'A3', t: 14, d: 2, v: 0.32 },
  { n: 'G#3', t: 18, d: 2, v: 0.36 }, { n: 'A3', t: 22, d: 2, v: 0.34 },
  { n: 'C#4', t: 26, d: 2, v: 0.36 }, { n: 'D4', t: 30, d: 2, v: 0.34 },
];
// LAYER 3 — the eclipse itself: the lowest note in the whole game,
// held. Not a scare — a weight.
const B8_ECLIPSE = [
  { n: 'D1', t: 0, d: 15, v: 0.5 }, { n: 'A1', t: 0, d: 15, v: 0.3 },
  { n: 'G#1', t: 16, d: 8, v: 0.5 }, { n: 'D1', t: 24, d: 8, v: 0.52 },
];

export const BOSS8_SONG = {
  bpm: 66,
  beatsPerBar: 4,
  gain: 0.86,
  fx: { delayBeats: 2, delayFb: 0.45, delayWet: 0.32 },
  sections: [{ name: 'A', bars: 8 }, { name: 'B', bars: 8 }, { name: 'C', bars: 8 }],
  tracks: [
    { id: 'toll', instrument: 'bell', gain: 0.6, send: 0.5, patterns: { A: B8_TOLL, B: B8_TOLL_B, C: B8_TOLL_C } },
    { id: 'spell', instrument: 'harp', gain: 0.6, pan: -0.15, send: 0.45, patterns: { A: B8_SPELL, B: B8_SPELL_B, C: B8_CASCADE_C } },
    { id: 'ink', instrument: 'warmpad', gain: 0.55, send: 0.45, patterns: {
      // minor clusters: the added 2nd smudges each chord like wet ink
      A: [
        ...prog([['D3', 'min'], ['C#3', 'dim'], ['D3', 'min'], ['G#2', 'dim']], { beatsEach: 8, v: 0.5 }),
        { n: 'E3', t: 0, d: 8, v: 0.3 }, { n: 'D3', t: 8, d: 8, v: 0.3 },
        { n: 'E3', t: 16, d: 8, v: 0.3 }, { n: 'A2', t: 24, d: 8, v: 0.3 },
      ],
      B: [
        ...prog([['D3', 'min'], ['A#2', 'maj'], ['G#2', 'dim'], ['A2', 'maj']], { beatsEach: 8, v: 0.5 }),
        { n: 'E3', t: 0, d: 8, v: 0.28 }, { n: 'C3', t: 8, d: 8, v: 0.28 },
        { n: 'A3', t: 16, d: 8, v: 0.3 }, { n: 'B2', t: 24, d: 8, v: 0.3 },
      ],
      C: [
        ...prog([['D3', 'min'], ['C3', 'min'], ['A#2', 'maj'], ['A2', 'maj']], { beatsEach: 8, v: 0.52 }),
        { n: 'E3', t: 0, d: 16, v: 0.26 }, { n: 'A3', t: 16, d: 16, v: 0.28 },
      ],
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.55, patterns: {
      A: seq('D2 . . . . . . . C#2 . . . . . . . D2 . . . . . . . G#1 . . . A1 . . .', { step: 1, d: 6, v: 0.6 }),
      B: seq('D2 . . . A#1 . . . C#2 . . . A1 . . . D2 . . . G#1 . . . A1 . . . A1 . . .', { step: 1, d: 3.6, v: 0.62 }),
      C: seq('D2 . D2 . C2 . C2 . A#1 . A#1 . A1 . A1 . G#1 . G#1 . A1 . A1 . A#1 . C2 . C#2 . D2 .', { step: 1, d: 1.8, v: 0.66 }),
    } },
    { id: 'drip', instrument: 'perc', gain: 0.4, patterns: {
      A: [...every(8, 32, 'tom', { v: 0.5, t0: 4 }), ...every(8, 32, 'hatO', { v: 0.18, t0: 7 })],
      B: [...every(4, 32, 'tom', { v: 0.5, t0: 2 }), ...every(8, 32, 'hatO', { v: 0.2, t0: 7 })],
      C: [...every(2, 32, 'tom', { v: 0.48, t0: 1 }), ...every(4, 32, 'kick', { v: 0.5 }), ...every(8, 32, 'hatO', { v: 0.24, t0: 3 })],
    } },
    { id: 'margin', instrument: 'harp', layer: 2, gain: 0.3, pan: 0.35, send: 0.55, patterns: {
      A: B8_MARGIN, B: B8_MARGIN, C: B8_MARGIN,
    } },
    { id: 'eclipse', instrument: 'softbass', layer: 3, gain: 0.4, patterns: {
      A: B8_ECLIPSE, B: B8_ECLIPSE, C: B8_ECLIPSE,
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 9 — "Q.E.D." (A minor → C major, 152). THE FINALE.             */
/*                                                                     */
/* The old version was three 4-bar sections — 12 bars, the shortest    */
/* boss form in the game, for the biggest fight in the game. It is now */
/* five movements and eighteen bars, the longest piece of music Math   */
/* Warriors contains, and it is built as a single dramatic argument:   */
/*                                                                     */
/*   I  THE ROOM HOLDS ITS BREATH  (2 bars, no drums)                  */
/*        one bell, one held Am, one low A. The game stops.            */
/*   A  DREAD                      (4 bars)                            */
/*        the meadow motif in minor, over a bare ticking hat — a clock,*/
/*        not a beat. Nothing is winning yet.                          */
/*   B  STRUGGLE                   (4 bars)                            */
/*        the full riff and the full kit. The motif reaches for C and  */
/*        is dragged back to B every single time.                      */
/*   C  THE TURN                   (4 bars)                            */
/*        one bar of near-silence — the answer arriving — then the     */
/*        E–G–C rise finally starts to climb in major.                 */
/*   D  COMPLETION                 (4 bars)                            */
/*        the motif whole, in the light, over the whole band, closing  */
/*        F→C: the plagal cadence, the oldest "it is finished" in      */
/*        music. The proof completes.                                  */
/*                                                                     */
/* `loop: 'A'` means the two-bar intro plays exactly once and the four */
/* movements then cycle — a long fight keeps re-earning its ending     */
/* instead of re-introducing itself.                                   */
/* ------------------------------------------------------------------ */

// I — the held breath.
const B9_I_BELL = [{ n: 'A4', t: 0, d: 4, v: 0.5 }, { n: 'E5', t: 4, d: 4, v: 0.44 }];
const B9_I_PAD = prog([['A3', 'min']], { beatsEach: 8, v: 0.42 });
const B9_I_BASS = [{ n: 'A1', t: 0, d: 7.5, v: 0.62 }];

// A — DREAD. Sparse, low, and slow-moving under a ticking hat.
const B9_A_DREAD = [
  { n: 'A3', t: 0, d: 2, v: 0.62 }, { n: 'C4', t: 2, d: 1, v: 0.55 }, { n: 'B3', t: 3, d: 1, v: 0.55 },
  { n: 'A3', t: 4, d: 2, v: 0.62 }, { n: 'G#3', t: 6, d: 2, v: 0.66 },
  { n: 'A3', t: 8, d: 2, v: 0.62 }, { n: 'C4', t: 10, d: 1, v: 0.55 }, { n: 'E4', t: 11, d: 1, v: 0.58 },
  { n: 'F4', t: 12, d: 2, v: 0.66 }, { n: 'E4', t: 14, d: 2, v: 0.62 },
];
// The meadow motif, hollowed out: it starts E–G but cannot finish.
const B9_A_MOTIF = [
  { n: 'E5', t: 2, d: 1, v: 0.6 }, { n: 'G5', t: 3, d: 1, v: 0.6 }, { n: 'B5', t: 4, d: 3, v: 0.66 },
  { n: 'E5', t: 10, d: 1, v: 0.58 }, { n: 'G5', t: 11, d: 1, v: 0.58 }, { n: 'A5', t: 12, d: 3, v: 0.62 },
];

// B — STRUGGLE. The riff and the whole kit arrive.
const B9_B_RIFF = [
  ...seq('A4 A4 E5 A4 G4 G4 D5 G4', { step: 0.5, v: 0.85 }),
  ...seq('F4 F4 C5 F4 E4 E4 B4 E4', { step: 0.5, t0: 4, v: 0.83 }),
  ...seq('A4 A4 E5 A4 G4 G4 D5 G4', { step: 0.5, t0: 8, v: 0.85 }),
  ...seq('F4 G4 A4 B4 C5 D5 E5 G#4', { step: 0.5, t0: 12, v: 0.88 }),
];
const B9_B_MOTIF = [
  // the meadow rise dragged into minor: E–G–C becomes E–G–B…
  { n: 'E5', t: 0, d: 1, v: 0.85 }, { n: 'G5', t: 1, d: 1, v: 0.85 },
  { n: 'B5', t: 2, d: 2, v: 0.88 },
  { n: 'A5', t: 4, d: 2, v: 0.85 }, { n: 'E5', t: 6, d: 1, v: 0.78 }, { n: 'C5', t: 7, d: 1, v: 0.75 },
  { n: 'D5', t: 8, d: 1, v: 0.8 }, { n: 'F5', t: 9, d: 1, v: 0.82 },
  { n: 'G#5', t: 10, d: 2, v: 0.85 },
  { n: 'A5', t: 12, d: 2, v: 0.88 }, { n: 'E5', t: 14, d: 2, v: 0.82 },
];

// C — THE TURN. Bar 1 is nearly empty; then the climb begins in major.
const B9_C_TURN = [
  { n: 'E4', t: 4, d: 1, v: 0.72 }, { n: 'G4', t: 5, d: 1, v: 0.74 }, { n: 'C5', t: 6, d: 2, v: 0.82 },
  ...seq('C5 D5 E5 F5 G5 A5 B5 C6', { step: 0.5, t0: 8, v: 0.8 }),
  { n: 'G5', t: 12, d: 2, v: 0.86 }, { n: 'C6', t: 14, d: 2, v: 0.9 },
];
const B9_C_MOTIF = [
  { n: 'C5', t: 6, d: 2, v: 0.72 },
  { n: 'E5', t: 8, d: 1, v: 0.78 }, { n: 'G5', t: 9, d: 1, v: 0.8 }, { n: 'C6', t: 10, d: 2, v: 0.86 },
  { n: 'B5', t: 12, d: 2, v: 0.82 }, { n: 'C6', t: 14, d: 2, v: 0.88 },
];

// D — COMPLETION. …and here it breaks free: E–G–C, whole, in the light.
const B9_D_MOTIF = [
  { n: 'E5', t: 0, d: 1, v: 0.9 }, { n: 'G5', t: 1, d: 1, v: 0.9 },
  { n: 'C6', t: 2, d: 2, v: 0.95 },
  { n: 'B5', t: 4, d: 1, v: 0.85 }, { n: 'A5', t: 5, d: 1, v: 0.85 },
  { n: 'G5', t: 6, d: 2, v: 0.88 },
  { n: 'F5', t: 8, d: 1, v: 0.85 }, { n: 'G5', t: 9, d: 1, v: 0.85 },
  { n: 'A5', t: 10, d: 1, v: 0.88 }, { n: 'B5', t: 11, d: 1, v: 0.9 },
  { n: 'C6', t: 12, d: 4, v: 0.95 },
];
const B9_D_RIFF = seq('C4 C4 G4 C4 F4 F4 C5 F4 G4 G4 D5 G4 C4 E4 G4 C5', { step: 0.5, v: 0.84 });

const B9_KIT = (beats, dense) => [
  ...every(1, beats, 'kick', { v: 0.72 }),
  ...every(dense ? 0.5 : 1, beats, 'hat', { v: 0.3, t0: 0.25 }),
  ...every(2, beats, 'shk', { v: 0.42, t0: 1 }),
  ...every(4, beats, 'tom', { v: 0.5, t0: 3.5 }),
];

// LAYER 2 — THE COUNTERPROOF. A relentless kalimba 16th line: the
// Theorem checking its own working, faster than anyone can read it.
const B9_COUNTERPROOF = (notes) => {
  const out = [];
  for (let i = 0; i < 64; i++) {
    out.push({ n: notes[i % notes.length], t: i * 0.25, d: 0.2, v: i % 4 === 0 ? 0.4 : 0.24 });
  }
  return out;
};
// LAYER 3 — THE CHORALE. The motif doubled an octave up on the music
// box, the game's own signature voice, singing the ending early.
const B9_CHORALE_MINOR = [
  { n: 'E6', t: 0, d: 2, v: 0.36 }, { n: 'B6', t: 4, d: 2, v: 0.34 },
  { n: 'A6', t: 8, d: 2, v: 0.36 }, { n: 'G#6', t: 12, d: 3, v: 0.38 },
];
const B9_CHORALE_MAJOR = [
  { n: 'E6', t: 0, d: 1, v: 0.4 }, { n: 'G6', t: 1, d: 1, v: 0.4 },
  { n: 'C7', t: 2, d: 4, v: 0.44 },
  { n: 'G6', t: 8, d: 2, v: 0.4 }, { n: 'C7', t: 12, d: 4, v: 0.46 },
];
const B9_QUAKE = (beats) => [
  ...every(2, beats, 'tom', { v: 0.42, t0: 0.5 }),
  ...every(4, beats, 'hatO', { v: 0.3, t0: 3.5 }),
];

export const BOSS9_SONG = {
  bpm: 152,
  beatsPerBar: 4,
  gain: 0.92,
  fx: { delayBeats: 0.5, delayFb: 0.25, delayWet: 0.18 },
  // The intro plays once; A→D then cycle forever.
  loop: 'A',
  sections: [
    { name: 'I', bars: 2 }, { name: 'A', bars: 4 }, { name: 'B', bars: 4 },
    { name: 'C', bars: 4 }, { name: 'D', bars: 4 },
  ],
  tracks: [
    { id: 'riff', instrument: 'pluck', gain: 0.75, send: 0.2, patterns: {
      A: B9_A_DREAD, B: B9_B_RIFF, C: B9_C_TURN, D: B9_D_RIFF,
    } },
    { id: 'motif', instrument: 'ocarina', gain: 0.68, send: 0.4, patterns: {
      A: B9_A_MOTIF, B: B9_B_MOTIF, C: B9_C_MOTIF, D: B9_D_MOTIF,
    } },
    { id: 'chorus', instrument: 'bell', gain: 0.45, pan: 0.25, send: 0.5, patterns: {
      I: B9_I_BELL,
      A: [{ n: 'E6', t: 0, d: 2, v: 0.4 }, { n: 'D6', t: 8, d: 2, v: 0.38 }],
      B: [{ n: 'B5', t: 2, d: 2, v: 0.4 }, { n: 'G#5', t: 10, d: 2, v: 0.42 }],
      C: [{ n: 'C6', t: 6, d: 2, v: 0.45 }, { n: 'G6', t: 14, d: 2, v: 0.48 }],
      D: [{ n: 'C6', t: 2, d: 2, v: 0.48 }, { n: 'E6', t: 8, d: 2, v: 0.46 }, { n: 'G6', t: 12, d: 4, v: 0.52 }],
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.42, send: 0.35, patterns: {
      I: B9_I_PAD,
      A: prog([['A3', 'min'], ['A3', 'min'], ['A3', 'min'], ['E3', 'maj']], { beatsEach: 4, v: 0.42 }),
      B: prog([['A3', 'min'], ['F3', 'maj'], ['D3', 'min'], ['E3', 'maj']], { beatsEach: 4, v: 0.45 }),
      C: prog([['A3', 'min'], ['F3', 'maj'], ['G3', 'maj'], ['C4', 'maj']], { beatsEach: 4, v: 0.48 }),
      D: prog([['C4', 'maj'], ['G3', 'maj'], ['F3', 'maj'], ['C4', 'maj']], { beatsEach: 4, v: 0.5 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.65, patterns: {
      I: B9_I_BASS,
      A: seq('A2 . . . A2 . . . F2 . . . E2 . . .', { step: 1, d: 3.6, v: 0.7 }),
      B: seq('A2 A2 A3 A2 F2 F2 F3 F2 D2 D3 D2 D3 E2 E3 E2 E3', { step: 1, d: 0.7, v: 0.72 }),
      C: seq('A2 . . . F2 . . . G2 G2 G3 G2 C3 C3 G3 C3', { step: 1, d: 0.9, v: 0.74 }),
      D: seq('C3 C3 G3 C3 G2 G3 G2 G3 F2 F3 F2 F3 C3 G3 E3 C3', { step: 1, d: 0.7, v: 0.76 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.62, patterns: {
      // A is a CLOCK, not a beat — the hat alone, plus two heartbeats.
      A: [...every(1, 16, 'hat', { v: 0.22 }), { n: 'kick', t: 0, d: 0.1, v: 0.62 }, { n: 'kick', t: 8, d: 0.1, v: 0.62 }],
      B: B9_KIT(16, false),
      // C drops the kit for a bar — the silence the answer lands in.
      C: [
        { n: 'hatO', t: 3.5, d: 0.1, v: 0.35 },
        ...every(1, 12, 'kick', { v: 0.7, t0: 4 }),
        ...every(0.5, 12, 'hat', { v: 0.26, t0: 4.25 }),
        ...every(2, 12, 'shk', { v: 0.4, t0: 5 }),
      ],
      D: B9_KIT(16, true),
    } },
    { id: 'counterproof', instrument: 'kalimba', layer: 2, gain: 0.3, pan: -0.3, send: 0.35, patterns: {
      A: B9_COUNTERPROOF(['A4', 'C5', 'E5', 'C5']),
      B: B9_COUNTERPROOF(['A4', 'C5', 'E5', 'G5']),
      C: B9_COUNTERPROOF(['C5', 'E5', 'G5', 'E5']),
      D: B9_COUNTERPROOF(['C5', 'E5', 'G5', 'C6']),
    } },
    { id: 'chorale', instrument: 'musicbox', layer: 3, gain: 0.34, pan: 0.2, send: 0.5, patterns: {
      A: B9_CHORALE_MINOR, B: B9_CHORALE_MINOR, C: B9_CHORALE_MAJOR, D: B9_CHORALE_MAJOR,
    } },
    { id: 'quake', instrument: 'perc', layer: 3, gain: 0.42, patterns: {
      A: B9_QUAKE(16), B: B9_QUAKE(16), C: B9_QUAKE(16), D: B9_QUAKE(16),
    } },
  ],
};

export const BOSS_SONGS = [
  BOSS1_SONG, BOSS2_SONG, BOSS3_SONG, BOSS4_SONG, BOSS5_SONG,
  BOSS6_SONG, BOSS7_SONG, BOSS8_SONG, BOSS9_SONG,
];
