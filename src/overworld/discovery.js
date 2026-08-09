/**
 * discovery — the runtime the island's authored content hangs off.
 *
 * ── WHAT THIS IS ───────────────────────────────────────────────────────────
 * discoverySpec.js says WHAT is out there and WHERE. This file is the only
 * thing that knows what the player has actually done about it: which of the
 * thirty-nine things are found, which trials are solved, which buffs and
 * cosmetics were earned, which milestones were paid out. It is the single
 * writer of `save.overworld.discovery`.
 *
 * ── FOUND vs SOLVED vs COMPLETE (the distinction the meter turns on) ────────
 * These are three different facts and conflating them makes a dishonest meter:
 *
 *   found     you have physically been there. Reveals the map marker, plays the
 *             discovery beat, stops the compass treating it as unknown.
 *   solved    the trial is done. Only shrines and landmark puzzles have one.
 *   complete  what the METER counts. For a grotto or a page, arriving IS the
 *             achievement, so complete === found. For a shrine or a landmark
 *             puzzle — which are deliberately visible from across the biome and
 *             therefore trivial to "find" — complete === solved. Without this
 *             split a child could walk past nine shrines and be told they had
 *             finished the island.
 *
 * ── GRANT-ONCE IS THE WHOLE SAFETY MODEL ───────────────────────────────────
 * Every payout in here routes through one function (`grantReward`) behind one
 * ledger (`claimed`). Re-entering a grotto, re-solving a puzzle, reloading a
 * save mid-beat and crossing the same milestone twice all converge on the same
 * answer: `{ granted: false, already: true }` and no mutation. The tests hammer
 * exactly this, because a double-paying grotto is a currency exploit a
 * seven-year-old finds in about four minutes.
 *
 * ── PERSISTENCE ────────────────────────────────────────────────────────────
 * ADDITIVE under `save.overworld.discovery`, and the save version is NOT
 * bumped — same reasoning the `seen` list already documents in save.js: an
 * absent container means "nothing discovered yet", which is the correct reading
 * of every save written before this file existed, so there is nothing for a
 * migration to do. save.js `normalize()` rebuilds `save.overworld` from a
 * whitelist, so the container is also declared there or it would be silently
 * dropped on the next write.
 *
 * Plain-Node importable: no three, no phaser, no DOM, no RNG.
 */
import {
  DISCOVERIES, DISCOVERY_KINDS, DISCOVERY_TOTAL, DISCOVERY_TOTALS_BY_KIND,
  DISCOVERY_TOTALS_BY_BIOME, MILESTONES, PAGE_SET_REWARD, STORY_PAGES,
  BUFFS, buffById, cosmeticById, discoveryById, rankFor,
} from './discoverySpec.js';

/** Kinds whose meter credit comes from arriving, not from solving. */
const ARRIVAL_KINDS = new Set(['grotto', 'page']);

/** The ledger id the twelve-page set reward is claimed under. */
export const PAGE_SET_CLAIM = 'page-set';

/**
 * How far the compass can feel a HIDDEN thing, before the Keen Eye buff. A
 * grotto radiates further than it triggers (3.2 m) so the world can get warm
 * before it opens — that gap is where the searching happens.
 */
export const SENSE_RANGE = 26;

/** Inside this, a hidden thing gives up its bearing as well as its warmth. */
export const LOCK_RANGE = 9;

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTAINER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure `save.overworld.discovery` exists, and repair it in place if a
 * hand-edited or truncated save left it half-shaped. Returns the container.
 *
 * Defensive to the point of paranoia because this runs against saves written
 * by four earlier versions of this game, and a discovery container that throws
 * on load costs the player the entire save file.
 */
export function ensureDiscovery(save) {
  if (!save || typeof save !== 'object') return blankDiscovery();
  if (!save.overworld || typeof save.overworld !== 'object' || Array.isArray(save.overworld)) {
    save.overworld = { pos: null, yaw: 0, portalId: null, collected: [], seen: [] };
  }
  const ow = save.overworld;
  if (!ow.discovery || typeof ow.discovery !== 'object' || Array.isArray(ow.discovery)) {
    ow.discovery = blankDiscovery();
  }
  const d = ow.discovery;
  for (const key of ['found', 'solved', 'buffs', 'cosmetics', 'claimed']) {
    d[key] = Array.isArray(d[key]) ? [...new Set(d[key].filter((v) => typeof v === 'string'))] : [];
  }
  return d;
}

function blankDiscovery() {
  return { found: [], solved: [], buffs: [], cosmetics: [], claimed: [] };
}

/**
 * The persistable projection of a discovery container — string arrays only,
 * deduped, unknown keys dropped. save.js calls this so the whitelist in
 * `normalize()` stays honest without importing the spec.
 */
export function sanitizeDiscovery(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = blankDiscovery();
  for (const key of Object.keys(out)) {
    out[key] = Array.isArray(src[key])
      ? [...new Set(src[key].filter((v) => typeof v === 'string'))]
      : [];
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// READS
// ═══════════════════════════════════════════════════════════════════════════

export function isFound(save, id) { return ensureDiscovery(save).found.includes(id); }
export function isSolvedId(save, id) { return ensureDiscovery(save).solved.includes(id); }
export function hasBuff(save, id) { return ensureDiscovery(save).buffs.includes(id); }
export function hasCosmetic(save, id) { return ensureDiscovery(save).cosmetics.includes(id); }
export function isClaimed(save, id) { return ensureDiscovery(save).claimed.includes(id); }

/**
 * Has this thing been finished, in the sense the meter counts? See the
 * found/solved/complete note at the top of the file.
 */
export function isComplete(save, id) {
  const rec = discoveryById(id);
  if (!rec) return false;
  const d = ensureDiscovery(save);
  return ARRIVAL_KINDS.has(rec.kind) ? d.found.includes(id) : d.solved.includes(id);
}

/** Every page id the player is carrying, in reading order. */
export function pagesFound(save) {
  const d = ensureDiscovery(save);
  return STORY_PAGES.filter((p) => d.found.includes(p.id)).map((p) => p.id);
}

/**
 * The sum of every owned buff with this key. Systems read a NUMBER and never
 * branch on which shrine paid for it:
 *
 *     stamina *= 1 + buffValue(save, 'climbStamina');
 *
 * Unknown keys are 0, so a read site can be added before the buff exists.
 */
export function buffValue(save, key) {
  const d = ensureDiscovery(save);
  let total = 0;
  for (const b of BUFFS) if (b.key === key && d.buffs.includes(b.id)) total += b.add;
  return total;
}

/** Every buff the player owns, as records. */
export function ownedBuffs(save) {
  const d = ensureDiscovery(save);
  return BUFFS.filter((b) => d.buffs.includes(b.id));
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS ARITHMETIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The whole meter in one object. `pct` is clamped 0..1 and is safe to divide by
 * nothing — the totals come from the spec and can never be zero while the spec
 * has content, but the guard is here anyway because a zero denominator on a
 * progress bar is a NaN on a child's screen.
 *
 * @returns {{done:number, total:number, pct:number, rank:object,
 *            byKind:Object<string,{done:number,total:number,pct:number}>,
 *            byBiome:Object<string,{done:number,total:number,pct:number}>}}
 */
export function discoveryProgress(save) {
  const d = ensureDiscovery(save);
  const complete = new Set();
  for (const rec of DISCOVERIES) {
    const done = ARRIVAL_KINDS.has(rec.kind) ? d.found.includes(rec.id) : d.solved.includes(rec.id);
    if (done) complete.add(rec.id);
  }

  const byKind = {};
  for (const kind of DISCOVERY_KINDS) {
    const total = DISCOVERY_TOTALS_BY_KIND[kind] || 0;
    const done = DISCOVERIES.filter((r) => r.kind === kind && complete.has(r.id)).length;
    byKind[kind] = { done, total, pct: total ? done / total : 0 };
  }

  const byBiome = {};
  for (const biome of Object.keys(DISCOVERY_TOTALS_BY_BIOME)) {
    const total = DISCOVERY_TOTALS_BY_BIOME[biome];
    const done = DISCOVERIES.filter((r) => r.biome === biome && complete.has(r.id)).length;
    byBiome[biome] = { done, total, pct: total ? done / total : 0 };
  }

  const done = complete.size;
  const total = DISCOVERY_TOTAL || 1;
  const pct = Math.max(0, Math.min(1, done / total));
  return { done, total: DISCOVERY_TOTAL, pct, rank: rankFor(pct), byKind, byBiome };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pay out a reward block, exactly once, under `claimId`.
 *
 * Reward blocks are the same shape everywhere in discoverySpec.js:
 *   { gold?, potions?, buff?, cosmetic?, page? }
 *
 * Gold is multiplied by the Lucky Purse buff — that is the ONE place a buff
 * touches the economy, and it can only ever add. A buff or cosmetic the player
 * already owns is not an error and not a double-pay; it simply is not listed in
 * the result, so the "NEW!" flash only fires on something actually new.
 *
 * @param {object} save mutated in place
 * @param {object} reward
 * @param {string} claimId ledger key. Omit for an unledgered grant (caller has
 *        already guaranteed once-ness, e.g. it just flipped `found`).
 * @returns {{granted:boolean, already:boolean, gold:number, potions:number,
 *            buff:?string, cosmetic:?string, page:?string}}
 */
export function grantReward(save, reward, claimId = null) {
  const d = ensureDiscovery(save);
  const nothing = { granted: false, already: true, gold: 0, potions: 0, buff: null, cosmetic: null, page: null };
  if (!reward || typeof reward !== 'object') {
    return { ...nothing, already: false };
  }
  if (claimId) {
    if (d.claimed.includes(claimId)) return nothing;
    d.claimed.push(claimId);
  }

  const out = { granted: true, already: false, gold: 0, potions: 0, buff: null, cosmetic: null, page: null };

  if (reward.gold > 0) {
    const mult = 1 + buffValue(save, 'goldFind');
    const paid = Math.max(0, Math.round(reward.gold * mult));
    save.gold = (save.gold || 0) + paid;
    out.gold = paid;
  }
  if (reward.potions > 0) {
    save.potions = (save.potions || 0) + reward.potions;
    out.potions = reward.potions;
  }
  if (reward.buff && buffById(reward.buff) && !d.buffs.includes(reward.buff)) {
    d.buffs.push(reward.buff);
    out.buff = reward.buff;
  }
  if (reward.cosmetic && cosmeticById(reward.cosmetic) && !d.cosmetics.includes(reward.cosmetic)) {
    d.cosmetics.push(reward.cosmetic);
    out.cosmetic = reward.cosmetic;
  }
  if (reward.page) out.page = reward.page;
  return out;
}

/**
 * Mark a discovery found. This is the ARRIVAL beat and nothing else decides it.
 *
 * Grottos and pages pay out here, because arriving is the achievement. Shrines
 * and landmark puzzles do not — they only become visible-and-known; their
 * reward is `completeTrial`'s to give.
 *
 * @returns {{granted:boolean, already:boolean, record:?object, reward:?object,
 *            pageSet:?object, milestones:object[]}}
 */
export function discover(save, id) {
  const rec = discoveryById(id);
  if (!rec) return { granted: false, already: false, record: null, reward: null, pageSet: null, milestones: [] };
  const d = ensureDiscovery(save);
  if (d.found.includes(id)) {
    return { granted: false, already: true, record: rec, reward: null, pageSet: null, milestones: [] };
  }
  d.found.push(id);

  // Arrival payouts are ledgered under the discovery's own id, so a save that
  // somehow carries `found` without the matching `claimed` entry (a crash
  // between the two pushes) heals rather than double-paying.
  const reward = ARRIVAL_KINDS.has(rec.kind) && rec.reward
    ? grantReward(save, rec.reward, `find:${id}`)
    : null;

  const pageSet = rec.kind === 'page' ? claimPageSet(save) : null;
  const milestones = claimMilestones(save);
  return { granted: true, already: false, record: rec, reward, pageSet, milestones };
}

/**
 * Mark a shrine's or landmark puzzle's trial solved, and pay for it. The trial
 * state machine (puzzles.js) decides WHEN; this decides what it is worth.
 *
 * @returns {{granted:boolean, already:boolean, record:?object, reward:?object,
 *            milestones:object[]}}
 */
export function completeTrial(save, id, rewardOverride = null) {
  const rec = discoveryById(id);
  if (!rec || ARRIVAL_KINDS.has(rec.kind)) {
    return { granted: false, already: false, record: rec, reward: null, milestones: [] };
  }
  const d = ensureDiscovery(save);
  if (d.solved.includes(id)) {
    return { granted: false, already: true, record: rec, reward: null, milestones: [] };
  }
  // Solving something you walked up to without the arrival beat firing (the
  // player approached from a direction the trigger missed) still counts as
  // having found it — otherwise the meter would owe a credit it never pays.
  if (!d.found.includes(id)) d.found.push(id);
  d.solved.push(id);

  const reward = grantReward(save, rewardOverride || rec.reward, `solve:${id}`);
  const milestones = claimMilestones(save);
  return { granted: true, already: false, record: rec, reward, milestones };
}

/**
 * Pay the twelve-page set bonus if the collection just closed. Safe to call
 * after every page; it is a no-op until the last one and exactly once after.
 */
export function claimPageSet(save) {
  const d = ensureDiscovery(save);
  if (d.claimed.includes(PAGE_SET_CLAIM)) return null;
  if (pagesFound(save).length < STORY_PAGES.length) return null;
  return grantReward(save, PAGE_SET_REWARD, PAGE_SET_CLAIM);
}

/**
 * Pay out every milestone the meter has crossed and not yet been paid for.
 * Returns the newly claimed ones, in order, so the HUD can queue their lines.
 *
 * Crossing several at once is possible (a save imported at 80 per cent pays
 * 25/50/75 on the first call) and is handled by iterating rather than by
 * finding "the" current milestone.
 */
export function claimMilestones(save) {
  const { pct } = discoveryProgress(save);
  const out = [];
  for (const ms of MILESTONES) {
    if (pct + 1e-9 < ms.at) continue;
    if (isClaimed(save, ms.id)) continue;
    const reward = grantReward(save, ms.reward, ms.id);
    if (reward.granted) out.push({ ...ms, payout: reward });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROXIMITY & THE COMPASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Everything the player is currently standing inside the trigger radius of and
 * has not found yet. The runtime calls this off the movement tick and hands
 * each result to `discover`.
 *
 * Allocation: one array, and only when something is actually in range — the
 * common case (nothing nearby) returns a shared frozen empty array, so this is
 * safe to call every frame.
 */
const NONE = Object.freeze([]);

export function scanProximity(save, x, z, opts = {}) {
  const d = ensureDiscovery(save);
  const pool = opts.pool || DISCOVERIES;
  let hits = null;
  for (const rec of pool) {
    if (d.found.includes(rec.id)) continue;
    const dx = x - rec.x;
    const dz = z - rec.z;
    const r = rec.radius;
    if (dx * dx + dz * dz > r * r) continue;
    (hits || (hits = [])).push(rec);
  }
  return hits || NONE;
}

/**
 * The compass. Points at the nearest thing worth going to and says how sure it
 * is — that is the whole design, and the restraint is the point.
 *
 * A shrine or a landmark puzzle is a LANDMARK: it is meant to be seen from
 * across the biome, so the compass names it and gives a bearing (`precise`).
 * A grotto or a page is HIDDEN: naming it would delete the discovery, so the
 * compass gives only `heat` — 0 at the edge of your senses, 1 on top of it —
 * and withholds the bearing until you are inside LOCK_RANGE and have
 * effectively found it by yourself.
 *
 * Range scales with the Keen Eye buff, which is what makes that shrine worth
 * solving.
 *
 * @returns {null|{id:string, kind:string, name:?string, tint:number,
 *                 distance:number, bearing:?number, heat:number,
 *                 precise:boolean, biome:string}}
 */
export function compassHint(save, x, z, opts = {}) {
  const d = ensureDiscovery(save);
  const sense = (opts.senseRange || SENSE_RANGE) * (1 + buffValue(save, 'senseRadius'));
  const lock = opts.lockRange || LOCK_RANGE;
  const pool = opts.pool || DISCOVERIES;
  const wantKind = opts.kind || null;

  let best = null;
  let bestScore = Infinity;
  for (const rec of pool) {
    if (wantKind && rec.kind !== wantKind) continue;
    // Incomplete, not merely unfound: a shrine you located but never solved is
    // still somewhere to go, and the compass should keep offering it.
    const done = ARRIVAL_KINDS.has(rec.kind) ? d.found.includes(rec.id) : d.solved.includes(rec.id);
    if (done) continue;
    const dist = Math.hypot(x - rec.x, z - rec.z);
    // Hidden things are simply not perceptible past your senses; visible ones
    // always are, but are ranked behind a hidden thing you are close to, so
    // standing next to a waterfall does not point you at a distant shrine.
    if (rec.hidden && dist > sense) continue;
    const score = rec.hidden ? dist : dist + sense;
    if (score < bestScore) { bestScore = score; best = { rec, dist }; }
  }
  if (!best) return null;

  const { rec, dist } = best;
  const precise = !rec.hidden || dist <= lock;
  const heat = rec.hidden
    ? Math.max(0, Math.min(1, 1 - dist / Math.max(sense, 1e-6)))
    : 1;
  return {
    id: rec.id,
    kind: rec.kind,
    name: precise ? rec.name : null,
    tint: rec.tint,
    biome: rec.biome,
    distance: dist,
    // Screen-space bearing is the host's business; this is a world-space angle
    // measured the same way the controller measures yaw.
    bearing: precise ? Math.atan2(rec.x - x, rec.z - z) : null,
    heat,
    precise,
  };
}

/**
 * Every marker the map screen may draw: found things, with their kind and
 * whether they are finished. Unfound things are deliberately absent — the map
 * is a record of where you have been, not a list of where to go.
 */
export function mapMarkers(save) {
  const d = ensureDiscovery(save);
  const out = [];
  for (const rec of DISCOVERIES) {
    if (!d.found.includes(rec.id)) continue;
    out.push({
      id: rec.id, kind: rec.kind, biome: rec.biome, x: rec.x, z: rec.z,
      tint: rec.tint, name: rec.name,
      complete: ARRIVAL_KINDS.has(rec.kind) ? true : d.solved.includes(rec.id),
    });
  }
  return out;
}
