import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { getAllMastery, getMasteryColor, getMasteryLabel } from '../systems/mastery.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

/**
 * ProgressScene (Upgrade 6) — the parent/teacher dashboard.
 *
 * A clear, standards-tagged view of what the child has mastered and what
 * needs work: per-skill mastery with the Common Core standard, overall
 * accuracy, questions answered, time on task, and floors completed. This
 * is the artifact that makes a parent or teacher trust — and choose —
 * the game. Gated behind a "grown-ups only" multiplication check so a
 * child can't wander in and reset things.
 */
export class ProgressScene extends Phaser.Scene {
  constructor() { super({ key: SCENES.PROGRESS }); }

  init(data) { this.returnScene = data?.returnScene ?? SCENES.SETTINGS; this.returnData = data?.returnData; }

  create() {
    this.area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    fadeInScene(this);
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 654);
    this.save = loadSave(getActiveSlot(this));
    this.showGate();
  }

  // ── Grown-ups gate ──────────────────────────────────────────────
  showGate() {
    const area = this.area;
    this.gateObjs = [];
    const panel = PaperPanel(this, area.cx, area.cy, 620, 360, { color: PAPER.cream, alpha: 1.0, radius: 28 });
    this.gateObjs.push(panel.bg, panel.shadow);
    const t = this.add.text(area.cx, area.cy - 130, 'GROWN-UPS ONLY', {
      ...TEXT.heading(), fontSize: '34px', color: PAPER_CSS.orange,
    }).setOrigin(0.5);
    // Two 2-digit numbers so it's easy for an adult, hard for a young kid.
    const a = 7 + Math.floor(Math.random() * 6);   // 7..12
    const b = 6 + Math.floor(Math.random() * 7);    // 6..12
    this._gateAnswer = a * b;
    const q = this.add.text(area.cx, area.cy - 60, `What is ${a} × ${b}?`, {
      ...TEXT.body(), fontSize: '30px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);
    this.gateObjs.push(t, q);
    // four choices, one correct
    const choices = new Set([this._gateAnswer]);
    while (choices.size < 4) choices.add(this._gateAnswer + (Math.floor(Math.random() * 21) - 10));
    const arr = [...choices].sort(() => Math.random() - 0.5);
    arr.forEach((c, i) => {
      const bx = area.cx - 210 + (i % 2) * 280;
      const by = area.cy + 20 + Math.floor(i / 2) * 80;
      const btn = PaperButton(this, bx, by, String(c), {
        w: 240, h: 64, color: PAPER.teal, fontSize: 28,
        onClick: () => {
          if (c === this._gateAnswer) { audio.play('battle/correct'); this.gateObjs.forEach(o => o.destroy && o.destroy()); this.showDashboard(); }
          else { audio.play('battle/wrong'); }
        },
      });
      this.gateObjs.push(btn.bg, btn.shadow, btn.label, btn.zone);
    });
    const back = PaperButton(this, area.cx, area.bottom - 50, 'BACK', {
      w: 200, h: 56, color: PAPER.sand, fontSize: 22, textColor: PAPER_CSS.inkTeal,
      onClick: () => transitionTo(this, this.returnScene, this.returnData ?? undefined, 200),
    });
    this.gateObjs.push(back.bg, back.shadow, back.label, back.zone);
  }

  // ── Dashboard ───────────────────────────────────────────────────
  showDashboard() {
    const area = this.area;
    PaperPanel(this, area.cx, area.cy, area.w, area.h, { color: PAPER.cream, alpha: 1.0, radius: 28 });
    this.add.text(area.cx, area.top + 42, 'PROGRESS REPORT', {
      ...TEXT.heading(), fontSize: '40px', color: PAPER_CSS.orange, stroke: PAPER_CSS.cream, strokeThickness: 5,
    }).setOrigin(0.5);

    const s = this.save.stats || {};
    const total = (s.totalCorrect || 0) + (s.totalWrong || 0);
    const acc = total > 0 ? Math.round((s.totalCorrect / total) * 100) : 0;
    const mins = Math.round((s.playTimeSec || 0) / 60);
    const floorsDone = (this.save.floors || []).filter(f => f && f.complete).length;

    this.add.text(area.cx, area.top + 82,
      `Questions: ${total}    Accuracy: ${acc}%    Time on task: ${mins} min    Floors cleared: ${floorsDone}/9`, {
      ...TEXT.body(), fontSize: '20px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);

    // Per-skill mastery rows, standards-tagged
    const skills = getAllMastery(this.save);
    const rowH = 52;
    const startY = area.top + 140;
    const leftX = area.cx - 460;
    skills.forEach((sk, i) => {
      const y = startY + i * rowH;
      const color = getMasteryColor(sk.level);
      // skill + standard
      this.add.text(leftX, y, sk.label, { ...TEXT.body(), fontSize: '22px', color: PAPER_CSS.inkTeal }).setOrigin(0, 0.5);
      this.add.text(leftX + 220, y, sk.standard, { ...TEXT.body(), fontSize: '16px', color: PAPER_CSS.forestD }).setOrigin(0, 0.5);
      // accuracy bar
      const barX = leftX + 340, barW = 360;
      this.add.rectangle(barX, y, barW, 18, PAPER.shadow, 0.18).setOrigin(0, 0.5);
      const pct = sk.total >= 3 ? sk.accuracy : 0;
      this.add.rectangle(barX, y, Math.max(4, barW * pct), 18, color, 1).setOrigin(0, 0.5);
      // level badge
      const label = sk.total < 3 ? 'NOT STARTED' : getMasteryLabel(sk.level);
      this.add.text(barX + barW + 20, y, label, { ...TEXT.body(), fontSize: '15px', color: `#${color.toString(16).padStart(6, '0')}` }).setOrigin(0, 0.5);
    });

    PaperButton(this, area.cx, area.bottom - 46, 'BACK', {
      w: 220, h: 58, color: PAPER.forest, fontSize: 24,
      onClick: () => transitionTo(this, this.returnScene, this.returnData ?? undefined, 200),
    });
  }
}
