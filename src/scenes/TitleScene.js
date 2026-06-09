import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION } from '../config.js';
import { loadSave, listSlots } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { makeRng } from '../systems/rng.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super({ key: SCENES.TITLE }); }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const rng = makeRng(56);

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

    // ── 2. DARK TEAL — full sky backdrop, simple clean arc ──────
    paperLayer(C, W, H, rng, [
      [0, 0], [W, 0],
      [W, H * 0.35],
      [W * 0.75, H * 0.42],
      [W * 0.50, H * 0.46],
      [W * 0.25, H * 0.42],
      [0, H * 0.35],
    ], '#0e2e30', 16);

    // ── 3. TEAL-GREEN — second sky layer, slightly brighter ───
    paperLayer(C, W, H, rng, [
      [0, 0], [W, 0],
      [W, H * 0.28],
      [W * 0.78, H * 0.35],
      [W * 0.50, H * 0.38],
      [W * 0.22, H * 0.35],
      [0, H * 0.28],
    ], '#1a5048', 14);

    // ── 4. BRIGHT TEAL — third sky layer, warmest ───────────────
    paperLayer(C, W, H, rng, [
      [0, 0], [W, 0],
      [W, H * 0.20],
      [W * 0.80, H * 0.26],
      [W * 0.50, H * 0.30],
      [W * 0.20, H * 0.26],
      [0, H * 0.20],
    ], '#287860', 12);

    // ── HILLS — dramatically different colors per layer ─────────
    hillLayer(C, W, H, H * 0.42, 110, 3, '#1a5030', rng, 24);  // dark forest
    hillLayer(C, W, H, H * 0.52, 80, 4, '#287848', rng, 22);   // deep green
    hillLayer(C, W, H, H * 0.60, 60, 4, '#38a050', rng, 20);   // emerald
    hillLayer(C, W, H, H * 0.68, 50, 5, '#58c058', rng, 18);   // bright green
    hillLayer(C, W, H, H * 0.76, 40, 6, '#78d860', rng, 16);   // lime
    hillLayer(C, W, H, H * 0.84, 30, 7, '#98e870', rng, 14);   // yellow-green
    hillLayer(C, W, H, H * 0.92, 20, 8, '#b0f080', rng, 12);   // pale chartreuse

    // ── TREES — 10 smaller trees with varied foliage colors ────
    const treePalettes = [
      ['#288838', '#48a848'],
      ['#48a848', '#68c850'],
      ['#e06888', '#f08098'],
      ['#c8c040', '#d8d060'],
      ['#88d860', '#a0e870'],
      ['#68c850', '#88d860'],
      ['#288838', '#68c850'],
      ['#f08098', '#e06888'],
      ['#d8d060', '#c8c040'],
      ['#a0e870', '#48a848'],
    ];
    const treeSpots = [
      [0.03, 0.70, 0.16], [0.11, 0.72, 0.13], [0.20, 0.74, 0.11],
      [0.30, 0.76, 0.10], [0.42, 0.78, 0.12],
      [0.58, 0.78, 0.11], [0.68, 0.76, 0.13], [0.78, 0.74, 0.10],
      [0.88, 0.72, 0.15], [0.96, 0.70, 0.18],
    ];
    for (let i = 0; i < treeSpots.length; i++) {
      const [tx, tgy, th] = treeSpots[i];
      const pal = treePalettes[i % treePalettes.length];
      drawTree(C, W * tx, H * tgy, H * th, '#5a3820', pal[0], rng, false);
    }

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

    // ── TITLE: built from individual paper pieces per letter ─────
    drawPaperLetters(C, W, H);

    // Tagline — simple text (not paper-built)
    C.textAlign = 'center';
    C.textBaseline = 'alphabetic';
    C.font = '700 28px "Fredoka One", sans-serif';
    C.fillStyle = 'rgba(0,0,0,0.6)';
    C.fillText('An Educational Adventure', W/2 + 2, H * 0.38 + 5);
    C.fillStyle = '#f0d060';
    C.fillText('An Educational Adventure', W/2, H * 0.38);

    // ── RENDER ─────────────────────────────────────────────────
    const key = 'title-' + Date.now();
    this.textures.addCanvas(key, cv);
    const bgImage = this.add.image(W / 2, H / 2, key).setDepth(0);

    // ── PARALLAX on pointer move ──────────────────────────────────
    this.input.on('pointermove', (pointer) => {
      const dx = (pointer.x - W / 2) / W;
      const dy = (pointer.y - H / 2) / H;
      bgImage.x = W / 2 + dx * 10;
      bgImage.y = H / 2 + dy * 5;
    });

    // ── BUTTERFLIES ───────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      // Keep butterflies on the sides (avoid center 0.3–0.7) and in the middle vertical band
      const side = rng() < 0.5 ? (0.04 + rng() * 0.22) : (0.74 + rng() * 0.22);
      const bx = W * side;
      const by = H * (0.35 + rng() * 0.30);
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

    // ── CHECK FOR CONTINUABLE SAVE ──────────────────────────────
    const slots = listSlots();
    let continueSlot = null;
    let continueLabel = 'Continue Adventure';
    for (const meta of slots) {
      if (meta.exists && meta.floorsComplete > 0) {
        continueSlot = meta.slot;
        if (meta.partyNames && meta.partyNames.length > 0) {
          continueLabel = meta.partyNames.join(', ');
        }
        break;
      }
    }

    // ── BUTTONS ────────────────────────────────────────────────
    let playY = H * 0.62;

    if (continueSlot !== null) {
      // CONTINUE button — larger, green, above PLAY
      const contY = H * 0.55;
      playY = H * 0.66;
      dp(PaperButton(this, area.cx, contY, continueLabel, {
        w: 420, h: 80, color: 0x4aa848, fontSize: 28,
        onClick: () => {
          audio.play('ui/confirm');
          this.registry.set('activeSlot', continueSlot);
          transitionTo(this, SCENES.WORLD_MAP, undefined, 300, 'wipe');
        },
      }), 10);
    }

    dp(PaperButton(this, area.cx, playY, continueSlot !== null ? 'NEW GAME' : 'PLAY', {
      w: continueSlot !== null ? 320 : 400,
      h: continueSlot !== null ? 64 : 80,
      color: 0xc83030,
      fontSize: continueSlot !== null ? 26 : 34,
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

function drawPaperLetters(C, W, H) {
  const colors = [
    '#e85858', '#4888e0', '#f0a040', '#48b868',
    '#e060a0', '#8050c0', '#d07818', '#40a8a0',
    '#e85858', '#4888e0', '#f0a040', '#48b868',
  ];

  let seed = 42;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed & 0xfffffff) / 0x10000000; }

  function drawPaperLetter(ch, cx, cy, fontSize, color) {
    const pad = 40;
    const tmpCv = document.createElement('canvas');
    const sz = fontSize + pad * 2;
    tmpCv.width = sz;
    tmpCv.height = sz;
    const tc = tmpCv.getContext('2d');

    tc.font = `900 ${fontSize}px "Fredoka One", sans-serif`;
    tc.textAlign = 'center';
    tc.textBaseline = 'middle';
    const lx = sz / 2, ly = sz / 2;

    tc.fillStyle = color;
    tc.fillText(ch, lx, ly);

    // Paper texture: tiny speckles
    tc.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 150; i++) {
      const bright = rand() > 0.5;
      tc.fillStyle = bright
        ? `rgba(255,255,255,${0.06 + rand() * 0.12})`
        : `rgba(0,0,0,${0.03 + rand() * 0.07})`;
      tc.fillRect(rand() * sz, rand() * sz, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }

    // Fiber lines (paper grain)
    for (let i = 0; i < 12; i++) {
      tc.strokeStyle = `rgba(255,255,255,${0.05 + rand() * 0.07})`;
      tc.lineWidth = 0.5;
      tc.beginPath();
      tc.moveTo(rand() * sz, rand() * sz);
      tc.lineTo(rand() * sz, rand() * sz);
      tc.stroke();
    }

    // Wobbly edge: nibble tiny chunks off the outline
    tc.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) {
      tc.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`;
      tc.beginPath();
      tc.arc(rand() * sz, rand() * sz, 0.3 + rand() * 1.2, 0, Math.PI * 2);
      tc.fill();
    }
    tc.globalCompositeOperation = 'source-over';

    // Each letter slightly rotated and offset
    const angle = (rand() - 0.5) * 0.09;
    const yOff = (rand() - 0.5) * 8;

    C.save();
    C.translate(cx, cy + yOff);
    C.rotate(angle);

    // Hard shadow (like physical paper on a surface)
    C.shadowColor = 'rgba(0,0,0,0.55)';
    C.shadowBlur = 3;
    C.shadowOffsetX = 5;
    C.shadowOffsetY = 7;
    C.drawImage(tmpCv, -sz / 2, -sz / 2);

    C.shadowColor = 'transparent';
    C.shadowBlur = 0;
    C.shadowOffsetX = 0;
    C.shadowOffsetY = 0;
    C.drawImage(tmpCv, -sz / 2, -sz / 2);

    C.restore();
  }

  function drawPaperWord(word, centerX, centerY, fontSize, colorOffset) {
    C.font = `900 ${fontSize}px "Fredoka One", sans-serif`;
    C.textAlign = 'center';
    C.textBaseline = 'middle';
    const totalWidth = C.measureText(word).width;
    let x = centerX - totalWidth / 2;

    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const charW = C.measureText(ch).width;
      drawPaperLetter(ch, x + charW / 2, centerY, fontSize, colors[(i + colorOffset) % colors.length]);
      x += charW;
    }
  }

  drawPaperWord('MATH', W / 2, H * 0.13, 155, 0);
  drawPaperWord('WARRIORS', W / 2, H * 0.27, 112, 4);
}

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

  C.save();
  C.shadowColor = 'rgba(0,0,0,0.6)';
  C.shadowBlur = shadowDist;
  C.shadowOffsetX = 4;
  C.shadowOffsetY = shadowDist;
  C.fillStyle = color;
  drawPath(0, 0);
  C.restore();
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
  C.save();
  C.shadowColor = 'rgba(0,0,0,0.6)';
  C.shadowBlur = shadowDist;
  C.shadowOffsetX = 4;
  C.shadowOffsetY = shadowDist;
  C.fillStyle = color;
  draw(0, 0);
  C.restore();
}

/**
 * Draw a rolling hill layer with shadow.
 */
function hillLayer(C, W, H, baseY, amplitude, bumps, color, rng, shadowH) {
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

  // 1. Draw dark shadow strip along the TOP edge of this hill.
  //    This sits ON the previous layer, creating visible depth.
  C.fillStyle = 'rgba(0,0,0,0.8)';
  C.beginPath();
  C.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) C.lineTo(p[0], p[1]);
  // Shadow strip extends shadowH pixels below the hill edge
  for (let i = pts.length - 1; i >= 0; i--) {
    C.lineTo(pts[i][0], pts[i][1] + shadowH);
  }
  C.closePath();
  C.fill();

  // 2. Draw the hill fill on top of the shadow
  C.fillStyle = color;
  C.beginPath();
  C.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) C.lineTo(p[0], p[1]);
  C.lineTo(W + 30, H + 20);
  C.lineTo(-30, H + 20);
  C.closePath();
  C.fill();
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
  C.fillRect(x - tw / 2 + 3, groundY - trunkH - 4, tw, trunkH);
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
