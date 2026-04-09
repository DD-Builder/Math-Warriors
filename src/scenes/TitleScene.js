import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';

/**
 * TitleScene
 *
 * The game's front door. v0.1 goal: show "MATH WARRIORS" and a START button.
 * Tapping START logs a placeholder message. Future milestones replace that
 * with a transition to GradeSelectScene.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Background — solid color for v0.1. Per-level backgrounds come later.
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Soft paper panel behind the text so it doesn't float in pure black.
    this.add.rectangle(cx, cy, GAME_WIDTH * 0.7, GAME_HEIGHT * 0.7, COLORS.ink, 0.4)
      .setStrokeStyle(4, COLORS.paperD, 0.3);

    // Title — big "MATH" line
    const title1 = this.add.text(cx, cy - 180, 'MATH', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '120px',
      color: COLORS_CSS.cobalt,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 8,
      shadow: { offsetX: 6, offsetY: 6, color: '#000', blur: 0, fill: true },
    }).setOrigin(0.5);

    // Title — big "WARRIORS" line
    const title2 = this.add.text(cx, cy - 60, 'WARRIORS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '120px',
      color: COLORS_CSS.scarlet,
      stroke: COLORS_CSS.ink,
      strokeThickness: 8,
      shadow: { offsetX: 6, offsetY: 6, color: '#000', blur: 0, fill: true },
    }).setOrigin(0.5);

    // Subtitle / tagline
    this.add.text(cx, cy + 40, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '32px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5);

    // Flavor line from the prototype
    this.add.text(cx, cy + 100,
      "The world's mathematical fabric is unraveling.\nOnly you can press the pieces back into place.", {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.paper,
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    // START button
    this.buildStartButton(cx, cy + 240);

    // Version tag in corner
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 20, `v${VERSION}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.inkL,
    }).setOrigin(1, 1);

    // Gentle title bob animation so it doesn't feel static
    this.tweens.add({
      targets: [title1, title2],
      y: '+=8',
      duration: 2000,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Builds the START button. Uses a rectangle + text combo so we can
   * animate press/hover without loading a sprite.
   */
  buildStartButton(x, y) {
    const w = 420;
    const h = 88;

    const bg = this.add.rectangle(x, y, w, h, COLORS.scarlet)
      .setStrokeStyle(4, COLORS.ink, 0.8)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, 'START ADVENTURE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Press feedback
    bg.on('pointerdown', () => {
      bg.fillColor = COLORS.scarletL;
      this.tweens.add({
        targets: [bg, label],
        y: '+=4',
        duration: 60,
        yoyo: true,
      });
    });

    bg.on('pointerup', () => {
      bg.fillColor = COLORS.scarlet;
      this.onStart();
    });

    bg.on('pointerout', () => {
      bg.fillColor = COLORS.scarlet;
    });
  }

  /**
   * Called when the player taps START. In v0.1 this just shows a toast
   * to prove the button works. In v0.2 it'll transition to GradeSelectScene.
   */
  onStart() {
    // Placeholder: show a quick message. Replace with a scene transition
    // once GradeSelectScene exists.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 80;

    const toast = this.add.text(cx, cy, 'NEXT UP: Grade Select (v0.2)', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '24px',
      color: COLORS_CSS.goldL,
      backgroundColor: '#1a0e04',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 1500,
      onComplete: () => toast.destroy(),
    });
  }
}
