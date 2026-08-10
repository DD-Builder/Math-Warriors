/**
 * AUDIO STABILITY GATE.
 *
 * Born from a real shipped defect: the harp instrument was a live WebAudio
 * feedback loop with an effective round-trip gain of ~1.06 (fb 0.93 × the
 * damping lowpass's default +1 dB resonant peak). Every note grew ~20 dB/s
 * into the master limiter — the "prolonged high pitched machine sound" — then
 * overflowed to Inf → NaN, and the NaN recirculated forever inside the song's
 * FX delay, killing the whole mix until reload. No exception, no console
 * error, no bad AudioParam: pure sample-domain divergence, invisible to every
 * boots-and-runs gate.
 *
 * This file makes the stability rules MECHANICAL:
 *   1. Every feedback constant in the audio stack is a named export and must
 *      sit at or below MAX_FEEDBACK (0.6).
 *   2. Filters inside feedback loops must not add gain (lowpass Q in dB < 0).
 *   3. The harp has no live feedback loop at all any more — its Karplus-Strong
 *      string is rendered offline by a pure function whose decay is proven
 *      here numerically.
 *   4. Song/cue data cannot smuggle a hot delayFb in (source-scanned).
 *   5. Sustained voices keep resonant Q at or below 6.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_FEEDBACK } from './music/audioGraph.js';
import { KS_DAMP, ksPluckSamples } from './music/instruments.js';
import { REVERB_FB, REVERB_DAMP_Q_DB } from '../overworld/audio3d.js';
import { SEND_FB, GLIDE_WIND } from './sfxLibrary.js';
import { allSongKeys, getSong } from './music/songs/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

describe('feedback constants stay under the stability bound', () => {
  test('the bound itself is the agreed 0.6', () => {
    assert.ok(MAX_FEEDBACK <= 0.6, `MAX_FEEDBACK ${MAX_FEEDBACK} must be <= 0.6`);
    assert.ok(MAX_FEEDBACK > 0);
  });

  test('reverb-lite ping-pong feedback (audio3d)', () => {
    assert.ok(REVERB_FB <= MAX_FEEDBACK, `REVERB_FB ${REVERB_FB} > ${MAX_FEEDBACK}`);
    assert.ok(REVERB_FB > 0);
  });

  test('reverb-lite damping filter cannot add gain inside the loop', () => {
    // Lowpass Q is in dB: it must be strictly negative so the loop's
    // round-trip gain is < REVERB_FB at EVERY frequency, resonance included.
    assert.ok(REVERB_DAMP_Q_DB < 0, `REVERB_DAMP_Q_DB ${REVERB_DAMP_Q_DB} must be < 0 dB`);
  });

  test('shimmer send feedback (sfxLibrary/synthAudio)', () => {
    assert.ok(SEND_FB <= MAX_FEEDBACK, `SEND_FB ${SEND_FB} > ${MAX_FEEDBACK}`);
    assert.ok(SEND_FB > 0);
  });

  test('every composed song keeps delayFb under the bound', () => {
    const keys = allSongKeys();
    assert.ok(keys.length > 10, 'song registry looks empty');
    for (const key of keys) {
      const song = getSong(key);
      const fb = song?.fx?.delayFb;
      if (fb == null) continue;
      assert.ok(fb <= MAX_FEEDBACK, `${key} delayFb ${fb} > ${MAX_FEEDBACK}`);
      assert.ok(fb >= 0, `${key} delayFb ${fb} negative`);
    }
  });

  test('no delayFb literal anywhere in the music sources exceeds the bound', () => {
    // Catches cue builders and future songs that are not in the registry yet.
    const files = walkJs(path.join(SRC, 'systems', 'music'));
    let found = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/delayFb:\s*([0-9]*\.?[0-9]+)/g)) {
        found++;
        const v = Number(m[1]);
        assert.ok(v <= MAX_FEEDBACK, `${path.relative(SRC, f)} delayFb ${v} > ${MAX_FEEDBACK}`);
      }
    }
    assert.ok(found > 5, 'delayFb scan found suspiciously few literals');
  });

  test('no hardcoded feedback-gain literal in the audio runtime exceeds the bound', () => {
    const files = [
      'systems/music/audioGraph.js',
      'systems/music/director.js',
      'systems/music/instruments.js',
      'systems/synthAudio.js',
      'overworld/audio3d.js',
    ];
    for (const rel of files) {
      const src = read(rel);
      // fb.gain.value = N / fbGain.gain.value = N / fb1.gain.value = N …
      for (const m of src.matchAll(/\bfb\w*\.gain\.value\s*=\s*([0-9]*\.?[0-9]+)/g)) {
        const v = Number(m[1]);
        assert.ok(v <= MAX_FEEDBACK, `${rel}: feedback gain literal ${v} > ${MAX_FEEDBACK}`);
      }
    }
  });
});

describe('the harp cannot run away, structurally', () => {
  test('instruments.js builds no live delay lines at all', () => {
    const src = read('systems/music/instruments.js');
    assert.ok(
      !src.includes('createDelay'),
      'instruments.js must not build live feedback delay loops — the harp is an offline-rendered buffer',
    );
  });

  test('offline Karplus-Strong damping is strictly below unity', () => {
    assert.ok(KS_DAMP < 1, `KS_DAMP ${KS_DAMP} must be < 1`);
    assert.ok(KS_DAMP > 0.9, 'KS_DAMP suspiciously low — the pluck would be a click');
  });

  test('rendered pluck decays monotonically and stays finite (C4/E4/G4/A5)', () => {
    // Deterministic excitation so this can never flake.
    const lcg = (seed) => () => {
      seed = (seed * 1664525 + 1013904223) >>> 0; // eslint-disable-line no-param-reassign
      return seed / 4294967296;
    };
    const SR = 44100;
    for (const freq of [262, 330, 392, 880]) {
      const s = ksPluckSamples(freq, SR, 3, lcg(freq));
      const peaks = [];
      for (let sec = 0; sec < 3; sec++) {
        let pk = 0;
        for (let i = sec * SR; i < (sec + 1) * SR && i < s.length; i++) {
          const v = s[i];
          assert.ok(Number.isFinite(v), `${freq} Hz: non-finite sample at ${i}`);
          const a = Math.abs(v);
          if (a > pk) pk = a;
        }
        peaks.push(pk);
      }
      assert.ok(peaks[1] < peaks[0], `${freq} Hz: second 1 (${peaks[1]}) not below second 0 (${peaks[0]})`);
      assert.ok(peaks[2] < peaks[1], `${freq} Hz: second 2 (${peaks[2]}) not below second 1 (${peaks[1]})`);
      assert.ok(peaks[2] < peaks[0] * 0.5, `${freq} Hz: not actually decaying (${peaks.join(', ')})`);
      assert.ok(peaks[0] <= 1.001, `${freq} Hz: excitation peak ${peaks[0]} exceeds unity`);
    }
  });
});

describe('resonant Q audit — nothing sustained rings above ~6', () => {
  test('glide wind layers', () => {
    for (const L of GLIDE_WIND.layers) {
      assert.ok(L.q <= 6, `GLIDE_WIND layer q ${L.q} > 6`);
    }
  });

  test('audio3d bed/loop layer specs', () => {
    const src = read('overworld/audio3d.js');
    for (const m of src.matchAll(/\bq:\s*([0-9]*\.?[0-9]+)/g)) {
      const v = Number(m[1]);
      assert.ok(v <= 6, `audio3d.js layer q ${v} > 6`);
    }
  });

  test('instruments.js sustained-filter Q assignments', () => {
    const src = read('systems/music/instruments.js');
    for (const m of src.matchAll(/\.Q\.value\s*=\s*(-?[0-9]*\.?[0-9]+)/g)) {
      const v = Number(m[1]);
      assert.ok(v <= 6, `instruments.js Q ${v} > 6`);
    }
  });
});
