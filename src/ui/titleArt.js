/**
 * Papercut diorama title art — layered paper scene with organic frame,
 * hills, trees, flowers, butterflies, and floating decorations.
 *
 * Creates a whimsical forest diorama effect where you're looking through
 * an organic paper frame into a layered landscape. Every element casts
 * a drop shadow to reinforce the papercut depth illusion.
 *
 * Palette sourced from the reference image:
 *   - Pale mint background, dark teal frame
 *   - Teal-to-lime gradient hills (back to front)
 *   - Pink/orange/blue flowers, pink/orange butterflies
 *   - Warm yellow central glow
 */

import { makeRng } from '../systems/rng.js';

// ================================================================
// COLOR PALETTE
// ================================================================

const PAL = {
  bg:         0xd4e8d0,  // pale mint green
  frame:      0x1a4040,  // dark teal
  frameInner: 0x1e4848,  // slightly lighter inner frame layers
  farHills:   0x2a6868,  // teal green
  midHills:   0x3a8858,  // forest green
  nearHills:  0x58b848,  // bright green
  foreground: 0x78d858,  // lime green
  glow:       0xffe8a0,  // warm yellow
  glowSoft:   0xfff4d0,  // soft warm white
  treeTrunk:  0x3a2818,  // dark brown
  treeGreen1: 0x2a5828,  // dark green canopy
  treeGreen2: 0x48a838,  // green canopy
  treeGreen3: 0x68c848,  // light green canopy
  flowerPink: 0xf06888,
  flowerOrange: 0xf0a040,
  flowerBlue: 0x80c0e8,
  flowerMagenta: 0xe060a0,
  flowerCenter: 0xfff080,
  butterflyPink: 0xf06888,
  butterflyOrange: 0xf0a040,
  butterflyWhite: 0xe0e8f0,
  bannerCream: 0xfaf4e0,
};

// ================================================================
// HILL GENERATION
// ================================================================

/**
 * Generate a wobbly hill silhouette as an array of {x, y} points.
 */
function generateHillPoints(startX, endX, baseY, peakHeight, peakCount, rng, wobble = 4) {
  const pts = [];
  const totalSteps = peakCount * 10;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    const y = baseY
      - Math.sin(t * Math.PI * peakCount) * peakHeight * (0.6 + rng() * 0.4)
      - Math.sin(t * Math.PI * peakCount * 2.3 + 1.7) * peakHeight * 0.3
      + (rng() - 0.5) * wobble;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Draw a filled hill layer with a drop shadow underneath.
 */
function drawHillLayer(gfx, points, color, shadowColor, bottomY, shadowOx = 3, shadowOy = 6) {
  // Shadow
  if (shadowColor !== undefined) {
    gfx.fillStyle(shadowColor, 0.45);
    gfx.beginPath();
    gfx.moveTo(points[0].x + shadowOx, points[0].y + shadowOy);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x + shadowOx, points[i].y + shadowOy);
    }
    gfx.lineTo(points[points.length - 1].x + shadowOx, bottomY + shadowOy);
    gfx.lineTo(points[0].x + shadowOx, bottomY + shadowOy);
    gfx.closePath();
    gfx.fillPath();
  }

  // Main fill
  gfx.fillStyle(color, 1);
  gfx.beginPath();
  gfx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x, points[i].y);
  }
  gfx.lineTo(points[points.length - 1].x, bottomY);
  gfx.lineTo(points[0].x, bottomY);
  gfx.closePath();
  gfx.fillPath();
}

// ================================================================
// ORGANIC FRAME
// ================================================================

/**
 * Draw the organic papercut diorama frame.
 *
 * The frame covers the outer edges of the screen with an organic,
 * blob-shaped opening in the center, creating the illusion of looking
 * through a hand-cut paper window. Uses bezier curves for smooth edges.
 *
 * Approach: render onto an offscreen canvas using compositing
 * (fill screen, then cut out the organic opening with destination-out),
 * then add as a Phaser image.
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

  // -- Drop shadow for frame (slightly offset dark version) --
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, width, height);
  // Cut out shadow opening (slightly smaller/offset from main)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  drawOrganicOpening(ctx, width, height, rng, -4, -6, -10);
  ctx.globalCompositeOperation = 'source-over';

  // -- Main frame fill --
  ctx.fillStyle = hexToCSS(PAL.frame);
  ctx.fillRect(0, 0, width, height);

  // Cut out the organic opening
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  drawOrganicOpening(ctx, width, height, rng, 0, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // -- Inner edge detail layers (2 thin border rings inside the frame edge) --
  // These create visible depth between the frame and the scene behind it.
  // Layer 1: slightly darker edge highlight
  ctx.strokeStyle = hexToCSS(0x244e4e);
  ctx.lineWidth = 6;
  drawOrganicOpeningStroke(ctx, width, height, rng, 4, 4, 4);

  // Layer 2: lighter inner edge
  ctx.strokeStyle = hexToCSS(0x306060);
  ctx.lineWidth = 3;
  drawOrganicOpeningStroke(ctx, width, height, rng, 10, 10, 8);

  // Add texture: subtle paper grain on the frame
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 600; i++) {
    const gx = rng() * width;
    const gy = rng() * height;
    const ga = 0.03 + rng() * 0.04;
    ctx.fillStyle = `rgba(255,255,255,${ga})`;
    ctx.fillRect(gx, gy, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Create Phaser texture from canvas
  const key = 'diorama-frame-' + Math.random().toString(36).slice(2, 8);
  scene.textures.addCanvas(key, cv);
  const img = scene.add.image(width / 2, height / 2, key).setDepth(depth);
  return img;
}

/**
 * Draw the organic opening path (filled) using bezier curves.
 * offsetX/Y shift the opening, sizeOffset shrinks/grows it.
 */
function drawOrganicOpening(ctx, width, height, rng, offsetX, offsetY, sizeOffset) {
  const cx = width / 2 + offsetX;
  const cy = height * 0.44 + offsetY;
  const rx = width * 0.38 + sizeOffset;
  const ry = height * 0.40 + sizeOffset;

  ctx.beginPath();
  // Create the opening with 8 bezier segments for a smooth organic blob
  const points = generateOpeningPoints(cx, cy, rx, ry, rng);
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    const cp1 = points[i].cp2; // outgoing control point
    const cp2 = next.cp1;       // incoming control point
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Stroke the organic opening path (for inner edge details).
 */
function drawOrganicOpeningStroke(ctx, width, height, rng, offsetX, offsetY, sizeOffset) {
  const cx = width / 2;
  const cy = height * 0.44;
  const rx = width * 0.38 - sizeOffset;
  const ry = height * 0.40 - sizeOffset;

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
  ctx.stroke();
}

/**
 * Generate anchor points + bezier control points for the organic opening.
 * Creates a smooth blob shape with 12 segments.
 */
function generateOpeningPoints(cx, cy, rx, ry, rng) {
  const segments = 12;
  const points = [];
  // Use a fresh RNG seeded from the first few calls to keep deterministic
  // (we don't want the frame shape to change between shadow/main/stroke passes)
  const fixedRng = makeRng(42 + Math.round(rx));

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    // Organic variation: each point has a slightly different radius
    const radiusVariation = 0.92 + fixedRng() * 0.16;
    const wobbleX = (fixedRng() - 0.5) * rx * 0.06;
    const wobbleY = (fixedRng() - 0.5) * ry * 0.06;

    const x = cx + Math.cos(angle) * rx * radiusVariation + wobbleX;
    const y = cy + Math.sin(angle) * ry * radiusVariation + wobbleY;

    // Control points: tangent direction, scaled for smooth curves
    const tangentAngle = angle + Math.PI / 2;
    const cpDist = (2 * Math.PI / segments) * 0.38; // bezier smoothness factor
    const cpRx = rx * radiusVariation * cpDist;
    const cpRy = ry * radiusVariation * cpDist;

    points.push({
      x, y,
      cp1: { // incoming control point
        x: x - Math.cos(tangentAngle) * cpRx,
        y: y - Math.sin(tangentAngle) * cpRy,
      },
      cp2: { // outgoing control point
        x: x + Math.cos(tangentAngle) * cpRx,
        y: y + Math.sin(tangentAngle) * cpRy,
      },
    });
  }
  return points;
}

// ================================================================
// INNER FRAME DEPTH LAYERS
// ================================================================

/**
 * Draw 2-3 intermediate depth layers INSIDE the frame opening, each
 * slightly smaller, with organic curved edges. These sit between the
 * main frame and the background hills to add visible depth.
 */
export function drawInnerFrameLayers(scene, width, height, rng, depth = 11) {
  const gfx = scene.add.graphics().setDepth(depth);
  const layers = [
    { color: 0x1e5050, alpha: 0.7, shrink: 0.03, peakH: 0.06 },
    { color: 0x245858, alpha: 0.5, shrink: 0.06, peakH: 0.04 },
  ];

  for (const layer of layers) {
    // Top inner curve
    const topPts = [];
    const topBaseY = height * (0.06 + layer.shrink);
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = -20 + t * (width + 40);
      const curve = Math.sin(t * Math.PI) * height * layer.peakH;
      const wobble = (rng() - 0.5) * 4;
      topPts.push({ x, y: topBaseY + curve + wobble });
    }
    // Shadow
    gfx.fillStyle(0x000000, 0.25);
    gfx.beginPath();
    gfx.moveTo(-20 + 3, 0 + 4);
    gfx.lineTo(width + 20 + 3, 0 + 4);
    for (let i = topPts.length - 1; i >= 0; i--) {
      gfx.lineTo(topPts[i].x + 3, topPts[i].y + 4);
    }
    gfx.closePath();
    gfx.fillPath();
    // Fill
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(-20, 0);
    gfx.lineTo(width + 20, 0);
    for (let i = topPts.length - 1; i >= 0; i--) {
      gfx.lineTo(topPts[i].x, topPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Bottom inner curve
    const bottomPts = [];
    const bottomBaseY = height * (0.88 - layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = -20 + t * (width + 40);
      const curve = Math.sin(t * Math.PI) * height * layer.peakH;
      const wobble = (rng() - 0.5) * 4;
      bottomPts.push({ x, y: bottomBaseY - curve + wobble });
    }
    // Shadow
    gfx.fillStyle(0x000000, 0.25);
    gfx.beginPath();
    gfx.moveTo(-20 + 3, height + 4);
    gfx.lineTo(width + 20 + 3, height + 4);
    for (let i = bottomPts.length - 1; i >= 0; i--) {
      gfx.lineTo(bottomPts[i].x + 3, bottomPts[i].y + 4);
    }
    gfx.closePath();
    gfx.fillPath();
    // Fill
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(-20, height);
    gfx.lineTo(width + 20, height);
    for (let i = bottomPts.length - 1; i >= 0; i--) {
      gfx.lineTo(bottomPts[i].x, bottomPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Left inner curve
    const leftPts = [];
    const leftBaseX = width * (0.06 + layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -20 + t * (height + 40);
      const curve = Math.sin(t * Math.PI) * width * layer.peakH * 0.5;
      const wobble = (rng() - 0.5) * 4;
      leftPts.push({ x: leftBaseX + curve + wobble, y });
    }
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(0, -20);
    gfx.lineTo(0, height + 20);
    for (let i = leftPts.length - 1; i >= 0; i--) {
      gfx.lineTo(leftPts[i].x, leftPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();

    // Right inner curve
    const rightPts = [];
    const rightBaseX = width * (0.94 - layer.shrink);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -20 + t * (height + 40);
      const curve = Math.sin(t * Math.PI) * width * layer.peakH * 0.5;
      const wobble = (rng() - 0.5) * 4;
      rightPts.push({ x: rightBaseX - curve + wobble, y });
    }
    gfx.fillStyle(layer.color, layer.alpha);
    gfx.beginPath();
    gfx.moveTo(width, -20);
    gfx.lineTo(width, height + 20);
    for (let i = rightPts.length - 1; i >= 0; i--) {
      gfx.lineTo(rightPts[i].x, rightPts[i].y);
    }
    gfx.closePath();
    gfx.fillPath();
  }

  return gfx;
}

// ================================================================
// TREES
// ================================================================

/**
 * Draw a layered tree with trunk and overlapping circle canopy.
 * NOT triangle trees — proper organic silhouettes.
 */
function drawTree(gfx, baseX, baseY, height, rng, flipped = false) {
  const trunkW = height * 0.08;
  const trunkH = height * 0.45;

  // Shadow
  const sx = 4, sy = 5;
  gfx.fillStyle(0x000000, 0.3);
  gfx.fillRect(baseX - trunkW / 2 + sx, baseY - trunkH + sy, trunkW, trunkH);

  // Trunk
  gfx.fillStyle(PAL.treeTrunk, 1);
  gfx.fillRect(baseX - trunkW / 2, baseY - trunkH, trunkW, trunkH);

  // Canopy — 4-5 overlapping circles in varying greens
  const canopyColors = [PAL.treeGreen1, PAL.treeGreen2, PAL.treeGreen3, PAL.treeGreen2];
  const canopyTop = baseY - trunkH - height * 0.15;
  const canopyR = height * 0.22;

  // Shadow for canopy cluster
  gfx.fillStyle(0x000000, 0.3);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng() * 0.5;
    const dist = canopyR * 0.35;
    const cx = baseX + Math.cos(angle) * dist + sx;
    const cy = canopyTop + Math.sin(angle) * dist * 0.6 + sy;
    const r = canopyR * (0.7 + rng() * 0.3);
    gfx.fillCircle(cx, cy, r);
  }
  gfx.fillCircle(baseX + sx, canopyTop - canopyR * 0.2 + sy, canopyR * 0.8);

  // Main canopy circles
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng() * 0.5;
    const dist = canopyR * 0.35;
    const cx = baseX + Math.cos(angle) * dist;
    const cy = canopyTop + Math.sin(angle) * dist * 0.6;
    const r = canopyR * (0.7 + rng() * 0.3);
    gfx.fillStyle(canopyColors[i], 1);
    gfx.fillCircle(cx, cy, r);
  }
  // Central highlight circle
  gfx.fillStyle(PAL.treeGreen3, 0.8);
  gfx.fillCircle(baseX, canopyTop - canopyR * 0.2, canopyR * 0.8);

  // Leaf highlight
  gfx.fillStyle(0xffffff, 0.1);
  gfx.fillCircle(baseX - canopyR * 0.15, canopyTop - canopyR * 0.4, canopyR * 0.45);
}

/**
 * Draw all trees on the left and right sides of the scene.
 */
export function drawTrees(scene, width, height, rng, depth = 8) {
  const gfx = scene.add.graphics().setDepth(depth);

  // Left side trees (2-3)
  const leftTrees = [
    { x: width * 0.06, y: height * 0.82, h: 180 + rng() * 40 },
    { x: width * 0.14, y: height * 0.80, h: 140 + rng() * 30 },
    { x: width * 0.02, y: height * 0.84, h: 100 + rng() * 20 },
  ];

  // Right side trees (2-3)
  const rightTrees = [
    { x: width * 0.94, y: height * 0.82, h: 170 + rng() * 40 },
    { x: width * 0.86, y: height * 0.80, h: 150 + rng() * 30 },
    { x: width * 0.97, y: height * 0.84, h: 110 + rng() * 20 },
  ];

  for (const t of leftTrees) drawTree(gfx, t.x, t.y, t.h, rng);
  for (const t of rightTrees) drawTree(gfx, t.x, t.y, t.h, rng, true);

  return gfx;
}

// ================================================================
// FLOWERS
// ================================================================

/**
 * Draw a single flower: 5 petals in a ring + yellow center.
 */
function drawSingleFlower(gfx, cx, cy, size, color, rng) {
  const petalCount = 5;
  // Shadow
  gfx.fillStyle(0x000000, 0.2);
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2 + rng() * 0.3;
    const px = cx + Math.cos(a) * size * 0.55 + 2;
    const py = cy + Math.sin(a) * size * 0.55 + 3;
    gfx.fillCircle(px, py, size * 0.42);
  }
  // Stem
  gfx.fillStyle(0x388830, 1);
  gfx.fillRect(cx - 1.5, cy + size * 0.3, 3, size * 1.5);
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
  gfx.fillStyle(0xffffff, 0.3);
  gfx.fillCircle(cx - size * 0.05, cy - size * 0.05, size * 0.15);
}

/**
 * Scatter flowers along the foreground hills.
 */
export function drawFlowers(scene, width, height, rng, depth = 7) {
  const gfx = scene.add.graphics().setDepth(depth);
  const colors = [PAL.flowerPink, PAL.flowerOrange, PAL.flowerBlue, PAL.flowerMagenta];
  const count = 18;

  for (let i = 0; i < count; i++) {
    // Distribute across bottom area, avoiding center title zone
    let x, y;
    const attempt = rng();
    if (attempt < 0.4) {
      // Left side
      x = width * (0.04 + rng() * 0.28);
    } else if (attempt < 0.8) {
      // Right side
      x = width * (0.68 + rng() * 0.28);
    } else {
      // Center bottom
      x = width * (0.3 + rng() * 0.4);
    }
    y = height * (0.72 + rng() * 0.12);

    const size = 8 + rng() * 10;
    const color = colors[Math.floor(rng() * colors.length)];
    drawSingleFlower(gfx, x, y, size, color, rng);
  }

  return gfx;
}

// ================================================================
// BUTTERFLIES
// ================================================================

/**
 * Draw a single butterfly and return the graphics + container info
 * for animation.
 */
function drawSingleButterfly(scene, cx, cy, size, color, rng, depth) {
  const gfx = scene.add.graphics().setDepth(depth);

  // Body
  gfx.fillStyle(0x3a2410, 1);
  gfx.fillRoundedRect(cx - 1.5, cy - size * 0.35, 3, size * 0.7, 1);

  // Upper wings (larger)
  gfx.fillStyle(color, 0.92);
  gfx.fillEllipse(cx - size * 0.5, cy - size * 0.15, size * 0.8, size * 0.65);
  gfx.fillEllipse(cx + size * 0.5, cy - size * 0.15, size * 0.8, size * 0.65);

  // Lower wings (smaller)
  gfx.fillStyle(color, 0.8);
  gfx.fillEllipse(cx - size * 0.38, cy + size * 0.22, size * 0.6, size * 0.5);
  gfx.fillEllipse(cx + size * 0.38, cy + size * 0.22, size * 0.6, size * 0.5);

  // Wing spots
  gfx.fillStyle(0xffffff, 0.6);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.18, size * 0.12);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.18, size * 0.12);

  // Wing inner detail
  gfx.fillStyle(0xffffff, 0.2);
  gfx.fillCircle(cx - size * 0.35, cy - size * 0.05, size * 0.08);
  gfx.fillCircle(cx + size * 0.35, cy - size * 0.05, size * 0.08);

  return gfx;
}

/**
 * Scatter animated butterflies across the scene.
 */
export function drawButterflies(scene, width, height, rng, depth = 10) {
  const colors = [PAL.butterflyPink, PAL.butterflyOrange, PAL.butterflyWhite,
                  PAL.flowerMagenta, PAL.flowerBlue];
  const count = 6;

  for (let i = 0; i < count; i++) {
    // Position butterflies in the visible area (not behind frame)
    const x = width * (0.15 + rng() * 0.7);
    const y = height * (0.15 + rng() * 0.5);
    const size = 14 + rng() * 10;
    const color = colors[Math.floor(rng() * colors.length)];

    const gfx = drawSingleButterfly(scene, 0, 0, size, color, rng, depth);

    // Position via setPosition so we can tween the graphics object
    gfx.setPosition(x, y);

    // Gentle floating animation
    const driftX = 15 + rng() * 25;
    const driftY = 8 + rng() * 15;
    const duration = 3000 + rng() * 3000;
    const delay = rng() * 2000;

    scene.tweens.add({
      targets: gfx,
      x: x + (rng() > 0.5 ? driftX : -driftX),
      y: y - driftY,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay,
    });

    // Subtle scale pulse (wing flap illusion)
    scene.tweens.add({
      targets: gfx,
      scaleX: 0.85,
      duration: 400 + rng() * 300,
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
 * Draw small bird silhouettes (simple V shapes).
 */
export function drawBirds(scene, width, height, rng, depth = 9) {
  const gfx = scene.add.graphics().setDepth(depth);
  const count = 4;

  for (let i = 0; i < count; i++) {
    const x = width * (0.2 + rng() * 0.6);
    const y = height * (0.12 + rng() * 0.2);
    const size = 6 + rng() * 8;

    // Shadow
    gfx.lineStyle(2, 0x000000, 0.15);
    gfx.beginPath();
    gfx.moveTo(x - size + 2, y + 3);
    gfx.lineTo(x + 2, y - size * 0.4 + 3);
    gfx.lineTo(x + size + 2, y + 3);
    gfx.strokePath();

    // Bird
    gfx.lineStyle(2, 0x2a5828, 0.7);
    gfx.beginPath();
    gfx.moveTo(x - size, y);
    gfx.lineTo(x, y - size * 0.4);
    gfx.lineTo(x + size, y);
    gfx.strokePath();
  }

  return gfx;
}

// ================================================================
// CENTRAL GLOW
// ================================================================

/**
 * Draw a warm central glow (radial gradient approximation).
 */
export function drawCentralGlow(scene, width, height, depth = 1) {
  const gfx = scene.add.graphics().setDepth(depth);
  const cx = width * 0.5;
  const cy = height * 0.35;
  const maxR = Math.min(width, height) * 0.55;

  // Soft radial glow with concentric circles
  for (let ring = 12; ring >= 1; ring--) {
    const r = maxR * (ring / 12);
    const alpha = 0.12 * (1 - ring / 14);
    gfx.fillStyle(PAL.glowSoft, alpha);
    gfx.fillCircle(cx, cy, r);
  }

  // Warm center
  gfx.fillStyle(PAL.glow, 0.2);
  gfx.fillCircle(cx, cy, maxR * 0.25);
  gfx.fillStyle(PAL.glow, 0.12);
  gfx.fillCircle(cx, cy, maxR * 0.4);

  return gfx;
}

// ================================================================
// HILL LAYERS (exported for TitleScene)
// ================================================================

/**
 * Draw all hill layers for the diorama background.
 */
export function drawDioramaHills(scene, width, height, rng, depth = 3) {
  const gfx = scene.add.graphics().setDepth(depth);

  const hillDefs = [
    { baseY: height * 0.50, peakH: height * 0.10, peaks: 3, color: PAL.farHills, shadow: 0x1a4848, wobble: 3 },
    { baseY: height * 0.58, peakH: height * 0.12, peaks: 4, color: PAL.midHills, shadow: 0x286838, wobble: 4 },
    { baseY: height * 0.66, peakH: height * 0.10, peaks: 5, color: PAL.nearHills, shadow: 0x389828, wobble: 4 },
    { baseY: height * 0.74, peakH: height * 0.08, peaks: 3, color: PAL.foreground, shadow: 0x48a838, wobble: 5 },
  ];

  for (const def of hillDefs) {
    const pts = generateHillPoints(-30, width + 30, def.baseY, def.peakH, def.peaks, rng, def.wobble);
    drawHillLayer(gfx, pts, def.color, def.shadow, height, 3, 6);
  }

  // Grass tufts on foreground
  gfx.fillStyle(0x68c840, 0.8);
  for (let i = 0; i < 30; i++) {
    const gx = rng() * width;
    const gy = height * (0.73 + rng() * 0.12);
    const gh = 4 + rng() * 8;
    gfx.fillTriangle(gx - 2, gy, gx, gy - gh, gx + 2, gy);
  }

  return gfx;
}

// ================================================================
// TITLE TEXT (MATH WARRIORS)
// ================================================================

/**
 * Draw the MATH WARRIORS title text with a subtle paper banner behind it.
 */
export function drawPapercutTitle(scene, cx, cy, scale = 1) {
  // Cream paper banner behind the text
  const bannerGfx = scene.add.graphics().setDepth(13);
  const bannerW = 700 * scale;
  const bannerH = 200 * scale;
  // Banner shadow
  bannerGfx.fillStyle(0x000000, 0.2);
  bannerGfx.fillRoundedRect(cx - bannerW / 2 + 4, cy - bannerH / 2 + 5, bannerW, bannerH, 18);
  // Banner fill
  bannerGfx.fillStyle(PAL.bannerCream, 0.85);
  bannerGfx.fillRoundedRect(cx - bannerW / 2, cy - bannerH / 2, bannerW, bannerH, 18);
  // Banner edge
  bannerGfx.lineStyle(3, 0xc8b888, 0.5);
  bannerGfx.strokeRoundedRect(cx - bannerW / 2, cy - bannerH / 2, bannerW, bannerH, 18);

  const math = scene.add.text(cx, cy - 50 * scale, 'MATH', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(88 * scale)}px`,
    fontStyle: 'bold',
    color: '#4080d8',
    stroke: '#1a3060',
    strokeThickness: 8,
    shadow: { offsetX: 4, offsetY: 5, color: 'rgba(20,10,4,0.35)', blur: 6, fill: true },
  }).setOrigin(0.5).setDepth(14);

  const warriors = scene.add.text(cx, cy + 40 * scale, 'WARRIORS', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(72 * scale)}px`,
    fontStyle: 'bold',
    color: '#e05050',
    stroke: '#601818',
    strokeThickness: 7,
    shadow: { offsetX: 4, offsetY: 5, color: 'rgba(20,10,4,0.35)', blur: 6, fill: true },
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

  return { math, warriors, bannerGfx };
}

// ================================================================
// FLOATING PETALS (extra decoration)
// ================================================================

/**
 * Add a few gently drifting flower petals.
 */
export function drawFloatingPetals(scene, width, height, rng, depth = 9) {
  const colors = [PAL.flowerPink, PAL.flowerOrange, PAL.flowerBlue, PAL.butterflyWhite];

  for (let i = 0; i < 8; i++) {
    const x = rng() * width;
    const y = height * (0.1 + rng() * 0.6);
    const size = 4 + rng() * 5;
    const color = colors[Math.floor(rng() * colors.length)];

    const gfx = scene.add.graphics().setDepth(depth);
    gfx.fillStyle(color, 0.7);
    // Simple petal shape: small ellipse
    gfx.fillEllipse(0, 0, size, size * 1.6);
    gfx.setPosition(x, y);
    gfx.setRotation(rng() * Math.PI * 2);

    // Gentle drift animation
    scene.tweens.add({
      targets: gfx,
      x: x + (rng() - 0.5) * 60,
      y: y + 30 + rng() * 40,
      rotation: gfx.rotation + (rng() - 0.5) * 2,
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
