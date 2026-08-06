/**
 * Hub router — decides which scene is "the hub" and sends the player there.
 *
 * The 3D Overworld replaced the 2D World Map as the game's hub, but the
 * World Map remains fully intact as the automatic fallback for any player
 * whose browser can't give us a WebGL context (Lockdown Mode, ancient
 * devices, headless test runs without GL flags) — and as an escape hatch
 * via the `?mwForceNoWebgl=1` query flag or the `overworldEnabled` setting.
 *
 * chooseHub() is pure and node-tested; the probe is browser-only.
 */
import { SCENES } from '../config.js';
import { transitionTo } from './sceneHelpers.js';

/** Pure decision: which scene key is the hub for this session? */
export function chooseHub({ webglOk, enabled }) {
  return (webglOk && enabled !== false) ? SCENES.OVERWORLD : SCENES.WORLD_MAP;
}

let _webglProbe = null; // cached — context creation is not free

/**
 * Can this browser give us a WebGL(2) context? Honors the
 * `?mwForceNoWebgl=1` escape hatch (also used by the fallback e2e spec).
 * Result is cached for the session.
 */
export function webglAvailable() {
  if (_webglProbe !== null) return _webglProbe;
  try {
    if (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('mwForceNoWebgl') === '1') {
      _webglProbe = false;
      return _webglProbe;
    }
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    _webglProbe = !!gl;
    // Free the probe context immediately — iOS caps live contexts.
    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); ext?.loseContext(); }
  } catch {
    _webglProbe = false;
  }
  return _webglProbe;
}

/** Test hook: clear the cached probe. */
export function __resetWebglProbe() { _webglProbe = null; }

/**
 * Send the player to the hub (Overworld when possible, World Map otherwise).
 * Drop-in replacement for the old `transitionTo(scene, SCENES.WORLD_MAP, …)`
 * call-sites; extra args mirror transitionTo's.
 */
export function goHub(scene, data = {}, duration = 250, type = 'fade') {
  const enabled = data?.save?.settings?.overworldEnabled ?? scene?.save?.settings?.overworldEnabled;
  const key = chooseHub({ webglOk: webglAvailable(), enabled });
  transitionTo(scene, key, data, duration, type);
}
