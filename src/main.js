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
import { TutorialScene } from './scenes/TutorialScene.js';
import { CutsceneScene } from './scenes/CutsceneScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { SaveSlotScene } from './scenes/SaveSlotScene.js';
import { MasteryScene } from './scenes/MasteryScene.js';
import { BossRushScene } from './scenes/BossRushScene.js';
import { EvolutionScene } from './scenes/EvolutionScene.js';
import { GalleryScene } from './scenes/GalleryScene.js';
import { audio } from './systems/audio.js';
import { loadSave } from './systems/save.js';

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
  scene: [BootScene, TitleScene, SaveSlotScene, TutorialScene, GradeSelectScene, PartySelectScene, WorldMapScene, CutsceneScene, MazeScene, BattleScene, EndingScene, ShopScene, SettingsScene, MasteryScene, BossRushScene, EvolutionScene, GalleryScene],
};

const game = new Phaser.Game(config);

// iPad Safari standalone web apps freeze the canvas on background.
// On resume, save maze state then reload to get a clean canvas.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Give Phaser a frame to save state before reloading
    const activeScene = game.scene.getScenes(true)[0];
    if (activeScene && activeScene.saveMazeState) {
      activeScene.saveMazeState();
    }
    setTimeout(() => location.reload(), 50);
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

// ======================================================================
// SESSION TIMER (Phase 6.3 — Parent Session Timer)
// ======================================================================
// Checks elapsed play time every 30 seconds. When the configured limit
// is reached, shows a full-screen "time for a break" overlay and returns
// to the title screen on dismiss.
const _sessionStart = Date.now();
setInterval(() => {
  const activeSlot = game.registry?.get('activeSlot') || 1;
  const save = loadSave(activeSlot);
  const limitMin = save.settings.sessionTimer || 0;
  if (limitMin <= 0) return;

  const elapsedMin = (Date.now() - _sessionStart) / 60000;
  if (elapsedMin < limitMin) return;

  // Only show once — clear the interval by nullifying the timer setting
  // so subsequent checks skip. The overlay handles dismissal.
  const activeScene = game.scene.getScenes(true)[0];
  if (!activeScene || activeScene._sessionTimerShown) return;
  activeScene._sessionTimerShown = true;

  // Pause the active scene and show a full-screen overlay
  const w = activeScene.cameras.main.width;
  const h = activeScene.cameras.main.height;

  const bg = activeScene.add.rectangle(w / 2, h / 2, w, h, 0x1a0e04, 0.92)
    .setDepth(200).setInteractive();
  const msg = activeScene.add.text(w / 2, h / 2 - 60,
    'Great job today!\nTime for a break.\nSee you next time!', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '36px',
    color: '#fff8e0',
    align: 'center',
    stroke: '#3a2410',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(201);

  const btnBg = activeScene.add.rectangle(w / 2, h / 2 + 80, 220, 70, 0x4aa848)
    .setStrokeStyle(4, 0x1a0e04)
    .setDepth(201)
    .setInteractive({ useHandCursor: true });
  const btnLabel = activeScene.add.text(w / 2, h / 2 + 80, 'OK', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '28px',
    color: '#fff8e0',
  }).setOrigin(0.5).setDepth(202);

  btnBg.on('pointerdown', () => {
    bg.destroy();
    msg.destroy();
    btnBg.destroy();
    btnLabel.destroy();
    activeScene.scene.start(SCENES.TITLE);
  });
}, 30000);

// Expose the game on the window for devtools debugging and e2e testing.
// Not considered a security risk — this is a client-side game with no
// secrets to protect.
window.__MW = { game, scenes: SCENES };

// Hide the HTML loading overlay once the first scene reports ready.
game.events.once('ready', () => {
  if (loadingEl) loadingEl.classList.add('hidden');
});
