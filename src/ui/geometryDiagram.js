/**
 * Geometry diagram renderer — procedural shape diagrams for geometry problems.
 *
 * Draws labeled shapes (triangle, square, rectangle, pentagon, hexagon,
 * octagon, circle) with dimension annotations so students can visualise
 * the problem they are solving.
 *
 * Uses Phaser Graphics inside a Container. No image assets required.
 */

import { COLORS, COLORS_CSS } from '../config.js';

// ---------------------------------------------------------------------------
// PAPER palette aliases (same mapping as fractionDisplay.js)
// ---------------------------------------------------------------------------
const PAPER = {
  cream:   COLORS.paper,    // 0xf0e4cc
  inkTeal: COLORS.ink,      // 0x1a0e04
  teal:    COLORS.cobalt,   // 0x2e4e88
  shadow:  0x000000,
};

const PAPER_CSS = {
  cream:   COLORS_CSS.paper,
  inkTeal: COLORS_CSS.ink,
  teal:    COLORS_CSS.cobalt,
};

const FONT_FAMILY = '"Fredoka One", "Baloo 2", sans-serif';

// ---------------------------------------------------------------------------
// createGeometryDiagram
// ---------------------------------------------------------------------------

/**
 * Draw a labeled geometry diagram for the given question.
 * Returns a Phaser Container with the shape visual.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x          - center x
 * @param {number} y          - center y
 * @param {object} question   - the math question object (has .text, .format)
 * @param {object} opts
 * @param {number} [opts.size=120]        - bounding box size in px
 * @param {number} [opts.color]           - stroke color (default PAPER.teal)
 * @param {number} [opts.labelColor]      - label text color (default PAPER.inkTeal)
 * @param {number} [opts.fillColor]       - fill color (default PAPER.cream)
 * @param {number} [opts.fillAlpha=0.3]   - fill opacity
 * @param {number} [opts.strokeWidth=2]
 * @returns {Phaser.GameObjects.Container}
 */
export function createGeometryDiagram(scene, x, y, question, opts = {}) {
  const size        = opts.size ?? 120;
  const strokeColor = opts.color ?? PAPER.teal;
  const labelColor  = opts.labelColor ?? PAPER.inkTeal;
  const labelCSS    = opts.labelCSS ?? _hexToCSS(labelColor);
  const fillColor   = opts.fillColor ?? PAPER.cream;
  const fillAlpha   = opts.fillAlpha ?? 0.3;
  const strokeWidth = opts.strokeWidth ?? 2;

  const container = scene.add.container(x, y);
  const parsed    = _parseQuestion(question);

  if (!parsed) {
    // Unknown question format — return empty container
    return container;
  }

  const gfx = scene.add.graphics();
  container.add(gfx);

  // Shadow layer (drawn first, offset down)
  const shadowGfx = scene.add.graphics();
  container.addAt(shadowGfx, 0); // behind main gfx

  const half = size / 2;

  switch (parsed.shape) {
    case 'triangle':
      _drawTriangle(gfx, shadowGfx, half, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'square':
      _drawRect(gfx, shadowGfx, half, half, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'rectangle':
      _drawRect(gfx, shadowGfx, half, half * 0.65, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'pentagon':
      _drawRegularPolygon(gfx, shadowGfx, 5, half, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'hexagon':
      _drawRegularPolygon(gfx, shadowGfx, 6, half, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'octagon':
      _drawRegularPolygon(gfx, shadowGfx, 8, half, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    case 'circle':
      _drawCircle(gfx, shadowGfx, half * 0.85, strokeColor, fillColor, fillAlpha, strokeWidth);
      break;
    default:
      break;
  }

  // Add dimension labels
  _addLabels(scene, container, parsed, half, labelCSS);

  return container;
}

// ---------------------------------------------------------------------------
// Question parser — extracts shape + dimensions from question.text
// ---------------------------------------------------------------------------

/**
 * Parse the question text to determine shape, dimensions, and question type.
 *
 * Geometry questions come in these forms (from math.js genGeometry):
 *   "How many sides does a triangle have?"         -> shape identification
 *   "Area of rectangle: 5 × 7 = ?"                -> area, rectangle, w=5, h=7
 *   "Perimeter of square with side 6 = ?"          -> perimeter, square, side=6
 *   "Perimeter of rectangle: 4 and 8 = ?"          -> perimeter, rectangle, w=4, h=8
 */
function _parseQuestion(question) {
  const text = question.text || '';

  // Shape identification: "How many sides does a <shape> have?"
  const sidesMatch = text.match(/how many sides does (?:a|an) (\w+) have/i);
  if (sidesMatch) {
    return {
      shape: sidesMatch[1].toLowerCase(),
      questionType: 'sides',
      dimensions: {},
    };
  }

  // Area of rectangle: "Area of rectangle: W × H = ?"
  const areaMatch = text.match(/area of rectangle:\s*(\d+)\s*[×x]\s*(\d+)/i);
  if (areaMatch) {
    return {
      shape: 'rectangle',
      questionType: 'area',
      dimensions: { w: parseInt(areaMatch[1], 10), h: parseInt(areaMatch[2], 10) },
    };
  }

  // Perimeter of square: "Perimeter of square with side S = ?"
  const perimSquareMatch = text.match(/perimeter of square with side\s*(\d+)/i);
  if (perimSquareMatch) {
    return {
      shape: 'square',
      questionType: 'perimeter',
      dimensions: { side: parseInt(perimSquareMatch[1], 10) },
    };
  }

  // Perimeter of rectangle: "Perimeter of rectangle: W and H = ?"
  const perimRectMatch = text.match(/perimeter of rectangle:\s*(\d+)\s*and\s*(\d+)/i);
  if (perimRectMatch) {
    return {
      shape: 'rectangle',
      questionType: 'perimeter',
      dimensions: { w: parseInt(perimRectMatch[1], 10), h: parseInt(perimRectMatch[2], 10) },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shape drawing functions
// ---------------------------------------------------------------------------

const SHADOW_OFFSET = 3;
const SHADOW_ALPHA  = 0.15;

/** Draw an equilateral-ish triangle centred at origin. */
function _drawTriangle(gfx, shadowGfx, half, stroke, fill, fillAlpha, strokeWidth) {
  // Vertices: top-centre, bottom-left, bottom-right
  const topY    = -half * 0.85;
  const bottomY = half * 0.7;
  const leftX   = -half * 0.85;
  const rightX  = half * 0.85;

  const pts = [
    { x: 0, y: topY },
    { x: leftX, y: bottomY },
    { x: rightX, y: bottomY },
  ];

  // Shadow
  shadowGfx.fillStyle(PAPER.shadow, SHADOW_ALPHA);
  shadowGfx.fillPoints(pts.map(p => ({ x: p.x + SHADOW_OFFSET, y: p.y + SHADOW_OFFSET })), true);

  // Fill + stroke
  gfx.fillStyle(fill, fillAlpha);
  gfx.fillPoints(pts, true);
  gfx.lineStyle(strokeWidth, stroke, 1);
  gfx.strokePoints(pts, true);
}

/** Draw a rectangle (or square when halfW === halfH) centred at origin. */
function _drawRect(gfx, shadowGfx, halfW, halfH, stroke, fill, fillAlpha, strokeWidth) {
  // Shadow
  shadowGfx.fillStyle(PAPER.shadow, SHADOW_ALPHA);
  shadowGfx.fillRect(-halfW + SHADOW_OFFSET, -halfH + SHADOW_OFFSET, halfW * 2, halfH * 2);

  // Fill + stroke
  gfx.fillStyle(fill, fillAlpha);
  gfx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
  gfx.lineStyle(strokeWidth, stroke, 1);
  gfx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
}

/** Draw a regular polygon (pentagon, hexagon, octagon) centred at origin. */
function _drawRegularPolygon(gfx, shadowGfx, sides, radius, stroke, fill, fillAlpha, strokeWidth) {
  const pts = _regularPolygonPoints(sides, radius);

  // Shadow
  shadowGfx.fillStyle(PAPER.shadow, SHADOW_ALPHA);
  shadowGfx.fillPoints(pts.map(p => ({ x: p.x + SHADOW_OFFSET, y: p.y + SHADOW_OFFSET })), true);

  // Fill + stroke
  gfx.fillStyle(fill, fillAlpha);
  gfx.fillPoints(pts, true);
  gfx.lineStyle(strokeWidth, stroke, 1);
  gfx.strokePoints(pts, true);
}

/** Draw a circle centred at origin. */
function _drawCircle(gfx, shadowGfx, radius, stroke, fill, fillAlpha, strokeWidth) {
  // Shadow
  shadowGfx.fillStyle(PAPER.shadow, SHADOW_ALPHA);
  shadowGfx.fillCircle(SHADOW_OFFSET, SHADOW_OFFSET, radius);

  // Fill + stroke
  gfx.fillStyle(fill, fillAlpha);
  gfx.fillCircle(0, 0, radius);
  gfx.lineStyle(strokeWidth, stroke, 1);
  gfx.strokeCircle(0, 0, radius);
}

/** Compute vertices for a regular polygon, top-oriented. */
function _regularPolygonPoints(sides, radius) {
  const pts = [];
  // Start from the top (-PI/2) so the polygon sits flat-base for even-sided shapes
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (2 * Math.PI * i) / sides;
    pts.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Dimension labels
// ---------------------------------------------------------------------------

/**
 * Add dimension labels to the diagram depending on question type.
 */
function _addLabels(scene, container, parsed, half, colorCSS) {
  const labelSize = 16;
  const style = {
    fontFamily: FONT_FAMILY, fontStyle: 'bold',
    fontSize: `${labelSize}px`,
    color: colorCSS,
  };

  const { shape, questionType, dimensions } = parsed;

  if (questionType === 'sides') {
    // Shape identification — show "?" inside the shape
    const q = scene.add.text(0, 0, '?', {
      ...style, fontSize: '22px',
    }).setOrigin(0.5);
    container.add(q);
    return;
  }

  if (questionType === 'area' && shape === 'rectangle') {
    const { w, h } = dimensions;
    // Width label along the bottom
    const wLabel = scene.add.text(0, half * 0.65 + 14, String(w), style).setOrigin(0.5, 0);
    // Height label along the right side
    const hLabel = scene.add.text(half + 12, 0, String(h), style).setOrigin(0, 0.5);
    container.add([wLabel, hLabel]);
    return;
  }

  if (questionType === 'perimeter' && shape === 'square') {
    const { side } = dimensions;
    // Label on bottom and right
    const bLabel = scene.add.text(0, half + 10, String(side), style).setOrigin(0.5, 0);
    const rLabel = scene.add.text(half + 10, 0, String(side), style).setOrigin(0, 0.5);
    container.add([bLabel, rLabel]);
    return;
  }

  if (questionType === 'perimeter' && shape === 'rectangle') {
    const { w, h } = dimensions;
    // Width label along the bottom
    const wLabel = scene.add.text(0, half * 0.65 + 14, String(w), style).setOrigin(0.5, 0);
    // Height label along the right side
    const hLabel = scene.add.text(half + 12, 0, String(h), style).setOrigin(0, 0.5);
    container.add([wLabel, hLabel]);
    return;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a 0xRRGGBB number to a "#rrggbb" CSS string. */
function _hexToCSS(hex) {
  return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
}
