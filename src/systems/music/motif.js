/**
 * THE MAIN THEME AND ITS MOTIF — "Nine Paper Roads".
 *
 * Everything in this file is pure data + pure functions. No Web Audio,
 * no DOM: it is safe to import from a node:test sibling.
 *
 * ── WHY A DEGREE DSL ────────────────────────────────────────────────
 * theory.js writes melodies as literal note names ('E5 G5 C6'). That is
 * perfect for one song in one key, and useless for a motif that has to
 * RECUR — the Odyssey trick, where the same six notes come back on a
 * music box at night, on a kalimba in the garden, as the last phrase of
 * a victory fanfare and as the tune the final boss steals from you.
 *
 * So the theme is stored once, as SCALE DEGREES:
 *
 *     ROAD_HOOK = '5 8 9 10~ 12 15~'      (sol do re mi— sol DO—)
 *
 * Degrees are key-agnostic AND mode-agnostic. Render it on C major and
 * you get G4 C5 D5 E5 G5 C6. Render the same string on D minor and the
 * hook arrives in D minor, correctly flattened, without a second copy
 * of the tune. That is what lets a biome crossfade, a victory cadence
 * and a boss quote all sing the same hook in whatever key is playing.
 *
 * ── THE HOOK ────────────────────────────────────────────────────────
 * Beats 0-7, quarter notes, with the peak held:
 *
 *     G4   C5   D5   E5——   G5   C6——
 *     sol  do   re   mi     sol  DO
 *
 * A rising fourth, three steps up, a third, a fourth to the octave. Six
 * notes, all singable by a six-year-old, and the last three (E–G–C) are
 * the original Paper Meadow rise the whole score was already built on —
 * so the new theme quotes the old one at its own peak.
 */

import { shift, DRUM_KEYS } from './theory.js';

/* ── SCALES ─────────────────────────────────────────────────────────── */

export const SCALES = {
  maj: [0, 2, 4, 5, 7, 9, 11],
  min: [0, 2, 3, 5, 7, 8, 10],   // natural minor — kinder than harmonic
  dor: [0, 2, 3, 5, 7, 9, 10],
  lyd: [0, 2, 4, 6, 7, 9, 11],
};

/** Semitones above the tonic for a 1-based scale degree (8 = octave). */
export function degreeToSemitone(degree, mode = 'maj') {
  const scale = SCALES[mode] || SCALES.maj;
  const i = Math.round(degree) - 1;
  const oct = Math.floor(i / 7);
  const idx = ((i % 7) + 7) % 7;
  return scale[idx] + 12 * oct;
}

/** degreeNote(3, 'C4', 'maj') → 'E4'; degreeNote(3, 'C4', 'min') → 'D#4' */
export function degreeNote(degree, tonic = 'C4', mode = 'maj', accidental = 0) {
  return shift(tonic, degreeToSemitone(degree, mode) + accidental);
}

/* ── DEGREE MINI-NOTATION ───────────────────────────────────────────── */

const DEG_TOKEN = /^([b#]?)(-?\d+)(~*)$/;

/**
 * Degree melody: degSeq('5 8 9 10~ 12 15~', { tonic: 'C4', mode: 'maj' })
 *
 *   '.'   one step of rest
 *   'b3'  flattened degree, '#4' raised
 *   '~'   each trailing tilde adds one more step of duration
 *
 * Returns theory.js-shaped events [{n, t, d, v}], ready to drop straight
 * into a song track pattern.
 */
export function degSeq(str, { tonic = 'C4', mode = 'maj', step = 1, d = null, v = 0.8, t0 = 0 } = {}) {
  const out = [];
  let t = t0;
  for (const tok of String(str).trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '.') { t += step; continue; }
    const m = DEG_TOKEN.exec(tok);
    if (!m) continue;                       // unreadable token = silence, never a crash
    const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    const steps = 1 + m[3].length;
    out.push({
      n: degreeNote(parseInt(m[2], 10), tonic, mode, acc),
      t,
      d: d != null ? d : step * steps,
      v,
    });
    t += step * steps;
  }
  return out;
}

/** The diatonic triad built on a scale degree — minor keys get minor chords free. */
export function diatonicTriad(degree, tonic = 'C4', mode = 'maj') {
  return [degree, degree + 2, degree + 4].map((d) => degreeNote(d, tonic, mode));
}

/**
 * Block-chord pad over a degree progression:
 * degProg([5, 1, 4, 1], { tonic: 'C4', mode: 'maj', beatsEach: 2 })
 */
export function degProg(degrees, { tonic = 'C4', mode = 'maj', beatsEach = 4, v = 0.5, t0 = 0 } = {}) {
  const out = [];
  degrees.forEach((deg, i) => {
    for (const n of diatonicTriad(deg, tonic, mode)) {
      out.push({ n, t: t0 + i * beatsEach, d: beatsEach, v });
    }
  });
  return out;
}

/* ── THE THEME ITSELF ───────────────────────────────────────────────── */

/**
 * THE HOOK. Six notes. This is the thing a child hums in the car.
 * Rendered on C major: G4 C5 D5 E5— G5 C6—
 */
export const ROAD_HOOK = '5 8 9 10~ 12 15~';

/** The hook's answer — it comes down the way it went up and lands home. */
export const ROAD_ANSWER = '13 12 10~ 9 10 8~';

/**
 * The lift: the same shape a step higher, climbing to the leading tone
 * and STOPPING there — the whole theme leans on that unfinished note.
 */
export const ROAD_LIFT = '6 9 10 11~ 13 14~';

/**
 * The return: breaks through to the top note of the tune (the octave the
 * hook only touched), then walks home for good. Nothing in the theme
 * goes higher than this and nothing lower than the pickup, which keeps
 * the whole tune inside an octave and a fourth — a range a child can
 * actually sing, and the same span as "Over the Rainbow".
 */
export const ROAD_RETURN = '15 14 12~ 13 12 8~';

/** The full 32-beat main theme, as degrees. Quarter notes, 8 bars. */
export const ROAD_THEME = `${ROAD_HOOK} ${ROAD_ANSWER} ${ROAD_LIFT} ${ROAD_RETURN}`;

/**
 * The three-note cell every earlier piece in the game already uses —
 * the Paper Meadow rise. It lives INSIDE the hook (degrees 10-12-15),
 * which is why the new theme sounds like it was always there.
 */
export const MEADOW_RISE = '10 12 15';

/** A short quotable tag: the last four notes of the answer, resolving home. */
export const ROAD_TAG = '9 10 12 8~';

/**
 * Render any of the above in a key: quote(ROAD_HOOK, { tonic: 'D4', mode: 'min' }).
 * Thin wrapper over degSeq, named for what it means at the call site.
 */
export function quote(figure, opts = {}) {
  return degSeq(figure, opts);
}

/* ── TRANSPOSITION ──────────────────────────────────────────────────── */

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class 0-11 of a tonic letter ('Eb' → 3). */
export function tonicPc(name) {
  const m = /^([A-G])([#b]?)/.exec(String(name).trim());
  if (!m) return 0;
  return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/**
 * Shortest signed distance between two keys, in semitones, folded into
 * [-5, 6]. Going C → A returns -3 (down a minor third), not +9: a score
 * that modulates should take the SHORT way, or the new biome arrives an
 * octave adrift from the one you just walked out of.
 */
export function semitonesBetween(fromTonic, toTonic) {
  let d = (tonicPc(toTonic) - tonicPc(fromTonic) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

/** Transpose an event list; drum "notes" (kick/hat/…) pass through untouched. */
export function transposeEvents(events, semis) {
  if (!semis) return events.map((e) => ({ ...e }));
  return events.map((e) => (DRUM_KEYS.has(e.n) ? { ...e } : { ...e, n: shift(e.n, semis) }));
}

/** Deep-copy a song with every pitched pattern transposed. */
export function transposeSong(song, semis) {
  if (!semis) return song;
  return {
    ...song,
    tracks: song.tracks.map((track) => ({
      ...track,
      patterns: Object.fromEntries(
        Object.entries(track.patterns || {}).map(([sec, evs]) => [sec, transposeEvents(evs, semis)]),
      ),
    })),
  };
}

/** Scale every velocity in an event list (night voicings, ghost echoes). */
export function veil(events, factor) {
  return events.map((e) => ({ ...e, v: Math.max(0.02, Math.min(1, (e.v ?? 0.8) * factor)) }));
}

/** Keep only the long notes — the skeleton of a melody, for chimes and pads. */
export function bones(events, minDur = 2) {
  return events.filter((e) => (e.d ?? 0.5) >= minDur).map((e) => ({ ...e }));
}
