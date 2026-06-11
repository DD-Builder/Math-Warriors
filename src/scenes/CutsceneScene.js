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

/**
 * CutsceneScene — 3-panel graphic-novel dialogue.
 *
 * Panel 1: Fairy solo (big, sparkly)
 * Panel 2: Fairy + hero party (battle-ready)
 * Panel 3: Fairy solo close
 *
 * Lines are auto-mapped: line[0]→panel 1, line[1]→panel 2, line[2]→panel 3.
 * If >3 lines: first→panel 1, last→panel 3, middle lines cycle on panel 2.
 * If <3 lines: pad with fewer panels.
 */
export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.CUTSCENE });
  }

  init(data) {
    this.rawLines = data.lines || [];
    this.floorId = data.floorId || 1;
    this.nextScene = data.nextScene || SCENES.WORLD_MAP;
    this.nextData = data.nextData || undefined;
    this.cutsceneTrigger = data.trigger || 'intro';
    this.panels = this.buildPanels(this.rawLines);

    // Append hero reaction panels based on active party
    this.appendHeroReactions();

    this.panelIdx = 0;
    this.subIdx = 0;
    this.typing = false;
    this.charIdx = 0;
    this.fullText = '';
    this.timer = null;
    this.save = loadSave(getActiveSlot(this));
  }

  /**
   * Check if any heroes in the current party have reactions for this floor.
   * If so, append their reactions as additional dialogue panels at the end.
   */
  appendHeroReactions() {
    const save = loadSave(getActiveSlot(this));
    const party = save.party || [];
    const floorReactions = HERO_REACTIONS[this.floorId];
    if (!floorReactions) return;

    const reactionLines = [];
    for (const slot of party) {
      if (!slot || !slot.id) continue;
      const reaction = floorReactions[slot.id];
      if (!reaction) continue;
      if (reaction.trigger !== this.cutsceneTrigger) continue;
      const heroDef = getHeroById(slot.id);
      const heroName = heroDef ? heroDef.name : slot.name || slot.id;
      reactionLines.push({ speaker: heroName, text: reaction.text, side: 'left' });
    }

    if (reactionLines.length > 0) {
      this.panels.push({ type: 'party', lines: reactionLines });
    }
  }

  buildPanels(lines) {
    if (lines.length === 0) return [];
    if (lines.length === 1) return [{ type: 'fairy', lines: [lines[0]] }];
    if (lines.length === 2) return [
      { type: 'fairy', lines: [lines[0]] },
      { type: 'fairy', lines: [lines[1]] },
    ];
    const third = Math.max(1, Math.ceil(lines.length / 3));
    return [
      { type: 'fairy', lines: lines.slice(0, third) },
      { type: 'party', lines: lines.slice(third, third * 2) },
      { type: 'fairy', lines: lines.slice(third * 2) },
    ].filter(p => p.lines.length > 0);
  }

  create() {
    fadeInScene(this);
    audio.playMusic('music/map');

    // Set world to 2x viewport width for cinematic camera panning
    const worldW = GAME_WIDTH * 2;
    this.cameras.main.setBounds(0, 0, worldW, GAME_HEIGHT);
    this.cameras.main.setScroll(0, 0);

    // Draw background across the full world width (covers both panel sections)
    drawPapercutBackground(this, this.floorId, worldW, GAME_HEIGHT, 555 + this.floorId);

    this.darkOverlay = this.add.rectangle(
      worldW / 2, GAME_HEIGHT / 2, worldW, GAME_HEIGHT, PAPER.shadow, 0.25
    );

    this.artContainer = this.add.container(0, 0);
    this.bubbleGfx = this.add.graphics();
    this.sparkleContainer = this.add.container(0, 0);

    this.speakerDot = this.add.circle(0, 0, 10, PAPER.sky);
    this.nameText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '30px',
      color: PAPER_CSS.orange,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    });
    this.bodyText = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '26px',
      color: PAPER_CSS.inkTeal,
      stroke: PAPER_CSS.cream,
      strokeThickness: 1,
      wordWrap: { width: 480 },
      lineSpacing: 8,
    });

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.advanceBtn = PaperButton(this, area.right - 130, area.bottom - 50, 'NEXT ▶', {
      w: 200, h: 60, color: PAPER.orange, fontSize: 22,
      onClick: () => this.onTap(),
    });
    // Fix advance button to camera so it stays visible during pans
    if (this.advanceBtn.bg) this.advanceBtn.bg.setScrollFactor(0);
    if (this.advanceBtn.shadow) this.advanceBtn.shadow.setScrollFactor(0);
    if (this.advanceBtn.label) this.advanceBtn.label.setScrollFactor(0);
    if (this.advanceBtn.zone) this.advanceBtn.zone.setScrollFactor(0);

    this.input.on('pointerdown', () => this.onTap());

    if (this.panels.length > 0) {
      this.showPanel(0, 0);
    } else {
      this.finish();
    }
  }

  showPanel(panelIdx, subIdx) {
    this.panelIdx = panelIdx;
    this.subIdx = subIdx;
    const panel = this.panels[panelIdx];
    if (!panel) { this.finish(); return; }
    const line = panel.lines[subIdx];
    if (!line) { this.finish(); return; }

    this.artContainer.removeAll(true);
    this.sparkleContainer.removeAll(true);
    this.bubbleGfx.clear();

    // Each panel occupies a viewport-width section of the 2x world.
    // Alternate panels between the two sections for cinematic panning.
    const sectionX = (panelIdx % 2) * GAME_WIDTH;
    const panTargetX = sectionX + GAME_WIDTH / 2;
    this._panelOffsetX = sectionX;

    // Cinematic camera pan to this panel's section
    this.cameras.main.pan(panTargetX, GAME_HEIGHT / 2, 800, 'Sine.easeInOut');

    const isBoss = line.sprite && (getEnemyById(line.sprite) != null);
    const isWide = line.wide || false;

    if (isBoss) {
      this.drawBossArt(line);
      this.positionBubble('right');
      this.drawBubbleBackground('right', isWide);
    } else if (panel.type === 'party') {
      this.drawPartyHeroes();
      this.drawFairySprite(sectionX + GAME_WIDTH * 0.50, GAME_HEIGHT * 0.30, line.speaker, 50);
      this.positionBubble('party');
      this.drawBubbleBackground('party', false);
    } else {
      this.drawFairySprite(sectionX + GAME_WIDTH * 0.22, GAME_HEIGHT * 0.48, line.speaker, 120);
      this.positionBubble('left');
      this.drawBubbleBackground('left', isWide);
    }

    const speakerColor = this.getSpeakerColor(line.speaker);
    this.speakerDot.setFillStyle(speakerColor);

    // Zoom slightly on speaker, then ease back
    this.cameras.main.zoomTo(1.05, 300, 'Sine.easeInOut');
    this.time.delayedCall(1500, () => {
      if (this.scene.isActive()) {
        this.cameras.main.zoomTo(1.0, 300, 'Sine.easeInOut');
      }
    });

    this.nameText.setText(line.speaker || '');
    this.fullText = line.text || '';
    this.charIdx = 0;
    this.layoutBubble();
    this.bodyText.setText('');
    this.typing = true;

    // Entrance animation: slide from x-30 and fade in
    [this.bubbleGfx, this.speakerDot, this.nameText, this.bodyText].forEach(o => {
      const finalX = o.x;
      o.setAlpha(0);
      o.x = finalX - 30;
      this.tweens.add({
        targets: o,
        alpha: 1,
        x: finalX,
        duration: 250,
        ease: 'Sine.out',
      });
    });

    this.artContainer.list.forEach(obj => {
      if (obj.setAlpha) {
        const finalX = obj.x;
        obj.setAlpha(0);
        obj.x = finalX - 30;
        this.tweens.add({ targets: obj, alpha: 1, x: finalX, duration: 250, ease: 'Sine.out' });
      }
    });

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

  drawFairySprite(cx, cy, speaker, radius) {
    const gfx = this.add.graphics();
    const color = this.getSpeakerColor(speaker);
    const r = radius || 120;

    for (let ring = 5; ring >= 1; ring--) {
      gfx.fillStyle(color, 0.08 * ring);
      gfx.fillCircle(cx, cy, r + 40 + ring * 15);
    }

    const wingW = r * 0.9;
    const wingH = r * 1.4;
    gfx.fillStyle(color, 0.25);
    gfx.fillEllipse(cx - r * 0.5, cy - r * 0.1, wingW, wingH);
    gfx.fillEllipse(cx + r * 0.5, cy - r * 0.1, wingW, wingH);
    gfx.fillStyle(PAPER.white, 0.12);
    gfx.fillEllipse(cx - r * 0.5, cy - r * 0.15, wingW * 0.7, wingH * 0.7);
    gfx.fillEllipse(cx + r * 0.5, cy - r * 0.15, wingW * 0.7, wingH * 0.7);

    gfx.fillStyle(PAPER.shadow, 0.2);
    gfx.fillCircle(cx + 4, cy + 6, r);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(cx, cy, r);
    gfx.fillStyle(PAPER.white, 0.4);
    gfx.fillCircle(cx - r * 0.2, cy - r * 0.25, r * 0.45);
    gfx.fillStyle(PAPER.white, 0.25);
    gfx.fillCircle(cx + r * 0.3, cy - r * 0.35, r * 0.25);

    gfx.fillStyle(PAPER.inkTeal, 1);
    gfx.fillCircle(cx - r * 0.18, cy - r * 0.05, r * 0.08);
    gfx.fillCircle(cx + r * 0.18, cy - r * 0.05, r * 0.08);
    gfx.fillStyle(PAPER.white, 1);
    gfx.fillCircle(cx - r * 0.16, cy - r * 0.07, r * 0.03);
    gfx.fillCircle(cx + r * 0.20, cy - r * 0.07, r * 0.03);

    gfx.fillStyle(PAPER.rose, 0.6);
    gfx.fillEllipse(cx, cy + r * 0.12, r * 0.25, r * 0.08);

    this.artContainer.add(gfx);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const dist = r + 30 + Math.random() * 25;
      const sx = cx + Math.cos(a) * dist;
      const sy = cy + Math.sin(a) * dist;
      const size = 3 + Math.random() * 4;
      const sparkle = this.add.circle(sx, sy, size, PAPER.white, 0.6 + Math.random() * 0.3);
      this.sparkleContainer.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        alpha: 0.2,
        scale: 0.5,
        duration: 800 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 500,
      });
    }

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
    const off = this._panelOffsetX || 0;
    const positions = [
      { x: off + GAME_WIDTH * 0.18, y: GAME_HEIGHT * 0.74 },
      { x: off + GAME_WIDTH * 0.50, y: GAME_HEIGHT * 0.70 },
      { x: off + GAME_WIDTH * 0.82, y: GAME_HEIGHT * 0.74 },
    ];
    for (let i = 0; i < Math.min(3, party.length); i++) {
      const slot = party[i];
      if (!slot) continue;
      const def = getHeroById(slot.id);
      if (!def) continue;
      const pos = positions[i];
      // Create hero off-screen to the left, walk in
      const startX = pos.x - 200;
      const heroSprite = createAnimatedHero(this, startX, pos.y, def, { scale: 1.2 });
      heroSprite.startWalk();
      this.artContainer.add(heroSprite);
      // Tween to final position
      this.tweens.add({
        targets: heroSprite,
        x: pos.x,
        duration: 600 + i * 200,
        ease: 'Sine.out',
        delay: i * 150,
        onComplete: () => {
          heroSprite.stopWalk();
        },
      });
    }
  }

  drawBossArt(line) {
    const off = this._panelOffsetX || 0;
    const cx = off + GAME_WIDTH * 0.78;
    const cy = GAME_HEIGHT * 0.48;
    const enemy = getEnemyById(line.sprite);
    if (enemy) {
      // Brief screen darken for boss reveal — covers the panel section
      const darkenX = off + GAME_WIDTH / 2;
      const darken = this.add.rectangle(darkenX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
      this.artContainer.add(darken);
      this.tweens.add({ targets: darken, alpha: 0, duration: 800, delay: 400, onComplete: () => darken.destroy() });

      // Boss sprite with scale-pop effect (0 -> 1.2 -> 1.0)
      const img = drawMonsterSprite(this, cx, cy, enemy, { scale: 1.8 });
      img.setScale(0);
      this.artContainer.add(img);
      this.tweens.add({
        targets: img,
        scaleX: 1.8 * 1.2,
        scaleY: 1.8 * 1.2,
        duration: 400,
        delay: 200,
        ease: 'Back.out',
        onComplete: () => {
          this.tweens.add({
            targets: img,
            scaleX: 1.8,
            scaleY: 1.8,
            duration: 300,
            ease: 'Sine.inOut',
          });
        },
      });
    }
  }

  positionBubble(layout) {
    const off = this._panelOffsetX || 0;
    let bx;
    if (layout === 'left') {
      bx = off + GAME_WIDTH * 0.39;
    } else if (layout === 'right') {
      bx = off + GAME_WIDTH * 0.02;
    } else if (layout === 'party') {
      bx = off + GAME_WIDTH * 0.19;
    } else {
      bx = off + GAME_WIDTH * 0.19;
    }
    this._bubbleLayout = layout;
    this._bubbleBx = bx;
  }

  layoutBubble() {
    const layout = this._bubbleLayout;
    const isWide = this._bubbleIsWide;
    let bx = this._bubbleBx;
    const maxW = isWide ? GAME_WIDTH * 0.76 : 560;
    const wrapW = maxW - 60;
    const maxRatio = 3.5;
    const pad = { x: 20, top: 44, bottom: 20, name: 36 };
    const by = layout === 'party' ? GAME_HEIGHT * 0.08 : GAME_HEIGHT * 0.25;

    if (isWide) bx = (this._panelOffsetX || 0) + GAME_WIDTH * 0.12;

    this.bodyText.setWordWrapWidth(wrapW);
    this.bodyText.setText(this.fullText);
    const textW = Math.min(this.bodyText.width, wrapW);
    const textH = this.bodyText.height;

    let bw = Math.min(textW + pad.x * 2 + pad.name, maxW);
    bw = Math.max(bw, 200);
    let bh = textH + pad.top + pad.bottom;
    bh = Math.max(bh, 90);

    if (bw / bh > maxRatio) bh = Math.ceil(bw / maxRatio);

    this.speakerDot.setPosition(bx + 16, by + 16);
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

  drawBubbleBackground(_layout, isWide) {
    this._bubbleIsWide = isWide;
  }

  getSpeakerColor(speaker) {
    if (!speaker) return PAPER.sky;
    const s = speaker.toLowerCase();
    if (s.includes('elder')) return PAPER.sky;
    if (s.includes('water')) return PAPER.teal;
    if (s.includes('sky')) return PAPER.sky;
    if (s.includes('fire')) return PAPER.coralD;
    if (s.includes('ice')) return PAPER.tealL;
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
    const panel = this.panels[this.panelIdx];
    if (!panel) { this.finish(); return; }
    this.subIdx++;
    if (this.subIdx < panel.lines.length) {
      this.showPanel(this.panelIdx, this.subIdx);
    } else {
      this.panelIdx++;
      this.subIdx = 0;
      if (this.panelIdx >= this.panels.length) {
        this.finish();
      } else {
        this.showPanel(this.panelIdx, 0);
      }
    }
  }

  finish() {
    if (this._leaving) return; // rapid taps on the last line = double transition
    this._leaving = true;
    transitionTo(this, this.nextScene, this.nextData, 400);
  }
}
