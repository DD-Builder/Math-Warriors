/**
 * sfxLibrary.js — the sound DESIGN, expressed as data.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * v1 had one `playTone(freq, dur, type, vol)` helper and every action in
 * the game was some flavour of beep. A chest opening and a button press
 * were the same sine wave at different pitches. That reads as "prototype"
 * the instant a child hears it, no matter how good the art is.
 *
 * A real sound is a *stack of layers* — a body, a grit, a tail — each with
 * its own envelope and filter, and each one slightly different from the
 * last time you heard it. So instead of hard-coding node graphs, every
 * sound here is a pure function that returns a PLAN: a plain array of
 * layer descriptors made of finite numbers. synthAudio.js renders a plan
 * into WebAudio nodes on the sfx bus.
 *
 * Two things fall out of that split for free:
 *   1. This whole file imports nothing, touches no DOM, and needs no
 *      AudioContext — so every sound in the game can be built and
 *      inspected in a node test (sfxLibrary.test.js walks all of them).
 *   2. Loudness is checked BEFORE anything reaches the hardware. Layers
 *      that overlap in time get their combined peak measured and scaled
 *      to GAIN_CAP, so a nine-layer fanfare can't slam the master limiter
 *      the way the old fire-and-forget tone stacks did.
 *
 * ART LAW: warm, handmade, bright and kind. Ages 5-10. Awe, never horror.
 * Nothing in here screeches, stings, or scolds. The "wrong answer" sound
 * in particular is deliberately gentle and ends on a small lift.
 */

// ══════════════════════════════════════════════════════════════════
// LAYER PRIMITIVES
// ══════════════════════════════════════════════════════════════════
//
// A plan layer is one voice. Two kinds:
//
//   tone  — an oscillator, optionally swept, FM-modulated, vibrato'd
//           and filtered. Bodies, bells, chimes, thumps, squeaks.
//   noise — the shared noise buffer through a filter, optionally
//           pitch-shifted via playbackRate. Grit, air, tears, splashes.
//
// Shared envelope fields on both: attack (rise to peak), dur (time to
// the decay floor), release (extra tail), sustain (optional hold level
// as a fraction of peak). `pan` places the voice in the stereo field,
// `send` feeds the shared shimmer/echo send.

/** Peak summed gain any single instant of a plan is allowed to reach. */
export const GAIN_CAP = 0.55;

const TONE_DEFAULTS = {
  kind: 'tone',
  t: 0,            // start offset from the trigger, seconds
  dur: 0.2,        // time from attack peak to the decay floor
  gain: 0.15,      // peak linear gain (pre budget scaling)
  attack: 0.004,
  release: 0.03,
  sustain: null,   // 0..1 hold level, or null for a straight decay
  pan: 0,          // -1 left .. +1 right
  send: 0,         // 0..1 into the shimmer send
  type: 'sine',    // sine | triangle | sawtooth | square
  freq: 440,
  freqEnd: null,   // sweep target, or null to hold
  sweep: 'exp',    // exp | lin
  fm: null,        // { ratio, index, decay } — index is Hz of deviation
  vib: null,       // { rate, depth } — depth is Hz
  filter: null,    // { type, freq, freqEnd, q }
};

const NOISE_DEFAULTS = {
  kind: 'noise',
  t: 0,
  dur: 0.1,
  gain: 0.15,
  attack: 0.002,
  release: 0.02,
  sustain: null,
  pan: 0,
  send: 0,
  rate: 1,         // playbackRate — shifts the grain size of the noise
  offset: 0,       // read offset into the shared noise buffer, seconds
  filter: { type: 'bandpass', freq: 2000, freqEnd: null, q: 1 },
};

export function tone(o) { return { ...TONE_DEFAULTS, ...o }; }
export function noise(o) {
  const l = { ...NOISE_DEFAULTS, ...o };
  l.filter = { ...NOISE_DEFAULTS.filter, ...(o && o.filter) };
  return l;
}

/** A struck bell: fundamental plus an inharmonic partial. Two layers. */
function bell(freq, { t = 0, dur = 0.9, gain = 0.12, send = 0.25, ratio = 2.76, pan = 0 } = {}) {
  return [
    tone({ t, dur, gain, send, pan, freq, attack: 0.002, release: 0.15 }),
    tone({ t, dur: dur * 0.55, gain: gain * 0.34, send: send * 0.5, pan, freq: freq * ratio, attack: 0.002 }),
  ];
}

/** A soft low body hit — the "weight" under any impact. */
function thump(freq, { t = 0, dur = 0.12, gain = 0.18, drop = 0.55, pan = 0 } = {}) {
  return tone({
    t, dur, gain, pan, type: 'sine', freq, freqEnd: freq * drop,
    attack: 0.002, release: 0.04,
  });
}

/** Ascending sparkle run — the game's "something good happened" gesture. */
function sparkle(freqs, { t = 0, step = 0.055, gain = 0.09, send = 0.35, fade = 0.85 } = {}) {
  const out = [];
  freqs.forEach((f, i) => {
    out.push(...bell(f, {
      t: t + i * step,
      dur: 0.5 + i * 0.06,
      gain: gain * Math.pow(fade, i),
      send,
      ratio: 3.01,
    }));
  });
  return out;
}

// ── Pitch helpers ────────────────────────────────────────────────
// Everything melodic in the game lives on a major pentatonic, because
// any subset of it sounds consonant no matter what order it arrives in
// — which matters when the pitch is chosen by how many coins a child
// happened to grab, not by a composer.

const PENTA = [0, 2, 4, 7, 9];
const C5 = 523.25;

/** Hz of pentatonic degree `deg` (may exceed 4 — it wraps up octaves). */
export function degHz(deg, root = C5) {
  const d = Math.floor(deg);
  const oct = Math.floor(d / PENTA.length);
  const semi = PENTA[((d % PENTA.length) + PENTA.length) % PENTA.length] + 12 * oct;
  return root * Math.pow(2, semi / 12);
}

// ══════════════════════════════════════════════════════════════════
// SURFACES — the footstep palette
// ══════════════════════════════════════════════════════════════════
//
// One table drives BOTH footsteps and the surface flavour of landings,
// so a thud on wood and a step on wood are audibly the same material.
//
//   body  — the low mass of the foot meeting the ground
//   grit  — the mid-band texture (the actual character of the material)
//   tail  — the little bright afterthought: a leaf tick, a pebble skip
//   extra — material-specific voices (a droplet, a squeak, a chime)

export const SURFACES = {
  grass: {
    gain: 1.0, dur: 0.11, pitch: 1,
    body: { freq: 96, drop: 0.62, gain: 0.06, dur: 0.055, type: 'triangle' },
    grit: { freq: 2600, freqEnd: 1250, q: 0.9, gain: 0.13, dur: 0.10, attack: 0.005, rate: 1 },
    tail: { type: 'highpass', freq: 5400, q: 0.7, gain: 0.045, dur: 0.055, t: 0.028, rate: 1.1 },
    land: { gain: 1.55, dur: 1.5, send: 0.04 },
  },
  stone: {
    gain: 1.0, dur: 0.075, pitch: 1,
    body: { freq: 178, drop: 0.6, gain: 0.09, dur: 0.06, type: 'triangle' },
    grit: { freq: 3600, freqEnd: 2400, q: 1.4, gain: 0.12, dur: 0.045, attack: 0.001, rate: 1 },
    tail: { type: 'bandpass', freq: 6200, q: 3, gain: 0.06, dur: 0.022, t: 0.006, rate: 1 },
    send: 0.09,   // a path has a room around it
    land: { gain: 1.7, dur: 1.3, send: 0.16 },
  },
  sand: {
    gain: 0.9, dur: 0.15, pitch: 1,
    body: { freq: 72, drop: 0.7, gain: 0.05, dur: 0.07, type: 'sine' },
    grit: { freq: 1750, freqEnd: 880, q: 0.55, gain: 0.12, dur: 0.14, attack: 0.014, rate: 1 },
    tail: { type: 'highpass', freq: 3800, q: 0.6, gain: 0.035, dur: 0.09, t: 0.05, rate: 0.9 },
    land: { gain: 1.4, dur: 1.6, send: 0.02 },
  },
  water: {
    gain: 1.05, dur: 0.2, pitch: 1,
    body: { freq: 140, drop: 0.55, gain: 0.07, dur: 0.1, type: 'sine' },
    grit: { freq: 900, freqEnd: 3000, q: 0.7, gain: 0.14, dur: 0.18, attack: 0.003, rate: 1 },
    tail: { type: 'highpass', freq: 5000, q: 0.8, gain: 0.05, dur: 0.1, t: 0.06, rate: 1.2 },
    // one flicked droplet, pitched off the step so it never lands twice the same
    extra: ({ pitch, pan, rnd }) => [tone({
      t: 0.07 + rnd * 0.05, dur: 0.09, gain: 0.045, pan: -pan,
      freq: 1500 * pitch, freqEnd: 780 * pitch, send: 0.15,
    })],
    land: { gain: 1.6, dur: 1.8, send: 0.05 },
  },
  snow: {
    gain: 0.95, dur: 0.13, pitch: 1,
    body: { freq: 84, drop: 0.66, gain: 0.055, dur: 0.075, type: 'sine' },
    grit: { freq: 1250, freqEnd: 900, q: 1.3, gain: 0.115, dur: 0.115, attack: 0.006, rate: 1 },
    tail: { type: 'bandpass', freq: 3100, q: 2.2, gain: 0.04, dur: 0.05, t: 0.035, rate: 1 },
    // the squeak of compressing snow — a warbling whistle, very quiet
    extra: ({ pitch, pan, rnd }) => [tone({
      t: 0.02, dur: 0.07, gain: 0.026, pan,
      freq: 2050 * pitch, freqEnd: 2400 * pitch,
      vib: { rate: 26 + rnd * 14, depth: 55 },
    })],
    land: { gain: 1.45, dur: 1.7, send: 0.03 },
  },
  wood: {
    gain: 1.0, dur: 0.1, pitch: 1,
    body: { freq: 305, drop: 0.63, gain: 0.1, dur: 0.085, type: 'triangle' },
    grit: { freq: 1900, freqEnd: 1100, q: 2.4, gain: 0.075, dur: 0.05, attack: 0.001, rate: 1 },
    tail: { type: 'highpass', freq: 4600, q: 0.7, gain: 0.035, dur: 0.03, t: 0.004, rate: 1 },
    // the hollow second mode of a plank over air
    extra: ({ pitch, pan }) => [tone({
      t: 0.004, dur: 0.16, gain: 0.05, pan, type: 'sine',
      freq: 786 * pitch, freqEnd: 690 * pitch, send: 0.08,
      filter: { type: 'bandpass', freq: 800 * pitch, freqEnd: null, q: 5 },
    })],
    land: { gain: 1.6, dur: 1.4, send: 0.1 },
  },
  // Floor 3 is a sky. Stepping on cloud should feel like almost nothing.
  cloud: {
    gain: 0.7, dur: 0.18, pitch: 1,
    body: { freq: 62, drop: 0.8, gain: 0.035, dur: 0.1, type: 'sine' },
    grit: { freq: 760, freqEnd: 520, q: 0.5, gain: 0.07, dur: 0.17, attack: 0.03, rate: 0.8 },
    tail: { type: 'highpass', freq: 7000, q: 0.6, gain: 0.02, dur: 0.12, t: 0.05, rate: 1.4 },
    land: { gain: 1.3, dur: 1.9, send: 0.12 },
  },
  // Floor 6's crystal galleries ring faintly underfoot.
  crystal: {
    gain: 0.95, dur: 0.09, pitch: 1,
    body: { freq: 210, drop: 0.6, gain: 0.07, dur: 0.06, type: 'triangle' },
    grit: { freq: 4200, freqEnd: 3000, q: 2, gain: 0.09, dur: 0.04, attack: 0.001, rate: 1 },
    tail: { type: 'bandpass', freq: 7400, q: 4, gain: 0.05, dur: 0.03, t: 0.005, rate: 1 },
    extra: ({ pitch, pan, rnd }) => bell(1860 * pitch * (1 + rnd * 0.08), {
      t: 0.01, dur: 0.5, gain: 0.035, send: 0.3, ratio: 2.4, pan,
    }),
    send: 0.18,
    land: { gain: 1.6, dur: 1.5, send: 0.25 },
  },
};

export const SURFACE_NAMES = Object.keys(SURFACES);
export const DEFAULT_SURFACE = 'grass';

/**
 * Every word the rest of the game might plausibly hand us for "what am
 * I standing on", mapped onto the eight real materials. Callers should
 * never have to know the palette — they pass their own vocabulary
 * (tile name, material name, biome name) and get a sensible step.
 */
export const SURFACE_ALIASES = {
  grass: 'grass', meadow: 'grass', moss: 'grass', leaf: 'grass', leaves: 'grass',
  garden: 'grass', hedge: 'grass', turf: 'grass', floor: 'grass', dirt: 'grass',
  soil: 'grass', earth: 'grass',

  stone: 'stone', path: 'stone', cobble: 'stone', rock: 'stone', gravel: 'stone',
  brick: 'stone', tile: 'stone', ruins: 'stone', marble: 'stone', ash: 'stone',
  ember: 'stone', lava: 'stone', arcane: 'stone', metal: 'stone',

  sand: 'sand', beach: 'sand', dune: 'sand', shore: 'sand', silt: 'sand',
  tidepool: 'sand', reef: 'sand',

  water: 'water', shallows: 'water', shallow: 'water', pond: 'water',
  stream: 'water', puddle: 'water', wet: 'water', surf: 'water',

  snow: 'snow', ice: 'snow', frost: 'snow', powder: 'snow', glacier: 'snow',

  wood: 'wood', plank: 'wood', planks: 'wood', bridge: 'wood', dock: 'wood',
  deck: 'wood', boardwalk: 'wood', market: 'wood', library: 'wood', book: 'wood',

  cloud: 'cloud', sky: 'cloud', mist: 'cloud', air: 'cloud', storm: 'cloud',

  crystal: 'crystal', gem: 'crystal', glass: 'crystal', prism: 'crystal',
};

/** Resolve any caller vocabulary to a real surface. Never throws. */
export function resolveSurface(name) {
  if (!name) return DEFAULT_SURFACE;
  const k = String(name).toLowerCase().trim();
  if (SURFACES[k]) return k;
  return SURFACE_ALIASES[k] || DEFAULT_SURFACE;
}

/**
 * Surface for a maze tile code (see data/levels.js CODE) on a given
 * floor. The tile says "is this ground, a path, or water"; the floor's
 * tileset says what the ground is MADE of. Garden grass and Frozen Peak
 * ground are both tile code 1 and must not sound the same.
 */
const FLOOR_GROUND = {
  1: 'grass',   // The Garden
  2: 'sand',    // Tidepool Ruins
  3: 'cloud',   // The Shattered Sky
  4: 'stone',   // Ember Caves
  5: 'snow',    // Frozen Peak
  6: 'crystal', // Crystal Caverns
  7: 'wood',    // Coinford Market
  8: 'wood',    // Infinity Library
  9: 'stone',   // The Mending Room
};

export function surfaceForTile(tileCode, floorId = 1) {
  if (tileCode === 3) return 'water';           // Q — always water
  if (tileCode === 4) return 'sand';            // S — soft special tile
  if (tileCode === 2) {                          // P — a built path
    return floorId === 7 || floorId === 8 ? 'wood' : 'stone';
  }
  return FLOOR_GROUND[floorId] || DEFAULT_SURFACE;
}

// ══════════════════════════════════════════════════════════════════
// FOOTSTEP VARIATION
// ══════════════════════════════════════════════════════════════════
//
// The single thing that separates a real footstep system from a looped
// sample is that no two steps are identical. Four axes of variation,
// all cheap:
//
//   1. FOOT ALTERNATION — steps alternate pan (left/right) and the
//      trailing foot is a hair heavier, so a walk has a gait.
//   2. A 7-STEP PITCH CYCLE — a fixed, musical-feeling set of ratios.
//      7 is coprime with the 2-step foot alternation, so the pattern
//      only repeats every 14 steps and never locks to the gait.
//   3. RANDOM JITTER — ±3.5% pitch, ±15% gain, plus a randomised read
//      offset into the noise buffer so the actual grain differs.
//   4. EFFORT — running shortens and brightens every step and adds an
//      occasional scuff; sneaking shrinks the whole thing.

const PITCH_CYCLE = [1.0, 0.945, 1.062, 0.98, 1.031, 0.921, 1.088];

let _stepIndex = 0;
let _currentSurface = DEFAULT_SURFACE;

/** Tell the SFX system what the hero is standing on. Cheap; call freely. */
export function setFootstepSurface(name) {
  _currentSurface = resolveSurface(name);
  return _currentSurface;
}
export function getFootstepSurface() { return _currentSurface; }
/** Reset gait state (new scene / teleport) so the next step starts fresh. */
export function resetFootsteps() { _stepIndex = 0; }

/**
 * Build one footstep.
 *
 * @param {string} name     surface (any alias); omit to use the current one
 * @param {object} opts     { index, run, effort, rng }
 */
export function footstepPlan(name, opts = {}) {
  const S = SURFACES[resolveSurface(name || _currentSurface)];
  const rng = opts.rng || Math.random;
  const i = Number.isFinite(opts.index) ? Math.floor(opts.index) : _stepIndex++;
  const foot = i % 2;                                   // 0 = left, 1 = right
  const cyc = PITCH_CYCLE[((i % PITCH_CYCLE.length) + PITCH_CYCLE.length) % PITCH_CYCLE.length];
  const rnd = rng();

  const run = !!opts.run;
  const effort = clampNum(opts.effort ?? (run ? 1.15 : 1), 0.2, 1.6);

  const pitch = cyc * (1 + (rnd * 2 - 1) * 0.035) * (run ? 1.05 : 1);
  const gain = S.gain * effort * (0.86 + rng() * 0.28) * (foot ? 1.06 : 0.96);
  const dur = S.dur * (run ? 0.78 : 1) * (0.92 + rng() * 0.16);
  const pan = (foot ? 0.17 : -0.17) * (S === SURFACES.water ? 0.6 : 1);
  const bright = run ? 1.14 : 1;
  const send = S.send || 0;

  const layers = [];

  layers.push(thump(S.body.freq * pitch, {
    dur: S.body.dur * (dur / S.dur),
    gain: S.body.gain * gain,
    drop: S.body.drop,
    pan: pan * 0.4,
  }));
  layers[layers.length - 1].type = S.body.type;

  layers.push(noise({
    dur, gain: S.grit.gain * gain, pan, send,
    attack: S.grit.attack,
    rate: S.grit.rate * pitch,
    offset: rng() * 0.9,
    filter: {
      type: 'bandpass',
      freq: S.grit.freq * pitch * bright,
      freqEnd: S.grit.freqEnd * pitch,
      q: S.grit.q,
    },
  }));

  layers.push(noise({
    t: S.tail.t, dur: S.tail.dur, gain: S.tail.gain * gain * bright,
    pan: pan * 1.3, rate: S.tail.rate * pitch, offset: rng() * 0.9,
    filter: { type: S.tail.type, freq: S.tail.freq * pitch, freqEnd: null, q: S.tail.q },
  }));

  if (S.extra) layers.push(...S.extra({ pitch, pan, rnd, gain }));

  // Every seventh-ish step while running, a scuff: the foot didn't
  // land clean. Placed off the 2-cycle so it never syncs to a foot.
  if (run && i % 7 === 3) {
    layers.push(noise({
      t: dur * 0.55, dur: dur * 1.4, gain: S.grit.gain * gain * 0.5, pan,
      attack: 0.012, rate: S.grit.rate * pitch * 0.72, offset: rng() * 0.9,
      filter: { type: 'bandpass', freq: S.grit.freq * 0.62, freqEnd: S.grit.freqEnd * 0.7, q: 1.6 },
    }));
  }

  return layers;
}

/** Landing: the same surface palette, heavier, with a body thud under it. */
export function landPlan(name, opts = {}) {
  const key = resolveSurface(name || _currentSurface);
  const S = SURFACES[key];
  const rng = opts.rng || Math.random;
  const weight = clampNum(opts.weight ?? 1, 0.4, 2);
  const L = S.land;

  const layers = footstepPlan(key, { ...opts, effort: 0.9 * weight, run: false, rng });
  for (const l of layers) {
    l.gain *= L.gain * weight;
    l.dur *= L.dur;
    l.pan *= 0.3;                       // both feet land together
    if (L.send) l.send = Math.max(l.send, L.send);
  }

  // Body mass. Heavier landings reach lower and ring longer.
  layers.push(thump(112 / weight, { dur: 0.13 * weight, gain: 0.2 * weight, drop: 0.5 }));
  if (weight > 1.2) {
    layers.push(thump(62, { t: 0.005, dur: 0.3 * weight, gain: 0.16 * weight, drop: 0.6 }));
    // knees-bend exhale
    layers.push(noise({
      t: 0.06, dur: 0.2, gain: 0.05, attack: 0.02,
      filter: { type: 'bandpass', freq: 620, freqEnd: 380, q: 2.5 },
      offset: rng() * 0.9,
    }));
    // three bits of debris skittering away
    for (let k = 0; k < 3; k++) {
      layers.push(noise({
        t: 0.05 + k * 0.045 + rng() * 0.02, dur: 0.035,
        gain: 0.05 * (1 - k * 0.25), pan: (k % 2 ? 0.5 : -0.5),
        rate: 1 + k * 0.2, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 3400 + k * 700, freqEnd: null, q: 0.8 },
      }));
    }
  }
  return layers;
}

// ══════════════════════════════════════════════════════════════════
// CHAINS — sounds that remember how many came before
// ══════════════════════════════════════════════════════════════════
//
// Grabbing five coins in a row should not be the same chime five times;
// it should be a little melody that lifts. Same mechanic drives the
// answer streak. The chain is a pure counter with a timeout, so the
// clock is injected and it is fully testable.

export function createChain({ window: gapSec = 1.2, max = 24 } = {}) {
  let n = 0;
  let last = -Infinity;
  return {
    /** Advance the chain for an event at `now` (seconds). Returns 0-based step. */
    next(now = 0) {
      if (!Number.isFinite(now) || now - last > gapSec) n = 0;
      else n = Math.min(n + 1, max);
      last = Number.isFinite(now) ? now : last;
      return n;
    },
    peek() { return n; },
    reset() { n = 0; last = -Infinity; },
  };
}

// ══════════════════════════════════════════════════════════════════
// THE SOUNDS
// ══════════════════════════════════════════════════════════════════

const B = {

  // ── TRAVERSAL ────────────────────────────────────────────────

  /** A short voiced breath — the "hup" of pushing off the ground. */
  jump(o = {}) {
    const rng = o.rng || Math.random;
    const p = 0.94 + rng() * 0.14;
    return [
      // the breath itself, shaped by a vowel-ish bandpass that opens
      noise({
        dur: 0.17, gain: 0.1, attack: 0.018, release: 0.05, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 620 * p, freqEnd: 1500 * p, q: 3.2 },
      }),
      // the body of the effort, rising because you're going up
      tone({ dur: 0.13, gain: 0.055, freq: 172 * p, freqEnd: 300 * p, type: 'triangle', attack: 0.008 }),
      // clothing rustle
      noise({
        t: 0.02, dur: 0.07, gain: 0.035, rate: 1.2, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 5200, freqEnd: null, q: 0.7 },
      }),
    ];
  },

  land(o = {}) { return landPlan(o.surface, { ...o, weight: o.weight ?? 1 }); },
  landHeavy(o = {}) { return landPlan(o.surface, { ...o, weight: o.weight ?? 1.65 }); },

  /** Wading / dropping into shallow water: a sheet of spray and droplets. */
  splash(o = {}) {
    const rng = o.rng || Math.random;
    const size = clampNum(o.size ?? 1, 0.4, 1.6);
    const layers = [
      noise({
        dur: 0.3 * size, gain: 0.16 * size, attack: 0.004, release: 0.1, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 430, freqEnd: 2700, q: 0.7 },
      }),
      thump(128, { dur: 0.18 * size, gain: 0.075 * size, drop: 0.55 }),
      noise({
        t: 0.05, dur: 0.24 * size, gain: 0.07, attack: 0.05, rate: 1.3, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 3600, freqEnd: null, q: 0.6 },
      }),
    ];
    // droplets falling back, each a tiny falling chirp, spread in stereo
    for (let k = 0; k < 3; k++) {
      const f = (1250 + rng() * 1400) * size;
      layers.push(tone({
        t: 0.08 + k * 0.06 + rng() * 0.03, dur: 0.07, gain: 0.035,
        freq: f, freqEnd: f * 0.55, pan: (rng() * 2 - 1) * 0.7, send: 0.12,
      }));
    }
    return layers;
  },

  /** One swim stroke: a long pull under, a bubble, a surface tinkle. */
  swim(o = {}) {
    const rng = o.rng || Math.random;
    const side = (o.index ?? 0) % 2 ? 0.35 : -0.35;
    return [
      noise({
        dur: 0.42, gain: 0.12, attack: 0.07, release: 0.12, pan: side, offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 1500, freqEnd: 480, q: 0.8 },
      }),
      tone({ t: 0.04, dur: 0.28, gain: 0.04, freq: 290, freqEnd: 520, type: 'sine', attack: 0.05 }),
      noise({
        t: 0.26, dur: 0.14, gain: 0.05, pan: -side, rate: 1.4, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 3200, freqEnd: 4800, q: 1.2 },
      }),
    ];
  },

  /** Hand-over-hand on a wall: four grains of friction, not one hiss. */
  climb(o = {}) {
    const rng = o.rng || Math.random;
    const p = 0.9 + rng() * 0.2;
    const layers = [
      tone({
        dur: 0.26, gain: 0.045, type: 'sawtooth', freq: 88 * p, freqEnd: 74 * p,
        attack: 0.03, vib: { rate: 18, depth: 7 },
        filter: { type: 'lowpass', freq: 420, freqEnd: 300, q: 1 },
      }),
    ];
    for (let k = 0; k < 4; k++) {
      layers.push(noise({
        t: k * 0.065 + rng() * 0.015, dur: 0.075, gain: 0.075 * (1 - k * 0.12),
        pan: (k % 2 ? 0.2 : -0.2), rate: (0.55 + k * 0.1) * p, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1050 * p * (1 + k * 0.12), freqEnd: 780 * p, q: 2.2 },
      }));
    }
    return layers;
  },

  /** Pulling yourself over a ledge — scrape plus a small effort grunt. */
  mantle(o = {}) {
    const rng = o.rng || Math.random;
    return [
      ...B.climb({ rng }),
      noise({
        t: 0.16, dur: 0.22, gain: 0.075, attack: 0.03, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 520, freqEnd: 780, q: 3.5 },
      }),
      tone({ t: 0.16, dur: 0.18, gain: 0.05, type: 'triangle', freq: 152, freqEnd: 196, attack: 0.02 }),
    ];
  },

  /**
   * The glider opening. Three fabric snaps, then the canopy catching
   * air, then a two-note paper-kite lift so it feels like a gift and
   * not just wind. This is a signature moment — it gets to be pretty.
   */
  gliderOpen(o = {}) {
    const rng = o.rng || Math.random;
    const layers = [];
    for (let k = 0; k < 3; k++) {
      layers.push(noise({
        t: k * 0.072, dur: 0.05, gain: 0.11 - k * 0.015,
        pan: (k % 2 ? 0.45 : -0.45), rate: 1 + k * 0.25, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 2200 + k * 900, freqEnd: null, q: 0.8 },
      }));
    }
    layers.push(noise({
      t: 0.15, dur: 0.5, gain: 0.13, attack: 0.12, release: 0.2, offset: rng() * 0.9,
      filter: { type: 'lowpass', freq: 900, freqEnd: 1900, q: 0.9 },
    }));
    layers.push(noise({
      t: 0.18, dur: 0.35, gain: 0.055, attack: 0.1, rate: 1.3, pan: 0.3, offset: rng() * 0.9,
      filter: { type: 'bandpass', freq: 2900, freqEnd: 1800, q: 1 },
    }));
    layers.push(...bell(degHz(3), { t: 0.24, dur: 0.7, gain: 0.07, send: 0.3, ratio: 3.01 }));
    layers.push(...bell(degHz(5), { t: 0.36, dur: 0.9, gain: 0.075, send: 0.35, ratio: 3.01 }));
    return layers;
  },

  /** A one-shot gust — used for a boost, and as the wind loop's shape. */
  gust(o = {}) {
    const rng = o.rng || Math.random;
    return [
      noise({
        dur: 0.55, gain: 0.1, attack: 0.14, release: 0.25, offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 800, freqEnd: 1600, q: 0.8 },
      }),
      noise({
        t: 0.05, dur: 0.45, gain: 0.05, attack: 0.16, pan: 0.4, rate: 1.2, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1700, freqEnd: 1100, q: 0.9 },
      }),
    ];
  },

  // ── INTERACTION ──────────────────────────────────────────────

  /**
   * Chest: hinge creak (a resonant sawtooth with vibrato = wood under
   * strain), then the lid clunking over, then the treasure shimmer.
   */
  chest(o = {}) {
    const rng = o.rng || Math.random;
    const p = 0.95 + rng() * 0.1;
    return [
      // the creak
      tone({
        dur: 0.44, gain: 0.055, type: 'sawtooth', freq: 148 * p, freqEnd: 232 * p,
        attack: 0.05, release: 0.06, sustain: 0.7, vib: { rate: 7.5, depth: 6 },
        filter: { type: 'bandpass', freq: 700, freqEnd: 1250, q: 8 },
      }),
      noise({
        dur: 0.4, gain: 0.04, attack: 0.05, rate: 0.5, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 2300, freqEnd: 3100, q: 6 },
      }),
      // the lid going over: knock, then weight
      tone({
        t: 0.5, dur: 0.14, gain: 0.11, type: 'triangle', freq: 300, freqEnd: 190,
        filter: { type: 'bandpass', freq: 470, freqEnd: null, q: 5 },
      }),
      thump(92, { t: 0.5, dur: 0.16, gain: 0.16, drop: 0.6 }),
      noise({
        t: 0.5, dur: 0.06, gain: 0.08, offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 1300, freqEnd: 700, q: 0.8 },
      }),
      // what's inside
      ...bell(degHz(5), { t: 0.62, dur: 1.0, gain: 0.07, send: 0.4, ratio: 3.01 }),
      ...bell(degHz(7), { t: 0.71, dur: 1.1, gain: 0.06, send: 0.4, ratio: 3.01 }),
    ];
  },

  /**
   * Coin. `chain` is how many were collected back-to-back — each one
   * climbs a pentatonic degree, so a trail of coins plays a rising
   * phrase instead of the same chime N times.
   */
  coin(o = {}) {
    const chain = clampNum(Math.floor(o.chain ?? 0), 0, 12);
    const f = degHz(chain, 784);          // start high and bright (G5)
    const layers = [
      tone({ dur: 0.16, gain: 0.11, freq: f, attack: 0.001, send: 0.2 }),
      tone({ dur: 0.34, gain: 0.06, freq: f * 2.02, attack: 0.001, send: 0.3, release: 0.12 }),
      // the metallic "tink" that makes it a coin and not a bell
      noise({
        dur: 0.025, gain: 0.05, offset: (o.rng || Math.random)() * 0.9,
        filter: { type: 'bandpass', freq: 6400, freqEnd: null, q: 5 },
      }),
    ];
    // every fifth coin in a run gets an octave sparkle on top
    if (chain > 0 && chain % 5 === 0) {
      layers.push(...bell(f * 2, { t: 0.03, dur: 0.7, gain: 0.05, send: 0.45, ratio: 3.01 }));
    }
    return layers;
  },

  /** Small pickup — a herb, a key, a page. Quieter cousin of the coin. */
  pickup(o = {}) {
    const rng = o.rng || Math.random;
    return [
      tone({ dur: 0.1, gain: 0.08, freq: degHz(2) * (0.98 + rng() * 0.04), attack: 0.002, send: 0.15 }),
      tone({ t: 0.06, dur: 0.22, gain: 0.06, freq: degHz(4), attack: 0.002, send: 0.25 }),
      noise({
        dur: 0.03, gain: 0.035, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 5000, freqEnd: null, q: 0.7 },
      }),
    ];
  },

  /** Potion: three irregular glugs, then a warm "aah". */
  potion(o = {}) {
    const rng = o.rng || Math.random;
    const layers = [];
    const gaps = [0, 0.115, 0.215];
    for (let k = 0; k < 3; k++) {
      const base = 215 * (1 + k * 0.13) * (0.97 + rng() * 0.06);
      layers.push(tone({
        t: gaps[k], dur: 0.085, gain: 0.1, type: 'sine',
        freq: base, freqEnd: base * 1.42, attack: 0.006,
        filter: { type: 'lowpass', freq: 950, freqEnd: 700, q: 1.4 },
      }));
      layers.push(noise({
        t: gaps[k], dur: 0.035, gain: 0.04, rate: 0.9 + k * 0.15, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 780 + k * 160, freqEnd: null, q: 4 },
      }));
    }
    layers.push(tone({
      t: 0.32, dur: 0.3, gain: 0.06, type: 'triangle', freq: 440, freqEnd: 660,
      attack: 0.04, release: 0.15, send: 0.25,
    }));
    return layers;
  },

  /** Fountain heal: mist, a rising sparkle, and a warm chord underneath. */
  fountain() {
    return [
      noise({
        dur: 0.9, gain: 0.05, attack: 0.25, release: 0.35,
        filter: { type: 'bandpass', freq: 3800, freqEnd: 5200, q: 0.7 },
      }),
      tone({ dur: 1.2, gain: 0.05, freq: 261.63, attack: 0.2, release: 0.5, sustain: 0.8, type: 'triangle' }),
      tone({ dur: 1.2, gain: 0.04, freq: 392.0, attack: 0.25, release: 0.5, sustain: 0.8, type: 'sine' }),
      ...sparkle([degHz(2), degHz(4), degHz(5), degHz(7), degHz(9)],
        { t: 0.1, step: 0.085, gain: 0.075, send: 0.45, fade: 0.92 }),
    ];
  },

  /** Portal: a swell that rushes past you and resolves on a bright bell. */
  portal() {
    return [
      noise({
        dur: 0.75, gain: 0.13, attack: 0.22, release: 0.2,
        filter: { type: 'bandpass', freq: 320, freqEnd: 4200, q: 0.6 },
      }),
      tone({
        dur: 0.7, gain: 0.09, freq: 196, freqEnd: 880, attack: 0.15, send: 0.4,
        fm: { ratio: 1.5, index: 180, decay: 0.5 },
      }),
      tone({ dur: 0.6, gain: 0.07, freq: 62, freqEnd: 96, type: 'sine', attack: 0.2, release: 0.25 }),
      // stepping through
      noise({
        t: 0.7, dur: 0.05, gain: 0.09,
        filter: { type: 'lowpass', freq: 2200, freqEnd: 900, q: 0.8 },
      }),
      ...bell(degHz(7), { t: 0.72, dur: 1.3, gain: 0.08, send: 0.5, ratio: 3.01 }),
      ...bell(degHz(9), { t: 0.8, dur: 1.2, gain: 0.05, send: 0.5, ratio: 3.01 }),
    ];
  },

  /** Math door: a ratchet of seven decelerating clicks, a bolt, a chime. */
  doorUnlock(o = {}) {
    const rng = o.rng || Math.random;
    const layers = [];
    const clicks = [0, 0.058, 0.112, 0.162, 0.209, 0.253, 0.294];
    clicks.forEach((t, k) => {
      layers.push(noise({
        t, dur: 0.02, gain: 0.075, rate: 1 + k * 0.06, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 3000 + k * 220, freqEnd: null, q: 0.9 },
      }));
      layers.push(tone({ t, dur: 0.016, gain: 0.03, type: 'square', freq: 880 + k * 46 }));
    });
    layers.push(thump(146, { t: 0.33, dur: 0.2, gain: 0.15, drop: 0.55 }));
    layers.push(noise({
      t: 0.33, dur: 0.07, gain: 0.08, offset: rng() * 0.9,
      filter: { type: 'lowpass', freq: 900, freqEnd: 520, q: 0.9 },
    }));
    // the door itself moving
    layers.push(noise({
      t: 0.38, dur: 0.55, gain: 0.06, attack: 0.1, rate: 0.6, offset: rng() * 0.9,
      filter: { type: 'lowpass', freq: 560, freqEnd: 340, q: 1.1 },
    }));
    layers.push(...bell(degHz(5), { t: 0.5, dur: 0.8, gain: 0.07, send: 0.35, ratio: 3.01 }));
    layers.push(...bell(degHz(7), { t: 0.62, dur: 1.0, gain: 0.075, send: 0.4, ratio: 3.01 }));
    return layers;
  },

  /** Secret found. Four notes, a shaker, and a warm root. Pure delight. */
  secret() {
    const notes = [degHz(4), degHz(5), degHz(7), degHz(9)];
    const layers = [];
    notes.forEach((f, i) => {
      layers.push(...bell(f, {
        t: i * 0.095, dur: i === 3 ? 1.4 : 0.5, gain: 0.085, send: 0.45, ratio: 3.01,
      }));
    });
    layers.push(tone({ dur: 1.1, gain: 0.05, freq: 130.81, type: 'triangle', attack: 0.02, release: 0.4, sustain: 0.6 }));
    layers.push(noise({
      t: 0.28, dur: 0.18, gain: 0.045, attack: 0.05,
      filter: { type: 'bandpass', freq: 5600, freqEnd: 7200, q: 1.1 },
    }));
    return layers;
  },

  /** Cage break: two paper-and-wicker cracks, fluttering pieces, freedom. */
  rescue(o = {}) {
    const rng = o.rng || Math.random;
    const layers = [
      noise({
        dur: 0.045, gain: 0.15, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 2600, freqEnd: null, q: 0.9 },
      }),
      tone({ dur: 0.11, gain: 0.09, type: 'triangle', freq: 430, freqEnd: 175 }),
      noise({
        t: 0.075, dur: 0.04, gain: 0.11, rate: 0.85, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 2100, freqEnd: null, q: 0.9 },
      }),
      thump(120, { t: 0.07, dur: 0.14, gain: 0.11, drop: 0.6 }),
    ];
    // pieces of the cage fluttering down like torn paper
    for (let k = 0; k < 4; k++) {
      layers.push(noise({
        t: 0.15 + k * 0.085 + rng() * 0.03, dur: 0.1, gain: 0.05 * (1 - k * 0.18),
        pan: (k % 2 ? 0.55 : -0.55), attack: 0.02, rate: 1.1 - k * 0.12, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1900 - k * 220, freqEnd: 1200, q: 1.1 },
      }));
    }
    // and the friend is out
    layers.push(...bell(degHz(0), { t: 0.42, dur: 0.6, gain: 0.075, send: 0.35, ratio: 3.01 }));
    layers.push(...bell(degHz(2), { t: 0.52, dur: 0.7, gain: 0.075, send: 0.4, ratio: 3.01 }));
    layers.push(...bell(degHz(5), { t: 0.63, dur: 1.3, gain: 0.08, send: 0.45, ratio: 3.01 }));
    return layers;
  },

  /** Encounter: a rising surprise. Startling for a second, never scary. */
  encounter() {
    return [
      noise({
        dur: 0.35, gain: 0.11, attack: 0.14, release: 0.12,
        filter: { type: 'bandpass', freq: 500, freqEnd: 2600, q: 0.8 },
      }),
      tone({ dur: 0.3, gain: 0.08, freq: 175, freqEnd: 330, type: 'triangle', attack: 0.1 }),
      thump(150, { t: 0.3, dur: 0.18, gain: 0.16, drop: 0.5 }),
      thump(150, { t: 0.42, dur: 0.22, gain: 0.13, drop: 0.5 }),
    ];
  },

  /** Fairy: the legacy shimmer, rebuilt with real bells. */
  fairy() {
    return sparkle([degHz(4), degHz(6), degHz(8), degHz(6), degHz(9)],
      { t: 0, step: 0.07, gain: 0.06, send: 0.5, fade: 0.95 });
  },

  // ── COMBAT ───────────────────────────────────────────────────

  /** Knight: a weighted swing that ends in real steel (FM inharmonics). */
  attackKnight(o = {}) {
    const rng = o.rng || Math.random;
    const p = 0.95 + rng() * 0.1;
    return [
      noise({
        dur: 0.18, gain: 0.12, attack: 0.05, release: 0.06, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 900 * p, freqEnd: 4800 * p, q: 1.2 },
      }),
      noise({
        dur: 0.2, gain: 0.055, attack: 0.06, offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 420, freqEnd: 700, q: 0.9 },
      }),
      tone({
        t: 0.12, dur: 0.34, gain: 0.07, freq: 660 * p, send: 0.28, release: 0.18,
        fm: { ratio: 2.76, index: 900, decay: 0.09 },
      }),
    ];
  },

  /** Wizard: a charge that gathers, then a bright chord and a rush out. */
  attackWizard(o = {}) {
    const rng = o.rng || Math.random;
    return [
      tone({
        dur: 0.34, gain: 0.07, freq: 196, freqEnd: 880, attack: 0.2, send: 0.3,
        vib: { rate: 9, depth: 12 },
      }),
      noise({
        dur: 0.34, gain: 0.05, attack: 0.22, rate: 1.1, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 2200, freqEnd: 5200, q: 4 },
      }),
      ...bell(degHz(5), { t: 0.34, dur: 0.55, gain: 0.06, send: 0.45, ratio: 3.01 }),
      ...bell(degHz(7), { t: 0.34, dur: 0.6, gain: 0.05, send: 0.45, ratio: 3.01 }),
      ...bell(degHz(9), { t: 0.36, dur: 0.7, gain: 0.045, send: 0.5, ratio: 3.01 }),
      noise({
        t: 0.34, dur: 0.38, gain: 0.1, release: 0.12, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 4200, freqEnd: 600, q: 0.7 },
      }),
    ];
  },

  /** Bunny: two fast light taps. Over before you finish blinking. */
  attackBunny(o = {}) {
    const rng = o.rng || Math.random;
    const hit = (t, p, g) => ([
      noise({
        t, dur: 0.045, gain: 0.1 * g, rate: 1.2, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 4000 * p, freqEnd: null, q: 0.8 },
      }),
      tone({ t, dur: 0.06, gain: 0.065 * g, freq: 1400 * p, freqEnd: 2700 * p, attack: 0.001 }),
    ]);
    return [
      ...hit(0, 1, 1),
      ...hit(0.075, 1.14, 0.8),
      tone({ t: 0.075, dur: 0.16, gain: 0.035, freq: degHz(7), attack: 0.002, send: 0.25 }),
    ];
  },

  /** Impact, by weight. 0 = a tap, 1 = a solid hit, 2 = a crushing blow. */
  impact(o = {}) {
    const rng = o.rng || Math.random;
    const w = clampNum(o.weight ?? 1, 0.3, 2);
    const layers = [
      noise({
        dur: 0.055 * w + 0.03, gain: 0.13 * Math.sqrt(w), offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 2000 / w, freqEnd: 700 / w, q: 0.9 },
      }),
      thump(250 / w, { dur: 0.07 * w + 0.03, gain: 0.11 * w, drop: 0.5 }),
    ];
    if (w >= 0.9) {
      layers.push(thump(120 / w, { t: 0.004, dur: 0.16 * w, gain: 0.13 * w, drop: 0.5 }));
      layers.push(noise({
        t: 0.002, dur: 0.09, gain: 0.07, rate: 0.8, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 700, freqEnd: 400, q: 1.6 },
      }));
    }
    if (w >= 1.5) {
      layers.push(noise({
        dur: 0.03, gain: 0.1, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 3200, freqEnd: null, q: 0.9 },
      }));
      for (let k = 0; k < 3; k++) {
        layers.push(noise({
          t: 0.06 + k * 0.05, dur: 0.03, gain: 0.04 * (1 - k * 0.25),
          pan: (k % 2 ? 0.6 : -0.6), rate: 1.1 + k * 0.2, offset: rng() * 0.9,
          filter: { type: 'highpass', freq: 3000 + k * 800, freqEnd: null, q: 0.8 },
        }));
      }
      layers[0].send = 0.14;
    }
    return layers;
  },

  /** Enemy hurt: a short paper tear plus a comic little "oh". */
  enemyHurt(o = {}) {
    const rng = o.rng || Math.random;
    const p = 0.92 + rng() * 0.18;
    const layers = [];
    for (let k = 0; k < 3; k++) {
      layers.push(noise({
        t: k * 0.032, dur: 0.045, gain: 0.085 * (1 - k * 0.15),
        rate: (0.9 + k * 0.25) * p, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: (2100 + k * 700) * p, freqEnd: 3400 * p, q: 1.6 },
      }));
    }
    layers.push(tone({
      t: 0.03, dur: 0.13, gain: 0.06, type: 'triangle',
      freq: 540 * p, freqEnd: 372 * p, attack: 0.006,
    }));
    return layers;
  },

  /**
   * Enemy defeat: the paper figure tears, the pieces flutter down, and
   * a soft three-note fall says goodbye. Nobody dies in this game —
   * they come apart into paper and drift away.
   */
  enemyDefeat(o = {}) {
    const rng = o.rng || Math.random;
    const layers = [];
    for (let k = 0; k < 5; k++) {
      layers.push(noise({
        t: k * 0.042, dur: 0.06, gain: 0.09 * (1 - k * 0.1),
        pan: (k % 2 ? 0.25 : -0.25), rate: 0.85 + k * 0.16, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1800 + k * 420, freqEnd: 3600, q: 1.4 },
      }));
    }
    for (let k = 0; k < 6; k++) {
      layers.push(noise({
        t: 0.26 + k * 0.1 + rng() * 0.04, dur: 0.13, gain: 0.045 * (1 - k * 0.13),
        pan: (k % 2 ? 0.6 : -0.6), attack: 0.03, rate: 1.05 - k * 0.07, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1000 - k * 70, freqEnd: 700, q: 1.1 },
      }));
    }
    [659.25, 587.33, 493.88].forEach((f, i) => {
      layers.push(tone({
        t: 0.3 + i * 0.13, dur: 0.3, gain: 0.05, freq: f,
        type: 'sine', attack: 0.01, release: 0.12, send: 0.3,
      }));
    });
    layers.push(noise({
      t: 0.92, dur: 0.09, gain: 0.05, attack: 0.01, offset: rng() * 0.9,
      filter: { type: 'lowpass', freq: 520, freqEnd: 300, q: 0.9 },
    }));
    return layers;
  },

  /** Hero hurt: soft, brief, never punishing. A bump, not a scream. */
  heroHurt(o = {}) {
    const rng = o.rng || Math.random;
    return [
      noise({
        dur: 0.07, gain: 0.09, offset: rng() * 0.9,
        filter: { type: 'lowpass', freq: 1400, freqEnd: 600, q: 0.9 },
      }),
      thump(210, { dur: 0.1, gain: 0.09, drop: 0.62 }),
      tone({ t: 0.03, dur: 0.16, gain: 0.05, type: 'triangle', freq: 340, freqEnd: 262, attack: 0.01 }),
    ];
  },

  /** A critical hit: the impact, plus a bright ring that says "wow". */
  critical(o = {}) {
    return [
      ...B.impact({ ...o, weight: 1.7 }),
      ...bell(degHz(7), { t: 0.03, dur: 0.9, gain: 0.07, send: 0.4, ratio: 2.4 }),
      ...bell(degHz(9), { t: 0.09, dur: 0.8, gain: 0.05, send: 0.45, ratio: 2.4 }),
    ];
  },

  /**
   * Boss phase change. The floor drops, the air holds its breath, then
   * a huge bell and three drums. Grand and a bit thrilling — the chord
   * is a suspended fourth, which is tense WITHOUT being minor-key
   * frightening, which matters a great deal for a six-year-old.
   */
  bossPhase() {
    const layers = [
      // inhale
      noise({
        dur: 0.5, gain: 0.08, attack: 0.42, release: 0.03,
        filter: { type: 'bandpass', freq: 400, freqEnd: 3000, q: 0.7 },
      }),
      tone({ dur: 1.0, gain: 0.14, freq: 55, freqEnd: 44, type: 'sine', attack: 0.3, release: 0.4, sustain: 0.7 }),
      // Dsus4: D-G-A. Unresolved, expectant, not sad.
      tone({ t: 0.5, dur: 1.2, gain: 0.055, freq: 293.66, type: 'triangle', attack: 0.06, release: 0.5, sustain: 0.6, send: 0.3 }),
      tone({ t: 0.5, dur: 1.2, gain: 0.05, freq: 392.0, type: 'triangle', attack: 0.08, release: 0.5, sustain: 0.6, send: 0.3 }),
      tone({ t: 0.5, dur: 1.2, gain: 0.045, freq: 440.0, type: 'triangle', attack: 0.1, release: 0.5, sustain: 0.6, send: 0.3 }),
      ...bell(220, { t: 0.5, dur: 1.6, gain: 0.11, send: 0.5, ratio: 2.76 }),
    ];
    [0.5, 0.62, 0.76].forEach((t, i) => {
      layers.push(thump(140, { t, dur: 0.2, gain: [0.16, 0.13, 0.19][i], drop: 0.42 }));
    });
    return layers;
  },

  /** Victory flourish: a rising pentatonic run onto a bright triad. */
  victory() {
    const layers = sparkle([degHz(0), degHz(2), degHz(4), degHz(5), degHz(7)],
      { t: 0, step: 0.085, gain: 0.085, send: 0.35, fade: 1 });
    layers.push(...bell(degHz(10), { t: 0.44, dur: 1.6, gain: 0.09, send: 0.45, ratio: 3.01 }));
    layers.push(...bell(degHz(12), { t: 0.44, dur: 1.5, gain: 0.06, send: 0.45, ratio: 3.01 }));
    layers.push(tone({ t: 0.44, dur: 1.2, gain: 0.06, freq: 130.81, type: 'triangle', attack: 0.02, release: 0.4, sustain: 0.5 }));
    for (let k = 0; k < 4; k++) {
      layers.push(noise({
        t: k * 0.085, dur: 0.06, gain: 0.04, attack: 0.01, rate: 1 + k * 0.1,
        filter: { type: 'bandpass', freq: 5200 + k * 500, freqEnd: null, q: 1.2 },
      }));
    }
    return layers;
  },

  /** Level up: victory's little brother, tighter and even brighter. */
  levelUp() {
    const layers = sparkle([degHz(2), degHz(4), degHz(6), degHz(9)],
      { t: 0, step: 0.07, gain: 0.08, send: 0.4, fade: 1 });
    layers.push(...bell(degHz(11), { t: 0.28, dur: 1.4, gain: 0.085, send: 0.5, ratio: 3.01 }));
    return layers;
  },

  /**
   * Defeat. This must not feel like a punishment — a child who lost a
   * battle is already disappointed. A soft falling figure that lands on
   * a warm major third: "that's okay, go again."
   */
  defeat() {
    const layers = [];
    [392.0, 349.23, 293.66].forEach((f, i) => {
      layers.push(tone({
        t: i * 0.2, dur: 0.42, gain: 0.075, freq: f, type: 'triangle',
        attack: 0.03, release: 0.2, send: 0.25,
        filter: { type: 'lowpass', freq: 1600, freqEnd: 1000, q: 0.8 },
      }));
    });
    layers.push(tone({ t: 0.6, dur: 0.9, gain: 0.055, freq: 261.63, type: 'sine', attack: 0.06, release: 0.4, sustain: 0.6, send: 0.3 }));
    layers.push(tone({ t: 0.6, dur: 0.9, gain: 0.04, freq: 329.63, type: 'sine', attack: 0.09, release: 0.4, sustain: 0.6, send: 0.3 }));
    return layers;
  },

  /** Floor complete: the biggest, warmest thing in the game. */
  floorComplete() {
    const layers = sparkle([degHz(0), degHz(2), degHz(4), degHz(5), degHz(7), degHz(9)],
      { t: 0, step: 0.1, gain: 0.08, send: 0.4, fade: 1 });
    layers.push(...bell(degHz(10), { t: 0.62, dur: 2.0, gain: 0.09, send: 0.5, ratio: 3.01 }));
    layers.push(...bell(degHz(12), { t: 0.66, dur: 1.9, gain: 0.06, send: 0.5, ratio: 3.01 }));
    layers.push(...bell(degHz(14), { t: 0.7, dur: 1.8, gain: 0.05, send: 0.5, ratio: 3.01 }));
    layers.push(tone({ t: 0.6, dur: 1.6, gain: 0.06, freq: 130.81, type: 'triangle', attack: 0.02, release: 0.6, sustain: 0.5 }));
    layers.push(noise({
      t: 0.55, dur: 0.5, gain: 0.05, attack: 0.06, release: 0.2,
      filter: { type: 'bandpass', freq: 5000, freqEnd: 7600, q: 0.8 },
    }));
    return layers;
  },

  /** Healing in battle — the fountain's quick cousin. */
  heal() {
    return [
      tone({ dur: 0.5, gain: 0.05, freq: 392.0, type: 'sine', attack: 0.08, release: 0.25, sustain: 0.7 }),
      ...sparkle([degHz(4), degHz(6), degHz(8)], { t: 0.04, step: 0.075, gain: 0.065, send: 0.4, fade: 0.95 }),
      noise({
        dur: 0.45, gain: 0.035, attack: 0.15,
        filter: { type: 'bandpass', freq: 4400, freqEnd: 6000, q: 0.8 },
      }),
    ];
  },

  // ── UI ───────────────────────────────────────────────────────

  /** Button press: felt, not plastic. A soft tick over a low wood tap. */
  press() {
    return [
      tone({ dur: 0.055, gain: 0.1, freq: 640, freqEnd: 555, type: 'sine', attack: 0.002 }),
      noise({
        dur: 0.018, gain: 0.055,
        filter: { type: 'lowpass', freq: 2600, freqEnd: 1500, q: 0.9 },
      }),
      tone({ dur: 0.03, gain: 0.03, freq: 2400, type: 'sine', attack: 0.001 }),
    ];
  },

  /** Confirm: press, then a small step up. Two notes, always consonant. */
  confirm() {
    return [
      ...B.press(),
      tone({ t: 0.04, dur: 0.1, gain: 0.085, freq: degHz(2), attack: 0.002, send: 0.15 }),
      tone({ t: 0.11, dur: 0.24, gain: 0.075, freq: degHz(4), attack: 0.002, send: 0.25, release: 0.1 }),
    ];
  },

  /** Back: the same gesture, downward and softer. Never a buzz. */
  back() {
    return [
      tone({ dur: 0.09, gain: 0.07, freq: degHz(3), attack: 0.004, type: 'triangle' }),
      tone({ t: 0.06, dur: 0.18, gain: 0.06, freq: degHz(1), attack: 0.004, type: 'triangle', release: 0.08 }),
      noise({
        dur: 0.02, gain: 0.03,
        filter: { type: 'lowpass', freq: 1800, freqEnd: 900, q: 0.9 },
      }),
    ];
  },

  /** Hover: barely there — a breath of a tick with a hint of lift. */
  hover() {
    return [
      tone({ dur: 0.035, gain: 0.032, freq: 1150, freqEnd: 1290, type: 'sine', attack: 0.002 }),
      noise({
        dur: 0.012, gain: 0.016,
        filter: { type: 'highpass', freq: 6000, freqEnd: null, q: 0.7 },
      }),
    ];
  },

  /** Page turn: two fibrous sweeps and a flick. */
  pageTurn(o = {}) {
    const rng = o.rng || Math.random;
    return [
      noise({
        dur: 0.19, gain: 0.09, attack: 0.03, release: 0.05, pan: -0.2, rate: 1.15, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 1300, freqEnd: 4300, q: 0.7 },
      }),
      noise({
        t: 0.12, dur: 0.14, gain: 0.06, attack: 0.02, pan: 0.3, rate: 0.9, offset: rng() * 0.9,
        filter: { type: 'bandpass', freq: 2600, freqEnd: 1400, q: 0.9 },
      }),
      noise({
        t: 0.2, dur: 0.025, gain: 0.045, offset: rng() * 0.9,
        filter: { type: 'highpass', freq: 4800, freqEnd: null, q: 0.8 },
      }),
    ];
  },

  /**
   * Correct answer. Rising, warm, and short enough to keep the pace up.
   * A major third into a fifth, doubled an octave up on a bell so it
   * reads as "bright" rather than merely "loud".
   */
  correct() {
    return [
      tone({ dur: 0.12, gain: 0.1, freq: degHz(0), type: 'triangle', attack: 0.003, send: 0.15 }),
      tone({ t: 0.075, dur: 0.14, gain: 0.1, freq: degHz(2), type: 'triangle', attack: 0.003, send: 0.2 }),
      ...bell(degHz(4), { t: 0.15, dur: 0.7, gain: 0.08, send: 0.35, ratio: 3.01 }),
      noise({
        t: 0.15, dur: 0.07, gain: 0.035, attack: 0.01,
        filter: { type: 'bandpass', freq: 5600, freqEnd: 7000, q: 1.2 },
      }),
    ];
  },

  /**
   * Wrong answer. THE MOST CAREFULLY DESIGNED SOUND IN THE GAME.
   *
   * Rules it obeys: no noise burst, no sawtooth, no dissonance, low
   * volume, lowpassed so nothing is sharp, and — the important part —
   * it does NOT end on the low note. A soft whole-step dip lands on a
   * felt thump, and then a quiet note lifts back UP. A child hears
   * "not that one — try again", never "you failed".
   */
  wrong() {
    return [
      tone({
        dur: 0.2, gain: 0.075, freq: 392.0, freqEnd: 349.23, sweep: 'lin',
        type: 'triangle', attack: 0.022, release: 0.09,
        filter: { type: 'lowpass', freq: 1200, freqEnd: 850, q: 0.7 },
      }),
      tone({ dur: 0.12, gain: 0.04, freq: 146.83, type: 'sine', attack: 0.012 }),
      // the little lift back up — this is the whole point
      tone({ t: 0.2, dur: 0.22, gain: 0.042, freq: 440.0, type: 'sine', attack: 0.03, release: 0.12, send: 0.2 }),
    ];
  },

  /**
   * Streak. Each consecutive correct answer rises one pentatonic degree
   * and gains a touch more shimmer, so a child on a roll literally
   * hears themselves climbing. Rolls over the octave and keeps going;
   * clamped so it never gets shrill.
   */
  streak(o = {}) {
    const n = clampNum(Math.floor(o.streak ?? 0), 0, 14);
    const f = degHz(n, 523.25);
    const shimmer = 0.2 + Math.min(n, 10) * 0.03;
    const layers = [
      tone({ dur: 0.1, gain: 0.075, freq: f, type: 'triangle', attack: 0.002, send: shimmer * 0.5 }),
      ...bell(f * 2, { t: 0.02, dur: 0.55 + n * 0.02, gain: 0.06, send: shimmer, ratio: 3.01 }),
    ];
    if (n >= 4) {
      layers.push(...bell(degHz(n + 2, 523.25), { t: 0.07, dur: 0.5, gain: 0.04, send: shimmer, ratio: 3.01 }));
    }
    if (n >= 8) {
      layers.push(noise({
        t: 0.05, dur: 0.16, gain: 0.035, attack: 0.02,
        filter: { type: 'bandpass', freq: 6000, freqEnd: 8000, q: 1 },
      }));
    }
    return layers;
  },
};

// ══════════════════════════════════════════════════════════════════
// REGISTRY
// ══════════════════════════════════════════════════════════════════

/** key → builder(opts) → layer array. Every sound the game can make. */
export const SFX = {
  // traversal
  'move/step': (o) => footstepPlan(o.surface, o),
  'move/step/grass': (o) => footstepPlan('grass', o),
  'move/step/stone': (o) => footstepPlan('stone', o),
  'move/step/sand': (o) => footstepPlan('sand', o),
  'move/step/water': (o) => footstepPlan('water', o),
  'move/step/snow': (o) => footstepPlan('snow', o),
  'move/step/wood': (o) => footstepPlan('wood', o),
  'move/step/cloud': (o) => footstepPlan('cloud', o),
  'move/step/crystal': (o) => footstepPlan('crystal', o),
  'move/jump': B.jump,
  'move/land': B.land,
  'move/land-heavy': B.landHeavy,
  'move/splash': B.splash,
  'move/swim': B.swim,
  'move/climb': B.climb,
  'move/mantle': B.mantle,
  'move/glider-open': B.gliderOpen,
  'move/gust': B.gust,

  // interaction
  'world/chest': B.chest,
  'world/chest-open': B.chest,
  'world/coin': B.coin,
  'world/gold': B.coin,
  'world/pickup': B.pickup,
  'world/potion': B.potion,
  'world/fountain': B.fountain,
  'world/portal': B.portal,
  'world/door-unlock': B.doorUnlock,
  'world/secret': B.secret,
  'world/rescue': B.rescue,
  'world/encounter': B.encounter,
  'world/fairy': B.fairy,
  'world/floor-complete': B.floorComplete,
  'world/footstep': (o) => footstepPlan(o.surface, o),

  // combat
  'combat/attack-knight': B.attackKnight,
  'combat/attack-wizard': B.attackWizard,
  'combat/attack-bunny': B.attackBunny,
  'combat/impact-light': (o) => B.impact({ ...o, weight: 0.55 }),
  'combat/impact-medium': (o) => B.impact({ ...o, weight: 1 }),
  'combat/impact-heavy': (o) => B.impact({ ...o, weight: 1.8 }),
  'combat/enemy-hurt': B.enemyHurt,
  'combat/enemy-defeat': B.enemyDefeat,
  'combat/hero-hurt': B.heroHurt,
  'combat/critical': B.critical,
  'combat/boss-phase': B.bossPhase,
  'combat/victory': B.victory,
  'combat/defeat': B.defeat,
  'combat/level-up': B.levelUp,
  'combat/heal': B.heal,

  // ui
  'ui/press': B.press,
  'ui/click': B.press,
  'ui/confirm': B.confirm,
  'ui/back': B.back,
  'ui/hover': B.hover,
  'ui/page-turn': B.pageTurn,
  'ui/correct': B.correct,
  'ui/wrong': B.wrong,
  'ui/streak': B.streak,
};

/** Legacy keys the rest of the game already calls, mapped onto the library. */
export const SFX_ALIASES = {
  'battle/correct': 'ui/correct',
  'battle/wrong': 'ui/wrong',
  'battle/hit': 'combat/impact-medium',
  'battle/hit_hero': 'combat/hero-hurt',
  'battle/hit-hero': 'combat/hero-hurt',
  'battle/hit-enemy': 'combat/enemy-hurt',
  'battle/heal': 'combat/heal',
  'battle/victory': 'combat/victory',
  'battle/defeat': 'combat/defeat',
  'battle/level_up': 'combat/level-up',
  'battle/level-up': 'combat/level-up',
  'battle/critical': 'combat/critical',
};

/** Attack sound per hero class. Unknown classes get the knight's swing. */
export const CLASS_ATTACK = {
  knight: 'combat/attack-knight', paladin: 'combat/attack-knight',
  guardian: 'combat/attack-knight', warrior: 'combat/attack-knight',
  fighter: 'combat/attack-knight', tank: 'combat/attack-knight',

  wizard: 'combat/attack-wizard', mage: 'combat/attack-wizard',
  sorcerer: 'combat/attack-wizard', witch: 'combat/attack-wizard',
  druid: 'combat/attack-wizard', healer: 'combat/attack-wizard',
  cleric: 'combat/attack-wizard', summoner: 'combat/attack-wizard',

  bunny: 'combat/attack-bunny', rogue: 'combat/attack-bunny',
  scout: 'combat/attack-bunny', ninja: 'combat/attack-bunny',
  archer: 'combat/attack-bunny', monk: 'combat/attack-bunny',
  bard: 'combat/attack-bunny',
};

export function attackKeyForClass(cls) {
  if (!cls) return 'combat/attack-knight';
  return CLASS_ATTACK[String(cls).toLowerCase().trim()] || 'combat/attack-knight';
}

export const SFX_KEYS = Object.keys(SFX);

export function resolveSfxKey(key) {
  if (SFX[key]) return key;
  const a = SFX_ALIASES[key];
  return a && SFX[a] ? a : null;
}

export function hasSfx(key) { return resolveSfxKey(key) != null; }

/**
 * The glide wind loop lives outside the one-shot registry because it is
 * sustained: synthAudio holds these nodes open and rides `gain` and
 * `freq` with the glider's speed. Data lives here so the numbers are
 * covered by the same test as everything else.
 */
export const GLIDE_WIND = {
  gain: 0.075,          // at intensity 1
  attack: 0.6,
  release: 0.5,
  layers: [
    { filter: 'lowpass', freq: 520, freqSpan: 620, q: 0.7, rate: 1.0, gain: 1.0, pan: -0.35, lfoRate: 0.23, lfoDepth: 170 },
    { filter: 'bandpass', freq: 1500, freqSpan: 1400, q: 0.8, rate: 0.87, gain: 0.55, pan: 0.35, lfoRate: 0.17, lfoDepth: 330 },
  ],
};

// ══════════════════════════════════════════════════════════════════
// NORMALISE + VALIDATE
// ══════════════════════════════════════════════════════════════════

function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// Clamping deliberately does NOT rescue NaN (Math.max(NaN, x) is NaN)
// so a broken builder shows up in the test instead of silently going
// quiet — or worse, throwing inside an AudioParam at runtime.
function normalizeLayer(L) {
  const o = { ...L };
  o.t = clampNum(o.t, 0, 30);
  o.dur = clampNum(o.dur, 0.002, 8);
  o.gain = clampNum(o.gain, 0.0002, 0.9);
  o.attack = clampNum(o.attack, 0.0005, 2);
  o.release = clampNum(o.release, 0, 4);
  o.pan = clampNum(o.pan, -1, 1);
  o.send = clampNum(o.send, 0, 1);
  if (o.sustain != null) o.sustain = clampNum(o.sustain, 0.01, 1);
  if (o.kind === 'tone') {
    o.freq = clampNum(o.freq, 20, 18000);
    if (o.freqEnd != null) o.freqEnd = clampNum(o.freqEnd, 20, 18000);
    if (o.fm) o.fm = { ratio: clampNum(o.fm.ratio, 0.05, 20), index: clampNum(o.fm.index, 0, 6000), decay: clampNum(o.fm.decay ?? 0.1, 0.005, 4) };
    if (o.vib) o.vib = { rate: clampNum(o.vib.rate, 0.1, 60), depth: clampNum(o.vib.depth, 0, 2000) };
  } else {
    o.rate = clampNum(o.rate, 0.05, 8);
    o.offset = clampNum(o.offset, 0, 0.95);
  }
  if (o.filter) {
    o.filter = {
      type: o.filter.type,
      freq: clampNum(o.filter.freq, 20, 20000),
      freqEnd: o.filter.freqEnd == null ? null : clampNum(o.filter.freqEnd, 20, 20000),
      q: clampNum(o.filter.q ?? 1, 0.05, 24),
    };
  }
  return o;
}

/**
 * Sum every layer that is sounding at each layer's onset; if the worst
 * instant exceeds GAIN_CAP, scale the whole plan down. This is what
 * keeps a 20-layer fanfare from arriving at the master limiter as a
 * single squashed blat.
 */
function applyGainBudget(layers) {
  let peak = 0;
  for (const a of layers) {
    let sum = 0;
    for (const b of layers) {
      if (b.t <= a.t + 1e-6 && a.t < b.t + b.dur + b.release) sum += b.gain;
    }
    if (sum > peak) peak = sum;
  }
  if (peak > GAIN_CAP) {
    const s = GAIN_CAP / peak;
    for (const L of layers) L.gain *= s;
  }
  return peak;
}

/**
 * Build a finished, budget-checked plan for a sound.
 * @returns {{key:string, layers:object[], dur:number, peak:number}|null}
 */
export function buildSfx(key, opts = {}) {
  const k = resolveSfxKey(key);
  if (!k) return null;
  const raw = SFX[k](opts || {});
  const layers = (raw || []).filter(Boolean).map(normalizeLayer);
  const peak = applyGainBudget(layers);
  let dur = 0;
  for (const L of layers) dur = Math.max(dur, L.t + L.dur + L.release);
  return { key: k, layers, dur, peak };
}

const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'allpass']);
const OSC_TYPES = new Set(['sine', 'triangle', 'sawtooth', 'square']);

/**
 * Structural + numeric audit of a plan. Returns a list of problems
 * (empty means good). Used by the node test over every registered key,
 * and cheap enough that the renderer could call it in a debug build.
 */
export function checkPlan(plan) {
  const bad = [];
  if (!plan || !Array.isArray(plan.layers)) return ['plan is not an object with layers'];
  if (!plan.layers.length) bad.push('plan has no layers');
  if (!Number.isFinite(plan.dur) || plan.dur <= 0) bad.push(`plan.dur=${plan.dur}`);

  const num = (v, path) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`${path}=${v}`);
  };

  plan.layers.forEach((L, i) => {
    const p = `layer[${i}]`;
    for (const f of ['t', 'dur', 'gain', 'attack', 'release', 'pan', 'send']) num(L[f], `${p}.${f}`);
    if (L.sustain != null) num(L.sustain, `${p}.sustain`);
    if (L.gain > 0.9) bad.push(`${p}.gain too hot: ${L.gain}`);
    if (L.kind === 'tone') {
      if (!OSC_TYPES.has(L.type)) bad.push(`${p}.type=${L.type}`);
      num(L.freq, `${p}.freq`);
      if (L.freq <= 0) bad.push(`${p}.freq must be > 0`);
      if (L.freqEnd != null) {
        num(L.freqEnd, `${p}.freqEnd`);
        if (L.freqEnd <= 0) bad.push(`${p}.freqEnd must be > 0`);
      }
      if (L.fm) { num(L.fm.ratio, `${p}.fm.ratio`); num(L.fm.index, `${p}.fm.index`); num(L.fm.decay, `${p}.fm.decay`); }
      if (L.vib) { num(L.vib.rate, `${p}.vib.rate`); num(L.vib.depth, `${p}.vib.depth`); }
    } else if (L.kind === 'noise') {
      num(L.rate, `${p}.rate`);
      num(L.offset, `${p}.offset`);
      if (L.rate <= 0) bad.push(`${p}.rate must be > 0`);
      if (!L.filter) bad.push(`${p} noise needs a filter`);
    } else {
      bad.push(`${p}.kind=${L.kind}`);
    }
    if (L.filter) {
      if (!FILTER_TYPES.has(L.filter.type)) bad.push(`${p}.filter.type=${L.filter.type}`);
      num(L.filter.freq, `${p}.filter.freq`);
      num(L.filter.q, `${p}.filter.q`);
      if (L.filter.freq <= 0) bad.push(`${p}.filter.freq must be > 0`);
      if (L.filter.freqEnd != null) {
        num(L.filter.freqEnd, `${p}.filter.freqEnd`);
        if (L.filter.freqEnd <= 0) bad.push(`${p}.filter.freqEnd must be > 0`);
      }
    }
  });
  return bad;
}
