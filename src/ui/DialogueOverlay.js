/**
 * DialogueOverlay v2 — in-level story moments that respect the HUD.
 *
 * v1 was a bottom text band that sat exactly on the maze HUD (its TAP
 * button covered the WORLD MAP button) with no portraits and no depth.
 * v2 moves speech to a TOP-CENTER bubble with a tail, gives every
 * speaker a face (guideArt portrait chip), pins explicit depths above
 * everything in the maze, and renders short single-line beats as a
 * slim cinematic toast that dismisses itself — no button, no filler.
 *
 * API is unchanged: show(lines) → Promise resolved when finished;
 * hide(); .active. All maze input stays blocked while active.
 */

import { PaperButton, TEXT, safeArea } from './paperUI.js';
import { GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { drawGuidePortrait } from './guideArt.js';

const DEPTH = 500; // above every maze layer, fog included

export class DialogueOverlay {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.lines = [];
    this.lineIdx = 0;
    this.charIdx = 0;
    this.fullText = '';
    this.typing = false;
    this.resolve = null;
    this.timer = null;
    this.autoTimer = null;
    this.portrait = null;

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this._area = area;
    this._maxWrapW = Math.min(area.w - 360, 760);

    this.panelGfx = scene.add.graphics().setDepth(DEPTH);

    this.nameText = scene.add.text(0, 0, '', {
      ...TEXT.heading(),
      fontSize: '26px',
      color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 4,
    }).setDepth(DEPTH + 2);

    this.bodyText = scene.add.text(0, 0, '', {
      ...TEXT.body(),
      fontSize: '24px',
      color: PAPER_CSS.cream,
      wordWrap: { width: this._maxWrapW },
      lineSpacing: 8,
    }).setDepth(DEPTH + 2);

    this.continueBtn = PaperButton(scene, 0, 0, 'TAP ▶', {
      w: 150, h: 46, color: PAPER.orange, fontSize: 17,
      onClick: () => this.onTap(),
    });
    ['bg', 'shadow', 'label', 'zone'].forEach((k, i) => {
      if (this.continueBtn[k]) this.continueBtn[k].setDepth(DEPTH + 3 + i);
    });

    this.allObjects = [
      this.panelGfx, this.nameText, this.bodyText,
      this.continueBtn.bg, this.continueBtn.shadow, this.continueBtn.label, this.continueBtn.zone,
    ];
    this.hide();
  }

  onTap() {
    if (!this.active) return;
    if (this.typing) this.finishTyping();
    else this.nextLine();
  }

  hide() {
    this.allObjects.forEach(o => { if (o) o.setVisible(false); });
    this._destroyPortrait();
    if (this.autoTimer) { this.autoTimer.remove(); this.autoTimer = null; }
    this.active = false;
  }

  _destroyPortrait() {
    if (this.portrait) { this.portrait.destroy(); this.portrait = null; }
  }

  show(lines) {
    this.lines = lines || [];
    this.lineIdx = 0;
    this.active = true;
    this.allObjects.forEach(o => {
      if (o) {
        o.setVisible(true);
        if (o.setScrollFactor) o.setScrollFactor(0);
      }
    });

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.showCurrentLine();
    });
  }

  /** Short single-line beats play as an auto-dismissing toast. */
  _isToastLine(line) {
    return this.lines.length === 1 && (line.text || '').length <= 60;
  }

  showCurrentLine() {
    const line = this.lines[this.lineIdx];
    if (!line) { this.finish(); return; }

    this._destroyPortrait();
    if (this.autoTimer) { this.autoTimer.remove(); this.autoTimer = null; }

    if (this._isToastLine(line)) {
      this.showToastLine(line);
      return;
    }

    const area = this._area;
    const padX = 26, padTop = 46, padBottom = 22;
    const portraitR = 46;
    const portraitW = portraitR * 2 + 26;

    this.bodyText.setWordWrapWidth(this._maxWrapW);
    this.bodyText.setText(line.text || '');
    const textW = Math.min(this.bodyText.width, this._maxWrapW);
    const textH = this.bodyText.height;
    this.bodyText.setText('');

    let panelW = Math.max(textW + padX * 2 + portraitW, 460);
    panelW = Math.min(panelW, area.w - 40);
    const panelH = Math.max(textH + padTop + padBottom, portraitR * 2 + 34);

    // TOP-center, tucked under the objective line — the party and the
    // bottom HUD stay fully visible.
    const panelX = area.cx - panelW / 2;
    const panelY = area.top + 44;

    this.panelGfx.clear();
    this.panelGfx.fillStyle(PAPER.shadow, 0.2);
    this.panelGfx.fillRoundedRect(panelX + 4, panelY + 7, panelW, panelH, 18);
    this.panelGfx.fillStyle(PAPER.inkTeal, 0.94);
    this.panelGfx.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
    this.panelGfx.lineStyle(3, PAPER.gold, 0.6);
    this.panelGfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);
    // tail pointing down toward the party in the middle of the screen
    this.panelGfx.fillStyle(PAPER.inkTeal, 0.94);
    this.panelGfx.fillTriangle(
      area.cx - 18, panelY + panelH - 2,
      area.cx + 18, panelY + panelH - 2,
      area.cx, panelY + panelH + 24,
    );

    // the speaker's face
    const excited = /[!]\s*$/.test(line.text || '');
    this.portrait = drawGuidePortrait(this.scene, panelX + portraitR + 18, panelY + panelH / 2, line.speaker, {
      r: portraitR, expression: excited ? 'excited' : 'neutral',
    });
    this.portrait.setDepth(DEPTH + 2);
    if (this.portrait.setScrollFactor) this.portrait.setScrollFactor(0, true);

    const textX = panelX + portraitW + padX;
    this.nameText.setPosition(textX, panelY + 10);
    this.nameText.setText(line.speaker || '');
    this.bodyText.setPosition(textX, panelY + padTop);
    this.fullText = line.text || '';
    this.charIdx = 0;

    // TAP sits on the panel's bottom-right corner — nowhere near the
    // WORLD MAP button it used to cover.
    const btnX = panelX + panelW - 90;
    const btnY = panelY + panelH + 20;
    ['bg', 'shadow', 'label', 'zone'].forEach(k => {
      const o = this.continueBtn[k];
      if (o) {
        o.x = btnX + (k === 'shadow' ? 3 : 0);
        o.y = btnY + (k === 'shadow' ? 4 : 0);
        o.setVisible(true);
      }
    });

    this.typing = true;
    if (this.timer) this.timer.remove();
    this.timer = this.scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        this.charIdx++;
        this.bodyText.setText(this.fullText.substring(0, this.charIdx));
        if (this.charIdx >= this.fullText.length) this.finishTyping();
      },
    });
  }

  /** Slim centered band, no button, auto-dismisses (tap skips). */
  showToastLine(line) {
    const area = this._area;
    const label = line.speaker ? `${line.speaker}:  ` : '';
    this.nameText.setText('');
    this.bodyText.setWordWrapWidth(area.w - 200);
    this.bodyText.setText(label + (line.text || ''));
    const w = this.bodyText.width + 70;
    const h = this.bodyText.height + 26;
    const x = area.cx - w / 2;
    const y = area.top + 52;

    this.panelGfx.clear();
    this.panelGfx.fillStyle(PAPER.shadow, 0.18);
    this.panelGfx.fillRoundedRect(x + 3, y + 5, w, h, h / 2);
    this.panelGfx.fillStyle(PAPER.inkTeal, 0.9);
    this.panelGfx.fillRoundedRect(x, y, w, h, h / 2);
    this.panelGfx.lineStyle(2, PAPER.gold, 0.5);
    this.panelGfx.strokeRoundedRect(x, y, w, h, h / 2);
    this.bodyText.setPosition(x + 35, y + 13);

    ['bg', 'shadow', 'label', 'zone'].forEach(k => {
      if (this.continueBtn[k]) this.continueBtn[k].setVisible(false);
    });

    this.typing = false;
    this.fullText = line.text || '';
    const readMs = Math.max(2200, 900 + this.fullText.length * 45);
    this.autoTimer = this.scene.time.delayedCall(readMs, () => this.nextLine());
  }

  finishTyping() {
    this.typing = false;
    if (this.timer) { this.timer.remove(); this.timer = null; }
    this.bodyText.setText(this.fullText);
  }

  nextLine() {
    this.lineIdx++;
    if (this.lineIdx >= this.lines.length) {
      this.finish();
    } else {
      this.showCurrentLine();
    }
  }

  finish() {
    this.hide();
    if (this.resolve) { this.resolve(); this.resolve = null; }
  }
}
