/**
 * discovery.test.js — grant-once, progress arithmetic and the compass.
 *
 * The two properties this suite exists to defend:
 *
 *   1. NOTHING PAYS TWICE. Re-entering a grotto, re-solving a shrine, crossing
 *      a milestone on a reloaded save — every one of them converges on
 *      "already", with no mutation. A double-paying grotto is a currency
 *      exploit a seven-year-old finds in four minutes.
 *   2. THE METER CANNOT LIE. Walking past a shrine is not finishing it, the
 *      fraction never leaves 0..1, and 100 per cent means all thirty-nine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import {
  DISCOVERIES, SHRINES, GROTTOS, LANDMARK_PUZZLES, STORY_PAGES,
  MILESTONES, PAGE_SET_REWARD, BUFFS,
} from './discoverySpec.js';
import {
  ensureDiscovery, sanitizeDiscovery, isFound, isSolvedId, isComplete, isClaimed,
  hasBuff, hasCosmetic, buffValue, ownedBuffs, pagesFound,
  discoveryProgress, grantReward, discover, completeTrial,
  claimMilestones, claimPageSet, scanProximity, compassHint, mapMarkers,
  PAGE_SET_CLAIM, SENSE_RANGE,
} from './discovery.js';

const fresh = () => makeDefaultSave();

/** Walk into everything, in the order a completionist would. */
function findAll(save) {
  for (const d of DISCOVERIES) discover(save, d.id);
  for (const d of DISCOVERIES) {
    if (d.kind === 'shrine' || d.kind === 'puzzle') completeTrial(save, d.id);
  }
}

// ── The container ──────────────────────────────────────────────────────────

test('ensureDiscovery builds the container on a save that has never seen it', () => {
  const save = fresh();
  delete save.overworld;
  const d = ensureDiscovery(save);
  assert.deepEqual(d, { found: [], solved: [], buffs: [], cosmetics: [], claimed: [] });
  assert.ok(save.overworld, 'the overworld container must be rebuilt too');
});

test('ensureDiscovery repairs a half-shaped or hostile container in place', () => {
  const save = fresh();
  save.overworld.discovery = { found: 'not-an-array', solved: [1, 'ok', null, 'ok'], junk: true };
  const d = ensureDiscovery(save);
  assert.deepEqual(d.found, []);
  assert.deepEqual(d.solved, ['ok'], 'non-strings dropped, duplicates collapsed');
  assert.deepEqual(d.buffs, []);
});

test('ensureDiscovery survives a null save without throwing', () => {
  const d = ensureDiscovery(null);
  assert.deepEqual(d.found, []);
});

test('sanitizeDiscovery keeps only the five string ledgers', () => {
  const out = sanitizeDiscovery({ found: ['a', 'a', 'b'], nonsense: 1, claimed: null });
  assert.deepEqual(Object.keys(out).sort(), ['buffs', 'claimed', 'cosmetics', 'found', 'solved']);
  assert.deepEqual(out.found, ['a', 'b']);
  assert.deepEqual(out.claimed, []);
});

// ── Grant-once ─────────────────────────────────────────────────────────────

test('a grotto pays exactly once no matter how often you walk back in', () => {
  const save = fresh();
  const g = GROTTOS[0];
  const first = discover(save, g.id);
  assert.equal(first.granted, true);
  const gold = save.gold;
  assert.ok(gold > 0);
  assert.ok(hasCosmetic(save, g.reward.cosmetic));

  for (let i = 0; i < 5; i++) {
    const again = discover(save, g.id);
    assert.equal(again.granted, false);
    assert.equal(again.already, true);
    assert.equal(again.reward, null);
  }
  assert.equal(save.gold, gold, 'gold moved on a repeat visit');
});

test('a shrine pays on solving, not on arriving', () => {
  const save = fresh();
  const s = SHRINES[0];
  const arrival = discover(save, s.id);
  assert.equal(arrival.granted, true);
  assert.equal(arrival.reward, null, 'arriving at a shrine must not pay');
  assert.equal(save.gold, 0);
  assert.equal(isFound(save, s.id), true);
  assert.equal(isComplete(save, s.id), false, 'walking past is not finishing');

  const solved = completeTrial(save, s.id);
  assert.equal(solved.granted, true);
  assert.ok(save.gold > 0);
  assert.equal(hasBuff(save, s.reward.buff), true);
  assert.equal(isComplete(save, s.id), true);

  const again = completeTrial(save, s.id);
  assert.equal(again.already, true);
  assert.equal(again.reward, null);
});

test('completing a trial you never triggered still marks it found', () => {
  const save = fresh();
  const p = LANDMARK_PUZZLES[0];
  completeTrial(save, p.id);
  assert.equal(isFound(save, p.id), true, 'the meter would otherwise owe a credit it never pays');
  assert.equal(isSolvedId(save, p.id), true);
});

test('grantReward is idempotent under a claim id', () => {
  const save = fresh();
  const gold0 = save.gold || 0;
  const potions0 = save.potions || 0;
  const r = { gold: 50, potions: 2 };
  const a = grantReward(save, r, 'test-claim');
  assert.equal(a.granted, true);
  assert.equal(a.gold, 50);
  assert.equal(save.potions, potions0 + 2);
  const b = grantReward(save, r, 'test-claim');
  assert.equal(b.granted, false);
  assert.equal(b.already, true);
  assert.equal(save.gold, gold0 + 50, 'gold paid twice');
  assert.equal(save.potions, potions0 + 2, 'potions paid twice');
});

test('an already-owned buff is not reported as new and does not duplicate', () => {
  const save = fresh();
  grantReward(save, { buff: 'buff-keen-eye' }, 'a');
  const second = grantReward(save, { buff: 'buff-keen-eye' }, 'b');
  assert.equal(second.buff, null, 'the NEW! flash must not fire twice');
  assert.equal(ensureDiscovery(save).buffs.filter((b) => b === 'buff-keen-eye').length, 1);
});

test('grantReward ignores unknown buffs and cosmetics rather than storing junk', () => {
  const save = fresh();
  const r = grantReward(save, { buff: 'buff-nonexistent', cosmetic: 'cos-nope', gold: 10 }, 'x');
  assert.equal(r.buff, null);
  assert.equal(r.cosmetic, null);
  assert.equal(r.gold, 10);
  assert.deepEqual(ensureDiscovery(save).buffs, []);
});

test('discovering something that does not exist is a clean no-op', () => {
  const save = fresh();
  const r = discover(save, 'no-such-thing');
  assert.equal(r.granted, false);
  assert.equal(r.record, null);
  assert.deepEqual(ensureDiscovery(save).found, []);
});

test('completeTrial refuses grottos and pages — they have no trial', () => {
  const save = fresh();
  const r = completeTrial(save, GROTTOS[0].id);
  assert.equal(r.granted, false);
  assert.deepEqual(ensureDiscovery(save).solved, []);
});

// ── The Lucky Purse touches gold, and only gold ────────────────────────────

test('the gold-find buff scales payouts and can only ever add', () => {
  const plain = fresh();
  grantReward(plain, { gold: 100 }, 'a');
  assert.equal(plain.gold, 100);

  const lucky = fresh();
  grantReward(lucky, { buff: 'buff-lucky-purse' }, 'buff');
  grantReward(lucky, { gold: 100 }, 'a');
  assert.equal(lucky.gold, 110, '10 per cent, rounded');
  assert.ok(lucky.gold > plain.gold);
});

test('buffValue sums owned buffs and is zero for unknown keys', () => {
  const save = fresh();
  assert.equal(buffValue(save, 'climbStamina'), 0);
  assert.equal(buffValue(save, 'not-a-key'), 0);
  grantReward(save, { buff: 'buff-sure-step' }, 'a');
  const expected = BUFFS.find((b) => b.id === 'buff-sure-step').add;
  assert.equal(buffValue(save, 'climbStamina'), expected);
  assert.equal(ownedBuffs(save).length, 1);
});

// ── Progress arithmetic ────────────────────────────────────────────────────

test('a fresh save is at zero and ranks as a Wanderer, not a failure', () => {
  const save = fresh();
  const p = discoveryProgress(save);
  assert.equal(p.done, 0);
  assert.equal(p.total, DISCOVERIES.length);
  assert.equal(p.pct, 0);
  assert.equal(p.rank.id, 'wanderer');
});

test('finding everything reaches exactly 100 per cent and the top rank', () => {
  const save = fresh();
  findAll(save);
  const p = discoveryProgress(save);
  assert.equal(p.done, DISCOVERIES.length);
  assert.equal(p.pct, 1);
  assert.equal(p.rank.id, 'papermind');
  for (const kind of Object.keys(p.byKind)) {
    assert.equal(p.byKind[kind].done, p.byKind[kind].total, `${kind} did not close out`);
  }
  for (const biome of Object.keys(p.byBiome)) {
    assert.equal(p.byBiome[biome].done, p.byBiome[biome].total, `${biome} did not close out`);
  }
});

test('walking past every shrine and puzzle without solving does NOT finish the island', () => {
  const save = fresh();
  for (const d of DISCOVERIES) discover(save, d.id);
  const p = discoveryProgress(save);
  assert.ok(p.pct < 1, 'the meter must not pay for arriving at a landmark');
  const solvable = DISCOVERIES.filter((d) => d.kind === 'shrine' || d.kind === 'puzzle').length;
  assert.equal(p.done, DISCOVERIES.length - solvable);
  assert.equal(p.byKind.shrine.done, 0);
  assert.equal(p.byKind.grotto.done, GROTTOS.length);
});

test('the fraction stays inside 0..1 at every step of a full playthrough', () => {
  const save = fresh();
  let last = -1;
  for (const d of DISCOVERIES) {
    discover(save, d.id);
    if (d.kind === 'shrine' || d.kind === 'puzzle') completeTrial(save, d.id);
    const p = discoveryProgress(save);
    assert.ok(p.pct >= 0 && p.pct <= 1, `pct escaped: ${p.pct}`);
    assert.ok(p.pct >= last, 'progress went backwards');
    assert.ok(Number.isFinite(p.pct), 'pct is not a number');
    last = p.pct;
  }
  assert.equal(last, 1);
});

test('per-kind and per-biome sub-totals always add up to the whole', () => {
  const save = fresh();
  for (let i = 0; i < DISCOVERIES.length; i += 3) {
    discover(save, DISCOVERIES[i].id);
    completeTrial(save, DISCOVERIES[i].id);
    const p = discoveryProgress(save);
    const byKind = Object.values(p.byKind).reduce((a, k) => a + k.done, 0);
    const byBiome = Object.values(p.byBiome).reduce((a, b) => a + b.done, 0);
    assert.equal(byKind, p.done, 'per-kind counts disagree with the total');
    assert.equal(byBiome, p.done, 'per-biome counts disagree with the total');
  }
});

// ── Milestones ─────────────────────────────────────────────────────────────

test('each milestone pays exactly once across a whole playthrough', () => {
  const save = fresh();
  const paid = [];
  for (const d of DISCOVERIES) {
    for (const m of discover(save, d.id).milestones) paid.push(m.id);
    if (d.kind === 'shrine' || d.kind === 'puzzle') {
      for (const m of completeTrial(save, d.id).milestones) paid.push(m.id);
    }
  }
  assert.deepEqual(paid.sort(), MILESTONES.map((m) => m.id).sort(), 'a milestone was missed or repeated');
  assert.equal(new Set(paid).size, paid.length, 'a milestone paid twice');
  assert.deepEqual(claimMilestones(save), [], 'a finished island still owes a milestone');
});

test('a save imported at full completion pays every milestone once, in order', () => {
  const save = fresh();
  const d = ensureDiscovery(save);
  for (const rec of DISCOVERIES) {
    d.found.push(rec.id);
    if (rec.kind === 'shrine' || rec.kind === 'puzzle') d.solved.push(rec.id);
  }
  const paid = claimMilestones(save);
  assert.deepEqual(paid.map((m) => m.id), MILESTONES.map((m) => m.id));
  assert.deepEqual(claimMilestones(save), []);
});

test('a milestone exactly on the boundary counts as crossed', () => {
  const save = fresh();
  const d = ensureDiscovery(save);
  const quarter = Math.ceil(DISCOVERIES.length * 0.25);
  const arrivals = DISCOVERIES.filter((r) => r.kind === 'grotto' || r.kind === 'page');
  for (let i = 0; i < quarter && i < arrivals.length; i++) d.found.push(arrivals[i].id);
  const p = discoveryProgress(save);
  assert.ok(p.pct >= 0.25);
  assert.ok(claimMilestones(save).some((m) => m.id === 'ms-25'));
});

// ── Story pages ────────────────────────────────────────────────────────────

test('the page set pays once, only when the last page lands', () => {
  const save = fresh();
  for (let i = 0; i < STORY_PAGES.length - 1; i++) {
    const r = discover(save, STORY_PAGES[i].id);
    assert.equal(r.pageSet, null, `the set paid early, at page ${i + 1}`);
  }
  const last = discover(save, STORY_PAGES[STORY_PAGES.length - 1].id);
  assert.ok(last.pageSet && last.pageSet.granted, 'the set never paid');
  assert.equal(isClaimed(save, PAGE_SET_CLAIM), true);
  assert.ok(hasCosmetic(save, PAGE_SET_REWARD.cosmetic));
  assert.equal(claimPageSet(save), null, 'the set paid twice');
});

test('pagesFound returns pages in reading order regardless of find order', () => {
  const save = fresh();
  discover(save, 'page-9');
  discover(save, 'page-2');
  discover(save, 'page-m1');
  assert.deepEqual(pagesFound(save), ['page-2', 'page-9', 'page-m1']);
});

// ── Proximity ──────────────────────────────────────────────────────────────

test('scanProximity finds what you are standing on and nothing else', () => {
  const save = fresh();
  const g = GROTTOS[1];
  const rec = DISCOVERIES.find((d) => d.id === g.id);
  const hits = scanProximity(save, g.at.x, g.at.z);
  assert.ok(hits.some((h) => h.id === g.id), 'standing on it did not trigger it');
  for (const h of hits) {
    assert.ok(Math.hypot(h.x - g.at.x, h.z - g.at.z) <= h.radius);
  }
  assert.ok(rec.radius > 0);
});

test('scanProximity ignores what you have already found', () => {
  const save = fresh();
  const g = GROTTOS[1];
  discover(save, g.id);
  const hits = scanProximity(save, g.at.x, g.at.z);
  assert.ok(!hits.some((h) => h.id === g.id));
});

test('scanProximity allocates nothing in the common empty case', () => {
  const save = fresh();
  const a = scanProximity(save, 9999, 9999);
  const b = scanProximity(save, -9999, -9999);
  assert.equal(a.length, 0);
  assert.equal(a, b, 'the empty result must be a shared frozen array');
});

test('just outside the trigger radius does not fire', () => {
  const save = fresh();
  const rec = DISCOVERIES.find((d) => d.kind === 'grotto');
  const hits = scanProximity(save, rec.x + rec.radius + 0.5, rec.z);
  assert.ok(!hits.some((h) => h.id === rec.id));
});

// ── The compass ────────────────────────────────────────────────────────────

test('the compass names a landmark but never names a hidden thing from afar', () => {
  const save = fresh();
  const shrine = DISCOVERIES.find((d) => d.kind === 'shrine');
  const hint = compassHint(save, shrine.x + 40, shrine.z, { pool: [shrine] });
  assert.ok(hint);
  assert.equal(hint.precise, true);
  assert.equal(hint.name, shrine.name);
  assert.ok(typeof hint.bearing === 'number');

  const grotto = DISCOVERIES.find((d) => d.kind === 'grotto');
  const far = compassHint(save, grotto.x + SENSE_RANGE * 0.7, grotto.z, { pool: [grotto] });
  assert.ok(far, 'a grotto inside sense range must register as warmth');
  assert.equal(far.precise, false);
  assert.equal(far.name, null, 'naming a hidden grotto deletes the discovery');
  assert.equal(far.bearing, null);
  assert.ok(far.heat > 0 && far.heat < 1);
});

test('a hidden thing is imperceptible beyond sense range', () => {
  const save = fresh();
  const grotto = DISCOVERIES.find((d) => d.kind === 'grotto');
  const hint = compassHint(save, grotto.x + SENSE_RANGE * 3, grotto.z, { pool: [grotto] });
  assert.equal(hint, null);
});

test('heat rises as you close on a hidden thing', () => {
  const save = fresh();
  const grotto = DISCOVERIES.find((d) => d.kind === 'grotto');
  let last = -1;
  for (const frac of [0.9, 0.7, 0.5, 0.3, 0.1]) {
    const h = compassHint(save, grotto.x + SENSE_RANGE * frac, grotto.z, { pool: [grotto] });
    assert.ok(h.heat > last, 'heat must rise as the player closes in');
    last = h.heat;
  }
});

test('the Keen Eye buff genuinely extends the compass', () => {
  const grotto = DISCOVERIES.find((d) => d.kind === 'grotto');
  const at = SENSE_RANGE * 1.2;
  const plain = fresh();
  assert.equal(compassHint(plain, grotto.x + at, grotto.z, { pool: [grotto] }), null);
  const keen = fresh();
  grantReward(keen, { buff: 'buff-keen-eye' }, 'b');
  const hint = compassHint(keen, grotto.x + at, grotto.z, { pool: [grotto] });
  assert.ok(hint, 'Keen Eye must actually widen the senses — the buff is a reward, not a label');
});

test('the compass keeps offering a shrine you found but never solved', () => {
  const save = fresh();
  const shrine = DISCOVERIES.find((d) => d.kind === 'shrine');
  discover(save, shrine.id);
  const hint = compassHint(save, shrine.x + 30, shrine.z, { pool: [shrine] });
  assert.ok(hint, 'an unsolved shrine is still somewhere to go');
  completeTrial(save, shrine.id);
  assert.equal(compassHint(save, shrine.x + 30, shrine.z, { pool: [shrine] }), null);
});

test('the compass prefers a nearby hidden thing to a distant landmark', () => {
  const save = fresh();
  const grotto = DISCOVERIES.find((d) => d.kind === 'grotto');
  const shrine = DISCOVERIES.find((d) => d.kind === 'shrine');
  const hint = compassHint(save, grotto.x + 4, grotto.z, { pool: [grotto, shrine] });
  assert.equal(hint.id, grotto.id, 'standing beside a waterfall must not point at a far shrine');
});

test('a finished island has nothing left to point at', () => {
  const save = fresh();
  findAll(save);
  assert.equal(compassHint(save, 0, 0), null);
});

test('the compass bearing points the right way', () => {
  const save = fresh();
  const shrine = DISCOVERIES.find((d) => d.kind === 'shrine');
  // Standing due -Z of the target: the bearing should be ~0 (straight +Z).
  const hint = compassHint(save, shrine.x, shrine.z - 30, { pool: [shrine] });
  assert.ok(Math.abs(hint.bearing) < 1e-6, `expected ~0, got ${hint.bearing}`);
  const west = compassHint(save, shrine.x - 30, shrine.z, { pool: [shrine] });
  assert.ok(Math.abs(west.bearing - Math.PI / 2) < 1e-6, `expected ~pi/2, got ${west.bearing}`);
});

// ── Map markers ────────────────────────────────────────────────────────────

test('the map shows only what you have found, and marks what is finished', () => {
  const save = fresh();
  assert.deepEqual(mapMarkers(save), [], 'the map must not be a to-do list');
  const shrine = DISCOVERIES.find((d) => d.kind === 'shrine');
  discover(save, shrine.id);
  let marks = mapMarkers(save);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].complete, false);
  completeTrial(save, shrine.id);
  marks = mapMarkers(save);
  assert.equal(marks[0].complete, true);
});
