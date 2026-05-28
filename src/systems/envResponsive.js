/**
 * Environmental responsiveness system
 *
 * Modulates the battle background based on player performance.
 * Uses color-tinted overlays for visible but non-distracting mood shifts.
 *
 * - Streak 3+: warm golden tint brightening
 * - Wrong answer: brief desaturation + red-tinted dimming
 * - HEAT zone: warm amber glow
 * - COOL zone: cool blue-gray tint
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
    currentColor: 0x000000,
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

  if (justWrong) {
    // Red-tinted dimming on wrong answer
    applyOverlay(envState, 0x200000, 0.18, 200);
    scene.time.delayedCall(1200, () => {
      const { color, alpha } = getZoneMood(zoneLabel, streak);
      applyOverlay(envState, color, alpha, 600);
    });
    return;
  }

  const { color, alpha } = getZoneMood(zoneLabel, streak);
  applyOverlay(envState, color, alpha, 500);
}

function getZoneMood(zoneLabel, streak) {
  // HEAT zone: warm amber glow
  if (zoneLabel === 'HEAT') {
    const streakBoost = streak >= 3 ? Math.min(streak, 10) * 0.008 : 0;
    return { color: 0xf0a020, alpha: 0.08 + streakBoost };
  }

  // COOL zone: cool blue-gray tint
  if (zoneLabel === 'COOL') {
    return { color: 0x2040a0, alpha: 0.10 };
  }

  // ZONE (balanced): subtle warm tint on streaks, neutral otherwise
  if (streak >= 5) {
    return { color: 0xf0c040, alpha: 0.06 + Math.min(streak, 10) * 0.006 };
  }
  if (streak >= 3) {
    return { color: 0xf0d060, alpha: 0.04 };
  }

  return { color: 0x000000, alpha: 0 };
}

function applyOverlay(envState, color, alpha, duration) {
  if (envState._tween) envState._tween.stop();

  const startAlpha = envState.currentAlpha;
  const startColor = envState.currentColor;
  envState.currentColor = color;

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
