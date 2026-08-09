/**
 * Procedural sound effects and ambient music using Web Audio API.
 *
 * NO AUDIO FILES EXIST IN THIS GAME. Every sound a child hears is
 * synthesised here, at play time, out of oscillators and one shared
 * noise buffer.
 *
 * This module is the RENDERER. The sound design itself — what a step on
 * wet sand is made of, how many degrees a coin chain climbs, why the
 * wrong-answer sound ends on a lift — lives in ./sfxLibrary.js as pure
 * data, so it can be unit-tested without an AudioContext. Here we turn
 * a plan into nodes and hang them off the sfx bus.
 *
 * ROUTING LAW: everything goes
 *     voice -> [filter] -> gain -> [panner] -> sfxBus -> master -> limiter
 * with an optional tap into the shared shimmer send. Nothing ever
 * connects to ctx.destination — that path bypasses the volume sliders
 * AND the limiter, which is how v1 earned its screech.
 *
 * Also provides simple ambient drone music via playMusic/stopMusic.
 */

// ------------------------------------------------------------------
// CORE HELPERS
// ------------------------------------------------------------------

import { getCtx, unlockAudio, getSfxBus, getMusicBus } from './music/audioGraph.js';
import {
  buildSfx, hasSfx, resolveSfxKey, createChain, GLIDE_WIND,
  attackKeyForClass, setFootstepSurface, getFootstepSurface,
  resetFootsteps, resolveSurface, surfaceForTile,
} from './sfxLibrary.js';

// Back-compat: existing call sites import these from synthAudio.
export { unlockAudio };
// Re-exported so scenes only ever need to import synthAudio (or audio.js).
export {
  setFootstepSurface, getFootstepSurface, resetFootsteps,
  resolveSurface, surfaceForTile, attackKeyForClass, hasSfx,
};

// One shared 1s noise buffer — v1 allocated and filled a fresh
// AudioBuffer for every single hit/chest sound.
let _noiseBuf = null;
function getNoiseBuffer() {
  if (!_noiseBuf) {
    const ctx = getCtx();
    _noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = _noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  return _noiseBuf;
}

// ------------------------------------------------------------------
// SHIMMER SEND
// ------------------------------------------------------------------
// A single short feedback delay, shared by every sound that asks for
// it (`send` on a layer). Bells, chimes and fanfares tap it and gain a
// tail; footsteps mostly don't, except on stone and crystal where a
// little room is exactly the point. One delay line for the whole game
// costs ~4 nodes total and is the difference between "beeps in a void"
// and "sounds happening in a place".

let _send = null;
function getSendBus() {
  if (_send) return _send;
  const ctx = getCtx();
  const input = ctx.createGain();
  input.gain.value = 1;
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.092;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 3400;
  const out = ctx.createGain();
  out.gain.value = 0.32;
  input.connect(delay);
  delay.connect(damp); damp.connect(fb); fb.connect(delay);   // feedback loop
  delay.connect(out);
  out.connect(getSfxBus());
  _send = input;
  return _send;
}

let _canPan = null;
function panSupported(ctx) {
  if (_canPan == null) _canPan = typeof ctx.createStereoPanner === 'function';
  return _canPan;
}

// ------------------------------------------------------------------
// VOICE BUDGET
// ------------------------------------------------------------------
// Fire-and-forget voices used to pile up (a fanfare over a coin chain
// over four footsteps) and hit the master limiter hard enough to hear
// it pump. A plan that would push us past the ceiling is dropped whole
// rather than half-rendered — except UI, which must ALWAYS answer a
// child's tap, or the game feels broken.

const MAX_VOICES = 120;
let _voiceEnds = [];

function budgetAllows(count, endsAt, priority) {
  const now = getCtx().currentTime;
  if (_voiceEnds.length) _voiceEnds = _voiceEnds.filter((t) => t > now);
  if (!priority && _voiceEnds.length + count > MAX_VOICES) return false;
  for (let i = 0; i < count; i++) _voiceEnds.push(endsAt);
  return true;
}

// ------------------------------------------------------------------
// PLAN RENDERER
// ------------------------------------------------------------------

function applyEnv(param, t0, L) {
  const peak = Math.max(0.0002, L.gain);
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(peak, t0 + L.attack);
  if (L.sustain != null) {
    const hold = t0 + Math.max(L.attack, L.dur - L.release);
    param.setValueAtTime(Math.max(0.0001, peak * L.sustain), hold);
  }
  param.exponentialRampToValueAtTime(0.0001, t0 + L.dur + L.release);
}

function renderLayer(L, when) {
  const ctx = getCtx();
  const t0 = when + L.t;
  const stopAt = t0 + L.dur + L.release + 0.02;

  const g = ctx.createGain();
  applyEnv(g.gain, t0, L);

  let tail = g;
  if (L.pan && panSupported(ctx)) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(L.pan, t0);
    g.connect(p);
    tail = p;
  }
  tail.connect(getSfxBus());
  if (L.send > 0) {
    const s = ctx.createGain();
    s.gain.value = L.send;
    tail.connect(s);
    s.connect(getSendBus());
  }

  // Optional per-layer filter sits between source and envelope.
  let sink = g;
  if (L.filter) {
    const f = ctx.createBiquadFilter();
    f.type = L.filter.type;
    f.frequency.setValueAtTime(L.filter.freq, t0);
    if (L.filter.freqEnd != null && L.filter.freqEnd !== L.filter.freq) {
      f.frequency.exponentialRampToValueAtTime(L.filter.freqEnd, t0 + L.dur);
    }
    f.Q.value = L.filter.q;
    f.connect(g);
    sink = f;
  }

  if (L.kind === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;                       // never run off the end of the 1s buffer
    src.playbackRate.value = L.rate;
    src.connect(sink);
    src.start(t0, L.offset);
    src.stop(stopAt);
    return;
  }

  const o = ctx.createOscillator();
  o.type = L.type;
  o.frequency.setValueAtTime(L.freq, t0);
  if (L.freqEnd != null && L.freqEnd !== L.freq) {
    if (L.sweep === 'lin') o.frequency.linearRampToValueAtTime(L.freqEnd, t0 + L.dur);
    else o.frequency.exponentialRampToValueAtTime(L.freqEnd, t0 + L.dur);
  }
  // FM gives metal its inharmonic clang — the knight's blade, the boss bell.
  if (L.fm) {
    const m = ctx.createOscillator();
    m.type = 'sine';
    m.frequency.setValueAtTime(L.freq * L.fm.ratio, t0);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(Math.max(0.0001, L.fm.index), t0);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + L.fm.decay);
    m.connect(mg); mg.connect(o.frequency);
    m.start(t0); m.stop(stopAt);
  }
  if (L.vib) {
    const v = ctx.createOscillator();
    v.type = 'sine';
    v.frequency.setValueAtTime(L.vib.rate, t0);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(L.vib.depth, t0);
    v.connect(vg); vg.connect(o.frequency);
    v.start(t0); v.stop(stopAt);
  }
  o.connect(sink);
  o.start(t0);
  o.stop(stopAt);
}

/** Render a built plan onto the sfx bus. Returns true if it sounded. */
function renderPlan(plan, { priority = false, gain = 1 } = {}) {
  if (!plan || !plan.layers.length) return false;
  const ctx = getCtx();
  const when = ctx.currentTime + 0.004;    // never schedule in the past
  if (!budgetAllows(plan.layers.length, when + plan.dur, priority)) return false;
  for (const L of plan.layers) {
    if (!Number.isFinite(L.gain) || !Number.isFinite(L.t) || !Number.isFinite(L.dur)) continue;
    renderLayer(gain === 1 ? L : { ...L, gain: L.gain * gain }, when);
  }
  return true;
}

// ------------------------------------------------------------------
// CHAINS — coins and answer streaks remember what came before
// ------------------------------------------------------------------

const _coinChain = createChain({ window: 1.1, max: 12 });
const _streakChain = createChain({ window: 20, max: 14 });

/** Called when a run of coins/answers is over (new scene, wrong answer). */
export function resetSfxChains() { _coinChain.reset(); _streakChain.reset(); }
/** Break only the answer streak — a wrong answer starts the climb over. */
export function resetStreak() { _streakChain.reset(); }
/** Current answer streak length (0 = no run yet). Handy for HUD text. */
export function streakLength() { return _streakChain.peek(); }

function nowSec() {
  try { return getCtx().currentTime; } catch { return 0; }
}

// ------------------------------------------------------------------
// PUBLIC PLAY API
// ------------------------------------------------------------------

/**
 * Play any sound in the library.
 *
 * @param {string} key   e.g. 'move/step/sand', 'world/chest', 'ui/correct'
 * @param {object} opts  per-sound options — see sfxLibrary. Common ones:
 *                       { surface, weight, run, chain, streak, size, volume }
 */
export function playSfx(key, opts = {}) {
  try {
    const k = resolveSfxKey(key);
    if (!k) return false;

    // Chained sounds fill in their own position in the run.
    const o = { ...opts };
    if ((k === 'world/coin' || k === 'world/gold') && o.chain == null) {
      o.chain = _coinChain.next(nowSec());
    }

    const ok = renderPlan(buildSfx(k, o), {
      priority: k.startsWith('ui/'),
      gain: Number.isFinite(o.volume) ? Math.max(0, Math.min(1.5, o.volume)) : 1,
    });

    // A correct answer also plays where it sits in the streak: each one
    // in a row is one pentatonic degree higher than the last, so a child
    // on a roll hears themselves climbing.
    if (k === 'ui/correct') {
      const n = _streakChain.next(nowSec());
      if (n > 0) {
        renderPlan(buildSfx('ui/streak', { streak: n }), { priority: true });
      }
    } else if (k === 'ui/wrong') {
      _streakChain.reset();
    }
    return ok;
  } catch (e) { return false; /* audio must never break gameplay */ }
}

/** Back-compat entry point used by audio.js and older call sites. */
export function playSynth(key, opts) {
  return playSfx(key, opts);
}

// ── Traversal conveniences ──────────────────────────────────────
// Footsteps get a hard rate limit here rather than in the library:
// the throttle needs the audio clock, and a controller running at
// 120fps will happily ask for a step every frame while sliding.

const MIN_STEP_GAP = 0.075;
let _lastStepAt = -Infinity;

/**
 * One footstep on `surface` (any alias: 'path', 'shallows', 'plank'…).
 * Omit the surface to use whatever setFootstepSurface() last said.
 * Extra opts: { run, effort, index }.
 */
export function footstep(surface, opts = {}) {
  const now = nowSec();
  if (now - _lastStepAt < MIN_STEP_GAP) return false;
  _lastStepAt = now;
  return playSfx('move/step', { ...opts, surface });
}

/** Landing. `weight` 1 = a normal hop, >1.4 gets the heavy treatment. */
export function land(surface, weight = 1) {
  return playSfx(weight >= 1.4 ? 'move/land-heavy' : 'move/land', { surface, weight });
}

/** Attack sound chosen by hero class name. */
export function playAttack(heroClass, opts = {}) {
  return playSfx(attackKeyForClass(heroClass), opts);
}

// ------------------------------------------------------------------
// GLIDE WIND — the only sustained SFX voice
// ------------------------------------------------------------------
// Everything else is one-shot. Gliding needs a bed of moving air that
// follows your speed, so it holds two looping noise voices open with a
// slow LFO on each filter. Started and stopped by the traversal state
// machine; safe to call redundantly.

let _wind = null;

/** Begin the glide wind bed. Idempotent. */
export function startGlideWind(intensity = 1) {
  if (_wind) { setGlideWindIntensity(intensity); return; }
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(getSfxBus());
    const voices = [];
    for (const L of GLIDE_WIND.layers) {
      const src = ctx.createBufferSource();
      src.buffer = getNoiseBuffer();
      src.loop = true;
      src.playbackRate.value = L.rate;
      const f = ctx.createBiquadFilter();
      f.type = L.filter;
      f.frequency.setValueAtTime(L.freq, now);
      f.Q.value = L.q;
      const g = ctx.createGain();
      g.gain.value = L.gain;
      // Slow filter drift so the bed breathes instead of hissing flat.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = L.lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = L.lfoDepth;
      lfo.connect(lg); lg.connect(f.frequency);
      lfo.start(now);
      src.connect(f); f.connect(g);
      if (L.pan && panSupported(ctx)) {
        const p = ctx.createStereoPanner();
        p.pan.value = L.pan;
        g.connect(p); p.connect(master);
      } else {
        g.connect(master);
      }
      src.start(now, Math.random() * 0.9);
      voices.push({ src, f, lfo, base: L.freq, span: L.freqSpan });
    }
    // Open at the requested intensity over the full attack, rather than
    // ramping to full and immediately correcting — that reads as a gust.
    const i0 = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 1));
    _wind = { master, voices, intensity: i0 };
    master.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, GLIDE_WIND.gain * (0.35 + 0.65 * i0)), now + GLIDE_WIND.attack);
    for (const v of voices) v.f.frequency.setValueAtTime(v.base + v.span * i0, now);
  } catch { _wind = null; }
}

/** 0..1 — map the glider's airspeed onto loudness and brightness. */
export function setGlideWindIntensity(v) {
  if (!_wind) return;
  const i = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
  if (i === _wind.intensity) return;
  _wind.intensity = i;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    _wind.master.gain.cancelScheduledValues(now);
    _wind.master.gain.setValueAtTime(Math.max(0.0001, _wind.master.gain.value), now);
    _wind.master.gain.linearRampToValueAtTime(
      Math.max(0.0001, GLIDE_WIND.gain * (0.35 + 0.65 * i)), now + 0.25);
    for (const v2 of _wind.voices) {
      v2.f.frequency.cancelScheduledValues(now);
      v2.f.frequency.linearRampToValueAtTime(v2.base + v2.span * i, now + 0.3);
    }
  } catch { /* context gone */ }
}

/** Fade the wind out and tear the nodes down. Idempotent. */
export function stopGlideWind() {
  if (!_wind) return;
  const w = _wind;
  _wind = null;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    w.master.gain.cancelScheduledValues(now);
    w.master.gain.setValueAtTime(Math.max(0.0001, w.master.gain.value), now);
    w.master.gain.exponentialRampToValueAtTime(0.0001, now + GLIDE_WIND.release);
  } catch { /* ignore */ }
  setTimeout(() => {
    for (const v of w.voices) {
      try { v.src.stop(); v.lfo.stop(); v.src.disconnect(); v.f.disconnect(); } catch { /* gone */ }
    }
    try { w.master.disconnect(); } catch { /* gone */ }
  }, (GLIDE_WIND.release + 0.15) * 1000);
}

// ------------------------------------------------------------------
// BACKGROUND MUSIC (ambient drones)
// ------------------------------------------------------------------

const MUSIC_DEFS = {
  // Garden / menu — gentle 220Hz + 330Hz sine at 0.03
  'music/title': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  'music/map': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  // Floor 1 — Garden
  'music/floor-1': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  // Battle — 165Hz triangle at 0.04 with slow tremolo
  'music/battle': {
    layers: [
      { freq: 165, type: 'triangle', volume: 0.04 },
    ],
    tremolo: 2,
  },
  'music/boss': {
    layers: [
      { freq: 165, type: 'triangle', volume: 0.04 },
    ],
    tremolo: 3,
  },
  // Floor 2 — Tidepool: 180Hz sine at 0.03
  'music/floor-2': {
    layers: [
      { freq: 180, type: 'sine', volume: 0.03 },
    ],
  },
  // Floor 3 — Cloud: 260Hz sine at 0.02
  'music/floor-3': {
    layers: [
      { freq: 260, type: 'sine', volume: 0.02 },
    ],
  },
  // Floor 4 — Ember: 110Hz sawtooth at 0.03
  'music/floor-4': {
    layers: [
      { freq: 110, type: 'sawtooth', volume: 0.03 },
    ],
  },
  // Floor 5 — Arcane: 200Hz + 300Hz sine at 0.02
  'music/floor-5': {
    layers: [
      { freq: 200, type: 'sine', volume: 0.02 },
      { freq: 300, type: 'sine', volume: 0.02 },
    ],
  },
};

let _musicNodes = null;
let _currentMusicKey = null;

/**
 * Start looping ambient music. If the same key is already playing,
 * do nothing. Stops any currently playing music first.
 */
export function playSynthMusic(key) {
  if (key === _currentMusicKey && _musicNodes) return;
  stopSynthMusic();

  const def = MUSIC_DEFS[key];
  if (!def) {
    _currentMusicKey = key;
    return;
  }

  const ctx = getCtx();
  if (!ctx) return;

  const oscillators = [];
  const gains = [];
  let lfo = null;

  for (const layer of def.layers) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = layer.type || 'sine';
    osc.frequency.setValueAtTime(layer.freq, ctx.currentTime);
    gain.gain.setValueAtTime(layer.volume || 0.03, ctx.currentTime);
    osc.connect(gain);
    gain.connect(getMusicBus());
    osc.start(ctx.currentTime);
    oscillators.push(osc);
    gains.push(gain);
  }

  // Optional tremolo (slow LFO modulation)
  if (def.tremolo && gains.length > 0) {
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(def.tremolo, ctx.currentTime);
    lfoGain.gain.setValueAtTime(def.layers[0].volume * 0.3, ctx.currentTime);
    lfo.connect(lfoGain);
    for (const g of gains) {
      lfoGain.connect(g.gain);
    }
    lfo.start(ctx.currentTime);
  }

  _musicNodes = { oscillators, gains, lfo };
  _currentMusicKey = key;
}

/**
 * Stop the currently playing synth music.
 */
export function stopSynthMusic() {
  if (!_musicNodes) return;
  const { oscillators, gains, lfo } = _musicNodes;
  const ctx = getCtx();
  const now = ctx ? ctx.currentTime : 0;

  // Fade out gracefully
  for (const g of gains) {
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    } catch { /* ignore */ }
  }
  // Stop oscillators after fade
  setTimeout(() => {
    for (const osc of oscillators) {
      try { osc.stop(); } catch { /* ignore */ }
    }
    if (lfo) {
      try { lfo.stop(); } catch { /* ignore */ }
    }
  }, 350);

  _musicNodes = null;
  _currentMusicKey = null;
}

/**
 * Check if a given key has a synth music definition.
 */
export function hasSynthMusic(key) {
  return key in MUSIC_DEFS;
}
