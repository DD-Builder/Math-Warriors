/**
 * The instrument kit — nine WebAudio voices, no samples.
 *
 * Each factory returns { play(whenSec, {freq, durSec, vel}), dispose }.
 * Voices are fire-and-forget node chains into the track's gain node
 * (and optionally the shared FX send). Costs stay tiny: 1-4 native
 * nodes per note, one cached noise buffer shared by everything.
 */

import { getCtx } from './audioGraph.js';

let _noise = null;
export function noiseBuffer() {
  if (!_noise) {
    const ctx = getCtx();
    _noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = _noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noise;
}

/**
 * Karplus-Strong damping factor for the OFFLINE pluck renderer below.
 *
 * STABILITY LAW (learned the hard way): the shipped harp used to be a LIVE
 * WebAudio feedback loop — delay -> lowpass -> gain(0.93) -> delay. The
 * lowpass's default Q of +1 dB gave the loop an effective gain of ~1.06 at
 * resonance, so every note grew ~20 dB/s, overflowed to Inf -> NaN within
 * seconds, and the NaN latched the song's FX delay (and everything downstream)
 * permanently. That was the "prolonged high pitched machine sound".
 *
 * The fix is structural, not a tuned constant: NO live feedback loop exists
 * here any more. The string is rendered in plain JS into an AudioBuffer by
 * ksPluckSamples(), where the loop gain is exactly KS_DAMP times a 2-point
 * average (magnitude <= 1), i.e. provably < 1 at every frequency. A buffer
 * cannot run away and cannot poison the graph. audioStability.test.js asserts
 * KS_DAMP < 1 and that the rendered pluck decays monotonically.
 */
export const KS_DAMP = 0.995;

/**
 * Render one Karplus-Strong pluck as raw samples. Pure function (no WebAudio,
 * no DOM) so `node --test` can prove the decay. The recurrence is
 *   ring[n] = KS_DAMP * 0.5 * (ring[n] + ring[n-1])
 * — a damped 2-point moving average, worst-case round-trip gain KS_DAMP < 1.
 */
export function ksPluckSamples(freq, sampleRate, seconds = 1.9, rand = Math.random) {
  const f = Math.min(Math.max(freq || 220, 30), 4000);
  const N = Math.max(2, Math.round(sampleRate / f));
  const len = Math.max(N + 1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(len);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = rand() * 2 - 1;
  let prev = 0;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    out[i] = cur;
    ring[idx] = KS_DAMP * 0.5 * (cur + prev);
    prev = cur;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  // Feather the very end so a full-length playback can never click.
  const fade = Math.min(256, len);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return out;
}

/** Rendered plucks, cached per pitch. A song uses ~10 pitches; this is tiny. */
const _ksCache = new Map();
function ksBuffer(freq) {
  const ctx = getCtx();
  const key = Math.round(freq * 4);
  let buf = _ksCache.get(key);
  if (!buf) {
    const s = ksPluckSamples(freq, ctx.sampleRate);
    buf = ctx.createBuffer(1, s.length, ctx.sampleRate);
    buf.getChannelData(0).set(s);
    _ksCache.set(key, buf);
  }
  return buf;
}

function env(gain, when, { a = 0.005, peak = 0.8, dur = 0.5, release = 0.08, sustain = null }) {
  const g = gain.gain;
  g.setValueAtTime(0.0001, when);
  g.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + a);
  if (sustain != null) {
    g.setValueAtTime(Math.max(0.0001, peak * sustain), when + Math.max(a, dur - release));
  }
  g.exponentialRampToValueAtTime(0.0001, when + dur + release);
}

function osc(type, freq, when, stopAt) {
  const o = getCtx().createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  o.start(when);
  o.stop(stopAt);
  return o;
}

const makers = {
  // Delicate toy-piano lead — the game's signature voice
  musicbox(out, fx) {
    return (when, { freq, vel }) => {
      const dur = 1.2;
      const g = getCtx().createGain();
      env(g, when, { a: 0.003, peak: 0.5 * vel, dur });
      osc('sine', freq, when, when + dur + 0.1).connect(g);
      const g2 = getCtx().createGain();
      env(g2, when, { a: 0.003, peak: 0.06 * vel, dur: dur * 0.6 });
      osc('sine', freq * 4, when, when + dur).connect(g2);
      g.connect(out); g2.connect(out);
      if (fx) { g.connect(fx); }
    };
  },

  kalimba(out, fx) {
    return (when, { freq, vel }) => {
      const dur = 0.6;
      const g = getCtx().createGain();
      env(g, when, { a: 0.002, peak: 0.5 * vel, dur });
      osc('sine', freq, when, when + dur + 0.1).connect(g);
      const tick = getCtx().createGain();
      env(tick, when, { a: 0.001, peak: 0.12 * vel, dur: 0.03 });
      const to = osc('triangle', freq * 2, when, when + 0.05);
      to.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 0.03);
      to.connect(tick);
      g.connect(out); tick.connect(out);
      if (fx) g.connect(fx);
    };
  },

  // Cheap nylon-ish pluck: sawtooth through a fast-closing lowpass
  pluck(out, fx) {
    return (when, { freq, vel }) => {
      const dur = 0.5;
      const g = getCtx().createGain();
      env(g, when, { a: 0.003, peak: 0.4 * vel, dur });
      const f = getCtx().createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq * 6, when);
      f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 0.08);
      osc('sawtooth', freq, when, when + dur + 0.1).connect(f);
      f.connect(g); g.connect(out);
      if (fx) g.connect(fx);
    };
  },

  // Karplus-Strong string, rendered OFFLINE into a buffer (see ksPluckSamples).
  // No live feedback loop: a buffer source cannot diverge, cannot latch NaN,
  // and needs no self-teardown timer — it simply ends.
  harp(out, fx) {
    return (when, { freq, vel }) => {
      const ctx = getCtx();
      const src = ctx.createBufferSource();
      src.buffer = ksBuffer(freq);
      // Gentle tone shaping where the old loop's damping filter sat. Q is set
      // in dB, BELOW zero: the default +1 dB resonant peak at 3.2 kHz is the
      // exact frequency band the runaway used to scream in, and nothing about
      // a harp needs emphasis there.
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 3200;
      damp.Q.value = -6;
      const tap = ctx.createGain();
      tap.gain.setValueAtTime(Math.max(0.0001, 0.45 * vel), when);
      tap.gain.exponentialRampToValueAtTime(0.0001, when + 1.8);
      src.connect(damp); damp.connect(tap); tap.connect(out);
      if (fx) tap.connect(fx);
      src.start(when);
      src.stop(when + 1.85);
    };
  },

  warmpad(out, fx) {
    return (when, { freq, vel, durSec = 2 }) => {
      const ctx = getCtx();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain();
      env(g, when, { a: 0.4, peak: 0.16 * vel, dur: durSec, release: 0.9, sustain: 0.75 });
      for (const det of [-6, 6]) {
        const o = osc('sawtooth', freq, when, when + durSec + 1.2);
        o.detune.setValueAtTime(det, when);
        o.connect(f);
      }
      f.connect(g); g.connect(out);
      if (fx) g.connect(fx);
    };
  },

  softbass(out) {
    return (when, { freq, vel, durSec = 0.8 }) => {
      const g = getCtx().createGain();
      env(g, when, { a: 0.008, peak: 0.5 * vel, dur: durSec, release: 0.12, sustain: 0.6 });
      osc('sine', freq, when, when + durSec + 0.2).connect(g);
      const g2 = getCtx().createGain();
      env(g2, when, { a: 0.008, peak: 0.12 * vel, dur: durSec * 0.7 });
      osc('triangle', freq * 2, when, when + durSec).connect(g2);
      g.connect(out); g2.connect(out);
    };
  },

  // Breathy flute lead with delayed vibrato
  ocarina(out, fx) {
    return (when, { freq, vel, durSec = 0.8 }) => {
      const ctx = getCtx();
      const g = ctx.createGain();
      env(g, when, { a: 0.06, peak: 0.35 * vel, dur: durSec, release: 0.15, sustain: 0.85 });
      const o = osc('sine', freq, when, when + durSec + 0.3);
      const lfo = osc('sine', 5.5, when + 0.25, when + durSec + 0.3);
      const lfoG = ctx.createGain();
      lfoG.gain.setValueAtTime(freq * 0.004, when);
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      o.connect(g);
      const breath = ctx.createBufferSource();
      breath.buffer = noiseBuffer();
      const bf = ctx.createBiquadFilter();
      // Q audit: sustained voices stay at or below Q 6 — enough "whistle" to
      // read as breath, never enough to ring on its own.
      bf.type = 'bandpass'; bf.frequency.value = freq * 2; bf.Q.value = 6;
      const bgn = ctx.createGain();
      env(bgn, when, { a: 0.06, peak: 0.03 * vel, dur: durSec, sustain: 0.8 });
      breath.connect(bf); bf.connect(bgn); bgn.connect(out);
      breath.start(when, Math.random(), durSec + 0.2);
      g.connect(out);
      if (fx) g.connect(fx);
    };
  },

  bell(out, fx) {
    return (when, { freq, vel }) => {
      const dur = 2.0;
      for (const [ratio, amp] of [[1, 0.4], [2.76, 0.15]]) {
        const g = getCtx().createGain();
        env(g, when, { a: 0.002, peak: amp * vel, dur });
        osc('sine', freq * ratio, when, when + dur + 0.2).connect(g);
        g.connect(out);
        if (fx && ratio === 1) g.connect(fx);
      }
    };
  },

  // note-name keyed percussion: kick/hat/hatO/shk/tom
  perc(out) {
    return (when, { note, vel }) => {
      const ctx = getCtx();
      if (note === 'kick') {
        const g = ctx.createGain();
        env(g, when, { a: 0.002, peak: 0.6 * vel, dur: 0.14 });
        const o = osc('sine', 120, when, when + 0.16);
        o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
        o.connect(g); g.connect(out);
      } else if (note === 'tom') {
        const g = ctx.createGain();
        env(g, when, { a: 0.002, peak: 0.4 * vel, dur: 0.22 });
        const o = osc('sine', 180, when, when + 0.24);
        o.frequency.exponentialRampToValueAtTime(90, when + 0.2);
        o.connect(g); g.connect(out);
      } else {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer();
        const f = ctx.createBiquadFilter();
        if (note === 'shk') { f.type = 'bandpass'; f.frequency.value = 4000; f.Q.value = 1.5; }
        else { f.type = 'highpass'; f.frequency.value = 7000; }
        const g = ctx.createGain();
        const dur = note === 'hatO' ? 0.12 : note === 'shk' ? 0.09 : 0.04;
        env(g, when, { a: 0.001, peak: (note === 'shk' ? 0.18 : 0.14) * vel, dur });
        src.connect(f); f.connect(g); g.connect(out);
        src.start(when, Math.random() * 0.5, dur + 0.05);
      }
    };
  },
};

export const INSTRUMENT_NAMES = Object.keys(makers);

export function createInstrument(name, { out, fxSend = null }) {
  const make = makers[name] || makers.musicbox;
  const play = make(out, fxSend);
  return { play };
}
