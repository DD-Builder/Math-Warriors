import Phaser from 'phaser';
import { SCENES, COLORS, GAME_WIDTH, GAME_HEIGHT, mazeStateKey } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { spawnHero, getHeroById, KNIGHTS, WIZARDS, BUNNIES, levelBonuses, LEVEL_THRESHOLDS, getRarityColor, getRarityLabel } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawWorldMapGarden, drawWorldMapCaves, drawWorldMapStarlitHighlands } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { getEvolutionStage } from '../systems/evolution.js';
import { getDailyChallenge, isDailyChallengeCompleted } from '../systems/dailyChallenge.js';
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

    // Cleanup: node sparkle loop timers and pulse tweens on exit
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
    for (let s = 0; s < TOTAL_SCREENS; s++) {
      const offsetX = s * SCREEN_W;
      const before = this.children.list.length;
      drawFns[s](this, SCREEN_W, GAME_HEIGHT, 777 + s * 100);
      const after = this.children.list.length;
      for (let i = before; i < after; i++) {
        const obj = this.children.list[i];
        if (obj && obj.x !== undefined) obj.x += offsetX;
      }

      if (s > this.maxScreen) {
        const screenNames = ['', 'CRYSTAL CAVES', 'STARLIT HIGHLANDS'];
        this.add.rectangle(
          offsetX + SCREEN_W / 2, GAME_HEIGHT / 2,
          SCREEN_W, GAME_HEIGHT, 0x000000, 0.35
        );
        this.add.text(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2 - 60, screenNames[s] || '', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '32px',
          color: '#f0d040',
          stroke: '#1a0e04',
          strokeThickness: 5,
        }).setOrigin(0.5);
        this.drawPaperPadlock(offsetX + SCREEN_W / 2, GAME_HEIGHT / 2, 60);
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
      { rx: 0.20, ry: 0.72 },
      { rx: 0.50, ry: 0.36 },
      { rx: 0.80, ry: 0.64 },
    ];

    this.nodePositions = [];

    // Find the highest unlocked, incomplete node (active/current node)
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

    this.add.circle(x + 5, y + 8, radius, 0x000000, 0.3).setDepth(10);

    const nodeColor = locked ? 0x8a8070 : info.color;
    const ring = this.add.circle(x, y, radius, nodeColor).setDepth(10);
    ring.setStrokeStyle(5, locked ? 0x5a5040 : 0xfff8e0);

    const inner = this.add.circle(x, y, radius - 8, locked ? 0x5a5040 : 0xffffff, locked ? 0.8 : 1).setDepth(10);

    const numX = x - radius * 0.65;
    const numY = y - radius * 0.65;
    this.add.circle(numX, numY, 22, locked ? 0x5a5040 : 0xd07818)
      .setStrokeStyle(3, 0xfff8e0).setDepth(11);
    this.add.text(numX, numY, `${info.id}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px',
      color: '#fff8e0',
    }).setOrigin(0.5).setDepth(11);

    // Always draw a diorama — locked nodes get a dimmed version with a padlock on top
    if (locked) {
      this.drawMiniDiorama(x, y, radius - 8, info.id, 0.4);
      this.drawPaperPadlock(x, y, 30);
    } else {
      this.drawMiniDiorama(x, y, radius - 8, info.id, 1.0);
    }

    // --- Star rating for completed nodes (Item 48) ---
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
        gfx.fillStyle(isEarned ? 0xf0d060 : 0x606060, isEarned ? 1 : 0.3);
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

    // --- Particle effects for completed nodes (Item 22) ---
    if (complete && !locked) {
      const themeColor = info.color;
      const r = (themeColor >> 16) & 0xff;
      const g = (themeColor >> 8) & 0xff;
      const b = themeColor & 0xff;
      this.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => {
          const count = 3 + Math.floor(Math.random() * 2); // 3-4 particles
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

    // --- Beacon glow for active/current node (Item 22) ---
    if (isActive && !locked) {
      const beacon = this.add.circle(x, y, radius + 14, 0xf0d060, 0.1).setDepth(9);
      this.tweens.add({
        targets: beacon,
        alpha: 0.3,
        duration: 1500,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    const labelY = y + radius + 28;
    const labelW = 260;
    const labelH = 56;
    PaperPanel(this, x, labelY, labelW, labelH, {
      color: locked ? 0xc8b898 : 0xffffff,
      alpha: 0.95,
      radius: 14,
    });
    this.add.text(x, labelY - 10, info.name, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: locked ? '#3a2010' : '#d07818',
      stroke: locked ? undefined : '#3a2410',
      strokeThickness: locked ? 0 : 2,
    }).setOrigin(0.5);
    this.add.text(x, labelY + 12, info.tagline, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '15px',
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
        if (this._navLocked || this._mapHeroWalking) return;
        audio.play('ui/confirm');
        const targetNodeIndex = info.id - 1; // floor IDs are 1-based, node indices 0-based
        this.walkHeroToNode(targetNodeIndex, () => {
          this.enterFloor(info.id);
        });
      });
    }
  }

  drawMiniDiorama(cx, cy, r, floorId, alphaScale = 1.0) {
    const gfx = this.add.graphics().setDepth(11);
    if (alphaScale < 1) gfx.setAlpha(alphaScale);
    const palettes = {
      1: { sky: 0x68b8e8, skyTop: 0x4090d0, ground: 0x48a040, accent: 0xf06888, detail: 0x388828, sun: 0xf0e040 },
      2: { sky: 0x2878c0, skyTop: 0x184898, ground: 0x2070a0, accent: 0xf0a848, detail: 0x186898, sun: 0xf0c848 },
      3: { sky: 0x88c8f8, skyTop: 0x5898d8, ground: 0xb8e0f0, accent: 0xffd040, detail: 0xa0d0f0, sun: 0xfff0a0 },
      4: { sky: 0x4a1818, skyTop: 0x2a0808, ground: 0x6a2810, accent: 0xf0a020, detail: 0x882818, sun: 0xf06020 },
      5: { sky: 0x88c8f0, skyTop: 0x5898c0, ground: 0x90c8e0, accent: 0xd0f0ff, detail: 0x5898b8, sun: 0xe0f0ff },
      6: { sky: 0x281850, skyTop: 0x100830, ground: 0x4838a0, accent: 0xd0a0ff, detail: 0x5840b0, sun: 0xc0c0f0 },
      7: { sky: 0xd8a858, skyTop: 0xb08838, ground: 0x8a6828, accent: 0xf0c040, detail: 0xa07830, sun: 0xf0d860 },
      8: { sky: 0x3a2010, skyTop: 0x1a1008, ground: 0x4a3018, accent: 0xc8a050, detail: 0x5a4020, sun: 0xc8a050 },
      9: { sky: 0x382060, skyTop: 0x180840, ground: 0x4030a0, accent: 0xf0c0ff, detail: 0x5840c0, sun: 0xe0a0f0 },
    };
    const p = palettes[floorId] || palettes[1];

    // Sky gradient — fill the full circle with a richer sky
    gfx.fillStyle(p.skyTop, 1);
    gfx.fillCircle(cx, cy, r);
    // Lower sky — lighter band
    gfx.fillStyle(p.sky, 0.85);
    gfx.beginPath();
    gfx.arc(cx, cy, r, -0.15 * Math.PI, 1.15 * Math.PI, false);
    gfx.lineTo(cx, cy + r);
    gfx.closePath();
    gfx.fillPath();

    // Sun or moon
    const isMoon = floorId === 6 || floorId === 9;
    const celestialX = cx + r * 0.35;
    const celestialY = cy - r * 0.50;
    const celestialR = r * 0.14;
    gfx.fillStyle(p.sun, 0.9);
    gfx.fillCircle(celestialX, celestialY, celestialR);
    if (!isMoon) {
      // Sun rays
      gfx.fillStyle(p.sun, 0.25);
      gfx.fillCircle(celestialX, celestialY, celestialR * 1.8);
    } else {
      // Moon crescent — cut a circle out
      gfx.fillStyle(p.skyTop, 1);
      gfx.fillCircle(celestialX + celestialR * 0.4, celestialY - celestialR * 0.3, celestialR * 0.8);
    }

    // Clouds (small wispy shapes in the sky area)
    gfx.fillStyle(0xffffff, 0.25);
    gfx.fillEllipse(cx - r * 0.4, cy - r * 0.35, r * 0.3, r * 0.1);
    gfx.fillEllipse(cx - r * 0.3, cy - r * 0.38, r * 0.2, r * 0.08);
    gfx.fillStyle(0xffffff, 0.18);
    gfx.fillEllipse(cx + r * 0.05, cy - r * 0.25, r * 0.25, r * 0.08);

    // Ground — rolling hills fill the bottom half
    gfx.fillStyle(p.ground, 1);
    gfx.beginPath();
    gfx.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI, false);
    gfx.lineTo(cx, cy + r);
    gfx.closePath();
    gfx.fillPath();

    // Background hills — behind the main terrain
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * r * 0.4;
      const baseY = cy + r * 0.1;
      const peakH = r * (0.30 + (i % 2) * 0.18);
      gfx.fillStyle(p.detail, 0.7);
      gfx.fillTriangle(cx + dx - r * 0.28, baseY, cx + dx, baseY - peakH, cx + dx + r * 0.28, baseY);
    }

    // Trees — small triangular evergreens
    const treePositions = [
      { dx: -r * 0.45, dy: r * 0.15, h: r * 0.28 },
      { dx: -r * 0.2,  dy: r * 0.22, h: r * 0.22 },
      { dx: r * 0.15,  dy: r * 0.18, h: r * 0.25 },
      { dx: r * 0.40,  dy: r * 0.24, h: r * 0.20 },
    ];
    for (const tree of treePositions) {
      const tx = cx + tree.dx;
      const ty = cy + tree.dy;
      // Trunk
      gfx.fillStyle(p.detail, 0.6);
      gfx.fillRect(tx - 1.5, ty - tree.h * 0.2, 3, tree.h * 0.3);
      // Canopy — layered triangles
      gfx.fillStyle(p.detail, 0.9);
      const cw = tree.h * 0.5;
      gfx.fillTriangle(tx - cw, ty - tree.h * 0.15, tx, ty - tree.h, tx + cw, ty - tree.h * 0.15);
      gfx.fillTriangle(tx - cw * 0.8, ty - tree.h * 0.4, tx, ty - tree.h * 0.85, tx + cw * 0.8, ty - tree.h * 0.4);
    }

    // Accent dots — flowers, sparkles, creatures
    for (let i = 0; i < 7; i++) {
      const angle = -0.7 + i * 0.35;
      const dist = r * (0.35 + (i % 3) * 0.12);
      const ax = cx + Math.cos(angle) * dist;
      const ay = cy + Math.sin(angle) * dist - r * 0.1;
      gfx.fillStyle(p.accent, 0.85);
      gfx.fillCircle(ax, ay, r * 0.04 + i * 0.6);
    }

    // Path/road winding through the scene
    gfx.lineStyle(r * 0.04, p.accent, 0.35);
    gfx.beginPath();
    gfx.moveTo(cx - r * 0.5, cy + r * 0.45);
    gfx.lineTo(cx - r * 0.15, cy + r * 0.2);
    gfx.lineTo(cx + r * 0.2, cy + r * 0.3);
    gfx.lineTo(cx + r * 0.4, cy + r * 0.15);
    gfx.strokePath();

    // Border ring
    gfx.lineStyle(2.5, p.detail, 0.6);
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
    const pathGfx = this.add.graphics().setDepth(5);
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

  /**
   * Place a small hero sprite on the world map at the last completed
   * floor node (or floor 1 if no progress). The sprite is stored as
   * this.mapHero so it can be animated when the player taps a node.
   */
  buildMapHero() {
    // Determine starting node: last completed floor, or 0 (floor 1) if none
    this.mapHeroNodeIndex = 0;
    for (let i = 8; i >= 0; i--) {
      if (this.save.floors[i]?.complete) {
        this.mapHeroNodeIndex = i;
        break;
      }
    }

    const pos = this.nodePositions[this.mapHeroNodeIndex];
    if (!pos) return;

    // Position hero slightly below and to the left of the node, as if approaching it
    const heroOffX = -20;
    const heroOffY = 100 + 20;  // radius + offset below the orb
    const heroX = pos.x + heroOffX;
    const heroY = pos.y + heroOffY;

    // Use the lead hero from the party if available
    const leadHero = this.save.party && this.save.party[0]
      ? getHeroById(this.save.party[0].id)
      : null;

    if (leadHero) {
      this.mapHero = drawHeroSprite(this, heroX, heroY, leadHero, { scale: 0.4 });
    } else {
      // Fallback: small colored circle
      this.mapHero = this.add.circle(heroX, heroY, 12, 0xf0c040);
    }
    this.mapHero.setDepth(15);

    // Idle bob tween
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

  /**
   * Animate the map hero along the path between nodes, then invoke
   * the callback when arrival is complete.
   */
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

    // Stop idle bob during walk
    if (this._mapHeroBob) {
      this._mapHeroBob.stop();
    }

    // Build the full path of points from current node to target node
    const step = fromIndex < targetNodeIndex ? 1 : -1;
    let allPoints = [];
    let idx = fromIndex;
    while (idx !== targetNodeIndex) {
      const nextIdx = idx + step;
      const from = this.nodePositions[idx];
      const to = this.nodePositions[nextIdx];
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 40;
      // step>0 => forward along path, step<0 => backward
      const pts = step > 0
        ? this.sampleBezier(from.x, from.y, midX, midY, to.x, to.y, 16)
        : this.sampleBezier(to.x, to.y, midX, midY, from.x, from.y, 16).reverse();
      // Skip the first point of subsequent segments to avoid duplicates
      if (allPoints.length > 0) pts.shift();
      allPoints = allPoints.concat(pts);
      idx = nextIdx;
    }

    if (allPoints.length < 2) {
      this._mapHeroWalking = false;
      onComplete();
      return;
    }

    // Offset hero position: slightly left and below the node orb
    const heroOffX = -20;
    const heroOffY = 100 + 20;  // radius + below offset
    const totalDuration = 1000; // ~1 second for the full walk
    const segDuration = totalDuration / (allPoints.length - 1);

    // Flip sprite based on direction
    const targetX = this.nodePositions[targetNodeIndex].x;
    const startX = this.nodePositions[fromIndex].x;
    if (this.mapHero.setFlipX) {
      this.mapHero.setFlipX(targetX < startX);
    }

    // Create a chain of tweens using timeline-like approach
    let pointIndex = 0;
    const walkStep = () => {
      pointIndex++;
      if (pointIndex >= allPoints.length) {
        // Arrived at destination — snap to offset position beside the node
        const destPos = this.nodePositions[targetNodeIndex];
        this.mapHero.setPosition(destPos.x + heroOffX, destPos.y + heroOffY);
        this.mapHeroNodeIndex = targetNodeIndex;
        this._mapHeroWalking = false;
        // Restart idle bob
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
      // Bobbing: oscillate 3px using sine of progress
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

    // Position at first point and start walking
    this.mapHero.setPosition(allPoints[0].x + heroOffX, allPoints[0].y + heroOffY);
    walkStep();
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
      stroke: '#3a2410', strokeThickness: 2,
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
      const editHint = this.add.text(stripCx + stripW / 2 - 12, stripY - 24, 'TAP TO EDIT', {
        ...TEXT.stat(), fontSize: '9px', color: '#8a7a60',
      }).setOrigin(1, 0).setScrollFactor(0);
      for (let i = 0; i < 3; i++) {
        const hx = stripCx - stripW / 2 + 50 + i * 65;
        const slot = this.save.party[i];
        if (slot) {
          const heroDef = getHeroById(slot.id);
          if (heroDef) {
            const wmEvoStage = getEvolutionStage(this.save, heroDef.id);
            const img = drawHeroSprite(this, hx, stripY - 4, heroDef, { scale: 0.35, evolutionStage: wmEvoStage });
            img.setScrollFactor(0);
          }
        }
      }
      const partyZone = this.add.rectangle(stripCx, stripY, stripW, 70, 0x000000, 0)
        .setScrollFactor(0).setInteractive({ useHandCursor: true });
      partyZone.on('pointerup', () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.PARTY_SELECT, {
          grade: this.save.grade,
          returnScene: SCENES.WORLD_MAP,
        }, 200);
      });
    }

    // Bottom toolbar: 5 buttons evenly distributed across safe area width
    const bottomY = area.bottom - 36;
    const bBtnW = 130;
    const bBtnH = 50;
    const bBtnGap = 16;
    const bTotalW = 5 * bBtnW + 4 * bBtnGap;
    const bStartX = area.cx - bTotalW / 2 + bBtnW / 2;

    const dailyCompleted = isDailyChallengeCompleted(this.save);
    const dailyBtn = PaperButton(this, bStartX, bottomY, 'DAILY', {
      w: bBtnW, h: bBtnH, color: dailyCompleted ? 0x8a8070 : 0xd07818, fontSize: 16,
      textColor: dailyCompleted ? '#6a4c28' : '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        this.onDailyChallenge();
      },
    });
    this.setScrollFactorDeep(dailyBtn, 0);

    const skillsBtn = PaperButton(this, bStartX + (bBtnW + bBtnGap), bottomY, 'SKILLS', {
      w: bBtnW, h: bBtnH, color: 0x4080c0, fontSize: 16,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.MASTERY, undefined, 200);
      },
    });
    this.setScrollFactorDeep(skillsBtn, 0);

    const shopBtn = PaperButton(this, bStartX + 2 * (bBtnW + bBtnGap), bottomY, 'SHOP', {
      w: bBtnW, h: bBtnH, color: 0xd07818, fontSize: 16,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SHOP, undefined, 200);
      },
    });
    this.setScrollFactorDeep(shopBtn, 0);

    const galleryBtn = PaperButton(this, bStartX + 3 * (bBtnW + bBtnGap), bottomY, 'GALLERY', {
      w: bBtnW, h: bBtnH, color: 0x9050c8, fontSize: 15,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.GALLERY, undefined, 200);
      },
    });
    this.setScrollFactorDeep(galleryBtn, 0);

    const settingsBtn = PaperButton(this, bStartX + 4 * (bBtnW + bBtnGap), bottomY, '⚙', {
      w: bBtnW, h: bBtnH, color: 0x4a6ca8, fontSize: 20,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.WORLD_MAP }, 200);
      },
    });
    this.setScrollFactorDeep(settingsBtn, 0);

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

    // Skip cutscene if player has saved maze state (they've already seen it)
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
        nextData: { floor: floorId },
      }, 300, 'circle');
    } else {
      transitionTo(this, SCENES.MAZE, { floor: floorId }, 300, 'circle');
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

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(950).setInteractive();
    elements.push(dim);

    const panel = this.add.graphics().setScrollFactor(0).setDepth(951);
    panel.fillStyle(0xf5ead0, 0.97);
    panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    panel.lineStyle(3, 0xd4a840, 0.8);
    panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 22);
    elements.push(panel);

    const wmDetailEvoStage = getEvolutionStage(this.save, hero.id);
    const portrait = drawHeroSprite(this, cx, cy - 180, hero, { scale: 1.1, evolutionStage: wmDetailEvoStage });
    portrait.setScrollFactor(0).setDepth(952);
    elements.push(portrait);

    const nameT = this.add.text(cx, cy - 90, hero.name.toUpperCase(), {
      ...TEXT.title(), fontSize: '30px', color: '#d07818',
      stroke: '#fff8e0', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(nameT);

    const classLabel = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
    const rarCol = getRarityColor(hero.rarity);
    const classT = this.add.text(cx, cy - 58, `${classLabel} — ${getRarityLabel(hero.rarity)}`, {
      ...TEXT.body(), fontSize: '16px', color: rarCol.main || '#5a3820',
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
      ...TEXT.heading(), fontSize: '26px', color: '#3a2410',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(levelT);

    const nextXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level + 1] : LEVEL_THRESHOLDS[level];
    const currXp = level < LEVEL_THRESHOLDS.length - 1 ? LEVEL_THRESHOLDS[level] : nextXp;
    const frac = nextXp > currXp ? (xp - currXp) / (nextXp - currXp) : 1;

    const barW = 260, barH = 18, barX = cx - barW / 2, barY = cy + 18;
    const barBg = this.add.graphics().setScrollFactor(0).setDepth(952);
    barBg.fillStyle(0x3a2410, 0.3);
    barBg.fillRoundedRect(barX, barY, barW, barH, 8);
    barBg.fillStyle(0x40a848, 0.9);
    barBg.fillRoundedRect(barX, barY, Math.max(barW * frac, 8), barH, 8);
    elements.push(barBg);

    const xpT = this.add.text(cx, barY + barH / 2, `${xp} / ${nextXp} XP`, {
      ...TEXT.stat(), fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(953);
    elements.push(xpT);

    const statsT = this.add.text(cx, cy + 58, `HP ${hp}    ATK ${atk}    DEF ${def}`, {
      ...TEXT.heading(), fontSize: '20px', color: '#3a2410',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(statsT);

    if (level > 1) {
      const bonusT = this.add.text(cx, cy + 82, `(+${bonus.maxHp} HP  +${bonus.atk} ATK  +${bonus.def} DEF from level)`, {
        ...TEXT.stat(), fontSize: '11px', color: '#6a8a40',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
      elements.push(bonusT);
    }

    const supersY = cy + 112;
    const supersTitle = this.add.text(cx, supersY, 'SUPER MOVES', {
      ...TEXT.heading(), fontSize: '16px', color: '#c06a10',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(952);
    elements.push(supersTitle);

    const allSupers = hero.superMoves || [];
    allSupers.forEach((s, i) => {
      const sy = supersY + 28 + i * 30;
      const unlocked = level >= (s.unlockLevel || 1);
      const icon = unlocked ? '⚔' : '🔒';
      const txt = this.add.text(cx - 100, sy, `${icon}  ${s.name}`, {
        ...TEXT.body(), fontSize: '15px',
        color: unlocked ? '#3a2410' : '#8a7a60',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(952);
      elements.push(txt);
      const mult = this.add.text(cx + 100, sy, unlocked ? `${s.multiplier}x` : `Lv ${s.unlockLevel}`, {
        ...TEXT.stat(), fontSize: '13px',
        color: unlocked ? '#d07818' : '#8a7a60',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(952);
      elements.push(mult);
    });

    const closeBtn = PaperButton(this, cx, cy + ph / 2 - 40, 'CLOSE', {
      w: 180, h: 50, color: 0xd07818, fontSize: 20, textColor: '#fff8e0',
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
}
