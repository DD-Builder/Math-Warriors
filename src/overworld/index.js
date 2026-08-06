/**
 * Overworld assembly — the ONE module OverworldScene dynamically imports.
 *
 * createOverworld({ game, save, hooks }) wires the pure world modules
 * (heightfield -> collision -> controller) to the three.js modules (terrain,
 * sky, water, props) on the #mw-overworld canvas and hands the Phaser bridge
 * scene a small control surface.
 *
 * WHY the assembly lives here and nowhere else: every module below is either
 * pure logic with no three import (testable in plain Node) or a self-contained
 * visual subsystem that knows nothing about gameplay. The wiring — which
 * colliders exist, what the sun follows, when a portal prompt fires — is the
 * only code that needs to know about all of them, so it is the only code in
 * this file. Anything that could be pure logic belongs in a sibling.
 *
 * WHY the sun rides the player: the shadow map is 2048 over a ~70 unit ortho
 * box (≈7 cm/texel). That is console-class contact shadowing, and it is only
 * possible because the box never has to cover more than the player's
 * neighbourhood. A world-sized shadow frustum at this resolution would be mush.
 *
 * WHY the follow camera samples the ground under ITSELF: a boom that only
 * offsets from the player buries the camera inside every hill the player walks
 * along. Raising the eye to a floor of (terrain, water) + margin keeps the
 * horizon line — and therefore the composition — intact on a 50 m palace flank.
 *
 * WHY the day clock is quantised: timeOfDay() allocates a frame object, and
 * the update loops must not allocate. The clock advances every fixed step but
 * a new lighting frame is only built when the day has actually moved
 * (~0.5 s of wall time), then reused by reference by sky, water and the rig.
 *
 * Constraints honoured: three r170 package only, no post-processing, no
 * depth-texture reads, no fwidth tricks, InstancedMesh for everything
 * repeated, zero allocation in step()/draw(), every colour from PAPER, and
 * dispose() releases everything created here.
 */
import * as THREE from 'three';
import { createRenderer } from './renderer.js';
import { paperColor, PAPER } from './materials/toon.js';
import { applyAerialFogToTree, setAerialFrame } from './materials/aerialFog.js';
import { preloadPaperTextures, textureStats, disposePaperTextures } from './materials/textures.js';
import { WORLD, SPAWN } from './worldSpec.js';
import { createHeightfield } from './heightfield.js';
import { createCollisionWorld } from './collision.js';
import { createController, DEFAULT_TUNING } from './controller.js';
import { createTerrain } from './terrainMesh.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { createCharacterView } from './characterView.js';
import { createAtmosphere } from './atmosphere.js';
import { timeOfDay } from './timeOfDay.js';
import { WEATHER_NAMES, createWeatherBlender, createRenderFrame, applyWeather } from './weather.js';
import { fromSave } from './state.js';
import { POSES, poseByName } from './poses.js';

// Bright late morning: the world's default first impression.
const DEFAULT_TOD = 0.28;
// One full day over eight minutes of play — perceptible across a session,
// never distracting inside a single errand.
const DAY_SECONDS = 480;
// Rebuild the lighting frame only after the day has moved this far (~0.5 s).
const TOD_EPS = 0.001;

// Third-person boom.
//
// The numbers below are a CINEMATOGRAPHY rig, not a follow constraint. Each
// block buys one thing a fixed boom cannot:
//
//   dist/height     the base three-quarter framing.
//   distRun/fovRun  speed reads as speed. The boom eases back and the lens
//                   opens ~5 deg at a sprint, which widens the periphery and
//                   makes the ground rush — the single cheapest "this feels
//                   fast" trick there is, and it costs one projection rebuild.
//   lookAhead/lead  the frame leads the MOVEMENT direction, not the facing.
//                   Facing snaps the instant a thumb moves; velocity does not,
//                   so leading velocity puts the destination on screen without
//                   whipping the horizon every time the stick is nudged.
//   lerpY/yDead     vertical is damped HARDER than horizontal and ignores
//                   sub-deadband motion outright. The player's y follows the
//                   terrain sample exactly, so an undamped boom inherits every
//                   pebble; a child watching this for an hour should not be
//                   able to feel the ground texture through the camera.
//   clearance/minDist  a hill between eye and hero SHORTENS the boom before it
//                   raises it. Raising alone flattens the shot into a top-down
//                   as soon as the player hugs a slope, which is exactly where
//                   the composition matters most.
//   drift*          a still frame is never quite still. Two incommensurate
//                   sines at ~10 cm, faded in after a second of no input, so a
//                   paused game breathes instead of freezing into a screenshot.
const CAM = {
  dist: 11.5,
  distRun: 1.4,    // extra boom length at full sprint
  minDist: 4.2,    // never closer than this, however hard terrain pushes
  height: 6.0,
  lookAhead: 2.2,
  leadMax: 3.4,    // extra look-ahead along velocity at full sprint
  leadLerp: 0.07,
  lookUp: 1.5,
  minAbove: 2.6,   // eye floor above terrain/water under the camera itself
  clearance: 1.6,  // boom must clear the ground under it by this much
  boomSteps: 6,
  lerp: 0.12,
  lerpY: 0.055,
  yDead: 0.07,     // vertical error under this is simply ignored
  distIn: 0.34,    // shorten fast (a pop-through is unforgivable)…
  distOut: 0.055,  // …extend slowly (nobody should notice it happen)
  fov: 50,
  fovRun: 5.0,
  fovLerp: 0.045,
  driftAmp: 0.10,
  driftLook: 0.20,
  driftDelay: 0.9, // seconds of stillness before the drift fades in
  driftFade: 1.6,
};

const SHADOW_ORTHO = 70;
const SUN_DIST = 150;
// Ground-bounce fill: parked below the player and leaned toward the sun.
const BOUNCE_DIST = 90;
const BOUNCE_LEAN = 55;

// Pickup grab radius. Generous on purpose — a 5-year-old aims with a thumb.
const PICKUP_RADIUS = 1.6;
// Extra slack on the portal trigger so the prompt appears before the arch
// fills the screen.
const PORTAL_PAD = 2.2;

// Animation phase used while a pose is active. The rig's simTime depends on
// how long boot took, so a pose that fed it through would give coins, grass
// and clouds a different phase on every run — and a critique loop can only
// compare images that are actually comparable.
const POSE_TIME = 12;

export async function createOverworld({ game, save = null, hooks = {} }) {
  const rig = createRenderer({
    game,
    onContextLost: () => hooks.onContextLost?.(),
    onContextRestored: () => hooks.onContextRestored?.(),
  });
  const { renderer } = rig;

  // ── Shared paper surfaces ──────────────────────────────────────────────
  // Generated once, up front, before any material asks for one: the fibre and
  // tooth fields cost ~40 ms of CPU and are handed to a dozen materials by
  // reference, so paying for them here keeps the cost off whichever subsystem
  // happens to be built first.
  preloadPaperTextures();

  // ── World logic ────────────────────────────────────────────────────────
  const heightfield = createHeightfield(WORLD.SEED);
  const collisionWorld = createCollisionWorld(heightfield);
  const controller = createController(collisionWorld);

  // ── Scene + atmosphere ─────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = paperColor(PAPER.cream);
  // scene.fog exists ONLY to set the USE_FOG define on every material. The
  // near/far it carries are dead: materials/aerialFog.js has replaced three's
  // fog chunks with an exponential-squared + height-falloff model whose
  // parameters live in shared uniforms, not on the Fog object.
  scene.fog = new THREE.Fog(paperColor(PAPER.cream), 1, 600);

  // far 600 is the contract sky.js sizes its dome (480) and sun (360) against.
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);

  // ── Light rig (values are driven by timeOfDay + weather each frame) ────
  //
  // Three sources, and each one is doing a job the other two cannot:
  //   hemi    the sky as an area source — cool teal from above, biome ground
  //           colour from below. This is the fill that stops toon shading from
  //           collapsing into two flat tones.
  //   sun     the key. The only shadow caster; rides the player (see header).
  //   bounce  a low-intensity SECOND directional aimed UPWARD from beneath the
  //           player, tinted with the ground colour. A hemisphere light lifts
  //           undersides uniformly; a directional bounce lifts them with a
  //           direction, which is what makes the toon ramp put a lit STEP on
  //           the underside of a cliff or a canopy. That step is the whole
  //           difference between "flat cutout" and "layered paper with air
  //           under it", and it is the cheapest expensive-looking light in the
  //           rig — no shadow map, one extra ramp fetch.
  const hemi = new THREE.HemisphereLight(paperColor(PAPER.sky), paperColor(PAPER.sage), 0.6);
  scene.add(hemi);
  const bounce = new THREE.DirectionalLight(paperColor(PAPER.sage), 0.25);
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);
  const sun = new THREE.DirectionalLight(paperColor(PAPER.cream), 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_ORTHO;
  sun.shadow.camera.right = SHADOW_ORTHO;
  sun.shadow.camera.top = SHADOW_ORTHO;
  sun.shadow.camera.bottom = -SHADOW_ORTHO;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SUN_DIST * 2.2;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  // ── Visual subsystems ──────────────────────────────────────────────────
  const terrain = createTerrain(heightfield);
  scene.add(terrain.group);

  const sky = createSky({ camera, seed: WORLD.SEED });
  scene.add(sky.group);

  // water.group is the ocean disc plus any inland pools the terrain can hold.
  // The ocean disc rides the camera in x/z (like the sky dome) so its rim
  // always sits out in the haze instead of ending in mid-air.
  const water = createWater(heightfield, { camera });
  scene.add(water.group);

  const props = createProps(heightfield);
  scene.add(props.group);

  const atmosphere = createAtmosphere(heightfield, { seed: WORLD.SEED });
  scene.add(atmosphere.group);

  // ── Prop colliders ─────────────────────────────────────────────────────
  // Circles only, all forgiving: an arch is two pillars (you walk THROUGH the
  // opening — that is the whole point of a gate), a building is one disc well
  // inside its awnings, a tree is its trunk and not its canopy.
  for (const p of props.portals) {
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    for (const side of [-1, 1]) {
      const ox = side * p.pillarOffset;
      collisionWorld.addCollider({
        id: `${p.id}-pillar${side > 0 ? 'R' : 'L'}`,
        kind: 'circle',
        x: p.x + ox * c,
        z: p.z - ox * s,
        r: p.pillarRadius,
      });
    }
  }
  for (const b of props.buildings) {
    collisionWorld.addCollider({ id: `building-${b.id}`, kind: 'circle', x: b.x, z: b.z, r: b.r });
  }
  props.trees.forEach((t, i) => {
    collisionWorld.addCollider({ id: `tree-${i}`, kind: 'circle', x: t.x, z: t.z, r: t.r });
  });

  // ── Hero ───────────────────────────────────────────────────────────────
  // A paper-doll rig cut from the same stock as the world (characterView.js),
  // dressed from the party LEADER's class — the child's own chosen hero is the
  // one they walk around in, which is the entire reason the hub exists.
  // `fx` is a SIBLING of the hero group, not a child: dust is left behind on
  // the ground, not carried around on the character's hip.
  const heroView = createCharacterView({ leader: save?.party?.[0] ?? null });
  const hero = heroView.group;
  scene.add(hero);
  scene.add(heroView.fx);

  // ── Player state ───────────────────────────────────────────────────────
  const restored = fromSave(save?.overworld);
  let player = restored.pos
    ? controller.spawnState({ x: restored.pos.x, z: restored.pos.z, yaw: restored.yaw })
    : controller.spawnState(SPAWN);
  let lastPortalId = restored.portalId;

  const input = { x: 0, y: 0, jump: false, run: false };
  let jumpLatch = false;

  // ── Collectibles: hide what the save already granted ───────────────────
  const pending = [];
  const collectedIds = new Set(restored.collected);
  for (const c of props.collectibles) {
    if (collectedIds.has(c.id)) c.mesh.visible = false;
    else pending.push(c);
  }

  // ── Time of day + weather ──────────────────────────────────────────────
  //
  // The two combine into ONE render frame that every consumer reads: the light
  // rig, the sky dome, the water, the aerial fog and the rain/firefly layer.
  // Weather is a transform on the hour rather than an independent system (see
  // weather.js), which is why a change of weather relights the whole world in
  // agreement instead of one subsystem at a time.
  let todT = DEFAULT_TOD;
  let todFrozen = false;
  let frameT = NaN;
  /** The raw hour. Rebuilt (and allocating) only when the day actually moves. */
  let hourFrame = null;
  /** hour x weather, rewritten in place — never allocates. */
  const lightFrame = createRenderFrame();
  const weather = createWeatherBlender('clear');
  // Set whenever the blend moves, cleared once the frame has been recomposed.
  // A plain `weather.settled` check would skip the LAST step of a fade — the
  // one that lands on the target exactly.
  let weatherDirty = true;
  const _bg = scene.background;
  const _fog = scene.fog;
  // Foliage runs on its own clock so weather can drive the wind without
  // speeding up coins, portal pulses and petals along with it.
  let windTime = 0;

  function applyLight(frame) {
    sun.color.setHex(frame.sunColor);
    sun.intensity = frame.sunIntensity;
    hemi.color.setHex(frame.hemiSky);
    hemi.groundColor.setHex(frame.hemiGround);
    hemi.intensity = frame.hemiIntensity;
    bounce.color.setHex(frame.bounceColor);
    bounce.intensity = frame.bounceIntensity;
    _fog.color.setHex(frame.fogColor);
    _bg.setHex(frame.fogColor);
    setAerialFrame(frame);
  }

  /** Recompose the render frame. `force` skips the day-hasn't-moved guard. */
  function syncLight(force) {
    const dayMoved = force || Math.abs(todT - frameT) >= TOD_EPS;
    if (!dayMoved && !weatherDirty) return;
    if (dayMoved || !hourFrame) {
      frameT = todT;
      hourFrame = timeOfDay(todT);
    }
    weatherDirty = false;
    applyWeather(hourFrame, weather.params, lightFrame);
    applyLight(lightFrame);
  }
  syncLight(true);

  // ── Camera ─────────────────────────────────────────────────────────────
  const _camWant = new THREE.Vector3();
  const _camLook = new THREE.Vector3();
  const _size = new THREE.Vector2();
  /** @type {{pos:THREE.Vector3, look:THREE.Vector3}|null} */
  let poseCam = null;
  // Smoothed rig state. Scalars, not vectors: every one of these is a damped
  // 1-D quantity and keeping them unboxed is what makes updateCamera allocate
  // nothing at all.
  let camDist = CAM.dist;
  let leadX = 0;
  let leadZ = 0;
  let driftX = 0;
  let driftY = 0;
  let driftZ = 0;
  let speedN = 0;
  /** Seconds the player has been standing still — gates the idle drift. */
  let stillT = 0;
  /** Set when fov changes; draw() folds it into the one projection rebuild. */
  let fovDirty = false;

  /** Never let the eye sink into terrain (or under the ocean plane). */
  function liftAboveGround(v) {
    const gy = heightfield.sampleHeight(v.x, v.z);
    const floorY = (gy > WORLD.WATER_Y ? gy : WORLD.WATER_Y) + CAM.minAbove;
    if (v.y < floorY) v.y = floorY;
  }

  /**
   * How long the boom may be before terrain intrudes.
   *
   * Walks the boom line from the hero's chest out to the requested eye and
   * stops at the first sample whose ground (or ocean) is within `clearance` of
   * the line. Returns the surviving length, never below `minDist`.
   *
   * This runs BEFORE the eye-floor lift on purpose: shortening keeps the shot's
   * angle and loses only distance, while lifting keeps the distance and turns a
   * three-quarter view into a plan view. Given the choice, always shorten.
   */
  function boomLength(want, s, c) {
    const pivotY = player.pos.y + CAM.lookUp;
    const rise = player.pos.y + CAM.height - pivotY;
    let ok = 1 / CAM.boomSteps;
    for (let i = 1; i <= CAM.boomSteps; i++) {
      const t = i / CAM.boomSteps;
      const x = player.pos.x - s * want * t;
      const z = player.pos.z - c * want * t;
      const y = pivotY + rise * t;
      const gy = heightfield.sampleHeight(x, z);
      const floorY = (gy > WORLD.WATER_Y ? gy : WORLD.WATER_Y) + CAM.clearance;
      if (y < floorY) break;
      ok = t;
    }
    const d = want * ok;
    return d < CAM.minDist ? CAM.minDist : d;
  }

  function computeBoom(snap = false) {
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);

    const spd = Math.hypot(player.vel.x, player.vel.z);
    speedN = Math.min(1, spd / DEFAULT_TUNING.runSpeed);

    // Boom length: eased toward the terrain-resolved target, fast in and slow
    // out so a hill pops the camera in but never yanks it back out.
    const want = boomLength(CAM.dist + CAM.distRun * speedN, s, c);
    if (snap) camDist = want;
    else camDist += (want - camDist) * (want < camDist ? CAM.distIn : CAM.distOut);

    _camWant.set(
      player.pos.x - s * camDist,
      player.pos.y + CAM.height,
      player.pos.z - c * camDist,
    );
    liftAboveGround(_camWant);

    // Look-ahead leads VELOCITY where there is any and facing otherwise, so a
    // standing turn does not swing the whole frame around the hero.
    const lead = CAM.lookAhead + CAM.leadMax * speedN;
    const lx = spd > 0.05 ? (player.vel.x / spd) * lead : s * CAM.lookAhead;
    const lz = spd > 0.05 ? (player.vel.z / spd) * lead : c * CAM.lookAhead;
    leadX += (lx - leadX) * CAM.leadLerp;
    leadZ += (lz - leadZ) * CAM.leadLerp;
    _camLook.set(player.pos.x + leadX, player.pos.y + CAM.lookUp, player.pos.z + leadZ);
  }

  /** Idle drift, applied as a REMOVABLE offset so it can never accumulate. */
  function applyDrift(animT) {
    camera.position.x -= driftX;
    camera.position.y -= driftY;
    camera.position.z -= driftZ;
    const w = Math.max(0, Math.min(1, (stillT - CAM.driftDelay) / CAM.driftFade));
    if (w <= 0) {
      driftX = 0; driftY = 0; driftZ = 0;
      return;
    }
    driftX = Math.sin(animT * 0.37) * CAM.driftAmp * w;
    driftY = Math.sin(animT * 0.29 + 1.7) * CAM.driftAmp * 0.55 * w;
    driftZ = Math.cos(animT * 0.31 + 0.6) * CAM.driftAmp * w;
    camera.position.x += driftX;
    camera.position.y += driftY;
    camera.position.z += driftZ;
    _camLook.x += Math.sin(animT * 0.23 + 2.1) * CAM.driftLook * w;
    _camLook.y += Math.cos(animT * 0.19) * CAM.driftLook * 0.5 * w;
  }

  /** Lens: opens with speed. Poses hold the base focal length exactly. */
  function updateFov(target) {
    if (Math.abs(target - camera.fov) < 1e-3) return;
    camera.fov = target;
    fovDirty = true;
  }

  function updateCamera(animT) {
    if (poseCam) {
      updateFov(CAM.fov);
      camera.position.copy(poseCam.pos);
      liftAboveGround(camera.position);
      camera.lookAt(poseCam.look);
      return;
    }
    computeBoom();
    updateFov(camera.fov + (CAM.fov + CAM.fovRun * speedN - camera.fov) * CAM.fovLerp);

    // Horizontal tracks; vertical is damped and dead-banded (see CAM header).
    camera.position.x += (_camWant.x - camera.position.x) * CAM.lerp;
    camera.position.z += (_camWant.z - camera.position.z) * CAM.lerp;
    const dy = _camWant.y - camera.position.y;
    if (dy > CAM.yDead) camera.position.y += (dy - CAM.yDead) * CAM.lerpY;
    else if (dy < -CAM.yDead) camera.position.y += (dy + CAM.yDead) * CAM.lerpY;

    liftAboveGround(camera.position);
    applyDrift(animT);
    camera.lookAt(_camLook);
  }

  /** Hard-place the camera — boot, teleport and pose must never show a swing. */
  function snapCamera() {
    driftX = 0; driftY = 0; driftZ = 0;
    stillT = 0;
    updateFov(CAM.fov);
    if (poseCam) {
      camera.position.copy(poseCam.pos);
      liftAboveGround(camera.position);
      camera.lookAt(poseCam.look);
      return;
    }
    // Seed the smoothed boom/lead from the resting pose rather than lerping in.
    leadX = Math.sin(player.yaw) * CAM.lookAhead;
    leadZ = Math.cos(player.yaw) * CAM.lookAhead;
    computeBoom(true);
    camera.position.copy(_camWant);
    camera.lookAt(_camLook);
  }
  snapCamera();

  // ── Proximity triggers ─────────────────────────────────────────────────
  let nearPortal = null;
  let currentPose = null;

  /** Drop any live portal prompt (teleport/pose relocate the player). */
  function clearNearPortal() {
    if (!nearPortal) return;
    nearPortal = null;
    hooks.onPortalLeave?.();
  }

  function checkPortals() {
    let found = null;
    let best = Infinity;
    for (const p of props.portals) {
      const dx = player.pos.x - p.x;
      const dz = player.pos.z - p.z;
      const d2 = dx * dx + dz * dz;
      const reach = p.radius + PORTAL_PAD;
      if (d2 < reach * reach && d2 < best) { best = d2; found = p; }
    }
    if (found === nearPortal) return;
    nearPortal = found;
    if (found) hooks.onPortalNear?.(found);
    else hooks.onPortalLeave?.();
  }

  function checkCollectibles() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i];
      const dx = player.pos.x - c.x;
      const dz = player.pos.z - c.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      pending.splice(i, 1);
      collectedIds.add(c.id);
      c.mesh.visible = false;
      hooks.onCollect?.({ id: c.id, kind: c.kind, amount: c.amount });
    }
  }

  // ── Fixed-step simulation ──────────────────────────────────────────────
  function step(dt) {
    if (jumpLatch) { input.jump = true; jumpLatch = false; }
    player = controller.step(player, input, dt);
    input.jump = false;
    if (!todFrozen) {
      todT += dt / DAY_SECONDS;
      if (todT >= 1) todT -= 1;
    }
    if (weather.step(dt)) weatherDirty = true;
    windTime += dt * lightFrame.wind;
    // Stillness clock for the camera's idle drift. It lives here, on the fixed
    // step, so the fade-in takes the same wall time on any frame rate.
    const moving = player.vel.x !== 0 || player.vel.z !== 0 || !player.grounded;
    stillT = moving ? 0 : stillT + dt;
    checkPortals();
    checkCollectibles();
  }

  // ── Draw ───────────────────────────────────────────────────────────────
  let firstFrame = false;

  function draw(simTime) {
    renderer.getSize(_size);
    let projDirty = false;
    if (_size.y > 0) {
      const a = _size.x / _size.y;
      if (Math.abs(a - camera.aspect) > 1e-4) {
        camera.aspect = a;
        projDirty = true;
      }
    }

    syncLight(false);

    // Sun rides the player so the tight shadow ortho always covers what the
    // camera can see up close.
    const d = lightFrame.sunDir;
    sun.position.set(
      player.pos.x + d[0] * SUN_DIST,
      player.pos.y + d[1] * SUN_DIST,
      player.pos.z + d[2] * SUN_DIST,
    );
    sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
    sun.target.updateMatrixWorld();

    // Bounce comes from BELOW and slightly sunward: it is the key light coming
    // back off the ground, so it leans the way the ground was lit.
    bounce.position.set(
      player.pos.x + d[0] * BOUNCE_LEAN,
      player.pos.y - BOUNCE_DIST,
      player.pos.z + d[2] * BOUNCE_LEAN,
    );
    bounce.target.position.set(player.pos.x, player.pos.y, player.pos.z);
    bounce.target.updateMatrixWorld();

    // A frozen pose pins the animation phase; live play uses the sim clock.
    // The wind clock is scaled by the weather, and a pose reproduces that
    // scaling from a constant so a "rain" screenshot still shows whipped
    // foliage while staying pixel-identical between runs.
    const animT = currentPose ? POSE_TIME : simTime;
    const windT = currentPose ? POSE_TIME * lightFrame.wind : windTime;

    // The rig moves the hero group itself (position, facing AND every joint),
    // and it needs the ground under the player for the contact shadow — the one
    // altitude cue a child has mid-jump.
    heroView.update(player, animT, heightfield.sampleHeight(player.pos.x, player.pos.z));

    updateCamera(animT);
    if (fovDirty) { fovDirty = false; projDirty = true; }
    if (projDirty) camera.updateProjectionMatrix();

    sky.update(lightFrame, animT);
    water.update(lightFrame, animT);
    props.update(animT, player.pos, windT);
    atmosphere.update(lightFrame, animT, player.pos, camera);

    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      hooks.onFirstFrame?.();
    }
  }

  rig.setLoop(step, draw);

  // ── Debug / determinism API — the screenshot critique loop drives this ──
  const api = {
    ready: false,
    freeze(on = true) { rig.setFrozen(on); },
    teleport(x, z, yaw = 0) {
      poseCam = null;
      player = controller.spawnState({ x, z, yaw });
      clearNearPortal();
      heroView.reset();
      snapCamera();
      api.renderOnce();
    },
    renderOnce() { rig.renderOnce(); },
    stats() { return { ...rig.stats(), simTime: rig.simTime }; },

    /** Freeze the day at t and relight immediately. */
    setTimeOfDay(t) {
      todT = ((t % 1) + 1) % 1;
      todFrozen = true;
      syncLight(true);
      api.renderOnce();
      return todT;
    },
    /** Let the day drift again from wherever it is. */
    resumeTimeOfDay() { todFrozen = false; },
    getTimeOfDay() { return todT; },
    /** 0 (broad day) .. 1 (deep night) at the current hour. */
    isNight() { return lightFrame.night >= 0.5; },

    WEATHER: WEATHER_NAMES,
    /**
     * Change the weather. `instant` snaps the blend — the screenshot harness
     * must use it, because a cross-fade in progress is a different frame on
     * every machine.
     * @returns {string|null} the accepted target, or null for an unknown name
     */
    setWeather(name, instant = true) {
      const got = weather.set(name, instant);
      if (got == null) return null;
      weatherDirty = true;
      syncLight(true);
      api.renderOnce();
      return got;
    },
    getWeather() {
      return { name: lightFrame.weather, target: weather.target, blend: weather.blend };
    },

    POSES: POSES.map((p) => p.name),
    getPose() { return currentPose; },
    /**
     * Deterministically place player AND camera, freeze both clocks, render.
     * Returns the pose so a harness can log what it shot.
     */
    setPose(name) {
      const pose = poseByName(name);
      if (!pose) return null;
      currentPose = pose.name;
      player = controller.spawnState({ x: pose.playerPos.x, z: pose.playerPos.z, yaw: pose.yaw });
      clearNearPortal();
      todT = pose.tod;
      todFrozen = true;
      // Snapped, never faded: a pose is a contract that two runs produce the
      // same pixels, and a weather cross-fade in flight would break it.
      weather.set(pose.weather || 'clear', true);
      weatherDirty = true;
      syncLight(true);
      if (pose.camPos) {
        if (!poseCam) poseCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
        poseCam.pos.set(pose.camPos.x, pose.camPos.y, pose.camPos.z);
        const look = pose.camLook || { x: pose.playerPos.x, y: 1.4, z: pose.playerPos.z };
        poseCam.look.set(look.x, look.y, look.z);
      } else {
        poseCam = null;
      }
      // Canonical idle: without this a pose would inherit whatever mid-stride
      // phase, squash and dust the player happened to be carrying, and two runs
      // of the same pose would not be the same image.
      heroView.reset();
      rig.setFrozen(true);
      snapCamera();
      rig.renderOnce();
      return pose;
    },
    /** Drop the pose camera and hand control back to the follow boom. */
    clearPose() {
      currentPose = null;
      poseCam = null;
      todFrozen = false;
      rig.setFrozen(false);
      heroView.reset();
      snapCamera();
    },

    worldStats() {
      return {
        terrain: { chunks: terrain.chunkCount, triangles: terrain.triangleCount },
        atmosphere: atmosphere.stats,
        props: props.stats,
        hero: heroView.stats,
        colliders: props.trees.length + props.buildings.length + props.portals.length * 2,
        // Live, not the boot snapshot: a critique run wants to know what is
        // actually resident, including anything generated after boot.
        textures: textureStats(),
      };
    },
  };
  // Live view of the controller state — the state object is REPLACED every
  // step (controller.step is pure), so this must be a getter, not a copy.
  Object.defineProperty(api, '_state', { get: () => player, enumerable: true });
  if (typeof window !== 'undefined') window.__MW_OVERWORLD = api;

  // ── Seal the atmosphere ────────────────────────────────────────────────
  // toonMaterial() already fogs every LIT surface as it is built. This sweep
  // catches the rest — the MeshBasicMaterial banners and pages in props.js,
  // the hero's shadow blob, and water.js's hand-written ShaderMaterial — so
  // there is exactly one atmosphere in the scene and no material can quietly
  // opt out of it. Idempotent, and it must run before the first render (three
  // resolves onBeforeCompile at program-compile time).
  applyAerialFogToTree(scene);

  rig.setVisible(true);
  rig.start();
  api.ready = true;
  hooks.onReady?.();

  return {
    api,
    setInput({ x = 0, y = 0, jump = false, run = false }) {
      input.x = x;
      input.y = y;
      input.run = !!run;
      if (jump) jumpLatch = true;
    },
    /** Current player transform, for save writing. */
    getPlayerState() {
      return {
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        yaw: player.yaw,
        portalId: lastPortalId,
        collected: [...collectedIds],
      };
    },
    /** Scene records which gate the player last stepped through. */
    notePortalUsed(id) { lastPortalId = id || null; },
    /** The portal the player is standing in, or null. */
    getNearPortal() { return nearPortal; },
    pause() { rig.stop(); },
    resume() { rig.start(); },
    setVisible(v) { rig.setVisible(v); },
    dispose() {
      rig.dispose();
      scene.remove(
        terrain.group, sky.group, water.group, props.group, atmosphere.group,
        hero, heroView.fx,
      );
      terrain.dispose();
      sky.dispose();
      water.dispose();
      props.dispose();
      atmosphere.dispose();
      heroView.dispose();
      // Shared textures are owned here, not by the subsystems that borrow
      // them, so they are released exactly once — after every material that
      // referenced them is already gone. The cache repopulates on demand, so a
      // second createOverworld() boots clean.
      disposePaperTextures();
      pending.length = 0;
      if (typeof window !== 'undefined' && window.__MW_OVERWORLD === api) delete window.__MW_OVERWORLD;
    },
  };
}
