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

/**
 * Seeded random for deterministic wobble per scene.
 */
function seededRng(seed) {
  let s = ((seed ^ 0x9e3779b9) + 0x6c62272e) >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}

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
    sky:     0x78b8e8,
    skyGlow: 0xd0e8f8,
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
  },
  4: { // Ember — warm sunset, orange glow, not pitch dark
    sky:     0x4a1818,
    skyGlow: 0x883018,
    layers: [
      { color: 0x5a2010, shadow: 0x301008, peakH: 0.20, peaks: 4 },
      { color: 0x783010, shadow: 0x481808, peakH: 0.18, peaks: 3 },
      { color: 0x984018, shadow: 0x582808, peakH: 0.14, peaks: 5 },
      { color: 0xb85020, shadow: 0x683010, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x6a2810,
    trees:   0x882818,
    treesL:  0xa83820,
    accent:  0xf0a020,  // embers
    cloud:   0x804020,
    glow:    0xff6820,
    glowAlpha: 0.55,
  },
  5: { // Mending Room — magical twilight, purple + gold, not pitch dark
    sky:     0x281848,
    skyGlow: 0x483078,
    layers: [
      { color: 0x302058, shadow: 0x181030, peakH: 0.16, peaks: 4 },
      { color: 0x402870, shadow: 0x201840, peakH: 0.22, peaks: 3 },
      { color: 0x503888, shadow: 0x282050, peakH: 0.14, peaks: 5 },
      { color: 0x604898, shadow: 0x302858, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x382058,
    trees:   0x482870,
    treesL:  0x583890,
    accent:  0xe0b0ff,  // magic sparkles
    cloud:   0x584080,
    glow:    0xd098f8,
    glowAlpha: 0.5,
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
  const rng = seededRng(seed + floorId * 1000);
  const gfx = scene.add.graphics();

  // Sky fill
  gfx.fillStyle(pal.sky, 1);
  gfx.fillRect(0, 0, width, height);

  // Central glow — radial gradient approximation with concentric circles
  const cx = width * 0.5;
  const cy = height * 0.35;
  const glowR = Math.min(width, height) * 0.7;
  for (let ring = 8; ring >= 1; ring--) {
    const r = glowR * (ring / 8);
    const alpha = pal.glowAlpha * (1 - ring / 10) * 0.7;
    gfx.fillStyle(pal.skyGlow, alpha);
    gfx.fillCircle(cx, cy, r);
  }
  // Hot center
  gfx.fillStyle(pal.glow, pal.glowAlpha * 0.6);
  gfx.fillCircle(cx, cy, glowR * 0.15);
  gfx.fillStyle(pal.glow, pal.glowAlpha * 0.3);
  gfx.fillCircle(cx, cy, glowR * 0.3);

  // Clouds (behind hills)
  for (let i = 0; i < 4; i++) {
    const cloudX = width * (0.1 + rng() * 0.8);
    const cloudY = height * (0.08 + rng() * 0.18);
    drawCloud(gfx, cloudX, cloudY, 60 + rng() * 60, 15 + rng() * 10, pal.cloud, rng);
  }

  // Hill layers (back to front)
  const shadowOx = 3;
  const shadowOy = 6;
  for (let li = 0; li < pal.layers.length; li++) {
    const layer = pal.layers[li];
    const layerBaseY = height * (0.45 + li * 0.12);
    const pts = generateHillPoints(
      -20, width + 20, layerBaseY,
      height * layer.peakH, layer.peaks,
      rng, 3 + li * 2
    );
    drawPaperLayer(gfx, pts, layer.color, layer.shadow, shadowOx, shadowOy, true, height);
  }

  // Ground plane (foreground paper)
  const groundY = height * 0.82;
  gfx.fillStyle(0x000000, 0.3);
  gfx.fillRect(0, groundY + shadowOy, width, height - groundY);
  gfx.fillStyle(pal.ground, 1);
  // Wobbly top edge for the ground
  const groundPts = generateHillPoints(-20, width + 20, groundY, height * 0.02, 8, rng, 2);
  drawPaperLayer(gfx, groundPts, pal.ground, undefined, 0, 0, true, height);

  // Trees on the foreground hills (left and right sides, framing the center)
  const treeCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < treeCount; i++) {
    // Place trees on the edges, leaving center open for characters
    const side = i < treeCount / 2 ? -1 : 1;
    const tx = side < 0
      ? width * (0.02 + rng() * 0.18)
      : width * (0.80 + rng() * 0.18);
    const treeH = 40 + rng() * 50;
    const ty = groundY - rng() * 10;
    const treePts = generateTreePoints(tx, ty, treeH, rng);

    // Shadow
    drawPaperLayer(gfx, treePts.map(p => ({ x: p.x + 2, y: p.y + 4 })),
      0x000000, undefined, 0, 0, false, 0);
    gfx.globalAlpha = 0.3;

    // Tree body
    drawPaperLayer(gfx, treePts, pal.trees, undefined, 0, 0, false, 0);
  }

  // Accent dots (flowers, embers, sparkles — depends on floor)
  for (let i = 0; i < 12; i++) {
    const ax = width * (0.05 + rng() * 0.9);
    const ay = groundY - rng() * height * 0.08;
    const ar = 2 + rng() * 4;
    gfx.fillStyle(pal.accent, 0.7 + rng() * 0.3);
    gfx.fillCircle(ax, ay, ar);
  }

  // Vignette frame (dark edges, like looking into a diorama box)
  const vigW = 80;
  // Top
  gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.9, 0.9, 0, 0);
  gfx.fillRect(0, 0, width, vigW);
  // Bottom
  gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.6, 0.6);
  gfx.fillRect(0, height - vigW, width, vigW);
  // Left
  gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.8, 0, 0.8, 0);
  gfx.fillRect(0, 0, vigW, height);
  // Right
  gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.8, 0, 0.8);
  gfx.fillRect(width - vigW, 0, vigW, height);

  return gfx;
}
