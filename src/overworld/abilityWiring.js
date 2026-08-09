/**
 * abilityWiring — the whole abilities-and-progression stack, assembled, in one
 * call.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Read the last three rounds of this project's history and the same failure
 * happens every time: a good module lands, it is tested, it is documented, and
 * nothing imports it. battle3d.js sat orphaned for a round. traversal.js was
 * found to be 100% dead code after being "delivered". At the time of writing,
 * gameFeel, audio3d, cinematics, story and the SFX library are all written and
 * all unreachable.
 *
 * The cause is not laziness. It is that index.js is 2460 lines with four
 * agents in it and OverworldScene.js is a 1710-line Phaser bridge, and any
 * feature whose integration is "four paragraphs of assembly pasted into one of
 * those two files" will be half-pasted or not pasted.
 *
 * So this file is the assembly, and the host's whole diff is:
 *
 *   index.js — five lines
 *       import { createAbilityRuntime } from './abilityWiring.js';
 *       const abilities = createAbilityRuntime({ save, hooks, heightfield, fx: createAbilityFx });
 *       scene.add(abilities.group);            // before applyAerialFogToTree
 *       abilities.update(dt, player);          // in step(), after controller.step
 *       abilities.draw(heroDt, camera.rotation.y);   // in draw()
 *       abilities.dispose();                   // in dispose()
 *
 *   ...plus two forwards on the `world` object so the input and HUD layers can
 *   reach it, and two lines inside the jump path. All of it is written out
 *   verbatim at the bottom of this file.
 *
 * ── EVERYTHING IS OPTIONAL, ON PURPOSE ─────────────────────────────────────
 * The physics toybox is another agent's file and it is in flight right now.
 * Nothing here imports it. Pass `physics` and `toybox` and the shove and the
 * levitate work on real bodies; omit them and the runtime still builds, the
 * party ring still swaps, the second hop still works, the reach gate still
 * fires, the progression beats still play and the cadence fills still fire.
 * The two verbs that need bodies simply report "nothing here" — which is the
 * correct behaviour anyway when the player is standing in an empty field.
 *
 * The same is true in the other direction: `fx: false` gives a headless
 * runtime with no three import reached at all, which is how the tests drive
 * the assembly under `node --test`.
 */
import {
  FIELD_ABILITIES, ABILITY_GATES, ABILITY_PROPS, ABILITY_PUZZLES, BINDINGS,
  EVENTS as ABILITY_EVENTS, BLOCKED,
  createFieldAbilities, createPartyRing,
  gateNear, gateAudit, reachCleared, mergeToybox, isHeavy,
} from './abilities.js';
import {
  MOMENT, momentTitle, momentLine,
  snapshotProgress, sweepProgress, createMomentQueue,
  rewardFlight, floorCompleteSequence, stagedCinematic,
} from './progression.js';
import {
  CADENCE_FILLS, createCadenceRuntime, auditCadence, collectPoints,
} from './rewardCadence.js';

/**
 * The words, re-exported so a host that only imports this file can label the
 * beat it was just handed. `this._flash(momentTitle(m))` is the whole use.
 */
export { momentTitle, momentLine };

/**
 * Sounds, by ability event. Values are recipe names systems/sfxLibrary.js
 * already ships, and — exactly as traversalWiring.SOUND_FOR argues — they are
 * strings rather than imports so this table cannot break when the library
 * grows. A name that does not resolve is silence, never an error.
 */
export const ABILITY_SFX = Object.freeze({
  [ABILITY_EVENTS.WINDUP]: 'ui/hover',
  [ABILITY_EVENTS.SHOVE]: 'combat/impact-heavy',
  [ABILITY_EVENTS.GRAB]: 'world/fairy',
  [ABILITY_EVENTS.DROP]: 'combat/impact-light',
  [ABILITY_EVENTS.HOP]: 'move/jump',
  [ABILITY_EVENTS.SWAP]: 'ui/confirm',
  [ABILITY_EVENTS.BLOCKED]: 'ui/back',
});

/** What the on-screen hint says when a press did nothing. */
export const BLOCKED_HINT = Object.freeze({
  [BLOCKED.COOLDOWN]: 'Just a moment...',
  [BLOCKED.NO_TARGET]: 'Nothing here to use it on.',
  [BLOCKED.NO_ABILITY]: 'This one has no trick for that.',
  [BLOCKED.LOCKED]: '',
  [BLOCKED.AIRBORNE]: 'Jump again in the air!',
});

/**
 * Assemble it.
 *
 * @param {object} opts
 *   save        the live save object. Ledgers are written into it in memory;
 *               PERSISTING is the host's call, because the host knows the slot.
 *   heightfield {sampleHeight} — or pass `groundAt` directly
 *   physics     a createPhysicsWorld() handle, or null
 *   toybox      a createPhysicsProps() handle, or null. If given, update()
 *               DRIVES it (toybox.update(dt)) and routes the puzzles it solved
 *               into the gate ledger — so the host must not also call it.
 *               Either half may also arrive LATE via attachToybox() — see
 *               there for why the host does not block its first frame on it.
 *   fx          createAbilityFx itself (the normal case), or `true` to use a
 *               previously installed one, or false/omitted to build HEADLESS
 *               with no three reached at all — which is how the assembly suite
 *               runs under plain `node --test`.
 *   hooks       see below; every one optional
 *   gate        () => boolean — false while a fight/modal/cinematic owns the
 *               world. Swaps and verbs are refused, cleanly.
 *
 * HOOKS
 *   onAbility(event)        a verb fired. {type, ability, targetId, x, y, z}
 *   onPrompt(prompt|null)   the contextual ability prompt changed
 *   onBlocked(reason, hint) a press did nothing, and why
 *   onSwap({from,to,...})   the active hero changed — SWAP THE RIG HERE
 *   onGate(gate, canOpen)   the player is standing at an ability gate
 *   onGateCleared(gate)     ...and just satisfied it
 *   onMoment(moment, style) a progression beat fired (burst is already drawn)
 *   onStaged(moment)        a staged moment wants the cinematic director.
 *                           Return true if you took it.
 *   onVista / onBanter / onPing / onCoin / onTrail   the cadence fills
 *   onSound(key, at)        every sound this layer wants, one place
 *   onCameraBeat(beat)      a 0.9 s punch on the follow boom. See the wiring
 *                           notes for the six lines index.js needs for this.
 */
export function createAbilityRuntime({
  save = null,
  heightfield = null,
  groundAt = null,
  physics = null,
  toybox = null,
  fx = true,
  hooks = {},
  gate = null,
  fills = CADENCE_FILLS,
} = {}) {
  const ground = groundAt
    || (heightfield ? (x, z) => heightfield.sampleHeight(x, z) : () => 0);

  // ── The verbs ───────────────────────────────────────────────────────────
  const field = createFieldAbilities({
    hooks: {
      onEvent: (e) => onAbilityEvent(e),
      onPrompt: (p) => {
        hooks.onPrompt?.(p);
        if (view) view.aim(p ? bodyView(p.targetId) : null, p ? p.tint : 0);
      },
    },
  });

  // ── The roster ──────────────────────────────────────────────────────────
  const ring = createPartyRing({
    save,
    gate,
    hooks: {
      onSwap: (e) => {
        field.setHero(e.to, ctx);
        sound(ABILITY_SFX[ABILITY_EVENTS.SWAP]);
        if (view && lastPos) {
          view.burst(lastPos.x, lastPos.y + 1.1, lastPos.z, {
            count: 14, power: 0.8, life: 0.8, tint: e.ability ? e.ability.tint : undefined,
          });
        }
        hooks.onSwap?.(e);
      },
    },
  });
  field.setHero(ring.active());

  // ── The growth beats ────────────────────────────────────────────────────
  const queue = createMomentQueue({
    hooks: {
      onBeat: (m, style) => {
        if (view && lastPos) {
          view.burst(lastPos.x, lastPos.y + 1.6, lastPos.z, { ...style.burst, tint: style.tint });
        }
        sound(style.sfx);
        if (style.beat && style.beat.punch > 0) hooks.onCameraBeat?.(style.beat);
        hooks.onMoment?.(m, style);
      },
      onStaged: (m, style) => {
        if (view && lastPos) {
          view.burst(lastPos.x, lastPos.y + 1.6, lastPos.z, { ...style.burst, tint: style.tint });
        }
        return !!hooks.onStaged?.(m, style);
      },
      onIdle: () => hooks.onIdle?.(),
    },
  });
  let snapshot = save ? snapshotProgress(save) : null;

  // ── The cadence layer ───────────────────────────────────────────────────
  const cadence = createCadenceRuntime({
    save,
    fills,
    hooks: {
      onVista: (f, p) => { sound('world/secret'); hooks.onVista?.(f, p); },
      onBanter: (f, topic) => hooks.onBanter?.(f, topic),
      onPing: (f, p) => { sound('ui/streak'); hooks.onPing?.(f, p); },
      onTrail: (f, coins) => hooks.onTrail?.(f, coins),
      onCoin: (c) => {
        view?.takeCoin(c.id);
        sound('world/coin');
        hooks.onCoin?.(c);
      },
    },
  });

  // ── The visible half ────────────────────────────────────────────────────
  // Imported lazily so `fx: false` never reaches three at all, which is what
  // lets the assembly suite run under plain node.
  let view = null;
  if (fx) {
    const make = typeof fx === 'function' ? fx : requireFx().createAbilityFx;
    view = make({ groundAt: ground });
    view.setCoins(cadence.coins);
  }

  // ── The body views ──────────────────────────────────────────────────────
  //
  // A reused pool. physics.forEach hands back the engine's own records, which
  // already carry id, kind, mass and volume; position comes straight out of
  // the dense transform buffer. So a full scan touches no Rapier object and
  // allocates nothing after the first frame.
  const views = [];
  let viewCount = 0;
  // Hoisted, so physics.forEach is handed the SAME function object every frame
  // rather than a fresh closure — physicsProps does the same thing with its own
  // view pump, and for the same reason: this runs 60 times a second forever.
  function pushView(rec) {
    let v = views[viewCount];
    if (!v) v = views[viewCount] = { id: null, kind: '', x: 0, y: 0, z: 0, mass: 0, density: 0 };
    const buf = physics.xforms;
    const o = rec.slot * physics.XFORM_STRIDE;
    v.id = rec.id;
    v.kind = rec.kind;
    v.x = buf[o]; v.y = buf[o + 1]; v.z = buf[o + 2];
    v.mass = rec.mass || 0;
    // Density, not mass, is what "heavy" means in this world — see
    // abilities.HEAVY_DENSITY. The engine record already carries both halves.
    v.density = rec.volume > 0 ? (rec.mass || 0) / rec.volume : 0;
    viewCount++;
  }
  function refreshBodies() {
    viewCount = 0;
    if (!physics) return 0;
    physics.forEach(pushView);
    return viewCount;
  }
  function bodyView(id) {
    if (id == null) return null;
    for (let i = 0; i < viewCount; i++) if (views[i].id === id) return views[i];
    return null;
  }

  // ── The per-frame context handed to the verb machine ────────────────────
  const ctx = {
    player: null,
    bodies: views,
    bodyLen: 0,
    bodyAt: bodyView,
    impulse: (id, ix, iy, iz) => physics?.impulse(id, ix, iy, iz),
    teleport: (id, x, y, z) => physics?.teleport(id, x, y, z),
    groundAt: ground,
    locked: false,
  };

  let lastPos = null;
  /** Gate the player is standing at, so onGate fires on change and not per frame. */
  let nearGateId = null;
  /** Reach gates already satisfied this visit, so the beat fires once. */
  const clearedGates = new Set();

  function sound(key, at = lastPos) {
    if (!key) return;
    hooks.onSound?.(key, at);
  }

  function onAbilityEvent(e) {
    sound(ABILITY_SFX[e.type], e.x || e.y || e.z ? { x: e.x, y: e.y, z: e.z } : lastPos);
    if (e.type === ABILITY_EVENTS.BLOCKED) {
      hooks.onBlocked?.(e.reason, BLOCKED_HINT[e.reason] || '');
    }
    if (view) {
      if (e.type === ABILITY_EVENTS.SHOVE) {
        view.burst(e.x, e.y + 0.4, e.z, {
          count: isHeavy(bodyView(e.targetId)) ? 16 : 9,
          power: e.power, life: 0.7, tint: FIELD_ABILITIES.knight.tint, size: 0.13,
        });
      } else if (e.type === ABILITY_EVENTS.HOP) {
        view.burst(e.x, e.y + 0.1, e.z, {
          count: 10, power: 0.6, life: 0.55, tint: FIELD_ABILITIES.bunny.tint, size: 0.12,
        });
      } else if (e.type === ABILITY_EVENTS.GRAB || e.type === ABILITY_EVENTS.DROP) {
        view.burst(e.x, e.y + 0.3, e.z, {
          count: 8, power: 0.5, life: 0.6, tint: FIELD_ABILITIES.wizard.tint, size: 0.11,
        });
      }
    }
    hooks.onAbility?.(e);
  }

  // ── The tick ────────────────────────────────────────────────────────────

  /**
   * One fixed step. Call from index.js's step(), AFTER controller.step so the
   * position the verbs act from is this frame's position.
   *
   * @param {number} dt seconds
   * @param {object} player the live controller state
   */
  function update(dt, player) {
    if (!player) return;
    lastPos = player.pos;
    ctx.player = player;
    ctx.bodyLen = refreshBodies();
    ctx.locked = gate ? !gate() : false;

    ring.step(dt);
    field.update(dt, ctx);
    // If the host handed us the toybox, WE drive it — one fewer line in
    // index.js, and it guarantees the puzzle poll and the gate ledger see the
    // same frame. A host that would rather drive it itself simply omits
    // `toybox` and calls notePuzzlesSolved() with the return value.
    if (toybox && typeof toybox.update === 'function') {
      notePuzzlesSolved(toybox.update(dt));
    }
    queue.pump(dt);
    cadence.update(player.pos.x, player.pos.z, dt);

    // ── Gates ─────────────────────────────────────────────────────────────
    const g = gateNear(player.pos.x, player.pos.z);
    const gid = g ? g.id : null;
    if (gid !== nearGateId) {
      nearGateId = gid;
      if (g) {
        const who = ring.whoCan(g.verb);
        hooks.onGate?.(g, !!who, who);
      } else {
        hooks.onGate?.(null, false, null);
      }
    }
    // A REACH gate is satisfied by BEING somewhere, so it is checked here and
    // not by the toybox's puzzle tracker.
    const reached = reachCleared(player, ground);
    if (reached && !clearedGates.has(reached.id)) {
      clearedGates.add(reached.id);
      noteGateCleared(reached);
    }
  }

  /** A gate just opened. One place, so the shove/lift/reach paths agree. */
  function noteGateCleared(g) {
    queue.push({ kind: MOMENT.ABILITY_GATE, id: g.id, name: g.name, cls: g.cls });
    hooks.onGateCleared?.(g);
  }

  /**
   * The toybox reported solved puzzles this frame. Hand them here so an
   * ability puzzle produces the gate beat rather than a silent boolean.
   * @param {string[]} ids  createPhysicsProps().update()'s return value
   */
  function notePuzzlesSolved(ids) {
    if (!ids || !ids.length) return 0;
    let n = 0;
    for (const id of ids) {
      const g = ABILITY_GATES.find((x) => x.puzzleId === id);
      if (!g || clearedGates.has(g.id)) continue;
      clearedGates.add(g.id);
      noteGateCleared(g);
      n++;
    }
    return n;
  }

  /** Draw. Call from index.js's draw(), beside travFx.update. */
  function draw(dt, camYaw = 0) {
    if (!view) return;
    // The carry ribbon has to be re-aimed every frame; everything else the FX
    // layer integrates itself.
    const held = field.carrying;
    if (held != null && lastPos) {
      const b = bodyView(held);
      if (b) {
        view.setTether(
          { x: lastPos.x, y: lastPos.y + 1.2, z: lastPos.z },
          { x: b.x, y: b.y, z: b.z },
          FIELD_ABILITIES.wizard.tint,
        );
      }
    } else {
      view.setTether(null, null);
    }
    view.update(dt, camYaw);
  }

  // ── The progression surface ─────────────────────────────────────────────

  /**
   * Something happened that might have changed the player. Call after a
   * battle, after a floor, after a rescue, after a shop.
   *
   * Runs every system's own check (never re-implements one), queues whatever
   * is new, and returns the moments so the caller can persist and log.
   */
  function sweep() {
    if (!save) return [];
    const { moments, snapshot: next } = sweepProgress(save, snapshot);
    snapshot = next;
    queue.push(moments);
    return moments;
  }

  /** Queue a moment the host detected itself (a quest tick, a discovery rank). */
  function note(moment) { return queue.push(moment); }

  /** The staged sequence for a moment, ready for the cinematic director. */
  function cinematicFor(moment, deps = {}) {
    return stagedCinematic(moment, { at: lastPos ? { ...lastPos } : undefined, ...deps });
  }

  /**
   * A floor is finished. Returns the sequence to hand the director, and
   * launches the reward flight when the director reaches that beat.
   *
   * @param {object} opts {floorId, at, rewards, onTransform, onStamp, lines, title}
   */
  function floorComplete(opts = {}) {
    const flight = rewardFlight(opts.rewards || {});
    return floorCompleteSequence({
      ...opts,
      flight,
      heroAt: lastPos ? { ...lastPos } : undefined,
      onRewards: (items) => {
        if (view && lastPos) {
          const from = opts.at || lastPos;
          // The rewards land where the HUD chips are. The host passes a world
          // point for that; without one they arc up over the hero's shoulder,
          // which still reads as "it went to me".
          const to = opts.rewardTarget
            || { x: lastPos.x, y: lastPos.y + 4.2, z: lastPos.z };
          view.flyRewards({ x: from.x, y: (from.y || 0) + 1, z: from.z }, to, items,
            (item) => hooks.onRewardArrived?.(item));
        }
        hooks.onRewards?.(items);
      },
    });
  }

  /** Tell the queue a staged moment finished. Wire to the director's onEnd. */
  function stagedDone() { queue.done(); }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  function cancel() {
    field.cancel(ctx);
    view?.reset();
  }

  function dispose() {
    cancel();
    queue.clear();
    view?.dispose();
    view = null;
    views.length = 0;
    viewCount = 0;
  }

  return {
    // Frame
    update, draw,
    // Input — the host forwards these from controls3d
    pressAbility: () => field.press(),
    releaseAbility: () => field.releaseButton(),
    /** The jump button. Returns the vy to WRITE onto player.vel.y, or 0. */
    jump: (player) => field.jump(player),
    swapNext: () => ring.cycle(1),
    swapPrev: () => ring.cycle(-1),
    swapTo: (which) => ring.select(which),
    // Reads for the HUD
    chip: () => field.chip(),
    chips: () => ring.chips(),
    hops: () => field.hopsLeft(),
    activeHero: () => ring.active(),
    gateAudit: () => gateAudit(ring),
    cadenceProgress: () => cadence.progress(),
    // Progression
    sweep, note, cinematicFor, floorComplete, stagedDone,
    notePuzzlesSolved,
    get queue() { return queue; },
    // Party
    refreshParty: () => { ring.refresh(); field.setHero(ring.active(), ctx); },
    /**
     * THE TOYBOX, LATE.
     *
     * physics.js reaches Rapier through a lazy `import()` of a 2.2 MB chunk
     * (the -compat build inlines its wasm as base64). A host that awaited that
     * before showing its first frame would be charging every child the boot
     * cost of a rigid-body solver, including the ones who never shove a crate.
     * So index.js starts the build in the background and hands the two halves
     * over here when they land; until then the two verbs that need bodies
     * report "nothing here", which is the correct answer in an empty field.
     *
     * Passing null for both detaches — a floor transition, or a Rapier load
     * that failed and must not leave a dead handle behind.
     */
    attachToybox(world = null, props = null) {
      physics = world;
      toybox = props;
      viewCount = 0;
      ctx.bodyLen = 0;
    },
    /** Is a rigid-body world behind the verbs yet? */
    hasToybox: () => !!physics,
    // Lifecycle
    cancel, dispose,
    get group() { return view ? view.group : null; },
    get fx() { return view; },
    stats() {
      return {
        ability: field.state.ability ? field.state.ability.id : null,
        phase: field.state.phase,
        carrying: field.carrying,
        party: ring.members.length,
        bodies: viewCount,
        queued: queue.pending,
        fx: view ? view.stats : null,
      };
    },
    // Data the host needs at build time
    ABILITY_PROPS, ABILITY_PUZZLES, ABILITY_GATES, BINDINGS,
    mergeToybox,
  };
}

/**
 * WHY THE RENDERER IS INJECTED AND NOT IMPORTED.
 *
 * abilityFx.js imports three. If this file imported it, every test of the
 * ASSEMBLY would drag the renderer in, and — much worse — the assembly could
 * only ever be exercised in a browser. So the host hands the factory in:
 *
 *     import { createAbilityFx } from './abilityFx.js';
 *     createAbilityRuntime({ fx: createAbilityFx, ... })
 *
 * That is one extra word at the call site and it is the reason
 * abilityWiring.test.js can drive a shove, a carry, a level-up and a floor
 * completion under plain `node --test`. installAbilityFx() below is the same
 * thing for a host that would rather register once at module scope.
 */
let _fxModule = null;
function requireFx() {
  if (!_fxModule) {
    throw new Error(
      'abilityFx not installed — pass fx: createAbilityFx to createAbilityRuntime, '
      + 'or call installAbilityFx(module) first',
    );
  }
  return _fxModule;
}

/** Register the renderer process-wide, for a host that prefers `fx: true`. */
export function installAbilityFx(mod) { _fxModule = mod; }

/** Is a renderer registered? */
export function abilityFxInstalled() { return !!_fxModule; }

/**
 * Run the reward-cadence audit against a live world. Exposed here rather than
 * in rewardCadence.js so the debug API has one import for everything in this
 * feature.
 */
export function auditWorld({ heightfield, specs = {} } = {}) {
  if (!heightfield) throw new TypeError('auditWorld needs a heightfield');
  return auditCadence({
    points: collectPoints(specs),
    heightAt: (x, z) => heightfield.sampleHeight(x, z),
    slopeAt: (x, z) => {
      const n = heightfield.sampleNormal(x, z);
      return Math.acos(Math.max(-1, Math.min(1, n[1]))) * 180 / Math.PI;
    },
  });
}

/**
 * ── WIRING, VERBATIM ───────────────────────────────────────────────────────
 *
 * ═══ 1. src/overworld/index.js ═════════════════════════════════════════════
 *
 * TOP OF FILE, beside the other overworld imports:
 *
 *   import { createAbilityFx } from './abilityFx.js';
 *   import { createAbilityRuntime } from './abilityWiring.js';
 *
 * IN createOverworld, after `const heroRig = createHeroRig(...)` (it wants the
 * heightfield, and the rig swap hook wants heroRig to exist):
 *
 *   const abilities = createAbilityRuntime({
 *     save,
 *     heightfield,
 *     fx: createAbilityFx,
 *     physics: physicsWorld || null,       // null until the toybox lands
 *     toybox: physicsProps || null,        // ditto
 *     gate: () => !inputLocked && !cineCam && !(battle && battle.isActive()),
 *     hooks: {
 *       // The recipe is the sound; audio3d adds a positional companion voice
 *       // ONLY for the two verbs that happen away from the hero's own body,
 *       // so a shove across the plaza is heard over there and a level-up is
 *       // heard here. Both layers are already imported by index.js.
 *       onSound: (key, at) => {
 *         playSfx(key);
 *         if (at && (key === 'combat/impact-heavy' || key === 'world/coin')) {
 *           audio3d.emit({ sound: key === 'world/coin' ? 'coin' : 'thud',
 *                          x: at.x, y: (at.y || 0) + 1, z: at.z, volume: 0.85 });
 *         }
 *       },
 *       onCameraBeat: (beat) => { camBeat = beat; camBeatT = beat.hold; },
 *       onSwap: (e) => { swapHeroRig(e.to.id); hooks.onHeroSwap?.(e); },
 *       onPrompt: (p) => hooks.onAbilityPrompt?.(p),
 *       onBlocked: (r, hint) => hooks.onAbilityBlocked?.(r, hint),
 *       onGate: (g, canOpen, who) => hooks.onAbilityGate?.(g, canOpen, who),
 *       onMoment: (m, s) => hooks.onMoment?.(m, s),
 *       onStaged: (m) => hooks.onStagedMoment?.(m) === true,
 *       onVista: (f, p) => hooks.onVista?.(f, p),
 *       onBanter: (f, t) => hooks.onBanter?.(f, t),
 *       onPing: (f, p) => hooks.onPing?.(f, p),
 *       onCoin: (c) => hooks.onCollect?.({ id: c.id, kind: c.kind, amount: c.amount }),
 *     },
 *   });
 *   scene.add(abilities.group);         // BEFORE applyAerialFogToTree(scene)
 *
 * THE RIG SWAP — the one piece of real new code, ~8 lines, beside heroRig:
 *
 *   function swapHeroRig(heroId) {
 *     const old = heroRig;
 *     heroRig = createHeroRig(heroId, { height: HERO_HEIGHT });
 *     scene.remove(old.group);
 *     hero = heroRig.group;
 *     scene.add(hero);
 *     applyAerialFogToTree(hero);
 *     old.dispose();
 *     heroRig.reset();
 *   }
 *
 *   ...which needs `const heroRig`/`const hero` changed to `let`. heroRig.js
 *   refcounts its traced builds (see heroRigCacheSize / releaseBuild), so the
 *   second swap to a hero you have already been is a cache hit and costs a
 *   group swap, not a re-trace.
 *
 * IN step(dt), immediately AFTER `applyRigFlags(player);`:
 *
 *   abilities.update(dt, player);
 *   // ...and that is all: passing `toybox` above means the runtime already
 *   // calls physicsProps.update(dt) and routes its solved puzzles.
 *
 * IN step(dt), in the jump path — replace
 *       if (jumpLatch) { input.jump = true; jumpLatch = false; }
 *   with
 *       if (jumpLatch) {
 *         jumpLatch = false;
 *         const hop = abilities.jump(player);
 *         if (hop > 0) player.vel.y = hop;      // the bunny's second hop
 *         else input.jump = true;               // everyone else, unchanged
 *       }
 *   The order matters: an air jump must not ALSO set input.jump, or the
 *   controller's own grounded check will eat the frame.
 *
 * IN draw(), beside `travFx.update(heroDt, player, animT);`:
 *
 *   abilities.draw(heroDt, camera.rotation.y);
 *
 * THE CAMERA BEAT — six lines, so a level-up is felt and not just seen.
 * Beside the other camera state:
 *
 *   let camBeat = null, camBeatT = 0;
 *
 * ...and at the END of updateCamera(animT), after the boom has been solved:
 *
 *   if (camBeatT > 0) {
 *     camBeatT = Math.max(0, camBeatT - 1 / 60);
 *     const u = camBeat.hold > 0 ? camBeatT / camBeat.hold : 0;
 *     const k = Math.sin(u * Math.PI) ** 2;             // in and out
 *     camera.position.lerp(_camTarget, k * camBeat.punch * 0.1);
 *     if (camBeat.fovKick) updateFov(camera.fov - camBeat.fovKick * k);
 *   }
 *
 * ON THE `world` OBJECT (the api literal), so the scene and the input layer
 * can reach the runtime without importing it:
 *
 *   pressAbility() { abilities.pressAbility(); },
 *   releaseAbility() { abilities.releaseAbility(); },
 *   swapHero(which) { return which == null ? abilities.swapNext() : abilities.swapTo(which); },
 *   abilityChip() { return abilities.chip(); },
 *   partyChips() { return abilities.chips(); },
 *   refreshParty() { abilities.refreshParty(); },
 *   sweepProgress() { return abilities.sweep(); },
 *   floorCompleteSequence(o) { return abilities.floorComplete(o); },
 *   stagedMomentDone() { abilities.stagedDone(); },
 *   abilityStats() { return abilities.stats(); },
 *
 * IN dispose():
 *
 *   abilities.dispose();
 *
 * IN enterFloor()/exitFloor(), so nothing is left held across a transition:
 *
 *   abilities.cancel();
 *
 * IF THE TOYBOX HAS LANDED, its build call takes the ability additions:
 *
 *   const merged = mergeToybox(SANDBOX, PUZZLES);
 *   const physicsProps = createPhysicsProps({
 *     physics: physicsWorld, heightfield,
 *     placements: merged.placements, puzzles: merged.puzzles,
 *   });
 *
 *
 * ═══ 2. src/overworld/controls3d.js ════════════════════════════════════════
 *
 * One new button and one new chip. BINDINGS in abilities.js is the contract:
 *
 *   ability   keys KeyE / ShiftLeft / ShiftRight, gamepad button 2 (X / Square)
 *   swapNext  key Q, gamepad button 4 (LB / L1)
 *   swapPrev  gamepad button 5 (RB / R1)
 *   swapSlot  Digit1 / Digit2 / Digit3
 *
 *   - resolveInput() grows `abilityHeld` and `abilityPressed` (a LEVEL and an
 *     EDGE — the levitate is a hold, the shove is a tap) and `swapPressed`.
 *   - createTouchControls() grows a third round chip right of ACTION, at the
 *     ability's tint, labelled from world.abilityChip().verb, plus a small
 *     party ring of three heads above the stick from world.partyChips().
 *   - the poll forwards:
 *         if (raw.abilityPressed) world.pressAbility();
 *         if (!raw.abilityHeld) world.releaseAbility();
 *         if (raw.swapPressed) world.swapHero();
 *
 *
 * ═══ 3. src/scenes/OverworldScene.js ═══════════════════════════════════════
 *
 * The director is already built there, so the staged moments cost one hook:
 *
 *   // in the createOverworld hooks block
 *   onStagedMoment: (m) => this._cine?.play(this.app.cinematicFor
 *       ? this.app.cinematicFor(m) : null) === true,
 *   onMoment: (m, s) => this._flash(momentTitle(m)),   // the words, under the burst
 *   onVista: (f, p) => { this._say([{ speaker: 'Elara', text: p.line }]);
 *                        this.save.gold = (this.save.gold || 0) + p.gold;
 *                        this._pulseChip(this._goldChip, this.save.gold); },
 *   onBanter: (f, topic) => this._banterNow(topic),    // reuse pickBanter
 *   onGate: (g, canOpen, who) => this._showGatePrompt(g, canOpen, who),
 *
 *   // in the director config, so the queue knows a cutscene ended
 *   onEnd: () => { ...existing...; this.app?.stagedMomentDone?.(); },
 *
 *   // _finishFloor(), replacing the floorCompleteCard call
 *   const seq = this.app.floorCompleteSequence({
 *     floorId: this.floorId,
 *     at: { x: obj.worldX ?? 0, y: 0, z: obj.worldZ ?? 0 },
 *     rewards: { gold: result.gold, xp: result.xp, potions: result.potions },
 *     title: FLOOR_CARDS[this.floorId]?.name,
 *     onTransform: () => this.app.applyFloorTransform(),
 *     onStamp: () => this._stampObjectiveCard(),
 *   });
 *   this._cine.play(seq);
 *
 *   // after every battle, rescue, shop and floor
 *   this.app.sweepProgress();
 *   // after a party edit or a rescue
 *   this.app.refreshParty();
 */
