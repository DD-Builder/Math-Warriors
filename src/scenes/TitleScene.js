import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { makeRng } from '../systems/rng.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

/**
 * Title screen — full-screen layered papercut diorama.
 *
 * NO portal/window/frame concept. The entire screen IS the papercut art,
 * exactly like the reference image. Organic wavy paper layers fill the
 * viewport from edge to edge. Title text floats over the scene.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const rng = makeRng(77);

    fadeInScene(this);
    audio.playMusic('music/title');
    this.save = loadSave();

    // Draw entire scene onto one canvas for maximum control
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const G = cv.getContext('2d');

    const hex = (c) => {
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      return `rgb(${r},${g},${b})`;
    };
    const hexa = (c, a) => {
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      return `rgba(${r},${g},${b},${a})`;
    };

    // ── BACKGROUND: pale mint ──────────────────────────────────
    G.fillStyle = hex(0xd8eed4);
    G.fillRect(0, 0, W, H);

    // ── WARM GLOW: golden light from upper-center ──────────────
    const glowCx = W * 0.5, glowCy = H * 0.32;
    for (let ring = 10; ring >= 1; ring--) {
      const r = Math.min(W, H) * 0.5 * (ring / 10);
      G.fillStyle = hexa(0xfff0a0, 0.06 * (10 - ring) / 10);
      G.beginPath();
      G.arc(glowCx, glowCy, r, 0, Math.PI * 2);
      G.fill();
    }

    // ── HELPER: draw a wavy paper layer (shadow + fill) ────────
    function wavyLayer(baseY, amplitude, bumps, color, shadowOy) {
      const pts = [];
      const steps = bumps * 14;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * W;
        const y = baseY
          - Math.sin(t * Math.PI * bumps) * amplitude * (0.5 + rng() * 0.5)
          - Math.sin(t * Math.PI * bumps * 2.3 + 1.5) * amplitude * 0.35
          - Math.sin(t * Math.PI * bumps * 4.7 + 3.1) * amplitude * 0.12
          + (rng() - 0.5) * amplitude * 0.08;
        pts.push({ x, y });
      }

      // Shadow
      G.fillStyle = hexa(0x0a1a1a, 0.4);
      G.beginPath();
      G.moveTo(pts[0].x + 4, pts[0].y + shadowOy);
      for (const p of pts) G.lineTo(p.x + 4, p.y + shadowOy);
      G.lineTo(W + 4, H + shadowOy);
      G.lineTo(4, H + shadowOy);
      G.closePath();
      G.fill();

      // Fill
      G.fillStyle = hex(color);
      G.beginPath();
      G.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) G.lineTo(p.x, p.y);
      G.lineTo(W, H);
      G.lineTo(0, H);
      G.closePath();
      G.fill();

      return pts;
    }

    // ── LAYER 1: Dark teal swooping from top-left ──────────────
    // (like the reference — dark layers curve in from the edges)
    G.fillStyle = hexa(0x0a1a1a, 0.35);
    G.beginPath();
    G.moveTo(-20 + 5, -20 + 10);
    curvedEdge(G, W, H, rng, 0.55, 0.65, 5, 10);
    G.lineTo(W + 5, H + 10);
    G.lineTo(-20 + 5, H + 10);
    G.closePath();
    G.fill();

    G.fillStyle = hex(0x143838);
    G.beginPath();
    G.moveTo(-20, -20);
    curvedEdge(G, W, H, rng, 0.55, 0.65, 0, 0);
    G.lineTo(W, H);
    G.lineTo(-20, H);
    G.closePath();
    G.fill();

    // ── LAYER 2: Teal-green from top-right ─────────────────────
    G.fillStyle = hexa(0x0a1a1a, 0.35);
    G.beginPath();
    G.moveTo(W + 20 + 5, -20 + 10);
    curvedEdge2(G, W, H, rng, 0.50, 0.60, 5, 10);
    G.lineTo(-20 + 5, H + 10);
    G.lineTo(W + 20 + 5, H + 10);
    G.closePath();
    G.fill();

    G.fillStyle = hex(0x1a5848);
    G.beginPath();
    G.moveTo(W + 20, -20);
    curvedEdge2(G, W, H, rng, 0.50, 0.60, 0, 0);
    G.lineTo(-20, H);
    G.lineTo(W + 20, H);
    G.closePath();
    G.fill();

    // ── LAYER 3: Coral/warm accent layer (small) ───────────────
    G.fillStyle = hexa(0x0a1a1a, 0.3);
    drawBlobShape(G, W * 0.08, H * 0.15, W * 0.35, H * 0.45, rng, 6, 12);
    G.fillStyle = hex(0xd06848);
    drawBlobShape(G, W * 0.08, H * 0.15, W * 0.35, H * 0.45, rng, 0, 0);

    // ── LAYER 4: Medium green rolling hills ────────────────────
    wavyLayer(H * 0.62, H * 0.10, 5, 0x2a7838, 10);

    // ── LAYER 5: Bright green hills ────────────────────────────
    wavyLayer(H * 0.72, H * 0.08, 6, 0x48a840, 8);

    // ── LAYER 6: Lime green foreground ─────────────────────────
    const fgPts = wavyLayer(H * 0.82, H * 0.06, 7, 0x68c848, 8);

    // ── CREAM TREE on right side ───────────────────────────────
    drawCreamTree(G, W * 0.72, H * 0.35, H * 0.40, rng);

    // ── DARK TREES on left side ────────────────────────────────
    drawDarkTree(G, W * 0.10, H * 0.40, H * 0.32, 0x1a4828, rng);
    drawDarkTree(G, W * 0.22, H * 0.45, H * 0.25, 0x245838, rng);

    // ── FLOWERS scattered on foreground ────────────────────────
    const flowerColors = [0xf06888, 0xf0a040, 0x80c0e8, 0xe060a0, 0xf08060];
    for (let i = 0; i < 22; i++) {
      const fx = W * (0.05 + rng() * 0.90);
      const fy = H * (0.75 + rng() * 0.15);
      const fs = 6 + rng() * 8;
      const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
      drawFlower(G, fx, fy, fs, fc, rng);
    }

    // ── GRASS TUFTS along foreground edge ──────────────────────
    for (let i = 0; i < 35; i++) {
      const gx = rng() * W;
      const gy = H * (0.78 + rng() * 0.10);
      G.fillStyle = hex(0x48a838 + Math.floor(rng() * 0x202020));
      for (let b = 0; b < 3; b++) {
        const bx = gx + (rng() - 0.5) * 8;
        G.beginPath();
        G.moveTo(bx - 2, gy);
        G.lineTo(bx + (rng() - 0.5) * 3, gy - 8 - rng() * 10);
        G.lineTo(bx + 2, gy);
        G.closePath();
        G.fill();
      }
    }

    // ── Outer cream border (like the reference image edge) ─────
    drawCreamBorder(G, W, H, rng);

    // ── Register as Phaser texture ─────────────────────────────
    const key = 'title-bg-' + Date.now();
    this.textures.addCanvas(key, cv);
    this.add.image(W / 2, H / 2, key).setDepth(0);

    // ── BUTTERFLIES (Phaser objects for animation) ─────────────
    const bColors = [0xf06888, 0xf0a040, 0xe8e0f0, 0xf08868, 0xe0e8f0];
    for (let i = 0; i < 6; i++) {
      const bx = W * (0.1 + rng() * 0.8);
      const by = H * (0.15 + rng() * 0.55);
      const bc = bColors[Math.floor(rng() * bColors.length)];
      const bSize = 10 + rng() * 12;
      const bGfx = this.add.graphics().setDepth(8);
      // Body
      bGfx.fillStyle(0x3a2410, 1);
      bGfx.fillRect(bx - 1, by - bSize * 0.3, 2, bSize * 0.6);
      // Wings
      bGfx.fillStyle(bc, 0.9);
      bGfx.fillCircle(bx - bSize * 0.4, by - bSize * 0.15, bSize * 0.38);
      bGfx.fillCircle(bx + bSize * 0.4, by - bSize * 0.15, bSize * 0.38);
      bGfx.fillCircle(bx - bSize * 0.3, by + bSize * 0.2, bSize * 0.28);
      bGfx.fillCircle(bx + bSize * 0.3, by + bSize * 0.2, bSize * 0.28);
      // Wing spots
      bGfx.fillStyle(0xffffff, 0.5);
      bGfx.fillCircle(bx - bSize * 0.4, by - bSize * 0.15, bSize * 0.12);
      bGfx.fillCircle(bx + bSize * 0.4, by - bSize * 0.15, bSize * 0.12);
      // Drift animation
      this.tweens.add({
        targets: bGfx, x: (rng() - 0.5) * 40, y: (rng() - 0.5) * 20,
        duration: 3000 + rng() * 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }

    // ── TITLE TEXT ──────────────────────────────────────────────
    const titleY = H * 0.22;

    this.add.text(area.cx, titleY, 'MATH', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '110px', fontStyle: 'bold',
      color: '#4080d8',
      stroke: '#1a3060', strokeThickness: 10,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 10, fill: true },
    }).setOrigin(0.5).setDepth(10);

    this.add.text(area.cx, titleY + 110, 'WARRIORS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '90px', fontStyle: 'bold',
      color: '#e05050',
      stroke: '#601818', strokeThickness: 9,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 10, fill: true },
    }).setOrigin(0.5).setDepth(10);

    this.add.text(area.cx, titleY + 210, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '30px',
      color: '#f0d060',
      stroke: '#5a3010', strokeThickness: 5,
      shadow: { offsetX: 3, offsetY: 4, color: 'rgba(10,20,20,0.4)', blur: 5, fill: true },
    }).setOrigin(0.5).setDepth(10);

    // ── PLAY BUTTON ────────────────────────────────────────────
    const playBtn = PaperButton(this, area.cx, H * 0.68, 'PLAY', {
      w: 420, h: 85, color: 0xc83030, fontSize: 34,
      onClick: () => {
        audio.play('ui/confirm');
        transitionTo(this, SCENES.SAVE_SELECT, undefined, 300);
      },
    });
    setDepthAll(playBtn, 10);

    // ── CORNER BUTTONS ─────────────────────────────────────────
    const settingsBtn = PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 160, h: 54, color: 0x6090c0, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    });
    setDepthAll(settingsBtn, 10);

    const tutorialBtn = PaperButton(this, area.left + 75, area.top + 35, 'TUTORIAL', {
      w: 160, h: 54, color: 0xc09030, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    });
    setDepthAll(tutorialBtn, 10);

    this.add.text(area.right, area.bottom + 40, `v${VERSION}`, {
      ...TEXT.stat(), fontSize: '11px', color: '#8a7a60',
    }).setOrigin(1, 1).setAlpha(0.3).setDepth(10);
  }
}

function setDepthAll(btn, d) {
  if (btn.bg) btn.bg.setDepth(d);
  if (btn.shadow) btn.shadow.setDepth(d);
  if (btn.label) btn.label.setDepth(d);
  if (btn.zone) btn.zone.setDepth(d);
}

// ════════════════════════════════════════════════════════════════
// Canvas drawing helpers — pure Canvas 2D, no Phaser
// ════════════════════════════════════════════════════════════════

function hex(c) {
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return `rgb(${r},${g},${b})`;
}

/**
 * Curved edge swooping from top-left toward bottom-right.
 * Like the reference image's dark teal layer curving from the left side.
 */
function curvedEdge(G, W, H, rng, startFrac, endFrac, ox, oy) {
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Curve goes from top-left area to bottom-right
    const x = W * (startFrac + t * (1 - startFrac)) + (rng() - 0.5) * 15 + ox;
    const baseY = H * (endFrac * t * t);
    const wave = Math.sin(t * Math.PI * 3) * H * 0.06 + Math.sin(t * Math.PI * 7) * H * 0.02;
    G.lineTo(x, baseY + wave + (rng() - 0.5) * 8 + oy);
  }
}

/**
 * Curved edge swooping from top-right toward bottom-left.
 */
function curvedEdge2(G, W, H, rng, startFrac, endFrac, ox, oy) {
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = W * ((1 - startFrac) - t * (1 - startFrac)) + (rng() - 0.5) * 15 + ox;
    const baseY = H * (endFrac * t * t);
    const wave = Math.sin(t * Math.PI * 3 + 1) * H * 0.06 + Math.sin(t * Math.PI * 7 + 2) * H * 0.02;
    G.lineTo(x, baseY + wave + (rng() - 0.5) * 8 + oy);
  }
}

/**
 * Draw a small organic blob shape (for coral accent layer).
 */
function drawBlobShape(G, cx, cy, rx, ry, rng, ox, oy) {
  G.beginPath();
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const wobble = 0.85 + rng() * 0.3;
    const x = cx + Math.cos(a) * rx * wobble + ox;
    const y = cy + Math.sin(a) * ry * wobble + oy;
    if (i === 0) G.moveTo(x, y);
    else G.lineTo(x, y);
  }
  G.closePath();
  G.fill();
}

/**
 * Cream-colored tree with visible branches (like the reference white tree).
 */
function drawCreamTree(G, x, y, height, rng) {
  const trunkW = height * 0.06;

  // Shadow
  G.fillStyle = 'rgba(10,26,26,0.3)';
  G.fillRect(x - trunkW / 2 + 4, y + 8, trunkW, height * 0.55);

  // Trunk
  G.fillStyle = hex(0xf0e8d0);
  G.fillRect(x - trunkW / 2, y, trunkW, height * 0.55);

  // Branches
  G.strokeStyle = hex(0xf0e8d0);
  G.lineWidth = trunkW * 0.6;
  G.lineCap = 'round';
  const branches = [
    { angle: -0.8, len: height * 0.35 },
    { angle: -0.3, len: height * 0.40 },
    { angle: 0.5, len: height * 0.30 },
    { angle: 0.9, len: height * 0.25 },
  ];
  const branchStart = y + height * 0.15;
  for (const b of branches) {
    // Branch shadow
    G.strokeStyle = 'rgba(10,26,26,0.25)';
    G.beginPath();
    G.moveTo(x + 3, branchStart + 6);
    G.lineTo(
      x + Math.sin(b.angle) * b.len + 3,
      branchStart - Math.cos(b.angle) * b.len + 6
    );
    G.stroke();
    // Branch
    G.strokeStyle = hex(0xf0e8d0);
    G.beginPath();
    G.moveTo(x, branchStart);
    G.lineTo(
      x + Math.sin(b.angle) * b.len,
      branchStart - Math.cos(b.angle) * b.len
    );
    G.stroke();

    // Small flowers at branch tips
    if (rng() < 0.7) {
      const tipX = x + Math.sin(b.angle) * b.len;
      const tipY = branchStart - Math.cos(b.angle) * b.len;
      const fc = [0xf06888, 0xf08060, 0xe060a0][Math.floor(rng() * 3)];
      drawFlower(G, tipX, tipY, 5 + rng() * 4, fc, rng);
    }
  }

  // Canopy circles (light green)
  G.fillStyle = 'rgba(10,26,26,0.2)';
  G.beginPath(); G.arc(x + 5, y - height * 0.05 + 8, height * 0.18, 0, Math.PI * 2); G.fill();
  G.fillStyle = hex(0x48a848);
  G.beginPath(); G.arc(x, y - height * 0.05, height * 0.18, 0, Math.PI * 2); G.fill();
  G.fillStyle = hex(0x58c050);
  G.beginPath(); G.arc(x - height * 0.08, y - height * 0.12, height * 0.14, 0, Math.PI * 2); G.fill();
  G.fillStyle = hex(0x68d058);
  G.beginPath(); G.arc(x + height * 0.10, y - height * 0.10, height * 0.12, 0, Math.PI * 2); G.fill();
}

/**
 * Dark green tree silhouette.
 */
function drawDarkTree(G, x, y, height, color, rng) {
  const trunkW = height * 0.07;
  // Shadow
  G.fillStyle = 'rgba(10,26,26,0.3)';
  G.fillRect(x - trunkW / 2 + 3, y + 6, trunkW, height * 0.5);
  // Trunk
  G.fillStyle = hex(0x2a1a10);
  G.fillRect(x - trunkW / 2, y, trunkW, height * 0.5);
  // Canopy
  G.fillStyle = 'rgba(10,26,26,0.25)';
  G.beginPath(); G.arc(x + 4, y - height * 0.1 + 8, height * 0.22, 0, Math.PI * 2); G.fill();
  G.fillStyle = hex(color);
  G.beginPath(); G.arc(x, y - height * 0.1, height * 0.22, 0, Math.PI * 2); G.fill();
  G.fillStyle = hex(color + 0x101010);
  G.beginPath(); G.arc(x - height * 0.06, y - height * 0.2, height * 0.15, 0, Math.PI * 2); G.fill();
  G.beginPath(); G.arc(x + height * 0.08, y - height * 0.15, height * 0.13, 0, Math.PI * 2); G.fill();
}

/**
 * Small flower: 5 petals + center.
 */
function drawFlower(G, x, y, size, color, rng) {
  // Stem
  G.strokeStyle = hex(0x388830);
  G.lineWidth = 1.5;
  G.beginPath();
  G.moveTo(x, y + size);
  G.lineTo(x + (rng() - 0.5) * 3, y + size + 8 + rng() * 6);
  G.stroke();
  // Petals
  G.fillStyle = hex(color);
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
    G.beginPath();
    G.arc(x + Math.cos(a) * size * 0.5, y + Math.sin(a) * size * 0.5, size * 0.38, 0, Math.PI * 2);
    G.fill();
  }
  // Center
  G.fillStyle = hex(0xfff080);
  G.beginPath();
  G.arc(x, y, size * 0.22, 0, Math.PI * 2);
  G.fill();
}

/**
 * Cream-colored outer border with organic wavy inner edge.
 * Like the reference image's cream/beige border around the whole composition.
 */
function drawCreamBorder(G, W, H, rng) {
  const borderW = 35;
  const color = 0xf0e8d8;

  // Shadow behind border
  G.fillStyle = 'rgba(10,26,26,0.25)';
  drawBorderPath(G, W, H, borderW + 8, rng, 3, 5);
  G.fill();

  // Main cream border
  G.fillStyle = hex(color);
  drawBorderPath(G, W, H, borderW, rng, 0, 0);
  G.fill();
}

function drawBorderPath(G, W, H, borderW, rng, ox, oy) {
  G.beginPath();
  // Outer rect (clockwise)
  G.moveTo(ox, oy);
  G.lineTo(W + ox, oy);
  G.lineTo(W + ox, H + oy);
  G.lineTo(ox, H + oy);
  G.closePath();

  // Inner cutout (counter-clockwise) with wavy edges
  const inset = borderW;
  const steps = 60;
  // Top edge (left to right)
  G.moveTo(inset + ox, inset + oy);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = inset + t * (W - 2 * inset) + ox;
    const wobble = Math.sin(t * Math.PI * 8) * 6 + (rng() - 0.5) * 4;
    G.lineTo(x, inset + wobble + oy);
  }
  // Right edge (top to bottom)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = inset + t * (H - 2 * inset) + oy;
    const wobble = Math.sin(t * Math.PI * 6) * 6 + (rng() - 0.5) * 4;
    G.lineTo(W - inset + wobble + ox, y);
  }
  // Bottom edge (right to left)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = W - inset - t * (W - 2 * inset) + ox;
    const wobble = Math.sin(t * Math.PI * 8 + 1) * 6 + (rng() - 0.5) * 4;
    G.lineTo(x, H - inset + wobble + oy);
  }
  // Left edge (bottom to top)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = H - inset - t * (H - 2 * inset) + oy;
    const wobble = Math.sin(t * Math.PI * 6 + 1) * 6 + (rng() - 0.5) * 4;
    G.lineTo(inset + wobble + ox, y);
  }
  G.closePath();
}
