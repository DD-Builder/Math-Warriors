import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { DialogueOverlay } from '../ui/DialogueOverlay.js';
import { DIALOGUE } from '../data/dialogue.js';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.ENDING });
  }

  create() {
    fadeInScene(this, 600);
    audio.playMusic('music/title');

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const save = loadSave(getActiveSlot(this));

    drawPapercutBackground(this, 9, GAME_WIDTH, GAME_HEIGHT, 9999);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.3);

    const titleY = area.top + 160;
    this.add.text(area.cx, titleY, 'THE END', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '80px',
      color: '#f0d040',
      stroke: '#3a1808',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(area.cx, titleY + 70, 'The Great Equation is restored!', {
      ...TEXT.heading(),
      fontSize: '28px',
      color: '#f0e4cc',
      stroke: '#1a0e04',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Stats panel and buttons — hidden initially if epilogue exists
    const hasEpilogue = DIALOGUE.game_ending && DIALOGUE.game_ending.length > 0;

    const statsY = area.cy + 20;
    const statsPanel = PaperPanel(this, area.cx, statsY, 600, 260, {
      color: 0x1a0e04, alpha: 0.85, radius: 20,
    });

    const statsTitle = this.add.text(area.cx, statsY - 100, 'YOUR ADVENTURE', {
      ...TEXT.heading(),
      fontSize: '24px',
      color: '#f0d040',
    }).setOrigin(0.5);

    const s = save.stats;
    const accuracy = s.totalCorrect + s.totalWrong > 0
      ? Math.round((s.totalCorrect / (s.totalCorrect + s.totalWrong)) * 100)
      : 0;
    const lines = [
      `Battles Won: ${s.totalBattles}`,
      `Questions Correct: ${s.totalCorrect}`,
      `Best Streak: ${s.bestStreak}`,
      `Gold Earned: ${s.totalGold || save.gold}`,
      `Accuracy: ${accuracy}%`,
    ];
    const statTexts = lines.map((line, i) =>
      this.add.text(area.cx, statsY - 50 + i * 36, line, {
        ...TEXT.body(),
        fontSize: '22px',
        color: '#f0e4cc',
      }).setOrigin(0.5)
    );

    const allFloorsComplete = (save.floors || []).filter(f => f && f.complete).length >= 9;
    const btnY = allFloorsComplete ? area.bottom - 50 : area.bottom - 60;

    const buttons = [];
    if (allFloorsComplete) {
      buttons.push(PaperButton(this, area.cx, btnY - 80, 'BOSS RUSH', {
        w: 300, h: 70, color: 0xc83030, fontSize: 26,
        textColor: '#fff8e0',
        onClick: () => {
          audio.play('ui/confirm');
          transitionTo(this, SCENES.BOSS_RUSH, undefined, 400);
        },
      }));
    }

    buttons.push(PaperButton(this, area.cx, btnY, 'PLAY AGAIN', {
      w: 300, h: 70, color: 0xd07818, fontSize: 26,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.TITLE, undefined, 400);
      },
    }));

    // Hide stats elements if epilogue will play first
    const statsElements = [statsPanel, statsTitle, ...statTexts, ...buttons].flat();
    if (hasEpilogue) {
      statsElements.forEach(el => {
        if (el && el.setAlpha) el.setAlpha(0);
      });
    }

    // Sparkle particles
    for (let i = 0; i < 30; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.random() * GAME_HEIGHT;
      const star = this.add.circle(sx, sy, 2 + Math.random() * 3, 0xf0d040, 0.6);
      this.tweens.add({
        targets: star,
        alpha: 0,
        y: sy - 100 - Math.random() * 200,
        duration: 2000 + Math.random() * 3000,
        delay: Math.random() * 2000,
        repeat: -1,
        onRepeat: () => {
          star.setPosition(Math.random() * GAME_WIDTH, GAME_HEIGHT + 20);
          star.setAlpha(0.6);
        },
      });
    }

    // Show epilogue dialogue, then reveal stats
    if (hasEpilogue) {
      const dialogue = new DialogueOverlay(this);
      dialogue.show(DIALOGUE.game_ending).then(() => {
        statsElements.forEach(el => {
          if (el && el.setAlpha) {
            this.tweens.add({ targets: el, alpha: 1, duration: 600 });
          }
        });
      });
    }
  }
}
