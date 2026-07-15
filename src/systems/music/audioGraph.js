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
let _music = null;
let _sfx = null;
let _muted = false;
let _musicVol = 0.8;
let _sfxVol = 1.0;

const RAMP = 0.08; // seconds — short enough to feel instant, no click

export function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

function ensureGraph() {
  const ctx = getCtx();
  if (_master) return;
  _master = ctx.createGain();
  _master.gain.value = _muted ? 0 : 0.9;
  _master.connect(ctx.destination);
  _music = ctx.createGain();
  _music.gain.value = _musicVol;
  _music.connect(_master);
  _sfx = ctx.createGain();
  _sfx.gain.value = _sfxVol;
  _sfx.connect(_master);
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
