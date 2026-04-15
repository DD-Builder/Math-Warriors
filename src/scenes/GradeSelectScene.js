import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperCard, PaperButton, PaperPanel, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { scatterPapercutDecor } from '../ui/titleArt.js';

export class GradeSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.GRADE_SELECT });
  }

  init() {
    this.selectedGrade = 3;
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(0x000000);
    audio.playMusic('music/title');

    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 777);
    scatterPapercutDecor(this, GAME_WIDTH, GAME_HEIGHT, { seed: 12, theme: 'garden' });

    // Cream paper panel centered in safe area
    PaperPanel(this, area.cx, area.cy, area.w, area.h, {
      color: 0xfff8e8, alpha: 0.94, radius: 32,
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
      { id: 0, label: 'K', name: 'Kindergarten', hint: 'Counting',           color: 0xe84840 }, // red
      { id: 1, label: '1', name: '1st Grade',    hint: 'Add + subtract 10',  color: 0xf58840 }, // orange
      { id: 2, label: '2', name: '2nd Grade',    hint: 'Intro multiplication', color: 0xf0c040 }, // yellow
      { id: 3, label: '3', name: '3rd Grade',    hint: 'Times tables',       color: 0x4aa848 }, // green
      { id: 4, label: '4', name: '4th Grade',    hint: 'Multi-digit',        color: 0x3888d8 }, // blue
      { id: 5, label: '5', name: '5th Grade',    hint: 'Full arithmetic',    color: 0x9050c8 }, // purple
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
        color: '#fff8e0',
        stroke: '#1a0e04',
        strokeThickness: 7,
      }).setOrigin(0.5);

      this.add.text(x, y + 40, g.name, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px',
        color: '#fff8e0',
      }).setOrigin(0.5);

      this.add.text(x, y + 70, g.hint, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: '#fff8e0',
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
      w: 380, h: confirmBtnH, color: 0x4aa848, fontSize: 30,
      onClick: () => {
        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(SCENES.PARTY_SELECT, { grade: this.selectedGrade });
        });
      },
    });
  }

  selectGrade(id) {
    this.selectedGrade = id;
    for (const [gid, entry] of Object.entries(this.gradeCards)) {
      const isSelected = Number(gid) === id;
      const { x, y, w, h, color, seed } = entry;
      // Re-paint using the SAME organic polygon algorithm (same seed)
      // so the hand-cut wobble is preserved. Previously this redraw used
      // fillRoundedRect which reverted the papercut aesthetic to plain
      // computer rectangles whenever the user tapped a card.
      paintPaperRect(entry.card.bg, entry.card.shadow, x, y, w, h, color, {
        radius: 12,
        shadowOff: isSelected ? 3 : 5,
        shadowAlpha: isSelected ? 0.4 : 0.25,
        strokeColor: isSelected ? COLORS.goldL : 0x000000,
        strokeAlpha: isSelected ? 0.9 : 0.15,
        strokeWidth: isSelected ? 4 : 2,
        organic: true,
        seed,
      });
    }
  }
}
