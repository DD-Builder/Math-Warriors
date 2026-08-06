/**
 * Overworld renderer shell.
 *
 * Owns the `#mw-overworld` canvas that sits UNDER the (transparent) Phaser
 * canvas, mirrors the Phaser canvas's on-screen rect (Scale.FIT letterboxing
 * included), runs the rAF loop with a fixed-step simulation accumulator, and
 * survives iOS WebGL context loss.
 *
 * The fixed 60 Hz step is what makes gameplay AND screenshots deterministic:
 * the same input trace produces the same trajectory at 7 fps under headless
 * SwiftShader and at 120 Hz on an iPad ProMotion panel.
 */
import * as THREE from 'three';

const STEP = 1 / 60;        // fixed simulation step (s)
const MAX_FRAME = 0.25;     // clamp long stalls (tab switch) — no spiral of death

export function createRenderer({ game, onContextLost, onContextRestored }) {
  // ── Canvas: reuse if a previous scene instance left one, else create ──
  let canvas = document.getElementById('mw-overworld');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'mw-overworld';
    const host = document.getElementById('game') || document.body;
    host.insertBefore(canvas, host.firstChild);
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,          // default-framebuffer MSAA — free on Apple GPUs
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  /** Mirror the Phaser canvas's CSS rect so 4:3 letterboxing matches. */
  function syncSize() {
    const ref = game?.canvas;
    if (!ref) return;
    const rect = ref.getBoundingClientRect();
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    renderer.setPixelRatio(dpr());
    renderer.setSize(rect.width, rect.height, false);
    canvas.width = Math.round(rect.width * dpr());
    canvas.height = Math.round(rect.height * dpr());
    renderer.setViewport(0, 0, rect.width, rect.height);
  }
  syncSize();
  const onResize = () => syncSize();
  game?.scale?.on('resize', onResize);
  window.addEventListener('resize', onResize);

  // ── Context loss (iOS backgrounding) ──
  let contextLost = false;
  const handleLost = (e) => {
    e.preventDefault();           // signal we intend to restore
    contextLost = true;
    onContextLost?.();
  };
  const handleRestored = () => {
    contextLost = false;
    onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);

  // ── Fixed-step loop ──
  let rafId = null;
  let running = false;
  let last = 0;
  let accumulator = 0;
  let simTime = 0;            // deterministic simulation clock (s)
  let frozen = false;         // debug: freeze animated uniforms/screenshots
  let stepFn = null;          // (dt) => void — fixed-step simulation
  let drawFn = null;          // (simTime, alpha) => void — render

  function frame(nowMs) {
    rafId = running ? requestAnimationFrame(frame) : null;
    if (contextLost) return;
    const now = nowMs / 1000;
    let delta = Math.min(now - last, MAX_FRAME);
    last = now;
    if (frozen) { drawFn?.(simTime, 0); return; }
    accumulator += delta;
    while (accumulator >= STEP) {
      stepFn?.(STEP);
      simTime += STEP;
      accumulator -= STEP;
    }
    drawFn?.(simTime, accumulator / STEP);
  }

  return {
    THREE,
    renderer,
    canvas,
    syncSize,
    get simTime() { return simTime; },
    get isContextLost() { return contextLost; },

    setLoop(step, draw) { stepFn = step; drawFn = draw; },

    start() {
      if (running) return;
      running = true;
      last = performance.now() / 1000;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    },

    setVisible(v) { canvas.style.display = v ? 'block' : 'none'; },

    setFrozen(v) { frozen = !!v; },
    get frozen() { return frozen; },

    /** One forced draw at the current sim time (debug/screenshot use). */
    renderOnce() { drawFn?.(simTime, 0); },

    stats() {
      const info = renderer.info;
      return {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      };
    },

    dispose() {
      this.stop();
      game?.scale?.off('resize', onResize);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      canvas.style.display = 'none';
      renderer.dispose();
    },
  };
}
