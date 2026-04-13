import Phaser from 'phaser';
import { SCENES, COLORS, COLORS_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { getFloor, TILE } from '../data/floors.js';
import { loadSave, writeSave, markFloorComplete } from '../systems/save.js';
import { spawnHero } from '../data/heroes.js';
import { spawnEnemy, pickEnemyForFloor } from '../data/enemies.js';
import { audio } from '../systems/audio.js';
import { FLOOR_PALETTES } from '../systems/papercut.js';

/**
 * MazeScene
 *
 * A walkable tile-based dungeon. The party (represented by the lead
 * hero) walks around a grid, fog-of-war reveals as they explore,
 * chests give loot, encounter tiles trigger battles, and a boss at
 * the end gates the exit portal.
 *
 * Design principles this honors:
 *   - Snappy tempo: grid-snap movement at ~8 tiles/sec
 *   - Clarity: fog makes the next step obvious, reveals gradually
 *   - Respect session length: save after every battle, resume where left off
 *   - Failure is a restart: battle defeat returns to the world map,
 *     maze state is preserved via the save file
 *
 * v0.5 scope:
 *   - Tilemap rendered as colored rectangles from data/floors.js
 *   - Keyboard (arrows/WASD) + on-screen d-pad for iPad
 *   - Collision with walls
 *   - Fog of war with a 3-tile reveal radius
 *   - Chest interaction → gold
 *   - Potion pickup → +1 potion
 *   - Encounter tile → BattleScene → return to maze, tile removed
 *   - Boss tile → BattleScene → mark floor complete → return to world map
 *   - Exit tile → return to world map (after boss defeated)
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
      this.objects = this.floor.objects.map((o) => ({ ...o, id: `${o.type}-${o.x}-${o.y}`, consumed: false }));
      this.fog = this.buildInitialFog();
      this.bossDefeated = false;
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
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // Use the papercut palette's sky color for the area outside the maze
    const pal = FLOOR_PALETTES[this.floorId] || FLOOR_PALETTES[1];
    this.cameras.main.setBackgroundColor(pal.sky);
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
    this.buildObjects();
    this.buildPlayer();
    this.buildFogOverlay();
    this.buildHUD();
    this.buildDpad();

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
    for (let y = 0; y < this.floor.height; y++) {
      const row = [];
      for (let x = 0; x < this.floor.width; x++) {
        const t = this.floor.tiles[y][x];
        const color = this.colorForTile(t);
        const sx = this.originX + x * this.tileSize + this.tileSize / 2;
        const sy = this.originY + y * this.tileSize + this.tileSize / 2;
        const rect = this.add.rectangle(sx, sy, this.tileSize, this.tileSize, color)
          .setStrokeStyle(1, 0x000000, 0.2);
        row.push(rect);
      }
      this.tileSprites.push(row);
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
    switch (obj.type) {
      case 'chest':
        bg = this.add.rectangle(0, 0, this.tileSize * 0.7, this.tileSize * 0.6, COLORS.gold)
          .setStrokeStyle(2, COLORS.ink);
        icon = this.add.text(0, 0, '\u{1F4B0}', { fontSize: `${this.tileSize * 0.5}px` }).setOrigin(0.5);
        break;
      case 'potion':
        bg = this.add.circle(0, 0, this.tileSize * 0.35, COLORS.plum)
          .setStrokeStyle(2, COLORS.ink);
        icon = this.add.text(0, 0, '\u{1F9EA}', { fontSize: `${this.tileSize * 0.5}px` }).setOrigin(0.5);
        break;
      case 'encounter':
        bg = this.add.rectangle(0, 0, this.tileSize * 0.7, this.tileSize * 0.7, COLORS.scarlet)
          .setStrokeStyle(3, COLORS.ink);
        icon = this.add.text(0, 0, '\u{2694}', { fontSize: `${this.tileSize * 0.5}px` }).setOrigin(0.5);
        break;
      case 'boss':
        bg = this.add.circle(0, 0, this.tileSize * 0.45, 0x8a1010)
          .setStrokeStyle(4, COLORS.goldL);
        icon = this.add.text(0, 0, '\u{1F480}', { fontSize: `${this.tileSize * 0.55}px` }).setOrigin(0.5);
        this.tweens.add({
          targets: bg,
          scale: 1.1,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        break;
      case 'exit':
        bg = this.add.circle(0, 0, this.tileSize * 0.45, COLORS.goldL)
          .setStrokeStyle(4, COLORS.gold);
        icon = this.add.text(0, 0, '\u{2728}', { fontSize: `${this.tileSize * 0.55}px` }).setOrigin(0.5);
        bg.setVisible(this.bossDefeated);
        icon.setVisible(this.bossDefeated);
        break;
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
    const leadHero = this.party[0];
    const color = leadHero?.displayColor ?? COLORS.cobalt;
    const sx = this.originX + this.playerX * this.tileSize + this.tileSize / 2;
    const sy = this.originY + this.playerY * this.tileSize + this.tileSize / 2;

    this.playerSprite = this.add.container(sx, sy);
    const body = this.add.rectangle(0, 0, this.tileSize * 0.6, this.tileSize * 0.7, color)
      .setStrokeStyle(2, COLORS.ink);
    const head = this.add.circle(0, -this.tileSize * 0.25, this.tileSize * 0.12, 0xf0d8b0)
      .setStrokeStyle(2, COLORS.ink);
    this.playerSprite.add([body, head]);

    // No idle bob — it conflicts with movement tweens on the same target.
    // We'll add sprite animation later when real art lands.
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
    const hudY = GAME_HEIGHT - 90;

    // Panel background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 90, GAME_WIDTH, 180, COLORS.ink, 0.9)
      .setStrokeStyle(3, COLORS.paperD, 0.5);

    // Floor name
    this.add.text(40, hudY - 50, `F${this.floorId}: ${this.floor.name.toUpperCase()}`, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '20px',
      color: COLORS_CSS.goldL,
    }).setOrigin(0, 0.5);

    // Gold + potions
    this.hudGold = this.add.text(40, hudY + 0, `\u{1FA99} ${this.save.gold}`, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '18px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);
    this.hudPotions = this.add.text(40, hudY + 40, `\u{1F9EA} ${this.save.potions}`, {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '18px',
      color: COLORS_CSS.paper,
    }).setOrigin(0, 0.5);

    // Party strip in hud center
    const stripX = GAME_WIDTH / 2 - 180;
    const stripY = hudY + 10;
    this.add.text(stripX - 20, stripY, 'PARTY', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '14px',
      color: COLORS_CSS.inkL,
    }).setOrigin(1, 0.5);
    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i];
      const x = stripX + i * 130;
      this.add.rectangle(x, stripY, 80, 40, hero.displayColor).setStrokeStyle(2, COLORS.ink);
      this.add.text(x, stripY + 32, hero.name, {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '10px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);
      // HP bar
      const pct = hero.hp / hero.maxHp;
      this.add.rectangle(x, stripY - 30, 80, 8, COLORS.ink).setStrokeStyle(1, COLORS.paperD);
      this.add.rectangle(x - 39, stripY - 30, 78 * pct, 6, 0x40c040).setOrigin(0, 0.5);
    }

    // Back to world map
    const backBg = this.add.rectangle(GAME_WIDTH - 90, hudY + 20, 140, 60, COLORS.paperD)
      .setStrokeStyle(3, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 90, hudY + 20, 'WORLD MAP', {
      fontFamily: '"Fredoka One", cursive',
      fontSize: '12px',
      color: COLORS_CSS.ink,
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => {
      audio.play('ui/back');
      this.saveMazeState();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.WORLD_MAP);
      });
    });

    // Settings / pause — top-right
    const settingsBg = this.add.rectangle(GAME_WIDTH - 60, 40, 100, 60, COLORS.paperD, 0.9)
      .setStrokeStyle(3, COLORS.ink)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 60, 40, '\u2699', {
      fontSize: '32px',
      color: COLORS_CSS.ink,
    }).setOrigin(0.5);
    settingsBg.on('pointerdown', () => {
      audio.play('ui/click');
      this.saveMazeState();
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.SETTINGS, {
          returnScene: SCENES.MAZE,
          returnData: { floor: this.floorId },
        });
      });
    });
  }

  updateHud() {
    this.hudGold.setText(`\u{1FA99} ${this.save.gold}`);
    this.hudPotions.setText(`\u{1F9EA} ${this.save.potions}`);
  }

  // ================================================================
  // D-PAD (touch input for iPad)
  // ================================================================

  buildDpad() {
    const centerX = GAME_WIDTH - 130;
    const centerY = GAME_HEIGHT - 260;
    const btnSize = 80;
    const offset = 85;

    const make = (x, y, symbol, dir) => {
      const bg = this.add.rectangle(x, y, btnSize, btnSize, COLORS.ink, 0.85)
        .setStrokeStyle(4, COLORS.paperD)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y, symbol, {
        fontFamily: '"Fredoka One", cursive',
        fontSize: '32px',
        color: COLORS_CSS.paper,
      }).setOrigin(0.5);
      bg.on('pointerdown', () => this.tryMove(dir));
    };

    make(centerX,          centerY - offset, '\u25B2', { dx: 0,  dy: -1 });
    make(centerX,          centerY + offset, '\u25BC', { dx: 0,  dy: 1  });
    make(centerX - offset, centerY,          '\u25C4', { dx: -1, dy: 0  });
    make(centerX + offset, centerY,          '\u25BA', { dx: 1,  dy: 0  });
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
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(SCENES.WORLD_MAP);
        });
        break;
      }
    }
  }

  startBattle(isBoss, enemyId) {
    this.saveMazeState();

    // Signal to BattleScene that completion should come back here, not
    // go to the world map.
    this.registry.set('battleReturnScene', SCENES.MAZE);
    this.registry.set('battleReturnData', { floor: this.floorId });
    if (isBoss) {
      this.registry.set('battleIsBoss', true);
    } else {
      this.registry.remove('battleIsBoss');
    }

    const enemy = isBoss && enemyId
      ? spawnEnemy(enemyId)
      : spawnEnemy(pickEnemyForFloor(this.floorId).id);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENES.BATTLE, {
        party: this.party,
        enemy,
        floor: this.floorId,
        grade: this.save.grade,
        isBoss,
      });
    });
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
      fontFamily: '"Fredoka One", cursive',
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
