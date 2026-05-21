import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { loadSave, writeSave } from '../systems/save.js';
import { spawnHero, getHeroById, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { getDailyChallenge, isDailyChallengeCompleted, markDailyChallengeComplete } from '../systems/dailyChallenge.js';

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
      w: 200, h: 72, color: 0xffffff, fontSize: 24,
      textColor: '#b83820',
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.TITLE);
      },
    });

    // Gold + potions — paper pill just right of the HOME button
    const goldX = area.left + 240;
    PaperPanel(this, goldX + 110, area.top + 50, 220, 60, {
      color: 0xffffff, alpha: 0.95, radius: 18,
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
        color: 0xffffff, alpha: 0.95, radius: 18,
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

    // Shop — bottom-center
    PaperButton(this, area.cx, area.bottom - 40, 'SHOP', {
      w: 180, h: 62, color: 0xd07818, fontSize: 22,
      textColor: '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SHOP, undefined, 200);
      },
    });

    // Settings — bottom-right
    PaperButton(this, area.right - 80, area.bottom - 40, '⚙', {
      w: 140, h: 54, color: 0x4a6ca8, fontSize: 26,
      onClick: () => {
        audio.play('ui/click');
        transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.WORLD_MAP }, 200);
      },
    });

    // Daily Challenge — bottom-left
    const dailyCompleted = isDailyChallengeCompleted(this.save);
    const dailyColor = dailyCompleted ? 0x8a8070 : 0xd07818;
    PaperButton(this, area.left + 140, area.bottom - 40, 'DAILY CHALLENGE', {
      w: 260, h: 54, color: dailyColor, fontSize: 18,
      textColor: dailyCompleted ? '#6a4c28' : '#fff8e0',
      onClick: () => {
        audio.play('ui/click');
        this.onDailyChallenge();
      },
    });
  }

  // ================================================================
  // FLOOR NODES
  // ================================================================

  buildFloorNodes() {
    // Curving path from bottom-left to top-right
    const nodePositions = [
      { x: GAME_WIDTH * 0.15, y: GAME_HEIGHT * 0.82 },
      { x: GAME_WIDTH * 0.38, y: GAME_HEIGHT * 0.78 },
      { x: GAME_WIDTH * 0.60, y: GAME_HEIGHT * 0.82 },
      { x: GAME_WIDTH * 0.82, y: GAME_HEIGHT * 0.70 },
      { x: GAME_WIDTH * 0.65, y: GAME_HEIGHT * 0.56 },
      { x: GAME_WIDTH * 0.40, y: GAME_HEIGHT * 0.50 },
      { x: GAME_WIDTH * 0.18, y: GAME_HEIGHT * 0.42 },
      { x: GAME_WIDTH * 0.40, y: GAME_HEIGHT * 0.30 },
      { x: GAME_WIDTH * 0.65, y: GAME_HEIGHT * 0.22 },
    ];

    const floorInfo = [
      { id: 1, name: 'GARDEN',       op: '+',  color: 0x4a9830, tagline: 'Addition' },
      { id: 2, name: 'TIDEPOOL',     op: '-',  color: 0x2060b0, tagline: 'Subtraction' },
      { id: 3, name: 'CLOUD MAZE',   op: '\u00d7', color: 0x88b8e0, tagline: 'Multiply' },
      { id: 4, name: 'EMBER CAVES',  op: '\u00f7', color: 0xb03010, tagline: 'Division' },
      { id: 5, name: 'FROZEN PEAK',  op: '\u00bd', color: 0x4890c0, tagline: 'Fractions' },
      { id: 6, name: 'CRYSTAL CAV.', op: '\u25b3', color: 0x8040c0, tagline: 'Geometry' },
      { id: 7, name: 'MARKET SQ.',   op: '$',  color: 0xc0a040, tagline: 'Money' },
      { id: 8, name: 'LIBRARY',      op: '?',  color: 0x604020, tagline: 'Words' },
      { id: 9, name: 'MENDING ROOM', op: '\u221e', color: 0x8830b8, tagline: 'All Ops' },
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
        // Sparkle traveling along completed path
        this.time.addEvent({
          delay: 1500 + i * 400,
          loop: true,
          callback: () => {
            const sparkle = this.add.circle(pts[0].x, pts[0].y, 3, 0xf0e040, 0.8);
            let step = 0;
            this.time.addEvent({
              delay: 40, loop: true,
              callback: () => {
                step++;
                if (step >= pts.length) { sparkle.destroy(); return; }
                sparkle.setPosition(pts[step].x, pts[step].y);
                sparkle.setAlpha(0.8 - (step / pts.length) * 0.6);
              },
            });
          },
        });
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
    const radius = 52;

    // Soft drop shadow
    this.add.circle(x + 4, y + 6, radius, 0x000000, 0.3);

    // Paper-cut node: outer color ring + inner cream paper
    const nodeColor = locked ? 0x8a8070 : info.color;
    const ring = this.add.circle(x, y, radius, nodeColor);
    ring.setStrokeStyle(4, locked ? 0x5a5040 : 0xfff8e0);

    // Inner cream circle
    this.add.circle(x, y, radius - 8, locked ? 0x5a5040 : 0xffffff, locked ? 0.8 : 1);

    // Floor number badge — top-left little paper tag
    const numX = x - radius * 0.7;
    const numY = y - radius * 0.7;
    this.add.circle(numX, numY, 15, locked ? 0x5a5040 : 0xd07818)
      .setStrokeStyle(2, 0xfff8e0);
    this.add.text(numX, numY, `${info.id}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '15px',
      color: '#fff8e0',
    }).setOrigin(0.5);

    if (locked) {
      this.drawPaperPadlock(x, y, 28);
    } else {
      // Operator symbol (big, centered)
      this.add.text(x, y, info.op, {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '40px',
        color: `#${nodeColor.toString(16).padStart(6, '0')}`,
        stroke: '#1a0e04',
        strokeThickness: 3,
      }).setOrigin(0.5);
    }

    // Completion star
    if (complete) {
      this.add.text(x + radius * 0.7, y - radius * 0.7, '⭐', {
        fontSize: '26px',
      }).setOrigin(0.5);
    }

    // Floor name label below — paper pill
    const labelY = y + radius + 22;
    const labelW = 180;
    const labelH = 42;
    PaperPanel(this, x, labelY, labelW, labelH, {
      color: locked ? 0xc8b898 : 0xffffff,
      alpha: 0.95,
      radius: 12,
    });
    this.add.text(x, labelY - 8, info.name, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '12px',
      color: locked ? '#6a4c28' : '#d07818',
    }).setOrigin(0.5);
    this.add.text(x, labelY + 8, info.tagline, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '11px',
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

  onDailyChallenge() {
    if (isDailyChallengeCompleted(this.save)) {
      this.showFlash('Come back tomorrow!');
      return;
    }

    const challenge = getDailyChallenge();
    const classLists = { knight: KNIGHTS, wizard: WIZARDS, bunny: BUNNIES };
    const classList = classLists[challenge.heroClass];
    const heroIdx = challenge.heroIndex % classList.length;

    // Build a party of 3 from the daily class
    const party = [];
    for (let i = 0; i < 3; i++) {
      const idx = (heroIdx + i) % classList.length;
      party.push(spawnHero(classList[idx].id));
    }

    // Set return data so BattleScene returns here and we can award daily rewards
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
      fontSize: '20px',
      color: '#d07818',
      backgroundColor: '#fff8e0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2000,
      duration: 500,
      onComplete: () => t.destroy(),
    });
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
