/**
 * Monster sprite renderer — canvas-to-Phaser bridge with Phaser Graphics fallback.
 *
 * Tries reference art from monsterArt.js first (rendered via Rndr onto an
 * offscreen canvas, then loaded as a Phaser texture). Falls back to the
 * legacy Phaser Graphics draw functions for monsters without reference art.
 */

import { createMonsterCanvas } from './legacyRenderer.js';
import { FLOOR1_MONSTERS, FLOOR2_MONSTERS, FLOOR3_MONSTERS, FLOOR4_MONSTERS, FLOOR5_MONSTERS, BOSSES } from '../data/monsterArt.js';
import { makeRng } from '../systems/rng.js';
import { applySpriteFilter } from '../systems/renderingFilters.js';

// Floor-themed base colors for enemy sprites (used when no art is available)
const FLOOR_ENEMY_COLORS = {
  1: 0x7d9f6d,  // PAPER leaf — garden greens
  2: 0x44888a,  // PAPER teal — tide
  3: 0xa4c8d8,  // PAPER sky — tide/storm
  4: 0xe78f6c,  // PAPER coral — ember
  5: 0x7fb3ae,  // PAPER tealL — frost
  6: 0x9c8fc0,  // PAPER lavender — arcane
  7: 0xecb964,  // PAPER gold — arcane
  8: 0xd9cfb2,  // PAPER sand — earthen
  9: 0x7c6fa8,  // PAPER lavenderD — arcane
};

const ART_LOOKUP = {};
[FLOOR1_MONSTERS, FLOOR2_MONSTERS, FLOOR3_MONSTERS, FLOOR4_MONSTERS, FLOOR5_MONSTERS, BOSSES].forEach(group => {
  Object.keys(group).forEach(id => { ART_LOOKUP[id] = group[id]; });
});

const CANVAS_CACHE = {};
const MONSTER_SIZE = 640;

function getMonsterCanvas(id) {
  if (CANVAS_CACHE[id]) return CANVAS_CACHE[id];
  const drawFn = ART_LOOKUP[id];
  if (!drawFn) return null;
  const cv = createMonsterCanvas(MONSTER_SIZE, null, drawFn, 0);
  CANVAS_CACHE[id] = cv;
  return cv;
}

export function drawMonsterSprite(scene, x, y, enemy, opts = {}) {
  const scale = opts.scale ?? 1;
  const floorId = opts.floorId || 1;
  const id = enemy.id;
  const textureKey = `monster-${id}-f${floorId}`;

  // Try reference art first
  if (!scene.textures.exists(textureKey)) {
    const cv = getMonsterCanvas(id);
    if (cv) {
      applySpriteFilter(cv, floorId);
      scene.textures.addCanvas(textureKey, cv);
    } else {
      // Fallback to old Phaser Graphics draw
      return drawFallback(scene, x, y, enemy, scale);
    }
  }

  const img = scene.add.image(x, y, textureKey);
  img.setScale(scale);
  img.setOrigin(0.5, 0.5);
  return img;
}

// ─── FALLBACK: Old Phaser Graphics draws ────────────────────────

function hashSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function drawFallback(scene, x, y, enemy, sc) {
  const seed = hashSeed(enemy.id);
  const gfx = scene.add.graphics();
  const fn = FALLBACK_DRAW[enemy.id];
  if (fn) fn(gfx, x, y, sc, seed);
  else drawGeneric(gfx, x, y, sc, seed, enemy.displayColor || FLOOR_ENEMY_COLORS[enemy.floor] || 0x808080);
  return gfx;
}

function wCircle(gfx, cx, cy, r, color, a, seed, sh) {
  const rng = makeRng(seed); const pts = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const wr = r * (1 + (rng() - 0.5) * 0.14);
    pts.push({ x: cx + Math.cos(ang) * wr, y: cy + Math.sin(ang) * wr });
  }
  if (sh) { gfx.fillStyle(0x1f3d3f, 0.28); gfx.fillPoints(pts.map(p => ({ x: p.x + sh, y: p.y + sh })), true); }
  gfx.fillStyle(color, a); gfx.fillPoints(pts, true);
}

function wRect(gfx, cx, cy, w, h, color, a, seed, sh) {
  const rng = makeRng(seed); const wb = 2;
  const pts = [
    { x: cx - w/2 + (rng()-.5)*wb, y: cy - h/2 + (rng()-.5)*wb },
    { x: cx + w/2 + (rng()-.5)*wb, y: cy - h/2 + (rng()-.5)*wb },
    { x: cx + w/2 + (rng()-.5)*wb, y: cy + h/2 + (rng()-.5)*wb },
    { x: cx - w/2 + (rng()-.5)*wb, y: cy + h/2 + (rng()-.5)*wb },
  ];
  if (sh) { gfx.fillStyle(0x1f3d3f, 0.25); gfx.fillPoints(pts.map(p => ({ x: p.x + sh, y: p.y + sh })), true); }
  gfx.fillStyle(color, a); gfx.fillPoints(pts, true);
}

function drawGeneric(gfx, x, y, sc, seed, color) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(50), s(36), 0x1f3d3f, 0.2, seed, 0);
  wCircle(gfx, x, y, s(50), color, 1, seed + 1, s(4));
  wCircle(gfx, x, y, s(40), color, 0.7, seed + 2, 0);
  gfx.fillStyle(0x1f4244, 0.9); gfx.fillCircle(x - s(12), y - s(8), s(6));
  gfx.fillCircle(x + s(12), y - s(8), s(6));
  gfx.fillStyle(0xf5eedd, 0.8); gfx.fillCircle(x - s(11), y - s(9), s(3));
  gfx.fillCircle(x + s(13), y - s(9), s(3));
}

const FALLBACK_DRAW = {};
