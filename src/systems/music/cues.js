/**
 * SITUATIONAL CUES — short one-shot pieces the score plays AT you.
 *
 * Pure builders: each returns song data in the same shape songs/*.js
 * use, so the director can play one through the existing graph with no
 * new audio path, no samples and no second AudioContext.
 *
 * What makes these different from the fixed stingers already in
 * battle.js is that they are built IN THE KEY THAT IS PLAYING. A
 * victory phrase fired during the Tide Ledger (A minor) cadences in A
 * minor; the same call in Penny Lanes (C major) cadences in C. The
 * score never sounds like it has been interrupted by a different piece
 * of music — it sounds like the piece answered you.
 *
 * They all quote the main theme (motif.js) somewhere, which is the
 * whole point of having one.
 */

import { degSeq, degProg, quote, ROAD_HOOK, MEADOW_RISE } from './motif.js';

const RELATIVE_MAJOR = 3;   // semitones from a minor tonic to its relative major
const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pcOf(tonic) {
  const m = /^([A-G])([#b]?)/.exec(String(tonic).trim());
  if (!m) return 0;
  return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** A minor key's relative major — where the score goes to be kind. */
export function relativeMajor(tonic) {
  return PC_NAMES[(pcOf(tonic) + RELATIVE_MAJOR) % 12];
}

/** Tonic letter + octave, e.g. root('D', 4) → 'D4'. */
function root(tonic, octave) {
  return `${tonic}${octave}`;
}

/* ── DISCOVERY ──────────────────────────────────────────────────────── */

/**
 * "You found something." Under two seconds: the Paper Meadow rise on a
 * music box, a bell holding the octave, and a harp spilling upward
 * behind it. Bright, small, and gone before it can get in the way — a
 * child should want to find another one, not brace for the noise.
 */
export function discoveryCue({ tonic = 'C', mode = 'maj' } = {}) {
  const t4 = root(tonic, 4);
  const key = { tonic: t4, mode };
  return {
    id: 'cue/discovery',
    bpm: 132,
    beatsPerBar: 4,
    gain: 0.8,
    loop: false,
    duck: 0.55,                       // barely ducks — this is a sparkle, not an event
    fx: { delayBeats: 0.375, delayFb: 0.3, delayWet: 0.3 },
    sections: [{ name: 'A', bars: 1 }],
    tracks: [
      {
        id: 'chime', instrument: 'musicbox', gain: 0.85, send: 0.4, pan: 0.15,
        patterns: { A: quote(`${MEADOW_RISE}~~`, { ...key, step: 0.5, v: 0.85 }) },
      },
      {
        id: 'ring', instrument: 'bell', gain: 0.5, send: 0.5,
        patterns: {
          A: [
            ...degSeq('15', { ...key, step: 2, t0: 1, v: 0.42 }),
            ...degSeq('19', { ...key, step: 2, t0: 2, v: 0.3 }),
          ],
        },
      },
      {
        id: 'spill', instrument: 'harp', gain: 0.5, send: 0.35, pan: -0.2,
        patterns: { A: degSeq('8 10 12 15', { ...key, step: 0.25, t0: 2.5, v: 0.45 }) },
      },
    ],
  };
}

/* ── VICTORY ────────────────────────────────────────────────────────── */

/**
 * The short phrase that RESOLVES. Eight beats: a scale-wise climb to
 * the octave, then the theme's own answer falling home to the tonic —
 * sol la ti DO, la sol mi, re mi do. Built on whatever key the score is
 * in, so it lands as the ending of the music already playing rather
 * than as a jingle glued on top.
 */
export function victoryPhrase({ tonic = 'C', mode = 'maj' } = {}) {
  const key = { tonic: root(tonic, 4), mode };
  const low = { tonic: root(tonic, 2), mode };
  return {
    id: 'cue/victory',
    bpm: 126,
    beatsPerBar: 4,
    gain: 0.92,
    loop: false,
    duck: 0.18,
    fx: { delayBeats: 0.5, delayFb: 0.25, delayWet: 0.2 },
    sections: [{ name: 'A', bars: 2 }],
    tracks: [
      {
        id: 'lead', instrument: 'musicbox', gain: 0.9, send: 0.35, pan: -0.1,
        patterns: { A: degSeq('12 13 14 15~~ 13 12 10~ 9 10 8~~~', { ...key, step: 0.5, v: 0.9 }) },
      },
      {
        id: 'ring', instrument: 'bell', gain: 0.55, send: 0.45,
        patterns: {
          A: [
            ...degSeq('15', { ...key, step: 2, t0: 1.5, v: 0.45 }),
            ...degSeq('15', { ...key, step: 2, t0: 6, v: 0.35 }),
          ],
        },
      },
      {
        id: 'pad', instrument: 'warmpad', gain: 0.45, send: 0.35,
        patterns: { A: degProg([5, 1, 4, 1], { ...key, beatsEach: 2, v: 0.5 }) },
      },
      {
        id: 'bass', instrument: 'softbass', gain: 0.6,
        patterns: {
          A: [
            ...degSeq('5', { ...low, step: 1.5, v: 0.7 }),
            ...degSeq('1', { ...low, step: 2.5, t0: 1.5, v: 0.75 }),
            ...degSeq('5', { ...low, step: 1, t0: 4, v: 0.65 }),
            ...degSeq('1', { ...low, step: 3, t0: 5, v: 0.75 }),
          ],
        },
      },
      {
        id: 'kit', instrument: 'perc', gain: 0.5,
        patterns: {
          A: [
            { n: 'kick', t: 0, d: 0.2, v: 0.7 }, { n: 'kick', t: 1.5, d: 0.2, v: 0.8 },
            { n: 'shk', t: 3.5, d: 0.2, v: 0.5 }, { n: 'kick', t: 6, d: 0.2, v: 0.7 },
          ],
        },
      },
    ],
  };
}

/* ── ENCOURAGEMENT ──────────────────────────────────────────────────── */

/**
 * "You're still here. Take your time."
 *
 * Fired after three misses in a row. Two rules make it kind rather than
 * condescending: it never uses percussion (no clock, no pressure), and
 * it always plays in MAJOR. If the biome is in a minor key the phrase
 * arrives in that key's RELATIVE MAJOR — the same notes the score is
 * already using, heard from their warm side. The player hears the room
 * brighten, not a sad trombone.
 *
 * It also ends on the third rather than the tonic: an open, "go on"
 * sound instead of a full stop.
 */
export function encouragementCue({ tonic = 'C', mode = 'maj' } = {}) {
  const warmTonic = mode === 'maj' ? tonic : relativeMajor(tonic);
  const key = { tonic: root(warmTonic, 4), mode: 'maj' };
  const low = { tonic: root(warmTonic, 3), mode: 'maj' };
  return {
    id: 'cue/encourage',
    bpm: 66,
    beatsPerBar: 4,
    gain: 0.7,
    loop: false,
    duck: 0.45,
    fx: { delayBeats: 1, delayFb: 0.3, delayWet: 0.3 },
    sections: [{ name: 'A', bars: 1 }],
    tracks: [
      {
        id: 'hand', instrument: 'kalimba', gain: 0.7, send: 0.4, pan: -0.15,
        patterns: { A: degSeq('. 10 12 13~ 12~ 10', { ...key, step: 0.5, v: 0.62 }) },
      },
      {
        id: 'echo', instrument: 'musicbox', gain: 0.4, send: 0.45, pan: 0.25,
        patterns: { A: degSeq('. . 5 . 8~', { ...low, step: 0.5, t0: 0.25, v: 0.35 }) },
      },
      {
        id: 'pad', instrument: 'warmpad', gain: 0.5, send: 0.4,
        patterns: { A: degProg([4, 1], { ...key, beatsEach: 2, v: 0.5 }) },
      },
    ],
  };
}

/* ── FLOOR COMPLETE ─────────────────────────────────────────────────── */

/**
 * The big one. A full statement of the main theme's hook, harmonised,
 * with the tag landing on the octave and a bell left ringing over it.
 * This is the only cue that says the whole tune, which is what makes
 * finishing a floor feel like the thing the music has been building
 * toward all along.
 */
export function floorFanfare({ tonic = 'C', mode = 'maj' } = {}) {
  const key = { tonic: root(tonic, 4), mode };
  const low = { tonic: root(tonic, 2), mode };
  return {
    id: 'cue/floor-complete',
    bpm: 116,
    beatsPerBar: 4,
    gain: 0.95,
    loop: false,
    duck: 0.1,
    fx: { delayBeats: 0.5, delayFb: 0.28, delayWet: 0.24 },
    sections: [{ name: 'A', bars: 3 }],
    tracks: [
      {
        id: 'theme', instrument: 'musicbox', gain: 0.9, send: 0.35, pan: -0.1,
        patterns: {
          A: [
            ...quote(ROAD_HOOK, { ...key, step: 1, v: 0.92 }),
            ...degSeq('16 15 12 15~~', { ...key, step: 0.5, t0: 8, v: 0.95 }),
          ],
        },
      },
      {
        id: 'answer', instrument: 'ocarina', gain: 0.6, send: 0.35, pan: 0.2,
        patterns: { A: degSeq('. . 8 10 12~ 13~', { ...key, step: 1, t0: 0, v: 0.6 }) },
      },
      {
        id: 'ring', instrument: 'bell', gain: 0.55, send: 0.5,
        patterns: {
          A: [
            ...degSeq('15', { ...key, step: 2, t0: 0, v: 0.4 }),
            ...degSeq('15', { ...key, step: 2, t0: 8, v: 0.45 }),
            ...degSeq('19', { ...key, step: 2, t0: 10.5, v: 0.35 }),
          ],
        },
      },
      {
        id: 'pad', instrument: 'warmpad', gain: 0.5, send: 0.4,
        patterns: { A: degProg([1, 6, 4, 5, 1, 1], { ...key, beatsEach: 2, v: 0.5 }) },
      },
      {
        id: 'bass', instrument: 'softbass', gain: 0.62,
        patterns: {
          A: [
            ...degSeq('1', { ...low, step: 4, v: 0.75 }),
            ...degSeq('5', { ...low, step: 4, t0: 4, v: 0.7 }),
            ...degSeq('4 5', { ...low, step: 1, t0: 8, v: 0.72 }),
            ...degSeq('1', { ...low, step: 2, t0: 10, v: 0.8 }),
          ],
        },
      },
      {
        id: 'kit', instrument: 'perc', gain: 0.55,
        patterns: {
          A: [
            { n: 'kick', t: 0, d: 0.2, v: 0.8 }, { n: 'kick', t: 4, d: 0.2, v: 0.75 },
            { n: 'shk', t: 7.5, d: 0.2, v: 0.55 }, { n: 'kick', t: 8, d: 0.2, v: 0.8 },
            { n: 'kick', t: 10, d: 0.2, v: 0.85 }, { n: 'hatO', t: 10.5, d: 0.2, v: 0.5 },
          ],
        },
      },
    ],
  };
}

/* ── THE KEY BRIDGE ─────────────────────────────────────────────────── */

/**
 * The join between two biomes.
 *
 * planKeyBridge() (adaptive.js) works out which notes belong to both
 * keys; this holds exactly those notes on a pad with a soft bell on top
 * while one theme leaves and the next arrives. The ear hears a single
 * chord being re-heard in a new light instead of two pieces of music
 * overlapping — which is the difference between "the score modulated"
 * and "someone changed the CD".
 */
export function keyBridgeCue(pivots, { bars = 2, bpm = 84 } = {}) {
  const tones = (pivots && pivots.length ? pivots : ['C', 'E', 'G']).slice(0, 3);
  const beats = bars * 4;
  const pad = tones.map((pc, i) => ({ n: `${pc}${3 + (i % 2)}`, t: 0, d: beats, v: 0.42 }));
  const shimmer = tones.map((pc, i) => ({ n: `${pc}5`, t: i * 0.5, d: 2, v: 0.26 - i * 0.04 }));
  return {
    id: 'cue/bridge',
    bpm,
    beatsPerBar: 4,
    gain: 0.55,
    loop: false,
    duck: 1,                        // does not duck: it sits INSIDE the crossfade
    fx: { delayBeats: 1, delayFb: 0.32, delayWet: 0.3 },
    sections: [{ name: 'A', bars }],
    tracks: [
      { id: 'hold', instrument: 'warmpad', gain: 0.6, send: 0.4, patterns: { A: pad } },
      { id: 'shimmer', instrument: 'bell', gain: 0.35, send: 0.5, pan: 0.2, patterns: { A: shimmer } },
    ],
  };
}

/** Every cue builder, by name — used by the score facade and by tests. */
export const CUE_BUILDERS = {
  discovery: discoveryCue,
  victory: victoryPhrase,
  encourage: encouragementCue,
  floorComplete: floorFanfare,
};
