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
import { audio } from '../systems/audio.js';
import { loadSave, writeSave, markFloorComplete } from '../systems/save.js';

/**
 * BattleScene — the turn-based math combat stage.
 *
 * Design principles this scene tries to honor (see docs/DESIGN-PRINCIPLES.md):
 *   1. Feedback is the invisible dialogue — every action has visible +
 *      audible + tactile response (screen shake, hit pause, particles)
 *   2. Clarity before complexity — always show HP, momentum, whose turn
 *   3. Snappy tempo — turn transitions under 500ms, no slow ceremonies
 *   4. Confidence first — wrong answers don't feel like punishment
 *   5. Failure is a restart, not a punishment — defeat returns you to
 *      the world map with a full heal, nothing lost
 *
 * v0.4 scope:
 *   - 3 heroes vs. 1 enemy
 *   - Turn order alternates hero/enemy/hero/enemy/...
 *   - Math question appears on the hero's turn
 *   - Correct answer → hero attacks with juice (particles, shake, hit-pause)
 *   - Wrong answer → enemy counter-attacks
 *   - Enemy turn attacks a random living hero
 *   - Victory updates save (gold, HP, floor progress)
 *   - Defeat returns to world map with full party heal
 *
 * Uses placeholder rectangle sprites — built so swapping in real art later
 * is a drop-in replacement.
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
      this.enemy = spawnEnemy(def.id);
    }

    this.floor = data?.floor ?? 1;
    this.grade = data?.grade ?? 3;
    this.operator = FLOOR_OPERATORS[this.floor] ?? '+';

    this.momentum = 0.5;
    this.streak = 0;
    this.turnSeq = buildTurnSequence(this.party.length);
    this.turnIdx = -1;
    this.phase = 'intro';
    this.locked = false;
    this.currentQuestion = null;
  }

  create() {
    this.buildBackground();
    this.buildHeroSprites();
    this.buildEnemySprite();
    this.buildUI();

    audio.playMusic('music/battle');

    // Fade in
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.time.delayedCall(400, () => this.nextTurn());
  }

  // ================================================================
  // BACKGROUND — placeholder diorama stage
  // ================================================================

  buildBackground() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(COLORS.ink);

    // Warm central glow — the "stage light" from Reference C in ART-STYLE.md
    const glow = this.add.graphics();
    glow.fillStyle(0x4a2810, 0.5);
    glow.fillCircle(cx, cy - 80, 400);
    glow.fillStyle(0x8a4820, 0.3);
    glow.fillCircle(cx, cy - 80, 250);
    glow.fillStyle(0xc87020, 0.2);
    glow.fillCircle(cx, cy - 80, 150);

    // Stage floor — pulled up from 0.68 so heroes/enemy and their HP
    // bars fit entirely above the UI panel at the bottom of the screen.
    const groundY = GAME_HEIGHT * 0.58;
    this.add.rectangle(0, groundY, GAME_WIDTH * 2, GAME_HEIGHT * 0.4, COLORS.ink)
      .setOrigin(0, 0).setAlpha(0.6);

    // Decorative frame hint
    this.add.rectangle(cx, cy - 20, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.58)
      .setStrokeStyle(6, COLORS.paperD, 0.2);

    // Floor label top-left
    this.add.text(40, 40, `FLOOR ${this.floor}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: COLORS_CSS.inkL,
    });
  }

  buildHeroSprites() {
    const groundY = GAME_HEIGHT * 0.58;
    const spacing = 220;
    const leftAnchor = GAME_WIDTH * 0.22;

    this.heroSprites = this.party.map((hero, i) => {
      const x = leftAnchor + i * spacing;
      const y = groundY - 90;

      const body = this.add.rectangle(x, y, 140, 180, hero.displayColor)
        .setStrokeStyle(4, COLORS.ink);

      const name = this.add.text(x, y - 120, hero.name.toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
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
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);

      const indicator = this.add.triangle(x, y - 160, 0, 0, 20, 0, 10, 20, COLORS.goldL)
        .setVisible(false);

      return { hero, body, name, hpBarBg, hpBarFill, hpText, indicator, x, y };
    });
  }

  buildEnemySprite() {
    const x = GAME_WIDTH * 0.78;
    const y = GAME_HEIGHT * 0.58 - 110;

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
  // UI — momentum, question, answers, toasts, end screen
  // ================================================================

  buildUI() {
    const uiTop = GAME_HEIGHT - 300;

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

    this.turnLabel = this.add.text(GAME_WIDTH / 2, uiTop + 140, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0.5);

    // Answer buttons
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
        audio.play('ui/click');
        this.onAnswer(i);
      });

      this.answerButtons.push({ bg, label, baseColor: btnColors[i] });
    }

    // Toast
    this.toast = this.add.text(GAME_WIDTH / 2, uiTop - 40, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '28px',
      color: COLORS_CSS.goldL,
      backgroundColor: '#1a0e04',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setAlpha(0);

    // End overlay (hidden by default)
    this.endOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setVisible(false);
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.88);
    const endTitle = this.add.text(0, -160, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '72px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 6,
    }).setOrigin(0.5);
    const endSub = this.add.text(0, -50, '', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '28px',
      color: COLORS_CSS.paper,
      align: 'center',
    }).setOrigin(0.5);
    const endRewards = this.add.text(0, 30, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: COLORS_CSS.goldL,
      align: 'center',
    }).setOrigin(0.5);
    const endBtnBg = this.add.rectangle(0, 140, 380, 80, COLORS.scarlet)
      .setStrokeStyle(4, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    const endBtnLabel = this.add.text(0, 140, 'CONTINUE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '24px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    endBtnBg.on('pointerdown', () => {
      audio.play('ui/confirm');
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.WORLD_MAP);
      });
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

    this.currentQuestion = generateQuestion({
      operator: this.operator,
      grade: this.grade,
    });

    this.questionText.setText(formatQuestion(this.currentQuestion));

    // Pop the question text in for emphasis
    this.questionText.setScale(0.8);
    this.tweens.add({
      targets: this.questionText,
      scale: 1,
      duration: 150,
      ease: 'Back.out',
    });

    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].label.setText(String(this.currentQuestion.choices[i]));
      this.answerButtons[i].bg.setFillStyle(this.answerButtons[i].baseColor);
      this.answerButtons[i].bg.setAlpha(1);
    }
  }

  startEnemyTurn() {
    this.turnLabel.setText(`${this.enemy.name} attacks!`);
    this.questionText.setText('');
    this.phase = 'enemy';
    this.locked = true;

    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].bg.setAlpha(0.3);
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
      this.hitPause(80);
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
      btn.bg.setFillStyle(0x40c040);
      audio.play('battle/correct');

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

      // Animate attacker forward, then back
      const heroSprite = this.heroSprites[this.currentTurn.heroIndex];
      this.tweens.add({
        targets: heroSprite.body,
        x: heroSprite.x + 60,
        duration: 120,
        yoyo: true,
        ease: 'Sine.inOut',
        onYoyo: () => {
          this.hitPause(80);
          this.flashEnemy(result);
          this.updateEnemyHp();
          audio.play('battle/hit-enemy');
          this.shakeCamera(0.008, 200);
          this.burstParticles(this.enemySprite.x, this.enemySprite.y, 0xe8a030);
        },
      });
    } else {
      btn.bg.setFillStyle(0xc04040);
      // Flash the correct one in green too
      this.answerButtons[this.currentQuestion.correctIndex].bg.setFillStyle(0x40c040);
      audio.play('battle/wrong');

      this.streak = 0;
      this.momentum = advanceMomentum(this.momentum, false);
      this.updateMomentumBar();
      this.showToast('Try again!', COLORS_CSS.scarletL);

      // Brief pause, then enemy counters
      this.time.delayedCall(300, () => {
        const target = this.party[this.currentTurn.heroIndex];
        const result = computeEnemyDamage(this.enemy, target, { momentum: this.momentum });
        applyDamageResult(target, result);
        this.hitPause(80);
        this.flashHero(target, result);
        this.updateHeroHp(target);
        this.shakeCamera(0.01, 250);
        audio.play('battle/hit-hero');
      });
    }

    // Snappy turn advance — was 900ms in v0.2, now 550ms per principle #3
    this.time.delayedCall(550, () => this.nextTurn());
  }

  // ================================================================
  // JUICE: hit-pause, particles, arcing damage numbers, camera shake
  // ================================================================

  /**
   * Freeze the game briefly on impact. This is the single biggest
   * contribution to "hit feel" in action games.
   */
  hitPause(ms) {
    this.tweens.pauseAll();
    this.time.delayedCall(ms, () => this.tweens.resumeAll());
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
      fontFamily: '"Press Start 2P", monospace',
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
    this.tweens.add({
      targets: this.enemySprite.hpBarFill,
      width: 274 * pct,
      duration: 300,
      ease: 'Cubic.out',
    });
    this.enemySprite.hpText.setText(`${this.enemy.hp}/${this.enemy.maxHp}`);
  }

  updateMomentumBar() {
    const barW = 600;
    this.tweens.add({
      targets: this.momentumFill,
      width: barW * this.momentum,
      duration: 300,
      ease: 'Cubic.out',
    });
    const zone = getZone(this.momentum);
    this.momentumLabel.setText(zone.label);
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
  // END STATES — save integration
  // ================================================================

  showVictory() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.locked = true;
    audio.stopMusic();
    audio.play('battle/victory');

    // Compute rewards
    const goldEarned = 10 + this.floor * 5;
    const save = loadSave();
    save.gold += goldEarned;
    save.stats.totalBattles++;
    save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + this.streak;

    // Update party HP in save (persist health)
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = this.party[i].hp;
      save.party[i].maxHp = this.party[i].maxHp;
    }

    // v0.4 STUB: mark the floor complete on any battle win. When the
    // maze scene arrives (v0.5), this shifts to "floor complete only
    // after defeating the boss at the end of the maze."
    markFloorComplete(save, this.floor);

    writeSave(save);

    // Camera zoom for the victory moment
    this.cameras.main.zoomTo(1.08, 300, 'Sine.inOut', true);
    this.time.delayedCall(400, () => {
      this.cameras.main.zoomTo(1.0, 300, 'Sine.inOut', true);
    });

    this.endOverlay.titleText.setText('VICTORY!');
    this.endOverlay.subText.setText(`${this.enemy.name} defeated!`);
    this.endOverlay.rewardsText.setText(`+${goldEarned} GOLD`);
    this.endOverlay.setVisible(true);
    this.endOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.endOverlay,
      alpha: 1,
      duration: 400,
    });
  }

  showDefeat() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.locked = true;
    audio.stopMusic();
    audio.play('battle/defeat');

    // Full party heal — failure is a restart, not a punishment.
    // See DESIGN-PRINCIPLES.md principle 8.
    const save = loadSave();
    save.stats.totalBattles++;
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
    this.endOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.endOverlay,
      alpha: 1,
      duration: 400,
    });
  }
}
