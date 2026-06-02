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
    const rng = makeRng(77);

    fadeInScene(this);
    audio.playMusic('music/title');
    this.save = loadSave();

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const G = cv.getContext('2d');

    // ────────────────────────────────────────────────────────────
    // ALL drawing in simple source-over. No compositing tricks.
    // Every layer: shadow first (offset 5-12px), then fill.
    // 7 distinct paper layers, back to front.
    // ────────────────────────────────────────────────────────────

    // BG: pale mint — fills entire canvas to confirm it renders
    G.fillStyle = rgb(0xd0eacc);
    G.fillRect(0, 0, W, H);

    // DEBUG: bright red X to prove canvas renders
    G.strokeStyle = 'red'; G.lineWidth = 5;
    G.beginPath(); G.moveTo(0,0); G.lineTo(W,H); G.stroke();
    G.beginPath(); G.moveTo(W,0); G.lineTo(0,H); G.stroke();

    // Warm glow behind everything
    for (let i = 8; i >= 1; i--) {
      G.fillStyle = rgba(0xfff8d0, 0.05 * (8 - i) / 8);
      G.beginPath(); G.arc(W * 0.5, H * 0.33, W * 0.35 * (i / 8), 0, Math.PI * 2); G.fill();
    }

    // ── LAYER 1: Dark teal from left (deepest) ─────────────────
    swoopFromLeft(G, W, H, 0x0e2e30, 0.48, rng, 12);

    // ── LAYER 2: Dark teal from right ──────────────────────────
    swoopFromRight(G, W, H, 0x143e40, 0.42, rng, 12);

    // ── LAYER 3: Coral/orange accent blob (upper left area) ────
    blobLayer(G, W * 0.18, H * 0.28, W * 0.20, H * 0.18, 0xd06848, rng, 10);

    // ── LAYER 4: Mid-green from left ───────────────────────────
    swoopFromLeft(G, W, H, 0x1e6848, 0.32, rng, 10);

    // ── LAYER 5: Green hills (dark) ────────────────────────────
    hills(G, W, H, H * 0.56, 90, 4, 0x288040, rng, 10);

    // ── LAYER 6: Green hills (bright) ──────────────────────────
    hills(G, W, H, 0.66 * H, 65, 5, 0x48a848, rng, 8);

    // ── LAYER 7: Lime foreground ───────────────────────────────
    hills(G, W, H, 0.78 * H, 40, 7, 0x60c050, rng, 8);
    hills(G, W, H, 0.88 * H, 25, 8, 0x78d860, rng, 6);

    // ── TREES ──────────────────────────────────────────────────
    // Cream tree on right (like reference white tree)
    creamTree(G, W * 0.74, H * 0.25, H * 0.50, rng);
    // Dark trees on left
    roundTree(G, W * 0.07, H * 0.48, 55, 0x1a4828, 0x288838, rng);
    roundTree(G, W * 0.19, H * 0.53, 42, 0x1e5030, 0x308840, rng);
    roundTree(G, W * 0.30, H * 0.57, 32, 0x245838, 0x389048, rng);

    // ── FLOWERS ────────────────────────────────────────────────
    const fc = [0xf06888, 0xf0a040, 0x80c0e8, 0xe060a0, 0xf08060, 0xa080d0, 0xf0e0f0];
    for (let i = 0; i < 35; i++) {
      const fx = W * (0.02 + rng() * 0.96);
      const fy = H * (0.70 + rng() * 0.22);
      flower(G, fx, fy, 5 + rng() * 10, fc[Math.floor(rng() * fc.length)], rng);
    }

    // ── GRASS TUFTS ────────────────────────────────────────────
    for (let i = 0; i < 60; i++) {
      const gx = rng() * W, gy = H * (0.73 + rng() * 0.18);
      G.fillStyle = rgb([0x48a838, 0x58b848, 0x68c850][Math.floor(rng() * 3)]);
      for (let b = 0; b < 3; b++) {
        const bx = gx + (rng() - 0.5) * 6;
        G.beginPath();
        G.moveTo(bx - 1.5, gy);
        G.lineTo(bx + (rng() - 0.5) * 2, gy - 5 - rng() * 12);
        G.lineTo(bx + 1.5, gy);
        G.fill();
      }
    }

    // ── CREAM BORDER (drawn ON TOP as 4 filled strips) ─────────
    creamBorder(G, W, H, 38, rng);

    // Register canvas
    // Register canvas — use unique key to avoid Phaser cache issues
    const key = 'title-diorama-' + Math.random().toString(36).slice(2, 8);
    this.textures.addCanvas(key, cv);
    this.add.image(W / 2, H / 2, key).setDepth(0);

    // ── BUTTERFLIES (animated Phaser objects) ──────────────────
    const bCols = [0xf06888, 0xf0a040, 0xe8e0f0, 0xf08868, 0xe060a0, 0xffffff];
    for (let i = 0; i < 7; i++) {
      const bx = W * (0.06 + rng() * 0.88), by = H * (0.10 + rng() * 0.58);
      const bc = bCols[Math.floor(rng() * bCols.length)];
      const bs = 10 + rng() * 14;
      const bg = this.add.graphics().setDepth(8);
      bg.fillStyle(0x3a2410, 1);
      bg.fillRect(bx - 1, by - bs * 0.3, 2, bs * 0.6);
      bg.fillStyle(bc, 0.92);
      bg.fillCircle(bx - bs * 0.4, by - bs * 0.12, bs * 0.36);
      bg.fillCircle(bx + bs * 0.4, by - bs * 0.12, bs * 0.36);
      bg.fillCircle(bx - bs * 0.28, by + bs * 0.2, bs * 0.26);
      bg.fillCircle(bx + bs * 0.28, by + bs * 0.2, bs * 0.26);
      bg.fillStyle(0xffffff, 0.45);
      bg.fillCircle(bx - bs * 0.4, by - bs * 0.12, bs * 0.1);
      bg.fillCircle(bx + bs * 0.4, by - bs * 0.12, bs * 0.1);
      this.tweens.add({
        targets: bg, x: (rng() - 0.5) * 50, y: (rng() - 0.5) * 25,
        duration: 3000 + rng() * 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }

    // ── TITLE ──────────────────────────────────────────────────
    const ty = H * 0.16;
    this.add.text(area.cx, ty, 'MATH', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '120px', fontStyle: 'bold', color: '#4080d8',
      stroke: '#1a3060', strokeThickness: 10,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10);

    this.add.text(area.cx, ty + 118, 'WARRIORS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '96px', fontStyle: 'bold', color: '#e05050',
      stroke: '#601818', strokeThickness: 9,
      shadow: { offsetX: 5, offsetY: 8, color: 'rgba(10,20,30,0.5)', blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10);

    this.add.text(area.cx, ty + 218, 'An Educational Adventure', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '30px', color: '#f0d060',
      stroke: '#5a3010', strokeThickness: 5,
      shadow: { offsetX: 3, offsetY: 4, color: 'rgba(10,20,20,0.4)', blur: 5, fill: true },
    }).setOrigin(0.5).setDepth(10);

    // ── BUTTONS ────────────────────────────────────────────────
    sd(PaperButton(this, area.cx, H * 0.62, 'PLAY', {
      w: 400, h: 80, color: 0xc83030, fontSize: 34,
      onClick: () => { audio.play('ui/confirm'); transitionTo(this, SCENES.SAVE_SELECT, undefined, 300); },
    }), 10);
    sd(PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 160, h: 54, color: 0x6090c0, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    }), 10);
    sd(PaperButton(this, area.left + 75, area.top + 35, 'TUTORIAL', {
      w: 160, h: 54, color: 0xc09030, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    }), 10);
    this.add.text(area.right, area.bottom + 40, `v${VERSION}`, {
      ...TEXT.stat(), fontSize: '11px', color: '#8a7a60',
    }).setOrigin(1, 1).setAlpha(0.3).setDepth(10);
  }
}

function sd(b, d) { for (const k of ['bg','shadow','label','zone']) if (b[k]) b[k].setDepth(d); }

// ════════════════════════════════════════════════════════════════
function rgb(c) { return `rgb(${(c>>16)&0xff},${(c>>8)&0xff},${c&0xff})`; }
function rgba(c, a) { return `rgba(${(c>>16)&0xff},${(c>>8)&0xff},${c&0xff},${a})`; }

function swoopFromLeft(G, W, H, color, coverage, rng, shadowOy) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = W * coverage * (1 - t * 0.5)
      + Math.sin(t * Math.PI * 2.5) * W * 0.08
      + Math.sin(t * Math.PI * 5.5 + 1) * W * 0.03
      + (rng() - 0.5) * 10;
    const y = t * H;
    pts.push({ x, y });
  }
  // Shadow
  G.fillStyle = rgba(0x081818, 0.4);
  G.beginPath(); G.moveTo(-10 + 5, -10 + shadowOy);
  G.lineTo(W * coverage + 5, -10 + shadowOy);
  for (const p of pts) G.lineTo(p.x + 5, p.y + shadowOy);
  G.lineTo(-10 + 5, H + 10 + shadowOy);
  G.closePath(); G.fill();
  // Fill
  G.fillStyle = rgb(color);
  G.beginPath(); G.moveTo(-10, -10);
  G.lineTo(W * coverage, -10);
  for (const p of pts) G.lineTo(p.x, p.y);
  G.lineTo(-10, H + 10);
  G.closePath(); G.fill();
}

function swoopFromRight(G, W, H, color, coverage, rng, shadowOy) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = W * (1 - coverage) + W * coverage * t * 0.5
      - Math.sin(t * Math.PI * 2.5 + 0.5) * W * 0.08
      - Math.sin(t * Math.PI * 5.5 + 2) * W * 0.03
      + (rng() - 0.5) * 10;
    const y = t * H;
    pts.push({ x, y });
  }
  G.fillStyle = rgba(0x081818, 0.4);
  G.beginPath(); G.moveTo(W + 10 + 5, -10 + shadowOy);
  G.lineTo(W * (1 - coverage) + 5, -10 + shadowOy);
  for (const p of pts) G.lineTo(p.x + 5, p.y + shadowOy);
  G.lineTo(W + 10 + 5, H + 10 + shadowOy);
  G.closePath(); G.fill();
  G.fillStyle = rgb(color);
  G.beginPath(); G.moveTo(W + 10, -10);
  G.lineTo(W * (1 - coverage), -10);
  for (const p of pts) G.lineTo(p.x, p.y);
  G.lineTo(W + 10, H + 10);
  G.closePath(); G.fill();
}

function blobLayer(G, cx, cy, rx, ry, color, rng, shadowOy) {
  function draw(ox, oy) {
    G.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const w = 0.8 + rng() * 0.4;
      const x = cx + Math.cos(a) * rx * w + ox;
      const y = cy + Math.sin(a) * ry * w + oy;
      i === 0 ? G.moveTo(x, y) : G.lineTo(x, y);
    }
    G.closePath(); G.fill();
  }
  G.fillStyle = rgba(0x081818, 0.35); draw(4, shadowOy);
  G.fillStyle = rgb(color); draw(0, 0);
}

function hills(G, W, H, baseY, amp, bumps, color, rng, shadowOy) {
  const pts = [];
  for (let i = 0; i <= bumps * 12; i++) {
    const t = i / (bumps * 12);
    pts.push({
      x: -20 + t * (W + 40),
      y: baseY
        - Math.sin(t * Math.PI * bumps) * amp * (0.5 + rng() * 0.5)
        - Math.sin(t * Math.PI * bumps * 2.3 + 1.5) * amp * 0.3
        + (rng() - 0.5) * amp * 0.06,
    });
  }
  G.fillStyle = rgba(0x081818, 0.35);
  G.beginPath(); G.moveTo(pts[0].x + 3, pts[0].y + shadowOy);
  for (const p of pts) G.lineTo(p.x + 3, p.y + shadowOy);
  G.lineTo(W + 20, H + 10); G.lineTo(-20, H + 10); G.closePath(); G.fill();
  G.fillStyle = rgb(color);
  G.beginPath(); G.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) G.lineTo(p.x, p.y);
  G.lineTo(W + 20, H + 10); G.lineTo(-20, H + 10); G.closePath(); G.fill();
}

function creamTree(G, x, y, h, rng) {
  const tw = h * 0.04;
  G.fillStyle = rgba(0x0a2020, 0.25); G.fillRect(x - tw/2 + 4, y + 8, tw, h * 0.5);
  G.fillStyle = rgb(0xf0e8d0); G.fillRect(x - tw/2, y, tw, h * 0.5);
  G.strokeStyle = rgb(0xf0e8d0); G.lineWidth = tw * 0.7; G.lineCap = 'round';
  for (const b of [[-0.7, 0.38], [-0.2, 0.42], [0.5, 0.32], [1.0, 0.22]]) {
    const by = y + h * 0.12;
    const ex = x + Math.sin(b[0]) * h * b[1], ey = by - Math.cos(b[0]) * h * b[1];
    G.strokeStyle = rgba(0x0a2020, 0.2);
    G.beginPath(); G.moveTo(x + 3, by + 6); G.lineTo(ex + 3, ey + 6); G.stroke();
    G.strokeStyle = rgb(0xf0e8d0);
    G.beginPath(); G.moveTo(x, by); G.lineTo(ex, ey); G.stroke();
    if (rng() < 0.8) flower(G, ex, ey, 4 + rng() * 5, 0xf06888, rng);
  }
  for (const c of [[0, -0.08, 0.16], [-0.06, -0.16, 0.12], [0.08, -0.12, 0.10]]) {
    G.fillStyle = rgba(0x0a2020, 0.2);
    G.beginPath(); G.arc(x + c[0]*h + 4, y + c[1]*h + 8, c[2]*h, 0, Math.PI*2); G.fill();
    G.fillStyle = rgb(0x48a848);
    G.beginPath(); G.arc(x + c[0]*h, y + c[1]*h, c[2]*h, 0, Math.PI*2); G.fill();
  }
}

function roundTree(G, x, y, s, dark, light, rng) {
  const tw = s * 0.12;
  G.fillStyle = rgba(0x0a2020, 0.25); G.fillRect(x - tw/2 + 3, y + 5, tw, s * 0.6);
  G.fillStyle = rgb(0x2a1a10); G.fillRect(x - tw/2, y, tw, s * 0.6);
  G.fillStyle = rgba(0x0a2020, 0.25);
  G.beginPath(); G.arc(x + 3, y - s*0.15 + 6, s*0.42, 0, Math.PI*2); G.fill();
  G.fillStyle = rgb(dark);
  G.beginPath(); G.arc(x, y - s*0.15, s*0.42, 0, Math.PI*2); G.fill();
  G.fillStyle = rgb(light);
  G.beginPath(); G.arc(x - s*0.1, y - s*0.28, s*0.28, 0, Math.PI*2); G.fill();
  G.beginPath(); G.arc(x + s*0.12, y - s*0.22, s*0.24, 0, Math.PI*2); G.fill();
}

function flower(G, x, y, s, c, rng) {
  G.strokeStyle = rgb(0x388830); G.lineWidth = 1.5;
  G.beginPath(); G.moveTo(x, y + s*0.5); G.lineTo(x + (rng()-0.5)*3, y + s*0.5 + 5 + rng()*5); G.stroke();
  G.fillStyle = rgb(c);
  for (let p = 0; p < 5; p++) {
    const a = (p/5) * Math.PI * 2 - Math.PI/2;
    G.beginPath(); G.arc(x + Math.cos(a)*s*0.45, y + Math.sin(a)*s*0.45, s*0.35, 0, Math.PI*2); G.fill();
  }
  G.fillStyle = rgb(0xfff080);
  G.beginPath(); G.arc(x, y, s*0.2, 0, Math.PI*2); G.fill();
}

function creamBorder(G, W, H, bw, rng) {
  const c = rgb(0xf0e8d8);
  // Draw 4 strips with wavy inner edge
  // TOP
  G.fillStyle = rgba(0x081818, 0.2);
  drawTopStrip(G, W, bw, rng, 3, 8);
  G.fillStyle = c;
  drawTopStrip(G, W, bw, rng, 0, 0);
  // BOTTOM
  G.fillStyle = rgba(0x081818, 0.2);
  drawBottomStrip(G, W, H, bw, rng, 3, -6);
  G.fillStyle = c;
  drawBottomStrip(G, W, H, bw, rng, 0, 0);
  // LEFT
  G.fillStyle = rgba(0x081818, 0.2);
  drawLeftStrip(G, H, bw, rng, 6, 3);
  G.fillStyle = c;
  drawLeftStrip(G, H, bw, rng, 0, 0);
  // RIGHT
  G.fillStyle = rgba(0x081818, 0.2);
  drawRightStrip(G, W, H, bw, rng, -6, 3);
  G.fillStyle = c;
  drawRightStrip(G, W, H, bw, rng, 0, 0);
}

function drawTopStrip(G, W, bw, rng, ox, oy) {
  G.beginPath(); G.moveTo(-5 + ox, -5 + oy); G.lineTo(W + 5 + ox, -5 + oy);
  G.lineTo(W + 5 + ox, bw + oy);
  for (let i = 50; i >= 0; i--) {
    const t = i / 50;
    G.lineTo(t * W + ox, bw + Math.sin(t * Math.PI * 7) * 8 + (rng()-0.5)*4 + oy);
  }
  G.closePath(); G.fill();
}
function drawBottomStrip(G, W, H, bw, rng, ox, oy) {
  G.beginPath(); G.moveTo(-5 + ox, H + 5 + oy); G.lineTo(W + 5 + ox, H + 5 + oy);
  G.lineTo(W + 5 + ox, H - bw + oy);
  for (let i = 50; i >= 0; i--) {
    const t = i / 50;
    G.lineTo(t * W + ox, H - bw + Math.sin(t * Math.PI * 7 + 1) * 8 + (rng()-0.5)*4 + oy);
  }
  G.closePath(); G.fill();
}
function drawLeftStrip(G, H, bw, rng, ox, oy) {
  G.beginPath(); G.moveTo(-5 + ox, -5 + oy); G.lineTo(-5 + ox, H + 5 + oy);
  G.lineTo(bw + ox, H + 5 + oy);
  for (let i = 50; i >= 0; i--) {
    const t = i / 50;
    G.lineTo(bw + Math.sin(t * Math.PI * 6) * 8 + (rng()-0.5)*4 + ox, t * H + oy);
  }
  G.closePath(); G.fill();
}
function drawRightStrip(G, W, H, bw, rng, ox, oy) {
  G.beginPath(); G.moveTo(W + 5 + ox, -5 + oy); G.lineTo(W + 5 + ox, H + 5 + oy);
  G.lineTo(W - bw + ox, H + 5 + oy);
  for (let i = 50; i >= 0; i--) {
    const t = i / 50;
    G.lineTo(W - bw + Math.sin(t * Math.PI * 6 + 1) * 8 + (rng()-0.5)*4 + ox, t * H + oy);
  }
  G.closePath(); G.fill();
}
