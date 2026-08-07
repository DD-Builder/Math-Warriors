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
 * WHY the sun rides the player: the shadow map is 2048 over a <=58 unit ortho
 * box (<=5.7 cm/texel, tightening to ~3 cm as the sun drops — see fitShadow).
 * That is console-class contact shadowing, and it is only possible because the
 * box never has to cover more than the player's neighbourhood. A world-sized
 * shadow frustum at this resolution would be mush.
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
import { applyAerialFogToTree, setAerialFrame, setAerialTime } from './materials/aerialFog.js';
import { preloadPaperTextures, textureStats, disposePaperTextures } from './materials/textures.js';
import { WORLD, SPAWN } from './worldSpec.js';
import { createHeightfield } from './heightfield.js';
import { createCollisionWorld } from './collision.js';
import { createController, DEFAULT_TUNING } from './controller.js';
import { createTerrain } from './terrainMesh.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { createHeroRig } from './heroRig.js';
import { buildLevel3D } from './level3d.js';
import { TILE_M } from './level3dBuild.js';
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
//
// THE FRAMING (rewritten): the previous boom sat 11.5 m back and 6 m up on a
// 1.72 m character, which put the hero at ~13% of frame height — a speck in a
// landscape photograph, not a character you are playing. The numbers below are
// Odyssey/TotK third-person framing: close enough that the face, the cape and
// the silhouette all read, far enough that the next platform is on screen.
//
//   6.4 m back, 3.0 m up, looking at the chest (1.15 m) is a 16 degree
//   downward pitch. At 50 deg vertical FOV the visible slab at the hero's
//   distance is ~6.2 m tall, so a 1.72 m hero occupies ~28% of frame height.
//   That is the number that makes a character read as a character.
//
// Everything shrank in proportion: look-ahead (a close camera must lead LESS
// or the hero slides off the bottom of frame), the terrain clearance, and the
// eye floor. minDist dropped to 3.0 so a hill can still shorten the boom
// meaningfully before it has to start raising it.
const CAM = {
  dist: 6.4,
  distRun: 1.1,    // extra boom length at full sprint
  minDist: 3.0,    // never closer than this, however hard terrain pushes
  height: 3.0,
  lookAhead: 1.3,
  leadMax: 1.8,    // extra look-ahead along velocity at full sprint
  leadLerp: 0.07,
  lookUp: 1.15,    // chest height on a 1.72 m hero
  minAbove: 1.1,   // eye floor above terrain/water under the camera itself
  clearance: 0.8,  // boom must clear the ground under it by this much
  boomSteps: 6,
  lerp: 0.16,
  lerpY: 0.075,
  yDead: 0.05,     // vertical error under this is simply ignored
  distIn: 0.34,    // shorten fast (a pop-through is unforgivable)…
  distOut: 0.055,  // …extend slowly (nobody should notice it happen)
  fov: 50,
  fovRun: 5.0,
  fovLerp: 0.045,
  driftAmp: 0.06,
  driftLook: 0.12,
  driftDelay: 0.9, // seconds of stillness before the drift fades in
  driftFade: 1.6,
  // When the boom is squeezed by something solid, the eye RISES as it comes
  // in. Shortening alone is not enough inside a hedge maze: the wall behind
  // the player is 4 m of solid geometry, and a camera that only pulls in ends
  // up inside it. Rising as it pulls in turns that failure into the shot you
  // actually want — a high, close over-the-shoulder that sees over the hedge.
  squeezeLift: 2.6,
};

/** Hero standing height, metres. Everything in CAM is framed against this. */
const HERO_HEIGHT = 1.72;

/**
 * The rig's RESTING elevation, in radians above the look-at pivot, derived
 * from the framing above rather than authored twice. At zero orbit pitch the
 * boom reproduces CAM.height exactly (lookUp + dist*tan(BASE_ELEV) == height),
 * so adding player-driven pitch is a pure offset on top of the authored shot.
 */
const BASE_ELEV = Math.atan2(CAM.height - CAM.lookUp, CAM.dist);
/** Hard elevation stops. Below level the eye starts clipping the hero's feet;
 *  above ~66 deg the shot is a plan view and the horizon is gone. */
const ELEV_MIN = -0.10;
const ELEV_MAX = 1.15;

/**
 * Controls (rewritten). The stick used to drive WORLD axes: "up" was always
 * world -Z regardless of where the camera was looking, while the camera itself
 * rides the hero's facing. Push up, walk north, watch the camera swing — that
 * is the "abysmal" feel. Movement is now CAMERA-RELATIVE: up on the stick is
 * always away from the eye, which is the only scheme a five-year-old can hold
 * in their head, and the one every third-person game has shipped for 25 years.
 *
 * The controller's turn rate went up with it, because a close camera makes a
 * lazy turn look like the hero is skating.
 *
 * The camera is no longer welded to the hero's facing either. OverworldScene
 * owns the ORBIT (controls3d.js: right-half drag, pinch, inertia, slow
 * auto-recentre) and pushes it here through setCameraOrbit as three absolute
 * numbers — yaw, pitch offset, boom multiplier. Until it does, orbitActive
 * stays false and the rig behaves exactly as it always did, so a caller that
 * never calls setCameraOrbit (a pose shot, an e2e harness) is unaffected.
 */
const TURN_RATE = 15;

const SHADOW_ORTHO = 58;
/** Elevation floor for the SHADOW camera only (~20°). See fitShadow(). */
const SHADOW_MIN_Y = 0.34;
const SUN_DIST = 150;
// Ground-bounce fill: parked below the player and leaned toward the sun.
const BOUNCE_DIST = 90;
const BOUNCE_LEAN = 55;

// Pickup grab radius. Generous on purpose — a 5-year-old aims with a thumb.
const PICKUP_RADIUS = 1.6;
// Extra slack on the portal trigger so the prompt appears before the arch
// fills the screen.
const PORTAL_PAD = 2.2;
// The context ACTION button announces an interactable this many trigger-radii
// out, so the word is already on screen by the time the player arrives.
const ACTION_RING = 1.9;

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
  //
  // There are TWO places the player can be — the island hub and a floor — and
  // each has its own ground, its own colliders and therefore its own collision
  // world and controller. `collisionWorld` / `controller` / `groundAt` are the
  // ACTIVE pair; enterFloor swaps them and exitFloor swaps them back. The
  // island's pair is never torn down, so returning is instant.
  const heightfield = createHeightfield(WORLD.SEED);
  const islandCollision = createCollisionWorld(heightfield);
  const islandController = createController(islandCollision, { ...DEFAULT_TUNING, turnRate: TURN_RATE });
  let collisionWorld = islandCollision;
  let controller = islandController;
  /** Ground sampler for whichever place is active — camera + shadow read this. */
  let groundAt = (x, z) => heightfield.sampleHeight(x, z);
  /** Water plane for the eye-floor test. A floor has no ocean under it. */
  let waterLevel = WORLD.WATER_Y;
  /**
   * The open floor, or null on the island. Declared HERE, far above the floor
   * machinery that fills it, because the camera rig below reads it on its very
   * first frame (snapCamera runs during boot) and a `let` further down would
   * be in its temporal dead zone at that point.
   * @type {null | {id:number, lvl:object, collision:object, controller:object}}
   */
  let floor = null;

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
  //           colour from below. Nothing ramps it, so it alone decides how
  //           deep a shadow is allowed to go, and it is deliberately run at
  //           roughly a fifth of the key rather than half of it. It exists to
  //           keep a shaded surface INSIDE the palette, not to make it
  //           comfortable: a fill that lifts the shade side to half the lit
  //           side is a fill that has erased every form in the frame.
  //   sun     the key. The only shadow caster; rides the player (see header).
  //   bounce  a low-intensity SECOND directional aimed UPWARD from beneath the
  //           player, tinted with the ground colour. A hemisphere light lifts
  //           undersides uniformly; a directional bounce lifts them with a
  //           direction, which is what makes the toon ramp put a lit STEP on
  //           the underside of a cliff or a canopy. That step is the whole
  //           difference between "flat cutout" and "layered paper with air
  //           under it", and it is the cheapest expensive-looking light in the
  //           rig — no shadow map, one extra ramp fetch.
  //
  // The three intensities below are start values only — applyLight() overwrites
  // them from the composed frame every time the hour or the weather moves. They
  // are kept in step with timeOfDay.js's daylight keys so a frame rendered
  // before the first syncLight is not lit differently from one after it. The
  // KEY:FILL ratio they encode is the one documented in timeOfDay.js: fill at
  // roughly a fifth of the key, not half of it.
  const hemi = new THREE.HemisphereLight(paperColor(PAPER.sky), paperColor(PAPER.sage), 0.32);
  scene.add(hemi);
  const bounce = new THREE.DirectionalLight(paperColor(PAPER.sage), 0.14);
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);
  const sun = new THREE.DirectionalLight(paperColor(PAPER.cream), 1.42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_ORTHO;
  sun.shadow.camera.right = SHADOW_ORTHO;
  sun.shadow.camera.top = SHADOW_ORTHO;
  sun.shadow.camera.bottom = -SHADOW_ORTHO;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SUN_DIST * 2.2;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;   // rescaled per frame — see fitShadow()
  scene.add(sun);
  scene.add(sun.target);

  // ── Decoupling the shadow direction from the light direction ───────────
  //
  // At dusk the key light sits at 13° elevation. Projected from there, a
  // 6.8 cm shadow texel lands as a ~44 cm smear on the ground, and every cast
  // shadow in the frame turns into a hard-edged polygonal slab that has
  // visibly come adrift from whatever cast it. That was the single worst thing
  // in the dusk frames, and it is a SAMPLING problem, not a lighting one: the
  // art wants a low warm key AND crisp contact shadows, and those two wants
  // are only in conflict if one direction has to serve both.
  //
  // So they don't. Shading keeps the true low sun. The shadow camera is built
  // from a LIFTED copy of that direction (elevation floored at ~20°), which
  // costs a little shadow-length honesty — nobody has ever noticed a dusk
  // shadow being shorter than trigonometry demands — and buys texel density
  // back across the entire low-sun half of the day.
  //
  // three drives the shadow camera from `light.matrixWorld` and
  // `light.target.matrixWorld` and reads nothing else off the light, so the
  // whole decoupling is: hand LightShadow.updateMatrices a stand-in whose two
  // matrices carry the lifted geometry. Pinned to r170 by TECH LAW, and the
  // seam it depends on is the documented signature of that method.
  const _shadowProxy = {
    matrixWorld: new THREE.Matrix4(),
    target: { matrixWorld: new THREE.Matrix4() },
  };
  const _baseUpdateMatrices = sun.shadow.updateMatrices.bind(sun.shadow);
  sun.shadow.updateMatrices = () => _baseUpdateMatrices(_shadowProxy);
  /** Half-extent currently baked into the shadow ortho projection. */
  let shadowOrtho = 0;

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
    islandCollision.addCollider({ id: `tree-${i}`, kind: 'circle', x: t.x, z: t.z, r: t.r });
  });

  // ── Hero ───────────────────────────────────────────────────────────────
  // The REAL hero: heroRig.js traces the party leader's papercut art out of
  // data/heroArt.js and extrudes it, so the figure walking around the world is
  // the same character the child picked in Party Select — not a stand-in. A
  // corrupt or empty save resolves to that class's flagship rather than
  // throwing (see resolveHeroId), so the avatar can never be lost.
  const heroRig = createHeroRig(save?.party?.[0] ?? null, { height: HERO_HEIGHT });
  const hero = heroRig.group;
  scene.add(hero);

  // ── Player state ───────────────────────────────────────────────────────
  const restored = fromSave(save?.overworld);
  let player = restored.pos
    ? controller.spawnState({ x: restored.pos.x, z: restored.pos.z, yaw: restored.yaw })
    : controller.spawnState(SPAWN);
  let lastPortalId = restored.portalId;

  const input = { x: 0, y: 0, jump: false, run: false, world: false };
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

  /**
   * Aim and SIZE the shadow camera for this frame. See the decoupling note at
   * the light rig. Allocation-free; the projection is only rebuilt when the
   * box actually resizes, which is a handful of times across a whole day.
   *
   * Two things happen here that a fixed shadow rig cannot do:
   *
   * 1. The camera is placed along a LIFTED direction, so grazing light never
   *    stretches a texel into a slab.
   * 2. The box SHRINKS as the true sun drops. A low sun only lights the near
   *    ground in a way a child can read anyway, so spending the same 2048 map
   *    on half the footprint doubles the density exactly when it is needed.
   *
   * normalBias then follows the box rather than sitting at a constant: bias is
   * a distance, the thing it has to out-run is a texel, and a texel is only a
   * fixed number of metres if the box is. A constant is what leaves shadows
   * either acne-flecked at one hour or peter-panned away from their casters at
   * another — and detached shadows were exactly the complaint.
   */
  function fitShadow(dir) {
    const up = dir[1];
    const ly = up > SHADOW_MIN_Y ? up : SHADOW_MIN_Y;
    const inv = 1 / (Math.hypot(dir[0], ly, dir[2]) || 1);
    _shadowProxy.matrixWorld.setPosition(
      player.pos.x + dir[0] * inv * SUN_DIST,
      player.pos.y + ly * inv * SUN_DIST,
      player.pos.z + dir[2] * inv * SUN_DIST,
    );
    _shadowProxy.target.matrixWorld.setPosition(player.pos.x, player.pos.y, player.pos.z);

    // Quantised so a slow sunrise cannot rebuild the projection every frame.
    const wantRaw = SHADOW_ORTHO * Math.min(1, Math.max(0.52, up / 0.62));
    const want = Math.round(wantRaw * 4) / 4;
    if (want !== shadowOrtho) {
      shadowOrtho = want;
      const cam = sun.shadow.camera;
      cam.left = -want;
      cam.right = want;
      cam.top = want;
      cam.bottom = -want;
      cam.updateProjectionMatrix();
      // 2 * half-extent / mapSize == world metres per shadow texel.
      const perTexel = (want * 2) / sun.shadow.mapSize.x;
      sun.shadow.normalBias = Math.min(0.14, Math.max(0.02, perTexel * 2.0));
    }
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
  // Player-driven orbit, pushed in by OverworldScene/controls3d. `orbitActive`
  // is the opt-in: until the scene speaks, the boom rides the hero's facing
  // exactly as before.
  let orbitActive = false;
  let orbitYaw = 0;
  let orbitPitch = 0;
  let orbitZoom = 1;
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
    const gy = groundAt(v.x, v.z);
    const floorY = (gy > waterLevel ? gy : waterLevel) + CAM.minAbove;
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
  /**
   * True where the boom may not pass. On the island this is nothing — the
   * heightfield IS the world and the ground test above already covers it. In
   * a floor the walls are separate architecture that the height sampler knows
   * nothing about, so without this the camera sits inside the hedge every time
   * the player's back is to one, which on a spawn tile is always.
   *
   * Tile lookup, not a collider scan: O(1) per sample instead of O(walls), and
   * the tile grid is the same authority the walls were built from.
   */
  function boomBlocked(x, z) {
    if (!floor) return false;
    const lv = floor.lvl.level;
    const tx = Math.floor(x / TILE_M + lv.width / 2);
    const ty = Math.floor(z / TILE_M + lv.height / 2);
    // Off the edge of the floor is "blocked": there is nothing out there to
    // look through, and a boom that leaves the level frames the void.
    if (tx < 0 || ty < 0 || tx >= lv.width || ty >= lv.height) return true;
    // Walls only. Liquid does not block the eye — looking across a moat is a
    // shot, looking through a hedge is a bug.
    return lv.code[ty][tx] === 'W';
  }

  function boomLength(want, s, c, rise) {
    const pivotY = player.pos.y + CAM.lookUp;
    let ok = 1 / CAM.boomSteps;
    for (let i = 1; i <= CAM.boomSteps; i++) {
      const t = i / CAM.boomSteps;
      const x = player.pos.x - s * want * t;
      const z = player.pos.z - c * want * t;
      const y = pivotY + rise * t;
      const gy = groundAt(x, z);
      const floorY = (gy > waterLevel ? gy : waterLevel) + CAM.clearance;
      if (y < floorY || boomBlocked(x, z)) break;
      ok = t;
    }
    const d = want * ok;
    return d < CAM.minDist ? CAM.minDist : d;
  }

  function computeBoom(snap = false) {
    // The eye orbits where the PLAYER pointed it. Only when no orbit has ever
    // been pushed does it fall back to riding the hero's facing.
    const yawUse = orbitActive ? orbitYaw : player.yaw;
    const s = Math.sin(yawUse);
    const c = Math.cos(yawUse);

    const spd = Math.hypot(player.vel.x, player.vel.z);
    speedN = Math.min(1, spd / DEFAULT_TUNING.runSpeed);

    // Elevation: the authored resting angle plus whatever the player dragged.
    // Expressed as an angle rather than a height so the shot keeps its framing
    // as the boom shortens against a hill.
    let elev = BASE_ELEV + (orbitActive ? orbitPitch : 0);
    if (elev < ELEV_MIN) elev = ELEV_MIN;
    else if (elev > ELEV_MAX) elev = ELEV_MAX;
    const tanE = Math.tan(elev);

    // Boom length: eased toward the terrain-resolved target, fast in and slow
    // out so a hill pops the camera in but never yanks it back out. Pinch zoom
    // scales the REQUEST, so terrain still gets the last word.
    const reach = (CAM.dist + CAM.distRun * speedN) * (orbitActive ? orbitZoom : 1);
    const want = boomLength(reach, s, c, reach * tanE);
    if (snap) camDist = want;
    else camDist += (want - camDist) * (want < camDist ? CAM.distIn : CAM.distOut);

    // Squeeze lift: how much of the requested boom the world took away, turned
    // into height. At full squeeze this is a close, high, looking-down shot —
    // which is the readable answer to "your back is against a hedge", and the
    // one thing a pure pull-in cannot give.
    const squeeze = reach > 0 ? Math.max(0, Math.min(1, 1 - camDist / reach)) : 0;

    _camWant.set(
      player.pos.x - s * camDist,
      player.pos.y + CAM.lookUp + camDist * tanE + squeeze * CAM.squeezeLift,
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

  /** Strip last frame's idle drift so the damping filter never sees it. */
  function peelDrift() {
    camera.position.x -= driftX;
    camera.position.y -= driftY;
    camera.position.z -= driftZ;
    driftX = 0; driftY = 0; driftZ = 0;
  }

  /**
   * Idle drift, ADDED as a pure offset after the boom has been damped.
   *
   * WHY it is peeled off first (peelDrift) instead of being subtracted here:
   * the drift is decoration, not tracking error. Leaving it on the position
   * while the lerp runs makes the filter chase it — the lerp eats `k` of the
   * offset every frame, so the authored 10 cm arrived as ~9 cm carrying a
   * phase lag that grew with the damping constant. Peel, damp, then add: the
   * number in CAM.driftAmp is now the amplitude that reaches the screen.
   */
  function addDrift(animT) {
    const w = Math.max(0, Math.min(1, (stillT - CAM.driftDelay) / CAM.driftFade));
    if (w <= 0) return;
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
    peelDrift();
    computeBoom();
    updateFov(camera.fov + (CAM.fov + CAM.fovRun * speedN - camera.fov) * CAM.fovLerp);

    // Horizontal tracks; vertical is damped and dead-banded (see CAM header).
    camera.position.x += (_camWant.x - camera.position.x) * CAM.lerp;
    camera.position.z += (_camWant.z - camera.position.z) * CAM.lerp;
    const dy = _camWant.y - camera.position.y;
    if (dy > CAM.yDead) camera.position.y += (dy - CAM.yDead) * CAM.lerpY;
    else if (dy < -CAM.yDead) camera.position.y += (dy + CAM.yDead) * CAM.lerpY;

    addDrift(animT);
    // The floor check gets the LAST word, after the drift: a 10 cm decorative
    // dip must never be what puts the eye inside a hillside.
    liftAboveGround(camera.position);
    camera.lookAt(_camLook);
  }

  /** Hard-place the camera — boot, teleport and pose must never show a swing. */
  function snapCamera() {
    driftX = 0; driftY = 0; driftZ = 0;
    stillT = 0;
    // A hard place is also a re-anchor: entering a floor or teleporting must
    // put the eye BEHIND the hero, not at whatever heading the island orbit
    // happened to be left on. The scene resyncs its own orbit state from
    // getCameraYaw() right afterwards.
    orbitYaw = player.yaw;
    orbitPitch = 0;
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

  // ── THE FLOOR: a level as a 3D place ───────────────────────────────────
  //
  // Walking into a portal no longer leaves the 3D world for the 2D maze. The
  // floor is BUILT here (level3d.js) and swapped in: its own collision world,
  // its own controller, its own ground sampler. The island is not destroyed —
  // its meshes are only hidden and its player state parked — so coming back
  // out of a floor costs a visibility flip and nothing else.
  //
  // This module owns geometry, collision and proximity. It owns NO game rules:
  // every trigger is handed up through hooks.onFloorTrigger and the scene
  // answers with floorRules.js, the same module MazeScene answers with.
  let parkedIsland = null;
  /** Object ids the player is currently standing inside — edge-triggered. */
  const insideIds = new Set();
  /**
   * The nearest interactable's type, or null. Label fuel for the context
   * ACTION button (controls3d.actionLabel maps it to ENTER / OPEN / TALK) and
   * nothing else — it must never gate a rule.
   */
  let nearActionKind = null;
  /** While true the stick is ignored and no trigger fires (a modal is up). */
  let inputLocked = false;

  function enterFloor(floorId) {
    if (floor) return null;
    const lvl = buildLevel3D(floorId, { castShadow: true });
    const fCollision = createCollisionWorld({
      sampleHeight: lvl.sampleHeight,
      sampleNormal: lvl.sampleNormal,
    });
    for (const c of lvl.colliders) fCollision.addCollider(c);
    const fController = createController(fCollision, { ...DEFAULT_TUNING, turnRate: TURN_RATE });

    // Park the island: state kept, meshes hidden, nothing disposed.
    parkedIsland = { player, camPos: camera.position.clone() };
    terrain.group.visible = false;
    water.group.visible = false;
    props.group.visible = false;
    atmosphere.group.visible = false;
    clearNearPortal();

    scene.add(lvl.group);
    // Only the level's own materials need the atmosphere seal — the rest of
    // the scene was sealed at boot and applyAerialFogToTree is idempotent.
    applyAerialFogToTree(lvl.group);

    collisionWorld = fCollision;
    controller = fController;
    groundAt = lvl.sampleHeight;
    // A floor has no ocean. Parking the plane far below stops the eye-floor
    // test from lifting the camera to y=0 inside a level that sits at y=1.
    waterLevel = -1e4;
    floor = { id: floorId, lvl, collision: fCollision, controller: fController };
    insideIds.clear();

    player = fController.spawnState({ x: lvl.spawn.x, z: lvl.spawn.z, yaw: lvl.spawn.yaw });
    heroRig.reset();
    snapCamera();
    return {
      floorId,
      level: lvl.level,
      objects: lvl.objects,
      bounds: lvl.bounds,
      theme: lvl.theme.key,
      stats: lvl.stats,
    };
  }

  function exitFloor() {
    if (!floor) return false;
    scene.remove(floor.lvl.group);
    floor.lvl.dispose();
    floor = null;
    insideIds.clear();

    terrain.group.visible = true;
    water.group.visible = true;
    props.group.visible = true;
    atmosphere.group.visible = true;

    collisionWorld = islandCollision;
    controller = islandController;
    groundAt = (x, z) => heightfield.sampleHeight(x, z);
    waterLevel = WORLD.WATER_Y;

    // Back at the portal the player walked into, facing away from it.
    if (parkedIsland) {
      player = parkedIsland.player;
      parkedIsland = null;
    }
    heroRig.reset();
    snapCamera();
    return true;
  }

  /** Remove a set of collider ids from the ACTIVE floor's collision world. */
  function retract(ids) {
    if (!floor) return 0;
    for (const id of ids) floor.collision.removeCollider(id);
    return ids.length;
  }

  /**
   * Edge-triggered proximity over the floor's objects. Fires once on entry and
   * re-arms only after the player has left the radius, so standing on a gate
   * cannot re-ask the same question every frame.
   */
  function checkFloorTriggers() {
    const objs = floor.lvl.objects;
    // Nearest interactable inside the ANNOUNCE ring (a little wider than the
    // trigger ring). It drives nothing but the context button's label — the
    // triggers themselves stay edge-fired on contact, exactly as before.
    let bestKind = null;
    let bestD2 = Infinity;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.consumed || (o.hidden && o.mesh && !o.mesh.visible)) { insideIds.delete(o.id); continue; }
      const dx = player.pos.x - o.x;
      const dz = player.pos.z - o.z;
      const r = o.radius;
      const ar = r * ACTION_RING;
      const d2 = dx * dx + dz * dz;
      if (d2 <= ar * ar && d2 < bestD2) {
        bestD2 = d2;
        bestKind = (o.data && o.data.type) || o.type || null;
      }
      const near = d2 <= r * r;
      if (!near) { insideIds.delete(o.id); continue; }
      if (insideIds.has(o.id)) continue;
      insideIds.add(o.id);
      hooks.onFloorTrigger?.(o);
      // One trigger per frame: the scene may have opened a modal, and two
      // stacked prompts is how a five-year-old loses the plot.
      if (inputLocked) { nearActionKind = bestKind; return; }
    }
    nearActionKind = bestKind;
  }

  // ── Fixed-step simulation ──────────────────────────────────────────────
  //
  // Camera-relative input. `input` holds the raw stick; `_worldInput` is that
  // stick rotated into world space by the camera's yaw, which is what the
  // controller consumes. See the TURN_RATE note above.
  //
  // A caller that has ALREADY resolved the stick against the camera (which
  // controls3d.js does, because its acceleration filter has to run in world
  // space or a camera swing would fight the hero's momentum) sets
  // `input.world` and the rotation below is skipped. Rotating twice would
  // double every camera turn into the movement — a spin, not a walk.
  const _worldInput = { x: 0, y: 0, jump: false, run: false };

  function toWorldInput() {
    if (input.world) {
      _worldInput.x = inputLocked ? 0 : input.x;
      _worldInput.y = inputLocked ? 0 : input.y;
      _worldInput.run = !inputLocked && input.run;
      _worldInput.jump = !inputLocked && input.jump;
      return _worldInput;
    }
    const dx = player.pos.x - camera.position.x;
    const dz = player.pos.z - camera.position.z;
    const camYaw = (dx * dx + dz * dz) > 1e-6 ? Math.atan2(dx, dz) : player.yaw;
    const s = Math.sin(camYaw);
    const c = Math.cos(camYaw);
    const sx = inputLocked ? 0 : input.x;
    const sy = inputLocked ? 0 : input.y;
    // forward = (sin, cos), right = (cos, -sin)
    _worldInput.x = c * sx + s * sy;
    _worldInput.y = -s * sx + c * sy;
    _worldInput.run = !inputLocked && input.run;
    _worldInput.jump = !inputLocked && input.jump;
    return _worldInput;
  }

  function step(dt) {
    if (jumpLatch) { input.jump = true; jumpLatch = false; }
    player = controller.step(player, toWorldInput(), dt);
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
    if (floor) {
      checkFloorTriggers();
    } else {
      checkPortals();
      checkCollectibles();
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────
  let firstFrame = false;
  /** Sim clock at the previous draw — the rig integrates on the delta. A
   *  frozen pose advances neither, so dt is 0 and the pose holds exactly. */
  let lastDrawSim = 0;

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
    fitShadow(d);

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
    // altitude cue a child has mid-jump. `groundY` is written onto the state
    // rather than passed alongside it because controller.step hands back a
    // fresh object every frame, so there is nothing here to leak into.
    const heroDt = Math.max(0, simTime - lastDrawSim);
    lastDrawSim = simTime;
    player.groundY = groundAt(player.pos.x, player.pos.z);
    heroRig.update(heroDt, player);

    updateCamera(animT);
    if (fovDirty) { fovDirty = false; projDirty = true; }
    if (projDirty) camera.updateProjectionMatrix();

    // Cloud shadows travel on the ANIMATION clock, so a frozen pose freezes
    // them where the pose put them and two runs of the screenshot harness
    // agree to the pixel.
    setAerialTime(animT);
    sky.update(lightFrame, animT);
    // Inside a floor the island is parked: its subsystems are invisible, so
    // updating them would be pure cost. The sky still runs — a floor has a sky.
    if (floor) {
      floor.lvl.update(animT, player.pos);
    } else {
      water.update(lightFrame, animT);
      props.update(animT, player.pos, windT);
      atmosphere.update(lightFrame, animT, player.pos, camera);
    }

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
      heroRig.reset();
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
      heroRig.reset();
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
      heroRig.reset();
      snapCamera();
    },

    /**
     * Where the hero faces, and where the eye actually points.
     *
     * READ-ONLY on purpose. There is no harness setter for the orbit, because
     * while OverworldScene is alive it re-pushes setCameraOrbit from
     * controls3d EVERY FRAME — a harness-set orbit would be overwritten on the
     * next tick, and a screenshot rig that appeared to work but silently
     * didn't is worse than no rig at all. A harness that wants a different
     * angle must DRAG, exactly as the player does; these two getters are how
     * it checks the drag landed.
     */
    getFacing() { return world.getFacing(); },
    getCameraYaw() { return world.getCameraYaw(); },

    /**
     * Where the island's gates stand. The harness uses this to WALK THE
     * PLAYER INTO a real arch (teleport → proximity → onPortalNear → the
     * scene's ENTER button) instead of hardcoding worldSpec coordinates into
     * a spec, which would let the two drift apart silently. Read-only copies:
     * the live entries own meshes.
     */
    portals() {
      return props.portals.map((p) => ({
        id: p.id, floorId: p.floorId, x: p.x, y: p.y, z: p.z, radius: p.radius,
      }));
    },

    // Floor entry, drivable from the harness without walking into an arch.
    enterFloor(floorId) {
      const r = enterFloor(floorId);
      api.renderOnce();
      return r ? { floorId: r.floorId, objects: r.objects.length, stats: r.stats } : null;
    },
    exitFloor() {
      const ok = exitFloor();
      api.renderOnce();
      return ok;
    },
    activeFloor() { return floor ? floor.id : null; },
    floorStats() { return floor ? floor.lvl.stats : null; },

    worldStats() {
      return {
        terrain: { chunks: terrain.chunkCount, triangles: terrain.triangleCount },
        atmosphere: atmosphere.stats,
        props: props.stats,
        hero: heroRig.stats,
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

  // Named, not returned anonymously: the debug `api` above delegates its
  // camera-orbit accessors here, and it can only do that if this object has a
  // name in the closure. Nothing is called before createOverworld returns, so
  // the temporal dead zone is never entered.
  const world = {
    api,
    /**
     * The move vector for this frame.
     * @param {object} i
     *   x, y   move vector. SCREEN-space by default (rotated here by the
     *          camera's yaw); already WORLD-space when `world` is true.
     *   run    select the controller's run speed for this frame
     *   jump   latched, so a jump asked between fixed steps is never dropped
     */
    setInput({ x = 0, y = 0, jump = false, run = false, world = false }) {
      input.x = x;
      input.y = y;
      input.run = !!run;
      input.world = !!world;
      if (jump) jumpLatch = true;
    },
    /**
     * Player-driven camera orbit (controls3d.js owns the feel; this is the
     * only place the numbers land). Absolute, not deltas: the orbit integrator
     * lives in the input layer where it is pure and testable, and the rig just
     * renders whatever it is told.
     * @param {{yaw:number, pitch:number, zoom:number}} o
     *   yaw   world yaw the eye looks ALONG
     *   pitch radians of elevation ABOVE the rig's authored resting angle
     *   zoom  boom-length multiplier (pinch)
     */
    setCameraOrbit({ yaw, pitch = 0, zoom = 1 } = {}) {
      if (!Number.isFinite(yaw)) return;
      orbitActive = true;
      orbitYaw = yaw;
      orbitPitch = Number.isFinite(pitch) ? pitch : 0;
      orbitZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    },
    /** Hand the eye back to the old facing-follow rig (poses, debug shots). */
    clearCameraOrbit() { orbitActive = false; },
    /** Live, allocation-free reads the input layer needs every frame. */
    getFacing() { return player.yaw; },
    /** Where the eye is currently pointed — the orbit's truth after a snap. */
    getCameraYaw() { return orbitActive ? orbitYaw : player.yaw; },
    getSpeedNorm() { return speedN; },
    isGrounded() { return !!player.grounded; },
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
    /**
     * What the context ACTION button should say it will do, as a raw type
     * string — 'portal' on the island, the nearest floor object's type inside
     * a floor, null when there is nothing to press. Presentation only.
     */
    getNearActionKind() {
      if (floor) return nearActionKind;
      return nearPortal ? 'portal' : null;
    },

    // ── Floors ───────────────────────────────────────────────────────────
    // The whole reason this file changed: the scene asks for a floor and gets
    // a 3D place, not a scene transition. Every method below is geometry,
    // collision or visibility — the RULES stay in floorRules.js.
    /** Build floor `floorId`, park the island, drop the player at its spawn. */
    enterFloor(floorId) { return enterFloor(floorId); },
    /** Tear the floor down and put the player back where the portal was. */
    exitFloor() { return exitFloor(); },
    /** The active floor id, or null when the player is on the island. */
    activeFloor() { return floor ? floor.id : null; },
    /** Live object handles for the active floor (the trigger list). */
    floorObjects() { return floor ? floor.lvl.objects : []; },
    /** The floor's raw level record — tiles, objective steps, secret. */
    floorLevel() { return floor ? floor.lvl.level : null; },
    /** Hide one object and re-arm its trigger (a consumed pickup). */
    consumeFloorObject(id) {
      if (!floor) return false;
      const o = floor.lvl.objects.find((x) => x.id === id);
      if (!o) return false;
      o.consumed = true;
      if (o.mesh) o.mesh.visible = false;
      insideIds.delete(id);
      return true;
    },
    /** A math door was answered: swing it open and unbar its tile. */
    openFloorGate(gateId) {
      if (!floor) return false;
      retract(floor.lvl.openGate(gateId).removed);
      return true;
    },
    /** A caged hero was freed: drop the cage's collider. */
    openFloorCage(tileX, tileY) {
      if (!floor) return false;
      const tag = `cage:${tileX}-${tileY}`;
      const ids = floor.lvl.colliders.filter((c) => c.tag === tag).map((c) => c.id);
      retract(ids);
      return ids.length > 0;
    },
    /** The challenge is complete: the bridge grows / the tide drains. */
    applyFloorTransform() {
      if (!floor) return false;
      retract(floor.lvl.applyTransform().removed);
      return true;
    },
    /** The signature secret opened. */
    revealFloorSecret() {
      if (!floor) return false;
      retract(floor.lvl.revealSecret().removed);
      return true;
    },
    /** Freeze the stick and the triggers while a modal owns the screen. */
    setInputLocked(v) {
      inputLocked = !!v;
      if (inputLocked) { input.x = 0; input.y = 0; input.run = false; jumpLatch = false; }
    },
    /** Re-arm every trigger the player is currently standing inside. */
    clearFloorTriggerLatch() { insideIds.clear(); },
    pause() { rig.stop(); },
    resume() { rig.start(); },
    setVisible(v) { rig.setVisible(v); },
    dispose() {
      rig.dispose();
      if (floor) {
        scene.remove(floor.lvl.group);
        floor.lvl.dispose();
        floor = null;
      }
      scene.remove(
        terrain.group, sky.group, water.group, props.group, atmosphere.group,
        hero,
      );
      terrain.dispose();
      sky.dispose();
      water.dispose();
      props.dispose();
      atmosphere.dispose();
      heroRig.dispose();
      // Shared textures are owned here, not by the subsystems that borrow
      // them, so they are released exactly once — after every material that
      // referenced them is already gone. The cache repopulates on demand, so a
      // second createOverworld() boots clean.
      disposePaperTextures();
      pending.length = 0;
      if (typeof window !== 'undefined' && window.__MW_OVERWORLD === api) delete window.__MW_OVERWORLD;
    },
  };
  return world;
}
