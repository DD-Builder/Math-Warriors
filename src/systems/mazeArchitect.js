/**
 * Room-based maze generator for Math Warriors.
 *
 * Replaces the old hand-crafted tile grids with procedurally generated
 * room-based mazes where each room has a purpose (start, challenge,
 * treasure, boss antechamber, boss).
 *
 * Each floor theme can customize room shapes, corridor widths, and
 * challenge object placement via its floor config.
 *
 * Tile codes match levelEngine.js:
 *   0 = wall (LV_TW)
 *   1 = floor (LV_TF)
 *   2 = path (LV_TP)
 *   3 = water (LV_TQ)
 *   4 = secret (LV_TS)
 */

import { makeRng } from './rng.js';
import { TILE } from '../data/floors.js';

// ─── Room purposes ──────────────────────────────────────────────
const ROOM_START       = 'start';
const ROOM_CHALLENGE   = 'challenge';
const ROOM_TREASURE    = 'treasure';
const ROOM_ANTECHAMBER = 'antechamber';
const ROOM_BOSS        = 'boss';
const ROOM_SECRET      = 'secret';

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Pick a value from an array using the RNG.
 */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Shuffle an array in-place using Fisher-Yates.
 */
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Create a 2D grid filled with a value.
 */
function makeGrid(w, h, val) {
  const g = [];
  for (let y = 0; y < h; y++) {
    g[y] = new Array(w).fill(val);
  }
  return g;
}

// ─── Room placement ─────────────────────────────────────────────

/**
 * Try to place a room of the given size on the grid without overlapping
 * existing rooms (with 1-tile wall margin). Returns the room rect or null.
 */
function tryPlaceRoom(grid, w, h, roomW, roomH, rng, attempts) {
  for (let a = 0; a < attempts; a++) {
    const rx = 1 + Math.floor(rng() * (w - roomW - 2));
    const ry = 1 + Math.floor(rng() * (h - roomH - 2));
    if (canPlace(grid, rx, ry, roomW, roomH)) {
      return { x: rx, y: ry, w: roomW, h: roomH };
    }
  }
  return null;
}

function canPlace(grid, rx, ry, rw, rh) {
  // Check with 1-tile margin for walls between rooms
  const x0 = rx - 1, y0 = ry - 1;
  const x1 = rx + rw, y1 = ry + rh;
  if (x0 < 0 || y0 < 0 || x1 >= grid[0].length || y1 >= grid.length) return false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (grid[y][x] !== TILE.WALL) return false;
    }
  }
  return true;
}

/**
 * Carve a room into the grid (set tiles to FLOOR).
 */
function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      grid[y][x] = TILE.FLOOR;
    }
  }
}

// ─── Corridor carving ───────────────────────────────────────────

/**
 * Connect two rooms with an L-shaped corridor (2-3 tiles wide).
 * The corridor goes from the center of room A to room B,
 * first horizontally then vertically.
 */
function connectRooms(grid, a, b, corridorWidth, rng) {
  const ax = Math.floor(a.x + a.w / 2);
  const ay = Math.floor(a.y + a.h / 2);
  const bx = Math.floor(b.x + b.w / 2);
  const by = Math.floor(b.y + b.h / 2);

  const hw = Math.floor(corridorWidth / 2);
  const gridW = grid[0].length;
  const gridH = grid.length;

  // Horizontal segment
  const xStart = Math.min(ax, bx);
  const xEnd = Math.max(ax, bx);
  for (let x = xStart; x <= xEnd; x++) {
    for (let dy = -hw; dy <= hw; dy++) {
      const cy = ay + dy;
      if (cy > 0 && cy < gridH - 1 && x > 0 && x < gridW - 1) {
        if (grid[cy][x] === TILE.WALL) {
          grid[cy][x] = TILE.PATH;
        }
      }
    }
  }

  // Vertical segment
  const yStart = Math.min(ay, by);
  const yEnd = Math.max(ay, by);
  for (let y = yStart; y <= yEnd; y++) {
    for (let dx = -hw; dx <= hw; dx++) {
      const cx = bx + dx;
      if (y > 0 && y < gridH - 1 && cx > 0 && cx < gridW - 1) {
        if (grid[y][cx] === TILE.WALL) {
          grid[y][cx] = TILE.PATH;
        }
      }
    }
  }
}

// ─── Flood fill validation ──────────────────────────────────────

/**
 * Returns a Set of "x,y" keys for all tiles reachable from (sx,sy)
 * that are not walls.
 */
function floodFill(grid, sx, sy) {
  const w = grid[0].length, h = grid.length;
  const visited = new Set();
  const queue = [[sx, sy]];
  visited.add(`${sx},${sy}`);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (grid[ny][nx] === TILE.WALL) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return visited;
}

// ─── Secret passage ─────────────────────────────────────────────

/**
 * Find a wall tile that separates two rooms (has floor/path on both
 * sides). Place a SECRET tile there.
 */
function placeSecretPassage(grid, rooms, rng) {
  const w = grid[0].length, h = grid.length;
  const candidates = [];

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (grid[y][x] !== TILE.WALL) continue;
      // Check horizontal: floor on both sides
      if (grid[y][x-1] !== TILE.WALL && grid[y][x+1] !== TILE.WALL &&
          grid[y][x-1] !== TILE.WATER && grid[y][x+1] !== TILE.WATER) {
        candidates.push({ x, y });
      }
      // Check vertical: floor on both sides
      if (grid[y-1][x] !== TILE.WALL && grid[y+1][x] !== TILE.WALL &&
          grid[y-1][x] !== TILE.WATER && grid[y+1][x] !== TILE.WATER) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length > 0) {
    const spot = pick(rng, candidates);
    grid[spot.y][spot.x] = TILE.SECRET;
    return spot;
  }
  return null;
}

// ─── Floor-specific water placement ─────────────────────────────

/**
 * Apply floor-themed water/hazard tiles around rooms.
 * Each theme uses water differently:
 *   - Tidepool: flood some rooms
 *   - Cloud/Ember: sky/lava gaps between rooms
 *   - Frozen: ice patches
 *   - Mending: fragmented gaps
 */
function applyFloorWater(grid, rooms, floorId, rng) {
  const w = grid[0].length, h = grid.length;

  switch (floorId) {
    case 2: // Tidepool — flood 1-2 non-critical rooms partially
      for (const room of rooms) {
        if (room.purpose === ROOM_START || room.purpose === ROOM_BOSS) continue;
        if (rng() < 0.3) {
          // Flood edges of the room with water
          for (let x = room.x; x < room.x + room.w; x++) {
            if (rng() < 0.4) grid[room.y][x] = TILE.WATER;
            if (rng() < 0.4) grid[room.y + room.h - 1][x] = TILE.WATER;
          }
        }
      }
      break;

    case 3: // Cloud — sky gaps (water) between some rooms
    case 4: // Ember — lava channels between rock chambers
      // Place water strips in corridor areas
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (grid[y][x] !== TILE.WALL) continue;
          // Random wall tiles near paths become water (visible gaps)
          const nearPath = (
            (x > 0 && (grid[y][x-1] === TILE.PATH || grid[y][x-1] === TILE.FLOOR)) ||
            (x < w-1 && (grid[y][x+1] === TILE.PATH || grid[y][x+1] === TILE.FLOOR)) ||
            (y > 0 && (grid[y-1][x] === TILE.PATH || grid[y-1][x] === TILE.FLOOR)) ||
            (y < h-1 && (grid[y+1][x] === TILE.PATH || grid[y+1][x] === TILE.FLOOR))
          );
          if (nearPath && rng() < 0.15) {
            grid[y][x] = TILE.WATER;
          }
        }
      }
      break;

    case 5: // Frozen — ice patches in rooms
      for (const room of rooms) {
        if (room.purpose === ROOM_START) continue;
        if (rng() < 0.35) {
          const cx = room.x + Math.floor(room.w / 2);
          const cy = room.y + Math.floor(room.h / 2);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const tx = cx + dx, ty = cy + dy;
              if (ty >= 0 && ty < h && tx >= 0 && tx < w && grid[ty][tx] === TILE.FLOOR && rng() < 0.5) {
                grid[ty][tx] = TILE.WATER;
              }
            }
          }
        }
      }
      break;

    case 9: // Mending — fragmented rooms with gaps
      for (const room of rooms) {
        if (room.purpose === ROOM_START || room.purpose === ROOM_BOSS) continue;
        if (rng() < 0.4) {
          for (let y2 = room.y; y2 < room.y + room.h; y2++) {
            for (let x2 = room.x; x2 < room.x + room.w; x2++) {
              if (rng() < 0.15 && grid[y2][x2] === TILE.FLOOR) {
                grid[y2][x2] = TILE.WATER;
              }
            }
          }
        }
      }
      break;

    default:
      // Floors 1, 6, 7, 8 — minimal/no water
      break;
  }
}

// ─── Challenge target tile computation ──────────────────────────

/**
 * Compute the target tiles that a challenge object will transform
 * when activated. These are water/wall tiles near the object that
 * will become floor tiles.
 */
function computeTargetTiles(grid, obj, floorId, rng) {
  const w = grid[0].length, h = grid.length;
  const targets = [];

  // Determine search radius and from/to based on floor type
  let radius = 3;
  let fromTile = TILE.WATER;
  let toTile = TILE.FLOOR;

  switch (floorId) {
    case 1: // Garden: grow vines — water->floor in 3x3
      radius = 3;
      fromTile = TILE.WATER;
      break;
    case 2: // Tidepool: drain pool — water->floor in radius
      radius = 4;
      fromTile = TILE.WATER;
      break;
    case 3: // Cloud: build bridge — water->floor in a line
      radius = 5;
      fromTile = TILE.WATER;
      break;
    case 4: // Ember: cool lava — water->floor in channel
      radius = 4;
      fromTile = TILE.WATER;
      break;
    case 5: // Frozen: melt ice — water->floor in circle
      radius = 3;
      fromTile = TILE.WATER;
      break;
    case 6: // Crystal: prism beam — wall->floor in line
      radius = 5;
      fromTile = TILE.WALL;
      break;
    case 7: // Market: open gate — wall->floor in doorway
      radius = 2;
      fromTile = TILE.WALL;
      break;
    case 8: // Library: remove wall — wall->floor
      radius = 3;
      fromTile = TILE.WALL;
      break;
    case 9: // Mending: restore floor — water->floor
      radius = 4;
      fromTile = TILE.WATER;
      break;
  }

  // Collect nearby tiles of the target type
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const tx = obj.x + dx;
      const ty = obj.y + dy;
      if (tx <= 0 || ty <= 0 || tx >= w - 1 || ty >= h - 1) continue;
      if (grid[ty][tx] === fromTile) {
        targets.push({ tx, ty });
      }
    }
  }

  // If we found no natural targets, plant some water/wall tiles
  // near the challenge object so there's something to transform
  if (targets.length < 2) {
    const planted = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (dx * dx + dy * dy > radius * radius) continue;
        const tx = obj.x + dx;
        const ty = obj.y + dy;
        if (tx <= 0 || ty <= 0 || tx >= w - 1 || ty >= h - 1) continue;
        if (grid[ty][tx] === TILE.FLOOR && rng() < 0.3) {
          grid[ty][tx] = fromTile;
          planted.push({ tx, ty });
          if (planted.length >= 4) break;
        }
      }
      if (planted.length >= 4) break;
    }
    targets.push(...planted);
  }

  return { targetTiles: targets, fromTile, toTile };
}

// ─── Room size picker ───────────────────────────────────────────

function pickRoomSize(rng, templates) {
  if (templates && templates.length > 0) {
    const t = pick(rng, templates);
    return { w: t.w, h: t.h };
  }
  // Default: 5-9 tiles
  return {
    w: 5 + Math.floor(rng() * 5),
    h: 5 + Math.floor(rng() * 5),
  };
}

// ─── Main generator ─────────────────────────────────────────────

/**
 * Generate a room-based maze for the given floor.
 *
 * @param {number} floorId - 1-9
 * @param {number} width - grid columns (15-20)
 * @param {number} height - grid rows (15-20)
 * @param {number} seed - RNG seed for deterministic generation
 * @param {object} [floorConfig] - optional floor-specific config
 * @returns {{ tiles: number[][], objects: object[], startX: number, startY: number }}
 */
export function generateMaze(floorId, width, height, seed, floorConfig) {
  const rng = makeRng(seed);
  const config = floorConfig || {};
  const roomTemplates = config.roomTemplates || null;
  const challengeType = config.challengeType || 'fairy';
  const challengeCount = config.challengeCount || 3;
  const enemyCount = config.enemyCount || 5;
  const corridorWidth = config.corridorWidth || 2;

  // 1. Initialize grid — all walls
  const grid = makeGrid(width, height, TILE.WALL);

  // 2. Define room count: 6-8 rooms
  const totalRooms = 6 + Math.floor(rng() * 3);

  // Assign purposes for rooms:
  //   0: start
  //   1..challengeCount: challenge rooms
  //   challengeCount+1: treasure/secret room
  //   challengeCount+2: boss antechamber
  //   challengeCount+3: boss room
  //   remaining: secret/treasure side rooms

  const purposes = [ROOM_START];
  for (let i = 0; i < challengeCount; i++) purposes.push(ROOM_CHALLENGE);
  purposes.push(ROOM_ANTECHAMBER);
  purposes.push(ROOM_BOSS);
  // Fill remaining with treasure/secret
  while (purposes.length < totalRooms) {
    purposes.push(rng() < 0.5 ? ROOM_TREASURE : ROOM_SECRET);
  }

  // 3. Place rooms
  const rooms = [];
  for (let i = 0; i < purposes.length; i++) {
    const purpose = purposes[i];
    let size;
    if (purpose === ROOM_START) {
      size = { w: 5 + Math.floor(rng() * 2), h: 5 + Math.floor(rng() * 2) };
    } else if (purpose === ROOM_BOSS) {
      size = { w: 7 + Math.floor(rng() * 3), h: 7 + Math.floor(rng() * 3) };
    } else if (purpose === ROOM_ANTECHAMBER) {
      size = { w: 5 + Math.floor(rng() * 2), h: 5 + Math.floor(rng() * 2) };
    } else {
      size = pickRoomSize(rng, roomTemplates);
    }

    // Clamp to grid bounds (leave border wall)
    size.w = clamp(size.w, 4, width - 4);
    size.h = clamp(size.h, 4, height - 4);

    const room = tryPlaceRoom(grid, width, height, size.w, size.h, rng, 80);
    if (room) {
      room.purpose = purpose;
      room.index = i;
      rooms.push(room);
      carveRoom(grid, room);
    }
  }

  // If we couldn't place enough rooms, try smaller ones
  while (rooms.length < 4) {
    const size = { w: 4, h: 4 };
    const room = tryPlaceRoom(grid, width, height, size.w, size.h, rng, 100);
    if (!room) break;
    const purposeIdx = rooms.length;
    room.purpose = purposeIdx < purposes.length ? purposes[purposeIdx] : ROOM_TREASURE;
    room.index = rooms.length;
    rooms.push(room);
    carveRoom(grid, room);
  }

  // Ensure we have at least start and boss rooms
  if (rooms.length < 2) {
    // Fallback: carve a simpler layout
    const startRoom = { x: 1, y: height - 6, w: 5, h: 5, purpose: ROOM_START, index: 0 };
    const bossRoom = { x: width - 8, y: 1, w: 7, h: 7, purpose: ROOM_BOSS, index: 1 };
    rooms.length = 0;
    rooms.push(startRoom, bossRoom);
    carveRoom(grid, startRoom);
    carveRoom(grid, bossRoom);
  }

  // 4. Sort rooms for critical path: start at bottom, boss at top
  const startRoom = rooms.find(r => r.purpose === ROOM_START) || rooms[0];
  const bossRoom = rooms.find(r => r.purpose === ROOM_BOSS) || rooms[rooms.length - 1];
  const antechamber = rooms.find(r => r.purpose === ROOM_ANTECHAMBER);
  const challengeRooms = rooms.filter(r => r.purpose === ROOM_CHALLENGE);
  const sideRooms = rooms.filter(r =>
    r.purpose === ROOM_TREASURE || r.purpose === ROOM_SECRET
  );

  // 5. Build critical path: start -> challenges -> antechamber -> boss
  const criticalPath = [startRoom];
  // Sort challenge rooms by distance from start (near to far)
  challengeRooms.sort((a, b) => {
    const da = Math.abs(a.x - startRoom.x) + Math.abs(a.y - startRoom.y);
    const db = Math.abs(b.x - startRoom.x) + Math.abs(b.y - startRoom.y);
    return da - db;
  });
  for (const cr of challengeRooms) criticalPath.push(cr);
  if (antechamber) criticalPath.push(antechamber);
  criticalPath.push(bossRoom);

  // 6. Connect rooms along critical path
  for (let i = 0; i < criticalPath.length - 1; i++) {
    connectRooms(grid, criticalPath[i], criticalPath[i + 1], corridorWidth, rng);
  }

  // Connect side rooms to nearest critical-path room
  for (const sr of sideRooms) {
    let nearest = criticalPath[0];
    let nearDist = Infinity;
    for (const cp of criticalPath) {
      const d = Math.abs(cp.x - sr.x) + Math.abs(cp.y - sr.y);
      if (d < nearDist) { nearDist = d; nearest = cp; }
    }
    connectRooms(grid, sr, nearest, corridorWidth, rng);
  }

  // 7. Apply floor-specific water/hazard tiles
  applyFloorWater(grid, rooms, floorId, rng);

  // 8. Place secret passage
  placeSecretPassage(grid, rooms, rng);

  // 9. Flood-fill validate
  const startX = startRoom.x + Math.floor(startRoom.w / 2);
  const startY = startRoom.y + Math.floor(startRoom.h / 2);
  const reachable = floodFill(grid, startX, startY);

  // Ensure boss room is reachable; if not, force-connect
  const bossCX = bossRoom.x + Math.floor(bossRoom.w / 2);
  const bossCY = bossRoom.y + Math.floor(bossRoom.h / 2);
  if (!reachable.has(`${bossCX},${bossCY}`)) {
    connectRooms(grid, startRoom, bossRoom, corridorWidth, rng);
  }

  // 10. Place objects
  const objects = [];

  // Helper: find a walkable tile in a room
  function roomFloorTile(room, offsetX, offsetY) {
    const tx = clamp(room.x + (offsetX || Math.floor(room.w / 2)),
                     room.x, room.x + room.w - 1);
    const ty = clamp(room.y + (offsetY || Math.floor(room.h / 2)),
                     room.y, room.y + room.h - 1);
    return { x: tx, y: ty };
  }

  // Helper: find a random floor tile in a room that isn't occupied
  const occupied = new Set();
  occupied.add(`${startX},${startY}`);

  function findOpenSpot(room) {
    for (let a = 0; a < 30; a++) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      const key = `${tx},${ty}`;
      if (!occupied.has(key) && grid[ty][tx] !== TILE.WALL) {
        occupied.add(key);
        return { x: tx, y: ty };
      }
    }
    // Fallback: center of room
    const pos = roomFloorTile(room);
    occupied.add(`${pos.x},${pos.y}`);
    return pos;
  }

  // Challenge objects in challenge rooms
  const challengeTypeMap = {
    1: 'sprout', 2: 'valve', 3: 'shrine', 4: 'vent',
    5: 'beacon', 6: 'prism', 7: 'gate', 8: 'page', 9: 'anchor',
  };

  // Use the floor's actual challenge type from the floor config
  // (e.g., 'fairy', 'valve', 'beacon', etc.) — these are the types
  // the MazeScene already knows how to handle
  const actualChallengeType = challengeType;

  let challengeIdx = 0;
  for (const cr of challengeRooms) {
    if (challengeIdx >= challengeCount) break;
    const spot = findOpenSpot(cr);
    const chalObj = {
      type: actualChallengeType,
      x: spot.x,
      y: spot.y,
    };
    // Compute target tiles for world-altering transformation
    const targets = computeTargetTiles(grid, chalObj, floorId, rng);
    chalObj.targetTiles = targets.targetTiles;
    chalObj.fromTile = targets.fromTile;
    chalObj.toTile = targets.toTile;
    objects.push(chalObj);
    challengeIdx++;
  }

  // If we didn't place enough challenges (not enough rooms), add more
  while (challengeIdx < challengeCount) {
    // Pick any challenge or side room
    const room = challengeRooms[challengeIdx % challengeRooms.length] ||
                 sideRooms[0] || startRoom;
    const spot = findOpenSpot(room);
    const chalObj = {
      type: actualChallengeType,
      x: spot.x,
      y: spot.y,
    };
    const targets = computeTargetTiles(grid, chalObj, floorId, rng);
    chalObj.targetTiles = targets.targetTiles;
    chalObj.fromTile = targets.fromTile;
    chalObj.toTile = targets.toTile;
    objects.push(chalObj);
    challengeIdx++;
  }

  // Boss room: boss + golden chest + exit (linear sequence)
  const bossPos = roomFloorTile(bossRoom, Math.floor(bossRoom.w / 2), Math.floor(bossRoom.h / 2));
  occupied.add(`${bossPos.x},${bossPos.y}`);
  const goldenPos = { x: bossPos.x, y: clamp(bossPos.y - 1, bossRoom.y, bossRoom.y + bossRoom.h - 1) };
  occupied.add(`${goldenPos.x},${goldenPos.y}`);
  const exitPos = { x: bossPos.x, y: clamp(bossPos.y - 2, bossRoom.y, bossRoom.y + bossRoom.h - 1) };
  occupied.add(`${exitPos.x},${exitPos.y}`);

  // Boss enemyId comes from the floor definition; we just record the position
  objects.push({ type: 'boss', x: bossPos.x, y: bossPos.y, enemyId: config.bossEnemyId || null });
  objects.push({ type: 'golden', x: goldenPos.x, y: goldenPos.y });
  objects.push({ type: 'exit', x: exitPos.x, y: exitPos.y });

  // Boss antechamber: gold key chest
  if (antechamber) {
    const keySpot = findOpenSpot(antechamber);
    objects.push({ type: 'chest', x: keySpot.x, y: keySpot.y, loot: { gold: 20 + floorId * 5 } });
  }

  // Treasure/secret rooms: chests, potions
  for (const tr of sideRooms) {
    const chestSpot = findOpenSpot(tr);
    objects.push({ type: 'chest', x: chestSpot.x, y: chestSpot.y, loot: { gold: 15 + floorId * 5 } });
    if (rng() < 0.6) {
      const potionSpot = findOpenSpot(tr);
      objects.push({ type: 'potion', x: potionSpot.x, y: potionSpot.y });
    }
  }

  // Gold pickups scattered
  const goldCount = 2 + Math.floor(rng() * 2);
  for (let g = 0; g < goldCount; g++) {
    const room = pick(rng, rooms.filter(r => r.purpose !== ROOM_BOSS));
    if (room) {
      const spot = findOpenSpot(room);
      objects.push({ type: 'gold', x: spot.x, y: spot.y });
    }
  }

  // Math doors (1-2)
  const doorCount = 1 + (rng() < 0.5 ? 1 : 0);
  for (let d = 0; d < doorCount; d++) {
    // Place in corridor areas — find a path tile
    const pathTiles = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y][x] === TILE.PATH && !occupied.has(`${x},${y}`)) {
          pathTiles.push({ x, y });
        }
      }
    }
    if (pathTiles.length > 0) {
      const spot = pick(rng, pathTiles);
      occupied.add(`${spot.x},${spot.y}`);
      objects.push({ type: 'mathdoor', x: spot.x, y: spot.y, id: `f${floorId}door${d + 1}` });
    }
  }

  // Fountain (1 per maze)
  const fountainRoom = pick(rng, rooms.filter(r =>
    r.purpose !== ROOM_BOSS && r.purpose !== ROOM_START
  ));
  if (fountainRoom) {
    const spot = findOpenSpot(fountainRoom);
    objects.push({ type: 'fountain', x: spot.x, y: spot.y, id: `f${floorId}fountain1`, uses: 3 });
  }

  // Corridor encounters
  const corridorTiles = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if ((grid[y][x] === TILE.PATH || grid[y][x] === TILE.FLOOR) && !occupied.has(`${x},${y}`)) {
        // Only place encounters away from start
        const dx = Math.abs(x - startX);
        const dy = Math.abs(y - startY);
        if (dx + dy >= 3) {
          corridorTiles.push({ x, y });
        }
      }
    }
  }
  shuffle(rng, corridorTiles);
  const encounters = Math.min(enemyCount, corridorTiles.length);
  for (let e = 0; e < encounters; e++) {
    const spot = corridorTiles[e];
    occupied.add(`${spot.x},${spot.y}`);
    objects.push({ type: 'encounter', x: spot.x, y: spot.y });
  }

  return {
    tiles: grid,
    objects,
    startX,
    startY,
  };
}
