/**
 * discoverySpec.test.js — the island's authored content, audited against the
 * REAL terrain.
 *
 * This suite does not check that a data file parses. It samples the live
 * heightfield at all thirty-nine hand-placed positions and asserts each one is
 * above the water line, on ground the controller will actually let a child
 * stand on, inside the biome it claims, and far enough from its neighbours to
 * be its own place. A terrain edit that drowns a grotto or a biome-radius tweak
 * that swallows a shrine turns this red instead of quietly deleting an hour of
 * hand-placed content.
 *
 * The slope check earns a specific mention: `sampleNormal` returns an ARRAY
 * [nx, ny, nz], not a {x,y,z}. Reading `.y` off it yields undefined, every
 * comparison against NaN is false, and the check silently passes everything.
 * It is asserted below so nobody rewrites it into a no-op.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeightfield } from './heightfield.js';
import { WORLD } from './worldSpec.js';
import { FLOOR_OPERATORS } from '../data/enemies.js';
import { PAPER } from '../config.js';
import {
  DISCOVERIES, DISCOVERY_KINDS, DISCOVERY_TOTAL, DISCOVERY_TOTALS_BY_KIND,
  DISCOVERY_TOTALS_BY_BIOME, TRIGGER_RADIUS,
  SHRINES, GROTTOS, LANDMARK_PUZZLES, STORY_PAGES,
  BUFFS, COSMETICS, RANKS, MILESTONES, PAGE_SET_REWARD,
  buffById, cosmeticById, discoveryById, shrineById, grottoById,
  landmarkPuzzleById, storyPageById, discoveriesInBiome,
  shrineOperator, shrineTrial, landmarkTrial, rankFor,
} from './discoverySpec.js';

const hf = createHeightfield(WORLD.SEED);

/** Ground slope in degrees. sampleNormal returns [nx, ny, nz]. */
function slopeDeg(x, z) {
  const n = hf.sampleNormal(x, z);
  return Math.acos(Math.max(-1, Math.min(1, n[1]))) * 180 / Math.PI;
}

/** The controller's walk limit. Steeper than this is not standable ground. */
const WALK_LIMIT_DEG = 50;

/** Nothing may be closer than this to another discovery. */
const MIN_SPACING = 11;

// ── The audit ──────────────────────────────────────────────────────────────

test('sampleNormal returns an array — the slope check is not silently vacuous', () => {
  const n = hf.sampleNormal(0, 0);
  assert.ok(Array.isArray(n), 'sampleNormal must return [nx, ny, nz]');
  assert.equal(typeof n[1], 'number');
  assert.ok(Number.isFinite(slopeDeg(0, 0)), 'slopeDeg must produce a real number');
});

test('every discovery stands on dry land', () => {
  for (const d of DISCOVERIES) {
    const h = hf.sampleHeight(d.x, d.z);
    assert.ok(h > WORLD.WATER_Y + 0.15, `${d.id} is at y=${h.toFixed(2)}, at or under the water line`);
  }
});

test('every discovery stands on ground a child can walk on', () => {
  for (const d of DISCOVERIES) {
    const s = slopeDeg(d.x, d.z);
    assert.ok(s <= WALK_LIMIT_DEG, `${d.id} sits on a ${s.toFixed(1)}-degree slope`);
  }
});

test('every discovery is inside the biome it claims', () => {
  for (const d of DISCOVERIES) {
    const actual = hf.biomeAt(d.x, d.z);
    assert.equal(actual, d.biome, `${d.id} claims ${d.biome} but the terrain says ${actual}`);
  }
});

test('every shrine has a standable approach in front of its door', () => {
  for (const s of SHRINES) {
    const slope = slopeDeg(s.approach.x, s.approach.z);
    const h = hf.sampleHeight(s.approach.x, s.approach.z);
    assert.ok(h > WORLD.WATER_Y + 0.15, `${s.id} approach is underwater`);
    assert.ok(slope <= WALK_LIMIT_DEG, `${s.id} approach is a ${slope.toFixed(1)}-degree face`);
  }
});

test('no two discoveries crowd each other', () => {
  for (let i = 0; i < DISCOVERIES.length; i++) {
    for (let j = i + 1; j < DISCOVERIES.length; j++) {
      const a = DISCOVERIES[i];
      const b = DISCOVERIES[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d >= MIN_SPACING, `${a.id} and ${b.id} are ${d.toFixed(1)} m apart`);
    }
  }
});

test('no trigger radius is large enough to overlap a neighbour', () => {
  for (let i = 0; i < DISCOVERIES.length; i++) {
    for (let j = i + 1; j < DISCOVERIES.length; j++) {
      const a = DISCOVERIES[i];
      const b = DISCOVERIES[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d > a.radius + b.radius,
        `${a.id} and ${b.id} triggers overlap — both would fire at once`);
    }
  }
});

// ── Content counts (the brief's promises) ──────────────────────────────────

test('there is exactly one shrine per biome that has a floor', () => {
  assert.equal(SHRINES.length, 9);
  const biomes = SHRINES.map((s) => s.biome);
  assert.equal(new Set(biomes).size, 9, 'two shrines share a biome');
  const floors = SHRINES.map((s) => s.floorId).sort((a, b) => a - b);
  assert.deepEqual(floors, [1, 2, 3, 4, 5, 6, 7, 8, 9], 'shrines must cover every floor exactly once');
});

test('there are at least six hidden grottos, one per biome including the meadow', () => {
  assert.ok(GROTTOS.length >= 6, `only ${GROTTOS.length} grottos`);
  assert.equal(GROTTOS.length, 10);
  assert.equal(new Set(GROTTOS.map((g) => g.biome)).size, 10, 'two grottos share a biome');
  assert.ok(GROTTOS.some((g) => g.biome === 'meadow'), 'the meadow must reward crossing it');
});

test('every grotto is genuinely concealed and has a discovery beat', () => {
  const kinds = new Set();
  for (const g of GROTTOS) {
    assert.ok(g.conceal, `${g.id} has nothing to hide behind`);
    assert.ok(g.depth > 0, `${g.id} has no pocket for the reveal camera to dolly into`);
    assert.ok(g.line && g.line.length > 0, `${g.id} has no discovery line`);
    assert.ok(g.reward && g.reward.gold > 0, `${g.id} pays nothing`);
    kinds.add(g.conceal);
  }
  // The brief names four concealment ideas by hand; the set must be varied.
  assert.ok(kinds.size >= 6, `only ${kinds.size} kinds of hiding place`);
  for (const want of ['waterfall', 'arch', 'tree']) {
    assert.ok(kinds.has(want), `no grotto hides behind a ${want}`);
  }
});

test('there are at least five landmark puzzles, all readable without text', () => {
  assert.ok(LANDMARK_PUZZLES.length >= 5, `only ${LANDMARK_PUZZLES.length} landmark puzzles`);
  assert.equal(LANDMARK_PUZZLES.length, 8);
  const kinds = new Set(LANDMARK_PUZZLES.map((p) => p.puzzle.kind));
  // The brief names braziers-in-order, plates-that-sum, odd-one-out and a
  // balance scale. All four must actually exist in the world.
  for (const want of ['order', 'sum', 'oddOne', 'balance']) {
    assert.ok(kinds.has(want), `no landmark puzzle of kind ${want}`);
  }
  for (const p of LANDMARK_PUZZLES) {
    assert.ok(p.spread > 0, `${p.id} is a control panel, not a place`);
  }
});

test('there are twelve story pages: nine proof, three margin notes', () => {
  assert.equal(STORY_PAGES.length, 12);
  assert.equal(STORY_PAGES.filter((p) => !p.margin).length, 9);
  assert.equal(STORY_PAGES.filter((p) => p.margin).length, 3);
  const orders = STORY_PAGES.map((p) => p.order).sort((a, b) => a - b);
  assert.deepEqual(orders, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'reading order has a gap or a repeat');
  const proofFloors = STORY_PAGES.filter((p) => !p.margin).map((p) => p.floorId).sort((a, b) => a - b);
  assert.deepEqual(proofFloors, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a child who cannot glide or climb can still find most of the pages', () => {
  const easy = STORY_PAGES.filter((p) => !p.hard).length;
  assert.ok(easy >= 8, `only ${easy} of 12 pages are reachable on foot`);
});

test('the flat index covers every family and nothing else', () => {
  assert.equal(DISCOVERY_TOTAL, 39);
  assert.equal(DISCOVERIES.length, SHRINES.length + GROTTOS.length + LANDMARK_PUZZLES.length + STORY_PAGES.length);
  assert.deepEqual(DISCOVERY_TOTALS_BY_KIND, { shrine: 9, grotto: 10, puzzle: 8, page: 12 });
  const sum = Object.values(DISCOVERY_TOTALS_BY_BIOME).reduce((a, b) => a + b, 0);
  assert.equal(sum, DISCOVERY_TOTAL, 'the per-biome counts do not add up to the total');
});

test('every discovery id is unique', () => {
  const ids = DISCOVERIES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate discovery id');
});

test('shrines and landmark puzzles are visible; grottos and pages are hidden', () => {
  for (const d of DISCOVERIES) {
    const shouldHide = d.kind === 'grotto' || d.kind === 'page';
    assert.equal(d.hidden, shouldHide, `${d.id} has the wrong visibility`);
    assert.equal(d.radius, TRIGGER_RADIUS[d.kind], `${d.id} has the wrong trigger radius`);
  }
});

// ── The economy ────────────────────────────────────────────────────────────

test('every reward references a buff or cosmetic that exists', () => {
  const blocks = [
    ...SHRINES.map((s) => [s.id, s.reward]),
    ...GROTTOS.map((g) => [g.id, g.reward]),
    ...LANDMARK_PUZZLES.map((p) => [p.id, p.reward]),
    ...MILESTONES.map((m) => [m.id, m.reward]),
    ['page-set', PAGE_SET_REWARD],
  ];
  for (const [id, r] of blocks) {
    if (r.buff) assert.ok(buffById(r.buff), `${id} grants unknown buff ${r.buff}`);
    if (r.cosmetic) assert.ok(cosmeticById(r.cosmetic), `${id} grants unknown cosmetic ${r.cosmetic}`);
    assert.ok((r.gold || 0) >= 0, `${id} pays negative gold`);
  }
});

test('every buff is granted by exactly one shrine', () => {
  const granted = SHRINES.map((s) => s.reward.buff).filter(Boolean);
  assert.equal(granted.length, BUFFS.length, 'a buff is unreachable or double-granted');
  assert.equal(new Set(granted).size, BUFFS.length, 'two shrines grant the same buff');
  for (const b of BUFFS) assert.ok(granted.includes(b.id), `${b.id} is not granted by any shrine`);
});

test('buffs are small, additive and never touch a maths answer', () => {
  for (const b of BUFFS) {
    assert.equal(typeof b.add, 'number');
    assert.ok(Number.isFinite(b.add) && b.add !== 0, `${b.id} does nothing`);
    assert.ok(Math.abs(b.add) <= 5, `${b.id} moves ${b.key} by ${b.add} — too big to be kind`);
    assert.ok(b.key && typeof b.key === 'string');
  }
  const keys = BUFFS.map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length, 'two buffs stack on the same key by accident');
});

test('every cosmetic is reachable', () => {
  const granted = new Set();
  for (const r of [...GROTTOS.map((g) => g.reward), ...SHRINES.map((s) => s.reward),
    ...MILESTONES.map((m) => m.reward), PAGE_SET_REWARD]) {
    if (r.cosmetic) granted.add(r.cosmetic);
  }
  for (const c of COSMETICS) assert.ok(granted.has(c.id), `${c.id} cannot be earned`);
});

test('reward scale rises with effort: shrines pay more than grottos pay more than puzzles', () => {
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const shrineGold = avg(SHRINES.map((s) => s.reward.gold));
  const grottoGold = avg(GROTTOS.map((g) => g.reward.gold));
  const puzzleGold = avg(LANDMARK_PUZZLES.map((p) => p.reward.gold));
  assert.ok(shrineGold > grottoGold, `shrines ${shrineGold} vs grottos ${grottoGold}`);
  assert.ok(grottoGold > puzzleGold, `grottos ${grottoGold} vs puzzles ${puzzleGold}`);
});

test('finding every page is worth more than any single discovery', () => {
  const biggest = Math.max(...DISCOVERIES.map((d) => d.reward?.gold || 0));
  assert.ok(PAGE_SET_REWARD.gold > biggest, 'the collection payoff must dwarf a single find');
});

// ── Maths wiring ───────────────────────────────────────────────────────────

test('every shrine asks its own floor operator, from the one shared table', () => {
  for (const s of SHRINES) {
    assert.equal(shrineOperator(s), FLOOR_OPERATORS[s.floorId], `${s.id} asks the wrong operator`);
    assert.equal(shrineOperator(s.id), FLOOR_OPERATORS[s.floorId], 'lookup by id must agree');
  }
});

test('every shrine trial and landmark trial normalises to a real puzzle', () => {
  for (const s of SHRINES) {
    const t = shrineTrial(s);
    assert.ok(t && t.kind, `${s.id} has no trial`);
  }
  for (const p of LANDMARK_PUZZLES) {
    const t = landmarkTrial(p);
    assert.ok(t && t.kind, `${p.id} has no puzzle`);
  }
  assert.equal(shrineTrial('nope'), null);
  assert.equal(landmarkTrial('nope'), null);
});

// ── Selectors ──────────────────────────────────────────────────────────────

test('selectors find what exists and return null for what does not', () => {
  assert.equal(discoveryById('shrine-garden').kind, 'shrine');
  assert.equal(discoveryById('nope'), null);
  assert.equal(shrineById('shrine-sky').biome, 'sky');
  assert.equal(shrineById('nope'), null);
  assert.equal(grottoById('grotto-hollow-oak').conceal, 'tree');
  assert.equal(grottoById('nope'), null);
  assert.equal(landmarkPuzzleById('puz-market-balance').puzzle.kind, 'balance');
  assert.equal(landmarkPuzzleById('nope'), null);
  assert.equal(storyPageById('page-1').order, 1);
  assert.equal(storyPageById('nope'), null);
});

test('discoveriesInBiome agrees with the precomputed totals', () => {
  for (const [biome, total] of Object.entries(DISCOVERY_TOTALS_BY_BIOME)) {
    assert.equal(discoveriesInBiome(biome).length, total, `${biome} count disagrees`);
  }
  assert.deepEqual(discoveriesInBiome('nowhere'), []);
});

test('rankFor is monotone and covers the whole range', () => {
  assert.equal(rankFor(0).id, 'wanderer');
  assert.equal(rankFor(-1).id, 'wanderer', 'a negative fraction must not fall off the bottom');
  assert.equal(rankFor(0.25).id, 'pathfinder');
  assert.equal(rankFor(0.49).id, 'pathfinder');
  assert.equal(rankFor(0.5).id, 'cartographer');
  assert.equal(rankFor(0.75).id, 'islandheart');
  assert.equal(rankFor(1).id, 'papermind');
  assert.equal(rankFor(2).id, 'papermind');
  for (let i = 1; i < RANKS.length; i++) {
    assert.ok(RANKS[i].at > RANKS[i - 1].at, 'ranks must ascend');
  }
});

test('milestones ascend and end at a full island', () => {
  for (let i = 1; i < MILESTONES.length; i++) {
    assert.ok(MILESTONES[i].at > MILESTONES[i - 1].at);
  }
  assert.equal(MILESTONES[MILESTONES.length - 1].at, 1);
  for (const m of MILESTONES) assert.ok(m.line && m.line.length, `${m.id} has no line`);
});

// ── Art law ────────────────────────────────────────────────────────────────

test('every colour in the spec comes from PAPER', () => {
  const palette = new Set(Object.values(PAPER).filter((v) => typeof v === 'number'));
  const tinted = [
    ...DISCOVERIES.map((d) => [d.id, d.tint]),
    ...BUFFS.map((b) => [b.id, b.tint]),
    ...COSMETICS.map((c) => [c.id, c.tint]),
    ...RANKS.map((r) => [r.id, r.tint]),
  ];
  for (const [id, tint] of tinted) {
    assert.ok(palette.has(tint), `${id} uses a colour that is not in PAPER: ${tint}`);
  }
});

test('no discovery is tinted black or grey', () => {
  for (const d of DISCOVERIES) {
    const r = (d.tint >> 16) & 255;
    const g = (d.tint >> 8) & 255;
    const b = d.tint & 255;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const bright = Math.max(r, g, b);
    assert.ok(bright > 90, `${d.id} is too dark for cut paper`);
    assert.ok(spread > 8 || bright > 200, `${d.id} reads as grey`);
  }
});
