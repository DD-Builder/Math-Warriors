/**
 * "Paper Meadow" — the title & menu theme.
 *
 * Gentle storybook 4/4 in C major at 92 BPM. A music-box carries the
 * main motif (the same motif the floor themes vary); a harp answers
 * in the B section; a warm pad breathes underneath; percussion tiptoes
 * in only for the answer phrase. Subtle on purpose — this is the tune
 * a parent hears forty times without wanting to mute it.
 */

import { seq, prog, every } from '../theory.js';

const A_CHORDS = [
  ['C4', 'maj'], ['A3', 'min'], ['F3', 'maj'], ['G3', 'maj'],
  ['C4', 'maj'], ['A3', 'min'], ['F3', 'maj'], ['C4', 'maj'],
];
const B_CHORDS = [
  ['A3', 'min'], ['F3', 'maj'], ['C4', 'maj'], ['G3', 'maj'],
  ['A3', 'min'], ['F3', 'maj'], ['D3', 'min'], ['C4', 'maj'],
];

// Main motif, section A (32 beats). Bars 1-4 state it, 5-8 resolve it.
const MELODY_A = [
  ...seq('E5 G5', { step: 1, v: 0.9 }),
  { n: 'C6', t: 2, d: 1.5, v: 0.95 }, { n: 'B5', t: 3.5, d: 0.5, v: 0.8 },
  { n: 'A5', t: 4, d: 2, v: 0.9 }, { n: 'E5', t: 6, d: 1, v: 0.8 }, { n: 'C5', t: 7, d: 1, v: 0.75 },
  ...seq('F5 A5', { step: 1, t0: 8, v: 0.85 }),
  { n: 'C6', t: 10, d: 2, v: 0.9 },
  { n: 'B5', t: 12, d: 1.5, v: 0.85 }, { n: 'G5', t: 13.5, d: 0.5, v: 0.75 }, { n: 'D5', t: 14, d: 2, v: 0.8 },
  ...seq('E5 G5', { step: 1, t0: 16, v: 0.88 }),
  { n: 'C6', t: 18, d: 1.5, v: 0.92 }, { n: 'D6', t: 19.5, d: 0.5, v: 0.85 },
  { n: 'E6', t: 20, d: 2, v: 0.95 }, { n: 'C6', t: 22, d: 1, v: 0.85 }, { n: 'A5', t: 23, d: 1, v: 0.8 },
  ...seq('F5 G5 A5 B5', { step: 0.5, t0: 24, v: 0.82 }),
  { n: 'G5', t: 26, d: 2, v: 0.85 },
  { n: 'D5', t: 28, d: 1.5, v: 0.8 }, { n: 'E5', t: 29.5, d: 0.5, v: 0.78 },
  { n: 'C5', t: 30, d: 2, v: 0.9 },
];

// Answer phrase, section B — harp leads, music box echoes.
const HARP_B = [
  ...seq('A5 C6 E6~ C6', { step: 0.5, t0: 0, v: 0.85 }),
  ...seq('F5 A5 C6~ A5', { step: 0.5, t0: 4, v: 0.8 }),
  ...seq('E5 G5 C6~ G5', { step: 0.5, t0: 8, v: 0.82 }),
  { n: 'D6', t: 12, d: 2, v: 0.85 }, { n: 'B5', t: 14, d: 2, v: 0.8 },
  ...seq('A5 C6 E6~ C6', { step: 0.5, t0: 16, v: 0.85 }),
  ...seq('F5 A5 C6~ A5', { step: 0.5, t0: 20, v: 0.8 }),
  { n: 'F5', t: 24, d: 1, v: 0.78 }, { n: 'A5', t: 25, d: 1, v: 0.8 }, { n: 'B5', t: 26, d: 2, v: 0.82 },
  { n: 'C6', t: 28, d: 3, v: 0.9 },
];
const ECHO_B = [
  { n: 'E5', t: 2.5, d: 1, v: 0.4 }, { n: 'C5', t: 6.5, d: 1, v: 0.38 },
  { n: 'G5', t: 10.5, d: 1, v: 0.4 }, { n: 'G5', t: 18.5, d: 1, v: 0.4 },
  { n: 'E5', t: 22.5, d: 1, v: 0.38 }, { n: 'E5', t: 29, d: 2, v: 0.42 },
];

const BASS_A = seq('C3 . G3 . A2 . E3 . F2 . C3 . G2 . B2 . C3 . G3 . A2 . E3 . F2 . G2 . C3 . .', { step: 1, d: 1.6, v: 0.7 });
const BASS_B = seq('A2 . E3 . F2 . C3 . C3 . G3 . G2 . D3 . A2 . E3 . F2 . C3 . D3 . G2 . C3 . .', { step: 1, d: 1.6, v: 0.68 });

export const TITLE_SONG = {
  bpm: 92,
  beatsPerBar: 4,
  gain: 0.9,
  fx: { delayBeats: 0.75, delayFb: 0.3, delayWet: 0.22 },
  sections: [
    { name: 'intro', bars: 2 },
    { name: 'A', bars: 8 },
    { name: 'B', bars: 8 },
  ],
  loop: 'A',
  tracks: [
    {
      id: 'melody', instrument: 'musicbox', gain: 0.85, pan: -0.15, send: 0.35,
      patterns: {
        intro: seq('G4 A4 B4 C5', { step: 0.5, t0: 6, v: 0.6 }),
        A: MELODY_A,
        B: ECHO_B,
      },
    },
    {
      id: 'counter', instrument: 'harp', gain: 0.7, pan: 0.2, send: 0.3,
      patterns: { B: HARP_B },
    },
    {
      id: 'pad', instrument: 'warmpad', gain: 0.5, send: 0.4,
      patterns: {
        intro: prog([['C4', 'maj'], ['G3', 'maj']], { beatsEach: 4, v: 0.5 }),
        A: prog(A_CHORDS, { beatsEach: 4, v: 0.5 }),
        B: prog(B_CHORDS, { beatsEach: 4, v: 0.5 }),
      },
    },
    {
      id: 'bass', instrument: 'softbass', gain: 0.55,
      patterns: { A: BASS_A, B: BASS_B },
    },
    {
      id: 'perc', instrument: 'perc', gain: 0.5,
      patterns: {
        B: [
          ...every(2, 32, 'hat', { v: 0.5, t0: 1.5 }),
          ...every(8, 32, 'shk', { v: 0.45 }),
        ],
      },
    },
    {
      id: 'accent', instrument: 'bell', gain: 0.5, send: 0.5,
      patterns: {
        A: [{ n: 'C6', t: 28, d: 2, v: 0.4 }],
        B: [{ n: 'E6', t: 28, d: 2, v: 0.35 }],
      },
    },
  ],
};
