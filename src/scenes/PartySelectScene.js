import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { KNIGHTS, WIZARDS, BUNNIES, spawnHero } from '../data/heroes.js';
import { loadSave, writeSave, makeDefaultSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';

/**
 * PartySelectScene
 *
 * Lets the player pick 3 heroes from the full roster of 15.
 * Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  MATH WARRIORS           [party strip: 3 slots]  [CONFIRM]  │
 *   │  BUILD YOUR PARTY                                           │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  [KNIGHTS]  [WIZARDS]  [BUNNIES]           class tabs       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │                                                             │
 *   │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐          │
 *   │   │ HERO │  │ HERO │  │ HERO │  │ HERO │  │ HERO │  grid    │
 *   │   │ CARD │  │ CARD │  │ CARD │  │ CARD │  │ CARD │          │
 *   │   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘          │
 *   │                                                             │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Tapping a card adds/removes the hero from the party. Tapping an
 * already-selected party slot removes that hero. When exactly 3 are
 * picked, the confirm button activates.
 *
 * v0.3: uses placeholder rectangles for hero art. When real sprites
 * drop, the cards' rectangle becomes an Image and nothing else changes.
 */
export class PartySelectScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.PARTY_SELECT });
  }

  init(data) {
    this.grade = data?.grade ?? 3;
    // Selections: array of { class: 'knight'|'wizard'|'bunny', index: 0-4 }
    this.selections = [];
    this.activeClass = 'knight';
    // Map of classKey → hero[] for easy switching
    this.classes = {
      knight: KNIGHTS,
      wizard: WIZARDS,
      bunny:  BUNNIES,
    };
    this.classLabels = {
      knight: 'KNIGHTS',
      wizard: 'WIZARDS',
      bunny:  'BATTLE BUNNIES',
    };
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.buildBackground();
    this.buildTopBar();
    this.buildClassTabs();
    this.buildHeroGrid();
    this.buildPartyStrip();
    this.buildConfirmButton();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  // ================================================================
  // BACKGROUND
  // ================================================================

  buildBackground() {
    // Faint paper grid texture — placeholder for the papercut table
    const g = this.add.graphics();
    g.lineStyle(1, 0x4a3420, 0.15);
    const spacing = 60;
    for (let x = 0; x < GAME_WIDTH; x += spacing) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y < GAME_HEIGHT; y += spacing) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }

    // Subtle central glow
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const glow = this.add.graphics();
    glow.fillStyle(0x2a1c08, 0.4);
    glow.fillCircle(cx, cy, 800);
    glow.fillStyle(0x4a2c10, 0.25);
    glow.fillCircle(cx, cy, 500);
  }

  // ================================================================
  // TOP BAR — title + party strip + confirm button
  // ================================================================

  buildTopBar() {
    // Header background panel
    this.add.rectangle(GAME_WIDTH / 2, 60, GAME_WIDTH, 120, COLORS.ink, 0.6)
      .setStrokeStyle(3, COLORS.paperD, 0.4);

    // Title — small in the header
    this.add.text(40, 30, 'MATH WARRIORS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.cobalt,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 3,
    }).setOrigin(0, 0);

    // Subtitle
    this.add.text(40, 64, 'BUILD YOUR PARTY', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '34px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0, 0);
  }

  // ================================================================
  // CLASS TABS
  // ================================================================

  buildClassTabs() {
    const tabY = 170;
    const tabW = 260;
    const tabH = 70;
    const spacing = 30;
    const totalW = 3 * tabW + 2 * spacing;
    const startX = GAME_WIDTH / 2 - totalW / 2;
    const classes = ['knight', 'wizard', 'bunny'];

    this.classTabs = {};

    classes.forEach((cls, i) => {
      const x = startX + i * (tabW + spacing) + tabW / 2;
      const bg = this.add.rectangle(x, tabY, tabW, tabH, COLORS.ink, 0.7)
        .setStrokeStyle(3, COLORS.paperD)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(x, tabY, this.classLabels[cls], {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 3,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this.switchClass(cls));

      this.classTabs[cls] = { bg, label };
    });

    this.updateClassTabs();
  }

  switchClass(cls) {
    this.activeClass = cls;
    this.updateClassTabs();
    this.rebuildHeroGrid();
  }

  updateClassTabs() {
    for (const cls of Object.keys(this.classTabs)) {
      const active = cls === this.activeClass;
      const tab = this.classTabs[cls];
      tab.bg.setFillStyle(active ? COLORS.gold : COLORS.ink, active ? 0.9 : 0.7);
      tab.bg.setStrokeStyle(3, active ? COLORS.goldL : COLORS.paperD);
      tab.label.setColor(active ? COLORS_CSS.ink : COLORS_CSS.paper);
    }
  }

  // ================================================================
  // HERO GRID
  // ================================================================

  buildHeroGrid() {
    // Section label
    this.gridLabel = this.add.text(GAME_WIDTH / 2, 240, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: COLORS_CSS.inkL,
    }).setOrigin(0.5);

    // Cards container — we'll rebuild this on class switch
    this.heroCardContainer = this.add.container(0, 0);
    this.rebuildHeroGrid();
  }

  rebuildHeroGrid() {
    this.heroCardContainer.removeAll(true);

    const heroes = this.classes[this.activeClass];
    this.gridLabel.setText(`CHOOSE YOUR ${this.classLabels[this.activeClass].replace(/S$/, '')}`);

    const cardW = 280;
    const cardH = 420;
    const spacing = 30;
    const totalW = heroes.length * cardW + (heroes.length - 1) * spacing;
    const startX = GAME_WIDTH / 2 - totalW / 2 + cardW / 2;
    const cardY = 510;

    heroes.forEach((hero, i) => {
      const x = startX + i * (cardW + spacing);
      this.createHeroCard(x, cardY, cardW, cardH, hero, i);
    });
  }

  createHeroCard(x, y, w, h, hero, heroIndex) {
    // Is this hero currently selected?
    const isSelected = this.isHeroSelected(this.activeClass, heroIndex);

    // Card background
    const bg = this.add.rectangle(x, y, w, h, COLORS.ink, 0.85)
      .setStrokeStyle(isSelected ? 6 : 3, isSelected ? COLORS.goldL : COLORS.paperD)
      .setInteractive({ useHandCursor: true });

    // Placeholder sprite rectangle (colored by class)
    const spriteW = w - 60;
    const spriteH = 200;
    const spriteY = y - 70;
    const spriteRect = this.add.rectangle(x, spriteY, spriteW, spriteH, hero.displayColor)
      .setStrokeStyle(4, COLORS.ink);

    // Hero name
    const name = this.add.text(x, y + 60, hero.name.toUpperCase(), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '20px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Hero trait (flavor text)
    const trait = this.add.text(x, y + 100, hero.trait, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '16px',
      color: COLORS_CSS.paper,
      align: 'center',
      wordWrap: { width: w - 40 },
    }).setOrigin(0.5, 0);

    // Stats row
    const statsY = y + 160;
    const statText = `HP ${hero.maxHp}  ATK ${hero.atk}  DEF ${hero.def}`;
    const stats = this.add.text(x, statsY, statText, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '13px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5);

    // Selected badge
    let badge = null;
    if (isSelected) {
      badge = this.add.circle(x + w / 2 - 25, y - h / 2 + 25, 18, COLORS.gold)
        .setStrokeStyle(3, COLORS.ink);
      const checkmark = this.add.text(x + w / 2 - 25, y - h / 2 + 25, '\u2713', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '22px',
        color: COLORS_CSS.ink,
      }).setOrigin(0.5);
      this.heroCardContainer.add(checkmark);
    }

    bg.on('pointerdown', () => this.toggleHeroSelection(this.activeClass, heroIndex));

    this.heroCardContainer.add([bg, spriteRect, name, trait, stats]);
    if (badge) this.heroCardContainer.add(badge);
  }

  // ================================================================
  // PARTY STRIP — three slots at top-right showing current picks
  // ================================================================

  buildPartyStrip() {
    const stripX = GAME_WIDTH - 420;
    const stripY = 60;
    const slotW = 90;
    const slotH = 110;
    const spacing = 10;

    // Label
    this.add.text(stripX - 70, stripY + slotH / 2, 'PARTY', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.paper,
    }).setOrigin(1, 0.5);

    this.partySlots = [];
    for (let i = 0; i < 3; i++) {
      const x = stripX + i * (slotW + spacing);
      const y = stripY;
      const isLead = i === 0;

      const bg = this.add.rectangle(x + slotW / 2, y + slotH / 2, slotW, slotH, COLORS.ink, 0.5)
        .setStrokeStyle(3, isLead ? COLORS.gold : COLORS.paperD)
        .setInteractive({ useHandCursor: true });

      const leadTag = isLead
        ? this.add.text(x + slotW / 2, y + 8, 'LEAD', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '9px',
            color: COLORS_CSS.goldL,
          }).setOrigin(0.5, 0)
        : null;

      const sprite = this.add.rectangle(x + slotW / 2, y + slotH / 2, slotW - 20, slotH - 40, COLORS.ink)
        .setStrokeStyle(1, COLORS.paperD, 0.3);

      const name = this.add.text(x + slotW / 2, y + slotH - 10, '—', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: COLORS_CSS.inkL,
      }).setOrigin(0.5, 1);

      bg.on('pointerdown', () => this.removeSlot(i));

      this.partySlots.push({ bg, leadTag, sprite, name, isLead });
    }
  }

  updatePartyStrip() {
    for (let i = 0; i < 3; i++) {
      const slot = this.partySlots[i];
      const sel = this.selections[i];
      if (sel) {
        const hero = this.classes[sel.class][sel.index];
        slot.sprite.setFillStyle(hero.displayColor);
        slot.sprite.setAlpha(1);
        slot.name.setText(hero.name.toUpperCase());
        slot.name.setColor(COLORS_CSS.paper);
        slot.bg.setFillStyle(COLORS.ink, 0.8);
      } else {
        slot.sprite.setFillStyle(COLORS.ink);
        slot.sprite.setAlpha(0.4);
        slot.name.setText('—');
        slot.name.setColor(COLORS_CSS.inkL);
        slot.bg.setFillStyle(COLORS.ink, 0.5);
      }
    }
  }

  // ================================================================
  // CONFIRM BUTTON
  // ================================================================

  buildConfirmButton() {
    const x = GAME_WIDTH - 90;
    const y = 120;

    const bg = this.add.rectangle(x, y, 160, 70, COLORS.paperD)
      .setStrokeStyle(4, COLORS.ink)
      .setInteractive({ useHandCursor: false });
    const label = this.add.text(x, y, 'BEGIN', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: COLORS_CSS.inkL,
    }).setOrigin(0.5);
    const hint = this.add.text(x, y + 50, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '14px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    bg.on('pointerdown', () => this.tryConfirm());

    this.confirmBtn = { bg, label, hint };
  }

  updateConfirmButton() {
    const count = this.selections.length;
    if (count >= 3) {
      this.confirmBtn.bg.setFillStyle(COLORS.scarlet);
      this.confirmBtn.bg.input.cursor = 'pointer';
      this.confirmBtn.label.setColor(COLORS_CSS.paper);
      this.confirmBtn.label.setText('BEGIN');
      this.confirmBtn.hint.setText('Party ready!');
      this.confirmBtn.hint.setColor(COLORS_CSS.goldL);
    } else {
      this.confirmBtn.bg.setFillStyle(COLORS.paperD);
      this.confirmBtn.bg.input.cursor = 'default';
      this.confirmBtn.label.setColor(COLORS_CSS.inkL);
      this.confirmBtn.label.setText('BEGIN');
      const needed = 3 - count;
      this.confirmBtn.hint.setText(`Pick ${needed} more hero${needed > 1 ? 'es' : ''}`);
      this.confirmBtn.hint.setColor(COLORS_CSS.paper);
    }
  }

  // ================================================================
  // SELECTION LOGIC
  // ================================================================

  isHeroSelected(cls, index) {
    return this.selections.some((s) => s.class === cls && s.index === index);
  }

  toggleHeroSelection(cls, index) {
    const existing = this.selections.findIndex((s) => s.class === cls && s.index === index);
    if (existing >= 0) {
      this.selections.splice(existing, 1);
    } else {
      if (this.selections.length >= 3) return;  // party full
      this.selections.push({ class: cls, index });
    }
    this.rebuildHeroGrid();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  removeSlot(slotIndex) {
    if (slotIndex >= this.selections.length) return;
    this.selections.splice(slotIndex, 1);
    this.rebuildHeroGrid();
    this.updatePartyStrip();
    this.updateConfirmButton();
  }

  // ================================================================
  // CONFIRM → WORLD MAP
  // Persist the party to the save file so subsequent scenes (world map,
  // battle, future maze) can rehydrate it without re-selecting.
  // ================================================================

  tryConfirm() {
    if (this.selections.length < 3) return;
    audio.play('ui/confirm');

    // Build the runtime party AND the persistent party record in one go
    const party = this.selections.map((s) => {
      const def = this.classes[s.class][s.index];
      return spawnHero(def.id);
    });

    // Start a fresh save for the new run (keeps existing settings/stats)
    const save = loadSave();
    const fresh = makeDefaultSave();
    save.grade = this.grade;
    save.party = party.map((h) => ({
      id: h.id,
      name: h.name,
      hp: h.maxHp,
      maxHp: h.maxHp,
    }));
    // Reset floor progress to fresh unless we're specifically continuing
    save.floors = fresh.floors;
    save.gold = 0;
    save.potions = 2;
    writeSave(save);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.WORLD_MAP);
    });
  }
}
