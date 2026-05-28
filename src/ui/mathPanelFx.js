/**
 * Math panel effects
 *
 * Floor-themed decorative borders and entrance animations for the
 * math problem panel. Leaves drift in Garden, bubbles rise in Tidepool,
 * embers glow in Ember Caves, frost forms in Frozen Peak.
 */

const FLOOR_THEMES = {
  1: { // Garden
    borderColor: 0x48a040,
    accentColor: 0xf06888,
    cornerDecor: 'leaves',
    ambientType: 'leaves',
  },
  2: { // Tidepool
    borderColor: 0x2878c0,
    accentColor: 0xf0a848,
    cornerDecor: 'bubbles',
    ambientType: 'bubbles',
  },
  3: { // Cloud
    borderColor: 0xa0c8e8,
    accentColor: 0xffd040,
    cornerDecor: 'wisps',
    ambientType: 'wisps',
  },
  4: { // Ember
    borderColor: 0xa84020,
    accentColor: 0xf0a020,
    cornerDecor: 'flames',
    ambientType: 'embers',
  },
  5: { // Frozen
    borderColor: 0x5090b8,
    accentColor: 0xd0f0ff,
    cornerDecor: 'crystals',
    ambientType: 'frost',
  },
};

/**
 * Add floor-themed decorations to the math panel area.
 * Called once during buildUI, creates decorative Graphics objects.
 *
 * @param {Phaser.Scene} scene
 * @param {number} floorId
 * @param {number} cx - Panel center X
 * @param {number} cy - Panel center Y
 * @param {number} w  - Panel width
 * @param {number} h  - Panel height
 * @returns {object} - { decorations: Graphics[], ambientTimer: TimeEvent|null }
 */
export function createPanelDecorations(scene, floorId, cx, cy, w, h) {
  const theme = FLOOR_THEMES[floorId] || FLOOR_THEMES[1];
  const decorations = [];
  const halfW = w / 2;
  const halfH = h / 2;

  // Corner decorations
  const corners = scene.add.graphics();
  corners.setDepth(15);

  if (theme.cornerDecor === 'leaves') {
    drawLeafCorners(corners, cx, cy, halfW, halfH, theme);
  } else if (theme.cornerDecor === 'bubbles') {
    drawBubbleCorners(corners, cx, cy, halfW, halfH, theme);
  } else if (theme.cornerDecor === 'wisps') {
    drawWispCorners(corners, cx, cy, halfW, halfH, theme);
  } else if (theme.cornerDecor === 'flames') {
    drawFlameCorners(corners, cx, cy, halfW, halfH, theme);
  } else if (theme.cornerDecor === 'crystals') {
    drawCrystalCorners(corners, cx, cy, halfW, halfH, theme);
  }
  corners.setVisible(false);
  decorations.push(corners);

  // Ambient particle effects around the panel
  let ambientTimer = null;
  const ambientParticles = [];

  return {
    decorations,
    corners,
    ambientTimer,
    ambientParticles,
    theme,
    cx, cy, w, h,
  };
}

/**
 * Show panel decorations and start ambient effects.
 * @param {Phaser.Scene} scene
 * @param {object} panelFx - From createPanelDecorations
 */
export function showPanelFx(scene, panelFx) {
  if (!panelFx) return;
  panelFx.corners.setVisible(true);
  startPanelAmbient(scene, panelFx);
}

/**
 * Hide panel decorations and stop ambient effects.
 * @param {object} panelFx - From createPanelDecorations
 */
export function hidePanelFx(panelFx) {
  if (!panelFx) return;
  panelFx.corners.setVisible(false);
  if (panelFx.ambientTimer) {
    panelFx.ambientTimer.remove();
    panelFx.ambientTimer = null;
  }
  for (const p of panelFx.ambientParticles) {
    if (p && p.destroy) p.destroy();
  }
  panelFx.ambientParticles.length = 0;
}

function startPanelAmbient(scene, panelFx) {
  const { theme, cx, cy, w, h } = panelFx;
  const halfW = w / 2;
  const halfH = h / 2;
  const maxParticles = 6;

  const configs = {
    leaves: { delay: 1200, spawn: () => spawnLeaf(scene, panelFx, cx, cy, halfW, halfH) },
    bubbles: { delay: 1000, spawn: () => spawnBubble(scene, panelFx, cx, cy, halfW, halfH) },
    wisps: { delay: 1500, spawn: () => spawnWisp(scene, panelFx, cx, cy, halfW, halfH) },
    embers: { delay: 800, spawn: () => spawnEmber(scene, panelFx, cx, cy, halfW, halfH) },
    frost: { delay: 2000, spawn: () => spawnFrost(scene, panelFx, cx, cy, halfW, halfH) },
  };

  const config = configs[theme.ambientType];
  if (!config) return;

  panelFx.ambientTimer = scene.time.addEvent({
    delay: config.delay,
    loop: true,
    callback: () => {
      if (panelFx.ambientParticles.length >= maxParticles) return;
      config.spawn();
    },
  });
}

// Corner decoration drawers — rich themed borders
function drawLeafCorners(gfx, cx, cy, hw, hh, theme) {
  // Ivy vine wrapping along top and down sides
  gfx.lineStyle(2.5, theme.borderColor, 0.35);
  gfx.beginPath();
  gfx.moveTo(cx - hw + 5, cy + hh);
  for (let t = 0; t <= 16; t++) {
    const p = t / 16;
    const x = cx - hw + 5 + (p < 0.3 ? 0 : (p - 0.3) / 0.7 * (hw * 2 - 10));
    const y = p < 0.3 ? cy + hh - p / 0.3 * (hh * 2) : cy - hh + 3 + Math.sin(p * 8) * 3;
    gfx.lineTo(x, y);
  }
  gfx.strokePath();
  // Leaf clusters at corners and along vine
  const leafPositions = [
    [cx - hw + 8, cy - hh + 6], [cx + hw - 8, cy - hh + 6],
    [cx - hw + 8, cy + hh - 6], [cx + hw - 8, cy + hh - 6],
    [cx - hw * 0.3, cy - hh + 4], [cx + hw * 0.3, cy - hh + 4],
  ];
  for (const [lx, ly] of leafPositions) {
    gfx.fillStyle(theme.borderColor, 0.45);
    // Leaf shape: two overlapping ovals
    gfx.fillEllipse(lx, ly, 8, 5);
    gfx.fillEllipse(lx + 3, ly - 2, 6, 4);
    gfx.fillStyle(theme.accentColor, 0.3);
    gfx.fillCircle(lx + 1, ly + 1, 2.5);
  }
  // Flower buds at corners
  gfx.fillStyle(theme.accentColor, 0.45);
  gfx.fillCircle(cx - hw + 12, cy - hh + 10, 4);
  gfx.fillCircle(cx + hw - 12, cy - hh + 10, 4);
  gfx.fillStyle(0xffffff, 0.2);
  gfx.fillCircle(cx - hw + 11, cy - hh + 9, 1.5);
  gfx.fillCircle(cx + hw - 13, cy - hh + 9, 1.5);
}

function drawBubbleCorners(gfx, cx, cy, hw, hh, theme) {
  // Wave pattern border along top and bottom
  for (const yOff of [-hh + 3, hh - 3]) {
    gfx.lineStyle(2, theme.borderColor, 0.3);
    gfx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = cx - hw + 8 + t * (hw * 2 - 16);
      const y = cy + yOff + Math.sin(t * Math.PI * 4) * 4;
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.strokePath();
  }
  // Coral clusters at corners
  const cornerPositions = [
    [cx - hw + 10, cy - hh + 10], [cx + hw - 10, cy - hh + 10],
    [cx - hw + 10, cy + hh - 10], [cx + hw - 10, cy + hh - 10],
  ];
  for (const [px, py] of cornerPositions) {
    gfx.fillStyle(theme.accentColor, 0.35);
    gfx.fillCircle(px, py, 5);
    gfx.fillCircle(px + 4, py - 3, 3.5);
    gfx.fillCircle(px - 3, py + 2, 3);
    gfx.fillStyle(theme.borderColor, 0.2);
    gfx.fillCircle(px + 1, py - 1, 2);
  }
  // Bubble trail along sides
  for (let side = -1; side <= 1; side += 2) {
    const sx = cx + side * (hw - 5);
    for (let b = 0; b < 4; b++) {
      const by = cy - hh * 0.5 + b * hh * 0.35;
      gfx.fillStyle(theme.borderColor, 0.15);
      gfx.fillCircle(sx, by, 2 + b * 0.5);
    }
  }
}

function drawWispCorners(gfx, cx, cy, hw, hh, theme) {
  // Soft cloud puffs along all edges
  const puffPositions = [
    [cx - hw + 10, cy - hh + 8, 10], [cx, cy - hh + 5, 14],
    [cx + hw - 10, cy - hh + 8, 10],
    [cx - hw + 6, cy, 8], [cx + hw - 6, cy, 8],
    [cx - hw + 10, cy + hh - 8, 10], [cx + hw - 10, cy + hh - 8, 10],
  ];
  for (const [px, py, pr] of puffPositions) {
    gfx.fillStyle(0xffffff, 0.08);
    gfx.fillCircle(px, py, pr);
    gfx.fillCircle(px + 5, py + 2, pr * 0.7);
  }
  // Golden light rays from top
  for (let r = 0; r < 3; r++) {
    const rx = cx - hw * 0.4 + r * hw * 0.4;
    gfx.fillStyle(theme.accentColor, 0.05);
    gfx.fillTriangle(rx - 2, cy - hh, rx + 2, cy - hh, rx + (r - 1) * 15, cy + hh);
  }
  // Soft glow behind panel
  gfx.fillStyle(0xffffff, 0.05);
  gfx.fillCircle(cx, cy, Math.max(hw, hh) + 15);
}

function drawFlameCorners(gfx, cx, cy, hw, hh, theme) {
  // Flame lick pattern along bottom (pointed triangle sequence)
  const flameCount = 12;
  for (let f = 0; f < flameCount; f++) {
    const t = f / flameCount;
    const fx = cx - hw + 10 + t * (hw * 2 - 20);
    const fh = 6 + Math.sin(f * 1.7) * 4;
    gfx.fillStyle(theme.accentColor, 0.3 + Math.sin(f * 0.9) * 0.15);
    gfx.fillTriangle(fx - 5, cy + hh, fx + 5, cy + hh, fx + (f % 2 ? 2 : -2), cy + hh - fh);
  }
  // Flame tips at corners
  const corners = [[-1,-1], [1,-1], [-1,1], [1,1]];
  for (const [sx, sy] of corners) {
    const x = cx + sx * (hw - 8);
    const y = cy + sy * (hh - 6);
    gfx.fillStyle(theme.accentColor, 0.45);
    gfx.fillTriangle(x - 5, y + 8, x + 5, y + 8, x, y - 8);
    gfx.fillStyle(0xff4010, 0.25);
    gfx.fillTriangle(x - 3, y + 6, x + 3, y + 6, x, y - 5);
    gfx.fillStyle(0xffe040, 0.15);
    gfx.fillTriangle(x - 1.5, y + 4, x + 1.5, y + 4, x, y - 2);
  }
  // Warm glow halo behind panel
  gfx.fillStyle(theme.accentColor, 0.04);
  gfx.fillCircle(cx, cy, Math.max(hw, hh) + 20);
  // Heat shimmer lines along top
  gfx.lineStyle(1, theme.accentColor, 0.12);
  for (let h = 0; h < 3; h++) {
    gfx.beginPath();
    for (let t = 0; t <= 15; t++) {
      const p = t / 15;
      const x = cx - hw + 15 + p * (hw * 2 - 30);
      const y = cy - hh + 3 - h * 4 + Math.sin(p * 6 + h) * 2;
      if (t === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.strokePath();
  }
}

function drawCrystalCorners(gfx, cx, cy, hw, hh, theme) {
  // Icicle fringe along top edge
  const icicleCount = 8;
  for (let i = 0; i < icicleCount; i++) {
    const t = (i + 0.5) / icicleCount;
    const ix = cx - hw + 10 + t * (hw * 2 - 20);
    const ih = 5 + Math.abs(Math.sin(i * 1.3)) * 10;
    const iw = 3 + Math.sin(i * 0.7) * 1.5;
    gfx.fillStyle(theme.accentColor, 0.3);
    gfx.fillTriangle(ix - iw, cy - hh + 2, ix + iw, cy - hh + 2, ix, cy - hh + 2 + ih);
    gfx.fillStyle(0xffffff, 0.12);
    gfx.fillTriangle(ix - iw * 0.4, cy - hh + 2, ix, cy - hh + 2, ix - 0.5, cy - hh + 2 + ih * 0.7);
  }
  // Crystal clusters at all four corners
  const corners = [[-1,-1], [1,-1], [-1,1], [1,1]];
  for (const [sx, sy] of corners) {
    const x = cx + sx * (hw - 8);
    const y = cy + sy * (hh - 8);
    // Multi-crystal cluster
    for (let c = 0; c < 3; c++) {
      const ox = c * sx * 4;
      const oy = c * sy * 3;
      const ch = 6 + c * 3;
      gfx.fillStyle(theme.accentColor, 0.25 + c * 0.05);
      gfx.fillTriangle(x + ox - 3, y + oy + ch, x + ox + 3, y + oy + ch, x + ox, y + oy);
    }
  }
  // Frost crack pattern along bottom and sides
  gfx.lineStyle(1, theme.accentColor, 0.2);
  for (const yOff of [-hh + 3, hh - 3]) {
    gfx.beginPath();
    gfx.moveTo(cx - hw + 8, cy + yOff);
    for (let i = 1; i <= 16; i++) {
      const x = cx - hw + 8 + i * (hw * 2 - 16) / 16;
      const y = cy + yOff + (i % 2 === 0 ? -2.5 : 2.5);
      gfx.lineTo(x, y);
    }
    gfx.strokePath();
  }
  // Cold glow behind panel
  gfx.fillStyle(theme.borderColor, 0.04);
  gfx.fillCircle(cx, cy, Math.max(hw, hh) + 15);
}

// Ambient particle spawners
function spawnLeaf(scene, panelFx, cx, cy, hw, hh) {
  const x = cx - hw + Math.random() * hw * 2;
  const leaf = scene.add.circle(x, cy - hh - 10, 3, panelFx.theme.borderColor, 0.5);
  leaf.setDepth(16);
  panelFx.ambientParticles.push(leaf);
  scene.tweens.add({
    targets: leaf,
    x: x + (Math.random() - 0.5) * 40,
    y: cy + hh + 10,
    rotation: Math.random() * 3,
    alpha: 0,
    duration: 3000,
    ease: 'Sine.inOut',
    onComplete: () => {
      leaf.destroy();
      const idx = panelFx.ambientParticles.indexOf(leaf);
      if (idx >= 0) panelFx.ambientParticles.splice(idx, 1);
    },
  });
}

function spawnBubble(scene, panelFx, cx, cy, hw, hh) {
  const x = cx - hw * 0.8 + Math.random() * hw * 1.6;
  const b = scene.add.circle(x, cy + hh + 5, 2 + Math.random() * 2, 0x88d8f8, 0.4);
  b.setDepth(16);
  panelFx.ambientParticles.push(b);
  scene.tweens.add({
    targets: b,
    y: cy - hh - 10,
    x: x + (Math.random() - 0.5) * 20,
    alpha: 0,
    scale: 0.3,
    duration: 2500,
    ease: 'Sine.out',
    onComplete: () => {
      b.destroy();
      const idx = panelFx.ambientParticles.indexOf(b);
      if (idx >= 0) panelFx.ambientParticles.splice(idx, 1);
    },
  });
}

function spawnWisp(scene, panelFx, cx, cy, hw, hh) {
  const x = cx - hw - 10;
  const y = cy + (Math.random() - 0.5) * hh;
  const w = scene.add.circle(x, y, 6, 0xffffff, 0.15);
  w.setDepth(16);
  panelFx.ambientParticles.push(w);
  scene.tweens.add({
    targets: w,
    x: cx + hw + 10,
    y: y + (Math.random() - 0.5) * 15,
    alpha: 0,
    duration: 3500,
    ease: 'Linear',
    onComplete: () => {
      w.destroy();
      const idx = panelFx.ambientParticles.indexOf(w);
      if (idx >= 0) panelFx.ambientParticles.splice(idx, 1);
    },
  });
}

function spawnEmber(scene, panelFx, cx, cy, hw, hh) {
  const x = cx - hw * 0.6 + Math.random() * hw * 1.2;
  const colors = [0xff6020, 0xf0a020, 0xff4010];
  const e = scene.add.circle(x, cy + hh + 5, 2, colors[Math.floor(Math.random() * 3)], 0.6);
  e.setDepth(16);
  panelFx.ambientParticles.push(e);
  scene.tweens.add({
    targets: e,
    y: cy - hh - 10,
    x: x + (Math.random() - 0.5) * 30,
    alpha: 0,
    scale: 0.2,
    duration: 1800,
    ease: 'Cubic.out',
    onComplete: () => {
      e.destroy();
      const idx = panelFx.ambientParticles.indexOf(e);
      if (idx >= 0) panelFx.ambientParticles.splice(idx, 1);
    },
  });
}

function spawnFrost(scene, panelFx, cx, cy, hw, hh) {
  // Frost crystals slowly pulse at random corner position
  const side = Math.random() > 0.5 ? 1 : -1;
  const x = cx + side * (hw - 5 + Math.random() * 8);
  const y = cy - hh + Math.random() * hh * 2;
  const f = scene.add.circle(x, y, 3, 0xc0e0f0, 0.3);
  f.setDepth(16);
  panelFx.ambientParticles.push(f);
  scene.tweens.add({
    targets: f,
    scale: 1.5,
    alpha: 0,
    duration: 3000,
    ease: 'Sine.inOut',
    onComplete: () => {
      f.destroy();
      const idx = panelFx.ambientParticles.indexOf(f);
      if (idx >= 0) panelFx.ambientParticles.splice(idx, 1);
    },
  });
}
