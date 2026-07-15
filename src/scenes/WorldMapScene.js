import Phaser from 'phaser';
import { SCENES, COLORS, PAPER, PAPER_CSS, GAME_WIDTH, GAME_HEIGHT, mazeStateKey } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { spawnHero, getHeroById, KNIGHTS, WIZARDS, BUNNIES, levelBonuses, LEVEL_THRESHOLDS, getRarityColor, getRarityLabel } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawWorldMapGarden, drawWorldMapCaves, drawWorldMapStarlitHighlands } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite, createAnimatedHero } from '../ui/heroSprites.js';
import { getEvolutionStage } from '../systems/evolution.js';
import { getDailyChallenge, isDailyChallengeCompleted } from '../systems/dailyChallenge.js';
import { getDailyQuests, getQuestProgress, claimQuestReward, getLoginReward } from '../systems/dailyQuests.js';
import { DIALOGUE } from '../data/dialogue.js';
import {
  drawShadowedPoly, drawShadowedBlob, organicRectPoints,
  blobPoints, drawPapercutTree, drawPapercutFlower,
} from '../systems/papercutArt.js';

const SCREEN_W = GAME_WIDTH;
const TOTAL_SCREENS = 3;
const TOTAL_W = SCREEN_W * TOTAL_SCREENS;

const FLOOR_INFO = [
  { id: 1, name: 'THE GARDEN',       tagline: 'Addition',       color: PAPER.forest },
  { id: 2, name: 'TIDEPOOL RUINS',   tagline: 'Subtraction',    color: PAPER.teal },
  { id: 3, name: 'CLOUD MAZE',       tagline: 'Multiplication', color: PAPER.sky },
  { id: 4, name: 'EMBER CAVES',      tagline: 'Division',       color: PAPER.coral },
  { id: 5, name: 'FROZEN PEAK',      tagline: 'Fractions',      color: PAPER.tealL },
  { id: 6, name: 'CRYSTAL CAVERNS',  tagline: 'Geometry',       color: PAPER.lavender },
  { id: 7, name: 'MARKET SQUARE',    tagline: 'Money',          color: PAPER.orange },
  { id: 8, name: 'INFINITY LIBRARY', tagline: 'Word Problems',  color: PAPER.sand },
  { id: 9, name: 'MENDING ROOM',     tagline: 'All Operations', color: PAPER.lavenderD },
];

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

    try {
      this.buildBackgrounds();
    } catch (e) {
      console.error('WorldMap buildBackgrounds failed:', e);
      for (let s = 0; s < TOTAL_SCREENS; s++) {
        this.add.rectangle(s * SCREEN_W + SCREEN_W / 2, GAME_HEIGHT / 2, SCREEN_W, GAME_HEIGHT, PAPER.sage);
      }
    }
    this.buildFloorNodes();
    this.buildPaths();
    this.buildMapHero();
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

    const navigateHero = (dir) => {
      if (this._navLocked || this._mapHeroWalking) return;
      let target = this.mapHeroNodeIndex + dir;
      while (target >= 0 && target <= 8 && !this.save.floors[target]?.unlocked) {
        target += dir;
      }
      if (target < 0 || target > 8) return;
      audio.play('ui/click');
      const targetScreen = Math.floor(target / 3);
      if (targetScreen !== this.currentScreen && targetScreen <= this.maxScreen) {
        this.currentScreen = targetScreen;
        this.cameras.main.pan(targetScreen * SCREEN_W + SCREEN_W / 2, GAME_HEIGHT / 2, 600, 'Sine.easeInOut');
        this.updatePageDots();
        this.updateArrows();
      }
      this.walkHeroToNode(target, () => {});
    };
    this.input.keyboard.on('keydown-RIGHT', () => navigateHero(1));
    this.input.keyboard.on('keydown-LEFT', () => navigateHero(-1));
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this._navLocked || this._mapHeroWalking) return;
      const floorIdx = this.mapHeroNodeIndex;
      if (this.save.floors[floorIdx]?.unlocked) {
        audio.play('ui/confirm');
        this.enterFloor(floorIdx + 1);
      }
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this._navLocked || this._mapHeroWalking) return;
      const floorIdx = this.mapHeroNodeIndex;
      if (this.save.floors[floorIdx]?.unlocked) {
        audio.play('ui/confirm');
        this.enterFloor(floorIdx + 1);
      }
    });

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
    });
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
    const drawFns = [drawWorldMapGarden, drawWorldMapCaves, drawWorldMapStarlitHighlands];
    // Store parallax-eligible background objects per screen
    this._parallaxObjects = [];
    for (let s = 0; s < TOTAL_SCREENS; s++) {
      const offsetX = s * SCREEN_W;
      const before = this.children.list.length;
      drawFns[s](this, SCREEN_W, GAME_HEIGHT, 777 + s * 100);
      const after = this.children.list.length;
      const screenObjs = [];
      for (let i = before; i < after; i++) {
        const obj = this.children.list[i];
        if (obj && obj.x !== undefined) {
          obj.x += offsetX;
          // Determine parallax factor from y position:
          // Objects higher on screen (sky/far hills) move less,
          // objects lower (near ground/foreground) move more.
          const yNorm = Math.max(0, Math.min(1, (obj.y || 0) / GAME_HEIGHT));
          // Range from 0.02 (far/top) to 0.08 (near/bottom)
          const pFactor = 0.02 + yNorm * 0.06;
          obj._baseX = obj.x;
          obj._parallaxFactor = pFactor;
          obj._parallaxScreen = s;
          screenObjs.push(obj);
        }
      }
      this._parallaxObjects.push(screenObjs);

      // Clip each screen's background to its boundary — prevents the
      // purple/teal bleed from adjacent screens' hill graphics.
      if (screenObjs.length > 0) {
        const maskGfx = this.make.graphics({ add: false });
        maskGfx.fillStyle(0xffffff);
        maskGfx.fillRect(offsetX, 0, SCREEN_W, GAME_HEIGHT);
        const mask = maskGfx.createGeometryMask();
        screenObjs.forEach(obj => { if (obj.setMask) obj.setMask(mask); });
      }

      if (s > this.maxScreen) {
        const screenNames = ['', 'CRYSTAL CAVES', 'STARLIT HIGHLANDS'];
        this.add.rectangle(
          offsetX + SCREEN_W / 2, GAME_HEIGHT / 2,
          SCREEN_W, GAME_HEIGHT, PAPER.shadow, 0.35
        );
        this.add.text(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2 - 60, screenNames[s] || '', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '32px',
          color: PAPER_CSS.gold,
          stroke: PAPER_CSS.inkTeal,
          strokeThickness: 5,
        }).setOrigin(0.5);
        this.drawPaperPadlock(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2, 60);
        this.add.text(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2 + 60, `Beat Floor ${s * 3} to unlock`, {
          ...TEXT.heading(),
          fontSize: '24px',
          color: PAPER_CSS.cream,
          stroke: PAPER_CSS.inkTeal,
          strokeThickness: 4,
        }).setOrigin(0.5);
      }
    }
  }

  buildFloorNodes() {
    const nodeLayout = [
      { rx: 0.20, ry: 0.72 },
      { rx: 0.50, ry: 0.36 },
      { rx: 0.80, ry: 0.64 },
    ];

    this.nodePositions = [];

    let activeNodeIndex = -1;
    for (let i = 8; i >= 0; i--) {
      const f = this.save.floors[i];
      if (f.unlocked && !f.complete) { activeNodeIndex = i; break; }
    }

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
      const isActive = i === activeNodeIndex;

      this.createFloorNode(x, y, info, locked, complete, saved, isActive);
    }
  }

  createFloorNode(x, y, info, locked, complete, saved, isActive) {
    const radius = 100;

    // Shadow (teal-tinted, not black)
    drawShadowedBlob(this.add.graphics().setDepth(10), x, y, radius, radius,
      locked ? PAPER.sand : info.color, {
        seed: info.id * 7, wobble: 0.06, shadowDy: 6, shadowAlpha: 0.2,
      });

    // Inner circle
    const inner = this.add.graphics().setDepth(10);
    const innerPts = blobPoints(x, y, radius - 8, radius - 8, { seed: info.id * 11, wobble: 0.04 });
    drawShadowedPoly(inner, innerPts, locked ? PAPER.creamD : PAPER.white, {
      shadowDy: 3, shadowAlpha: 0.15,
    });

    // Number badge
    const numX = x - radius * 0.65;
    const numY = y - radius * 0.65;
    drawShadowedBlob(this.add.graphics().setDepth(15), numX, numY, 22, 22,
      locked ? PAPER.creamD : PAPER.orange, {
        seed: info.id * 13, wobble: 0.08, shadowDy: 3, shadowAlpha: 0.18,
      });
    this.add.text(numX, numY, `${info.id}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: PAPER_CSS.cream,
    }).setOrigin(0.5).setDepth(15);

    // Mini diorama
    if (locked) {
      this.drawMiniDiorama(x, y, radius - 8, info.id, 0.4);
      this.drawPaperPadlock(x, y, 30);
    } else {
      this.drawMiniDiorama(x, y, radius - 8, info.id, 1.0);
    }

    // Star rating
    if (complete) {
      const acc = saved.bestAccuracy || 0;
      const earnedStars = acc >= 95 ? 3 : acc >= 80 ? 2 : 1;
      const starY = y - radius * 0.60;
      const starSpacing = 24;
      const starStartX = x + radius * 0.60 - starSpacing;
      for (let s = 0; s < 3; s++) {
        const sx = starStartX + s * starSpacing;
        const isEarned = s < earnedStars;
        const gfx = this.add.graphics().setDepth(12);
        const r = 8;
        const ri = 4;
        gfx.fillStyle(isEarned ? PAPER.gold : PAPER.creamD, isEarned ? 1 : 0.3);
        gfx.beginPath();
        for (let si = 0; si < 10; si++) {
          const angle = (si * Math.PI / 5) - Math.PI / 2;
          const radius2 = si % 2 === 0 ? r : ri;
          if (si === 0) gfx.moveTo(sx + Math.cos(angle) * radius2, starY + Math.sin(angle) * radius2);
          else gfx.lineTo(sx + Math.cos(angle) * radius2, starY + Math.sin(angle) * radius2);
        }
        gfx.closePath();
        gfx.fillPath();
      }
    }

    // Particle effects for completed nodes
    if (complete && !locked) {
      const themeColor = info.color;
      this.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => {
          const count = 3 + Math.floor(Math.random() * 2);
          for (let p = 0; p < count; p++) {
            const px = x + (Math.random() - 0.5) * radius * 1.2;
            const py = y + (Math.random() - 0.5) * radius * 0.6;
            const size = 2 + Math.random();
            const sparkle = this.add.circle(px, py, size, themeColor, 0.8).setDepth(13);
            this.tweens.add({
              targets: sparkle,
              y: py - 20,
              alpha: 0,
              duration: 800 + Math.random() * 400,
              ease: 'Sine.out',
              onComplete: () => sparkle.destroy(),
            });
          }
        },
      });
    }

    // Beacon glow for active node
    if (isActive && !locked) {
      const beacon = this.add.circle(x, y, radius + 14, PAPER.gold, 0.1).setDepth(9);
      this.tweens.add({
        targets: beacon,
        alpha: 0.3,
        duration: 1500,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const maxLabelY = area.bottom - 130;
    const labelY = Math.min(y + radius + 18, maxLabelY);
    const labelW = 260;
    const labelH = 64;
    const labelPanel = PaperPanel(this, x, labelY, labelW, labelH, {
      color: locked ? PAPER.sand : PAPER.white,
      alpha: 0.95,
      radius: 14,
    });
    if (labelPanel.shadow) labelPanel.shadow.setDepth(12);
    if (labelPanel.bg) labelPanel.bg.setDepth(12);
    this.add.text(x, labelY - 12, info.name, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '17px',
      color: locked ? PAPER_CSS.inkTeal : PAPER_CSS.orange,
      stroke: locked ? undefined : PAPER_CSS.inkTeal,
      strokeThickness: locked ? 0 : 2,
    }).setOrigin(0.5).setDepth(13);
    this.add.text(x, labelY + 12, info.tagline, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '15px',
      color: locked ? PAPER_CSS.forest : PAPER_CSS.forestD,
    }).setOrigin(0.5).setDepth(13);

    if (!locked) {
      // Create an invisible hit zone for interaction instead of ring stroke
      const hitZone = this.add.circle(x, y, radius, PAPER.white, 0).setDepth(10);
      hitZone.setInteractive({ useHandCursor: true });
      // Gentle pulse on the inner graphics
      this.tweens.add({
        targets: inner,
        alpha: 0.85,
        duration: 1200,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
      hitZone.on('pointerup', () => {
        if (this._navLocked || this._mapHeroWalking) return;
        audio.play('ui/confirm');
        const targetNodeIndex = info.id - 1;
        this.walkHeroToNode(targetNodeIndex, () => {
          this.enterFloor(info.id);
        });
      });
    }
  }

  drawMiniDiorama(cx, cy, r, floorId, alphaScale = 1.0) {
    const gfx = this.add.graphics().setDepth(11);
    if (alphaScale < 1) gfx.setAlpha(alphaScale);

    // Palette per floor from PAPER
    const palettes = {
      1: { sky: PAPER.cream,     ground: PAPER.sage,      accent: PAPER.coral,    detail: PAPER.forest,   sun: PAPER.gold },
      2: { sky: PAPER.sky,       ground: PAPER.tealL,     accent: PAPER.peach,    detail: PAPER.teal,     sun: PAPER.gold },
      3: { sky: PAPER.cream,     ground: PAPER.creamD,    accent: PAPER.gold,     detail: PAPER.sage,     sun: PAPER.gold },
      4: { sky: PAPER.sand,      ground: PAPER.coralD,    accent: PAPER.orange,   detail: PAPER.coral,    sun: PAPER.orange },
      5: { sky: PAPER.cream,     ground: PAPER.sky,       accent: PAPER.cream,    detail: PAPER.teal,     sun: PAPER.sky },
      6: { sky: PAPER.lavenderD, ground: PAPER.lavender,  accent: PAPER.lavender, detail: PAPER.teal,     sun: PAPER.sky },
      7: { sky: PAPER.cream,     ground: PAPER.sand,      accent: PAPER.gold,     detail: PAPER.forestL,  sun: PAPER.gold },
      8: { sky: PAPER.sand,      ground: PAPER.creamD,    accent: PAPER.orange,   detail: PAPER.forestL,  sun: PAPER.orange },
      9: { sky: PAPER.tealD,     ground: PAPER.tealD,     accent: PAPER.rose,     detail: PAPER.teal,     sun: PAPER.lavender },
    };
    const p = palettes[floorId] || palettes[1];

    // Sky
    gfx.fillStyle(p.sky, 1);
    gfx.fillCircle(cx, cy, r);

    // Sun/moon
    const isMoon = floorId === 6 || floorId === 9;
    const celestialX = cx + r * 0.35;
    const celestialY = cy - r * 0.50;
    const celestialR = r * 0.14;
    gfx.fillStyle(p.sun, 0.9);
    gfx.fillCircle(celestialX, celestialY, celestialR);
    if (!isMoon) {
      gfx.fillStyle(p.sun, 0.2);
      gfx.fillCircle(celestialX, celestialY, celestialR * 1.8);
    } else {
      gfx.fillStyle(p.sky, 1);
      gfx.fillCircle(celestialX + celestialR * 0.4, celestialY - celestialR * 0.3, celestialR * 0.8);
    }

    // Clouds
    gfx.fillStyle(PAPER.white, 0.25);
    gfx.fillEllipse(cx - r * 0.4, cy - r * 0.35, r * 0.3, r * 0.1);
    gfx.fillEllipse(cx - r * 0.3, cy - r * 0.38, r * 0.2, r * 0.08);
    gfx.fillStyle(PAPER.white, 0.18);
    gfx.fillEllipse(cx + r * 0.05, cy - r * 0.25, r * 0.25, r * 0.08);

    // Ground
    gfx.fillStyle(p.ground, 1);
    gfx.beginPath();
    gfx.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI, false);
    gfx.lineTo(cx, cy + r);
    gfx.closePath();
    gfx.fillPath();

    // Background hills
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * r * 0.4;
      const baseY = cy + r * 0.1;
      const peakH = r * (0.30 + (i % 2) * 0.18);
      gfx.fillStyle(p.detail, 0.7);
      gfx.fillTriangle(cx + dx - r * 0.28, baseY, cx + dx, baseY - peakH, cx + dx + r * 0.28, baseY);
    }

    // Trees
    const treePositions = [
      { dx: -r * 0.45, dy: r * 0.15, h: r * 0.28 },
      { dx: -r * 0.2,  dy: r * 0.22, h: r * 0.22 },
      { dx: r * 0.15,  dy: r * 0.18, h: r * 0.25 },
      { dx: r * 0.40,  dy: r * 0.24, h: r * 0.20 },
    ];
    for (const tree of treePositions) {
      const tx = cx + tree.dx;
      const ty = cy + tree.dy;
      gfx.fillStyle(p.detail, 0.6);
      gfx.fillRect(tx - 1.5, ty - tree.h * 0.2, 3, tree.h * 0.3);
      gfx.fillStyle(p.detail, 0.9);
      const cw = tree.h * 0.5;
      gfx.fillTriangle(tx - cw, ty - tree.h * 0.15, tx, ty - tree.h, tx + cw, ty - tree.h * 0.15);
      gfx.fillTriangle(tx - cw * 0.8, ty - tree.h * 0.4, tx, ty - tree.h * 0.85, tx + cw * 0.8, ty - tree.h * 0.4);
    }

    // Accent dots
    for (let i = 0; i < 7; i++) {
      const angle = -0.7 + i * 0.35;
      const dist = r * (0.35 + (i % 3) * 0.12);
      const ax = cx + Math.cos(angle) * dist;
      const ay = cy + Math.sin(angle) * dist - r * 0.1;
      gfx.fillStyle(p.accent, 0.85);
      gfx.fillCircle(ax, ay, r * 0.04 + i * 0.6);
    }

    // Path
    gfx.lineStyle(r * 0.04, p.accent, 0.3);
    gfx.beginPath();
    gfx.moveTo(cx - r * 0.5, cy + r * 0.45);
    gfx.lineTo(cx - r * 0.15, cy + r * 0.2);
    gfx.lineTo(cx + r * 0.2, cy + r * 0.3);
    gfx.lineTo(cx + r * 0.4, cy + r * 0.15);
    gfx.strokePath();

    // Border ring (no stroke - use a thin blob ring shadow instead)
    gfx.fillStyle(p.detail, 0);
    // Subtle edge shadow
    const borderGfx = this.add.graphics().setDepth(11);
    if (alphaScale < 1) borderGfx.setAlpha(alphaScale);
    borderGfx.lineStyle(2.5, p.detail, 0.4);
    borderGfx.strokeCircle(cx, cy, r);
  }

  drawPaperPadlock(cx, cy, size) {
    const bodyW = size * 1.3;
    const bodyH = size * 1.1;
    const bodyY = cy + size * 0.15;

    const shackle = this.add.graphics();
    shackle.lineStyle(size * 0.22, PAPER.creamD, 1);
    shackle.beginPath();
    shackle.arc(cx, cy - size * 0.35, size * 0.5, Math.PI, 0, false);
    shackle.strokePath();
    shackle.lineStyle(size * 0.08, PAPER.sand, 1);
    shackle.beginPath();
    shackle.arc(cx - 1, cy - size * 0.35 - 1, size * 0.5 - 1, Math.PI + 0.1, 2 * Math.PI - 0.3, false);
    shackle.strokePath();

    const shadow = this.add.graphics();
    shadow.fillStyle(PAPER.shadow, 0.2);
    shadow.fillRoundedRect(cx - bodyW / 2 + 2, bodyY - bodyH / 2 + 4, bodyW, bodyH, 6);

    const body = this.add.graphics();
    body.fillStyle(PAPER.forestD, 1);
    body.fillRoundedRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 6);

    const kh = this.add.graphics();
    kh.fillStyle(PAPER.gold, 1);
    kh.fillCircle(cx, bodyY - size * 0.05, size * 0.14);
    kh.fillRect(cx - size * 0.05, bodyY - size * 0.05, size * 0.1, size * 0.3);
  }

  buildPaths() {
    const pathGfx = this.add.graphics().setDepth(5);
    for (let i = 0; i < this.nodePositions.length - 1; i++) {
      const from = this.nodePositions[i];
      const to = this.nodePositions[i + 1];
      const active = this.save.floors[i]?.complete;

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 40;
      const pts = this.sampleBezier(from.x, from.y, midX, midY, to.x, to.y, 32);

      pathGfx.lineStyle(8, active ? PAPER.orange : PAPER.creamD, 0.9);
      this.strokePolyline(pathGfx, pts);

      if (active) {
        pathGfx.lineStyle(3, PAPER.gold, 0.9);
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

  buildMapHero() {
    this.mapHeroNodeIndex = 0;
    for (let i = 8; i >= 0; i--) {
      if (this.save.floors[i]?.complete) {
        this.mapHeroNodeIndex = i;
        break;
      }
    }

    const pos = this.nodePositions[this.mapHeroNodeIndex];
    if (!pos) return;

    const heroOffX = -20;
    const heroOffY = 100 + 20;
    const heroX = pos.x + heroOffX;
    const heroY = pos.y + heroOffY;

    const leadHero = this.save.party && this.save.party[0]
      ? getHeroById(this.save.party[0].id)
      : null;

    if (leadHero) {
      this.mapHero = drawHeroSprite(this, heroX, heroY, leadHero, { scale: 0.4, equipment: this.save.equipment?.[leadHero.id] });
    } else {
      this.mapHero = this.add.circle(heroX, heroY, 12, PAPER.gold);
    }
    this.mapHero.setDepth(15);

    this._mapHeroBob = this.tweens.add({
      targets: this.mapHero,
      y: this.mapHero.y - 3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this._mapHeroWalking = false;
  }

  walkHeroToNode(targetNodeIndex, onComplete) {
    if (!this.mapHero) {
      onComplete();
      return;
    }

    const fromIndex = this.mapHeroNodeIndex;
    if (fromIndex === targetNodeIndex) {
      onComplete();
      return;
    }

    this._mapHeroWalking = true;

    if (this._mapHeroBob) {
      this._mapHeroBob.stop();
    }

    const step = fromIndex < targetNodeIndex ? 1 : -1;
    let allPoints = [];
    let idx = fromIndex;
    while (idx !== targetNodeIndex) {
      const nextIdx = idx + step;
      const from = this.nodePositions[idx];
      const to = this.nodePositions[nextIdx];
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 40;
      const pts = step > 0
        ? this.sampleBezier(from.x, from.y, midX, midY, to.x, to.y, 16)
        : this.sampleBezier(to.x, to.y, midX, midY, from.x, from.y, 16).reverse();
      if (allPoints.length > 0) pts.shift();
      allPoints = allPoints.concat(pts);
      idx = nextIdx;
    }

    if (allPoints.length < 2) {
      this._mapHeroWalking = false;
      onComplete();
      return;
    }

    const heroOffX = -20;
    const heroOffY = 100 + 20;
    const totalDuration = 1000;
    const segDuration = totalDuration / (allPoints.length - 1);

    const targetX = this.nodePositions[targetNodeIndex].x;
    const startX = this.nodePositions[fromIndex].x;
    if (this.mapHero.setFlipX) {
      this.mapHero.setFlipX(targetX < startX);
    }

    let pointIndex = 0;
    const walkStep = () => {
      pointIndex++;
      if (pointIndex >= allPoints.length) {
        const destPos = this.nodePositions[targetNodeIndex];
        this.mapHero.setPosition(destPos.x + heroOffX, destPos.y + heroOffY);
        this.mapHeroNodeIndex = targetNodeIndex;
        this._mapHeroWalking = false;
        this._mapHeroBob = this.tweens.add({
          targets: this.mapHero,
          y: this.mapHero.y - 3,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        onComplete();
        return;
      }

      const pt = allPoints[pointIndex];
      const bobPhase = (pointIndex / allPoints.length) * Math.PI * 6;
      const bob = Math.sin(bobPhase) * 3;

      this.tweens.add({
        targets: this.mapHero,
        x: pt.x + heroOffX,
        y: pt.y + heroOffY + bob,
        duration: segDuration,
        ease: 'Linear',
        onComplete: walkStep,
      });
    };

    this.mapHero.setPosition(allPoints[0].x + heroOffX, allPoints[0].y + heroOffY);
    walkStep();
  }

  buildHUD() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    const title = this.add.text(GAME_WIDTH / 2, 80, 'WORLD MAP', {
      ...TEXT.title(),
      fontSize: '40px',
      color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0);

    const homeBtn = PaperButton(this, area.left + 100, area.top + 45, '← HOME', {
      w: 180, h: 64, color: PAPER.white, fontSize: 22,
      textColor: PAPER_CSS.coralD,
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.TITLE);
      },
    });
    this.setScrollFactorDeep(homeBtn, 0);

    const goldPanel = PaperPanel(this, area.left + 320, area.top + 45, 200, 54, {
      color: PAPER.white, alpha: 0.95, radius: 16,
    });
    this.setScrollFactorDeep(goldPanel, 0);
    const goldIcon = this.add.text(area.left + 228, area.top + 45, '💰', { fontSize: '22px' }).setOrigin(0, 0.5).setScrollFactor(0);
    const goldText = this.add.text(area.left + 258, area.top + 38, `${this.save.gold}`, {
      ...TEXT.heading(), fontSize: '20px', color: PAPER_CSS.orange,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const potIcon = this.add.text(area.left + 330, area.top + 45, '🧪', { fontSize: '22px' }).setOrigin(0, 0.5).setScrollFactor(0);
    const potText = this.add.text(area.left + 360, area.top + 38, `${this.save.potions}`, {
      ...TEXT.heading(), fontSize: '20px', color: PAPER_CSS.forest,
    }).setOrigin(0, 0.5).setScrollFactor(0);

    if (this.save.party && this.save.party.length > 0) {
      const stripW = 220;
      const stripCx = area.right - stripW / 2 - 80;
      const stripY = area.top + 45;
      const partyPanel = PaperPanel(this, stripCx, stripY, stripW, 70, {
        color: PAPER.white, alpha: 0.95, radius: 16,
      });
      this.setScrollFactorDeep(partyPanel, 0);
      const partyLabel = this.add.text(stripCx - stripW / 2 + 12, stripY - 24, 'PARTY', {
        ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.forest,
      }).setScrollFactor(0);
      const editHint = this.add.text(stripCx + stripW / 2 - 12, stripY - 24, 'TAP TO EDIT', {
        ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.sage,
      }).setOrigin(1, 0).setScrollFactor(0);
      for (let i = 0; i < 3; i++) {
        const hx = stripCx - stripW / 2 + 50 + i * 65;
        const slot = this.save.party[i];
        if (slot) {
          const heroDef = getHeroById(slot.id);
          if (heroDef) {
            const wmEvoStage = getEvolutionStage(this.save, heroDef.id);
            const img = drawHeroSprite(this, hx, stripY - 4, heroDef, { scale: 0.35, evolutionStage: wmEvoStage, equipment: this.save.equipment?.[heroDef.id] });
            img.setScrollFactor(0);
            const lvlChip = this.add.text(hx, stripY + 30, `Lv${slot.level || 1}`, {
              fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
              fontSize: '13px', color: '#f0d060', stroke: '#1f4244', strokeThickness: 3,
            }).setOrigin(0.5).setScrollFactor(0);
          }
        }
      }
      const partyZone = this.add.rectangle(stripCx, stripY, stripW, 70, PAPER.shadow, 0)
        .setScrollFactor(0).setInteractive({ useHandCursor: true });
      partyZone.on('pointerup', () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.PARTY_SELECT, {
          grade: this.save.grade,
          returnScene: SCENES.WORLD_MAP,
        }, 200);
      });
    }

    // Bottom toolbar
    const bottomY = area.bottom - 36;
    const bBtnW = 130;
    const bBtnH = 50;
    const bBtnGap = 16;
    const bTotalW = 6 * bBtnW + 5 * bBtnGap;
    const bStartX = area.cx - bTotalW / 2 + bBtnW / 2;

    const dailyCompleted = isDailyChallengeCompleted(this.save);
    const dailyBtn = PaperButton(this, bStartX, bottomY, 'DAILY', {
      w: bBtnW, h: bBtnH, color: dailyCompleted ? PAPER.sand : PAPER.orange, fontSize: 16,
      textColor: dailyCompleted ? PAPER_CSS.forest : PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/click');
        this.onDailyChallenge();
      },
    });
    this.setScrollFactorDeep(dailyBtn, 0);

    const skillsBtn = PaperButton(this, bStartX + (bBtnW + bBtnGap), bottomY, 'SKILLS', {
      w: bBtnW, h: bBtnH, color: PAPER.teal, fontSize: 16,
      textColor: PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.MASTERY, undefined, 200);
      },
    });
    this.setScrollFactorDeep(skillsBtn, 0);

    const shopBtn = PaperButton(this, bStartX + 2 * (bBtnW + bBtnGap), bottomY, 'SHOP', {
      w: bBtnW, h: bBtnH, color: PAPER.orange, fontSize: 16,
      textColor: PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SHOP, undefined, 200);
      },
    });
    this.setScrollFactorDeep(shopBtn, 0);

    const galleryBtn = PaperButton(this, bStartX + 3 * (bBtnW + bBtnGap), bottomY, 'GALLERY', {
      w: bBtnW, h: bBtnH, color: PAPER.lavender, fontSize: 15,
      textColor: PAPER_CSS.cream,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.GALLERY, undefined, 200);
      },
    });
    this.setScrollFactorDeep(galleryBtn, 0);

    // SPIRE unlocks after Floor 3 (floor id 3 = index 2).
    const spireUnlocked = !!this.save.floors?.[2]?.complete;
    const spireBtn = PaperButton(this, bStartX + 4 * (bBtnW + bBtnGap), bottomY, spireUnlocked ? 'SPIRE' : '🔒 SPIRE', {
      w: bBtnW, h: bBtnH, color: spireUnlocked ? PAPER.coralD : PAPER.sand, fontSize: 16,
      textColor: spireUnlocked ? PAPER_CSS.cream : PAPER_CSS.forest,
      onClick: () => {
        if (!spireUnlocked) { audio.play('ui/click'); this.showFlash('Beat Floor 3 to unlock!'); return; }
        audio.play('ui/click');
        transitionTo(this, SCENES.TOWER, undefined, 200);
      },
    });
    this.setScrollFactorDeep(spireBtn, 0);

    const settingsBtn = PaperButton(this, bStartX + 5 * (bBtnW + bBtnGap), bottomY, '⚙', {
      w: bBtnW, h: bBtnH, color: PAPER.tealL, fontSize: 20,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.WORLD_MAP }, 200);
      },
    });
    this.setScrollFactorDeep(settingsBtn, 0);

    const arrowStyle = { w: 110, h: 60, color: PAPER.orange, fontSize: 20, textColor: PAPER_CSS.cream };
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
    bg.fillStyle(PAPER.cream, 0.9);
    bg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14);
    bg.lineStyle(2, PAPER.orange, 0.5);
    bg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 14);

    const title = this.add.text(panelX, panelY - panelH / 2 + 16, 'DAILY QUESTS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '16px', color: PAPER_CSS.orange,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(901);

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      const p = progress.quests[i];
      const qy = panelY - panelH / 2 + 38 + i * 36;
      const done = p.progress >= q.target;
      const claimed = p.claimed;

      const dot = this.add.circle(panelX - panelW / 2 + 16, qy + 6, 5,
        claimed ? PAPER.forest : (done ? PAPER.gold : PAPER.creamD)
      ).setScrollFactor(0).setDepth(901);

      const label = this.add.text(panelX - panelW / 2 + 28, qy, q.label, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '16px', color: claimed ? PAPER_CSS.sage : PAPER_CSS.inkTeal,
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(901);

      const prog = this.add.text(panelX + panelW / 2 - 16, qy,
        claimed ? '✓' : `${Math.min(p.progress, q.target)}/${q.target}`, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '16px', color: claimed ? PAPER_CSS.forest : (done ? PAPER_CSS.gold : PAPER_CSS.sage),
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(901);

      if (done && !claimed) {
        const claimBtn = this.add.text(panelX + panelW / 2 - 14, qy, `+${q.reward}g`, {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
          fontSize: '16px', color: PAPER_CSS.gold, stroke: PAPER_CSS.inkTeal, strokeThickness: 2,
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

    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.5)
      .setScrollFactor(0).setDepth(990).setInteractive();

    const panel = this.add.graphics().setScrollFactor(0).setDepth(991);
    panel.fillStyle(PAPER.cream, 0.95);
    panel.fillRoundedRect(area.cx - 200, area.cy - 120, 400, 240, 20);
    panel.lineStyle(3, PAPER.orange, 0.6);
    panel.strokeRoundedRect(area.cx - 200, area.cy - 120, 400, 240, 20);

    const title = this.add.text(area.cx, area.cy - 80, 'DAILY LOGIN REWARD!', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '28px', color: PAPER_CSS.orange, stroke: PAPER_CSS.inkTeal, strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const dayText = this.add.text(area.cx, area.cy - 30, `Day ${reward.streakDay} Streak`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const rewardText = this.add.text(area.cx, area.cy + 20, reward.label, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '36px', color: PAPER_CSS.gold, stroke: PAPER_CSS.inkTeal, strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(992);

    const okBtn = PaperButton(this, area.cx, area.cy + 80, 'COLLECT!', {
      w: 200, h: 56, color: PAPER.forest, fontSize: 22,
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
      const dot = this.add.circle(dx, dy, 8, PAPER.white, 0.4).setScrollFactor(0);
      this.pageDots.push(dot);
    }
  }

  updatePageDots() {
    for (let i = 0; i < this.pageDots.length; i++) {
      const active = i === this.currentScreen;
      const reachable = i <= this.maxScreen;
      this.pageDots[i].setFillStyle(
        active ? PAPER.gold : (reachable ? PAPER.white : PAPER.creamD),
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
      color: PAPER_CSS.orange,
      backgroundColor: PAPER_CSS.cream,
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

    let hasSavedState = !!this.registry.get(mazeStateKey(floorId));
    if (!hasSavedState) {
      try { hasSavedState = !!localStorage.getItem(`mw_maze_${floorId}`); } catch (e) { /* ignore */ }
    }

    const entryKey = `floor${floorId}_entry`;
    const lines = DIALOGUE[entryKey];
    if (lines && lines.length > 0 && !hasSavedState) {
      transitionTo(this, SCENES.CUTSCENE, {
        lines,
        floorId,
        nextScene: SCENES.MAZE,
        nextData: { floor: floorId, fromWorldMap: true },
      }, 300, 'circle');
    } else {
      transitionTo(this, SCENES.MAZE, { floor: floorId, fromWorldMap: true }, 300, 'circle');
    }
  }

  showHeroDetail(heroId) {
    if (this._detailOpen) return;
    this._detailOpen = true;
    const hero = getHeroById(heroId);
    if (!hero) return;
    const elements = [];
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const cx = area.cx, cy = area.cy;
    const pw = 520, ph = 620;

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.5)
      .setScrollFactor(0).setDepth(950).setInteractive();
    elements.push(dim);

    const panel = this.add.graphics().setScrollFactor(0).setDepth(951);
    panel.fillStyle(PAPER.cream, 0.97);
    panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    panel.lineStyle(3, PAPER.orange, 0.6);
    panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    elements.push(panel);

    const wmDetailEvoStage = getEvolutionStage(this.save, hero.id);
    const portrait = drawHeroSprite(this, cx, cy - 180, hero, { scale: 1.1, evolutionStage: wmDetailEvoStage, equipment: this.save.equipment?.[hero.id] });
    portrait.setScrollFactor(0).setDepth(952);
    elements.push(portrait);

    const nameT = this.add.text(cx, cy - 90, hero.name.toUpperCase(), {
      ...TEXT.title(), fontSize: '30px', color: PAPER_CSS.orange,
      stroke: PAPER_CSS.cream, strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(nameT);

    const classLabel = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
    const rarCol = getRarityColor(hero.rarity);
    const classT = this.add.text(cx, cy - 58, `${classLabel} — ${getRarityLabel(hero.rarity)}`, {
      ...TEXT.body(), fontSize: '16px', color: rarCol.main || PAPER_CSS.forestD,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(classT);

    const partyEntry = (this.save.party || []).find(p => p.id === heroId);
    const level = partyEntry?.level || 1;
    const xp = partyEntry?.xp || 0;
    const bonus = levelBonuses(level);
    const hp = hero.maxHp + bonus.maxHp;
    const atk = hero.atk + bonus.atk;
    const def = hero.def + bonus.def;

    const levelT = this.add.text(cx, cy - 8, `LEVEL ${level}`, {
      ...TEXT.heading(), fontSize: '26px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(levelT);

    const nextXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level + 1] : LEVEL_THRESHOLDS[level];
    const currXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level] : nextXp;
    const frac = nextXp > currXp ? (xp - currXp) / (nextXp - currXp) : 1;

    const barW = 260, barH = 18, barX = cx - barW / 2, barY = cy + 18;
    const barBg = this.add.graphics().setScrollFactor(0).setDepth(952);
    barBg.fillStyle(PAPER.shadow, 0.2);
    barBg.fillRoundedRect(barX, barY, barW, barH, 8);
    barBg.fillStyle(PAPER.forest, 0.9);
    barBg.fillRoundedRect(barX, barY, Math.max(barW * frac, 8), barH, 8);
    elements.push(barBg);

    const xpT = this.add.text(cx, barY + barH / 2, `${xp} / ${nextXp} XP`, {
      ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.cream,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(953);
    elements.push(xpT);

    const statsT = this.add.text(cx, cy + 58, `HP ${hp}    ATK ${atk}    DEF ${def}`, {
      ...TEXT.heading(), fontSize: '20px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(statsT);

    if (level > 1) {
      const bonusT = this.add.text(cx, cy + 82, `(+${bonus.maxHp} HP  +${bonus.atk} ATK  +${bonus.def} DEF from level)`, {
        ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.forest,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
      elements.push(bonusT);
    }

    const supersY = cy + 112;
    const supersTitle = this.add.text(cx, supersY, 'SUPER MOVES', {
      ...TEXT.heading(), fontSize: '16px', color: PAPER_CSS.orange,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(supersTitle);

    const allSupers = hero.superMoves || [];
    allSupers.forEach((s, i) => {
      const sy = supersY + 28 + i * 30;
      const unlocked = level >= (s.unlockLevel || 1);
      const icon = unlocked ? '>' : '?';
      const txt = this.add.text(cx - 100, sy, `${icon}  ${s.name}`, {
        ...TEXT.body(), fontSize: '16px',
        color: unlocked ? PAPER_CSS.inkTeal : PAPER_CSS.sage,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(952);
      elements.push(txt);
      const mult = this.add.text(cx + 100, sy, unlocked ? `${s.multiplier}x` : `Lv ${s.unlockLevel}`, {
        ...TEXT.stat(), fontSize: '16px',
        color: unlocked ? PAPER_CSS.orange : PAPER_CSS.sage,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(952);
      elements.push(mult);
    });

    const closeBtn = PaperButton(this, cx, cy + ph / 2 - 40, 'CLOSE', {
      w: 180, h: 50, color: PAPER.orange, fontSize: 20, textColor: PAPER_CSS.cream,
      onClick: () => {
        elements.forEach(e => { if (e && e.destroy) e.destroy(); });
        closeBtn.bg.destroy(); closeBtn.shadow.destroy();
        closeBtn.label.destroy(); if (closeBtn.zone) closeBtn.zone.destroy();
        this._detailOpen = false;
      },
    });
    closeBtn.bg.setScrollFactor(0).setDepth(953);
    closeBtn.shadow.setScrollFactor(0).setDepth(953);
    closeBtn.label.setScrollFactor(0).setDepth(953);
    if (closeBtn.zone) closeBtn.zone.setScrollFactor(0).setDepth(953);
  }

  // ================================================================
  // PARALLAX UPDATE
  // ================================================================

  update() {
    // Apply parallax offset to background objects based on camera scroll.
    // Each object shifts slightly relative to its screen's origin,
    // creating a depth illusion as the camera pans between screens.
    if (!this._parallaxObjects) return;
    const scrollX = this.cameras.main.scrollX;
    for (let s = 0; s < this._parallaxObjects.length; s++) {
      const screenOffsetX = s * SCREEN_W;
      const objs = this._parallaxObjects[s];
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (!obj.scene) continue; // destroyed
        obj.x = obj._baseX + (scrollX - screenOffsetX) * obj._parallaxFactor;
      }
    }
  }
}
