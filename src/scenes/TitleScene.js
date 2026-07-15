import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, VERSION, PAPER, PAPER_CSS } from '../config.js';
import { loadSave, listSlots } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { makeRng } from '../systems/rng.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import {
  blobPoints, hillPoints, waveEdgePoints, organicRectPoints,
  drawShadowedPoly, drawShadowedBlob, drawPapercutTree,
  drawPapercutFlower, drawButterfly, drawLeafSprig,
  fillPtsCtx, softShadowCtx, clearShadowCtx,
  drawShadowBox,
} from '../systems/papercutArt.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super({ key: SCENES.TITLE }); }

  create() {
    // Auto-resume is ONLY for a genuine quick background/foreground blip
    // (iPad standalone freezes the canvas on background and reloads on
    // return). A fresh open, a long gap, or a new app version must always
    // land on the title page — never drop the player straight into a maze.
    try {
      const storedVer = localStorage.getItem('mw_version');
      const versionChanged = storedVer !== VERSION;
      if (versionChanged) {
        // A new build shipped: forget stale resume state and show the title
        // so the player always starts fresh on the newest version.
        localStorage.setItem('mw_version', VERSION);
        localStorage.removeItem('mw_resume');
      }

      const resumeStr = versionChanged ? null : localStorage.getItem('mw_resume');
      if (resumeStr) {
        localStorage.removeItem('mw_resume');
        const resume = JSON.parse(resumeStr);
        // Only within a short grace window — otherwise treat it as a fresh
        // open and fall through to the title.
        const RESUME_GRACE_MS = 120000; // 2 minutes
        const recent = resume.ts && (Date.now() - resume.ts) < RESUME_GRACE_MS;
        if (recent && resume.slot && resume.scene) {
          this.registry.set('activeSlot', resume.slot);
          if (resume.scene === SCENES.MAZE && resume.floor) {
            this.scene.start(SCENES.MAZE, { floor: resume.floor });
            return;
          }
          if (resume.scene === SCENES.WORLD_MAP || resume.scene === SCENES.BATTLE) {
            this.scene.start(SCENES.WORLD_MAP);
            return;
          }
        }
      }
    } catch (e) { /* ignore */ }

    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const rng = makeRng(56);

    fadeInScene(this);
    audio.playMusic('music/title');
    this.save = loadSave();

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const C = cv.getContext('2d');

    // ── 1. PALE SAGE BACKGROUND ──
    C.fillStyle = PAPER_CSS.sage;
    C.fillRect(0, 0, W, H);

    // Subtle warm glow
    const grd = C.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.4);
    grd.addColorStop(0, 'rgba(236,185,100,0.15)');
    grd.addColorStop(1, 'rgba(236,185,100,0)');
    C.fillStyle = grd;
    C.fillRect(0, 0, W, H);

    // ── 2. Nested organic frame layers (cream -> tealD -> forest -> coral -> orange) ──
    const frameLayers = [
      { color: PAPER.cream,   topY: H * 0.35, shadow: 16 },
      { color: PAPER.tealD,   topY: H * 0.28, shadow: 14 },
      { color: PAPER.forest,  topY: H * 0.22, shadow: 12 },
    ];
    for (const fl of frameLayers) {
      hillLayer(C, W, H, fl.topY, 60, 3, hex2css(fl.color), rng, fl.shadow);
    }

    // ── ROLLING HILLS — 7 layers from PAPER palette ──
    const hillColors = [PAPER.forestD, PAPER.forest, PAPER.forestL, PAPER.leaf,
                        PAPER.sageD, PAPER.sage, PAPER.cream];
    const hillBaseYs = [0.42, 0.50, 0.58, 0.66, 0.73, 0.80, 0.88];
    const hillAmps   = [90, 70, 55, 45, 35, 25, 16];
    const hillBumps  = [3, 4, 4, 5, 6, 7, 8];
    const hillShadows= [20, 18, 16, 14, 12, 10, 8];
    for (let i = 0; i < hillColors.length; i++) {
      hillLayer(C, W, H, H * hillBaseYs[i], hillAmps[i], hillBumps[i],
        hex2css(hillColors[i]), rng, hillShadows[i]);
    }

    // ── TREES ──
    const treeCanopies = [PAPER.forest, PAPER.forestL, PAPER.coral, PAPER.leaf,
                          PAPER.forestL, PAPER.forest, PAPER.forestD, PAPER.rose,
                          PAPER.leaf, PAPER.sage];
    const treeSpots = [
      [0.03, 0.70, 0.16], [0.11, 0.72, 0.13], [0.20, 0.74, 0.11],
      [0.30, 0.76, 0.10], [0.42, 0.78, 0.12],
      [0.58, 0.78, 0.11], [0.68, 0.76, 0.13], [0.78, 0.74, 0.10],
      [0.88, 0.72, 0.15], [0.96, 0.70, 0.18],
    ];
    for (let i = 0; i < treeSpots.length; i++) {
      const [tx, tgy, th] = treeSpots[i];
      drawTree(C, W * tx, H * tgy, H * th, hex2css(PAPER.creamD),
        hex2css(treeCanopies[i % treeCanopies.length]), rng, false);
    }

    // ── FLOWERS ──
    const fCols = [PAPER.coral, PAPER.rose, PAPER.peach, PAPER.lavender,
                   PAPER.orange, PAPER.gold, PAPER.sky];
    for (let i = 0; i < 40; i++) {
      const fx = W * (0.02 + rng() * 0.96);
      const fy = H * (0.74 + rng() * 0.20);
      drawFlower(C, fx, fy, 4 + rng() * 8,
        hex2css(fCols[Math.floor(rng() * fCols.length)]), rng);
    }

    // ── GRASS ──
    const grassColors = [hex2css(PAPER.leaf), hex2css(PAPER.forestL), hex2css(PAPER.sage)];
    for (let i = 0; i < 70; i++) {
      const gx = rng() * W, gy = H * (0.76 + rng() * 0.18);
      C.fillStyle = grassColors[Math.floor(rng() * 3)];
      for (let b = 0; b < 3; b++) {
        C.beginPath();
        const bx = gx + (rng() - 0.5) * 5;
        C.moveTo(bx - 1, gy);
        C.lineTo(bx, gy - 4 - rng() * 10);
        C.lineTo(bx + 1, gy);
        C.fill();
      }
    }

    // ── CREAM WAVY BORDER ──
    drawWavyBorder(C, W, H, 35, hex2css(PAPER.cream), rng);

    // ── TITLE LETTERS — paper pieces in PAPER palette ──
    drawPaperLetters(C, W, H);

    // Tagline
    C.textAlign = 'center';
    C.textBaseline = 'alphabetic';
    C.font = '700 28px "Fredoka One", sans-serif';
    softShadowCtx(C, { alpha: 0.3, dy: 4, blur: 6 });
    C.fillStyle = PAPER_CSS.gold;
    C.fillText('An Educational Adventure', W / 2, H * 0.38);
    clearShadowCtx(C);

    // ── RENDER ──
    const key = 'title-bg';
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, cv);
    this.add.image(W / 2, H / 2, key).setDepth(0);

    // The nested frame layers (lines 64-71 above) already create the
    // diorama frame effect on the canvas. No separate Phaser overlay
    // needed — it would draw solid opaque layers over the art.

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
    });

    // ── BUTTERFLIES (Phaser graphics for animation) ──
    for (let i = 0; i < 6; i++) {
      const side = rng() < 0.5 ? (0.04 + rng() * 0.22) : (0.74 + rng() * 0.22);
      const bx = W * side;
      const by = H * (0.35 + rng() * 0.30);
      const bs = 10 + rng() * 12;
      const bColors = [PAPER.white, PAPER.rose, PAPER.peach, PAPER.coral, PAPER.lavender, PAPER.cream];
      const bc = bColors[Math.floor(rng() * bColors.length)];
      const g = this.add.graphics().setDepth(8);
      drawButterfly(g, bx, by, bs, {
        seed: 100 + i * 29, color: bc, tilt: (rng() - 0.5) * 0.3,
      });
      this.tweens.add({ targets: g, x: (rng() - 0.5) * 40, y: (rng() - 0.5) * 20,
        duration: 3000 + rng() * 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    // ── BUTTONS ──
    const slots = listSlots();
    const lastPlayedSlot = slots
      .filter(s => s.exists)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];

    if (lastPlayedSlot) {
      dp(PaperButton(this, area.cx, H * 0.55, 'CONTINUE', {
        w: 420, h: 80, color: PAPER.orange, fontSize: 34,
        onClick: () => {
          audio.play('ui/confirm');
          transitionTo(this, SCENES.SAVE_SELECT, undefined, 300);
        },
      }), 10);
      dp(PaperButton(this, area.cx, H * 0.68, 'NEW GAME', {
        w: 340, h: 64, color: PAPER.coralD, fontSize: 26,
        onClick: () => { audio.play('ui/confirm'); transitionTo(this, SCENES.SAVE_SELECT, undefined, 300); },
      }), 10);
    } else {
      dp(PaperButton(this, area.cx, H * 0.62, 'PLAY', {
        w: 400, h: 80, color: PAPER.coralD, fontSize: 34,
        onClick: () => { audio.play('ui/confirm'); transitionTo(this, SCENES.SAVE_SELECT, undefined, 300); },
      }), 10);
    }
    dp(PaperButton(this, area.right - 75, area.top + 35, 'SETTINGS', {
      w: 160, h: 54, color: PAPER.teal, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.SETTINGS, { returnScene: SCENES.TITLE }, 200),
    }), 10);
    dp(PaperButton(this, area.left + 75, area.top + 35, 'TUTORIAL', {
      w: 160, h: 54, color: PAPER.orange, fontSize: 16,
      onClick: () => transitionTo(this, SCENES.TUTORIAL, undefined, 200),
    }), 10);
    this.add.text(area.right, area.bottom + 40, `v${VERSION}`,
      { ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.forest }).setOrigin(1, 1).setAlpha(0.4).setDepth(10);
  }
}

function dp(b, d) { for (const k of ['bg', 'shadow', 'label', 'zone']) if (b[k]) b[k].setDepth(d); }

function hex2css(hex) {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}

// ════════════════════════════════════════════════════════════════
// DRAWING FUNCTIONS — Canvas 2D
// ════════════════════════════════════════════════════════════════

function drawPaperLetters(C, W, H) {
  // PAPER palette letter colors
  // Light/bright papers only — the letters sit over dark forest hills,
  // so dark greens vanish into the background.
  const colors = [
    PAPER_CSS.coral, PAPER_CSS.tealL, PAPER_CSS.orange, PAPER_CSS.gold,
    PAPER_CSS.rose, PAPER_CSS.lavender, PAPER_CSS.peach, PAPER_CSS.sky,
    PAPER_CSS.coral, PAPER_CSS.tealL, PAPER_CSS.orange, PAPER_CSS.gold,
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

    // Paper texture
    tc.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 150; i++) {
      const bright = rand() > 0.5;
      tc.fillStyle = bright
        ? `rgba(255,255,255,${0.06 + rand() * 0.12})`
        : `rgba(0,0,0,${0.03 + rand() * 0.07})`;
      tc.fillRect(rand() * sz, rand() * sz, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    for (let i = 0; i < 12; i++) {
      tc.strokeStyle = `rgba(255,255,255,${0.05 + rand() * 0.07})`;
      tc.lineWidth = 0.5;
      tc.beginPath();
      tc.moveTo(rand() * sz, rand() * sz);
      tc.lineTo(rand() * sz, rand() * sz);
      tc.stroke();
    }

    // Wobbly edge
    tc.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) {
      tc.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`;
      tc.beginPath();
      tc.arc(rand() * sz, rand() * sz, 0.3 + rand() * 1.2, 0, Math.PI * 2);
      tc.fill();
    }
    tc.globalCompositeOperation = 'source-over';

    const angle = (rand() - 0.5) * 0.09;
    const yOff = (rand() - 0.5) * 8;

    C.save();
    C.translate(cx, cy + yOff);
    C.rotate(angle);

    // Shadow (teal-tinted, not black)
    C.shadowColor = 'rgba(31,61,63,0.45)';
    C.shadowBlur = 3;
    C.shadowOffsetX = 4;
    C.shadowOffsetY = 6;
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

  // Shadow strip (teal-tinted)
  C.fillStyle = 'rgba(31,61,63,0.2)';
  C.beginPath();
  C.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) C.lineTo(p[0], p[1]);
  for (let i = pts.length - 1; i >= 0; i--) {
    C.lineTo(pts[i][0], pts[i][1] + shadowH);
  }
  C.closePath();
  C.fill();

  // Hill fill
  C.fillStyle = color;
  C.beginPath();
  C.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) C.lineTo(p[0], p[1]);
  C.lineTo(W + 30, H + 20);
  C.lineTo(-30, H + 20);
  C.closePath();
  C.fill();
}

function drawTree(C, x, groundY, height, trunkColor, canopyColor, rng, isCream) {
  const tw = height * (isCream ? 0.04 : 0.08);
  const trunkH = height * 0.45;
  const trunkTop = groundY - trunkH;

  // Shadow (teal-tinted)
  C.fillStyle = 'rgba(31,61,63,0.2)';
  C.fillRect(x - tw / 2 + 2, groundY - trunkH - 3, tw, trunkH);
  // Trunk
  C.fillStyle = trunkColor;
  C.fillRect(x - tw / 2, groundY - trunkH, tw, trunkH);

  // Canopy
  const canopyY = trunkTop - height * 0.05;
  const cr = height * (isCream ? 0.14 : 0.22);
  const offsets = [[0, 0, 1.0], [-0.4, -0.3, 0.75], [0.4, -0.2, 0.7], [0, -0.5, 0.6]];
  for (const o of offsets) {
    const cx = x + o[0] * cr * 2, cy = canopyY + o[1] * cr * 2, r = cr * o[2];
    // Shadow
    C.fillStyle = 'rgba(31,61,63,0.18)';
    C.beginPath(); C.arc(cx + 2, cy + 5, r, 0, Math.PI * 2); C.fill();
    C.fillStyle = canopyColor;
    C.beginPath(); C.arc(cx, cy, r, 0, Math.PI * 2); C.fill();
  }
}

function drawFlower(C, x, y, size, color, rng) {
  C.fillStyle = PAPER_CSS.leaf;
  C.fillRect(x - 0.5, y + size * 0.4, 1.2, 4 + rng() * 5);
  C.fillStyle = color;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
    C.beginPath();
    C.arc(x + Math.cos(a) * size * 0.4, y + Math.sin(a) * size * 0.4, size * 0.32, 0, Math.PI * 2);
    C.fill();
  }
  C.fillStyle = PAPER_CSS.gold;
  C.beginPath(); C.arc(x, y, size * 0.18, 0, Math.PI * 2); C.fill();
}

function drawWavyBorder(C, W, H, bw, color, rng) {
  C.fillStyle = color;
  // Top
  C.beginPath(); C.moveTo(0, 0); C.lineTo(W, 0); C.lineTo(W, bw);
  for (let i = 60; i >= 0; i--) { const t = i / 60; C.lineTo(t * W, bw + Math.sin(t * Math.PI * 7) * 7 + (rng() - 0.5) * 4); }
  C.closePath(); C.fill();
  // Bottom
  C.beginPath(); C.moveTo(0, H); C.lineTo(W, H); C.lineTo(W, H - bw);
  for (let i = 60; i >= 0; i--) { const t = i / 60; C.lineTo(t * W, H - bw + Math.sin(t * Math.PI * 7 + 1) * 7 + (rng() - 0.5) * 4); }
  C.closePath(); C.fill();
  // Left
  C.beginPath(); C.moveTo(0, 0); C.lineTo(0, H); C.lineTo(bw, H);
  for (let i = 60; i >= 0; i--) { const t = i / 60; C.lineTo(bw + Math.sin(t * Math.PI * 6) * 7 + (rng() - 0.5) * 4, t * H); }
  C.closePath(); C.fill();
  // Right
  C.beginPath(); C.moveTo(W, 0); C.lineTo(W, H); C.lineTo(W - bw, H);
  for (let i = 60; i >= 0; i--) { const t = i / 60; C.lineTo(W - bw + Math.sin(t * Math.PI * 6 + 1) * 7 + (rng() - 0.5) * 4, t * H); }
  C.closePath(); C.fill();
}
