import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, writeSave, getActiveSlot, isHeroUnlocked, unlockHero } from '../systems/save.js';
import { updateQuestProgress } from '../systems/dailyQuests.js';
import { audio } from '../systems/audio.js';
import { PaperButton } from '../ui/paperUI.js';
import { transitionTo } from '../ui/sceneHelpers.js';
import { webglAvailable } from '../ui/hubRouter.js';
import { DIALOGUE, getRescueDialogue } from '../data/dialogue.js';
import { DialogueOverlay } from '../ui/DialogueOverlay.js';
import { routePortal } from '../overworld/portals.js';
import { createControls3D } from '../overworld/controls3d.js';
import { collectItem } from '../overworld/collectibles.js';
import { toSave } from '../overworld/state.js';
import { getFloor, getBattleSceneVariant, TILE } from '../data/floors.js';
import { getLevel } from '../data/levels.js';
import { spawnHero, levelBonuses } from '../data/heroes.js';
import { generateRatedQuestion } from '../systems/math.js';
import { getAdaptiveGrade } from '../systems/mastery.js';
import {
  composeEncounter, applyBattleVictory, applyBattleDefeat,
} from '../systems/battleRules.js';
import { recordBattle } from '../systems/bonds.js';
import { checkAchievements } from '../systems/achievements.js';
import { updateQuestProgress as questTick } from '../systems/dailyQuests.js';
import { createBattleOverlay3D } from '../overworld/battleOverlay3d.js';
import {
  initialProgress, isChallengeType, nextLockDoor, doorQuestionSpec, bossGate,
  goldenGate, exitGate, advanceChallenge, challengeGoal, grantChest, grantGold,
  grantPotion, useFountain, syncPartyToSave, objectiveText,
} from '../overworld/floorRules.js';

/** Bump when the 3D floor snapshot shape changes; stale ones are discarded. */
const FLOOR3D_SCHEMA = 1;
const floor3dKey = (id) => `floor3d:${id}`;

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

    // ── Floor state ──
    // Null on the island. When a floor is open these mirror MazeScene's own
    // fields by name, because floorRules.js reads them by name in both.
    this.floorId = null;
    this.floor = null;         // floors.js record (challenge config, palettes)
    this.level = null;         // levels.js record (objective steps, secret)
    this.objects = null;       // rule objects: raw level entries + consumed
    this._handleToObj = null;  // 3D object handle id -> rule object
    this.party = [];
    Object.assign(this, initialProgress());
    /** Set when a boss fight is in flight; resolved on return from battle. */
    this._pendingBoss = false;
    /** A floor to re-open as soon as the world is up (battle return). */
    this._resumeFloor = data?.resumeFloor ?? null;
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
          onFloorTrigger: (handle) => this._onFloorTrigger(handle),
          // The fight happens in the world now — these three are its whole
          // lifecycle. See the BATTLE SEAM block below.
          battleAudio: audio,
          onBattleVictory: (r) => this._onBattleVictory(r),
          onBattleDefeat: (r) => this._onBattleDefeat(r),
          onBattleEnd: (r) => this._onBattleEnd(r),
        },
      });
    } catch (err) {
      console.warn('[overworld] 3D boot failed — falling back to World Map:', err);
      if (!this._destroyed) this.scene.start(SCENES.WORLD_MAP, this._entryData);
      return;
    }

    this._buildInput();
    this._buildHud();
    this.dialogue = new DialogueOverlay(this);

    // The 2D maths overlay for the 3D fight. Built from the same Paper
    // components the 2D BattleScene uses, and installed once — battle3d calls
    // it directly, and it draws nothing until an encounter begins.
    this._battleUi = createBattleOverlay3D(this, {
      purseAt: () => ({ x: 130, y: 96 }),
      onGold: () => this._pulseChip(this._goldChip, this.save.gold || 0),
      onAnswer: (correct) => { if (correct) questTick(this.save, 'correct'); },
    });
    this.app.setBattleUi(this._battleUi);

    audio.playMusic('music/map');

    // Returning from a battle fought inside a floor: rebuild that floor and
    // put the player back in it. The player never sees the island.
    if (this._resumeFloor) {
      const id = this._resumeFloor;
      this._resumeFloor = null;
      this._openFloor(id);
    }
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

  /**
   * INPUT — the whole feel of the game, and the thing the player called
   * "abysmal". Everything below is now in overworld/controls3d.js; this method
   * is only the wiring.
   *
   * WHAT WAS REPLACED, and why each one mattered:
   *
   *   The floating joystick. It re-anchored to wherever a thumb landed, so
   *   the origin teleported under you every time you re-grabbed it mid-walk.
   *   The stick now has a FIXED, always-visible base with a 330 px capture
   *   disc around it — sloppy aim still grabs it, but the centre never moves.
   *
   *   No camera at all. The eye was welded to the hero's facing: you could not
   *   look around, could not see behind you, could not line up a jump. The
   *   right half of the screen is now a camera orbit (drag to yaw/pitch, pinch
   *   to zoom, inertia on release, a slow drift back behind you while you run
   *   untouched), pushed to the 3D rig through setCameraOrbit.
   *
   *   Digital movement. x/y were summed booleans with no dead zone, no analog
   *   magnitude and no acceleration: the hero snapped between 0 and full speed
   *   in one frame, which is what "abysmal" actually feels like. Movement now
   *   runs through a dead zone, an outer saturation, a response curve and
   *   accel/decel/turn curves, and it resolves against the CAMERA.
   *
   *   Raw-edge jump. A press one frame early or one frame late was eaten.
   *   Coyote time (120 ms) and input buffering (150 ms) now cover both.
   *
   * Keyboard (WASD/arrows + Shift + Space + E) and the Gamepad API come along
   * for free — controls3d polls all three and lets the loudest one drive.
   */
  _buildInput() {
    // Kept for the rest of the scene, which reads E/ENTER for the portal.
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D,SPACE,SHIFT,E,ENTER');

    this._controls = createControls3D(this, { startYaw: this.app?.getFacing?.() ?? 0 });
    /** Wall clock of the previous update, for a real dt. */
    this._lastInputT = 0;
  }

  /**
   * The camera orbit must be re-anchored behind the hero whenever the world
   * teleports them (entering a floor, leaving one). The 3D rig snaps its own
   * boom; this keeps the input layer's orbit state from fighting it.
   */
  _resyncCamera() {
    if (this.app && this._controls) this._controls.snapTo(this.app.getCameraYaw?.() ?? this.app.getFacing?.() ?? 0);
  }

  // ── HUD: title, map escape hatch, gold/potion chips ──
  _buildHud() {
    this._realmTitle = this.add.text(40, 30, 'THE REALM', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setDepth(95).setScrollFactor(0);

    this._goldChip = this._makeChip(60, 96, PAPER.gold, '#3a2410', `${this.save.gold || 0}`);
    this._potionChip = this._makeChip(230, 96, PAPER.coral, PAPER_CSS.cream, `${this.save.potions || 0}`);

    this._title = this.add.text(40, 30, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '26px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setDepth(95).setScrollFactor(0).setVisible(false);

    const mapBtn = new PaperButton(this, GAME_WIDTH - 130, 56, 'MAP VIEW', {
      w: 180, h: 56, color: PAPER.teal, fontSize: 18,
      onClick: () => {
        this.saveMazeState();
        transitionTo(this, SCENES.WORLD_MAP, {}, 250, 'fade');
      },
    });
    this._mapBtn = mapBtn;
    [mapBtn.bg, mapBtn.shadow, mapBtn.label, mapBtn.zone].forEach((o) => o?.setDepth(95).setScrollFactor(0));
  }

  _setMapBtnVisible(v) {
    const b = this._mapBtn;
    if (!b) return;
    [b.bg, b.shadow, b.label, b.zone].forEach((o) => o?.setVisible(v));
    if (b.zone) { if (v) b.zone.setInteractive(); else b.zone.disableInteractive(); }
  }

  // ── Floor HUD: the objective, and the way out ────────────────────────
  // Reads exactly what the 2D maze HUD reads — floorRules.objectiveText is
  // the same function MazeScene.currentObjectiveText now calls.

  _buildFloorHud() {
    if (this._floorHud) return;
    this._setMapBtnVisible(false);
    this._realmTitle?.setVisible(false);
    this._title?.setVisible(true);

    const objPlate = this.add.rectangle(GAME_WIDTH / 2, 44, GAME_WIDTH - 460, 62, PAPER.inkTeal, 0.86)
      .setDepth(94).setScrollFactor(0);
    const objText = this.add.text(GAME_WIDTH / 2, 44, '', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '22px', color: PAPER_CSS.cream,
      wordWrap: { width: GAME_WIDTH - 500 },
      align: 'center',
    }).setOrigin(0.5).setDepth(95).setScrollFactor(0);

    const leaveBtn = new PaperButton(this, GAME_WIDTH - 130, 56, 'LEAVE', {
      w: 180, h: 56, color: PAPER.coral, fontSize: 18,
      onClick: () => {
        audio.play('ui/back');
        this._leaveFloor();
      },
    });
    [leaveBtn.bg, leaveBtn.shadow, leaveBtn.label, leaveBtn.zone]
      .forEach((o) => o?.setDepth(95).setScrollFactor(0));

    this._floorHud = { objPlate, objText, leaveBtn };
  }

  _refreshFloorHud() {
    if (!this._floorHud || !this.floorId) return;
    this._title?.setText((this.floor?.name || `FLOOR ${this.floorId}`).toUpperCase());
    this._floorHud.objText.setText(objectiveText(this, this.floor, this.level));
    this._goldChip?.label.setText(String(this.save.gold || 0));
    this._potionChip?.label.setText(String(this.save.potions || 0));
  }

  _destroyFloorHud() {
    const h = this._floorHud;
    this._floorHud = null;
    this._title?.setVisible(false);
    this._realmTitle?.setVisible(true);
    this._setMapBtnVisible(true);
    if (!h) return;
    h.objPlate.destroy();
    h.objText.destroy();
    [h.leaveBtn.bg, h.leaveBtn.shadow, h.leaveBtn.label, h.leaveBtn.zone].forEach((o) => o?.destroy());
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

  /**
   * Walk into a portal and the floor OPENS — as a 3D place, inside this same
   * world, with this same hero and this same camera. There is no
   * transitionTo(SCENES.MAZE) on the WebGL path any more; the 2D maze is now
   * reached only through the no-WebGL fallback (hubRouter -> WorldMapScene).
   */
  _enterPortal() {
    const portal = this._nearPortal;
    if (!portal || this._entering) return;

    const lines = DIALOGUE[`floor${portal.floorId}_entry`];
    const route = routePortal({
      save: this.save,
      floorId: portal.floorId,
      hasMazeState: this._hasFloorState(portal.floorId),
      hasEntryDialogue: !!(lines && lines.length > 0),
      mode: '3d',
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

    // The entry cutscene plays IN PLACE over the 3D world rather than as a
    // separate scene — leaving for CutsceneScene would tear the world down
    // and the whole point of this change is that it never gets torn down.
    if (route.lines && route.lines.length) {
      this.app?.setInputLocked(true);
      this.dialogue.show(route.lines).then(() => {
        this.app?.setInputLocked(false);
        this._openFloor(route.floorId);
      });
    } else {
      this._openFloor(route.floorId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // FLOORS AS 3D PLACES
  //
  // Every RULE below comes from overworld/floorRules.js, which MazeScene now
  // calls too — challenge progress, math-door locks, the boss gate, the golden
  // chest, the exit. What lives here is only presentation and 3D bookkeeping:
  // which mesh to hide, which collider to retract, which toast to float.
  // ══════════════════════════════════════════════════════════════════════

  /** Build floor `floorId`, hydrate its rules state, swap the HUD. */
  _openFloor(floorId) {
    if (!this.app || this.floorId) return false;
    const built = this.app.enterFloor(floorId);
    if (!built) { this._entering = false; return false; }

    this.floorId = floorId;
    this.floor = { ...getFloor(floorId), challenge: getFloor(floorId).challenge };
    this.level = getLevel(floorId);
    this.party = this._hydrateParty();

    // Rule objects are COPIES of the level definition. The 3D handles carry
    // `data` by reference into data/levels.js, and mutating a module-level
    // level definition would leak a consumed chest into every later session.
    const handles = this.app.floorObjects();
    this.objects = handles.map((h) => ({
      ...h.data,
      id: h.data.id ?? `${h.data.type}-${h.data.x}-${h.data.y}`,
      consumed: false,
      handle: h.id,
      // Where this thing actually STANDS, in metres. The 3D battle draws its
      // battle line from the player through here, so a fight stages itself
      // along the direction the encounter already had.
      worldX: h.x,
      worldZ: h.z,
      // level3d keys gates and their colliders on the RAW id with a tile
      // fallback (`o.data.id ?? "x-y"`), which is not the same string as the
      // rule id above when a door carries no id of its own. Keep both.
      gateId: h.data.id ?? `${h.data.x}-${h.data.y}`,
    }));
    this._handleToObj = new Map();
    handles.forEach((h, i) => this._handleToObj.set(h.id, this.objects[i]));

    Object.assign(this, initialProgress());
    this._restoreFloorState(floorId);
    this._entering = false;
    this._resyncCamera();
    this._hidePortalPrompt();
    this._buildFloorHud();
    this._refreshFloorHud();
    this._saveFloorState();
    audio.playMusic('music/maze');
    return true;
  }

  /** Leave the floor and step back onto the island at the portal. */
  _leaveFloor({ complete = false } = {}) {
    if (!this.floorId) return;
    if (!complete) this._saveFloorState();
    else this._clearFloorState(this.floorId);
    this.floorId = null;
    this.floor = null;
    this.level = null;
    this.objects = null;
    this._handleToObj = null;
    this.app?.exitFloor();
    this._resyncCamera();
    this._destroyFloorHud();
    audio.playMusic('music/map');
  }

  _hydrateParty() {
    return (this.save.party || []).map((s) => {
      if (!s || !s.id) return null;
      const h = spawnHero(s.id);
      if (!h) return null;
      const level = s.level || 1;
      const bonus = levelBonuses(level);
      h.maxHp += bonus.maxHp;
      h.atk += bonus.atk;
      h.def += bonus.def;
      h.hp = s.hp ?? h.maxHp;
      h.level = level;
      h.xp = s.xp || 0;
      return h;
    }).filter(Boolean);
  }

  // ── Floor persistence ────────────────────────────────────────────────
  // Deliberately NOT the MazeScene v6 snapshot: that record is a 2D tile
  // state (fog, tile coords, scattered encounters) and writing a half-filled
  // one under the same key would be read back by the 2D maze as a corrupt
  // floor. This is a small progress record keyed to the 3D runtime, and the
  // rules it feeds are the shared ones either way.

  _floorSnapshot() {
    return {
      v: FLOOR3D_SCHEMA,
      floorId: this.floorId,
      challengeProgress: this.challengeProgress,
      phase2Progress: this.phase2Progress,
      phase2Active: this.phase2Active,
      bossDefeated: this.bossDefeated,
      hasKey: this.hasKey,
      mazeTransformed: this.mazeTransformed,
      secretDone: this.secretDone,
      secretSeq: this.secretSeq,
      pendingBoss: this._pendingBoss,
      consumed: this.objects.filter((o) => o.consumed).map((o) => o.id),
      opened: this.objects.filter((o) => o.open).map((o) => o.id),
    };
  }

  _saveFloorState() {
    if (!this.floorId || !this.objects) return;
    const snap = this._floorSnapshot();
    this.registry.set(floor3dKey(this.floorId), snap);
    try { localStorage.setItem(`mw_floor3d_${this.floorId}`, JSON.stringify(snap)); } catch { /* ignore */ }
  }

  _clearFloorState(floorId) {
    this.registry.remove(floor3dKey(floorId));
    try { localStorage.removeItem(`mw_floor3d_${floorId}`); } catch { /* ignore */ }
  }

  _readFloorState(floorId) {
    let s = this.registry.get(floor3dKey(floorId));
    if (!s) {
      try {
        const raw = localStorage.getItem(`mw_floor3d_${floorId}`);
        if (raw) s = JSON.parse(raw);
      } catch { /* ignore */ }
    }
    return (s && s.v === FLOOR3D_SCHEMA) ? s : null;
  }

  /** True when this floor has 3D progress worth resuming (skips the intro). */
  _hasFloorState(floorId) {
    return !!this._readFloorState(floorId);
  }

  /** Replay a saved snapshot onto the freshly built floor. */
  _restoreFloorState(floorId) {
    const s = this._readFloorState(floorId);
    if (!s) return;
    this.challengeProgress = s.challengeProgress || 0;
    this.phase2Progress = s.phase2Progress || 0;
    this.phase2Active = !!s.phase2Active;
    this.hasKey = !!s.hasKey;
    this.mazeTransformed = !!s.mazeTransformed;
    this.secretDone = !!s.secretDone;
    this.secretSeq = s.secretSeq || 0;

    // A boss fight that was in flight resolves HERE: BattleScene marks the
    // floor complete on a boss victory (markFloorComplete), and a defeat
    // leaves it untouched, so the save itself is the outcome signal.
    this.bossDefeated = !!s.bossDefeated;
    if (s.pendingBoss) {
      const rec = (this.save.floors || [])[floorId - 1];
      if (rec && rec.complete) this.bossDefeated = true;
      this._pendingBoss = false;
    }

    const consumed = new Set(s.consumed || []);
    const opened = new Set(s.opened || []);
    for (const o of this.objects) {
      if (opened.has(o.id)) {
        o.open = true;
        if (o.type === 'mathdoor' || o.type === 'zerodoor') this.app.openFloorGate(o.gateId ?? o.id);
      }
      if (!consumed.has(o.id)) continue;
      o.consumed = true;
      this.app.consumeFloorObject(o.handle);
      if (o.type === 'hero') this.app.openFloorCage(o.x, o.y);
    }
    if (this.mazeTransformed) this.app.applyFloorTransform();
    if (this.secretDone) this.app.revealFloorSecret();
    // The boss is not consumed until it is beaten (a loss must leave it
    // standing for the retry), so its sweep happens here.
    if (this.bossDefeated) {
      for (const o of this.objects) {
        if (o.type !== 'boss' || o.consumed) continue;
        o.consumed = true;
        this.app.consumeFloorObject(o.handle);
      }
    }
  }

  // ── Triggers ─────────────────────────────────────────────────────────

  _onFloorTrigger(handle) {
    if (!this.floorId || !this._handleToObj) return;
    if (this.dialogue?.active || this._mathPrompt) return;
    if (this.app?.battleActive?.()) return;
    const obj = this._handleToObj.get(handle.id);
    if (!obj || obj.consumed) return;
    if (obj.type === 'mathdoor' && obj.open) return;
    this._interact(obj);
  }

  /** Consume an object: rules flag, mesh gone, trigger re-armed. */
  _consume(obj) {
    obj.consumed = true;
    this.app?.consumeFloorObject(obj.handle);
  }

  /**
   * The lock gate. Identical rule to MazeScene.promptNextLock (both call
   * nextLockDoor); the presentation is a 3D-world overlay instead of a maze
   * overlay, and opening a door here also retracts its collider.
   */
  _promptNextLock(obj, hint) {
    const door = nextLockDoor(this.objects, obj);
    if (!door) return false;
    const spec = doorQuestionSpec(door, this.floorId);
    const q = generateRatedQuestion({ ...spec, grade: getAdaptiveGrade(this.save, spec.operator) });
    if (hint) this._flash(hint);
    this._showMathPrompt(q, door, () => this._interact(obj));
    return true;
  }

  _interact(obj) {
    switch (obj.type) {
      case 'mathdoor': {
        if (obj.open) return;
        const spec = doorQuestionSpec(obj, this.floorId);
        const q = generateRatedQuestion({ ...spec, grade: getAdaptiveGrade(this.save, spec.operator) });
        this._showMathPrompt(q, obj, null);
        return;
      }
      case 'zerodoor': {
        if (this.secretDone || obj.open) return;
        // The ice wall that only nothing can open: the answer must be ZERO.
        const a = 3 + Math.floor(Math.random() * 7);
        const q = { a, op: '-', b: a, choices: [0, a, a * 2, a * 3], correctIndex: 0 };
        this._showMathPrompt(q, obj, () => this._completeSecret());
        return;
      }
      case 'chest':
      case 'gearkit': {
        if (this._promptNextLock(obj, 'Answer the vault lock!')) return;
        const gold = grantChest(this.save, obj);
        writeSave(this.save, this.slot);
        this._consume(obj);
        audio.play('world/chest');
        this._flash(`+${gold} GOLD`);
        this._pulseChip(this._goldChip, this.save.gold || 0);
        break;
      }
      case 'gold': {
        const g = grantGold(this.save);
        writeSave(this.save, this.slot);
        this._consume(obj);
        audio.play('world/gold');
        this._flash(`+${g} GOLD`);
        this._pulseChip(this._goldChip, this.save.gold || 0);
        break;
      }
      case 'potion': {
        grantPotion(this.save);
        writeSave(this.save, this.slot);
        this._consume(obj);
        audio.play('world/gold');
        this._flash('+1 POTION');
        this._pulseChip(this._potionChip, this.save.potions || 0);
        break;
      }
      case 'fountain': {
        const drink = useFountain(this.party, obj);
        this._flash(drink.message);
        if (drink.healed > 0) audio.play('world/chest');
        if (!drink.ok) return;
        syncPartyToSave(this.save, this.party);
        writeSave(this.save, this.slot);
        break;
      }
      case 'hero': {
        if (this._promptNextLock(obj, 'Answer the cell lock!')) return;
        this._rescueHero(obj);
        return;
      }
      case 'seqmark': {
        this._sequenceMark(obj);
        return;
      }
      case 'golden': {
        const gate = goldenGate(this);
        if (!gate.ok) { this._flash(gate.message); return; }
        this._consume(obj);
        this.hasKey = true;
        audio.play('world/chest');
        this._flash('GOLDEN KEY OBTAINED!');
        break;
      }
      case 'encounter': {
        this._consume(obj);
        audio.play('world/encounter');
        this._startBattle(false, undefined, obj);
        return;
      }
      case 'boss': {
        const gate = bossGate(this, this.floor);
        if (!gate.ok) { this._flash(gate.message); return; }
        if (this._promptNextLock(obj, 'Break the seal!')) return;
        // The boss is NOT consumed before the fight — a loss has to leave it
        // standing so the retry has something to walk back into.
        audio.play('world/encounter');
        this._startBattle(true, obj.enemyId, obj);
        return;
      }
      case 'exit': {
        const gate = exitGate(this);
        if (!gate.ok) { this._flash(gate.message); return; }
        this._finishFloor();
        return;
      }
      default: {
        if (!isChallengeType(obj.type)) return;
        if (this._promptNextLock(obj, 'Answer the lock!')) return;
        this._challengeItem(obj);
        return;
      }
    }
    this._saveFloorState();
    this._refreshFloorHud();
  }

  /** A challenge pickup. Rule is advanceChallenge; the payoff is the floor's
   *  transform actually happening in 3D — the bridge grows, the tide drains. */
  _challengeItem(obj) {
    const step = advanceChallenge(this, this.floor, obj);
    audio.play('world/chest');
    if (step.phase2) {
      obj.activated = true;
      this._consume(obj);
    } else {
      this._consume(obj);
    }
    this._flash(step.message);

    if (!step.phase2 && step.done) {
      this.mazeTransformed = true;
      this.app.applyFloorTransform();
      audio.play('world/floor-complete');
      const p1Key = `floor${this.floorId}_phase1_done`;
      const ch = challengeGoal(this.floor);
      if (ch.phase2 && !this.phase2Active) this.phase2Active = true;
      const lines = DIALOGUE[p1Key] || DIALOGUE.all_fairies_freed;
      if (lines && lines.length) this._say(lines);
    } else if (step.phase2 && step.done) {
      const p2Key = `floor${this.floorId}_phase2_done`;
      if (DIALOGUE[p2Key]) this._say(DIALOGUE[p2Key]);
    }
    this._saveFloorState();
    this._refreshFloorHud();
  }

  _rescueHero(obj) {
    this._consume(obj);
    this.app.openFloorCage(obj.x, obj.y);
    if (isHeroUnlocked(this.save, obj.heroId)) { this._saveFloorState(); return; }
    const heroDef = spawnHero(obj.heroId);
    if (!heroDef) { this._saveFloorState(); return; }
    audio.play('world/fairy');
    unlockHero(this.save, obj.heroId);
    writeSave(this.save, this.slot);
    this._saveFloorState();
    const lines = getRescueDialogue(this.floorId, [obj.heroId]);
    this._say(lines.length ? lines : [
      { speaker: heroDef.name, text: 'You... you found me! I am free!' },
      { speaker: heroDef.name, text: 'My strength is yours. Let me fight beside you!' },
    ]);
  }

  /** The signature secret's ordered/any markers. */
  _sequenceMark(obj) {
    const sec = this.level?.secret;
    if (!sec || this.secretDone) return;
    if (sec.requiresTransform && !this.mazeTransformed) {
      this._flash('IT SLEEPS... FOR NOW');
      return;
    }
    const marks = this.objects.filter((o) => o.type === 'seqmark');
    if (sec.order === 'any') {
      if (obj.activated) return;
      obj.activated = true;
      audio.play('world/fairy');
      const lit = marks.filter((o) => o.activated).length;
      this._flash(`${lit} / ${marks.length}`);
      if (lit >= marks.length) this._completeSecret();
      return;
    }
    if (obj.seqIdx === this.secretSeq) {
      this.secretSeq++;
      obj.activated = true;
      audio.play('world/fairy');
      this._flash(`${this.secretSeq} / ${marks.length}`);
      if (this.secretSeq >= marks.length) this._completeSecret();
    } else if (obj.seqIdx !== undefined && this.secretSeq > 0) {
      this.secretSeq = 0;
      for (const o of marks) o.activated = false;
      this._flash('THE GLOW FADES...');
      audio.play('ui/back');
    }
  }

  _completeSecret() {
    if (this.secretDone) return;
    this.secretDone = true;
    this.app.revealFloorSecret();
    audio.play('world/floor-complete');
    this._flash('A HIDDEN WAY OPENS!');
    this._saveFloorState();
  }

  // ══════════════════════════════════════════════════════════════════════
  // THE BATTLE SEAM
  //
  // Walking into a monster no longer leaves the world. overworld/battle3d.js
  // sweeps the camera into a battle framing WHERE THE PLAYER IS STANDING, the
  // party takes formation, the creature squares up, and the floor they were
  // walking through stays right there behind them. The maths is still 2D — the
  // question band, the four answers, the hint chip and the numpad are Phaser,
  // drawn by overworld/battleOverlay3d.js on top of the live 3D frame.
  //
  // The RULES are unchanged and unshared-by-copy: composeEncounter picks the
  // pack, battle3d resolves every swing through systems/battleRules.js, and
  // applyBattleVictory / applyBattleDefeat write the save — the same three
  // functions the 2D BattleScene calls.
  //
  // THE 2D FALLBACK survives for exactly two cases (see _startBattle):
  // no WebGL battle runtime, and a party that could not be staged. Both route
  // through _startBattle2D, which is the old code verbatim.
  // ══════════════════════════════════════════════════════════════════════

  /**
   * The walking HUD steps aside for the fight. The joystick, the JUMP/ACTION
   * buttons, the objective plate, the LEAVE/MAP button and the purse chips all
   * belong to WALKING — leaving them up during a battle both crowds the frame
   * and offers a child taps that do nothing.
   */
  _setWorldHudVisible(v) {
    this._controls?.setVisible(v);
    this._realmTitle?.setVisible(v && !this.floorId);
    this._title?.setVisible(v && !!this.floorId);
    this._setMapBtnVisible(v && !this.floorId);
    for (const chip of [this._goldChip, this._potionChip]) {
      chip?.plate.setVisible(v);
      chip?.label.setVisible(v);
    }
    const h = this._floorHud;
    if (h) {
      h.objPlate.setVisible(v);
      h.objText.setVisible(v);
      for (const o of [h.leaveBtn.bg, h.leaveBtn.shadow, h.leaveBtn.label, h.leaveBtn.zone]) {
        o?.setVisible(v);
      }
      if (h.leaveBtn.zone) {
        if (v) h.leaveBtn.zone.setInteractive(); else h.leaveBtn.zone.disableInteractive();
      }
    }
  }

  /**
   * @param {boolean} isBoss
   * @param {string} [enemyId]  the boss the gate names
   * @param {object} [obj]      the rule object walked into — its world
   *                            position is where the battle line is drawn
   */
  _startBattle(isBoss, enemyId, obj = null) {
    if (this.app?.battleActive?.()) return;

    const party = (this.party || []).filter((h) => h && h.hp > 0);
    const enemies = composeEncounter({
      floor: this.floorId || 1,
      grade: this.save.grade,
      isBoss: !!isBoss,
      enemyId: isBoss ? enemyId : null,
    });

    // The two genuine fallbacks. A fight with nobody in it, or with nothing to
    // fight, is not a fight — and neither is one the 3D world refuses to stage.
    if (!this.app?.startBattle || party.length === 0 || enemies.length === 0) {
      this._startBattle2D(isBoss, enemyId);
      return;
    }

    const begin = () => {
      const ok = this.app.startBattle({
        enemies,
        party,
        isBoss: !!isBoss,
        floor: this.floorId || 1,
        grade: this.save.grade,
        worldPos: obj && Number.isFinite(obj.worldX)
          ? { x: obj.worldX, y: 0, z: obj.worldZ }
          : undefined,
      });
      if (!ok) { this._startBattle2D(isBoss, enemyId); return; }
      this._battleBoss = !!isBoss;
      this._battleObj = obj;
      this._destroyPrompt();
      this._setWorldHudVisible(false);
      audio.playMusic(isBoss ? `music/boss-${this.floorId}` : 'music/battle');
    };

    // A boss still gets its entrance — played IN PLACE over the 3D world
    // rather than as a CutsceneScene, because tearing the world down is the
    // exact thing this change exists to stop.
    const bossKey = `floor${this.floorId}_boss`;
    if (isBoss && DIALOGUE[bossKey]?.length) {
      this.app?.setInputLocked(true);
      this.dialogue.show(DIALOGUE[bossKey]).then(() => {
        this.app?.setInputLocked(false);
        begin();
      });
      return;
    }
    begin();
  }

  /**
   * THE FALLBACK — the old seam, verbatim. Reached only when the 3D battle
   * runtime is unavailable or the encounter could not be staged. `resumeFloor`
   * is what brings the player back INTO the floor (not the island) whichever
   * way the fight goes.
   */
  _startBattle2D(isBoss, enemyId) {
    this._pendingBoss = !!isBoss;
    this._saveFloorState();
    this.saveMazeState();

    this.registry.set('battleReturnScene', SCENES.OVERWORLD);
    this.registry.set('battleReturnData', { slot: this.slot, resumeFloor: this.floorId });
    const tileType = this.level?.tiles?.[0]?.[0] ?? TILE.FLOOR;
    const sceneInfo = getBattleSceneVariant(this.floorId, tileType, isBoss);
    this.registry.set('battleVariant', sceneInfo.variant);
    this.registry.set('battleTileType', tileType);
    this.registry.set('battleSceneName', sceneInfo.name);

    const battleData = {
      party: this.party,
      floor: this.floorId,
      grade: this.save.grade,
      isBoss,
      enemyId: isBoss ? enemyId : undefined,
    };
    const bossKey = `floor${this.floorId}_boss`;
    if (isBoss && DIALOGUE[bossKey]?.length) {
      transitionTo(this, SCENES.CUTSCENE, {
        lines: DIALOGUE[bossKey],
        floorId: this.floorId,
        trigger: 'boss',
        nextScene: SCENES.BATTLE,
        nextData: battleData,
      }, 300);
      return;
    }
    transitionTo(this, SCENES.BATTLE, battleData, 300);
  }

  /**
   * VICTORY. Rewards, XP, level-ups and floor progression all flow through
   * battleRules.applyBattleVictory — the same call BattleScene.showVictory
   * makes, so a win in the world and a win in the maze pay identically.
   */
  _onBattleVictory(result) {
    const save = this.save;
    // Inside a floor only a BOSS completes the floor; a wandering creature is
    // worth gold and XP and nothing else. That is the same rule the 2D battle
    // applies when it came from a floor (`fromFloor3d`).
    const won = applyBattleVictory(save, {
      floor: result.floor ?? this.floorId ?? 1,
      correct: result.correct,
      wrong: result.wrong,
      streak: result.streak ?? 0,
      party: result.party,
      damageTaken: result.damageTaken,
      potionUsed: false,
      markFloor: !!result.isBoss,
    });
    recordBattle(save, (result.party || []).filter(Boolean).map((h) => h.id));
    const achievements = checkAchievements(save);
    writeSave(save, this.slot);

    if (result.isBoss) {
      this.bossDefeated = true;
      const boss = this._battleObj
        || (this.objects || []).find((o) => o.type === 'boss' && !o.consumed);
      if (boss && !boss.consumed) this._consume(boss);
    }

    this._pulseChip(this._goldChip, save.gold || 0);
    const lines = [`+${won.gold} GOLD   +${won.xp} XP`];
    if (won.leveledUp.length) lines.push(`LEVEL UP: ${won.leveledUp.join(' & ')}`);
    if (won.newHeroes.length) lines.push(`${won.newHeroes.join(' & ')} JOINS YOU!`);
    for (const a of achievements || []) lines.push(`${a.name || a} UNLOCKED!`);
    this._battleUi?.banner?.('VICTORY!', lines, PAPER_CSS.gold);

    this._saveFloorState();
    this._refreshFloorHud();
  }

  /**
   * DEFEAT. Gentle, exactly as the 2D battle is: the party comes back at half
   * HP and the creature is still standing, so the retry is a walk away.
   */
  _onBattleDefeat(result) {
    applyBattleDefeat(this.save, {
      correct: result.correct,
      wrong: result.wrong,
      party: result.party,
    });
    writeSave(this.save, this.slot);
    this.party = this._hydrateParty();
    this._battleUi?.banner?.('THE PARTY FALLS BACK', ['Your heroes rest, and rise again.'],
      PAPER_CSS.cream);
    this._saveFloorState();
    this._refreshFloorHud();
  }

  /** Whatever the outcome: the world takes the stick and the music back. */
  _onBattleEnd() {
    this._battleBoss = false;
    this._battleObj = null;
    if (this._destroyed) return;
    this._setWorldHudVisible(true);
    this.app?.clearFloorTriggerLatch();
    // battle3d parks the eye on its 'exit' pose, which is the follow boom's
    // resting place BEHIND THE HERO. Snap the input layer's orbit to the same
    // heading or the boom immediately swings back to wherever the orbit was
    // left before the fight.
    this._controls?.snapTo(this.app?.getFacing?.() ?? 0);
    audio.playMusic(this.floorId ? 'music/maze' : 'music/map');
  }

  /** The exit arch, with the key in hand. */
  _finishFloor() {
    const floorId = this.floorId;
    audio.play('world/floor-complete');
    updateQuestProgress(this.save, 'floor');
    writeSave(this.save, this.slot);
    this._clearFloorState(floorId);
    this._leaveFloor({ complete: true });

    const victKey = `floor${floorId}_victory`;
    if (floorId === 9) {
      transitionTo(this, SCENES.ENDING, undefined, 400);
      return;
    }
    if (DIALOGUE[victKey]?.length) {
      this.app?.setInputLocked(true);
      this.dialogue.show(DIALOGUE[victKey]).then(() => this.app?.setInputLocked(false));
    }
  }

  /** Dialogue over the live 3D world — the world keeps rendering behind it. */
  _say(lines) {
    if (!lines || !lines.length) return;
    this.app?.setInputLocked(true);
    this.dialogue.show(lines).then(() => {
      this.app?.setInputLocked(false);
      this.app?.clearFloorTriggerLatch();
    });
  }

  /**
   * The math door prompt. Presentation only — the question comes from
   * systems/math.js and the gate rule from floorRules.doorQuestionSpec, both
   * shared with MazeScene. A wrong answer re-asks after a beat, exactly as the
   * maze does: a locked door is never a dead end.
   */
  _showMathPrompt(question, door, onOpen) {
    if (this._mathPrompt) return;
    this.app?.setInputLocked(true);
    const els = [];
    const kill = () => {
      for (const e of els) if (e.scene) e.destroy();
      els.length = 0;
      this._mathPrompt = null;
      this.app?.setInputLocked(false);
      this.app?.clearFloorTriggerLatch();
    };
    this._mathPrompt = { kill };

    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.62)
      .setDepth(500).setScrollFactor(0).setInteractive();
    els.push(dim);

    const qStr = question.text || `${question.a} ${question.op === '*' ? '×' : question.op === '/' ? '÷' : question.op} ${question.b} = ?`;
    els.push(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.30, qStr, {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '48px', color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setOrigin(0.5).setDepth(502).setScrollFactor(0));

    const n = question.choices.length;
    const btnW = 180, btnH = 70, gap = 20;
    const totalW = n * btnW + (n - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalW / 2 + btnW / 2;
    const btnY = GAME_HEIGHT * 0.58;
    els.push(this.add.rectangle(GAME_WIDTH / 2, btnY, totalW + 56, btnH + 44, PAPER.inkTeal, 0.97)
      .setStrokeStyle(3, PAPER.cream, 0.55).setDepth(501).setScrollFactor(0));

    let answered = false;
    for (let i = 0; i < n; i++) {
      const x = startX + i * (btnW + gap);
      const correct = i === question.correctIndex;
      const bg = this.add.rectangle(x, btnY, btnW, btnH, PAPER.teal, 1)
        .setDepth(502).setScrollFactor(0).setInteractive({ useHandCursor: true });
      els.push(bg);
      els.push(this.add.text(x, btnY, String(question.choices[i]), {
        fontFamily: '"Fredoka One", sans-serif', fontSize: '32px', color: PAPER_CSS.cream,
      }).setOrigin(0.5).setDepth(503).setScrollFactor(0));
      bg.on('pointerdown', () => {
        if (answered) return;
        answered = true;
        if (correct) {
          door.open = true;
          this.app?.openFloorGate(door.gateId ?? door.id);
          audio.play('world/chest');
          kill();
          this._flash('Door opened!');
          this._saveFloorState();
          this._refreshFloorHud();
          onOpen?.();
        } else {
          audio.play('ui/back');
          kill();
          this._flash('Try again!');
          this.time.delayedCall(600, () => {
            if (this._destroyed || door.open || !this.floorId) return;
            const spec = doorQuestionSpec(door, this.floorId);
            const q = generateRatedQuestion({ ...spec, grade: getAdaptiveGrade(this.save, spec.operator) });
            this._showMathPrompt(q, door, onOpen);
          });
        }
      });
    }
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

  update(time) {
    if (!this.app || !this._controls) return;

    // Real seconds since the last update, clamped: a backgrounded tab must
    // never hand the accel/orbit integrators a half-second step.
    const now = time || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = this._lastInputT ? Math.min(0.05, (now - this._lastInputT) / 1000) : 1 / 60;
    this._lastInputT = now;

    // A modal (dialogue, math door) owns the screen: neutralise the stick and
    // freeze the orbit rather than letting a stray drag spin the world behind
    // the panel.
    // A fight owns the screen the same way a modal does: the stick is dead and
    // the orbit is frozen, because battle3d is writing the camera itself.
    const locked = !!(this.dialogue?.active || this._mathPrompt || this._entering
      || this.app.battleActive?.());

    const f = this._controls.poll({
      dt,
      now,
      grounded: this.app.isGrounded ? this.app.isGrounded() : true,
      playerYaw: this.app.getFacing ? this.app.getFacing() : 0,
      moveN: this.app.getSpeedNorm ? this.app.getSpeedNorm() : 0,
      locked,
      actionKind: locked ? null : (this.app.getNearActionKind ? this.app.getNearActionKind() : null),
    });

    // `world: true` — controls3d already resolved the stick against the
    // camera's yaw, so index.js must NOT rotate it a second time.
    this.app.setInput({ x: f.x, y: f.z, jump: f.jump, run: f.run, world: true });
    this.app.setCameraOrbit?.({ yaw: f.yaw, pitch: f.pitch, zoom: f.zoom });

    // ACTION — the one context verb. The on-screen button, E/Enter and the
    // gamepad's X all land here, and the label above them already said which
    // of ENTER / OPEN / TALK it was going to be.
    if (f.action && !locked) this._doAction();

    // E / Enter also remains the keyboard twin of tapping the ENTER prompt,
    // for anyone who learned it before the ACTION button existed.
    if (this._nearPortal && !this._entering) {
      const e = this.wasd?.E;
      const ent = this.wasd?.ENTER;
      if ((e && Phaser.Input.Keyboard.JustDown(e)) || (ent && Phaser.Input.Keyboard.JustDown(ent))) {
        this._enterPortal();
      }
    }
  }

  /**
   * What the context button does. Only the portal needs an explicit press —
   * floor objects are walk-into triggers and the 3D world fires those itself —
   * so pressing ACTION beside one simply re-arms and re-fires its trigger,
   * which is the behaviour a child expects from a button that says OPEN.
   */
  _doAction() {
    if (this._nearPortal) { this._enterPortal(); return; }
    this.app?.clearFloorTriggerLatch();
  }

  /**
   * Called by main.js on visibilitychange, and before every scene exit that
   * leaves the hub — persists position/yaw/last-portal/pickups into
   * save.overworld (v6) so re-entry drops the player where they stood.
   */
  saveMazeState() {
    if (!this.app || !this.save) return;
    try {
      // Inside a floor the player state is FLOOR coordinates; writing those
      // into save.overworld would drop the player into the middle of the
      // ocean on the next boot. The island snapshot taken when the floor was
      // entered is already the correct one, so leave it alone.
      if (!this.floorId) this.save.overworld = toSave(this.app.getPlayerState());
      writeSave(this.save, this.slot);
      if (this.floorId) this._saveFloorState();
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
    this._controls?.destroy();
    this._controls = null;
    this._destroyPrompt();
    this._mathPrompt?.kill();
    // A fight in flight must not survive the scene: end it before the world
    // goes, so the save is written and the overlay is not left orphaned.
    try { this.app?.endBattle?.('fled'); } catch { /* the world may be half-gone */ }
    this._battleUi?.destroy();
    this._battleUi = null;
    // A floor in progress must survive the scene going away (a battle, a tab
    // close): the snapshot is what _restoreFloorState replays on the way back.
    if (this.floorId) this._saveFloorState();
    if (this.app) {
      this.app.dispose();
      this.app = null;
    }
  }
}
