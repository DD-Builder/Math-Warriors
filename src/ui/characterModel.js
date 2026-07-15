/**
 * Parametric pose-driven character renderer.
 *
 * THE CORE IDEA — characters are DRAWN each frame from a pose, never
 * assembled from pre-cut image pieces. A pose is a set of joint angles
 * (hips, knees, shoulders, elbows, spine, head). Limbs are drawn as
 * single connected shapes that pass THROUGH their joints — a leg is one
 * filled path from hip, bending at the knee, down to the foot — so body
 * parts physically cannot detach or float. This is what makes knees and
 * elbows read as real articulation.
 *
 * Three archetypes (knight / wizard / bunny) share the skeleton but
 * differ in proportions, gear, and silhouette. Fifteen hero skins
 * recolor and accessorize the archetypes using each hero's existing
 * papercut palette from heroArt.js.
 *
 * Two views:
 *   'front' — 3/4 front view (battle, cutscenes, facing down in maze)
 *   'side'  — true side profile (walking left/right; mirror for left)
 *
 * Papercut style: every shape is drawn with a soft offset shadow and a
 * slightly wobbled edge (seeded, stable per character) to match the
 * hand-cut paper look of the rest of the game.
 */

import { mkRng } from './legacyRenderer.js';

// ────────────────────────────────────────────────────────────────
// Pose — all angles in radians, offsets in model units.
// Model space: origin at hip center, +y down. Character stands
// roughly from -86 (hat tip) to +72 (soles).
// ────────────────────────────────────────────────────────────────
export const NEUTRAL_POSE = {
  hipY: 0,        // vertical body offset (bob / crouch / jump)
  hipX: 0,        // horizontal sway
  spine: 0,       // torso lean (+ = forward in side view / right in front)
  head: 0,        // head tilt relative to torso
  thighL: 0, kneeL: 0,   // knee angle is RELATIVE to thigh (0 = straight)
  thighR: 0, kneeR: 0,
  shoulderL: 0, elbowL: 0.12,  // slight natural elbow bend
  shoulderR: 0, elbowR: 0.12,
  weapon: 0,      // grip angle relative to forearm
  earFlop: 0,     // bunny ears (also wizard hat tip sway)
  squash: 1,      // torso squash/stretch (1 = neutral)
};

// ────────────────────────────────────────────────────────────────
// Archetype proportions (model units)
// ────────────────────────────────────────────────────────────────
const PROPORTIONS = {
  knight: {
    hipW: 15, legLen: 34, shinLen: 32, footLen: 13, legW: 12,
    torsoH: 44, torsoW: 40, shoulderY: -36, shoulderSpread: 19,
    armLen: 24, foreLen: 22, armW: 9.5,
    headR: 21, neckY: -46, headCY: -62,
    weapon: 'sword',
  },
  wizard: {
    hipW: 14, legLen: 30, shinLen: 28, footLen: 12, legW: 10,
    torsoH: 50, torsoW: 44, shoulderY: -38, shoulderSpread: 20,
    armLen: 23, foreLen: 21, armW: 8.5,
    headR: 20, neckY: -48, headCY: -63,
    weapon: 'staff', robed: true,
  },
  bunny: {
    hipW: 16, legLen: 22, shinLen: 22, footLen: 16, legW: 11,
    torsoH: 34, torsoW: 42, shoulderY: -22, shoulderSpread: 18,
    armLen: 18, foreLen: 15, armW: 8,
    headR: 24, neckY: -30, headCY: -46,
    weapon: 'fists', ears: true,
  },
};

// ────────────────────────────────────────────────────────────────
// Hero skins — palettes lifted from each hero's heroArt draw fn.
// body/bodyD/bodyL = main suit-fur-robe tones. accent = signature.
// gear encodes headgear + weapon styling.
// ────────────────────────────────────────────────────────────────
export const HERO_SKINS = {
  'knight-shadow':    { body: '#44888a', bodyD: '#2a6063', bodyL: '#7fb3ae', accent: '#d06a4d', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { helm: 'full', plume: '#d06a4d', blade: '#7fb3ae' } },
  'knight-crusader':  { body: '#57835f', bodyD: '#3c6b4f', bodyL: '#7d9f6d', accent: '#d06a4d', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { helm: 'cross', tabard: '#f5eedd', shield: true, blade: '#7d9f6d' } },
  'knight-paladin':   { body: '#9c8fc0', bodyD: '#7c6fa8', bodyL: '#a4c8d8', accent: '#ecb964', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { helm: 'winged', glowBlade: true, blade: '#a4c8d8' } },
  'knight-berserker': { body: '#e78f6c', bodyD: '#d06a4d', bodyL: '#f2bf9a', accent: '#44888a', gold: '#e39a4a', goldL: '#ecb964', skin: '#f2bf9a', gear: { helm: 'horned', axe: true, blade: '#7fb3ae' } },
  'knight-greathelm': { body: '#44888a', bodyD: '#2a6063', bodyL: '#a4c8d8', accent: '#d06a4d', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { helm: 'great', plume: '#e39a4a', cape: '#d06a4d', blade: '#a4c8d8' } },

  'wizard-stargazer': { body: '#7c6fa8', bodyD: '#5c5288', bodyL: '#9c8fc0', accent: '#ecb964', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { hat: 'tall', stars: true, staffTop: 'star' } },
  'wizard-toadstool': { body: '#9bad87', bodyD: '#7d9f6d', bodyL: '#b7c4a4', accent: '#d9cfb2', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { hat: 'mushroom', staffTop: 'leaf' } },
  'wizard-spellblade':{ body: '#9c8fc0', bodyD: '#7c6fa8', bodyL: '#a4c8d8', accent: '#44888a', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { hat: 'short', pauldrons: true, staffTop: 'orb' } },
  'wizard-bookworm':  { body: '#d9cfb2', bodyD: '#b7a888', bodyL: '#e8dec6', accent: '#d06a4d', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { hat: 'floppy', glasses: true, staffTop: 'wand', book: '#d06a4d' } },
  'wizard-grandmage': { body: '#7c6fa8', bodyD: '#5c5288', bodyL: '#9c8fc0', accent: '#f5eedd', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { hat: 'grand', stars: true, trim: '#ecb964', staffTop: 'sun' } },

  'bunny-pepper':   { body: '#fdfbf2', bodyD: '#f5c6d0', bodyL: '#fdfbf2', accent: '#e07098', gold: '#f0a0b8', goldL: '#f5d0dd', skin: '#fdfbf2', gear: { earInner: '#e07098', band: '#e07098' } },
  'bunny-nova':     { body: '#fdfbf2', bodyD: '#9c8fc0', bodyL: '#fdfbf2', accent: '#7c6fa8', gold: '#ecb964', goldL: '#f5e2b0', skin: '#fdfbf2', gear: { earInner: '#9c8fc0', vest: '#7c6fa8', star: true } },
  'bunny-boulder':  { body: '#e8dec6', bodyD: '#d9cfb2', bodyL: '#e8dec6', accent: '#44888a', gold: '#e39a4a', goldL: '#ecb964', skin: '#e8dec6', gear: { earInner: '#d9cfb2', armor: '#44888a', headband: '#44888a' } },
  'bunny-blaze':    { body: '#f2bf9a', bodyD: '#e78f6c', bodyL: '#f2bf9a', accent: '#d06a4d', gold: '#e39a4a', goldL: '#ecb964', skin: '#f2bf9a', gear: { earInner: '#d06a4d', flames: true } },
  'bunny-duchess':  { body: '#f5eedd', bodyD: '#e8dec6', bodyL: '#f5eedd', accent: '#3c6b4f', gold: '#e39a4a', goldL: '#ecb964', skin: '#f5eedd', gear: { earInner: '#e8a09a', dress: '#3c6b4f', crown: true } },
};

// ────────────────────────────────────────────────────────────────
// Purchased skin variants — palette overrides keyed 'heroId:skinId'.
// The shop sells these (heroes.js HERO_SKINS list); this is their
// render path: same rig, recolored papercut.
// ────────────────────────────────────────────────────────────────
const SKIN_VARIANTS = {
  'knight-shadow:golden':    { body: '#e0a83a', bodyD: '#b8842a', bodyL: '#f0d060', accent: '#8a5a10' },
  'knight-shadow:crimson':   { body: '#c04838', bodyD: '#8a2c20', bodyL: '#e07860', accent: '#f0d060' },
  'wizard-stargazer:nebula': { body: '#4a3a78', bodyD: '#332858', bodyL: '#7a68b0', accent: '#5dc4b4' },
  'wizard-stargazer:eclipse':{ body: '#2c2c38', bodyD: '#1c1c26', bodyL: '#565668', accent: '#ecb964' },
  'bunny-pepper:frost':      { body: '#e8f4fa', bodyD: '#a5d2e6', bodyL: '#ffffff', accent: '#5aa8cc', gold: '#8fc4dd', goldL: '#c8e6f2' },
  'bunny-pepper:blaze':      { body: '#f6d8c0', bodyD: '#e78f6c', bodyL: '#fdeee0', accent: '#d84818', gold: '#e39a4a', goldL: '#ecb964' },
  'knight-crusader:dark':    { body: '#3a4048', bodyD: '#262b32', bodyL: '#5c646e', accent: '#c04838' },
  'wizard-toadstool:toxic':  { body: '#7ab048', bodyD: '#568030', bodyL: '#a0d068', accent: '#c060f0' },
  'bunny-nova:stellar':      { body: '#f5eedd', bodyD: '#e0b8f0', bodyL: '#ffffff', accent: '#9040d0', gold: '#e0b8f0', goldL: '#f0d8f8' },
  'knight-paladin:radiant':  { body: '#f0e0b0', bodyD: '#d8b868', bodyL: '#faf0d0', accent: '#e39a4a' },
  'bunny-boulder:crystal':   { body: '#d8ccf0', bodyD: '#b8a8e0', bodyL: '#eee8fa', accent: '#7a5ec0' },
  'knight-berserker:bloodrage': { body: '#a82818', bodyD: '#781808', bodyL: '#d05840', accent: '#f0d060' },
  'wizard-bookworm:arcane':  { body: '#6858a8', bodyD: '#4a3c80', bodyL: '#9080c8', accent: '#f0d060' },
  'bunny-blaze:inferno':     { body: '#e05818', bodyD: '#a83808', bodyL: '#f08848', accent: '#f0d060' },
  'knight-greathelm:titan':  { body: '#788088', bodyD: '#565c64', bodyL: '#a8b0b8', accent: '#e39a4a' },
  'wizard-grandmage:archmage': { body: '#f5eedd', bodyD: '#d9cfb2', bodyL: '#ffffff', accent: '#7c6fa8' },
  'bunny-duchess:empress':   { body: '#f5eedd', bodyD: '#e8dec6', bodyL: '#ffffff', accent: '#a82848' },
  'wizard-spellblade:void':  { body: '#38304a', bodyD: '#241e34', bodyL: '#5c5276', accent: '#5dc4b4' },
};
for (const [key, override] of Object.entries(SKIN_VARIANTS)) {
  const baseId = key.split(':')[0];
  const base = HERO_SKINS[baseId];
  if (base) HERO_SKINS[key] = { ...base, ...override, gear: base.gear };
}

const CLASS_OF = (id) => id.startsWith('wizard') ? 'wizard' : id.startsWith('bunny') ? 'bunny' : 'knight';

// ────────────────────────────────────────────────────────────────
// Papercut drawing helpers (shadow + wobble, seeded & stable)
// ────────────────────────────────────────────────────────────────
const SHADOW = 'rgba(31, 40, 40, 0.30)';

function wobblePts(pts, rng, amt) {
  return pts.map(p => [p[0] + (rng() - 0.5) * amt, p[1] + (rng() - 0.5) * amt]);
}

function fillPoly(ctx, pts, color, opts = {}) {
  const sx = opts.sx ?? 2.5, sy = opts.sy ?? 3.5;
  const path = (dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    ctx.closePath();
  };
  if (!opts.ns) { ctx.fillStyle = SHADOW; path(sx, sy); ctx.fill(); }
  ctx.fillStyle = color; path(0, 0); ctx.fill();
}

function fillCircle(ctx, x, y, r, color, opts = {}) {
  const sx = opts.sx ?? 2.5, sy = opts.sy ?? 3.5;
  if (!opts.ns) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath(); ctx.arc(x + sx, y + sy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/**
 * Draw a two-segment limb as ONE connected filled shape:
 * joint0 (hip/shoulder) → joint1 (knee/elbow) → end (foot/hand).
 * Width tapers toward the end. This connectivity is the anti-
 * dismemberment guarantee.
 */
function limb(ctx, x0, y0, x1, y1, x2, y2, w0, w2, color, shadow = true) {
  const half = (ax, ay, bx, by, w) => {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len * w, dx / len * w];
  };
  const [n0x, n0y] = half(x0, y0, x1, y1, w0 / 2);
  const [n1x, n1y] = half(x1, y1, x2, y2, (w0 + w2) / 4);
  const [n2x, n2y] = half(x1, y1, x2, y2, w2 / 2);
  const pts = [
    [x0 + n0x, y0 + n0y], [x1 + n1x, y1 + n1y], [x2 + n2x, y2 + n2y],
    [x2 - n2x, y2 - n2y], [x1 - n1x, y1 - n1y], [x0 - n0x, y0 - n0y],
  ];
  if (shadow) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + 2.5, pts[0][1] + 3.5);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + 2.5, pts[i][1] + 3.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 2.5, y0 + 3.5, w0 / 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x1 + 2.5, y1 + 3.5, (w0 + w2) / 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2 + 2.5, y2 + 3.5, w2 / 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
  // round the joints so the bend reads soft, not kinked
  ctx.beginPath(); ctx.arc(x0, y0, w0 / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, (w0 + w2) / 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x2, y2, w2 / 2, 0, Math.PI * 2); ctx.fill();
}

// forward-kinematics: joint1/joint2 positions from angles
function fk(x, y, len1, a1, len2, a2rel) {
  const jx = x + Math.sin(a1) * len1;
  const jy = y + Math.cos(a1) * len1;
  const a2 = a1 + a2rel;
  const ex = jx + Math.sin(a2) * len2;
  const ey = jy + Math.cos(a2) * len2;
  return [jx, jy, ex, ey, a2];
}

// ────────────────────────────────────────────────────────────────
// Weapons
// ────────────────────────────────────────────────────────────────
function drawSword(ctx, hx, hy, angle, skin) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  fillPoly(ctx, [[-2, 4], [2, 4], [2, -8], [-2, -8]], skin.gold);            // grip
  fillPoly(ctx, [[-8, -8], [8, -8], [8, -12], [-8, -12]], skin.gold);        // guard
  const bladeCol = skin.gear.blade || skin.bodyL;
  fillPoly(ctx, [[-3.5, -12], [3.5, -12], [2.5, -54], [0, -60], [-2.5, -54]], bladeCol);
  fillPoly(ctx, [[-0.8, -12], [0.8, -12], [0.6, -52], [-0.6, -52]], '#f5eedd', { ns: true });
  ctx.restore();
}

function drawStaff(ctx, hx, hy, angle, skin) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  fillPoly(ctx, [[-2.5, 26], [2.5, 26], [2.5, -46], [-2.5, -46]], skin.bodyD);
  const top = skin.gear.staffTop || 'orb';
  if (top === 'star' || top === 'sun') {
    ctx.fillStyle = skin.goldL;
    ctx.save(); ctx.translate(0, -54);
    ctx.beginPath();
    const spikes = top === 'sun' ? 8 : 5;
    for (let k = 0; k < spikes; k++) {
      let a = k * Math.PI * 2 / spikes - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
      a += Math.PI / spikes;
      ctx.lineTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (top === 'leaf') {
    fillPoly(ctx, [[0, -46], [9, -56], [0, -68], [-9, -56]], '#7d9f6d');
  } else if (top === 'wand') {
    fillCircle(ctx, 0, -50, 5, skin.goldL);
  } else {
    fillCircle(ctx, 0, -53, 8, skin.accent);
    fillCircle(ctx, -2, -55, 3.5, '#f5eedd', { ns: true });
  }
  ctx.restore();
}

// ────────────────────────────────────────────────────────────────
// Headgear
// ────────────────────────────────────────────────────────────────
function drawHeadgear(ctx, skin, P, view) {
  const g = skin.gear, r = P.headR;
  if (g.helm) {
    // helmet cap over the top half of the head
    fillPoly(ctx, [[-r, -2], [r, -2], [r * 0.85, -r * 0.75], [0, -r - 4], [-r * 0.85, -r * 0.75]], skin.bodyD);
    fillPoly(ctx, [[-r, -2], [r, -2], [r, 2], [-r, 2]], skin.gold, { sx: 1.5, sy: 2 });
    if (g.helm === 'horned') {
      fillPoly(ctx, [[-r + 2, -r * 0.6], [-r - 9, -r - 8], [-r - 2, -r * 0.9]], '#f5eedd');
      fillPoly(ctx, [[r - 2, -r * 0.6], [r + 9, -r - 8], [r + 2, -r * 0.9]], '#f5eedd');
    } else if (g.helm === 'winged') {
      fillPoly(ctx, [[-r + 2, -r * 0.5], [-r - 10, -r * 0.9], [-r - 3, -r * 0.3]], skin.goldL);
      fillPoly(ctx, [[r - 2, -r * 0.5], [r + 10, -r * 0.9], [r + 3, -r * 0.3]], skin.goldL);
    } else if (g.plume) {
      fillPoly(ctx, [[-3, -r - 2], [3, -r - 2], [5, -r - 16], [-5, -r - 16]], g.plume);
    }
    if (g.helm === 'cross') {
      fillPoly(ctx, [[-1.5, -r + 3], [1.5, -r + 3], [1.5, -4], [-1.5, -4]], skin.gold, { ns: true });
    }
  } else if (g.hat) {
    if (g.hat === 'mushroom') {
      fillPoly(ctx, [[-r - 6, -r * 0.55], [r + 6, -r * 0.55], [r * 0.7, -r - 10], [-r * 0.7, -r - 10]], skin.accent === '#d9cfb2' ? '#7d9f6d' : skin.accent);
      fillCircle(ctx, -r * 0.4, -r - 2, 3.5, '#f5eedd', { ns: true });
      fillCircle(ctx, r * 0.45, -r * 0.85, 3, '#f5eedd', { ns: true });
    } else {
      const tall = g.hat === 'grand' ? 40 : g.hat === 'tall' ? 34 : g.hat === 'floppy' ? 22 : 18;
      const tip = g.hat === 'floppy' ? 10 : 0;
      fillPoly(ctx, [[-r - 4, -r * 0.55], [r + 4, -r * 0.55], [r + 4, -r * 0.55 + 4], [-r - 4, -r * 0.55 + 4]], skin.body); // brim
      fillPoly(ctx, [[-r * 0.72, -r * 0.6], [r * 0.72, -r * 0.6], [tip + 4, -r * 0.6 - tall * 0.55], [tip, -r * 0.6 - tall], [tip - 4, -r * 0.6 - tall * 0.55]], skin.body);
      if (g.stars) {
        ctx.fillStyle = skin.goldL; ctx.globalAlpha = 0.85;
        [[-4, -r - 12], [5, -r - 20], [0, -r - 5]].forEach(([sx, sy], i) => {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(i * 0.8);
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            let a = k * Math.PI * 2 / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
            a += Math.PI / 5;
            ctx.lineTo(Math.cos(a) * 1.6, Math.sin(a) * 1.6);
          }
          ctx.closePath(); ctx.fill(); ctx.restore();
        });
        ctx.globalAlpha = 1;
      }
    }
  }
  if (g.crown) {
    fillPoly(ctx, [[-r * 0.6, -r * 0.72], [r * 0.6, -r * 0.72], [r * 0.6, -r * 0.5], [-r * 0.6, -r * 0.5]], skin.gold, { sx: 1.5, sy: 2 });
    fillPoly(ctx, [[-r * 0.6, -r * 0.72], [-r * 0.3, -r - 5], [-r * 0.05, -r * 0.72]], skin.gold, { ns: true });
    fillPoly(ctx, [[r * 0.05, -r * 0.72], [r * 0.3, -r - 5], [r * 0.6, -r * 0.72]], skin.gold, { ns: true });
  }
  if (g.headband) {
    fillPoly(ctx, [[-r, -r * 0.45], [r, -r * 0.45], [r, -r * 0.25], [-r, -r * 0.25]], g.headband, { sx: 1.5, sy: 2 });
  }
  if (g.glasses && view === 'front') {
    ctx.strokeStyle = '#2a6063'; ctx.lineWidth = 1.6;
    ctx.strokeRect(-r * 0.55, -4, r * 0.42, 7);
    ctx.strokeRect(r * 0.13, -4, r * 0.42, 7);
  }
}

function drawEars(ctx, skin, P, earFlop, view) {
  const r = P.headR;
  const flop = earFlop; // radians of sideways sag
  const drawEar = (side) => {
    ctx.save();
    ctx.translate(side * r * 0.42, -r * 0.8);
    ctx.rotate(side * (0.12 + flop));
    fillPoly(ctx, [[-5.5, 0], [5.5, 0], [4, -30], [0, -35], [-4, -30]], skin.bodyD);
    fillPoly(ctx, [[-2.6, -6], [2.6, -6], [1.8, -28], [-1.8, -28]], skin.gear.earInner || '#f0a0b8', { ns: true });
    ctx.restore();
  };
  if (view === 'side') {
    drawEar(1);      // far ear peeks
    drawEar(0.55);   // near ear
  } else {
    drawEar(-1); drawEar(1);
  }
  if (skin.gear.flames) {
    ctx.fillStyle = skin.gold; ctx.globalAlpha = 0.75;
    fillPoly(ctx, [[-r * 0.42 - 4, -r * 0.8 - 30], [-r * 0.42, -r * 0.8 - 40], [-r * 0.42 + 4, -r * 0.8 - 30]], skin.gold, { ns: true });
    fillPoly(ctx, [[r * 0.42 - 4, -r * 0.8 - 30], [r * 0.42, -r * 0.8 - 40], [r * 0.42 + 4, -r * 0.8 - 30]], skin.gold, { ns: true });
    ctx.globalAlpha = 1;
  }
}

function drawFace(ctx, skin, P, view, cls) {
  const r = P.headR;
  const eyeY = cls === 'bunny' ? 1 : 2;
  if (view === 'side') {
    // one eye, offset toward the facing direction (+x)
    fillCircle(ctx, r * 0.42, eyeY, 3.6, '#fdfbf2', { sx: 1, sy: 1.5 });
    fillCircle(ctx, r * 0.5, eyeY, 2.3, '#1f4244', { ns: true });
    if (cls === 'bunny') fillCircle(ctx, r * 0.72, eyeY + 6, 2.4, '#e8a09a', { ns: true });
  } else {
    fillCircle(ctx, -r * 0.3, eyeY, 3.6, '#fdfbf2', { sx: 1, sy: 1.5 });
    fillCircle(ctx, -r * 0.26, eyeY, 2.3, '#1f4244', { ns: true });
    fillCircle(ctx, r * 0.3, eyeY, 3.6, '#fdfbf2', { sx: 1, sy: 1.5 });
    fillCircle(ctx, r * 0.34, eyeY, 2.3, '#1f4244', { ns: true });
    if (cls === 'bunny') fillCircle(ctx, 0, eyeY + 6.5, 2.6, '#e8a09a', { ns: true });
  }
}

// ────────────────────────────────────────────────────────────────
// Main entry — draw a full character at (x, y = ground/feet level)
// ────────────────────────────────────────────────────────────────
/**
 * @param ctx    Canvas 2D context
 * @param heroId hero id (key of HERO_SKINS)
 * @param pose   pose object (merged over NEUTRAL_POSE)
 * @param opts   { x, y, scale, view: 'front'|'side', flip: bool }
 */
export function drawCharacter(ctx, heroId, pose, opts = {}) {
  const skin = HERO_SKINS[heroId] || HERO_SKINS['knight-shadow'];
  const cls = CLASS_OF(heroId);
  const P = PROPORTIONS[cls];
  const p = { ...NEUTRAL_POSE, ...pose };
  const view = opts.view || 'front';
  const scale = opts.scale ?? 1;
  const x = opts.x ?? 0, y = opts.y ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.flip ? -scale : scale, scale);
  // place hip so feet rest at y=0 when legs are straight
  const standH = P.legLen + P.shinLen;
  ctx.translate(0, -standH + p.hipY);

  const hipSpread = view === 'side' ? 3.5 : P.hipW / 2;

  // Leg FK — thigh angle: 0 = straight down, + = forward swing.
  // Knee flexion bends the shin BACKWARD relative to the thigh
  // (heel toward the seat), hence the negative relative angle.
  const legL = fk(-hipSpread, 0, P.legLen, p.thighL, P.shinLen, -p.kneeL);
  const legR = fk(hipSpread, 0, P.legLen, p.thighR, P.shinLen, -p.kneeR);

  // Torso top (shoulder line) leans with spine
  const spineTopX = Math.sin(p.spine) * P.torsoH;
  const spineTopY = -P.torsoH * p.squash;
  const shSpread = view === 'side' ? 2.5 : P.shoulderSpread;
  const shLX = spineTopX - shSpread, shRX = spineTopX + shSpread;
  const shY = spineTopY + 8;

  // Arm FK — shoulder angle: 0 = hanging straight down, + = forward
  // swing, large negative = raised overhead. Elbow flexes the forearm
  // FORWARD relative to the upper arm (anatomical hinge direction).
  const armL = fk(shLX, shY, P.armLen, p.shoulderL, P.foreLen, p.elbowL);
  const armR = fk(shRX, shY, P.armLen, p.shoulderR, P.foreLen, p.elbowR);

  const legCol = cls === 'bunny' ? skin.bodyD : skin.bodyD;
  const footCol = cls === 'bunny' ? skin.body : '#2a3f3f';

  const drawLeg = (leg, spread) => {
    limb(ctx, spread, 0, leg[0], leg[1], leg[2], leg[3], P.legW, P.legW * 0.8, legCol);
    // foot — a papercut wedge pointing forward
    const fdir = view === 'side' ? 1 : (spread < 0 ? -0.4 : 0.4);
    fillPoly(ctx, [
      [leg[2] - 3, leg[3] - 4], [leg[2] + fdir * P.footLen, leg[3] - 3],
      [leg[2] + fdir * P.footLen, leg[3] + 3], [leg[2] - 4, leg[3] + 4],
    ], footCol, { sx: 2, sy: 2.5 });
  };

  const drawArm = (arm, shX) => {
    limb(ctx, shX, shY, arm[0], arm[1], arm[2], arm[3], P.armW, P.armW * 0.78, skin.body);
    fillCircle(ctx, arm[2], arm[3], P.armW * 0.55, cls === 'bunny' ? skin.bodyD : skin.skin, { sx: 1.5, sy: 2 });
  };

  const drawTorso = () => {
    const w = P.torsoW / (view === 'side' ? 1.7 : 1);
    if (P.robed) {
      // robe flares to the ground, hiding upper legs (authentic wizard silhouette)
      fillPoly(ctx, [
        [spineTopX - w / 2, spineTopY], [spineTopX + w / 2, spineTopY],
        [w * 0.72, P.legLen * 0.9], [-w * 0.72, P.legLen * 0.9],
      ], skin.body, { sx: 3, sy: 4.5 });
      fillPoly(ctx, [[-w * 0.72, P.legLen * 0.82], [w * 0.72, P.legLen * 0.82], [w * 0.72, P.legLen * 0.9], [-w * 0.72, P.legLen * 0.9]], skin.gold, { ns: true });
      fillPoly(ctx, [[spineTopX - 1.5, spineTopY + 6], [spineTopX + 1.5, spineTopY + 6], [1.5, P.legLen * 0.7], [-1.5, P.legLen * 0.7]], skin.bodyD, { ns: true });
    } else {
      fillPoly(ctx, [
        [spineTopX - w / 2, spineTopY], [spineTopX + w / 2, spineTopY],
        [w / 2 - 2, 4], [-w / 2 + 2, 4],
      ], skin.body, { sx: 3, sy: 4.5 });
      // belt
      fillPoly(ctx, [[-w / 2 + 2, -2], [w / 2 - 2, -2], [w / 2 - 2, 3], [-w / 2 + 2, 3]], skin.gold, { ns: true });
      if (skin.gear.tabard) {
        fillPoly(ctx, [[spineTopX - 5, spineTopY + 4], [spineTopX + 5, spineTopY + 4], [4, 0], [-4, 0]], skin.gear.tabard, { ns: true });
        fillPoly(ctx, [[spineTopX - 1.2, spineTopY + 8], [spineTopX + 1.2, spineTopY + 8], [1.2, -4], [-1.2, -4]], skin.accent, { ns: true });
      }
      if (skin.gear.vest) fillPoly(ctx, [[spineTopX - w / 2 + 3, spineTopY + 3], [spineTopX + w / 2 - 3, spineTopY + 3], [w / 2 - 4, -6], [-w / 2 + 4, -6]], skin.gear.vest, { ns: true });
      if (skin.gear.dress) fillPoly(ctx, [[spineTopX - w / 2 + 2, spineTopY + P.torsoH * 0.4], [spineTopX + w / 2 - 2, spineTopY + P.torsoH * 0.4], [w / 2 + 4, P.legLen * 0.55], [-w / 2 - 4, P.legLen * 0.55]], skin.gear.dress, { sx: 2, sy: 3 });
      if (skin.gear.armor) fillPoly(ctx, [[spineTopX - w / 2 + 2, spineTopY + 2], [spineTopX + w / 2 - 2, spineTopY + 2], [w / 2 - 3, spineTopY + P.torsoH * 0.55], [-w / 2 + 3, spineTopY + P.torsoH * 0.55]], skin.gear.armor, { ns: true });
      if (cls === 'bunny') {
        // fluffy belly
        fillCircle(ctx, spineTopX * 0.5, spineTopY + P.torsoH * 0.55, P.torsoW * 0.3, skin.bodyL, { ns: true });
      }
    }
  };

  const drawHead = () => {
    ctx.save();
    ctx.translate(spineTopX, spineTopY - (P.headCY < P.neckY ? 0 : 0));
    ctx.rotate(p.head);
    const hy = P.headCY - P.neckY; // head center relative to shoulder line
    ctx.translate(view === 'side' ? 2 : 0, hy);
    fillCircle(ctx, 0, 0, P.headR, skin.body, { sx: 3, sy: 4 });
    if (cls !== 'bunny' && !skin.gear.helm) fillCircle(ctx, 0, 2, P.headR * 0.78, skin.skin, { ns: true });
    if (cls === 'knight' && skin.gear.helm === 'full') {
      // visor slit face
      fillCircle(ctx, 0, 2, P.headR * 0.8, skin.bodyD, { ns: true });
      fillPoly(ctx, [[-P.headR * 0.55, -1], [P.headR * 0.55, -1], [P.headR * 0.55, 4], [-P.headR * 0.55, 4]], '#1f2a2a', { ns: true });
      fillCircle(ctx, view === 'side' ? P.headR * 0.3 : -P.headR * 0.26, 1.5, 1.6, '#ecb964', { ns: true });
      if (view !== 'side') fillCircle(ctx, P.headR * 0.26, 1.5, 1.6, '#ecb964', { ns: true });
    } else {
      drawFace(ctx, skin, P, view, cls);
    }
    if (P.ears) drawEars(ctx, skin, P, p.earFlop, view);
    drawHeadgear(ctx, skin, P, view);
    ctx.restore();
  };

  const drawWeapon = (hand) => {
    if (P.weapon === 'sword') drawSword(ctx, hand[2], hand[3], hand[4] + p.weapon + Math.PI, skin);
    else if (P.weapon === 'staff') drawStaff(ctx, hand[2], hand[3], hand[4] * 0.3 + p.weapon, skin);
  };

  // ── Painter's order per view ──
  if (view === 'side') {
    // far side first, near side last: farArm, farLeg, torso, nearLeg, head, weapon, nearArm
    drawArm(armL, shLX);
    drawLeg(legL, -hipSpread);
    drawTorso();
    drawLeg(legR, hipSpread);
    drawHead();
    drawWeapon(armR);
    drawArm(armR, shRX);
  } else {
    drawLeg(legL, -hipSpread);
    drawLeg(legR, hipSpread);
    drawTorso();
    drawArm(armL, shLX);
    drawHead();
    drawWeapon(armR);
    drawArm(armR, shRX);
    if (skin.gear.shield) {
      fillCircle(ctx, shLX - 8, shY + P.armLen * 0.9, 13, skin.bodyD, { sx: 2, sy: 3 });
      fillCircle(ctx, shLX - 8, shY + P.armLen * 0.9, 9.5, '#f5eedd', { ns: true });
      fillPoly(ctx, [[shLX - 9.5, shY + P.armLen * 0.9 - 5], [shLX - 6.5, shY + P.armLen * 0.9 - 5], [shLX - 6.5, shY + P.armLen * 0.9 + 5], [shLX - 9.5, shY + P.armLen * 0.9 + 5]], skin.accent, { ns: true });
    }
  }

  ctx.restore();
}

/**
 * Purchased-skin recolor for a hero, or null for the default look.
 * Returns the variant's dominant papercut tones so the original-art
 * renderer can wash a bought skin (Golden/Crimson/Frost/…) over the
 * hand-drawn sprite without re-arting it. Default skins keep the
 * hero's original palette untouched.
 */
export function skinVariantTint(heroId, skinId) {
  if (!skinId || skinId === 'default') return null;
  const v = SKIN_VARIANTS[`${heroId}:${skinId}`];
  if (!v) return null;
  return { body: v.body, bodyL: v.bodyL || v.body, accent: v.accent || v.body };
}

/** Standing height in model units (for sizing render canvases). */
export function characterHeight(heroId) {
  const P = PROPORTIONS[CLASS_OF(heroId)];
  const legs = P.legLen + P.shinLen;
  const hat = P.ears ? 46 : 50;
  return legs + P.torsoH + P.headR * 2 + hat * 0.4;
}

export { CLASS_OF as classOf, PROPORTIONS };
