import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperCard, PaperButton, PaperPanel, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { scatterPapercutDecor } from '../ui/titleArt.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class GradeSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.GRADE_SELECT });
  }

  init() {
    this.selectedGrade = 3;
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    fadeInScene(this);
    audio.playMusic('music/title');

    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 777);
    scatterPapercutDecor(this, GAME_WIDTH, GAME_HEIGHT, { seed: 12, theme: 'garden' });

    // Cream paper panel centered in safe area
    PaperPanel(this, area.cx, area.cy, area.w, area.h, {
      color: 0xffffff, alpha: 1.0, radius: 32,
    });

    // Header — inside safe area top
    this.add.text(area.cx, area.top + 60, 'CHOOSE YOUR GRADE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '52px',
      color: '#d07818',
      stroke: '#fff8e0',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 120, 'This sets how hard the math will be.', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: '#5a3820',
    }).setOrigin(0.5);

    // RAINBOW distinct colors — 6 truly different hues
    const grades = [
      { id: 0, label: 'K', name: 'Kindergarten', hint: 'Count the flowers in the magical garden!',     color: 0xe84840 }, // red
      { id: 1, label: '1', name: '1st Grade',    hint: 'Add and subtract to save the kingdom!',        color: 0xf58840 }, // orange
      { id: 2, label: '2', name: '2nd Grade',    hint: 'Help warriors solve tricky puzzles!',          color: 0xf0c040 }, // yellow
      { id: 3, label: '3', name: '3rd Grade',    hint: 'Multiply your power against the bosses!',      color: 0x4aa848 }, // green
      { id: 4, label: '4', name: '4th Grade',    hint: 'Divide and conquer the crystal caves!',        color: 0x3888d8 }, // blue
      { id: 5, label: '5', name: '5th Grade',    hint: 'Master fractions, geometry, and more!',        color: 0x9050c8 }, // purple
    ];

    // Grid: 3x2, centered vertically between header and CONFIRM button
    const cols = 3, rows = 2;
    const cardW = 240;
    const cardH = 220;
    const gapX = 30, gapY = 30;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const gridH = rows * cardH + (rows - 1) * gapY;

    // Reserve space for CONFIRM at the bottom (button height + padding)
    const confirmBtnH = 78;
    const confirmReserve = confirmBtnH + 40;
    const gridCenterY = area.top + 180 + (area.h - 180 - confirmReserve) / 2;
    const startX = area.cx - gridW / 2 + cardW / 2;
    const startY = gridCenterY - gridH / 2 + cardH / 2;

    this.gradeCards = {};
    grades.forEach((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      const isSelected = g.id === this.selectedGrade;
      // Fixed seed per card so the hand-cut shape stays identical across
      // selection changes. Math.round(x*1000+y) would drift on redraw.
      const seed = 500 + g.id * 97;
      const card = PaperCard(this, x, y, cardW, cardH, g.color, {
        selected: isSelected, seed,
      });

      // Gold glow behind selected card
      const glow = this.add.rectangle(x, y, cardW + 16, cardH + 16, 0xf0d060, isSelected ? 0.2 : 0)
        .setDepth(card.bg.depth - 2);

      const gradeLabel = this.add.text(x, y - 35, g.label, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '80px',
        color: '#fff8e0',
        stroke: '#1a0e04',
        strokeThickness: 7,
      }).setOrigin(0.5);

      const nameLabel = this.add.text(x, y + 40, g.name, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px',
        color: '#fff8e0',
      }).setOrigin(0.5);

      const hintLabel = this.add.text(x, y + 70, g.hint, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: '#fff8e0',
        align: 'center',
        wordWrap: { width: cardW - 30 },
      }).setOrigin(0.5);

      // Checkmark circle in top-right corner for selected card
      const checkCircle = this.add.circle(x + cardW / 2 - 20, y - cardH / 2 + 20, 18, 0xf0d060)
        .setDepth(card.bg.depth + 2).setVisible(isSelected);
      const checkMark = this.add.text(x + cardW / 2 - 20, y - cardH / 2 + 20, '✓', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(card.bg.depth + 3).setVisible(isSelected);

      // Apply initial visual state
      const cardContainer = [card.bg, card.shadow, card.zone, gradeLabel, nameLabel, hintLabel];
      if (!isSelected) {
        cardContainer.forEach(el => { if (el && el.setAlpha) el.setAlpha(0.7); });
      }

      card.zone.on('pointerdown', () => {
        audio.play('ui/click');
        this.selectGrade(g.id);
      });

      this.gradeCards[g.id] = {
        card, x, y, w: cardW, h: cardH, color: g.color, seed,
        glow, checkCircle, checkMark,
        cardElements: cardContainer,
      };
    });

    // CONFIRM button — LOCKED into safe area bottom
    PaperButton(this, area.cx, area.bottom - confirmBtnH / 2, 'CONFIRM', {
      w: 380, h: confirmBtnH, color: 0x4aa848, fontSize: 30,
      onClick: () => transitionTo(this, SCENES.PARTY_SELECT, { grade: this.selectedGrade }),
    });
  }

  selectGrade(id) {
    const prevId = this.selectedGrade;
    this.selectedGrade = id;
    for (const [gid, entry] of Object.entries(this.gradeCards)) {
      const isSelected = Number(gid) === id;
      const { x, y, w, h, color, seed, glow, checkCircle, checkMark, cardElements } = entry;

      // Re-paint with the same seed so the hand-cut wobble survives
      // the selection-state change.
      paintPaperRect(entry.card.bg, entry.card.shadow, x, y, w, h, color, {
        radius: 12,
        shadowOff: isSelected ? 3 : 5,
        shadowAlpha: isSelected ? 0.4 : 0.25,
        strokeColor: isSelected ? 0xf0d060 : 0x000000,
        strokeAlpha: isSelected ? 1.0 : 0.15,
        strokeWidth: isSelected ? 6 : 2,
        organic: true,
        seed,
      });

      // Gold glow behind selected card
      if (glow) glow.setAlpha(isSelected ? 0.2 : 0);

      // Checkmark visibility
      if (checkCircle) checkCircle.setVisible(isSelected);
      if (checkMark) checkMark.setVisible(isSelected);

      // Scale animation: selected pops up, unselected shrinks back
      const targetScale = isSelected ? 1.08 : 1.0;
      const targetAlpha = isSelected ? 1.0 : 0.7;

      // Animate all card elements
      if (cardElements) {
        cardElements.forEach(el => {
          if (el && el.setAlpha) {
            this.tweens.add({
              targets: el,
              alpha: targetAlpha,
              duration: 200,
              ease: 'Cubic.out',
            });
          }
        });
      }

      // Scale the card bg and shadow
      for (const part of [entry.card.bg, entry.card.shadow]) {
        if (part) {
          this.tweens.add({
            targets: part,
            scaleX: targetScale,
            scaleY: targetScale,
            duration: 200,
            ease: 'Back.out',
          });
        }
      }
    }
  }
}
