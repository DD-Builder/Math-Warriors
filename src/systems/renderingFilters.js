/**
 * Per-floor rendering filters
 *
 * Each floor gets a distinct visual style:
 * Floor 1 (Garden): Papercut — baseline, no filter needed
 * Floor 2 (Tidepool): Claymation — matte, fingerprint texture, slight wobble
 * Floor 3 (Cloud): Watercolor — soft edges, paper grain, pencil outlines
 * Floor 4 (Ember): Pixel art — pixelated, limited palette, hard edges
 * Floor 5 (Mending): Cinematic papercut — dark, high contrast, cool tint
 * Floors 6-9: Variations of papercut with unique color grading
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
 * Claymation filter — makes sprites look like clay/stop-motion.
 * Reduces saturation 15%, adds subtle noise (+-3 per channel),
 * and slightly increases contrast.
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

    // Reduce saturation by 15% (matte look)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = r + (gray - r) * 0.15;
    g = g + (gray - g) * 0.15;
    b = b + (gray - b) * 0.15;

    // Add subtle noise: +-3 per channel
    r += (Math.random() - 0.5) * 6;
    g += (Math.random() - 0.5) * 6;
    b += (Math.random() - 0.5) * 6;

    // Slightly increase contrast (move away from 128 midpoint)
    const contrastFactor = 1.08;
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Clamp and store
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Watercolor filter — makes sprites look like watercolor painting.
 * Reduces saturation 25% (pastel), reduces alpha 10% (translucent),
 * adds warm tint (+8 R, +4 G), and paper grain noise (+-5 per channel).
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
    let a = data[i + 3];
    // Skip fully transparent pixels
    if (a === 0) continue;

    // Reduce saturation by 25% (pastel look)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = r + (gray - r) * 0.25;
    g = g + (gray - g) * 0.25;
    b = b + (gray - b) * 0.25;

    // Reduce alpha by 10% (translucent watercolor)
    a = a * 0.9;

    // Add warm tint (+8 to R, +4 to G)
    r += 8;
    g += 4;

    // Paper grain noise: +-5 per channel
    r += (Math.random() - 0.5) * 10;
    g += (Math.random() - 0.5) * 10;
    b += (Math.random() - 0.5) * 10;

    // Clamp and store
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    data[i + 3] = Math.max(0, Math.min(255, Math.round(a)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Pixel art filter — makes sprites look pixelated with a limited palette.
 * Downsamples to a smaller canvas and scales back up with nearest-neighbor,
 * then quantizes colors to a 16-color palette (each channel snapped to
 * nearest 17-step value: 0, 17, 34, ..., 255).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} [pixelSize=4] - Size of each "pixel block"
 * @returns {HTMLCanvasElement}
 */
function pixelArtFilter(canvas, pixelSize = 4) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Step 1: Create small temporary canvas (downsampled)
  const smallW = Math.max(1, Math.ceil(w / pixelSize));
  const smallH = Math.max(1, Math.ceil(h / pixelSize));
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = smallW;
  tempCanvas.height = smallH;
  const tempCtx = tempCanvas.getContext('2d');

  // Step 2: Draw original onto small canvas (downsampling)
  tempCtx.drawImage(canvas, 0, 0, smallW, smallH);

  // Step 3: Clear original canvas
  ctx.clearRect(0, 0, w, h);

  // Step 4: Disable smoothing for nearest-neighbor upscaling
  ctx.imageSmoothingEnabled = false;

  // Step 5: Draw small canvas back at full size (nearest-neighbor upscaling)
  ctx.drawImage(tempCanvas, 0, 0, w, h);

  // Step 6: Quantize colors to 16-color palette per channel
  // Each channel snapped to nearest multiple of 17 (0, 17, 34, ..., 255)
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i]     = Math.round(data[i] / 17) * 17;
    data[i + 1] = Math.round(data[i + 1] / 17) * 17;
    data[i + 2] = Math.round(data[i + 2] / 17) * 17;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Cinematic filter — makes sprites look dramatic/cinematic.
 * Increases contrast 20%, adds cool tint (+5 B, -3 R),
 * and darkens overall by 10%.
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

    // Increase contrast by 20% (multiply distance from 128)
    const contrastFactor = 1.2;
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Add cool tint (+5 to B, -3 from R)
    r -= 3;
    b += 5;

    // Darken overall by 10% (multiply all channels by 0.9)
    r *= 0.9;
    g *= 0.9;
    b *= 0.9;

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
