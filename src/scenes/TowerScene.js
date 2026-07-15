import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { spawnEnemy } from '../data/enemies.js';
import {
  spireFightPlan, applySpireScaling, createSpireRun, spireHealAmount,
  spirePayout,
} from '../systems/spire.js';

/**
 * TowerScene — The Endless Spire.
 *
 * An escalating, persistent-HP battle tower unlocked after Floor 3. The
 * same party clones climb until they fall; every 5th fight is a boss.
 * Between floors the player banks gold and chooses to press on or retreat
 * (keeping all banked gold — a wipe forfeits half). Registry key:
 * 'spireState'. Mirrors BossRushScene's registry-run-state shape.
 */
export class TowerScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TOWER });
  }

  create() {
    fadeInScene(this, 400);
    audio.playMusic('music/title');

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);

    drawPapercutBackground(this, 5, GAME_WIDTH, GAME_HEIGHT, 4242);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.4);

    const state = this.registry.get('spireState');

    if (!state) {
      this.showStartScreen(area, this.save);
    } else if (state.lastOutcome === 'victory') {
      this.showInterlude(area, state);
    } else if (state.lastOutcome === 'defeat') {
      this.showDefeatResults(area, state);
    } else {
      // Fresh run (just created) — launch the first fight.
      this.launchFight(state);
    }
  }

  // ── Start screen ──────────────────────────────────────────────────
  showStartScreen(area, save) {
    this.add.text(area.cx, area.top + 90, 'THE ENDLESS SPIRE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '58px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 158, 'Climb as high as you can — one HP bar, no retreat mid-fight.', {
      ...TEXT.body(), fontSize: '20px', color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 3,
    }).setOrigin(0.5);

    PaperPanel(this, area.cx, area.cy + 10, 620, 300, { color: PAPER.inkTeal, alpha: 0.85, radius: 20 });

    const best = save.stats?.bestSpireFloor || 0;
    this.add.text(area.cx, area.cy - 100, best > 0 ? `Best Climb: Floor ${best}` : 'No climb yet — be the first!', {
      ...TEXT.heading(), fontSize: '26px', color: PAPER_CSS.gold,
    }).setOrigin(0.5);

    const partyNames = (save.party || []).filter(p => p && p.name).map(p => p.name).join(', ');
    if (partyNames) {
      this.add.text(area.cx, area.cy - 30, `Party: ${partyNames}`, {
        ...TEXT.body(), fontSize: '20px', color: PAPER_CSS.sand,
      }).setOrigin(0.5);
    }

    this.add.text(area.cx, area.cy + 40, 'Boss floors every 5th fight. Enemies grow stronger as you climb.', {
      ...TEXT.body(), fontSize: '17px', color: PAPER_CSS.cream,
    }).setOrigin(0.5);

    PaperButton(this, area.cx, area.cy + 120, 'START CLIMB', {
      w: 320, h: 70, color: PAPER.coralD, fontSize: 26, textColor: PAPER_CSS.cream,
      onClick: () => { audio.play('ui/confirm'); this.startClimb(save); },
    });

    // Boss Rush lives inside the Spire hub — unlocked after all 9 floors.
    const bottomY = area.bottom - 70;
    if (save.floors?.[8]?.complete) {
      PaperButton(this, area.cx - 130, bottomY, 'BOSS RUSH', {
        w: 220, h: 54, color: PAPER.orange, fontSize: 20, textColor: PAPER_CSS.cream,
        onClick: () => { audio.play('ui/click'); transitionTo(this, SCENES.BOSS_RUSH, undefined, 400); },
      });
      PaperButton(this, area.cx + 130, bottomY, 'BACK', {
        w: 220, h: 54, color: PAPER.inkTeal, fontSize: 20, textColor: PAPER_CSS.cream,
        onClick: () => { audio.play('ui/back'); transitionTo(this, SCENES.WORLD_MAP, undefined, 400); },
      });
    } else {
      PaperButton(this, area.cx, bottomY, 'BACK', {
        w: 220, h: 54, color: PAPER.inkTeal, fontSize: 20, textColor: PAPER_CSS.cream,
        onClick: () => { audio.play('ui/back'); transitionTo(this, SCENES.WORLD_MAP, undefined, 400); },
      });
    }
  }

  startClimb(save) {
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
      party.push(spawnHero(KNIGHTS[0].id));
      party.push(spawnHero(WIZARDS[4]?.id || WIZARDS[0].id));
      party.push(spawnHero(BUNNIES[0].id));
    }
    const run = createSpireRun(party, Date.now());
    this.registry.set('spireState', run);
    this.launchFight(run);
  }

  // ── Launch a spire fight ──────────────────────────────────────────
  launchFight(state) {
    const grade = this.save.grade ?? 3;
    const plan = spireFightPlan(state.floor);
    const enemy = spawnEnemy(plan.enemyId, { grade, isBoss: plan.isBoss });
    applySpireScaling(enemy, state.floor);

    // battleReturnScene is consumed by each battle — re-set before EVERY launch.
    this.registry.set('battleReturnScene', SCENES.TOWER);
    this.registry.remove('battleReturnData');

    transitionTo(this, SCENES.BATTLE, {
      party: state.party.map(h => ({ ...h })),
      floor: plan.isBoss ? enemy.floor : plan.themeFloor, // drives theme + music/boss-N
      grade,
      isBoss: plan.isBoss,
      enemy,
      spire: true,
    }, 300);
  }

  // ── Between-floor interlude (after a win) ─────────────────────────
  showInterlude(area, state) {
    // Heal living heroes once per cleared floor.
    if (!state._interludeHealed) {
      for (const h of state.party) {
        if (h && h.hp > 0) {
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + spireHealAmount(h));
          h._healFloat = h.hp - before;
        }
      }
      state._interludeHealed = true;
      this.registry.set('spireState', state);
    }

    this.add.text(area.cx, area.top + 80, `FLOOR ${state.floor}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '64px', color: PAPER_CSS.gold, stroke: PAPER_CSS.inkTeal, strokeThickness: 8,
    }).setOrigin(0.5);

    const nextIsBoss = state.floor % 5 === 0;
    this.add.text(area.cx, area.top + 146, nextIsBoss ? '⚠ A BOSS awaits on this floor!' : 'The climb continues…', {
      ...TEXT.heading(), fontSize: '22px', color: nextIsBoss ? '#e8a030' : PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 3,
    }).setOrigin(0.5);

    PaperPanel(this, area.cx, area.cy - 10, 620, 300, { color: PAPER.inkTeal, alpha: 0.85, radius: 20 });

    // Per-hero HP bars.
    const barW = 300, barH = 22;
    state.party.forEach((h, i) => {
      if (!h) return;
      const y = area.cy - 100 + i * 56;
      const dead = h.hp <= 0;
      this.add.text(area.cx - barW / 2, y - 20, `${h.name}${dead ? ' (down)' : ''}`, {
        ...TEXT.body(), fontSize: '16px', color: dead ? PAPER_CSS.sand : PAPER_CSS.cream,
      }).setOrigin(0, 0.5);
      this.add.rectangle(area.cx, y, barW, barH, 0x1a3033).setOrigin(0.5);
      const pct = h.maxHp > 0 ? Math.max(0, h.hp / h.maxHp) : 0;
      this.add.rectangle(area.cx - barW / 2, y, barW * pct, barH, dead ? 0x804040 : 0x4aa848).setOrigin(0, 0.5);
      this.add.text(area.cx + barW / 2, y, `${h.hp}/${h.maxHp}`, {
        ...TEXT.body(), fontSize: '14px', color: PAPER_CSS.cream,
      }).setOrigin(1, 0.5);
      if (h._healFloat > 0) {
        const f = this.add.text(area.cx + barW / 2 + 24, y, `+${h._healFloat}`, {
          ...TEXT.body(), fontSize: '18px', color: '#60ff60',
        }).setOrigin(0, 0.5);
        this.tweens.add({ targets: f, y: y - 24, alpha: 0, duration: 1200, delay: 300, onComplete: () => f.destroy() });
        h._healFloat = 0;
      }
    });

    this.add.text(area.cx, area.cy + 90, `Gold banked: ${state.goldBank}`, {
      ...TEXT.heading(), fontSize: '22px', color: PAPER_CSS.gold,
    }).setOrigin(0.5);

    PaperButton(this, area.cx - 150, area.bottom - 80, 'CONTINUE', {
      w: 260, h: 66, color: PAPER.coralD, fontSize: 24, textColor: PAPER_CSS.cream,
      onClick: () => { audio.play('ui/confirm'); this.launchFight(state); },
    });
    PaperButton(this, area.cx + 150, area.bottom - 80, 'RETREAT', {
      w: 260, h: 66, color: PAPER.inkTeal, fontSize: 24, textColor: PAPER_CSS.cream,
      onClick: () => { audio.play('ui/back'); this.retreat(state); },
    });
  }

  retreat(state) {
    const payout = spirePayout(state, true);
    this.save.gold = (this.save.gold || 0) + payout;
    this.save.stats.totalGold = (this.save.stats.totalGold || 0) + payout;
    const reached = state.floor - 1; // floors actually cleared
    this.save.stats.bestSpireFloor = Math.max(this.save.stats.bestSpireFloor || 0, reached);
    writeSave(this.save, this.slot);
    this.registry.remove('spireState');
    transitionTo(this, SCENES.WORLD_MAP, undefined, 400);
  }

  // ── Defeat results (after a wipe) ─────────────────────────────────
  showDefeatResults(area, state) {
    const reached = state.floor - 1; // last floor fully cleared
    const payout = spirePayout(state, false);
    this.save.gold = (this.save.gold || 0) + payout;
    this.save.stats.totalGold = (this.save.stats.totalGold || 0) + payout;
    const isRecord = reached > (this.save.stats.bestSpireFloor || 0);
    this.save.stats.bestSpireFloor = Math.max(this.save.stats.bestSpireFloor || 0, reached);
    writeSave(this.save, this.slot);
    this.registry.remove('spireState');

    this.add.text(area.cx, area.top + 100, 'THE CLIMB ENDS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '54px', color: '#d06a4d', stroke: PAPER_CSS.inkTeal, strokeThickness: 8,
    }).setOrigin(0.5);

    PaperPanel(this, area.cx, area.cy, 600, 300, { color: PAPER.inkTeal, alpha: 0.85, radius: 20 });

    const lines = [
      `Floors climbed: ${reached}`,
      `Correct: ${state.totalCorrect}   Wrong: ${state.totalWrong}`,
      `Gold saved (half): ${payout}`,
    ];
    lines.forEach((line, i) => {
      this.add.text(area.cx, area.cy - 70 + i * 44, line, {
        ...TEXT.body(), fontSize: '22px', color: PAPER_CSS.cream,
      }).setOrigin(0.5);
    });

    if (isRecord && reached > 0) {
      this.add.text(area.cx, area.cy + 90, `★ NEW BEST — Floor ${reached}! ★`, {
        ...TEXT.heading(), fontSize: '24px', color: PAPER_CSS.gold,
      }).setOrigin(0.5);
    }

    PaperButton(this, area.cx, area.bottom - 80, 'DONE', {
      w: 280, h: 70, color: PAPER.orange, fontSize: 26, textColor: PAPER_CSS.cream,
      onClick: () => { audio.play('ui/confirm'); transitionTo(this, SCENES.WORLD_MAP, undefined, 400); },
    });
  }
}
