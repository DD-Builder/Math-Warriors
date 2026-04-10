import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { generateQuestion, formatQuestion } from '../systems/math.js';
import {
  getZone,
  advanceMomentum,
  computeHeroDamage,
  computeEnemyDamage,
  applyDamageResult,
  buildTurnSequence,
  advanceTurn,
  isPartyDefeated,
  pickRandomLivingHero,
} from '../systems/combat.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { spawnEnemy, FLOOR_1, FLOOR_OPERATORS } from '../data/enemies.js';

/**
 * BattleScene — the turn-based math combat stage.
 *
 * v0.2 scope:
 *   - 3 heroes vs. 1 enemy
 *   - Turn order alternates hero/enemy/hero/enemy/...
 *   - Math question appears on the hero's turn
 *   - Correct answer → hero attacks
 *   - Wrong answer → enemy counter-attacks
 *   - Enemy turn attacks a random living hero
 *   - Victory / defeat screens with "continue" button
 *   - Momentum bar drives damage multipliers (symmetric this time)
 *
 * Uses placeholder rectangle sprites for now. Real art slots in via
 * the `displayColor` field on hero/enemy records — when we load real
 * PNGs later, we just swap the rectangle for an Image and everything
 * else keeps working.
 *
 * Design notes (see docs/ART-STYLE.md):
 *   This scene is meant to eventually be a "diorama stage" with a
 *   framed papercut backdrop, central glow, and heroes/enemy as
 *   silhouette-clear sprites in front. v0.2 is rectangles on a
 *   dark background — we'll layer the art in later without touching
 *   the combat code.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BATTLE });
  }

  /**
   * Scene can be started with data. If not provided, we pick a default
   * party and a Floor 1 enemy so standalone testing works.
   *
   * @param {object} data
   * @param {object[]} [data.party]  3 combat-ready hero records
   * @param {object} [data.enemy]    A combat-ready enemy record
   * @param {number} [data.floor]    Floor number, 1-5
   * @param {number} [data.grade]    Player grade 0-5
   */
  init(data) {
    // Party: use provided or default to one of each class
    if (data?.party && data.party.length === 3) {
      this.party = data.party.map((h) => ({ ...h }));  // clone
    } else {
      this.party = [
        spawnHero(KNIGHTS[0].id),
        spawnHero(WIZARDS[4].id),
        spawnHero(BUNNIES[0].id),
      ];
    }

    // Enemy: use provided or pick a random Floor 1 enemy
    if (data?.enemy) {
      this.enemy = { ...data.enemy };
    } else {
      const def = FLOOR_1[Math.floor(Math.random() * FLOOR_1.length)];
      this.enemy = spawnEnemy(def.id);
    }

    this.floor = data?.floor ?? 1;
    this.grade = data?.grade ?? 3;
    this.operator = FLOOR_OPERATORS[this.floor] ?? '+';

    // Battle state
    this.momentum = 0.5;
    this.streak = 0;
    this.turnSeq = buildTurnSequence(this.party.length);
    this.turnIdx = -1;   // will advance to 0 on first nextTurn
    this.phase = 'intro';
    this.locked = false;
    this.currentQuestion = null;
  }

  create() {
    this.buildBackground();
    this.buildHeroSprites();
    this.buildEnemySprite();
    this.buildUI();

    // Kick off the fight after a brief intro beat
    this.time.delayedCall(600, () => this.nextTurn());
  }

  // ================================================================
  // BACKGROUND — placeholder stage
  // ================================================================

  buildBackground() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Dark stage (will be replaced with papercut diorama art)
    this.cameras.main.setBackgroundColor(COLORS.ink);

    // Warm central glow — the "stage light" from Reference C
    const glow = this.add.graphics();
    const grad = this.add.graphics();
    grad.fillStyle(0x4a2810, 0.5);
    grad.fillCircle(cx, cy - 80, 400);
    grad.fillStyle(0x8a4820, 0.3);
    grad.fillCircle(cx, cy - 80, 250);
    grad.fillStyle(0xc87020, 0.2);
    grad.fillCircle(cx, cy - 80, 150);

    // Ground line / stage floor
    const groundY = GAME_HEIGHT * 0.68;
    this.add.rectangle(0, groundY, GAME_WIDTH * 2, GAME_HEIGHT * 0.4, COLORS.ink)
      .setOrigin(0, 0).setAlpha(0.6);

    // Decorative frame hint (will be a papercut arch later)
    this.add.rectangle(cx, cy - 20, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.58)
      .setStrokeStyle(6, COLORS.paperD, 0.2);
  }

  // ================================================================
  // SPRITES — placeholder rectangles with name tags
  // ================================================================

  buildHeroSprites() {
    const groundY = GAME_HEIGHT * 0.68;
    const spacing = 220;
    const leftAnchor = GAME_WIDTH * 0.22;

    this.heroSprites = this.party.map((hero, i) => {
      const x = leftAnchor + i * spacing;
      const y = groundY - 90;

      // Body rectangle (placeholder for the sprite)
      const body = this.add.rectangle(x, y, 140, 180, hero.displayColor)
        .setStrokeStyle(4, COLORS.ink);

      // Name label
      const name = this.add.text(x, y - 120, hero.name.toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '20px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 3,
      }).setOrigin(0.5);

      // HP bar below
      const hpBarBg = this.add.rectangle(x, y + 110, 150, 14, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD);
      const hpBarFill = this.add.rectangle(x - 73, y + 110, 146, 10, 0x40c040)
        .setOrigin(0, 0.5);
      const hpText = this.add.text(x, y + 134, `${hero.hp}/${hero.maxHp}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);

      // Active turn indicator (hidden until their turn)
      const indicator = this.add.triangle(x, y - 160, 0, 0, 20, 0, 10, 20, COLORS.goldL)
        .setVisible(false);

      return { hero, body, name, hpBarBg, hpBarFill, hpText, indicator, x, y };
    });
  }

  buildEnemySprite() {
    const x = GAME_WIDTH * 0.78;
    const y = GAME_HEIGHT * 0.68 - 110;

    const body = this.add.rectangle(x, y, 260, 280, this.enemy.displayColor)
      .setStrokeStyle(6, COLORS.ink);

    const name = this.add.text(x, y - 170, this.enemy.name.toUpperCase(), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '26px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 4,
    }).setOrigin(0.5);

    const hpBarBg = this.add.rectangle(x, y + 165, 280, 20, COLORS.ink)
      .setStrokeStyle(3, COLORS.paperD);
    const hpBarFill = this.add.rectangle(x - 138, y + 165, 274, 14, 0xc04030)
      .setOrigin(0, 0.5);
    const hpText = this.add.text(x, y + 195, `${this.enemy.hp}/${this.enemy.maxHp}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    this.enemySprite = { body, name, hpBarBg, hpBarFill, hpText, x, y };
  }

  // ================================================================
  // UI — momentum bar, question, answer buttons, toast
  // ================================================================

  buildUI() {
    const uiTop = GAME_HEIGHT - 300;

    // UI panel background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 150, GAME_WIDTH, 300, COLORS.ink, 0.92)
      .setStrokeStyle(4, COLORS.paperD, 0.6);

    // Momentum bar
    this.add.text(GAME_WIDTH / 2 - 440, uiTop + 20, 'MOMENTUM', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);

    const barX = GAME_WIDTH / 2 - 280;
    const barY = uiTop + 20;
    const barW = 600;
    const barH = 24;

    this.add.rectangle(barX, barY, barW, barH, COLORS.ink)
      .setOrigin(0, 0.5).setStrokeStyle(2, COLORS.paperD);

    // Zone dividers at 33% and 66%
    this.add.rectangle(barX + barW * 0.33, barY, 2, barH, COLORS.paperD)
      .setOrigin(0, 0.5).setAlpha(0.5);
    this.add.rectangle(barX + barW * 0.66, barY, 2, barH, COLORS.paperD)
      .setOrigin(0, 0.5).setAlpha(0.5);

    this.momentumFill = this.add.rectangle(barX, barY, barW * this.momentum, barH - 4, 0x40a040)
      .setOrigin(0, 0.5);

    this.momentumLabel = this.add.text(barX + barW + 20, barY, 'ZONE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0, 0.5);

    // Current question
    this.questionText = this.add.text(GAME_WIDTH / 2, uiTop + 80, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '48px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Turn label
    this.turnLabel = this.add.text(GAME_WIDTH / 2, uiTop + 140, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5);

    // Four answer buttons
    this.answerButtons = [];
    const btnW = 220;
    const btnH = 80;
    const btnY = uiTop + 210;
    const btnSpacing = 30;
    const totalW = 4 * btnW + 3 * btnSpacing;
    const startX = GAME_WIDTH / 2 - totalW / 2;
    const btnColors = [COLORS.cobalt, COLORS.scarlet, COLORS.green, COLORS.plum];

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (btnW + btnSpacing) + btnW / 2;
      const bg = this.add.rectangle(x, btnY, btnW, btnH, btnColors[i])
        .setStrokeStyle(4, COLORS.ink)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(x, btnY, '?', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '36px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 4,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.locked) return;
        this.onAnswer(i);
      });

      this.answerButtons.push({ bg, label });
    }

    // Toast message (hidden by default)
    this.toast = this.add.text(GAME_WIDTH / 2, uiTop - 40, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '28px',
      color: COLORS_CSS.goldL,
      backgroundColor: '#1a0e04',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setAlpha(0);

    // End screen overlay (hidden by default)
    this.endOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setVisible(false);
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.88);
    const endTitle = this.add.text(0, -100, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '72px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 6,
    }).setOrigin(0.5);
    const endSub = this.add.text(0, 0, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '28px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);
    const endBtnBg = this.add.rectangle(0, 120, 380, 80, COLORS.scarlet)
      .setStrokeStyle(4, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    const endBtnLabel = this.add.text(0, 120, 'CONTINUE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '24px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    endBtnBg.on('pointerdown', () => {
      this.scene.start(SCENES.TITLE);
    });

    this.endOverlay.add([overlayBg, endTitle, endSub, endBtnBg, endBtnLabel]);
    this.endOverlay.titleText = endTitle;
    this.endOverlay.subText = endSub;
  }

  // ================================================================
  // TURN FLOW
  // ================================================================

  nextTurn() {
    if (this.phase === 'end') return;

    if (isPartyDefeated(this.party)) {
      this.showDefeat();
      return;
    }
    if (this.enemy.hp <= 0) {
      this.showVictory();
      return;
    }

    const result = advanceTurn(this.turnSeq, this.turnIdx, this.party);
    if (!result) {
      this.showDefeat();
      return;
    }
    this.turnIdx = result.index;
    this.currentTurn = result.turn;

    this.updateHeroIndicators();

    if (this.currentTurn.who === 'hero') {
      this.startHeroTurn();
    } else {
      this.startEnemyTurn();
    }
  }

  startHeroTurn() {
    const hero = this.party[this.currentTurn.heroIndex];
    this.turnLabel.setText(`${hero.name}'s turn — answer the question!`);
    this.phase = 'question';
    this.locked = false;

    // Generate a new question for the current floor's operator
    this.currentQuestion = generateQuestion({
      operator: this.operator,
      grade: this.grade,
    });

    this.questionText.setText(formatQuestion(this.currentQuestion));

    // Update answer button labels
    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].label.setText(String(this.currentQuestion.choices[i]));
      this.answerButtons[i].bg.setAlpha(1);
    }
  }

  startEnemyTurn() {
    this.turnLabel.setText(`${this.enemy.name} attacks!`);
    this.questionText.setText('');
    this.phase = 'enemy';
    this.locked = true;

    // Hide answer buttons during enemy turn
    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].bg.setAlpha(0.3);
      this.answerButtons[i].label.setText('');
    }

    this.time.delayedCall(700, () => {
      const target = pickRandomLivingHero(this.party);
      if (!target) {
        this.showDefeat();
        return;
      }
      const result = computeEnemyDamage(this.enemy, target, { momentum: this.momentum });
      applyDamageResult(target, result);
      this.flashHero(target, result);
      this.updateHeroHp(target);
      this.shakeCamera();

      this.time.delayedCall(600, () => this.nextTurn());
    });
  }

  // ================================================================
  // ANSWER HANDLING
  // ================================================================

  onAnswer(index) {
    if (this.phase !== 'question' || !this.currentQuestion) return;
    this.locked = true;

    const correct = index === this.currentQuestion.correctIndex;

    // Visual feedback on the chosen button
    const btn = this.answerButtons[index];
    if (correct) {
      btn.bg.setFillStyle(0x40c040);
    } else {
      btn.bg.setFillStyle(0xc04040);
      // Flash the correct one in green too
      this.answerButtons[this.currentQuestion.correctIndex].bg.setFillStyle(0x40c040);
    }

    if (correct) {
      this.streak++;
      this.momentum = advanceMomentum(this.momentum, true, this.streak);
      this.updateMomentumBar();
      this.showToast('CORRECT!', COLORS_CSS.greenL);

      const attacker = this.party[this.currentTurn.heroIndex];
      const result = computeHeroDamage(attacker, this.enemy, {
        momentum: this.momentum,
        streak: this.streak,
      });
      applyDamageResult(this.enemy, result);
      this.flashEnemy(result);
      this.updateEnemyHp();
    } else {
      this.streak = 0;
      this.momentum = advanceMomentum(this.momentum, false);
      this.updateMomentumBar();
      this.showToast('WRONG! Enemy counter!', COLORS_CSS.scarletL);

      const target = this.party[this.currentTurn.heroIndex];
      const result = computeEnemyDamage(this.enemy, target, { momentum: this.momentum });
      applyDamageResult(target, result);
      this.flashHero(target, result);
      this.updateHeroHp(target);
      this.shakeCamera();
    }

    this.time.delayedCall(900, () => this.nextTurn());
  }

  // ================================================================
  // VISUAL FEEDBACK
  // ================================================================

  flashEnemy(result) {
    const s = this.enemySprite;
    this.tweens.add({
      targets: s.body,
      alpha: 0.3,
      duration: 100,
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
      duration: 100,
      yoyo: true,
      repeat: 1,
    });
    this.floatDamageNumber(s.x, s.y - 80, result.modifiedDamage, '#ff6060');
  }

  floatDamageNumber(x, y, amount, color) {
    const t = this.add.text(x, y, `-${amount}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '32px',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: y - 80,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }

  shakeCamera() {
    this.cameras.main.shake(200, 0.008);
  }

  updateHeroHp(hero) {
    const idx = this.party.indexOf(hero);
    if (idx < 0) return;
    const s = this.heroSprites[idx];
    const pct = Math.max(0, hero.hp / hero.maxHp);
    s.hpBarFill.width = 146 * pct;
    s.hpText.setText(`${hero.hp}/${hero.maxHp}`);

    // Dead hero goes dim
    if (hero.hp <= 0) {
      s.body.setAlpha(0.2);
      s.name.setAlpha(0.3);
    }
  }

  updateEnemyHp() {
    const pct = Math.max(0, this.enemy.hp / this.enemy.maxHp);
    this.enemySprite.hpBarFill.width = 274 * pct;
    this.enemySprite.hpText.setText(`${this.enemy.hp}/${this.enemy.maxHp}`);
  }

  updateMomentumBar() {
    const barW = 600;
    this.momentumFill.width = barW * this.momentum;
    const zone = getZone(this.momentum);
    this.momentumLabel.setText(zone.label);
    // Color the bar by zone
    if (zone.label === 'COOL') this.momentumFill.fillColor = 0x4080c0;
    else if (zone.label === 'ZONE') this.momentumFill.fillColor = 0x40a040;
    else this.momentumFill.fillColor = 0xd06020;
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
  // END STATES
  // ================================================================

  showVictory() {
    this.phase = 'end';
    this.locked = true;
    this.endOverlay.titleText.setText('VICTORY!');
    this.endOverlay.subText.setText(`${this.enemy.name} defeated!`);
    this.endOverlay.setVisible(true);
  }

  showDefeat() {
    this.phase = 'end';
    this.locked = true;
    this.endOverlay.titleText.setText('DEFEATED');
    this.endOverlay.subText.setText('Your party has fallen.');
    this.endOverlay.setVisible(true);
  }
}
