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
/**
 * Amplitude of the low-frequency shelf noise that keeps terraces from reading
 * as poured concrete.
 *
 * Was 0.34, which put a 0.68 m swell across a 22 m wavelength — under this
 * fog, at this exposure, on a surface whose colour field already varies more
 * than that, it was below the perceptual floor and every floor read as a
 * plane between terrace steps. 0.45 takes the long octave to a 0.9 m swing.
 *
 * It stays SAFE by construction, and not because 0.45 is under stepUp: this is
 * a continuous surface, so what the controller sees is a GRADIENT, not a step.
 * The long octave's wavelength is 5.5 tiles (22 m), so 0.9 m of relief arrives
 * over 11 m — under five degrees. Nothing here can become a ledge.
 */
export const SHELF_AMP = 0.45;

/**
 * The ENTRANCE TERRACE: how far the spawn is lifted above the band-0 field it
 * sits in, and how many tiles that lift takes to fall away.
 *
 * Height is a function of walk distance from the spawn, so the spawn is band 0
 * — the bottom — and the first ~28 m of every floor was a literal plane. That
 * plane is the establishing shot, the frame the player judges the level by, and
 * it was guaranteed to be the flattest one in the build. Lifting the entrance
 * one band inverts the opening beat: you arrive on a step, look DOWN across a
 * 2.2 m drop into the first court, and the floor climbs away from there to the
 * boss. Two depth planes in the first frame, for one term in the height field.
 *
 * The fall-off is 2.2 m over 4.5 tiles = 0.49 m/tile = 7 degrees, which
 * composes with a terrace step in the worst case to about 35 degrees — inside
 * the controller's 50 degree limit and inside the test's 45.
 */
export const ENTRY_RISE = 2.6;
export const ENTRY_FALL_TILES = 4.5;

/**
 * How far a paver ribbon rides proud of the ground it crosses.
 *
 * This is folded into the HEIGHT FIELD ITSELF rather than added when the
 * surface is cut, and that is the whole point: the old build lifted the path
 * quad at render time only, so the drawn path sat 0.16 m above a collision
 * field that knew nothing about it, and the 0.16 m of air under the ribbon had
 * to be plugged by a separate riser. Baking the lift into `tileH` means the
 * corner lattice carries it, which means the sampler, the wall footings and
 * the drawn triangles all read the SAME number — and there is no gap left to
 * plug, so there is no riser, so there is nothing to get wrong.
 */
export const PATH_LIFT = 0.26;

/** Sub-quads per tile edge in the merged ground lattice. 4 puts a vertex every
 *  metre, which is what buys a path edge that can wander off the tile grid and
 *  colour that varies within a tile instead of per tile. */
export const GROUND_SUB = 4;

/** How far the ground's outer edge is buried where it meets a wall footing or
 *  a basin, and the height of the bright deckle band at the very top of that
 *  drop — the visible thickness of the sheet the floor is cut from. */
export const SKIRT_DEPTH = 2.8;
export const SKIRT_LIP = 0.24;

/**
 * Tiles of ground carried BEYOND the map footprint, as a shoulder.
 *
 * The floors are bordered by a single ring of wall, and three of the nine
 * vocabularies are thin — a bookcase is 2 m deep in a 4 m tile. Ground that
 * stops at the footprint therefore stops at a wall you can see over: from a
 * camera 6 m up, the sightline across a 2.9 m boundary shelf comes down about
 * 7.5 m past it, and everything it crosses on the way is nothing. That
 * rendered as a long, perfectly flat pale streak down the left of the Library
 * — and a region of EXACTLY constant colour is the giveaway, because no lit,
 * fogged, textured surface in this world is ever constant. It was the clear
 * colour: a hole straight out of the world.
 *
 * Two tiles of shoulder puts ground under that sightline, and it falls away
 * quadratically so the level still reads as an object with an edge rather than
 * as an endless plane.
 */
export const GROUND_MARGIN = 2;
/** Metres the shoulder drops per tile beyond the footprint, squared. */
export const MARGIN_FALL = 0.7;

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

/**
 * The ground treatment a tile ends up wearing, or null if it is never ground.
 *
 * A transform / secret tile is already the thing it will BECOME as far as the
 * ground is concerned — the drained boulevard's paving is cut at build time
 * and only revealed later — so the effective char is the transform target, not
 * the sealed 'W' or flooded 'Q' the tile currently reads as. Every consumer of
 * ground treatment (height, colour, path field, scatter) goes through here so
 * they cannot disagree about which tiles are paths.
 */
export function groundCharAt(level, x, y) {
  const k = y * level.width + x;
  if (level.transformTiles.has(k)) return level.transformTiles.get(k);
  if (level.secretTiles.has(k)) return level.secretTiles.get(k);
  const ch = level.code[y][x];
  return isWalkableChar(ch) ? ch : null;
}

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
// Every colour is a PAPER int. `wall` names the vocabulary below; `crown`
// documents what grows out of its top (the vocabulary builds it inline now —
// a crown that is a separate mesh can never respond to the ply it grew from).
// Liquid palettes mirror
// water.js's OCEAN_PLIES shape (deep/mid/shallow/edge) so a floor's pond is cut
// from the same stock as the hub's sea, just re-dyed.

/** @typedef {{key:string,name:string,wall:string,crown:string,wallH:[number,number],
 *   ground:[number,number],groundAccent:number,path:number,pathRim:number,
 *   wallPlies:[number,number,number],wallStack:[number,number,number],wallTop:number,
 *   landmark:string,mast:string,crownPapers:number[],
 *   liquid:{deep:number,mid:number,shallow:number,edge:number,kind:string},
 *   detail:string,special:number,vergeBias:number,groundAccentMix?:number}} LevelTheme
 *
 * `wallPlies` is the legacy triple the props (gates, statues, daises) key off
 * and is deliberately left alone. `wallStack` is the wall vocabulary's own
 * ordered [darkest, mid, lightest] triple — the layer builders below index it
 * by role, so a theme whose plies happen to be listed light-first does not come
 * out inside-out.
 *
 * ── WHY THE STACKS WERE RE-AUTHORED ────────────────────────────────────────
 * Every stack used to be one FAMILY of paper. Floor 1 was
 * [forestD 64, forest 86, forestL 109] — a 1.7x luma range, all of it dark,
 * covering 60% of the frame; floor 8 was [sand 207, creamD 224, cream 238], a
 * 1.15x range, which is why the Library's shelves measured as grey mush; floor
 * 4's Ember Caves had three DARK TEALS and not one ember in them. A wall whose
 * darkest and lightest ply are the same value is one flat shape, and one flat
 * shape is a box no matter how many plies you cut it from.
 *
 * So every stack now CROSSES families and reaches a genuinely light crown, and
 * `wallTop` — a new, still lighter paper — is reserved for the sunlit cut edge
 * at the very top of the silhouette. Floor 1 runs forestD -> leaf -> sage: a
 * crown:base ratio of 2.9x, against Odyssey's Steam Gardens hedge at roughly
 * 2x. That ratio, not the ply count, is what makes a hedge read as a volume.
 *
 * `vergeBias` is how strongly the ground scatter thickens along the shoulder of
 * a paver ribbon. Positive grows a verge (a real path has one); NEGATIVE clears
 * a band either side of the ribbon, which is what the Ember Caves needed — its
 * scatter was marching right up to the path in a uniform lattice. */

/** @type {Record<number, LevelTheme>} */
export const LEVEL_THEMES = {
  1: {
    key: 'garden', name: 'The Garden', wall: 'hedge', crown: 'flower', wallH: [2.25, 2.72],
    ground: [PAPER.leaf, PAPER.sage], groundAccent: PAPER.forestL,
    path: PAPER.sand, pathRim: PAPER.creamD,
    wallPlies: [PAPER.forest, PAPER.forestL, PAPER.forestD],
    wallStack: [PAPER.forestD, PAPER.forestL, PAPER.leaf],
    wallTop: PAPER.sage,
    landmark: 'topiary', mast: 'tree',
    crownPapers: [PAPER.rose, PAPER.white, PAPER.gold],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'tuft', special: PAPER.rose, vergeBias: 0.24,
  },
  2: {
    key: 'ebbport', name: 'Ebbport', wall: 'masonry', crown: 'moss', wallH: [2.20, 2.78],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.sageD,
    path: PAPER.creamD, pathRim: PAPER.sand,
    wallPlies: [PAPER.creamD, PAPER.cream, PAPER.sand],
    // Wet sunken stone at the footing, sun-bleached masonry at the head: 2.5x,
    // where the single cream family this used to be managed 1.15x.
    wallStack: [PAPER.tealD, PAPER.sand, PAPER.cream],
    wallTop: PAPER.white,
    landmark: 'lighthouse', mast: 'shipmast',
    crownPapers: [PAPER.sageD, PAPER.leaf, PAPER.tealL],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'shell', special: PAPER.tealL, vergeBias: 0.20,
  },
  3: {
    key: 'sky', name: 'The Shattered Sky', wall: 'cloudbank', crown: 'puff', wallH: [2.30, 2.85],
    ground: [PAPER.creamD, PAPER.sand], groundAccent: PAPER.sky,
    path: PAPER.white, pathRim: PAPER.sky,
    wallPlies: [PAPER.white, PAPER.cream, PAPER.sky],
    wallStack: [PAPER.lavender, PAPER.sky, PAPER.cream],
    wallTop: PAPER.white,
    landmark: 'tether', mast: 'shard',
    crownPapers: [PAPER.white, PAPER.sky, PAPER.lavender],
    liquid: { deep: PAPER.sky, mid: PAPER.tealL, shallow: PAPER.cream, edge: PAPER.white, kind: 'cloud' },
    detail: 'crystal', special: PAPER.gold, vergeBias: 0.18, groundAccentMix: 0.20,
  },
  4: {
    key: 'ember', name: 'Ember Caves', wall: 'column', crown: 'glow', wallH: [2.35, 2.88],
    ground: [PAPER.coralD, PAPER.sand], groundAccent: PAPER.orange,
    path: PAPER.peach, pathRim: PAPER.coral,
    wallPlies: [PAPER.tealD, PAPER.inkTeal, PAPER.lavenderD],
    // The Ember Caves' walls had no ember in them — three dark teals sitting at
    // chroma 22 against a ground at 97. Basalt still starts at inkTeal, but it
    // is lit from the vents by the time it reaches the fracture faces.
    // BASALT, NOT TEAL. The critic counted "a picket fence of ~40 identical
    // teal cuboids" walling the Ember Caves, and the footing ply — the widest
    // piece in the vocabulary — was the reason: PAPER.tealD is a saturated
    // blue-green and it was the biggest shape in every wall tile of a lava
    // cavern. There is no dark warm stone in PAPER, so the base ply is now a
    // lerp of the two papers the floor already owns: the palette's darkest
    // (inkTeal) walked most of the way to its lava (coralD). Still two PAPER
    // constants, still inside the hull, and it reads as cooled basalt.
    wallStack: [mixPaper(PAPER.inkTeal, PAPER.coralD, 0.55), PAPER.coralD, PAPER.coral],
    wallTop: PAPER.gold,
    landmark: 'chimney', mast: 'vent',
    crownPapers: [PAPER.orange, PAPER.gold, PAPER.coral],
    liquid: { deep: PAPER.coralD, mid: PAPER.coral, shallow: PAPER.orange, edge: PAPER.gold, kind: 'lava' },
    // NEGATIVE: the cone field was marching straight up to the paver ribbon in
    // a visible lattice. Clearing ~1.5 m either side gives the path an edge.
    detail: 'ember', special: PAPER.gold, vergeBias: -0.55,
    // ── THE CALDERA ──────────────────────────────────────────────────────
    // "'Ember Caves' is an open red plain under a clear blue sky." It was: the
    // 6 m boundary ring left the horizon wide open, the theme's own atmosphere
    // was the only thing saying "cave", and the sky above it was the island's
    // noon sky. Three numbers turn a plain into a caldera and all three have to
    // agree, which is why they live together here:
    //   ringH      the rim, at 9-13 m, closes the horizon from any standing eye
    //   landmarkH  the vent chimney has to beat the rim by 2x or it joins it
    //   sky        the lid: see LEVEL_SKY in timeOfDay.js
    ringH: [9.2, 13.0],
    landmarkH: [26.5, 31.0],
    sky: 'ember',
    // The paper the vent glow is cut from. Opts the floor into `ventSpots`,
    // the additive glow cards, and the ember thickets that grow around them.
    glow: PAPER.orange,
  },
  5: {
    key: 'frost', name: 'Frozen Peak', wall: 'slab', crown: 'spike', wallH: [2.25, 2.80],
    ground: [PAPER.white, PAPER.cream], groundAccent: PAPER.sky,
    path: PAPER.sky, pathRim: PAPER.white,
    wallPlies: [PAPER.white, PAPER.sky, PAPER.tealL],
    wallStack: [PAPER.tealD, PAPER.tealL, PAPER.cream],
    wallTop: PAPER.white,
    landmark: 'obelisk', mast: 'shard',
    crownPapers: [PAPER.white, PAPER.tealL, PAPER.sky],
    liquid: { deep: PAPER.tealD, mid: PAPER.sky, shallow: PAPER.tealL, edge: PAPER.white, kind: 'water' },
    detail: 'crystal', special: PAPER.tealL, vergeBias: 0.16, groundAccentMix: 0.22,
  },
  6: {
    key: 'prism', name: 'Crystal Caverns', wall: 'crystal', crown: 'spike', wallH: [2.30, 2.86],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.lavender,
    path: PAPER.lavender, pathRim: PAPER.cream,
    wallPlies: [PAPER.lavender, PAPER.tealL, PAPER.lavenderD],
    wallStack: [PAPER.lavenderD, PAPER.lavender, PAPER.tealL],
    wallTop: PAPER.white,
    landmark: 'cluster', mast: 'shard',
    // Underground, and COLD — the counterweight to the Ember Caves' hot lid,
    // so the two caverns cannot be mistaken for each other. See LEVEL_SKY.
    sky: 'prism',
    crownPapers: [PAPER.rose, PAPER.tealL, PAPER.white],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.white, kind: 'water' },
    detail: 'crystal', special: PAPER.rose, vergeBias: -0.40,
  },
  7: {
    key: 'market', name: 'Coinford Market', wall: 'stall', crown: 'lantern', wallH: [2.20, 2.64],
    ground: [PAPER.sand, PAPER.creamD], groundAccent: PAPER.peach,
    path: PAPER.peach, pathRim: PAPER.coral,
    wallPlies: [PAPER.coral, PAPER.gold, PAPER.cream],
    wallStack: [PAPER.coralD, PAPER.coral, PAPER.cream],
    wallTop: PAPER.white,
    landmark: 'belltower', mast: 'banner',
    crownPapers: [PAPER.gold, PAPER.orange, PAPER.white],
    liquid: { deep: PAPER.tealD, mid: PAPER.teal, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'water' },
    detail: 'tuft', special: PAPER.gold, vergeBias: 0.24,
  },
  8: {
    key: 'library', name: 'Infinity Library', wall: 'shelf', crown: 'books', wallH: [2.45, 2.90],
    ground: [PAPER.creamD, PAPER.sand], groundAccent: PAPER.lavender,
    path: PAPER.lavender, pathRim: PAPER.creamD,
    wallPlies: [PAPER.sand, PAPER.creamD, PAPER.cream],
    // Wooden cases, not the cream the walls, the ground and the sky all shared.
    // The Library measured chroma 2 — literal greyscale — because every surface
    // in it was cut from the same three near-whites.
    wallStack: [PAPER.coralD, PAPER.orange, PAPER.peach],
    wallTop: PAPER.cream,
    landmark: 'stack', mast: 'pylon',
    // "The only shot with a designed sightline, thrown away by fog and an OPEN
    // SKY over a library." An interior gets a lamplit vault. See LEVEL_SKY.
    sky: 'library',
    crownPapers: [PAPER.coral, PAPER.teal, PAPER.lavenderD],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.cream, kind: 'ink' },
    detail: 'page', special: PAPER.gold, vergeBias: 0.20, groundAccentMix: 0.26,
  },
  9: {
    key: 'mending', name: 'The Mending Room', wall: 'screen', crown: 'glyph', wallH: [2.35, 2.82],
    ground: [PAPER.cream, PAPER.creamD], groundAccent: PAPER.lavender,
    path: PAPER.white, pathRim: PAPER.lavender,
    wallPlies: [PAPER.cream, PAPER.white, PAPER.sand],
    wallStack: [PAPER.lavender, PAPER.creamD, PAPER.white],
    wallTop: PAPER.white,
    landmark: 'spire', mast: 'pylon',
    sky: 'mending',
    crownPapers: [PAPER.gold, PAPER.lavender, PAPER.tealL],
    liquid: { deep: PAPER.lavenderD, mid: PAPER.lavender, shallow: PAPER.tealL, edge: PAPER.white, kind: 'void' },
    detail: 'page', special: PAPER.gold, vergeBias: 0.18, groundAccentMix: 0.22,
  },
};

export function themeForFloor(floorId) {
  return LEVEL_THEMES[floorId] || LEVEL_THEMES[1];
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WALL VOCABULARY
//
// A wall tile is NOT an extruded cuboid. It is a small stack of cut-paper
// plies — each one a slightly different size, hue and yaw from the one under
// it — separated by thin slivers of the layer's own colour dragged toward
// PAPER.shadow, which is the teal drop-shadow the 2D game puts between every
// pair of layers. On top of the stack sits a CROWN whose whole job is to break
// the skyline: lobes, merlons, spikes, book spines. Nothing in a run may share
// a top edge with its neighbour.
//
// Everything here is pure data. A "piece" is a box or an n-gon prism in tile
// LOCAL metres (x right, z forward, y above the tile's ground), with an sRGB
// PAPER int and a tone multiplier. level3d.js turns the list into triangles;
// this file never touches three, so the vocabulary stays unit-testable and
// byte-deterministic.
// ═══════════════════════════════════════════════════════════════════════════

/** Footprint of a full-tile ply, metres. Just under TILE_M so the shadow
 *  sliver — which is wider — is the thing that actually meets the neighbour. */
export const WALL_SPAN = 3.92;

/** Half-thickness of a shadow sliver, metres. Two of these (0.14 m) is about a
 *  fingerwidth at hero scale: legible as a cut edge, never as a gap. */
export const PLY_GAP = 0.07;

/**
 * How far a sliver's colour is dragged toward PAPER.shadow.
 *
 * Was 0.34, and that was the darkest thing in the frame. On an already-dark
 * ply like forestD, a 0.34 pull toward shadow teal lands on #0e3423 — L=25,
 * 10% luma — and then the toon ramp's shade texel multiplies it again. The
 * result was not a cut edge, it was a black slot, and a stack of horizontal
 * black slots at a constant altitude is precisely what made the hedges read as
 * stacked crates. 0.15 still reads as a shadowed layer edge from a metre away
 * and never reads as ink. (The albedo is additionally clamped to PAPER.shadow
 * at stamp time in level3d.js, so this cannot go dark again by accident.)
 */
export const PLY_SHADOW_MIX = 0.15;

/** Metres the seam altitude is jittered per tile, and the fraction of tiles
 *  that get NO seam at all. A seam emitted at the same fraction of h on every
 *  tile re-imposes the exact grid the per-tile yaw and height exist to hide —
 *  it drew one perfectly horizontal line straight down a run of forty tiles. */
export const SEAM_JITTER = 0.25;
export const SEAM_SKIP = 0.32;

/** The band a wall run must live in. The hero is 1.72 m: 2.15 m already hides
 *  their head, 2.9 m is still low enough that one terrace step (2.2 m) puts a
 *  player's eyeline over the crown. Everything the builders do — undulation,
 *  crowns, corner posts — happens inside this band.
 *
 * PLANTER_H and RING_H are the two deliberate exits from it: a planter is a
 * run tile dropped below hero eyeline so the wall has holes you can see over,
 * and the boundary ring is raised so the level reads as an enclosure with a top
 * edge instead of a lawn with furniture on it. */
export const WALL_H_MIN = 2.15;
export const WALL_H_MAX = 2.90;
/** After the per-tile height multiplier, the hard stops a run may reach. The
 *  low one stays clear of the 1.72 m hero's eyeline — a wall you can see over
 *  by accident is a wall that stopped being a wall — and the high one keeps a
 *  terrace step (2.2 m) meaningful against it.
 *
 *  The band was [1.95, 3.35], a 1.72x window that the ±19% per-tile multiplier
 *  could not fill: measured across the tower, wall heights spanned 1.50x and
 *  their standard deviation was 11% of the mean. A run whose tiles agree to
 *  within a tenth is one extruded box with texture on it. [1.78, 3.62] is a
 *  2.03x window and the multiplier below is now ±35%, which realises it. */
export const WALL_H_SHORT = 1.78;
export const WALL_H_TALL = 3.62;
export const PLANTER_H = [1.05, 1.42];
export const RING_H = [4.8, 6.4];
/** How far a boundary-ring tile's footing is buried. Sized to clear
 *  LIQUID_DROP (2.4 m) plus a full swing of shelf relief, so the ring meets
 *  water, ground or void without ever showing daylight under itself. */
export const RING_FOOT = 5.0;

/**
 * THE ANTI-GRID BUDGET, in one place, because the last pass set every one of
 * these numbers too low to see and the build still claimed to have "anti-grid
 * jitter".
 *
 * Measured on the build this replaces, across all nine floors:
 *   yaw       ±0.42 rad free-standing, ±0.11 rad on the fronted vocabularies
 *   height    σ = 11% of the mean; max/min = 1.50x
 *   offset    ±0.16 m on a 4 m tile — 4% — so neighbours met FLUSH
 *   colour    7 to 10 distinct hexes on a whole floor: every tile the same ink
 *
 * The offset is the one that mattered most and was smallest. It is now split
 * into two axes that are not interchangeable: ALONG the run a tile may slide a
 * sixth of a tile, which opens and closes the joins so a run reads as a
 * sequence of pieces; ACROSS it — the direction the corridor is in — it may
 * lean about half as far, and pays for the lean out of its own footprint via
 * WALL_REACH_MAX. Measured after: ±0.63 to ±0.77 m, i.e. 16-19% of a tile.
 *
 * ALL FOUR ARE FREE TO BE THIS LARGE BECAUSE THE COLLIDER DID NOT MOVE. The
 * reach clamp below is what buys that: yaw, slide and footprint are solved
 * together per tile so the union of them lands on one constant, which means
 * every number here can be chosen for how it LOOKS.
 */
export const WALL_YAW_JIT = 0.52;        // rad, free-standing vocabularies
export const WALL_YAW_JIT_FRONT = 0.24;  // rad, the ones with a display face
export const WALL_YAW_JIT_RING = 0.05;   // rad, the airtight perimeter
export const WALL_H_JIT = 0.35;          // ±fraction of the banded height
export const WALL_SLIDE_ALONG = 0.62;    // m, ±, parallel to the run
export const WALL_SLIDE_ACROSS = 0.28;   // m, ±, into the corridor
export const WALL_SLIDE_FREE = 0.55;     // m, ±, on bends / junctions / ends
/**
 * How far any wall geometry may reach from its tile centre, metres.
 *
 * This is the number that lets the slide be large. A tile's swept half-diagonal
 * plus whatever it slid TOWARD the corridor is checked against this and the
 * tile is shrunk until it fits, so the offsets above can be authored for how
 * they LOOK and the thing the hero can bump into is a constant. 2.36 m is what
 * the build this replaces already reached at its own worst case, against a
 * WALL_COLLIDER_R of 2.3 — so nothing here makes contact worse than it was, and
 * a heavily-offset tile simply comes out as a smaller piece pushed out of line,
 * which is what a hand-built run looks like anyway.
 */
export const WALL_REACH_MAX = 2.36;
/** How far a tile's papers are walked toward one of the floor's accent papers,
 *  and how far its value is pushed. Both per tile, both seeded. */
export const WALL_HUE_JIT = 0.16;
export const WALL_VAL_JIT = 0.11;
/**
 * Fraction of interior run tiles that lose their seam-filling footing ply and
 * shrink, so the run visibly SEPARATES instead of welding into one mass.
 *
 * The footing is the widest, flushest thing in every vocabulary — a full-span
 * sheet at ground level whose only job is to hide the join. Hiding the join on
 * every single tile is what turns forty crafted pieces into one extruded box,
 * so roughly every third tile now does without it and stands 16% narrower.
 */
export const WALL_GAP_RATE = 0.34;
export const WALL_GAP_SHRINK = 0.84;

/** N, E, S, W in tile steps; bit i of a wall mask is direction i. */
export const WALL_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** sRGB 8-bit blend of two PAPER ints. Pure integer maths so the vocabulary
 *  can be diffed in a test without a colour library. */
export function mixPaper(a, b, t) {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return ((r & 255) << 16) | ((g & 255) << 8) | (bl & 255);
}

/** A deterministic stream of [0,1) for one tile. Same tile, same sequence,
 *  every load — which is what lets the screenshot harness diff frames. */
export function tileRandom(tx, ty, seed = 0) {
  let i = 0;
  return () => hash2(tx, ty, (seed | 0) + Math.imul(i++, 7919));
}

/** Which of the four neighbours continue this wall run. Out of bounds counts
 *  as continuing, so a run that leaves the floor is not capped into thin air.
 *  Uses the RAW tile code, not the culled set: a run that turns inward must
 *  still know it is not an end. */
export function wallNeighbourMask(level, x, y) {
  const { width, height, code } = level;
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + WALL_DIRS[d][0], ny = y + WALL_DIRS[d][1];
    const solid = (nx < 0 || ny < 0 || nx >= width || ny >= height) ? true : code[ny][nx] === 'W';
    if (solid) m |= 1 << d;
  }
  return m;
}

/** Run topology from a mask: how many ways out, and whether the tile is a
 *  straight length, a bend, a junction or a free-standing end. */
export function wallTopology(mask) {
  let deg = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) deg++;
  const ns = ((mask & 1) ? 1 : 0) + ((mask & 4) ? 1 : 0);
  const ew = ((mask & 2) ? 1 : 0) + ((mask & 8) ? 1 : 0);
  const straight = deg === 2 && (ns === 2 || ew === 2);
  return {
    deg,
    straight,
    corner: deg === 2 && !straight,
    junction: deg >= 3,
    end: deg <= 1,
    axis: straight ? (ns === 2 ? 'z' : 'x') : null,
  };
}

// ── Piece constructors ─────────────────────────────────────────────────────

function B(out, ox, oz, y0, y1, w, d, hex, o = {}) {
  out.push({
    shape: 'box', ox, oz, y0, y1, w, d, hex,
    tone: o.tone ?? 1, rot: o.rot ?? 0, tilt: o.tilt ?? 0,
  });
  return out;
}

function P(out, ox, oz, y0, y1, rBot, rTop, seg, hex, o = {}) {
  out.push({
    shape: 'prism', ox, oz, y0, y1, r0: rBot, r1: rTop, seg, hex,
    tone: o.tone ?? 1, rot: o.rot ?? 0, tilt: o.tilt ?? 0,
  });
  return out;
}

/**
 * The teal sliver that sits between two plies. Always a touch WIDER than the
 * ply above it, so what you see from a standing camera is a thin shadow rim
 * running right around the layer — the papercut tell. The mix is deliberately
 * gentle: on an already-dark paper like forestD a heavy pull toward
 * PAPER.shadow stops reading as teal and starts reading as ink.
 *
 * `ctx` is now threaded through so a seam can DECLINE to exist. Every seam used
 * to be emitted at a fixed fraction of the tile's h, on every tile, which drew
 * one dead-level line the whole length of a forty-tile run — the loudest
 * advertisement of the tile grid in the build, and it did it in the darkest
 * value in the frame. A per-tile altitude jitter plus a third of tiles with no
 * seam at all leaves the papercut tell intact and takes the ruled line away.
 */
function seamBox(ctx, out, ox, oz, y, w, d, hex, rot = 0) {
  if (ctx.noSeam) return;
  const yy = Math.max(0.08, y + ctx.seamJit);
  B(out, ox, oz, yy - PLY_GAP, yy + PLY_GAP, w, d, mixPaper(hex, PAPER.shadow, PLY_SHADOW_MIX), { rot });
  out[out.length - 1].seam = true;
}

function seamPrism(ctx, out, ox, oz, y, r, seg, hex, rot = 0) {
  if (ctx.noSeam) return;
  const yy = Math.max(0.08, y + ctx.seamJit);
  P(out, ox, oz, yy - PLY_GAP, yy + PLY_GAP, r, r, seg, mixPaper(hex, PAPER.shadow, PLY_SHADOW_MIX), { rot });
  out[out.length - 1].seam = true;
}

// ── Terminals: caps, corner posts, junction posts ──────────────────────────

/**
 * What stops a run from looking sliced off. An END grows a rounded cap out of
 * its open face; a BEND and a JUNCTION grow a slightly taller post at the tile
 * centre, which is what a real hedge maze or a real ruin does at a turn.
 * Free-standing tiles (deg 0) become a single fat post instead of a wall.
 */
function addTerminals(out, ctx) {
  const { h, S, mid, light, crown, mask, topo, r } = ctx;
  if (topo.corner || topo.junction) {
    const ph = h * (1.04 + r() * 0.07);
    seamPrism(ctx, out, 0, 0, h * 0.62, S * 0.30, 8, mid);
    P(out, 0, 0, h * 0.60, ph, S * 0.285, S * 0.245, 8, light, { rot: r() * 0.4 });
    P(out, 0, 0, ph - 0.06, ph + 0.16, S * 0.255, S * 0.19, 8, crown, { tone: 1.02 });
    return;
  }
  if (topo.deg === 0) {
    P(out, 0, 0, h * 0.5, h * 1.10, S * 0.34, S * 0.27, 8, mid, { rot: r() * 0.5 });
    P(out, 0, 0, h * 1.05, h * 1.22, S * 0.28, S * 0.16, 7, crown);
    return;
  }
  // deg 1 — cap the faces that are open, EXCLUDING the two long sides, which
  // is every face except the one the run arrives through.
  for (let d = 0; d < 4; d++) {
    if (mask & (1 << d)) continue;
    const [dx, dz] = WALL_DIRS[d];
    const inward = (mask & (1 << ((d + 2) & 3))) !== 0;
    if (!inward) continue;                       // side face, not the end
    // The cap has to sit on a WORLD face, but the whole profile is about to be
    // spun by the tile's yaw (large, for the vocabularies that have a front),
    // so the offset is counter-rotated here and comes out square.
    const wx = dx * S * 0.34, wz = dz * S * 0.34;
    const cx = wx * ctx.cy - wz * ctx.sy;
    const cz = wx * ctx.sy + wz * ctx.cy;
    seamPrism(ctx, out, cx, cz, h * 0.30, S * 0.30, 8, mid);
    P(out, cx, cz, h * 0.06, h * 0.92, S * 0.285, S * 0.255, 8, mid, { rot: r() * 0.4 });
    P(out, cx, cz, h * 0.88, h * 1.02, S * 0.26, S * 0.15, 8, crown, { tone: 1.03 });
  }
}

// ── Per-floor builders ─────────────────────────────────────────────────────
//
// Each returns the tile's full piece list. `ctx.crown` is the sunlit cut edge
// (the theme's lightest paper, reserved for whatever tops the silhouette),
// `ctx.light` the lightest ply, `ctx.dark` the deepest, and `ctx.acc` the
// accent papers the crown dots are cut from.

/** Floor 1 — HEDGEROW. Four plies of clipped box, the upper two octagonal so
 *  the silhouette rounds off, then a bumpy crown of lobes with flower dots. */
function vocabHedge(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {                                                            // leaf litter
    B(out, 0, 0, -0.30, 0.20, S, S * 0.98, dark, { tone: 0.94 });
    seamBox(ctx, out, 0, 0, 0.21, S * 0.99, S * 0.97, dark);
  }
  // Solid clipped paper to just above eye height: a maze wall a five-year-old
  // can see through is a maze wall that stops reading as a wall. The width and
  // the yaw of this ply are the per-tile zigzag — a run of identical squares
  // is the exact failure this vocabulary exists to avoid, so neighbouring
  // tiles meet at a visible cut edge rather than a flush join.
  const w1 = S * (0.93 + r() * 0.12);
  B(out, (r() - 0.5) * 0.14, (r() - 0.5) * 0.14, 0.18, h * (0.50 + r() * 0.08),
    w1, S * (0.90 + r() * 0.10), mid, { tone: 0.93 + r() * 0.06, rot: (r() - 0.5) * 0.20 });
  seamBox(ctx, out, 0, 0, h * 0.57, w1 * 0.99, S * 0.94, mid, (r() - 0.5) * 0.20);
  const rotA = (r() - 0.5) * 0.26;
  P(out, (r() - 0.5) * 0.16, (r() - 0.5) * 0.16, h * 0.54, h * (0.76 + r() * 0.08),
    S * (0.50 + r() * 0.05), S * 0.495, 8, mid, { tone: 0.97 + r() * 0.06, rot: rotA });
  seamPrism(ctx, out, 0, 0, h * 0.81, S * 0.515, 8, mid, rotA);
  P(out, (r() - 0.5) * 0.18, (r() - 0.5) * 0.18, h * 0.78, h * 0.95,
    S * 0.495, S * 0.44, 7, light, { tone: 0.99, rot: (r() - 0.5) * 0.4 });
  // Crown: five clipped lobes at different heights — the skyline. Cut from
  // `crown`, the theme's lightest paper, because the sunlit top of a hedge is
  // the ONE surface the player judges its volume by: measured on the old build
  // the crown came out at L=55 against a front face at L=59, i.e. the top was
  // darker than the side, and a solid whose top is darker than its side is a
  // flat shape. Steam Gardens runs about 2x the other way.
  const lobes = 5;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + r() * 0.9;
    const rad = S * (0.16 + r() * 0.13);
    const lift = h * (0.02 + r() * 0.34);
    const spread = S * (0.15 + r() * 0.15);
    const lx = Math.cos(a) * spread, lz = Math.sin(a) * spread;
    P(out, lx, lz, h * 0.90, h * 0.96 + lift,
      rad, rad * 0.80, 6, i % 2 ? crown : light, { tone: 1.0 + r() * 0.07 });
    if (r() > 0.55) {
      const p = acc[(i + ctx.ti) % acc.length];
      P(out, lx, lz, h * 0.95 + lift, h * 1.02 + lift,
        rad * 0.34, rad * 0.30, 5, p);                                          // flower dot
    }
  }
  return out;
}

/** Floor 2 — SUNKEN RUIN. Three masonry courses, each shunted a little off the
 *  one below, then a broken crenellation: two or three merlons of unequal
 *  height with one deliberately missing, and moss where the rain sits. */
function vocabMasonry(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.30, 0.22, S, S * 0.94, dark, { tone: 0.92 });
    seamBox(ctx, out, 0, 0, 0.23, S * 0.99, S * 0.93, dark);
  }
  let y = 0.20;
  const courses = 3;
  for (let c = 0; c < courses; c++) {
    const y1 = 0.20 + (h * 0.78 - 0.20) * ((c + 1) / courses);
    const off = (r() - 0.5) * 0.22;
    const paper = c === courses - 1 ? light : mid;
    B(out, off, (r() - 0.5) * 0.12, y, y1, S * (1.00 - c * 0.03), S * (0.94 - c * 0.03),
      paper, { tone: 0.94 + c * 0.04, rot: (r() - 0.5) * 0.06 });
    seamBox(ctx, out, off, 0, y1 + 0.01, S * (0.99 - c * 0.03), S * (0.93 - c * 0.03), paper);
    y = y1;
  }
  // Crenellation. Slots are as much of the silhouette as the merlons.
  const slots = 3;
  const gone = Math.floor(r() * slots);
  for (let i = 0; i < slots; i++) {
    if (i === gone) continue;
    const t = (i + 0.5) / slots - 0.5;
    const mh = h * (0.90 + r() * 0.16);
    B(out, t * S * 0.78, (r() - 0.5) * 0.18, y, mh, S * 0.26, S * 0.80, light,
      { tone: 1.0 + r() * 0.06, rot: (r() - 0.5) * 0.10 });
    B(out, t * S * 0.78, 0, mh, mh + 0.12, S * 0.30, S * 0.86, crown, { tone: 1.02 }); // capstone
    if (r() > 0.6) {
      const p = acc[(i + ctx.ti) % acc.length];
      B(out, t * S * 0.78 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.5, mh + 0.08, mh + 0.20,
        S * 0.16, S * 0.22, p, { rot: r() });                                    // moss pad
    }
  }
  return out;
}

/** Floor 3 — CLOUD BANK over sky-stone. A thin cut slab of stone, then soft
 *  round plies that grow and shrink along the run, then loose puffs on top. */
function vocabCloudbank(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.40, 0.30, S, S * 0.96, dark, { tone: 0.94 });
    seamBox(ctx, out, 0, 0, 0.31, S * 0.99, S * 0.95, dark);
  }
  const plies = 3;
  let y = 0.24;
  for (let i = 0; i < plies; i++) {
    const y1 = 0.24 + (h * 0.86 - 0.24) * ((i + 1) / plies);
    const rad = S * (0.525 - i * 0.045 + (r() - 0.5) * 0.03);
    const paper = i === plies - 1 ? light : mid;
    P(out, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, y, y1, rad, rad * 0.97, 8, paper,
      { tone: 0.95 + i * 0.04, rot: r() * 0.6 });
    seamPrism(ctx, out, 0, 0, y1 + 0.01, rad * 0.99, 8, paper);
    y = y1;
  }
  const puffs = 3;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * TAU + r();
    const rad = S * (0.15 + r() * 0.08);
    P(out, Math.cos(a) * S * 0.20, Math.sin(a) * S * 0.20, y - 0.05,
      y + h * (0.05 + r() * 0.22), rad, rad * 0.78, 6, i % 2 ? crown : light,
      { tone: 1.0 + r() * 0.06 });
  }
  if (ctx.tint > 0.6) {
    P(out, 0, 0, y + h * 0.12, y + h * 0.24, S * 0.10, S * 0.05, 5, acc[0], { tone: 1.05 });
  }
  return out;
}

/** Floor 4 — BASALT. A cluster of hexagonal columns snapped off at different
 *  heights, each with a bright fracture face, and ember dots in the rubble. */
function vocabColumn(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {                                                              // rubble berm
    B(out, 0, 0, -0.35, h * 0.30, S, S * 0.96, dark, { tone: 0.90 });
    seamBox(ctx, out, 0, 0, h * 0.31, S * 0.99, S * 0.95, dark);
  }
  // Four columns, snapped off at four different heights. A basalt column that
  // does not taper and does not break on a slant is a tin can, so every one of
  // them loses radius as it rises and every fracture face is raked.
  const cols = [
    [-0.23, -0.19, 0.275, 1.00],
    [0.24, -0.09, 0.235, 0.70],
    [0.02, 0.25, 0.250, 0.87],
    [-0.10, 0.05, 0.165, 0.54],
  ];
  let tallest = 0, tallestI = 0;
  for (let i = 0; i < cols.length; i++) {
    const [ox, oz, rad, top] = cols[i];
    const ch = h * top * (0.88 + r() * 0.18);
    const rot = r() * 0.9;
    P(out, ox * S, oz * S, h * 0.24, ch, S * rad, S * rad * 0.80, 6,
      i % 2 ? mid : dark, { tone: 0.92 + i * 0.06, rot });
    P(out, ox * S, oz * S, ch - 0.05, ch + 0.10 + r() * 0.16,
      S * rad * 0.82, S * rad * 0.52, 6,
      ch > tallest ? crown : light,
      { tone: 1.0 + r() * 0.06, rot, tilt: 0.14 + r() * 0.20 });                 // fracture face
    if (ch > tallest) { tallest = ch; tallestI = i; }
  }
  // One shoulder of loose paper leaning on the tallest stack, so the cluster
  // has a diagonal in it and not just verticals.
  {
    const [ox, oz] = cols[tallestI];
    B(out, ox * S + (r() - 0.5) * 0.5, oz * S + (r() - 0.5) * 0.5, h * 0.24, h * 0.62,
      S * 0.20, S * 0.16, mid, { tone: 0.98, tilt: 0.22 + r() * 0.16, rot: r() * 1.4 });
  }
  const embers = 2;
  for (let i = 0; i < embers; i++) {
    const a = r() * TAU;
    P(out, Math.cos(a) * S * 0.34, Math.sin(a) * S * 0.34, h * 0.28, h * 0.28 + 0.18 + r() * 0.14,
      S * 0.055, S * 0.03, 5, acc[(i + ctx.ti) % acc.length], { tone: 1.06 });
  }
  return out;
}

/** Floor 5 — ICE. Two leaning slabs that overlap like badly stacked paper,
 *  then a crown of faceted spikes at four different heights and rakes. */
function vocabSlab(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.30, 0.20, S, S * 0.92, dark, { tone: 0.93 });
    seamBox(ctx, out, 0, 0, 0.21, S * 0.99, S * 0.91, dark);
  }
  B(out, -S * 0.04, (r() - 0.5) * 0.18, 0.16, h * (0.72 + r() * 0.10),
    S * 1.00, S * 0.62, mid, { tone: 0.96, tilt: 0.05, rot: (r() - 0.5) * 0.09 });
  seamBox(ctx, out, -S * 0.04, 0, h * 0.73 + r() * 0.10 * h, S * 0.99, S * 0.61, mid);
  B(out, S * 0.18, (r() - 0.5) * 0.22, 0.16, h * (0.84 + r() * 0.12),
    S * 0.62, S * 0.50, light, { tone: 0.99, tilt: -0.09, rot: (r() - 0.5) * 0.24 });
  const spikes = 4;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * TAU + r() * 0.7;
    const sh = h * (0.16 + r() * 0.22);
    const base = h * (0.70 + r() * 0.14);
    P(out, Math.cos(a) * S * 0.26, Math.sin(a) * S * 0.26, base, base + sh,
      S * (0.08 + r() * 0.05), S * 0.012, 5,
      i === spikes - 1 ? acc[ctx.ti % acc.length] : (i % 2 ? crown : light),
      { tone: 1.0 + r() * 0.08, tilt: (r() - 0.5) * 0.30, rot: r() * 1.2 });
  }
  return out;
}

/** Floor 6 — CRYSTAL. A low cut plinth with splayed tapered points, no two the
 *  same length, so the run reads as a growth rather than a fence. */
function vocabCrystal(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.35, h * 0.34, S, S * 0.96, dark, { tone: 0.92 });
    seamBox(ctx, out, 0, 0, h * 0.35, S * 0.99, S * 0.95, dark);
  }
  const pts = [
    [-0.19, -0.12, 0.20, 1.00],
    [0.20, 0.05, 0.17, 0.80],
    [0.02, 0.23, 0.15, 0.92],
    [-0.06, -0.25, 0.13, 0.64],
    [0.13, -0.20, 0.10, 0.50],
  ];
  for (let i = 0; i < pts.length; i++) {
    const [ox, oz, rad, top] = pts[i];
    const tip = h * top * (0.90 + r() * 0.16);
    P(out, ox * S, oz * S, h * 0.28, tip, S * rad, S * rad * 0.10, 5,
      i === 0 ? crown : (i % 2 ? mid : light),
      { tone: 0.94 + i * 0.04, tilt: (r() - 0.5) * 0.28, rot: r() * 1.3 });
  }
  P(out, 0, 0, h * 0.20, h * (0.40 + r() * 0.2), S * 0.075, S * 0.02, 4,
    acc[ctx.ti % acc.length], { tone: 1.06, tilt: (r() - 0.5) * 0.4, rot: r() });
  return out;
}

/** Floor 7 — MARKET STALL. Counter, uprights, a striped awning that sags, and
 *  bunting knots at unequal heights so the row of stalls has a ragged top. */
function vocabStall(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  // A stall's counter is its footing: it cannot vanish on a gap tile without
  // leaving the awning standing on air, so it narrows to two thirds instead and
  // the run separates at the stall fronts rather than under them.
  const cw = ctx.noBase ? 0.60 : 0.90;
  B(out, 0, S * 0.12, -0.30, h * 0.48, S * cw, S * 0.52, mid, { tone: 0.94 });   // counter
  seamBox(ctx, out, 0, S * 0.12, h * 0.49, S * (cw + 0.03), S * 0.55, mid);
  B(out, 0, S * 0.12, h * 0.47, h * 0.56, S * (cw + 0.04), S * 0.56, light, { tone: 1.0 }); // counter top
  for (const sx of [-1, 1]) {
    B(out, sx * S * 0.40, -S * 0.14, 0, h * (0.86 + r() * 0.06), S * 0.07, S * 0.07,
      dark, { tone: 0.95 });
  }
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const x0 = (-0.44 + (i + 0.5) / stripes * 0.88) * S;
    B(out, x0, 0, h * 0.84, h * 0.90, (S * 0.88) / stripes, S * 0.60,
      i % 2 ? acc[0] : crown, { tone: 1.0, tilt: -0.18 });
  }
  B(out, 0, S * 0.26, h * 0.76, h * 0.86, S * 0.90, S * 0.09, mid, { tone: 1.0 });  // valance
  if (ctx.tint > 0.45) {
    B(out, (r() - 0.5) * S * 0.4, S * 0.10, h * 0.56, h * 0.56 + S * 0.09,
      S * 0.26, S * 0.26, acc[1], { rot: r() });                                    // crate
  }
  const knots = 2;
  for (let i = 0; i < knots; i++) {
    const kx = (i ? 0.30 : -0.30) * S + (r() - 0.5) * 0.4;
    const kh = h * (0.94 + r() * 0.14);
    B(out, kx, S * 0.20, h * 0.88, kh, S * 0.04, S * 0.04, dark);
    P(out, kx, S * 0.20, kh, kh + S * 0.10, S * 0.09, S * 0.07, 6,
      acc[(i + ctx.ti) % acc.length], { tone: 1.05 });                        // lantern
  }
  return out;
}

/** Floor 8 — BOOKCASE. A case is only as good as its book rows: every spine is
 *  a different height and lean, and the top row overshoots the case so the
 *  skyline is spines, not a plank. */
function vocabShelf(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.30, 0.14, S * 0.96, S * 0.50, dark, { tone: 0.92 });
    seamBox(ctx, out, 0, 0, 0.15, S * 0.95, S * 0.49, dark);
  }
  for (const sx of [-1, 1]) {
    B(out, sx * S * 0.44, 0, 0.10, h * 0.94, S * 0.08, S * 0.46, mid, { tone: 0.95 });
  }
  B(out, 0, S * 0.14, 0.10, h * 0.92, S * 0.86, S * 0.10, dark, { tone: 0.90 });     // back
  const rows = 3;
  for (let sh = 0; sh < rows; sh++) {
    const y = 0.14 + (h * 0.90 - 0.14) * (sh / rows);
    B(out, 0, 0, y, y + 0.07, S * 0.86, S * 0.44, mid, { tone: 1.0 });               // plank
    const slot = (h * 0.90 - 0.14) / rows - 0.07;
    const books = 5;
    for (let b = 0; b < books; b++) {
      const bh = slot * (0.62 + r() * 0.36) + (sh === rows - 1 ? slot * 0.22 : 0);
      B(out, (-0.36 + b * 0.18) * S, -S * 0.02, y + 0.07, y + 0.07 + bh,
        S * (0.10 + r() * 0.055), S * 0.30, acc[(b + sh + ctx.ti) % acc.length],
        { tone: 0.92 + r() * 0.22, rot: (r() - 0.5) * 0.10, tilt: r() > 0.85 ? 0.13 : 0 });
    }
  }
  B(out, 0, 0, h * 0.94, h * 1.00, S * 0.96, S * 0.50, crown, { tone: 1.02 });       // cornice
  return out;
}

/** Floor 9 — MANUSCRIPT SCREEN. Three paper leaves hinged at different angles,
 *  each with its own glyph tab standing above the head rail. */
function vocabScreen(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  if (!ctx.noBase) {
    B(out, 0, 0, -0.30, 0.16, S * 0.92, S * 0.34, dark, { tone: 0.93 });
    seamBox(ctx, out, 0, 0, 0.17, S * 0.91, S * 0.33, dark);
  }
  const leaves = 3;
  for (let i = 0; i < leaves; i++) {
    const t = i / (leaves - 1) - 0.5;
    const rot = t * 0.62 + (r() - 0.5) * 0.14;
    const ox = t * S * 0.32;
    const lh = h * (0.86 + r() * 0.12);
    B(out, ox, 0, 0.12, lh, S * 0.46, S * 0.055, light, { rot, tone: 1.0 });     // panel
    B(out, ox, 0, 0.10, 0.24, S * 0.48, S * 0.10, mid, { rot, tone: 0.96 });         // foot rail
    B(out, ox, 0, lh - 0.10, lh + 0.06, S * 0.48, S * 0.11, crown, { rot, tone: 1.0 });// head rail
    B(out, ox, 0, h * (0.34 + i * 0.08), h * (0.46 + i * 0.08), S * 0.30, S * 0.028,
      acc[(i + ctx.ti) % acc.length], { rot, tone: 1.04 });                    // glyph band
    B(out, ox + (r() - 0.5) * 0.4, 0, lh + 0.02, lh + h * (0.06 + r() * 0.12),
      S * 0.13, S * 0.045, acc[(i + 1 + ctx.ti) % acc.length],
      { rot, tone: 1.06 });                                                          // glyph tab
  }
  return out;
}

const WALL_VOCAB = {
  hedge: vocabHedge, masonry: vocabMasonry, cloudbank: vocabCloudbank,
  column: vocabColumn, slab: vocabSlab, crystal: vocabCrystal,
  stall: vocabStall, shelf: vocabShelf, screen: vocabScreen,
};

/**
 * Vocabularies with a FRONT. A hedge or a basalt cluster looks the same from
 * every side, but a market stall with its counter facing into a solid wall is
 * a bug you can see from across the floor. These three get turned so their
 * display face looks at the corridor, and get a backing ply so the side the
 * player never shops from is still finished paper.
 *
 * `yaw` is the extra turn that puts the vocabulary's own front on local +z;
 * `back` is the local z SIGN the backing ply goes on — get that wrong and the
 * backing lands over the shop counter or the book spines.
 */
const WALL_FACING = {
  stall: { yaw: 0, back: -1 },        // counter already sits at +z
  shelf: { yaw: Math.PI, back: 1 },   // spines sit at -z, so the back is +z
  screen: { yaw: 0, back: -1 },
};

/** True for the vocabularies whose display face has to point at the corridor.
 *  They are the three that may NOT take the big anti-grid yaw jitter — a
 *  bookcase spun 25 degrees is a bookcase facing a wall. */
export function wallHasFront(wallKind) { return !!WALL_FACING[wallKind]; }

/**
 * Yaw that turns a fronted vocabulary toward open space. Picks the open
 * neighbour the player can actually stand on; ties break on the tile hash so a
 * corridor with rooms on both sides does not end up with every stall facing
 * the same way. Returns 0 for the vocabularies that have no front.
 */
export function wallFaceYaw(level, x, y, wallKind) {
  const face = WALL_FACING[wallKind];
  if (!face) return 0;
  const { width, height, code, transformTiles, secretTiles } = level;
  const open = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + WALL_DIRS[d][0], ny = y + WALL_DIRS[d][1];
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const k = ny * width + nx;
    if (isWalkableChar(code[ny][nx]) || transformTiles.has(k) || secretTiles.has(k)) open.push(d);
  }
  if (!open.length) return 0;
  const d = open[Math.min(open.length - 1, (hash2(x, y, 5501) * open.length) | 0)];
  const [dx, dz] = WALL_DIRS[d];
  return Math.atan2(dx, dz) + face.yaw;
}

/**
 * The piece list for ONE wall tile: the layered stack, its crown and its
 * terminals, in tile-local metres. Deterministic in (tile.tx, tile.ty, floor).
 *
 * @param {object} tile a record from wallTiles()
 * @param {LevelTheme} theme
 * @returns {Array<object>} pieces, ready for level3d.js to stamp
 */
/**
 * A run tile dropped to planter height. Not a shortened wall — a DIFFERENT
 * object: a low trough with a mounded fill and a couple of accent dots, which
 * is what a real hedge maze puts where a bay opens off the run.
 *
 * Why it exists: every wall in every floor topped out inside a 0.75 m band, so
 * a run of forty tiles had one flat top edge and the player could see nothing
 * of the floor beyond it. Dropping roughly one straight tile in seven below
 * hero eyeline punches holes you can see over AND through, which is depth,
 * a sightline to the landmark, and a broken skyline, for eleven pieces.
 * The tile keeps its collider, so the maze is exactly as solid as it was.
 */
function planterProfile(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  const w = S * (0.88 + r() * 0.14), d = S * (0.72 + r() * 0.16);
  B(out, 0, 0, -0.30, h * 0.30, w, d, dark, { tone: 0.94 });                 // trough
  seamBox(ctx, out, 0, 0, h * 0.31, w * 0.99, d * 0.99, dark);
  B(out, (r() - 0.5) * 0.20, (r() - 0.5) * 0.20, h * 0.26, h * 0.74,
    w * 0.94, d * 0.92, mid, { tone: 0.97, rot: (r() - 0.5) * 0.24 });       // body
  B(out, 0, 0, h * 0.70, h * 0.80, w * 0.99, d * 0.98, light, { tone: 1.0 }); // rim
  const lobes = 3;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + r() * 1.1;
    const rad = S * (0.13 + r() * 0.09);
    const lift = h * (0.06 + r() * 0.26);
    const lx = Math.cos(a) * S * (0.10 + r() * 0.16);
    const lz = Math.sin(a) * S * (0.10 + r() * 0.16);
    P(out, lx, lz, h * 0.72, h * 0.80 + lift, rad, rad * 0.78, 6, crown,
      { tone: 1.0 + r() * 0.06 });                                            // fill
    if (r() > 0.45) {
      P(out, lx, lz, h * 0.78 + lift, h * 0.86 + lift, rad * 0.36, rad * 0.30, 5,
        acc[(i + ctx.ti) % acc.length], { tone: 1.04 });
    }
  }
  return out;
}

/**
 * The OTHER low tile: a spill of broken slabs where a run has come apart.
 *
 * A planter is tidy, symmetrical and obviously placed. If every gap in every
 * run is a planter then the gap itself becomes the new repeating unit — the
 * grid, moved up one level of abstraction — which is precisely the failure this
 * whole pass exists to undo. Rubble is the counter-example: an off-centre heap
 * of four slabs at four rakes, no two the same size, with nothing at the tile
 * centre at all, so half the low tiles in a floor do not even share a
 * silhouette family with the other half.
 *
 * Deliberately cheaper than a planter (eight pieces against eleven) because
 * these are the tiles the player looks OVER, not at.
 */
function rubbleProfile(ctx) {
  const out = [];
  const { h, S, dark, mid, light, crown, acc, r } = ctx;
  // A scree apron, off-centre, so the pile has a direction.
  const ax = (r() - 0.5) * S * 0.30, az = (r() - 0.5) * S * 0.30;
  P(out, ax, az, -0.30, h * 0.30, S * (0.44 + r() * 0.10), S * 0.40, 7, dark,
    { tone: 0.93, rot: r() * TAU });
  seamPrism(ctx, out, ax, az, h * 0.31, S * 0.42, 7, dark);
  // Four slabs leaning on each other. The heights are drawn independently, so
  // the pile's own top edge is jagged before the tile is even placed.
  const slabs = 4;
  for (let i = 0; i < slabs; i++) {
    const a = (i / slabs) * TAU + r() * 1.4;
    const rad = S * (0.14 + r() * 0.16);
    const top = h * (0.42 + r() * 0.58);
    B(out, ax + Math.cos(a) * S * (0.10 + r() * 0.20),
      az + Math.sin(a) * S * (0.10 + r() * 0.20),
      h * 0.14, top, rad, rad * (0.55 + r() * 0.5),
      i === slabs - 1 ? light : mid,
      { tone: 0.92 + r() * 0.16, tilt: (r() - 0.5) * 0.55, rot: r() * TAU });
  }
  // One bright cut edge on top, and one accent chip, so the pile still reads as
  // cut paper rather than as a lump.
  const cx = ax + (r() - 0.5) * S * 0.24, cz = az + (r() - 0.5) * S * 0.24;
  P(out, cx, cz, h * 0.62, h * (0.78 + r() * 0.26), S * 0.17, S * 0.12, 6, crown,
    { tone: 1.03, tilt: (r() - 0.5) * 0.4, rot: r() * TAU });
  P(out, cx, cz, h * 0.30, h * 0.44, S * 0.07, S * 0.05, 5,
    acc[(ctx.ti + 1) % acc.length], { tone: 1.05, rot: r() * TAU });
  return out;
}

/**
 * The PEDESTAL a boundary-ring tile stands its vocabulary on.
 *
 * Raising the ring to 5-7 m fixed the horizon — the level finally reads as an
 * enclosure with a top edge — but scaling a 2.6 m vocabulary to 6.4 m does not
 * scale its DETAIL, so the first pass turned every boundary tile into one flat
 * six-metre slab. That is the "Minecraft cliff" note, reintroduced at triple
 * the size.
 *
 * So a ring tile is not a tall wall. It is a normal-height wall standing on a
 * plinth of stepped courses, each one inset from the course below with a
 * shadow sliver between — which is what layered cut paper looks like at
 * architectural scale, and it puts three horizontal light/dark transitions and
 * a real cast shadow across a face that had none.
 */
function ringPedestal(ctx, lift) {
  /** @type {Array<object>} */
  const out = [];
  const { S, dark, mid, light, r } = ctx;
  // A course every ~1.15 m. Two courses over four metres is a slab with a line
  // on it; three or four is a stack of sheets, which is the read.
  const courses = Math.max(3, Math.round(lift / 1.15));
  // The footing sinks RING_FOOT metres, not 0.35. On the archipelago floors the
  // ring stands over a liquid sheet that has already dropped LIQUID_DROP below
  // the band it shares, so a 0.35 m footing left the whole perimeter hanging in
  // ~3 m of air with the sky visible underneath it. Burying the bottom course
  // costs nothing — it is one box that was always being drawn — and it is the
  // difference between a wall that grows out of the water and a wall that
  // floats above it.
  let y = -RING_FOOT;
  for (let c = 0; c < courses; c++) {
    const y1 = (lift * (c + 1)) / courses;
    const inset = 1.0 - c * 0.075;
    const paper = c === 0 ? dark : (c === courses - 1 ? light : mid);
    B(out, (r() - 0.5) * 0.16, (r() - 0.5) * 0.16, y, y1,
      S * inset, S * (inset - 0.03), paper,
      { tone: 0.90 + c * (0.14 / courses), rot: (r() - 0.5) * 0.06 });
    // A wide, proud course lip rather than a hairline: at six metres the
    // shadow between two courses is the only thing telling you there are two.
    B(out, 0, 0, y1 - 0.09, y1 + 0.09, S * (inset + 0.04), S * (inset + 0.01),
      mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX));
    y = y1 - 0.02;
  }
  return out;
}

export function wallProfile(tile, theme) {
  const stack = theme.wallStack || theme.wallPlies;
  const r = tileRandom(tile.tx, tile.ty, tile.seed);
  // Drawn FIRST, before the vocabulary consumes the stream, so the seam
  // decision for a tile is stable no matter how many numbers its vocabulary
  // goes on to pull.
  const seamRoll = r();
  const seamShift = (r() - 0.5) * 2 * SEAM_JITTER;
  // A ring tile's VOCABULARY runs at ordinary wall height; the extra metres
  // are a stepped pedestal underneath it (see ringPedestal). Everything the
  // vocabulary does — crown, terminals, lobe heights — is a fraction of ctx.h,
  // so handing it the real 6.4 m would just scale one slab up.
  const ringLift = tile.ring ? Math.max(0, tile.h - Math.min(tile.h * 0.52, 2.7)) : 0;
  const ctx = {
    h: tile.h - ringLift,
    // A GAP TILE stands narrower and, via ctx.noBase, without the full-span
    // footing ply. Applying the shrink to S rather than to each ply means every
    // one of the nine vocabularies separates from its neighbour by the same
    // rule, and none of them had to learn about it.
    S: WALL_SPAN * tile.sx * (ringLift ? 0.90 : 1) * (tile.gap ? WALL_GAP_SHRINK : 1),
    noBase: !!tile.gap,

    dark: stack[0], mid: stack[1], light: stack[2],
    // The sunlit cut edge. Falls back to the stack's own lightest ply for any
    // theme that has not declared one, so this can never come out darker than
    // the layer it caps.
    crown: theme.wallTop ?? stack[2],
    acc: theme.crownPapers,
    mask: tile.mask, topo: tile.topo, tint: tile.tint,
    ti: Math.min(2, (tile.tint * 3) | 0),
    cy: Math.cos(tile.yaw || 0), sy: Math.sin(tile.yaw || 0),
    noSeam: seamRoll < SEAM_SKIP,
    seamJit: seamShift,
    r,
  };
  // A planter (or a rubble pile) is its own object and takes no terminals — a
  // corner post on a 1.2 m trough is a bollard, and it would fill the gap the
  // low tile exists to open.
  if (tile.planter) return tintTile(planterProfile(ctx), tile, theme);
  if (tile.rubble) return tintTile(rubbleProfile(ctx), tile, theme);
  const build = WALL_VOCAB[theme.wall] || vocabHedge;
  const out = build(ctx);
  const face = WALL_FACING[theme.wall];
  if (face) {
    const S = ctx.S, bz = face.back * S * 0.28;
    out.unshift(
      { shape: 'box', ox: 0, oz: bz, y0: -0.30, y1: ctx.h * 0.88,
        w: S, d: S * 0.42, hex: ctx.dark, tone: 0.92, rot: 0, tilt: 0 },
      { shape: 'box', ox: 0, oz: bz, y0: ctx.h * 0.88, y1: ctx.h * 0.88 + PLY_GAP * 2,
        w: S, d: S * 0.44, hex: mixPaper(ctx.dark, PAPER.shadow, PLY_SHADOW_MIX),
        tone: 1, rot: 0, tilt: 0 },
    );
  }
  addTerminals(out, ctx);
  if (ringLift > 0) {
    // Lift the whole vocabulary onto its plinth. The plies are already cut in
    // tile-local metres, so this is one pass over y0/y1 — no second builder,
    // no second code path to keep in sync with the nine vocabularies.
    for (const p of out) { p.y0 += ringLift; p.y1 += ringLift; }
    out.unshift(...ringPedestal({ ...ctx, S: WALL_SPAN * tile.sx }, ringLift));
  }
  return tintTile(out, tile, theme);
}

/**
 * PER-TILE COLOUR: walk this tile's whole paper stack toward one of the floor's
 * accent papers, and shift its value.
 *
 * A floor's walls were cut from SEVEN distinct hexes. Not seven per tile —
 * seven for the entire level, repeated across forty tiles, which is why a hedge
 * run measured as one shape no matter how much its geometry was jittered:
 * colour is the strongest grouping cue there is, and every tile was printing
 * the same swatch. Yaw and height cannot undo that on their own.
 *
 * Applied as a post-pass over the finished piece list rather than inside the
 * nine vocabularies, for the same reason ctx.S carries the gap shrink: one rule
 * that every vocabulary, every crown, every terminal and the ring plinth obey,
 * and nothing to keep in sync. The papers it walks TOWARD are the theme's own
 * `crownPapers`, so a tile can only ever land somewhere inside the floor's
 * declared palette — the art law survives the variance.
 */
function tintTile(pieces, tile, theme) {
  const hue = tile.hue || 0, val = tile.val || 0;
  if (!hue && !val) return pieces;
  const acc = theme.crownPapers;
  const toward = acc && acc.length
    ? acc[(tile.accIdx || 0) % acc.length]
    : (theme.wallTop ?? PAPER.cream);
  const amt = Math.abs(hue) * WALL_HUE_JIT;
  const tmul = 1 + val * WALL_VAL_JIT;
  for (const p of pieces) {
    p.hex = mixPaper(p.hex, toward, amt);
    p.tone *= tmul;
  }
  return pieces;
}

/** Triangles one piece costs. Boxes are 12; an n-gon prism is 4n (2n side,
 *  n per cap). Exported so the build can assert its own budget. */
export function pieceTriangles(p) {
  return p.shape === 'box' ? 12 : 4 * p.seg;
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
  const { width, height, code, objects, transformTiles, startX, startY } = level;
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
      // The entrance terrace — see ENTRY_RISE. Uses straight-line distance, not
      // the BFS field: the point is a local plateau you stand ON, and the BFS
      // field is the thing it has to be independent of.
      {
        const de = Math.hypot(x - startX, y - startY) / ENTRY_FALL_TILES;
        // Flat for the inner 35% — a terrace, not a knoll. A cone peaking at
        // the spawn tile would put the hero on a point and the camera boom
        // into the slope behind them.
        if (de < 1) h += ENTRY_RISE * (1 - smoothstep(0.35, 1, de));
      }
      if (boss) {
        const d = Math.hypot(x - bx, y - by) / BOSS_RADIUS_TILES;
        if (d < 1) h += BOSS_RISE * (1 - smoothstep(0, 1, d));
      }
      // Liquid basins sink. Transform tiles keep their WALKABLE height — the
      // ground under a future bridge is already built; only the liquid on top
      // of it drains away — which is exactly why the transform needs no
      // re-terracing and no collider rebuild.
      if (code[y][x] === 'Q' && !transformTiles.has(k)) h -= LIQUID_DROP;
      // Paver ribbons ride proud of the ground they cross. Baked in HERE, at
      // the one place the corner lattice is fed from, so the sampler and the
      // cut surface can never disagree about where the top of the path is.
      if (groundCharAt(level, x, y) === 'P') h += PATH_LIFT;
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

// ═══════════════════════════════════════════════════════════════════════════
// THE GROUND
//
// ── WHAT WENT WRONG, SO IT CANNOT GO WRONG AGAIN ───────────────────────────
// The floors shipped with bright white seams running between every path tile
// and every floor tile. The cause was not z-fighting and not a gap in the
// lattice — the ground quads always shared exact corner heights. It was this:
// the ground was cut PER TILE, path tiles were lifted 0.16 m at render time
// only, and the 0.16 m of air that opened under each ribbon was plugged by a
// vertical "rim" quad — which was wound the wrong way round. So was the 2.8 m
// skirt at the level's outer edge. Both were emitted as
//
//     triN(a, below(a), below(b))
//
// whose right-hand-rule normal is the edge direction rotated INTO the tile,
// i.e. exactly backwards. Under the default FrontSide material every single
// one of them was back-face culled: 156/156 rim quads and 172/172 skirt quads
// on floor 1, 464/464 and 550/550 on floor 8. The player was looking through
// the riser, out of the far side of the world, at the pale cream sky. That is
// the white line.
//
// Flipping the winding would have fixed the colour and left the art broken —
// 45% of those rim quads sat on path/path INTERIOR edges, so a correct build
// of the old design draws cream walls across the middle of every path ribbon.
//
// ── WHAT REPLACES IT ───────────────────────────────────────────────────────
// ONE welded lattice per region. Every walkable tile is subdivided GROUND_SUB
// times per edge into a shared vertex grid; a tile's triangles INDEX that grid
// rather than owning corners of their own, so neighbouring tiles are the same
// vertices, at the same height, with the same colour and the same smoothed
// normal. There are no interior edges to crack, nothing to z-fight, and no
// riser anywhere on the interior — the path is a lift in the height field, not
// a step between two sheets. A seam is not fixed here; it is unrepresentable.
//
// Vertical geometry survives in exactly one place — the outward skirt at the
// boundary of the walkable region — and it goes through `skirtQuad`, which
// derives its winding from the outward direction instead of trusting a vertex
// order.
//
// Colour is a continuous field sampled per vertex, not a fill per tile:
// two-paper patch noise, pigment noise, accent speckle, teal contact shade
// near walls, wetness toward the water's own paper, a lighter cut edge on the
// terrace lips, and a paver ribbon whose border is warped by noise so it never
// reads as a rectangle.
// ═══════════════════════════════════════════════════════════════════════════

/** sRGB byte -> linear float, the exact curve three's Color.setHex applies, so
 *  a colour computed here matches one computed with `lin()` bit for bit. */
const SRGB_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_LIN[i] = c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/** PAPER int -> linear rgb triple, optionally toned. Pure — no three. */
export function paperLinear(hex, tone = 1) {
  return [SRGB_LIN[(hex >> 16) & 255] * tone, SRGB_LIN[(hex >> 8) & 255] * tone, SRGB_LIN[hex & 255] * tone];
}

const SHADOW_LIN = paperLinear(PAPER.shadow);

/** Separable 3-tap blur over a tile field. Turns a 0/1 mask (walls, water)
 *  into the smooth proximity ramp the contact shading and the wetness read. */
function spreadField(src, width, height, passes) {
  let a = Float32Array.from(src);
  const b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        const l = x > 0 ? a[k - 1] : a[k];
        const r = x < width - 1 ? a[k + 1] : a[k];
        b[k] = a[k] * 0.5 + l * 0.25 + r * 0.25;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        const u = y > 0 ? b[k - width] : b[k];
        const d = y < height - 1 ? b[k + width] : b[k];
        a[k] = b[k] * 0.5 + u * 0.25 + d * 0.25;
      }
    }
  }
  return a;
}

/** Tile field -> corner lattice, the same mean-of-touching-tiles the height
 *  field uses. Sampling THIS bilinearly is what makes every ground field
 *  continuous across tile boundaries instead of stepping at them. */
function cornerAverage(field, width, height) {
  const cw = width + 1, ch = height + 1;
  const out = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      let sum = 0, cnt = 0;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          const tx = i + dx, ty = j + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          sum += field[ty * width + tx]; cnt++;
        }
      }
      out[j * cw + i] = cnt ? sum / cnt : 0;
    }
  }
  return out;
}

/** Bilinear read of a corner lattice at tile-space (u, v). */
export function sampleCorner(arr, cw, ch, u, v) {
  if (cw < 2 || ch < 2) return arr[0] || 0;
  let uu = u < 0 ? 0 : (u > cw - 1 ? cw - 1 : u);
  let vv = v < 0 ? 0 : (v > ch - 1 ? ch - 1 : v);
  const i0 = Math.min(cw - 2, Math.floor(uu));
  const j0 = Math.min(ch - 2, Math.floor(vv));
  const fx = uu - i0, fy = vv - j0;
  const a = arr[j0 * cw + i0], b = arr[j0 * cw + i0 + 1];
  const c = arr[(j0 + 1) * cw + i0], d = arr[(j0 + 1) * cw + i0 + 1];
  const top = a + (b - a) * fx;
  return top + ((c + (d - c) * fx) - top) * fy;
}

/**
 * The continuous scalar fields the ground's look is built from, as corner
 * lattices ready for bilinear sampling.
 *
 *   cPath   1 inside a paver ribbon, falling off over one tile
 *   cSpec   the same for 'S' feature tiles
 *   cBlock  1 directly under a blocker; drives the deep TEAL shade
 *   cWall   proximity to blockers; drives the soft contact shade
 *   cWet    proximity to liquid; drives darkening and the water's own dye
 *   open    the raw per-tile walkable mask, for callers that want it
 */
export function groundFields(level) {
  const { width, height, code } = level;
  const n = width * height;
  const path = new Float32Array(n), spec = new Float32Array(n), open = new Float32Array(n);
  const wall = new Float32Array(n), wet = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      const g = groundCharAt(level, x, y);
      if (g === 'P') path[k] = 1;
      else if (g === 'S') spec[k] = 1;
      if (g) open[k] = 1;
      if (code[y][x] === 'W') wall[k] = 1;
      else if (code[y][x] === 'Q') wet[k] = 1;
    }
  }
  const cw = width + 1, ch = height + 1;
  return {
    cw, ch, open,
    cPath: cornerAverage(path, width, height),
    cSpec: cornerAverage(spec, width, height),
    // Two wall fields, because they answer different questions. `cBlock` is
    // the raw mask: 1 for a lattice node that is UNDER a blocker, which is
    // where the apron lives and where the deep shade has to go. `cWall` is the
    // blurred one: how close open ground is to a wall, which is the soft
    // contact shade. Using only the blurred field left a one-tile-thick wall
    // run — a bookcase row, a manuscript screen — reading about 0.35, far too
    // pale to shade the metre of floor showing at its foot, and that pale
    // strip is what still read as a white line down the Library.
    cBlock: cornerAverage(wall, width, height),
    cWall: cornerAverage(spreadField(wall, width, height, 1), width, height),
    cWet: cornerAverage(spreadField(wet, width, height, 2), width, height),
  };
}

/**
 * The APRON: tiles that are not walkable but still need floor under them.
 *
 * Wall vocabularies are not solid tiles. A bookcase is 2 m deep in a 4 m tile,
 * a manuscript screen barely 1 m, so a metre of bare tile shows on either side
 * of them — and with ground cut only under walkable tiles, that metre was a
 * 2.8 m drop into nothing, seen edge-on as a bright pale streak running the
 * length of every shelf row. (It reads as a seam in the frame, which is how it
 * was found; the pixels are the skirt, not the sky, but the fault is the same
 * one: the floor stopping where the player stops.)
 *
 * So the surface also covers every blocking tile that touches open space, and
 * every liquid tile — which gives ponds a visible BED under the water sheet
 * instead of a void, and costs about a third more triangles on a surface that
 * is only a tenth of the frame's budget.
 */
export function apronTiles(level) {
  const { width, height, code } = level;
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (groundCharAt(level, x, y) !== null) continue;
      if (code[y][x] !== 'Q' && !facesOpenSpace(level, x, y)) continue;
      out.push({ key: y * width + x, tx: x, ty: y, ch: code[y][x], transient: null, apron: true });
    }
  }
  return out;
}

/**
 * Sub-tile relief at tile-space (u,v): the gentle swell that stops the drawn
 * floor being a plane between terraces.
 *
 * It is deliberately NOT in the corner lattice, so the collision field never
 * sees it — at ±0.11 m it is a fifth of the controller's step-up and reads as
 * texture, not as terrain. It IS exported, because the scatter has to sit on
 * the surface the player can see rather than the one the collider uses, and a
 * pebble 0.13 m tall sinks out of sight if those two disagree.
 */
export function groundRelief(u, v, seed, paved = 0) {
  const r = (valueNoise(u, v, 1.55, seed + 31) - 0.5) * 0.17
          + (valueNoise(u, v, 0.62, seed + 53) - 0.5) * 0.06;
  return r * (1 - paved * 0.85);
}

/**
 * Pavedness at tile-space (u,v): 1 on a ribbon, 0 off it, with a border that
 * wanders about a metre either side of the tile grid.
 *
 * Two things here are load-bearing and neither is obvious.
 *
 * THE FACTOR OF TWO. `cPath` is the mean of the up-to-four tiles touching each
 * lattice corner, so a ONE-TILE-WIDE corridor — which is most of what the
 * floors are made of — never exceeds 0.5 anywhere, not even down its middle:
 * every corner it owns is shared with the floor beside it. Thresholding the
 * raw field at 0.5 therefore lands exactly on the noise floor and the ribbon
 * dissolves. Doubling first puts a plateau of 1.0 over the paving proper and a
 * clean linear ramp to 0 one tile out, whatever the ribbon's width.
 *
 * THE WARP IS ON THE DOMAIN, NOT THE VALUE. Jittering the pavedness itself
 * punches holes in the middle of a corridor, because a one-wide corridor's
 * plateau sits AT the threshold rather than above it. Displacing the sample
 * point instead leaves any interior sample interior and only ever moves the
 * border — which is the whole intent: an edge that wanders, not a noisy edge.
 */
export function pavedAt(gf, u, v, seed) {
  const wu = u + (valueNoise(u, v, 1.20, seed + 211) - 0.5) * 0.55;
  const wv = v + (valueNoise(u, v, 1.20, seed + 307) - 0.5) * 0.55;
  const pw = Math.min(1, sampleCorner(gf.cPath, gf.cw, gf.ch, wu, wv) * 2);
  return { pw, paved: smoothstep(0.62, 0.96, pw), verge: smoothstep(0.26, 0.60, pw) };
}

/**
 * Cut the whole walkable region as ONE welded, vertex-coloured surface.
 *
 * Returns plain Float32Arrays — this module still never imports three, so the
 * whole ground can be built and asserted in a unit test. `solid` is the static
 * floor; `transient` is the transform/secret ground that grows in later and
 * therefore has to be its own mesh. Both are cut from the same lattice, so
 * they meet exactly.
 *
 * @returns {{solid:{position:Float32Array,normal:Float32Array,color:Float32Array},
 *            transient:{position:Float32Array,normal:Float32Array,color:Float32Array}|null,
 *            sub:number, vertices:number, triangles:number}}
 */
export function buildGroundSurface(level, hf, theme, opts = {}) {
  const sub = Math.max(1, opts.sub || GROUND_SUB);
  const { width, height } = level;
  const seed = level.id * 7919;
  const gf = groundFields(level);
  const gspan = TILE_M / sub;

  // The lattice runs from -MG to width+MG in tile space: the extra ring is the
  // shoulder that stops the camera seeing out of the world past a thin
  // boundary wall (see GROUND_MARGIN). Node (i,j) sits at tile-space
  // (i/sub - MG, j/sub - MG); everything downstream goes through `nodeU`.
  const MG = opts.margin ?? GROUND_MARGIN;
  const lw = (width + 2 * MG) * sub + 1, lh = (height + 2 * MG) * sub + 1;
  const nodes = lw * lh;
  const nodeU = (i) => i / sub - MG;
  const nodeX = (i) => (i / sub - MG - width / 2) * TILE_M;
  const nodeZ = (j) => (j / sub - MG - height / 2) * TILE_M;
  /** How far outside the footprint a tile-space point lies, in tiles. */
  const outsideBy = (u, v) => Math.hypot(
    Math.max(0, -u, u - width), Math.max(0, -v, v - height));
  const LH = new Float32Array(nodes);              // height
  const LP = new Float32Array(nodes);              // pavedness
  const LV = new Float32Array(nodes);              // verge (paved, one band wider)
  const LC = new Float32Array(nodes * 3);          // linear rgb
  const LN = new Float32Array(nodes * 3);          // smoothed normal

  const hRange = Math.max(0.001, hf.maxH - hf.minH);

  // ── Pass 1: height + pavedness ─────────────────────────────────────────
  // The terrace/boss/liquid shape already lives in the corner lattice; what is
  // added here is sub-tile relief the collision field deliberately does not
  // see. It is ±0.11 m — a fifth of the controller's step-up — so it is
  // texture, never terrain, and the ribbon flattens it out because a paved
  // road that ripples is a road nobody laid.
  for (let j = 0; j < lh; j++) {
    const v = nodeU(j);
    for (let i = 0; i < lw; i++) {
      const u = nodeU(i);
      const k = j * lw + i;
      const { paved, verge } = pavedAt(gf, u, v, seed);
      LP[k] = paved; LV[k] = verge;
      const out = outsideBy(u, v);
      LH[k] = sampleCorner(hf.cornerH, hf.cw, hf.ch, u, v)
            + groundRelief(u, v, seed, paved)
            - out * out * MARGIN_FALL;
    }
  }

  // ── Pass 2: normals by central difference on the lattice ───────────────
  // Real geometric normals off real geometry — no derivative instruction, so
  // SwiftShader and the device agree, per the tech law.
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const k = j * lw + i;
      const hL = LH[j * lw + (i > 0 ? i - 1 : i)];
      const hR = LH[j * lw + (i < lw - 1 ? i + 1 : i)];
      const hD = LH[(j > 0 ? j - 1 : j) * lw + i];
      const hU = LH[(j < lh - 1 ? j + 1 : j) * lw + i];
      const spanX = ((i > 0 ? 1 : 0) + (i < lw - 1 ? 1 : 0)) * gspan;
      const spanZ = ((j > 0 ? 1 : 0) + (j < lh - 1 ? 1 : 0)) * gspan;
      let nx = -(hR - hL) / (spanX || gspan);
      let nz = -(hU - hD) / (spanZ || gspan);
      const len = Math.hypot(nx, 1, nz) || 1;
      LN[k * 3] = nx / len; LN[k * 3 + 1] = 1 / len; LN[k * 3 + 2] = nz / len;
    }
  }

  // ── Pass 3: colour ─────────────────────────────────────────────────────
  const pathPaper = theme.path, rimPaper = theme.pathRim;
  for (let j = 0; j < lh; j++) {
    const v = nodeU(j);
    for (let i = 0; i < lw; i++) {
      const u = nodeU(i);
      const k = j * lw + i;

      // Two papers of earth on TWO scales of patch — 21 m drifts with 8 m
      // patches inside them — plus an accent speckle and a fibre tone. One
      // octave alone is invisible at this camera height: the whole frame sits
      // inside a single patch and the ground goes back to being a flat fill.
      // Averaging two octaves pulls the sum toward its mean, so the blend has
      // to be mapped over the range the sum ACTUALLY occupies (roughly
      // 0.3-0.7) or every patch comes out the same 50/50 mud. The narrow
      // smoothstep below is what buys real fields of one paper and real fields
      // of the other; a wide one is how the ground went pale.
      const nA = valueNoise(u, v, 5.2, seed + 7) * 0.62 + valueNoise(u, v, 2.05, seed + 23) * 0.38;
      const nB = valueNoise(u, v, 1.05, seed + 61);
      const nC = valueNoise(u, v, 0.42, seed + 113);
      let hex = mixPaper(theme.ground[0], theme.ground[1], smoothstep(0.40, 0.70, nA));
      hex = mixPaper(hex, theme.groundAccent, smoothstep(0.58, 0.90, nB) * 0.55);
      let tone = 0.93 + nC * 0.14;

      // Wetness: ground near liquid takes the liquid's own dye and darkens,
      // so a shoreline is a gradient of damp paper, not a cut line.
      const wet = smoothstep(0.06, 0.80, sampleCorner(gf.cWet, gf.cw, gf.ch, u, v));
      if (wet > 0) {
        hex = mixPaper(hex, theme.liquid.deep, wet * 0.44);
        tone *= 1 - wet * 0.15;
      }

      // Terrace lip: where the surface tilts, it catches the light like the
      // cut edge of a sheet. This is what makes the terracing legible from a
      // low camera instead of reading as one plane.
      const slope = 1 - LN[k * 3 + 1];
      const lip = smoothstep(0.012, 0.16, slope);
      tone *= 1 + lip * 0.17;
      hex = mixPaper(hex, theme.ground[0], lip * 0.28);

      // Altitude: the far, high end of the floor sits a touch lighter, which
      // is free depth cueing and agrees with the aerial fog.
      tone *= 1 + ((LH[k] - hf.minH) / hRange) * 0.07;

      // The paver ribbon. Its border is the warped field, so it wanders off
      // the tile grid; a verge of rim paper runs outside the paving proper.
      const paved = LP[k], verge = LV[k];
      if (verge > 0) hex = mixPaper(hex, rimPaper, (verge - paved) * 0.60);
      if (paved > 0) {
        // 2 m flagstone patches: a hashed tone step per patch, interpolated
        // across the lattice, so the paving has stonework in it without a
        // single extra triangle.
        const flag = hash2(Math.floor(u * 2), Math.floor(v * 2), seed + 401);
        let ph = mixPaper(pathPaper, rimPaper, 0.10 + flag * 0.22);
        ph = mixPaper(ph, theme.groundAccent, smoothstep(0.86, 1.0, nB) * 0.18);
        hex = mixPaper(hex, ph, paved);
        tone *= 1 + paved * (0.045 + (flag - 0.5) * 0.07);
      }

      // Feature ('S') tiles wear the floor's special paper.
      const spc = smoothstep(0.28, 0.85, sampleCorner(gf.cSpec, gf.cw, gf.ch, u, v));
      if (spc > 0) hex = mixPaper(hex, theme.special, spc * 0.62);

      // No floor is ever pure paper: a touch of the theme's accent keeps the
      // near-white grounds (the Library's cream, the Frozen Peak's snow) off
      // the top of the range, where a fully lit surface has nowhere left to go
      // and every highlight flattens into one white shape.
      //
      // A flat 0.10 was not enough for the floors whose two ground papers are
      // both near-neutral: the Library's ground measured chroma 2 — literal
      // greyscale, against the island's 29 — because creamD and sand differ
      // only in value, and 10% of lavender on top of that is invisible. Those
      // floors declare their own dose (see LEVEL_THEMES.groundAccentMix) so
      // the ground has a hue to recede in aerial perspective WITH.
      hex = mixPaper(hex, theme.groundAccent, theme.groundAccentMix ?? 0.10);

      // Contact shade against walls — TEAL, per the palette law, and never
      // strong enough to read as an outline. Two terms: a soft one that
      // reaches out over open ground, and a deep one directly under a blocker,
      // where the apron shows between a thin wall and the floor.
      const ao = Math.min(1, sampleCorner(gf.cWall, gf.cw, gf.ch, u, v) * 1.35);
      if (ao > 0) {
        hex = mixPaper(hex, PAPER.shadow, ao * 0.26);
        tone *= 1 - ao * 0.09;
      }
      const under = smoothstep(0.10, 0.92, sampleCorner(gf.cBlock, gf.cw, gf.ch, u, v));
      if (under > 0) {
        hex = mixPaper(hex, PAPER.shadow, under * 0.52);
        tone *= 1 - under * 0.26;
      }

      // The shoulder outside the footprint walks into shade as it falls away,
      // so the level reads as a cut-out sitting in haze rather than as a plain
      // that happens to be occluded.
      const out = smoothstep(0, GROUND_MARGIN || 1, outsideBy(u, v));
      if (out > 0) {
        hex = mixPaper(hex, PAPER.shadow, out * 0.46);
        tone *= 1 - out * 0.22;
      }

      // PAPER.shadow is the floor of this world's palette — there is no black
      // in it — so the toning above may approach that teal but never pass
      // through it. Clamping the ALBEDO here, before any light touches it, is
      // what makes that a property of the data rather than a hope about the
      // lighting rig.
      const c = paperLinear(hex, Math.min(1.12, tone));
      LC[k * 3] = Math.max(c[0], SHADOW_LIN[0]);
      LC[k * 3 + 1] = Math.max(c[1], SHADOW_LIN[1]);
      LC[k * 3 + 2] = Math.max(c[2], SHADOW_LIN[2]);
    }
  }

  // ── Emit ───────────────────────────────────────────────────────────────
  const solid = { pos: [], nrm: [], col: [] };
  const trans = { pos: [], nrm: [], col: [] };
  const tiles = groundTiles(level).concat(apronTiles(level));
  // The shoulder ring: every tile of the margin, outside the footprint. Cut
  // from the same lattice as everything else, so it welds to the map edge.
  for (let ty = -MG; ty < height + MG; ty++) {
    for (let tx = -MG; tx < width + MG; tx++) {
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) continue;
      tiles.push({ key: -1, tx, ty, ch: null, transient: null, margin: true });
    }
  }
  /** Tile key over the MARGINED grid — plain `ty*width+tx` cannot hold the
   *  negative coordinates the shoulder occupies. */
  const ckey = (tx, ty) => (ty + MG) * (width + 2 * MG) + (tx + MG);
  const covered = new Set();
  for (const t of tiles) covered.add(ckey(t.tx, t.ty));

  const push = (out, k) => {
    out.pos.push(nodeX(k % lw), LH[k], nodeZ(Math.floor(k / lw)));
    out.nrm.push(LN[k * 3], LN[k * 3 + 1], LN[k * 3 + 2]);
    out.col.push(LC[k * 3], LC[k * 3 + 1], LC[k * 3 + 2]);
  };

  for (const t of tiles) {
    const out = t.transient ? trans : solid;
    for (let b = 0; b < sub; b++) {
      for (let a = 0; a < sub; a++) {
        const i0 = (t.tx + MG) * sub + a, j0 = (t.ty + MG) * sub + b;
        const n00 = j0 * lw + i0, n10 = n00 + 1;
        const n01 = n00 + lw, n11 = n01 + 1;
        // Alternate the split so the surface has no single diagonal grain.
        if ((i0 + j0) & 1) {
          push(out, n00); push(out, n01); push(out, n11);
          push(out, n00); push(out, n11); push(out, n10);
        } else {
          push(out, n00); push(out, n01); push(out, n10);
          push(out, n10); push(out, n01); push(out, n11);
        }
      }
    }
  }

  // ── Skirts: the only vertical ground geometry left ─────────────────────
  // Winding is DERIVED from the outward direction rather than assumed from a
  // vertex order — that assumption is what produced the white seams.
  const skirtQuad = (out, ka, kb, ox, oz, drop, lipCol, botCol) => {
    let a = ka, b = kb;
    const ex = ((b % lw) - (a % lw)) * gspan;
    const ez = (Math.floor(b / lw) - Math.floor(a / lw)) * gspan;
    if (-ez * ox + ex * oz < 0) { a = kb; b = ka; }
    const ax = nodeX(a % lw), az = nodeZ(Math.floor(a / lw));
    const bx = nodeX(b % lw), bz = nodeZ(Math.floor(b / lw));
    const ay = LH[a], by = LH[b];
    // A hand-authored normal tilted 40% skyward: a dead-vertical normal drops
    // a cut edge onto the toon ramp's darkest step, which would put a black
    // band around the floor — precisely what the palette law forbids.
    const nl = Math.hypot(ox, 0.42, oz) || 1;
    const nrm = [ox / nl, 0.42 / nl, oz / nl];
    const quad = (y0a, y0b, y1a, y1b, cTop, cBot) => {
      const A0 = [ax, y0a, az], B0 = [bx, y0b, bz];
      const A1 = [ax, y1a, az], B1 = [bx, y1b, bz];
      const put = (p, c) => {
        out.pos.push(p[0], p[1], p[2]);
        out.nrm.push(nrm[0], nrm[1], nrm[2]);
        out.col.push(c[0], c[1], c[2]);
      };
      put(A0, cTop); put(A1, cBot); put(B1, cBot);
      put(A0, cTop); put(B1, cBot); put(B0, cTop);
    };
    quad(ay, by, ay - SKIRT_LIP, by - SKIRT_LIP, lipCol, lipCol);
    quad(ay - SKIRT_LIP, by - SKIRT_LIP, ay - drop, by - drop, lipCol, botCol);
  };

  // The cut edge of the sheet, and the shade under it. Both are pulled toward
  // PAPER.shadow and NEITHER is brighter than the surface above it — a bright
  // band at the foot of a wall is exactly the pale line this whole rework
  // exists to remove, and the palette law says the deepest thing in the frame
  // goes teal, never toward black and never toward white.
  // Both are pure LERPS toward PAPER.shadow, never scaled sums: a lerp is
  // bounded below by its endpoints, so the deepest pixel on a floor lands ON
  // the palette's shadow teal and cannot slide past it into something the game
  // has no colour for.
  const toShadow = (k, t) => [
    LC[k * 3] + (SHADOW_LIN[0] - LC[k * 3]) * t,
    LC[k * 3 + 1] + (SHADOW_LIN[1] - LC[k * 3 + 1]) * t,
    LC[k * 3 + 2] + (SHADOW_LIN[2] - LC[k * 3 + 2]) * t,
  ];
  const lipOf = (k) => toShadow(k, 0.34);
  const botOf = (k) => toShadow(k, 0.82);

  for (const t of tiles) {
    const out = t.transient ? trans : solid;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.tx + dx, ny = t.ty + dz;
      if (covered.has(ckey(nx, ny))) continue;
      for (let s = 0; s < sub; s++) {
        let ka, kb;
        if (dx !== 0) {
          const i = (t.tx + MG) * sub + (dx > 0 ? sub : 0);
          ka = ((t.ty + MG) * sub + s) * lw + i;
          kb = ka + lw;
        } else {
          const j = (t.ty + MG) * sub + (dz > 0 ? sub : 0);
          ka = j * lw + (t.tx + MG) * sub + s;
          kb = ka + 1;
        }
        skirtQuad(out, ka, kb, dx, dz, SKIRT_DEPTH, lipOf(ka), botOf(ka));
      }
    }
  }

  const freeze = (o) => (o.pos.length ? {
    position: new Float32Array(o.pos),
    normal: new Float32Array(o.nrm),
    color: new Float32Array(o.col),
  } : null);

  return {
    solid: freeze(solid) || { position: new Float32Array(0), normal: new Float32Array(0), color: new Float32Array(0) },
    transient: freeze(trans),
    sub,
    vertices: nodes,
    triangles: (solid.pos.length + trans.pos.length) / 9,
  };
}

// ── Ground scatter ─────────────────────────────────────────────────────────
//
// The island's ground reads as a place because things are LYING on it. A floor
// gets the same treatment, themed: tufts and petals in the Garden, shells and
// pebbles in Ebbport, fallen pages in the Library. Everything here is a
// placement record — level3d.js owns the six triangles each one is cut from —
// so the mix, the density and the palette stay unit-testable.

/**
 * Weighted scatter mix per theme key. Weights need not sum to 1.
 *
 * Every floor now runs FOUR archetypes, not three, and every archetype is cut
 * in three geometry variants (level3d.js `buildDetail`). Three shapes covering
 * a floor is still three shapes: the eye finds the repeat in about a second,
 * and once it has, the whole field collapses into a texture. Twelve shapes,
 * each at three sizes and an arbitrary lean, does not resolve.
 */
export const SCATTER_MIX = {
  garden:  [['tuft', 0.44], ['petal', 0.20], ['leaf', 0.18], ['pebble', 0.18]],
  ebbport: [['pebble', 0.36], ['shell', 0.26], ['tuft', 0.24], ['leaf', 0.14]],
  sky:     [['petal', 0.36], ['crystal', 0.24], ['pebble', 0.26], ['tuft', 0.14]],
  // The Ember Caves' scatter WAS several hundred identical cones. It is now a
  // basalt chip, a vent ember, a glass shard and a flat ash flake — and the
  // flake matters most, because a field with nothing lying FLAT in it has one
  // horizon and reads as a pincushion.
  ember:   [['pebble', 0.32], ['ember', 0.28], ['crystal', 0.16], ['leaf', 0.24]],
  frost:   [['crystal', 0.36], ['pebble', 0.28], ['petal', 0.22], ['tuft', 0.14]],
  prism:   [['crystal', 0.38], ['pebble', 0.26], ['petal', 0.22], ['shell', 0.14]],
  market:  [['pebble', 0.32], ['tuft', 0.28], ['petal', 0.26], ['page', 0.14]],
  library: [['page', 0.34], ['petal', 0.26], ['pebble', 0.26], ['leaf', 0.14]],
  mending: [['petal', 0.34], ['page', 0.30], ['pebble', 0.22], ['tuft', 0.14]],
};

/**
 * How close two clump centres may come, in tiles, and how far a centre may
 * wander out of the tile that seeded it.
 *
 * These two numbers together are the "poisson-ish" in the brief. WANDER larger
 * than half a tile is what decouples placement from the tile grid at all — a
 * centre seeded in tile (7,3) can land in (6,4) — and SEP is what stops the
 * wandered centres from piling into each other, which is the only thing a pure
 * jitter cannot do. The result is over-dispersed at CLUMP scale and strongly
 * clustered at PIECE scale, which is what real ground cover looks like.
 *
 * SEP is 0.86 tiles — 3.4 m — against a clump whose members fall inside 0.18 to
 * 0.60 tiles of their centre, so two clumps never merge into a mat, and WANDER
 * is 0.92, which is wider than a tile: a centre seeded in tile (7,3) can end up
 * anywhere in a 3.7 m square that is not centred on any tile at all. Measured
 * index of dispersion after both: 2.0 to 3.0 at tile scale and 3.6 to 5.7 at
 * 8 m, against 0.64 to 0.93 (i.e. sub-Poisson — a grid) on five of the nine
 * floors before.
 */
export const CLUMP_SEP = 0.86;
export const CLUMP_WANDER = 0.92;

/** Which paper each scatter archetype is cut from, given a theme. */
function scatterPaper(kind, theme, r) {
  const acc = theme.crownPapers;
  switch (kind) {
    case 'tuft':   return r < 0.5 ? theme.ground[0] : theme.groundAccent;
    case 'leaf':   return r < 0.5 ? theme.groundAccent : theme.ground[1];
    case 'petal':  return acc[(r * acc.length) | 0] ?? theme.special;
    case 'pebble': return r < 0.5 ? theme.pathRim : theme.ground[1];
    case 'shell':  return r < 0.5 ? PAPER.cream : theme.pathRim;
    case 'crystal':return r < 0.5 ? theme.special : theme.liquid.shallow;
    case 'ember':  return r < 0.5 ? theme.special : theme.liquid.mid;
    case 'page':   return r < 0.5 ? PAPER.cream : theme.pathRim;
    default:       return theme.ground[0];
  }
}

/**
 * Deterministic ground dressing for one floor.
 *
 * ── THE LATTICE, AND WHY THE LAST FIX DID NOT TAKE ─────────────────────────
 * The Ember Caves shipped as "several hundred identical yellow cones on a
 * visible lattice", and the pass before this one already added clumping to
 * stop exactly that. It did not work, and the reason is at the BOTTOM of the
 * old function, not the top: after clumping the floor, the result was thinned
 * to the instance cap with a Bresenham stride over the emitted array. That
 * array is in row-major tile order, so keeping every k-th element is a
 * PERFECTLY REGULAR subsample of the floor — a lattice, reimposed by the
 * budget code, on top of a field that had just been carefully clustered. The
 * measured index of dispersion (occupancy variance / mean, 1.0 for a Poisson
 * field, below 1 for a grid) came out at 0.64-0.93 on five of the nine floors:
 * the scatter was measurably MORE regular than random.
 *
 * So the budget is now spent in whole CLUMPS, chosen by hash, before a single
 * member is emitted. Dropping a clump leaves a bare patch, which is what bare
 * ground looks like; dropping every fourth piece leaves a thinner lattice.
 *
 * ── WHAT REPLACES IT ───────────────────────────────────────────────────────
 *   1. Clump centres wander up to CLUMP_WANDER tiles out of the tile that
 *      seeded them, so placement is not a function of the grid at all, and are
 *      rejected within CLUMP_SEP of an accepted centre (a spatial hash, i.e.
 *      Bridson's test without Bridson's queue). Poisson-disc at clump scale.
 *   2. Members inside a clump fall on a sqrt-radius disc around the centre, so
 *      they are dense in the middle and sparse at the rim.
 *   3. Every piece carries a VARIANT (three geometries per archetype), a lean,
 *      a full roll and a non-uniform stretch, on top of the three size classes
 *      and the hue walk. A cone that is always vertical and always the same
 *      cone is a decal; one of nine, leaning, at four aspect ratios, is not.
 *
 * Density still clumps on low-frequency noise, thickens along the VERGE of a
 * path — the band just outside the paving, where a real verge grows — and
 * stays OFF the paving, because the ribbon is the player's guide.
 *
 * @returns {Array<{kind:string,variant:number,x:number,z:number,y:number,
 *                  yaw:number,tilt:number,roll:number,scale:number,
 *                  stretch:number,hex:number,tone:number}>}
 */
export function groundScatter(level, hf, theme, sampleHeight, opts = {}) {
  const density = opts.density ?? 1;
  const cap = opts.cap ?? 1300;
  const { width, height } = level;
  const seed = level.id * 7919;
  const gf = groundFields(level);
  const mix = SCATTER_MIX[theme.key] || SCATTER_MIX.garden;
  const total = mix.reduce((a, m) => a + m[1], 0);
  const vergeBias = theme.vergeBias ?? 0.24;
  const tiles = groundTiles(level);
  // Per-tile density is normalised against the floor's size, not fixed: the
  // Garden is 212 walkable tiles and is walked at arm's length, floor 9 is
  // 1110 and is mostly seen across a room. A fixed rate leaves the small
  // floors swept bare and blows the big ones past the instance budget.
  const norm = Math.min(6.5, 1500 / Math.max(1, tiles.length));
  // Hot spots — the vents on floor 4, empty everywhere else. A clump that
  // lands near one is kept preferentially and grows larger, which is what
  // gives the Ember Caves an ember FIELD around each vent instead of an even
  // dusting of cones over the whole plain.
  const hot = theme.glow ? ventSpots(level, hf) : [];

  // ── 1. CLUMP CENTRES, POISSON-DISC ─────────────────────────────────────
  // The separation widens as the quality tier thins the floor, so a low tier
  // is a SPARSER field of the same clumps rather than the same field with
  // holes punched in it — which is the one way a quality dial can turn a
  // designed scatter back into a lattice.
  const dq = Math.min(1, Math.max(0.05, density));
  const sepCell = CLUMP_SEP / Math.pow(dq, 0.75);
  const grid = new Map();
  const key = (i, j) => i * 8191 + j;
  /** True (and records the point) if (u,v) is CLUMP_SEP clear of every
   *  accepted centre. 3x3 cell scan; the cell size IS the separation, so no
   *  accepted point can be missed. */
  function accept(u, v) {
    const ci = Math.floor(u / sepCell), cj = Math.floor(v / sepCell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const bucket = grid.get(key(ci + di, cj + dj));
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b += 2) {
          const dx = bucket[b] - u, dy = bucket[b + 1] - v;
          if (dx * dx + dy * dy < sepCell * sepCell) return false;
        }
      }
    }
    const k = key(ci, cj);
    let bucket = grid.get(k);
    if (!bucket) { bucket = []; grid.set(k, bucket); }
    bucket.push(u, v);
    return true;
  }

  /** @type {Array<object>} */
  const centres = [];
  const SIZE_CLASS = [[0.42, 0.20, 0.44], [0.82, 0.34, 0.38], [1.35, 0.58, 0.18]];
  for (const t of tiles) {
    if (t.transient) continue;
    // Squared twice, not once: the old field was a gentle swell that never
    // reached zero, so every tile in the floor got something and the "clumps"
    // sat in a uniform matrix of singletons. A quartic leaves genuinely bare
    // ground between the thickets, and bare ground is half of what makes the
    // thickets read as thickets.
    const cn = valueNoise(t.tx, t.ty, 3.2, level.id + 71);
    let field = cn * cn * cn * (0.20 + 3.4 * cn);
    // Vent proximity, floor 4 only.
    for (const v of hot) {
      const d = Math.hypot(t.tx + 0.5 - v.u, t.ty + 0.5 - v.v);
      if (d < 5.5) field += (1 - d / 5.5) * 1.7;
    }
    const want = field * density * norm * 1.15;
    if (want <= 0) continue;
    const r = tileRandom(t.tx, t.ty, level.id * 131 + 17);
    // At most two attempts per tile; both may wander out of it and both may be
    // rejected by the separation test. The expected yield is well under one
    // per tile, which is the point — the grid stops being visible when most of
    // its cells are empty.
    const tries = want > 1.4 ? 2 : 1;
    for (let ci = 0; ci < tries; ci++) {
      if (r() > Math.min(0.92, want)) continue;
      const cu = t.tx + 0.5 + (r() - 0.5) * 2 * CLUMP_WANDER;
      const cv = t.ty + 0.5 + (r() - 0.5) * 2 * CLUMP_WANDER;
      if (cu < 0.1 || cv < 0.1 || cu > width - 0.1 || cv > height - 0.1) continue;
      if (!accept(cu, cv)) continue;
      let pick = r() * total, kind = mix[0][0];
      for (const [k, w] of mix) { pick -= w; if (pick <= 0) { kind = k; break; } }
      centres.push({
        u: cu, v: cv, kind,
        members: Math.max(3, Math.round(
          (4 + r() * 10 * Math.min(1.4, 0.5 + want * 0.5)) * (0.30 + 0.70 * dq))),
        spread: 0.18 + r() * 0.42,
        rank: hash2(t.tx * 13 + ci, t.ty * 7, level.id + 4211),
        seed: (level.id * 131 + 17 + ci * 7717 + t.tx * 31 + t.ty * 131) | 0,
        tx: t.tx, ty: t.ty, ci,
      });
    }
  }

  // ── 2. BUDGET IN WHOLE CLUMPS ──────────────────────────────────────────
  // See the header. Never decimate members: a uniform subsample of a clustered
  // field is a lattice, and that is literally what shipped.
  let projected = 0;
  for (const c of centres) projected += c.members;
  if (projected > cap * 1.25) {
    centres.sort((a, b) => a.rank - b.rank);
    let acc = 0, n = 0;
    while (n < centres.length && acc < cap) { acc += centres[n].members; n++; }
    centres.length = n;
  }
  // Emission order must not depend on the sort above, or the instanced meshes
  // would reorder between two identical builds in a way that is fine for the
  // renderer and maddening for a screenshot diff.
  centres.sort((a, b) => (a.ty - b.ty) || (a.tx - b.tx) || (a.ci - b.ci));

  // ── 3. MEMBERS ─────────────────────────────────────────────────────────
  const out = [];
  for (const c of centres) {
    const r = tileRandom(c.tx, c.ty, c.seed);
    for (let i = 0; i < c.members; i++) {
      const a = r() * TAU, rad = c.spread * Math.sqrt(r());
      const u = c.u + Math.cos(a) * rad;
      const v = c.v + Math.sin(a) * rad;
      const { paved, verge } = pavedAt(gf, u, v, seed);
      if (paved > 0.30) continue;                            // keep the guide clear
      const wet = sampleCorner(gf.cWet, gf.cw, gf.ch, u, v);
      if (wet > 0.55) continue;                              // that is the water, not the bank
      // POSITIVE vergeBias grows a verge along the shoulder of the ribbon;
      // NEGATIVE clears a band either side of it. Floor 4 is the reason the
      // sign matters — see LEVEL_THEMES.
      if (r() > 0.90 + (verge - paved) * vergeBias) continue;
      // Three size classes, weighted so big ones are rare: 0.42 to ~1.93 is a
      // 4.6x span, against a flat uniform draw that produced one apparent size.
      let sp = r(), cls = SIZE_CLASS[0];
      for (const cc of SIZE_CLASS) { sp -= cc[2]; if (sp <= 0) { cls = cc; break; } }
      const scale = cls[0] + r() * cls[1];
      const x = (u - width / 2) * TILE_M;
      const z = (v - height / 2) * TILE_M;
      const g = r();
      // Hue walk: mix up to 16% toward one of two neighbouring papers, which
      // lands each piece within about +/-8% of the family colour. A field of
      // one exact hex is the other half of the wallpaper read.
      const basePaper = scatterPaper(c.kind, theme, g);
      const hex = mixPaper(basePaper,
        r() < 0.5 ? theme.groundAccent : theme.pathRim, r() * 0.16);
      out.push({
        kind: c.kind,
        // Which of the three cut geometries this piece wears. Rolled per
        // PIECE, not per clump: a clump of nine identical cones is still a
        // field of identical cones, it is just a smaller one.
        variant: (r() * 3) | 0,
        // The DRAWN surface, relief included — a pebble placed on the collider
        // height alone is a pebble half buried in a swell.
        x, z, y: sampleHeight(x, z) + groundRelief(u, v, seed, paved),
        yaw: r() * TAU,
        // Lean and roll. Nothing in nature stands perfectly upright and
        // nothing in a papercut world should either; a field of plumb-vertical
        // cones advertises the transform that placed them.
        tilt: (r() - 0.5) * 0.62,
        roll: r() * TAU,
        scale,
        // Aspect. Two pieces at the same `scale` are still visibly different
        // objects if one is 40% taller than it is wide and the other is squat.
        stretch: 0.62 + r() * 0.92,
        hex,
        tone: 0.90 + r() * 0.24,
      });
    }
  }
  return out;
}

/**
 * THE VENTS: where the Ember Caves are lit from.
 *
 * A cave is not a dark room, it is a room lit from a few places you can point
 * at. Floor 4 had no such places — its ground was one even red field — so
 * `theme.glow` opts a floor into a small set of hot spots, chosen on open
 * ground, spread apart, and away from the spawn so the establishing shot looks
 * TOWARD them rather than standing on one.
 *
 * Pure placement: level3d.js cuts the glow cards and the scatter above thickens
 * around them, so a vent is a light, a colour and a thicket of embers, from one
 * list of coordinates.
 *
 * @returns {Array<{u:number,v:number,x:number,z:number,y:number,r:number}>}
 */
export function ventSpots(level, hf, opts = {}) {
  const want = opts.count ?? 7;
  const { width, height, startX, startY } = level;
  const tiles = groundTiles(level).filter((t) => !t.transient);
  if (!tiles.length) return [];
  const picked = [];
  // Greedy farthest-point, seeded off the tile hash so it is deterministic and
  // so two vents never land in the same room.
  for (let n = 0; n < want; n++) {
    let best = null, bestScore = -Infinity;
    for (const t of tiles) {
      const ds = Math.hypot(t.tx - startX, t.ty - startY);
      if (ds < 4) continue;
      let near = Infinity;
      for (const p of picked) near = Math.min(near, Math.hypot(t.tx - p.tx, t.ty - p.ty));
      if (near < 6) continue;
      const score = Math.min(18, near === Infinity ? 18 : near)
        + Math.min(10, ds) * 0.5
        + hash2(t.tx, t.ty, level.id + 6161) * 6;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) break;
    picked.push(best);
  }
  return picked.map((t) => {
    const c = tileCenter(t.tx, t.ty, width, height);
    return {
      u: t.tx + 0.5, v: t.ty + 0.5,
      x: c.x, z: c.z,
      y: hf.tileH[t.ty * width + t.tx],
      r: 1.7 + hash2(t.tx, t.ty, level.id + 7171) * 1.9,
    };
  });
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
  const { width, height, code, transformTiles, secretTiles, startX, startY } = level;
  const theme = themeForFloor(level.id);
  const [hMin, hMax] = theme.wallH;
  const fronted = wallHasFront(theme.wall);
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (code[y][x] !== 'W') continue;
      const k = y * width + x;
      // THE BOUNDARY RING IS NEVER CULLED. Everything else here is culled to
      // tiles that face something walkable, because a wall buried in walls has
      // no silhouette — but the map's outer ring is the one run whose whole job
      // is to be seen from far away, and on the two ARCHIPELAGO floors it was
      // being deleted wholesale. Ebbport and the Shattered Sky are islands in a
      // field of 'Q', so not one of their 132 and 128 perimeter tiles touches
      // walkable ground, and the cull took floor 3 down to NINE wall tiles in
      // the entire level and floor 2 to forty. Those two floors had no
      // enclosure at all: the horizon was open sky straight to the fog, which
      // is exactly the "lawn with furniture" read, and it was worst on the two
      // floors that already had the least geometry.
      //
      // This is geometry only. `levelColliders` still culls on facesOpenSpace,
      // so the ring adds no collider, no BFS change and no route change — the
      // tiles it restores are ones no player can ever reach or touch.
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (!onBorder && !facesOpenSpace(level, x, y)) continue;
      const r0 = hash2(x, y, level.id);
      const r1 = hash2(x, y, level.id + 101);
      const r2 = hash2(x, y, level.id + 202);
      const r3 = hash2(x, y, level.id + 303);
      const r4 = hash2(x, y, level.id + 404);
      const r5 = hash2(x, y, level.id + 515);
      const r6 = hash2(x, y, level.id + 626);
      const r7 = hash2(x, y, level.id + 737);
      const c = tileCenter(x, y, width, height);
      const mask = wallNeighbourMask(level, x, y);
      const topo = wallTopology(mask);

      // ── YAW ────────────────────────────────────────────────────────────
      // The old jitter was +/-0.065 rad. On a 4 m tile that moves a corner by
      // 13 cm, which is not a silhouette, it is a rounding error — neighbours
      // stayed flush and a run of tiles came out as one extruded box. It is
      // now +/-0.42 rad, a quarter turn either way, which genuinely breaks the
      // join between tiles.
      //
      // THE CATCH, and why the footprint scales with it: a square of half-size
      // a swept to yaw t reaches a*(|cos t| + |sin t|) into the corridor. At
      // 0.42 rad that is 1.36a, so a tile-sized ply would poke 0.75 m past the
      // 2.3 m collider and the hero would walk through the corner of a hedge.
      // Shrinking the ply by most of that factor turns a rotated tile into a
      // SMALLER, turned sheet of paper — which is the papercut read anyway.
      // Only 72% of the correction is applied, so neighbours still overlap
      // instead of opening a slot you can see the sky through; the worst-case
      // swept half-diagonal comes out at 2.06 m against the 2.3 m collider,
      // against 2.19 m on the build this replaces.
      //
      // The BOUNDARY RING is exempt and takes almost no yaw at all. It is the
      // one run that must be airtight: turned tiles leave slivers between
      // neighbours, and on an interior run a sliver is a cut edge with more
      // hedge behind it, while on the perimeter it is a hairline of bare SKY —
      // a hole straight out of the world, which is the same defect the ground
      // shoulder exists to prevent. So the ring keeps its yaw tiny and its
      // plies slightly oversized, and buys its relief from the stepped plinth
      // instead (see ringPedestal).
      //
      // RAISED AGAIN, and this is the third time, so here is the measurement
      // rather than the adjective: on the build this replaces the free-standing
      // vocabularies took ±0.42 rad and the fronted ones ±0.11 rad. It is now
      // WALL_YAW_JIT = ±0.52 (±30°) and WALL_YAW_JIT_FRONT = ±0.24 (±14°), so
      // two neighbours can differ by sixty degrees and no pair in a run reads
      // as parallel. 85% of the sweep correction is applied rather than 72%,
      // which keeps the worst-case swept half-diagonal PLUS the new lateral
      // lean at 2.37 m against the 2.36 m the old build already reached: the
      // silhouette got much louder and what the player can bump into did not
      // move at all.
      const ring = onBorder;
      const yawSpan = ring ? WALL_YAW_JIT_RING
        : (fronted ? WALL_YAW_JIT_FRONT : WALL_YAW_JIT);
      const yawJit = (r0 - 0.5) * 2 * yawSpan;
      const sweep = Math.abs(Math.cos(yawJit)) + Math.abs(Math.sin(yawJit));
      const shrink = ring ? 1 : 1 + (sweep - 1) * 0.85;
      const yaw = wallFaceYaw(level, x, y, theme.wall) + yawJit;

      // ── HEIGHT ─────────────────────────────────────────────────────────
      // Two thirds smooth noise so NEIGHBOURS AGREE IN BANDS (a run swells and
      // sags like something grown), one third per-tile hash so no two adjacent
      // tiles share a top edge, then a per-tile multiplier of -20/+18% on top
      // of that: the authored band is only 0.47 m wide, and 0.47 m of variation
      // spread over a forty-tile run is a straight line with texture on it.
      // The multiplier rides its own hash so height does not correlate with the
      // in-tile offset — a run whose tall tiles all lean the same way is a new
      // pattern, not the absence of one.
      const undulate = 0.34 * r0 + 0.66 * valueNoise(x, y, 3.1, level.id);
      const bend = (topo.corner || topo.junction) ? 0.10 : 0;
      const banded = Math.min(WALL_H_MAX,
        Math.max(WALL_H_MIN, hMin + (hMax - hMin) * undulate + bend * (hMax - hMin)));
      let h = Math.min(WALL_H_TALL,
        Math.max(WALL_H_SHORT, banded * (1 + (r4 - 0.5) * 2 * WALL_H_JIT)));

      // ── THE BOUNDARY RING ──────────────────────────────────────────────
      // The outermost ring of wall is raised to 4.8-6.4 m. Every floor used to
      // end in a picket fence of 2.9 m cuboids on the horizon with open sky
      // above it, which is why they read as furniture on a lawn rather than as
      // enclosures — TotK never lets you see the edge of the world. The rise
      // fades out within four tiles of the spawn, because the establishing
      // shot must not open on a six-metre wall in the player's face.
      //
      // `theme.ringH` overrides the band. The Ember Caves are a CAVE, and a
      // cave is defined by the thing over your head being nearer than the
      // horizon, so its rim runs to eleven metres and takes the sky with it.
      const ringBand = theme.ringH || RING_H;
      if (ring) {
        const nearSpawn = smoothstep(1.5, 5.0, Math.hypot(x - startX, y - startY));
        const tall = ringBand[0] + (ringBand[1] - ringBand[0]) * r2;
        h += (tall - h) * nearSpawn;
      }

      // ── PLANTERS AND RUBBLE ────────────────────────────────────────────
      // Roughly one straight run tile in four drops below hero eyeline, and
      // half of THOSE drop to rubble rather than to a planter. A low pile of
      // broken slabs is a different object from a trough, and two archetypes
      // is the difference between "this run has gaps in it" and "this run has
      // the same gap in it eleven times". Only straight deg-2 tiles qualify: a
      // bend or a junction is where a run needs its post, and punching the
      // hole there reads as damage rather than as design. See planterProfile
      // and rubbleProfile: this is the gap you see the landmark through.
      const low = !ring && topo.straight && r3 > 0.72;
      const planter = low && r5 < 0.5;
      const rubble = low && !planter;
      if (low) h = PLANTER_H[0] + (PLANTER_H[1] - PLANTER_H[0]) * r1;

      // ── THE GAP TILE ───────────────────────────────────────────────────
      // See WALL_GAP_RATE. Roughly a third of the interior run loses the
      // full-span footing ply that hides the join with its neighbour, and
      // stands WALL_GAP_SHRINK narrower besides, so the eye reads discrete
      // pieces of paper rather than one extrusion with lines drawn on it.
      const gap = !ring && !low && r6 < WALL_GAP_RATE;

      // ── THE SLIDE ──────────────────────────────────────────────────────
      // Along the run, a big offset; across it, a small one. See the budget
      // block at WALL_SLIDE_ALONG. The offsets are authored in WORLD metres and
      // counter-rotated into tile-local space here, because the stamp rotates
      // them by the tile yaw and "along the run" must not depend on how far
      // this particular tile happens to be turned.
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const jA = (r1 - 0.5) * 2, jB = (r2 - 0.5) * 2;
      let wx, wz, intrude;
      if (ring) {
        wx = jA * 0.05; wz = jB * 0.05; intrude = 0;
      } else if (topo.straight && topo.axis === 'x') {
        wx = jA * WALL_SLIDE_ALONG; wz = jB * WALL_SLIDE_ACROSS;
        intrude = Math.abs(wz);          // only the across component can intrude
      } else if (topo.straight && topo.axis === 'z') {
        wx = jB * WALL_SLIDE_ACROSS; wz = jA * WALL_SLIDE_ALONG;
        intrude = Math.abs(wx);
      } else {
        // A bend, a junction or an end has no "along": every direction it could
        // move in is either into more wall or into the corridor, and the tile
        // does not know which without asking. So it slides freely and pays for
        // it in the reach clamp below — which is the same bargain the yaw
        // already strikes, and it is why the two can both be large.
        wx = jA * WALL_SLIDE_FREE; wz = jB * WALL_SLIDE_FREE;
        intrude = Math.hypot(wx, wz);
      }

      // ── THE REACH CLAMP ────────────────────────────────────────────────
      // See WALL_REACH_MAX. A ply of half-width a at yaw t reaches a*sweep at
      // its corner; add whatever the tile slid toward the corridor and shrink
      // until the total fits. Authored variance in, constant collision out.
      let sx = (ring ? 1.04 + r0 * 0.06 : 0.96 + r0 * 0.12) / shrink;
      if (!ring) {
        const swept = WALL_SPAN * 0.5 * sx * sweep;
        if (swept + intrude > WALL_REACH_MAX) {
          sx *= Math.max(0.42, (WALL_REACH_MAX - intrude) / swept);
        }
      }

      out.push({
        key: k, tx: x, ty: y, x: c.x, z: c.z,
        y: hf.tileH[k],
        h,
        mask, topo, planter, rubble, low, gap, ring,
        variant: (r1 * 3) | 0,
        yaw,
        ox: wx * cy - wz * sy,
        oz: wx * sy + wz * cy,
        // The ring runs a touch oversized so neighbours overlap outright; an
        // interior tile has already been shrunk to fit WALL_REACH_MAX above.
        sx,
        tint: r2,
        // Per-tile COLOUR. `hue` is how far and which way the tile's whole
        // paper stack is walked toward one of the floor's accent papers,
        // `accIdx` picks which accent, `val` shifts its value. A floor used to
        // be cut from seven to ten hexes in total; this is what makes forty
        // tiles forty sheets of paper instead of forty prints of one.
        hue: (r5 - 0.5) * 2,
        val: (r7 - 0.5) * 2,
        accIdx: (r6 * 997) | 0,
        seed: (level.id * 7919 + 331) | 0,
        transient: transformTiles.has(k) ? 'transform' : (secretTiles.has(k) ? 'secret' : null),
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE LANDMARK TIER
//
// ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
// Nothing in any floor was taller than 2.9 m. Not one thing. The wall band
// capped there, the boss dais topped out at 4 m of which 2.6 was ground, and
// there was no class of object above either — so every floor had a perfectly
// flat skyline, no focal point, no "over there", and no reason for the camera
// to ever look up. Odyssey and TotK both navigate by silhouette: you see the
// thing, you walk to the thing. A level with no tall thing has no navigation
// and no composition; it has a plan view of furniture.
//
// ── WHY LANDMARKS ARE HOSTED ON WALL TILES ─────────────────────────────────
// A 15 m tower dropped on walkable ground is a new collider, a new hole in the
// BFS field, and a new way to strand a five-year-old behind a thing that is not
// on the map. Hosting on a wall tile that already faces open space means the
// collider is the one that was always there, the route is bit for bit the route
// the 2D floor shipped with, and the tower grows out of the run it stands in —
// a topiary tower in the hedge, a vent chimney in the basalt, a stack column in
// the shelving. Zero gameplay surface, and it costs no draw call either: the
// pieces merge into the wall chunk the host tile already belongs to.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Primary landmark height band, metres, and the secondary masts'.
 *
 * Raised from [14, 18] because the interior wall band was widened to reach
 * 3.62 m (see WALL_H_JIT): the landmark's whole job is to be unmistakably
 * ABOVE everything else in the floor, and the architecture test holds it to at
 * least four times the tallest interior wall. `theme.landmarkH` overrides the
 * band for a floor whose enclosure is itself tall — the Ember Caves' rim runs
 * to eleven metres, so its vent chimney has to clear twenty-five before it
 * reads as the thing you navigate by rather than as part of the wall.
 */
export const LANDMARK_H = [15.6, 20.5];
export const MAST_H = [6.2, 9.0];
/** Tiles a mast must keep from the spawn, from the primary, and from another
 *  mast. Three towers in a heap is one tower. */
export const MAST_MIN_SPAWN = 6;
export const MAST_MIN_PRIMARY = 8;
export const MAST_MIN_MAST = 9;
/** How many masts a floor gets, at most. */
export const MAST_COUNT = 3;

/** A plied, tapered shaft: the body every landmark shares. Returns the top y. */
function shaft(out, ctx, y0, y1, rad0, rad1, plies, seg) {
  const { dark, mid, light, r } = ctx;
  let y = y0;
  for (let i = 0; i < plies; i++) {
    const f0 = i / plies, f1 = (i + 1) / plies;
    const ya = y0 + (y1 - y0) * f0, yb = y0 + (y1 - y0) * f1;
    const ra = rad0 + (rad1 - rad0) * f0, rb = rad0 + (rad1 - rad0) * f1;
    const paper = i === 0 ? dark : (i === plies - 1 ? light : mid);
    P(out, (r() - 0.5) * 0.22, (r() - 0.5) * 0.22, ya, yb, ra, rb * 0.99, seg, paper,
      { tone: 0.92 + i * (0.14 / plies), rot: r() * 0.9 });
    // A shadow collar between courses — the papercut tell at tower scale, and
    // the thing that stops a 15 m shaft reading as one extruded pipe.
    P(out, 0, 0, yb - PLY_GAP * 1.6, yb + PLY_GAP * 1.6, rb * 1.06, rb * 1.06, seg,
      mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX), { rot: r() * 0.9 });
    y = yb;
  }
  return y;
}

/**
 * One landmark's piece list, in tile-local metres above the host tile's ground.
 * Same record shape the wall vocabulary emits, so level3d.js stamps it with the
 * same code path and it merges into the same chunk.
 */
export function landmarkProfile(spec, theme) {
  const stack = theme.wallStack || theme.wallPlies;
  const ctx = {
    dark: stack[0], mid: stack[1], light: stack[2],
    crown: theme.wallTop ?? stack[2],
    acc: theme.crownPapers,
    r: tileRandom(spec.tx, spec.ty, 91733 + spec.tier * 17),
  };
  const { dark, mid, light, crown, acc, r } = ctx;
  const out = [];
  const H = spec.h;
  const R = Math.min(2.05, 0.86 + H * 0.055);      // stays inside the collider
  // A skirt at wall height so the tower does not stand in a hole in its run.
  P(out, 0, 0, -0.4, spec.wallH * 0.72, R * 1.42, R * 1.20, 8, dark, { tone: 0.93 });
  P(out, 0, 0, spec.wallH * 0.70, spec.wallH * 0.86, R * 1.30, R * 1.16, 8, mid, { tone: 0.98 });
  const y0 = spec.wallH * 0.80;

  switch (spec.kind) {
    case 'topiary': {
      // Floor 1 — a clipped topiary tower: three tiers of foliage on a trunk,
      // each tier wider than the neck below it, flowers on the top tier.
      const trunkTop = shaft(out, ctx, y0, y0 + (H - y0) * 0.34, R * 0.62, R * 0.46, 2, 8);
      let y = trunkTop;
      const tiers = 3;
      for (let i = 0; i < tiers; i++) {
        const f = i / (tiers - 1);
        const th = (H - trunkTop) * (0.30 - f * 0.05);
        const rad = R * (1.32 - f * 0.42);
        P(out, 0, 0, y, y + th * 0.5, rad * 0.72, rad, 9, i === tiers - 1 ? light : mid,
          { tone: 0.96 + i * 0.03, rot: r() * 0.7 });
        P(out, 0, 0, y + th * 0.46, y + th, rad, rad * 0.55, 9, i === tiers - 1 ? crown : light,
          { tone: 1.0 + i * 0.03, rot: r() * 0.7 });
        P(out, 0, 0, y + th + 0.02, y + th + 0.16, rad * 0.30, rad * 0.26, 7, mid, { tone: 0.94 });
        y += th + 0.14;
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + r();
        P(out, Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, y - 0.5, y - 0.2,
          0.22, 0.18, 5, acc[i % acc.length], { tone: 1.05 });
      }
      P(out, 0, 0, y - 0.1, y + 0.8, R * 0.30, R * 0.14, 6, crown, { tone: 1.06 });
      break;
    }
    case 'lighthouse': {
      // Floor 2 — a harbour light on the ruin: banded shaft, flared gallery,
      // a lantern room you can see from the far end of the floor.
      const top = shaft(out, ctx, y0, H * 0.80, R, R * 0.58, 5, 10);
      P(out, 0, 0, top, top + 0.42, R * 0.86, R * 1.00, 10, light, { tone: 1.02 });  // gallery
      P(out, 0, 0, top + 0.40, top + 0.54, R * 1.06, R * 1.02, 10,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, top + 0.52, H * 0.96, R * 0.62, R * 0.58, 8, acc[0], { tone: 1.08 }); // lantern
      P(out, 0, 0, H * 0.94, H * 1.06, R * 0.72, R * 0.20, 8, crown, { tone: 1.04 });    // cap
      break;
    }
    case 'chimney': {
      // Floor 4 — a real vent chimney. Hexagonal like the basalt it grows out
      // of, leaning, with a lit mouth: the Ember Caves finally have an ember.
      const top = shaft(out, ctx, y0, H * 0.84, R * 1.06, R * 0.50, 5, 6);
      P(out, 0, 0, top - 0.1, top + 0.9, R * 0.56, R * 0.86, 6, light,
        { tone: 1.02, tilt: 0.05 });                                                   // flared mouth
      P(out, 0, 0, top + 0.80, top + 1.02, R * 0.88, R * 0.80, 6,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, top + 0.92, top + 1.36, R * 0.70, R * 0.40, 6, crown, { tone: 1.10 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + r();
        P(out, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9,
          H * (0.30 + r() * 0.4), H * (0.36 + r() * 0.4), 0.24, 0.13, 5,
          acc[i % acc.length], { tone: 1.08 });                                        // vent flares
      }
      // THE PLUME. A chimney without smoke is a pipe, and the plume is the
      // only part of this floor's silhouette that is not made of rock — it
      // reads at any distance, it leans (so the level has a prevailing wind and
      // therefore a direction), and it carries the eye ABOVE the tower, which
      // is what makes a 17 m object feel like 25 m of world. Cut from the same
      // cream/white stock as the sky so it sits in the aerial perspective
      // rather than on top of it, and each puff is a flattened prism with a
      // shadow underside — layered paper, not a particle.
      {
        let py = top + 1.3;
        let px = 0, pz = 0;
        const lean = 0.42 + r() * 0.20;                 // metres of drift per puff
        const dir = r() * TAU;
        const cd = Math.cos(dir), sd = Math.sin(dir);
        for (let i = 0; i < 5; i++) {
          const f = i / 4;
          const rad = R * (0.52 + f * 0.95) * (0.86 + r() * 0.28);
          const thick = 0.55 + f * 0.75;
          px += cd * lean * (1 + f * 1.7);
          pz += sd * lean * (1 + f * 1.7);
          // Underside first, dragged to shadow: a puff with a dark belly is a
          // volume; a puff of one flat colour is a sticker.
          P(out, px, pz, py, py + thick * 0.30, rad * 0.80, rad,
            7, mixPaper(PAPER.creamD, PAPER.shadow, PLY_SHADOW_MIX * 0.9),
            { rot: r() * 0.9 });
          P(out, px, pz, py + thick * 0.26, py + thick,
            rad, rad * (0.62 - f * 0.12), 7, i < 2 ? PAPER.creamD : PAPER.cream,
            { tone: 1.0 + f * 0.06, rot: r() * 0.9 });
          if (i === 0) {                                 // the lit throat of it
            P(out, px, pz, py - 0.35, py + 0.45, rad * 0.46, rad * 0.34, 6,
              acc[0], { tone: 1.10 });
          }
          py += thick * (0.80 + r() * 0.25);
        }
      }
      break;
    }
    case 'stack': {
      // Floor 8 — a central stack column: book slabs rotating as they climb, so
      // the silhouette is a spiral instead of a pipe.
      let y = y0;
      const courses = Math.max(6, Math.round(H / 2.0));
      for (let i = 0; i < courses; i++) {
        const f = i / (courses - 1);
        const ch = (H - y0) / courses;
        const w = R * 2 * (1.05 - f * 0.42);
        const paper = i === courses - 1 ? crown : (i % 2 ? light : mid);
        B(out, 0, 0, y, y + ch * 0.86, w, w * 0.82, paper,
          { tone: 0.94 + f * 0.16, rot: i * 0.34 + r() * 0.1 });
        B(out, 0, 0, y + ch * 0.84, y + ch * 0.94, w * 1.04, w * 0.86,
          mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX), { rot: i * 0.34 });
        if (i % 2 === 0) {
          B(out, 0, 0, y + ch * 0.18, y + ch * 0.62, w * 1.03, w * 0.30,
            acc[i % acc.length], { tone: 1.02, rot: i * 0.34 + 0.2 });                 // spine band
        }
        y += ch;
      }
      P(out, 0, 0, y - 0.1, y + 1.0, R * 0.44, R * 0.18, 6, crown, { tone: 1.06 });
      break;
    }
    case 'tether': {
      // Floor 3 — a FLOATING spire, held down by ribbons.
      //
      // The gap is the entire idea. Every other silhouette in this build grows
      // out of the ground, so the eye reads it as terrain and stops; a shape
      // with daylight underneath it cannot be terrain, and on the one floor
      // whose fantasy is that the world came apart, the landmark should be the
      // proof. The ribbons are what make the gap legible — without a line
      // crossing it the spire just looks badly placed.
      const anchorTop = y0 + 1.10;
      P(out, 0, 0, y0 - 0.3, anchorTop, R * 1.24, R * 0.98, 8, mid, { tone: 0.96 });
      P(out, 0, 0, anchorTop - 0.09, anchorTop + 0.09, R * 1.06, R * 1.06, 8,
        mixPaper(mid, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, anchorTop, anchorTop + 0.34, R * 0.92, R * 0.74, 8, light, { tone: 1.0 });

      // The island the spire stands on, hanging in the air: a shallow inverted
      // cone so it has a visible UNDERSIDE, which is the whole read.
      const gap = (H - anchorTop) * 0.20;
      const isleY = anchorTop + gap;
      P(out, 0, 0, isleY, isleY + (H - isleY) * 0.10, R * 0.20, R * 1.22, 9, dark,
        { tone: 0.90 });
      P(out, 0, 0, isleY + (H - isleY) * 0.085, isleY + (H - isleY) * 0.125,
        R * 1.28, R * 1.24, 9, mixPaper(dark, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, isleY + (H - isleY) * 0.11, isleY + (H - isleY) * 0.20,
        R * 1.22, R * 1.02, 9, light, { tone: 1.02 });

      const bodyY = isleY + (H - isleY) * 0.18;
      const top = shaft(out, ctx, bodyY, H * 0.84, R * 0.94, R * 0.30, 4, 7);
      P(out, 0, 0, top - 0.2, top + 0.5, R * 0.58, R * 0.70, 7, light, { tone: 1.03 });
      P(out, 0, 0, top + 0.46, top + 0.60, R * 0.74, R * 0.68, 7,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, top + 0.56, H * 1.06, R * 0.50, R * 0.14, 6, crown, { tone: 1.06 });

      // RIBBONS across the gap: long thin leaning slabs from the anchor rim up
      // to the underside of the isle. Three, at three angles, in three papers.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + r() * 0.8;
        const rr = R * 1.02;
        B(out, Math.cos(a) * rr, Math.sin(a) * rr,
          anchorTop - 0.2, isleY + (H - isleY) * 0.09,
          0.20, 0.07, acc[i % acc.length], { tone: 1.04, rot: a, tilt: 0.16 });
      }
      // and a few loose ones streaming off the isle, so the gap has traffic.
      for (let i = 0; i < 3; i++) {
        const a = i * 2.4 + r();
        const yy = bodyY + (top - bodyY) * (0.26 + i * 0.26);
        B(out, Math.cos(a) * R * 1.0, Math.sin(a) * R * 1.0, yy, yy + 1.9,
          R * 1.35, 0.09, acc[(i + 1) % acc.length], { tone: 1.05, rot: a, tilt: 0.22 });
      }
      break;
    }
    case 'obelisk': {
      // Floor 5 — a SHATTERED ice obelisk. A four-sided monolith cut in plied
      // courses, snapped a third of the way up: the upper block is offset and
      // leaning off the break, and the piece that came away is planted in the
      // ground beside it. A monolith that is merely tall is a domino; the break
      // is what gives it a story and three separate silhouette events.
      const breakAt = y0 + (H - y0) * 0.42;
      let y = y0, w = R * 1.55;
      const lower = 4;
      for (let i = 0; i < lower; i++) {
        const f = (i + 1) / lower;
        const y1 = y0 + (breakAt - y0) * f;
        const ww = w * (1 - f * 0.16);
        const paper = i === lower - 1 ? light : (i % 2 ? mid : dark);
        B(out, (r() - 0.5) * 0.16, (r() - 0.5) * 0.16, y, y1, ww, ww * 0.88, paper,
          { tone: 0.90 + i * 0.05, rot: 0.18 + (r() - 0.5) * 0.05 });
        B(out, 0, 0, y1 - 0.10, y1 + 0.10, ww * 1.05, ww * 0.93,
          mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX), { rot: 0.18 });
        y = y1;
      }
      // The break face — raked, bright, and the widest thing on the tower.
      B(out, 0, 0, breakAt - 0.15, breakAt + 0.55, w * 0.92, w * 0.84, crown,
        { tone: 1.05, rot: 0.18, tilt: 0.22 });
      // The upper block, shunted off the break and leaning.
      let uy = breakAt + 0.45;
      const shove = R * 0.42;
      const upper = 4;
      for (let i = 0; i < upper; i++) {
        const f = (i + 1) / upper;
        const y1 = uy + (H - 0.9 - uy) * (f - (i ? (i) / upper : 0));
        const yb = breakAt + 0.45 + (H - 0.9 - breakAt - 0.45) * f;
        const ww = w * (0.80 - f * 0.34);
        const paper = i === upper - 1 ? crown : (i % 2 ? light : mid);
        B(out, shove * (0.4 + f * 0.9), shove * 0.25 * f, uy, yb, ww, ww * 0.88, paper,
          { tone: 0.96 + i * 0.04, rot: 0.18 + f * 0.22, tilt: 0.10 + f * 0.05 });
        B(out, shove * (0.4 + f * 0.9), shove * 0.25 * f, yb - 0.09, yb + 0.09,
          ww * 1.06, ww * 0.94, mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX),
          { rot: 0.18 + f * 0.22 });
        uy = yb;
        void y1;
      }
      // The tip: a raked shard, not a flat top.
      P(out, shove * 1.3, shove * 0.25, uy - 0.2, H * 1.04, w * 0.30, w * 0.05, 4, crown,
        { tone: 1.07, tilt: 0.18, rot: 0.5 });
      // Shards driven into the ground round the foot, at four lengths.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + r() * 0.9;
        const sh = (H - y0) * (0.10 + r() * 0.16);
        P(out, Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5, y0 - 0.3, y0 + sh,
          R * (0.22 + r() * 0.12), R * 0.03, 4,
          i % 2 ? light : acc[i % acc.length],
          { tone: 1.0 + r() * 0.08, tilt: 0.18 + r() * 0.26, rot: a });
      }
      break;
    }
    case 'cluster': {
      // Floor 6 — a giant REFRACTING crystal cluster. Not one spire: seven
      // points of wildly different length and rake sharing a plied plinth, so
      // the silhouette is a bristle you could not confuse with anything else on
      // any other floor. The two tallest carry the crown paper; the short ones
      // are there to make the tall ones read as tall.
      P(out, 0, 0, y0 - 0.4, y0 + 0.9, R * 1.70, R * 1.46, 7, dark, { tone: 0.90 });
      P(out, 0, 0, y0 + 0.82, y0 + 1.00, R * 1.52, R * 1.48, 7,
        mixPaper(dark, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, y0 + 0.94, y0 + 1.55, R * 1.44, R * 1.16, 7, mid, { tone: 0.97 });
      const base = y0 + 1.35;
      const pts = [
        [0.00, 0.00, 0.30, 1.00, 0.00],
        [-0.62, -0.34, 0.24, 0.78, 0.16],
        [0.58, -0.20, 0.21, 0.63, 0.20],
        [0.20, 0.62, 0.23, 0.86, 0.13],
        [-0.30, 0.58, 0.17, 0.47, 0.26],
        [0.66, 0.34, 0.14, 0.36, 0.30],
        [-0.70, 0.16, 0.12, 0.28, 0.34],
      ];
      for (let i = 0; i < pts.length; i++) {
        const [ox, oz, rad, top, rake] = pts[i];
        const tip = base + (H - base) * top * (0.94 + r() * 0.12);
        const paper = i === 0 ? crown : (i === 3 ? crown : (i % 2 ? light : mid));
        // Each point is TWO plies with a shadow collar, not one cone: a 15 m
        // crystal cut from a single tapered prism is a traffic cone.
        const mids = base + (tip - base) * 0.46;
        P(out, ox * R, oz * R, base, mids, R * rad, R * rad * 0.72, 5, mid,
          { tone: 0.93 + i * 0.02, tilt: rake, rot: r() * 1.2 });
        P(out, ox * R, oz * R, mids - 0.12, mids + 0.12, R * rad * 0.80, R * rad * 0.78, 5,
          mixPaper(mid, PAPER.shadow, PLY_SHADOW_MIX), { tilt: rake });
        P(out, ox * R, oz * R, mids, tip, R * rad * 0.72, R * rad * 0.06, 5, paper,
          { tone: 1.0 + i * 0.02, tilt: rake, rot: r() * 1.2 });
      }
      // Chips floating off the cluster — the refraction, in cut paper.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + r();
        const yy = base + (H - base) * (0.30 + i * 0.16);
        P(out, Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5, yy, yy + 0.6 + r() * 0.5,
          0.30, 0.06, 4, acc[i % acc.length],
          { tone: 1.08, tilt: (r() - 0.5) * 0.7, rot: a });
      }
      break;
    }
    case 'belltower': {
      // Floor 7 — a CLOCK AND BELL TOWER over the stalls. A market needs a
      // civic object: the one thing in Coinford taller than a canvas awning,
      // and the thing a child navigates by ("meet me under the clock"). Four
      // stages, each narrower than the last, then an open belfry with a real
      // bell hanging in it and a pennant on the cap.
      const stages = 4;
      let y = y0, w = R * 1.62;
      for (let i = 0; i < stages; i++) {
        const f = (i + 1) / stages;
        const y1 = y0 + (H * 0.62 - y0) * f;
        const ww = w * (1 - f * 0.26);
        const paper = i === stages - 1 ? light : (i % 2 ? mid : dark);
        B(out, 0, 0, y, y1, ww, ww, paper, { tone: 0.91 + i * 0.05, rot: i * 0.05 });
        // A proud string course between stages — the papercut tell, and what
        // stops four boxes reading as one box.
        B(out, 0, 0, y1 - 0.14, y1 + 0.14, ww * 1.10, ww * 1.10,
          mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX), { rot: i * 0.05 });
        B(out, 0, 0, y1 + 0.10, y1 + 0.30, ww * 1.07, ww * 1.07, light, { tone: 1.0 });
        y = y1 + 0.24;
      }
      // THE CLOCK FACE, on all four sides so it reads from any approach.
      const clockY = y0 + (H * 0.62 - y0) * 0.80;
      const faceR = w * 0.40;
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * TAU;
        const cx = Math.cos(a) * w * 0.60, cz = Math.sin(a) * w * 0.60;
        P(out, cx, cz, clockY - faceR, clockY + faceR, faceR * 1.06, faceR * 1.06, 9,
          crown, { tone: 1.04, rot: a, tilt: Math.PI / 2 });
        P(out, cx * 1.06, cz * 1.06, clockY - faceR * 0.84, clockY + faceR * 0.84,
          faceR * 0.84, faceR * 0.84, 9, PAPER.white, { tone: 1.06, rot: a, tilt: Math.PI / 2 });
        // Hands: two thin slabs at an honest ten-past-ten, which is what every
        // clock in every illustration reads, because it looks like a smile.
        B(out, cx * 1.12, cz * 1.12, clockY - 0.05, clockY + faceR * 0.62, faceR * 0.13, 0.07,
          acc[0], { tone: 1.02, rot: a + 0.55 });
        B(out, cx * 1.12, cz * 1.12, clockY - 0.05, clockY + faceR * 0.44, faceR * 0.13, 0.07,
          acc[0], { tone: 1.02, rot: a - 0.7 });
      }
      // THE BELFRY: four corner posts, open air between them, a bell inside.
      const belY = y;
      const belH = (H - y) * 0.46;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        B(out, Math.cos(a) * w * 0.52, Math.sin(a) * w * 0.52, belY, belY + belH,
          w * 0.20, w * 0.20, mid, { tone: 0.95, rot: a });
      }
      P(out, 0, 0, belY + belH * 0.30, belY + belH * 0.86, w * 0.30, w * 0.44, 8,
        acc[1], { tone: 1.06 });                                              // the bell
      B(out, 0, 0, belY + belH * 0.84, belY + belH * 0.98, w * 0.16, w * 0.16, dark);
      // Cap: a stepped pyramid of three plies, then the pennant.
      let cy2 = belY + belH;
      for (let i = 0; i < 3; i++) {
        const f = i / 3;
        const ch2 = (H * 0.98 - cy2) * 0.42;
        B(out, 0, 0, cy2, cy2 + ch2, w * (1.14 - f * 0.40), w * (1.14 - f * 0.40),
          i === 2 ? crown : light, { tone: 1.0 + i * 0.03, rot: 0.10 * i, tilt: 0 });
        B(out, 0, 0, cy2 + ch2 - 0.09, cy2 + ch2 + 0.09,
          w * (1.18 - f * 0.40), w * (1.18 - f * 0.40),
          mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX), { rot: 0.10 * i });
        cy2 += ch2;
      }
      B(out, 0, 0, cy2, H * 1.02, w * 0.10, w * 0.10, dark);
      B(out, w * 0.42, 0, H * 0.90, H * 1.00, w * 0.80, 0.08, acc[0], { tone: 1.06 });
      break;
    }
    case 'banner': {
      // Floor 7's old primary, kept as a MAST: pennants at three heights,
      // which is a skyline made of cloth and costs nine boxes.
      const top = shaft(out, ctx, y0, H * 0.92, R * 0.60, R * 0.26, 4, 6);
      for (let i = 0; i < 3; i++) {
        const yy = y0 + (top - y0) * (0.34 + i * 0.24);
        const a = i * 2.1 + r();
        B(out, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, yy, yy + 1.5,
          R * 1.5, 0.10, acc[i % acc.length], { tone: 1.04, rot: a, tilt: 0.10 });
      }
      P(out, 0, 0, top, top + 1.0, R * 0.34, R * 0.15, 6, crown, { tone: 1.06 });
      break;
    }
    // ── THE MAST FAMILY ────────────────────────────────────────────────────
    // Secondary 6-9 m structures. These used to be the PRIMARY's profile at a
    // smaller scale, which quietly cancelled the primary: four copies of one
    // tower means none of them is "the" tower, and the eye has no reason to
    // pick the far one. A mast is therefore a different OBJECT — same paper,
    // same floor, subordinate silhouette — so the hero structure stays
    // singular and the middle distance still has something in it.
    case 'tree': {
      // Floor 1 — an old flowering tree. Leaning trunk, three canopy lobes at
      // three heights, blossom.
      const lean = (r() - 0.5) * 0.16;
      const trunk = shaft(out, ctx, y0, y0 + (H - y0) * 0.44, R * 0.42, R * 0.30, 2, 7);
      B(out, 0, 0, y0, trunk, R * 0.20, R * 0.20, dark, { tone: 0.92, tilt: lean });
      let cy3 = trunk;
      for (let i = 0; i < 3; i++) {
        const f = i / 2;
        const rad = R * (1.15 - f * 0.34);
        const th2 = (H - trunk) * (0.34 - f * 0.06);
        const ox2 = Math.cos(i * 2.3 + r()) * R * 0.22;
        const oz2 = Math.sin(i * 2.3 + r()) * R * 0.22;
        P(out, ox2, oz2, cy3, cy3 + th2 * 0.56, rad * 0.70, rad, 8,
          i === 2 ? light : mid, { tone: 0.95 + i * 0.04, rot: r() * 0.8 });
        P(out, ox2, oz2, cy3 + th2 * 0.52, cy3 + th2 * 0.66, rad * 1.03, rad * 1.00, 8,
          mixPaper(mid, PAPER.shadow, PLY_SHADOW_MIX));
        P(out, ox2, oz2, cy3 + th2 * 0.62, cy3 + th2, rad, rad * 0.52, 8,
          i === 2 ? crown : light, { tone: 1.0 + i * 0.03, rot: r() * 0.8 });
        cy3 += th2 * 0.72;
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + r();
        P(out, Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, cy3 - 0.4, cy3 - 0.12,
          0.20, 0.16, 5, acc[i % acc.length], { tone: 1.06 });
      }
      break;
    }
    case 'shipmast': {
      // Floor 2 — a wreck's mast still standing in the shallows: leaning pole,
      // one spar, a torn sail and two stays. Ebbport's whole fiction in nine
      // pieces, and it says "the sea was here" from across the floor.
      const lean = 0.10 + r() * 0.07;
      const top = shaft(out, ctx, y0, H * 0.90, R * 0.34, R * 0.16, 3, 6);
      const spY = y0 + (top - y0) * 0.62;
      B(out, 0, 0, spY, spY + 0.22, R * 2.4, R * 0.16, mid, { tone: 0.97, rot: r() * TAU, tilt: lean * 0.5 });
      // The sail: one big torn slab hanging off the spar, with a shadow edge.
      B(out, R * 0.30, 0, spY - (top - y0) * 0.34, spY + 0.05, R * 1.7, 0.10, light,
        { tone: 1.02, rot: 0.2, tilt: -0.06 });
      B(out, R * 0.30, 0, spY - (top - y0) * 0.36, spY - (top - y0) * 0.33, R * 1.74, 0.13,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX), { rot: 0.2 });
      for (let i = 0; i < 2; i++) {                                       // stays
        const a = i ? 0.9 : -1.9;
        B(out, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, y0, spY, 0.10, 0.07,
          dark, { tone: 0.94, rot: a, tilt: 0.26 });
      }
      P(out, 0, 0, top - 0.1, top + 0.5, R * 0.24, R * 0.09, 5, crown, { tone: 1.05 });
      B(out, R * 0.5, 0, top - 0.6, top - 0.1, R * 0.9, 0.07, acc[0], { tone: 1.06, rot: 0.4 });
      break;
    }
    case 'shard': {
      // Floors 3 / 5 / 6 — a single splinter, raked hard. Its job is to be a
      // DIAGONAL: the sky, frost and prism floors are all verticals and the
      // horizon needs one line that is not parallel to the others.
      const rake = 0.16 + r() * 0.16;
      const a0 = r() * TAU;
      P(out, 0, 0, y0 - 0.3, y0 + (H - y0) * 0.22, R * 0.90, R * 0.68, 6, dark,
        { tone: 0.92, rot: r() });
      P(out, 0, 0, y0 + (H - y0) * 0.20, y0 + (H - y0) * 0.25, R * 0.72, R * 0.70, 6,
        mixPaper(dark, PAPER.shadow, PLY_SHADOW_MIX));
      const midY = y0 + (H - y0) * 0.60;
      P(out, 0, 0, y0 + (H - y0) * 0.22, midY, R * 0.66, R * 0.44, 5, mid,
        { tone: 0.97, tilt: rake, rot: a0 });
      P(out, 0, 0, midY - 0.10, midY + 0.10, R * 0.48, R * 0.46, 5,
        mixPaper(mid, PAPER.shadow, PLY_SHADOW_MIX), { tilt: rake });
      P(out, 0, 0, midY, H * 1.02, R * 0.44, R * 0.05, 5, crown,
        { tone: 1.05, tilt: rake, rot: a0 });
      for (let i = 0; i < 2; i++) {
        const a = a0 + 1.6 + i * 2.2;
        const sh = (H - y0) * (0.20 + r() * 0.18);
        P(out, Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, y0, y0 + sh,
          R * 0.22, R * 0.03, 4, i ? light : acc[i % acc.length],
          { tone: 1.04, tilt: 0.24 + r() * 0.24, rot: a });
      }
      break;
    }
    case 'vent': {
      // Floor 4 — a small sibling of the chimney: a squat flared stack with a
      // short plume, so the Ember Caves read as a FIELD of vents rather than
      // one tower on a plain.
      const top = shaft(out, ctx, y0, H * 0.72, R * 0.86, R * 0.44, 3, 6);
      P(out, 0, 0, top - 0.1, top + 0.6, R * 0.50, R * 0.76, 6, light, { tone: 1.02 });
      P(out, 0, 0, top + 0.54, top + 0.70, R * 0.78, R * 0.72, 6,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, top + 0.62, top + 1.0, R * 0.60, R * 0.40, 6, acc[0], { tone: 1.10 });
      let py2 = top + 1.0, px2 = 0, pz2 = 0;
      const dir2 = r() * TAU, cd2 = Math.cos(dir2), sd2 = Math.sin(dir2);
      for (let i = 0; i < 3; i++) {
        const f = i / 2;
        const rad = R * (0.44 + f * 0.62);
        px2 += cd2 * 0.36 * (1 + f); pz2 += sd2 * 0.36 * (1 + f);
        P(out, px2, pz2, py2, py2 + 0.20, rad * 0.82, rad, 6,
          mixPaper(PAPER.creamD, PAPER.shadow, PLY_SHADOW_MIX * 0.9), { rot: r() });
        P(out, px2, pz2, py2 + 0.17, py2 + 0.72, rad, rad * 0.56, 6, PAPER.creamD,
          { tone: 1.0 + f * 0.05, rot: r() });
        py2 += 0.68;
      }
      break;
    }
    case 'pylon': {
      // Floors 8 / 9 — a stepped stack of plied slabs, each turned on the one
      // below, with a lamp on top. Reads as built rather than grown, which is
      // what the Library and the Mending Room are.
      let y2 = y0;
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const f = i / (steps - 1);
        const sh2 = (H * 0.86 - y0) / steps;
        const w2 = R * 1.5 * (1.0 - f * 0.46);
        const paper = i === steps - 1 ? crown : (i % 2 ? light : mid);
        B(out, 0, 0, y2, y2 + sh2 * 0.84, w2, w2 * 0.86, paper,
          { tone: 0.93 + f * 0.14, rot: i * 0.42 + r() * 0.1 });
        B(out, 0, 0, y2 + sh2 * 0.80, y2 + sh2 * 0.92, w2 * 1.07, w2 * 0.92,
          mixPaper(paper, PAPER.shadow, PLY_SHADOW_MIX), { rot: i * 0.42 });
        y2 += sh2;
      }
      B(out, 0, 0, y2, y2 + 0.5, R * 0.20, R * 0.20, dark, { tone: 0.94 });
      P(out, 0, 0, y2 + 0.42, H * 1.02, R * 0.44, R * 0.20, 6, acc[0], { tone: 1.08 });
      break;
    }
    default: {
      // 'spire' — the generic: a faceted needle with a collar and a floating
      // cap. Used by the mending floor's manuscript spire.
      const top = shaft(out, ctx, y0, H * 0.78, R, R * 0.34, 5, 7);
      P(out, 0, 0, top - 0.2, top + 0.5, R * 0.62, R * 0.74, 7, light, { tone: 1.02 });
      P(out, 0, 0, top + 0.46, top + 0.60, R * 0.78, R * 0.72, 7,
        mixPaper(light, PAPER.shadow, PLY_SHADOW_MIX));
      P(out, 0, 0, top + 0.56, H * 1.04, R * 0.52, R * 0.16, 6, crown, { tone: 1.05 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + r();
        P(out, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05,
          H * (0.44 + i * 0.13), H * (0.56 + i * 0.13), 0.26, 0.14, 5,
          acc[i % acc.length], { tone: 1.06, tilt: (r() - 0.5) * 0.5 });
      }
      break;
    }
  }
  return out;
}

/**
 * Where a floor's landmarks stand.
 *
 * ONE primary at the objective end — the thing you navigate by — plus up to
 * three secondary masts spread across the rest of the floor so the middle
 * distance has a silhouette too. Every host is a wall tile that already faces
 * open space, so nothing here adds a collider or changes a route.
 *
 * @returns {Array<{tx:number,ty:number,x:number,z:number,y:number,h:number,
 *                  kind:string,tier:number,wallH:number}>}
 */
export function landmarkSpecs(level, hf, theme, dist) {
  const { width, height, code, objects, startX, startY } = level;
  // Two host pools. INTERIOR hosts are wall tiles that face somewhere the
  // player can stand, so a tower on one is a tower in the level. RIM hosts are
  // the map's outer ring, which on the archipelago floors is the ONLY wall
  // there is — floor 3 has just nine interior hosts in a 30x34 map, so without
  // a rim pool its masts had nowhere to go and it got one mast instead of
  // three. The rim is a fallback, never a preference: a mast on the perimeter
  // is a horizon event, and horizon events do not furnish a middle distance.
  const hosts = [];
  const rim = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (code[y][x] !== 'W') continue;
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (facesOpenSpace(level, x, y)) hosts.push({ x, y });
      else if (onBorder) rim.push({ x, y });
    }
  }
  if (!hosts.length && !rim.length) return [];
  if (!hosts.length) hosts.push(...rim);

  // The anchor: the boss if the floor has one, else the exit, else the tile the
  // distance field says is furthest from the spawn — in every case, the end of
  // the level, which is where the thing you walk toward has to be.
  let ax = startX, ay = startY;
  const boss = objects.find((o) => o.type === 'boss');
  const exit = objects.find((o) => o.type === 'exit');
  if (boss) { ax = boss.x; ay = boss.y; }
  else if (exit) { ax = exit.x; ay = exit.y; }
  else {
    let best = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (groundCharAt(level, x, y) === null) continue;
        const d = dist[y * width + x];
        if (d > best) { best = d; ax = x; ay = y; }
      }
    }
  }

  const wallHOf = (x, y) => {
    const r0 = hash2(x, y, level.id);
    const [hMin, hMax] = theme.wallH;
    return hMin + (hMax - hMin) * (0.34 * r0 + 0.66 * valueNoise(x, y, 3.1, level.id));
  };
  const rec = (h, tier, kind, x, y) => ({
    tx: x, ty: y,
    x: tileCenter(x, y, width, height).x,
    z: tileCenter(x, y, width, height).z,
    y: hf.tileH[y * width + x],
    h, tier, kind, wallH: wallHOf(x, y),
  });

  // Primary: the host nearest the anchor, but never right on top of it.
  let prim = null, primD = Infinity;
  for (const hst of hosts) {
    const d = Math.hypot(hst.x - ax, hst.y - ay);
    if (d < 1.4) continue;
    if (d < primD) { primD = d; prim = hst; }
  }
  if (!prim) prim = hosts[0];
  const lmBand = theme.landmarkH || LANDMARK_H;
  const ph = lmBand[0] + (lmBand[1] - lmBand[0]) * hash2(prim.x, prim.y, level.id + 77);
  const out = [rec(ph, 0, theme.landmark || 'spire', prim.x, prim.y)];

  // Masts: greedy farthest-point over the remaining hosts, so three of them
  // land in three different parts of the floor rather than in one clump.
  // Interior hosts are tried first and the rim is only opened up if the floor
  // could not seat MAST_COUNT of them — see the two pools above.
  const chosen = [];
  const mastKind = theme.mast || theme.landmark || 'spire';
  const pick = (pool) => {
    let best = null, bestScore = -Infinity;
    for (const hst of pool) {
      if (Math.hypot(hst.x - startX, hst.y - startY) < MAST_MIN_SPAWN) continue;
      if (Math.hypot(hst.x - prim.x, hst.y - prim.y) < MAST_MIN_PRIMARY) continue;
      let near = Infinity;
      for (const c of chosen) near = Math.min(near, Math.hypot(hst.x - c.x, hst.y - c.y));
      if (near < MAST_MIN_MAST) continue;
      // Prefer high ground and a spread: a mast on the top terrace clears the
      // wall tops around it, which is the entire point of putting it there.
      const score = (near === Infinity ? 40 : near)
        + hf.tileH[hst.y * width + hst.x] * 1.6
        + hash2(hst.x, hst.y, level.id + 909) * 3;
      if (score > bestScore) { bestScore = score; best = hst; }
    }
    return best;
  };
  for (let n = 0; n < MAST_COUNT; n++) {
    const best = pick(hosts) || pick(rim);
    if (!best) break;
    chosen.push(best);
    const mh = MAST_H[0] + (MAST_H[1] - MAST_H[0]) * hash2(best.x, best.y, level.id + 505);
    out.push(rec(mh, n + 1, mastKind, best.x, best.y));
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
 * The hero's entry point: the spawn tile's centre, lifted onto the ground, and
 * — the part that matters — the direction they are FACING when the level fades
 * up.
 *
 * ── THE BUG THIS FUNCTION SHIPPED WITH ─────────────────────────────────────
 * The yaw was `Math.atan2(-c.z, -c.x)`. Everywhere else in the overworld a
 * heading is `Math.atan2(dx, dz)` — controller.js line 89 turns the hero with
 * `Math.atan2(nx, nz)` — so this had its two arguments the wrong way round,
 * which does not rotate a bearing, it MIRRORS it about the 45 degree diagonal.
 * On floor 1 the interior lies at 1.86 rad and the hero was spawned at
 * -0.29 rad: 121 degrees off, i.e. staring into the boundary hedge three
 * metres away.
 *
 * That one swapped pair of arguments is why the establishing shot was a wall.
 * Every other piece of opening-frame composition in this file — the entrance
 * terrace, the landmark at the objective end, the planters you see the
 * landmark through — was aimed at a frame the camera was never pointed at.
 *
 * ── AND WHY IT NOW TAKES AN AIM ────────────────────────────────────────────
 * "Toward the centre" is only a proxy for what the opening shot actually
 * wants, which is the thing the player is meant to walk to. Given the primary
 * landmark's position the spawn looks straight down the level at it, so the
 * first frame is: a 2.2 m step down into the first court, the floor climbing
 * away beyond it, and a 15 m tower on the skyline at the far end. You see the
 * thing, you walk to the thing. Falls back to the (corrected) centre bearing
 * when no aim is supplied, so callers that only want a position still work.
 *
 * @param {{x:number,z:number}} [aim] world point to face — the primary landmark
 */
export function levelSpawn(level, sampleHeight, aim = null) {
  const { width, height, startX, startY } = level;
  const c = tileCenter(startX, startY, width, height);
  const tx = aim ? aim.x - c.x : -c.x;
  const tz = aim ? aim.z - c.z : -c.z;
  const yaw = (tx === 0 && tz === 0) ? 0 : Math.atan2(tx, tz);
  return { x: c.x, y: sampleHeight(c.x, c.z), z: c.z, yaw };
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
