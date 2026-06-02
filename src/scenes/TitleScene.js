import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { makeRng } from '../systems/rng.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import {
  drawDioramaFrame,
  drawInnerFrameLayers,
  drawCentralGlow,
  drawDioramaHills,
  drawTrees,
  drawFlowers,
  drawButterflies,
  drawBirds,
  drawFloatingPetals,
  drawPapercutTitle,
} from '../ui/titleArt.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const rng = makeRng(42);

    fadeInScene(this);
    audio.playMusic('music/title');

    this.save = loadSave();

    // ============================================================
    // LAYER 1: Pale mint sky background
    // ============================================================
    const bgGfx = this.add.graphics().setDepth(0);
    bgGfx.fillStyle(0xd4e8d0, 1);
    bgGfx.fillRect(0, 0, W, H);

    // ============================================================
    // LAYER 2: Central warm glow
    // ============================================================
    drawCentralGlow(this, W, H, 1);

    // ============================================================
    // LAYER 3-6: Hill layers (far to near)
    // ============================================================
    drawDioramaHills(this, W, H, rng, 3);

    // ============================================================
    // LAYER 7: Tree silhouettes on left and right
    // ============================================================
    drawTrees(this, W, H, rng, 5);

    // ============================================================
    // LAYER 8: Flowers along the foreground
    // ============================================================
    drawFlowers(this, W, H, rng, 6);

    // ============================================================
    // LAYER 9: Inner frame depth layers (inside the frame opening)
    // ============================================================
    drawInnerFrameLayers(this, W, H, rng, 11);

    // ============================================================
    // LAYER 10: The organic papercut frame (on top of scene)
    // ============================================================
    drawDioramaFrame(this, W, H, rng, 12);

    // ============================================================
    // LAYER 11: Floating decorations on top of everything
    // ============================================================
    drawButterflies(this, W, H, rng, 13);
    drawBirds(this, W, H, rng, 13);
    drawFloatingPetals(this, W, H, rng, 13);

    // ============================================================
    // TITLE TEXT: "MATH WARRIORS" in the upper-center of the opening
    // ============================================================
    const titleCy = Math.round(H * 0.30);
    drawPapercutTitle(this, area.cx, titleCy, 1.2);

    // Tagline — warm gold, below the title
    this.add.text(area.cx, titleCy + 180, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '34px',
      color: '#f0d060',
      stroke: '#5a3010',
      strokeThickness: 6,
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(15);

    // ============================================================
    // PLAY BUTTON — large, prominent, in the diorama opening
    // ============================================================
    const playBtn = PaperButton(this, area.cx, H * 0.62, 'PLAY', {
      w: 480, h: 90, color: 0xf05050, fontSize: 34,
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.SAVE_SELECT, undefined, 300);
      },
    });
    setDepthAll(playBtn, 14);

    // ============================================================
    // CORNER BUTTONS — above the frame layer, always accessible
    // ============================================================

    // Settings button top-right (inside safe area, on top of frame)
    const settingsBtn = PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 160, h: 54, color: 0x6090c0, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    });
    setDepthAll(settingsBtn, 15);

    // Tutorial button top-left
    const tutorialBtn = PaperButton(this, area.left + 75, area.top + 35, 'TUTORIAL', {
      w: 160, h: 54, color: 0xc09030, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    });
    setDepthAll(tutorialBtn, 15);

    // Version tag bottom-right (on top of frame)
    this.add.text(area.right, area.bottom + 40, `v${VERSION}`, {
      ...TEXT.stat(),
      fontSize: '11px',
      color: '#8a7a60',
    }).setOrigin(1, 1).setAlpha(0.3).setDepth(15);
  }
}

/**
 * Set depth on all parts of a PaperButton return value.
 */
function setDepthAll(btn, depth) {
  if (btn.bg) btn.bg.setDepth(depth);
  if (btn.shadow) btn.shadow.setDepth(depth);
  if (btn.label) btn.label.setDepth(depth);
  if (btn.zone) btn.zone.setDepth(depth);
}
