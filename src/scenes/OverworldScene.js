import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, getActiveSlot } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { PaperButton } from '../ui/paperUI.js';
import { transitionTo } from '../ui/sceneHelpers.js';
import { webglAvailable } from '../ui/hubRouter.js';

/**
 * OverworldScene — the Phaser bridge to the Three.js 3D overworld hub.
 *
 * The 3D world renders on the #mw-overworld canvas UNDERNEATH this scene's
 * (transparent) Phaser canvas. This scene owns everything 2D and everything
 * Phaser: the HUD, the virtual joystick + keyboard input, scene transitions
 * (Phaser irises/fades are opaque and cover the 3D canvas below), and the 3D
 * app's lifecycle (dynamic import — three.js never loads until a player
 * actually enters the overworld).
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

  // ── Input: WASD/arrows + virtual joystick + jump ──
  _buildInput() {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,SPACE');

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

  // ── Minimal Phase-0 HUD (hubHUD extraction lands in Phase 1) ──
  _buildHud() {
    this.add.text(40, 30, 'THE REALM', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setDepth(95).setScrollFactor(0);

    const mapBtn = new PaperButton(this, GAME_WIDTH - 130, 56, 'MAP VIEW', {
      w: 180, h: 56, color: PAPER.teal, fontSize: 18,
      onClick: () => transitionTo(this, SCENES.WORLD_MAP, {}, 250, 'fade'),
    });
    [mapBtn.bg, mapBtn.shadow, mapBtn.label, mapBtn.zone].forEach((o) => o?.setDepth(95).setScrollFactor(0));
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
    // Screen-space stick → world: up on the stick is "away from camera".
    this.app.setInput({ x, y: -y, jump });
  }

  /** Called by main.js on visibilitychange — persist position (save v6, Phase 1). */
  saveMazeState() {
    // Phase 1: write save.overworld.pos/yaw. No-op for Phase 0.
  }

  /** Called by main.js before drawing the session-timer overlay. */
  prepareSystemOverlay() {
    this.app?.pause();
  }

  _teardown() {
    this._destroyed = true;
    if (this.app) {
      this.app.dispose();
      this.app = null;
    }
  }
}
