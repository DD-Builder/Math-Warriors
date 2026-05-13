/**
 * Level engine — 1:1 port of the v0.2 reference (lv_engine_code.txt).
 *
 * Renders the dungeon maze using the papercut aesthetic: bezier-curve hedge
 * bumps, gradient shadows (LV_cut), wobbled stone rectangles, layered depth,
 * fog of war, vignette, flash, death particles, minimap.
 *
 * Exported as an ES module. All state is internal; MazeScene calls:
 *   initLevel(), updateLevel(), drawLevel(), getCanvas(), getPartyTile(),
 *   getGameState(), setGameState(), triggerFlash(), markDead().
 */

import { mkRng } from './legacyRenderer.js';

// ─── PALETTE (exact copy from reference) ────────────────────────

var LV_PAL = {
  dirt: '#3c2010', dirtL: '#4e2e18', soil: '#5a3820',
  stone: '#c8b890', stoneD: '#a89870', stoneL: '#dccca8', mortar: '#787060',
  hedge0: '#1a3c10', hedge1: '#2a5c1e', hedge2: '#3a7828', hedge3: '#4a9830', hedgeHL: '#60b840',
  rose: '#c02860', roseL: '#e84888', gold: '#c07818', goldL: '#e8a030', cream: '#f0e4cc',
  pond0: '#1a3040', pond1: '#2a5060', pond2: '#3a7080', pondHL: '#6ab0c8',
  fairy0: '#88aaff', fairy1: '#ffaa44', fairy2: '#44ffaa'
};

// ─── TILE CONSTANTS ─────────────────────────────────────────────

var LV_TILE = 56;
var LV_TW = 0, LV_TF = 1, LV_TP = 2, LV_TQ = 3, LV_TS = 4;

// ─── MODULE STATE ───────────────────────────────────────────────

var _canvas = null;    // offscreen canvas
var _G = null;         // 2D context
var _W = 0, _H = 0;   // canvas dimensions
var _SCALE = 1;        // dynamic scale
var _COLS = 0, _ROWS = 0;
var _map = null;       // tile grid [row][col]
var _objs = null;      // objects array
var _fog = null;       // fog grid [row][col] — 0 = hidden, 1 = revealed
var _gs = null;        // game state {fairies, hasKey, dead, flash}
var _party = null;     // {x, y, vx, vy, speed, trail, trailLen, facing, animT}
var _heroCanvases = null;
var _deathParticles = [];
var _minimapCanvas = null;
var _minimapG = null;

// ─── HELPER: ellipse shorthand ──────────────────────────────────

function LV_ellipse(cx, cy, rx, ry, rot) {
  _G.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2);
}

// ─── LV_cut — papercut shadow renderer (1:1 from reference) ────

function LV_cut(color, elev, fn) {
  _G.save();
  _G.shadowColor = 'rgba(14,6,2,0.58)';
  _G.shadowBlur = elev * 2.8;
  _G.shadowOffsetX = elev * 0.25;
  _G.shadowOffsetY = elev * 1.3;
  _G.fillStyle = color;
  _G.beginPath();
  fn();
  _G.closePath();
  _G.fill();
  _G.restore();
}

// ─── LV_bumpStrip — bezier hedge bumps (1:1) ───────────────────

function LV_bumpStrip(x1, x2, baseY, topY, bumps, r, sharpness) {
  var bw = (x2 - x1) / bumps;
  _G.moveTo(x1, baseY);
  _G.lineTo(x2, baseY);
  _G.lineTo(x2, topY + bw * 0.3);
  for (var i = bumps - 1; i >= 0; i--) {
    var cx2 = x1 + (i + 0.5) * bw, peak = topY - (r() - 0.15) * bw * (sharpness || 0.6);
    var rx2 = bw * (0.38 + r() * 0.14), ry2 = (baseY - peak) * (0.45 + r() * 0.15);
    var wobble = (r() - 0.5) * rx2 * 0.25;
    var lx2 = cx2 - rx2 + wobble, rx3 = cx2 + rx2 + wobble, top2 = peak - ry2;
    _G.lineTo(rx3, baseY);
    _G.bezierCurveTo(rx3, baseY - ry2 * 0.5523, cx2 + rx2 * 0.5523 + wobble, top2, cx2 + wobble, top2);
    _G.bezierCurveTo(cx2 - rx2 * 0.5523 + wobble, top2, lx2, baseY - ry2 * 0.5523, lx2, baseY);
  }
  _G.lineTo(x1, topY + bw * 0.3);
  _G.lineTo(x1, baseY);
}

// ─── LV_wobRect — wobbled stone rectangles (1:1) ────────────────

function LV_wobRect(x, y, w, h, r, amt) {
  var px = [(r() - 0.5) * amt, (r() - 0.5) * amt], py = [(r() - 0.5) * amt, (r() - 0.5) * amt];
  _G.moveTo(x + px[0], y + py[0]);
  _G.lineTo(x + w + px[1], y + py[0]);
  _G.lineTo(x + w + px[1], y + h + py[1]);
  _G.lineTo(x + px[0], y + h + py[1]);
}

// ─── TILE HELPERS ───────────────────────────────────────────────

function LV_tileAt(wx, wy) {
  var tx = Math.floor(wx / LV_TILE), ty = Math.floor(wy / LV_TILE);
  if (tx < 0 || tx >= _COLS || ty < 0 || ty >= _ROWS) return LV_TW;
  return _map[ty][tx];
}

function LV_walkable(wx, wy) {
  var m = LV_TILE * 0.3;
  return LV_tileAt(wx - m, wy - m) !== LV_TW && LV_tileAt(wx + m, wy - m) !== LV_TW &&
         LV_tileAt(wx - m, wy + m) !== LV_TW && LV_tileAt(wx + m, wy + m) !== LV_TW;
}

function LV_revealFog(tx, ty, rad) {
  for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) {
    var nx = tx + dx, ny = ty + dy;
    if (nx >= 0 && nx < _COLS && ny >= 0 && ny < _ROWS && dx * dx + dy * dy <= rad * rad)
      _fog[ny][nx] = 1;
  }
}

// ─── TILE DRAWING (1:1 from reference) ─────────────────────────

function LV_drawWall(sx, sy, ts, tx, ty) {
  var r = mkRng(tx * 31 + ty * 97 + 1);
  var variant = Math.floor(mkRng(tx * 53 + ty * 71 + 9)() * 10);
  if (variant <= 5) {
    LV_cut(LV_PAL.hedge0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(LV_PAL.hedge1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.5); });
    LV_cut(LV_PAL.hedge2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
    LV_cut(LV_PAL.hedge3, 1, function () { var r2 = mkRng(tx * 13 + ty * 23); LV_bumpStrip(sx + ts * 0.1, sx + ts * 0.9, sy + ts * 0.5, sy + ts * (0.38 + r() * 0.06), 2 + Math.floor(r() * 2), r2, 0.35); });
    if (r() < 0.22) {
      var fr = mkRng(tx * 17 + ty * 37 + 3); var fx = sx + ts * (0.2 + fr() * 0.6), fy = sy + ts * (0.1 + fr() * 0.2);
      var fc = fr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL; var fsz = ts * 0.1;
      LV_cut(fc, 2, function () { for (var p = 0; p < 5; p++) { var a = (p / 5) * Math.PI * 2; _G.moveTo(fx, fy); _G.arc(fx + Math.cos(a) * fsz * 1.1, fy + Math.sin(a) * fsz * 1.1, fsz * 0.65, 0, Math.PI * 2); } });
      LV_cut(LV_PAL.goldL, 1, function () { _G.arc(fx, fy, fsz * 0.38, 0, Math.PI * 2); });
    }
  } else {
    LV_cut('#1a3c0e', 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#2e6020', 5, function () { var r2 = mkRng(tx * 7 + ty * 11); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.1 + r() * 0.1), 4 + Math.floor(r() * 3), r2, 0.7); });
    LV_cut('#4a8830', 3, function () { var r2 = mkRng(tx * 13 + ty * 17); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.25 + r() * 0.1), 3 + Math.floor(r() * 3), r2, 0.6); });
    var cr = mkRng(tx * 31 + ty * 53 + 3);
    for (var c = 0; c < 3 + Math.floor(cr() * 4); c++) {
      var cbx = sx + ts * (0.08 + cr() * 0.84), cby = sy + ts * (0.05 + cr() * 0.35);
      var cbc = cr() < 0.4 ? LV_PAL.rose : LV_PAL.goldL;
      LV_cut(cbc, 2, function () { _G.arc(cbx, cby, ts * 0.07, 0, Math.PI * 2); });
    }
  }
}

function LV_drawFloor(sx, sy, ts, tx, ty) {
  var r = mkRng(tx * 19 + ty * 53 + 2);
  LV_cut(LV_PAL.dirt, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.55) { var pr = mkRng(tx * 29 + ty * 67 + 4); var px = sx + pr() * ts * 0.5 + ts * 0.1, py = sy + pr() * ts * 0.5 + ts * 0.1; LV_cut(LV_PAL.dirtL, 1, function () { _G.rect(px, py, ts * (0.3 + pr() * 0.3), ts * (0.2 + pr() * 0.2)); }); }
  if (r() < 0.06) { var flr = mkRng(tx * 43 + ty * 29 + 5); var flx = sx + ts * (0.35 + flr() * 0.3), fly = sy + ts * (0.35 + flr() * 0.3); LV_cut(flr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL, 1, function () { _G.arc(flx, fly, ts * 0.055, 0, Math.PI * 2); }); }
}

function LV_drawPath(sx, sy, ts, tx, ty) {
  LV_cut(LV_PAL.mortar, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  var stones = [[sx + ts * 0.04, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.04, sy + ts * 0.52, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.52, ts * 0.44, ts * 0.44]];
  for (var si = 0; si < 4; si++) {
    var st = stones[si]; var sr = mkRng(tx * 41 + ty * 83 + si * 11);
    LV_cut(si % 2 === 0 ? LV_PAL.stone : LV_PAL.stoneD, 2, (function (st2, sr2) { return function () { LV_wobRect(st2[0] + sr2() * 2, st2[1] + sr2() * 2, st2[2] - sr2() * 2, st2[3] - sr2() * 2, mkRng(si * 7 + tx + ty), 1.5); }; })(st, sr));
  }
}

function LV_drawWater(sx, sy, ts, tx, ty, t) {
  LV_cut(LV_PAL.pond0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(LV_PAL.pond1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(LV_PAL.pondHL, 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.18 + Math.sin(t * 2 + ty) * ts * 0.04, ts * 0.35, ts * 0.05); });
}

// ─── OBJECT DRAWING (1:1 from reference) ────────────────────────

function LV_drawChest(sx, sy, ts, o) {
  var x = sx + ts * 0.5, y = sy + ts * 0.62;
  LV_cut('rgba(14,6,2,0.28)', 0, function () { LV_ellipse(x, y + ts * 0.16, ts * 0.24, ts * 0.065, 0); });
  var bc = o.open ? '#3a1c08' : '#5a3010', bl = o.open ? '#4e2c10' : '#7a4820';
  LV_cut(bc, 5, function () { _G.moveTo(x - ts * 0.26, y + ts * 0.14); _G.lineTo(x + ts * 0.26, y + ts * 0.14); _G.lineTo(x + ts * 0.28, y - ts * 0.02); _G.lineTo(x + ts * 0.24, y - ts * 0.1); _G.lineTo(x - ts * 0.24, y - ts * 0.1); _G.lineTo(x - ts * 0.28, y - ts * 0.02); });
  LV_cut(bc, 5, function () { _G.moveTo(x - ts * 0.26, y - ts * 0.08); _G.lineTo(x + ts * 0.26, y - ts * 0.08); _G.lineTo(x + ts * 0.22, y - ts * 0.2); _G.bezierCurveTo(x + ts * 0.18, y - ts * 0.26, x - ts * 0.18, y - ts * 0.26, x - ts * 0.22, y - ts * 0.2); });
  LV_cut(LV_PAL.gold, 2, function () { _G.rect(x - ts * 0.27, y - ts * 0.02, ts * 0.54, ts * 0.038); });
  LV_cut(LV_PAL.gold, 2, function () { _G.rect(x - ts * 0.055, y - ts * 0.055, ts * 0.11, ts * 0.09); });
}

function LV_drawGoldChest(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.6;
  var locked = (_gs.fairies < 3), bob = locked ? 0 : Math.sin(t * 2.2) * ts * 0.03;
  var bodyCol = locked ? '#2a1206' : '#5c3010';
  LV_cut(bodyCol, 7, function () { _G.moveTo(x - ts * 0.34, y + ts * 0.2); _G.lineTo(x + ts * 0.34, y + ts * 0.2); _G.lineTo(x + ts * 0.36, y - ts * 0.02); _G.lineTo(x + ts * 0.32, y - ts * 0.12); _G.lineTo(x - ts * 0.32, y - ts * 0.12); _G.lineTo(x - ts * 0.36, y - ts * 0.02); });
  LV_cut(locked ? '#200e04' : '#3c1a06', 6, function () { _G.moveTo(x - ts * 0.34, y - ts * 0.1 + bob); _G.lineTo(x + ts * 0.34, y - ts * 0.1 + bob); _G.lineTo(x + ts * 0.32, y - ts * 0.28 + bob); _G.bezierCurveTo(x + ts * 0.28, y - ts * 0.38 + bob, x - ts * 0.28, y - ts * 0.38 + bob, x - ts * 0.32, y - ts * 0.28 + bob); });
  LV_cut(locked ? '#6a4010' : LV_PAL.goldL, 3, function () { _G.rect(x - ts * 0.35, y - ts * 0.02, ts * 0.7, ts * 0.045); });
  LV_cut(locked ? '#8a3010' : '#c8a020', 4, function () { _G.rect(x - ts * 0.075, y - ts * 0.06, ts * 0.15, ts * 0.12); });
  if (!locked && !o.open) { _G.save(); _G.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2; LV_cut(LV_PAL.goldL, 1, function () { _G.arc(x, y - ts * 0.15 + bob, ts * 0.12, 0, Math.PI * 2); }); _G.restore(); }
}

function LV_drawPotion(sx, sy, ts, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5, bob = Math.sin(t * 2.5) * ts * 0.04;
  LV_cut('#401880', 4, function () { LV_ellipse(x, y + ts * 0.08 + bob, ts * 0.14, ts * 0.18, 0); });
  LV_cut('#6828c0', 2, function () { _G.rect(x - ts * 0.07, y - ts * 0.12 + bob, ts * 0.14, ts * 0.12); });
  LV_cut(LV_PAL.stone, 1, function () { _G.rect(x - ts * 0.05, y - ts * 0.15 + bob, ts * 0.1, ts * 0.05); });
}

function LV_drawGold(sx, sy, ts, o) {
  var r = mkRng(o.tx * 7 + o.ty * 13); var x = sx + ts * 0.5, y = sy + ts * 0.56;
  for (var i = 0; i < 5; i++) { var cx = x + (r() - 0.5) * ts * 0.28, cy = y + (r() - 0.5) * ts * 0.18; LV_cut(i % 2 === 0 ? LV_PAL.gold : LV_PAL.goldL, 2 + i * 0.4, (function (c2x, c2y) { return function () { _G.arc(c2x, c2y, ts * 0.1, 0, Math.PI * 2); }; })(cx, cy)); }
}

function LV_drawMonster(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5, bob = Math.sin(t * 2.2 + o.tx) * ts * 0.05;
  var col = o.kind === 'sprout' ? '#3a8a20' : o.kind === 'weed' ? '#6a4010' : '#c04010';
  var colL = o.kind === 'sprout' ? '#60b840' : o.kind === 'weed' ? '#8a5828' : '#e05828';
  LV_cut(col, 5, function () { _G.arc(x, y + bob, ts * 0.22, 0, Math.PI * 2); });
  LV_cut(colL, 2, function () { _G.arc(x, y + bob - ts * 0.06, ts * 0.14, 0, Math.PI * 2); });
  LV_cut('#ffff40', 2, function () { _G.arc(x - ts * 0.08, y - ts * 0.05 + bob, ts * 0.058, 0, Math.PI * 2); _G.arc(x + ts * 0.08, y - ts * 0.05 + bob, ts * 0.058, 0, Math.PI * 2); });
  LV_cut('#100800', 0, function () { _G.arc(x - ts * 0.07, y - ts * 0.05 + bob, ts * 0.032, 0, Math.PI * 2); _G.arc(x + ts * 0.09, y - ts * 0.05 + bob, ts * 0.032, 0, Math.PI * 2); });
}

function LV_drawBoss(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.42, bob = Math.sin(t * 1.4) * ts * 0.04, s = ts * 0.88;
  LV_cut('#1a0808', 6, function () { _G.arc(x, y + bob, s * 0.28, 0, Math.PI * 2); });
  LV_cut('#2e0e0e', 3, function () { _G.rect(x - s * 0.22, y + bob - s * 0.04, s * 0.44, s * 0.36); });
  var eyePulse = Math.sin(t * 2.1) * 0.3 + 0.7;
  _G.save(); _G.globalAlpha = eyePulse; _G.fillStyle = '#ff2020';
  _G.beginPath(); _G.arc(x - s * 0.09, y + bob - s * 0.04, s * 0.04, 0, Math.PI * 2); _G.fill();
  _G.beginPath(); _G.arc(x + s * 0.09, y + bob - s * 0.04, s * 0.04, 0, Math.PI * 2); _G.fill();
  _G.restore();
}

function LV_drawExit(sx, sy, ts, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5, pulse = Math.sin(t * 2.5) * 0.08 + 1;
  _G.save(); _G.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2;
  var gr = _G.createRadialGradient(x, y, 0, x, y, ts * 0.55 * pulse);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, LV_PAL.goldL); gr.addColorStop(1, 'rgba(192,120,24,0)');
  _G.fillStyle = gr; _G.beginPath(); _G.arc(x, y, ts * 0.55 * pulse, 0, Math.PI * 2); _G.fill(); _G.globalAlpha = 1;
  LV_cut(LV_PAL.gold, 5, function () { _G.arc(x, y, ts * 0.42 * pulse, 0, Math.PI * 2); _G.arc(x, y, ts * 0.28 * pulse, 0, Math.PI * 2, true); });
  _G.restore();
}

// ─── PARTY DRAWING (1:1 from reference) ─────────────────────────

function LV_drawPartyMember(px, py, ts, idx, moving, t) {
  var bob = moving ? Math.sin(t * 8 + idx * 1.2) * ts * 0.055 : 0;
  if (_heroCanvases && _heroCanvases[idx]) {
    var hcv = _heroCanvases[idx]; var hsc = ts * 1.1 / hcv.width; var hw = hcv.width * hsc, hh = hcv.height * hsc;
    _G.drawImage(hcv, px - hw / 2, py - hh * 0.82 + bob, hw, hh);
    return;
  }
  // Fallback generic sprite
  var col = '#2e4e88';
  _G.save(); _G.translate(px, py + bob);
  LV_cut('rgba(14,6,2,0.25)', 0, function () { LV_ellipse(0, ts * 0.26, ts * 0.17, ts * 0.065, 0); });
  LV_cut(col, 7, function () { _G.moveTo(-ts * 0.2, ts * 0.22); _G.lineTo(ts * 0.2, ts * 0.22); _G.lineTo(ts * 0.22, ts * 0.08); _G.lineTo(ts * 0.18, -ts * 0.04); _G.lineTo(-ts * 0.18, -ts * 0.04); _G.lineTo(-ts * 0.22, ts * 0.08); });
  LV_cut(col, 5, function () { _G.arc(0, -ts * 0.16, ts * 0.14, 0, Math.PI * 2); });
  LV_cut('#1a0800', 2, function () { _G.arc(-ts * 0.055, -ts * 0.2, ts * 0.036, 0, Math.PI * 2); _G.arc(ts * 0.055, -ts * 0.2, ts * 0.036, 0, Math.PI * 2); });
  _G.restore();
}

// ─── MINIMAP (1:1 from reference, draws to internal canvas) ─────

function LV_drawMinimap() {
  if (!_minimapCanvas) {
    _minimapCanvas = document.createElement('canvas');
    _minimapCanvas.width = 120;
    _minimapCanvas.height = 120;
    _minimapG = _minimapCanvas.getContext('2d');
  }
  var mc = _minimapCanvas, mg = _minimapG;
  // Size to fit the map (max dimension determines cell size)
  var maxDim = Math.max(_COLS, _ROWS);
  var cs = mc.width / maxDim;
  mg.fillStyle = '#080402'; mg.fillRect(0, 0, mc.width, mc.height);
  for (var my = 0; my < _ROWS; my++) for (var mx = 0; mx < _COLS; mx++) {
    if (!_fog[my][mx]) { mg.fillStyle = '#0e0804'; mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5); continue; }
    var t2 = _map[my][mx];
    mg.fillStyle = t2 === LV_TW ? '#2a5c1e' : t2 === LV_TP ? '#a89870' : t2 === LV_TQ ? '#2a5060' : '#3c2010';
    mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5);
  }
  for (var oi2 = 0; oi2 < _objs.length; oi2++) {
    var o2 = _objs[oi2]; if (_gs.dead[o2.id]) continue;
    if (!_fog[o2.ty] || !_fog[o2.ty][o2.tx]) continue;
    if (o2.type === 'exit' && !o2.visible) continue;
    var dc = o2.type === 'monster' ? (o2.hidden ? null : '#ff4040') : o2.type === 'boss' ? '#ff2020' : o2.type.indexOf('chest') >= 0 ? '#e8a030' : o2.type === 'exit' ? '#40ff40' : '#c07818';
    if (!dc) continue;
    mg.fillStyle = dc; mg.beginPath(); mg.arc((o2.tx + 0.5) * cs, (o2.ty + 0.5) * cs, cs * 0.8, 0, Math.PI * 2); mg.fill();
  }
  var ppx = (_party.x / LV_TILE) * cs, ppy = (_party.y / LV_TILE) * cs;
  mg.fillStyle = '#ff6060'; mg.beginPath(); mg.arc(ppx, ppy, cs * 1.2, 0, Math.PI * 2); mg.fill();
  mg.fillStyle = '#ffffff'; mg.beginPath(); mg.arc(ppx, ppy, cs * 0.5, 0, Math.PI * 2); mg.fill();
  mg.strokeStyle = 'rgba(192,120,24,0.4)'; mg.lineWidth = 1; mg.strokeRect(0, 0, mc.width, mc.height);
  // Blit minimap onto main canvas (top-right corner)
  var mmSize = Math.min(_W, _H) * 0.22;
  var mmX = _W - mmSize - 10, mmY = 10;
  _G.drawImage(mc, mmX, mmY, mmSize, mmSize);
}

// ─── MAIN DRAW (1:1 from reference) ────────────────────────────

function LV_draw(t) {
  var ts = LV_TILE * _SCALE;
  var camX = _W / 2 - _party.x * _SCALE, camY = _H / 2 - _party.y * _SCALE;
  // Background
  _G.fillStyle = '#1a0c06'; _G.fillRect(0, 0, _W, _H);
  var sx0 = Math.max(0, Math.floor(-camX / ts) - 1), sy0 = Math.max(0, Math.floor(-camY / ts) - 1);
  var sx1 = Math.min(_COLS, sx0 + Math.ceil(_W / ts) + 3), sy1 = Math.min(_ROWS, sy0 + Math.ceil(_H / ts) + 3);
  // Tiles
  for (var ty2 = sy0; ty2 < sy1; ty2++) for (var tx2 = sx0; tx2 < sx1; tx2++) {
    var scx = camX + tx2 * ts, scy = camY + ty2 * ts;
    if (scx + ts < 0 || scx > _W || scy + ts < 0 || scy > _H) continue;
    if (!_fog[ty2][tx2]) { _G.fillStyle = '#080402'; _G.fillRect(scx, scy, ts + 1, ts + 1); continue; }
    var tt2 = _map[ty2][tx2];
    if (tt2 === LV_TW) LV_drawWall(scx, scy, ts, tx2, ty2);
    else if (tt2 === LV_TP) LV_drawPath(scx, scy, ts, tx2, ty2);
    else if (tt2 === LV_TQ) LV_drawWater(scx, scy, ts, tx2, ty2, t);
    else LV_drawFloor(scx, scy, ts, tx2, ty2);
  }
  // Objects
  for (var oi = 0; oi < _objs.length; oi++) {
    var o = _objs[oi]; if (_gs.dead[o.id]) continue;
    if (o.type === 'exit' && !o.visible) continue;
    if (!_fog[o.ty] || !_fog[o.ty][o.tx]) continue;
    var osx = camX + o.tx * ts, osy = camY + o.ty * ts;
    if (osx + ts < 0 || osx > _W || osy + ts < 0 || osy > _H) continue;
    if (o.type === 'chestG') LV_drawGoldChest(osx, osy, ts, o, t);
    else if (o.type === 'chest') LV_drawChest(osx, osy, ts, o);
    else if (o.type === 'potion') LV_drawPotion(osx, osy, ts, t);
    else if (o.type === 'gold') LV_drawGold(osx, osy, ts, o);
    else if (o.type === 'monster' && o.alive && !o.hidden) LV_drawMonster(osx, osy, ts, o, t);
    else if (o.type === 'boss' && o.alive) LV_drawBoss(osx, osy, ts, o, t);
    else if (o.type === 'exit') LV_drawExit(osx, osy, ts, t);
  }
  // Party (back to front)
  var moving = (_party.vx !== 0 || _party.vy !== 0);
  var tr1 = _party.trail[Math.min(_party.trail.length - 1, _party.trailLen - 1)];
  var tr2 = _party.trail[Math.min(_party.trail.length - 1, _party.trailLen * 2 - 1)];
  var sp1x = tr1.x, sp1y = tr1.y, sp2x = tr2.x, sp2y = tr2.y;
  if (!moving) {
    var fOff = LV_TILE * 0.72;
    if (_party.facing === 'down' || _party.facing === 'up') {
      var fydir = _party.facing === 'down' ? -1 : 1;
      sp1y = _party.y + fydir * fOff; sp2y = _party.y + fydir * fOff * 2;
      sp1x = _party.x - ts * 0.18 / _SCALE; sp2x = _party.x + ts * 0.18 / _SCALE;
    } else {
      var fxdir = _party.facing === 'right' ? -1 : 1;
      sp1x = _party.x + fxdir * fOff; sp2x = _party.x + fxdir * fOff * 2;
      sp1y = _party.y - ts * 0.1 / _SCALE; sp2y = _party.y + ts * 0.1 / _SCALE;
    }
  }
  LV_drawPartyMember(camX + sp2x * _SCALE, camY + sp2y * _SCALE, ts, 2, moving, t);
  LV_drawPartyMember(camX + sp1x * _SCALE, camY + sp1y * _SCALE, ts, 1, moving, t);
  LV_drawPartyMember(camX + _party.x * _SCALE, camY + _party.y * _SCALE, ts, 0, moving, t);
  // Fog overlay
  for (var fy2 = sy0; fy2 < sy1; fy2++) for (var fx2 = sx0; fx2 < sx1; fx2++) {
    if (_fog[fy2][fx2]) continue;
    var fsx = camX + fx2 * ts, fsy = camY + fy2 * ts;
    if (fsx + ts < 0 || fsx > _W || fsy + ts < 0 || fsy > _H) continue;
    _G.fillStyle = 'rgba(8,4,2,0.94)'; _G.fillRect(fsx, fsy, ts + 1, ts + 1);
  }
  // Fog edge softening
  for (var fy3 = sy0; fy3 < sy1; fy3++) for (var fx3 = sx0; fx3 < sx1; fx3++) {
    if (!_fog[fy3][fx3]) continue;
    var hasUnrev = (fy3 > 0 && !_fog[fy3 - 1][fx3]) || (fy3 < _ROWS - 1 && !_fog[fy3 + 1][fx3]) || (fx3 > 0 && !_fog[fy3][fx3 - 1]) || (fx3 < _COLS - 1 && !_fog[fy3][fx3 + 1]);
    if (hasUnrev) { _G.fillStyle = 'rgba(8,4,2,0.35)'; _G.fillRect(camX + fx3 * ts, camY + fy3 * ts, ts + 1, ts + 1); }
  }
  // Vignette
  var vig = _G.createRadialGradient(_W / 2, _H / 2, Math.min(_W, _H) * 0.2, _W / 2, _H / 2, Math.min(_W, _H) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  _G.fillStyle = vig; _G.fillRect(0, 0, _W, _H);
  // Flash
  if (_gs.flash > 0) { _G.fillStyle = 'rgba(156,32,32,' + (_gs.flash / 10 * 0.45) + ')'; _G.fillRect(0, 0, _W, _H); _gs.flash--; }
  // Death sparkles
  for (var dpi = _deathParticles.length - 1; dpi >= 0; dpi--) {
    var dp = _deathParticles[dpi]; dp.t++;
    if (dp.t >= dp.maxT) { _deathParticles.splice(dpi, 1); continue; }
    var dpa = 1 - dp.t / dp.maxT;
    _G.save(); _G.globalAlpha = Math.min(1, dpa * 1.5); _G.fillStyle = dp.col;
    var dpsx = camX + dp.x * _SCALE + dp.vx * dp.t;
    var dpsy = camY + dp.y * _SCALE + dp.vy * dp.t + 0.05 * dp.t * dp.t;
    _G.beginPath(); _G.arc(dpsx, dpsy, ts * 0.07 * (1 + dpa * 0.4), 0, Math.PI * 2); _G.fill();
    _G.restore();
  }
  LV_drawMinimap();
}

// ─── UPDATE (1:1 from reference) ────────────────────────────────

function LV_update(keys) {
  var now = Date.now();
  for (var ri = 0; ri < _objs.length; ri++) {
    var ro = _objs[ri];
    if (ro.type === 'monster' && !ro.alive && ro.respawnAt && now >= ro.respawnAt) { ro.alive = true; ro.hidden = true; ro.respawnAt = 0; }
  }
  var dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a'] || keys['left']) dx = -1;
  if (keys['ArrowRight'] || keys['d'] || keys['right']) dx = 1;
  if (keys['ArrowUp'] || keys['w'] || keys['up']) dy = -1;
  if (keys['ArrowDown'] || keys['s'] || keys['down']) dy = 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  if (dx || dy) {
    var nx = _party.x + dx * _party.speed, ny = _party.y + dy * _party.speed;
    if (LV_walkable(nx, _party.y)) _party.x = nx;
    if (LV_walkable(_party.x, ny)) _party.y = ny;
    if (Math.abs(dx) > Math.abs(dy)) _party.facing = dx > 0 ? 'right' : 'left';
    else _party.facing = dy > 0 ? 'down' : 'up';
  }
  _party.vx = dx; _party.vy = dy;
  _party.trail.unshift({ x: _party.x, y: _party.y });
  if (_party.trail.length > _party.trailLen * 2 + 2) _party.trail.pop();
  LV_revealFog(Math.floor(_party.x / LV_TILE), Math.floor(_party.y / LV_TILE), 3);
  _party.animT++;
}

// ─── EXPORTED API ───────────────────────────────────────────────

/**
 * Initialise the level engine.
 *
 * @param {number} width   - Canvas width in CSS pixels
 * @param {number} height  - Canvas height in CSS pixels
 * @param {number[][]} map - Tile grid [row][col] using LV_TW/LV_TF/LV_TP/LV_TQ constants
 * @param {Object[]} objects - Array of object descriptors ({type,tx,ty,id,...})
 * @param {HTMLCanvasElement[]} heroCanvases - Pre-rendered hero portrait canvases
 * @param {number} startX  - Starting tile X
 * @param {number} startY  - Starting tile Y
 */
export function initLevel(width, height, map, objects, heroCanvases, startX, startY) {
  _W = width;
  _H = height;
  _ROWS = map.length;
  _COLS = map[0].length;
  _SCALE = _W / (LV_TILE * 13.5);
  _map = map;
  _objs = objects;
  _heroCanvases = heroCanvases || [];
  _deathParticles = [];

  // Create offscreen canvas (must be HTMLCanvasElement for Phaser compatibility)
  _canvas = document.createElement('canvas');
  _canvas.width = _W;
  _canvas.height = _H;
  _G = _canvas.getContext('2d');

  // Minimap will be created lazily in LV_drawMinimap
  _minimapCanvas = null;
  _minimapG = null;

  // Fog — all hidden initially
  _fog = [];
  for (var fi = 0; fi < _ROWS; fi++) {
    _fog[fi] = [];
    for (var fj = 0; fj < _COLS; fj++) _fog[fi][fj] = 0;
  }

  // Game state
  _gs = { fairies: 0, hasKey: false, hasMap: false, dead: {}, secretFound: false, flash: 0 };

  // Party
  _party = {
    x: (startX + 0.5) * LV_TILE,
    y: (startY + 0.5) * LV_TILE,
    vx: 0, vy: 0,
    speed: 2.4,
    trail: [],
    trailLen: 20,
    facing: 'down',
    animT: 0
  };
  for (var ti = 0; ti < _party.trailLen * 2 + 2; ti++) {
    _party.trail.push({ x: _party.x, y: _party.y });
  }

  // Reveal starting area
  LV_revealFog(startX, startY, 3);
}

/**
 * Advance simulation by one tick.
 * @param {Object} keys - Map of pressed keys (e.g. { ArrowLeft: true })
 */
export function updateLevel(keys) {
  LV_update(keys);
}

/**
 * Render everything onto the internal offscreen canvas.
 * @param {number} t - Time in seconds since start
 */
export function drawLevel(t) {
  LV_draw(t);
}

/**
 * Return the offscreen canvas (for Phaser to copy / display).
 */
export function getCanvas() {
  return _canvas;
}

/**
 * Return the party's current tile position.
 */
export function getPartyTile() {
  return {
    tx: Math.floor(_party.x / LV_TILE),
    ty: Math.floor(_party.y / LV_TILE)
  };
}

/**
 * Return a snapshot of the fog/fairies/flash game state (for save/restore).
 */
export function getGameState() {
  return {
    fairies: _gs.fairies,
    hasKey: _gs.hasKey,
    hasMap: _gs.hasMap,
    dead: JSON.parse(JSON.stringify(_gs.dead)),
    secretFound: _gs.secretFound,
    flash: _gs.flash,
    fog: JSON.parse(JSON.stringify(_fog)),
    partyX: _party.x,
    partyY: _party.y,
    partyFacing: _party.facing,
    objects: _objs.map(function (o) {
      return {
        id: o.id,
        alive: o.alive,
        open: !!o.open,
        hidden: !!o.hidden,
        visible: !!o.visible,
        respawnAt: o.respawnAt || 0
      };
    })
  };
}

/**
 * Restore game state from a previously saved snapshot.
 * @param {Object} gs - State object from getGameState()
 */
export function setGameState(gs) {
  if (!gs) return;
  _gs.fairies = gs.fairies || 0;
  _gs.hasKey = !!gs.hasKey;
  _gs.hasMap = !!gs.hasMap;
  _gs.dead = gs.dead ? JSON.parse(JSON.stringify(gs.dead)) : {};
  _gs.secretFound = !!gs.secretFound;
  _gs.flash = 0; // reset flash on restore

  if (gs.fog) {
    _fog = JSON.parse(JSON.stringify(gs.fog));
  }
  if (gs.partyX != null && gs.partyY != null) {
    _party.x = gs.partyX;
    _party.y = gs.partyY;
    _party.facing = gs.partyFacing || 'down';
    _party.trail = [];
    for (var ti = 0; ti < _party.trailLen * 2 + 2; ti++) {
      _party.trail.push({ x: _party.x, y: _party.y });
    }
  }
  if (gs.objects) {
    for (var oi = 0; oi < _objs.length; oi++) {
      var o = _objs[oi];
      for (var si = 0; si < gs.objects.length; si++) {
        var saved = gs.objects[si];
        if (saved.id === o.id) {
          o.alive = saved.alive;
          o.open = !!saved.open;
          o.hidden = !!saved.hidden;
          o.visible = !!saved.visible;
          o.respawnAt = saved.respawnAt || 0;
          break;
        }
      }
    }
  }
}

/**
 * Trigger a red flash effect (e.g. on encounter).
 * @param {number} amount - Flash intensity (frames)
 */
export function triggerFlash(amount) {
  _gs.flash = amount || 8;
}

/**
 * Mark an object as dead/consumed by its id.
 * Also spawns death particles at the object's position.
 * @param {string} id - Object id
 */
export function markDead(id) {
  _gs.dead[id] = true;
  // Spawn death sparkles at the object's tile
  for (var oi = 0; oi < _objs.length; oi++) {
    var o = _objs[oi];
    if (o.id === id) {
      var wx = (o.tx + 0.5) * LV_TILE, wy = (o.ty + 0.5) * LV_TILE;
      var colors = ['#ff6060', '#ffaa44', '#ffe040', '#ff80a0'];
      for (var pi = 0; pi < 8; pi++) {
        _deathParticles.push({
          x: wx, y: wy,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 3 - 1,
          t: 0, maxT: 30 + Math.floor(Math.random() * 20),
          col: colors[Math.floor(Math.random() * colors.length)]
        });
      }
      break;
    }
  }
}

// ─── ADDITIONAL EXPORTS (for backward compatibility / palette access) ──

export { LV_PAL, LV_TILE };
