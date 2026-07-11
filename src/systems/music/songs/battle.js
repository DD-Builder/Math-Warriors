/**
 * "Pencils Out!" — the standard battle theme, plus the victory and
 * defeat stingers.
 *
 * A minor, 132 BPM: a driving pluck riff over a walking bass and
 * tiptoe percussion — urgent enough to feel like a duel, bouncy
 * enough that a wrong answer doesn't sting. The B section lifts to
 * F–G–Am so long fights breathe.
 */

import { seq, prog, every } from '../theory.js';

const RIFF_A = [
  ...seq('A4 C5 E5 C5 A4 C5 D5 C5', { step: 0.5, v: 0.8 }),
  ...seq('G4 B4 D5 B4 G4 B4 E5 D5', { step: 0.5, t0: 4, v: 0.78 }),
  ...seq('A4 C5 E5 C5 F5 E5 D5 C5', { step: 0.5, t0: 8, v: 0.82 }),
  ...seq('E5 D5 B4 G4 A4~ .', { step: 0.5, t0: 12, v: 0.8 }),
  { n: 'E4', t: 15, d: 1, v: 0.7 },
];

const RIFF_B = [
  ...seq('F5 E5 F5 A5 G5 F5 E5 D5', { step: 0.5, v: 0.85 }),
  ...seq('E5 D5 E5 G5 F5 E5 D5 B4', { step: 0.5, t0: 4, v: 0.82 }),
  ...seq('C5 E5 A5 E5 F5 A5 C6 A5', { step: 0.5, t0: 8, v: 0.88 }),
  { n: 'B5', t: 12, d: 1.5, v: 0.85 }, { n: 'G5', t: 13.5, d: 0.5, v: 0.75 },
  { n: 'A5', t: 14, d: 2, v: 0.9 },
];

const BASS_A = seq('A2 A2 E3 A2 G2 G2 D3 G2 A2 A2 E3 A2 E2 E3 E2 E3', { step: 1, d: 0.8, v: 0.75 });
const BASS_B = seq('F2 F3 F2 F3 E2 E3 E2 E3 A2 A3 F2 F3 E2 E3 A2 .', { step: 1, d: 0.8, v: 0.75 });

const KIT = (bars) => [
  ...every(2, bars * 4, 'kick', { v: 0.7 }),
  ...every(1, bars * 4, 'hat', { v: 0.45, t0: 0.5 }),
  ...every(4, bars * 4, 'shk', { v: 0.5, t0: 3 }),
];

export const BATTLE_SONG = {
  bpm: 132,
  beatsPerBar: 4,
  gain: 0.85,
  fx: { delayBeats: 0.5, delayFb: 0.22, delayWet: 0.16 },
  sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 4 }],
  loop: false === true ? false : undefined, // loop everything (A+B)
  tracks: [
    { id: 'riff', instrument: 'pluck', gain: 0.8, send: 0.25, patterns: { A: RIFF_A, B: RIFF_B } },
    { id: 'bass', instrument: 'softbass', gain: 0.65, patterns: { A: BASS_A, B: BASS_B } },
    { id: 'pad', instrument: 'warmpad', gain: 0.3, send: 0.3, patterns: {
      A: prog([['A3', 'min'], ['G3', 'maj'], ['A3', 'min'], ['E3', 'min']], { beatsEach: 4, v: 0.45 }),
      B: prog([['F3', 'maj'], ['E3', 'min'], ['A3', 'min'], ['E3', 'maj']], { beatsEach: 4, v: 0.45 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.6, patterns: { A: KIT(4), B: KIT(4) } },
  ],
};

/** Four-second fanfare when the battle is won. */
export const VICTORY_STINGER = {
  bpm: 120,
  beatsPerBar: 4,
  gain: 0.95,
  loop: false,
  fx: { delayBeats: 0.5, delayFb: 0.25, delayWet: 0.2 },
  sections: [{ name: 'A', bars: 2 }],
  tracks: [
    { id: 'fan', instrument: 'musicbox', gain: 0.9, send: 0.35, patterns: {
      A: [
        ...seq('C5 E5 G5', { step: 0.25, v: 0.9 }),
        { n: 'C6', t: 0.75, d: 1.25, v: 1 },
        ...seq('A5 B5', { step: 0.5, t0: 2, v: 0.85 }),
        { n: 'C6', t: 3, d: 2, v: 0.95 },
        { n: 'E6', t: 5, d: 2.5, v: 0.9 },
      ],
    } },
    { id: 'bell', instrument: 'bell', gain: 0.6, send: 0.4, patterns: {
      A: [{ n: 'C6', t: 3, d: 2, v: 0.5 }, { n: 'G6', t: 5, d: 2, v: 0.4 }],
    } },
    { id: 'bass', instrument: 'softbass', gain: 0.6, patterns: {
      A: seq('C3 G3 C3 . C3 . . .', { step: 1, d: 1.2, v: 0.7 }),
    } },
    { id: 'kit', instrument: 'perc', gain: 0.55, patterns: {
      A: [{ n: 'kick', t: 0, v: 0.8 }, { n: 'kick', t: 3, v: 0.8 }, { n: 'shk', t: 5, v: 0.6 }],
    } },
  ],
};

/** Gentle three-second "dust yourself off" for defeat — never scary. */
export const DEFEAT_STINGER = {
  bpm: 84,
  beatsPerBar: 4,
  gain: 0.85,
  loop: false,
  fx: { delayBeats: 1, delayFb: 0.3, delayWet: 0.25 },
  sections: [{ name: 'A', bars: 1 }],
  tracks: [
    { id: 'sigh', instrument: 'musicbox', gain: 0.8, send: 0.4, patterns: {
      A: [
        { n: 'E5', t: 0, d: 1, v: 0.7 }, { n: 'C5', t: 1, d: 1, v: 0.65 },
        { n: 'A4', t: 2, d: 2, v: 0.7 },
      ],
    } },
    { id: 'pad', instrument: 'warmpad', gain: 0.4, patterns: {
      A: prog([['A3', 'min']], { beatsEach: 4, v: 0.5 }),
    } },
  ],
};
