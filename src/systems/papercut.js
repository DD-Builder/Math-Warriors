/**
 * Papercut rendering utilities
 *
 * Procedural generation of layered papercut diorama backgrounds using
 * only Phaser's Graphics API — no external images needed. Each layer
 * is a filled shape with:
 *   - Slightly irregular edges (wobble) to look hand-cut
 *   - A drop shadow rendered as a dark offset duplicate
 *   - Color that shifts with depth (lighter = farther back)
 *
 * Reference: DD-Builder's papercut reference board (see ART-STYLE.md)
 * Key visual elements:
 *   - 3-5 stacked hill/mountain layers
 *   - Central warm glow (moon/sun/lantern)
 *   - Small detail shapes (trees, flowers, clouds) on the foreground layers
 *   - Dark frame/vignette around the edges
 */

import { makeRng } from './rng.js';

/**
 * Generate a wobbly hill/mountain silhouette as an array of {x, y} points.
 * The shape spans from x=startX to x=endX, with peaks controlled by
 * peakCount, peakHeight, and baseY.
 */
function generateHillPoints(startX, endX, baseY, peakHeight, peakCount, rng, wobble = 4) {
  const pts = [];
  const segWidth = (endX - startX) / (peakCount * 8);
  const totalSteps = peakCount * 8;

  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    // Composite sine waves for organic-looking hills
    const y = baseY
      - Math.sin(t * Math.PI * peakCount) * peakHeight * (0.6 + rng() * 0.4)
      - Math.sin(t * Math.PI * peakCount * 2.3 + 1.7) * peakHeight * 0.3
      + (rng() - 0.5) * wobble;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Generate wave-shaped points for Tidepool (Floor 2).
 * Smooth sine curves instead of mountain peaks.
 */
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

/**
 * Generate puffy cloud platform points for Cloud (Floor 3).
 * Overlapping circles approximated as a bumpy top edge.
 */
function generateCloudPlatformPoints(startX, endX, baseY, height, bumpCount, rng) {
  const pts = [];
  const totalSteps = bumpCount * 6;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    // Cloud bumps: overlapping rounded humps
    const bump = Math.abs(Math.sin(t * Math.PI * bumpCount));
    const y = baseY - bump * height * (0.6 + rng() * 0.4)
      - Math.abs(Math.sin(t * Math.PI * bumpCount * 2.1 + 1.2)) * height * 0.2
      + (rng() - 0.5) * 2;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Generate jagged volcanic peak points for Ember (Floor 4).
 * Sharper, more angular peaks.
 */
function generateVolcanicPeakPoints(startX, endX, baseY, peakHeight, peakCount, rng, wobble = 2) {
  const pts = [];
  const totalSteps = peakCount * 6;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const x = startX + t * (endX - startX);
    // Triangle wave for jagged peaks
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

/**
 * Generate geometric crystal formation points for Arcane (Floor 5).
 * Pointed angular shapes.
 */
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

/**
 * Generate small tree silhouettes as triangle clusters.
 */
function generateTreePoints(baseX, baseY, height, rng) {
  const w = height * 0.4;
  return [
    { x: baseX, y: baseY },
    { x: baseX - w * (0.8 + rng() * 0.4), y: baseY - height * 0.5 },
    { x: baseX - w * 0.3, y: baseY - height * 0.55 },
    { x: baseX - w * (0.5 + rng() * 0.3), y: baseY - height * 0.85 },
    { x: baseX, y: baseY - height },
    { x: baseX + w * (0.5 + rng() * 0.3), y: baseY - height * 0.85 },
    { x: baseX + w * 0.3, y: baseY - height * 0.55 },
    { x: baseX + w * (0.8 + rng() * 0.4), y: baseY - height * 0.5 },
  ];
}

/**
 * Draw a filled shape from points onto a Graphics object, with a
 * drop shadow underneath for the paper depth effect.
 */
function drawPaperLayer(gfx, points, color, shadowColor, shadowOffsetX, shadowOffsetY, closeBottom, bottomY) {
  // Shadow first (behind the layer)
  if (shadowColor !== undefined) {
    gfx.fillStyle(shadowColor, 0.5);
    gfx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) gfx.moveTo(p.x + shadowOffsetX, p.y + shadowOffsetY);
      else gfx.lineTo(p.x + shadowOffsetX, p.y + shadowOffsetY);
    }
    if (closeBottom) {
      gfx.lineTo(points[points.length - 1].x + shadowOffsetX, bottomY + shadowOffsetY);
      gfx.lineTo(points[0].x + shadowOffsetX, bottomY + shadowOffsetY);
    }
    gfx.closePath();
    gfx.fillPath();
  }

  // Main layer
  gfx.fillStyle(color, 1);
  gfx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0) gfx.moveTo(p.x, p.y);
    else gfx.lineTo(p.x, p.y);
  }
  if (closeBottom) {
    gfx.lineTo(points[points.length - 1].x, bottomY);
    gfx.lineTo(points[0].x, bottomY);
  }
  gfx.closePath();
  gfx.fillPath();
}

/**
 * Draw a papercut cloud (bumpy ellipse cluster).
 */
function drawCloud(gfx, cx, cy, width, height, color, rng) {
  const bumps = 4 + Math.floor(rng() * 3);
  gfx.fillStyle(color, 0.85);
  for (let i = 0; i < bumps; i++) {
    const bx = cx + (i / bumps - 0.5) * width;
    const by = cy + (rng() - 0.5) * height * 0.3;
    const br = width / bumps * (0.5 + rng() * 0.3);
    gfx.fillCircle(bx, by, br);
  }
}

// ================================================================
// PALETTE PRESETS PER FLOOR
// ================================================================

// BRIGHT, CHEERFUL palettes — Mario-world happy vibes.
// Garden is sunny and warm. Tidepool is bright ocean blue.
// Cloud is airy sky blue. Ember is warm sunset. Mending is magical twilight.
// Title/menus use a special warm sunset palette.
export const FLOOR_PALETTES = {
  // Special "menu" palette — warm, inviting, used for title/grade/party screens
  menu: {
    sky:     0x90d0f8,
    skyGlow: 0xe8f4ff,
    layers: [
      { color: 0x58a848, shadow: 0x2c7828, peakH: 0.18, peaks: 3 },
      { color: 0x68c050, shadow: 0x388830, peakH: 0.22, peaks: 4 },
      { color: 0x78d858, shadow: 0x48a838, peakH: 0.16, peaks: 5 },
      { color: 0x88e860, shadow: 0x58b840, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x5caa40,
    trees:   0x388828,
    treesL:  0x50a838,
    accent:  0xf06888,
    cloud:   0xf0f8ff,
    glow:    0xfff0a0,
    glowAlpha: 0.5,
    fog:     0x1a3810,
  },
  1: { // Garden — bright sunny day, lush greens, warm light
    sky:     0x68b8e8,
    skyGlow: 0xc8e8f8,
    layers: [
      { color: 0x48a040, shadow: 0x287828, peakH: 0.18, peaks: 3 },
      { color: 0x58b848, shadow: 0x388830, peakH: 0.22, peaks: 4 },
      { color: 0x68c850, shadow: 0x48a838, peakH: 0.16, peaks: 5 },
      { color: 0x78d858, shadow: 0x58b840, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x58b040,
    trees:   0x388828,
    treesL:  0x50a838,
    accent:  0xf06888,  // pink flowers
    cloud:   0xf0f8ff,
    glow:    0xfff0a0,  // warm sun
    glowAlpha: 0.55,
    fog:     0x1a3810,
  },
  2: { // Tidepool — bright ocean, turquoise water, coral reefs
    sky:     0x2878c0,
    skyGlow: 0x58a8e0,
    layers: [
      { color: 0x1868a8, shadow: 0x0c4878, peakH: 0.14, peaks: 5 },
      { color: 0x2880c0, shadow: 0x186098, peakH: 0.20, peaks: 3 },
      { color: 0x3898d0, shadow: 0x2870a8, peakH: 0.16, peaks: 4 },
      { color: 0x48b0e0, shadow: 0x3888b8, peakH: 0.12, peaks: 3 },
    ],
    ground:  0x2070a0,
    trees:   0x186898,
    treesL:  0x2888b8,
    accent:  0xf0a848,  // coral orange
    cloud:   0xd0e8f8,
    glow:    0x88d8f8,
    glowAlpha: 0.45,
    fog:     0x0c2038,
  },
  3: { // Cloud — bright sky, fluffy white, golden sun
    sky:     0x88c8f8,
    skyGlow: 0xd8f0ff,
    layers: [
      { color: 0xa0d0f0, shadow: 0x78a8c8, peakH: 0.12, peaks: 4 },
      { color: 0xb0ddf8, shadow: 0x88b8d8, peakH: 0.18, peaks: 3 },
      { color: 0xc0e8ff, shadow: 0x98c8e0, peakH: 0.14, peaks: 5 },
      { color: 0xd0f0ff, shadow: 0xa8d8e8, peakH: 0.10, peaks: 3 },
    ],
    ground:  0xb8e0f0,
    trees:   0x88b8d8,
    treesL:  0xa8d0e8,
    accent:  0xffd040,  // golden stars
    cloud:   0xffffff,
    glow:    0xfff080,
    glowAlpha: 0.55,
    fog:     0x404858,
  },
  4: { // Ember — warm sunset, orange glow, wider contrast between layers
    sky:     0x4a1818,
    skyGlow: 0x883018,
    layers: [
      { color: 0x401008, shadow: 0x200804, peakH: 0.20, peaks: 4 },
      { color: 0x702010, shadow: 0x401008, peakH: 0.18, peaks: 3 },
      { color: 0xa84020, shadow: 0x602010, peakH: 0.14, peaks: 5 },
      { color: 0xd86830, shadow: 0x884018, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x6a2810,
    trees:   0x882818,
    treesL:  0xa83820,
    accent:  0xf0a020,  // embers
    cloud:   0x804020,
    glow:    0xff6820,
    glowAlpha: 0.55,
    fog:     0x2a0c04,
  },
  5: { // Frozen Peak — icy blue mountains
    sky:     0x88c8f0,
    skyGlow: 0xc0e0f8,
    layers: [
      { color: 0x5090b8, shadow: 0x386888, peakH: 0.16, peaks: 4 },
      { color: 0x60a0c8, shadow: 0x487898, peakH: 0.20, peaks: 3 },
      { color: 0x70b0d8, shadow: 0x5888a8, peakH: 0.14, peaks: 5 },
      { color: 0x80c0e0, shadow: 0x6898b8, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x90c8e0,
    trees:   0x5898b8,
    treesL:  0x70a8c8,
    accent:  0xd0f0ff,
    cloud:   0xf0f8ff,
    glow:    0xc0e8ff,
    glowAlpha: 0.45,
    fog:     0x182838,
  },
  6: { // Crystal Caverns — deep purple, prismatic
    sky:     0x281850,
    skyGlow: 0x483078,
    layers: [
      { color: 0x4030a0, shadow: 0x281870, peakH: 0.18, peaks: 4 },
      { color: 0x5040b0, shadow: 0x382880, peakH: 0.22, peaks: 3 },
      { color: 0x6050c0, shadow: 0x483890, peakH: 0.14, peaks: 5 },
      { color: 0x7060d0, shadow: 0x5848a0, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x4838a0,
    trees:   0x5840b0,
    treesL:  0x7060c0,
    accent:  0xd0a0ff,
    cloud:   0x584080,
    glow:    0xc098f0,
    glowAlpha: 0.5,
    fog:     0x1a0828,
  },
  7: { // Market Square — warm golden sunset
    sky:     0xd8a858,
    skyGlow: 0xf0c878,
    layers: [
      { color: 0x8a6020, shadow: 0x604010, peakH: 0.16, peaks: 4 },
      { color: 0x9a7030, shadow: 0x705020, peakH: 0.20, peaks: 3 },
      { color: 0xaa8040, shadow: 0x806030, peakH: 0.14, peaks: 5 },
      { color: 0xba9050, shadow: 0x907040, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x8a6828,
    trees:   0xa07830,
    treesL:  0xb88840,
    accent:  0xf0c040,
    cloud:   0xf8e8c0,
    glow:    0xf8d060,
    glowAlpha: 0.5,
    fog:     0x1a1408,
  },
  8: { // Infinity Library — dark amber, candlelit
    sky:     0x3a2010,
    skyGlow: 0x604020,
    layers: [
      { color: 0x3a2010, shadow: 0x201008, peakH: 0.18, peaks: 4 },
      { color: 0x4a3018, shadow: 0x301810, peakH: 0.22, peaks: 3 },
      { color: 0x5a4020, shadow: 0x402818, peakH: 0.14, peaks: 5 },
      { color: 0x6a5028, shadow: 0x503820, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x4a3018,
    trees:   0x5a4020,
    treesL:  0x6a5028,
    accent:  0xc8a050,
    cloud:   0x604830,
    glow:    0xd8a040,
    glowAlpha: 0.45,
    fog:     0x0a0810,
  },
  9: { // The Mending Room — vibrant magical twilight, deep purple + bright gold
    sky:     0x382060,
    skyGlow: 0x5840a0,
    layers: [
      { color: 0x3828a0, shadow: 0x181060, peakH: 0.16, peaks: 4 },
      { color: 0x4838c0, shadow: 0x282080, peakH: 0.22, peaks: 3 },
      { color: 0x6050d0, shadow: 0x383098, peakH: 0.14, peaks: 5 },
      { color: 0x7868e0, shadow: 0x4840b0, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x4030a0,
    trees:   0x5840c0,
    treesL:  0x7060d8,
    accent:  0xf0c0ff,
    cloud:   0x6850a0,
    glow:    0xe0a8ff,
    glowAlpha: 0.55,
    fog:     0x100818,
  },
};

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Draw a complete papercut diorama background onto the scene.
 *
 * @param {Phaser.Scene} scene - The Phaser scene to draw on
 * @param {number} floorId - Floor 1-5, selects the palette
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height (above the UI panel)
 * @param {number} [seed=42] - Deterministic seed for wobble
 * @returns {Phaser.GameObjects.Graphics} The graphics object (for depth sorting)
 */
export function drawPapercutBackground(scene, floorId, width, height, seed = 42) {
  const pal = FLOOR_PALETTES[floorId] || FLOOR_PALETTES[1];
  const rng = makeRng(seed + floorId * 1000);
  const gfx = scene.add.graphics();

  // Sky fill
  gfx.fillStyle(pal.sky, 1);
  gfx.fillRect(0, 0, width, height);

  // Central glow — radial gradient approximation with concentric circles
  const cx = width * 0.5;
  const cy = height * 0.35;
  const glowR = Math.min(width, height) * 0.7;
  // Floor 2 matte finish: reduce glow intensity by 0.5
  const effectiveGlowAlpha = floorId === 2 ? pal.glowAlpha * 0.5 : pal.glowAlpha;

  if (floorId === 4) {
    // Floor 4 pixel art: color banding — only 4 rings with hard alpha steps
    const bandAlphas = [0.3, 0.2, 0.1, 0.0];
    for (let ring = 3; ring >= 0; ring--) {
      const r = glowR * ((ring + 1) / 4);
      gfx.fillStyle(pal.skyGlow, bandAlphas[ring]);
      gfx.fillCircle(cx, cy, r);
    }
  } else {
    for (let ring = 8; ring >= 1; ring--) {
      const r = glowR * (ring / 8);
      const alpha = effectiveGlowAlpha * (1 - ring / 10) * 0.7;
      gfx.fillStyle(pal.skyGlow, alpha);
      gfx.fillCircle(cx, cy, r);
    }
  }
  // Hot center
  gfx.fillStyle(pal.glow, effectiveGlowAlpha * 0.6);
  gfx.fillCircle(cx, cy, glowR * 0.15);
  gfx.fillStyle(pal.glow, effectiveGlowAlpha * 0.3);
  gfx.fillCircle(cx, cy, glowR * 0.3);

  // Clouds (behind hills)
  for (let i = 0; i < 4; i++) {
    const cloudX = width * (0.1 + rng() * 0.8);
    const cloudY = height * (0.08 + rng() * 0.18);
    drawCloud(gfx, cloudX, cloudY, 60 + rng() * 60, 15 + rng() * 10, pal.cloud, rng);
  }

  // Hill layers (back to front) — floor-specific shapes
  const shadowOx = 3;
  const shadowOy = 6;
  for (let li = 0; li < pal.layers.length; li++) {
    const layer = pal.layers[li];
    const layerBaseY = height * (0.45 + li * 0.12);
    let pts;
    if (floorId === 2) {
      // Tidepool: wave shapes
      pts = generateWavePoints(
        -20, width + 20, layerBaseY,
        height * layer.peakH, layer.peaks,
        rng, 2 + li
      );
    } else if (floorId === 3) {
      // Cloud: puffy cloud platforms
      pts = generateCloudPlatformPoints(
        -20, width + 20, layerBaseY,
        height * layer.peakH, layer.peaks + 1,
        rng
      );
    } else if (floorId === 4) {
      // Ember: jagged volcanic peaks — hard edges (wobble=0) for pixel art feel
      pts = generateVolcanicPeakPoints(
        -20, width + 20, layerBaseY,
        height * layer.peakH, layer.peaks,
        rng, 0
      );
    } else if (floorId === 5) {
      // Arcane: geometric crystal formations
      pts = generateCrystalPoints(
        -20, width + 20, layerBaseY,
        height * layer.peakH, layer.peaks + 2,
        rng
      );
    } else {
      // Garden (default): smooth hills
      pts = generateHillPoints(
        -20, width + 20, layerBaseY,
        height * layer.peakH, layer.peaks,
        rng, 3 + li * 2
      );
    }
    // Floor 5 silhouette enhancement: darken foremost layer by multiplying color by 0.6
    const layerColor = (floorId === 5 && li === pal.layers.length - 1)
      ? (((((layer.color >> 16) & 0xff) * 0.6) << 16) |
         ((((layer.color >> 8) & 0xff) * 0.6) << 8) |
         (((layer.color & 0xff) * 0.6)))
      : layer.color;
    drawPaperLayer(gfx, pts, layerColor, layer.shadow, shadowOx, shadowOy, true, height);

    // Floor 2 claymation: fingerprint dents on each wave layer
    if (floorId === 2) {
      const dentCount = 5 + Math.floor(rng() * 6); // 5-10 dents
      for (let di = 0; di < dentCount; di++) {
        const dx = pts[0].x + rng() * (pts[pts.length - 1].x - pts[0].x);
        const dy = layerBaseY + rng() * (height - layerBaseY) * 0.3 + 5;
        const dr = 3 + rng() * 2; // 3-5px radius
        gfx.fillStyle(0x000000, 0.15);
        gfx.fillCircle(dx, dy, dr);
      }
      // Floor 2 claymation: clay edge texture — irregular dark stroke at top of wave
      const edgeColor = (((layer.color >> 16) & 0xff) * 0.7) << 16 |
                        (((layer.color >> 8) & 0xff) * 0.7) << 8 |
                        ((layer.color & 0xff) * 0.7);
      gfx.lineStyle(2, edgeColor, 0.6);
      gfx.beginPath();
      for (let ei = 0; ei < pts.length; ei++) {
        const wobbleX = (rng() - 0.5) * 2;
        const wobbleY = (rng() - 0.5) * 2;
        if (ei === 0) gfx.moveTo(pts[ei].x + wobbleX, pts[ei].y + wobbleY);
        else gfx.lineTo(pts[ei].x + wobbleX, pts[ei].y + wobbleY);
      }
      gfx.strokePath();
    }

    // Floor 3 watercolor/sketch: pencil outline stroke along each cloud/hill layer
    if (floorId === 3) {
      gfx.lineStyle(1.5, 0x404040, 0.25);
      gfx.beginPath();
      for (let pi = 0; pi < pts.length; pi++) {
        if (pi === 0) gfx.moveTo(pts[pi].x, pts[pi].y);
        else gfx.lineTo(pts[pi].x, pts[pi].y);
      }
      gfx.strokePath();
    }

    // Floor-specific layer effects
    if (floorId === 4 && li === pal.layers.length - 1) {
      // Ember: orange/red glow at base of foreground layer
      gfx.fillStyle(0xff6820, 0.12);
      gfx.fillRect(0, layerBaseY, width, height - layerBaseY);
    }
    if (floorId === 5) {
      // Arcane: purple glow at crystal tips
      for (let ci = 0; ci < pts.length; ci++) {
        if (ci > 0 && pts[ci].y < pts[ci - 1].y && (ci >= pts.length - 1 || pts[ci].y < pts[ci + 1].y)) {
          gfx.fillStyle(0xd098f8, 0.15 + rng() * 0.1);
          gfx.fillCircle(pts[ci].x, pts[ci].y, 8 + rng() * 6);
        }
      }
    }
  }

  // Floor 3 watercolor/sketch: watercolor washes — large semi-transparent pastel circles
  if (floorId === 3) {
    const washColors = [0xf0c0c0, 0xc0d8f0, 0xd0f0c0, 0xf0e0c0];
    for (let wi = 0; wi < 4; wi++) {
      const wx = rng() * width;
      const wy = rng() * height * 0.8;
      const wr = 80 + rng() * 70; // radius 80-150px
      const wa = 0.06 + rng() * 0.04; // alpha 0.06-0.1
      gfx.fillStyle(washColors[wi % washColors.length], wa);
      gfx.fillCircle(wx, wy, wr);
    }
    // Floor 3 watercolor/sketch: paper texture — faint warm cream overlay
    gfx.fillStyle(0xf8f0e0, 0.05);
    gfx.fillRect(0, 0, width, height);
  }

  // Floor 4 pixel art: grid overlay
  if (floorId === 4) {
    gfx.lineStyle(0.5, 0x000000, 0.06);
    // Vertical lines
    for (let gx = 0; gx < width; gx += 8) {
      gfx.beginPath();
      gfx.moveTo(gx, 0);
      gfx.lineTo(gx, height);
      gfx.strokePath();
    }
    // Horizontal lines
    for (let gy = 0; gy < height; gy += 8) {
      gfx.beginPath();
      gfx.moveTo(0, gy);
      gfx.lineTo(width, gy);
      gfx.strokePath();
    }
  }

  // Floor 5 cinematic: crescent moon
  if (floorId === 5) {
    const moonX = width * 0.7;
    const moonY = height * 0.12;
    const moonR = 40;
    // White moon circle
    gfx.fillStyle(0xffffff, 0.85);
    gfx.fillCircle(moonX, moonY, moonR);
    // Sky-colored circle overlapping to create crescent
    gfx.fillStyle(pal.sky, 1);
    gfx.fillCircle(moonX + moonR * 0.45, moonY - moonR * 0.15, moonR * 0.85);

    // Floor 5 cinematic: light rays from central glow
    const rayCx = width * 0.5;
    const rayCy = height * 0.35;
    const rayLen = height * 0.6;
    const rayCount = 5;
    for (let ri = 0; ri < rayCount; ri++) {
      const angle = -Math.PI * 0.4 + (ri / (rayCount - 1)) * Math.PI * 0.8;
      const tipX = rayCx + Math.sin(angle) * rayLen;
      const tipY = rayCy + Math.cos(angle) * rayLen;
      const halfW = 8 + rng() * 6;
      gfx.fillStyle(0xffffff, 0.05);
      gfx.fillTriangle(
        rayCx - Math.cos(angle) * halfW, rayCy + Math.sin(angle) * halfW,
        rayCx + Math.cos(angle) * halfW, rayCy - Math.sin(angle) * halfW,
        tipX, tipY
      );
    }
  }

  // Floor-specific foreground details
  if (floorId === 2) {
    // Tidepool: coral/reef shapes at ground level
    for (let ci = 0; ci < 8; ci++) {
      const cx = width * (0.05 + rng() * 0.9);
      const cy = height * (0.75 + rng() * 0.06);
      const cr = 4 + rng() * 8;
      const coralColors = [0xf07060, 0xf0a848, 0xe06888, 0xf08870];
      gfx.fillStyle(coralColors[Math.floor(rng() * coralColors.length)], 0.6 + rng() * 0.3);
      gfx.fillCircle(cx, cy, cr);
      if (rng() > 0.5) {
        gfx.fillCircle(cx + rng() * 6 - 3, cy - cr * 0.8, cr * 0.6);
      }
    }
  }

  // Ground plane — floor-specific
  const groundY = height * 0.82;

  if (floorId === 2) {
    // TIDEPOOL: water/beach ground instead of grass
    gfx.fillStyle(0x1878a0, 0.6);
    gfx.fillRect(0, groundY, width, height - groundY);
    // Sand strip at shore
    gfx.fillStyle(0xd0b880, 0.8);
    gfx.fillRect(0, groundY - 4, width, 12);
    // Wave foam line
    gfx.fillStyle(0xe0f0f8, 0.5);
    for (let wi = 0; wi < 20; wi++) { gfx.fillCircle(rng() * width, groundY + 2, 3 + rng() * 4); }
    // Seaweed / palm trees on edges
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const tx = side < 0 ? width * (0.03 + rng() * 0.15) : width * (0.82 + rng() * 0.15);
      // Palm trunk
      gfx.fillStyle(0x6a4820, 1);
      gfx.fillRect(tx - 3, groundY - 60 - rng() * 20, 6, 65);
      // Palm fronds (green circles at top)
      gfx.fillStyle(0x48a838, 0.8);
      for (let f = 0; f < 5; f++) { gfx.fillCircle(tx + (rng() - 0.5) * 30, groundY - 60 - rng() * 30, 10 + rng() * 8); }
    }
  } else if (floorId === 3) {
    // CLOUD: no solid ground, just a floating cloud platform
    gfx.fillStyle(0x90b8d8, 0.4);
    gfx.fillRect(0, groundY, width, height - groundY);
    // Cloud platform where characters stand
    for (let ci = 0; ci < 12; ci++) {
      const cx = width * (0.05 + ci / 12 * 0.9);
      gfx.fillStyle(0xd8e8f0, 0.7);
      gfx.fillCircle(cx, groundY + 2, 30 + rng() * 15);
    }
    gfx.fillStyle(0xe8f0f8, 0.5);
    gfx.fillRect(0, groundY + 4, width, 6);
  } else if (floorId === 4) {
    // EMBER: volcanic rock ground with lava glow
    gfx.fillStyle(0x2a1808, 1);
    gfx.fillRect(0, groundY, width, height - groundY);
    const groundPts4 = generateVolcanicPeakPoints(-20, width + 20, groundY, height * 0.02, 12, rng, 1);
    drawPaperLayer(gfx, groundPts4, 0x3a2010, undefined, 0, 0, true, height);
    // Lava glow from below
    gfx.fillStyle(0xff4010, 0.08);
    gfx.fillRect(0, groundY + 8, width, height - groundY);
    // Lava pools on edges
    for (let i = 0; i < 3; i++) {
      const lx = i < 1 ? width * rng() * 0.2 : width * (0.8 + rng() * 0.18);
      gfx.fillStyle(0xe04010, 0.4); gfx.fillCircle(lx, groundY + 6, 8 + rng() * 6);
      gfx.fillStyle(0xf08020, 0.3); gfx.fillCircle(lx, groundY + 4, 5 + rng() * 4);
    }
  } else if (floorId === 5) {
    // ARCANE: mystical stone floor with rune glow
    gfx.fillStyle(0x181028, 1);
    gfx.fillRect(0, groundY, width, height - groundY);
    const groundPts5 = generateCrystalPoints(-20, width + 20, groundY, height * 0.015, 10, rng);
    drawPaperLayer(gfx, groundPts5, 0x281840, undefined, 0, 0, true, height);
    // Glowing rune circles on edges
    for (let ri = 0; ri < 4; ri++) {
      const rx = ri < 2 ? width * (0.05 + rng() * 0.15) : width * (0.80 + rng() * 0.15);
      gfx.fillStyle(0x8040c0, 0.15); gfx.fillCircle(rx, groundY - 5, 12 + rng() * 8);
    }
  } else {
    // GARDEN: standard grass ground + trees
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillRect(0, groundY + shadowOy, width, height - groundY);
    const groundPts = generateHillPoints(-20, width + 20, groundY, height * 0.02, 8, rng, 2);
    drawPaperLayer(gfx, groundPts, pal.ground, undefined, 0, 0, true, height);
  }

  // Trees (garden/menu only)
  if (!floorId || floorId === 1 || floorId === 'menu') {
  const treeCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < treeCount; i++) {
    const side = i < treeCount / 2 ? -1 : 1;
    const tx = side < 0
      ? width * (0.02 + rng() * 0.18)
      : width * (0.80 + rng() * 0.18);
    const treeH = 40 + rng() * 50;
    const ty = groundY - rng() * 10;
    const treePts = generateTreePoints(tx, ty, treeH, rng);

    drawPaperLayer(gfx, treePts.map(p => ({ x: p.x + 2, y: p.y + 4 })),
      0x000000, undefined, 0, 0, false, 0);
    gfx.globalAlpha = 0.3;

    // Tree body
    drawPaperLayer(gfx, treePts, pal.trees, undefined, 0, 0, false, 0);
  }
  } // end garden-only trees

  // Accent dots (flowers, embers, sparkles — depends on floor)
  for (let i = 0; i < 12; i++) {
    const ax = width * (0.05 + rng() * 0.9);
    const ay = groundY - rng() * height * 0.08;
    const ar = 2 + rng() * 4;
    gfx.fillStyle(pal.accent, 0.7 + rng() * 0.3);
    gfx.fillCircle(ax, ay, ar);
  }

  return gfx;
}

// ================================================================
// WORLD MAP DIORAMA SCENES
// ================================================================

/**
 * Screen 1 — Enchanted Garden: lush layered green hills under a warm blue sky,
 * trees with varied canopies, scattered flowers and butterflies.
 * 8 distinct papercut layers with visible drop shadows.
 */
export function drawWorldMapGarden(scene, width, height, seed = 500) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;
  const shadowOx = 7;
  const shadowOy = 8;

  // ---- Layer 1 (depth 0): Light blue sky fill ----
  gfx.fillStyle(0x88c8f0, 1);
  gfx.fillRect(0, 0, W, H);

  // ---- Layer 2 (depth 1): Warm golden glow (radial gradient center) ----
  const glowCx = W * 0.5;
  const glowCy = H * 0.28;
  const glowR = Math.min(W, H) * 0.75;
  for (let ring = 10; ring >= 1; ring--) {
    const r = glowR * (ring / 10);
    const alpha = 0.45 * (1 - ring / 12) * 0.7;
    gfx.fillStyle(0xfff0a0, alpha);
    gfx.fillCircle(glowCx, glowCy, r);
  }
  // Hot center
  gfx.fillStyle(0xfff8d0, 0.5);
  gfx.fillCircle(glowCx, glowCy, glowR * 0.12);
  gfx.fillStyle(0xfffde0, 0.3);
  gfx.fillCircle(glowCx, glowCy, glowR * 0.25);

  // ---- Clouds (between sky and hill layers) ----
  for (let i = 0; i < 6; i++) {
    const cx = W * (0.05 + rng() * 0.9);
    const cy = H * (0.06 + rng() * 0.18);
    drawCloud(gfx, cx, cy, 65 + rng() * 80, 16 + rng() * 12, 0xf0f8ff, rng);
  }

  // ---- Layer 3 (depth 2): Dark teal/forest hill — farthest back ----
  const hill3pts = generateHillPoints(-30, W + 30, H * 0.38, H * 0.14, 3, rng, 5);
  drawPaperLayer(gfx, hill3pts, 0x1a5040, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 4 (depth 3): Medium teal-green hills ----
  const hill4pts = generateHillPoints(-30, W + 30, H * 0.46, H * 0.13, 4, rng, 5);
  drawPaperLayer(gfx, hill4pts, 0x287040, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 5 (depth 4): Forest green rolling hills ----
  const hill5pts = generateHillPoints(-30, W + 30, H * 0.54, H * 0.11, 5, rng, 4);
  drawPaperLayer(gfx, hill5pts, 0x48a848, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 6 (depth 5): Bright green hills ----
  const hill6pts = generateHillPoints(-30, W + 30, H * 0.63, H * 0.09, 4, rng, 4);
  drawPaperLayer(gfx, hill6pts, 0x68c050, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 7 (depth 6): Lime green foreground ----
  const hill7pts = generateHillPoints(-30, W + 30, H * 0.73, H * 0.06, 5, rng, 3);
  drawPaperLayer(gfx, hill7pts, 0x88d860, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 8 (depth 7): Yellow-green ground with grass and flowers ----
  const groundY = H * 0.82;
  const groundPts = generateHillPoints(-30, W + 30, groundY, H * 0.02, 8, rng, 2);
  drawPaperLayer(gfx, groundPts, 0xa8f078, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Trees with varied foliage ----
  const treeDefs = [
    { x: W * 0.04, y: H * 0.55, h: 70, foliage: 0x388828 },
    { x: W * 0.12, y: H * 0.52, h: 85, foliage: 0xd87898 },
    { x: W * 0.22, y: H * 0.60, h: 60, foliage: 0x48a838 },
    { x: W * 0.78, y: H * 0.58, h: 65, foliage: 0xd0c040 },
    { x: W * 0.88, y: H * 0.54, h: 80, foliage: 0x388828 },
    { x: W * 0.95, y: H * 0.56, h: 75, foliage: 0xd87898 },
  ];
  for (const td of treeDefs) {
    // Trunk
    const trunkW = td.h * 0.08;
    gfx.fillStyle(0x000000, 0.4);
    gfx.fillRect(td.x - trunkW / 2 + 4, td.y - td.h * 0.55 + 6, trunkW, td.h * 0.55);
    gfx.fillStyle(0x5a3818, 1);
    gfx.fillRect(td.x - trunkW / 2, td.y - td.h * 0.55, trunkW, td.h * 0.55);
    // Foliage (layered circles)
    const cr = td.h * 0.32;
    gfx.fillStyle(0x000000, 0.35);
    gfx.fillCircle(td.x + 5, td.y - td.h * 0.6 + 7, cr);
    gfx.fillStyle(td.foliage, 1);
    gfx.fillCircle(td.x, td.y - td.h * 0.6, cr);
    gfx.fillCircle(td.x - cr * 0.5, td.y - td.h * 0.55, cr * 0.7);
    gfx.fillCircle(td.x + cr * 0.5, td.y - td.h * 0.52, cr * 0.65);
    // Highlight
    const lighter = td.foliage + 0x202020;
    gfx.fillStyle(lighter, 0.4);
    gfx.fillCircle(td.x - cr * 0.2, td.y - td.h * 0.65, cr * 0.4);
  }

  // ---- Foreground trees on ground layer ----
  const fgTrees = [
    { x: W * 0.06, y: groundY, h: 55, foliage: 0x48a838 },
    { x: W * 0.94, y: groundY, h: 50, foliage: 0x388828 },
  ];
  for (const ft of fgTrees) {
    const treePts = generateTreePoints(ft.x, ft.y, ft.h, rng);
    drawPaperLayer(gfx, treePts.map(p => ({ x: p.x + 4, y: p.y + 6 })), 0x000000, undefined, 0, 0, false, 0);
    drawPaperLayer(gfx, treePts, ft.foliage, undefined, 0, 0, false, 0);
  }

  // ---- Flowers scattered on ground ----
  const flowerColors = [0xf06888, 0xf0a848, 0xd040d0, 0xf0c040, 0xff7070, 0xe060e0];
  for (let i = 0; i < 24; i++) {
    const fx = W * (0.05 + rng() * 0.9);
    const fy = groundY - rng() * 14 + 4;
    const fr = 2 + rng() * 3.5;
    // Stem
    gfx.fillStyle(0x48a040, 0.7);
    gfx.fillRect(fx - 0.5, fy, 1, 4 + rng() * 4);
    // Flower head
    gfx.fillStyle(flowerColors[Math.floor(rng() * flowerColors.length)], 0.85);
    gfx.fillCircle(fx, fy, fr);
    // Center dot
    gfx.fillStyle(0xffff80, 0.6);
    gfx.fillCircle(fx, fy, fr * 0.3);
  }

  // ---- Butterflies ----
  for (let i = 0; i < 8; i++) {
    const bx = W * (0.1 + rng() * 0.8);
    const by = H * (0.3 + rng() * 0.45);
    const bsize = 3 + rng() * 3;
    const bColors = [0xf060a0, 0x6060f0, 0xf0c040, 0x60d0f0];
    const bc = bColors[Math.floor(rng() * bColors.length)];
    // Wings
    gfx.fillStyle(bc, 0.7);
    gfx.fillCircle(bx - bsize, by - bsize * 0.3, bsize);
    gfx.fillCircle(bx + bsize, by - bsize * 0.3, bsize);
    gfx.fillCircle(bx - bsize * 0.7, by + bsize * 0.4, bsize * 0.7);
    gfx.fillCircle(bx + bsize * 0.7, by + bsize * 0.4, bsize * 0.7);
    // Body
    gfx.fillStyle(0x2a1a10, 0.8);
    gfx.fillRect(bx - 0.5, by - bsize * 0.5, 1, bsize * 1.2);
  }

  return gfx;
}

/**
 * Screen 2 — Crystal Caves: deep underground cavern with glowing crystals.
 * 8 distinct papercut layers with visible drop shadows, plus crystal details.
 */
export function drawWorldMapCaves(scene, width, height, seed = 600) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;
  const shadowOx = 8;
  const shadowOy = 9;

  // ---- Layer 1 (depth 0): Deep purple/indigo background ----
  gfx.fillStyle(0x18082a, 1);
  gfx.fillRect(0, 0, W, H);

  // ---- Layer 2 (depth 1): Purple glow from center ----
  const glowCx = W * 0.5;
  const glowCy = H * 0.45;
  const glowR = Math.min(W, H) * 0.7;
  for (let ring = 10; ring >= 1; ring--) {
    const r = glowR * (ring / 10);
    const alpha = 0.3 * (1 - ring / 12) * 0.6;
    gfx.fillStyle(0x3a1860, alpha);
    gfx.fillCircle(glowCx, glowCy, r);
  }
  gfx.fillStyle(0x4a2878, 0.15);
  gfx.fillCircle(glowCx, glowCy, glowR * 0.25);

  // ---- Layer 3 (depth 2): Dark rocky ceiling — jagged inverted hills ----
  // Generate jagged ceiling shape and flip it to hang from top
  const ceilRawPts = generateVolcanicPeakPoints(-30, W + 30, H * 0.1, H * 0.08, 7, rng, 3);
  // Invert: ceiling hangs down from y=0
  const ceilPts = ceilRawPts.map(p => ({
    x: p.x,
    y: H * 0.18 - (p.y - H * 0.1),
  }));
  // Draw the ceiling as a filled region from top to the jagged edge
  const ceilFull = [
    { x: -30, y: 0 },
    ...ceilPts,
    { x: W + 30, y: 0 },
  ];
  drawPaperLayer(gfx, ceilFull, 0x10051a, 0x000000, shadowOx, shadowOy, false, 0);

  // ---- Layer 4 (depth 3): Dark purple cave wall layer ----
  const wall4pts = generateVolcanicPeakPoints(-30, W + 30, H * 0.42, H * 0.14, 4, rng, 3);
  drawPaperLayer(gfx, wall4pts, 0x1a1030, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 5 (depth 4): Medium purple/maroon rocky wall ----
  const wall5pts = generateVolcanicPeakPoints(-30, W + 30, H * 0.52, H * 0.11, 5, rng, 3);
  drawPaperLayer(gfx, wall5pts, 0x2a1440, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 6 (depth 5): Dark ground with stalactite shadows ----
  const wall6pts = generateVolcanicPeakPoints(-30, W + 30, H * 0.62, H * 0.08, 5, rng, 3);
  drawPaperLayer(gfx, wall6pts, 0x381848, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 7 (depth 6): Rocky ground floor — irregular top edge ----
  const groundY = H * 0.76;
  const ground7pts = generateVolcanicPeakPoints(-30, W + 30, groundY, H * 0.03, 9, rng, 2);
  drawPaperLayer(gfx, ground7pts, 0x2a1838, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 8 (depth 7): Lighter stone foreground ----
  const fgY = H * 0.84;
  const fg8pts = generateVolcanicPeakPoints(-30, W + 30, fgY, H * 0.02, 10, rng, 2);
  drawPaperLayer(gfx, fg8pts, 0x3a2050, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Stalactites hanging from ceiling ----
  for (let i = 0; i < 14; i++) {
    const sx = W * (0.04 + (i / 14) * 0.92) + (rng() - 0.5) * 35;
    const sBaseY = H * 0.02 + rng() * H * 0.06;
    const sLen = 35 + rng() * 90;
    const sW = 8 + rng() * 14;
    // Shadow
    gfx.fillStyle(0x000000, 0.35);
    gfx.fillTriangle(sx - sW / 2 + 4, sBaseY + 5, sx + 4, sBaseY + sLen + 5, sx + sW / 2 + 4, sBaseY + 5);
    // Body
    gfx.fillStyle(0x1a0c28, 1);
    gfx.fillTriangle(sx - sW / 2, sBaseY, sx, sBaseY + sLen, sx + sW / 2, sBaseY);
    // Highlight
    gfx.fillStyle(0x2a1840, 0.6);
    gfx.fillTriangle(sx - sW / 4, sBaseY, sx, sBaseY + sLen * 0.6, sx + sW / 8, sBaseY);
  }

  // ---- Stalagmites rising from floor ----
  for (let i = 0; i < 10; i++) {
    const mx = W * (0.03 + rng() * 0.94);
    const mLen = 20 + rng() * 50;
    const mW = 10 + rng() * 16;
    const mBaseY = groundY + rng() * (fgY - groundY) * 0.3;
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillTriangle(mx - mW / 2 + 3, mBaseY + 4, mx + 3, mBaseY - mLen + 4, mx + mW / 2 + 3, mBaseY + 4);
    gfx.fillStyle(0x2a1848, 1);
    gfx.fillTriangle(mx - mW / 2, mBaseY, mx, mBaseY - mLen, mx + mW / 2, mBaseY);
  }

  // ---- Glowing crystals ----
  const crystalDefs = [
    { x: W * 0.08, y: groundY - 10, h: 48, color: 0x40e0f0 },
    { x: W * 0.22, y: H * 0.36, h: 34, color: 0xf060a0 },
    { x: W * 0.35, y: groundY - 18, h: 55, color: 0xa060f0 },
    { x: W * 0.48, y: H * 0.28, h: 30, color: 0x40e0f0 },
    { x: W * 0.58, y: groundY - 12, h: 50, color: 0xf060a0 },
    { x: W * 0.70, y: H * 0.34, h: 36, color: 0xa060f0 },
    { x: W * 0.80, y: groundY - 20, h: 52, color: 0x40e0f0 },
    { x: W * 0.92, y: groundY - 8, h: 42, color: 0xf060a0 },
    { x: W * 0.15, y: H * 0.20, h: 26, color: 0xa060f0 },
    { x: W * 0.85, y: H * 0.22, h: 28, color: 0x40e0f0 },
  ];
  for (const c of crystalDefs) {
    const cw = c.h * 0.3;
    // Glow circle behind crystal
    gfx.fillStyle(c.color, 0.1);
    gfx.fillCircle(c.x, c.y - c.h * 0.4, c.h * 1.0);
    gfx.fillStyle(c.color, 0.15);
    gfx.fillCircle(c.x, c.y - c.h * 0.4, c.h * 0.6);

    // Draw 2-3 crystal shards per cluster (diamond/triangle shapes)
    const shardCount = 2 + Math.floor(rng() * 2);
    for (let s = 0; s < shardCount; s++) {
      const ox = (s - shardCount / 2) * cw * 0.7;
      const sh = c.h * (0.6 + rng() * 0.5);
      const sw = cw * (0.5 + rng() * 0.4);
      // Shadow
      gfx.fillStyle(0x000000, 0.35);
      gfx.fillTriangle(
        c.x + ox - sw / 2 + 3, c.y + 4,
        c.x + ox + 3, c.y - sh + 4,
        c.x + ox + sw / 2 + 3, c.y + 4
      );
      // Crystal body
      gfx.fillStyle(c.color, 0.85);
      gfx.fillTriangle(
        c.x + ox - sw / 2, c.y,
        c.x + ox, c.y - sh,
        c.x + ox + sw / 2, c.y
      );
      // Highlight
      gfx.fillStyle(0xffffff, 0.25);
      gfx.fillTriangle(
        c.x + ox - sw / 4, c.y - sh * 0.2,
        c.x + ox, c.y - sh,
        c.x + ox + sw / 8, c.y - sh * 0.2
      );
    }
  }

  // ---- Ambient glow particles ----
  const sparkColors = [0x40e0f0, 0xf060a0, 0xa060f0, 0x80b0ff];
  for (let i = 0; i < 25; i++) {
    const px = rng() * W;
    const py = rng() * H * 0.88;
    const pr = 1.5 + rng() * 2.5;
    gfx.fillStyle(sparkColors[Math.floor(rng() * sparkColors.length)], 0.3 + rng() * 0.4);
    gfx.fillCircle(px, py, pr);
  }

  return gfx;
}

/**
 * Screen 3 — Starlit Highlands: open highland vista under a star-filled
 * twilight sky with crescent moon, aurora bands, standing stones, fireflies.
 * 8 distinct papercut layers with visible drop shadows.
 */
export function drawWorldMapStarlitHighlands(scene, width, height, seed = 700) {
  const rng = makeRng(seed);
  const gfx = scene.add.graphics();
  const H = height, W = width;
  const shadowOx = 7;
  const shadowOy = 8;

  // ---- Layer 1 (depth 0): Deep twilight sky gradient ----
  gfx.fillStyle(0x1a1040, 1);
  gfx.fillRect(0, 0, W, H);
  // Gradient bands toward horizon (lighter at bottom of sky)
  for (let band = 0; band < 8; band++) {
    const bandY = H * (0.25 + band * 0.06);
    const bandH = H * 0.07;
    const alpha = 0.03 + band * 0.015;
    gfx.fillStyle(0x2a2060, alpha);
    gfx.fillRect(0, bandY, W, bandH);
  }

  // ---- Layer 2 (depth 1): Star field — 50+ white/yellow dots ----
  const starColors = [0xffffff, 0xfff8d0, 0xd0d8ff, 0xffe8a0];
  for (let i = 0; i < 55; i++) {
    const sx = rng() * W;
    const sy = rng() * H * 0.52;
    const sr = 0.6 + rng() * 2;
    gfx.fillStyle(starColors[Math.floor(rng() * starColors.length)], 0.4 + rng() * 0.6);
    gfx.fillCircle(sx, sy, sr);
  }
  // Brighter feature stars with glow halos
  for (let i = 0; i < 8; i++) {
    const sx = W * (0.05 + rng() * 0.9);
    const sy = H * (0.03 + rng() * 0.35);
    gfx.fillStyle(0xffffff, 0.12);
    gfx.fillCircle(sx, sy, 7 + rng() * 4);
    gfx.fillStyle(0xffffff, 0.7);
    gfx.fillCircle(sx, sy, 1.5);
  }

  // ---- Crescent moon ----
  const moonX = W * 0.75;
  const moonY = H * 0.12;
  const moonR = 38;
  gfx.fillStyle(0xfffff0, 0.9);
  gfx.fillCircle(moonX, moonY, moonR);
  gfx.fillStyle(0x1a1040, 1);
  gfx.fillCircle(moonX + moonR * 0.45, moonY - moonR * 0.2, moonR * 0.82);
  // Moon glow
  gfx.fillStyle(0xfffff0, 0.06);
  gfx.fillCircle(moonX, moonY, moonR * 2.5);
  gfx.fillStyle(0xfffff0, 0.1);
  gfx.fillCircle(moonX, moonY, moonR * 1.5);

  // ---- Aurora-like color bands in the sky ----
  const auroraColors = [0x40c080, 0x6080d0, 0x8060c0, 0x40c0a0];
  for (let a = 0; a < 4; a++) {
    const ay = H * (0.12 + a * 0.06) + (rng() - 0.5) * H * 0.04;
    const aH = H * (0.04 + rng() * 0.03);
    // Draw as a wavy band
    gfx.fillStyle(auroraColors[a], 0.06 + rng() * 0.04);
    gfx.beginPath();
    gfx.moveTo(-10, ay);
    const aSteps = 20;
    for (let s = 0; s <= aSteps; s++) {
      const t = s / aSteps;
      const ax = t * (W + 20) - 10;
      const wave = Math.sin(t * Math.PI * 3 + a * 1.5) * aH * 0.5;
      gfx.lineTo(ax, ay + wave);
    }
    for (let s = aSteps; s >= 0; s--) {
      const t = s / aSteps;
      const ax = t * (W + 20) - 10;
      const wave = Math.sin(t * Math.PI * 3 + a * 1.5 + 0.5) * aH * 0.3;
      gfx.lineTo(ax, ay + aH + wave);
    }
    gfx.closePath();
    gfx.fillPath();
  }

  // ---- Layer 3 (depth 2): Distant mountain silhouettes — dark purple ----
  const mtn3pts = generateVolcanicPeakPoints(-30, W + 30, H * 0.40, H * 0.16, 4, rng, 4);
  drawPaperLayer(gfx, mtn3pts, 0x1a1038, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 4 (depth 3): Mid-distance mountains — slightly lighter purple ----
  const mtn4pts = generateVolcanicPeakPoints(-30, W + 30, H * 0.48, H * 0.13, 5, rng, 4);
  drawPaperLayer(gfx, mtn4pts, 0x2a1850, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 5 (depth 4): Dark green highland hills ----
  const hill5pts = generateHillPoints(-30, W + 30, H * 0.58, H * 0.10, 4, rng, 5);
  drawPaperLayer(gfx, hill5pts, 0x1a4030, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 6 (depth 5): Medium green rolling highland ----
  const hill6pts = generateHillPoints(-30, W + 30, H * 0.67, H * 0.08, 5, rng, 4);
  drawPaperLayer(gfx, hill6pts, 0x2a6040, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 7 (depth 6): Bright green foreground hills ----
  const hill7pts = generateHillPoints(-30, W + 30, H * 0.76, H * 0.05, 5, rng, 3);
  drawPaperLayer(gfx, hill7pts, 0x408850, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Layer 8 (depth 7): Pale green ground with mystical elements ----
  const groundY = H * 0.84;
  const ground8pts = generateHillPoints(-30, W + 30, groundY, H * 0.02, 8, rng, 2);
  drawPaperLayer(gfx, ground8pts, 0x58a868, 0x000000, shadowOx, shadowOy, true, H);

  // ---- Magical standing stones (dark rectangles with glow tops) ----
  const stones = [
    { x: W * 0.10, y: groundY, h: 60 },
    { x: W * 0.30, y: H * 0.70, h: 50 },
    { x: W * 0.50, y: H * 0.72, h: 65 },
    { x: W * 0.72, y: H * 0.68, h: 55 },
    { x: W * 0.90, y: groundY, h: 48 },
  ];
  for (const st of stones) {
    const sw = st.h * 0.2 + rng() * 4;
    const baseY = st.y;
    // Shadow
    gfx.fillStyle(0x000000, 0.4);
    gfx.fillRect(st.x - sw / 2 + 4, baseY - st.h + 6, sw, st.h);
    // Stone body
    gfx.fillStyle(0x1a1830, 1);
    gfx.fillRect(st.x - sw / 2, baseY - st.h, sw, st.h);
    // Stone highlight
    gfx.fillStyle(0x2a2848, 0.6);
    gfx.fillRect(st.x - sw / 2, baseY - st.h, sw * 0.3, st.h);
    // Glow at top of stone
    gfx.fillStyle(0x80c0ff, 0.2);
    gfx.fillCircle(st.x, baseY - st.h, sw * 0.8);
    gfx.fillStyle(0x80c0ff, 0.4);
    gfx.fillCircle(st.x, baseY - st.h, sw * 0.35);
    // Rune glow dot
    gfx.fillStyle(0xc0e0ff, 0.6);
    gfx.fillCircle(st.x, baseY - st.h * 0.6, 2.5);
  }

  // ---- Glowing fireflies ----
  const fireflyColors = [0xf0e060, 0xc0ff80, 0x80ffb0, 0xf0c040];
  for (let i = 0; i < 20; i++) {
    const fx = W * (0.05 + rng() * 0.9);
    const fy = H * (0.35 + rng() * 0.5);
    const fr = 1.5 + rng() * 2;
    const fc = fireflyColors[Math.floor(rng() * fireflyColors.length)];
    // Glow halo
    gfx.fillStyle(fc, 0.12);
    gfx.fillCircle(fx, fy, fr * 3);
    // Firefly body
    gfx.fillStyle(fc, 0.6 + rng() * 0.3);
    gfx.fillCircle(fx, fy, fr);
  }

  // ---- Scattered magic particles ----
  const particleColors = [0xc080ff, 0x80d0ff, 0xf0c040, 0x80ff90, 0xff80c0];
  for (let i = 0; i < 15; i++) {
    const px = rng() * W;
    const py = rng() * H * 0.85;
    const pr = 1 + rng() * 1.5;
    gfx.fillStyle(particleColors[Math.floor(rng() * particleColors.length)], 0.25 + rng() * 0.3);
    gfx.fillCircle(px, py, pr);
  }

  return gfx;
}

/**
 * Draw a torn-paper diorama frame around the edges of the scene.
 * This should only be used on the battle scene, not on every scene.
 *
 * @param {Phaser.Scene} scene
 * @param {number} width
 * @param {number} height
 * @param {number} [seed=42]
 * @returns {Phaser.GameObjects.Graphics}
 */
export function drawDioramaFrame(scene, width, height, seed = 42) {
  const rng = makeRng(seed + 9999);

  const frameGfx = scene.add.graphics().setDepth(15);
  const frameColor = 0x1a0e04;
  const frameW = 50;
  const archCx = width * 0.5, archCy = height * 0.1;

  // Left frame with torn inner edge
  frameGfx.fillStyle(frameColor, 0.92);
  frameGfx.beginPath();
  frameGfx.moveTo(0, 0);
  frameGfx.lineTo(frameW, 0);
  for (let py = 0; py <= height; py += 8) {
    const wobble = (rng() - 0.5) * 16;
    frameGfx.lineTo(frameW + wobble, py);
  }
  frameGfx.lineTo(0, height);
  frameGfx.closePath();
  frameGfx.fillPath();

  // Right frame with torn inner edge
  frameGfx.beginPath();
  frameGfx.moveTo(width, 0);
  frameGfx.lineTo(width - frameW, 0);
  for (let py = 0; py <= height; py += 8) {
    const wobble = (rng() - 0.5) * 16;
    frameGfx.lineTo(width - frameW + wobble, py);
  }
  frameGfx.lineTo(width, height);
  frameGfx.closePath();
  frameGfx.fillPath();

  // Top arch frame
  frameGfx.beginPath();
  frameGfx.moveTo(0, 0);
  frameGfx.lineTo(width, 0);
  frameGfx.lineTo(width, frameW + 20);
  for (let px = width; px >= 0; px -= 6) {
    const t = px / width;
    const archY = archCy + Math.sin(t * Math.PI) * frameW * 0.6;
    const wobble = (rng() - 0.5) * 8;
    frameGfx.lineTo(px, archY + wobble);
  }
  frameGfx.lineTo(0, frameW + 20);
  frameGfx.closePath();
  frameGfx.fillPath();

  // Bottom frame
  frameGfx.beginPath();
  frameGfx.moveTo(0, height);
  frameGfx.lineTo(width, height);
  frameGfx.lineTo(width, height - frameW);
  for (let px = width; px >= 0; px -= 8) {
    const wobble = (rng() - 0.5) * 12;
    frameGfx.lineTo(px, height - frameW + wobble);
  }
  frameGfx.lineTo(0, height - frameW);
  frameGfx.closePath();
  frameGfx.fillPath();

  return frameGfx;
}
