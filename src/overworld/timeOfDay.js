/**
 * Time-of-day cycle for the overworld light rig — pure keyframe math.
 *
 * ── The night problem, and how this world solves it ────────────────────────
 * The papercut palette bans black. A literal night — "multiply everything by
 * 0.1" — would put the whole frame under PAPER.inkTeal and turn a bright kids'
 * diorama into a horror set. So night here is not an absence of light, it is a
 * DIFFERENT PAPER: deep teal-indigo stock (every channel still at or above
 * PAPER.inkTeal), lit by a warm moon instead of a warm sun, with stars printed
 * on the dome and fireflies in the grass. It is dim enough that a five-year-old
 * knows it is night and bright enough that they can still see where to walk.
 *
 * Eight keyframes wrap around t in [0,1):
 *
 *   0.00 dawn        first light, rose over cool paper, stars still fading
 *   0.14 morning     cool paper light from the east
 *   0.32 noon        brightest, key light almost overhead
 *   0.62 golden      warm low sun from the west
 *   0.76 dusk        golden-lavender, the sun on the horizon
 *   0.84 twilight    lavender-indigo, first stars, key light handing over
 *   0.90 night       deep teal-indigo, warm moon high, fireflies out
 *   0.96 deep night  the darkest the palette is allowed to go
 *
 * ── Two invariants this file exists to protect ────────────────────────────
 * 1. Every colour is a PAPER constant or a lerp of two, so any interpolated
 *    frame stays inside the palette's convex hull — including at night, where
 *    the DARKEST endpoint is PAPER.inkTeal itself. `timeOfDay.test.js` asserts
 *    no keyframe channel drops below it.
 * 2. `sunDir` is the KEY LIGHT direction, not "where the sun is". At night the
 *    key light is the moon, and the moon is up, so sunDir.y stays above ~0.2
 *    across the whole cycle. Downstream code (shadow rig, sky body billboard,
 *    water sparkle) needs exactly one always-valid overhead direction, and the
 *    same nlerp that keeps it unit-length keeps it above the horizon.
 *
 * The sky body billboard in sky.js rides sunDir and cross-fades sun -> moon on
 * the `night` field, which is why the twilight key already lifts the direction
 * off the horizon: the sun sinks, and the moon rises in its place.
 *
 * ── The KEY:FILL contract (read this before touching an intensity) ────────
 * The single thing that separates a Nintendo frame from an asset dump is that
 * a shaded surface is a DIFFERENT COLOUR FAMILY from a lit one, not a slightly
 * cooler version of it. That is a ratio, and it is set here.
 *
 * The rig has three sources (index.js): `sun` is ramped through the toon
 * gradient, `bounce` is ramped, `hemi` is flat indirect that NOTHING ramps. So
 * hemi is the number that decides how deep a shadow may go, and every daylight
 * key below deliberately runs it at roughly a fifth of the key rather than the
 * half it used to be. Combined with the darker shade texel in materials/toon.js
 * a fully shadowed daylight surface now sits near 30% of a lit one instead of
 * ~55%: form, not tint.
 *
 * NIGHT IS THE EXCEPTION AND MUST STAY ONE. After dusk the moon is a weak key
 * and the fill IS the light — drop it and a five-year-old cannot see the path.
 * The night keys therefore keep hemiIntensity at ~0.5, and timeOfDay.test.js
 * pins that floor at 0.4 so nobody "consistency-fixes" it later.
 *
 * ── Sun elevation is art direction, not astronomy ─────────────────────────
 * The noon key used to sit at 72° — nearly zenith — which is exactly why the
 * old vistas had no directional read: a tree's shadow was a puddle under the
 * tree. Every key now sits between 13° and 44°, so everything in the world
 * throws its shadow ACROSS the ground plane. A cast shadow travelling over a
 * surface is the cheapest depth cue that exists and this world had none.
 *
 * Scalar fields (all interpolated, all bounded by their adjacent keyframes):
 *   sunIntensity      key light strength
 *   hemiIntensity     sky/ground fill strength
 *   bounceIntensity   ground-bounce fill strength (see index.js)
 *   fogDensity        aerial-perspective extinction per metre at sea level
 *   fogHeightK        vertical e-folding rate of that extinction
 *   shaft             light-shaft (god ray) strength near the key light
 *   night             0 day .. 1 night; drives stars, fireflies, moon, palette
 */
import { PAPER } from '../config.js';

/** Component-wise lerp of two 0xRRGGBB ints; endpoints return exactly. */
export function lerpColor(a, b, u) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const mix = lerpColor;

export const DAY_KEYS = [
  { // dawn — first light. Rose and gold on cool paper; the last stars fade.
    t: 0.0,
    sunDir: normalize([0.72, 0.20, 0.30]),
    sunColor: mix(PAPER.gold, PAPER.rose, 0.40),
    sunIntensity: 1.00,
    hemiSky: mix(PAPER.sky, PAPER.lavender, 0.45),
    hemiGround: mix(PAPER.sageD, PAPER.tealD, 0.45),
    hemiIntensity: 0.30,
    bounceIntensity: 0.12,
    fogColor: mix(PAPER.peach, PAPER.sky, 0.45),
    fogDensity: 0.0150,
    fogHeightK: 0.050,
    shaft: 0.26,
    night: 0.22,
    skyTop: mix(PAPER.sky, PAPER.lavender, 0.35),
    skyMid: mix(PAPER.peach, PAPER.sky, 0.50),
    skyBottom: mix(PAPER.rose, PAPER.gold, 0.45),
  },
  { // morning — cool paper light from the east
    t: 0.14,
    // ~25° elevation: long raking shadows from the east across the meadow.
    sunDir: normalize([0.68, 0.34, 0.22]),
    sunColor: mix(PAPER.gold, PAPER.white, 0.35),
    sunIntensity: 1.20,
    hemiSky: PAPER.sky,
    hemiGround: PAPER.sage,
    hemiIntensity: 0.30,
    bounceIntensity: 0.13,
    fogColor: mix(PAPER.cream, PAPER.sky, 0.45),
    fogDensity: 0.0128,
    fogHeightK: 0.045,
    shaft: 0.20,
    night: 0.0,
    // The dome needs a real VALUE RAMP top to bottom or the upper frame is one
    // flat wash. Zenith pulls toward tealD, the horizon band warms toward gold:
    // three stops that are three different colours, not three tints of cream.
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.26),
    skyMid: mix(PAPER.sky, PAPER.cream, 0.55),
    skyBottom: mix(PAPER.cream, PAPER.gold, 0.20),
  },
  { // noon — brightest. NOT overhead: see the elevation note in the header.
    t: 0.32,
    // ~43°. A tree now lays its shadow a little longer than it is tall, which
    // is what ties every object in the frame to the ground it stands on.
    sunDir: normalize([0.55, 0.62, 0.36]),
    sunColor: PAPER.white,
    sunIntensity: 1.48,
    hemiSky: mix(PAPER.sky, PAPER.tealL, 0.25),
    hemiGround: PAPER.sage,
    hemiIntensity: 0.33,
    bounceIntensity: 0.15,
    fogColor: mix(PAPER.cream, PAPER.sky, 0.3),
    fogDensity: 0.0115,
    fogHeightK: 0.042,
    shaft: 0.12,
    night: 0.0,
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.34),
    skyMid: mix(PAPER.sky, PAPER.cream, 0.42),
    skyBottom: mix(PAPER.cream, PAPER.peach, 0.30),
  },
  { // golden hour — warm low sun from the west; the god-ray hour
    t: 0.62,
    sunDir: normalize([-0.55, 0.28, 0.22]),
    sunColor: PAPER.orange,
    sunIntensity: 1.34,
    hemiSky: mix(PAPER.sky, PAPER.peach, 0.4),
    hemiGround: PAPER.sageD,
    hemiIntensity: 0.32,
    bounceIntensity: 0.14,
    fogColor: mix(PAPER.peach, PAPER.cream, 0.4),
    fogDensity: 0.0135,
    fogHeightK: 0.044,
    shaft: 0.30,
    night: 0.0,
    skyTop: mix(PAPER.sky, PAPER.lavender, 0.3),
    skyMid: mix(PAPER.peach, PAPER.cream, 0.3),
    skyBottom: mix(PAPER.gold, PAPER.peach, 0.5),
  },
  { // dusk — golden-lavender, sun on the horizon
    t: 0.76,
    sunDir: normalize([-0.6, 0.16, 0.3]),
    sunColor: mix(PAPER.orange, PAPER.lavender, 0.35),
    sunIntensity: 1.10,
    hemiSky: PAPER.lavender,
    hemiGround: PAPER.tealD,
    hemiIntensity: 0.33,
    bounceIntensity: 0.13,
    fogColor: mix(PAPER.lavender, PAPER.peach, 0.45),
    fogDensity: 0.0152,
    fogHeightK: 0.047,
    shaft: 0.22,
    night: 0.10,
    skyTop: PAPER.lavender,
    skyMid: mix(PAPER.lavender, PAPER.peach, 0.5),
    skyBottom: PAPER.peach,
  },
  { // twilight — indigo climbing out of the east, first stars, moon rising
    t: 0.84,
    sunDir: normalize([-0.55, 0.14, 0.30]),
    sunColor: mix(PAPER.orange, PAPER.lavender, 0.62),
    sunIntensity: 0.72,
    hemiSky: mix(PAPER.lavender, PAPER.lavenderD, 0.6),
    hemiGround: mix(PAPER.tealD, PAPER.inkTeal, 0.5),
    // From here on the fill stops falling and starts HOLDING: the key is
    // handing over to a moon that cannot light a playfield on its own.
    hemiIntensity: 0.44,
    bounceIntensity: 0.12,
    fogColor: mix(PAPER.lavenderD, PAPER.peach, 0.30),
    fogDensity: 0.0168,
    fogHeightK: 0.048,
    shaft: 0.10,
    night: 0.62,
    skyTop: mix(PAPER.lavenderD, PAPER.inkTeal, 0.34),
    skyMid: PAPER.lavender,
    skyBottom: mix(PAPER.coral, PAPER.lavender, 0.45),
  },
  { // night — deep teal-indigo, warm moon high in the west. NEVER black:
    // every channel below sits at or above PAPER.inkTeal by construction.
    t: 0.90,
    sunDir: normalize([-0.30, 0.80, 0.28]),
    sunColor: mix(PAPER.cream, PAPER.lavender, 0.62),
    sunIntensity: 0.46,
    hemiSky: mix(PAPER.inkTeal, PAPER.lavenderD, 0.62),
    hemiGround: mix(PAPER.inkTeal, PAPER.tealD, 0.5),
    hemiIntensity: 0.52,
    bounceIntensity: 0.09,
    fogColor: mix(PAPER.inkTeal, PAPER.lavenderD, 0.44),
    fogDensity: 0.0180,
    fogHeightK: 0.044,
    shaft: 0.0,
    night: 1.0,
    skyTop: mix(PAPER.inkTeal, PAPER.lavenderD, 0.34),
    skyMid: mix(PAPER.inkTeal, PAPER.lavenderD, 0.50),
    skyBottom: mix(PAPER.inkTeal, PAPER.lavender, 0.55),
  },
  { // deep night — the floor of the palette. Moon near the zenith so the
    // world still casts soft, readable shadows for a kid to navigate by.
    t: 0.96,
    sunDir: normalize([0.05, 0.86, 0.30]),
    sunColor: mix(PAPER.cream, PAPER.lavender, 0.58),
    sunIntensity: 0.42,
    hemiSky: mix(PAPER.inkTeal, PAPER.lavenderD, 0.56),
    hemiGround: mix(PAPER.inkTeal, PAPER.tealD, 0.42),
    hemiIntensity: 0.50,
    bounceIntensity: 0.08,
    fogColor: mix(PAPER.inkTeal, PAPER.lavenderD, 0.40),
    fogDensity: 0.0186,
    fogHeightK: 0.043,
    shaft: 0.0,
    night: 1.0,
    skyTop: mix(PAPER.inkTeal, PAPER.lavenderD, 0.28),
    skyMid: mix(PAPER.inkTeal, PAPER.lavenderD, 0.44),
    skyBottom: mix(PAPER.inkTeal, PAPER.lavender, 0.46),
  },
];

export const COLOR_FIELDS = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyMid', 'skyBottom'];
export const SCALAR_FIELDS = [
  'sunIntensity', 'hemiIntensity', 'bounceIntensity',
  'fogDensity', 'fogHeightK', 'shaft', 'night',
];

function copyFrame(k, t) {
  const out = { t, sunDir: [k.sunDir[0], k.sunDir[1], k.sunDir[2]] };
  for (const f of COLOR_FIELDS) out[f] = k[f];
  for (const f of SCALAR_FIELDS) out[f] = k[f];
  return out;
}

/**
 * Interpolated lighting frame at wrapped time t in [0,1).
 * Exact keyframe times return the keyframe verbatim (no fp drift from
 * re-normalizing an already-unit sunDir).
 */
export function timeOfDay(t) {
  // Wrap without `(t%1+1)%1` — adding 1 before the mod perturbs values
  // like 0.3 in fp, which would break exact keyframe returns.
  let u = t % 1;
  if (u < 0) u += 1;
  const n = DAY_KEYS.length;
  let i = 0;
  for (let k = 0; k < n; k++) if (DAY_KEYS[k].t <= u) i = k;
  const a = DAY_KEYS[i];
  const b = DAY_KEYS[(i + 1) % n];
  const span = (b.t - a.t + 1) % 1 || 1;
  const f = (u - a.t) / span;
  if (f === 0) return copyFrame(a, u);

  const out = {
    t: u,
    sunDir: normalize([
      a.sunDir[0] + (b.sunDir[0] - a.sunDir[0]) * f,
      a.sunDir[1] + (b.sunDir[1] - a.sunDir[1]) * f,
      a.sunDir[2] + (b.sunDir[2] - a.sunDir[2]) * f,
    ]),
  };
  for (const c of COLOR_FIELDS) out[c] = lerpColor(a[c], b[c], f);
  for (const s of SCALAR_FIELDS) out[s] = a[s] + (b[s] - a[s]) * f;
  return out;
}

/** Is this frame (or time) in the part of the cycle that reads as night? */
export function isNight(tOrFrame) {
  const n = typeof tOrFrame === 'number' ? timeOfDay(tOrFrame).night : tOrFrame.night;
  return n >= 0.5;
}
