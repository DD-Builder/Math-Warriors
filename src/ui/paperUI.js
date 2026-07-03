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
// blend a 0xRRGGBB color toward white by fraction f
function _lighten(c, f) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * f) << 16) | (Math.round(g + (255 - g) * f) << 8) | Math.round(b + (255 - b) * f);
}

// tiny deterministic rng for grain stipple
function _grainRng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

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
    // Hand-cut paper v2 — the reference-art stack:
    //   soft double shadow → cream DECKLE underlay peeking around the
    //   edge → color sheet → lighter inset sheet → grain stipple.
    // Same seed every time so the silhouette never changes on repaint.
    const pts = paperPolygonPoints(w, h, seed);
    const at = (dx2, dy2, set = pts) => set.map((p) => ({ x: p.x + x + dx2, y: p.y + y + dy2 }));

    // Two stacked shadow passes read as a soft blurred drop
    shadow.fillStyle(PAPER.shadow, shadowAlpha * 0.55);
    shadow.fillPoints(at(shadowOff + 3, shadowOff + 4), true);
    shadow.fillStyle(PAPER.shadow, shadowAlpha);
    shadow.fillPoints(at(shadowOff, shadowOff), true);

    // Deckled cream underlay — slightly larger sheet with its own cut
    const deckle = paperPolygonPoints(w + 10, h + 10, seed + 7);
    bg.fillStyle(PAPER.cream, alpha);
    bg.fillPoints(at(0, 0, deckle), true);

    // Main color sheet
    bg.fillStyle(color, alpha);
    bg.fillPoints(at(0, 0), true);

    // Inner inset sheet — lighter tint, offset up-left (light source)
    const inset = paperPolygonPoints(Math.max(10, w - 14), Math.max(8, h - 14), seed + 13);
    bg.fillStyle(_lighten(color, 0.14), alpha * 0.65);
    bg.fillPoints(at(-1, -2, inset), true);

    // Grain stipple — a few seeded paper flecks
    const gr = _grainRng(seed);
    bg.fillStyle(PAPER.shadow, 0.05);
    for (let gi = 0; gi < Math.min(16, Math.floor(w * h / 2600)); gi++) {
      bg.fillCircle(x + (gr() - 0.5) * (w - 18), y + (gr() - 0.5) * (h - 14), 1 + gr() * 1.6);
    }

    if (strokeWidth > 0) {
      bg.lineStyle(strokeWidth, strokeColor, strokeAlpha);
      bg.strokePoints(at(0, 0), true);
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

  const out = paperRect(scene, x, y, w, h, color, {
    radius,
    shadowOff: opts.shadowOff ?? 8,
    shadowAlpha: opts.shadowAlpha ?? 0.25,
    strokeColor: PAPER.sand,
    strokeAlpha: 0.3,
    strokeWidth: 3,
    alpha: opts.alpha ?? 0.95,
    organic: opts.organic ?? true,
    seed: opts.seed ?? Math.round(x * 31 + y * 7 + w),
  });

  // Optional paper TAB — a small label sheet sticking off the top-left
  // (speaker names, panel titles), cut from its own paper chip.
  if (opts.tab) {
    const tabW = Math.min(w * 0.5, 34 + opts.tab.length * 13);
    const tabX = x - w / 2 + tabW / 2 + 18;
    const tabY = y - h / 2 - 12;
    const tabRect = paperRect(scene, tabX, tabY, tabW, 40, opts.tabColor ?? PAPER.gold, {
      organic: true, seed: Math.round(tabX * 13 + tabY), shadowOff: 4, shadowAlpha: 0.3,
    });
    const tabText = scene.add.text(tabX, tabY, opts.tab, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '18px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5);
    out.tabBg = tabRect.bg; out.tabShadow = tabRect.shadow; out.tabText = tabText;
  }
  return out;
}

// ------------------------------------------------------------------
// PAPER MEDALLION + GLOW
// ------------------------------------------------------------------

/**
 * A circular deckle-edged medallion: shadow disc, cream deckle ring,
 * inner color disc. Returns { shadow, ring, disc } graphics — draw
 * your diorama/portrait on top, clipped to radius r-6.
 */
export function PaperMedallion(scene, x, y, r, opts = {}) {
  const seed = opts.seed ?? Math.round(x * 17 + y * 29);
  const gr = _grainRng(seed);
  const wob = (base) => base + (gr() - 0.5) * base * 0.06;

  const shadow = scene.add.graphics();
  shadow.fillStyle(PAPER.shadow, 0.28);
  shadow.fillCircle(x + 5, y + 8, wob(r + 8));
  shadow.fillStyle(PAPER.shadow, 0.16);
  shadow.fillCircle(x + 9, y + 12, wob(r + 8));

  const ring = scene.add.graphics();
  // deckled cream rim: overlapping bumps around the circumference
  ring.fillStyle(opts.rimColor ?? PAPER.cream, 1);
  ring.fillCircle(x, y, r + 6);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.fillCircle(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4), 5 + gr() * 4);
  }

  const disc = scene.add.graphics();
  disc.fillStyle(opts.color ?? PAPER.sage, 1);
  disc.fillCircle(x, y, r - 2);
  disc.fillStyle(_lighten(opts.color ?? PAPER.sage, 0.12), 0.6);
  disc.fillCircle(x - r * 0.12, y - r * 0.16, r * 0.82);

  return { shadow, ring, disc };
}

/**
 * Layered radial glow — the reference art's "light through the cuts".
 * Returns the graphics object (pulse it yourself if desired).
 */
export function paperGlow(scene, x, y, r, color = 0xf5e2b0, alpha = 0.5) {
  const g = scene.add.graphics();
  for (let ring2 = 6; ring2 >= 1; ring2--) {
    g.fillStyle(color, alpha * (1 - ring2 / 7) * 0.6);
    g.fillCircle(x, y, r * (ring2 / 6));
  }
  g.fillStyle(0xffffff, alpha * 0.35);
  g.fillCircle(x, y, r * 0.12);
  return g;
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
    fontSize: '16px',
    color: COLORS_CSS.paper,
    letterSpacing: 1,
    resolution: 2,
    ...overrides,
  }),
};
