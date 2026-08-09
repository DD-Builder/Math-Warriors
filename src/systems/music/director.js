/**
 * The music director — owns which song plays, crossfades between
 * songs, and ducks the score under victory/defeat stingers.
 *
 * Each playing song gets: a songGain under the music bus, per-track
 * gain+pan nodes, instrument instances, a shared feedback-delay FX
 * send, and its own scheduler. Crossfades ramp song gains; two
 * schedulers briefly overlap, which is fine.
 *
 * ── ADAPTIVE SCORE (v3) ─────────────────────────────────────────────
 * A song is not a track — it is a stack of stems. Every track declares
 * the intensity it belongs to (`layer`), the intensity it steps aside
 * for (`until`) and the time of day it belongs to (`daypart`), and the
 * director's only job in the mix is to ramp each track gain to whatever
 * adaptive.js → resolveTrackGain() says it should be. Exploring, near
 * danger, in combat and facing a boss are therefore the SAME piece of
 * music re-balanced; you never hear a cut, only instruments arriving
 * and leaving.
 *
 * Two things make that sound composed rather than computed:
 *
 *   MUSICAL TIMING. Nothing changes the instant the game asks. Every
 *   ramp is scheduled at the next bar line (or the next phrase, for a
 *   slow move like nightfall) using the song's own start time and BPM,
 *   with AudioParam automation — sample accurate, no timers involved.
 *   planTransition() will downgrade phrase → bar → beat → immediate if
 *   a caller can't afford to wait, so a monster lunging at you still
 *   gets an answer inside one bar.
 *
 *   KEY. Biome crossfades hold the pivot tones the two keys share (see
 *   planKeyBridge) underneath the overlap, so walking out of one realm
 *   and into another sounds like one piece of music modulating.
 *
 * Everything is still sample-free, still one AudioContext, and every
 * voice still routes through the song gain → music bus → master limiter.
 */

import { getCtx, getMusicBus, unlockAudio, isMuted } from './audioGraph.js';
import { createInstrument } from './instruments.js';
import { buildTimeline, beatsToSec, secToBeats } from './songCursor.js';
import { createScheduler } from './scheduler.js';
import { noteHz, DRUM_KEYS } from './theory.js';
import { getSong, hasSong } from './songs/index.js';
import {
  SILENT, INTENSITY, MAX_INTENSITY, DAYPARTS,
  resolveTrackGain, toIntensity,
  planMixChange, planBiomeCrossfade, planKeyBridge, daypartFadeSec,
} from './adaptive.js';
import { keyOf } from './songKeys.js';
import { keyBridgeCue } from './cues.js';

let _current = null;      // { key, song, songGain, trackGains, scheduler, startAtSec, teardown }
let _pendingKey = null;   // requested while the context was suspended
let _visibilityHooked = false;
let _intensity = 1;       // 1..MAX_INTENSITY — the mood, musically
let _daypart = 'day';
let _swapTimer = [];      // timers waiting on a bar line to start something

export { MAX_INTENSITY, INTENSITY };

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
  songGain.gain.value = SILENT;
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
    trackGain.gain.value = resolveTrackGain(track, { intensity: _intensity, daypart: _daypart });
    trackGains.push(trackGain);
    const out = trackGain;
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

/** One scheduler wired to one graph — shared by songs, stingers and cues. */
function makeScheduler(song, graph) {
  const ctx = getCtx();
  return createScheduler({
    clock: { now: () => ctx.currentTime },
    onEvent: (when, ev) => {
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
}

function startSong(key, fadeSec, songData = null) {
  const ctx = getCtx();
  const song = songData || getSong(key);
  if (!song) return;
  const graph = buildSongGraph(song);
  const timeline = buildTimeline(song);
  const scheduler = makeScheduler(song, graph);
  const startAtSec = ctx.currentTime + 0.06;
  scheduler.start(timeline, startAtSec);
  const now = ctx.currentTime;
  graph.songGain.gain.setValueAtTime(SILENT, now);
  graph.songGain.gain.linearRampToValueAtTime(song.gain ?? 0.9, now + Math.max(0.05, fadeSec));
  _current = {
    key, song, songGain: graph.songGain, trackGains: graph.trackGains,
    scheduler, startAtSec, teardown: graph.teardown,
  };
}

/* ── MUSICAL POSITION ───────────────────────────────────────────────── */

/**
 * Where the live song is, in beats since it started. Unrolled (it keeps
 * counting up across loops), which is exactly what the bar maths wants:
 * beat 36 of an 8-bar loop is still a downbeat.
 */
export function songBeatNow() {
  if (!_current) return 0;
  try {
    return Math.max(0, secToBeats(getCtx().currentTime - _current.startAtSec, _current.song.bpm));
  } catch { return 0; }
}

/**
 * Ramp one AudioParam to `target`, starting exactly at `atSec`.
 * Uses automation rather than a timer so the change lands on the beat
 * even if the main thread is busy drawing a boss.
 */
function rampAt(param, target, atSec, fadeSec) {
  try {
    const now = getCtx().currentTime;
    const start = Math.max(now, atSec);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (start > now) param.setValueAtTime(param.value, start);
    param.linearRampToValueAtTime(Math.max(SILENT, target), start + Math.max(0.02, fadeSec));
  } catch { /* context gone */ }
}

/**
 * Re-balance every track to the current (intensity, daypart), on the
 * grid. planMixChange decides everything; this only pushes the numbers
 * into AudioParams.
 */
function applyMix({ quantize = 'bar', fadeBeats = 2, maxWaitBeats = undefined } = {}) {
  if (!_current?.trackGains) return null;
  const plan = planMixChange(_current.song, {
    nowBeat: songBeatNow(),
    to: { intensity: _intensity, daypart: _daypart },
    quantize, fadeBeats, maxWaitBeats,
  });
  const atSec = _current.startAtSec + beatsToSec(plan.atBeat, _current.song.bpm);
  for (const change of plan.changes) {
    const g = _current.trackGains[change.index];
    if (g) rampAt(g.gain, change.to, atSec, plan.fadeSec);
  }
  return plan;
}

/* ── INTENSITY ──────────────────────────────────────────────────────── */

/**
 * Drive the live score to an intensity.
 *
 *   1 CALM    exploring — the theme, as written
 *   2 ALERT   something is near — a low pulse joins, the daydreams thin
 *   3 COMBAT  a driving riff and a real kit arrive
 *   4 BOSS    the theme itself is heralded over the top of everything
 *
 * Boss phase changes have called this with 1/2/3 since the boss audio
 * pass and those numbers still mean exactly what they meant — 4 is a
 * new step above them, not a renumbering.
 *
 * The change is scheduled on the next BAR LINE, never mid-phrase. Pass
 * `{ quantize: 'immediate' }` only for a hard cut (a scene ending).
 *
 * Safe to call with no song playing — the level is remembered and
 * applied to whatever starts next, which is what makes a mid-phase
 * scene reload sound right.
 *
 * @returns {object|null} the transition plan (for tests / debug overlay)
 */
export function setSongIntensity(level, { fadeSec = null, fadeBeats = 2, quantize = 'bar', maxWaitBeats } = {}) {
  const want = toIntensity(level);
  const rising = want > _intensity;
  _intensity = want;
  if (!_current?.trackGains) return null;
  const bpm = _current.song.bpm || 100;
  const beats = fadeSec != null ? (fadeSec * bpm) / 60 : fadeBeats;
  // Danger arriving must be heard promptly; danger leaving can take its
  // time. One bar of patience going up, up to a phrase coming down.
  const wait = maxWaitBeats ?? (rising ? (_current.song.beatsPerBar || 4) : undefined);
  return applyMix({ quantize, fadeBeats: beats, maxWaitBeats: wait });
}

/** Current intensity — exported for tests and for scene restores. */
export function getSongIntensity() { return _intensity; }

/* ── DAY / NIGHT ────────────────────────────────────────────────────── */

/**
 * Shift the instrumentation for the time of day. The bright lead and
 * the music box trade places over a whole PHRASE, not a bar: dusk should
 * feel like the light going, not like a channel being switched. Both
 * voicings sound at half strength while it is actually dusk.
 */
export function setDaypart(daypart, { fadeSec = null } = {}) {
  const want = DAYPARTS.includes(daypart) ? daypart : 'day';
  if (want === _daypart) return null;
  const from = _daypart;
  _daypart = want;
  if (!_current?.trackGains) return null;
  const bpm = _current.song.bpm || 100;
  const sec = fadeSec != null ? fadeSec : daypartFadeSec(from, want);
  return applyMix({ quantize: 'phrase', fadeBeats: (sec * bpm) / 60, maxWaitBeats: (_current.song.beatsPerBar || 4) * 4 });
}

export function getDaypart() { return _daypart; }

/* ── SONG LIFECYCLE ─────────────────────────────────────────────────── */

export function musicHasSong(key) { return hasSong(key); }

/** True while a song graph is live and scheduling notes. */
export function isSongPlaying() { return !!_current; }

/** The key of the song currently playing, or null. */
export function currentSongKey() { return _current?.key ?? null; }

export function playSong(key, { fadeSec = 0.8, keepIntensity = false } = {}) {
  hookVisibility();
  if (_current && _current.key === key) return;
  if (!hasSong(key)) return;
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    _pendingKey = key;
    unlockAudio();
    // resume() may complete async — retry once it does
    ctx.resume?.().then?.(() => {
      if (_pendingKey) { const k = _pendingKey; _pendingKey = null; playSong(k, { fadeSec, keepIntensity }); }
    });
    return;
  }
  cancelPendingSwap();
  stopSong({ fadeSec });
  // A new piece always opens at rest. Without this a boss fight that
  // ended in phase 3 would hand its intensity to the overworld theme.
  // (The daypart is a property of the WORLD, not the piece, so it rides
  // across song changes untouched.)
  if (!keepIntensity) _intensity = 1;
  startSong(key, fadeSec);
}

/**
 * Timers that are waiting on a bar line to START something (the incoming
 * biome, its key bridge). If anything else takes over the score in the
 * meantime — a battle, a scene change — these must not fire, or a piece
 * of music arrives a bar late over the top of whatever replaced it.
 *
 * The dying song's TEARDOWN timer is deliberately not in this set: it
 * must always run, or a silenced scheduler ticks forever.
 */
function cancelPendingSwap() {
  for (const t of _swapTimer) clearTimeout(t);
  _swapTimer.length = 0;
}

/**
 * BIOME CROSSFADE. Walk out of the garden and into the harbour and the
 * score should modulate, not restart.
 *
 * The swap is aligned to the outgoing song's next bar line so both
 * pieces' downbeats agree while they overlap, and the pivot tones the
 * two keys share are held underneath the join (planKeyBridge), which is
 * what stops a C-major theme and an A-minor theme sounding like two
 * different soundtracks fighting.
 *
 * @returns {object|null} the crossfade plan
 */
export function crossfadeToSong(key, { bars = 2, bridge = true } = {}) {
  hookVisibility();
  if (!hasSong(key)) return null;
  if (_current?.key === key) return null;
  if (!_current) { playSong(key, { fadeSec: 1.2, keepIntensity: true }); return null; }
  const ctx = getCtx();
  if (ctx.state === 'suspended') { playSong(key); return null; }

  const from = _current;
  const plan = planBiomeCrossfade({
    nowBeat: songBeatNow(),
    beatsPerBar: from.song.beatsPerBar || 4,
    fromBpm: from.song.bpm || 100,
    toBpm: getSong(key)?.bpm || 100,
    bars,
  });
  const atSec = from.startAtSec + beatsToSec(plan.atBeat, from.song.bpm || 100);
  const startIn = Math.max(0, atSec - ctx.currentTime) * 1000;

  cancelPendingSwap();

  // Hold the shared tones across the join.
  if (bridge) {
    const b = planKeyBridge(
      keyOf(from.key).tonic, keyOf(from.key).mode,
      keyOf(key).tonic, keyOf(key).mode,
    );
    if (b.pivots.length) {
      _swapTimer.push(setTimeout(
        () => playPhrase(keyBridgeCue(b.pivots, { bars: bars + 1 }), { duck: 1 }),
        startIn,
      ));
    }
  }

  // Old piece leaves on the bar line. Its teardown is unconditional.
  rampAt(from.songGain.gain, SILENT, atSec, plan.fadeOutSec);
  const dying = from;
  setTimeout(() => {
    try { dying.scheduler.stop(); dying.teardown(); } catch { /* gone */ }
  }, startIn + plan.fadeOutSec * 1000 + 200);

  // New piece arrives on the same bar line. Detach the old one from
  // _current immediately so a second request can't double-swap it.
  _current = null;
  _swapTimer.push(setTimeout(() => {
    if (_current) return;            // something else took over meanwhile
    startSong(key, plan.fadeInSec);
  }, startIn));
  return plan;
}

export function stopSong({ fadeSec = 0.5 } = {}) {
  cancelPendingSwap();
  if (!_current) return;
  const dying = _current;
  _current = null;
  const ctx = getCtx();
  const now = ctx.currentTime;
  try {
    dying.songGain.gain.cancelScheduledValues(now);
    dying.songGain.gain.setValueAtTime(dying.songGain.gain.value, now);
    dying.songGain.gain.linearRampToValueAtTime(SILENT, now + fadeSec);
  } catch { /* context gone */ }
  setTimeout(() => { dying.scheduler.stop(); dying.teardown(); }, fadeSec * 1000 + 150);
}

/* ── ONE-SHOT PHRASES ───────────────────────────────────────────────── */

/**
 * Duck the score and play a one-shot piece of song DATA over it — the
 * situational cues (discovery, victory, encouragement, floor fanfare,
 * key bridge) are all built at runtime in the key that is playing, so
 * they arrive as data rather than as registry keys.
 *
 * `duck` is how far the score drops while the phrase sounds: 1 = not at
 * all (the key bridge, which belongs inside the music), 0.1 = almost
 * out of the way (a floor fanfare, which IS the music for a moment).
 */
export function playPhrase(song, { duck = 0.2 } = {}) {
  if (!song?.tracks?.length) return null;
  const ctx = getCtx();
  if (ctx.state === 'suspended') return null;
  if (isMuted()) return null;
  const level = song.duck ?? duck;
  if (_current && level < 1) {
    const now = ctx.currentTime;
    const g = _current.songGain.gain;
    const restore = _current.song.gain ?? 0.9;
    const timeline0 = buildTimeline(song);
    const lenSec = beatsToSec(timeline0.totalBeats, song.bpm);
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(Math.max(SILENT, restore * level), now + 0.15);
      // Come back up under the cue's tail instead of snapping back after it.
      g.setValueAtTime(Math.max(SILENT, restore * level), now + lenSec * 0.55);
      g.linearRampToValueAtTime(restore, now + lenSec + 0.6);
    } catch { /* context gone */ }
  }
  const graph = buildSongGraph(song);
  // A cue is a fixed phrase: it plays at its written balance, ignoring
  // intensity and daypart (a discovery chime must not go silent at night).
  song.tracks.forEach((t, i) => {
    const g = graph.trackGains[i];
    if (g) g.gain.value = Math.max(SILENT, t.gain ?? 0.8);
  });
  const timeline = buildTimeline(song);
  const scheduler = makeScheduler(song, graph);
  scheduler.start(timeline, ctx.currentTime + 0.03);
  graph.songGain.gain.setValueAtTime(song.gain ?? 0.95, ctx.currentTime);
  const lenSec = beatsToSec(timeline.totalBeats, song.bpm) + 2.5;
  setTimeout(() => { scheduler.stop(); graph.teardown(); }, lenSec * 1000);
  return { lenSec };
}

/** Duck the score and play a one-shot registry piece (victory/defeat). */
export function playStinger(key) {
  if (!hasSong(key)) return;
  playPhrase(getSong(key), { duck: 0.12 });
}
