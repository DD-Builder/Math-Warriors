/**
 * floorRules — the floor's GAME RULES, with no presentation attached.
 *
 * There are now two front-ends onto the same nine floors: the 2D tile maze
 * (scenes/MazeScene.js) and the 3D place (overworld/level3d.js driven by
 * scenes/OverworldScene.js). Everything a floor MEANS — how many challenge
 * items open the transform, which math doors seal a chest, when the boss will
 * accept a fight, what the golden chest gates, what the objective line reads —
 * has to be identical in both, or the two entrances become two different games
 * that happen to share a tile grid.
 *
 * So the rules live here, once, as pure functions over plain data:
 *
 *   - no Phaser, no three, no DOM, no audio, no tweens;
 *   - nothing here mutates a scene, only `save`/`party`/`obj` where the 2D
 *     game already mutated them (grants and pushes are stated as such);
 *   - every function takes the floor's `objects` array (the SAME shape both
 *     front-ends carry: the raw entries out of data/levels.js, decorated with
 *     `consumed` / `activated` / `open`) and a small progress record.
 *
 * The progress record is the intersection of MazeScene's fields and the 3D
 * runtime's, deliberately named the same in both:
 *
 *   { challengeProgress, phase2Progress, phase2Active, bossDefeated,
 *     hasKey, mazeTransformed, secretDone, secretSeq }
 *
 * WHAT THIS MODULE DOES NOT OWN: anything that needs a scene to happen —
 * dialogue, particles, the tween on a rescued hero, the actual scene
 * transition on exit. Those are presentation, and presentation is exactly the
 * thing the two front-ends are allowed to disagree about.
 */
import { FLOOR_OPERATORS } from '../data/enemies.js';

/** Fallback challenge config for a floor that declares none. */
const DEFAULT_CHALLENGE = {
  count: 3, label: 'ITEM', verb: 'found', allDoneMsg: 'Challenge complete!',
};

/** Every `obj.type` that counts as a challenge pickup on some floor. */
export const CHALLENGE_TYPES = [
  'fairy', 'valve', 'beacon', 'vent', 'fragment', 'crystal', 'geoshard',
  'token', 'page', 'rune', 'coralkey', 'windchime', 'lavabridge',
  'thawcrystal', 'prismshard', 'vaultseal', 'chapterseal', 'eqanchor',
];
const CHALLENGE_SET = new Set(CHALLENGE_TYPES);

/** True when stepping on this object should run the challenge-item rule. */
export function isChallengeType(type) { return CHALLENGE_SET.has(type); }

/** The floor's challenge config, never undefined. */
export function challengeGoal(floor) {
  return floor?.challenge || DEFAULT_CHALLENGE;
}

/** A fresh floor's progress record. Both front-ends start here. */
export function initialProgress() {
  return {
    challengeProgress: 0,
    phase2Progress: 0,
    phase2Active: false,
    bossDefeated: false,
    hasKey: false,
    mazeTransformed: false,
    secretDone: false,
    secretSeq: 0,
  };
}

// ── Math-door locks ────────────────────────────────────────────────────────

/**
 * The interaction lock gate, as a lookup.
 *
 * An object may be sealed behind one or more math doors (`obj.lock` = a door
 * id, or an array of ids answered in order). Returns the FIRST lock door that
 * is still shut, or null when every lock is open and the interaction may
 * proceed. Lock doors are always answerable, so a lock can never make a floor
 * unwinnable — that invariant is why this is a lookup and not a veto.
 */
export function nextLockDoor(objects, obj) {
  if (!obj || !obj.lock) return null;
  const ids = Array.isArray(obj.lock) ? obj.lock : [obj.lock];
  for (const id of ids) {
    const door = (objects || []).find((o) => o.id === id);
    if (!door || door.open) continue;
    return door;
  }
  return null;
}

/**
 * The question spec for a door — its own operator if it carries one (the Four
 * Keys of Thaw, the memory-palace wings), else the floor's. Feed straight to
 * systems/math.js generateRatedQuestion along with a grade.
 */
export function doorQuestionSpec(door, floorId) {
  return {
    operator: door?.operator || FLOOR_OPERATORS[floorId] || '+',
    streak: 0,
    floor: floorId,
    targetStars: [2, 3],
  };
}

// ── Hard gates ─────────────────────────────────────────────────────────────

/**
 * The boss's territory. Until the boss is down, the golden chest and the exit
 * are unreachable even if the player found a way to stand on them.
 * @returns {boolean} true when the tile must be refused
 */
export function beyondBossBlocked(objects, bossDefeated, x, y) {
  if (bossDefeated) return false;
  const boss = (objects || []).find((o) => o.type === 'boss' && !o.consumed);
  if (!boss) return false;
  const exit = objects.find((o) => o.type === 'exit');
  const golden = objects.find((o) => o.type === 'golden' && !o.consumed);
  return !!((golden && x === golden.x && y === golden.y) ||
            (exit && x === exit.x && y === exit.y));
}

/** Will the boss accept a fight yet? */
export function bossGate(progress, floor) {
  const ch = challengeGoal(floor);
  if ((progress.challengeProgress || 0) < ch.count) {
    return { ok: false, message: 'COMPLETE THE CHALLENGE FIRST!' };
  }
  if (ch.phase2 && (progress.phase2Progress || 0) < ch.phase2.count) {
    return { ok: false, message: `FIND ALL ${ch.phase2.label}S FIRST!` };
  }
  return { ok: true, message: null };
}

/** The golden chest opens only after the boss falls. */
export function goldenGate(progress) {
  return progress.bossDefeated
    ? { ok: true, message: null }
    : { ok: false, message: 'DEFEAT THE BOSS FIRST!' };
}

/** The exit opens only with the golden key. */
export function exitGate(progress) {
  return progress.hasKey
    ? { ok: true, message: null }
    : { ok: false, message: 'FIND THE GOLDEN KEY FIRST' };
}

// ── Challenge progress ─────────────────────────────────────────────────────

/**
 * Advance the challenge by one item and say what just happened. MUTATES
 * `progress` (both front-ends already treated their progress fields as
 * mutable state) and returns the plan the caller should present.
 *
 * @returns {{ phase2:boolean, progress:number, remaining:number, done:boolean,
 *             label:string, message:string, drain:?Array, drainMessage:?string }}
 */
export function advanceChallenge(progress, floor, obj) {
  const ch = challengeGoal(floor);
  const p2 = ch.phase2;
  const isPhase2 = !!(progress.phase2Active && p2 && p2.type === obj.type);

  if (isPhase2) {
    progress.phase2Progress = (progress.phase2Progress || 0) + 1;
    const remaining = p2.count - progress.phase2Progress;
    return {
      phase2: true,
      progress: progress.phase2Progress,
      remaining,
      done: remaining <= 0,
      label: p2.label,
      message: remaining > 0
        ? `${p2.label} ${p2.verb}! ${remaining} left`
        : p2.allDoneMsg,
      drain: null,
      drainMessage: null,
    };
  }

  progress.challengeProgress = (progress.challengeProgress || 0) + 1;
  const remaining = ch.count - progress.challengeProgress;
  return {
    phase2: false,
    progress: progress.challengeProgress,
    remaining,
    done: remaining <= 0,
    label: ch.label,
    message: remaining > 0
      ? `${ch.label} ${ch.verb}! ${remaining} left`
      : ch.allDoneMsg,
    // Staged draining (the Floor 2 tide): a sluice may open its own band of
    // tiles before the final transform.
    drain: Array.isArray(obj.drain) ? obj.drain : null,
    drainMessage: obj.drainMessage || null,
  };
}

// ── Grants (these DO mutate `save` / `party`, exactly as the 2D game did) ──

/** Plain gold pickup. */
export const GOLD_PICKUP = 8;

export function grantGold(save, amount = GOLD_PICKUP) {
  save.gold = (save.gold || 0) + amount;
  return amount;
}

export function grantChest(save, obj) {
  return grantGold(save, obj?.loot?.gold ?? 10);
}

export function grantPotion(save, amount = 1) {
  save.potions = (save.potions || 0) + amount;
  return amount;
}

/**
 * Drink from a fountain. Heals the whole party to full and burns one use.
 * @returns {{ ok:boolean, healed:number, uses:number, message:string }}
 */
export function useFountain(party, obj) {
  if (!obj.uses || obj.uses <= 0) {
    return { ok: false, healed: 0, uses: 0, message: 'The fountain is depleted...' };
  }
  let healed = 0;
  for (const hero of (party || [])) {
    healed += Math.max(0, hero.maxHp - hero.hp);
    hero.hp = hero.maxHp;
  }
  obj.uses--;
  return {
    ok: true,
    healed,
    uses: obj.uses,
    message: healed > 0
      ? `Party healed! (${obj.uses} uses left)`
      : `Already at full HP! (${obj.uses} uses left)`,
  };
}

/** Write the live party back into `save.party` in the canonical shape. */
export function syncPartyToSave(save, party) {
  save.party = (party || []).map((h) => ({
    id: h.id, name: h.name, hp: h.hp, maxHp: h.maxHp,
    xp: h.xp ?? 0, level: h.level ?? 1,
  }));
  return save.party;
}

// ── The objective line ─────────────────────────────────────────────────────

/**
 * The player's current goal, derived from live progress against the level's
 * objective steps. There is never a moment without a clear "here's what to do
 * next" — and the 3D HUD must read exactly what the 2D HUD reads.
 */
export function objectiveText(progress, floor, level) {
  const ch = challengeGoal(floor);
  const steps = level?.objective || [];
  const label = (key, fallback) => steps.find((s) => s.key === key)?.label || fallback;
  const done = progress.challengeProgress || 0;
  if (done < ch.count) {
    return `${label('challenge', 'Complete the challenges')}  (${done}/${ch.count})`;
  }
  if (progress.phase2Active && ch.phase2 && (progress.phase2Progress || 0) < ch.phase2.count) {
    return `${ch.phase2.label}: ${progress.phase2Progress || 0}/${ch.phase2.count}`;
  }
  if (!progress.bossDefeated) {
    return progress.mazeTransformed
      ? label('boss', 'Face the boss!')
      : label('transform', 'The way is open — cross over!');
  }
  if (!progress.hasKey) return 'Claim the golden treasure!';
  return 'Step through the glowing exit!';
}
