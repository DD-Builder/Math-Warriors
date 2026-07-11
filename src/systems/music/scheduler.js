/**
 * Lookahead scheduler — the metronome of the music engine.
 *
 * Ticks every ~25ms and schedules every event whose absolute time
 * falls inside [horizon, now + lookahead), each exactly once. The
 * clock and the event sink are injected so the whole thing unit-tests
 * with a fake clock and an array; production passes the AudioContext
 * clock and instrument voices.
 *
 * Background tabs throttle setInterval — on visibility loss we pause,
 * and on return we skip the horizon forward rather than burst-play
 * the missed music.
 */

import { beatsToSec, secToBeats, eventsBetween } from './songCursor.js';

export function createScheduler({ clock, onEvent, tickMs = 25, lookaheadSec = 0.12, setIntervalFn, clearIntervalFn }) {
  const _setInterval = setIntervalFn || ((fn, ms) => setInterval(fn, ms));
  const _clearInterval = clearIntervalFn || ((id) => clearInterval(id));

  let timer = null;
  let timeline = null;
  let startAtSec = 0;
  let horizonBeat = 0;

  function tick() {
    if (!timeline) return;
    const now = clock.now();
    const targetSec = now + lookaheadSec - startAtSec;
    if (targetSec < 0) return;
    const targetBeat = secToBeats(targetSec, timeline.bpm);
    if (targetBeat <= horizonBeat) return;
    for (const ev of eventsBetween(timeline, horizonBeat, targetBeat)) {
      const when = startAtSec + beatsToSec(ev.absBeat, timeline.bpm);
      onEvent(when, ev);
    }
    horizonBeat = targetBeat;
  }

  return {
    start(tl, atSec) {
      this.stop();
      timeline = tl;
      startAtSec = atSec != null ? atSec : clock.now();
      horizonBeat = 0;
      timer = _setInterval(tick, tickMs);
      tick();
    },
    stop() {
      if (timer != null) { _clearInterval(timer); timer = null; }
      timeline = null;
    },
    /** Skip over a gap (e.g. tab was hidden) without replaying it. */
    resync() {
      if (!timeline) return;
      horizonBeat = Math.max(horizonBeat, secToBeats(clock.now() - startAtSec, timeline.bpm));
    },
    isRunning() { return timer != null; },
    _tick: tick, // exposed for tests
  };
}
