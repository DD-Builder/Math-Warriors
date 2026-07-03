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

import { createHeroCanvas, createHeroPartCanvas, createHeroPartCanvasClipped } from './legacyRenderer.js';
import { KNIGHTS, WIZARDS, BUNNIES } from '../data/heroArt.js';
import { applySpriteFilter } from '../systems/renderingFilters.js';
import { PAPER, PAPER_CSS } from '../config.js';
import { drawSkinnedHero } from './skinnedHero.js';
import { getCycle, sampleCycle, cycleDone } from '../systems/poseAnimator.js';
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

// ─── POSE-DRIVEN ANIMATED HERO ─────────────────────────────────
//
// Characters are DRAWN each frame from a pose (joint angles) by the
// parametric character model — never assembled from pre-cut image
// pieces. Limbs are single connected shapes through their joints, so
// knees and elbows genuinely bend and nothing can ever detach.
//
// The container keeps the same API the whole game already calls:
//   startWalk/stopWalk/playAttack/setGuard/playHit/playKO/
//   playVictory/playCast/setSelectionSway/setIdle/setTint/clearTint

let NEXT_HERO_UID = 1;

// States whose final pose should be HELD after the cycle completes
const HOLD_STATES = new Set(['guard', 'ko', 'victory']);

/**
 * Create an animated hero. Returns a Phaser Container that renders the
 * hero from live poses at ~25fps (a deliberate, papercut stop-motion
 * cadence). Falls back to drawHeroSprite() if the hero is unknown.
 */
export function createAnimatedHero(scene, x, y, hero, opts = {}) {
  const scale = opts.scale ?? 1;
  const heroClass = getHeroClass(hero);
  const art = ART_LOOKUP[hero.id];
  if (!art || !art.draw) return drawHeroSprite(scene, x, y, hero, opts);

  const container = scene.add.container(x, y);

  // Per-instance canvas → Phaser texture
  const cw = HERO_W, ch = HERO_H;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const texKey = `heroPose-${hero.id}-${NEXT_HERO_UID++}`;
  const tex = scene.textures.addCanvas(texKey, cv);
  const img = scene.add.image(0, 0, texKey);
  img.setOrigin(0.5, 0.5);
  img.setScale(scale);
  container.add(img);

  // Same placement math as the static portraits, so the animated hero
  // is pixel-compatible with every scene's existing scale factor.
  const geom = heroArtGeometry(cw, ch, art, 80, 78);

  // ── animation state ──
  const state = {
    name: 'idle',
    cycle: getCycle(heroClass, 'idle'),
    view: 'front',   // 'front' | 'side'
    hold: false,
    elapsed: 0,
  };

  function render() {
    // Guard against post-destroy calls: scene tweens (e.g. a cutscene
    // walk tween's onComplete) can fire stopWalk() after this hero and
    // its canvas texture are gone — refreshing a dead texture kills
    // Phaser's render loop.
    if (container._destroyed || !scene.textures || !scene.textures.exists(texKey)) return;
    ctx.clearRect(0, 0, cw, ch);
    const pose = sampleCycle(state.cycle, state.elapsed);
    drawSkinnedHero(cv, art, heroClass, pose, geom);
    tex.refresh();
  }

  function setState(name, o = {}) {
    if (container._destroyed) return;
    state.name = name;
    state.cycle = getCycle(heroClass, name === 'sway' ? 'sway' : name);
    state.elapsed = 0;
    state.hold = o.hold ?? HOLD_STATES.has(name);
    if (o.view) state.view = o.view;
    render();
  }

  const FRAME_MS = 40; // 25fps
  container._timescale = 1;
  const timer = scene.time.addEvent({
    delay: FRAME_MS, loop: true,
    callback: () => {
      if (container._destroyed) return;
      // _timescale < 1 slows playback so battle attacks are readable.
      state.elapsed += FRAME_MS * (container._timescale || 1);
      if (!state.cycle.loop && cycleDone(state.cycle, state.elapsed)) {
        if (!state.hold) { setState('idle', { view: 'front' }); return; }
      }
      render();
    },
  });
  // Battle uses this to stretch an attack out (e.g. 0.55 → ~1.8x longer),
  // then restores to 1 so idle/walk stay at normal speed.
  container.setTimescale = function (m) { container._timescale = m; };

  setState('idle', { view: 'front' });

  // ── public API (same surface the whole game already uses) ──
  container.startWalk = function () { if (state.name !== 'walk') setState('walk', { view: 'side' }); };
  container.stopWalk = function () { setState('idle', { view: 'front' }); };
  container.playAttack = function (type) {
    // class cycles carry the flavor; magic/cast routes to the cast cycle
    setState(type === 'magic' || type === 'cast' ? 'cast' : 'attack');
  };
  container.setGuard = function () { setState('guard'); };
  container.playHit = function () { setState('hit'); };
  container.playKO = function () { setState('ko'); };
  container.playVictory = function () { setState('victory'); };
  container.playCast = function () { setState('cast'); };
  container.setSelectionSway = function () { setState('sway'); };
  container.setIdle = function () { setState('idle', { view: 'front' }); };
  container.setFacing = function (dir) {
    // horizontal facing is an external scaleX flip (scenes already do it);
    // this just picks the drawn profile
    state.view = (dir === 'left' || dir === 'right' || dir === 'side') ? 'side' : 'front';
    render();
  };

  container.setTint = function (color) { img.setTint(color); return this; };
  container.clearTint = function () { img.clearTint(); return this; };

  // Drop-in stand-ins for legacy call sites
  container.body = container;
  container.parts = {};

  // Evolution visuals — aura ring at stage 2+, orbiting motes at 3+
  const evolutionStage = opts.evolutionStage ?? 1;
  if (evolutionStage >= 2) {
    const heroColor = hero.displayColor || PAPER.teal;
    const aura = scene.add.circle(0, 20 * scale, 70 * scale, heroColor, 0.14);
    container.addAt(aura, 0);
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

  // Clean up on destroy.
  // CRITICAL: clear the body self-reference first — Phaser's destroy()
  // calls this.body.destroy() when .body is set, and since body IS this
  // container that recurses infinitely and crashes scene shutdown.
  const origDestroy = container.destroy.bind(container);
  container.destroy = function (fromScene) {
    if (this._destroyed) return;
    this._destroyed = true;
    timer.remove();
    this.body = undefined;
    origDestroy(fromScene);
    if (scene.textures && scene.textures.exists(texKey)) scene.textures.remove(texKey);
  };

  return container;
}
