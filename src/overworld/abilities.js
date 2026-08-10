/**
 * abilities — the FIELD verbs, one per hero class, and the party ring that
 * lets a child swap between them without leaving the world.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The island has fifteen heroes and, out in the field, they are fifteen skins
 * on one walking capsule. Everything that makes a hero a hero — the signature,
 * the evolution, the bond — happens inside a battle the child left the world
 * to reach. Walk around, and the roster does not exist.
 *
 * So each CLASS gets one verb that changes what the world will let you do:
 *
 *      knight   SHOVE       moves what a shoulder can move and nothing else
 *      wizard   LEVITATE    the carry verb, on a timer
 *      bunny    DOUBLE JUMP the second hop, and therefore the high ledge
 *
 * Three verbs is the whole design. Not fifteen, not one per hero: a child of
 * five has to be able to hold the entire ability set in their head, and the
 * question the game wants them asking at a locked door is "who do I need?" —
 * which is only a question at all if the answer set is small enough to guess.
 *
 * ── THE VERBS WERE CHOSEN AGAINST WHAT THE HERO ACTUALLY HAS ───────────────
 * physicsProps.js states the constraint in full and it is worth repeating,
 * because it is the reason two of these three exist:
 *
 *     "A puzzle may only require verbs the hero actually has."
 *
 * The hero meets the world as a KINEMATIC CAPSULE. It shoves dynamic bodies
 * and is never shoved back; it cannot pick anything up, so the stacking puzzle
 * that module wanted was authored, found unplayable, and cut — with a note
 * saying it should come back the day a carry verb lands.
 *
 * LEVITATE is that carry verb. It is not a general one — it is four seconds
 * long, it is the wizard's alone, and it drops what it holds when the clock
 * runs out — but a body held four metres in the air and released over another
 * one is a stack, and a stack is the puzzle coming back. See ABILITY_PUZZLES.
 *
 * SHOVE exists for the mirror-image reason: some bodies should be immovable.
 * A crate every class can push teaches nothing about the knight. So the heavy
 * placements below are granite — density 2.40 against a maximum of 0.62 for
 * everything else in the toybox — and a walking capsule moves one by
 * centimetres while a braced shoulder moves it by metres. See HEAVY_DENSITY
 * for exactly how hard that gate is today and the one line that would make it
 * absolute.
 *
 * DOUBLE JUMP is the one verb about the hero rather than the world, and it is
 * the reason a REACH gate can exist: a shelf at 3.4 m is unreachable on one
 * jump (jumpV 8.5, gravity 22, apex ~1.64 m) and comfortable on two.
 *
 * ── WHY THE PARTY RING IS IN THIS FILE AND NOT A SIBLING ───────────────────
 * Switching heroes in the field IS the ability system. A verb you can only use
 * if you happened to pick the right hero on the party screen twenty minutes
 * ago is not a verb, it is a mistake you already made. The ring and the verbs
 * ship together or neither of them is playable.
 *
 * ── SHAPE ──────────────────────────────────────────────────────────────────
 * Pure. No three, no Phaser, no DOM, no save writes. Everything below is data
 * or a function of (state, dt) -> state, so `node --test` drives the whole
 * ability layer including the physics interactions, which are expressed as
 * calls onto an injected `ctx` the tests stub in nine lines.
 *
 * The hot path allocates nothing: update() writes into pre-made scratch
 * records and the event it hands back is the same object every time (the host
 * reads it and drops it inside the frame — see `EVENT` below).
 */
import { PAPER } from '../config.js';

// ───────────────────────────────────────────────────────────────────────────
// THE THREE VERBS
// ───────────────────────────────────────────────────────────────────────────

/** Class ids the field layer knows. Anything else walks and jumps, no verb. */
export const ABILITY_CLASSES = ['knight', 'wizard', 'bunny'];

/**
 * One verb per class.
 *
 *   id          stable key; the save, the HUD and the gates all use it
 *   verb        the one-word label the button wears. Uppercase, <= 6 chars,
 *               because it is rendered inside a 96 px round chip under a thumb.
 *   button      which physical control fires it. See BINDINGS below.
 *   hold        true if the button is a HOLD (levitate) rather than a tap.
 *   cooldown    seconds before it may fire again, measured from the END of it
 *   windup      seconds of telegraph before the effect lands. Nonzero for the
 *               shove so a child sees the brace and the world sees it coming.
 *   reach       metres in front of the hero the verb acts over
 *   arc         half-angle of the forward cone, radians. A wide cone makes the
 *               verb feel generous; too wide and you shove the crate BEHIND
 *               the one you were looking at.
 *   sfx         a real key from systems/sfxLibrary.js. See SFX note below.
 *   tint        PAPER colour for the burst, the telegraph ring and the chip.
 */
export const FIELD_ABILITIES = Object.freeze({
  knight: Object.freeze({
    id: 'shove',
    cls: 'knight',
    verb: 'SHOVE',
    name: 'Shoulder Charge',
    blurb: 'Braces and drives. Moves what nobody else can move.',
    button: 'ability',
    hold: false,
    cooldown: 1.6,
    windup: 0.28,
    reach: 3.2,
    arc: 0.72,
    /**
     * Speed imparted, metres per second — NOT an impulse.
     *
     * This is the one number in the file that had to be re-derived from the
     * world rather than chosen. The toybox runs at toy scale: a crate masses
     * 0.40, a granite kerbstone 0.42, and a LEAF masses 0.0009. A fixed
     * impulse tuned to move the stone would give the leaf four thousand metres
     * per second, and physics.js is explicit that Rapier's failure mode for an
     * absurd impulse is a Rust panic, not a funny leaf.
     *
     * So the verb imparts a VELOCITY and the impulse is derived per body
     * (mass x dv, clamped). Every kind gets the same shove and the same shove
     * looks right on all six of them.
     *
     * 12 m/s against a kerbstone's friction of 0.92 and gravity 22 is a slide
     * of ~3.6 m plus the hop — so crossing the five metres to the slab takes
     * two shoves and a walk, which is the rhythm the puzzle wants.
     */
    dv: 12,
    /** Fraction of dv sent UPWARD, so the body hops as it goes. A body that
     *  slides without ever leaving the ground reads as broken friction. */
    lift: 0.28,
    /** Hard ceiling on the derived impulse, N.s. The Rust-panic guard. */
    maxImpulse: 24,
    sfx: 'combat/impact-heavy',
    tint: PAPER.teal,
  }),
  wizard: Object.freeze({
    id: 'levitate',
    cls: 'wizard',
    verb: 'LIFT',
    name: 'Paper Lift',
    blurb: 'Holds one thing in the air. Not for long.',
    button: 'ability',
    hold: true,
    cooldown: 2.5,
    windup: 0.18,
    reach: 4.5,
    arc: 0.85,
    /** Seconds the hold may last before the spell tires and the thing falls. */
    maxHold: 4.0,
    /** Metres in front of the hero the held body rides. */
    carryDist: 2.2,
    /** Metres above the GROUND UNDER THE BODY it is held at. */
    carryHeight: 2.9,
    /**
     * Approach rate of the carry point, 1/seconds. Critically damped by hand:
     * the body is teleported a fraction of the way each step rather than
     * snapped, so a lifted crate swims up to the hand instead of appearing in
     * it. Rapier's setTranslation zeroes the velocity for us, which is exactly
     * what a held object wants and is why this is a teleport and not a force.
     */
    carryLerp: 9.0,
    sfx: 'world/fairy',
    tint: PAPER.lavender,
  }),
  bunny: Object.freeze({
    id: 'doubleJump',
    cls: 'bunny',
    verb: 'HOP',
    name: 'Second Hop',
    blurb: 'One more jump, in mid-air, whenever you want it.',
    button: 'jump',
    hold: false,
    cooldown: 0,
    windup: 0,
    reach: 0,
    arc: 0,
    /**
     * Upward velocity of the second hop, m/s. Deliberately BELOW the ground
     * jump (controller DEFAULT_TUNING.jumpV = 8.5): the second hop is a save,
     * not a rocket, and a child should still feel the first jump was the big
     * one. 7.2 over 22 m/s^2 of gravity is 1.18 m of extra apex, which stacks
     * on the first jump's 1.64 m for a working ceiling of ~3.4 m.
     */
    hopV: 7.2,
    /** Charges per grounding. One. Two would trivialise every REACH gate. */
    charges: 1,
    sfx: 'move/jump',
    tint: PAPER.coral,
  }),
});

/** Ceiling a hero can reach, metres, with and without the second hop. */
export const REACH_HEIGHT = Object.freeze({
  /** jumpV^2 / 2g with the shipped tuning (8.5, 22). */
  single: 1.64,
  /** ...plus hopV^2 / 2g fired at the apex. */
  double: 3.35,
});

/** The verb for a class id. Unknown/absent class -> null, never a throw. */
export function abilityForClass(cls) {
  if (!cls) return null;
  return FIELD_ABILITIES[String(cls).toLowerCase().trim()] || null;
}

/**
 * The verb for a hero record. Accepts anything the rest of the game calls a
 * hero: a roster entry (`class`), a battle combatant (`cls`), or a bare id
 * string ('knight-shadow'), because all three shapes are live in this codebase
 * and a party ring that only understood one of them would silently disarm.
 */
export function abilityForHero(hero) {
  return abilityForClass(heroClassOf(hero));
}

/** Class of a hero in any of the three shapes above. */
export function heroClassOf(hero) {
  if (!hero) return null;
  if (typeof hero === 'string') {
    const dash = hero.indexOf('-');
    return dash > 0 ? hero.slice(0, dash) : hero;
  }
  return hero.class || hero.cls || (hero.id ? heroClassOf(hero.id) : null);
}

/** Stable hero id in any of the three shapes. */
export function heroIdOf(hero) {
  if (!hero) return null;
  return typeof hero === 'string' ? hero : (hero.id || null);
}

// ───────────────────────────────────────────────────────────────────────────
// BUTTONS
// ───────────────────────────────────────────────────────────────────────────
/**
 * WHICH REAL CONTROL EACH VERB SITS ON.
 *
 * Two of the three verbs share one new button ('ability'), and the bunny's
 * rides the jump button the child already knows. That asymmetry is on purpose:
 * a double jump that needed its own button would be the only platformer in the
 * world where it does, and a five-year-old would never find it. Pressing jump
 * again in mid-air is a thing children TRY, unprompted, on the first ledge
 * they miss. The verb's job is to reward the thing they already did.
 *
 * Bindings, all three input sources (see controls3d.js):
 *
 *   ability    touch: its own round chip below ACTION, at the ability's tint
 *              keyboard: F (and X as an alias — both rest under a left hand).
 *              NOT E and NOT Shift: controls3d already spends E on ACTION and
 *              Shift on RUN, and a binding table that collides with the live
 *              map is how this verb shipped unreachable the first time.
 *              gamepad: X / Square (button 2)
 *   swap       touch: the party ring chip, right of the stick
 *              keyboard: Q, and 1/2/3 to pick a slot directly
 *              gamepad: LB / L1 (button 4) cycles, RB / R1 (5) cycles back
 *   jump       unchanged. The second hop is served by the SAME press.
 */
export const BINDINGS = Object.freeze({
  ability: Object.freeze({ keys: ['KeyF', 'KeyX'], pad: [2] }),
  swapNext: Object.freeze({ keys: ['KeyQ'], pad: [4] }),
  swapPrev: Object.freeze({ keys: [], pad: [5] }),
  swapSlot: Object.freeze({ keys: ['Digit1', 'Digit2', 'Digit3'], pad: [] }),
});

/**
 * What the ability chip should say right now — the same contract
 * traversalWiring.jumpLabel() has, and for the same reason: a button whose
 * label lies is worse than no button.
 *
 * @returns {{verb:string, enabled:boolean, cooldown:number, tint:number}|null}
 *          null when the active hero has no field verb at all.
 */
export function abilityChip(state) {
  const a = state?.ability;
  if (!a) return null;
  const cd = state.cooldown > 0 ? state.cooldown : 0;
  return {
    verb: state.phase === PHASE.CARRY ? 'DROP' : a.verb,
    enabled: cd <= 0 && state.phase !== PHASE.WINDUP,
    cooldown: cd,
    /** 0..1 for the sweep that wipes the chip back to full. */
    cooldownFrac: a.cooldown > 0 ? cd / a.cooldown : 0,
    tint: a.tint,
    hold: a.hold,
    /**
     * Which physical control this verb lives on. The bunny's is 'jump', and
     * the HUD must respect that: drawing HOP on the ability chip and leaving
     * it there would teach a child to press the one button that does not do
     * it. Render the bunny's verb as a badge on the JUMP button instead, with
     * the remaining charge under it (see hopsLeft()).
     */
    button: a.button,
    charges: a.id === 'doubleJump' ? state.hops : null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// TARGETING
// ───────────────────────────────────────────────────────────────────────────

/**
 * Density at or above which a body is HEAVY.
 *
 * Density, not mass — because in this world mass does not discriminate (crate
 * 0.40, log 0.43, kerbstone 0.42) and density does: the kerbstone is authored
 * at 2.40 against a maximum of 0.62 for everything else, because it is granite
 * and it is meant to sink. The toybox already speaks this language — its
 * market puzzle counts "anything with minDensity 0.25" — so heaviness reading
 * off density keeps one vocabulary instead of inventing a second.
 *
 * ── HONEST NOTE ON HOW HARD THIS GATE IS ──────────────────────────────────
 * The hero is a kinematic capsule and Rapier will let it nudge a kerbstone by
 * walking into it. So today this is a PRACTICAL gate, not an absolute one: a
 * friction-0.92 kerbstone moves centimetres per body-check and metres per
 * shove, and the slab is five metres away. A child without a knight will give
 * up long before a child with one succeeds, which is the behaviour we want,
 * but it is not literally impossible.
 *
 * Making it absolute is a ONE-LINE change in someone else's file, and it is
 * written down here so it does not get lost: physicsProps.bodySpecFor() reads
 * every physical property off PROP_KINDS, so
 *
 *     density: place.density ?? k.density,
 *
 * would let ABILITY_PROPS author a kerbstone at, say, density 9 — heavy enough
 * that a walking capsule cannot shift it at all and a shove still can, because
 * the shove scales its impulse by mass.
 */
export const HEAVY_DENSITY = 1.5;

/** Kinds the wizard may lift. A log is 60 kg of tree; the spell is not a crane. */
export const LIFTABLE_KINDS = Object.freeze(['crate', 'ball', 'plank', 'leaf', 'stone']);

const _scratchTarget = { id: null, kind: '', x: 0, y: 0, z: 0, dist: 0, mass: 0, density: 0 };

/**
 * Nearest body inside the verb's forward cone.
 *
 * Scoring is distance, not angle: a child aims with their feet, and the thing
 * they walked up to is the thing they mean. The cone only decides what is
 * ELIGIBLE. Writes into a module scratch and returns it, so the per-frame
 * prompt scan allocates nothing; the caller must not retain the result.
 *
 * @param {Array} bodies  [{id, kind, x, y, z, mass?, density?}]
 * @param {{x:number,z:number,yaw:number}} from  hero position and facing
 * @param {object} ability
 * @param {(b:object)=>boolean} [filter]
 * @param {number} [len] how much of `bodies` is live (it is a reused pool)
 */
export function pickTarget(bodies, from, ability, filter = null, len = -1) {
  if (!bodies || !ability || !(ability.reach > 0)) return null;
  const n = len >= 0 ? len : bodies.length;
  // Facing: index.js yaw is measured so that forward is (sin yaw, cos yaw) —
  // the same convention controller.js integrates the move vector in.
  const fx = Math.sin(from.yaw || 0);
  const fz = Math.cos(from.yaw || 0);
  const cosArc = Math.cos(ability.arc);
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b || b.id == null) continue;
    if (filter && !filter(b)) continue;
    const dx = b.x - from.x;
    const dz = b.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > ability.reach || d >= bestD) continue;
    // A body directly underfoot has no meaningful bearing; take it.
    if (d > 1e-3) {
      const dot = (dx / d) * fx + (dz / d) * fz;
      if (dot < cosArc) continue;
    }
    bestD = d;
    best = b;
  }
  if (!best) return null;
  _scratchTarget.id = best.id;
  _scratchTarget.kind = best.kind || '';
  _scratchTarget.x = best.x;
  _scratchTarget.y = best.y;
  _scratchTarget.z = best.z;
  _scratchTarget.mass = best.mass || 0;
  _scratchTarget.density = best.density || 0;
  _scratchTarget.dist = bestD;
  return _scratchTarget;
}

/** Can the wizard lift this? Kind allow-list, and nothing already held. */
export function isLiftable(body) {
  if (!body) return false;
  return LIFTABLE_KINDS.indexOf(body.kind) >= 0;
}

/**
 * Is this body one the knight is FOR?
 *
 * Everything is shovable — a shove that bounced off a leaf would be a lie —
 * but only a heavy body is shove-ONLY, and that distinction is what the HUD
 * prompt and the gate check both need.
 */
export function isHeavy(body) {
  return !!body && (body.density || 0) >= HEAVY_DENSITY;
}

// ───────────────────────────────────────────────────────────────────────────
// THE ABILITY MACHINE
// ───────────────────────────────────────────────────────────────────────────

/** What the verb is doing right now. */
export const PHASE = Object.freeze({
  READY: 'ready',
  WINDUP: 'windup',
  CARRY: 'carry',
  COOLDOWN: 'cooldown',
});

/** One-shot events the host routes to FX, sound and the gate ledger. */
export const EVENTS = Object.freeze({
  WINDUP: 'windup',
  SHOVE: 'shove',
  GRAB: 'grab',
  DROP: 'drop',
  HOP: 'hop',
  BLOCKED: 'blocked',
  SWAP: 'swap',
});

/** Why a press did nothing. The HUD says one of these, kindly. */
export const BLOCKED = Object.freeze({
  COOLDOWN: 'cooldown',
  NO_TARGET: 'noTarget',
  NO_ABILITY: 'noAbility',
  LOCKED: 'locked',
  AIRBORNE: 'airborne',
});

/**
 * Build the field-ability machine for one world.
 *
 * Everything it touches from outside arrives per-frame through `ctx`, so this
 * function imports no engine and the tests drive the real code path.
 *
 * @param {object} opts
 * @param {object} [opts.hooks]
 *   onEvent(e)   — one of EVENTS, with the payload on the same object
 *   onPrompt(p)  — the contextual prompt changed: {verb, target, valid} | null
 * @param {object} [opts.abilities] override the verb table (tests, tuning)
 */
export function createFieldAbilities({ hooks = {}, abilities = FIELD_ABILITIES } = {}) {
  /** Reused event record. The host reads it inside the callback and drops it. */
  const EVENT = {
    type: '', ability: null, cls: null, heroId: null,
    targetId: null, kind: '', x: 0, y: 0, z: 0, power: 1, reason: '',
  };
  /** Reused prompt record, same contract. */
  const PROMPT = { verb: '', targetId: null, kind: '', valid: false, tint: 0 };

  const state = {
    heroId: null,
    cls: null,
    ability: null,
    phase: PHASE.READY,
    /** Seconds left of the current phase's own clock. */
    timer: 0,
    cooldown: 0,
    /** Mid-air hops left before the feet touch something. */
    hops: 0,
    /** Body currently held aloft, or null. */
    carryId: null,
    carryT: 0,
    /** True while the ability button is down (hold verbs read this). */
    held: false,
    /** Set by press() and consumed by the next update. */
    pressed: false,
    released: false,
  };

  let lastPromptId = null;
  let lastPromptValid = null;

  function emit(type, extra) {
    EVENT.type = type;
    EVENT.ability = state.ability ? state.ability.id : null;
    EVENT.cls = state.cls;
    EVENT.heroId = state.heroId;
    EVENT.targetId = extra && extra.targetId !== undefined ? extra.targetId : null;
    EVENT.kind = extra && extra.kind !== undefined ? extra.kind : '';
    EVENT.x = extra && extra.x !== undefined ? extra.x : 0;
    EVENT.y = extra && extra.y !== undefined ? extra.y : 0;
    EVENT.z = extra && extra.z !== undefined ? extra.z : 0;
    EVENT.power = extra && extra.power !== undefined ? extra.power : 1;
    EVENT.reason = extra && extra.reason !== undefined ? extra.reason : '';
    hooks.onEvent?.(EVENT);
    return EVENT;
  }

  /**
   * Point the verb at a hero. Drops anything held: the wizard walking off with
   * a crate and handing the body to a knight who cannot hold it is exactly the
   * kind of dangling state that ends up as a crate frozen in the sky.
   */
  function setHero(hero, ctx = null) {
    if (state.carryId != null) release(ctx);
    state.heroId = heroIdOf(hero);
    state.cls = heroClassOf(hero);
    state.ability = abilities[state.cls] || null;
    state.phase = PHASE.READY;
    state.timer = 0;
    state.cooldown = 0;
    state.held = false;
    state.pressed = false;
    state.released = false;
    state.hops = 0;
    return state.ability;
  }

  /** The ability button went down. */
  function press() {
    state.pressed = true;
    state.held = true;
  }

  /** The ability button came up. Only the hold verbs care. */
  function releaseButton() {
    state.held = false;
    state.released = true;
  }

  /**
   * The JUMP button was pressed. Call this from the host's jump path.
   *
   * @returns {number} the upward velocity the host should WRITE onto
   *   player.vel.y, or 0 when no air jump was granted (which is every case
   *   except an airborne bunny with a charge left, so the host's default jump
   *   handling is untouched).
   */
  function jump(player) {
    const a = state.ability;
    if (!a || a.id !== 'doubleJump') return 0;
    // On the ground the normal jump serves; do not spend the charge.
    if (!player || player.grounded) return 0;
    // Climbing, gliding and swimming all overload jump with their own meaning
    // (see traversalWiring.jumpLabel). The second hop belongs to falling only.
    if (player.climbing || player.gliding || player.swimming) return 0;
    if (state.hops <= 0) return 0;
    state.hops--;
    emit(EVENTS.HOP, {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      power: 1 - state.hops / Math.max(1, a.charges),
    });
    return a.hopV;
  }

  /** Hops left, for the HUD's little chevron under the hero. */
  function hopsLeft() { return state.hops; }

  function release(ctx) {
    if (state.carryId == null) return null;
    const id = state.carryId;
    state.carryId = null;
    state.carryT = 0;
    const a = state.ability;
    state.phase = PHASE.COOLDOWN;
    state.cooldown = a ? a.cooldown : 0;
    let x = 0, y = 0, z = 0;
    if (ctx && ctx.bodyAt) {
      const b = ctx.bodyAt(id);
      if (b) { x = b.x; y = b.y; z = b.z; }
    }
    emit(EVENTS.DROP, { targetId: id, x, y, z });
    return id;
  }

  /**
   * One tick.
   *
   * @param {number} dt seconds
   * @param {object} ctx
   *   player   {pos:{x,y,z}, yaw, grounded, climbing?, gliding?, swimming?}
   *   bodies   array of {id, kind, x, y, z, mass, density} — a reused pool is fine
   *   bodyLen  how much of it is live (default bodies.length)
   *   bodyAt(id)      -> the same shape, or null
   *   impulse(id, ix, iy, iz)
   *   teleport(id, x, y, z)
   *   groundAt(x, z)  -> world Y
   *   locked   true while a fight, a modal or a cinematic owns the world
   */
  function update(dt, ctx) {
    const player = ctx?.player;
    if (!player) { state.pressed = false; state.released = false; return state; }

    // Re-arm the second hop the instant the feet are on something. Also on a
    // wall grab and on a raft, because both are "the feet are supported" and a
    // bunny who climbs to a ledge should not have spent their hop getting there.
    const a = state.ability;
    if (a && a.id === 'doubleJump') {
      if (player.grounded || player.climbing || player.swimming) state.hops = a.charges;
    }

    if (state.cooldown > 0) {
      state.cooldown -= dt;
      if (state.cooldown <= 0) {
        state.cooldown = 0;
        if (state.phase === PHASE.COOLDOWN) state.phase = PHASE.READY;
      }
    }

    const pressed = state.pressed;
    const released = state.released;
    state.pressed = false;
    state.released = false;

    if (ctx.locked) {
      if (state.carryId != null) release(ctx);
      updatePrompt(null);
      return state;
    }

    if (!a || a.id === 'doubleJump') {
      // The bunny's verb lives entirely on the jump button; a press on the
      // ability chip is a kindness, not an error — say so and move on.
      if (pressed) {
        emit(EVENTS.BLOCKED, { reason: a ? BLOCKED.AIRBORNE : BLOCKED.NO_ABILITY });
      }
      updatePrompt(null);
      return state;
    }

    // ── Carrying ───────────────────────────────────────────────────────────
    if (state.phase === PHASE.CARRY) {
      state.carryT += dt;
      // Let go: the button came up, the clock ran out, or the body vanished
      // out from under the spell (the leash brought it home, say).
      const gone = ctx.bodyAt ? !ctx.bodyAt(state.carryId) : false;
      if (released || !state.held || state.carryT >= a.maxHold || gone) {
        release(ctx);
      } else {
        carryStep(dt, ctx, a);
      }
      updatePrompt(null);
      return state;
    }

    // ── Winding up ─────────────────────────────────────────────────────────
    if (state.phase === PHASE.WINDUP) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        if (a.id === 'shove') doShove(ctx, a);
        else if (a.id === 'levitate') doGrab(ctx, a);
      }
      updatePrompt(null);
      return state;
    }

    // ── Ready ──────────────────────────────────────────────────────────────
    const target = scanTarget(ctx, a);
    updatePrompt(target);
    if (!pressed) return state;
    if (state.cooldown > 0) { emit(EVENTS.BLOCKED, { reason: BLOCKED.COOLDOWN }); return state; }
    if (!target) { emit(EVENTS.BLOCKED, { reason: BLOCKED.NO_TARGET }); return state; }
    state.phase = PHASE.WINDUP;
    state.timer = a.windup;
    emit(EVENTS.WINDUP, {
      targetId: target.id, kind: target.kind, x: target.x, y: target.y, z: target.z,
    });
    // A zero windup lands on the same frame — a verb that costs a frame of
    // latency for no telegraph is just input lag.
    if (state.timer <= 0) {
      if (a.id === 'shove') doShove(ctx, a);
      else doGrab(ctx, a);
    }
    return state;
  }

  function scanTarget(ctx, a) {
    if (!ctx.bodies) return null;
    const filter = a.id === 'levitate' ? isLiftable : null;
    return pickTarget(ctx.bodies, ctx.player, a, filter, ctx.bodyLen ?? -1);
  }

  function doShove(ctx, a) {
    const t = scanTarget(ctx, a);
    state.phase = PHASE.COOLDOWN;
    state.cooldown = a.cooldown;
    if (!t) { emit(EVENTS.BLOCKED, { reason: BLOCKED.NO_TARGET }); return; }
    const dx = t.x - ctx.player.pos.x;
    const dz = t.z - ctx.player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    // Direction is hero -> body, NOT the hero's facing: at the edge of the
    // cone those differ by 40 degrees, and a shove that sends a crate sideways
    // past your shoulder is a shove a child will not believe they aimed.
    const ux = dx / d;
    const uz = dz / d;
    // Impulse = mass x dv, so every kind leaves at the same speed and no kind
    // is ever handed a number Rapier will refuse. See FIELD_ABILITIES.knight.dv.
    const mass = t.mass > 0 ? t.mass : 0.4;
    let j = mass * a.dv;
    if (j > a.maxImpulse) j = a.maxImpulse;
    ctx.impulse?.(t.id, ux * j, j * a.lift, uz * j);
    emit(EVENTS.SHOVE, {
      targetId: t.id, kind: t.kind, x: t.x, y: t.y, z: t.z,
      power: isHeavy(t) ? 1 : 0.6,
    });
  }

  function doGrab(ctx, a) {
    const t = scanTarget(ctx, a);
    if (!t) {
      state.phase = PHASE.COOLDOWN;
      state.cooldown = a.cooldown;
      emit(EVENTS.BLOCKED, { reason: BLOCKED.NO_TARGET });
      return;
    }
    state.carryId = t.id;
    state.carryT = 0;
    state.phase = PHASE.CARRY;
    emit(EVENTS.GRAB, { targetId: t.id, kind: t.kind, x: t.x, y: t.y, z: t.z });
  }

  /**
   * Walk the held body toward the carry point.
   *
   * Teleport, not force. A held object under a spring force fights gravity,
   * overshoots and oscillates; a teleport with the velocity zeroed (which is
   * what Rapier's setTranslation does — see physics.teleport) is a hand. The
   * fraction is exponential so it is frame-rate independent.
   */
  function carryStep(dt, ctx, a) {
    const b = ctx.bodyAt ? ctx.bodyAt(state.carryId) : null;
    if (!b) return;
    const p = ctx.player;
    const tx = p.pos.x + Math.sin(p.yaw || 0) * a.carryDist;
    const tz = p.pos.z + Math.cos(p.yaw || 0) * a.carryDist;
    const gy = ctx.groundAt ? ctx.groundAt(tx, tz) : 0;
    const ty = gy + a.carryHeight;
    const k = 1 - Math.exp(-a.carryLerp * dt);
    ctx.teleport?.(
      state.carryId,
      b.x + (tx - b.x) * k,
      b.y + (ty - b.y) * k,
      b.z + (tz - b.z) * k,
    );
  }

  function updatePrompt(target) {
    const id = target ? target.id : null;
    const valid = !!target;
    if (id === lastPromptId && valid === lastPromptValid) return;
    lastPromptId = id;
    lastPromptValid = valid;
    if (!target) { hooks.onPrompt?.(null); return; }
    PROMPT.verb = state.ability ? state.ability.verb : '';
    PROMPT.targetId = target.id;
    PROMPT.kind = target.kind;
    PROMPT.valid = valid;
    PROMPT.tint = state.ability ? state.ability.tint : 0;
    hooks.onPrompt?.(PROMPT);
  }

  return {
    state,
    setHero,
    press,
    releaseButton,
    jump,
    hopsLeft,
    update,
    /** Drop anything held and go quiet. A fight, a portal, a context loss. */
    cancel(ctx = null) {
      release(ctx);
      state.phase = state.cooldown > 0 ? PHASE.COOLDOWN : PHASE.READY;
      state.held = false;
      state.pressed = false;
      state.released = false;
    },
    get ability() { return state.ability; },
    get carrying() { return state.carryId; },
    chip() { return abilityChip(state); },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THE PARTY RING
// ───────────────────────────────────────────────────────────────────────────

/**
 * How long after a swap before another is allowed, seconds.
 *
 * Not a cost — a legibility floor. Without it the chip is a strobe: a child
 * mashing the button gets three rig rebuilds a frame and cannot tell who they
 * are. 0.45 s is one clear papercut wipe, and it is short enough that swapping
 * mid-puzzle never feels like it was taken away from you.
 */
export const SWAP_LOCKOUT = 0.45;

/**
 * The field roster.
 *
 * Reads save.party (the same array the battle scene hydrates) and nothing
 * else, so the ring is always the party the child chose. Order is party order:
 * slot 1 is who you set out as, and Q walks forward through the rest.
 *
 * @param {object} opts
 * @param {object} opts.save
 * @param {object} [opts.hooks] onSwap({from, to, index, ability, cls})
 * @param {()=>boolean} [opts.gate] return false to refuse a swap (a fight, a
 *        cinematic, a modal). Defaults to always-allowed.
 */
export function createPartyRing({ save, hooks = {}, gate = null } = {}) {
  let members = readParty(save);
  let index = 0;
  let lockout = 0;

  function readParty(s) {
    const raw = Array.isArray(s?.party) ? s.party : [];
    const out = [];
    for (const h of raw) {
      const id = heroIdOf(h);
      if (!id) continue;
      const cls = heroClassOf(h);
      out.push({
        id,
        name: h.name || id,
        cls,
        level: h.level || 1,
        ability: abilityForClass(cls),
      });
    }
    return out;
  }

  /** Re-read the party. Call after a rescue, an evolution or a party edit. */
  function refresh() {
    const wasId = members[index]?.id || null;
    members = readParty(save);
    const found = members.findIndex((m) => m.id === wasId);
    index = found >= 0 ? found : 0;
    return members;
  }

  function active() { return members[index] || null; }

  function step(dt) {
    if (lockout > 0) {
      lockout -= dt;
      if (lockout < 0) lockout = 0;
    }
  }

  function canSwap() {
    if (members.length < 2) return false;
    if (lockout > 0) return false;
    if (gate && !gate()) return false;
    return true;
  }

  /**
   * Move to a slot. `to` may be an index or a class name — "give me the one
   * who can lift this" is the question a locked door asks, and answering it
   * with an index would mean the caller has to know the party order.
   *
   * @returns {object|null} the new active member, or null if nothing moved
   */
  function select(to) {
    if (!canSwap()) return null;
    let next = -1;
    if (typeof to === 'number') next = ((to % members.length) + members.length) % members.length;
    else if (typeof to === 'string') next = members.findIndex((m) => m.cls === to || m.id === to);
    if (next < 0 || next === index) return null;
    const from = members[index] || null;
    index = next;
    lockout = SWAP_LOCKOUT;
    const to_ = members[index];
    hooks.onSwap?.({ from, to: to_, index, ability: to_.ability, cls: to_.cls });
    return to_;
  }

  function cycle(dir = 1) {
    if (!canSwap()) return null;
    return select(index + (dir >= 0 ? 1 : -1));
  }

  /**
   * Is there anybody in the party who could do `verbId`, and who?
   *
   * This is what turns a locked gate from a dead end into a puzzle: the HUD
   * can say "somebody here can move that" without saying who, and the child
   * cycles until the chip changes.
   */
  function whoCan(verbId) {
    for (let i = 0; i < members.length; i++) {
      if (members[i].ability && members[i].ability.id === verbId) return members[i];
    }
    return null;
  }

  /** Verb ids the party can currently field. The gate audit reads this. */
  function verbs() {
    const out = [];
    for (const m of members) {
      if (m.ability && out.indexOf(m.ability.id) < 0) out.push(m.ability.id);
    }
    return out;
  }

  return {
    get members() { return members; },
    get index() { return index; },
    get lockout() { return lockout; },
    refresh, active, select, cycle, canSwap, whoCan, verbs, step,
    /** HUD chips: three little heads with their verb under them. */
    chips() {
      return members.map((m, i) => ({
        id: m.id,
        name: m.name,
        cls: m.cls,
        verb: m.ability ? m.ability.verb : '',
        tint: m.ability ? m.ability.tint : PAPER.sand,
        active: i === index,
      }));
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THINGS THAT NEED A PARTICULAR HERO
// ───────────────────────────────────────────────────────────────────────────

/**
 * ── WHY GATES ARE A SEPARATE LIST FROM PUZZLES ─────────────────────────────
 * A gate is the ONE-LINE claim "this needs the wizard". The puzzle underneath
 * it can be a physics count, a place you have to stand, or nothing at all. The
 * runtime needs the claim on its own so it can tell a child who is standing at
 * a locked thing with the wrong hero what is wrong — which is the entire
 * difference between a roster that matters and a roster you resent.
 *
 * `kind`:
 *   'shove'  a heavy body must end up somewhere. Only the knight moves it.
 *   'lift'   something must be put ON something. Only the wizard carries.
 *   'reach'  the HERO must stand somewhere high. Only the bunny gets there.
 */
export const ABILITY_GATES = Object.freeze([
  {
    id: 'gate-garden-stones',
    kind: 'shove',
    verb: 'shove',
    cls: 'knight',
    puzzleId: 'phz-garden-stones',
    name: 'The Stubborn Stones',
    /** Where the "you need a knight" prompt fires, and how close. */
    at: { x: 29.5, z: 148.5 }, radius: 9,
    hint: 'Too heavy to walk into. Somebody has to put a shoulder in it.',
  },
  {
    id: 'gate-market-stack',
    kind: 'lift',
    verb: 'levitate',
    cls: 'wizard',
    puzzleId: 'phz-market-stack',
    name: 'The Tall Shelf',
    at: { x: -138.0, z: 33.0 }, radius: 9,
    hint: 'It has to go on TOP. Nobody here can lift with their hands.',
  },
  {
    id: 'gate-garden-perch',
    kind: 'reach',
    verb: 'doubleJump',
    cls: 'bunny',
    /** No physics puzzle — the gate IS getting up there. */
    puzzleId: null,
    name: 'The Hanging Chime',
    /**
     * A paper chime on a bent reed over the palace road, 38 m out of the spawn
     * meadow — the first thing on the walk north, and the flattest square in
     * the garden (gradient 0.038 over a 2.5 m footprint), so the landing is
     * never the hard part. The hard part is the height.
     */
    at: { x: 8.0, z: 120.0 }, radius: 7,
    /**
     * Ground clearance the hero must reach inside the radius. Above
     * REACH_HEIGHT.single (1.64 m) and below REACH_HEIGHT.double (3.35 m), so
     * it is exactly and only reachable on the second hop.
     */
    standHeight: 2.6,
    hint: 'One jump is not enough. Something here can jump twice.',
  },
]);

/**
 * Has the player cleared a REACH gate this frame?
 *
 * Altitude is measured against the GROUND UNDER THE HERO, not against sea
 * level, so the gate cannot be cheesed by walking up the hill beside it — and
 * cannot be broken by a heightfield retune either, which is the same rule the
 * toybox's zones use for their y windows and for the same reason.
 *
 * @param {{pos:{x:number,y:number,z:number}, groundY?:number}} player
 * @param {(x:number,z:number)=>number} [groundAt] used when the host has not
 *   already written `groundY` onto the state (index.js writes it in draw()).
 * @returns {object|null} the gate cleared, or null
 */
export function reachCleared(player, groundAt = null, gates = ABILITY_GATES) {
  if (!player) return null;
  const g = gateNear(player.pos.x, player.pos.z, gates);
  if (!g || g.kind !== 'reach') return null;
  const gy = player.groundY != null
    ? player.groundY
    : (groundAt ? groundAt(player.pos.x, player.pos.z) : 0);
  return (player.pos.y - gy) >= g.standHeight ? g : null;
}

/** Gate by id. */
export function gateById(id) {
  for (const g of ABILITY_GATES) if (g.id === id) return g;
  return null;
}

/** Which class a gate wants. */
export function classForGate(gate) { return gate ? gate.cls : null; }

/**
 * The nearest gate the player is standing at, or null.
 * Squared compares, no allocation — this runs every frame.
 */
export function gateNear(x, z, gates = ABILITY_GATES) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    const dx = x - g.at.x;
    const dz = z - g.at.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= g.radius * g.radius && d2 < bestD2) { bestD2 = d2; best = g; }
  }
  return best;
}

// ───────────────────────────────────────────────────────────────────────────
// THE TOYBOX ADDITIONS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extra physics placements the ability puzzles need.
 *
 * SHAPE: exactly physicsProps.SANDBOX's — {id, kind, x, z, yaw?, lay?, lift?}
 * — plus one field that module does not have yet:
 *
 *   heavy: true   the body is granite (see HEAVY_DENSITY) and is therefore
 *                 shove-only in practice.
 *
 * Nothing here imports physicsProps.js. That is deliberate and it is the
 * lesson of the last three rounds of this project: the toybox is another
 * agent's file, it is in flight right now, and a hard import would mean this
 * module cannot even be PARSED until theirs lands. The host merges the two
 * lists in one line (see the wiring notes in abilityWiring.js), and if the
 * toybox never lands, everything in this file except these three puzzles still
 * works — the verbs, the ring, the gates, the second hop.
 */
export const ABILITY_PROPS = Object.freeze([
  // ── The Stubborn Stones (knight) ─────────────────────────────────────────
  // The bench east of the see-saw shelf, south-east of the spawn meadow. Every
  // coordinate below was picked by sampling the heightfield against the SAME
  // slope budget physicsProps.test.js enforces on the sandbox — worst gradient
  // anywhere under the body's own 0.7 m footprint, against a stone's 0.17 —
  // because a puzzle piece that has rolled away by the time the child arrives
  // is the exact failure that got the last stacking puzzle deleted.
  //   measured: 0.064 / 0.106 / 0.107, all well inside budget.
  { id: 'abl-g-stone-1', kind: 'stone', x: 30.5, z: 146.5, yaw: 0.4, heavy: true },
  { id: 'abl-g-stone-2', kind: 'stone', x: 28.0, z: 146.5, yaw: 1.7, heavy: true },
  // A third, so "two" is a choice and not "all of them" — the same exact-count
  // rule physicsProps argues for at length, obeyed here.
  { id: 'abl-g-stone-3', kind: 'stone', x: 31.5, z: 145.0, yaw: 2.6, heavy: true },

  // ── The Tall Shelf (wizard) ──────────────────────────────────────────────
  // Market crates on the flat north of the plaza, where the main street comes
  // in from the garden. Measured gradients 0.053-0.088 against a crate's 0.13,
  // and every one of them at least 4.6 m from the shelf so none of them starts
  // the puzzle already counted.
  { id: 'abl-m-crate-1', kind: 'crate', x: -136.0, z: 29.5, yaw: 0.2 },
  { id: 'abl-m-crate-2', kind: 'crate', x: -133.5, z: 29.5, yaw: 1.4 },
  { id: 'abl-m-crate-3', kind: 'crate', x: -135.0, z: 31.5, yaw: 2.5 },
  { id: 'abl-m-crate-4', kind: 'crate', x: -142.0, z: 36.5, yaw: 0.9 },
]);

/**
 * The ability puzzles.
 *
 * SHAPE: exactly physicsProps.PUZZLES's, so `createPhysicsProps({ puzzles })`
 * takes them with no adapter and `createPuzzleTracker` counts them with no
 * change. One field is new:
 *
 *   requires: 'shove' | 'levitate'   the verb without which it is impossible.
 *
 * ── THE STACKING PUZZLE, RETURNED ─────────────────────────────────────────
 * physicsProps.js cut a stacking puzzle with this note:
 *
 *     "If a carry verb ever lands, the stacking puzzle should come back; it
 *      wants a hold/drop button in controls3d.js, a carried-body slot on the
 *      controller, and a zone whose y window runs to 6 m."
 *
 * All three now exist: the hold is BINDINGS.ability, the carried-body slot is
 * `state.carryId` above, and `phz-market-stack`'s zone runs y0 -0.9 to y1 6.0.
 * Three crates inside a 1.9 m circle at 6 m of headroom cannot be arranged
 * except by putting two of them on top of one, which is the puzzle.
 */
/**
 * Radius of the Tall Shelf's pedestal, metres — the number that makes the
 * stacking puzzle a stacking puzzle.
 *
 * The zone counts a body when its CENTRE is inside the cylinder. A crate is
 * 0.9 m on a side, so two crate centres can never be closer than 0.9 m. Three
 * points pairwise 0.9 m apart have a minimum enclosing circle of radius
 * 0.9/sqrt(3) = 0.520 m. So:
 *
 *     r >= 0.52   three crates fit side by side and nobody ever lifts anything
 *     r <  0.52   the third crate CANNOT be on the ground
 *     r >= 0.45   two still can, so the child gets a base to build on
 *
 * 0.50 sits in that window with 2 cm of margin at the top and 5 cm at the
 * bottom. It is the whole reason this puzzle needs the wizard, and the first
 * draft got it wrong — a 1.9 m plate was authored, and three crates fit on it
 * flat with room to spare.
 */
export const STACK_RADIUS = 0.50;

export const ABILITY_PUZZLES = Object.freeze([
  {
    id: 'phz-garden-stones',
    place: 'garden',
    name: 'The Stubborn Stones',
    prompt: '3 - 1',
    answer: 2,
    hint: 'Three stones, take one away. Shove the rest onto the slab.',
    requires: 'shove',
    sign: { x: 27.0, z: 148.5, yaw: 1.1 },
    reward: 'stone-token',
    plates: [{ x: 29.0, z: 151.0, r: 2.5 }],
    zones: [{
      id: 'slab', kind: 'stone', check: 'in',
      x: 29.0, z: 151.0, r: 2.5, y0: -0.9, y1: 2.0,
    }],
    need: 2,
  },
  {
    id: 'phz-market-stack',
    place: 'market',
    name: 'The Tall Shelf',
    prompt: '2 + 1',
    answer: 3,
    hint: 'Three crates on the shelf. It is taller than you are.',
    requires: 'levitate',
    sign: { x: -136.5, z: 35.5, yaw: 2.0 },
    reward: 'shelf-lantern',
    plates: [{ x: -139.5, z: 32.5, r: STACK_RADIUS }],
    // The y window and the radius TOGETHER are the puzzle. See STACK_RADIUS:
    // 6 m of headroom over a pedestal too narrow for three crates to stand on
    // side by side, so at least one of them has to be in the air, so somebody
    // has to have put it there.
    zones: [{
      id: 'shelf', kind: 'crate', check: 'in',
      x: -139.5, z: 32.5, r: STACK_RADIUS, y0: -0.9, y1: 6.0,
    }],
    need: 3,
  },
]);

/**
 * Merge the ability additions into the toybox's own lists.
 *
 * Defensive on purpose: both arguments may be undefined (the toybox has not
 * landed, or landed without one of its exports) and the result is still a
 * valid list. Ids are de-duplicated so a double-merge is a no-op, which
 * matters because the host may call this on a hot reload.
 */
export function mergeToybox(placements = [], puzzles = []) {
  return {
    placements: dedupeById(placements, ABILITY_PROPS),
    puzzles: dedupeById(puzzles, ABILITY_PUZZLES),
  };
}

function dedupeById(base, extra) {
  const out = Array.isArray(base) ? base.slice() : [];
  const seen = new Set();
  for (const p of out) if (p && p.id) seen.add(p.id);
  for (const p of extra) if (!seen.has(p.id)) { out.push(p); seen.add(p.id); }
  return out;
}

/**
 * Every gate the CURRENT party can and cannot open.
 *
 * The HUD's map screen wants this, and so does the "you should take somebody
 * else" nudge: a party of three knights is a legal party and it can complete
 * exactly one of the three gates, which is fine as long as the game says so
 * before the child has walked to the third one.
 */
export function gateAudit(ring, gates = ABILITY_GATES) {
  const have = new Set(ring?.verbs?.() || []);
  const open = [];
  const shut = [];
  for (const g of gates) (have.has(g.verb) ? open : shut).push(g);
  return { open, shut, complete: shut.length === 0 };
}
