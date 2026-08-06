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
import { papercutMaterial, paperColor, PAPER } from './materials/toon.js';
import { deckleDisc, preloadPaperTextures, textureStats, disposePaperTextures } from './materials/textures.js';
import { WORLD, SPAWN } from './worldSpec.js';
import { createHeightfield } from './heightfield.js';
import { createCollisionWorld } from './collision.js';
import { createController } from './controller.js';
import { createTerrain } from './terrainMesh.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { timeOfDay } from './timeOfDay.js';
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
const CAM = {
  dist: 11.5,
  height: 6.0,
  lookAhead: 3.0,
  lookUp: 1.5,
  minAbove: 2.6,   // eye floor above terrain/water under the camera itself
  lerp: 0.12,
};

const SHADOW_ORTHO = 70;
const SUN_DIST = 150;

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
  scene.fog = new THREE.Fog(paperColor(PAPER.cream), 120, 430);

  // far 600 is the contract sky.js sizes its dome (480) and sun (360) against.
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);

  // ── Light rig (values are driven by timeOfDay each frame) ──────────────
  const hemi = new THREE.HemisphereLight(paperColor(PAPER.sky), paperColor(PAPER.sage), 0.6);
  scene.add(hemi);
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

  const water = createWater(heightfield);
  scene.add(water.mesh);

  const props = createProps(heightfield);
  scene.add(props.group);

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

  // ── Hero proxy (paper-doll rig lands in Phase 3) ───────────────────────
  const hero = new THREE.Group();
  hero.name = 'hero';
  const heroGeos = [];
  const heroMats = [];
  const addHeroPart = (geo, colorInt, y) => {
    heroGeos.push(geo);
    // Local space and a small tile: the hero is always the closest thing to
    // the camera, so this is where paper grain is most visible — and world
    // space would slide the grain over him as he runs.
    const mat = papercutMaterial(colorInt, {
      grain: 0.075, normal: 0.10, roughnessLike: 0.17, scale: 0.45, space: 'local',
    });
    heroMats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    hero.add(m);
    return m;
  };
  addHeroPart(new THREE.CapsuleGeometry(0.34, 0.62, 4, 10), PAPER.teal, 0.80);
  addHeroPart(new THREE.CylinderGeometry(0.36, 0.36, 0.13, 10), PAPER.gold, 1.19);
  addHeroPart(new THREE.SphereGeometry(0.30, 12, 10), PAPER.peach, 1.45);
  addHeroPart(new THREE.ConeGeometry(0.38, 0.34, 9), PAPER.coral, 1.76);
  // Grounding disc: teal-tinted, never a black blob (papercut law), and cut
  // with the deckle mask so the one shape that follows the hero everywhere is
  // a torn scrap of shadow-paper rather than a perfect vector circle.
  // CircleGeometry already carries the UVs the alphaMap needs.
  const blobGeo = new THREE.CircleGeometry(0.56, 20);
  const blobMat = new THREE.MeshBasicMaterial({
    color: paperColor(PAPER.shadow), transparent: true, opacity: 0.24, depthWrite: false, fog: true,
    alphaMap: deckleDisc(),
  });
  heroGeos.push(blobGeo);
  heroMats.push(blobMat);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  hero.add(blob);
  scene.add(hero);

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

  // ── Time of day ────────────────────────────────────────────────────────
  let todT = DEFAULT_TOD;
  let todFrozen = false;
  let frameT = NaN;
  let lightFrame = null;
  const _bg = scene.background;
  const _fog = scene.fog;

  function applyLight(frame) {
    sun.color.setHex(frame.sunColor);
    sun.intensity = frame.sunIntensity;
    hemi.color.setHex(frame.hemiSky);
    hemi.groundColor.setHex(frame.hemiGround);
    hemi.intensity = frame.hemiIntensity;
    _fog.color.setHex(frame.fogColor);
    _fog.near = frame.fogNear;
    _fog.far = frame.fogFar;
    _bg.setHex(frame.fogColor);
  }

  /** Rebuild the lighting frame only when the day has actually moved. */
  function syncLight(force) {
    if (!force && Math.abs(todT - frameT) < TOD_EPS) return;
    frameT = todT;
    lightFrame = timeOfDay(todT);
    applyLight(lightFrame);
  }
  syncLight(true);

  // ── Camera ─────────────────────────────────────────────────────────────
  const _camWant = new THREE.Vector3();
  const _camLook = new THREE.Vector3();
  const _size = new THREE.Vector2();
  /** @type {{pos:THREE.Vector3, look:THREE.Vector3}|null} */
  let poseCam = null;

  /** Never let the eye sink into terrain (or under the ocean plane). */
  function liftAboveGround(v) {
    const gy = heightfield.sampleHeight(v.x, v.z);
    const floorY = (gy > WORLD.WATER_Y ? gy : WORLD.WATER_Y) + CAM.minAbove;
    if (v.y < floorY) v.y = floorY;
  }

  function computeBoom() {
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    _camWant.set(player.pos.x - s * CAM.dist, player.pos.y + CAM.height, player.pos.z - c * CAM.dist);
    liftAboveGround(_camWant);
    _camLook.set(player.pos.x + s * CAM.lookAhead, player.pos.y + CAM.lookUp, player.pos.z + c * CAM.lookAhead);
  }

  function updateCamera() {
    if (poseCam) {
      camera.position.copy(poseCam.pos);
      liftAboveGround(camera.position);
      camera.lookAt(poseCam.look);
      return;
    }
    computeBoom();
    camera.position.lerp(_camWant, CAM.lerp);
    liftAboveGround(camera.position);
    camera.lookAt(_camLook);
  }

  /** Hard-place the camera — boot, teleport and pose must never show a swing. */
  function snapCamera() {
    if (poseCam) {
      camera.position.copy(poseCam.pos);
      liftAboveGround(camera.position);
      camera.lookAt(poseCam.look);
      return;
    }
    computeBoom();
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
    checkPortals();
    checkCollectibles();
  }

  // ── Draw ───────────────────────────────────────────────────────────────
  let firstFrame = false;

  function draw(simTime) {
    renderer.getSize(_size);
    if (_size.y > 0) {
      const a = _size.x / _size.y;
      if (Math.abs(a - camera.aspect) > 1e-4) {
        camera.aspect = a;
        camera.updateProjectionMatrix();
      }
    }

    syncLight(false);

    hero.position.set(player.pos.x, player.pos.y, player.pos.z);
    hero.rotation.y = player.yaw;

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

    updateCamera();
    // A frozen pose pins the animation phase; live play uses the sim clock.
    const animT = currentPose ? POSE_TIME : simTime;
    sky.update(lightFrame, animT);
    water.update(lightFrame, animT);
    props.update(animT, player.pos);

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
      syncLight(true);
      if (pose.camPos) {
        if (!poseCam) poseCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
        poseCam.pos.set(pose.camPos.x, pose.camPos.y, pose.camPos.z);
        const look = pose.camLook || { x: pose.playerPos.x, y: 1.4, z: pose.playerPos.z };
        poseCam.look.set(look.x, look.y, look.z);
      } else {
        poseCam = null;
      }
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
      snapCamera();
    },

    worldStats() {
      return {
        terrain: { chunks: terrain.chunkCount, triangles: terrain.triangleCount },
        props: props.stats,
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
      scene.remove(terrain.group, sky.group, water.mesh, props.group, hero);
      terrain.dispose();
      sky.dispose();
      water.dispose();
      props.dispose();
      for (const g of heroGeos) g.dispose();
      for (const m of heroMats) m.dispose();
      heroGeos.length = 0;
      heroMats.length = 0;
      hero.clear();
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
