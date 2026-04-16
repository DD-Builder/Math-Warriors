/**
 * Scene-transition helpers.
 *
 * Every scene used to hand-roll this triplet:
 *   camera.fadeOut(250, 0, 0, 0);
 *   camera.once('camerafadeoutcomplete', () => scene.start(KEY, data));
 * and a matching fadeIn in create(). Centralizing both prevents drift
 * (each scene had slightly different durations / missed error paths).
 */

const DEFAULT_FADE = 250;

/**
 * Fade the camera out, then start the next scene. Safe to call from
 * any event handler — the scene is guaranteed to fade all the way out
 * before the new scene kicks in.
 */
export function transitionTo(scene, key, data, duration = DEFAULT_FADE) {
  scene.cameras.main.fadeOut(duration, 0, 0, 0);
  scene.cameras.main.once('camerafadeoutcomplete', () => {
    scene.scene.start(key, data);
  });
}

/**
 * Standard scene-entry fade-in. Defaults to a black background so the
 * old scene's lingering draws don't flash on slow devices; pass a
 * `bgColor` for scenes that want a different base (e.g. MazeScene
 * uses the realm's sky color so the area outside the maze matches).
 */
export function fadeInScene(scene, duration = DEFAULT_FADE, bgColor = 0x000000) {
  scene.cameras.main.fadeIn(duration, 0, 0, 0);
  scene.cameras.main.setBackgroundColor(bgColor);
}
