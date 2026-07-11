/**
 * Music theory helpers — pure functions, no Web Audio.
 *
 * These make composed pieces compact: a song is chord progressions,
 * mini-notation melodies and arpeggio patterns instead of hundreds of
 * hand-typed event objects.
 */

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 261.63, 'A4' → 440, 'F#3' / 'Bb2' supported. */
export function noteHz(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  let semi = NOTE_INDEX[m[1]];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const octave = parseInt(m[3], 10);
  const midi = (octave + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Transpose a note name by semitones: shift('C4', 7) → 'G4'. */
export function shift(name, semis) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return name;
  let semi = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  let midi = (parseInt(m[3], 10) + 1) * 12 + semi + semis;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

const CHORD_SHAPES = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  add9: [0, 4, 7, 14],
  five: [0, 7],
};

/** chord('C4','min') → ['C4','D#4','G4'] */
export function chord(root, shape = 'maj') {
  const intervals = CHORD_SHAPES[shape] || CHORD_SHAPES.maj;
  return intervals.map((s) => shift(root, s));
}

/**
 * Mini-notation melody: seq('E5 G5 . C6', { step: 0.5, v: 0.9 })
 * '.' = rest. Suffix '~' doubles the duration ('C6~' holds 2 steps).
 * Returns [{n, t, d, v}].
 */
export function seq(str, { step = 0.5, d = null, v = 0.8, t0 = 0 } = {}) {
  const out = [];
  let t = t0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '.') { t += step; continue; }
    const held = tok.endsWith('~');
    const n = held ? tok.slice(0, -1) : tok;
    const dur = d != null ? d : held ? step * 2 : step;
    out.push({ n, t, d: dur, v });
    t += held ? step * 2 : step;
  }
  return out;
}

/**
 * Repeating arpeggio over chord tones:
 * arp(chord('C4'), { pattern: [0,1,2,1], step: 0.5, bars: 2, beatsPerBar: 4 })
 */
export function arp(notes, { pattern = [0, 1, 2], step = 0.5, d = null, v = 0.7, bars = 1, beatsPerBar = 4, t0 = 0 } = {}) {
  const out = [];
  const total = bars * beatsPerBar;
  let t = 0, i = 0;
  while (t < total - 1e-9) {
    const n = notes[pattern[i % pattern.length] % notes.length];
    out.push({ n, t: t0 + t, d: d != null ? d : step, v });
    t += step;
    i++;
  }
  return out;
}

/**
 * Block-chord pads over a progression:
 * prog([['C4','maj'],['A3','min']], { beatsEach: 4 })
 */
export function prog(chords, { beatsEach = 4, v = 0.5, t0 = 0 } = {}) {
  const out = [];
  chords.forEach(([root, shape], i) => {
    for (const n of chord(root, shape)) {
      out.push({ n, t: t0 + i * beatsEach, d: beatsEach, v });
    }
  });
  return out;
}

/** Percussion grid: every(1, 8, 'hat') → hats on every beat for 8 beats. */
export function every(stepBeats, totalBeats, note, { v = 0.6, d = 0.1, t0 = 0 } = {}) {
  const out = [];
  for (let t = 0; t < totalBeats - 1e-9; t += stepBeats) {
    out.push({ n: note, t: t0 + t, d, v });
  }
  return out;
}

export const DRUM_KEYS = new Set(['kick', 'hat', 'hatO', 'shk', 'tom']);
