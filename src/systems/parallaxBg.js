/**
 * Parallax background system for battle scenes — papercut diorama aesthetic.
 *
 * Creates multi-layer diorama backgrounds with organic shapes, soft teal
 * shadows, and muted PAPER palette colors. No dark outlines.
 */

import { makeRng } from './rng.js';
import { PAPER, PAPER_SHADOW } from '../config.js';
import { FLOOR_PALETTES } from './papercut.js';
import {
  hillPoints, blobPoints, waveEdgePoints,
  drawShadowedPoly, drawShadowedBlob,
  drawPapercutTree, drawPapercutFlower, drawButterfly, drawLeafSprig,
} from './papercutArt.js';

// Layer depth configuration
const LAYER_CONFIG = [
  { name: 'sky',        depth: -10, parallax: 0.0  },
  { name: 'glow',       depth: -9,  parallax: 0.03 },
  { name: 'farHills',   depth: -8,  parallax: 0.12 },
  { name: 'midHills',   depth: -7,  parallax: 0.25 },
  { name: 'nearHills',  depth: -6,  parallax: 0.45 },
  { name: 'ground',     depth: -5,  parallax: 0.65 },
  { name: 'foreground', depth: -4,  parallax: 0.90 },
];

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

/**
 * Create a parallax background for a battle scene.
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

  // Clouds (organic blobs)
  const cloudCount = 4 + Math.floor(rng() * 3);
  for (let ci = 0; ci < cloudCount; ci++) {
    const cx = width * (0.05 + rng() * 0.9);
    const cy = height * (0.04 + rng() * 0.16);
    drawShadowedBlob(sky, cx, cy, 50 + rng() * 80, 14 + rng() * 10, pal.cloud, {
      seed: seed + ci * 17, wobble: 0.14, shadowAlpha: 0.1, shadowDy: 3,
    });
  }

  sky.setDepth(LAYER_CONFIG[0].depth);
  layers.push({ gfx: sky, baseX: 0, baseY: 0, ...LAYER_CONFIG[0] });

  // --- Layer 1: Glow ---
  const glow = scene.add.graphics();
  const glowCx = width * (0.45 + variant * 0.1);
  const glowCy = height * 0.30;
  const glowR = Math.min(width, height) * 0.55;

  for (let ring = 8; ring >= 1; ring--) {
    const r = glowR * (ring / 8);
    const alpha = pal.glowAlpha * (1 - ring / 10) * 0.95;
    glow.fillStyle(pal.skyGlow, alpha);
    glow.fillCircle(glowCx, glowCy, r);
  }
  // Paper rays — the reference's light-through-the-cuts fanning out
  glow.fillStyle(pal.skyGlow, pal.glowAlpha * 0.35);
  for (let ray = 0; ray < 10; ray++) {
    const ra = -Math.PI / 2 + (ray - 4.5) * 0.22;
    glow.beginPath();
    glow.moveTo(glowCx + Math.cos(ra - 0.028) * glowR * 0.25, glowCy + Math.sin(ra - 0.028) * glowR * 0.25);
    glow.lineTo(glowCx + Math.cos(ra - 0.008) * glowR * 1.35, glowCy + Math.sin(ra - 0.008) * glowR * 1.35);
    glow.lineTo(glowCx + Math.cos(ra + 0.008) * glowR * 1.35, glowCy + Math.sin(ra + 0.008) * glowR * 1.35);
    glow.lineTo(glowCx + Math.cos(ra + 0.028) * glowR * 0.25, glowCy + Math.sin(ra + 0.028) * glowR * 0.25);
    glow.closePath(); glow.fillPath();
  }
  glow.fillStyle(pal.glow, pal.glowAlpha * 0.6);
  glow.fillCircle(glowCx, glowCy, glowR * 0.15);
  glow.setDepth(LAYER_CONFIG[1].depth);
  layers.push({ gfx: glow, baseX: 0, baseY: 0, ...LAYER_CONFIG[1], glowCx, glowCy });

  // --- Layers 2-4: Hills (far, mid, near) ---
  const hillLayers = pal.layers.slice(0, 3);
  for (let li = 0; li < hillLayers.length; li++) {
    const layerDef = hillLayers[li];
    const layerIdx = li + 2;
    const config = LAYER_CONFIG[layerIdx];
    const hillGfx = scene.add.graphics();

    const baseY = height * (0.30 + li * 0.12);
    const peakH = height * layerDef.peakH * (1.1 + li * 0.1);

    // Use organic hillPoints from papercutArt
    const pts = hillPoints(-40, width + 40, baseY, height, {
      seed: seed + li * 13 + 7,
      amplitude: peakH,
    });
    drawShadowedPoly(hillGfx, pts, layerDef.color, {
      shadowDy: -6, shadowAlpha: 0.18,
    });

    // Striation cut-lines inside the sheet — the reference mountains'
    // internal texture (contour-following curves at whisper alpha).
    hillGfx.lineStyle(2, 0x1f3d3f, 0.08);
    for (let st = 1; st <= 2; st++) {
      hillGfx.beginPath();
      for (let pi2 = 0; pi2 < pts.length; pi2 += 2) {
        const px = pts[pi2].x, py = pts[pi2].y + st * (16 + li * 8) + Math.sin(pi2 * 0.4 + st) * 3;
        if (pi2 === 0) hillGfx.moveTo(px, py); else hillGfx.lineTo(px, py);
      }
      hillGfx.strokePath();
    }

    // Trees along the ridge (using papercutArt trees)
    const treeScales = [0.5, 0.8, 1.2];
    const treeCount = 3 + li * 2;
    const treeStyles = ['round', 'pine', 'sapling'];
    for (let ti = 0; ti < treeCount; ti++) {
      if (rng() < 0.25) continue;
      const tx = -20 + rng() * (width + 40);
      // Find approximate y along the hill
      const t = (tx + 40) / (width + 80);
      const idx = Math.floor(t * (pts.length - 3));
      const treeBaseY = pts[Math.min(idx, pts.length - 3)]?.y ?? baseY;
      const th = (20 + rng() * 30) * treeScales[li];
      drawPapercutTree(hillGfx, tx, treeBaseY, th, {
        seed: seed + li * 100 + ti * 31,
        style: treeStyles[ti % 3],
        canopy: layerDef.color,
        trunk: PAPER.creamD,
        shadowAlpha: 0.15,
      });
    }

    // Accent flowers on nearer hills
    if (li >= 1) {
      const flowerCount = 2 + li * 2;
      for (let f = 0; f < flowerCount; f++) {
        const fx = rng() * width;
        const fIdx = Math.floor(rng() * (pts.length - 3));
        const fy = (pts[fIdx]?.y ?? baseY) + 5 + rng() * 15;
        drawPapercutFlower(hillGfx, fx, fy, 3 + rng() * 3, {
          seed: seed + li * 200 + f * 7,
          color: pal.accent, center: PAPER.gold,
        });
      }
    }

    hillGfx.setDepth(config.depth);
    layers.push({ gfx: hillGfx, baseX: 0, baseY: 0, ...config });
  }

  // --- Layer 5: Ground plane ---
  const ground = scene.add.graphics();
  const groundY = height * 0.62;

  // Ground as an organic hill
  const groundPts = hillPoints(-40, width + 40, groundY, height + 40, {
    seed: seed + 99, amplitude: 8,
  });
  drawShadowedPoly(ground, groundPts, pal.ground, {
    shadowDy: -5, shadowAlpha: 0.18,
  });

  // Tonal depth strata — two soft darker wave bands across the ground
  // give the papercut layered-depth read. (Replaces the old cream
  // "path" stripe, which cut across the hills like a stray light beam.)
  for (const [f, alpha] of [[0.30, 0.05], [0.62, 0.07]]) {
    const bandY = groundY + (height - groundY) * f;
    const bandPts = waveEdgePoints(-40, width + 40, bandY, {
      seed: seed + 150 + Math.floor(f * 100), amplitude: 12,
    });
    ground.fillStyle(0x1f2828, alpha);
    ground.beginPath();
    ground.moveTo(bandPts[0].x, bandPts[0].y);
    for (const p of bandPts) ground.lineTo(p.x, p.y);
    ground.lineTo(width + 40, height + 40);
    ground.lineTo(-40, height + 40);
    ground.closePath();
    ground.fillPath();
  }

  // Scattered flowers and leaf sprigs on ground
  for (let i = 0; i < 8; i++) {
    const fx = rng() * width;
    const fy = groundY + 5 + rng() * 30;
    drawPapercutFlower(ground, fx, fy, 3 + rng() * 4, {
      seed: seed + 300 + i * 11,
      color: pal.accent, center: PAPER.gold,
      stem: 4 + rng() * 4, stemColor: PAPER.leaf,
    });
  }

  ground.setDepth(LAYER_CONFIG[5].depth);
  layers.push({ gfx: ground, baseX: 0, baseY: 0, ...LAYER_CONFIG[5], groundY });

  // --- Layer 6: Foreground framing ---
  const fg = scene.add.graphics();

  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? -10 : width - 100;

    // Trees at edges
    for (let ti = 0; ti < 2; ti++) {
      const tx = baseX + 20 + rng() * 60;
      const th = 100 + rng() * 80;
      drawPapercutTree(fg, tx, groundY + 30, th, {
        seed: seed + side * 500 + ti * 37,
        style: ti % 2 === 0 ? 'round' : 'pine',
        canopy: pal.trees,
        canopyHi: pal.treesL,
        trunk: PAPER.creamD,
      });
    }

    // Leaf sprigs
    for (let si = 0; si < 3; si++) {
      drawLeafSprig(fg, baseX + 15 + rng() * 80, groundY + 10 + rng() * 40,
        18 + rng() * 15, {
          seed: seed + side * 600 + si * 19,
          color: PAPER.leaf,
          angle: (rng() - 0.5) * 0.8,
        });
    }

    // Flowers
    for (let fi = 0; fi < 4; fi++) {
      drawPapercutFlower(fg, baseX + 20 + rng() * 70, groundY + 5 + rng() * 50,
        4 + rng() * 5, {
          seed: seed + side * 700 + fi * 13,
          color: pal.accent, center: PAPER.gold,
          stem: 5 + rng() * 6, stemColor: PAPER.leaf,
        });
    }
  }

  // Butterflies floating
  for (let bi = 0; bi < 3; bi++) {
    const bx = width * (0.15 + rng() * 0.7);
    const by = height * (0.2 + rng() * 0.3);
    drawButterfly(fg, bx, by, 6 + rng() * 5, {
      seed: seed + 800 + bi * 29,
      color: PAPER.white,
      accent: pal.accent,
    });
  }

  // Dark organic corner masses — the reference's botanical framing
  // holding the luminous scene from the bottom corners.
  for (const side of [0, 1]) {
    const bx = side === 0 ? 0 : width;
    const dir = side === 0 ? 1 : -1;
    fg.fillStyle(0x22403f, 0.18);
    fg.fillEllipse(bx + dir * 40, height - 26, 230, 116);
    fg.fillEllipse(bx + dir * 105, height - 66, 150, 84);
    fg.fillStyle(0x22403f, 0.11);
    fg.fillEllipse(bx + dir * 62, height - 122, 124, 62);
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
        const colors = [PAPER.leaf, PAPER.sage, PAPER.gold];
        const leaf = scene.add.circle(x, y, 3 + Math.random() * 3,
          colors[Math.floor(Math.random() * 3)], 0.6);
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
        const bubble = scene.add.circle(x, y, 2 + Math.random() * 3, PAPER.sky, 0.5);
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
        const wisp = scene.add.circle(x, y, 8 + Math.random() * 12, PAPER.white, 0.2);
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
        const colors = [PAPER.orange, PAPER.gold, PAPER.coral];
        const ember = scene.add.circle(x, y, 2 + Math.random() * 2,
          colors[Math.floor(Math.random() * 3)], 0.6);
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
        const snow = scene.add.circle(x, y, 2 + Math.random() * 2, PAPER.white, 0.5);
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
  // Floors 6-9: gentle cream sparkles
  return {
    spawnDelay: 1000,
    spawn: (scene, state) => {
      const x = Math.random() * width;
      const y = Math.random() * groundY;
      const sparkle = scene.add.circle(x, y, 2, PAPER.cream, 0.3);
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
