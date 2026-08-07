/**
 * Level architecture — the pure half of the 3D playable floors.
 *
 * WHY this file exists at all: `buildLevel3D` (./level3d.js) has to answer
 * three questions before it can cut a single triangle — where the ground IS,
 * what each tile is made OF, and which tiles the player may stand on — and all
 * three are decisions, not rendering. Keeping them here means they are plain
 * Node importable (no three, no DOM at import time), unit-testable, and
 * deterministic: the same floor id always produces byte-identical architecture,
 * which is what lets the screenshot harness compare frames at all.
 *
 * ── THE ONE IDEA: HEIGHT IS A FUNCTION OF WALK DISTANCE ────────────────────
 * A tile maze extruded straight up is a maze diagram, not a place. What turns
 * it into a place is elevation — terraces, a boss on a rise, water in a bowl.
 * The trap is that arbitrary elevation can wall a required route off, and a
 * floor that cannot be finished is worse than a flat one.
 *
 * So elevation is derived from the BFS distance field over the walkable tiles,
 * measured from the hero's own spawn. Adjacent walkable tiles differ by at most
 * ONE in that field (that is what BFS means), so their heights can differ by at
 * most one band step, over a full 4 m tile — about 13 degrees against a 50
 * degree slope limit. **Connectivity is therefore a theorem, not a playtest**:
 * if the 2D floor was completable, the 3D one is, at every point of the climb.
 *
 * The field is seeded through the floor's `transform` tiles as well, so the
 * districts that only exist after the world-changing payoff (Ebbport's drained
 * boulevards, the Shattered Sky's light-bridges) are terraced in the same
 * continuous system rather than stranded at height zero.
 *
 * ── WHY CORNERS, NOT TILES, CARRY THE HEIGHT ───────────────────────────────
 * Per-tile heights give a voxel staircase. Averaging the (up to) four tiles
 * that touch a lattice corner and sampling that lattice bilinearly gives two
 * things for free: terrace *ramps* exactly one tile wide at every band change,
 * and a soft bank wherever a sunken water tile meets dry land — the shoreline
 * shapes itself out of the same arithmetic that shapes the terraces.
 *
 * ── WHY ONLY BOUNDARY TILES GET GEOMETRY AND COLLIDERS ─────────────────────
 * Crystal Caverns is 831 wall tiles out of 1152; the Shattered Sky is 566 void
 * tiles. Almost none of them are visible or reachable — a wall buried in other
 * walls has no silhouette and no surface the player can touch. Culling to tiles
 * that face something walkable takes the collider set from ~900 to ~150 (and
 * collision.js scans every collider on every move) and the wall instance count
 * to roughly a third, with no visual difference whatsoever.
 */
import { PAPER } from '../config.js';
import { LEVEL_DEFS } from '../data/levels.js';

// ── World metrics ──────────────────────────────────────────────────────────

/** Metres per tile. A 22x16 floor becomes a generous 88x64 m place. */
export const TILE_M = 4;

/** Ground height of the entrance terrace. Above collision.js's WATER_Y+0.05 so
 *  dry land never reports as wading; sunk liquid tiles fall below it. */
export const BASE_Y = 1.0;

/** Metres gained per terrace band. */
export const TERRACE_RISE = 2.2;
/** Tiles of walking per band. 7 tiles = 28 m between steps. */
export const TERRACE_STRIDE = 7;
/** Bands are capped so the far end of a big floor stays in sightline. */
export const TERRACE_MAX = 6;
/** Fraction of a band that is flat before the ramp starts, and where it ends. */
export const RAMP_IN = 0.58;
export const RAMP_OUT = 0.95;

/** How far a liquid tile sinks below the ground it would otherwise have. */
export const LIQUID_DROP = 2.4;
/** Extra lift on the boss dais, and its falloff radius in tiles. */
export const BOSS_RISE = 2.6;
export const BOSS_RADIUS_TILES = 4.5;
/** Amplitude of the low-frequency shelf noise that keeps terraces from reading
 *  as poured concrete. Deliberately far under stepUp (0.5 m). */
export const SHELF_AMP = 0.34;

/** Collider radius on a blocking tile. 2.3 > half a tile so two diagonally
 *  adjacent blockers leave a 0.96 m gap — narrower than the 1.2 m player — and
 *  corners round off, which is what makes the controls forgiving. */
export const WALL_COLLIDER_R = 2.3;
export const LIQUID_COLLIDER_R = 2.15;
export const GATE_COLLIDER_R = 1.9;

const WALKABLE = new Set(['F', 'P', 'S']);
const TAU = Math.PI * 2;

/** True for tiles the player may stand on in the floor's INITIAL state. */
export function isWalkableChar(ch) { return WALKABLE.has(ch); }

// ── Determinism ────────────────────────────────────────────────────────────

/** Integer hash -> [0,1). Math.imul keeps every product exact in 32 bits. */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise over the tile lattice. Used for shelf relief and for the
 *  per-tile paper variation, so both wander together instead of fighting. */
export function valueNoise(x, y, scale, seed = 0) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function smoothstep(e0, e1, x) {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ── Per-floor theme table ──────────────────────────────────────────────────
//
// Every colour is a PAPER int. `wall` names the silhouette builder in
// level3d.js; `crown` the thing growing out of its top. Liquid palettes mirror
// water.js's OCEAN_PLIES shape (deep/mid/shallow/edge) so a floor's pond is cut
// from the same stock as the hub's sea, just re-dyed.

/** @typedef {{key:string,name:string,wall:string,crown:string,wallH:[number,number],
 *   ground:[number,number],groundAccent:number,path:number,pathRim:number,
 *   wallPlies:[number,number,number],crownPapers:number[],
 *   liquid:{deep:number,mid:number,shallow:number,edge:number,kind:string},
 *   detail:string,special:number}} LevelTheme */

/** @type {Record<number, LevelTheme>} */
export const LEVEL_THEMES = {
  1: {
    key: 'garden', name: 'The Garden', wall: 'hedge', crown: 'flower', wallH: [2.8, 4.4],
    ground: [PAPER.leaf, PAPER.sage], groundAccent: PAPER.forestL,
    path: PAPER.sand, pathRim: PAPER.creamD,
    wallPlies: [PAPER.forest, PAPER.forestL, PAPER.forestD],
    crownPapers: [PAPER.rose, PAPER.white, PAPER.gold],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'tuft', special: PAPER.rose,
  },
  2: {
    key: 'ebbport', name: 'Ebbport', wall: 'masonry', crown: 'moss', wallH: [2.6, 4.6],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.sageD,
    path: PAPER.creamD, pathRim: PAPER.sand,
    wallPlies: [PAPER.creamD, PAPER.cream, PAPER.sand],
    crownPapers: [PAPER.sageD, PAPER.leaf, PAPER.tealL],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'shell', special: PAPER.tealL,
  },
  3: {
    key: 'sky', name: 'The Shattered Sky', wall: 'cloudbank', crown: 'none', wallH: [3.0, 5.2],
    ground: [PAPER.creamD, PAPER.sand], groundAccent: PAPER.sky,
    path: PAPER.white, pathRim: PAPER.sky,
    wallPlies: [PAPER.white, PAPER.cream, PAPER.sky],
    crownPapers: [PAPER.white, PAPER.sky, PAPER.lavender],
    liquid: { deep: PAPER.sky, mid: PAPER.tealL, shallow: PAPER.cream, edge: PAPER.white, kind: 'cloud' },
    detail: 'crystal', special: PAPER.gold,
  },
  4: {
    key: 'ember', name: 'Ember Caves', wall: 'column', crown: 'glow', wallH: [3.2, 5.6],
    ground: [PAPER.coralD, PAPER.sand], groundAccent: PAPER.orange,
    path: PAPER.peach, pathRim: PAPER.coral,
    wallPlies: [PAPER.tealD, PAPER.inkTeal, PAPER.lavenderD],
    crownPapers: [PAPER.orange, PAPER.gold, PAPER.coral],
    liquid: { deep: PAPER.coralD, mid: PAPER.coral, shallow: PAPER.orange, edge: PAPER.gold, kind: 'lava' },
    detail: 'ember', special: PAPER.gold,
  },
  5: {
    key: 'frost', name: 'Frozen Peak', wall: 'slab', crown: 'spike', wallH: [3.0, 5.0],
    ground: [PAPER.white, PAPER.cream], groundAccent: PAPER.sky,
    path: PAPER.sky, pathRim: PAPER.white,
    wallPlies: [PAPER.white, PAPER.sky, PAPER.tealL],
    crownPapers: [PAPER.white, PAPER.tealL, PAPER.sky],
    liquid: { deep: PAPER.tealD, mid: PAPER.sky, shallow: PAPER.tealL, edge: PAPER.white, kind: 'water' },
    detail: 'crystal', special: PAPER.tealL,
  },
  6: {
    key: 'prism', name: 'Crystal Caverns', wall: 'crystal', crown: 'spike', wallH: [3.4, 6.0],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.lavender,
    path: PAPER.lavender, pathRim: PAPER.cream,
    wallPlies: [PAPER.lavender, PAPER.tealL, PAPER.lavenderD],
    crownPapers: [PAPER.rose, PAPER.tealL, PAPER.white],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.white, kind: 'water' },
    detail: 'crystal', special: PAPER.rose,
  },
  7: {
    key: 'market', name: 'Coinford Market', wall: 'stall', crown: 'lantern', wallH: [2.6, 3.8],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.peach,
    path: PAPER.peach, pathRim: PAPER.coral,
    wallPlies: [PAPER.coral, PAPER.gold, PAPER.cream],
    crownPapers: [PAPER.gold, PAPER.orange, PAPER.white],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'tuft', special: PAPER.gold,
  },
  8: {
    key: 'library', name: 'Infinity Library', wall: 'shelf', crown: 'none', wallH: [4.2, 7.0],
    ground: [PAPER.creamD, PAPER.sand], groundAccent: PAPER.lavender,
    path: PAPER.lavender, pathRim: PAPER.creamD,
    wallPlies: [PAPER.sand, PAPER.creamD, PAPER.cream],
    crownPapers: [PAPER.coral, PAPER.teal, PAPER.lavenderD],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'ink' },
    detail: 'page', special: PAPER.gold,
  },
  9: {
    key: 'mending', name: 'The Mending Room', wall: 'screen', crown: 'glyph', wallH: [3.8, 6.4],
    ground: [PAPER.cream, PAPER.creamD], groundAccent: PAPER.lavender,
    path: PAPER.white, pathRim: PAPER.lavender,
    wallPlies: [PAPER.cream, PAPER.white, PAPER.sand],
    crownPapers: [PAPER.gold, PAPER.lavender, PAPER.tealL],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.white, kind: 'void' },
    detail: 'page', special: PAPER.gold,
  },
};

export function themeForFloor(floorId) {
  return LEVEL_THEMES[floorId] || LEVEL_THEMES[1];
}

// ── Object taxonomy ────────────────────────────────────────────────────────
//
// levels.js has 26 object type strings; they collapse to 14 pieces of 3D
// furniture. The integrator keys gameplay off `object.type` (unchanged, the raw
// string) — `kind` exists only so this file knows which mesh to cut.

export const OBJECT_KIND = {
  fairy: 'challenge', valve: 'challenge', beacon: 'challenge', vent: 'challenge',
  crystal: 'challenge', geoshard: 'challenge', token: 'challenge', page: 'challenge',
  fragment: 'challenge', rune: 'challenge',
  chest: 'chest', gearkit: 'chest', golden: 'golden',
  gold: 'coin', potion: 'flask',
  fountain: 'fountain',
  mathdoor: 'gate', zerodoor: 'gate',
  statue: 'statue', plate: 'plate',
  seqmark: 'marker', lorepage: 'marker', donation: 'marker',
  hero: 'cage',
  encounter: 'trigger',
  boss: 'boss', exit: 'exit',
};

/** Trigger volume radius, metres. Generous — a 5-year-old should not have to
 *  aim, and the 2D game triggered on simple tile entry (a 4 m square). */
export const OBJECT_RADIUS = {
  challenge: 1.9, chest: 1.7, golden: 2.0, coin: 1.6, flask: 1.6,
  fountain: 2.6, gate: 2.2, statue: 1.7, plate: 1.7, marker: 1.7,
  cage: 2.0, trigger: 1.5, boss: 3.2, exit: 2.2,
};

/** Which floating shape a challenge pickup wears. One per floor in practice —
 *  the challenge type is a floor-level property — so a level pays exactly one
 *  extra draw call for it. */
export const CHALLENGE_SHAPE = {
  fairy: 'orb', valve: 'wheel', beacon: 'flame', vent: 'flame',
  crystal: 'shard', geoshard: 'shard', fragment: 'shard',
  token: 'coin', page: 'sheet', rune: 'sheet',
};

/** Kinds that physically bar the way until gameplay opens them. */
export const BLOCKING_KINDS = new Set(['gate', 'cage']);

// ── Reading the floor ──────────────────────────────────────────────────────

/**
 * The raw floor as characters, plus the two tile sets that change at runtime.
 * `transformTiles` / `secretTiles` are `ty * width + tx` keys.
 */
export function readLevel(floorId) {
  const def = LEVEL_DEFS[floorId] || LEVEL_DEFS[1];
  const rows = def.tiles;
  const height = rows.length;
  const width = rows[0].length;
  const code = new Array(height);
  for (let y = 0; y < height; y++) code[y] = [...rows[y]];

  const transformTiles = new Map();
  for (const [x, y, to] of (def.transform?.tiles ?? [])) {
    if (x >= 0 && x < width && y >= 0 && y < height) transformTiles.set(y * width + x, to);
  }
  const secretTiles = new Map();
  for (const [x, y, to] of (def.secret?.open ?? [])) {
    if (x >= 0 && x < width && y >= 0 && y < height) secretTiles.set(y * width + x, to);
  }

  return {
    id: def.id, width, height, code,
    startX: def.startX, startY: def.startY,
    objects: def.objects ?? [],
    objective: def.objective ?? [],
    transform: def.transform ?? null,
    secret: def.secret ?? null,
    transformTiles, secretTiles,
  };
}

/** Tile centre in world metres. The level is centred on the origin, so the
 *  integrator can drop the group at (0,0,0) and the hub camera rig — which
 *  assumes a world centred on the origin — keeps working unchanged. */
export function tileCenter(tx, ty, width, height) {
  return { x: (tx + 0.5 - width / 2) * TILE_M, z: (ty + 0.5 - height / 2) * TILE_M };
}

/** Inverse of tileCenter; floors to the containing tile. */
export function worldToTile(x, z, width, height) {
  return {
    tx: Math.floor(x / TILE_M + width / 2),
    ty: Math.floor(z / TILE_M + height / 2),
  };
}

// ── The distance field ─────────────────────────────────────────────────────

/**
 * Walk distance in tiles from the spawn, over every tile the player can ever
 * stand on (initially walkable OR opened by the floor's transform/secret).
 *
 * Two passes. The first is the real one and yields the field the terraces are
 * cut from. The second floods the leftovers — walls, sealed voids, genuinely
 * unreachable pockets — from the nearest reached tile, so a wall knows which
 * terrace it is standing on and does not sink through the ground beside it.
 *
 * Returns an Int32Array of length width*height. Never contains -1 on exit.
 */
export function distanceField(level) {
  const { width, height, code, startX, startY, transformTiles, secretTiles } = level;
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const open = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      open[k] = (isWalkableChar(code[y][x]) || transformTiles.has(k) || secretTiles.has(k)) ? 1 : 0;
    }
  }

  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const seed = startY * width + startX;
  if (open[seed]) { dist[seed] = 0; queue[tail++] = seed; }
  else {
    // A spawn that is not itself open would strand the whole field; seed every
    // open tile touching it instead. (No shipped floor does this — the guard is
    // here so a future hand-edit degrades instead of producing a flat level.)
    for (let i = 0; i < n; i++) if (open[i]) { dist[i] = 0; queue[tail++] = i; break; }
  }

  while (head < tail) {
    const k = queue[head++];
    const x = k % width, y = (k - x) / width;
    const d = dist[k] + 1;
    if (x > 0 && open[k - 1] && dist[k - 1] < 0) { dist[k - 1] = d; queue[tail++] = k - 1; }
    if (x < width - 1 && open[k + 1] && dist[k + 1] < 0) { dist[k + 1] = d; queue[tail++] = k + 1; }
    if (y > 0 && open[k - width] && dist[k - width] < 0) { dist[k - width] = d; queue[tail++] = k - width; }
    if (y < height - 1 && open[k + width] && dist[k + width] < 0) { dist[k + width] = d; queue[tail++] = k + width; }
  }

  // Pass 2 — fill everything else from the frontier we already have.
  const q2 = new Int32Array(n);
  let h2 = 0, t2 = 0;
  for (let i = 0; i < n; i++) if (dist[i] >= 0) q2[t2++] = i;
  while (h2 < t2) {
    const k = q2[h2++];
    const x = k % width, y = (k - x) / width;
    const d = dist[k] + 1;
    if (x > 0 && dist[k - 1] < 0) { dist[k - 1] = d; q2[t2++] = k - 1; }
    if (x < width - 1 && dist[k + 1] < 0) { dist[k + 1] = d; q2[t2++] = k + 1; }
    if (y > 0 && dist[k - width] < 0) { dist[k - width] = d; q2[t2++] = k - width; }
    if (y < height - 1 && dist[k + width] < 0) { dist[k + width] = d; q2[t2++] = k + width; }
  }
  for (let i = 0; i < n; i++) if (dist[i] < 0) dist[i] = 0;
  return dist;
}

/**
 * Band curve: flat for the first RAMP_IN of a band, then a smooth ramp up to
 * the next. Terraces with real ramps, from one expression.
 */
export function terraceCurve(u) {
  const capped = Math.min(u, TERRACE_MAX);
  const k = Math.floor(capped);
  const f = capped - k;
  return k + smoothstep(RAMP_IN, RAMP_OUT, f);
}

// ── The height field ───────────────────────────────────────────────────────

/**
 * Per-tile ground height, then the lattice of corner heights the renderer and
 * the sampler both read.
 *
 * @returns {{tileH:Float32Array, cornerH:Float32Array, cw:number, ch:number,
 *            maxH:number, minH:number}}
 */
export function heightField(level, dist) {
  const { width, height, code, objects, transformTiles } = level;
  const n = width * height;
  const tileH = new Float32Array(n);
  const seed = level.id * 7919;

  // Boss dais — a local rise so the last room reads as a destination from
  // across the floor. Smooth and shallow (2.6 m over 18 m) so it is scenery,
  // never an obstacle.
  const boss = objects.find((o) => o.type === 'boss');
  const bx = boss ? boss.x : -999, by = boss ? boss.y : -999;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      let h = BASE_Y + TERRACE_RISE * terraceCurve(dist[k] / TERRACE_STRIDE);
      // Shelf relief: two octaves of very low frequency noise, well under the
      // controller's 0.5 m step-up so it can never become a ledge.
      h += (valueNoise(x, y, 5.5, seed) - 0.5) * SHELF_AMP * 2
         + (valueNoise(x, y, 2.3, seed + 17) - 0.5) * SHELF_AMP * 0.6;
      if (boss) {
        const d = Math.hypot(x - bx, y - by) / BOSS_RADIUS_TILES;
        if (d < 1) h += BOSS_RISE * (1 - smoothstep(0, 1, d));
      }
      // Liquid basins sink. Transform tiles keep their WALKABLE height — the
      // ground under a future bridge is already built; only the liquid on top
      // of it drains away — which is exactly why the transform needs no
      // re-terracing and no collider rebuild.
      if (code[y][x] === 'Q' && !transformTiles.has(k)) h -= LIQUID_DROP;
      tileH[k] = h;
    }
  }

  // Corner lattice: mean of the touching tiles. This is what makes ramps and
  // shorelines happen without authoring either.
  const cw = width + 1, ch = height + 1;
  const cornerH = new Float32Array(cw * ch);
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      let sum = 0, cnt = 0;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          const tx = i + dx, ty = j + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          sum += tileH[ty * width + tx]; cnt++;
        }
      }
      const v = cnt ? sum / cnt : BASE_Y;
      cornerH[j * cw + i] = v;
      if (v < minH) minH = v;
      if (v > maxH) maxH = v;
    }
  }
  return { tileH, cornerH, cw, ch, maxH, minH };
}

/**
 * Bilinear sampler over the corner lattice, plus its central-difference
 * normal. Both are allocation-free and match the shape createCollisionWorld /
 * createController expect from the hub heightfield.
 */
export function makeHeightSampler(hf, width, height) {
  const { cornerH, cw, ch } = hf;
  function sampleHeight(x, z) {
    let u = x / TILE_M + width / 2;
    let v = z / TILE_M + height / 2;
    if (u < 0) u = 0; else if (u > width) u = width;
    if (v < 0) v = 0; else if (v > height) v = height;
    const i0 = Math.min(cw - 2, Math.floor(u));
    const j0 = Math.min(ch - 2, Math.floor(v));
    const fx = u - i0, fy = v - j0;
    const a = cornerH[j0 * cw + i0], b = cornerH[j0 * cw + i0 + 1];
    const c = cornerH[(j0 + 1) * cw + i0], d = cornerH[(j0 + 1) * cw + i0 + 1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  const out = [0, 1, 0];
  function sampleNormal(x, z) {
    const e = TILE_M * 0.5;
    const hx = sampleHeight(x + e, z) - sampleHeight(x - e, z);
    const hz = sampleHeight(x, z + e) - sampleHeight(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
    return out;
  }
  return { sampleHeight, sampleNormal };
}

// ── Boundary culling ───────────────────────────────────────────────────────

/** True if any 8-neighbour of (x,y) is a tile the player can ever stand on. */
export function facesOpenSpace(level, x, y) {
  const { width, height, code, transformTiles, secretTiles } = level;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = ny * width + nx;
      if (isWalkableChar(code[ny][nx]) || transformTiles.has(k) || secretTiles.has(k)) return true;
    }
  }
  return false;
}

/**
 * Every wall tile worth cutting geometry for, with its deterministic dressing.
 * `transient` marks tiles the floor's transform or secret opens later, so the
 * renderer can retract exactly those instances.
 */
export function wallTiles(level, hf) {
  const { width, height, code, transformTiles, secretTiles } = level;
  const theme = themeForFloor(level.id);
  const [hMin, hMax] = theme.wallH;
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (code[y][x] !== 'W') continue;
      const k = y * width + x;
      if (!facesOpenSpace(level, x, y)) continue;
      const r0 = hash2(x, y, level.id);
      const r1 = hash2(x, y, level.id + 101);
      const r2 = hash2(x, y, level.id + 202);
      const c = tileCenter(x, y, width, height);
      out.push({
        key: k, tx: x, ty: y, x: c.x, z: c.z,
        y: hf.tileH[k],
        // A wall run must never read as one extruded ribbon: height, yaw and
        // in-tile offset all vary, and the noise term makes neighbours agree
        // in bands so a hedgerow still looks grown rather than shuffled.
        h: hMin + (hMax - hMin) * (0.35 * r0 + 0.65 * valueNoise(x, y, 3.1, level.id)),
        variant: (r1 * 3) | 0,
        yaw: Math.floor(r2 * 4) * (TAU / 4) + (r0 - 0.5) * 0.22,
        ox: (r1 - 0.5) * TILE_M * 0.20,
        oz: (r2 - 0.5) * TILE_M * 0.20,
        sx: 0.90 + r0 * 0.24,
        tint: r2,
        transient: transformTiles.has(k) ? 'transform' : (secretTiles.has(k) ? 'secret' : null),
      });
    }
  }
  return out;
}

/** Liquid tiles worth surfacing: the whole Q region is kept for the sheet, but
 *  only boundary tiles get a collider (see the file header). */
export function liquidTiles(level) {
  const { width, height, code, transformTiles } = level;
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (code[y][x] !== 'Q') continue;
      const k = y * width + x;
      out.push({
        key: k, tx: x, ty: y,
        boundary: facesOpenSpace(level, x, y),
        transient: transformTiles.has(k) ? 'transform' : null,
      });
    }
  }
  return out;
}

/** Walkable tiles, tagged with which ground treatment they wear. */
export function groundTiles(level) {
  const { width, height, code, transformTiles, secretTiles } = level;
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = code[y][x];
      const k = y * width + x;
      const transient = transformTiles.has(k) ? 'transform' : (secretTiles.has(k) ? 'secret' : null);
      if (!isWalkableChar(ch) && !transient) continue;
      const target = transient ? (transient === 'transform' ? transformTiles.get(k) : secretTiles.get(k)) : ch;
      out.push({ key: k, tx: x, ty: y, ch: target, transient });
    }
  }
  return out;
}

// ── Colliders ──────────────────────────────────────────────────────────────

/**
 * Circle colliders in exactly the shape collision.js `addCollider` takes, with
 * a `tag` the integrator can ignore and this module uses to retract the right
 * set when a transform / secret / gate fires.
 */
export function levelColliders(level) {
  const { width, height, code, transformTiles, secretTiles } = level;
  const prefix = `lvl${level.id}`;
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = code[y][x];
      if (ch !== 'W' && ch !== 'Q') continue;
      if (!facesOpenSpace(level, x, y)) continue;
      const k = y * width + x;
      const c = tileCenter(x, y, width, height);
      const tag = transformTiles.has(k) ? 'transform' : (secretTiles.has(k) ? 'secret' : null);
      out.push({
        id: `${prefix}-${ch === 'W' ? 'wall' : 'liq'}-${x}-${y}`,
        kind: 'circle', x: c.x, z: c.z,
        r: ch === 'W' ? WALL_COLLIDER_R : LIQUID_COLLIDER_R,
        tag,
      });
    }
  }
  // Gates and cages bar the way as gameplay, not as architecture.
  for (const o of level.objects) {
    const kind = OBJECT_KIND[o.type];
    if (!BLOCKING_KINDS.has(kind)) continue;
    const c = tileCenter(o.x, o.y, width, height);
    out.push({
      id: `${prefix}-${kind}-${o.id ?? `${o.x}-${o.y}`}`,
      kind: 'circle', x: c.x, z: c.z, r: GATE_COLLIDER_R,
      tag: kind === 'gate' ? `gate:${o.id ?? `${o.x}-${o.y}`}` : `cage:${o.x}-${o.y}`,
    });
  }
  return out;
}

// ── Objects ────────────────────────────────────────────────────────────────

/**
 * Every entry in the floor's `objects` array (plus its secret's rewards) as a
 * placement record: world position, trigger radius, and the ORIGINAL data
 * object untouched, so the integrator fires the existing gameplay logic with
 * the fields it already reads.
 */
export function objectSpecs(level, sampleHeight) {
  const { width, height } = level;
  const prefix = `lvl${level.id}`;
  const seen = new Map();
  const out = [];

  const push = (o, hidden) => {
    const kind = OBJECT_KIND[o.type] || 'marker';
    const c = tileCenter(o.x, o.y, width, height);
    const base = `${prefix}-${o.type}-${o.x}-${o.y}`;
    const dup = seen.get(base) || 0;
    seen.set(base, dup + 1);
    out.push({
      id: dup ? `${base}#${dup}` : base,
      type: o.type,
      kind,
      tile: { x: o.x, y: o.y },
      x: c.x, z: c.z,
      y: sampleHeight(c.x, c.z),
      radius: OBJECT_RADIUS[kind] ?? 1.7,
      hidden: !!hidden,
      shape: kind === 'challenge' ? (CHALLENGE_SHAPE[o.type] || 'orb') : null,
      data: o,
    });
  };

  for (const o of level.objects) push(o, false);
  for (const r of (level.secret?.rewards ?? [])) push(r, true);
  return out;
}

/**
 * The hero's entry point: the spawn tile's centre, lifted onto the ground.
 * `yaw` faces the level's interior so the opening shot is never a wall.
 */
export function levelSpawn(level, sampleHeight) {
  const { width, height, startX, startY } = level;
  const c = tileCenter(startX, startY, width, height);
  const toCentre = Math.atan2(-c.z, -c.x);
  return { x: c.x, y: sampleHeight(c.x, c.z), z: c.z, yaw: toCentre };
}

/** World-space bounds of the whole floor, for camera clamping and framing. */
export function levelBounds(level) {
  const w = level.width * TILE_M, h = level.height * TILE_M;
  return { minX: -w / 2, maxX: w / 2, minZ: -h / 2, maxZ: h / 2, width: w, depth: h };
}

/**
 * One place that answers "is this floor still finishable in 3D?" — used by the
 * tests to prove the terracing cannot have severed a route. Returns the worst
 * height step between any two orthogonally adjacent open tiles.
 */
export function maxAdjacentStep(level, hf) {
  const { width, height, code, transformTiles, secretTiles } = level;
  const openAt = (x, y) => {
    const k = y * width + x;
    return isWalkableChar(code[y][x]) || transformTiles.has(k) || secretTiles.has(k);
  };
  let worst = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!openAt(x, y)) continue;
      const h0 = hf.tileH[y * width + x];
      if (x + 1 < width && openAt(x + 1, y)) worst = Math.max(worst, Math.abs(hf.tileH[y * width + x + 1] - h0));
      if (y + 1 < height && openAt(x, y + 1)) worst = Math.max(worst, Math.abs(hf.tileH[(y + 1) * width + x] - h0));
    }
  }
  return worst;
}

/** Slope in degrees implied by a height step across one tile. */
export function stepDegrees(step) {
  return Math.atan2(step, TILE_M) * 180 / Math.PI;
}
