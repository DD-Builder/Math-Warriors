import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave } from '../systems/save.js';
import { spawnHero, getHeroById } from '../data/heroes.js';
import { audio } from '../systems/audio.js';

/**
 * WorldMapScene
 *
 * Five floor nodes laid out on a curved path across a dark stage.
 * Taps on an unlocked floor → battle. Locked floors show a lock icon
 * and a "complete previous floor" hint.
 *
 * Design principles this honors (see docs/DESIGN-PRINCIPLES.md):
 *   - "Visible progress" — completed floors get a gold star
 *   - "The dopamine loop is the engine" — HUD shows gold + progress
 *   - "Respect session length" — one tap to resume
 *   - "Clarity before complexity" — lock state is obvious at a glance
 *
 * v0.4 scope: placeholder rectangles for floor nodes. Real papercut
 * art slots in later by replacing the rectangles with sprite images.
 */
export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.WORLD_MAP });
  }

  init() {
    this.save = loadSave();
  }

  create() {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(COLORS.ink);
    audio.playMusic('music/map');

    this.buildBackground();
    this.buildHUD();
    this.buildFloorNodes();
  }

  // ================================================================
  // BACKGROUND — subtle atmospheric layers
  // ================================================================

  buildBackground() {
    // Vignette: dark edges, slightly-warmer center
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const glow = this.add.graphics();
    glow.fillStyle(0x2a1c08, 0.35);
    glow.fillCircle(cx, cy, 900);
    glow.fillStyle(0x4a2c10, 0.2);
    glow.fillCircle(cx, cy, 600);

    // Faint grid texture — a stand-in for the layered paper table
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x4a3420, 0.08);
    const spacing = 80;
    for (let x = 0; x < GAME_WIDTH; x += spacing) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += spacing) grid.lineBetween(0, y, GAME_WIDTH, y);

    // Title
    this.add.text(GAME_WIDTH / 2, 80, 'WORLD MAP', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '42px',
      color: COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 130, 'Choose Your Floor', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '22px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);
  }

  // ================================================================
  // HUD — gold, party strip, back button
  // ================================================================

  buildHUD() {
    // Top-left: gold counter
    this.add.rectangle(140, 40, 200, 60, COLORS.ink, 0.8)
      .setStrokeStyle(3, COLORS.gold);
    this.add.text(60, 40, '\u{1FA99}', {
      fontSize: '32px',
    }).setOrigin(0, 0.5);
    this.add.text(105, 40, `${this.save.gold}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0, 0.5);

    // Top-left below: potion counter
    this.add.rectangle(140, 110, 200, 60, COLORS.ink, 0.8)
      .setStrokeStyle(3, COLORS.goldL);
    this.add.text(60, 110, '\u{1F9EA}', {
      fontSize: '32px',
    }).setOrigin(0, 0.5);
    this.add.text(105, 110, `${this.save.potions}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);

    // Top-right: party strip (read-only)
    if (this.save.party && this.save.party.length > 0) {
      const stripW = 300;
      const stripX = GAME_WIDTH - stripW - 40;
      const stripY = 40;

      this.add.rectangle(stripX + stripW / 2, stripY + 40, stripW, 80, COLORS.ink, 0.8)
        .setStrokeStyle(3, COLORS.paperD);
      this.add.text(stripX + 15, stripY + 20, 'PARTY', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: COLORS_CSS.inkL,
      });

      for (let i = 0; i < 3; i++) {
        const x = stripX + 90 + i * 70;
        const y = stripY + 45;
        const slot = this.save.party[i];
        if (slot) {
          const def = getHeroById(slot.id);
          if (def) {
            this.add.rectangle(x, y, 50, 50, def.displayColor)
              .setStrokeStyle(2, COLORS.ink);
            // HP bar under the portrait
            const pct = (slot.hp ?? slot.maxHp) / slot.maxHp;
            this.add.rectangle(x, y + 36, 48, 6, COLORS.ink)
              .setStrokeStyle(1, COLORS.paperD, 0.6);
            this.add.rectangle(x - 23, y + 36, 46 * pct, 4, 0x40c040)
              .setOrigin(0, 0.5);
          }
        } else {
          this.add.rectangle(x, y, 50, 50, COLORS.ink, 0.4)
            .setStrokeStyle(2, COLORS.paperD, 0.4);
        }
      }
    }

    // Back to title (top-right corner, small)
    const backBg = this.add.rectangle(GAME_WIDTH - 80, GAME_HEIGHT - 50, 130, 50, COLORS.paperD)
      .setStrokeStyle(3, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 80, GAME_HEIGHT - 50, 'TITLE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: COLORS_CSS.ink,
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => {
      audio.play('ui/back');
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.TITLE);
      });
    });
  }

  // ================================================================
  // FLOOR NODES
  // ================================================================

  buildFloorNodes() {
    // Curving path from bottom-left to top-right
    const nodePositions = [
      { x: GAME_WIDTH * 0.18, y: GAME_HEIGHT * 0.80 },  // Floor 1
      { x: GAME_WIDTH * 0.38, y: GAME_HEIGHT * 0.60 },  // Floor 2
      { x: GAME_WIDTH * 0.58, y: GAME_HEIGHT * 0.72 },  // Floor 3
      { x: GAME_WIDTH * 0.78, y: GAME_HEIGHT * 0.50 },  // Floor 4
      { x: GAME_WIDTH * 0.58, y: GAME_HEIGHT * 0.32 },  // Floor 5
    ];

    const floorInfo = [
      { id: 1, name: 'THE GARDEN',      op: '+', color: 0x4a9830, tagline: 'Addition' },
      { id: 2, name: 'TIDEPOOL RUINS',  op: '-', color: 0x2060b0, tagline: 'Subtraction' },
      { id: 3, name: 'CLOUD MAZE',      op: '\u00d7', color: 0xb0d4f0, tagline: 'Multiplication' },
      { id: 4, name: 'EMBER CAVES',     op: '\u00f7', color: 0xb03010, tagline: 'Division' },
      { id: 5, name: 'MENDING ROOM',    op: '\u221e', color: 0x8830b8, tagline: 'All Ops' },
    ];

    // Draw paths between nodes first (behind the nodes). Phaser.Graphics
    // doesn't have quadraticCurveTo like Canvas 2D does, so we sample the
    // bezier curve ourselves and stroke a polyline through the points.
    const pathGfx = this.add.graphics();
    const sampleBezier = (ax, ay, cx, cy, bx, by, steps) => {
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
    };
    const strokePolyline = (gfx, pts) => {
      if (pts.length < 2) return;
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
      gfx.strokePath();
    };

    for (let i = 0; i < nodePositions.length - 1; i++) {
      const from = nodePositions[i];
      const to = nodePositions[i + 1];
      const fromSave = this.save.floors[i];
      const active = fromSave?.complete;

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 40;
      const pts = sampleBezier(from.x, from.y, midX, midY, to.x, to.y, 32);

      pathGfx.lineStyle(8, active ? COLORS.gold : 0x3a2810, 0.9);
      strokePolyline(pathGfx, pts);

      if (active) {
        pathGfx.lineStyle(3, 0xffe080, 0.9);
        strokePolyline(pathGfx, pts);
      }
    }

    // Now the nodes themselves
    nodePositions.forEach((pos, i) => {
      const info = floorInfo[i];
      const saved = this.save.floors[i];
      const locked = !saved.unlocked;
      const complete = saved.complete;

      this.createFloorNode(pos.x, pos.y, info, locked, complete);
    });
  }

  createFloorNode(x, y, info, locked, complete) {
    const radius = 85;

    // Shadow
    this.add.circle(x + 6, y + 10, radius, COLORS.ink, 0.6);

    // Outer ring
    const ring = this.add.circle(x, y, radius, locked ? 0x3a3028 : info.color)
      .setStrokeStyle(8, locked ? 0x5a5040 : COLORS.gold);

    // Inner circle with operator symbol
    const inner = this.add.circle(x, y, radius - 12, locked ? 0x1a1008 : COLORS.ink, 0.9);

    // Floor number
    this.add.text(x - radius * 0.65, y - radius * 0.65, `${info.id}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: locked ? COLORS_CSS.inkL : COLORS_CSS.goldL,
      stroke: COLORS_CSS.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Operator symbol (big, centered)
    this.add.text(x, y, info.op, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '72px',
      color: locked ? '#5a5040' : COLORS_CSS.paper,
      stroke: COLORS_CSS.ink,
      strokeThickness: 5,
    }).setOrigin(0.5);

    // Completion star
    if (complete) {
      this.add.text(x + radius * 0.6, y - radius * 0.6, '\u2605', {
        fontSize: '40px',
        color: COLORS_CSS.goldL,
        stroke: COLORS_CSS.ink,
        strokeThickness: 4,
      }).setOrigin(0.5);
    }

    // Floor name label below
    const label = this.add.rectangle(x, y + radius + 30, 280, 50, COLORS.ink, 0.9)
      .setStrokeStyle(3, locked ? COLORS.paperD : COLORS.gold);
    this.add.text(x, y + radius + 24, info.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: locked ? COLORS_CSS.inkL : COLORS_CSS.goldL,
    }).setOrigin(0.5);
    this.add.text(x, y + radius + 44, info.tagline, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '14px',
      color: COLORS_CSS.paper,
    }).setOrigin(0.5);

    // Interactivity
    if (!locked) {
      ring.setInteractive({ useHandCursor: true });

      // Gentle pulse animation to draw the eye
      this.tweens.add({
        targets: ring,
        scale: 1.05,
        duration: 1200,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });

      ring.on('pointerdown', () => {
        audio.play('ui/confirm');
        this.enterFloor(info.id);
      });
    } else {
      // Lock indicator
      this.add.text(x, y + radius * 0.3, '\u{1F512}', {
        fontSize: '32px',
      }).setOrigin(0.5).setAlpha(0.8);
    }
  }

  enterFloor(floorId) {
    // Rehydrate party from save (with persistent HP)
    const party = [];
    for (const saved of this.save.party) {
      if (!saved || !saved.id) continue;
      const hero = spawnHero(saved.id);
      if (hero) {
        hero.hp = saved.hp ?? hero.maxHp;
        party.push(hero);
      }
    }
    if (party.length === 0) {
      // No saved party — bounce to party select
      this.scene.start(SCENES.PARTY_SELECT, { grade: this.save.grade });
      return;
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.BATTLE, {
        party,
        floor: floorId,
        grade: this.save.grade,
      });
    });
  }
}
