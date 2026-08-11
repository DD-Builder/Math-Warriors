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

// ── PER-FLOOR SKY ──────────────────────────────────────────────────────────
//
// ── THE DEFECT ─────────────────────────────────────────────────────────────
// "'Ember Caves' is an open red plain under a CLEAR BLUE SKY." It was, and the
// reason is structural rather than an oversight: a floor borrowed the island's
// composed render frame whole, so nine places with nine premises — a cavern, a
// library interior, a frozen peak, a room at the end of the world — all stood
// under the same meadow at the same hour. The floor's ATMOSPHERE was already
// themed (see LEVEL_ATMOSPHERE in materials/aerialFog.js), which made the
// mismatch worse, not better: warm haze under a cool noon dome reads as a bug.
//
// ── WHAT THIS IS ───────────────────────────────────────────────────────────
// A sparse override, applied to the composed hour x weather frame AFTER
// applyWeather and before anything consumes it, so a floor inherits the whole
// live rig — sun direction, shadow fit, weather blend, the day clock — and
// overrides only the fields whose job is to say WHERE YOU ARE.
//
// It deliberately does NOT touch sunDir: that is the key light direction, it is
// what the shadow rig and every shader read, and a floor that moved it would
// have to re-derive the whole cast-shadow composition it inherits for free.
//
// ── WHY ALL NINE NOW HAVE ONE ──────────────────────────────────────────────
// The first pass gave a script only to the four floors that were obviously
// wrong — the two caverns, the library, the room at the end of the world — on
// the reasoning that a floor whose premise is "outdoors, daytime" is correct
// under the island's sky already. That reasoning does not survive contact with
// the frames. "Outdoors, daytime" is not a colour script; it is the ABSENCE of
// one, and what it produced was nine rooms photographed at the same hour on the
// same day in the same weather. The Garden and the Frozen Peak came back from
// review reading as the same place in two repaints, because tonally they were:
// identical dome, identical fill, identical haze colour, and only the ground
// paper told them apart.
//
// A place is not its objects, it is its LIGHT. So every theme key now has an
// entry, including the four outdoor ones, and each is a different hour, a
// different sky value ramp and a different bounce colour:
//
//   garden   late morning, green-gold, warm bounce off meadow
//   ebbport  damp coastal overcast, cool, low contrast
//   sky      high altitude — deep zenith, luminous horizon, air everywhere
//   ember    a lava cavern's LID; lit from below
//   frost    pale, cold, blinding snow bounce
//   prism    underground and cold — the counterweight to ember
//   market   warm afternoon under awnings
//   library  dusty gold lamplight in a vault
//   mending  pale, high and silent
//
// LOOKUP: entries are keyed by THEME KEY (level3dBuild.js: `theme.key`), and
// index.js resolves `theme.sky || theme.key`. `theme.sky` therefore stays what
// it always was — an explicit opt-in for a theme that wants to borrow ANOTHER
// floor's script — and is no longer the thing that decides whether a floor gets
// lit on purpose.

/** @typedef {Partial<Record<string, number>>} SkyOverride */

/** @type {Record<string, object>} */
export const LEVEL_SKY = {
  /**
   * THE GARDEN: late morning in a walled hedge maze.
   *
   * The one thing that had to change here is the ZENITH. The island's morning
   * sky runs sky->tealD at 0.26, which over a green maze is a pale wash sitting
   * on pale green — the hedge crowns had nothing to cut against, which is half
   * of why floor 1 read as "stacked green crates". At 0.44 the top of the dome
   * is a real value below the crown paper, so a 2.7 m hedge and a 14 m topiary
   * both silhouette. The horizon stays warm (gold) so the ramp has somewhere to
   * go, and the bounce is meadow green because that is what is under the hero.
   */
  garden: {
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.44),
    skyMid: mix(PAPER.sky, PAPER.cream, 0.46),
    skyBottom: mix(PAPER.cream, PAPER.gold, 0.28),
    fogColor: mix(PAPER.cream, PAPER.sage, 0.34),
    sunColor: mix(PAPER.white, PAPER.gold, 0.20),
    hemiSky: mix(PAPER.sky, PAPER.tealL, 0.22),
    hemiGround: mix(PAPER.sage, PAPER.leaf, 0.42),
    cloudTint: PAPER.white,
    cloudTintAmt: 0.12,
    night: 0.0,
    sunMul: 1.04,
    bounceMul: 1.10,
  },
  /**
   * EBBPORT: a drained harbour under a damp coastal sky.
   *
   * Low contrast on purpose — this is the only floor whose light is WEATHER
   * rather than an hour, and the way you say "the tide went out this morning
   * and it has not brightened since" is a small sun and a big cool fill. The
   * bounce comes off wet sand, so it is sand walked most of the way to tealD.
   */
  ebbport: {
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.46),
    skyMid: mix(PAPER.sky, PAPER.cream, 0.52),
    skyBottom: mix(PAPER.cream, PAPER.peach, 0.30),
    fogColor: mix(PAPER.sky, PAPER.cream, 0.52),
    sunColor: mix(PAPER.cream, PAPER.sky, 0.18),
    hemiSky: mix(PAPER.sky, PAPER.tealL, 0.34),
    // Wet sand, not the tideline itself. At 0.34 toward tealD the bounce was
    // dark enough that a teal-armoured hero standing backlit on the flats read
    // as a black cutout, which is the one thing the palette forbids outright.
    hemiGround: mix(PAPER.sand, PAPER.tealD, 0.24),
    cloudTint: mix(PAPER.sky, PAPER.lavender, 0.30),
    cloudTintAmt: 0.34,
    night: 0.05,
    // Overcast, not dusk. 0.90 was reading as evening on a floor whose premise
    // is a grey morning.
    sunMul: 0.96,
    hemiMul: 1.18,
  },
  /**
   * THE SHATTERED SKY: bright and airy, and literally at altitude.
   *
   * The only floor in the game where the correct answer is MORE light in every
   * channel: a deep zenith (thin air overhead), a luminous white horizon (all
   * the scattering below you), and a fill that comes off cloud rather than off
   * ground, so the underside of every shard is bright. `shaftMul` is up because
   * a sky level is the one place god rays are not a special effect.
   */
  sky: {
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.40),
    skyMid: mix(PAPER.sky, PAPER.white, 0.52),
    skyBottom: mix(PAPER.white, PAPER.sky, 0.22),
    fogColor: mix(PAPER.white, PAPER.sky, 0.42),
    sunColor: PAPER.white,
    hemiSky: mix(PAPER.sky, PAPER.white, 0.28),
    hemiGround: mix(PAPER.cream, PAPER.sky, 0.38),
    cloudTint: PAPER.white,
    cloudTintAmt: 0.10,
    night: 0.0,
    sunMul: 1.10,
    hemiMul: 1.18,
    bounceMul: 1.28,
    shaftMul: 1.35,
  },
  /**
   * THE EMBER CAVES: a lid, not a sky.
   *
   * Every value here is doing one job — putting the ceiling of a lava cavern
   * where a blue dome used to be. The zenith runs to inkTeal (the palette's
   * floor, and the darkest thing this world owns) so there is a real value ramp
   * from a hot horizon to a cold roof; the horizon glows coralD/orange, which
   * is the lava sheet the theme already uses, bounced onto the underside of the
   * rock. `night` at 0.34 is not "it is night" — it is the one scalar the sky
   * dome, the cloud layer and the sun billboard all read to know how far to
   * sink toward the fog, and 0.34 sinks the clouds into smoke and shrinks the
   * sun disc to a hot smudge without printing stars on a cave roof.
   *
   * The fill light comes UP: hemiGround is a lit orange, hemiSky is dark. That
   * inversion is the whole lighting read of a cave, and it costs one swap.
   */
  ember: {
    skyTop: mix(PAPER.inkTeal, PAPER.coralD, 0.18),
    skyMid: mix(PAPER.coralD, PAPER.tealD, 0.30),
    skyBottom: mix(PAPER.coralD, PAPER.orange, 0.45),
    fogColor: mix(PAPER.coralD, PAPER.orange, 0.30),
    sunColor: mix(PAPER.orange, PAPER.gold, 0.35),
    hemiSky: mix(PAPER.inkTeal, PAPER.lavenderD, 0.35),
    hemiGround: mix(PAPER.coral, PAPER.orange, 0.50),
    cloudTint: mix(PAPER.inkTeal, PAPER.lavenderD, 0.40),
    cloudTintAmt: 0.88,
    sunMul: 0.72,
    hemiMul: 1.30,
    bounceMul: 1.55,
    night: 0.34,
    shaftMul: 1.6,
  },
  /**
   * THE FROZEN PEAK: pale and cold, and the brightest fill in the game.
   *
   * Snow is a 90%-albedo reflector, and getting that wrong is what makes every
   * hobby snow scene look like grey mud: the KEY is barely warmer than the sky,
   * and almost all the modelling comes from BOUNCE off the ground. So the key
   * is cooled toward sky paper, the bounce is nearly white and runs at 1.5x,
   * and the shade side of everything lands cold-blue rather than dark. The
   * dome is deliberately the palest of the nine — a high overcast, not a
   * summer noon — and the horizon almost meets the snow, which is exactly the
   * "where does the ground end" read a peak wants.
   */
  frost: {
    skyTop: mix(PAPER.sky, PAPER.tealD, 0.36),
    skyMid: mix(PAPER.sky, PAPER.white, 0.48),
    skyBottom: mix(PAPER.white, PAPER.sky, 0.26),
    fogColor: mix(PAPER.white, PAPER.sky, 0.46),
    sunColor: mix(PAPER.white, PAPER.sky, 0.14),
    hemiSky: mix(PAPER.sky, PAPER.tealL, 0.26),
    hemiGround: mix(PAPER.white, PAPER.sky, 0.28),
    cloudTint: PAPER.white,
    cloudTintAmt: 0.16,
    night: 0.0,
    sunMul: 1.06,
    // Trimmed from 1.22/1.50 after looking at the frame: snow bounces hard,
    // but a fill at a third of the key erases the very slab faces the level is
    // built out of. This keeps the cold bounce and gives the form back.
    hemiMul: 1.14,
    bounceMul: 1.38,
  },
  /**
   * COINFORD MARKET: warm afternoon, an hour before the stalls come down.
   *
   * The market is the only floor whose architecture is CLOTH, and cloth in
   * afternoon sun is the one thing in this palette that wants a low warm key
   * and a lavender sky to sit against. Nothing here is enclosed; the script is
   * a time of day, not a room.
   */
  market: {
    skyTop: mix(PAPER.sky, PAPER.lavender, 0.34),
    skyMid: mix(PAPER.peach, PAPER.cream, 0.46),
    skyBottom: mix(PAPER.gold, PAPER.peach, 0.48),
    fogColor: mix(PAPER.peach, PAPER.cream, 0.50),
    sunColor: mix(PAPER.gold, PAPER.white, 0.28),
    hemiSky: mix(PAPER.sky, PAPER.lavender, 0.28),
    hemiGround: mix(PAPER.sand, PAPER.peach, 0.42),
    cloudTint: mix(PAPER.peach, PAPER.lavender, 0.35),
    cloudTintAmt: 0.26,
    night: 0.06,
    sunMul: 1.02,
    shaftMul: 1.25,
  },
  /**
   * THE INFINITY LIBRARY: "the only shot with a designed sightline, thrown away
   * by fog and an OPEN SKY over a library." An interior gets a warm lamplit
   * vault overhead rather than a horizon.
   *
   * The second pass made the lamplight LITERAL. A vault is lit by what is in
   * it, so the key is now gold rather than the hour's white — a warm raking
   * light down a corridor of shelves — the vault overhead went darker and
   * cooler so the two ends of the value ramp are further apart, and `shaftMul`
   * is up hard because dust in a shaft of light is the single image everyone
   * has of a library and it costs nothing to say it. The fill is a warm floor
   * bounce off parchment, which is what keeps the shelves' shade side inside
   * the warm family instead of going grey — the exact defect that measured
   * "chroma 2, literal greyscale" on this floor.
   */
  library: {
    skyTop: mix(PAPER.lavenderD, PAPER.coralD, 0.24),
    skyMid: mix(PAPER.peach, PAPER.lavenderD, 0.42),
    skyBottom: mix(PAPER.gold, PAPER.peach, 0.55),
    fogColor: mix(PAPER.peach, PAPER.creamD, 0.42),
    sunColor: mix(PAPER.gold, PAPER.cream, 0.30),
    hemiSky: mix(PAPER.lavender, PAPER.lavenderD, 0.48),
    hemiGround: mix(PAPER.peach, PAPER.orange, 0.34),
    cloudTint: PAPER.lavenderD,
    cloudTintAmt: 0.72,
    night: 0.20,
    sunMul: 0.94,
    hemiMul: 1.15,
    bounceMul: 1.30,
    shaftMul: 1.70,
  },
  /**
   * THE MENDING ROOM: the room at the end of the world. Pale, high, silent.
   *
   * It declared a dome and nothing else, which — now that declaring a sky is
   * what routes the fill through the frame instead of through the theme's
   * ground paper — left the last floor in the game lit from below in MEADOW
   * GREEN off a cream floor. Same class of bug as the Ember Caves', found the
   * same way. The three missing fields are the fix; the dome is unchanged.
   */
  mending: {
    skyTop: mix(PAPER.lavender, PAPER.lavenderD, 0.42),
    skyMid: mix(PAPER.lavender, PAPER.white, 0.45),
    skyBottom: mix(PAPER.white, PAPER.gold, 0.22),
    fogColor: mix(PAPER.white, PAPER.lavender, 0.34),
    sunColor: mix(PAPER.white, PAPER.gold, 0.16),
    hemiSky: mix(PAPER.lavender, PAPER.white, 0.30),
    hemiGround: mix(PAPER.cream, PAPER.lavender, 0.30),
    cloudTint: PAPER.lavender,
    cloudTintAmt: 0.55,
    night: 0.14,
    hemiMul: 1.10,
    bounceMul: 1.15,
  },
  /** THE CRYSTAL CAVERNS: also underground, also not blue — but cold where the
   *  Ember Caves are hot, so the two caves cannot be confused for each other. */
  prism: {
    skyTop: mix(PAPER.inkTeal, PAPER.lavenderD, 0.44),
    skyMid: mix(PAPER.lavenderD, PAPER.lavender, 0.42),
    skyBottom: mix(PAPER.lavender, PAPER.tealL, 0.40),
    fogColor: mix(PAPER.lavenderD, PAPER.lavender, 0.45),
    hemiSky: mix(PAPER.lavenderD, PAPER.inkTeal, 0.30),
    hemiGround: mix(PAPER.lavender, PAPER.tealL, 0.40),
    // Sunk almost all the way, like the Ember Caves': at 0.80 the cloud plies
    // were still reading LIGHTER than the dome behind them, which put visible
    // weather on the roof of a cave. They are now vault shadow.
    cloudTint: mix(PAPER.lavenderD, PAPER.inkTeal, 0.30),
    cloudTintAmt: 0.92,
    night: 0.30,
    hemiMul: 1.20,
  },
};

/** The sky override for a theme key, or null. */
export function levelSky(key) {
  return LEVEL_SKY[key] || null;
}

/**
 * Fold a floor's sky override into an already-composed render frame, in place.
 *
 * Zero allocation; safe to call every frame. Passing a key with no override (or
 * null) is a no-op, which is what puts the island and the un-overridden floors
 * on exactly the byte-identical path they were on before this existed.
 *
 * @param {object} out a createRenderFrame() record, already through applyWeather
 * @param {string|null} key a LEVEL_SKY key, or null for the island
 */
export function applyFloorSky(out, key) {
  const s = key ? LEVEL_SKY[key] : null;
  if (!s) return out;
  for (const f of COLOR_FIELDS) if (s[f] !== undefined) out[f] = s[f];
  if (s.cloudTint !== undefined) out.cloudTint = s.cloudTint;
  if (s.cloudTintAmt !== undefined) out.cloudTintAmt = s.cloudTintAmt;
  if (s.night !== undefined) out.night = s.night;
  // The multipliers ride whatever the hour and the weather already decided, so
  // a floor stays lit relative to the day rather than pinned to one exposure.
  if (s.sunMul !== undefined) out.sunIntensity *= s.sunMul;
  if (s.hemiMul !== undefined) out.hemiIntensity *= s.hemiMul;
  if (s.bounceMul !== undefined) out.bounceIntensity *= s.bounceMul;
  if (s.shaftMul !== undefined) out.shaft *= s.shaftMul;
  // Bounce is the ground throwing light back up, so it follows hemiGround —
  // the same rule applyWeather uses, restated because hemiGround just moved.
  if (s.hemiGround !== undefined) out.bounceColor = s.hemiGround;
  return out;
}


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
