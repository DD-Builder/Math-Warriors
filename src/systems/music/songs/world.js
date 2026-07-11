/**
 * "Nine Roads" — the world map theme.
 *
 * The Paper Meadow motif slowed to a stroll (76 BPM) and handed to
 * the ocarina — the sound of looking at a map and deciding where to
 * wander. Longer bars, fewer notes, more air.
 */

import { seq, prog, every } from '../theory.js';

const CHORDS = [
  ['C4', 'maj'], ['F3', 'maj'], ['A3', 'min'], ['G3', 'maj'],
  ['C4', 'maj'], ['F3', 'maj'], ['G3', 'sus4'], ['C4', 'maj'],
];

const OCARINA = [
  { n: 'E5', t: 0, d: 2, v: 0.8 }, { n: 'G5', t: 2, d: 1, v: 0.75 }, { n: 'C6', t: 3, d: 3, v: 0.85 },
  { n: 'A5', t: 6, d: 2, v: 0.8 },
  { n: 'F5', t: 8, d: 2, v: 0.75 }, { n: 'A5', t: 10, d: 2, v: 0.8 },
  { n: 'E5', t: 12, d: 3, v: 0.78 }, { n: 'D5', t: 15, d: 1, v: 0.7 },
  { n: 'E5', t: 16, d: 2, v: 0.8 }, { n: 'G5', t: 18, d: 1, v: 0.75 }, { n: 'B5', t: 19, d: 3, v: 0.82 },
  { n: 'A5', t: 22, d: 2, v: 0.78 },
  { n: 'G5', t: 24, d: 2.5, v: 0.8 }, { n: 'E5', t: 26.5, d: 1.5, v: 0.72 },
  { n: 'C5', t: 28, d: 4, v: 0.85 },
];

const HARP_RIPPLE = [
  ...seq('C4 E4 G4 C5', { step: 0.5, t0: 4, v: 0.45 }),
  ...seq('F3 A3 C4 F4', { step: 0.5, t0: 12, v: 0.42 }),
  ...seq('G3 B3 D4 G4', { step: 0.5, t0: 20, v: 0.45 }),
  ...seq('C4 G4 E4 C4', { step: 0.5, t0: 28, v: 0.4 }),
];

export const WORLD_SONG = {
  bpm: 76,
  beatsPerBar: 4,
  gain: 0.85,
  fx: { delayBeats: 1, delayFb: 0.35, delayWet: 0.25 },
  sections: [{ name: 'A', bars: 8 }],
  loop: 'A',
  tracks: [
    { id: 'lead', instrument: 'ocarina', gain: 0.75, send: 0.4, patterns: { A: OCARINA } },
    { id: 'ripple', instrument: 'harp', gain: 0.55, pan: 0.25, send: 0.35, patterns: { A: HARP_RIPPLE } },
    { id: 'pad', instrument: 'warmpad', gain: 0.45, send: 0.4, patterns: { A: prog(CHORDS, { beatsEach: 4, v: 0.5 }) } },
    { id: 'bass', instrument: 'softbass', gain: 0.5, patterns: { A: seq('C3 . . . F2 . . . A2 . . . G2 . . . C3 . . . F2 . . . G2 . . . C3 . . .', { step: 1, d: 3, v: 0.6 }) } },
    { id: 'perc', instrument: 'perc', gain: 0.35, patterns: { A: every(4, 32, 'shk', { v: 0.35, t0: 2 }) } },
  ],
};
