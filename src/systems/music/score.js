/**
 * THE SCORE — the one object the game talks to about music.
 *
 * Scenes should not know about gain nodes, bar lines or scale degrees.
 * They know things like "the player just found a secret", "there are
 * two monsters within ten metres", "it is now dusk", "they've missed
 * three in a row". This turns those facts into music.
 *
 * Every decision it makes is a pure function from adaptive.js; every
 * sound it makes goes through the director's existing graph. There is
 * no new audio path here and still not one audio file in the game.
 *
 * Typical wiring:
 *
 *     score.enterBiome('music/floor-2');     // crossfades, stays in key
 *     score.setThreat(0);                    // exploring
 *     score.setThreat(1);                    // a monster noticed you
 *     score.combat(true);                    // battle begins
 *     score.setClock(world.timeOfDay);       // 0..1, dusk shifts the voicing
 *     score.discovery();                     // found something
 *     score.answered(false);                 // …three of these = warmth
 *     score.floorComplete();
 */

import {
  playSong, crossfadeToSong, stopSong, playPhrase, setSongIntensity, setDaypart,
  currentSongKey, isSongPlaying, getSongIntensity, getDaypart,
} from './director.js';
import {
  INTENSITY, daypartFromClock, createEncouragementWatcher, createCueGate,
} from './adaptive.js';
import { keyOf, resolvedKeyOf } from './songKeys.js';
import { discoveryCue, victoryPhrase, encouragementCue, floorFanfare } from './cues.js';

const misses = createEncouragementWatcher({ threshold: 3, repeatEvery: 3 });
const discoveryGate = createCueGate({ minGapMs: 2500 });

let _threat = 0;          // 0 = nothing near, 1 = something is
let _inCombat = false;
let _isBoss = false;

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** The key of the music actually playing, so cues can resolve in it. */
function liveKey() {
  const k = currentSongKey();
  return k ? resolvedKeyOf(k) : { tonic: 'C', mode: 'maj' };
}

/** Threat + combat + boss collapse into one of the four moods. */
function mood() {
  if (_isBoss) return INTENSITY.BOSS;
  if (_inCombat) return INTENSITY.COMBAT;
  if (_threat > 0) return INTENSITY.ALERT;
  return INTENSITY.CALM;
}

function push(opts) {
  return setSongIntensity(mood(), opts);
}

export const score = {
  /* ── what is playing ── */

  /** Start a piece cold (scene boot). Use enterBiome while already playing. */
  play(key, opts) { playSong(key, opts); },

  /**
   * Walk into a new realm. Crossfades on the bar with the two keys'
   * shared tones held under the join, so the score modulates instead of
   * restarting. Falls back to a plain start if nothing is playing yet.
   */
  enterBiome(key, { bars = 2, bridge = true } = {}) {
    if (!isSongPlaying()) { playSong(key, { fadeSec: 1.6, keepIntensity: true }); return null; }
    return crossfadeToSong(key, { bars, bridge });
  },

  stop(opts) { stopSong(opts); },

  /* ── how tense it is ── */

  /**
   * How much danger is nearby. Anything above 0 lifts the score to
   * ALERT — a low pulse joins and the daydreaming voices thin out.
   * Pass the count of nearby monsters; the score only cares if it's zero.
   */
  setThreat(n) {
    const next = Math.max(0, Number(n) || 0);
    if ((next > 0) === (_threat > 0)) { _threat = next; return null; }
    _threat = next;
    return push();
  },

  /** Battle started / ended. */
  combat(on) {
    if (_inCombat === !!on) return null;
    _inCombat = !!on;
    if (!_inCombat) _isBoss = false;
    return push();
  },

  /** A boss fight — the top layer, where the theme itself is heralded. */
  boss(on) {
    if (_isBoss === !!on) return null;
    _isBoss = !!on;
    if (_isBoss) _inCombat = true;
    return push();
  },

  /**
   * Direct intensity, for callers that already think in phases (the boss
   * phase machine has driven 1/2/3 since the boss audio pass).
   */
  setIntensity(level, opts) { return setSongIntensity(level, opts); },

  /* ── time of day ── */

  /** World clock 0..1 (0 = midnight, 0.5 = noon). Safe to call every frame. */
  setClock(t01) {
    const want = daypartFromClock(t01);
    return want === getDaypart() ? null : setDaypart(want);
  },

  /** Force a daypart directly ('day' | 'dusk' | 'night'). */
  setDaypart(d, opts) { return setDaypart(d, opts); },

  /* ── moments ── */

  /** Found a secret. Rate-limited: a grove full of them chimes once. */
  discovery() {
    if (!discoveryGate.allow(nowMs())) return null;
    return playPhrase(discoveryCue(liveKey()));
  },

  /** A short phrase that resolves the key the score is currently in. */
  victory() { return playPhrase(victoryPhrase(liveKey())); },

  /** The floor is done. The only cue that says the whole main theme. */
  floorComplete() { return playPhrase(floorFanfare(liveKey())); },

  /**
   * Feed the answer stream. Three misses in a row and the score offers
   * warmth — in major, with no percussion, never twice in a row. A
   * correct answer clears the slate silently.
   */
  answered(correct) {
    const verdict = misses.record(!!correct);
    if (verdict !== 'encourage') return null;
    return playPhrase(encouragementCue(liveKey()));
  },

  /** Leaving a battle/floor: forget the streak so warmth doesn't carry over. */
  resetStreak() { misses.reset(); },

  /* ── introspection (debug overlay, tests) ── */

  state() {
    return {
      song: currentSongKey(),
      key: liveKey(),
      intensity: getSongIntensity(),
      daypart: getDaypart(),
      threat: _threat,
      combat: _inCombat,
      boss: _isBoss,
      missStreak: misses.streak,
    };
  },
};

export { keyOf };
export default score;
