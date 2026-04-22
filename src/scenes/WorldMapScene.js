import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave } from '../systems/save.js';
import { spawnHero, getHeroById } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';

/**
 * WorldMapScene
 *
 * Five quest nodes on a curved path. Taps on an unlocked quest open
 * the maze. Locked quests show a papercut padlock.
 *
 * Design principles this honors (see docs/DESIGN-PRINCIPLES.md):
 *   - Visible progress — completed quests get a gold star.
 *   - The dopamine loop is the engine — HUD shows gold + progress.
 *   - Respect session length — one tap to resume.
 *   - Clarity before complexity — lock state is obvious at a glance.
 */
export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.WORLD_MAP });
  }

  init() {
    this.save = loadSave();
  }

  create() {
    fadeInScene(this);
    audio.playMusic('music/map');

    this.buildBackground();
    this.buildHUD();
    this.buildFloorNodes();
  }

  // ================================================================
  // BACKGROUND — subtle atmospheric layers
  // ================================================================

  buildBackground() {
    // Full-screen papercut diorama using Floor 1's palette as the
    // "overworld" look. The world map is set in the garden world.
    drawPapercutBackground(this, 1, GAME_WIDTH, GAME_HEIGHT, 777);

    // Title
    this.add.text(GAME_WIDTH / 2, 100, 'WORLD MAP', {
      ...TEXT.title(),
      fontSize: '44px',
      color: '#fff8e0',
      stroke: '#3a2410',
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 150, 'Choose Your Adventure', {
      ...TEXT.body(),
      fontSize: '22px',
      color: '#fff8e0',
      stroke: '#3a2410',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0.5);
  }

  // ================================================================
  // HUD — gold, party strip, back button
  // ================================================================

  buildHUD() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);

    // HOME button — top-left, prominent cream paper pill.
    PaperButton(this, area.left + 110, area.top + 50, '\u2190 HOME', {
      w: 200, h: 72, color: 0xfff4e0, fontSize: 24,
      textColor: '#b83820',
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.TITLE);
      },
    });

    // Gold + potions — paper pill just right of the HOME button
    const goldX = area.left + 240;
    PaperPanel(this, goldX + 110, area.top + 50, 220, 60, {
      color: 0xfff8e8, alpha: 0.95, radius: 18,
    });
    this.add.text(goldX + 15, area.top + 50, '💰', { fontSize: '26px' }).setOrigin(0, 0.5);
    this.add.text(goldX + 52, area.top + 42, `${this.save.gold}`, {
      ...TEXT.heading(), fontSize: '22px', color: '#d07818',
    }).setOrigin(0, 0.5);
    this.add.text(goldX + 115, area.top + 50, '🧪', { fontSize: '26px' }).setOrigin(0, 0.5);
    this.add.text(goldX + 152, area.top + 42, `${this.save.potions}`, {
      ...TEXT.heading(), fontSize: '22px', color: '#4aa848',
    }).setOrigin(0, 0.5);

    // Party strip — top-right with mini hero sprites
    if (this.save.party && this.save.party.length > 0) {
      const stripW = 320;
      const stripCx = area.right - stripW / 2;
      const stripY = area.top + 50;
      PaperPanel(this, stripCx, stripY, stripW, 80, {
        color: 0xfff8e8, alpha: 0.95, radius: 18,
      });
      this.add.text(stripCx - stripW / 2 + 14, stripY - 28, 'PARTY', {
        ...TEXT.stat(), fontSize: '11px', color: '#6a4c28',
      });
      for (let i = 0; i < 3; i++) {
        const x = stripCx - stripW / 2 + 70 + i * 90;
        const slot = this.save.party[i];
        if (slot) {
          const def = getHeroById(slot.id);
          if (def) {
            drawHeroSprite(this, x, stripY - 6, def, { scale: 0.4 });
            const pct = (slot.hp ?? slot.maxHp) / slot.maxHp;
            const hpBg = this.add.graphics();
            hpBg.fillStyle(0x3a2410, 0.5);
            hpBg.fillRoundedRect(x - 24, stripY + 22, 48, 5, 2);
            hpBg.fillStyle(0x4aa848, 1);
            hpBg.fillRoundedRect(x - 24, stripY + 22, 48 * pct, 5, 2);
          }
        }
      }
    }

    // Settings — bottom-right
    PaperButton(this, area.right - 80, area.bottom - 40, '⚙', {
      w: 140, h: 54, color: 0x4a6ca8, fontSize: 26,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.WORLD_MAP }, 200);
      },
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
    const radius = 70;

    // Soft drop shadow
    this.add.circle(x + 5, y + 8, radius, 0x000000, 0.3);

    // Paper-cut node: outer color ring + inner cream paper
    const nodeColor = locked ? 0x8a8070 : info.color;
    const ring = this.add.circle(x, y, radius, nodeColor);
    ring.setStrokeStyle(5, locked ? 0x5a5040 : 0xfff8e0);

    // Inner cream circle
    this.add.circle(x, y, radius - 10, locked ? 0x5a5040 : 0xfff8e8, locked ? 0.8 : 1);

    // Floor number badge — top-left little paper tag
    const numX = x - radius * 0.7;
    const numY = y - radius * 0.7;
    this.add.circle(numX, numY, 18, locked ? 0x5a5040 : 0xd07818)
      .setStrokeStyle(2, 0xfff8e0);
    this.add.text(numX, numY, `${info.id}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '18px',
      color: '#fff8e0',
    }).setOrigin(0.5);

    if (locked) {
      this.drawPaperPadlock(x, y, 36);
    } else {
      // Operator symbol (big, centered)
      this.add.text(x, y, info.op, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '60px',
        color: `#${nodeColor.toString(16).padStart(6, '0')}`,
        stroke: '#1a0e04',
        strokeThickness: 3,
      }).setOrigin(0.5);
    }

    // Completion star
    if (complete) {
      this.add.text(x + radius * 0.7, y - radius * 0.7, '⭐', {
        fontSize: '32px',
      }).setOrigin(0.5);
    }

    // Floor name label below — paper pill
    const labelY = y + radius + 28;
    const labelW = 220;
    const labelH = 52;
    PaperPanel(this, x, labelY, labelW, labelH, {
      color: locked ? 0xc8b898 : 0xfff8e8,
      alpha: 0.95,
      radius: 12,
    });
    this.add.text(x, labelY - 10, info.name, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '14px',
      color: locked ? '#6a4c28' : '#d07818',
    }).setOrigin(0.5);
    this.add.text(x, labelY + 12, info.tagline, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px',
      color: locked ? '#8a7a60' : '#5a3820',
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
    }
  }

  /**
   * Draw a simple papercut padlock glyph centered at (cx, cy):
   * dark body, gold keyhole, steel shackle. Hand-drawn so it looks
   * consistent across devices where emoji glyphs render differently.
   */
  drawPaperPadlock(cx, cy, size = 36) {
    const bodyW = size * 1.3;
    const bodyH = size * 1.1;
    const bodyY = cy + size * 0.15;

    // Shackle (the curved metal loop on top) — drawn as a fat ring
    const shackleY = cy - size * 0.35;
    const shackleR = size * 0.5;
    const shackle = this.add.graphics();
    shackle.lineStyle(size * 0.22, 0x6a6050, 1);
    shackle.beginPath();
    shackle.arc(cx, shackleY, shackleR, Math.PI, 0, false);
    shackle.strokePath();
    // Highlight on the shackle for paper depth
    shackle.lineStyle(size * 0.08, 0xb0a890, 1);
    shackle.beginPath();
    shackle.arc(cx - 1, shackleY - 1, shackleR - 1, Math.PI + 0.1, 2 * Math.PI - 0.3, false);
    shackle.strokePath();

    // Shadow under the body
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(cx - bodyW / 2 + 3, bodyY - bodyH / 2 + 4, bodyW, bodyH, 6);

    // Body — dark paper with a warm brass tint
    const body = this.add.graphics();
    body.fillStyle(0x3a2410, 1);
    body.fillRoundedRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 6);
    body.lineStyle(2, 0x1a0e04, 0.9);
    body.strokeRoundedRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, 6);

    // Keyhole — small warm circle + slit
    const kh = this.add.graphics();
    kh.fillStyle(0xe8a030, 1);
    kh.fillCircle(cx, bodyY - size * 0.05, size * 0.14);
    kh.fillRect(cx - size * 0.05, bodyY - size * 0.05, size * 0.1, size * 0.3);
  }

  enterFloor(floorId) {
    // Must have a party to enter a floor
    const haveParty = this.save.party && this.save.party.length >= 3;
    if (!haveParty) {
      this.scene.start(SCENES.PARTY_SELECT, { grade: this.save.grade });
      return;
    }

    transitionTo(this, SCENES.MAZE, { floor: floorId }, 300);
  }
}
