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
import { initLevel, updateLevel, drawLevel, getCanvas, getPartyTile, getGameState, setGameState, triggerFlash, markDead, markVisible, setFloorTheme } from '../ui/levelEngine.js';
import { createHeroCanvas } from '../ui/legacyRenderer.js';
import { KNIGHTS, WIZARDS, BUNNIES } from '../data/heroArt.js';
import { DialogueOverlay } from '../ui/DialogueOverlay.js';
import { DIALOGUE } from '../data/dialogue.js';
import { shouldShowTutorial, markTutorialShown, getTutorialText } from '../systems/tutorial.js';

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
    let mazeState = this.registry.get(`mazeState_${this.floorId}`);
    if (!mazeState) { try { const s = localStorage.getItem(`mw_maze_${this.floorId}`); if (s) mazeState = JSON.parse(s); } catch (e) { /* ignore */ } }
    if (mazeState && (typeof mazeState.x !== 'number' || !Array.isArray(mazeState.objects))) mazeState = null;
    this.freshEntry = !mazeState;
    if (mazeState) {
      this.playerX = mazeState.x;
      this.playerY = mazeState.y;
      this.objects = mazeState.objects;
      this.fog = mazeState.fog;
      this.bossDefeated = mazeState.bossDefeated;
      this.hasKey = mazeState.hasKey || false;
      this.challengeProgress = mazeState.fairiesFreed || 0;
    } else {
      // Fresh entry: reset state
      this.playerX = this.floor.startX;
      this.playerY = this.floor.startY;
      this.fog = this.buildInitialFog();
      this.bossDefeated = false;
      this.hasKey = false;
      this.challengeProgress = 0;

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
    const pal = FLOOR_PALETTES[this.floorId] || FLOOR_PALETTES[1];
    fadeInScene(this, 250, pal.sky);
    audio.playMusic(`music/floor-${this.floorId}`);

    // Pre-render hero canvases for the level engine party display
    const allArt = [...KNIGHTS, ...WIZARDS, ...BUNNIES];
    const heroCanvases = this.party.map(h => {
      const art = allArt.find(a => a.id === h.id);
      if (art && art.draw) return createHeroCanvas(80, 110, null, art.draw, art.topExt, art.botExt);
      return null;
    });

    // Convert floor objects to level engine format
    const challengeType = this.floor.challenge?.type || 'fairy';
    const engineObjs = this.objects.map(o => {
      let engineType = o.type;
      if (o.type === 'golden') engineType = 'chestG';
      else if (o.type === 'encounter') engineType = 'monster';
      else if (o.type === 'fairy') engineType = 'fairy';
      else if (o.type === 'valve') engineType = 'valve';
      else if (o.type === 'beacon') engineType = 'beacon';
      else if (o.type === 'vent') engineType = 'vent';
      else if (o.type === 'fragment') engineType = 'fragment';
      else if (o.type === 'crystal') engineType = 'crystal';
      else if (o.type === 'geoshard') engineType = 'geoshard';
      else if (o.type === 'token') engineType = 'token';
      else if (o.type === 'page') engineType = 'page';
      return {
        type: engineType,
        tx: o.x, ty: o.y,
        id: o.id,
        alive: !o.consumed,
        open: !!o.consumed,
        hidden: o.type === 'encounter',
        visible: o.type === 'exit' ? this.hasKey : true,
        kind: 'sprout',
        respawnAt: 0,
        loot: (o.type === challengeType || o.type === 'fairy') ? 'fairy' : undefined,
        fairyCol: '#88aaff',
      };
    });

    setFloorTheme(this.floorId);
    initLevel(GAME_WIDTH, GAME_HEIGHT, this.floor.tiles, engineObjs, heroCanvases, this.playerX, this.playerY);

    // Restore state if returning from battle
    if (!this.freshEntry && this.fog) {
      setGameState({
        fairies: this.challengeProgress || 0,
        hasKey: this.bossDefeated,
        dead: {},
        fog: this.fog,
        partyX: this.playerX * 56 + 28,
        partyY: this.playerY * 56 + 28,
        objects: this.objects.filter(o => o.consumed).map(o => ({
          id: o.id, alive: false, open: true, hidden: false, visible: true, respawnAt: 0,
        })),
      });
    }

    // After boss is defeated and player returns, consume the boss object
    if (this.bossDefeated) {
      this.objects.forEach(o => {
        if (o.type === 'boss' && !o.consumed) {
          o.consumed = true;
          markDead(o.id);
        }
      });
    }

    // After boss is defeated, clear all remaining encounters (Bug 5)
    if (this.bossDefeated) {
      this.objects.forEach(o => {
        if (o.type === 'encounter' && !o.consumed) {
          o.consumed = true;
          markDead(o.id);
        }
      });
    }

    // Draw first frame and add as Phaser texture
    drawLevel(0);
    const cv = getCanvas();
    if (this.textures.exists('level-canvas')) this.textures.remove('level-canvas');
    this.textures.addCanvas('level-canvas', cv);
    this.levelImage = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'level-canvas');
    this.levelImage.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.buildHUD();

    this.dialogue = new DialogueOverlay(this);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this._lastInteractCheck = 0;
    this._touchDir = null;

    this.input.on('pointerdown', (pointer) => {
      const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        this._touchDir = dx > 0 ? 'right' : 'left';
      } else {
        this._touchDir = dy > 0 ? 'down' : 'up';
      }
    });
    this.input.on('pointerup', () => { this._touchDir = null; });
  }

  // ================================================================
  // TILE RENDERING
  // ================================================================

  buildTiles() {
    this.tileSprites = [];
    const ts = this.tileSize;

    for (let y = 0; y < this.floor.height; y++) {
      const row = [];
      for (let x = 0; x < this.floor.width; x++) {
        const t = this.floor.tiles[y][x];
        const sx = this.originX + x * ts + ts / 2;
        const sy = this.originY + y * ts + ts / 2;

        const texKey = getTileTextureKey(this, this.floorId, t, x, y, ts);
        const img = this.add.image(sx, sy, texKey);
        img.setDisplaySize(ts, ts);
        row.push(img);
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
      case 'fairy': {
        // Glowing fairy chest — pink/sparkle theme
        const fw = ts * 0.55, fh = ts * 0.42;
        g.fillStyle(0xc060a0, 1);
        g.fillRoundedRect(-fw/2, -fh/2, fw, fh, 5);
        g.fillStyle(0xe088c0, 1);
        g.fillRoundedRect(-fw/2+3, -fh/2+3, fw-6, fh*0.5, 3);
        g.fillStyle(0xf0d040, 1);
        g.fillCircle(0, fh*0.05, 4);
        g.lineStyle(2, 0x801860, 0.7);
        g.strokeRoundedRect(-fw/2, -fh/2, fw, fh, 5);
        // Fairy wings sparkle
        g.fillStyle(0xf0e0f8, 0.6);
        g.fillCircle(-fw*0.35, -fh*0.5, 5);
        g.fillCircle(fw*0.35, -fh*0.5, 5);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        this.tweens.add({ targets: g, alpha: 0.7, duration: 600, yoyo: true, repeat: -1 });
        break;
      }
      case 'golden': {
        // Golden treasure chest — hidden until all 3 fairies freed
        const gw = ts * 0.65, gh = ts * 0.5;
        g.fillStyle(0x000000, 0.3);
        g.fillRoundedRect(-gw/2+3, -gh/2+4, gw, gh, 5);
        g.fillStyle(0xb07818, 1);
        g.fillRoundedRect(-gw/2, -gh/2, gw, gh, 5);
        g.fillStyle(0xd8a030, 1);
        g.fillRoundedRect(-gw/2+4, -gh/2+4, gw-8, gh*0.5, 3);
        g.fillStyle(0xf0e040, 1);
        g.fillCircle(0, gh*0.05, 5);
        g.fillStyle(0xf8f080, 0.8);
        g.fillCircle(-3, -gh*0.15, 3);
        g.lineStyle(2, 0x806010, 0.8);
        g.strokeRoundedRect(-gw/2, -gh/2, gw, gh, 5);
        bg = g; icon = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
        // Hidden until all fairies are freed
        const allFreed = this.challengeProgress >= 3;
        g.setVisible(allFreed);
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
    // Each party member gets their own container. The leader is at the
    // current tile; followers trail behind at previous positions.
    const ts = this.tileSize;
    const spriteScale = ts / 140 * 0.85;
    const startSx = this.originX + this.playerX * ts + ts / 2;
    const startSy = this.originY + this.playerY * ts + ts / 2;

    // Position trail — followers walk where the leader just was.
    // Initialize all at the starting position.
    this.posTrail = [];
    for (let i = 0; i < this.party.length; i++) {
      this.posTrail.push({ x: this.playerX, y: this.playerY });
    }

    this.followerSprites = [];
    // Draw followers first (behind), leader last (on top)
    for (let i = this.party.length - 1; i >= 0; i--) {
      const hero = this.party[i];
      if (!hero) continue;
      const sx = this.originX + this.posTrail[i].x * ts + ts / 2;
      const sy = this.originY + this.posTrail[i].y * ts + ts / 2;
      const container = this.add.container(sx, sy);
      const sc = i === 0 ? spriteScale : spriteScale * 0.8;
      const gfx = drawHeroSprite(this, 0, 0, hero, { scale: sc });
      container.add(gfx);
      this.followerSprites[i] = container;
    }
    // The leader's container is what the camera follows
    this.playerSprite = this.followerSprites[0];
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

  revealFog() {
  }

  // ================================================================
  // HUD
  // ================================================================

  buildHUD() {
    // Track all objects added during HUD build so we can batch-fix
    // them to the camera (scrollFactor 0) at the end.
    const before = this.children.length;

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const hudH = 110;
    const hudCenterY = area.bottom - hudH / 2;

    PaperPanel(this, area.cx, hudCenterY, GAME_WIDTH - 40, hudH, {
      color: 0x1a0e04, alpha: 0.75, radius: 20,
    });

    // Floor name — top-left of HUD
    this.add.text(area.left + 20, hudCenterY - 36, `F${this.floorId}: ${this.floor.name.toUpperCase()}`, {
      ...TEXT.heading(), fontSize: '16px', color: '#f0d060',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);

    // Status cards — compact colored pills with white text
    const ch = this.floor.challenge || { count: 3, label: 'QUEST' };
    const cardY = hudCenterY + 4;
    const cardH = 40;
    const cardW = 90;
    const cardGap = 8;
    const cardStartX = area.left + 24;
    const cardStyle = { fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };

    // Gold card
    const g1 = this.add.graphics();
    g1.fillStyle(0xc08818, 0.9); g1.fillRoundedRect(cardStartX, cardY - cardH / 2, cardW, cardH, 8);
    this.hudGold = this.add.text(cardStartX + cardW / 2, cardY, `${this.save.gold}`, cardStyle).setOrigin(0.5);

    // Potion card
    const px = cardStartX + cardW + cardGap;
    const g2 = this.add.graphics();
    g2.fillStyle(0x6828a0, 0.9); g2.fillRoundedRect(px, cardY - cardH / 2, cardW, cardH, 8);
    this.hudPotions = this.add.text(px + cardW / 2, cardY, `${this.save.potions}`, cardStyle).setOrigin(0.5);

    // Challenge card
    const cx2 = px + cardW + cardGap;
    const g3 = this.add.graphics();
    g3.fillStyle(0x3888d0, 0.9); g3.fillRoundedRect(cx2, cardY - cardH / 2, cardW + 20, cardH, 8);
    this.hudChallenge = this.add.text(cx2 + (cardW + 20) / 2, cardY, `${this.challengeProgress}/${ch.count}`, cardStyle).setOrigin(0.5);

    // Card labels (tiny, below)
    const labelStyle = { ...TEXT.stat(), fontSize: '10px', color: '#c0b090' };
    this.add.text(cardStartX + cardW / 2, cardY + cardH / 2 + 8, 'GOLD', labelStyle).setOrigin(0.5);
    this.add.text(px + cardW / 2, cardY + cardH / 2 + 8, 'POTIONS', labelStyle).setOrigin(0.5);
    this.add.text(cx2 + (cardW + 20) / 2, cardY + cardH / 2 + 8, ch.label.toUpperCase(), labelStyle).setOrigin(0.5);

    // Party strip — center of HUD with mini hero sprites
    const partyCx = area.cx;
    const partyY = hudCenterY;
    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i];
      const x = partyCx - 120 + i * 110;
      const spriteScale = 0.35;
      drawHeroSprite(this, x, partyY - 18, hero, { scale: spriteScale });
      this.add.text(x, partyY + 26, hero.name, {
        ...TEXT.stat(), fontSize: '10px', color: '#3a2410',
      }).setOrigin(0.5);
      const pct = hero.hp / hero.maxHp;
      const hpBg = this.add.graphics();
      hpBg.fillStyle(0x3a2410, 0.4);
      hpBg.fillRoundedRect(x - 30, partyY + 36, 60, 4, 2);
      hpBg.fillStyle(0x4aa848, 1);
      hpBg.fillRoundedRect(x - 30, partyY + 36, 60 * pct, 4, 2);
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

    // Fix all HUD elements to the camera so they don't scroll
    const after = this.children.length;
    for (let i = before; i < after; i++) {
      const child = this.children.getAt(i);
      if (child && child.setScrollFactor) child.setScrollFactor(0);
    }
  }

  updateHud() {
    this.hudGold.setText(`${this.save.gold}`);
    this.hudPotions.setText(`${this.save.potions}`);
    if (this.hudChallenge) {
      const ch = this.floor.challenge || { count: 3, label: 'ITEM' };
      this.hudChallenge.setText(`${ch.label} ${this.challengeProgress}/${ch.count}`);
    }
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
      // Convert screen pointer to world coords (accounting for camera scroll)
      const worldX = pointer.x + this.cameras.main.scrollX;
      const worldY = pointer.y + this.cameras.main.scrollY;
      const tileX = Math.floor((worldX - this.originX) / this.tileSize);
      const tileY = Math.floor((worldY - this.originY) / this.tileSize);
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

  update(time) {
    if (this.dialogue?.active) return;
    const keys = {};
    if (this.cursors.left.isDown || this.wasd.A.isDown || this._touchDir === 'left') keys.ArrowLeft = true;
    if (this.cursors.right.isDown || this.wasd.D.isDown || this._touchDir === 'right') keys.ArrowRight = true;
    if (this.cursors.up.isDown || this.wasd.W.isDown || this._touchDir === 'up') keys.ArrowUp = true;
    if (this.cursors.down.isDown || this.wasd.S.isDown || this._touchDir === 'down') keys.ArrowDown = true;

    updateLevel(keys);
    drawLevel(time / 1000);

    // Refresh the Phaser texture from the level engine canvas
    if (this.textures.exists('level-canvas')) {
      const tex = this.textures.get('level-canvas');
      if (tex.refresh) {
        tex.refresh();
      } else if (tex.update) {
        tex.update();
      }
    }

    // Sync player tile position and check interactions
    const tile = getPartyTile();
    const prevX = this.playerX, prevY = this.playerY;
    this.playerX = tile.tx;
    this.playerY = tile.ty;
    if (this.playerX !== prevX || this.playerY !== prevY) {
      this.checkObjectAt(this.playerX, this.playerY);
    }
  }

  tryMove({ dx, dy }) {
    // Feed a burst of movement frames to the level engine
    const keys = {};
    if (dx < 0) keys.ArrowLeft = true;
    if (dx > 0) keys.ArrowRight = true;
    if (dy < 0) keys.ArrowUp = true;
    if (dy > 0) keys.ArrowDown = true;
    for (let i = 0; i < 30; i++) updateLevel(keys);
    const tile = getPartyTile();
    this.playerX = tile.tx;
    this.playerY = tile.ty;
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
        markDead(obj.id);
        audio.play('world/chest');
        this.showFloatText(obj.x, obj.y, `+${gold} GOLD`, COLORS_CSS.goldL);
        this.updateHud();
        if (shouldShowTutorial('FIRST_CHEST')) {
          markTutorialShown('FIRST_CHEST');
          this.dialogue.show([{ speaker: 'Hint', text: getTutorialText('FIRST_CHEST') }]);
        }
        break;
      }
      case 'potion': {
        this.save.potions += 1;
        writeSave(this.save);
        obj.consumed = true;
        markDead(obj.id);
        audio.play('world/gold');
        this.showFloatText(obj.x, obj.y, '+1 POTION', COLORS_CSS.plumL);
        this.updateHud();
        break;
      }
      case 'fairy':
      case 'valve':
      case 'beacon':
      case 'vent':
      case 'fragment':
      case 'crystal':
      case 'geoshard':
      case 'token':
      case 'page': {
        this.challengeProgress++;
        obj.consumed = true;
        markDead(obj.id);
        audio.play('world/chest');
        this.showFairyFlyAway();
        const ch = this.floor.challenge || { count: 3, label: 'ITEM', verb: 'found', allDoneMsg: 'Challenge complete!' };
        const remaining = ch.count - this.challengeProgress;
        if (remaining > 0) {
          this.showFloatText(obj.x, obj.y, `${ch.label} ${ch.verb}! ${remaining} left`, '#e088c0');
          if (this.challengeProgress === 1 && DIALOGUE.mid_floor_encourage) {
            this.dialogue.show(DIALOGUE.mid_floor_encourage);
          } else if (shouldShowTutorial('FIRST_FAIRY')) {
            markTutorialShown('FIRST_FAIRY');
            this.dialogue.show([{ speaker: 'Hint', text: getTutorialText('FIRST_FAIRY') }]);
          }
        } else {
          this.showFloatText(obj.x, obj.y, ch.allDoneMsg, '#f0d040');
          const egs = getGameState();
          if (egs) egs.fairies = this.challengeProgress;
          this.showFairyFlyAway();
          if (DIALOGUE.all_fairies_freed) {
            this.dialogue.show(DIALOGUE.all_fairies_freed);
          }
        }
        this.updateHud();
        break;
      }
      case 'golden': {
        if (!this.bossDefeated) {
          this.showFloatText(obj.x, obj.y, 'DEFEAT THE BOSS FIRST!', '#e088c0');
          return;
        }
        obj.consumed = true;
        markDead(obj.id);
        audio.play('world/chest');
        this.hasKey = true;
        // Sync with level engine
        const egs2 = getGameState();
        if (egs2) egs2.hasKey = true;
        // Make exit visible
        for (const o2 of this.objects) { if (o2.type === 'exit') o2.visible = true; markVisible(o2.id); }
        this.showFloatText(obj.x, obj.y, 'GOLDEN KEY OBTAINED!', '#f0d040');
        this.showKeyAnimation();
        this.updateHud();
        break;
      }
      case 'gold': {
        this.save.gold += 8;
        writeSave(this.save);
        obj.consumed = true;
        markDead(obj.id);
        audio.play('world/gold');
        this.showFloatText(obj.x, obj.y, '+8 GOLD', COLORS_CSS.goldL);
        this.updateHud();
        break;
      }
      case 'encounter': {
        obj.consumed = true;
        markDead(obj.id);
        audio.play('world/encounter');
        this.startBattle(false);
        break;
      }
      case 'boss': {
        const bch = this.floor.challenge || { count: 3 };
        if (this.challengeProgress < bch.count) {
          this.showFloatText(obj.x, obj.y, 'COMPLETE THE CHALLENGE FIRST!', '#e088c0');
          return;
        }
        // Do NOT consume the boss before the battle — if the player loses,
        // the boss must still be present for a retry. The boss object is
        // consumed after victory when bossDefeated is set to true.
        audio.play('world/encounter');
        this.startBattle(true, obj.enemyId);
        break;
      }
      case 'exit': {
        if (!this.hasKey) {
          this.showFloatText(obj.x, obj.y, 'FIND THE GOLDEN KEY FIRST', '#f0d040');
          return;
        }
        audio.play('world/floor-complete');
        this.registry.remove(`mazeState_${this.floorId}`);
        const victKey = `floor${this.floorId}_victory`;
        if (DIALOGUE[victKey] && DIALOGUE[victKey].length > 0) {
          transitionTo(this, SCENES.CUTSCENE, {
            lines: DIALOGUE[victKey],
            floorId: this.floorId,
            nextScene: SCENES.WORLD_MAP,
            nextData: undefined,
          }, 400);
        } else {
          transitionTo(this, SCENES.WORLD_MAP, undefined, 400);
        }
        break;
      }
    }
  }

  showFairyFlyAway() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2 - 100;
    const fairy = this.add.graphics();
    fairy.fillStyle(0x88aaff, 0.9);
    fairy.fillCircle(0, 0, 12);
    fairy.fillStyle(0xffffff, 0.6);
    fairy.fillCircle(-2, -2, 6);
    fairy.setPosition(cx, cy);
    fairy.setScrollFactor(0);
    // Sparkle particles around fairy
    for (let i = 0; i < 6; i++) {
      const sp = this.add.circle(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, 3, 0xffe880, 0.8);
      sp.setScrollFactor(0);
      this.tweens.add({ targets: sp, alpha: 0, scale: 0, x: 80, y: 60, duration: 1200, delay: i * 100, onComplete: () => sp.destroy() });
    }
    // Fly to top-right corner
    this.tweens.add({ targets: fairy, x: GAME_WIDTH - 80, y: 80, scale: 0.5, alpha: 0, duration: 1500, ease: 'Cubic.out', onComplete: () => fairy.destroy() });
  }

  showKeyAnimation() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2 - 80;
    const key = this.add.graphics();
    key.fillStyle(0xf0c040, 1);
    key.fillCircle(0, -8, 10);
    key.fillRect(-3, -2, 6, 20);
    key.fillRect(-8, 14, 16, 4);
    key.fillRect(-8, 8, 4, 4);
    key.setPosition(cx, cy);
    key.setScrollFactor(0);
    this.tweens.add({ targets: key, y: 60, scale: 0.6, duration: 1200, ease: 'Back.out', onComplete: () => {
      this.tweens.add({ targets: key, alpha: 0, duration: 500, onComplete: () => key.destroy() });
    }});
  }

  startBattle(isBoss, enemyId) {
    this.saveMazeState();

    this.registry.set('battleReturnScene', SCENES.MAZE);
    this.registry.set('battleReturnData', { floor: this.floorId });
    const d = this.playerX + this.playerY;
    const variant = this.floorId === 2 ? (d < 14 ? 0 : d < 28 ? 1 : 2)
                 : this.floorId === 3 ? (d < 16 ? 0 : d < 36 ? 1 : 2)
                 : Math.floor(Math.random() * 3);
    this.registry.set('battleVariant', variant);

    const battleData = {
      party: this.party,
      floor: this.floorId,
      grade: this.save.grade,
      isBoss,
      enemyId: isBoss ? enemyId : undefined,
    };

    const bossKey = `floor${this.floorId}_boss`;
    if (isBoss && DIALOGUE[bossKey] && DIALOGUE[bossKey].length > 0) {
      this.saveMazeState();
      transitionTo(this, SCENES.CUTSCENE, {
        lines: DIALOGUE[bossKey],
        floorId: this.floorId,
        nextScene: SCENES.BATTLE,
        nextData: battleData,
      }, 300);
      return;
    }

    transitionTo(this, SCENES.BATTLE, battleData, 300);
  }

  saveMazeState() {
    const gs = getGameState();
    const state = {
      x: this.playerX,
      y: this.playerY,
      objects: this.objects,
      fog: gs.fog || this.fog,
      bossDefeated: gs.hasKey || this.bossDefeated,
      fairiesFreed: this.challengeProgress,
      hasKey: this.hasKey || false,
    };
    this.registry.set(`mazeState_${this.floorId}`, state);
    try { localStorage.setItem(`mw_maze_${this.floorId}`, JSON.stringify(state)); } catch (e) { /* ignore */ }

    // Brief "Saved!" feedback at the top of the screen
    this.showSavedFeedback();
  }

  showSavedFeedback() {
    const savedText = this.add.text(GAME_WIDTH / 2, 40, 'Saved!', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '20px',
      color: '#f0d060',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setScrollFactor(0);

    // Fade in
    this.tweens.add({
      targets: savedText,
      alpha: 1,
      duration: 150,
      onComplete: () => {
        // Hold visible for 0.5s, then fade out over 0.3s
        this.tweens.add({
          targets: savedText,
          alpha: 0,
          duration: 300,
          delay: 500,
          onComplete: () => savedText.destroy(),
        });
      },
    });
  }

  // ================================================================
  // UI HELPERS
  // ================================================================

  showFloatText(tileX, tileY, text, color) {
    const sx = GAME_WIDTH / 2;
    const sy = GAME_HEIGHT / 2 - 60;
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
