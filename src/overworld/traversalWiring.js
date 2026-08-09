/**
 * traversalWiring — the whole traversal stack, assembled, in one call.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Climbing, gliding and swimming are six modules (traversal, traversalSpec,
 * floatables, traversalHud, traversalFx, and the thermal field they share) and
 * they have to be composed in one specific order:
 *
 *      heightfield
 *          -> collisionWorld
 *          -> withFloatables(collisionWorld, floatables)      <-- rafts are ground
 *          -> createTraversalController(that, tuning, {thermalAt})
 *
 * Get that order wrong and you get a game where the rafts are decoration and
 * the vents do nothing. Rather than paste four paragraphs of assembly into
 * index.js — a file three other agents are also editing — the assembly lives
 * here and index.js gets a two-line diff:
 *
 *      const traversal = createIslandTraversal(heightfield, islandCollision);
 *      let controller = traversal.controller;   // was createController(...)
 *
 * Everything else this module exposes is optional polish the host can adopt
 * one line at a time (see the wiring notes at the bottom of the file).
 *
 * DROP-IN CONTRACT: `traversal.controller` has exactly the shape index.js
 * already consumes — `spawnState(opts)` and `step(state, input, dt)`, both
 * pure, both returning a fresh state. A state produced by the plain walk
 * controller is accepted and upgraded, so an existing save loads.
 */
import { createCollisionWorld } from './collision.js';
import { createController, DEFAULT_TUNING } from './controller.js';
import { createTraversalController, MODES, EVENTS, rigFlags } from './traversal.js';
import { createFloatables, withFloatables } from './floatables.js';
import {
  CLIMB_ROUTES, GLIDE_LINES, LAUNCH_PADS, THERMALS, FLOATABLES,
  createThermalField, nearestClimbRoute, nearestLaunchPad,
} from './traversalSpec.js';

/**
 * Assemble the island's traversal stack.
 *
 * @param {{sampleHeight:Function, sampleNormal:Function}} heightfield
 * @param {object} [collisionWorld] the island's collision world. Omit and one
 *        is built — but index.js already has one with every prop collider in
 *        it, so pass that.
 * @param {{tuning?:object, spec?:object, floatables?:boolean, thermals?:boolean}} [opts]
 */
export function createIslandTraversal(heightfield, collisionWorld = null, opts = {}) {
  const base = collisionWorld || createCollisionWorld(heightfield);
  const groundAt = (x, z) => heightfield.sampleHeight(x, z);

  const spec = {
    routes: opts.spec?.routes || CLIMB_ROUTES,
    lines: opts.spec?.lines || GLIDE_LINES,
    pads: opts.spec?.pads || LAUNCH_PADS,
    thermals: opts.thermals === false ? [] : (opts.spec?.thermals || THERMALS),
    floatables: opts.floatables === false ? [] : (opts.spec?.floatables || FLOATABLES),
  };

  // 1. Rafts first: they edit the ground, so they must be inside the collision
  //    world the controller is built over.
  const floatables = createFloatables(spec.floatables, { groundAt });
  const world = withFloatables(base, floatables);

  // 2. Then the lift field, which only the glider reads.
  const field = createThermalField(spec.thermals, groundAt);

  // 3. Then the controller. TURN_RATE and friends arrive through `tuning`,
  //    exactly as they do for createController today.
  const controller = createTraversalController(world, opts.tuning || {}, field);

  /**
   * Advance the world's own moving parts. Call this from the fixed step BEFORE
   * controller.step, so the deck a foot lands on is this frame's deck.
   */
  function stepWorld(dt, playerState) {
    floatables.step(dt, playerState);
  }

  /** Save payload for everything in here that is not the player. */
  function toSave() {
    return { floatables: floatables.serialize() };
  }

  /** Restore a save payload. Tolerant of missing/older shapes. */
  function fromSave(data) {
    if (data?.floatables) floatables.restore(data.floatables);
  }

  return {
    controller,
    collisionWorld: world,
    baseCollisionWorld: base,
    floatables,
    thermalField: field,
    spec,
    tuning: controller.tuning,
    stepWorld,
    toSave,
    fromSave,
    /** "There is a way up here" prompt — null when there is not. */
    routeNear(x, z, r) { return nearestClimbRoute(x, z, r, spec.routes); },
    /** "You can launch from here" prompt — null when you cannot. */
    padNear(x, z, r) { return nearestLaunchPad(x, z, r, spec.pads); },
  };
}

/**
 * The same stack for an interior floor: climbing and the glider still work
 * (a floor is a 3D place with walls and drops), but there is no ocean to swim
 * in, no vents and no boats, so those are simply absent.
 */
export function createFloorTraversal(collisionWorld, opts = {}) {
  return createTraversalController(collisionWorld, opts.tuning || {}, {});
}

/**
 * A plain walk controller, for a caller that wants traversal switched off
 * entirely (accessibility, a cutscene, a regression bisect). Same shape.
 */
export function createWalkOnly(collisionWorld, tuning = DEFAULT_TUNING) {
  return createController(collisionWorld, tuning);
}

/**
 * Route the traversal state's one-shot `event` to the FX layer and the audio
 * bus, once each. Pure dispatch — it holds no state, because the event already
 * lives on the state object and a replay therefore reproduces every cue.
 *
 * @param {object} state the state controller.step() just returned
 * @param {{onEvent?:Function}} [fx] createTraversalFx()'s return value
 * @param {(key:string)=>void} [playSound]
 */
export function dispatchTraversalEvent(state, fx, playSound) {
  const e = state?.event;
  if (!e) return null;
  fx?.onEvent?.(e, state);
  const key = SOUND_FOR[e];
  if (key && playSound) playSound(key);
  return e;
}

/**
 * Event -> sound. The values are RECIPE NAMES from src/systems/sfxLibrary.js,
 * which already ships a synthesised cue for every one of them — climb, mantle,
 * gliderOpen, gust, splash, swim, land, rescue. Deliberately strings and not
 * an import: the sfx library is another module's territory and this table must
 * not break when it grows a recipe. A name that does not resolve is silence,
 * never an error.
 */
export const SOUND_FOR = Object.freeze({
  [EVENTS.GRAB]: 'climb',
  [EVENTS.SHIMMY]: 'climb',
  [EVENTS.MANTLE]: 'mantle',
  [EVENTS.RESCUE]: 'rescue',
  [EVENTS.SPENT]: 'gust',
  [EVENTS.CANOPY]: 'gliderOpen',
  [EVENTS.AUTOCANOPY]: 'gliderOpen',
  [EVENTS.THERMAL]: 'gust',
  [EVENTS.TOUCHDOWN]: 'land',
  [EVENTS.SPLASH]: 'splash',
  [EVENTS.SUBMERGE]: 'swim',
  [EVENTS.SURFACE]: 'swim',
  [EVENTS.SHORE]: 'splash',
});

/**
 * Fold the traversal flags onto the state object the hero rig is about to
 * read. heroRig.update() already keys off `climbing` / `gliding`; this adds
 * `swimming` for the paddle cycle and leaves everything else untouched.
 *
 * MUTATES `state` — deliberately. index.js already writes `player.groundY`
 * onto the live state for the same reason (the rig wants one object, and the
 * controller hands back a fresh one every frame so nothing can leak).
 */
export function applyRigFlags(state) {
  if (!state) return state;
  rigFlags(state, state);
  return state;
}

/**
 * Is the walk controller's jump button currently doing something else?
 * The traversal machine overloads jump three ways (leap / deploy canopy /
 * let go of the wall), and the on-screen button should say which — a button
 * whose label lies is worse than no button.
 */
export function jumpLabel(state) {
  switch (state?.mode) {
    case MODES.CLIMB: return 'LET GO';
    case MODES.MANTLE: return null;
    case MODES.GLIDE: return 'FOLD';
    case MODES.SWIM: return (state.dive || 0) > 0.05 ? 'UP' : 'JUMP';
    default:
      // Airborne, falling, with room below: the button is the glider.
      return !state?.grounded && (state?.vel?.y || 0) < 0 ? 'GLIDE' : 'JUMP';
  }
}

/**
 * ── WIRING NOTES FOR src/overworld/index.js ────────────────────────────────
 *
 * REQUIRED (2 lines changed, 1 added):
 *
 *   import { createIslandTraversal } from './traversalWiring.js';
 *
 *   const traversal = createIslandTraversal(heightfield, islandCollision,
 *     { tuning: { ...DEFAULT_TUNING, turnRate: TURN_RATE } });
 *   let collisionWorld = traversal.collisionWorld;   // was islandCollision
 *   let controller = traversal.controller;           // was islandController
 *
 * The rest of index.js needs no change: `controller.spawnState` and
 * `controller.step` keep their signatures, `player.pos/vel/yaw/grounded/
 * wading` keep their meanings, and a save written by the old walk controller
 * still loads (normalize() upgrades it).
 *
 * RECOMMENDED, one line each:
 *
 *   step(dt)        traversal.stepWorld(dt, player);      // BEFORE controller.step
 *   step(dt)        dispatchTraversalEvent(player, fx, (k) => audio.play(k));
 *   draw()          applyRigFlags(player);                // before heroRig.update
 *   getPlayerState  ...traversal.toSave()                 // rafts in the save
 *   restore         traversal.fromSave(save?.overworld)
 *
 * INPUT (src/overworld/controls3d.js, owned elsewhere):
 *   setInput() must forward one new boolean, `dive`, which the swim mode reads
 *   to go under. Everything else already maps:
 *       stick     -> climb up/down and shimmy, glide steering, swim heading
 *       run       -> sprint, glide dive, fast swim
 *       jump      -> leap / deploy the canopy / let go of the wall / surface
 *   `jumpLabel(state)` above returns what the jump button should currently
 *   say. Until `dive` is wired the swim is a surface swim, which is complete
 *   and safe on its own — diving is the only thing that is missing.
 *
 * HUD (src/scenes/OverworldScene.js, owned elsewhere):
 *   import { createStaminaGauge } from '../overworld/traversalHud.js';
 *   this._stamina = createStaminaGauge(this);              // in _buildHud
 *   this._stamina.update(state, dt, heroScreenX, heroScreenY);  // in update
 *   this._stamina.destroy();                               // in shutdown
 *   The hero's screen point comes from the 3D side; until that projection is
 *   exposed, GAME_WIDTH/2 and GAME_HEIGHT*0.62 is a good stand-in — the ring
 *   is drawn around the hero and the hero is near the middle of the frame.
 *
 * FX (src/overworld/index.js):
 *   import { createTraversalFx, applyFogToTraversalFx } from './traversalFx.js';
 *   const fx = createTraversalFx({
 *     groundAt, routes: traversal.spec.routes, pads: traversal.spec.pads,
 *     thermals: traversal.spec.thermals, floatables: traversal.floatables,
 *   });
 *   scene.add(fx.group);            // BEFORE applyAerialFogToTree(scene)
 *   fx.update(heroDt, player, animT);   // in draw()
 *   fx.dispose();                       // in destroy()
 *   Seven draw calls, ~1.4k triangles, no post-processing, no depth reads.
 */
