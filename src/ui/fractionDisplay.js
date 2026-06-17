/**
 * Fraction display components — stacked notation for fraction math problems.
 *
 * Renders fractions like "3/4" as proper stacked notation:
 *       3
 *      ───
 *       4
 *
 * Uses Phaser Graphics + Text inside a Container.
 */

import { COLORS, COLORS_CSS } from '../config.js';

// ---------------------------------------------------------------------------
// PAPER palette aliases — the rest of the codebase uses COLORS; the fraction
// and geometry modules use "paper" naming for clarity.
// ---------------------------------------------------------------------------
const PAPER = {
  cream:   COLORS.paper,    // 0xf0e4cc — warm cream background
  inkTeal: COLORS.ink,      // 0x1a0e04 — dark ink for text
  teal:    COLORS.cobalt,   // 0x2e4e88 — blue accent for borders / lines
  shadow:  0x1f3d3f,
};

const PAPER_CSS = {
  cream:   COLORS_CSS.paper,
  inkTeal: COLORS_CSS.ink,
  teal:    COLORS_CSS.cobalt,
};

const FONT_FAMILY = '"Fredoka One", "Baloo 2", sans-serif';

// ---------------------------------------------------------------------------
// createFractionDisplay
// ---------------------------------------------------------------------------

/**
 * Draw a fraction as proper stacked notation using Phaser Graphics + Text.
 * Returns a Phaser Container with the fraction visual.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x        - center x
 * @param {number} y        - center y
 * @param {string} fractionStr - "3/4", "1/2", "2", etc.
 * @param {object} opts
 * @param {number} [opts.fontSize=28]   - base font size in px
 * @param {number} [opts.color]         - hex color for text + line (default PAPER.inkTeal)
 * @param {string} [opts.colorCSS]      - CSS color string override
 * @param {number} [opts.scale=1]       - uniform scale applied to the container
 * @returns {Phaser.GameObjects.Container}
 */
export function createFractionDisplay(scene, x, y, fractionStr, opts = {}) {
  const fontSize  = opts.fontSize ?? 28;
  const color     = opts.color ?? PAPER.inkTeal;
  const colorCSS  = opts.colorCSS ?? _hexToCSS(color);
  const scale     = opts.scale ?? 1;

  const container = scene.add.container(x, y);

  const parts = fractionStr.split('/');

  if (parts.length === 1) {
    // Whole number — just show as a single centred text
    const txt = scene.add.text(0, 0, parts[0], {
      fontFamily: FONT_FAMILY, fontStyle: 'bold',
      fontSize: `${fontSize}px`,
      color: colorCSS,
    }).setOrigin(0.5);
    container.add(txt);
    container.setScale(scale);
    return container;
  }

  // --- Fraction with numerator / denominator ---
  const numerator   = parts[0];
  const denominator = parts[1];

  const numText = scene.add.text(0, 0, numerator, {
    fontFamily: FONT_FAMILY, fontStyle: 'bold',
    fontSize: `${fontSize}px`,
    color: colorCSS,
  }).setOrigin(0.5, 1); // bottom-aligned just above the line

  const denText = scene.add.text(0, 0, denominator, {
    fontFamily: FONT_FAMILY, fontStyle: 'bold',
    fontSize: `${fontSize}px`,
    color: colorCSS,
  }).setOrigin(0.5, 0); // top-aligned just below the line

  // Measure text widths so the line spans both
  const lineWidth = Math.max(numText.width, denText.width) + fontSize * 0.5;
  const lineThickness = Math.max(2, Math.round(fontSize / 14));
  const gap = Math.round(fontSize * 0.15); // small gap between text and line

  // Position: numerator above centre, denominator below
  numText.setPosition(0, -gap);
  denText.setPosition(0, gap);

  // Horizontal divider line
  const gfx = scene.add.graphics();
  gfx.fillStyle(color, 1);
  gfx.fillRect(
    -lineWidth / 2,
    -lineThickness / 2,
    lineWidth,
    lineThickness,
  );

  container.add([gfx, numText, denText]);
  container.setScale(scale);
  return container;
}

// ---------------------------------------------------------------------------
// createFractionButton
// ---------------------------------------------------------------------------

/**
 * Create a fraction answer button — shows the fraction in stacked notation
 * inside a button-shaped container with a rounded rectangle background.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - center x
 * @param {number} y - center y
 * @param {number} w - button width
 * @param {number} h - button height
 * @param {string} fractionStr - "3/4", "1/2", "2", etc.
 * @param {object} opts
 * @param {number} [opts.fontSize=24]
 * @param {number} [opts.color]          - text / line color (default PAPER.inkTeal)
 * @param {number} [opts.bgColor]        - fill color (default PAPER.cream)
 * @param {number} [opts.borderColor]    - stroke color (default PAPER.teal)
 * @param {number} [opts.borderWidth=2]
 * @param {number} [opts.radius=12]      - corner radius
 * @param {number} [opts.scale=1]
 * @returns {Phaser.GameObjects.Container}
 */
export function createFractionButton(scene, x, y, w, h, fractionStr, opts = {}) {
  const fontSize    = opts.fontSize ?? 24;
  const color       = opts.color ?? PAPER.inkTeal;
  const bgColor     = opts.bgColor ?? PAPER.cream;
  const borderColor = opts.borderColor ?? PAPER.teal;
  const borderWidth = opts.borderWidth ?? 2;
  const radius      = opts.radius ?? 12;
  const scale       = opts.scale ?? 1;

  const container = scene.add.container(x, y);

  // --- Background rounded rectangle ---
  const bg = scene.add.graphics();
  bg.fillStyle(bgColor, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  bg.lineStyle(borderWidth, borderColor, 1);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  container.add(bg);

  // --- Fraction display centred inside ---
  const frac = createFractionDisplay(scene, 0, 0, fractionStr, {
    fontSize,
    color,
    scale: 1, // scale applied to outer container
  });
  container.add(frac);

  container.setScale(scale);
  return container;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a 0xRRGGBB number to a "#rrggbb" CSS string. */
function _hexToCSS(hex) {
  return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
}
