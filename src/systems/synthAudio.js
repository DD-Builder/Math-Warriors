/**
 * Procedural sound effects using Web Audio API.
 *
 * Generates simple synthesized SFX (chimes, thuds, sparkles) so the
 * game has audio feedback without needing external MP3 files.
 * Each sound is a short oscillator + gain envelope.
 */

let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  return ctx;
}

function tone(freq, dur, type, vol, ramp) {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (ramp) osc.frequency.linearRampToValueAtTime(ramp, c.currentTime + dur);
  gain.gain.setValueAtTime(vol || 0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur);
}

function noise(dur, vol) {
  const c = getCtx(); if (!c) return;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
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

export const SYNTH_SFX = {
  'ui/click': () => tone(800, 0.08, 'square', 0.15),
  'ui/confirm': () => { tone(600, 0.1, 'sine', 0.2); setTimeout(() => tone(900, 0.15, 'sine', 0.2), 80); },
  'ui/back': () => tone(400, 0.12, 'sine', 0.15, 300),

  'battle/correct': () => {
    tone(523, 0.1, 'sine', 0.25);
    setTimeout(() => tone(659, 0.1, 'sine', 0.25), 80);
    setTimeout(() => tone(784, 0.15, 'sine', 0.3), 160);
  },
  'battle/wrong': () => { tone(200, 0.2, 'square', 0.15); noise(0.1, 0.1); },
  'battle/hit-enemy': () => { noise(0.08, 0.2); tone(150, 0.12, 'sawtooth', 0.15); },
  'battle/hit-hero': () => { noise(0.1, 0.25); tone(120, 0.15, 'sawtooth', 0.12); },
  'battle/heal': () => {
    tone(440, 0.12, 'sine', 0.2);
    setTimeout(() => tone(660, 0.12, 'sine', 0.2), 100);
    setTimeout(() => tone(880, 0.2, 'sine', 0.25), 200);
  },
  'battle/victory': () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.25), i * 120));
  },
  'battle/defeat': () => {
    tone(400, 0.3, 'sine', 0.2, 200);
    setTimeout(() => tone(300, 0.4, 'sine', 0.15, 150), 200);
  },

  'world/chest': () => {
    tone(400, 0.08, 'square', 0.15);
    setTimeout(() => tone(600, 0.08, 'square', 0.15), 60);
    setTimeout(() => tone(800, 0.15, 'square', 0.2), 120);
  },
  'world/encounter': () => { noise(0.15, 0.2); tone(200, 0.2, 'sawtooth', 0.15, 100); },
  'world/floor-complete': () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sine', 0.2), i * 100));
  },
  'world/fairy': () => {
    [880, 1100, 1320, 1100, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.15), i * 60));
  },
};

/**
 * Unlock the AudioContext on first user gesture (required by iOS Safari).
 */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
}
