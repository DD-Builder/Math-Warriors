/**
 * Contract tests for the shared battle rules.
 *
 * These exist because two very different presentations (the 2D
 * BattleScene and the 3D battle3d staging) now swing for the same
 * numbers. If this file goes red, the two battles have drifted apart
 * and a child gets a different fight depending on which one they land in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classAttackProfile, battleRewards, bunnyHealAmount, weakestLivingHero,
  createBattleState, nextTurn, allEnemiesDead, findNextAliveEnemy,
  applyAnswerOutcome, resolveHeroAttack, resolveHeroHeal, resolveEnemyAttack,
  chooseEnemyTarget, clearGuards, commandsForHero, questionForTurn,
  HERO_DAMAGE_FLOOR, KNIGHT_BLOCK_CHANCE, BUNNY_DODGE_CHANCE,
  WIZARD_HEAL_AMOUNT, REWARD_BASE, REWARD_PER_FLOOR, XP_PER_CORRECT,
  SUPER_STREAK, COMMANDS,
  composeEncounter, applyBattleVictory, applyBattleDefeat,
  FLOOR_BOSS, PACK_HP_SCALE, BOSS_HP_BONUS,
} from './battleRules.js';
import { BOSS_IDS } from '../data/enemies.js';
import { computeLevel } from '../data/heroes.js';

const hero = (over = {}) => ({
  id: 'h', name: 'Hero', class: 'knight', hp: 40, maxHp: 40, atk: 16, def: 4, ...over,
});
const foe = (over = {}) => ({
  id: 'sproutling', name: 'Sproutling', floor: 1, hp: 80, maxHp: 80, atk: 12, def: 3, ...over,
});

/** Deterministic rng: replays a fixed script, then repeats the last value. */
function scripted(values) {
  let i = 0;
  return () => (i < values.length ? values[i++] : values[values.length - 1]);
}

test('systems/battleRules', async (t) => {
  await t.test('classAttackProfile', async (tt) => {
    await tt.test('knight is one heavy hit at any streak', () => {
      for (const streak of [0, 3, 5, 9]) {
        const p = classAttackProfile('knight', streak);
        assert.equal(p.classMult, 1.3);
        assert.equal(p.hitCount, 1);
        assert.equal(p.allyHeal, 0);
      }
    });

    await tt.test('wizard steps up at a 3 streak and heals at a 5 streak', () => {
      assert.equal(classAttackProfile('wizard', 0).classMult, 1.0);
      assert.equal(classAttackProfile('wizard', 2).classMult, 1.0);
      assert.equal(classAttackProfile('wizard', 3).classMult, 1.5);
      assert.equal(classAttackProfile('wizard', 4).allyHeal, 0);
      assert.equal(classAttackProfile('wizard', 5).allyHeal, WIZARD_HEAL_AMOUNT);
    });

    await tt.test('bunny flurry nets 1.2x however many strikes it takes', () => {
      const low = classAttackProfile('bunny', 0);
      const high = classAttackProfile('bunny', 4);
      assert.equal(low.hitCount, 2);
      assert.equal(high.hitCount, 3);
      // hits x per-hit multiplier is the same total either way
      assert.ok(Math.abs(low.hitCount * low.classMult - 1.2) < 1e-9);
      assert.ok(Math.abs(high.hitCount * high.classMult - 1.2) < 1e-9);
    });

    await tt.test('an unknown class falls back to the knight, never to zero', () => {
      const p = classAttackProfile('mystery', 0);
      assert.ok(p.classMult > 0);
      assert.equal(p.hitCount, 1);
    });
  });

  await t.test('battleRewards', async (tt) => {
    await tt.test('matches the curve BattleScene shipped', () => {
      for (const f of [1, 3, 9]) {
        for (const c of [0, 4, 11]) {
          const r = battleRewards(f, c);
          assert.equal(r.gold, REWARD_BASE + f * REWARD_PER_FLOOR);
          assert.equal(r.xp, REWARD_BASE + f * REWARD_PER_FLOOR + c * XP_PER_CORRECT);
        }
      }
    });

    await tt.test('XP is never below gold — correct answers only add', () => {
      const r = battleRewards(5, 0);
      assert.equal(r.xp, r.gold);
      assert.ok(battleRewards(5, 7).xp > r.gold);
    });

    await tt.test('a nonsense floor or count cannot produce a negative reward', () => {
      const r = battleRewards(-4, -9);
      assert.ok(r.gold >= REWARD_BASE);
      assert.ok(r.xp >= REWARD_BASE);
    });
  });

  await t.test('heal helpers', async (tt) => {
    await tt.test('bunnyHealAmount never drops below the 8 HP floor', () => {
      assert.ok(bunnyHealAmount({ atk: 1 }, 1) >= 8);
      assert.ok(bunnyHealAmount({ atk: 30 }, 5) > bunnyHealAmount({ atk: 30 }, 1));
    });

    await tt.test('weakestLivingHero picks by HP FRACTION, not raw HP', () => {
      const tank = hero({ name: 'Tank', hp: 30, maxHp: 100 });   // 30%
      const scout = hero({ name: 'Scout', hp: 20, maxHp: 40 });  // 50%
      assert.equal(weakestLivingHero([scout, tank]).name, 'Tank');
    });

    await tt.test('the dead are never healed', () => {
      const dead = hero({ name: 'Dead', hp: 0 });
      const alive = hero({ name: 'Alive', hp: 39 });
      assert.equal(weakestLivingHero([dead, alive]).name, 'Alive');
      assert.equal(weakestLivingHero([dead]), null);
    });
  });

  await t.test('turn order', async (tt) => {
    await tt.test('alternates hero and enemy across the party', () => {
      const s = createBattleState({ party: [hero(), hero(), hero()], enemies: [foe()] });
      const seen = [];
      for (let i = 0; i < 6; i++) seen.push(nextTurn(s).who);
      assert.deepEqual(seen, ['hero', 'enemy', 'hero', 'enemy', 'hero', 'enemy']);
    });

    await tt.test('a dead hero never gets a turn', () => {
      const a = hero({ name: 'A' });
      const b = hero({ name: 'B', hp: 0 });
      const c = hero({ name: 'C' });
      const s = createBattleState({ party: [a, b, c], enemies: [foe()] });
      const names = [];
      for (let i = 0; i < 8; i++) {
        const turn = nextTurn(s);
        if (turn.who === 'hero') names.push(s.party[turn.heroIndex].name);
      }
      assert.ok(names.includes('A'));
      assert.ok(names.includes('C'));
      assert.ok(!names.includes('B'), 'the KO\'d hero is skipped entirely');
    });

    await tt.test('a wiped party resolves to defeat, not to a hung turn', () => {
      const s = createBattleState({ party: [hero({ hp: 0 })], enemies: [foe()] });
      assert.equal(nextTurn(s).who, 'defeat');
      assert.equal(s.over, 'defeat');
    });

    await tt.test('dead enemies resolve to victory', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe({ hp: 0 })] });
      assert.equal(nextTurn(s).who, 'victory');
      assert.ok(allEnemiesDead(s));
    });

    await tt.test('the target auto-advances past a corpse and wraps', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe({ hp: 0 }), foe(), foe({ hp: 0 })] });
      assert.equal(findNextAliveEnemy(s), 1);
      s.target = 2;
      assert.equal(findNextAliveEnemy(s), 1, 'wraps back around to the survivor');
      s.enemies[1].hp = 0;
      assert.equal(findNextAliveEnemy(s), -1);
    });
  });

  await t.test('answers move momentum and streak', async (tt) => {
    await tt.test('a correct answer raises momentum and streak', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()] });
      const before = s.momentum;
      const r = applyAnswerOutcome(s, { correct: true, heroIndex: 0 });
      assert.ok(r.momentum > before);
      assert.equal(r.streak, 1);
      assert.equal(s.correct, 1);
    });

    await tt.test('a wrong answer drops momentum and zeroes the streak', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()] });
      applyAnswerOutcome(s, { correct: true, heroIndex: 0 });
      applyAnswerOutcome(s, { correct: true, heroIndex: 0 });
      const peak = s.momentum;
      const r = applyAnswerOutcome(s, { correct: false, heroIndex: 0 });
      assert.ok(r.momentum < peak);
      assert.equal(r.streak, 0);
      assert.equal(s.wrong, 1);
    });

    await tt.test('a hint damps the momentum gain but never reverses it', () => {
      const plain = createBattleState({ party: [hero()], enemies: [foe()] });
      const hinted = createBattleState({ party: [hero()], enemies: [foe()] });
      const a = applyAnswerOutcome(plain, { correct: true, heroIndex: 0, hintTier: 0 });
      const b = applyAnswerOutcome(hinted, { correct: true, heroIndex: 0, hintTier: 2 });
      assert.ok(b.momentum < a.momentum);
      assert.ok(b.momentum >= 0.5, 'a hinted correct answer still gains ground');
    });

    await tt.test('SUPER lights after three in a row and dies on a miss', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()] });
      for (let i = 0; i < SUPER_STREAK; i++) applyAnswerOutcome(s, { correct: true, heroIndex: 0 });
      assert.equal(s.superReady[0], true);
      applyAnswerOutcome(s, { correct: false, heroIndex: 0 });
      assert.equal(s.superReady[0], false);
    });

    await tt.test('momentum stays inside [0.15, 1] however long the run', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()] });
      for (let i = 0; i < 60; i++) applyAnswerOutcome(s, { correct: true, heroIndex: 0 });
      assert.ok(s.momentum <= 1);
      for (let i = 0; i < 60; i++) applyAnswerOutcome(s, { correct: false, heroIndex: 0 });
      assert.ok(s.momentum >= 0.15);
    });
  });

  await t.test('resolveHeroAttack', async (tt) => {
    const q = { a: 7, b: 8, op: '+', answer: 15, stars: 3, format: 'standard' };

    await tt.test('mutates the target through the one sanctioned path', () => {
      const target = foe();
      const s = createBattleState({ party: [hero()], enemies: [target] });
      const r = resolveHeroAttack(s, { heroIndex: 0, question: q, command: COMMANDS.FIGHT });
      assert.ok(r.damage > 0);
      assert.equal(target.hp, 80 - r.damage);
    });

    await tt.test('a hint costs power, a retry costs more, and the floor holds', () => {
      const mk = () => createBattleState({ party: [hero()], enemies: [foe()] });
      const full = resolveHeroAttack(mk(), { heroIndex: 0, question: q }).damage;
      const tip = resolveHeroAttack(mk(), { heroIndex: 0, question: q, hintTier: 1 }).damage;
      const scaffold = resolveHeroAttack(mk(), { heroIndex: 0, question: q, hintTier: 2 }).damage;
      const both = resolveHeroAttack(mk(), { heroIndex: 0, question: q, hintTier: 2, retried: true }).damage;
      assert.ok(full > tip);
      assert.ok(tip > scaffold);
      assert.ok(scaffold > both);
      assert.ok(both >= HERO_DAMAGE_FLOOR);
    });

    await tt.test('a wet noodle still lands the damage floor', () => {
      const s = createBattleState({ party: [hero({ atk: 0 })], enemies: [foe({ def: 99 })] });
      const r = resolveHeroAttack(s, { heroIndex: 0, question: { ...q, stars: 1 }, hintTier: 2, retried: true });
      assert.ok(r.damage >= HERO_DAMAGE_FLOOR);
    });

    await tt.test('MAGIC hits harder than FIGHT for the same question', () => {
      const mk = () => createBattleState({ party: [hero()], enemies: [foe()] });
      const fight = resolveHeroAttack(mk(), { heroIndex: 0, question: q, command: COMMANDS.FIGHT }).damage;
      const magic = resolveHeroAttack(mk(), { heroIndex: 0, question: q, command: COMMANDS.MAGIC }).damage;
      assert.ok(magic > fight);
    });

    await tt.test('reports the kill and never drives HP below zero', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe({ hp: 2 })] });
      const r = resolveHeroAttack(s, { heroIndex: 0, question: q });
      assert.equal(r.killed, true);
      assert.equal(s.enemies[0].hp, 0);
    });

    await tt.test('hitting a corpse is a no-op, not a crash', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe({ hp: 0 })] });
      const r = resolveHeroAttack(s, { heroIndex: 0, question: q });
      assert.equal(r.damage, 0);
      assert.equal(r.killed, false);
    });

    await tt.test('a wizard on a streak spills healing onto the weakest ally', () => {
      const wiz = hero({ name: 'Wiz', class: 'wizard' });
      const hurt = hero({ name: 'Hurt', hp: 5 });
      const s = createBattleState({ party: [wiz, hurt], enemies: [foe()] });
      s.streak = 6;
      const r = resolveHeroAttack(s, { heroIndex: 0, question: q, command: COMMANDS.MAGIC });
      assert.ok(r.allyHeal, 'a 6-streak wizard heals');
      assert.equal(r.allyHeal.hero.name, 'Hurt');
      assert.equal(hurt.hp, 5 + WIZARD_HEAL_AMOUNT);
    });

    await tt.test('a heal never overfills the bar', () => {
      const wiz = hero({ name: 'Wiz', class: 'wizard' });
      const full = hero({ name: 'Full', hp: 40, maxHp: 40 });
      const s = createBattleState({ party: [wiz, full], enemies: [foe()] });
      s.streak = 6;
      resolveHeroAttack(s, { heroIndex: 0, question: q, command: COMMANDS.MAGIC });
      assert.equal(full.hp, 40);
    });

    await tt.test('resolveHeroHeal tops up the weakest and clamps', () => {
      const bun = hero({ name: 'Bun', class: 'bunny' });
      const hurt = hero({ name: 'Hurt', hp: 1 });
      const s = createBattleState({ party: [bun, hurt], enemies: [foe()] });
      const r = resolveHeroHeal(s, { heroIndex: 0, question: q });
      assert.ok(r.amount > 0);
      assert.ok(hurt.hp <= hurt.maxHp);
    });
  });

  await t.test('resolveEnemyAttack', async (tt) => {
    await tt.test('a plain hit lands and is recorded as damage taken', () => {
      const target = hero({ class: 'wizard' });
      const s = createBattleState({ party: [target], enemies: [foe()] });
      const r = resolveEnemyAttack(s, { attacker: s.enemies[0], target, rng: () => 0.99 });
      assert.ok(r.damage > 0);
      assert.equal(target.hp, 40 - r.damage);
      assert.equal(s.damageTaken, true);
    });

    await tt.test('a bunny inside the dodge window takes nothing', () => {
      const bun = hero({ class: 'bunny' });
      const s = createBattleState({ party: [bun], enemies: [foe()] });
      const r = resolveEnemyAttack(s, { attacker: s.enemies[0], target: bun, rng: () => BUNNY_DODGE_CHANCE - 0.01 });
      assert.equal(r.dodged, true);
      assert.equal(r.damage, 0);
      assert.equal(bun.hp, 40);
    });

    await tt.test('a bunny outside the window is hit like anyone else', () => {
      const bun = hero({ class: 'bunny' });
      const s = createBattleState({ party: [bun], enemies: [foe()] });
      const r = resolveEnemyAttack(s, { attacker: s.enemies[0], target: bun, rng: () => 0.95 });
      assert.equal(r.dodged, false);
      assert.ok(r.damage > 0);
    });

    await tt.test('guard halves and takes priority over the knight block', () => {
      const kn = hero({ class: 'knight' });
      const plain = createBattleState({ party: [hero({ class: 'wizard' })], enemies: [foe()] });
      const raw = resolveEnemyAttack(plain, {
        attacker: plain.enemies[0], target: plain.party[0], rng: () => 0.99,
      }).damage;

      const s = createBattleState({ party: [kn], enemies: [foe()] });
      s.guardActive[0] = true;
      const r = resolveEnemyAttack(s, { attacker: s.enemies[0], target: kn, rng: () => 0.0 });
      assert.equal(r.guarded, true);
      assert.equal(r.blocked, false, 'guard consumed the reduction; the block must not stack');
      assert.ok(r.damage < raw);
    });

    await tt.test('a knight inside the block window takes half', () => {
      const a = hero({ class: 'knight' });
      const b = hero({ class: 'knight' });
      const s1 = createBattleState({ party: [a], enemies: [foe()] });
      const s2 = createBattleState({ party: [b], enemies: [foe()] });
      const blocked = resolveEnemyAttack(s1, { attacker: s1.enemies[0], target: a, rng: () => KNIGHT_BLOCK_CHANCE - 0.01 });
      const clean = resolveEnemyAttack(s2, { attacker: s2.enemies[0], target: b, rng: () => 0.99 });
      assert.equal(blocked.blocked, true);
      assert.equal(clean.blocked, false);
      assert.ok(blocked.damage < clean.damage);
    });

    await tt.test('a lethal blow reports the kill and stops at zero', () => {
      const dying = hero({ class: 'wizard', hp: 1 });
      const s = createBattleState({ party: [dying], enemies: [foe({ atk: 40 })] });
      const r = resolveEnemyAttack(s, { attacker: s.enemies[0], target: dying, rng: () => 0.99 });
      assert.equal(r.killed, true);
      assert.equal(dying.hp, 0);
    });

    await tt.test('clearGuards ends the round for everyone', () => {
      const s = createBattleState({ party: [hero(), hero()], enemies: [foe()] });
      s.guardActive[0] = true;
      s.guardActive[1] = true;
      clearGuards(s);
      assert.deepEqual([...s.guardActive], [false, false]);
    });
  });

  await t.test('chooseEnemyTarget', async (tt) => {
    await tt.test('only ever picks the living', () => {
      const alive = hero({ name: 'Alive' });
      const s = createBattleState({ party: [hero({ hp: 0 }), alive, hero({ hp: 0 })], enemies: [foe()] });
      for (let i = 0; i < 10; i++) {
        assert.equal(chooseEnemyTarget(s, Math.random).name, 'Alive');
      }
    });

    await tt.test('rerolls once rather than hitting the same hero three times', () => {
      const a = hero({ name: 'A' });
      const b = hero({ name: 'B' });
      const s = createBattleState({ party: [a, b], enemies: [foe()] });
      // always index 0 → A, A, then the anti-streak reroll fires
      const rng = scripted([0, 0, 0, 0.9]);
      assert.equal(chooseEnemyTarget(s, rng).name, 'A');
      assert.equal(chooseEnemyTarget(s, rng).name, 'A');
      assert.equal(chooseEnemyTarget(s, rng).name, 'B');
    });

    await tt.test('an all-dead party yields null, not an exception', () => {
      const s = createBattleState({ party: [hero({ hp: 0 })], enemies: [foe()] });
      assert.equal(chooseEnemyTarget(s, () => 0), null);
    });

    await tt.test('the recent-target memory never grows past two', () => {
      const s = createBattleState({ party: [hero(), hero(), hero()], enemies: [foe()] });
      for (let i = 0; i < 12; i++) chooseEnemyTarget(s, Math.random);
      assert.ok(s.recentTargets.length <= 2);
    });
  });

  await t.test('question routing', async (tt) => {
    await tt.test('the floor picks the operator', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()], floor: 2, grade: 3 });
      assert.equal(s.operator, '-');
    });

    await tt.test('MAGIC asks a harder question than FIGHT', () => {
      // Floor 5 is 'mixed', so the generator has the whole operator table
      // to reach for and the two star targets are actually separable.
      const s = createBattleState({ party: [hero()], enemies: [foe()], floor: 5, grade: 5 });
      let fightSum = 0, magicSum = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        fightSum += questionForTurn(s, COMMANDS.FIGHT).stars;
        magicSum += questionForTurn(s, COMMANDS.MAGIC).stars;
      }
      assert.ok(magicSum > fightSum,
        `MAGIC should average more stars (fight ${fightSum / N}, magic ${magicSum / N})`);
    });

    await tt.test('every question arrives answerable and rated', () => {
      const s = createBattleState({ party: [hero()], enemies: [foe()], floor: 1, grade: 2 });
      for (let i = 0; i < 25; i++) {
        const q = questionForTurn(s, COMMANDS.FIGHT);
        assert.ok(Array.isArray(q.choices) && q.choices.length >= 2);
        assert.equal(q.choices[q.correctIndex], q.answer);
        assert.ok(q.stars >= 1 && q.stars <= 5);
      }
    });

    await tt.test('command menus stay class-appropriate', () => {
      assert.deepEqual(commandsForHero({ class: 'knight' }, 3), ['fight', 'guard']);
      assert.deepEqual(commandsForHero({ class: 'wizard' }, 3), ['magic', 'guard']);
      assert.ok(commandsForHero({ class: 'bunny' }, 3).includes('magic'));
      assert.deepEqual(commandsForHero({ class: 'wizard' }, 0), ['fight', 'guard'],
        'K-1 never sees MAGIC, whatever the class');
    });
  });

  // ================================================================
  // THE SHARED SEAM THE 3D BATTLE JOINS AT
  //
  // composeEncounter / applyBattleVictory / applyBattleDefeat are called by
  // BOTH BattleScene (2D) and OverworldScene (the 3D fight in
  // overworld/battle3d.js). If any of these go red the two battles have
  // drifted and a child's gold, XP or floor progress depends on which one
  // they happened to land in.
  // ================================================================
  await t.test('composeEncounter', async (tt) => {
    await tt.test('a boss fight is exactly one boss, with the boss HP bonus', () => {
      for (const floor of [1, 5, 9]) {
        const pack = composeEncounter({ floor, grade: 3, isBoss: true, rng: () => 0.5 });
        assert.equal(pack.length, 1, `floor ${floor} boss is alone`);
        assert.ok(BOSS_IDS.includes(pack[0].id), 'and it really is a boss');
        assert.equal(pack[0].id, FLOOR_BOSS[floor]);
        assert.equal(pack[0].hp, pack[0].maxHp, 'at full HP');
      }
    });

    await tt.test('a named boss overrides the floor default', () => {
      const pack = composeEncounter({ floor: 1, isBoss: true, enemyId: 'theorem' });
      assert.equal(pack[0].id, 'theorem');
    });

    await tt.test('the boss bonus is the +10% both battles agree on', () => {
      const plain = composeEncounter({ floor: 1, grade: 3, isBoss: true, enemyId: 'briarking' });
      // Recompose with the bonus removed to recover the base roll.
      const base = Math.round(plain[0].maxHp / BOSS_HP_BONUS);
      assert.ok(Math.abs(plain[0].maxHp - Math.round(base * BOSS_HP_BONUS)) <= 1);
    });

    await tt.test('a wandering pack never contains a boss', () => {
      for (let i = 0; i < 40; i++) {
        const pack = composeEncounter({ floor: 1 + (i % 9), grade: 3 });
        assert.ok(pack.length >= 1 && pack.length <= 3, 'one to three creatures');
        for (const e of pack) assert.ok(!BOSS_IDS.includes(e.id), `${e.id} is a boss in a mob slot`);
      }
    });

    await tt.test('a bigger pack splits one fight worth of HP between them', () => {
      const one = composeEncounter({ floor: 1, grade: 3, count: 1, rng: () => 0 });
      const three = composeEncounter({ floor: 1, grade: 3, count: 3, rng: () => 0 });
      assert.equal(one.length, 1);
      assert.equal(three.length, 3);
      // Same species (rng pinned to 0 picks the same definition every time),
      // so the ratio is purely the pack scale.
      assert.ok(three[0].maxHp < one[0].maxHp, 'three of them are individually weaker');
      const want = Math.max(1, Math.round(one[0].maxHp * PACK_HP_SCALE[3]));
      assert.ok(Math.abs(three[0].maxHp - want) <= 1);
      for (const e of three) assert.equal(e.hp, e.maxHp);
    });

    await tt.test('the pack size follows the documented roll', () => {
      assert.equal(composeEncounter({ floor: 1, rng: () => 0.1 }).length, 1);
      assert.equal(composeEncounter({ floor: 1, rng: () => 0.6 }).length, 2);
      assert.equal(composeEncounter({ floor: 1, rng: () => 0.95 }).length, 3);
    });
  });

  await t.test('applyBattleVictory', async (tt) => {
    const freshSave = () => ({
      gold: 100,
      party: [
        { id: 'knight-shadow', name: 'Shadow', hp: 20, maxHp: 52, xp: 0, level: 1 },
      ],
      unlockedHeroes: ['knight-shadow'],
      floors: Array.from({ length: 9 }, (_, i) => ({
        id: i + 1, unlocked: i === 0, complete: false, bestStreak: 0,
      })),
      stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0 },
      settings: {},
    });
    const live = () => [{ id: 'knight-shadow', name: 'Shadow', hp: 31, maxHp: 52 }];

    await tt.test('gold and XP are the shared reward curve, banked into the save', () => {
      const save = freshSave();
      const r = applyBattleVictory(save, { floor: 2, correct: 4, party: live() });
      const want = battleRewards(2, 4);
      assert.equal(r.gold, want.gold);
      assert.equal(r.xp, want.xp);
      assert.equal(save.gold, 100 + want.gold);
      assert.equal(save.party[0].xp, want.xp);
    });

    await tt.test('lifetime stats and the live HP both land in the save', () => {
      const save = freshSave();
      applyBattleVictory(save, { floor: 1, correct: 3, wrong: 2, party: live() });
      assert.equal(save.stats.totalBattles, 1);
      assert.equal(save.stats.totalCorrect, 3);
      assert.equal(save.stats.totalWrong, 2);
      assert.equal(save.party[0].hp, 31, 'the hero carries their wounds out of the fight');
    });

    await tt.test('a level-up raises the level, the HP ceiling and the current HP', () => {
      const save = freshSave();
      // Enough XP that a single win crosses at least one threshold.
      save.party[0].xp = 0;
      const r = applyBattleVictory(save, { floor: 9, correct: 20, party: live() });
      const expectLevel = computeLevel(save.party[0].xp);
      assert.equal(save.party[0].level, expectLevel);
      if (expectLevel > 1) {
        assert.ok(r.leveledUp.length > 0, 'and it is announced');
        assert.ok(save.party[0].maxHp > 52);
        assert.ok(save.party[0].hp > 31);
        assert.ok(save.party[0].hp <= save.party[0].maxHp, 'never over the ceiling');
      }
    });

    await tt.test('only a marked win completes the floor and unlocks the next', () => {
      const plain = freshSave();
      applyBattleVictory(plain, { floor: 1, party: live(), markFloor: false });
      assert.equal(plain.floors[0].complete, false, 'a wandering creature is not a floor');
      assert.equal(plain.floors[1].unlocked, false);

      const boss = freshSave();
      const r = applyBattleVictory(boss, { floor: 1, party: live(), markFloor: true });
      assert.equal(r.floorMarked, true);
      assert.equal(boss.floors[0].complete, true);
      assert.equal(boss.floors[1].unlocked, true, 'the next floor opens');
    });

    await tt.test('a perfect battle is recorded; a bloodied one is not', () => {
      const clean = freshSave();
      applyBattleVictory(clean, { floor: 1, party: live(), damageTaken: false });
      assert.equal(clean.stats.perfectBattle, true);
      const hurt = freshSave();
      applyBattleVictory(hurt, { floor: 1, party: live(), damageTaken: true });
      assert.notEqual(hurt.stats.perfectBattle, true);
    });

    await tt.test('no save (a harness, the screenshot rig) is not a crash', () => {
      const r = applyBattleVictory(null, { floor: 3, correct: 2, party: live() });
      assert.equal(r.gold, battleRewards(3, 2).gold);
      assert.deepEqual(r.leveledUp, []);
      assert.equal(r.floorMarked, false);
    });
  });

  await t.test('applyBattleDefeat', async (tt) => {
    await tt.test('the party comes back at half HP — a loss is never a wall', () => {
      const save = {
        party: [{ id: 'knight-shadow', name: 'Shadow', hp: 0, maxHp: 52 }],
        stats: { totalBattles: 2, totalCorrect: 5, totalWrong: 1 },
      };
      applyBattleDefeat(save, {
        correct: 1, wrong: 3,
        party: [{ id: 'knight-shadow', name: 'Shadow', hp: 0, maxHp: 52 }],
      });
      assert.equal(save.party[0].hp, 26);
      assert.equal(save.stats.totalBattles, 3);
      assert.equal(save.stats.totalCorrect, 6);
      assert.equal(save.stats.totalWrong, 4);
    });

    await tt.test('nobody ever revives on zero', () => {
      const save = { party: [], stats: {} };
      applyBattleDefeat(save, { party: [{ id: 'x', name: 'X', hp: 0, maxHp: 1 }] });
      assert.ok(save.party[0].hp >= 1);
    });
  });

  await t.test('a whole fight runs to a conclusion', () => {
    const party = [hero({ name: 'K', class: 'knight' }), hero({ name: 'W', class: 'wizard' })];
    const s = createBattleState({ party, enemies: [foe({ hp: 60 })], floor: 1, grade: 3 });
    const q = { a: 4, b: 5, op: '+', answer: 9, stars: 3, format: 'standard' };

    let guard = 0;
    while (!s.over && guard++ < 100) {
      const turn = nextTurn(s);
      if (turn.who === 'hero') {
        applyAnswerOutcome(s, { correct: true, heroIndex: turn.heroIndex });
        resolveHeroAttack(s, { heroIndex: turn.heroIndex, question: q });
      } else if (turn.who === 'enemy') {
        const target = chooseEnemyTarget(s, () => 0.99);
        if (target) resolveEnemyAttack(s, { attacker: s.enemies[0], target, rng: () => 0.99 });
      }
    }
    assert.ok(guard < 100, 'the loop terminates');
    assert.equal(s.over, 'victory');
    assert.ok(s.correct > 0);
    assert.ok(battleRewards(s.floor, s.correct).xp > 0);
  });
});
