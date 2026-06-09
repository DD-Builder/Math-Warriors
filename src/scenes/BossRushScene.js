import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { FLOOR_OPERATORS } from '../data/enemies.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';

/**
 * BossRushScene — fight all 9 bosses back-to-back.
 *
 * Unlocked after beating all 9 floors. Tracks total time, accuracy,
 * and bosses defeated. After all 9 are defeated (or if the player
 * loses), shows a results overlay with a star rating.
 */

const BOSS_ORDER = [
  { id: 'briarking', floor: 1, name: 'Briar King' },
  { id: 'pressure', floor: 2, name: 'Pressure' },
  { id: 'skywhale', floor: 3, name: 'Sky Whale' },
  { id: 'pyroclast', floor: 4, name: 'Pyroclast' },
  { id: 'absolutezero', floor: 5, name: 'Absolute Zero' },
  { id: 'theprism', floor: 6, name: 'The Prism' },
  { id: 'counterfeiter', floor: 7, name: 'Counterfeiter' },
  { id: 'theparadox', floor: 8, name: 'The Paradox' },
  { id: 'theorem', floor: 9, name: 'Theorem' },
];

export class BossRushScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BOSS_RUSH });
  }

  create(data) {
    fadeInScene(this, 400);
    audio.playMusic('music/title');

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const slot = getActiveSlot(this);
    const save = loadSave(slot);

    drawPapercutBackground(this, 5, GAME_WIDTH, GAME_HEIGHT, 9999);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.4);

    // Check if we are returning from a completed rush
    const rushState = this.registry.get('bossRushState');

    if (rushState && rushState.complete) {
      this.showResults(area, rushState, save, slot);
      this.registry.remove('bossRushState');
      return;
    }

    if (rushState && rushState.defeated) {
      this.showDefeatResults(area, rushState);
      this.registry.remove('bossRushState');
      return;
    }

    // If rush is in progress (not complete, not defeated), show inter-boss overlay then launch
    if (rushState && rushState.currentBoss < 9) {
      if (rushState.currentBoss > 0 && !rushState._overlayShown) {
        rushState._overlayShown = true;
        this.showInterBossOverlay(area, rushState, () => {
          rushState._overlayShown = false;
          this.launchBossFight(rushState);
        });
      } else {
        this.launchBossFight(rushState);
      }
      return;
    }

    // Show start screen
    this.showStartScreen(area, save);
  }

  showStartScreen(area, save) {
    // Title
    this.add.text(area.cx, area.top + 100, 'BOSS RUSH', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '64px',
      color: '#f0d040',
      stroke: '#3a1808',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 170, 'Fight all 9 bosses back-to-back!', {
      ...TEXT.heading(),
      fontSize: '24px',
      color: '#f0e4cc',
      stroke: '#1a0e04',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Boss list panel
    PaperPanel(this, area.cx, area.cy + 20, 620, 380, {
      color: 0x1a0e04, alpha: 0.85, radius: 20,
    });

    this.add.text(area.cx, area.cy - 150, 'THE GAUNTLET', {
      ...TEXT.heading(),
      fontSize: '22px',
      color: '#f0d040',
    }).setOrigin(0.5);

    // List bosses in two columns
    const colW = 280;
    const startY = area.cy - 110;
    BOSS_ORDER.forEach((boss, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = area.cx + (col === 0 ? -colW / 2 : colW / 2);
      const y = startY + row * 44;

      this.add.text(x, y, `${i + 1}. ${boss.name}`, {
        ...TEXT.body(),
        fontSize: '18px',
        color: '#f0e4cc',
      }).setOrigin(0.5);
    });

    // Best time display (from save if available)
    const bestTime = save.stats?.bestBossRushTime;
    if (bestTime) {
      const bMin = Math.floor(bestTime / 60000);
      const bSec = Math.floor((bestTime % 60000) / 1000);
      this.add.text(area.cx, area.cy + 160, `Best Time: ${bMin}m ${bSec}s`, {
        ...TEXT.body(), fontSize: '18px', color: '#f0d040',
      }).setOrigin(0.5);
    }

    // Current party display
    const partyNames = (save.party || [])
      .filter(p => p && p.name)
      .map(p => p.name)
      .join(', ');

    if (partyNames) {
      this.add.text(area.cx, area.cy + 200, `Party: ${partyNames}`, {
        ...TEXT.body(),
        fontSize: '18px',
        color: '#c0b090',
      }).setOrigin(0.5);
    }

    // START button
    PaperButton(this, area.cx, area.bottom - 80, 'START RUSH', {
      w: 320, h: 74, color: 0xc83030, fontSize: 28,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/confirm');
        this.startRush(save);
      },
    });

    // Back button
    PaperButton(this, area.cx, area.bottom - 160, 'BACK', {
      w: 200, h: 54, color: 0x4a3420, fontSize: 20,
      textColor: '#f0e4cc',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.ENDING, undefined, 400);
      },
    });
  }

  startRush(save) {
    // Build party from save data
    const party = [];
    for (let i = 0; i < 3; i++) {
      const p = save.party?.[i];
      if (p && p.id) {
        const hero = spawnHero(p.id);
        hero.hp = hero.maxHp;
        if (p.level) hero.level = p.level;
        party.push(hero);
      }
    }

    if (party.length === 0) {
      // Fallback: use default party
      party.push(spawnHero(KNIGHTS[0].id));
      party.push(spawnHero(WIZARDS[4]?.id || WIZARDS[0].id));
      party.push(spawnHero(BUNNIES[0].id));
    }

    // Initialize rush state in registry
    const rushState = {
      currentBoss: 0,
      startTime: Date.now(),
      totalCorrect: 0,
      totalWrong: 0,
      bossesDefeated: 0,
      party,
      complete: false,
      defeated: false,
    };
    this.registry.set('bossRushState', rushState);

    // Start first boss fight
    this.launchBossFight(rushState);
  }

  launchBossFight(rushState) {
    const bossIdx = rushState.currentBoss;
    const boss = BOSS_ORDER[bossIdx];
    const grade = 3; // Default grade for boss rush

    // Set return scene for battle
    this.registry.set('battleReturnScene', SCENES.BOSS_RUSH);
    this.registry.remove('battleReturnData');

    transitionTo(this, SCENES.BATTLE, {
      party: rushState.party.map(h => ({ ...h })),
      floor: boss.floor,
      grade,
      isBoss: true,
      enemyId: boss.id,
      bossRush: true,
    }, 300);
  }

  showInterBossOverlay(area, rushState, onComplete) {
    const bossIdx = rushState.currentBoss;
    const boss = BOSS_ORDER[bossIdx];
    const elapsed = Date.now() - rushState.startTime;
    const min = Math.floor(elapsed / 60000);
    const sec = Math.floor((elapsed % 60000) / 1000);
    const timeStr = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');

    // Timer at top
    this.add.text(area.cx, area.top + 40, timeStr, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '32px', color: '#f0e4cc',
      stroke: '#1a0e04', strokeThickness: 4,
    }).setOrigin(0.5);

    // Boss counter
    this.add.text(area.cx, area.top + 80, `Boss ${bossIdx + 1}/9`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px', color: '#c0b090',
      stroke: '#1a0e04', strokeThickness: 3,
    }).setOrigin(0.5);

    // "NEXT: [boss name]" overlay
    const nextText = this.add.text(area.cx, area.cy, `NEXT: ${boss.name}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '48px', color: '#f0d040',
      stroke: '#3a1808', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0.7);

    this.tweens.add({
      targets: nextText, alpha: 1, scale: 1,
      duration: 300, ease: 'Back.out',
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: nextText, alpha: 0,
            duration: 200, ease: 'Cubic.in',
            onComplete: () => { nextText.destroy(); onComplete(); },
          });
        });
      },
    });
  }

  showResults(area, rushState, save, slot) {
    const elapsed = rushState.endTime - rushState.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const totalQ = rushState.totalCorrect + rushState.totalWrong;
    const accuracy = totalQ > 0 ? Math.round((rushState.totalCorrect / totalQ) * 100) : 100;

    // Star rating based on accuracy and time
    let stars = 1;
    if (accuracy >= 90 && minutes < 15) stars = 3;
    else if (accuracy >= 75 && minutes < 25) stars = 2;

    // Title
    this.add.text(area.cx, area.top + 100, 'BOSS RUSH COMPLETE!', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '52px',
      color: '#f0d040',
      stroke: '#3a1808',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Results panel
    PaperPanel(this, area.cx, area.cy, 600, 320, {
      color: 0x1a0e04, alpha: 0.85, radius: 20,
    });

    // Star display
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.add.text(area.cx, area.cy - 120, starStr, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '48px',
      color: '#f0d040',
    }).setOrigin(0.5);

    // Stats
    const lines = [
      `Bosses Defeated: ${rushState.bossesDefeated} / 9`,
      `Time: ${minutes}m ${seconds}s`,
      `Accuracy: ${accuracy}%`,
      `Correct: ${rushState.totalCorrect}  Wrong: ${rushState.totalWrong}`,
    ];
    lines.forEach((line, i) => {
      this.add.text(area.cx, area.cy - 50 + i * 40, line, {
        ...TEXT.body(),
        fontSize: '22px',
        color: '#f0e4cc',
      }).setOrigin(0.5);
    });

    // Bonus gold reward
    const bonusGold = stars * 50;
    save.gold = (save.gold || 0) + bonusGold;
    save.stats.totalGold = (save.stats.totalGold || 0) + bonusGold;
    writeSave(save, slot);

    this.add.text(area.cx, area.cy + 120, `+${bonusGold} GOLD bonus!`, {
      ...TEXT.heading(),
      fontSize: '24px',
      color: '#f0d040',
    }).setOrigin(0.5);

    // Done button
    PaperButton(this, area.cx, area.bottom - 80, 'DONE', {
      w: 280, h: 70, color: 0xd07818, fontSize: 26,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.ENDING, undefined, 400);
      },
    });
  }

  showDefeatResults(area, rushState) {
    const elapsed = (rushState.endTime || Date.now()) - rushState.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const totalQ = rushState.totalCorrect + rushState.totalWrong;
    const accuracy = totalQ > 0 ? Math.round((rushState.totalCorrect / totalQ) * 100) : 0;

    this.add.text(area.cx, area.top + 100, 'BOSS RUSH OVER', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '52px',
      color: '#c83030',
      stroke: '#3a1808',
      strokeThickness: 8,
    }).setOrigin(0.5);

    PaperPanel(this, area.cx, area.cy, 600, 280, {
      color: 0x1a0e04, alpha: 0.85, radius: 20,
    });

    const lines = [
      `Bosses Defeated: ${rushState.bossesDefeated} / 9`,
      `Time: ${minutes}m ${seconds}s`,
      `Accuracy: ${accuracy}%`,
      `Keep practicing and try again!`,
    ];
    lines.forEach((line, i) => {
      this.add.text(area.cx, area.cy - 60 + i * 44, line, {
        ...TEXT.body(),
        fontSize: '22px',
        color: '#f0e4cc',
      }).setOrigin(0.5);
    });

    PaperButton(this, area.cx, area.bottom - 80, 'BACK', {
      w: 280, h: 70, color: 0xd07818, fontSize: 26,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.ENDING, undefined, 400);
      },
    });
  }
}
