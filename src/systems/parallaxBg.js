/**
 * Parallax background system for battle scenes
 *
 * Creates multi-layer diorama backgrounds with actual depth.
 * Each layer is a separate Phaser Graphics object that can shift
 * independently during camera shakes, creating a convincing
 * parallax depth illusion on the 1440×1080 canvas.
 *
 * Key improvements over the flat papercut.js backgrounds:
 *   - 6-7 separate layers with independent parallax factors
 *   - Perspective ground plane (trapezoid, wider at bottom)
 *   - Floor-specific atmospheric particles (leaves, bubbles, embers, snow)
 *   - Foreground depth framing (grass, coral, crystals at edges)
 *   - Light source with adjustable glow intensity
 *   - 2-3 scene variants per floor tied to maze tile types
 */

import { makeRng } from './rng.js';
import { FLOOR_PALETTES } from './papercut.js';

function blendColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16)
       | (Math.round(g1 + (g2 - g1) * t) << 8)
       |  Math.round(b1 + (b2 - b1) * t);
}

// Layer depth configuration
// parallax: 0.0 = static (sky), 1.0 = moves with camera (foreground)
const LAYER_CONFIG = [
  { name: 'sky',        depth: -10, parallax: 0.0  },
  { name: 'glow',       depth: -9,  parallax: 0.03 },
  { name: 'farHills',   depth: -8,  parallax: 0.12 },
  { name: 'midHills',   depth: -7,  parallax: 0.25 },
  { name: 'nearHills',  depth: -6,  parallax: 0.45 },
  { name: 'ground',     depth: -5,  parallax: 0.65 },
  { name: 'foreground', depth: -4,  parallax: 0.90 },
];

// Variant-specific scene seeds per floor
const VARIANT_SEEDS = {
  1: [1001, 1201, 1401],
  2: [2001, 2201, 2401],
  3: [3001, 3201, 3401],
  4: [4001, 4201, 4401],
  5: [5001, 5201, 5401],
  6: [6001, 6201, 6401],
  7: [7001, 7201, 7401],
  8: [8001, 8201, 8401],
  9: [9001, 9201, 9401],
};

function generateHillPoints(startX, endX, baseY, peakHeight, peakCount, rng, wobble = 4) {
  const pts = [];
  const totalSteps = peakCount * 8;
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

function generateWavePoints(startX, endX, baseY, waveHeight, waveCycles, rng, wobble = 3) {
  const pts = [];
  const totalSteps = waveCycles * 12;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    const y = baseY
      - Math.sin(t * Math.PI * 2 * waveCycles) * waveHeight * (0.5 + rng() * 0.3)
      - Math.sin(t * Math.PI * 2 * waveCycles * 1.7 + 0.8) * waveHeight * 0.25
      + (rng() - 0.5) * wobble;
    pts.push({ x, y });
  }
  return pts;
}

function generateVolcanicPeakPoints(startX, endX, baseY, peakHeight, peakCount, rng, wobble = 2) {
  const pts = [];
  const totalSteps = peakCount * 6;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    const phase = (t * peakCount) % 1;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const y = baseY
      - tri * peakHeight * (0.7 + rng() * 0.5)
      - Math.max(0, Math.sin(t * Math.PI * peakCount * 3 + 0.5)) * peakHeight * 0.15
      + (rng() - 0.5) * wobble;
    pts.push({ x, y });
  }
  return pts;
}

function generateCloudPlatformPoints(startX, endX, baseY, height, bumpCount, rng) {
  const pts = [];
  const totalSteps = bumpCount * 6;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    const bump = Math.abs(Math.sin(t * Math.PI * bumpCount));
    const y = baseY - bump * height * (0.6 + rng() * 0.4)
      - Math.abs(Math.sin(t * Math.PI * bumpCount * 2.1 + 1.2)) * height * 0.2
      + (rng() - 0.5) * 2;
    pts.push({ x, y });
  }
  return pts;
}

function generateCrystalPoints(startX, endX, baseY, height, crystalCount, rng) {
  const pts = [];
  const segW = (endX - startX) / crystalCount;
  for (let c = 0; c < crystalCount; c++) {
    const cx = startX + (c + 0.5) * segW;
    const w = segW * (0.3 + rng() * 0.3);
    const h = height * (0.5 + rng() * 0.6);
    pts.push({ x: cx - w, y: baseY });
    pts.push({ x: cx - w * 0.3, y: baseY - h * 0.6 });
    pts.push({ x: cx + (rng() - 0.5) * w * 0.2, y: baseY - h });
    pts.push({ x: cx + w * 0.3, y: baseY - h * 0.6 });
    pts.push({ x: cx + w, y: baseY });
  }
  return pts;
}

function fillShape(gfx, points, color, alpha = 1, closeBottom = false, bottomY = 0) {
  gfx.fillStyle(color, alpha);
  gfx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) gfx.moveTo(points[i].x, points[i].y);
    else gfx.lineTo(points[i].x, points[i].y);
  }
  if (closeBottom) {
    gfx.lineTo(points[points.length - 1].x, bottomY);
    gfx.lineTo(points[0].x, bottomY);
  }
  gfx.closePath();
  gfx.fillPath();
}

/**
 * Draw a puffy cloud as a cluster of overlapping circles.
 * Adapted from papercut.js drawCloud pattern.
 */
function drawParallaxCloud(gfx, cx, cy, w, h, color, alpha, rng) {
  const bumpCount = 3 + Math.floor(rng() * 3); // 3-5 circles
  for (let i = 0; i < bumpCount; i++) {
    const bx = cx + (i / bumpCount - 0.5) * w;
    const by = cy + (rng() - 0.5) * h * 0.3;
    const br = (w / bumpCount) * (0.5 + rng() * 0.4);
    gfx.fillStyle(color, alpha * (0.7 + rng() * 0.3)); // vary per bump
    gfx.fillCircle(bx, by, br);
  }
}

function drawShadowedLayer(gfx, points, color, shadowColor, closeBottom, bottomY, rng, treeScale = 1.0) {
  // Paper-cutout shadow
  if (shadowColor) {
    const off = 10 + treeScale * 3;
    const shadow = points.map(p => ({ x: p.x + off, y: p.y + off }));
    fillShape(gfx, shadow, shadowColor, 0.70, closeBottom, bottomY + off);
  }

  // Main fill
  fillShape(gfx, points, color, 1, closeBottom, bottomY);

  // Gradient depth — darken the lower half for volume
  if (closeBottom && points.length > 2) {
    const minY = Math.min(...points.map(p => p.y));
    const totalH = bottomY - minY;
    const gradientTop = minY + totalH * 0.4;
    const stripH = (bottomY - gradientTop) / 5;
    const leftX = points[0].x;
    const rightX = points[points.length - 1].x;
    for (let s = 0; s < 5; s++) {
      gfx.fillStyle(0x000000, 0.03 + 0.04 * (s + 1));
      gfx.fillRect(leftX, gradientTop + s * stripH, rightX - leftX, stripH);
    }
  }

  // Bright edge highlight along the ridge
  if (points.length > 3) {
    gfx.lineStyle(1.5 + treeScale, 0xffffff, 0.20 + treeScale * 0.05);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();
  }

  // Trees/foliage along the ridgeline — scaled by distance
  if (rng && points.length > 4) {
    const treeCount = Math.floor(10 + treeScale * 8);
    const step = Math.max(1, Math.floor(points.length / treeCount));
    for (let i = 1; i < points.length - 1; i += step) {
      if (rng() < 0.2) continue;
      const pt = points[i];
      const h = (18 + rng() * 28) * treeScale;
      const w = (8 + rng() * 12) * treeScale;
      const darkC = shadowColor || 0x000000;
      const alpha = 0.50 + rng() * 0.25;

      if (rng() > 0.4) {
        // Round deciduous tree
        gfx.fillStyle(darkC, alpha * 0.8);
        gfx.fillRect(pt.x - treeScale, pt.y - h * 0.4, treeScale * 2, h * 0.4);
        gfx.fillStyle(darkC, alpha);
        gfx.fillCircle(pt.x, pt.y - h * 0.55, w * 0.5);
        gfx.fillCircle(pt.x - w * 0.25, pt.y - h * 0.4, w * 0.4);
        gfx.fillCircle(pt.x + w * 0.25, pt.y - h * 0.4, w * 0.4);
      } else {
        // Conifer / pine tree
        gfx.fillStyle(darkC, alpha * 0.8);
        gfx.fillRect(pt.x - treeScale * 0.5, pt.y - h * 0.3, treeScale, h * 0.35);
        gfx.fillStyle(darkC, alpha);
        for (let tier = 0; tier < 3; tier++) {
          const ty = pt.y - h * (0.3 + tier * 0.22);
          const tw = w * (0.6 - tier * 0.12);
          gfx.beginPath();
          gfx.moveTo(pt.x - tw, ty);
          gfx.lineTo(pt.x, ty - h * 0.22);
          gfx.lineTo(pt.x + tw, ty);
          gfx.closePath();
          gfx.fillPath();
        }
      }
    }
  }
}

function getFloorHillGen(floorId) {
  if (floorId === 2) return generateWavePoints;
  if (floorId === 3) return generateCloudPlatformPoints;
  if (floorId === 4) return generateVolcanicPeakPoints;
  if (floorId >= 5 && floorId <= 6) return generateCrystalPoints;
  return generateHillPoints;
}

/**
 * Create a parallax background for a battle scene.
 *
 * @param {Phaser.Scene} scene
 * @param {number} floorId - 1-9
 * @param {number} variant - 0-2 (scene variant)
 * @param {number} width
 * @param {number} height
 * @returns {ParallaxState}
 */
export function createParallaxBackground(scene, floorId, variant, width, height) {
  const pal = FLOOR_PALETTES[floorId] || FLOOR_PALETTES[1];
  const seeds = VARIANT_SEEDS[floorId] || VARIANT_SEEDS[1];
  const seed = seeds[variant] || seeds[0];
  const rng = makeRng(seed);

  const layers = [];

  // --- Layer 0: Sky + Clouds ---
  const sky = scene.add.graphics();
  sky.fillStyle(pal.sky, 1);
  sky.fillRect(-40, -40, width + 80, height + 80);

  // 5. Clouds in the top 20% of the screen
  const cloudColor = pal.cloud || pal.skyGlow;
  const cloudCount = 4 + Math.floor(rng() * 3);
  for (let ci = 0; ci < cloudCount; ci++) {
    const cx = width * (0.05 + rng() * 0.90);
    const cy = height * (0.04 + rng() * 0.18);
    const cw = 80 + rng() * 120;
    const ch = 18 + rng() * 14;
    const cAlpha = 0.30 + rng() * 0.20;
    drawParallaxCloud(sky, cx, cy, cw, ch, cloudColor, cAlpha, rng);
  }

  sky.setDepth(LAYER_CONFIG[0].depth);
  layers.push({ gfx: sky, baseX: 0, baseY: 0, ...LAYER_CONFIG[0] });

  // --- Layer 1: Glow / Celestial body ---
  const glow = scene.add.graphics();
  const glowCx = width * (0.45 + variant * 0.1);
  const glowCy = height * 0.30;
  const glowR = Math.min(width, height) * 0.65;

  for (let ring = 10; ring >= 1; ring--) {
    const r = glowR * (ring / 10);
    const alpha = pal.glowAlpha * (1 - ring / 12) * 0.8;
    glow.fillStyle(pal.skyGlow, alpha);
    glow.fillCircle(glowCx, glowCy, r);
  }
  glow.fillStyle(pal.glow, pal.glowAlpha * 0.7);
  glow.fillCircle(glowCx, glowCy, glowR * 0.15);
  glow.fillStyle(pal.glow, pal.glowAlpha * 0.4);
  glow.fillCircle(glowCx, glowCy, glowR * 0.30);
  glow.setDepth(LAYER_CONFIG[1].depth);
  layers.push({ gfx: glow, baseX: 0, baseY: 0, ...LAYER_CONFIG[1], glowCx, glowCy });

  // --- Layers 2-4: Hills (far, mid, near) ---
  const hillGen = getFloorHillGen(floorId);
  const hillLayers = pal.layers.slice(0, 3);
  for (let li = 0; li < hillLayers.length; li++) {
    const layerDef = hillLayers[li];
    const layerIdx = li + 2; // maps to farHills, midHills, nearHills
    const config = LAYER_CONFIG[layerIdx];
    const hillGfx = scene.add.graphics();

    const baseY = height * (0.25 + li * 0.10);
    const peakH = height * layerDef.peakH * (1.1 + li * 0.1);
    let pts;

    if (floorId === 3) {
      pts = generateCloudPlatformPoints(-40, width + 40, baseY, peakH, layerDef.peaks + 1, rng);
    } else if (floorId === 5 || floorId === 6) {
      pts = generateCrystalPoints(-40, width + 40, baseY, peakH, layerDef.peaks + 2, rng);
    } else {
      pts = hillGen(-40, width + 40, baseY, peakH, layerDef.peaks, rng, 3 + li * 2);
    }

    const atmosphericHaze = [0.40, 0.18, 0.0];
    const treeScaleByLayer = [0.5, 1.0, 1.8];
    const layerColor = blendColor(layerDef.color, pal.sky, atmosphericHaze[li]);
    const layerShadow = blendColor(layerDef.shadow, pal.sky, atmosphericHaze[li] * 0.6);
    drawShadowedLayer(hillGfx, pts, layerColor, layerShadow, true, height, rng, treeScaleByLayer[li]);

    // Variant-specific detail on near hills
    if (li === hillLayers.length - 1 && variant > 0) {
      const detailColor = pal.accent;
      for (let d = 0; d < 5 + variant * 3; d++) {
        const dx = rng() * width;
        const matchPt = pts[Math.floor(rng() * pts.length)];
        hillGfx.fillStyle(detailColor, 0.4 + rng() * 0.3);
        hillGfx.fillCircle(dx, matchPt ? matchPt.y + 5 : baseY + 5, 3 + rng() * 5);
      }
    }

    hillGfx.setDepth(config.depth);
    layers.push({ gfx: hillGfx, baseX: 0, baseY: 0, ...config });
  }

  // --- Layer 5: Ground plane (perspective trapezoid) ---
  const ground = scene.add.graphics();
  const groundY = height * 0.565;
  const perspectiveExpand = 60;

  // Base: warm brown earth (not green like the hills)
  const earthColor = blendColor(pal.ground, 0x806830, 0.55);
  const earthDark = blendColor(earthColor, 0x000000, 0.15);

  ground.fillStyle(earthColor, 1);
  ground.beginPath();
  ground.moveTo(-20, groundY);
  ground.lineTo(width + 20, groundY);
  ground.lineTo(width + 20 + perspectiveExpand, height + 40);
  ground.lineTo(-20 - perspectiveExpand, height + 40);
  ground.closePath();
  ground.fillPath();

  // Perspective gradient
  {
    const groundH = (height + 40) - groundY;
    for (let s = 0; s < 5; s++) {
      const t = (s + 1) / 5;
      ground.fillStyle(0x000000, 0.06 * t);
      ground.fillRect(-80, groundY + s * groundH / 5, width + 160, groundH / 5);
    }
  }

  // Dirt path across center where characters stand
  {
    const pathY = groundY + 5;
    const pathH = 50;
    ground.fillStyle(blendColor(earthColor, 0xc0a870, 0.35), 0.7);
    ground.beginPath();
    ground.moveTo(width * 0.02, pathY + pathH);
    ground.lineTo(width * 0.05, pathY);
    ground.lineTo(width * 0.95, pathY);
    ground.lineTo(width * 0.98, pathY + pathH);
    ground.closePath();
    ground.fillPath();
    // Lighter center stripe
    ground.fillStyle(blendColor(earthColor, 0xd8c890, 0.3), 0.4);
    ground.fillRect(width * 0.1, pathY + 8, width * 0.8, pathH - 20);
  }

  // Green grass patches on the brown earth
  for (let gp = 0; gp < 14 + Math.floor(rng() * 6); gp++) {
    const gpx = rng() * width;
    const gpy = groundY + 20 + rng() * (height * 0.3);
    const gpw = 35 + rng() * 55;
    const gph = 10 + rng() * 14;
    ground.fillStyle(pal.ground, 0.35 + rng() * 0.25);
    ground.fillEllipse(gpx, gpy, gpw, gph);
  }

  // Scattered rocks
  for (let ri = 0; ri < 6 + Math.floor(rng() * 4); ri++) {
    const rx = rng() * width;
    const ry = groundY + 15 + rng() * 80;
    const rs = 8 + rng() * 14;
    ground.fillStyle(blendColor(earthDark, 0x908070, 0.4), 0.5 + rng() * 0.2);
    ground.fillEllipse(rx, ry, rs, rs * 0.65);
    ground.fillStyle(0xffffff, 0.08);
    ground.fillEllipse(rx - rs * 0.15, ry - rs * 0.1, rs * 0.5, rs * 0.35);
  }

  // Grass tufts along the ground's front edge
  {
    const grassColor = pal.trees || 0x306020;
    const grassCount = 25 + Math.floor(rng() * 10);
    for (let gi = 0; gi < grassCount; gi++) {
      const gx = rng() * width;
      const grassH = 14 + rng() * 16;
      ground.fillStyle(grassColor, 0.35 + rng() * 0.2);
      const blades = 2 + Math.floor(rng() * 2);
      for (let b = 0; b < blades; b++) {
        const bx = gx + (rng() - 0.5) * 8;
        const lean = (rng() - 0.5) * 6;
        ground.beginPath();
        ground.moveTo(bx - 1.5, groundY);
        ground.lineTo(bx + lean, groundY - grassH * (0.7 + rng() * 0.3));
        ground.lineTo(bx + 1.5, groundY);
        ground.closePath();
        ground.fillPath();
      }
    }
  }

  ground.setDepth(LAYER_CONFIG[5].depth);
  layers.push({ gfx: ground, baseX: 0, baseY: 0, ...LAYER_CONFIG[5], groundY });

  // --- Layer 6: Foreground framing — rich organic elements at edges ---
  const fg = scene.add.graphics();

  if (floorId === 1) {
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -40 : width - 110;
      const spread = 150;
      // Large bush silhouettes
      for (let b = 0; b < 4; b++) {
        const bx = baseX + rng() * spread;
        const by = groundY + 30 + rng() * 120;
        const bw = 50 + rng() * 60;
        const bh = 40 + rng() * 60;
        fg.fillStyle(pal.trees, 0.60 + rng() * 0.25);
        fg.fillEllipse(bx, by, bw, bh);
        fg.fillStyle(pal.treesL || pal.trees, 0.25 + rng() * 0.15);
        fg.fillEllipse(bx - bw * 0.1, by - bh * 0.15, bw * 0.6, bh * 0.6);
      }
      // Tall grass/leaf fronds
      for (let g = 0; g < 12; g++) {
        const gx = baseX + rng() * spread;
        const gy = groundY - 10 + rng() * 60;
        const gh = 35 + rng() * 50;
        fg.fillStyle(pal.trees, 0.45 + rng() * 0.25);
        fg.beginPath();
        fg.moveTo(gx - 5, gy + gh);
        fg.lineTo(gx + (rng() - 0.5) * 10, gy);
        fg.lineTo(gx + 5, gy + gh);
        fg.closePath();
        fg.fillPath();
      }
      // Accent flowers
      for (let f = 0; f < 5; f++) {
        const fx = baseX + 30 + rng() * (spread - 60);
        const fy = groundY + rng() * 80;
        fg.fillStyle(pal.accent, 0.55 + rng() * 0.3);
        fg.fillCircle(fx, fy, 6 + rng() * 6);
        fg.fillStyle(0xf0e060, 0.5);
        fg.fillCircle(fx, fy, 3);
      }
    }
  } else if (floorId === 2) {
    // Tidepool: coral branches, seaweed fronds, sea foam at bottom
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 60;
      // Branching coral structures
      for (let c = 0; c < 6; c++) {
        const cx = baseX + rng() * 70;
        const cy = height - 40 - rng() * 100;
        const coralH = 20 + rng() * 35;
        fg.fillStyle(pal.accent, 0.35 + rng() * 0.25);
        fg.fillCircle(cx, cy, 5 + rng() * 6);
        fg.fillCircle(cx + rng() * 12 - 6, cy - coralH * 0.4, 4 + rng() * 4);
        fg.fillCircle(cx + rng() * 8 - 4, cy - coralH * 0.7, 3 + rng() * 3);
        // Stem
        fg.lineStyle(2, pal.accent, 0.25);
        fg.beginPath(); fg.moveTo(cx, cy + 5); fg.lineTo(cx, cy - coralH); fg.strokePath();
      }
      // Seaweed fronds (wavy lines)
      for (let sw = 0; sw < 3; sw++) {
        const sx = baseX + 10 + rng() * 50;
        fg.lineStyle(2, 0x48a838, 0.25);
        fg.beginPath();
        fg.moveTo(sx, height);
        for (let seg = 0; seg < 5; seg++) {
          fg.lineTo(sx + Math.sin(seg * 1.2) * 8, height - (seg + 1) * 20);
        }
        fg.strokePath();
      }
    }
    // Sea foam along bottom
    for (let foam = 0; foam < 20; foam++) {
      fg.fillStyle(0xe0f0f8, 0.15 + rng() * 0.15);
      fg.fillCircle(rng() * width, height - 10 - rng() * 20, 4 + rng() * 6);
    }
  } else if (floorId === 3) {
    // Cloud: wispy cloud tendrils at edges, golden light rays from top
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -20 : width - 30;
      for (let c = 0; c < 5; c++) {
        const cx = baseX + rng() * 50;
        const cy = rng() * height * 0.6;
        fg.fillStyle(0xffffff, 0.08 + rng() * 0.08);
        fg.fillCircle(cx, cy, 12 + rng() * 20);
        fg.fillCircle(cx + rng() * 15, cy + rng() * 10, 8 + rng() * 12);
      }
    }
    // Golden light rays from top-center
    for (let ray = 0; ray < 5; ray++) {
      const rx = width * 0.3 + rng() * width * 0.4;
      fg.fillStyle(pal.glow, 0.04 + rng() * 0.03);
      fg.fillTriangle(rx - 3, 0, rx + 3, 0, rx + (rng() - 0.5) * 60, height * 0.7);
    }
  } else if (floorId === 4) {
    // Ember: stalactites at top, lava glow at bottom, rock formations at sides
    for (let s = 0; s < 8; s++) {
      const sx = (s < 4 ? rng() * width * 0.3 : width * 0.7 + rng() * width * 0.3);
      const sh = 25 + rng() * 60;
      const sw = 4 + rng() * 8;
      fg.fillStyle(0x2a1808, 0.5 + rng() * 0.2);
      fg.fillTriangle(sx - sw, 0, sx + sw, 0, sx + (rng() - 0.5) * 4, sh);
      // Drip detail
      fg.fillStyle(0x3a2010, 0.3);
      fg.fillCircle(sx, sh + 2, 2);
    }
    // Lava glow gradient at bottom
    for (let lg = 0; lg < 4; lg++) {
      const ga = 0.12 * (1 - lg / 4);
      fg.fillStyle(0xe04010, ga);
      fg.fillRect(-20, height - 15 - lg * 12, width + 40, 15);
    }
    // Rock formations at sides
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 30;
      for (let r = 0; r < 4; r++) {
        const rx = baseX + rng() * 40;
        const ry = height - 30 - rng() * 80;
        const rw = 8 + rng() * 12;
        const rh = 15 + rng() * 25;
        fg.fillStyle(0x3a2010, 0.4 + rng() * 0.2);
        fg.fillTriangle(rx - rw / 2, ry + rh, rx + rw / 2, ry + rh, rx + (rng() - 0.5) * 5, ry);
      }
    }
  } else if (floorId === 5) {
    // Frozen: icicle fringe at top, crystal clusters at sides, frost edge
    // Icicle fringe along top edge
    for (let ic = 0; ic < 12; ic++) {
      const ix = (ic < 5 ? rng() * width * 0.25 : ic < 8 ? width * 0.75 + rng() * width * 0.25 : rng() * width);
      const ih = 15 + rng() * 40;
      const iw = 3 + rng() * 5;
      fg.fillStyle(0xc0e0f0, 0.35 + rng() * 0.2);
      fg.fillTriangle(ix - iw, 0, ix + iw, 0, ix + (rng() - 0.5) * 3, ih);
      fg.fillStyle(0xffffff, 0.15);
      fg.fillTriangle(ix - iw * 0.5, 0, ix, 0, ix + (rng() - 0.5) * 2, ih * 0.7);
    }
    // Crystal clusters at bottom sides
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 40;
      for (let c = 0; c < 5; c++) {
        const cx = baseX + rng() * 50;
        const cy = height - 20 - rng() * 100;
        const ch = 12 + rng() * 25;
        fg.fillStyle(0xc0e0f0, 0.25 + rng() * 0.2);
        fg.fillTriangle(cx - 4, cy + ch, cx + 4, cy + ch, cx + (rng() - 0.5) * 3, cy);
        fg.fillStyle(0xffffff, 0.1);
        fg.fillTriangle(cx - 2, cy + ch, cx + 1, cy + ch, cx, cy + ch * 0.3);
      }
    }
    // Frost edge glow at bottom
    fg.fillStyle(0xc0e0f0, 0.08);
    fg.fillRect(-20, height - 30, width + 40, 35);
  } else {
    // Floors 6-9: generic mystical framing
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 40;
      for (let d = 0; d < 6; d++) {
        const dx = baseX + rng() * 50;
        const dy = rng() * height * 0.8;
        fg.fillStyle(pal.accent, 0.15 + rng() * 0.15);
        fg.fillCircle(dx, dy, 4 + rng() * 8);
      }
    }
  }

  fg.setDepth(LAYER_CONFIG[6].depth);
  layers.push({ gfx: fg, baseX: 0, baseY: 0, ...LAYER_CONFIG[6] });

  return {
    layers,
    floorId,
    variant,
    width,
    height,
    groundY,
    pal,
    atmosphericParticles: [],
    _particleTimer: null,
  };
}

/**
 * Shift parallax layers based on camera shake offset.
 * Call this in the scene's update loop.
 *
 * @param {ParallaxState} state
 * @param {number} shakeX - Camera shake X offset
 * @param {number} shakeY - Camera shake Y offset
 */
export function shiftParallaxLayers(state, shakeX, shakeY) {
  for (const layer of state.layers) {
    if (layer.parallax > 0) {
      layer.gfx.x = layer.baseX + shakeX * layer.parallax;
      layer.gfx.y = layer.baseY + shakeY * layer.parallax;
    }
  }
}

/**
 * Start atmospheric particles for the floor.
 * Creates a recurring timer that spawns themed particles.
 *
 * @param {Phaser.Scene} scene
 * @param {ParallaxState} state
 */
export function startAtmosphericParticles(scene, state) {
  const floorId = state.floorId;
  const maxParticles = 12;

  const config = getParticleConfig(floorId, state.width, state.groundY);
  if (!config) return;

  state._particleTimer = scene.time.addEvent({
    delay: config.spawnDelay,
    loop: true,
    callback: () => {
      if (state.atmosphericParticles.length >= maxParticles) return;
      const p = config.spawn(scene, state);
      state.atmosphericParticles.push(p);
    },
  });
}

function getParticleConfig(floorId, width, groundY) {
  if (floorId === 1) {
    return {
      spawnDelay: 900,
      spawn: (scene, state) => {
        const x = Math.random() * width;
        const y = -10;
        const colors = [0x68c050, 0x48a040, 0xf0c040];
        const leaf = scene.add.circle(x, y, 3 + Math.random() * 3, colors[Math.floor(Math.random() * 3)], 0.6);
        leaf.setDepth(-3);
        scene.tweens.add({
          targets: leaf,
          x: x + (Math.random() - 0.5) * 120,
          y: groundY + Math.random() * 40,
          rotation: Math.random() * 4,
          alpha: 0,
          duration: 3000 + Math.random() * 2000,
          ease: 'Sine.inOut',
          onComplete: () => {
            leaf.destroy();
            const idx = state.atmosphericParticles.indexOf(leaf);
            if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
          },
        });
        return leaf;
      },
    };
  }
  if (floorId === 2) {
    return {
      spawnDelay: 700,
      spawn: (scene, state) => {
        const x = Math.random() * width;
        const y = groundY + 20;
        const bubble = scene.add.circle(x, y, 2 + Math.random() * 3, 0x88d8f8, 0.5);
        bubble.setDepth(-3);
        scene.tweens.add({
          targets: bubble,
          x: x + (Math.random() - 0.5) * 30,
          y: groundY * 0.3 + Math.random() * groundY * 0.3,
          alpha: 0,
          scale: 0.3,
          duration: 2500 + Math.random() * 1500,
          ease: 'Sine.out',
          onComplete: () => {
            bubble.destroy();
            const idx = state.atmosphericParticles.indexOf(bubble);
            if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
          },
        });
        return bubble;
      },
    };
  }
  if (floorId === 3) {
    return {
      spawnDelay: 1400,
      spawn: (scene, state) => {
        const x = -30;
        const y = Math.random() * groundY * 0.6;
        const wisp = scene.add.circle(x, y, 8 + Math.random() * 12, 0xffffff, 0.2);
        wisp.setDepth(-3);
        scene.tweens.add({
          targets: wisp,
          x: width + 40,
          y: y + (Math.random() - 0.5) * 40,
          alpha: 0,
          duration: 5000 + Math.random() * 3000,
          ease: 'Linear',
          onComplete: () => {
            wisp.destroy();
            const idx = state.atmosphericParticles.indexOf(wisp);
            if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
          },
        });
        return wisp;
      },
    };
  }
  if (floorId === 4) {
    return {
      spawnDelay: 500,
      spawn: (scene, state) => {
        const x = Math.random() * width;
        const y = groundY + 10;
        const colors = [0xff6020, 0xf0a020, 0xff4010];
        const ember = scene.add.circle(x, y, 2 + Math.random() * 2, colors[Math.floor(Math.random() * 3)], 0.7);
        ember.setDepth(-3);
        scene.tweens.add({
          targets: ember,
          x: x + (Math.random() - 0.5) * 60,
          y: Math.random() * groundY * 0.5,
          alpha: 0,
          scale: 0.2,
          duration: 2000 + Math.random() * 1500,
          ease: 'Cubic.out',
          onComplete: () => {
            ember.destroy();
            const idx = state.atmosphericParticles.indexOf(ember);
            if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
          },
        });
        return ember;
      },
    };
  }
  if (floorId === 5) {
    return {
      spawnDelay: 600,
      spawn: (scene, state) => {
        const x = Math.random() * width;
        const y = -10;
        const snow = scene.add.circle(x, y, 2 + Math.random() * 2, 0xffffff, 0.5);
        snow.setDepth(-3);
        scene.tweens.add({
          targets: snow,
          x: x + (Math.random() - 0.5) * 80,
          y: groundY + Math.random() * 20,
          alpha: 0,
          duration: 3500 + Math.random() * 2000,
          ease: 'Linear',
          onComplete: () => {
            snow.destroy();
            const idx = state.atmosphericParticles.indexOf(snow);
            if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
          },
        });
        return snow;
      },
    };
  }
  // Default: subtle sparkles for floors 6-9
  return {
    spawnDelay: 1000,
    spawn: (scene, state) => {
      const x = Math.random() * width;
      const y = Math.random() * groundY;
      const sparkle = scene.add.circle(x, y, 2, 0xffffff, 0.3);
      sparkle.setDepth(-3);
      scene.tweens.add({
        targets: sparkle,
        alpha: 0,
        scale: 0.1,
        duration: 1500 + Math.random() * 1000,
        ease: 'Cubic.out',
        onComplete: () => {
          sparkle.destroy();
          const idx = state.atmosphericParticles.indexOf(sparkle);
          if (idx >= 0) state.atmosphericParticles.splice(idx, 1);
        },
      });
      return sparkle;
    },
  };
}

/**
 * Clean up all parallax layers and particles.
 * @param {ParallaxState} state
 */
export function destroyParallaxBackground(state) {
  if (state._particleTimer) state._particleTimer.remove();
  for (const p of state.atmosphericParticles) {
    if (p && p.destroy) p.destroy();
  }
  state.atmosphericParticles = [];
  for (const layer of state.layers) {
    if (layer.gfx && layer.gfx.destroy) layer.gfx.destroy();
  }
  state.layers = [];
}
