import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { KNIGHTS, WIZARDS, BUNNIES, spawnHero, getAvailableSupers, levelBonuses, computeLevel, LEVEL_THRESHOLDS, getHeroById } from '../data/heroes.js';
import { loadSave, writeSave, makeDefaultSave, isHeroUnlocked, getActiveSlot } from '../systems/save.js';
import { getRarityColor, getRarityLabel } from '../data/heroes.js';
import { DIALOGUE } from '../data/dialogue.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite, getHeroCardBg } from '../ui/heroSprites.js';

/**
 * PartySelectScene — pick 3 heroes from 15.
 * Rebuilt with paper UI, proper margins, no overflow.
 */
export class PartySelectScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.PARTY_SELECT });
  }

  init(data) {
    this.grade = data?.grade ?? 3;
    this.returnScene = data?.returnScene || null;
    this.editMode = !!this.returnScene;
    this.selections = [];
    this.activeClass = 'knight';
    this.classes = { knight: KNIGHTS, wizard: WIZARDS, bunny: BUNNIES };
    this.classLabels = { knight: 'KNIGHTS', wizard: 'WIZARDS', bunny: 'BATTLE BUNNIES' };
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    fadeInScene(this);
    audio.playMusic('music/title');

    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 333);

    // Cream backdrop
    PaperPanel(this, area.cx, area.cy, area.w - 20, area.h - 20, {
      color: 0xffffff, alpha: 1.0, radius: 28,
    });

    // Header
    this.add.text(area.cx, area.top + 50, 'BUILD YOUR PARTY', {
      ...TEXT.title(),
      fontSize: '44px',
      color: '#d07818',
      stroke: '#fff8e0',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // Class tabs
    this.buildClassTabs(area);

    // Grid label
    this.gridLabel = this.add.text(area.cx, area.top + 200, '', {
      ...TEXT.body(),
      fontSize: '18px',
      color: '#6a4c28',
    }).setOrigin(0.5);

    // Hero card grid container
    this.heroCardContainer = this.add.container(0, 0);

    // Party strip — bottom-left, inside safe area
    this.buildPartyStrip(area);

    // Confirm button — bottom-right
    this.buildConfirmButton(area);

    // Render initial state
    this.rebuildHeroGrid();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  buildClassTabs(area) {
    const tabY = area.top + 135;
    const tabW = 240;
    const tabH = 72;
    const gap = 24;
    const totalW = 3 * tabW + 2 * gap;
    const startX = area.cx - totalW / 2 + tabW / 2;
    const classes = ['knight', 'wizard', 'bunny'];

    this.classTabs = {};
    classes.forEach((cls, i) => {
      const x = startX + i * (tabW + gap);
      // Deterministic seed so re-painting on select doesn't reshuffle
      // the hand-cut wobble.
      const seed = 2000 + i * 131;
      const tab = PaperButton(this, x, tabY, this.classLabels[cls], {
        w: tabW, h: tabH, color: 0xc8b898, fontSize: 20,
        textColor: '#3a2410',
        seed,
        onClick: () => {
          audio.play('ui/click');
          this.switchClass(cls);
        },
      });
      this.classTabs[cls] = { ...tab, x, y: tabY, w: tabW, h: tabH, seed };
    });
    this.updateClassTabs();
  }

  switchClass(cls) {
    this.activeClass = cls;
    this.updateClassTabs();
    this.rebuildHeroGrid();
  }

  updateClassTabs() {
    for (const [cls, tab] of Object.entries(this.classTabs)) {
      const isActive = cls === this.activeClass;
      // Re-paint organically so the hand-cut look survives selection change.
      paintPaperRect(tab.bg, tab.shadow, tab.x, tab.y, tab.w, tab.h,
        isActive ? 0xd07818 : 0xc8b898, {
        radius: 14,
        shadowOff: 5,
        shadowAlpha: isActive ? 0.4 : 0.3,
        strokeColor: 0x000000,
        strokeAlpha: 0.2,
        strokeWidth: isActive ? 4 : 2,
        organic: true,
        seed: tab.seed,
      });
      tab.label.setColor(isActive ? '#fff8e0' : '#3a2410');
    }
  }

  rebuildHeroGrid() {
    this.heroCardContainer.removeAll(true);
    const heroes = this.classes[this.activeClass];
    this.gridLabel.setText(`Choose your ${this.classLabels[this.activeClass].replace(/S$/, '').toLowerCase()}`);

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const cardW = 192;
    const cardH = 260;
    const gap = 24;
    const totalW = heroes.length * cardW + (heroes.length - 1) * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.cy + 10;

    heroes.forEach((hero, i) => {
      const x = startX + i * (cardW + gap);
      this.createHeroCard(x, cardY, cardW, cardH, hero, i);
    });
  }

  createHeroCard(x, y, w, h, hero, heroIndex) {
    const locked = !isHeroUnlocked(this.save, hero.id);
    const isSelected = !locked && this.isHeroSelected(this.activeClass, heroIndex);

    const cardColors = { knight: 0x88b8e8, wizard: 0xa888d8, bunny: 0xf0a8b8 };
    const cardColor = locked ? 0x8a8070 : (cardColors[this.activeClass] || 0xb8d0e8);
    const card = PaperCard(this, x, y, w, h, cardColor, { selected: isSelected });

    if (locked) {
      const silhouette = this.add.graphics();
      silhouette.fillStyle(0x3a3030, 0.7);
      silhouette.fillRoundedRect(x - 40, y - h * 0.25, 80, 100, 10);
      silhouette.fillCircle(x, y - h * 0.32, 25);

      const lockGfx = this.add.graphics();
      const lockSize = 22;
      const lockY = y - 5;
      lockGfx.lineStyle(lockSize * 0.2, 0x6a6050, 1);
      lockGfx.beginPath();
      lockGfx.arc(x, lockY - lockSize * 0.35, lockSize * 0.4, Math.PI, 0, false);
      lockGfx.strokePath();
      lockGfx.fillStyle(0x3a2410, 1);
      lockGfx.fillRoundedRect(x - lockSize * 0.6, lockY, lockSize * 1.2, lockSize * 0.9, 4);
      lockGfx.fillStyle(0xe8a030, 1);
      lockGfx.fillCircle(x, lockY + lockSize * 0.35, lockSize * 0.12);

      const floorHint = hero.unlockedAtFloor || 1;
      const hint = this.add.text(x, y + h * 0.28, `Beat Floor ${floorHint}`, {
        ...TEXT.small(),
        fontSize: '14px',
        color: '#8a7a60',
      }).setOrigin(0.5);

      const name = this.add.text(x, y + h * 0.40, '???', {
        ...TEXT.heading(),
        fontSize: '16px',
        color: '#6a5a40',
      }).setOrigin(0.5);

      this.heroCardContainer.add([card.shadow, card.bg, silhouette, lockGfx, hint, name, card.zone]);
      return;
    }

    const portrait = drawHeroSprite(this, x, y - h * 0.08, hero, { scale: 0.85 });

    const name = this.add.text(x, y + h * 0.20, hero.name.toUpperCase(), {
      ...TEXT.heading(),
      fontSize: '18px',
      color: '#2a1808',
      stroke: '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const trait = this.add.text(x, y + h * 0.32, hero.trait, {
      ...TEXT.body(),
      fontSize: '13px',
      color: '#3a2410',
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0);

    const stats = this.add.text(x, y + h * 0.45, `HP ${hero.maxHp}  ATK ${hero.atk}  DEF ${hero.def}`, {
      ...TEXT.stat(),
      fontSize: '11px',
      color: '#4a3018',
    }).setOrigin(0.5);

    const rarCol = getRarityColor(hero.rarity);
    const rarBadge = this.add.graphics();
    rarBadge.fillStyle(rarCol.glow, 0.9);
    rarBadge.fillRoundedRect(x - 30, y - h / 2 + 6, 60, 18, 6);
    const rarText = this.add.text(x, y - h / 2 + 15, getRarityLabel(hero.rarity), {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '9px', color: '#ffffff',
    }).setOrigin(0.5);

    if (isSelected) {
      const badge = this.add.circle(x + w / 2 - 18, y - h / 2 + 18, 14, 0xf0c040);
      badge.setStrokeStyle(2, 0x1a0e04);
      const check = this.add.text(x + w / 2 - 18, y - h / 2 + 18, '✓', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px',
        color: '#1a0e04',
      }).setOrigin(0.5);
      this.heroCardContainer.add([badge, check]);
    }

    card.zone.on('pointerdown', () => {
      audio.play('ui/click');
      this.toggleHeroSelection(this.activeClass, heroIndex);
    });

    const infoBtn = PaperButton(this, x + w / 2 - 20, y + h / 2 - 16, 'i', {
      w: 32, h: 32, color: 0x4080c0, fontSize: 16, textColor: '#ffffff',
      onClick: () => {
        audio.play('ui/click');
        this.showHeroDetail(hero);
      },
    });
    this.heroCardContainer.add([infoBtn.bg, infoBtn.shadow, infoBtn.label, infoBtn.zone]);

    this.heroCardContainer.add([card.shadow, card.bg, portrait, name, trait, stats, rarBadge, rarText, card.zone]);
  }

  buildPartyStrip(area) {
    const stripX = area.left + 20;
    const stripY = area.bottom - 110;

    this.add.text(stripX, stripY - 60, 'YOUR PARTY', {
      ...TEXT.heading(),
      fontSize: '18px',
      color: '#3a2410',
    }).setOrigin(0, 0.5);

    const slotW = 80;
    const slotH = 100;
    const gap = 12;
    this.partySlots = [];
    for (let i = 0; i < 3; i++) {
      const sx = stripX + i * (slotW + gap) + slotW / 2;
      const sy = stripY;
      const isLead = i === 0;

      const slotBg = this.add.graphics();
      const color = 0xc8b898;
      const radius = 10;
      slotBg.fillStyle(0x000000, 0.25);
      slotBg.fillRoundedRect(sx - slotW / 2 + 3, sy - slotH / 2 + 4, slotW, slotH, radius);
      slotBg.fillStyle(color, 0.8);
      slotBg.fillRoundedRect(sx - slotW / 2, sy - slotH / 2, slotW, slotH, radius);
      if (isLead) {
        slotBg.lineStyle(3, 0xf0c040, 1);
        slotBg.strokeRoundedRect(sx - slotW / 2, sy - slotH / 2, slotW, slotH, radius);
      }

      const portrait = this.add.rectangle(sx, sy - 10, slotW - 16, slotH - 40, 0xd0c8b0, 0.5);
      const nameTxt = this.add.text(sx, sy + slotH / 2 - 14, '—', {
        ...TEXT.stat(),
        fontSize: '11px',
        color: '#3a2410',
      }).setOrigin(0.5);

      if (isLead) {
        this.add.text(sx, sy - slotH / 2 - 10, 'LEAD', {
          ...TEXT.stat(),
          fontSize: '11px',
          color: '#d07818',
        }).setOrigin(0.5);
      }

      const zone = this.add.rectangle(sx, sy, slotW, slotH, 0xffffff, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.removeSlot(i));

      this.partySlots.push({ slotBg, portrait, nameTxt, sx, sy, slotW, slotH, zone });
    }
  }

  updatePartyStrip() {
    for (let i = 0; i < 3; i++) {
      const slot = this.partySlots[i];
      const sel = this.selections[i];
      if (slot.heroSprite) { slot.heroSprite.destroy(); slot.heroSprite = null; }
      if (sel) {
        const hero = this.classes[sel.class][sel.index];
        slot.portrait.setFillStyle(0xd0c8b0, 0.3);
        slot.heroSprite = drawHeroSprite(this, slot.sx, slot.sy - 12, hero, { scale: 0.45 });
        slot.nameTxt.setText(hero.name.toUpperCase());
        slot.nameTxt.setColor('#3a2410');
      } else {
        slot.portrait.setFillStyle(0xd0c8b0, 0.5);
        slot.nameTxt.setText('—');
        slot.nameTxt.setColor('#6a4c28');
      }
    }
  }

  buildConfirmButton(area) {
    const btnH = 74;
    const btnW = 280;
    const x = area.right - 160;
    const y = area.bottom - btnH / 2 - 10;
    const seed = 3131;

    this.confirmBtn = PaperButton(this, x, y, 'BEGIN', {
      w: btnW, h: btnH, color: 0xc8b898, fontSize: 26,
      textColor: '#6a4c28',
      seed,
      onClick: () => this.tryConfirm(),
    });
    this.confirmBtnGeom = { x, y, w: btnW, h: btnH, seed };

    this.confirmHint = this.add.text(x, y - btnH / 2 - 18, 'Pick 3 heroes', {
      ...TEXT.small(),
      fontSize: '14px',
      color: '#6a4c28',
    }).setOrigin(0.5);
  }

  updateConfirmButton() {
    const n = this.selections.length;
    const ready = n >= 3;
    const { x, y, w, h, seed } = this.confirmBtnGeom;
    paintPaperRect(this.confirmBtn.bg, this.confirmBtn.shadow, x, y, w, h,
      ready ? 0xe84840 : 0xc8b898, {
      shadowOff: 5,
      shadowAlpha: 0.35,
      strokeColor: 0x000000,
      strokeAlpha: 0.2,
      strokeWidth: ready ? 3 : 2,
      organic: true,
      seed,
    });
    this.confirmBtn.label.setColor(ready ? '#fff8e0' : '#6a4c28');

    this.confirmHint.setText(ready ? 'Party ready!' : `Pick ${3 - n} more`);
    this.confirmHint.setColor(ready ? '#4aa848' : '#6a4c28');
  }

  isHeroSelected(cls, index) {
    return this.selections.some((s) => s.class === cls && s.index === index);
  }

  toggleHeroSelection(cls, index) {
    const existing = this.selections.findIndex((s) => s.class === cls && s.index === index);
    if (existing >= 0) {
      this.selections.splice(existing, 1);
    } else {
      if (this.selections.length >= 3) return;
      this.selections.push({ class: cls, index });
    }
    this.rebuildHeroGrid();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  removeSlot(i) {
    if (i >= this.selections.length) return;
    this.selections.splice(i, 1);
    this.rebuildHeroGrid();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  tryConfirm() {
    if (this.selections.length < 3) return;
    audio.play('ui/confirm');
    const party = this.selections.map((s) => spawnHero(this.classes[s.class][s.index].id));
    const save = loadSave(this.slot);

    if (this.editMode) {
      const oldParty = save.party || [];
      save.party = party.map((h) => {
        const existing = oldParty.find(p => p.id === h.id);
        if (existing) return { ...existing, hp: existing.maxHp };
        return { id: h.id, name: h.name, hp: h.maxHp, maxHp: h.maxHp, xp: 0, level: 1 };
      });
      writeSave(save, this.slot);
      transitionTo(this, this.returnScene, undefined, 300);
      return;
    }

    const fresh = makeDefaultSave();
    save.grade = this.grade;
    save.party = party.map((h) => ({ id: h.id, name: h.name, hp: h.maxHp, maxHp: h.maxHp }));
    save.floors = fresh.floors;
    save.gold = 0;
    save.potions = 2;
    save.unlockedHeroes = [...fresh.unlockedHeroes];
    save.slotName = this.registry.get('newSlotName') || null;
    writeSave(save, this.slot);

    const isFirstGame = save.floors.every(f => !f.complete);
    if (isFirstGame && DIALOGUE.game_intro) {
      transitionTo(this, SCENES.CUTSCENE, {
        lines: DIALOGUE.game_intro,
        floorId: 1,
        nextScene: SCENES.WORLD_MAP,
        nextData: undefined,
      }, 300);
    } else {
      transitionTo(this, SCENES.WORLD_MAP, undefined, 300);
    }
  }

  showHeroDetail(hero) {
    if (this._detailOpen) return;
    this._detailOpen = true;
    const elements = [];
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const cx = area.cx, cy = area.cy;
    const pw = 520, ph = 620;

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setDepth(950).setInteractive();
    elements.push(dim);

    const panel = this.add.graphics().setDepth(951);
    panel.fillStyle(0xf5ead0, 0.97);
    panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    panel.lineStyle(3, 0xd4a840, 0.8);
    panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    elements.push(panel);

    const portrait = drawHeroSprite(this, cx, cy - 180, hero, { scale: 1.1 });
    portrait.setDepth(952);
    elements.push(portrait);

    const nameT = this.add.text(cx, cy - 90, hero.name.toUpperCase(), {
      ...TEXT.title(), fontSize: '30px', color: '#d07818',
      stroke: '#fff8e0', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(952);
    elements.push(nameT);

    const classLabel = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
    const rarCol = getRarityColor(hero.rarity);
    const classT = this.add.text(cx, cy - 58, `${classLabel} — ${getRarityLabel(hero.rarity)}`, {
      ...TEXT.body(), fontSize: '16px', color: rarCol.main || '#5a3820',
    }).setOrigin(0.5).setDepth(952);
    elements.push(classT);

    const traitT = this.add.text(cx, cy - 36, hero.trait, {
      ...TEXT.body(), fontSize: '14px', color: '#6a5a40', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(952);
    elements.push(traitT);

    const partyEntry = (this.save.party || []).find(p => p.id === hero.id);
    const level = partyEntry?.level || 1;
    const xp = partyEntry?.xp || 0;
    const bonus = levelBonuses(level);
    const hp = hero.maxHp + bonus.maxHp;
    const atk = hero.atk + bonus.atk;
    const def = hero.def + bonus.def;

    const levelT = this.add.text(cx, cy - 8, `LEVEL ${level}`, {
      ...TEXT.heading(), fontSize: '26px', color: '#3a2410',
    }).setOrigin(0.5).setDepth(952);
    elements.push(levelT);

    const nextXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level + 1] : LEVEL_THRESHOLDS[level];
    const currXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level] : nextXp;
    const frac = nextXp > currXp ? (xp - currXp) / (nextXp - currXp) : 1;

    const barW = 260, barH = 18, barX = cx - barW / 2, barY = cy + 18;
    const barBg = this.add.graphics().setDepth(952);
    barBg.fillStyle(0x3a2410, 0.3);
    barBg.fillRoundedRect(barX, barY, barW, barH, 8);
    barBg.fillStyle(0x40a848, 0.9);
    barBg.fillRoundedRect(barX, barY, Math.max(barW * frac, 8), barH, 8);
    elements.push(barBg);

    const xpT = this.add.text(cx, barY + barH / 2, `${xp} / ${nextXp} XP`, {
      ...TEXT.stat(), fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(953);
    elements.push(xpT);

    const statsY = cy + 58;
    const statsT = this.add.text(cx, statsY, `HP ${hp}    ATK ${atk}    DEF ${def}`, {
      ...TEXT.heading(), fontSize: '20px', color: '#3a2410',
    }).setOrigin(0.5).setDepth(952);
    elements.push(statsT);

    if (level > 1) {
      const bonusT = this.add.text(cx, statsY + 24, `(+${bonus.maxHp} HP  +${bonus.atk} ATK  +${bonus.def} DEF from level)`, {
        ...TEXT.stat(), fontSize: '11px', color: '#6a8a40',
      }).setOrigin(0.5).setDepth(952);
      elements.push(bonusT);
    }

    const supersY = statsY + 56;
    const supersTitle = this.add.text(cx, supersY, 'SUPER MOVES', {
      ...TEXT.heading(), fontSize: '16px', color: '#c06a10',
    }).setOrigin(0.5).setDepth(952);
    elements.push(supersTitle);

    const allSupers = hero.superMoves || [];
    allSupers.forEach((s, i) => {
      const sy = supersY + 28 + i * 30;
      const unlocked = level >= (s.unlockLevel || 1);
      const icon = unlocked ? '⚔' : '🔒';
      const txt = this.add.text(cx - 100, sy, `${icon}  ${s.name}`, {
        ...TEXT.body(), fontSize: '15px',
        color: unlocked ? '#3a2410' : '#8a7a60',
      }).setOrigin(0, 0.5).setDepth(952);
      elements.push(txt);
      const mult = this.add.text(cx + 100, sy, unlocked ? `${s.multiplier}x` : `Lv ${s.unlockLevel}`, {
        ...TEXT.stat(), fontSize: '13px',
        color: unlocked ? '#d07818' : '#8a7a60',
      }).setOrigin(0, 0.5).setDepth(952);
      elements.push(mult);
    });

    const closeBtn = PaperButton(this, cx, cy + ph / 2 - 40, 'CLOSE', {
      w: 180, h: 50, color: 0xd07818, fontSize: 20, textColor: '#fff8e0',
      onClick: () => {
        elements.forEach(e => { if (e && e.destroy) e.destroy(); });
        closeBtn.bg.destroy(); closeBtn.shadow.destroy();
        closeBtn.label.destroy(); if (closeBtn.zone) closeBtn.zone.destroy();
        this._detailOpen = false;
      },
    });
    closeBtn.bg.setDepth(953);
    closeBtn.shadow.setDepth(953);
    closeBtn.label.setDepth(953);
    if (closeBtn.zone) closeBtn.zone.setDepth(953);
  }
}
