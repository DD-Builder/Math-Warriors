/**
 * battleRules — the turn-based combat RULES, with no presentation attached.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The rules of a Math Warriors fight (turn order, momentum, damage, class
 * modifiers, enemy retaliation, rewards) were correct and well tested, but
 * they were written INSIDE BattleScene.js — tangled with Phaser tweens,
 * toasts and sprites. The 3D battle (overworld/battle3d.js) needs exactly
 * those rules and none of that presentation.
 *
 * So this module is the seam. It owns:
 *   · the battle STATE record (party, enemies, momentum, streak, turn cursor)
 *   · the numbers that were previously inline literals in BattleScene
 *     (class multipliers, the knight block, the bunny dodge, the damage
 *     floor, the reward formula)
 *   · the resolve functions that compose the already-pure primitives in
 *     combat.js / coach.js / difficultyRating.js into one answer.
 *
 * It owns NOTHING that draws, animates, plays a sound, or knows what a
 * scene is. Every function here is deterministic given its `rng` argument.
 *
 * INVARIANT INHERITED FROM combat.js: applyDamageResult is the only place
 * HP mutates. The resolve* functions below call it; nobody else may.
 */

import {
  advanceMomentum,
  computeCommandDamage,
  computeEnemyDamage,
  applyGuardReduction,
  applyDamageResult,
  buildTurnSequence,
  advanceTurn,
  isPartyDefeated,
  pickEnemyTarget,
  getZone,
} from './combat.js';
import { COMMANDS, getCommandConfig, getClassCommands } from './commandMenu.js';
import { rateQuestion, getDifficultyMultiplier } from './difficultyRating.js';
import { hintDamageMult, retryDamageMult, applyHintMomentum } from './coach.js';
import { generateRatedQuestion, recordAnswer } from './math.js';
import { recordSkillAnswer, updateAdaptiveLevel } from './mastery.js';
import { scheduleReview } from './review.js';
import {
  FLOOR_OPERATORS, BOSS_IDS, getEnemiesForFloor, getEnemyById, spawnEnemy,
} from '../data/enemies.js';
// The victory/defeat seam below writes the save file. These four modules are
// leaves (none of them imports battleRules), so there is no cycle.
import { markFloorComplete, unlockHeroesForFloor } from './save.js';
import { computeLevel, levelBonuses, getAvailableSupers } from '../data/heroes.js';
import { updateQuestProgress } from './dailyQuests.js';

// ------------------------------------------------------------------
// TUNING — every one of these was a bare literal inside BattleScene
// ------------------------------------------------------------------

/** A hit never lands for less than this, however many hints were spent. */
export const HERO_DAMAGE_FLOOR = 3;

/** Knights shrug off 40% of incoming blows for half damage. */
export const KNIGHT_BLOCK_CHANCE = 0.4;

/** Bunnies sidestep 30% of incoming blows entirely (60% with Dodge Roll). */
export const BUNNY_DODGE_CHANCE = 0.3;
export const BUNNY_DODGE_ROLL_CHANCE = 0.6;

/** A wizard on a 5+ streak spills a little healing onto the weakest ally. */
export const WIZARD_HEAL_STREAK = 5;
export const WIZARD_HEAL_AMOUNT = 10;

/** Streak at which the wizard's own damage multiplier steps up. */
export const WIZARD_POWER_STREAK = 3;

/** Streak at which the bunny earns a third strike in its flurry. */
export const BUNNY_FLURRY_STREAK = 4;

/** Reward curve: both gold and XP start here and climb with the floor. */
export const REWARD_BASE = 10;
export const REWARD_PER_FLOOR = 5;
export const XP_PER_CORRECT = 2;

/** Correct answers in a row before a hero's SUPER lights up. */
export const SUPER_STREAK = 3;

// ------------------------------------------------------------------
// CLASS ATTACK PROFILE
// ------------------------------------------------------------------

/**
 * How a class converts a correct answer into a blow.
 *
 * Knight  — one heavy hit (x1.3).
 * Wizard  — one hit that gets stronger once the child is on a roll, and
 *           spills healing onto the weakest ally at a 5+ streak.
 * Bunny   — a flurry: 2 strikes (3 at a 4+ streak), each weaker, netting
 *           a 1.2x total so the flurry is a style, not a nerf.
 *
 * Extracted verbatim from BattleScene.onAnswer so both the 2D and the 3D
 * battle swing for exactly the same numbers.
 *
 * @param {string} cls    'knight' | 'wizard' | 'bunny'
 * @param {number} streak current correct-answer streak
 * @returns {{ classMult:number, hitCount:number, allyHeal:number, style:string }}
 */
export function classAttackProfile(cls, streak = 0) {
  if (cls === 'wizard') {
    return {
      classMult: streak >= WIZARD_POWER_STREAK ? 1.5 : 1.0,
      hitCount: 1,
      allyHeal: streak >= WIZARD_HEAL_STREAK ? WIZARD_HEAL_AMOUNT : 0,
      style: 'cast',
    };
  }
  if (cls === 'bunny') {
    const hitCount = 2 + (streak >= BUNNY_FLURRY_STREAK ? 1 : 0);
    return {
      classMult: (1.0 / hitCount) * 1.2,
      hitCount,
      allyHeal: 0,
      style: 'dash',
    };
  }
  return { classMult: 1.3, hitCount: 1, allyHeal: 0, style: 'smash' };
}

/**
 * Bunny MAGIC is a heal, not an attack. Same formula BattleScene uses.
 * @returns {number} HP restored to the weakest living ally
 */
export function bunnyHealAmount(hero, stars) {
  return Math.max(8, Math.round((hero?.atk || 10) * getDifficultyMultiplier(stars) * 1.2));
}

/** The ally a heal should land on: lowest HP fraction among the living. */
export function weakestLivingHero(party) {
  const alive = (party || []).filter((h) => h && h.hp > 0);
  if (alive.length === 0) return null;
  let best = alive[0];
  for (const h of alive) {
    if (h.hp / h.maxHp < best.hp / best.maxHp) best = h;
  }
  return best;
}

// ------------------------------------------------------------------
// REWARDS
// ------------------------------------------------------------------

/**
 * Gold and XP for winning a fight. Was two duplicated expressions in
 * BattleScene.showVictory.
 *
 * @param {number} floor        1-9
 * @param {number} correctCount answers the child got right this battle
 */
export function battleRewards(floor, correctCount = 0) {
  const base = REWARD_BASE + Math.max(0, floor) * REWARD_PER_FLOOR;
  return { gold: base, xp: base + Math.max(0, correctCount) * XP_PER_CORRECT };
}

/** Which boss guards which floor. */
export const FLOOR_BOSS = {
  1: 'briarking', 2: 'pressure', 3: 'skywhale', 4: 'pyroclast',
  5: 'absolutezero', 6: 'theprism', 7: 'counterfeiter',
  8: 'theparadox', 9: 'theorem',
};

/** A pack of two or three splits one fight's worth of HP between them. */
export const PACK_HP_SCALE = { 1: 1.0, 2: 0.75, 3: 0.5 };

/** Bosses carry 10% more HP — a longer, more climactic final stand. */
export const BOSS_HP_BONUS = 1.10;

/**
 * WHO YOU JUST WALKED INTO.
 *
 * Was inlined in BattleScene.init. The 3D battle stages whatever this returns,
 * so a pack of three sproutlings has the same split HP in the world as it does
 * in the maze, and a boss is +10% in both.
 *
 * @param {object} o
 * @param {number} o.floor
 * @param {number} o.grade
 * @param {boolean} [o.isBoss]
 * @param {string} [o.enemyId]   explicit id (a boss gate names its boss)
 * @param {number} [o.count]     force a pack size (dev/tests)
 * @param {() => number} [o.rng]
 * @returns {object[]} combat-ready enemy records
 */
export function composeEncounter({
  floor = 1, grade = 3, isBoss = false, enemyId = null, count = 0, rng = Math.random,
} = {}) {
  const pool = getEnemiesForFloor(floor).filter((e) => !BOSS_IDS.includes(e.id));
  const safePick = () => (pool.length > 0
    ? pool[Math.floor(rng() * pool.length)]
    : getEnemiesForFloor(1)[0]);

  if (isBoss) {
    const bossId = enemyId || FLOOR_BOSS[floor] || 'briarking';
    const def = getEnemyById(bossId) || safePick();
    const boss = spawnEnemy(def.id, { grade, isBoss: true });
    if (!boss) return [];
    boss.maxHp = Math.max(1, Math.round(boss.maxHp * BOSS_HP_BONUS));
    boss.hp = boss.maxHp;
    return [boss];
  }

  if (enemyId) {
    const one = spawnEnemy(enemyId, { grade, isBoss: false });
    if (one) return [one];
  }

  const roll = rng();
  const n = count || (roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3);
  const hpScale = PACK_HP_SCALE[n] ?? 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = spawnEnemy(safePick().id, { grade, isBoss: false });
    if (!e) continue;
    if (n > 1) {
      e.maxHp = Math.max(1, Math.round(e.maxHp * hpScale));
      e.hp = e.maxHp;
    }
    out.push(e);
  }
  return out;
}

/**
 * EVERYTHING A WIN OWES THE SAVE FILE.
 *
 * This was ~90 lines inlined in BattleScene.showVictory, sandwiched between
 * confetti and tweens. The 3D battle needs the identical bookkeeping and must
 * not re-derive it: a second copy of the XP curve is a second copy that drifts,
 * and "my hero levelled up in the maze but not in the world" is the kind of bug
 * a seven-year-old notices and an adult never reproduces.
 *
 * It writes gold, lifetime stats, party XP/levels/HP and (when the caller says
 * this win advances progression) the floor record + its hero unlocks. It does
 * NOT write the save to disk and it does NOT touch the registry — the callers
 * differ there (Boss Rush, the Spire and the daily challenge all have their own
 * post-processing, and only they know about it).
 *
 * @param {object} save                the save record, mutated in place
 * @param {object} o
 * @param {number} o.floor             floor this fight belongs to
 * @param {number} o.correct           first-attempt correct answers
 * @param {number} o.wrong             wrong answers
 * @param {number} o.streak            best streak reached this fight
 * @param {object[]} o.party           live hero records (hp carried forward)
 * @param {boolean} o.damageTaken      false = a perfect battle
 * @param {boolean} o.potionUsed
 * @param {boolean} o.markFloor        this win completes the floor
 * @returns {{rewards:object, gold:number, xp:number, leveledUp:string[],
 *            newHeroes:string[], floorMarked:boolean}}
 */
export function applyBattleVictory(save, {
  floor = 1,
  correct = 0,
  wrong = 0,
  streak = 0,
  party = [],
  damageTaken = false,
  potionUsed = false,
  markFloor = false,
} = {}) {
  const rewards = battleRewards(floor, correct);
  const leveledUp = [];
  let newHeroes = [];

  if (!save) return { rewards, gold: rewards.gold, xp: rewards.xp, leveledUp, newHeroes, floorMarked: false };

  save.gold = (save.gold || 0) + rewards.gold;
  if (!save.stats) save.stats = {};
  save.stats.totalBattles = (save.stats.totalBattles || 0) + 1;
  save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + correct;
  save.stats.totalWrong = (save.stats.totalWrong ?? 0) + wrong;

  if (!save.party) save.party = [];
  for (let i = 0; i < party.length && i < 3; i++) {
    if (!party[i]) continue;
    if (!save.party[i]) save.party[i] = {};
    save.party[i].id = party[i].id;
    save.party[i].name = party[i].name;
    save.party[i].hp = party[i].hp;
    save.party[i].maxHp = party[i].maxHp;
    const oldLevel = save.party[i].level || 1;
    save.party[i].xp = (save.party[i].xp || 0) + rewards.xp;
    const newLevel = computeLevel(save.party[i].xp);
    if (newLevel > oldLevel) {
      save.party[i].level = newLevel;
      const bonus = levelBonuses(newLevel);
      const oldBonus = levelBonuses(oldLevel);
      const hpGain = bonus.maxHp - oldBonus.maxHp;
      save.party[i].maxHp += hpGain;
      save.party[i].hp = Math.min(save.party[i].hp + hpGain, save.party[i].maxHp);
      leveledUp.push(save.party[i].name);
      const oldSupers = getAvailableSupers(save.party[i].id, oldLevel);
      const newSupers = getAvailableSupers(save.party[i].id, newLevel);
      if (newSupers.length > oldSupers.length) {
        const learned = newSupers[newSupers.length - 1];
        leveledUp.push(`${save.party[i].name} learned ${learned.name}!`);
      }
    } else {
      save.party[i].level = newLevel;
    }
  }

  save.stats.totalGold = (save.stats.totalGold || 0) + rewards.gold;
  if (streak > (save.stats.bestStreak || 0)) save.stats.bestStreak = streak;
  if (!damageTaken) save.stats.perfectBattle = true;

  let floorMarked = false;
  if (markFloor) {
    markFloorComplete(save, floor);
    newHeroes = unlockHeroesForFloor(save, floor) || [];
    floorMarked = true;
  }

  updateQuestProgress(save, 'wins');
  updateQuestProgress(save, 'streak', streak);
  updateQuestProgress(save, 'gold', rewards.gold);
  if (!damageTaken) updateQuestProgress(save, 'perfect');
  if (!potionUsed) updateQuestProgress(save, 'nopotion');

  return { rewards, gold: rewards.gold, xp: rewards.xp, leveledUp, newHeroes, floorMarked };
}

/**
 * A loss. Gentle by design (DESIGN-PRINCIPLES.md principle 8): the party comes
 * back at half HP rather than dying, so a fight is never a wall — but potions
 * keep a real job, which is topping them up again.
 *
 * Same seam, same reason as applyBattleVictory: the 3D battle must lose
 * identically to the 2D one.
 */
export function applyBattleDefeat(save, { correct = 0, wrong = 0, party = [] } = {}) {
  if (!save) return { revivedHp: [] };
  if (!save.stats) save.stats = {};
  save.stats.totalBattles = (save.stats.totalBattles || 0) + 1;
  save.stats.totalCorrect = (save.stats.totalCorrect ?? 0) + correct;
  save.stats.totalWrong = (save.stats.totalWrong ?? 0) + wrong;
  if (!save.party) save.party = [];
  const revivedHp = [];
  for (let i = 0; i < party.length && i < 3; i++) {
    if (!party[i]) continue;
    if (!save.party[i]) save.party[i] = {};
    save.party[i].id = party[i].id;
    save.party[i].name = party[i].name;
    save.party[i].hp = Math.max(1, Math.round(party[i].maxHp * 0.5));
    save.party[i].maxHp = party[i].maxHp;
    revivedHp.push(save.party[i].hp);
  }
  return { revivedHp };
}

// ------------------------------------------------------------------
// BOOKKEEPING
// ------------------------------------------------------------------

/**
 * Everything a first-attempt answer owes the save file: rolling accuracy,
 * per-skill mastery, the adaptive level and the spaced-repetition schedule.
 * A scaffolded RETRY must not call this — the first attempt already did.
 *
 * @returns {{changed:boolean, direction?:string, label?:string}} adaptive level change
 */
export function recordAnswerStats(save, question, correct) {
  recordAnswer(correct);
  // The rolling accuracy above is module state and always worth keeping.
  // Everything below writes to the save file, and a harness (or the
  // screenshot rig) legitimately runs a battle without one.
  if (!save) return { changed: false };
  recordSkillAnswer(save, question?.op, correct);
  const levelChange = updateAdaptiveLevel(save, question?.op);
  scheduleReview(save, question, correct);
  return levelChange;
}

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------

/**
 * @typedef {object} BattleState
 * @property {object[]} party      hero records (mutated: hp)
 * @property {object[]} enemies    enemy records (mutated: hp)
 * @property {number} grade
 * @property {number} floor
 * @property {number} momentum
 * @property {number} streak
 * @property {number} turnIdx
 * @property {object|null} turn    { who:'hero'|'enemy', heroIndex? }
 * @property {number} target       index of the enemy hero attacks land on
 */

/**
 * Open a battle. Mirrors the subset of BattleScene.init that is rules:
 * momentum starts in the middle of ZONE, the turn cursor sits before the
 * first turn, and the turn sequence alternates hero/enemy across the party.
 */
export function createBattleState({ party, enemies, grade = 3, floor = 1, momentum = 0.5, isBoss = false }) {
  return {
    party,
    enemies,
    grade,
    floor,
    isBoss: !!isBoss,
    operator: FLOOR_OPERATORS[floor] ?? '+',
    momentum,
    streak: 0,
    heroStreaks: new Array(party.length).fill(0),
    superReady: new Array(party.length).fill(false),
    guardActive: new Array(party.length).fill(false),
    turnSeq: buildTurnSequence(party.length),
    turnIdx: -1,
    turn: null,
    target: 0,
    correct: 0,
    wrong: 0,
    damageTaken: false,
    recentTargets: [],
    over: null,          // null | 'victory' | 'defeat' | 'fled'
  };
}

/** Are all enemies down? */
export function allEnemiesDead(state) {
  return state.enemies.every((e) => !e || e.hp <= 0);
}

/** Next living enemy index at or after the current target, wrapping. -1 if none. */
export function findNextAliveEnemy(state) {
  const n = state.enemies.length;
  for (let i = 0; i < n; i++) {
    const idx = (state.target + i) % n;
    if (state.enemies[idx] && state.enemies[idx].hp > 0) return idx;
  }
  return -1;
}

/**
 * Advance the turn cursor. Resolves the battle if either side is finished.
 * Skips dead heroes (advanceTurn does that) and re-aims at a living enemy.
 *
 * @returns {{ who:'hero', heroIndex:number } | { who:'enemy' } |
 *           { who:'victory' } | { who:'defeat' }}
 */
export function nextTurn(state) {
  if (state.over) return { who: state.over === 'defeat' ? 'defeat' : 'victory' };
  if (isPartyDefeated(state.party)) { state.over = 'defeat'; return { who: 'defeat' }; }
  if (allEnemiesDead(state)) { state.over = 'victory'; return { who: 'victory' }; }

  const alive = findNextAliveEnemy(state);
  if (alive >= 0) state.target = alive;

  const result = advanceTurn(state.turnSeq, state.turnIdx, state.party);
  if (!result) { state.over = 'defeat'; return { who: 'defeat' }; }
  state.turnIdx = result.index;
  state.turn = result.turn;
  return result.turn;
}

/** Which commands this hero may pick from, given the grade. */
export function commandsForHero(hero, grade) {
  return getClassCommands(hero?.class || 'knight', grade);
}

/**
 * Roll the question for a hero turn. FIGHT asks for 2-3 stars, MAGIC for
 * 4-5 — the command's own targetStars, straight out of commandMenu.
 */
export function questionForTurn(state, command = COMMANDS.FIGHT, opts = {}) {
  const cfg = getCommandConfig(command);
  const q = generateRatedQuestion({
    grade: opts.grade ?? state.grade,
    operator: opts.operator ?? state.operator,
    streak: state.streak,
    targetStars: cfg.targetStars ?? undefined,
  });
  if (q.stars == null) q.stars = rateQuestion(q, state.grade);
  return q;
}

// ------------------------------------------------------------------
// ANSWER → MOMENTUM / STREAK
// ------------------------------------------------------------------

/**
 * Fold one answer into momentum and streak. Hints damp the momentum gain
 * (full → 60% → 30% by tier), exactly as in BattleScene.
 *
 * @returns {{momentum:number, streak:number, zone:object, superReady:boolean}}
 */
export function applyAnswerOutcome(state, { correct, heroIndex = 0, hintTier = 0 }) {
  if (correct) {
    state.streak += 1;
    state.correct += 1;
    const before = state.momentum;
    const raw = advanceMomentum(before, true, state.streak);
    state.momentum = applyHintMomentum(before, raw, hintTier);
    state.heroStreaks[heroIndex] = (state.heroStreaks[heroIndex] || 0) + 1;
    if (state.heroStreaks[heroIndex] >= SUPER_STREAK) state.superReady[heroIndex] = true;
  } else {
    state.streak = 0;
    state.wrong += 1;
    state.momentum = advanceMomentum(state.momentum, false);
    state.heroStreaks[heroIndex] = 0;
    state.superReady[heroIndex] = false;
  }
  return {
    momentum: state.momentum,
    streak: state.streak,
    zone: getZone(state.momentum),
    superReady: state.superReady[heroIndex],
  };
}

// ------------------------------------------------------------------
// RESOLVE — HERO ATTACK
// ------------------------------------------------------------------

/**
 * Resolve a correct answer into damage on the current target.
 *
 * Chain (identical to BattleScene): computeCommandDamage(base × difficulty
 * × command × momentum × streak) → class multiplier → hint penalty →
 * retry penalty → damage floor. HP is mutated through applyDamageResult.
 *
 * @param {BattleState} state
 * @param {object} opts
 * @param {number} opts.heroIndex
 * @param {object} opts.question    the question that was answered
 * @param {string} [opts.command]   COMMANDS.FIGHT | COMMANDS.MAGIC
 * @param {number} [opts.hintTier]  0-2
 * @param {boolean} [opts.retried]  true if this landed on the second try
 * @param {boolean} [opts.glancing] wrong answer — no damage, telegraph only
 * @returns {{damage:number, hits:number, killed:boolean, targetIndex:number,
 *            target:object, profile:object, allyHeal:{hero:object, amount:number}|null,
 *            stars:number, reduced:boolean}}
 */
export function resolveHeroAttack(state, opts) {
  const heroIndex = opts.heroIndex ?? 0;
  const hero = state.party[heroIndex];
  const cls = hero?.class || 'knight';
  const command = opts.command || COMMANDS.FIGHT;
  const targetIndex = state.target;
  const target = state.enemies[targetIndex];
  const stars = opts.question?.stars ?? rateQuestion(opts.question || {}, state.grade);
  const profile = classAttackProfile(cls, state.streak);

  if (!target || target.hp <= 0) {
    return { damage: 0, hits: profile.hitCount, killed: false, targetIndex, target, profile, allyHeal: null, stars, reduced: false };
  }

  const cmdMult = getCommandConfig(command).damageMult;
  const base = computeCommandDamage(hero, target, {
    momentum: state.momentum,
    streak: state.streak,
    difficultyMult: getDifficultyMultiplier(stars),
    commandMult: cmdMult,
  });

  let dmg = Math.round(base.modifiedDamage * profile.classMult);
  let reduced = false;
  const hMult = hintDamageMult(opts.hintTier || 0);
  if (hMult < 1) { dmg = Math.round(dmg * hMult); reduced = true; }
  if (opts.retried) { dmg = Math.round(dmg * retryDamageMult()); reduced = true; }
  dmg = Math.max(HERO_DAMAGE_FLOOR, dmg);

  const newHp = Math.max(0, target.hp - dmg);
  const result = { baseDamage: base.baseDamage, modifiedDamage: dmg, newHp, killed: newHp === 0 && target.hp > 0 };
  applyDamageResult(target, result);

  let allyHeal = null;
  if (profile.allyHeal > 0) {
    const ally = weakestLivingHero(state.party);
    if (ally) {
      const before = ally.hp;
      ally.hp = Math.min(ally.maxHp, ally.hp + profile.allyHeal);
      if (ally.hp > before) allyHeal = { hero: ally, amount: ally.hp - before };
    }
  }

  return {
    damage: dmg,
    hits: profile.hitCount,
    killed: result.killed,
    targetIndex,
    target,
    profile,
    allyHeal,
    stars,
    reduced,
  };
}

/**
 * The bunny's MAGIC: heal the weakest ally instead of striking.
 * @returns {{hero:object, amount:number}|null}
 */
export function resolveHeroHeal(state, { heroIndex = 0, question }) {
  const hero = state.party[heroIndex];
  const stars = question?.stars ?? rateQuestion(question || {}, state.grade);
  const ally = weakestLivingHero(state.party);
  if (!ally) return null;
  const amount = bunnyHealAmount(hero, stars);
  const before = ally.hp;
  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
  return { hero: ally, amount: ally.hp - before };
}

// ------------------------------------------------------------------
// RESOLVE — ENEMY ATTACK
// ------------------------------------------------------------------

/**
 * Pick who an enemy swings at: uniform over the living, with the
 * anti-streak reroll from combat.js, tracked across the whole battle.
 */
export function chooseEnemyTarget(state, rng = Math.random) {
  const target = pickEnemyTarget(state.party, state.recentTargets, rng);
  if (target) {
    state.recentTargets.push(target);
    if (state.recentTargets.length > 2) state.recentTargets.shift();
  }
  return target;
}

/**
 * Resolve one enemy blow. Defensive order matches BattleScene exactly:
 * dodge (bunny) → guard (halves) → knight's 40% block (halves).
 *
 * @returns {{dodged:boolean, blocked:boolean, guarded:boolean, damage:number,
 *            killed:boolean, target:object, targetIndex:number}}
 */
export function resolveEnemyAttack(state, { attacker, target, rng = Math.random, dodgeRoll = false }) {
  const targetIndex = state.party.indexOf(target);
  const cls = target?.class || 'knight';

  const dodgeChance = cls === 'bunny' ? (dodgeRoll ? BUNNY_DODGE_ROLL_CHANCE : BUNNY_DODGE_CHANCE) : 0;
  if (dodgeChance > 0 && rng() < dodgeChance) {
    return { dodged: true, blocked: false, guarded: false, damage: 0, killed: false, target, targetIndex };
  }

  let result = computeEnemyDamage(attacker, target, { momentum: state.momentum });
  let guarded = false;
  let blocked = false;

  if (targetIndex >= 0 && state.guardActive[targetIndex]) {
    result = applyGuardReduction(result, target.hp);
    guarded = true;
  } else if (cls === 'knight' && rng() < KNIGHT_BLOCK_CHANCE) {
    result.modifiedDamage = Math.max(1, Math.round(result.modifiedDamage / 2));
    result.newHp = Math.max(0, target.hp - result.modifiedDamage);
    result.killed = result.newHp === 0 && target.hp > 0;
    blocked = true;
  }

  applyDamageResult(target, result);
  if (result.modifiedDamage > 0) state.damageTaken = true;

  return {
    dodged: false,
    blocked,
    guarded,
    damage: result.modifiedDamage,
    killed: result.killed,
    target,
    targetIndex,
  };
}

/** Guard lasts a full enemy round; clear it when the round ends. */
export function clearGuards(state) {
  state.guardActive.fill(false);
}

export { COMMANDS };
