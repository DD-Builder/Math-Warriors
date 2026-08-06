/**
 * Overworld assembly — the ONE module OverworldScene dynamically imports.
 *
 * createOverworld({ game, save, hooks }) builds the Three.js world on the
 * #mw-overworld canvas and returns a small control surface for the Phaser
 * bridge scene. Phase 0 scope: papercut-toon ground, light rig with
 * teal-tinted shading, fog, sky clear color, a controllable hero proxy and
 * follow camera — the socket every later phase (terrain, water, sky,
 * vegetation, character rig) plugs into.
 *
 * Everything here is browser-only. Pure logic (heightfield, collision,
 * controller, portals) lives in sibling modules with zero three imports.
 */
import * as THREE from 'three';
import { createRenderer } from './renderer.js';
import { toonMaterial, paperColor, PAPER } from './materials/toon.js';

export async function createOverworld({ game, save = null, hooks = {} }) {
  const rig = createRenderer({
    game,
    onContextLost: () => hooks.onContextLost?.(),
    onContextRestored: () => hooks.onContextRestored?.(),
  });
  const { renderer } = rig;

  // ── Scene, atmosphere ──
  const scene = new THREE.Scene();
  scene.background = paperColor(PAPER.sky);
  scene.fog = new THREE.Fog(paperColor(PAPER.cream), 60, 240);

  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 600);

  // ── Light rig: warm sun + teal-leaning hemisphere fill ──
  const hemi = new THREE.HemisphereLight(paperColor(PAPER.sky), paperColor(PAPER.sageD), 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(paperColor(PAPER.cream), 1.35);
  sun.position.set(40, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 60;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // ── Phase-0 ground: big sage plane (terrain lands in Phase 1) ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 480, 1, 1),
    toonMaterial(PAPER.sage),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // A few papercut landmarks so boot screenshots have depth cues.
  const landmarks = new THREE.Group();
  const shapes = [
    { geo: new THREE.ConeGeometry(3, 8, 6), color: PAPER.forest, x: 12, z: -14 },
    { geo: new THREE.ConeGeometry(2.2, 6, 6), color: PAPER.leaf, x: -10, z: -8 },
    { geo: new THREE.BoxGeometry(4, 3, 4), color: PAPER.coral, x: -16, z: 10 },
    { geo: new THREE.SphereGeometry(2.4, 12, 8), color: PAPER.lavender, x: 18, z: 12 },
    { geo: new THREE.ConeGeometry(4, 12, 6), color: PAPER.forestD, x: 2, z: -30 },
  ];
  for (const s of shapes) {
    const m = new THREE.Mesh(s.geo, toonMaterial(s.color));
    m.position.set(s.x, s.geo.parameters.height ? s.geo.parameters.height / 2 : 2.4, s.z);
    m.castShadow = true;
    m.receiveShadow = true;
    landmarks.add(m);
  }
  scene.add(landmarks);

  // ── Hero proxy (paper-doll rig replaces this in Phase 3) ──
  const hero = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.8, 4, 8),
    toonMaterial(PAPER.teal),
  );
  body.position.y = 0.8;
  body.castShadow = true;
  hero.add(body);
  // Grounding blob shadow (soft dark-teal disc, papercut style)
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: paperColor(PAPER.shadow), transparent: true, opacity: 0.25, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  hero.add(blob);
  scene.add(hero);

  // ── Simulation state (fixed-step; Phase 1 swaps in controller.js) ──
  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    vy: 0,
    grounded: true,
  };
  const input = { x: 0, y: 0, jump: false };
  const SPEED = 6, GRAV = 22, JUMP_V = 8.5;

  function step(dt) {
    const len = Math.hypot(input.x, input.y);
    if (len > 0.01) {
      const nx = input.x / Math.max(1, len);
      const nz = input.y / Math.max(1, len);
      state.pos.x += nx * SPEED * dt;
      state.pos.z += nz * SPEED * dt;
      state.yaw = Math.atan2(nx, nz);
    }
    if (input.jump && state.grounded) { state.vy = JUMP_V; state.grounded = false; }
    input.jump = false;
    if (!state.grounded) {
      state.vy -= GRAV * dt;
      state.pos.y += state.vy * dt;
      if (state.pos.y <= 0) { state.pos.y = 0; state.vy = 0; state.grounded = true; }
    }
    // Keep the proxy on the Phase-0 plane
    state.pos.x = THREE.MathUtils.clamp(state.pos.x, -230, 230);
    state.pos.z = THREE.MathUtils.clamp(state.pos.z, -230, 230);
  }

  // ── Follow camera ──
  const camBoom = { dist: 11, height: 6.5, lookAhead: 2.0 };
  function camTarget() {
    return new THREE.Vector3(
      state.pos.x - Math.sin(state.yaw) * camBoom.dist,
      state.pos.y + camBoom.height,
      state.pos.z - Math.cos(state.yaw) * camBoom.dist,
    );
  }
  function camLook() {
    return new THREE.Vector3(
      state.pos.x + Math.sin(state.yaw) * camBoom.lookAhead,
      state.pos.y + 1.2,
      state.pos.z + Math.cos(state.yaw) * camBoom.lookAhead,
    );
  }
  function updateCamera() {
    camera.position.lerp(camTarget(), 0.08);
    camera.lookAt(camLook());
  }
  /** Hard-place the camera at its follow position — boot and teleports must
   *  never show the lerp swinging in from wherever the camera last was. */
  function snapCamera() {
    camera.position.copy(camTarget());
    camera.lookAt(camLook());
  }
  snapCamera();

  let firstFrame = false;
  function draw(simTime) {
    hero.position.copy(state.pos);
    hero.rotation.y = state.yaw;
    // Sun follows the hero so the tight shadow frustum stays useful
    sun.position.set(state.pos.x + 40, 60, state.pos.z + 25);
    sun.target.position.set(state.pos.x, 0, state.pos.z);
    updateCamera();
    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      hooks.onFirstFrame?.();
    }
  }

  rig.setLoop(step, draw);

  // ── Debug / determinism API (Phase 2 adds POSES + timeOfDay) ──
  const api = {
    ready: false,
    freeze(on = true) { rig.setFrozen(on); },
    teleport(x, z, yaw = 0) { state.pos.set(x, 0, z); state.yaw = yaw; snapCamera(); api.renderOnce(); },
    renderOnce() { rig.renderOnce(); },
    stats() { return { ...rig.stats(), simTime: rig.simTime }; },
    _state: state,
  };
  if (typeof window !== 'undefined') window.__MW_OVERWORLD = api;

  rig.setVisible(true);
  rig.start();
  api.ready = true;
  hooks.onReady?.();

  return {
    api,
    setInput({ x = 0, y = 0, jump = false }) {
      input.x = x; input.y = y;
      if (jump) input.jump = true;
    },
    pause() { rig.stop(); },
    resume() { rig.start(); },
    setVisible(v) { rig.setVisible(v); },
    dispose() {
      rig.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      if (typeof window !== 'undefined' && window.__MW_OVERWORLD === api) delete window.__MW_OVERWORLD;
    },
  };
}
