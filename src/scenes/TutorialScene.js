import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { audio } from '../systems/audio.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, PaperPanel, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { spawnHero, KNIGHTS } from '../data/heroes.js';

/**
 * TutorialScene — a scripted first-battle that teaches the player
 * the core mechanic (answer math -> deal damage) before they pick
 * a grade or build a party.
 *
 * Flow:
 *   Step 1: "Welcome, warrior!" — show a simple 2+1=? problem
 *   Step 2: After correct answer — "Great hit! The answer becomes your damage!"
 *   Step 3: "Watch the momentum bar — streak correct answers to power up!"
 *   Step 4: After defeating dummy — "You're ready! Choose your grade and build your party!"
 *
 * Training Dummy: 5 HP, 0 ATK, 0 DEF — dies in 1-2 hits, never attacks.
 */
export class TutorialScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TUTORIAL });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.area = area;

    // State
    this.step = 0;          // current tutorial step (0-based)
    this.locked = false;     // prevent input during transitions
    this.dummyHp = 5;
    this.dummyMaxHp = 5;

    // Hero
    this.hero = spawnHero(KNIGHTS[1].id); // Crusader

    // Background
    this.cameras.main.setBackgroundColor(0x000000);
    const bgHeight = GAME_HEIGHT * 0.72;
    drawPapercutBackground(this, 1, GAME_WIDTH, bgHeight, 42);

    // Ground strip
    const uiTop = area.bottom - 220;
    const groundY = uiTop - 30;
    const groundGfx = this.add.graphics();
    groundGfx.fillStyle(0x3a6818, 0.6);
    groundGfx.fillRect(0, groundY, GAME_WIDTH, uiTop - groundY + 40);
    groundGfx.fillStyle(0x4a8828, 0.4);
    groundGfx.fillRect(0, groundY, GAME_WIDTH, 8);

    // Draw hero sprite — left side
    const heroX = GAME_WIDTH * 0.25;
    const heroY = groundY - 100;
    this.heroBody = drawHeroSprite(this, heroX, heroY, this.hero, { scale: 0.85 });
    this.add.text(heroX, heroY - 120, this.hero.name.toUpperCase(), {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '20px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Hero idle bob
    this.tweens.add({
      targets: this.heroBody,
      y: '-=6',
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Draw enemy (Training Dummy — use sproutling sprite)
    const enemyX = GAME_WIDTH * 0.72;
    const enemyY = groundY - 200;
    const dummyDef = {
      id: 'sproutling',
      name: 'Training Dummy',
      maxHp: this.dummyMaxHp,
      hp: this.dummyHp,
      atk: 0,
      def: 0,
      displayColor: 0x8a7a60,
    };
    this.enemyBody = drawMonsterSprite(this, enemyX, enemyY, dummyDef, { scale: 0.7 });
    this.enemyX = enemyX;
    this.enemyY = enemyY;

    this.add.text(enemyX, enemyY - 180, 'TRAINING DUMMY', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: COLORS_CSS.paper,
      stroke: COLORS_CSS.scarlet,
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Enemy HP bar
    const hpBarW = 180;
    const hpBarY = enemyY - 155;
    this.hpBarBg = this.add.rectangle(enemyX, hpBarY, hpBarW, 16, COLORS.ink)
      .setStrokeStyle(2, COLORS.paperD);
    this.hpBarFill = this.add.rectangle(
      enemyX - hpBarW / 2 + 2, hpBarY, hpBarW - 4, 12, 0xc04030
    ).setOrigin(0, 0.5);
    this.hpBarFullW = hpBarW - 4;
    this.hpText = this.add.text(enemyX, hpBarY + 14, `${this.dummyHp}/${this.dummyMaxHp}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '14px',
      color: '#fff8e0',
      stroke: '#1a0e04',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Enemy idle pulse
    this.tweens.add({
      targets: this.enemyBody,
      scaleX: (this.enemyBody.scaleX || 0.7) * 1.01,
      scaleY: (this.enemyBody.scaleY || 0.7) * 0.99,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Equation display (dark pill, similar to BattleScene)
    const eqY = area.bottom - 280;
    PaperPanel(this, area.cx, eqY, 300, 110, {
      color: 0x1a0e04, alpha: 0.85, radius: 18, shadowOff: 4, shadowAlpha: 0.3,
    });
    this.eqText = this.add.text(area.cx, eqY, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '48px',
      color: '#fff8e0',
      stroke: '#1a0e04',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // Answer buttons row
    const ansY = area.bottom - 50;
    const btnW = 200;
    const btnGap = 20;
    const btnColors = [0x3888d8, 0xe84840, 0x4aa848, 0x9050c8];
    this.choices = [3, 5, 2, 4]; // The 4 choices for 2+1; correct = 3 (index 0)
    this.correctIndex = 0;

    this.answerButtons = [];
    for (let i = 0; i < 4; i++) {
      const totalW = 4 * btnW + 3 * btnGap;
      const startX = area.cx - totalW / 2 + btnW / 2;
      const x = startX + i * (btnW + btnGap);
      const btn = PaperButton(this, x, ansY, String(this.choices[i]), {
        w: btnW, h: 90,
        color: btnColors[i],
        fontSize: 36,
        onClick: () => {
          if (this.locked) return;
          audio.play('ui/click');
          this.onAnswer(i);
        },
      });
      btn.label.setAlpha(0);
      btn.bg.setAlpha(0);
      btn.shadow.setAlpha(0);
      this.answerButtons.push(btn);
    }

    // Dialogue overlay — semi-transparent dark bar with text
    this.dialogueBg = this.add.rectangle(area.cx, area.cy - 40, GAME_WIDTH - 80, 140, 0x1a0e04, 0.9)
      .setStrokeStyle(3, 0xf0d060, 0.8);
    this.dialogueText = this.add.text(area.cx, area.cy - 40, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      color: '#fff8e0',
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 160 },
    }).setOrigin(0.5);
    this.dialogueBg.setAlpha(0);
    this.dialogueText.setAlpha(0);

    // Tap-to-continue prompt
    this.tapPrompt = this.add.text(area.cx, area.cy + 30, 'Tap to continue', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '18px',
      color: '#f0d060',
    }).setOrigin(0.5).setAlpha(0);

    fadeInScene(this);

    // Start step 1 after a brief pause
    this.time.delayedCall(600, () => this.showStep1());
  }

  // ================================================================
  // DIALOGUE HELPERS
  // ================================================================

  showDialogue(text, showTapPrompt = true) {
    this.dialogueBg.setAlpha(1);
    this.dialogueText.setText(text).setAlpha(1);
    if (showTapPrompt) {
      this.tapPrompt.setAlpha(1);
      this.tweens.add({
        targets: this.tapPrompt,
        alpha: 0.4,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    } else {
      this.tapPrompt.setAlpha(0);
    }
  }

  hideDialogue() {
    this.dialogueBg.setAlpha(0);
    this.dialogueText.setAlpha(0);
    this.tapPrompt.setAlpha(0);
    this.tweens.killTweensOf(this.tapPrompt);
  }

  showAnswerButtons() {
    for (const btn of this.answerButtons) {
      btn.label.setAlpha(1);
      btn.bg.setAlpha(1);
      btn.shadow.setAlpha(1);
    }
  }

  hideAnswerButtons() {
    for (const btn of this.answerButtons) {
      btn.label.setAlpha(0);
      btn.bg.setAlpha(0);
      btn.shadow.setAlpha(0);
    }
  }

  // ================================================================
  // TUTORIAL STEPS
  // ================================================================

  showStep1() {
    this.step = 1;
    this.showDialogue('Welcome, warrior! Tap the correct answer to attack!', false);

    // Show equation: 2 + 1 = ?
    this.eqText.setText('2 + 1 = ?').setAlpha(1);

    // Show answer buttons after brief delay
    this.time.delayedCall(800, () => {
      this.showAnswerButtons();
      this.locked = false;
    });
  }

  showStep2() {
    this.step = 2;
    this.locked = true;
    this.hideAnswerButtons();

    this.showDialogue('Great hit! The answer becomes your damage!');

    // Wait for tap to continue
    this.input.once('pointerdown', () => {
      this.showStep3();
    });
  }

  showStep3() {
    this.step = 3;
    this.locked = true;

    this.showDialogue('Watch the momentum bar — streak correct answers to power up!');

    // Wait for tap, then present the problem again if dummy still alive
    this.input.once('pointerdown', () => {
      this.hideDialogue();

      if (this.dummyHp > 0) {
        // Dummy still alive — present a second problem
        this.eqText.setText('3 + 2 = ?').setAlpha(1);
        this.choices = [5, 7, 4, 6];
        this.correctIndex = 0;
        for (let i = 0; i < 4; i++) {
          this.answerButtons[i].label.setText(String(this.choices[i]));
        }
        this.showAnswerButtons();
        this.locked = false;
      } else {
        this.showStep4();
      }
    });
  }

  showStep4() {
    this.step = 4;
    this.locked = true;
    this.hideAnswerButtons();
    this.eqText.setAlpha(0);

    this.showDialogue("You're ready! Choose your grade and build your party!");

    // Mark tutorial complete and transition
    const slot = getActiveSlot(this);
    const save = loadSave(slot);
    save.stats.tutorialComplete = true;
    writeSave(save, slot);

    this.input.once('pointerdown', () => {
      audio.play('ui/confirm');
      transitionTo(this, SCENES.GRADE_SELECT, undefined, 300);
    });
  }

  // ================================================================
  // ANSWER HANDLING
  // ================================================================

  onAnswer(index) {
    if (this.locked) return;
    this.locked = true;

    const isCorrect = index === this.correctIndex;

    if (isCorrect) {
      audio.play('battle/correct');
      const answer = this.choices[this.correctIndex];

      // Deal damage to dummy
      this.dummyHp = Math.max(0, this.dummyHp - answer);

      // Flash enemy
      this.tweens.add({
        targets: this.enemyBody,
        alpha: 0.2,
        duration: 50,
        yoyo: true,
        repeat: 2,
      });
      this.tweens.add({
        targets: this.enemyBody,
        x: this.enemyX + 8,
        duration: 40,
        yoyo: true,
        repeat: 3,
      });

      // Update HP bar
      const pct = Math.max(0, this.dummyHp / this.dummyMaxHp);
      this.tweens.add({
        targets: this.hpBarFill,
        width: this.hpBarFullW * pct,
        duration: 300,
        ease: 'Cubic.out',
      });
      this.hpText.setText(`${this.dummyHp}/${this.dummyMaxHp}`);

      // Damage number
      const dmgText = this.add.text(this.enemyX, this.enemyY - 100, `-${answer}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '36px',
        color: '#60ff60',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5).setScale(0.5);
      this.tweens.add({
        targets: dmgText,
        y: this.enemyY - 200,
        scale: 1.2,
        duration: 250,
        ease: 'Back.out',
      });
      this.tweens.add({
        targets: dmgText,
        alpha: 0,
        duration: 400,
        delay: 500,
        onComplete: () => dmgText.destroy(),
      });

      // Camera shake
      this.cameras.main.shake(200, 0.008);
      audio.play('battle/hit');

      // Check if dummy defeated
      if (this.dummyHp <= 0) {
        // Fade out dummy
        this.tweens.add({
          targets: this.enemyBody,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 500,
          ease: 'Back.in',
        });
        this.tweens.add({ targets: this.hpBarBg, alpha: 0, duration: 400 });
        this.tweens.add({ targets: this.hpBarFill, alpha: 0, duration: 400 });
        this.tweens.add({ targets: this.hpText, alpha: 0, duration: 400 });

        audio.play('battle/victory');

        this.time.delayedCall(800, () => this.showStep4());
      } else {
        // Dummy alive — continue tutorial flow
        this.time.delayedCall(500, () => {
          if (this.step === 1) {
            this.showStep2();
          } else {
            // After step 3's second problem
            this.showStep4();
          }
        });
      }
    } else {
      // Wrong answer
      audio.play('battle/wrong');
      this.showDialogue('Not quite! Try again — no penalty in training!', false);
      this.time.delayedCall(1200, () => {
        this.hideDialogue();
        this.locked = false;
      });
    }
  }
}
