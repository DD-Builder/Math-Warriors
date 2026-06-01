/**
 * Papercut title art — organic layered paper glyphs.
 *
 * Each letter is drawn as a chunky polygon shape (not pixel cells)
 * with slightly imperfect "hand-cut" edges. Layered with shadow
 * underlays for depth. Matches the Whimsical Harmony / Intricate
 * Papercut Art reference vibe.
 *
 * The polygons are hand-authored as relative coordinates in a unit
 * box (0..1, 0..1) so they scale cleanly. Edges are subdivided with
 * tiny perturbations so they don't look perfectly straight.
 */

import { makeRng } from '../systems/rng.js';

// Letter definitions — each letter is one or more polygon shapes
// expressed in unit coordinates (x and y in 0..1 where 0,0 is top-left).
// We then perturb edges to look hand-cut.
//
// Each shape is an array of [x, y] points forming a closed polygon.

// Each letter is expressed as `{ positive: [...], holes: [...] }`.
// `positive` shapes fill with the main color; `holes` paint the
// hole color on top to "cut out" inner counters (A, R, O).
const LETTERS = {
  M: {
    positive: [[
      [0.00, 1.00], [0.00, 0.00],
      [0.22, 0.00], [0.50, 0.55],
      [0.78, 0.00], [1.00, 0.00],
      [1.00, 1.00], [0.78, 1.00],
      [0.78, 0.40], [0.55, 0.78],
      [0.45, 0.78], [0.22, 0.40],
      [0.22, 1.00],
    ]],
    holes: [],
  },
  A: {
    positive: [[
      [0.00, 1.00], [0.30, 0.00],
      [0.70, 0.00], [1.00, 1.00],
      [0.78, 1.00], [0.70, 0.78],
      [0.30, 0.78], [0.22, 1.00],
    ]],
    holes: [[
      [0.40, 0.55], [0.50, 0.20],
      [0.60, 0.55],
    ]],
  },
  T: {
    positive: [[
      [0.00, 0.00], [1.00, 0.00],
      [1.00, 0.22], [0.62, 0.22],
      [0.62, 1.00], [0.38, 1.00],
      [0.38, 0.22], [0.00, 0.22],
    ]],
    holes: [],
  },
  H: {
    // Single merged polygon so the whole H has ONE outline + shadow.
    // The crossbar is part of the outer path — no holes needed.
    positive: [[
      [0.00, 0.00], [0.25, 0.00],
      [0.25, 0.40], [0.75, 0.40],
      [0.75, 0.00], [1.00, 0.00],
      [1.00, 1.00], [0.75, 1.00],
      [0.75, 0.60], [0.25, 0.60],
      [0.25, 1.00], [0.00, 1.00],
    ]],
    holes: [],
  },
  W: {
    positive: [[
      [0.00, 0.00], [0.18, 0.00],
      [0.30, 0.78], [0.42, 0.18],
      [0.58, 0.18], [0.70, 0.78],
      [0.82, 0.00], [1.00, 0.00],
      [0.82, 1.00], [0.62, 1.00],
      [0.50, 0.50], [0.38, 1.00],
      [0.18, 1.00],
    ]],
    holes: [],
  },
  R: {
    positive: [[
      [0.00, 0.00], [0.65, 0.00],
      [0.85, 0.10], [0.95, 0.30],
      [0.85, 0.50], [0.65, 0.55],
      [1.00, 1.00], [0.75, 1.00],
      [0.45, 0.55], [0.25, 0.55],
      [0.25, 1.00], [0.00, 1.00],
    ]],
    holes: [[
      [0.25, 0.20], [0.55, 0.20],
      [0.65, 0.30], [0.55, 0.40],
      [0.25, 0.40],
    ]],
  },
  I: {
    // Single continuous outline (serifs + stem) so the letter casts
    // one unified shadow rather than three stacked silhouettes.
    positive: [[
      [0.10, 0.00], [0.90, 0.00],
      [0.90, 0.20], [0.62, 0.20],
      [0.62, 0.80], [0.90, 0.80],
      [0.90, 1.00], [0.10, 1.00],
      [0.10, 0.80], [0.38, 0.80],
      [0.38, 0.20], [0.10, 0.20],
    ]],
    holes: [],
  },
  O: {
    positive: [[
      [0.30, 0.00], [0.70, 0.00],
      [1.00, 0.30], [1.00, 0.70],
      [0.70, 1.00], [0.30, 1.00],
      [0.00, 0.70], [0.00, 0.30],
    ]],
    holes: [[
      [0.42, 0.20], [0.58, 0.20],
      [0.78, 0.40], [0.78, 0.60],
      [0.58, 0.80], [0.42, 0.80],
      [0.22, 0.60], [0.22, 0.40],
    ]],
  },
  S: {
    positive: [[
      [0.10, 0.00], [1.00, 0.00],
      [1.00, 0.22], [0.32, 0.22],
      [0.30, 0.40], [0.85, 0.40],
      [1.00, 0.55], [1.00, 0.85],
      [0.90, 1.00], [0.00, 1.00],
      [0.00, 0.78], [0.68, 0.78],
      [0.70, 0.60], [0.15, 0.60],
      [0.00, 0.45], [0.00, 0.15],
    ]],
    holes: [],
  },
  ' ': { positive: [], holes: [] },
};

/**
 * Perturb a polygon's edges with small random offsets to simulate
 * hand-cut paper. Returns a new array of points with extra subdivision
 * points along each edge.
 */
function perturbPolygon(points, scale, rng, jitter = 0.005) {
  // Jitter stays small (<1% of the unit box) so letters keep their
  // recognizable silhouette — any larger and the glyphs deform.
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    out.push([a[0] + (rng() - 0.5) * jitter, a[1] + (rng() - 0.5) * jitter]);
  }
  return out;
}

/**
 * Draw one letter's polygons with layered shadow + main + holes.
 *
 * `letter` is a `{ positive, holes }` object. All positive shapes are
 * drawn in `mainColor` (each gets its own shadow so they read as paper
 * cutouts layered on each other). Holes are painted in `holeColor`
 * (background) on top to simulate counters inside A / R / O.
 */
function drawLetterShapes(scene, gx, gy, w, h, letter, mainColor, shadowColor, holeColor, rng) {
  const positive = letter.positive || [];
  const holes = letter.holes || [];

  const toCanvas = (pts, ox, oy) =>
    perturbPolygon(pts, 1, rng).map(([px, py]) => [px * w + ox, py * h + oy]);

  // Shadow — drawn as Phaser graphics (behind everything)
  const shadow = scene.add.graphics();
  shadow.fillStyle(shadowColor, 0.5);
  for (const pts of positive) {
    shadow.fillPoints(toCanvas(pts, 6, 8).map(([x, y]) => ({ x: gx + x, y: gy + y })), true);
  }

  // Render letter with true transparent holes onto an offscreen canvas
  const pad = 4;
  const cw = Math.ceil(w) + pad * 2;
  const ch = Math.ceil(h) + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const G = cv.getContext('2d');

  const hexToCSS = (hex) => {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  };

  // Draw main color
  G.fillStyle = hexToCSS(mainColor);
  for (const pts of positive) {
    const cp = toCanvas(pts, pad, pad);
    G.beginPath();
    G.moveTo(cp[0][0], cp[0][1]);
    for (let i = 1; i < cp.length; i++) G.lineTo(cp[i][0], cp[i][1]);
    G.closePath();
    G.fill();
  }

  // Highlight
  G.fillStyle = 'rgba(255,255,255,0.18)';
  for (const pts of positive) {
    const cp = toCanvas(pts, pad - 1, pad - 1);
    G.beginPath();
    G.moveTo(cp[0][0], cp[0][1]);
    for (let i = 1; i < cp.length; i++) G.lineTo(cp[i][0], cp[i][1]);
    G.closePath();
    G.fill();
  }

  // Cut out holes with destination-out (true transparency)
  if (holes.length) {
    G.globalCompositeOperation = 'destination-out';
    G.fillStyle = 'rgba(0,0,0,1)';
    for (const pts of holes) {
      const cp = toCanvas(pts, pad, pad);
      G.beginPath();
      G.moveTo(cp[0][0], cp[0][1]);
      for (let i = 1; i < cp.length; i++) G.lineTo(cp[i][0], cp[i][1]);
      G.closePath();
      G.fill();
    }
    G.globalCompositeOperation = 'source-over';
  }

  // Add to Phaser as a texture and display
  const key = 'letter-' + gx + '-' + gy + '-' + Math.random().toString(36).slice(2, 6);
  scene.textures.addCanvas(key, cv);
  const img = scene.add.image(gx + w / 2, gy + h / 2, key);
  img.setDisplaySize(w + pad, h + pad);
}

/**
 * Draw a word as a row of organic papercut letters.
 * Returns total rendered width.
 */
function drawWord(scene, word, cx, cy, letterH, mainColor, shadowColor, holeColor, seed) {
  const letterW = letterH * 0.78;
  const gap = letterH * 0.18;
  const wordW = word.length * letterW + (word.length - 1) * gap;
  const startX = cx - wordW / 2;
  const topY = cy - letterH / 2;
  const rng = makeRng(seed);

  const toScreen = (pts, ox, oy, w, h) =>
    perturbPolygon(pts, 1, rng).map(([px, py]) => ({ x: ox + px * w, y: oy + py * h }));

  // Shadow
  const shadow = scene.add.graphics();
  shadow.fillStyle(shadowColor, 0.5);
  for (let i = 0; i < word.length; i++) {
    const letter = LETTERS[word[i]];
    if (!letter || !letter.positive.length) continue;
    const lx = startX + i * (letterW + gap);
    for (const pts of letter.positive)
      shadow.fillPoints(toScreen(pts, lx + 6, topY + 8, letterW, letterH), true);
  }

  // Main fill
  const main = scene.add.graphics();
  main.fillStyle(mainColor, 1);
  for (let i = 0; i < word.length; i++) {
    const letter = LETTERS[word[i]];
    if (!letter || !letter.positive.length) continue;
    const lx = startX + i * (letterW + gap);
    for (const pts of letter.positive)
      main.fillPoints(toScreen(pts, lx, topY, letterW, letterH), true);
  }

  // Highlight
  const hi = scene.add.graphics();
  hi.fillStyle(0xffffff, 0.15);
  for (let i = 0; i < word.length; i++) {
    const letter = LETTERS[word[i]];
    if (!letter || !letter.positive.length) continue;
    const lx = startX + i * (letterW + gap);
    for (const pts of letter.positive)
      hi.fillPoints(toScreen(pts, lx - 1, topY - 1, letterW, letterH), true);
  }

  // Holes — use a GeometryMask to cut through to the background
  let hasHoles = false;
  const holeMaskGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  // First fill the entire word area as visible
  holeMaskGfx.fillStyle(0xffffff);
  holeMaskGfx.fillRect(startX - 10, topY - 10, wordW + 20, letterH + 20);
  // Then cut out the holes by NOT drawing those areas
  // Actually for geometry mask: white = visible, black = hidden
  // We need to make holes transparent — so fill everything EXCEPT holes
  // Simpler: create hole shapes and use them as an inverted mask
  for (let i = 0; i < word.length; i++) {
    const letter = LETTERS[word[i]];
    if (!letter || !letter.holes || !letter.holes.length) continue;
    hasHoles = true;
    const lx = startX + i * (letterW + gap);
    holeMaskGfx.fillStyle(0x000000);
    for (const pts of letter.holes)
      holeMaskGfx.fillPoints(toScreen(pts, lx, topY, letterW, letterH), true);
  }

  if (hasHoles) {
    const mask = holeMaskGfx.createGeometryMask();
    main.setMask(mask);
    hi.setMask(mask);
  }

  return main;
}


/**
 * Draw the MATH WARRIORS title using the hand-cut papercut letter system.
 *
 * Each letter is rendered as chunky perturbed polygons with layered
 * shadows, giving the organic "cut paper" look that matches the game's
 * visual theme. Falls back to text objects for any letters not defined
 * in LETTERS.
 *
 * @param {Phaser.Scene} scene
 * @param {number} cx - center X
 * @param {number} cy - center Y between MATH and WARRIORS lines
 * @param {number} scale - 1.0 = default size
 */
export function drawPapercutTitle(scene, cx, cy, scale = 1) {
  const mathH = Math.round(120 * scale);
  const warH = Math.round(90 * scale);
  const lineGap = mathH * 0.35;

  // MATH — blue papercut letters with dark shadow
  const mathGfx = drawWord(scene, 'MATH', cx, cy - lineGap, mathH,
    0x4888e0, 0x1a3060, 0x000000, 7001);

  // WARRIORS — red papercut letters with dark shadow
  const warGfx = drawWord(scene, 'WARRIORS', cx, cy + lineGap + warH * 0.15, warH,
    0xe85050, 0x601818, 0x000000, 7002);
}


/**
 * Scatter decorative papercut elements around a scene — clouds, flowers,
 * butterflies, stars. Used to liven up menu screens.
 */
export function scatterPapercutDecor(scene, gameW, gameH, opts = {}) {
  const seed = opts.seed ?? 1;
  const theme = opts.theme ?? 'garden';
  const rng = makeRng(seed);
  // excludeRect = { x, y, w, h } center coords; nothing is drawn inside
  const ex = opts.excludeRect;

  const isInExcluded = (x, y) => {
    if (!ex) return false;
    return Math.abs(x - ex.x) < ex.w / 2 && Math.abs(y - ex.y) < ex.h / 2;
  };

  // Clouds along the very top edge only
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (gameW / 4) + (rng() - 0.5) * 100;
    const y = 30 + rng() * 30;
    if (isInExcluded(x, y)) continue;
    drawCloud(scene, x, y, 80 + rng() * 50, 25 + rng() * 10);
  }

  if (theme === 'garden') {
    // Flowers along the ground only — bottom 15% of screen
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * (gameW / 9) + (rng() - 0.5) * 30;
      const y = gameH - 60 - rng() * 40;
      if (isInExcluded(x, y)) continue;
      drawFlower(scene, x, y, 14 + rng() * 6, rng);
    }
    // Butterflies — stick to outer corners, AVOID center where title is
    const corners = [
      { x: gameW * 0.10, y: gameH * 0.55 },
      { x: gameW * 0.90, y: gameH * 0.55 },
      { x: gameW * 0.15, y: gameH * 0.78 },
    ];
    for (const c of corners) {
      if (isInExcluded(c.x, c.y)) continue;
      drawButterfly(scene, c.x + (rng() - 0.5) * 40, c.y + (rng() - 0.5) * 40, 18 + rng() * 6, rng);
    }
  }

  if (theme === 'night') {
    for (let i = 0; i < 12; i++) {
      const x = rng() * gameW;
      const y = rng() * (gameH * 0.5);
      if (isInExcluded(x, y)) continue;
      drawStar(scene, x, y, 8 + rng() * 6);
    }
  }
}

function drawCloud(scene, cx, cy, w, h) {
  const gfx = scene.add.graphics();
  const bumps = 6;
  // Shadow
  gfx.fillStyle(0x000000, 0.1);
  for (let i = 0; i < bumps; i++) {
    const t = i / (bumps - 1);
    const bx = cx + (t - 0.5) * w + 3;
    const r = w / 5 * (0.8 + Math.sin(t * Math.PI) * 0.5);
    gfx.fillCircle(bx, cy + 4, r);
  }
  // Main cloud
  gfx.fillStyle(0xffffff, 0.95);
  for (let i = 0; i < bumps; i++) {
    const t = i / (bumps - 1);
    const bx = cx + (t - 0.5) * w;
    const r = w / 5 * (0.8 + Math.sin(t * Math.PI) * 0.5);
    gfx.fillCircle(bx, cy, r);
  }
  return gfx;
}

function drawFlower(scene, cx, cy, size, rng) {
  const gfx = scene.add.graphics();
  const palette = [0xf06080, 0xf0c040, 0xf080c0, 0xff8080, 0xa0d8f0];
  const color = palette[Math.floor(rng() * palette.length)];
  gfx.fillStyle(0x388830, 1);
  gfx.fillRect(cx - 2, cy - size * 0.2, 3, size * 1.2);
  gfx.fillStyle(color, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    gfx.fillCircle(cx + Math.cos(a) * size * 0.6, cy + Math.sin(a) * size * 0.6, size * 0.5);
  }
  gfx.fillStyle(0xfff080, 1);
  gfx.fillCircle(cx, cy, size * 0.4);
}

function drawButterfly(scene, cx, cy, size, rng) {
  const gfx = scene.add.graphics();
  const colors = [0xf06888, 0xa050d0, 0x60c8e0, 0xf09030];
  const c = colors[Math.floor(rng() * colors.length)];
  // Body
  gfx.fillStyle(0x3a2410, 1);
  gfx.fillRoundedRect(cx - 2, cy - size * 0.4, 4, size * 0.8, 1);
  // Wings (left + right pair)
  gfx.fillStyle(c, 0.95);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.2, size * 0.45);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.2, size * 0.45);
  gfx.fillCircle(cx - size * 0.4, cy + size * 0.2, size * 0.35);
  gfx.fillCircle(cx + size * 0.4, cy + size * 0.2, size * 0.35);
  // White spots
  gfx.fillStyle(0xffffff, 0.7);
  gfx.fillCircle(cx - size * 0.5, cy - size * 0.2, size * 0.12);
  gfx.fillCircle(cx + size * 0.5, cy - size * 0.2, size * 0.12);
}

function drawStar(scene, cx, cy, size) {
  const gfx = scene.add.graphics();
  gfx.fillStyle(0xfff8a0, 0.85);
  gfx.fillTriangle(cx, cy - size, cx + size * 0.3, cy, cx - size * 0.3, cy);
  gfx.fillTriangle(cx, cy + size, cx + size * 0.3, cy, cx - size * 0.3, cy);
  gfx.fillTriangle(cx - size, cy, cx, cy - size * 0.3, cx, cy + size * 0.3);
  gfx.fillTriangle(cx + size, cy, cx, cy - size * 0.3, cx, cy + size * 0.3);
  gfx.fillStyle(0xffffff, 0.9);
  gfx.fillCircle(cx, cy, size * 0.25);
}

