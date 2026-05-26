import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { spawnHero, getHeroById, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { getDailyChallenge, isDailyChallengeCompleted, markDailyChallengeComplete } from '../systems/dailyChallenge.js';
import { getDailyQuests, getQuestProgress, claimQuestReward, getLoginReward } from '../systems/dailyQuests.js';
import { DIALOGUE } from '../data/dialogue.js';

const SCREEN_W = GAME_WIDTH;
const TOTAL_SCREENS = 3;
const TOTAL_W = SCREEN_W * TOTAL_SCREENS;

const FLOOR_INFO = [
  { id: 1, name: 'THE GARDEN',       tagline: 'Addition',       color: 0x4a9830 },
  { id: 2, name: 'TIDEPOOL RUINS',   tagline: 'Subtraction',    color: 0x2060b0 },
  { id: 3, name: 'CLOUD MAZE',       tagline: 'Multiplication', color: 0x88b8e0 },
  { id: 4, name: 'EMBER CAVES',      tagline: 'Division',       color: 0xb03010 },
  { id: 5, name: 'FROZEN PEAK',      tagline: 'Fractions',      color: 0x4890c0 },
  { id: 6, name: 'CRYSTAL CAVERNS',  tagline: 'Geometry',       color: 0x8040c0 },
  { id: 7, name: 'MARKET SQUARE',    tagline: 'Money',          color: 0xc0a040 },
  { id: 8, name: 'INFINITY LIBRARY', tagline: 'Word Problems',  color: 0x604020 },
  { id: 9, name: 'MENDING ROOM',     tagline: 'All Operations', color: 0x8830b8 },
];

const SCREEN_PALETTES = [1, 4, 9];

export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.WORLD_MAP });
  }

  init() {
    this.slot = getActiveSlot(this);
    this.save = loadSave(this.slot);
  }

  create() {
    fadeInScene(this);
    audio.playMusic('music/map');

    this.maxScreen = this.getMaxScreen();

    this.cameras.main.setBounds(0, 0, TOTAL_W, GAME_HEIGHT);
    this.cameras.main.setScroll(0, 0);

    this.buildBackgrounds();
    this.buildFloorNodes();
    this.buildPaths();
    this.buildHUD();
    this.buildQuestPanel();
    this.showLoginReward();
    this.buildPageDots();
    this.setupScroll();

    const startScreen = this.getStartScreen();
    this.currentScreen = startScreen;
    this.cameras.main.setScroll(startScreen * SCREEN_W, 0);
    this.updatePageDots();
    this.updateArrows();
  }

  getMaxScreen() {
    return 2;
  }

  getStartScreen() {
    const floors = this.save.floors;
    for (let i = 8; i >= 0; i--) {
      if (floors[i]?.unlocked) {
        return Math.min(Math.floor(i / 3), this.maxScreen);
      }
    }
    return 0;
  }

  buildBackgrounds() {
    for (let s = 0; s < TOTAL_SCREENS; s++) {
      const offsetX = s * SCREEN_W;
      const before = this.children.list.length;
      drawPapercutBackground(this, SCREEN_PALETTES[s], SCREEN_W, GAME_HEIGHT, 777 + s * 100);
      const after = this.children.list.length;
      for (let i = before; i < after; i++) {
        const obj = this.children.list[i];
        if (obj && obj.x !== undefined) obj.x += offsetX;
      }

      if (s > this.maxScreen) {
        this.add.rectangle(
          offsetX + SCREEN_W / 2, GAME_HEIGHT / 2,
          SCREEN_W, GAME_HEIGHT, 0x000000, 0.6
        );
        this.add.text(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2, '🔒', {
          fontSize: '80px',
        }).setOrigin(0.5);
        this.add.text(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2 + 60, `Beat Floor ${s * 3} to unlock`, {
          ...TEXT.heading(),
          fontSize: '24px',
          color: '#f0e4cc',
          stroke: '#1a0e04',
          strokeThickness: 4,
        }).setOrigin(0.5);
      }
    }
  }

  buildFloorNodes() {
    const nodeLayout = [
      { rx: 0.22, ry: 0.70 },
      { rx: 0.50, ry: 0.42 },
      { rx: 0.78, ry: 0.62 },
    ];

    this.nodePositions = [];

    for (let i = 0; i < 9; i++) {
      const screen = Math.floor(i / 3);
      const slot = i % 3;
      const layout = nodeLayout[slot];
      const x = screen * SCREEN_W + SCREEN_W * layout.rx;
      const y = GAME_HEIGHT * layout.ry;
      this.nodePositions.push({ x, y });

      const info = FLOOR_INFO[i];
      const saved = this.save.floors[i];
      const locked = !saved.unlocked;
      const complete = saved.complete;

      this.createFloorNode(x, y, info, locked, complete);
    }
  }

  createFloorNode(x, y, info, locked, complete) {
    const radius = 56;

    this.add.circle(x + 4, y + 6, radius, 0x000000, 0.3);

    const nodeColor = locked ? 0x8a8070 : info.color;
    const ring = this.add.circle(x, y, radius, nodeColor);
    ring.setStrokeStyle(4, locked ? 0x5a5040 : 0xfff8e0);

    const inner = this.add.circle(x, y, radius - 6, locked ? 0x5a5040 : 0xffffff, locked ? 0.8 : 1);

    const numX = x - radius * 0.7;
    const numY = y - radius * 0.7;
    this.add.circle(numX, numY, 16, locked ? 0x5a5040 : 0xd07818)
      .setStrokeStyle(2, 0xfff8e0);
    this.add.text(numX, numY, `${info.id}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: '#fff8e0',
    }).setOrigin(0.5);

    if (locked) {
      this.drawPaperPadlock(x, y, 24);
    } else {
      this.drawMiniDiorama(x, y, radius - 10, info.id);
    }

    if (complete) {
      this.add.text(x + radius * 0.65, y - radius * 0.65, '⭐', {
        fontSize: '28px',
      }).setOrigin(0.5);
    }

    const labelY = y + radius + 24;
    const labelW = 200;
    const labelH = 50;
    PaperPanel(this, x, labelY, labelW, labelH, {
      color: locked ? 0xc8b898 : 0xffffff,
      alpha: 0.95,
      radius: 12,
    });
    this.add.text(x, labelY - 10, info.name, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '14px',
      color: locked ? '#3a2010' : '#d07818',
    }).setOrigin(0.5);
    this.add.text(x, labelY + 10, info.tagline, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '12px',
      color: locked ? '#8a7a60' : '#5a3820',
    }).setOrigin(0.5);

    if (!locked) {
      ring.setInteractive({ useHandCursor: true });
      this.tweens.add({
        targets: ring,
        scale: 1.06,
        duration: 1200,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
      ring.on('pointerup', () => {
        if (this._navLocked) return;
        audio.play('ui/confirm');
        this.enterFloor(info.id);
      });
    }
  }

  drawMiniDiorama(cx, cy, r, floorId) {
    const gfx = this.add.graphics();
    const palettes = {
      1: { sky: 0x68b8e8, ground: 0x48a040, accent: 0xf06888, detail: 0x388828 },
      2: { sky: 0x2878c0, ground: 0x2070a0, accent: 0xf0a848, detail: 0x186898 },
      3: { sky: 0x88c8f8, ground: 0xb8e0f0, accent: 0xffd040, detail: 0xa0d0f0 },
      4: { sky: 0x4a1818, ground: 0x6a2810, accent: 0xf0a020, detail: 0x882818 },
      5: { sky: 0x88c8f0, ground: 0x90c8e0, accent: 0xd0f0ff, detail: 0x5898b8 },
      6: { sky: 0x281850, ground: 0x4838a0, accent: 0xd0a0ff, detail: 0x5840b0 },
      7: { sky: 0xd8a858, ground: 0x8a6828, accent: 0xf0c040, detail: 0xa07830 },
      8: { sky: 0x3a2010, ground: 0x4a3018, accent: 0xc8a050, detail: 0x5a4020 },
      9: { sky: 0x382060, ground: 0x4030a0, accent: 0xf0c0ff, detail: 0x5840c0 },
    };
    const p = palettes[floorId] || palettes[1];

    gfx.fillStyle(p.sky, 1);
    gfx.fillCircle(cx, cy, r);

    gfx.fillStyle(p.ground, 1);
    gfx.beginPath();
    gfx.arc(cx, cy, r, 0.2 * Math.PI, 0.8 * Math.PI, false);
    gfx.lineTo(cx, cy + r);
    gfx.closePath();
    gfx.fillPath();

    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * r * 0.45;
      const baseY = cy + r * 0.15;
      const peakH = r * (0.35 + (i % 2) * 0.15);
      gfx.fillStyle(p.detail, 0.85);
      gfx.fillTriangle(cx + dx - r * 0.25, baseY, cx + dx, baseY - peakH, cx + dx + r * 0.25, baseY);
    }

    for (let i = 0; i < 5; i++) {
      const angle = -0.8 + i * 0.4;
      const dist = r * (0.3 + (i % 3) * 0.15);
      const ax = cx + Math.cos(angle) * dist;
      const ay = cy + Math.sin(angle) * dist - r * 0.2;
      gfx.fillStyle(p.accent, 0.8);
      gfx.fillCircle(ax, ay, r * 0.06 + i * 0.8);
    }

    gfx.lineStyle(2, p.detail, 0.5);
    gfx.strokeCircle(cx, cy, r);
  }

  drawPaperPadlock(cx, cy, size) {
    const bodyW = size * 1.3;
    const bodyH = size * 1.1;
    const bodyY = cy + size * 0.15;

    const shackle = this.add.graphics();
    shackle.lineStyle(size * 0.22, 0x6a6050, 1);
    shackle.beginPath();
    shackle.arc(cx, cy - size * 0.35, size * 0.5, Math.PI, 0, false);
    shackle.strokePath();
    shackle.lineStyle(size * 0.08, 0xb0a890, 1);
    shackle.beginPath();
    shackle.arc(cx - 1, cy - size * 0.35 - 1, size * 0.5 - 1, Math.PI + 0.1, 2 * Math.PI - 0.3, false);
    shackle.strokePath();

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(cx - bodyW / 2 + 3, bodyY - bodyH / 2 + 4, bodyW, bodyH, 6);

    const body = this.add.graphics();
    body.fillStyle(0x3a2410, 1);
    body.fillRoundedRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 6);
    body.lineStyle(2, 0x1a0e04, 0.9);
    body.strokeRoundedRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 6);

    const kh = this.add.graphics();
    kh.fillStyle(0xe8a030, 1);
    kh.fillCircle(cx, bodyY - size * 0.05, size * 0.14);
    kh.fillRect(cx - size * 0.05, bodyY - size * 0.05, size * 0.1, size * 0.3);
  }

  buildPaths() {
    const pathGfx = this.add.graphics();
    for (let i = 0; i < this.nodePositions.length - 1; i++) {
      const from = this.nodePositions[i];
      const to = this.nodePositions[i + 1];
      const active = this.save.floors[i]?.complete;

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 40;
      const pts = this.sampleBezier(from.x, from.y, midX, midY, to.x, to.y, 32);

      pathGfx.lineStyle(8, active ? COLORS.gold : 0x3a2810, 0.9);
      this.strokePolyline(pathGfx, pts);

      if (active) {
        pathGfx.lineStyle(3, 0xffe080, 0.9);
        this.strokePolyline(pathGfx, pts);
      }
    }
  }

  sampleBezier(ax, ay, cx, cy, bx, by, steps) {
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      pts.push({
        x: u * u * ax + 2 * u * t * cx + t * t * bx,
        y: u * u * ay + 2 * u * t * cy + t * t * by,
      });
    }
    return pts;
  }

  strokePolyline(gfx, pts) {
    if (pts.length < 2) return;
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
    gfx.strokePath();
  }

  buildHUD() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    const title = this.add.text(GAME_WIDTH / 2, 80, 'WORLD MAP', {
      ...TEXT.title(),
      fontSize: '40px',
      color: '#fff8e0',
      stroke: '#3a2410',
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0);

    const homeBtn = PaperButton(this, area.left + 100, area.top + 45, '← HOME', {
      w: 180, h: 64, color: 0xffffff, fontSize: 22,
      textColor: '#b83820',
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.TITLE);
      },
    });
    this.setScrollFactorDeep(homeBtn, 0);

    const goldPanel = PaperPanel(this, area.left + 320, area.top + 45, 200, 54, {
      color: 0xffffff, alpha: 0.95, radius: 16,
    });
    this.setScrollFactorDeep(goldPanel, 0);
    const goldIcon = this.add.text(area.left + 228, area.top + 45, '💰', { fontSize: '22px' }).setOrigin(0, 0.5).setScrollFactor(0);
    const goldText = this.add.text(area.left + 258, area.top + 38, `${this.save.gold}`, {
      ...TEXT.heading(), fontSize: '20px', color: '#d07818',
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const potIcon = this.add.text(area.left + 330, area.top + 45, '🧪', { fontSize: '22px' }).setOrigin(0, 0.5).setScrollFactor(0);
    const potText = this.add.text(area.left + 360, area.top + 38, `${this.save.potions}`, {
      ...TEXT.heading(), fontSize: '20px', color: '#4aa848',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    if (this.save.party && this.save.party.length > 0) {
      const stripW = 220;
      const stripCx = area.right - stripW / 2 - 80;
      const stripY = area.top + 45;
      const partyPanel = PaperPanel(this, stripCx, stripY, stripW, 70, {
        color: 0xffffff, alpha: 0.95, radius: 16,
      });
      this.setScrollFactorDeep(partyPanel, 0);
      const partyLabel = this.add.text(stripCx - stripW / 2 + 12, stripY - 24, 'PARTY', {
        ...TEXT.stat(), fontSize: '11px', color: '#6a4c28',
      }).setScrollFactor(0);
      for (let i = 0; i < 3; i++) {
        const hx = stripCx - stripW / 2 + 50 + i * 65;
        const slot = this.save.party[i];
        if (slot) {
          const def = getHeroById(slot.id);
          if (def) {
            const img = drawHeroSprite(this, hx, stripY - 4, def, { scale: 0.35 });
            img.setScrollFactor(0);
          }
        }
      }
    }

    const skillsBtn = PaperButton(this, area.cx - 100, area.bottom - 36, 'SKILLS', {
      w: 150, h: 56, color: 0x4080c0, fontSize: 18,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.MASTERY, undefined, 200);
      },
    });
    this.setScrollFactorDeep(skillsBtn, 0);

    const shopBtn = PaperButton(this, area.cx + 100, area.bottom - 36, 'SHOP', {
      w: 160, h: 56, color: 0xd07818, fontSize: 20,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SHOP, undefined, 200);
      },
    });
    this.setScrollFactorDeep(shopBtn, 0);

    const settingsBtn = PaperButton(this, area.right - 60, area.bottom - 36, '⚙', {
      w: 100, h: 50, color: 0x4a6ca8, fontSize: 24,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.WORLD_MAP }, 200);
      },
    });
    this.setScrollFactorDeep(settingsBtn, 0);

    const dailyCompleted = isDailyChallengeCompleted(this.save);
    const dailyBtn = PaperButton(this, area.left + 130, area.bottom - 36, 'DAILY', {
      w: 180, h: 50, color: dailyCompleted ? 0x8a8070 : 0xd07818, fontSize: 18,
      textColor: dailyCompleted ? '#6a4c28' : '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        this.onDailyChallenge();
      },
    });
    this.setScrollFactorDeep(dailyBtn, 0);

    const arrowStyle = { w: 110, h: 60, color: 0xd0a040, fontSize: 20, textColor: '#fff8e0' };
    this.leftArrow = PaperButton(this, area.left + 65, area.cy, 'PREV', {
      ...arrowStyle,
      onClick: () => this.goScreen(this.currentScreen - 1),
    });
    this.setScrollFactorDeep(this.leftArrow, 0);

    this.rightArrow = PaperButton(this, area.right - 65, area.cy, 'NEXT', {
      ...arrowStyle,
      onClick: () => this.goScreen(this.currentScreen + 1),
    });
    this.setScrollFactorDeep(this.rightArrow, 0);
  }

  setScrollFactorDeep(obj, factor) {
    if (!obj) return;
    for (const key of ['bg', 'shadow', 'label', 'zone']) {
      if (obj[key] && obj[key].setScrollFactor) obj[key].setScrollFactor(factor);
    }
  }

  buildQuestPanel() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const quests = getDailyQuests();
    const progress = getQuestProgress(this.save);
    const panelX = area.right - 200;
    const panelY = area.top + 170;
    const panelW = 340;
    const panelH = 160;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(900);
    bg.fillStyle(0xf5ead0, 0.9);
    bg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14);
    bg.lineStyle(2, 0xd4a840, 0.7);
    bg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14);

    const title = this.add.text(panelX, panelY - panelH / 2 + 16, 'DAILY QUESTS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '14px', color: '#c06a10',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(901);

    const tierColors = { easy: '#40a040', medium: '#d08020', hard: '#c03030' };
    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      const p = progress.quests[i];
      const qy = panelY - panelH / 2 + 38 + i * 36;
      const done = p.progress >= q.target;
      const claimed = p.claimed;

      const dot = this.add.circle(panelX - panelW / 2 + 16, qy + 6, 5,
        claimed ? 0x40a040 : (done ? 0xf0c040 : 0x8a7a60)
      ).setScrollFactor(0).setDepth(901);

      const label = this.add.text(panelX - panelW / 2 + 28, qy, q.label, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '12px', color: claimed ? '#80a070' : '#3a2410',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(901);

      const prog = this.add.text(panelX + panelW / 2 - 16, qy,
        claimed ? '✓' : `${Math.min(p.progress, q.target)}/${q.target}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '12px', color: claimed ? '#40a040' : (done ? '#f0c040' : '#8a7a60'),
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(901);

      if (done && !claimed) {
        const claimBtn = this.add.text(panelX + panelW / 2 - 14, qy, `+${q.reward}g`, {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
          fontSize: '13px', color: '#f0c040', stroke: '#3a1a00', strokeThickness: 2,
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(902).setInteractive({ useHandCursor: true });
        claimBtn.on('pointerdown', () => {
          const reward = claimQuestReward(this.save, i);
          if (reward > 0) {
            writeSave(this.save, this.slot);
            audio.play('ui/confirm');
            this.scene.restart();
          }
        });
        prog.setVisible(false);
      }
    }
  }

  showLoginReward() {
    const reward = getLoginReward(this.save);
    if (!reward) return;
    writeSave(this.save, this.slot);
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(990).setInteractive();

    const panel = this.add.graphics().setScrollFactor(0).setDepth(991);
    panel.fillStyle(0xf5ead0, 0.95);
    panel.fillRoundedRect(area.cx - 200, area.cy - 120, 400, 240, 20);
    panel.lineStyle(3, 0xd4a840, 0.8);
    panel.strokeRoundedRect(area.cx - 200, area.cy - 120, 400, 240, 20);

    const title = this.add.text(area.cx, area.cy - 80, 'DAILY LOGIN REWARD!', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '28px', color: '#c06a10', stroke: '#3a1a00', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const dayText = this.add.text(area.cx, area.cy - 30, `Day ${reward.streakDay} Streak`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#3a2410',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const rewardText = this.add.text(area.cx, area.cy + 20, reward.label, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '36px', color: '#f0c040', stroke: '#3a1a00', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const okBtn = PaperButton(this, area.cx, area.cy + 80, 'COLLECT!', {
      w: 200, h: 56, color: 0x58c848, fontSize: 22,
      onClick: () => {
        audio.play('ui/confirm');
        [bg, panel, title, dayText, rewardText].forEach(o => o.destroy());
        okBtn.bg.destroy(); okBtn.shadow.destroy(); okBtn.label.destroy();
        if (okBtn.zone) okBtn.zone.destroy();
      },
    });
    okBtn.bg.setScrollFactor(0).setDepth(993);
    okBtn.shadow.setScrollFactor(0).setDepth(993);
    okBtn.label.setScrollFactor(0).setDepth(993);
    if (okBtn.zone) okBtn.zone.setScrollFactor(0).setDepth(993);
  }

  buildPageDots() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    this.pageDots = [];
    for (let i = 0; i < TOTAL_SCREENS; i++) {
      const dx = GAME_WIDTH / 2 + (i - 1) * 30;
      const dy = area.bottom - 100;
      const dot = this.add.circle(dx, dy, 8, 0xffffff, 0.4).setScrollFactor(0);
      dot.setStrokeStyle(2, 0x3a2410, 0.5);
      this.pageDots.push(dot);
    }
  }

  updatePageDots() {
    for (let i = 0; i < this.pageDots.length; i++) {
      const active = i === this.currentScreen;
      const reachable = i <= this.maxScreen;
      this.pageDots[i].setFillStyle(
        active ? 0xf0c040 : (reachable ? 0xffffff : 0x5a5040),
        active ? 1 : 0.5
      );
    }
  }

  setupScroll() {
    this._navLocked = false;
    let startX = 0;
    let didDrag = false;

    this.input.on('pointerdown', (pointer) => {
      startX = pointer.x;
      didDrag = false;
    });

    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown || this._navLocked) return;
      if (Math.abs(pointer.x - startX) > 30) didDrag = true;
    });

    this.input.on('pointerup', (pointer) => {
      if (this._navLocked || !didDrag) return;
      const dx = startX - pointer.x;
      if (dx > 60) {
        this.goScreen(this.currentScreen + 1);
      } else if (dx < -60) {
        this.goScreen(this.currentScreen - 1);
      }
    });
  }

  goScreen(screen) {
    if (this._navLocked) return;
    screen = Phaser.Math.Clamp(screen, 0, this.maxScreen);
    if (screen === this.currentScreen) return;
    this._navLocked = true;
    this.currentScreen = screen;
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: screen * SCREEN_W,
      duration: 300,
      ease: 'Cubic.out',
      onComplete: () => { this._navLocked = false; },
    });
    this.updatePageDots();
    this.updateArrows();
  }

  updateArrows() {
    const showLeft = this.currentScreen > 0;
    const showRight = this.currentScreen < this.maxScreen;
    ['bg', 'shadow', 'label', 'zone'].forEach(k => {
      if (this.leftArrow[k]) this.leftArrow[k].setVisible(showLeft);
      if (this.rightArrow[k]) this.rightArrow[k].setVisible(showRight);
    });
  }

  onDailyChallenge() {
    if (isDailyChallengeCompleted(this.save)) {
      this.showFlash('Come back tomorrow!');
      return;
    }
    const challenge = getDailyChallenge();
    const classLists = { knight: KNIGHTS, wizard: WIZARDS, bunny: BUNNIES };
    const classList = classLists[challenge.heroClass];
    const heroIdx = challenge.heroIndex % classList.length;
    const party = [];
    for (let i = 0; i < 3; i++) {
      const idx = (heroIdx + i) % classList.length;
      party.push(spawnHero(classList[idx].id));
    }
    this.registry.set('battleReturnScene', SCENES.WORLD_MAP);
    this.registry.set('battleReturnData', null);
    this.registry.set('dailyChallengeActive', true);
    audio.play('ui/confirm');
    transitionTo(this, SCENES.BATTLE, {
      floor: challenge.floor,
      grade: this.save.grade,
      party,
    }, 300);
  }

  showFlash(message) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 180, message, {
      ...TEXT.body(),
      fontSize: '22px',
      color: '#d07818',
      backgroundColor: '#fff8e0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2000,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  enterFloor(floorId) {
    const haveParty = this.save.party && this.save.party.length >= 3;
    if (!haveParty) {
      this.scene.start(SCENES.PARTY_SELECT, { grade: this.save.grade });
      return;
    }

    const entryKey = `floor${floorId}_entry`;
    const lines = DIALOGUE[entryKey];
    if (lines && lines.length > 0) {
      transitionTo(this, SCENES.CUTSCENE, {
        lines,
        floorId,
        nextScene: SCENES.MAZE,
        nextData: { floor: floorId },
      }, 300);
    } else {
      transitionTo(this, SCENES.MAZE, { floor: floorId }, 300);
    }
  }
}
