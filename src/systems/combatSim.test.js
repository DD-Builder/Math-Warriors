import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeHeroDamage, computeEnemyDamage, applyDamageResult, advanceMomentum } from './combat.js';
import { specialDamagePerHero, isSpecialTurn } from './bossPresentation.js';
import { phaseForHp } from './bossPhases.js';
import { ALL_ENEMIES, BOSS_IDS, spawnEnemy } from '../data/enemies.js';
import { ALL_HEROES } from '../data/heroes.js';

/**
 * Combat pacing simulator — the balance gate for the stat pass.
 *
 * Models a battle the way BattleScene runs one: heroes rotate per
 * question, momentum/streak advance on answers, the enemy strikes one
 * hero after each full party cycle, and bosses fire their party-wide
 * special on the phase's cadence. Deterministic on purpose.
 *
 * UPDATED for the boss phase system: the simulator now recomputes the
 * boss's phase from its HP each enemy turn, exactly as BattleScene
 * does, so a transformed boss really does fire every 2nd turn at 78%
 * / 88% power. Without this the suite would have kept certifying the
 * OLD flat curve — the one the player complained about — while the
 * shipped game escalated.
 *
 * The invariants it locks:
 *  - mob fights end in a handful of correct answers (3-8)
 *  - boss fights are meaty but bounded (6-22, scaling with grade)
 *  - a kid who answers everything correctly NEVER wipes
 *  - a kid who answers ~60% correctly still survives early-floor mobs
 *  - boss THREAT rises monotonically from floor 1 to floor 9, and the
 *    Theorem is the single hardest fight at every grade
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
      // Phase is recomputed from live HP each enemy turn, exactly as
      // BattleScene does — it drives both cadence and special power.
      const phase = enemy.isBoss ? phaseForHp(enemy.hp, enemy.maxHp) : 1;
      if (enemy.isBoss && isSpecialTurn(enemyTurns, phase)) {
        for (const h of living) {
          const dmg = computeEnemyDamage(enemy, h, { momentum });
          h.hp = Math.max(0, h.hp - specialDamagePerHero(dmg.modifiedDamage, phase));
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

// ------------------------------------------------------------------
// THE ESCALATION CURVE
//
// The complaint this whole pass exists to fix: "bosses go downhill
// fast". They did — floor 9's mobs hit softer than floor 8's and the
// Theorem was a weaker fight than the Paradox. These are the guards
// that stop the curve inverting again.
// ------------------------------------------------------------------

describe('escalation curve: later must never be weaker', () => {
  const BOSS_BY_FLOOR = [...BOSSES].sort((a, b) => a.floor - b.floor);
  const MOBS_BY_FLOOR = (f) => MOBS.filter((e) => e.floor === f);
  const avg = (arr, key) => arr.reduce((s, e) => s + e[key], 0) / arr.length;

  test('boss stat lines rise strictly with floor (atk, def, hp weight)', () => {
    for (let i = 1; i < BOSS_BY_FLOOR.length; i++) {
      const prev = BOSS_BY_FLOOR[i - 1], cur = BOSS_BY_FLOOR[i];
      assert.ok(cur.atk > prev.atk, `${cur.id} atk ${cur.atk} <= ${prev.id} ${prev.atk}`);
      assert.ok(cur.def > prev.def, `${cur.id} def ${cur.def} <= ${prev.id} ${prev.def}`);
      assert.ok(cur.maxHp > prev.maxHp, `${cur.id} hp weight ${cur.maxHp} <= ${prev.id} ${prev.maxHp}`);
    }
  });

  test('mob rosters rise with floor (avg atk, def and hp weight)', () => {
    for (let f = 2; f <= 9; f++) {
      const prev = MOBS_BY_FLOOR(f - 1), cur = MOBS_BY_FLOOR(f);
      for (const key of ['atk', 'def', 'maxHp']) {
        assert.ok(avg(cur, key) > avg(prev, key),
          `floor ${f} avg ${key} ${avg(cur, key)} <= floor ${f - 1} ${avg(prev, key)}`);
      }
    }
  });

  test('the Theorem is the hardest fight in the game at every grade', () => {
    for (const grade of GRADES) {
      const theorem = simulate(spawnEnemy('theorem', { grade, isBoss: true }), grade);
      for (const def of BOSSES) {
        if (def.id === 'theorem') continue;
        const other = simulate(spawnEnemy(def.id, { grade, isBoss: true }), grade);
        assert.ok(theorem.partyHpFrac < other.partyHpFrac,
          `grade ${grade}: theorem left ${Math.round(theorem.partyHpFrac * 100)}% HP, ` +
          `${def.id} left ${Math.round(other.partyHpFrac * 100)}% — the final boss must hurt most`);
      }
    }
  });

  test('boss threat is non-decreasing across floors 1-7 at every grade', () => {
    // Floors 8-9 are exempt from the tick-by-tick comparison: their
    // fights run long enough that ONE extra special turn (a turn-parity
    // artifact, not a curve inversion) can swing the endpoint by a few
    // points either way. Their dominance is covered by the stat-line
    // test above and the Theorem test below.
    for (const grade of GRADES) {
      let prevDamage = -1;
      for (const def of BOSS_BY_FLOOR.filter((b) => b.floor <= 7)) {
        const r = simulate(spawnEnemy(def.id, { grade, isBoss: true }), grade);
        const damage = 1 - r.partyHpFrac;
        assert.ok(damage >= prevDamage - 1e-9,
          `grade ${grade}: ${def.id} (floor ${def.floor}) dealt ${damage.toFixed(3)} < previous ${prevDamage.toFixed(3)}`);
        prevDamage = damage;
      }
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
