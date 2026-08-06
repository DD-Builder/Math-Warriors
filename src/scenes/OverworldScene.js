import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS, mazeStateKey } from '../config.js';
import { loadSave, writeSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { PaperButton } from '../ui/paperUI.js';
import { transitionTo } from '../ui/sceneHelpers.js';
import { webglAvailable } from '../ui/hubRouter.js';
import { DIALOGUE } from '../data/dialogue.js';
import { routePortal } from '../overworld/portals.js';
import { collectItem } from '../overworld/collectibles.js';
import { toSave } from '../overworld/state.js';

/**
 * OverworldScene — the Phaser bridge to the Three.js 3D overworld hub.
 *
 * The 3D world renders on the #mw-overworld canvas UNDERNEATH this scene's
 * (transparent) Phaser canvas. This scene owns everything 2D and everything
 * Phaser: the HUD, the virtual joystick + keyboard input, the portal prompt,
 * scene transitions (Phaser irises/fades are opaque and cover the 3D canvas
 * below), and the 3D app's lifecycle (dynamic import — three.js never loads
 * until a player actually enters the overworld).
 *
 * WHY portal entry routes through overworld/portals.js instead of duplicating
 * WorldMapScene.enterFloor: two doors into the same floor that drift apart is
 * a bug factory. routePortal is the pure decision (party gate, lock gate,
 * entry cutscene); this scene supplies only the two impure lookups it can't
 * make — the registry/localStorage maze-in-progress probe and DIALOGUE.
 *
 * If WebGL is unavailable (Lockdown Mode, no-GL headless, context death) it
 * routes straight to the fully-intact 2D WorldMapScene. The overworld is an
 * upgrade, never a wall.
 */
export class OverworldScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.OVERWORLD });
  }

  init(data) {
    this.slot = data?.slot || getActiveSlot(this);
    this.save = loadSave(this.slot);
    this._entryData = data || {};
    this.app = null;
    this._destroyed = false;
    this._nearPortal = null;
    this._entering = false;
  }

  create() {
    // Opaque cover while the 3D world boots — prevents a transparent-canvas
    // flash of the page background. Removed on the app's first rendered frame.
    this._cover = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.inkTeal, 1)
      .setDepth(50).setScrollFactor(0);
    this._coverText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'WAKING THE WORLD…', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '30px',
      color: PAPER_CSS.cream,
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);

    if (!webglAvailable()) {
      // No WebGL — the 2D World Map remains the hub. No error, no fuss.
      this.scene.start(SCENES.WORLD_MAP, this._entryData);
      return;
    }

    // The hub launches no battles of its own, and a stale return target left
    // by a previous scene would send a later victory somewhere dead.
    // MazeScene/TowerScene/BossRushScene each set this before every launch.
    this.registry.remove('battleReturnScene');
    this.registry.remove('battleReturnData');

    this._boot();

    // Lifecycle: tear the 3D app down whenever this scene stops.
    this.events.once('shutdown', () => this._teardown());
    this.events.once('destroy', () => this._teardown());
  }

  async _boot() {
    try {
      // three.js and the whole 3D world live in a lazily-loaded chunk.
      const { createOverworld } = await import('../overworld/index.js');
      if (this._destroyed || !this.scene.isActive(SCENES.OVERWORLD)) return;
      this.app = await createOverworld({
        game: this.game,
        save: this.save,
        hooks: {
          onFirstFrame: () => this._revealWorld(),
          onContextLost: () => { this.app?.pause(); },
          onContextRestored: () => { this.app?.resume(); },
          onPortalNear: (portal) => this._showPortalPrompt(portal),
          onPortalLeave: () => this._hidePortalPrompt(),
          onCollect: (spec) => this._onCollect(spec),
        },
      });
    } catch (err) {
      console.warn('[overworld] 3D boot failed — falling back to World Map:', err);
      if (!this._destroyed) this.scene.start(SCENES.WORLD_MAP, this._entryData);
      return;
    }

    this._buildInput();
    this._buildHud();
    audio.playMusic('music/map');
  }

  /** First 3D frame is on screen — fade the opaque boot cover away. */
  _revealWorld() {
    if (!this._cover) return;
    this.tweens.add({
      targets: [this._cover, this._coverText],
      alpha: 0,
      duration: 350,
      onComplete: () => { this._cover?.destroy(); this._coverText?.destroy(); this._cover = null; },
    });
  }

  // ── Input: WASD/arrows + virtual joystick + jump + run + interact ──
  _buildInput() {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,SPACE,SHIFT,E,ENTER');

    // Virtual joystick (bottom-left). First continuous-drag input in the
    // game: pointerdown anchors the stick, pointermove supplies an analog
    // vector, pointerup releases. Phaser-object based — document-level
    // audio-unlock capture listeners are untouched.
    const jr = 95;                       // ring radius
    const jx = 190, jy = GAME_HEIGHT - 190;
    this._joy = { active: false, id: null, baseX: jx, baseY: jy, vx: 0, vy: 0 };

    this._joyRing = this.add.circle(jx, jy, jr, PAPER.inkTeal, 0.28)
      .setStrokeStyle(4, PAPER.cream, 0.5).setDepth(90).setScrollFactor(0);
    this._joyKnob = this.add.circle(jx, jy, 42, PAPER.cream, 0.75)
      .setDepth(91).setScrollFactor(0);

    this.input.on('pointerdown', (p) => {
      // Left half of the screen grabs the stick (re-anchors to the touch).
      if (p.x < GAME_WIDTH * 0.45 && p.y > GAME_HEIGHT * 0.35 && !this._joy.active) {
        this._joy.active = true;
        this._joy.id = p.id;
        this._joy.baseX = p.x; this._joy.baseY = p.y;
        this._joyRing.setPosition(p.x, p.y);
        this._joyKnob.setPosition(p.x, p.y);
      }
    });
    this.input.on('pointermove', (p) => {
      if (!this._joy.active || p.id !== this._joy.id) return;
      const dx = p.x - this._joy.baseX, dy = p.y - this._joy.baseY;
      const len = Math.hypot(dx, dy);
      const capped = Math.min(len, jr);
      const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
      this._joyKnob.setPosition(this._joy.baseX + nx * capped, this._joy.baseY + ny * capped);
      this._joy.vx = nx * (capped / jr);
      this._joy.vy = ny * (capped / jr);
    });
    const release = (p) => {
      if (!this._joy.active || (p && p.id !== this._joy.id)) return;
      this._joy.active = false; this._joy.id = null;
      this._joy.vx = 0; this._joy.vy = 0;
      this._joyRing.setPosition(190, GAME_HEIGHT - 190);
      this._joyKnob.setPosition(190, GAME_HEIGHT - 190);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    // Jump button (bottom-right)
    this._jumpQueued = false;
    const jbx = GAME_WIDTH - 170, jby = GAME_HEIGHT - 180;
    this._jumpBtn = this.add.circle(jbx, jby, 72, PAPER.gold, 0.85)
      .setStrokeStyle(5, PAPER.inkTeal, 0.6).setDepth(90).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.add.text(jbx, jby, 'JUMP', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '24px', color: '#3a2410',
    }).setOrigin(0.5).setDepth(91).setScrollFactor(0);
    this._jumpBtn.on('pointerdown', () => { this._jumpQueued = true; });
  }

  // ── HUD: title, map escape hatch, gold/potion chips ──
  _buildHud() {
    this.add.text(40, 30, 'THE REALM', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setDepth(95).setScrollFactor(0);

    this._goldChip = this._makeChip(60, 96, PAPER.gold, '#3a2410', `${this.save.gold || 0}`);
    this._potionChip = this._makeChip(230, 96, PAPER.coral, PAPER_CSS.cream, `${this.save.potions || 0}`);

    const mapBtn = new PaperButton(this, GAME_WIDTH - 130, 56, 'MAP VIEW', {
      w: 180, h: 56, color: PAPER.teal, fontSize: 18,
      onClick: () => {
        this.saveMazeState();
        transitionTo(this, SCENES.WORLD_MAP, {}, 250, 'fade');
      },
    });
    [mapBtn.bg, mapBtn.shadow, mapBtn.label, mapBtn.zone].forEach((o) => o?.setDepth(95).setScrollFactor(0));
  }

  /** One papercut HUD counter. Returns { plate, label } for pulsing. */
  _makeChip(x, y, color, textColor, value) {
    const plate = this.add.rectangle(x, y, 150, 52, color, 0.92)
      .setOrigin(0, 0.5).setDepth(94).setScrollFactor(0);
    const label = this.add.text(x + 75, y, value, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: textColor,
    }).setOrigin(0.5).setDepth(95).setScrollFactor(0);
    return { plate, label };
  }

  /** Grow-and-settle pulse on a chip when its count changes. */
  _pulseChip(chip, value) {
    if (!chip) return;
    chip.label.setText(String(value));
    this.tweens.killTweensOf([chip.plate, chip.label]);
    chip.plate.setScale(1);
    chip.label.setScale(1);
    this.tweens.add({
      targets: [chip.plate, chip.label],
      scaleX: 1.22, scaleY: 1.22,
      duration: 130, yoyo: true, ease: 'Back.out',
    });
  }

  // ── Pickups ──
  _onCollect(spec) {
    const res = collectItem(this.save, spec);
    if (!res.granted) return;
    writeSave(this.save, this.slot);
    audio.play('world/gold');
    if (spec.kind === 'gold') this._pulseChip(this._goldChip, this.save.gold || 0);
    else this._pulseChip(this._potionChip, this.save.potions || 0);
  }

  // ── Portal prompt ──
  _showPortalPrompt(portal) {
    this._nearPortal = portal;
    if (this._promptBtn) this._destroyPrompt();
    const btn = new PaperButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 150, `ENTER — FLOOR ${portal.floorId}`, {
      w: 460, h: 88, color: PAPER.gold, textColor: '#3a2410', fontSize: 30,
      seed: 4200 + portal.floorId,
      onClick: () => this._enterPortal(),
    });
    [btn.bg, btn.shadow, btn.label, btn.zone].forEach((o) => o?.setDepth(96).setScrollFactor(0));
    this._promptBtn = btn;
  }

  _hidePortalPrompt() {
    this._nearPortal = null;
    this._destroyPrompt();
  }

  _destroyPrompt() {
    if (!this._promptBtn) return;
    const b = this._promptBtn;
    this._promptBtn = null;
    [b.bg, b.shadow, b.label, b.zone].forEach((o) => o?.destroy());
  }

  /** True when this floor has a maze already in progress (registry first). */
  _hasMazeState(floorId) {
    if (this.registry.get(mazeStateKey(floorId))) return true;
    try { return !!localStorage.getItem(`mw_maze_${floorId}`); } catch { return false; }
  }

  _enterPortal() {
    const portal = this._nearPortal;
    if (!portal || this._entering) return;

    const lines = DIALOGUE[`floor${portal.floorId}_entry`];
    const route = routePortal({
      save: this.save,
      floorId: portal.floorId,
      hasMazeState: this._hasMazeState(portal.floorId),
      hasEntryDialogue: !!(lines && lines.length > 0),
    });

    if (route.block === 'no-party') {
      audio.play('ui/back');
      this.saveMazeState();
      this.scene.start(SCENES.PARTY_SELECT, { grade: this.save.grade });
      return;
    }
    if (route.block === 'locked') {
      audio.play('ui/back');
      this._flash('That gate is still sealed.');
      return;
    }

    this._entering = true;
    audio.play('ui/confirm');
    this.app?.notePortalUsed(portal.id);
    this.saveMazeState();
    this._destroyPrompt();
    transitionTo(this, route.sceneKey, route.data, 300, 'circle');
  }

  _flash(message) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 260, message, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: PAPER_CSS.cream,
      backgroundColor: PAPER_CSS.inkTeal,
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(97).setScrollFactor(0);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 400, onComplete: () => t.destroy() });
  }

  update() {
    if (!this.app) return;
    let x = this._joy?.vx || 0;
    let y = this._joy?.vy || 0;
    if (this.cursors?.left.isDown || this.wasd?.A.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) x += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) y += 1;
    const jump = this._jumpQueued ||
      Phaser.Input.Keyboard.JustDown(this.wasd?.SPACE ?? { isDown: false });
    this._jumpQueued = false;
    const run = !!(this.wasd?.SHIFT?.isDown);
    // Screen-space stick → world: up on the stick is "away from camera".
    this.app.setInput({ x, y: -y, jump, run });

    // E / Enter is the keyboard twin of tapping the ENTER prompt.
    if (this._nearPortal && !this._entering) {
      const e = this.wasd?.E;
      const ent = this.wasd?.ENTER;
      if ((e && Phaser.Input.Keyboard.JustDown(e)) || (ent && Phaser.Input.Keyboard.JustDown(ent))) {
        this._enterPortal();
      }
    }
  }

  /**
   * Called by main.js on visibilitychange, and before every scene exit that
   * leaves the hub — persists position/yaw/last-portal/pickups into
   * save.overworld (v6) so re-entry drops the player where they stood.
   */
  saveMazeState() {
    if (!this.app || !this.save) return;
    try {
      this.save.overworld = toSave(this.app.getPlayerState());
      writeSave(this.save, this.slot);
    } catch (err) {
      console.warn('[overworld] save failed:', err);
    }
  }

  /** Called by main.js before drawing the session-timer overlay. */
  prepareSystemOverlay() {
    this.app?.pause();
  }

  _teardown() {
    this._destroyed = true;
    this._destroyPrompt();
    if (this.app) {
      this.app.dispose();
      this.app = null;
    }
  }
}
