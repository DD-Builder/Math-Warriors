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

  // True Karplus-Strong string — reserve for lead lines
  harp(out, fx) {
    return (when, { freq, vel }) => {
      const ctx = getCtx();
      const burst = ctx.createBufferSource();
      burst.buffer = noiseBuffer();
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.5 * vel, when);
      bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
      const delay = ctx.createDelay(0.1);
      delay.delayTime.setValueAtTime(1 / freq, when);
      const fb = ctx.createGain();
      fb.gain.value = 0.93;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 3200;
      burst.connect(bg); bg.connect(delay);
      delay.connect(damp); damp.connect(fb); fb.connect(delay);
      const tap = ctx.createGain();
      tap.gain.setValueAtTime(0.9, when);
      tap.gain.exponentialRampToValueAtTime(0.0001, when + 1.8);
      delay.connect(tap); tap.connect(out);
      if (fx) tap.connect(fx);
      burst.start(when, 0, 0.03);
      // Self-teardown: the feedback loop would ring forever
      setTimeout(() => { try { delay.disconnect(); fb.disconnect(); damp.disconnect(); tap.disconnect(); } catch { /* gone */ } },
        Math.max(0, (when - ctx.currentTime) * 1000) + 2100);
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
      bf.type = 'bandpass'; bf.frequency.value = freq * 2; bf.Q.value = 8;
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
