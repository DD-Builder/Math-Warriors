/**
 * Papercut diorama title art — showpiece 1:1 match of the reference.
 *
 * Nested organic frame (cream -> teal -> forest -> coral -> orange),
 * forest diorama with layered hills, trees, flowers, animated butterflies.
 *
 * All colors from PAPER palette. Soft teal-tinted shadows on every layer.
 * NO dark outlines or strokes anywhere.
 */

import { makeRng } from '../systems/rng.js';
import { PAPER, PAPER_CSS, PAPER_SHADOW } from '../config.js';
import {
  blobPoints, waveEdgePoints, hillPoints, organicRectPoints,
  drawShadowedPoly, drawShadowedBlob, drawPapercutHills,
  drawLayeredFrame, drawPapercutTree, drawPapercutFlower,
  drawButterfly, drawLeafSprig, rotatePoints,
  fillPtsCtx, softShadowCtx, clearShadowCtx,
} from '../systems/papercutArt.js';

// ================================================================
// ORGANIC FRAME
// ================================================================

/**
 * Draw the nested organic diorama frame.
 * Layers: cream -> teal -> forest -> coral -> orange (outermost to innermost).
 */
export function drawDioramaFrame(scene, width, height, rng, depth = 12) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d');

  const cx = width / 2, cy = height * 0.46;
  const frameLayers = [
    { color: PAPER.sage,    inset: 0 },
    { color: PAPER.cream,   inset: 18 },
    { color: PAPER.tealD,   inset: 16 },
    { color: PAPER.forest,  inset: 14 },
    { color: PAPER.coral,   inset: 12 },
    { color: PAPER.orange,  inset: 10 },
  ];

  let cw = width, ch = height;
  for (let i = 0; i < frameLayers.length; i++) {
    const layer = frameLayers[i];
    const pts = organicRectPoints(cx, cy, cw, ch, {
      seed: 7 + i * 31, wobble: 12, points: 72, roundness: 4,
    });

    // Shadow
    const shadowPts = pts.map(p => ({ x: p.x, y: p.y + 6 }));
    fillPtsCtx(ctx, shadowPts, `rgba(31,61,63,0.18)`, false);

    // Fill frame
    const c = layer.color;
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
    fillPtsCtx(ctx, pts, `rgb(${r},${g},${b})`, false);

    cw -= layer.inset * 2;
    ch -= layer.inset * 2;
  }

  // Cut the inner opening
  ctx.globalCompositeOperation = 'destination-out';
  const openPts = organicRectPoints(cx, cy, cw, ch, {
    seed: 999, wobble: 10, points: 72, roundness: 4,
  });
  fillPtsCtx(ctx, openPts, 'rgba(0,0,0,1)', false);
  ctx.globalCompositeOperation = 'source-over';

  // Paper texture on frame
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 600; i++) {
    const gx = rng() * width, gy = rng() * height;
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.03})`;
    ctx.fillRect(gx, gy, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  const key = 'diorama-frame-' + Math.random().toString(36).slice(2, 8);
  scene.textures.addCanvas(key, cv);
  return scene.add.image(width / 2, height / 2, key).setDepth(depth);
}

// ================================================================
// INNER FRAME DEPTH LAYERS
// ================================================================

export function drawInnerFrameLayers(scene, width, height, rng, depth = 11) {
  const gfx = scene.add.graphics().setDepth(depth);

  const innerColors = [PAPER.tealD, PAPER.forest];
  for (let i = 0; i < innerColors.length; i++) {
    const shrink = 0.03 + i * 0.025;

    // Top inner wave
    const topPts = waveEdgePoints(-30, width + 30, height * (0.04 + shrink), {
      seed: 50 + i * 17, amplitude: height * 0.04,
    });
    const topPoly = [{ x: -30, y: 0 }, { x: width + 30, y: 0 }];
    for (let j = topPts.length - 1; j >= 0; j--) topPoly.push(topPts[j]);
    drawShadowedPoly(gfx, topPoly, innerColors[i], {
      shadowDy: 6, shadowAlpha: 0.2, alpha: 0.7,
    });

    // Bottom inner wave
    const botPts = waveEdgePoints(-30, width + 30, height * (0.90 - shrink), {
      seed: 60 + i * 17, amplitude: height * 0.04,
    });
    const botPoly = [{ x: -30, y: height }, { x: width + 30, y: height }];
    for (let j = botPts.length - 1; j >= 0; j--) botPoly.push(botPts[j]);
    drawShadowedPoly(gfx, botPoly, innerColors[i], {
      shadowDy: -6, shadowAlpha: 0.2, alpha: 0.7,
    });

    // Left
    const leftPts = waveEdgePoints(0, height, width * (0.04 + shrink), {
      seed: 70 + i * 17, amplitude: width * 0.03,
    });
    const leftPoly = [{ x: 0, y: 0 }, { x: 0, y: height }];
    for (let j = leftPts.length - 1; j >= 0; j--) {
      leftPoly.push({ x: leftPts[j].y, y: leftPts[j].x });
    }
    drawShadowedPoly(gfx, leftPoly, innerColors[i], {
      shadowDx: 5, shadowDy: 0, shadowAlpha: 0.2, alpha: 0.7,
    });

    // Right
    const rightPts = waveEdgePoints(0, height, width * (0.96 - shrink), {
      seed: 80 + i * 17, amplitude: width * 0.03,
    });
    const rightPoly = [{ x: width, y: 0 }, { x: width, y: height }];
    for (let j = rightPts.length - 1; j >= 0; j--) {
      rightPoly.push({ x: width - (rightPts[j].y - width * (0.96 - shrink)), y: rightPts[j].x });
    }
    drawShadowedPoly(gfx, rightPoly, innerColors[i], {
      shadowDx: -5, shadowDy: 0, shadowAlpha: 0.2, alpha: 0.7,
    });
  }

  return gfx;
}

// ================================================================
// LAYERED FOLIAGE (rolling hills)
// ================================================================

export function drawFoliageLayers(scene, width, height, rng, baseDepth = 2) {
  const layerDefs = [
    { depth: baseDepth,     color: PAPER.forestD, topY: height * 0.42, amp: height * 0.06 },
    { depth: baseDepth + 1, color: PAPER.forest,  topY: height * 0.50, amp: height * 0.08 },
    { depth: baseDepth + 2, color: PAPER.forestL, topY: height * 0.58, amp: height * 0.07 },
    { depth: baseDepth + 3, color: PAPER.leaf,    topY: height * 0.67, amp: height * 0.06 },
    { depth: baseDepth + 4, color: PAPER.sage,    topY: height * 0.76, amp: height * 0.04 },
  ];

  const allGfx = [];
  for (let i = 0; i < layerDefs.length; i++) {
    const layer = layerDefs[i];
    const gfx = scene.add.graphics().setDepth(layer.depth);
    const pts = hillPoints(-40, width + 40, layer.topY, height + 20, {
      seed: 20 + i * 13, amplitude: layer.amp,
    });
    drawShadowedPoly(gfx, pts, layer.color, {
      shadowDy: -7, shadowAlpha: 0.2,
    });
    allGfx.push(gfx);
  }

  // Leaf sprigs on foreground layers
  const sprigGfx = scene.add.graphics().setDepth(baseDepth + 3);
  for (let i = 0; i < 15; i++) {
    drawLeafSprig(sprigGfx, rng() * width, height * (0.72 + rng() * 0.08),
      8 + rng() * 10, { seed: 100 + i * 7, color: PAPER.leaf, angle: (rng() - 0.5) * 0.6 });
  }
  allGfx.push(sprigGfx);

  return allGfx;
}

// ================================================================
// TREES
// ================================================================

export function drawTrees(scene, width, height, rng, depth = 5) {
  const creamGfx = scene.add.graphics().setDepth(depth);
  // Prominent cream tree on right
  drawPapercutTree(creamGfx, width * 0.78, height * 0.72, 280 + rng() * 30, {
    seed: 42, style: 'round',
    canopy: PAPER.forestL, canopyHi: PAPER.leaf,
    trunk: PAPER.cream,
  });
  // Add flowers on branches
  for (let i = 0; i < 6; i++) {
    drawPapercutFlower(creamGfx,
      width * 0.78 + (rng() - 0.5) * 100,
      height * 0.45 + rng() * 80,
      4 + rng() * 4, {
        seed: 200 + i * 11, color: PAPER.coral, center: PAPER.gold,
      });
  }

  // Dark green trees on left
  const darkGfx = scene.add.graphics().setDepth(depth - 1);
  drawPapercutTree(darkGfx, width * 0.12, height * 0.68, 200 + rng() * 30, {
    seed: 50, style: 'round', canopy: PAPER.forestD, canopyHi: PAPER.forest, trunk: PAPER.creamD,
  });
  drawPapercutTree(darkGfx, width * 0.22, height * 0.66, 160 + rng() * 25, {
    seed: 60, style: 'pine', canopy: PAPER.forest, canopyHi: PAPER.forestL, trunk: PAPER.creamD,
  });
  drawPapercutTree(darkGfx, width * 0.04, height * 0.70, 130 + rng() * 20, {
    seed: 70, style: 'sapling', canopy: PAPER.forestL, trunk: PAPER.creamD,
  });

  return { creamGfx, darkGfx };
}

// ================================================================
// FLOWERS
// ================================================================

export function drawFlowers(scene, width, height, rng, depth = 6) {
  const gfx = scene.add.graphics().setDepth(depth);
  const colors = [PAPER.coral, PAPER.rose, PAPER.peach, PAPER.lavender, PAPER.orange];

  for (let i = 0; i < 16; i++) {
    let x;
    const attempt = rng();
    if (attempt < 0.4) x = width * (0.04 + rng() * 0.28);
    else if (attempt < 0.8) x = width * (0.68 + rng() * 0.28);
    else x = width * (0.3 + rng() * 0.4);
    const y = height * (0.68 + rng() * 0.14);
    const size = 6 + rng() * 10;
    drawPapercutFlower(gfx, x, y, size, {
      seed: 300 + i * 11,
      color: colors[Math.floor(rng() * colors.length)],
      center: PAPER.gold,
      stem: 8 + rng() * 8,
      stemColor: PAPER.leaf,
    });
  }

  // Number flowers with math symbols
  const mathLabels = ['3', '7', '+', '×'];
  const numberFlowerPositions = [
    { x: width * 0.28, y: height * 0.66 },
    { x: width * 0.52, y: height * 0.72 },
    { x: width * 0.68, y: height * 0.68 },
    { x: width * 0.40, y: height * 0.76 },
  ];
  for (let i = 0; i < mathLabels.length; i++) {
    const pos = numberFlowerPositions[i];
    drawPapercutFlower(gfx, pos.x, pos.y, 12 + rng() * 4, {
      seed: 400 + i * 13,
      color: colors[Math.floor(rng() * colors.length)],
      center: PAPER.gold,
      stem: 10, stemColor: PAPER.leaf,
    });
    scene.add.text(pos.x, pos.y, mathLabels[i], {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '12px', fontStyle: 'bold',
      color: PAPER_CSS.forestD,
      stroke: PAPER_CSS.cream,
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(depth + 1);
  }

  return gfx;
}

// ================================================================
// EQUATION STONES
// ================================================================

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
    drawShadowedPoly(gfx, organicRectPoints(pos.x, pos.y, sw, sh, {
      seed: 500 + i * 19, wobble: 4, roundness: 6,
    }), PAPER.sand, { shadowDy: 4, shadowAlpha: 0.2 });

    scene.add.text(pos.x, pos.y, equations[i], {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '13px', color: PAPER_CSS.forest,
    }).setOrigin(0.5).setDepth(depth + 1).setAlpha(0.7);
  }

  return gfx;
}

// ================================================================
// CRYSTAL
// ================================================================

export function drawCrystal(scene, width, height, rng, depth = 6) {
  const gfx = scene.add.graphics().setDepth(depth);
  const cx = width * 0.48, cy = height * 0.74;
  drawShadowedBlob(gfx, cx, cy, 14, 20, PAPER.sky, {
    seed: 600, wobble: 0.1, shadowDy: 4, shadowAlpha: 0.18,
  });
  // Highlight
  gfx.fillStyle(PAPER.cream, 0.4);
  gfx.fillCircle(cx - 3, cy - 5, 5);
  return gfx;
}

// ================================================================
// SPARKLES
// ================================================================

export function drawSparkles(scene, width, height, rng, depth = 7) {
  const sparkles = [];
  const positions = [
    { x: width * 0.28, y: height * 0.63 },
    { x: width * 0.52, y: height * 0.69 },
    { x: width * 0.68, y: height * 0.65 },
    { x: width * 0.48, y: height * 0.70 },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
    { x: width * (0.2 + rng() * 0.6), y: height * (0.3 + rng() * 0.3) },
  ];

  for (const pos of positions) {
    const gfx = scene.add.graphics().setDepth(depth);
    const size = 2 + rng() * 3;
    gfx.fillStyle(PAPER.cream, 0.3);
    gfx.fillCircle(0, 0, size * 2.5);
    gfx.fillStyle(PAPER.white, 0.8);
    gfx.fillCircle(0, 0, size);
    gfx.setPosition(pos.x, pos.y);

    scene.tweens.add({
      targets: gfx,
      alpha: 0.2 + rng() * 0.3,
      duration: 1500 + rng() * 2000,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
      delay: rng() * 2000,
    });
    sparkles.push(gfx);
  }

  return sparkles;
}

// ================================================================
// BUTTERFLIES
// ================================================================

export function drawButterflies(scene, width, height, rng, depth = 13) {
  const colors = [PAPER.white, PAPER.rose, PAPER.peach, PAPER.lavender, PAPER.coral];

  const butterflyDefs = [
    { x: width * 0.20, y: height * 0.28, size: 18, depth: 13 },
    { x: width * 0.75, y: height * 0.22, size: 16, depth: 13 },
    { x: width * 0.40, y: height * 0.45, size: 14, depth: 4 },
    { x: width * 0.60, y: height * 0.52, size: 12, depth: 5 },
    { x: width * 0.85, y: height * 0.40, size: 13, depth: 4 },
  ];

  for (const def of butterflyDefs) {
    const bGfx = scene.add.graphics().setDepth(def.depth);
    const color = colors[Math.floor(rng() * colors.length)];
    drawButterfly(bGfx, 0, 0, def.size, {
      seed: 700 + def.x, color, accent: color,
    });
    bGfx.setPosition(def.x, def.y);

    const driftX = 20 + rng() * 30;
    const driftY = 10 + rng() * 18;
    scene.tweens.add({
      targets: bGfx,
      x: def.x + (rng() > 0.5 ? driftX : -driftX),
      y: def.y - driftY,
      duration: 3500 + rng() * 3000,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
      delay: rng() * 2000,
    });
    scene.tweens.add({
      targets: bGfx,
      scaleX: 0.80,
      duration: 350 + rng() * 300,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
      delay: rng() * 200,
    });
  }
}

// ================================================================
// BIRDS
// ================================================================

export function drawBirds(scene, width, height, rng, depth = 9) {
  const gfx = scene.add.graphics().setDepth(depth);
  for (let i = 0; i < 3; i++) {
    const x = width * (0.25 + rng() * 0.5);
    const y = height * (0.12 + rng() * 0.15);
    const size = 8 + rng() * 10;
    // Bird as organic blob pair (wings)
    drawShadowedBlob(gfx, x - size * 0.4, y, size * 0.4, size * 0.15, PAPER.forest, {
      seed: 800 + i * 17, wobble: 0.12, shadowDy: 2, shadowAlpha: 0.12,
    });
    drawShadowedBlob(gfx, x + size * 0.4, y, size * 0.4, size * 0.15, PAPER.forest, {
      seed: 810 + i * 17, wobble: 0.12, shadowDy: 2, shadowAlpha: 0.12,
    });
  }

  scene.tweens.add({
    targets: gfx, x: 20, duration: 8000,
    yoyo: true, repeat: -1, ease: 'Sine.inOut',
  });

  return gfx;
}

// ================================================================
// CENTRAL GLOW
// ================================================================

export function drawCentralGlow(scene, width, height, depth = 1) {
  const gfx = scene.add.graphics().setDepth(depth);
  const cx = width * 0.5, cy = height * 0.32;
  const maxR = Math.min(width, height) * 0.50;

  for (let ring = 10; ring >= 1; ring--) {
    const r = maxR * (ring / 10);
    gfx.fillStyle(PAPER.cream, 0.06 * (1 - ring / 12));
    gfx.fillCircle(cx, cy, r);
  }
  gfx.fillStyle(PAPER.gold, 0.08);
  gfx.fillCircle(cx, cy, maxR * 0.2);

  return gfx;
}

// ================================================================
// TITLE TEXT — recolor into PAPER palette, keep letter construction
// ================================================================

export function drawPapercutTitle(scene, cx, cy, scale = 1) {
  const math = scene.add.text(cx, cy - 50 * scale, 'MATH', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(92 * scale)}px`,
    fontStyle: 'bold',
    color: PAPER_CSS.teal,
    stroke: PAPER_CSS.tealD,
    strokeThickness: 9,
    shadow: { offsetX: 4, offsetY: 6, color: 'rgba(31,61,63,0.40)', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(14);

  const warriors = scene.add.text(cx, cy + 45 * scale, 'WARRIORS', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(76 * scale)}px`,
    fontStyle: 'bold',
    color: PAPER_CSS.coral,
    stroke: PAPER_CSS.coralD,
    strokeThickness: 8,
    shadow: { offsetX: 4, offsetY: 6, color: 'rgba(31,61,63,0.40)', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(14);

  scene.tweens.add({
    targets: math, y: math.y - 4,
    duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut',
  });
  scene.tweens.add({
    targets: warriors, y: warriors.y + 3,
    duration: 2500, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 300,
  });

  return { math, warriors };
}

// ================================================================
// FLOATING PETALS
// ================================================================

export function drawFloatingPetals(scene, width, height, rng, depth = 9) {
  const colors = [PAPER.coral, PAPER.rose, PAPER.peach, PAPER.white, PAPER.lavender];

  for (let i = 0; i < 10; i++) {
    const x = rng() * width;
    const y = height * (0.08 + rng() * 0.55);
    const size = 4 + rng() * 6;
    const color = colors[Math.floor(rng() * colors.length)];

    const gfx = scene.add.graphics().setDepth(depth);
    drawShadowedBlob(gfx, 0, 0, size, size * 1.4, color, {
      seed: 900 + i * 7, wobble: 0.1, shadowDy: 2, shadowAlpha: 0.12,
    });
    gfx.setPosition(x, y);
    gfx.setRotation(rng() * Math.PI * 2);

    scene.tweens.add({
      targets: gfx,
      x: x + (rng() - 0.5) * 70,
      y: y + 35 + rng() * 50,
      rotation: gfx.rotation + (rng() - 0.5) * 2.5,
      duration: 5000 + rng() * 4000,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
      delay: rng() * 3000,
    });
  }
}

// ================================================================
// SCATTER DECOR (backward compat)
// ================================================================

export function scatterPapercutDecor(scene, gameW, gameH, opts = {}) {
  const seed = opts.seed ?? 1;
  const theme = opts.theme ?? 'garden';
  const rng = makeRng(seed);
  const ex = opts.excludeRect;

  const isInExcluded = (x, y) => {
    if (!ex) return false;
    return Math.abs(x - ex.x) < ex.w / 2 && Math.abs(y - ex.y) < ex.h / 2;
  };

  // Clouds
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (gameW / 4) + (rng() - 0.5) * 100;
    const y = 30 + rng() * 30;
    if (isInExcluded(x, y)) continue;
    const gfx = scene.add.graphics();
    drawShadowedBlob(gfx, x, y, 40 + rng() * 25, 12 + rng() * 5, PAPER.white, {
      seed: seed + i * 17, wobble: 0.14, shadowDy: 3, shadowAlpha: 0.1,
    });
  }

  if (theme === 'garden') {
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * (gameW / 9) + (rng() - 0.5) * 30;
      const y = gameH - 60 - rng() * 40;
      if (isInExcluded(x, y)) continue;
      const gfx = scene.add.graphics();
      drawPapercutFlower(gfx, x, y, 12 + rng() * 6, {
        seed: seed + i * 11,
        color: [PAPER.coral, PAPER.rose, PAPER.peach, PAPER.lavender][Math.floor(rng() * 4)],
        center: PAPER.gold,
        stem: 6 + rng() * 4, stemColor: PAPER.leaf,
      });
    }
    const corners = [
      { x: gameW * 0.10, y: gameH * 0.55 },
      { x: gameW * 0.90, y: gameH * 0.55 },
      { x: gameW * 0.15, y: gameH * 0.78 },
    ];
    for (const c of corners) {
      if (isInExcluded(c.x, c.y)) continue;
      const gfx = scene.add.graphics();
      drawButterfly(gfx, c.x + (rng() - 0.5) * 40, c.y + (rng() - 0.5) * 40,
        16 + rng() * 6, { seed: seed + c.x, color: PAPER.white });
    }
  }

  if (theme === 'night') {
    for (let i = 0; i < 12; i++) {
      const x = rng() * gameW;
      const y = rng() * (gameH * 0.5);
      if (isInExcluded(x, y)) continue;
      const gfx = scene.add.graphics();
      gfx.fillStyle(PAPER.cream, 0.7);
      gfx.fillCircle(x, y, 2 + rng() * 2);
      gfx.fillStyle(PAPER.cream, 0.2);
      gfx.fillCircle(x, y, 5 + rng() * 4);
    }
  }
}
