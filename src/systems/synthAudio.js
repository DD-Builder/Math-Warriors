/**
 * Procedural sound effects and ambient music using Web Audio API.
 *
 * Generates synthesized SFX so the game has audio feedback without
 * external MP3 files. Each sound is a short oscillator + gain envelope.
 *
 * Also provides simple ambient drone music via playMusic/stopMusic.
 */

// ------------------------------------------------------------------
// CORE HELPERS
// ------------------------------------------------------------------

let _ctx = null;
function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

function playTone(freq, dur, type, vol, endFreq) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + dur);
  gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}

function playNoise(dur, vol) {
  const ctx = getCtx();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(gain); gain.connect(ctx.destination);
  src.start();
}

// ------------------------------------------------------------------
// SFX REGISTRY
// ------------------------------------------------------------------

const SYNTH_SOUNDS = {
  // UI
  'ui/click': () => playTone(800, 0.05, 'sine', 0.3),
  'ui/confirm': () => { playTone(600, 0.1, 'sine', 0.35); setTimeout(() => playTone(900, 0.1, 'sine', 0.35), 80); },
  'ui/back': () => playTone(400, 0.08, 'sine', 0.25, 300),

  // Battle feedback
  'battle/correct': () => { playTone(523, 0.08, 'sine', 0.35); setTimeout(() => playTone(659, 0.08, 'sine', 0.35), 80); },
  'battle/wrong': () => { playTone(330, 0.1, 'sawtooth', 0.15); setTimeout(() => playTone(262, 0.1, 'sawtooth', 0.15), 100); },
  'battle/hit': () => { playNoise(0.05, 0.4); playTone(200 + Math.random() * 200, 0.05, 'sine', 0.2, 100); },
  'battle/hit_hero': () => { playNoise(0.08, 0.3); playTone(250, 0.1, 'sine', 0.15, 150); },
  'battle/hit-hero': () => { playNoise(0.08, 0.3); playTone(250, 0.1, 'sine', 0.15, 150); },
  'battle/hit-enemy': () => { playNoise(0.06, 0.4); playTone(300, 0.08, 'sine', 0.2, 100); },
  'battle/heal': () => { playTone(800, 0.15, 'sine', 0.25, 1200); setTimeout(() => playTone(1000, 0.12, 'sine', 0.2, 1400), 100); },
  'battle/victory': () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.35), i*100)); },
  'battle/defeat': () => { [400,350,300,250].forEach((f,i) => setTimeout(() => playTone(f, 0.3, 'triangle', 0.25), i*150)); },
  'battle/level_up': () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.3), i*100)); },
  'battle/level-up': () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.3), i*100)); },

  // World interactions
  'world/chest': () => { playNoise(0.04, 0.2); setTimeout(() => { playTone(600, 0.1, 'sine', 0.3); setTimeout(() => playTone(800, 0.1, 'sine', 0.3), 80); }, 50); },
  'world/gold': () => playTone(1200, 0.06, 'sine', 0.25),
  'world/encounter': () => { playTone(200, 0.25, 'sawtooth', 0.2, 100); playNoise(0.1, 0.15); },
  'world/floor-complete': () => { [523,659,784,1047,1319].forEach((f,i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.35), i*100)); },

  // Legacy
  'world/fairy': () => {
    [880, 1100, 1320, 1100, 880].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.1, 'sine', 0.15), i * 60));
  },
};

/** Backward-compatible alias used by audio.js */
export const SYNTH_SFX = SYNTH_SOUNDS;

export function playSynth(key) {
  try { const fn = SYNTH_SOUNDS[key]; if (fn) fn(); } catch (e) { /* ignore audio errors */ }
}

// ------------------------------------------------------------------
// BACKGROUND MUSIC (ambient drones)
// ------------------------------------------------------------------

const MUSIC_DEFS = {
  // Garden / menu — gentle 220Hz + 330Hz sine at 0.03
  'music/title': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  'music/map': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  // Floor 1 — Garden
  'music/floor-1': {
    layers: [
      { freq: 220, type: 'sine', volume: 0.03 },
      { freq: 330, type: 'sine', volume: 0.03 },
    ],
  },
  // Battle — 165Hz triangle at 0.04 with slow tremolo
  'music/battle': {
    layers: [
      { freq: 165, type: 'triangle', volume: 0.04 },
    ],
    tremolo: 2,
  },
  'music/boss': {
    layers: [
      { freq: 165, type: 'triangle', volume: 0.04 },
    ],
    tremolo: 3,
  },
  // Floor 2 — Tidepool: 180Hz sine at 0.03
  'music/floor-2': {
    layers: [
      { freq: 180, type: 'sine', volume: 0.03 },
    ],
  },
  // Floor 3 — Cloud: 260Hz sine at 0.02
  'music/floor-3': {
    layers: [
      { freq: 260, type: 'sine', volume: 0.02 },
    ],
  },
  // Floor 4 — Ember: 110Hz sawtooth at 0.03
  'music/floor-4': {
    layers: [
      { freq: 110, type: 'sawtooth', volume: 0.03 },
    ],
  },
  // Floor 5 — Arcane: 200Hz + 300Hz sine at 0.02
  'music/floor-5': {
    layers: [
      { freq: 200, type: 'sine', volume: 0.02 },
      { freq: 300, type: 'sine', volume: 0.02 },
    ],
  },
};

let _musicNodes = null;
let _currentMusicKey = null;

/**
 * Start looping ambient music. If the same key is already playing,
 * do nothing. Stops any currently playing music first.
 */
export function playSynthMusic(key) {
  if (key === _currentMusicKey && _musicNodes) return;
  stopSynthMusic();

  const def = MUSIC_DEFS[key];
  if (!def) {
    _currentMusicKey = key;
    return;
  }

  const ctx = getCtx();
  if (!ctx) return;

  const oscillators = [];
  const gains = [];
  let lfo = null;

  for (const layer of def.layers) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = layer.type || 'sine';
    osc.frequency.setValueAtTime(layer.freq, ctx.currentTime);
    gain.gain.setValueAtTime(layer.volume || 0.03, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    oscillators.push(osc);
    gains.push(gain);
  }

  // Optional tremolo (slow LFO modulation)
  if (def.tremolo && gains.length > 0) {
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(def.tremolo, ctx.currentTime);
    lfoGain.gain.setValueAtTime(def.layers[0].volume * 0.3, ctx.currentTime);
    lfo.connect(lfoGain);
    for (const g of gains) {
      lfoGain.connect(g.gain);
    }
    lfo.start(ctx.currentTime);
  }

  _musicNodes = { oscillators, gains, lfo };
  _currentMusicKey = key;
}

/**
 * Stop the currently playing synth music.
 */
export function stopSynthMusic() {
  if (!_musicNodes) return;
  const { oscillators, gains, lfo } = _musicNodes;
  const ctx = getCtx();
  const now = ctx ? ctx.currentTime : 0;

  // Fade out gracefully
  for (const g of gains) {
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    } catch { /* ignore */ }
  }
  // Stop oscillators after fade
  setTimeout(() => {
    for (const osc of oscillators) {
      try { osc.stop(); } catch { /* ignore */ }
    }
    if (lfo) {
      try { lfo.stop(); } catch { /* ignore */ }
    }
  }, 350);

  _musicNodes = null;
  _currentMusicKey = null;
}

/**
 * Check if a given key has a synth music definition.
 */
export function hasSynthMusic(key) {
  return key in MUSIC_DEFS;
}
