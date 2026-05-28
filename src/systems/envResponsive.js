/**
 * Environmental responsiveness system
 *
 * Subtly modulates the battle background based on player performance.
 * All changes are SUBTLE (10-15% max) — mood enhancement, not distraction.
 *
 * - Streak 3+: brightness +5-10%, more atmospheric particles
 * - Wrong answer: brief dimming for 1.5s
 * - HEAT zone: full vibrancy, COOL zone: slightly muted
 */

/**
 * Create the environment state object.
 *
 * @param {Phaser.Scene} scene
 * @param {object} parallaxState - From createParallaxBackground
 * @returns {EnvState}
 */
export function createEnvironmentState(scene, parallaxState) {
  const overlay = scene.add.rectangle(
    parallaxState.width / 2,
    parallaxState.height / 2,
    parallaxState.width + 80,
    parallaxState.height + 80,
    0x000000,
    0,
  );
  overlay.setDepth(7.5);

  return {
    scene,
    parallaxState,
    overlay,
    currentAlpha: 0,
    targetAlpha: 0,
    _tween: null,
  };
}

/**
 * Update environment based on current combat state.
 *
 * @param {EnvState} envState
 * @param {number} momentum - 0-1
 * @param {number} streak - current correct streak
 * @param {string} zoneLabel - 'COOL', 'ZONE', or 'HEAT'
 * @param {boolean} justWrong - true if the player just answered wrong
 */
export function updateEnvironment(envState, momentum, streak, zoneLabel, justWrong = false) {
  if (!envState || !envState.overlay) return;

  const scene = envState.scene;
  let targetAlpha = 0;

  if (justWrong) {
    // Brief dimming on wrong answer
    targetAlpha = 0.08;
    applyOverlay(envState, 0x000000, targetAlpha, 200);
    // Snap back after 1.5s
    scene.time.delayedCall(1500, () => {
      const zoneAlpha = getZoneAlpha(zoneLabel, streak);
      applyOverlay(envState, zoneAlpha < 0 ? 0xffffff : 0x000000, Math.abs(zoneAlpha), 600);
    });
    return;
  }

  const zoneAlpha = getZoneAlpha(zoneLabel, streak);
  const color = zoneAlpha < 0 ? 0xffffff : 0x000000;
  applyOverlay(envState, color, Math.abs(zoneAlpha), 500);
}

function getZoneAlpha(zoneLabel, streak) {
  let alpha = 0;

  // Zone contribution
  if (zoneLabel === 'HEAT') alpha = -0.04;  // slightly brighter (white overlay)
  else if (zoneLabel === 'COOL') alpha = 0.05; // slightly dimmer (black overlay)

  // Streak contribution (brightening)
  if (streak >= 3) {
    const streakBright = Math.min(streak, 10) * 0.005 + 0.03;
    alpha -= streakBright; // negative = brighter
  }

  // Clamp to ±15%
  return Math.max(-0.12, Math.min(0.12, alpha));
}

function applyOverlay(envState, color, alpha, duration) {
  if (envState._tween) envState._tween.stop();

  envState.overlay.setFillStyle(color, envState.currentAlpha);
  envState._tween = envState.scene.tweens.add({
    targets: envState,
    currentAlpha: alpha,
    duration,
    ease: 'Sine.inOut',
    onUpdate: () => {
      envState.overlay.setFillStyle(color, envState.currentAlpha);
    },
  });
}

/**
 * Clean up environment state.
 * @param {EnvState} envState
 */
export function destroyEnvironmentState(envState) {
  if (!envState) return;
  if (envState._tween) envState._tween.stop();
  if (envState.overlay) envState.overlay.destroy();
}
