import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { generateQuestion } from '../systems/math.js';
import {
  getZone,
  advanceMomentum,
  computeEnemyDamage,
  applyDamageResult,
  buildTurnSequence,
  advanceTurn,
  isPartyDefeated,
  pickRandomLivingHero,
} from '../systems/combat.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { spawnEnemy, FLOOR_1, FLOOR_OPERATORS } from '../data/enemies.js';
import { audio } from '../systems/audio.js';
import { loadSave, writeSave, markFloorComplete } from '../systems/save.js';
import { invokeAbility } from '../systems/abilities.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, PaperBar, paperRect, paintPaperRect, updatePaperBar, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { makeRng } from '../systems/rng.js';
import { computeLevel, levelBonuses } from '../data/heroes.js';
import { shouldShowTutorial, markTutorialShown, getTutorialText } from '../systems/tutorial.js';

/**
 * BattleScene — the turn-based math combat stage.
 *
 * Design principles this scene honors (see docs/DESIGN-PRINCIPLES.md):
 *   1. Feedback is the invisible dialogue — every action has visible +
 *      audible + tactile response (screen shake, hit pause, particles)
 *   2. Clarity before complexity — always show HP, momentum, whose turn
 *   3. Snappy tempo — turn transitions under 500ms, no slow ceremonies
 *   4. Confidence first — wrong answers don't feel like punishment
 *   5. Failure is a restart, not a punishment — defeat returns you to
 *      the world map with a full heal, nothing lost
 *
 * 3 heroes vs. 1 enemy. Hero turns alternate with an enemy turn. Damage
 * on a correct answer equals the answer value, scaled by the momentum
 * zone's heroMult. On defeat, the party is fully healed.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BATTLE });
  }

  init(data) {
    // Party: use provided or default to one of each class
    if (data?.party && data.party.length === 3) {
      this.party = data.party.map((h) => ({ ...h }));
    } else {
      this.party = [
        spawnHero(KNIGHTS[0].id),
        spawnHero(WIZARDS[4].id),
        spawnHero(BUNNIES[0].id),
      ];
    }

    this.floor = data?.floor ?? 1;
    this.grade = data?.grade ?? 3;
    this.operator = FLOOR_OPERATORS[this.floor] ?? '+';
    this.isBoss = !!data?.isBoss;

    // --- Multi-monster encounter setup ---
    if (data?.enemy) {
      // Single enemy passed directly (legacy / test compat)
      this.enemies = [{ ...data.enemy }];
    } else if (this.isBoss) {
      // Boss encounters: always 1 boss
      const def = FLOOR_1[Math.floor(Math.random() * FLOOR_1.length)];
      this.enemies = [spawnEnemy(def.id, { grade: this.grade, isBoss: true })];
    } else {
      // Regular encounters: weighted 1-3 monsters
      const roll = Math.random();
      const count = roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3;
      const hpScale = count === 1 ? 1.0 : count === 2 ? 0.6 : 0.45;
      this.enemies = [];
      for (let i = 0; i < count; i++) {
        const def = FLOOR_1[Math.floor(Math.random() * FLOOR_1.length)];
        const e = spawnEnemy(def.id, { grade: this.grade, isBoss: false });
        // Scale HP for multi-monster encounters
        if (count > 1) {
          e.maxHp = Math.max(1, Math.round(e.maxHp * hpScale));
          e.hp = e.maxHp;
        }
        this.enemies.push(e);
      }
    }

    // Backward compatibility: this.enemy always points to first enemy
    this.enemy = this.enemies[0];

    // Current target index for hero attacks
    this.currentTarget = 0;

    // Return destination — set by MazeScene when it triggers a battle.
    // Undefined means "came from somewhere that isn't the maze"
    // (direct from World Map or from scene test harness), in which case
    // victory goes back to World Map.
    this.returnScene = this.registry.get('battleReturnScene') || SCENES.WORLD_MAP;
    this.returnData = this.registry.get('battleReturnData') || null;

    this.momentum = 0.5;
    this.streak = 0;
    this.turnSeq = buildTurnSequence(this.party.length);
    this.turnIdx = -1;
    this.phase = 'intro';
    this.locked = false;
    this.currentQuestion = null;

    // Load the save once per battle and mutate in place.
    this.save = loadSave();

    // Per-battle stat accumulators so we report true correct/wrong
    // counts rather than the end-of-battle streak.
    this.battleCorrect = 0;
    this.battleWrong = 0;
  }

  create() {
    this.buildBackground();
    this.buildHeroSprites();
    this.buildEnemySprite();
    this.buildUI();

    audio.playMusic('music/battle');

    // Fire each enemy's onBattleStart hook so any ability state can
    // initialize
    for (const enemy of this.enemies) {
      invokeAbility(enemy.ability, 'onBattleStart', {
        enemy,
        party: this.party,
        scene: this,
      });
    }

    // Show a one-time tutorial toast on the very first battle. Uses
    // the save's totalBattles stat to decide — if this player has
    // never finished a battle, prime them.
    if ((this.save.stats.totalBattles ?? 0) === 0) {
      this.time.delayedCall(700, () => {
        if (this.scene.isActive()) {
          this.showToast('Tap the right answer to attack!', COLORS_CSS.goldL);
        }
      });
    }

    // Fade in
    fadeInScene(this);
    this.time.delayedCall(400, () => this.nextTurn());
  }

  // ================================================================
  // BACKGROUND — placeholder diorama stage
  // ================================================================

  buildBackground() {
    this.cameras.main.setBackgroundColor(0x000000);
    const bgHeight = GAME_HEIGHT * 0.72;
    drawPapercutBackground(this, this.floor, GAME_WIDTH, bgHeight, 42);

    // Floor-specific foreground details to make each level feel unique
    this.drawBattleThemeDetails(bgHeight);

    // Ambient floating particles — drift upward slowly for atmosphere
    this.startAmbientParticles(bgHeight);

    this.add.text(30, 20, `QUEST ${this.floor}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: COLORS_CSS.paper,
      stroke: '#000000',
      strokeThickness: 4,
    });
  }

  drawBattleThemeDetails(bgH) {
    const g = this.add.graphics();
    const rng = makeRng(this.floor * 5555);
    const gndY = bgH * 0.88;

    if (this.floor === 1) {
      // Garden: flowers along ground, butterflies
      for (let i = 0; i < 10; i++) {
        const fx = rng() * GAME_WIDTH;
        const fy = gndY - rng() * 20;
        const colors = [0xf06080, 0xf0c040, 0xa0d8f0, 0xf080c0, 0xff8080];
        g.fillStyle(colors[Math.floor(rng() * colors.length)], 0.7);
        g.fillCircle(fx, fy, 4 + rng() * 3);
        g.fillStyle(0xf0f080, 0.8);
        g.fillCircle(fx, fy, 2);
      }
      // Mushrooms
      for (let i = 0; i < 4; i++) {
        const mx = 60 + rng() * (GAME_WIDTH - 120);
        g.fillStyle(0x6a4010, 1);
        g.fillRect(mx - 2, gndY - 8, 4, 10);
        g.fillStyle(0xc04818, 0.8);
        g.fillCircle(mx, gndY - 12, 7 + rng() * 4);
        g.fillStyle(0xf0e8d0, 0.6);
        g.fillCircle(mx - 2, gndY - 14, 2);
      }
    } else if (this.floor === 2) {
      // Tidepool: water ripples at ground, bubbles rising
      for (let i = 0; i < 8; i++) {
        const bx = rng() * GAME_WIDTH;
        const by = gndY - 30 - rng() * 120;
        g.fillStyle(0x40a8c8, 0.2 + rng() * 0.15);
        g.fillCircle(bx, by, 3 + rng() * 4);
      }
      // Seaweed along ground
      for (let i = 0; i < 6; i++) {
        const sx = 50 + rng() * (GAME_WIDTH - 100);
        g.fillStyle(0x186838, 0.6);
        for (let s = 0; s < 3; s++) {
          g.fillCircle(sx + (rng() - 0.5) * 8, gndY - s * 12 - 6, 4 + rng() * 3);
        }
      }
    } else if (this.floor === 3) {
      // Cloud: lightning flashes, floating platforms
      for (let i = 0; i < 5; i++) {
        const px = 80 + rng() * (GAME_WIDTH - 160);
        const py = gndY - 40 - rng() * 80;
        g.fillStyle(0x7898b8, 0.4);
        g.fillRoundedRect(px - 30, py, 60 + rng() * 30, 10, 5);
        g.fillStyle(0x98b8d8, 0.3);
        g.fillRoundedRect(px - 24, py + 2, 48 + rng() * 20, 6, 3);
      }
    } else if (this.floor === 4) {
      // Ember: lava pools, sparks
      for (let i = 0; i < 5; i++) {
        const lx = rng() * GAME_WIDTH;
        g.fillStyle(0xe04808, 0.3);
        g.fillCircle(lx, gndY + 4, 12 + rng() * 16);
        g.fillStyle(0xf0a010, 0.2);
        g.fillCircle(lx, gndY + 2, 8 + rng() * 10);
      }
      // Floating embers
      for (let i = 0; i < 12; i++) {
        g.fillStyle(0xf08020, 0.3 + rng() * 0.3);
        g.fillCircle(rng() * GAME_WIDTH, gndY - rng() * 200, 2 + rng() * 2);
      }
    } else if (this.floor === 5) {
      // Arcane: floating rune circles, magic particles
      for (let i = 0; i < 4; i++) {
        const rx = 120 + rng() * (GAME_WIDTH - 240);
        const ry = gndY - 60 - rng() * 100;
        g.lineStyle(1.5, 0x8040d0, 0.3);
        g.strokeCircle(rx, ry, 16 + rng() * 12);
        g.fillStyle(0x8040d0, 0.15);
        g.fillCircle(rx, ry, 4);
      }
      // Sparkle particles
      for (let i = 0; i < 15; i++) {
        g.fillStyle(0xc090f0, 0.2 + rng() * 0.2);
        g.fillCircle(rng() * GAME_WIDTH, rng() * gndY, 1.5 + rng() * 1.5);
      }
    }
  }

  startAmbientParticles(bgH) {
    const colors = {
      1: [0x4a8830, 0xf06080, 0xf0c040],
      2: [0x40a8c8, 0x2870a8, 0x58b8e8],
      3: [0xd0dce8, 0xa0b8d0, 0xffffff],
      4: [0xf08020, 0xe04808, 0xf0a010],
      5: [0xc090f0, 0x8040d0, 0xe0b0ff],
    };
    const palette = colors[this.floor] || colors[1];

    this.time.addEvent({
      delay: 800,
      loop: true,
      callback: () => {
        if (this.phase === 'end') return;
        const px = Math.random() * GAME_WIDTH;
        const py = bgH * 0.9;
        const color = palette[Math.floor(Math.random() * palette.length)];
        const size = 2 + Math.random() * 3;
        const p = this.add.circle(px, py, size, color, 0.4 + Math.random() * 0.3);
        this.tweens.add({
          targets: p,
          y: py - 80 - Math.random() * 120,
          x: px + (Math.random() - 0.5) * 60,
          alpha: 0,
          duration: 2000 + Math.random() * 1500,
          ease: 'Sine.out',
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  buildHeroSprites() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    // Layout: heroes in middle-left, standing on the ground strip.
    // The bottom ~220px is the equation+answer UI. Characters go above.
    const uiTop = area.bottom - 220;
    const groundY = uiTop - 30;

    // Draw a ground path strip so heroes aren't on black void
    const groundGfx = this.add.graphics();
    groundGfx.fillStyle(0x3a6818, 0.6);
    groundGfx.fillRect(0, groundY, GAME_WIDTH, uiTop - groundY + 40);
    groundGfx.fillStyle(0x4a8828, 0.4);
    groundGfx.fillRect(0, groundY, GAME_WIDTH, 8);

    const heroScale = 2;
    const spacing = Math.min(220, (GAME_WIDTH * 0.5) / 3);
    const leftAnchor = GAME_WIDTH * 0.08 + spacing / 2;

    this.heroSprites = this.party.map((hero, i) => {
      const x = leftAnchor + i * spacing;
      const y = groundY - 100;

      const body = drawHeroSprite(this, x, y, hero, { scale: heroScale });

      const name = this.add.text(x, y - 120, hero.name.toUpperCase(), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '20px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 3,
      }).setOrigin(0.5);

      const hpBarBg = this.add.rectangle(x, y + 80, 150, 14, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD);
      const hpBarFill = this.add.rectangle(x - 73, y + 80, 146, 10, 0x40c040)
        .setOrigin(0, 0.5);
      const hpText = this.add.text(x, y + 96, `${hero.hp}/${hero.maxHp}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);

      const indicator = this.add.triangle(x, y - 160, 0, 0, 20, 0, 10, 20, COLORS.goldL)
        .setVisible(false);

      return { hero, body, name, hpBarBg, hpBarFill, hpText, indicator, x, y };
    });

    // Idle bob — gentle sine wave on each hero
    this.heroSprites.forEach((hs, i) => {
      this.tweens.add({
        targets: hs.body,
        y: '-=6',
        duration: 1200 + i * 200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });
  }

  buildEnemySprite() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const uiTop = area.bottom - 220;
    const groundY = uiTop - 30;
    const centerX = GAME_WIDTH * 0.76;
    const count = this.enemies.length;

    // Layout offsets: spread enemies vertically
    const yOffsets = count === 1 ? [0]
      : count === 2 ? [-80, 80]
      : [-110, 0, 110];

    this.enemySprites = [];

    for (let ei = 0; ei < count; ei++) {
      const enemy = this.enemies[ei];
      const baseScale = enemy.isBoss ? 3.5 : (count >= 3 ? 2.5 : 3);
      const monsterScale = baseScale;
      const x = centerX;
      const y = groundY - 80 * (monsterScale / 1.5) + yOffsets[ei];
      const w = 200, h = 220;

      const body = drawMonsterSprite(this, x, y, enemy, { scale: monsterScale });

      const spriteHalfH = 80 * monsterScale / 2;
      const nameY = y - spriteHalfH - 50;
      const hpY = y - spriteHalfH - 28;
      const hpTextY = y - spriteHalfH - 8;

      const name = this.add.text(x, nameY, enemy.name.toUpperCase(), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: count >= 3 ? '20px' : '26px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.scarlet,
        strokeThickness: 4,
      }).setOrigin(0.5);

      const hpBarBg = this.add.rectangle(x, hpY, w + 20, 20, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD);
      const hpBarFill = this.add.rectangle(x - (w + 20) / 2 + 2, hpY, (w + 20 - 4) * (enemy.hp / enemy.maxHp), 14, 0xc04030)
        .setOrigin(0, 0.5);
      const hpText = this.add.text(x, hpTextY, `${enemy.hp}/${enemy.maxHp}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '15px',
        color: '#fff8e0',
        stroke: '#1a0e04',
        strokeThickness: 3,
      }).setOrigin(0.5);

      const spriteData = { body, name, hpBarBg, hpBarFill, hpText, x, y };
      this.enemySprites.push(spriteData);

      // Enemy idle pulse — very subtle breathing
      const ms = body.scaleX || monsterScale;
      this.tweens.add({
        targets: body,
        scaleX: ms * 1.01,
        scaleY: ms * 0.99,
        duration: 1800 + ei * 200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    // Backward compat: this.enemySprite points to first enemy sprite
    this.enemySprite = this.enemySprites[0];
  }

  // ================================================================
  // UI — momentum, question, answers, toasts, end screen
  // ================================================================

  buildUI() {
    // NEW LAYOUT — characters always visible, equation floats as a
    // small paper note in the upper area, only the answer-button row
    // lives in a tight bottom strip.
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    // === BOTTOM UI: no enclosing box — equation + answers float over battle ===
    const ansH = 100;
    const ansY = area.bottom - ansH / 2 - 8;
    const eqY = ansY - ansH / 2 - 60;

    // === TOP: floor name + momentum bar (slim) ===
    const topY = area.top + 22;
    const barW = 380;
    const barX = area.cx - barW / 2;

    PaperPanel(this, area.cx, topY, barW + 220, 50, {
      color: 0xfff4e0, alpha: 0.92, radius: 16,
    });

    this.add.text(barX - 10, topY, 'MOMENTUM', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px',
      color: '#3a2410',
      letterSpacing: 1,
    }).setOrigin(1, 0.5);

    this.momentumBarObj = PaperBar(this, barX, topY, barW, 16, this.momentum, 0x4aa848, {
      bgColor: 0xc8b898,
    });
    for (const t of [0.33, 0.66]) {
      this.add.rectangle(barX + barW * t, topY, 2, 16, 0x3a2410, 0.5);
    }
    this.momentumLabel = this.add.text(barX + barW + 10, topY, 'ZONE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px',
      color: '#b86820',
      letterSpacing: 1,
    }).setOrigin(0, 0.5);

    // Potion button — top-right of screen, inside safe area
    this.potionBtn = PaperButton(this, area.right - 80, topY, '', {
      w: 140, h: 46, color: 0x4caa5c, fontSize: 15,
      onClick: () => this.usePotion(),
    });
    this.potionLabel = this.potionBtn.label;
    this.refreshPotionButton();

    // === EQUATION — compact dark pill floating over the battle ===
    const noteW = 300;
    const noteH = 110;
    const noteCx = area.cx;
    const noteCy = eqY;

    PaperPanel(this, noteCx, noteCy, noteW, noteH, {
      color: 0x1a0e04, alpha: 0.85, radius: 18, shadowOff: 4, shadowAlpha: 0.3,
    });

    this.eqLines = {
      a:    this.add.text(noteCx + 20, noteCy - 34, '', this.eqLineStyle({ fontSize: '48px', color: '#fff8e0' })),
      opB:  this.add.text(noteCx + 20, noteCy + 2,  '', this.eqLineStyle({ fontSize: '48px', color: '#e8a030' })),
      bar:  this.add.text(noteCx,      noteCy + 28, '\u2500\u2500\u2500', this.eqLineStyle({ fontSize: '22px', color: '#a08860' })),
      ans:  this.add.text(noteCx,      noteCy + 52, '?', this.eqLineStyle({ fontSize: '48px', color: '#f0c040' })),
    };
    this.eqLines.a.setOrigin(1, 0.5);
    this.eqLines.opB.setOrigin(1, 0.5);
    this.eqLines.bar.setOrigin(0.5);
    this.eqLines.ans.setOrigin(0.5, 0.5);

    // Turn label — slim pill at the top of the math area
    const turnY = eqY - noteH / 2 - 26;
    PaperPanel(this, area.cx, turnY, 360, 36, {
      color: 0x1a0e04, alpha: 0.82, radius: 12, shadowOff: 2, shadowAlpha: 0.2,
    });
    this.turnLabel = this.add.text(area.cx, turnY, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: '#fff8e0',
      stroke: '#1a0e04',
      strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5);

    // === ANSWER BUTTONS — bottom row, centered full width ===
    const btnW = Math.min(240, (area.w - 3 * 16 - 40) / 4);
    const btnGap = 16;
    const totalW = 4 * btnW + 3 * btnGap;
    const startX = area.cx - totalW / 2 + btnW / 2;
    const btnColors = [0x3888d8, 0xe84840, 0x4aa848, 0x9050c8];

    this.answerButtons = [];
    this.answerBtnLayout = { w: btnW, h: ansH, y: ansY, startX, gap: btnGap };
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (btnW + btnGap);
      const seed = 7000 + i * 211;
      const btn = PaperButton(this, x, ansY, '?', {
        w: btnW, h: ansH,
        color: btnColors[i],
        fontSize: 38,
        seed,
        onClick: () => {
          if (this.locked) return;
          audio.play('ui/click');
          this.onAnswer(i);
        },
      });
      this.answerButtons.push({
        bg: btn.bg, shadow: btn.shadow, label: btn.label, zone: btn.zone,
        baseColor: btnColors[i],
        seed,
      });
    }

    // Toast (floats above the UI panel)
    this.toast = this.add.text(area.cx, area.top + 90, '', {
      ...TEXT.heading(),
      fontSize: '26px',
      backgroundColor: '#1a0e04',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);

    // End overlay (hidden by default)
    this.endOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setVisible(false);
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.88);
    const endTitle = this.add.text(0, -160, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '72px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 6,
    }).setOrigin(0.5);
    const endSub = this.add.text(0, -50, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      color: COLORS_CSS.paper,
      align: 'center',
    }).setOrigin(0.5);
    const endRewards = this.add.text(0, 30, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: COLORS_CSS.goldL,
      align: 'center',
    }).setOrigin(0.5);
    const endBtnBg = this.add.rectangle(0, 140, 380, 80, COLORS.scarlet)
      .setStrokeStyle(4, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    const endBtnLabel = this.add.text(0, 140, 'CONTINUE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '24px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    endBtnBg.on('pointerdown', () => {
      // Direct, immediate scene transition. We don't go through
      // transitionTo() here because removeAllEvents() in showVictory
      // /showDefeat can cancel camerafadeoutcomplete callbacks and
      // strand the CONTINUE button.
      audio.play('ui/confirm');
      const target = this.returnScene;
      const data = this.returnData || undefined;
      this.registry.remove('battleReturnScene');
      this.registry.remove('battleReturnData');
      this.scene.start(target, data);
    });

    this.endOverlay.add([overlayBg, endTitle, endSub, endRewards, endBtnBg, endBtnLabel]);
    this.endOverlay.titleText = endTitle;
    this.endOverlay.subText = endSub;
    this.endOverlay.rewardsText = endRewards;
  }

  // ================================================================
  // TURN FLOW
  // ================================================================

  /** Check if all enemies are dead */
  allEnemiesDead() {
    return this.enemies.every(e => e.hp <= 0);
  }

  /** Find the next alive enemy index starting from current target, or -1 */
  findNextAliveEnemy() {
    // Try from currentTarget forward
    for (let i = this.currentTarget; i < this.enemies.length; i++) {
      if (this.enemies[i].hp > 0) return i;
    }
    // Wrap around from start
    for (let i = 0; i < this.currentTarget; i++) {
      if (this.enemies[i].hp > 0) return i;
    }
    return -1;
  }

  nextTurn() {
    if (this.phase === 'end') return;

    if (isPartyDefeated(this.party)) return this.showDefeat();
    if (this.allEnemiesDead()) return this.showVictory();

    // Auto-advance target to next alive enemy
    const nextAlive = this.findNextAliveEnemy();
    if (nextAlive >= 0) this.currentTarget = nextAlive;

    const result = advanceTurn(this.turnSeq, this.turnIdx, this.party);
    if (!result) return this.showDefeat();
    this.turnIdx = result.index;
    this.currentTurn = result.turn;

    this.updateHeroIndicators();

    if (this.currentTurn.who === 'hero') this.startHeroTurn();
    else this.startEnemyTurn();
  }

  startHeroTurn() {
    const hero = this.party[this.currentTurn.heroIndex];
    this.phase = 'question';
    this.locked = false;
    this.refreshPotionButton();

    if (shouldShowTutorial('FIRST_BATTLE')) {
      markTutorialShown('FIRST_BATTLE');
      this.showToast(getTutorialText('FIRST_BATTLE'), COLORS_CSS.goldL);
    }

    this.currentQuestion = generateQuestion({
      operator: this.operator,
      grade: this.grade,
      streak: this.streak,
    });

    this.renderStackedEquation(this.currentQuestion);

    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].label.setText(String(this.currentQuestion.choices[i]));
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 1);
    }

    // Boss fights have a countdown timer — race to answer!
    if (this.bossTimer) { this.bossTimer.remove(); this.bossTimer = null; }
    if (this.bossTimerBar) { this.bossTimerBar.destroy(); this.bossTimerBar = null; }

    if (this.isBoss) {
      const timerDuration = 8000;
      this.bossTimerStart = this.time.now;
      this.bossTimerDuration = timerDuration;
      this.turnLabel.setText(`${hero.name} — HURRY! ⏱`);

      // Visual timer bar above the turn label
      const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
      const barW = 400;
      const barY = this.turnLabel.y - 30;
      this.bossTimerBar = this.add.graphics();
      this.bossTimerBar.setScrollFactor(0);
      this.updateBossTimerBar(barW, barY, 1);

      this.bossTimerUpdate = this.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          const elapsed = this.time.now - this.bossTimerStart;
          const pct = Math.max(0, 1 - elapsed / timerDuration);
          this.updateBossTimerBar(barW, barY, pct);
        },
      });

      this.bossTimer = this.time.delayedCall(timerDuration, () => {
        if (this.phase !== 'question' || this.locked) return;
        this.showToast('TIME UP!', COLORS_CSS.scarletL);
        // Find a wrong answer index and force-select it
        const wrongIdx = [0,1,2,3].find(i => i !== this.currentQuestion.correctIndex) ?? 0;
        this.onAnswer(wrongIdx);
      });
    } else {
      this.turnLabel.setText(`${hero.name}'s turn — answer the question!`);
    }

    // Consume ability: if the previous turn was wrong and the enemy has
    // the consume ability, one random wrong answer button is "eaten"
    // and can't be tapped. This forces the player to commit without a
    // full set of options.
    if (this._consumeNextTurn) {
      this._consumeNextTurn = false;
      const wrongIndices = [0, 1, 2, 3].filter((i) => i !== this.currentQuestion.correctIndex);
      const victim = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      this.recolorAnswerButton(victim, this.answerButtons[victim].baseColor, 0.25);
      this.answerButtons[victim].label.setText('?');
    }
  }

  updateBossTimerBar(barW, barY, pct) {
    if (!this.bossTimerBar) return;
    this.bossTimerBar.clear();
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const bx = area.cx - barW / 2;
    // Background
    this.bossTimerBar.fillStyle(0x3a2010, 0.6);
    this.bossTimerBar.fillRoundedRect(bx, barY, barW, 10, 4);
    // Fill — color shifts from green to red as time runs out
    const color = pct > 0.5 ? 0x4aa848 : pct > 0.25 ? 0xe8a030 : 0xe84040;
    this.bossTimerBar.fillStyle(color, 0.9);
    this.bossTimerBar.fillRoundedRect(bx, barY, barW * pct, 10, 4);
  }

  clearBossTimer() {
    if (this.bossTimer) { this.bossTimer.remove(); this.bossTimer = null; }
    if (this.bossTimerUpdate) { this.bossTimerUpdate.remove(); this.bossTimerUpdate = null; }
    if (this.bossTimerBar) { this.bossTimerBar.destroy(); this.bossTimerBar = null; }
  }

  /**
   * Recolor an answer button while keeping its organic papercut shape.
   * Uses the button's stored seed so the wobbled edges stay identical
   * across redraws.
   */
  recolorAnswerButton(i, color, alpha = 1) {
    const btn = this.answerButtons[i];
    if (!btn || !btn.bg || !this.answerBtnLayout) return;
    const { w, h, y, startX, gap } = this.answerBtnLayout;
    const x = startX + i * (w + gap);

    paintPaperRect(btn.bg, btn.shadow, x, y, w, h, color, {
      shadowOff: 5,
      shadowAlpha: 0.35 * alpha,
      alpha,
      strokeColor: 0x000000,
      strokeAlpha: 0.15 * alpha,
      strokeWidth: 2,
      organic: true,
      seed: btn.seed,
    });
    btn.label.setAlpha(alpha);
  }

  // --- Stacked equation helpers ---
  eqLineStyle(overrides = {}) {
    return {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '44px',
      color: '#3a2410',
      ...overrides,
    };
  }

  /**
   * Render the current question in stacked vertical form:
   *     50
   *   + 50
   *   ———
   *   ???
   */
  renderStackedEquation(q) {
    if (!q || !this.eqLines) return;
    const opSym = q.op === '*' ? '\u00d7' : q.op === '/' ? '\u00f7' : q.op;
    // Top operand right-justified
    this.eqLines.a.setText(`  ${q.a}`);
    // Operator + second operand
    this.eqLines.opB.setText(`${opSym} ${q.b}`);
    this.eqLines.bar.setText('\u2500'.repeat(Math.max(3, String(Math.max(q.a, q.b)).length + 2)));
    this.eqLines.ans.setText('?');
  }

  clearEquationDisplay() {
    if (!this.eqLines) return;
    this.eqLines.a.setText('');
    this.eqLines.opB.setText('');
    this.eqLines.bar.setText('');
    this.eqLines.ans.setText('');
  }

  startEnemyTurn() {
    const aliveEnemies = this.enemies.filter(e => e.hp > 0);
    const attackerNames = aliveEnemies.map(e => e.name).join(' & ');
    this.turnLabel.setText(`${attackerNames} attack${aliveEnemies.length > 1 ? '' : 's'}!`);
    this.clearEquationDisplay();
    this.phase = 'enemy';
    this.locked = true;
    this.refreshPotionButton();

    for (let i = 0; i < 4; i++) {
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 0.3);
      this.answerButtons[i].label.setText('');
    }

    // Each alive enemy attacks once, spread across heroes
    const livingHeroes = this.party.filter(h => h && h.hp > 0);
    if (livingHeroes.length === 0) return this.showDefeat();

    let attackIndex = 0;
    const doEnemyAttack = (enemyIdx) => {
      if (enemyIdx >= aliveEnemies.length) {
        this.time.delayedCall(250, () => this.nextTurn());
        return;
      }

      const attacker = aliveEnemies[enemyIdx];
      const attackerSpriteIdx = this.enemies.indexOf(attacker);
      const attackerSprite = this.enemySprites[attackerSpriteIdx];

      // Pick target hero: spread attacks (enemy 0 → hero 0, enemy 1 → hero 1, etc)
      const currentLiving = this.party.filter(h => h && h.hp > 0);
      if (currentLiving.length === 0) return this.showDefeat();
      const target = currentLiving[attackIndex % currentLiving.length];
      attackIndex++;

      // Enemy windup animation
      if (attackerSprite) {
        this.tweens.add({
          targets: attackerSprite.body,
          x: attackerSprite.x - 40,
          duration: 150,
          yoyo: true,
          ease: 'Sine.inOut',
        });
      }

      this.time.delayedCall(350, () => {
        const cls = target.class || 'knight';

        // Bunny dodge — 30% chance to avoid all damage
        if (cls === 'bunny' && Math.random() < 0.3) {
          this.showToast(`${target.name} DODGES!`, '#e86898');
          audio.play('battle/hit-hero');
          this.time.delayedCall(300, () => doEnemyAttack(enemyIdx + 1));
          return;
        }

        const result = computeEnemyDamage(attacker, target, { momentum: this.momentum });

        // Knight shield block — 40% chance to halve incoming damage
        if (cls === 'knight' && Math.random() < 0.4) {
          result.modifiedDamage = Math.max(1, Math.round(result.modifiedDamage / 2));
          result.newHp = Math.max(0, target.hp - result.modifiedDamage);
          this.showToast(`${target.name} BLOCKS! Half damage!`, '#5a7ab8');
        }

        applyDamageResult(target, result);
        this.hitFlash();
        this.flashHero(target, result);
        this.updateHeroHp(target);
        this.shakeCamera(0.01, 250);
        audio.play('battle/hit-hero');

        this.time.delayedCall(300, () => doEnemyAttack(enemyIdx + 1));
      });
    };

    doEnemyAttack(0);
  }

  // ================================================================
  // ANSWER HANDLING
  // ================================================================

  onAnswer(index) {
    if (this.phase !== 'question' || !this.currentQuestion) return;
    this.locked = true;
    this.clearBossTimer();

    const correct = index === this.currentQuestion.correctIndex;
    const btn = this.answerButtons[index];

    if (correct) {
      this.recolorAnswerButton(index, 0x40c040, 1);
      audio.play('battle/correct');

      this.streak++;
      this.battleCorrect++;
      this.momentum = advanceMomentum(this.momentum, true, this.streak);
      this.updateMomentumBar();
      if (this.streak >= 3) {
        this.showToast(`${this.streak}x STREAK!`, COLORS_CSS.goldL);
      } else {
        this.showToast('CORRECT!', COLORS_CSS.greenL);
      }

      // Target the current enemy
      const targetIdx = this.currentTarget;
      const targetEnemy = this.enemies[targetIdx] || this.enemy;
      const targetSprite = this.enemySprites[targetIdx] || this.enemySprite;

      // Fire the enemy's ability hook — some abilities react to
      // correct answers (e.g., shell_split triggers on hp threshold)
      invokeAbility(targetEnemy.ability, 'onHeroCorrect', {
        enemy: targetEnemy,
        party: this.party,
        scene: this,
        activeHero: this.party[this.currentTurn.heroIndex],
      });

      // DAMAGE = answer × momentum × class bonus.
      const baseDamage = this.currentQuestion.answer;
      const zone = getZone(this.momentum);
      const hero = this.party[this.currentTurn.heroIndex];
      const cls = hero.class || 'knight';

      // Class-specific damage modifiers
      let classMult = 1;
      let hitCount = 1;
      if (cls === 'knight') {
        classMult = 1.3; // heavy single hit
      } else if (cls === 'wizard') {
        if (this.streak >= 5) {
          // Streak 5+: heal weakest ally 10 HP
          const weakest = this.party.filter(h => h.hp > 0).sort((a, b) => a.hp - b.hp)[0];
          if (weakest) {
            weakest.hp = Math.min(weakest.maxHp, weakest.hp + 10);
            this.showToast(`${weakest.name} healed 10 HP!`, '#60ff60');
            this.updateAllHeroHp();
          }
        }
        classMult = this.streak >= 3 ? 1.5 : 1.0; // streak bonus
      } else if (cls === 'bunny') {
        hitCount = 2 + (this.streak >= 4 ? 1 : 0); // 2-3 hit combo
        classMult = 1.0 / hitCount * 1.2; // split damage but 20% total bonus
      }

      const totalDmg = Math.max(1, Math.round(baseDamage * zone.heroMult * classMult));
      const modified = hitCount > 1 ? Math.max(1, Math.round(totalDmg / hitCount)) * hitCount : totalDmg;
      const newHp = Math.max(0, targetEnemy.hp - modified);
      const result = {
        baseDamage,
        modifiedDamage: modified,
        newHp,
        killed: newHp === 0 && targetEnemy.hp > 0,
        hitCount,
        cls,
      };
      applyDamageResult(targetEnemy, result);

      // Check for kill IMMEDIATELY — don't wait for animations
      if (targetEnemy.hp <= 0) {
        this.hitFlash();
        this.flashEnemy(result, targetIdx);
        this.updateEnemyHp(targetIdx);
        this.burstParticles(targetSprite.x, targetSprite.y, 0xe8a030);
        this.shakeCamera(0.012, 300);
        // Fade out the killed enemy sprite
        this.tweens.add({ targets: targetSprite.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 400, ease: 'Back.in' });
        if (targetSprite.name) this.tweens.add({ targets: targetSprite.name, alpha: 0, duration: 300 });
        if (targetSprite.hpBarBg) this.tweens.add({ targets: targetSprite.hpBarBg, alpha: 0, duration: 300 });
        if (targetSprite.hpBarFill) this.tweens.add({ targets: targetSprite.hpBarFill, alpha: 0, duration: 300 });
        if (targetSprite.hpText) this.tweens.add({ targets: targetSprite.hpText, alpha: 0, duration: 300 });
        // Check if ALL enemies are dead
        if (this.allEnemiesDead()) {
          this.time.delayedCall(400, () => this.showVictory());
          return; // skip the normal turn advance below
        }
        // Not all dead: auto-advance target to next alive enemy
        const nextAlive = this.findNextAliveEnemy();
        if (nextAlive >= 0) this.currentTarget = nextAlive;
        // Fall through to turn advance
      } else {
        // Class-specific attack animation (enemy survived)
        const heroSprite = this.heroSprites[this.currentTurn.heroIndex];
        const enemyX = targetSprite.x;
        const enemyY = targetSprite.y;

        if (cls === 'knight') {
          // Knight: lunge to ENEMY position, curved slash arc, yellow-white sparks
          this.tweens.add({
            targets: heroSprite.body,
            x: enemyX - 80,
            duration: 200,
            ease: 'Back.out',
            onComplete: () => {
              this.hitFlash();
              this.flashEnemy(result, targetIdx);
              this.updateEnemyHp(targetIdx);
              audio.play('battle/hit-enemy');
              this.shakeCamera(0.008, 250);
              // Curved slash arc (bezier) ON the enemy
              const slash = this.add.graphics();
              slash.lineStyle(5, 0xf0e8c0, 0.95);
              slash.beginPath();
              slash.moveTo(enemyX - 40, enemyY - 50);
              // Approximate bezier with quadratic curve points
              const cp1x = enemyX + 30, cp1y = enemyY - 30;
              const cp2x = enemyX + 20, cp2y = enemyY + 40;
              const endX = enemyX - 30, endY = enemyY + 50;
              const steps = 12;
              for (let t = 1; t <= steps; t++) {
                const p = t / steps;
                const ip = 1 - p;
                const sx = ip*ip*ip*(enemyX - 40) + 3*ip*ip*p*cp1x + 3*ip*p*p*cp2x + p*p*p*endX;
                const sy = ip*ip*ip*(enemyY - 50) + 3*ip*ip*p*cp1y + 3*ip*p*p*cp2y + p*p*p*endY;
                slash.lineTo(sx, sy);
              }
              slash.strokePath();
              this.tweens.add({ targets: slash, alpha: 0, duration: 300, onComplete: () => slash.destroy() });
              // Yellow-white sparks at enemy position
              for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 20 + Math.random() * 30;
                const sparkColor = Math.random() > 0.5 ? 0xfff8c0 : 0xf0d040;
                const sp = this.add.circle(enemyX, enemyY, 3 + Math.random() * 3, sparkColor);
                this.tweens.add({
                  targets: sp,
                  x: enemyX + Math.cos(angle) * dist,
                  y: enemyY + Math.sin(angle) * dist,
                  alpha: 0, duration: 300 + Math.random() * 150,
                  onComplete: () => sp.destroy(),
                });
              }
              // Return
              this.tweens.add({ targets: heroSprite.body, x: heroSprite.x, duration: 150, delay: 80, ease: 'Sine.in' });
            },
          });
        } else if (cls === 'wizard') {
          // Wizard: elemental bolt based on current question operator
          const op = this.currentQuestion?.op || '+';
          let boltColor, glowColor, boltSize, boltStyle;
          if (op === '+') {
            boltColor = 0xff6020; glowColor = 0xff8040; boltSize = 16; boltStyle = 'fire';
          } else if (op === '-') {
            boltColor = 0xf0e020; glowColor = 0xffffff; boltSize = 12; boltStyle = 'lightning';
          } else if (op === '*') {
            boltColor = 0x40c0f0; glowColor = 0x80e0ff; boltSize = 14; boltStyle = 'ice';
          } else {
            boltColor = 0x8040c0; glowColor = 0xc080f0; boltSize = 14; boltStyle = 'void';
          }

          const startX = heroSprite.x;
          const startY = heroSprite.y - 40;

          if (boltStyle === 'lightning') {
            // Lightning: zigzag path in 3 segments with white flash on impact
            const segments = 3;
            const dx = (enemyX - startX) / segments;
            const dy = (enemyY - startY) / segments;
            const bolt = this.add.circle(startX, startY, boltSize, boltColor);
            const glow = this.add.circle(startX, startY, boltSize * 0.6, glowColor, 0.6);
            let seg = 0;
            const doSeg = () => {
              if (seg >= segments) {
                bolt.destroy(); glow.destroy();
                this.cameras.main.flash(80, 255, 255, 255, false, null, null, 0.3);
                this.hitFlash();
                this.flashEnemy(result, targetIdx);
                this.updateEnemyHp(targetIdx);
                audio.play('battle/hit-enemy');
                this.shakeCamera(0.008, 200);
                this.burstParticles(enemyX, enemyY, boltColor);
                return;
              }
              const zigOffset = (seg % 2 === 0 ? 1 : -1) * (40 + Math.random() * 30);
              const nx = startX + dx * (seg + 1) + (seg < segments - 1 ? zigOffset : 0);
              const ny = startY + dy * (seg + 1) + (seg < segments - 1 ? zigOffset * 0.3 : 0);
              this.tweens.add({
                targets: [bolt, glow], x: nx, y: ny, duration: 70, ease: 'Linear',
                onComplete: () => { seg++; doSeg(); },
              });
            };
            doSeg();
          } else if (boltStyle === 'ice') {
            // Ice shard: straight fast shot, frost burst on impact
            const shard = this.add.rectangle(startX, startY, boltSize, boltSize * 2.5, boltColor);
            shard.setRotation(Math.atan2(enemyY - startY, enemyX - startX));
            const glow = this.add.circle(startX, startY, boltSize * 0.5, glowColor, 0.5);
            this.tweens.add({
              targets: [shard, glow], x: enemyX, y: enemyY, duration: 150, ease: 'Linear',
              onComplete: () => {
                shard.destroy(); glow.destroy();
                this.hitFlash();
                this.flashEnemy(result, targetIdx);
                this.updateEnemyHp(targetIdx);
                audio.play('battle/hit-enemy');
                this.shakeCamera(0.008, 200);
                // Frost burst: light blue particles spreading outward
                for (let i = 0; i < 10; i++) {
                  const angle = (i / 10) * Math.PI * 2;
                  const dist = 30 + Math.random() * 25;
                  const fp = this.add.circle(enemyX, enemyY, 4 + Math.random() * 3, 0x80e0ff, 0.8);
                  this.tweens.add({
                    targets: fp, x: enemyX + Math.cos(angle) * dist, y: enemyY + Math.sin(angle) * dist,
                    alpha: 0, duration: 400, onComplete: () => fp.destroy(),
                  });
                }
              },
            });
          } else if (boltStyle === 'void') {
            // Void bolt: spiral path, dark implosion at impact
            const orb = this.add.circle(startX, startY, boltSize, boltColor);
            const glow = this.add.circle(startX, startY, boltSize * 0.6, glowColor, 0.5);
            const spiralSteps = 8;
            const totalDist = Math.sqrt((enemyX - startX) ** 2 + (enemyY - startY) ** 2);
            let step = 0;
            const doSpiral = () => {
              if (step >= spiralSteps) {
                orb.destroy(); glow.destroy();
                this.hitFlash();
                this.flashEnemy(result, targetIdx);
                this.updateEnemyHp(targetIdx);
                audio.play('battle/hit-enemy');
                this.shakeCamera(0.008, 200);
                // Dark implosion: particles rush inward then vanish
                for (let i = 0; i < 10; i++) {
                  const angle = (i / 10) * Math.PI * 2;
                  const dist = 40 + Math.random() * 20;
                  const dp = this.add.circle(enemyX + Math.cos(angle) * dist, enemyY + Math.sin(angle) * dist, 5, 0x4020a0, 0.8);
                  this.tweens.add({
                    targets: dp, x: enemyX, y: enemyY, alpha: 0, scale: 0.2,
                    duration: 250, onComplete: () => dp.destroy(),
                  });
                }
                return;
              }
              const t = (step + 1) / spiralSteps;
              const baseX = startX + (enemyX - startX) * t;
              const baseY = startY + (enemyY - startY) * t;
              const spiralR = 30 * (1 - t);
              const angle = t * Math.PI * 4;
              const nx = baseX + Math.cos(angle) * spiralR;
              const ny = baseY + Math.sin(angle) * spiralR;
              this.tweens.add({
                targets: [orb, glow], x: nx, y: ny, duration: 50, ease: 'Linear',
                onComplete: () => { step++; doSpiral(); },
              });
            };
            doSpiral();
          } else {
            // Fire bolt: trailing orange particles
            const orb = this.add.circle(startX, startY, boltSize, boltColor);
            const glow = this.add.circle(startX, startY, boltSize * 0.6, glowColor, 0.6);
            const midX = (startX + enemyX) / 2;
            const midY = Math.min(startY, enemyY) - 80;
            // Trail particles during flight
            const trailTimer = this.time.addEvent({
              delay: 40, loop: true,
              callback: () => {
                const tp = this.add.circle(orb.x, orb.y, 4 + Math.random() * 3, 0xff8020, 0.6);
                this.tweens.add({ targets: tp, alpha: 0, scale: 0.3, duration: 200, onComplete: () => tp.destroy() });
              },
            });
            this.tweens.add({
              targets: [orb, glow], x: midX, y: midY, duration: 200, ease: 'Sine.out',
              onComplete: () => {
                this.tweens.add({
                  targets: [orb, glow], x: enemyX, y: enemyY, duration: 200, ease: 'Sine.in',
                  onComplete: () => {
                    trailTimer.remove();
                    orb.destroy(); glow.destroy();
                    this.hitFlash();
                    this.flashEnemy(result, targetIdx);
                    this.updateEnemyHp(targetIdx);
                    audio.play('battle/hit-enemy');
                    this.shakeCamera(0.008, 200);
                    this.burstParticles(enemyX, enemyY, boltColor);
                  },
                });
              },
            });
          }
        } else if (cls === 'bunny') {
          // Bunny: martial arts combo — dash TO enemy, multi-hit with pink particles
          const hits = result.hitCount || 2;
          let hitIdx = 0;
          // Dash to enemy position
          this.tweens.add({
            targets: heroSprite.body,
            x: enemyX - 50,
            duration: 100,
            ease: 'Quad.out',
            onComplete: () => {
              const doHit = () => {
                if (hitIdx >= hits) {
                  // Return to original position
                  this.tweens.add({ targets: heroSprite.body, x: heroSprite.x, y: heroSprite.y, duration: 150, ease: 'Sine.in' });
                  return;
                }
                if (hitIdx === 0) {
                  // Hit 1: Left hook
                  this.tweens.add({
                    targets: heroSprite.body, x: enemyX - 30, duration: 100, ease: 'Linear',
                    onComplete: () => {
                      this.flashEnemy(result, targetIdx);
                      this.updateEnemyHp(targetIdx);
                      audio.play('battle/hit-enemy');
                      this.burstParticles(enemyX, enemyY, 0xe86898);
                      this.shakeCamera(0.006, 100);
                      hitIdx++;
                      this.time.delayedCall(50, doHit);
                    },
                  });
                } else if (hitIdx === 1) {
                  // Hit 2: Right kick
                  this.tweens.add({
                    targets: heroSprite.body, x: enemyX + 30, duration: 100, ease: 'Linear',
                    onComplete: () => {
                      this.burstParticles(enemyX, enemyY, 0xe86898);
                      this.shakeCamera(0.006, 100);
                      hitIdx++;
                      this.time.delayedCall(50, doHit);
                    },
                  });
                } else if (hitIdx === 2) {
                  // Hit 3: Uppercut (only if streak >= 4)
                  this.tweens.add({
                    targets: heroSprite.body, x: enemyX, y: enemyY + 30, duration: 100, ease: 'Linear',
                    onComplete: () => {
                      // Enemy bounces up 20px
                      this.tweens.add({ targets: targetSprite.body, y: targetSprite.y - 20, duration: 100, yoyo: true, ease: 'Sine.out' });
                      this.burstParticles(enemyX, enemyY - 10, 0xe86898);
                      this.shakeCamera(0.008, 120);
                      hitIdx++;
                      this.time.delayedCall(50, doHit);
                    },
                  });
                }
              };
              doHit();
            },
          });
        } else {
          // Fallback: simple lunge
          this.tweens.add({
            targets: heroSprite.body, x: heroSprite.x + 60, duration: 120, yoyo: true, ease: 'Sine.inOut',
            onYoyo: () => {
              this.hitFlash(); this.flashEnemy(result, targetIdx); this.updateEnemyHp(targetIdx);
              audio.play('battle/hit-enemy'); this.shakeCamera(0.008, 200);
              this.burstParticles(enemyX, enemyY, 0xe8a030);
            },
          });
        }
      }
    } else {
      this.recolorAnswerButton(index, 0xc04040, 1);
      // Flash the correct one in green too
      this.recolorAnswerButton(this.currentQuestion.correctIndex, 0x40c040, 1);
      audio.play('battle/wrong');

      this.streak = 0;
      this.battleWrong++;
      this.momentum = advanceMomentum(this.momentum, false);
      this.updateMomentumBar();
      if (shouldShowTutorial('FIRST_WRONG')) {
        markTutorialShown('FIRST_WRONG');
        this.showToast(getTutorialText('FIRST_WRONG'), COLORS_CSS.goldL);
      } else {
        this.showToast('Try again!', COLORS_CSS.scarletL);
      }

      // Fire enemy ability hook for wrong answers — most interesting
      // side effects trigger here (sporulate boost, crown tally, consume)
      const wrongTargetEnemy = this.enemies[this.currentTarget] || this.enemy;
      invokeAbility(wrongTargetEnemy.ability, 'onHeroWrong', {
        enemy: wrongTargetEnemy,
        party: this.party,
        scene: this,
        activeHero: this.party[this.currentTurn.heroIndex],
      });

      // Brief pause, then enemy counters
      this.time.delayedCall(300, () => {
        const target = this.party[this.currentTurn.heroIndex];
        const counterEnemy = this.enemies[this.currentTarget] || this.enemy;
        const result = computeEnemyDamage(counterEnemy, target, { momentum: this.momentum });
        applyDamageResult(target, result);
        this.hitFlash();
        this.flashHero(target, result);
        this.updateHeroHp(target);
        this.shakeCamera(0.01, 250);
        audio.play('battle/hit-hero');
      });
    }

    // Snappy turn advance — see principle #3 (tempo) in DESIGN-PRINCIPLES.md.
    this.time.delayedCall(550, () => this.nextTurn());
  }

  // ================================================================
  // POTION
  // ================================================================

  refreshPotionButton() {
    if (!this.potionLabel) return;
    const count = this.save.potions || 0;
    this.potionLabel.setText(`POTION ${count}`);
    const canUse = count > 0 && this.phase === 'question';
    if (this.potionBtn && this.potionBtn.bg) {
      const alpha = canUse ? 1 : 0.5;
      this.potionBtn.bg.setAlpha(alpha);
      this.potionBtn.shadow.setAlpha(alpha * 0.7);
      this.potionBtn.label.setAlpha(alpha);
    }
  }

  usePotion() {
    if (this.phase !== 'question' || this.locked) return;

    if ((this.save.potions || 0) <= 0) {
      this.showToast('No potions left!', COLORS_CSS.scarletL);
      return;
    }

    // Heal the active hero
    const activeHero = this.party[this.currentTurn?.heroIndex ?? 0];
    if (!activeHero) return;
    const healAmount = 25;
    const before = activeHero.hp;
    activeHero.hp = Math.min(activeHero.maxHp, activeHero.hp + healAmount);
    const actualHealed = activeHero.hp - before;

    this.save.potions -= 1;
    writeSave(this.save);

    audio.play('battle/heal');
    this.showToast(`+${actualHealed} HP`, COLORS_CSS.greenL);
    this.floatDamageNumber(
      this.heroSprites[this.party.indexOf(activeHero)].x,
      this.heroSprites[this.party.indexOf(activeHero)].y - 80,
      actualHealed,
      '#40ff60',
    );
    this.updateHeroHp(activeHero);
    this.refreshPotionButton();

    // Using a potion costs your turn — skip straight to the enemy's
    this.locked = true;
    this.time.delayedCall(600, () => this.nextTurn());
  }

  // ================================================================
  // JUICE: hit-pause, particles, arcing damage numbers, camera shake
  // ================================================================

  /**
   * Impact flash — camera-based hit effect that does NOT pause tweens.
   *
   * The original hitPause used tweens.pauseAll() which deadlocked the
   * game: it froze the victory overlay's fade-in tween, so the player
   * saw a transparent overlay and thought the game locked up. It also
   * risked freezing delayedCall-driven turn advances.
   *
   * This replacement gives a brief white flash + camera shake combo
   * that feels impactful without touching the tween timeline at all.
   */
  hitFlash() {
    this.cameras.main.flash(120, 255, 255, 255, false, null, null, 0.15);
  }

  /**
   * Burst of colored squares radiating from a point. Particles without
   * needing a loaded image asset — uses built-in rectangles.
   */
  burstParticles(x, y, color) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 40 + Math.random() * 40;
      const size = 6 + Math.random() * 6;
      const p = this.add.rectangle(x, y, size, size, color);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        angle: Math.random() * 360,
        duration: 450 + Math.random() * 200,
        ease: 'Cubic.out',
        onComplete: () => p.destroy(),
      });
    }
  }

  flashEnemy(result, targetIdx) {
    const idx = targetIdx ?? this.currentTarget;
    const s = this.enemySprites[idx] || this.enemySprite;
    // White flash + shake
    this.tweens.add({ targets: s.body, alpha: 0.2, duration: 50, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: s.body, x: s.x + 8, duration: 40, yoyo: true, repeat: 3 });
    this.floatDamageNumber(s.x, s.y - 100, result.modifiedDamage, '#60ff60');
  }

  flashHero(hero, result) {
    const idx = this.party.indexOf(hero);
    if (idx < 0) return;
    const s = this.heroSprites[idx];
    this.tweens.add({
      targets: s.body,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
    });
    this.floatDamageNumber(s.x, s.y - 80, result.modifiedDamage, '#ff6060');
    this.burstParticles(s.x, s.y - 30, 0xc03030);
  }

  /**
   * Arcing damage number: pops up with a slight horizontal drift,
   * scales up then fades. More satisfying than a straight float.
   */
  floatDamageNumber(x, y, amount, color) {
    const t = this.add.text(x, y, `-${amount}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '36px',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScale(0.5);

    const driftX = (Math.random() - 0.5) * 60;
    this.tweens.add({
      targets: t,
      y: y - 120,
      x: x + driftX,
      scale: 1.2,
      duration: 250,
      ease: 'Back.out',
    });
    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 400,
      delay: 500,
      onComplete: () => t.destroy(),
    });
  }

  shakeCamera(intensity = 0.008, duration = 200) {
    this.cameras.main.shake(duration, intensity);
  }

  updateHeroHp(hero) {
    const idx = this.party.indexOf(hero);
    if (idx < 0) return;
    const s = this.heroSprites[idx];
    const pct = Math.max(0, hero.hp / hero.maxHp);
    this.tweens.add({
      targets: s.hpBarFill,
      width: 146 * pct,
      duration: 300,
      ease: 'Cubic.out',
    });
    s.hpText.setText(`${hero.hp}/${hero.maxHp}`);

    if (hero.hp <= 0) {
      s.body.setAlpha(0.2);
      s.name.setAlpha(0.3);
    }
  }

  updateAllHeroHp() {
    this.party.forEach(h => { if (h && h.hp > 0) this.updateHeroHp(h); });
  }

  updateEnemyHp(targetIdx) {
    const idx = targetIdx ?? this.currentTarget;
    const enemy = this.enemies[idx] || this.enemy;
    const sprite = this.enemySprites[idx] || this.enemySprite;
    const pct = Math.max(0, enemy.hp / enemy.maxHp);
    const fullW = 200 + 10 - 4; // matches buildEnemySprite
    this.tweens.add({
      targets: sprite.hpBarFill,
      width: fullW * pct,
      duration: 300,
      ease: 'Cubic.out',
    });
    sprite.hpText.setText(`${enemy.hp}/${enemy.maxHp}`);
  }

  updateMomentumBar() {
    const zone = getZone(this.momentum);
    this.momentumLabel.setText(zone.label);
    let fillColor = 0x4aa848; // ZONE (green)
    if (zone.label === 'COOL') fillColor = 0x4080c0;
    else if (zone.label === 'HEAT') fillColor = 0xd06020;
    if (this.momentumBarObj) {
      updatePaperBar(this.momentumBarObj, this.momentum, fillColor);
    }
  }

  updateHeroIndicators() {
    for (let i = 0; i < this.heroSprites.length; i++) {
      const active = this.currentTurn?.who === 'hero' && this.currentTurn.heroIndex === i;
      this.heroSprites[i].indicator.setVisible(active);
    }
  }

  showToast(message, color) {
    this.toast.setText(message).setColor(color).setAlpha(1);
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      duration: 400,
      delay: 800,
    });
  }

  // ================================================================
  // END STATES — save integration
  // ================================================================

  showVictory() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.locked = true;

    this.clearBossTimer();
    this.time.removeAllEvents();

    audio.stopMusic();
    audio.play('battle/victory');

    // Compute rewards
    const goldEarned = 10 + this.floor * 5;
    const save = this.save;
    save.gold += goldEarned;
    save.stats.totalBattles++;
    save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + this.battleCorrect;
    save.stats.totalWrong = (save.stats.totalWrong ?? 0) + this.battleWrong;

    // Award XP and check for level ups
    const xpEarned = 10 + this.floor * 5 + this.battleCorrect * 2;
    let leveledUp = [];
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = this.party[i].hp;
      save.party[i].maxHp = this.party[i].maxHp;
      // XP + level
      const oldLevel = save.party[i].level || 1;
      save.party[i].xp = (save.party[i].xp || 0) + xpEarned;
      const newLevel = computeLevel(save.party[i].xp);
      if (newLevel > oldLevel) {
        save.party[i].level = newLevel;
        const bonus = levelBonuses(newLevel);
        const oldBonus = levelBonuses(oldLevel);
        const hpGain = bonus.maxHp - oldBonus.maxHp;
        save.party[i].maxHp += hpGain;
        save.party[i].hp = Math.min(save.party[i].hp + hpGain, save.party[i].maxHp);
        leveledUp.push(save.party[i].name);
      } else {
        save.party[i].level = newLevel;
      }
    }

    // Mark floor complete on boss defeat. If we came directly from the
    // world map (no maze wrapper), any win counts so the progression
    // still advances on the fast path.
    if (this.isBoss || this.returnScene === SCENES.WORLD_MAP) {
      markFloorComplete(save, this.floor);
      // Mark the boss as defeated in the maze state so the exit opens
      const mazeKey = `mazeState_${this.floor}`;
      const mazeState = this.registry.get(mazeKey);
      if (mazeState) {
        mazeState.bossDefeated = true;
        this.registry.set(mazeKey, mazeState);
      }
    }

    writeSave(save);

    // Enemy fade-out + gold coin burst (all enemy sprites)
    const spritesToFade = this.enemySprites || [this.enemySprite];
    for (let ei = 0; ei < spritesToFade.length; ei++) {
      const es = spritesToFade[ei];
      if (!es) continue;
      try {
        if (es.body) {
          this.tweens.add({ targets: es.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 600, ease: 'Back.in' });
        }
        this.burstParticles(es.x, es.y, 0xe8a030);
        this.burstParticles(es.x, es.y, 0xf0d040);
        if (es.name) this.tweens.add({ targets: es.name, alpha: 0, duration: 400 });
        if (es.hpBarBg) this.tweens.add({ targets: es.hpBarBg, alpha: 0, duration: 400 });
        if (es.hpBarFill) this.tweens.add({ targets: es.hpBarFill, alpha: 0, duration: 400 });
        if (es.hpText) this.tweens.add({ targets: es.hpText, alpha: 0, duration: 400 });
      } catch (_) { /* defensive: don't let sprite cleanup prevent victory */ }
    }

    const accuracy = this.battleCorrect + this.battleWrong > 0
      ? Math.round((this.battleCorrect / (this.battleCorrect + this.battleWrong)) * 100) : 100;

    // Build defeated names
    const defeatedNames = this.enemies.length > 1
      ? this.enemies.map(e => e.name).join(' & ')
      : this.enemy.name;

    this.time.delayedCall(500, () => {
      this.endOverlay.titleText.setText('VICTORY!');
      this.endOverlay.subText.setText(`${defeatedNames} defeated!`);
      let rewardText = `+${goldEarned} GOLD  •  +${xpEarned} XP  •  ${accuracy}%`;
      if (leveledUp.length > 0) {
        rewardText += `\n⭐ ${leveledUp.join(' & ')} LEVELED UP!`;
      }
      this.endOverlay.rewardsText.setText(rewardText);
      this.endOverlay.setVisible(true);
      this.endOverlay.setAlpha(1);
    });
  }

  showDefeat() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.locked = true;
    this.clearBossTimer();
    this.time.removeAllEvents();
    audio.stopMusic();
    audio.play('battle/defeat');

    // Full party heal — failure is a restart, not a punishment.
    // See DESIGN-PRINCIPLES.md principle 8.
    const save = this.save;
    save.stats.totalBattles++;
    save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + this.battleCorrect;
    save.stats.totalWrong = (save.stats.totalWrong ?? 0) + this.battleWrong;
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = this.party[i].maxHp;
      save.party[i].maxHp = this.party[i].maxHp;
    }
    writeSave(save);

    // Encouraging messages — rotate through them
    const msgs = [
      "You'll get them next time!",
      "Practice makes perfect!",
      "Every try makes you stronger!",
      "Don't give up — heroes never quit!",
      "Take a breath and try again!",
    ];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];

    this.endOverlay.titleText.setText('RETREAT!');
    this.endOverlay.subText.setText(`Your party retreats to camp.\n${msg}`);
    this.endOverlay.rewardsText.setText(`You got ${this.battleCorrect} correct this battle!`);
    this.endOverlay.setVisible(true);
    this.endOverlay.setAlpha(1);
  }
}
