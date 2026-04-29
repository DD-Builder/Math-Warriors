/**
 * DialogueOverlay — story text box with typewriter animation.
 *
 * Shows a paper panel at the bottom of the screen with a speaker name
 * and text that types out letter by letter. Tap anywhere to advance
 * (skip to full text, or dismiss if already complete).
 *
 * Usage:
 *   const dlg = new DialogueOverlay(scene);
 *   await dlg.show([
 *     { speaker: 'Elder Fairy', text: 'The Great Equation has shattered!' },
 *     { speaker: 'Briar King', text: 'You cannot stop me!' },
 *   ]);
 */

import { PaperPanel, TEXT, safeArea } from './paperUI.js';
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

    // Background panel
    const panel = PaperPanel(scene, area.cx, panelY, area.w - 40, panelH, {
      color: 0x1a0e04, alpha: 0.92, radius: 18,
    });
    this.panelBg = panel.bg;
    this.panelShadow = panel.shadow;

    // Speaker name
    this.nameText = scene.add.text(area.left + 40, panelY - 50, '', {
      ...TEXT.heading(),
      fontSize: '22px',
      color: '#f0d040',
      stroke: '#1a0e04',
      strokeThickness: 3,
    });

    // Body text
    this.bodyText = scene.add.text(area.left + 40, panelY - 20, '', {
      ...TEXT.body(),
      fontSize: '20px',
      color: '#f0e4cc',
      wordWrap: { width: area.w - 100 },
      lineSpacing: 6,
    });

    // "Tap to continue" hint
    this.hintText = scene.add.text(area.right - 60, panelY + 50, '▼', {
      ...TEXT.body(),
      fontSize: '18px',
      color: '#c07818',
    }).setOrigin(0.5);

    this.allObjects = [this.panelBg, this.panelShadow, this.nameText, this.bodyText, this.hintText];
    this.hide();

    // Tap handler — only responds when dialogue is actively showing
    scene.input.on('pointerdown', (pointer) => {
      if (!this.active) return;
      // Prevent the tap from propagating to maze tap-to-move
      pointer.event?.stopPropagation?.();
      if (this.typing) {
        this.finishTyping();
      } else {
        this.nextLine();
      }
    });
  }

  hide() {
    this.allObjects.forEach(o => o.setVisible(false));
    this.active = false;
  }

  /**
   * Show a sequence of dialogue lines. Returns a Promise that resolves
   * when the player has tapped through all of them.
   */
  show(lines) {
    this.lines = lines;
    this.lineIdx = 0;
    this.active = true;
    this.allObjects.forEach(o => {
      o.setVisible(true);
      if (o.setScrollFactor) o.setScrollFactor(0);
    });
    this.hintText.setVisible(false);

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
    this.hintText.setVisible(false);

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
    this.hintText.setVisible(true);
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
