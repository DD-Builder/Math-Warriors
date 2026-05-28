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

// Layer depth configuration
// parallax: 0.0 = static (sky), 1.0 = moves with camera (foreground)
const LAYER_CONFIG = [
  { name: 'sky',        depth: 0,  parallax: 0.0  },
  { name: 'glow',       depth: 1,  parallax: 0.03 },
  { name: 'farHills',   depth: 2,  parallax: 0.12 },
  { name: 'midHills',   depth: 3,  parallax: 0.25 },
  { name: 'nearHills',  depth: 4,  parallax: 0.45 },
  { name: 'ground',     depth: 5,  parallax: 0.65 },
  { name: 'foreground', depth: 6,  parallax: 0.90 },
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

function drawShadowedLayer(gfx, points, color, shadowColor, closeBottom, bottomY) {
  if (shadowColor) {
    const shadow = points.map(p => ({ x: p.x + 3, y: p.y + 6 }));
    fillShape(gfx, shadow, shadowColor, 0.4, closeBottom, bottomY + 6);
  }
  fillShape(gfx, points, color, 1, closeBottom, bottomY);
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

  // --- Layer 0: Sky ---
  const sky = scene.add.graphics();
  sky.fillStyle(pal.sky, 1);
  sky.fillRect(-40, -40, width + 80, height + 80);
  sky.setDepth(LAYER_CONFIG[0].depth);
  layers.push({ gfx: sky, baseX: 0, baseY: 0, ...LAYER_CONFIG[0] });

  // --- Layer 1: Glow / Celestial body ---
  const glow = scene.add.graphics();
  const glowCx = width * (0.45 + variant * 0.1);
  const glowCy = height * 0.30;
  const glowR = Math.min(width, height) * 0.65;

  for (let ring = 10; ring >= 1; ring--) {
    const r = glowR * (ring / 10);
    const alpha = pal.glowAlpha * (1 - ring / 12) * 0.6;
    glow.fillStyle(pal.skyGlow, alpha);
    glow.fillCircle(glowCx, glowCy, r);
  }
  glow.fillStyle(pal.glow, pal.glowAlpha * 0.5);
  glow.fillCircle(glowCx, glowCy, glowR * 0.12);
  glow.fillStyle(pal.glow, pal.glowAlpha * 0.25);
  glow.fillCircle(glowCx, glowCy, glowR * 0.25);
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

    const baseY = height * (0.38 + li * 0.12);
    const peakH = height * layerDef.peakH * (1.1 + li * 0.1);
    let pts;

    if (floorId === 3) {
      pts = generateCloudPlatformPoints(-40, width + 40, baseY, peakH, layerDef.peaks + 1, rng);
    } else if (floorId === 5 || floorId === 6) {
      pts = generateCrystalPoints(-40, width + 40, baseY, peakH, layerDef.peaks + 2, rng);
    } else {
      pts = hillGen(-40, width + 40, baseY, peakH, layerDef.peaks, rng, 3 + li * 2);
    }

    drawShadowedLayer(hillGfx, pts, layerDef.color, layerDef.shadow, true, height);

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
  const groundY = height * 0.72;
  const perspectiveExpand = 60;

  // Trapezoid: wider at bottom for perspective
  ground.fillStyle(pal.ground, 1);
  ground.beginPath();
  ground.moveTo(-20, groundY);
  ground.lineTo(width + 20, groundY);
  ground.lineTo(width + 20 + perspectiveExpand, height + 40);
  ground.lineTo(-20 - perspectiveExpand, height + 40);
  ground.closePath();
  ground.fillPath();

  // Ground texture (floor-specific)
  if (floorId === 1) {
    // Grass texture strips
    for (let gi = 0; gi < 6; gi++) {
      const gy = groundY + 8 + gi * 18;
      ground.fillStyle(pal.trees, 0.12 + gi * 0.02);
      ground.fillRect(-20, gy, width + 40, 4);
    }
  } else if (floorId === 2) {
    // Sand strip at shore
    ground.fillStyle(0xd0b880, 0.7);
    ground.fillRect(-20, groundY - 2, width + 40, 10);
    // Wave foam
    for (let wi = 0; wi < 15; wi++) {
      ground.fillStyle(0xe0f0f8, 0.4);
      ground.fillCircle(rng() * width, groundY + 3, 3 + rng() * 4);
    }
  } else if (floorId === 3) {
    // Cloud platform edge
    for (let ci = 0; ci < 10; ci++) {
      ground.fillStyle(0xd8e8f0, 0.5);
      ground.fillCircle(rng() * width, groundY + 2, 25 + rng() * 15);
    }
  } else if (floorId === 4) {
    // Volcanic rock texture + lava glow from below
    const rockPts = generateVolcanicPeakPoints(-20, width + 40, groundY, 8, 12, rng, 1);
    fillShape(ground, rockPts, 0x3a2010, 1, true, height);
    ground.fillStyle(0xff4010, 0.06);
    ground.fillRect(-20, groundY + 10, width + 40, height - groundY);
  } else if (floorId === 5) {
    // Ice surface with cracks
    ground.fillStyle(0xd0e8f0, 0.3);
    ground.fillRect(-20, groundY, width + 40, 6);
    for (let ic = 0; ic < 5; ic++) {
      const icx = rng() * width;
      ground.lineStyle(1, 0xa0c8e0, 0.3);
      ground.beginPath();
      ground.moveTo(icx, groundY + 2);
      ground.lineTo(icx + (rng() - 0.5) * 40, groundY + 15 + rng() * 20);
      ground.strokePath();
    }
  }

  ground.setDepth(LAYER_CONFIG[5].depth);
  layers.push({ gfx: ground, baseX: 0, baseY: 0, ...LAYER_CONFIG[5], groundY });

  // --- Layer 6: Foreground framing elements ---
  const fg = scene.add.graphics();

  if (floorId === 1) {
    // Grass tufts and flower silhouettes at bottom corners
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -10 : width - 60;
      for (let g = 0; g < 6; g++) {
        const gx = baseX + rng() * 80;
        const gy = height - 80 - rng() * 60;
        const gh = 20 + rng() * 30;
        fg.fillStyle(pal.trees, 0.5 + rng() * 0.3);
        fg.fillTriangle(gx, gy, gx - 3, gy + gh, gx + 3, gy + gh);
      }
      // Flowers
      for (let f = 0; f < 3; f++) {
        const fx = baseX + 10 + rng() * 60;
        const fy = height - 90 - rng() * 50;
        fg.fillStyle(pal.accent, 0.5 + rng() * 0.3);
        fg.fillCircle(fx, fy, 4 + rng() * 4);
      }
    }
  } else if (floorId === 2) {
    // Coral branches at sides
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 40;
      for (let c = 0; c < 4; c++) {
        const cx = baseX + rng() * 50;
        const cy = height - 60 - rng() * 80;
        fg.fillStyle(pal.accent, 0.4 + rng() * 0.3);
        fg.fillCircle(cx, cy, 6 + rng() * 8);
        fg.fillCircle(cx + rng() * 10, cy - 10, 4 + rng() * 5);
      }
    }
  } else if (floorId === 4) {
    // Stalactites at top
    for (let s = 0; s < 5; s++) {
      const sx = rng() * width;
      const sh = 30 + rng() * 50;
      fg.fillStyle(0x2a1808, 0.6);
      fg.fillTriangle(sx - 8, 0, sx + 8, 0, sx + (rng() - 0.5) * 4, sh);
    }
    // Lava edge glow at bottom
    fg.fillStyle(0xe04010, 0.15);
    fg.fillRect(-20, height - 40, width + 40, 50);
  } else if (floorId === 5) {
    // Ice crystal formations at corners
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -5 : width - 30;
      for (let c = 0; c < 3; c++) {
        const cx = baseX + rng() * 40;
        const cy = rng() * height * 0.3;
        const ch = 15 + rng() * 25;
        fg.fillStyle(0xc0e0f0, 0.3 + rng() * 0.2);
        fg.fillTriangle(cx - 4, cy + ch, cx + 4, cy + ch, cx + (rng() - 0.5) * 3, cy);
      }
    }
  }

  fg.setDepth(LAYER_CONFIG[6].depth);
  layers.push({ gfx: fg, baseX: 0, baseY: 0, ...LAYER_CONFIG[6] });

  // --- Vignette frame ---
  const vignette = scene.add.graphics();
  const vw = 70;
  vignette.fillStyle(0x1a0e04, 0.4);
  vignette.fillRect(0, 0, vw, height);
  vignette.fillRect(width - vw, 0, vw, height);
  vignette.fillRect(0, 0, width, vw * 0.6);
  // Gradient fade on edges
  for (let gi = 0; gi < 5; gi++) {
    const ga = 0.3 * (1 - gi / 5);
    vignette.fillStyle(0x1a0e04, ga);
    vignette.fillRect(vw + gi * 10, 0, 10, height);
    vignette.fillRect(width - vw - (gi + 1) * 10, 0, 10, height);
  }
  vignette.setDepth(8);
  layers.push({ gfx: vignette, baseX: 0, baseY: 0, name: 'vignette', depth: 8, parallax: 0 });

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
        leaf.setDepth(7);
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
        bubble.setDepth(7);
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
        wisp.setDepth(7);
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
        ember.setDepth(7);
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
        snow.setDepth(7);
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
      sparkle.setDepth(7);
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
