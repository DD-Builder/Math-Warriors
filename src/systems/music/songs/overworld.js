/**
 * "NINE PAPER ROADS" — the main theme.
 *
 * This is the tune the game is named by: the one that plays when you
 * are just walking, the one the victory phrase resolves, the one the
 * finale steals and gives back. Its hook lives in ../motif.js as scale
 * degrees so every other piece can quote it in its own key.
 *
 *     G4  C5  D5  E5——  G5  C6——
 *     sol do  re  mi    sol DO
 *
 * ── WHAT MAKES IT ADAPTIVE ──────────────────────────────────────────
 * There is one piece of music here, mixed four different ways. No track
 * ever gets swapped out for another file; the director just re-balances
 * the same stems (see ../adaptive.js → resolveTrackGain).
 *
 *   daypart 'day'    bright: ocarina lead, harp ripples, shaker
 *   daypart 'night'  soft:   music box lead, bell chimes, low glow, no shaker
 *   (no daypart)     always: the pad, the bass — the ground under both
 *
 *   layer 1  CALM    the theme, as written
 *   layer 2  ALERT   a low pulse and a heartbeat tom — something is near
 *   layer 3  COMBAT  a pluck riff doubling the hook, plus a real kit
 *   layer 4  BOSS    a bell heralding the hook over the top of everything
 *
 *   until: 2 on the harp ripples — the daydreaming voice STEPS ASIDE
 *   once a fight starts. Escalation that only ever adds gets muddy; the
 *   good stuff is knowing what to take away.
 *
 * At dusk both voicings sound at half strength, so for a real minute of
 * play the ocarina and the music box share the sky. That overlap is the
 * whole reason day/night is a fade and not a switch.
 */

import { every } from '../theory.js';
import {
  degSeq, degProg, quote, veil, bones,
  ROAD_HOOK, ROAD_ANSWER, ROAD_LIFT, ROAD_RETURN, MEADOW_RISE,
} from '../motif.js';

const KEY = { tonic: 'C4', mode: 'maj' };
const LOW = { tonic: 'C2', mode: 'maj' };
const GLOW = { tonic: 'C3', mode: 'maj' };

/* ── THE TUNE ───────────────────────────────────────────────────────── */

// Section A: the theme, whole. Four eight-beat phrases — statement,
// answer, lift, return — each with its own weight in the wrist.
const MELODY_A = [
  ...quote(ROAD_HOOK, { ...KEY, step: 1, v: 0.88 }),
  ...quote(ROAD_ANSWER, { ...KEY, step: 1, t0: 8, v: 0.82 }),
  ...quote(ROAD_LIFT, { ...KEY, step: 1, t0: 16, v: 0.85 }),
  ...quote(ROAD_RETURN, { ...KEY, step: 1, t0: 24, v: 0.9 }),
];

// Section B: the road wanders. Stepwise, lower, unhurried — and then
// the hook comes back at bar 5 exactly when you have started to miss it.
const MELODY_B = [
  ...degSeq('10 11 12~', { ...KEY, step: 1, v: 0.76 }),
  ...degSeq('10 9 8~', { ...KEY, step: 1, t0: 4, v: 0.72 }),
  ...degSeq('9 10 11~', { ...KEY, step: 1, t0: 8, v: 0.78 }),
  ...degSeq('13~ 12~', { ...KEY, step: 1, t0: 12, v: 0.82 }),
  ...quote(ROAD_HOOK, { ...KEY, step: 1, t0: 16, v: 0.9 }),
  ...degSeq('14 13 12~ 10 9 8~', { ...KEY, step: 1, t0: 24, v: 0.85 }),
];

// I vi IV I | ii V V I — the lift leans on eight beats of dominant, so
// the return breaking through to the top note actually resolves something.
const CHORDS_A = [1, 6, 4, 1, 2, 5, 5, 1];
const CHORDS_B = [4, 1, 2, 5, 1, 6, 5, 1];

// The bass walks the leading tone under the second dominant bar rather
// than sitting on the same root for eight beats.
const BASS_A = degSeq('1 6 4 1 2 5 7 1', { ...LOW, step: 4, d: 3.4, v: 0.62 });
const BASS_B = degSeq('4 1 2 5 1 6 7 1', { ...LOW, step: 4, d: 3.4, v: 0.6 });

/* ── DAY: ripples and air ───────────────────────────────────────────── */

const RIPPLE_A = [
  ...degSeq('8 10 12 15', { ...KEY, step: 0.5, t0: 2, v: 0.4 }),
  ...degSeq('13 12 10 8', { ...KEY, step: 0.5, t0: 10, v: 0.36 }),
  ...degSeq('9 11 13 16', { ...KEY, step: 0.5, t0: 18, v: 0.4 }),
  ...degSeq('15 12 10 8', { ...KEY, step: 0.5, t0: 26, v: 0.38 }),
];
const RIPPLE_B = [
  ...degSeq('11 13 15', { ...KEY, step: 0.5, t0: 6, v: 0.36 }),
  ...degSeq('8 10 12', { ...KEY, step: 0.5, t0: 14, v: 0.34 }),
  ...degSeq('12 15 17', { ...KEY, step: 0.5, t0: 22, v: 0.38 }),
  ...degSeq('10 8 5', { ...KEY, step: 0.5, t0: 30, v: 0.34 }),
];

/* ── NIGHT: the same tune, further away ─────────────────────────────── */

const NIGHT_A = veil(MELODY_A, 0.82);
const NIGHT_B = veil(MELODY_B, 0.82);
// Only the notes the melody LEANS on — the held ones. A bell picking out
// the skeleton reads as the tune remembered rather than the tune played.
const CHIMES_A = veil(bones(MELODY_A, 2), 0.5);
const CHIMES_B = veil(bones(MELODY_B, 2), 0.5);

/* ── LAYER 2: something is near ─────────────────────────────────────── */

const PULSE = (degrees) => degrees.flatMap((deg, i) =>
  degSeq(`${deg} ${deg}`, { ...LOW, step: 2, d: 1.2, t0: i * 4, v: 0.45 }));

const HEART = [
  ...every(4, 32, 'tom', { v: 0.35, d: 0.2 }),
  ...every(4, 32, 'tom', { v: 0.22, d: 0.2, t0: 2.5 }),
];

/* ── LAYER 3: the fight ─────────────────────────────────────────────── */

// The hook's own shape, halved into eighths and driven — the melody you
// were humming a moment ago, now chasing you.
const DRIVE_A = [
  ...degSeq('5 8 10 12 15 12 10 8', { ...KEY, step: 0.5, v: 0.62 }),      // I
  ...degSeq('6 8 10 13 15 13 10 8', { ...KEY, step: 0.5, t0: 4, v: 0.6 }),  // vi
  ...degSeq('4 8 11 13 15 13 11 8', { ...KEY, step: 0.5, t0: 8, v: 0.62 }), // IV
  ...degSeq('5 8 10 12 15 12 10 8', { ...KEY, step: 0.5, t0: 12, v: 0.64 }),// I
  ...degSeq('2 6 9 11 13 11 9 6', { ...KEY, step: 0.5, t0: 16, v: 0.6 }),   // ii
  ...degSeq('5 9 12 14 12 9 12 14', { ...KEY, step: 0.5, t0: 20, v: 0.62 }),// V
  ...degSeq('5 9 12 14 15 14 12 9', { ...KEY, step: 0.5, t0: 24, v: 0.64 }),// V
  ...degSeq('1 8 10 12 15 12 10 8', { ...KEY, step: 0.5, t0: 28, v: 0.66 }),// I
];

const KIT = [
  ...every(2, 32, 'kick', { v: 0.55, d: 0.2 }),
  ...every(1, 32, 'hat', { v: 0.3, d: 0.1, t0: 0.5 }),
  ...every(8, 32, 'hatO', { v: 0.32, d: 0.15, t0: 7 }),
];

/* ── LAYER 4: the herald ────────────────────────────────────────────── */

// One bell, saying the hook plainly over the whole storm. When a boss
// arrives, the theme does not vanish — it gets LOUDER than the boss.
const HERALD = [
  ...quote(ROAD_HOOK, { ...KEY, step: 2, v: 0.38 }),
  ...quote(ROAD_ANSWER, { ...KEY, step: 2, t0: 16, v: 0.34 }),
];

/* ── THE SONG ───────────────────────────────────────────────────────── */

export const OVERWORLD_SONG = {
  bpm: 100,
  beatsPerBar: 4,
  gain: 0.86,
  fx: { delayBeats: 0.75, delayFb: 0.3, delayWet: 0.22 },
  sections: [
    { name: 'intro', bars: 2 },
    { name: 'A', bars: 8 },
    { name: 'B', bars: 8 },
  ],
  loop: 'A',                      // the intro opens the world once, then never again
  tracks: [
    /* ---- always there: the ground the theme stands on ---- */
    {
      id: 'pad', instrument: 'warmpad', gain: 0.46, send: 0.35,
      patterns: {
        intro: degProg([1, 5], { ...KEY, beatsEach: 4, v: 0.45 }),
        A: degProg(CHORDS_A, { ...KEY, beatsEach: 4, v: 0.48 }),
        B: degProg(CHORDS_B, { ...KEY, beatsEach: 4, v: 0.48 }),
      },
    },
    {
      id: 'bass', instrument: 'softbass', gain: 0.52,
      patterns: {
        intro: degSeq('1 5', { ...LOW, step: 4, d: 3.4, v: 0.55 }),
        A: BASS_A, B: BASS_B,
      },
    },

    /* ---- daylight ---- */
    {
      id: 'lead-day', instrument: 'ocarina', gain: 0.78, pan: -0.12, send: 0.35,
      daypart: 'day',
      patterns: { A: MELODY_A, B: MELODY_B },
    },
    {
      id: 'ripple-day', instrument: 'harp', gain: 0.5, pan: 0.28, send: 0.4,
      daypart: 'day', until: 2,           // steps aside when a fight starts
      patterns: { A: RIPPLE_A, B: RIPPLE_B },
    },
    {
      id: 'shaker-day', instrument: 'perc', gain: 0.3,
      daypart: 'day', until: 2,
      patterns: {
        A: every(4, 32, 'shk', { v: 0.32, d: 0.12, t0: 2 }),
        B: [...every(4, 32, 'shk', { v: 0.34, d: 0.12, t0: 2 }),
          ...every(2, 32, 'hat', { v: 0.22, d: 0.08, t0: 1.5 })],
      },
    },

    /* ---- nightfall ---- */
    {
      id: 'lead-night', instrument: 'musicbox', gain: 0.72, pan: -0.08, send: 0.42,
      daypart: 'night',
      patterns: {
        intro: quote(MEADOW_RISE, { ...KEY, step: 1, t0: 4, v: 0.5 }),
        A: NIGHT_A, B: NIGHT_B,
      },
    },
    {
      id: 'chimes-night', instrument: 'bell', gain: 0.4, pan: 0.22, send: 0.5,
      daypart: 'night',
      patterns: { A: CHIMES_A, B: CHIMES_B },
    },
    {
      id: 'glow-night', instrument: 'warmpad', gain: 0.34, send: 0.45,
      daypart: 'night',
      patterns: {
        A: degProg(CHORDS_A, { ...GLOW, beatsEach: 8, v: 0.4 }).filter((e) => e.t < 32),
        B: degProg(CHORDS_B, { ...GLOW, beatsEach: 8, v: 0.4 }).filter((e) => e.t < 32),
      },
    },

    /* ---- layer 2: alert ---- */
    {
      id: 'pulse', instrument: 'softbass', gain: 0.34, layer: 2,
      patterns: { A: PULSE(CHORDS_A), B: PULSE(CHORDS_B) },
    },
    {
      id: 'heart', instrument: 'perc', gain: 0.3, layer: 2,
      patterns: { A: HEART, B: HEART },
    },

    /* ---- layer 3: combat ---- */
    {
      id: 'drive', instrument: 'pluck', gain: 0.44, pan: 0.15, send: 0.2, layer: 3,
      patterns: { A: DRIVE_A, B: DRIVE_A },
    },
    {
      id: 'kit', instrument: 'perc', gain: 0.42, layer: 3,
      patterns: { A: KIT, B: KIT },
    },

    /* ---- layer 4: boss ---- */
    {
      id: 'herald', instrument: 'bell', gain: 0.36, send: 0.45, layer: 4,
      patterns: { A: HERALD, B: HERALD },
    },
  ],
};

/**
 * A quieter cut of the same theme for the world map / menus: the same
 * stems, no combat layers. Kept as a derived object so the tune can
 * never drift between the two places it plays.
 */
export const OVERWORLD_CALM_SONG = {
  ...OVERWORLD_SONG,
  gain: 0.78,
  tracks: OVERWORLD_SONG.tracks.filter((t) => (t.layer ?? 1) === 1),
};
