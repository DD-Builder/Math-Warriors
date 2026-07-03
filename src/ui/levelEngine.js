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
import { MAZE_PERSPECTIVE } from '../systems/perspective.js';

// ─── PALETTE (exact copy from reference) ────────────────────────

var LV_PAL = {
  dirt: '#3c2010', dirtL: '#4e2e18', soil: '#5a3820',
  stone: '#c8b890', stoneD: '#a89870', stoneL: '#dccca8', mortar: '#787060',
  hedge0: '#1a3c10', hedge1: '#2a5c1e', hedge2: '#3a7828', hedge3: '#4a9830', hedgeHL: '#60b840',
  rose: '#c02860', roseL: '#e84888', gold: '#c07818', goldL: '#e8a030', cream: '#f0e4cc',
  pond0: '#1a3040', pond1: '#2a5060', pond2: '#3a7080', pondHL: '#6ab0c8',
  fairy0: '#88aaff', fairy1: '#ffaa44', fairy2: '#44ffaa'
};

// ─── FLOOR PALETTES ─────────────────────────────────────────────

var FLOOR_PALS = {
  2: { // Tidepool — three zones: marsh, beach, water
    // Marsh sub-palette
    marsh_wall0: '#2a4818', marsh_wall1: '#3a6028', marsh_floor: '#3a5020', marsh_floorL: '#4a6030',
    // Beach sub-palette
    beach_wall0: '#a08050', beach_wall1: '#b89060', beach_floor: '#d8c090', beach_floorL: '#e8d0a0',
    beach_path: '#8a7040', beach_pathL: '#a08850',
    // Water sub-palette
    water_wall0: '#1a3858', water_wall1: '#2a4868', water_floor: '#2090b0', water_floorL: '#30a8c8',
    water_path: '#607888', water_pathL: '#7898a8',
    // Shared
    accent: '#e06888', coral: '#e87060', waterHL: '#60d0e8',
    // Legacy compatibility
    wall0: '#6a5838', wall1: '#7a6848', wall2: '#8a7858', wall3: '#9a8868',
    floor0: '#c8b890', floorL: '#d8c8a0',
    path0: '#8a7050', pathS: '#a08860', pathL: '#b8a070',
    water0: '#2890b0', water1: '#38a8c8',
    accentL: '#f088a0',
  },
  3: { // Cloud — three zones: calm sky, storm, sunset heights
    // Calm Sky sub-palette (top-left, d<16)
    calm_wall: '#c0d8f0', calm_wallD: '#8aa8c8', calm_floor: '#a0b8d8', calm_floorL: '#a0b8d0',
    calm_path: '#c8b070', calm_pathL: '#d8c080',
    // Storm sub-palette (middle, 16<=d<36)
    storm_wall: '#3a3858', storm_wallD: '#1a1830', storm_floor: '#3a3850', storm_floorL: '#4a4860',
    storm_path: '#484860', storm_pathL: '#585870',
    // Sunset Heights sub-palette (bottom-right, d>=36)
    sunset_wall: '#d8a070', sunset_wallD: '#a07048', sunset_floor: '#c8a070', sunset_floorL: '#d8b080',
    sunset_path: '#d0a050', sunset_pathL: '#e0b060',
    // Shared
    water0: '#c8d8e8', water1: '#d8e8f8', waterHL: '#f0f8ff',
    accent: '#f8d830', accentL: '#ffe848', wisp: '#e0e8f0',
    // Legacy compatibility
    wall0: '#1a2030', wall1: '#283040', wall2: '#384050', wall3: '#485868',
    floor0: '#607080', floorL: '#788898',
    path0: '#8898a8', pathS: '#a0b0c0', pathL: '#b8c8d8',
  },
  4: { // Ember
    wall0: '#1a0808', wall1: '#280e08', wall2: '#381408', wall3: '#481c0c',
    floor0: '#3a2010', floorL: '#4a2818',
    path0: '#584030', pathS: '#685040', pathL: '#786050',
    water0: '#601808', water1: '#802010', waterHL: '#e06010',
    accent: '#e04008', accentL: '#f06818', ember: '#ff8020',
  },
  5: { // Arcane (now Frozen Peak)
    wall0: '#304858', wall1: '#406070', wall2: '#507888', wall3: '#6090a0',
    floor0: '#6898b8', floorL: '#78a8c8',
    path0: '#88b8d8', pathS: '#98c8e0', pathL: '#a8d0e8',
    water0: '#4878a0', water1: '#5888b0', waterHL: '#90d0f0',
    accent: '#c0e8ff', accentL: '#d8f0ff', rune: '#80c0e0',
  },
  6: { // Crystal Caverns
    wall0: '#381060', wall1: '#481878', wall2: '#582090', wall3: '#6828a8',
    floor0: '#4a2880', floorL: '#5a3898',
    path0: '#7048b0', pathS: '#8058c0', pathL: '#9068d0',
    water0: '#3818a0', water1: '#4828b0', waterHL: '#8060e0',
    accent: '#c098f0', accentL: '#d0a8ff', rune: '#a070e0',
  },
  7: { // Market Square
    wall0: '#4a3818', wall1: '#5a4828', wall2: '#6a5838', wall3: '#7a6848',
    floor0: '#786030', floorL: '#887040',
    path0: '#a08850', pathS: '#b09860', pathL: '#c0a870',
    water0: '#605020', water1: '#706030', waterHL: '#c0a050',
    accent: '#e8c048', accentL: '#f0d058', rune: '#d0a830',
  },
  8: { // Infinity Library
    wall0: '#1a1008', wall1: '#2a1810', wall2: '#3a2818', wall3: '#4a3820',
    floor0: '#382010', floorL: '#483018',
    path0: '#584020', pathS: '#685028', pathL: '#786030',
    water0: '#281808', water1: '#382010', waterHL: '#806030',
    accent: '#c09848', accentL: '#d0a858', rune: '#a08030',
  },
  9: { // The Mending Room (arcane)
    wall0: '#100818', wall1: '#180c28', wall2: '#201038', wall3: '#281848',
    floor0: '#201030', floorL: '#281840',
    path0: '#382050', pathS: '#483068', pathL: '#584080',
    water0: '#180830', water1: '#200c40', waterHL: '#6030c0',
    accent: '#c060f0', accentL: '#d880ff', rune: '#8040d0',
  },
};

var _floorTheme = 1;
var _transformed = false;

// ─── FOG COLOR (derived from floor palette) ─────────────────────

var _fogR = 8, _fogG = 4, _fogB = 2;
var _fogColor = 'rgb(8,4,2)';
var _fogColorMinimap = '#080402';
var _fogColorMinimapBg = '#080402';

function _updateFogColor() {
  var fogHex = (FLOOR_PALETTES[_floorTheme] && FLOOR_PALETTES[_floorTheme].fog) || 0x080402;
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
var _skipCanvasHero = false;
var _deathParticles = [];
var _minimapCanvas = null;
var _minimapG = null;
var _fgCanvas = null;   // foreground overlay canvas (walls in front of hero)
var _fgG = null;         // foreground 2D context

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

function LV_blocked(t) {
  // Walls always block. Water/hazard blocks too — in the handcrafted
  // levels it is the STRUCTURAL barrier (stream/tide/lava/void) that
  // the floor's challenge transforms into a crossing. If water were
  // strollable, every boss seal would be decorative.
  return t === LV_TW || t === LV_TQ;
}

function LV_walkable(wx, wy) {
  var m = LV_TILE * 0.18;
  return !LV_blocked(LV_tileAt(wx - m, wy - m)) && !LV_blocked(LV_tileAt(wx + m, wy - m)) &&
         !LV_blocked(LV_tileAt(wx - m, wy + m)) && !LV_blocked(LV_tileAt(wx + m, wy + m));
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
  // Grass tufts scattered on floor tiles
  var gr = mkRng(tx * 37 + ty * 71 + 33);
  var grassCount = Math.floor(gr() * 3) + 1;
  for (var gi = 0; gi < grassCount; gi++) {
    var gx = sx + ts * (0.1 + gr() * 0.8), gy = sy + ts * (0.4 + gr() * 0.5);
    var gc = gr() < 0.6 ? '#5a9838' : '#4a8828';
    _G.save();
    _G.strokeStyle = gc;
    _G.lineWidth = 0.8;
    _G.globalAlpha = 0.5 + gr() * 0.3;
    var bladeH = ts * (0.06 + gr() * 0.05);
    for (var bi = 0; bi < 3; bi++) {
      _G.beginPath();
      _G.moveTo(gx + bi * 2 - 2, gy);
      _G.quadraticCurveTo(gx + bi * 2 - 2 + (gr() - 0.5) * 4, gy - bladeH, gx + bi * 2 - 2 + (gr() - 0.5) * 3, gy - bladeH * 1.2);
      _G.stroke();
    }
    _G.restore();
  }
  // Flowers (slightly higher chance than before for visual richness)
  if (r() < 0.12) {
    var flr = mkRng(tx * 43 + ty * 29 + 5);
    var flx = sx + ts * (0.25 + flr() * 0.5), fly = sy + ts * (0.25 + flr() * 0.5);
    var fc = flr() < 0.33 ? LV_PAL.rose : flr() < 0.66 ? LV_PAL.goldL : '#88bbdd';
    // Stem
    _G.save(); _G.strokeStyle = '#4a7830'; _G.lineWidth = 1; _G.globalAlpha = 0.6;
    _G.beginPath(); _G.moveTo(flx, fly + ts * 0.05); _G.lineTo(flx, fly + ts * 0.12); _G.stroke(); _G.restore();
    // Petals
    LV_cut(fc, 1, function () { for (var p = 0; p < 5; p++) { var a = (p / 5) * Math.PI * 2 - Math.PI * 0.5; _G.moveTo(flx, fly); _G.arc(flx + Math.cos(a) * ts * 0.04, fly + Math.sin(a) * ts * 0.04, ts * 0.025, 0, Math.PI * 2); } });
    LV_cut(LV_PAL.goldL, 0, function () { _G.arc(flx, fly, ts * 0.015, 0, Math.PI * 2); });
  }
  // Small stones
  if (r() < 0.08) {
    var sr2 = mkRng(tx * 59 + ty * 41 + 7);
    var stx = sx + ts * (0.15 + sr2() * 0.7), sty = sy + ts * (0.5 + sr2() * 0.35);
    _G.save(); _G.globalAlpha = 0.35;
    LV_cut('#8a8878', 1, function () { LV_ellipse(stx, sty, ts * 0.04, ts * 0.025, sr2() * 0.5); });
    _G.restore();
  }
  // Transformation: flowers and petals bloom on bare dirt
  if (_transformed && r() < 0.25) {
    var fr = mkRng(tx * 67 + ty * 31 + 99);
    var fx = sx + ts * (0.2 + fr() * 0.6), fy = sy + ts * (0.2 + fr() * 0.6);
    var fc2 = fr() < 0.5 ? LV_PAL.rose : LV_PAL.goldL;
    LV_cut(fc2, 1, function() { _G.arc(fx, fy, ts * 0.06 + fr() * ts * 0.03, 0, Math.PI * 2); });
    if (fr() < 0.4) {
      var lx = sx + ts * (0.15 + fr() * 0.7), ly = sy + ts * (0.15 + fr() * 0.5);
      LV_cut('#50a838', 0, function() { _G.arc(lx, ly, ts * 0.04, 0, Math.PI * 2); });
    }
  }
}

function LV_drawPath(sx, sy, ts, tx, ty) {
  LV_cut(LV_PAL.mortar, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  var stones = [[sx + ts * 0.04, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.04, ts * 0.44, ts * 0.44], [sx + ts * 0.04, sy + ts * 0.52, ts * 0.44, ts * 0.44], [sx + ts * 0.52, sy + ts * 0.52, ts * 0.44, ts * 0.44]];
  for (var si = 0; si < 4; si++) {
    var st = stones[si]; var sr = mkRng(tx * 41 + ty * 83 + si * 11);
    LV_cut(si % 2 === 0 ? LV_PAL.stone : LV_PAL.stoneD, 2, (function (st2, sr2) { return function () { LV_wobRect(st2[0] + sr2() * 2, st2[1] + sr2() * 2, st2[2] - sr2() * 2, st2[3] - sr2() * 2, mkRng(si * 7 + tx + ty), 1.5); }; })(st, sr));
  }
  // Moss growing between stone cracks
  var mr = mkRng(tx * 37 + ty * 61 + 42);
  if (mr() < 0.4) {
    _G.save();
    _G.globalAlpha = 0.35;
    var mossCol = '#4a8030';
    for (var mi = 0; mi < 2 + Math.floor(mr() * 2); mi++) {
      var mx = sx + ts * (0.08 + mr() * 0.84), my = sy + ts * mr();
      _G.fillStyle = mossCol;
      _G.beginPath();
      _G.arc(mx, my, ts * 0.015 + mr() * ts * 0.01, 0, Math.PI * 2);
      _G.fill();
    }
    _G.restore();
  }
  // Stone wear marks
  var wr = mkRng(tx * 23 + ty * 47 + 8);
  if (wr() < 0.3) {
    _G.save();
    _G.globalAlpha = 0.12;
    _G.fillStyle = '#000';
    var wcx = sx + ts * (0.2 + wr() * 0.6), wcy = sy + ts * (0.2 + wr() * 0.6);
    _G.beginPath();
    LV_ellipse(wcx, wcy, ts * (0.08 + wr() * 0.06), ts * (0.04 + wr() * 0.03), wr() * 1.5);
    _G.fill();
    _G.restore();
  }
}

function LV_drawWater(sx, sy, ts, tx, ty, t) {
  LV_cut(LV_PAL.pond0, 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  LV_cut(LV_PAL.pond1, 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
  // Animated highlight stripe
  LV_cut(LV_PAL.pondHL, 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.18 + Math.sin(t * 2 + ty) * ts * 0.04, ts * 0.35, ts * 0.05); });
  // Second highlight (offset phase)
  _G.save();
  _G.globalAlpha = 0.25;
  _G.fillStyle = LV_PAL.pondHL;
  _G.fillRect(sx + ts * 0.55, sy + ts * 0.45 + Math.sin(t * 1.5 + tx * 2) * ts * 0.03, ts * 0.25, ts * 0.03);
  _G.restore();
  // Animated ripple ring
  var rr = mkRng(tx * 17 + ty * 31 + 88);
  if (rr() < 0.35) {
    var rcx = sx + ts * (0.3 + rr() * 0.4), rcy = sy + ts * (0.3 + rr() * 0.4);
    var phase = (t * 0.8 + tx * 1.2 + ty * 0.7) % 3;
    var rippleR = ts * 0.04 + phase * ts * 0.04;
    var rippleAlpha = Math.max(0, 0.3 - phase * 0.1);
    _G.save();
    _G.globalAlpha = rippleAlpha;
    _G.strokeStyle = LV_PAL.pondHL;
    _G.lineWidth = 0.6;
    _G.beginPath();
    _G.arc(rcx, rcy, rippleR, 0, Math.PI * 2);
    _G.stroke();
    _G.restore();
  }
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
    LV_cut('#4a7838', 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.3 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.45); });
    // Moss accents
    if (r() < 0.35) {
      var mr = mkRng(tx * 17 + ty * 37 + 3); var mx = sx + ts * (0.2 + mr() * 0.6), my = sy + ts * (0.6 + mr() * 0.2);
      LV_cut('#5a8838', 1, function () { _G.arc(mx, my, ts * 0.07, 0, Math.PI * 2); });
      LV_cut('#6a9848', 0, function () { _G.arc(mx + ts * 0.04, my - ts * 0.02, ts * 0.04, 0, Math.PI * 2); });
    }
  } else if (zone === 1) {
    // Beach: sandy tan dunes, driftwood brown, flat tops
    LV_cut(P.beach_wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(P.beach_wall1, 4, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.85); });
    // Flat dune top
    LV_cut('#c8a070', 2, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.05, ts * 0.84, ts * 0.2); });
    // Driftwood
    if (r() < 0.25) {
      var dr = mkRng(tx * 23 + ty * 41);
      _G.save(); _G.strokeStyle = '#6a5030'; _G.lineWidth = 2; _G.globalAlpha = 0.6;
      _G.beginPath(); _G.moveTo(sx + ts * (0.2 + dr() * 0.3), sy + ts * (0.5 + dr() * 0.2));
      _G.lineTo(sx + ts * (0.5 + dr() * 0.3), sy + ts * (0.4 + dr() * 0.2)); _G.stroke(); _G.restore();
    }
  } else {
    // Water: dark blue-grey rock formations, coral accents
    LV_cut(P.water_wall0, 8, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut(P.water_wall1, 5, function () { var r2 = mkRng(tx * 7 + ty * 13); LV_bumpStrip(sx, sx + ts, sy + ts, sy + ts * (0.2 + r() * 0.1), 3 + Math.floor(r() * 2), r2, 0.6); });
    LV_cut('#3a5878', 3, function () { var r2 = mkRng(tx * 11 + ty * 19); LV_bumpStrip(sx + ts * 0.05, sx + ts * 0.95, sy + ts, sy + ts * (0.35 + r() * 0.08), 2 + Math.floor(r() * 2), r2, 0.5); });
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
    if (r() < 0.3) { var pr2 = mkRng(tx * 43 + ty * 29); LV_cut('#2a3818', 0, function () { _G.arc(sx + ts * (0.3 + pr2() * 0.4), sy + ts * (0.3 + pr2() * 0.4), ts * 0.08, 0, Math.PI * 2); }); }
    // Transformation: lily pads on marsh
    if (_transformed && r() < 0.2) {
      var fr2 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut('#3a8830', 1, function() { _G.arc(sx + ts * (0.3 + fr2() * 0.4), sy + ts * (0.3 + fr2() * 0.4), ts * 0.07, 0, Math.PI * 2); });
    }
  } else if (zone === 1) {
    // Beach: light tan sand, flat, occasional tiny shell dots
    LV_cut(P.beach_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.beach_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.3 + pr() * 0.25), ts * (0.2 + pr() * 0.15)); }); }
    // Shell dots
    if (r() < 0.2) { var sr = mkRng(tx * 43 + ty * 29); LV_cut('#f0e8d0', 0, function () { _G.arc(sx + ts * (0.3 + sr() * 0.4), sy + ts * (0.4 + sr() * 0.3), ts * 0.03, 0, Math.PI * 2); }); }
    // Transformation: colorful shells and starfish on beach
    if (_transformed && r() < 0.22) {
      var fr2 = mkRng(tx * 67 + ty * 31 + 99);
      var shCol = fr2() < 0.33 ? P.coral : fr2() < 0.66 ? P.accent : '#f0d0a0';
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
    LV_cut('#3a2818', 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    // Planks: horizontal lines
    for (var pi = 0; pi < 4; pi++) {
      var py = sy + ts * 0.05 + pi * ts * 0.24;
      LV_cut('#4a3828', 2, function () { _G.rect(sx + ts * 0.04, py, ts * 0.92, ts * 0.18); });
      LV_cut('#5a4838', 1, function () { _G.rect(sx + ts * 0.08, py + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else if (zone === 1) {
    // Beach: sandy boardwalk (light tan planks)
    LV_cut(P.beach_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var pi2 = 0; pi2 < 4; pi2++) {
      var py2 = sy + ts * 0.05 + pi2 * ts * 0.24;
      LV_cut(P.beach_pathL, 2, function () { _G.rect(sx + ts * 0.04, py2, ts * 0.92, ts * 0.18); });
      LV_cut('#b89860', 1, function () { _G.rect(sx + ts * 0.08, py2 + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else {
    // Water: grey stepping stones (rounded rectangles in blue water)
    LV_cut('#1a6888', 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
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
    LV_cut('#1a3020', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#2a4030', 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.1, ts * 0.9, ts * 0.75); });
    LV_cut('#3a5840', 0, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.2 + Math.sin(t * 1.5 + ty) * ts * 0.04, ts * 0.35, ts * 0.04); });
  } else if (zone === 1) {
    // Beach: tidal pool (turquoise with sand border)
    LV_cut('#b8a878', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#2890b0', 3, function () { _G.rect(sx + ts * 0.1, sy + ts * 0.1, ts * 0.8, ts * 0.8); });
    LV_cut('#38a8c8', 1, function () { _G.rect(sx + ts * 0.15, sy + ts * 0.15, ts * 0.7, ts * 0.7); });
    LV_cut(P.waterHL, 0, function () { _G.rect(sx + ts * 0.2, sy + ts * 0.2 + Math.sin(t * 1.8 + ty) * ts * 0.04, ts * 0.3, ts * 0.04); });
  } else {
    // Water: deep ocean blue with animated wave highlights
    LV_cut('#0a2848', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#1a3858', 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.08, ts * 0.9, ts * 0.8); });
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
  var baseCol = zone === 0 ? '#c0d8f0' : zone === 1 ? '#3a3858' : '#d8a070';
  var lightCol = zone === 0 ? '#d8e8f8' : zone === 1 ? '#4a4870' : '#e8b888';
  var highlightCol = zone === 0 ? '#e8f0ff' : zone === 1 ? '#5a5888' : '#f0c8a0';

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
      _G.save(); _G.strokeStyle = '#f0d830'; _G.lineWidth = 0.8; _G.globalAlpha = 0.35;
      var cr = mkRng(tx * 43 + ty * 29);
      _G.beginPath(); _G.moveTo(sx + ts * (0.2 + cr() * 0.3), sy + ts * (0.2 + cr() * 0.2));
      _G.lineTo(sx + ts * (0.4 + cr() * 0.2), sy + ts * (0.5 + cr() * 0.2));
      _G.lineTo(sx + ts * (0.5 + cr() * 0.3), sy + ts * (0.7 + cr() * 0.2)); _G.stroke(); _G.restore();
    }
    // Transformation: storm clearing - bright patches
    if (_transformed && r() < 0.18) {
      var fr3 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut('#e0d090', 0, function() { _G.arc(sx + ts * (0.25 + fr3() * 0.5), sy + ts * (0.25 + fr3() * 0.5), ts * 0.06, 0, Math.PI * 2); });
    }
  } else {
    // Sunset: Warm amber/gold stone
    LV_cut(P.sunset_floor, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.sunset_floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
    // Transformation: warm golden glow dots
    if (_transformed && r() < 0.2) {
      var fr3 = mkRng(tx * 67 + ty * 31 + 99);
      LV_cut('#f0d060', 0, function() { _G.arc(sx + ts * (0.2 + fr3() * 0.6), sy + ts * (0.2 + fr3() * 0.6), ts * 0.05, 0, Math.PI * 2); });
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
      LV_cut('#e0d090', 1, function () { _G.rect(sx + ts * 0.08, py + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
  } else if (zone === 1) {
    // Storm: Cracked dark grey stone bridge
    LV_cut(P.storm_path, 4, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    for (var si = 0; si < 4; si++) { var sr = mkRng(tx * 41 + ty * 83 + si * 11); var sx2 = sx + (si % 2) * ts * 0.48 + ts * 0.04, sy2 = sy + Math.floor(si / 2) * ts * 0.48 + ts * 0.04; LV_cut(si % 2 === 0 ? P.storm_pathL : '#505068', 2, (function (x, y, r2) { return function () { LV_wobRect(x + r2() * 2, y + r2() * 2, ts * 0.42, ts * 0.42, mkRng(si * 7 + tx + ty), 1.5); }; })(sx2, sy2, sr)); }
    // Crack line
    if (r() < 0.3) {
      _G.save(); _G.strokeStyle = '#282838'; _G.lineWidth = 1; _G.globalAlpha = 0.5;
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
      LV_cut('#e8c070', 1, function () { _G.rect(sx + ts * 0.08, py2 + ts * 0.02, ts * 0.84, ts * 0.06); });
    }
    // Warm glow overlay
    _G.save(); _G.globalAlpha = 0.08; _G.fillStyle = '#f0c040';
    _G.beginPath(); _G.arc(sx + ts * 0.5, sy + ts * 0.5, ts * 0.35, 0, Math.PI * 2); _G.fill(); _G.restore();
  }
}
function LV_drawWater_cloud(sx, sy, ts, tx, ty, t) {
  var P = FLOOR_PALS[3];
  var zone = LV_getZone3(tx, ty);
  if (zone === 0) {
    // Calm: Wispy white mist
    LV_cut('#e0e8f0', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#f0f4fa', 3, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.12, ts * 0.84, ts * 0.7); });
    LV_cut('#ffffff', 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.4 + Math.sin(t * 1.5 + tx) * ts * 0.06, ts * 0.15, 0, Math.PI * 2); });
    LV_cut('#f8fcff', 0, function () { _G.arc(sx + ts * 0.3, sy + ts * 0.6 + Math.sin(t * 1.2 + ty) * ts * 0.04, ts * 0.1, 0, Math.PI * 2); });
  } else if (zone === 1) {
    // Storm: Dark void (nearly black with distant stars)
    LV_cut('#0a0818', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#101028', 3, function () { _G.rect(sx + ts * 0.05, sy + ts * 0.08, ts * 0.9, ts * 0.84); });
    // Distant stars
    var sr = mkRng(tx * 43 + ty * 67 + 303);
    for (var i = 0; i < 3; i++) {
      var stx = sx + ts * (0.1 + sr() * 0.8), sty = sy + ts * (0.1 + sr() * 0.8);
      LV_cut('#a0a8c0', 0, function () { _G.arc(stx, sty, ts * 0.02, 0, Math.PI * 2); });
    }
  } else {
    // Sunset: Orange/pink sunset haze
    LV_cut('#c87040', 5, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
    LV_cut('#d88858', 3, function () { _G.rect(sx + ts * 0.08, sy + ts * 0.1, ts * 0.84, ts * 0.75); });
    LV_cut('#e8a070', 0, function () { _G.arc(sx + ts * 0.5, sy + ts * 0.45 + Math.sin(t * 1.3 + tx) * ts * 0.05, ts * 0.16, 0, Math.PI * 2); });
    LV_cut('#f0b888', 0, function () { _G.arc(sx + ts * 0.35, sy + ts * 0.6 + Math.sin(t * 1.6 + ty) * ts * 0.03, ts * 0.1, 0, Math.PI * 2); });
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
    var coolCol = fr4() < 0.5 ? '#606060' : '#787878';
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
}
function LV_drawFloor_ice(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[5], r = mkRng(tx * 19 + ty * 53 + 602);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.4) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Transformation: thawed grass patches (green on ice)
  if (_transformed && r() < 0.22) {
    var fr5 = mkRng(tx * 67 + ty * 31 + 99);
    var grassCol = fr5() < 0.5 ? '#4a8830' : '#60a840';
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
}
function LV_drawFloor_crystal(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[6], r = mkRng(tx * 19 + ty * 53 + 702);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
  // Transformation: prismatic sparkle dots
  if (_transformed && r() < 0.2) {
    var fr6 = mkRng(tx * 67 + ty * 31 + 99);
    var pCol = fr6() < 0.33 ? P.accent : fr6() < 0.66 ? '#e060e0' : '#60e0e0';
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
}
function LV_drawFloor_market(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[7], r = mkRng(tx * 19 + ty * 53 + 802);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.45) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
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
}
function LV_drawFloor_library(sx, sy, ts, tx, ty) {
  var P = FLOOR_PALS[8], r = mkRng(tx * 19 + ty * 53 + 902);
  LV_cut(P.floor0, 2, function () { _G.rect(sx, sy, ts + 1, ts + 1); });
  if (r() < 0.35) { var pr = mkRng(tx * 29 + ty * 67); LV_cut(P.floorL, 1, function () { _G.rect(sx + pr() * ts * 0.4 + ts * 0.1, sy + pr() * ts * 0.4 + ts * 0.1, ts * (0.25 + pr() * 0.2), ts * (0.15 + pr() * 0.15)); }); }
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

// ─── FLOOR 10: MENDING ROOM reuses arcane tile fns (floor 5 key=9) ──

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
  9: { wall: LV_drawWall_arcane, floor: LV_drawFloor_arcane, path: LV_drawPath_arcane, water: LV_drawWater_arcane },
};

function _drawTile(tt, sx, sy, ts, tx, ty, t) {
  var fns = _tileFns[_floorTheme] || _tileFns[1];
  if (tt === LV_TW) fns.wall(sx, sy, ts, tx, ty);
  else if (tt === LV_TP) fns.path(sx, sy, ts, tx, ty);
  else if (tt === LV_TQ) fns.water(sx, sy, ts, tx, ty, t);
  else if (tt === LV_TS) {
    fns.wall(sx, sy, ts, tx, ty);
    var sr = mkRng(tx * 61 + ty * 89);
    _G.globalAlpha = 0.25 + Math.sin(t * 1.5 + tx * 3) * 0.1;
    _G.strokeStyle = '#f0d060';
    _G.lineWidth = 1;
    _G.beginPath();
    var cx = sx + ts * (0.3 + sr() * 0.4);
    _G.moveTo(cx, sy + ts * 0.2);
    _G.lineTo(cx + ts * 0.05, sy + ts * 0.5);
    _G.lineTo(cx - ts * 0.03, sy + ts * 0.8);
    _G.stroke();
    _G.globalAlpha = 1;
  }
  else fns.floor(sx, sy, ts, tx, ty);
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

function LV_drawFairyCage(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var bob = Math.sin(t * 2.5) * ts * 0.02;
  // Base plate
  LV_cut('#8a7040', 3, function () { _G.rect(x - ts * 0.22, y + ts * 0.2, ts * 0.44, ts * 0.06); });
  // Cage bars (4 vertical lines + dome)
  _G.save(); _G.strokeStyle = o.open ? '#6a5030' : '#c0a050'; _G.lineWidth = 1.5; _G.globalAlpha = 0.9;
  for (var b = -1.5; b <= 1.5; b++) {
    var bx = x + b * ts * 0.1;
    _G.beginPath(); _G.moveTo(bx, y + ts * 0.2); _G.lineTo(bx, y - ts * 0.12 + bob); _G.stroke();
  }
  // Dome arc
  _G.beginPath(); _G.arc(x, y - ts * 0.12 + bob, ts * 0.18, Math.PI, 0); _G.stroke();
  // Ring at top
  LV_cut('#c0a050', 1, function () { _G.arc(x, y - ts * 0.3 + bob, ts * 0.04, 0, Math.PI * 2); });
  _G.restore();
  if (!o.open) {
    // Fairy inside — glowing circle bobbing
    var fy = y + Math.sin(t * 3.5) * ts * 0.06;
    _G.save(); _G.globalAlpha = 0.7 + Math.sin(t * 4) * 0.2;
    _G.fillStyle = '#88bbff'; _G.beginPath(); _G.arc(x, fy, ts * 0.08, 0, Math.PI * 2); _G.fill();
    _G.fillStyle = '#ffffff'; _G.beginPath(); _G.arc(x - ts * 0.02, fy - ts * 0.02, ts * 0.04, 0, Math.PI * 2); _G.fill();
    // Sparkles
    for (var s = 0; s < 3; s++) {
      var sa = (s / 3) * Math.PI * 2 + t * 2;
      var sdx = Math.cos(sa) * ts * 0.14, sdy = Math.sin(sa) * ts * 0.1;
      _G.fillStyle = '#ffe880'; _G.globalAlpha = 0.5 + Math.sin(t * 5 + s) * 0.3;
      _G.beginPath(); _G.arc(x + sdx, fy + sdy, ts * 0.025, 0, Math.PI * 2); _G.fill();
    }
    _G.restore();
  } else {
    // Door open — bent bar
    _G.save(); _G.strokeStyle = '#8a7040'; _G.lineWidth = 1.2; _G.globalAlpha = 0.6;
    _G.beginPath(); _G.moveTo(x + ts * 0.15, y + ts * 0.2); _G.lineTo(x + ts * 0.25, y); _G.stroke();
    _G.restore();
  }
}

function LV_drawValve(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var radius = ts * 0.28;
  var rot = o.open ? 0.4 : t * 0.8;
  var col = o.open ? '#8a5828' : '#b07838';
  var colD = o.open ? '#6a4018' : '#906028';
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
    _G.fillStyle = 'rgba(64,160,220,0.6)';
    _G.beginPath(); _G.arc(x, dripY, ts * 0.04, 0, Math.PI * 2); _G.fill();
    _G.beginPath(); _G.arc(x - ts * 0.12, dripY + ts * 0.04, ts * 0.025, 0, Math.PI * 2); _G.fill();
  }
  _G.restore();
}

function LV_drawBeacon(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.8;
  // Stone pillar
  var pw = ts * 0.18, ph = ts * 0.55;
  LV_cut('#606060', 4, function () { _G.rect(x - pw, y - ph, pw * 2, ph); });
  LV_cut('#787878', 2, function () { _G.rect(x - pw + 2, y - ph + 2, pw * 2 - 4, ph - 4); });
  // Bowl/brazier at top
  LV_cut('#505050', 3, function () {
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
    _G.fillStyle = '#f0a020';
    _G.beginPath(); _G.arc(x + flicker, fy - ts * 0.06, ts * 0.09, 0, Math.PI * 2); _G.fill();
    _G.fillStyle = '#f0d040';
    _G.beginPath(); _G.arc(x - flicker * 0.5, fy - ts * 0.1, ts * 0.06, 0, Math.PI * 2); _G.fill();
    // Glow
    _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
    _G.fillStyle = '#f0c040';
    _G.beginPath(); _G.arc(x, fy - ts * 0.06, ts * 0.22, 0, Math.PI * 2); _G.fill();
    _G.restore();
  }
}

function LV_drawVent(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.7;
  // Rocky base (irregular)
  LV_cut('#3a3030', 4, function () {
    _G.moveTo(x - ts * 0.3, y + ts * 0.1);
    _G.lineTo(x - ts * 0.22, y - ts * 0.14);
    _G.lineTo(x - ts * 0.08, y - ts * 0.18);
    _G.lineTo(x + ts * 0.08, y - ts * 0.2);
    _G.lineTo(x + ts * 0.24, y - ts * 0.12);
    _G.lineTo(x + ts * 0.32, y + ts * 0.1);
  });
  LV_cut(o.open ? '#2a2020' : '#4a3828', 2, function () {
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
      _G.fillStyle = '#a0a0a0';
      _G.beginPath(); _G.arc(px, py, ts * (0.04 + rise * 0.03), 0, Math.PI * 2); _G.fill();
    }
    _G.restore();
  }
}

function LV_drawFragment(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) {
    // Empty pedestal
    LV_cut('#484050', 3, function () { _G.rect(x - ts * 0.14, y + ts * 0.12, ts * 0.28, ts * 0.1); });
    return;
  }
  var bob = Math.sin(t * 2.2) * ts * 0.04;
  var fy = y + bob;
  // Glow
  _G.save();
  _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
  _G.fillStyle = '#8040d0';
  _G.beginPath(); _G.arc(x, fy, ts * 0.24, 0, Math.PI * 2); _G.fill();
  _G.restore();
  // Diamond shape
  var sz = ts * 0.16;
  LV_cut('#a060e0', 3, function () {
    _G.moveTo(x, fy - sz);
    _G.lineTo(x + sz, fy);
    _G.lineTo(x, fy + sz);
    _G.lineTo(x - sz, fy);
  });
  LV_cut('#c080ff', 1, function () {
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
    _G.fillStyle = '#d0a0ff'; _G.globalAlpha = 0.4 + Math.sin(t * 4 + s) * 0.3;
    _G.beginPath(); _G.arc(x + sdx, fy + sdy, ts * 0.025, 0, Math.PI * 2); _G.fill();
  }
  _G.restore();
  // Pedestal
  LV_cut('#484050', 2, function () { _G.rect(x - ts * 0.14, y + ts * 0.12, ts * 0.28, ts * 0.1); });
}

function LV_drawCrystal(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut('#406080', 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 2.0) * ts * 0.04;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.25 + Math.sin(t * 2.5) * 0.1; _G.fillStyle = '#80c8e8'; _G.beginPath(); _G.arc(x, fy, ts * 0.22, 0, Math.PI * 2); _G.fill(); _G.restore();
  var sz = ts * 0.16;
  LV_cut('#60b0d8', 3, function () { _G.moveTo(x, fy - sz); _G.lineTo(x + sz * 0.7, fy); _G.lineTo(x, fy + sz); _G.lineTo(x - sz * 0.7, fy); });
  LV_cut('#90d0f0', 1, function () { _G.moveTo(x, fy - sz * 0.5); _G.lineTo(x + sz * 0.4, fy); _G.lineTo(x, fy + sz * 0.5); _G.lineTo(x - sz * 0.4, fy); });
}

function LV_drawGeoshard(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  if (o.open) { LV_cut('#503080', 2, function () { _G.rect(x - ts * 0.1, y + ts * 0.1, ts * 0.2, ts * 0.08); }); return; }
  var bob = Math.sin(t * 1.8) * ts * 0.03;
  var fy = y + bob;
  _G.save(); _G.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1; _G.fillStyle = '#a060e0'; _G.beginPath(); _G.arc(x, fy, ts * 0.2, 0, Math.PI * 2); _G.fill(); _G.restore();
  var sz = ts * 0.18;
  LV_cut('#9050d0', 3, function () { _G.moveTo(x, fy - sz); _G.lineTo(x + sz * 0.87, fy + sz * 0.5); _G.lineTo(x - sz * 0.87, fy + sz * 0.5); });
  LV_cut('#b080f0', 1, function () { _G.moveTo(x, fy - sz * 0.5); _G.lineTo(x + sz * 0.43, fy + sz * 0.25); _G.lineTo(x - sz * 0.43, fy + sz * 0.25); });
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
  // Themed pulsing indicator — visible hint that an encounter lurks here
  var ecx = sx + ts * 0.5, ecy = sy + ts * 0.5;
  var pulse = 0.3 + Math.sin(t * 3 + o.tx * 2 + o.ty * 3) * 0.15;
  var eSize = ts * (0.12 + Math.sin(t * 2.5 + o.tx) * 0.03);

  // Theme colors based on floor
  var eColors = {
    1: '#3a6828',  // Garden: green bush rustle
    2: '#2888b8',  // Tidepool: blue bubble
    3: '#606878',  // Cloud: gray swirl
    4: '#c04010',  // Ember: red crack
    5: '#4888a8',  // Frost: ice shimmer
    6: '#6828a8',  // Crystal: purple glow
    7: '#7a6848',  // Market: warm brown
    8: '#3a2818',  // Library: dark amber
    9: '#281848',  // Mending: arcane purple
  };
  var eColor = eColors[_floorTheme] || eColors[1];

  _G.globalAlpha = pulse;
  _G.fillStyle = eColor;
  _G.beginPath();
  _G.arc(ecx, ecy, eSize, 0, Math.PI * 2);
  _G.fill();
  // Outer ring
  _G.strokeStyle = eColor;
  _G.lineWidth = 1;
  _G.beginPath();
  _G.arc(ecx, ecy, eSize * 1.8, 0, Math.PI * 2);
  _G.stroke();
  _G.globalAlpha = 1;
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
}

function LV_drawDoorway(sx, sy, ts, o, t) {
  var x = sx + ts * 0.5, y = sy + ts * 0.5;
  var dir = o.doorDir || 'east';
  var pulse = 0.5 + Math.sin(t * 2) * 0.2;
  // Soft green/gold glow
  _G.save(); _G.globalAlpha = 0.25 + Math.sin(t * 1.8) * 0.1;
  var gr = _G.createRadialGradient(x, y, 0, x, y, ts * 0.55);
  gr.addColorStop(0, 'rgba(180,230,120,0.7)'); gr.addColorStop(1, 'rgba(120,180,60,0)');
  _G.fillStyle = gr; _G.beginPath(); _G.arc(x, y, ts * 0.55, 0, Math.PI * 2); _G.fill(); _G.restore();
  // Archway
  var aw = ts * 0.5, ah = ts * 0.7;
  _G.save(); _G.translate(x, y);
  if (dir === 'east' || dir === 'west') {
    _G.rotate(0);
  } else {
    _G.rotate(Math.PI / 2);
  }
  _G.strokeStyle = '#8a6830'; _G.lineWidth = ts * 0.07; _G.globalAlpha = 0.85;
  _G.beginPath();
  _G.moveTo(-aw / 2, ah / 2); _G.lineTo(-aw / 2, -ah * 0.1);
  _G.bezierCurveTo(-aw / 2, -ah * 0.35, aw / 2, -ah * 0.35, aw / 2, -ah * 0.1);
  _G.lineTo(aw / 2, ah / 2);
  _G.stroke();
  // Arrow indicator
  _G.fillStyle = '#f0d060'; _G.globalAlpha = pulse;
  var ax = dir === 'east' ? ts * 0.12 : dir === 'west' ? -ts * 0.12 : 0;
  var ay = dir === 'south' ? ts * 0.12 : dir === 'north' ? -ts * 0.12 : 0;
  if (dir === 'east' || dir === 'west') {
    var sign = dir === 'east' ? 1 : -1;
    _G.beginPath(); _G.moveTo(sign * ts * 0.05, -ts * 0.08); _G.lineTo(sign * ts * 0.18, 0); _G.lineTo(sign * ts * 0.05, ts * 0.08); _G.fill();
  } else {
    var sign = dir === 'south' ? 1 : -1;
    _G.beginPath(); _G.moveTo(-ts * 0.08, sign * ts * 0.05); _G.lineTo(0, sign * ts * 0.18); _G.lineTo(ts * 0.08, sign * ts * 0.05); _G.fill();
  }
  _G.restore();
  // Sparkles
  for (var sp = 0; sp < 3; sp++) {
    var sa = (sp / 3) * Math.PI * 2 + t * 1.2;
    var spx = x + Math.cos(sa) * ts * 0.35, spy = y + Math.sin(sa) * ts * 0.3;
    _G.save(); _G.globalAlpha = 0.3 + Math.sin(t * 2.5 + sp) * 0.25; _G.fillStyle = '#ffe870'; _G.beginPath(); _G.arc(spx, spy, ts * 0.02, 0, Math.PI * 2); _G.fill(); _G.restore();
  }
}

// ─── PARTY DRAWING (1:1 from reference) ─────────────────────────

function LV_drawPartyMember(px, py, ts, idx, moving, t) {
  var bob = moving ? Math.sin(t * 8 + idx * 1.2) * ts * 0.055 : 0;
  var tilt = moving ? Math.sin(t * 8 + idx * 1.2) * 0.035 : 0;
  var stepStretch = moving ? 1 + Math.abs(Math.sin(t * 8)) * 0.02 : 1;
  if (_heroCanvases && _heroCanvases[idx]) {
    var hcv = _heroCanvases[idx]; var hsc = ts * 1.1 / hcv.width; var hw = hcv.width * hsc, hh = hcv.height * hsc;
    _G.save();
    _G.translate(px, py - hh * 0.82 + bob + hh / 2);
    _G.rotate(tilt);
    _G.scale(1, stepStretch);
    _G.drawImage(hcv, -hw / 2, -hh / 2, hw, hh);
    _G.restore();
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
  mg.fillStyle = _fogColorMinimapBg; mg.fillRect(0, 0, mc.width, mc.height);
  for (var my = 0; my < _ROWS; my++) for (var mx = 0; mx < _COLS; mx++) {
    if (!_fog[my][mx]) { mg.fillStyle = _fogColorMinimap; mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5); continue; }
    var t2 = _map[my][mx];
    mg.fillStyle = t2 === LV_TW ? '#3c6b4f' : t2 === LV_TP ? '#e8dec6' : t2 === LV_TQ ? '#44888a' : '#d9cfb2';
    mg.fillRect(mx * cs, my * cs, cs + 0.5, cs + 0.5);
  }
  // Only landmark objects on the minimap — boss, exit, gold chest.
  // Plotting every item made the map an unreadable dot cloud.
  for (var oi2 = 0; oi2 < _objs.length; oi2++) {
    var o2 = _objs[oi2]; if (_gs.dead[o2.id]) continue;
    if (!_fog[o2.ty] || !_fog[o2.ty][o2.tx]) continue;
    var dc = null;
    if (o2.type === 'boss' && o2.alive) dc = '#d06a4d';
    else if (o2.type === 'exit' && o2.visible) dc = '#ecb964';
    else if (o2.type === 'chestG') dc = '#e39a4a';
    if (!dc) continue;
    mg.fillStyle = dc; mg.beginPath(); mg.arc((o2.tx + 0.5) * cs, (o2.ty + 0.5) * cs, cs * 1.1, 0, Math.PI * 2); mg.fill();
  }
  var ppx = (_party.x / LV_TILE) * cs, ppy = (_party.y / LV_TILE) * cs;
  mg.fillStyle = '#f5eedd'; mg.beginPath(); mg.arc(ppx, ppy, cs * 1.3, 0, Math.PI * 2); mg.fill();
  mg.fillStyle = '#44888a'; mg.beginPath(); mg.arc(ppx, ppy, cs * 0.7, 0, Math.PI * 2); mg.fill();
  mg.strokeStyle = 'rgba(245,238,221,0.5)'; mg.lineWidth = 1.5; mg.strokeRect(0, 0, mc.width, mc.height);
  // Blit minimap onto main canvas — top-LEFT, small, away from the
  // settings button which lives top-right.
  var mmSize = Math.min(_W, _H) * 0.13;
  var mmX = 12, mmY = 12;
  _G.save(); _G.globalAlpha = 0.88;
  _G.drawImage(mc, mmX, mmY, mmSize, mmSize);
  _G.restore();
}

// ─── MAIN DRAW (1:1 from reference) ────────────────────────────

// ═══════════════════════════════════════════════════════════════
// PAPERCUT ART LAYER — the level remaster.
//
// Terrain is no longer drawn tile-by-tile (which read as an Atari
// grid). Instead the whole level is painted ONCE, in world space,
// as ORGANIC REGIONS: every wall/water/path mass is a union of
// overlapping, jittered round blobs — adjacent tiles melt into one
// flowing hand-cut shape with no seams — stacked in papercut layers
// (drop shadow → dark base → lighter inset → crown decor), sitting
// on a torn-paper island over a soft backdrop, exactly like the
// reference art. Per frame the result is a single drawImage blit,
// which is also far cheaper than redrawing every tile.
// ═══════════════════════════════════════════════════════════════

var ART_MARGIN = 96;
var _artCanvas = null, _artG = null;
// Transparent canvas holding ONLY the wall art (faces/masses/crowns).
// The hero-behind-walls foreground pass copies from THIS, so square
// copy regions can never drag backdrop pixels along (the pale-boxes
// bug from copying off the full composite).
var _wallsArtCanvas = null, _wallsArtG = null;
var _artBackdrop = '#182e33';

var _ART_THEMES = {
  1: { // The Garden — sunlit, fresh, reference-matched
    bg: '#dfe7cd', paperEdge: '#f5eedd', paper: '#e9dfc2',
    ground: '#a3c47f', groundTone: '#93b871', stipple: '#7fa85f',
    path: '#e6d7ae', pebble: '#cbb98c', pebbleHi: '#efe4c4',
    wallShadow: 'rgba(30,48,28,0.35)', wallDark: '#2f6136', wallMid: '#458d4c', crown: '#63ad64', crownHi: '#82c47b',
    face: '#234f2a', faceHi: '#38703f',
    flowers: ['#e07098', '#ecb964', '#a4c8d8', '#f2f0a0'],
    water: ['#2a5d74', '#3d84a0', '#7fc4d8', '#e0f2ee'],
  },
  2: { bg: '#12262e', paperEdge: '#d8e4dc', paper: '#c3d6c9', ground: '#7fae9b', groundTone: '#6fa28e', stipple: '#5e9480',
    path: '#dccfa8', pebble: '#b7a888', pebbleHi: '#e6dcc0', wallShadow: 'rgba(10,28,32,0.4)', wallDark: '#1e4a52', wallMid: '#2f6b74', crown: '#44909a', crownHi: '#63b3ba',
    face: '#153840', faceHi: '#255661', flowers: ['#e78f6c', '#ecb964', '#a4c8d8'], water: ['#183f58', '#2a6485', '#5aa3c0', '#cfeef0'] },
  3: { bg: '#26323e', paperEdge: '#e8ecf2', paper: '#d3dbe6', ground: '#9fb4cd', groundTone: '#8fa6c2', stipple: '#7e97b5',
    path: '#e8e2d2', pebble: '#c3bda9', pebbleHi: '#f2eee0', wallShadow: 'rgba(30,38,52,0.4)', wallDark: '#546a86', wallMid: '#71889f', crown: '#8fa3bb', crownHi: '#b3c3d6', face: '#41546e', faceHi: '#5d7290',
    flowers: ['#f2f0a0', '#e07098', '#ffffff'], water: ['#4d6a8c', '#6c8cb0', '#9fbcd8', '#eef4fa'] },
  4: { bg: '#1a0d08', paperEdge: '#e3c9a8', paper: '#caa580', ground: '#8a5f42', groundTone: '#7b533a', stipple: '#6b4832',
    path: '#d9b184', pebble: '#a87c54', pebbleHi: '#ecd0a8', wallShadow: 'rgba(20,6,2,0.45)', wallDark: '#3d1c10', wallMid: '#5c2f1a', crown: '#7c4426', crownHi: '#a05c30', face: '#2a1208', faceHi: '#46220f',
    flowers: ['#e39a4a', '#ecb964', '#d06a4d'], water: ['#7c2810', '#b8481c', '#e8762e', '#ffd080'] },
  5: { bg: '#15242c', paperEdge: '#e9f2f5', paper: '#d3e4ea', ground: '#a8ccd6', groundTone: '#97bfcb', stipple: '#86b2c0',
    path: '#e8e8e0', pebble: '#bccfd4', pebbleHi: '#f4f8f8', wallShadow: 'rgba(12,30,38,0.4)', wallDark: '#2b5a68', wallMid: '#3f7d8e', crown: '#5aa1b2', crownHi: '#83c3d0', face: '#1e4450', faceHi: '#316475',
    flowers: ['#a4c8d8', '#ffffff', '#9c8fc0'], water: ['#1f4a5e', '#337690', '#63aec6', '#e4f6f8'] },
  6: { bg: '#170d26', paperEdge: '#e2d5ee', paper: '#c9b8dd', ground: '#9d8abc', groundTone: '#8f7bb0', stipple: '#806fa3',
    path: '#ded2ea', pebble: '#ab97c6', pebbleHi: '#efe6f8', wallShadow: 'rgba(20,8,36,0.45)', wallDark: '#3c2260', wallMid: '#55357f', crown: '#71499e', crownHi: '#9468bf', face: '#2b1548', faceHi: '#452a68',
    flowers: ['#ecb964', '#e07098', '#a4c8d8'], water: ['#472a6e', '#654093', '#8f66bb', '#e8daf6'] },
  7: { bg: '#251c10', paperEdge: '#f0e4c8', paper: '#e0cda3', ground: '#c3a878', groundTone: '#b69c6e', stipple: '#a88e60',
    path: '#ecdebc', pebble: '#c3ac83', pebbleHi: '#f6ecd4', wallShadow: 'rgba(30,22,8,0.4)', wallDark: '#5c4423', wallMid: '#7c5e33', crown: '#9c7843', crownHi: '#bd9758', face: '#443218', faceHi: '#644b26',
    flowers: ['#d06a4d', '#ecb964', '#3c6b4f'], water: ['#4d5c30', '#6c7c44', '#95a562', '#e8eecb'] },
  8: { bg: '#160f08', paperEdge: '#e8dcc4', paper: '#d4c2a0', ground: '#a08a68', groundTone: '#93805f', stipple: '#857356',
    path: '#dcd0b4', pebble: '#ab9878', pebbleHi: '#ece0c8', wallShadow: 'rgba(18,12,4,0.45)', wallDark: '#3f2c16', wallMid: '#5c4222', crown: '#7a592e', crownHi: '#9b763c', face: '#2c1e0e', faceHi: '#48321a',
    flowers: ['#ecb964', '#d06a4d', '#7d9f6d'], water: ['#3d3320', '#5c4e2e', '#847246', '#e2d8b4'] },
  9: { bg: '#0d081a', paperEdge: '#d9d0e8', paper: '#bcb0d4', ground: '#8d81ad', groundTone: '#8074a2', stipple: '#726695',
    path: '#d2c9e2', pebble: '#a195bd', pebbleHi: '#e8e2f2', wallShadow: 'rgba(10,4,24,0.5)', wallDark: '#2a1c4e', wallMid: '#3e2c6b', crown: '#553f8a', crownHi: '#7157ab', face: '#1c1038', faceHi: '#312050',
    flowers: ['#ecb964', '#e07098', '#a4c8d8'], water: ['#1c1240', '#2f2260', '#4c3a88', '#d6ccf0'] },
};

// One union-of-blobs pass over a set of cells. r0 ≥ 0.72 guarantees
// adjacent-tile blobs overlap, so contiguous regions read as one mass.
function artBlobs(g, cells, T, r0, jseed, color, dx, dy) {
  g.fillStyle = color;
  g.beginPath();
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var rr = mkRng(c[0] * 131 + c[1] * 173 + jseed);
    var cx = ART_MARGIN + (c[0] + 0.5) * T + (rr() - 0.5) * T * 0.2 + (dx || 0);
    var cy = ART_MARGIN + (c[1] + 0.5) * T + (rr() - 0.5) * T * 0.2 + (dy || 0);
    var rad = T * r0 * (0.88 + rr() * 0.28);
    g.moveTo(cx + rad, cy);
    g.arc(cx, cy, rad, 0, Math.PI * 2);
  }
  g.fill();
}

function LV_buildArtLayer() {
  var T = LV_TILE;
  var P = _ART_THEMES[_floorTheme] || _ART_THEMES[1];
  _artBackdrop = P.bg;
  var aw = _COLS * T + ART_MARGIN * 2, ah = _ROWS * T + ART_MARGIN * 2;
  if (!_artCanvas || _artCanvas.width !== aw || _artCanvas.height !== ah) {
    _artCanvas = document.createElement('canvas');
    _artCanvas.width = aw; _artCanvas.height = ah;
    _artG = _artCanvas.getContext('2d');
  }
  var g = _artG;
  g.clearRect(0, 0, aw, ah);

  // Bucket the map once
  var all = [], walls = [], waters = [], floors = [], paths = [], crownCells = [], faceCells = [];
  for (var y = 0; y < _ROWS; y++) for (var x = 0; x < _COLS; x++) {
    var tt = _map[y][x];
    var cell = [x, y];
    all.push(cell);
    if (tt === LV_TW || tt === LV_TS) {
      walls.push(cell);
      if (y === 0 || (_map[y - 1][x] !== LV_TW && _map[y - 1][x] !== LV_TS)) crownCells.push(cell);
      if (y === _ROWS - 1 || (_map[y + 1][x] !== LV_TW && _map[y + 1][x] !== LV_TS)) faceCells.push(cell);
    } else if (tt === LV_TQ) waters.push(cell);
    else if (tt === LV_TP) paths.push(cell);
    else floors.push(cell);
  }

  // 1. Torn-paper island: deckled cream edge, then parchment sheet —
  //    the whole level sits as one organic papercut island.
  artBlobs(g, all, T, 0.92, 11, 'rgba(20,30,30,0.28)', 7, 11);   // island drop shadow
  artBlobs(g, all, T, 0.90, 12, P.paperEdge, 0, 0);
  artBlobs(g, all, T, 0.80, 13, P.paper, 0, 0);

  // 2. Ground wash over the walkable interior
  var walkable = floors.concat(paths, waters);
  artBlobs(g, walkable, T, 0.72, 21, P.ground, 0, 0);
  // tonal variation — sparse darker patches melt the flatness
  var toned = floors.filter(function (c) { return mkRng(c[0] * 7 + c[1] * 13 + 31)() < 0.4; });
  artBlobs(g, toned, T, 0.5, 22, P.groundTone, 0, 0);
  // Sun-dapple pools — large soft warm light patches (the focal light
  // every reference composition carries)
  var dappled = floors.filter(function (c) { return mkRng(c[0] * 19 + c[1] * 23 + 77)() < 0.08; });
  for (var di2 = 0; di2 < dappled.length; di2++) {
    var dpc = dappled[di2];
    var dcx = ART_MARGIN + (dpc[0] + 0.5) * T, dcy = ART_MARGIN + (dpc[1] + 0.5) * T;
    for (var dr2 = 3; dr2 >= 1; dr2--) {
      g.fillStyle = 'rgba(246,234,186,' + (0.05 * (4 - dr2)).toFixed(3) + ')';
      g.beginPath(); g.arc(dcx, dcy, T * 0.7 * dr2, 0, Math.PI * 2); g.fill();
    }
  }

  // 3. Paths — a flowing sand ribbon with hand-laid pebbles
  artBlobs(g, paths, T, 0.58, 31, 'rgba(30,40,30,0.18)', 3, 5);
  artBlobs(g, paths, T, 0.56, 32, P.path, 0, 0);
  for (var pi = 0; pi < paths.length; pi++) {
    var pc = paths[pi];
    var pr = mkRng(pc[0] * 37 + pc[1] * 59 + 41);
    for (var st = 0; st < 3; st++) {
      var px = ART_MARGIN + pc[0] * T + T * (0.2 + pr() * 0.6);
      var py = ART_MARGIN + pc[1] * T + T * (0.2 + pr() * 0.6);
      var prx = T * (0.1 + pr() * 0.08), pry = prx * (0.65 + pr() * 0.25);
      g.fillStyle = 'rgba(30,40,30,0.15)';
      g.beginPath(); g.ellipse(px + 1.5, py + 2.5, prx, pry, pr() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = pr() < 0.4 ? P.pebbleHi : P.pebble;
      g.beginPath(); g.ellipse(px, py, prx, pry, pr() * 3, 0, Math.PI * 2); g.fill();
    }
  }

  // 4. Water — layered papercut ponds (each ring a deeper sheet)
  artBlobs(g, waters, T, 0.72, 51, 'rgba(10,24,30,0.35)', 4, 7);
  artBlobs(g, waters, T, 0.70, 52, P.water[0], 0, 0);
  artBlobs(g, waters, T, 0.52, 53, P.water[1], 0, -2);
  artBlobs(g, waters, T, 0.34, 54, P.water[2], 0, -3);
  var waterSpark = waters.filter(function (c) { return mkRng(c[0] * 11 + c[1] * 17 + 55)() < 0.5; });
  artBlobs(g, waterSpark, T, 0.10, 56, P.water[3], 0, -4);
  // Lace highlight along each pond's top edge — thin cream arcs
  for (var wl = 0; wl < waters.length; wl++) {
    var wc = waters[wl];
    var northWater = waters.some(function (o) { return o[0] === wc[0] && o[1] === wc[1] - 1; });
    if (northWater) continue;
    var wx0 = ART_MARGIN + wc[0] * T, wy0 = ART_MARGIN + wc[1] * T;
    var wr2 = mkRng(wc[0] * 3 + wc[1] * 5 + 99);
    g.strokeStyle = 'rgba(240,250,246,0.5)';
    g.lineWidth = T * 0.045;
    g.beginPath();
    g.moveTo(wx0 + T * 0.12, wy0 + T * 0.3);
    g.quadraticCurveTo(wx0 + T * 0.5, wy0 + T * (0.16 + wr2() * 0.1), wx0 + T * 0.88, wy0 + T * 0.3);
    g.stroke();
  }

  // 5. Walls — the big papercut masses.
  //    South faces first (they hang below), then base, inset, crowns.
  //    PAINTED INTO A TRANSPARENT WALLS-ONLY CANVAS, then composited
  //    onto the main art — the foreground (hero-behind-walls) pass
  //    copies from the walls-only canvas so it can never drag backdrop
  //    pixels along inside its square copy regions.
  if (!_wallsArtCanvas || _wallsArtCanvas.width !== aw || _wallsArtCanvas.height !== ah) {
    _wallsArtCanvas = document.createElement('canvas');
    _wallsArtCanvas.width = aw; _wallsArtCanvas.height = ah;
    _wallsArtG = _wallsArtCanvas.getContext('2d');
  }
  _wallsArtG.clearRect(0, 0, aw, ah);
  var _mainArtG = g;
  g = _wallsArtG; // wall sections below draw into the transparent layer
  var wallH = T * MAZE_PERSPECTIVE.heightFactor;
  for (var fi = 0; fi < faceCells.length; fi++) {
    var fc = faceCells[fi];
    var fx0 = ART_MARGIN + fc[0] * T, fy0 = ART_MARGIN + (fc[1] + 1) * T - T * 0.18;
    var fr = mkRng(fc[0] * 43 + fc[1] * 67 + 61);
    g.fillStyle = P.face;
    g.beginPath();
    g.moveTo(fx0 - 2, fy0);
    g.lineTo(fx0 + T + 2, fy0);
    g.lineTo(fx0 + T + (fr() - 0.5) * 4, fy0 + wallH);
    g.quadraticCurveTo(fx0 + T * 0.5, fy0 + wallH + T * 0.14, fx0 + (fr() - 0.5) * 4, fy0 + wallH);
    g.closePath(); g.fill();
    g.fillStyle = P.faceHi;
    g.beginPath();
    g.moveTo(fx0, fy0);
    g.lineTo(fx0 + T, fy0);
    g.lineTo(fx0 + T, fy0 + wallH * 0.30);
    g.lineTo(fx0, fy0 + wallH * 0.30);
    g.closePath(); g.fill();
  }
  artBlobs(g, walls, T, 0.76, 71, P.wallShadow, 6, 9);
  artBlobs(g, walls, T, 0.74, 72, P.wallDark, 0, 0);
  artBlobs(g, walls, T, 0.56, 73, P.wallMid, -1, -3);
  // Crowns: leafy silhouette clusters + flowers along exposed top edges
  for (var ci = 0; ci < crownCells.length; ci++) {
    var cc = crownCells[ci];
    var cr = mkRng(cc[0] * 53 + cc[1] * 71 + 81);
    var baseX = ART_MARGIN + cc[0] * T, baseY = ART_MARGIN + cc[1] * T;
    for (var tuft = 0; tuft < 4; tuft++) {
      var tx = baseX + T * (0.12 + tuft * 0.25 + (cr() - 0.5) * 0.1);
      var tyy = baseY + T * (0.06 + cr() * 0.16);
      var trad = T * (0.14 + cr() * 0.1);
      g.fillStyle = cr() < 0.5 ? P.crown : P.crownHi;
      g.beginPath(); g.arc(tx, tyy, trad, 0, Math.PI * 2); g.fill();
    }
    if (cr() < 0.4) {
      var fcol = P.flowers[Math.floor(cr() * P.flowers.length)];
      var flx = baseX + T * (0.2 + cr() * 0.6), fly = baseY + T * (0.05 + cr() * 0.12);
      g.fillStyle = fcol;
      for (var pet = 0; pet < 5; pet++) {
        var pa = pet * Math.PI * 2 / 5;
        g.beginPath(); g.arc(flx + Math.cos(pa) * T * 0.045, fly + Math.sin(pa) * T * 0.045, T * 0.032, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#f5e6a0';
      g.beginPath(); g.arc(flx, fly, T * 0.022, 0, Math.PI * 2); g.fill();
    }
  }

  // 5b. Interior cut-detail — leaf-vein clusters INSIDE the hedge
  // masses so big walls aren't flat fills (reference: lace-like cut
  // texture within every large sheet).
  for (var wi2 = 0; wi2 < walls.length; wi2++) {
    var wcell = walls[wi2];
    var wr3 = mkRng(wcell[0] * 41 + wcell[1] * 61 + 121);
    if (wr3() < 0.55) continue;
    var lx = ART_MARGIN + wcell[0] * T + T * (0.2 + wr3() * 0.6);
    var ly = ART_MARGIN + wcell[1] * T + T * (0.3 + wr3() * 0.45);
    g.fillStyle = 'rgba(18,30,24,0.16)';
    for (var lv2 = 0; lv2 < 3; lv2++) {
      var la = wr3() * Math.PI * 2;
      g.beginPath();
      g.ellipse(lx + Math.cos(la) * T * 0.13 * lv2, ly + Math.sin(la) * T * 0.1 * lv2,
        T * 0.09, T * 0.042, la, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Composite the wall layer onto the main art, restore main target
  g = _mainArtG;
  g.drawImage(_wallsArtCanvas, 0, 0);

  // 6. Meadow scatter on open floor: sprigs, petals, tiny blooms
  for (var si = 0; si < floors.length; si++) {
    var sc = floors[si];
    var sr = mkRng(sc[0] * 29 + sc[1] * 47 + 91);
    if (sr() < 0.28) {
      var sxp = ART_MARGIN + sc[0] * T + T * (0.15 + sr() * 0.7);
      var syp = ART_MARGIN + sc[1] * T + T * (0.15 + sr() * 0.7);
      if (sr() < 0.55) {
        g.strokeStyle = P.stipple; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(sxp, syp + 4); g.quadraticCurveTo(sxp + 2, syp - 2, sxp + 1, syp - 6); g.stroke();
        g.beginPath(); g.moveTo(sxp, syp + 4); g.quadraticCurveTo(sxp - 3, syp - 1, sxp - 4, syp - 5); g.stroke();
      } else {
        var scol = P.flowers[Math.floor(sr() * P.flowers.length)];
        g.fillStyle = scol;
        g.beginPath(); g.arc(sxp, syp, T * 0.05, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,250,220,0.9)';
        g.beginPath(); g.arc(sxp, syp, T * 0.02, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

// Animated water sparkle — the only terrain that moves per frame
function LV_drawWaterShimmer(camX, camY, ts, t) {
  for (var y = 0; y < _ROWS; y++) for (var x = 0; x < _COLS; x++) {
    if (_map[y][x] !== LV_TQ || !_fog[y] || !_fog[y][x]) continue;
    var sx = camX + x * ts, sy = camY + y * ts;
    if (sx + ts < 0 || sx > _W || sy + ts < 0 || sy > _H) continue;
    var wr = mkRng(x * 91 + y * 113);
    if (wr() < 0.45) continue;
    var ph = t * 1.4 + wr() * 6.28;
    _G.save();
    _G.globalAlpha = 0.25 + Math.sin(ph) * 0.2;
    _G.strokeStyle = '#eaf8f4';
    _G.lineWidth = ts * 0.035;
    _G.beginPath();
    var hx = sx + ts * (0.25 + wr() * 0.4), hy = sy + ts * (0.3 + wr() * 0.4) + Math.sin(ph) * ts * 0.05;
    _G.moveTo(hx, hy);
    _G.quadraticCurveTo(hx + ts * 0.14, hy - ts * 0.05, hx + ts * 0.26, hy);
    _G.stroke();
    _G.restore();
  }
}

export function LV_rebuildArtLayer() {
  if (_map) LV_buildArtLayer();
}

var _fogMaskCanvas = null, _fogMaskG = null;

function LV_draw(t) {
  var ts = LV_TILE * _SCALE;
  var camX = _W / 2 - _party.x * _SCALE, camY = _H / 2 - _party.y * _SCALE;
  // Backdrop + ONE blit of the pre-painted papercut world
  _G.fillStyle = _artBackdrop; _G.fillRect(0, 0, _W, _H);
  if (_artCanvas) {
    _G.drawImage(_artCanvas,
      camX - ART_MARGIN * _SCALE, camY - ART_MARGIN * _SCALE,
      _artCanvas.width * _SCALE, _artCanvas.height * _SCALE);
  }
  LV_drawWaterShimmer(camX, camY, ts, t);
  var sx0 = Math.max(0, Math.floor(-camX / ts) - 1), sy0 = Math.max(0, Math.floor(-camY / ts) - 1);
  var sx1 = Math.min(_COLS, sx0 + Math.ceil(_W / ts) + 3), sy1 = Math.min(_ROWS, sy0 + Math.ceil(_H / ts) + 3);
  // (legacy per-tile terrain pass removed — kept for reference below)
  if (false) for (var ty2 = sy0; ty2 < sy1; ty2++) for (var tx2 = sx0; tx2 < sx1; tx2++) {
    var scx = camX + tx2 * ts, scy = camY + ty2 * ts;
    if (scx + ts < 0 || scx > _W || scy + ts < 0 || scy > _H) continue;
    if (!_fog[ty2][tx2]) { _G.fillStyle = _fogColor; _G.fillRect(scx, scy, ts + 1, ts + 1); continue; }
    var tt2 = _map[ty2][tx2];
    _drawTile(tt2, scx, scy, ts, tx2, ty2, t);
    // 3/4 perspective: draw south-facing wall side below wall tiles
    if (tt2 === LV_TW) {
      var wallH = MAZE_PERSPECTIVE.heightFactor * ts;
      var southTop = scy + ts;
      var belowIsWall = (ty2 + 1 < _ROWS) && (_map[ty2 + 1][tx2] === LV_TW);
      if (!belowIsWall) {
        _G.save();
        var _sideCols = {
          1: ['#0c1c06', '#1a3c0e'],   // hedge dark → mid
          2: ['#122010', '#2a4a1e'],   // tidepool
          3: ['#485868', '#6a8898'],   // cloud
          4: ['#0e0402', '#2a1208'],   // ember
          5: ['#142428', '#2a4a54'],   // ice
          6: ['#1c0830', '#3a1858'],   // crystal
          7: ['#241c0c', '#4a3820'],   // market
          8: ['#0c0804', '#2a1c10'],   // library
          9: ['#08040c', '#1a1028'],   // mending
        };
        var cols = _sideCols[_floorTheme] || ['#0a0502', '#1a1208'];
        // Gradient from dark (bottom) to slightly lighter (top)
        var grad = _G.createLinearGradient(scx, southTop, scx, southTop + wallH);
        grad.addColorStop(0, cols[1]);
        grad.addColorStop(1, cols[0]);
        _G.fillStyle = grad;
        _G.fillRect(scx, southTop, ts + 1, wallH);
        // Vertical mortar lines with varied spacing
        _G.globalAlpha = 0.18;
        _G.strokeStyle = '#1f4244';
        _G.lineWidth = 0.7;
        var wr = mkRng(tx2 * 31 + ty2 * 97 + 777);
        var mortarStep = ts * 0.25;
        for (var ml = 1; ml < 4; ml++) {
          var mx = scx + ml * mortarStep + (wr() - 0.5) * 2;
          _G.beginPath();
          _G.moveTo(mx, southTop);
          _G.lineTo(mx + (wr() - 0.5) * 1.5, southTop + wallH);
          _G.stroke();
        }
        // Horizontal mortar lines
        _G.beginPath();
        _G.moveTo(scx, southTop + wallH * 0.33);
        _G.lineTo(scx + ts + 1, southTop + wallH * 0.33);
        _G.stroke();
        _G.beginPath();
        _G.moveTo(scx, southTop + wallH * 0.66);
        _G.lineTo(scx + ts + 1, southTop + wallH * 0.66);
        _G.stroke();
        _G.globalAlpha = 1;
        // Highlight edge on top of the side face
        _G.strokeStyle = 'rgba(255,255,240,0.12)';
        _G.lineWidth = 1.2;
        _G.beginPath();
        _G.moveTo(scx, southTop + 0.5);
        _G.lineTo(scx + ts + 1, southTop + 0.5);
        _G.stroke();
        // Dark edge at bottom
        _G.strokeStyle = 'rgba(0,0,0,0.25)';
        _G.lineWidth = 1;
        _G.beginPath();
        _G.moveTo(scx, southTop + wallH);
        _G.lineTo(scx + ts + 1, southTop + wallH);
        _G.stroke();
        _G.restore();
      }
    }
  }
  // Decorations: superseded by the art layer's crown/scatter passes
  if (false) for (var dy = sy0; dy < sy1; dy++) for (var dx = sx0; dx < sx1; dx++) {
    if (!_fog[dy] || !_fog[dy][dx]) continue;
    var dtt = _map[dy][dx];
    if (dtt === LV_TW || dtt === LV_TS) continue;
    var dsx = camX + dx * ts, dsy = camY + dy * ts;
    if (dsx + ts < 0 || dsx > _W || dsy + ts < 0 || dsy > _H) continue;
    var dr = mkRng(dx * 47 + dy * 83 + 555);
    var northIsWall = (dy > 0) && (_map[dy - 1][dx] === LV_TW || _map[dy - 1][dx] === LV_TS);
    if (northIsWall && dr() < 0.35) {
      var decX = dsx + ts * (0.15 + dr() * 0.7);
      var decBaseY = dsy + ts * 0.15;
      _G.save();
      if (_floorTheme <= 2) {
        // Garden/Tidepool: trees and shrubs
        _G.fillStyle = '#5a3c18';
        _G.fillRect(decX - ts * 0.02, decBaseY, ts * 0.04, ts * 0.12);
        var canR = ts * (0.08 + dr() * 0.04);
        var canopyCols = ['#2a5818', '#3a7828', '#4a8838'];
        for (var ci = 0; ci < 3; ci++) {
          _G.fillStyle = canopyCols[ci];
          _G.shadowColor = 'rgba(14,6,2,0.3)'; _G.shadowBlur = 3; _G.shadowOffsetY = 2;
          _G.beginPath();
          _G.arc(decX + (dr() - 0.5) * canR * 0.6, decBaseY - ci * canR * 0.5, canR * (1 - ci * 0.15), 0, Math.PI * 2);
          _G.fill();
        }
      } else if (_floorTheme === 3) {
        // Cloud: wisps of cloud puff along edges
        _G.globalAlpha = 0.25 + dr() * 0.15;
        _G.fillStyle = '#c8d8e8';
        _G.shadowColor = 'rgba(180,200,220,0.3)'; _G.shadowBlur = 5;
        _G.beginPath();
        _G.arc(decX, decBaseY, ts * 0.07, 0, Math.PI * 2);
        _G.arc(decX + ts * 0.06, decBaseY - ts * 0.02, ts * 0.05, 0, Math.PI * 2);
        _G.fill();
      } else if (_floorTheme === 4) {
        // Ember: glowing embers and cracks
        _G.globalAlpha = 0.5 + dr() * 0.3;
        _G.fillStyle = '#e86020';
        _G.shadowColor = '#ff6030'; _G.shadowBlur = 4;
        _G.beginPath();
        _G.arc(decX, decBaseY + ts * 0.05, ts * 0.025, 0, Math.PI * 2);
        _G.fill();
        _G.strokeStyle = '#c04010'; _G.lineWidth = 0.8; _G.globalAlpha = 0.4;
        _G.beginPath();
        _G.moveTo(decX - ts * 0.06, decBaseY + ts * 0.08);
        _G.lineTo(decX + ts * 0.04, decBaseY + ts * 0.02);
        _G.stroke();
      } else if (_floorTheme === 5 || _floorTheme === 6) {
        // Ice/Crystal: icicle or crystal shard
        _G.globalAlpha = 0.5;
        _G.fillStyle = _floorTheme === 5 ? '#a0d8e8' : '#b088d0';
        _G.shadowColor = _floorTheme === 5 ? 'rgba(160,216,232,0.4)' : 'rgba(176,136,208,0.4)';
        _G.shadowBlur = 3;
        _G.beginPath();
        _G.moveTo(decX - ts * 0.015, decBaseY + ts * 0.15);
        _G.lineTo(decX, decBaseY - ts * 0.02);
        _G.lineTo(decX + ts * 0.015, decBaseY + ts * 0.15);
        _G.fill();
      } else if (_floorTheme >= 7) {
        // Market/Library/Mending: lantern or candle
        _G.globalAlpha = 0.6;
        _G.fillStyle = '#8a7050';
        _G.fillRect(decX - 1, decBaseY + ts * 0.02, 2, ts * 0.06);
        _G.fillStyle = '#f0c040';
        _G.shadowColor = '#f0c040'; _G.shadowBlur = 4;
        _G.beginPath();
        _G.arc(decX, decBaseY, ts * 0.02, 0, Math.PI * 2);
        _G.fill();
      }
      _G.restore();
    }
    // Side decorations
    var westIsWall = (dx > 0) && (_map[dy][dx - 1] === LV_TW);
    var eastIsWall = (dx + 1 < _COLS) && (_map[dy][dx + 1] === LV_TW);
    if ((westIsWall || eastIsWall) && dr() < 0.2) {
      var sideX = westIsWall ? dsx + ts * 0.1 : dsx + ts * 0.85;
      var sideY = dsy + ts * (0.5 + dr() * 0.3);
      _G.save();
      _G.globalAlpha = 0.6;
      if (_floorTheme <= 2) {
        // Mushroom
        _G.fillStyle = '#8a7060';
        _G.fillRect(sideX - 1, sideY, 2, ts * 0.06);
        _G.fillStyle = dr() < 0.5 ? '#c8584a' : '#d0a050';
        _G.beginPath(); _G.arc(sideX, sideY, ts * 0.03, Math.PI, 0); _G.fill();
      } else if (_floorTheme === 4) {
        // Small lava crack
        _G.strokeStyle = '#e85020'; _G.lineWidth = 1.2;
        _G.shadowColor = '#ff4010'; _G.shadowBlur = 3;
        _G.beginPath();
        _G.moveTo(sideX, sideY - ts * 0.04);
        _G.lineTo(sideX + (dr() - 0.5) * 4, sideY + ts * 0.04);
        _G.stroke();
      } else {
        // Generic: small moss/lichen dot
        _G.fillStyle = '#6a8050';
        _G.beginPath(); _G.arc(sideX, sideY, ts * 0.02, 0, Math.PI * 2); _G.fill();
      }
      _G.restore();
    }
  }
  // Objects
  for (var oi = 0; oi < _objs.length; oi++) {
    var o = _objs[oi];
    var isActivated = _gs.activated && _gs.activated[o.id];
    if ((_gs.dead[o.id] && !isActivated) || !o.alive) continue;
    if (o.type === 'exit' && !o.visible) continue;
    if (!_fog[o.ty] || !_fog[o.ty][o.tx]) continue;
    var osx = camX + o.tx * ts, osy = camY + o.ty * ts;
    if (osx + ts < 0 || osx > _W || osy + ts < 0 || osy > _H) continue;
    // Universal papercut contact shadow — grounds every item on the page
    if (o.type !== 'monster' || !o.hidden) {
      _G.save();
      _G.fillStyle = 'rgba(31,61,63,0.22)';
      _G.beginPath();
      _G.ellipse(osx + ts * 0.5, osy + ts * 0.86, ts * 0.34, ts * 0.10, 0, 0, Math.PI * 2);
      _G.fill();
      _G.restore();
    }
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
    else if (o.type === 'doorway') LV_drawDoorway(osx, osy, ts, o, t);
  }
  // Party — draw leader only (skip if external animated hero is used)
  if (!_skipCanvasHero) {
    var moving = (_party.vx !== 0 || _party.vy !== 0);
    LV_drawPartyMember(camX + _party.x * _SCALE, camY + _party.y * _SCALE, ts, 0, moving, t);
  }
  // Fog overlay — soft organic edges: a 1-pixel-per-tile mask upscaled
  // with bilinear smoothing, so the unexplored dark rolls off in a soft
  // gradient instead of hard tile squares.
  if (_fogMaskCanvas) {
    // Unexplored area = BLANK PAPER: same tone as the backdrop, so the
    // world reads as a papercut being revealed as you explore, and the
    // surround never mismatches the fogged map.
    _fogMaskG.clearRect(0, 0, _COLS, _ROWS);
    _fogMaskG.globalAlpha = 0.97;
    _fogMaskG.fillStyle = _artBackdrop;
    for (var fy2 = 0; fy2 < _ROWS; fy2++) for (var fx2 = 0; fx2 < _COLS; fx2++) {
      if (!_fog[fy2][fx2]) _fogMaskG.fillRect(fx2, fy2, 1, 1);
    }
    _fogMaskG.globalAlpha = 1;
    _G.save();
    _G.imageSmoothingEnabled = true;
    _G.drawImage(_fogMaskCanvas, camX - ts / 2, camY - ts / 2, _COLS * ts, _ROWS * ts);
    _G.restore();
  }
  // Vignette (theme-tinted)
  var vigR = Math.min(_W, _H);
  var vig = _G.createRadialGradient(_W / 2, _H / 2, vigR * 0.22, _W / 2, _H / 2, vigR * 0.68);
  var _vigTint = {
    1: 'rgba(6,18,4,', 2: 'rgba(4,12,20,', 3: 'rgba(12,16,24,',
    4: 'rgba(16,4,0,', 5: 'rgba(4,12,18,', 6: 'rgba(10,4,18,',
    7: 'rgba(12,10,4,', 8: 'rgba(6,4,2,', 9: 'rgba(4,2,8,',
  };
  var vigBase = _vigTint[_floorTheme] || 'rgba(0,0,0,';
  vig.addColorStop(0, vigBase + '0)'); vig.addColorStop(0.7, vigBase + '0.06)'); vig.addColorStop(1, vigBase + '0.22)');
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

  // Create foreground overlay canvas (for walls that render in front of hero)
  _fgCanvas = document.createElement('canvas');
  _fgCanvas.width = _W;
  _fgCanvas.height = _H;
  _fgG = _fgCanvas.getContext('2d');

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
    speed: 2.8,
    facing: 'down',
    animT: 0
  };

  // Reveal starting area
  LV_revealFog(startX, startY, 3);

  // Paint the papercut art layer (once — per-frame terrain is a blit)
  LV_buildArtLayer();

  // Low-res fog mask (1px per tile) for the soft-edge fog upscale
  _fogMaskCanvas = document.createElement('canvas');
  _fogMaskCanvas.width = _COLS;
  _fogMaskCanvas.height = _ROWS;
  _fogMaskG = _fogMaskCanvas.getContext('2d');

  // Dev/testing hook — inspect live engine state from the console when
  // the page was loaded with ?dev=...
  if (typeof window !== 'undefined' && window.location && window.location.search.includes('dev=')) {
    window.__LV = {
      party: _party,
      walkable: LV_walkable,
      tileAt: (tx, ty) => (_map[ty] ? _map[ty][tx] : undefined),
      rows: _ROWS, cols: _COLS,
    };
  }
}

/**
 * Advance simulation by one tick.
 * @param {Object} keys - Map of pressed keys (e.g. { ArrowLeft: true })
 */
export function updateLevel(keys) {
  if (typeof window !== 'undefined' && window.__LV) {
    window.__LV.calls = (window.__LV.calls || 0) + 1;
    window.__LV.lastKeys = keys;
  }
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
export function LV_setTile(tx, ty, newType) {
  if (ty >= 0 && ty < _ROWS && tx >= 0 && tx < _COLS) {
    _map[ty][tx] = newType;
  }
}

export function setSkipCanvasHero(val) { _skipCanvasHero = !!val; }
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

/**
 * Return overlay rectangles for wall tops that should render above the hero.
 * MazeScene draws these on a separate Phaser layer so the hero walks behind tall walls.
 * @param {number[][]} grid - tile grid [row][col]
 * @param {number} floorId - floor theme id
 * @returns {Array<{x:number,y:number,w:number,h:number,color:string}>}
 */
export function getWallOverlays(grid, floorId) {
  var WALL_COLOR_BY_FLOOR = {
    1: '#1a3c10', // hedge dark
    2: '#2a4818', // tidepool
    3: '#c0d8f0', // cloud
    4: '#1a0808', // ember
    5: '#304858', // ice
    6: '#381060', // crystal
    7: '#4a3818', // market
    8: '#1a1008', // library
    9: '#100818', // mending
  };
  var wallColor = WALL_COLOR_BY_FLOOR[floorId] || '#1a3c10';
  var ts = LV_TILE; // 56
  var hFactor = MAZE_PERSPECTIVE.heightFactor; // 0.4
  var overlays = [];
  for (var row = 0; row < grid.length; row++) {
    for (var col = 0; col < grid[row].length; col++) {
      if (grid[row][col] !== LV_TW) continue;
      // Only include walls whose south face is visible (tile below is not a wall)
      var belowIsWall = (row + 1 < grid.length) && (grid[row + 1][col] === LV_TW);
      if (belowIsWall) continue;
      overlays.push({
        tx: col,
        ty: row,
        x: col * ts,
        y: row * ts,
        w: ts,
        h: ts * hFactor,
        color: wallColor
      });
    }
  }
  return overlays;
}

/**
 * Draw foreground wall overlay — wall tiles and their south-face extensions
 * that are at rows >= heroRow, so they render visually in front of the hero.
 *
 * This copies pixel regions from the already-rendered main canvas onto the
 * foreground canvas, so all the complex wall rendering (bezier hedges,
 * shadows, decorations) is preserved pixel-perfectly.
 *
 * @param {number} heroRow - The hero's current tile row
 */
export function drawForeground(heroRow) {
  if (!_fgCanvas || !_fgG || !_wallsArtCanvas) return;
  _fgG.clearRect(0, 0, _W, _H);

  var camX = _W / 2 - _party.x * _SCALE;
  var camY = _H / 2 - _party.y * _SCALE;
  var T = LV_TILE;
  // Copy generous pads so crown bumps above and face extrusions below
  // the cell are included; the walls-only source is transparent
  // everywhere else, so pads can never smear backdrop or ground.
  var padT = T * 0.55, padS = T * 0.35;
  var padB = T * (MAZE_PERSPECTIVE.heightFactor + 0.45);

  for (var ty = heroRow + 1; ty < _ROWS; ty++) {
    for (var tx = 0; tx < _COLS; tx++) {
      if (!_fog[ty] || !_fog[ty][tx]) continue;
      var tt = _map[ty][tx];
      if (tt !== LV_TW && tt !== LV_TS) continue;
      var sx = ART_MARGIN + tx * T - padS;
      var sy = ART_MARGIN + ty * T - padT;
      var sw = T + padS * 2;
      var sh = T + padT + padB;
      var dxp = camX + (tx * T - padS) * _SCALE;
      var dyp = camY + (ty * T - padT) * _SCALE;
      _fgG.drawImage(_wallsArtCanvas, sx, sy, sw, sh, dxp, dyp, sw * _SCALE, sh * _SCALE);
    }
  }
}

/**
 * Return the foreground overlay canvas.
 */
export function getForegroundCanvas() {
  return _fgCanvas;
}
