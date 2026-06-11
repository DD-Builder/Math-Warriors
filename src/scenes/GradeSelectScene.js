import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperCard, PaperButton, PaperPanel, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { scatterPapercutDecor } from '../ui/titleArt.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawShadowBox } from '../systems/papercutArt.js';

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

    // ── SHADOW-BOX FRAME (v2 papercut aesthetic) ──
    const frameGfx = this.add.graphics().setDepth(1);
    drawShadowBox(frameGfx, area.cx, area.cy, area.w - 40, area.h - 40, { layers: 4 });

    // Cream paper panel centered in safe area
    PaperPanel(this, area.cx, area.cy, area.w, area.h, {
      color: PAPER.cream, alpha: 1.0, radius: 32,
    });

    // Header — inside safe area top
    this.add.text(area.cx, area.top + 60, 'CHOOSE YOUR GRADE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '52px',
      color: PAPER_CSS.orange,
      stroke: PAPER_CSS.cream,
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 120, 'This sets how hard the math will be.', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);

    // RAINBOW distinct colors — 6 truly different hues
    const grades = [
      { id: 0, label: 'K', name: 'Kindergarten', hint: 'Count the flowers in the\nmagical garden!',           color: PAPER.coralD },
      { id: 1, label: '1', name: '1st Grade',    hint: 'Add and subtract to\nsave the kingdom!',  color: PAPER.orange },
      { id: 2, label: '2', name: '2nd Grade',    hint: 'Help warriors solve\ntricky puzzles!', color: PAPER.gold },
      { id: 3, label: '3', name: '3rd Grade',    hint: 'Multiply your power\nagainst the bosses!',       color: PAPER.forest },
      { id: 4, label: '4', name: '4th Grade',    hint: 'Divide and conquer\nthe crystal caves!',        color: PAPER.teal },
      { id: 5, label: '5', name: '5th Grade',    hint: 'Master fractions,\ngeometry, and more!',    color: PAPER.lavender },
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

      this.add.text(x, y - 35, g.label, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '80px',
        color: PAPER_CSS.cream,
        stroke: PAPER_CSS.inkTeal,
        strokeThickness: 7,
      }).setOrigin(0.5);

      this.add.text(x, y + 40, g.name, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px',
        color: PAPER_CSS.cream,
      }).setOrigin(0.5);

      this.add.text(x, y + 70, g.hint, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: PAPER_CSS.cream,
        align: 'center',
        wordWrap: { width: cardW - 30 },
      }).setOrigin(0.5);

      card.zone.on('pointerdown', () => {
        audio.play('ui/click');
        this.selectGrade(g.id);
      });

      this.gradeCards[g.id] = { card, x, y, w: cardW, h: cardH, color: g.color, seed };
    });

    // CONFIRM button — LOCKED into safe area bottom
    PaperButton(this, area.cx, area.bottom - confirmBtnH / 2, 'CONFIRM', {
      w: 380, h: confirmBtnH, color: PAPER.forest, fontSize: 30,
      onClick: () => transitionTo(this, SCENES.PARTY_SELECT, { grade: this.selectedGrade }),
    });
  }

  selectGrade(id) {
    this.selectedGrade = id;

    // Clean up old selection indicators
    if (this._selectionGfx) this._selectionGfx.destroy();
    if (this._checkGfx) this._checkGfx.destroy();
    if (this._checkText) this._checkText.destroy();
    this._selectionGfx = null;
    this._checkGfx = null;
    this._checkText = null;

    for (const [gid, entry] of Object.entries(this.gradeCards)) {
      const isSelected = Number(gid) === id;
      const { x, y, w, h, color, seed } = entry;

      paintPaperRect(entry.card.bg, entry.card.shadow, x, y, w, h, color, {
        radius: 12,
        shadowOff: isSelected ? 3 : 5,
        shadowAlpha: isSelected ? 0.5 : 0.25,
        strokeColor: isSelected ? PAPER.gold : PAPER.shadow,
        strokeAlpha: isSelected ? 1.0 : 0.15,
        strokeWidth: isSelected ? 6 : 2,
        organic: true,
        seed,
      });

      // Dim unselected cards
      if (entry.card.bg) entry.card.bg.setAlpha(isSelected ? 1.0 : 0.65);

      if (isSelected) {
        // Gold checkmark circle inside the card's top-right
        const ckX = x + w / 2 - 22;
        const ckY = y - h / 2 + 22;
        this._checkGfx = this.add.graphics();
        this._checkGfx.fillStyle(PAPER.gold, 1);
        this._checkGfx.fillCircle(ckX, ckY, 16);
        this._checkGfx.lineStyle(3, PAPER.inkTeal, 1);
        this._checkGfx.strokeCircle(ckX, ckY, 16);
        this._checkText = this.add.text(ckX, ckY, '✓', {
          fontFamily: '"Fredoka One", sans-serif',
          fontSize: '20px',
          color: PAPER_CSS.inkTeal,
        }).setOrigin(0.5);
      }
    }
  }
}
