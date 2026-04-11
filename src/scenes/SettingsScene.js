import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, clearSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';

/**
 * SettingsScene
 *
 * Simple settings menu accessible from multiple places in the game
 * (title, pause menus). Lets the player adjust volume, change their
 * grade level, reset their save, and see basic stats.
 *
 * Opens over the top of its caller (as an overlay scene) so the
 * underlying scene isn't destroyed — tapping BACK resumes wherever
 * you came from.
 *
 * v0.7 scope:
 *   - Music volume slider (3 steps: off, half, full)
 *   - SFX volume slider (3 steps: off, half, full)
 *   - Current grade display + change button (jumps to GradeSelect)
 *   - Reset save button (with a confirm prompt)
 *   - Stats: battles, correct, wrong, gold earned
 *   - BACK button that resumes the caller scene
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.SETTINGS });
  }

  init(data) {
    this.returnScene = data?.returnScene ?? SCENES.TITLE;
    this.returnData = data?.returnData ?? null;
    this.save = loadSave();
    this.confirmingReset = false;
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.cameras.main.setBackgroundColor(COLORS.ink);

    this.buildBackground();
    this.buildHeader();
    this.buildSettingsPanel();
    this.buildBackButton();
  }

  buildBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.9);
  }

  buildHeader() {
    this.add.text(GAME_WIDTH / 2, 100, 'SETTINGS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '48px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 5,
    }).setOrigin(0.5);
  }

  buildSettingsPanel() {
    const panelW = 800;
    const panelX = GAME_WIDTH / 2;
    let panelY = 220;
    const rowH = 80;

    this.add.rectangle(panelX, GAME_HEIGHT / 2 + 30, panelW, 620, COLORS.ink, 0.8)
      .setStrokeStyle(4, COLORS.paperD, 0.7);

    // MUSIC VOLUME
    this.buildVolumeRow(panelX, panelY, 'MUSIC', this.save.settings.musicVolume, (v) => {
      this.save.settings.musicVolume = v;
      audio.setMusicVolume(v);
      writeSave(this.save);
    });
    panelY += rowH;

    // SFX VOLUME
    this.buildVolumeRow(panelX, panelY, 'SOUND FX', this.save.settings.sfxVolume, (v) => {
      this.save.settings.sfxVolume = v;
      audio.setSfxVolume(v);
      writeSave(this.save);
    });
    panelY += rowH;

    // GRADE DISPLAY + CHANGE
    const gradeNames = ['K', '1st', '2nd', '3rd', '4th', '5th'];
    this.add.text(panelX - panelW / 2 + 40, panelY, 'GRADE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);
    this.add.text(panelX, panelY, gradeNames[this.save.grade ?? 3], {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '26px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5, 0.5);
    this.buildButton(panelX + 200, panelY, 180, 50, 'CHANGE', COLORS.cobalt, () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.GRADE_SELECT);
      });
    });
    panelY += rowH;

    // STATS
    this.add.text(panelX - panelW / 2 + 40, panelY, 'STATS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);

    const stats = this.save.stats;
    const accuracy = stats.totalCorrect + stats.totalWrong > 0
      ? Math.round((stats.totalCorrect / (stats.totalCorrect + stats.totalWrong)) * 100)
      : 0;
    const statText = `BATTLES ${stats.totalBattles}    CORRECT ${stats.totalCorrect}    GOLD ${this.save.gold}    ACCURACY ${accuracy}%`;
    this.add.text(panelX + 120, panelY, statText, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '12px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5, 0.5);
    panelY += rowH;

    // RESET SAVE
    this.add.text(panelX - panelW / 2 + 40, panelY, 'DANGER', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.scarletL,
    }).setOrigin(0, 0.5);
    this.resetBtn = this.buildButton(panelX + 120, panelY, 340, 50, 'RESET ALL PROGRESS', COLORS.scarlet, () => {
      this.onResetPressed();
    });
  }

  buildVolumeRow(x, y, label, current, onChange) {
    const panelW = 800;

    this.add.text(x - panelW / 2 + 40, y, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);

    const levels = [
      { label: 'OFF',  value: 0.0 },
      { label: 'LOW',  value: 0.3 },
      { label: 'MED',  value: 0.6 },
      { label: 'HIGH', value: 1.0 },
    ];

    levels.forEach((lvl, i) => {
      const btnX = x - 50 + i * 120;
      const isActive = Math.abs(current - lvl.value) < 0.05;
      const bg = this.add.rectangle(btnX, y, 100, 50, isActive ? COLORS.gold : COLORS.paperD)
        .setStrokeStyle(3, COLORS.ink)
        .setInteractive({ useHandCursor: true });
      this.add.text(btnX, y, lvl.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: isActive ? COLORS_CSS.ink : COLORS_CSS.inkL,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        audio.play('ui/click');
        onChange(lvl.value);
        this.scene.restart();
      });
    });
  }

  buildButton(x, y, w, h, label, color, onClick) {
    const bg = this.add.rectangle(x, y, w, h, color)
      .setStrokeStyle(3, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 2,
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      audio.play('ui/click');
      onClick();
    });
    return bg;
  }

  onResetPressed() {
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      this.resetBtn.setFillStyle(0xff4020);
      this.showFlash('Are you sure? Tap again to confirm.');
      this.time.delayedCall(3000, () => {
        if (this.confirmingReset) {
          this.confirmingReset = false;
          if (this.resetBtn.active) this.resetBtn.setFillStyle(COLORS.scarlet);
        }
      });
      return;
    }
    clearSave();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.TITLE);
    });
  }

  showFlash(message) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 180, message, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.scarletL,
      backgroundColor: '#1a0e04',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2000,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  buildBackButton() {
    this.buildButton(GAME_WIDTH / 2, GAME_HEIGHT - 80, 280, 70, 'BACK', COLORS.paperD, () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(this.returnScene, this.returnData || undefined);
      });
    });
  }
}
