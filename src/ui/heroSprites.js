/**
 * Hero sprite renderer — canvas-to-Phaser bridge.
 *
 * Pre-renders each hero onto an offscreen canvas using the legacy
 * makeRenderer system (bezier curves, gradient shadows, multi-layer
 * wobble polygons), then loads the result as a Phaser texture.
 * Subsequent calls for the same hero.id reuse the cached texture.
 *
 * Usage:
 *   import { drawHeroSprite } from '../ui/heroSprites.js';
 *   const image = drawHeroSprite(scene, x, y, hero, { scale: 1 });
 */

import { createHeroCanvas } from './legacyRenderer.js';
import { KNIGHTS, WIZARDS, BUNNIES } from '../data/heroArt.js';

// Lookup table: hero.id → art data (draw function, cardBg, topExt, botExt)
const ART_LOOKUP = {};
[...KNIGHTS, ...WIZARDS, ...BUNNIES].forEach(h => { ART_LOOKUP[h.id] = h; });

// Canvas cache — one per hero.id, created on first use
const CANVAS_CACHE = {};

// Default canvas dimensions for hero portraits
const HERO_W = 148;
const HERO_H = 192;

function getHeroCanvas(hero) {
  const id = hero.id;
  if (CANVAS_CACHE[id]) return CANVAS_CACHE[id];

  const art = ART_LOOKUP[id];
  if (!art || !art.draw) return null;

  const cv = createHeroCanvas(HERO_W, HERO_H, null, art.draw, art.topExt, art.botExt);
  CANVAS_CACHE[id] = cv;
  return cv;
}

/**
 * Draw a hero sprite at (x, y) in the given scene.
 * Returns a Phaser Image game object.
 *
 * On first call for a given hero.id, pre-renders to an offscreen
 * canvas and registers it as a Phaser texture. Subsequent calls
 * reuse the cached texture.
 */
export function drawHeroSprite(scene, x, y, hero, opts = {}) {
  const scale = opts.scale ?? 1;
  const id = hero.id;
  const textureKey = 'hero-' + id;

  // Register texture if not already cached
  if (!scene.textures.exists(textureKey)) {
    const cv = getHeroCanvas(hero);
    if (cv) {
      scene.textures.addCanvas(textureKey, cv);
    } else {
      // Fallback: colored rectangle if no art exists
      const gfx = scene.add.graphics();
      gfx.fillStyle(hero.displayColor || 0x2e4e88, 1);
      gfx.fillRoundedRect(x - 40 * scale, y - 60 * scale, 80 * scale, 120 * scale, 8);
      return gfx;
    }
  }

  const img = scene.add.image(x, y, textureKey);
  img.setScale(scale);
  img.setOrigin(0.5, 0.5);
  return img;
}

/**
 * Get the cardBg color for a hero (for party select card backgrounds).
 */
export function getHeroCardBg(heroId) {
  const art = ART_LOOKUP[heroId];
  return art ? art.cardBg : '#181828';
}
