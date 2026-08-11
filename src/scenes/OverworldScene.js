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
import { createStaminaGauge } from '../overworld/traversalHud.js';
import {
  createCinematicDirector, islandArrival, heroFreed, challengeComplete,
  bossLairApproach, finale, floorTitleCard, floorCompleteCard,
} from '../overworld/cinematics.js';
import {
  getFloorBeat, pickBanter, pickHeroLine, getArcBeat, getProofFragment,
} from '../data/story.js';
import { playSfx } from '../systems/synthAudio.js';
import {
  initialProgress, isChallengeType, nextLockDoor, doorQuestionSpec, bossGate,
  goldenGate, exitGate, advanceChallenge, challengeGoal, grantChest, grantGold,
  grantPotion, useFountain, syncPartyToSave, objectiveText,
} from '../overworld/floorRules.js';
import { momentTitle } from '../overworld/progression.js';

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
    /** Real-clock (performance.now()) deadline for the no-party redirect
     * below — see _enterPortal()'s 'no-party' branch for why this is not
     * `this.time.delayedCall`. */
    this._noPartyRedirectAt = null;
    /** Queue for _scheduleRaw() — every OTHER deferred call in this scene
     * (story beats, the math-door retry prompt) now goes through the same
     * raw-clock mechanism as _noPartyRedirectAt, for the same reason: see
     * _scheduleRaw's doc comment. */
    this._pendingRaw = [];

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

    // ── Story clocks ──
    /** Seconds of uninterrupted walking since the last party banter. */
    this._banterT = 0;
    /** Banter ids already heard this session — nobody repeats themselves. */
    this._banterHeard = new Set();
    /** Set once a floor's midpoint beat has played, so it plays once. */
    this._midpointDone = false;
    /**
     * Bumped on every floor entry and exit. Anything queued against the floor
     * you were standing in checks this before it fires — see _waitThenSay.
     */
    this._floorEpoch = 0;
  }

  /**
   * How long a child walks before the party says something unprompted.
   *
   * Long enough that banter is a surprise and not a nag, short enough that a
   * session of exploring is never silent. The clock only runs while the player
   * is actually MOVING and nothing else owns the screen (see update()), so
   * standing still to read a sign does not burn the timer.
   */
  static get BANTER_PERIOD() { return 52; }

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
          // The debug/screenshot API takes the world over (freeze, pose,
          // teleport). A director still ticking on the Phaser side would
          // refill the cinematic camera slot on the very next frame, so it
          // gets stopped from in there rather than only cleared.
          stopCinematics: () => this._cine?.stop(),
          // The world hard-placed the camera on its own (a debug teleport).
          // The orbit integrator lives here and would otherwise re-push its
          // stale yaw on the very next frame.
          onCameraSnap: () => this._resyncCamera(),
          onBattleVictory: (r) => this._onBattleVictory(r),
          onBattleDefeat: (r) => this._onBattleDefeat(r),
          onBattleEnd: (r) => this._onBattleEnd(r),
          // Walking into a roaming island creature (creatures.js) is a real
          // encounter: same battle path as a floor's monster tile, difficulty
          // keyed to the floor the creature's species belongs to.
          onCreatureEncounter: (enemyId, info) => this._onCreatureEncounter(enemyId, info),

          // ── THE PRESENTATION HOOKS ─────────────────────────────────────
          // Every one of these is EMITTED by the 3D runtime whether or not
          // anyone listens. They shipped once with no receivers — abilities,
          // discovery, the compass and every progression beat were computed
          // each frame and silently dropped ("modules wired because imports
          // exist"). The receivers live here now; keep this list in sync with
          // the hooks index.js forwards (index.js: abilities + discovery).
          onHeroSwap: (e) => this._onHeroSwap(e),
          onAbilityPrompt: (p) => this._onAbilityPrompt(p),
          onAbilityBlocked: (r, hint) => { if (hint) this._flash(hint); },
          onAbilityGate: (g, canOpen, who) => this._onAbilityGate(g, canOpen, who),
          onMoment: (m) => { const t = momentTitle(m); if (t) this._flash(t); },
          onStagedMoment: (m) => this._onStagedMoment(m),
          onVista: (f, p) => this._onVista(p),
          onBanter: () => this._banterT = OverworldScene.BANTER_PERIOD,
          onPing: (f, p) => { if (p?.line) this._flash(p.line); },
          onDiscovery: (e) => this._onDiscovery(e),
          onCompass: (h) => { this._discHint = h || null; },
          onDiscoveryProgress: (p) => { this._discProgress = p || null; },
          onToybox: (s) => { this._toyboxStats = s || null; },
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
    this._buildCinematics();

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

  /**
   * THE DIRECTOR. cinematics.js owns the letterbox, the title cards, the fade
   * and the shot list; this is the eight wires it needs into a live game.
   *
   * WHO WRITES THE CAMERA: nobody here. The director computes an ABSOLUTE shot
   * and hands it to app.setCinematicCamera(), which is a slot the 3D rig reads
   * once a frame — the same discipline battle3d follows, for the same reason.
   */
  _buildCinematics() {
    this._cine = createCinematicDirector({
      scene: this,
      save: this.save,
      persist: () => writeSave(this.save, this.slot),
      dialogue: this.dialogue,
      audio,
      setCamera: (s) => this.app?.setCinematicCamera?.(s),
      setInputLocked: (v) => this.app?.setInputLocked?.(v),
      resolve: (name) => this._cineAnchor(name),
      hero: (a) => this.app?.setHeroAction?.(a),
      reducedMotion: !!this.save?.settings?.reducedMotion,
      onPlay: () => { this._cineStartedAt = this.time.now; },
      onEnd: () => {
        // A cinematic ends on a cut back to the follow boom; the input layer's
        // orbit has to be told where the eye actually landed or it swings.
        this._resyncCamera();
        this.app?.clearFloorTriggerLatch?.();
        // If that cinematic was a STAGED progression moment, the queue must
        // hear it finished or it never offers the next one.
        this.app?.stagedMomentDone?.();
      },
    });

    // ── ANY KEY, ANY TAP ─────────────────────────────────────────────────
    // The SKIP chip is a 170 px target in one corner. A child who has decided
    // they are done watching does not go looking for it — they mash. So every
    // key and every touch skips, after a short grace so that the very tap that
    // opened the world cannot eat the cinematic it just started.
    //
    // This is also the reason a cinematic can never trap anyone: there is no
    // input that leaves you watching.
    this._cineSkipGuard = () => {
      if (!this._cine?.active) return;
      if (this.time.now - (this._cineStartedAt || 0) < OverworldScene.CINE_SKIP_GRACE) return;
      this._cine.skip();
      this._resyncCamera();
    };
    this.input.keyboard?.on('keydown', this._cineSkipGuard);
    this.input.on('pointerdown', this._cineSkipGuard);
  }

  /** Milliseconds a cinematic is protected from the mash-to-skip listener. */
  static get CINE_SKIP_GRACE() { return 900; }
  /** Seconds of sustained "I am trying to walk" that also skips a cinematic. */
  static get CINE_SKIP_HOLD() { return 0.45; }

  /**
   * Is this save standing on the island for the FIRST TIME?
   *
   * The arrival cinematic is an establishing shot, and an establishing shot
   * shown to somebody who already lives here is an interruption. Three
   * independent proofs of "we have been here before", any one of which is
   * enough: a stored island position, a cleared floor, a fought battle. The
   * director's own `once` flag is belt to this braces — it stops a REPLAY,
   * while this stops the first play landing on the wrong player.
   */
  _isFirstArrival() {
    const s = this.save;
    if (s?.overworld?.pos) return false;
    if ((s?.floors || []).some((f) => f && f.complete)) return false;
    if ((s?.stats?.totalBattles || 0) > 0) return false;
    return true;
  }

  /**
   * A player leaning on the stick is telling you they are done watching.
   *
   * The tap/key listener catches a mash, but a HELD key fires one keydown and
   * then nothing, so a child who simply starts walking during the intro would
   * be ignored for the rest of it. This reads the raw controls — before the
   * cinematic lock zeroes them — and skips once the intent has been sustained
   * long enough to be an intent and not a twitch.
   */
  _cineSkipOnMove(dt) {
    if (!this._cine?.active) { this._moveHoldT = 0; return; }
    const k = this.wasd;
    const c = this.cursors;
    const pressed = !!(k?.W?.isDown || k?.A?.isDown || k?.S?.isDown || k?.D?.isDown
      || c?.up?.isDown || c?.down?.isDown || c?.left?.isDown || c?.right?.isDown
      || this._controls?.stick?.active);
    if (!pressed) { this._moveHoldT = 0; return; }
    this._moveHoldT = (this._moveHoldT || 0) + dt;
    if (this._moveHoldT < OverworldScene.CINE_SKIP_HOLD) return;
    this._moveHoldT = 0;
    this._cine.skip();
    this._resyncCamera();
  }

  /**
   * Where a cinematic's named anchors are, in world metres.
   *
   * 'hero' is the only anchor every authored sequence uses; 'palace' is the
   * island's landmark and 'target' is filled in by the sequence itself as
   * literal coordinates, so it never reaches here.
   */
  _cineAnchor(name) {
    if (name === 'palace') return { x: 0, y: 58, z: 0, yaw: 0 };
    const st = this.app?.getTraversalState?.();
    if (!st) return { x: 0, y: 0, z: 0, yaw: 0 };
    return { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw };
  }

  /** First 3D frame is on screen — fade the opaque boot cover away. */
  _revealWorld() {
    if (!this._cover) return;
    this.tweens.add({
      targets: [this._cover, this._coverText],
      alpha: 0,
      duration: 350,
      onComplete: () => {
        this._cover?.destroy(); this._coverText?.destroy(); this._cover = null;
        // ARRIVAL. Played the first time a save ever sees the island and never
        // again — the director checks save.overworld.seen itself, so this can
        // fire unconditionally on every boot. Skippable, like all of them.
        if (!this.floorId && !this._resumeFloor && this._isFirstArrival()) {
          this._cine?.play(islandArrival({ palace: { x: 0, y: 58, z: 0 } }));
          // The moment the cinematic clears (or is skipped), turn the camera
          // at Floor 1's gate and say where to go — see _orientFirstArrival.
          this._waitThenSay(() => this._orientFirstArrival(), 800);
        }
      },
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

    // ── THE PORTAL COMPASS ────────────────────────────────────────────────
    // A papercut chip on the HUD's top edge whose arrow always points at the
    // nearest gate the child can PLAY RIGHT NOW, with the distance beside it.
    // This is the answer to "I never even found a playable level": a portal
    // 18 m from spawn is undiscoverable when nothing on screen mentions it.
    // The arrow is bearing-relative to the CAMERA, so "arrow up" always means
    // "walk forward" — the only compass convention a five-year-old has.
    {
      const cx = GAME_WIDTH - 350;
      const cy = 60;
      const shadow = this.add.rectangle(cx + 4, cy + 6, 270, 56, PAPER.shadow, 0.30)
        .setDepth(93).setScrollFactor(0);
      const plate = this.add.rectangle(cx, cy, 270, 56, PAPER.inkTeal, 0.88)
        .setStrokeStyle(3, PAPER.gold, 0.55).setDepth(94).setScrollFactor(0);
      const arrow = this.add.triangle(cx - 105, cy, 0, -15, 12, 10, -12, 10, PAPER.gold)
        .setDepth(95).setScrollFactor(0);
      const label = this.add.text(cx - 80, cy, '', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '20px', color: PAPER_CSS.gold,
      }).setOrigin(0, 0.5).setDepth(95).setScrollFactor(0);
      const parts = [shadow, plate, arrow, label];
      parts.forEach((o) => o.setVisible(false));
      this._compass = { parts, arrow, label };
    }

    // ── THE STAMINA RING ──────────────────────────────────────────────────
    // A papercut arc drawn AROUND THE HERO rather than parked in a corner,
    // because the thing it is about — can I keep climbing? — is happening at
    // the hero and a child's eyes are already there. It fades itself in the
    // moment the pool is spent and out again once it is full, so a walk across
    // the island never shows it at all.
    this._stamina = createStaminaGauge(this, { depth: 93 });
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
    // The pickup's own chime already played positionally, from the 3D side,
    // where the coin was. This is the purse acknowledging it.
    audio.play('world/gold');
    if (spec.kind === 'gold') this._pulseChip(this._goldChip, this.save.gold || 0);
    else this._pulseChip(this._potionChip, this.save.potions || 0);
  }

  // ── Ability / discovery / progression receivers ──────────────────────

  /** The party ring turned: new leader in the field, chips re-read. */
  _onHeroSwap(e) {
    playSfx('ui/select');
    this._flash(`${(e?.to?.name || e?.to?.id || 'HERO').toUpperCase()} LEADS!`);
    this._chipT = 99; // refresh the touch chips this frame
  }

  /** "Somebody here can move that" — the ability layer's contextual nudge. */
  _onAbilityPrompt(p) {
    const text = p?.hint || p?.text || (p?.verb ? `${p.verb}!` : null);
    if (!text) return;
    // Throttled: a prompt re-emitted per frame must not stack toasts.
    if (this._lastPromptText === text && this.time.now - (this._lastPromptAt || 0) < 4000) return;
    this._lastPromptText = text;
    this._lastPromptAt = this.time.now;
    this._flash(text);
  }

  _onAbilityGate(g, canOpen) {
    const name = g?.name || 'THE WAY';
    this._flash(canOpen ? `${name}: your party can open this!` : `${name} needs a different hero…`);
  }

  /** A progression moment big enough for the director. True = staged. */
  _onStagedMoment(m) {
    const seq = this.app?.cinematicFor?.(m);
    if (!seq || !this._cine) return false;
    return this._cine.play(seq) === true;
  }

  /** A vista fill: the line, the gold, the purse pulse. */
  _onVista(p) {
    if (!p) return;
    if (p.line) this._say([{ speaker: p.name || 'Elara', text: p.line }]);
    if (p.gold) {
      this.save.gold = (this.save.gold || 0) + p.gold;
      writeSave(this.save, this.slot);
      this._pulseChip(this._goldChip, this.save.gold);
    }
  }

  /** A discovery arrival beat — chime, name, reward, persist. */
  _onDiscovery(e) {
    playSfx('world/secret');
    const name = e?.record?.name || 'A DISCOVERY';
    this._flash(`${name.toUpperCase()} — DISCOVERED!`);
    if (e?.reward?.gold) this._pulseChip(this._goldChip, this.save.gold || 0);
    writeSave(this.save, this.slot);
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
      // A save with fewer than three heroes cannot enter (same gate as the 2D
      // map). This used to scene.start() mid-frame — from inside the live
      // input poll — which threw an uncaught "reading 'sys'" TypeError inside
      // Phaser's scene-start path and left the child at a button that did
      // nothing. Say WHY, then leave through the same guarded transition every
      // other exit uses, deferred out of the input callback.
      if (this._entering) return;
      this._entering = true;
      audio.play('ui/back');
      this._flash('You need 3 heroes! Let’s pick your party…');
      this.saveMazeState();
      // NOT this.time.delayedCall(900, ...) — MEASURED on the build: under
      // sustained sub-5fps (this scene's normal operating range on
      // SwiftShader, and the range a loaded real device can hit too — see
      // D1-B), Phaser's OWN TimeStep delta-smoothing
      // (core/TimeStep.js#smoothDelta) treats every over-200ms frame as
      // "probably a corrupted/backgrounded-tab delta" and substitutes a
      // stale value from its history buffer instead of the real elapsed
      // time. Clock.update() advances TimerEvents by that substituted
      // delta, not by wall-clock time, so a `this.time.delayedCall` can
      // stall for many real seconds — observed hanging past 9s of a 900 ms
      // delay with the callback never firing, timer stuck "active" the
      // whole time. `update(time)`'s own `time` argument is the RAW,
      // unsmoothed timestamp (it is what Clock.now is set from too), so a
      // plain deadline compared against it every frame is immune to the
      // same stall. See the check at the top of update().
      this._noPartyRedirectAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 900;
      return;
    }
    if (route.block === 'locked') {
      audio.play('ui/back');
      this._flash('That gate is still sealed.');
      return;
    }

    this._entering = true;
    audio.play('ui/confirm');
    // The arch itself, not a menu blip: a warp has a sound and it plays where
    // the arch is standing, so the last thing a child hears on the island is
    // the gate they walked through.
    playSfx('world/portal');
    this.app?.emitSoundAtPlayer?.('warp', 0.9);
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
    this._floorEpoch++;

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

    // ── THE FLOOR'S OPENING ──────────────────────────────────────────────
    // A title card first (a two-second papercut plate that names the place),
    // then the arc's ARRIVAL beat — Elara counting roses, the fisherman's tide
    // chart, whoever this floor belongs to. Both are once-per-save and both
    // are skippable; a returning player walks straight in.
    this._midpointDone = false;
    this._banterT = 0;
    this._cine?.play(floorTitleCard(floorId));
    this._playFloorBeat('arrival');
    return true;
  }

  /**
   * Play one beat of the story arc for the open floor.
   *
   * Beats are queued BEHIND whatever the director is doing rather than
   * competing with it: a title card and an arrival speech in the same frame
   * would talk over each other, so the beat waits for the card to clear.
   * Returns false when this floor has no such beat, which is not an error —
   * FLOOR_BEATS is authored per floor and a floor may simply be quiet.
   */
  _playFloorBeat(phase) {
    const lines = getFloorBeat(this.floorId, phase);
    if (!lines.length) return false;
    const key = `floor${this.floorId}_${phase}`;
    if (this.save.seenBeats?.[key]) return false;
    this.save.seenBeats = this.save.seenBeats || {};
    this.save.seenBeats[key] = true;
    writeSave(this.save, this.slot);
    this._waitThenSay(() => this._say(lines), 400);
    return true;
  }

  /**
   * Run `fn` once nothing else owns the screen.
   *
   * EPOCH-GUARDED, and that guard is the whole point of the function. A queued
   * beat is a timer with the player's attention attached to it, and the player
   * can walk out of the floor it belongs to while it is still waiting. Firing
   * it then puts a full-screen dialogue over the ISLAND — one that swallows the
   * next tap, which is exactly how a queued line ends up eating the press of
   * the ENTER button on the very next gate. `_floorEpoch` moves on every floor
   * entry and exit, so a stale beat quietly dies instead of ambushing anyone.
   *
   * It also waits behind a dialogue and a math prompt, not just a cinematic:
   * two overlays on screen at once is how a five-year-old loses the plot.
   */
  _waitThenSay(fn, delayMs = 300) {
    const epoch = this._floorEpoch;
    const poll = () => {
      if (this._destroyed || epoch !== this._floorEpoch) return;
      if (this._cine?.active || this.dialogue?.active || this._mathPrompt) {
        this._scheduleRaw(300, poll);
        return;
      }
      fn();
    };
    // NOT this.time.delayedCall — see _scheduleRaw's doc comment. Every story
    // beat in this file (first-arrival orientation, a floor's arrival/departure
    // lines, a rescue's dialogue) went through _waitThenSay, and
    // this.time.delayedCall is exactly the primitive _noPartyRedirectAt's
    // comment already warned stalls under sustained sub-5fps — MEASURED live:
    // under a fresh-save session on this build, the very first orientation
    // beat's `this.time.delayedCall(800, poll)` never fired at all across 20+
    // real seconds (Phaser's Clock never advanced far enough), even though
    // the cinematic that scheduled it had already finished. That is the
    // second half of "no cutscenes seen" — the FIRST beat a fresh player
    // should ever see was silently dead on exactly the hardware (SwiftShader,
    // and by extension a loaded iPad) this game targets.
    this._scheduleRaw(delayMs, poll);
  }

  /**
   * A deferred call on the RAW clock, not Phaser's Clock.
   *
   * `this.time.delayedCall` looked right and tested green (a spec that just
   * lets rAF run at native desktop speed will see it fire on schedule every
   * time) — it is still wrong. Phaser's TimeStep smooths `delta` and, per
   * core/TimeStep.js#smoothDelta, treats any frame slower than ~200 ms as a
   * probably-corrupted/backgrounded-tab reading and substitutes a stale value
   * from its own history instead of the real elapsed time. `Clock.update()`
   * advances every TimerEvent (delayedCall included) by THAT substituted
   * delta, not by wall-clock time — so under sustained sub-5fps (this scene's
   * normal range on SwiftShader, and a range a loaded real device can hit
   * too, per D1-B) a delayedCall can stall for many real seconds, or — as
   * measured live on this build's very first story beat — never fire at all.
   *
   * `update(time)`'s `time` argument is the RAW, unsmoothed timestamp (see
   * the `now` computed at its top, which is what `_noPartyRedirectAt` already
   * compared against for the same reason); a plain deadline against that is
   * immune. This is the general form of that one-off pattern, for every OTHER
   * deferred call in the scene.
   */
  _scheduleRaw(delayMs, fn) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._pendingRaw.push({ at: now + Math.max(0, delayMs), fn });
  }

  /** Run and clear every _scheduleRaw() entry whose deadline has passed. */
  _flushScheduledRaw(now) {
    if (!this._pendingRaw.length) return;
    const due = [];
    this._pendingRaw = this._pendingRaw.filter((p) => {
      if (now < p.at) return true;
      due.push(p.fn);
      return false;
    });
    for (const fn of due) {
      if (this._destroyed) return;
      fn();
    }
  }

  /** Leave the floor and step back onto the island at the portal. */
  _leaveFloor({ complete = false } = {}) {
    if (!this.floorId) return;
    if (!complete) this._saveFloorState();
    else this._clearFloorState(this.floorId);
    // Nothing this floor was saying follows the player out of it. The epoch
    // kills anything still QUEUED (see _waitThenSay); finish() closes anything
    // already on screen — and it must be finish(), not hide(), because hide()
    // leaves show()'s promise pending and the input lock with it.
    this._floorEpoch++;
    this._cine?.stop();
    if (this.dialogue?.active) this.dialogue.finish();
    this._midpointDone = false;
    this.floorId = null;
    this.floor = null;
    this.level = null;
    this.objects = null;
    this._handleToObj = null;
    this.app?.exitFloor();
    this._resyncCamera();
    this._destroyFloorHud();
    // A completed floor turns its beacon teal and may have unlocked the next
    // gate's gold — recolour from the save's fresh truth either way.
    this.app?.refreshBeacons?.();
    this._portalTargets = null;
    audio.playMusic('music/map');
    // Write the island position NOW, not only at the next portal entry.
    // exitFloor() (above) parks the player back at the SAME island spot
    // saveMazeState() captured on the way in, so a plain enter->exit
    // round trip happens to already agree — but saveMazeState is otherwise
    // only called on the way INTO a gate, on the no-party redirect, on the
    // 2D battle fallback, and on visibilitychange. Any session that ends
    // (tab close, crash) after leaving a floor and before touching another
    // portal would resume from that stale entry-time snapshot instead of
    // wherever the player actually is. `this.floorId` is already null here
    // (set above), which is saveMazeState's own guard against writing floor
    // coordinates into the island slot.
    this.saveMazeState();
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
        playSfx('world/chest-open');
        this._flash(`+${gold} GOLD`);
        this._pulseChip(this._goldChip, this.save.gold || 0);
        break;
      }
      case 'gold': {
        const g = grantGold(this.save);
        writeSave(this.save, this.slot);
        this._consume(obj);
        audio.play('world/gold');
        playSfx('world/coin');
        this._flash(`+${g} GOLD`);
        this._pulseChip(this._goldChip, this.save.gold || 0);
        break;
      }
      case 'potion': {
        grantPotion(this.save);
        writeSave(this.save, this.slot);
        this._consume(obj);
        playSfx('world/potion');
        this._flash('+1 POTION');
        this._pulseChip(this._potionChip, this.save.potions || 0);
        break;
      }
      case 'fountain': {
        const drink = useFountain(this.party, obj);
        this._flash(drink.message);
        if (drink.healed > 0) playSfx('world/fountain');
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
        playSfx('world/chest-open');
        this._flash('GOLDEN KEY OBTAINED!');
        break;
      }
      case 'encounter': {
        this._consume(obj);
        playSfx('world/encounter');
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
        // THE LAIR. A once-per-save approach shot — the letterbox crops harder
        // than the house crop and the eye rises over the arena — played BEFORE
        // the fight is staged. Skipped on a retry, because a child who just
        // lost wants to swing again, not watch the doors open twice.
        const lair = this._cine?.play(bossLairApproach({
          floorId: this.floorId,
          at: { x: obj.worldX ?? 0, y: 0, z: obj.worldZ ?? 0 },
          bossName: obj.enemyId,
        }));
        if (lair) {
          this._waitThenSay(() => this._startBattle(true, obj.enemyId, obj));
          return;
        }
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
    playSfx('world/pickup');
    if (step.phase2) {
      obj.activated = true;
      this._consume(obj);
    } else {
      this._consume(obj);
    }
    this._flash(step.message);
    this._maybeMidpoint();

    if (!step.phase2 && step.done) {
      this.mazeTransformed = true;
      const p1Key = `floor${this.floorId}_phase1_done`;
      const ch = challengeGoal(this.floor);
      if (ch.phase2 && !this.phase2Active) this.phase2Active = true;
      const lines = DIALOGUE[p1Key] || DIALOGUE.all_fairies_freed;
      // THE PAYOFF, STAGED. The bridge growing / the tide draining is the best
      // thing that happens on a floor and it used to fire off-screen while the
      // child was looking at a toast. The cinematic pushes in on the thing that
      // is about to change and CALLS applyFloorTransform at the beat where it
      // changes — so the transform is the shot, not a side effect of it.
      const played = this._cine?.play(challengeComplete({
        floorId: this.floorId,
        at: { x: obj.worldX ?? 0, y: 0, z: obj.worldZ ?? 0 },
        lines,
        onTransform: () => this.app?.applyFloorTransform(),
      }));
      if (!played) {
        // Already seen, or no director: the world still has to change.
        this.app.applyFloorTransform();
        if (lines && lines.length) this._say(lines);
      }
      audio.play('world/floor-complete');
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
    if (isHeroUnlocked(this.save, obj.heroId)) {
      // Already one of ours — no cinematic, but they still say something.
      this._heroLine(obj.heroId, 'idle');
      this._saveFloorState();
      return;
    }
    const heroDef = spawnHero(obj.heroId);
    if (!heroDef) { this._saveFloorState(); return; }
    audio.play('world/fairy');
    playSfx('world/rescue');
    this._saveFloorState();

    // The rescue is the emotional beat of a floor: the cage opens, the camera
    // comes round to the freed hero and they get their OWN words (story.js's
    // HERO_VOICES) before the scripted rescue lines. The unlock happens on the
    // director's beat so a child who skips still gets the hero.
    const rescueLine = pickHeroLine(obj.heroId, 'rescue');
    const scripted = getRescueDialogue(this.floorId, [obj.heroId]);
    const lines = [
      ...(rescueLine ? [{ speaker: heroDef.name, text: rescueLine }] : []),
      ...(scripted.length ? scripted : [
        { speaker: heroDef.name, text: 'You... you found me! I am free!' },
        { speaker: heroDef.name, text: 'My strength is yours. Let me fight beside you!' },
      ]),
    ];
    const grant = () => {
      unlockHero(this.save, obj.heroId);
      writeSave(this.save, this.slot);
      this._saveFloorState();
      // The party ring re-reads the roster, and the progression sweep gets a
      // chance to queue the moment this rescue just created.
      this.app?.refreshParty?.();
      this.app?.sweepProgress?.();
    };
    const played = this._cine?.play(heroFreed({
      heroId: obj.heroId,
      name: heroDef.name,
      at: { x: obj.worldX ?? 0, y: 0, z: obj.worldZ ?? 0 },
      lines,
      onFreed: grant,
    }));
    if (!played) { grant(); this._say(lines); }
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
      playSfx('world/fairy');
      const lit = marks.filter((o) => o.activated).length;
      this._flash(`${lit} / ${marks.length}`);
      if (lit >= marks.length) this._completeSecret();
      return;
    }
    if (obj.seqIdx === this.secretSeq) {
      this.secretSeq++;
      obj.activated = true;
      playSfx('world/fairy');
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
    playSfx('world/secret');
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
    this._hudVisible = v;
    this._controls?.setVisible(v);
    if (!v && this._compass) {
      this._compass.parts.forEach((o) => o.setVisible(false));
      this._compass.shown = false;
    }
    // The ring belongs to WALKING. A fight has its own HP bars and a stamina
    // arc floating over a battle formation is noise.
    this._stamina?.setVisible(v);
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
  /**
   * A roaming island creature touched the hero (creatures.js contact rule).
   * Same fight, same overlay, same rewards as a floor encounter — the world
   * position keeps the battle line where the creature actually stood, and the
   * creature's home floor sets the difficulty.
   */
  _onCreatureEncounter(enemyId, info = {}) {
    if (this._destroyed || this.app?.battleActive?.()) return;
    playSfx('world/encounter');
    this._startBattle(false, undefined, {
      worldX: info.x,
      worldZ: info.z,
      floorHint: info.floor,
    });
  }

  _startBattle(isBoss, enemyId, obj = null) {
    if (this.app?.battleActive?.()) return;

    const party = (this.party || []).filter((h) => h && h.hp > 0);
    // `floorHint` lets an ISLAND encounter (a roaming creature) borrow the
    // difficulty of the floor its species belongs to; inside a floor the
    // floor itself wins.
    const floorNum = this.floorId || obj?.floorHint || 1;
    const enemies = composeEncounter({
      floor: floorNum,
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
        floor: floorNum,
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

    // A boss win completes the floor and unlocks the next — recolour the
    // beacons and drop the cached compass targets so both tell fresh truth.
    // A rescue may also have grown the party: the ring re-reads it.
    this.app?.refreshBeacons?.();
    this.app?.refreshParty?.();
    this.app?.sweepProgress?.();
    this._portalTargets = null;

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

  /**
   * THE MIDPOINT.
   *
   * Halfway through a floor's challenge the arc stops the child and shows them
   * the page of the theorem scratched into the world — the thread that ties
   * nine unrelated puzzle rooms into one story. It fires exactly once per
   * floor per save (see _playFloorBeat) and only when nothing else is talking.
   */
  _maybeMidpoint() {
    if (this._midpointDone || !this.floorId) return;
    const goal = challengeGoal(this.floor);
    const need = Math.max(1, goal?.count || goal?.total || 0);
    if ((this.challengeProgress || 0) * 2 < need) return;
    this._midpointDone = true;
    this._waitThenSay(() => this._playFloorBeat('midpoint'));
  }

  /** The exit arch, with the key in hand. */
  _finishFloor() {
    const floorId = this.floorId;
    audio.play('world/floor-complete');
    playSfx('world/secret');
    updateQuestProgress(this.save, 'floor');
    writeSave(this.save, this.slot);
    this.app?.sweepProgress?.();
    // The DEPARTURE beat is read while the floor is still open — getFloorBeat
    // and getProofFragment are keyed on this.floorId, and _leaveFloor clears it.
    const departure = getFloorBeat(floorId, 'departure');
    const arc = getArcBeat(floorId);
    this._clearFloorState(floorId);
    this._leaveFloor({ complete: true });

    if (floorId === 9) {
      // THE FINALE. The camera climbs the palace one last time and the ending
      // scene is the cinematic's own onDone, so the transition happens after
      // the shot instead of cutting through it.
      const played = this._cine?.play(finale({
        palace: { x: 0, y: 58, z: 0 },
        onDone: () => transitionTo(this, SCENES.ENDING, undefined, 400),
      }));
      if (!played) transitionTo(this, SCENES.ENDING, undefined, 400);
      return;
    }

    // A papercut plate that says the floor is done, then the arc's parting
    // words with the proof fragment this floor earned.
    this._cine?.play(floorCompleteCard(floorId));
    const victKey = `floor${floorId}_victory`;
    const lines = [];
    if (DIALOGUE[victKey]?.length) lines.push(...DIALOGUE[victKey]);
    if (departure.length) lines.push(...departure);
    const frag = getProofFragment(floorId);
    if (frag) lines.push({ speaker: frag.title, text: frag.text, wide: true });
    else if (arc?.turn) lines.push({ speaker: 'Narrator', text: arc.turn, wide: true });
    if (lines.length) this._waitThenSay(() => this._say(lines));
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
          // Two cues, and they are different things: 'ui/correct' is the answer
          // being right (and it climbs a pentatonic degree per streak), while
          // 'world/door-unlock' is the door in the world actually opening.
          playSfx('ui/correct');
          playSfx('world/door-unlock');
          kill();
          this._flash('Door opened!');
          this._saveFloorState();
          this._refreshFloorHud();
          onOpen?.();
        } else {
          playSfx('ui/wrong');
          kill();
          this._flash('Try again!');
          // NOT this.time.delayedCall — see _scheduleRaw's doc comment.
          this._scheduleRaw(600, () => {
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
    // never hand the accel/orbit integrators a half-second step. The clamp is
    // generous (250 ms, matching the sim's own MAX_FRAME) because controls3d
    // now SUBSTEPS its integrators internally — the old 50 ms clamp silently
    // slowed acceleration, turning and camera recentre on any device below
    // 20 fps, which is exactly the hardware this game is played on (D1-B).
    const now = time || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = this._lastInputT ? Math.min(0.25, (now - this._lastInputT) / 1000) : 1 / 60;
    this._lastInputT = now;

    // The no-party ENTER redirect's deadline (see _enterPortal) — checked
    // against the RAW `now` above, not Phaser's Clock, on purpose.
    //
    // This does NOT call the shared `transitionTo()` helper. That helper's
    // fade branch is exactly the same shape as the bug this file just spent
    // two comments explaining: `cameras.main.fadeOut()` plus a
    // `this.time.delayedCall(duration + 200, doStart)` SAFETY NET for when
    // 'camerafadeoutcomplete' doesn't fire — and that safety net is a
    // Clock-based delayedCall too. MEASURED live: with the redirect's own
    // stall fixed (above), the very next stage stalled the same way —
    // `transitionTo`'s internal timer sat "active" for 19+ real seconds
    // without firing, `PartySelectScene` never becoming active, on a save
    // with too few heroes standing at a portal with nothing else to do.
    // `transitionTo` is shared by every scene in the game and out of scope
    // to change wholesale here, so this path keeps its cosmetic fade (best
    // effort — a decoration, not a dependency) but drives the ACTUAL scene
    // switch off `_scheduleRaw`, the one mechanism in this file proven
    // immune to the stall.
    if (this._noPartyRedirectAt != null && now >= this._noPartyRedirectAt) {
      this._noPartyRedirectAt = null;
      if (!this._destroyed) {
        try { this.cameras.main.fadeOut(300, 31, 66, 68); } catch { /* cosmetic only */ }
        this._scheduleRaw(300, () => {
          if (this._destroyed) return;
          // `scene.start()` itself still cannot be called from INSIDE this
          // scene's own update() call stack — that is the original crash
          // this whole redirect exists to avoid (a `this.time.delayedCall`
          // callback fires from a different point in Phaser's per-frame
          // systems step than `Scene.update()`, which is what let the OLD
          // code get away with calling it directly; `_scheduleRaw`'s flush
          // runs INSIDE update(), so calling scene.start() straight from it
          // reproduces the exact "reading 'sys'" TypeError — MEASURED,
          // confirmed live on this build). A real `setTimeout(fn, 0)` runs
          // as its own browser task, outside any Phaser call stack and
          // independent of Phaser's Clock, satisfying both constraints:
          // wall-clock-driven AND not reentrant with update().
          setTimeout(() => {
            if (!this._destroyed) this.scene.start(SCENES.PARTY_SELECT, { grade: this.save.grade });
          }, 0);
        });
      }
    }
    // Every _scheduleRaw() deadline (story beats via _waitThenSay, the
    // math-door retry prompt) — same raw-clock reasoning as the check above.
    this._flushScheduledRaw(now);

    // The director runs FIRST: a beat that ends this frame must have released
    // the camera before the follow boom is asked what it wants.
    this._cine?.tick(dt * 1000);
    this._cineSkipOnMove(dt);

    // A modal (dialogue, math door) owns the screen: neutralise the stick and
    // freeze the orbit rather than letting a stray drag spin the world behind
    // the panel.
    // A fight owns the screen the same way a modal does: the stick is dead and
    // the orbit is frozen, because battle3d is writing the camera itself.
    // A cinematic owns the screen the same way: it is writing the camera and
    // the hero is acting, so the stick must not fight either of them.
    const locked = !!(this.dialogue?.active || this._mathPrompt || this._entering
      || this.app.battleActive?.() || this._cine?.active);

    const f = this._controls.poll({
      dt,
      now,
      grounded: this.app.isGrounded ? this.app.isGrounded() : true,
      playerYaw: this.app.getFacing ? this.app.getFacing() : 0,
      moveN: this.app.getSpeedNorm ? this.app.getSpeedNorm() : 0,
      locked,
      actionKind: locked ? null : (this.app.getNearActionKind ? this.app.getNearActionKind() : null),
      // The DIVE pad exists only while it means something.
      swimming: this.app.getTraversalMode ? this.app.getTraversalMode() === 'swim' : false,
    });

    // `world: true` — controls3d already resolved the stick against the
    // camera's yaw, so index.js must NOT rotate it a second time.
    //
    // `jumpHeld` and `dive` are LEVELS, and both are load-bearing: the first is
    // the whole of variable jump height (gameFeel cuts the rise the frame it
    // goes false), the second is what takes a swimmer under.
    this.app.setInput({
      x: f.x, y: f.z, jump: f.jump, jumpHeld: f.jumpHeld, dive: f.dive,
      run: f.run, world: true,
    });
    this.app.setCameraOrbit?.({ yaw: f.yaw, pitch: f.pitch, zoom: f.zoom });

    // ── THE PARTY VERBS ──────────────────────────────────────────────────
    // controls3d surfaces the edges (touch chip, F/X, pad X); the runtime
    // holds the rules. releaseAbility() is level-driven and idempotent — the
    // wizard's LEVITATE is a hold, and the drop must fire on ANY release path
    // (finger off, slide off, focus loss), so it keys off the level, not an
    // event.
    if (!locked) {
      if (f.abilityPressed) this.app.pressAbility?.();
      else if (!f.abilityHeld) this.app.releaseAbility?.();
      if (f.swapSlot != null) this.app.swapHero?.(f.swapSlot);
      else if (f.swapPressed) this.app.swapHero?.();
    }
    // The chips re-read at ~6 Hz — labels, tints and cooldown dims are HUD,
    // not physics, and 6 Hz is faster than a child can read.
    this._chipT = (this._chipT || 0) + dt;
    if (this._chipT >= 0.15) {
      this._chipT = 0;
      this._controls.setAbilityChip?.(locked ? null : this.app.abilityChip?.());
      this._controls.setPartyChips?.(locked ? null : this.app.partyChips?.());
    }

    this._updateStamina(dt);
    this._updateCompass(locked);
    this._updateBanter(dt, locked, f);

    // ACTION — the one context verb. The on-screen button, E/Enter and the
    // gamepad's X all land here, and the label above them already said which
    // of ENTER / OPEN / TALK it was going to be.
    //
    // There used to be a SECOND keyboard listener here — a `this.wasd`
    // + `Phaser.Input.Keyboard.JustDown()` twin of this exact check, kept
    // "for anyone who learned E before the ACTION button existed". It was
    // dead weight wearing a working costume: `Key.onUp()` zeroes `_justDown`
    // the instant a key comes up, so on a device slow enough to run a frame
    // behind a keydown+keyup pair (measured: this build, under SwiftShader,
    // and by extension the iPad this ships to — see D1-B) `JustDown()` can
    // return false for a press that unquestionably happened. `f.action`
    // (controls3d.js) no longer has that hole — its keyboard edges are
    // captured off the raw `keydown-*` DOM event, not a per-frame diff — so
    // this is the only ENTER path now, and it is the reliable one.
    if (f.action && !locked) this._doAction();
  }

  /**
   * Draw the stamina ring around the hero.
   *
   * The 3D side hands back the hero's position as FRACTIONS of the viewport
   * rather than pixels, because the 3D canvas and the Phaser canvas are not the
   * same size — multiplying by this scene's design resolution here is what
   * keeps the ring on the hero at every aspect ratio. A null means the hero is
   * behind the eye (a hard orbit, a cinematic), and the ring simply holds its
   * last place while the widget's own fade takes it away.
   */
  _updateStamina(dt) {
    const gauge = this._stamina;
    if (!gauge) return;
    const st = this.app?.getTraversalState?.();
    if (!st) return;
    const p = this.app.heroScreenPos?.();
    if (p) {
      this._heroSX = p.x * GAME_WIDTH;
      this._heroSY = p.y * GAME_HEIGHT;
    }
    gauge.update(st, dt, this._heroSX ?? GAME_WIDTH / 2, this._heroSY ?? GAME_HEIGHT * 0.62);
  }

  /**
   * THE PORTAL COMPASS, per frame.
   *
   * Points at the nearest gate whose floor is UNLOCKED and NOT COMPLETE — the
   * nearest thing the child can actually play. Bearing is taken relative to
   * the camera (arrow-up = walk forward). Hidden inside floors, during any
   * lock, and while the ENTER prompt is up (the prompt IS the arrival).
   */
  _updateCompass(locked) {
    const c = this._compass;
    if (!c) return;
    const show = !!this.app && this._hudVisible !== false
      && !this.floorId && !locked && !this._nearPortal;
    if (!show) {
      if (c.shown !== false) { c.parts.forEach((o) => o.setVisible(false)); c.shown = false; }
      return;
    }
    const st = this.app.getTraversalState?.();
    if (!st || !st.pos) return;

    // Cache the STATIC geometry only (id/floorId/x/z never move once the
    // world is built) — never the unlock/complete record. The old version
    // baked `rec` into the cached entry and, worse, cached on the very FIRST
    // call regardless of whether `app.portals()` had anything in it yet: on
    // a fresh boot that first call can land before the world has finished
    // building its portal props, returning `[]`, and `if (!targets)` treats
    // an empty ARRAY as truthy — so an empty cache stuck forever, and the
    // compass silently never showed for the rest of the session. MEASURED
    // on the build: `_portalTargets` stayed `[]` from spawn onward even
    // with three floors unlocked. Re-fetch until we actually see a portal,
    // and always read `unlocked`/`complete` live so completing a floor
    // retargets the arrow instead of pointing at a finished level forever.
    let targets = this._portalTargets;
    if (!targets || targets.length === 0) {
      targets = this.app.portals?.() || [];
      if (targets.length) this._portalTargets = targets;
    }
    const floors = this.save.floors || [];
    let best = null;
    let bestD = Infinity;
    for (const p of targets) {
      const rec = floors[p.floorId - 1] || {};
      if (!rec.unlocked || rec.complete) continue;
      const d = Math.hypot(p.x - st.pos.x, p.z - st.pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) {
      if (c.shown !== false) { c.parts.forEach((o) => o.setVisible(false)); c.shown = false; }
      return;
    }
    const bearing = Math.atan2(best.x - st.pos.x, best.z - st.pos.z);
    const camYaw = this.app.getCameraYaw?.() ?? 0;
    c.arrow.setRotation(Phaser.Math.Angle.Wrap(bearing - camYaw));
    const txt = `FLOOR ${best.floorId} · ${Math.max(1, Math.round(bestD))}m`;
    if (c.label.text !== txt) c.label.setText(txt);
    if (c.shown !== true) { c.parts.forEach((o) => o.setVisible(true)); c.shown = true; }
  }

  /**
   * FIRST-SESSION ORIENTATION — the beat after the arrival cinematic.
   *
   * The arrival shot frames the palace (the locked floor-9 landmark), which
   * told a first-time player to walk at the one door that will not open. This
   * beat turns the CAMERA at Floor 1's gate — the beacon column is right
   * there in frame — and says so, once per save, then leaves the compass to
   * carry the message for the rest of the session.
   */
  _orientFirstArrival() {
    if (this._destroyed || this.floorId) return;
    const s = this.save;
    s.seenBeats = s.seenBeats || {};
    if (s.seenBeats.island_orientation) return;
    s.seenBeats.island_orientation = true;
    writeSave(s, this.slot);
    const gate = (this.app?.portals?.() || []).find((p) => p.floorId === 1);
    const st = this.app?.getTraversalState?.();
    if (gate && st && st.pos) {
      this._controls?.snapTo(Math.atan2(gate.x - st.pos.x, gate.z - st.pos.z));
    }
    this._say([
      { speaker: 'Elara', text: 'See that pillar of golden light? That is the gate to Floor 1!' },
      { speaker: 'Elara', text: 'When you are lost, follow the little gold compass at the top of the screen.' },
    ]);
  }

  /**
   * PARTY BANTER — the cheapest storytelling there is.
   *
   * Two heroes riffing about the biome they are standing in, unprompted, while
   * the child walks. It only fires when the world is genuinely idle (no modal,
   * no fight, no cinematic, nothing to press) and only while the player is
   * MOVING, so it reads as the party filling a quiet moment rather than as an
   * interruption. Every exchange is heard at most once per session.
   */
  _updateBanter(dt, locked, frame) {
    if (locked || !this.dialogue || this.dialogue.active) { this._banterT = 0; return; }
    const moving = Math.hypot(frame?.x || 0, frame?.z || 0) > 0.2;
    if (!moving) return;
    this._banterT += dt;
    if (this._banterT < OverworldScene.BANTER_PERIOD) return;
    this._banterT = 0;

    const partyIds = (this.save.party || []).map((s) => s?.id).filter(Boolean);
    if (partyIds.length === 0) return;
    const biome = this.app?.getBiome?.() || 'garden';
    const pick = pickBanter(partyIds, biome, { exclude: this._banterHeard });
    if (!pick || !pick.lines.length) return;
    this._banterHeard.add(pick.id);
    this._say(pick.lines);
  }

  /**
   * A hero's own voice, as a one-line toast. Used where a full dialogue panel
   * would be too much furniture for the moment — a rescue that the child has
   * already seen the cinematic for, a level's opening breath.
   */
  _heroLine(heroId, category) {
    const line = pickHeroLine(heroId, category);
    if (line) this._flash(line);
    return !!line;
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

  /**
   * Every step below is wrapped, independently, in try/catch.
   *
   * WHY: `_teardown()` runs from Phaser's OWN 'shutdown'/'destroy' events —
   * by definition every OTHER piece of this scene is already mid-collapse
   * around it, in whatever order Phaser's scene manager felt like. One
   * subsystem throwing here (a GameObject a director's `showSkip()` still
   * held a reference to, already destroyed by the time cinematics.js's own
   * `stop()` tried to hide it — MEASURED live: `Cannot read properties of
   * undefined (reading 'sys')` from `cinematics.js` inside `this._cine
   * .destroy()`, exercised for the first time ever by the no-party ENTER
   * redirect actually reaching a real scene.start() instead of dying
   * earlier) used to abort every step after it — orphaning the battle UI,
   * skipping the floor-state save, leaking the 3D app — and surface as an
   * uncaught page error on top, which is exactly the class of crash defect
   * 10 was about. A teardown step that fails should lose only itself.
   */
  _teardown() {
    this._destroyed = true;
    const safely = (label, fn) => {
      try { fn(); } catch (err) { console.warn(`[overworld] teardown step "${label}" failed:`, err); }
    };
    safely('controls', () => { this._controls?.destroy(); this._controls = null; });
    // The director owns a letterbox, a fade and a SKIP chip. Stopping it first
    // releases the cinematic camera slot before the world below is disposed.
    safely('cineSkipGuard', () => {
      if (!this._cineSkipGuard) return;
      this.input.keyboard?.off('keydown', this._cineSkipGuard);
      this.input.off('pointerdown', this._cineSkipGuard);
      this._cineSkipGuard = null;
    });
    safely('cinematic', () => { this._cine?.destroy(); this._cine = null; });
    safely('stamina', () => { this._stamina?.destroy(); this._stamina = null; });
    safely('portalPrompt', () => this._destroyPrompt());
    safely('mathPrompt', () => this._mathPrompt?.kill());
    // A fight in flight must not survive the scene: end it before the world
    // goes, so the save is written and the overlay is not left orphaned.
    safely('endBattle', () => this.app?.endBattle?.('fled'));
    safely('battleUi', () => { this._battleUi?.destroy(); this._battleUi = null; });
    // A floor in progress must survive the scene going away (a battle, a tab
    // close): the snapshot is what _restoreFloorState replays on the way back.
    safely('saveFloorState', () => { if (this.floorId) this._saveFloorState(); });
    safely('appDispose', () => {
      if (!this.app) return;
      this.app.dispose();
      this.app = null;
    });
  }
}
