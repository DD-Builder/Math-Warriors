/**
 * traversalSpec — where on the island you climb, where you fly, and what
 * lifts you. Pure data plus the small pure helpers that read it. No engine
 * imports, so plain Node can (and does) verify every entry against the real
 * heightfield.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * An ability nobody can find is an ability nobody has. traversal.js makes
 * every surface over 50 degrees climbable, which sounds generous until you
 * stand on a 480 m island and cannot tell which lump is a wall and which is a
 * hill. This file names TEN specific faces and ELEVEN specific flight paths,
 * so the FX layer can chalk hand-holds on the real rock and plant a wind-sock
 * on the real rim, and a child walking past a cliff can SEE that it is a
 * ladder.
 *
 * ── EVERY NUMBER IN HERE WAS MEASURED, NOT GUESSED ─────────────────────────
 * Each route was found by sweeping every bearing around every biome, running
 * the ACTUAL traversal controller up the face for twenty seconds, and keeping
 * the bearing with the biggest verified height gain that ends with the hero
 * standing on top. traversalSpec.test.js re-runs exactly that simulation
 * against the live heightfield, so a terrain edit that flattens a cliff turns
 * a test red instead of quietly deleting a landmark. Same for glide lines: the
 * test flies them.
 *
 * Coordinates match worldSpec.js — x east(+), z south(+), y up, ocean at 0.
 */
import { PAPER } from '../config.js';
import { DEFAULT_TRAVERSAL_TUNING } from './traversal.js';

/**
 * THE CLIMBS. `base` is standable ground at the foot of the face; `dir` is the
 * unit stick direction that latches onto it (it points INTO the rock). `gain`
 * is the verified height the face is worth, `topY` where you end up.
 *
 * `grade` is for the FX layer and for a child's expectations, not for physics:
 *   easy    under 15 m — one lungful, no chance of running dry
 *   fair    15-30 m — you will watch the ring, you will still make it
 *   epic    over 45 m — the pool is genuinely the limit and the summit is the
 *           reward. There are exactly two of these, and they are the two
 *           silhouettes you can see from the spawn meadow.
 */
export const CLIMB_ROUTES = [
  {
    id: 'climb-garden-spur', name: 'First Steps', biome: 'garden', grade: 'easy',
    base: { x: -20.4, z: 147.5 }, dir: { x: -0.924, z: -0.383 },
    gain: 9.2, topY: 23.0, hold: PAPER.leaf,
    note: 'Twenty-eight metres from the spawn pad — the garden-spur ridge, and '
        + 'the only cliff on the island a child meets before they know cliffs '
        + 'are climbable. Nine metres, no chance of running dry, top visible '
        + 'from the bottom.',
  },
  {
    id: 'climb-garden-east', name: 'Knollside Scramble', biome: 'garden', grade: 'easy',
    base: { x: 34.4, z: 131.0 }, dir: { x: 0.924, z: -0.383 },
    gain: 6.1, topY: 23.4, hold: PAPER.leaf,
  },
  {
    id: 'climb-tidepool-stack', name: 'The Tide Stack', biome: 'tidepool', grade: 'easy',
    base: { x: 119.8, z: 61.3 }, dir: { x: 0.249, z: 0.969 },
    gain: 10.8, topY: 17.3, hold: PAPER.tealL,
  },
  {
    id: 'climb-meadow-rise', name: 'Petal Rise', biome: 'meadow', grade: 'easy',
    base: { x: -106.0, z: 135.6 }, dir: { x: 0.661, z: 0.750 },
    gain: 7.6, topY: 28.7, hold: PAPER.rose,
  },
  {
    id: 'climb-market-nook', name: 'The Nook Wall', biome: 'market', grade: 'easy',
    base: { x: -128.0, z: -83.2 }, dir: { x: -0.309, z: 0.951 },
    gain: 12.4, topY: 23.5, hold: PAPER.peach,
  },
  {
    id: 'climb-frost-crest', name: 'Frost Crest', biome: 'frost', grade: 'fair',
    base: { x: -14.4, z: -184.3 }, dir: { x: 0.509, z: 0.861 },
    gain: 17.5, topY: 30.1, hold: PAPER.white,
  },
  {
    id: 'climb-ember-flank', name: 'Cinder Flank', biome: 'ember', grade: 'fair',
    base: { x: 175.6, z: -85.8 }, dir: { x: -0.790, z: -0.613 },
    gain: 18.9, topY: 25.6, hold: PAPER.orange,
    note: 'Tops out on the crater rim, right over the vents — the climb and '
        + 'the thermal that pays for it are the same landmark.',
  },
  {
    id: 'climb-crystal-stair', name: 'Shattered Stair', biome: 'crystal', grade: 'fair',
    base: { x: -95.3, z: -171.9 }, dir: { x: -0.536, z: 0.844 },
    gain: 19.4, topY: 22.1, hold: PAPER.lavender,
  },
  {
    id: 'climb-library-rampart', name: 'Rampart Route', biome: 'library', grade: 'fair',
    base: { x: -160.2, z: 99.4 }, dir: { x: 0.809, z: 0.588 },
    gain: 21.8, topY: 28.9, hold: PAPER.sand,
  },
  {
    id: 'climb-sky-seawall', name: 'The Sea Wall', biome: 'sky', grade: 'epic',
    base: { x: 202.8, z: -42.8 }, dir: { x: -0.707, z: 0.707 },
    gain: 45.4, topY: 46.5, hold: PAPER.lavenderD,
    note: 'Forty-five metres straight up off the shore platform. The pool ends '
        + 'the climb at about a third, which is exactly the amount of nervous '
        + 'a nine-year-old enjoys.',
  },
  {
    id: 'climb-palace-face', name: 'The Palace Face', biome: 'palace', grade: 'epic',
    base: { x: -53.9, z: 12.1 }, dir: { x: 0.976, z: -0.218 },
    gain: 47.1, topY: 54.8, hold: PAPER.gold,
    note: 'THE climb. Forty-seven metres of paper mesa in one unbroken haul, '
        + 'and it tops out on the launch pads — climb the island, then fly off '
        + 'it. The pool has about a third left at the summit.',
  },
];

/**
 * THE PERCHES. Standable spots on a rim with real air off the next step, each
 * one a place the FX layer plants a papercut wind-sock. Authored here and
 * referenced by id from the lines below, so a pad and its flights can never
 * drift apart.
 *
 * Every one of these was found by walking the rim outward from the summit
 * until the ground fell away, then simulating a jump-and-glide from it.
 */
export const LAUNCH_PADS = [
  { id: 'pad-palace-south', name: 'South Parapet', x: 1, z: 17, summit: 'palace' },
  { id: 'pad-palace-east', name: 'East Parapet', x: 14, z: 8, summit: 'palace' },
  { id: 'pad-palace-west', name: 'West Parapet', x: -20, z: 1, summit: 'palace' },
  { id: 'pad-palace-north', name: 'North Parapet', x: 5, z: -10, summit: 'palace' },
  { id: 'pad-sky-north', name: 'Cliff Head', x: 153, z: 17, summit: 'sky' },
  { id: 'pad-sky-east', name: 'Sea Ledge', x: 165, z: 4, summit: 'sky' },
  { id: 'pad-library-rim', name: 'Rampart Top', x: -131, z: 98, summit: 'library' },
];

const PAD_BY_ID = new Map(LAUNCH_PADS.map((p) => [p.id, p]));

/**
 * THE FLIGHTS. Each names a perch and a destination; `from` is materialised
 * from the perch at load, so there is exactly one copy of every coordinate.
 *
 * `thermal: true` marks a line that does NOT close on the glide ratio alone —
 * it needs a column somewhere along the way. Those four exist on purpose: once
 * a child has worked out that vents lift them, the map grows four new
 * destinations without a single new mechanic being taught.
 */
export const GLIDE_LINES = [
  {
    id: 'glide-palace-spire', name: 'The Long Way to the Spire',
    pad: 'pad-palace-east', to: { x: 218, z: 60 }, hero: true,
    note: 'Two hundred and eleven metres, Palace summit to the offshore spire '
        + 'gate, on one canopy and no lift needed. This is the line the whole '
        + 'ability exists to sell — you can see the destination from the perch.',
  },
  { id: 'glide-palace-garden', name: 'Down to the Garden', pad: 'pad-palace-south', to: { x: 10, z: 140 } },
  { id: 'glide-palace-spawn', name: 'Home Run', pad: 'pad-palace-south', to: { x: 6, z: 158 } },
  { id: 'glide-palace-library', name: 'Into the Canyon', pad: 'pad-palace-south', to: { x: -118, z: 116 } },
  { id: 'glide-palace-tidepool', name: 'Out to the Shallows', pad: 'pad-palace-east', to: { x: 128, z: 128 } },
  {
    id: 'glide-palace-ember', name: 'Ride the Vents', pad: 'pad-palace-east',
    to: { x: 118, z: -116 }, thermal: true,
    note: 'Four and a half metres of glide per metre of drop is not quite '
        + 'enough. The ember-divide column at (74, -98) is the difference, and '
        + 'working that out is the lesson.',
  },
  { id: 'glide-palace-market', name: 'Market Drop', pad: 'pad-palace-west', to: { x: -148, z: 10 } },
  { id: 'glide-palace-crystal', name: 'Over the Hollow', pad: 'pad-palace-west', to: { x: -116, z: -118 } },
  { id: 'glide-palace-frost', name: 'The Cold Crossing', pad: 'pad-palace-north', to: { x: 8, z: -150 }, thermal: true },
  { id: 'glide-sky-tidepool', name: 'Cliff to Coast', pad: 'pad-sky-north', to: { x: 128, z: 128 } },
  { id: 'glide-sky-spire', name: 'Sea Wall Hop', pad: 'pad-sky-east', to: { x: 218, z: 60 } },
  { id: 'glide-library-market', name: 'Rampart Run', pad: 'pad-library-rim', to: { x: -148, z: 10 }, thermal: true },
].map((g) => {
  const p = PAD_BY_ID.get(g.pad);
  if (!p) throw new Error(`traversalSpec: glide line ${g.id} names unknown pad ${g.pad}`);
  return { ...g, from: { x: p.x, z: p.z } };
});

/** Every line that launches from a given perch. */
export function linesFromPad(padId, lines = GLIDE_LINES) {
  return lines.filter((g) => g.pad === padId);
}

/**
 * THE LIFT. Columns of rising air, each one attached to something a child can
 * see a reason for: a volcanic vent, a sun-baked rock face, hot pavers, warm
 * shallows. Nothing invisible lifts you.
 *
 *   r        metres of radius at full strength; lift falls off smoothly to 2r
 *   strength m/s at the core (traversal.js clamps the total at thermalMax)
 *   rise     metres of usable column above the ground under it; above that the
 *            lift fades out over another half-rise, so a thermal is a ceiling
 *            as well as an elevator and no child parks in one forever
 *   kind     'vent' | 'rock' | 'paver' | 'shallow' — the FX layer's cue for
 *            what the rising ribbon should look like
 */
export const THERMALS = [
  // Ember Slopes: the real ones. Crater floor and the breached flank.
  { id: 'th-ember-crater', x: 125, z: -125, r: 26, strength: 5.5, rise: 60, kind: 'vent' },
  { id: 'th-ember-north', x: 110, z: -108, r: 18, strength: 4.4, rise: 50, kind: 'vent' },
  { id: 'th-ember-south', x: 140, z: -140, r: 18, strength: 4.4, rise: 50, kind: 'vent' },
  // The ember-divide ridge — hot rock, not fire. These two are what make the
  // Ember and Frost glide lines close.
  { id: 'th-divide-east', x: 74, z: -98, r: 24, strength: 4.2, rise: 55, kind: 'rock' },
  { id: 'th-divide-west', x: 12, z: -124, r: 22, strength: 4.0, rise: 55, kind: 'rock' },
  // Sky Cliffs: the seaward escarpment bakes all afternoon.
  { id: 'th-sky-escarp', x: 185, z: -10, r: 24, strength: 4.6, rise: 60, kind: 'rock' },
  { id: 'th-sky-saddle', x: 120, z: 6, r: 18, strength: 3.2, rise: 45, kind: 'rock' },
  // The palace's own sunlit south apron: launch, sink, and get some of it back.
  { id: 'th-palace-apron', x: 0, z: 34, r: 22, strength: 3.4, rise: 55, kind: 'rock' },
  // Built and warm: the market's plaza pavers, the library's sand bowl.
  { id: 'th-market-plaza', x: -155, z: 3, r: 18, strength: 2.8, rise: 40, kind: 'paver' },
  { id: 'th-library-bowl', x: -125, z: 125, r: 24, strength: 3.4, rise: 45, kind: 'rock' },
  // Warm water. Weak, wide, and the reason a coastal glide runs and runs.
  { id: 'th-tidepool', x: 140, z: 140, r: 26, strength: 2.4, rise: 35, kind: 'shallow' },
  { id: 'th-spire-islet', x: 218, z: 60, r: 16, strength: 4.0, rise: 45, kind: 'rock' },
];

/**
 * THINGS THAT FLOAT. Paper boats, lily rafts and a bobbing crate or two, all
 * in genuine deep water so they are somewhere to swim TO. floatables.js turns
 * these into standable, shovable platforms; the FX layer draws them.
 *
 *   r     radius of the deck (and of the standable top)
 *   lift  how far the deck sits above the water plane
 *   drift m/s the raft is pushed by the swimmer who bumps it
 */
export const FLOATABLES = [
  { id: 'float-tidepool-a', kind: 'raft', x: 160, z: 160, r: 2.6, lift: 0.34, drift: 1.1 },
  { id: 'float-tidepool-b', kind: 'lily', x: 140, z: 175, r: 2.0, lift: 0.20, drift: 1.5 },
  { id: 'float-tidepool-c', kind: 'lily', x: 175, z: 120, r: 2.0, lift: 0.20, drift: 1.5 },
  { id: 'float-spire-a', kind: 'boat', x: 210, z: 75, r: 2.2, lift: 0.30, drift: 1.2 },
  { id: 'float-spire-b', kind: 'raft', x: 230, z: 60, r: 2.6, lift: 0.34, drift: 1.1 },
  { id: 'float-north-a', kind: 'lily', x: -30, z: 215, r: 2.0, lift: 0.20, drift: 1.5 },
  { id: 'float-north-b', kind: 'boat', x: 60, z: 205, r: 2.2, lift: 0.30, drift: 1.2 },
  { id: 'float-west-a', kind: 'raft', x: -215, z: -40, r: 2.6, lift: 0.34, drift: 1.1 },
  { id: 'float-east-a', kind: 'lily', x: 100, z: 190, r: 2.0, lift: 0.20, drift: 1.5 },
];

/** Metres of glide per metre of drop, at cruise. ~4.5 : 1. */
export function glideRatio(tuning = DEFAULT_TRAVERSAL_TUNING) {
  return tuning.glideSpeed / -tuning.glideFall;
}

/** Smooth 0..1 ramp, flat at both ends. */
function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const p = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return p * p * (3 - 2 * p);
}

/**
 * Build the `thermalAt` sampler traversal.js takes as its environment field.
 *
 * The returned function is PURE in (x, y, z, t) — no closure state mutates,
 * nothing is cached between calls — because a replay of a glide has to
 * reproduce the same lift on the same frame or the determinism test fails.
 *
 * @param {typeof THERMALS} thermals
 * @param {(x:number,z:number)=>number} groundAt  the live heightfield sampler;
 *        a column is measured from the ground under it, not from sea level, so
 *        a vent on a 25 m rim lifts you to 85 m rather than to 60.
 */
export function createThermalField(thermals = THERMALS, groundAt = () => 0) {
  // Frozen copies of the scalars, in flat arrays: the sampler runs once per
  // glide frame and must not allocate or chase object properties.
  const n = thermals.length;
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  const tr = new Float64Array(n);
  const ts = new Float64Array(n);
  const th = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = thermals[i];
    tx[i] = c.x; tz[i] = c.z; tr[i] = c.r; ts[i] = c.strength; th[i] = c.rise;
  }

  /**
   * Rising air at a point, in m/s. Columns do not stack — the strongest wins —
   * so a cluster of vents is a wide lift, never a rocket.
   */
  function thermalAt(x, y, z, t) {
    let best = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - tx[i];
      const dz = z - tz[i];
      const d = Math.hypot(dx, dz);
      const outer = tr[i] * 2;
      if (d >= outer) continue;
      const radial = 1 - smoothstep(tr[i], outer, d);
      const base = groundAt(tx[i], tz[i]);
      const h = y - base;
      if (h < -2) continue;                       // below the vent: no lift
      // Full strength up the column, then a soft ceiling over the last half.
      const vertical = h <= th[i]
        ? 1
        : 1 - smoothstep(th[i], th[i] + th[i] * 0.5, h);
      if (vertical <= 0) continue;
      // A slow breathe, so a held glide is never a dead-constant number. The
      // phase is keyed to the column's position, so two vents never pulse in
      // lockstep, and it is a function of t alone — deterministic.
      const pulse = 0.88 + 0.12 * Math.sin(t * 0.9 + tx[i] * 0.17 + tz[i] * 0.11);
      const v = ts[i] * radial * vertical * pulse;
      if (v > best) best = v;
    }
    return best;
  }

  return { thermalAt, thermals };
}

/**
 * The climb route whose base is nearest (x, z), within `maxDist`, or null.
 * Used for the "there is a way up here" prompt and by the FX layer's LOD.
 */
export function nearestClimbRoute(x, z, maxDist = 12, routes = CLIMB_ROUTES) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const r of routes) {
    const dx = x - r.base.x;
    const dz = z - r.base.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = r; }
  }
  return best;
}

/** The launch pad nearest (x, z) within `maxDist`, or null. */
export function nearestLaunchPad(x, z, maxDist = 10, pads = LAUNCH_PADS) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const p of pads) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = p; }
  }
  return best;
}

/**
 * Horizontal distance of a glide line, and the drop it needs. Pure geometry —
 * the test uses it, and so does the FX layer when it sizes a route banner.
 */
export function lineMetrics(line, groundAt) {
  const y0 = groundAt(line.from.x, line.from.z);
  const y1 = Math.max(0, groundAt(line.to.x, line.to.z));
  const dist = Math.hypot(line.to.x - line.from.x, line.to.z - line.from.z);
  const drop = y0 - y1;
  return { dist, drop, y0, y1, needRatio: drop > 0.001 ? dist / drop : Infinity };
}
