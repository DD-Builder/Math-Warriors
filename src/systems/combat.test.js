/**
 * Unit tests for src/systems/combat.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOMENTUM_ZONES,
  getZone,
  advanceMomentum,
  computeHeroDamage,
  computeEnemyDamage,
  applyDamageResult,
  buildTurnSequence,
  advanceTurn,
  isPartyDefeated,
  pickRandomLivingHero,
  pickEnemyTarget,
  computeCommandDamage,
} from './combat.js';
import { computeEnemyHp, getEnemyById } from '../data/enemies.js';

// ------------------------------------------------------------------
// ZONES
// ------------------------------------------------------------------

describe('getZone', () => {
  test('0.0 is COOL', () => {
    assert.equal(getZone(0.0).label, 'COOL');
  });

  test('0.2 is COOL', () => {
    assert.equal(getZone(0.2).label, 'COOL');
  });

  test('0.5 is ZONE', () => {
    assert.equal(getZone(0.5).label, 'ZONE');
  });

  test('0.7 is HEAT', () => {
    assert.equal(getZone(0.7).label, 'HEAT');
  });

  test('1.0 is HEAT', () => {
    assert.equal(getZone(1.0).label, 'HEAT');
  });

  test('boundary 0.33 is ZONE', () => {
    assert.equal(getZone(0.33).label, 'ZONE');
  });

  test('boundary 0.66 is HEAT', () => {
    assert.equal(getZone(0.66).label, 'HEAT');
  });

  test('zone multipliers are symmetric and logical', () => {
    // COOL hurts the hero and helps the enemy
    assert.ok(MOMENTUM_ZONES.COOL.heroMult < 1);
    assert.ok(MOMENTUM_ZONES.COOL.enemyMult > 1);
    // HEAT helps the hero and hurts the enemy
    assert.ok(MOMENTUM_ZONES.HEAT.heroMult > 1);
    assert.ok(MOMENTUM_ZONES.HEAT.enemyMult < 1);
    // ZONE is neutral
    assert.equal(MOMENTUM_ZONES.ZONE.heroMult, 1);
    assert.equal(MOMENTUM_ZONES.ZONE.enemyMult, 1);
  });
});

// ------------------------------------------------------------------
// MOMENTUM
// ------------------------------------------------------------------

describe('advanceMomentum', () => {
  test('correct answer increases momentum', () => {
    assert.ok(advanceMomentum(0.5, true, 0) > 0.5);
  });

  test('wrong answer decreases momentum', () => {
    assert.ok(advanceMomentum(0.5, false, 0) < 0.5);
  });

  test('streak boosts correct-answer increase', () => {
    const noStreak    = advanceMomentum(0.5, true, 0);
    const withStreak  = advanceMomentum(0.5, true, 5);
    assert.ok(withStreak > noStreak);
  });

  test('cannot exceed 1.0', () => {
    assert.ok(advanceMomentum(0.99, true, 100) <= 1.0);
  });

  test('cannot go below 0.0', () => {
    assert.ok(advanceMomentum(0.01, false, 0) >= 0.0);
  });

  test('clamps exactly at 1.0 when saturated', () => {
    assert.equal(advanceMomentum(1.0, true, 10), 1.0);
  });

  test('clamps at momentum floor (0.15) when saturated', () => {
    assert.equal(advanceMomentum(0.15, false), 0.15);
  });

  test('streak bonus does not affect wrong answers', () => {
    assert.equal(advanceMomentum(0.5, false, 0), advanceMomentum(0.5, false, 10));
  });
});

// ------------------------------------------------------------------
// DAMAGE
// ------------------------------------------------------------------

describe('computeHeroDamage', () => {
  const attacker = { hp: 50, maxHp: 50, atk: 10, def: 10 };
  const target   = { hp: 20, maxHp: 20, atk: 10, def: 5 };

  test('returns a valid DamageResult', () => {
    const r = computeHeroDamage(attacker, target, { momentum: 0.5 });
    assert.equal(typeof r.baseDamage, 'number');
    assert.equal(typeof r.modifiedDamage, 'number');
    assert.equal(typeof r.newHp, 'number');
    assert.equal(typeof r.killed, 'boolean');
  });

  test('deals at least 1 damage', () => {
    const r = computeHeroDamage(attacker, target, { momentum: 0.5 });
    assert.ok(r.modifiedDamage >= 1);
  });

  test('does not produce negative HP', () => {
    const weakTarget = { hp: 1, maxHp: 20, atk: 10, def: 0 };
    const r = computeHeroDamage(attacker, weakTarget, { momentum: 1.0 });
    assert.ok(r.newHp >= 0);
  });

  test('HEAT zone damage > ZONE damage > COOL zone damage', () => {
    const cool = computeHeroDamage(attacker, target, { momentum: 0.1 });
    const zone = computeHeroDamage(attacker, target, { momentum: 0.5 });
    const heat = computeHeroDamage(attacker, target, { momentum: 0.9 });
    assert.ok(cool.modifiedDamage <= zone.modifiedDamage, `cool ${cool.modifiedDamage} should be <= zone ${zone.modifiedDamage}`);
    assert.ok(zone.modifiedDamage <= heat.modifiedDamage, `zone ${zone.modifiedDamage} should be <= heat ${heat.modifiedDamage}`);
  });

  test('flags killed when newHp reaches 0', () => {
    const frail = { hp: 1, maxHp: 20, atk: 10, def: 0 };
    const r = computeHeroDamage(attacker, frail, { momentum: 0.5 });
    assert.equal(r.killed, true);
    assert.equal(r.newHp, 0);
  });

  test('does not flag killed when target was already dead', () => {
    const dead = { hp: 0, maxHp: 20 };
    const r = computeHeroDamage(attacker, dead, { momentum: 0.5 });
    assert.equal(r.killed, false);
  });

  test('does not mutate target', () => {
    const t = { hp: 20, maxHp: 20, def: 0 };
    computeHeroDamage(attacker, t, { momentum: 0.5 });
    assert.equal(t.hp, 20);
  });
});

describe('computeEnemyDamage', () => {
  const enemy = { hp: 30, maxHp: 30, atk: 10 };
  const hero  = { hp: 30, maxHp: 30, def: 10 };

  test('COOL zone enemy damage > ZONE > HEAT', () => {
    const cool = computeEnemyDamage(enemy, hero, { momentum: 0.1 });
    const zone = computeEnemyDamage(enemy, hero, { momentum: 0.5 });
    const heat = computeEnemyDamage(enemy, hero, { momentum: 0.9 });
    assert.ok(cool.modifiedDamage >= zone.modifiedDamage);
    assert.ok(zone.modifiedDamage >= heat.modifiedDamage);
  });

  test('deals at least 1 damage', () => {
    const r = computeEnemyDamage(enemy, hero, { momentum: 0.5 });
    assert.ok(r.modifiedDamage >= 1);
  });
});

describe('applyDamageResult', () => {
  test('is the ONLY place HP should be mutated', () => {
    const t = { hp: 20, maxHp: 20 };
    const r = { baseDamage: 5, modifiedDamage: 5, newHp: 15, killed: false };
    applyDamageResult(t, r);
    assert.equal(t.hp, 15);
  });
});

// ------------------------------------------------------------------
// TURN ORDER
// ------------------------------------------------------------------

describe('buildTurnSequence', () => {
  test('party of 3 produces 6 turns (hero/enemy pairs)', () => {
    const seq = buildTurnSequence(3);
    assert.equal(seq.length, 6);
    assert.equal(seq[0].who, 'hero');
    assert.equal(seq[0].heroIndex, 0);
    assert.equal(seq[1].who, 'enemy');
    assert.equal(seq[2].who, 'hero');
    assert.equal(seq[2].heroIndex, 1);
    assert.equal(seq[3].who, 'enemy');
    assert.equal(seq[4].who, 'hero');
    assert.equal(seq[4].heroIndex, 2);
    assert.equal(seq[5].who, 'enemy');
  });

  test('party of 1 produces 2 turns', () => {
    const seq = buildTurnSequence(1);
    assert.equal(seq.length, 2);
  });
});

describe('advanceTurn', () => {
  const party = [
    { hp: 30, maxHp: 30 },
    { hp: 30, maxHp: 30 },
    { hp: 30, maxHp: 30 },
  ];
  const seq = buildTurnSequence(3);

  test('advances from hero 0 turn to enemy turn', () => {
    const r = advanceTurn(seq, 0, party);
    assert.equal(r.turn.who, 'enemy');
  });

  test('wraps around the sequence', () => {
    const r = advanceTurn(seq, 5, party);  // last turn
    assert.equal(r.index, 0);
    assert.equal(r.turn.heroIndex, 0);
  });

  test('skips dead heroes', () => {
    const partial = [
      { hp: 30, maxHp: 30 },
      { hp: 0,  maxHp: 30 },  // hero 1 is dead
      { hp: 30, maxHp: 30 },
    ];
    // Starting from hero 0's enemy turn (index 1), next should skip hero 1 and go to enemy turn (index 3)
    const r = advanceTurn(seq, 1, partial);
    assert.equal(r.turn.who, 'enemy');
    assert.equal(r.index, 3);  // skipped hero 1's turn at index 2
  });

  test('returns null when entire party is dead', () => {
    const dead = [
      { hp: 0, maxHp: 30 },
      { hp: 0, maxHp: 30 },
      { hp: 0, maxHp: 30 },
    ];
    // From an enemy turn, advancing should find no living hero and no
    // enemy turn before going all the way around. But since we include
    // enemy turns, we'll always find SOMETHING. Test with a party-only
    // sequence instead.
    const heroOnlySeq = [
      { who: 'hero', heroIndex: 0 },
      { who: 'hero', heroIndex: 1 },
      { who: 'hero', heroIndex: 2 },
    ];
    const r = advanceTurn(heroOnlySeq, 0, dead);
    assert.equal(r, null);
  });
});

describe('isPartyDefeated', () => {
  test('returns false when any hero has HP', () => {
    assert.equal(isPartyDefeated([{ hp: 30 }, { hp: 0 }, { hp: 0 }]), false);
  });

  test('returns true when all heroes are dead', () => {
    assert.equal(isPartyDefeated([{ hp: 0 }, { hp: 0 }, { hp: 0 }]), true);
  });

  test('returns true for empty party', () => {
    assert.equal(isPartyDefeated([]), true);
  });
});

describe('pickRandomLivingHero', () => {
  test('never picks a dead hero', () => {
    const party = [
      { hp: 0,  name: 'dead1' },
      { hp: 30, name: 'alive' },
      { hp: 0,  name: 'dead2' },
    ];
    for (let i = 0; i < 100; i++) {
      const pick = pickRandomLivingHero(party);
      assert.equal(pick.name, 'alive');
    }
  });

  test('returns null when all dead', () => {
    assert.equal(pickRandomLivingHero([{ hp: 0 }, { hp: 0 }]), null);
  });

  test('returns null for empty party', () => {
    assert.equal(pickRandomLivingHero([]), null);
  });

  test('accepts a custom RNG', () => {
    const party = [{ hp: 30, id: 'a' }, { hp: 30, id: 'b' }];
    // Deterministic RNG that always returns 0 → first element
    assert.equal(pickRandomLivingHero(party, () => 0).id, 'a');
    // Deterministic RNG that returns 0.99 → last element
    assert.equal(pickRandomLivingHero(party, () => 0.99).id, 'b');
  });
});

describe('pickEnemyTarget', () => {
  test('never picks a dead hero', () => {
    const party = [{ hp: 0, id: 'dead' }, { hp: 30, id: 'alive' }];
    for (let i = 0; i < 100; i++) {
      assert.equal(pickEnemyTarget(party).id, 'alive');
    }
  });

  test('returns null when all dead', () => {
    assert.equal(pickEnemyTarget([{ hp: 0 }]), null);
  });

  test('spreads attacks roughly uniformly across 3 heroes', () => {
    const party = [{ hp: 30, id: 'a' }, { hp: 30, id: 'b' }, { hp: 30, id: 'c' }];
    const counts = { a: 0, b: 0, c: 0 };
    const recent = [];
    let seed = 12345;
    const rng = () => {
      // Deterministic LCG so the test can't flake
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 3000; i++) {
      const pick = pickEnemyTarget(party, recent, rng);
      counts[pick.id]++;
      recent.push(pick);
      if (recent.length > 2) recent.shift();
    }
    for (const id of ['a', 'b', 'c']) {
      const share = counts[id] / 3000;
      assert.ok(share > 0.25 && share < 0.42,
        `hero ${id} share ${share.toFixed(3)} outside 0.25-0.42 — targeting is skewed`);
    }
  });

  test('rerolls a third consecutive pick of the same hero', () => {
    const party = [{ hp: 30, id: 'a' }, { hp: 30, id: 'b' }];
    const a = party[0];
    // RNG sequence: first call would pick 'a' again (0.0), reroll picks 'b' (0.9)
    const seq = [0.0, 0.9];
    let i = 0;
    const pick = pickEnemyTarget(party, [a, a], () => seq[i++]);
    assert.equal(pick.id, 'b', 'anti-streak reroll should move off the hammered hero');
  });

  test('single survivor is always the target (no reroll dodge)', () => {
    const party = [{ hp: 30, id: 'a' }];
    const a = party[0];
    assert.equal(pickEnemyTarget(party, [a, a]).id, 'a');
  });
});

// ------------------------------------------------------------------
// DAMAGE MATRIX — design-band regression for hits-to-kill
// ------------------------------------------------------------------
// Pairs computeEnemyHp (HP budget per grade) with computeCommandDamage
// (per-correct-answer damage) and asserts the resulting battle length
// stays inside the design bands for a typical hero:
//   ATK = 16 + grade (the same pacing assumption computeEnemyHp uses),
//   ZONE momentum (0.5), streak 0, difficulty 1.0, FIGHT command 1.0.
//
//   minions: 2-8 correct answers to defeat
//   bosses:  8-26 correct answers to defeat (streak-free worst case;
//            late bosses carry a floor-scaled HP weight, and real play
//            ramps streak — combatSim.test.js asserts the played length)

describe('damage matrix: hits-to-kill stays in design bands', () => {
  const GRADES = [0, 1, 2, 3, 4, 5];
  const TYPICAL_CTX = { momentum: 0.5, streak: 0, difficultyMult: 1.0, commandMult: 1.0 };

  // Representative enemies: early mob, mid-game tanky mob, final boss.
  const CASES = [
    { id: 'sproutling', isBoss: false, label: 'floor 1 Sproutling (minion)' },
    { id: 'glacial',    isBoss: false, label: 'floor 5 Glacial Golem (minion)' },
    { id: 'theorem',    isBoss: true,  label: 'floor 9 The Theorem (boss)' },
  ];

  function hitsToKill(atk, enemyDef, grade, isBoss) {
    const hp = computeEnemyHp(enemyDef, grade, isBoss);
    const target = { hp, maxHp: hp, def: enemyDef.def };
    const perHit = computeCommandDamage({ hp: 50, maxHp: 50, atk }, target, TYPICAL_CTX).modifiedDamage;
    return Math.ceil(hp / perHit);
  }

  for (const { id, isBoss, label } of CASES) {
    const enemyDef = getEnemyById(id);
    const [lo, hi] = isBoss ? [8, 26] : [2, 8];

    test(`${label}: ${lo}-${hi} hits across grades 0-5 at typical ATK`, () => {
      assert.ok(enemyDef, `enemy ${id} should exist in the roster`);
      for (const grade of GRADES) {
        const hits = hitsToKill(16 + grade, enemyDef, grade, isBoss);
        assert.ok(
          hits >= lo && hits <= hi,
          `grade ${grade}: ${id} took ${hits} hits, expected ${lo}-${hi}`
        );
      }
    });
  }

  test('monotonicity: more ATK never means more hits-to-kill', () => {
    for (const { id, isBoss } of CASES) {
      const enemyDef = getEnemyById(id);
      for (const grade of GRADES) {
        let prevHits = Infinity;
        for (let atk = 10; atk <= 40; atk++) {
          const hits = hitsToKill(atk, enemyDef, grade, isBoss);
          assert.ok(
            hits <= prevHits,
            `${id} grade ${grade}: hits rose from ${prevHits} to ${hits} when ATK rose to ${atk}`
          );
          prevHits = hits;
        }
      }
    }
  });

  test('per-hit damage itself is monotone nondecreasing in ATK', () => {
    const target = { hp: 100, maxHp: 100, def: 12 };
    let prev = 0;
    for (let atk = 1; atk <= 50; atk++) {
      const dmg = computeCommandDamage({ hp: 50, maxHp: 50, atk }, target, TYPICAL_CTX).modifiedDamage;
      assert.ok(dmg >= prev, `damage dropped from ${prev} to ${dmg} at ATK ${atk}`);
      prev = dmg;
    }
  });
});
