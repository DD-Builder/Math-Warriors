import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT, mazeStateKey } from '../config.js';
import { generateQuestion, generateRatedQuestion, recordAnswer } from '../systems/math.js';
import { confettiBurst, screenEdgeGlow, streakBanner, heroVictoryBounce, goldCoinScatter, starRating } from '../ui/celebrations.js';
import { updateQuestProgress } from '../systems/dailyQuests.js';
import { recordSkillAnswer } from '../systems/mastery.js';
import {
  getZone,
  advanceMomentum,
  computeEnemyDamage,
  computeCommandDamage,
  applyGuardReduction,
  applyDamageResult,
  buildTurnSequence,
  advanceTurn,
  isPartyDefeated,
  pickRandomLivingHero,
} from '../systems/combat.js';
import { COMMANDS, getAvailableCommands, getClassCommands, getCommandConfig } from '../systems/commandMenu.js';
import { rateQuestion, getDifficultyMultiplier } from '../systems/difficultyRating.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES, getAvailableSupers } from '../data/heroes.js';
import { spawnEnemy, FLOOR_OPERATORS, getEnemiesForFloor, getEnemyById } from '../data/enemies.js';
import { audio } from '../systems/audio.js';
import { loadSave, writeSave, markFloorComplete, unlockHeroesForFloor, consumePendingRescues, getActiveSlot } from '../systems/save.js';
import { getRescueDialogue } from '../data/dialogue.js';
import { markDailyChallengeComplete, getDailyChallenge } from '../systems/dailyChallenge.js';
import { invokeAbility } from '../systems/abilities.js';
import { getAbilitiesForClass } from '../systems/heroAbilities.js';
import { getEquipmentById } from '../systems/equipment.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { createParallaxBackground, shiftParallaxLayers, startAtmosphericParticles, destroyParallaxBackground } from '../systems/parallaxBg.js';
import { createEnvironmentState, updateEnvironment, destroyEnvironmentState } from '../systems/envResponsive.js';
import { PaperPanel, PaperButton, PaperBar, paperRect, paintPaperRect, updatePaperBar, TEXT, safeArea } from '../ui/paperUI.js';
import { createPanelDecorations, showPanelFx, hidePanelFx } from '../ui/mathPanelFx.js';
import { playFightAnimation, playMagicAnimation, playFizzleAnimation } from '../systems/attackAnimations.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { drawMonsterSprite } from '../ui/monsterSprites.js';
import { applyFloorOverlay } from '../systems/renderingFilters.js';
import { makeRng } from '../systems/rng.js';
import { computeLevel, levelBonuses, getPersonality } from '../data/heroes.js';
import { shouldShowTutorial, markTutorialShown, getTutorialText } from '../systems/tutorial.js';
import { checkAchievements } from '../systems/achievements.js';
import { DIALOGUE } from '../data/dialogue.js';
import { getHint } from '../systems/hints.js';
import { recordBattle, getBondStatBonuses, getAvailableCombos } from '../systems/bonds.js';
import { getEvolutionStatBoosts } from '../systems/evolution.js';
import {
  createSignatureState,
  onHeroDamageDealt,
  onHeroDamageReceived,
  onTurnStart,
  onEnemyTurnStart,
  checkLastStand,
  applyBurnOnAttack,
  getSplashDamage,
  getEffectiveAtk,
  getEffectiveDef,
  checkPaladinGuard,
  consumePaladinGuard,
} from '../systems/signatureEffects.js';

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
    this._answerProcessing = false;
    this._counterAttackDefeated = false;
    this._activeHintDismiss = null;

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
    this.grade = data?.grade ?? this.registry.get('grade') ?? 3;
    this.operator = FLOOR_OPERATORS[this.floor] ?? '+';
    this.isBoss = !!data?.isBoss;

    // --- Multi-monster encounter setup ---
    const FLOOR_BOSS = {
      1: 'briarking', 2: 'pressure', 3: 'skywhale', 4: 'pyroclast',
      5: 'absolutezero', 6: 'theprism', 7: 'counterfeiter',
      8: 'theparadox', 9: 'theorem',
    };
    const bossIds = Object.values(FLOOR_BOSS);
    const floorPool = getEnemiesForFloor(this.floor).filter(e => !bossIds.includes(e.id));
    const safePick = () => floorPool.length > 0 ? floorPool[Math.floor(Math.random() * floorPool.length)] : getEnemiesForFloor(1)[0];

    if (data?.enemy) {
      this.enemies = [{ ...data.enemy }];
    } else if (this.isBoss) {
      const bossId = data?.enemyId || FLOOR_BOSS[this.floor] || 'briarking';
      const bossDef = getEnemyById(bossId) || safePick();
      this.enemies = [spawnEnemy(bossDef.id, { grade: this.grade, isBoss: true })];
    } else {
      const roll = Math.random();
      const count = roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3;
      const hpScale = count === 1 ? 1.0 : count === 2 ? 0.75 : 0.5;
      this.enemies = [];
      for (let i = 0; i < count; i++) {
        const def = safePick();
        const e = spawnEnemy(def.id, { grade: this.grade, isBoss: false });
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
    this.heroStreaks = new Array(this.party.length).fill(0);
    this.superReady = new Array(this.party.length).fill(false);
    this.potionUsedThisBattle = false;
    this.comboUsedThisBattle = false;
    this.comboSkipHeroIndex = -1; // hero index whose turn to skip after combo
    this.turnSeq = buildTurnSequence(this.party.length);
    this.turnIdx = -1;
    this.phase = 'intro';
    this.locked = false;
    this.currentQuestion = null;

    // Battle background variant (0-2) for visual variety on same floor
    this.battleVariant = this.registry.get('battleVariant') ?? 0;

    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
    // Accessibility: skip screen flashes/shakes/confetti when enabled
    this.reducedMotion = !!this.save.settings?.reducedMotion;

    // Apply equipment bonuses from save to each hero
    for (let i = 0; i < this.party.length && i < 3; i++) {
      const heroEquip = this.save.equipment?.[`hero${i}`];
      if (heroEquip) {
        if (heroEquip.weapon) {
          const wpn = getEquipmentById(heroEquip.weapon);
          if (wpn != null && typeof wpn.atk === 'number') this.party[i].atk += wpn.atk;
        }
        if (heroEquip.armor) {
          const arm = getEquipmentById(heroEquip.armor);
          if (arm != null && typeof arm.def === 'number') this.party[i].def += arm.def;
        }
        if (heroEquip.accessory) {
          const acc = getEquipmentById(heroEquip.accessory);
          if (acc && acc.hp) {
            this.party[i].maxHp += acc.hp;
            this.party[i].hp += acc.hp;
          }
        }
      }
    }

    // --- Apply evolution + bond stat boosts ---
    const partyHeroIds = this.party.map(h => h.id);
    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i];
      // Evolution stat boosts
      const evoBoosts = getEvolutionStatBoosts(this.save, hero.id);
      hero.atk += evoBoosts.atk || 0;
      hero.def += evoBoosts.def || 0;
      hero.maxHp += evoBoosts.maxHp || 0;
      hero.hp += evoBoosts.maxHp || 0;
      // Bond stat bonuses
      const bondBonus = getBondStatBonuses(this.save, hero.id, partyHeroIds);
      hero.atk += bondBonus.atk || 0;
      hero.def += bondBonus.def || 0;
      hero.maxHp += bondBonus.hp || 0;
      hero.hp += bondBonus.hp || 0;
    }

    // --- Signature effects state ---
    this.signatureState = createSignatureState(this.party);

    // Hero ability cooldowns and state (Phase 3.1)
    this.abilityCooldowns = [{ cd: 0 }, { cd: 0 }, { cd: 0 }];
    this.shieldBashActive = false;
    this.rallyTurns = 0;
    this.manaSurgeActive = false;
    this.dodgeActive = false;
    this.furyCharges = 0;

    // Per-battle stat accumulators so we report true correct/wrong
    // counts rather than the end-of-battle streak.
    this.battleCorrect = 0;
    this.battleWrong = 0;

    // Track whether boss story dialogue has been shown
    this.bossHalfHpShown = false;
    this.bossQuarterHpShown = false;
    // Track whether any hero took damage this battle (for perfectBattle achievement)
    this.battleDamageTaken = false;

    // Boss Rush mode
    this.bossRush = !!data?.bossRush;

    // Command menu state (Phase 2: Streamlined Commander)
    this.selectedCommand = null;        // 'fight', 'magic', or 'guard'
    this.guardActive = new Array(this.party.length).fill(false);
    this.commandButtons = [];           // Phaser objects for command menu
    this.availableCommands = getAvailableCommands(this.grade);
  }

  create() {
    this._shuttingDown = false;
    this.events.on('shutdown', () => {
      this._shuttingDown = true;
      this.tweens.killAll();
      this.time.removeAllEvents();
      if (this.parallaxState) destroyParallaxBackground(this.parallaxState);
      if (this.envState) destroyEnvironmentState(this.envState);
    });

    this.buildBackground();
    this.buildHeroSprites();
    this.buildEnemySprite();
    this.buildUI();
    this.buildCommandMenu();

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

    // --- Battle cry: boss encounter ---
    if (this.isBoss && this.party[0]) {
      this.time.delayedCall(200, () => this.showBattleCry(this.party[0], 'bossEncounter'));
    }

    this.time.delayedCall(400, () => this.nextTurn());
  }

  // ================================================================
  // BACKGROUND — placeholder diorama stage
  // ================================================================

  buildBackground() {
    this.cameras.main.setBackgroundColor(0x000000);
    // Background fills FULL screen height — no black void
    const bgHeight = GAME_HEIGHT;

    // Parallax layered diorama background
    this.parallaxState = createParallaxBackground(
      this, this.floor, this.battleVariant, GAME_WIDTH, bgHeight,
    );
    startAtmosphericParticles(this, this.parallaxState);

    // Per-floor visual overlay (paper texture, vignette, etc.)
    this.floorOverlay = applyFloorOverlay(this, this.floor, GAME_WIDTH, GAME_HEIGHT);

    // Diorama frame — torn paper edges (battle scene only)
    // diorama frame removed — was distracting

    // Environmental responsiveness — subtle mood shifts based on performance
    this.envState = createEnvironmentState(this, this.parallaxState);

    // Hook into update loop for parallax on camera shake
    this.events.on('update', () => {
      const cam = this.cameras.main;
      if (cam._shakeDuration > 0) {
        shiftParallaxLayers(this.parallaxState, cam._shakeOffsetX || 0, cam._shakeOffsetY || 0);
      } else {
        shiftParallaxLayers(this.parallaxState, 0, 0);
      }
    });

    // Legacy: still draw themed details on top for extra richness
    this.drawBattleThemeDetails(bgHeight);

    const sceneName = this.registry.get('battleSceneName') || '';
    const questLabel = sceneName ? `QUEST ${this.floor} — ${sceneName}` : `QUEST ${this.floor}`;
    this.add.text(30, 20, questLabel, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: COLORS_CSS.paper,
      stroke: '#000000',
      strokeThickness: 4,
    }).setDepth(20);
  }

  drawBattleThemeDetails(bgH) {
    const g = this.add.graphics();
    g.setDepth(2);
    const rng = makeRng(this.floor * 5555 + (this.battleVariant || 0) * 1111);
    const gndY = bgH * 0.62 + 10;
    const v = this.battleVariant || 0;

    const drawTree = (x, y, h, trunkC, canopyC) => {
      const tw = h * 0.12;
      g.fillStyle(trunkC, 0.85);
      g.fillRect(x - tw, y - h * 0.4, tw * 2, h * 0.45);
      g.fillStyle(canopyC, 0.80);
      const cr = h * 0.32;
      g.fillCircle(x, y - h * 0.58, cr);
      g.fillCircle(x - cr * 0.55, y - h * 0.44, cr * 0.8);
      g.fillCircle(x + cr * 0.55, y - h * 0.44, cr * 0.8);
      g.fillCircle(x, y - h * 0.72, cr * 0.65);
      g.fillStyle(0x000000, 0.06);
      g.fillEllipse(x, y + 3, h * 0.5, 6);
    };

    const drawBush = (x, y, w, c) => {
      g.fillStyle(c, 0.72);
      g.fillEllipse(x, y - w * 0.2, w, w * 0.5);
      g.fillStyle(c, 0.50);
      g.fillEllipse(x - w * 0.2, y - w * 0.32, w * 0.6, w * 0.4);
    };

    const drawRock = (x, y, s) => {
      g.fillStyle(0x807870, 0.6);
      g.fillEllipse(x, y, s, s * 0.55);
      g.fillStyle(0xb0a898, 0.18);
      g.fillEllipse(x - s * 0.15, y - s * 0.1, s * 0.5, s * 0.3);
    };

    const drawFlowers = (x, y, count, spread, colors) => {
      for (let i = 0; i < count; i++) {
        const fx = x + (rng() - 0.5) * spread;
        const fy = y + (rng() - 0.5) * spread * 0.25;
        g.fillStyle(0x408028, 0.45);
        g.fillRect(fx - 0.5, fy, 1, 10 + rng() * 6);
        const c = colors[Math.floor(rng() * colors.length)];
        const pr = 4 + rng() * 3;
        g.fillStyle(c, 0.75 + rng() * 0.2);
        g.fillCircle(fx, fy - 2, pr);
        g.fillStyle(0xf0e060, 0.65);
        g.fillCircle(fx, fy - 2, pr * 0.35);
      }
    };

    const drawMushroom = (x, y, h) => {
      g.fillStyle(0xf0e8d0, 0.8);
      g.fillRect(x - 3, y - h * 0.4, 6, h * 0.45);
      g.fillStyle(0xc04818, 0.82);
      g.fillEllipse(x, y - h * 0.55, h * 0.45, h * 0.28);
      g.fillStyle(0xf0e8d0, 0.5);
      g.fillCircle(x - h * 0.12, y - h * 0.6, 2.5);
      g.fillCircle(x + h * 0.1, y - h * 0.5, 2);
    };

    if (this.floor === 1) {
      if (v === 0) {
        for (let i = 0; i < 4; i++) drawTree(100 + rng() * (GAME_WIDTH - 200), gndY, 75 + rng() * 30, 0x6a4818, 0x48a038);
        drawFlowers(GAME_WIDTH * 0.25, gndY - 10, 10, 120, [0xf06080, 0xf0c040, 0xf080c0, 0xff8080]);
        drawFlowers(GAME_WIDTH * 0.7, gndY - 8, 8, 100, [0xa0d8f0, 0xf0c040, 0xf06888]);
        for (let i = 0; i < 5; i++) drawMushroom(60 + rng() * (GAME_WIDTH - 120), gndY, 28 + rng() * 14);
        for (let i = 0; i < 5; i++) drawBush(80 + rng() * (GAME_WIDTH - 160), gndY - 5, 35 + rng() * 20, 0x48a038);
        for (let i = 0; i < 4; i++) drawRock(rng() * GAME_WIDTH, gndY + rng() * 5, 14 + rng() * 12);
      } else if (v === 1) {
        for (let i = 0; i < 7; i++) drawTree(60 + rng() * (GAME_WIDTH - 120), gndY, 85 + rng() * 40, 0x5a3810, 0x388828);
        for (let i = 0; i < 6; i++) {
          const fx = 40 + rng() * (GAME_WIDTH - 80); const fh = 30 + rng() * 20;
          g.fillStyle(0x408030, 0.55);
          g.beginPath(); g.moveTo(fx - fh * 0.3, gndY); g.lineTo(fx, gndY - fh); g.lineTo(fx + fh * 0.3, gndY); g.closePath(); g.fillPath();
        }
        for (let i = 0; i < 3; i++) {
          const lx = 100 + rng() * (GAME_WIDTH - 300); const lw = 70 + rng() * 50;
          g.fillStyle(0x6a4818, 0.55); g.fillRoundedRect(lx, gndY - 6, lw, 12, 5);
        }
        for (let i = 0; i < 6; i++) drawMushroom(rng() * GAME_WIDTH, gndY, 22 + rng() * 12);
        for (let i = 0; i < 3; i++) drawRock(rng() * GAME_WIDTH, gndY + rng() * 5, 16 + rng() * 10);
        for (let i = 0; i < 8; i++) { g.fillStyle(0xf0e880, 0.10 + rng() * 0.05); g.fillCircle(rng() * GAME_WIDTH, gndY - 40 - rng() * 60, 20 + rng() * 25); }
      } else {
        const streamY = gndY - 5;
        g.fillStyle(0x3888c8, 0.45);
        for (let s = 0; s < 20; s++) { g.fillEllipse(-20 + s * (GAME_WIDTH + 40) / 20, streamY + Math.sin(s * 0.8) * 12, (GAME_WIDTH + 40) / 18, 42); }
        g.fillStyle(0x60b0e8, 0.22);
        for (let s = 0; s < 20; s++) { g.fillEllipse(-20 + s * (GAME_WIDTH + 40) / 20, streamY + Math.sin(s * 0.8) * 12, (GAME_WIDTH + 40) / 22, 20); }
        for (let i = 0; i < 4; i++) { g.fillStyle(0x888078, 0.65); g.fillEllipse(GAME_WIDTH * 0.2 + i * GAME_WIDTH * 0.18, streamY + Math.sin(i * 1.2) * 8, 18 + rng() * 8, 10 + rng() * 5); }
        for (let i = 0; i < 3; i++) {
          const tx = 100 + rng() * (GAME_WIDTH - 200);
          drawTree(tx, gndY, 90 + rng() * 20, 0x5a3810, 0x58a840);
          for (let d = 0; d < 6; d++) { g.lineStyle(1.5, 0x58a840, 0.35); g.beginPath(); g.moveTo(tx + (rng() - 0.5) * 50, gndY - 60 - rng() * 30); g.lineTo(tx + (rng() - 0.5) * 40, gndY - 20 - rng() * 15); g.strokePath(); }
        }
        drawFlowers(GAME_WIDTH * 0.15, gndY - 12, 8, 80, [0xf06888, 0xf0c040, 0xa0c8f0]);
        drawFlowers(GAME_WIDTH * 0.85, gndY - 10, 6, 70, [0xf080c0, 0xff8080, 0xf0e060]);
        for (let i = 0; i < 4; i++) drawBush(80 + rng() * (GAME_WIDTH - 160), gndY - 4, 30 + rng() * 18, 0x50a838);
      }
    } else if (this.floor === 2) {
      if (v === 0) {
        for (let i = 0; i < 8; i++) drawRock(rng() * GAME_WIDTH, gndY - rng() * 15, 18 + rng() * 20);
        for (let i = 0; i < 4; i++) { const px = 100 + rng() * (GAME_WIDTH - 200); const pw = 30 + rng() * 25; g.fillStyle(0x2070a0, 0.42); g.fillEllipse(px, gndY + 5, pw, pw * 0.4); g.fillStyle(0x40a0d0, 0.18); g.fillEllipse(px - 3, gndY + 2, pw * 0.6, pw * 0.25); }
        for (let i = 0; i < 6; i++) { const sx = rng() * GAME_WIDTH; const sh = 30 + rng() * 25; g.fillStyle(0x308040, 0.5); for (let s = 0; s < 4; s++) g.fillEllipse(sx + Math.sin(s * 1.5) * 8, gndY - s * sh / 4, 6, sh / 5); }
      } else if (v === 1) {
        for (let i = 0; i < 5; i++) { const cx = 80 + rng() * (GAME_WIDTH - 160); const ch = 35 + rng() * 30; const cc = [0xf0a848, 0xe86060, 0xf080a0, 0xc060c0][Math.floor(rng() * 4)]; g.fillStyle(cc, 0.65); for (let b = 0; b < 4; b++) g.fillEllipse(cx + (rng() - 0.5) * ch * 0.6, gndY - ch * 0.3 - rng() * ch * 0.4, 6 + rng() * 5, ch * 0.35); g.fillEllipse(cx, gndY - 3, ch * 0.4, 8); }
        for (let i = 0; i < 8; i++) { g.fillStyle(0xf0e8d0, 0.45); g.fillEllipse(rng() * GAME_WIDTH, gndY + rng() * 8, 6 + rng() * 6, 4 + rng() * 4); }
        for (let i = 0; i < 10; i++) { g.fillStyle(0x80d0f0, 0.22 + rng() * 0.12); g.fillCircle(rng() * GAME_WIDTH, gndY - 30 - rng() * 60, 3 + rng() * 4); }
      } else {
        for (let i = 0; i < 8; i++) { const cx = rng() * GAME_WIDTH; const ch = 40 + rng() * 25; g.fillStyle(0x2a4018, 0.65); g.fillRect(cx - 1.5, gndY - ch, 3, ch); g.fillStyle(0x3a5028, 0.75); g.fillEllipse(cx, gndY - ch - 5, 5, 8); }
        for (let i = 0; i < 6; i++) { g.fillStyle(0x40882a, 0.42); g.fillEllipse(rng() * GAME_WIDTH, gndY + rng() * 6, 14 + rng() * 10, 8 + rng() * 5); }
        for (let i = 0; i < 5; i++) { g.fillStyle(0xc0d0c0, 0.06 + rng() * 0.04); g.fillEllipse(rng() * GAME_WIDTH, gndY - 20 - rng() * 30, 100 + rng() * 80, 20 + rng() * 15); }
        for (let i = 0; i < 4; i++) drawBush(rng() * GAME_WIDTH, gndY - 3, 30 + rng() * 15, 0x2a5020);
      }
    } else if (this.floor === 3) {
      if (v === 0) {
        for (let i = 0; i < 5; i++) { const px = 80 + rng() * (GAME_WIDTH - 160); const pw = 55 + rng() * 30; g.fillStyle(0xd0e8f8, 0.6); g.fillRoundedRect(px - pw / 2, gndY - 8 - rng() * 30, pw, 14, 6); g.fillStyle(0xffffff, 0.22); g.fillRoundedRect(px - pw / 2 + 4, gndY - 10 - rng() * 28, pw - 8, 8, 4); }
        const rc = [0xff4040, 0xff8020, 0xf0e040, 0x40c040, 0x4080f0, 0x8040c0];
        for (let c = 0; c < rc.length; c++) { g.lineStyle(3, rc[c], 0.28); g.beginPath(); for (let a = 0; a <= 20; a++) { const t = (a / 20) * Math.PI; const x = GAME_WIDTH * 0.5 + Math.cos(t) * (180 + c * 8); const y = gndY - 30 - Math.sin(t) * 72; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.strokePath(); }
        for (let i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.18 + rng() * 0.12); g.fillEllipse(rng() * GAME_WIDTH, gndY - 20 - rng() * 50, 30 + rng() * 25, 12 + rng() * 8); }
      } else if (v === 1) {
        for (let i = 0; i < 6; i++) { g.fillStyle(0x304050, 0.38 + rng() * 0.18); g.fillEllipse(rng() * GAME_WIDTH, gndY - 60 - rng() * 40, 50 + rng() * 40, 20 + rng() * 15); }
        for (let i = 0; i < 25; i++) { const rx = rng() * GAME_WIDTH; g.lineStyle(1, 0xa0b8c8, 0.28); g.beginPath(); g.moveTo(rx, gndY - 80 - rng() * 40); g.lineTo(rx - 3, gndY - 50 - rng() * 20); g.strokePath(); }
        g.lineStyle(2.5, 0xf0e040, 0.55); g.beginPath(); const lx = GAME_WIDTH * (0.3 + rng() * 0.4); let ly = gndY - 100; g.moveTo(lx, ly); for (let s = 0; s < 5; s++) { ly += 15 + rng() * 10; g.lineTo(lx + (rng() - 0.5) * 30, ly); } g.strokePath();
      } else {
        const bands = [0xf08040, 0xe06868, 0xd050a0, 0x8040c0];
        for (let b = 0; b < bands.length; b++) { g.fillStyle(bands[b], 0.10); g.fillRect(0, gndY - 120 + b * 25, GAME_WIDTH, 30); }
        g.fillStyle(0xf0c040, 0.32); g.fillCircle(GAME_WIDTH * 0.5, gndY - 80, 50);
        g.fillStyle(0xf0e080, 0.18); g.fillCircle(GAME_WIDTH * 0.5, gndY - 80, 70);
        for (let r = 0; r < 6; r++) { const angle = (r / 6) * Math.PI - Math.PI / 2 + (rng() - 0.5) * 0.3; g.fillStyle(0xf0e080, 0.05); g.beginPath(); g.moveTo(GAME_WIDTH * 0.5, gndY - 80); g.lineTo(GAME_WIDTH * 0.5 + Math.cos(angle - 0.06) * 250, gndY - 80 + Math.sin(angle - 0.06) * 180); g.lineTo(GAME_WIDTH * 0.5 + Math.cos(angle + 0.06) * 250, gndY - 80 + Math.sin(angle + 0.06) * 180); g.closePath(); g.fillPath(); }
        for (let i = 0; i < 5; i++) { g.fillStyle(0x2a2040, 0.28); g.fillEllipse(rng() * GAME_WIDTH, gndY - 40 - rng() * 40, 40 + rng() * 30, 10 + rng() * 8); }
      }
    } else if (this.floor === 4) {
      if (v === 0) {
        for (let i = 0; i < 5; i++) { g.fillStyle(0xf06020, 0.45 + rng() * 0.2); g.fillEllipse(rng() * GAME_WIDTH, gndY + rng() * 10, 22 + rng() * 20, 10 + rng() * 8); g.fillStyle(0xf0c040, 0.22); g.fillEllipse(rng() * GAME_WIDTH, gndY + rng() * 8, 12 + rng() * 10, 5 + rng() * 4); }
        for (let i = 0; i < 4; i++) { const tx = rng() * GAME_WIDTH; g.fillStyle(0x2a1808, 0.65); g.fillRect(tx - 5, gndY - 30 - rng() * 20, 10, 35); g.fillStyle(0x1a1008, 0.45); g.fillEllipse(tx, gndY - 35 - rng() * 15, 18, 10); }
        for (let i = 0; i < 6; i++) drawRock(rng() * GAME_WIDTH, gndY - rng() * 8, 15 + rng() * 15);
      } else if (v === 1) {
        for (let i = 0; i < 5; i++) { const sx = rng() * GAME_WIDTH; const sh = 30 + rng() * 30; g.fillStyle(0x3a2010, 0.65); g.beginPath(); g.moveTo(sx - sh * 0.3, gndY); g.lineTo(sx, gndY - sh); g.lineTo(sx + sh * 0.3, gndY); g.closePath(); g.fillPath(); }
        for (let i = 0; i < 6; i++) { g.fillStyle(0x808080, 0.22 + rng() * 0.12); g.fillEllipse(rng() * GAME_WIDTH, gndY - 30 - rng() * 40, 15 + rng() * 15, 10 + rng() * 8); }
        for (let i = 0; i < 8; i++) drawRock(rng() * GAME_WIDTH, gndY + rng() * 5, 12 + rng() * 12);
      } else {
        for (let i = 0; i < 6; i++) { const sx = rng() * GAME_WIDTH; const sh = 20 + rng() * 30; g.fillStyle(0x4a3828, 0.6); g.beginPath(); g.moveTo(sx - 5, gndY - 80); g.lineTo(sx - sh * 0.3, gndY - 80 + sh); g.lineTo(sx + sh * 0.3, gndY - 80 + sh); g.closePath(); g.fillPath(); }
        g.fillStyle(0xf06020, 0.12); g.fillRect(0, gndY - 5, GAME_WIDTH, 15);
        for (let i = 0; i < 4; i++) { const cx = rng() * GAME_WIDTH; const ch = 25 + rng() * 20; g.fillStyle(0x60c8f0, 0.45); g.beginPath(); g.moveTo(cx, gndY - ch); g.lineTo(cx - ch * 0.15, gndY); g.lineTo(cx + ch * 0.15, gndY); g.closePath(); g.fillPath(); }
      }
    } else if (this.floor === 5) {
      if (v === 0) {
        g.fillStyle(0x88c8e8, 0.18); g.fillEllipse(GAME_WIDTH * 0.5, gndY + 5, GAME_WIDTH * 0.5, 30);
        for (let i = 0; i < 5; i++) { const cx = rng() * GAME_WIDTH; const ch = 25 + rng() * 20; g.fillStyle(0x88d8f8, 0.42); g.beginPath(); g.moveTo(cx, gndY - ch); g.lineTo(cx - ch * 0.2, gndY); g.lineTo(cx + ch * 0.2, gndY); g.closePath(); g.fillPath(); }
        for (let i = 0; i < 4; i++) { const tx = rng() * GAME_WIDTH; g.fillStyle(0x6a5040, 0.55); g.fillRect(tx - 3, gndY - 45 - rng() * 20, 6, 50); g.lineStyle(1.5, 0x5a4030, 0.35); for (let b = 0; b < 3; b++) { g.beginPath(); g.moveTo(tx, gndY - 30 - b * 12); g.lineTo(tx + (rng() > 0.5 ? 1 : -1) * (10 + rng() * 10), gndY - 40 - b * 12); g.strokePath(); } }
      } else if (v === 1) {
        for (let i = 0; i < 3; i++) { const rx = rng() * GAME_WIDTH; const ry = gndY - 30 - rng() * 40; g.fillStyle(0x200830, 0.5); g.fillEllipse(rx, ry, 35 + rng() * 20, 10 + rng() * 8); g.fillStyle(0x6020a0, 0.22); g.fillEllipse(rx, ry, 20 + rng() * 10, 5 + rng() * 4); }
        for (let i = 0; i < 25; i++) { g.fillStyle(0xffffff, 0.28 + rng() * 0.28); g.fillCircle(rng() * GAME_WIDTH, gndY - 20 - rng() * 80, 1 + rng() * 1.5); }
      } else {
        for (let i = 0; i < 6; i++) { const cx = rng() * GAME_WIDTH; const ch = 35 + rng() * 30; const cc = [0x88c8f8, 0xa080e0, 0x60e0c0][Math.floor(rng() * 3)]; g.fillStyle(cc, 0.5); g.beginPath(); g.moveTo(cx, gndY - ch); g.lineTo(cx - ch * 0.18, gndY); g.lineTo(cx + ch * 0.18, gndY); g.closePath(); g.fillPath(); g.fillStyle(0xffffff, 0.12); g.beginPath(); g.moveTo(cx - 2, gndY - ch + 5); g.lineTo(cx - ch * 0.1, gndY); g.lineTo(cx, gndY); g.closePath(); g.fillPath(); }
        for (let i = 0; i < 12; i++) { g.fillStyle(0xffffff, 0.32 + rng() * 0.28); g.fillCircle(rng() * GAME_WIDTH, gndY - 10 - rng() * 60, 1.5 + rng() * 1.5); }
      }
    } else {
      for (let i = 0; i < 4; i++) drawTree(100 + rng() * (GAME_WIDTH - 200), gndY, 60 + rng() * 30, 0x4a3020, 0x406040);
      for (let i = 0; i < 6; i++) drawBush(rng() * GAME_WIDTH, gndY - 3, 25 + rng() * 20, 0x385838);
      for (let i = 0; i < 5; i++) drawRock(rng() * GAME_WIDTH, gndY + rng() * 5, 12 + rng() * 14);
      drawFlowers(GAME_WIDTH * 0.3, gndY - 8, 6, 80, [0xc080d0, 0x80b0e0, 0xe0a060]);
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
    const uiTop = area.bottom - 290;
    const groundY = uiTop;

    const enemyCount = this.enemies.length;
    const heroScale = enemyCount >= 3 ? 0.65 : enemyCount >= 2 ? 0.75 : 0.85;
    const spacing = Math.min(220, (GAME_WIDTH * 0.5) / 3);
    const leftAnchor = GAME_WIDTH * 0.12 + spacing / 2;

    this.heroSprites = this.party.map((hero, i) => {
      const xStagger = (1 - i) * 15;  // hero 0: +15, hero 1: 0, hero 2: -15
      const x = leftAnchor + i * spacing + xStagger;
      const stagger = 30;
      const baseY = groundY - 90;
      const y = baseY + (1 - i) * stagger;  // hero 0 lowest (closest), hero 2 highest (farthest)

      const depthScale = 1 - (2 - i) * 0.05;  // hero 0: 1.0, hero 1: 0.95, hero 2: 0.90
      const body = drawHeroSprite(this, x, y, hero, { scale: heroScale * depthScale });
      body.setDepth(12);

      const name = this.add.text(x, y - 120, hero.name.toUpperCase(), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '20px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.ink,
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(14);

      const hpBarBg = this.add.rectangle(x, y + 80, 150, 14, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD).setDepth(13);
      const hpBarFill = this.add.rectangle(x - 73, y + 80, 146, 10, 0x40c040)
        .setOrigin(0, 0.5).setDepth(13);
      const hpText = this.add.text(x, y + 96, `${hero.hp}/${hero.maxHp}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '14px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5).setDepth(14);

      const indicator = this.add.triangle(x, y - 160, 0, 0, 20, 0, 10, 20, COLORS.goldL)
        .setVisible(false).setDepth(15);

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
    const uiTop = area.bottom - 290;
    const groundY = uiTop;
    const centerX = GAME_WIDTH * 0.76;
    const count = this.enemies.length;

    // Dynamic scaling: fewer monsters = bigger, more = smaller with proper spacing
    // Target display heights: single ~490px (0.77), 2 ~326px (0.51), 3 ~277px (0.43)
    const monsterScaleByCount = count >= 3 ? 0.43 : count >= 2 ? 0.51 : 0.77;

    // Calculate offsets: diagonal for 2, triangle for 3
    const displayH = 640 * monsterScaleByCount;
    const positions = []; // [{dx, dy}]
    if (count === 1) {
      positions.push({ dx: 0, dy: 0 });
    } else if (count === 2) {
      // Diagonal: top-left and bottom-right within monster area
      positions.push({ dx: -80, dy: -displayH * 0.35 });
      positions.push({ dx: 80, dy: displayH * 0.35 });
    } else {
      // Triangle: top-center, bottom-left, bottom-right
      positions.push({ dx: 0, dy: -displayH * 0.4 });
      positions.push({ dx: -130, dy: displayH * 0.3 });
      positions.push({ dx: 130, dy: displayH * 0.3 });
    }

    this.enemySprites = [];

    for (let ei = 0; ei < count; ei++) {
      const enemy = this.enemies[ei];
      const monsterScale = enemy.isBoss ? 1.02 : monsterScaleByCount;
      const x = centerX + positions[ei].dx;
      const monsterDisplayH = 640 * monsterScale;
      const y = groundY - monsterDisplayH * 0.50 + positions[ei].dy;
      const w = 200, h = 220;

      const body = drawMonsterSprite(this, x, y, enemy, { scale: monsterScale, floorId: this.floor });
      body.setDepth(12);

      // Name/HP bars directly above the sprite head
      const spriteHalfH = (640 * monsterScale) * 0.50;
      const nameY = y - spriteHalfH - 10;
      const hpY = y - spriteHalfH + 6;
      const hpTextY = y - spriteHalfH + 20;

      const name = this.add.text(x, nameY, enemy.name.toUpperCase(), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: count >= 3 ? '20px' : '26px',
        color: COLORS_CSS.paper,
        stroke: COLORS_CSS.scarlet,
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(14);

      const hpBarBg = this.add.rectangle(x, hpY, w + 20, 20, COLORS.ink)
        .setStrokeStyle(2, COLORS.paperD).setDepth(13);
      const hpBarFill = this.add.rectangle(x - (w + 20) / 2 + 2, hpY, (w + 20 - 4) * (enemy.hp / enemy.maxHp), 14, 0xc04030)
        .setOrigin(0, 0.5).setDepth(13);
      const hpText = this.add.text(x, hpTextY, `${enemy.hp}/${enemy.maxHp}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '15px',
        color: '#fff8e0',
        stroke: '#1a0e04',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(14);

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

  setUIDepth(obj, depth) {
    if (!obj) return;
    for (const key of ['bg', 'shadow', 'label', 'zone', 'fill', 'track']) {
      if (obj[key] && obj[key].setDepth) obj[key].setDepth(depth);
    }
    if (obj.setDepth) obj.setDepth(depth);
  }

  buildUI() {
    // NEW LAYOUT — characters always visible, equation floats as a
    // small paper note in the upper area, only the answer-button row
    // lives in a tight bottom strip.
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    const ansH = 80;
    const ansY = area.bottom - ansH / 2 - 6;
    const eqY = ansY - ansH / 2 - 80;

    // === TOP: floor name + momentum bar (slim) ===
    const topY = area.top + 22;
    const barW = 380;
    const barX = area.cx - barW / 2;

    const topPanel = PaperPanel(this, area.cx, topY, barW + 220, 50, {
      color: 0xfff4e0, alpha: 0.92, radius: 16,
    });
    if (topPanel.bg) topPanel.bg.setDepth(20);
    if (topPanel.shadow) topPanel.shadow.setDepth(19);

    this.add.text(barX - 10, topY, 'MOMENTUM', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px',
      color: '#3a2410',
      letterSpacing: 1,
    }).setOrigin(1, 0.5).setDepth(21);

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

    const noteW = 345;
    const noteH = 110;
    const noteCx = area.cx;
    const noteCy = eqY;
    this.eqCenterY = eqY;

    PaperPanel(this, noteCx, noteCy, noteW, noteH, {
      color: 0xf5ead0, alpha: 0.92, radius: 18, shadowOff: 4, shadowAlpha: 0.2,
    });

    // Floor-themed math panel decorations
    this.panelFx = createPanelDecorations(this, this.floor, noteCx, noteCy, noteW, noteH);

    // Bigger digits for the youngest players (K-2) who are still
    // learning to read numerals at a glance.
    const eqFont = this.grade <= 2 ? '54px' : '44px';
    this.eqLines = {
      a:    this.add.text(noteCx + 20, noteCy - 30, '', this.eqLineStyle({ fontSize: eqFont, color: '#3a2410' })),
      opB:  this.add.text(noteCx + 20, noteCy + 2,  '', this.eqLineStyle({ fontSize: eqFont, color: '#c06a10' })),
      bar:  this.add.text(noteCx,      noteCy + 24, '\u2500\u2500\u2500', this.eqLineStyle({ fontSize: '22px', color: '#8a7050' })),
      ans:  this.add.text(noteCx,      noteCy + 42, '?', this.eqLineStyle({ fontSize: eqFont, color: '#d08020' })),
      stars: this.add.text(noteCx + noteW / 2 - 10, noteCy - noteH / 2 + 8, '', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '18px', color: '#8a5010', letterSpacing: 3,
        stroke: '#f5ead0', strokeThickness: 1,
      }),
    };
    this.eqLines.a.setOrigin(1, 0.5);
    this.eqLines.opB.setOrigin(1, 0.5);
    this.eqLines.bar.setOrigin(0.5);
    this.eqLines.ans.setOrigin(0.5, 0.5);
    this.eqLines.stars.setOrigin(1, 0);

    // Turn label — above the math panel, full width with larger font
    const turnY = eqY - noteH / 2 - 24;
    PaperPanel(this, area.cx, turnY, area.w - 40, 42, {
      color: 0xf5ead0, alpha: 0.92, radius: 14, shadowOff: 3, shadowAlpha: 0.18,
    });
    this.turnLabel = this.add.text(area.cx, turnY, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      color: '#3a2410',
      stroke: '#f5ead0',
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
          if (this._consumedButtonIdx === i) return;
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

    // Colorblind mode: draw shape icons on answer buttons + momentum bar patterns
    if (this.save.settings.colorblindMode) {
      this.drawColorblindShapes();
      this.drawColorblindMomentumPatterns(barX, topY, barW);
    }

    const abilityBtnY = ansY + ansH / 2 + 32;
    this.abilityBtn = PaperButton(this, area.cx, abilityBtnY, 'ABILITY', {
      w: 220, h: 42, color: 0x9050c8, fontSize: 16,
      onClick: () => this.useAbility(),
    });
    this.setSuperVisible(this.abilityBtn, false);

    this.superBtn = PaperButton(this, area.cx - 220, abilityBtnY, 'SUPER!', {
      w: 180, h: 44, color: 0xe8a030, fontSize: 17,
      onClick: () => this.executeSuperMove(),
    });
    this.setSuperVisible(this.superBtn, false);

    this.teamBtn = PaperButton(this, area.cx + 220, abilityBtnY, 'TEAM ATTACK!', {
      w: 200, h: 44, color: 0xe04040, fontSize: 15,
      onClick: () => this.executeTeamAttack(),
    });
    this.setSuperVisible(this.teamBtn, false);

    // Pause/gear button — top-left near QUEST label
    const gearBtn = PaperButton(this, area.left + 60, area.top + 22, '⚙', {
      w: 54, h: 46, color: 0xfff8e8, fontSize: 22,
      textColor: '#3a2410',
      onClick: () => this.showPauseOverlay(),
    });
    this.setUIDepth(gearBtn, 20);

    // Pause overlay — all elements at absolute positions, collected into
    // an array so we can show/hide them together. Depth is set high so
    // they render above everything else.
    const pcx = GAME_WIDTH / 2;
    const pcy = GAME_HEIGHT / 2;
    this._pauseElements = [];

    const pauseBg = this.add.rectangle(pcx, pcy, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.85)
      .setDepth(100).setInteractive().setVisible(false);
    this._pauseElements.push(pauseBg);

    const pausePanel = PaperPanel(this, pcx, pcy, 400, 360, {
      color: 0xfff4e0, alpha: 0.95, radius: 24,
    });
    if (pausePanel.bg) { pausePanel.bg.setDepth(101).setVisible(false); this._pauseElements.push(pausePanel.bg); }
    if (pausePanel.shadow) { pausePanel.shadow.setDepth(100).setVisible(false); this._pauseElements.push(pausePanel.shadow); }

    const pauseTitle = this.add.text(pcx, pcy - 130, 'PAUSED', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '42px',
      color: '#3a2410',
      stroke: '#f0d060',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(102).setVisible(false);
    this._pauseElements.push(pauseTitle);

    const resumeBtn = PaperButton(this, pcx, pcy - 50, 'RESUME', {
      w: 300, h: 64, color: 0x4aa848, fontSize: 22,
      onClick: () => this.hidePauseOverlay(),
    });
    [resumeBtn.bg, resumeBtn.shadow, resumeBtn.label, resumeBtn.zone].forEach(el => {
      if (el) { el.setDepth(102).setVisible(false); this._pauseElements.push(el); }
    });

    const potionCount = this.save.potions || 0;
    const potionBtn = PaperButton(this, pcx, pcy + 30, `USE POTION (${potionCount})`, {
      w: 300, h: 64, color: 0x6828a0, fontSize: 22,
      onClick: () => {
        this.hidePauseOverlay();
        this.usePotion();
      },
    });
    this._pausePotionLabel = potionBtn.label;
    this._pausePotionBtn = potionBtn;
    [potionBtn.bg, potionBtn.shadow, potionBtn.label, potionBtn.zone].forEach(el => {
      if (el) { el.setDepth(102).setVisible(false); this._pauseElements.push(el); }
    });

    const retreatBtn = PaperButton(this, pcx, pcy + 110, 'RETREAT', {
      w: 300, h: 64, color: 0xc83030, fontSize: 22,
      onClick: () => {
        this.hidePauseOverlay();
        this.retreatFromBattle();
      },
    });
    [retreatBtn.bg, retreatBtn.shadow, retreatBtn.label, retreatBtn.zone].forEach(el => {
      if (el) { el.setDepth(102).setVisible(false); this._pauseElements.push(el); }
    });

    // Toast (floats above the UI panel)
    this.toast = this.add.text(area.cx, area.top + 90, '', {
      ...TEXT.heading(),
      fontSize: '26px',
      backgroundColor: '#1a0e04',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);

    // --- DEPTH FIX: Set all UI elements above parallax background (depths 0-8) ---
    const UI_DEPTH = 20;
    const UI_TEXT_DEPTH = 21;
    // Momentum bar
    this.setUIDepth(this.momentumBarObj, UI_DEPTH);
    if (this.momentumLabel) this.momentumLabel.setDepth(UI_TEXT_DEPTH);
    // Potion button
    this.setUIDepth(this.potionBtn, UI_DEPTH);
    // Equation panel elements
    for (const key of Object.keys(this.eqLines || {})) {
      if (this.eqLines[key]?.setDepth) this.eqLines[key].setDepth(UI_TEXT_DEPTH + 2);
    }
    // Turn label
    if (this.turnLabel) this.turnLabel.setDepth(UI_TEXT_DEPTH + 2);
    // Answer buttons
    for (const btn of this.answerButtons || []) {
      this.setUIDepth(btn, UI_DEPTH + 5);
      if (btn.label?.setDepth) btn.label.setDepth(UI_DEPTH + 6);
    }
    // Ability buttons
    for (const btn of [this.abilityBtn, this.superBtn, this.teamBtn]) {
      this.setUIDepth(btn, UI_DEPTH + 4);
    }
    // Gear/pause button — find all non-depth-set game objects and bump UI ones
    // The PaperPanels for equation and turn label need depth too
    this.children.list.forEach(child => {
      if (child.depth === 0 && child.type === 'Graphics' && child !== this.parallaxState?.layers?.[0]?.gfx) {
        // Only bump UI graphics, not parallax ones
        const y = child.y ?? 0;
        if (y > 800 || child._paperPanel) child.setDepth(UI_DEPTH);
      }
    });

    // End overlay (hidden by default)
    this.endOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setVisible(false).setDepth(200);
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, COLORS.ink, 0.92);
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
  // ================================================================
  // COMMAND MENU
  // ================================================================

  buildCommandMenu() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const cmds = this.availableCommands;
    const btnW = 160;
    const btnH = 75;
    const gap = 22;
    const totalW = cmds.length * btnW + (cmds.length - 1) * gap;
    const startX = area.cx - totalW / 2 + btnW / 2;
    const cmdY = this.eqCenterY || (this.answerBtnLayout.y - this.answerBtnLayout.h / 2 - 80);

    this.commandButtons = [];
    const cmdColors = {
      [COMMANDS.FIGHT]: 0x3080d0,
      [COMMANDS.MAGIC]: 0x8040c0,
      [COMMANDS.GUARD]: 0x308830,
    };
    const cmdIcons = {
      [COMMANDS.FIGHT]: '⚔️',
      [COMMANDS.MAGIC]: '✨',
      [COMMANDS.GUARD]: '🛡️',
    };
    const cmdLabels = {
      [COMMANDS.FIGHT]: 'FIGHT',
      [COMMANDS.MAGIC]: 'MAGIC',
      [COMMANDS.GUARD]: 'GUARD',
    };

    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      const x = startX + i * (btnW + gap);
      const btn = PaperButton(this, x, cmdY, `${cmdIcons[cmd]} ${cmdLabels[cmd]}`, {
        w: btnW, h: btnH,
        color: cmdColors[cmd],
        fontSize: 20,
        onClick: () => {
          if (this.phase !== 'command') return;
          audio.play('ui/click');
          this.selectCommand(cmd);
        },
      });
      btn.cmd = cmd;
      btn._origY = cmdY;
      this.setUIDepth(btn, 28);
      if (btn.label?.setDepth) btn.label.setDepth(29);
      this.commandButtons.push(btn);
    }
    this.setCommandMenuVisible(false);
  }

  setCommandMenuVisible(visible) {
    for (let idx = 0; idx < this.commandButtons.length; idx++) {
      const btn = this.commandButtons[idx];
      if (btn.bg) btn.bg.setVisible(visible);
      if (btn.shadow) btn.shadow.setVisible(visible);
      if (btn.label) btn.label.setVisible(visible);
      if (btn.zone) btn.zone.setVisible(visible);
    }
  }

  setCommandMenuForClass(allowedCmds) {
    // Destroy old buttons completely and rebuild fresh
    for (const btn of this.commandButtons) {
      for (const el of [btn.bg, btn.shadow, btn.label, btn.zone]) {
        if (el) el.destroy();
      }
    }
    this.commandButtons = [];

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const btnW = 160, btnH = 75, gap = 22;
    const cmdY = this.eqCenterY || (this.answerBtnLayout.y - this.answerBtnLayout.h / 2 - 80);
    const totalW = allowedCmds.length * btnW + (allowedCmds.length - 1) * gap;
    const startX = area.cx - totalW / 2 + btnW / 2;

    const cmdColors = { [COMMANDS.FIGHT]: 0x3080d0, [COMMANDS.MAGIC]: 0x8040c0, [COMMANDS.GUARD]: 0x308830 };
    const cmdIcons = { [COMMANDS.FIGHT]: '⚔️', [COMMANDS.MAGIC]: '✨', [COMMANDS.GUARD]: '🛡️' };
    const cmdLabels = { [COMMANDS.FIGHT]: 'FIGHT', [COMMANDS.MAGIC]: 'MAGIC', [COMMANDS.GUARD]: 'GUARD' };

    for (let i = 0; i < allowedCmds.length; i++) {
      const cmd = allowedCmds[i];
      const x = startX + i * (btnW + gap);
      const btn = PaperButton(this, x, cmdY, `${cmdIcons[cmd]} ${cmdLabels[cmd]}`, {
        w: btnW, h: btnH, color: cmdColors[cmd], fontSize: 20,
        onClick: () => {
          if (this.phase !== 'command') return;
          audio.play('ui/click');
          this.selectCommand(cmd);
        },
      });
      btn.cmd = cmd;
      btn._origY = cmdY;
      this.setUIDepth(btn, 28);
      if (btn.label?.setDepth) btn.label.setDepth(29);
      this.commandButtons.push(btn);
    }
  }

  addComboButton() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const btnH = 75;
    const cmdY = this.eqCenterY || (this.answerBtnLayout.y - this.answerBtnLayout.h / 2 - 80);
    // Place combo button below the command row
    const comboY = cmdY + btnH + 16;
    const btn = PaperButton(this, area.cx, comboY, '⚡ COMBO', {
      w: 200, h: btnH, color: 0xd4a820, fontSize: 20,
      onClick: () => {
        if (this.phase !== 'command') return;
        audio.play('ui/click');
        this.executeCombo();
      },
    });
    btn._isCombo = true;
    btn._origY = comboY;
    this.setUIDepth(btn, 28);
    if (btn.label?.setDepth) btn.label.setDepth(29);
    this.commandButtons.push(btn);
  }

  executeCombo() {
    if (this.phase !== 'command' || !this._availableCombo) return;
    this.comboUsedThisBattle = true;

    const combo = this._availableCombo;
    const { hero1, hero2, name, multiplier } = combo;

    // Hide command menu
    this.setCommandMenuVisible(false);

    // Generate a harder question (same as MAGIC — harder difficulty bias)
    const config = getCommandConfig(COMMANDS.MAGIC);
    this.currentQuestion = generateRatedQuestion({
      operator: this.operator,
      grade: this.grade,
      streak: this.streak,
      floor: this.floor,
      targetStars: config.targetStars,
    });

    // Show combo name as turn label
    const starStr = '★'.repeat(this.currentQuestion.stars) +
                    '☆'.repeat(5 - this.currentQuestion.stars);
    this.turnLabel.setText(`${hero1.name} & ${hero2.name}: ${name}! ${starStr}`);

    this.phase = 'question';
    this.selectedCommand = '_COMBO_';
    this._comboData = { hero1, hero2, name, multiplier };
    this.renderStackedEquation(this.currentQuestion);
    showPanelFx(this, this.panelFx);

    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].label.setText(String(this.currentQuestion.choices[i]));
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 1);
    }

    // Animate equation + answer buttons in
    const eqElements = Object.values(this.eqLines || {}).filter(Boolean);
    const ansElements = [];
    for (const btn of this.answerButtons) {
      for (const el of [btn.bg, btn.shadow, btn.label, btn.zone]) {
        if (el) ansElements.push(el);
      }
    }
    const fadeInTargets = [...eqElements, ...ansElements];
    const originalYs = fadeInTargets.map(el => el.y);
    for (let fi = 0; fi < fadeInTargets.length; fi++) {
      fadeInTargets[fi].setAlpha(0);
      fadeInTargets[fi].y = originalYs[fi] + 20;
    }
    this.setAnswerButtonsVisible(true);
    for (let fi = 0; fi < fadeInTargets.length; fi++) {
      this.tweens.add({
        targets: fadeInTargets[fi],
        alpha: 1,
        y: originalYs[fi],
        duration: 150,
        ease: 'Cubic.out',
        delay: 100,
      });
    }

    this._consumedButtonIdx = -1;
  }

  /** Called from onAnswer when selectedCommand is _COMBO_ and the answer is correct */
  applyComboAttack() {
    const { hero1, hero2, name, multiplier } = this._comboData;
    const targetIdx = this.currentTarget;
    const targetEnemy = this.enemies[targetIdx] || this.enemy;
    const targetSprite = this.enemySprites[targetIdx] || this.enemySprite;

    // Combined ATK of both heroes
    const combinedAtk = (hero1.atk || 10) + (hero2.atk || 10);
    const totalDmg = Math.max(5, Math.round(combinedAtk * multiplier));

    // Find hero sprite indices
    const h1Idx = this.party.indexOf(hero1);
    const h2Idx = this.party.indexOf(hero2);
    const hs1 = this.heroSprites[h1Idx];
    const hs2 = this.heroSprites[h2Idx];

    // Mark the partner's turn to be skipped (only if they haven't acted yet this round)
    const currentHeroIdx = this.currentTurn.heroIndex;
    const partnerIdx = currentHeroIdx === h1Idx ? h2Idx : h1Idx;
    this.comboSkipHeroIndex = partnerIdx > currentHeroIdx ? partnerIdx : -1;

    // Show combo name in golden text at center
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const comboText = this.add.text(area.cx, area.cy - 60, name + '!', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '52px',
      color: '#f0d040',
      stroke: '#3a1a00',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(0.5);

    this.tweens.add({
      targets: comboText,
      alpha: 1,
      scale: 1.2,
      duration: 400,
      ease: 'Back.out',
      onComplete: () => {
        this.tweens.add({
          targets: comboText,
          alpha: 0,
          scale: 1.5,
          duration: 500,
          delay: 600,
          ease: 'Cubic.in',
          onComplete: () => comboText.destroy(),
        });
      },
    });

    // Both heroes rush forward
    const lungeX = targetSprite.body ? targetSprite.body.x - 80 : (hs1?.x || 300) + 200;
    const origX1 = hs1?.body?.x;
    const origX2 = hs2?.body?.x;

    if (hs1?.body) {
      hs1.body.setTint(0xffff80);
      this.tweens.add({
        targets: hs1.body, x: lungeX - 20, duration: 250, ease: 'Power2',
        onComplete: () => {
          hs1.body.clearTint();
          this.tweens.add({ targets: hs1.body, x: origX1, duration: 200, ease: 'Power2' });
        },
      });
    }
    if (hs2?.body) {
      hs2.body.setTint(0xffff80);
      this.tweens.add({
        targets: hs2.body, x: lungeX + 20, duration: 250, delay: 80, ease: 'Power2',
        onComplete: () => {
          hs2.body.clearTint();
          this.tweens.add({ targets: hs2.body, x: origX2, duration: 200, ease: 'Power2' });
        },
      });
    }

    // Hit effects after a brief delay
    this.time.delayedCall(350, () => {
      // Screen shake + particle burst
      this.cameras.main.shake(350, 0.025);
      this.burstParticles(targetSprite.x, targetSprite.y, 0xf0d040);
      this.burstParticles(targetSprite.x, targetSprite.y, 0xf08020);
      this.hitFlash();

      // Apply damage
      targetEnemy.hp = Math.max(0, targetEnemy.hp - totalDmg);
      this.updateEnemyHp(targetIdx);
      this.floatDamageNumber(targetSprite.x, targetSprite.y - 100, totalDmg, '#f0d040', '+');
      audio.play('battle/hit-enemy');

      this.showToast(`${name}! ${totalDmg} DMG!`, '#f0d040');

      // Check for kill
      if (targetEnemy.hp <= 0) {
        this.tweens.add({ targets: targetSprite.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 400, ease: 'Back.in' });
        if (targetSprite.name) this.tweens.add({ targets: targetSprite.name, alpha: 0, duration: 400 });
        if (targetSprite.hpBarBg) this.tweens.add({ targets: targetSprite.hpBarBg, alpha: 0, duration: 400 });
        if (targetSprite.hpBarFill) this.tweens.add({ targets: targetSprite.hpBarFill, alpha: 0, duration: 400 });
        if (targetSprite.hpText) this.tweens.add({ targets: targetSprite.hpText, alpha: 0, duration: 300 });
        if (this.allEnemiesDead()) {
          this.time.delayedCall(500, () => this.showVictory());
          return;
        }
        const nextAlive = this.findNextAliveEnemy();
        if (nextAlive >= 0) this.currentTarget = nextAlive;
      }

      this.time.delayedCall(500, () => {
        this._answerProcessing = false;
        this.nextTurn();
      });
    });
  }

  selectCommand(cmd) {
    this.selectedCommand = cmd;

    // Animate command buttons sliding/fading out
    const cmdElements = [];
    for (const btn of this.commandButtons) {
      for (const el of [btn.bg, btn.shadow, btn.label, btn.zone]) {
        if (el && el.visible) cmdElements.push(el);
      }
    }
    if (cmdElements.length > 0) {
      this.tweens.add({
        targets: cmdElements,
        alpha: 0,
        duration: 120,
        ease: 'Cubic.in',
        onComplete: () => this.setCommandMenuVisible(false),
      });
    } else {
      this.setCommandMenuVisible(false);
    }

    const hero = this.party[this.currentTurn.heroIndex];
    const config = getCommandConfig(cmd);

    if (cmd === COMMANDS.GUARD) {
      this.guardActive[this.currentTurn.heroIndex] = true;
      this.turnLabel.setText(`${hero.name} guards! -50% damage`);
      this.showToast(`${hero.name} GUARDS!`, '#48a848');
      audio.play('battle/correct');
      // Brief shield visual on the hero sprite
      const hs = this.heroSprites[this.currentTurn.heroIndex];
      if (hs && hs.body) {
        const shield = this.add.circle(hs.x, hs.y, 60, 0x48a848, 0.3);
        this.tweens.add({
          targets: shield, scale: 1.3, alpha: 0,
          duration: 400, ease: 'Cubic.out',
          onComplete: () => shield.destroy(),
        });
      }
      this.time.delayedCall(500, () => this.nextTurn());
      return;
    }

    // FIGHT or MAGIC: generate a rated question and show it
    this.currentQuestion = generateRatedQuestion({
      operator: this.operator,
      grade: this.grade,
      streak: this.streak,
      floor: this.floor,
      targetStars: config.targetStars,
    });

    // Show star rating on the turn label
    const starStr = '★'.repeat(this.currentQuestion.stars) +
                    '☆'.repeat(5 - this.currentQuestion.stars);
    const isBunnyHeal = cmd === COMMANDS.MAGIC && (hero.class || 'knight') === 'bunny';
    const cmdName = isBunnyHeal ? 'HEAL' : cmd === COMMANDS.MAGIC ? 'MAGIC' : 'FIGHT';
    this.turnLabel.setText(`${hero.name}: ${cmdName}! ${starStr}`);

    // --- Battle cry: attack ---
    this.showBattleCry(hero, 'attack');

    this.phase = 'question';
    this.renderStackedEquation(this.currentQuestion);
    showPanelFx(this, this.panelFx);

    for (let i = 0; i < 4; i++) {
      this.answerButtons[i].label.setText(String(this.currentQuestion.choices[i]));
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 1);
    }

    // Animate equation panel + answer buttons sliding/fading in
    const eqElements = Object.values(this.eqLines || {}).filter(Boolean);
    const ansElements = [];
    for (const btn of this.answerButtons) {
      for (const el of [btn.bg, btn.shadow, btn.label, btn.zone]) {
        if (el) ansElements.push(el);
      }
    }
    const fadeInTargets = [...eqElements, ...ansElements];
    // Record target y positions, then offset for slide-in
    const originalYs = fadeInTargets.map(el => el.y);
    for (let fi = 0; fi < fadeInTargets.length; fi++) {
      fadeInTargets[fi].setAlpha(0);
      fadeInTargets[fi].y = originalYs[fi] + 20;
    }
    this.setAnswerButtonsVisible(true);
    for (let fi = 0; fi < fadeInTargets.length; fi++) {
      this.tweens.add({
        targets: fadeInTargets[fi],
        alpha: 1,
        y: originalYs[fi],
        duration: 150,
        ease: 'Cubic.out',
        delay: 100,
      });
    }

    // --- Stargazer signature: reveal one wrong answer ---
    if (this.signatureState.revealWrongActive) {
      const wrongIndices = [0, 1, 2, 3].filter(i => i !== this.currentQuestion.correctIndex);
      if (wrongIndices.length > 0) {
        const revealIdx = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
        // Reduce opacity and draw a red X over the wrong answer button
        this.recolorAnswerButton(revealIdx, this.answerButtons[revealIdx].baseColor, 0.4);
        const { w, h, y: btnY, startX, gap } = this.answerBtnLayout;
        const bx = startX + revealIdx * (w + gap);
        const xMark = this.add.text(bx, btnY, '✗', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '52px',
          color: '#e04040',
          stroke: '#000000',
          strokeThickness: 4,
        }).setOrigin(0.5).setDepth(30);
        this._revealWrongMark = xMark;
      }
    }

    // Boss timer starts AFTER command selection
    if (this.bossTimer) { this.bossTimer.remove(); this.bossTimer = null; }
    if (this.bossTimerBar) { this.bossTimerBar.destroy(); this.bossTimerBar = null; }
    if (this.isBoss) {
      const gradeTimers = [12000, 11000, 10000, 8000, 9000, 10000];
      let timerDuration = gradeTimers[this.grade] || 8000;
      // --- Bookworm signature: add extra seconds to boss timer ---
      if (this.signatureState.timerBonusSeconds > 0) {
        timerDuration += this.signatureState.timerBonusSeconds * 1000;
        // Show +Ns indicator near the timer bar
        const area2 = safeArea(GAME_WIDTH, GAME_HEIGHT);
        const bonusLabel = this.add.text(area2.cx + 210, this.turnLabel.y - 30, `+${this.signatureState.timerBonusSeconds}s`, {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '16px',
          color: '#4080e0',
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(30);
        this._timerBonusLabel = bonusLabel;
      }
      this.bossTimerStart = this.time.now;
      this.bossTimerDuration = timerDuration;

      const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
      const barW = 400;
      const barY = this.turnLabel.y - 30;
      this.bossTimerBar = this.add.graphics();
      this.bossTimerBar.setScrollFactor(0);
      this.updateBossTimerBar(barW, barY, 1);

      this.bossTimerUpdate = this.time.addEvent({
        delay: 50, loop: true,
        callback: () => {
          const elapsed = this.time.now - this.bossTimerStart;
          const pct = Math.max(0, 1 - elapsed / timerDuration);
          this.updateBossTimerBar(barW, barY, pct);
        },
      });

      this.bossTimer = this.time.delayedCall(timerDuration, () => {
        if (this.phase !== 'question' || this.locked) return;
        this.showToast('TIME UP!', COLORS_CSS.scarletL);
        const wrongIdx = [0,1,2,3].find(i => i !== this.currentQuestion.correctIndex) ?? 0;
        this.onAnswer(wrongIdx);
      });
    }

    // Consume ability (enemy ate a wrong answer button)
    this._consumedButtonIdx = -1;
    if (this._consumeNextTurn) {
      this._consumeNextTurn = false;
      const wrongIndices = [0, 1, 2, 3].filter((i) => i !== this.currentQuestion.correctIndex);
      const victim = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      this._consumedButtonIdx = victim;
      this.recolorAnswerButton(victim, this.answerButtons[victim].baseColor, 0.25);
      this.answerButtons[victim].label.setText('?');
    }
  }

  setAnswerButtonsVisible(visible) {
    for (const btn of this.answerButtons) {
      if (btn.bg) btn.bg.setVisible(visible);
      if (btn.shadow) btn.shadow.setVisible(visible);
      if (btn.label) btn.label.setVisible(visible);
      if (btn.zone) btn.zone.setVisible(visible);
    }
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

    // Auto-dismiss any active hint overlay so it doesn't block the
    // next turn's UI. The hint overlay sits at depth 150 and intercepts
    // all pointer events, which causes a perceived freeze if left open.
    if (this._activeHintDismiss) {
      this._activeHintDismiss();
    }

    if (isPartyDefeated(this.party)) return this.showDefeat();
    if (this.allEnemiesDead()) return this.showVictory();

    // Auto-advance target to next alive enemy
    const nextAlive = this.findNextAliveEnemy();
    if (nextAlive >= 0) this.currentTarget = nextAlive;

    const result = advanceTurn(this.turnSeq, this.turnIdx, this.party);
    if (!result) return this.showDefeat();
    this.turnIdx = result.index;
    this.currentTurn = result.turn;

    // Only tick cooldowns/rally on hero turns (not enemy turns)
    if (this.currentTurn.who === 'hero') {
      this.tickAbilityCooldowns();
      if (this.rallyTurns > 0) this.rallyTurns--;
    }

    // Signature: reset per-turn flags
    onTurnStart(this.party, this.signatureState);

    this.updateHeroIndicators();

    // Skip hero turn if consumed by a combo attack
    if (this.currentTurn.who === 'hero' && this.comboSkipHeroIndex === this.currentTurn.heroIndex) {
      this.comboSkipHeroIndex = -1;
      this.time.delayedCall(50, () => this.nextTurn());
      return;
    }

    if (this.currentTurn.who === 'hero') this.startHeroTurn();
    else this.startEnemyTurn();
  }

  startHeroTurn() {
    const hero = this.party[this.currentTurn.heroIndex];
    this.phase = 'command';
    this.locked = false;
    this.selectedCommand = null;
    this._availableCombo = null;
    this.refreshPotionButton();
    this.refreshAbilityButton();
    this.updateSuperButton();

    if (shouldShowTutorial('FIRST_BATTLE')) {
      markTutorialShown('FIRST_BATTLE');
      this.showToast(getTutorialText('FIRST_BATTLE'), COLORS_CSS.goldL);
    }

    // Clear guard from previous round
    this.guardActive[this.currentTurn.heroIndex] = false;

    // Show command menu filtered by hero class, hide answer buttons
    const heroCmds = getClassCommands(hero.class || 'knight', this.grade);
    this.setCommandMenuForClass(heroCmds);

    // Check for available combo attacks (bond B+ rank, both heroes alive, once per battle)
    if (!this.comboUsedThisBattle) {
      const partyHeroIds = this.party.map(h => h.id);
      const combos = getAvailableCombos(this.save, partyHeroIds);
      for (const combo of combos) {
        const [h1Id, h2Id] = combo.heroes;
        const h1 = this.party.find(h => h && h.id === h1Id && h.hp > 0);
        const h2 = this.party.find(h => h && h.id === h2Id && h.hp > 0);
        if (h1 && h2) {
          this._availableCombo = { ...combo, hero1: h1, hero2: h2 };
          this.addComboButton();
          // First-time explainer — combos are powerful but hidden otherwise
          const tipKey = 'mw_combo_tip_shown';
          let tipShown = false;
          try { tipShown = !!localStorage.getItem(tipKey); } catch (e) { /* ignore */ }
          if (!tipShown) {
            try { localStorage.setItem(tipKey, '1'); } catch (e) { /* ignore */ }
            this.showFirstTimeTip(
              `${h1.name} & ${h2.name} are best friends now!\nTap the gold COMBO button for a team move!`
            );
          }
          break; // only show one combo at a time
        }
      }
    }

    this.setAnswerButtonsVisible(false);
    this.turnLabel.setText(`${hero.name}'s turn — choose a command!`);

    // Clear any stale equation text
    if (this.eqLines) {
      this.eqLines.a.setText('');
      this.eqLines.opB.setText('');
      this.eqLines.ans.setText('');
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

  // --- Colorblind accessibility shapes on answer buttons ---
  drawColorblindShapes() {
    const { w, h, y, startX, gap } = this.answerBtnLayout;
    // Shapes: circle (blue), square (red), triangle (green), diamond (purple)
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (w + gap);
      const shapeX = x + w / 2 - 18;
      const shapeY = y - h / 2 + 18;
      const g = this.add.graphics();
      g.lineStyle(2.5, 0xffffff, 0.85);
      if (i === 0) {
        // Circle
        g.strokeCircle(shapeX, shapeY, 8);
      } else if (i === 1) {
        // Square
        g.strokeRect(shapeX - 8, shapeY - 8, 16, 16);
      } else if (i === 2) {
        // Triangle
        g.beginPath();
        g.moveTo(shapeX, shapeY - 9);
        g.lineTo(shapeX - 9, shapeY + 7);
        g.lineTo(shapeX + 9, shapeY + 7);
        g.closePath();
        g.strokePath();
      } else if (i === 3) {
        // Diamond
        g.beginPath();
        g.moveTo(shapeX, shapeY - 10);
        g.lineTo(shapeX + 8, shapeY);
        g.lineTo(shapeX, shapeY + 10);
        g.lineTo(shapeX - 8, shapeY);
        g.closePath();
        g.strokePath();
      }
    }
  }

  // --- Colorblind momentum bar pattern overlays ---
  drawColorblindMomentumPatterns(barX, topY, barW) {
    const barH = 16;
    const g = this.add.graphics();
    g.setDepth(10);

    // ZONE section (0.33 - 0.66): tiny dots
    const zoneStart = barX + barW * 0.33;
    const zoneEnd = barX + barW * 0.66;
    for (let dx = zoneStart + 4; dx < zoneEnd; dx += 8) {
      for (let dy = topY - barH / 2 + 3; dy < topY + barH / 2; dy += 6) {
        g.fillStyle(0xffffff, 0.45);
        g.fillCircle(dx, dy, 1.5);
      }
    }

    // HEAT section (0.66 - 1.0): diagonal lines
    const heatStart = barX + barW * 0.66;
    const heatEnd = barX + barW;
    g.lineStyle(1, 0xffffff, 0.4);
    for (let dx = heatStart; dx < heatEnd + barH; dx += 6) {
      g.beginPath();
      g.moveTo(Math.max(dx, heatStart), topY - barH / 2);
      g.lineTo(Math.max(dx - barH, heatStart), topY + barH / 2);
      g.strokePath();
    }
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

    if (q.format === 'missing') {
      this.eqLines.a.setText(`  ?`);
      this.eqLines.opB.setText(`${opSym} ${q.b}`);
      this.eqLines.bar.setText('\u2500'.repeat(Math.max(3, String(Math.max(q.fullAnswer, q.b)).length + 2)));
      this.eqLines.ans.setText(String(q.fullAnswer));
    } else {
      this.eqLines.a.setText(`  ${q.a}`);
      this.eqLines.opB.setText(`${opSym} ${q.b}`);
      this.eqLines.bar.setText('\u2500'.repeat(Math.max(3, String(Math.max(q.a, q.b)).length + 2)));
      this.eqLines.ans.setText('?');
    }

    // Star rating on equation panel
    if (this.eqLines.stars && q.stars) {
      this.eqLines.stars.setText('\u2605'.repeat(q.stars) + '\u2606'.repeat(5 - q.stars));
    }
  }

  clearEquationDisplay() {
    if (!this.eqLines) return;
    this.eqLines.a.setText('');
    this.eqLines.opB.setText('');
    this.eqLines.bar.setText('');
    this.eqLines.ans.setText('');
    if (this.eqLines.stars) this.eqLines.stars.setText('');
  }

  startEnemyTurn() {
    const aliveEnemies = this.enemies.filter(e => e.hp > 0);
    const attackerNames = aliveEnemies.map(e => e.name).join(' & ');
    this.turnLabel.setText(`${attackerNames} attack${aliveEnemies.length > 1 ? '' : 's'}!`);
    this.clearEquationDisplay();
    this.phase = 'enemy';
    this.locked = true;
    this.refreshPotionButton();
    this.hideAbilityButton();

    for (let i = 0; i < 4; i++) {
      this.recolorAnswerButton(i, this.answerButtons[i].baseColor, 0.3);
      this.answerButtons[i].label.setText('');
    }

    // --- Signature: poison/burn ticks at start of enemy turn ---
    const dotTicks = onEnemyTurnStart(this.enemies, this.party, this.signatureState);
    let dotDelay = 0;
    for (const tick of dotTicks) {
      const ei = tick.enemyIndex;
      if (!this.enemies[ei] || this.enemies[ei].hp <= 0) continue;
      this.time.delayedCall(dotDelay, () => {
        const enemy = this.enemies[ei];
        if (!enemy || enemy.hp <= 0) return;
        const sprite = this.enemySprites[ei];
        enemy.hp = Math.max(0, enemy.hp - tick.damage);
        this.updateEnemyHp(ei);
        const color = tick.type === 'poison' ? '#80ff40' : '#ff8040';
        const label = tick.type === 'poison' ? 'POISON' : 'BURN';
        if (sprite) {
          this.floatDamageNumber(sprite.x, sprite.y - 100, tick.damage, color, '-');
        }
        if (enemy.hp <= 0 && sprite) {
          this.tweens.add({ targets: sprite.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 400, ease: 'Back.in' });
          if (sprite.name) this.tweens.add({ targets: sprite.name, alpha: 0, duration: 400 });
          if (sprite.hpBarBg) this.tweens.add({ targets: sprite.hpBarBg, alpha: 0, duration: 400 });
          if (sprite.hpBarFill) this.tweens.add({ targets: sprite.hpBarFill, alpha: 0, duration: 400 });
          if (sprite.hpText) this.tweens.add({ targets: sprite.hpText, alpha: 0, duration: 300 });
        }
      });
      dotDelay += 200;
    }

    // Check if DOTs killed all enemies
    if (dotTicks.length > 0) {
      this.time.delayedCall(dotDelay + 100, () => {
        if (this.allEnemiesDead()) {
          this.showVictory();
          return;
        }
        this._doEnemyAttacks();
      });
      return;
    }

    this._doEnemyAttacks();
  }

  /** Internal: execute the enemy attack sequence after DOT ticks. */
  _doEnemyAttacks() {
    const aliveEnemies = this.enemies.filter(e => e.hp > 0);

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
        const targetHeroIdx = this.party.indexOf(target);

        // --- Signature: Paladin guard block ---
        if (targetHeroIdx >= 0 && consumePaladinGuard(targetHeroIdx, this.signatureState)) {
          const paladin = this.party.find(h => h && h.hp > 0 && h.signature && h.signature.effect === 'guardAlly');
          this.showToast(`${paladin ? paladin.name : 'Paladin'} blocks for ${target.name}!`, '#60a0ff');
          audio.play('battle/hit-hero');
          this.time.delayedCall(300, () => doEnemyAttack(enemyIdx + 1));
          return;
        }

        // Bunny dodge — base 30% chance, Dodge Roll ability raises to 60%
        const dodgeChance = (cls === 'bunny') ? (this.dodgeActive ? 0.6 : 0.3) : 0;
        if (dodgeChance > 0 && Math.random() < dodgeChance) {
          if (this.dodgeActive) {
            this.dodgeActive = false;
            this.showToast(`${target.name} DODGE ROLL!`, '#e86898');
          } else {
            this.showToast(`${target.name} DODGES!`, '#e86898');
          }
          audio.play('battle/hit-hero');
          this.time.delayedCall(300, () => doEnemyAttack(enemyIdx + 1));
          return;
        }

        let result = computeEnemyDamage(attacker, target, { momentum: this.momentum });

        // --- Signature: apply incoming damage modifiers (Crusader aura, Boulder doubleDef) ---
        const sigResult = onHeroDamageReceived(target, attacker, result.modifiedDamage, {
          party: this.party,
          battleState: this.signatureState,
          heroIndex: targetHeroIdx,
        });
        if (sigResult.damage !== result.modifiedDamage) {
          result.modifiedDamage = sigResult.damage;
          result.newHp = Math.max(0, target.hp - result.modifiedDamage);
        }

        // Guard reduction — lasts the FULL enemy round (not consumed per hit)
        if (targetHeroIdx >= 0 && this.guardActive[targetHeroIdx]) {
          result = applyGuardReduction(result, target.hp);
          this.showToast(`${target.name} GUARDS! Half damage!`, '#48a848');
        } else if (this.shieldBashActive && targetHeroIdx >= 0) {
          // Shield Bash ability — block 50% of next attack
          result.modifiedDamage = Math.max(1, Math.ceil(result.modifiedDamage * 0.5));
          result.newHp = Math.max(0, target.hp - result.modifiedDamage);
          this.shieldBashActive = false;
          this.showToast(`${target.name} SHIELD BASH! Half damage!`, '#5a7ab8');
        } else if (cls === 'knight' && Math.random() < 0.4) {
          result.modifiedDamage = Math.max(1, Math.round(result.modifiedDamage / 2));
          result.newHp = Math.max(0, target.hp - result.modifiedDamage);
          this.showToast(`${target.name} BLOCKS! Half damage!`, '#5a7ab8');
        }

        applyDamageResult(target, result);
        if (result.modifiedDamage > 0) this.battleDamageTaken = true;

        // --- Signature: lastStand check (Great Helm) ---
        if (target.hp <= 0 && checkLastStand(target, targetHeroIdx, this.signatureState)) {
          this.showToast(`${target.name}: LAST STAND!`, '#f0d040');
        }

        // --- Signature: Paladin guardAlly trigger (check low HP) ---
        if (target.hp > 0) {
          checkPaladinGuard(target, targetHeroIdx, this.party, this.signatureState);
        }

        // --- Battle cry: lowHp ---
        if (target.hp > 0 && target.hp <= target.maxHp * 0.25) {
          this.showBattleCry(target, 'lowHp');
        }

        this.hitFlash();
        this.flashHero(target, result);
        this.updateHeroHp(target);
        this.shakeCamera(0.01, 250);
        audio.play('battle/hit-hero');

        this.time.delayedCall(300, () => doEnemyAttack(enemyIdx + 1));
      });
    };

    doEnemyAttack(0);

    // Clear guard flags at END of enemy phase (guard lasts full round)
    this.time.delayedCall(aliveEnemies.length * 650 + 100, () => {
      this.guardActive.fill(false);
    });
  }

  // ================================================================
  // ANSWER HANDLING
  // ================================================================

  onAnswer(index) {
    if (this.phase !== 'question' || !this.currentQuestion) return;
    if (this._answerProcessing) return;
    this._answerProcessing = true;
    this._counterAttackDefeated = false;
    this.locked = true;
    this.clearBossTimer();
    hidePanelFx(this.panelFx);

    // Clean up signature UI elements
    if (this._revealWrongMark) { this._revealWrongMark.destroy(); this._revealWrongMark = null; }
    if (this._timerBonusLabel) { this._timerBonusLabel.destroy(); this._timerBonusLabel = null; }

    // Freeze command for this answer — prevents race conditions
    const activeCommand = this.selectedCommand || COMMANDS.FIGHT;

    const correct = index === this.currentQuestion.correctIndex;
    const btn = this.answerButtons[index];

    // Phase 2.1: Record answer for spaced repetition & adaptive difficulty
    recordAnswer(correct);
    recordSkillAnswer(this.save, this.currentQuestion?.op, correct);

    if (correct) {
      this.recolorAnswerButton(index, 0x40c040, 1);
      audio.play('battle/correct');
      updateQuestProgress(this.save, 'correct');

      this.streak++;
      this.battleCorrect++;
      this.momentum = advanceMomentum(this.momentum, true, this.streak);
      this.updateMomentumBar();

      const heroIdx = this.currentTurn.heroIndex;
      this.heroStreaks[heroIdx] = (this.heroStreaks[heroIdx] || 0) + 1;
      if (this.heroStreaks[heroIdx] >= 3 && !this.superReady[heroIdx]) {
        this.superReady[heroIdx] = true;
        const hero = this.party[heroIdx];
        this.showToast(`${hero.name}: SUPER READY!`, '#f0c040');
        this.updateSuperButton();
      }

      const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
      const btnObj = this.answerButtons[index];
      const rm = this.reducedMotion;
      if (this.momentum >= 1.0) {
        this.showToast('TEAM ATTACK READY!', '#f0d040');
      } else if (this.streak >= 8) {
        streakBanner(this, this.streak, area.cx, area.cy);
        if (!rm) screenEdgeGlow(this, 0xff4040, 500);
      } else if (this.streak >= 5) {
        streakBanner(this, this.streak, area.cx, area.cy);
        if (!rm) screenEdgeGlow(this, 0xf0a020, 400);
      } else if (this.streak >= 3) {
        streakBanner(this, this.streak, area.cx, area.cy);
        if (!rm) screenEdgeGlow(this, 0x40c040, 300);
      } else if (this.momentum > 0.66) {
        this.showToast('GREAT!', COLORS_CSS.goldL);
        if (!rm) confettiBurst(this, btnObj?.label?.x || area.cx, btnObj?.label?.y || area.cy, 12);
      } else {
        this.showToast('CORRECT!', '#40c040');
        if (!rm) confettiBurst(this, btnObj?.label?.x || area.cx, btnObj?.label?.y || area.cy, 8);
      }

      // Combo attack: intercept before normal damage path
      if (activeCommand === '_COMBO_' && this._comboData) {
        this.applyComboAttack();
        return;
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

      const hero = this.party[heroIdx];
      const cls = hero.class || 'knight';

      // Bunny MAGIC = heal (not attack)
      if (cls === 'bunny' && activeCommand === COMMANDS.MAGIC) {
        const stars = this.currentQuestion.stars ?? rateQuestion(this.currentQuestion, this.grade);
        const healAmt = Math.max(8, Math.round((hero.atk || 10) * getDifficultyMultiplier(stars) * 1.2));
        const alive = this.party.filter(h => h.hp > 0);
        const target = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        if (target) {
          const before = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + healAmt);
          const healed = target.hp - before;
          if (healed > 0) {
            this.showToast(`${target.name} healed ${healed} HP!`, '#60ff60');
            this.updateAllHeroHp();
            const hs = this.heroSprites.find(s => s.hero === target);
            if (hs) {
              const floatText = this.add.text(hs.x, hs.y - 40, `+${healed}`, {
                fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
                fontSize: '28px', color: '#60ff60',
                stroke: '#1a0e04', strokeThickness: 4,
              }).setOrigin(0.5).setDepth(30);
              this.tweens.add({ targets: floatText, y: hs.y - 100, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => floatText.destroy() });
              for (let i = 0; i < 10; i++) {
                const px = hs.x + (Math.random() - 0.5) * 60;
                const py = hs.y + 20;
                const sp = this.add.circle(px, py, 3 + Math.random() * 3, 0x60ff60, 0.7).setDepth(30);
                this.tweens.add({ targets: sp, y: py - 60 - Math.random() * 40, alpha: 0, duration: 600 + Math.random() * 400, ease: 'Sine.out', onComplete: () => sp.destroy() });
              }
            }
          } else {
            this.showToast(`${target.name} is at full HP!`, '#80c0ff');
          }
        }
        const advanceDelay = 750;
        this.time.delayedCall(advanceDelay, () => {
          this._answerProcessing = false;
          this.nextTurn();
        });
        return;
      }

      // Difficulty-rated damage: stars drive damage, not answer magnitude
      const stars = this.currentQuestion.stars ?? rateQuestion(this.currentQuestion, this.grade);
      const diffMult = getDifficultyMultiplier(stars);
      const cmdConfig = getCommandConfig(activeCommand);
      const cmdMult = cmdConfig.damageMult;

      // Rally ability: +2 ATK for 3 turns (applied temporarily)
      let atkBonus = 0;
      if (this.rallyTurns > 0) atkBonus = 2;
      // Signature: effective ATK includes rageAtk (Berserker) + leaderAura (Duchess)
      const sigAtk = getEffectiveAtk(hero, this.party);
      const effectiveHero = { ...hero, atk: sigAtk + atkBonus };

      // Class-specific modifiers
      let classMult = 1;
      let hitCount = 1;
      if (cls === 'knight') {
        classMult = 1.3;
      } else if (cls === 'wizard') {
        if (this.streak >= 5) {
          const weakest = this.party.filter(h => h.hp > 0).sort((a, b) => a.hp - b.hp)[0];
          if (weakest) {
            weakest.hp = Math.min(weakest.maxHp, weakest.hp + 10);
            this.showToast(`${weakest.name} healed 10 HP!`, '#60ff60');
            this.updateAllHeroHp();
          }
        }
        classMult = this.streak >= 3 ? 1.5 : 1.0;
      } else if (cls === 'bunny') {
        hitCount = 2 + (this.streak >= 4 ? 1 : 0);
        classMult = 1.0 / hitCount * 1.2;
      }

      if (this.streak === 8) {
        this.showToast('ON FIRE!', COLORS_CSS.goldL);
      }

      // Damage formula: base × difficulty × command × momentum, then class modifier
      const commandResult = computeCommandDamage(effectiveHero, targetEnemy, {
        momentum: this.momentum,
        streak: this.streak,
        difficultyMult: diffMult,
        commandMult: cmdMult,
      });
      const baseDmg = commandResult.modifiedDamage;
      const totalDmg = Math.max(3, Math.round(baseDmg * classMult));

      // --- Signature: modify outgoing damage (hybridDamage, firstStrike, hardBonus) ---
      const sigDmg = onHeroDamageDealt(hero, targetEnemy, totalDmg, {
        party: this.party,
        battleState: this.signatureState,
        command: activeCommand,
        streak: this.streak,
        questionStars: stars,
      });

      let abilityDmg = sigDmg;
      if (this.manaSurgeActive) {
        abilityDmg = Math.round(abilityDmg * 2);
        this.manaSurgeActive = false;
        this.showBattleCry(hero, 'superMove');
      }
      if (this.furyCharges > 0) {
        abilityDmg = Math.round(abilityDmg * 1.5);
        this.furyCharges--;
      }

      // Critical hit: 10% chance on hard (4-5 star) questions. 2x damage,
      // warm screen bloom, extra shake — a rare, special moment.
      if (stars >= 4 && Math.random() < 0.10) {
        abilityDmg = Math.round(abilityDmg * 2);
        const critText = this.add.text(area.cx, area.cy - 120, 'CRITICAL!', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '52px', color: '#ffd040',
          stroke: '#a02000', strokeThickness: 7,
        }).setOrigin(0.5).setScale(0.4).setDepth(60);
        this.tweens.add({
          targets: critText, scale: 1.2, duration: 180, ease: 'Back.out',
          onComplete: () => this.tweens.add({
            targets: critText, alpha: 0, y: critText.y - 30, duration: 500, delay: 500,
            onComplete: () => critText.destroy(),
          }),
        });
        // Screen bloom — brief warm overlay (skipped in reduced motion)
        if (!this.reducedMotion) {
          const bloom = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffc040, 0.18).setDepth(59);
          this.tweens.add({ targets: bloom, alpha: 0, duration: 300, onComplete: () => bloom.destroy() });
        }
        this.shakeCamera(0.02, 300);
        navigator.vibrate?.(80);
      }
      const modified = hitCount > 1 ? Math.max(3, Math.round(abilityDmg / hitCount)) * hitCount : abilityDmg;
      const newHp = Math.max(0, targetEnemy.hp - modified);
      const result = {
        baseDamage: commandResult.baseDamage,
        modifiedDamage: modified,
        newHp,
        killed: newHp === 0 && targetEnemy.hp > 0,
        hitCount,
        cls,
      };
      applyDamageResult(targetEnemy, result);

      // --- Signature: Blaze burn on attack ---
      applyBurnOnAttack(hero, targetIdx, this.signatureState);

      // --- Signature: Nova splash streak ---
      const splashes = getSplashDamage(hero, targetIdx, modified, this.enemies, this.streak);
      for (const splash of splashes) {
        const se = this.enemies[splash.enemyIndex];
        if (se && se.hp > 0) {
          se.hp = Math.max(0, se.hp - splash.damage);
          this.updateEnemyHp(splash.enemyIndex);
          const ss = this.enemySprites[splash.enemyIndex];
          if (ss) this.floatDamageNumber(ss.x, ss.y - 80, splash.damage, '#f080ff', '-');
        }
      }

      // --- Battle cry: correct answer ---
      this.showBattleCry(hero, 'correctAnswer');


      // Boss story beats: HP thresholds, with a question-count fallback so
      // fast battles (supers/crits skipping past thresholds) still get them.
      this._bossQuestionCount = (this._bossQuestionCount || 0) + 1;
      const halfDue = targetEnemy.hp <= targetEnemy.maxHp / 2 || this._bossQuestionCount >= 8;
      const quarterDue = targetEnemy.hp <= targetEnemy.maxHp / 4 || this._bossQuestionCount >= 14;

      if (this.isBoss && !this.bossHalfHpShown && targetEnemy.hp > 0 && halfDue) {
        this.bossHalfHpShown = true;
        const halfKey = `floor${this.floor}_boss_half`;
        const halfDialogue = DIALOGUE[halfKey];
        if (halfDialogue && halfDialogue.length > 0) {
          this.showToast(halfDialogue[0].text, COLORS_CSS.goldL);
        }
      }

      // Boss quarter-HP story beat (or question-count fallback)
      if (this.isBoss && this.bossHalfHpShown && !this.bossQuarterHpShown && targetEnemy.hp > 0 && quarterDue) {
        this.bossQuarterHpShown = true;
        const qKey = `floor${this.floor}_boss_quarter`;
        const qDialogue = DIALOGUE[qKey];
        if (qDialogue && qDialogue.length > 0) {
          this.showToast(qDialogue[0].text, COLORS_CSS.goldL);
        }
      }

      // Check for kill IMMEDIATELY — don't wait for animations
      if (targetEnemy.hp <= 0) {
        this.hitFlash();
        this.flashEnemy(result, targetIdx);
        this.updateEnemyHp(targetIdx);
        this.burstParticles(targetSprite.x, targetSprite.y, 0xe8a030);
        this.shakeCamera(0.012, 300);
        // Fade out the killed enemy sprite
        this.tweens.add({ targets: targetSprite.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 400, ease: 'Back.in' });
        if (targetSprite.name) this.tweens.add({ targets: targetSprite.name, alpha: 0, duration: 400 });
        if (targetSprite.hpBarBg) this.tweens.add({ targets: targetSprite.hpBarBg, alpha: 0, duration: 400 });
        if (targetSprite.hpBarFill) this.tweens.add({ targets: targetSprite.hpBarFill, alpha: 0, duration: 400 });
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
      } else if (activeCommand === COMMANDS.MAGIC) {
        // MAGIC: spectacular animation (900ms) via the new animation system
        const heroSprite = this.heroSprites[this.currentTurn.heroIndex];
        const op = this.currentQuestion?.op || '+';
        // Trigger body-part attack animation
        if (heroSprite.body && heroSprite.body.playAttack) {
          heroSprite.body.playAttack('magic');
        }
        playMagicAnimation(this, heroSprite, targetSprite, cls, op, result, {
          onHit: () => {
            this.hitFlash();
            this.flashEnemy(result, targetIdx);
            this.updateEnemyHp(targetIdx);
            this.shakeCamera(0.018, 400);
            audio.play('battle/hit-enemy');
          },
        });
      } else {
        // FIGHT: class-specific attack animation via the animation system
        const heroSprite = this.heroSprites[this.currentTurn.heroIndex];
        const op = this.currentQuestion?.op || '+';
        // Trigger body-part attack animation based on class
        if (heroSprite.body && heroSprite.body.playAttack) {
          const attackType = cls === 'wizard' ? 'magic' : cls === 'bunny' ? 'punch' : 'slash';
          heroSprite.body.playAttack(attackType);
        }
        playFightAnimation(this, heroSprite, targetSprite, cls, op, result, {
          onHit: () => {
            this.hitFlash();
            this.flashEnemy(result, targetIdx);
            this.updateEnemyHp(targetIdx);
            audio.play('battle/hit-enemy');
          },
        });
      }
    } else {
      this.recolorAnswerButton(index, 0xc04040, 1);
      this.recolorAnswerButton(this.currentQuestion.correctIndex, 0x40c040, 1);

      this.streak = 0;
      const heroIdx = this.currentTurn.heroIndex;
      this.heroStreaks[heroIdx] = 0;
      this.superReady[heroIdx] = false;
      this.updateSuperButton();
      this.battleWrong++;
      this.momentum = advanceMomentum(this.momentum, false);
      this.updateMomentumBar(true);

      // --- Battle cry: wrong answer ---
      this.showBattleCry(this.party[heroIdx], 'wrongAnswer');

      if (activeCommand === COMMANDS.MAGIC) {
        // MAGIC FIZZLE: no damage dealt, NO counter-attack. Safe failure.
        audio.play('battle/wrong');
        this.showToast('Fizzle!', '#b080e0');
        const hs = this.heroSprites[this.currentTurn.heroIndex];
        if (hs) playFizzleAnimation(this, hs);
        this.showHintButton(this.currentQuestion);
      } else {
        // FIGHT wrong: normal counter-attack
        audio.play('battle/wrong');
        if (shouldShowTutorial('FIRST_WRONG')) {
          markTutorialShown('FIRST_WRONG');
          this.showToast(getTutorialText('FIRST_WRONG'), COLORS_CSS.goldL);
        } else {
          this.showToast('Try again!', COLORS_CSS.scarletL);
        }

        const wrongTargetEnemy = this.enemies[this.currentTarget] || this.enemy;
        invokeAbility(wrongTargetEnemy.ability, 'onHeroWrong', {
          enemy: wrongTargetEnemy,
          party: this.party,
          scene: this,
          activeHero: this.party[this.currentTurn.heroIndex],
        });

        this.time.delayedCall(300, () => {
          if (this._shuttingDown || this.phase === 'end') return;
          const heroIdx = this.currentTurn.heroIndex;
          const target = this.party[heroIdx];
          const counterEnemy = this.enemies[this.currentTarget] || this.enemy;
          let result = computeEnemyDamage(counterEnemy, target, { momentum: this.momentum });
          if (this.guardActive[heroIdx]) {
            result = applyGuardReduction(result, target.hp);
          }
          const sigResult = onHeroDamageReceived(target, counterEnemy, result.modifiedDamage, {
            party: this.party,
            battleState: this.signatureState,
            heroIndex: heroIdx,
          });
          if (sigResult.damage !== result.modifiedDamage) {
            result.modifiedDamage = sigResult.damage;
            result.newHp = Math.max(0, target.hp - result.modifiedDamage);
          }
          applyDamageResult(target, result);
          checkLastStand(target, heroIdx, this.signatureState);
          checkPaladinGuard(target, heroIdx, this.party, this.signatureState);
          if (result.modifiedDamage > 0) this.battleDamageTaken = true;
          this.hitFlash();
          this.flashHero(target, result);
          this.updateHeroHp(target);
          this.shakeCamera(0.01, 250);
          audio.play('battle/hit-hero');
          if (isPartyDefeated(this.party)) {
            this._counterAttackDefeated = true;
            this.time.delayedCall(600, () => this.showDefeat());
          }
        });

        this.showHintButton(this.currentQuestion);
      }
    }

    // Snappy turn advance — MAGIC gets longer (spectacular animation is 900ms)
    const advanceDelay = activeCommand === COMMANDS.MAGIC ? 950 : 750;
    this.time.delayedCall(advanceDelay, () => {
      this._answerProcessing = false;
      // Don't advance if the counter-attack already triggered defeat,
      // if we're already at end phase, or if the scene is shutting down.
      if (this._counterAttackDefeated || this.phase === 'end' || this._shuttingDown) return;
      this.nextTurn();
    });

    // Safety net: if locked is still true after 10 seconds, force-unlock.
    // This catches any remaining edge case where a timer or callback was
    // killed, an exception was swallowed, or a race condition left the
    // game in a non-interactive state.
    this.time.delayedCall(10000, () => {
      if (this.locked && this.phase !== 'end' && !this._shuttingDown) {
        console.warn('[BattleScene] Safety net: force-unlocking after 10s');
        this.locked = false;
        this._answerProcessing = false;
        this._counterAttackDefeated = false;
        if (this.phase === 'question') {
          this.nextTurn();
        }
      }
    });
  }

  // ================================================================
  // POTION
  // ================================================================

  refreshPotionButton() {
    if (!this.potionLabel) return;
    const count = this.save.potions || 0;
    this.potionLabel.setText(`POTION ${count}`);
    const canUse = count > 0 && (this.phase === 'question' || this.phase === 'command');
    if (this.potionBtn && this.potionBtn.bg) {
      const alpha = canUse ? 1 : 0.5;
      this.potionBtn.bg.setAlpha(alpha);
      this.potionBtn.shadow.setAlpha(alpha * 0.7);
      this.potionBtn.label.setAlpha(alpha);
    }
  }

  usePotion() {
    if ((this.phase !== 'question' && this.phase !== 'command') || this.locked) return;
    this.potionUsedThisBattle = true;

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
    writeSave(this.save, this.slot);

    audio.play('battle/heal');
    this.showToast(`+${actualHealed} HP`, COLORS_CSS.greenL);
    this.floatDamageNumber(
      this.heroSprites[this.party.indexOf(activeHero)].x,
      this.heroSprites[this.party.indexOf(activeHero)].y - 80,
      actualHealed,
      '#40ff60',
      '+',
    );
    this.updateHeroHp(activeHero);
    this.refreshPotionButton();

    // Using a potion costs your turn — skip straight to the enemy's
    this.locked = true;
    this.time.delayedCall(600, () => this.nextTurn());
  }

  // ================================================================
  // HERO ABILITIES (Phase 3.1)
  // ================================================================

  refreshAbilityButton() {
    if (!this.abilityBtn) return;
    const heroIdx = this.currentTurn?.heroIndex ?? 0;
    const hero = this.party[heroIdx];
    if (!hero || hero.hp <= 0) {
      this.hideAbilityButton();
      return;
    }
    const cls = hero.class || 'knight';
    const abilities = getAbilitiesForClass(cls);
    const cd = this.abilityCooldowns[heroIdx]?.cd ?? 0;
    const canUse = this.phase === 'question' && !this.locked && cd <= 0 && abilities.length > 0;
    // Pick the first ability for the button label
    const ability = abilities[0];
    const label = ability ? ability.name : 'ABILITY';
    const show = canUse;
    this.abilityBtn.bg.setVisible(show);
    this.abilityBtn.shadow.setVisible(show);
    this.abilityBtn.label.setVisible(show);
    if (this.abilityBtn.zone) this.abilityBtn.zone.setVisible(show);
    this.abilityBtn.label.setText(show ? label : 'ABILITY');
  }

  hideAbilityButton() {
    if (!this.abilityBtn) return;
    this.abilityBtn.bg.setVisible(false);
    this.abilityBtn.shadow.setVisible(false);
    this.abilityBtn.label.setVisible(false);
    if (this.abilityBtn.zone) this.abilityBtn.zone.setVisible(false);
  }

  useAbility() {
    if (this.phase !== 'question' || this.locked) return;
    const heroIdx = this.currentTurn?.heroIndex ?? 0;
    const hero = this.party[heroIdx];
    if (!hero || hero.hp <= 0) return;
    const cd = this.abilityCooldowns[heroIdx]?.cd ?? 0;
    if (cd > 0) {
      this.showToast('Ability on cooldown!', COLORS_CSS.scarletL);
      return;
    }
    const cls = hero.class || 'knight';
    const abilities = getAbilitiesForClass(cls);
    if (abilities.length === 0) return;
    const ability = abilities[0];

    this.locked = true;
    this.abilityCooldowns[heroIdx].cd = ability.cooldown;
    audio.play('ui/confirm');

    switch (ability.id) {
      case 'shield_bash':
        this.shieldBashActive = true;
        this.showToast(`${hero.name}: Shield Bash!`, '#5a7ab8');
        break;
      case 'rally':
        this.rallyTurns = 3;
        this.showToast(`${hero.name}: Rally! +2 ATK for 3 turns`, '#f0d040');
        break;
      case 'arcane_heal': {
        const living = this.party.filter(h => h && h.hp > 0);
        const weakest = living.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        if (weakest) {
          const before = weakest.hp;
          weakest.hp = Math.min(weakest.maxHp, weakest.hp + 20);
          const healed = weakest.hp - before;
          this.showToast(`${hero.name} heals ${weakest.name} +${healed} HP!`, '#60ff60');
          const idx = this.party.indexOf(weakest);
          if (idx >= 0 && this.heroSprites[idx]) {
            this.floatDamageNumber(this.heroSprites[idx].x, this.heroSprites[idx].y - 80, healed, '#40ff60', '+');
          }
          this.updateAllHeroHp();
        }
        break;
      }
      case 'mana_surge':
        this.manaSurgeActive = true;
        this.showToast(`${hero.name}: Mana Surge! Next answer deals 2x!`, '#c090f0');
        // Does not consume turn — re-enable answering
        this.locked = false;
        this.hideAbilityButton();
        this.time.delayedCall(100, () => this.refreshAbilityButton());
        return; // don't advance turn
      case 'dodge_roll':
        this.dodgeActive = true;
        this.showToast(`${hero.name}: Dodge Roll! 60% dodge chance`, '#e86898');
        break;
      case 'fury_combo':
        this.furyCharges = 2;
        this.showToast(`${hero.name}: Fury Combo! Next 2 hits at 1.5x`, '#e86898');
        // Does not consume turn — re-enable answering
        this.locked = false;
        this.hideAbilityButton();
        this.time.delayedCall(100, () => this.refreshAbilityButton());
        return; // don't advance turn
      default:
        break;
    }

    this.hideAbilityButton();
    // Ability consumes the turn (except Mana Surge and Fury Combo handled above)
    this.time.delayedCall(600, () => this.nextTurn());
  }

  /** Decrement all hero ability cooldowns — called once per full turn cycle */
  tickAbilityCooldowns() {
    for (let i = 0; i < this.abilityCooldowns.length; i++) {
      if (this.abilityCooldowns[i].cd > 0) {
        this.abilityCooldowns[i].cd--;
      }
    }
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
    // Gold floating damage number for hero damage dealt to enemy
    this.floatDamageNumber(s.x, s.y - 100, result.modifiedDamage, '#f0c040', '+');
    // Flash enemy HP bar red before updating
    this.flashHpBar(s.hpBarFill, 0xff0000);
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
    // Red floating damage number for enemy damage dealt to hero
    this.floatDamageNumber(s.x, s.y - 80, result.modifiedDamage, '#ff6060', '-');
    this.burstParticles(s.x, s.y - 30, 0xc03030);
    // Flash hero HP bar red before updating
    this.flashHpBar(s.hpBarFill, 0xff0000);
  }

  /**
   * Flash an HP bar fill red for 100ms before the actual value is set.
   * Gives a brief visual pulse so the player sees damage registration.
   */
  flashHpBar(barFill, flashColor) {
    if (!barFill) return;
    const origColor = barFill.fillColor;
    barFill.setFillStyle(flashColor);
    this.time.delayedCall(100, () => {
      if (barFill && barFill.scene) {
        barFill.setFillStyle(origColor);
      }
    });
  }

  /**
   * Arcing damage number: pops up with a slight horizontal drift,
   * scales up then fades. More satisfying than a straight float.
   *
   * @param {string} prefix  '+' for hero damage (gold), '-' for enemy damage (red)
   */
  floatDamageNumber(x, y, amount, color, prefix = '-') {
    const t = this.add.text(x, y, `${prefix}${amount}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScale(0.5);

    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      scale: 1.2,
      duration: 800,
      ease: 'Cubic.out',
      onComplete: () => t.destroy(),
    });
  }

  shakeCamera(intensity = 0.008, duration = 200) {
    if (this.reducedMotion) return;
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
    const fullW = 200 + 20 - 4; // matches buildEnemySprite
    this.tweens.add({
      targets: sprite.hpBarFill,
      width: fullW * pct,
      duration: 300,
      ease: 'Cubic.out',
    });
    sprite.hpText.setText(`${enemy.hp}/${enemy.maxHp}`);
  }

  updateMomentumBar(justWrong = false) {
    const zone = getZone(this.momentum);
    this.momentumLabel.setText(zone.label);
    let fillColor = 0x4aa848; // ZONE (green)
    if (zone.label === 'COOL') fillColor = 0x4080c0;
    else if (zone.label === 'HEAT') fillColor = 0xd06020;
    if (this.momentumBarObj) {
      updatePaperBar(this.momentumBarObj, this.momentum, fillColor);
    }
    // Environmental responsiveness
    if (this.envState) {
      updateEnvironment(this.envState, this.momentum, this.streak, zone.label, justWrong);
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

  /**
   * Show a personality battle cry as floating italic text above a hero.
   * Fades in and out over ~2 seconds. Uses the hero's displayColor.
   *
   * @param {object} hero - The hero object (must have .id)
   * @param {string} cryType - One of: attack, correctAnswer, wrongAnswer, superMove, lowHp, victory, defeat
   */
  showBattleCry(hero, cryType) {
    if (!hero) return;

    // Low HP cry: only show once per battle
    if (cryType === 'lowHp' && this.signatureState) {
      const idx = this.party.indexOf(hero);
      if (idx >= 0 && this.signatureState.lowHpCryShown[idx]) return;
      if (idx >= 0) this.signatureState.lowHpCryShown[idx] = true;
    }

    const personality = hero.personality || getPersonality(hero.id);
    if (!personality || !personality.battleCries) return;

    const cry = personality.battleCries[cryType];
    if (!cry) return;

    // Find the hero sprite to position above
    const idx = this.party.indexOf(hero);
    const hs = idx >= 0 ? this.heroSprites[idx] : null;
    if (!hs) return;

    const colorNum = hero.displayColor || 0xffffff;
    const colorHex = '#' + colorNum.toString(16).padStart(6, '0');

    const text = this.add.text(hs.x, hs.y - 140, cry, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      fontStyle: 'italic',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: 200 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);

    this.tweens.add({
      targets: text,
      alpha: 1,
      y: hs.y - 155,
      duration: 300,
      ease: 'Cubic.out',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: hs.y - 170,
          duration: 700,
          delay: 1000,
          ease: 'Cubic.in',
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  /**
   * Show a HINT button that appears for 3 seconds after a wrong answer.
   * When tapped, displays a step-by-step hint in a cream panel overlay.
   */
  showHintButton(question) {
    if (!question) return;
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    // Create hint button
    const hintBtn = PaperButton(this, area.cx, area.top + 140, 'HINT', {
      w: 140, h: 50, color: 0xe8a030, fontSize: 18,
      onClick: () => {
        // Remove the hint button
        this.destroyHintButton(hintBtn, hintTimer);
        // Show the hint overlay
        this.showHintOverlay(question);
      },
    });
    hintBtn.bg.setDepth(90);
    hintBtn.shadow.setDepth(89);
    hintBtn.label.setDepth(91);
    if (hintBtn.zone) hintBtn.zone.setDepth(91);

    // Auto-dismiss after 3 seconds
    const hintTimer = this.time.delayedCall(3000, () => {
      this.destroyHintButton(hintBtn, null);
    });
  }

  destroyHintButton(hintBtn, timer) {
    if (timer) timer.remove();
    if (hintBtn.bg) hintBtn.bg.destroy();
    if (hintBtn.shadow) hintBtn.shadow.destroy();
    if (hintBtn.label) hintBtn.label.destroy();
    if (hintBtn.zone) hintBtn.zone.destroy();
  }

  showHintOverlay(question) {
    const hintText = getHint(question.op, question.a, question.b, question.answer);
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.locked = true;

    const overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
      .setDepth(150).setInteractive();
    const panel = PaperPanel(this, area.cx, area.cy - 20, 620, 200, {
      color: 0xf5ead0, alpha: 0.97, radius: 20,
    });
    if (panel.bg) panel.bg.setDepth(151);
    if (panel.shadow) panel.shadow.setDepth(150);

    const hintLabel = this.add.text(area.cx, area.cy - 30, hintText, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: '#3a2410',
      align: 'center',
      wordWrap: { width: 560 },
    }).setOrigin(0.5).setDepth(152);

    const gotItBtn = PaperButton(this, area.cx, area.cy + 55, 'GOT IT', {
      w: 200, h: 54, color: 0x4aa848, fontSize: 22,
    });
    if (gotItBtn.bg) gotItBtn.bg.setDepth(153);
    if (gotItBtn.shadow) gotItBtn.shadow.setDepth(153);
    if (gotItBtn.label) gotItBtn.label.setDepth(154);
    if (gotItBtn.zone) gotItBtn.zone.setDepth(154);

    const elements = [overlayBg, hintLabel];
    if (panel.bg) elements.push(panel.bg);
    if (panel.shadow) elements.push(panel.shadow);
    elements.push(gotItBtn.bg, gotItBtn.shadow, gotItBtn.label);
    if (gotItBtn.zone) elements.push(gotItBtn.zone);

    let dismissed = false;
    const dismissHint = () => {
      if (dismissed) return;
      dismissed = true;
      this._activeHintDismiss = null;
      if (dismissTimer) dismissTimer.remove();
      elements.forEach(el => { if (el && el.scene) el.destroy(); });
      // Only unlock if we're still in a phase that should accept input.
      // If the turn already advanced (advanceDelay fired), unlocking here
      // would corrupt enemy-turn or end-phase lock state.
      if (this.phase === 'question' || this.phase === 'command') {
        this.locked = false;
      }
    };

    // Store the dismiss function so nextTurn() can auto-dismiss the overlay
    // if the turn advances while the hint is still showing.
    this._activeHintDismiss = dismissHint;

    overlayBg.on('pointerdown', dismissHint);
    if (gotItBtn.zone) gotItBtn.zone.on('pointerdown', dismissHint);
    const dismissTimer = this.time.delayedCall(6000, dismissHint);
  }

  // ================================================================
  // PAUSE OVERLAY
  // ================================================================

  showPauseOverlay() {
    if (this.phase === 'end') return;
    this._pauseElements.forEach(el => el.setVisible(true));
    this.locked = true;
    // Update potion count display
    if (this._pausePotionLabel) {
      const count = this.save.potions || 0;
      this._pausePotionLabel.setText(`USE POTION (${count})`);
    }
    // Dim potion button if no potions
    if (this._pausePotionBtn) {
      const count = this.save.potions || 0;
      const alpha = count > 0 ? 1 : 0.4;
      if (this._pausePotionBtn.bg) this._pausePotionBtn.bg.setAlpha(alpha);
      if (this._pausePotionBtn.shadow) this._pausePotionBtn.shadow.setAlpha(alpha * 0.7);
      if (this._pausePotionBtn.label) this._pausePotionBtn.label.setAlpha(alpha);
    }
  }

  hidePauseOverlay() {
    this._pauseElements.forEach(el => el.setVisible(false));
    if (this.phase === 'question' || this.phase === 'command') {
      this.locked = false;
    }
  }

  retreatFromBattle() {
    // Save maze state before retreating
    const mazeKey = mazeStateKey(this.floor);
    const mazeState = this.registry.get(mazeKey);
    if (mazeState) {
      try { localStorage.setItem(`mw_maze_${this.floor}`, JSON.stringify(mazeState)); } catch (e) { /* ignore */ }
    }

    this.phase = 'end';
    this.locked = true;
    this.clearBossTimer();
    audio.stopMusic();

    // Full heal on retreat (failure is not punishment)
    const save = this.save;
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = this.party[i].maxHp;
      save.party[i].maxHp = this.party[i].maxHp;
    }
    writeSave(save, this.slot);

    this.registry.remove('battleReturnScene');
    this.registry.remove('battleReturnData');

    const newHeroes = this.registry.get('newlyUnlockedHeroes');
    if (newHeroes && newHeroes.length > 0) {
      this.registry.remove('newlyUnlockedHeroes');
      // Use rescue dialogue if available, otherwise fall back to generic lines
      const heroIds = newHeroes.map(h => h.id);
      const rescueLines = getRescueDialogue(this.floor, heroIds);
      let lines;
      if (rescueLines.length > 0) {
        lines = rescueLines;
      } else {
        lines = [];
        for (const h of newHeroes) {
          lines.push({ speaker: 'Elder Fairy', text: `The dark magic shatters! A new warrior emerges!`, wide: true });
          lines.push({ speaker: h.name, text: `${h.trait}`, wide: true });
          lines.push({ speaker: 'Elder Fairy', text: `${h.name} has joined your quest!`, wide: true });
        }
      }
      // Clear pending rescues from save since we are about to show them
      consumePendingRescues(save);
      writeSave(save, this.slot);
      transitionTo(this, SCENES.CUTSCENE, {
        lines,
        floorId: this.floor,
        nextScene: SCENES.WORLD_MAP,
      });
    } else {
      transitionTo(this, SCENES.WORLD_MAP);
    }
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
    if (this.parallaxState) destroyParallaxBackground(this.parallaxState);
    if (this.envState) destroyEnvironmentState(this.envState);
    hidePanelFx(this.panelFx);

    for (const hs of this.heroSprites) heroVictoryBounce(this, hs);
    const vArea = safeArea(GAME_WIDTH, GAME_HEIGHT);
    confettiBurst(this, vArea.cx, vArea.cy - 100, 40);
    screenEdgeGlow(this, 0xf0c040, 600);

    // --- Battle cry: victory (show for first alive hero) ---
    const victoryHero = this.party.find(h => h && h.hp > 0);
    if (victoryHero) this.showBattleCry(victoryHero, 'victory');

    // Hide equation panel, answer buttons, and ability buttons
    if (this.eqLines) {
      Object.values(this.eqLines).forEach(el => { if (el) el.setVisible(false); });
    }
    for (let i = 0; i < this.answerButtons.length; i++) {
      const btn = this.answerButtons[i];
      if (btn.bg) btn.bg.setVisible(false);
      if (btn.shadow) btn.shadow.setVisible(false);
      if (btn.label) btn.label.setVisible(false);
      if (btn.zone) btn.zone.setVisible(false);
    }
    this.hideAbilityButton();

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
        const oldSupers = getAvailableSupers(save.party[i].id, oldLevel);
        const newSupers = getAvailableSupers(save.party[i].id, newLevel);
        if (newSupers.length > oldSupers.length) {
          const learned = newSupers[newSupers.length - 1];
          leveledUp.push(`${save.party[i].name} learned ${learned.name}!`);
        }
      } else {
        save.party[i].level = newLevel;
      }
    }

    // Update achievement-relevant stats
    save.stats.totalGold = (save.stats.totalGold || 0) + goldEarned;
    if (this.streak > (save.stats.bestStreak || 0)) {
      save.stats.bestStreak = this.streak;
    }
    if (!this.battleDamageTaken) {
      save.stats.perfectBattle = true;
    }

    // Mark floor complete on boss defeat. If we came directly from the
    // world map (no maze wrapper), any win counts so the progression
    // still advances on the fast path.
    if (this.isBoss || this.returnScene === SCENES.WORLD_MAP) {
      markFloorComplete(save, this.floor);
      const newHeroes = unlockHeroesForFloor(save, this.floor);
      if (newHeroes.length > 0) {
        this.registry.set('newlyUnlockedHeroes', newHeroes);
      }
      const mazeKey = mazeStateKey(this.floor);
      const mazeState = this.registry.get(mazeKey);
      if (mazeState) {
        mazeState.bossDefeated = true;
        this.registry.set(mazeKey, mazeState);
        try { localStorage.setItem(`mw_maze_${this.floor}`, JSON.stringify(mazeState)); } catch (e) { /* ignore */ }
      }
    }

    updateQuestProgress(save, 'wins');
    updateQuestProgress(save, 'streak', this.streak);
    updateQuestProgress(save, 'gold', goldEarned);
    if (!this.battleDamageTaken) updateQuestProgress(save, 'perfect');
    if (!this.potionUsedThisBattle) updateQuestProgress(save, 'nopotion');

    // Daily challenge rewards
    let dailyGold = 0;
    let dailyStreak = 0;
    const isDailyActive = this.registry.get('dailyChallengeActive');
    if (isDailyActive) {
      this.registry.remove('dailyChallengeActive');
      const challenge = getDailyChallenge();
      dailyStreak = markDailyChallengeComplete(save);
      dailyGold = challenge.reward.gold;
      // 7-day streak bonus
      if (dailyStreak >= 7 && dailyStreak % 7 === 0) {
        dailyGold += challenge.streakBonus.gold;
      }
      save.gold += dailyGold;
      save.stats.totalGold = (save.stats.totalGold || 0) + dailyGold;
    }

    // --- Record bonds after victory ---
    const partyIds = this.party.filter(h => h).map(h => h.id);
    const newBondRanks = recordBattle(save, partyIds);

    // Check achievements and queue toasts for newly unlocked ones
    const newAchievements = checkAchievements(save);

    writeSave(save, this.slot);

    // Boss Rush: update rush state on victory
    if (this.bossRush) {
      const rushState = this.registry.get('bossRushState');
      if (rushState) {
        rushState.totalCorrect += this.battleCorrect;
        rushState.totalWrong += this.battleWrong;
        rushState.bossesDefeated++;
        rushState.currentBoss++;
        // Preserve surviving party HP for next fight
        rushState.party = this.party.map(h => ({ ...h }));
        if (rushState.currentBoss >= 9) {
          rushState.complete = true;
          rushState.endTime = Date.now();
        }
        this.registry.set('bossRushState', rushState);
      }
    }

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

      // Enhanced victory stats
      const bestStreak = save.stats.bestStreak || this.streak;
      let rewardText = `Accuracy: ${accuracy}%`;
      rewardText += `\nBest Streak: ${bestStreak}`;
      rewardText += `\n+${goldEarned} GOLD  •  +${xpEarned} XP`;
      if (leveledUp.length > 0) {
        rewardText += `\nLEVELED UP: ${leveledUp.join(' & ')}`;
      }
      if (dailyGold > 0) {
        rewardText += `\nDAILY CHALLENGE: +${dailyGold} GOLD`;
        if (dailyStreak > 1) {
          rewardText += `  (${dailyStreak}-day streak!)`;
        }
      }
      // Show bond rank-ups
      for (const br of newBondRanks) {
        const h1 = this.party.find(h => h && h.id === br.heroId1);
        const h2 = this.party.find(h => h && h.id === br.heroId2);
        const n1 = h1 ? h1.name : br.heroId1;
        const n2 = h2 ? h2.name : br.heroId2;
        rewardText += `\n${n1} & ${n2}: Bond rank ${br.rank}!`;
      }
      // Gear nudge after boss wins — kids forget to shop, gear scaling drifts
      if (this.isBoss && save.gold >= 30) {
        rewardText += `\nNew gear available in the SHOP!`;
      }
      this.endOverlay.rewardsText.setText(rewardText);
      this.endOverlay.setVisible(true);
      this.endOverlay.setAlpha(1);

      // XP filling bar animation below rewards text
      const barW = 280, barH = 16;
      const barBg = this.add.rectangle(0, 90, barW, barH, 0x3a2410, 0.7).setOrigin(0.5);
      const barFill = this.add.rectangle(-barW / 2, 90, 0, barH - 4, 0xf0c040).setOrigin(0, 0.5);
      const xpLabel = this.add.text(0, 110, `+${xpEarned} XP`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '16px',
        color: COLORS_CSS.goldL,
      }).setOrigin(0.5);
      this.endOverlay.add([barBg, barFill, xpLabel]);
      // Animate XP bar filling
      this.tweens.add({
        targets: barFill,
        width: barW - 4,
        duration: 800,
        ease: 'Cubic.out',
        delay: 200,
      });

      // Show newly unlocked achievements with gold badge icons
      if (newAchievements.length > 0) {
        newAchievements.forEach((ach, i) => {
          const ay = 200 + i * 36;
          const badge = this.add.circle(-120, ay, 10, 0xf0c040);
          const star = this.add.text(-120, ay, '*', {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
            fontSize: '14px',
            color: '#3a2410',
          }).setOrigin(0.5);
          const achText = this.add.text(-100, ay, ach.name, {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
            fontSize: '18px',
            color: COLORS_CSS.goldL,
            stroke: '#000000',
            strokeThickness: 2,
          }).setOrigin(0, 0.5);
          this.endOverlay.add([badge, star, achText]);

          // Stagger toast for each achievement
          this.time.delayedCall(800 + i * 1200, () => {
            if (this.scene.isActive()) {
              this.showToast(`Achievement: ${ach.name}!`, COLORS_CSS.goldL);
            }
          });
        });
      }
    });
  }

  showDefeat() {
    if (this.phase === 'end') return;
    if (this.tryRevive()) return;
    this.phase = 'end';
    this.locked = true;
    this.clearBossTimer();
    this.time.removeAllEvents();
    if (this.parallaxState) destroyParallaxBackground(this.parallaxState);
    if (this.envState) destroyEnvironmentState(this.envState);
    hidePanelFx(this.panelFx);

    // Hide equation panel, answer buttons, and ability buttons
    if (this.eqLines) {
      Object.values(this.eqLines).forEach(el => { if (el) el.setVisible(false); });
    }
    for (let i = 0; i < this.answerButtons.length; i++) {
      const btn = this.answerButtons[i];
      if (btn.bg) btn.bg.setVisible(false);
      if (btn.shadow) btn.shadow.setVisible(false);
      if (btn.label) btn.label.setVisible(false);
      if (btn.zone) btn.zone.setVisible(false);
    }
    this.hideAbilityButton();

    audio.stopMusic();
    audio.play('battle/defeat');

    // --- Battle cry: defeat (show for first hero) ---
    if (this.party[0]) this.showBattleCry(this.party[0], 'defeat');

    // Defeat revives the party at 50% HP — never a soft-lock (battles
    // stay winnable, maze fountains still heal), but potions now have a
    // real job: topping the party back up. Failure stays gentle per
    // DESIGN-PRINCIPLES.md principle 8 without making items pointless.
    const save = this.save;
    save.stats.totalBattles++;
    save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + this.battleCorrect;
    save.stats.totalWrong = (save.stats.totalWrong ?? 0) + this.battleWrong;
    for (let i = 0; i < this.party.length && i < 3; i++) {
      if (!save.party[i]) save.party[i] = {};
      save.party[i].id = this.party[i].id;
      save.party[i].name = this.party[i].name;
      save.party[i].hp = Math.max(1, Math.round(this.party[i].maxHp * 0.5));
      save.party[i].maxHp = this.party[i].maxHp;
    }
    writeSave(save, this.slot);

    // Boss Rush: mark defeated
    if (this.bossRush) {
      const rushState = this.registry.get('bossRushState');
      if (rushState) {
        rushState.totalCorrect += this.battleCorrect;
        rushState.totalWrong += this.battleWrong;
        rushState.defeated = true;
        rushState.endTime = Date.now();
        this.registry.set('bossRushState', rushState);
      }
    }

    // Floor-specific or generic encouraging messages
    const defeatKey = `floor${this.floor}_defeat`;
    const defeatDialogue = DIALOGUE[defeatKey];
    const msgs = defeatDialogue
      ? defeatDialogue.map(d => d.text)
      : [
        "You'll get them next time!",
        "Practice makes perfect!",
        "Every try makes you stronger!",
        "Don't give up — heroes never quit!",
        "Take a breath and try again!",
      ];
    const msg = defeatDialogue
      ? msgs.join(' ')
      : msgs[Math.floor(Math.random() * msgs.length)];

    this.endOverlay.titleText.setText('RETREAT!');
    this.endOverlay.subText.setText(`Your party retreats to camp.\n${msg}`);
    this.endOverlay.rewardsText.setText(`You got ${this.battleCorrect} correct this battle!`);
    this.endOverlay.setVisible(true);
    this.endOverlay.setAlpha(1);
  }

  setSuperVisible(btn, show) {
    if (!btn) return;
    btn.bg.setVisible(show);
    btn.shadow.setVisible(show);
    btn.label.setVisible(show);
    if (btn.zone) btn.zone.setVisible(show);
  }

  updateSuperButton() {
    if (!this.currentTurn || this.currentTurn.who !== 'hero') {
      this.setSuperVisible(this.superBtn, false);
      this.setSuperVisible(this.teamBtn, false);
      return;
    }
    const heroIdx = this.currentTurn.heroIndex;
    const hasSuperReady = this.superReady[heroIdx];
    this.setSuperVisible(this.superBtn, hasSuperReady);
    if (hasSuperReady) {
      const hero = this.party[heroIdx];
      const level = hero.level || 1;
      const supers = getAvailableSupers(hero.id, level);
      const best = supers.length > 0 ? supers[supers.length - 1] : null;
      this.superBtn.label.setText(best ? best.name : 'SUPER!');
    }
    this.setSuperVisible(this.teamBtn, this.momentum >= 1.0);
  }

  executeSuperMove() {
    if (this.phase !== 'question' || this.locked) return;
    const heroIdx = this.currentTurn.heroIndex;
    if (!this.superReady[heroIdx]) return;
    this.locked = true;
    updateQuestProgress(this.save, 'super');

    const hero = this.party[heroIdx];
    const level = hero.level || 1;
    const supers = getAvailableSupers(hero.id, level);
    const move = supers.length > 0 ? supers[supers.length - 1] : null;
    const mult = move ? move.multiplier : 2;

    this.superReady[heroIdx] = false;
    this.heroStreaks[heroIdx] = 0;
    this.setSuperVisible(this.superBtn, false);
    this.setSuperVisible(this.teamBtn, false);

    const targetIdx = this.currentTarget;
    const targetEnemy = this.enemies[targetIdx] || this.enemy;
    const targetSprite = this.enemySprites[targetIdx] || this.enemySprite;
    const baseDmg = 5 + ((hero.atk || 10) * 0.5);
    const dmg = Math.round(baseDmg * mult);

    const heroSprite = this.heroSprites[heroIdx];
    const origX = heroSprite?.body?.x;
    const lungeX = targetSprite.body ? targetSprite.body.x - 80 : (origX || 0) + 200;

    audio.play('battle/correct');
    this.showToast(`${move ? move.name : 'SUPER'}! ${dmg} DMG!`, '#f0c040');
    // --- Battle cry: super move ---
    this.showBattleCry(hero, 'superMove');

    if (heroSprite?.body) {
      heroSprite.body.setTint(0xffff80);
      this.tweens.add({
        targets: heroSprite.body, x: lungeX, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.burstParticles(targetSprite.body?.x || lungeX + 80, targetSprite.body?.y || heroSprite.body.y, 0xf0c040);
          this.cameras.main.shake(200, 0.015);
          heroSprite.body.clearTint();

          targetEnemy.hp = Math.max(0, targetEnemy.hp - dmg);
          this.updateEnemyHp(targetIdx);

          this.tweens.add({
            targets: heroSprite.body, x: origX, duration: 200, ease: 'Power2',
            onComplete: () => this.afterSuperDamage(targetIdx, targetSprite),
          });
        },
      });
    } else {
      this.cameras.main.shake(150, 0.01);
      targetEnemy.hp = Math.max(0, targetEnemy.hp - dmg);
      this.updateEnemyHp(targetIdx);
      this.afterSuperDamage(targetIdx, targetSprite);
    }
  }

  tryRevive() {
    const inv = this.save.inventory || [];
    const idx = inv.indexOf('revive');
    if (idx === -1) return false;

    inv.splice(idx, 1);
    this.save.inventory = inv;
    writeSave(this.save, this.slot);

    for (const hero of this.party) {
      if (hero && hero.hp <= 0) {
        hero.hp = Math.ceil(hero.maxHp * 0.5);
      }
    }

    this.showToast('Revive Scroll Used!', '#40c080');
    audio.play('battle/correct');

    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i];
      const hs = this.heroSprites[i];
      if (!hero) continue;
      this.updateHeroHp(hero);
      if (hs?.body) {
        hs.body.setAlpha(1);
      }
    }

    this.time.delayedCall(600, () => this.nextTurn());
    return true;
  }

  afterSuperDamage(targetIdx, targetSprite) {
    const targetEnemy = this.enemies[targetIdx] || this.enemy;
    if (targetEnemy.hp <= 0) {
      this.burstParticles(targetSprite.body?.x || 900, targetSprite.body?.y || 400, 0xe8a030);
      if (targetSprite.body) this.tweens.add({ targets: targetSprite.body, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 400, ease: 'Back.in' });
      if (targetSprite.name) this.tweens.add({ targets: targetSprite.name, alpha: 0, duration: 400 });
      if (targetSprite.hpBarBg) this.tweens.add({ targets: targetSprite.hpBarBg, alpha: 0, duration: 400 });
      if (targetSprite.hpBarFill) this.tweens.add({ targets: targetSprite.hpBarFill, alpha: 0, duration: 400 });
      if (targetSprite.hpText) this.tweens.add({ targets: targetSprite.hpText, alpha: 0, duration: 400 });
      if (this.allEnemiesDead()) {
        this.time.delayedCall(400, () => this.showVictory());
      } else {
        this.time.delayedCall(400, () => this.nextTurn());
      }
    } else {
      this.time.delayedCall(200, () => this.nextTurn());
    }
  }

  executeTeamAttack() {
    if (this.phase !== 'question' || this.locked) return;
    if (this.momentum < 1.0) return;
    this.locked = true;

    this.setSuperVisible(this.superBtn, false);
    this.setSuperVisible(this.teamBtn, false);
    this.momentum = 0.5;
    this.updateMomentumBar();

    const targetIdx = this.currentTarget;
    const targetEnemy = this.enemies[targetIdx] || this.enemy;
    const targetSprite = this.enemySprites[targetIdx] || this.enemySprite;
    let totalDmg = 0;
    for (const hero of this.party) {
      if (!hero || hero.hp <= 0) continue;
      const baseDmg = 5 + ((hero.atk || 10) * 0.5);
      totalDmg += Math.round(baseDmg * 3);
    }

    this.showToast(`TEAM ATTACK! ${totalDmg} DMG!`, '#e04040');
    audio.play('battle/correct');

    let delay = 0;
    const origPositions = [];
    for (let i = 0; i < this.party.length; i++) {
      const h = this.party[i];
      if (!h || h.hp <= 0) continue;
      const hs = this.heroSprites[i];
      if (!hs?.body) continue;
      origPositions.push({ idx: i, x: hs.body.x });
      const lungeX = targetSprite.body ? targetSprite.body.x - 100 + i * 30 : hs.body.x + 200;
      this.time.delayedCall(delay, () => {
        hs.body.setTint(0xff8080);
        this.tweens.add({
          targets: hs.body, x: lungeX, duration: 150, ease: 'Power2',
          onComplete: () => {
            this.burstParticles(lungeX + 80, hs.body.y, 0xe04040);
            hs.body.clearTint();
            const orig = origPositions.find(o => o.idx === i);
            if (orig) this.tweens.add({ targets: hs.body, x: orig.x, duration: 150, ease: 'Power2' });
          },
        });
      });
      delay += 120;
    }

    this.time.delayedCall(delay + 300, () => {
      this.cameras.main.shake(300, 0.02);
      targetEnemy.hp = Math.max(0, targetEnemy.hp - totalDmg);
      this.updateEnemyHp(targetIdx);
      this.afterSuperDamage(targetIdx, targetSprite);
    });
  }
}
