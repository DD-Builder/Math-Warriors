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
import { FLOOR_PALETTES } from '../systems/papercut.js';
import { PAPER } from '../config.js';

// ─── PALETTE (exact copy from reference) ────────────────────────

function _hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

var LV_PAL = {
  dirt: _hex(PAPER.sand), dirtL: _hex(PAPER.creamD), soil: _hex(PAPER.sand),
  stone: _hex(PAPER.creamD), stoneD: _hex(PAPER.sand), stoneL: _hex(PAPER.cream), mortar: _hex(PAPER.sageD),
  hedge0: _hex(PAPER.forestD), hedge1: _hex(PAPER.forest), hedge2: _hex(PAPER.forestL), hedge3: _hex(PAPER.leaf), hedgeHL: _hex(PAPER.sage),
  rose: _hex(PAPER.rose), roseL: _hex(PAPER.coral), gold: _hex(PAPER.orange), goldL: _hex(PAPER.gold), cream: _hex(PAPER.cream),
  pond0: _hex(PAPER.tealD), pond1: _hex(PAPER.teal), pond2: _hex(PAPER.tealL), pondHL: _hex(PAPER.sky),
  fairy0: _hex(PAPER.sky), fairy1: _hex(PAPER.gold), fairy2: _hex(PAPER.tealL)
};

// ─── FLOOR PALETTES ─────────────────────────────────────────────

var FLOOR_PALS = {
  2: { // Tidepool — three zones: marsh, beach, water
    // Marsh sub-palette
    marsh_wall0: _hex(PAPER.forestD), marsh_wall1: _hex(PAPER.forest), marsh_floor: _hex(PAPER.forestL), marsh_floorL: _hex(PAPER.leaf),
    // Beach sub-palette
    beach_wall0: _hex(PAPER.sand), beach_wall1: _hex(PAPER.creamD), beach_floor: _hex(PAPER.cream), beach_floorL: _hex(PAPER.white),
    beach_path: _hex(PAPER.sageD), beach_pathL: _hex(PAPER.sage),
    // Water sub-palette
    water_wall0: _hex(PAPER.tealD), water_wall1: _hex(PAPER.teal), water_floor: _hex(PAPER.tealL), water_floorL: _hex(PAPER.sky),
    water_path: _hex(PAPER.sageD), water_pathL: _hex(PAPER.sage),
    // Shared
    accent: _hex(PAPER.rose), coral: _hex(PAPER.coral), waterHL: _hex(PAPER.sky),
    // Legacy compatibility
    wall0: _hex(PAPER.sand), wall1: _hex(PAPER.creamD), wall2: _hex(PAPER.sand), wall3: _hex(PAPER.creamD),
    floor0: _hex(PAPER.creamD), floorL: _hex(PAPER.cream),
    path0: _hex(PAPER.sageD), pathS: _hex(PAPER.sage), pathL: _hex(PAPER.creamD),
    water0: _hex(PAPER.teal), water1: _hex(PAPER.tealL),
    accentL: _hex(PAPER.rose),
  },
  3: { // Cloud — three zones: calm sky, storm, sunset heights
    // Calm Sky sub-palette (top-left, d<16)
    calm_wall: _hex(PAPER.sky), calm_wallD: _hex(PAPER.tealL), calm_floor: _hex(PAPER.cream), calm_floorL: _hex(PAPER.white),
    calm_path: _hex(PAPER.sand), calm_pathL: _hex(PAPER.creamD),
    // Storm sub-palette (middle, 16<=d<36)
    storm_wall: _hex(PAPER.tealD), storm_wallD: _hex(PAPER.inkTeal), storm_floor: _hex(PAPER.teal), storm_floorL: _hex(PAPER.tealL),
    storm_path: _hex(PAPER.sageD), storm_pathL: _hex(PAPER.sage),
    // Sunset Heights sub-palette (bottom-right, d>=36)
    sunset_wall: _hex(PAPER.peach), sunset_wallD: _hex(PAPER.coral), sunset_floor: _hex(PAPER.peach), sunset_floorL: _hex(PAPER.cream),
    sunset_path: _hex(PAPER.orange), sunset_pathL: _hex(PAPER.gold),
    // Shared
    water0: _hex(PAPER.sky), water1: _hex(PAPER.cream), waterHL: _hex(PAPER.white),
    accent: _hex(PAPER.gold), accentL: _hex(PAPER.gold), wisp: _hex(PAPER.cream),
    // Legacy compatibility
    wall0: _hex(PAPER.tealD), wall1: _hex(PAPER.teal), wall2: _hex(PAPER.tealL), wall3: _hex(PAPER.sky),
    floor0: _hex(PAPER.sageD), floorL: _hex(PAPER.sage),
    path0: _hex(PAPER.sage), pathS: _hex(PAPER.creamD), pathL: _hex(PAPER.cream),
  },
  4: { // Ember
    wall0: _hex(PAPER.coralD), wall1: _hex(PAPER.coral), wall2: _hex(PAPER.peach), wall3: _hex(PAPER.orange),
    floor0: _hex(PAPER.sand), floorL: _hex(PAPER.creamD),
    path0: _hex(PAPER.sageD), pathS: _hex(PAPER.sage), pathL: _hex(PAPER.creamD),
    water0: _hex(PAPER.coral), water1: _hex(PAPER.peach), waterHL: _hex(PAPER.orange),
    accent: _hex(PAPER.coral), accentL: _hex(PAPER.peach), ember: _hex(PAPER.gold),
  },
  5: { // Arcane (now Frozen Peak)
    wall0: _hex(PAPER.tealD), wall1: _hex(PAPER.teal), wall2: _hex(PAPER.tealL), wall3: _hex(PAPER.sky),
    floor0: _hex(PAPER.sky), floorL: _hex(PAPER.cream),
    path0: _hex(PAPER.cream), pathS: _hex(PAPER.creamD), pathL: _hex(PAPER.white),
    water0: _hex(PAPER.teal), water1: _hex(PAPER.tealL), waterHL: _hex(PAPER.sky),
    accent: _hex(PAPER.white), accentL: _hex(PAPER.cream), rune: _hex(PAPER.tealL),
  },
  6: { // Crystal Caverns
    wall0: _hex(PAPER.lavenderD), wall1: _hex(PAPER.lavender), wall2: _hex(PAPER.tealD), wall3: _hex(PAPER.teal),
    floor0: _hex(PAPER.lavenderD), floorL: _hex(PAPER.lavender),
    path0: _hex(PAPER.lavender), pathS: _hex(PAPER.tealL), pathL: _hex(PAPER.sky),
    water0: _hex(PAPER.tealD), water1: _hex(PAPER.teal), waterHL: _hex(PAPER.lavender),
    accent: _hex(PAPER.lavender), accentL: _hex(PAPER.rose), rune: _hex(PAPER.sky),
  },
  7: { // Market Square
    wall0: _hex(PAPER.sand), wall1: _hex(PAPER.creamD), wall2: _hex(PAPER.cream), wall3: _hex(PAPER.peach),
    floor0: _hex(PAPER.cream), floorL: _hex(PAPER.white),
    path0: _hex(PAPER.sand), pathS: _hex(PAPER.creamD), pathL: _hex(PAPER.cream),
    water0: _hex(PAPER.sageD), water1: _hex(PAPER.sage), waterHL: _hex(PAPER.gold),
    accent: _hex(PAPER.gold), accentL: _hex(PAPER.orange), rune: _hex(PAPER.gold),
  },
  8: { // Infinity Library
    wall0: _hex(PAPER.forestD), wall1: _hex(PAPER.forest), wall2: _hex(PAPER.forestL), wall3: _hex(PAPER.leaf),
    floor0: _hex(PAPER.sand), floorL: _hex(PAPER.creamD),
    path0: _hex(PAPER.sageD), pathS: _hex(PAPER.sage), pathL: _hex(PAPER.creamD),
    water0: _hex(PAPER.forestD), water1: _hex(PAPER.forest), waterHL: _hex(PAPER.sageD),
    accent: _hex(PAPER.orange), accentL: _hex(PAPER.gold), rune: _hex(PAPER.gold),
  },
  9: { // The Mending Room (arcane)
    wall0: _hex(PAPER.inkTeal), wall1: _hex(PAPER.tealD), wall2: _hex(PAPER.teal), wall3: _hex(PAPER.tealL),
    floor0: _hex(PAPER.tealD), floorL: _hex(PAPER.teal),
    path0: _hex(PAPER.lavenderD), pathS: _hex(PAPER.lavender), pathL: _hex(PAPER.sky),
    water0: _hex(PAPER.inkTeal), water1: _hex(PAPER.tealD), waterHL: _hex(PAPER.lavender),
    accent: _hex(PAPER.rose), accentL: _hex(PAPER.lavender), rune: _hex(PAPER.lavender),
  },
};

var _floorTheme = 1;
var _transformed = false;

// ─── FOG COLOR (derived from floor palette) ─────────────────────

var _fogR = 217, _fogG = 207, _fogB = 178;
var _fogColor = 'rgb(217,207,178)';
var _fogColorMinimap = 'rgb(223,211,180)';
var _fogColorMinimapBg = 'rgb(217,207,178)';

function _updateFogColor() {
  var fogHex = (FLOOR_PALETTES[_floorTheme] && FLOOR_PALETTES[_floorTheme].fog) || PAPER.sand;
  _fogR = (fogHex >> 16) & 0xff;
  _fogG = (fogHex >> 8) & 0xff;
  _fogB = fogHex & 0xff;
  _fogColor = 'rgb(' + _fogR + ',' + _fogG + ',' + _fogB + ')';
  // Minimap fog (slightly lighter for unrevealed tiles)
  var mmR = Math.min(255, _fogR + 6);
  var mmG = Math.min(255, _fogG + 4);
  var mmB = Math.min(255, _fogB + 2);
  _fogColorMinimap = 'rgb(' + mmR + ',' + mmG + ',' + mmB + ')';
  // Minimap background (same as base fog)
  _fogColorMinimapBg = _fogColor;
}

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
var _dustParticles = []; // footstep dust puffs {x,y,vx,vy,t,maxT}
var _lastDustMs = 0;     // timestamp of last footstep puff spawn
var _minimapCanvas = null;
var _minimapG = null;

// ─── HELPER: ellipse shorthand ──────────────────────────────────

function LV_ellipse(cx, cy, rx, ry, rot) {
  _G.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2);
}

// ─── LV_cut — papercut shadow renderer (1:1 from reference) ────

function LV_cut(color, elev, fn) {
  _G.save();
  _G.shadowColor = 'rgba(31,61,63,0.2)';
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
  var m = LV_TILE * 0.18;
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
    LV_cut(_hex(PAPER.forestD), 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.forest), 5, function () { var r2 = mkRng(tx * 7 + ty * 11); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.1 + r() * 0.1), 4 + Math.floor(r() * 3), r2, 0.7); });
    LV_cut(_hex(PAPER.leaf), 3, function () { var r2 = mkRng(tx * 13 + ty * 17); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.25 + r() * 0.1), 3 + Math.floor(r() * 3), r2, 0.6); });
    var cr = mkRng(tx * 31 + ty * 53 + 3);
    for (var c = 0; c < 3 + Math.floor(cr() * 4); c++) {
      var cbx = sx + ts * (0.08 + cr() * 0.84), cby = sy + ts * (0.05 + cr() * 0.35);
      var cbc = cr() < 0.4 ? LV_PAL.rose : LV_PAL.goldL;
      LV_cut(cbc, 2, function () { _G.arc(cbx, cby, ts * 0.07, 0, Math.PI * 2); });
    }
  }
  // Stone block detail: 2 thin horizontal lines + 1 vertical line
  _G.save();
  _G.strokeStyle = 'rgba(31,61,63,0.08)';
  _G.lineWidth = 1;
  _G.beginPath();
  _G.moveTo(sx, sy + ts / 3); _G.lineTo(sx + ts, sy + ts / 3);
  _G.moveTo(sx, sy + ts * 2 / 3); _G.lineTo(sx + ts, sy + ts * 2 / 3);
  var vx = sx + (tx * 7 + ty * 13) % ts;
  _G.moveTo(vx, sy); _G.lineTo(vx, sy + ts);
  _G.stroke();
  _G.restore();
}

function LV_drawFloor(sx, sy, ts, tx, ty) {
  var r = mkRng(tx * 19 + ty * 53 + 2);
  LV_cut(LV_PAL.dirt, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.55) { var pr = mkRng(tx * 29 + ty * 67 + 4); var px = sx + pr() * ts * 0.5 + ts * 0.1, py = sy + pr() * ts * 0.5 + ts * 0.1; LV_cut(LV_PAL.dirtL, 1, function () { _G.rect(px, py, ts * (0.3 + pr() * 0.3), ts * (0.2 + pr() * 0.2)); }); }
  if (r() < 0.06) { var flr = mkRng(tx * 43 + ty * 29 + 5); var flx = sx + ts * (0.35 + flr() * 0.3), fly = sy + ts * (0.35 + flr() * 0.3); LV_cut(flr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL, 1, function () { _G.arc(flx, fly, ts * 0.055, 0, Math.PI * 2); }); }
  // Transformation: flowers and petals bloom on bare dirt
  if (_transformed && r() < 0.25) {
    var fr = mkRng(tx * 67 + ty * 31 + 99);
    var fx = sx + ts * (0.2 + fr() * 0.6), fy = sy + ts * (0.2 + fr() * 0.6);
    var fc = fr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL;
    LV_cut(fc, 1, function() { _G.arc(fx, fy, ts * 0.06 + fr() * ts * 0.03, 0, Math.PI * 2); });
    if (fr() < 0.4) {
      var lx = sx + ts * (0.15 + fr() * 0.7), ly = sy + ts * (0.15 + fr() * 0.5);
      LV_cut(_hex(PAPER.leaf), 0, function() { _G.arc(lx, ly, ts * 0.04, 0, Math.PI * 2); });
    }
  }
  // Subtle grain dots
  _G.save();
  _G.fillStyle = 'rgba(31,61,63,0.06)';
  for (var gi = 0; gi < 4; gi++) {
    var gx = sx + (tx * 31 + ty * 17 + gi * 7) % ts;
    var gy = sy + (tx * 13 + ty * 41 + gi * 11) % ts;
    _G.beginPath(); _G.arc(gx, gy, 1, 0, Math.PI * 2); _G.fill();
  }
  _G.restore();
}

function LV_drawPath(sx, sy, ts, tx, ty) {
  LV_cut(LV_PAL.mortar, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  var stones = [[sx + ts * 0.04, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.04, sy + ts * 0.52, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.52, ts * 0.44, ts * 0.44]];
  for (var si = 0; si < 4; si++) {
    var st = stones[si]; var sr = mkRng(tx * 41 + ty * 83 + si * 11);
    LV_cut(si % 2 === 0 ? LV_PAL.stone : LV_PAL.stoneD, 2, (function (st2, sr2) { return function () { LV_wobRect(st2[0] + sr2() * 2, st2[1] + sr2() * 2, st2[2] - sr2() * 2, st2[3] - sr2() * 2, mkRng(si * 7 + tx + ty), 1.5); }; })(st, sr));
  }
  // Cobblestone highlights: 3 small lighter circles down the center
  _G.save();
  _G.fillStyle = 'rgba(253,251,242,0.1)';
  for (var ci = 0; ci < 3; ci++) {
    _G.beginPath();
    _G.arc(sx + ts * 0.5, sy + ts * (0.2 + ci * 0.3), 2, 0, Math.PI * 2);
    _G.fill();
  }
  _G.restore();
}

function LV_drawWater(sx, sy, ts, tx, ty, t) {
  LV_cut(LV_PAL.pond0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(LV_PAL.pond1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(LV_PAL.pondHL, 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.18 + Math.sin(t * 2 + ty) * ts * 0.04, ts * 0.35, ts * 0.05); });
  // Sine-wave ripple line
  _G.save();
  _G.strokeStyle = 'rgba(127,179,174,0.12)';
  _G.lineWidth = 1;
  _G.beginPath();
  for (var wp = 0; wp <= ts; wp += 2) {
    var wy = sy + ts * 0.5 + 2 * Math.sin(wp * 0.3 + tx * 0.5);
    if (wp === 0) _G.moveTo(sx + wp, wy); else _G.lineTo(sx + wp, wy);
  }
  _G.stroke();
  _G.restore();
}

// ─── FLOOR 2: TIDEPOOL TILES (zone-aware) ───────────────────────

function LV_getZone2(tx, ty) {
  var d = tx + ty;
  if (d < 14) return 0; // marsh
  if (d < 28) return 1; // beach
  return 2; // water
}

function LV_drawWall_tidepool(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[2], r = mkRng(tx * 31 + ty * 97 + 201);
  var zone = LV_getZone2(tx, ty);
  if (zone === 0) {
    // Marsh: dark green vegetation walls, swampy bumps, moss accents
    LV_cut(P.marsh_wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(P.marsh_wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.55); });
    LV_cut(_hex(PAPER.leaf), 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
    // Moss accents
    if (r() < 0.35) {
      var mr = mkRng(tx * 17 + ty * 37 + 3); var mx = sx + ts * (0.2 + mr() * 0.6), my = sy + ts * (0.6 + mr() * 0.2);
      LV_cut(_hex(PAPER.sage), 1, function () { _G.arc(mx, my, ts * 0.07, 0, Math.PI * 2); });
      LV_cut(_hex(PAPER.sage), 0, function () { _G.arc(mx + ts * 0.04, my - ts * 0.02, ts * 0.04, 0, Math.PI * 2); });
    }
  } else if (zone === 1) {
    // Beach: sandy tan dunes, driftwood brown, flat tops
    LV_cut(P.beach_wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(P.beach_wall1, 4, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.85); });
    // Flat dune top
    LV_cut(_hex(PAPER.creamD), 2, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.05, ts * 0.84, ts * 0.2); });
    // Driftwood
    if (r() < 0.25) {
      var dr = mkRng(tx * 23 + ty * 41);
      _G.save(); _G.strokeStyle = _hex(PAPER.sageD); _G.lineWidth = 2; _G.globalAlpha = 0.6;
      _G.beginPath(); _G.moveTo(sx + ts * (0.2 + dr() * 0.3), sy + ts * (0.5 + dr() * 0.2));
      _G.lineTo(sx + ts * (0.5 + dr() * 0.3), sy + ts * (0.4 + dr() * 0.2)); _G.stroke(); _G.restore();
    }
  } else {
    // Water: dark blue-grey rock formations, coral accents
    LV_cut(P.water_wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(P.water_wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.2 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.6); });
    LV_cut(_hex(PAPER.tealL), 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.35 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.5); });
    // Coral accents
    if (r() < 0.3) {
      var cr = mkRng(tx * 17 + ty * 37 + 3); var cx = sx + ts * (0.2 + cr() * 0.6), cy = sy + ts * (0.15 + cr() * 0.3);
      LV_cut(P.coral, 2, function () { _G.arc(cx, cy, ts * 0.08, 0, Math.PI * 2); });
      LV_cut(P.accent, 1, function () { _G.arc(cx + ts * 0.05, cy - ts * 0.03, ts * 0.05, 0, Math.PI * 2); });
    }
  }
}
function LV_drawFloor_tidepool(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[2], r = mkRng(tx * 19 + ty * 53 + 202);
  var zone = LV_getZone2(tx, ty);
  if (zone === 0) {
    // Marsh: dark muddy green with small puddle accents
    LV_cut(P.marsh_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.marsh_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
    // Puddle accents (dark circles)
    if (r() < 0.3) { var pr2 = mkRng(tx * 43 + ty * 29); LV_cut(_hex(PAPER.forestD), 0, function () { _G.arc(sx + ts * (0.3 + pr2() * 0.4), sy + ts * (0.3 + pr2() * 0.4), ts * 0.08, 0, Math.PI * 2); }); }
    // Transformation: lily pads on marsh
    if (_transformed && r() < 0.2) {
      var fr2 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut(_hex(PAPER.leaf), 1, function() { _G.arc(sx + ts * (0.3 + fr2() * 0.4), sy + ts * (0.3 + fr2() * 0.4), ts * 0.07, 0, Math.PI * 2); });
    }
  } else if (zone === 1) {
    // Beach: light tan sand, flat, occasional tiny shell dots
    LV_cut(P.beach_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.beach_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.3 + pr() * 0.25), ts * (0.2 + pr() * 0.15)); }); }
    // Shell dots
    if (r() < 0.2) { var sr = mkRng(tx * 43 + ty * 29); LV_cut(_hex(PAPER.cream), 0, function () { _G.arc(sx + ts * (0.3 + sr() * 0.4), sy + ts * (0.4 + sr() * 0.3), ts * 0.03, 0, Math.PI * 2); }); }
    // Transformation: colorful shells and starfish on beach
    if (_transformed && r() < 0.22) {
      var fr2 = mkRng(tx * 67 + ty * 31 + 99);
      var shCol = fr2() < 0.33 ? P.coral : fr2() < 0.66 ? P.accent : _hex(PAPER.peach);
      LV_cut(shCol, 1, function() { _G.arc(sx + ts * (0.2 + fr2() * 0.6), sy + ts * (0.2 + fr2() * 0.6), ts * 0.05 + fr2() * ts * 0.03, 0, Math.PI * 2); });
    }
  } else {
    // Water: shallow turquoise with ripple highlight lines
    LV_cut(P.water_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.5) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.water_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.3 + ts * 0.1, sy + pr() * ts * 0.3 + ts * 0.15, ts * (0.3 + pr() * 0.2), ts * 0.06); }); }
    // Ripple highlights
    if (r() < 0.35) {
      _G.save(); _G.strokeStyle = P.waterHL; _G.lineWidth = 1; _G.globalAlpha = 0.3;
      var rr = mkRng(tx * 47 + ty * 31);
      _G.beginPath(); _G.moveTo(sx + ts * (0.15 + rr() * 0.2), sy + ts * (0.3 + rr() * 0.3));
      _G.lineTo(sx + ts * (0.5 + rr() * 0.3), sy + ts * (0.3 + rr() * 0.3)); _G.stroke(); _G.restore();
    }
    // Transformation: glowing coral dots in water
    if (_transformed && r() < 0.2) {
      var fr2 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut(P.waterHL, 0, function() { _G.arc(sx + ts * (0.25 + fr2() * 0.5), sy + ts * (0.25 + fr2() * 0.5), ts * 0.04, 0, Math.PI * 2); });
    }
  }
}
function LV_drawPath_tidepool(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[2], r = mkRng(tx * 41 + ty * 83 + 203);
  var zone = LV_getZone2(tx, ty);
  if (zone === 0) {
    // Marsh: muddy boardwalk (dark brown planks)
    LV_cut(_hex(PAPER.forestD), 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    // Planks: horizontal lines
    for (var pi = 0; pi < 4; pi++) {
      var py = sy + ts * 0.05 + pi * ts * 0.24;
      LV_cut(_hex(PAPER.forest), 2, function () { _G.rect(sx + ts * 0.04, py, ts * 0.92, ts * 0.18); });
      LV_cut(_hex(PAPER.forestL), 1, function () { _G.rect(sx + ts * 0.08, py + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else if (zone === 1) {
    // Beach: sandy boardwalk (light tan planks)
    LV_cut(P.beach_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var pi2 = 0; pi2 < 4; pi2++) {
      var py2 = sy + ts * 0.05 + pi2 * ts * 0.24;
      LV_cut(P.beach_pathL, 2, function () { _G.rect(sx + ts * 0.04, py2, ts * 0.92, ts * 0.18); });
      LV_cut(_hex(PAPER.creamD), 1, function () { _G.rect(sx + ts * 0.08, py2 + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else {
    // Water: grey stepping stones (rounded rectangles in blue water)
    LV_cut(_hex(PAPER.tealD), 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    // Two stepping stones
    var sr = mkRng(tx * 41 + ty * 83 + 7);
    LV_cut(P.water_path, 3, function () {
      _G.moveTo(sx + ts * 0.1 + sr() * 2, sy + ts * 0.08);
      _G.lineTo(sx + ts * 0.5 + sr() * 2, sy + ts * 0.08);
      _G.lineTo(sx + ts * 0.52, sy + ts * 0.38);
      _G.lineTo(sx + ts * 0.08, sy + ts * 0.38);
    });
    LV_cut(P.water_pathL, 3, function () {
      _G.moveTo(sx + ts * 0.4 + sr() * 2, sy + ts * 0.54);
      _G.lineTo(sx + ts * 0.88 + sr() * 2, sy + ts * 0.54);
      _G.lineTo(sx + ts * 0.9, sy + ts * 0.86);
      _G.lineTo(sx + ts * 0.38, sy + ts * 0.86);
    });
  }
}
function LV_drawWater_tidepool(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[2];
  var zone = LV_getZone2(tx, ty);
  if (zone === 0) {
    // Marsh: murky green pond
    LV_cut(_hex(PAPER.forestD), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.forest), 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
    LV_cut(_hex(PAPER.forestL), 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.2 + Math.sin(t * 1.5 + ty) * ts * 0.04, ts * 0.35, ts * 0.04); });
  } else if (zone === 1) {
    // Beach: tidal pool (turquoise with sand border)
    LV_cut(_hex(PAPER.sand), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.teal), 3, function () { _G.rect(sx + ts * 0.1, sy + ts * 0.1, ts * 0.8, ts * 0.8); });
    LV_cut(_hex(PAPER.tealL), 1, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.15, ts * 0.7, ts * 0.7); });
    LV_cut(P.waterHL, 0, function () { _G.rect(sx + ts * 0.2, sy + ts * 0.2 + Math.sin(t * 1.8 + ty) * ts * 0.04, ts * 0.3, ts * 0.04); });
  } else {
    // Water: deep ocean blue with animated wave highlights
    LV_cut(_hex(PAPER.tealD), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.teal), 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.08, ts * 0.9, ts * 0.8); });
    // Animated wave highlights
    LV_cut(P.waterHL, 0, function () { _G.rect(sx + ts * 0.1, sy + ts * 0.15 + Math.sin(t * 2.2 + ty) * ts * 0.05, ts * 0.35, ts * 0.04); });
    LV_cut(P.waterHL, 0, function () { _G.rect(sx + ts * 0.5, sy + ts * 0.55 + Math.sin(t * 2.2 + ty + 1.5) * ts * 0.05, ts * 0.3, ts * 0.03); });
  }
}

// ─── FLOOR 3: CLOUD TILES (zone-aware) ─────────────────────────

function LV_getZone3(tx, ty) {
  var d = tx + ty;
  return d < 16 ? 0 : d < 36 ? 1 : 2;
}

function LV_drawWall_cloud(sx, sy, ts, tx, ty) {
  var zone = LV_getZone3(tx, ty);
  var r = mkRng(tx * 31 + ty * 97 + 301);

  // Base colors per zone
  var baseCol = zone === 0 ? _hex(PAPER.sky) : zone === 1 ? _hex(PAPER.tealD) : _hex(PAPER.peach);
  var lightCol = zone === 0 ? _hex(PAPER.cream) : zone === 1 ? _hex(PAPER.teal) : _hex(PAPER.cream);
  var highlightCol = zone === 0 ? _hex(PAPER.white) : zone === 1 ? _hex(PAPER.tealL) : _hex(PAPER.white);

  // Base fill
  LV_cut(baseCol, 6, function() { _G.rect(sx, sy, ts + 1, ts + 1); });

  // Fluffy cloud bumps (overlapping circles, NOT spikes)
  var bumps = 3 + Math.floor(r() * 2);
  for (var b = 0; b < bumps; b++) {
    var bx = sx + ((b + 0.5) / bumps) * ts;
    var by = sy + ts * (0.25 + r() * 0.2);
    var br = ts * (0.22 + r() * 0.1);
    LV_cut(lightCol, 3, function() { _G.arc(bx, by, br, 0, Math.PI * 2); });
  }
  // Top highlight bumps
  for (var b2 = 0; b2 < bumps - 1; b2++) {
    var bx2 = sx + ((b2 + 1) / bumps) * ts;
    var by2 = sy + ts * (0.18 + r() * 0.12);
    LV_cut(highlightCol, 1, function() { _G.arc(bx2, by2, ts * (0.14 + r() * 0.06), 0, Math.PI * 2); });
  }
}
function LV_drawFloor_cloud(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[3], r = mkRng(tx * 19 + ty * 53 + 302);
  var zone = LV_getZone3(tx, ty);
  if (zone === 0) {
    // Calm: Light blue-grey stone platforms
    LV_cut(P.calm_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.calm_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
    // Transformation: golden sunbeam dots
    if (_transformed && r() < 0.2) {
      var fr3 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut(P.accent, 0, function() { _G.arc(sx + ts * (0.2 + fr3() * 0.6), sy + ts * (0.2 + fr3() * 0.6), ts * 0.05, 0, Math.PI * 2); });
    }
  } else if (zone === 1) {
    // Storm: Dark grey stone with occasional lightning crack accents
    LV_cut(P.storm_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.storm_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
    // Lightning crack accents (thin yellow lines)
    if (r() < 0.15) {
      _G.save(); _G.strokeStyle = _hex(PAPER.gold); _G.lineWidth = 0.8; _G.globalAlpha = 0.35;
      var cr = mkRng(tx * 43 + ty * 29);
      _G.beginPath(); _G.moveTo(sx + ts * (0.2 + cr() * 0.3), sy + ts * (0.2 + cr() * 0.2));
      _G.lineTo(sx + ts * (0.4 + cr() * 0.2), sy + ts * (0.5 + cr() * 0.2));
      _G.lineTo(sx + ts * (0.5 + cr() * 0.3), sy + ts * (0.7 + cr() * 0.2)); _G.stroke(); _G.restore();
    }
    // Transformation: storm clearing - bright patches
    if (_transformed && r() < 0.18) {
      var fr3 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut(_hex(PAPER.creamD), 0, function() { _G.arc(sx + ts * (0.25 + fr3() * 0.5), sy + ts * (0.25 + fr3() * 0.5), ts * 0.06, 0, Math.PI * 2); });
    }
  } else {
    // Sunset: Warm amber/gold stone
    LV_cut(P.sunset_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.sunset_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
    // Transformation: warm golden glow dots
    if (_transformed && r() < 0.2) {
      var fr3 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut(_hex(PAPER.gold), 0, function() { _G.arc(sx + ts * (0.2 + fr3() * 0.6), sy + ts * (0.2 + fr3() * 0.6), ts * 0.05, 0, Math.PI * 2); });
    }
  }
}
function LV_drawPath_cloud(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[3], r = mkRng(tx * 41 + ty * 83 + 303);
  var zone = LV_getZone3(tx, ty);
  if (zone === 0) {
    // Calm: Golden sky-bridge planks
    LV_cut(P.calm_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var pi = 0; pi < 4; pi++) {
      var py = sy + ts * 0.05 + pi * ts * 0.24;
      LV_cut(P.calm_pathL, 2, function () { _G.rect(sx + ts * 0.04, py, ts * 0.92, ts * 0.18); });
      LV_cut(_hex(PAPER.creamD), 1, function () { _G.rect(sx + ts * 0.08, py + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else if (zone === 1) {
    // Storm: Cracked dark grey stone bridge
    LV_cut(P.storm_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.storm_pathL : _hex(PAPER.tealL), 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
    // Crack line
    if (r() < 0.3) {
      _G.save(); _G.strokeStyle = _hex(PAPER.inkTeal); _G.lineWidth = 1; _G.globalAlpha = 0.5;
      var cr2 = mkRng(tx * 53 + ty * 37);
      _G.beginPath(); _G.moveTo(sx + ts * cr2() * 0.5, sy + ts * 0.1);
      _G.lineTo(sx + ts * (0.3 + cr2() * 0.4), sy + ts * 0.9); _G.stroke(); _G.restore();
    }
  } else {
    // Sunset: Glowing warm sunset bridge (amber with glow)
    LV_cut(P.sunset_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var pi2 = 0; pi2 < 4; pi2++) {
      var py2 = sy + ts * 0.05 + pi2 * ts * 0.24;
      LV_cut(P.sunset_pathL, 2, function () { _G.rect(sx + ts * 0.04, py2, ts * 0.92, ts * 0.18); });
      LV_cut(_hex(PAPER.gold), 1, function () { _G.rect(sx + ts * 0.08, py2 + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
    // Warm glow overlay
    _G.save(); _G.globalAlpha = 0.08; _G.fillStyle = _hex(PAPER.gold);
    _G.beginPath(); _G.arc(sx + ts * 0.5, sy + ts * 0.5, ts * 0.35, 0, Math.PI * 2); _G.fill(); _G.restore();
  }
}
function LV_drawWater_cloud(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[3];
  var zone = LV_getZone3(tx, ty);
  if (zone === 0) {
    // Calm: Wispy white mist
    LV_cut(_hex(PAPER.cream), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.white), 3, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.12, ts * 0.84, ts * 0.7); });
    LV_cut(_hex(PAPER.white), 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.4 + Math.sin(t * 1.5 + tx) * ts * 0.06, ts * 0.15, 0, Math.PI * 2); });
    LV_cut(_hex(PAPER.white), 0, function () { _G.arc(sx + ts * 0.3, sy + ts * 0.6 + Math.sin(t * 1.2 + ty) * ts * 0.04, ts * 0.1, 0, Math.PI * 2); });
  } else if (zone === 1) {
    // Storm: Dark void (nearly black with distant stars)
    LV_cut(_hex(PAPER.inkTeal), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.tealD), 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.08, ts * 0.9, ts * 0.84); });
    // Distant stars
    var sr = mkRng(tx * 43 + ty * 67 + 303);
    for (var i = 0; i < 3; i++) {
      var stx = sx + ts * (0.1 + sr() * 0.8), sty = sy + ts * (0.1 + sr() * 0.8);
      LV_cut(_hex(PAPER.sky), 0, function () { _G.arc(stx, sty, ts * 0.02, 0, Math.PI * 2); });
    }
  } else {
    // Sunset: Orange/pink sunset haze
    LV_cut(_hex(PAPER.coral), 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(_hex(PAPER.peach), 3, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.1, ts * 0.84, ts * 0.75); });
    LV_cut(_hex(PAPER.peach), 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.45 + Math.sin(t * 1.3 + tx) * ts * 0.05, ts * 0.16, 0, Math.PI * 2); });
    LV_cut(_hex(PAPER.cream), 0, function () { _G.arc(sx + ts * 0.35, sy + ts * 0.6 + Math.sin(t * 1.6 + ty) * ts * 0.03, ts * 0.1, 0, Math.PI * 2); });
  }
}

// ─── FLOOR 4: EMBER TILES ──────────────────────────────────────

function LV_drawWall_ember(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[4], r = mkRng(tx * 31 + ty * 97 + 401);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.18 + r() * 0.1), 3 + Math.floor(r() * 3), r2, 0.65); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.32 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.55); });
  if (r() < 0.25) { var lr = mkRng(tx * 37 + ty * 53); _G.save(); _G.strokeStyle = P.ember; _G.lineWidth = 1.2; _G.globalAlpha = 0.4; _G.beginPath(); _G.moveTo(sx + lr() * ts, sy); _G.lineTo(sx + lr() * ts, sy + ts); _G.stroke(); _G.restore(); }
}
function LV_drawFloor_ember(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[4], r = mkRng(tx * 19 + ty * 53 + 402);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.45) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  if (r() < 0.08) { LV_cut(P.accent, 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.5, ts * 0.04, 0, Math.PI * 2); }); }
  // Transformation: cooled rock patches (grey replacing red)
  if (_transformed && r() < 0.22) {
    var fr4 = mkRng(tx * 67 + ty * 31 + 99);
    var coolCol = fr4() < 0.5 ? _hex(PAPER.sage) : _hex(PAPER.creamD);
    LV_cut(coolCol, 1, function() { _G.rect(sx + ts * (0.15 + fr4() * 0.3), sy + ts * (0.15 + fr4() * 0.3), ts * (0.2 + fr4() * 0.15), ts * (0.15 + fr4() * 0.1)); });
  }
}
function LV_drawPath_ember(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[4];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_ember(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[4];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.ember, 0, function () { _G.arc(sx + ts * (0.3 + Math.sin(t * 2.5 + tx) * 0.15), sy + ts * 0.5, ts * 0.06, 0, Math.PI * 2); });
}

// ─── FLOOR 5: ARCANE TILES ─────────────────────────────────────

function LV_drawWall_arcane(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5], r = mkRng(tx * 31 + ty * 97 + 501);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.5); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
  if (r() < 0.2) { var rr = mkRng(tx * 23 + ty * 41); LV_cut(P.rune, 0, function () { _G.arc(sx + ts * (0.3 + rr() * 0.4), sy + ts * (0.15 + rr() * 0.25), ts * 0.07, 0, Math.PI * 2); }); _G.save(); _G.globalAlpha = 0.15; _G.fillStyle = P.accent; _G.beginPath(); _G.arc(sx + ts * 0.5, sy + ts * 0.3, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore(); }
}
function LV_drawFloor_arcane(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5], r = mkRng(tx * 19 + ty * 53 + 502);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Transformation: glowing rune wisps
  if (_transformed && r() < 0.2) {
    var fr5 = mkRng(tx * 67 + ty * 31 + 99);
    LV_cut(P.rune || '#80c0e0', 0, function() { _G.arc(sx + ts * (0.2 + fr5() * 0.6), sy + ts * (0.2 + fr5() * 0.6), ts * 0.05 + fr5() * ts * 0.02, 0, Math.PI * 2); });
  }
}
function LV_drawPath_arcane(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_arcane(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[5];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent, 0, function () { _G.arc(sx + ts * (0.4 + Math.sin(t * 2 + ty * 0.5) * 0.1), sy + ts * 0.45, ts * 0.08 + Math.sin(t * 3) * ts * 0.02, 0, Math.PI * 2); });
}

// ─── FLOOR 6: ICE TILES (Frozen Peak) ─────────────────────────

function LV_drawWall_ice(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5], r = mkRng(tx * 31 + ty * 97 + 601);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.18 + r() * 0.1), 3 + Math.floor(r() * 3), r2, 0.6); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.32 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.5); });
  if (r() < 0.2) { LV_cut(P.accent, 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.3, ts * 0.06, 0, Math.PI * 2); }); }
  // Angular crystalline edge highlights on ice walls
  _G.save();
  _G.strokeStyle = 'rgba(253,251,242,0.12)';
  _G.lineWidth = 1;
  var ir5 = mkRng(tx * 47 + ty * 59 + 605);
  // Short diagonal white strokes at tile edges
  var edgeX = ir5() < 0.5 ? sx + ts * 0.05 : sx + ts * 0.85;
  var edgeY = sy + ts * (0.1 + ir5() * 0.3);
  _G.beginPath(); _G.moveTo(edgeX, edgeY); _G.lineTo(edgeX + ts * 0.1, edgeY + ts * 0.15); _G.stroke();
  if (ir5() < 0.6) {
    edgeX = ir5() < 0.5 ? sx + ts * 0.9 : sx + ts * 0.1;
    edgeY = sy + ts * (0.5 + ir5() * 0.3);
    _G.beginPath(); _G.moveTo(edgeX, edgeY); _G.lineTo(edgeX - ts * 0.08, edgeY + ts * 0.12); _G.stroke();
  }
  _G.restore();
}
function LV_drawFloor_ice(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5], r = mkRng(tx * 19 + ty * 53 + 602);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Ice crack lines on floor tiles (1-2 white lines, 0.15 alpha)
  _G.save();
  _G.strokeStyle = 'rgba(253,251,242,0.12)';
  _G.lineWidth = 1;
  var cr5 = mkRng(tx * 43 + ty * 71 + 607);
  var crackCount = 1 + Math.floor(cr5() * 2);
  for (var cci = 0; cci < crackCount; cci++) {
    var cx1 = sx + ts * (0.1 + cr5() * 0.3);
    var cy1 = sy + ts * (0.1 + cr5() * 0.3);
    var angle5 = cr5() * Math.PI;
    var clen = ts * (0.3 + cr5() * 0.3);
    _G.beginPath();
    _G.moveTo(cx1, cy1);
    _G.lineTo(cx1 + Math.cos(angle5) * clen, cy1 + Math.sin(angle5) * clen);
    _G.stroke();
  }
  _G.restore();
  // Transformation: thawed grass patches (green on ice)
  if (_transformed && r() < 0.22) {
    var fr5 = mkRng(tx * 67 + ty * 31 + 99);
    var grassCol = fr5() < 0.5 ? _hex(PAPER.leaf) : _hex(PAPER.sage);
    LV_cut(grassCol, 0, function() { _G.arc(sx + ts * (0.2 + fr5() * 0.6), sy + ts * (0.25 + fr5() * 0.5), ts * 0.06, 0, Math.PI * 2); });
  }
}
function LV_drawPath_ice(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_ice(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[5];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent, 0, function () { _G.arc(sx + ts * (0.35 + Math.sin(t * 1.8 + tx) * 0.12), sy + ts * 0.5, ts * 0.05, 0, Math.PI * 2); });
}

// ─── FLOOR 7: CRYSTAL TILES (Crystal Caverns) ────────────────

function LV_drawWall_crystal(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[6], r = mkRng(tx * 31 + ty * 97 + 701);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.5); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
  if (r() < 0.2) { var rr = mkRng(tx * 23 + ty * 41); LV_cut(P.rune, 0, function () { _G.arc(sx + ts * (0.3 + rr() * 0.4), sy + ts * (0.15 + rr() * 0.25), ts * 0.07, 0, Math.PI * 2); }); }
  // Faceted crystal diagonal lines on walls
  _G.save();
  _G.strokeStyle = 'rgba(156,143,192,0.12)';
  _G.lineWidth = 1;
  var cr6 = mkRng(tx * 43 + ty * 67 + 706);
  for (var ci = 0; ci < 2; ci++) {
    _G.beginPath();
    _G.moveTo(sx + cr6() * ts * 0.3, sy + cr6() * ts * 0.2);
    _G.lineTo(sx + ts * (0.5 + cr6() * 0.5), sy + ts * (0.5 + cr6() * 0.5));
    _G.stroke();
  }
  _G.restore();
}
function LV_drawFloor_crystal(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[6], r = mkRng(tx * 19 + ty * 53 + 702);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Diamond/hexagonal outlines on crystal floor tiles
  _G.save();
  _G.strokeStyle = 'rgba(156,143,192,0.12)';
  _G.lineWidth = 1;
  var dr6 = mkRng(tx * 37 + ty * 59 + 703);
  for (var di = 0; di < 2; di++) {
    var dcx = sx + ts * (0.2 + dr6() * 0.6);
    var dcy = sy + ts * (0.2 + dr6() * 0.6);
    var dsz = ts * 0.08;
    _G.beginPath();
    _G.moveTo(dcx, dcy - dsz);
    _G.lineTo(dcx + dsz * 0.87, dcy - dsz * 0.5);
    _G.lineTo(dcx + dsz * 0.87, dcy + dsz * 0.5);
    _G.lineTo(dcx, dcy + dsz);
    _G.lineTo(dcx - dsz * 0.87, dcy + dsz * 0.5);
    _G.lineTo(dcx - dsz * 0.87, dcy - dsz * 0.5);
    _G.closePath();
    _G.stroke();
  }
  _G.restore();
  // Transformation: prismatic sparkle dots
  if (_transformed && r() < 0.2) {
    var fr6 = mkRng(tx * 67 + ty * 31 + 99);
    var pCol = fr6() < 0.33 ? P.accent : fr6() < 0.66 ? _hex(PAPER.rose) : _hex(PAPER.tealL);
    LV_cut(pCol, 0, function() { _G.arc(sx + ts * (0.2 + fr6() * 0.6), sy + ts * (0.2 + fr6() * 0.6), ts * 0.04 + fr6() * ts * 0.02, 0, Math.PI * 2); });
  }
}
function LV_drawPath_crystal(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[6];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_crystal(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[6];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent, 0, function () { _G.arc(sx + ts * (0.4 + Math.sin(t * 2 + ty * 0.5) * 0.1), sy + ts * 0.45, ts * 0.06, 0, Math.PI * 2); });
}

// ─── FLOOR 8: MARKET TILES (Market Square) ───────────────────

function LV_drawWall_market(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[7], r = mkRng(tx * 31 + ty * 97 + 801);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.18 + r() * 0.1), 3 + Math.floor(r() * 3), r2, 0.6); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.32 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.5); });
  if (r() < 0.15) { LV_cut(P.accent, 0, function () { _G.rect(sx + ts * 0.3, sy + ts * 0.15, ts * 0.4, ts * 0.15); }); }
  // Gold window-like rectangles on market walls (15% chance)
  var wr7 = mkRng(tx * 53 + ty * 79 + 805);
  if (wr7() < 0.15) {
    _G.save();
    _G.fillStyle = 'rgba(236,185,100,0.18)';
    var wx = sx + ts * (0.25 + wr7() * 0.3);
    var wy = sy + ts * (0.15 + wr7() * 0.2);
    _G.fillRect(wx, wy, ts * 0.18, ts * 0.12);
    _G.restore();
  }
}
function LV_drawFloor_market(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[7], r = mkRng(tx * 19 + ty * 53 + 802);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.45) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Cobblestone 3x3 sub-grid pattern on market floor tiles
  _G.save();
  _G.strokeStyle = 'rgba(31,61,63,0.08)';
  _G.lineWidth = 0.8;
  for (var gi = 1; gi < 3; gi++) {
    _G.beginPath(); _G.moveTo(sx + ts * gi / 3, sy); _G.lineTo(sx + ts * gi / 3, sy + ts); _G.stroke();
    _G.beginPath(); _G.moveTo(sx, sy + ts * gi / 3); _G.lineTo(sx + ts, sy + ts * gi / 3); _G.stroke();
  }
  _G.restore();
  // Transformation: gold coin glints on the floor
  if (_transformed && r() < 0.2) {
    var fr7 = mkRng(tx * 67 + ty * 31 + 99);
    LV_cut(P.accent, 0, function() { _G.arc(sx + ts * (0.2 + fr7() * 0.6), sy + ts * (0.2 + fr7() * 0.6), ts * 0.04, 0, Math.PI * 2); });
  }
}
function LV_drawPath_market(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[7];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_market(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[7];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent, 0, function () { _G.arc(sx + ts * (0.3 + Math.sin(t * 2 + tx) * 0.15), sy + ts * 0.5, ts * 0.05, 0, Math.PI * 2); });
}

// ─── FLOOR 9: LIBRARY TILES (Infinity Library) ──────────────

function LV_drawWall_library(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[8], r = mkRng(tx * 31 + ty * 97 + 901);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.55); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
  if (r() < 0.18) { LV_cut(P.rune, 0, function () { _G.rect(sx + ts * 0.25, sy + ts * 0.1, ts * 0.5, ts * 0.08); }); }
  // Horizontal rune-like lines on library walls (2-3 strokes)
  _G.save();
  _G.strokeStyle = 'rgba(227,154,74,0.12)';
  _G.lineWidth = 0.8;
  var lr8 = mkRng(tx * 47 + ty * 61 + 905);
  var lineCount = 2 + Math.floor(lr8() * 2);
  for (var li = 0; li < lineCount; li++) {
    var ly = sy + ts * (0.25 + li * 0.22 + lr8() * 0.05);
    _G.beginPath(); _G.moveTo(sx + ts * 0.1, ly); _G.lineTo(sx + ts * 0.9, ly); _G.stroke();
  }
  _G.restore();
}
function LV_drawFloor_library(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[8], r = mkRng(tx * 19 + ty * 53 + 902);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Subtle text-like marks (tiny horizontal dashes) on library floor
  _G.save();
  _G.strokeStyle = 'rgba(227,154,74,0.08)';
  _G.lineWidth = 0.6;
  var tr8 = mkRng(tx * 41 + ty * 73 + 906);
  for (var ti = 0; ti < 4; ti++) {
    var tdx = sx + ts * (0.15 + tr8() * 0.7);
    var tdy = sy + ts * (0.15 + tr8() * 0.7);
    _G.beginPath(); _G.moveTo(tdx, tdy); _G.lineTo(tdx + ts * 0.06 + tr8() * ts * 0.04, tdy); _G.stroke();
  }
  _G.restore();
  // Transformation: glowing page-light dots
  if (_transformed && r() < 0.18) {
    var fr8 = mkRng(tx * 67 + ty * 31 + 99);
    LV_cut(P.accent || '#c09848', 0, function() { _G.arc(sx + ts * (0.2 + fr8() * 0.6), sy + ts * (0.2 + fr8() * 0.6), ts * 0.04, 0, Math.PI * 2); });
  }
}
function LV_drawPath_library(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[8];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_library(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[8];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent, 0, function () { _G.arc(sx + ts * (0.35 + Math.sin(t * 1.5 + ty) * 0.1), sy + ts * 0.5, ts * 0.05, 0, Math.PI * 2); });
}

// ─── FLOOR 10: MENDING ROOM (The Mending Room, arcane variant) ──

function LV_drawWall_mending(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[9], r = mkRng(tx * 31 + ty * 97 + 1001);
  LV_cut(P.wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.15 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.5); });
  LV_cut(P.wall2, 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
  if (r() < 0.2) { var rr = mkRng(tx * 23 + ty * 41); LV_cut(P.rune, 0, function () { _G.arc(sx + ts * (0.3 + rr() * 0.4), sy + ts * (0.15 + rr() * 0.25), ts * 0.07, 0, Math.PI * 2); }); _G.save(); _G.globalAlpha = 0.15; _G.fillStyle = P.accent || _hex(PAPER.rose); _G.beginPath(); _G.arc(sx + ts * 0.5, sy + ts * 0.3, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore(); }
  // Glowing rune circles on mending walls
  var mr9 = mkRng(tx * 53 + ty * 71 + 1005);
  if (mr9() < 0.25) {
    _G.save();
    _G.strokeStyle = P.rune || _hex(PAPER.lavender);
    _G.lineWidth = 1;
    _G.globalAlpha = 0.1;
    var mcx = sx + ts * (0.3 + mr9() * 0.4);
    var mcy = sy + ts * (0.2 + mr9() * 0.3);
    _G.beginPath(); _G.arc(mcx, mcy, ts * 0.1, 0, Math.PI * 2); _G.stroke();
    _G.restore();
  }
}
function LV_drawFloor_mending(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[9], r = mkRng(tx * 19 + ty * 53 + 1002);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Equation-like symbols (+, x, =) on mending floor tiles
  _G.save();
  _G.strokeStyle = 'rgba(156,143,192,0.12)';
  _G.lineWidth = 1;
  var er9 = mkRng(tx * 37 + ty * 61 + 1003);
  var sym = Math.floor(er9() * 3);
  var ecx = sx + ts * (0.3 + er9() * 0.4);
  var ecy = sy + ts * (0.3 + er9() * 0.4);
  var esz = ts * 0.06;
  _G.beginPath();
  if (sym === 0) { // +
    _G.moveTo(ecx - esz, ecy); _G.lineTo(ecx + esz, ecy);
    _G.moveTo(ecx, ecy - esz); _G.lineTo(ecx, ecy + esz);
  } else if (sym === 1) { // x
    _G.moveTo(ecx - esz, ecy - esz); _G.lineTo(ecx + esz, ecy + esz);
    _G.moveTo(ecx + esz, ecy - esz); _G.lineTo(ecx - esz, ecy + esz);
  } else { // =
    _G.moveTo(ecx - esz, ecy - esz * 0.4); _G.lineTo(ecx + esz, ecy - esz * 0.4);
    _G.moveTo(ecx - esz, ecy + esz * 0.4); _G.lineTo(ecx + esz, ecy + esz * 0.4);
  }
  _G.stroke();
  _G.restore();
  // Transformation: glowing rune wisps
  if (_transformed && r() < 0.2) {
    var fr9 = mkRng(tx * 67 + ty * 31 + 99);
    LV_cut(P.rune || _hex(PAPER.lavender), 0, function() { _G.arc(sx + ts * (0.2 + fr9() * 0.6), sy + ts * (0.2 + fr9() * 0.6), ts * 0.05 + fr9() * ts * 0.02, 0, Math.PI * 2); });
  }
}
function LV_drawPath_mending(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[9];
  LV_cut(P.path0, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.pathS : P.pathL, 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
}
function LV_drawWater_mending(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[9];
  LV_cut(P.water0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(P.water1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  LV_cut(P.accent || _hex(PAPER.rose), 0, function () { _G.arc(sx + ts * (0.4 + Math.sin(t * 2 + ty * 0.5) * 0.1), sy + ts * 0.45, ts * 0.08 + Math.sin(t * 3) * ts * 0.02, 0, Math.PI * 2); });
}

// ─── THEME DISPATCH ─────────────────────────────────────────────

var _tileFns = {
  1: { wall: LV_drawWall, floor: LV_drawFloor, path: LV_drawPath, water: LV_drawWater },
  2: { wall: LV_drawWall_tidepool, floor: LV_drawFloor_tidepool, path: LV_drawPath_tidepool, water: LV_drawWater_tidepool },
  3: { wall: LV_drawWall_cloud, floor: LV_drawFloor_cloud, path: LV_drawPath_cloud, water: LV_drawWater_cloud },
  4: { wall: LV_drawWall_ember, floor: LV_drawFloor_ember, path: LV_drawPath_ember, water: LV_drawWater_ember },
  5: { wall: LV_drawWall_ice, floor: LV_drawFloor_ice, path: LV_drawPath_ice, water: LV_drawWater_ice },
  6: { wall: LV_drawWall_crystal, floor: LV_drawFloor_crystal, path: LV_drawPath_crystal, water: LV_drawWater_crystal },
  7: { wall: LV_drawWall_market, floor: LV_drawFloor_market, path: LV_drawPath_market, water: LV_drawWater_market },
  8: { wall: LV_drawWall_library, floor: LV_drawFloor_library, path: LV_drawPath_library, water: LV_drawWater_library },
  9: { wall: LV_drawWall_mending, floor: LV_drawFloor_mending, path: LV_drawPath_mending, water: LV_drawWater_mending },
};

function _drawTile(tt, sx, sy, ts, tx, ty, t) {
  var fns = _tileFns[_floorTheme] || _tileFns[1];
  if (tt === LV_TW) fns.wall(sx, sy, ts, tx, ty);
  else if (tt === LV_TP) fns.path(sx, sy, ts, tx, ty);
  else if (tt === LV_TQ) fns.water(sx, sy, ts, tx, ty, t);
  else if (tt === LV_TS) {
    // Secret passage — render as wall but with subtle visual hints
    fns.wall(sx, sy, ts, tx, ty);
    // Slightly lighter overlay (5-10% lighter than normal wall)
    _G.save();
    _G.globalAlpha = 0.08;
    _G.fillStyle = _hex(PAPER.white);
    _G.fillRect(sx, sy, ts + 1, ts + 1);
    _G.restore();
    // Subtle crack line (1px, slightly darker) — hints at breakable wall
    var sr = mkRng(tx * 61 + ty * 89);
    _G.save();
    _G.globalAlpha = 0.25 + Math.sin(t * 1.5 + tx * 3) * 0.08;
    _G.strokeStyle = _hex(PAPER.inkTeal);
    _G.lineWidth = 1;
    _G.beginPath();
    var cx = sx + ts * (0.3 + sr() * 0.4);
    _G.moveTo(cx, sy + ts * 0.15);
    _G.lineTo(cx + ts * 0.06, sy + ts * 0.45);
    _G.lineTo(cx - ts * 0.04, sy + ts * 0.75);
    _G.lineTo(cx + ts * 0.02, sy + ts * 0.9);
    _G.stroke();
    _G.restore();
  }
  else fns.floor(sx, sy, ts, tx, ty);
}

// ─── OBJECT DRAWING (1:1 from reference) ────────────────────────

function LV_drawChest(sx, sy, ts, o) {
  var x = sx + ts * 0.5, y = sy + ts * 0.62;
  // Open transition: for ~400ms after o.openedAt the lid lifts/tilts open
  // and gold sparkles rise, then it settles to a static open pose (prog=1).
  var prog = o.open ? (o.openedAt ? Math.min(1, (Date.now() - o.openedAt) / 400) : 1) : 0;
  LV_cut('rgba(31,61,63,0.18)', 0, function () { LV_ellipse(x, y + ts * 0.16, ts * 0.24, ts * 0.065, 0); });
  var bc = o.open ? _hex(PAPER.forestD) : _hex(PAPER.forest);
  LV_cut(bc, 5, function () { _G.moveTo(x - ts * 0.26, y + ts * 0.14); _G.lineTo(x + ts * 0.26, y + ts * 0.14); _G.lineTo(x + ts * 0.28, y - ts * 0.02); _G.lineTo(x + ts * 0.24, y - ts * 0.1); _G.lineTo(x - ts * 0.24, y - ts * 0.1); _G.lineTo(x - ts * 0.28, y - ts * 0.02); });
  // Lid — rotated/offset upward as the chest opens
  _G.save();
  if (prog > 0) {
    var hy = y - ts * 0.14; // hinge pivot near the lid base
    _G.translate(x, hy - prog * ts * 0.16);
    _G.rotate(-prog * 0.4);
    _G.translate(-x, -hy);
  }
  LV_cut(bc, 5, function () { _G.moveTo(x - ts * 0.26, y - ts * 0.08); _G.lineTo(x + ts * 0.26, y - ts * 0.08); _G.lineTo(x + ts * 0.22, y - ts * 0.2); _G.bezierCurveTo(x + ts * 0.18, y - ts * 0.26, x - ts * 0.18, y - ts * 0.26, x - ts * 0.22, y - ts * 0.2); });
  _G.restore();
  LV_cut(LV_PAL.gold, 2, function () { _G.rect(x - ts * 0.27, y - ts * 0.02, ts * 0.54, ts * 0.038); });
  LV_cut(LV_PAL.gold, 2, function () { _G.rect(x - ts * 0.055, y - ts * 0.055, ts * 0.11, ts * 0.09); });
  // Gold sparkle dots rising while the lid swings open
  if (prog > 0 && prog < 1) {
    _G.save();
    _G.globalAlpha = (1 - prog) * 0.9;
    _G.fillStyle = LV_PAL.goldL;
    for (var gp = 0; gp < 4; gp++) {
      var gx = x + (gp - 1.5) * ts * 0.1;
      var gy = y - ts * 0.18 - prog * ts * (0.25 + gp * 0.1);
      _G.beginPath(); _G.arc(gx, gy, ts * 0.028, 0, Math.PI * 2); _G.fill();
    }
    _G.restore();
  }
}

function LV_drawFairyCage(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var bob = Math.sin(t * 2.5) * ts * 0.02;
  // Base plate
  LV_cut(_hex(PAPER.sageD), 3, function () { _G.rect(x - ts * 0.22, y + ts * 0.2, ts * 0.44, ts * 0.06); });
  // Cage bars (4 vertical lines + dome)
  _G.save(); _G.strokeStyle = o.open ? _hex(PAPER.sageD) : _hex(PAPER.sand); _G.lineWidth = 1.5; _G.globalAlpha = 0.9;
  for (var b = -1.5; b <= 1.5; b++) {
    var bx = x + b * ts * 0.1;
    _G.beginPath(); _G.moveTo(bx, y + ts * 0.2); _G.lineTo(bx, y - ts * 0.12 + bob); _G.stroke();
  }
  // Dome arc
  _G.beginPath(); _G.arc(x, y - ts * 0.12 + bob, ts * 0.18, Math.PI, 0); _G.stroke();
  // Ring at top
  LV_cut(_hex(PAPER.sand), 1, function () { _G.arc(x, y - ts * 0.3 + bob, ts * 0.04, 0, Math.PI * 2); });
  _G.restore();
  if (!o.open) {
    // Fairy inside — glowing circle bobbing
    var fy = y + Math.sin(t * 3.5) * ts * 0.06;
    _G.save(); _G.globalAlpha = 0.7 + Math.sin(t * 4) * 0.2;
    _G.fillStyle = _hex(PAPER.sky); _G.beginPath(); _G.arc(x, fy, ts * 0.08, 0, Math.PI * 2); _G.fill();
    _G.fillStyle = _hex(PAPER.white); _G.beginPath(); _G.arc(x - ts * 0.02, fy - ts * 0.02, ts * 0.04, 0, Math.PI * 2); _G.fill();
    // Sparkles
    for (var s = 0; s < 3; s++) {
      var sa = (s / 3) * Math.PI * 2 + t * 2;
      var sdx = Math.cos(sa) * ts * 0.14, sdy = Math.sin(sa) * ts * 0.1;
      _G.fillStyle = _hex(PAPER.gold); _G.globalAlpha = 0.5 + Math.sin(t * 5 + s) * 0.3;
      _G.beginPath(); _G.arc(x + sdx, fy + sdy, ts * 0.025, 0, Math.PI * 2); _G.fill();
    }
    _G.restore();
  } else {
    // Door open — bent bar
    _G.save(); _G.strokeStyle = _hex(PAPER.sageD); _G.lineWidth = 1.2; _G.globalAlpha = 0.6;
    _G.beginPath(); _G.moveTo(x + ts * 0.15, y + ts * 0.2); _G.lineTo(x + ts * 0.25, y); _G.stroke();
    _G.restore();
  }
}

function LV_drawValve(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var radius = ts * 0.28;
  var rot = o.open ? 0.4 : t * 0.8;
  var col = o.open ? _hex(PAPER.sageD) : _hex(PAPER.sage);
  var colD = o.open ? _hex(PAPER.forestD) : _hex(PAPER.forestL);
  // Circle outline (wheel rim)
  _G.save();
  _G.strokeStyle = col; _G.lineWidth = ts * 0.05;
  _G.beginPath(); _G.arc(x, y, radius, 0, Math.PI * 2); _G.stroke();
  // 4 spokes
  _G.strokeStyle = colD; _G.lineWidth = ts * 0.035;
  for (var s = 0; s < 4; s++) {
    var a = rot + (s / 4) * Math.PI * 2;
    _G.beginPath();
    _G.moveTo(x + Math.cos(a) * radius * 0.15, y + Math.sin(a) * radius * 0.15);
    _G.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    _G.stroke();
  }
  // Center hub
  LV_cut(col, 2, function () { _G.arc(x, y, ts * 0.07, 0, Math.PI * 2); });
  // Water drips below (when not open)
  if (!o.open) {
    var dripY = y + radius + ts * 0.08 + Math.sin(t * 4) * ts * 0.06;
    _G.fillStyle = 'rgba(68,136,138,0.5)';
    _G.beginPath(); _G.arc(x, dripY, ts * 0.04, 0, Math.PI * 2); _G.fill();
    _G.beginPath(); _G.arc(x - ts * 0.12, dripY + ts * 0.04, ts * 0.025, 0, Math.PI * 2); _G.fill();
  }
  _G.restore();
}

function LV_drawBeacon(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.8;
  // Stone pillar
  var pw = ts * 0.18, ph = ts * 0.55;
  LV_cut(_hex(PAPER.sageD), 4, function () { _G.rect(x - pw, y - ph, pw * 2, ph); });
  LV_cut(_hex(PAPER.sage), 2, function () { _G.rect(x - pw + 2, y - ph + 2, pw * 2 - 4, ph - 4); });
  // Bowl/brazier at top
  LV_cut(_hex(PAPER.forestL), 3, function () {
    _G.moveTo(x - ts * 0.16, y - ph + ts * 0.02);
    _G.lineTo(x + ts * 0.16, y - ph + ts * 0.02);
    _G.lineTo(x + ts * 0.12, y - ph - ts * 0.06);
    _G.lineTo(x - ts * 0.12, y - ph - ts * 0.06);
  });
  if (o.open) {
    // Flame
    var fy = y - ph - ts * 0.1;
    var flicker = Math.sin(t * 5) * ts * 0.03;
    _G.save();
    _G.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
    _G.fillStyle = _hex(PAPER.orange);
    _G.beginPath(); _G.arc(x + flicker, fy - ts * 0.06, ts * 0.09, 0, Math.PI * 2); _G.fill();
    _G.fillStyle = _hex(PAPER.gold);
    _G.beginPath(); _G.arc(x - flicker * 0.5, fy - ts * 0.1, ts * 0.06, 0, Math.PI * 2); _G.fill();
    // Glow
    _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
    _G.fillStyle = _hex(PAPER.gold);
    _G.beginPath(); _G.arc(x, fy - ts * 0.06, ts * 0.22, 0, Math.PI * 2); _G.fill();
    _G.restore();
  }
}

function LV_drawVent(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.7;
  // Rocky base (irregular)
  LV_cut(_hex(PAPER.forestD), 4, function () {
    _G.moveTo(x - ts * 0.3, y + ts * 0.1);
    _G.lineTo(x - ts * 0.22, y - ts * 0.14);
    _G.lineTo(x - ts * 0.08, y - ts * 0.18);
    _G.lineTo(x + ts * 0.08, y - ts * 0.2);
    _G.lineTo(x + ts * 0.24, y - ts * 0.12);
    _G.lineTo(x + ts * 0.32, y + ts * 0.1);
  });
  LV_cut(o.open ? _hex(PAPER.inkTeal) : _hex(PAPER.forestL), 2, function () {
    _G.moveTo(x - ts * 0.18, y + ts * 0.06);
    _G.lineTo(x - ts * 0.12, y - ts * 0.08);
    _G.lineTo(x + ts * 0.1, y - ts * 0.1);
    _G.lineTo(x + ts * 0.2, y + ts * 0.06);
  });
  if (!o.open) {
    // Rising steam particles
    _G.save();
    for (var s = 0; s < 5; s++) {
      var phase = t * 2 + s * 1.3;
      var rise = (phase % 3) / 3;
      var px = x + Math.sin(phase * 1.7) * ts * 0.1;
      var py = y - ts * 0.15 - rise * ts * 0.4;
      _G.globalAlpha = (1 - rise) * 0.4;
      _G.fillStyle = _hex(PAPER.sage);
      _G.beginPath(); _G.arc(px, py, ts * (0.04 + rise * 0.03), 0, Math.PI * 2); _G.fill();
    }
    _G.restore();
  }
}

function LV_drawFragment(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) {
    // Empty pedestal
    LV_cut(_hex(PAPER.tealD), 3, function () { _G.rect(x - ts * 0.14, y + ts * 0.12, ts * 0.28, ts * 0.1); });
    return;
  }
  var bob = Math.sin(t * 2.2) * ts * 0.04;
  var fy = y + bob;
  // Glow
  _G.save();
  _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
  _G.fillStyle = _hex(PAPER.lavenderD);
  _G.beginPath(); _G.arc(x, fy, ts * 0.24, 0, Math.PI * 2); _G.fill();
  _G.restore();
  // Diamond shape
  var sz = ts * 0.16;
  LV_cut(_hex(PAPER.lavender), 3, function () {
    _G.moveTo(x, fy - sz);
    _G.lineTo(x + sz, fy);
    _G.lineTo(x, fy + sz);
    _G.lineTo(x - sz, fy);
  });
  LV_cut(_hex(PAPER.rose), 1, function () {
    _G.moveTo(x, fy - sz * 0.6);
    _G.lineTo(x + sz * 0.6, fy);
    _G.lineTo(x, fy + sz * 0.6);
    _G.lineTo(x - sz * 0.6, fy);
  });
  // Sparkles
  _G.save();
  for (var s = 0; s < 3; s++) {
    var sa = (s / 3) * Math.PI * 2 + t * 1.8;
    var sdx = Math.cos(sa) * ts * 0.2, sdy = Math.sin(sa) * ts * 0.15;
    _G.fillStyle = _hex(PAPER.rose); _G.globalAlpha = 0.4 + Math.sin(t * 4 + s) * 0.3;
    _G.beginPath(); _G.arc(x + sdx, fy + sdy, ts * 0.025, 0, Math.PI * 2); _G.fill();
  }
  _G.restore();
  // Pedestal
  LV_cut(_hex(PAPER.tealD), 2, function () { _G.rect(x - ts * 0.14, y + ts * 0.12, ts * 0.28, ts * 0.1); });
}

function LV_drawCrystal(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut(_hex(PAPER.tealD), 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 2.0) * ts * 0.04;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.25 + Math.sin(t * 2.5) * 0.1; _G.fillStyle = _hex(PAPER.sky); _G.beginPath(); _G.arc(x, fy, ts * 0.22, 0, Math.PI * 2); _G.fill(); _G.restore();
  var sz = ts * 0.16;
  LV_cut(_hex(PAPER.tealL), 3, function () { _G.moveTo(x, fy - sz); _G.lineTo(x + sz * 0.7, fy); _G.lineTo(x, fy + sz); _G.lineTo(x - sz * 0.7, fy); });
  LV_cut(_hex(PAPER.sky), 1, function () { _G.moveTo(x, fy - sz * 0.5); _G.lineTo(x + sz * 0.4, fy); _G.lineTo(x, fy + sz * 0.5); _G.lineTo(x - sz * 0.4, fy); });
}

function LV_drawGeoshard(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut(_hex(PAPER.lavenderD), 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 1.8) * ts * 0.03;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1; _G.fillStyle = _hex(PAPER.lavender); _G.beginPath(); _G.arc(x, fy, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore();
  var sz = ts * 0.18;
  LV_cut(_hex(PAPER.lavenderD), 3, function () { _G.moveTo(x, fy - sz); _G.lineTo(x + sz * 0.87, fy + sz * 0.5); _G.lineTo(x - sz * 0.87, fy + sz * 0.5); });
  LV_cut(_hex(PAPER.lavender), 1, function () { _G.moveTo(x, fy - sz * 0.5); _G.lineTo(x + sz * 0.43, fy + sz * 0.25); _G.lineTo(x - sz * 0.43, fy + sz * 0.25); });
}

function LV_drawToken(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut('#806020', 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 2.4) * ts * 0.03;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.2 + Math.sin(t * 2.8) * 0.1; _G.fillStyle = '#e8c040'; _G.beginPath(); _G.arc(x, fy, ts * 0.22, 0, Math.PI * 2); _G.fill(); _G.restore();
  LV_cut('#c8a030', 3, function () { _G.arc(x, fy, ts * 0.14, 0, Math.PI * 2); });
  LV_cut('#f0d050', 1, function () { _G.arc(x, fy, ts * 0.09, 0, Math.PI * 2); });
  LV_cut('#c8a030', 0, function () { _G.rect(x - ts * 0.02, fy - ts * 0.06, ts * 0.04, ts * 0.12); });
}

function LV_drawPage(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut('#604020', 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 1.6) * ts * 0.04;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.15 + Math.sin(t * 2) * 0.08; _G.fillStyle = '#c8a060'; _G.beginPath(); _G.arc(x, fy, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore();
  LV_cut('#d8c090', 3, function () { _G.rect(x - ts * 0.12, fy - ts * 0.16, ts * 0.24, ts * 0.32); });
  LV_cut('#f0e8d0', 1, function () { _G.rect(x - ts * 0.08, fy - ts * 0.12, ts * 0.16, ts * 0.24); });
  for (var l = 0; l < 3; l++) { LV_cut('#806040', 0, function () { _G.rect(x - ts * 0.06, fy - ts * 0.08 + l * ts * 0.08, ts * 0.12, ts * 0.015); }); }
}

function LV_drawPhase2Item(sx, sy, ts, o, t, mainCol, glowCol, shape) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var bob = Math.sin(t * 2.5) * ts * 0.04;
  var pulse = 0.3 + Math.sin(t * 3) * 0.15;
  _G.save(); _G.globalAlpha = pulse; _G.fillStyle = glowCol;
  _G.beginPath(); _G.arc(x, y + bob, ts * 0.22, 0, Math.PI * 2); _G.fill(); _G.restore();
  _G.save(); _G.translate(x, y + bob);
  if (shape === 'diamond') {
    var s = ts * 0.14;
    LV_cut(mainCol, 3, function () { _G.moveTo(0, -s); _G.lineTo(s, 0); _G.lineTo(0, s); _G.lineTo(-s, 0); });
  } else if (shape === 'circle') {
    LV_cut(mainCol, 3, function () { _G.arc(0, 0, ts * 0.12, 0, Math.PI * 2); });
  } else if (shape === 'key') {
    LV_cut(mainCol, 3, function () { _G.arc(0, -ts * 0.06, ts * 0.08, 0, Math.PI * 2); });
    LV_cut(mainCol, 2, function () { _G.rect(-ts * 0.025, -ts * 0.02, ts * 0.05, ts * 0.16); });
  } else {
    LV_cut(mainCol, 3, function () { _G.moveTo(0, -ts * 0.14); _G.lineTo(ts * 0.12, ts * 0.08); _G.lineTo(-ts * 0.12, ts * 0.08); });
  }
  _G.restore();
  var sparkX = x + Math.sin(t * 5) * ts * 0.15, sparkY = y + bob - ts * 0.1 + Math.cos(t * 4) * ts * 0.08;
  _G.save(); _G.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3; _G.fillStyle = '#ffffff';
  _G.beginPath(); _G.arc(sparkX, sparkY, ts * 0.025, 0, Math.PI * 2); _G.fill(); _G.restore();
}

function LV_drawRune(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#60c080', '#40a060', 'diamond'); }
function LV_drawCoralKey(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#f08070', '#e06050', 'key'); }
function LV_drawWindChime(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#c0d8f0', '#80b0e0', 'triangle'); }
function LV_drawLavaBridge(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#d07030', '#c05020', 'diamond'); }
function LV_drawThawCrystal(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#f0a040', '#e08020', 'diamond'); }
function LV_drawPrismShard(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#d080f0', '#b060e0', 'triangle'); }
function LV_drawVaultSeal(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#b0a080', '#908060', 'circle'); }
function LV_drawChapterSeal(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#c0a070', '#a08050', 'diamond'); }
function LV_drawEqAnchor(sx, sy, ts, o, t) { LV_drawPhase2Item(sx, sy, ts, o, t, '#f0c040', '#d0a020', 'circle'); }

function LV_drawDoor(sx, sy, ts, o, t) {
  if (o.open) return;
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  LV_cut('#5a4030', 6, function() { _G.rect(sx + ts * 0.08, sy + ts * 0.05, ts * 0.84, ts * 0.9); });
  var barColor = '#8a6840';
  for (var b = 0; b < 4; b++) {
    var bx = sx + ts * (0.2 + b * 0.2);
    LV_cut(barColor, 3, (function(bx2) { return function() { _G.rect(bx2, sy + ts * 0.1, ts * 0.04, ts * 0.75); }; })(bx));
  }
  var lockAlpha = 0.6 + Math.sin(t * 2) * 0.2;
  _G.globalAlpha = lockAlpha;
  _G.fillStyle = '#f0c040';
  _G.beginPath(); _G.arc(x, y - ts * 0.05, ts * 0.1, 0, Math.PI * 2); _G.fill();
  _G.fillRect(x - ts * 0.08, y, ts * 0.16, ts * 0.14);
  _G.globalAlpha = 1;
}

function LV_drawFountain(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.45;
  var depleted = o.uses <= 0;
  var baseColor = depleted ? '#504840' : '#3090c0';
  var glowColor = depleted ? '#383430' : '#60c0e8';
  LV_cut('#706058', 4, function() { _G.rect(sx + ts * 0.2, sy + ts * 0.7, ts * 0.6, ts * 0.15); });
  LV_cut(baseColor, 3, function() { _G.beginPath(); LV_ellipse(x, y + ts * 0.15, ts * 0.3, ts * 0.12, 0); });
  if (!depleted) {
    var colAlpha = 0.4 + Math.sin(t * 3) * 0.15;
    _G.globalAlpha = colAlpha;
    _G.fillStyle = glowColor;
    _G.beginPath(); _G.arc(x, y - ts * 0.05, ts * 0.08 + Math.sin(t * 2.5) * ts * 0.02, 0, Math.PI * 2); _G.fill();
    var sparkY = y - ts * 0.1 - (t * 0.5 % 0.3) * ts;
    _G.fillStyle = '#ffffff';
    _G.beginPath(); _G.arc(x + Math.sin(t * 4) * ts * 0.06, sparkY, ts * 0.025, 0, Math.PI * 2); _G.fill();
    _G.globalAlpha = 1;
  }
}

function LV_drawGoldChest(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.55;
  var locked = !_gs.hasKey && (_gs.fairies < 3 || !o.bossBeaten);
  var opened = _gs.hasKey;
  var bob = (locked || opened) ? 0 : Math.sin(t * 2.2) * ts * 0.03;
  // Shadow
  LV_cut('rgba(14,6,2,0.3)', 0, function () { LV_ellipse(x, y + ts * 0.22, ts * 0.3, ts * 0.07, 0); });
  // Body — bright gold when unlocked
  var bodyCol = locked ? '#3a1a08' : '#e8a830';
  LV_cut(bodyCol, 7, function () { _G.moveTo(x - ts * 0.36, y + ts * 0.2); _G.lineTo(x + ts * 0.36, y + ts * 0.2); _G.lineTo(x + ts * 0.38, y - ts * 0.02); _G.lineTo(x + ts * 0.34, y - ts * 0.12); _G.lineTo(x - ts * 0.34, y - ts * 0.12); _G.lineTo(x - ts * 0.38, y - ts * 0.02); });
  // Lid
  if (opened) {
    // Lid tilted open behind
    LV_cut('#c08018', 5, function () { _G.moveTo(x - ts * 0.3, y - ts * 0.12); _G.lineTo(x + ts * 0.3, y - ts * 0.12); _G.lineTo(x + ts * 0.26, y - ts * 0.34); _G.bezierCurveTo(x + ts * 0.2, y - ts * 0.42, x - ts * 0.2, y - ts * 0.42, x - ts * 0.26, y - ts * 0.34); });
    // Sparkles rising from open chest
    for (var sp = 0; sp < 4; sp++) {
      var spY = y - ts * 0.15 - Math.abs(Math.sin(t * 3 + sp * 1.5)) * ts * 0.3;
      var spX = x + (sp - 1.5) * ts * 0.12;
      _G.save(); _G.globalAlpha = 0.5 + Math.sin(t * 4 + sp) * 0.3; _G.fillStyle = '#ffe060'; _G.beginPath(); _G.arc(spX, spY, ts * 0.03, 0, Math.PI * 2); _G.fill(); _G.restore();
    }
  } else {
    // Lid closed
    var lidCol = locked ? '#2a1206' : '#c08018';
    LV_cut(lidCol, 6, function () { _G.moveTo(x - ts * 0.36, y - ts * 0.1 + bob); _G.lineTo(x + ts * 0.36, y - ts * 0.1 + bob); _G.lineTo(x + ts * 0.34, y - ts * 0.3 + bob); _G.bezierCurveTo(x + ts * 0.3, y - ts * 0.4 + bob, x - ts * 0.3, y - ts * 0.4 + bob, x - ts * 0.34, y - ts * 0.3 + bob); });
  }
  // Gold band
  LV_cut(locked ? '#5a3010' : '#f0c040', 3, function () { _G.rect(x - ts * 0.37, y - ts * 0.02, ts * 0.74, ts * 0.05); });
  // Lock/clasp
  LV_cut(locked ? '#6a3810' : '#f8d848', 4, function () { _G.rect(x - ts * 0.08, y - ts * 0.07, ts * 0.16, ts * 0.13); });
  // Corner gems (only when unlocked)
  if (!locked) {
    LV_cut('#e04040', 1, function () { _G.arc(x - ts * 0.28, y + ts * 0.12, ts * 0.035, 0, Math.PI * 2); });
    LV_cut('#4080e0', 1, function () { _G.arc(x + ts * 0.28, y + ts * 0.12, ts * 0.035, 0, Math.PI * 2); });
    LV_cut('#40c040', 1, function () { _G.arc(x - ts * 0.28, y - ts * 0.04, ts * 0.03, 0, Math.PI * 2); });
  }
  // Glow aura when unlocked but not opened
  if (!locked && !opened) { _G.save(); _G.globalAlpha = 0.4 + Math.sin(t * 3.5) * 0.2; _G.fillStyle = '#ffe060'; _G.beginPath(); _G.arc(x, y - ts * 0.1 + bob, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore(); }
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

function LV_drawEncounterIndicator(sx, sy, ts, o, t) {
  // "Lurking monster" — a small dark shadow blob with two glowing eyes
  // that blink every ~2s. Mysterious, not scary (audience: K-5 kids).
  var x = sx + ts * 0.5, y = sy + ts * 0.58;
  var phase = o.tx * 0.7 + o.ty * 1.3;
  // Slow pulse — the blob gently swells and settles
  var pulse = 1 + Math.sin(t * 1.5 + phase) * 0.08;
  var P = FLOOR_PALS[_floorTheme];
  var eyeCol = (P && (P.accentL || P.accent)) || LV_PAL.goldL;

  _G.save();
  // Shadow blob (~20px wide ellipse, dark at half alpha)
  _G.globalAlpha = 0.5;
  _G.fillStyle = '#0c0a14';
  _G.beginPath();
  LV_ellipse(x, y + ts * 0.06, ts * 0.18 * pulse, ts * 0.08 * pulse, 0);
  _G.fill();
  // Soft rounded body rising out of the shadow
  _G.globalAlpha = 0.35;
  _G.beginPath();
  LV_ellipse(x, y - ts * 0.04, ts * 0.13 * pulse, ts * 0.12 * pulse, 0);
  _G.fill();
  // Two small glowing eyes — close briefly every ~2 seconds (a blink)
  var eyesOpen = ((t + phase) % 2) > 0.18;
  if (eyesOpen) {
    _G.globalAlpha = 0.8 + Math.sin(t * 3 + phase) * 0.2;
    _G.fillStyle = eyeCol;
    _G.beginPath();
    _G.arc(x - ts * 0.05, y - ts * 0.06, ts * 0.022, 0, Math.PI * 2);
    _G.fill();
    _G.beginPath();
    _G.arc(x + ts * 0.05, y - ts * 0.06, ts * 0.022, 0, Math.PI * 2);
    _G.fill();
  }
  _G.restore();
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
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var dw = ts * 0.6, dh = ts * 0.85;
  var dx = x - dw / 2, dy = y - dh / 2 - ts * 0.05;
  var hasKey = _gs && _gs.hasKey;

  if (hasKey) {
    // GLOWING / LIT UP exit — golden key obtained
    // Golden glow behind door
    _G.save(); _G.globalAlpha = 0.3 + Math.sin(t * 2) * 0.15;
    var gr = _G.createRadialGradient(x, y, 0, x, y, ts * 0.6);
    gr.addColorStop(0, 'rgba(255,240,100,0.8)'); gr.addColorStop(1, 'rgba(255,200,40,0)');
    _G.fillStyle = gr; _G.beginPath(); _G.arc(x, y, ts * 0.6, 0, Math.PI * 2); _G.fill(); _G.restore();
    // Door frame — gold rectangle with arched top
    LV_cut('#c08018', 6, function () {
      _G.moveTo(dx, dy + dh); _G.lineTo(dx, dy + dh * 0.3);
      _G.bezierCurveTo(dx, dy - dh * 0.05, dx + dw, dy - dh * 0.05, dx + dw, dy + dh * 0.3);
      _G.lineTo(dx + dw, dy + dh); _G.lineTo(dx + dw - ts * 0.08, dy + dh);
      _G.lineTo(dx + dw - ts * 0.08, dy + dh * 0.35);
      _G.bezierCurveTo(dx + dw - ts * 0.08, dy + dh * 0.05, dx + ts * 0.08, dy + dh * 0.05, dx + ts * 0.08, dy + dh * 0.35);
      _G.lineTo(dx + ts * 0.08, dy + dh); _G.lineTo(dx, dy + dh);
    });
    // Light from doorway
    var pulse = 0.6 + Math.sin(t * 2.5) * 0.15;
    _G.save(); _G.globalAlpha = pulse;
    var lg = _G.createLinearGradient(x, dy + dh * 0.1, x, dy + dh);
    lg.addColorStop(0, 'rgba(255,255,240,0.9)'); lg.addColorStop(0.5, 'rgba(255,220,80,0.6)'); lg.addColorStop(1, 'rgba(255,200,40,0.2)');
    _G.fillStyle = lg;
    _G.beginPath();
    _G.moveTo(dx + ts * 0.12, dy + dh);
    _G.lineTo(dx + ts * 0.12, dy + dh * 0.38);
    _G.bezierCurveTo(dx + ts * 0.12, dy + dh * 0.1, dx + dw - ts * 0.12, dy + dh * 0.1, dx + dw - ts * 0.12, dy + dh * 0.38);
    _G.lineTo(dx + dw - ts * 0.12, dy + dh);
    _G.fill(); _G.restore();
    // Keyhole or handle
    LV_cut('#8a6010', 2, function () { _G.arc(x, y + dh * 0.15, ts * 0.04, 0, Math.PI * 2); });
    // Sparkle particles orbiting
    for (var p = 0; p < 4; p++) {
      var pa = (p / 4) * Math.PI * 2 + t * 1.5;
      var ppx = x + Math.cos(pa) * ts * 0.45, ppy = y + Math.sin(pa) * dh * 0.45;
      _G.save(); _G.globalAlpha = 0.4 + Math.sin(t * 3 + p) * 0.3; _G.fillStyle = '#ffe060'; _G.beginPath(); _G.arc(ppx, ppy, ts * 0.025, 0, Math.PI * 2); _G.fill(); _G.restore();
    }
  } else {
    // DIM / DARK exit — key not yet obtained
    // Dark door frame (no glow)
    LV_cut('#3a2810', 6, function () {
      _G.moveTo(dx, dy + dh); _G.lineTo(dx, dy + dh * 0.3);
      _G.bezierCurveTo(dx, dy - dh * 0.05, dx + dw, dy - dh * 0.05, dx + dw, dy + dh * 0.3);
      _G.lineTo(dx + dw, dy + dh); _G.lineTo(dx + dw - ts * 0.08, dy + dh);
      _G.lineTo(dx + dw - ts * 0.08, dy + dh * 0.35);
      _G.bezierCurveTo(dx + dw - ts * 0.08, dy + dh * 0.05, dx + ts * 0.08, dy + dh * 0.05, dx + ts * 0.08, dy + dh * 0.35);
      _G.lineTo(dx + ts * 0.08, dy + dh); _G.lineTo(dx, dy + dh);
    });
    // Dark interior — no light
    _G.save(); _G.globalAlpha = 0.4;
    _G.fillStyle = '#1f4244';
    _G.beginPath();
    _G.moveTo(dx + ts * 0.12, dy + dh);
    _G.lineTo(dx + ts * 0.12, dy + dh * 0.38);
    _G.bezierCurveTo(dx + ts * 0.12, dy + dh * 0.1, dx + dw - ts * 0.12, dy + dh * 0.1, dx + dw - ts * 0.12, dy + dh * 0.38);
    _G.lineTo(dx + dw - ts * 0.12, dy + dh);
    _G.fill(); _G.restore();
    // Dim keyhole
    LV_cut('#4a3010', 2, function () { _G.arc(x, y + dh * 0.15, ts * 0.04, 0, Math.PI * 2); });
  }
}

// ─── PARTY DRAWING (1:1 from reference) ─────────────────────────

function LV_drawPartyMember(px, py, ts, idx, moving, t) {
  // Walk cycle: bouncy bob + alternating squash/stretch while moving;
  // gentle breathing bob while standing still.
  var walkPhase = Math.sin(t * 12 + idx * 1.2);
  var bob = moving ? walkPhase * 3 : Math.sin(t * 2 + idx * 1.2) * 1.5;
  var tilt = moving ? walkPhase * 0.035 : 0;
  var sqX = moving ? 1 + walkPhase * 0.02 : 1;
  var sqY = moving ? 1 - walkPhase * 0.02 : 1;
  // Facing flip: mirror the hero horizontally when walking left
  var flip = (_party && _party.facing === 'left') ? -1 : 1;
  if (_heroCanvases && _heroCanvases[idx]) {
    var hcv = _heroCanvases[idx]; var hsc = ts * 1.1 / hcv.width; var hw = hcv.width * hsc, hh = hcv.height * hsc;
    _G.save();
    _G.translate(px, py - hh * 0.82 + bob + hh / 2);
    _G.rotate(tilt * flip);
    _G.scale(sqX * flip, sqY);
    _G.drawImage(hcv, -hw / 2, -hh / 2, hw, hh);
    _G.restore();
    return;
  }
  // Fallback generic sprite
  var col = '#2e4e88';
  _G.save(); _G.translate(px, py + bob);
  _G.scale(sqX * flip, sqY);
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
  mg.fillStyle = _fogColorMinimapBg; mg.fillRect(0, 0, mc.width, mc.height);
  for (var my = 0; my < _ROWS; my++) for (var mx = 0; mx < _COLS; mx++) {
    if (!_fog[my][mx]) { mg.fillStyle = _fogColorMinimap; mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5); continue; }
    var t2 = _map[my][mx];
    mg.fillStyle = t2 === LV_TW ? '#2a5c1e' : t2 === LV_TP ? '#a89870' : t2 === LV_TQ ? '#2a5060' : '#3c2010';
    mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5);
  }
  for (var oi2 = 0; oi2 < _objs.length; oi2++) {
    var o2 = _objs[oi2]; if (_gs.dead[o2.id]) continue;
    if (!_fog[o2.ty] || !_fog[o2.ty][o2.tx]) continue;
    if (o2.type === 'exit' && !o2.visible) continue;
    var dc = o2.type === 'monster' ? (o2.hidden ? '#806040' : '#ff4040') : o2.type === 'boss' ? '#ff2020' : o2.type.indexOf('chest') >= 0 ? '#e8a030' : o2.type === 'exit' ? '#40ff40' : o2.type === 'valve' ? '#b07838' : o2.type === 'beacon' ? '#f0c040' : o2.type === 'vent' ? '#a08060' : o2.type === 'fragment' ? '#a060e0' : o2.type === 'crystal' ? '#80c8e8' : o2.type === 'geoshard' ? '#c080f0' : o2.type === 'token' ? '#e8c040' : o2.type === 'page' ? '#c8a060' : '#c07818';
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
  _G.fillStyle = _fogColor; _G.fillRect(0, 0, _W, _H);
  var sx0 = Math.max(0, Math.floor(-camX / ts) - 1), sy0 = Math.max(0, Math.floor(-camY / ts) - 1);
  var sx1 = Math.min(_COLS, sx0 + Math.ceil(_W / ts) + 3), sy1 = Math.min(_ROWS, sy0 + Math.ceil(_H / ts) + 3);
  // Tiles
  for (var ty2 = sy0; ty2 < sy1; ty2++) for (var tx2 = sx0; tx2 < sx1; tx2++) {
    var scx = camX + tx2 * ts, scy = camY + ty2 * ts;
    if (scx + ts < 0 || scx > _W || scy + ts < 0 || scy > _H) continue;
    if (!_fog[ty2][tx2]) { _G.fillStyle = _fogColor; _G.fillRect(scx, scy, ts + 1, ts + 1); continue; }
    var tt2 = _map[ty2][tx2];
    _drawTile(tt2, scx, scy, ts, tx2, ty2, t);
  }
  // Objects
  for (var oi = 0; oi < _objs.length; oi++) {
    var o = _objs[oi];
    var isActivated = _gs.activated && _gs.activated[o.id];
    // Opened chests stay visible (drawn in their open pose) instead of vanishing
    var isOpenedChest = o.type === 'chest' && o.open;
    if (((_gs.dead[o.id] && !isActivated) || !o.alive) && !isOpenedChest) continue;
    if (o.type === 'exit' && !o.visible) continue;
    if (!_fog[o.ty] || !_fog[o.ty][o.tx]) continue;
    var osx = camX + o.tx * ts, osy = camY + o.ty * ts;
    if (osx + ts < 0 || osx > _W || osy + ts < 0 || osy > _H) continue;
    // Draw activated phase 2 items with a golden glow ring
    if (isActivated) {
      var acx = osx + ts * 0.5, acy = osy + ts * 0.5;
      var glowR = ts * 0.32;
      var glowPulse = 0.4 + Math.sin(t * 3) * 0.2;
      _G.save();
      _G.globalAlpha = glowPulse;
      _G.fillStyle = '#f0c040';
      _G.beginPath(); _G.arc(acx, acy, glowR + ts * 0.08, 0, Math.PI * 2); _G.fill();
      _G.restore();
      _G.save();
      _G.strokeStyle = '#f0d060';
      _G.lineWidth = ts * 0.06;
      _G.globalAlpha = 0.7 + Math.sin(t * 2.5) * 0.2;
      _G.beginPath(); _G.arc(acx, acy, glowR, 0, Math.PI * 2); _G.stroke();
      _G.restore();
      LV_cut('#c09020', 3, function () { _G.arc(acx, acy, ts * 0.14, 0, Math.PI * 2); });
      LV_cut('#f0d040', 1, function () { _G.arc(acx, acy, ts * 0.09, 0, Math.PI * 2); });
      continue;
    }
    if (o.type === 'mathdoor') { LV_drawDoor(osx, osy, ts, o, t); continue; }
    if (o.type === 'fountain') { LV_drawFountain(osx, osy, ts, o, t); continue; }
    if (o.type === 'chestG') LV_drawGoldChest(osx, osy, ts, o, t);
    else if (o.type === 'fairy') LV_drawFairyCage(osx, osy, ts, o, t);
    else if (o.type === 'valve') LV_drawValve(osx, osy, ts, o, t);
    else if (o.type === 'beacon') LV_drawBeacon(osx, osy, ts, o, t);
    else if (o.type === 'vent') LV_drawVent(osx, osy, ts, o, t);
    else if (o.type === 'fragment') LV_drawFragment(osx, osy, ts, o, t);
    else if (o.type === 'crystal') LV_drawCrystal(osx, osy, ts, o, t);
    else if (o.type === 'geoshard') LV_drawGeoshard(osx, osy, ts, o, t);
    else if (o.type === 'token') LV_drawToken(osx, osy, ts, o, t);
    else if (o.type === 'page') LV_drawPage(osx, osy, ts, o, t);
    else if (o.type === 'rune') LV_drawRune(osx, osy, ts, o, t);
    else if (o.type === 'coralkey') LV_drawCoralKey(osx, osy, ts, o, t);
    else if (o.type === 'windchime') LV_drawWindChime(osx, osy, ts, o, t);
    else if (o.type === 'lavabridge') LV_drawLavaBridge(osx, osy, ts, o, t);
    else if (o.type === 'thawcrystal') LV_drawThawCrystal(osx, osy, ts, o, t);
    else if (o.type === 'prismshard') LV_drawPrismShard(osx, osy, ts, o, t);
    else if (o.type === 'vaultseal') LV_drawVaultSeal(osx, osy, ts, o, t);
    else if (o.type === 'chapterseal') LV_drawChapterSeal(osx, osy, ts, o, t);
    else if (o.type === 'eqanchor') LV_drawEqAnchor(osx, osy, ts, o, t);
    else if (o.type === 'chest') LV_drawChest(osx, osy, ts, o);
    else if (o.type === 'potion') LV_drawPotion(osx, osy, ts, t);
    else if (o.type === 'gold') LV_drawGold(osx, osy, ts, o);
    else if (o.type === 'monster' && o.alive && !o.hidden) LV_drawMonster(osx, osy, ts, o, t);
    else if (o.type === 'monster' && o.alive && o.hidden) LV_drawEncounterIndicator(osx, osy, ts, o, t);
    else if (o.type === 'boss' && o.alive) LV_drawBoss(osx, osy, ts, o, t);
    else if (o.type === 'exit') LV_drawExit(osx, osy, ts, t);
  }
  // Footstep dust puffs — light fading circles drawn under the hero
  for (var dui = _dustParticles.length - 1; dui >= 0; dui--) {
    var du = _dustParticles[dui]; du.t++;
    if (du.t >= du.maxT) { _dustParticles.splice(dui, 1); continue; }
    var dua = 1 - du.t / du.maxT;
    _G.save(); _G.globalAlpha = dua * 0.35; _G.fillStyle = '#e8dcc0';
    _G.beginPath();
    _G.arc(camX + du.x * _SCALE + du.vx * du.t, camY + du.y * _SCALE + du.vy * du.t,
      ts * 0.045 * (0.6 + (1 - dua) * 0.8), 0, Math.PI * 2);
    _G.fill(); _G.restore();
  }
  // Party — draw leader only
  var moving = (_party.vx !== 0 || _party.vy !== 0);
  LV_drawPartyMember(camX + _party.x * _SCALE, camY + _party.y * _SCALE, ts, 0, moving, t);
  // Fog overlay
  for (var fy2 = sy0; fy2 < sy1; fy2++) for (var fx2 = sx0; fx2 < sx1; fx2++) {
    if (_fog[fy2][fx2]) continue;
    var fsx = camX + fx2 * ts, fsy = camY + fy2 * ts;
    if (fsx + ts < 0 || fsx > _W || fsy + ts < 0 || fsy > _H) continue;
    _G.fillStyle = 'rgba(' + _fogR + ',' + _fogG + ',' + _fogB + ',0.94)'; _G.fillRect(fsx, fsy, ts + 1, ts + 1);
  }
  // Fog edge softening
  for (var fy3 = sy0; fy3 < sy1; fy3++) for (var fx3 = sx0; fx3 < sx1; fx3++) {
    if (!_fog[fy3][fx3]) continue;
    var hasUnrev = (fy3 > 0 && !_fog[fy3 - 1][fx3]) || (fy3 < _ROWS - 1 && !_fog[fy3 + 1][fx3]) || (fx3 > 0 && !_fog[fy3][fx3 - 1]) || (fx3 < _COLS - 1 && !_fog[fy3][fx3 + 1]);
    if (hasUnrev) { _G.fillStyle = 'rgba(' + _fogR + ',' + _fogG + ',' + _fogB + ',0.35)'; _G.fillRect(camX + fx3 * ts, camY + fy3 * ts, ts + 1, ts + 1); }
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
    // Footstep dust — spawn a tiny puff at the hero's feet every ~300ms
    if (now - _lastDustMs >= 300) {
      _lastDustMs = now;
      var nPuffs = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (var di = 0; di < nPuffs; di++) {
        _dustParticles.push({
          x: _party.x + (Math.random() - 0.5) * LV_TILE * 0.2,
          y: _party.y + LV_TILE * 0.16,
          vx: (Math.random() - 0.5) * 0.8 - dx * 0.5,
          vy: -Math.random() * 0.5 - 0.2,
          t: 0, maxT: 18 + Math.floor(Math.random() * 10)
        });
      }
    }
  }
  _party.vx = dx; _party.vy = dy;
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
  _dustParticles = [];
  _lastDustMs = 0;

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
  _gs = { fairies: 0, hasKey: false, hasMap: false, dead: {}, activated: {}, secretFound: false, flash: 0 };

  // Party
  _party = {
    x: (startX + 0.5) * LV_TILE,
    y: (startY + 0.5) * LV_TILE,
    vx: 0, vy: 0,
    speed: 4.2,
    facing: 'down',
    animT: 0
  };

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
    activated: JSON.parse(JSON.stringify(_gs.activated || {})),
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
  _gs.activated = gs.activated ? JSON.parse(JSON.stringify(gs.activated)) : {};
  _gs.secretFound = !!gs.secretFound;
  _gs.flash = 0; // reset flash on restore

  if (gs.fog) {
    _fog = JSON.parse(JSON.stringify(gs.fog));
  }
  if (gs.partyX != null && gs.partyY != null) {
    _party.x = gs.partyX;
    _party.y = gs.partyY;
    _party.facing = gs.partyFacing || 'down';
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
function triggerFlash(amount) {
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
      // Chests stay visible after being opened: flag the open state and
      // timestamp it so LV_drawChest can play a brief lid-open animation.
      if (o.type === 'chest') { o.open = true; o.openedAt = Date.now(); }
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

/**
 * Mark an object as activated (phase 2 items glow instead of disappearing).
 * @param {string} id - Object id
 */
export function markActivated(id) {
  _gs.activated[id] = true;
}

export function markVisible(id) {
  for (var oi = 0; oi < _objs.length; oi++) {
    if (_objs[oi].id === id) { _objs[oi].visible = true; return; }
  }
}

// ─── ADDITIONAL EXPORTS (for backward compatibility / palette access) ──

export function setFloorTheme(floorId) {
  _floorTheme = floorId;
  _updateFogColor();
}

/**
 * Set the transformed visual state (called after Phase 1 completion).
 * When true, floor tiles render with extra decorative elements.
 * @param {boolean} val
 */
export function LV_setTransformed(val) {
  _transformed = !!val;
}

/**
 * Modify a tile in the map at runtime (e.g. convert water to floor).
 * @param {number} tx - Tile X
 * @param {number} ty - Tile Y
 * @param {number} newType - New tile type (LV_TW, LV_TF, etc.)
 */
function LV_setTile(tx, ty, newType) {
  if (ty >= 0 && ty < _ROWS && tx >= 0 && tx < _COLS) {
    _map[ty][tx] = newType;
  }
}

export { LV_PAL, LV_TILE };

export function revealSecret(tx, ty) {
  if (tx < 0 || tx >= _COLS || ty < 0 || ty >= _ROWS) return false;
  if (_map[ty][tx] === LV_TS) { _map[ty][tx] = LV_TF; return true; }
  return false;
}

export function updateObjectUses(id, uses) {
  for (var oi = 0; oi < _objs.length; oi++) {
    if (_objs[oi].id === id) { _objs[oi].uses = uses; return; }
  }
}

export function markDoorOpen(id) {
  for (var oi = 0; oi < _objs.length; oi++) {
    if (_objs[oi].id === id) { _objs[oi].open = true; return; }
  }
}

export function addObject(obj) {
  if (!obj || !obj.type) return;
  _objs.push(obj);
}
