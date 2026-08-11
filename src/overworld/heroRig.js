/**
 * THE REAL HEROES, IN 3D.
 *
 * The complaint this file exists to answer was one sentence long — "The
 * character is not our hero" — and it was correct. The overworld shipped a
 * parametric knight/wizard/bunny built from generic primitives, so a player who
 * had spent an hour with SHADOW, GRAND MAGE or PEPPER walked into the 3D world
 * and met a stranger wearing their class colour. There are fifteen heroes in
 * this game and every one of them already has a face: src/data/heroArt.js holds
 * the v0.2 character bible as papercut draw functions, ply by ply, colour by
 * colour. That art is the identity. Nothing else is.
 *
 * SO WE DO NOT REDRAW THEM — WE TRACE THEM.
 * `traceHeroArt()` runs the hero's real 2D draw function against a RECORDING
 * renderer: an R with the same L / Ld / glow / G surface the canvas renderer
 * exposes, which captures every polygon, disc and hand-rolled path the artist
 * authored — in order, with its colour — and draws nothing. What comes back is
 * the literal cut-paper parts list for that hero: Shadow's five-point helm
 * crest, the Grand Mage's 70-unit hat cone and its five gold stars, Pepper's
 * ears with their pink inners, Duchess's three-point crown. Those outlines are
 * then EXTRUDED (~7 cm of card) and stacked front-to-back in the order the
 * artist drew them, which is the same construction language as the 2D art:
 * later plies sit in front, each with a hairline of teal shadow behind it.
 * A silhouette this file did not invent is a silhouette this file cannot get
 * wrong, and that is the whole design.
 *
 * WHAT TRACING CANNOT GIVE US, AND WHY THAT IS FINE
 * The 2D art is a front-facing card. It has no side, and its limbs are implied:
 * knights show pauldrons where an arm would be, Paladin's legs are under a
 * surcoat and simply are not drawn. A rig needs both. So each node's LARGEST
 * traced ply is laminated — restamped as a short stack of sheets scaled by a
 * superellipse depth profile — which turns a flat card into a form with a real
 * profile without touching the silhouette; and arms, hands, legs and feet are
 * SYNTHESISED underneath the traced decoration, in colours sampled from the
 * hero's own art. Identity from the artist, articulation from the code.
 *
 * PART ASSIGNMENT IS AUTHORED, NOT GUESSED
 * `HERO_KITS` maps each hero's traced ply INDICES to rig nodes. Index, not the
 * wobble seed: seeds repeat inside a single hero (Grand Mage uses 50 for both a
 * shoulder and his hat brim), and a bounding-box heuristic mis-files exactly the
 * plies that matter — a cape spans the whole figure, a sword is taller than the
 * hero. The maps were read off the art file and are checked in heroRig.test.js
 * against the live trace, so a change to heroArt.js that moves a ply fails a
 * test instead of quietly putting a helmet in a boot.
 *
 * PALETTE LAW
 * The character bible predates PAPER and uses its own sibling hex set. Every
 * traced colour is therefore snapped through `snapToPaper()`: nearest PAPER
 * entry by CHROMATICITY (hue + saturation, value ignored) times a scalar that
 * restores the art's original luma. Both halves matter — direction alone would
 * flatten Shadow's #2a6063 and #44888a onto one colour and cost him his value
 * structure; a scalar alone cannot change hue. The result is what the rest of
 * the codebase already means by a papercut ply: a PAPER colour multiplied down
 * (or up), never a stray hex. Shadows stay teal, never grey, never black.
 *
 * SEVEN NODES, EIGHT DRAW CALLS
 * torso / head / flow / armL / armR / legL / legR, plus one contact shadow.
 * The `flow` node is the piece with secondary motion, and it is class-shaped:
 * a wizard's hat, a bunny's ears, a knight's CAPE (his crest is rigid steel and
 * merges into the head, where it costs nothing). Held props ride in the hand
 * node so a staff swings with the arm that holds it, and that arm's swing is
 * damped to 40% because a person carrying a sword does not windmill it.
 *
 * THREE RIGS ON SCREEN
 * Budget is per hero: <=3k triangles, 8 colour-pass draw calls. A leader plus
 * two companions is 24 calls and under 9k triangles. Geometry is built once per
 * heroId and reference-counted in a module cache, so a party of three bunnies
 * of the same kind pays for one.
 *
 * Constraints honoured: three r170 only; no post-processing; no depth-texture
 * reads; no fwidth (SwiftShader law); zero allocation in update(); dispose()
 * releases geometry, materials and the shared cache entry.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { papercutMaterial, paperColor, applyRimLight } from './materials/toon.js';
import { deckleDisc } from './materials/textures.js';
import { KNIGHTS, WIZARDS, BUNNIES } from '../data/heroArt.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. TRACING THE 2D ART
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a hero's papercut draw function instead of rasterising it.
 *
 * The draw functions target `makeRenderer`'s R — `L(pts,color,seed,opts)` for a
 * polygon ply, `Ld(cx,cy,r,...)` for a disc, `glow(...)` for a soft halo, and
 * raw `G` (a CanvasRenderingContext2D) for the handful of star shapes that are
 * easier to write as a path. All four are implemented here as capture, with a
 * 2x3 affine stack so `G.translate/scale/rotate` land where the artist meant.
 *
 * Wobble is deliberately NOT reproduced: the 2D renderer jitters every vertex
 * by a seeded RNG to fake torn paper, which at 2D pixel scale is charm and at
 * 3D extrusion scale is a ragged rim that fights the toon ramp. The deckle in
 * 3D comes from the alpha masks in materials/textures.js instead.
 *
 * Pure: no three, no DOM, no canvas. Returns plain data.
 *
 * @param {{draw:Function}} art an entry from heroArt.js
 * @param {{discSegments?:number}} [opts]
 * @returns {{plies:Array, bounds:{x0:number,x1:number,y0:number,y1:number}}}
 *   plies are `{ kind, pts:[[x,y]...], color, seed, index }` in DRAW ORDER,
 *   in the art's own units with y pointing DOWN (canvas convention).
 */
export function traceHeroArt(art, opts = {}) {
  const seg = opts.discSegments ?? 12;
  const plies = [];
  const stack = [];
  let m = [1, 0, 0, 1, 0, 0];      // [a b c d e f], column-major like canvas
  let sub = [];
  let path = [];
  let fill = '#000000';
  let alpha = 1;

  const mul = (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
  const ap = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const push = (kind, pts, color, seed) => {
    plies.push({ kind, pts, color: String(color || '#000000').toLowerCase(), seed, index: plies.length });
  };

  const G = {
    get fillStyle() { return fill; },
    set fillStyle(v) { fill = v; },
    get globalAlpha() { return alpha; },
    set globalAlpha(v) { alpha = v; },
    save() { stack.push([m.slice(), fill, alpha]); },
    restore() { const s = stack.pop(); if (s) { m = s[0]; fill = s[1]; alpha = s[2]; } },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); },
    beginPath() { path = []; sub = []; },
    moveTo(x, y) { if (sub.length > 2) path.push(sub); sub = [ap(x, y)]; },
    lineTo(x, y) { sub.push(ap(x, y)); },
    closePath() { if (sub.length > 2) { path.push(sub); sub = []; } },
    // Present so a stray call cannot throw; no hero art fills an arc directly.
    arc() {},
    fill() {
      if (sub.length > 2) { path.push(sub); sub = []; }
      for (const p of path) push('path', p, fill, -1);
      path = [];
    },
  };

  const R = {
    G,
    L(pts, color, seed, o) { push('poly', pts.map((p) => ap(p[0], p[1])), color, seed); void o; },
    Lr(x, y, w, h, color, seed, o) {
      R.L([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, seed, o);
    },
    Ld(cx, cy, r, color, seed) {
      const pts = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(ap(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      push('disc', pts, color, seed);
    },
    glow(cx, cy, rx, ry, color) { push('glow', [ap(cx, cy)], color, -2); void rx; void ry; },
    clear() {},
    setSeedFilter() {},
  };

  art.draw(R, 0, 0, 1);

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of plies) {
    if (p.kind === 'glow') continue;
    for (const q of p.pts) {
      if (q[0] < x0) x0 = q[0];
      if (q[0] > x1) x1 = q[0];
      if (q[1] < y0) y0 = q[1];
      if (q[1] > y1) y1 = q[1];
    }
  }
  return { plies, bounds: { x0, x1, y0, y1 } };
}

/** Signed area of a closed polygon (art units). Sign follows winding. */
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. PALETTE LAW — snapping the character bible onto PAPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PAPER colours a hero ply is allowed to be cut from.
 *
 * `shadow` is excluded on purpose: it is the world's drop-shadow tint and
 * reserved for shadow, so a hero surface can never accidentally be made of it.
 * `inkTeal` stays — it is the palette's legal stand-in for black and is what
 * every hero's eyes are cut from.
 */
const PAPER_STOCK = Object.entries(PAPER).filter(([k]) => k !== 'shadow');

const LUMA = (r, gr, b) => 0.2126 * r + 0.7152 * gr + 0.0722 * b;

/** Parse '#rrggbb' (or 'rrggbb') into [r,g,b] 0..255. */
export function parseHex(hex) {
  const s = String(hex).replace('#', '').trim();
  const v = parseInt(s.length === 3
    ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
    : s.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Snap an arbitrary art colour onto the PAPER palette.
 *
 * Two terms, and both are load-bearing:
 *   - CHROMATICITY distance (rgb normalised by its own sum) picks the hue and
 *     saturation family while ignoring value, so a colour is never dragged to a
 *     different hue just because a lighter paper happens to be nearer in raw
 *     RGB.
 *   - a log-ratio penalty on the luma scale prefers the paper that needs the
 *     least multiplying. Without it, every teal in the knight kit collapses
 *     onto `inkTeal` with a huge multiplier — same hue, same result, and the
 *     hero loses the light/dark ply separation that makes him readable at 40px.
 *
 * The returned `shade` is applied exactly the way props.js and vegetation.js
 * already shade their layers (geobuild's `lin`), so the ply is a scalar
 * multiple of a palette colour and the palette law holds.
 *
 * @param {string} hex art colour
 * @returns {{ key:string, int:number, shade:number }}
 */
export function snapToPaper(hex) {
  const [r, g, b] = parseHex(hex);
  const sum = Math.max(1, r + g + b);
  const cr = r / sum, cg = g / sum, cb = b / sum;
  const la = Math.max(1, LUMA(r, g, b));
  let best = null;
  let bestScore = Infinity;
  for (const [key, int] of PAPER_STOCK) {
    const pr = (int >> 16) & 255, pg = (int >> 8) & 255, pb = int & 255;
    const ps = Math.max(1, pr + pg + pb);
    const d = (cr - pr / ps) ** 2 + (cg - pg / ps) ** 2 + (cb - pb / ps) ** 2;
    const ratio = la / Math.max(1, LUMA(pr, pg, pb));
    const score = d + 0.05 * Math.log(ratio) ** 2;
    if (score < bestScore) {
      bestScore = score;
      best = { key, int, shade: Math.min(2.2, Math.max(0.3, ratio)) };
    }
  }
  return best;
}

/** Memoised snap — the same dozen hexes recur across all fifteen heroes. */
const _snapCache = new Map();
function snap(hex) {
  let v = _snapCache.get(hex);
  if (!v) { v = snapToPaper(hex); _snapCache.set(hex, v); }
  return v;
}

/** PAPER int -> linear rgb triple, scaled. Mirrors geobuild's `lin`. */
const _lc = new THREE.Color();
function linOf(hex, extra = 1) {
  const s = snap(hex);
  _lc.setHex(s.int, THREE.SRGBColorSpace).multiplyScalar(s.shade * extra);
  return [_lc.r, _lc.g, _lc.b];
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE KITS — which traced ply belongs to which rig node
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rig nodes a ply can be filed under.
 *   torso  — body, robe, tabard, belly, sash (the default for anything unlisted)
 *   head   — skull/helm/face/eyes, and a knight's rigid crest
 *   crown  — wizard hat, bunny ears (+ crowns): the head's secondary-motion piece
 *   cloak  — knight cape / berserker mantle: the torso's secondary-motion piece
 *   armL/armR — pauldrons, sleeves, paws, and anything HELD (staff, sword, book)
 *   legL/legR — leg cards and boots
 * A hero has EITHER a crown or a cloak, never both — that is what keeps the
 * node count at seven.
 */
export const RIG_NODES = ['torso', 'head', 'flow', 'armL', 'armR', 'legL', 'legR'];

/**
 * Per-hero part maps, keyed by TRACE INDEX (draw order), plus the palette the
 * synthesised limbs are cut from.
 *
 * `prop` names the arm that carries a held object, and exists so that arm's
 * swing can be damped — a hero holding a greatsword at the shoulder must not
 * windmill it through the walk cycle.
 */
export const HERO_KITS = {
  // ── KNIGHTS ──────────────────────────────────────────────────────────────
  'knight-shadow': {
    cls: 'knight', flow: 'cloak', prop: 'armR',
    parts: {
      cloak: [0, 1], legL: [2, 4], legR: [3, 5], torso: [6, 7, 8],
      armL: [9], armR: [10, 11, 12, 13, 14], head: [15, 16, 17, 18, 19, 20],
    },
    pal: { limb: '#2a6063', hand: '#7fb3ae', foot: '#2a6063' },
  },
  'knight-crusader': {
    cls: 'knight', flow: 'cloak', prop: 'armR',
    parts: {
      legL: [0, 2], legR: [1, 3], torso: [4, 5, 6],
      armL: [7, 9, 10], armR: [8, 11, 12], head: [13, 14, 16],
    },
    pal: { limb: '#3c6b4f', hand: '#7d9f6d', foot: '#2a5240' },
  },
  'knight-paladin': {
    cls: 'knight', flow: 'cloak', prop: 'armR',
    parts: {
      torso: [0, 3, 4], legL: [1], legR: [2],
      armL: [5, 11, 12, 13], armR: [6, 7, 8, 9], head: [14, 15, 16, 17],
    },
    pal: { limb: '#7c6fa8', hand: '#9c8fc0', foot: '#2a6063' },
  },
  'knight-berserker': {
    cls: 'knight', flow: 'cloak', prop: 'armR',
    parts: {
      cloak: [0], legL: [1, 3], legR: [2, 4], torso: [5],
      armL: [6], armR: [7, 8, 9], head: [10, 11, 12, 13],
    },
    pal: { limb: '#d06a4d', hand: '#f2bf9a', foot: '#2a6063' },
  },
  'knight-greathelm': {
    cls: 'knight', flow: 'cloak', prop: 'armR',
    parts: {
      cloak: [0], legL: [1, 3], legR: [2, 4], torso: [5],
      armL: [6, 8, 9, 10], armR: [7, 11, 12, 13], head: [14, 15, 16, 18],
    },
    pal: { limb: '#2a6063', hand: '#7fb3ae', foot: '#2a6063' },
  },

  // ── WIZARDS ──────────────────────────────────────────────────────────────
  'wizard-stargazer': {
    cls: 'wizard', flow: 'crown', prop: 'armL',
    parts: {
      torso: [0, 1, 2, 3, 9], armL: [4, 6, 7], armR: [5],
      head: [10, 11, 12], crown: [13, 14, 15, 16, 17, 18],
    },
    pal: { limb: '#7c6fa8', hand: '#f5eedd', foot: '#2a6063' },
  },
  'wizard-toadstool': {
    cls: 'wizard', flow: 'crown', prop: 'armL',
    parts: {
      torso: [0, 1, 2], armL: [3, 5, 6, 7], armR: [4, 9, 10],
      head: [11, 12, 13], crown: [14, 15],
    },
    pal: { limb: '#9bad87', hand: '#f5eedd', foot: '#d9cfb2' },
  },
  'wizard-spellblade': {
    cls: 'wizard', flow: 'crown', prop: 'armR',
    parts: {
      torso: [0, 1, 2], armL: [3, 5], armR: [4, 6, 7, 8],
      head: [10, 11, 12], crown: [13],
    },
    pal: { limb: '#9c8fc0', hand: '#f5eedd', foot: '#44888a' },
  },
  'wizard-bookworm': {
    cls: 'wizard', flow: 'crown', prop: 'armR',
    parts: {
      torso: [0, 1], armL: [2, 4, 5], armR: [3, 6, 7],
      head: [9, 10, 11, 12, 13], crown: [14],
    },
    pal: { limb: '#d9cfb2', hand: '#f5eedd', foot: '#9c8fc0' },
  },
  'wizard-grandmage': {
    cls: 'wizard', flow: 'crown', prop: 'armR',
    parts: {
      torso: [0, 1, 2, 3, 4], armL: [5, 7], armR: [6, 8, 9, 10, 11],
      head: [13, 14, 15], crown: [16, 17, 18, 19, 20, 21, 22],
    },
    pal: { limb: '#7c6fa8', hand: '#f5eedd', foot: '#e39a4a' },
  },

  // ── BUNNIES ──────────────────────────────────────────────────────────────
  'bunny-pepper': {
    cls: 'bunny', flow: 'crown', prop: null,
    parts: {
      legL: [0, 2], legR: [1, 3], torso: [4, 5, 10],
      armL: [6, 8], armR: [7, 9],
      head: [11, 12, 17, 18, 19, 20, 21], crown: [13, 14, 15, 16],
    },
    pal: { limb: '#f5c6d0', hand: '#fdfbf2', foot: '#f5c6d0' },
  },
  'bunny-nova': {
    cls: 'bunny', flow: 'crown', prop: 'armR',
    parts: {
      torso: [0, 3, 4], legL: [1], legR: [2],
      armL: [5, 18], armR: [6, 7, 8, 19],
      head: [10, 11, 14, 15, 16, 17, 20], crown: [12, 13],
    },
    pal: { limb: '#9c8fc0', hand: '#fdfbf2', foot: '#9c8fc0' },
  },
  'bunny-boulder': {
    cls: 'bunny', flow: 'crown', prop: null,
    parts: {
      legL: [0, 2], legR: [1, 3], torso: [4, 5, 7],
      armL: [6, 9], armR: [8, 10],
      head: [11, 12, 15, 16, 17, 18, 19, 20], crown: [13, 14],
    },
    pal: { limb: '#44888a', hand: '#e8dec6', foot: '#2a6063' },
  },
  'bunny-blaze': {
    cls: 'bunny', flow: 'crown', prop: null,
    parts: {
      legL: [0, 2], legR: [1, 3], torso: [4, 5],
      armL: [6, 8], armR: [7, 10],
      head: [12, 13, 20, 21, 22, 23, 24], crown: [14, 15, 16, 17],
    },
    pal: { limb: '#e78f6c', hand: '#f2bf9a', foot: '#e78f6c' },
  },
  'bunny-duchess': {
    cls: 'bunny', flow: 'crown', prop: null,
    parts: {
      torso: [0, 1, 14], legL: [2], legR: [3],
      armL: [4, 5, 6, 7, 8], armR: [9, 10, 11, 12, 13],
      head: [15, 16, 26, 27, 28, 29, 30],
      crown: [17, 18, 19, 20, 21, 22, 23, 24, 25],
    },
    pal: { limb: '#e8dec6', hand: '#f5eedd', foot: '#2a6063' },
  },
};

/** Every hero id this module can build, in roster order. */
export const HERO_RIG_IDS = Object.keys(HERO_KITS);

const ART_BY_ID = {};
for (const a of [...KNIGHTS, ...WIZARDS, ...BUNNIES]) ART_BY_ID[a.id] = a;

/** Fallback hero per class, used when an id cannot be resolved exactly. */
const CLASS_DEFAULT = {
  knight: 'knight-shadow', wizard: 'wizard-stargazer', bunny: 'bunny-pepper',
};

/**
 * Resolve anything the game might hand us — a hero object, a roster id, an
 * evolution-path id ('shadow-assassin'), a bare class name — to a hero id this
 * module has a kit for. A corrupt save must never cost a player their avatar,
 * so this never throws: worst case you get the class's flagship hero.
 *
 * @param {string|{id?:string,class?:string}|null} hero
 * @returns {string} a key of HERO_KITS
 */
export function resolveHeroId(hero) {
  if (!hero) return CLASS_DEFAULT.knight;
  const raw = typeof hero === 'string' ? hero : (hero.id || hero.class || '');
  const s = String(raw).toLowerCase();
  if (HERO_KITS[s]) return s;
  // Evolution ids drop the class prefix ('knight-shadow' -> 'shadow-assassin').
  for (const id of HERO_RIG_IDS) {
    const stem = id.split('-')[1];
    if (s === stem || s.startsWith(stem + '-') || s.includes('-' + stem)) return id;
  }
  const cls = typeof hero === 'object' && hero && hero.class
    ? String(hero.class).toLowerCase()
    : s.includes('wizard') ? 'wizard' : s.includes('bunny') ? 'bunny' : 'knight';
  return CLASS_DEFAULT[cls] || CLASS_DEFAULT.knight;
}

/** Class of a resolved hero id. */
export function heroClassOfId(heroId) {
  return (HERO_KITS[heroId] || HERO_KITS[CLASS_DEFAULT.knight]).cls;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LAYOUT — turning traced art into rig-space measurements
// ═══════════════════════════════════════════════════════════════════════════

/** Default standing height, crown of the head to the sole, in world metres. */
const DEFAULT_HEIGHT = 1.72;

/** Card thickness. ~7 cm reads as paper stock at hero scale, not as a slab. */
const CARD = 0.07;
/** Z-gap between stacked detail cards — enough for a hairline of teal shadow. */
const GAP = 0.012;

/** Form depths per node, as a fraction of the hero's height. */
const FORM_D = { torso: 0.20, head: 0.24, armL: 0.115, armR: 0.115, legL: 0.13, legR: 0.13 };
const FLOW_D = { crown: 0.17, cloak: 0.07 };

/**
 * Measure a traced hero: where the ground is, how tall the figure is, and where
 * every joint pivots — all derived from the art itself, so a hero with a long
 * robe gets a high hip and a hero with tall ears still stands 1.72 m.
 *
 * Pure (arrays and numbers only) and exported so the tests can assert the
 * proportions without building a single triangle.
 *
 * @param {{plies:Array}} traced  output of traceHeroArt
 * @param {object} kit            an entry of HERO_KITS
 * @param {number} height         target world height in metres
 */
export function measureHero(traced, kit, height = DEFAULT_HEIGHT) {
  const byNode = binPlies(traced, kit);
  const box = (list) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of list) {
      for (const q of p.pts) {
        if (q[0] < x0) x0 = q[0];
        if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1];
        if (q[1] > y1) y1 = q[1];
      }
    }
    return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
  };

  // Figure extent, excluding held props (a sword is taller than its owner) and
  // excluding the cape (it can trail below the boots).
  const figure = [];
  for (const n of ['torso', 'head', 'flow', 'legL', 'legR']) {
    if (n === 'flow' && kit.flow === 'cloak') continue;
    for (const p of byNode[n]) figure.push(p);
  }
  const fb = box(figure) || { x0: -20, x1: 20, y0: -60, y1: 60 };
  const footY = fb.y1;
  const topY = fb.y0;
  const U = height / Math.max(1, footY - topY);   // world metres per art unit

  const tb = box(byNode.torso) || fb;
  const hb = box(byNode.head) || { x0: -12, x1: 12, y0: topY, y1: topY + 24 };
  const lb = box([...byNode.legL, ...byNode.legR]);

  const torsoHalf = Math.max(8, (tb.x1 - tb.x0) / 2);
  const neckY = hb.y1;                              // bottom of the head mass
  const headCY = (hb.y0 + hb.y1) / 2;

  // ── Hip ──
  // Where the artist drew legs, the hip is the top of the leg cards. But four
  // heroes have no legs to read: Paladin's are under a surcoat and every wizard
  // is a robe to the floor, and for them the leg node holds only boots. So a
  // leg box whose top is already past the halfway mark between neck and sole is
  // treated as "boots only" and the hip falls back to a proportion of the
  // figure. Both paths are then clamped into a sane band — a hip above the head
  // (which the unclamped fallback produced for Grand Mage, whose hat is half
  // his height) is a rig with no torso at all.
  const bootsOnly = !lb || lb.y0 > neckY + (footY - neckY) * 0.55;
  const rawHip = bootsOnly ? topY + (footY - topY) * 0.62 : lb.y0;
  const hipY = Math.min(
    Math.max(rawHip, neckY + (footY - neckY) * 0.28),
    footY - (footY - topY) * 0.12,
  );

  // ── Shoulder ──
  // NOT the top of the arm box: that box contains whatever the hero is holding,
  // and a greatsword or a staff reaches above the helmet, which put Crusader's
  // shoulder joint 25 cm over his own head. Derive it from the neck instead,
  // then let COMPACT arm plies (pauldrons, sleeves, paws — anything whose
  // vertical run is under a third of the figure) pull it into range.
  const span = footY - topY;
  let shoulderY = neckY + (footY - neckY) * 0.06;
  let cTop = Infinity, cBot = -Infinity;
  for (const p of [...byNode.armL, ...byNode.armR]) {
    let y0 = Infinity, y1 = -Infinity;
    for (const q of p.pts) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    if (y1 - y0 > span * 0.30) continue;            // held prop, not an arm
    if (y0 < cTop) cTop = y0;
    if (y1 > cBot) cBot = y1;
  }
  if (Number.isFinite(cTop) && cBot - 2 > cTop + 4) {
    shoulderY = Math.min(Math.max(shoulderY, cTop + 4), cBot - 2);
  }

  const cb = box(byNode.flow);
  // Hat and ears hinge at the skull top, not at the brim; a cape hangs from the
  // shoulders. `Math.min` in art space picks the HIGHER of the two.
  const flowY = cb
    ? (kit.flow === 'cloak' ? Math.max(cb.y0, shoulderY - 6) : Math.min(cb.y1, headCY))
    : headCY;

  return {
    U, height,
    footY, topY, hipY, shoulderY, neckY, headCY, flowY,
    torsoHalf,
    // Limbs hang OUTBOARD of the torso: an arm whose inner edge is inside the
    // body silhouette interpenetrates it down its whole length, which is the
    // seam-and-z-fight failure the previous rig shipped with.
    shoulderX: torsoHalf + 5,
    hipX: Math.max(6, torsoHalf * 0.42),
    legLen: Math.max(8, footY - hipY),
    armLen: Math.max(8, (footY - hipY) * 0.86),
    bounds: fb,
  };
}

/** Split a hero's traced plies into rig nodes according to its kit. */
export function binPlies(traced, kit) {
  const out = { torso: [], head: [], flow: [], armL: [], armR: [], legL: [], legR: [] };
  const map = new Map();
  for (const [part, idx] of Object.entries(kit.parts)) {
    const node = part === 'crown' || part === 'cloak' ? 'flow' : part;
    for (const i of idx) map.set(i, node);
  }
  for (const p of traced.plies) {
    if (p.kind === 'glow') continue;
    if (p.pts.length < 3) continue;
    if (Math.abs(polyArea(p.pts)) < 1.5) continue;   // degenerate / hairline
    out[map.get(p.index) || 'torso'].push(p);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. GEOMETRY — extruding paper
// ═══════════════════════════════════════════════════════════════════════════

function sink() { return { pos: [], nrm: [], col: [] }; }

function stamp(s, geo, mat, rgb) {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  if (mat) ni.applyMatrix4(mat);
  const p = ni.attributes.position.array;
  const n = ni.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) {
    s.pos.push(p[i], p[i + 1], p[i + 2]);
    s.nrm.push(n[i], n[i + 1], n[i + 2]);
    s.col.push(rgb[0], rgb[1], rgb[2]);
  }
  if (ni !== geo) ni.dispose();
  geo.dispose();
}

function bake(s) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(s.nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s.col), 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

/**
 * Splay the front/back cap normals outward from a ply's centre so a flat card
 * shades like a softly domed one under the toon ramp — a ramp step lands INSIDE
 * the card near its rim instead of the whole card being one dead tone. Only the
 * caps are touched, so the silhouette stays a crisp cut-out. Build-time, no
 * derivatives (SwiftShader law).
 */
function roundFace(geo, cx, cy, amount) {
  const n = geo.attributes.normal.array;
  const p = geo.attributes.position.array;
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(n[i + 2]) < 0.7) continue;
    const dx = p[i] - cx, dy = p[i + 1] - cy;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    const nx = n[i] + (dx / l) * amount;
    const ny = n[i + 1] + (dy / l) * amount;
    const nz = n[i + 2];
    const m = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / m; n[i + 1] = ny / m; n[i + 2] = nz / m;
  }
}

const _mtx = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _qua = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scl = new THREE.Vector3();

function compose(x, y, z, sx, sy) {
  _pos.set(x, y, z);
  _eul.set(0, 0, 0);
  _qua.setFromEuler(_eul);
  _scl.set(sx, sy, 1);
  return _mtx.compose(_pos, _qua, _scl);
}

/** One extruded ply, centred on (cx,cy) of its own outline for the dome trick. */
function extrude(s, pts, rgb, o) {
  const depth = o.depth ?? CARD;
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth, bevelEnabled: false, curveSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  roundFace(geo, o.cx || 0, o.cy || 0, o.round ?? 0.40);
  stamp(s, geo, compose(0, 0, o.z || 0, o.sx ?? 1, o.sy ?? 1), rgb);
  return 1;
}

/**
 * Laminate a ply into a FORM: the same outline restamped as `sheets` sheets
 * along z, each scaled by a two-sided superellipse profile so the stack's
 * envelope is a body rather than a card. This is the one thing that gives a
 * traced 2D silhouette a real side view, and it costs no extra draw call
 * because every sheet lands in the same sink.
 */
function laminate(s, pts, rgb, o) {
  const n = o.sheets ?? 3;
  const D = o.depth;
  const sheetD = (D / n) * 1.18;   // overlap, so the stack is solid not louvred
  const pF = o.pF ?? 3.4, pB = o.pB ?? 2.6, q = o.q ?? 0.32;
  const flatY = o.flatY ?? 0.45;
  const back = o.back ?? 0.90;
  const cx = o.cx || 0, cy = o.cy || 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const t = 2 * u - 1;
    const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), t >= 0 ? pF : pB)), q);
    const ky = 1 - (1 - k) * flatY;
    const shadeM = back + (1 - back) * u;
    const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), {
      depth: sheetD, bevelEnabled: false, curveSegments: 1, steps: 1,
    });
    geo.translate(0, 0, -sheetD * 0.5);
    roundFace(geo, cx, cy, o.round ?? 0.40);
    // Scale about the outline's own centre so the sheets stay concentric.
    _pos.set(cx * (1 - k), cy * (1 - ky), (o.z || 0) + t * 0.5 * D);
    _eul.set(0, 0, 0);
    _qua.setFromEuler(_eul);
    _scl.set(k, ky, 1);
    stamp(s, geo, _mtx.compose(_pos, _qua, _scl),
      [rgb[0] * shadeM, rgb[1] * shadeM, rgb[2] * shadeM]);
  }
  return n;
}

/** Front face of a laminated form, so detail cards can be laid ON it. */
const faceZ = (depth) => depth * 0.5 + CARD * 0.4;

// ── Synthetic limb outlines (art units) ───────────────────────────────────

function arcInto(pts, cx, cy, rx, ry, a0, a1, seg) {
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
}

/** Stadium hanging DOWN from the origin: the blank every limb starts as. */
function limbOutline(w, len) {
  const r = w / 2;
  const pts = [];
  arcInto(pts, 0, 0, r, r, 0, Math.PI, 4);
  pts.push([-r, -len + r]);
  arcInto(pts, 0, -len + r, r, r, Math.PI, Math.PI * 2, 4);
  return pts;
}

function ellipseOutline(rx, ry, seg = 10) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Foot, cut SIDE-ON. A foot's character is its profile; cut from the front it
 * is a stub. Toe at +z (the hero's facing), heel behind.
 */
const FOOT_PROFILE = [
  [-0.36, 0.46], [0.32, 0.46], [0.62, 0.27], [0.66, 0.05],
  [0.49, -0.10], [-0.40, -0.10], [-0.49, 0.09], [-0.47, 0.33],
];

// ═══════════════════════════════════════════════════════════════════════════
// 6. NODE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build one node's geometry from its traced plies.
 *
 * The node's LARGEST ply becomes its form and is laminated to `formDepth`;
 * everything else is a single card stacked in DRAW ORDER — plies the artist
 * drew after the form go in front of it, plies drawn before go behind. That is
 * the 2D layering, preserved exactly, now with millimetres between the layers
 * so the sun can put a hairline of teal shadow in each gap.
 *
 * @param {Array} plies    traced plies for this node, in draw order
 * @param {object} M       measurements from measureHero
 * @param {[number,number]} pivot art-space pivot (x, y) for this node
 * @param {number} formDepth world-space depth of the node's main form
 */
function buildFromPlies(s, plies, M, pivot, formDepth, opts = {}) {
  if (!plies.length) return 0;
  const U = M.U;
  const [px, py] = pivot;
  // Art space is y-DOWN; the rig is y-UP. Negating y also flips the winding,
  // which THREE's shape triangulator normalises, so front caps still face +z.
  const toLocal = (pts) => pts.map((q) => [(q[0] - px) * U, (py - q[1]) * U]);

  let big = 0, bigA = -1;
  const areas = new Array(plies.length);
  for (let i = 0; i < plies.length; i++) {
    areas[i] = Math.abs(polyArea(plies[i].pts));
    if (areas[i] > bigA) { bigA = areas[i]; big = i; }
  }

  let n = 0;
  const fz = faceZ(formDepth);
  let front = 0, backRank = 0;
  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    const pts = toLocal(p.pts);
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q[0]; cy += q[1]; }
    cx /= pts.length; cy /= pts.length;
    const rgb = linOf(p.color, opts.shade ?? 1);
    if (i === big) {
      n += laminate(s, pts, rgb, {
        depth: formDepth, sheets: opts.sheets ?? 3, cx, cy,
        pF: opts.pF ?? 3.4, pB: opts.pB ?? 2.6, q: opts.q ?? 0.32,
        flatY: opts.flatY ?? 0.45, back: opts.back ?? 0.90, round: opts.round,
      });
    } else if (i > big) {
      front += 1;
      n += extrude(s, pts, rgb, { z: fz + front * GAP, cx, cy, depth: opts.cardDepth ?? CARD });
    } else {
      backRank += 1;
      n += extrude(s, pts, rgb, { z: -fz - backRank * GAP, cx, cy, depth: opts.cardDepth ?? CARD });
    }
  }
  return n;
}

/** Torso: traced body plies, laminated broad-and-flat across the chest. */
function buildTorso(s, byNode, M) {
  return buildFromPlies(s, byNode.torso, M, [0, M.hipY], M.height * FORM_D.torso, {
    sheets: 4, pF: 4.0, pB: 2.6, flatY: 0.42,
  });
}

/** Head: traced skull/helm/face/eyes, laminated round (a head is a ball). */
function buildHead(s, byNode, M) {
  return buildFromPlies(s, byNode.head, M, [0, M.neckY], M.height * FORM_D.head, {
    sheets: 4, pF: 3.6, pB: 2.3, flatY: 0.9, back: 0.88,
  });
}

/** Flow node: a wizard's hat, a bunny's ears, a knight's cape. */
function buildFlow(s, byNode, M, kit) {
  const depth = M.height * FLOW_D[kit.flow];
  return buildFromPlies(s, byNode.flow, M, [0, M.flowY], depth, {
    sheets: kit.flow === 'cloak' ? 2 : 3,
    pF: 2.6, pB: 2.4, flatY: kit.flow === 'cloak' ? 0.25 : 0.8, back: 0.92,
  });
}

/**
 * Arm: a synthesised limb and hand in the hero's own colours, with every traced
 * ply the kit assigned to this side laid on top (pauldron, sleeve, paw — and
 * anything held, which is why a staff swings with the arm that carries it).
 */
function buildArm(s, byNode, M, kit, side) {
  const U = M.U;
  const node = side < 0 ? 'armL' : 'armR';
  const pivot = [side * M.shoulderX, M.shoulderY];
  const depth = M.height * FORM_D.armL;
  let n = 0;
  const w = M.torsoHalf * 0.42 * U;
  const len = M.armLen * U;
  n += laminate(s, limbOutline(w, len), linOf(kit.pal.limb, 0.90), {
    depth, sheets: 3, pF: 3.0, pB: 3.0, q: 0.36, flatY: 0.14, back: 0.92,
    cx: 0, cy: -len * 0.5,
  });
  // Hand / paw / gauntlet: a ball at the far end. Without it the arm ends in a
  // flat cut and the hero reads as a mannequin.
  n += laminate(s, ellipseOutline(w * 0.62, w * 0.58, 8), linOf(kit.pal.hand, 0.94), {
    depth: depth * 1.04, sheets: 2, pF: 2.2, pB: 2.2, q: 0.42, flatY: 0.9,
    back: 0.93, z: 0, cx: 0, cy: -len + w * 0.34,
  });
  // Traced decoration rides in front of the synthesised limb, in draw order.
  const plies = byNode[node];
  if (plies.length) {
    const fz = faceZ(depth);
    const [px, py] = pivot;
    for (let i = 0; i < plies.length; i++) {
      const p = plies[i];
      const pts = p.pts.map((q) => [(q[0] - px) * U, (py - q[1]) * U]);
      let cx = 0, cy = 0;
      for (const q of pts) { cx += q[0]; cy += q[1]; }
      cx /= pts.length; cy /= pts.length;
      n += extrude(s, pts, linOf(p.color), {
        z: fz + (i + 1) * GAP, cx, cy, depth: CARD,
      });
    }
  }
  return n;
}

/** Leg: synthesised column + side-cut foot, with the traced leg cards on top. */
function buildLeg(s, byNode, M, kit, side) {
  const U = M.U;
  const node = side < 0 ? 'legL' : 'legR';
  const pivot = [side * M.hipX, M.hipY];
  const depth = M.height * FORM_D.legL;
  let n = 0;
  const w = M.torsoHalf * 0.46 * U;
  const len = M.legLen * U;
  n += laminate(s, limbOutline(w, len * 0.94), linOf(kit.pal.limb, 0.94), {
    depth, sheets: 3, pF: 3.0, pB: 3.0, q: 0.36, flatY: 0.12, back: 0.92,
    cx: 0, cy: -len * 0.5,
  });
  // Foot, cut side-on and laminated ACROSS: this is the one form whose
  // silhouette lives in its profile, and it is what turns a peg into a leg.
  const fw = w * 1.1;
  const foot = FOOT_PROFILE.map(([u, v]) => [u * fw * 1.6, v * fw]);
  {
    const fd = w * 0.92;
    const sheets = 3;
    const sheetD = (fd / sheets) * 1.18;
    const rgb = linOf(kit.pal.foot, 0.96);
    for (let i = 0; i < sheets; i++) {
      const u = (i + 0.5) / sheets;
      const t = 2 * u - 1;
      const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 3.4)), 0.30);
      const sm = 0.92 + 0.08 * u;
      const geo = new THREE.ExtrudeGeometry(shapeFrom(foot), {
        depth: sheetD, bevelEnabled: false, curveSegments: 1, steps: 1,
      });
      geo.translate(0, 0, -sheetD * 0.5);
      roundFace(geo, 0, 0, 0.35);
      // Ry(-90) lays the profile in the Z-Y plane so it faces the hero's front.
      _pos.set(t * 0.5 * fd, -len + fw * 0.5, 0);
      _eul.set(0, -Math.PI / 2, 0);
      _qua.setFromEuler(_eul);
      _scl.set(1, 1 - (1 - k) * 0.3, k);
      stamp(s, geo, _mtx.compose(_pos, _qua, _scl),
        [rgb[0] * sm, rgb[1] * sm, rgb[2] * sm]);
      n += 1;
    }
  }
  const plies = byNode[node];
  if (plies.length) {
    const fz = faceZ(depth);
    const [px, py] = pivot;
    for (let i = 0; i < plies.length; i++) {
      const p = plies[i];
      const pts = p.pts.map((q) => [(q[0] - px) * U, (py - q[1]) * U]);
      let cx = 0, cy = 0;
      for (const q of pts) { cx += q[0]; cy += q[1]; }
      cx /= pts.length; cy /= pts.length;
      n += extrude(s, pts, linOf(p.color), { z: fz + (i + 1) * GAP, cx, cy, depth: CARD });
    }
  }
  return n;
}

// ── Contact shadow ────────────────────────────────────────────────────────
//
// A real contact shadow is nearly opaque where the form touches and gone a
// body-width away, and that GRADIENT is the whole cue — it is what tells a
// five-year-old which pixel is the point of contact. Carried in vertex alpha so
// `material.opacity` stays free as the single per-frame dial for altitude.
const BLOB_ALPHA = 0.46;
const BLOB_STOPS = [[0, 1.0], [0.26, 0.95], [0.56, 0.56], [1.0, 0.26]];
const BLOB_SEG = 18;

function buildBlobGeo() {
  const pos = [], nrm = [], col = [], uv = [];
  const push = (r, a, ang) => {
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    pos.push(x, 0, z); nrm.push(0, 1, 0); col.push(1, 1, 1, a);
    uv.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  };
  for (let k = 0; k < BLOB_STOPS.length - 1; k++) {
    const [r0, a0] = BLOB_STOPS[k];
    const [r1, a1] = BLOB_STOPS[k + 1];
    for (let i = 0; i < BLOB_SEG; i++) {
      const t0 = (i / BLOB_SEG) * Math.PI * 2;
      const t1 = ((i + 1) / BLOB_SEG) * Math.PI * 2;
      if (r0 === 0) { push(0, a0, t0); push(r1, a1, t0); push(r1, a1, t1); } else {
        push(r0, a0, t0); push(r1, a1, t0); push(r1, a1, t1);
        push(r0, a0, t0); push(r1, a1, t1); push(r0, a0, t1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. GEOMETRY CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Geometry is identical for every instance of a hero, and a party can field
 * three of them, so it is built once per (heroId, height) and reference
 * counted. dispose() drops a reference; the last one out frees the buffers.
 */
const _cache = new Map();

function acquireBuild(heroId, height) {
  const key = `${heroId}@${height.toFixed(3)}`;
  const hit = _cache.get(key);
  if (hit) { hit.refs += 1; return hit; }

  const kit = HERO_KITS[heroId];
  const art = ART_BY_ID[heroId];
  const traced = traceHeroArt(art);
  const byNode = binPlies(traced, kit);
  const M = measureHero(traced, kit, height);

  const geos = {};
  const plies = {};
  const mk = (name, fn) => {
    const s = sink();
    plies[name] = fn(s);
    geos[name] = bake(s);
    geos[name].name = `hero-${heroId}-${name}`;
  };
  mk('torso', (s) => buildTorso(s, byNode, M));
  mk('head', (s) => buildHead(s, byNode, M));
  mk('flow', (s) => buildFlow(s, byNode, M, kit));
  mk('armL', (s) => buildArm(s, byNode, M, kit, -1));
  mk('armR', (s) => buildArm(s, byNode, M, kit, 1));
  mk('legL', (s) => buildLeg(s, byNode, M, kit, -1));
  mk('legR', (s) => buildLeg(s, byNode, M, kit, 1));
  const blob = buildBlobGeo();

  let triangles = 0;
  for (const g of Object.values(geos)) triangles += g.attributes.position.count / 3;
  triangles += blob.attributes.position.count / 3;

  const entry = {
    key, refs: 1, kit, M, geos, blob, plies,
    triangles: Math.round(triangles),
    // Rig-space joint positions, in metres, y=0 at the sole.
    joint: {
      hip: (M.footY - M.hipY) * M.U,
      shoulder: (M.footY - M.shoulderY) * M.U,
      neck: (M.footY - M.neckY) * M.U,
      flow: (M.footY - M.flowY) * M.U,
      hipX: M.hipX * M.U,
      shoulderX: M.shoulderX * M.U,
      halfWidth: M.torsoHalf * M.U,
    },
  };
  _cache.set(key, entry);
  return entry;
}

function releaseBuild(entry) {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  for (const g of Object.values(entry.geos)) g.dispose();
  entry.blob.dispose();
  _cache.delete(entry.key);
}

/** Test/debug hook: how many distinct hero builds are resident. */
export function heroRigCacheSize() { return _cache.size; }

// ═══════════════════════════════════════════════════════════════════════════
// 8. ANIMATION
// ═══════════════════════════════════════════════════════════════════════════

/** Every named state the rig can be in. */
export const HERO_STATES = [
  'idle', 'walk', 'run', 'turn', 'jump', 'fall', 'land',
  'wade', 'climb', 'glide', 'victory', 'stagger',
];

/** One-shot states: they play out and hand control back to the auto-derivation. */
export const ONESHOT_STATES = { victory: 2.4, stagger: 0.9, land: 0.42 };

export const ANIM = {
  walkSpeed: 4.2,       // m/s at which the walk cycle is at full amplitude
  runSpeed: 8.4,        // m/s at which the run cycle is at full amplitude
  strideHz: 3.2,        // cycle radians per metre travelled — feet never skate
  armSwing: 0.44,
  armSwingRun: 0.30,
  legSwing: 0.52,
  legSwingRun: 0.26,
  propDamp: 0.40,       // swing kept by the arm that carries a weapon
  bob: 0.052,
  bobRun: 0.042,
  leanRun: 0.22,
  turnLean: 0.12,
  turnLeanMax: 0.34,
  breathHz: 1.4,
  swayHz: 0.6,
  wadeSink: 0.19,
  wadeSplay: 0.40,
  squashDecay: 4.2,
  // Whole-body squash amplitude, capped at a kid-legible "oof" rather than a
  // full-body pancake: 15% Y-compression max, with roughly 60% of that back
  // out sideways (volume-preserving-ish, not exact). See the squash-tuning
  // comment at the rig.scale.set() call below for why these numbers exist.
  squashY: 0.15,
  squashXZ: 0.09,
  legSquash: 0.18,
  landMinFall: 2.5,
  speedDamp: 11,
  yawDamp: 7,
  blend: 9,             // how fast a state weight eases in/out (1/s)
  lookPeriod: 4.6,      // seconds between idle look-arounds
};

/**
 * Which state the rig should be in, given raw motion. Pure — this is the piece
 * the tests pin, because "walking into water plays wade, not walk" is a rule
 * and not an opinion.
 *
 * Priority is deliberate: a one-shot the caller asked for beats everything;
 * then traversal modes the controller owns (climb, glide); then airborne; then
 * water; then ground speed.
 *
 * @param {{speed?:number, grounded?:boolean, vy?:number, wading?:boolean,
 *          climbing?:boolean, gliding?:boolean, yawRate?:number}} m
 */
export function deriveState(m) {
  if (m.climbing) return 'climb';
  if (m.gliding) return 'glide';
  if (m.grounded === false) return (m.vy || 0) > 0.2 ? 'jump' : 'fall';
  if (m.wading) return 'wade';
  const sp = m.speed || 0;
  if (sp > ANIM.walkSpeed * 1.02) return 'run';
  if (sp > 0.35) return 'walk';
  if (Math.abs(m.yawRate || 0) > 1.6) return 'turn';
  return 'idle';
}

/**
 * Critically-ish damped spring step. Used for every piece of secondary motion
 * (cape, ears, hat, robe hem) — the lag between a body and the paper hanging
 * off it is what makes a papercut figure read as alive rather than as a decal.
 *
 * Returns the new [value, velocity]; the caller writes them back. Semi-implicit
 * Euler with a clamped step so a hitched frame cannot explode the spring.
 */
export function springStep(x, v, target, stiffness, damping, dt) {
  if (dt <= 0) return [target, 0];
  const h = Math.min(dt, 1 / 45);
  const nv = (v + (target - x) * stiffness * h) * Math.max(0, 1 - damping * h);
  return [x + nv * h, nv];
}

/** Smoothstep — used for every weight ease so nothing pops. */
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ═══════════════════════════════════════════════════════════════════════════
// 9. THE RIG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a hero.
 *
 * @param {string|object} heroId  a hero id ('bunny-pepper'), hero object, an
 *                                evolution id, or a bare class name
 * @param {{ height?:number, castShadow?:boolean, rim?:boolean,
 *           contactShadow?:boolean, companion?:boolean }} [opts]
 * @returns {{ group:THREE.Group, nodes:object, setState:Function,
 *             update:Function, reset:Function, stats:object, dispose:Function }}
 */
export function createHeroRig(heroId, opts = {}) {
  const id = resolveHeroId(heroId);
  const height = opts.height ?? DEFAULT_HEIGHT;
  const castShadow = opts.castShadow !== false;
  const wantBlob = opts.contactShadow !== false;

  const build = acquireBuild(id, height);
  const { kit, joint } = build;

  const materials = [];
  // ONE material for every ply of every node: plies differ by VERTEX COLOUR,
  // not by material, which is what keeps ~30 pieces of paper at 7 draw calls.
  // `space:'local'` pins the paper grain to the mesh so it cannot swim across
  // the hero as he runs — he is the closest thing to the camera and the one
  // surface where swimming grain would be obvious.
  // `form` is the hero's answer to "a flat teal wedge with no read": the toon
  // ramp puts a shoulder, a helmet crown and a chest plate on the SAME step
  // (they are all within a few degrees of the sun's NdotL), so a figure cut
  // from thirty plies of paper arrived as one silhouette-shaped fill. Lifting
  // the sky-facing plies and dropping the tucked-under ones is baked value
  // structure — it survives into shade, so the hero reads as a figure standing
  // in a hedge's shadow rather than as a hole in it. Held at half strength: on
  // a 1.7 m character at 6 m the plies are small and the full wall amount
  // would read as speckle rather than as form.
  const skin = papercutMaterial(0xffffff, {
    vertexColors: true,
    grain: 0.075, normal: 0.10, roughnessLike: 0.17, scale: 0.42, space: 'local',
    bleach: 0.26, form: 0.5,
  });
  // The hero is the one surface in the world that gets a rim: cream light on
  // the paper edge, additive after the toon ramp so it survives into shade —
  // which is exactly when a mid-teal knight on mid-green grass needs an edge,
  // and the palette law forbids the obvious fix of a dark outline.
  if (opts.rim !== false) applyRimLight(skin, { strength: 0.34, power: 3.0 });
  materials.push(skin);

  const group = new THREE.Group();
  group.name = `hero-${id}`;

  /** Everything the whole-body transforms (bob, lean, squash) act on. The
   *  contact shadow is a SIBLING so it never inherits them. */
  const rig = new THREE.Group();
  rig.name = 'hero-rig';
  group.add(rig);

  const nodes = {};
  const addNode = (name, parent, x, y, z) => {
    const mesh = new THREE.Mesh(build.geos[name], skin);
    mesh.name = `hero-${name}`;
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    nodes[name] = mesh;
    return mesh;
  };

  const torso = addNode('torso', rig, 0, joint.hip, 0);
  const head = addNode('head', rig, 0, joint.neck, 0);
  // A hat/ears ride the HEAD (they lag what the head does); a cape rides the
  // TORSO (it lags what the body does). Same node, different parent, and that
  // parent choice is most of why each reads correctly.
  const flowParent = kit.flow === 'cloak' ? torso : head;
  const flowY = kit.flow === 'cloak' ? joint.flow - joint.hip : joint.flow - joint.neck;
  const flow = addNode('flow', flowParent, 0, flowY, 0);
  const armL = addNode('armL', rig, -joint.shoulderX, joint.shoulder, 0);
  const armR = addNode('armR', rig, joint.shoulderX, joint.shoulder, 0);
  const legL = addNode('legL', rig, -joint.hipX, joint.hip, 0);
  const legR = addNode('legR', rig, joint.hipX, joint.hip, 0);
  // Alias the flow node under the name the art calls it, so callers and tests
  // can say what they mean.
  nodes[kit.flow] = flow;

  // ── Contact shadow ───────────────────────────────────────────────────────
  let blob = null;
  let blobMat = null;
  if (wantBlob) {
    blobMat = new THREE.MeshBasicMaterial({
      color: paperColor(PAPER.shadow), vertexColors: true, transparent: true,
      opacity: BLOB_ALPHA, depthWrite: false, fog: true, alphaMap: deckleDisc(),
    });
    materials.push(blobMat);
    blob = new THREE.Mesh(build.blob, blobMat);
    blob.name = 'hero-contact-shadow';
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    blob.renderOrder = 1;
    group.add(blob);
  }
  const BLOB_R = joint.halfWidth * 2.9;

  // ── State ────────────────────────────────────────────────────────────────
  // Every field is a number or a boolean: update() must not allocate.
  const st = {
    t: 0,
    phase: 0, spd: 0, yaw: 0, yawRate: 0,
    grounded: true, airT: 0, fallV: 0, squash: 0,
    flowLag: 0, flowVel: 0,
    hemLag: 0, hemVel: 0,
    lookYaw: 0, lookVel: 0, lookTarget: 0, lookAt: 0,
    prevVx: 0, prevVz: 0, accel: 0,
    override: null, overrideT: 0,
    state: 'idle',
    rnd: 0x9e3779b9,
    // Blend weights, one per non-locomotion state.
    wAir: 0, wWade: 0, wClimb: 0, wGlide: 0, wVictory: 0, wStagger: 0,
  };

  /** Deterministic scatter — Math.random would desync the screenshot harness. */
  function rnd() {
    st.rnd = (Math.imul(st.rnd, 1664525) + 1013904223) >>> 0;
    return st.rnd / 4294967296;
  }

  /**
   * Force a named state. Pass null to hand control back to the motion-derived
   * state machine. One-shots ('victory', 'stagger', 'land') expire on their own.
   */
  function setState(name) {
    if (!name) { st.override = null; st.overrideT = 0; return; }
    const s = String(name);
    if (HERO_STATES.indexOf(s) < 0) return;
    st.override = s;
    st.overrideT = ONESHOT_STATES[s] || 0;
  }

  const ease = (w, on, dt) => w + (on - w) * Math.min(1, ANIM.blend * dt);

  /**
   * Advance the rig one frame.
   *
   * @param {number} dt seconds since the last call (0 freezes the pose, which
   *        is what the screenshot harness uses to make a pose reproducible)
   * @param {{pos:{x,y,z}, vel:{x,y,z}, yaw:number, grounded?:boolean,
   *          wading?:boolean, climbing?:boolean, gliding?:boolean,
   *          groundY?:number}} state  read only, never retained
   */
  function update(dt, state) {
    const d = Math.min(Math.max(dt || 0, 0), 0.05);
    st.t += d;

    const pos = state.pos || state;
    const vel = state.vel || { x: 0, y: 0, z: 0 };
    group.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
    group.rotation.y = state.yaw || 0;

    // ── Derived motion ──
    const rawSpd = Math.hypot(vel.x || 0, vel.z || 0);
    st.spd += (rawSpd - st.spd) * Math.min(1, ANIM.speedDamp * d);
    const moveN = clamp01(st.spd / ANIM.walkSpeed);
    const runN = clamp01((st.spd - ANIM.walkSpeed) / (ANIM.runSpeed - ANIM.walkSpeed));

    let dYaw = (state.yaw || 0) - st.yaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    st.yaw = state.yaw || 0;
    const rate = d > 0 ? dYaw / d : 0;
    st.yawRate += (rate - st.yawRate) * Math.min(1, ANIM.yawDamp * d);

    // Horizontal acceleration, in the hero's own frame: this is what the cape
    // and the ears actually react to, and it is why they whip on a hard turn
    // even at constant speed.
    if (d > 0) {
      const ax = ((vel.x || 0) - st.prevVx) / d;
      const az = ((vel.z || 0) - st.prevVz) / d;
      const cy = Math.cos(-st.yaw), sy = Math.sin(-st.yaw);
      st.accel += ((az * cy - ax * sy) - st.accel) * Math.min(1, 8 * d);
      st.prevVx = vel.x || 0;
      st.prevVz = vel.z || 0;
    }

    const air = state.grounded === false;
    if (air) {
      st.airT += d;
      st.fallV = vel.y || 0;
    } else if (st.airT > 0) {
      // Landing. The impact is the descent we carried a frame ago; the
      // controller has already zeroed vel.y by the time `grounded` flips.
      const impact = Math.max(0, -st.fallV);
      if (impact > ANIM.landMinFall) {
        st.squash = Math.max(st.squash, 0.35 + 0.65 * clamp01((impact - ANIM.landMinFall) / 7));
      }
      st.airT = 0;
      st.fallV = 0;
    }
    const airW = air ? clamp01(st.airT / 0.13) : 0;
    st.squash = Math.max(0, st.squash - d * ANIM.squashDecay);
    const sq = smooth(clamp01(st.squash));

    // ── Which state are we in ──
    if (st.override && st.overrideT > 0) {
      st.overrideT -= d;
      if (st.overrideT <= 0) { st.override = null; st.overrideT = 0; }
    }
    const derived = deriveState({
      speed: st.spd, grounded: !air, vy: vel.y || 0,
      wading: !!state.wading, climbing: !!state.climbing, gliding: !!state.gliding,
      yawRate: st.yawRate,
    });
    const cur = st.override || derived;
    st.state = cur;

    st.wWade = ease(st.wWade, cur === 'wade' ? 1 : 0, d);
    st.wClimb = ease(st.wClimb, cur === 'climb' ? 1 : 0, d);
    st.wGlide = ease(st.wGlide, cur === 'glide' ? 1 : 0, d);
    st.wVictory = ease(st.wVictory, cur === 'victory' ? 1 : 0, d);
    st.wStagger = ease(st.wStagger, cur === 'stagger' ? 1 : 0, d);
    st.wAir = airW * (1 - st.wClimb) * (1 - st.wGlide);

    // Locomotion is suppressed by every override that owns the whole body.
    const loco = (1 - st.wClimb) * (1 - st.wGlide) * (1 - st.wVictory) * (1 - st.wStagger);

    // ── Cycle ──
    // Phase advances with DISTANCE, not time, so a slow wade and a sprint land
    // the same number of footfalls per metre and the feet never skate. Climbing
    // has no ground speed, so it drives the same cycle off the clock instead.
    if (d > 0) {
      st.phase += (st.spd * ANIM.strideHz + st.wClimb * 3.4) * d;
    }
    const sw = Math.sin(st.phase);
    const cw = Math.cos(st.phase);

    // ── Idle: breathing, weight shift, and an occasional look around ──
    const breath = Math.sin(st.t * ANIM.breathHz);
    const idle = (1 - moveN) * loco;
    if (d > 0) {
      st.lookAt -= d;
      if (st.lookAt <= 0) {
        st.lookAt = ANIM.lookPeriod * (0.7 + rnd() * 0.9);
        // Two thirds of the time the look returns to centre, so the head is not
        // permanently cocked to one side.
        st.lookTarget = rnd() < 0.34 ? (rnd() - 0.5) * 1.3 : 0;
      }
    }
    const [lookYaw, lookVel] = springStep(st.lookYaw, st.lookVel, st.lookTarget * idle, 26, 8.5, d);
    st.lookYaw = lookYaw;
    st.lookVel = lookVel;

    // ── Whole body ──
    const bobAmp = (ANIM.bob + (ANIM.bobRun - ANIM.bob) * runN) * moveN * loco;
    const bob = -Math.abs(cw) * bobAmp + bobAmp * 0.5;
    const tuck = st.wAir * (st.fallV > 0 ? 0.55 : 1);

    rig.position.y = bob
      + idle * breath * 0.012
      - st.wWade * ANIM.wadeSink
      - sq * 0.10
      + st.wAir * 0.04
      + st.wVictory * 0.05 * (0.5 + 0.5 * Math.sin(st.t * 7));
    rig.position.z = st.wClimb * 0.14 + st.wStagger * -0.10;

    let roll = -st.yawRate * ANIM.turnLean;
    if (roll > ANIM.turnLeanMax) roll = ANIM.turnLeanMax;
    else if (roll < -ANIM.turnLeanMax) roll = -ANIM.turnLeanMax;

    rig.rotation.x = (ANIM.leanRun * runN * 0.6 + moveN * 0.06) * loco
      + st.wAir * (st.fallV > 0 ? 0.16 : -0.10)
      - st.wWade * 0.05
      + st.wClimb * 0.30
      + st.wGlide * 0.34
      - st.wVictory * 0.16
      // Stagger: rocked back off the hit, with a fast decaying wobble on top —
      // the wobble is what reads as "he nearly went over" rather than "he leaned".
      - st.wStagger * 0.42 * (0.6 + 0.4 * Math.cos(st.t * 18));
    rig.rotation.z = roll * (0.35 + 0.65 * moveN) * loco
      + idle * Math.sin(st.t * ANIM.swayHz) * 0.014
      + st.wStagger * 0.10;
    rig.rotation.y = st.wStagger * -0.14 + idle * Math.sin(st.t * 0.37) * 0.02;

    // Squash is capped at 15% Y-compression (SQUASH_Y) — a kid-legible "oof"
    // on a hard landing, not a stack of jello. This is now the ONLY writer of
    // the hero's whole-body scale: index.js used to multiply a second,
    // independently-computed gameFeel squash on top of this one every frame,
    // compounding to ~40% compression on a real landing — see
    // .forensics/world.md Defect 5 and the comment at heroRig.update()'s call
    // site in index.js.
    const stretch = st.wAir * (st.fallV > 0 ? 0.06 : 0.02);
    rig.scale.set(
      1 + sq * ANIM.squashXZ - stretch * 0.5,
      1 - sq * ANIM.squashY + stretch,
      1 + sq * ANIM.squashXZ - stretch * 0.5,
    );

    // ── Torso ──
    torso.rotation.y = -sw * 0.16 * moveN * loco + st.wClimb * sw * 0.10;
    torso.rotation.z = sw * 0.035 * moveN * loco;
    torso.rotation.x = st.wVictory * -0.06;
    torso.scale.set(1 + idle * breath * 0.012, 1 + idle * breath * 0.018, 1);

    // ── Head: counter-rotates the torso and holds the horizon ──
    head.rotation.y = sw * 0.09 * moveN * loco + lookYaw
      + idle * Math.sin(st.t * 0.41) * 0.06;
    head.rotation.x = -rig.rotation.x * 0.62 + Math.abs(cw) * 0.03 * moveN * loco
      + idle * Math.sin(st.t * 0.53 + 1.1) * 0.025
      - st.wVictory * 0.30
      + st.wStagger * 0.34
      - st.wClimb * 0.18;
    head.rotation.z = -roll * 0.4 + st.wStagger * 0.12;

    // ── Flow node: the spring that makes paper look alive ──
    // Target is everything the body just did, negated: a cape trails what the
    // torso does, a hat lags what the head does, and both stream backward under
    // acceleration and float up in the air.
    const flowTarget = kit.flow === 'cloak'
      ? (-torso.rotation.x * 0.6 - rig.rotation.x * 0.9
        - st.accel * 0.045 - moveN * 0.26 - runN * 0.30
        - st.wGlide * 0.85 + st.wAir * 0.34 + sq * 0.30)
      : (-head.rotation.x * 0.95 - rig.rotation.x * 0.5 + sw * 0.05 * moveN * loco
        - st.accel * 0.030 - runN * 0.20
        - st.wGlide * 0.55 + st.wAir * 0.30 + sq * 0.38);
    // Damping raised from 8.0 to ~critical (2*sqrt(58)=15.2 for zeta=1): at
    // 8.0 this spring was zeta=~0.53, under-damped enough to overshoot and
    // ring on every idle sway/breath tick — small each time, but continuous,
    // which is part of what read as "jello" even standing still. Critical
    // damping keeps the cape/hat lag (the target still moves) without the
    // bounce-back past it. See .forensics/world.md Defect 5.
    const [fl, fv] = springStep(st.flowLag, st.flowVel, flowTarget, 58, 15, d);
    st.flowLag = fl;
    st.flowVel = fv;
    flow.rotation.x = fl;
    flow.rotation.z = roll * 0.55 + idle * Math.sin(st.t * ANIM.swayHz + 0.8) * 0.03
      + (kit.flow === 'cloak' ? 0 : Math.sin(st.t * 1.9) * 0.02 * (1 - idle));

    // Hem sway: a second, slower spring on the torso's roll. On a robed wizard
    // this is the skirt catching up with the hips; on everyone else it is a
    // couple of degrees of weight and costs nothing.
    const hemTarget = roll * 0.5 - sw * 0.05 * moveN * loco;
    // Same fix as the flow spring above: 7.0 was zeta=~0.64 (2*sqrt(30)=11
    // is critical), under-damped enough to wobble on its own after the body
    // stopped moving.
    const [hl, hv] = springStep(st.hemLag, st.hemVel, hemTarget, 30, 11, d);
    st.hemLag = hl;
    st.hemVel = hv;
    torso.rotation.z += (hl - hemTarget) * 0.6;

    // ── Arms ──
    const armAmp = (ANIM.armSwing + ANIM.armSwingRun * runN) * moveN * loco;
    const armIdle = idle * (0.06 + breath * 0.03);
    const airArm = st.wAir * (st.fallV > 0 ? -1.05 : -0.55);
    // The arm that carries a weapon swings less: a hero holding a greatsword
    // does not windmill it, and this one multiplier is the difference between
    // "armed" and "flailing a prop".
    const dampL = kit.prop === 'armL' ? ANIM.propDamp : 1;
    const dampR = kit.prop === 'armR' ? ANIM.propDamp : 1;
    const climbL = st.wClimb * (0.9 + sw * 0.9);
    const climbR = st.wClimb * (0.9 - sw * 0.9);

    armL.rotation.x = -sw * armAmp * dampL * (1 - st.wAir) + armIdle + airArm
      - climbL * 2.0 - st.wVictory * 2.3 - st.wStagger * 1.0;
    armR.rotation.x = sw * armAmp * dampR * (1 - st.wAir) + armIdle + airArm
      - climbR * 2.0 - st.wVictory * 2.0 - st.wStagger * 0.7;

    const splay = 0.12 + runN * 0.05 + st.wWade * ANIM.wadeSplay + st.wAir * 0.26;
    armL.rotation.z = splay + idle * breath * 0.02
      + st.wGlide * 1.25 + st.wVictory * 0.35 + st.wStagger * 0.55;
    armR.rotation.z = -splay - idle * breath * 0.02
      - st.wGlide * 1.25 - st.wVictory * 0.30 - st.wStagger * 0.45;
    armL.rotation.y = -st.wWade * 0.25 - st.wGlide * 0.20;
    armR.rotation.y = st.wWade * 0.25 + st.wGlide * 0.20;

    // ── Legs ──
    const legAmp = (ANIM.legSwing + ANIM.legSwingRun * runN) * moveN * loco;
    const climbLegL = st.wClimb * (0.55 - sw * 0.55);
    const climbLegR = st.wClimb * (0.55 + sw * 0.55);
    legL.rotation.x = sw * legAmp * (1 - st.wAir) + tuck * -0.85
      - climbLegL + st.wGlide * 0.22 + st.wStagger * 0.30;
    legR.rotation.x = -sw * legAmp * (1 - st.wAir) + tuck * 0.30
      - climbLegR + st.wGlide * 0.10 - st.wStagger * 0.20;
    legL.rotation.z = 0.02 + st.wWade * 0.10 - st.wGlide * 0.06;
    legR.rotation.z = -0.02 - st.wWade * 0.10 + st.wGlide * 0.06;
    const legSquash = 1 - sq * ANIM.legSquash - st.wAir * 0.06;
    legL.scale.y = legSquash;
    legR.scale.y = legSquash;

    // ── Contact shadow ──
    // Tight and dark on the ground, wide and faint in the air: in a papercut
    // world with no ambient occlusion this blob is the only thing telling a
    // child how high they jumped, and it snaps tight on the landing frame.
    if (blob) {
      const gy = state.groundY == null ? (pos.y || 0) : state.groundY;
      const alt = Math.max(0, (pos.y || 0) - gy);
      const s = BLOB_R + Math.min(alt, 5) * 0.20 + sq * 0.40;
      blob.position.y = (gy - (pos.y || 0)) + 0.03;
      blob.scale.set(s, s, 1);
      blobMat.opacity = BLOB_ALPHA / (1 + alt * 0.55) * (1 - st.wWade * 0.5);
    }
  }

  /**
   * Return the rig to a canonical idle. setPose / teleport call this so a
   * screenshot never inherits mid-stride state from a frame earlier, which is
   * what makes the pose harness reproducible across machines.
   */
  function reset() {
    st.t = 0; st.phase = 0; st.spd = 0; st.yawRate = 0;
    st.airT = 0; st.fallV = 0; st.squash = 0;
    st.flowLag = 0; st.flowVel = 0; st.hemLag = 0; st.hemVel = 0;
    st.lookYaw = 0; st.lookVel = 0; st.lookTarget = 0; st.lookAt = ANIM.lookPeriod;
    st.prevVx = 0; st.prevVz = 0; st.accel = 0;
    st.override = null; st.overrideT = 0; st.state = 'idle';
    st.rnd = 0x9e3779b9;
    st.wAir = 0; st.wWade = 0; st.wClimb = 0; st.wGlide = 0;
    st.wVictory = 0; st.wStagger = 0;
    for (const k of RIG_NODES) {
      const n = nodes[k];
      n.rotation.set(0, 0, 0);
      n.scale.set(1, 1, 1);
    }
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.scale.set(1, 1, 1);
  }
  reset();

  const stats = {
    heroId: id,
    heroClass: kit.cls,
    flow: kit.flow,
    height,
    nodes: RIG_NODES.length,
    plies: Object.values(build.plies).reduce((a, b) => a + b, 0),
    triangles: build.triangles,
    // 7 body nodes + the contact shadow, in the colour pass.
    drawCalls: RIG_NODES.length + (blob ? 1 : 0),
    shadowPassCalls: castShadow ? RIG_NODES.length : 0,
    joint,
  };

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const m of materials) m.dispose();
    materials.length = 0;
    if (blob) group.remove(blob);
    rig.clear();
    head.clear();
    torso.clear();
    group.clear();
    releaseBuild(build);
  }

  return {
    group, rig, nodes, stats,
    heroId: id, heroClass: kit.cls, height,
    setState, update, reset, dispose,
    /** Current animation state name — HUD/debug read this, nothing writes it. */
    get state() { return st.state; },
  };
}
