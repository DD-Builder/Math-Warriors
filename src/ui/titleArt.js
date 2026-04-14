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

// Letter definitions — each letter is one or more polygon shapes
// expressed in unit coordinates (x and y in 0..1 where 0,0 is top-left).
// We then perturb edges to look hand-cut.
//
// Each shape is an array of [x, y] points forming a closed polygon.

const LETTERS = {
  M: [
    // Single shape: outer M outline as a 12-point polygon
    [
      [0.00, 1.00], [0.00, 0.00],
      [0.22, 0.00], [0.50, 0.55],
      [0.78, 0.00], [1.00, 0.00],
      [1.00, 1.00], [0.78, 1.00],
      [0.78, 0.40], [0.55, 0.78],
      [0.45, 0.78], [0.22, 0.40],
      [0.22, 1.00],
    ],
  ],
  A: [
    // Outer A
    [
      [0.00, 1.00], [0.30, 0.00],
      [0.70, 0.00], [1.00, 1.00],
      [0.78, 1.00], [0.70, 0.78],
      [0.30, 0.78], [0.22, 1.00],
    ],
    // Hole / inner triangle
    [
      [0.40, 0.55], [0.50, 0.20],
      [0.60, 0.55],
    ],
  ],
  T: [
    // Top horizontal bar
    [
      [0.00, 0.00], [1.00, 0.00],
      [1.00, 0.22], [0.62, 0.22],
      [0.62, 1.00], [0.38, 1.00],
      [0.38, 0.22], [0.00, 0.22],
    ],
  ],
  H: [
    // Left bar
    [[0.00, 0.00], [0.25, 0.00], [0.25, 1.00], [0.00, 1.00]],
    // Right bar
    [[0.75, 0.00], [1.00, 0.00], [1.00, 1.00], [0.75, 1.00]],
    // Crossbar
    [[0.25, 0.40], [0.75, 0.40], [0.75, 0.60], [0.25, 0.60]],
  ],
  W: [
    [
      [0.00, 0.00], [0.18, 0.00],
      [0.30, 0.78], [0.42, 0.18],
      [0.58, 0.18], [0.70, 0.78],
      [0.82, 0.00], [1.00, 0.00],
      [0.82, 1.00], [0.62, 1.00],
      [0.50, 0.50], [0.38, 1.00],
      [0.18, 1.00],
    ],
  ],
  R: [
    // Outer R
    [
      [0.00, 0.00], [0.65, 0.00],
      [0.85, 0.10], [0.95, 0.30],
      [0.85, 0.50], [0.65, 0.55],
      [1.00, 1.00], [0.75, 1.00],
      [0.45, 0.55], [0.25, 0.55],
      [0.25, 1.00], [0.00, 1.00],
    ],
    // Hole
    [
      [0.25, 0.20], [0.55, 0.20],
      [0.65, 0.30], [0.55, 0.40],
      [0.25, 0.40],
    ],
  ],
  I: [
    // Top serif
    [[0.10, 0.00], [0.90, 0.00], [0.90, 0.20], [0.10, 0.20]],
    // Stem
    [[0.38, 0.20], [0.62, 0.20], [0.62, 0.80], [0.38, 0.80]],
    // Bottom serif
    [[0.10, 0.80], [0.90, 0.80], [0.90, 1.00], [0.10, 1.00]],
  ],
  O: [
    // Outer O — approximated as an octagon
    [
      [0.30, 0.00], [0.70, 0.00],
      [1.00, 0.30], [1.00, 0.70],
      [0.70, 1.00], [0.30, 1.00],
      [0.00, 0.70], [0.00, 0.30],
    ],
    // Hole
    [
      [0.42, 0.20], [0.58, 0.20],
      [0.78, 0.40], [0.78, 0.60],
      [0.58, 0.80], [0.42, 0.80],
      [0.22, 0.60], [0.22, 0.40],
    ],
  ],
  S: [
    [
      [0.10, 0.00], [1.00, 0.00],
      [1.00, 0.22], [0.32, 0.22],
      [0.30, 0.40], [0.85, 0.40],
      [1.00, 0.55], [1.00, 0.85],
      [0.90, 1.00], [0.00, 1.00],
      [0.00, 0.78], [0.68, 0.78],
      [0.70, 0.60], [0.15, 0.60],
      [0.00, 0.45], [0.00, 0.15],
    ],
  ],
  ' ': [],
};

/**
 * Perturb a polygon's edges with small random offsets to simulate
 * hand-cut paper. Returns a new array of points with extra subdivision
 * points along each edge.
 */
function perturbPolygon(points, scale, rng, jitter = 0.005) {
  // Very small jitter so letters keep their recognizable shape.
  // Higher values were distorting WARRIORS letters into unreadable blobs.
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    out.push([a[0] + (rng() - 0.5) * jitter, a[1] + (rng() - 0.5) * jitter]);
  }
  return out;
}

/**
 * Even-odd polygon fill: draws outer shape filled, then "holes" filled
 * with the background color. For most cases this is a good-enough
 * approximation. Phaser doesn't natively support polygon-with-holes,
 * so we paint the hole on top of the main shape using the background.
 */
function drawLetterShapes(scene, gx, gy, w, h, shapes, mainColor, shadowColor, holeColor, rng) {
  const seed = (gx * 31 + gy * 17) | 0;
  // 1) Shadow layer (slightly offset down-right)
  const shadow = scene.add.graphics();
  shadow.fillStyle(shadowColor, 0.5);
  for (let s = 0; s < shapes.length; s++) {
    if (s === 0) {
      const pts = perturbPolygon(shapes[s], 1, rng).map(([px, py]) => [
        gx + px * w + 6,
        gy + py * h + 8,
      ]);
      shadow.fillPoints(pts.map(([x, y]) => ({ x, y })), true);
    }
  }

  // 2) Main paper layer
  const main = scene.add.graphics();
  main.fillStyle(mainColor, 1);
  // Main outer shape (first shape)
  if (shapes[0]) {
    const pts = perturbPolygon(shapes[0], 1, rng).map(([px, py]) => [
      gx + px * w,
      gy + py * h,
    ]);
    main.fillPoints(pts.map(([x, y]) => ({ x, y })), true);
  }

  // 3) Holes — fill with the holeColor (background)
  const holes = scene.add.graphics();
  holes.fillStyle(holeColor, 1);
  for (let s = 1; s < shapes.length; s++) {
    const pts = perturbPolygon(shapes[s], 1, rng).map(([px, py]) => [
      gx + px * w,
      gy + py * h,
    ]);
    holes.fillPoints(pts.map(([x, y]) => ({ x, y })), true);
  }

  // 4) Subtle highlight layer in the upper-left for paper-grain feel
  const hi = scene.add.graphics();
  hi.fillStyle(0xffffff, 0.18);
  if (shapes[0]) {
    const pts = perturbPolygon(shapes[0], 1, rng).map(([px, py]) => [
      gx + px * w - 1,
      gy + py * h - 1,
    ]);
    hi.fillPoints(pts.map(([x, y]) => ({ x, y })), true);
  }
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

  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const shapes = LETTERS[ch];
    if (!shapes || !shapes.length) continue;
    const lx = startX + i * (letterW + gap);
    drawLetterShapes(scene, lx, topY, letterW, letterH, shapes, mainColor, shadowColor, holeColor, rng);
  }

  return wordW;
}

/**
 * Draw the MATH WARRIORS title as organic layered papercut art.
 * @param {Phaser.Scene} scene
 * @param {number} cx - center X
 * @param {number} cy - center Y between MATH and WARRIORS lines
 * @param {number} scale - 1.0 = default size
 * @param {number} bgColor - color of the panel under the title (used to fill letter holes)
 */
export function drawPapercutTitle(scene, cx, cy, scale = 1, bgColor = 0xfff8e8) {
  const letterH = 110 * scale;
  const lineGap = letterH * 0.5;

  // MATH on top — deep blue paper with darker shadow
  drawWord(scene, 'MATH', cx, cy - letterH / 2 - lineGap / 2, letterH, 0x3878d8, 0x18406a, bgColor, 12);

  // WARRIORS below — slightly smaller so it fits, red paper
  const warH = letterH * 0.78;
  drawWord(scene, 'WARRIORS', cx, cy + warH / 2 + lineGap / 2, warH, 0xe04040, 0x781818, bgColor, 34);
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
  gfx.fillStyle(0x000000, 0.15);
  for (let i = 0; i < 4; i++) {
    const bx = cx + (i / 3 - 0.5) * w + 4;
    const by = cy + 5;
    gfx.fillCircle(bx, by, w / 5);
  }
  gfx.fillStyle(0xffffff, 0.92);
  for (let i = 0; i < 4; i++) {
    const bx = cx + (i / 3 - 0.5) * w;
    gfx.fillCircle(bx, cy, w / 5);
  }
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

function makeRng(seed) {
  let s = ((seed ^ 0x9e3779b9) + 0x6c62272e) >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}
