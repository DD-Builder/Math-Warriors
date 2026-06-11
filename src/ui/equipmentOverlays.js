/**
 * Equipment visual overlays — draws equipment-specific visual additions
 * on top of a hero's Canvas 2D render.
 *
 * Each equipment tier adds progressively more elaborate visual accents:
 *   Tier 1 (Wooden):    Simple brown/sand accents
 *   Tier 2 (Iron):      Grey metallic plates
 *   Tier 3 (Steel):     Brighter metallic armor
 *   Tier 4 (Mithril):   Blue-silver sheen with aura
 *   Tier 5 (Legendary): Glowing golden edges with particles
 *
 * All drawing uses raw Canvas 2D (no Phaser dependency).
 */

import { COLORS } from '../config.js';

// ---- Tier color palettes ----

const TIER_COLORS = {
  1: { // Wooden
    primary:   '#8b6914',
    secondary: '#c4a35a',
    accent:    '#d2b48c',
    glow:      null,
    glowAlpha: 0,
  },
  2: { // Iron
    primary:   '#6e6e6e',
    secondary: '#9a9a9a',
    accent:    '#b0b0b0',
    glow:      null,
    glowAlpha: 0,
  },
  3: { // Steel
    primary:   '#8a8a9a',
    secondary: '#b8b8c8',
    accent:    '#d0d0e0',
    glow:      '#c0c0d0',
    glowAlpha: 0.1,
  },
  4: { // Mithril
    primary:   '#5080b0',
    secondary: '#70a8d8',
    accent:    '#a0d0f0',
    glow:      '#60c0e0',
    glowAlpha: 0.2,
  },
  5: { // Legendary
    primary:   '#c88020',
    secondary: '#eaa030',
    accent:    '#f0d060',
    glow:      '#f0d060',
    glowAlpha: 0.35,
  },
};

function getTierIndex(tier) {
  if (typeof tier === 'number') return tier;
  const map = { wooden: 1, iron: 2, steel: 3, mithril: 4, legendary: 5 };
  return map[tier] || 1;
}

// ---- Drawing helpers ----

function drawShoulderGuard(ctx, cx, cy, sc, side, colors, size) {
  // side: -1 = left, 1 = right
  const x = cx + side * 22 * sc;
  const y = cy - 14 * sc;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.ellipse(x, y, size * sc, (size * 0.6) * sc, side * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Highlight edge
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * sc, (size * 0.7) * sc, (size * 0.3) * sc, side * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWeaponGlow(ctx, cx, cy, sc, colors, radius) {
  if (!colors.glow) return;
  ctx.save();
  const wx = cx + 32 * sc;
  const wy = cy - 30 * sc;
  const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, radius * sc);
  grad.addColorStop(0, colors.glow);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = colors.glowAlpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(wx, wy, radius * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWeaponSheen(ctx, cx, cy, sc, colors) {
  // A thin highlight line along the weapon area
  const wx = cx + 30 * sc;
  const wy = cy - 50 * sc;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2 * sc;
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(wx + 2 * sc, wy + 60 * sc);
  ctx.stroke();
  ctx.restore();
}

function drawLeatherStraps(ctx, cx, cy, sc, colors) {
  // Two horizontal straps across torso
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cx - 16 * sc, cy - 4 * sc, 32 * sc, 3 * sc);
  ctx.fillRect(cx - 14 * sc, cy + 6 * sc, 28 * sc, 3 * sc);
  // Buckle
  ctx.fillStyle = colors.secondary;
  ctx.fillRect(cx - 2 * sc, cy - 5 * sc, 4 * sc, 5 * sc);
  ctx.restore();
}

function drawArmGuards(ctx, cx, cy, sc, side, colors) {
  const x = cx + side * 28 * sc;
  const y = cy + 4 * sc;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = colors.primary;
  ctx.fillRect(x - 4 * sc, y - 12 * sc, 8 * sc, 24 * sc);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(x - 3 * sc, y - 11 * sc, 6 * sc, 2 * sc);
  ctx.fillRect(x - 3 * sc, y + 9 * sc, 6 * sc, 2 * sc);
  ctx.restore();
}

function drawArmorGlowOutline(ctx, cx, cy, sc, colors) {
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, 10 * sc, cx, cy, 60 * sc);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.7, colors.glow);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = colors.glowAlpha * 0.7;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 50 * sc, 65 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeadCirclet(ctx, cx, cy, sc, colors) {
  const hx = cx;
  const hy = cy - 48 * sc;
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2.5 * sc;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 14 * sc, 6 * sc, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  // Center gem
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = colors.glow || colors.accent;
  ctx.beginPath();
  ctx.arc(hx, hy - 5 * sc, 3 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoldParticleTrail(ctx, cx, cy, sc, colors) {
  // Scatter small glowing particles around the weapon
  const wx = cx + 30 * sc;
  const wy = cy - 20 * sc;
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist = (12 + (i * 3)) * sc;
    const px = wx + Math.cos(angle) * dist;
    const py = wy + Math.sin(angle) * dist - (i * 4) * sc;
    const size = (1.5 + (i % 3)) * sc;
    ctx.globalAlpha = 0.3 + (i % 3) * 0.15;
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Weapon handle glow (tier 1) ----

function drawWeaponHandleGlow(ctx, cx, cy, sc, colors) {
  const wx = cx + 30 * sc;
  const wy = cy + 10 * sc;
  ctx.save();
  ctx.globalAlpha = 0.25;
  const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, 10 * sc);
  grad.addColorStop(0, colors.secondary);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(wx, wy, 10 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Get an overlay descriptor for a single equipment piece.
 *
 * @param {string} equipmentId - Equipment item id (e.g. 'iron_sword')
 * @param {number|string} tier - Tier number (1-5) or name ('wooden'...'legendary')
 * @param {string} slot - 'weapon', 'armor', or 'accessory'
 * @returns {{ draw: (ctx, cx, cy, sc, heroClass) => void } | null}
 */
export function getEquipmentOverlay(equipmentId, tier, slot) {
  const ti = getTierIndex(tier);
  if (ti < 1 || ti > 5) return null;
  const colors = TIER_COLORS[ti];

  return {
    draw(ctx, cx, cy, sc, heroClass) {
      ctx.save();

      if (slot === 'weapon') {
        if (ti === 1) {
          drawWeaponHandleGlow(ctx, cx, cy, sc, colors);
        } else if (ti === 2) {
          drawWeaponSheen(ctx, cx, cy, sc, colors);
        } else if (ti === 3) {
          drawWeaponSheen(ctx, cx, cy, sc, colors);
          drawWeaponGlow(ctx, cx, cy, sc, colors, 18);
        } else if (ti === 4) {
          drawWeaponSheen(ctx, cx, cy, sc, colors);
          drawWeaponGlow(ctx, cx, cy, sc, colors, 24);
        } else if (ti === 5) {
          drawWeaponSheen(ctx, cx, cy, sc, colors);
          drawWeaponGlow(ctx, cx, cy, sc, colors, 30);
          drawGoldParticleTrail(ctx, cx, cy, sc, colors);
        }
      }

      if (slot === 'armor') {
        if (ti === 1) {
          drawLeatherStraps(ctx, cx, cy, sc, colors);
        } else if (ti === 2) {
          drawLeatherStraps(ctx, cx, cy, sc, colors);
          drawShoulderGuard(ctx, cx, cy, sc, -1, colors, 8);
          drawShoulderGuard(ctx, cx, cy, sc, 1, colors, 8);
        } else if (ti === 3) {
          drawLeatherStraps(ctx, cx, cy, sc, colors);
          drawShoulderGuard(ctx, cx, cy, sc, -1, colors, 12);
          drawShoulderGuard(ctx, cx, cy, sc, 1, colors, 12);
        } else if (ti === 4) {
          drawLeatherStraps(ctx, cx, cy, sc, colors);
          drawShoulderGuard(ctx, cx, cy, sc, -1, colors, 14);
          drawShoulderGuard(ctx, cx, cy, sc, 1, colors, 14);
          drawArmGuards(ctx, cx, cy, sc, -1, colors);
          drawArmGuards(ctx, cx, cy, sc, 1, colors);
        } else if (ti === 5) {
          drawShoulderGuard(ctx, cx, cy, sc, -1, colors, 16);
          drawShoulderGuard(ctx, cx, cy, sc, 1, colors, 16);
          drawArmGuards(ctx, cx, cy, sc, -1, colors);
          drawArmGuards(ctx, cx, cy, sc, 1, colors);
          drawArmorGlowOutline(ctx, cx, cy, sc, colors);
        }
      }

      if (slot === 'accessory') {
        if (ti >= 5) {
          drawHeadCirclet(ctx, cx, cy, sc, colors);
        }
      }

      ctx.restore();
    },
  };
}

/**
 * Draw all equipment overlays on top of a hero's canvas render.
 *
 * @param {HTMLCanvasElement} canvas - The hero's rendered canvas
 * @param {{ weapon?: { id: string, tier: number|string },
 *           armor?: { id: string, tier: number|string },
 *           accessory?: { id: string, tier: number|string } }} equipment
 * @param {string} heroClass - 'knight', 'wizard', or 'bunny'
 */
export function applyEquipmentOverlays(canvas, equipment, heroClass) {
  if (!equipment) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const sc = 1;

  for (const slot of ['weapon', 'armor', 'accessory']) {
    const item = equipment[slot];
    if (!item) continue;
    const overlay = getEquipmentOverlay(item.id, item.tier, slot);
    if (overlay) {
      overlay.draw(ctx, cx, cy, sc, heroClass);
    }
  }
}
