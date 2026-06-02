import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { makeRng } from '../systems/rng.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super({ key: SCENES.TITLE }); }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const rng = makeRng(55);

    fadeInScene(this);
    audio.playMusic('music/title');
    this.save = loadSave();

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const C = cv.getContext('2d');

    // ── 1. PALE MINT BACKGROUND ────────────────────────────────
    C.fillStyle = '#cee8c8';
    C.fillRect(0, 0, W, H);

    // Subtle warm glow in the center
    const grd = C.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.4);
    grd.addColorStop(0, 'rgba(255, 248, 220, 0.25)');
    grd.addColorStop(1, 'rgba(255, 248, 220, 0)');
    C.fillStyle = grd;
    C.fillRect(0, 0, W, H);

    // ── 2. DARK TEAL LAYER 1 — upper-left region ──────────────
    // Covers the top-left corner, curves smoothly toward center
    paperLayer(C, W, H, rng, [
      [0, 0], [W * 0.55, 0], // top edge
      [W * 0.50, H * 0.08],  // start curving down-left
      [W * 0.40, H * 0.25],
      [W * 0.30, H * 0.50],
      [W * 0.20, H * 0.65],
      [W * 0.05, H * 0.75],
      [0, H * 0.80],          // left edge
    ], '#0e2e30', 10);

    // ── 3. DARK TEAL LAYER 2 — upper-right region ─────────────
    paperLayer(C, W, H, rng, [
      [W, 0], [W * 0.45, 0],
      [W * 0.50, H * 0.06],
      [W * 0.58, H * 0.20],
      [W * 0.70, H * 0.42],
      [W * 0.82, H * 0.58],
      [W * 0.95, H * 0.70],
      [W, H * 0.75],
    ], '#143838', 10);

    // ── 4. TEAL-GREEN LAYER — left side, slightly brighter ────
    paperLayer(C, W, H, rng, [
      [0, 0], [W * 0.35, 0],
      [W * 0.32, H * 0.10],
      [W * 0.25, H * 0.30],
      [W * 0.15, H * 0.50],
      [W * 0.08, H * 0.62],
      [0, H * 0.68],
    ], '#1a5448', 8);

    // ── 5. BRIGHT TEAL LAYER — right side accent ──────────────
    paperLayer(C, W, H, rng, [
      [W, 0], [W * 0.65, 0],
      [W * 0.68, H * 0.10],
      [W * 0.75, H * 0.28],
      [W * 0.85, H * 0.42],
      [W * 0.93, H * 0.55],
      [W, H * 0.60],
    ], '#1e7868', 8);

    // ── 6. CORAL/WARM ACCENT — blob on upper left ─────────────
    blobShape(C, W * 0.12, H * 0.22, W * 0.15, H * 0.14, '#c85840', rng, 8);

    // ── 7. GREEN HILL LAYER 1 (darkest, farthest) ─────────────
    hillLayer(C, W, H, H * 0.52, 100, 3, '#287038', rng, 18);

    // ── 8. GREEN HILL LAYER 2 ─────────────────────────────────
    hillLayer(C, W, H, H * 0.62, 70, 4, '#3c9040', rng, 16);

    // ── 9. GREEN HILL LAYER 3 ─────────────────────────────────
    hillLayer(C, W, H, H * 0.72, 50, 5, '#50a848', rng, 16);

    // ── 10. GREEN HILL LAYER 4 (brightest, closest) ───────────
    hillLayer(C, W, H, H * 0.82, 35, 6, '#68c050', rng, 14);

    // ── 11. LIME GROUND ───────────────────────────────────────
    hillLayer(C, W, H, H * 0.90, 20, 8, '#78d860', rng, 12);

    // ── TREES ─────────────────────────────────────────────────
    // Cream/white tree on right — trunk starts ON the hill
    drawTree(C, W * 0.75, H * 0.42, H * 0.38, '#ece0c8', '#d8d0b0', rng, true);
    // Dark green trees on left — rooted on hills
    drawTree(C, W * 0.08, H * 0.52, H * 0.22, '#1a4828', '#288838', rng, false);
    drawTree(C, W * 0.20, H * 0.56, H * 0.18, '#1e5030', '#308840', rng, false);
    drawTree(C, W * 0.32, H * 0.60, H * 0.14, '#245838', '#389048', rng, false);

    // ── FLOWERS ───────────────────────────────────────────────
    const fCols = ['#f06888', '#f0a040', '#88c0e0', '#e060a0', '#f08060', '#b080d0', '#f0e0f0', '#f0c060'];
    for (let i = 0; i < 40; i++) {
      const fx = W * (0.02 + rng() * 0.96);
      const fy = H * (0.74 + rng() * 0.20);
      drawFlower(C, fx, fy, 4 + rng() * 8, fCols[Math.floor(rng() * fCols.length)], rng);
    }

    // ── GRASS ─────────────────────────────────────────────────
    for (let i = 0; i < 70; i++) {
      const gx = rng() * W, gy = H * (0.76 + rng() * 0.18);
      C.fillStyle = ['#48a838', '#58b848', '#68c850'][Math.floor(rng() * 3)];
      for (let b = 0; b < 3; b++) {
        C.beginPath();
        const bx = gx + (rng() - 0.5) * 5;
        C.moveTo(bx - 1, gy);
        C.lineTo(bx, gy - 4 - rng() * 10);
        C.lineTo(bx + 1, gy);
        C.fill();
      }
    }

    // ── CREAM WAVY BORDER ─────────────────────────────────────
    drawWavyBorder(C, W, H, 35, '#ede4d4', rng);

    // ── RENDER ─────────────────────────────────────────────────
    const key = 'title-' + Date.now();
    this.textures.addCanvas(key, cv);
    this.add.image(W / 2, H / 2, key).setDepth(0);

    // ── BUTTERFLIES ───────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const bx = W * (0.08 + rng() * 0.84);
      const by = H * (0.10 + rng() * 0.55);
      const bs = 10 + rng() * 12;
      const bc = [0xf06888, 0xf0a040, 0xe8e8f0, 0xf08868, 0xe060a0, 0xffffff][Math.floor(rng() * 6)];
      const g = this.add.graphics().setDepth(8);
      g.fillStyle(0x3a2410, 1); g.fillRect(bx - 1, by - bs * 0.3, 2, bs * 0.6);
      g.fillStyle(bc, 0.9);
      g.fillCircle(bx - bs * 0.38, by - bs * 0.1, bs * 0.34);
      g.fillCircle(bx + bs * 0.38, by - bs * 0.1, bs * 0.34);
      g.fillCircle(bx - bs * 0.26, by + bs * 0.18, bs * 0.24);
      g.fillCircle(bx + bs * 0.26, by + bs * 0.18, bs * 0.24);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(bx - bs * 0.38, by - bs * 0.1, bs * 0.09);
      g.fillCircle(bx + bs * 0.38, by - bs * 0.1, bs * 0.09);
      this.tweens.add({ targets: g, x: (rng()-0.5)*40, y: (rng()-0.5)*20,
        duration: 3000+rng()*3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    // ── TITLE TEXT ─────────────────────────────────────────────
    const ty = H * 0.17;
    this.add.text(area.cx, ty, 'MATH', {
      fontFamily: '"Fredoka One","Baloo 2",sans-serif', fontSize: '120px',
      fontStyle: 'bold', color: '#4080d8', stroke: '#1a3060', strokeThickness: 10,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10);
    this.add.text(area.cx, ty + 118, 'WARRIORS', {
      fontFamily: '"Fredoka One","Baloo 2",sans-serif', fontSize: '96px',
      fontStyle: 'bold', color: '#e05050', stroke: '#601818', strokeThickness: 9,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10);
    this.add.text(area.cx, ty + 218, 'An Educational Adventure', {
      fontFamily: '"Fredoka One","Baloo 2",sans-serif', fontSize: '30px',
      color: '#f0d060', stroke: '#5a3010', strokeThickness: 5,
      shadow: { offsetX: 3, offsetY: 4, color: 'rgba(10,20,20,0.4)', blur: 5, fill: true },
    }).setOrigin(0.5).setDepth(10);

    // ── BUTTONS ────────────────────────────────────────────────
    dp(PaperButton(this, area.cx, H * 0.62, 'PLAY', {
      w: 400, h: 80, color: 0xc83030, fontSize: 34,
      onClick: () => { audio.play('ui/confirm'); transitionTo(this, SCENES.SAVE_SELECT, undefined, 300); },
    }), 10);
    dp(PaperButton(this, area.right-75, area.top+35, 'SETTINGS', {
      w: 160, h: 54, color: 0x6090c0, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    }), 10);
    dp(PaperButton(this, area.left+75, area.top+35, 'TUTORIAL', {
      w: 160, h: 54, color: 0xc09030, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    }), 10);
    this.add.text(area.right, area.bottom+40, `v${VERSION}`,
      { ...TEXT.stat(), fontSize: '11px', color: '#8a7a60' }).setOrigin(1,1).setAlpha(0.3).setDepth(10);
  }
}

function dp(b, d) { for (const k of ['bg','shadow','label','zone']) if (b[k]) b[k].setDepth(d); }

// ════════════════════════════════════════════════════════════════
// DRAWING FUNCTIONS — all use plain Canvas 2D, source-over only
// ════════════════════════════════════════════════════════════════

/**
 * Draw a paper layer defined by corner points. Adds organic wobble
 * to the edges and draws a shadow underneath.
 */
function paperLayer(C, W, H, rng, controlPts, color, shadowDist) {
  // Build smooth path with wobble
  const pts = [];
  for (let i = 0; i < controlPts.length - 1; i++) {
    const [x0, y0] = controlPts[i];
    const [x1, y1] = controlPts[i + 1];
    const segs = 12;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      pts.push([
        x0 + (x1 - x0) * t + (rng() - 0.5) * 12,
        y0 + (y1 - y0) * t + (rng() - 0.5) * 8,
      ]);
    }
  }
  pts.push(controlPts[controlPts.length - 1]);

  function drawPath(ox, oy) {
    C.beginPath();
    C.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) C.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    // Close back to the nearest edge
    const last = pts[pts.length - 1];
    const first = pts[0];
    // Close via the screen edge
    if (first[0] <= 0 && last[0] <= 0) { C.lineTo(ox, H + oy); C.lineTo(ox, oy); }
    else if (first[0] >= W - 1 && last[0] >= W - 1) { C.lineTo(W + ox, H + oy); C.lineTo(W + ox, oy); }
    else if (first[1] <= 0 && last[0] <= 0) { C.lineTo(ox, last[1] + oy); C.lineTo(ox, oy); }
    else if (first[1] <= 0 && last[0] >= W - 1) { C.lineTo(W + ox, last[1] + oy); C.lineTo(W + ox, oy); }
    else { C.lineTo(last[0] + ox, H + oy); C.lineTo(first[0] + ox, H + oy); }
    C.closePath();
    C.fill();
  }

  C.fillStyle = 'rgba(0,0,0,0.75)';
  drawPath(6, shadowDist);
  C.fillStyle = color;
  drawPath(0, 0);
}

/**
 * Draw an organic blob shape with shadow.
 */
function blobShape(C, cx, cy, rx, ry, color, rng, shadowDist) {
  function draw(ox, oy) {
    C.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const w = 0.75 + rng() * 0.5;
      const x = cx + Math.cos(a) * rx * w + ox;
      const y = cy + Math.sin(a) * ry * w + oy;
      i === 0 ? C.moveTo(x, y) : C.lineTo(x, y);
    }
    C.closePath();
    C.fill();
  }
  C.fillStyle = 'rgba(0,0,0,0.7)';
  draw(5, shadowDist);
  C.fillStyle = color;
  draw(0, 0);
}

/**
 * Draw a rolling hill layer with shadow.
 */
function hillLayer(C, W, H, baseY, amplitude, bumps, color, rng, shadowDist) {
  const pts = [];
  const steps = bumps * 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -30 + t * (W + 60);
    const y = baseY
      - Math.sin(t * Math.PI * bumps) * amplitude * (0.5 + rng() * 0.5)
      - Math.sin(t * Math.PI * bumps * 2.3 + 1.5) * amplitude * 0.25
      + (rng() - 0.5) * amplitude * 0.05;
    pts.push([x, y]);
  }

  function draw(ox, oy) {
    C.beginPath();
    C.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (const p of pts) C.lineTo(p[0] + ox, p[1] + oy);
    C.lineTo(W + 30 + ox, H + 20 + oy);
    C.lineTo(-30 + ox, H + 20 + oy);
    C.closePath();
    C.fill();
  }

  C.fillStyle = 'rgba(0,0,0,0.7)';
  draw(5, shadowDist);
  C.fillStyle = color;
  draw(0, 0);
}

/**
 * Draw a tree with trunk, branches, and canopy circles.
 */
function drawTree(C, x, groundY, height, trunkColor, canopyColor, rng, isCream) {
  const tw = height * (isCream ? 0.04 : 0.08);
  const trunkH = height * 0.45;
  const trunkTop = groundY - trunkH;

  // Shadow
  C.fillStyle = 'rgba(0,0,0,0.65)';
  C.fillRect(x - tw / 2 + 6, groundY - trunkH + 10, tw, trunkH);
  // Trunk
  C.fillStyle = trunkColor;
  C.fillRect(x - tw / 2, groundY - trunkH, tw, trunkH);

  if (isCream) {
    // Branches for cream tree
    C.strokeStyle = trunkColor;
    C.lineWidth = tw * 0.6;
    C.lineCap = 'round';
    const brs = [[-0.6, 0.35], [-0.15, 0.40], [0.45, 0.30], [0.85, 0.20]];
    for (const b of brs) {
      const bx = x + Math.sin(b[0]) * height * b[1];
      const by = trunkTop + height * 0.08 - Math.cos(b[0]) * height * b[1];
      C.strokeStyle = 'rgba(0,0,0,0.6)';
      C.beginPath(); C.moveTo(x + 3, trunkTop + height * 0.08 + 6); C.lineTo(bx + 3, by + 6); C.stroke();
      C.strokeStyle = trunkColor;
      C.beginPath(); C.moveTo(x, trunkTop + height * 0.08); C.lineTo(bx, by); C.stroke();
      if (rng() < 0.7) drawFlower(C, bx, by, 4 + rng() * 4, '#f06888', rng);
    }
  }

  // Canopy
  const canopyY = trunkTop - height * 0.05;
  const cr = height * (isCream ? 0.14 : 0.22);
  const offsets = [[0, 0, 1.0], [-0.4, -0.3, 0.75], [0.4, -0.2, 0.7], [0, -0.5, 0.6]];
  for (const o of offsets) {
    const cx = x + o[0] * cr * 2, cy = canopyY + o[1] * cr * 2, r = cr * o[2];
    C.fillStyle = 'rgba(0,0,0,0.6)';
    C.beginPath(); C.arc(cx + 3, cy + 6, r, 0, Math.PI * 2); C.fill();
    C.fillStyle = canopyColor;
    C.beginPath(); C.arc(cx, cy, r, 0, Math.PI * 2); C.fill();
  }
}

/**
 * Small flower with 5 petals.
 */
function drawFlower(C, x, y, size, color, rng) {
  C.strokeStyle = '#388830';
  C.lineWidth = 1.2;
  C.beginPath(); C.moveTo(x, y + size * 0.4); C.lineTo(x, y + size * 0.4 + 4 + rng() * 5); C.stroke();
  C.fillStyle = color;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
    C.beginPath();
    C.arc(x + Math.cos(a) * size * 0.4, y + Math.sin(a) * size * 0.4, size * 0.32, 0, Math.PI * 2);
    C.fill();
  }
  C.fillStyle = '#fff080';
  C.beginPath(); C.arc(x, y, size * 0.18, 0, Math.PI * 2); C.fill();
}

/**
 * Cream wavy border — 4 strips with wobbly inner edges, drawn on top.
 */
function drawWavyBorder(C, W, H, bw, color, rng) {
  C.fillStyle = color;
  // Top
  C.beginPath(); C.moveTo(0, 0); C.lineTo(W, 0); C.lineTo(W, bw);
  for (let i = 60; i >= 0; i--) { const t = i/60; C.lineTo(t*W, bw + Math.sin(t*Math.PI*7)*7 + (rng()-0.5)*4); }
  C.closePath(); C.fill();
  // Bottom
  C.beginPath(); C.moveTo(0, H); C.lineTo(W, H); C.lineTo(W, H - bw);
  for (let i = 60; i >= 0; i--) { const t = i/60; C.lineTo(t*W, H - bw + Math.sin(t*Math.PI*7+1)*7 + (rng()-0.5)*4); }
  C.closePath(); C.fill();
  // Left
  C.beginPath(); C.moveTo(0, 0); C.lineTo(0, H); C.lineTo(bw, H);
  for (let i = 60; i >= 0; i--) { const t = i/60; C.lineTo(bw + Math.sin(t*Math.PI*6)*7 + (rng()-0.5)*4, t*H); }
  C.closePath(); C.fill();
  // Right
  C.beginPath(); C.moveTo(W, 0); C.lineTo(W, H); C.lineTo(W - bw, H);
  for (let i = 60; i >= 0; i--) { const t = i/60; C.lineTo(W - bw + Math.sin(t*Math.PI*6+1)*7 + (rng()-0.5)*4, t*H); }
  C.closePath(); C.fill();
}
