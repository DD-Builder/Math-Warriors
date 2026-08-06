import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_KEYS, timeOfDay, lerpColor } from './timeOfDay.js';
import { PAPER } from '../config.js';

const COLOR_FIELDS = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyMid', 'skyBottom'];
const SCALAR_FIELDS = ['sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar'];

function channels(c) {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

// Deterministic LCG so a failing t is reproducible.
function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function adjacentKeys(u) {
  let i = 0;
  for (let k = 0; k < DAY_KEYS.length; k++) if (DAY_KEYS[k].t <= u) i = k;
  return [DAY_KEYS[i], DAY_KEYS[(i + 1) % DAY_KEYS.length]];
}

describe('DAY_KEYS', () => {
  test('four wrapping keyframes at the mandated times', () => {
    assert.equal(DAY_KEYS.length, 4);
    assert.deepEqual(DAY_KEYS.map(k => k.t), [0.0, 0.3, 0.62, 0.85]);
  });

  test('no keyframe color channel darker than PAPER.inkTeal (papercut law)', () => {
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    for (const key of DAY_KEYS) {
      for (const f of COLOR_FIELDS) {
        const [r, g, b] = channels(key[f]);
        assert.ok(r >= ir && g >= ig && b >= ib, `t=${key.t} ${f} 0x${key[f].toString(16)}`);
      }
    }
  });
});

describe('timeOfDay', () => {
  test('t at a keyframe returns the exact keyframe values', () => {
    for (const key of DAY_KEYS) {
      assert.deepEqual(timeOfDay(key.t), key);
    }
  });

  test('random t bounded component-wise by adjacent keyframes', () => {
    const rand = makeRand(20260717);
    for (let n = 0; n < 32; n++) {
      const t = rand();
      const frame = timeOfDay(t);
      const [a, b] = adjacentKeys(t);
      for (const f of SCALAR_FIELDS) {
        const lo = Math.min(a[f], b[f]), hi = Math.max(a[f], b[f]);
        assert.ok(frame[f] >= lo && frame[f] <= hi, `t=${t} ${f}=${frame[f]} not in [${lo},${hi}]`);
      }
      for (const f of COLOR_FIELDS) {
        const ca = channels(a[f]), cb = channels(b[f]), cf = channels(frame[f]);
        for (let ch = 0; ch < 3; ch++) {
          const lo = Math.min(ca[ch], cb[ch]), hi = Math.max(ca[ch], cb[ch]);
          assert.ok(cf[ch] >= lo && cf[ch] <= hi, `t=${t} ${f} ch${ch}=${cf[ch]} not in [${lo},${hi}]`);
        }
      }
    }
  });

  test('sunDir always normalized with y > 0.05 (sun never sets)', () => {
    const rand = makeRand(42);
    const ts = [...DAY_KEYS.map(k => k.t)];
    for (let n = 0; n < 100; n++) ts.push(rand());
    for (const t of ts) {
      const [x, y, z] = timeOfDay(t).sunDir;
      assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9, `t=${t} |sunDir| != 1`);
      assert.ok(y > 0.05, `t=${t} sunDir y=${y}`);
    }
  });

  test('wraps: t just above 0.85 blends dusk toward morning', () => {
    const frame = timeOfDay(0.925); // halfway through the wrap segment
    const dusk = DAY_KEYS[3], morning = DAY_KEYS[0];
    assert.ok(Math.abs(frame.sunIntensity - (dusk.sunIntensity + morning.sunIntensity) / 2) < 1e-9);
    assert.ok(Math.abs(frame.fogNear - (dusk.fogNear + morning.fogNear) / 2) < 1e-9);
    // negative t also wraps into the same segment
    assert.deepEqual(timeOfDay(-0.075), frame);
  });

  test('lerpColor endpoints are exact', () => {
    assert.equal(lerpColor(PAPER.sky, PAPER.peach, 0), PAPER.sky);
    assert.equal(lerpColor(PAPER.sky, PAPER.peach, 1), PAPER.peach);
  });
});
