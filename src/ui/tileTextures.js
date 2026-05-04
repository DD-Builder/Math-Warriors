/**
 * Tile texture factory — pre-renders rich Canvas 2D tile art per floor theme.
 *
 * Creates offscreen canvases for wall/floor/path/water tiles with organic
 * detail (stone edges, grass tufts, cobblestone lines, water shimmer) and
 * loads them as Phaser textures. Each floor gets a unique visual identity.
 */

import { mkRng } from './legacyRenderer.js';

const TILE_CACHE = {};

function hexToRgb(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return { r, g, b };
}

function rgbStr(r, g, b, a) {
  return a !== undefined
    ? 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
    : 'rgb(' + r + ',' + g + ',' + b + ')';
}

function lighter(hex, amt) {
  const c = hexToRgb(hex);
  return rgbStr(
    Math.min(255, c.r + amt),
    Math.min(255, c.g + amt),
    Math.min(255, c.b + amt)
  );
}

function darker(hex, amt) {
  const c = hexToRgb(hex);
  return rgbStr(
    Math.max(0, c.r - amt),
    Math.max(0, c.g - amt),
    Math.max(0, c.b - amt)
  );
}

function toCSS(hex) {
  const c = hexToRgb(hex);
  return rgbStr(c.r, c.g, c.b);
}

function makeTileCanvas(size, drawFn, seed) {
  var cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  var G = cv.getContext('2d');
  drawFn(G, size, seed);
  return cv;
}

function drawGardenWall(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#1a3810';
  G.fillRect(0, 0, s, s);
  // Hedge texture — layered circles
  for (var i = 0; i < 6; i++) {
    var x = rng() * s, y = rng() * s, r = s * 0.2 + rng() * s * 0.15;
    G.fillStyle = 'rgba(30,' + (60 + Math.floor(rng() * 40)) + ',16,' + (0.5 + rng() * 0.3) + ')';
    G.beginPath(); G.arc(x, y, r, 0, Math.PI * 2); G.fill();
  }
  // Highlight blobs
  for (var j = 0; j < 3; j++) {
    G.fillStyle = 'rgba(50,' + (90 + Math.floor(rng() * 30)) + ',28,0.3)';
    G.beginPath(); G.arc(rng() * s, rng() * s, s * 0.1 + rng() * s * 0.08, 0, Math.PI * 2); G.fill();
  }
  // Dark edge for depth
  G.strokeStyle = 'rgba(10,20,6,0.4)';
  G.lineWidth = 2;
  G.strokeRect(1, 1, s - 2, s - 2);
}

function drawGardenFloor(G, s, seed) {
  var rng = mkRng(seed);
  var c = hexToRgb(0x3a7028);
  G.fillStyle = rgbStr(c.r + (rng() - 0.5) * 12, c.g + (rng() - 0.5) * 12, c.b + (rng() - 0.5) * 8);
  G.fillRect(0, 0, s, s);
  // Grass texture — tiny strokes
  for (var i = 0; i < 8; i++) {
    var x = rng() * s, y = rng() * s;
    G.strokeStyle = 'rgba(60,' + (100 + Math.floor(rng() * 40)) + ',30,' + (0.3 + rng() * 0.2) + ')';
    G.lineWidth = 1;
    G.beginPath(); G.moveTo(x, y); G.lineTo(x + (rng() - 0.5) * 6, y - 3 - rng() * 5); G.stroke();
  }
  // Occasional flower
  if (rng() > 0.7) {
    var fx = s * 0.2 + rng() * s * 0.6, fy = s * 0.2 + rng() * s * 0.6;
    var colors = ['#e06080', '#f0c040', '#a0d0f0', '#e080c0'];
    G.fillStyle = colors[Math.floor(rng() * colors.length)];
    G.beginPath(); G.arc(fx, fy, 2.5, 0, Math.PI * 2); G.fill();
    G.fillStyle = '#f0f080';
    G.beginPath(); G.arc(fx, fy, 1.2, 0, Math.PI * 2); G.fill();
  }
}

function drawGardenPath(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#7a5c28';
  G.fillRect(0, 0, s, s);
  // Cobblestone bumps
  for (var i = 0; i < 5; i++) {
    var x = rng() * s, y = rng() * s, r = 3 + rng() * 5;
    G.fillStyle = 'rgba(' + (120 + Math.floor(rng() * 30)) + ',' + (90 + Math.floor(rng() * 20)) + ',40,' + (0.3 + rng() * 0.25) + ')';
    G.beginPath(); G.arc(x, y, r, 0, Math.PI * 2); G.fill();
  }
  // Mortar lines
  G.strokeStyle = 'rgba(60,40,15,0.25)';
  G.lineWidth = 0.8;
  for (var j = 0; j < 3; j++) {
    G.beginPath(); G.moveTo(0, rng() * s); G.lineTo(s, rng() * s); G.stroke();
  }
}

function drawGardenWater(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#1a3858';
  G.fillRect(0, 0, s, s);
  // Water ripple highlights
  for (var i = 0; i < 4; i++) {
    var x = rng() * s, y = rng() * s;
    G.strokeStyle = 'rgba(80,140,180,' + (0.15 + rng() * 0.15) + ')';
    G.lineWidth = 0.8;
    G.beginPath(); G.arc(x, y, 4 + rng() * 6, 0, Math.PI); G.stroke();
  }
  // Depth shimmer
  G.fillStyle = 'rgba(40,80,110,0.2)';
  G.beginPath(); G.arc(s * 0.5, s * 0.5, s * 0.3, 0, Math.PI * 2); G.fill();
}

// --- TIDEPOOL ---
function drawTidepoolWall(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#0a1828';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 5; i++) {
    G.fillStyle = 'rgba(' + (10 + Math.floor(rng() * 20)) + ',' + (30 + Math.floor(rng() * 20)) + ',' + (50 + Math.floor(rng() * 30)) + ',' + (0.5 + rng() * 0.3) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, s * 0.15 + rng() * s * 0.12, 0, Math.PI * 2); G.fill();
  }
  // Coral accent
  if (rng() > 0.5) {
    G.fillStyle = 'rgba(60,20,40,0.4)';
    G.beginPath(); G.arc(rng() * s, rng() * s, 3 + rng() * 4, 0, Math.PI * 2); G.fill();
  }
  G.strokeStyle = 'rgba(5,12,25,0.5)';
  G.lineWidth = 2;
  G.strokeRect(1, 1, s - 2, s - 2);
}

function drawTidepoolFloor(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = rgbStr(24 + rng() * 8, 52 + rng() * 12, 80 + rng() * 12);
  G.fillRect(0, 0, s, s);
  // Sand/sediment specks
  for (var i = 0; i < 6; i++) {
    G.fillStyle = 'rgba(40,70,100,' + (0.2 + rng() * 0.15) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 1 + rng() * 2, 0, Math.PI * 2); G.fill();
  }
}

function drawTidepoolPath(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#2a5080';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 3; i++) {
    G.strokeStyle = 'rgba(60,110,160,' + (0.2 + rng() * 0.15) + ')';
    G.lineWidth = 0.8;
    G.beginPath(); G.moveTo(0, rng() * s); G.lineTo(s, rng() * s); G.stroke();
  }
}

function drawTidepoolWater(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#0e2848';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 5; i++) {
    G.strokeStyle = 'rgba(30,80,130,' + (0.2 + rng() * 0.15) + ')';
    G.lineWidth = 0.6;
    G.beginPath(); G.arc(rng() * s, rng() * s, 3 + rng() * 8, -0.5, Math.PI + 0.5); G.stroke();
  }
}

// --- CLOUD ---
function drawCloudWall(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#1a2838';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 4; i++) {
    G.fillStyle = 'rgba(60,70,' + (90 + Math.floor(rng() * 30)) + ',' + (0.4 + rng() * 0.3) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, s * 0.18 + rng() * s * 0.14, 0, Math.PI * 2); G.fill();
  }
  G.strokeStyle = 'rgba(15,20,35,0.4)';
  G.lineWidth = 2;
  G.strokeRect(1, 1, s - 2, s - 2);
}

function drawCloudFloor(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = rgbStr(85 + rng() * 12, 100 + rng() * 12, 115 + rng() * 12);
  G.fillRect(0, 0, s, s);
  // Wispy cloud marks
  for (var i = 0; i < 3; i++) {
    G.fillStyle = 'rgba(180,200,220,' + (0.08 + rng() * 0.08) + ')';
    G.beginPath();
    G.ellipse(rng() * s, rng() * s, 8 + rng() * 10, 3 + rng() * 4, rng() * Math.PI, 0, Math.PI * 2);
    G.fill();
  }
}

function drawCloudPath(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#6880a0';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 4; i++) {
    G.fillStyle = 'rgba(140,170,200,' + (0.1 + rng() * 0.1) + ')';
    G.beginPath();
    G.ellipse(rng() * s, rng() * s, 6 + rng() * 8, 2 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
    G.fill();
  }
}

function drawCloudWater(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#a0b8d0';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 3; i++) {
    G.fillStyle = 'rgba(200,220,240,' + (0.15 + rng() * 0.1) + ')';
    G.beginPath();
    G.ellipse(rng() * s, rng() * s, 10 + rng() * 8, 3 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
    G.fill();
  }
}

// --- EMBER ---
function drawEmberWall(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#1a0808';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 5; i++) {
    G.fillStyle = 'rgba(' + (20 + Math.floor(rng() * 15)) + ',' + (8 + Math.floor(rng() * 8)) + ',' + Math.floor(rng() * 8) + ',' + (0.5 + rng() * 0.3) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, s * 0.16 + rng() * s * 0.12, 0, Math.PI * 2); G.fill();
  }
  // Lava crack
  if (rng() > 0.5) {
    G.strokeStyle = 'rgba(200,60,10,0.3)';
    G.lineWidth = 1.2;
    G.beginPath(); G.moveTo(rng() * s, 0); G.lineTo(rng() * s, s); G.stroke();
  }
  G.strokeStyle = 'rgba(10,4,2,0.5)';
  G.lineWidth = 2;
  G.strokeRect(1, 1, s - 2, s - 2);
}

function drawEmberFloor(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = rgbStr(65 + rng() * 10, 36 + rng() * 8, 14 + rng() * 6);
  G.fillRect(0, 0, s, s);
  // Ash specks
  for (var i = 0; i < 4; i++) {
    G.fillStyle = 'rgba(80,50,20,' + (0.2 + rng() * 0.15) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 1 + rng() * 1.5, 0, Math.PI * 2); G.fill();
  }
  // Ember glow
  if (rng() > 0.8) {
    G.fillStyle = 'rgba(180,60,10,0.15)';
    G.beginPath(); G.arc(rng() * s, rng() * s, 3 + rng() * 3, 0, Math.PI * 2); G.fill();
  }
}

function drawEmberPath(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#6a2810';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 3; i++) {
    G.fillStyle = 'rgba(120,40,12,' + (0.2 + rng() * 0.15) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 2 + rng() * 3, 0, Math.PI * 2); G.fill();
  }
}

function drawEmberWater(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#801808';
  G.fillRect(0, 0, s, s);
  // Lava bubbles
  for (var i = 0; i < 3; i++) {
    G.fillStyle = 'rgba(220,80,10,' + (0.2 + rng() * 0.2) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 2 + rng() * 3, 0, Math.PI * 2); G.fill();
  }
  G.fillStyle = 'rgba(255,120,20,0.1)';
  G.beginPath(); G.arc(s * 0.5, s * 0.5, s * 0.25, 0, Math.PI * 2); G.fill();
}

// --- ARCANE ---
function drawArcaneWall(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#100818';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 4; i++) {
    G.fillStyle = 'rgba(' + (20 + Math.floor(rng() * 10)) + ',' + Math.floor(rng() * 12) + ',' + (30 + Math.floor(rng() * 20)) + ',' + (0.5 + rng() * 0.3) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, s * 0.16 + rng() * s * 0.1, 0, Math.PI * 2); G.fill();
  }
  // Rune glow
  if (rng() > 0.6) {
    G.fillStyle = 'rgba(120,60,200,0.12)';
    G.beginPath(); G.arc(s * 0.5, s * 0.5, s * 0.2, 0, Math.PI * 2); G.fill();
  }
  G.strokeStyle = 'rgba(8,4,16,0.5)';
  G.lineWidth = 2;
  G.strokeRect(1, 1, s - 2, s - 2);
}

function drawArcaneFloor(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = rgbStr(42 + rng() * 10, 22 + rng() * 8, 70 + rng() * 12);
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 3; i++) {
    G.fillStyle = 'rgba(80,40,130,' + (0.1 + rng() * 0.1) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 1.5 + rng() * 2, 0, Math.PI * 2); G.fill();
  }
}

function drawArcanePath(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#482880';
  G.fillRect(0, 0, s, s);
  // Rune line pattern
  G.strokeStyle = 'rgba(100,60,180,0.2)';
  G.lineWidth = 0.6;
  for (var i = 0; i < 2; i++) {
    G.beginPath();
    G.moveTo(rng() * s, 0); G.lineTo(rng() * s, s); G.stroke();
    G.beginPath();
    G.moveTo(0, rng() * s); G.lineTo(s, rng() * s); G.stroke();
  }
}

function drawArcaneWater(G, s, seed) {
  var rng = mkRng(seed);
  G.fillStyle = '#301880';
  G.fillRect(0, 0, s, s);
  for (var i = 0; i < 4; i++) {
    G.fillStyle = 'rgba(80,40,180,' + (0.1 + rng() * 0.12) + ')';
    G.beginPath(); G.arc(rng() * s, rng() * s, 3 + rng() * 5, 0, Math.PI * 2); G.fill();
  }
}

var FLOOR_TILES = {
  1: { wall: drawGardenWall, floor: drawGardenFloor, path: drawGardenPath, water: drawGardenWater },
  2: { wall: drawTidepoolWall, floor: drawTidepoolFloor, path: drawTidepoolPath, water: drawTidepoolWater },
  3: { wall: drawCloudWall, floor: drawCloudFloor, path: drawCloudPath, water: drawCloudWater },
  4: { wall: drawEmberWall, floor: drawEmberFloor, path: drawEmberPath, water: drawEmberWater },
  5: { wall: drawArcaneWall, floor: drawArcaneFloor, path: drawArcanePath, water: drawArcaneWater },
};

var TILE_TYPES = ['wall', 'floor', 'path', 'water'];
var VARIANTS_PER_TYPE = 4;

export function ensureTileTextures(scene, floorId, tileSize) {
  var key = floorId + '-' + tileSize;
  if (TILE_CACHE[key]) return;
  TILE_CACHE[key] = true;

  var drawers = FLOOR_TILES[floorId] || FLOOR_TILES[1];

  for (var ti = 0; ti < TILE_TYPES.length; ti++) {
    var type = TILE_TYPES[ti];
    var drawFn = drawers[type];
    for (var v = 0; v < VARIANTS_PER_TYPE; v++) {
      var texKey = 'tile-' + floorId + '-' + type + '-' + v;
      if (!scene.textures.exists(texKey)) {
        var cv = makeTileCanvas(tileSize, drawFn, floorId * 1000 + ti * 100 + v * 17);
        scene.textures.addCanvas(texKey, cv);
      }
    }
  }
}

export function getTileTextureKey(floorId, tileType, x, y) {
  var types = ['wall', 'floor', 'path', 'water'];
  var typeName = types[tileType] || 'floor';
  var v = ((x * 7 + y * 13) & 0x7fffffff) % VARIANTS_PER_TYPE;
  return 'tile-' + floorId + '-' + typeName + '-' + v;
}
