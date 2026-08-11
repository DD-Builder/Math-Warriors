/**
 * ADAPTIVE SCORE LOGIC — pure, no Web Audio, no DOM.
 *
 * The director owns gain nodes and timers; this file owns every DECISION
 * the director makes, so all of it is testable with node:test.
 *
 * Three ideas live here:
 *
 * 1. LAYERS. A song is not a track you switch to — it is a stack of
 *    stems that fade in and out. Each track declares the intensity it
 *    belongs to (`layer`), the intensity it steps aside for (`until`),
 *    and the time of day it belongs to (`daypart`). resolveTrackGain()
 *    turns (track, intensity, daypart) into one number, and the director
 *    just ramps every track to whatever that number says. Every mood in
 *    the game is therefore the SAME piece of music, re-balanced — you
 *    never hear a cut, only the woodwinds leaving and the drums arriving.
 *
 * 2. MUSICAL TIME. A crossfade that starts the instant a monster spots
 *    you sounds like a bug. planTransition() converts "now" into "the
 *    downbeat of the next bar" (or the next phrase, for slow ambient
 *    moves like dusk) and hands back the exact number of seconds to
 *    wait. Changes land on the beat, never in the middle of a phrase.
 *
 * 3. RESTRAINT. createEncouragementWatcher() decides when the score is
 *    allowed to say "you're doing fine" — after three misses, warmly,
 *    and then not again until the player has had a real chance. Music
 *    that comments on every mistake is music that mocks.
 */

import { tonicPc, semitonesBetween, degreeToSemitone, SCALES } from './motif.js';

/** Exponential ramps cannot reach 0; this is our audible silence. */
export const SILENT = 0.0001;

/**
 * The four moods, in order. Boss phases already call setSongIntensity
 * with 1/2/3, and those numbers mean exactly what they always meant —
 * BOSS(4) is a new top step the overworld theme can climb to, not a
 * renumbering of anything that already shipped.
 */
export const INTENSITY = { CALM: 1, ALERT: 2, COMBAT: 3, BOSS: 4 };
export const MAX_INTENSITY = 4;

export const DAYPARTS = ['day', 'dusk', 'night'];

/**
 * How hard the always-on tracks lean in at each intensity. Deliberately
 * small: the audible jump must come from stems ARRIVING, not from the
 * whole mix getting louder (which just sounds like a volume bug and
 * fights the master limiter).
 */
export const CORE_LIFT = [1, 1.06, 1.13, 1.18];

/** Clamp an arbitrary caller value into a real intensity step. */
export function clampIntensity(level) {
  const n = Math.trunc(Number(level) || 0);
  return Math.max(1, Math.min(MAX_INTENSITY, n));
}

/** Accepts 'combat' | 'COMBAT' | 3 and returns 3. */
export function toIntensity(value) {
  if (typeof value === 'string') {
    const named = INTENSITY[value.toUpperCase()];
    if (named) return named;
  }
  return clampIntensity(value);
}

/**
 * How present a track is at a given time of day.
 *   undefined → 1 always (the core: bass, pads, the tune itself)
 *   'day'     → full in daylight, half at dusk, gone at night
 *   'night'   → the mirror image
 * Dusk is the interesting one: both voicings sound at half strength, so
 * the bright lead and the music box overlap for the whole golden hour
 * instead of one replacing the other at a hard boundary.
 */
export function daypartWeight(trackDaypart, daypart) {
  if (!trackDaypart) return 1;
  if (daypart === 'dusk') return 0.5;
  return trackDaypart === daypart ? 1 : 0;
}

/**
 * THE ONE RULE. Everything the mixer does is this function.
 *
 * @param {object} track  a song track: { gain, layer, until, daypart }
 * @param {object} state  { intensity, daypart }
 * @returns {number} target gain — SILENT means "not part of this mood"
 */
export function resolveTrackGain(track, { intensity = 1, daypart = 'day' } = {}) {
  if (!track) return SILENT;
  const level = clampIntensity(intensity);
  const layer = track.layer ?? 1;
  // Not unlocked yet: a combat stem during a quiet walk.
  if (layer > level) return SILENT;
  // Steps aside once things get serious: the daydreaming harp has no
  // business ringing over a boss.
  if (track.until != null && level > track.until) return SILENT;
  const weight = daypartWeight(track.daypart, daypart);
  if (weight <= 0) return SILENT;
  const base = track.gain ?? 0.8;
  const lift = layer === 1 ? (CORE_LIFT[level - 1] ?? 1) : 1;
  return Math.max(SILENT, base * lift * weight);
}

/** The whole mix at once — handy for tests and for a debug overlay. */
export function resolveMix(tracks, state) {
  return (tracks || []).map((t) => resolveTrackGain(t, state));
}

/** True when a track is audible in this state (above the silence floor). */
export function isAudible(track, state) {
  return resolveTrackGain(track, state) > SILENT;
}

/* ── MUSICAL TIME ───────────────────────────────────────────────────── */

/** Beats in one unit of each quantisation grid. */
export function gridBeats(quantize, beatsPerBar = 4, phraseBars = 4) {
  switch (quantize) {
    case 'immediate': return 0;
    case 'beat': return 1;
    case 'half': return Math.max(1, beatsPerBar / 2);
    case 'phrase': return beatsPerBar * phraseBars;
    case 'bar':
    default: return beatsPerBar;
  }
}

/**
 * The next grid line strictly after `nowBeat + minLeadBeats`.
 * The lead-in exists because a ramp scheduled 3ms from now is a click,
 * not a transition — we always aim at a boundary we can still reach.
 */
export function nextBoundaryBeat(nowBeat, grid, minLeadBeats = 0.25) {
  const from = Math.max(0, nowBeat) + minLeadBeats;
  if (!(grid > 0)) return Math.max(0, nowBeat);
  const k = Math.ceil(from / grid - 1e-9);
  return k * grid;
}

const COARSE_TO_FINE = ['phrase', 'bar', 'half', 'beat', 'immediate'];

/**
 * Where and when a change should happen.
 *
 * Ask for 'phrase' and you will get the top of the next phrase — unless
 * that is further away than `maxWaitBeats`, in which case the plan walks
 * down the grid (phrase → bar → half → beat → immediate) until it finds
 * one it can hit in time. That is the whole trick behind "musical but
 * still responsive": a dusk change can afford to wait eight bars, a
 * monster lunging at you cannot wait more than one.
 *
 * @returns {{quantize, atBeat, waitBeats, waitSec, fadeSec, fadeBeats}}
 */
export function planTransition({
  nowBeat = 0,
  beatsPerBar = 4,
  bpm = 100,
  quantize = 'bar',
  phraseBars = 4,
  fadeBeats = 2,
  maxWaitBeats = Infinity,
  minLeadBeats = 0.25,
} = {}) {
  const startIdx = Math.max(0, COARSE_TO_FINE.indexOf(quantize));
  let chosen = COARSE_TO_FINE[startIdx];
  let atBeat = nextBoundaryBeat(nowBeat, gridBeats(chosen, beatsPerBar, phraseBars), minLeadBeats);
  for (let i = startIdx; i < COARSE_TO_FINE.length; i++) {
    const q = COARSE_TO_FINE[i];
    const at = nextBoundaryBeat(nowBeat, gridBeats(q, beatsPerBar, phraseBars), minLeadBeats);
    chosen = q;
    atBeat = at;
    if (at - nowBeat <= maxWaitBeats) break;
  }
  const waitBeats = Math.max(0, atBeat - nowBeat);
  const perBeat = 60 / (bpm || 100);
  return {
    quantize: chosen,
    atBeat,
    waitBeats,
    waitSec: waitBeats * perBeat,
    fadeBeats,
    fadeSec: Math.max(0.05, fadeBeats * perBeat),
  };
}

/**
 * THE WHOLE MOOD CHANGE, as data: which stems move, from what to what,
 * and at which beat. The director's only remaining job is to hand each
 * `to` value to an AudioParam ramp starting at `atBeat`.
 *
 * Keeping this pure is what lets a test assert the interesting thing —
 * "walking from exploring into a fight brings in the riff and the kit,
 * takes the harp away, leaves the tune alone, and does all of it on a
 * bar line" — without a browser anywhere near it.
 *
 * @param {object} song  a song with a `tracks` array
 * @param {object} opts  { nowBeat, from, to, quantize, fadeBeats, maxWaitBeats }
 */
export function planMixChange(song, {
  nowBeat = 0, from = null, to = {}, quantize = 'bar', fadeBeats = 2, maxWaitBeats,
} = {}) {
  const plan = planTransition({
    nowBeat,
    beatsPerBar: song?.beatsPerBar || 4,
    bpm: song?.bpm || 100,
    quantize, fadeBeats, maxWaitBeats,
  });
  const changes = (song?.tracks || []).map((track, index) => {
    const target = resolveTrackGain(track, to);
    const start = from ? resolveTrackGain(track, from) : null;
    return {
      index,
      id: track.id,
      from: start,
      to: target,
      arriving: start != null && start <= SILENT && target > SILENT,
      leaving: start != null && start > SILENT && target <= SILENT,
      changed: start == null || Math.abs(start - target) > 1e-9,
    };
  });
  return { ...plan, changes };
}

/**
 * A biome-to-biome crossfade, measured in BARS of the outgoing song so
 * the two pieces overlap for a whole number of bars and their downbeats
 * line up while both are audible. The incoming song starts on the same
 * boundary the outgoing one begins its fade, so nothing is ever heard
 * mid-phrase against nothing.
 */
export function planBiomeCrossfade({
  nowBeat = 0,
  beatsPerBar = 4,
  fromBpm = 100,
  toBpm = 100,
  bars = 2,
  maxWaitBeats = null,
} = {}) {
  const plan = planTransition({
    nowBeat,
    beatsPerBar,
    bpm: fromBpm,
    quantize: 'bar',
    fadeBeats: bars * beatsPerBar,
    maxWaitBeats: maxWaitBeats ?? beatsPerBar,
  });
  const overlapSec = plan.fadeSec;
  return {
    ...plan,
    // The outgoing piece takes slightly longer to leave than the new one
    // takes to arrive: an equal-power-ish overlap where the incoming
    // theme is already establishing itself before the old one is gone.
    fadeOutSec: overlapSec,
    fadeInSec: overlapSec * 0.75,
    startInSec: plan.waitSec,
    bars,
    toBeatSec: 60 / (toBpm || 100),
  };
}

/* ── STAYING IN KEY ─────────────────────────────────────────────────── */

function pcSet(tonic, mode) {
  const base = tonicPc(tonic);
  const scale = SCALES[mode] || SCALES.maj;
  return new Set(scale.map((s) => (base + s) % 12));
}

function triadPcs(tonic, mode) {
  const base = tonicPc(tonic);
  return [1, 3, 5].map((d) => (base + degreeToSemitone(d, mode)) % 12);
}

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * How to get from one biome's key to the next without it sounding like
 * someone changed the CD.
 *
 * Returns the PIVOT TONES — pitch classes that belong to the outgoing
 * tonic chord AND the incoming key. Hold those under the crossfade and
 * the ear hears one chord being re-interpreted rather than two pieces
 * colliding. (C major → A minor shares all three notes and the join is
 * invisible; C major → D minor shares two; a tritone move shares none,
 * and we fall back to the incoming dominant, which at least *leads*
 * somewhere instead of clashing.)
 */
export function planKeyBridge(fromTonic, fromMode, toTonic, toMode) {
  const fromTriad = triadPcs(fromTonic, fromMode);
  const toScale = pcSet(toTonic, toMode);
  const toTriad = new Set(triadPcs(toTonic, toMode));
  const shared = fromTriad.filter((pc) => toScale.has(pc));
  // Prefer tones that are structural in BOTH keys.
  const strong = shared.filter((pc) => toTriad.has(pc));
  let pivots = strong.length ? strong : shared;
  let kind = strong.length ? 'common-chord' : shared.length ? 'common-tone' : 'dominant';
  if (!pivots.length) {
    // No shared tone at all: lean on the incoming dominant so the bridge
    // pulls toward the new key instead of just sitting on a clash.
    const base = tonicPc(toTonic);
    pivots = [(base + 7) % 12, (base + degreeToSemitone(3, toMode)) % 12];
  }
  return {
    kind,
    pivots: pivots.map((pc) => PC_NAMES[pc]),
    semis: semitonesBetween(fromTonic, toTonic),
    shared: shared.length,
  };
}

/* ── DAY / NIGHT ────────────────────────────────────────────────────── */

/**
 * World clock (0 = midnight, 0.5 = noon) → daypart.
 * Dawn and dusk both return 'dusk' because they sound the same: the
 * music box and the bright lead sharing the sky for a while.
 */
export function daypartFromClock(t01) {
  let t = Number(t01);
  if (!Number.isFinite(t)) return 'day';
  t = ((t % 1) + 1) % 1;
  if (t < 0.22 || t >= 0.84) return 'night';
  if (t < 0.30 || t >= 0.72) return 'dusk';
  return 'day';
}

/** Wall-clock convenience for anything that thinks in hours (0-23). */
export function daypartFromHour(hour) {
  return daypartFromClock((Number(hour) || 0) / 24);
}

/** Dusk moves slowly; the drop into night should not feel like a switch. */
export function daypartFadeSec(from, to) {
  if (from === to) return 0;
  const bigMove = (from === 'day' && to === 'night') || (from === 'night' && to === 'day');
  return bigMove ? 8 : 5;
}

/* ── RESTRAINT: WHEN TO SAY SOMETHING KIND ──────────────────────────── */

/**
 * Watches the answer stream and decides when the score should offer
 * warmth. The rules, in plain words:
 *
 *   - Three wrong in a row: play the gentle phrase. Once.
 *   - Still stuck three later: play it again — the same phrase, so it
 *     reads as "I'm still here", not as an escalating alarm.
 *   - Any correct answer clears the slate completely.
 *
 * It never fires on a single mistake, never fires twice in a row, and
 * has no "you failed" state — the only thing it can ever emit is
 * 'encourage'.
 */
export function createEncouragementWatcher({ threshold = 3, repeatEvery = 3 } = {}) {
  let streak = 0;
  let firedAt = 0;
  return {
    /** @returns {'encourage'|null} */
    record(correct) {
      if (correct) {
        streak = 0;
        firedAt = 0;
        return null;
      }
      streak += 1;
      if (streak < threshold) return null;
      if (firedAt === 0 || streak - firedAt >= repeatEvery) {
        firedAt = streak;
        return 'encourage';
      }
      return null;
    },
    reset() { streak = 0; firedAt = 0; },
    get streak() { return streak; },
  };
}

/**
 * Discovery chimes are lovely once and grating six times in ten seconds
 * (a secret grove usually hands you three collectibles at arm's length).
 * This gate lets the first one through and folds the rest into it.
 */
export function createCueGate({ minGapMs = 2500 } = {}) {
  let last = -Infinity;
  return {
    allow(nowMs) {
      const t = Number(nowMs) || 0;
      if (t - last < minGapMs) return false;
      last = t;
      return true;
    },
    reset() { last = -Infinity; },
  };
}
