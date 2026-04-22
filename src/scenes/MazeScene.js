import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { getFloor, TILE } from '../data/floors.js';
import { loadSave, writeSave } from '../systems/save.js';
import { spawnHero } from '../data/heroes.js';
import { spawnEnemy, pickEnemyForFloor } from '../data/enemies.js';
import { audio } from '../systems/audio.js';
import { FLOOR_PALETTES } from '../systems/papercut.js';
import { PaperPanel, PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { makeRng } from '../systems/rng.js';

/**
 * MazeScene
 *
 * A walkable tile-based dungeon. The party (represented by the lead
 * hero) walks around a grid, fog-of-war reveals as they explore,
 * chests give loot, encounter tiles trigger battles, and a boss at
 * the end gates the exit portal.
 *
 * Design principles this honors:
 *   - Snappy tempo: grid-snap movement at ~8 tiles/sec.
 *   - Clarity: fog makes the next step obvious, reveals gradually.
 *   - Respect session length: save after every battle; resume where left off.
 *   - Failure is a restart: battle defeat returns to the world map;
 *     maze state is preserved via the registry and save file.
 *
 * Features:
 *   - Tilemap rendered from data/floors.js
 *   - Tap-to-move on adjacent walkable tiles, plus arrow/WASD keys
 *   - Fog of war with a 3-tile reveal radius
 *   - Chests, potions, randomized encounters, a hand-placed boss, and an exit
 *
 * Deferred to future:
 *   - Animated walking sprites (currently a colored square)
 *   - Real tile artwork (currently rectangles)
 *   - Full papercut backdrop
 *   - Enemy AI / visible enemies before battle (currently invisible tiles)
 *   - Scroll pickup that unlocks minimap
 */
export class MazeScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.MAZE });
  }

  init(data) {
    this.floorId = data?.floor ?? 1;
    this.floor = getFloor(this.floorId);
    this.save = loadSave();

    // Hydrate party from save
    this.party = (this.save.party || [])
      .map((s) => {
        if (!s || !s.id) return null;
        const h = spawnHero(s.id);
        if (!h) return null;
        h.hp = s.hp ?? h.maxHp;
        return h;
      })
      .filter(Boolean);

    // Check if we're returning from a battle (state saved in registry)
    const mazeState = this.registry.get(`mazeState_${this.floorId}`);
    if (mazeState) {
      this.playerX = mazeState.x;
      this.playerY = mazeState.y;
      this.objects = mazeState.objects;
      this.fog = mazeState.fog;
      this.bossDefeated = mazeState.bossDefeated;
    } else {
      // Fresh entry: reset state
      this.playerX = this.floor.startX;
      this.playerY = this.floor.startY;
      this.fog = this.buildInitialFog();
      this.bossDefeated = false;

      // Hand-placed objects (chests, potions, boss, exit) keep their
      // designated positions. Encounter (monster) tiles get randomized
      // each run for surprise. We pick walkable tiles that aren't
      // occupied by another object or the start position.
      const handPlaced = this.floor.objects.filter((o) => o.type !== 'encounter');
      const encounterCount = this.floor.objects.filter((o) => o.type === 'encounter').length;

      const occupied = new Set();
      occupied.add(`${this.playerX},${this.playerY}`);
      handPlaced.forEach((o) => occupied.add(`${o.x},${o.y}`));

      // Find all walkable tiles not occupied
      const candidates = [];
      for (let y = 0; y < this.floor.height; y++) {
        for (let x = 0; x < this.floor.width; x++) {
          if (this.floor.tiles[y][x] === TILE.WALL) continue;
          if (occupied.has(`${x},${y}`)) continue;
          // Don't put monsters right next to start either
          const dx = x - this.playerX;
          const dy = y - this.playerY;
          if (Math.abs(dx) + Math.abs(dy) < 2) continue;
          candidates.push({ x, y });
        }
      }
      // Shuffle and take the first N
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      const encounters = candidates.slice(0, encounterCount).map((p, idx) => ({
        type: 'encounter',
        x: p.x,
        y: p.y,
        id: `encounter-${p.x}-${p.y}-${idx}`,
        consumed: false,
      }));

      const placed = handPlaced.map((o) => ({
        ...o,
        id: `${o.type}-${o.x}-${o.y}`,
        consumed: false,
      }));

      this.objects = [...placed, ...encounters];
    }

    // Movement state
    this.moving = false;
    this.moveQueued = null;
  }

  buildInitialFog() {
    const fog = [];
    for (let y = 0; y < this.floor.height; y++) {
      fog.push(new Array(this.floor.width).fill(false));
    }
    return fog;
  }

  create() {
    // Use the papercut palette's sky color for the area outside the maze
    const pal = FLOOR_PALETTES[this.floorId] || FLOOR_PALETTES[1];
    fadeInScene(this, 250, pal.sky);
    audio.playMusic(`music/floor-${this.floorId}`);

    // Compute tile size and origin so the map fits the screen cleanly.
    // Leave room at the bottom for the HUD/dpad.
    const hudHeight = 180;
    const availableW = GAME_WIDTH - 200;   // leave space for dpad on the right
    const availableH = GAME_HEIGHT - hudHeight - 100;
    this.tileSize = Math.min(
      Math.floor(availableW / this.floor.width),
      Math.floor(availableH / this.floor.height),
    );
    this.originX = (GAME_WIDTH - this.tileSize * this.floor.width) / 2 - 80;
    this.originY = 60;

    this.buildTiles();
    this.buildEnvironment();
    this.buildObjects();
    this.buildPlayer();
    this.buildFogOverlay();
    this.buildHUD();
    // No on-screen d-pad. Movement is tap-on-tile (touch) or
    // arrow keys / WASD (keyboard).
    this.setupTapToMove();

    // Reveal around the starting position
    this.revealFog(this.playerX, this.playerY, 3);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  // ================================================================
  // TILE RENDERING
  // ================================================================

  buildTiles() {
    this.tileSprites = [];
    const ts = this.tileSize;
    const pal = this.floor.palette;
    const rng = makeRng(this.floorId * 9999);

    for (let y = 0; y < this.floor.height; y++) {
      const row = [];
      for (let x = 0; x < this.floor.width; x++) {
        const t = this.floor.tiles[y][x];
        const color = this.colorForTile(t);
        const sx = this.originX + x * ts + ts / 2;
        const sy = this.originY + y * ts + ts / 2;

        // Base tile
        const rect = this.add.rectangle(sx, sy, ts, ts, color);

        // Add texture variation for non-wall tiles
        if (t !== TILE.WALL) {
          // Slight color variation per tile for organic feel
          const shade = Phaser.Display.Color.IntegerToColor(color);
          const vary = (rng() - 0.5) * 16;
          const varColor = Phaser.Display.Color.GetColor(
            Math.max(0, Math.min(255, shade.red + vary)),
            Math.max(0, Math.min(255, shade.green + vary)),
            Math.max(0, Math.min(255, shade.blue + vary))
          );
          rect.setFillStyle(varColor);

          // Grass tufts / pebbles on floor tiles
          if (t === TILE.FLOOR && rng() > 0.55) {
            this.addTileDecor(sx, sy, ts, rng, pal);
          }
        } else {
          rect.setStrokeStyle(1, 0x000000, 0.3);
        }

        row.push(rect);
      }
      this.tileSprites.push(row);
    }
  }

  addTileDecor(sx, sy, ts, rng, pal) {
    const type = rng();
    const ox = (rng() - 0.5) * ts * 0.5;
    const oy = (rng() - 0.5) * ts * 0.5;
    const decorColor = pal.decor || pal.path || 0x4a8830;

    if (type < 0.3) {
      // Small grass tuft
      const g = this.add.graphics();
      g.fillStyle(decorColor, 0.6);
      g.fillTriangle(sx+ox-3, sy+oy+4, sx+ox, sy+oy-6, sx+ox+3, sy+oy+4);
      g.fillTriangle(sx+ox+2, sy+oy+4, sx+ox+5, sy+oy-4, sx+ox+8, sy+oy+4);
    } else if (type < 0.55) {
      // Small pebble
      this.add.circle(sx + ox, sy + oy, 2 + rng() * 2, pal.wall, 0.3);
    } else if (type < 0.75) {
      // Flower dot
      const flowerColors = [0xf06080, 0xf0c040, 0xa0d8f0, 0xf080c0];
      const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
      this.add.circle(sx + ox, sy + oy, 3, fc, 0.7);
      this.add.circle(sx + ox, sy + oy, 1.5, 0xf0f080, 0.8);
    }
  }

  buildEnvironment() {
    const ts = this.tileSize;
    const rng = makeRng(this.floorId * 7777);
    const fid = this.floorId;

    for (let y = 0; y < this.floor.height; y++) {
      for (let x = 0; x < this.floor.width; x++) {
        const t = this.floor.tiles[y][x];
        if (t !== TILE.WALL) continue;
        const sx = this.originX + x * ts + ts / 2;
        const sy = this.originY + y * ts + ts / 2;
        const r = rng();
        if (r > 0.6) continue;

        const g = this.add.graphics();
        if (fid === 1) this.drawGardenWall(g, sx, sy, ts, rng);
        else if (fid === 2) this.drawTidepoolWall(g, sx, sy, ts, rng);
        else if (fid === 3) this.drawCloudWall(g, sx, sy, ts, rng);
        else if (fid === 4) this.drawEmberWall(g, sx, sy, ts, rng);
        else if (fid === 5) this.drawArcaneWall(g, sx, sy, ts, rng);
      }
    }
  }

  drawGardenWall(g, sx, sy, ts, rng) {
    const h = ts * (0.4 + rng() * 0.4);
    // Tree trunk
    g.fillStyle(0x4a3010, 1);
    g.fillRect(sx - 3, sy - h * 0.2, 6, h * 0.6);
    // Canopy — layered circles
    g.fillStyle(0x1a5010, 0.9);
    g.fillCircle(sx, sy - h * 0.4, ts * 0.3 + rng() * 4);
    g.fillStyle(0x2a7018, 0.8);
    g.fillCircle(sx + 2, sy - h * 0.45, ts * 0.22 + rng() * 3);
    // Bush at base
    if (rng() > 0.5) {
      g.fillStyle(0x1e4810, 0.7);
      g.fillCircle(sx + (rng() - 0.5) * ts * 0.4, sy + ts * 0.2, ts * 0.18);
    }
  }

  drawTidepoolWall(g, sx, sy, ts, rng) {
    // Rock + coral
    g.fillStyle(0x0a1828, 0.9);
    g.fillCircle(sx + (rng() - 0.5) * 6, sy + (rng() - 0.5) * 6, ts * 0.32 + rng() * 4);
    g.fillStyle(0x102838, 0.7);
    g.fillCircle(sx + 3, sy - 2, ts * 0.24);
    // Coral branch
    if (rng() > 0.4) {
      const cc = [0x1a6880, 0x2890a0, 0x50b8c0][Math.floor(rng() * 3)];
      g.fillStyle(cc, 0.7);
      g.fillCircle(sx + (rng() - 0.5) * ts * 0.3, sy - ts * 0.2, ts * 0.12);
      g.fillCircle(sx + (rng() - 0.5) * ts * 0.3, sy - ts * 0.3, ts * 0.08);
    }
  }

  drawCloudWall(g, sx, sy, ts, rng) {
    // Cloud puffs
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      g.fillStyle(0xd0dce8, 0.5 + rng() * 0.3);
      g.fillCircle(sx + (rng() - 0.5) * ts * 0.5, sy + (rng() - 0.5) * ts * 0.4, ts * 0.18 + rng() * 6);
    }
  }

  drawEmberWall(g, sx, sy, ts, rng) {
    // Lava rock
    g.fillStyle(0x1a0808, 0.9);
    g.fillCircle(sx + (rng() - 0.5) * 6, sy + (rng() - 0.5) * 6, ts * 0.3 + rng() * 4);
    g.fillStyle(0x2a1008, 0.7);
    g.fillCircle(sx + 2, sy, ts * 0.22);
    // Ember glow crack
    if (rng() > 0.5) {
      g.fillStyle(0xe04808, 0.4);
      g.fillCircle(sx + (rng() - 0.5) * ts * 0.2, sy + (rng() - 0.5) * ts * 0.2, ts * 0.08);
    }
  }

  drawArcaneWall(g, sx, sy, ts, rng) {
    // Rune pillar
    g.fillStyle(0x180a30, 0.9);
    g.fillRect(sx - ts * 0.2, sy - ts * 0.3, ts * 0.4, ts * 0.6);
    g.fillStyle(0x281848, 0.7);
    g.fillRect(sx - ts * 0.14, sy - ts * 0.25, ts * 0.28, ts * 0.5);
    // Glow rune
    if (rng() > 0.4) {
      g.fillStyle(0x8040d0, 0.4);
      g.fillCircle(sx, sy, ts * 0.1);
    }
  }

  colorForTile(tileCode) {
    switch (tileCode) {
      case TILE.WALL:  return this.floor.palette.wall;
      case TILE.FLOOR: return this.floor.palette.floor;
      case TILE.PATH:  return this.floor.palette.path;
      case TILE.WATER: return this.floor.palette.water;
      default: return this.floor.palette.floor;
    }
  }

  // ================================================================
  // OBJECT SPRITES
  // ================================================================

  buildObjects() {
    this.objectSprites = [];
    for (const obj of this.objects) {
      if (obj.consumed) {
        this.objectSprites.push(null);
        continue;
      }
      const sprite = this.createObjectSprite(obj);
      this.objectSprites.push(sprite);
    }
  }

  createObjectSprite(obj) {
    const sx = this.originX + obj.x * this.tileSize + this.tileSize / 2;
    const sy = this.originY + obj.y * this.tileSize + this.tileSize / 2;

    const group = this.add.container(sx, sy);

    let icon, bg;
    const ts = this.tileSize;
    const g = this.add.graphics();

    switch (obj.type) {
      case 'chest': {
        const cw = ts * 0.6, ch = ts * 0.45;
        g.fillStyle(0x6a4010, 1);
        g.fillRoundedRect(-cw/2, -ch/2, cw, ch, 4);
        g.fillStyle(0x8a5818, 1);
        g.fillRoundedRect(-cw/2+3, -ch/2+3, cw-6, ch*0.55, 3);
        g.fillStyle(0xc07818, 1);
        g.fillRoundedRect(-cw*0.15, -2, cw*0.3, ch*0.3, 2);
        g.fillStyle(0xe8a030, 1);
        g.fillCircle(0, ch*0.05, 3);
        g.lineStyle(2, 0x3a2008, 0.6);
        g.strokeRoundedRect(-cw/2, -ch/2, cw, ch, 4);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        break;
      }
      case 'potion': {
        const pw = ts * 0.22, ph = ts * 0.35;
        g.fillStyle(0x4a1878, 1);
        g.fillRoundedRect(-pw, 0, pw*2, ph, 6);
        g.fillStyle(0x9050c8, 0.8);
        g.fillRoundedRect(-pw+3, 3, pw*2-6, ph-6, 4);
        g.fillStyle(0x3a1060, 1);
        g.fillRect(-pw*0.5, -ph*0.3, pw, ph*0.3);
        g.fillStyle(0x6030a0, 1);
        g.fillCircle(0, -ph*0.3, pw*0.6);
        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(-pw*0.3, ph*0.25, 2);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        break;
      }
      case 'encounter':
        bg = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        break;
      case 'boss': {
        const br = ts * 0.42;
        g.fillStyle(0x000000, 0.3);
        g.fillCircle(3, 4, br);
        g.fillStyle(0x6a0808, 1);
        g.fillCircle(0, 0, br);
        g.fillStyle(0x9c1010, 1);
        g.fillCircle(0, 0, br * 0.75);
        g.fillStyle(0xf0e040, 0.9);
        g.fillCircle(0, 0, br * 0.25);
        g.lineStyle(3, 0xe8a030, 0.8);
        g.strokeCircle(0, 0, br);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        this.tweens.add({ targets: g, scale: 1.1, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        break;
      }
      case 'exit': {
        const er = ts * 0.4;
        g.fillStyle(0x000000, 0.2);
        g.fillCircle(2, 3, er);
        g.fillStyle(0xc07818, 1);
        g.fillCircle(0, 0, er);
        g.fillStyle(0xe8a030, 1);
        g.fillCircle(0, 0, er * 0.7);
        g.fillStyle(0xf0e040, 0.8);
        g.fillCircle(0, 0, er * 0.35);
        g.lineStyle(3, 0xc07818, 0.9);
        g.strokeCircle(0, 0, er);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        bg.setVisible(this.bossDefeated);
        break;
      }
      default:
        return null;
    }

    group.add([bg, icon]);
    return group;
  }

  // ================================================================
  // PLAYER SPRITE
  // ================================================================

  buildPlayer() {
    // Render all 3 party members clustered on the lead's tile,
    // staggered slightly so they're all visible. The lead is largest
    // and most forward; the back two are smaller and offset diagonally.
    const sx = this.originX + this.playerX * this.tileSize + this.tileSize / 2;
    const sy = this.originY + this.playerY * this.tileSize + this.tileSize / 2;
    this.playerSprite = this.add.container(sx, sy);

    const layout = [
      { dx: 0,                   dy: 0,                   scale: 1.0 }, // lead, front-center
      { dx: -this.tileSize * 0.22, dy: -this.tileSize * 0.18, scale: 0.78 }, // back-left
      { dx:  this.tileSize * 0.22, dy: -this.tileSize * 0.18, scale: 0.78 }, // back-right
    ];

    for (let i = this.party.length - 1; i >= 0; i--) {
      const hero = this.party[i];
      if (!hero) continue;
      const slot = layout[i];
      const spriteScale = this.tileSize / 140 * slot.scale * 0.9;
      const gfx = drawHeroSprite(this, slot.dx, slot.dy, hero, { scale: spriteScale });
      this.playerSprite.add(gfx);
    }
  }

  // ================================================================
  // FOG OF WAR
  // ================================================================

  buildFogOverlay() {
    this.fogSprites = [];
    for (let y = 0; y < this.floor.height; y++) {
      const row = [];
      for (let x = 0; x < this.floor.width; x++) {
        const sx = this.originX + x * this.tileSize + this.tileSize / 2;
        const sy = this.originY + y * this.tileSize + this.tileSize / 2;
        const fog = this.add.rectangle(sx, sy, this.tileSize + 1, this.tileSize + 1, 0x000000, 0.92);
        fog.setVisible(!this.fog[y][x]);
        row.push(fog);
      }
      this.fogSprites.push(row);
    }
  }

  revealFog(cx, cy, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= this.floor.width || ny < 0 || ny >= this.floor.height) continue;
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        this.fog[ny][nx] = true;
        if (this.fogSprites[ny][nx]) this.fogSprites[ny][nx].setVisible(false);
      }
    }
  }

  // ================================================================
  // HUD
  // ================================================================

  buildHUD() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const hudH = 110;
    const hudCenterY = area.bottom - hudH / 2;

    // Paper HUD strip at the bottom
    PaperPanel(this, area.cx, hudCenterY, GAME_WIDTH - 40, hudH, {
      color: 0xfff8e8, alpha: 0.94, radius: 20,
    });

    // Floor name — left side
    this.add.text(area.left + 20, hudCenterY - 24, `F${this.floorId}: ${this.floor.name.toUpperCase()}`, {
      ...TEXT.heading(), fontSize: '18px', color: '#d07818',
    }).setOrigin(0, 0.5);

    // Gold + potions in a row on the left
    this.hudGold = this.add.text(area.left + 20, hudCenterY + 8, `💰 ${this.save.gold}`, {
      ...TEXT.body(), fontSize: '16px', color: '#3a2410',
    }).setOrigin(0, 0.5);
    this.hudPotions = this.add.text(area.left + 120, hudCenterY + 8, `🧪 ${this.save.potions}`, {
      ...TEXT.body(), fontSize: '16px', color: '#3a2410',
    }).setOrigin(0, 0.5);

    // Party strip — center of HUD with mini hero sprites
    const partyCx = area.cx;
    const partyY = hudCenterY;
    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i];
      const x = partyCx - 120 + i * 110;
      const spriteScale = 0.35;
      drawHeroSprite(this, x, partyY - 10, hero, { scale: spriteScale });
      this.add.text(x, partyY + 22, hero.name, {
        ...TEXT.stat(), fontSize: '10px', color: '#3a2410',
      }).setOrigin(0.5);
      const pct = hero.hp / hero.maxHp;
      const hpBg = this.add.graphics();
      hpBg.fillStyle(0x3a2410, 0.4);
      hpBg.fillRoundedRect(x - 30, partyY + 12, 60, 4, 2);
      hpBg.fillStyle(0x4aa848, 1);
      hpBg.fillRoundedRect(x - 30, partyY + 12, 60 * pct, 4, 2);
    }

    // World Map button — right side
    PaperButton(this, area.right - 100, hudCenterY, 'WORLD MAP', {
      w: 180, h: 54, color: 0x4aa848, fontSize: 14,
      onClick: () => {
        audio.play('ui/back');
        this.saveMazeState();
        transitionTo(this, SCENES.WORLD_MAP);
      },
    });

    // Settings — top-right (inside safe area)
    PaperButton(this, area.right - 40, area.top + 30, '⚙', {
      w: 60, h: 50, color: 0xfff8e8, fontSize: 22,
      textColor: '#3a2410',
      onClick: () => {
        audio.play('ui/click');
        this.saveMazeState();
        transitionTo(this, SCENES.SETTINGS, {
          returnScene: SCENES.MAZE,
          returnData: { floor: this.floorId },
        }, 200);
      },
    });
  }

  updateHud() {
    this.hudGold.setText(`\u{1FA99} ${this.save.gold}`);
    this.hudPotions.setText(`\u{1F9EA} ${this.save.potions}`);
  }

  // ================================================================
  // TAP-TO-MOVE (touch input for iPad)
  // ================================================================

  /**
   * Tapping a tile adjacent to the player moves them one step in
   * that direction. Tapping further-away tiles is ignored — we only
   * support 1-tile-at-a-time movement so the player feels the maze
   * the same way they would with arrow keys.
   */
  setupTapToMove() {
    this.input.on('pointerdown', (pointer) => {
      // Convert pointer screen coords to tile coords using the maze
      // tile origin and size.
      if (this.moving) return;
      const tileX = Math.floor((pointer.x - this.originX) / this.tileSize);
      const tileY = Math.floor((pointer.y - this.originY) / this.tileSize);
      // Only adjacent (4-directional) tiles count as movement requests
      const dx = tileX - this.playerX;
      const dy = tileY - this.playerY;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        this.tryMove({ dx, dy });
      }
    });
  }

  // ================================================================
  // MOVEMENT
  // ================================================================

  update() {
    if (this.moving) return;

    let dir = null;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dir = { dx: -1, dy: 0 };
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dir = { dx: 1, dy: 0 };
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dir = { dx: 0, dy: -1 };
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dir = { dx: 0, dy: 1 };

    if (dir) this.tryMove(dir);
  }

  tryMove({ dx, dy }) {
    if (this.moving) return;

    const nx = this.playerX + dx;
    const ny = this.playerY + dy;

    if (nx < 0 || nx >= this.floor.width || ny < 0 || ny >= this.floor.height) return;
    if (this.floor.tiles[ny][nx] === TILE.WALL) return;

    this.moving = true;
    this.playerX = nx;
    this.playerY = ny;
    const tx = this.originX + nx * this.tileSize + this.tileSize / 2;
    const ty = this.originY + ny * this.tileSize + this.tileSize / 2;

    // Kill any existing player tweens to avoid conflicts
    this.tweens.killTweensOf(this.playerSprite);

    // Safety: if the tween somehow doesn't complete, force-unlock after 300ms
    this.time.delayedCall(300, () => { this.moving = false; });

    this.tweens.add({
      targets: this.playerSprite,
      x: tx,
      y: ty,
      duration: 130,
      ease: 'Linear',
      onComplete: () => {
        this.moving = false;
        this.revealFog(nx, ny, 3);
        this.checkObjectAt(nx, ny);
      },
    });
  }

  // ================================================================
  // OBJECT INTERACTION
  // ================================================================

  checkObjectAt(x, y) {
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      if (obj.consumed) continue;
      if (obj.x !== x || obj.y !== y) continue;
      this.triggerObject(i);
      break;
    }
  }

  triggerObject(index) {
    const obj = this.objects[index];

    switch (obj.type) {
      case 'chest': {
        const gold = obj.loot?.gold ?? 10;
        this.save.gold += gold;
        writeSave(this.save);
        obj.consumed = true;
        this.objectSprites[index]?.destroy();
        this.objectSprites[index] = null;
        audio.play('world/chest');
        this.showFloatText(obj.x, obj.y, `+${gold} GOLD`, COLORS_CSS.goldL);
        this.updateHud();
        break;
      }
      case 'potion': {
        this.save.potions += 1;
        writeSave(this.save);
        obj.consumed = true;
        this.objectSprites[index]?.destroy();
        this.objectSprites[index] = null;
        audio.play('world/gold');
        this.showFloatText(obj.x, obj.y, '+1 POTION', COLORS_CSS.plumL);
        this.updateHud();
        break;
      }
      case 'encounter': {
        obj.consumed = true;
        this.objectSprites[index]?.destroy();
        this.objectSprites[index] = null;
        audio.play('world/encounter');
        this.startBattle(false);
        break;
      }
      case 'boss': {
        obj.consumed = true;
        this.objectSprites[index]?.destroy();
        this.objectSprites[index] = null;
        audio.play('world/encounter');
        this.startBattle(true, obj.enemyId);
        break;
      }
      case 'exit': {
        if (!this.bossDefeated) {
          this.showFloatText(obj.x, obj.y, 'BEAT THE BOSS FIRST', COLORS_CSS.scarletL);
          return;
        }
        audio.play('world/floor-complete');
        // Wipe maze state for this floor — next entry starts fresh
        this.registry.remove(`mazeState_${this.floorId}`);
        transitionTo(this, SCENES.WORLD_MAP, undefined, 400);
        break;
      }
    }
  }

  startBattle(isBoss, enemyId) {
    this.saveMazeState();

    // Signal to BattleScene that completion should come back here.
    this.registry.set('battleReturnScene', SCENES.MAZE);
    this.registry.set('battleReturnData', { floor: this.floorId });

    let def;
    if (isBoss && enemyId) {
      def = { id: enemyId };
    } else {
      def = pickEnemyForFloor(this.floorId);
      if (!def) {
        // No enemies for this floor — skip the battle rather than crash.
        return;
      }
    }
    const enemy = spawnEnemy(def.id, { grade: this.save.grade, isBoss });

    transitionTo(this, SCENES.BATTLE, {
      party: this.party,
      enemy,
      floor: this.floorId,
      grade: this.save.grade,
      isBoss,
    }, 300);
  }

  saveMazeState() {
    this.registry.set(`mazeState_${this.floorId}`, {
      x: this.playerX,
      y: this.playerY,
      objects: this.objects,
      fog: this.fog,
      bossDefeated: this.bossDefeated,
    });
  }

  // ================================================================
  // UI HELPERS
  // ================================================================

  showFloatText(tileX, tileY, text, color) {
    const sx = this.originX + tileX * this.tileSize + this.tileSize / 2;
    const sy = this.originY + tileY * this.tileSize - 20;
    const t = this.add.text(sx, sy, text, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '18px',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: sy - 60,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }
}
