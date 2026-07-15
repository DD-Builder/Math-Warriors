import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { getAllMastery, getMasteryColor, getMasteryLabel, getPracticeRecommendation, getSkillHintStats } from '../systems/mastery.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class MasteryScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.MASTERY });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    fadeInScene(this);
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    const slot = getActiveSlot(this);
    const save = loadSave(slot);
    const skills = getAllMastery(save);

    this.add.text(area.cx, area.top + 50, 'SKILL MASTERY', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '44px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 100, 'Track your math skills — answer questions to level up!', {
      ...TEXT.body(), fontSize: '18px', color: PAPER_CSS.cream,
    }).setOrigin(0.5);

    // Upgrade 5: point the child at the skill that most needs practice.
    const rec = getPracticeRecommendation(save);
    if (rec) {
      this.add.text(area.cx, area.top + 132, `⭐ Focus on: ${rec.label} — a little practice goes a long way!`, {
        ...TEXT.body(), fontSize: '18px', color: PAPER_CSS.goldL,
      }).setOrigin(0.5);
    }

    const cols = 4;
    const cardW = 300;
    const cardH = 200;
    const gap = 20;
    const gridW = cols * cardW + (cols - 1) * gap;
    const startX = area.cx - gridW / 2 + cardW / 2;
    const startY = area.top + 160;

    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap);
      const cy = startY + row * (cardH + gap) + cardH / 2;

      const color = getMasteryColor(s.level);
      const levelLabel = getMasteryLabel(s.level);

      const panel = PaperPanel(this, cx, cy, cardW, cardH, {
        color: PAPER.cream, alpha: 0.92, radius: 16,
      });

      // Gold border on mastered domains
      if (levelLabel === 'MASTERED') {
        const borderGfx = this.add.graphics();
        borderGfx.lineStyle(4, PAPER.gold, 1);
        borderGfx.strokeRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 2, cardW - 4, cardH - 4, 14);
      }

      const iconLabels = {
        '+': '+', '-': '−', '*': '×', '/': '÷',
        frac: '#', geo: '△', money: '$', word: 'Aa',
      };

      this.add.text(cx, cy - 60, iconLabels[s.id] || '?', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '40px', color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      this.add.text(cx, cy - 25, s.label, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '20px', color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      this.add.text(cx, cy + 5, `Standard: ${s.standard}`, {
        ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      const barW = 220;
      const barH = 18;
      const barX = cx - barW / 2;
      const barY = cy + 28;
      const gfx = this.add.graphics();
      gfx.fillStyle(PAPER.inkTeal, 0.3);
      gfx.fillRoundedRect(barX, barY, barW, barH, 6);
      const pct = s.total >= 10 ? s.accuracy : 0;
      if (pct > 0) {
        gfx.fillStyle(color, 1);
        gfx.fillRoundedRect(barX, barY, barW * pct, barH, 6);
      }

      const accText = s.total >= 10 ? `${Math.round(s.accuracy * 100)}%` : `${s.total}/10`;
      this.add.text(cx, barY + barH / 2, accText, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '16px', color: PAPER_CSS.cream,
        stroke: PAPER_CSS.inkTeal, strokeThickness: 2,
      }).setOrigin(0.5);

      const badge = this.add.graphics();
      badge.fillStyle(color, 1);
      badge.fillRoundedRect(cx - 50, cy + 56, 100, 24, 8);
      this.add.text(cx, cy + 68, levelLabel, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '16px', color: PAPER_CSS.cream,
      }).setOrigin(0.5);

      this.add.text(cx, cy + 88, `${s.total} questions`, {
        ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      const hintStats = getSkillHintStats(save, s.id);
      if (hintStats.hints > 0) {
        this.add.text(cx, cy + 106, `Hints used: ${hintStats.hints}`, {
          ...TEXT.stat(), fontSize: '13px', color: PAPER_CSS.sand,
        }).setOrigin(0.5);
      }
    }

    PaperButton(this, area.cx, area.bottom - 30, 'BACK', {
      w: 200, h: 60, color: PAPER.teal, fontSize: 22,
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.WORLD_MAP, undefined, 200);
      },
    });
  }
}
