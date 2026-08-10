/**
 * The game's single Web Audio graph.
 *
 * Everything audible flows through here:
 *
 *            ┌─ musicBus ─┐
 *   voices ──┤            ├── masterGain ── ctx.destination
 *            └─ sfxBus  ──┘
 *
 * v1 connected every oscillator straight to ctx.destination, which is
 * why the Settings volume sliders did nothing except at zero. The
 * buses give the sliders a real sink and give the music director one
 * place to duck the score under stingers.
 *
 * All gain changes ramp briefly instead of stepping — instant jumps
 * click audibly on cheap speakers.
 */

let _ctx = null;
let _master = null;
let _safety = null;
let _limiter = null;
let _music = null;
let _sfx = null;
let _muted = false;
let _musicVol = 0.8;
let _sfxVol = 1.0;

const RAMP = 0.08; // seconds — short enough to feel instant, no click

/**
 * STABILITY BOUND for every feedback path in the whole game.
 *
 * A delay/reverb loop with gain g decays by 20*log10(g) dB per round trip;
 * at 0.6 that is -4.4 dB per pass — a musical tail that provably dies. The
 * harp incident (loop gain 1.06 -> exponential growth -> Inf -> NaN latched
 * into the mix bus) is why this is a named constant with a test on it
 * (audioStability.test.js) instead of a code-review convention. Any feedback
 * gain anywhere must be <= this, INCLUDING cross-terms and filter resonance
 * peaking inside the loop (set lowpass Q in dB below 0 inside loops).
 */
export const MAX_FEEDBACK = 0.6;

/**
 * MASTER SAFETY WATCHDOG.
 *
 * Last line of defence: an analyser taps the limiter output (exactly what
 * reaches the speakers) twice a second. Two tripwires:
 *   - non-finite samples: the mix is mathematically dead (the old NaN latch).
 *   - RMS above RMS_LIMIT sustained for more than HOLD_MS: this game's mix
 *     idles near -40 dB and even a boss-fanfare pile-up rides the -6 dB
 *     limiter only transiently, so seconds of sustained hot RMS has no
 *     gameplay cause — it is a runaway voice by definition.
 * Either way: log loudly and duck a dedicated safety gain (between master and
 * limiter), then release. A bug becomes "briefly quiet", never "a machine
 * scream held against a child's ear".
 */
const WATCHDOG = {
  INTERVAL_MS: 500,
  RMS_LIMIT: 0.2,     // ~-14 dBFS at the speakers, sustained = wrong
  HOLD_MS: 2000,
  DUCK_TO: 0.12,
  DUCK_SEC: 0.25,
  HOLD_DUCK_SEC: 4,
  RELEASE_SEC: 1.5,
};
let _watch = null;

function watchdogDuck(reason, rms) {
  _watch.ducks += 1;
  _watch.lastReason = reason;
  _watch.overSince = null;
  // eslint-disable-next-line no-console
  console.warn(`[audio-watchdog] ${reason} (rms=${Number.isFinite(rms) ? rms.toFixed(3) : 'non-finite'}) — ducking master for ${WATCHDOG.HOLD_DUCK_SEC}s`);
  try {
    const t = _ctx.currentTime;
    const g = _safety.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(WATCHDOG.DUCK_TO, t + WATCHDOG.DUCK_SEC);
    g.setValueAtTime(WATCHDOG.DUCK_TO, t + WATCHDOG.HOLD_DUCK_SEC);
    g.linearRampToValueAtTime(1, t + WATCHDOG.HOLD_DUCK_SEC + WATCHDOG.RELEASE_SEC);
    _watch.duckedUntil = Date.now() + (WATCHDOG.HOLD_DUCK_SEC + WATCHDOG.RELEASE_SEC) * 1000;
  } catch { /* context gone */ }
}

function watchdogTick() {
  if (!_watch || !_ctx || _ctx.state !== 'running') return;
  const { analyser, buf } = _watch;
  try { analyser.getFloatTimeDomainData(buf); } catch { return; }
  let sum = 0;
  let nonFinite = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    if (!Number.isFinite(v)) { nonFinite++; continue; }
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, buf.length - nonFinite));
  _watch.lastRms = rms;
  const now = Date.now();
  if (nonFinite > 0) {
    _watch.nonFinite += nonFinite;
    if (now >= _watch.duckedUntil) watchdogDuck('non-finite samples on master bus', NaN);
    return;
  }
  if (rms > WATCHDOG.RMS_LIMIT) {
    if (_watch.overSince == null) _watch.overSince = now;
    else if (now - _watch.overSince > WATCHDOG.HOLD_MS && now >= _watch.duckedUntil) {
      watchdogDuck('master RMS sustained above threshold with no gameplay cause', rms);
    }
  } else {
    _watch.overSince = null;
  }
}

function startWatchdog(ctx) {
  if (_watch || typeof setInterval !== 'function') return;
  let analyser;
  try {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    if (typeof analyser.getFloatTimeDomainData !== 'function') return;
    _limiter.connect(analyser); // tap only — the analyser outputs nowhere
  } catch { return; }
  _watch = {
    analyser,
    buf: new Float32Array(analyser.fftSize),
    overSince: null,
    duckedUntil: 0,
    ducks: 0,
    nonFinite: 0,
    lastRms: 0,
    lastReason: null,
    timer: setInterval(watchdogTick, WATCHDOG.INTERVAL_MS),
  };
}

/** Watchdog counters for the debug HUD / e2e probes. Null before the graph. */
export function watchdogStats() {
  if (!_watch) return null;
  const { ducks, nonFinite, lastRms, lastReason } = _watch;
  return { ducks, nonFinite, lastRms, lastReason };
}

export function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

function ensureGraph() {
  const ctx = getCtx();
  if (_master) return;
  // Brick-wall limiter on the very last stage before the speakers. The
  // procedural voices are fire-and-forget and can briefly pile up — a chord
  // plus its FX-delay tail, a stinger ducking over the score, or (the nasty
  // one) a batch of notes that all land on the same instant when the iOS
  // AudioContext resumes after being suspended. Summed, those peaks used to
  // exceed ±1 and Web Audio HARD-CLIPS them into a digital screech. A
  // compressor with a high ratio and low threshold catches the peaks so the
  // worst case is "briefly loud," never "screeching." Transparent at normal
  // levels (nothing reaches the threshold until voices stack).
  _limiter = ctx.createDynamicsCompressor();
  _limiter.threshold.value = -6;   // dB — start reining in before 0 dBFS
  _limiter.knee.value = 0;         // hard knee = true limiting, no soft bend
  _limiter.ratio.value = 20;       // ≈ brick wall
  _limiter.attack.value = 0.003;   // catch transients fast
  _limiter.release.value = 0.25;
  _limiter.connect(ctx.destination);
  // The watchdog's duck stage. Separate from _master so Settings volume,
  // mute and the safety duck can never fight over one AudioParam.
  _safety = ctx.createGain();
  _safety.gain.value = 1;
  _safety.connect(_limiter);
  _master = ctx.createGain();
  _master.gain.value = _muted ? 0 : 0.9;
  _master.connect(_safety);
  _music = ctx.createGain();
  _music.gain.value = _musicVol;
  _music.connect(_master);
  _sfx = ctx.createGain();
  _sfx.gain.value = _sfxVol;
  _sfx.connect(_master);
  startWatchdog(ctx);
}

export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx.state;
}

/**
 * iOS/iPadOS unlock. Safari starts the AudioContext SUSPENDED and only
 * lets it run if resume() is called synchronously inside a real user
 * gesture. Playing a 1-frame silent buffer in the same gesture fully
 * "primes" the context on iOS. Safe to call repeatedly. Returns true
 * once the context is actually running.
 *
 * Must be invoked from a NATIVE DOM gesture handler (touchend/pointerdown/
 * click) — NOT from a Phaser input callback, which fires later in the
 * requestAnimationFrame game loop and no longer counts as a user gesture.
 */
export function primeAudio() {
  const ctx = getCtx();
  ensureGraph();
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) { /* ignore */ }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
  return ctx.state === 'running';
}

/** Current AudioContext state, or null if not yet created. */
export function audioState() { return _ctx ? _ctx.state : null; }

export function getMasterBus() { ensureGraph(); return _master; }
export function getMusicBus() { ensureGraph(); return _music; }
export function getSfxBus() { ensureGraph(); return _sfx; }

function rampTo(node, value) {
  const now = getCtx().currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(value, now + RAMP);
}

export function setMusicVolume(v) {
  _musicVol = Math.max(0, Math.min(1, v));
  if (_music) rampTo(_music, _musicVol);
}

export function setSfxVolume(v) {
  _sfxVol = Math.max(0, Math.min(1, v));
  if (_sfx) rampTo(_sfx, _sfxVol);
}

export function setMuted(muted) {
  _muted = !!muted;
  if (_master) rampTo(_master, _muted ? 0 : 0.9);
}

export function isMuted() { return _muted; }
