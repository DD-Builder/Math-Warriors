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

import { createHeroCanvas, createHeroPartCanvas } from './legacyRenderer.js';
import { KNIGHTS, WIZARDS, BUNNIES } from '../data/heroArt.js';
import { applySpriteFilter } from '../systems/renderingFilters.js';
import { PAPER, PAPER_CSS } from '../config.js';
import { HeroAnimationSM } from '../systems/animationStateMachine.js';

// Lookup table: hero.id → art data (draw function, cardBg, topExt, botExt)
const ART_LOOKUP = {};
[...KNIGHTS, ...WIZARDS, ...BUNNIES].forEach(h => { ART_LOOKUP[h.id] = h; });

// Canvas cache — one per hero.id, created on first use
const CANVAS_CACHE = {};

// Default canvas dimensions for hero portraits
const HERO_W = 296;
const HERO_H = 384;

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
  const evolutionStage = opts.evolutionStage ?? 1;
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
      gfx.fillStyle(hero.displayColor || PAPER.teal, 1);
      gfx.fillRoundedRect(x - 40 * scale, y - 60 * scale, 80 * scale, 120 * scale, 8);
      return gfx;
    }
  }

  // If evolution stage >= 2, wrap in a container to add aura / particles
  if (evolutionStage >= 2) {
    const container = scene.add.container(x, y);
    const heroColor = hero.displayColor || PAPER.teal;

    // Stage 2+: aura ring behind sprite
    const auraRadius = 65 * scale;
    const aura = scene.add.circle(0, 0, auraRadius, heroColor, 0.15);
    container.add(aura);
    // Gentle pulse on the aura
    scene.tweens.add({
      targets: aura,
      scaleX: 1.12, scaleY: 1.12,
      alpha: 0.08,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    const img = scene.add.image(0, 0, textureKey);
    img.setScale(scale);
    img.setOrigin(0.5, 0.5);
    container.add(img);

    // Stage 3: orbiting particles
    if (evolutionStage >= 3) {
      const isLegendary = hero.trait && /legendary/i.test(hero.trait);
      const particleColor = isLegendary ? PAPER.gold : heroColor;
      const particleCount = 4;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const orbitR = 55 * scale;
        const px = Math.cos(angle) * orbitR;
        const py = Math.sin(angle) * orbitR * 0.6; // slight ellipse
        const particle = scene.add.circle(px, py, 3 * scale, particleColor, 0.7);
        container.add(particle);
        // Orbit by cycling through angles
        scene.tweens.add({
          targets: particle,
          angle: 360,
          duration: 3000 + i * 200,
          repeat: -1,
          ease: 'Linear',
          onUpdate: () => {
            const t = (Date.now() / (3000 + i * 200) + i / particleCount) * Math.PI * 2;
            particle.x = Math.cos(t) * orbitR;
            particle.y = Math.sin(t) * orbitR * 0.6;
          },
        });
      }
    }

    // Forward common image methods so call sites can treat container like an image
    container.setScale = function (s) {
      this.scaleX = s;
      this.scaleY = s;
      return this;
    };

    return container;
  }

  const img = scene.add.image(x, y, textureKey);
  img.setScale(scale);
  img.setOrigin(0.5, 0.5);
  return img;
}

/**
 * Get the cardBg color for a hero (for party select card backgrounds).
 */
function getHeroCardBg(heroId) {
  const art = ART_LOOKUP[heroId];
  return art ? art.cardBg : PAPER_CSS.creamD;
}

// ─── BODY PART SEED RANGES ─────────────────────────────────────
const BODY_PARTS = {
  legs:   [1, 2, 10, 11, 20, 21],
  torso:  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  armL:   [50, 51, 61, 62, 63],
  armR:   [52, 53, 54, 60, 64, 65],
  weapon: [80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
  head:   [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100],
};

/**
 * Create an animated hero sprite composed of separate body-part layers.
 * Returns a Phaser Container with .parts, .startWalk(), .stopWalk(),
 * and .playAttack(type) methods.
 *
 * Falls back to drawHeroSprite() if hero art is not found.
 */
export function createAnimatedHero(scene, x, y, hero, opts = {}) {
  const scale = opts.scale ?? 1;
  const art = ART_LOOKUP[hero.id];
  if (!art || !art.draw) return drawHeroSprite(scene, x, y, hero, opts);

  const w = HERO_W, h = HERO_H;
  const container = scene.add.container(x, y);

  const partOrder = ['legs', 'torso', 'armL', 'armR', 'weapon', 'head'];
  const parts = {};

  const floorId = opts.floorId || 1;

  for (let i = 0; i < partOrder.length; i++) {
    const partName = partOrder[i];
    const seeds = BODY_PARTS[partName];
    const key = `hero-${hero.id}-${partName}-f${floorId}`;

    if (!scene.textures.exists(key)) {
      const cv = createHeroPartCanvas(w, h, art.draw, art.topExt, art.botExt, seeds);
      // Check if canvas has any visible content — skip empty body parts
      // (e.g. a hero with no weapon would produce an empty weapon canvas)
      const checkCtx = cv.getContext('2d');
      const imgData = checkCtx.getImageData(0, 0, cv.width, cv.height);
      let hasContent = false;
      for (let p = 3; p < imgData.data.length; p += 4) {
        if (imgData.data[p] > 0) { hasContent = true; break; }
      }
      if (!hasContent) continue; // Skip empty body parts
      applySpriteFilter(cv, floorId);
      scene.textures.addCanvas(key, cv);
    }

    const img = scene.add.image(0, 0, key);
    img.setScale(scale);
    img.setOrigin(0.5, 0.5);
    img.setDepth(i);
    container.add(img);
    parts[partName] = img;
  }

  // Make container work as a drop-in replacement for hs.body
  container.body = container;

  // Animation state
  container.parts = parts;

  // Determine hero class for class-specific animations
  const heroClass = hero.cls || (hero.id?.includes('knight') ? 'knight' : hero.id?.includes('wizard') ? 'wizard' : 'bunny');

  // State machine (Phase 0A) — the canonical animation controller
  const sm = new HeroAnimationSM(parts, scene, heroClass, hero.id);
  container.stateMachine = sm;

  // Start in idle by default
  sm.transition('idle');

  // Backward-compatible thin wrappers over the state machine
  container.startWalk = function () {
    sm.transition('walk');
  };

  container.stopWalk = function () {
    sm.transition('idle');
  };

  container.playAttack = function (type, duration) {
    sm.transition('attack', { subtype: type, duration });
  };

  // New state machine methods exposed on the container for call sites
  container.setGuard = function () { sm.transition('guard'); };
  container.playHit = function (duration) { sm.transition('hit', { duration }); };
  container.playKO = function () { sm.transition('ko'); };
  container.playVictory = function () { sm.transition('victory'); };
  container.playCast = function () { sm.transition('cast'); };
  container.setSelectionSway = function () { sm.transition('selection-sway'); };
  container.setIdle = function () { sm.transition('idle'); };

  // Store base scales so the state machine can restore them
  Object.values(parts).forEach(part => {
    part._baseScaleX = part.scaleX;
    part._baseScaleY = part.scaleY;
  });

  // Clean up state machine on container destroy
  const origDestroy = container.destroy.bind(container);
  container.destroy = function () {
    sm.destroy();
    origDestroy();
  };

  return container;
}
