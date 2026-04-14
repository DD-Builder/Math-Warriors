import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, PaperPanel, TEXT, safeArea } from '../ui/paperUI.js';

/**
 * TitleScene — the game's front door.
 *
 * The showcase scene. Everything here is papercut-styled:
 *   - Bright sunny cheerful background (menu palette)
 *   - Title letters rendered as layered paper cutouts with shadow
 *   - Buttons are rounded paper shapes with drop shadows
 *   - Settings pill in the top-right (safe margin)
 *   - All text uses the consistent TEXT.* styles
 */
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

    // Bright cheerful papercut diorama behind everything
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    // Soft cream paper panel for the title stack
    const panelW = 780;
    const panelH = 560;
    PaperPanel(this, area.cx, area.cy - 40, panelW, panelH, {
      color: 0xfff8e8,
      alpha: 0.94,
    });

    // === TITLE as layered paper cutouts ===
    this.drawPapercutTitle(area.cx, area.cy - 200);

    // Tagline
    this.add.text(area.cx, area.cy + 20, 'An Educational Adventure', {
      ...TEXT.heading(),
      fontSize: '26px',
      color: '#d07818',
    }).setOrigin(0.5);

    // Flavor line — darker so it reads on cream paper
    this.add.text(area.cx, area.cy + 60,
      "The world's mathematical fabric is unraveling.\nOnly you can press the pieces back into place.", {
      ...TEXT.body(),
      fontSize: '18px',
      color: '#5a3820',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // === BUTTONS ===
    if (this.hasProgress) {
      PaperButton(this, area.cx, area.cy + 150, 'CONTINUE', {
        w: 320, h: 74, color: 0xe84840, fontSize: 28,
        onClick: () => this.onContinue(),
      });
      PaperButton(this, area.cx, area.cy + 240, 'NEW GAME', {
        w: 320, h: 74, color: 0x4aa848, fontSize: 28,
        onClick: () => this.onNewGame(),
      });
    } else {
      PaperButton(this, area.cx, area.cy + 200, 'START ADVENTURE', {
        w: 400, h: 80, color: 0xe84840, fontSize: 30,
        onClick: () => this.onNewGame(),
      });
    }

    // Version tag bottom-right (inside safe area)
    this.add.text(area.right, area.bottom, `v${VERSION}`, {
      ...TEXT.stat(),
      fontSize: '14px',
      color: '#8a7a60',
    }).setOrigin(1, 1);

    // Settings button top-right (inside safe area)
    PaperButton(this, area.right - 75, area.top + 30, 'SETTINGS', {
      w: 140, h: 50, color: 0x4a6ca8, fontSize: 14,
      onClick: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(SCENES.SETTINGS, { returnScene: SCENES.TITLE });
        });
      },
    });
  }

  /**
   * Render "MATH WARRIORS" as stacked paper-cutout letters with
   * multi-layer shadows for depth. Rather than relying on a single font
   * stroke, we draw three copies at offsets to create the layered
   * cutout effect.
   */
  drawPapercutTitle(cx, cy) {
    const mathOpts = { fontSize: '96px' };
    const warOpts = { fontSize: '96px' };

    // MATH — dark blue shadow underlay, red mid, cream top
    this.add.text(cx + 6, cy + 7, 'MATH', {
      fontFamily: '"Fredoka One", cursive',
      color: '#1a0e04',
      ...mathOpts,
    }).setOrigin(0.5).setAlpha(0.3);
    this.add.text(cx + 3, cy + 4, 'MATH', {
      fontFamily: '"Fredoka One", cursive',
      color: '#2e4e88',
      ...mathOpts,
    }).setOrigin(0.5);
    const mathTop = this.add.text(cx, cy, 'MATH', {
      fontFamily: '"Fredoka One", cursive',
      color: '#fff8e0',
      stroke: '#2e4e88',
      strokeThickness: 4,
      ...mathOpts,
    }).setOrigin(0.5);

    // WARRIORS — below, with red layers
    const wy = cy + 110;
    this.add.text(cx + 6, wy + 7, 'WARRIORS', {
      fontFamily: '"Fredoka One", cursive',
      color: '#1a0e04',
      ...warOpts,
    }).setOrigin(0.5).setAlpha(0.3);
    this.add.text(cx + 3, wy + 4, 'WARRIORS', {
      fontFamily: '"Fredoka One", cursive',
      color: '#c02820',
      ...warOpts,
    }).setOrigin(0.5);
    const warTop = this.add.text(cx, wy, 'WARRIORS', {
      fontFamily: '"Fredoka One", cursive',
      color: '#fff8e0',
      stroke: '#c02820',
      strokeThickness: 4,
      ...warOpts,
    }).setOrigin(0.5);

    // Gentle bob
    this.tweens.add({
      targets: [mathTop, warTop],
      y: '+=6',
      duration: 2200,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: -1,
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
