import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { KNIGHTS, WIZARDS, BUNNIES, spawnHero } from '../data/heroes.js';
import { loadSave, writeSave, makeDefaultSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea, paintPaperRect } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';

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
    this.selections = [];
    this.activeClass = 'knight';
    this.classes = { knight: KNIGHTS, wizard: WIZARDS, bunny: BUNNIES };
    this.classLabels = { knight: 'KNIGHTS', wizard: 'WIZARDS', bunny: 'BATTLE BUNNIES' };
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    fadeInScene(this);
    audio.playMusic('music/title');

    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 333);

    // Cream backdrop
    PaperPanel(this, area.cx, area.cy, area.w - 20, area.h - 20, {
      color: 0xfff8e8, alpha: 0.92, radius: 28,
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
    const cardW = 200;
    const cardH = 260;
    const gap = 18;
    const totalW = heroes.length * cardW + (heroes.length - 1) * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.cy + 10;

    heroes.forEach((hero, i) => {
      const x = startX + i * (cardW + gap);
      this.createHeroCard(x, cardY, cardW, cardH, hero, i);
    });
  }

  createHeroCard(x, y, w, h, hero, heroIndex) {
    const isSelected = this.isHeroSelected(this.activeClass, heroIndex);

    // Card paper
    const card = PaperCard(this, x, y, w, h, hero.displayColor, { selected: isSelected });

    // Hero portrait drawn procedurally inside the card
    const portrait = drawHeroSprite(this, x, y - h * 0.12, hero, { scale: 0.6 });

    const name = this.add.text(x, y + h * 0.15, hero.name.toUpperCase(), {
      ...TEXT.heading(),
      fontSize: '18px',
      color: '#fff8e0',
      stroke: '#1a0e04',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const trait = this.add.text(x, y + h * 0.28, hero.trait, {
      ...TEXT.body(),
      fontSize: '13px',
      color: '#fff8e0',
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0);

    const stats = this.add.text(x, y + h * 0.45, `HP ${hero.maxHp}  ATK ${hero.atk}  DEF ${hero.def}`, {
      ...TEXT.stat(),
      fontSize: '11px',
      color: '#ffe0a0',
    }).setOrigin(0.5);

    // Selected badge — both the circle AND the checkmark must be added
    // to the container, otherwise rebuildHeroGrid's removeAll() leaks
    // the ✓ text every time the user toggles a selection.
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

    this.heroCardContainer.add([card.shadow, card.bg, portrait, name, trait, stats, card.zone]);
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

      const portrait = this.add.rectangle(sx, sy - 10, slotW - 16, slotH - 40, 0x3a2410, 0.5);
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
      if (sel) {
        const hero = this.classes[sel.class][sel.index];
        slot.portrait.setFillStyle(hero.displayColor, 1);
        slot.nameTxt.setText(hero.name.toUpperCase());
        slot.nameTxt.setColor('#3a2410');
      } else {
        slot.portrait.setFillStyle(0x3a2410, 0.4);
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

    const save = loadSave();
    const fresh = makeDefaultSave();
    save.grade = this.grade;
    save.party = party.map((h) => ({ id: h.id, name: h.name, hp: h.maxHp, maxHp: h.maxHp }));
    save.floors = fresh.floors;
    save.gold = 0;
    save.potions = 2;
    writeSave(save);

    transitionTo(this, SCENES.WORLD_MAP, undefined, 300);
  }
}
