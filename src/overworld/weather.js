/**
 * Weather — four states, one blend, everything downstream comes along for free.
 *
 * WHY weather is modelled as a TRANSFORM ON THE LIGHTING FRAME rather than as
 * a bag of independent effects: the thing that makes rain read as rain is not
 * the streaks, it is that the entire world agrees about it at once — the key
 * light drops, the fill rises (an overcast sky is one enormous softbox), the
 * fog thickens and cools, the sun's god-rays die, the clouds go slate-teal, the
 * water darkens, the grass whips harder. Every one of those consumers already
 * reads a single lighting frame from ./timeOfDay.js. So weather here produces a
 * MODIFIED FRAME, and sky, water, terrain, fog and the light rig all shift
 * together with no extra plumbing and no chance of one subsystem being sunny
 * while its neighbour is not.
 *
 * WHY the multipliers are relative and the tints are PAPER colours: a weather
 * state must compose with all eight hours of the day cycle without ever leaving
 * the palette. Since every timeOfDay colour is at or above PAPER.inkTeal per
 * channel, and every tint below is a PAPER constant that is ALSO at or above
 * PAPER.inkTeal per channel, a component-wise lerp between them cannot escape
 * that floor. Rain at deep night is therefore still teal-indigo paper, never
 * black. `weather.test.js` proves it over the whole cross product.
 *
 * WHY blending is a two-state crossfade rather than a queue: the only thing a
 * player perceives is "the weather is changing"; a crossfade of the parameter
 * vector is indistinguishable from a physical simulation at this scale, costs
 * one lerp, and — crucially — is DETERMINISTIC. `setWeather(name, true)` snaps
 * instantly so the screenshot harness can shoot a rain frame that is identical
 * on every machine.
 *
 * Pure data and pure math: no three import, so plain Node can test it.
 */
import { PAPER } from '../config.js';
import { lerpColor, COLOR_FIELDS } from './timeOfDay.js';

const mix = lerpColor;

/**
 * @typedef {object} WeatherState
 * @property {string} name
 * @property {number} fogDensityMul  multiplies the hour's own fog extinction
 * @property {number} fogHeightKMul  multiplies its vertical falloff — >1 packs
 *                                   the haze into the valleys (fog BANKS)
 * @property {number} fogBaseY       altitude the density is quoted at (m)
 * @property {number} fogStart       metres of perfectly clear air at the eye
 * @property {number} fogDesat       how far distant surfaces take the air's hue
 * @property {number} fogSunAmtMul   forward-scatter lobe strength near the key
 * @property {number} fogMax         extinction ceiling
 * @property {number} tint           PAPER colour the whole palette leans toward
 * @property {number} tintAmt        0..1 how far it leans
 * @property {number} skyTintAmt     the same lean, applied to the dome bands
 * @property {number} sunMul         key light scale
 * @property {number} hemiMul        sky/ground fill scale
 * @property {number} bounceMul      ground-bounce fill scale
 * @property {number} shaftMul       god-ray strength scale
 * @property {number} rain           0..1 streak density AND ripple density
 * @property {number} wind           animation-clock scale for foliage
 * @property {number} cloudTintAmt   how far the cloud plies lean to the tint
 * @property {number} cloudShadow    strength of the scrolling cloud shadows the
 *                                   aerial-fog chunk lays over the ground. This
 *                                   is a WEATHER property, not an hour one: a
 *                                   clear sky has hard travelling banks, an
 *                                   overcast one has none at all because the
 *                                   whole sky has become the source.
 */

/** @type {WeatherState[]} */
export const WEATHER = [
  {
    // The world's default: crisp air, long views, strong sun.
    name: 'clear',
    fogDensityMul: 1.0,
    fogHeightKMul: 1.0,
    fogBaseY: 0,
    fogStart: 4,
    fogDesat: 0.78,
    fogSunAmtMul: 1.0,
    fogMax: 1.0,
    tint: PAPER.sky,
    tintAmt: 0.0,
    skyTintAmt: 0.0,
    sunMul: 1.0,
    hemiMul: 1.0,
    bounceMul: 1.0,
    shaftMul: 1.0,
    rain: 0.0,
    wind: 1.0,
    cloudTintAmt: 0.0,
    cloudShadow: 0.55,
  },
  {
    // Bright and moving. Slightly cleaner air than clear (wind scours the
    // haze), harder god-rays through faster-moving canopy, lively grass.
    name: 'breezy',
    fogDensityMul: 0.86,
    fogHeightKMul: 1.10,
    fogBaseY: 0,
    fogStart: 5,
    fogDesat: 0.72,
    fogSunAmtMul: 1.25,
    fogMax: 1.0,
    tint: PAPER.sky,
    tintAmt: 0.10,
    skyTintAmt: 0.08,
    sunMul: 1.04,
    hemiMul: 1.0,
    bounceMul: 1.05,
    shaftMul: 1.30,
    rain: 0.0,
    wind: 2.1,
    cloudTintAmt: 0.10,
    // The signature of a breezy day is not the grass, it is the banks of
    // shade running across the field faster than you can walk.
    cloudShadow: 0.70,
  },
  {
    // Overcast downpour: key light collapses, fill RISES, the palette walks
    // toward deep teal. Cooler and darker — never grey, never black.
    name: 'rain',
    fogDensityMul: 2.9,
    fogHeightKMul: 0.72,
    fogBaseY: 0,
    fogStart: 3,
    fogDesat: 0.86,
    fogSunAmtMul: 0.12,
    fogMax: 1.0,
    // NOT PAPER.tealD on its own: a pure teal reads tropical, not overcast.
    // Half a step toward lavenderD lands on a slate blue-teal that says
    // "rain sky" while staying a lerp of two palette constants — so the
    // inkTeal floor still holds by construction.
    tint: mix(PAPER.tealD, PAPER.lavenderD, 0.45),
    tintAmt: 0.46,
    skyTintAmt: 0.56,
    sunMul: 0.50,
    hemiMul: 0.88,
    bounceMul: 0.62,
    shaftMul: 0.06,
    rain: 1.0,
    wind: 2.8,
    cloudTintAmt: 0.64,
    // Overcast has no discrete shadows at all — the whole sky is the source.
    cloudShadow: 0.0,
  },
  {
    // Thick low banks. The high fogHeightK is the whole effect: density is
    // enormous at the valley floor and has e-folded away to nothing by the
    // palace crown, so peaks float clear above a sea of cream.
    name: 'mist',
    fogDensityMul: 4.2,
    fogHeightKMul: 2.9,
    fogBaseY: 1.5,
    fogStart: 2,
    fogDesat: 0.90,
    fogSunAmtMul: 2.2,
    fogMax: 1.0,
    tint: PAPER.cream,
    tintAmt: 0.30,
    skyTintAmt: 0.22,
    sunMul: 0.74,
    hemiMul: 1.16,
    bounceMul: 0.85,
    shaftMul: 2.0,
    rain: 0.0,
    wind: 0.55,
    cloudTintAmt: 0.18,
    cloudShadow: 0.14,
  },
];

export const WEATHER_NAMES = WEATHER.map((w) => w.name);

/** Seconds a weather change takes to cross-fade. */
export const WEATHER_BLEND_SECONDS = 6;

const NUMERIC_FIELDS = Object.keys(WEATHER[0]).filter((k) => k !== 'name' && k !== 'tint');

/** @returns {WeatherState|null} */
export function weatherByName(name) {
  return WEATHER.find((w) => w.name === name) || null;
}

/** A zeroed weather record, safe to pass as the `out` of blendWeather. */
export function createWeatherParams() {
  const out = { name: WEATHER[0].name, tint: WEATHER[0].tint };
  for (const f of NUMERIC_FIELDS) out[f] = WEATHER[0][f];
  return out;
}

/**
 * Cross-fade two weather states into `out`. Allocation-free when `out` is
 * supplied. Endpoints are exact (u === 0 / 1 return the endpoint's values).
 *
 * @param {WeatherState} a
 * @param {WeatherState} b
 * @param {number} u 0..1
 * @param {object} [out]
 */
export function blendWeather(a, b, u, out = createWeatherParams()) {
  const f = u <= 0 ? 0 : u >= 1 ? 1 : u;
  out.name = f >= 0.5 ? b.name : a.name;
  out.tint = lerpColor(a.tint, b.tint, f);
  // Endpoints must be EXACT, not `a + (b-a)*1`: a settled blender feeds the
  // fog uniforms directly, and a state that is 0.06000000000000005 instead of
  // 0.06 makes two screenshots of the same "rain" differ in the last bit.
  const src = f === 0 ? a : f === 1 ? b : null;
  if (src) {
    for (const k of NUMERIC_FIELDS) out[k] = src[k];
    return out;
  }
  for (const k of NUMERIC_FIELDS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

/**
 * A render frame: a timeOfDay frame with weather folded in, plus the resolved
 * aerial-fog parameters and the FX drives. Preallocated once and rewritten in
 * place every time the day or the weather moves — nothing here allocates.
 */
export function createRenderFrame() {
  return {
    t: 0,
    sunDir: [0, 1, 0],
    // lighting
    sunColor: PAPER.white, sunIntensity: 1,
    hemiSky: PAPER.sky, hemiGround: PAPER.sage, hemiIntensity: 0.6,
    bounceColor: PAPER.sage, bounceIntensity: 0.25,
    // sky + atmosphere
    fogColor: PAPER.cream, skyTop: PAPER.sky, skyMid: PAPER.sky, skyBottom: PAPER.cream,
    fogDensity: 0.007, fogHeightK: 0.03, fogBaseY: 0, fogStart: 9,
    fogDesat: 0.5, fogSunAmt: 0.35, fogMax: 1,
    // drives
    night: 0, shaft: 0, rain: 0, wind: 1, cloudTint: PAPER.sky, cloudTintAmt: 0,
    cloudShadow: 0,
    weather: 'clear',
  };
}

// Fields that the weather tint leans on, and how hard relative to tintAmt.
// The sun keeps most of its own colour (weather changes the QUANTITY of key
// light far more than its hue); fog and the dome take the full lean.
const TINT_WEIGHTS = {
  sunColor: 0.45,
  hemiSky: 0.95,
  hemiGround: 0.75,
  fogColor: 1.0,
  skyTop: 0,      // handled by skyTintAmt
  skyMid: 0,
  skyBottom: 0,
};
const SKY_FIELDS = ['skyTop', 'skyMid', 'skyBottom'];

/**
 * Fold a weather state into a lighting frame. Zero allocation.
 *
 * @param {object} frame  a timeOfDay() frame
 * @param {WeatherState} w  blended weather params
 * @param {object} out  createRenderFrame() record, rewritten in place
 */
export function applyWeather(frame, w, out) {
  out.t = frame.t;
  out.sunDir[0] = frame.sunDir[0];
  out.sunDir[1] = frame.sunDir[1];
  out.sunDir[2] = frame.sunDir[2];
  out.weather = w.name;

  for (const f of COLOR_FIELDS) {
    const weight = TINT_WEIGHTS[f] ?? 0;
    out[f] = weight > 0 ? lerpColor(frame[f], w.tint, w.tintAmt * weight) : frame[f];
  }
  for (const f of SKY_FIELDS) out[f] = lerpColor(frame[f], w.tint, w.skyTintAmt);

  out.sunIntensity = frame.sunIntensity * w.sunMul;
  out.hemiIntensity = frame.hemiIntensity * w.hemiMul;
  // Bounce is the ground throwing the key light back up under everything, so
  // it is tinted by the ground half of the hemisphere and scaled by the key.
  out.bounceColor = out.hemiGround;
  out.bounceIntensity = frame.bounceIntensity * w.bounceMul;

  out.fogDensity = frame.fogDensity * w.fogDensityMul;
  out.fogHeightK = frame.fogHeightK * w.fogHeightKMul;
  out.fogBaseY = w.fogBaseY;
  out.fogStart = w.fogStart;
  out.fogDesat = w.fogDesat;
  out.fogSunAmt = 0.35 * w.fogSunAmtMul * (1 - frame.night * 0.7);
  out.fogMax = w.fogMax;

  out.night = frame.night;
  out.shaft = frame.shaft * w.shaftMul;
  out.rain = w.rain;
  out.wind = w.wind;
  out.cloudTint = w.tint;
  out.cloudTintAmt = w.cloudTintAmt;
  // Cloud shadows are daylight-only: the moon does not cast a cloud bank a
  // child can see, so they fade out on the night drive rather than being
  // switched. The teal-leaning multiplier they use lives in aerialFog.js,
  // because it is an output-space constant rather than a palette colour.
  out.cloudShadow = w.cloudShadow * (1 - frame.night);
  return out;
}

/**
 * Deterministic two-state weather machine.
 *
 * `step(dt)` advances the cross-fade and returns true when the blended params
 * actually changed, so callers can skip relighting on a settled frame. Nothing
 * here allocates after construction.
 *
 * @param {string} [initial]
 * @param {number} [blendSeconds]
 */
export function createWeatherBlender(initial = 'clear', blendSeconds = WEATHER_BLEND_SECONDS) {
  let from = weatherByName(initial) || WEATHER[0];
  let to = from;
  let u = 1;
  const params = createWeatherParams();
  blendWeather(from, to, 1, params);

  return {
    /** Blended parameters — a live object, rewritten in place. Do not store. */
    params,
    get target() { return to.name; },
    get settled() { return u >= 1; },
    /** 0..1 progress of the current cross-fade. */
    get blend() { return u; },

    /**
     * @param {string} name one of WEATHER_NAMES
     * @param {boolean} [instant] snap (screenshot determinism) instead of fading
     * @returns {string|null} the accepted target, or null for an unknown name
     */
    set(name, instant = false) {
      const next = weatherByName(name);
      if (!next) return null;
      if (instant) {
        from = next; to = next; u = 1;
      } else if (next !== to) {
        // Freeze the CURRENT blend as the new origin so a change mid-fade
        // never snaps backward.
        from = blendWeather(from, to, u, createWeatherParams());
        from.name = to.name;
        to = next;
        u = 0;
      }
      blendWeather(from, to, u, params);
      return to.name;
    },

    step(dt) {
      if (u >= 1) return false;
      u = Math.min(1, u + (blendSeconds > 0 ? dt / blendSeconds : 1));
      blendWeather(from, to, u, params);
      return true;
    },
  };
}
