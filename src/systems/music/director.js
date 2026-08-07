/**
 * The music director — owns which song plays, crossfades between
 * songs, and ducks the score under victory/defeat stingers.
 *
 * Each playing song gets: a songGain under the music bus, per-track
 * gain+pan nodes, instrument instances, a shared feedback-delay FX
 * send, and its own scheduler. Crossfades ramp song gains; two
 * schedulers briefly overlap, which is fine.
 *
 * INTENSITY (v2): a track may declare `layer: 2` or `layer: 3`, meaning
 * "silent until the fight reaches that intensity". setSongIntensity()
 * ramps those tracks in and leans on the core tracks, so a boss phase
 * change is something a child HEARS — the drums double, a counter-line
 * appears — not just something the screen flashes about. Intensity is
 * a property of the director, not of the song, so the same nine boss
 * scores serve all three phases without a second copy of the data.
 */

import { getCtx, getMusicBus, unlockAudio } from './audioGraph.js';
import { createInstrument } from './instruments.js';
import { buildTimeline, beatsToSec } from './songCursor.js';
import { createScheduler } from './scheduler.js';
import { noteHz, DRUM_KEYS } from './theory.js';
import { getSong, hasSong } from './songs/index.js';

let _current = null;      // { key, song, songGain, trackGains, scheduler, teardown }
let _pendingKey = null;   // requested while the context was suspended
let _visibilityHooked = false;
let _intensity = 1;       // 1..MAX_INTENSITY — boss phase, musically

/** Highest intensity a song can be driven to (mirrors MAX_PHASE). */
export const MAX_INTENSITY = 3;

/**
 * How hard the always-on tracks lean in at each intensity. Small on
 * purpose: the audible jump must come from the layer tracks arriving,
 * not from the whole mix getting louder (which just sounds like a
 * volume bug and fights the limiter).
 */
const CORE_LIFT = [1, 1.08, 1.16];

/** Target gain for one track at one intensity. Silent above its layer. */
function trackTargetGain(track, level) {
  const layer = track.layer ?? 1;
  if (layer > level) return 0.0001;
  const base = track.gain ?? 0.8;
  // Layer tracks arrive at their own written balance; core tracks lift.
  return layer > 1 ? base : base * (CORE_LIFT[level - 1] ?? 1);
}

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

  const trackGains = [];
  const instruments = song.tracks.map((track) => {
    const trackGain = ctx.createGain();
    trackGain.gain.value = trackTargetGain(track, _intensity);
    trackGains.push(trackGain);
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
    trackGains,
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
  _current = {
    key, song, songGain: graph.songGain, trackGains: graph.trackGains,
    scheduler, teardown: graph.teardown,
  };
}

/**
 * Drive the live score to an intensity (1..3). Boss phase changes call
 * this: layer-2/3 tracks fade in over `fadeSec` and never fade back out
 * within a fight, because escalation in a boss fight is one-way.
 *
 * Safe to call with no song playing — the level is remembered and
 * applied to whatever starts next, which is what makes a mid-phase
 * scene reload sound right.
 */
export function setSongIntensity(level, { fadeSec = 1.2 } = {}) {
  const want = Math.max(1, Math.min(MAX_INTENSITY, level | 0));
  _intensity = want;
  if (!_current?.trackGains) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  _current.song.tracks.forEach((track, i) => {
    const g = _current.trackGains[i];
    if (!g) return;
    const target = trackTargetGain(track, want);
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(target, now + fadeSec);
    } catch { /* context gone */ }
  });
}

/** Current intensity — exported for tests and for scene restores. */
export function getSongIntensity() { return _intensity; }

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
  // A new piece always opens at rest. Without this a boss fight that
  // ended in phase 3 would hand its intensity to the overworld theme.
  _intensity = 1;
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
