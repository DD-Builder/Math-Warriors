/**
 * progression — every "you got better" beat, staged IN THE WORLD.
 *
 * ── THE PROBLEM THIS FIXES ─────────────────────────────────────────────────
 * The game already tracks a great deal of growth: levels, three evolution
 * stages with branching paths, four bond ranks per pair, ten achievements,
 * daily quests, discovery rank. Almost none of it is visible from the island.
 * A child levels up and gets a line of text on a toast that fades in 1.6 s
 * while the camera looks at the back of their head.
 *
 * A reward that is a sentence is not a reward. So this module turns each of
 * those events into a MOMENT: a papercut burst at a place, a camera that
 * notices, and a sound — and hands it to machinery that already exists.
 *
 * ── TWO TIERS, AND THE REASON THERE ARE ONLY TWO ───────────────────────────
 * Not everything deserves a cutscene. A level-up happens every second or third
 * fight; letterboxing that would make the game unplayable inside an hour, and
 * a five-year-old cannot skip what they cannot read. So:
 *
 *   'beat'    (level-up, bond rank, achievement, quest, coin milestone)
 *             ~0.9 s. No letterbox, no input lock, no camera takeover. A burst
 *             of paper over the hero's head, a short punch on the follow boom,
 *             a sound. The player keeps walking THROUGH it. This is the tier
 *             that has to feel good the hundredth time.
 *
 *   'staged'  (evolution, floor complete, discovery rank, the finale)
 *             2-8 s through the cinematic director that OverworldScene already
 *             owns. Letterbox, held shot, card. This tier is rare on purpose:
 *             an evolution happens maybe fifteen times in the whole game.
 *
 * Nothing in this file draws anything or moves a camera. It decides WHAT
 * happened, WHICH tier it is, and hands out a descriptor — the burst spec for
 * abilityFx, the beat spec for the follow boom, or a sequence in exactly the
 * shape src/overworld/cinematics.js compiles. That is why the wiring is small:
 * both consumers already exist and are already wired.
 *
 * ── WHY THERE IS A QUEUE ───────────────────────────────────────────────────
 * Rewards arrive in clumps. Finishing a floor can, in one frame, produce a
 * level-up, two bond ranks, an achievement, a quest completion and a floor
 * card. Fired together they are one indistinguishable flash and the child
 * learns nothing about which thing they did. The queue spaces them by
 * MIN_GAP and lets a staged moment hold the line until it finishes, so five
 * rewards read as five rewards.
 *
 * ── NO RULES ARE DUPLICATED HERE ───────────────────────────────────────────
 * Whether a hero may evolve is evolution.js's call. What a bond rank is worth
 * is bonds.js's. Whether an achievement fired is achievements.js's. This file
 * imports all three and asks them; it re-implements none of them. The only
 * knowledge it owns is PRESENTATION — which is the thing none of them have.
 */
import { PAPER } from '../config.js';
import { computeLevel, getHeroById } from '../data/heroes.js';
import { getEvolutionStage, canEvolveStage2, canEvolveStage3, getEvolvedName } from '../systems/evolution.js';
import { getBondRank, bondKey } from '../systems/bonds.js';
import { checkAchievements } from '../systems/achievements.js';

// ───────────────────────────────────────────────────────────────────────────
// KINDS
// ───────────────────────────────────────────────────────────────────────────

export const MOMENT = Object.freeze({
  LEVEL_UP: 'levelUp',
  EVOLUTION: 'evolution',
  EVOLUTION_READY: 'evolutionReady',
  BOND: 'bond',
  ACHIEVEMENT: 'achievement',
  QUEST: 'quest',
  DISCOVERY_RANK: 'discoveryRank',
  ABILITY_GATE: 'abilityGate',
  FLOOR_COMPLETE: 'floorComplete',
});

export const TIER = Object.freeze({ BEAT: 'beat', STAGED: 'staged' });

/**
 * Seconds between two consecutive 'beat' moments.
 *
 * 0.55 s is the shortest gap at which two paper bursts read as two events
 * rather than one messy one — measured the way everything else in this project
 * is measured, by watching it, not by taste.
 */
export const MIN_GAP = 0.55;

/**
 * PRESENTATION, one row per kind.
 *
 *   tier     which of the two above
 *   tint     PAPER colour of the burst and the card edge
 *   sfx      a REAL key from systems/sfxLibrary.js — checked by the tests, so
 *            a renamed recipe breaks a test instead of going silent in the game
 *   burst    {count, power, life} for the papercut shard pool
 *   beat     {punch, fovKick, shake, hold} for the follow boom. `punch` is a
 *            momentary boom shortening in metres — the camera leans IN, which
 *            is the cheapest "something good happened" a third-person camera
 *            has. Zero for staged kinds; the director owns the eye there.
 *   rank     sort order when several land at once. Bigger goes first, because
 *            a child should see the biggest thing first while they are still
 *            looking.
 */
export const MOMENT_STYLE = Object.freeze({
  [MOMENT.LEVEL_UP]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.gold, sfx: 'combat/level-up',
    burst: Object.freeze({ count: 18, power: 1.0, life: 1.05 }),
    beat: Object.freeze({ punch: 0.55, fovKick: 2.0, shake: 0.06, hold: 0.9 }),
    rank: 40,
  }),
  [MOMENT.EVOLUTION]: Object.freeze({
    tier: TIER.STAGED, tint: PAPER.lavender, sfx: 'world/secret',
    burst: Object.freeze({ count: 40, power: 1.7, life: 1.9 }),
    beat: Object.freeze({ punch: 0, fovKick: 0, shake: 0, hold: 0 }),
    rank: 100,
  }),
  // "You COULD evolve" is not the evolution. It is a nudge, and it must stay
  // small or it becomes nagging: one chime, one soft burst, no camera.
  [MOMENT.EVOLUTION_READY]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.lavenderD, sfx: 'ui/streak',
    burst: Object.freeze({ count: 10, power: 0.6, life: 0.9 }),
    beat: Object.freeze({ punch: 0.2, fovKick: 0, shake: 0, hold: 0.6 }),
    rank: 55,
  }),
  [MOMENT.BOND]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.rose, sfx: 'world/fairy',
    burst: Object.freeze({ count: 22, power: 1.1, life: 1.2 }),
    beat: Object.freeze({ punch: 0.4, fovKick: 1.2, shake: 0.04, hold: 0.85 }),
    rank: 50,
  }),
  [MOMENT.ACHIEVEMENT]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.orange, sfx: 'world/chest',
    burst: Object.freeze({ count: 16, power: 0.95, life: 1.0 }),
    beat: Object.freeze({ punch: 0.35, fovKick: 1.0, shake: 0.04, hold: 0.8 }),
    rank: 45,
  }),
  [MOMENT.QUEST]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.leaf, sfx: 'ui/confirm',
    burst: Object.freeze({ count: 12, power: 0.7, life: 0.9 }),
    beat: Object.freeze({ punch: 0.25, fovKick: 0, shake: 0, hold: 0.7 }),
    rank: 30,
  }),
  [MOMENT.DISCOVERY_RANK]: Object.freeze({
    tier: TIER.STAGED, tint: PAPER.teal, sfx: 'world/secret',
    burst: Object.freeze({ count: 34, power: 1.4, life: 1.6 }),
    beat: Object.freeze({ punch: 0, fovKick: 0, shake: 0, hold: 0 }),
    rank: 80,
  }),
  // Opening a door that needed a particular hero. Small, but it MUST fire —
  // it is the only confirmation a child gets that swapping was the answer.
  [MOMENT.ABILITY_GATE]: Object.freeze({
    tier: TIER.BEAT, tint: PAPER.tealL, sfx: 'world/door-unlock',
    burst: Object.freeze({ count: 20, power: 1.2, life: 1.1 }),
    beat: Object.freeze({ punch: 0.45, fovKick: 1.5, shake: 0.05, hold: 0.85 }),
    rank: 60,
  }),
  [MOMENT.FLOOR_COMPLETE]: Object.freeze({
    tier: TIER.STAGED, tint: PAPER.gold, sfx: 'world/floor-complete',
    burst: Object.freeze({ count: 48, power: 1.8, life: 2.2 }),
    beat: Object.freeze({ punch: 0, fovKick: 0, shake: 0, hold: 0 }),
    rank: 120,
  }),
});

/** Style row for a kind, with a safe fallback so a new kind is never a throw. */
export function styleFor(kind) {
  return MOMENT_STYLE[kind] || MOMENT_STYLE[MOMENT.QUEST];
}

/**
 * THE WORDS.
 *
 * One line each, in the voice the rest of the game uses: warm, short, never
 * congratulatory-adult ("Great job!"), always about the thing that changed.
 */
export function momentTitle(m) {
  switch (m.kind) {
    case MOMENT.LEVEL_UP: return `${m.name} — LEVEL ${m.level}`;
    case MOMENT.EVOLUTION: return `${m.name}`;
    case MOMENT.EVOLUTION_READY: return `${m.name} IS READY`;
    case MOMENT.BOND: return `${m.rank} BOND`;
    case MOMENT.ACHIEVEMENT: return m.name;
    case MOMENT.QUEST: return 'QUEST DONE';
    case MOMENT.DISCOVERY_RANK: return m.name;
    case MOMENT.ABILITY_GATE: return m.name;
    case MOMENT.FLOOR_COMPLETE: return 'COMPLETE';
    default: return '';
  }
}

export function momentLine(m) {
  switch (m.kind) {
    case MOMENT.LEVEL_UP: return 'Taller than yesterday.';
    case MOMENT.EVOLUTION: return 'Folded again, into something new.';
    case MOMENT.EVOLUTION_READY: return 'Something wants to change. Find a quiet place.';
    case MOMENT.BOND: return `${m.a} and ${m.b} have each other's back.`;
    case MOMENT.ACHIEVEMENT: return m.desc || '';
    case MOMENT.QUEST: return 'One more thing done today.';
    case MOMENT.DISCOVERY_RANK: return 'The island knows your name a little better.';
    case MOMENT.ABILITY_GATE: return 'That took the right hands.';
    case MOMENT.FLOOR_COMPLETE: return 'Mended.';
    default: return '';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// DETECTION
// ───────────────────────────────────────────────────────────────────────────

/**
 * A cheap, comparable picture of everything this module watches.
 *
 * Deliberately flat and primitive-only: it is diffed, stored between sweeps
 * and never mutated. Roughly 40 numbers for a full party, so taking one every
 * time the world changes costs nothing.
 */
export function snapshotProgress(save) {
  const heroes = {};
  for (const h of save?.party || []) {
    if (!h || !h.id) continue;
    heroes[h.id] = {
      level: h.level || computeLevel(h.xp || 0),
      stage: getEvolutionStage(save, h.id),
    };
  }
  const bonds = {};
  for (const [key, rec] of Object.entries(save?.heroBonds || {})) {
    if (rec && rec.rank) bonds[key] = rec.rank;
  }
  return {
    heroes,
    bonds,
    achievements: [...(save?.stats?.achievements || [])],
    floors: (save?.floors || []).filter((f) => f && f.complete).map((f) => f.id),
    discovery: (save?.overworld?.discovery?.found || []).length,
  };
}

const RANK_ORDER = ['C', 'B', 'A', 'S'];
const rankIndex = (r) => RANK_ORDER.indexOf(r);

/**
 * What changed between two snapshots, as moments, biggest first.
 *
 * Pure — it never touches the save. The caller decides whether to show them.
 */
export function diffProgress(before, after, save = null) {
  const out = [];
  const prev = before || { heroes: {}, bonds: {}, achievements: [], floors: [] };

  for (const [id, now] of Object.entries(after.heroes || {})) {
    const was = prev.heroes?.[id];
    if (was && now.level > was.level) {
      out.push({
        kind: MOMENT.LEVEL_UP, heroId: id, level: now.level,
        from: was.level, name: heroName(save, id),
      });
    }
    if (was && now.stage > was.stage) {
      out.push({
        kind: MOMENT.EVOLUTION, heroId: id, stage: now.stage,
        from: was.stage, name: heroName(save, id),
      });
    }
  }

  for (const [key, rank] of Object.entries(after.bonds || {})) {
    const was = prev.bonds?.[key] || null;
    if (rankIndex(rank) > rankIndex(was)) {
      const [a, b] = key.split('|');
      out.push({
        kind: MOMENT.BOND, key, rank, from: was,
        heroId: a, a: heroName(save, a), b: heroName(save, b),
      });
    }
  }

  const had = new Set(prev.achievements || []);
  for (const id of after.achievements || []) {
    if (!had.has(id)) out.push({ kind: MOMENT.ACHIEVEMENT, id, name: id });
  }

  const hadFloors = new Set(prev.floors || []);
  for (const id of after.floors || []) {
    if (!hadFloors.has(id)) out.push({ kind: MOMENT.FLOOR_COMPLETE, floorId: id });
  }

  return sortMoments(out);
}

/** Biggest first, stable within a rank. */
export function sortMoments(list) {
  return list
    .map((m, i) => ({ m, i }))
    .sort((p, q) => (styleFor(q.m.kind).rank - styleFor(p.m.kind).rank) || (p.i - q.i))
    .map((p) => p.m);
}

function heroName(save, id) {
  if (save) {
    const evolved = getEvolvedName(save, id);
    if (evolved) return evolved;
  }
  const def = getHeroById(id);
  return def ? def.name : id;
}

/**
 * Ask every system whether something is newly true, and turn the answers into
 * moments. This is where achievements.js's side-effecting check lives, and it
 * is the ONLY place it is called from the overworld, so an achievement cannot
 * fire twice.
 *
 * MUTATES `save` — checkAchievements does, by design (it records what it
 * granted). Everything else here is a read.
 */
export function sweepProgress(save, before = null) {
  const moments = [];

  for (const ach of checkAchievements(save)) {
    moments.push({ kind: MOMENT.ACHIEVEMENT, id: ach.id, name: ach.name, desc: ach.desc });
  }

  const after = snapshotProgress(save);
  for (const m of diffProgress(before, after, save)) {
    // Achievements were just granted above; the diff would double them.
    if (m.kind === MOMENT.ACHIEVEMENT) continue;
    moments.push(m);
  }

  // "You may evolve" — a read-only nudge, fired once per hero per stage. The
  // ledger lives on the save so it survives a reload; it is additive and needs
  // no migration (an old save simply has no key yet).
  const seen = ensureNudges(save);
  for (const h of save?.party || []) {
    if (!h || !h.id) continue;
    const lvl = h.level || computeLevel(h.xp || 0);
    const stage = getEvolutionStage(save, h.id);
    let ready = false;
    if (stage < 2) ready = canEvolveStage2(save, h.id, lvl).eligible;
    else if (stage < 3) ready = canEvolveStage3(save, h.id, lvl).eligible;
    if (!ready) continue;
    const key = `${h.id}:${stage}`;
    if (seen.indexOf(key) >= 0) continue;
    seen.push(key);
    moments.push({
      kind: MOMENT.EVOLUTION_READY, heroId: h.id, stage: stage + 1, name: heroName(save, h.id),
    });
  }

  return { moments: sortMoments(moments), snapshot: after };
}

/** The evolution-nudge ledger, created on demand. */
export function ensureNudges(save) {
  if (!save.overworld) save.overworld = {};
  if (!Array.isArray(save.overworld.evolutionNudges)) save.overworld.evolutionNudges = [];
  return save.overworld.evolutionNudges;
}

/** Has this pair just crossed a rank? Used by the battle-return path. */
export function bondMoment(save, aId, bId, beforeRank) {
  const rank = getBondRank(save, aId, bId);
  if (rankIndex(rank) <= rankIndex(beforeRank)) return null;
  return {
    kind: MOMENT.BOND, key: bondKey(aId, bId), rank, from: beforeRank,
    heroId: aId, a: heroName(save, aId), b: heroName(save, bId),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THE QUEUE
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pace moments so a clump reads as a list.
 *
 * @param {object} opts
 *   save
 *   hooks.onBeat(moment, style)   — fire the burst, punch the boom, play the
 *                                   sound. Returns nothing; it is not blocking.
 *   hooks.onStaged(moment, style) — play the cinematic. MUST return true if it
 *                                   took the moment (the queue then waits for
 *                                   `done()`), false/undefined if it could not
 *                                   (already seen, no director) — in which case
 *                                   the queue degrades it to a beat rather than
 *                                   dropping it, because a reward that silently
 *                                   evaporates is worse than a small one.
 *   hooks.onIdle()                — the queue just drained. The HUD un-dims.
 *   gap                           — override MIN_GAP (tests, reduced motion)
 */
export function createMomentQueue({ hooks = {}, gap = MIN_GAP } = {}) {
  const pending = [];
  let cool = 0;
  /** Set while a staged moment owns the screen; cleared by done(). */
  let blocking = null;
  let fired = 0;

  function push(moments) {
    if (!moments) return 0;
    const list = Array.isArray(moments) ? moments : [moments];
    let n = 0;
    for (const m of list) {
      if (!m || !m.kind) continue;
      pending.push(m);
      n++;
    }
    if (n > 1 || pending.length > 1) sortInPlace();
    return n;
  }

  function sortInPlace() {
    const sorted = sortMoments(pending);
    pending.length = 0;
    for (const m of sorted) pending.push(m);
  }

  /** A staged moment finished. The host calls this from the director's onEnd. */
  function done() {
    blocking = null;
    cool = gap;
  }

  function pump(dt) {
    if (blocking) return null;
    if (cool > 0) {
      cool -= dt;
      if (cool > 0) return null;
      cool = 0;
    }
    const m = pending.shift();
    if (!m) {
      if (fired > 0) { fired = 0; hooks.onIdle?.(); }
      return null;
    }
    fired++;
    const style = styleFor(m.kind);
    if (style.tier === TIER.STAGED) {
      const took = hooks.onStaged?.(m, style);
      if (took) { blocking = m; return m; }
      // Degrade, do not drop.
      hooks.onBeat?.(m, MOMENT_STYLE[MOMENT.LEVEL_UP]);
      cool = gap;
      return m;
    }
    hooks.onBeat?.(m, style);
    cool = gap;
    return m;
  }

  return {
    push, pump, done,
    get pending() { return pending.length; },
    get busy() { return !!blocking || pending.length > 0; },
    get blocking() { return blocking; },
    /** A context loss, a scene change: forget everything, quietly. */
    clear() { pending.length = 0; blocking = null; cool = 0; fired = 0; },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THE STAGED MOMENTS, AS CINEMATIC SEQUENCES
// ───────────────────────────────────────────────────────────────────────────
//
// Everything below returns a sequence in exactly the shape
// src/overworld/cinematics.js compiles and OverworldScene's director already
// plays. No new camera plumbing, no new stage furniture, no new beat types.

/**
 * An evolution, staged where the hero is standing.
 *
 * The shot is a slow orbit that ends closer than it started, because the thing
 * that changed is the CHARACTER and the frame has to end on their face. The
 * burst fires at the beat where the old form goes and the new one arrives —
 * `onEvolve` is called there, so the host's rig swap happens on camera.
 */
export function evolutionCinematic(m, { at, onEvolve = null, lines = null } = {}) {
  const t = at || { x: 0, y: 0, z: 0 };
  return {
    id: `evolve:${m.heroId}:${m.stage}`,
    once: false,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 450 },
        {
          t: 'camera', dur: 1400, ease: 'sine.out',
          to: {
            pos: { x: t.x + 6.5, y: t.y + 3.2, z: t.z + 6.5 },
            look: { x: t.x, y: t.y + 1.5, z: t.z }, fov: 44,
          },
        },
        { t: 'sfx', key: 'ui/streak' },
      ],
      [
        { t: 'do', run: () => { if (typeof onEvolve === 'function') onEvolve(); } },
        { t: 'hero', pose: 'cheer' },
        { t: 'sfx', key: MOMENT_STYLE[MOMENT.EVOLUTION].sfx },
        { t: 'stinger', name: 'discovery' },
        {
          t: 'camera', dur: 1900, ease: 'sine.inOut',
          to: {
            pos: { x: t.x - 3.4, y: t.y + 2.4, z: t.z + 4.6 },
            look: { x: t.x, y: t.y + 1.6, z: t.z }, fov: 40,
          },
        },
      ],
      [{
        t: 'card', kind: 'complete', title: momentTitle(m),
        epithet: momentLine(m), tint: MOMENT_STYLE[MOMENT.EVOLUTION].tint, dur: 2200,
      }],
      ...(lines?.length ? [{ t: 'say', lines }] : []),
      [
        {
          t: 'camera', dur: 1200, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 600 },
      ],
    ],
  };
}

/**
 * A discovery rank, staged as a look at the island itself rather than at the
 * player: the rank is about how much of the place you know, so the shot pulls
 * UP and back and lets the child see how much ground that is.
 */
export function discoveryRankCinematic(m, { at } = {}) {
  const t = at || { x: 0, y: 0, z: 0 };
  return {
    id: `rank:${m.id || m.name}`,
    once: true,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 450 },
        {
          t: 'camera', dur: 2400, ease: 'sine.out',
          to: {
            pos: { x: t.x, y: t.y + 34, z: t.z + 30 },
            look: { x: t.x, y: t.y + 2, z: t.z }, fov: 52,
          },
        },
        { t: 'sfx', key: MOMENT_STYLE[MOMENT.DISCOVERY_RANK].sfx },
      ],
      [{
        t: 'card', kind: 'complete', title: momentTitle(m),
        epithet: momentLine(m), tint: m.tint || MOMENT_STYLE[MOMENT.DISCOVERY_RANK].tint, dur: 2200,
      }],
      [
        {
          t: 'camera', dur: 1400, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 600 },
      ],
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// FINISHING A FLOOR
// ───────────────────────────────────────────────────────────────────────────

/**
 * REWARD FLIGHT — the loot arrives as objects, in order, one at a time.
 *
 * A results screen listing "+220 gold, +180 XP, 1 potion" is a receipt. The
 * same three things flying out of the mended thing and into the HUD chips,
 * 180 ms apart, with a coin sound on each, is a reward. This function only
 * decides the ORDER and the TIMING; abilityFx flies them and the HUD catches
 * them.
 *
 * Order is smallest-to-biggest so the sequence builds. Gold is split into up
 * to `maxCoins` physical coins because eleven coins reads as "a lot" and one
 * coin labelled x220 reads as a spreadsheet.
 */
export const REWARD_STAGGER = 0.16;
export const REWARD_ORDER = Object.freeze(['potion', 'item', 'xp', 'gold', 'hero']);

export function rewardFlight(rewards = {}, { maxCoins = 11, stagger = REWARD_STAGGER } = {}) {
  const out = [];
  const push = (kind, amount, tint, label) => out.push({ kind, amount, tint, label, at: 0 });

  if (rewards.potions > 0) push('potion', rewards.potions, PAPER.rose, `+${rewards.potions}`);
  for (const it of rewards.items || []) push('item', 1, PAPER.lavender, it.name || String(it));
  if (rewards.xp > 0) push('xp', rewards.xp, PAPER.tealL, `+${rewards.xp} XP`);
  if (rewards.gold > 0) {
    const coins = Math.max(1, Math.min(maxCoins, Math.round(Math.sqrt(rewards.gold))));
    const each = Math.floor(rewards.gold / coins);
    let left = rewards.gold;
    for (let i = 0; i < coins; i++) {
      const amt = i === coins - 1 ? left : each;
      left -= amt;
      push('gold', amt, PAPER.gold, i === 0 ? `+${rewards.gold}` : '');
    }
  }
  if (rewards.heroId) push('hero', 1, PAPER.coral, rewards.heroName || rewards.heroId);

  const rank = (k) => { const i = REWARD_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  out.sort((a, b) => rank(a.kind) - rank(b.kind));
  for (let i = 0; i < out.length; i++) out[i].at = i * stagger;
  return out;
}

/** How long the whole flight takes, so the sequence can hold for it. */
export function rewardFlightDuration(flight, tail = 0.5) {
  if (!flight.length) return 0;
  return flight[flight.length - 1].at + tail;
}

/**
 * THE FLOOR-COMPLETE SEQUENCE.
 *
 * Three beats, in this order, and the order is the whole design:
 *
 *   1. THE REWARDS FLY IN. Camera is still on the hero, boom pulled back a
 *      little. The loot comes out of the thing that was mended and arcs into
 *      the HUD. This is first because it is the child's own doing arriving
 *      back at them, and it wants no competition.
 *
 *   2. THE WORLD TRANSFORMS, ON CAMERA. The eye leaves the hero and goes to
 *      the thing that is about to change — the bridge, the tide, the gate —
 *      and HOLDS while `onTransform` fires and the geometry moves. This beat
 *      is copied in spirit from cinematics.challengeComplete, which already
 *      argued the case: the hold is not padding, the hold IS the reward.
 *
 *   3. THE CARD STAMPS. The objective card comes up and the word COMPLETE
 *      lands on it like a rubber stamp — one hard beat with a sound, not a
 *      fade. `onStamp` fires on that frame so the HUD's own card can animate
 *      in step with the 3D one.
 *
 * Everything is optional: no rewards means step 1 is skipped, no `onTransform`
 * means step 2 is a held look at the place. A floor with neither still stamps.
 */
export function floorCompleteSequence({
  floorId,
  at = null,
  heroAt = null,
  rewards = null,
  flight = null,
  onRewards = null,
  onTransform = null,
  onStamp = null,
  lines = null,
  title = null,
  tint = PAPER.gold,
} = {}) {
  const t = at || { x: 0, y: 1, z: 0 };
  const h = heroAt || t;
  const loot = flight || (rewards ? rewardFlight(rewards) : []);
  const lootMs = Math.round(rewardFlightDuration(loot) * 1000);
  const steps = [];

  // 1 ── the rewards
  if (loot.length) {
    steps.push([
      { t: 'letterbox', on: true, dur: 400 },
      { t: 'do', run: () => { if (typeof onRewards === 'function') onRewards(loot); } },
      { t: 'hero', pose: 'cheer' },
      {
        t: 'camera', dur: Math.max(900, lootMs), ease: 'sine.out',
        to: {
          pos: { x: h.x + 4.5, y: h.y + 4.0, z: h.z + 8.0 },
          look: { x: h.x, y: h.y + 1.4, z: h.z }, fov: 50,
        },
      },
      { t: 'sfx', key: 'world/coin' },
    ]);
  } else {
    steps.push([{ t: 'letterbox', on: true, dur: 400 }]);
  }

  // 2 ── the world changes, and we watch it
  steps.push([
    {
      t: 'camera', dur: 1500, ease: 'sine.inOut',
      to: {
        pos: { x: t.x + 11, y: t.y + 9, z: t.z + 13 },
        look: { x: t.x, y: t.y + 1, z: t.z }, fov: 46,
      },
    },
    { t: 'sfx', key: 'world/floor-complete' },
  ]);
  steps.push([
    { t: 'do', run: () => { if (typeof onTransform === 'function') onTransform(); } },
    { t: 'prop', id: 'transform', anim: 'grow', dur: 2400 },
    { t: 'stinger', name: 'floor' },
    {
      t: 'camera', dur: 2400, ease: 'sine.inOut',
      to: {
        pos: { x: t.x - 6, y: t.y + 7, z: t.z + 15 },
        look: { x: t.x, y: t.y + 1.2, z: t.z }, fov: 48,
      },
    },
  ]);
  steps.push({ t: 'hold', dur: 500 });

  // 3 ── the stamp
  steps.push([
    { t: 'do', run: () => { if (typeof onStamp === 'function') onStamp(); } },
    { t: 'card', kind: 'complete', title: title || 'COMPLETE', epithet: 'mended', tint, dur: 2200 },
    { t: 'sfx', key: 'ui/confirm' },
  ]);

  if (lines?.length) steps.push({ t: 'say', lines });

  steps.push([
    {
      t: 'camera', dur: 1300, ease: 'sine.inOut',
      to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
    },
    { t: 'letterbox', on: false, dur: 600 },
  ]);

  return { id: `floorcomplete:${floorId}`, once: false, steps };
}

/**
 * The right sequence for a staged moment, or null when the host should not
 * stage it. One call, so the wiring is a single line inside `onStaged`.
 */
export function stagedCinematic(m, deps = {}) {
  switch (m.kind) {
    case MOMENT.EVOLUTION: return evolutionCinematic(m, deps);
    case MOMENT.DISCOVERY_RANK: return discoveryRankCinematic(m, deps);
    case MOMENT.FLOOR_COMPLETE: return floorCompleteSequence({ floorId: m.floorId, ...deps });
    default: return null;
  }
}
