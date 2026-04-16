import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { drawPapercutTitle, scatterPapercutDecor } from '../ui/titleArt.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    fadeInScene(this);
    audio.playMusic('music/title');

    this.save = loadSave();
    this.hasProgress = this.save.party && this.save.party.length >= 3;

    // Bright cheerful landscape — sky + hills + sun glow
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    // Title at the rule-of-thirds band (~38% down) so it doesn't look
    // top-heavy on iPad.
    const titleCy = Math.round(GAME_HEIGHT * 0.38);

    // Scatter flowers + clouds, but keep them out of the title area
    scatterPapercutDecor(this, GAME_WIDTH, GAME_HEIGHT, {
      seed: 42, theme: 'garden',
      excludeRect: { x: GAME_WIDTH / 2, y: titleCy, w: GAME_WIDTH * 0.85, h: 380 },
    });

    // === TITLE as papercut art (no font) ===
    drawPapercutTitle(this, area.cx, titleCy, 1.4);

    // Tagline — placed well below WARRIORS to avoid overlap
    this.add.text(area.cx, titleCy + 230, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#1a4a6a',
      strokeThickness: 5,
      letterSpacing: 2,
    }).setOrigin(0.5);

    // === BUTTONS — locked into safe area bottom ===
    if (this.hasProgress) {
      // NEW GAME on top, CONTINUE below — per request
      PaperButton(this, area.cx, area.bottom - 150, 'NEW GAME', {
        w: 360, h: 80, color: 0x4aa848, fontSize: 30,
        onClick: () => this.onNewGame(),
      });
      PaperButton(this, area.cx, area.bottom - 50, 'CONTINUE', {
        w: 360, h: 80, color: 0xe84840, fontSize: 30,
        onClick: () => this.onContinue(),
      });
    } else {
      PaperButton(this, area.cx, area.bottom - 50, 'START ADVENTURE', {
        w: 460, h: 90, color: 0xe84840, fontSize: 32,
        onClick: () => this.onNewGame(),
      });
    }

    // Version tag bottom-right (inside safe area)
    this.add.text(area.right, area.bottom + 40, `v${VERSION}`, {
      ...TEXT.stat(),
      fontSize: '14px',
      color: '#8a7a60',
    }).setOrigin(1, 1);

    // Settings button top-right (inside safe area)
    PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 140, h: 54, color: 0x4a6ca8, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    });
  }

  onNewGame() {
    transitionTo(this, SCENES.GRADE_SELECT, undefined, 300);
  }

  onContinue() {
    transitionTo(this, SCENES.WORLD_MAP, undefined, 300);
  }
}
