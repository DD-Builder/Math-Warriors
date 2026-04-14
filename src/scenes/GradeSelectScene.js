import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperCard, PaperButton, PaperPanel, TEXT, safeArea } from '../ui/paperUI.js';

/**
 * GradeSelectScene — K–5 picker. Bright cheerful paper cards.
 */
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

    // Bright background
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 777);

    // Cream paper backdrop
    PaperPanel(this, area.cx, area.cy, area.w - 20, area.h - 20, {
      color: 0xfff8e8,
      alpha: 0.92,
      radius: 28,
    });

    // Header
    this.add.text(area.cx, area.top + 70, 'CHOOSE YOUR GRADE', {
      ...TEXT.title(),
      fontSize: '52px',
      color: '#d07818',
      stroke: '#fff8e0',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 130, 'This sets how hard the math problems will be.', {
      ...TEXT.body(),
      fontSize: '20px',
      color: '#5a3820',
    }).setOrigin(0.5);

    // Grade cards — 3x2 grid, centered
    const grades = [
      { id: 0, label: 'K', name: 'Kindergarten', hint: 'Counting + small sums',  color: 0x5ab048 },
      { id: 1, label: '1', name: '1st Grade',    hint: 'Add + subtract to 10',   color: 0x60c058 },
      { id: 2, label: '2', name: '2nd Grade',    hint: 'Intro multiplication',   color: 0x80b830 },
      { id: 3, label: '3', name: '3rd Grade',    hint: 'Times tables',           color: 0x4a80d0 },
      { id: 4, label: '4', name: '4th Grade',    hint: 'Multi-digit math',       color: 0x9050c8 },
      { id: 5, label: '5', name: '5th Grade',    hint: 'Full arithmetic',        color: 0xe04878 },
    ];

    const cols = 3, rows = 2;
    const cardW = 250;
    const cardH = 230;
    const gapX = 30;
    const gapY = 30;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const gridH = rows * cardH + (rows - 1) * gapY;
    const startX = area.cx - gridW / 2 + cardW / 2;
    const startY = area.cy - gridH / 2 + cardH / 2 + 20;

    this.gradeCards = {};
    grades.forEach((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      const isSelected = g.id === this.selectedGrade;
      const card = PaperCard(this, x, y, cardW, cardH, g.color, { selected: isSelected });

      const bigLabel = this.add.text(x, y - 40, g.label, {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '88px',
        color: '#fff8e0',
        stroke: '#1a0e04',
        strokeThickness: 6,
      }).setOrigin(0.5);

      const nameLabel = this.add.text(x, y + 40, g.name, {
        ...TEXT.body(),
        fontSize: '18px',
        color: '#fff8e0',
      }).setOrigin(0.5);

      const hintLabel = this.add.text(x, y + 75, g.hint, {
        ...TEXT.small(),
        fontSize: '14px',
        color: '#fff8e0',
        align: 'center',
        wordWrap: { width: cardW - 30 },
      }).setOrigin(0.5);

      card.zone.on('pointerdown', () => {
        audio.play('ui/click');
        this.selectGrade(g.id);
      });

      this.gradeCards[g.id] = { card, bigLabel, nameLabel, hintLabel, x, y, w: cardW, h: cardH, color: g.color };
    });

    // Confirm button — bottom center, inside safe area
    PaperButton(this, area.cx, area.bottom - 50, 'CONFIRM', {
      w: 360, h: 72, color: 0xe84840, fontSize: 28,
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
    // Re-render cards to show new selection state
    for (const [gid, entry] of Object.entries(this.gradeCards)) {
      const isSelected = Number(gid) === id;
      entry.card.bg.clear();
      entry.card.shadow.clear();
      // redraw both layers
      const { x, y, w, h, color } = entry;
      const radius = 12;
      const shadowOff = isSelected ? 3 : 5;
      const shadowAlpha = isSelected ? 0.4 : 0.25;
      entry.card.shadow.fillStyle(0x000000, shadowAlpha);
      entry.card.shadow.fillRoundedRect(x - w / 2 + shadowOff, y - h / 2 + shadowOff, w, h, radius);
      entry.card.bg.fillStyle(color, 1);
      entry.card.bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
      entry.card.bg.lineStyle(isSelected ? 5 : 2, isSelected ? 0xf0c040 : 0x000000, isSelected ? 0.9 : 0.15);
      entry.card.bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
    }
  }
}
