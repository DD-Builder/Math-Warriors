import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { PaperButton, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { audio } from '../systems/audio.js';
import { getHeroById, ALL_HEROES } from '../data/heroes.js';
import { getEnemyById } from '../data/enemies.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { HERO_REACTIONS } from '../data/dialogue.js';
import { drawGuidePortrait, hasGuidePortrait } from '../ui/guideArt.js';
import { hubSceneKey } from '../ui/hubRouter.js';

export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.CUTSCENE });
  }

  init(data) {
    this.mainLines = data.lines || [];
    this.floorId = data.floorId || 1;
    this.nextScene = data.nextScene || hubSceneKey();
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
      // Panel heuristics (authored line.frame wins): the opener is a
      // wide establishing shot, villain lines are low-angle boss
      // panels (dutch-tilted when they shout), the middle third plays
      // on the party, and guide speech alternates close-up sides.
      if (line.frame) {
        line._layout = line.frame;
      } else if (main[i].sprite && getEnemyById(main[i].sprite)) {
        line._layout = /!\s*$/.test(line.text || '') ? 'dutch' : 'boss';
      } else if (i === 0 || main[i].wide) {
        line._layout = 'wide';
      } else if (i >= third && i < third * 2) {
        line._layout = 'party';
      } else {
        line._layout = i % 2 ? 'closeR' : 'close';
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

    // Letterbox bars — the film frame that makes panels feel composed
    const barH = 74;
    this.add.rectangle(GAME_WIDTH / 2, barH / 2, GAME_WIDTH, barH, PAPER.inkTeal, 1).setDepth(40);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - barH / 2, GAME_WIDTH, barH, PAPER.inkTeal, 1).setDepth(40);

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
    const btnX = area.right - 130, btnY = area.bottom - 50;
    this.advanceBtn = PaperButton(this, btnX, btnY, 'NEXT', {
      w: 200, h: 60, color: PAPER.orange, fontSize: 22,
      onClick: () => this.onTap(),
    });
    [this.advanceBtn.bg, this.advanceBtn.shadow, this.advanceBtn.label, this.advanceBtn.zone].forEach((el, i) => {
      if (el) el.setDepth(49 + i);
    });
    // A hand-cut papercut arrow (cream fill + soft ink edge) instead of the
    // blue play-emoji glyph, so it belongs to the game's art language.
    const nudge = this.advanceBtn.label.width * 0.5 + 20;
    const ax = btnX + nudge, ay = btnY;
    const arrow = this.add.graphics().setDepth(54);
    arrow.fillStyle(PAPER.shadow, 0.25);
    arrow.fillTriangle(ax - 8, ay - 12 + 3, ax - 8, ay + 12 + 3, ax + 14, ay + 3);
    arrow.fillStyle(PAPER.cream, 1);
    arrow.fillTriangle(ax - 8, ay - 12, ax - 8, ay + 12, ax + 14, ay);
    this.advanceArrow = arrow;

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
      if (layout === 'boss' || layout === 'dutch') {
        this.drawBossArt(line, layout === 'dutch');
      } else if (layout === 'party') {
        this.drawFairySprite(GAME_WIDTH * 0.50, GAME_HEIGHT * 0.28, line.speaker, 50, line);
        this.drawPartyHeroes();
      } else if (layout === 'close' || layout === 'closeR') {
        const cx = layout === 'close' ? GAME_WIDTH * 0.24 : GAME_WIDTH * 0.76;
        this.drawFairySprite(cx, GAME_HEIGHT * 0.46, line.speaker, 175, line);
      } else {
        this.drawFairySprite(GAME_WIDTH * 0.22, GAME_HEIGHT * 0.48, line.speaker, 120, line);
      }
      this.panelCam(layout);
    }

    const isWide = layout === 'wide' || line.wide || false;
    let bubbleLayout = 'left';
    if (layout === 'boss' || layout === 'dutch') bubbleLayout = 'right';
    else if (layout === 'party') bubbleLayout = 'party';
    else if (layout === 'closeR') bubbleLayout = 'closeR';
    else if (layout === 'close') bubbleLayout = 'close';
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
      bx = GAME_WIDTH * 0.3;
      by = GAME_HEIGHT * 0.12;
    } else if (layout === 'right') {
      bx = GAME_WIDTH * 0.02;
      by = GAME_HEIGHT * 0.25;
    } else if (layout === 'party') {
      bx = GAME_WIDTH * 0.19;
      by = GAME_HEIGHT * 0.08;
    } else if (layout === 'close') {
      bx = GAME_WIDTH * 0.44;
      by = GAME_HEIGHT * 0.3;
    } else if (layout === 'closeR') {
      bx = GAME_WIDTH * 0.1;
      by = GAME_HEIGHT * 0.3;
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

  drawFairySprite(cx, cy, speaker, radius, line) {
    const gfx = this.add.graphics();
    const color = this.getSpeakerColor(speaker);
    const r = radius || 120;

    // soft glow rings behind the portrait
    for (let ring = 5; ring >= 1; ring--) {
      gfx.fillStyle(color, 0.08 * ring);
      gfx.fillCircle(cx, cy, r + 40 + ring * 15);
    }
    this.artContainer.add(gfx);

    // A party hero speaking has no bespoke guide face — draw their actual
    // sprite in the medallion instead of the initial-letter fallback.
    const heroDef = !hasGuidePortrait(speaker) ? this.findHeroByName(speaker) : null;
    if (heroDef) {
      const backing = this.add.graphics();
      backing.fillStyle(PAPER.shadow, 0.2); backing.fillCircle(cx + 3, cy + 6, r + 8);
      backing.fillStyle(PAPER.cream, 1); backing.fillCircle(cx, cy, r + 8);
      backing.fillStyle(color, 0.22); backing.fillCircle(cx, cy, r);
      backing.lineStyle(4, color, 0.9); backing.strokeCircle(cx, cy, r + 8);
      this.artContainer.add(backing);
      // Feet sit low in the frame; clip the sprite to the medallion circle.
      const sprite = drawHeroSprite(this, cx, cy + r * 0.5, heroDef, { scale: (r * 2.1) / 300 });
      const maskG = this.make.graphics({ add: false });
      maskG.fillStyle(0xffffff); maskG.fillCircle(cx, cy, r);
      sprite.setMask(maskG.createGeometryMask());
      this.artContainer.add(sprite);
    } else {
      // the speaker's actual face — excited when the line lands with a bang
      const excited = /[!]\s*$/.test(line?.text || '');
      const portrait = drawGuidePortrait(this, cx, cy, speaker, {
        r, expression: excited ? 'excited' : 'neutral',
      });
      this.artContainer.add(portrait);
    }

    const label = this.add.text(cx, cy + r + 28, speaker || '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '20px',
      color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.artContainer.add(label);
  }

  findHeroByName(name) {
    if (!name) return null;
    const n = String(name).trim().toLowerCase();
    return ALL_HEROES.find(h => (h.name || '').toLowerCase() === n) || null;
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

  drawBossArt(line, dutch = false) {
    // Low-angle villain panel: the monster looms large from the lower
    // right under a darkened sky; dutch tilt when it shouts.
    const cx = GAME_WIDTH * 0.72;
    const cy = GAME_HEIGHT * 0.52;
    const enemy = getEnemyById(line.sprite);
    if (!enemy) return;

    const vignette = this.add.graphics();
    vignette.fillStyle(PAPER.inkTeal, 0.35);
    vignette.fillRect(-GAME_WIDTH * 0.25, -GAME_HEIGHT * 0.25, GAME_WIDTH * 1.5, GAME_HEIGHT * 1.5);
    this.artContainer.add(vignette);

    const img = drawMonsterSprite(this, cx, cy, enemy, { scale: 1.9 });
    this.artContainer.add(img);

    // menace glow at the feet
    const glow = this.add.graphics();
    glow.fillStyle(this.getSpeakerColor(enemy.name), 0.22);
    glow.fillEllipse(cx, cy + 220, 560, 130);
    this.artContainer.add(glow);
    this.artContainer.sendToBack(glow);
    this.artContainer.sendToBack(vignette);

    if (dutch) this.artContainer.setRotation(-0.035);
  }

  /**
   * In-panel camera: slow drift on the art container, sized to outlast
   * the read. Container transforms pivot at (0,0), so zooms offset the
   * position to keep the frame center fixed.
   */
  panelCam(layout) {
    const c = this.artContainer;
    this.tweens.killTweensOf(c);
    c.setScale(1).setPosition(0, 0);
    if (layout !== 'dutch') c.setRotation(0);

    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const zoomTo = (s, { dx = 0, dy = 0, dur = 9000 } = {}) => this.tweens.add({
      targets: c,
      scaleX: s, scaleY: s,
      x: cx * (1 - s) + dx, y: cy * (1 - s) + dy,
      duration: dur, ease: 'Sine.out',
    });

    switch (layout) {
      case 'wide': // slow push-in over the establishing shot
        zoomTo(1.06);
        break;
      case 'close': // drift toward the speaker
        zoomTo(1.07, { dx: 40 });
        break;
      case 'closeR':
        zoomTo(1.07, { dx: -40 });
        break;
      case 'party': // gentle rise, like looking up at the heroes
        this.tweens.add({ targets: c, y: -26, duration: 9000, ease: 'Sine.out' });
        break;
      case 'boss': // creep toward the villain
        zoomTo(1.09, { dy: -20, dur: 10000 });
        break;
      case 'dutch': // tilt slowly rights itself as the threat lands
        zoomTo(1.08, { dur: 8000 });
        this.tweens.add({ targets: c, rotation: -0.01, duration: 8000, ease: 'Sine.inOut' });
        break;
      default:
        zoomTo(1.04);
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
