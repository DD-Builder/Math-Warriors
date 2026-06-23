/**
 * Legacy Canvas 2D renderer bridge.
 *
 * Ports the two rendering systems from the v0.2 character bible
 * (makeRenderer for heroes, Rndr for monsters/bosses) so they can
 * be used inside Phaser by rendering to offscreen canvases that
 * get loaded as Phaser textures.
 *
 * Usage:
 *   import { createHeroCanvas, createMonsterCanvas, mkRng, P } from './legacyRenderer.js';
 *   const canvas = createHeroCanvas(148, 192, hero.cardBg, hero.draw, hero.topExt, hero.botExt);
 *   scene.textures.addCanvas('hero-shadow', canvas);
 *   scene.add.image(x, y, 'hero-shadow');
 */

// ─── SEEDED RNG ─────────────────────────────────────────────────
export function mkRng(seed) {
  var s = ((seed ^ 0x9e3779b9) + 0x6c62272e) >>> 0;
  return function () {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}

// ─── MASTER PALETTE (papercut — PAPER_CSS values) ───────────────
export var P = {
  cobalt: '#44888a', cobaltL: '#7fb3ae',   // teal / tealL
  plum: '#7c6fa8', plumL: '#9c8fc0',       // lavenderD / lavender
  rose: '#d06a4d', roseL: '#e78f6c',       // coralD / coral
  gold: '#e39a4a', goldL: '#ecb964',       // orange / gold
  green: '#3c6b4f', greenL: '#7d9f6d',     // forest / leaf
  cream: '#f5eedd', ink: '#1f4244',        // cream / inkTeal
};

// ─── HERO RENDERER (makeRenderer) ───────────────────────────────
export function makeRenderer(canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  function clear(color) {
    ctx.clearRect(0, 0, W, H);
    if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }
  }

  function wobblePts(pts, seed, sx, sy, sp) {
    sx = sx || 2; sy = sy || 2; sp = sp || 10;
    var r = mkRng(seed * 137 + 7);
    var result = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      result.push([a[0] + (r() - 0.5) * sx, a[1] + (r() - 0.5) * sy]);
      var steps = Math.max(1, Math.round(sp / pts.length));
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        result.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * sx * 0.6,
                     a[1] + (b[1] - a[1]) * t + (r() - 0.5) * sy * 0.6]);
      }
    }
    return result;
  }

  function L(pts, color, seed, opts) {
    if (R._seedFilter && !R._seedFilter.has(seed)) return;
    opts = opts || {};
    ctx.save();
    if (!opts.ns) {
      var sa = opts.sa !== undefined ? opts.sa : 0.45;
      ctx.shadowColor = 'rgba(31,61,63,' + sa + ')';
      ctx.shadowBlur = (opts.sx || 2) * 2.2;
      ctx.shadowOffsetX = (opts.sx || 2) * 0.25;
      ctx.shadowOffsetY = (opts.sy || 2) * 1.1;
    }
    ctx.fillStyle = color; ctx.beginPath();
    var wp = opts.ns ? pts : wobblePts(pts, seed, opts.sx, opts.sy, opts.sp);
    ctx.moveTo(wp[0][0], wp[0][1]);
    for (var i = 1; i < wp.length; i++) ctx.lineTo(wp[i][0], wp[i][1]);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function Ld(cx, cy, radius, color, seed, opts) {
    if (R._seedFilter && !R._seedFilter.has(seed)) return;
    opts = opts || {};
    if (opts.ns) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    var sp = opts.sp || 12, pts = [], r2 = mkRng(seed * 91 + 13);
    for (var i = 0; i < sp; i++) {
      var angle = (i / sp) * Math.PI * 2;
      var wobR = radius * (1 + (r2() - 0.5) * 0.18 * ((opts.sx || 2) / 3));
      pts.push([cx + Math.cos(angle) * wobR, cy + Math.sin(angle) * wobR]);
    }
    ctx.save();
    var sa = opts.sa !== undefined ? opts.sa : 0.4;
    ctx.shadowColor = 'rgba(31,61,63,' + sa + ')';
    ctx.shadowBlur = (opts.sx || 2) * 2;
    ctx.shadowOffsetX = (opts.sx || 2) * 0.2;
    ctx.shadowOffsetY = (opts.sy || 2) * 0.9;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function glow(cx, cy, radius, blur, color, alpha, spread) {
    ctx.save();
    var sr = radius + (spread || 0);
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr);
    var r2 = parseInt(color.slice(1, 3), 16);
    var g2 = parseInt(color.slice(3, 5), 16);
    var b2 = parseInt(color.slice(5, 7), 16);
    grad.addColorStop(0, 'rgba(' + r2 + ',' + g2 + ',' + b2 + ',' + alpha + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  var R = {
    _seedFilter: null,
    G: ctx, L: L, Ld: Ld,
    Lr: function (x, y, w, h, color, seed, opts) {
      if (R._seedFilter && !R._seedFilter.has(seed)) return;
      L([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, seed, opts);
    },
    glow: glow, clear: clear,
    setSeedFilter: function (allowedSeeds) {
      R._seedFilter = allowedSeeds ? new Set(allowedSeeds) : null;
    },
  };
  return R;
}

// ─── MONSTER/BOSS RENDERER (Rndr) ───────────────────────────────
export function Rndr(cv) {
  this.cv = cv;
  this.G = cv.getContext('2d');
  this.W = cv.width;
  this.H = cv.height;
}

Rndr.prototype = {
  clear: function (c) {
    var G = this.G;
    G.clearRect(0, 0, this.W, this.H);
    if (c) { G.fillStyle = c; G.fillRect(0, 0, this.W, this.H); }
  },

  _path: function (pts, seed) {
    var G = this.G, r = mkRng(seed || 1);
    G.beginPath();
    G.moveTo(pts[0][0] + (r() - .5) * .9, pts[0][1] + (r() - .5) * .9);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], pp = pts[i - 1];
      var cx = (pp[0] + p[0]) / 2 + (r() - .5) * .7;
      var cy = (pp[1] + p[1]) / 2 + (r() - .5) * .7;
      G.quadraticCurveTo(cx, cy, p[0] + (r() - .5) * .9, p[1] + (r() - .5) * .9);
    }
    G.closePath();
  },

  _bb: function (pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i][0]); y0 = Math.min(y0, pts[i][1]);
      x1 = Math.max(x1, pts[i][0]); y1 = Math.max(y1, pts[i][1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  },

  L: function (pts, col, seed, o) {
    o = o || {};
    var G = this.G;
    var sx = o.sx !== undefined ? o.sx : 3, sy = o.sy !== undefined ? o.sy : 5;
    var sp = o.sp !== undefined ? o.sp : 18, sa = o.sa !== undefined ? o.sa : .36;
    var b = this._bb(pts);
    if (!o.ns) {
      G.save(); G.translate(sx, sy); this._path(pts, seed);
      var gr = G.createLinearGradient(b.x - sp * .3, b.y - sp * .3, b.x + b.w + sp * .6, b.y + b.h + sp * .6);
      gr.addColorStop(0, 'rgba(31,61,63,0)');
      gr.addColorStop(.18, 'rgba(31,61,63,' + sa + ')');
      gr.addColorStop(.72, 'rgba(31,61,63,' + sa + ')');
      gr.addColorStop(1, 'rgba(31,61,63,0)');
      G.fillStyle = gr; G.fill(); G.restore();
    }
    this._path(pts, seed); G.fillStyle = col; G.fill();
  },

  Ld: function (cx, cy, r, col, seed, o) {
    var p = [], n = 22;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 - Math.PI / 2;
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.L(p, col, seed, o);
  },

  ellipse: function (cx, cy, rx, ry, col, seed, o) {
    var p = [], n = 22;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 - Math.PI / 2;
      p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    this.L(p, col, seed, o);
  },

  glow: function (cx, cy, rx, ry, col, alpha, blur) {
    var G = this.G;
    G.save(); G.filter = 'blur(' + blur + 'px)'; G.globalAlpha = alpha;
    G.fillStyle = col; G.beginPath();
    G.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); G.fill(); G.restore();
  },

  gshadow: function (cx, cy, rx, ry) {
    var G = this.G;
    G.save(); G.filter = 'blur(14px)'; G.globalAlpha = .3;
    G.fillStyle = 'rgba(31,61,63,.9)'; G.beginPath();
    G.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); G.fill(); G.restore();
  },

  stroke: function (x0, y0, x1, y1, col, w, a) {
    var G = this.G;
    G.save(); G.strokeStyle = col; G.lineWidth = w || 1.5; G.globalAlpha = a || .5;
    G.beginPath(); G.moveTo(x0, y0); G.lineTo(x1, y1); G.stroke(); G.restore();
  },

  shadow: function (cx, cy, rx, ry) { this.gshadow(cx, cy, rx, ry); },
  mkpath: function (pts, seed) { this._path(pts, seed); },
  Lc: function (cx, cy, r, col, seed, o) { this.Ld(cx, cy, r, col, seed, o); },
  Le: function (cx, cy, rx, ry, col, seed, o) { this.ellipse(cx, cy, rx, ry, col, seed, o); },
  ln: function (x0, y0, x1, y1, col, w, a) { this.stroke(x0, y0, x1, y1, col, w, a); },
};

// ─── CONVENIENCE: Create hero canvas ────────────────────────────
export function createHeroCanvas(w, h, bgColor, drawFn, topExt, botExt) {
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var R = makeRenderer(cv);
  if (bgColor) {
    R.clear(bgColor);
    var ctx = cv.getContext('2d');
    var vg = ctx.createRadialGradient(w * .5, h * .4, h * .04, w * .5, h * .4, h * .88);
    vg.addColorStop(0, 'rgba(253,251,242,0.16)');   // warm paper-white center
    vg.addColorStop(1, 'rgba(217,207,178,0.28)');   // soft sand-cream edge
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  } else {
    R.clear();
  }
  var te = topExt || 80, be = botExt || 78;
  var sc = (h - 14) / (te + be) * 0.89;
  try { drawFn(R, w * .5, 7 + te * sc, sc); } catch (e) { /* ignore draw errors */ }
  return cv;
}

// ─── CONVENIENCE: Create hero body-part canvas ─────────────────
export function createHeroPartCanvas(w, h, drawFn, topExt, botExt, allowedSeeds) {
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var R = makeRenderer(cv);
  R.setSeedFilter(allowedSeeds);
  var te = topExt || 60, be = botExt || 60;
  var sc = (h - 14) / (te + be) * 0.89;
  R.G.save();
  R.G.translate(w * 0.5, 7 + te * sc);
  R.G.scale(sc, sc);
  try { drawFn(R, 0, 0, 1); } catch (e) { /* ignore draw errors */ }
  R.G.restore();
  R.setSeedFilter(null);
  return cv;
}

export function createHeroPartCanvasClipped(w, h, drawFn, topExt, botExt, allowedSeeds, clipFraction, clipAbove) {
  var full = createHeroPartCanvas(w, h, drawFn, topExt, botExt, allowedSeeds);
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d');
  var clipY = Math.round(h * clipFraction);
  if (clipAbove) {
    ctx.drawImage(full, 0, 0, w, clipY, 0, 0, w, clipY);
  } else {
    ctx.drawImage(full, 0, clipY, w, h - clipY, 0, clipY, w, h - clipY);
  }
  return cv;
}

// ─── CONVENIENCE: Create monster canvas ─────────────────────────
export function createMonsterCanvas(size, bgColor, drawFn, t) {
  var cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  var R = new Rndr(cv);
  R.clear(bgColor || null);
  // Translate to center so draw functions work at origin
  var G = cv.getContext('2d');
  var drawScale = size / 160;
  G.save(); G.translate(size / 2, size / 2); G.scale(drawScale, drawScale);
  try { drawFn(R, t || 0); } catch (e) { /* ignore */ }
  G.restore();
  return cv;
}

// ─── OPERATOR SYMBOL DRAW HELPER ────────────────────────────────
function drawOpSym(G, cx, cy, op, sz, col, alpha) {
  G.save(); G.fillStyle = col; G.strokeStyle = col;
  G.globalAlpha = alpha || 1; G.lineWidth = sz * 0.3; G.lineCap = 'round';
  if (op === '+') {
    G.beginPath(); G.moveTo(cx - sz, cy); G.lineTo(cx + sz, cy); G.stroke();
    G.beginPath(); G.moveTo(cx, cy - sz); G.lineTo(cx, cy + sz); G.stroke();
  } else if (op === '-') {
    G.beginPath(); G.moveTo(cx - sz, cy); G.lineTo(cx + sz, cy); G.stroke();
  } else if (op === '*' || op === '×') {
    G.beginPath(); G.moveTo(cx - sz * .7, cy - sz * .7); G.lineTo(cx + sz * .7, cy + sz * .7); G.stroke();
    G.beginPath(); G.moveTo(cx + sz * .7, cy - sz * .7); G.lineTo(cx - sz * .7, cy + sz * .7); G.stroke();
  } else if (op === '/' || op === '÷') {
    G.beginPath(); G.moveTo(cx - sz, cy); G.lineTo(cx + sz, cy); G.stroke();
    G.beginPath(); G.arc(cx, cy - sz * .7, sz * .25, 0, Math.PI * 2); G.fill();
    G.beginPath(); G.arc(cx, cy + sz * .7, sz * .25, 0, Math.PI * 2); G.fill();
  } else if (op === '?') {
    G.font = 'bold ' + (sz * 2.5) + 'px serif'; G.textAlign = 'center'; G.textBaseline = 'middle';
    G.fillText('?', cx, cy);
  } else if (op === '=') {
    G.beginPath(); G.moveTo(cx - sz, cy - sz * .35); G.lineTo(cx + sz, cy - sz * .35); G.stroke();
    G.beginPath(); G.moveTo(cx - sz, cy + sz * .35); G.lineTo(cx + sz, cy + sz * .35); G.stroke();
  }
  G.restore();
}
