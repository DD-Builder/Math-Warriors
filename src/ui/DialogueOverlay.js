/**
 * DialogueOverlay — story text box with typewriter animation.
 *
 * Shows a panel at the bottom with speaker name and typed text.
 * Panel dynamically sizes to fit text content.
 * A visible CONTINUE button advances to the next line.
 * All maze input is blocked while dialogue is active.
 */

import { PaperButton, paintPaperRect, TEXT, safeArea } from './paperUI.js';
import { GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';

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

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this._area = area;
    this._maxWrapW = area.w - 280;
    this._maxRatio = 3.5;

    this.panelGfx = scene.add.graphics();

    this.nameText = scene.add.text(0, 0, '', {
      ...TEXT.heading(),
      fontSize: '28px',
      color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 4,
    });

    this.bodyText = scene.add.text(0, 0, '', {
      ...TEXT.body(),
      fontSize: '24px',
      color: PAPER_CSS.cream,
      wordWrap: { width: this._maxWrapW },
      lineSpacing: 8,
    });

    const btnX = area.right - 130;
    this.continueBtn = PaperButton(scene, btnX, 0, 'TAP', {
      w: 200, h: 50, color: PAPER.orange, fontSize: 18,
      onClick: () => {
        if (!this.active) return;
        if (this.typing) {
          this.finishTyping();
        } else {
          this.nextLine();
        }
      },
    });

    this.allObjects = [
      this.panelGfx, this.nameText, this.bodyText,
      this.continueBtn.bg, this.continueBtn.shadow, this.continueBtn.label, this.continueBtn.zone,
    ];
    // Dialogue must render ABOVE everything in the scene — the maze's
    // foreground wall overlay sits at depth ~20 and was occluding hint
    // boxes left at the default depth 0.
    this.allObjects.forEach(o => {
      if (o && o.setDepth) o.setDepth(320);
      if (o && o.setScrollFactor) o.setScrollFactor(0);
    });
    this.hide();
  }

  hide() {
    this.allObjects.forEach(o => { if (o) o.setVisible(false); });
    this.active = false;
  }

  show(lines) {
    this.lines = lines;
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

  showCurrentLine() {
    const line = this.lines[this.lineIdx];
    if (!line) { this.finish(); return; }

    this.nameText.setText(line.speaker || '');
    this.fullText = line.text || '';
    this.charIdx = 0;

    this.bodyText.setText(this.fullText);
    const textW = Math.min(this.bodyText.width, this._maxWrapW);
    const textH = this.bodyText.height;
    this.bodyText.setText('');

    const area = this._area;
    const padX = 40, padTop = 44, padBottom = 20;
    let panelW = Math.min(textW + padX * 2 + 40, area.w - 40);
    panelW = Math.max(panelW, 400);
    let panelH = textH + padTop + padBottom + 20;
    panelH = Math.max(panelH, 100);
    if (panelW / panelH > this._maxRatio) panelH = Math.ceil(panelW / this._maxRatio);

    const panelY = area.bottom - panelH / 2 - 10;

    // Papercut panel: deckled hand-cut sheet stack (kit does shadow +
    // cream deckle + color sheet + inset + grain in one call). Repaints
    // into the SAME two graphics objects so depths/visibility hold.
    paintPaperRect(this.panelGfx, this.panelGfx, area.cx, panelY, panelW, panelH, PAPER.inkTeal, {
      organic: true, seed: 4217, shadowOff: 6, shadowAlpha: 0.3, alpha: 0.95,
      strokeColor: PAPER.sand, strokeAlpha: 0.35, strokeWidth: 2,
    });

    this.nameText.setPosition(area.cx - panelW / 2 + padX, panelY - panelH / 2 + 10);
    this.bodyText.setPosition(area.cx - panelW / 2 + padX, panelY - panelH / 2 + padTop);

    const btnY = panelY + panelH / 2 - 30;
    ['bg', 'shadow', 'label', 'zone'].forEach(k => {
      if (this.continueBtn[k]) this.continueBtn[k].y = btnY;
    });

    this.typing = true;

    if (this.timer) this.timer.remove();
    this.timer = this.scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        this.charIdx++;
        this.bodyText.setText(this.fullText.substring(0, this.charIdx));
        if (this.charIdx >= this.fullText.length) {
          this.finishTyping();
        }
      },
    });
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
