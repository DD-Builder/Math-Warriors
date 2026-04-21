/**
 * Procedural papercut hero sprites.
 *
 * Draws chibi characters using Phaser's Graphics API with the same
 * wobbled-edge, layered-shadow aesthetic as the rest of the UI.
 * Each class (knight / wizard / bunny) has a distinct silhouette that
 * reads clearly at battle size (110×140 px).
 *
 * Usage:
 *   import { drawHeroSprite } from '../ui/heroSprites.js';
 *   const gfx = drawHeroSprite(scene, x, y, hero, { scale: 1 });
 */

import { makeRng } from '../systems/rng.js';

// Class color palettes — three shades per class for paper layering
const CLASS_PALETTE = {
  knight: {
    dark:   0x1a2e50,
    mid:    0x2e4e88,
    light:  0x5a7ab8,
    accent: 0xc07818,   // gold trim
    skin:   0xf0dcc0,
  },
  wizard: {
    dark:   0x2a1848,
    mid:    0x5a1878,
    light:  0x9050c8,
    accent: 0xe8a030,   // star gold
    skin:   0xf0dcc0,
  },
  bunny: {
    dark:   0x801840,
    mid:    0xc02860,
    light:  0xe86898,
    accent: 0xe84040,   // bandana red
    skin:   0xf0dcc0,
    fur:    0xf0e4cc,
    furDark: 0xd8c8a8,
  },
};

function hashSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Draw a complete papercut hero sprite centered at (x, y).
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - center X
 * @param {number} y - center Y
 * @param {object} hero - hero data with .id, .class, .displayColor
 * @param {object} [opts]
 * @param {number} [opts.scale=1]
 * @returns {Phaser.GameObjects.Graphics} the main body graphics
 */
export function drawHeroSprite(scene, x, y, hero, opts = {}) {
  const sc = opts.scale ?? 1;
  const seed = hashSeed(hero.id);
  const cls = hero.class || 'knight';
  const pal = CLASS_PALETTE[cls] || CLASS_PALETTE.knight;

  const gfx = scene.add.graphics();

  if (cls === 'bunny') {
    drawBunny(gfx, x, y, sc, seed, pal);
  } else if (cls === 'wizard') {
    drawWizard(gfx, x, y, sc, seed, pal);
  } else {
    drawKnight(gfx, x, y, sc, seed, pal);
  }

  return gfx;
}

// ─── SHAPE HELPERS ──────────────────────────────────────────────

function wobbleCircle(gfx, cx, cy, r, color, alpha, seed, shadowOff) {
  const rng = makeRng(seed);
  const pts = 16;
  const points = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wr = r * (1 + (rng() - 0.5) * 0.12);
    points.push({ x: cx + Math.cos(a) * wr, y: cy + Math.sin(a) * wr });
  }
  if (shadowOff) {
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillPoints(points.map(p => ({ x: p.x + shadowOff, y: p.y + shadowOff })), true);
  }
  gfx.fillStyle(color, alpha);
  gfx.fillPoints(points, true);
}

function wobbleRect(gfx, cx, cy, w, h, color, alpha, seed, shadowOff) {
  const rng = makeRng(seed);
  const wb = 2;
  const pts = [
    { x: cx - w / 2 + (rng() - 0.5) * wb, y: cy - h / 2 + (rng() - 0.5) * wb },
    { x: cx + w / 2 + (rng() - 0.5) * wb, y: cy - h / 2 + (rng() - 0.5) * wb },
    { x: cx + w / 2 + (rng() - 0.5) * wb, y: cy + h / 2 + (rng() - 0.5) * wb },
    { x: cx - w / 2 + (rng() - 0.5) * wb, y: cy + h / 2 + (rng() - 0.5) * wb },
  ];
  if (shadowOff) {
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillPoints(pts.map(p => ({ x: p.x + shadowOff, y: p.y + shadowOff })), true);
  }
  gfx.fillStyle(color, alpha);
  gfx.fillPoints(pts, true);
}

function wobbleTri(gfx, pts, color, alpha, seed) {
  const rng = makeRng(seed);
  const wb = 1.5;
  const wpts = pts.map(p => ({
    x: p[0] + (rng() - 0.5) * wb,
    y: p[1] + (rng() - 0.5) * wb,
  }));
  gfx.fillStyle(color, alpha);
  gfx.fillPoints(wpts, true);
}

// ─── KNIGHT ─────────────────────────────────────────────────────

function drawKnight(gfx, x, y, sc, seed, pal) {
  const s = (v) => v * sc;

  // Ground shadow
  wobbleCircle(gfx, x, y + s(58), s(38), 0x000000, 0.2, seed + 1, 0);

  // Legs
  wobbleRect(gfx, x - s(14), y + s(30), s(16), s(36), pal.dark, 1, seed + 10, s(3));
  wobbleRect(gfx, x + s(14), y + s(30), s(16), s(36), pal.dark, 1, seed + 11, s(3));
  // Boots
  wobbleRect(gfx, x - s(16), y + s(50), s(22), s(12), pal.dark, 1, seed + 12, s(2));
  wobbleRect(gfx, x + s(12), y + s(50), s(22), s(12), pal.dark, 1, seed + 13, s(2));

  // Body armor — back layer (dark)
  wobbleRect(gfx, x, y + s(4), s(56), s(48), pal.dark, 1, seed + 20, s(4));
  // Body armor — mid layer
  wobbleRect(gfx, x, y + s(2), s(50), s(44), pal.mid, 1, seed + 21, 0);
  // Body armor — highlight stripe
  wobbleRect(gfx, x, y - s(2), s(40), s(14), pal.light, 1, seed + 22, 0);

  // Belt
  wobbleRect(gfx, x, y + s(20), s(54), s(8), pal.accent, 1, seed + 25, s(2));

  // Shield (left side)
  const shX = x - s(36), shY = y + s(2);
  wobbleCircle(gfx, shX, shY, s(18), pal.dark, 1, seed + 30, s(3));
  wobbleCircle(gfx, shX, shY, s(14), pal.mid, 1, seed + 31, 0);
  wobbleCircle(gfx, shX, shY, s(6), pal.accent, 1, seed + 32, 0);

  // Sword (right side)
  const swX = x + s(32);
  wobbleRect(gfx, swX, y - s(16), s(6), s(52), 0x8898b8, 1, seed + 35, s(2));
  wobbleRect(gfx, swX, y - s(40), s(4), s(8), 0xc8d8e8, 1, seed + 36, 0);
  wobbleRect(gfx, swX, y + s(8), s(20), s(6), pal.accent, 1, seed + 37, 0);

  // Shoulder guards
  wobbleCircle(gfx, x - s(24), y - s(14), s(14), pal.dark, 1, seed + 40, s(3));
  wobbleCircle(gfx, x + s(24), y - s(14), s(14), pal.dark, 1, seed + 41, s(3));
  wobbleCircle(gfx, x - s(24), y - s(14), s(10), pal.mid, 1, seed + 42, 0);
  wobbleCircle(gfx, x + s(24), y - s(14), s(10), pal.mid, 1, seed + 43, 0);

  // Head — back shadow
  wobbleCircle(gfx, x, y - s(36), s(26), pal.dark, 1, seed + 50, s(4));
  // Helmet mid
  wobbleCircle(gfx, x, y - s(36), s(23), pal.mid, 1, seed + 51, 0);
  // Visor slit
  wobbleRect(gfx, x, y - s(34), s(30), s(8), 0x0a0604, 0.85, seed + 52, 0);
  // Eyes glow through visor
  gfx.fillStyle(0xf0e8d0, 0.9);
  gfx.fillCircle(x - s(7), y - s(34), s(3));
  gfx.fillCircle(x + s(7), y - s(34), s(3));

  // Helmet crest
  wobbleTri(gfx, [
    [x - s(4), y - s(48)],
    [x + s(4), y - s(48)],
    [x, y - s(66)],
  ], 0xcc3030, 1, seed + 55);

  // Gold brim
  wobbleRect(gfx, x, y - s(26), s(34), s(5), pal.accent, 1, seed + 56, 0);
}

// ─── WIZARD ─────────────────────────────────────────────────────

function drawWizard(gfx, x, y, sc, seed, pal) {
  const s = (v) => v * sc;

  // Ground shadow
  wobbleCircle(gfx, x, y + s(58), s(34), 0x000000, 0.2, seed + 1, 0);

  // Robe bottom — wide flowing hem
  const robeBottom = [
    { x: x - s(32), y: y + s(56) },
    { x: x - s(28), y: y + s(14) },
    { x: x + s(28), y: y + s(14) },
    { x: x + s(32), y: y + s(56) },
  ];
  gfx.fillStyle(pal.dark, 1);
  gfx.fillPoints(robeBottom, true);

  // Robe body — mid layer
  wobbleRect(gfx, x, y + s(8), s(48), s(42), pal.mid, 1, seed + 20, s(4));
  // Robe highlight
  wobbleRect(gfx, x, y + s(4), s(36), s(30), pal.light, 0.6, seed + 21, 0);

  // Robe trim at hem
  wobbleRect(gfx, x, y + s(52), s(60), s(6), pal.accent, 1, seed + 25, s(2));

  // Staff (left side)
  const stX = x - s(30);
  wobbleRect(gfx, stX, y - s(8), s(6), s(80), 0x6a4010, 1, seed + 30, s(3));
  // Staff orb
  wobbleCircle(gfx, stX, y - s(48), s(14), pal.dark, 1, seed + 31, s(3));
  wobbleCircle(gfx, stX, y - s(48), s(10), pal.light, 0.9, seed + 32, 0);
  // Orb glow
  gfx.fillStyle(0xffffff, 0.3);
  gfx.fillCircle(stX - s(3), y - s(50), s(4));

  // Sleeves / arms
  wobbleCircle(gfx, x - s(22), y + s(4), s(10), pal.mid, 1, seed + 35, s(2));
  wobbleCircle(gfx, x + s(22), y + s(4), s(10), pal.mid, 1, seed + 36, s(2));
  // Hands
  gfx.fillStyle(pal.skin, 1);
  gfx.fillCircle(x + s(24), y + s(10), s(6));

  // Head
  wobbleCircle(gfx, x, y - s(22), s(22), pal.skin, 1, seed + 40, s(4));
  // Eyes
  gfx.fillStyle(0x1a0e04, 1);
  gfx.fillCircle(x - s(7), y - s(24), s(3.5));
  gfx.fillCircle(x + s(7), y - s(24), s(3.5));
  // Eye shine
  gfx.fillStyle(0xffffff, 0.85);
  gfx.fillCircle(x - s(8), y - s(25), s(1.5));
  gfx.fillCircle(x + s(6), y - s(25), s(1.5));
  // Smile
  gfx.lineStyle(s(2), 0x1a0e04, 0.6);
  gfx.beginPath();
  gfx.arc(x, y - s(18), s(6), 0.2, Math.PI - 0.2);
  gfx.strokePath();

  // Hair poking out from under hat
  wobbleCircle(gfx, x - s(10), y - s(32), s(6), 0x6a4020, 1, seed + 45, 0);
  wobbleCircle(gfx, x + s(8), y - s(30), s(5), 0x6a4020, 1, seed + 46, 0);
  wobbleCircle(gfx, x, y - s(34), s(5), 0x7a5030, 1, seed + 47, 0);

  // Pointed hat — back layer
  const hatPts = [
    { x: x - s(26), y: y - s(30) },
    { x: x + s(26), y: y - s(30) },
    { x: x + s(6), y: y - s(76) },
    { x: x - s(2), y: y - s(80) },
  ];
  gfx.fillStyle(0x000000, 0.3);
  gfx.fillPoints(hatPts.map(p => ({ x: p.x + s(3), y: p.y + s(4) })), true);
  gfx.fillStyle(pal.dark, 1);
  gfx.fillPoints(hatPts, true);

  // Hat mid layer
  const hatMid = [
    { x: x - s(20), y: y - s(30) },
    { x: x + s(20), y: y - s(30) },
    { x: x + s(4), y: y - s(70) },
    { x: x - s(1), y: y - s(74) },
  ];
  gfx.fillStyle(pal.mid, 1);
  gfx.fillPoints(hatMid, true);

  // Hat brim
  wobbleRect(gfx, x, y - s(30), s(56), s(8), pal.dark, 1, seed + 50, s(2));

  // Stars on hat
  const starPositions = [[x - s(6), y - s(50)], [x + s(8), y - s(42)], [x, y - s(64)]];
  starPositions.forEach((pos, i) => {
    drawStar(gfx, pos[0], pos[1], s(4), pal.accent, seed + 60 + i);
  });
}

function drawStar(gfx, cx, cy, r, color, seed) {
  const rng = makeRng(seed);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const sr = i % 2 === 0 ? r : r * 0.45;
    pts.push({
      x: cx + Math.cos(a) * sr + (rng() - 0.5) * 1,
      y: cy + Math.sin(a) * sr + (rng() - 0.5) * 1,
    });
  }
  gfx.fillStyle(color, 0.95);
  gfx.fillPoints(pts, true);
}

// ─── BUNNY ──────────────────────────────────────────────────────

function drawBunny(gfx, x, y, sc, seed, pal) {
  const s = (v) => v * sc;
  const fur = pal.fur || 0xf0e4cc;
  const furD = pal.furDark || 0xd8c8a8;

  // Ground shadow
  wobbleCircle(gfx, x, y + s(54), s(32), 0x000000, 0.2, seed + 1, 0);

  // Legs
  wobbleRect(gfx, x - s(12), y + s(32), s(18), s(30), furD, 1, seed + 10, s(3));
  wobbleRect(gfx, x + s(12), y + s(32), s(18), s(30), furD, 1, seed + 11, s(3));
  // Big feet
  wobbleRect(gfx, x - s(16), y + s(48), s(24), s(10), furD, 1, seed + 12, s(2));
  wobbleRect(gfx, x + s(12), y + s(48), s(24), s(10), furD, 1, seed + 13, s(2));

  // Body — round and chubby
  wobbleCircle(gfx, x, y + s(10), s(28), furD, 1, seed + 20, s(4));
  wobbleCircle(gfx, x, y + s(10), s(24), fur, 1, seed + 21, 0);

  // Armor chest plate
  wobbleRect(gfx, x, y + s(4), s(32), s(24), pal.dark, 1, seed + 25, s(3));
  wobbleRect(gfx, x, y + s(4), s(26), s(18), pal.mid, 1, seed + 26, 0);
  // Armor highlight
  wobbleRect(gfx, x, y, s(16), s(8), pal.light, 0.7, seed + 27, 0);

  // Arms — boxing gloves!
  wobbleCircle(gfx, x - s(32), y + s(2), s(12), furD, 1, seed + 30, s(3));
  wobbleCircle(gfx, x + s(32), y + s(2), s(12), furD, 1, seed + 31, s(3));
  // Gloves
  wobbleCircle(gfx, x - s(36), y - s(2), s(12), pal.mid, 1, seed + 32, s(2));
  wobbleCircle(gfx, x + s(36), y - s(2), s(12), pal.mid, 1, seed + 33, s(2));
  wobbleCircle(gfx, x - s(36), y - s(2), s(8), pal.light, 0.8, seed + 34, 0);
  wobbleCircle(gfx, x + s(36), y - s(2), s(8), pal.light, 0.8, seed + 35, 0);

  // Head — big and round (chibi!)
  wobbleCircle(gfx, x, y - s(26), s(28), furD, 1, seed + 40, s(4));
  wobbleCircle(gfx, x, y - s(26), s(24), fur, 1, seed + 41, 0);

  // Ears — tall!
  const earW = s(10), earH = s(40);
  // Left ear
  const leftEar = [
    { x: x - s(14) - earW / 2, y: y - s(38) },
    { x: x - s(14) + earW / 2, y: y - s(38) },
    { x: x - s(12) + earW / 3, y: y - s(38) - earH },
    { x: x - s(12) - earW / 3, y: y - s(38) - earH - s(4) },
  ];
  gfx.fillStyle(0x000000, 0.25);
  gfx.fillPoints(leftEar.map(p => ({ x: p.x + s(3), y: p.y + s(3) })), true);
  gfx.fillStyle(furD, 1);
  gfx.fillPoints(leftEar, true);
  // Inner ear
  const leftInner = [
    { x: x - s(14) - earW / 4, y: y - s(40) },
    { x: x - s(14) + earW / 4, y: y - s(40) },
    { x: x - s(13), y: y - s(38) - earH + s(6) },
  ];
  gfx.fillStyle(0xe8a0a8, 1);
  gfx.fillPoints(leftInner, true);

  // Right ear (slightly bent)
  const rightEar = [
    { x: x + s(10) - earW / 2, y: y - s(36) },
    { x: x + s(10) + earW / 2, y: y - s(36) },
    { x: x + s(14) + earW / 4, y: y - s(36) - earH + s(6) },
    { x: x + s(8), y: y - s(36) - earH + s(2) },
  ];
  gfx.fillStyle(0x000000, 0.25);
  gfx.fillPoints(rightEar.map(p => ({ x: p.x + s(3), y: p.y + s(3) })), true);
  gfx.fillStyle(furD, 1);
  gfx.fillPoints(rightEar, true);
  const rightInner = [
    { x: x + s(10) - earW / 4, y: y - s(38) },
    { x: x + s(10) + earW / 4, y: y - s(38) },
    { x: x + s(12), y: y - s(36) - earH + s(10) },
  ];
  gfx.fillStyle(0xe8a0a8, 1);
  gfx.fillPoints(rightInner, true);

  // Headband
  wobbleRect(gfx, x, y - s(34), s(38), s(6), pal.accent, 1, seed + 50, 0);

  // Eyes — big and expressive
  gfx.fillStyle(0xffffff, 1);
  gfx.fillCircle(x - s(8), y - s(28), s(6));
  gfx.fillCircle(x + s(8), y - s(28), s(6));
  gfx.fillStyle(0x1a0804, 1);
  gfx.fillCircle(x - s(7), y - s(27), s(4));
  gfx.fillCircle(x + s(9), y - s(27), s(4));
  gfx.fillStyle(0xffffff, 0.9);
  gfx.fillCircle(x - s(8), y - s(29), s(2));
  gfx.fillCircle(x + s(8), y - s(29), s(2));

  // Nose
  wobbleCircle(gfx, x, y - s(22), s(4), 0xe88888, 1, seed + 55, 0);

  // Confident grin
  gfx.lineStyle(s(2.5), 0x1a0804, 0.7);
  gfx.beginPath();
  gfx.arc(x, y - s(18), s(8), 0.3, Math.PI - 0.3);
  gfx.strokePath();

  // Tail pom (peeking from side)
  wobbleCircle(gfx, x + s(26), y + s(20), s(10), fur, 1, seed + 58, s(2));
}
