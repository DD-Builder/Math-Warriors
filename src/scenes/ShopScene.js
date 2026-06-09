import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { getHeroById, getHeroSkins, getRarityColor, getRarityLabel } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { EQUIPMENT_TIERS } from '../systems/equipment.js';

const SHOP_ITEMS = [
  { id: 'potion',   name: 'POTION',      cost: 20,  desc: '+1 potion',               icon: 0x9050c8 },
  { id: 'atkBoost', name: 'ATK BOOST',   cost: 50,  desc: '+2 ATK (one hero)',        icon: 0xe84040 },
  { id: 'defBoost', name: 'DEF BOOST',   cost: 50,  desc: '+2 DEF (one hero)',        icon: 0x3888d8 },
  { id: 'maxHpUp',  name: 'MAX HP UP',   cost: 80,  desc: '+5 max HP (permanent)',    icon: 0x4aa848 },
  { id: 'revive',   name: 'REVIVE SCROLL', cost: 100, desc: 'Auto-revive at 50% HP', icon: 0xf0d040 },
];

export class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.SHOP });
  }

  init(data) {
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
    this.activeTab = data?.tab || 'items';
    this.pendingFlash = data?.flash || null;
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    fadeInScene(this);
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 888);

    PaperPanel(this, area.cx, area.cy, area.w - 20, area.h - 20, {
      color: 0xfff8e8, alpha: 0.94, radius: 28,
    });

    this.add.text(area.cx, area.top + 50, 'SHOP', {
      ...TEXT.title(), fontSize: '48px', color: '#d07818',
      stroke: '#fff8e0', strokeThickness: 5,
    }).setOrigin(0.5);

    this.goldLabel = this.add.text(area.cx, area.top + 100, '', {
      ...TEXT.heading(), fontSize: '28px', color: '#d07818',
      stroke: '#3a2410', strokeThickness: 2,
    }).setOrigin(0.5);
    this.updateGoldLabel();

    const tabY = area.top + 140;
    PaperButton(this, area.cx - 200, tabY, 'ITEMS', {
      w: 180, h: 46, color: this.activeTab === 'items' ? 0xd07818 : 0x8a7a60, fontSize: 18,
      onClick: () => this.switchTab('items'),
    });
    PaperButton(this, area.cx, tabY, 'GEAR', {
      w: 180, h: 46, color: this.activeTab === 'gear' ? 0x3888d8 : 0x8a7a60, fontSize: 18,
      onClick: () => this.switchTab('gear'),
    });
    PaperButton(this, area.cx + 200, tabY, 'SKINS', {
      w: 180, h: 46, color: this.activeTab === 'skins' ? 0xa040d0 : 0x8a7a60, fontSize: 18,
      onClick: () => this.switchTab('skins'),
    });

    if (this.activeTab === 'skins') {
      this.buildSkinCards(area);
    } else if (this.activeTab === 'gear') {
      this.buildGearCards(area);
    } else {
      this.buildItemCards(area);
    }

    PaperButton(this, area.cx, area.bottom - 50, 'BACK', {
      w: 260, h: 64, color: 0x4aa848, fontSize: 24,
      onClick: () => transitionTo(this, SCENES.WORLD_MAP, undefined, 200),
    });

    if (this.pendingFlash) {
      this.showFlash(this.pendingFlash);
      this.pendingFlash = null;
    }
  }

  buildItemCards(area) {
    const cardW = 200;
    const cardH = 200;
    const gap = 20;
    const totalW = SHOP_ITEMS.length * cardW + (SHOP_ITEMS.length - 1) * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.cy + 10;

    this.itemCards = SHOP_ITEMS.map((item, i) => {
      const x = startX + i * (cardW + gap);
      const card = PaperCard(this, x, cardY, cardW, cardH, item.icon, {});

      // Draw item icon above the name
      this.drawItemIcon(x, cardY - 80, item.id);

      this.add.text(x, cardY - 60, item.name, {
        ...TEXT.heading(), fontSize: '16px', color: '#fff8e0',
        stroke: '#1a0e04', strokeThickness: 2,
      }).setOrigin(0.5);

      this.add.text(x, cardY - 20, item.desc, {
        ...TEXT.body(), fontSize: '13px', color: '#fff8e0',
        align: 'center', wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);

      const costLabel = this.add.text(x, cardY + 30, `${item.cost} GOLD`, {
        ...TEXT.heading(), fontSize: '20px', color: '#f0d040',
      }).setOrigin(0.5);

      const canAfford = this.save.gold >= item.cost;
      const buyBtn = PaperButton(this, x, cardY + 70, canAfford ? 'BUY' : 'NEED GOLD', {
        w: 140, h: 46, fontSize: canAfford ? 18 : 14,
        color: canAfford ? 0xe84840 : 0x808080,
        textColor: canAfford ? '#fff8e0' : '#505050',
        onClick: () => this.buyItem(item, i),
      });

      return { card, buyBtn, costLabel, item };
    });
  }

  buildGearCards(area) {
    const cardW = 220;
    const cardH = 280;
    const gap = 20;
    const totalW = EQUIPMENT_TIERS.length * cardW + (EQUIPMENT_TIERS.length - 1) * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.cy + 20;

    const lead = (this.save.party || [])[0];
    const leadEquip = this.save.equipment?.hero0 || {};

    EQUIPMENT_TIERS.forEach((tier, i) => {
      const x = startX + i * (cardW + gap);
      const floorData = (this.save.floors || []).find(f => f && f.id === tier.floor);
      const unlocked = !!(floorData && floorData.unlocked);
      const owned = leadEquip.weapon === tier.weapon.id
        && leadEquip.armor === tier.armor.id
        && leadEquip.accessory === tier.accessory.id;

      PaperCard(this, x, cardY, cardW, cardH, unlocked ? 0x8a98b8 : 0x8a8070, {});

      this.add.text(x, cardY - cardH / 2 + 26, tier.tier.toUpperCase(), {
        ...TEXT.heading(), fontSize: '18px', color: '#fff8e0',
        stroke: '#1a0e04', strokeThickness: 2,
      }).setOrigin(0.5);

      if (!unlocked) {
        this.add.text(x, cardY, `Unlock Floor ${tier.floor}\nto buy`, {
          ...TEXT.body(), fontSize: '14px', color: '#d8d0c0', align: 'center',
        }).setOrigin(0.5);
        return;
      }

      const lines = [
        `⚔ ${tier.weapon.name}  +${tier.weapon.atk} ATK`,
        `\u{1F6E1} ${tier.armor.name}  +${tier.armor.def} DEF`,
        `❤ ${tier.accessory.name}  +${tier.accessory.hp} HP`,
      ];
      this.add.text(x, cardY - 40, lines.join('\n'), {
        ...TEXT.body(), fontSize: '12px', color: '#fff8e0', align: 'left',
        lineSpacing: 8, wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);

      if (owned) {
        this.add.text(x, cardY + 60, 'EQUIPPED', {
          ...TEXT.heading(), fontSize: '16px', color: '#a8e8a0',
        }).setOrigin(0.5);
        return;
      }

      this.add.text(x, cardY + 40, `${tier.setCost} GOLD`, {
        ...TEXT.heading(), fontSize: '18px', color: '#f0d040',
      }).setOrigin(0.5);

      const canAfford = this.save.gold >= tier.setCost && !!lead;
      PaperButton(this, x, cardY + 86, canAfford ? 'BUY SET' : 'NEED GOLD', {
        w: 140, h: 44, fontSize: canAfford ? 16 : 14,
        color: canAfford ? 0xe84840 : 0x808080,
        textColor: canAfford ? '#fff8e0' : '#505050',
        onClick: () => this.buyGearTier(tier),
      });
    });
  }

  buyGearTier(tier) {
    const lead = (this.save.party || [])[0];
    if (!lead) {
      this.showFlash('No party to equip!');
      return;
    }
    if (this.save.gold < tier.setCost) {
      this.showFlash('Not enough gold!');
      return;
    }

    this.save.gold -= tier.setCost;
    if (!this.save.equipment) this.save.equipment = {};
    this.save.equipment.hero0 = {
      weapon: tier.weapon.id,
      armor: tier.armor.id,
      accessory: tier.accessory.id,
    };
    writeSave(this.save, this.slot);
    audio.play('ui/confirm');
    // Restart to refresh card states; flash shows after the restart.
    this.scene.restart({ tab: 'gear', flash: `Equipped to ${lead.name}!` });
  }

  buyItem(item, index) {
    if (this.save.gold < item.cost) {
      this.showFlash('Not enough gold!');
      return;
    }

    this.save.gold -= item.cost;

    switch (item.id) {
      case 'potion':
        this.save.potions = (this.save.potions || 0) + 1;
        this.showFlash('+1 Potion!');
        break;
      case 'atkBoost':
        this.applyStatBoost('atk', 2);
        break;
      case 'defBoost':
        this.applyStatBoost('def', 2);
        break;
      case 'maxHpUp':
        this.applyStatBoost('maxHp', 5);
        break;
      case 'revive':
        if (!this.save.inventory) this.save.inventory = [];
        this.save.inventory.push('revive');
        this.showFlash('Revive Scroll added!');
        break;
    }

    writeSave(this.save, this.slot);
    audio.play('ui/confirm');
    this.updateGoldLabel();
    this.refreshBuyButtons();
  }

  applyStatBoost(stat, amount) {
    if (!this.save.party || this.save.party.length === 0) {
      this.showFlash('No party to boost!');
      return;
    }
    const target = this.save.party[0];
    const heroDef = getHeroById(target.id);
    if (stat === 'maxHp') {
      target.maxHp = (target.maxHp || heroDef?.maxHp || 50) + amount;
      target.hp = Math.min(target.hp + amount, target.maxHp);
    } else if (stat === 'atk') {
      target.atk = (target.atk || heroDef?.atk || 10) + amount;
    } else if (stat === 'def') {
      target.def = (target.def || heroDef?.def || 10) + amount;
    }
    this.showFlash(`${target.name} +${amount} ${stat.toUpperCase()}!`);
  }

  refreshBuyButtons() {
    this.itemCards.forEach(({ buyBtn, item }) => {
      const canAfford = this.save.gold >= item.cost;
      buyBtn.label.setText(canAfford ? 'BUY' : 'NEED GOLD');
      buyBtn.label.setColor(canAfford ? '#fff8e0' : '#505050');
    });
  }

  updateGoldLabel() {
    this.goldLabel.setText(`Gold: ${this.save.gold}`);
  }

  showFlash(message) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 180, message, {
      ...TEXT.heading(), fontSize: '24px', color: '#4aa848',
      backgroundColor: '#fff8e0', padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t, alpha: 0, delay: 1200, duration: 400,
      onComplete: () => t.destroy(),
    });
  }

  drawItemIcon(x, y, itemId) {
    const g = this.add.graphics();
    switch (itemId) {
      case 'potion': {
        // Green circle with white + cross
        g.fillStyle(0x4aa848, 1);
        g.fillCircle(x, y, 12);
        g.fillStyle(0xffffff, 1);
        g.fillRect(x - 5, y - 1, 10, 2);
        g.fillRect(x - 1, y - 5, 2, 10);
        break;
      }
      case 'atkBoost': {
        // Small orange upward triangle
        g.fillStyle(0xf0a040, 1);
        g.fillTriangle(x, y - 10, x - 10, y + 8, x + 10, y + 8);
        break;
      }
      case 'defBoost': {
        // Small blue shield (rounded rect)
        g.fillStyle(0x3888d8, 1);
        g.fillRoundedRect(x - 10, y - 12, 20, 24, 6);
        g.lineStyle(2, 0x2060a0, 1);
        g.strokeRoundedRect(x - 10, y - 12, 20, 24, 6);
        break;
      }
      case 'maxHpUp': {
        // Small red heart (two circles + triangle)
        g.fillStyle(0xe04040, 1);
        g.fillCircle(x - 5, y - 3, 6);
        g.fillCircle(x + 5, y - 3, 6);
        g.fillTriangle(x - 11, y - 1, x + 11, y - 1, x, y + 10);
        break;
      }
      case 'revive': {
        // Yellow rect with 2 horizontal lines (scroll)
        g.fillStyle(0xf0d040, 1);
        g.fillRoundedRect(x - 8, y - 10, 16, 20, 3);
        g.lineStyle(2, 0x8a6828, 1);
        g.beginPath();
        g.moveTo(x - 4, y - 3);
        g.lineTo(x + 4, y - 3);
        g.strokePath();
        g.beginPath();
        g.moveTo(x - 4, y + 3);
        g.lineTo(x + 4, y + 3);
        g.strokePath();
        break;
      }
    }
  }

  switchTab(tab) {
    if (this.activeTab === tab) return;
    writeSave(this.save, this.slot);
    this.scene.restart({ tab });
  }

  buildSkinCards(area) {
    if (!this.save.party || this.save.party.length === 0) return;
    if (!this.save.ownedSkins) this.save.ownedSkins = [];

    const party = this.save.party;
    const cardW = 360;
    const cardH = 250;
    const gap = 24;
    const totalW = party.length * cardW + (party.length - 1) * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.cy + 40;

    for (let pi = 0; pi < party.length; pi++) {
      const hero = party[pi];
      if (!hero) continue;
      const cx = startX + pi * (cardW + gap);
      const heroDef = getHeroById(hero.id);
      const rarity = heroDef?.rarity || 'common';
      const rarityCol = getRarityColor(rarity);
      const skins = getHeroSkins(hero.id);

      const bg = this.add.graphics();
      bg.fillStyle(0xf5ead0, 0.9);
      bg.fillRoundedRect(cx - cardW / 2, cardY - cardH / 2, cardW, cardH, 14);
      bg.lineStyle(2, rarityCol.border, 0.8);
      bg.strokeRoundedRect(cx - cardW / 2, cardY - cardH / 2, cardW, cardH, 14);


      const nameT = this.add.text(cx, cardY - cardH / 2 + 24, hero.name, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '22px', color: '#3a2410',
      }).setOrigin(0.5);

      const rarBadge = this.add.text(cx, cardY - cardH / 2 + 48, getRarityLabel(rarity), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '12px', color: rarityCol.label,
      }).setOrigin(0.5);

      for (let si = 0; si < skins.length; si++) {
        const skin = skins[si];
        const sy = cardY - cardH / 2 + 80 + si * 44;
        const owned = skin.id === 'default' || this.save.ownedSkins.includes(`${hero.id}:${skin.id}`);
        const equipped = (hero.skin || 'default') === skin.id;

        const skinLabel = this.add.text(cx - cardW / 2 + 20, sy, skin.name, {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
          fontSize: '15px', color: equipped ? '#40a040' : (owned ? '#3a2410' : '#8a7a60'),
        }).setOrigin(0, 0.5);

        if (equipped) {
          const eqT = this.add.text(cx + cardW / 2 - 20, sy, 'EQUIPPED', {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
            fontSize: '12px', color: '#40a040',
          }).setOrigin(1, 0.5);
        } else if (owned) {
          const eqBtn = this.add.text(cx + cardW / 2 - 20, sy, 'EQUIP', {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
            fontSize: '13px', color: '#4080c0', stroke: '#1a0e04', strokeThickness: 1,
          }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
          eqBtn.on('pointerdown', () => {
            hero.skin = skin.id;
            writeSave(this.save, this.slot);
            audio.play('ui/confirm');
            this.switchTab('skins', area);
          });
        } else {
          const buyT = this.add.text(cx + cardW / 2 - 20, sy,
            this.save.gold >= skin.cost ? `BUY ${skin.cost}g` : `${skin.cost}g`, {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
            fontSize: '13px',
            color: this.save.gold >= skin.cost ? '#f0c040' : '#8a7a60',
            stroke: '#1a0e04', strokeThickness: 1,
          }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
          buyT.on('pointerdown', () => {
            if (this.save.gold < skin.cost) return;
            this.save.gold -= skin.cost;
            this.save.ownedSkins.push(`${hero.id}:${skin.id}`);
            hero.skin = skin.id;
            writeSave(this.save, this.slot);
            audio.play('ui/confirm');
            this.updateGoldLabel();
            this.showFlash(`${skin.name} unlocked!`);
            this.switchTab('skins', area);
          });
        }
      }
    }
  }
}
