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
      fontSize: '36px',
      color: '#f0d060',
      stroke: '#5a3010',
      strokeThickness: 6,
      letterSpacing: 2,
    }).setOrigin(0.5);

    PaperButton(this, area.cx, area.bottom - 50, 'PLAY', {
      w: 480, h: 90, color: 0xf05050, fontSize: 34,
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.SAVE_SELECT, undefined, 300);
      },
    });

    // Version tag bottom-right (inside safe area)
    this.add.text(area.right, area.bottom + 40, `v${VERSION}`, {
      ...TEXT.stat(),
      fontSize: '11px',
      color: '#8a7a60',
    }).setOrigin(1, 1).setAlpha(0.3);

    // Settings button top-right (inside safe area)
    PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 160, h: 54, color: 0x6090c0, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    });

    // Tutorial button — optional, top-left
    PaperButton(this, area.left + 75, area.top + 35, 'TUTORIAL', {
      w: 160, h: 54, color: 0xc09030, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    });
  }

}
