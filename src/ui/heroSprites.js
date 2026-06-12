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
import { CharacterRig } from '../systems/characterRig.js';
import { getEquipmentOverlay, applyEquipmentOverlays, getTierIndex } from './equipmentOverlays.js';
import { getEquipmentById } from '../systems/equipment.js';

// Lookup table: hero.id → art data (draw function, cardBg, topExt, botExt)
const ART_LOOKUP = {};
[...KNIGHTS, ...WIZARDS, ...BUNNIES].forEach(h => { ART_LOOKUP[h.id] = h; });

// Canvas cache — one per hero.id, created on first use
const CANVAS_CACHE = {};

// Whether a hero body part produced any visible pixels — computed once
// per hero+part, so repeat createAnimatedHero calls skip getImageData.
const PART_HAS_CONTENT = {};

// Default canvas dimensions for hero portraits
const HERO_W = 296;
const HERO_H = 384;

// Equipment slot → body part the overlay is drawn on, and key codes
const PART_TO_SLOT = { weapon: 'weapon', torso: 'armor', head: 'accessory' };
const SLOT_CODE = { weapon: 'w', armor: 'a', accessory: 'c' };

function getHeroClass(hero) {
  return hero.cls || (hero.id?.includes('knight') ? 'knight' : hero.id?.includes('wizard') ? 'wizard' : 'bunny');
}

/**
 * Normalize opts.equipment into resolved equipment items per slot.
 * Accepts the save-file shape (item-id strings per slot, e.g.
 * save.equipment.hero0 = { weapon: 'iron_sword', ... }) or already
 * resolved { id, tier } objects. Returns null when nothing is equipped.
 */
function resolveEquipment(equipment) {
  if (!equipment) return null;
  const resolved = {};
  let any = false;
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const val = equipment[slot];
    if (!val) continue;
    const item = typeof val === 'string' ? getEquipmentById(val) : val;
    if (!item || !item.tier) continue;
    resolved[slot] = item;
    any = true;
  }
  return any ? resolved : null;
}

/**
 * Texture-key suffix encoding equipment identity, e.g. '-e123' for
 * tier-1 weapon, tier-2 armor, tier-3 accessory ('' when unequipped).
 * Without this, the first-equipped render would be cached and reused
 * for unequipped heroes (and vice versa).
 */
function equipmentKeySuffix(equipment) {
  if (!equipment) return '';
  const t = slot => (equipment[slot] ? getTierIndex(equipment[slot].tier) : 0);
  return `-e${t('weapon')}${t('armor')}${t('accessory')}`;
}

/**
 * Hero art-space geometry for a canvas of (w, h): the anchor point and
 * scale the hero draw function was invoked with. Must mirror
 * legacyRenderer's createHeroCanvas / createHeroPartCanvas math so
 * overlays land on the hero, not at arbitrary canvas coordinates.
 */
function heroArtGeometry(w, h, art, defTop, defBot) {
  const te = art.topExt || defTop, be = art.botExt || defBot;
  const sc = (h - 14) / (te + be) * 0.89;
  return { cx: w * 0.5, cy: 7 + te * sc, sc };
}

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
  const equipment = resolveEquipment(opts.equipment);
  // Equipment identity is part of the key so equipped/unequipped renders
  // never share a cached texture.
  const textureKey = 'hero-' + id + equipmentKeySuffix(equipment);

  // Register texture if not already cached
  if (!scene.textures.exists(textureKey)) {
    let cv = getHeroCanvas(hero);
    if (cv) {
      if (equipment) {
        // Draw overlays on a CLONE — CANVAS_CACHE canvases are shared
        // across call sites, so mutating them would leak equipment
        // visuals onto every later unequipped render of this hero.
        const clone = document.createElement('canvas');
        clone.width = cv.width;
        clone.height = cv.height;
        clone.getContext('2d').drawImage(cv, 0, 0);
        const art = ART_LOOKUP[id];
        applyEquipmentOverlays(clone, equipment, getHeroClass(hero),
          heroArtGeometry(cv.width, cv.height, art, 80, 78));
        cv = clone;
      }
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
    container.setTint = function (color) { img.setTint(color); return this; };
    container.clearTint = function () { img.clearTint(); return this; };
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
// Split legs into left/right for articulated walking animation.
const BODY_PARTS = {
  leftLeg:  [1, 2, 10],
  rightLeg: [11, 20, 21],
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

  const partOrder = ['leftLeg', 'rightLeg', 'torso', 'armL', 'armR', 'weapon', 'head'];
  const parts = {};

  const floorId = opts.floorId || 1;
  const heroClass = getHeroClass(hero);
  const equipment = resolveEquipment(opts.equipment);

  for (let i = 0; i < partOrder.length; i++) {
    const partName = partOrder[i];
    const seeds = BODY_PARTS[partName];

    // Pixel-content check is expensive (full-canvas getImageData) —
    // cache the answer per hero+part so repeat battles don't re-read.
    // Overlays only ever decorate parts that already have content, so
    // this cache stays valid regardless of equipment.
    const contentKey = `${hero.id}-${partName}`;
    if (PART_HAS_CONTENT[contentKey] === false) continue;

    // Equipment overlay for this part (weapon → weapon, armor → torso,
    // accessory → head). The texture key carries the slot+tier identity
    // so equipped/unequipped renders never share a cached texture; parts
    // without an overlay keep their pre-equipment keys.
    const slot = PART_TO_SLOT[partName];
    const equipped = equipment && slot ? equipment[slot] : null;
    const overlay = equipped ? getEquipmentOverlay(equipped.id, equipped.tier, slot) : null;
    const equipSuffix = overlay ? `-e${SLOT_CODE[slot]}${getTierIndex(equipped.tier)}` : '';
    const key = `hero-${hero.id}-${partName}-f${floorId}${equipSuffix}`;

    if (!scene.textures.exists(key)) {
      // createHeroPartCanvas returns a FRESH canvas per call (it is not
      // shared like CANVAS_CACHE), so filtering and overlay-drawing on
      // it directly is safe.
      const cv = createHeroPartCanvas(w, h, art.draw, art.topExt, art.botExt, seeds);
      if (PART_HAS_CONTENT[contentKey] === undefined) {
        // Check if canvas has any visible content — skip empty body parts
        // (e.g. a hero with no weapon would produce an empty weapon canvas)
        const checkCtx = cv.getContext('2d');
        const imgData = checkCtx.getImageData(0, 0, cv.width, cv.height);
        let hasContent = false;
        for (let p = 3; p < imgData.data.length; p += 4) {
          if (imgData.data[p] > 0) { hasContent = true; break; }
        }
        PART_HAS_CONTENT[contentKey] = hasContent;
        if (!hasContent) continue;
      }
      applySpriteFilter(cv, floorId);
      if (overlay) {
        const geom = heroArtGeometry(w, h, art, 60, 60);
        overlay.draw(cv.getContext('2d'), geom.cx, geom.cy, geom.sc, heroClass);
      }
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

  // Phaser Containers have no tint API, but ~60 attack-animation call
  // sites do body.setTint()/clearTint() on hero sprites. Without these,
  // the first hero attack throws inside Phaser's RAF callback and the
  // game loop dies PERMANENTLY (the historical "battle freeze"). Fan
  // tint out to the part images instead.
  container.setTint = function (color) {
    Object.values(parts).forEach(p => { if (p && p.setTint) p.setTint(color); });
    return this;
  };
  container.clearTint = function () {
    Object.values(parts).forEach(p => { if (p && p.clearTint) p.clearTint(); });
    return this;
  };

  // Store base scales so the state machine can restore them
  Object.values(parts).forEach(part => {
    part._baseScaleX = part.scaleX;
    part._baseScaleY = part.scaleY;
  });

  // Skeletal rig — joint-rotation animation on the body-part textures.
  // Each part rotates around its pivot point for articulated movement.
  const rig = new CharacterRig(parts, scene);
  container.rig = rig;

  // State machine — drives the rig via named animations
  const sm = new HeroAnimationSM(parts, scene, heroClass, hero.id);
  sm.rig = rig;
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


  // Evolution visuals — callers pass evolutionStage; honor it the same
  // way drawHeroSprite does so evolved heroes look evolved EVERYWHERE
  // (battle, party select, gallery), not just in the ceremony.
  const evolutionStage = opts.evolutionStage ?? 1;
  if (evolutionStage >= 2) {
    const heroColor = hero.displayColor || PAPER.teal;
    const aura = scene.add.circle(0, 20 * scale, 70 * scale, heroColor, 0.14);
    container.addAt(aura, 0); // behind all body parts
    scene.tweens.add({
      targets: aura, scaleX: 1.12, scaleY: 1.12, alpha: 0.07,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    if (evolutionStage >= 3) {
      for (let pi = 0; pi < 4; pi++) {
        const orbitR = 60 * scale;
        const particle = scene.add.circle(0, 0, 3 * scale, PAPER.gold, 0.7);
        container.add(particle);
        const phase = (pi / 4) * Math.PI * 2;
        const proxy = { t: 0 };
        scene.tweens.add({
          targets: proxy, t: Math.PI * 2, duration: 3200 + pi * 180,
          repeat: -1, ease: 'Linear',
          onUpdate: () => {
            particle.x = Math.cos(proxy.t + phase) * orbitR;
            particle.y = Math.sin(proxy.t + phase) * orbitR * 0.55 + 10 * scale;
          },
        });
      }
    }
  }

  // Clean up state machine on container destroy.
  // CRITICAL: clear the body self-reference first — Phaser's destroy()
  // calls this.body.destroy() when .body is set, and since body IS this
  // container that recurses infinitely and crashes scene shutdown.
  const origDestroy = container.destroy.bind(container);
  container.destroy = function (fromScene) {
    if (this._destroyed) return;
    this._destroyed = true;
    sm.destroy();
    this.body = undefined;
    origDestroy(fromScene);
  };

  return container;
}
