/**
 * 3D POSITIONAL AUDIO — the island's ears.
 *
 * The world became 3D and the sound stayed flat: every cue was a mono UI beep
 * summed at the centre of the head, so a waterfall to your left and a portal
 * behind you sounded identical. This module is the spatial layer that fixes
 * that. It does three jobs:
 *
 *   1. LISTENER   the WebAudio AudioListener rides the CAMERA (not the hero),
 *                 with forward/up derived from the camera quaternion. The eye
 *                 is the ear: what is on the left of the frame is on the left
 *                 of the mix, and it stays correct while the player orbits.
 *   2. BEDS       seven procedural ambience layers — wind, birds, surf, a low
 *                 ember roar, sky chimes, library page-rustle, market murmur —
 *                 crossfaded by the biome under the player's feet, by distance
 *                 to the waterline, by night, and ducked hard indoors.
 *   3. EMITTERS   PannerNode voices attached to real Object3Ds (portal arches
 *                 hum, fountains burble, collectibles chime, a waterfall
 *                 roars), culled and budgeted so a hundred attachable things
 *                 never become a hundred oscillators.
 *
 * ── LAWS THIS FILE OBEYS ───────────────────────────────────────────────────
 *
 * NO FILES. Every sound here is synthesised: noise buffers, oscillators,
 * biquads. The game ships zero audio assets and that is not changing.
 *
 * ONE AUDIOCONTEXT. music/audioGraph.js owns it. This module never calls
 * `new AudioContext` and — more subtly — never even calls getCtx(), because
 * getCtx() CREATES the context on first touch and creating one outside a user
 * gesture is how iPad ends up with a permanently suspended graph. Instead we
 * poll audioState(): null means "no context yet, do nothing", 'suspended'
 * means "the unlock hasn't happened, do nothing", and only 'running' lets us
 * build nodes. main.js's document-level capture listeners are the only thing
 * allowed to bring the context up, and we add no listeners of our own.
 *
 * EVERYTHING THROUGH THE BUSES. Two sub-buses hang off the shared sfx bus:
 * `ambientBus` for the beds and `spatialBus` for the panners. Nothing touches
 * ctx.destination, so the Settings sliders, the mute switch and — critically —
 * the master limiter all still apply. A pile-up of voices here gets caught by
 * the same brick wall that catches a chord stack in the score.
 *
 * ── WHY THE MATH IS EXPORTED SEPARATELY ────────────────────────────────────
 * `npm test` runs every *.test.js in plain Node, where there is no WebAudio and
 * no DOM. So this file imports NOTHING from three, touches no globals at module
 * scope, and keeps the parts worth testing — the distance law, the bed mixer,
 * the quaternion basis, the voice planner — as pure exported functions above
 * the runtime. audio3d.test.js covers those; the node plumbing below is
 * verified in the browser.
 */

import { audioState, getCtx, getSfxBus } from '../systems/music/audioGraph.js';

// ═══════════════════════════════════════════════════════════════════════════
// PURE MATH + TABLES  (no WebAudio, no three, no DOM — safe in node --test)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The distance law.
 *
 * The island is 480 m across and a child plays it on an iPad speaker at half
 * volume in a noisy room. Both ends of that sentence matter:
 *
 *   refDistance 10   The follow camera sits ~9-11 m behind the hero, so an
 *                    emitter the hero is STANDING ON is about one refDistance
 *                    away. Anything closer would need gain > 1, which is why
 *                    the model clamps at ref: walking into a fountain gets
 *                    loud, never distorted.
 *   maxDistance 170  A third of the world. Past that the panner freezes the
 *                    gain — no point spending a voice on it, and the culler
 *                    below has already reclaimed it.
 *   rolloff 0.62     GENTLE, and deliberately gentler than physics. True
 *                    inverse-square rolloff makes a cue vanish about 25 m out,
 *                    which for a five-year-old means the sound simply is not
 *                    there. At 0.62 an emitter 60 m away still plays at 24% —
 *                    quiet, clearly distant, but findable. Sound is a
 *                    WAYFINDING cue in an open world; it has to survive the
 *                    walk toward it.
 *
 * equalpower panning, not HRTF: HRTF convolves per voice per block and is the
 * single most expensive thing you can ask an iPad's audio thread to do. With
 * a dozen live voices it is the difference between smooth and crackling, and
 * on the speakers a child actually uses it buys almost nothing.
 */
export const FIELD = {
  distanceModel: 'inverse',
  panningModel: 'equalpower',
  refDistance: 10,
  maxDistance: 170,
  rolloffFactor: 0.62,
};

/**
 * Voice budget. Two separate pools so a burst of pickups can never starve the
 * world's standing ambience — a fountain does not go silent because the player
 * grabbed four coins.
 *
 * 10 + 12 panners is roughly 90 live nodes at worst, which measures clean on
 * an iPad 6th-gen. `low` is the quality-tier fallback.
 */
export const VOICE_BUDGET = { loops: 10, oneShots: 12, beds: 4 };
export const LOW_BUDGET = { loops: 5, oneShots: 6, beds: 3 };

/** Below this modelled gain an emitter is not worth a voice. */
export const CULL_GAIN = 0.035;

/**
 * Hysteresis. A voice that is ALREADY playing scores 35% higher than a silent
 * candidate at the same distance, so an emitter sitting exactly on the budget
 * boundary does not stutter on and off as the player sways. Cheap, and the
 * alternative (two thresholds) is harder to reason about.
 */
export const STICKY = 1.35;

/** How far from the waterline surf is still audible, in metres. */
export const SHORE_REACH = 55;

/** Indoors/in a level, the outdoor world is heard through a wall. */
export const INDOOR_DUCK = 0.16;

/**
 * ...except the beds that are ALREADY interior in character. A level built
 * inside the Canyon Library should keep its paper rustle; only the sky, the
 * surf and the birds get shut out by a roof.
 */
export const INTERIOR_KEEP = { rustle: 0.72, murmur: 0.5 };

/** Reverb send levels: outdoors is nearly dry, a cave is not. */
export const WET = { dry: 0.05, wet: 0.36 };

export const BED_IDS = ['wind', 'birds', 'surf', 'roar', 'chimes', 'rustle', 'murmur'];

/**
 * What each biome sounds like when you stand in it.
 *
 * These are TARGETS, not switches — update() eases the live gains toward them
 * with a ~2.5 s time constant, so walking the ridge between Sprout Garden and
 * Market Town is a slow dissolve from birdsong into market murmur rather than
 * a cut. That dissolve is most of the reason the island feels continuous.
 *
 * Keys are heightfield biome ids (see worldSpec.BIOMES), plus 'ocean' which
 * heightfield.biomeAt returns for anything below the waterline.
 */
export const BIOME_BEDS = {
  garden:   { birds: 1.00, wind: 0.42 },
  meadow:   { birds: 0.72, wind: 0.55 },
  tidepool: { surf: 1.00, wind: 0.34, birds: 0.18 },
  ocean:    { surf: 0.90, wind: 0.52 },
  sky:      { chimes: 0.92, wind: 0.85 },
  ember:    { roar: 0.90, wind: 0.24 },
  frost:    { wind: 0.92, chimes: 0.16 },
  crystal:  { chimes: 0.55, wind: 0.44 },
  market:   { murmur: 1.00, birds: 0.22, wind: 0.18 },
  library:  { rustle: 0.90, murmur: 0.16, wind: 0.30 },
  palace:   { chimes: 0.38, wind: 0.58, birds: 0.14 },
};

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent easing toward a target. `tau` is the time in seconds
 * to close ~63% of the gap, so the same crossfade takes the same wall-clock
 * time at 30 fps and at 120 fps.
 */
export function approach(current, target, dt, tau) {
  if (!(dt > 0)) return current;
  if (!(tau > 0)) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/**
 * WebAudio's `inverse` distance model, reimplemented exactly (including the
 * clamp of d into [ref, max] that the spec mandates). It has to be exact: this
 * is what the culler uses to decide whether an emitter is worth a voice, and
 * a culler that disagrees with the panner either wastes voices or silences
 * things the player can hear.
 */
export function distanceGain(d, opts = {}) {
  const { refDistance: ref, maxDistance: max, rolloffFactor: roll } = fieldFor(opts);
  const dd = Math.min(Math.max(d, ref), max);
  return ref / (ref + roll * (dd - ref));
}

/**
 * Sanitised distance parameters for one emitter.
 *
 * Shared by distanceGain() and by the PannerNode itself, and that sharing is
 * the point: a spec with refDistance 0 makes createPanner throw and makes the
 * gain formula return 0, so the culler would silently retire an emitter the
 * player is standing inside. One clamp, both consumers, no disagreement.
 */
export function fieldFor(spec = {}) {
  const ref = Math.max(0.5, Number.isFinite(spec.refDistance) ? spec.refDistance : FIELD.refDistance);
  const max = Math.max(ref + 1, Number.isFinite(spec.maxDistance) ? spec.maxDistance : FIELD.maxDistance);
  const roll = Math.max(0, Number.isFinite(spec.rolloffFactor) ? spec.rolloffFactor : FIELD.rolloffFactor);
  return { refDistance: ref, maxDistance: max, rolloffFactor: roll };
}

/** Rotate a vector by a quaternion {x,y,z,w}. Standard v + 2q×(q×v + wv). */
export function rotateByQuat(x, y, z, q) {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  // t = 2 * (q_vec × v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * The listener basis from a camera quaternion.
 *
 * three's cameras look down their own -Z with +Y up, and WebAudio wants those
 * two vectors in world space. Getting this wrong is the classic "everything is
 * mirrored" bug, and it is invisible in a screenshot — which is exactly why it
 * has a unit test with a known 90° yaw in it.
 */
export function listenerVectors(q) {
  const quat = q && typeof q.w === 'number' ? q : { x: 0, y: 0, z: 0, w: 1 };
  return {
    forward: rotateByQuat(0, 0, -1, quat),
    up: rotateByQuat(0, 1, 0, quat),
  };
}

/**
 * The bed mixer: where you are -> what you hear.
 *
 * @param {object} o
 *   biome      heightfield biome id under the player
 *   indoors    true inside a floor/level
 *   shoreDist  metres to the waterline (heightfield.shoreDistance)
 *   night      0 = noon, 1 = deep night
 *   wind       0..1 weather wind strength
 * @returns {Record<string, number>} target gain 0..1 for every bed id
 */
export function bedTargets({
  biome = 'garden', indoors = false, shoreDist = Infinity, night = 0, wind = 0,
} = {}) {
  const base = BIOME_BEDS[biome] || BIOME_BEDS.garden;
  const out = {};
  for (const id of BED_IDS) out[id] = clamp01(base[id] || 0);

  // Surf follows the actual WATERLINE, not the biome label. The tidepool is
  // where the beach is authored, but the island is an island: walk to any
  // coast and you should hear the sea. This is the one bed that is geometry
  // rather than theme.
  if (Number.isFinite(shoreDist)) {
    const near = Math.max(0, shoreDist);
    const s = 1 - smoothstep(8, SHORE_REACH, near);
    if (s > out.surf) out.surf = s * 0.92;
  }

  // Birds sleep; wind does not.
  out.birds *= 1 - 0.82 * clamp01(night);
  out.wind = clamp01(out.wind + 0.32 * clamp01(wind));

  if (indoors) {
    for (const id of BED_IDS) {
      out[id] *= INTERIOR_KEEP[id] ?? INDOOR_DUCK;
    }
  }
  return out;
}

/**
 * Which beds actually get nodes. Running all seven continuously is ~40 wasted
 * nodes; the cap is 4 rather than 3 so a crossfade always has room for the
 * outgoing bed while the two incoming ones arrive.
 */
export function topBeds(weights, cap = VOICE_BUDGET.beds) {
  return Object.keys(weights)
    .filter((id) => weights[id] > 0.001)
    .sort((a, b) => weights[b] - weights[a] || (a < b ? -1 : 1))
    .slice(0, Math.max(0, cap));
}

/**
 * Pick which emitters get to make noise this planning tick.
 *
 * Candidates score by modelled loudness (distance gain × volume × priority ×
 * the sticky bonus if already live). Keep the loudest `budget`, drop the rest.
 * Ties break OLDEST-FIRST into the drop list — that is the "recycle oldest"
 * rule, and it matters for one-shots, where fifty identical coin chimes at the
 * same distance should retire in the order they were fired.
 *
 * @param {Array<{id:*, gain:number, priority?:number, live?:boolean, age?:number}>} candidates
 * @returns {{keep:Array, drop:Array}} arrays of ids
 */
export function planVoices(candidates, budget = VOICE_BUDGET.loops) {
  const scored = candidates.map((c, i) => ({
    id: c.id,
    order: i,
    age: c.age ?? 0,
    score: (c.gain ?? 0) * (c.priority ?? 1) * (c.live ? STICKY : 1),
  }));
  scored.sort((a, b) => (b.score - a.score) || (a.age - b.age) || (a.order - b.order));
  const keep = [];
  const drop = [];
  for (const s of scored) {
    if (keep.length < budget && s.score >= CULL_GAIN) keep.push(s.id);
    else drop.push(s.id);
  }
  return { keep, drop };
}

/**
 * Which beds may hold a rig this frame — the LIVE cap, as opposed to topBeds()
 * which only picks the wanted set.
 *
 * The distinction bit us: with the cap applied to targets alone, walking
 * garden -> tidepool -> sky -> ember in a minute left birds, wind, surf,
 * chimes AND roar all holding node chains, because each departing bed needed
 * fifteen seconds to decay past the reclaim floor. The budget is a promise
 * about how many rigs exist, so it has to be enforced on the rigs.
 *
 * Wanted beds always win. Whatever slots are left go to the LOUDEST beds still
 * fading, so a crossfade completes naturally; anything past that is force-
 * retired (stopBed still ramps it down, so no click).
 */
export function resolveBeds(levels, wanted, cap = VOICE_BUDGET.beds) {
  const want = wanted instanceof Set ? wanted : new Set(wanted);
  const keep = new Set();
  for (const id of BED_IDS) if (want.has(id) && keep.size < cap) keep.add(id);
  const fading = BED_IDS
    .filter((id) => !want.has(id) && (levels[id] || 0) > 0)
    .sort((a, b) => (levels[b] || 0) - (levels[a] || 0) || (a < b ? -1 : 1));
  for (const id of fading) {
    if (keep.size >= cap) break;
    keep.add(id);
  }
  return keep;
}

/** Reverb send level for the current enclosure. 0 = open sky, 1 = cave. */
export function wetTarget({ indoors = false, enclosure = null } = {}) {
  const e = enclosure == null ? (indoors ? 1 : 0) : clamp01(enclosure);
  return WET.dry + (WET.wet - WET.dry) * e;
}

/** Names the runtime knows how to synthesise. Exported so tests can assert. */
export const LOOP_VOICES = ['hum', 'burble', 'waterfall', 'chime', 'crackle', 'bell'];
export const ONESHOT_VOICES = ['coin', 'chime', 'sparkle', 'splash', 'thud', 'step', 'whoosh', 'warp'];

/**
 * Reverb-lite feedback gain — the ONE feedback path in this module, a stereo
 * ping-pong ring (see buildReverb). Exported so audioStability.test.js can
 * assert it stays below the global stability bound (0.6). The old topology
 * was a cross-coupled delay pair whose worst-case loop gain (including the
 * damping lowpasses' default +1 dB resonant peaks) reached ~0.63; after the
 * harp runaway the rule is: no loop whose gain anyone has to *estimate*.
 */
export const REVERB_FB = 0.45;
/** Damping lowpass inside the loop. Q is in dB — held BELOW 0 so the filter
 *  can never add gain at any frequency inside the feedback ring. */
export const REVERB_DAMP_HZ = 2200;
export const REVERB_DAMP_Q_DB = -6;

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME  (touches WebAudio — only ever from inside createAudio3D)
// ═══════════════════════════════════════════════════════════════════════════

/** Listener/panner param smoothing, seconds. Short enough to track a run. */
const SMOOTH = 0.03;
/** Bed crossfade time constant. Slow on purpose: a biome edge is a dissolve. */
const BED_TAU = 2.6;
/**
 * Beds fade OUT faster than they fade in. Asymmetry is deliberate: an
 * exponential decay from full to inaudible at BED_TAU takes about fifteen
 * seconds, and during that whole window the departing bed is still holding a
 * rig. Walk a route that crosses four biomes in a minute and the "cap" is
 * quietly exceeded by every bed that has not finished dying yet. A shorter
 * out-tau keeps the overlap to one bed instead of four, and a departing bed
 * is by definition the one nobody is listening to.
 */
const BED_OUT_TAU = 1.1;
/** Below this a fading bed is inaudible and its rig is reclaimed. */
const BED_FLOOR = 0.006;
/** Reverb wet crossfade. Faster — a doorway is a threshold, not a gradient. */
const WET_TAU = 0.7;
/** Emitter re-planning rate. 12 Hz is imperceptible and costs nothing. */
const PLAN_DT = 1 / 12;
/** Loop voices fade rather than cut when culled. */
const CULL_FADE = 0.35;

/** Pentatonic on C — the chime/bell beds borrow the score's key. */
const PENTA = [523.25, 587.33, 698.46, 783.99, 1046.5, 1174.66];

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/**
 * Set a 3-component AudioParam triple, falling back to the deprecated
 * setPosition() on browsers that never shipped the param form. Safari only
 * grew AudioListener.positionX in 14.1 and the iPads we support predate that,
 * so the fallback is load-bearing, not defensive noise.
 */
function setP3(node, prefix, x, y, z, now) {
  const px = node[prefix + 'X'];
  if (px) {
    px.setTargetAtTime(x, now, SMOOTH);
    node[prefix + 'Y'].setTargetAtTime(y, now, SMOOTH);
    node[prefix + 'Z'].setTargetAtTime(z, now, SMOOTH);
    return true;
  }
  return false;
}

export function createAudio3D(opts = {}) {
  const {
    camera = null,
    heightfield = null,
    quality = 'high',
  } = opts;
  const budget = quality === 'low' ? LOW_BUDGET : (opts.budget || VOICE_BUDGET);

  // ── Lazily built graph ─────────────────────────────────────────────────
  let ctx = null;
  let ambientBus = null;   // beds        -> sfx
  let spatialBus = null;   // panners     -> sfx
  let sendSpatial = null;  // panners     -> reverb
  let sendAmbient = null;  // beds        -> reverb
  let listener = null;
  let noiseBuf = null;
  let disposed = false;
  let enabled = true;

  /** id -> { spec, obj, panner, voice, gain, live, startedAt, dist } */
  const emitters = new Map();
  /** live one-shots: { gain, endsAt, bornAt } */
  let shots = [];
  /** bed id -> { rig, gain, level, target } */
  const beds = new Map();
  const bedLevels = Object.create(null);
  for (const id of BED_IDS) bedLevels[id] = 0;

  let wet = WET.dry;
  let wetWant = WET.dry;
  let planAcc = PLAN_DT;      // plan on the very first update
  let clock = 0;              // seconds of update() time, for ages
  let lastBiome = 'garden';

  // ── Graph construction ─────────────────────────────────────────────────

  /**
   * Reverb-lite: a stereo PING-PONG delay — one ring, one feedback gain.
   *
   * A real ConvolverNode wants an impulse response, i.e. a FILE, and this game
   * has none. The ring is
   *
   *     in ── d1 ── d2 ── damp(lowpass, Q<0 dB) ── fb(REVERB_FB) ──▶ d1
   *           │      │
   *          panL   panR ──▶ wetOut
   *
   * ~90 ms round trip, taps spread hard left/right so the tail is WIDE. It is
   * not a concert hall; it is exactly enough to make a cave sound like a cave.
   *
   * STABILITY BY CONSTRUCTION: exactly one feedback gain (REVERB_FB = 0.45)
   * and the damping filter's Q is pinned below 0 dB, so the round-trip gain is
   * < 0.45 at every frequency — no cross-terms, nothing to estimate. The old
   * cross-coupled pair (fb 0.72 × 0.70 plus two default-Q resonant peaks) had
   * a worst case of ~0.63 and, like any feedback delay, would have latched a
   * NaN forever. The stability test pins REVERB_FB under the 0.6 bound.
   */
  function buildReverb(out) {
    const inGain = ctx.createGain();
    inGain.gain.value = 1;
    const d1 = ctx.createDelay(0.2); d1.delayTime.value = 0.0371;
    const d2 = ctx.createDelay(0.2); d2.delayTime.value = 0.0533;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = REVERB_DAMP_HZ;
    damp.Q.value = REVERB_DAMP_Q_DB;
    const fb = ctx.createGain(); fb.gain.value = REVERB_FB;
    inGain.connect(d1);
    d1.connect(d2);
    d2.connect(damp); damp.connect(fb); fb.connect(d1);
    const wetOut = ctx.createGain();
    wetOut.gain.value = 0.85;
    const p1 = makePanner2D(-0.65);
    const p2 = makePanner2D(0.65);
    d1.connect(p1); p1.connect(wetOut);
    d2.connect(p2); p2.connect(wetOut);
    wetOut.connect(out);
    return { inGain, nodes: [inGain, d1, d2, damp, fb, wetOut, p1, p2] };
  }

  /** StereoPanner where available; a plain gain passthrough where not. */
  function makePanner2D(pan) {
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      return p;
    }
    return ctx.createGain();
  }

  let reverb = null;

  /**
   * Build the graph the first time we are allowed to. Also catches up any
   * emitters attached BEFORE the context existed — attach() runs during world
   * build, which on iOS is long before the gesture that unlocks audio, so
   * "attached but pannerless" is the normal state for the first few seconds
   * of every session.
   */
  function ensureGraph() {
    if (ambientBus) return true;
    ctx = getCtx();
    const sfx = getSfxBus();
    listener = ctx.listener;

    ambientBus = ctx.createGain();
    ambientBus.gain.value = 1;
    ambientBus.connect(sfx);

    spatialBus = ctx.createGain();
    spatialBus.gain.value = 1;
    spatialBus.connect(sfx);

    reverb = buildReverb(sfx);
    sendSpatial = ctx.createGain();
    sendSpatial.gain.value = wet;
    spatialBus.connect(sendSpatial);
    sendSpatial.connect(reverb.inGain);
    // The beds go to the tail at half strength. A bed is already a diffuse
    // wash; drowning it in more wash just eats headroom.
    sendAmbient = ctx.createGain();
    sendAmbient.gain.value = wet * 0.45;
    ambientBus.connect(sendAmbient);
    sendAmbient.connect(reverb.inGain);

    // ~2.9 s of noise. Not a round number on purpose: a 1 s loop of white
    // noise has an audible 1 Hz "pulse" once your ear locks onto the seam,
    // and an odd length pushes that period below conscious notice.
    const len = Math.floor(ctx.sampleRate * 2.9);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Feather the seam so the loop point does not click.
    const fade = 512;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] *= k;
      d[len - 1 - i] *= k;
    }

    const now = ctx.currentTime;
    for (const rec of emitters.values()) {
      if (rec.panner) continue;
      rec.panner = makePanner(rec.spec);
      rec.panner.connect(spatialBus);
      const p = worldPos(rec.obj);
      if (p) placePanner(rec.panner, p.x, p.y, p.z, now);
    }
    return true;
  }

  /** True only when there is a running context we are allowed to build on. */
  function ready() {
    if (disposed || !enabled) return false;
    // NEVER getCtx() here — see the header. audioState() returns null until
    // something else has legitimately created the context inside a gesture.
    if (audioState() !== 'running') return false;
    return ensureGraph();
  }

  // ── Voice construction helpers ─────────────────────────────────────────

  function noise(at) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(at, Math.random() * 2.5);
    return s;
  }

  function filt(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  /** A slow oscillator wired into an AudioParam as an additive offset. */
  function lfo(rate, depth, param, at) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start(at);
    return [o, g];
  }

  /** Short percussive envelope on a gain, fire-and-forget. */
  function env(g, at, peak, attack, dur) {
    const p = Math.max(0.0001, peak);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(p, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }

  /** A struck-bell ping into `out`. Used by chimes, bells and sparkles. */
  function ping(out, at, freq, peak, dur = 1.6) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.28], [5.4, 0.09]]) {
      const g = ctx.createGain();
      env(g, at, peak * amp, 0.004, dur * (ratio === 1 ? 1 : 0.55));
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + dur + 0.1);
    }
  }

  /** A short filtered-noise burst — footsteps, page turns, sea hiss. */
  function burst(out, at, { freq = 1800, q = 1, peak = 0.1, dur = 0.12, type = 'bandpass', sweep = 0 }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = filt(type, freq, q);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), at + dur);
    const g = ctx.createGain();
    env(g, at, peak, 0.004, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(at, Math.random() * 2.5, dur + 0.08);
  }

  /**
   * A continuous layer: looping noise -> filter -> gain, with optional slow
   * modulation on the filter and the level. This is the workhorse behind every
   * bed and most loops; the character all comes from the filter settings.
   */
  function layer(out, at, {
    type = 'lowpass', freq = 500, q = 0.8, level = 0.1,
    fRate = 0, fDepth = 0, aRate = 0, aDepth = 0,
  }) {
    const s = noise(at);
    const f = filt(type, freq, q);
    const g = ctx.createGain();
    g.gain.value = level;
    s.connect(f); f.connect(g); g.connect(out);
    const nodes = [s, f, g];
    if (fRate) nodes.push(...lfo(fRate, fDepth, f.frequency, at));
    if (aRate) nodes.push(...lfo(aRate, aDepth, g.gain, at));
    return nodes;
  }

  // ── Ambient beds ───────────────────────────────────────────────────────
  //
  // Each maker returns { nodes, tick(now) }. `tick` is for beds with SPARSE
  // EVENTS (a chirp, a chime, a page turn) — continuous beds return no tick at
  // all and cost nothing per frame. Everything a maker creates lands in
  // `nodes`, which stopBed() walks on teardown; the one-shot events fired from
  // tick() are deliberately not tracked, because they end on their own and
  // they run through the bed's own gain, so a fading bed fades them with it.

  function makeBed(id, out) {
    const at = ctx.currentTime;
    const nodes = [];
    let next = at + rnd(0.2, 1.2);
    const add = (arr) => { nodes.push(...arr); };

    switch (id) {
      case 'wind':
        // Two bands: a body that breathes and a whisper of top end so it does
        // not read as a fridge hum.
        add(layer(out, at, { type: 'lowpass', freq: 420, q: 0.7, level: 0.13, fRate: 0.071, fDepth: 240, aRate: 0.049, aDepth: 0.06 }));
        add(layer(out, at, { type: 'bandpass', freq: 1650, q: 0.6, level: 0.022, aRate: 0.083, aDepth: 0.016 }));
        break;

      case 'birds':
        add(layer(out, at, { type: 'bandpass', freq: 3100, q: 0.9, level: 0.016, aRate: 0.13, aDepth: 0.008 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(1.1, 4.6);
            // A chirp is 2-4 blips with a rising glide. Random pan puts each
            // bird in a different bush, which is the whole trick: one bird
            // centred is a beep, four birds spread is a garden.
            const pan = makePanner2D(rnd(-0.85, 0.85));
            pan.connect(out);
            const f0 = rnd(1900, 3300);
            const n = 2 + ((Math.random() * 3) | 0);
            for (let i = 0; i < n; i++) {
              const t = now + 0.02 + i * rnd(0.055, 0.11);
              const g = ctx.createGain();
              env(g, t, 0.085, 0.006, 0.06);
              const o = ctx.createOscillator();
              o.type = 'sine';
              o.frequency.setValueAtTime(f0 * rnd(0.94, 1.06), t);
              o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.08, 1.4), t + 0.05);
              o.connect(g); g.connect(pan);
              o.start(t); o.stop(t + 0.09);
            }
          },
        };

      case 'surf':
        // Rumble + a wash that SWELLS. The swell LFO is the entire illusion:
        // constant filtered noise is a hiss, noise that rises and falls every
        // twelve seconds is the sea.
        add(layer(out, at, { type: 'lowpass', freq: 230, q: 0.6, level: 0.075, aRate: 0.081, aDepth: 0.03 }));
        add(layer(out, at, { type: 'bandpass', freq: 900, q: 0.5, level: 0.06, fRate: 0.062, fDepth: 380, aRate: 0.084, aDepth: 0.055 }));
        break;

      case 'roar': {
        // Ember Slopes. LOW and warm, never a monster: the brief is awe, not
        // horror, so this is the sound of a very large kettle in the next
        // valley, sitting almost entirely below 200 Hz.
        add(layer(out, at, { type: 'lowpass', freq: 150, q: 0.7, level: 0.135, aRate: 0.057, aDepth: 0.045 }));
        add(layer(out, at, { type: 'bandpass', freq: 320, q: 1.1, level: 0.028, aRate: 0.11, aDepth: 0.014 }));
        const g = ctx.createGain();
        g.gain.value = 0.05;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 52;
        o.connect(g); g.connect(out);
        o.start(at);
        nodes.push(o, g, ...lfo(0.13, 0.028, g.gain, at));
        break;
      }

      case 'chimes':
        add(layer(out, at, { type: 'highpass', freq: 1300, q: 0.5, level: 0.015, aRate: 0.09, aDepth: 0.009 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(2.2, 6.5);
            const pan = makePanner2D(rnd(-0.8, 0.8));
            pan.connect(out);
            const n = 1 + ((Math.random() * 3) | 0);
            for (let i = 0; i < n; i++) {
              ping(pan, now + i * rnd(0.12, 0.4), pick(PENTA), rnd(0.05, 0.1), rnd(1.6, 2.6));
            }
          },
        };

      case 'rustle':
        add(layer(out, at, { type: 'lowpass', freq: 380, q: 0.6, level: 0.028 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(0.9, 3.4);
            const pan = makePanner2D(rnd(-0.7, 0.7));
            pan.connect(out);
            // A page turn is a slow hiss that ends in a flick.
            burst(pan, now, { freq: 2300, q: 0.8, peak: 0.05, dur: rnd(0.16, 0.3), sweep: 0.55 });
            if (Math.random() < 0.55) burst(pan, now + rnd(0.18, 0.34), { freq: 4200, q: 1.4, peak: 0.035, dur: 0.05 });
          },
        };

      case 'murmur':
        // Market Town. Two bandpassed noise layers whose centre frequencies
        // wander through the vowel range, which the ear resolves as a crowd
        // heard from across a square. No words, no voices — just the shape.
        add(layer(out, at, { type: 'bandpass', freq: 520, q: 3.4, level: 0.05, fRate: 0.23, fDepth: 220, aRate: 0.31, aDepth: 0.022 }));
        add(layer(out, at, { type: 'bandpass', freq: 1400, q: 5.5, level: 0.018, fRate: 0.17, fDepth: 420, aRate: 0.27, aDepth: 0.01 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(3.5, 11);
            const pan = makePanner2D(rnd(-0.9, 0.9));
            pan.connect(out);
            // Rarely, a stall bell over the crowd. Sparse enough to be a
            // surprise and never a rhythm.
            if (Math.random() < 0.35) ping(pan, now, pick(PENTA), 0.05, 1.4);
            else burst(pan, now, { freq: rnd(450, 900), q: 4, peak: 0.05, dur: rnd(0.22, 0.45), sweep: 0.8 });
          },
        };

      default:
        break;
    }
    return { nodes, tick: null };
  }

  function startBed(id) {
    if (beds.has(id)) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const pan = makePanner2D(0);
    gain.connect(pan);
    pan.connect(ambientBus);
    const rig = makeBed(id, gain);
    beds.set(id, { gain, pan, rig, level: 0 });
  }

  function stopBed(id) {
    const b = beds.get(id);
    if (!b) return;
    beds.delete(id);
    const t = ctx.currentTime;
    b.gain.gain.cancelScheduledValues(t);
    b.gain.gain.setValueAtTime(Math.max(0.0001, b.gain.gain.value), t);
    b.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const kill = () => {
      for (const n of b.rig.nodes) {
        try { if (typeof n.stop === 'function') n.stop(); } catch { /* already stopped */ }
        try { n.disconnect(); } catch { /* gone */ }
      }
      try { b.gain.disconnect(); } catch { /* gone */ }
      try { b.pan.disconnect(); } catch { /* gone */ }
    };
    if (typeof setTimeout === 'function') setTimeout(kill, 700);
    else kill();
  }

  // ── Positional loop voices ─────────────────────────────────────────────

  function makeLoop(name, out) {
    const at = ctx.currentTime;
    const nodes = [];
    let next = at + rnd(0.05, 0.4);
    const add = (arr) => { nodes.push(...arr); };

    switch (name) {
      case 'burble':
        // A fountain: a soft water bed plus irregular "plips". The plips are
        // what make it read as a fountain rather than as static.
        add(layer(out, at, { type: 'bandpass', freq: 1150, q: 2.2, level: 0.09, fRate: 0.4, fDepth: 260, aRate: 0.9, aDepth: 0.025 }));
        add(layer(out, at, { type: 'lowpass', freq: 320, q: 0.7, level: 0.035 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(0.13, 0.44);
            const t = now + 0.01;
            const g = ctx.createGain();
            env(g, t, rnd(0.05, 0.11), 0.003, rnd(0.05, 0.1));
            const o = ctx.createOscillator();
            o.type = 'sine';
            const f = rnd(620, 1500);
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * rnd(1.3, 2.1), t + 0.05);
            o.connect(g); g.connect(out);
            o.start(t); o.stop(t + 0.14);
          },
        };

      case 'waterfall':
        add(layer(out, at, { type: 'lowpass', freq: 780, q: 0.7, level: 0.2, fRate: 0.11, fDepth: 300, aRate: 0.07, aDepth: 0.04 }));
        add(layer(out, at, { type: 'bandpass', freq: 2600, q: 0.6, level: 0.06, aRate: 0.13, aDepth: 0.02 }));
        add(layer(out, at, { type: 'lowpass', freq: 130, q: 0.8, level: 0.07 }));
        break;

      case 'chime':
        // Collectibles. Almost nothing until you are close, and then a single
        // pentatonic ping every couple of seconds — a lure, not a loop.
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(1.7, 3.8);
            ping(out, now + 0.01, pick(PENTA), 0.07, rnd(1.2, 2.0));
          },
        };

      case 'crackle': {
        add(layer(out, at, { type: 'lowpass', freq: 210, q: 0.7, level: 0.05, aRate: 0.19, aDepth: 0.02 }));
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(0.05, 0.34);
            burst(out, now + 0.005, { type: 'highpass', freq: rnd(2400, 5200), q: 0.8, peak: rnd(0.02, 0.06), dur: 0.03 });
          },
        };
      }

      case 'bell':
        return {
          nodes,
          tick(now) {
            if (now < next) return;
            next = now + rnd(6, 15);
            ping(out, now + 0.01, pick(PENTA) * 0.5, 0.08, 2.6);
          },
        };

      case 'hum':
      default: {
        // Portal arch. A friendly open fifth with a shimmer on top — the same
        // interval the score uses for its "something good is here" cue, so the
        // arch sounds like it belongs to the music rather than to the machine.
        let root = null;
        for (const [f, lvl, type] of [[98, 0.055, 'triangle'], [147, 0.032, 'triangle'], [392, 0.011, 'sine']]) {
          const g = ctx.createGain();
          g.gain.value = lvl;
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          o.detune.value = rnd(-6, 6);
          o.connect(g); g.connect(out);
          o.start(at);
          nodes.push(o, g);
          if (!root) root = g;
        }
        nodes.push(...lfo(0.29, 0.018, root.gain, at));
        break;
      }
    }
    return { nodes, tick: null };
  }

  // ── One-shots ──────────────────────────────────────────────────────────

  /** @returns {number} the voice's duration in seconds. */
  function fireOneShot(name, out, vel) {
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'coin': {
        for (const [i, f] of [523.25, 880].entries()) {
          const g = ctx.createGain();
          env(g, t + i * 0.06, 0.28 * vel, 0.003, 0.22);
          const o = ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = f;
          o.connect(g); g.connect(out);
          o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.3);
        }
        return 0.4;
      }
      case 'chime':
        ping(out, t, pick(PENTA), 0.3 * vel, 1.6);
        return 1.8;
      case 'sparkle': {
        for (let i = 0; i < 3; i++) ping(out, t + i * 0.055, PENTA[i + 1], 0.16 * vel, 0.7);
        return 0.9;
      }
      case 'splash':
        burst(out, t, { freq: 1900, q: 0.7, peak: 0.3 * vel, dur: 0.42, sweep: 0.22 });
        return 0.5;
      case 'thud': {
        const g = ctx.createGain();
        env(g, t, 0.4 * vel, 0.003, 0.16);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.13);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.2);
        burst(out, t, { type: 'lowpass', freq: 420, peak: 0.16 * vel, dur: 0.09 });
        return 0.3;
      }
      case 'step':
        burst(out, t, { freq: rnd(700, 1200), q: 1.2, peak: 0.14 * vel, dur: 0.05, sweep: 0.6 });
        return 0.1;
      case 'whoosh':
        burst(out, t, { freq: 500, q: 0.8, peak: 0.2 * vel, dur: 0.34, sweep: 3.2 });
        return 0.4;
      case 'warp':
      default: {
        for (const det of [0, 7]) {
          const g = ctx.createGain();
          env(g, t, 0.16 * vel, 0.02, 0.62);
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.detune.value = det;
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(880, t + 0.55);
          o.connect(g); g.connect(out);
          o.start(t); o.stop(t + 0.7);
        }
        return 0.8;
      }
    }
  }

  // ── Panner plumbing ────────────────────────────────────────────────────

  function makePanner(spec) {
    const p = ctx.createPanner();
    p.distanceModel = FIELD.distanceModel;
    p.panningModel = FIELD.panningModel;
    const f = fieldFor(spec);
    p.refDistance = f.refDistance;
    p.maxDistance = f.maxDistance;
    p.rolloffFactor = f.rolloffFactor;
    return p;
  }

  function placePanner(p, x, y, z, now) {
    if (!setP3(p, 'position', x, y, z, now) && typeof p.setPosition === 'function') {
      p.setPosition(x, y, z);
    }
  }

  /** World position of an attach target: Object3D, Vector3, or {x,y,z}. */
  const _wp = { x: 0, y: 0, z: 0 };
  function worldPos(obj) {
    if (!obj) return null;
    const mw = obj.matrixWorld;
    if (mw && mw.elements) {
      const e = mw.elements;
      _wp.x = e[12]; _wp.y = e[13]; _wp.z = e[14];
      return _wp;
    }
    if (obj.position && typeof obj.position.x === 'number') {
      _wp.x = obj.position.x; _wp.y = obj.position.y; _wp.z = obj.position.z;
      return _wp;
    }
    if (typeof obj.x === 'number') {
      _wp.x = obj.x; _wp.y = obj.y ?? 0; _wp.z = obj.z ?? 0;
      return _wp;
    }
    return null;
  }

  function startVoice(rec) {
    if (!rec || rec.voice) return;
    if (!rec.panner) {
      rec.panner = makePanner(rec.spec);
      rec.panner.connect(spatialBus);
      const p0 = worldPos(rec.obj);
      if (p0) placePanner(rec.panner, p0.x, p0.y, p0.z, ctx.currentTime);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, rec.spec.volume ?? 1), ctx.currentTime + 0.4);
    g.connect(rec.panner);
    rec.voice = makeLoop(rec.spec.sound, g);
    rec.voiceGain = g;
    rec.startedAt = clock;
  }

  function stopVoice(rec) {
    if (!rec) return;
    const v = rec.voice;
    if (!v) return;
    rec.voice = null;
    const g = rec.voiceGain;
    rec.voiceGain = null;
    const t = ctx.currentTime;
    if (g) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CULL_FADE);
    }
    const kill = () => {
      for (const n of v.nodes) {
        try { if (typeof n.stop === 'function') n.stop(); } catch { /* already */ }
        try { n.disconnect(); } catch { /* gone */ }
      }
      try { g && g.disconnect(); } catch { /* gone */ }
    };
    if (typeof setTimeout === 'function') setTimeout(kill, CULL_FADE * 1000 + 60);
    else kill();
  }

  // ── The frame ──────────────────────────────────────────────────────────

  const _lp = { x: 0, y: 0, z: 0 };

  /**
   * @param {{x:number,y:number,z:number}} [cameraPos] defaults to the camera
   *   handed to createAudio3D
   * @param {{x:number,y:number,z:number,w:number}} [cameraQuat]
   * @param {object} [frame]
   *   dt         seconds since the last update (defaults to 1/60)
   *   playerPos  where the BIOME is sampled — the hero, not the eye. A boom
   *              hanging 10 m behind can easily sit over the sea while the
   *              player is on the beach, and the beds should follow the feet.
   *   indoors    true inside a level/floor
   *   enclosure  0..1 override for the reverb (a cave mouth is 0.6)
   *   biome      override; otherwise sampled from the heightfield
   *   night      0..1
   *   wind       0..1 weather wind
   */
  function update(cameraPos, cameraQuat, frame = {}) {
    const dt = Number.isFinite(frame.dt) ? frame.dt : 1 / 60;
    clock += dt;
    if (!ready()) return;

    const pos = cameraPos || (camera && camera.position);
    const quat = cameraQuat || (camera && camera.quaternion);
    if (!pos) return;
    const now = ctx.currentTime;

    // ── 1. Listener rides the camera ────────────────────────────────────
    _lp.x = pos.x; _lp.y = pos.y; _lp.z = pos.z;
    if (!setP3(listener, 'position', pos.x, pos.y, pos.z, now)
      && typeof listener.setPosition === 'function') {
      listener.setPosition(pos.x, pos.y, pos.z);
    }
    const { forward, up } = listenerVectors(quat || { x: 0, y: 0, z: 0, w: 1 });
    if (listener.forwardX) {
      listener.forwardX.setTargetAtTime(forward[0], now, SMOOTH);
      listener.forwardY.setTargetAtTime(forward[1], now, SMOOTH);
      listener.forwardZ.setTargetAtTime(forward[2], now, SMOOTH);
      listener.upX.setTargetAtTime(up[0], now, SMOOTH);
      listener.upY.setTargetAtTime(up[1], now, SMOOTH);
      listener.upZ.setTargetAtTime(up[2], now, SMOOTH);
    } else if (typeof listener.setOrientation === 'function') {
      listener.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
    }

    // ── 2. Beds ─────────────────────────────────────────────────────────
    const feet = frame.playerPos || pos;
    let biome = frame.biome;
    let shoreDist = frame.shoreDist;
    if (heightfield) {
      if (!biome) biome = heightfield.biomeAt(feet.x, feet.z);
      if (shoreDist == null) shoreDist = heightfield.shoreDistance(feet.x, feet.z);
    }
    lastBiome = biome || lastBiome;
    const targets = bedTargets({
      biome: lastBiome,
      indoors: !!frame.indoors,
      shoreDist: shoreDist == null ? Infinity : shoreDist,
      night: frame.night || 0,
      wind: frame.wind || 0,
    });
    // One slot of the bed budget is reserved for the bed on its way OUT, so a
    // biome boundary always has room to dissolve rather than cut.
    const wanted = new Set(topBeds(targets, Math.max(1, budget.beds - 1)));
    const allowed = resolveBeds(bedLevels, wanted, budget.beds);
    for (const id of BED_IDS) {
      const want = wanted.has(id);
      const target = want ? targets[id] : 0;
      const tau = target > bedLevels[id] ? BED_TAU : BED_OUT_TAU;
      bedLevels[id] = approach(bedLevels[id], target, dt, tau);
      if (!want && (bedLevels[id] < BED_FLOOR || !allowed.has(id))) bedLevels[id] = 0;
      const live = beds.get(id);
      if (bedLevels[id] > 0) {
        if (!live) startBed(id);
        const b = beds.get(id);
        b.gain.gain.setTargetAtTime(Math.max(0.0001, bedLevels[id]), now, 0.12);
        if (b.rig.tick) b.rig.tick(now);
      } else if (live) {
        stopBed(id);
      }
    }

    // ── 3. Reverb-lite wet level ────────────────────────────────────────
    wetWant = wetTarget({ indoors: !!frame.indoors, enclosure: frame.enclosure });
    wet = approach(wet, wetWant, dt, WET_TAU);
    sendSpatial.gain.setTargetAtTime(wet, now, 0.15);
    sendAmbient.gain.setTargetAtTime(wet * 0.45, now, 0.15);

    // ── 4. Emitters: re-plan at 12 Hz, move + tick every frame ──────────
    planAcc += dt;
    const replan = planAcc >= PLAN_DT;
    if (replan) planAcc = 0;

    if (replan && emitters.size) {
      const candidates = [];
      for (const [id, rec] of emitters) {
        const p = worldPos(rec.obj);
        if (!p) { candidates.push({ id, gain: 0, live: !!rec.voice, age: clock - rec.startedAt }); continue; }
        rec.x = p.x; rec.y = p.y; rec.z = p.z;
        const dx = p.x - _lp.x, dy = p.y - _lp.y, dz = p.z - _lp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        rec.dist = d;
        candidates.push({
          id,
          gain: distanceGain(d, rec.spec) * (rec.spec.volume ?? 1),
          priority: rec.spec.priority ?? 1,
          live: !!rec.voice,
          age: clock - (rec.startedAt || 0),
        });
      }
      const { keep, drop } = planVoices(candidates, budget.loops);
      for (const id of keep) startVoice(emitters.get(id));
      for (const id of drop) stopVoice(emitters.get(id));
    }

    for (const rec of emitters.values()) {
      if (!rec.voice) continue;
      const p = worldPos(rec.obj);
      if (p) placePanner(rec.panner, p.x, p.y, p.z, now);
      if (rec.voice.tick) rec.voice.tick(now);
    }

    // Retire finished one-shots so the pool frees up.
    if (shots.length) shots = shots.filter((s) => s.endsAt > now);
  }

  // ── Public surface ─────────────────────────────────────────────────────

  /**
   * Fire a positional one-shot.
   * @param {object} spec  { sound, x, y, z, obj3d?, volume?, refDistance?, ... }
   * @returns {boolean} true if a voice was actually spent
   */
  function emit(spec = {}) {
    if (!ready()) return false;
    const now = ctx.currentTime;
    shots = shots.filter((s) => s.endsAt > now);
    // At budget: steal the OLDEST still-ringing shot. A five-year-old mashing
    // pickups should hear the newest chime, not be told the mixer is full.
    if (shots.length >= budget.oneShots) {
      let oldest = 0;
      for (let i = 1; i < shots.length; i++) if (shots[i].bornAt < shots[oldest].bornAt) oldest = i;
      const s = shots[oldest];
      try {
        s.gain.gain.cancelScheduledValues(now);
        s.gain.gain.setValueAtTime(Math.max(0.0001, s.gain.gain.value), now);
        s.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      } catch { /* already retired */ }
      shots.splice(oldest, 1);
    }

    let x = spec.x ?? 0, y = spec.y ?? 0, z = spec.z ?? 0;
    if (spec.obj3d) {
      const p = worldPos(spec.obj3d);
      if (p) { x = p.x; y = p.y; z = p.z; }
    }
    const panner = makePanner(spec);
    placePanner(panner, x, y, z, now);
    panner.connect(spatialBus);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(panner);
    const dur = fireOneShot(spec.sound || 'chime', g, spec.volume ?? 1);
    const rec = { gain: g, panner, bornAt: now, endsAt: now + dur + 0.2 };
    shots.push(rec);
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        try { g.disconnect(); } catch { /* gone */ }
        try { panner.disconnect(); } catch { /* gone */ }
      }, (dur + 0.4) * 1000);
    }
    return true;
  }

  /**
   * Attach a looping emitter to a 3D object (or any {x,y,z}).
   * Idempotent per id — attaching twice replaces the spec, so a scene that
   * rebuilds its props does not stack voices.
   */
  function attach(id, obj3d, loopSpec = {}) {
    if (disposed || id == null) return;
    const existing = emitters.get(id);
    if (existing) {
      existing.obj = obj3d || existing.obj;
      existing.spec = { sound: 'hum', ...loopSpec };
      return;
    }
    emitters.set(id, {
      id,
      obj: obj3d,
      spec: { sound: 'hum', volume: 1, ...loopSpec },
      panner: null,
      voice: null,
      voiceGain: null,
      startedAt: 0,
      dist: Infinity,
    });
    // The panner is built lazily with the graph — attach() is called during
    // world build, long before any gesture has unlocked the context.
    if (ready()) {
      const rec = emitters.get(id);
      rec.panner = makePanner(rec.spec);
      rec.panner.connect(spatialBus);
      const p = worldPos(rec.obj);
      if (p) placePanner(rec.panner, p.x, p.y, p.z, ctx.currentTime);
    }
  }

  function detach(id) {
    const rec = emitters.get(id);
    if (!rec) return;
    stopVoice(rec);
    emitters.delete(id);
    if (rec.panner) {
      const p = rec.panner;
      if (typeof setTimeout === 'function') setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, 500);
      else { try { p.disconnect(); } catch { /* gone */ } }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of [...emitters.keys()]) detach(id);
    for (const id of [...beds.keys()]) stopBed(id);
    shots = [];
    const drop = (n) => { try { n && n.disconnect(); } catch { /* gone */ } };
    if (reverb) reverb.nodes.forEach(drop);
    drop(sendSpatial); drop(sendAmbient); drop(ambientBus); drop(spatialBus);
    ambientBus = spatialBus = sendSpatial = sendAmbient = reverb = null;
    noiseBuf = null;
    // The AudioContext is NOT ours to close. audioGraph.js owns it and the
    // score is very probably still playing through it.
  }

  return {
    update,
    emit,
    attach,
    detach,
    dispose,
    /** Master switch — a Settings "no ambience" toggle, or a low-power tier. */
    setEnabled(on) {
      enabled = !!on;
      if (!enabled) {
        for (const rec of emitters.values()) stopVoice(rec);
        for (const id of [...beds.keys()]) stopBed(id);
        for (const id of BED_IDS) bedLevels[id] = 0;
      }
    },
    /** Live numbers for the debug HUD and the e2e harness. */
    stats() {
      let live = 0;
      for (const rec of emitters.values()) if (rec.voice) live++;
      return {
        ready: !disposed && audioState() === 'running' && !!ambientBus,
        biome: lastBiome,
        beds: [...beds.keys()],
        bedLevels: { ...bedLevels },
        attached: emitters.size,
        loops: live,
        oneShots: shots.length,
        wet: Math.round(wet * 1000) / 1000,
        budget,
      };
    },
  };
}
