import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, safeArea } from '../ui/paperUI.js';
import { scatterPapercutDecor } from '../ui/titleArt.js';
import { fadeInScene, transitionTo } from '../ui/sceneHelpers.js';
import { generateRatedQuestion, opSymbol } from '../systems/math.js';
import { PLACEMENT_PROBES, scorePlacement, applyPlacement } from '../systems/placement.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { confettiBurst } from '../ui/celebrations.js';

/**
 * PlacementScene (Upgrade 4)
 *
 * A short, friendly warm-up that places the child at the right level
 * instead of a parent guessing a grade. Eight quick questions probe the
 * core operators at escalating difficulty; the result seeds the starting
 * grade and every skill's adaptive level. Fully skippable.
 */
export class PlacementScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.PLACEMENT });
  }

  init(data) {
    this.returnScene = data?.returnScene || null;
    this.idx = 0;
    this.responses = [];
    this.locked = false;
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.area = area;
    fadeInScene(this);
    audio.playMusic('music/title');
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 321);
    scatterPapercutDecor(this, GAME_WIDTH, GAME_HEIGHT, { seed: 33, theme: 'garden' });

    PaperPanel(this, area.cx, area.cy, area.w, area.h, { color: PAPER.cream, alpha: 1.0, radius: 32 });

    this.add.text(area.cx, area.top + 50, 'WARM-UP', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '48px',
      color: PAPER_CSS.orange, stroke: PAPER_CSS.cream, strokeThickness: 6,
    }).setOrigin(0.5);
    this.subtitle = this.add.text(area.cx, area.top + 108, "Let's find your just-right level!", {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '22px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);

    this.dots = [];
    const n = PLACEMENT_PROBES.length;
    const dotGap = 30, dotY = area.top + 150;
    const dotStart = area.cx - (n - 1) * dotGap / 2;
    for (let i = 0; i < n; i++) this.dots.push(this.add.circle(dotStart + i * dotGap, dotY, 7, PAPER.shadow, 0.25));

    this.qText = this.add.text(area.cx, area.cy - 40, '', {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '56px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);

    this.answerBtns = [];
    const bw = 220, bh = 74, gx = 40, gy = 24;
    const colors = [PAPER.teal, PAPER.coralD, PAPER.forest, PAPER.lavender];
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = area.cx + (col === 0 ? -(bw / 2 + gx / 2) : (bw / 2 + gx / 2));
      const y = area.cy + 70 + row * (bh + gy);
      this.answerBtns.push(PaperButton(this, x, y, '', { w: bw, h: bh, color: colors[i], fontSize: 34, onClick: () => this.choose(i) }));
    }

    PaperButton(this, area.cx, area.bottom - 40, 'Skip — pick a grade instead', {
      w: 380, h: 52, color: PAPER.sand, fontSize: 18, textColor: PAPER_CSS.inkTeal,
      onClick: () => { audio.play('ui/back'); transitionTo(this, SCENES.GRADE_SELECT); },
    });

    this.showProbe();
  }

  showProbe() {
    const probe = PLACEMENT_PROBES[this.idx];
    this.currentQ = generateRatedQuestion({ operator: probe.skill, grade: probe.grade, floor: 0 });
    const q = this.currentQ;
    this.qText.setText(`${q.a} ${opSymbol(q.op)} ${q.b} = ?`);
    q.choices.forEach((c, i) => this.answerBtns[i].label.setText(String(c)));
    this.locked = false;
  }

  choose(i) {
    if (this.locked) return;
    this.locked = true;
    const q = this.currentQ;
    const correct = i === q.correctIndex;
    const probe = PLACEMENT_PROBES[this.idx];
    this.responses.push({ skill: probe.skill, grade: probe.grade, correct });
    audio.play(correct ? 'battle/correct' : 'battle/wrong');
    this.dots[this.idx].setFillStyle(correct ? 0x40a040 : 0xd08040, 1);

    this.idx++;
    if (this.idx >= PLACEMENT_PROBES.length) this.time.delayedCall(350, () => this.finish());
    else this.time.delayedCall(300, () => this.showProbe());
  }

  finish() {
    const result = scorePlacement(this.responses);
    const slot = getActiveSlot(this);
    const save = loadSave(slot);
    applyPlacement(save, result);
    writeSave(save, slot);

    const gradeNames = ['Kindergarten', '1st', '2nd', '3rd', '4th', '5th'];
    this.subtitle.setText(`Great! Starting you at ${gradeNames[result.grade]} level.`);
    this.qText.setText('★');
    if (!save.settings?.reducedMotion) confettiBurst(this, this.area.cx, this.area.cy - 20, 26);
    this.answerBtns.forEach(b => { b.bg.setVisible(false); b.shadow.setVisible(false); b.label.setVisible(false); b.zone.setVisible(false); });

    this.time.delayedCall(1200, () => {
      if (this.returnScene) transitionTo(this, this.returnScene);
      else transitionTo(this, SCENES.PARTY_SELECT, { grade: result.grade });
    });
  }
}
