import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeHeroDamage, computeEnemyDamage, applyDamageResult, advanceMomentum } from './combat.js';
import { specialDamagePerHero, isSpecialTurn } from './bossPresentation.js';
import { ALL_ENEMIES, BOSS_IDS, spawnEnemy } from '../data/enemies.js';
import { ALL_HEROES } from '../data/heroes.js';

/**
 * Combat pacing simulator — the balance gate for the v2 stat pass.
 *
 * Models a battle the way BattleScene runs one: heroes rotate per
 * question, momentum/streak advance on answers, the enemy strikes one
 * hero after each full party cycle, and bosses fire their party-wide
 * special every third enemy turn. Deterministic on purpose.
 *
 * The invariants it locks:
 *  - mob fights end in a handful of correct answers (3-8)
 *  - boss fights are meaty but bounded (8-22, scaling with grade)
 *  - a kid who answers everything correctly NEVER wipes
 *  - a kid who answers ~60% correctly still survives early-floor mobs
 */

function starterParty() {
  const ids = ['bunny-pepper', 'knight-shadow', 'wizard-stargazer'];
  return ids.map((id) => {
    const def = ALL_HEROES.find((h) => h.id === id);
    return { ...def, hp: def.hp ?? def.maxHp, maxHp: def.maxHp ?? def.hp };
  });
}

/**
 * Run one battle. answerPattern is a function(questionIndex) → correct?
 * Returns { questions, partyAlive, partyHpFrac } — questions counts
 * only CORRECT answers (a wrong answer costs a turn, not progress).
 */
function simulate(enemy, grade, { answerPattern = () => true, maxQuestions = 200 } = {}) {
  const party = starterParty();
  let momentum = 0.4;
  let streak = 0;
  let q = 0;
  let correctCount = 0;
  let enemyTurns = 0;
  let sinceEnemyTurn = 0;

  while (enemy.hp > 0 && party.some((h) => h.hp > 0) && q < maxQuestions) {
    const hero = party[q % party.length];
    const correct = answerPattern(q);
    q++;
    if (hero.hp > 0 && correct) {
      correctCount++;
      streak++;
      momentum = advanceMomentum(momentum, true, streak);
      applyDamageResult(enemy, computeHeroDamage(hero, enemy, { momentum, streak }));
    } else if (correct) {
      correctCount++; // downed hero's slot still consumes the question
    } else {
      streak = 0;
      momentum = advanceMomentum(momentum, false, 0);
    }

    // Enemy acts after each full party cycle
    sinceEnemyTurn++;
    if (enemy.hp > 0 && sinceEnemyTurn >= party.length) {
      sinceEnemyTurn = 0;
      enemyTurns++;
      const living = party.filter((h) => h.hp > 0);
      if (!living.length) break;
      if (enemy.isBoss && isSpecialTurn(enemyTurns)) {
        for (const h of living) {
          const dmg = computeEnemyDamage(enemy, h, { momentum });
          h.hp = Math.max(0, h.hp - specialDamagePerHero(dmg.modifiedDamage));
        }
      } else {
        const target = living[enemyTurns % living.length];
        applyDamageResult(target, computeEnemyDamage(enemy, target, { momentum }));
      }
    }
  }

  const totalHp = party.reduce((s, h) => s + h.maxHp, 0);
  const leftHp = party.reduce((s, h) => s + h.hp, 0);
  return {
    won: enemy.hp <= 0,
    questions: correctCount,
    partyAlive: party.some((h) => h.hp > 0),
    partyHpFrac: leftHp / totalHp,
  };
}

const GRADES = [0, 1, 2, 3, 4, 5];
const MOBS = ALL_ENEMIES.filter((e) => !BOSS_IDS.includes(e.id));
const BOSSES = ALL_ENEMIES.filter((e) => BOSS_IDS.includes(e.id));

describe('combat pacing: mob battles', () => {
  for (const grade of GRADES) {
    test(`grade ${grade}: every mob dies in 3-8 correct answers`, () => {
      for (const def of MOBS) {
        const r = simulate(spawnEnemy(def.id, { grade }), grade);
        assert.ok(r.won, `${def.id} not defeated`);
        assert.ok(r.questions >= 3 && r.questions <= 8,
          `${def.id} (floor ${def.floor}, grade ${grade}) took ${r.questions} correct answers`);
      }
    });
  }
});

describe('combat pacing: boss battles', () => {
  // Question bands per grade tier: short for K-1 (attention spans),
  // meaty for grades 4-5. Bosses escalate by floor within a band.
  const bossBand = (grade) => (grade <= 1 ? [6, 13] : grade <= 3 ? [9, 17] : [12, 22]);

  for (const grade of GRADES) {
    test(`grade ${grade}: bosses take a bounded, grade-scaled fight`, () => {
      const [lo, hi] = bossBand(grade);
      for (const def of BOSSES) {
        const r = simulate(spawnEnemy(def.id, { grade, isBoss: true }), grade);
        assert.ok(r.won, `${def.id} not defeated`);
        assert.ok(r.questions >= lo && r.questions <= hi,
          `${def.id} (grade ${grade}) took ${r.questions} correct answers, want ${lo}-${hi}`);
      }
    });
  }

  test('bosses escalate: the Theorem outlasts the Briar King at every grade', () => {
    for (const grade of GRADES) {
      const first = simulate(spawnEnemy('briarking', { grade, isBoss: true }), grade);
      const last = simulate(spawnEnemy('theorem', { grade, isBoss: true }), grade);
      assert.ok(last.questions > first.questions,
        `grade ${grade}: theorem ${last.questions} vs briarking ${first.questions}`);
    }
  });
});

describe('combat safety: kids are never crushed', () => {
  test('a perfect player never wipes, on any enemy at any grade', () => {
    for (const grade of GRADES) {
      for (const def of ALL_ENEMIES) {
        const isBoss = BOSS_IDS.includes(def.id);
        const r = simulate(spawnEnemy(def.id, { grade, isBoss }), grade);
        assert.ok(r.partyAlive, `party wiped vs ${def.id} at grade ${grade} playing perfectly`);
      }
    }
  });

  test('a 60%-correct player survives early-floor mobs', () => {
    // pattern: 3 correct, 2 wrong, repeat — a kid having a rough day
    const rough = (q) => q % 5 < 3;
    for (const grade of GRADES) {
      for (const def of MOBS.filter((e) => e.floor <= 3)) {
        const r = simulate(spawnEnemy(def.id, { grade }), grade, { answerPattern: rough });
        assert.ok(r.won && r.partyAlive,
          `rough day vs ${def.id} (floor ${def.floor}, grade ${grade}): won=${r.won} alive=${r.partyAlive}`);
      }
    }
  });

  test('perfect players finish mob fights healthy (>50% party HP)', () => {
    for (const grade of GRADES) {
      for (const def of MOBS) {
        const r = simulate(spawnEnemy(def.id, { grade }), grade);
        assert.ok(r.partyHpFrac > 0.5,
          `${def.id} grade ${grade} left party at ${Math.round(r.partyHpFrac * 100)}% HP`);
      }
    }
  });
});
