/**
 * Procedural papercut monster sprites.
 *
 * 25 enemies across 5 floors, each with a distinct silhouette.
 * Same wobbled-edge aesthetic as heroSprites.js.
 */

import { makeRng } from '../systems/rng.js';

function hashSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function drawMonsterSprite(scene, x, y, enemy, opts = {}) {
  const sc = opts.scale ?? 1;
  const seed = hashSeed(enemy.id);
  const gfx = scene.add.graphics();
  const fn = MONSTER_DRAW[enemy.id];
  if (fn) fn(gfx, x, y, sc, seed);
  else drawGeneric(gfx, x, y, sc, seed, enemy.displayColor);
  return gfx;
}

// ─── SHAPE HELPERS (same API as heroSprites) ────────────────────

function wCircle(gfx, cx, cy, r, color, a, seed, sh) {
  const rng = makeRng(seed); const pts = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const wr = r * (1 + (rng() - 0.5) * 0.14);
    pts.push({ x: cx + Math.cos(ang) * wr, y: cy + Math.sin(ang) * wr });
  }
  if (sh) { gfx.fillStyle(0x000000, 0.28); gfx.fillPoints(pts.map(p => ({ x: p.x + sh, y: p.y + sh })), true); }
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
  if (sh) { gfx.fillStyle(0x000000, 0.25); gfx.fillPoints(pts.map(p => ({ x: p.x + sh, y: p.y + sh })), true); }
  gfx.fillStyle(color, a); gfx.fillPoints(pts, true);
}

function wTri(gfx, pts, color, a, seed) {
  const rng = makeRng(seed); const wb = 1.5;
  gfx.fillStyle(color, a);
  gfx.fillPoints(pts.map(p => ({ x: p[0]+(rng()-.5)*wb, y: p[1]+(rng()-.5)*wb })), true);
}

function wPoly(gfx, pts, color, a, seed, sh) {
  const rng = makeRng(seed); const wb = 2;
  const wp = pts.map(p => ({ x: p[0]+(rng()-.5)*wb, y: p[1]+(rng()-.5)*wb }));
  if (sh) { gfx.fillStyle(0x000000, 0.25); gfx.fillPoints(wp.map(p => ({ x: p.x+sh, y: p.y+sh })), true); }
  gfx.fillStyle(color, a); gfx.fillPoints(wp, true);
}

function drawGeneric(gfx, x, y, sc, seed, color) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(50), s(36), 0x000000, 0.2, seed, 0);
  wCircle(gfx, x, y, s(50), color, 1, seed + 1, s(4));
  wCircle(gfx, x, y, s(40), color, 0.7, seed + 2, 0);
  gfx.fillStyle(0x0a0604, 0.9); gfx.fillCircle(x - s(12), y - s(8), s(6));
  gfx.fillCircle(x + s(12), y - s(8), s(6));
  gfx.fillStyle(0xf0e040, 0.8); gfx.fillCircle(x - s(11), y - s(9), s(3));
  gfx.fillCircle(x + s(13), y - s(9), s(3));
}

// ─── FLOOR 1: GARDEN ────────────────────────────────────────────

function drawSproutling(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(50), s(30), 0x000000, 0.2, seed, 0);
  // Stem
  wRect(gfx, x, y + s(24), s(14), s(40), 0x3a6818, 1, seed+10, s(3));
  wRect(gfx, x, y + s(24), s(8), s(36), 0x4e8a20, 1, seed+11, 0);
  // Twig legs
  wRect(gfx, x - s(12), y + s(44), s(8), s(22), 0x2a4810, 1, seed+12, s(2));
  wRect(gfx, x + s(12), y + s(44), s(8), s(22), 0x2a4810, 1, seed+13, s(2));
  // Twig arms
  wRect(gfx, x - s(22), y + s(8), s(24), s(6), 0x2a4810, 1, seed+14, s(2));
  wRect(gfx, x + s(22), y + s(8), s(24), s(6), 0x2a4810, 1, seed+15, s(2));
  // Big mushroom cap
  wCircle(gfx, x, y - s(14), s(42), 0x8a3010, 1, seed+20, s(5));
  wCircle(gfx, x, y - s(16), s(36), 0xc04818, 1, seed+21, 0);
  wCircle(gfx, x, y - s(18), s(26), 0xd86020, 0.8, seed+22, 0);
  // Spots on cap
  wCircle(gfx, x - s(14), y - s(24), s(7), 0xf0e8d0, 0.8, seed+25, 0);
  wCircle(gfx, x + s(10), y - s(28), s(5), 0xf0e8d0, 0.8, seed+26, 0);
  wCircle(gfx, x + s(4), y - s(10), s(6), 0xf0e8d0, 0.7, seed+27, 0);
  // Face under cap brim
  gfx.fillStyle(0x0e0804, 0.9);
  gfx.fillCircle(x - s(8), y + s(2), s(4));
  gfx.fillCircle(x + s(8), y + s(2), s(4));
  gfx.fillStyle(0xc0a810, 0.8);
  gfx.fillCircle(x - s(7), y + s(1), s(2));
  gfx.fillCircle(x + s(9), y + s(1), s(2));
  // Angry mouth
  gfx.lineStyle(s(2), 0x0e0804, 0.7);
  gfx.beginPath(); gfx.moveTo(x - s(6), y + s(8)); gfx.lineTo(x, y + s(6)); gfx.lineTo(x + s(6), y + s(8)); gfx.strokePath();
}

function drawThornwall(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(36), s(34), 0x000000, 0.2, seed, 0);
  // Dense thorny core
  wCircle(gfx, x, y, s(34), 0x0c2008, 1, seed+1, s(4));
  wCircle(gfx, x, y, s(28), 0x1a3c0e, 1, seed+2, 0);
  wCircle(gfx, x, y, s(18), 0x2c5c18, 0.8, seed+3, 0);
  // Thorns radiating outward
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = s(22 + (i % 3) * 6);
    const bx = x + Math.cos(a) * s(26), by = y + Math.sin(a) * s(26);
    const tx = x + Math.cos(a) * (s(26) + len), ty = y + Math.sin(a) * (s(26) + len);
    wTri(gfx, [[bx - Math.sin(a)*s(4), by + Math.cos(a)*s(4)], [tx, ty], [bx + Math.sin(a)*s(4), by - Math.cos(a)*s(4)]], 0x3a1204, 1, seed+10+i);
  }
  // Hidden eyes
  gfx.fillStyle(0xcc1c0c, 0.7);
  gfx.fillCircle(x - s(6), y + s(2), s(3));
  gfx.fillCircle(x + s(7), y - s(1), s(3));
}

function drawBlossomFiend(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(56), s(26), 0x000000, 0.2, seed, 0);
  // Vine stalk
  wRect(gfx, x, y + s(20), s(12), s(60), 0x1c3006, 1, seed+10, s(3));
  wRect(gfx, x, y + s(20), s(6), s(56), 0x2e5010, 1, seed+11, 0);
  // Root feet
  wCircle(gfx, x - s(10), y + s(50), s(10), 0x1c3006, 1, seed+12, s(2));
  wCircle(gfx, x + s(10), y + s(50), s(10), 0x1c3006, 1, seed+13, s(2));
  // Leaf arms
  wPoly(gfx, [[x+s(6),y+s(10)],[x+s(30),y],[x+s(36),y+s(14)],[x+s(26),y+s(24)],[x+s(6),y+s(18)]], 0x1e480a, 1, seed+14, s(3));
  wPoly(gfx, [[x-s(6),y+s(10)],[x-s(30),y],[x-s(36),y+s(14)],[x-s(26),y+s(24)],[x-s(6),y+s(18)]], 0x1e480a, 1, seed+15, s(3));
  // Petal crown
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * s(24), py = y - s(16) + Math.sin(a) * s(24);
    wPoly(gfx, [[px-s(5),py-s(2)],[px+s(5),py-s(2)],[px+s(3),py+s(12)],[px,py+s(15)],[px-s(3),py+s(12)]], 0xc02858, 1, seed+20+i, 0);
  }
  // Jaw — upper
  wPoly(gfx, [[x-s(28),y-s(16)],[x+s(28),y-s(16)],[x+s(22),y-s(30)],[x,y-s(36)],[x-s(22),y-s(30)]], 0x540a1a, 1, seed+30, s(4));
  // Jaw — lower
  wPoly(gfx, [[x-s(28),y-s(8)],[x+s(28),y-s(8)],[x+s(22),y],[x,y+s(4)],[x-s(22),y]], 0x540a1a, 1, seed+31, s(3));
  // Teeth
  for (let t = -2; t <= 2; t++) {
    if (t === 0) continue;
    wTri(gfx, [[x+t*s(8)-s(3),y-s(16)],[x+t*s(8)+s(3),y-s(16)],[x+t*s(8),y-s(8)]], 0xe8dcc0, 1, seed+40+t);
  }
  // Eyes
  gfx.fillStyle(0x0c0806, 0.95);
  gfx.fillCircle(x - s(10), y - s(24), s(4));
  gfx.fillCircle(x + s(10), y - s(28), s(4));
  gfx.fillStyle(0x58cc0e, 0.9);
  gfx.fillCircle(x - s(9), y - s(25), s(2));
  gfx.fillCircle(x + s(11), y - s(29), s(2));
}

function drawPuffshroom(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(52), s(34), 0x000000, 0.2, seed, 0);
  // Tiny feet
  wRect(gfx, x - s(12), y + s(42), s(14), s(16), 0x284a10, 1, seed+10, s(2));
  wRect(gfx, x + s(12), y + s(42), s(14), s(16), 0x284a10, 1, seed+11, s(2));
  // Tiny stem
  wRect(gfx, x, y + s(30), s(14), s(16), 0x284a10, 1, seed+12, s(2));
  // MASSIVE balloon cap
  wCircle(gfx, x, y - s(6), s(52), 0x8a6a0c, 1, seed+20, s(5));
  wCircle(gfx, x, y - s(8), s(44), 0xbea010, 1, seed+21, 0);
  wCircle(gfx, x, y - s(10), s(32), 0xe6c018, 0.8, seed+22, 0);
  // Pores
  wCircle(gfx, x - s(16), y - s(20), s(6), 0x352404, 0.7, seed+25, 0);
  wCircle(gfx, x + s(14), y - s(26), s(5), 0x352404, 0.7, seed+26, 0);
  wCircle(gfx, x, y - s(34), s(4), 0x352404, 0.7, seed+27, 0);
  // Face
  gfx.fillStyle(0x0e0804, 0.85);
  gfx.fillCircle(x - s(10), y + s(14), s(4));
  gfx.fillCircle(x + s(10), y + s(14), s(4));
  gfx.lineStyle(s(2), 0x0e0804, 0.6);
  gfx.beginPath(); gfx.moveTo(x - s(6), y + s(20)); gfx.lineTo(x + s(6), y + s(20)); gfx.strokePath();
}

function drawBriarKing(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(60), s(36), 0x000000, 0.2, seed, 0);
  // Root feet
  wRect(gfx, x - s(18), y + s(44), s(18), s(24), 0x2c1c08, 1, seed+10, s(3));
  wRect(gfx, x + s(18), y + s(44), s(18), s(24), 0x2c1c08, 1, seed+11, s(3));
  // Bark legs
  wRect(gfx, x - s(16), y + s(24), s(16), s(36), 0x0c1604, 1, seed+12, s(3));
  wRect(gfx, x + s(16), y + s(24), s(16), s(36), 0x0c1604, 1, seed+13, s(3));
  // Bark torso
  wRect(gfx, x, y, s(52), s(44), 0x0c1604, 1, seed+20, s(4));
  wRect(gfx, x, y, s(44), s(38), 0x2c1c08, 1, seed+21, 0);
  wRect(gfx, x, y, s(28), s(26), 0x4a3010, 0.8, seed+22, 0);
  // Arms + claws
  wRect(gfx, x - s(36), y - s(6), s(24), s(14), 0x0c1604, 1, seed+25, s(3));
  wRect(gfx, x + s(36), y - s(6), s(24), s(14), 0x0c1604, 1, seed+26, s(3));
  for (let c = 0; c < 3; c++) {
    wTri(gfx, [[x-s(48)-c*s(4),y-s(10)],[x-s(50)-c*s(4),y+s(6)],[x-s(52)-c*s(4),y-s(2)]], 0x5a0e06, 1, seed+30+c);
    wTri(gfx, [[x+s(48)+c*s(4),y-s(10)],[x+s(50)+c*s(4),y+s(6)],[x+s(52)+c*s(4),y-s(2)]], 0x5a0e06, 1, seed+33+c);
  }
  // Ivy cape behind
  wPoly(gfx, [[x-s(24),y-s(4)],[x-s(42),y+s(2)],[x-s(48),y+s(24)],[x-s(36),y+s(44)],[x-s(18),y+s(44)]], 0x2c4410, 0.7, seed+40, s(3));
  // Bark helm
  wCircle(gfx, x, y - s(30), s(24), 0x0c1604, 1, seed+50, s(4));
  wCircle(gfx, x, y - s(30), s(20), 0x2c1c08, 1, seed+51, 0);
  // Crown of thorns
  for (let i = 0; i < 7; i++) {
    const tx = x + (i - 3) * s(7);
    const th = s(14 + (i % 3) * 6);
    wTri(gfx, [[tx-s(3),y-s(42)],[tx+s(3),y-s(42)],[tx,y-s(42)-th]], 0x5a0e06, 1, seed+55+i);
  }
  // Glowing green eyes
  gfx.fillStyle(0x080c04, 0.95);
  gfx.fillCircle(x - s(8), y - s(30), s(5));
  gfx.fillCircle(x + s(8), y - s(30), s(5));
  gfx.fillStyle(0x6ec01e, 0.9);
  gfx.fillCircle(x - s(7), y - s(31), s(3));
  gfx.fillCircle(x + s(9), y - s(31), s(3));
}

// ─── DRAW LOOKUP (populated as floors are added) ────────────────

// ─── FLOOR 2: TIDEPOOL ──────────────────────────────────────────

function drawDrifter(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(40), s(36), 0x000000, 0.15, seed, 0);
  // Tentacles behind bell
  for (let i = 0; i < 6; i++) {
    const tx = x + (i - 2.5) * s(12);
    wRect(gfx, tx, y + s(30), s(4), s(40), 0x0c2038, 0.7, seed+10+i, 0);
  }
  // Bell dome
  wCircle(gfx, x, y - s(6), s(38), 0x0c1836, 1, seed+20, s(4));
  wCircle(gfx, x, y - s(8), s(32), 0x162a50, 1, seed+21, 0);
  wCircle(gfx, x, y - s(10), s(22), 0x203a6e, 0.8, seed+22, 0);
  // Glowing stripe
  wRect(gfx, x, y - s(10), s(28), s(5), 0x2870a8, 0.7, seed+25, 0);
  // Eyes
  gfx.fillStyle(0x030810, 0.95); gfx.fillCircle(x-s(8),y-s(8),s(4)); gfx.fillCircle(x+s(8),y-s(12),s(4));
  gfx.fillStyle(0x58b8e8, 0.85); gfx.fillCircle(x-s(7),y-s(9),s(2)); gfx.fillCircle(x+s(9),y-s(13),s(2));
}

function drawGulper(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(30), s(44), 0x000000, 0.15, seed, 0);
  // Body wedge
  wPoly(gfx, [[x-s(8),y-s(12)],[x+s(28),y-s(10)],[x+s(30),y+s(14)],[x-s(6),y+s(16)]], 0x0a1020, 1, seed+10, s(3));
  // Tail
  wPoly(gfx, [[x+s(26),y+s(10)],[x+s(44),y],[x+s(48),y+s(10)],[x+s(44),y+s(20)]], 0x080e1e, 1, seed+11, s(2));
  // Upper jaw — massive
  wPoly(gfx, [[x-s(50),y-s(6)],[x+s(26),y-s(8)],[x+s(24),y+s(4)],[x-s(46),y+s(8)]], 0x060810, 1, seed+20, s(4));
  // Lower jaw
  wPoly(gfx, [[x-s(50),y+s(8)],[x+s(24),y+s(8)],[x+s(16),y+s(24)],[x-s(42),y+s(22)]], 0x060810, 1, seed+21, s(3));
  // Teeth
  for (let t = -4; t <= 2; t++) {
    wTri(gfx, [[x+t*s(10)-s(3),y-s(6)],[x+t*s(10)+s(3),y-s(6)],[x+t*s(10),y+s(6)]], 0xc8dce8, 0.9, seed+30+t);
  }
  // Big eye
  gfx.fillStyle(0x050810, 0.95); gfx.fillCircle(x+s(20),y-s(4),s(6));
  gfx.fillStyle(0x1abea8, 0.85); gfx.fillCircle(x+s(21),y-s(3),s(3));
  // Lure
  wRect(gfx, x+s(12), y-s(30), s(3), s(24), 0x070c18, 0.8, seed+40, 0);
  wCircle(gfx, x+s(12), y-s(42), s(8), 0x38d898, 0.7, seed+41, 0);
}

function drawInkspitter(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(40), s(32), 0x000000, 0.15, seed, 0);
  // Arms behind mantle
  for (let i = 0; i < 6; i++) {
    const a = (i/5 - 0.5) * 1.6;
    wRect(gfx, x + Math.cos(a)*s(30), y + s(20) + Math.sin(a)*s(20), s(5), s(30), 0x0c1030, 0.75, seed+10+i, 0);
  }
  // Mantle cone
  wPoly(gfx, [[x-s(24),y+s(24)],[x-s(20),y-s(6)],[x-s(10),y-s(26)],[x,y-s(34)],[x+s(10),y-s(26)],[x+s(20),y-s(6)],[x+s(24),y+s(24)]], 0x0e1232, 1, seed+20, s(4));
  wPoly(gfx, [[x-s(18),y+s(20)],[x-s(14),y-s(4)],[x-s(6),y-s(20)],[x,y-s(28)],[x+s(6),y-s(20)],[x+s(14),y-s(4)],[x+s(18),y+s(20)]], 0x162048, 1, seed+21, 0);
  // Stripe
  wRect(gfx, x, y+s(4), s(24), s(5), 0x2848a0, 0.6, seed+25, 0);
  // Eyes hexagonal
  gfx.fillStyle(0x080a1e, 0.95); gfx.fillCircle(x-s(6),y-s(2),s(5)); gfx.fillCircle(x+s(8),y-s(6),s(5));
  gfx.fillStyle(0x1ab8d8, 0.8); gfx.fillCircle(x-s(5),y-s(3),s(2.5)); gfx.fillCircle(x+s(9),y-s(7),s(2.5));
  // Beak
  wTri(gfx, [[x-s(3),y+s(6)],[x+s(3),y+s(6)],[x,y+s(14)]], 0x06080e, 1, seed+30);
}

function drawAbyssalEel(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(56), s(22), 0x000000, 0.15, seed, 0);
  // Serpentine body segments
  const segs = [[0,-36],[s(10),-18],[s(4),0],[-s(6),s(18)],[s(2),s(36)],[-s(4),s(50)]];
  for (let i = 0; i < segs.length - 1; i++) {
    const w = s(16 - i * 2);
    wRect(gfx, x+segs[i][0], y+segs[i][1], w, s(22), i < 2 ? 0x070b1a : 0x0c1434, 1, seed+10+i, s(3));
  }
  // Head
  wCircle(gfx, x, y - s(42), s(22), 0x05091a, 1, seed+20, s(4));
  wCircle(gfx, x, y - s(42), s(16), 0x0e1830, 1, seed+21, 0);
  // Fangs
  wTri(gfx, [[x-s(8),y-s(30)],[x-s(4),y-s(30)],[x-s(6),y-s(20)]], 0xc4d8e4, 0.9, seed+25);
  wTri(gfx, [[x+s(4),y-s(30)],[x+s(8),y-s(30)],[x+s(6),y-s(20)]], 0xc4d8e4, 0.9, seed+26);
  // Eyes
  gfx.fillStyle(0x030610, 0.95); gfx.fillCircle(x-s(8),y-s(44),s(4)); gfx.fillCircle(x+s(8),y-s(44),s(4));
  gfx.fillStyle(0x1cd8c8, 0.85); gfx.fillCircle(x-s(7),y-s(45),s(2)); gfx.fillCircle(x+s(9),y-s(45),s(2));
  // Spine orbs
  for (let i = 1; i < segs.length; i += 2) {
    gfx.fillStyle(0x18b898, 0.5); gfx.fillCircle(x+segs[i][0], y+segs[i][1], s(3));
  }
}

function drawThePressure(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(44), s(42), 0x000000, 0.15, seed, 0);
  // Nautilus shell D-shape
  wCircle(gfx, x + s(6), y, s(46), 0x060c1c, 1, seed+1, s(5));
  // Chamber bands
  const bands = [0x0e1830, 0x122240, 0x183050, 0x1e3c62, 0x244878];
  bands.forEach((c, i) => wCircle(gfx, x + s(6), y, s(36 - i * 6), c, 1, seed+10+i, 0));
  // Tentacles from left side
  for (let i = 0; i < 5; i++) {
    const ty = y + (i - 2) * s(12);
    wRect(gfx, x - s(30), ty, s(30), s(4), 0x0a1630, 0.7, seed+20+i, 0);
  }
  // Eye on shell
  gfx.fillStyle(0x040a14, 0.95); gfx.fillCircle(x+s(14),y,s(6));
  gfx.fillStyle(0x38b8d8, 0.8); gfx.fillCircle(x+s(15),y-s(1),s(3));
  gfx.fillStyle(0x78e0f4, 0.9); gfx.fillCircle(x+s(14),y-s(2),s(1.5));
}

// ─── FLOOR 3: CLOUD MAZE ───────────────────────────────────────

function drawStormwing(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(30), s(50), 0x000000, 0.12, seed, 0);
  // Wings
  wPoly(gfx, [[x,y-s(4)],[x-s(16),y],[x-s(44),y-s(10)],[x-s(60),y+s(4)],[x-s(56),y+s(18)],[x-s(30),y+s(18)],[x,y+s(8)]], 0x141e38, 1, seed+1, s(4));
  wPoly(gfx, [[x,y-s(4)],[x+s(16),y],[x+s(44),y-s(10)],[x+s(60),y+s(4)],[x+s(56),y+s(18)],[x+s(30),y+s(18)],[x,y+s(8)]], 0x141e38, 1, seed+2, s(4));
  // Wing highlights
  wPoly(gfx, [[x,y],[x-s(12),y+s(2)],[x-s(36),y-s(4)],[x-s(48),y+s(6)],[x-s(44),y+s(14)],[x-s(22),y+s(14)]], 0x1e2e52, 1, seed+3, 0);
  wPoly(gfx, [[x,y],[x+s(12),y+s(2)],[x+s(36),y-s(4)],[x+s(48),y+s(6)],[x+s(44),y+s(14)],[x+s(22),y+s(14)]], 0x1e2e52, 1, seed+4, 0);
  // Body
  wCircle(gfx, x, y, s(16), 0x141e38, 1, seed+10, s(3));
  wCircle(gfx, x, y, s(12), 0x1e2e52, 1, seed+11, 0);
  // Lightning scar on chest
  gfx.lineStyle(s(2.5), 0xf0e01e, 0.8);
  gfx.beginPath(); gfx.moveTo(x-s(4),y-s(6)); gfx.lineTo(x+s(4),y+s(6)); gfx.strokePath();
  gfx.beginPath(); gfx.moveTo(x+s(4),y-s(6)); gfx.lineTo(x-s(4),y+s(6)); gfx.strokePath();
  // Eagle head
  wCircle(gfx, x, y - s(26), s(14), 0x141e38, 1, seed+15, s(3));
  wCircle(gfx, x, y - s(26), s(10), 0x1e2e52, 1, seed+16, 0);
  // Beak
  wTri(gfx, [[x-s(6),y-s(28)],[x+s(6),y-s(28)],[x,y-s(20)]], 0x7880a0, 1, seed+17);
  // Eyes
  gfx.fillStyle(0xf0e01e, 0.85); gfx.fillCircle(x-s(5),y-s(28),s(2.5)); gfx.fillCircle(x+s(5),y-s(28),s(2.5));
  // Lightning bolt feather tips
  gfx.fillStyle(0xf0e01e, 0.7);
  gfx.fillCircle(x-s(56),y+s(14),s(3)); gfx.fillCircle(x+s(56),y+s(14),s(3));
  gfx.fillCircle(x-s(48),y+s(4),s(2)); gfx.fillCircle(x+s(48),y+s(4),s(2));
}

function drawHailshot(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(26), s(44), 0x000000, 0.12, seed, 0);
  // Cloud body
  wCircle(gfx, x, y, s(40), 0x4a5068, 1, seed+1, s(4));
  wCircle(gfx, x, y - s(2), s(34), 0x62687e, 1, seed+2, 0);
  wCircle(gfx, x, y - s(4), s(24), 0x7e8698, 0.8, seed+3, 0);
  // Icicle spines
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bx = x + Math.cos(a) * s(32), by = y + Math.sin(a) * s(32);
    const tx = x + Math.cos(a) * s(52), ty = y + Math.sin(a) * s(52);
    wTri(gfx, [[bx - Math.sin(a)*s(4), by + Math.cos(a)*s(4)], [tx, ty], [bx + Math.sin(a)*s(4), by - Math.cos(a)*s(4)]], 0x4e7298, 1, seed+10+i);
  }
  // Scowling face
  gfx.fillStyle(0x181c2c, 0.9); gfx.fillCircle(x-s(10),y-s(2),s(4)); gfx.fillCircle(x+s(10),y-s(2),s(4));
  gfx.fillStyle(0xb8d4f4, 0.7); gfx.fillCircle(x-s(9),y-s(3),s(2)); gfx.fillCircle(x+s(11),y-s(3),s(2));
  gfx.lineStyle(s(2), 0x181c2c, 0.7);
  gfx.beginPath(); gfx.moveTo(x-s(6),y+s(8)); gfx.lineTo(x+s(6),y+s(8)); gfx.strokePath();
}

function drawCycloneImp(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(54), s(16), 0x000000, 0.15, seed, 0);
  // Funnel layers (widest at top, narrow at bottom)
  wCircle(gfx, x, y - s(16), s(38), 0x1e2640, 1, seed+1, s(4));
  wCircle(gfx, x, y - s(10), s(30), 0x2a3458, 1, seed+2, 0);
  wCircle(gfx, x, y - s(4), s(20), 0x3a4672, 0.9, seed+3, 0);
  wRect(gfx, x, y + s(10), s(16), s(14), 0x4a589a, 0.8, seed+4, 0);
  // Spinning tip
  wTri(gfx, [[x-s(4),y+s(34)],[x+s(4),y+s(34)],[x,y+s(52)]], 0x1e2640, 1, seed+5);
  // Tiny arms
  wCircle(gfx, x - s(34), y - s(4), s(8), 0x1e2640, 1, seed+10, s(2));
  wCircle(gfx, x + s(34), y - s(4), s(8), 0x1e2640, 1, seed+11, s(2));
  // Face at top
  gfx.fillStyle(0x1e2640, 0.95); gfx.fillCircle(x-s(10),y-s(24),s(4)); gfx.fillCircle(x+s(10),y-s(24),s(4));
  gfx.fillStyle(0xe8d81a, 0.8); gfx.fillCircle(x-s(9),y-s(25),s(2)); gfx.fillCircle(x+s(11),y-s(25),s(2));
  wCircle(gfx, x, y - s(16), s(6), 0x0a0c14, 0.7, seed+15, 0);
}

function drawThunderclap(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(44), s(30), 0x000000, 0.12, seed, 0);
  // Two cloud-hands
  // Left hand
  wCircle(gfx, x - s(26), y, s(24), 0x2e3450, 1, seed+1, s(4));
  wCircle(gfx, x - s(26), y, s(18), 0x404868, 1, seed+2, 0);
  for (let f = 0; f < 4; f++) { wCircle(gfx, x-s(26)+(f-1.5)*s(8), y-s(20), s(8), 0x2e3450, 1, seed+10+f, s(2)); }
  // Right hand
  wCircle(gfx, x + s(26), y, s(24), 0x2e3450, 1, seed+5, s(4));
  wCircle(gfx, x + s(26), y, s(18), 0x404868, 1, seed+6, 0);
  for (let f = 0; f < 4; f++) { wCircle(gfx, x+s(26)+(f-1.5)*s(8), y-s(20), s(8), 0x2e3450, 1, seed+14+f, s(2)); }
  // Lightning between hands
  gfx.lineStyle(s(3), 0xf0e01e, 0.8);
  gfx.beginPath(); gfx.moveTo(x-s(8),y); gfx.lineTo(x,y-s(6)); gfx.lineTo(x+s(8),y); gfx.strokePath();
  gfx.lineStyle(s(2), 0xffffff, 0.5);
  gfx.beginPath(); gfx.moveTo(x-s(6),y+s(4)); gfx.lineTo(x+s(6),y-s(4)); gfx.strokePath();
}

function drawSkywhale(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(50), s(50), 0x000000, 0.12, seed, 0);
  // Tail
  wPoly(gfx, [[x+s(40),y+s(16)],[x+s(54),y+s(6)],[x+s(60),y+s(14)],[x+s(54),y+s(24)]], 0x303e52, 1, seed+1, s(3));
  // Body — massive oval
  wCircle(gfx, x, y + s(6), s(50), 0x303e52, 1, seed+5, s(5));
  wCircle(gfx, x, y + s(4), s(42), 0x404e66, 1, seed+6, 0);
  wCircle(gfx, x, y + s(2), s(30), 0x526280, 0.7, seed+7, 0);
  // Dorsal fin
  wTri(gfx, [[x-s(4),y-s(28)],[x+s(4),y-s(28)],[x,y-s(46)]], 0x222e40, 1, seed+10);
  // Pectoral fins
  wPoly(gfx, [[x-s(44),y+s(2)],[x-s(58),y-s(6)],[x-s(62),y+s(4)],[x-s(56),y+s(12)]], 0x222e40, 1, seed+11, s(2));
  wPoly(gfx, [[x+s(44),y+s(2)],[x+s(58),y-s(6)],[x+s(62),y+s(4)],[x+s(56),y+s(12)]], 0x222e40, 1, seed+12, s(2));
  // Tiny dangling legs
  for (let l = 0; l < 4; l++) { wRect(gfx, x+(l-1.5)*s(10), y+s(40), s(5), s(14), 0x404e66, 0.7, seed+20+l, 0); }
  // Big eye
  gfx.fillStyle(0x080c14, 0.95); gfx.fillCircle(x-s(20),y-s(2),s(10));
  gfx.fillStyle(0x8abcd4, 0.8); gfx.fillCircle(x-s(20),y-s(2),s(7));
  gfx.fillStyle(0x030608, 0.9); gfx.fillCircle(x-s(20),y-s(2),s(3));
  gfx.fillStyle(0xcce8f4, 0.9); gfx.fillCircle(x-s(22),y-s(5),s(2));
  // Baleen mouth
  wRect(gfx, x, y + s(24), s(50), s(10), 0x18202e, 0.8, seed+30, s(2));
}

// ─── FLOOR 4: EMBER CAVES ───────────────────────────────────────

function drawCindercrab(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y + s(36), s(40), 0x000000, 0.15, seed, 0);
  // 6 legs
  for (let i = 0; i < 3; i++) {
    wRect(gfx, x-s(22+i*8), y+s(14+i*8), s(20), s(8), 0x0e0a0c, 1, seed+i, s(2));
    wRect(gfx, x+s(22+i*8), y+s(14+i*8), s(20), s(8), 0x0e0a0c, 1, seed+3+i, s(2));
  }
  // Shell
  wCircle(gfx, x, y, s(38), 0x0e0a0c, 1, seed+10, s(5));
  wCircle(gfx, x, y, s(32), 0x1a1418, 1, seed+11, 0);
  wCircle(gfx, x, y, s(22), 0x2c2028, 0.8, seed+12, 0);
  // Magma seams
  wRect(gfx, x, y, s(36), s(5), 0xe04008, 0.8, seed+15, 0);
  gfx.fillStyle(0xe04008, 0.7); gfx.fillCircle(x, y-s(10), s(5)); gfx.fillCircle(x, y+s(14), s(5));
  // Big claw right
  wCircle(gfx, x+s(40), y-s(4), s(16), 0x0e0a0c, 1, seed+20, s(3));
  wCircle(gfx, x+s(40), y-s(4), s(12), 0x1a1418, 1, seed+21, 0);
  // Small claw left
  wCircle(gfx, x-s(36), y-s(2), s(12), 0x0e0a0c, 1, seed+22, s(2));
  // Eye stalks
  wRect(gfx, x-s(10), y-s(24), s(4), s(16), 0x0e0a0c, 1, seed+25, 0);
  wRect(gfx, x+s(10), y-s(24), s(4), s(16), 0x0e0a0c, 1, seed+26, 0);
  gfx.fillStyle(0xe04008, 0.8); gfx.fillCircle(x-s(10),y-s(30),s(3)); gfx.fillCircle(x+s(10),y-s(30),s(3));
}

function drawAshwalker(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(54), s(20), 0x000000, 0.15, seed, 0);
  // Narrow legs
  wRect(gfx, x-s(10), y+s(28), s(12), s(36), 0x242018, 1, seed+1, s(3));
  wRect(gfx, x+s(10), y+s(28), s(12), s(36), 0x242018, 1, seed+2, s(3));
  wRect(gfx, x-s(12), y+s(46), s(16), s(8), 0x242018, 1, seed+3, s(2));
  wRect(gfx, x+s(8), y+s(46), s(16), s(8), 0x242018, 1, seed+4, s(2));
  // Torso
  wRect(gfx, x, y, s(34), s(40), 0x242018, 1, seed+10, s(4));
  wRect(gfx, x, y, s(26), s(34), 0x38342c, 1, seed+11, 0);
  // Ember crack
  wRect(gfx, x, y+s(2), s(22), s(4), 0xde3e0e, 0.8, seed+12, 0);
  gfx.fillStyle(0xde3e0e, 0.7); gfx.fillCircle(x, y-s(6), s(4)); gfx.fillCircle(x, y+s(14), s(4));
  // Arms + claws
  wRect(gfx, x-s(30), y-s(6), s(26), s(10), 0x242018, 1, seed+15, s(3));
  wRect(gfx, x+s(30), y-s(6), s(26), s(10), 0x242018, 1, seed+16, s(3));
  // Skull head
  wRect(gfx, x, y-s(28), s(30), s(26), 0x242018, 1, seed+20, s(4));
  wRect(gfx, x, y-s(28), s(24), s(20), 0x38342c, 1, seed+21, 0);
  // Ember eyes
  gfx.fillStyle(0xde3e0e, 0.85); gfx.fillCircle(x-s(6),y-s(30),s(4)); gfx.fillCircle(x+s(6),y-s(30),s(4));
  gfx.fillStyle(0xf06e28, 0.7); gfx.fillCircle(x-s(5),y-s(31),s(2)); gfx.fillCircle(x+s(7),y-s(31),s(2));
}

function drawMagmaToad(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(38), s(42), 0x000000, 0.15, seed, 0);
  // Wide legs
  wCircle(gfx, x-s(34), y+s(28), s(14), 0x1c0c04, 1, seed+1, s(3));
  wCircle(gfx, x+s(34), y+s(28), s(14), 0x1c0c04, 1, seed+2, s(3));
  // Huge round body
  wCircle(gfx, x, y+s(4), s(42), 0x1c0c04, 1, seed+10, s(5));
  wCircle(gfx, x, y+s(2), s(36), 0x2e1408, 1, seed+11, 0);
  wCircle(gfx, x, y, s(24), 0x3e2010, 0.7, seed+12, 0);
  // Warts
  wCircle(gfx, x-s(16), y+s(6), s(6), 0x1c0c04, 0.8, seed+15, 0);
  wCircle(gfx, x+s(14), y-s(2), s(5), 0x1c0c04, 0.8, seed+16, 0);
  wCircle(gfx, x, y+s(16), s(7), 0x1c0c04, 0.8, seed+17, 0);
  // Gaping mouth with lava
  wRect(gfx, x, y+s(12), s(36), s(14), 0xe04a08, 0.8, seed+20, s(2));
  wRect(gfx, x, y+s(12), s(28), s(8), 0xf08028, 0.6, seed+21, 0);
  // Bulging eyes on top
  wCircle(gfx, x-s(22), y-s(18), s(12), 0x1c0c04, 1, seed+25, s(3));
  wCircle(gfx, x+s(22), y-s(18), s(12), 0x1c0c04, 1, seed+26, s(3));
  gfx.fillStyle(0xe04a08, 0.85); gfx.fillCircle(x-s(22),y-s(18),s(6)); gfx.fillCircle(x+s(22),y-s(18),s(6));
  gfx.fillStyle(0x030200, 0.9); gfx.fillCircle(x-s(22),y-s(18),s(3)); gfx.fillCircle(x+s(22),y-s(18),s(3));
}

function drawSpineshard(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(54), s(24), 0x000000, 0.15, seed, 0);
  // Stumpy base
  wRect(gfx, x-s(12), y+s(40), s(14), s(18), 0x0e0a0c, 1, seed+1, s(2));
  wRect(gfx, x+s(12), y+s(40), s(14), s(18), 0x0e0a0c, 1, seed+2, s(2));
  // Central pillar
  wRect(gfx, x, y+s(6), s(36), s(56), 0x0e0a0c, 1, seed+10, s(4));
  wRect(gfx, x, y+s(6), s(28), s(48), 0x1a1418, 1, seed+11, 0);
  // Magma seams
  wRect(gfx, x, y+s(4), s(28), s(4), 0xe04008, 0.8, seed+12, 0);
  gfx.fillStyle(0xe04008, 0.6); gfx.fillCircle(x,y-s(8),s(4)); gfx.fillCircle(x,y+s(18),s(4));
  // Obsidian spines
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx = x + Math.cos(a) * s(18), by = y + s(6) + Math.sin(a) * s(24);
    const tx = x + Math.cos(a) * s(42), ty = y + s(6) + Math.sin(a) * s(42);
    wTri(gfx, [[bx-Math.sin(a)*s(4),by+Math.cos(a)*s(4)],[tx,ty],[bx+Math.sin(a)*s(4),by-Math.cos(a)*s(4)]], 0x0e0a0c, 1, seed+20+i);
  }
  // Eye slits
  gfx.fillStyle(0xe04008, 0.7); gfx.fillCircle(x-s(6),y-s(2),s(3)); gfx.fillCircle(x+s(6),y-s(2),s(3));
}

function drawPyroclast(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(36), s(34), 0x000000, 0.15, seed, 0);
  // Body — big molten sphere
  wCircle(gfx, x, y, s(38), 0x1a0804, 1, seed+1, s(5));
  wCircle(gfx, x, y, s(32), 0x2c1208, 1, seed+2, 0);
  wCircle(gfx, x, y, s(24), 0x3e1c08, 0.8, seed+3, 0);
  // Crust plates
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    wCircle(gfx, x+Math.cos(a)*s(22), y+Math.sin(a)*s(22), s(8), 0x261e16, 0.7, seed+10+i, 0);
  }
  // Lava cracks
  gfx.lineStyle(s(2.5), 0xe04808, 0.7);
  gfx.beginPath(); gfx.moveTo(x-s(14),y-s(14)); gfx.lineTo(x+s(14),y+s(14)); gfx.strokePath();
  gfx.beginPath(); gfx.moveTo(x+s(14),y-s(14)); gfx.lineTo(x-s(14),y+s(14)); gfx.strokePath();
  // Inner glow
  gfx.fillStyle(0xf0a010, 0.35); gfx.fillCircle(x, y, s(14));
  // Face
  gfx.fillStyle(0xe04808, 0.85); gfx.fillCircle(x-s(8),y-s(6),s(3)); gfx.fillCircle(x+s(8),y-s(6),s(3));
  gfx.lineStyle(s(2), 0xe04808, 0.6);
  gfx.beginPath(); gfx.moveTo(x-s(6),y+s(8)); gfx.lineTo(x+s(6),y+s(8)); gfx.strokePath();
}

// ─── FLOOR 5: ARCANE ────────────────────────────────────────────

function drawRunebound(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(54), s(26), 0x000000, 0.15, seed, 0);
  // Armored legs
  wRect(gfx, x-s(12), y+s(28), s(14), s(34), 0x1e1430, 1, seed+1, s(3));
  wRect(gfx, x+s(12), y+s(28), s(14), s(34), 0x1e1430, 1, seed+2, s(3));
  wRect(gfx, x-s(16), y+s(46), s(20), s(10), 0x1e1430, 1, seed+3, s(2));
  wRect(gfx, x+s(12), y+s(46), s(20), s(10), 0x1e1430, 1, seed+4, s(2));
  // Breastplate
  wRect(gfx, x, y, s(42), s(40), 0x1e1430, 1, seed+10, s(4));
  wRect(gfx, x, y, s(34), s(34), 0x2e2048, 1, seed+11, 0);
  wRect(gfx, x, y, s(22), s(22), 0x403060, 0.7, seed+12, 0);
  // Void chest
  gfx.fillStyle(0x060410, 0.9); gfx.fillCircle(x, y+s(4), s(10));
  gfx.fillStyle(0xc080f0, 0.4); gfx.fillCircle(x, y+s(4), s(7));
  // Pauldrons + gauntlets
  wCircle(gfx, x-s(28), y-s(8), s(12), 0x1e1430, 1, seed+15, s(3));
  wCircle(gfx, x+s(28), y-s(8), s(12), 0x1e1430, 1, seed+16, s(3));
  wCircle(gfx, x-s(38), y+s(2), s(10), 0x1e1430, 1, seed+17, s(2));
  wCircle(gfx, x+s(38), y+s(2), s(10), 0x1e1430, 1, seed+18, s(2));
  gfx.fillStyle(0xc080f0, 0.35); gfx.fillCircle(x-s(38),y+s(2),s(6)); gfx.fillCircle(x+s(38),y+s(2),s(6));
  // Great helm
  wRect(gfx, x, y-s(30), s(34), s(28), 0x1e1430, 1, seed+20, s(4));
  wRect(gfx, x, y-s(30), s(28), s(22), 0x2e2048, 1, seed+21, 0);
  // Visor slit — void glow
  wRect(gfx, x, y-s(30), s(28), s(6), 0x060410, 0.9, seed+22, 0);
  gfx.fillStyle(0xc080f0, 0.7); gfx.fillCircle(x-s(6),y-s(30),s(2)); gfx.fillCircle(x+s(6),y-s(30),s(2));
  // Crest
  wTri(gfx, [[x-s(3),y-s(42)],[x+s(3),y-s(42)],[x,y-s(54)]], 0x2e2048, 1, seed+25);
}

function drawHexweave(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(44), s(40), 0x000000, 0.12, seed, 0);
  // Background disc
  wCircle(gfx, x, y, s(44), 0x1c1050, 1, seed+1, s(5));
  wCircle(gfx, x, y, s(38), 0x18103e, 1, seed+2, 0);
  // Hex ring nodes
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const nx = x+Math.cos(a)*s(34), ny = y+Math.sin(a)*s(34);
    wCircle(gfx, nx, ny, s(7), 0x2e1e90, 1, seed+10+i, s(2));
    gfx.lineStyle(s(1.5), 0x4838c0, 0.5);
    const na = ((i+1)/6)*Math.PI*2;
    gfx.beginPath(); gfx.moveTo(nx,ny); gfx.lineTo(x+Math.cos(na)*s(34),y+Math.sin(na)*s(34)); gfx.strokePath();
  }
  // Center eye
  wCircle(gfx, x, y, s(14), 0x1c1050, 1, seed+20, s(3));
  wCircle(gfx, x, y, s(10), 0x260e68, 1, seed+21, 0);
  gfx.fillStyle(0x9060f8, 0.6); gfx.fillCircle(x, y, s(6));
  gfx.fillStyle(0xffffff, 0.4); gfx.fillCircle(x-s(2), y-s(2), s(2));
}

function drawGrimoire(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(54), s(32), 0x000000, 0.12, seed, 0);
  // Bookmark legs
  wRect(gfx, x-s(18), y+s(38), s(8), s(24), 0x1c1008, 1, seed+1, s(2));
  wRect(gfx, x+s(18), y+s(38), s(8), s(24), 0x1c1008, 1, seed+2, s(2));
  wRect(gfx, x-s(18), y+s(44), s(10), s(8), 0xa07010, 0.7, seed+3, 0);
  wRect(gfx, x+s(18), y+s(44), s(10), s(8), 0xa07010, 0.7, seed+4, 0);
  // Book body — back cover
  wRect(gfx, x, y, s(60), s(64), 0x1c1008, 1, seed+10, s(4));
  // Pages
  wRect(gfx, x+s(2), y, s(52), s(58), 0xd8cbb0, 1, seed+11, 0);
  wRect(gfx, x+s(4), y, s(48), s(54), 0xf0e8d0, 1, seed+12, 0);
  // Front cover
  wRect(gfx, x-s(2), y-s(2), s(56), s(60), 0x2a1c10, 1, seed+13, s(3));
  wRect(gfx, x-s(2), y-s(2), s(48), s(54), 0x3c2c1a, 1, seed+14, 0);
  // Spine
  wRect(gfx, x-s(28), y, s(8), s(64), 0x140c04, 1, seed+15, s(2));
  // Gold clasp
  wRect(gfx, x+s(18), y, s(12), s(10), 0xa07010, 1, seed+16, s(2));
  gfx.fillStyle(0xd0a030, 0.7); gfx.fillCircle(x+s(18), y, s(3));
  // Eyes peering over top
  wCircle(gfx, x-s(8), y-s(30), s(7), 0x1c1008, 1, seed+20, s(2));
  wCircle(gfx, x+s(8), y-s(30), s(7), 0x1c1008, 1, seed+21, s(2));
  gfx.fillStyle(0x0a0804, 0.95); gfx.fillCircle(x-s(8),y-s(30),s(5));
  gfx.fillCircle(x+s(8),y-s(30),s(5));
  gfx.fillStyle(0xd0a030, 0.8); gfx.fillCircle(x-s(8),y-s(30),s(3));
  gfx.fillCircle(x+s(8),y-s(30),s(3));
  gfx.fillStyle(0x080604, 0.9); gfx.fillCircle(x-s(8),y-s(30),s(1.5));
  gfx.fillCircle(x+s(8),y-s(30),s(1.5));
}

function drawFamiliar(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(40), s(34), 0x000000, 0.12, seed, 0);
  // Shape-shifting body — draw as a plus/cross shape
  wRect(gfx, x, y, s(16), s(64), 0x100820, 1, seed+1, s(4));
  wRect(gfx, x, y, s(64), s(16), 0x100820, 1, seed+2, s(4));
  // Inner layers
  wRect(gfx, x, y, s(12), s(52), 0x201040, 1, seed+3, 0);
  wRect(gfx, x, y, s(52), s(12), 0x201040, 1, seed+4, 0);
  wRect(gfx, x, y, s(8), s(36), 0x302060, 0.7, seed+5, 0);
  wRect(gfx, x, y, s(36), s(8), 0x302060, 0.7, seed+6, 0);
  // Glow
  gfx.fillStyle(0xc040f0, 0.2); gfx.fillCircle(x, y, s(28));
  // Eyes at center
  gfx.fillStyle(0x0a0616, 0.95); gfx.fillCircle(x-s(6),y,s(6)); gfx.fillCircle(x+s(6),y,s(6));
  gfx.fillStyle(0xc040f0, 0.8); gfx.fillCircle(x-s(6),y,s(4)); gfx.fillCircle(x+s(6),y,s(4));
  gfx.fillStyle(0xf0d0ff, 0.9); gfx.fillCircle(x-s(6),y,s(2)); gfx.fillCircle(x+s(6),y,s(2));
}

function drawTheTheorem(gfx, x, y, sc, seed) {
  const s = v => v * sc;
  wCircle(gfx, x, y+s(40), s(54), 0x000000, 0.12, seed, 0);
  // Ornate frame — outer
  wRect(gfx, x, y, s(104), s(72), 0x080614, 1, seed+1, s(5));
  wRect(gfx, x, y, s(96), s(64), 0x18102e, 1, seed+2, 0);
  wRect(gfx, x, y, s(84), s(54), 0x241c48, 1, seed+3, 0);
  wRect(gfx, x, y, s(72), s(44), 0x302460, 0.8, seed+4, 0);
  // Corner ornaments
  const corners = [[-s(44),-s(28)],[s(44),-s(28)],[s(44),s(28)],[-s(44),s(28)]];
  corners.forEach((c, i) => {
    wCircle(gfx, x+c[0], y+c[1], s(8), 0x080614, 1, seed+10+i, s(2));
    wCircle(gfx, x+c[0], y+c[1], s(5), 0xb08010, 1, seed+14+i, 0);
  });
  // Interior void
  wRect(gfx, x, y, s(64), s(36), 0x080614, 0.9, seed+20, 0);
  gfx.fillStyle(0x7040d8, 0.2); gfx.fillCircle(x, y, s(22));
  // Equation symbols
  const syms = ['+','-','x','?','='];
  gfx.fillStyle(0xe0d0ff, 0.85);
  syms.forEach((sym, i) => {
    const sx = x + (i - 2) * s(12);
    gfx.save();
    gfx.fillStyle(0xe0d0ff, 0.85);
    // Can't use fillText in Phaser Graphics — draw symbols as shapes
    if (sym === '+') { wRect(gfx, sx, y, s(3), s(10), 0xe0d0ff, 0.85, seed+30+i, 0); wRect(gfx, sx, y, s(10), s(3), 0xe0d0ff, 0.85, seed+35+i, 0); }
    else if (sym === '-') { wRect(gfx, sx, y, s(10), s(3), 0xe0d0ff, 0.85, seed+30+i, 0); }
    else if (sym === 'x') { wRect(gfx, sx, y, s(3), s(10), 0xe0d0ff, 0.7, seed+30+i, 0); wRect(gfx, sx, y, s(10), s(3), 0xe0d0ff, 0.7, seed+35+i, 0); }
    else if (sym === '?') { wCircle(gfx, sx, y-s(2), s(4), 0xe0d0ff, 0.85, seed+30+i, 0); gfx.fillStyle(0xe0d0ff, 0.85); gfx.fillCircle(sx, y+s(4), s(1.5)); }
    else { wRect(gfx, sx, y-s(2), s(8), s(2), 0xd0b020, 0.8, seed+30+i, 0); wRect(gfx, sx, y+s(2), s(8), s(2), 0xd0b020, 0.8, seed+35+i, 0); }
  });
  // Two enormous eyes
  gfx.fillStyle(0x050410, 0.95); gfx.fillCircle(x-s(34),y,s(9)); gfx.fillCircle(x+s(34),y,s(9));
  gfx.fillStyle(0x7040d8, 0.8); gfx.fillCircle(x-s(34),y,s(6)); gfx.fillCircle(x+s(34),y,s(6));
  gfx.fillStyle(0xb888ff, 0.9); gfx.fillCircle(x-s(34),y,s(3)); gfx.fillCircle(x+s(34),y,s(3));
  gfx.fillStyle(0xffffff, 0.8); gfx.fillCircle(x-s(36),y-s(2),s(1.5)); gfx.fillCircle(x+s(32),y-s(2),s(1.5));
  // Gold rule lines
  gfx.lineStyle(s(1.5), 0xb08010, 0.4);
  gfx.beginPath(); gfx.moveTo(x-s(44),y-s(28)); gfx.lineTo(x+s(44),y-s(28)); gfx.strokePath();
  gfx.beginPath(); gfx.moveTo(x-s(44),y+s(28)); gfx.lineTo(x+s(44),y+s(28)); gfx.strokePath();
}

const MONSTER_DRAW = {
  sproutling: drawSproutling, thornwall: drawThornwall, blossomfiend: drawBlossomFiend,
  puffshroom: drawPuffshroom, briarking: drawBriarKing,
  drifter: drawDrifter, gulper: drawGulper, inkspitter: drawInkspitter,
  abyssaleel: drawAbyssalEel, pressure: drawThePressure,
  stormwing: drawStormwing, hailshot: drawHailshot, cycloneimp: drawCycloneImp,
  thunderclap: drawThunderclap, skywhale: drawSkywhale,
  cindercrab: drawCindercrab, ashwalker: drawAshwalker, magmatoad: drawMagmaToad,
  spineshard: drawSpineshard, pyroclast: drawPyroclast,
  runebound: drawRunebound, hexweave: drawHexweave, grimoire: drawGrimoire,
  familiar: drawFamiliar, theorem: drawTheTheorem,
};
