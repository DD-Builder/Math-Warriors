import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { DialogueOverlay } from '../ui/DialogueOverlay.js';
import { DIALOGUE } from '../data/dialogue.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { getHeroById } from '../data/heroes.js';

const REALM_MESSAGES = [
  'The Garden blooms again',
  'The Tidepool flows true',
  'The Cloud Maze forms',
  'The Ember Caves cool',
  'The Frozen Peak thaws',
  'The Crystal Caverns align',
  'The Market Square is fair',
  'The Infinity Library opens',
  'The Mending Room heals',
];

export class EndingScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.ENDING });
  }

  create() {
    fadeInScene(this, 600);
    audio.playMusic('music/title');

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const save = loadSave(getActiveSlot(this));

    drawPapercutBackground(this, 9, GAME_WIDTH, GAME_HEIGHT, 9999);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.25);

    // Sparkle particles
    for (let i = 0; i < 30; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.random() * GAME_HEIGHT;
      const star = this.add.circle(sx, sy, 2 + Math.random() * 3, PAPER.gold, 0.6);
      this.tweens.add({
        targets: star,
        alpha: 0,
        y: sy - 100 - Math.random() * 200,
        duration: 2000 + Math.random() * 3000,
        delay: Math.random() * 2000,
        repeat: -1,
        onRepeat: () => {
          star.setPosition(Math.random() * GAME_WIDTH, GAME_HEIGHT + 20);
          star.setAlpha(0.6);
        },
      });
    }

    // Show epilogue dialogue first if it exists, then realm restoration sequence
    const hasEpilogue = DIALOGUE.game_ending && DIALOGUE.game_ending.length > 0;
    if (hasEpilogue) {
      const dialogue = new DialogueOverlay(this);
      dialogue.show(DIALOGUE.game_ending).then(() => {
        this.startRealmSequence(area, save);
      });
    } else {
      this.startRealmSequence(area, save);
    }
  }

  startRealmSequence(area, save) {
    // Cycle through 9 realm restoration messages (2s each with fade)
    const realmText = this.add.text(area.cx, area.cy, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '36px',
      color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    let msgIndex = 0;
    const showNextMessage = () => {
      if (msgIndex >= REALM_MESSAGES.length) {
        realmText.destroy();
        this.showFinalEnding(area, save);
        return;
      }
      realmText.setText(REALM_MESSAGES[msgIndex]);
      realmText.setAlpha(0);
      // Fade in
      this.tweens.add({
        targets: realmText,
        alpha: 1,
        duration: 400,
        ease: 'Sine.out',
        onComplete: () => {
          // Hold, then fade out
          this.tweens.add({
            targets: realmText,
            alpha: 0,
            duration: 400,
            delay: 1200,
            ease: 'Sine.in',
            onComplete: () => {
              msgIndex++;
              showNextMessage();
            },
          });
        },
      });
    };

    showNextMessage();
  }

  showFinalEnding(area, save) {
    const elements = [];

    // Show player's 3 hero sprites in a row
    const party = save.party || [];
    const heroSpacing = 120;
    const heroY = area.cy - 60;
    for (let i = 0; i < Math.min(3, party.length); i++) {
      const slot = party[i];
      if (!slot) continue;
      const heroDef = getHeroById(slot.id);
      if (!heroDef) continue;
      const hx = area.cx + (i - 1) * heroSpacing;
      const sprite = drawHeroSprite(this, hx, heroY, heroDef, { scale: 0.8 });
      sprite.setAlpha(0);
      elements.push(sprite);
    }

    // "THE END" in 60px gold text with 5px dark stroke
    const titleText = this.add.text(area.cx, heroY + 90, 'THE END', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '60px',
      color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    elements.push(titleText);

    // Stats: total battles, accuracy, gold earned
    const s = save.stats;
    const accuracy = s.totalCorrect + s.totalWrong > 0
      ? Math.round((s.totalCorrect / (s.totalCorrect + s.totalWrong)) * 100)
      : 0;
    const statsLines = [
      `Battles: ${s.totalBattles}    Accuracy: ${accuracy}%    Gold: ${s.totalGold || save.gold}`,
    ];
    const statsText = this.add.text(area.cx, heroY + 140, statsLines[0], {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '20px',
      color: PAPER_CSS.cream,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);
    elements.push(statsText);

    // "TITLE SCREEN" button
    const titleBtn = PaperButton(this, area.cx, heroY + 210, 'TITLE SCREEN', {
      w: 300, h: 70, color: PAPER.orange, fontSize: 26,
      textColor: PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.TITLE, undefined, 400);
      },
    });
    const btnElements = [titleBtn.bg, titleBtn.shadow, titleBtn.label, titleBtn.zone].filter(Boolean);
    btnElements.forEach(el => el.setAlpha(0));
    elements.push(...btnElements);

    // Fade in all elements
    elements.forEach(el => {
      if (el && el.setAlpha) {
        this.tweens.add({ targets: el, alpha: 1, duration: 600 });
      }
    });
  }
}
