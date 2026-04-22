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

    if (data?.enemy) {
      this.enemy = { ...data.enemy };
    } else {
      const def = FLOOR_1[Math.floor(Math.random() * FLOOR_1.length)];
      this.enemy = spawnEnemy(def.id, {
        grade: data?.grade ?? 3,
        isBoss: !!data?.isBoss,
      });
    }

    this.floor = data?.floor ?? 1;
    this.grade = data?.grade ?? 3;
    this.operator = FLOOR_OPERATORS[this.floor] ?? '+';
    this.isBoss = !!data?.isBoss;

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

    // Fire the enemy's onBattleStart hook so any ability state can
    // initialize
    invokeAbility(this.enemy.ability, 'onBattleStart', {
      enemy: this.enemy,
      party: this.party,
      scene: this,
    });

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

      const hpBarBg = this.add.rectangle(x, y + 110, 150, 14, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD);
      const hpBarFill = this.add.rectangle(x - 73, y + 110, 146, 10, 0x40c040)
        .setOrigin(0, 0.5);
      const hpText = this.add.text(x, y + 134, `${hero.hp}/${hero.maxHp}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);

      const indicator = this.add.triangle(x, y - 160, 0, 0, 20, 0, 10, 20, COLORS.goldL)
        .setVisible(false);

      return { hero, body, name, hpBarBg, hpBarFill, hpText, indicator, x, y };
    });
  }

  buildEnemySprite() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const uiTop = area.bottom - 220;
    const groundY = uiTop - 30;
    const x = GAME_WIDTH * 0.76;
    const monsterScale = this.enemy.isBoss ? 3.5 : 3;
    const y = groundY - 80 * (monsterScale / 1.5);
    const w = 200, h = 220;

    const body = drawMonsterSprite(this, x, y, this.enemy, { scale: monsterScale });

    // Stack name + HP bar + HP text ABOVE the enemy sprite so they
    // never get clipped by the papercut ground line or the answer
    // button strip. Also easier for a kid to see "how close am I to
    // winning" at a glance.
    const headY = y - h / 2;
    const nameY = headY - 64;
    const hpY = headY - 32;
    const hpTextY = headY - 10;

    const name = this.add.text(x, nameY, this.enemy.name.toUpperCase(), {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 4,
    }).setOrigin(0.5);

    const hpBarBg = this.add.rectangle(x, hpY, w + 20, 20, COLORS.ink)
      .setStrokeStyle(2, COLORS.paperD);
    const hpBarFill = this.add.rectangle(x - (w + 20) / 2 + 2, hpY, (w + 20 - 4) * (this.enemy.hp / this.enemy.maxHp), 14, 0xc04030)
      .setOrigin(0, 0.5);
    const hpText = this.add.text(x, hpTextY, `${this.enemy.hp}/${this.enemy.maxHp}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '15px',
      color: '#fff8e0',
      stroke: '#1a0e04',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.enemySprite = { body, name, hpBarBg, hpBarFill, hpText, x, y };
  }

  // ================================================================
  // UI — momentum, question, answers, toasts, end screen
  // ================================================================

  buildUI() {
    // NEW LAYOUT — characters always visible, equation floats as a
    // small paper note in the upper area, only the answer-button row
    // lives in a tight bottom strip.
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    // === BOTTOM UI: equation panel + answer buttons stacked ===
    const ansH = 90;
    const eqH = 100;
    const totalUiH = ansH + eqH + 30;
    const ansY = area.bottom - ansH / 2 - 8;
    const eqY = ansY - ansH / 2 - eqH / 2 - 10;

    // Background panel spanning both equation and answers
    PaperPanel(this, area.cx, area.bottom - totalUiH / 2, area.w, totalUiH + 10, {
      color: 0xfff4e0, alpha: 0.96, radius: 18,
    });

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

    // === EQUATION — centered above answer buttons, prominent ===
    const noteW = 220;
    const noteH = eqH - 6;
    const noteCx = area.cx;
    const noteCy = eqY;

    PaperPanel(this, noteCx, noteCy, noteW, noteH, {
      color: 0xfff8e8, alpha: 0.98, radius: 14,
    });

    this.eqLines = {
      a:    this.add.text(noteCx + 20, noteCy - 26, '', this.eqLineStyle({ fontSize: '32px' })),
      opB:  this.add.text(noteCx + 20, noteCy,      '', this.eqLineStyle({ fontSize: '32px' })),
      bar:  this.add.text(noteCx,      noteCy + 16, '\u2500\u2500\u2500', this.eqLineStyle({ fontSize: '16px', color: '#6a4c28' })),
      ans:  this.add.text(noteCx + 20, noteCy + 34, '?', this.eqLineStyle({ fontSize: '32px', color: '#b86820' })),
    };
    this.eqLines.a.setOrigin(1, 0.5);
    this.eqLines.opB.setOrigin(1, 0.5);
    this.eqLines.bar.setOrigin(0.5);
    this.eqLines.ans.setOrigin(1, 0.5);

    // Turn label — sits in its OWN little paper pill ABOVE the bottom
    // answer strip so it can't get clipped by the strip edge.
    const turnY = eqY - eqH / 2 - 28;
    PaperPanel(this, area.cx, turnY, 440, 46, {
      color: 0x1a0e04, alpha: 0.85, radius: 14, shadowOff: 4, shadowAlpha: 0.3,
    });
    this.turnLabel = this.add.text(area.cx, turnY, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '19px',
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

  nextTurn() {
    if (this.phase === 'end') return;

    if (isPartyDefeated(this.party)) return this.showDefeat();
    if (this.enemy.hp <= 0) return this.showVictory();

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
    this.turnLabel.setText(`${hero.name}'s turn — answer the question!`);
    this.phase = 'question';
    this.locked = false;
    this.refreshPotionButton();

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
    this.turnLabel.setText(`${this.enemy.name} attacks!`);
    this.clearEquationDisplay();
    this.phase = 'enemy';
    this.locked = true;
    this.refreshPotionButton();

    for (let i = 0; i < 4; i++) {
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 0.3);
      this.answerButtons[i].label.setText('');
    }

    // Enemy windup animation
    this.tweens.add({
      targets: this.enemySprite.body,
      x: this.enemySprite.x - 40,
      duration: 150,
      yoyo: true,
      ease: 'Sine.inOut',
    });

    this.time.delayedCall(350, () => {
      const target = pickRandomLivingHero(this.party);
      if (!target) return this.showDefeat();
      const result = computeEnemyDamage(this.enemy, target, { momentum: this.momentum });
      applyDamageResult(target, result);
      this.hitFlash();
      this.flashHero(target, result);
      this.updateHeroHp(target);
      this.shakeCamera(0.01, 250);
      audio.play('battle/hit-hero');

      this.time.delayedCall(450, () => this.nextTurn());
    });
  }

  // ================================================================
  // ANSWER HANDLING
  // ================================================================

  onAnswer(index) {
    if (this.phase !== 'question' || !this.currentQuestion) return;
    this.locked = true;

    const correct = index === this.currentQuestion.correctIndex;
    const btn = this.answerButtons[index];

    if (correct) {
      this.recolorAnswerButton(index, 0x40c040, 1);
      audio.play('battle/correct');

      this.streak++;
      this.battleCorrect++;
      this.momentum = advanceMomentum(this.momentum, true, this.streak);
      this.updateMomentumBar();
      this.showToast('CORRECT!', COLORS_CSS.greenL);

      // Fire the enemy's ability hook — some abilities react to
      // correct answers (e.g., shell_split triggers on hp threshold)
      invokeAbility(this.enemy.ability, 'onHeroCorrect', {
        enemy: this.enemy,
        party: this.party,
        scene: this,
        activeHero: this.party[this.currentTurn.heroIndex],
      });

      // DAMAGE = the math answer. Per design: getting "6+6=12" right
      // deals 12 damage. This makes the math directly meaningful.
      // Momentum still applies as a multiplier on top.
      const baseDamage = this.currentQuestion.answer;
      const zone = getZone(this.momentum);
      const modified = Math.max(1, Math.round(baseDamage * zone.heroMult));
      const newHp = Math.max(0, this.enemy.hp - modified);
      const result = {
        baseDamage,
        modifiedDamage: modified,
        newHp,
        killed: newHp === 0 && this.enemy.hp > 0,
      };
      applyDamageResult(this.enemy, result);

      // Check for kill IMMEDIATELY — don't wait for animations
      if (this.enemy.hp <= 0) {
        this.hitFlash();
        this.flashEnemy(result);
        this.updateEnemyHp();
        this.burstParticles(this.enemySprite.x, this.enemySprite.y, 0xe8a030);
        this.shakeCamera(0.012, 300);
        this.time.delayedCall(400, () => this.showVictory());
        return; // skip the normal turn advance below
      }

      // Animate attacker forward, then back
      const heroSprite = this.heroSprites[this.currentTurn.heroIndex];
      this.tweens.add({
        targets: heroSprite.body,
        x: heroSprite.x + 60,
        duration: 120,
        yoyo: true,
        ease: 'Sine.inOut',
        onYoyo: () => {
          this.hitFlash();
          this.flashEnemy(result);
          this.updateEnemyHp();
          audio.play('battle/hit-enemy');
          this.shakeCamera(0.008, 200);
          this.burstParticles(this.enemySprite.x, this.enemySprite.y, 0xe8a030);
        },
      });
    } else {
      this.recolorAnswerButton(index, 0xc04040, 1);
      // Flash the correct one in green too
      this.recolorAnswerButton(this.currentQuestion.correctIndex, 0x40c040, 1);
      audio.play('battle/wrong');

      this.streak = 0;
      this.battleWrong++;
      this.momentum = advanceMomentum(this.momentum, false);
      this.updateMomentumBar();
      this.showToast('Try again!', COLORS_CSS.scarletL);

      // Fire enemy ability hook for wrong answers — most interesting
      // side effects trigger here (sporulate boost, crown tally, consume)
      invokeAbility(this.enemy.ability, 'onHeroWrong', {
        enemy: this.enemy,
        party: this.party,
        scene: this,
        activeHero: this.party[this.currentTurn.heroIndex],
      });

      // Brief pause, then enemy counters
      this.time.delayedCall(300, () => {
        const target = this.party[this.currentTurn.heroIndex];
        const result = computeEnemyDamage(this.enemy, target, { momentum: this.momentum });
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

  flashEnemy(result) {
    const s = this.enemySprite;
    this.tweens.add({
      targets: s.body,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
    });
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

  updateEnemyHp() {
    const pct = Math.max(0, this.enemy.hp / this.enemy.maxHp);
    const fullW = 200 + 10 - 4; // matches buildEnemySprite
    this.tweens.add({
      targets: this.enemySprite.hpBarFill,
      width: fullW * pct,
      duration: 300,
      ease: 'Cubic.out',
    });
    this.enemySprite.hpText.setText(`${this.enemy.hp}/${this.enemy.maxHp}`);
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

    // CRITICAL: kill ALL pending timers and tweens so no stale nextTurn
    // or enemy attack callback can restart the turn cycle after victory.
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

    // Update party HP in save (persist health)
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = this.party[i].hp;
      save.party[i].maxHp = this.party[i].maxHp;
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

    this.endOverlay.titleText.setText('VICTORY!');
    this.endOverlay.subText.setText(`${this.enemy.name} defeated!`);
    this.endOverlay.rewardsText.setText(`+${goldEarned} GOLD`);
    this.endOverlay.setVisible(true);
    this.endOverlay.setAlpha(1);
  }

  showDefeat() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.locked = true;
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

    this.endOverlay.titleText.setText('RETREAT!');
    this.endOverlay.subText.setText('Your party retreats to camp.\nHeal up and try again!');
    this.endOverlay.rewardsText.setText('');
    this.endOverlay.setVisible(true);
    this.endOverlay.setAlpha(1);
  }
}
