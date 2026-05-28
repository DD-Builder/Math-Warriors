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

// Corner decoration drawers
function drawLeafCorners(gfx, cx, cy, hw, hh, theme) {
  const corners = [[-1,-1], [1,-1], [-1,1], [1,1]];
  for (const [sx, sy] of corners) {
    const x = cx + sx * (hw - 10);
    const y = cy + sy * (hh - 8);
    gfx.fillStyle(theme.borderColor, 0.6);
    gfx.fillCircle(x, y, 6);
    gfx.fillCircle(x + sx * 5, y + sy * 3, 4);
  }
  // Vine along top
  gfx.lineStyle(2, theme.borderColor, 0.3);
  gfx.beginPath();
  gfx.moveTo(cx - hw + 15, cy - hh + 3);
  gfx.lineTo(cx + hw - 15, cy - hh + 3);
  gfx.strokePath();
}

function drawBubbleCorners(gfx, cx, cy, hw, hh, theme) {
  const positions = [
    { x: cx - hw + 8, y: cy + hh - 8 },
    { x: cx - hw + 18, y: cy + hh - 5 },
    { x: cx + hw - 10, y: cy + hh - 10 },
    { x: cx + hw - 20, y: cy + hh - 6 },
  ];
  for (const p of positions) {
    gfx.fillStyle(theme.borderColor, 0.25);
    gfx.fillCircle(p.x, p.y, 3 + Math.random() * 3);
  }
  // Wave curve at top
  gfx.lineStyle(2, theme.borderColor, 0.25);
  gfx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = cx - hw + 10 + t * (hw * 2 - 20);
    const y = cy - hh + 4 + Math.sin(t * Math.PI * 3) * 3;
    if (i === 0) gfx.moveTo(x, y);
    else gfx.lineTo(x, y);
  }
  gfx.strokePath();
}

function drawWispCorners(gfx, cx, cy, hw, hh, theme) {
  gfx.fillStyle(theme.accentColor, 0.15);
  gfx.fillCircle(cx - hw + 12, cy - hh + 10, 8);
  gfx.fillCircle(cx + hw - 12, cy - hh + 10, 8);
  // Soft glow behind panel
  gfx.fillStyle(0xffffff, 0.06);
  gfx.fillCircle(cx, cy, Math.max(hw, hh) + 10);
}

function drawFlameCorners(gfx, cx, cy, hw, hh, theme) {
  const corners = [[-1,-1], [1,-1], [-1,1], [1,1]];
  for (const [sx, sy] of corners) {
    const x = cx + sx * (hw - 8);
    const y = cy + sy * (hh - 6);
    gfx.fillStyle(theme.accentColor, 0.5);
    gfx.fillTriangle(x - 4, y + 6, x + 4, y + 6, x, y - 6);
    gfx.fillStyle(0xff4010, 0.3);
    gfx.fillTriangle(x - 2, y + 4, x + 2, y + 4, x, y - 3);
  }
  // Glow line along bottom
  gfx.fillStyle(theme.accentColor, 0.15);
  gfx.fillRect(cx - hw + 10, cy + hh - 4, hw * 2 - 20, 4);
}

function drawCrystalCorners(gfx, cx, cy, hw, hh, theme) {
  const topCorners = [[-1,-1], [1,-1]];
  for (const [sx] of topCorners) {
    const x = cx + sx * (hw - 8);
    const y = cy - hh + 2;
    gfx.fillStyle(theme.accentColor, 0.35);
    gfx.fillTriangle(x - 4, y + 12, x + 4, y + 12, x, y);
    gfx.fillStyle(theme.borderColor, 0.25);
    gfx.fillTriangle(x - 2, y + 10, x + 2, y + 10, x, y + 3);
  }
  // Frost line along bottom
  gfx.lineStyle(1, theme.accentColor, 0.3);
  gfx.beginPath();
  gfx.moveTo(cx - hw + 10, cy + hh - 3);
  for (let i = 1; i <= 10; i++) {
    const x = cx - hw + 10 + i * (hw * 2 - 20) / 10;
    const y = cy + hh - 3 + (i % 2 === 0 ? -2 : 2);
    gfx.lineTo(x, y);
  }
  gfx.strokePath();
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
