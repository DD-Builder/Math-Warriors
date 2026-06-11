import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { KNIGHTS, WIZARDS, BUNNIES, spawnHero, levelBonuses, LEVEL_THRESHOLDS, getHeroById, getEvolutionData, HERO_BONDS } from '../data/heroes.js';
import { loadSave, writeSave, makeDefaultSave, isHeroUnlocked, getActiveSlot } from '../systems/save.js';
import { getRarityColor, getRarityLabel } from '../data/heroes.js';
import { DIALOGUE } from '../data/dialogue.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { getEvolutionStage, getEvolvedName, getEvolvedTitle, getEvolutionStatBoosts, canEvolveStage2, canEvolveStage3, evolveStage2, evolveStage3, resolveMasteryId } from '../systems/evolution.js';
import { getHeroBondSummary, getBondStatBonuses, getBondDialogues } from '../systems/bonds.js';
import { getSkillMastery } from '../systems/mastery.js';
import { getEquipmentById } from '../systems/equipment.js';

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
      color: PAPER.cream, alpha: 1.0, radius: 28,
    });

    // Header
    this.add.text(area.cx, area.top + 50, 'BUILD YOUR PARTY', {
      ...TEXT.title(),
      fontSize: '44px',
      color: PAPER_CSS.orange,
      stroke: PAPER_CSS.cream,
      strokeThickness: 5,
    }).setOrigin(0.5);

    // Class tabs
    this.buildClassTabs(area);

    // Grid label
    this.gridLabel = this.add.text(area.cx, area.top + 200, '', {
      ...TEXT.body(),
      fontSize: '18px',
      color: PAPER_CSS.inkTeal,
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
        w: tabW, h: tabH, color: PAPER.sand, fontSize: 20,
        textColor: PAPER_CSS.inkTeal,
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
        isActive ? PAPER.orange : PAPER.sand, {
        radius: 14,
        shadowOff: 5,
        shadowAlpha: isActive ? 0.4 : 0.3,
        strokeColor: PAPER.shadow,
        strokeAlpha: 0.2,
        strokeWidth: isActive ? 4 : 2,
        organic: true,
        seed: tab.seed,
      });
      tab.label.setColor(isActive ? PAPER_CSS.cream : PAPER_CSS.inkTeal);
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

    const cardColors = { knight: PAPER.sky, wizard: PAPER.lavender, bunny: PAPER.coral };
    const cardColor = locked ? PAPER.sand : (cardColors[this.activeClass] || 0xb8d0e8);
    const card = PaperCard(this, x, y, w, h, cardColor, { selected: isSelected });

    if (locked) {
      const silhouette = this.add.graphics();
      silhouette.fillStyle(PAPER.inkTeal, 0.7);
      silhouette.fillRoundedRect(x - 40, y - h * 0.25, 80, 100, 10);
      silhouette.fillCircle(x, y - h * 0.32, 25);

      const lockGfx = this.add.graphics();
      const lockSize = 22;
      const lockY = y - 5;
      lockGfx.lineStyle(lockSize * 0.2, PAPER.sand, 1);
      lockGfx.beginPath();
      lockGfx.arc(x, lockY - lockSize * 0.35, lockSize * 0.4, Math.PI, 0, false);
      lockGfx.strokePath();
      lockGfx.fillStyle(PAPER.inkTeal, 1);
      lockGfx.fillRoundedRect(x - lockSize * 0.6, lockY, lockSize * 1.2, lockSize * 0.9, 4);
      lockGfx.fillStyle(PAPER.orange, 1);
      lockGfx.fillCircle(x, lockY + lockSize * 0.35, lockSize * 0.12);

      const floorHint = hero.unlockedAtFloor || 1;
      const hint = this.add.text(x, y + h * 0.28, `Beat Floor ${floorHint}`, {
        ...TEXT.small(),
        fontSize: '14px',
        color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      const name = this.add.text(x, y + h * 0.40, '???', {
        ...TEXT.heading(),
        fontSize: '16px',
        color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      this.heroCardContainer.add([card.shadow, card.bg, silhouette, lockGfx, hint, name, card.zone]);
      return;
    }

    // --- CLEAN CARD LAYOUT ---
    // Portrait takes top 60% of card, centered
    const portraitY = y - h * 0.15;
    const stage = getEvolutionStage(this.save, hero.id);
    const portrait = createAnimatedHero(this, x, portraitY, hero, { scale: 0.35, evolutionStage: stage });
    if (portrait.setSelectionSway) portrait.setSelectionSway();

    // Hero name in bold below the portrait (16px)
    const evolvedName = getEvolvedName(this.save, hero.id);
    const name = this.add.text(x, y + h * 0.22, evolvedName.toUpperCase(), {
      ...TEXT.heading(),
      fontSize: '16px',
      color: PAPER_CSS.inkTeal,
      stroke: PAPER_CSS.cream,
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Trait text — small italic below the name, inside the card
    const trait = this.add.text(x, y + h * 0.33, hero.trait, {
      ...TEXT.body(),
      fontSize: '13px',
      color: PAPER_CSS.inkTeal,
      fontStyle: 'italic',
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0);

    // Stats displayed BELOW the card (not inside it) — 10px below card bottom edge
    const statsY = y + h / 2 + 10;
    const statSpacing = w / 3;
    const statStartX = x - statSpacing;
    const hpText = this.add.text(statStartX, statsY, `HP ${hero.maxHp}`, {
      ...TEXT.stat(),
      fontSize: '14px',
      color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5, 0);
    const atkText = this.add.text(x, statsY, `ATK ${hero.atk}`, {
      ...TEXT.stat(),
      fontSize: '14px',
      color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5, 0);
    const defText = this.add.text(statStartX + statSpacing * 2, statsY, `DEF ${hero.def}`, {
      ...TEXT.stat(),
      fontSize: '14px',
      color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5, 0);

    // Subtle gold dot for new/unviewed heroes (6px circle, top-left corner)
    let newDotGfx = null;
    const viewed = Array.isArray(this.save.viewedHeroes) ? this.save.viewedHeroes : [];
    if (!viewed.includes(hero.id)) {
      newDotGfx = this.add.graphics();
      newDotGfx.fillStyle(PAPER.gold, 1);
      newDotGfx.fillCircle(x - w / 2 + 12, y - h / 2 + 12, 6);
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
      evolveGlow.fillStyle(PAPER.gold, 0.25);
      evolveGlow.fillRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 14);
      this.tweens.add({
        targets: evolveGlow, alpha: 0.15, duration: 600,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      // EVOLVE badge
      const badgeGfx = this.add.graphics();
      badgeGfx.fillStyle(PAPER.coralD, 0.95);
      badgeGfx.fillRoundedRect(x - 28, y - h / 2 - 8, 56, 16, 6);
      evolveBadge = this.add.text(x, y - h / 2, 'EVOLVE!', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '14px', color: PAPER_CSS.cream,
      }).setOrigin(0.5);
      this.tweens.add({
        targets: [evolveBadge, badgeGfx], scaleX: 1.05, scaleY: 1.05,
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      this.heroCardContainer.add([badgeGfx]);
    }

    if (isSelected) {
      const badge = this.add.circle(x + w / 2 - 18, y - h / 2 + 18, 14, PAPER.gold);
      badge.setStrokeStyle(2, PAPER.inkTeal);
      const check = this.add.text(x + w / 2 - 18, y - h / 2 + 18, '✓', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px',
        color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);
      this.heroCardContainer.add([badge, check]);
    }

    card.zone.on('pointerdown', () => {
      audio.play('ui/click');
      this.toggleHeroSelection(this.activeClass, heroIndex);
    });

    const cardElements = [card.shadow, card.bg];
    if (evolveGlow) cardElements.push(evolveGlow);
    cardElements.push(portrait, name, trait, hpText, atkText, defText);
    if (evolveBadge) cardElements.push(evolveBadge);
    if (newDotGfx) cardElements.push(newDotGfx);
    cardElements.push(card.zone);
    this.heroCardContainer.add(cardElements);

    // 44x44 touch target (accessibility), tucked inside the card corner
    const infoBtn = PaperButton(this, x + w / 2 - 30, y + h / 2 - 30, 'i', {
      w: 52, h: 52, color: PAPER.teal, fontSize: 18, textColor: PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/click');
        this.showHeroDetail(hero);
      },
    });
    this.heroCardContainer.add([infoBtn.bg, infoBtn.shadow, infoBtn.label, infoBtn.zone]);
  }

  buildPartyStrip(area) {
    const stripX = area.left + 20;
    const stripY = area.bottom - 100;

    // "YOUR PARTY" label above the slots, left-aligned and raised higher
    this.add.text(stripX, stripY - 72, 'YOUR PARTY', {
      ...TEXT.heading(),
      fontSize: '16px',
      color: PAPER_CSS.inkTeal,
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
      const color = PAPER.sand;
      const radius = 10;
      slotBg.fillStyle(PAPER.shadow, 0.25);
      slotBg.fillRoundedRect(sx - slotW / 2 + 3, sy - slotH / 2 + 4, slotW, slotH, radius);
      slotBg.fillStyle(color, 0.8);
      slotBg.fillRoundedRect(sx - slotW / 2, sy - slotH / 2, slotW, slotH, radius);
      if (isLead) {
        slotBg.lineStyle(3, PAPER.gold, 1);
        slotBg.strokeRoundedRect(sx - slotW / 2, sy - slotH / 2, slotW, slotH, radius);
      }

      const portrait = this.add.rectangle(sx, sy - 10, slotW - 16, slotH - 40, PAPER.creamD, 0.5);
      const nameTxt = this.add.text(sx, sy + slotH / 2 - 14, '—', {
        ...TEXT.stat(),
        fontSize: '13px',
        color: PAPER_CSS.inkTeal,
      }).setOrigin(0.5);

      if (isLead) {
        // Position LEAD label inside the slot top, not above it
        this.add.text(sx, sy - slotH / 2 + 10, 'LEAD', {
          ...TEXT.stat(),
          fontSize: '14px',
          color: PAPER_CSS.orange,
        }).setOrigin(0.5);
      }

      const zone = this.add.rectangle(sx, sy, slotW, slotH, PAPER.white, 0).setInteractive({ useHandCursor: true });
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
        slot.portrait.setFillStyle(PAPER.creamD, 0.3);
        const slotEvoStage = getEvolutionStage(this.save, hero.id);
        slot.heroSprite = createAnimatedHero(this, slot.sx, slot.sy - 12, hero, { scale: 0.22, evolutionStage: slotEvoStage });
        if (slot.heroSprite.setSelectionSway) slot.heroSprite.setSelectionSway();
        const evoName = getEvolvedName(this.save, hero.id);
        slot.nameTxt.setText(evoName.toUpperCase());
        slot.nameTxt.setColor(PAPER_CSS.inkTeal);
      } else {
        slot.portrait.setFillStyle(PAPER.creamD, 0.5);
        slot.nameTxt.setText('—');
        slot.nameTxt.setColor(PAPER_CSS.inkTeal);
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
      w: btnW, h: btnH, color: PAPER.sand, fontSize: 26,
      textColor: PAPER_CSS.inkTeal,
      seed,
      onClick: () => this.tryConfirm(),
    });
    this.confirmBtnGeom = { x, y, w: btnW, h: btnH, seed };

    this.confirmHint = this.add.text(x, y - btnH / 2 - 18, 'Pick 3 heroes', {
      ...TEXT.small(),
      fontSize: '14px',
      color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);
  }

  updateConfirmButton() {
    const n = this.selections.length;
    const ready = n >= 3;
    const { x, y, w, h, seed } = this.confirmBtnGeom;
    paintPaperRect(this.confirmBtn.bg, this.confirmBtn.shadow, x, y, w, h,
      ready ? PAPER.coralD : PAPER.sand, {
      shadowOff: 5,
      shadowAlpha: 0.35,
      strokeColor: PAPER.shadow,
      strokeAlpha: 0.2,
      strokeWidth: ready ? 3 : 2,
      organic: true,
      seed,
    });
    this.confirmBtn.label.setColor(ready ? PAPER_CSS.cream : PAPER_CSS.inkTeal);

    this.confirmHint.setText(ready ? 'Party ready!' : `Pick ${3 - n} more`);
    this.confirmHint.setColor(ready ? '#7d9f6d' : PAPER_CSS.inkTeal);
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

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.6)
      .setDepth(950).setInteractive();
    elements.push(dim);

    const panel = this.add.graphics().setDepth(951);
    panel.fillStyle(PAPER.cream, 0.97);
    panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    panel.lineStyle(3, PAPER.gold, 0.8);
    panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    elements.push(panel);

    // --- HEADER (always visible) ---
    const detailEvoStage = getEvolutionStage(this.save, hero.id);
    const portrait = drawHeroSprite(this, cx - pw / 2 + 70, cy - ph / 2 + 80, hero, { scale: 0.7, evolutionStage: detailEvoStage });
    portrait.setDepth(952);
    elements.push(portrait);

    const evolvedName = getEvolvedName(this.save, hero.id);
    const nameT = this.add.text(cx + 20, cy - ph / 2 + 40, evolvedName.toUpperCase(), {
      ...TEXT.title(), fontSize: '26px', color: PAPER_CSS.orange,
      stroke: PAPER_CSS.cream, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(952);
    elements.push(nameT);

    const classLabel = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
    const rarCol = getRarityColor(hero.rarity);
    const classT = this.add.text(cx + 20, cy - ph / 2 + 68, `${classLabel} — ${getRarityLabel(hero.rarity)}`, {
      ...TEXT.body(), fontSize: '14px', color: rarCol.main || PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setDepth(952);
    elements.push(classT);

    const evolvedTitle = getEvolvedTitle(this.save, hero.id);
    const traitT = this.add.text(cx + 20, cy - ph / 2 + 90, evolvedTitle, {
      ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal, fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(952);
    elements.push(traitT);

    // Level + XP bar (compact)
    const partyEntry = (this.save.party || []).find(p => p.id === hero.id);
    const level = partyEntry?.level || 1;
    const xp = partyEntry?.xp || 0;

    const levelT = this.add.text(cx + 20, cy - ph / 2 + 112, `LEVEL ${level}`, {
      ...TEXT.heading(), fontSize: '16px', color: PAPER_CSS.inkTeal,
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
          isActive ? PAPER.orange : PAPER.sand, {
          radius: 10, shadowOff: 3, shadowAlpha: isActive ? 0.4 : 0.2,
          strokeColor: PAPER.shadow, strokeAlpha: 0.15, strokeWidth: isActive ? 3 : 1,
          organic: true, seed: tb.seed,
        });
        tb.label.setColor(isActive ? PAPER_CSS.cream : PAPER_CSS.inkTeal);
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
        w: tabW, h: tabH, color: PAPER.sand, fontSize: 13, textColor: PAPER_CSS.inkTeal,
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
    barBg.fillStyle(PAPER.inkTeal, 0.3);
    barBg.fillRoundedRect(barX, sy, barW, barH, 6);
    barBg.fillStyle(PAPER.forest, 0.9);
    barBg.fillRoundedRect(barX, sy, Math.max(barW * frac, 6), barH, 6);
    out.push(barBg);
    const xpT = this.add.text(cx, sy + barH / 2, `${xp} / ${nextXp} XP`, {
      ...TEXT.stat(), fontSize: '14px', color: PAPER_CSS.cream,
    }).setOrigin(0.5, 0.5).setDepth(953);
    out.push(xpT);
    sy += barH + 16;

    // Stats with bonuses
    const statLine = (label, base, total, bonusVal, yPos) => {
      const baseText = this.add.text(cx - 80, yPos, `${label}  ${total}`, {
        ...TEXT.heading(), fontSize: '18px', color: PAPER_CSS.inkTeal,
      }).setOrigin(0, 0.5).setDepth(952);
      out.push(baseText);
      if (bonusVal > 0) {
        const bonusText = this.add.text(cx + 60, yPos, `+${bonusVal}`, {
          ...TEXT.stat(), fontSize: '14px', color: '#7d9f6d',
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
        ...TEXT.stat(), fontSize: '14px', color: '#7d9f6d',
      }).setOrigin(0.5).setDepth(952);
      out.push(bdText);
      sy += 20;
    }

    // --- Equipped gear (save.equipment.heroN, keyed by party slot) ---
    const partyIdx = (this.save.party || []).findIndex(p => p && p.id === hero.id);
    if (partyIdx >= 0 && partyIdx < 3) {
      const equip = this.save.equipment?.[`hero${partyIdx}`] || {};
      const wpn = equip.weapon ? getEquipmentById(equip.weapon) : null;
      const arm = equip.armor ? getEquipmentById(equip.armor) : null;
      const acc = equip.accessory ? getEquipmentById(equip.accessory) : null;
      const pieces = [];
      if (wpn) pieces.push(`⚔ ${wpn.name}`);
      if (arm) pieces.push(`\u{1F6E1} ${arm.name}`);
      if (acc) pieces.push(`❤ ${acc.name}`);
      if (pieces.length > 0) {
        const gearT = this.add.text(cx, sy, pieces.join('   '), {
          ...TEXT.stat(), fontSize: '14px', color: PAPER_CSS.inkTeal,
        }).setOrigin(0.5).setDepth(952);
        out.push(gearT);
        sy += 18;
      }
    }

    // --- Signature Ability ---
    const sig = hero.signature;
    if (sig) {
      sy += 8;
      const sigColor = sig.type === 'passive' ? '#3c6b4f' : PAPER_CSS.orange;
      const sigTypeLabel = sig.type === 'passive' ? 'PASSIVE' : 'TRIGGER';
      const sigTitle = this.add.text(cx, sy, `${sig.name}`, {
        ...TEXT.heading(), fontSize: '15px', color: sigColor,
      }).setOrigin(0.5).setDepth(952);
      out.push(sigTitle);
      sy += 20;

      const sigType = this.add.text(cx, sy, sigTypeLabel, {
        ...TEXT.stat(), fontSize: '14px', color: sigColor,
      }).setOrigin(0.5).setDepth(952);
      out.push(sigType);
      sy += 16;

      const sigDesc = this.add.text(cx, sy, sig.description, {
        ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal,
        wordWrap: { width: pw - 80 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(952);
      out.push(sigDesc);
      sy += sigDesc.height + 14;
    }

    // --- Super Moves ---
    const supersTitle = this.add.text(cx, sy, 'SUPER MOVES', {
      ...TEXT.heading(), fontSize: '14px', color: PAPER_CSS.orange,
    }).setOrigin(0.5).setDepth(952);
    out.push(supersTitle);
    sy += 22;

    const allSupers = hero.superMoves || [];
    allSupers.forEach((s) => {
      const unlocked = level >= (s.unlockLevel || 1);
      const icon = unlocked ? '>' : '?';
      const txt = this.add.text(cx - 100, sy, `${icon}  ${s.name}`, {
        ...TEXT.body(), fontSize: '14px',
        color: unlocked ? PAPER_CSS.inkTeal : PAPER_CSS.sand,
      }).setOrigin(0, 0.5).setDepth(952);
      out.push(txt);
      const mult = this.add.text(cx + 100, sy, unlocked ? `${s.multiplier}x` : `Lv ${s.unlockLevel}`, {
        ...TEXT.stat(), fontSize: '14px',
        color: unlocked ? PAPER_CSS.orange : PAPER_CSS.sand,
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
        ...TEXT.body(), fontSize: '16px', color: PAPER_CSS.sand,
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
        gfx.fillStyle(PAPER.orange, 1);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
        gfx.lineStyle(2, PAPER.gold, 1);
        gfx.strokeRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      } else if (isReached) {
        gfx.fillStyle(PAPER.leaf, 0.9);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      } else {
        gfx.fillStyle(PAPER.sand, 0.5);
        gfx.fillRoundedRect(bx - boxW / 2, sy, boxW, boxH, 8);
      }
      out.push(gfx);

      const label = this.add.text(bx, sy + boxH / 2, stageNames[i], {
        ...TEXT.stat(), fontSize: '14px',
        color: isCurrent ? PAPER_CSS.cream : isReached ? PAPER_CSS.cream : PAPER_CSS.inkTeal,
      }).setOrigin(0.5).setDepth(953);
      out.push(label);

      // Arrow
      if (i < 2) {
        const ax = bx + boxW / 2 + arrowW / 2;
        const arrow = this.add.text(ax, sy + boxH / 2, '->', {
          ...TEXT.stat(), fontSize: '14px', color: PAPER_CSS.sand,
        }).setOrigin(0.5).setDepth(952);
        out.push(arrow);
      }
    }
    sy += boxH + 20;

    // Current stage info
    const stageTitle = getEvolvedTitle(this.save, hero.id);
    const stageT = this.add.text(cx, sy, `Stage ${stage}: ${stageTitle}`, {
      ...TEXT.heading(), fontSize: '16px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setDepth(952);
    out.push(stageT);
    sy += 28;

    // --- Stage 2 evolution ---
    if (stage < 2) {
      const s2Check = canEvolveStage2(this.save, hero.id, heroLevel);

      if (s2Check.eligible) {
        const readyText = this.add.text(cx, sy, 'Ready to evolve!', {
          ...TEXT.body(), fontSize: '16px', color: '#7d9f6d',
        }).setOrigin(0.5).setDepth(952);
        out.push(readyText);
        sy += 28;

        const evolveBtn = PaperButton(this, cx, sy + 20, `Evolve to ${evoDef.stage2.name}!`, {
          w: 260, h: 46, color: PAPER.coralD, fontSize: 16, textColor: PAPER_CSS.cream,
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
          ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.sand,
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
        ...TEXT.heading(), fontSize: '14px', color: PAPER_CSS.orange,
      }).setOrigin(0.5).setDepth(952);
      out.push(pathsTitle);
      sy += 24;

      paths.forEach((p, pi) => {
        const pathInfo = s3Check.paths.find(sp => sp.id === p.id);
        const qualifies = pathInfo?.levelMet && pathInfo?.masteryMet;

        const pathGfx = this.add.graphics().setDepth(952);
        const pathBoxW = pw - 60, pathBoxH = 90;
        pathGfx.fillStyle(qualifies ? PAPER.cream : PAPER.creamD, qualifies ? 0.9 : 0.5);
        pathGfx.fillRoundedRect(cx - pathBoxW / 2, sy, pathBoxW, pathBoxH, 10);
        if (qualifies) {
          pathGfx.lineStyle(2, PAPER.gold, 0.8);
          pathGfx.strokeRoundedRect(cx - pathBoxW / 2, sy, pathBoxW, pathBoxH, 10);
        }
        out.push(pathGfx);

        const nameColor = qualifies ? PAPER_CSS.orange : PAPER_CSS.inkTeal;
        const pName = this.add.text(cx - pathBoxW / 2 + 16, sy + 12, p.name.toUpperCase(), {
          ...TEXT.heading(), fontSize: '14px', color: nameColor,
        }).setOrigin(0, 0).setDepth(953);
        out.push(pName);

        const pDesc = this.add.text(cx - pathBoxW / 2 + 16, sy + 32, p.description, {
          ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal,
          wordWrap: { width: pathBoxW - 140 },
        }).setOrigin(0, 0).setDepth(953);
        out.push(pDesc);

        // Mastery requirement
        const masteryLabel = p.mastery.charAt(0).toUpperCase() + p.mastery.slice(1);
        const reqColor = (pathInfo?.masteryMet) ? '#7d9f6d' : '#d06a4d';
        const reqIcon = (pathInfo?.masteryMet) ? 'OK' : 'Need';
        const reqT = this.add.text(cx + pathBoxW / 2 - 16, sy + 14, `${reqIcon}: ${masteryLabel}`, {
          ...TEXT.stat(), fontSize: '14px', color: reqColor,
        }).setOrigin(1, 0).setDepth(953);
        out.push(reqT);

        const lvlColor = (pathInfo?.levelMet) ? '#7d9f6d' : '#d06a4d';
        const lvlReqT = this.add.text(cx + pathBoxW / 2 - 16, sy + 28, `Lv ${p.level}+`, {
          ...TEXT.stat(), fontSize: '14px', color: lvlColor,
        }).setOrigin(1, 0).setDepth(953);
        out.push(lvlReqT);

        // Stat boost preview
        const boostT = this.add.text(cx + pathBoxW / 2 - 16, sy + 46, `+${p.statBoost.maxHp} HP  +${p.statBoost.atk} ATK  +${p.statBoost.def} DEF`, {
          ...TEXT.stat(), fontSize: '14px', color: '#7d9f6d',
        }).setOrigin(1, 0).setDepth(953);
        out.push(boostT);

        // Live mastery progress hint for paths not yet qualified
        if (!qualifies) {
          const m = getSkillMastery(this.save, resolveMasteryId(p.mastery));
          const pct = Math.round((m.accuracy || 0) * 100);
          const hintT = this.add.text(cx - pathBoxW / 2 + 16, sy + pathBoxH - 8,
            `${masteryLabel}: ${m.total} answered, ${pct}% — need 10+ at 65%`, {
            ...TEXT.stat(), fontSize: '14px', color: PAPER_CSS.sand, fontStyle: 'italic',
          }).setOrigin(0, 1).setDepth(953);
          out.push(hintT);
        }

        if (qualifies) {
          const evolvePathBtn = PaperButton(this, cx + pathBoxW / 2 - 60, sy + pathBoxH - 18, 'EVOLVE', {
            w: 80, h: 28, color: PAPER.coralD, fontSize: 11, textColor: PAPER_CSS.cream,
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
          ...TEXT.heading(), fontSize: '15px', color: PAPER_CSS.orange,
        }).setOrigin(0.5).setDepth(952);
        out.push(pathLabel);
        sy += 22;

        const pathDesc = this.add.text(cx, sy, pathDef.description, {
          ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal,
          wordWrap: { width: pw - 80 }, align: 'center',
        }).setOrigin(0.5, 0).setDepth(952);
        out.push(pathDesc);
        sy += pathDesc.height + 12;

        const boostInfo = this.add.text(cx, sy, `Bonus: +${pathDef.statBoost.maxHp} HP  +${pathDef.statBoost.atk} ATK  +${pathDef.statBoost.def} DEF`, {
          ...TEXT.stat(), fontSize: '14px', color: '#7d9f6d',
        }).setOrigin(0.5).setDepth(952);
        out.push(boostInfo);
      }

      const maxText = this.add.text(cx, sy + 30, 'MAX EVOLUTION REACHED!', {
        ...TEXT.heading(), fontSize: '16px', color: '#7d9f6d',
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
        ...TEXT.body(), fontSize: '16px', color: PAPER_CSS.sand,
      }).setOrigin(0.5).setDepth(952);
      out.push(noBonds);
      return;
    }

    const titleT = this.add.text(cx, sy, 'HERO BONDS', {
      ...TEXT.heading(), fontSize: '14px', color: PAPER_CSS.orange,
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
      rowGfx.fillStyle(inParty ? PAPER.cream : PAPER.creamD, 0.7);
      rowGfx.fillRoundedRect(cx - rowW / 2, sy, rowW, rowH, 8);
      if (inParty) {
        rowGfx.lineStyle(2, PAPER.leaf, 0.8);
        rowGfx.strokeRoundedRect(cx - rowW / 2, sy, rowW, rowH, 8);
      }
      out.push(rowGfx);

      // Partner name
      const partnerName = this.add.text(cx - rowW / 2 + 14, sy + 10, partner.name.toUpperCase(), {
        ...TEXT.heading(), fontSize: '14px', color: inParty ? '#3c6b4f' : PAPER_CSS.inkTeal,
      }).setOrigin(0, 0).setDepth(953);
      out.push(partnerName);

      // Bond combo name
      const comboName = this.add.text(cx - rowW / 2 + 14, sy + 30, bondDef.name, {
        ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal, fontStyle: 'italic',
      }).setOrigin(0, 0).setDepth(953);
      out.push(comboName);

      if (inParty) {
        const partyTag = this.add.text(cx - rowW / 2 + 14, sy + 46, 'IN PARTY', {
          ...TEXT.stat(), fontSize: '14px', color: '#7d9f6d',
        }).setOrigin(0, 0).setDepth(953);
        out.push(partyTag);
      }

      // Rank display
      const rankColor = rank === 'S' ? '#ecb964' : rank === 'A' ? '#7fb3ae' : rank === 'B' ? '#7d9f6d' : rank === 'C' ? '#d9cfb2' : '#d9cfb2';
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
        ...TEXT.stat(), fontSize: '14px', color: PAPER_CSS.inkTeal,
      }).setOrigin(1, 0).setDepth(953);
      out.push(nextT);

      sy += rowH + 4;

      // Unlocked bond dialogues — show the 2 most recent rank dialogues
      if (savedBond?.rank) {
        const dialogues = getBondDialogues(this.save, bondDef.heroes[0], bondDef.heroes[1]).slice(-2);
        dialogues.forEach((d) => {
          const lines = Array.isArray(d.text) ? d.text.join('\n') : String(d.text);
          const dlgT = this.add.text(cx - rowW / 2 + 24, sy, lines, {
            ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.inkTeal, fontStyle: 'italic',
            wordWrap: { width: rowW - 48 }, lineSpacing: 2,
          }).setOrigin(0, 0).setDepth(953);
          out.push(dlgT);
          sy += dlgT.height + 4;
        });
      }

      sy += 4;
    });
  }
}
