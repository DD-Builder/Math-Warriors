/**
 * Papercut title art — renders MATH WARRIORS as layered paper shapes
 * using a 5x7 bitmap for each letter. No font dependency whatsoever.
 * Each lit cell becomes a small rounded paper square with a drop shadow.
 */

// 5 wide x 7 tall bitmap per letter. 1 = filled cell.
const GLYPH = {
  M: [
    '1 0 0 0 1',
    '1 1 0 1 1',
    '1 0 1 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
  ],
  A: [
    '0 0 1 0 0',
    '0 1 0 1 0',
    '1 0 0 0 1',
    '1 1 1 1 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
  ],
  T: [
    '1 1 1 1 1',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
  ],
  H: [
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 1 1 1 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
  ],
  W: [
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 1 0 1',
    '1 0 1 0 1',
    '1 1 0 1 1',
    '1 0 0 0 1',
  ],
  R: [
    '1 1 1 1 0',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 1 1 1 0',
    '1 0 1 0 0',
    '1 0 0 1 0',
    '1 0 0 0 1',
  ],
  I: [
    '1 1 1 1 1',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '0 0 1 0 0',
    '1 1 1 1 1',
  ],
  O: [
    '0 1 1 1 0',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '1 0 0 0 1',
    '0 1 1 1 0',
  ],
  S: [
    '0 1 1 1 1',
    '1 0 0 0 0',
    '1 0 0 0 0',
    '0 1 1 1 0',
    '0 0 0 0 1',
    '0 0 0 0 1',
    '1 1 1 1 0',
  ],
  ' ': [
    '0 0 0 0 0',
    '0 0 0 0 0',
    '0 0 0 0 0',
    '0 0 0 0 0',
    '0 0 0 0 0',
    '0 0 0 0 0',
    '0 0 0 0 0',
  ],
};

/**
 * Draw a single word as papercut squares.
 * Returns the pixel width of the rendered word.
 */
function drawWord(scene, word, cx, cy, cellSize, color, shadowColor) {
  const letterW = 5 * cellSize;
  const letterSpacing = cellSize * 0.8;
  const gap = cellSize * 0.4;
  const wordW = word.length * letterW + (word.length - 1) * letterSpacing;
  const startX = cx - wordW / 2;

  for (let li = 0; li < word.length; li++) {
    const glyph = GLYPH[word[li]];
    if (!glyph) continue;
    const lx = startX + li * (letterW + letterSpacing);

    // Draw shadow layer first
    const shadow = scene.add.graphics();
    shadow.fillStyle(shadowColor ?? 0x1a0e04, 0.45);
    for (let row = 0; row < 7; row++) {
      const cells = glyph[row].split(' ');
      for (let col = 0; col < 5; col++) {
        if (cells[col] === '1') {
          const px = lx + col * cellSize + gap;
          const py = cy + row * cellSize + gap - 3.5 * cellSize;
          shadow.fillRoundedRect(px - cellSize / 2 + 5, py - cellSize / 2 + 6, cellSize - 2, cellSize - 2, cellSize * 0.22);
        }
      }
    }

    // Main paper layer
    const main = scene.add.graphics();
    main.fillStyle(color, 1);
    for (let row = 0; row < 7; row++) {
      const cells = glyph[row].split(' ');
      for (let col = 0; col < 5; col++) {
        if (cells[col] === '1') {
          const px = lx + col * cellSize + gap;
          const py = cy + row * cellSize + gap - 3.5 * cellSize;
          main.fillRoundedRect(px - cellSize / 2, py - cellSize / 2, cellSize - 2, cellSize - 2, cellSize * 0.22);
        }
      }
    }

    // Highlight layer (small inset square) for extra paper feel
    const hi = scene.add.graphics();
    hi.fillStyle(0xffffff, 0.25);
    for (let row = 0; row < 7; row++) {
      const cells = glyph[row].split(' ');
      for (let col = 0; col < 5; col++) {
        if (cells[col] === '1') {
          const px = lx + col * cellSize + gap;
          const py = cy + row * cellSize + gap - 3.5 * cellSize;
          hi.fillRoundedRect(
            px - cellSize / 2 + 3,
            py - cellSize / 2 + 3,
            (cellSize - 2) * 0.4,
            (cellSize - 2) * 0.4,
            cellSize * 0.15
          );
        }
      }
    }
  }

  return wordW;
}

/**
 * Draw the MATH WARRIORS title stack as papercut art, centered on (cx, cy).
 *
 * @param {Phaser.Scene} scene
 * @param {number} cx - center X
 * @param {number} cy - center Y (middle between MATH and WARRIORS)
 * @param {number} scale - 1.0 = default size
 */
export function drawPapercutTitle(scene, cx, cy, scale = 1) {
  const cellSize = 16 * scale;
  const lineGap = cellSize * 1.6;

  // MATH in blue on top
  drawWord(scene, 'MATH', cx, cy - lineGap, cellSize, 0x2e6eb8, 0x1a3868);

  // WARRIORS in red below
  drawWord(scene, 'WARRIORS', cx, cy + lineGap, cellSize * 0.85, 0xd83838, 0x6a1818);
}

/**
 * Scatter decorative papercut elements around a scene — clouds, flowers,
 * stars, etc. Used to liven up menu screens without overwhelming them.
 *
 * @param {Phaser.Scene} scene
 * @param {number} gameW
 * @param {number} gameH
 * @param {object} opts
 * @param {number} [opts.seed=1]
 * @param {string} [opts.theme='garden'] - 'garden', 'night', 'sky'
 */
export function scatterPapercutDecor(scene, gameW, gameH, opts = {}) {
  const seed = opts.seed ?? 1;
  const theme = opts.theme ?? 'garden';
  const rng = makeRng(seed);

  // Clouds along the top
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (gameW / 4) + (rng() - 0.5) * 100;
    const y = 60 + rng() * 80;
    drawCloud(scene, x, y, 80 + rng() * 50, 25 + rng() * 10);
  }

  // Flowers along the ground
  if (theme === 'garden') {
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * (gameW / 9) + (rng() - 0.5) * 30;
      const y = gameH - 40 - rng() * 40;
      drawFlower(scene, x, y, 12 + rng() * 6, rng);
    }
  }

  // Stars if night
  if (theme === 'night') {
    for (let i = 0; i < 12; i++) {
      const x = rng() * gameW;
      const y = rng() * (gameH * 0.5);
      drawStar(scene, x, y, 8 + rng() * 6);
    }
  }
}

function drawCloud(scene, cx, cy, w, h) {
  const gfx = scene.add.graphics();
  // shadow
  gfx.fillStyle(0x000000, 0.15);
  for (let i = 0; i < 4; i++) {
    const bx = cx + (i / 3 - 0.5) * w + 4;
    const by = cy + 5;
    const br = w / 5;
    gfx.fillCircle(bx, by, br);
  }
  // body
  gfx.fillStyle(0xffffff, 0.92);
  for (let i = 0; i < 4; i++) {
    const bx = cx + (i / 3 - 0.5) * w;
    const by = cy;
    const br = w / 5;
    gfx.fillCircle(bx, by, br);
  }
}

function drawFlower(scene, cx, cy, size, rng) {
  const gfx = scene.add.graphics();
  const hue = rng();
  const color = hue < 0.33 ? 0xf06080 : hue < 0.66 ? 0xf0c040 : 0xf080c0;
  // stem
  gfx.fillStyle(0x388830, 1);
  gfx.fillRect(cx - 2, cy - size * 0.2, 3, size * 1.2);
  // petals — 5 circles
  gfx.fillStyle(color, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    gfx.fillCircle(cx + Math.cos(a) * size * 0.6, cy + Math.sin(a) * size * 0.6, size * 0.5);
  }
  // center
  gfx.fillStyle(0xfff080, 1);
  gfx.fillCircle(cx, cy, size * 0.4);
}

function drawStar(scene, cx, cy, size) {
  const gfx = scene.add.graphics();
  gfx.fillStyle(0xfff8a0, 0.85);
  // Simple 4-point star
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
