/**
 * Nine boss scores — a unique piece per boss, matched to personality.
 *
 *  1 Briar King     — "Thorn Waltz": a garden waltz with teeth (3/4)
 *  2 The Pressure   — "Fathom King": deep-water dread, heartbeat toms
 *  3 Sky-Whale      — "Stormbreach": a chase through thunderheads
 *  4 Pyroclast      — "Magma Heart": hammering forge-metal riffing
 *  5 Absolute Zero  — "White Silence": an icy ostinato that never blinks
 *  6 The Prism      — "Shatterlight": facets turning 3-against-4
 *  7 Counterfeiter  — "The Crooked Fair": circus music gone wrong
 *  8 The Paradox    — "Ink Eclipse": slow bells in a darkened library
 *  9 The Theorem    — "Q.E.D.": the finale — the meadow motif at war
 *
 * All in the same hand-built engine as the floor themes: composed note
 * data, no samples. Each keeps a kid-safe brightness under the menace.
 */

import { seq, prog, every, arp, chord } from '../theory.js';

/* ------------------------------------------------------------------ */
/* Boss 1 — "Thorn Waltz" (A minor, 3/4 at 141). The garden's own      */
/* dance, overgrown: oom-pah-pah bass, a pluck melody with thorn-prick */
/* accidentals, kalimba trills like snapping vines.                    */
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
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 2 — "Fathom King" (D minor, 80). The deepest water: a slow     */
/* two-note heartbeat in the toms, pressure-swell pads, harp lines     */
/* that rise like bubbles and never reach the surface.                 */
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
const B2_DEPTH = [
  { n: 'D2', t: 0, d: 7, v: 0.7 }, { n: 'D2', t: 8, d: 7, v: 0.68 },
  { n: 'A#1', t: 16, d: 7, v: 0.7 }, { n: 'A1', t: 24, d: 7, v: 0.72 },
];

export const BOSS2_SONG = {
  bpm: 80,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 1.5, delayFb: 0.4, delayWet: 0.3 },
  sections: [{ name: 'A', bars: 8 }],
  tracks: [
    { id: 'bubbles', instrument: 'harp', gain: 0.62, send: 0.5, patterns: { A: B2_BUBBLES } },
    { id: 'pressure', instrument: 'warmpad', gain: 0.6, send: 0.45, patterns: {
      A: prog([['D3', 'min'], ['D3', 'min'], ['A#2', 'maj'], ['A2', 'five']], { beatsEach: 8, v: 0.55 }),
    } },
    { id: 'depth', instrument: 'softbass', gain: 0.6, patterns: { A: B2_DEPTH } },
    { id: 'heartbeat', instrument: 'perc', gain: 0.65, patterns: {
      A: [
        ...every(4, 32, 'tom', { v: 0.75 }),
        ...every(4, 32, 'tom', { v: 0.5, t0: 0.75 }),
        ...every(8, 32, 'hatO', { v: 0.2, t0: 6 }),
      ],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 3 — "Stormbreach" (E minor, 138). A chase above the clouds:    */
/* ocarina siren over a galloping bass, thunder on the kick, the       */
/* B section climbing like an updraft.                                 */
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
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 4 — "Magma Heart" (D minor, 148). The forge at full roar:      */
/* a hammering low riff, double-time kicks, toms like collapsing       */
/* slag — the most aggressive score in the game, still in papercraft.  */
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
const B4_KIT = (beats) => [
  ...every(1, beats, 'kick', { v: 0.72 }),
  ...every(2, beats, 'tom', { v: 0.55, t0: 1.5 }),
  ...every(0.5, beats, 'hat', { v: 0.25, t0: 0.25 }),
  ...every(4, beats, 'hatO', { v: 0.4, t0: 3.5 }),
];

export const BOSS4_SONG = {
  bpm: 148,
  beatsPerBar: 4,
  gain: 0.9,
  fx: { delayBeats: 0.5, delayFb: 0.2, delayWet: 0.12 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'hammer', instrument: 'pluck', gain: 0.8, patterns: { A: B4_HAMMER_A, B: B4_HAMMER_A } },
    { id: 'lava', instrument: 'ocarina', gain: 0.55, pan: 0.15, send: 0.35, patterns: { B: B4_LAVA_B } },
    { id: 'pad', instrument: 'warmpad', gain: 0.35, send: 0.25, patterns: {
      A: prog([['D3', 'five'], ['D3', 'five'], ['G3', 'five'], ['A2', 'five']], { beatsEach: 4, v: 0.45 }),
      B: prog([['D3', 'min'], ['G3', 'min'], ['A#2', 'maj'], ['D3', 'min']], { beatsEach: 4, v: 0.45 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.68, patterns: { A: B4_KIT(16), B: B4_KIT(16) } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 5 — "White Silence" (A minor, 100). Absolute Zero doesn't      */
/* rage — it waits. An unblinking music-box ostinato, bell strikes     */
/* like cracking ice, and a bass that steps down one cold degree at    */
/* a time.                                                             */
/* ------------------------------------------------------------------ */

const B5_OSTINATO = (bars, t0 = 0) => arp(['A4', 'E5', 'C5', 'E5'], { pattern: [0, 1, 2, 1], step: 0.5, bars, v: 0.55, t0 });
const B5_CRACKS = [
  { n: 'E6', t: 3.5, d: 1, v: 0.5 }, { n: 'B5', t: 11.5, d: 1, v: 0.48 },
  { n: 'G#5', t: 19.5, d: 1, v: 0.52 }, { n: 'E6', t: 27, d: 2, v: 0.55 },
  { n: 'D#6', t: 30, d: 2, v: 0.5 },
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

export const BOSS5_SONG = {
  bpm: 100,
  beatsPerBar: 4,
  gain: 0.86,
  fx: { delayBeats: 1, delayFb: 0.38, delayWet: 0.28 },
  sections: [{ name: 'A', bars: 8 }],
  tracks: [
    { id: 'ostinato', instrument: 'musicbox', gain: 0.6, pan: -0.2, send: 0.4, patterns: { A: B5_OSTINATO(8) } },
    { id: 'cracks', instrument: 'bell', gain: 0.5, pan: 0.3, send: 0.55, patterns: { A: B5_CRACKS } },
    { id: 'lead', instrument: 'ocarina', gain: 0.5, send: 0.45, patterns: { A: B5_LEAD } },
    { id: 'bass', instrument: 'softbass', gain: 0.55, patterns: {
      A: seq('A2 . . . G2 . . . F2 . . . E2 . . . A2 . . . G#2 . . . A2 . . . E2 . . .', { step: 1, d: 3.5, v: 0.6 }),
    } },
    { id: 'pulse', instrument: 'perc', gain: 0.4, patterns: {
      A: [...every(2, 32, 'kick', { v: 0.45 }), ...every(4, 32, 'hatO', { v: 0.25, t0: 3 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 6 — "Shatterlight" (E minor, 126). The Prism turns: kalimba    */
/* facets in 3-against-4, bell shards on the corners, and a chorus     */
/* that blooms wide before snapping back to a single point of light.   */
/* ------------------------------------------------------------------ */

const B6_FACETS = (bars, t0 = 0) => [
  ...arp(['E4', 'B4', 'G4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.6, t0 }),
  ...arp(['C4', 'G4', 'E4'], { pattern: [0, 1, 2], step: 0.5, bars: bars / 2, v: 0.58, t0: t0 + (bars / 2) * 4 }),
];
const B6_SHARDS_A = [
  { n: 'B5', t: 0, d: 1, v: 0.5 }, { n: 'F#5', t: 4, d: 1, v: 0.45 },
  { n: 'G5', t: 8, d: 1, v: 0.5 }, { n: 'D#5', t: 12, d: 1, v: 0.48 },
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

export const BOSS6_SONG = {
  bpm: 126,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 0.75, delayFb: 0.32, delayWet: 0.24 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'facets', instrument: 'kalimba', gain: 0.68, pan: -0.15, send: 0.35, patterns: { A: B6_FACETS(4), B: B6_FACETS(4) } },
    { id: 'shards', instrument: 'bell', gain: 0.52, pan: 0.25, send: 0.5, patterns: { A: B6_SHARDS_A, B: B6_SHARDS_A } },
    { id: 'bloom', instrument: 'pluck', gain: 0.6, send: 0.3, patterns: { B: B6_BLOOM_B } },
    { id: 'bass', instrument: 'softbass', gain: 0.58, patterns: {
      A: seq('E2 . E2 . C3 . C3 . E2 . E2 . B2 . B2 .', { step: 1, d: 0.9, v: 0.65 }),
      B: seq('E2 E3 C3 C3 A2 A2 B2 B2 E2 E3 C3 C3 B2 B2 E2 .', { step: 1, d: 0.8, v: 0.65 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.52, patterns: {
      A: [...every(2, 16, 'kick', { v: 0.65 }), ...every(1.5, 16, 'hat', { v: 0.35, t0: 0.5 })],
      B: [...every(2, 16, 'kick', { v: 0.68 }), ...every(1, 16, 'hat', { v: 0.35, t0: 0.5 }), ...every(4, 16, 'shk', { v: 0.4, t0: 2 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 7 — "The Crooked Fair" (A minor, 128). Circus music with a     */
/* forger's grin: the oom-pah keeps slipping onto WRONG notes, the     */
/* melody leers chromatically, and the shaker never quite lands where  */
/* an honest shaker would.                                             */
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
// Honest bars land A–E; crooked bars slip to D# — the counterfeit.
const B7_CROOKED_OOMPAH = seq(
  'A2 E3 A2 E3 A2 D#3 A2 E3 F2 C3 F2 C3 E2 D#3 E2 E3',
  { step: 1, d: 0.5, v: 0.68 },
);

export const BOSS7_SONG = {
  bpm: 128,
  beatsPerBar: 4,
  gain: 0.88,
  fx: { delayBeats: 0.5, delayFb: 0.22, delayWet: 0.16 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  tracks: [
    { id: 'leer', instrument: 'pluck', gain: 0.72, send: 0.25, patterns: { A: B7_LEER_A, B: B7_LEER_B } },
    { id: 'calliope', instrument: 'musicbox', gain: 0.45, pan: 0.3, send: 0.35, patterns: {
      A: [{ n: 'E6', t: 1.5, d: 0.5, v: 0.42 }, { n: 'C6', t: 5.5, d: 0.5, v: 0.4 }, { n: 'D#6', t: 9.5, d: 0.5, v: 0.44 }, { n: 'E6', t: 13.5, d: 0.5, v: 0.42 }],
      B: [{ n: 'A6', t: 3.5, d: 0.5, v: 0.42 }, { n: 'G#6', t: 7.5, d: 0.5, v: 0.42 }, { n: 'E6', t: 11.5, d: 0.5, v: 0.4 }, { n: 'B6', t: 15, d: 1, v: 0.44 }],
    } },
    { id: 'oompah', instrument: 'softbass', gain: 0.62, patterns: { A: B7_CROOKED_OOMPAH, B: B7_CROOKED_OOMPAH } },
    { id: 'kit', instrument: 'perc', gain: 0.5, patterns: {
      A: [...every(2, 16, 'kick', { v: 0.65 }), ...every(2, 16, 'shk', { v: 0.42, t0: 1.25 }), ...every(4, 16, 'hatO', { v: 0.3, t0: 3.5 })],
      B: [...every(2, 16, 'kick', { v: 0.68 }), ...every(1, 16, 'hat', { v: 0.3, t0: 0.75 }), ...every(4, 16, 'tom', { v: 0.4, t0: 3 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 8 — "Ink Eclipse" (D minor, 66). The Paradox blots out the     */
/* library's light: deep bell tolls, a harp spelling slow half-step    */
/* dread, clusters in the pad like spilled ink spreading — the         */
/* quietest boss score, and the heaviest.                              */
/* ------------------------------------------------------------------ */

const B8_TOLL = [
  { n: 'D4', t: 0, d: 4, v: 0.6 }, { n: 'C#4', t: 8, d: 4, v: 0.58 },
  { n: 'D4', t: 16, d: 4, v: 0.6 }, { n: 'G#3', t: 24, d: 4, v: 0.62 },
];
const B8_SPELL = [
  ...seq('D5 C#5 D5 E5 F5 E5 D5 C#5', { step: 1, v: 0.55 }),
  { n: 'D5', t: 8, d: 2, v: 0.55 }, { n: 'A4', t: 10, d: 2, v: 0.5 },
  { n: 'A#4', t: 12, d: 2, v: 0.55 }, { n: 'G#4', t: 14, d: 2, v: 0.52 },
  ...seq('A4 A#4 A4 G4 F4 G4 A4 A#4', { step: 1, t0: 16, v: 0.55 }),
  { n: 'A4', t: 24, d: 3, v: 0.55 }, { n: 'C#5', t: 27, d: 1, v: 0.5 },
  { n: 'D5', t: 28, d: 4, v: 0.58 },
];

export const BOSS8_SONG = {
  bpm: 66,
  beatsPerBar: 4,
  gain: 0.86,
  fx: { delayBeats: 2, delayFb: 0.45, delayWet: 0.32 },
  sections: [{ name: 'A', bars: 8 }],
  tracks: [
    { id: 'toll', instrument: 'bell', gain: 0.6, send: 0.5, patterns: { A: B8_TOLL } },
    { id: 'spell', instrument: 'harp', gain: 0.6, pan: -0.15, send: 0.45, patterns: { A: B8_SPELL } },
    { id: 'ink', instrument: 'warmpad', gain: 0.55, send: 0.45, patterns: {
      // minor clusters: the added 2nd smudges each chord like wet ink
      A: [
        ...prog([['D3', 'min'], ['C#3', 'dim'], ['D3', 'min'], ['G#2', 'dim']], { beatsEach: 8, v: 0.5 }),
        { n: 'E3', t: 0, d: 8, v: 0.3 }, { n: 'D3', t: 8, d: 8, v: 0.3 },
        { n: 'E3', t: 16, d: 8, v: 0.3 }, { n: 'A2', t: 24, d: 8, v: 0.3 },
      ],
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.55, patterns: {
      A: seq('D2 . . . . . . . C#2 . . . . . . . D2 . . . . . . . G#1 . . . A1 . . .', { step: 1, d: 6, v: 0.6 }),
    } },
    { id: 'drip', instrument: 'perc', gain: 0.4, patterns: {
      A: [...every(8, 32, 'tom', { v: 0.5, t0: 4 }), ...every(8, 32, 'hatO', { v: 0.18, t0: 7 })],
    } },
  ],
};

/* ------------------------------------------------------------------ */
/* Boss 9 — "Q.E.D." (A minor, 150). The Theorem — every instrument    */
/* at once, the meadow motif fighting for its life in minor, and in    */
/* the C section it WINS: the E–G–C rise breaks through in major over  */
/* the full kit. The proof completes.                                  */
/* ------------------------------------------------------------------ */

const B9_RIFF_A = [
  ...seq('A4 A4 E5 A4 G4 G4 D5 G4', { step: 0.5, v: 0.85 }),
  ...seq('F4 F4 C5 F4 E4 E4 B4 E4', { step: 0.5, t0: 4, v: 0.83 }),
  ...seq('A4 A4 E5 A4 G4 G4 D5 G4', { step: 0.5, t0: 8, v: 0.85 }),
  ...seq('F4 G4 A4 B4 C5 D5 E5 G#4', { step: 0.5, t0: 12, v: 0.88 }),
];
const B9_MOTIF_MINOR_B = [
  // the meadow rise dragged into minor: E–G–C becomes E–G–B…
  { n: 'E5', t: 0, d: 1, v: 0.85 }, { n: 'G5', t: 1, d: 1, v: 0.85 },
  { n: 'B5', t: 2, d: 2, v: 0.88 },
  { n: 'A5', t: 4, d: 2, v: 0.85 }, { n: 'E5', t: 6, d: 1, v: 0.78 }, { n: 'C5', t: 7, d: 1, v: 0.75 },
  { n: 'D5', t: 8, d: 1, v: 0.8 }, { n: 'F5', t: 9, d: 1, v: 0.82 },
  { n: 'G#5', t: 10, d: 2, v: 0.85 },
  { n: 'A5', t: 12, d: 2, v: 0.88 }, { n: 'E5', t: 14, d: 2, v: 0.82 },
];
const B9_MOTIF_MAJOR_C = [
  // …and here it breaks free: E–G–C, whole, in the light
  { n: 'E5', t: 0, d: 1, v: 0.9 }, { n: 'G5', t: 1, d: 1, v: 0.9 },
  { n: 'C6', t: 2, d: 2, v: 0.95 },
  { n: 'B5', t: 4, d: 1, v: 0.85 }, { n: 'A5', t: 5, d: 1, v: 0.85 },
  { n: 'G5', t: 6, d: 2, v: 0.88 },
  { n: 'F5', t: 8, d: 1, v: 0.85 }, { n: 'G5', t: 9, d: 1, v: 0.85 },
  { n: 'A5', t: 10, d: 1, v: 0.88 }, { n: 'B5', t: 11, d: 1, v: 0.9 },
  { n: 'C6', t: 12, d: 4, v: 0.95 },
];
const B9_KIT = (beats, dense) => [
  ...every(1, beats, 'kick', { v: 0.72 }),
  ...every(dense ? 0.5 : 1, beats, 'hat', { v: 0.3, t0: 0.25 }),
  ...every(2, beats, 'shk', { v: 0.42, t0: 1 }),
  ...every(4, beats, 'tom', { v: 0.5, t0: 3.5 }),
];

export const BOSS9_SONG = {
  bpm: 150,
  beatsPerBar: 4,
  gain: 0.92,
  fx: { delayBeats: 0.5, delayFb: 0.25, delayWet: 0.18 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }, { name: 'C', bars: 4 }],
  tracks: [
    { id: 'riff', instrument: 'pluck', gain: 0.75, send: 0.2, patterns: {
      A: B9_RIFF_A, B: B9_RIFF_A,
      C: seq('C4 C4 G4 C4 F4 F4 C5 F4 G4 G4 D5 G4 C4 E4 G4 C5', { step: 0.5, v: 0.82 }),
    } },
    { id: 'motif', instrument: 'ocarina', gain: 0.68, send: 0.4, patterns: { B: B9_MOTIF_MINOR_B, C: B9_MOTIF_MAJOR_C } },
    { id: 'chorus', instrument: 'bell', gain: 0.45, pan: 0.25, send: 0.5, patterns: {
      A: [{ n: 'E6', t: 0, d: 2, v: 0.4 }, { n: 'D6', t: 8, d: 2, v: 0.38 }],
      B: [{ n: 'B5', t: 2, d: 2, v: 0.4 }, { n: 'G#5', t: 10, d: 2, v: 0.42 }],
      C: [{ n: 'C6', t: 2, d: 2, v: 0.45 }, { n: 'G6', t: 12, d: 3, v: 0.48 }],
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.42, send: 0.35, patterns: {
      A: prog([['A3', 'min'], ['G3', 'maj'], ['A3', 'min'], ['E3', 'maj']], { beatsEach: 4, v: 0.45 }),
      B: prog([['A3', 'min'], ['F3', 'maj'], ['D3', 'min'], ['E3', 'maj']], { beatsEach: 4, v: 0.45 }),
      C: prog([['C4', 'maj'], ['F3', 'maj'], ['G3', 'maj'], ['C4', 'maj']], { beatsEach: 4, v: 0.48 }),
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.65, patterns: {
      A: seq('A2 A2 A3 A2 G2 G2 G3 G2 A2 A2 A3 A2 E2 E3 E2 E3', { step: 1, d: 0.7, v: 0.72 }),
      B: seq('A2 A2 A3 A2 F2 F2 F3 F2 D2 D3 D2 D3 E2 E3 E2 E3', { step: 1, d: 0.7, v: 0.72 }),
      C: seq('C3 C3 G3 C3 F2 F3 F2 F3 G2 G3 G2 G3 C3 G3 E3 C3', { step: 1, d: 0.7, v: 0.75 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.62, patterns: { A: B9_KIT(16, false), B: B9_KIT(16, false), C: B9_KIT(16, true) } },
  ],
};

export const BOSS_SONGS = [
  BOSS1_SONG, BOSS2_SONG, BOSS3_SONG, BOSS4_SONG, BOSS5_SONG,
  BOSS6_SONG, BOSS7_SONG, BOSS8_SONG, BOSS9_SONG,
];
