import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, clearSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

/**
 * SettingsScene — volume, grade, stats, reset.
 * Everything inside safe area, no cutoff.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.SETTINGS });
  }

  init(data) {
    this.returnScene = data?.returnScene ?? SCENES.TITLE;
    this.returnData = data?.returnData ?? null;
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
    this.confirmingReset = false;
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    fadeInScene(this, 200);

    // Bright bg
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 555);

    // Cream panel centered in safe area
    const panelW = area.w - 40;
    const panelH = area.h - 40;
    PaperPanel(this, area.cx, area.cy, panelW, panelH, {
      color: 0xfff8e8,
      alpha: 0.95,
      radius: 28,
    });

    // Header
    this.add.text(area.cx, area.top + 60, 'SETTINGS', {
      ...TEXT.title(),
      fontSize: '52px',
      color: '#d07818',
      stroke: '#fff8e0',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Layout: rows from top of panel, evenly spaced
    const contentTop = area.top + 130;
    const contentBottom = area.bottom - 100;
    const rowCount = 6;
    const rowH = (contentBottom - contentTop) / rowCount;

    // Row 1: Music
    this.buildVolumeRow(area.cx, contentTop + rowH * 0.5, 'MUSIC', this.save.settings.musicVolume, (v) => {
      this.save.settings.musicVolume = v;
      audio.setMusicVolume(v);
      writeSave(this.save, this.slot);
    });

    // Row 2: SFX
    this.buildVolumeRow(area.cx, contentTop + rowH * 1.5, 'SOUND FX', this.save.settings.sfxVolume, (v) => {
      this.save.settings.sfxVolume = v;
      audio.setSfxVolume(v);
      writeSave(this.save, this.slot);
    });

    // Row 3: Colorblind Mode
    const cbY = contentTop + rowH * 2.5;
    this.buildToggleRow(area.cx, cbY, 'COLORBLIND', this.save.settings.colorblindMode, (val) => {
      this.save.settings.colorblindMode = val;
      writeSave(this.save, this.slot);
      this.scene.restart();
    });

    // Row 4: Session Timer
    const stY = contentTop + rowH * 3.5;
    this.buildSessionTimerRow(area.cx, stY);

    const gradeNames = ['K', '1st', '2nd', '3rd', '4th', '5th'];
    const gradeY = contentTop + rowH * 4.5;
    this.add.text(area.cx - 320, gradeY, 'DIFFICULTY', {
      ...TEXT.heading(),
      fontSize: '32px',
      color: '#3a2410',
      stroke: '#fff8e0',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.gradeLabel = this.add.text(area.cx - 30, gradeY, gradeNames[this.save.grade ?? 3], {
      ...TEXT.heading(),
      fontSize: '30px',
      color: '#d07818',
    }).setOrigin(0.5, 0.5);
    PaperButton(this, area.cx + 100, gradeY, '-', {
      w: 52, h: 52, color: 0x4a6ca8, fontSize: 28,
      onClick: () => this.changeGrade(-1),
    });
    PaperButton(this, area.cx + 170, gradeY, '+', {
      w: 52, h: 52, color: 0x4a6ca8, fontSize: 28,
      onClick: () => this.changeGrade(1),
    });

    // Row 6: Stats + Reset
    const statsY = contentTop + rowH * 5.5;
    const s = this.save.stats;
    const accuracy = s.totalCorrect + s.totalWrong > 0
      ? Math.round((s.totalCorrect / (s.totalCorrect + s.totalWrong)) * 100)
      : 0;
    this.add.text(area.cx - 320, statsY - 22, 'STATS', {
      ...TEXT.heading(),
      fontSize: '32px',
      color: '#3a2410',
      stroke: '#fff8e0',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.add.text(area.cx + 60, statsY - 22,
      `${s.totalBattles} battles   ${s.totalCorrect} correct   ${this.save.gold} gold   ${accuracy}%`, {
      ...TEXT.body(),
      fontSize: '16px',
      color: '#6a4c28',
    }).setOrigin(0.5, 0.5);

    this.resetBtn = PaperButton(this, area.cx, statsY + 22, 'RESET ALL PROGRESS', {
      w: 360, h: 50, color: 0xc03020, fontSize: 16,
      onClick: () => this.onResetPressed(),
    });

    // Back button — bottom center of panel, always visible
    PaperButton(this, area.cx, area.bottom - 50, 'BACK', {
      w: 260, h: 64, color: 0x4aa848, fontSize: 24,
      onClick: () => transitionTo(this, this.returnScene, this.returnData ?? undefined, 200),
    });
  }

  buildVolumeRow(cx, y, label, current, onChange) {
    this.add.text(cx - 320, y, label, {
      ...TEXT.heading(),
      fontSize: '32px',
      color: '#3a2410',
      stroke: '#fff8e0',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0.5);

    const levels = [
      { label: 'OFF',  value: 0.0 },
      { label: 'LOW',  value: 0.3 },
      { label: 'MED',  value: 0.6 },
      { label: 'HIGH', value: 1.0 },
    ];

    levels.forEach((lvl, i) => {
      // Start buttons further right so the bigger labels don't overlap
      const btnX = cx - 40 + i * 115;
      const isActive = Math.abs(current - lvl.value) < 0.05;
      PaperButton(this, btnX, y, lvl.label, {
        w: 100, h: 46, color: isActive ? 0xd07818 : 0xc8b898, fontSize: 15,
        textColor: isActive ? '#fff8e0' : '#3a2410',
        onClick: () => {
          onChange(lvl.value);
          this.scene.restart();
        },
      });
    });
  }

  buildToggleRow(cx, y, label, current, onChange) {
    this.add.text(cx - 320, y, label, {
      ...TEXT.heading(),
      fontSize: '32px',
      color: '#3a2410',
      stroke: '#fff8e0',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0.5);

    const options = [
      { label: 'OFF', value: false },
      { label: 'ON',  value: true },
    ];

    options.forEach((opt, i) => {
      const btnX = cx - 40 + i * 115;
      const isActive = current === opt.value;
      PaperButton(this, btnX, y, opt.label, {
        w: 100, h: 46, color: isActive ? 0xd07818 : 0xc8b898, fontSize: 15,
        textColor: isActive ? '#fff8e0' : '#3a2410',
        onClick: () => {
          onChange(opt.value);
        },
      });
    });
  }

  buildSessionTimerRow(cx, y) {
    this.add.text(cx - 320, y, 'SESSION TIMER', {
      ...TEXT.heading(),
      fontSize: '28px',
      color: '#3a2410',
      stroke: '#fff8e0',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0.5);

    const options = [
      { label: 'OFF',    value: 0 },
      { label: '15 MIN', value: 15 },
      { label: '30 MIN', value: 30 },
      { label: '60 MIN', value: 60 },
    ];
    const current = this.save.settings.sessionTimer || 0;

    options.forEach((opt, i) => {
      const btnX = cx - 40 + i * 115;
      const isActive = current === opt.value;
      PaperButton(this, btnX, y, opt.label, {
        w: 100, h: 46, color: isActive ? 0xd07818 : 0xc8b898, fontSize: 13,
        textColor: isActive ? '#fff8e0' : '#3a2410',
        onClick: () => {
          this.save.settings.sessionTimer = opt.value;
          writeSave(this.save, this.slot);
          this.scene.restart();
        },
      });
    });
  }

  changeGrade(delta) {
    const gradeNames = ['K', '1st', '2nd', '3rd', '4th', '5th'];
    const current = this.save.grade ?? 3;
    const next = Math.max(0, Math.min(5, current + delta));
    if (next === current) return;
    this.save.grade = next;
    writeSave(this.save, this.slot);
    this.gradeLabel.setText(gradeNames[next]);
    audio.play('ui/click');
  }

  onResetPressed() {
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      this.showFlash('Tap again to confirm RESET.');
      this.time.delayedCall(3000, () => {
        this.confirmingReset = false;
      });
      return;
    }
    clearSave(this.slot);
    transitionTo(this, SCENES.TITLE);
  }

  showFlash(message) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 180, message, {
      ...TEXT.body(),
      fontSize: '20px',
      color: '#c02820',
      backgroundColor: '#fff8e0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2000,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }
}
