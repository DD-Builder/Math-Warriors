import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { PaperButton, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { audio } from '../systems/audio.js';
import { getHeroById } from '../data/heroes.js';
import { getEnemyById } from '../data/enemies.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { HERO_REACTIONS } from '../data/dialogue.js';

export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.CUTSCENE });
  }

  init(data) {
    this.mainLines = data.lines || [];
    this.floorId = data.floorId || 1;
    this.nextScene = data.nextScene || SCENES.WORLD_MAP;
    this.nextData = data.nextData || undefined;
    this.cutsceneTrigger = data.trigger || 'intro';

    this.save = loadSave(getActiveSlot(this));

    this.allLines = [];
    this.buildLineList();

    this.lineIdx = 0;
    this.typing = false;
    this.charIdx = 0;
    this.fullText = '';
    this.timer = null;
    this._leaving = false;
    this._lastLayout = null;
  }

  buildLineList() {
    const main = this.mainLines;
    const third = Math.max(1, Math.ceil(main.length / 3));

    for (let i = 0; i < main.length; i++) {
      const line = { ...main[i] };
      if (i >= third && i < third * 2) {
        line._layout = 'party';
      } else if (main[i].sprite && getEnemyById(main[i].sprite)) {
        line._layout = 'boss';
      } else if (main[i].wide) {
        line._layout = 'wide';
      } else {
        line._layout = 'fairy';
      }
      this.allLines.push(line);
    }

    const party = this.save.party || [];
    const floorReactions = HERO_REACTIONS[this.floorId];
    if (floorReactions) {
      for (const slot of party) {
        if (!slot || !slot.id) continue;
        const reaction = floorReactions[slot.id];
        if (!reaction || reaction.trigger !== this.cutsceneTrigger) continue;
        const heroDef = getHeroById(slot.id);
        const heroName = heroDef ? heroDef.name : slot.name || slot.id;
        this.allLines.push({
          speaker: heroName, text: reaction.text, side: 'left',
          _layout: 'party',
        });
      }
    }
  }

  create() {
    fadeInScene(this);
    audio.playMusic('music/map');

    drawPapercutBackground(this, this.floorId, GAME_WIDTH, GAME_HEIGHT, 555 + this.floorId);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.25);

    this.artContainer = this.add.container(0, 0);
    this.heroContainer = this.add.container(0, 0).setDepth(5);
    this.bubbleGfx = this.add.graphics().setDepth(20);

    this.speakerDot = this.add.circle(0, 0, 10, PAPER.sky).setDepth(21);
    this.nameText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '30px',
      color: PAPER_CSS.orange,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setDepth(21);
    this.bodyText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '26px',
      color: PAPER_CSS.inkTeal,
      stroke: PAPER_CSS.cream,
      strokeThickness: 1,
      wordWrap: { width: 480 },
      lineSpacing: 8,
    }).setDepth(21);

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.advanceBtn = PaperButton(this, area.right - 130, area.bottom - 50, 'NEXT ▶', {
      w: 200, h: 60, color: PAPER.orange, fontSize: 22,
      onClick: () => this.onTap(),
    });
    [this.advanceBtn.bg, this.advanceBtn.shadow, this.advanceBtn.label, this.advanceBtn.zone].forEach((el, i) => {
      if (el) el.setDepth(49 + i);
    });

    this.input.on('pointerup', (pointer) => {
      if (pointer.getDuration() < 500) this.onTap();
    });

    if (this.allLines.length > 0) {
      this.showLine(0);
    } else {
      this.finish();
    }
  }

  showLine(idx) {
    this.lineIdx = idx;
    const line = this.allLines[idx];
    if (!line) { this.finish(); return; }

    const layout = line._layout || 'fairy';
    const layoutChanged = layout !== this._lastLayout;
    this._lastLayout = layout;

    if (layoutChanged) {
      this.artContainer.removeAll(true);
      this.heroContainer.removeAll(true);
    }
    this.bubbleGfx.clear();

    if (layoutChanged) {
      if (layout === 'boss') {
        this.drawBossArt(line);
      } else if (layout === 'party') {
        this.drawFairySprite(GAME_WIDTH * 0.50, GAME_HEIGHT * 0.28, line.speaker, 50);
        this.drawPartyHeroes();
      } else if (layout === 'wide') {
        // no art for wide narrator lines
      } else {
        this.drawFairySprite(GAME_WIDTH * 0.22, GAME_HEIGHT * 0.48, line.speaker, 120);
      }
    }

    const isWide = line.wide || false;
    let bubbleLayout = 'left';
    if (layout === 'boss') bubbleLayout = 'right';
    else if (layout === 'party') bubbleLayout = 'party';
    else if (isWide) bubbleLayout = 'wide';

    this.layoutBubble(bubbleLayout, isWide, line);

    this.nameText.setText(line.speaker || '');
    this.fullText = line.text || '';
    this.charIdx = 0;
    this.bodyText.setText('');

    this.typing = true;
    if (this.timer) this.timer.remove();
    this.timer = this.time.addEvent({
      delay: 20, loop: true,
      callback: () => {
        this.charIdx++;
        this.bodyText.setText(this.fullText.substring(0, this.charIdx));
        if (this.charIdx >= this.fullText.length) this.finishTyping();
      },
    });
  }

  layoutBubble(layout, isWide, line) {
    const maxW = isWide ? GAME_WIDTH * 0.76 : 560;
    const wrapW = maxW - 60;
    const pad = { x: 20, top: 44, bottom: 20, name: 36 };

    let bx, by;
    if (layout === 'wide') {
      bx = GAME_WIDTH * 0.12;
      by = GAME_HEIGHT * 0.35;
    } else if (layout === 'right') {
      bx = GAME_WIDTH * 0.02;
      by = GAME_HEIGHT * 0.25;
    } else if (layout === 'party') {
      bx = GAME_WIDTH * 0.19;
      by = GAME_HEIGHT * 0.08;
    } else {
      bx = GAME_WIDTH * 0.39;
      by = GAME_HEIGHT * 0.25;
    }

    this.bodyText.setWordWrapWidth(wrapW);
    this.bodyText.setText(line.text || '');
    const textW = Math.min(this.bodyText.width, wrapW);
    const textH = this.bodyText.height;

    let bw = Math.min(textW + pad.x * 2 + pad.name, maxW);
    bw = Math.max(bw, 200);
    let bh = textH + pad.top + pad.bottom;
    bh = Math.max(bh, 90);
    if (bw / bh > 3.5) bh = Math.ceil(bw / 3.5);

    const speakerColor = this.getSpeakerColor(line.speaker);
    this.speakerDot.setPosition(bx + 16, by + 16);
    this.speakerDot.setFillStyle(speakerColor);
    this.nameText.setPosition(bx + 34, by + 8);
    this.bodyText.setPosition(bx + pad.x, by + pad.top);
    this.bodyText.setText('');

    this.bubbleGfx.clear();
    this.bubbleGfx.fillStyle(PAPER.shadow, 0.15);
    this.bubbleGfx.fillRoundedRect(bx + 4, by + 6, bw, bh, 20);
    this.bubbleGfx.fillStyle(PAPER.cream, 0.92);
    this.bubbleGfx.fillRoundedRect(bx, by, bw, bh, 20);
    this.bubbleGfx.lineStyle(3, PAPER.gold, 0.8);
    this.bubbleGfx.strokeRoundedRect(bx, by, bw, bh, 20);
  }

  drawFairySprite(cx, cy, speaker, radius) {
    const gfx = this.add.graphics();
    const color = this.getSpeakerColor(speaker);
    const r = radius || 120;

    for (let ring = 5; ring >= 1; ring--) {
      gfx.fillStyle(color, 0.08 * ring);
      gfx.fillCircle(cx, cy, r + 40 + ring * 15);
    }

    gfx.fillStyle(PAPER.shadow, 0.2);
    gfx.fillCircle(cx + 4, cy + 6, r);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(cx, cy, r);
    gfx.fillStyle(PAPER.white, 0.4);
    gfx.fillCircle(cx - r * 0.2, cy - r * 0.25, r * 0.45);

    gfx.fillStyle(PAPER.inkTeal, 1);
    gfx.fillCircle(cx - r * 0.18, cy - r * 0.05, r * 0.08);
    gfx.fillCircle(cx + r * 0.18, cy - r * 0.05, r * 0.08);
    gfx.fillStyle(PAPER.white, 1);
    gfx.fillCircle(cx - r * 0.16, cy - r * 0.07, r * 0.03);
    gfx.fillCircle(cx + r * 0.20, cy - r * 0.07, r * 0.03);

    gfx.fillStyle(PAPER.rose, 0.6);
    gfx.fillEllipse(cx, cy + r * 0.12, r * 0.25, r * 0.08);

    this.artContainer.add(gfx);

    const label = this.add.text(cx, cy + r + 20, speaker || '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '20px',
      color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.artContainer.add(label);
  }

  drawPartyHeroes() {
    const party = this.save.party || [];
    const positions = [
      { x: GAME_WIDTH * 0.18, y: GAME_HEIGHT * 0.74 },
      { x: GAME_WIDTH * 0.50, y: GAME_HEIGHT * 0.70 },
      { x: GAME_WIDTH * 0.82, y: GAME_HEIGHT * 0.74 },
    ];
    for (let i = 0; i < Math.min(3, party.length); i++) {
      const slot = party[i];
      if (!slot) continue;
      const def = getHeroById(slot.id);
      if (!def) continue;
      const pos = positions[i];
      const startX = pos.x - 200;
      const heroSprite = createAnimatedHero(this, startX, pos.y, def, { scale: 1.2 });
      heroSprite.startWalk();
      this.heroContainer.add(heroSprite);
      this.tweens.add({
        targets: heroSprite,
        x: pos.x,
        duration: 600 + i * 200,
        ease: 'Sine.out',
        delay: i * 150,
        onComplete: () => { heroSprite.stopWalk(); },
      });
    }
  }

  drawBossArt(line) {
    const cx = GAME_WIDTH * 0.78;
    const cy = GAME_HEIGHT * 0.48;
    const enemy = getEnemyById(line.sprite);
    if (enemy) {
      const img = drawMonsterSprite(this, cx, cy, enemy, { scale: 1.8 });
      this.artContainer.add(img);
    }
  }

  getSpeakerColor(speaker) {
    if (!speaker) return PAPER.sky;
    const s = speaker.toLowerCase();
    if (s.includes('elara') || s.includes('elder')) return PAPER.sky;
    if (s.includes('water') || s.includes('marina')) return PAPER.teal;
    if (s.includes('sky') || s.includes('zephyr')) return PAPER.sky;
    if (s.includes('fire') || s.includes('ember')) return PAPER.coralD;
    if (s.includes('ice') || s.includes('frost')) return PAPER.tealL;
    if (s.includes('crystal')) return PAPER.lavender;
    if (s.includes('market')) return PAPER.gold;
    if (s.includes('book')) return PAPER.peach;
    if (s.includes('all fair')) return PAPER.lavender;
    if (s.includes('narrator')) return PAPER.gold;
    if (s.includes('king') || s.includes('pressure') || s.includes('whale') ||
        s.includes('prism') || s.includes('paradox') || s.includes('theorem') ||
        s.includes('zero') || s.includes('counterfeit') || s.includes('pyroclast')) {
      return PAPER.coralD;
    }
    return PAPER.sky;
  }

  onTap() {
    if (this._leaving) return;
    if (this.typing) {
      this.finishTyping();
    } else {
      this.advance();
    }
  }

  finishTyping() {
    this.typing = false;
    if (this.timer) { this.timer.remove(); this.timer = null; }
    this.bodyText.setText(this.fullText);
  }

  advance() {
    this.lineIdx++;
    if (this.lineIdx >= this.allLines.length) {
      this.finish();
    } else {
      this.showLine(this.lineIdx);
    }
  }

  finish() {
    if (this._leaving) return;
    this._leaving = true;
    transitionTo(this, this.nextScene, this.nextData, 400);
  }
}
