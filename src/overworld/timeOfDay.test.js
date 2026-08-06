import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_KEYS, COLOR_FIELDS, SCALAR_FIELDS, timeOfDay, lerpColor, isNight } from './timeOfDay.js';
import { PAPER } from '../config.js';

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
  test('eight wrapping keyframes at the mandated times', () => {
    assert.equal(DAY_KEYS.length, 8);
    assert.deepEqual(DAY_KEYS.map(k => k.t), [0.0, 0.14, 0.32, 0.62, 0.76, 0.84, 0.90, 0.96]);
  });

  test('keyframe times are strictly ascending and start at zero', () => {
    assert.equal(DAY_KEYS[0].t, 0);
    for (let i = 1; i < DAY_KEYS.length; i++) {
      assert.ok(DAY_KEYS[i].t > DAY_KEYS[i - 1].t, `key ${i} out of order`);
      assert.ok(DAY_KEYS[i].t < 1, `key ${i} must stay below 1`);
    }
  });

  test('every keyframe declares every interpolated field', () => {
    for (const key of DAY_KEYS) {
      for (const f of [...COLOR_FIELDS, ...SCALAR_FIELDS]) {
        assert.equal(typeof key[f], 'number', `t=${key.t} missing ${f}`);
      }
      assert.equal(key.sunDir.length, 3, `t=${key.t} sunDir`);
    }
  });

  // THE papercut law, and the reason "real night" here is deep teal-indigo
  // rather than darkness: PAPER.inkTeal is the floor for every channel of
  // every colour the light rig can ever produce.
  test('no keyframe color channel darker than PAPER.inkTeal (papercut law)', () => {
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    for (const key of DAY_KEYS) {
      for (const f of COLOR_FIELDS) {
        const [r, g, b] = channels(key[f]);
        assert.ok(r >= ir && g >= ig && b >= ib, `t=${key.t} ${f} 0x${key[f].toString(16)}`);
      }
    }
  });

  test('the cycle actually reaches night, and noon is fully day', () => {
    const nights = DAY_KEYS.map(k => k.night);
    assert.ok(Math.max(...nights) === 1, 'some keyframe is full night');
    assert.equal(DAY_KEYS.find(k => k.t === 0.32).night, 0, 'noon is day');
  });

  test('night keyframes still light the world (moon is a key light)', () => {
    for (const key of DAY_KEYS) {
      if (key.night < 0.5) continue;
      assert.ok(key.sunIntensity >= 0.25, `t=${key.t} moonlight too weak to navigate by`);
      assert.ok(key.hemiIntensity >= 0.4, `t=${key.t} fill too weak`);
    }
  });

  test('fog is denser at night and thinnest at noon', () => {
    const noon = DAY_KEYS.find(k => k.t === 0.32);
    const deepNight = DAY_KEYS.find(k => k.t === 0.96);
    assert.ok(noon.fogDensity < deepNight.fogDensity);
    for (const key of DAY_KEYS) assert.ok(key.fogDensity > 0 && key.fogHeightK > 0, `t=${key.t}`);
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
    for (let n = 0; n < 64; n++) {
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

  // Because every keyframe is inside the palette and interpolation is
  // component-wise, EVERY frame of the cycle is too — including the ones
  // between dusk and night, which is where a naive rig goes black.
  test('no interpolated frame drops below PAPER.inkTeal either', () => {
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    for (let n = 0; n <= 400; n++) {
      const t = n / 400;
      const frame = timeOfDay(t);
      for (const f of COLOR_FIELDS) {
        const [r, g, b] = channels(frame[f]);
        assert.ok(r >= ir && g >= ig && b >= ib, `t=${t.toFixed(3)} ${f} 0x${frame[f].toString(16)}`);
      }
    }
  });

  test('sunDir always normalized with y > 0.05 (key light never sets)', () => {
    const rand = makeRand(42);
    const ts = [...DAY_KEYS.map(k => k.t)];
    for (let n = 0; n < 100; n++) ts.push(rand());
    for (const t of ts) {
      const [x, y, z] = timeOfDay(t).sunDir;
      assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9, `t=${t} |sunDir| != 1`);
      assert.ok(y > 0.05, `t=${t} sunDir y=${y}`);
    }
  });

  test('night rises and falls exactly once across the cycle', () => {
    // Sampled coarsely: day in the middle, night at the wrap.
    assert.equal(timeOfDay(0.32).night, 0);
    assert.equal(timeOfDay(0.50).night, 0);
    assert.ok(timeOfDay(0.86).night > 0.6);
    assert.equal(timeOfDay(0.93).night, 1);
    assert.ok(timeOfDay(0.99).night > 0.2, 'still dark just before dawn');
    assert.ok(timeOfDay(0.05).night < 0.22, 'dawn is burning the stars off');
  });

  test('isNight agrees with the night field', () => {
    assert.equal(isNight(0.32), false);
    assert.equal(isNight(0.92), true);
    assert.equal(isNight(timeOfDay(0.92)), true);
  });

  test('wraps: t just past the last key blends deep night toward dawn', () => {
    const frame = timeOfDay(0.98); // halfway through the wrap segment
    const deep = DAY_KEYS[7], dawn = DAY_KEYS[0];
    assert.ok(Math.abs(frame.sunIntensity - (deep.sunIntensity + dawn.sunIntensity) / 2) < 1e-9);
    assert.ok(Math.abs(frame.fogDensity - (deep.fogDensity + dawn.fogDensity) / 2) < 1e-9);
    // negative t also wraps into the same segment
    assert.deepEqual(timeOfDay(-0.02), frame);
  });

  test('lerpColor endpoints are exact', () => {
    assert.equal(lerpColor(PAPER.sky, PAPER.peach, 0), PAPER.sky);
    assert.equal(lerpColor(PAPER.sky, PAPER.peach, 1), PAPER.peach);
  });
});
