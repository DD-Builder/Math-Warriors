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

export const FLOOR_PALETTES = {
  1: { // Garden — Reference B: bright whimsical
    sky:     0x3a6848,
    skyGlow: 0x88c878,
    layers: [
      { color: 0x1a4020, shadow: 0x0a1808, peakH: 0.18, peaks: 3 },
      { color: 0x2a5c28, shadow: 0x0c2010, peakH: 0.22, peaks: 4 },
      { color: 0x3a7830, shadow: 0x142c14, peakH: 0.16, peaks: 5 },
      { color: 0x4a9838, shadow: 0x1c3818, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x2a4818,
    trees:   0x1a3c10,
    treesL:  0x306020,
    accent:  0xc84868,  // flowers
    cloud:   0xd8f0d0,
    glow:    0xf8e848,
    glowAlpha: 0.4,
  },
  2: { // Tidepool — dark blues, Reference A mood
    sky:     0x0a1830,
    skyGlow: 0x183860,
    layers: [
      { color: 0x0c1e38, shadow: 0x040c18, peakH: 0.14, peaks: 5 },
      { color: 0x142e50, shadow: 0x081828, peakH: 0.20, peaks: 3 },
      { color: 0x1c3e68, shadow: 0x0c2040, peakH: 0.16, peaks: 4 },
      { color: 0x285080, shadow: 0x102848, peakH: 0.12, peaks: 3 },
    ],
    ground:  0x102838,
    trees:   0x0c2040,
    treesL:  0x183860,
    accent:  0x40c0d0,  // coral
    cloud:   0x283848,
    glow:    0x60a0d0,
    glowAlpha: 0.35,
  },
  3: { // Cloud — soft pastels
    sky:     0x4870a0,
    skyGlow: 0x88b8e0,
    layers: [
      { color: 0x6090c0, shadow: 0x304868, peakH: 0.12, peaks: 4 },
      { color: 0x78a8d0, shadow: 0x405878, peakH: 0.18, peaks: 3 },
      { color: 0x90c0e0, shadow: 0x587898, peakH: 0.14, peaks: 5 },
      { color: 0xa8d8f0, shadow: 0x6890a8, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x88b0d0,
    trees:   0x5888b0,
    treesL:  0x78a8d0,
    accent:  0xf0c040,  // sun
    cloud:   0xe8f0f8,
    glow:    0xffd840,
    glowAlpha: 0.45,
  },
  4: { // Ember — deep reds and oranges
    sky:     0x1a0808,
    skyGlow: 0x401008,
    layers: [
      { color: 0x2a0c08, shadow: 0x100404, peakH: 0.20, peaks: 4 },
      { color: 0x4a1808, shadow: 0x200a04, peakH: 0.18, peaks: 3 },
      { color: 0x6a2810, shadow: 0x301008, peakH: 0.14, peaks: 5 },
      { color: 0x8a3818, shadow: 0x401808, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x3a1408,
    trees:   0x601808,
    treesL:  0x8a2810,
    accent:  0xf06020,  // embers
    cloud:   0x402010,
    glow:    0xff5010,
    glowAlpha: 0.5,
  },
  5: { // Mending Room — Reference A: dark cinematic
    sky:     0x0c0420,
    skyGlow: 0x201040,
    layers: [
      { color: 0x140828, shadow: 0x080414, peakH: 0.16, peaks: 4 },
      { color: 0x201040, shadow: 0x100820, peakH: 0.22, peaks: 3 },
      { color: 0x301858, shadow: 0x180c30, peakH: 0.14, peaks: 5 },
      { color: 0x402068, shadow: 0x201038, peakH: 0.10, peaks: 3 },
    ],
    ground:  0x180830,
    trees:   0x281050,
    treesL:  0x381870,
    accent:  0xd0a0ff,  // magic sparkles
    cloud:   0x301848,
    glow:    0xc080f0,
    glowAlpha: 0.45,
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
