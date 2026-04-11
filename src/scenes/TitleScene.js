import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';

/**
 * TitleScene — the game's front door.
 *
 * v0.4 features:
 *   - Detects existing saves and shows a CONTINUE button if one is found
 *   - Routes: CONTINUE → WorldMapScene, NEW GAME → PartySelectScene
 *   - Plays title music
 *   - Subtle title bob animation
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(COLORS.bg);
    audio.playMusic('music/title');

    // Load save to check if there's progress to continue
    this.save = loadSave();
    this.hasProgress = this.save.party && this.save.party.length >= 3;

    // Soft paper panel
    this.add.rectangle(cx, cy, GAME_WIDTH * 0.7, GAME_HEIGHT * 0.7, COLORS.ink, 0.4)
      .setStrokeStyle(4, COLORS.paperD, 0.3);

    // Title — "MATH"
    const title1 = this.add.text(cx, cy - 220, 'MATH', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '120px',
      color: COLORS_CSS.cobalt,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 8,
      shadow: { offsetX: 6, offsetY: 6, color: '#000', blur: 0, fill: true },
    }).setOrigin(0.5);

    // Title — "WARRIORS"
    const title2 = this.add.text(cx, cy - 100, 'WARRIORS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '120px',
      color: COLORS_CSS.scarlet,
      stroke: COLORS_CSS.ink,
      strokeThickness: 8,
      shadow: { offsetX: 6, offsetY: 6, color: '#000', blur: 0, fill: true },
    }).setOrigin(0.5);

    // Tagline
    this.add.text(cx, cy + 0, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '32px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5);

    // Flavor line
    this.add.text(cx, cy + 60,
      "The world's mathematical fabric is unraveling.\nOnly you can press the pieces back into place.", {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.paper,
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    // Buttons — layout depends on whether we have a save to continue
    if (this.hasProgress) {
      this.buildButton(cx, cy + 180, 'CONTINUE', COLORS.scarlet, () => this.onContinue());
      this.buildButton(cx, cy + 290, 'NEW GAME', COLORS.paperD, () => this.onNewGame(), COLORS_CSS.ink);
    } else {
      this.buildButton(cx, cy + 240, 'START ADVENTURE', COLORS.scarlet, () => this.onNewGame());
    }

    // Version tag
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 20, `v${VERSION}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.inkL,
    }).setOrigin(1, 1);

    // Settings button top-right
    const settingsBg = this.add.rectangle(GAME_WIDTH - 80, 60, 140, 60, COLORS.paperD)
      .setStrokeStyle(3, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 80, 60, 'SETTINGS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.ink,
    }).setOrigin(0.5);
    settingsBg.on('pointerdown', () => {
      audio.play('ui/click');
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.SETTINGS, { returnScene: SCENES.TITLE });
      });
    });

    // Title bob
    this.tweens.add({
      targets: [title1, title2],
      y: '+=8',
      duration: 2000,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  buildButton(x, y, text, fillColor, onClick, textColor = COLORS_CSS.paper) {
    const w = 420;
    const h = 88;

    const bg = this.add.rectangle(x, y, w, h, fillColor)
      .setStrokeStyle(4, COLORS.ink, 0.8)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '26px',
      color: textColor,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    bg.on('pointerdown', () => {
      audio.play('ui/click');
      this.tweens.add({
        targets: [bg, label],
        y: '+=4',
        duration: 60,
        yoyo: true,
      });
    });

    bg.on('pointerup', () => {
      onClick();
    });

    return { bg, label };
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
