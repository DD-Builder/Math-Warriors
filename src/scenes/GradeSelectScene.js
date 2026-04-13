import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { audio } from '../systems/audio.js';

/**
 * GradeSelectScene
 *
 * K–5 picker that drives question difficulty for the entire game.
 * Per Design Principle #6 (Confidence first, challenge second): the
 * biggest impact on learning comes from matching difficulty to skill.
 *
 * Flow: Title (new game) → GradeSelect → PartySelect → WorldMap
 *
 * v0.6 scope:
 *   - 6 big tappable grade buttons (K, 1, 2, 3, 4, 5)
 *   - Each button shows the grade and a short "what you'll see" hint
 *   - Default grade pre-selected (3rd)
 *   - Confirm button advances to party select with the chosen grade
 */
export class GradeSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.GRADE_SELECT });
  }

  init() {
    this.selectedGrade = 3;
  }

  create() {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(COLORS.bg);
    audio.playMusic('music/title');

    this.buildBackground();
    this.buildHeader();
    this.buildGradeGrid();
    this.buildConfirmButton();
  }

  buildBackground() {
    // Subtle vignette glow
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const glow = this.add.graphics();
    glow.fillStyle(0x2a1c08, 0.4);
    glow.fillCircle(cx, cy, 800);
    glow.fillStyle(0x4a2c10, 0.25);
    glow.fillCircle(cx, cy, 500);

    // Faint grid
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x4a3420, 0.08);
    for (let x = 0; x < GAME_WIDTH; x += 80) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 80) grid.lineBetween(0, y, GAME_WIDTH, y);
  }

  buildHeader() {
    this.add.text(GAME_WIDTH / 2, 80, 'CHOOSE YOUR GRADE', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '44px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 150, 'This sets how hard the math problems will be.\nYou can change it later from the menu.', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '24px',
      color: COLORS_CSS.paper,
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);
  }

  buildGradeGrid() {
    const grades = [
      { id: 0, label: 'K',   name: 'Kindergarten', hint: 'Counting + small sums',   color: 0x2a8848 },
      { id: 1, label: '1',   name: '1st Grade',    hint: 'Add + subtract to 10',   color: 0x48a030 },
      { id: 2, label: '2',   name: '2nd Grade',    hint: 'Intro multiplication',   color: 0x88a818 },
      { id: 3, label: '3',   name: '3rd Grade',    hint: 'Times tables',           color: 0x2e4e88 },
      { id: 4, label: '4',   name: '4th Grade',    hint: 'Multi-digit math',       color: 0x5a1878 },
      { id: 5, label: '5',   name: '5th Grade',    hint: 'Full arithmetic',        color: 0xc02860 },
    ];

    const cardW = 260;
    const cardH = 280;
    const gap = 30;
    const cols = 3;
    const rows = 2;
    const totalW = cols * cardW + (cols - 1) * gap;
    const totalH = rows * cardH + (rows - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalW / 2 + cardW / 2;
    const startY = GAME_HEIGHT / 2 - totalH / 2 + cardH / 2 + 30;

    this.gradeCards = {};

    grades.forEach((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      const bg = this.add.rectangle(x, y, cardW, cardH, g.color, 0.85)
        .setStrokeStyle(4, COLORS.ink)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(x, y - cardH * 0.22, g.label, {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '88px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 8,
      }).setOrigin(0.5);

      const name = this.add.text(x, y + cardH * 0.18, g.name.toUpperCase(), {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '16px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);

      const hint = this.add.text(x, y + cardH * 0.32, g.hint, {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '16px',
        color: COLORS_CSS.paper,
        align: 'center',
        wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        audio.play('ui/click');
        this.selectGrade(g.id);
      });

      this.gradeCards[g.id] = { bg, label, name, hint, baseColor: g.color };
    });

    this.highlightSelected();
  }

  selectGrade(id) {
    this.selectedGrade = id;
    this.highlightSelected();
  }

  highlightSelected() {
    for (const [id, card] of Object.entries(this.gradeCards)) {
      const isActive = Number(id) === this.selectedGrade;
      card.bg.setStrokeStyle(isActive ? 8 : 4, isActive ? COLORS.goldL : COLORS.ink);
      card.bg.fillAlpha = isActive ? 1 : 0.85;
    }
  }

  buildConfirmButton() {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 110;

    const bg = this.add.rectangle(x, y, 420, 84, COLORS.scarlet)
      .setStrokeStyle(4, COLORS.ink)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y, 'CONFIRM', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '28px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    bg.on('pointerdown', () => {
      audio.play('ui/confirm');
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.PARTY_SELECT, { grade: this.selectedGrade });
      });
    });
  }
}
