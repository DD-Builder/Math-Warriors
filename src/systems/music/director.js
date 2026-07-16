/**
 * The music director — owns which song plays, crossfades between
 * songs, and ducks the score under victory/defeat stingers.
 *
 * Each playing song gets: a songGain under the music bus, per-track
 * gain+pan nodes, instrument instances, a shared feedback-delay FX
 * send, and its own scheduler. Crossfades ramp song gains; two
 * schedulers briefly overlap, which is fine.
 */

import { getCtx, getMusicBus, unlockAudio } from './audioGraph.js';
import { createInstrument } from './instruments.js';
import { buildTimeline, beatsToSec } from './songCursor.js';
import { createScheduler } from './scheduler.js';
import { noteHz, DRUM_KEYS } from './theory.js';
import { getSong, hasSong } from './songs/index.js';

let _current = null;      // { key, songGain, scheduler, teardown }
let _pendingKey = null;   // requested while the context was suspended
let _visibilityHooked = false;

function hookVisibility() {
  if (_visibilityHooked || typeof document === 'undefined') return;
  _visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _current) _current.scheduler.resync();
  });
}

function buildSongGraph(song) {
  const ctx = getCtx();
  const songGain = ctx.createGain();
  songGain.gain.value = 0.0001;
  songGain.connect(getMusicBus());

  // Shared FX: feedback delay (cheap, musical). Reverb can come later.
  const fx = song.fx || {};
  const delay = ctx.createDelay(2);
  delay.delayTime.value = beatsToSec(fx.delayBeats ?? 0.75, song.bpm);
  const fbGain = ctx.createGain();
  fbGain.gain.value = fx.delayFb ?? 0.3;
  const wet = ctx.createGain();
  wet.gain.value = fx.delayWet ?? 0.25;
  delay.connect(fbGain); fbGain.connect(delay);
  delay.connect(wet); wet.connect(songGain);

  const instruments = song.tracks.map((track) => {
    const trackGain = ctx.createGain();
    trackGain.gain.value = track.gain ?? 0.8;
    let out = trackGain;
    if (track.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan;
      trackGain.connect(pan);
      pan.connect(songGain);
    } else {
      trackGain.connect(songGain);
    }
    const fxSend = (track.send ?? 0) > 0 ? (() => {
      const s = ctx.createGain();
      s.gain.value = track.send;
      s.connect(delay);
      return s;
    })() : null;
    return createInstrument(track.instrument, { out, fxSend });
  });

  return {
    songGain,
    instruments,
    teardown() {
      try { songGain.disconnect(); delay.disconnect(); fbGain.disconnect(); wet.disconnect(); } catch { /* gone */ }
    },
  };
}

function startSong(key, fadeSec) {
  const ctx = getCtx();
  const song = getSong(key);
  if (!song) return;
  const graph = buildSongGraph(song);
  const timeline = buildTimeline(song);
  const scheduler = createScheduler({
    clock: { now: () => ctx.currentTime },
    onEvent: (when, ev) => {
      const track = song.tracks[ev.trackIdx];
      const inst = graph.instruments[ev.trackIdx];
      if (!inst) return;
      const isDrum = DRUM_KEYS.has(ev.note);
      const freq = isDrum ? 0 : noteHz(ev.note);
      if (!isDrum && !freq) return;
      inst.play(when, {
        freq,
        note: ev.note,
        vel: ev.vel,
        durSec: beatsToSec(ev.durBeats, song.bpm),
      });
    },
  });
  scheduler.start(timeline, ctx.currentTime + 0.06);
  const now = ctx.currentTime;
  graph.songGain.gain.setValueAtTime(0.0001, now);
  graph.songGain.gain.linearRampToValueAtTime(song.gain ?? 0.9, now + fadeSec);
  _current = { key, songGain: graph.songGain, scheduler, teardown: graph.teardown };
}

export function musicHasSong(key) { return hasSong(key); }

/** True while a song graph is live and scheduling notes. */
export function isSongPlaying() { return !!_current; }

export function playSong(key, { fadeSec = 0.8 } = {}) {
  hookVisibility();
  if (_current && _current.key === key) return;
  if (!hasSong(key)) return;
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    _pendingKey = key;
    unlockAudio();
    // resume() may complete async — retry once it does
    ctx.resume?.().then?.(() => {
      if (_pendingKey) { const k = _pendingKey; _pendingKey = null; playSong(k, { fadeSec }); }
    });
    return;
  }
  stopSong({ fadeSec });
  startSong(key, fadeSec);
}

export function stopSong({ fadeSec = 0.5 } = {}) {
  if (!_current) return;
  const dying = _current;
  _current = null;
  const ctx = getCtx();
  const now = ctx.currentTime;
  try {
    dying.songGain.gain.cancelScheduledValues(now);
    dying.songGain.gain.setValueAtTime(dying.songGain.gain.value, now);
    dying.songGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
  } catch { /* context gone */ }
  setTimeout(() => { dying.scheduler.stop(); dying.teardown(); }, fadeSec * 1000 + 150);
}

/** Duck the score and play a one-shot piece on top (victory/defeat). */
export function playStinger(key) {
  if (!hasSong(key)) return;
  const ctx = getCtx();
  if (ctx.state === 'suspended') return;
  if (_current) {
    const now = ctx.currentTime;
    const g = _current.songGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.12, now + 0.15);
  }
  // Stingers are one-shot songs; reuse the song graph and let it end.
  const song = getSong(key);
  const graph = buildSongGraph(song);
  const timeline = buildTimeline(song);
  const scheduler = createScheduler({
    clock: { now: () => ctx.currentTime },
    onEvent: (when, ev) => {
      const inst = graph.instruments[ev.trackIdx];
      if (!inst) return;
      const isDrum = DRUM_KEYS.has(ev.note);
      const freq = isDrum ? 0 : noteHz(ev.note);
      if (!isDrum && !freq) return;
      inst.play(when, { freq, note: ev.note, vel: ev.vel, durSec: beatsToSec(ev.durBeats, song.bpm) });
    },
  });
  scheduler.start(timeline, ctx.currentTime + 0.03);
  graph.songGain.gain.setValueAtTime(song.gain ?? 0.95, ctx.currentTime);
  const lenSec = beatsToSec(timeline.totalBeats, song.bpm) + 2;
  setTimeout(() => { scheduler.stop(); graph.teardown(); }, lenSec * 1000);
}
