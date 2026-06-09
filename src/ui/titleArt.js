/**
 * Papercut diorama title art — enchanted forest clearing with layered paper
 * foliage, organic frame, visible depth shadows, and subtle math elements.
 *
 * KEY DESIGN PRINCIPLE: Every paper layer casts a thick (8-12px) drop shadow
 * onto the layer behind it. The shadow is the depth illusion — without it
 * everything looks flat. Shadow color is dark teal (matching the frame).
 *
 * Palette:
 *   - Pale mint background, dark teal frame with cream border ring
 *   - Teal-to-lime gradient foliage layers (back to front)
 *   - Cream/white prominent tree, dark green secondary trees
 *   - Pink/orange/blue flowers, pink/orange/white butterflies
 *   - Subtle math elements woven into nature
 *   - Warm yellow central glow behind everything
 */

import { makeRng } from '../systems/rng.js';

// ================================================================
// COLOR PALETTE
// ================================================================

const PAL = {
  bg:            0xd4e8d0,  // pale mint green
  frame:         0x1a4040,  // dark teal
  frameBorder:   0xfaf0e0,  // cream/beige border ring
  shadowColor:   0x0a2020,  // dark teal shadow
  layer1:        0x1a5050,  // deepest teal
  layer2:        0x245838,  // dark green foliage
  layer3:        0x3a8848,  // medium green
  layer4:        0x58b848,  // bright green
  layer5:        0x78d858,  // lime green foreground
  glow:          0xffe8a0,  // warm yellow
  glowSoft:      0xfff4d0,  // soft warm white
  creamTree:     0xf0e8d0,  // cream/white tree
  creamTreeDark: 0xd8d0b8,  // slightly darker cream for branches
  treeGreen1:    0x1e4828,  // very dark green canopy
  treeGreen2:    0x2a5828,  // dark green canopy
  treeGreen3:    0x388838,  // medium green canopy
  flowerPink:    0xf06888,
  flowerCoral:   0xf08868,
  flowerOrange:  0xf0a040,
  flowerBlue:    0x80c0e8,
  flowerMagenta: 0xe060a0,
  flowerWhite:   0xf0e8e0,
  flowerCenter:  0xfff080,
  butterflyPink:   0xf06888,
  butterflyOrange: 0xf0a040,
  butterflyWhite:  0xe8e0f0,
  butterflyCoral:  0xf08868,
  stoneBg:       0xb8b0a0,  // equation stone
  stoneText:     0x606058,
  crystalBlue:   0x80c8e8,
  crystalShine:  0xd0f0ff,
  sparkle:       0xfff8d0,
  bannerCream:   0xfaf4e0,
};

// ================================================================
// CORE: drawPaperShape — every layer uses this
// ================================================================

/**
 * Draw a filled paper shape with a thick drop shadow.
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {Array<{x:number,y:number}>} points - outline points (top edge)
 * @param {number} bottomY - the y coordinate for the bottom of the shape
 * @param {number} fillColor
 * @param {number} shadowOx - shadow X offset (8-12 recommended)
 * @param {number} shadowOy - shadow Y offset (8-12 recommended)
 * @param {number} shadowAlpha - 0.3-0.5
 * @param {number} [highlightAlpha=0] - if > 0, draw an edge highlight
 */
function drawPaperShape(gfx, points, bottomY, fillColor, shadowOx, shadowOy, shadowAlpha, highlightAlpha = 0) {
  // 1. Shadow
  gfx.fillStyle(PAL.shadowColor, shadowAlpha);
  gfx.beginPath();
  gfx.moveTo(points[0].x + shadowOx, points[0].y + shadowOy);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x + shadowOx, points[i].y + shadowOy);
  }
  gfx.lineTo(points[points.length - 1].x + shadowOx, bottomY + shadowOy);
  gfx.lineTo(points[0].x + shadowOx, bottomY + shadowOy);
  gfx.closePath();
  gfx.fillPath();

  // 2. Main fill
  gfx.fillStyle(fillColor, 1);
  gfx.beginPath();
  gfx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x, points[i].y);
  }
  gfx.lineTo(points[points.length - 1].x, bottomY);
  gfx.lineTo(points[0].x, bottomY);
  gfx.closePath();
  gfx.fillPath();

  // 3. Optional edge highlight (lighter shade along the top)
  if (highlightAlpha > 0) {
    gfx.lineStyle(2, 0xffffff, highlightAlpha);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x, points[i].y);
    }
    gfx.strokePath();
  }
}

// ================================================================
// ORGANIC EDGE GENERATION
// ================================================================

/**
 * Generate an organic curved top edge with leaf-like bumps.
 * Unlike the old hill generator, this produces lush foliage curves.
 */
function generateFoliageEdge(startX, endX, baseY, amplitude, bumpCount, rng, leafiness = 0.4) {
  const pts = [];
  const steps = bumpCount * 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + t * (endX - startX);
    // Primary wave
    const primary = Math.sin(t * Math.PI * bumpCount) * amplitude * (0.5 + rng() * 0.5);
    // Secondary smaller bumps (leaf-like)
    const secondary = Math.sin(t * Math.PI * bumpCount * 2.7 + 1.3) * amplitude * leafiness * (0.4 + rng() * 0.6);
    // Tertiary fine detail
    const tertiary = Math.sin(t * Math.PI * bumpCount * 5.1 + 2.8) * amplitude * 0.12;
    // Organic wobble
    const wobble = (rng() - 0.5) * amplitude * 0.08;
    const y = baseY - primary - secondary - tertiary + wobble;
    pts.push({ x, y });
  }
  return pts;
}

// ================================================================
// ORGANIC FRAME
// ================================================================

/**
 * Draw the organic papercut diorama frame.
 * Wider horizontal opening, wobbly blob edges, cream border ring.
 */
export function drawDioramaFrame(scene, width, height, rng, depth = 12) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d');

  const hexToCSS = (hex) => {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return `rgb(${r},${g},${b})`;
  };
  const hexToRGBA = (hex, a) => {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return `rgba(${r},${g},${b},${a})`;
  };

  // -- Drop shadow for frame (thick, offset) --
  ctx.fillStyle = hexToRGBA(PAL.shadowColor, 0.45);
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  drawOrganicOpening(ctx, width, height, rng, -6, -8, -14);
  ctx.globalCompositeOperation = 'source-over';

  // -- Cream border ring (between frame and opening) --
  ctx.fillStyle = hexToCSS(PAL.frameBorder);
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  drawOrganicOpening(ctx, width, height, rng, 0, 0, -2);
  ctx.globalCompositeOperation = 'source-over';

  // -- Main frame fill (on top of cream border) --
  // We draw the frame but with a slightly smaller cutout so cream shows as border
  ctx.fillStyle = hexToCSS(PAL.frame);
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  drawOrganicOpening(ctx, width, height, rng, 0, 0, 12);
  ctx.globalCompositeOperation = 'source-over';

  // -- Paper texture on frame --
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 800; i++) {
    const gx = rng() * width;
    const gy = rng() * height;
    const ga = 0.02 + rng() * 0.04;
    ctx.fillStyle = `rgba(255,255,255,${ga})`;
    ctx.fillRect(gx, gy, 1 + rng() * 2, 1 + rng() * 2);
  }
  // Darker grain too
  for (let i = 0; i < 400; i++) {
    const gx = rng() * width;
    const gy = rng() * height;
    const ga = 0.02 + rng() * 0.03;
    ctx.fillStyle = `rgba(0,0,0,${ga})`;
    ctx.fillRect(gx, gy, 1 + rng() * 2, 1);
  }
  ctx.globalCompositeOperation = 'source-over';

  const key = 'diorama-frame-' + Math.random().toString(36).slice(2, 8);
  scene.textures.addCanvas(key, cv);
  const img = scene.add.image(width / 2, height / 2, key).setDepth(depth);
  return img;
}

/**
 * Generate anchor points + bezier control points for the organic opening.
 * Wider horizontally, more organic wobble than before.
 */
function generateOpeningPoints(cx, cy, rx, ry, rng) {
  const segments = 16; // more segments = smoother organic shape
  const points = [];
  const fixedRng = makeRng(42 + Math.round(rx));

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    // More variation for organic look
    const radiusVariation = 0.88 + fixedRng() * 0.24;
    const wobbleX = (fixedRng() - 0.5) * rx * 0.10;
    const wobbleY = (fixedRng() - 0.5) * ry * 0.10;

    const x = cx + Math.cos(angle) * rx * radiusVariation + wobbleX;
    const y = cy + Math.sin(angle) * ry * radiusVariation + wobbleY;

    const tangentAngle = angle + Math.PI / 2;
    const cpDist = (2 * Math.PI / segments) * 0.38;
    const cpRx = rx * radiusVariation * cpDist;
    const cpRy = ry * radiusVariation * cpDist;

    points.push({
      x, y,
      cp1: {
        x: x - Math.cos(tangentAngle) * cpRx,
        y: y - Math.sin(tangentAngle) * cpRy,
      },
      cp2: {
        x: x + Math.cos(tangentAngle) * cpRx,
        y: y + Math.sin(tangentAngle) * cpRy,
      },
    });
  }
  return points;
}

/**
 * Draw the organic opening path (filled) using bezier curves.
 * Wider horizontal opening than before.
 */
function drawOrganicOpening(ctx, width, height, rng, offsetX, offsetY, sizeOffset) {
  const cx = width / 2 + offsetX;
  const cy = height * 0.44 + offsetY;
  // Wider horizontally (was 0.38, now 0.44)
  const rx = width * 0.44 + sizeOffset;
  const ry = height * 0.42 + sizeOffset;

  ctx.beginPath();
  const points = generateOpeningPoints(cx, cy, rx, ry, rng);
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    const cp1 = points[i].cp2;
    const cp2 = next.cp1;
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
  }
  ctx.closePath();
  ctx.fill();
}

// ================================================================
// INNER FRAME DEPTH LAYERS — inside the frame edges for depth
// ================================================================

export function drawInnerFrameLayers(scene, width, height, rng, depth = 11) {
  const gfx = scene.add.graphics().setDepth(depth);

  // Two inner depth layers — dark teal with thick shadows
  const layers = [
    { color: 0x1e5050, alpha: 0.8, shrink: 0.02, peakH: 0.05, shadowOx: 8, shadowOy: 10, shadowA: 0.35 },
    { color: 0x245858, alpha: 0.6, shrink: 0.05, peakH: 0.04, shadowOx: 6, shadowOy: 8, shadowA: 0.30 },
  ];

  for (const layer of layers) {
    // Top inner curve
    const topPts = [];
    const topBaseY = height * (0.04 + layer.shrink);
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = -30 + t * (width + 60);
      const curve = Math.sin(t * Math.PI) * height * layer.peakH;
      const wobble = (rng() - 0.5) * 5;
      topPts.push({ x, y: topBaseY + curve + wobble });
    }
    // Shadow
    gfx.fillStyle(PAL.shadowColor, layer.shadowA);
    gfx.beginPath();
    gfx.moveTo(-30 + layer.shadowOx, 0 + layer.shadowOy);
    gfx.lineTo(width + 30 + layer.shadowOx, 0 + layer.shadowOy);
    for (let i = topPts.length - 1; i >= 0; i--) {
      gfx.lineTo(topPts[i].x + layer.shadowOx, topPts[i].y + layer.shadowOy);
    }
    gfx.closePath();
    gfx.fillPath();
    // Fill
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(-30, 0);
    gfx.lineTo(width + 30, 0);
    for (let i = topPts.length - 1; i >= 0; i--) {
      gfx.lineTo(topPts[i].x, topPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Bottom inner curve
    const bottomPts = [];
    const bottomBaseY = height * (0.90 - layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = -30 + t * (width + 60);
      const curve = Math.sin(t * Math.PI) * height * layer.peakH;
      const wobble = (rng() - 0.5) * 5;
      bottomPts.push({ x, y: bottomBaseY - curve + wobble });
    }
    gfx.fillStyle(PAL.shadowColor, layer.shadowA);
    gfx.beginPath();
    gfx.moveTo(-30 + layer.shadowOx, height + layer.shadowOy);
    gfx.lineTo(width + 30 + layer.shadowOx, height + layer.shadowOy);
    for (let i = bottomPts.length - 1; i >= 0; i--) {
      gfx.lineTo(bottomPts[i].x + layer.shadowOx, bottomPts[i].y + layer.shadowOy);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(-30, height);
    gfx.lineTo(width + 30, height);
    for (let i = bottomPts.length - 1; i >= 0; i--) {
      gfx.lineTo(bottomPts[i].x, bottomPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Left inner curve
    const leftPts = [];
    const leftBaseX = width * (0.04 + layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -30 + t * (height + 60);
      const curve = Math.sin(t * Math.PI) * width * layer.peakH * 0.5;
      const wobble = (rng() - 0.5) * 5;
      leftPts.push({ x: leftBaseX + curve + wobble, y });
    }
    gfx.fillStyle(PAL.shadowColor, layer.shadowA);
    gfx.beginPath();
    gfx.moveTo(0 + layer.shadowOx, -30);
    gfx.lineTo(0 + layer.shadowOx, height + 30);
    for (let i = leftPts.length - 1; i >= 0; i--) {
      gfx.lineTo(leftPts[i].x + layer.shadowOx, leftPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(0, -30);
    gfx.lineTo(0, height + 30);
    for (let i = leftPts.length - 1; i >= 0; i--) {
      gfx.lineTo(leftPts[i].x, leftPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Right inner curve
    const rightPts = [];
    const rightBaseX = width * (0.96 - layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -30 + t * (height + 60);
      const curve = Math.sin(t * Math.PI) * width * layer.peakH * 0.5;
      const wobble = (rng() - 0.5) * 5;
      rightPts.push({ x: rightBaseX - curve + wobble, y });
    }
    gfx.fillStyle(PAL.shadowColor, layer.shadowA);
    gfx.beginPath();
    gfx.moveTo(width + layer.shadowOx, -30);
    gfx.lineTo(width + layer.shadowOx, height + 30);
    for (let i = rightPts.length - 1; i >= 0; i--) {
      gfx.lineTo(rightPts[i].x + layer.shadowOx, rightPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(width, -30);
    gfx.lineTo(width, height + 30);
    for (let i = rightPts.length - 1; i >= 0; i--) {
      gfx.lineTo(rightPts[i].x, rightPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();
  }

  return gfx;
}

// ================================================================
// LAYERED FOLIAGE (replaces drawDioramaHills)
// ================================================================

/**
 * Draw 5 layered foliage paper layers, each with thick drop shadows.
 * Each layer has organic curved top edges with leaf-like bumps.
 */
export function drawFoliageLayers(scene, width, height, rng, baseDepth = 2) {
  const layers = [
    // Layer 1: deepest — dark teal background wave
    {
      depth: baseDepth,
      color: PAL.layer1,
      baseY: height * 0.42,
      amplitude: height * 0.06,
      bumps: 4,
      leafiness: 0.3,
      shadowOx: 0, shadowOy: 10, shadowA: 0.40,
      highlight: 0.06,
    },
    // Layer 2: dark green foliage with leaf bumps
    {
      depth: baseDepth + 1,
      color: PAL.layer2,
      baseY: height * 0.50,
      amplitude: height * 0.09,
      bumps: 5,
      leafiness: 0.5,
      shadowOx: 3, shadowOy: 10, shadowA: 0.42,
      highlight: 0.08,
    },
    // Layer 3: medium green rolling curves
    {
      depth: baseDepth + 2,
      color: PAL.layer3,
      baseY: height * 0.60,
      amplitude: height * 0.08,
      bumps: 6,
      leafiness: 0.45,
      shadowOx: 2, shadowOy: 8, shadowA: 0.38,
      highlight: 0.10,
    },
    // Layer 4: bright green foreground with grass
    {
      depth: baseDepth + 3,
      color: PAL.layer4,
      baseY: height * 0.70,
      amplitude: height * 0.06,
      bumps: 7,
      leafiness: 0.5,
      shadowOx: 2, shadowOy: 8, shadowA: 0.35,
      highlight: 0.12,
    },
    // Layer 5: lime green closest foreground
    {
      depth: baseDepth + 4,
      color: PAL.layer5,
      baseY: height * 0.80,
      amplitude: height * 0.04,
      bumps: 5,
      leafiness: 0.35,
      shadowOx: 2, shadowOy: 8, shadowA: 0.35,
      highlight: 0.10,
    },
  ];

  const allGfx = [];

  for (const layer of layers) {
    const gfx = scene.add.graphics().setDepth(layer.depth);
    const pts = generateFoliageEdge(
      -40, width + 40,
      layer.baseY, layer.amplitude, layer.bumps, rng, layer.leafiness
    );

    drawPaperShape(
      gfx, pts, height + 20,
      layer.color,
      layer.shadowOx, layer.shadowOy, layer.shadowA,
      layer.highlight
    );
    allGfx.push(gfx);
  }

  // Grass tufts on layer 4 (bright green)
  const grassGfx = scene.add.graphics().setDepth(baseDepth + 3);
  grassGfx.fillStyle(0x68c840, 0.9);
  for (let i = 0; i < 50; i++) {
    const gx = rng() * width;
    const gy = height * (0.68 + rng() * 0.06);
    const gh = 5 + rng() * 12;
    const gw = 2 + rng() * 2;
    grassGfx.fillTriangle(gx - gw, gy, gx, gy - gh, gx + gw, gy);
  }
  // Grass on layer 5
  grassGfx.fillStyle(0x88e858, 0.85);
  for (let i = 0; i < 35; i++) {
    const gx = rng() * width;
    const gy = height * (0.78 + rng() * 0.06);
    const gh = 4 + rng() * 10;
    const gw = 2 + rng() * 2;
    grassGfx.fillTriangle(gx - gw, gy, gx, gy - gh, gx + gw, gy);
  }
  allGfx.push(grassGfx);

  return allGfx;
}

// ================================================================
// TREES — cream prominent tree + dark green secondary trees
// ================================================================

/**
 * Draw a prominent cream/white tree with visible branches and pink flowers.
 */
function drawCreamTree(gfx, baseX, baseY, treeHeight, rng) {
  const trunkW = treeHeight * 0.06;
  const trunkH = treeHeight * 0.50;
  const sx = 6, sy = 8;

  // Trunk shadow
  gfx.fillStyle(PAL.shadowColor, 0.35);
  gfx.fillRect(baseX - trunkW / 2 + sx, baseY - trunkH + sy, trunkW, trunkH);

  // Trunk
  gfx.fillStyle(PAL.creamTree, 1);
  gfx.fillRect(baseX - trunkW / 2, baseY - trunkH, trunkW, trunkH);

  // Branches — 4 organic curved branches
  const branches = [
    { angle: -0.8, len: treeHeight * 0.30, bend: 0.3 },
    { angle: -1.4, len: treeHeight * 0.25, bend: -0.2 },
    { angle: 0.5, len: treeHeight * 0.35, bend: -0.4 },
    { angle: -0.3, len: treeHeight * 0.20, bend: 0.5 },
  ];

  const branchStartY = baseY - trunkH * 0.6;
  for (const b of branches) {
    const endX = baseX + Math.cos(b.angle) * b.len;
    const endY = branchStartY + Math.sin(b.angle) * b.len;
    const midX = (baseX + endX) / 2 + b.bend * b.len * 0.3;
    const midY = (branchStartY + endY) / 2 + b.bend * b.len * 0.2;

    // Branch shadow
    const segCount = 8;
    gfx.lineStyle(4, PAL.shadowColor, 0.3);
    gfx.beginPath();
    gfx.moveTo(baseX + sx, branchStartY + sy);
    for (let s = 1; s <= segCount; s++) {
      const t = s / segCount;
      const ix = (1 - t) * (1 - t) * (baseX + sx) + 2 * (1 - t) * t * (midX + sx) + t * t * (endX + sx);
      const iy = (1 - t) * (1 - t) * (branchStartY + sy) + 2 * (1 - t) * t * (midY + sy) + t * t * (endY + sy);
      gfx.lineTo(ix, iy);
    }
    gfx.strokePath();

    // Branch
    gfx.lineStyle(3, PAL.creamTree, 1);
    gfx.beginPath();
    gfx.moveTo(baseX, branchStartY);
    for (let s = 1; s <= segCount; s++) {
      const t = s / segCount;
      const ix = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * midX + t * t * endX;
      const iy = (1 - t) * (1 - t) * branchStartY + 2 * (1 - t) * t * midY + t * t * endY;
      gfx.lineTo(ix, iy);
    }
    gfx.strokePath();

    // Small pink flowers on each branch tip
    const flowerCount = 2 + Math.floor(rng() * 3);
    for (let f = 0; f < flowerCount; f++) {
      const ft = 0.5 + rng() * 0.5;
      const fx = (1 - ft) * (1 - ft) * baseX + 2 * (1 - ft) * ft * midX + ft * ft * endX + (rng() - 0.5) * 12;
      const fy = (1 - ft) * (1 - ft) * branchStartY + 2 * (1 - ft) * ft * midY + ft * ft * endY + (rng() - 0.5) * 12;
      const fr = 4 + rng() * 5;
      // Flower shadow
      gfx.fillStyle(PAL.shadowColor, 0.2);
      gfx.fillCircle(fx + 2, fy + 3, fr);
      // Flower
      gfx.fillStyle(PAL.flowerPink, 0.9);
      gfx.fillCircle(fx, fy, fr);
      gfx.fillStyle(0xffffff, 0.4);
      gfx.fillCircle(fx - fr * 0.2, fy - fr * 0.2, fr * 0.4);
    }
  }

  // Crown highlight — slight glow at the top
  gfx.fillStyle(PAL.creamTreeDark, 0.3);
  gfx.fillCircle(baseX, baseY - trunkH - treeHeight * 0.05, treeHeight * 0.08);
}

/**
 * Draw a dark green tree silhouette (secondary trees).
 */
function drawDarkTree(gfx, baseX, baseY, treeHeight, rng, color) {
  const trunkW = treeHeight * 0.07;
  const trunkH = treeHeight * 0.40;
  const sx = 6, sy = 8;

  // Trunk shadow
  gfx.fillStyle(PAL.shadowColor, 0.35);
  gfx.fillRect(baseX - trunkW / 2 + sx, baseY - trunkH + sy, trunkW, trunkH);
  // Trunk
  gfx.fillStyle(0x1a3018, 1);
  gfx.fillRect(baseX - trunkW / 2, baseY - trunkH, trunkW, trunkH);

  // Canopy — overlapping circles
  const canopyTop = baseY - trunkH - treeHeight * 0.15;
  const canopyR = treeHeight * 0.22;
  const canopyColors = [color, color - 0x101010, color + 0x101010];

  // Canopy shadow
  gfx.fillStyle(PAL.shadowColor, 0.35);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + rng() * 0.4;
    const dist = canopyR * 0.30;
    const cx = baseX + Math.cos(angle) * dist + sx;
    const cy = canopyTop + Math.sin(angle) * dist * 0.5 + sy;
    const r = canopyR * (0.6 + rng() * 0.4);
    gfx.fillCircle(cx, cy, r);
  }
  gfx.fillCircle(baseX + sx, canopyTop - canopyR * 0.15 + sy, canopyR * 0.7);

  // Canopy circles
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + rng() * 0.4;
    const dist = canopyR * 0.30;
    const cx = baseX + Math.cos(angle) * dist;
    const cy = canopyTop + Math.sin(angle) * dist * 0.5;
    const r = canopyR * (0.6 + rng() * 0.4);
    gfx.fillStyle(canopyColors[i % canopyColors.length], 1);
    gfx.fillCircle(cx, cy, r);
  }
  gfx.fillStyle(color + 0x080808, 0.9);
  gfx.fillCircle(baseX, canopyTop - canopyR * 0.15, canopyR * 0.7);

  // Highlight
  gfx.fillStyle(0xffffff, 0.08);
  gfx.fillCircle(baseX - canopyR * 0.15, canopyTop - canopyR * 0.3, canopyR * 0.4);
}

/**
 * Draw all trees: one prominent cream tree on right, dark trees on left.
 */
export function drawTrees(scene, width, height, rng, depth = 5) {
  // Cream tree on right side — spans layers 2-4, so depth in middle
  const creamGfx = scene.add.graphics().setDepth(depth);
  drawCreamTree(creamGfx, width * 0.78, height * 0.72, 280 + rng() * 30, rng);

  // Dark green trees on left side (2-3 trees)
  const darkGfx = scene.add.graphics().setDepth(depth - 1);
  drawDarkTree(darkGfx, width * 0.12, height * 0.68, 200 + rng() * 30, rng, PAL.treeGreen1);
  drawDarkTree(darkGfx, width * 0.22, height * 0.66, 160 + rng() * 25, rng, PAL.treeGreen2);
  drawDarkTree(darkGfx, width * 0.04, height * 0.70, 130 + rng() * 20, rng, PAL.treeGreen3);

  return { creamGfx, darkGfx };
}

// ================================================================
// FLOWERS — includes number flowers and regular flowers
// ================================================================

/**
 * Draw a single flower with optional number/symbol in center.
 */
function drawSingleFlower(gfx, cx, cy, size, color, rng) {
  const petalCount = 5;
  // Shadow
  gfx.fillStyle(PAL.shadowColor, 0.25);
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2 + rng() * 0.3;
    const px = cx + Math.cos(a) * size * 0.55 + 3;
    const py = cy + Math.sin(a) * size * 0.55 + 4;
    gfx.fillCircle(px, py, size * 0.42);
  }
  // Stem
  gfx.fillStyle(0x388830, 1);
  gfx.fillRect(cx - 1.5, cy + size * 0.3, 3, size * 1.5);
  // Leaf on stem
  gfx.fillStyle(0x48a838, 0.9);
  const leafDir = rng() > 0.5 ? 1 : -1;
  gfx.fillEllipse(cx + leafDir * size * 0.4, cy + size * 0.8, size * 0.5, size * 0.2);
  // Petals
  gfx.fillStyle(color, 1);
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2 + rng() * 0.3;
    const px = cx + Math.cos(a) * size * 0.55;
    const py = cy + Math.sin(a) * size * 0.55;
    gfx.fillCircle(px, py, size * 0.42);
  }
  // Center
  gfx.fillStyle(PAL.flowerCenter, 1);
  gfx.fillCircle(cx, cy, size * 0.32);
  // Center highlight
  gfx.fillStyle(0xffffff, 0.35);
  gfx.fillCircle(cx - size * 0.06, cy - size * 0.06, size * 0.15);
}

/**
 * Draw a small mushroom.
 */
function drawMushroom(gfx, cx, cy, size, rng) {
  // Shadow
  gfx.fillStyle(PAL.shadowColor, 0.2);
  gfx.fillRoundedRect(cx - size * 0.15 + 2, cy - size * 0.4 + 3, size * 0.3, size * 0.5, 2);
  gfx.fillCircle(cx + 2, cy - size * 0.4 + 3, size * 0.5);

  // Stem
  gfx.fillStyle(0xf0e8d0, 1);
  gfx.fillRoundedRect(cx - size * 0.15, cy - size * 0.4, size * 0.3, size * 0.5, 2);
  // Cap
  const capColor = rng() > 0.5 ? 0xe05050 : 0xf0a040;
  gfx.fillStyle(capColor, 1);
  gfx.fillCircle(cx, cy - size * 0.4, size * 0.5);
  // Spots
  gfx.fillStyle(0xffffff, 0.8);
  gfx.fillCircle(cx - size * 0.15, cy - size * 0.5, size * 0.10);
  gfx.fillCircle(cx + size * 0.2, cy - size * 0.35, size * 0.08);
}

/**
 * Scatter flowers, mushrooms, and number flowers along the foreground.
 */
export function drawFlowers(scene, width, height, rng, depth = 6) {
  const gfx = scene.add.graphics().setDepth(depth);
  const colors = [PAL.flowerPink, PAL.flowerOrange, PAL.flowerBlue, PAL.flowerMagenta, PAL.flowerCoral];

  // Regular flowers (foreground layers)
  const count = 16;
  for (let i = 0; i < count; i++) {
    let x;
    const attempt = rng();
    if (attempt < 0.4) {
      x = width * (0.04 + rng() * 0.28);
    } else if (attempt < 0.8) {
      x = width * (0.68 + rng() * 0.28);
    } else {
      x = width * (0.3 + rng() * 0.4);
    }
    const y = height * (0.68 + rng() * 0.14);
    const size = 8 + rng() * 12;
    const color = colors[Math.floor(rng() * colors.length)];
    drawSingleFlower(gfx, x, y, size, color, rng);
  }

  // Number flowers — 4 flowers with math symbols in center
  const mathLabels = ['3', '7', '+', '×'];
  const numberFlowerPositions = [
    { x: width * 0.28, y: height * 0.66 },
    { x: width * 0.52, y: height * 0.72 },
    { x: width * 0.68, y: height * 0.68 },
    { x: width * 0.40, y: height * 0.76 },
  ];
  for (let i = 0; i < mathLabels.length; i++) {
    const pos = numberFlowerPositions[i];
    const size = 14 + rng() * 4;
    const color = colors[Math.floor(rng() * colors.length)];
    drawSingleFlower(gfx, pos.x, pos.y, size, color, rng);

    // Draw the number/symbol as Phaser text on top
    scene.add.text(pos.x, pos.y, mathLabels[i], {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#5a3818',
      stroke: '#fff8d0',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(depth + 1);
  }

  // Mushrooms
  for (let i = 0; i < 5; i++) {
    const mx = width * (0.15 + rng() * 0.7);
    const my = height * (0.74 + rng() * 0.08);
    drawMushroom(gfx, mx, my, 12 + rng() * 8, rng);
  }

  return gfx;
}

// ================================================================
// EQUATION STONES
// ================================================================

/**
 * Draw small rounded stones with math expressions etched on them.
 */
export function drawEquationStones(scene, width, height, rng, depth = 6) {
  const gfx = scene.add.graphics().setDepth(depth);
  const equations = ['2+3', '7×4', '9-5'];
  const positions = [
    { x: width * 0.35, y: height * 0.78 },
    { x: width * 0.58, y: height * 0.80 },
    { x: width * 0.72, y: height * 0.82 },
  ];

  for (let i = 0; i < equations.length; i++) {
    const pos = positions[i];
    const sw = 38 + rng() * 12;
    const sh = 22 + rng() * 6;

    // Shadow
    gfx.fillStyle(PAL.shadowColor, 0.30);
    gfx.fillRoundedRect(pos.x - sw / 2 + 4, pos.y - sh / 2 + 5, sw, sh, 8);
    // Stone
    gfx.fillStyle(PAL.stoneBg, 1);
    gfx.fillRoundedRect(pos.x - sw / 2, pos.y - sh / 2, sw, sh, 8);
    // Highlight
    gfx.fillStyle(0xffffff, 0.15);
    gfx.fillRoundedRect(pos.x - sw / 2 + 2, pos.y - sh / 2 + 2, sw - 4, sh * 0.4, 6);

    // Equation text
    scene.add.text(pos.x, pos.y, equations[i], {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px',
      color: '#606058',
      stroke: '#d0c8b8',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(depth + 1).setAlpha(0.7);
  }

  return gfx;
}

// ================================================================
// CRYSTAL WITH GEOMETRIC PATTERN
// ================================================================

/**
 * Draw a crystal/gem with a geometric pattern (triangle/pentagon) inside.
 */
export function drawCrystal(scene, width, height, rng, depth = 6) {
  const gfx = scene.add.graphics().setDepth(depth);
  const cx = width * 0.48;
  const cy = height * 0.74;
  const size = 20;

  // Shadow
  gfx.fillStyle(PAL.shadowColor, 0.30);
  gfx.fillTriangle(cx + 4, cy - size + 5, cx - size * 0.7 + 4, cy + size * 0.6 + 5, cx + size * 0.7 + 4, cy + size * 0.6 + 5);

  // Crystal body
  gfx.fillStyle(PAL.crystalBlue, 0.85);
  gfx.fillTriangle(cx, cy - size, cx - size * 0.7, cy + size * 0.6, cx + size * 0.7, cy + size * 0.6);

  // Inner geometric pattern — smaller triangle
  gfx.lineStyle(1.5, 0xffffff, 0.5);
  const innerSize = size * 0.5;
  const innerCy = cy - size * 0.05;
  gfx.strokeTriangle(cx, innerCy - innerSize, cx - innerSize * 0.7, innerCy + innerSize * 0.6, cx + innerSize * 0.7, innerCy + innerSize * 0.6);

  // Pentagon pattern inside
  gfx.lineStyle(1, 0xffffff, 0.3);
  const pentR = innerSize * 0.35;
  gfx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * pentR;
    const py = innerCy + Math.sin(a) * pentR;
    if (i === 0) gfx.moveTo(px, py);
    else gfx.lineTo(px, py);
  }
  gfx.closePath();
  gfx.strokePath();

  // Shine
  gfx.fillStyle(PAL.crystalShine, 0.5);
  gfx.fillTriangle(cx, cy - size, cx - size * 0.2, cy - size * 0.3, cx + size * 0.15, cy - size * 0.4);

  return gfx;
}

// ================================================================
// SPARKLE PARTICLES
// ================================================================

/**
 * Draw small glowing sparkle dots near math elements.
 */
export function drawSparkles(scene, width, height, rng, depth = 7) {
  const sparkles = [];
  const positions = [
    // Near number flowers
    { x: width * 0.28, y: height * 0.63 },
    { x: width * 0.52, y: height * 0.69 },
    { x: width * 0.68, y: height * 0.65 },
    // Near crystal
    { x: width * 0.48, y: height * 0.70 },
    { x: width * 0.50, y: height * 0.72 },
    // Near stones
    { x: width * 0.35, y: height * 0.75 },
    { x: width * 0.58, y: height * 0.77 },
    // Random atmospheric
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
  ];

  for (const pos of positions) {
    const gfx = scene.add.graphics().setDepth(depth);
    const size = 2 + rng() * 3;

    // Glow
    gfx.fillStyle(PAL.sparkle, 0.3);
    gfx.fillCircle(0, 0, size * 2.5);
    // Core
    gfx.fillStyle(0xffffff, 0.9);
    gfx.fillCircle(0, 0, size);
    // Cross sparkle lines
    gfx.lineStyle(1, 0xffffff, 0.6);
    gfx.beginPath();
    gfx.moveTo(-size * 1.5, 0); gfx.lineTo(size * 1.5, 0);
    gfx.moveTo(0, -size * 1.5); gfx.lineTo(0, size * 1.5);
    gfx.strokePath();

    gfx.setPosition(pos.x, pos.y);

    // Gentle pulse animation
    scene.tweens.add({
      targets: gfx,
      alpha: 0.2 + rng() * 0.3,
      duration: 1500 + rng() * 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: rng() * 2000,
    });

    sparkles.push(gfx);
  }

  return sparkles;
}

// ================================================================
// BUTTERFLIES
// ================================================================

/**
 * Draw a single butterfly — larger and more detailed.
 */
function drawSingleButterfly(scene, cx, cy, size, color, rng, depth) {
  const gfx = scene.add.graphics().setDepth(depth);

  // Wing shadow
  gfx.fillStyle(PAL.shadowColor, 0.25);
  gfx.fillEllipse(cx - size * 0.5 + 3, cy - size * 0.1 + 4, size * 0.9, size * 0.7);
  gfx.fillEllipse(cx + size * 0.5 + 3, cy - size * 0.1 + 4, size * 0.9, size * 0.7);

  // Body
  gfx.fillStyle(0x3a2410, 1);
  gfx.fillRoundedRect(cx - 2, cy - size * 0.4, 4, size * 0.8, 2);
  // Antennae
  gfx.lineStyle(1.5, 0x3a2410, 0.8);
  gfx.beginPath();
  gfx.moveTo(cx - 1, cy - size * 0.4);
  gfx.lineTo(cx - size * 0.3, cy - size * 0.7);
  gfx.moveTo(cx + 1, cy - size * 0.4);
  gfx.lineTo(cx + size * 0.3, cy - size * 0.7);
  gfx.strokePath();
  // Antenna tips
  gfx.fillStyle(0x3a2410, 0.8);
  gfx.fillCircle(cx - size * 0.3, cy - size * 0.7, 1.5);
  gfx.fillCircle(cx + size * 0.3, cy - size * 0.7, 1.5);

  // Upper wings (larger)
  gfx.fillStyle(color, 0.92);
  gfx.fillEllipse(cx - size * 0.5, cy - size * 0.1, size * 0.9, size * 0.7);
  gfx.fillEllipse(cx + size * 0.5, cy - size * 0.1, size * 0.9, size * 0.7);

  // Lower wings (smaller)
  gfx.fillStyle(color, 0.78);
  gfx.fillEllipse(cx - size * 0.4, cy + size * 0.25, size * 0.65, size * 0.55);
  gfx.fillEllipse(cx + size * 0.4, cy + size * 0.25, size * 0.65, size * 0.55);

  // Wing edge detail
  gfx.lineStyle(1, 0x000000, 0.12);
  gfx.strokeEllipse(cx - size * 0.5, cy - size * 0.1, size * 0.9, size * 0.7);
  gfx.strokeEllipse(cx + size * 0.5, cy - size * 0.1, size * 0.9, size * 0.7);

  // Wing spots
  gfx.fillStyle(0xffffff, 0.6);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.15, size * 0.14);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.15, size * 0.14);

  // Inner detail
  gfx.fillStyle(0xffffff, 0.25);
  gfx.fillCircle(cx - size * 0.35, cy + 0, size * 0.10);
  gfx.fillCircle(cx + size * 0.35, cy + 0, size * 0.10);

  // Wing veins (subtle lines)
  gfx.lineStyle(0.8, 0x000000, 0.08);
  gfx.beginPath();
  gfx.moveTo(cx, cy - size * 0.1);
  gfx.lineTo(cx - size * 0.7, cy - size * 0.3);
  gfx.moveTo(cx, cy - size * 0.1);
  gfx.lineTo(cx + size * 0.7, cy - size * 0.3);
  gfx.moveTo(cx, cy + 0);
  gfx.lineTo(cx - size * 0.55, cy + size * 0.3);
  gfx.moveTo(cx, cy + 0);
  gfx.lineTo(cx + size * 0.55, cy + size * 0.3);
  gfx.strokePath();

  return gfx;
}

/**
 * Scatter animated butterflies — some in front of frame, some behind foliage layers.
 */
export function drawButterflies(scene, width, height, rng, depth = 13) {
  const colors = [PAL.butterflyPink, PAL.butterflyOrange, PAL.butterflyWhite,
                  PAL.butterflyCoral, PAL.flowerMagenta];

  // 5 butterflies at various depths
  const butterflyDefs = [
    // In front of frame (depth 13)
    { x: width * 0.20, y: height * 0.28, size: 20, depth: 13 },
    { x: width * 0.75, y: height * 0.22, size: 18, depth: 13 },
    // Behind some foliage layers (depth 4-5)
    { x: width * 0.40, y: height * 0.45, size: 16, depth: 4 },
    { x: width * 0.60, y: height * 0.52, size: 14, depth: 5 },
    { x: width * 0.85, y: height * 0.40, size: 15, depth: 4 },
  ];

  for (const def of butterflyDefs) {
    const color = colors[Math.floor(rng() * colors.length)];
    const bGfx = drawSingleButterfly(scene, 0, 0, def.size, color, rng, def.depth);
    bGfx.setPosition(def.x, def.y);

    // Floating animation
    const driftX = 20 + rng() * 30;
    const driftY = 10 + rng() * 18;
    const duration = 3500 + rng() * 3000;
    const delay = rng() * 2000;

    scene.tweens.add({
      targets: bGfx,
      x: def.x + (rng() > 0.5 ? driftX : -driftX),
      y: def.y - driftY,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay,
    });

    // Wing flap
    scene.tweens.add({
      targets: bGfx,
      scaleX: 0.80,
      duration: 350 + rng() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: delay + rng() * 200,
    });
  }
}

// ================================================================
// SMALL BIRDS
// ================================================================

/**
 * Draw small bird silhouettes in the sky area.
 */
export function drawBirds(scene, width, height, rng, depth = 9) {
  const gfx = scene.add.graphics().setDepth(depth);
  const count = 3;

  for (let i = 0; i < count; i++) {
    const x = width * (0.25 + rng() * 0.5);
    const y = height * (0.12 + rng() * 0.15);
    const size = 8 + rng() * 10;

    // Shadow
    gfx.lineStyle(2.5, PAL.shadowColor, 0.2);
    gfx.beginPath();
    gfx.moveTo(x - size + 3, y + 4);
    gfx.lineTo(x + 3, y - size * 0.4 + 4);
    gfx.lineTo(x + size + 3, y + 4);
    gfx.strokePath();

    // Bird
    gfx.lineStyle(2.5, 0x2a5828, 0.7);
    gfx.beginPath();
    gfx.moveTo(x - size, y);
    gfx.lineTo(x, y - size * 0.4);
    gfx.lineTo(x + size, y);
    gfx.strokePath();
  }

  // Animate gentle drift
  scene.tweens.add({
    targets: gfx,
    x: 20,
    duration: 8000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });

  return gfx;
}

// ================================================================
// CENTRAL GLOW — subtle, behind all layers
// ================================================================

/**
 * Draw a warm central glow — subtler than before, just a light source.
 */
export function drawCentralGlow(scene, width, height, depth = 1) {
  const gfx = scene.add.graphics().setDepth(depth);
  const cx = width * 0.5;
  const cy = height * 0.32;
  const maxR = Math.min(width, height) * 0.50;

  // Soft radial glow — reduced alpha for subtlety
  for (let ring = 10; ring >= 1; ring--) {
    const r = maxR * (ring / 10);
    const alpha = 0.08 * (1 - ring / 12);
    gfx.fillStyle(PAL.glowSoft, alpha);
    gfx.fillCircle(cx, cy, r);
  }

  // Warm center
  gfx.fillStyle(PAL.glow, 0.12);
  gfx.fillCircle(cx, cy, maxR * 0.20);
  gfx.fillStyle(PAL.glow, 0.07);
  gfx.fillCircle(cx, cy, maxR * 0.35);

  return gfx;
}

// ================================================================
// TITLE TEXT (MATH WARRIORS) — no banner, just text with deep shadow
// ================================================================

/**
 * Draw the MATH WARRIORS title text — floating with deep shadow.
 * No cream banner behind it.
 */
export function drawPapercutTitle(scene, cx, cy, scale = 1) {
  const math = scene.add.text(cx, cy - 50 * scale, 'MATH', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(92 * scale)}px`,
    fontStyle: 'bold',
    color: '#4080d8',
    stroke: '#1a3060',
    strokeThickness: 9,
    shadow: { offsetX: 6, offsetY: 8, color: 'rgba(10,20,20,0.50)', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(14);

  const warriors = scene.add.text(cx, cy + 45 * scale, 'WARRIORS', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(76 * scale)}px`,
    fontStyle: 'bold',
    color: '#e05050',
    stroke: '#601818',
    strokeThickness: 8,
    shadow: { offsetX: 6, offsetY: 8, color: 'rgba(10,20,20,0.50)', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(14);

  // Gentle floating animation
  scene.tweens.add({
    targets: math,
    y: math.y - 4,
    duration: 2200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
  scene.tweens.add({
    targets: warriors,
    y: warriors.y + 3,
    duration: 2500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
    delay: 300,
  });

  return { math, warriors };
}

// ================================================================
// FLOATING PETALS
// ================================================================

/**
 * Add gently drifting flower petals.
 */
export function drawFloatingPetals(scene, width, height, rng, depth = 9) {
  const colors = [PAL.flowerPink, PAL.flowerOrange, PAL.flowerCoral, PAL.butterflyWhite, PAL.flowerWhite];

  for (let i = 0; i < 10; i++) {
    const x = rng() * width;
    const y = height * (0.08 + rng() * 0.55);
    const size = 4 + rng() * 6;
    const color = colors[Math.floor(rng() * colors.length)];

    const gfx = scene.add.graphics().setDepth(depth);
    // Petal shadow
    gfx.fillStyle(PAL.shadowColor, 0.15);
    gfx.fillEllipse(2, 3, size, size * 1.6);
    // Petal
    gfx.fillStyle(color, 0.75);
    gfx.fillEllipse(0, 0, size, size * 1.6);
    // Highlight
    gfx.fillStyle(0xffffff, 0.2);
    gfx.fillEllipse(-size * 0.1, -size * 0.3, size * 0.4, size * 0.6);

    gfx.setPosition(x, y);
    gfx.setRotation(rng() * Math.PI * 2);

    // Drift animation
    scene.tweens.add({
      targets: gfx,
      x: x + (rng() - 0.5) * 70,
      y: y + 35 + rng() * 50,
      rotation: gfx.rotation + (rng() - 0.5) * 2.5,
      duration: 5000 + rng() * 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: rng() * 3000,
    });
  }
}

// ================================================================
// SCATTER DECOR (backward compat for other scenes)
// ================================================================

/**
 * Scatter decorative papercut elements around a scene — clouds, flowers,
 * butterflies, stars. Used by GradeSelectScene and other menu screens.
 */
export function scatterPapercutDecor(scene, gameW, gameH, opts = {}) {
  const seed = opts.seed ?? 1;
  const theme = opts.theme ?? 'garden';
  const rng = makeRng(seed);
  const ex = opts.excludeRect;

  const isInExcluded = (x, y) => {
    if (!ex) return false;
    return Math.abs(x - ex.x) < ex.w / 2 && Math.abs(y - ex.y) < ex.h / 2;
  };

  // Clouds along the very top edge only
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (gameW / 4) + (rng() - 0.5) * 100;
    const y = 30 + rng() * 30;
    if (isInExcluded(x, y)) continue;
    _drawDecorCloud(scene, x, y, 80 + rng() * 50, 25 + rng() * 10);
  }

  if (theme === 'garden') {
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * (gameW / 9) + (rng() - 0.5) * 30;
      const y = gameH - 60 - rng() * 40;
      if (isInExcluded(x, y)) continue;
      _drawDecorFlower(scene, x, y, 14 + rng() * 6, rng);
    }
    const corners = [
      { x: gameW * 0.10, y: gameH * 0.55 },
      { x: gameW * 0.90, y: gameH * 0.55 },
      { x: gameW * 0.15, y: gameH * 0.78 },
    ];
    for (const c of corners) {
      if (isInExcluded(c.x, c.y)) continue;
      _drawDecorButterfly(scene, c.x + (rng() - 0.5) * 40, c.y + (rng() - 0.5) * 40, 18 + rng() * 6, rng);
    }
  }

  if (theme === 'night') {
    for (let i = 0; i < 12; i++) {
      const x = rng() * gameW;
      const y = rng() * (gameH * 0.5);
      if (isInExcluded(x, y)) continue;
      _drawDecorStar(scene, x, y, 8 + rng() * 6);
    }
  }
}

function _drawDecorCloud(scene, cx, cy, w, _h) {
  const gfx = scene.add.graphics();
  const bumps = 6;
  gfx.fillStyle(0x000000, 0.1);
  for (let i = 0; i < bumps; i++) {
    const t = i / (bumps - 1);
    const bx = cx + (t - 0.5) * w + 3;
    const r = w / 5 * (0.8 + Math.sin(t * Math.PI) * 0.5);
    gfx.fillCircle(bx, cy + 4, r);
  }
  gfx.fillStyle(0xffffff, 0.95);
  for (let i = 0; i < bumps; i++) {
    const t = i / (bumps - 1);
    const bx = cx + (t - 0.5) * w;
    const r = w / 5 * (0.8 + Math.sin(t * Math.PI) * 0.5);
    gfx.fillCircle(bx, cy, r);
  }
}

function _drawDecorFlower(scene, cx, cy, size, rng) {
  const gfx = scene.add.graphics();
  const palette = [0xf06080, 0xf0c040, 0xf080c0, 0xff8080, 0xa0d8f0];
  const color = palette[Math.floor(rng() * palette.length)];
  gfx.fillStyle(0x388830, 1);
  gfx.fillRect(cx - 2, cy - size * 0.2, 3, size * 1.2);
  gfx.fillStyle(color, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    gfx.fillCircle(cx + Math.cos(a) * size * 0.6, cy + Math.sin(a) * size * 0.6, size * 0.5);
  }
  gfx.fillStyle(0xfff080, 1);
  gfx.fillCircle(cx, cy, size * 0.4);
}

function _drawDecorButterfly(scene, cx, cy, size, rng) {
  const gfx = scene.add.graphics();
  const colors = [0xf06888, 0xa050d0, 0x60c8e0, 0xf09030];
  const c = colors[Math.floor(rng() * colors.length)];
  gfx.fillStyle(0x3a2410, 1);
  gfx.fillRoundedRect(cx - 2, cy - size * 0.4, 4, size * 0.8, 1);
  gfx.fillStyle(c, 0.95);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.2, size * 0.45);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.2, size * 0.45);
  gfx.fillCircle(cx - size * 0.4, cy + size * 0.2, size * 0.35);
  gfx.fillCircle(cx + size * 0.4, cy + size * 0.2, size * 0.35);
  gfx.fillStyle(0xffffff, 0.7);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.2, size * 0.12);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.2, size * 0.12);
}

function _drawDecorStar(scene, cx, cy, size) {
  const gfx = scene.add.graphics();
  gfx.fillStyle(0xfff8a0, 0.85);
  gfx.fillTriangle(cx, cy - size, cx + size * 0.3, cy, cx - size * 0.3, cy);
  gfx.fillTriangle(cx, cy + size, cx + size * 0.3, cy, cx - size * 0.3, cy);
  gfx.fillTriangle(cx - size, cy, cx, cy - size * 0.3, cx, cy + size * 0.3);
  gfx.fillTriangle(cx + size, cy, cx, cy - size * 0.3, cx, cy + size * 0.3);
  gfx.fillStyle(0xffffff, 0.9);
  gfx.fillCircle(cx, cy, size * 0.25);
}
