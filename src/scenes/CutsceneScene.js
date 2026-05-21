import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { audio } from '../systems/audio.js';
import { getHeroById } from '../data/heroes.js';
import { getEnemyById } from '../data/enemies.js';

/**
 * CutsceneScene — full-screen graphic-novel dialogue.
 *
 * Replaces the old text-box overlay for story moments. Each dialogue
 * line is a full-screen panel with:
 *   - Floor-themed papercut background
 *   - Large character art (hero/fairy/boss) on left or right
 *   - Speech bubble with short graphic-novel text
 *   - TAP ▶ to advance
 *
 * Data passed in:
 *   { dialogueKey, lines, floorId, nextScene, nextData }
 */
export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.CUTSCENE });
  }

  init(data) {
    this.lines = data.lines || [];
    this.floorId = data.floorId || 1;
    this.nextScene = data.nextScene || SCENES.WORLD_MAP;
    this.nextData = data.nextData || undefined;
    this.lineIdx = 0;
    this.typing = false;
    this.charIdx = 0;
    this.fullText = '';
    this.timer = null;
  }

  create() {
    fadeInScene(this);
    audio.playMusic('music/map');

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    drawPapercutBackground(this, this.floorId, GAME_WIDTH, GAME_HEIGHT, 555 + this.floorId);

    this.darkOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.25
    );

    this.speakerContainer = this.add.container(0, 0);
    this.bubbleContainer = this.add.container(0, 0);

    this.buildBubbleUI(area);
    this.buildAdvanceButton(area);

    this.input.on('pointerdown', () => this.onTap());

    if (this.lines.length > 0) {
      this.showPanel(0);
    } else {
      this.finish();
    }
  }

  buildBubbleUI(area) {
    this.bubbleGfx = this.add.graphics();
    this.bubbleContainer.add(this.bubbleGfx);

    this.speakerDot = this.add.circle(0, 0, 12, 0x88aaff);
    this.bubbleContainer.add(this.speakerDot);

    this.nameText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '32px',
      color: '#f0d040',
      stroke: '#1a0e04',
      strokeThickness: 5,
    });
    this.bubbleContainer.add(this.nameText);

    this.bodyText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      color: '#f0e4cc',
      stroke: '#1a0e04',
      strokeThickness: 3,
      wordWrap: { width: 600 },
      lineSpacing: 10,
    });
    this.bubbleContainer.add(this.bodyText);
  }

  buildAdvanceButton(area) {
    this.advanceBtn = PaperButton(this, area.right - 130, area.bottom - 50, 'TAP  ▶', {
      w: 200, h: 60, color: 0xc07818, fontSize: 22,
      onClick: () => this.onTap(),
    });
  }

  showPanel(idx) {
    this.lineIdx = idx;
    const line = this.lines[idx];
    if (!line) { this.finish(); return; }

    this.speakerContainer.removeAll(true);

    const isWide = line.wide || false;
    const side = line.side || (idx % 2 === 0 ? 'left' : 'right');

    const speakerColor = this.getSpeakerColor(line.speaker);
    this.speakerDot.setFillStyle(speakerColor);

    this.bubbleGfx.setAlpha(0);
    this.speakerDot.setAlpha(0);
    this.nameText.setAlpha(0);
    this.bodyText.setAlpha(0);

    if (!isWide) {
      this.drawCharacterArt(line, side);
      this.positionBubble(line, side);
    } else {
      this.positionBubbleWide(line);
    }

    this.tweens.add({ targets: [this.bubbleGfx, this.speakerDot, this.nameText, this.bodyText], alpha: 1, duration: 250, ease: 'Sine.out' });

    this.speakerContainer.list.forEach(obj => {
      if (obj.setAlpha) {
        const finalX = obj.x;
        obj.setAlpha(0);
        obj.x = side === 'left' ? finalX - 120 : finalX + 120;
        this.tweens.add({ targets: obj, alpha: 1, x: finalX, duration: 350, ease: 'Back.out' });
      }
    });

    this.nameText.setText(line.speaker || '');
    this.fullText = line.text || '';
    this.charIdx = 0;
    this.bodyText.setText('');
    this.typing = true;

    if (this.timer) this.timer.remove();
    this.timer = this.time.addEvent({
      delay: 20,
      loop: true,
      callback: () => {
        this.charIdx++;
        this.bodyText.setText(this.fullText.substring(0, this.charIdx));
        if (this.charIdx >= this.fullText.length) {
          this.finishTyping();
        }
      },
    });

    this.bubbleGfx.clear();
    this.drawBubbleBackground(line, side, isWide);
  }

  drawCharacterArt(line, side) {
    const cx = side === 'left' ? GAME_WIDTH * 0.2 : GAME_WIDTH * 0.8;
    const cy = GAME_HEIGHT * 0.5;

    if (line.sprite) {
      const hero = getHeroById(line.sprite);
      if (hero) {
        const img = drawHeroSprite(this, cx, cy, hero, { scale: 1.8 });
        this.speakerContainer.add(img);
        return;
      }
      const enemy = getEnemyById(line.sprite);
      if (enemy) {
        const img = drawMonsterSprite(this, cx, cy, enemy, { scale: 1.8 });
        this.speakerContainer.add(img);
        return;
      }
    }

    this.drawFairySprite(cx, cy, line.speaker);
  }

  drawFairySprite(cx, cy, speaker) {
    const gfx = this.add.graphics();
    const color = this.getSpeakerColor(speaker);

    gfx.fillStyle(0x000000, 0.2);
    gfx.fillCircle(cx + 4, cy + 6, 60);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(cx, cy, 55);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(cx - 12, cy - 12, 28);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(cx + 20, cy - 20, 15);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const wx = cx + Math.cos(a) * 72;
      const wy = cy + Math.sin(a) * 72;
      gfx.fillStyle(color, 0.4);
      gfx.fillCircle(wx, wy, 8 + Math.random() * 6);
    }

    const label = this.add.text(cx, cy + 80, speaker || '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '18px',
      color: '#f0e4cc',
      stroke: '#1a0e04',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.speakerContainer.add(gfx);
    this.speakerContainer.add(label);
  }

  positionBubble(line, side) {
    const bx = side === 'left' ? GAME_WIDTH * 0.42 : GAME_WIDTH * 0.08;
    const by = GAME_HEIGHT * 0.32;

    this.speakerDot.setPosition(bx + 20, by + 25);
    this.nameText.setPosition(bx + 40, by + 10);
    this.bodyText.setPosition(bx + 20, by + 55);
    this.bodyText.setWordWrapWidth(560);
  }

  positionBubbleWide(line) {
    const bx = GAME_WIDTH * 0.18;
    const by = GAME_HEIGHT * 0.38;

    this.speakerDot.setPosition(bx + 20, by + 25);
    this.nameText.setPosition(bx + 40, by + 10);
    this.bodyText.setPosition(bx + 20, by + 55);
    this.bodyText.setWordWrapWidth(GAME_WIDTH * 0.64);
  }

  drawBubbleBackground(line, side, isWide) {
    const bx = isWide ? GAME_WIDTH * 0.15 : (side === 'left' ? GAME_WIDTH * 0.39 : GAME_WIDTH * 0.05);
    const by = GAME_HEIGHT * 0.27;
    const bw = isWide ? GAME_WIDTH * 0.7 : 620;
    const bh = 200;

    this.bubbleGfx.fillStyle(0x000000, 0.3);
    this.bubbleGfx.fillRoundedRect(bx + 4, by + 6, bw, bh, 20);

    this.bubbleGfx.fillStyle(0x1a0e04, 0.88);
    this.bubbleGfx.fillRoundedRect(bx, by, bw, bh, 20);
    this.bubbleGfx.lineStyle(3, 0xc07818, 0.8);
    this.bubbleGfx.strokeRoundedRect(bx, by, bw, bh, 20);

    if (!isWide) {
      const tipX = side === 'left' ? bx - 10 : bx + bw + 10;
      const tipDir = side === 'left' ? -1 : 1;
      this.bubbleGfx.fillStyle(0x1a0e04, 0.88);
      this.bubbleGfx.fillTriangle(
        tipX, by + bh * 0.4,
        tipX + tipDir * 30, by + bh * 0.3,
        tipX, by + bh * 0.55
      );
    }
  }

  getSpeakerColor(speaker) {
    if (!speaker) return 0x88aaff;
    const s = speaker.toLowerCase();
    if (s.includes('elder')) return 0x88aaff;
    if (s.includes('water')) return 0x38a8c8;
    if (s.includes('sky')) return 0x88c8f8;
    if (s.includes('fire')) return 0xf06828;
    if (s.includes('ice')) return 0x80c8e8;
    if (s.includes('crystal')) return 0xc080f0;
    if (s.includes('market')) return 0xe8c040;
    if (s.includes('book')) return 0xc8a060;
    if (s.includes('all fair')) return 0xd0a0ff;
    if (s.includes('narrator')) return 0xf0d040;
    if (s.includes('king') || s.includes('pressure') || s.includes('whale') ||
        s.includes('prism') || s.includes('paradox') || s.includes('theorem') ||
        s.includes('zero') || s.includes('counterfeit') || s.includes('pyroclast')) {
      return 0xe04040;
    }
    return 0x88aaff;
  }

  onTap() {
    if (this.typing) {
      this.finishTyping();
    } else {
      this.nextPanel();
    }
  }

  finishTyping() {
    this.typing = false;
    if (this.timer) { this.timer.remove(); this.timer = null; }
    this.bodyText.setText(this.fullText);
  }

  nextPanel() {
    this.lineIdx++;
    if (this.lineIdx >= this.lines.length) {
      this.finish();
    } else {
      this.showPanel(this.lineIdx);
    }
  }

  finish() {
    transitionTo(this, this.nextScene, this.nextData, 400);
  }
}
