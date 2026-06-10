/**
 * Perspective system — pure 2D tricks to create depth and 3/4-view illusion.
 *
 * No actual 3D: we use Y-based scaling, depth sorting, and ground-plane
 * geometry to simulate looking at the scene from slightly above/in front.
 *
 * Two main use sites:
 *   1. Battle scene: heroes foreground-large, monsters background-smaller
 *   2. Maze scene: Y-sorted tiles for pass-behind overlapping
 */

// ──────────────────────────────────────────────────────────────
// PERSPECTIVE CONFIGS
// ──────────────────────────────────────────────────────────────

export const BATTLE_PERSPECTIVE = {
  horizonY: 200,
  groundTopY: 350,
  groundBottomY: 780,
  vanishX: 720,
  minScale: 0.65,
  maxScale: 1.0,
  heroBaseX: 280,
  heroSpacing: 100,
  heroStaggerX: 45,
  monsterBaseX: 1050,
  monsterSpacing: 90,
  monsterStaggerX: 40,
};

export const MAZE_PERSPECTIVE = {
  tileScaleNear: 1.0,
  tileScaleFar: 0.85,
  heightFactor: 0.4,
  depthShade: 0.08,
};

// ──────────────────────────────────────────────────────────────
// Y-BASED SCALING
// ──────────────────────────────────────────────────────────────

/**
 * Compute scale factor for an object based on its Y position
 * relative to the ground plane.
 *
 * Objects at groundBottomY (near camera) get maxScale.
 * Objects at groundTopY (far from camera) get minScale.
 */
export function scaleForY(y, config = BATTLE_PERSPECTIVE) {
  const range = config.groundBottomY - config.groundTopY;
  if (range <= 0) return config.maxScale;
  const t = Math.max(0, Math.min(1, (y - config.groundTopY) / range));
  return config.minScale + t * (config.maxScale - config.minScale);
}

/**
 * Apply perspective scaling and depth to a Phaser game object
 * based on its current Y position.
 */
export function applyPerspective(gameObj, config = BATTLE_PERSPECTIVE) {
  const y = gameObj.y;
  const s = scaleForY(y, config);
  gameObj.setScale(s);
  gameObj.setDepth(Math.floor(y));
}

// ──────────────────────────────────────────────────────────────
// DEPTH SORTING
// ──────────────────────────────────────────────────────────────

/**
 * Sort a Phaser Container's children by Y for correct overlap.
 * Objects with higher Y (closer to camera) render on top.
 */
export function sortByDepth(container) {
  container.sort('y');
}

/**
 * Sort an array of game objects by Y and set their depth accordingly.
 * depthBase offsets the depth values to avoid colliding with other layers.
 */
export function setDepthByY(objects, depthBase = 10) {
  objects.sort((a, b) => a.y - b.y);
  objects.forEach((obj, i) => {
    obj.setDepth(depthBase + i);
  });
}

// ──────────────────────────────────────────────────────────────
// BATTLE FORMATION POSITIONS
// ──────────────────────────────────────────────────────────────

/**
 * Compute hero positions in a 3/4-perspective diagonal formation.
 * Returns [{x, y, scale, depth}] for each hero slot (0 = front/near, 2 = back/far).
 */
export function heroFormation(heroCount, config = BATTLE_PERSPECTIVE) {
  const positions = [];
  for (let i = 0; i < heroCount; i++) {
    const t = heroCount > 1 ? i / (heroCount - 1) : 0.5;
    const y = config.groundBottomY - 60 - t * (config.groundBottomY - config.groundTopY - 180);
    const x = config.heroBaseX + i * config.heroStaggerX;
    const scale = scaleForY(y, config);
    positions.push({ x, y, scale, depth: Math.floor(y) });
  }
  return positions;
}

/**
 * Compute monster positions in a 3/4-perspective formation.
 * Returns [{x, y, scale, depth}] for each enemy slot.
 */
export function monsterFormation(enemyCount, config = BATTLE_PERSPECTIVE) {
  const positions = [];
  if (enemyCount === 1) {
    const y = config.groundTopY + (config.groundBottomY - config.groundTopY) * 0.35;
    positions.push({
      x: config.monsterBaseX,
      y,
      scale: scaleForY(y, config) * 0.9,
      depth: Math.floor(y),
    });
  } else if (enemyCount === 2) {
    for (let i = 0; i < 2; i++) {
      const t = i / 1;
      const y = config.groundTopY + 100 + t * 200;
      const x = config.monsterBaseX + (i === 0 ? -50 : 50);
      positions.push({ x, y, scale: scaleForY(y, config) * 0.75, depth: Math.floor(y) });
    }
  } else {
    for (let i = 0; i < enemyCount; i++) {
      const t = i / (enemyCount - 1);
      const y = config.groundTopY + 80 + t * 260;
      const x = config.monsterBaseX + (i - 1) * config.monsterStaggerX;
      positions.push({ x, y, scale: scaleForY(y, config) * 0.65, depth: Math.floor(y) });
    }
  }
  return positions;
}

// ──────────────────────────────────────────────────────────────
// GROUND PLANE
// ──────────────────────────────────────────────────────────────

/**
 * Draw a perspective ground plane (trapezoid that's wider at the bottom).
 * Gives the illusion of a floor receding into the distance.
 *
 * @param {Phaser.Graphics} gfx
 * @param {number} color
 * @param {number} alpha
 * @param {object} config
 */
export function drawGroundPlane(gfx, color, alpha, config = BATTLE_PERSPECTIVE) {
  const topW = 600;
  const botW = 1440;
  const cx = config.vanishX;
  const topY = config.groundTopY;
  const botY = config.groundBottomY;

  gfx.fillStyle(color, alpha);
  gfx.fillPoints([
    { x: cx - topW / 2, y: topY },
    { x: cx + topW / 2, y: topY },
    { x: cx + botW / 2, y: botY },
    { x: cx - botW / 2, y: botY },
  ], true);
}

/**
 * Draw a ground shadow beneath a character at (x, y).
 * Elliptical, flattened, semi-transparent — sells the "standing on ground" feel.
 */
export function drawGroundShadow(gfx, x, y, scale, config = {}) {
  const rx = (config.rx ?? 35) * scale;
  const ry = (config.ry ?? 10) * scale;
  const color = config.color ?? 0x000000;
  const alpha = config.alpha ?? 0.18;
  gfx.fillStyle(color, alpha);
  gfx.fillEllipse(x, y + (config.offsetY ?? 5), rx * 2, ry * 2);
}

// ──────────────────────────────────────────────────────────────
// MAZE Y-SORT HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * For a given tile row, return the render depth so tiles
 * further from the camera (lower row index) are drawn first.
 */
export function tileDepth(row, col, baseDepth = 0) {
  return baseDepth + row * 10 + col;
}

/**
 * Given a hero's grid row, compute if it should render behind
 * or in front of a wall/obstacle at the given row.
 */
export function heroBehinds(heroRow, wallRow) {
  return heroRow < wallRow;
}
