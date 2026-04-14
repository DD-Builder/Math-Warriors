import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, PaperPanel, TEXT, safeArea } from '../ui/paperUI.js';
import { drawPapercutTitle, scatterPapercutDecor } from '../ui/titleArt.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(0x000000);
    audio.playMusic('music/title');

    this.save = loadSave();
    this.hasProgress = this.save.party && this.save.party.length >= 3;

    // Bright cheerful landscape — sky + hills + sun glow
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    // Scatter flowers + clouds
    scatterPapercutDecor(this, GAME_WIDTH, GAME_HEIGHT, { seed: 42, theme: 'garden' });

    // === TITLE as papercut art (no font) ===
    // Scale tuned so MATH (4 letters) + WARRIORS (8 letters) both fit
    // horizontally within safe area and vertically in the upper half.
    drawPapercutTitle(this, area.cx, area.top + 200, 1.6);

    // Tagline
    this.add.text(area.cx, area.top + 370, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#1a4a6a',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // === BUTTONS — locked into safe area bottom ===
    if (this.hasProgress) {
      PaperButton(this, area.cx, area.bottom - 150, 'CONTINUE', {
        w: 360, h: 80, color: 0xe84840, fontSize: 30,
        onClick: () => this.onContinue(),
      });
      PaperButton(this, area.cx, area.bottom - 50, 'NEW GAME', {
        w: 360, h: 80, color: 0x4aa848, fontSize: 30,
        onClick: () => this.onNewGame(),
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
      onClick: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(SCENES.SETTINGS, { returnScene: SCENES.TITLE });
        });
      },
    });
  }

  onNewGame() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.GRADE_SELECT);
    });
  }

  onContinue() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.WORLD_MAP);
    });
  }
}
