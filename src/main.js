import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SCENES } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GradeSelectScene } from './scenes/GradeSelectScene.js';
import { PartySelectScene } from './scenes/PartySelectScene.js';
import { WorldMapScene } from './scenes/WorldMapScene.js';
import { MazeScene } from './scenes/MazeScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { audio } from './systems/audio.js';

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
  scene: [BootScene, TitleScene, GradeSelectScene, PartySelectScene, WorldMapScene, MazeScene, BattleScene, ShopScene, SettingsScene],
};

const game = new Phaser.Game(config);

// iPad Safari standalone web apps freeze the canvas on background.
// No amount of scale.refresh() fixes this reliably. The only
// bulletproof solution: reload the page on resume.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    location.reload();
  }
});

// Triple-tap top-left corner to force reload (safety net if display is stuck)
let cornerTaps = 0, cornerTimer = null;
document.addEventListener('pointerdown', (e) => {
  if (e.clientX < 80 && e.clientY < 80) {
    cornerTaps++;
    clearTimeout(cornerTimer);
    cornerTimer = setTimeout(() => { cornerTaps = 0; }, 1000);
    if (cornerTaps >= 3) { location.reload(); }
  }
});

// Wire the audio manager to the game instance.
audio.init(game);

// Expose the game on the window for devtools debugging and e2e testing.
// Not considered a security risk — this is a client-side game with no
// secrets to protect.
window.__MW = { game, scenes: SCENES };

// Hide the HTML loading overlay once the first scene reports ready.
game.events.once('ready', () => {
  if (loadingEl) loadingEl.classList.add('hidden');
});
