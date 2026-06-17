/**
 * Papercut UI component library
 *
 * Every interactive element in the game should look like it was cut
 * from paper — organic rounded shapes, subtle drop shadows, visible
 * layering, slightly imperfect edges. This module provides reusable
 * factory functions so every scene speaks the same visual language.
 *
 * Design rules (from research + DD-Builder direction):
 *   - NO sharp-cornered rectangles. Everything has rounded/organic edges.
 *   - Every panel/button casts a soft shadow on the layer below it.
 *   - Colors are bright and warm — Mario-world cheerful, not dark.
 *   - Touch targets: minimum 60pt (about 80px at our scale).
 *   - Spacing between tappable elements: 20px+ gap.
 *   - Screen-edge buffer: 30px minimum on all sides.
 *   - Content centered in available space.
 *   - One action per visual cluster — don't cram.
 *
 * Usage:
 *   import { PaperButton, PaperPanel, PaperCard, PaperBar } from '../ui/paperUI.js';
 *   const btn = PaperButton(scene, x, y, 'START', { onClick: () => {} });
 */

import { COLORS, COLORS_CSS, PAPER, PAPER_CSS, MARGIN, BOTTOM_SAFE, TOP_SAFE } from '../config.js';
import { makeRng } from '../systems/rng.js';

// ------------------------------------------------------------------
// PAPER SHAPE HELPERS
// ------------------------------------------------------------------

// Memoize wobbled polygon points by (w,h,seed). Every paper rect
// redraw would otherwise recompute ~30 identical points via ~60 rng()
// calls. Shapes are deterministic for a given seed, so once is enough.
const _polyCache = new Map();

/**
 * Build a hand-cut paper polygon — a slightly imperfect rectangle
 * with wobbled edges to look like paper cut by hand, not a computer.
 *
 * Returns an array of {x, y} points centered on (0, 0). Apply
 * translation when drawing.
 */
function paperPolygonPoints(w, h, seed = 1) {
  const key = `${w}|${h}|${seed}`;
  const cached = _polyCache.get(key);
  if (cached) return cached;

  const rng = makeRng(seed);
  const halfW = w / 2;
  const halfH = h / 2;
  const wobble = 3.5; // pixels of edge wobble
  const cornerInset = Math.min(w, h) * 0.12;
  const pointsPerEdge = 6;

  const pts = [];

  // Helper: add a point with slight wobble
  const add = (x, y) => pts.push({
    x: x + (rng() - 0.5) * wobble,
    y: y + (rng() - 0.5) * wobble,
  });

  // Top edge — left corner to right corner
  add(-halfW + cornerInset, -halfH);
  for (let i = 1; i < pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    const x = -halfW + cornerInset + t * (w - 2 * cornerInset);
    add(x, -halfH);
  }
  add(halfW - cornerInset, -halfH);

  // Top-right corner (small curve)
  add(halfW, -halfH + cornerInset);

  // Right edge
  for (let i = 1; i < pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    const y = -halfH + cornerInset + t * (h - 2 * cornerInset);
    add(halfW, y);
  }
  add(halfW, halfH - cornerInset);

  // Bottom-right corner
  add(halfW - cornerInset, halfH);

  // Bottom edge (right to left)
  for (let i = 1; i < pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    const x = halfW - cornerInset - t * (w - 2 * cornerInset);
    add(x, halfH);
  }
  add(-halfW + cornerInset, halfH);

  // Bottom-left corner
  add(-halfW, halfH - cornerInset);

  // Left edge (bottom to top)
  for (let i = 1; i < pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    const y = halfH - cornerInset - t * (h - 2 * cornerInset);
    add(-halfW, y);
  }
  add(-halfW, -halfH + cornerInset);

  _polyCache.set(key, pts);
  return pts;
}

/**
 * Draw a hand-cut paper rectangle (with imperfect wobbled edges)
 * and a drop shadow. Returns { bg, shadow } Phaser Graphics objects.
 *
 * If opts.organic is false, falls back to the older fillRoundedRect
 * style (still useful for non-button UI panels).
 */
export function paperRect(scene, x, y, w, h, color, opts = {}) {
  const bg = scene.add.graphics();
  const shadow = scene.add.graphics();
  paintPaperRect(bg, shadow, x, y, w, h, color, opts);
  return { bg, shadow };
}

/**
 * Re-paint existing graphics objects as a paper rect. Used to update
 * selection state on cards/tabs/buttons without losing the organic
 * hand-cut look. Same options as paperRect.
 */
export function paintPaperRect(bg, shadow, x, y, w, h, color, opts = {}) {
  const radius = opts.radius ?? 16;
  const shadowOff = opts.shadowOff ?? 6;
  const shadowAlpha = opts.shadowAlpha ?? 0.3;
  const alpha = opts.alpha ?? 1;
  const strokeColor = opts.strokeColor ?? PAPER.shadow;
  const strokeAlpha = opts.strokeAlpha ?? 0.15;
  const strokeWidth = opts.strokeWidth ?? 2;
  const organic = opts.organic ?? false;
  const seed = opts.seed ?? Math.round(x * 1000 + y);

  bg.clear();
  shadow.clear();

  if (organic) {
    // Hand-cut paper: polygon with wobbled edges. Use the same seed
    // every time so the shape stays identical between redraws.
    const pts = paperPolygonPoints(w, h, seed);

    shadow.fillStyle(PAPER.shadow, shadowAlpha);
    shadow.fillPoints(pts.map((p) => ({ x: p.x + x + shadowOff, y: p.y + y + shadowOff })), true);

    bg.fillStyle(color, alpha);
    bg.fillPoints(pts.map((p) => ({ x: p.x + x, y: p.y + y })), true);
    if (strokeWidth > 0) {
      bg.lineStyle(strokeWidth, strokeColor, strokeAlpha);
      bg.strokePoints(pts.map((p) => ({ x: p.x + x, y: p.y + y })), true);
    }
    return;
  }

  shadow.fillStyle(PAPER.shadow, shadowAlpha);
  shadow.fillRoundedRect(x - w / 2 + shadowOff, y - h / 2 + shadowOff, w, h, radius);

  bg.fillStyle(color, alpha);
  bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  if (strokeWidth > 0) {
    bg.lineStyle(strokeWidth, strokeColor, strokeAlpha);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  }
}

/**
 * Create an interactive hit zone over a paper rect. Phaser Graphics
 * objects aren't directly interactive, so we overlay a transparent
 * rectangle that captures input.
 */
function hitZone(scene, x, y, w, h) {
  return scene.add.rectangle(x, y, w, h, 0xffffff, 0)
    .setInteractive({ useHandCursor: true });
}

// ------------------------------------------------------------------
// PAPER BUTTON
// ------------------------------------------------------------------

/**
 * A tappable button that looks like a cut paper shape.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - center X
 * @param {number} y - center Y
 * @param {string} text - button label
 * @param {object} opts
 * @param {number} [opts.w=280] - width
 * @param {number} [opts.h=70] - height
 * @param {number} [opts.color=COLORS.scarlet] - fill color
 * @param {string} [opts.textColor='#ffffff']
 * @param {number} [opts.fontSize=24]
 * @param {Function} [opts.onClick] - tap handler
 * @returns {{ container, label, zone }}
 */
export function PaperButton(scene, x, y, text, opts = {}) {
  const w = opts.w ?? 280;
  const h = opts.h ?? 70;
  const color = opts.color ?? COLORS.scarlet;
  const textColor = opts.textColor ?? PAPER_CSS.cream;
  const fontSize = opts.fontSize ?? 24;

  const { bg, shadow } = paperRect(scene, x, y, w, h, color, {
    radius: 14,
    shadowOff: 5,
    shadowAlpha: 0.35,
    organic: true,
    seed: opts.seed ?? Math.round(x * 1000 + y),
  });

  const label = scene.add.text(x, y, text, {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: `${fontSize}px`,
    color: textColor,
    stroke: PAPER_CSS.inkTeal,
    strokeThickness: 2,
    letterSpacing: 2,
  }).setOrigin(0.5);

  const zone = hitZone(scene, x, y, w, h);

  if (opts.onClick) {
    const btnTargets = [bg, shadow, label, zone];
    zone.on('pointerdown', () => {
      scene.tweens.add({
        targets: btnTargets,
        scaleX: 0.97,
        scaleY: 0.97,
        duration: 50,
        ease: 'Sine.out',
      });
    });
    zone.on('pointerup', () => {
      opts.onClick();
      scene.tweens.add({
        targets: btnTargets,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 100,
        ease: 'Sine.out',
      });
    });
    zone.on('pointerout', () => {
      // Reset if pointer leaves without releasing
      scene.tweens.add({
        targets: btnTargets,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 100,
      });
    });
  }

  return { bg, shadow, label, zone };
}

// ------------------------------------------------------------------
// PAPER PANEL
// ------------------------------------------------------------------

/**
 * A floating panel that looks like a sheet of paper.
 * Used for menus, dialogs, HUD backgrounds.
 */
export function PaperPanel(scene, x, y, w, h, opts = {}) {
  const color = opts.color ?? PAPER.cream;
  const radius = opts.radius ?? 20;

  return paperRect(scene, x, y, w, h, color, {
    radius,
    shadowOff: opts.shadowOff ?? 8,
    shadowAlpha: opts.shadowAlpha ?? 0.25,
    strokeColor: PAPER.sand,
    strokeAlpha: 0.3,
    strokeWidth: 3,
    alpha: opts.alpha ?? 0.95,
  });
}

// ------------------------------------------------------------------
// PAPER CARD
// ------------------------------------------------------------------

/**
 * A selectable card (for hero picker, grade picker).
 * Slightly smaller shadow, border highlights on select.
 */
export function PaperCard(scene, x, y, w, h, color, opts = {}) {
  const selected = opts.selected ?? false;
  const radius = opts.radius ?? 12;
  const seed = opts.seed ?? Math.round(x * 1000 + y);

  const { bg, shadow } = paperRect(scene, x, y, w, h, color, {
    radius,
    shadowOff: selected ? 3 : 5,
    shadowAlpha: selected ? 0.4 : 0.25,
    strokeColor: selected ? COLORS.goldL : PAPER.shadow,
    strokeAlpha: selected ? 0.9 : 0.15,
    strokeWidth: selected ? 4 : 2,
    organic: opts.organic ?? true,
    seed,
  });

  const zone = hitZone(scene, x, y, w, h);

  return { bg, shadow, zone };
}

// ------------------------------------------------------------------
// PAPER BAR (HP, momentum, etc.)
// ------------------------------------------------------------------

/**
 * A progress bar styled as a layered paper strip.
 */
export function PaperBar(scene, x, y, w, h, pct, fillColor, opts = {}) {
  const bgColor = opts.bgColor ?? PAPER.inkTeal;
  const radius = Math.min(h / 2, 8);

  // Background strip
  const barBg = scene.add.graphics();
  barBg.fillStyle(bgColor, 0.8);
  barBg.fillRoundedRect(x, y - h / 2, w, h, radius);
  barBg.lineStyle(1.5, PAPER.shadow, 0.2);
  barBg.strokeRoundedRect(x, y - h / 2, w, h, radius);

  // Fill strip
  const fillW = Math.max(0, w * Math.min(1, pct));
  const barFill = scene.add.graphics();
  if (fillW > 0) {
    barFill.fillStyle(fillColor, 1);
    barFill.fillRoundedRect(x, y - h / 2, fillW, h, radius);
  }

  return { barBg, barFill, w, h, x, y, radius };
}

/**
 * Update a PaperBar's fill to a new percentage.
 */
export function updatePaperBar(bar, newPct, fillColor) {
  bar.barFill.clear();
  const fillW = Math.max(0, bar.w * Math.min(1, newPct));
  if (fillW > 0) {
    bar.barFill.fillStyle(fillColor, 1);
    bar.barFill.fillRoundedRect(bar.x, bar.y - bar.h / 2, fillW, bar.h, bar.radius);
  }
}

// ------------------------------------------------------------------
// LAYOUT HELPERS
// ------------------------------------------------------------------

/**
 * Safe content area for every scene.
 *
 * iPad Safari eats the bottom ~100px for its toolbar when it appears.
 * The TOP also has a status bar eating ~60px. This function returns
 * bounds that guarantee any UI placed inside won't be clipped.
 *
 * Use `bottom` as the Y CENTER of bottom-anchored buttons, not their
 * bottom edge — buttons have their own height that must stay inside.
 */
export function safeArea(gameW, gameH) {
  const topSafe = TOP_SAFE;
  const bottomSafe = BOTTOM_SAFE;
  return {
    left: MARGIN,
    right: gameW - MARGIN,
    top: topSafe,
    bottom: gameH - bottomSafe,
    cx: gameW / 2,
    cy: (topSafe + gameH - bottomSafe) / 2,
    w: gameW - MARGIN * 2,
    h: gameH - topSafe - bottomSafe,
  };
}

/** Distribute N items evenly across a width, centered at cx. */
function distributeX(count, totalWidth, cx) {
  if (count <= 1) return [cx];
  const spacing = totalWidth / (count - 1);
  const startX = cx - totalWidth / 2;
  return Array.from({ length: count }, (_, i) => startX + i * spacing);
}

// ------------------------------------------------------------------
// TEXT STYLES (consistent across the game)
// ------------------------------------------------------------------

// Letter-spacing applied to every text style so letters don't jam
// together. Fredoka One has tight kerning that cramps without this.
const LSP = 2;

export const TEXT = {
  title: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '64px',
    color: PAPER_CSS.cream,
    stroke: PAPER_CSS.inkTeal,
    strokeThickness: 6,
    letterSpacing: LSP + 1,
    resolution: 2,
    ...overrides,
  }),
  heading: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '36px',
    color: COLORS_CSS.goldL,
    stroke: PAPER_CSS.inkTeal,
    strokeThickness: 3,
    letterSpacing: LSP,
    resolution: 2,
    ...overrides,
  }),
  body: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '22px',
    color: PAPER_CSS.cream,
    letterSpacing: LSP,
    resolution: 2,
    ...overrides,
  }),
  small: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '16px',
    color: COLORS_CSS.paper,
    letterSpacing: 1,
    resolution: 2,
    ...overrides,
  }),
  label: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '18px',
    color: COLORS_CSS.goldL,
    letterSpacing: LSP,
    resolution: 2,
    ...overrides,
  }),
  stat: (overrides = {}) => ({
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '14px',
    color: COLORS_CSS.paper,
    letterSpacing: 1,
    ...overrides,
  }),
};
