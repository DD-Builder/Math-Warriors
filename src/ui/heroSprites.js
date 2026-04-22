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

// Per-hero visual overrides. Keys are hero.id from heroes.js.
// Each entry can override palette colors, weapon type, and extras.
const HERO_DETAILS = {
  // ── KNIGHTS ──
  'knight-shadow':    { pal: { dark: 0x0e1828, mid: 0x1a2e50, light: 0x3a5880 }, weapon: 'daggers', crest: 0x404060, emblem: null },
  'knight-crusader':  { pal: { dark: 0x1a3a1a, mid: 0x2e5c2e, light: 0x4a884a }, weapon: 'sword', crest: 0xc8c8c8, emblem: 'cross' },
  'knight-paladin':   { pal: { dark: 0x2a1848, mid: 0x3c2c60, light: 0x6050a0 }, weapon: 'staff', crest: 0xf0e040, emblem: 'halo' },
  'knight-berserker':  { pal: { dark: 0x3a1a0c, mid: 0x5c2c10, light: 0x8c4820 }, weapon: 'axe', crest: 0x5c2c10, emblem: null, horns: true },
  'knight-greathelm': { pal: {}, weapon: 'sword', crest: 0xcc3030, emblem: 'star', bigShield: true },

  // ── WIZARDS ──
  'wizard-stargazer':  { pal: { dark: 0x0e1838, mid: 0x1e3868, light: 0x4878b8 }, hatShape: 'pointed', orbColor: 0x80c0f8, stars: 'moon' },
  'wizard-toadstool':  { pal: { dark: 0x1c2c10, mid: 0x2a4818, light: 0x4a7828 }, hatShape: 'mushroom', orbColor: 0x60d040, stars: null, accessory: 'potion' },
  'wizard-spellblade': { pal: { dark: 0x0e2830, mid: 0x1e4858, light: 0x3878a0 }, hatShape: 'none', orbColor: 0xa040c0, stars: null, accessory: 'blade' },
  'wizard-bookworm':   { pal: { dark: 0x2a1c10, mid: 0x4a3020, light: 0x6a5040 }, hatShape: 'pointed', orbColor: 0xe0c040, stars: null, accessory: 'glasses' },
  'wizard-grandmage':  { pal: {}, hatShape: 'tall', orbColor: 0xc060f0, stars: 'many' },

  // ── BUNNIES ──
  'bunny-pepper':   { pal: { accent: 0xe06020 }, fur: 0xf0e4cc, furDark: 0xd8c8a8, gloveStyle: 'wraps' },
  'bunny-nova':     { pal: { dark: 0x401868, mid: 0x7030a8, light: 0xa860d8, accent: 0xf0d040 }, fur: 0xe8d8f0, furDark: 0xc8b8d8, gloveStyle: 'sparkle', headgear: 'tiara' },
  'bunny-boulder':  { pal: { dark: 0x2a3440, mid: 0x3c4e62, light: 0x5a7088, accent: 0x808080 }, fur: 0xc8c0b0, furDark: 0xa09888, gloveStyle: 'iron', headgear: 'band', bigger: true },
  'bunny-blaze':    { pal: { dark: 0x802008, mid: 0xc04010, light: 0xe86828, accent: 0xf0a010 }, fur: 0xf0d8b0, furDark: 0xd0b888, gloveStyle: 'flame', headgear: 'band' },
  'bunny-duchess':  { pal: { dark: 0x1a3a1a, mid: 0x2a5c2a, light: 0x4a884a, accent: 0xc07818 }, fur: 0xf0eadc, furDark: 0xd8d0c0, gloveStyle: 'normal', headgear: 'crown', cape: true },
};

function hashSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mergedPal(basePal, overrides) {
  if (!overrides) return { ...basePal };
  return { ...basePal, ...overrides };
}

export function drawHeroSprite(scene, x, y, hero, opts = {}) {
  const sc = opts.scale ?? 1;
  const seed = hashSeed(hero.id);
  const cls = hero.class || 'knight';
  const basePal = CLASS_PALETTE[cls] || CLASS_PALETTE.knight;
  const det = HERO_DETAILS[hero.id] || {};
  const pal = mergedPal(basePal, det.pal);

  const gfx = scene.add.graphics();

  if (cls === 'bunny') {
    drawBunny(gfx, x, y, sc, seed, pal, det);
  } else if (cls === 'wizard') {
    drawWizard(gfx, x, y, sc, seed, pal, det);
  } else {
    drawKnight(gfx, x, y, sc, seed, pal, det);
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

function drawKnight(gfx, x, y, sc, seed, pal, det) {
  det = det || {};
  const s = (v) => v * sc;
  const weapon = det.weapon || 'sword';
  const crestColor = det.crest || 0xcc3030;

  // Ground shadow
  wobbleCircle(gfx, x, y + s(58), s(38), 0x000000, 0.2, seed + 1, 0);

  // Legs
  wobbleRect(gfx, x - s(14), y + s(30), s(16), s(36), pal.dark, 1, seed + 10, s(3));
  wobbleRect(gfx, x + s(14), y + s(30), s(16), s(36), pal.dark, 1, seed + 11, s(3));
  wobbleRect(gfx, x - s(16), y + s(50), s(22), s(12), pal.dark, 1, seed + 12, s(2));
  wobbleRect(gfx, x + s(12), y + s(50), s(22), s(12), pal.dark, 1, seed + 13, s(2));

  // Body armor
  wobbleRect(gfx, x, y + s(4), s(56), s(48), pal.dark, 1, seed + 20, s(4));
  wobbleRect(gfx, x, y + s(2), s(50), s(44), pal.mid, 1, seed + 21, 0);
  wobbleRect(gfx, x, y - s(2), s(40), s(14), pal.light, 1, seed + 22, 0);

  // Emblem on chest
  if (det.emblem === 'cross') {
    wobbleRect(gfx, x, y + s(2), s(6), s(20), 0xf0e8d0, 0.8, seed + 23, 0);
    wobbleRect(gfx, x, y - s(2), s(20), s(6), 0xf0e8d0, 0.8, seed + 24, 0);
  }

  // Belt
  wobbleRect(gfx, x, y + s(20), s(54), s(8), pal.accent, 1, seed + 25, s(2));

  // Shield (left side) — bigger for Great Helm
  if (weapon !== 'daggers' && weapon !== 'axe') {
    const shR = det.bigShield ? s(22) : s(18);
    const shX = x - s(36), shY = y + s(2);
    wobbleCircle(gfx, shX, shY, shR, pal.dark, 1, seed + 30, s(3));
    wobbleCircle(gfx, shX, shY, shR - s(4), pal.mid, 1, seed + 31, 0);
    if (det.emblem === 'star') {
      drawStar(gfx, shX, shY, s(6), pal.accent, seed + 33);
    } else if (det.emblem === 'cross') {
      wobbleRect(gfx, shX, shY, s(3), s(10), 0xf0e8d0, 0.8, seed + 33, 0);
      wobbleRect(gfx, shX, shY - s(1), s(10), s(3), 0xf0e8d0, 0.8, seed + 34, 0);
    } else {
      wobbleCircle(gfx, shX, shY, s(6), pal.accent, 1, seed + 32, 0);
    }
  }

  // Weapon (right side)
  const swX = x + s(32);
  if (weapon === 'daggers') {
    // Dual daggers — one each side
    wobbleRect(gfx, x - s(30), y - s(8), s(4), s(30), 0x8898b8, 1, seed + 35, s(2));
    wobbleRect(gfx, x + s(30), y - s(8), s(4), s(30), 0x8898b8, 1, seed + 36, s(2));
  } else if (weapon === 'axe') {
    // Two-handed axe
    wobbleRect(gfx, swX, y - s(10), s(7), s(60), 0x6a4010, 1, seed + 35, s(2));
    // Axe head — wide crescent
    wobbleTri(gfx, [[swX, y - s(38)], [swX + s(22), y - s(28)], [swX, y - s(18)]], 0x8898b8, 1, seed + 36);
    wobbleTri(gfx, [[swX, y - s(38)], [swX - s(14), y - s(28)], [swX, y - s(18)]], 0x6a7a90, 1, seed + 37);
  } else if (weapon === 'staff') {
    // Paladin healing staff with glow
    wobbleRect(gfx, swX, y - s(10), s(6), s(70), 0xc8b878, 1, seed + 35, s(2));
    wobbleCircle(gfx, swX, y - s(44), s(10), 0xf0e040, 0.9, seed + 36, s(2));
    gfx.fillStyle(0xffffff, 0.4);
    gfx.fillCircle(swX, y - s(44), s(6));
  } else {
    // Standard sword
    wobbleRect(gfx, swX, y - s(16), s(6), s(52), 0x8898b8, 1, seed + 35, s(2));
    wobbleRect(gfx, swX, y - s(40), s(4), s(8), 0xc8d8e8, 1, seed + 36, 0);
    wobbleRect(gfx, swX, y + s(8), s(20), s(6), pal.accent, 1, seed + 37, 0);
  }

  // Shoulder guards
  wobbleCircle(gfx, x - s(24), y - s(14), s(14), pal.dark, 1, seed + 40, s(3));
  wobbleCircle(gfx, x + s(24), y - s(14), s(14), pal.dark, 1, seed + 41, s(3));
  wobbleCircle(gfx, x - s(24), y - s(14), s(10), pal.mid, 1, seed + 42, 0);
  wobbleCircle(gfx, x + s(24), y - s(14), s(10), pal.mid, 1, seed + 43, 0);

  // Head
  wobbleCircle(gfx, x, y - s(36), s(26), pal.dark, 1, seed + 50, s(4));
  wobbleCircle(gfx, x, y - s(36), s(23), pal.mid, 1, seed + 51, 0);
  wobbleRect(gfx, x, y - s(34), s(30), s(8), 0x0a0604, 0.85, seed + 52, 0);
  gfx.fillStyle(0xf0e8d0, 0.9);
  gfx.fillCircle(x - s(7), y - s(34), s(3));
  gfx.fillCircle(x + s(7), y - s(34), s(3));

  // Helmet crest / horns
  if (det.horns) {
    wobbleTri(gfx, [[x - s(18), y - s(46)], [x - s(14), y - s(46)], [x - s(22), y - s(66)]], crestColor, 1, seed + 55);
    wobbleTri(gfx, [[x + s(14), y - s(46)], [x + s(18), y - s(46)], [x + s(22), y - s(66)]], crestColor, 1, seed + 56);
  } else {
    wobbleTri(gfx, [[x - s(4), y - s(48)], [x + s(4), y - s(48)], [x, y - s(66)]], crestColor, 1, seed + 55);
  }

  // Halo for Paladin
  if (det.emblem === 'halo') {
    gfx.lineStyle(s(3), 0xf0e040, 0.7);
    gfx.beginPath();
    gfx.arc(x, y - s(56), s(14), Math.PI, 0);
    gfx.strokePath();
  }

  // Gold brim
  wobbleRect(gfx, x, y - s(26), s(34), s(5), pal.accent, 1, seed + 57, 0);
}

// ─── WIZARD ─────────────────────────────────────────────────────

function drawWizard(gfx, x, y, sc, seed, pal, det) {
  det = det || {};
  const s = (v) => v * sc;
  const hatShape = det.hatShape || 'pointed';
  const orbColor = det.orbColor || pal.light;
  const starMode = det.stars !== undefined ? det.stars : 'default';

  // Ground shadow
  wobbleCircle(gfx, x, y + s(58), s(34), 0x000000, 0.2, seed + 1, 0);

  // Robe bottom
  const robeBottom = [
    { x: x - s(32), y: y + s(56) },
    { x: x - s(28), y: y + s(14) },
    { x: x + s(28), y: y + s(14) },
    { x: x + s(32), y: y + s(56) },
  ];
  gfx.fillStyle(pal.dark, 1);
  gfx.fillPoints(robeBottom, true);
  wobbleRect(gfx, x, y + s(8), s(48), s(42), pal.mid, 1, seed + 20, s(4));
  wobbleRect(gfx, x, y + s(4), s(36), s(30), pal.light, 0.6, seed + 21, 0);
  wobbleRect(gfx, x, y + s(52), s(60), s(6), pal.accent, 1, seed + 25, s(2));

  // Staff or alternate held item
  const stX = x - s(30);
  if (det.accessory === 'blade') {
    // Spellblade — short sword in right hand, orb in left
    wobbleRect(gfx, x + s(28), y - s(4), s(5), s(36), 0x8898b8, 1, seed + 30, s(2));
    wobbleRect(gfx, x + s(28), y + s(12), s(14), s(5), pal.accent, 1, seed + 31, 0);
    wobbleCircle(gfx, stX, y - s(10), s(12), pal.dark, 1, seed + 32, s(3));
    wobbleCircle(gfx, stX, y - s(10), s(8), orbColor, 0.9, seed + 33, 0);
  } else {
    wobbleRect(gfx, stX, y - s(8), s(6), s(80), 0x6a4010, 1, seed + 30, s(3));
    wobbleCircle(gfx, stX, y - s(48), s(14), pal.dark, 1, seed + 31, s(3));
    wobbleCircle(gfx, stX, y - s(48), s(10), orbColor, 0.9, seed + 32, 0);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(stX - s(3), y - s(50), s(4));
  }

  // Potion bottle for Toadstool
  if (det.accessory === 'potion') {
    wobbleRect(gfx, x + s(26), y + s(6), s(10), s(18), 0x40a830, 0.9, seed + 38, s(2));
    wobbleCircle(gfx, x + s(26), y - s(4), s(6), 0x60d040, 0.8, seed + 39, 0);
  }

  // Sleeves / arms / hands
  wobbleCircle(gfx, x - s(22), y + s(4), s(10), pal.mid, 1, seed + 35, s(2));
  wobbleCircle(gfx, x + s(22), y + s(4), s(10), pal.mid, 1, seed + 36, s(2));
  gfx.fillStyle(pal.skin, 1);
  gfx.fillCircle(x + s(24), y + s(10), s(6));

  // Head
  wobbleCircle(gfx, x, y - s(22), s(22), pal.skin, 1, seed + 40, s(4));
  gfx.fillStyle(0x1a0e04, 1);
  gfx.fillCircle(x - s(7), y - s(24), s(3.5));
  gfx.fillCircle(x + s(7), y - s(24), s(3.5));
  gfx.fillStyle(0xffffff, 0.85);
  gfx.fillCircle(x - s(8), y - s(25), s(1.5));
  gfx.fillCircle(x + s(6), y - s(25), s(1.5));

  // Glasses for Bookworm
  if (det.accessory === 'glasses') {
    gfx.lineStyle(s(1.5), 0x4a3020, 0.8);
    gfx.strokeCircle(x - s(7), y - s(24), s(5));
    gfx.strokeCircle(x + s(7), y - s(24), s(5));
    gfx.beginPath();
    gfx.moveTo(x - s(2), y - s(24));
    gfx.lineTo(x + s(2), y - s(24));
    gfx.strokePath();
  }

  // Smile
  gfx.lineStyle(s(2), 0x1a0e04, 0.6);
  gfx.beginPath();
  gfx.arc(x, y - s(18), s(6), 0.2, Math.PI - 0.2);
  gfx.strokePath();

  // Hair
  wobbleCircle(gfx, x - s(10), y - s(32), s(6), 0x6a4020, 1, seed + 45, 0);
  wobbleCircle(gfx, x + s(8), y - s(30), s(5), 0x6a4020, 1, seed + 46, 0);
  wobbleCircle(gfx, x, y - s(34), s(5), 0x7a5030, 1, seed + 47, 0);

  // Hat — varies by hatShape
  if (hatShape === 'none') {
    // Spellblade — no hat, just a headband
    wobbleRect(gfx, x, y - s(32), s(40), s(6), pal.mid, 1, seed + 50, s(2));
  } else if (hatShape === 'mushroom') {
    // Toadstool — mushroom cap instead of pointed hat
    wobbleCircle(gfx, x, y - s(40), s(26), pal.dark, 1, seed + 50, s(4));
    wobbleCircle(gfx, x, y - s(40), s(22), pal.mid, 1, seed + 51, 0);
    // Spots
    wobbleCircle(gfx, x - s(8), y - s(46), s(5), 0xf0e8d0, 0.8, seed + 52, 0);
    wobbleCircle(gfx, x + s(10), y - s(42), s(4), 0xf0e8d0, 0.8, seed + 53, 0);
    wobbleCircle(gfx, x + s(2), y - s(50), s(3), 0xf0e8d0, 0.8, seed + 54, 0);
    wobbleRect(gfx, x, y - s(30), s(50), s(6), pal.dark, 1, seed + 55, s(2));
  } else {
    // Pointed or tall hat
    const hatH = hatShape === 'tall' ? s(90) : s(80);
    const hatPts = [
      { x: x - s(26), y: y - s(30) },
      { x: x + s(26), y: y - s(30) },
      { x: x + s(6), y: y - s(30) - hatH * 0.9 },
      { x: x - s(2), y: y - s(30) - hatH },
    ];
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillPoints(hatPts.map(p => ({ x: p.x + s(3), y: p.y + s(4) })), true);
    gfx.fillStyle(pal.dark, 1);
    gfx.fillPoints(hatPts, true);
    const hatMid = [
      { x: x - s(20), y: y - s(30) },
      { x: x + s(20), y: y - s(30) },
      { x: x + s(4), y: y - s(30) - hatH * 0.82 },
      { x: x - s(1), y: y - s(30) - hatH * 0.86 },
    ];
    gfx.fillStyle(pal.mid, 1);
    gfx.fillPoints(hatMid, true);
    wobbleRect(gfx, x, y - s(30), s(56), s(8), pal.dark, 1, seed + 50, s(2));

    // Stars / moon on hat
    if (starMode === 'moon') {
      // Crescent moon
      gfx.fillStyle(pal.accent, 0.9);
      gfx.fillCircle(x - s(2), y - s(56), s(7));
      gfx.fillStyle(pal.dark, 1);
      gfx.fillCircle(x + s(2), y - s(54), s(6));
    } else if (starMode === 'many') {
      [[x - s(8), y - s(50)], [x + s(10), y - s(44)], [x, y - s(64)], [x + s(4), y - s(76)], [x - s(6), y - s(70)]].forEach((pos, i) => {
        drawStar(gfx, pos[0], pos[1], s(4), pal.accent, seed + 60 + i);
      });
    } else if (starMode === 'default' || starMode === null) {
      [[x - s(6), y - s(50)], [x + s(8), y - s(42)], [x, y - s(64)]].forEach((pos, i) => {
        drawStar(gfx, pos[0], pos[1], s(4), pal.accent, seed + 60 + i);
      });
    }
  }
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

function drawBunny(gfx, x, y, sc, seed, pal, det) {
  det = det || {};
  const s = (v) => v * sc;
  const fur = det.fur || pal.fur || 0xf0e4cc;
  const furD = det.furDark || pal.furDark || 0xd8c8a8;
  const gloveStyle = det.gloveStyle || 'normal';
  const headgear = det.headgear || 'band';
  const bodyScale = det.bigger ? 1.15 : 1;

  // Ground shadow
  wobbleCircle(gfx, x, y + s(54), s(32), 0x000000, 0.2, seed + 1, 0);

  // Legs
  wobbleRect(gfx, x - s(12), y + s(32), s(18), s(30), furD, 1, seed + 10, s(3));
  wobbleRect(gfx, x + s(12), y + s(32), s(18), s(30), furD, 1, seed + 11, s(3));
  // Big feet
  wobbleRect(gfx, x - s(16), y + s(48), s(24), s(10), furD, 1, seed + 12, s(2));
  wobbleRect(gfx, x + s(12), y + s(48), s(24), s(10), furD, 1, seed + 13, s(2));

  // Cape for Duchess (drawn behind body)
  if (det.cape) {
    const capePts = [
      { x: x - s(20), y: y - s(10) },
      { x: x + s(20), y: y - s(10) },
      { x: x + s(28), y: y + s(50) },
      { x: x - s(28), y: y + s(50) },
    ];
    gfx.fillStyle(pal.dark, 0.8);
    gfx.fillPoints(capePts, true);
  }

  // Body — round and chubby (bigger for Boulder)
  const br = s(28 * bodyScale);
  wobbleCircle(gfx, x, y + s(10), br, furD, 1, seed + 20, s(4));
  wobbleCircle(gfx, x, y + s(10), br - s(4), fur, 1, seed + 21, 0);

  // Armor chest plate
  wobbleRect(gfx, x, y + s(4), s(32 * bodyScale), s(24), pal.dark, 1, seed + 25, s(3));
  wobbleRect(gfx, x, y + s(4), s(26 * bodyScale), s(18), pal.mid, 1, seed + 26, 0);
  wobbleRect(gfx, x, y, s(16), s(8), pal.light, 0.7, seed + 27, 0);

  // Arms + gloves — style varies per hero
  wobbleCircle(gfx, x - s(32), y + s(2), s(12), furD, 1, seed + 30, s(3));
  wobbleCircle(gfx, x + s(32), y + s(2), s(12), furD, 1, seed + 31, s(3));
  const gr = gloveStyle === 'iron' ? s(14) : s(12);
  wobbleCircle(gfx, x - s(36), y - s(2), gr, pal.mid, 1, seed + 32, s(2));
  wobbleCircle(gfx, x + s(36), y - s(2), gr, pal.mid, 1, seed + 33, s(2));
  wobbleCircle(gfx, x - s(36), y - s(2), gr - s(4), pal.light, 0.8, seed + 34, 0);
  wobbleCircle(gfx, x + s(36), y - s(2), gr - s(4), pal.light, 0.8, seed + 35, 0);
  // Wraps for Pepper — cross-hatch lines on gloves
  if (gloveStyle === 'wraps') {
    gfx.lineStyle(s(1.5), 0xd8c0a0, 0.6);
    for (let gi = -1; gi <= 1; gi++) {
      gfx.beginPath(); gfx.moveTo(x - s(40), y - s(2) + gi * s(4)); gfx.lineTo(x - s(32), y - s(2) + gi * s(4)); gfx.strokePath();
      gfx.beginPath(); gfx.moveTo(x + s(32), y - s(2) + gi * s(4)); gfx.lineTo(x + s(40), y - s(2) + gi * s(4)); gfx.strokePath();
    }
  }
  // Flame tips for Blaze
  if (gloveStyle === 'flame') {
    wobbleTri(gfx, [[x - s(40), y - s(8)], [x - s(36), y - s(18)], [x - s(32), y - s(8)]], 0xf0a010, 0.8, seed + 36);
    wobbleTri(gfx, [[x + s(32), y - s(8)], [x + s(36), y - s(18)], [x + s(40), y - s(8)]], 0xf0a010, 0.8, seed + 37);
  }
  // Sparkle accents for Nova
  if (gloveStyle === 'sparkle') {
    drawStar(gfx, x - s(38), y - s(10), s(5), 0xf0d040, seed + 36);
    drawStar(gfx, x + s(38), y - s(10), s(5), 0xf0d040, seed + 37);
  }

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

  // Headgear — varies per hero
  if (headgear === 'crown') {
    wobbleRect(gfx, x, y - s(36), s(32), s(6), pal.accent, 1, seed + 50, 0);
    wobbleTri(gfx, [[x - s(12), y - s(39)], [x - s(8), y - s(49)], [x - s(4), y - s(39)]], pal.accent, 1, seed + 51);
    wobbleTri(gfx, [[x - s(3), y - s(39)], [x, y - s(52)], [x + s(3), y - s(39)]], pal.accent, 1, seed + 52);
    wobbleTri(gfx, [[x + s(4), y - s(39)], [x + s(8), y - s(49)], [x + s(12), y - s(39)]], pal.accent, 1, seed + 53);
  } else if (headgear === 'tiara') {
    wobbleRect(gfx, x, y - s(36), s(34), s(4), 0xf0d040, 1, seed + 50, 0);
    drawStar(gfx, x, y - s(40), s(6), 0xf0d040, seed + 51);
  } else {
    wobbleRect(gfx, x, y - s(34), s(38), s(6), pal.accent, 1, seed + 50, 0);
  }

  // Flame-tipped ears for Blaze
  if (gloveStyle === 'flame') {
    wobbleTri(gfx, [[x - s(14), y - s(76)], [x - s(12), y - s(86)], [x - s(10), y - s(76)]], 0xf08010, 0.85, seed + 54);
    wobbleTri(gfx, [[x + s(8), y - s(70)], [x + s(10), y - s(80)], [x + s(12), y - s(70)]], 0xf08010, 0.85, seed + 55);
  }

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
