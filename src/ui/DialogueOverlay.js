/**
 * DialogueOverlay — story text box with typewriter animation.
 *
 * Shows a panel at the bottom with speaker name and typed text.
 * A visible CONTINUE button advances to the next line.
 * All maze input is blocked while dialogue is active.
 */

import { PaperPanel, PaperButton, TEXT, safeArea } from './paperUI.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';

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
    const panelH = 160;
    const panelY = area.bottom - panelH / 2 - 10;

    const panel = PaperPanel(scene, area.cx, panelY, area.w - 40, panelH, {
      color: 0x1a0e04, alpha: 0.92, radius: 18,
    });
    this.panelBg = panel.bg;
    this.panelShadow = panel.shadow;

    this.nameText = scene.add.text(area.left + 40, panelY - 50, '', {
      ...TEXT.heading(),
      fontSize: '22px',
      color: '#f0d040',
      stroke: '#1a0e04',
      strokeThickness: 3,
    });

    this.bodyText = scene.add.text(area.left + 40, panelY - 20, '', {
      ...TEXT.body(),
      fontSize: '20px',
      color: '#f0e4cc',
      wordWrap: { width: area.w - 260 },
      lineSpacing: 6,
    });

    // Continue button — visible, tappable, inside the panel
    const btnX = area.right - 120;
    const btnY = panelY + 40;
    this.continueBtn = PaperButton(scene, btnX, btnY, 'CONTINUE', {
      w: 180, h: 44, color: 0xc07818, fontSize: 14,
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
      this.panelBg, this.panelShadow, this.nameText, this.bodyText,
      this.continueBtn.bg, this.continueBtn.shadow, this.continueBtn.label, this.continueBtn.zone,
    ];
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
    this.bodyText.setText('');
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
