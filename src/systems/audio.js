/**
 * Audio system
 *
 * Thin wrapper around Phaser's audio manager that:
 *   1. Defines every sound by a logical key, not a file path
 *   2. Silently no-ops on missing assets (so scenes can call `play('hit')`
 *      today without the file existing yet)
 *   3. Centralizes music/SFX volume and mute
 *   4. Handles "music fade on scene transition" as a one-liner
 *
 * Design principle this serves: "Feedback is the invisible dialogue."
 * See docs/DESIGN-PRINCIPLES.md, principle 1. Every visible action should
 * have an audible response. We ship the infrastructure now so scenes can
 * call audio.play('correct') today, and the actual MP3 drops later
 * without a code change.
 */

// ------------------------------------------------------------------
// SOUND REGISTRY
// ------------------------------------------------------------------
// All sound keys used in the game live here. Scenes reference by key.
// When we add real audio files, we update `file` on each entry.
// `file: null` means "we haven't recorded/licensed this sound yet"
// and the system will silently no-op when it's requested.

const SOUNDS = {
  // UI
  'ui/click':         { file: null, volume: 0.7, category: 'sfx' },
  'ui/hover':         { file: null, volume: 0.4, category: 'sfx' },
  'ui/confirm':       { file: null, volume: 0.8, category: 'sfx' },
  'ui/back':          { file: null, volume: 0.6, category: 'sfx' },

  // Battle feedback
  'battle/correct':   { file: null, volume: 0.9, category: 'sfx' },
  'battle/wrong':     { file: null, volume: 0.8, category: 'sfx' },
  'battle/hit':       { file: null, volume: 0.9, category: 'sfx' },
  'battle/hit-hero':  { file: null, volume: 0.9, category: 'sfx' },
  'battle/hit-enemy': { file: null, volume: 0.9, category: 'sfx' },
  'battle/heal':      { file: null, volume: 0.8, category: 'sfx' },
  'battle/victory':   { file: null, volume: 1.0, category: 'sfx' },
  'battle/defeat':    { file: null, volume: 0.9, category: 'sfx' },
  'battle/level-up':  { file: null, volume: 1.0, category: 'sfx' },
  'battle/critical':  { file: null, volume: 1.0, category: 'sfx' },

  // World interactions
  'world/chest':      { file: null, volume: 0.9, category: 'sfx' },
  'world/gold':       { file: null, volume: 0.8, category: 'sfx' },
  'world/fairy':      { file: null, volume: 1.0, category: 'sfx' },
  'world/footstep':   { file: null, volume: 0.3, category: 'sfx' },
  'world/encounter':  { file: null, volume: 0.9, category: 'sfx' },
  'world/floor-complete': { file: null, volume: 1.0, category: 'sfx' },

  // Music — looping background
  'music/title':      { file: null, volume: 0.6, category: 'music', loop: true },
  'music/map':        { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-1':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-2':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-3':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-4':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-5':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-6':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-7':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-8':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/floor-9':    { file: null, volume: 0.6, category: 'music', loop: true },
  'music/battle':     { file: null, volume: 0.7, category: 'music', loop: true },
  'music/boss':       { file: null, volume: 0.8, category: 'music', loop: true },
};

// ------------------------------------------------------------------
// AUDIO MANAGER
// ------------------------------------------------------------------
// Single instance, created on Phaser game startup. Scenes reference
// via `scene.game.registry.get('audio')` or via the convenience
// `audio` export that's lazy-initialized.

import { playSynth, unlockAudio, playSynthMusic, stopSynthMusic, hasSynthMusic } from './synthAudio.js';

class AudioManager {
  constructor() {
    this.game = null;
    this.musicVolume = 0.8;
    this.sfxVolume = 1.0;
    this.muted = false;
    this.currentMusic = null;
    this._currentMusicObj = null;
  }

  /**
   * Wire the audio system to a Phaser game. Call once from main.js
   * after Phaser boots.
   */
  init(game) {
    this.game = game;
    // Load saved volume preferences if they exist
    try {
      const raw = localStorage.getItem('mathwarriors.save');
      if (raw) {
        const save = JSON.parse(raw);
        if (save?.settings) {
          if (typeof save.settings.musicVolume === 'number') this.musicVolume = save.settings.musicVolume;
          if (typeof save.settings.sfxVolume === 'number') this.sfxVolume = save.settings.sfxVolume;
        }
      }
    } catch {
      // localStorage not available or corrupted — use defaults
    }
  }

  /**
   * Preload any sounds that have a `file` set. Called from BootScene.
   * Safely skips entries without a file.
   */
  preload(scene) {
    for (const [key, entry] of Object.entries(SOUNDS)) {
      if (!entry.file) continue;
      scene.load.audio(key, entry.file);
    }
  }

  /**
   * Play a one-shot sound (SFX) by key. Silently no-ops if:
   *   - the key is unknown
   *   - the sound has no file registered yet
   *   - the audio system is muted
   *   - Phaser can't find the loaded asset (e.g., during dev before preload)
   */
  play(key, opts = {}) {
    if (this.muted) return;
    const entry = SOUNDS[key];
    if (!entry) return;

    // If a real file is loaded, use Phaser's audio
    if (entry.file && this.game?.sound) {
      try {
        const volume = (opts.volume ?? entry.volume) *
          (entry.category === 'music' ? this.musicVolume : this.sfxVolume);
        this.game.sound.play(key, { volume, ...opts });
        return;
      } catch { /* fall through to synth */ }
    }

    // Fall back to procedural synthesized SFX
    if (entry.category !== 'music' && this.sfxVolume > 0) {
      unlockAudio();
      playSynth(key);
    }
  }

  /**
   * Start looping music. If `key` is the same as the current track, do
   * nothing. Otherwise fade out the current track and start the new one.
   * Falls back to synth ambient drone when no audio file is loaded.
   */
  playMusic(key, opts = {}) {
    if (this.muted) return;
    if (this.currentMusic === key) return;

    const entry = SOUNDS[key];

    // Try Phaser audio first if a file is loaded
    if (entry?.file && this.game?.sound) {
      // Stop any synth music that might be playing
      stopSynthMusic();

      if (this._currentMusicObj) {
        try { this._currentMusicObj.stop(); } catch { /* ignore */ }
        this._currentMusicObj = null;
      }

      try {
        const volume = (opts.volume ?? entry.volume) * this.musicVolume;
        this._currentMusicObj = this.game.sound.add(key, { loop: true, volume });
        this._currentMusicObj.play();
        this.currentMusic = key;
        return;
      } catch (err) {
        console.warn(`[audio] Failed to play music ${key}:`, err);
      }
    }

    // Fall back to synth ambient drone
    if (this.musicVolume > 0 && hasSynthMusic(key)) {
      if (this._currentMusicObj) {
        try { this._currentMusicObj.stop(); } catch { /* ignore */ }
        this._currentMusicObj = null;
      }
      unlockAudio();
      playSynthMusic(key);
      this.currentMusic = key;
      return;
    }

    // No audio available — just mark as current to avoid repeated attempts
    this.currentMusic = key;
  }

  stopMusic() {
    if (this._currentMusicObj) {
      try { this._currentMusicObj.stop(); } catch { /* ignore */ }
      this._currentMusicObj = null;
    }
    stopSynthMusic();
    this.currentMusic = null;
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) this.stopMusic();
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this._currentMusicObj) {
      try { this._currentMusicObj.setVolume(this.musicVolume); } catch { /* ignore */ }
    }
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }
}

// Singleton
export const audio = new AudioManager();
