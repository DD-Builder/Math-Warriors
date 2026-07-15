import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spireFightPlan, spireMultiplier, applySpireScaling, spireGoldForFloor,
  spireHealAmount, createSpireRun, advanceSpireRun, spirePayout,
} from './spire.js';
import { BOSS_IDS, getEnemiesForFloor } from '../data/enemies.js';
import { makeDefaultSave, loadSave, writeSave, __setStorage } from './save.js';

// deterministic rng
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

test('boss cadence: every 5th floor is a boss with a valid id', () => {
  for (const f of [5, 10, 15, 20]) {
    const plan = spireFightPlan(f, lcg(f));
    assert.equal(plan.isBoss, true, `floor ${f} should be boss`);
    assert.ok(BOSS_IDS.includes(plan.enemyId), `floor ${f} boss id invalid: ${plan.enemyId}`);
  }
  for (const f of [1, 2, 3, 4, 6, 7, 9, 11]) {
    assert.equal(spireFightPlan(f, lcg(f)).isBoss, false, `floor ${f} should not be boss`);
  }
});

test('themeFloor wraps every 9 floors', () => {
  assert.equal(spireFightPlan(1).themeFloor, 1);
  assert.equal(spireFightPlan(9).themeFloor, 9);
  assert.equal(spireFightPlan(10).themeFloor, 1);
  assert.equal(spireFightPlan(18).themeFloor, 9);
  assert.equal(spireFightPlan(19).themeFloor, 1);
});

test('mob ids come from the theme floor pool', () => {
  for (const f of [1, 2, 3, 4, 6, 7, 8]) {
    const plan = spireFightPlan(f, lcg(f * 7 + 1));
    const pool = getEnemiesForFloor(plan.themeFloor).filter(e => !BOSS_IDS.includes(e.id)).map(e => e.id);
    assert.ok(pool.includes(plan.enemyId), `floor ${f}: ${plan.enemyId} not in theme-floor ${plan.themeFloor} pool`);
  }
});

test('multiplier: floor 1 identity, monotonic, tier jump at 6, atk cap', () => {
  assert.deepEqual(spireMultiplier(1), { hp: 1, atk: 1 });
  let prev = spireMultiplier(1);
  for (let f = 2; f <= 40; f++) {
    const m = spireMultiplier(f);
    assert.ok(m.hp >= prev.hp, `hp not monotonic at ${f}`);
    assert.ok(m.atk >= prev.atk - 1e-9, `atk not monotonic at ${f}`);
    assert.ok(m.atk <= 2.2 + 1e-9, `atk over cap at ${f}`);
    prev = m;
  }
  // tier jump: floor 6 gains the +0.30 boss-tier step over floor 5
  assert.ok(spireMultiplier(6).hp - spireMultiplier(5).hp > 0.3);
});

test('applySpireScaling sets hp = maxHp and scales', () => {
  const enemy = { maxHp: 100, hp: 100, atk: 10 };
  applySpireScaling(enemy, 11);
  const m = spireMultiplier(11);
  assert.equal(enemy.maxHp, Math.round(100 * m.hp));
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(enemy.atk, Math.round(10 * m.atk));
});

test('gold and heal', () => {
  assert.equal(spireGoldForFloor(1), 7);
  assert.equal(spireGoldForFloor(10), 25);
  assert.equal(spireHealAmount({ maxHp: 40 }), 10);
  assert.equal(spireHealAmount({ maxHp: 0 }), 0);
});

test('createSpireRun clones the party (no aliasing)', () => {
  const party = [{ id: 'a', hp: 10 }, { id: 'b', hp: 20 }];
  const run = createSpireRun(party, 123);
  assert.equal(run.floor, 1);
  assert.equal(run.goldBank, 0);
  assert.equal(run.startTime, 123);
  party[0].hp = 999;
  assert.equal(run.party[0].hp, 10, 'run party aliased the input');
});

test('advanceSpireRun win: floor++, banks gold, no aliasing', () => {
  const run = createSpireRun([{ id: 'a', hp: 10 }]);
  const party = [{ id: 'a', hp: 5 }];
  const next = advanceSpireRun(run, { won: true, correct: 3, wrong: 1, party });
  assert.equal(next.floor, 2);
  assert.equal(next.goldBank, spireGoldForFloor(1));
  assert.equal(next.totalCorrect, 3);
  assert.equal(next.totalWrong, 1);
  assert.equal(next.lastOutcome, 'victory');
  // mutating inputs after the call must not change next
  party[0].hp = 999;
  run.floor = 88;
  assert.equal(next.party[0].hp, 5);
  assert.equal(next.floor, 2);
});

test('advanceSpireRun loss: floor unchanged, marks defeat', () => {
  const run = { ...createSpireRun([{ id: 'a' }]), floor: 4, goldBank: 30 };
  const next = advanceSpireRun(run, { won: false, correct: 2, wrong: 4, party: [{ id: 'a' }] });
  assert.equal(next.floor, 4);
  assert.equal(next.goldBank, 30);
  assert.equal(next.lastOutcome, 'defeat');
  assert.equal(next.totalWrong, 4);
});

test('spirePayout: full on retreat, half on wipe', () => {
  const state = { goldBank: 41 };
  assert.equal(spirePayout(state, true), 41);
  assert.equal(spirePayout(state, false), 20);
});

test('save carries new spire/boss-rush stat fields, backfilled for old saves', () => {
  const mem = new Map();
  __setStorage({
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    clear: () => mem.clear(),
  });
  // default save has the fields
  const def = makeDefaultSave();
  assert.equal(def.stats.bestSpireFloor, 0);
  assert.equal(def.stats.bestBossRushTime, 0);
  // a v5 save missing them gets them backfilled through loadSave
  const legacy = makeDefaultSave();
  delete legacy.stats.bestSpireFloor;
  delete legacy.stats.bestBossRushTime;
  legacy.stats.totalGold = 42;
  writeSave(legacy, 1);
  const loaded = loadSave(1);
  assert.equal(loaded.stats.bestSpireFloor, 0);
  assert.equal(loaded.stats.bestBossRushTime, 0);
  assert.equal(loaded.stats.totalGold, 42);
});
