/**
 * Time-of-day cycle for the overworld light rig — pure keyframe math.
 *
 * The papercut world must never read as "night": the palette law bans
 * black, so the darkest any channel may go is PAPER.inkTeal, and dusk is
 * a golden-lavender glow rather than darkness. Four keyframes (morning,
 * noon, golden hour, dusk) wrap around t ∈ [0,1); every color below is
 * either a PAPER constant or a lerp of two PAPER constants, so any
 * interpolated frame stays inside the palette's convex hull. Sun
 * elevation (sunDir y) never dips below ~0.15 pre-normalization, so the
 * sun never sets — nlerp between adjacent frames can only keep y at or
 * above the smaller endpoint (|lerp| <= 1 for unit endpoints).
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
  { // morning — cool paper light from the east
    t: 0.0,
    sunDir: normalize([0.6, 0.45, 0.25]),
    sunColor: mix(PAPER.gold, PAPER.white, 0.35),
    sunIntensity: 0.9,
    hemiSky: PAPER.sky,
    hemiGround: PAPER.sage,
    hemiIntensity: 0.55,
    fogColor: mix(PAPER.cream, PAPER.sky, 0.45),
    fogNear: 120,
    fogFar: 430,
    skyTop: PAPER.sky,
    skyMid: mix(PAPER.sky, PAPER.cream, 0.55),
    skyBottom: PAPER.cream,
  },
  { // noon — brightest, sun almost overhead
    t: 0.3,
    sunDir: normalize([0.12, 0.95, 0.08]),
    sunColor: PAPER.white,
    sunIntensity: 1.15,
    hemiSky: mix(PAPER.sky, PAPER.tealL, 0.25),
    hemiGround: PAPER.sage,
    hemiIntensity: 0.65,
    fogColor: mix(PAPER.cream, PAPER.sky, 0.3),
    fogNear: 150,
    fogFar: 480,
    skyTop: mix(PAPER.sky, PAPER.tealL, 0.2),
    skyMid: mix(PAPER.sky, PAPER.cream, 0.4),
    skyBottom: PAPER.cream,
  },
  { // golden hour — warm low sun from the west
    t: 0.62,
    sunDir: normalize([-0.55, 0.28, 0.22]),
    sunColor: PAPER.orange,
    sunIntensity: 1.0,
    hemiSky: mix(PAPER.sky, PAPER.peach, 0.4),
    hemiGround: PAPER.sageD,
    hemiIntensity: 0.6,
    fogColor: mix(PAPER.peach, PAPER.cream, 0.4),
    fogNear: 110,
    fogFar: 400,
    skyTop: mix(PAPER.sky, PAPER.lavender, 0.3),
    skyMid: mix(PAPER.peach, PAPER.cream, 0.3),
    skyBottom: mix(PAPER.gold, PAPER.peach, 0.5),
  },
  { // dusk — golden-lavender, NOT night; sun stays above the horizon
    t: 0.85,
    sunDir: normalize([-0.6, 0.16, 0.3]),
    sunColor: mix(PAPER.orange, PAPER.lavender, 0.35),
    sunIntensity: 0.8,
    hemiSky: PAPER.lavender,
    hemiGround: PAPER.tealD,
    hemiIntensity: 0.5,
    fogColor: mix(PAPER.lavender, PAPER.peach, 0.45),
    fogNear: 90,
    fogFar: 360,
    skyTop: PAPER.lavender,
    skyMid: mix(PAPER.lavender, PAPER.peach, 0.5),
    skyBottom: PAPER.peach,
  },
];

const COLOR_FIELDS = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyMid', 'skyBottom'];
const SCALAR_FIELDS = ['sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar'];

function copyFrame(k, t) {
  const out = { t, sunDir: [k.sunDir[0], k.sunDir[1], k.sunDir[2]] };
  for (const f of COLOR_FIELDS) out[f] = k[f];
  for (const f of SCALAR_FIELDS) out[f] = k[f];
  return out;
}

/**
 * Interpolated lighting frame at wrapped time t ∈ [0,1).
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
