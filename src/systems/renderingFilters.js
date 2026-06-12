/**
 * Per-floor rendering filters — papercut edition.
 *
 * Every floor keeps the soft layered-paper aesthetic; filters are
 * limited to subtle palette-tinted color grading (no pixelation,
 * no darkening, no hard contrast):
 * Floor 1 (Garden): Papercut — baseline, no filter needed
 * Floor 2 (Tidepool): Matte paper — gentle desaturation + faint grain
 * Floor 3 (Cloud): Watercolor paper — pastel softening + warm cream tint
 * Floor 4 (Ember): Sun-warmed paper — subtle peach/orange tint
 * Floor 5/9 (Mending): Dusk paper — subtle teal tint
 * Floors 6-8: Baseline papercut
 */

// ================================================================
// SPRITE-LEVEL FILTERS (applied to individual sprite canvases)
// ================================================================

/**
 * Apply a floor-specific visual filter to a sprite canvas.
 *
 * @param {HTMLCanvasElement} canvas - The sprite canvas to filter
 * @param {number} floorId - Floor number (1-9)
 * @returns {HTMLCanvasElement} The filtered canvas (same reference, mutated in place)
 */
export function applySpriteFilter(canvas, floorId) {
  if (floorId === 2) return claymationFilter(canvas);
  if (floorId === 3) return watercolorFilter(canvas);
  if (floorId === 4) return pixelArtFilter(canvas);
  if (floorId === 5 || floorId === 9) return cinematicFilter(canvas);
  return canvas;
}

// ================================================================
// INDIVIDUAL FILTER IMPLEMENTATIONS
// ================================================================

/**
 * Claymation filter (softened) — matte paper look.
 * Gentle 8% desaturation and a faint paper-grain noise.
 * No contrast boost — paper layers stay soft.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
function claymationFilter(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // Skip fully transparent pixels
    if (data[i + 3] === 0) continue;

    // Gentle 8% desaturation (matte paper)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = r + (gray - r) * 0.08;
    g = g + (gray - g) * 0.08;
    b = b + (gray - b) * 0.08;

    // Faint paper grain: +-1.5 per channel
    r += (Math.random() - 0.5) * 3;
    g += (Math.random() - 0.5) * 3;
    b += (Math.random() - 0.5) * 3;

    // Clamp and store
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Watercolor filter (softened) — pastel paper look.
 * Gentle 12% desaturation, a subtle warm cream tint, and a faint
 * paper-grain noise. Alpha is left intact so paper layers stay crisp.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
function watercolorFilter(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // Skip fully transparent pixels
    if (data[i + 3] === 0) continue;

    // Gentle 12% desaturation (pastel look)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = r + (gray - r) * 0.12;
    g = g + (gray - g) * 0.12;
    b = b + (gray - b) * 0.12;

    // Subtle warm cream tint (toward PAPER.cream #f5eedd)
    r += (245 - r) * 0.04;
    g += (238 - g) * 0.04;
    b += (221 - b) * 0.04;

    // Faint paper grain: +-2 per channel
    r += (Math.random() - 0.5) * 4;
    g += (Math.random() - 0.5) * 4;
    b += (Math.random() - 0.5) * 4;

    // Clamp and store
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Ember filter (replaces pixel-art) — sun-warmed paper look.
 * Pixelation and palette quantization fought the soft papercut
 * aesthetic, so floor 4 now gets a subtle warm shift toward
 * PAPER.orange (#e39a4a) instead. Shapes and shadows stay soft.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
function pixelArtFilter(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Subtle 7% blend toward PAPER.orange (227,154,74)
    r += (227 - r) * 0.07;
    g += (154 - g) * 0.07;
    b += (74 - b) * 0.07;

    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Cinematic filter (softened) — dusk paper look.
 * The old contrast boost + darkening fought the soft paper look,
 * so floors 5/9 now get a subtle cool shift toward PAPER.teal
 * (#44888a) with no darkening and no contrast change.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
function cinematicFilter(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // Skip fully transparent pixels
    if (data[i + 3] === 0) continue;

    // Subtle 7% blend toward PAPER.teal (68,136,138)
    r += (68 - r) * 0.07;
    g += (136 - g) * 0.07;
    b += (138 - b) * 0.07;

    // Clamp and store
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ================================================================
// SCENE-LEVEL OVERLAY (Phaser Graphics)
// ================================================================

/**
 * Apply a floor-specific overlay to a Phaser scene using Graphics.
 * This adds scene-wide visual effects like paper texture and vignette.
 *
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {number} floorId - Floor number (1-9)
 * @param {number} width - Scene width
 * @param {number} height - Scene height
 * @returns {Phaser.GameObjects.Graphics|null} The overlay graphics object, or null
 */
export function applyFloorOverlay(scene, floorId, width, height) {
  return null; // Disabled until per-floor overlays are properly tested
}
