/**
 * Procedural sound effects and ambient music using Web Audio API.
 *
 * Generates synthesized SFX so the game has audio feedback without
 * external MP3 files. Each sound is a short oscillator + gain envelope.
 *
 * Also provides simple ambient drone music via playMusic/stopMusic.
 */

let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  return ctx;
}

// ------------------------------------------------------------------
// CORE HELPERS
// ------------------------------------------------------------------

/**
 * Play a tone via an oscillator with envelope and optional frequency sweep.
 * @param {number} freq    - Start frequency (Hz)
 * @param {number} dur     - Duration (seconds)
 * @param {string} type    - Oscillator type: 'sine', 'square', 'sawtooth', 'triangle'
 * @param {number} vol     - Peak volume (0-1)
 * @param {number} [endFreq] - End frequency for a linear sweep
 */
function playTone(freq, dur, type, vol, endFreq) {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (endFreq != null) {
    osc.frequency.linearRampToValueAtTime(endFreq, c.currentTime + dur);
  }
  gain.gain.setValueAtTime(vol || 0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur + 0.01);
}

/**
 * Play a white noise burst for impact/hit sounds.
 * @param {number} dur - Duration (seconds)
 * @param {number} vol - Peak volume (0-1)
 */
function playNoise(dur, vol) {
  const c = getCtx(); if (!c) return;
  const len = Math.max(1, Math.round(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol || 0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(gain);
  gain.connect(c.destination);
  src.start(c.currentTime);
}

// ------------------------------------------------------------------
// SFX REGISTRY
// ------------------------------------------------------------------

export const SYNTH_SFX = {
  // UI
  'ui/click':     () => playTone(800, 0.05, 'sine', 0.3),
  'ui/confirm':   () => playTone(600, 0.1, 'sine', 0.4, 900),
  'ui/back':      () => playTone(400, 0.08, 'sine', 0.3, 300),

  // Battle feedback
  'battle/correct': () => {
    playTone(523, 0.12, 'sine', 0.4);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.4), 80);
  },
  'battle/wrong':     () => playTone(200, 0.15, 'square', 0.2),
  'battle/hit':       () => playNoise(0.08, 0.5),
  'battle/hit-enemy': () => playNoise(0.08, 0.5),
  'battle/hit-hero':  () => playNoise(0.1, 0.3),
  'battle/heal':      () => playTone(800, 0.15, 'sine', 0.3, 1200),
  'battle/victory':   () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.2, 'sine', 0.4), i * 120));
  },
  'battle/defeat':    () => {
    [400, 350, 300, 250].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.25, 'triangle', 0.3), i * 150));
  },

  // World interactions
  'world/chest':      () => {
    playNoise(0.05, 0.2);
    setTimeout(() => playTone(600, 0.1, 'sine', 0.3, 800), 60);
  },
  'world/gold':       () => playTone(1200, 0.06, 'sine', 0.3),
  'world/encounter':  () => playTone(200, 0.2, 'sawtooth', 0.3, 100),
  'world/floor-complete': () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.3, 'sine', 0.4), i * 100));
  },

  // Legacy: fairy (keep for backward compat)
  'world/fairy': () => {
    [880, 1100, 1320, 1100, 880].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.1, 'sine', 0.15), i * 60));
  },
};

// ------------------------------------------------------------------
// BACKGROUND MUSIC (ambient drone)
// ------------------------------------------------------------------

const MUSIC_DEFS = {
  'music/title': {
    frequencies: [220, 330],
    type: 'sine',
    volume: 0.05,
  },
  'music/map': {
    frequencies: [220, 330],
    type: 'sine',
    volume: 0.05,
  },
  'music/battle': {
    frequencies: [330],
    type: 'sine',
    volume: 0.08,
    pulseRate: 3, // subtle LFO
  },
  'music/boss': {
    frequencies: [220, 277],
    type: 'sawtooth',
    volume: 0.06,
    pulseRate: 4,
  },
  'music/floor-1': {
    frequencies: [220, 330],
    type: 'sine',
    volume: 0.04,
  },
  'music/floor-2': {
    frequencies: [247, 370],
    type: 'sine',
    volume: 0.04,
  },
  'music/floor-3': {
    frequencies: [262, 392],
    type: 'triangle',
    volume: 0.04,
  },
  'music/floor-4': {
    frequencies: [196, 294],
    type: 'sawtooth',
    volume: 0.04,
  },
  'music/floor-5': {
    frequencies: [233, 349],
    type: 'triangle',
    volume: 0.04,
  },
};

let _musicNodes = null; // { oscillators: OscillatorNode[], gains: GainNode[], lfo?: OscillatorNode }
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

  const c = getCtx();
  if (!c) return;

  const oscillators = [];
  const gains = [];
  let lfo = null;

  for (const freq of def.frequencies) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = def.type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime);
    gain.gain.setValueAtTime(def.volume || 0.05, c.currentTime);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    oscillators.push(osc);
    gains.push(gain);
  }

  // Optional LFO for pulse effect
  if (def.pulseRate && gains.length > 0) {
    lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(def.pulseRate, c.currentTime);
    lfoGain.gain.setValueAtTime(def.volume * 0.3, c.currentTime);
    lfo.connect(lfoGain);
    // Connect LFO to each gain's gain parameter
    for (const g of gains) {
      lfoGain.connect(g.gain);
    }
    lfo.start(c.currentTime);
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
  const c = getCtx();
  const now = c ? c.currentTime : 0;

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

// ------------------------------------------------------------------
// iOS UNLOCK
// ------------------------------------------------------------------

/**
 * Unlock the AudioContext on first user gesture (required by iOS Safari).
 */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
}
