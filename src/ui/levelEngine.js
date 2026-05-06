/**
 * Level engine — ported directly from the v0.2 reference guide.
 *
 * Renders tiles onto offscreen canvases using the papercut aesthetic:
 * bezier-curve hedge bumps, gradient shadows (LV_cut), wobbled stone
 * rectangles, layered depth. Each tile is pre-rendered once and cached
 * as a Phaser texture.
 *
 * The reference used global LV_G / LV_PAL / LV_mkRng. This port
 * wraps them into a render context passed to each draw function.
 */

import { mkRng } from './legacyRenderer.js';

export var LV_PAL = {
  dirt: '#3c2010', dirtL: '#4e2e18', soil: '#5a3820',
  stone: '#c8b890', stoneD: '#a89870', stoneL: '#dccca8', mortar: '#787060',
  hedge0: '#1a3c10', hedge1: '#2a5c1e', hedge2: '#3a7828', hedge3: '#4a9830', hedgeHL: '#60b840',
  rose: '#c02860', roseL: '#e84888', gold: '#c07818', goldL: '#e8a030', cream: '#f0e4cc',
  pond0: '#1a3040', pond1: '#2a5060', pond2: '#3a7080', pondHL: '#6ab0c8',
  fairy0: '#88aaff', fairy1: '#ffaa44', fairy2: '#44ffaa',
};

export var LV_TILE_SIZE = 56;
export var LV_COLS = 19;
export var LV_ROWS = 25;

var _G = null;

function cut(color, elev, fn) {
  _G.save();
  if (elev > 0) {
    _G.shadowColor = 'rgba(14,6,2,0.58)';
    _G.shadowBlur = elev * 2.8;
    _G.shadowOffsetX = elev * 0.25;
    _G.shadowOffsetY = elev * 1.3;
  }
  _G.fillStyle = color;
  _G.beginPath();
  fn();
  _G.closePath();
  _G.fill();
  _G.restore();
}

function bumpStrip(x1, x2, baseY, topY, bumps, r, sharpness) {
  var bw = (x2 - x1) / bumps;
  _G.moveTo(x1, baseY);
  _G.lineTo(x2, baseY);
  _G.lineTo(x2, topY + bw * 0.3);
  for (var i = bumps - 1; i >= 0; i--) {
    var cx2 = x1 + (i + 0.5) * bw;
    var peak = topY - (r() - 0.15) * bw * (sharpness || 0.6);
    var rx2 = bw * (0.38 + r() * 0.14);
    var ry2 = (baseY - peak) * (0.45 + r() * 0.15);
    var wobble = (r() - 0.5) * rx2 * 0.25;
    var lx2 = cx2 - rx2 + wobble, rx3 = cx2 + rx2 + wobble, top2 = peak - ry2;
    _G.lineTo(rx3, baseY);
    _G.bezierCurveTo(rx3, baseY - ry2 * 0.5523, cx2 + rx2 * 0.5523 + wobble, top2, cx2 + wobble, top2);
    _G.bezierCurveTo(cx2 - rx2 * 0.5523 + wobble, top2, lx2, baseY - ry2 * 0.5523, lx2, baseY);
  }
  _G.lineTo(x1, topY + bw * 0.3);
  _G.lineTo(x1, baseY);
}

function wobRect(x, y, w, h, r, amt) {
  var px = [(r() - 0.5) * amt, (r() - 0.5) * amt];
  var py = [(r() - 0.5) * amt, (r() - 0.5) * amt];
  _G.moveTo(x + px[0], y + py[0]);
  _G.lineTo(x + w + px[1], y + py[0]);
  _G.lineTo(x + w + px[1], y + h + py[1]);
  _G.lineTo(x + px[0], y + h + py[1]);
}

function ellipse(cx, cy, rx, ry, rot) {
  _G.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
}

// ─── TILE DRAWING ───────────────────────────────────────────────

function drawWall(sx, sy, ts, tx, ty) {
  var r = mkRng(tx * 31 + ty * 97 + 1);
  var variant = Math.floor(mkRng(tx * 53 + ty * 71 + 9)() * 10);
  if (variant <= 5) {
    cut(LV_PAL.hedge0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    cut(LV_PAL.hedge1, 5, function () {
      var r2 = mkRng(tx * 7 + ty * 13);
      bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.5);
    });
    cut(LV_PAL.hedge2, 3, function () {
      var r2 = mkRng(tx * 11 + ty * 19);
      bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45);
    });
    cut(LV_PAL.hedge3, 1, function () {
      var r2 = mkRng(tx * 13 + ty * 23);
      bumpStrip(sx + ts * 0.1, sx + ts * 0.9, sy + ts, sy + ts * (0.42 + r() * 0.06), 2, r2, 0.4);
    });
    if (r() < 0.35) {
      cut(LV_PAL.hedgeHL, 0, function () {
        var hr = mkRng(tx * 17 + ty * 29);
        _G.arc(sx + ts * (0.3 + hr() * 0.4), sy + ts * (0.35 + hr() * 0.2), ts * (0.05 + hr() * 0.04), 0, Math.PI * 2);
      });
    }
    if (r() < 0.12) {
      var fc = r() < 0.5 ? LV_PAL.rose : LV_PAL.goldL;
      cut(fc, 0, function () {
        var fr = mkRng(tx * 37 + ty * 41);
        _G.arc(sx + ts * (0.25 + fr() * 0.5), sy + ts * (0.3 + fr() * 0.25), ts * 0.04, 0, Math.PI * 2);
      });
    }
  } else if (variant <= 7) {
    cut(LV_PAL.soil, 6, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    cut(LV_PAL.hedge0, 4, function () {
      var r2 = mkRng(tx * 19 + ty * 31);
      _G.arc(sx + ts * (0.3 + r2() * 0.4), sy + ts * (0.3 + r2() * 0.4), ts * (0.28 + r2() * 0.1), 0, Math.PI * 2);
    });
    cut(LV_PAL.hedge1, 2, function () {
      var r2 = mkRng(tx * 23 + ty * 37);
      _G.arc(sx + ts * (0.35 + r2() * 0.3), sy + ts * (0.35 + r2() * 0.3), ts * (0.2 + r2() * 0.08), 0, Math.PI * 2);
    });
  } else {
    cut(LV_PAL.dirt, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    cut(LV_PAL.dirtL, 2, function () {
      var r2 = mkRng(tx * 29 + ty * 43);
      _G.rect(sx + r2() * ts * 0.2, sy + r2() * ts * 0.2, ts * 0.7, ts * 0.6);
    });
  }
}

function drawFloor(sx, sy, ts, tx, ty) {
  var r = mkRng(tx * 19 + ty * 53 + 2);
  cut(LV_PAL.dirt, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.55) {
    var pr = mkRng(tx * 29 + ty * 67 + 4);
    var px = sx + pr() * ts * 0.5 + ts * 0.1, py = sy + pr() * ts * 0.5 + ts * 0.1;
    cut(LV_PAL.dirtL, 1, function () {
      _G.rect(px, py, ts * (0.3 + pr() * 0.3), ts * (0.2 + pr() * 0.2));
    });
  }
  if (r() < 0.06) {
    var flr = mkRng(tx * 43 + ty * 29 + 5);
    var flx = sx + ts * (0.35 + flr() * 0.3), fly = sy + ts * (0.35 + flr() * 0.3);
    cut(flr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL, 1, function () {
      _G.arc(flx, fly, ts * 0.055, 0, Math.PI * 2);
    });
  }
}

function drawPath(sx, sy, ts, tx, ty) {
  cut(LV_PAL.mortar, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  var stones = [
    [sx + ts * 0.04, sy + ts * 0.04, ts * 0.44, ts * 0.44],
    [sx + ts * 0.52, sy + ts * 0.04, ts * 0.44, ts * 0.44],
    [sx + ts * 0.04, sy + ts * 0.52, ts * 0.44, ts * 0.44],
    [sx + ts * 0.52, sy + ts * 0.52, ts * 0.44, ts * 0.44],
  ];
  for (var si = 0; si < 4; si++) {
    var st = stones[si];
    var sr = mkRng(tx * 41 + ty * 83 + si * 11);
    cut(si % 2 === 0 ? LV_PAL.stone : LV_PAL.stoneD, 2, (function (st2, sr2) {
      return function () {
        wobRect(st2[0] + sr2() * 2, st2[1] + sr2() * 2, st2[2] - sr2() * 2, st2[3] - sr2() * 2, mkRng(si * 7 + tx + ty), 1.5);
      };
    })(st, sr));
  }
}

function drawWater(sx, sy, ts, tx, ty) {
  cut(LV_PAL.pond0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  cut(LV_PAL.pond1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  cut(LV_PAL.pondHL, 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.18, ts * 0.35, ts * 0.05); });
}

// ─── PUBLIC: RENDER A SINGLE TILE TO A CANVAS ──────────────────

var TILE_CACHE = {};

export function renderTileCanvas(tileType, tx, ty, tileSize) {
  var key = tileType + '-' + tx + '-' + ty + '-' + tileSize;
  if (TILE_CACHE[key]) return TILE_CACHE[key];

  var cv = document.createElement('canvas');
  cv.width = tileSize;
  cv.height = tileSize;
  _G = cv.getContext('2d');

  var drawFn;
  if (tileType === 0) drawFn = drawWall;
  else if (tileType === 1) drawFn = drawFloor;
  else if (tileType === 2) drawFn = drawPath;
  else if (tileType === 3) drawFn = drawWater;
  else drawFn = drawFloor;

  drawFn(0, 0, tileSize, tx, ty);

  _G = null;
  TILE_CACHE[key] = cv;
  return cv;
}

// ─── OBJECT DRAWING (on a given context) ────────────────────────

export function drawChestOnCtx(G, sx, sy, ts, open) {
  _G = G;
  var x = sx + ts * 0.5, y = sy + ts * 0.62;
  cut('rgba(14,6,2,0.28)', 0, function () { ellipse(x, y + ts * 0.16, ts * 0.24, ts * 0.065); });
  var bc = open ? '#3a1c08' : '#5a3010', bl = open ? '#4e2c10' : '#7a4820';
  cut(bc, 5, function () {
    _G.moveTo(x - ts * 0.26, y + ts * 0.14);
    _G.lineTo(x + ts * 0.26, y + ts * 0.14);
    _G.lineTo(x + ts * 0.28, y - ts * 0.02);
    _G.lineTo(x + ts * 0.24, y - ts * 0.1);
    _G.lineTo(x - ts * 0.24, y - ts * 0.1);
    _G.lineTo(x - ts * 0.28, y - ts * 0.02);
  });
  cut(bl, 3, function () {
    _G.moveTo(x - ts * 0.22, y + ts * 0.1);
    _G.lineTo(x + ts * 0.22, y + ts * 0.1);
    _G.lineTo(x + ts * 0.24, y);
    _G.lineTo(x + ts * 0.2, y - ts * 0.06);
    _G.lineTo(x - ts * 0.2, y - ts * 0.06);
    _G.lineTo(x - ts * 0.24, y);
  });
  cut(LV_PAL.gold, 2, function () { _G.rect(x - ts * 0.04, y - ts * 0.02, ts * 0.08, ts * 0.06); });
  _G = null;
}

export function drawGoldChestOnCtx(G, sx, sy, ts, locked) {
  _G = G;
  var x = sx + ts * 0.5, y = sy + ts * 0.6;
  var bodyCol = locked ? '#2a1206' : '#5c3010';
  cut(bodyCol, 7, function () {
    _G.moveTo(x - ts * 0.34, y + ts * 0.2);
    _G.lineTo(x + ts * 0.34, y + ts * 0.2);
    _G.lineTo(x + ts * 0.36, y - ts * 0.02);
    _G.lineTo(x + ts * 0.32, y - ts * 0.12);
    _G.lineTo(x - ts * 0.32, y - ts * 0.12);
    _G.lineTo(x - ts * 0.36, y - ts * 0.02);
  });
  if (!locked) {
    cut(LV_PAL.goldL, 4, function () {
      _G.moveTo(x - ts * 0.28, y + ts * 0.16);
      _G.lineTo(x + ts * 0.28, y + ts * 0.16);
      _G.lineTo(x + ts * 0.3, y);
      _G.lineTo(x + ts * 0.26, y - ts * 0.08);
      _G.lineTo(x - ts * 0.26, y - ts * 0.08);
      _G.lineTo(x - ts * 0.3, y);
    });
  }
  cut(LV_PAL.gold, 3, function () { _G.rect(x - ts * 0.06, y - ts * 0.04, ts * 0.12, ts * 0.08); });
  _G = null;
}

export function drawPotionOnCtx(G, sx, sy, ts) {
  _G = G;
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  cut('#401880', 4, function () { ellipse(x, y + ts * 0.08, ts * 0.14, ts * 0.18); });
  cut('#6828c0', 2, function () { _G.rect(x - ts * 0.07, y - ts * 0.12, ts * 0.14, ts * 0.12); });
  cut(LV_PAL.stone, 1, function () { _G.rect(x - ts * 0.05, y - ts * 0.15, ts * 0.1, ts * 0.05); });
  _G = null;
}

export function drawGoldOnCtx(G, sx, sy, ts, tx, ty) {
  _G = G;
  var r = mkRng(tx * 7 + ty * 13);
  var x = sx + ts * 0.5, y = sy + ts * 0.56;
  for (var i = 0; i < 5; i++) {
    var cx = x + (r() - 0.5) * ts * 0.28, cy = y + (r() - 0.5) * ts * 0.18;
    cut(i % 2 === 0 ? LV_PAL.gold : LV_PAL.goldL, 2 + i * 0.4, (function (c2x, c2y) {
      return function () { _G.arc(c2x, c2y, ts * 0.1, 0, Math.PI * 2); };
    })(cx, cy));
  }
  _G = null;
}

export function drawExitOnCtx(G, sx, sy, ts) {
  _G = G;
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  _G.save();
  _G.globalAlpha = 0.7;
  var gr = _G.createRadialGradient(x, y, 0, x, y, ts * 0.55);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.3, LV_PAL.goldL);
  gr.addColorStop(1, 'rgba(192,120,24,0)');
  _G.fillStyle = gr;
  _G.beginPath();
  _G.arc(x, y, ts * 0.55, 0, Math.PI * 2);
  _G.fill();
  _G.restore();
  _G = null;
}
