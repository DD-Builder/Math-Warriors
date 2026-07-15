/**
 * The Endless Spire — pure run logic for the escalating battle tower.
 *
 * A run is persistent-HP: the same party clones climb floor after floor,
 * enemies scale up, every 5th fight is a boss, and the player can retreat
 * to bank the gold they've earned (or lose half on a wipe). No Phaser
 * here; TowerScene and BattleScene drive the UI and battles.
 */

import { pickEnemyForFloor, BOSS_IDS } from '../data/enemies.js';

/** What to fight on spire floor N: boss every 5th, theme wraps every 9. */
export function spireFightPlan(floorN, rng = Math.random) {
  const isBoss = floorN % 5 === 0;
  const themeFloor = ((floorN - 1) % 9) + 1;
  let enemyId;
  if (isBoss) {
    enemyId = BOSS_IDS[Math.floor(rng() * BOSS_IDS.length)];
  } else {
    const pick = pickEnemyForFloor(themeFloor, rng);
    enemyId = pick ? pick.id : 'sproutling';
  }
  return { isBoss, themeFloor, enemyId };
}

/**
 * HP/ATK multipliers for spire floor N. HP climbs smoothly with a jump
 * each boss tier; ATK climbs slower and is capped so kids are never
 * one-shot. Floor 1 is the identity (1, 1).
 */
export function spireMultiplier(floorN) {
  const hp = 1 + 0.10 * (floorN - 1) + 0.30 * Math.floor((floorN - 1) / 5);
  const atk = Math.min(1 + 0.04 * (floorN - 1), 2.2);
  return { hp, atk };
}

/** Scale a freshly spawned enemy in place for spire floor N. */
export function applySpireScaling(enemy, floorN) {
  const m = spireMultiplier(floorN);
  enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * m.hp));
  enemy.hp = enemy.maxHp;
  enemy.atk = Math.round(enemy.atk * m.atk);
  return enemy;
}

/** Gold banked for clearing spire floor N. */
export function spireGoldForFloor(floorN) {
  return 5 + 2 * floorN;
}

/** Between-floor heal: a quarter of max HP, clamped to full. */
export function spireHealAmount(hero) {
  const maxHp = hero?.maxHp || 0;
  return Math.min(maxHp, Math.round(maxHp * 0.25));
}

/** Start a fresh run from a party. `now` is stamped by the scene. */
export function createSpireRun(party, now = 0) {
  return {
    floor: 1,
    goldBank: 0,
    party: (party || []).map(h => ({ ...h })),
    totalCorrect: 0,
    totalWrong: 0,
    startTime: now,
    lastOutcome: null,
  };
}

/**
 * Pure reducer for a fight result. Returns a NEW state; never mutates the
 * input or aliases the incoming party. On a win the floor advances and the
 * floor's gold is banked; on a loss only lastOutcome flips.
 */
export function advanceSpireRun(state, outcome) {
  const { won, correct = 0, wrong = 0, party } = outcome || {};
  const nextParty = (party || state.party || []).map(h => ({ ...h }));
  const base = {
    ...state,
    party: nextParty,
    totalCorrect: state.totalCorrect + correct,
    totalWrong: state.totalWrong + wrong,
  };
  if (won) {
    return {
      ...base,
      goldBank: state.goldBank + spireGoldForFloor(state.floor),
      floor: state.floor + 1,
      lastOutcome: 'victory',
    };
  }
  return { ...base, lastOutcome: 'defeat' };
}

/** Gold paid out: full bank on a retreat, half (rounded down) on a wipe. */
export function spirePayout(state, retreated) {
  return retreated ? state.goldBank : Math.floor(state.goldBank / 2);
}
