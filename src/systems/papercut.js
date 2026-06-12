/**
 * Papercut rendering utilities — true layered cut-paper diorama aesthetic.
 *
 * Every background is built from the PAPER palette (config.js), with:
 *   - Organic rolling hills via papercutArt helpers
 *   - Soft teal-tinted drop shadows (~0.2 alpha, straight down)
 *   - NO dark outlines or strokes anywhere
 *   - Muted harmonious colors only
 */

import { makeRng } from './rng.js';
import { PAPER, PAPER_SHADOW } from '../config.js';
import {
  blobPoints, waveEdgePoints, hillPoints, organicRectPoints,
  drawShadowedPoly, drawShadowedBlob, drawPapercutHills,
  drawLayeredFrame, drawPapercutTree, drawPapercutFlower,
  drawButterfly, drawLeafSprig,
} from './papercutArt.js';

// ================================================================
// PALETTE PRESETS PER FLOOR — all from PAPER
// ================================================================

export const FLOOR_PALETTES = {
  menu: {
    sky:     PAPER.cream,
    skyGlow: PAPER.sand,
    layers: [
      { color: PAPER.forestD, shadow: PAPER.shadow, peakH: 0.18, peaks: 3 },
      { color: PAPER.forest,  shadow: PAPER.shadow, peakH: 0.22, peaks: 4 },
      { color: PAPER.forestL, shadow: PAPER.shadow, peakH: 0.16, peaks: 5 },
      { color: PAPER.leaf,    shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.sage,
    trees:   PAPER.forest,
    treesL:  PAPER.forestL,
    accent:  PAPER.coral,
    cloud:   PAPER.white,
    glow:    PAPER.gold,
    glowAlpha: 0.35,
    fog:     PAPER.shadow,
  },
  1: { // Garden — sage/green rolling hills, cream sky
    sky:     PAPER.cream,
    skyGlow: PAPER.sand,
    layers: [
      { color: PAPER.forestD, shadow: PAPER.shadow, peakH: 0.18, peaks: 3 },
      { color: PAPER.forest,  shadow: PAPER.shadow, peakH: 0.22, peaks: 4 },
      { color: PAPER.forestL, shadow: PAPER.shadow, peakH: 0.16, peaks: 5 },
      { color: PAPER.leaf,    shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.sage,
    trees:   PAPER.forest,
    treesL:  PAPER.forestL,
    accent:  PAPER.coral,
    cloud:   PAPER.white,
    glow:    PAPER.gold,
    glowAlpha: 0.35,
    fog:     PAPER.shadow,
  },
  2: { // Tidepool — teal waves, sky-tinted
    sky:     PAPER.sky,
    skyGlow: PAPER.tealL,
    layers: [
      { color: PAPER.tealD,  shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.teal,   shadow: PAPER.shadow, peakH: 0.20, peaks: 3 },
      { color: PAPER.tealL,  shadow: PAPER.shadow, peakH: 0.16, peaks: 4 },
      { color: PAPER.sage,   shadow: PAPER.shadow, peakH: 0.12, peaks: 3 },
    ],
    ground:  PAPER.tealL,
    trees:   PAPER.teal,
    treesL:  PAPER.tealL,
    accent:  PAPER.peach,
    cloud:   PAPER.white,
    glow:    PAPER.sky,
    glowAlpha: 0.30,
    fog:     PAPER.shadow,
  },
  3: { // Cloud — cream/sky, airy
    sky:     PAPER.cream,
    skyGlow: PAPER.white,
    layers: [
      { color: PAPER.sky,    shadow: PAPER.shadow, peakH: 0.12, peaks: 4 },
      { color: PAPER.tealL,  shadow: PAPER.shadow, peakH: 0.18, peaks: 3 },
      { color: PAPER.sage,   shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.sageD,  shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.creamD,
    trees:   PAPER.sage,
    treesL:  PAPER.sageD,
    accent:  PAPER.gold,
    cloud:   PAPER.white,
    glow:    PAPER.gold,
    glowAlpha: 0.30,
    fog:     PAPER.shadow,
  },
  4: { // Ember — coral/orange paper (never red/black)
    sky:     PAPER.sand,
    skyGlow: PAPER.peach,
    layers: [
      { color: PAPER.coralD,  shadow: PAPER.shadow, peakH: 0.20, peaks: 4 },
      { color: PAPER.coral,   shadow: PAPER.shadow, peakH: 0.18, peaks: 3 },
      { color: PAPER.peach,   shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.orange,  shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.coralD,
    trees:   PAPER.coral,
    treesL:  PAPER.peach,
    accent:  PAPER.gold,
    cloud:   PAPER.creamD,
    glow:    PAPER.orange,
    glowAlpha: 0.35,
    fog:     PAPER.shadow,
  },
  5: { // Frozen Peak — teal/sky icy
    sky:     PAPER.cream,
    skyGlow: PAPER.sky,
    layers: [
      { color: PAPER.tealD,  shadow: PAPER.shadow, peakH: 0.16, peaks: 4 },
      { color: PAPER.teal,   shadow: PAPER.shadow, peakH: 0.20, peaks: 3 },
      { color: PAPER.tealL,  shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.sky,    shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.sky,
    trees:   PAPER.teal,
    treesL:  PAPER.tealL,
    accent:  PAPER.white,
    cloud:   PAPER.white,
    glow:    PAPER.sky,
    glowAlpha: 0.25,
    fog:     PAPER.shadow,
  },
  6: { // Crystal Caverns — lavender/teal
    sky:     PAPER.lavenderD,
    skyGlow: PAPER.lavender,
    layers: [
      { color: PAPER.tealD,     shadow: PAPER.shadow, peakH: 0.18, peaks: 4 },
      { color: PAPER.inkTeal,   shadow: PAPER.shadow, peakH: 0.22, peaks: 3 },
      { color: PAPER.teal,      shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.lavenderD, shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.lavender,
    trees:   PAPER.teal,
    treesL:  PAPER.tealL,
    accent:  PAPER.lavender,
    cloud:   PAPER.sky,
    glow:    PAPER.lavender,
    glowAlpha: 0.30,
    fog:     PAPER.shadow,
  },
  7: { // Market Square — warm gold/peach
    sky:     PAPER.cream,
    skyGlow: PAPER.peach,
    layers: [
      { color: PAPER.sand,    shadow: PAPER.shadow, peakH: 0.16, peaks: 4 },
      { color: PAPER.peach,   shadow: PAPER.shadow, peakH: 0.20, peaks: 3 },
      { color: PAPER.orange,  shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.gold,    shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.sand,
    trees:   PAPER.forestL,
    treesL:  PAPER.leaf,
    accent:  PAPER.gold,
    cloud:   PAPER.white,
    glow:    PAPER.gold,
    glowAlpha: 0.35,
    fog:     PAPER.shadow,
  },
  8: { // Infinity Library — sand/creamD, warm candlelit
    sky:     PAPER.sand,
    skyGlow: PAPER.creamD,
    layers: [
      { color: PAPER.forestD, shadow: PAPER.shadow, peakH: 0.18, peaks: 4 },
      { color: PAPER.forest,  shadow: PAPER.shadow, peakH: 0.22, peaks: 3 },
      { color: PAPER.sand,    shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.creamD,  shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.sand,
    trees:   PAPER.forestL,
    treesL:  PAPER.leaf,
    accent:  PAPER.orange,
    cloud:   PAPER.creamD,
    glow:    PAPER.orange,
    glowAlpha: 0.30,
    fog:     PAPER.shadow,
  },
  9: { // The Mending Room — tealD + lavender + night
    sky:     PAPER.tealD,
    skyGlow: PAPER.lavenderD,
    layers: [
      { color: PAPER.inkTeal,   shadow: PAPER.shadow, peakH: 0.16, peaks: 4 },
      { color: PAPER.tealD,     shadow: PAPER.shadow, peakH: 0.22, peaks: 3 },
      { color: PAPER.lavenderD, shadow: PAPER.shadow, peakH: 0.14, peaks: 5 },
      { color: PAPER.lavender,  shadow: PAPER.shadow, peakH: 0.10, peaks: 3 },
    ],
    ground:  PAPER.tealD,
    trees:   PAPER.teal,
    treesL:  PAPER.tealL,
    accent:  PAPER.rose,
    cloud:   PAPER.sky,
    glow:    PAPER.lavender,
    glowAlpha: 0.30,
    fog:     PAPER.shadow,
  },
};

// ================================================================
// HELPER: draw a papercut diorama background for a battle floor
// ================================================================

/**
 * Draw a complete papercut diorama background onto the scene.
 */
export function drawPapercutBackground(scene, floorId, width, height, seed = 42) {
  const pal = FLOOR_PALETTES[floorId] || FLOOR_PALETTES[1];
  const rng = makeRng(seed + floorId * 1000);
  const gfx = scene.add.graphics();

  // ── Page background ──
  gfx.fillStyle(pal.sky, 1);
  gfx.fillRect(0, 0, width, height);

  // ── Central glow ──
  const cx = width * 0.5;
  const cy = height * 0.35;
  const glowR = Math.min(width, height) * 0.6;
  for (let ring = 8; ring >= 1; ring--) {
    const r = glowR * (ring / 8);
    const alpha = pal.glowAlpha * (1 - ring / 10) * 0.6;
    gfx.fillStyle(pal.skyGlow, alpha);
    gfx.fillCircle(cx, cy, r);
  }
  gfx.fillStyle(pal.glow, pal.glowAlpha * 0.4);
  gfx.fillCircle(cx, cy, glowR * 0.15);

  // ── Clouds ──
  for (let i = 0; i < 4; i++) {
    const bx = width * (0.1 + rng() * 0.8);
    const by = height * (0.06 + rng() * 0.14);
    const bw = 50 + rng() * 70;
    const bh = 12 + rng() * 10;
    drawShadowedBlob(gfx, bx, by, bw, bh, pal.cloud, {
      seed: seed + i * 17, wobble: 0.15, shadowAlpha: 0.12, shadowDy: 4,
    });
  }

  // ── Night floors (5, 6, 9): cream stars ──
  if (floorId === 5 || floorId === 6 || floorId === 9) {
    for (let i = 0; i < 30; i++) {
      const sx = rng() * width;
      const sy = rng() * height * 0.4;
      const sr = 1 + rng() * 1.5;
      gfx.fillStyle(PAPER.cream, 0.4 + rng() * 0.4);
      gfx.fillCircle(sx, sy, sr);
    }
  }

  // ── Rolling hill layers (back → front) ──
  const hillLayers = [];
  for (let li = 0; li < pal.layers.length; li++) {
    const layer = pal.layers[li];
    hillLayers.push({
      color: layer.color,
      topY: height * (0.38 + li * 0.11),
      amplitude: height * layer.peakH,
      seed: seed + li * 13 + floorId * 7,
    });
  }
  drawPapercutHills(gfx, -30, width + 30, height, hillLayers, { seed });

  // ── Ground plane ──
  const groundY = height * 0.78;
  const groundPts = hillPoints(-30, width + 30, groundY, height, {
    seed: seed + 99, amplitude: 8,
  });
  drawShadowedPoly(gfx, groundPts, pal.ground, { shadowDy: -6, shadowAlpha: 0.18 });

  // ── Trees on sides ──
  const treeStyles = ['round', 'pine', 'sapling'];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const tx = side < 0
      ? width * (0.03 + rng() * 0.15)
      : width * (0.82 + rng() * 0.15);
    const th = 50 + rng() * 60;
    drawPapercutTree(gfx, tx, groundY - rng() * 8, th, {
      seed: seed + i * 31,
      style: treeStyles[i % 3],
      canopy: pal.trees,
      canopyHi: pal.treesL,
      trunk: PAPER.creamD,
    });
  }

  // ── Flowers ──
  for (let i = 0; i < 10; i++) {
    const fx = width * (0.05 + rng() * 0.9);
    const fy = groundY - rng() * 8;
    drawPapercutFlower(gfx, fx, fy, 4 + rng() * 5, {
      seed: seed + i * 11,
      color: pal.accent,
      center: PAPER.gold,
      stem: 6 + rng() * 5,
      stemColor: PAPER.leaf,
    });
  }

  // ── Accent dots ──
  for (let i = 0; i < 8; i++) {
    const ax = width * (0.05 + rng() * 0.9);
    const ay = groundY - rng() * height * 0.06;
    gfx.fillStyle(pal.accent, 0.5 + rng() * 0.3);
    gfx.fillCircle(ax, ay, 2 + rng() * 3);
  }

  return gfx;
}

// ================================================================
// WORLD MAP DIORAMA SCENES
// ================================================================

/**
 * Screen 1 — Enchanted Garden: sage page, 8 rolling hills, trees,
 * flowers, butterflies. Full reference papercut palette.
 */
export function drawWorldMapGarden(scene, width, height, seed = 500) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;

  // ── Pale sage page background ──
  gfx.fillStyle(PAPER.sage, 1);
  gfx.fillRect(0, 0, W, H);

  // ── Warm glow center ──
  const glowR = Math.min(W, H) * 0.6;
  for (let ring = 8; ring >= 1; ring--) {
    const r = glowR * (ring / 8);
    gfx.fillStyle(PAPER.gold, 0.06 * (1 - ring / 10));
    gfx.fillCircle(W * 0.5, H * 0.30, r);
  }

  // ── Clouds ──
  for (let i = 0; i < 5; i++) {
    drawShadowedBlob(gfx, W * (0.08 + rng() * 0.84), H * (0.06 + rng() * 0.14),
      55 + rng() * 70, 14 + rng() * 10, PAPER.white, {
        seed: seed + i * 19, wobble: 0.14, shadowAlpha: 0.12, shadowDy: 4,
      });
  }

  // ── 8 layered rolling hills (back → front) ──
  const hillDefs = [
    { color: PAPER.forestD, topY: H * 0.34, amp: 22, sd: 1 },
    { color: PAPER.forest,  topY: H * 0.40, amp: 20, sd: 2 },
    { color: PAPER.forestL, topY: H * 0.47, amp: 18, sd: 3 },
    { color: PAPER.leaf,    topY: H * 0.53, amp: 16, sd: 4 },
    { color: PAPER.sage,    topY: H * 0.60, amp: 14, sd: 5 },
    { color: PAPER.sageD,   topY: H * 0.67, amp: 12, sd: 6 },
    { color: PAPER.sage,    topY: H * 0.74, amp: 10, sd: 7 },
    { color: PAPER.cream,   topY: H * 0.82, amp: 6,  sd: 8 },
  ];
  drawPapercutHills(gfx, -30, W + 30, H, hillDefs.map(d => ({
    color: d.color, topY: d.topY, amplitude: d.amp, seed: seed + d.sd * 13,
  })));

  // ── Trees ──
  const treeSpots = [
    { x: W * 0.04, y: H * 0.55, h: 75, style: 'round' },
    { x: W * 0.13, y: H * 0.52, h: 90, style: 'pine' },
    { x: W * 0.24, y: H * 0.58, h: 60, style: 'sapling' },
    { x: W * 0.76, y: H * 0.56, h: 70, style: 'round' },
    { x: W * 0.87, y: H * 0.53, h: 85, style: 'pine' },
    { x: W * 0.95, y: H * 0.55, h: 65, style: 'round' },
  ];
  for (let i = 0; i < treeSpots.length; i++) {
    const t = treeSpots[i];
    drawPapercutTree(gfx, t.x, t.y, t.h, {
      seed: seed + i * 37,
      style: t.style,
      canopy: i % 2 === 0 ? PAPER.forest : PAPER.forestL,
      canopyHi: PAPER.leaf,
      trunk: PAPER.creamD,
    });
  }

  // ── Foreground trees on ground ──
  drawPapercutTree(gfx, W * 0.06, H * 0.82, 55, {
    seed: seed + 200, style: 'sapling', canopy: PAPER.forestL, trunk: PAPER.creamD,
  });
  drawPapercutTree(gfx, W * 0.94, H * 0.82, 50, {
    seed: seed + 210, style: 'sapling', canopy: PAPER.forest, trunk: PAPER.creamD,
  });

  // ── Flowers ──
  const flowerColors = [PAPER.coral, PAPER.rose, PAPER.peach, PAPER.gold, PAPER.lavender];
  for (let i = 0; i < 20; i++) {
    const fx = W * (0.05 + rng() * 0.9);
    const fy = H * (0.79 + rng() * 0.06);
    drawPapercutFlower(gfx, fx, fy, 3 + rng() * 5, {
      seed: seed + i * 11,
      color: flowerColors[Math.floor(rng() * flowerColors.length)],
      center: PAPER.gold,
      stem: 4 + rng() * 5,
      stemColor: PAPER.leaf,
    });
  }

  // ── Leaf sprigs ──
  for (let i = 0; i < 6; i++) {
    drawLeafSprig(gfx, W * (0.1 + rng() * 0.8), H * (0.78 + rng() * 0.05),
      15 + rng() * 12, { seed: seed + i * 23, color: PAPER.leaf, angle: (rng() - 0.5) * 0.6 });
  }

  // ── Butterflies ──
  const bColors = [PAPER.white, PAPER.rose, PAPER.peach, PAPER.lavender];
  for (let i = 0; i < 8; i++) {
    const bx = W * (0.1 + rng() * 0.8);
    const by = H * (0.28 + rng() * 0.45);
    drawButterfly(gfx, bx, by, 5 + rng() * 6, {
      seed: seed + i * 29,
      color: bColors[Math.floor(rng() * bColors.length)],
      tilt: (rng() - 0.5) * 0.4,
    });
  }

  return gfx;
}

/**
 * Screen 2 — Crystal Caves: teal/tealD/lavender-dominant papercut.
 * Still soft, layered hills, no dark outlines.
 */
export function drawWorldMapCaves(scene, width, height, seed = 600) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;

  // ── Page bg: deep teal ──
  gfx.fillStyle(PAPER.tealD, 1);
  gfx.fillRect(0, 0, W, H);

  // ── Lavender glow ──
  const glowR = Math.min(W, H) * 0.55;
  for (let ring = 8; ring >= 1; ring--) {
    const r = glowR * (ring / 8);
    gfx.fillStyle(PAPER.lavender, 0.05 * (1 - ring / 10));
    gfx.fillCircle(W * 0.5, H * 0.40, r);
  }

  // ── Cream stars for cave sparkles ──
  for (let i = 0; i < 25; i++) {
    const sx = rng() * W, sy = rng() * H * 0.5;
    gfx.fillStyle(PAPER.cream, 0.25 + rng() * 0.35);
    gfx.fillCircle(sx, sy, 1 + rng() * 1.5);
  }

  // ── 8 rolling hill layers (cave walls) ──
  const caveHills = [
    { color: PAPER.inkTeal,   topY: H * 0.28, amp: 24, sd: 1 },
    { color: PAPER.tealD,     topY: H * 0.35, amp: 22, sd: 2 },
    { color: PAPER.teal,      topY: H * 0.42, amp: 20, sd: 3 },
    { color: PAPER.lavenderD, topY: H * 0.50, amp: 18, sd: 4 },
    { color: PAPER.tealL,     topY: H * 0.57, amp: 14, sd: 5 },
    { color: PAPER.lavender,  topY: H * 0.64, amp: 12, sd: 6 },
    { color: PAPER.sky,       topY: H * 0.72, amp: 10, sd: 7 },
    { color: PAPER.cream,     topY: H * 0.80, amp: 6,  sd: 8 },
  ];
  drawPapercutHills(gfx, -30, W + 30, H, caveHills.map(d => ({
    color: d.color, topY: d.topY, amplitude: d.amp, seed: seed + d.sd * 17,
  })));

  // ── Crystal formations (organic blobs, not jagged) ──
  const crystalColors = [PAPER.lavender, PAPER.tealL, PAPER.sky];
  for (let i = 0; i < 10; i++) {
    const cx = W * (0.05 + (i / 10) * 0.9 + (rng() - 0.5) * 0.05);
    const cy = H * (0.55 + rng() * 0.25);
    const cr = 8 + rng() * 16;
    drawShadowedBlob(gfx, cx, cy - cr * 0.6, cr * 0.4, cr, crystalColors[i % 3], {
      seed: seed + i * 41, wobble: 0.08, shadowDy: 4, shadowAlpha: 0.18,
    });
    // glow halo
    gfx.fillStyle(crystalColors[i % 3], 0.08);
    gfx.fillCircle(cx, cy - cr * 0.6, cr * 1.5);
  }

  // ── Stalactite blobs from top ──
  for (let i = 0; i < 8; i++) {
    const sx = W * (0.05 + rng() * 0.9);
    const sLen = 20 + rng() * 50;
    drawShadowedBlob(gfx, sx, sLen * 0.4, 5 + rng() * 6, sLen * 0.5, PAPER.inkTeal, {
      seed: seed + i * 53, wobble: 0.1, shadowDy: 5, shadowAlpha: 0.16,
    });
  }

  // ── Flowers (cave blossoms) ──
  for (let i = 0; i < 10; i++) {
    drawPapercutFlower(gfx, W * (0.08 + rng() * 0.84), H * (0.76 + rng() * 0.06),
      3 + rng() * 4, {
        seed: seed + i * 13, color: PAPER.lavender, center: PAPER.cream,
        stem: 4 + rng() * 4, stemColor: PAPER.tealL,
      });
  }

  // ── Sparkle particles ──
  for (let i = 0; i < 20; i++) {
    gfx.fillStyle(PAPER.cream, 0.2 + rng() * 0.3);
    gfx.fillCircle(rng() * W, rng() * H * 0.85, 1 + rng() * 1.5);
  }

  return gfx;
}

/**
 * Screen 3 — Starlit Highlands: tealD/lavender/sky page, cream stars,
 * layered rolling hills. Night sky feel, still soft paper.
 */
export function drawWorldMapStarlitHighlands(scene, width, height, seed = 700) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;

  // ── Deep tealD page bg ──
  gfx.fillStyle(PAPER.tealD, 1);
  gfx.fillRect(0, 0, W, H);

  // ── Subtle lavender glow at horizon ──
  for (let band = 0; band < 6; band++) {
    const by = H * (0.25 + band * 0.05);
    gfx.fillStyle(PAPER.lavenderD, 0.03 + band * 0.01);
    gfx.fillRect(0, by, W, H * 0.06);
  }

  // ── Star field — cream dots ──
  for (let i = 0; i < 55; i++) {
    const sx = rng() * W, sy = rng() * H * 0.5;
    const sr = 0.6 + rng() * 2;
    gfx.fillStyle(PAPER.cream, 0.35 + rng() * 0.5);
    gfx.fillCircle(sx, sy, sr);
  }
  // Brighter feature stars with glow halos
  for (let i = 0; i < 8; i++) {
    const sx = W * (0.05 + rng() * 0.9);
    const sy = H * (0.03 + rng() * 0.35);
    gfx.fillStyle(PAPER.cream, 0.08);
    gfx.fillCircle(sx, sy, 6 + rng() * 4);
    gfx.fillStyle(PAPER.cream, 0.6);
    gfx.fillCircle(sx, sy, 1.5);
  }

  // ── Crescent moon ──
  const moonX = W * 0.75, moonY = H * 0.12, moonR = 36;
  drawShadowedBlob(gfx, moonX, moonY, moonR, moonR, PAPER.cream, {
    seed: seed + 99, wobble: 0.05, shadowDy: 5, shadowAlpha: 0.15,
  });
  // Cut crescent
  const pts2 = blobPoints(moonX + moonR * 0.4, moonY - moonR * 0.2, moonR * 0.82, moonR * 0.82, {
    seed: seed + 100, wobble: 0.05,
  });
  gfx.fillStyle(PAPER.tealD, 1);
  gfx.fillPoints(pts2, true);
  // Moon glow
  gfx.fillStyle(PAPER.cream, 0.05);
  gfx.fillCircle(moonX, moonY, moonR * 2.2);

  // ── Aurora bands (sky/lavender, soft) ──
  const auroraColors = [PAPER.tealL, PAPER.sky, PAPER.lavender, PAPER.sage];
  for (let a = 0; a < 4; a++) {
    const ay = H * (0.12 + a * 0.055) + (rng() - 0.5) * H * 0.03;
    const aH = H * (0.035 + rng() * 0.025);
    gfx.fillStyle(auroraColors[a], 0.05 + rng() * 0.03);
    const aPts = [];
    const aSteps = 20;
    for (let s = 0; s <= aSteps; s++) {
      const t = s / aSteps;
      aPts.push({ x: t * (W + 20) - 10, y: ay + Math.sin(t * Math.PI * 3 + a * 1.5) * aH * 0.5 });
    }
    for (let s = aSteps; s >= 0; s--) {
      const t = s / aSteps;
      aPts.push({ x: t * (W + 20) - 10, y: ay + aH + Math.sin(t * Math.PI * 3 + a * 1.5 + 0.5) * aH * 0.3 });
    }
    gfx.fillPoints(aPts, true);
  }

  // ── 8 layered rolling hills ──
  const highHills = [
    { color: PAPER.inkTeal,   topY: H * 0.36, amp: 24, sd: 1 },
    { color: PAPER.tealD,     topY: H * 0.42, amp: 20, sd: 2 },
    { color: PAPER.teal,      topY: H * 0.49, amp: 18, sd: 3 },
    { color: PAPER.lavenderD, topY: H * 0.55, amp: 16, sd: 4 },
    { color: PAPER.tealL,     topY: H * 0.62, amp: 14, sd: 5 },
    { color: PAPER.lavender,  topY: H * 0.68, amp: 12, sd: 6 },
    { color: PAPER.sky,       topY: H * 0.75, amp: 10, sd: 7 },
    { color: PAPER.cream,     topY: H * 0.82, amp: 6,  sd: 8 },
  ];
  drawPapercutHills(gfx, -30, W + 30, H, highHills.map(d => ({
    color: d.color, topY: d.topY, amplitude: d.amp, seed: seed + d.sd * 19,
  })));

  // ── Standing stones (organic blobs, not rects) ──
  const stoneSpots = [
    { x: W * 0.10, y: H * 0.78, h: 50 },
    { x: W * 0.30, y: H * 0.72, h: 40 },
    { x: W * 0.50, y: H * 0.74, h: 55 },
    { x: W * 0.72, y: H * 0.70, h: 45 },
    { x: W * 0.90, y: H * 0.78, h: 42 },
  ];
  for (let i = 0; i < stoneSpots.length; i++) {
    const st = stoneSpots[i];
    drawShadowedBlob(gfx, st.x, st.y - st.h * 0.5, st.h * 0.15, st.h * 0.5, PAPER.inkTeal, {
      seed: seed + i * 47, wobble: 0.08, shadowDy: 5, shadowAlpha: 0.2,
    });
    // glow at top
    gfx.fillStyle(PAPER.sky, 0.12);
    gfx.fillCircle(st.x, st.y - st.h, st.h * 0.25);
    gfx.fillStyle(PAPER.cream, 0.3);
    gfx.fillCircle(st.x, st.y - st.h, st.h * 0.08);
  }

  // ── Fireflies (cream/gold dots with halos) ──
  for (let i = 0; i < 18; i++) {
    const fx = W * (0.05 + rng() * 0.9);
    const fy = H * (0.35 + rng() * 0.45);
    const fr = 1.5 + rng() * 2;
    gfx.fillStyle(PAPER.gold, 0.08);
    gfx.fillCircle(fx, fy, fr * 3);
    gfx.fillStyle(PAPER.cream, 0.5 + rng() * 0.3);
    gfx.fillCircle(fx, fy, fr);
  }

  // ── Scattered flowers ──
  for (let i = 0; i < 8; i++) {
    drawPapercutFlower(gfx, W * (0.08 + rng() * 0.84), H * (0.78 + rng() * 0.06),
      3 + rng() * 4, {
        seed: seed + i * 11, color: PAPER.lavender, center: PAPER.cream,
        stem: 4 + rng() * 4, stemColor: PAPER.tealL,
      });
  }

  return gfx;
}

// ================================================================
// DIORAMA FRAME (battle scene only)
// ================================================================

/**
 * Draw a torn-paper diorama frame around the edges of the scene.
 */
export function drawDioramaFrame(scene, width, height, seed = 42) {
  const rng = makeRng(seed + 9999);
  const gfx = scene.add.graphics().setDepth(15);

  // Organic frame layers around the edges using organicRectPoints
  const frameColors = [PAPER.creamD, PAPER.sand, PAPER.sage];
  for (let i = 0; i < 3; i++) {
    const inset = 15 + i * 12;
    const pts = organicRectPoints(width / 2, height / 2, width - inset * 2, height - inset * 2, {
      seed: seed + i * 31, wobble: 10, points: 72, roundness: 4,
    });
    // Draw the frame as an inverted fill: fill full rect, then cut the opening
    // Instead, draw 4 edge strips using the organicRect boundary
    // For simplicity, use a wavy edge approach
    const edgeW = 35 + i * 8;

    // Top edge
    const topPts = waveEdgePoints(-20, width + 20, edgeW, {
      seed: seed + i * 31 + 1, amplitude: 8,
    });
    const topPoly = [{ x: -20, y: 0 }, { x: width + 20, y: 0 }];
    for (let j = topPts.length - 1; j >= 0; j--) topPoly.push(topPts[j]);
    drawShadowedPoly(gfx, topPoly, frameColors[i], { shadowDy: 5, shadowAlpha: 0.18 });

    // Bottom edge
    const botPts = waveEdgePoints(-20, width + 20, height - edgeW, {
      seed: seed + i * 31 + 2, amplitude: 8,
    });
    const botPoly = [{ x: -20, y: height }, { x: width + 20, y: height }];
    for (let j = botPts.length - 1; j >= 0; j--) botPoly.push(botPts[j]);
    drawShadowedPoly(gfx, botPoly, frameColors[i], { shadowDy: -5, shadowAlpha: 0.18 });

    // Left edge
    const leftPts = waveEdgePoints(0, height, edgeW, {
      seed: seed + i * 31 + 3, amplitude: 8,
    });
    const leftPoly = [{ x: 0, y: 0 }, { x: 0, y: height }];
    for (let j = leftPts.length - 1; j >= 0; j--) {
      leftPoly.push({ x: leftPts[j].y, y: leftPts[j].x }); // swap x/y for vertical
    }
    drawShadowedPoly(gfx, leftPoly, frameColors[i], { shadowDx: 5, shadowDy: 0, shadowAlpha: 0.18 });

    // Right edge
    const rightPts = waveEdgePoints(0, height, width - edgeW, {
      seed: seed + i * 31 + 4, amplitude: 8,
    });
    const rightPoly = [{ x: width, y: 0 }, { x: width, y: height }];
    for (let j = rightPts.length - 1; j >= 0; j--) {
      rightPoly.push({ x: width - (rightPts[j].y - (width - edgeW)), y: rightPts[j].x });
    }
    drawShadowedPoly(gfx, rightPoly, frameColors[i], { shadowDx: -5, shadowDy: 0, shadowAlpha: 0.18 });
  }

  return gfx;
}
