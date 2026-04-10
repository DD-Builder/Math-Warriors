import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SCENES } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { BattleScene } from './scenes/BattleScene.js';

// Dismiss the HTML loading indicator once Phaser is ready to take over.
const loadingEl = document.getElementById('loading');

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  // Clamp DPR to prevent the prototype's canvas-memory blowup on Retina iPads.
  // Phaser respects resolution but we override it via the scale manager below.
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  // Input: touch + mouse, no keyboard lock
  input: {
    activePointers: 3,
  },
  scene: [BootScene, TitleScene, BattleScene],
};

const game = new Phaser.Game(config);

// Expose for debugging from browser devtools only.
if (import.meta.env && import.meta.env.DEV) {
  window.__MW = { game, scenes: SCENES };
}

// Hide the HTML loading overlay once the first scene reports ready.
game.events.once('ready', () => {
  if (loadingEl) loadingEl.classList.add('hidden');
});
