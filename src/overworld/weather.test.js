import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER, WEATHER_NAMES, weatherByName, blendWeather, createWeatherParams,
  createRenderFrame, applyWeather, createWeatherBlender,
} from './weather.js';
import { timeOfDay, COLOR_FIELDS } from './timeOfDay.js';
import { PAPER } from '../config.js';

function channels(c) {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

describe('WEATHER table', () => {
  test('exactly the four named states', () => {
    assert.deepEqual(WEATHER_NAMES, ['clear', 'breezy', 'rain', 'mist']);
    assert.equal(WEATHER.length, 4);
  });

  test('every state carries the same field set', () => {
    const keys = Object.keys(WEATHER[0]).sort();
    for (const w of WEATHER) assert.deepEqual(Object.keys(w).sort(), keys, w.name);
  });

  test('every tint is at or above PAPER.inkTeal per channel', () => {
    // This is what makes the palette proof in applyWeather work: lerping a
    // frame colour toward a tint can only stay inside the floor if BOTH ends
    // are above it.
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    for (const w of WEATHER) {
      const [r, g, b] = channels(w.tint);
      assert.ok(r >= ir && g >= ig && b >= ib, `${w.name} tint`);
    }
  });

  test('rain and mist actually thicken the air; breezy clears it', () => {
    const by = (n) => weatherByName(n);
    assert.ok(by('rain').fogDensityMul > by('clear').fogDensityMul);
    assert.ok(by('mist').fogDensityMul > by('rain').fogDensityMul);
    assert.ok(by('breezy').fogDensityMul < by('clear').fogDensityMul);
    // Mist is a LOW bank: density must fall off with height far faster.
    assert.ok(by('mist').fogHeightKMul > 2);
  });

  test('rain flattens the key:fill ratio (overcast softbox)', () => {
    // The signature of overcast is not "everything darker" — it is that the
    // KEY collapses much further than the fill, so shadows go soft and shallow
    // instead of black. Asserting the ratio rather than the absolute keeps
    // that intent stable while the two are tuned against screenshots.
    const rain = weatherByName('rain');
    const clear = weatherByName('clear');
    assert.ok(rain.sunMul < 0.7, 'key light collapses');
    assert.ok(rain.hemiMul / rain.sunMul > (clear.hemiMul / clear.sunMul) * 1.5,
      `fill:key ratio must rise sharply (got ${rain.hemiMul / rain.sunMul})`);
    assert.ok(rain.hemiMul < 1.0, 'but the world still dims overall');
    assert.ok(rain.shaftMul < 0.1, 'no god rays under cloud');
    assert.equal(rain.rain, 1);
    assert.ok(rain.wind > 2, 'rain drives the wind harder');
  });

  test('weatherByName rejects nonsense', () => {
    assert.equal(weatherByName('snow'), null);
    assert.equal(weatherByName(''), null);
  });
});

describe('blendWeather', () => {
  test('endpoints are exact', () => {
    const a = weatherByName('clear'), b = weatherByName('rain');
    const lo = blendWeather(a, b, 0);
    const hi = blendWeather(a, b, 1);
    for (const k of Object.keys(a)) {
      if (k === 'name') continue;
      assert.equal(lo[k], a[k], `u=0 ${k}`);
      assert.equal(hi[k], b[k], `u=1 ${k}`);
    }
    assert.equal(lo.name, 'clear');
    assert.equal(hi.name, 'rain');
  });

  test('clamps out-of-range u', () => {
    const a = weatherByName('clear'), b = weatherByName('mist');
    assert.equal(blendWeather(a, b, -3).fogDensityMul, a.fogDensityMul);
    assert.equal(blendWeather(a, b, 9).fogDensityMul, b.fogDensityMul);
  });

  test('writes into the supplied record without allocating a new one', () => {
    const out = createWeatherParams();
    const got = blendWeather(weatherByName('clear'), weatherByName('rain'), 0.5, out);
    assert.equal(got, out);
    assert.ok(out.rain > 0 && out.rain < 1);
  });
});

describe('applyWeather', () => {
  test('every hour x every weather stays inside the palette floor', () => {
    // The core guarantee: there is no time of day and no weather that can
    // push any lighting colour below PAPER.inkTeal.
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    const out = createRenderFrame();
    for (const w of WEATHER) {
      for (let n = 0; n <= 120; n++) {
        const t = n / 120;
        applyWeather(timeOfDay(t), w, out);
        for (const f of [...COLOR_FIELDS, 'bounceColor']) {
          const [r, g, b] = channels(out[f]);
          assert.ok(r >= ir && g >= ig && b >= ib,
            `${w.name} t=${t.toFixed(3)} ${f}=0x${out[f].toString(16)}`);
        }
      }
    }
  });

  test('mid-blend states are safe too', () => {
    const [ir, ig, ib] = channels(PAPER.inkTeal);
    const mid = blendWeather(weatherByName('clear'), weatherByName('rain'), 0.5);
    const out = createRenderFrame();
    for (let n = 0; n <= 60; n++) {
      applyWeather(timeOfDay(n / 60), mid, out);
      for (const f of COLOR_FIELDS) {
        const [r, g, b] = channels(out[f]);
        assert.ok(r >= ir && g >= ig && b >= ib, `t=${n / 60} ${f}`);
      }
    }
  });

  test('clear weather leaves the hour untouched', () => {
    const out = createRenderFrame();
    const frame = timeOfDay(0.32);
    applyWeather(frame, weatherByName('clear'), out);
    for (const f of COLOR_FIELDS) assert.equal(out[f], frame[f], f);
    assert.equal(out.sunIntensity, frame.sunIntensity);
    assert.equal(out.fogDensity, frame.fogDensity);
    assert.equal(out.rain, 0);
  });

  test('rain is darker and cooler than clear at the same hour', () => {
    const clear = createRenderFrame(), rain = createRenderFrame();
    const frame = timeOfDay(0.32);
    applyWeather(frame, weatherByName('clear'), clear);
    applyWeather(frame, weatherByName('rain'), rain);
    assert.ok(rain.sunIntensity < clear.sunIntensity, 'key light drops');
    assert.ok(rain.fogDensity > clear.fogDensity, 'air thickens');
    assert.ok(rain.shaft < clear.shaft, 'god rays die');
    // Cooler: the blue channel gains on the red channel in the fog.
    const c = channels(clear.fogColor), r = channels(rain.fogColor);
    assert.ok(r[2] - r[0] > c[2] - c[0], 'fog goes cooler');
  });

  test('night suppresses the sun-scatter lobe', () => {
    const day = createRenderFrame(), night = createRenderFrame();
    applyWeather(timeOfDay(0.32), weatherByName('clear'), day);
    applyWeather(timeOfDay(0.93), weatherByName('clear'), night);
    assert.ok(night.fogSunAmt < day.fogSunAmt * 0.5);
    assert.equal(night.night, 1);
  });

  test('does not allocate — the same out object is rewritten', () => {
    const out = createRenderFrame();
    const dir = out.sunDir;
    applyWeather(timeOfDay(0.7), weatherByName('mist'), out);
    assert.equal(out.sunDir, dir, 'sunDir array reused in place');
    assert.equal(out.weather, 'mist');
  });
});

describe('createWeatherBlender', () => {
  test('starts settled on its initial state', () => {
    const wb = createWeatherBlender('clear');
    assert.equal(wb.target, 'clear');
    assert.equal(wb.settled, true);
    assert.equal(wb.step(1), false, 'a settled blender does no work');
  });

  test('a change fades over the blend window and then settles', () => {
    const wb = createWeatherBlender('clear', 4);
    assert.equal(wb.set('rain'), 'rain');
    assert.equal(wb.settled, false);
    assert.equal(wb.params.rain, 0, 'the fade starts at the old state');
    wb.step(2);
    assert.ok(wb.params.rain > 0.4 && wb.params.rain < 0.6, `mid fade: ${wb.params.rain}`);
    wb.step(2);
    assert.equal(wb.settled, true);
    assert.equal(wb.params.rain, 1);
    assert.equal(wb.params.name, 'rain');
  });

  test('instant snaps for screenshot determinism', () => {
    const wb = createWeatherBlender('clear', 6);
    wb.set('mist', true);
    assert.equal(wb.settled, true);
    assert.equal(wb.params.fogDensityMul, weatherByName('mist').fogDensityMul);
  });

  test('retargeting mid-fade never snaps backward', () => {
    const wb = createWeatherBlender('clear', 4);
    wb.set('rain');
    wb.step(2);
    const midRain = wb.params.rain;
    wb.set('mist');
    // The first frame of the new fade must still be where we already were.
    assert.ok(Math.abs(wb.params.rain - midRain) < 1e-9);
    wb.step(4);
    assert.equal(wb.settled, true);
    assert.equal(wb.params.rain, 0);
    assert.equal(wb.params.fogDensityMul, weatherByName('mist').fogDensityMul);
  });

  test('unknown names are rejected and change nothing', () => {
    const wb = createWeatherBlender('clear');
    assert.equal(wb.set('hurricane'), null);
    assert.equal(wb.target, 'clear');
  });

  test('the params object identity is stable across steps', () => {
    const wb = createWeatherBlender('clear', 2);
    const p = wb.params;
    wb.set('breezy');
    wb.step(0.5);
    wb.step(0.5);
    assert.equal(wb.params, p);
  });
});
