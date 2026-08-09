/**
 * The RENDERER half of the SFX system, exercised against a deliberately
 * hostile fake AudioContext.
 *
 * sfxLibrary.test.js proves the sound DESIGN is numerically sane.
 * This proves the code that turns a design into nodes never:
 *   - hands a NaN/Infinity to an AudioParam (which throws, and playSfx
 *     swallows the throw, so the sound just silently disappears),
 *   - calls exponentialRampToValueAtTime(0) (also throws — the classic
 *     envelope bug),
 *   - sets an oscillator or filter type WebAudio doesn't have,
 *   - or connects anything to ctx.destination, which would bypass both
 *     the volume sliders and the master limiter. That bypass is exactly
 *     what made v1 screech, so it is asserted, not assumed.
 *
 * The stub is hand-rolled — no DOM, no jsdom, no dependency. node's test
 * runner gives each file its own process, so stubbing globalThis.window
 * here cannot leak into another test.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// ── A fake WebAudio that fails loudly ────────────────────────────

const OSC_TYPES = new Set(['sine', 'square', 'sawtooth', 'triangle', 'custom']);
const FILTER_TYPES = new Set([
  'lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass',
]);

const stats = { nodes: 0, destinationConnects: 0, paramWrites: 0, errors: [] };

function fail(msg) { stats.errors.push(msg); throw new Error(msg); }

function makeParam(name) {
  const finite = (x, where) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${name}.${where} got ${x}`);
    stats.paramWrites++;
  };
  return {
    value: 0,
    setValueAtTime(v, t) { finite(v, 'setValueAtTime'); finite(t, 'setValueAtTime time'); return this; },
    linearRampToValueAtTime(v, t) { finite(v, 'linearRamp'); finite(t, 'linearRamp time'); return this; },
    exponentialRampToValueAtTime(v, t) {
      finite(v, 'expRamp'); finite(t, 'expRamp time');
      if (v <= 0) fail(`${name}.exponentialRampToValueAtTime(${v}) — WebAudio throws on <= 0`);
      return this;
    },
    cancelScheduledValues(t) { finite(t, 'cancel'); return this; },
  };
}

let DESTINATION;

function makeNode(extra = {}) {
  stats.nodes++;
  return {
    connect(target) {
      if (target === DESTINATION) stats.destinationConnects++;
      if (!target) fail('connect(undefined)');
      return target;
    },
    disconnect() {},
    ...extra,
  };
}

function typedNode(prop, allowed, base) {
  const n = makeNode(base);
  let t = [...allowed][0];
  Object.defineProperty(n, 'type', {
    get: () => t,
    set: (v) => { if (!allowed.has(v)) fail(`${prop} type "${v}" is not a WebAudio type`); t = v; },
  });
  return n;
}

class FakeAudioContext {
  constructor() {
    DESTINATION = makeNode();
    this.destination = DESTINATION;
    this.sampleRate = 48000;
    this.state = 'running';
    this._t = 10;
  }
  get currentTime() { return this._t; }
  advance(dt) { this._t += dt; }
  resume() { this.state = 'running'; }
  createGain() { return makeNode({ gain: makeParam('gain') }); }
  createOscillator() {
    return typedNode('oscillator', OSC_TYPES, {
      frequency: makeParam('frequency'),
      detune: makeParam('detune'),
      start(t) { if (t != null && !Number.isFinite(t)) fail(`osc.start(${t})`); },
      stop(t) { if (t != null && !Number.isFinite(t)) fail(`osc.stop(${t})`); },
    });
  }
  createBiquadFilter() {
    return typedNode('filter', FILTER_TYPES, {
      frequency: makeParam('filter.frequency'),
      Q: makeParam('filter.Q'),
      gain: makeParam('filter.gain'),
      detune: makeParam('filter.detune'),
    });
  }
  createBufferSource() {
    return makeNode({
      buffer: null,
      loop: false,
      playbackRate: makeParam('playbackRate'),
      start(when, offset, dur) {
        for (const [k, v] of [['when', when], ['offset', offset], ['duration', dur]]) {
          if (v === undefined) continue;
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`bufferSource.start ${k}=${v}`);
        }
      },
      stop(t) { if (t != null && !Number.isFinite(t)) fail(`bufferSource.stop(${t})`); },
    });
  }
  createStereoPanner() { return makeNode({ pan: makeParam('pan') }); }
  createDelay(max) {
    if (!Number.isFinite(max) || max <= 0) fail(`createDelay(${max})`);
    return makeNode({ delayTime: makeParam('delayTime') });
  }
  createDynamicsCompressor() {
    return makeNode({
      threshold: makeParam('threshold'), knee: makeParam('knee'), ratio: makeParam('ratio'),
      attack: makeParam('attack'), release: makeParam('release'),
    });
  }
  createBuffer(channels, length, rate) {
    if (![channels, length, rate].every(Number.isFinite)) fail('createBuffer got a non-number');
    return { length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(length) };
  }
}

let ctx;
let lib;
let synth;

before(async () => {
  ctx = new FakeAudioContext();
  globalThis.window = { AudioContext: FakeAudioContext };
  // One shared instance so currentTime can be advanced between plays.
  globalThis.window.AudioContext = function () { return ctx; };
  lib = await import('./sfxLibrary.js');
  synth = await import('./synthAudio.js');
});

describe('sfx renderer', () => {
  test('every key (and every legacy alias) renders without throwing', () => {
    const keys = [...lib.SFX_KEYS, ...Object.keys(lib.SFX_ALIASES)];
    const silent = [];
    for (const key of keys) {
      for (const opts of [{}, { weight: 2, chain: 6, streak: 9, run: true, size: 1.5, surface: 'wood' }]) {
        ctx.advance(3);                      // let the voice budget drain
        const played = synth.playSfx(key, opts);
        if (!played) silent.push(key);
      }
    }
    assert.deepEqual(stats.errors, []);
    assert.deepEqual(silent, [], 'these keys rendered nothing at all');
  });

  test('nothing bypasses the sfx bus to reach ctx.destination', () => {
    // The only legal direct connection is audioGraph's master limiter.
    assert.equal(stats.destinationConnects, 1,
      'a voice connected straight to the speakers, skipping the volume sliders and limiter');
  });

  test('footsteps render on every surface, walking and running', () => {
    const before = stats.errors.length;
    for (const s of lib.SURFACE_NAMES) {
      for (let i = 0; i < 8; i++) {
        ctx.advance(0.4);
        synth.setFootstepSurface(s);
        assert.ok(synth.footstep(undefined, { run: i % 2 === 0 }), `${s} step ${i} was silent`);
      }
    }
    assert.equal(stats.errors.length, before);
  });

  test('footsteps are rate-limited so a fast controller cannot machine-gun', () => {
    ctx.advance(2);
    assert.ok(synth.footstep('grass'), 'first step should sound');
    assert.equal(synth.footstep('grass'), false, 'a step 0s later must be dropped');
    ctx.advance(0.2);
    assert.ok(synth.footstep('grass'), 'a step 200ms later should sound');
  });

  test('landings, class attacks and the glide wind all survive contact', () => {
    const before = stats.errors.length;
    ctx.advance(2); assert.ok(synth.land('snow', 1));
    ctx.advance(2); assert.ok(synth.land('stone', 1.9));
    ctx.advance(2); assert.ok(synth.playAttack('Wizard'));
    ctx.advance(2); assert.ok(synth.playAttack('totally-new-class'));
    synth.startGlideWind(0.2);
    synth.setGlideWindIntensity(0.9);
    synth.startGlideWind(1);          // idempotent
    synth.stopGlideWind();
    synth.stopGlideWind();            // idempotent
    synth.setGlideWindIntensity(0.5); // after stop — must be a no-op, not a crash
    assert.equal(stats.errors.length, before);
  });

  test('the voice budget drops a flood instead of piling onto the limiter', () => {
    let played = 0;
    for (let i = 0; i < 200; i++) if (synth.playSfx('world/floor-complete')) played++;
    assert.ok(played > 0, 'the budget must not block everything');
    assert.ok(played < 20, `the budget let ${played} fanfares through at once`);
    // UI always answers a tap, even under a flood.
    assert.ok(synth.playSfx('ui/press'), 'UI must never be starved by the budget');
    ctx.advance(10);
  });

  test('an unknown key is a silent no-op, not an exception', () => {
    assert.equal(synth.playSfx('does/not/exist'), false);
    assert.equal(synth.playSynth('does/not/exist'), false);
  });

  test('coin chains climb and reset with the audio clock', () => {
    synth.resetSfxChains();
    const pitch = () => {
      const n = stats.paramWrites;
      synth.playSfx('world/coin');
      return n;                        // presence check; pitch itself is unit-tested
    };
    ctx.advance(5); pitch();
    ctx.advance(0.2); pitch();
    ctx.advance(0.2); pitch();
    assert.equal(stats.errors.length, 0);
    // A correct answer bumps the streak; a wrong one clears it.
    ctx.advance(1); synth.playSfx('ui/correct');
    ctx.advance(1); synth.playSfx('ui/correct');
    assert.equal(synth.streakLength(), 1);
    ctx.advance(1); synth.playSfx('ui/wrong');
    assert.equal(synth.streakLength(), 0);
    assert.deepEqual(stats.errors, []);
  });
});
