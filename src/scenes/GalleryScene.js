import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { ALL_HEROES } from '../data/heroes.js';
import { loadSave, getActiveSlot, isHeroUnlocked } from '../systems/save.js';
import { getEvolutionStage, getEvolvedName } from '../systems/evolution.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { PaperPanel, PaperButton, safeArea } from '../ui/paperUI.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawShadowBox } from '../systems/papercutArt.js';
import { audio } from '../systems/audio.js';

export class GalleryScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.GALLERY });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    fadeInScene(this);
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    // ── SHADOW-BOX FRAME (v2 papercut aesthetic) ──
    // const frameGfx = this.add.graphics().setDepth(1);
    // Shadow-box disabled: opaque layers cover scene content
    // TODO: implement ring-draw (fill border only, transparent center)

    const slot = getActiveSlot(this);
    const save = loadSave(slot);

    // Title
    this.add.text(area.cx, area.top + 50, 'HERO GALLERY', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '44px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 6,
    }).setOrigin(0.5);

    // 5x3 grid of heroes
    const cols = 5;
    const rows = 3;
    const cardW = 220;
    const cardH = 220;
    const gap = 16;
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * cardH + (rows - 1) * gap;
    const startX = area.cx - gridW / 2 + cardW / 2;
    const startY = area.top + 110;

    let unlockedCount = 0;
    let totalBattles = save.stats?.totalBattles || 0;
    let totalCorrect = save.stats?.totalCorrect || 0;
    let totalWrong = save.stats?.totalWrong || 0;
    const totalQ = totalCorrect + totalWrong;
    const accuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    for (let i = 0; i < ALL_HEROES.length && i < 15; i++) {
      const hero = ALL_HEROES[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap);
      const cy = startY + row * (cardH + gap) + cardH / 2;

      const unlocked = isHeroUnlocked(save, hero.id);
      if (unlocked) unlockedCount++;

      PaperPanel(this, cx, cy, cardW, cardH, {
        color: unlocked ? PAPER.cream : PAPER.tealD, alpha: 0.92, radius: 14,
      });

      if (unlocked) {
        // Full color portrait
        const evoStage = getEvolutionStage(save, hero.id);
        const sprite = createAnimatedHero(this, cx, cy - 20, hero, {
          scale: 0.35, evolutionStage: evoStage,
        });
        if (sprite.setSelectionSway) sprite.setSelectionSway();
        sprite.setDepth(1001);

        // Evolved name
        const evolvedName = getEvolvedName(save, hero.id) || hero.name;
        this.add.text(cx, cy + 60, evolvedName, {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
          fontSize: '16px', color: PAPER_CSS.inkTeal,
        }).setOrigin(0.5);

        // Class label
        this.add.text(cx, cy + 80, (hero.class || '').toUpperCase(), {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '16px', color: PAPER_CSS.inkTeal,
        }).setOrigin(0.5);
      } else {
        // Dark silhouette
        const silhouette = this.add.circle(cx, cy - 20, 35, PAPER.inkTeal, 0.8);
        silhouette.setDepth(1001);

        this.add.text(cx, cy + 60, '???', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
          fontSize: '20px', color: PAPER_CSS.inkTeal,
        }).setOrigin(0.5);
      }
    }

    // BACK button — positioned first so we can calculate available space
    const backBtnH = 56;
    const backBtnY = area.bottom - backBtnH / 2 - 4;

    // Stats summary below the grid, above the BACK button
    const statsY = Math.min(startY + gridH + 30, backBtnY - backBtnH / 2 - 40);
    PaperPanel(this, area.cx, statsY, 700, 50, {
      color: PAPER.inkTeal, alpha: 0.75, radius: 14,
    });

    this.add.text(area.cx, statsY, [
      `Heroes: ${unlockedCount}/${ALL_HEROES.length}`,
      `Battles: ${totalBattles}`,
      `Accuracy: ${accuracy}%`,
    ].join('    '), {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px', color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 2,
    }).setOrigin(0.5);

    PaperButton(this, area.cx, backBtnY, 'BACK', {
      w: 200, h: backBtnH, color: 0x6090c0, fontSize: 22,
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.WORLD_MAP, undefined, 200);
      },
    });
  }
}
