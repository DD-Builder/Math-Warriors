import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { getHeroById } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperCard, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

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

  init() {
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
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
    }).setOrigin(0.5);
    this.updateGoldLabel();

    this.buildItemCards(area);

    PaperButton(this, area.cx, area.bottom - 50, 'BACK', {
      w: 260, h: 64, color: 0x4aa848, fontSize: 24,
      onClick: () => transitionTo(this, SCENES.WORLD_MAP, undefined, 200),
    });
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
      const buyBtn = PaperButton(this, x, cardY + 70, 'BUY', {
        w: 140, h: 46, fontSize: 18,
        color: canAfford ? 0xe84840 : 0x808080,
        textColor: canAfford ? '#fff8e0' : '#a0a0a0',
        onClick: () => this.buyItem(item, i),
      });

      return { card, buyBtn, costLabel, item };
    });
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
    const def = getHeroById(target.id);
    if (stat === 'maxHp') {
      target.maxHp = (target.maxHp || def?.maxHp || 50) + amount;
      target.hp = Math.min(target.hp + amount, target.maxHp);
    }
    this.showFlash(`${target.name} +${amount} ${stat.toUpperCase()}!`);
  }

  refreshBuyButtons() {
    this.itemCards.forEach(({ buyBtn, item }) => {
      const canAfford = this.save.gold >= item.cost;
      buyBtn.label.setColor(canAfford ? '#fff8e0' : '#a0a0a0');
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
}
