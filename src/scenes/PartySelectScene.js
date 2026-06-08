import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { KNIGHTS, WIZARDS, BUNNIES, spawnHero, getAvailableSupers, levelBonuses, computeLevel, LEVEL_THRESHOLDS, getHeroById, getHeroSignature, getEvolutionData, HERO_BONDS } from '../data/heroes.js';
import { loadSave, writeSave, makeDefaultSave, isHeroUnlocked, getActiveSlot } from '../systems/save.js';
import { getRarityColor, getRarityLabel } from '../data/heroes.js';
import { DIALOGUE } from '../data/dialogue.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite, getHeroCardBg } from '../ui/heroSprites.js';
import { getEvolutionStage, getEvolvedName, getEvolvedTitle, getEvolutionStatBoosts, canEvolveStage2, canEvolveStage3, evolveStage2, evolveStage3 } from '../systems/evolution.js';
import { getHeroBondSummary, getBondStatBonuses } from '../systems/bonds.js';

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
    const singular = { knight: 'knight', wizard: 'wizard', bunny: 'battle bunny' };
    this.gridLabel.setText(`Choose your ${singular[this.activeClass]}`);

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

    // Show evolved name instead of base name
    const evolvedName = getEvolvedName(this.save, hero.id);
    const name = this.add.text(x, y + h * 0.17, evolvedName.toUpperCase(), {
      ...TEXT.heading(),
      fontSize: '16px',
      color: '#2a1808',
      stroke: '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Evolution stage dots (1-3)
    const stage = getEvolutionStage(this.save, hero.id);
    const dotsY = y + h * 0.24;
    const dotGfx = this.add.graphics();
    for (let d = 0; d < 3; d++) {
      const dx = x - 12 + d * 12;
      if (d < stage) {
        dotGfx.fillStyle(0xf0c040, 1);
        dotGfx.fillCircle(dx, dotsY, 4);
        dotGfx.lineStyle(1, 0xd0a020, 1);
        dotGfx.strokeCircle(dx, dotsY, 4);
      } else {
        dotGfx.fillStyle(0xc8b898, 0.6);
        dotGfx.fillCircle(dx, dotsY, 4);
        dotGfx.lineStyle(1, 0x8a7a60, 0.5);
        dotGfx.strokeCircle(dx, dotsY, 4);
      }
    }

    const trait = this.add.text(x, y + h * 0.30, hero.trait, {
      ...TEXT.body(),
      fontSize: '11px',
      color: '#3a2410',
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0);

    // Signature ability name
    const sig = hero.signature;
    const sigText = sig ? this.add.text(x, y + h * 0.39, sig.name, {
      ...TEXT.stat(),
      fontSize: '9px',
      color: sig.type === 'passive' ? '#2a7a2a' : '#c06a10',
      fontStyle: 'italic',
    }).setOrigin(0.5) : null;

    const stats = this.add.text(x, y + h * 0.46, `HP ${hero.maxHp}  ATK ${hero.atk}  DEF ${hero.def}`, {
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

    // "NEW!" badge for freshly unlocked heroes not yet viewed
    let newBadgeGfx = null;
    let newBadgeText = null;
    const viewed = Array.isArray(this.save.viewedHeroes) ? this.save.viewedHeroes : [];
    if (!viewed.includes(hero.id)) {
      newBadgeGfx = this.add.graphics();
      newBadgeGfx.fillStyle(0xe84040, 0.95);
      newBadgeGfx.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 6, 50, 22, 8);
      newBadgeText = this.add.text(x - w / 2 + 31, y - h / 2 + 17, 'NEW!', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5);
      this.tweens.add({
        targets: [newBadgeGfx, newBadgeText],
        scaleX: 1.1, scaleY: 1.1,
        duration: 600,
        yoyo: true, repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    // Evolve badge — check if eligible for Stage 2 or Stage 3
    const partyEntry = (this.save.party || []).find(p => p.id === hero.id);
    const heroLevel = partyEntry?.level || 1;
    const s2Check = canEvolveStage2(this.save, hero.id, heroLevel);
    const s3Check = canEvolveStage3(this.save, hero.id, heroLevel);
    const canEvolve = s2Check.eligible || s3Check.eligible;

    let evolveBadge = null;
    let evolveGlow = null;
    if (canEvolve) {
      // Pulsing glow behind card
      evolveGlow = this.add.graphics();
      evolveGlow.fillStyle(0xf0c040, 0.25);
      evolveGlow.fillRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 14);
      this.tweens.add({
        targets: evolveGlow, alpha: 0.15, duration: 600,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      // EVOLVE badge
      const badgeGfx = this.add.graphics();
      badgeGfx.fillStyle(0xf04040, 0.95);
      badgeGfx.fillRoundedRect(x - 28, y - h / 2 - 8, 56, 16, 6);
      evolveBadge = this.add.text(x, y - h / 2, 'EVOLVE!', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '9px', color: '#fff8e0',
      }).setOrigin(0.5);
      this.tweens.add({
        targets: [evolveBadge, badgeGfx], scaleX: 1.05, scaleY: 1.05,
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      this.heroCardContainer.add([badgeGfx]);
    }

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

    const cardElements = [card.shadow, card.bg];
    if (evolveGlow) cardElements.push(evolveGlow);
    cardElements.push(portrait, name, dotGfx, trait, stats, rarBadge, rarText);
    if (sigText) cardElements.push(sigText);
    if (evolveBadge) cardElements.push(evolveBadge);
    if (newBadgeGfx) cardElements.push(newBadgeGfx);
    if (newBadgeText) cardElements.push(newBadgeText);
    cardElements.push(card.zone);
    this.heroCardContainer.add(cardElements);

    const infoBtn = PaperButton(this, x + w / 2 - 20, y + h / 2 - 16, 'i', {
      w: 32, h: 32, color: 0x4080c0, fontSize: 16, textColor: '#ffffff',
      onClick: () => {
        audio.play('ui/click');
        this.showHeroDetail(hero);
      },
    });
    this.heroCardContainer.add([infoBtn.bg, infoBtn.shadow, infoBtn.label, infoBtn.zone]);
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
        const evoName = getEvolvedName(this.save, hero.id);
        slot.nameTxt.setText(evoName.toUpperCase());
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
      transitionTo(this, this.returnScene, undefined, 300, 'wipe');
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
      }, 300, 'wipe');
    } else {
      transitionTo(this, SCENES.WORLD_MAP, undefined, 300, 'wipe');
    }
  }

  showHeroDetail(hero) {
    if (this._detailOpen) return;
    this._detailOpen = true;

    // Mark hero as viewed (removes NEW badge next time)
    if (!Array.isArray(this.save.viewedHeroes)) this.save.viewedHeroes = [];
    if (!this.save.viewedHeroes.includes(hero.id)) {
      this.save.viewedHeroes.push(hero.id);
      writeSave(this.save, this.slot);
    }

    const elements = [];
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const cx = area.cx, cy = area.cy;
    const pw = 560, ph = 680;

    // Track which tab is active: 'stats', 'evolution', 'bonds'
    this._detailTab = 'stats';

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setDepth(950).setInteractive();
    elements.push(dim);

    const panel = this.add.graphics().setDepth(951);
    panel.fillStyle(0xf5ead0, 0.97);
    panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    panel.lineStyle(3, 0xd4a840, 0.8);
    panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    elements.push(panel);

    // --- HEADER (always visible) ---
    const portrait = drawHeroSprite(this, cx - pw / 2 + 70, cy - ph / 2 + 80, hero, { scale: 0.7 });
    portrait.setDepth(952);
    elements.push(portrait);

    const evolvedName = getEvolvedName(this.save, hero.id);
    const nameT = this.add.text(cx + 20, cy - ph / 2 + 40, evolvedName.toUpperCase(), {
      ...TEXT.title(), fontSize: '26px', color: '#d07818',
      stroke: '#fff8e0', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(952);
    elements.push(nameT);

    const classLabel = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
    const rarCol = getRarityColor(hero.rarity);
    const classT = this.add.text(cx + 20, cy - ph / 2 + 68, `${classLabel} — ${getRarityLabel(hero.rarity)}`, {
      ...TEXT.body(), fontSize: '14px', color: rarCol.main || '#5a3820',
    }).setOrigin(0.5).setDepth(952);
    elements.push(classT);

    const evolvedTitle = getEvolvedTitle(this.save, hero.id);
    const traitT = this.add.text(cx + 20, cy - ph / 2 + 90, evolvedTitle, {
      ...TEXT.body(), fontSize: '12px', color: '#6a5a40', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(952);
    elements.push(traitT);

    // Level + XP bar (compact)
    const partyEntry = (this.save.party || []).find(p => p.id === hero.id);
    const level = partyEntry?.level || 1;
    const xp = partyEntry?.xp || 0;

    const levelT = this.add.text(cx + 20, cy - ph / 2 + 112, `LEVEL ${level}`, {
      ...TEXT.heading(), fontSize: '16px', color: '#3a2410',
    }).setOrigin(0.5).setDepth(952);
    elements.push(levelT);

    // --- TAB BUTTONS ---
    const tabY = cy - ph / 2 + 148;
    const tabLabels = ['STATS', 'EVOLVE', 'BONDS'];
    const tabKeys = ['stats', 'evolution', 'bonds'];
    const tabW = 140;
    const tabH = 36;
    const tabGap = 12;
    const tabStartX = cx - (3 * tabW + 2 * tabGap) / 2 + tabW / 2;
    const tabButtons = [];

    // Content container — everything below tabs goes here so we can swap it
    const contentY = tabY + tabH / 2 + 16;
    let contentElements = [];

    const clearContent = () => {
      contentElements.forEach(e => { if (e && e.destroy) e.destroy(); });
      contentElements = [];
    };

    const renderContent = () => {
      clearContent();
      // Update tab colors
      tabButtons.forEach((tb, i) => {
        const isActive = tabKeys[i] === this._detailTab;
        paintPaperRect(tb.bg, tb.shadow, tb.bx, tb.by, tabW, tabH,
          isActive ? 0xd07818 : 0xc8b898, {
          radius: 10, shadowOff: 3, shadowAlpha: isActive ? 0.4 : 0.2,
          strokeColor: 0x000000, strokeAlpha: 0.15, strokeWidth: isActive ? 3 : 1,
          organic: true, seed: tb.seed,
        });
        tb.label.setColor(isActive ? '#fff8e0' : '#3a2410');
      });

      if (this._detailTab === 'stats') {
        this._renderStatsTab(hero, cx, contentY, pw, level, xp, contentElements);
      } else if (this._detailTab === 'evolution') {
        this._renderEvolutionTab(hero, cx, contentY, pw, level, contentElements, elements, renderContent);
      } else if (this._detailTab === 'bonds') {
        this._renderBondsTab(hero, cx, contentY, pw, contentElements);
      }
    };

    tabLabels.forEach((label, i) => {
      const tx = tabStartX + i * (tabW + tabGap);
      const seed = 5000 + i * 73;
      const btn = PaperButton(this, tx, tabY, label, {
        w: tabW, h: tabH, color: 0xc8b898, fontSize: 13, textColor: '#3a2410',
        seed,
        onClick: () => {
          audio.play('ui/click');
          this._detailTab = tabKeys[i];
          renderContent();
        },
      });
      btn.bg.setDepth(952); btn.shadow.setDepth(952);
      btn.label.setDepth(953); if (btn.zone) btn.zone.setDepth(953);
      btn.bx = tx; btn.by = tabY; btn.seed = seed;
      tabButtons.push(btn);
      elements.push(btn.bg, btn.shadow, btn.label, btn.zone);
    });

    // Initial render
    renderContent();

    // Close button
    const closeBtn = PaperButton(this, cx, cy + ph / 2 - 36, 'CLOSE', {
      w: 180, h: 46, color: 0xd07818, fontSize: 18, textColor: '#fff8e0',
      onClick: () => {
        clearContent();
        clearContent();
        elements.forEach(e => { if (e && e.destroy) e.destroy(); });
        closeBtn.bg.destroy(); closeBtn.shadow.destroy();
        closeBtn.label.destroy(); if (closeBtn.zone) closeBtn.zone.destroy();
        this._detailOpen = false;
        // Rebuild grid to remove NEW badge after viewing
        this.rebuildHeroGrid();
      },
    });
    closeBtn.bg.setDepth(953);
    closeBtn.shadow.setDepth(953);
    closeBtn.label.setDepth(953);
    if (closeBtn.zone) closeBtn.zone.setDepth(953);
  }

  // ----------------------------------------------------------------
  // DETAIL MODAL — Stats Tab
  // ----------------------------------------------------------------
  _renderStatsTab(hero, cx, startY, pw, level, xp, out) {
    const bonus = levelBonuses(level);
    const evoBoosts = getEvolutionStatBoosts(this.save, hero.id);

    // Bond bonuses from current selections
    const partyIds = this.selections.map(s => this.classes[s.class][s.index].id);
    const bondBonus = getBondStatBonuses(this.save, hero.id, partyIds);

    const baseHp = hero.maxHp;
    const baseAtk = hero.atk;
    const baseDef = hero.def;
    const totalHp = baseHp + bonus.maxHp + evoBoosts.maxHp + (bondBonus.hp || 0);
    const totalAtk = baseAtk + bonus.atk + evoBoosts.atk + bondBonus.atk;
    const totalDef = baseDef + bonus.def + evoBoosts.def + bondBonus.def;

    const bonusHp = bonus.maxHp + evoBoosts.maxHp + (bondBonus.hp || 0);
    const bonusAtk = bonus.atk + evoBoosts.atk + bondBonus.atk;
    const bonusDef = bonus.def + evoBoosts.def + bondBonus.def;

    let sy = startY;

    // XP bar
    const nextXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level + 1] : LEVEL_THRESHOLDS[level];
    const currXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level] : nextXp;
    const frac = nextXp > currXp ? (xp - currXp) / (nextXp - currXp) : 1;
    const barW = 260, barH = 14, barX = cx - barW / 2;
    const barBg = this.add.graphics().setDepth(952);
    barBg.fillStyle(0x3a2410, 0.3);
    barBg.fillRoundedRect(barX, sy, barW, barH, 6);
    barBg.fillStyle(0x40a848, 0.9);
    barBg.fillRoundedRect(barX, sy, Math.max(barW * frac, 6), barH, 6);
    out.push(barBg);
    const xpT = this.add.text(cx, sy + barH / 2, `${xp} / ${nextXp} XP`, {
      ...TEXT.stat(), fontSize: '10px', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(953);
    out.push(xpT);
    sy += barH + 16;

    // Stats with bonuses
    const statLine = (label, base, total, bonusVal, yPos) => {
      const baseText = this.add.text(cx - 80, yPos, `${label}  ${total}`, {
        ...TEXT.heading(), fontSize: '18px', color: '#3a2410',
      }).setOrigin(0, 0.5).setDepth(952);
      out.push(baseText);
      if (bonusVal > 0) {
        const bonusText = this.add.text(cx + 60, yPos, `+${bonusVal}`, {
          ...TEXT.stat(), fontSize: '13px', color: '#4a9a40',
        }).setOrigin(0, 0.5).setDepth(952);
        out.push(bonusText);
      }
    };

    statLine('HP', baseHp, totalHp, bonusHp, sy);
    statLine('ATK', baseAtk, totalAtk, bonusAtk, sy + 26);
    statLine('DEF', baseDef, totalDef, bonusDef, sy + 52);
    sy += 74;

    // Bonus breakdown
    const breakdownParts = [];
    if (level > 1) breakdownParts.push(`Lv: +${bonus.maxHp}/${bonus.atk}/${bonus.def}`);
    if (evoBoosts.maxHp || evoBoosts.atk || evoBoosts.def) {
      breakdownParts.push(`Evo: +${evoBoosts.maxHp}/${evoBoosts.atk}/${evoBoosts.def}`);
    }
    if (bondBonus.hp || bondBonus.atk || bondBonus.def) {
      breakdownParts.push(`Bond: +${bondBonus.hp || 0}/${bondBonus.atk}/${bondBonus.def}`);
    }
    if (breakdownParts.length > 0) {
      const bdText = this.add.text(cx, sy, breakdownParts.join('  ') + '  (HP/ATK/DEF)', {
        ...TEXT.stat(), fontSize: '9px', color: '#6a8a40',
      }).setOrigin(0.5).setDepth(952);
      out.push(bdText);
      sy += 20;
    }

    // --- Signature Ability ---
    const sig = hero.signature;
    if (sig) {
      sy += 8;
      const sigColor = sig.type === 'passive' ? '#2a7a2a' : '#c06a10';
      const sigTypeLabel = sig.type === 'passive' ? 'PASSIVE' : 'TRIGGER';
      const sigTitle = this.add.text(cx, sy, `${sig.name}`, {
        ...TEXT.heading(), fontSize: '15px', color: sigColor,
      }).setOrigin(0.5).setDepth(952);
      out.push(sigTitle);
      sy += 20;

      const sigType = this.add.text(cx, sy, sigTypeLabel, {
        ...TEXT.stat(), fontSize: '10px', color: sigColor,
      }).setOrigin(0.5).setDepth(952);
      out.push(sigType);
      sy += 16;

      const sigDesc = this.add.text(cx, sy, sig.description, {
        ...TEXT.body(), fontSize: '12px', color: '#4a3820',
        wordWrap: { width: pw - 80 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(952);
      out.push(sigDesc);
      sy += sigDesc.height + 14;
    }

    // --- Super Moves ---
    const supersTitle = this.add.text(cx, sy, 'SUPER MOVES', {
      ...TEXT.heading(), fontSize: '14px', color: '#c06a10',
    }).setOrigin(0.5).setDepth(952);
    out.push(supersTitle);
    sy += 22;

    const allSupers = hero.superMoves || [];
    allSupers.forEach((s) => {
      const unlocked = level >= (s.unlockLevel || 1);
      const icon = unlocked ? '>' : '?';
      const txt = this.add.text(cx - 100, sy, `${icon}  ${s.name}`, {
        ...TEXT.body(), fontSize: '13px',
        color: unlocked ? '#3a2410' : '#8a7a60',
      }).setOrigin(0, 0.5).setDepth(952);
      out.push(txt);
      const mult = this.add.text(cx + 100, sy, unlocked ? `${s.multiplier}x` : `Lv ${s.unlockLevel}`, {
        ...TEXT.stat(), fontSize: '12px',
        color: unlocked ? '#d07818' : '#8a7a60',
      }).setOrigin(0, 0.5).setDepth(952);
      out.push(mult);
      sy += 24;
    });
  }

  // ----------------------------------------------------------------
  // DETAIL MODAL — Evolution Tab
  // ----------------------------------------------------------------
  _renderEvolutionTab(hero, cx, startY, pw, heroLevel, out, parentElements, refreshCallback) {
    const evoDef = getEvolutionData(hero.id);
    if (!evoDef) {
      const noEvo = this.add.text(cx, startY + 40, 'No evolution data.', {
        ...TEXT.body(), fontSize: '16px', color: '#8a7a60',
      }).setOrigin(0.5).setDepth(952);
      out.push(noEvo);
      return;
    }

    const stage = getEvolutionStage(this.save, hero.id);
    let sy = startY;

    // --- Stage progress visual: [Stage 1] -> [Stage 2] -> [Stage 3] ---
    const stageNames = [
      evoDef.stage1.name,
      evoDef.stage2.name,
      '???',
    ];
    // If stage 3 is reached, show the chosen path name
    if (stage >= 3) {
      const pathId = this.save.heroEvolution?.[hero.id]?.path;
      const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
      if (pathDef) stageNames[2] = pathDef.name;
    }

    const boxW = 120, boxH = 36, arrowW = 30;
    const totalW = 3 * boxW + 2 * arrowW;
    const sx = cx - totalW / 2;

    for (let i = 0; i < 3; i++) {
      const bx = sx + i * (boxW + arrowW) + boxW / 2;
      const isCurrent = (i + 1) === stage;
      const isReached = (i + 1) <= stage;
      const gfx = this.add.graphics().setDepth(952);

      if (isCurrent) {
        gfx.fillStyle(0xd07818, 1);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
        gfx.lineStyle(2, 0xf0c040, 1);
        gfx.strokeRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      } else if (isReached) {
        gfx.fillStyle(0x8ab040, 0.9);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      } else {
        gfx.fillStyle(0xc8b898, 0.5);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      }
      out.push(gfx);

      const label = this.add.text(bx, sy + boxH / 2, stageNames[i], {
        ...TEXT.stat(), fontSize: '11px',
        color: isCurrent ? '#fff8e0' : isReached ? '#ffffff' : '#6a5a40',
      }).setOrigin(0.5).setDepth(953);
      out.push(label);

      // Arrow
      if (i < 2) {
        const ax = bx + boxW / 2 + arrowW / 2;
        const arrow = this.add.text(ax, sy + boxH / 2, '->', {
          ...TEXT.stat(), fontSize: '14px', color: '#8a7a60',
        }).setOrigin(0.5).setDepth(952);
        out.push(arrow);
      }
    }
    sy += boxH + 20;

    // Current stage info
    const stageTitle = getEvolvedTitle(this.save, hero.id);
    const stageT = this.add.text(cx, sy, `Stage ${stage}: ${stageTitle}`, {
      ...TEXT.heading(), fontSize: '16px', color: '#3a2410',
    }).setOrigin(0.5).setDepth(952);
    out.push(stageT);
    sy += 28;

    // --- Stage 2 evolution ---
    if (stage < 2) {
      const s2Check = canEvolveStage2(this.save, hero.id, heroLevel);

      if (s2Check.eligible) {
        const readyText = this.add.text(cx, sy, 'Ready to evolve!', {
          ...TEXT.body(), fontSize: '16px', color: '#4a9a40',
        }).setOrigin(0.5).setDepth(952);
        out.push(readyText);
        sy += 28;

        const evolveBtn = PaperButton(this, cx, sy + 20, `Evolve to ${evoDef.stage2.name}!`, {
          w: 260, h: 46, color: 0xe84840, fontSize: 16, textColor: '#fff8e0',
          onClick: () => {
            audio.play('ui/confirm');
            const result = evolveStage2(this.save, hero.id);
            writeSave(this.save, this.slot);
            transitionTo(this, SCENES.EVOLUTION, {
              heroId: hero.id,
              heroName: hero.name,
              evolvedName: result.name,
              evolvedTitle: result.title,
              stage: 2,
              statBoosts: result.statBoosts,
              newSuper: result.superMove,
              displayColor: hero.displayColor,
              partySelectState: { grade: this.grade, returnScene: this.returnScene },
            }, 300);
          },
        });
        evolveBtn.bg.setDepth(953); evolveBtn.shadow.setDepth(953);
        evolveBtn.label.setDepth(954); if (evolveBtn.zone) evolveBtn.zone.setDepth(954);
        out.push(evolveBtn.bg, evolveBtn.shadow, evolveBtn.label, evolveBtn.zone);
      } else {
        const reqText = this.add.text(cx, sy, s2Check.reason || `Requires Level ${evoDef.stage2.level} + Beat Floor ${evoDef.stage2.floor}`, {
          ...TEXT.body(), fontSize: '13px', color: '#8a6a40',
          wordWrap: { width: pw - 80 }, align: 'center',
        }).setOrigin(0.5, 0).setDepth(952);
        out.push(reqText);
        sy += reqText.height + 10;
      }
    }

    // --- Stage 3 evolution ---
    if (stage === 2) {
      const s3Check = canEvolveStage3(this.save, hero.id, heroLevel);
      const paths = evoDef.stage3.paths;

      const pathsTitle = this.add.text(cx, sy, 'CHOOSE YOUR PATH', {
        ...TEXT.heading(), fontSize: '14px', color: '#c06a10',
      }).setOrigin(0.5).setDepth(952);
      out.push(pathsTitle);
      sy += 24;

      paths.forEach((p, pi) => {
        const pathInfo = s3Check.paths.find(sp => sp.id === p.id);
        const qualifies = pathInfo?.levelMet && pathInfo?.masteryMet;

        const pathGfx = this.add.graphics().setDepth(952);
        const pathBoxW = pw - 60, pathBoxH = 90;
        pathGfx.fillStyle(qualifies ? 0xe8e0c8 : 0xd8d0c0, qualifies ? 0.9 : 0.5);
        pathGfx.fillRoundedRect(cx - pathBoxW / 2, sy, pathBoxW, pathBoxH, 10);
        if (qualifies) {
          pathGfx.lineStyle(2, 0xf0c040, 0.8);
          pathGfx.strokeRoundedRect(cx - pathBoxW / 2, sy, pathBoxW, pathBoxH, 10);
        }
        out.push(pathGfx);

        const nameColor = qualifies ? '#d07818' : '#6a5a40';
        const pName = this.add.text(cx - pathBoxW / 2 + 16, sy + 12, p.name.toUpperCase(), {
          ...TEXT.heading(), fontSize: '14px', color: nameColor,
        }).setOrigin(0, 0).setDepth(953);
        out.push(pName);

        const pDesc = this.add.text(cx - pathBoxW / 2 + 16, sy + 32, p.description, {
          ...TEXT.body(), fontSize: '11px', color: '#4a3820',
          wordWrap: { width: pathBoxW - 140 },
        }).setOrigin(0, 0).setDepth(953);
        out.push(pDesc);

        // Mastery requirement
        const masteryLabel = p.mastery.charAt(0).toUpperCase() + p.mastery.slice(1);
        const reqColor = (pathInfo?.masteryMet) ? '#4a9a40' : '#c04040';
        const reqIcon = (pathInfo?.masteryMet) ? 'OK' : 'Need';
        const reqT = this.add.text(cx + pathBoxW / 2 - 16, sy + 14, `${reqIcon}: ${masteryLabel}`, {
          ...TEXT.stat(), fontSize: '10px', color: reqColor,
        }).setOrigin(1, 0).setDepth(953);
        out.push(reqT);

        const lvlColor = (pathInfo?.levelMet) ? '#4a9a40' : '#c04040';
        const lvlReqT = this.add.text(cx + pathBoxW / 2 - 16, sy + 28, `Lv ${p.level}+`, {
          ...TEXT.stat(), fontSize: '10px', color: lvlColor,
        }).setOrigin(1, 0).setDepth(953);
        out.push(lvlReqT);

        // Stat boost preview
        const boostT = this.add.text(cx + pathBoxW / 2 - 16, sy + 46, `+${p.statBoost.maxHp} HP  +${p.statBoost.atk} ATK  +${p.statBoost.def} DEF`, {
          ...TEXT.stat(), fontSize: '10px', color: '#6a8a40',
        }).setOrigin(1, 0).setDepth(953);
        out.push(boostT);

        if (qualifies) {
          const evolvePathBtn = PaperButton(this, cx + pathBoxW / 2 - 60, sy + pathBoxH - 18, 'EVOLVE', {
            w: 80, h: 28, color: 0xe84840, fontSize: 11, textColor: '#fff8e0',
            onClick: () => {
              audio.play('ui/confirm');
              const result = evolveStage3(this.save, hero.id, p.id);
              writeSave(this.save, this.slot);
              transitionTo(this, SCENES.EVOLUTION, {
                heroId: hero.id,
                heroName: hero.name,
                evolvedName: result.name,
                evolvedTitle: result.title,
                stage: 3,
                statBoosts: result.statBoosts,
                newSuper: result.superMove,
                pathName: p.name,
                pathDescription: p.description,
                displayColor: hero.displayColor,
                partySelectState: { grade: this.grade, returnScene: this.returnScene },
              }, 300);
            },
          });
          evolvePathBtn.bg.setDepth(953); evolvePathBtn.shadow.setDepth(953);
          evolvePathBtn.label.setDepth(954); if (evolvePathBtn.zone) evolvePathBtn.zone.setDepth(954);
          out.push(evolvePathBtn.bg, evolvePathBtn.shadow, evolvePathBtn.label, evolvePathBtn.zone);
        }

        sy += pathBoxH + 10;
      });
    }

    // If already at stage 3, show the chosen path info
    if (stage >= 3) {
      const pathId = this.save.heroEvolution?.[hero.id]?.path;
      const pathDef = evoDef.stage3.paths.find(p => p.id === pathId);
      if (pathDef) {
        const pathLabel = this.add.text(cx, sy, `Path: ${pathDef.name}`, {
          ...TEXT.heading(), fontSize: '15px', color: '#d07818',
        }).setOrigin(0.5).setDepth(952);
        out.push(pathLabel);
        sy += 22;

        const pathDesc = this.add.text(cx, sy, pathDef.description, {
          ...TEXT.body(), fontSize: '12px', color: '#4a3820',
          wordWrap: { width: pw - 80 }, align: 'center',
        }).setOrigin(0.5, 0).setDepth(952);
        out.push(pathDesc);
        sy += pathDesc.height + 12;

        const boostInfo = this.add.text(cx, sy, `Bonus: +${pathDef.statBoost.maxHp} HP  +${pathDef.statBoost.atk} ATK  +${pathDef.statBoost.def} DEF`, {
          ...TEXT.stat(), fontSize: '11px', color: '#6a8a40',
        }).setOrigin(0.5).setDepth(952);
        out.push(boostInfo);
      }

      const maxText = this.add.text(cx, sy + 30, 'MAX EVOLUTION REACHED!', {
        ...TEXT.heading(), fontSize: '16px', color: '#4a9a40',
      }).setOrigin(0.5).setDepth(952);
      out.push(maxText);
    }
  }

  // ----------------------------------------------------------------
  // DETAIL MODAL — Bonds Tab
  // ----------------------------------------------------------------
  _renderBondsTab(hero, cx, startY, pw, out) {
    let sy = startY;

    // Get bond summary for this hero
    const bondSummary = getHeroBondSummary(this.save, hero.id);

    // Also find any HERO_BONDS definitions involving this hero
    const heroBondDefs = HERO_BONDS.filter(b => b.heroes.includes(hero.id));

    if (heroBondDefs.length === 0) {
      const noBonds = this.add.text(cx, sy + 40, 'No bonds available.', {
        ...TEXT.body(), fontSize: '16px', color: '#8a7a60',
      }).setOrigin(0.5).setDepth(952);
      out.push(noBonds);
      return;
    }

    const titleT = this.add.text(cx, sy, 'HERO BONDS', {
      ...TEXT.heading(), fontSize: '14px', color: '#c06a10',
    }).setOrigin(0.5).setDepth(952);
    out.push(titleT);
    sy += 24;

    // Current party selections
    const partyIds = this.selections.map(s => this.classes[s.class][s.index].id);

    heroBondDefs.forEach((bondDef) => {
      const partnerId = bondDef.heroes.find(h => h !== hero.id);
      const partner = getHeroById(partnerId);
      if (!partner) return;

      // Find saved bond data
      const savedBond = bondSummary.find(b => b.partnerId === partnerId);
      const rank = savedBond?.rank || '--';
      const battles = savedBond?.battles || 0;
      const nextRank = savedBond?.nextRank;
      const battlesNeeded = savedBond?.battlesNeeded || 0;
      const inParty = partyIds.includes(partnerId);

      const rowGfx = this.add.graphics().setDepth(952);
      const rowW = pw - 60, rowH = 58;
      rowGfx.fillStyle(inParty ? 0xe0e8c0 : 0xe8e0d0, 0.7);
      rowGfx.fillRoundedRect(cx - rowW / 2, sy, rowW, rowH, 8);
      if (inParty) {
        rowGfx.lineStyle(2, 0x80b040, 0.8);
        rowGfx.strokeRoundedRect(cx - rowW / 2, sy, rowW, rowH, 8);
      }
      out.push(rowGfx);

      // Partner name
      const partnerName = this.add.text(cx - rowW / 2 + 14, sy + 10, partner.name.toUpperCase(), {
        ...TEXT.heading(), fontSize: '13px', color: inParty ? '#3a7a20' : '#3a2410',
      }).setOrigin(0, 0).setDepth(953);
      out.push(partnerName);

      // Bond combo name
      const comboName = this.add.text(cx - rowW / 2 + 14, sy + 30, bondDef.name, {
        ...TEXT.body(), fontSize: '11px', color: '#6a5a40', fontStyle: 'italic',
      }).setOrigin(0, 0).setDepth(953);
      out.push(comboName);

      if (inParty) {
        const partyTag = this.add.text(cx - rowW / 2 + 14, sy + 46, 'IN PARTY', {
          ...TEXT.stat(), fontSize: '8px', color: '#4a9a40',
        }).setOrigin(0, 0).setDepth(953);
        out.push(partyTag);
      }

      // Rank display
      const rankColor = rank === 'S' ? '#f0c040' : rank === 'A' ? '#40a0f0' : rank === 'B' ? '#80b040' : rank === 'C' ? '#a08060' : '#8a7a60';
      const rankT = this.add.text(cx + rowW / 2 - 14, sy + 12, `Rank: ${rank}`, {
        ...TEXT.heading(), fontSize: '14px', color: rankColor,
      }).setOrigin(1, 0).setDepth(953);
      out.push(rankT);

      // Battles and next rank
      let nextText = `${battles} battles`;
      if (nextRank) {
        nextText += ` (${battlesNeeded} to ${nextRank})`;
      }
      const nextT = this.add.text(cx + rowW / 2 - 14, sy + 32, nextText, {
        ...TEXT.stat(), fontSize: '10px', color: '#6a5a40',
      }).setOrigin(1, 0).setDepth(953);
      out.push(nextT);

      sy += rowH + 8;
    });
  }
}
