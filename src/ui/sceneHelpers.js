/**
 * Scene-transition helpers.
 *
 * Every scene used to hand-roll this triplet:
 *   camera.fadeOut(250, 0, 0, 0);
 *   camera.once('camerafadeoutcomplete', () => scene.start(KEY, data));
 * and a matching fadeIn in create(). Centralizing both prevents drift
 * (each scene had slightly different durations / missed error paths).
 *
 * Supported transition types:
 *   'fade'   — classic fade to black (default)
 *   'wipe'   — diagonal black bar sweeps top-left to bottom-right
 *   'circle' — iris-out / iris-in (shrinking/expanding circle)
 *   'slide'  — screen slides left
 */

import { PAPER, PAPER_CSS } from '../config.js';

const DEFAULT_FADE = 250;

// --- Loading Tips (Item 42) ---
const LOADING_TIPS = [
  'Tip: Harder questions give more XP!',
  'Tip: Build bonds by fighting together!',
  'Tip: Evolve heroes at level 5!',
  'Tip: Master math domains to unlock new paths!',
  'Shadow says: "..."',
  'Pepper says: "ZOOM ZOOM!"',
  'Tip: Guard reduces damage by 50%!',
  'Tip: Streaks boost your damage!',
];

/**
 * Transition to the next scene with a visual effect. Safe to call from
 * any event handler.
 *
 * @param {Phaser.Scene} scene    The current scene
 * @param {string}       key      Scene key to start
 * @param {object}       data     Data to pass to the next scene
 * @param {number}       duration Total transition time in ms (default 250)
 * @param {string}       type     'fade' | 'wipe' | 'circle' | 'slide'
 */
export function transitionTo(scene, key, data, duration = DEFAULT_FADE, type = 'fade') {
  // Show a random loading tip during the transition (Item 42)
  _showLoadingTip(scene);

  if (type === 'wipe') {
    _transitionWipe(scene, key, data, duration);
  } else if (type === 'circle') {
    _transitionCircle(scene, key, data, duration);
  } else if (type === 'slide') {
    _transitionSlide(scene, key, data, duration);
  } else {
    // Default: fade
    scene.cameras.main.fadeOut(duration, 31, 66, 68);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start(key, data);
    });
  }
}

/**
 * Wipe transition: a diagonal black bar sweeps across the screen from
 * top-left to bottom-right. At the midpoint the scene switches.
 *
 * Uses a polygon (rotated quad) drawn with Phaser Graphics beginPath/
 * lineTo, since Phaser Graphics doesn't expose canvas transforms.
 */
function _transitionWipe(scene, key, data, duration) {
  const W = scene.cameras.main.width;
  const H = scene.cameras.main.height;
  const diagonal = Math.sqrt(W * W + H * H);
  // Half-thickness of the bar (wide enough to cover the full screen)
  const halfBar = diagonal * 0.8;

  const gfx = scene.add.graphics().setDepth(9999).setScrollFactor(0);

  const half = duration / 2;
  // t goes from 0 to 1: the bar's leading edge sweeps from off-screen
  // top-left to covering the full screen at t=1.
  const proxy = { t: 0 };

  const drawWipe = () => {
    gfx.clear();
    gfx.fillStyle(PAPER.inkTeal, 1);
    // The diagonal edge runs at 45 degrees. As t increases, the
    // filled area grows from the top-left corner.
    // Leading edge x-intercept moves from -diagonal to +diagonal*2.
    const offset = -diagonal + proxy.t * diagonal * 3;
    // Four corners of a huge quad whose right edge is the diagonal line
    gfx.beginPath();
    gfx.moveTo(offset, -50);
    gfx.lineTo(offset - halfBar, -50);
    gfx.lineTo(-50, -50);
    gfx.lineTo(-50, H + 50);
    gfx.lineTo(offset - halfBar + H, H + 50);
    gfx.lineTo(offset + H, H + 50);
    // Only fill if leading edge has entered the screen
    gfx.lineTo(offset, -50);
    gfx.closePath();
    gfx.fillPath();
  };

  scene.tweens.add({
    targets: proxy,
    t: 1,
    duration: half,
    ease: 'Cubic.inOut',
    onUpdate: drawWipe,
    onComplete: () => {
      gfx.clear();
      gfx.fillStyle(PAPER.inkTeal, 1);
      gfx.fillRect(-50, -50, W + 100, H + 100);
      scene.scene.start(key, data);
    },
  });
}

/**
 * Circle (iris) transition: a black border shrinks inward (iris-out),
 * switches scenes. Drawn as four trapezoid wedges (top, right, bottom,
 * left) around a circular opening in the center.
 */
function _transitionCircle(scene, key, data, duration) {
  const W = scene.cameras.main.width;
  const H = scene.cameras.main.height;
  const cx = W / 2;
  const cy = H / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy) + 20;

  const gfx = scene.add.graphics().setDepth(9999).setScrollFactor(0);

  const half = duration / 2;
  const proxy = { radius: maxRadius };

  const drawIris = () => {
    gfx.clear();
    gfx.fillStyle(PAPER.inkTeal, 1);

    const r = Math.max(0, proxy.radius);
    const steps = 64;
    const margin = 60;

    // Draw a filled polygon: outer rectangle with a circular cutout.
    // We trace the outer rectangle, then trace the circle in reverse.
    gfx.beginPath();
    // Outer rectangle (clockwise)
    gfx.moveTo(-margin, -margin);
    gfx.lineTo(W + margin, -margin);
    gfx.lineTo(W + margin, H + margin);
    gfx.lineTo(-margin, H + margin);
    gfx.lineTo(-margin, -margin);
    // Jump to circle start and trace counter-clockwise (creates hole
    // via nonzero winding rule)
    gfx.moveTo(cx + r, cy);
    for (let i = steps; i >= 0; i--) {
      const angle = (i / steps) * Math.PI * 2;
      gfx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    gfx.fillPath();
  };

  // Phase 1: iris out (circle shrinks)
  scene.tweens.add({
    targets: proxy,
    radius: 0,
    duration: half,
    ease: 'Cubic.in',
    onUpdate: drawIris,
    onComplete: () => {
      // Full black
      gfx.clear();
      gfx.fillStyle(PAPER.inkTeal, 1);
      gfx.fillRect(0, 0, W, H);
      scene.scene.start(key, data);
    },
  });
}

/**
 * Slide transition: the entire scene slides left off-screen. At the
 * midpoint the scene switches.
 */
function _transitionSlide(scene, key, data, duration) {
  const W = scene.cameras.main.width;

  const overlay = scene.add.rectangle(W / 2, scene.cameras.main.height / 2, W, scene.cameras.main.height, PAPER.inkTeal, 0).setDepth(9998).setScrollFactor(0);

  scene.tweens.add({
    targets: overlay,
    alpha: 0.6,
    duration: duration * 0.3,
    ease: 'Sine.in',
  });

  // Slide all game objects left by shifting the camera
  const cam = scene.cameras.main;
  const origScrollX = cam.scrollX;
  scene.tweens.add({
    targets: cam,
    scrollX: origScrollX + W,
    duration: duration,
    ease: 'Cubic.inOut',
    onComplete: () => {
      scene.scene.start(key, data);
    },
  });
}

/**
 * Standard scene-entry fade-in. Defaults to a black background so the
 * old scene's lingering draws don't flash on slow devices; pass a
 * `bgColor` for scenes that want a different base (e.g. MazeScene
 * uses the realm's sky color so the area outside the maze matches).
 */
export function fadeInScene(scene, duration = DEFAULT_FADE, bgColor = PAPER.inkTeal) {
  scene.cameras.main.fadeIn(duration, 31, 66, 68);
  scene.cameras.main.setBackgroundColor(bgColor);
}

/**
 * Show a random loading tip during a scene transition (Item 42).
 * Renders small cream-colored text near the bottom of the screen.
 */
function _showLoadingTip(scene) {
  try {
    const W = scene.cameras.main.width;
    const H = scene.cameras.main.height;
    const tip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    const tipText = scene.add.text(W / 2, H - 40, tip, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10000).setScrollFactor(0).setAlpha(0);
    scene.tweens.add({
      targets: tipText,
      alpha: 1,
      duration: 150,
      ease: 'Sine.in',
    });
  } catch (_) { /* defensive: don't let tip display prevent transition */ }
}
