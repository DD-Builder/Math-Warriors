/**
 * Papercut art language — the single source of truth for the game's
 * layered cut-paper aesthetic.
 *
 * THE RULES (every visual in the game follows these):
 *   1. NO dark outlines or strokes. Edges are defined purely by color
 *      contrast and the soft shadow each paper layer casts on the one
 *      beneath it.
 *   2. Every shape sits on a soft teal-tinted drop-shadow (PAPER_SHADOW),
 *      offset straight down a few pixels at ~0.2 alpha.
 *   3. Shapes are organic: smooth, low-frequency flowing curves — never
 *      jagged wobble, never hard geometry. Use blobPoints / waveEdgePoints /
 *      organicRectPoints rather than raw rects and circles.
 *   4. Scenes are built as nested layers, each inset from the last, each
 *      shadowing the layer below (drawLayeredFrame is the canonical form).
 *   5. Colors come ONLY from the PAPER palette in config.js.
 *
 * Geometry helpers here are pure (seeded, deterministic, no Phaser/DOM)
 * so they are unit-testable. Drawing helpers take a Phaser Graphics
 * object; ctx helpers at the bottom serve the offscreen-canvas renderers.
 */

import { makeRng } from './rng.js';
import { PAPER, PAPER_CSS, PAPER_SHADOW } from '../config.js';

export { PAPER, PAPER_CSS, PAPER_SHADOW };

// ──────────────────────────────────────────────────────────────────
// GEOMETRY (pure, seeded, deterministic)
// ──────────────────────────────────────────────────────────────────

/**
 * Smooth organic blob — an ellipse whose radius breathes with two or
 * three low-frequency harmonics. This is the basic "cut paper shape".
 *
 * opts: { seed=1, points=48, wobble=0.12 }  wobble is a fraction of radius.
 */
export function blobPoints(cx, cy, rx, ry, opts = {}) {
  const seed = opts.seed ?? 1;
  const n = opts.points ?? 48;
  const wobble = opts.wobble ?? 0.12;
  const rng = makeRng(seed);
  const harmonics = [
    { f: 2, a: wobble * (0.5 + rng() * 0.5), p: rng() * Math.PI * 2 },
    { f: 3, a: wobble * 0.6 * rng(), p: rng() * Math.PI * 2 },
    { f: 5, a: wobble * 0.3 * rng(), p: rng() * Math.PI * 2 },
  ];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let m = 1;
    for (const h of harmonics) m += Math.sin(a * h.f + h.p) * h.a;
    pts.push({ x: cx + Math.cos(a) * rx * m, y: cy + Math.sin(a) * ry * m });
  }
  return pts;
}

/**
 * A flowing wave edge from x0 to x1 around baseY — the top of a hill,
 * the rim of a paper layer. Two blended sines, smooth and slow.
 *
 * opts: { seed=1, amplitude=18, step=14 }
 */
export function waveEdgePoints(x0, x1, baseY, opts = {}) {
  const seed = opts.seed ?? 1;
  const amp = opts.amplitude ?? 18;
  const step = opts.step ?? 14;
  const rng = makeRng(seed);
  const f1 = 1 + rng() * 1.5, f2 = 2.5 + rng() * 2;
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
  const w = Math.max(1, x1 - x0);
  const pts = [];
  for (let x = x0; x < x1; x += step) {
    const t = ((x - x0) / w) * Math.PI * 2;
    pts.push({ x, y: baseY + Math.sin(t * f1 + p1) * amp + Math.sin(t * f2 + p2) * amp * 0.4 });
  }
  const tEnd = Math.PI * 2;
  pts.push({ x: x1, y: baseY + Math.sin(tEnd * f1 + p1) * amp + Math.sin(tEnd * f2 + p2) * amp * 0.4 });
  return pts;
}

/**
 * A closed hill polygon: flowing wave top, flat bottom. Stack several
 * of these light-to-dark for the layered rolling hills of the reference.
 */
export function hillPoints(x0, x1, topY, bottomY, opts = {}) {
  const pts = waveEdgePoints(x0, x1, topY, opts);
  pts.push({ x: x1, y: bottomY }, { x: x0, y: bottomY });
  return pts;
}

/**
 * Organic rounded rectangle — a superellipse perturbed by gentle
 * harmonics. The canonical panel / frame-layer shape.
 *
 * opts: { seed=1, points=64, wobble=8 (px), roundness=4 }
 * Higher roundness → squarer corners; 2 is a pure ellipse.
 */
export function organicRectPoints(cx, cy, w, h, opts = {}) {
  const seed = opts.seed ?? 1;
  const n = opts.points ?? 64;
  const wobble = opts.wobble ?? 8;
  const e = opts.roundness ?? 4;
  const rng = makeRng(seed);
  const h1 = { f: 3, a: wobble * (0.6 + rng() * 0.4), p: rng() * Math.PI * 2 };
  const h2 = { f: 6, a: wobble * 0.5 * rng(), p: rng() * Math.PI * 2 };
  const k = 2 / e;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = Math.sign(ca) * Math.pow(Math.abs(ca), k) * (w / 2);
    const py = Math.sign(sa) * Math.pow(Math.abs(sa), k) * (h / 2);
    const d = Math.sin(a * h1.f + h1.p) * h1.a + Math.sin(a * h2.f + h2.p) * h2.a;
    const len = Math.hypot(px, py) || 1;
    pts.push({ x: cx + px + (px / len) * d, y: cy + py + (py / len) * d });
  }
  return pts;
}

/** Rotate an array of points around (cx, cy) by angle radians. */
export function rotatePoints(pts, cx, cy, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return pts.map(p => ({
    x: cx + (p.x - cx) * c - (p.y - cy) * s,
    y: cy + (p.x - cx) * s + (p.y - cy) * c,
  }));
}

// ──────────────────────────────────────────────────────────────────
// PHASER DRAWING PRIMITIVES
// ──────────────────────────────────────────────────────────────────

/**
 * Fill a polygon with the papercut soft shadow beneath it.
 * Two offset shadow passes approximate a blurred edge.
 *
 * opts: { alpha=1, shadowDy=PAPER_SHADOW.dy, shadowDx=0,
 *         shadowAlpha=PAPER_SHADOW.alpha, shadowColor, soft=true }
 * Pass shadowAlpha: 0 to skip the shadow.
 */
export function drawShadowedPoly(gfx, pts, color, opts = {}) {
  const dx = opts.shadowDx ?? PAPER_SHADOW.dx;
  const dy = opts.shadowDy ?? PAPER_SHADOW.dy;
  const sa = opts.shadowAlpha ?? PAPER_SHADOW.alpha;
  const sc = opts.shadowColor ?? PAPER_SHADOW.color;
  if (sa > 0) {
    if (opts.soft !== false) {
      gfx.fillStyle(sc, sa * 0.45);
      gfx.fillPoints(pts.map(p => ({ x: p.x + dx * 1.6, y: p.y + dy * 1.6 })), true);
    }
    gfx.fillStyle(sc, sa);
    gfx.fillPoints(pts.map(p => ({ x: p.x + dx, y: p.y + dy })), true);
  }
  gfx.fillStyle(color, opts.alpha ?? 1);
  gfx.fillPoints(pts, true);
}

/** Shadowed organic blob — the workhorse shape. */
export function drawShadowedBlob(gfx, cx, cy, rx, ry, color, opts = {}) {
  drawShadowedPoly(gfx, blobPoints(cx, cy, rx, ry, opts), color, opts);
}

/**
 * The signature reference composition: nested organic frame layers,
 * outermost first, each casting a shadow on the one before.
 *
 * layers: [{ color, inset=36, wobble }] outermost → innermost.
 * Returns the inner content rect { x, y, w, h } left after all insets.
 */
export function drawLayeredFrame(gfx, cx, cy, w, h, layers, opts = {}) {
  let cw = w, ch = h;
  layers.forEach((layer, i) => {
    const pts = organicRectPoints(cx, cy, cw, ch, {
      seed: (opts.seed ?? 7) + i * 31,
      wobble: layer.wobble ?? opts.wobble ?? 10,
      points: 72,
      roundness: opts.roundness ?? 4,
    });
    drawShadowedPoly(gfx, pts, layer.color, {
      shadowDy: 7,
      shadowAlpha: i === 0 ? (opts.outerShadow ?? 0.18) : 0.22,
    });
    const inset = layer.inset ?? 36;
    cw -= inset * 2;
    ch -= inset * 2;
  });
  return { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
}

/**
 * Draw a deeply nested shadow-box diorama frame.
 * This is THE framing device for the entire game.
 *
 * Each layer is an organicRectPoints blob. Between each pair of layers,
 * a darkened inner-shadow border is drawn INSIDE the cutout — simulated
 * by drawing a slightly smaller shadow-colored version of the OUTER
 * layer's shape before painting the next smaller layer on top.
 *
 * @param {Phaser.Graphics} gfx
 * @param {number} cx — center x
 * @param {number} cy — center y
 * @param {number} w — outer width
 * @param {number} h — outer height
 * @param {object} opts
 *   layers: number of nested frames (default 5)
 *   colors: array of colors outer→inner
 *           (default: sage → cream → tealL → teal → forest → forestD)
 *   inset: px per layer (default: 32)
 *   seed: deterministic shape seed (default: 7)
 *   shadowAlpha: inter-layer shadow strength (default: 0.30)
 *   roundness: superellipse roundness (default: 3)
 * @returns {{ innerRect: {x,y,w,h} }} — the content area inside all frames
 */
export function drawShadowBox(gfx, cx, cy, w, h, opts = {}) {
  const layerCount = opts.layers ?? 5;
  const defaultColors = [
    PAPER.sage, PAPER.cream, PAPER.tealL, PAPER.teal, PAPER.forest, PAPER.forestD,
  ];
  const colors = opts.colors ?? defaultColors.slice(0, Math.max(layerCount, 1));
  const inset = opts.inset ?? 32;
  const baseSeed = opts.seed ?? 7;
  const shadowAlpha = opts.shadowAlpha ?? 0.30;
  const roundness = opts.roundness ?? 3;

  let cw = w, ch = h;
  const numLayers = Math.min(colors.length, layerCount);

  for (let i = 0; i < numLayers; i++) {
    const layerSeed = baseSeed + i * 31;

    // Generate this layer's organic rect
    const pts = organicRectPoints(cx, cy, cw, ch, {
      seed: layerSeed,
      wobble: 10,
      points: 72,
      roundness,
    });

    // Outer drop shadow (first layer only)
    if (i === 0) {
      drawShadowedPoly(gfx, pts, colors[i], {
        shadowDy: 8,
        shadowAlpha: 0.18,
      });
    } else {
      // Draw the layer fill without its own drop shadow
      gfx.fillStyle(colors[i], 1);
      gfx.fillPoints(pts, true);
    }

    // Inner shadow: draw a slightly inset version of this SAME layer shape
    // in the shadow color to simulate shadow falling INTO the cutout.
    // This appears as a darkened border inside the current layer before the
    // next layer covers most of it.
    if (i < numLayers - 1) {
      const shadowInset = inset * 0.55;
      const shadowPts = organicRectPoints(cx, cy, cw - shadowInset * 2, ch - shadowInset * 2, {
        seed: layerSeed + 1000,
        wobble: 8,
        points: 72,
        roundness,
      });
      gfx.fillStyle(PAPER.shadow, shadowAlpha);
      gfx.fillPoints(shadowPts, true);
    }

    cw -= inset * 2;
    ch -= inset * 2;
  }

  return {
    innerRect: {
      x: cx - cw / 2,
      y: cy - ch / 2,
      w: cw,
      h: ch,
    },
  };
}

/**
 * Layered rolling hills, back to front. Each layer's wave top casts a
 * shadow on the layer behind it.
 *
 * layers: [{ color, topY, amplitude?, seed? }] back → front.
 */
export function drawPapercutHills(gfx, x0, x1, bottomY, layers, opts = {}) {
  layers.forEach((layer, i) => {
    const pts = hillPoints(x0, x1, layer.topY, bottomY, {
      seed: layer.seed ?? (opts.seed ?? 3) + i * 13,
      amplitude: layer.amplitude ?? 16,
    });
    drawShadowedPoly(gfx, pts, layer.color, { shadowDy: -7, shadowDx: 0, shadowAlpha: 0.2 });
  });
}

// ──────────────────────────────────────────────────────────────────
// SHARED MOTIFS — trees, flowers, butterflies, sprigs
// These appear across the title, world map, mazes and cutscenes;
// drawing them from one place keeps the whole game 1:1 consistent.
// ──────────────────────────────────────────────────────────────────

/**
 * A papercut tree. Styles:
 *   'round'  — branching pale trunk with a cluster of canopy blobs
 *   'pine'   — three stacked soft triangles
 *   'sapling'— thin trunk, single small canopy
 *
 * opts: { seed, style, canopy, canopyHi, trunk, shadowAlpha }
 */
export function drawPapercutTree(gfx, x, baseY, height, opts = {}) {
  const seed = opts.seed ?? 1;
  const style = opts.style ?? 'round';
  const canopy = opts.canopy ?? PAPER.forest;
  const canopyHi = opts.canopyHi;
  const trunk = opts.trunk ?? PAPER.creamD;
  const topY = baseY - height;

  if (style === 'pine') {
    const w = height * 0.42;
    for (let i = 2; i >= 0; i--) {
      const ty = topY + (i / 3.4) * height;
      const tw = w * (0.45 + i * 0.3);
      const th = height * 0.42;
      const pts = [
        { x, y: ty },
        { x: x + tw, y: ty + th },
        { x: x + tw * 0.6, y: ty + th * 1.04 },
        { x, y: ty + th * 0.92 },
        { x: x - tw * 0.6, y: ty + th * 1.04 },
        { x: x - tw, y: ty + th },
      ];
      drawShadowedPoly(gfx, pts, i % 2 === 0 ? canopy : (canopyHi ?? canopy), {
        shadowDy: 5, shadowAlpha: opts.shadowAlpha ?? 0.2,
      });
    }
    const tw = height * 0.05 + 1.5;
    drawShadowedPoly(gfx, [
      { x: x - tw, y: baseY }, { x: x - tw * 0.6, y: baseY - height * 0.18 },
      { x: x + tw * 0.6, y: baseY - height * 0.18 }, { x: x + tw, y: baseY },
    ], trunk, { shadowDy: 3, shadowAlpha: 0.16 });
    return;
  }

  // Trunk: tapered, with two short branch arms reaching into the canopy
  const tw = height * 0.055 + 2;
  drawShadowedPoly(gfx, [
    { x: x - tw, y: baseY },
    { x: x - tw * 0.5, y: baseY - height * 0.5 },
    { x: x - tw * 0.28, y: topY + height * 0.3 },
    { x: x + tw * 0.28, y: topY + height * 0.3 },
    { x: x + tw * 0.5, y: baseY - height * 0.5 },
    { x: x + tw, y: baseY },
  ], trunk, { shadowDy: 3, shadowAlpha: 0.18 });
  const branchY = baseY - height * 0.52;
  drawShadowedPoly(gfx, [
    { x: x - tw * 0.4, y: branchY },
    { x: x - height * 0.16, y: branchY - height * 0.16 },
    { x: x - height * 0.14, y: branchY - height * 0.2 },
    { x: x + tw * 0.1, y: branchY - height * 0.04 },
  ], trunk, { shadowDy: 2, shadowAlpha: 0.14 });
  drawShadowedPoly(gfx, [
    { x: x + tw * 0.4, y: branchY + height * 0.06 },
    { x: x + height * 0.15, y: branchY - height * 0.1 },
    { x: x + height * 0.13, y: branchY - height * 0.14 },
    { x: x - tw * 0.1, y: branchY + height * 0.02 },
  ], trunk, { shadowDy: 2, shadowAlpha: 0.14 });

  if (style === 'sapling') {
    drawShadowedBlob(gfx, x, topY + height * 0.2, height * 0.24, height * 0.22, canopy,
      { seed, wobble: 0.12, shadowDy: 4, shadowAlpha: opts.shadowAlpha ?? 0.2 });
    return;
  }

  // 'round': multi-tone layered canopy blobs (2-3 stacked tones per cluster)
  // Deepest tone first (forestD), then mid (canopy/forest), then highlights.
  const cy0 = topY + height * 0.24;
  const r = height * 0.27;
  const sa = opts.shadowAlpha ?? 0.2;

  // Derive canopy tones: darkest base, mid, and light highlight
  const canopyDark = opts.canopyDark ?? PAPER.forestD;
  const canopyMid = canopy;
  const canopyLight = canopyHi ?? PAPER.forestL;

  // Layer 1 (back): dark base canopy — slightly larger, offset down
  const darkCluster = [
    [-0.6, 0.44, 0.78], [0.65, 0.4, 0.82], [0, 0.12, 1.08],
  ];
  darkCluster.forEach((c, i) => {
    drawShadowedPoly(
      gfx,
      blobPoints(x + c[0] * r, cy0 + c[1] * r, r * c[2], r * c[2] * 0.92, { seed: seed + i * 13, wobble: 0.1 }),
      canopyDark,
      { shadowDy: 6, shadowAlpha: sa }
    );
  });

  // Layer 2 (mid): main canopy color — the core cluster
  const midCluster = [
    [-0.72, 0.28, 0.7], [0.72, 0.24, 0.74], [0, -0.04, 1],
    [0.3, -0.52, 0.58], [-0.34, -0.46, 0.55],
  ];
  midCluster.forEach((c, i) => {
    drawShadowedPoly(
      gfx,
      blobPoints(x + c[0] * r, cy0 + c[1] * r, r * c[2], r * c[2] * 0.92, { seed: seed + i * 17 + 100, wobble: 0.1 }),
      canopyMid,
      { shadowDy: 5, shadowAlpha: sa }
    );
  });

  // Layer 3 (front): light highlights — small patches on top
  const hiCluster = [
    [-0.25, -0.3, 0.42], [0.3, -0.1, 0.38], [-0.1, 0.15, 0.34],
  ];
  hiCluster.forEach((c, i) => {
    drawShadowedPoly(
      gfx,
      blobPoints(x + c[0] * r, cy0 + c[1] * r, r * c[2], r * c[2] * 0.85, { seed: seed + i * 19 + 200, wobble: 0.12 }),
      canopyLight,
      { shadowDy: 3, shadowAlpha: sa * 0.6 }
    );
  });
}

/**
 * A papercut flower: a ring of petal blobs around a center dot,
 * optional stem with a leaf.
 *
 * opts: { seed, petals=5, color, center, rotation, stem (length px), stemColor }
 */
export function drawPapercutFlower(gfx, x, y, r, opts = {}) {
  const seed = opts.seed ?? 1;
  const petals = opts.petals ?? 5;
  const color = opts.color ?? PAPER.coral;
  const center = opts.center ?? PAPER.gold;

  if (opts.stem) {
    const sx = r * 0.12 + 1;
    drawShadowedPoly(gfx, [
      { x: x - sx, y }, { x: x + sx, y },
      { x: x + sx * 0.6, y: y + opts.stem }, { x: x - sx * 0.6, y: y + opts.stem },
    ], opts.stemColor ?? PAPER.leaf, { shadowDy: 2, shadowAlpha: 0.14 });
    drawShadowedPoly(
      gfx,
      rotatePoints(blobPoints(x + r * 0.9, y + opts.stem * 0.55, r * 0.55, r * 0.26, { seed: seed + 5, wobble: 0.1 }),
        x + r * 0.4, y + opts.stem * 0.55, -0.5),
      opts.stemColor ?? PAPER.leaf, { shadowDy: 2, shadowAlpha: 0.14 }
    );
  }

  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + (opts.rotation ?? 0);
    const px = x + Math.cos(a) * r * 0.62;
    const py = y + Math.sin(a) * r * 0.62;
    drawShadowedPoly(
      gfx,
      rotatePoints(blobPoints(px, py, r * 0.5, r * 0.4, { seed: seed + i * 7, wobble: 0.1 }), px, py, a),
      color,
      { shadowDy: 2.5, shadowAlpha: 0.16 }
    );
  }
  drawShadowedBlob(gfx, x, y, r * 0.34, r * 0.34, center, { seed: seed + 99, wobble: 0.08, shadowDy: 2, shadowAlpha: 0.15 });
}

/**
 * A papercut butterfly: two large upper wings, two small lower wings,
 * slim body. opts: { seed, color, accent, tilt (radians) }
 * Returns nothing; for animated butterflies draw onto a Graphics inside
 * a container and tween the container.
 */
export function drawButterfly(gfx, x, y, size, opts = {}) {
  const seed = opts.seed ?? 1;
  const color = opts.color ?? PAPER.white;
  const accent = opts.accent ?? color;
  const tilt = opts.tilt ?? 0;
  const wing = (dx, dy, rx, ry, col, sd) => {
    const cx = x + dx, cy = y + dy;
    let pts = blobPoints(cx, cy, rx, ry, { seed: sd, wobble: 0.1, points: 24 });
    pts = rotatePoints(pts, x, y, tilt);
    drawShadowedPoly(gfx, pts, col, { shadowDy: 2.5, shadowAlpha: 0.16 });
  };
  wing(-size * 0.5, -size * 0.28, size * 0.5, size * 0.38, color, seed + 1);
  wing(size * 0.5, -size * 0.28, size * 0.5, size * 0.38, color, seed + 2);
  wing(-size * 0.34, size * 0.3, size * 0.32, size * 0.26, accent, seed + 3);
  wing(size * 0.34, size * 0.3, size * 0.32, size * 0.26, accent, seed + 4);
  let body = blobPoints(x, y, size * 0.09, size * 0.42, { seed: seed + 5, wobble: 0.06, points: 16 });
  body = rotatePoints(body, x, y, tilt);
  drawShadowedPoly(gfx, body, PAPER.inkTeal, { shadowAlpha: 0, alpha: 0.85 });
}

/**
 * A leaf sprig: a thin curved stem with alternating leaf blobs.
 * opts: { seed, color, leaves=5, angle (radians, 0 = up) }
 */
export function drawLeafSprig(gfx, x, y, length, opts = {}) {
  const seed = opts.seed ?? 1;
  const color = opts.color ?? PAPER.leaf;
  const leaves = opts.leaves ?? 5;
  const angle = opts.angle ?? 0;
  const dirX = Math.sin(angle), dirY = -Math.cos(angle);
  const sw = Math.max(1.5, length * 0.025);
  const tipX = x + dirX * length, tipY = y + dirY * length;
  drawShadowedPoly(gfx, [
    { x: x - dirY * sw, y: y + dirX * sw },
    { x: x + dirY * sw, y: y - dirX * sw },
    { x: tipX + dirY * sw * 0.4, y: tipY - dirX * sw * 0.4 },
    { x: tipX - dirY * sw * 0.4, y: tipY + dirX * sw * 0.4 },
  ], color, { shadowDy: 2, shadowAlpha: 0.14 });
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 1);
    const lx = x + dirX * length * t;
    const ly = y + dirY * length * t;
    const side = i % 2 === 0 ? 1 : -1;
    const lr = length * 0.13 * (1 - t * 0.4);
    const off = lr * 0.9;
    const cx = lx - dirY * off * side, cy = ly + dirX * off * side;
    drawShadowedPoly(
      gfx,
      rotatePoints(blobPoints(cx, cy, lr, lr * 0.5, { seed: seed + i * 3, wobble: 0.1, points: 18 }),
        cx, cy, angle + side * 0.9),
      color, { shadowDy: 2, shadowAlpha: 0.14 }
    );
  }
}

// ──────────────────────────────────────────────────────────────────
// CANVAS 2D HELPERS — for the offscreen hero/monster renderers
// ──────────────────────────────────────────────────────────────────

/** Apply the papercut soft shadow to a ctx (genuinely blurred). */
export function softShadowCtx(ctx, opts = {}) {
  ctx.shadowColor = `rgba(31, 61, 63, ${opts.alpha ?? 0.35})`;
  ctx.shadowBlur = opts.blur ?? 8;
  ctx.shadowOffsetX = opts.dx ?? 0;
  ctx.shadowOffsetY = opts.dy ?? 5;
}

/** Clear any shadow state on a ctx. */
export function clearShadowCtx(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Fill a smooth path through {x, y} points on a 2D context with the
 * papercut shadow. Midpoint quadratic curves keep edges flowing.
 * Pass shadow: false to skip the shadow pass.
 */
export function fillPtsCtx(ctx, pts, cssColor, shadow = {}) {
  ctx.save();
  if (shadow !== false) softShadowCtx(ctx, shadow || {});
  ctx.fillStyle = cssColor;
  ctx.beginPath();
  const n = pts.length;
  ctx.moveTo((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
