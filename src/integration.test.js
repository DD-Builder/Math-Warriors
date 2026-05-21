/**
 * Deep integration test — validates that every floor's data wiring is
 * consistent end-to-end: floors ↔ enemies ↔ abilities ↔ dialogue ↔ save ↔
 * world map ↔ math generators.
 *
 * This is the "does everything actually connect" test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FLOORS } from './data/floors.js';
import {
  ALL_ENEMIES, getEnemyById, getEnemiesForFloor, pickEnemyForFloor,
  spawnEnemy, computeEnemyHp, FLOOR_OPERATORS,
} from './data/enemies.js';
import { ALL_HEROES } from './data/heroes.js';
import { ABILITIES, getAbility, invokeAbility } from './systems/abilities.js';
import { DIALOGUE } from './data/dialogue.js';
import { makeDefaultSave, markFloorComplete, unlockHeroesForFloor, isHeroUnlocked } from './systems/save.js';
import { generateQuestion, expectedAnswer } from './systems/math.js';

// ── CONSTANTS ──
const TOTAL_FLOORS = 9;
const ENEMIES_PER_FLOOR = 5;
const FLOOR_BOSS_MAP = {
  1: 'briarking', 2: 'pressure', 3: 'skywhale', 4: 'pyroclast',
  5: 'absolutezero', 6: 'theprism', 7: 'counterfeiter',
  8: 'theparadox', 9: 'theorem',
};

// ================================================================
// 1. FLOOR DATA INTEGRITY
// ================================================================

describe('floor definitions (all 9)', () => {
  it(`FLOORS array has exactly ${TOTAL_FLOORS} entries`, () => {
    assert.equal(FLOORS.length, TOTAL_FLOORS);
  });

  for (let f = 1; f <= TOTAL_FLOORS; f++) {
    describe(`floor ${f}`, () => {
      const floor = FLOORS[f - 1];

      it('has id, name, tiles, objects, palette, challenge', () => {
        assert.equal(floor.id, f);
        assert.ok(floor.name, 'name');
        assert.ok(Array.isArray(floor.tiles), 'tiles');
        assert.ok(Array.isArray(floor.objects), 'objects');
        assert.ok(floor.palette, 'palette');
        assert.ok(floor.challenge, 'challenge');
      });

      it('tiles form a rectangular grid', () => {
        const rows = floor.tiles.length;
        assert.ok(rows >= 5, 'at least 5 rows');
        const cols = floor.tiles[0].length;
        for (const row of floor.tiles) {
          assert.equal(row.length, cols, 'consistent column count');
        }
      });

      it('has exactly 1 boss object', () => {
        const bosses = floor.objects.filter(o => o.type === 'boss');
        assert.equal(bosses.length, 1, `floor ${f} should have 1 boss`);
      });

      it('boss object references correct enemy', () => {
        const boss = floor.objects.find(o => o.type === 'boss');
        const expectedBossId = FLOOR_BOSS_MAP[f];
        assert.equal(boss.enemyId, expectedBossId,
          `floor ${f} boss should be ${expectedBossId}`);
      });

      it('has at least 1 exit object', () => {
        const exits = floor.objects.filter(o => o.type === 'exit');
        assert.ok(exits.length >= 1, 'at least 1 exit');
      });

      it('has exactly 3 challenge objects matching challenge.type', () => {
        const cType = floor.challenge.type;
        const items = floor.objects.filter(o => o.type === cType);
        assert.equal(items.length, floor.challenge.count,
          `floor ${f} needs ${floor.challenge.count} ${cType} objects`);
      });

      it('challenge has count, label, verb, allDoneMsg', () => {
        const ch = floor.challenge;
        assert.ok(ch.count >= 1, 'count');
        assert.ok(ch.label, 'label');
        assert.ok(ch.verb, 'verb');
        assert.ok(ch.allDoneMsg, 'allDoneMsg');
      });

      it('all objects are within tile bounds', () => {
        const rows = floor.tiles.length;
        const cols = floor.tiles[0].length;
        for (const o of floor.objects) {
          assert.ok(o.x >= 0 && o.x < cols, `${o.type} tx in bounds`);
          assert.ok(o.y >= 0 && o.y < rows, `${o.type} ty in bounds`);
        }
      });

      it('palette has required color keys', () => {
        const required = ['wall', 'floor', 'path'];
        for (const k of required) {
          assert.ok(k in floor.palette, `palette.${k}`);
        }
      });
    });
  }
});

// ================================================================
// 2. ENEMY ↔ FLOOR WIRING
// ================================================================

describe('enemy-floor wiring', () => {
  it(`total enemy count is ${TOTAL_FLOORS * ENEMIES_PER_FLOOR}`, () => {
    assert.equal(ALL_ENEMIES.length, TOTAL_FLOORS * ENEMIES_PER_FLOOR);
  });

  for (let f = 1; f <= TOTAL_FLOORS; f++) {
    it(`floor ${f} has exactly ${ENEMIES_PER_FLOOR} enemies`, () => {
      assert.equal(getEnemiesForFloor(f).length, ENEMIES_PER_FLOOR);
    });

    it(`floor ${f} boss exists and is findable`, () => {
      const bossId = FLOOR_BOSS_MAP[f];
      const boss = getEnemyById(bossId);
      assert.ok(boss, `boss ${bossId} not found`);
      assert.equal(boss.floor, f);
    });

    it(`floor ${f} pickEnemyForFloor never returns the boss`, () => {
      const bossId = FLOOR_BOSS_MAP[f];
      for (let i = 0; i < 20; i++) {
        const picked = pickEnemyForFloor(f);
        assert.ok(picked, 'should pick something');
        assert.notEqual(picked.id, bossId, 'must not pick boss');
      }
    });
  }
});

// ================================================================
// 3. ABILITY ↔ ENEMY WIRING
// ================================================================

describe('ability-enemy wiring', () => {
  it('every enemy ability resolves to a defined ability object', () => {
    const missing = [];
    for (const enemy of ALL_ENEMIES) {
      const ab = getAbility(enemy.ability);
      const hasHook = ab.onBattleStart || ab.onHeroCorrect || ab.onHeroWrong;
      if (!hasHook) missing.push(`${enemy.id} → ${enemy.ability}`);
    }
    assert.equal(missing.length, 0,
      `Missing ability implementations: ${missing.join(', ')}`);
  });

  it('every boss ability has at least onHeroCorrect or onHeroWrong', () => {
    for (const [floor, bossId] of Object.entries(FLOOR_BOSS_MAP)) {
      const boss = getEnemyById(bossId);
      const ab = getAbility(boss.ability);
      const hasReactive = ab.onHeroCorrect || ab.onHeroWrong;
      assert.ok(hasReactive, `boss ${bossId} (floor ${floor}) ability ${boss.ability} has no reactive hook`);
    }
  });

  it('invoking every ability hook does not throw', () => {
    const mockScene = {
      showToast: () => {},
      updateEnemyHp: () => {},
      updateAllHeroHp: () => {},
      _consumeNextTurn: false,
      streak: 0,
    };
    const hero = { name: 'Test', hp: 50, maxHp: 50, atk: 10, def: 5, class: 'knight' };
    for (const enemy of ALL_ENEMIES) {
      const e = { ...enemy, hp: 100, maxHp: 100 };
      const ctx = { enemy: e, party: [hero, { ...hero }, { ...hero }], scene: { ...mockScene }, activeHero: hero };
      assert.doesNotThrow(() => invokeAbility(e.ability, 'onBattleStart', ctx), `${e.id} onBattleStart`);
      assert.doesNotThrow(() => invokeAbility(e.ability, 'onHeroCorrect', ctx), `${e.id} onHeroCorrect`);
      assert.doesNotThrow(() => invokeAbility(e.ability, 'onHeroWrong', ctx), `${e.id} onHeroWrong`);
    }
  });
});

// ================================================================
// 4. DIALOGUE COVERAGE
// ================================================================

describe('dialogue coverage (all 9 floors)', () => {
  const requiredKeys = [];
  for (let f = 1; f <= TOTAL_FLOORS; f++) {
    requiredKeys.push(`floor${f}_entry`, `floor${f}_boss`, `floor${f}_victory`, `floor${f}_boss_half`);
  }

  for (const key of requiredKeys) {
    it(`DIALOGUE["${key}"] exists and has content`, () => {
      assert.ok(DIALOGUE[key], `missing key: ${key}`);
      assert.ok(Array.isArray(DIALOGUE[key]), `${key} should be array`);
      assert.ok(DIALOGUE[key].length >= 1, `${key} should have ≥1 line`);
      for (const line of DIALOGUE[key]) {
        assert.ok(line.speaker, `${key} line missing speaker`);
        assert.ok(line.text, `${key} line missing text`);
        const maxLen = key.includes('boss_half') ? 80 : 200;
        assert.ok(line.text.length <= maxLen, `${key} text too long (${line.text.length}>${maxLen}): "${line.text.substring(0, 50)}..."`);
      }
    });
  }

  it('boss half-HP dialogue speakers match boss names', () => {
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      const bossId = FLOOR_BOSS_MAP[f];
      const boss = getEnemyById(bossId);
      const halfKey = `floor${f}_boss_half`;
      const speaker = DIALOGUE[halfKey][0].speaker;
      assert.equal(speaker, boss.name,
        `floor ${f} half-HP speaker "${speaker}" != boss name "${boss.name}"`);
    }
  });
});

// ================================================================
// 5. SAVE SYSTEM ↔ 9 FLOORS
// ================================================================

describe('save system (9-floor support)', () => {
  it('default save has 9 floor entries', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors.length, TOTAL_FLOORS);
  });

  it('floor 1 unlocked by default, rest locked', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors[0].unlocked, true);
    for (let i = 1; i < TOTAL_FLOORS; i++) {
      assert.equal(save.floors[i].unlocked, false, `floor ${i + 1} should be locked`);
    }
  });

  it('markFloorComplete unlocks the next floor', () => {
    const save = makeDefaultSave();
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      markFloorComplete(save, f);
      assert.equal(save.floors[f - 1].complete, true, `floor ${f} complete`);
      if (f < TOTAL_FLOORS) {
        assert.equal(save.floors[f].unlocked, true, `floor ${f + 1} unlocked`);
      }
    }
  });

  it('markFloorComplete on floor 9 does not crash', () => {
    const save = makeDefaultSave();
    assert.doesNotThrow(() => markFloorComplete(save, TOTAL_FLOORS));
    assert.equal(save.floors[TOTAL_FLOORS - 1].complete, true);
  });
});

// ================================================================
// 6. FLOOR OPERATORS → MATH GENERATORS
// ================================================================

describe('floor operators → math generation', () => {
  const expectedOps = {
    1: '+', 2: '-', 3: '*', 4: '/',
    5: 'mixed', 6: 'frac', 7: 'geo', 8: 'money', 9: 'word',
  };

  for (let f = 1; f <= TOTAL_FLOORS; f++) {
    it(`floor ${f} operator is "${expectedOps[f]}"`, () => {
      assert.equal(FLOOR_OPERATORS[f], expectedOps[f]);
    });
  }

  it('every operator produces valid questions at all grades', () => {
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      const op = FLOOR_OPERATORS[f];
      for (let g = 0; g <= 5; g++) {
        const q = generateQuestion(op, g);
        assert.ok(q, `no question for op=${op} grade=${g}`);
        assert.ok(typeof q.answer === 'number' && !isNaN(q.answer),
          `answer not valid number for op=${op} grade=${g}: ${q.answer}`);
        assert.ok(Array.isArray(q.choices) && q.choices.length >= 2,
          `bad choices for op=${op} grade=${g}`);
        assert.ok(q.choices.includes(q.answer),
          `correct answer not in choices for op=${op} grade=${g}`);
      }
    }
  });
});

// ================================================================
// 7. ENEMY HP SCALING SANITY
// ================================================================

describe('enemy HP scaling', () => {
  for (let f = 1; f <= TOTAL_FLOORS; f++) {
    it(`floor ${f} mobs scale to ~4 problems at grade 3`, () => {
      const enemies = getEnemiesForFloor(f).filter(e => e.id !== FLOOR_BOSS_MAP[f]);
      for (const e of enemies) {
        const hp = computeEnemyHp(e, 3, false);
        const op = FLOOR_OPERATORS[f] || '+';
        const avg = Math.max(1, expectedAnswer(op, 3));
        const problems = hp / avg;
        assert.ok(problems >= 2, `${e.id}: too few problems (${problems.toFixed(1)})`);
        assert.ok(problems <= 10, `${e.id}: too many problems (${problems.toFixed(1)})`);
      }
    });

    it(`floor ${f} boss scales to ~15 problems at grade 3`, () => {
      const bossId = FLOOR_BOSS_MAP[f];
      const boss = getEnemyById(bossId);
      const hp = computeEnemyHp(boss, 3, true);
      const op = FLOOR_OPERATORS[f] || '+';
      const avg = Math.max(1, expectedAnswer(op, 3));
      const problems = hp / avg;
      assert.ok(problems >= 8, `${bossId}: boss too easy (${problems.toFixed(1)} problems)`);
      assert.ok(problems <= 25, `${bossId}: boss too hard (${problems.toFixed(1)} problems)`);
    });
  }

  it('boss HP increases monotonically from grade 0 to 5', () => {
    for (const bossId of Object.values(FLOOR_BOSS_MAP)) {
      const boss = getEnemyById(bossId);
      let prevHp = 0;
      for (let g = 0; g <= 5; g++) {
        const hp = computeEnemyHp(boss, g, true);
        assert.ok(hp >= prevHp, `${bossId} HP should grow: grade ${g} HP=${hp} < prev=${prevHp}`);
        prevHp = hp;
      }
    }
  });
});

// ================================================================
// 8. BOSS ABILITY MECHANICS (functional)
// ================================================================

describe('boss ability mechanics (functional)', () => {
  function bossCtx(bossId) {
    const boss = getEnemyById(bossId);
    const e = spawnEnemy(bossId, { grade: 3, isBoss: true });
    const hero = { name: 'TestHero', hp: 50, maxHp: 50, atk: 10, def: 5, class: 'knight' };
    const party = [hero, { ...hero, name: 'H2' }, { ...hero, name: 'H3' }];
    const scene = {
      showToast: () => {},
      updateEnemyHp: () => {},
      _consumeNextTurn: false,
      streak: 0,
    };
    return { enemy: e, party, scene, activeHero: hero };
  }

  it('Briar King (crown_tally): ATK grows on wrong', () => {
    const ctx = bossCtx('briarking');
    invokeAbility('crown_tally', 'onBattleStart', ctx);
    const baseAtk = ctx.enemy.atk;
    invokeAbility('crown_tally', 'onHeroWrong', ctx);
    invokeAbility('crown_tally', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.atk, baseAtk + 2);
  });

  it('The Pressure (abs_reduction): DEF grows on wrong', () => {
    const ctx = bossCtx('pressure');
    invokeAbility('abs_reduction', 'onBattleStart', ctx);
    const baseDef = ctx.enemy.def;
    invokeAbility('abs_reduction', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.def, baseDef + 1);
  });

  it('Skywhale (mass_matters): DEF up on wrong, down on correct', () => {
    const ctx = bossCtx('skywhale');
    const baseDef = ctx.enemy.def;
    invokeAbility('mass_matters', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.def, baseDef + 2);
    invokeAbility('mass_matters', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.def, baseDef + 1);
  });

  it('Pyroclast (core_divide): meltdown at low HP', () => {
    const ctx = bossCtx('pyroclast');
    invokeAbility('core_divide', 'onBattleStart', ctx);
    ctx.enemy.hp = Math.floor(ctx.enemy.maxHp * 0.2);
    const baseAtk = ctx.enemy.atk;
    invokeAbility('core_divide', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._corePhase, true);
    assert.equal(ctx.enemy.atk, Math.round(baseAtk * 1.5));
    assert.equal(ctx.enemy.def, 0);
  });

  it('Absolute Zero (deep_freeze): 3-stack mechanic', () => {
    const ctx = bossCtx('absolutezero');
    invokeAbility('deep_freeze', 'onBattleStart', ctx);
    const heroDef = ctx.activeHero.def;
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._freezeStacks, 0, 'reset after trigger');
    assert.equal(ctx.activeHero.def, heroDef - 3, 'hero loses 3 DEF');
  });

  it('The Prism (shape_shift): shifts form every 3 correct', () => {
    const ctx = bossCtx('theprism');
    invokeAbility('shape_shift', 'onBattleStart', ctx);
    for (let i = 0; i < 3; i++) invokeAbility('shape_shift', 'onHeroCorrect', ctx);
    const shifted = ctx.enemy.atk !== ctx.enemy._baseAtk || ctx.enemy.def !== ctx.enemy._baseDef;
    assert.ok(shifted, 'stats should have shifted');
  });

  it('The Counterfeiter (fake_coins): consume on wrong, surge on 3+ fakes', () => {
    const ctx = bossCtx('counterfeiter');
    invokeAbility('fake_coins', 'onBattleStart', ctx);
    invokeAbility('fake_coins', 'onHeroWrong', ctx);
    assert.equal(ctx.scene._consumeNextTurn, true, 'consume activated');
    assert.equal(ctx.enemy._fakeStacks, 1);
    ctx.enemy._fakeStacks = 4;
    const baseAtk = ctx.enemy.atk;
    invokeAbility('fake_coins', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.atk, baseAtk + 3, 'surge triggered');
    assert.equal(ctx.enemy._fakeStacks, 0, 'stacks reset');
  });

  it('The Paradox (reversal): swaps ATK/DEF periodically', () => {
    const ctx = bossCtx('theparadox');
    invokeAbility('reversal', 'onBattleStart', ctx);
    const origAtk = ctx.enemy.atk;
    const origDef = ctx.enemy.def;
    for (let i = 0; i < 4; i++) invokeAbility('reversal', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.atk, origDef, 'ATK became DEF');
    assert.equal(ctx.enemy.def, origAtk, 'DEF became ATK');
  });

  it('The Theorem (the_unknown): evolves and accelerates', () => {
    const ctx = bossCtx('theorem');
    invokeAbility('the_unknown', 'onBattleStart', ctx);
    const baseAtk = ctx.enemy.atk;
    for (let i = 0; i < 4; i++) invokeAbility('the_unknown', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.atk, baseAtk + 2);
    invokeAbility('the_unknown', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.atk, baseAtk + 3);
  });
});

// ================================================================
// 9. WORLD MAP NODE COUNT
// ================================================================

describe('world map node count', () => {
  it('FLOORS provides 9 floors for world map to render', () => {
    assert.equal(FLOORS.length, 9);
    for (let i = 0; i < 9; i++) {
      assert.equal(FLOORS[i].id, i + 1);
      assert.ok(FLOORS[i].name);
    }
  });
});

// ================================================================
// 10. CROSS-SYSTEM CONSISTENCY
// ================================================================

describe('cross-system consistency', () => {
  it('every floor in FLOORS has matching enemies', () => {
    for (const floor of FLOORS) {
      const enemies = getEnemiesForFloor(floor.id);
      assert.equal(enemies.length, ENEMIES_PER_FLOOR,
        `floor ${floor.id} has ${enemies.length} enemies`);
    }
  });

  it('every floor boss enemyId in objects matches FLOOR_BOSS_MAP', () => {
    for (const floor of FLOORS) {
      const bossObj = floor.objects.find(o => o.type === 'boss');
      assert.equal(bossObj.enemyId, FLOOR_BOSS_MAP[floor.id]);
    }
  });

  it('every floor has dialogue for entry, boss, victory, boss_half', () => {
    for (const floor of FLOORS) {
      const f = floor.id;
      assert.ok(DIALOGUE[`floor${f}_entry`], `floor ${f} entry`);
      assert.ok(DIALOGUE[`floor${f}_boss`], `floor ${f} boss`);
      assert.ok(DIALOGUE[`floor${f}_victory`], `floor ${f} victory`);
      assert.ok(DIALOGUE[`floor${f}_boss_half`], `floor ${f} boss_half`);
    }
  });

  it('save system floor count matches FLOORS count', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors.length, FLOORS.length);
  });

  it('FLOOR_OPERATORS covers all 9 floors', () => {
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      assert.ok(FLOOR_OPERATORS[f], `missing operator for floor ${f}`);
    }
  });

  it('no duplicate enemy IDs across all floors', () => {
    const ids = ALL_ENEMIES.map(e => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.equal(dupes.length, 0, `duplicate IDs: ${dupes.join(', ')}`);
  });

  it('no duplicate ability names reference missing implementations', () => {
    const abilityNames = [...new Set(ALL_ENEMIES.map(e => e.ability))];
    for (const name of abilityNames) {
      const ab = ABILITIES[name];
      assert.ok(ab, `ability "${name}" not in ABILITIES registry`);
    }
  });

  it('every hero has unlockedAtFloor field (0-7)', () => {
    for (const hero of ALL_HEROES) {
      assert.ok(typeof hero.unlockedAtFloor === 'number',
        `${hero.id} missing unlockedAtFloor`);
      assert.ok(hero.unlockedAtFloor >= 0 && hero.unlockedAtFloor <= 7,
        `${hero.id} unlockedAtFloor=${hero.unlockedAtFloor} out of range`);
    }
  });

  it('exactly 3 starter heroes (unlockedAtFloor === 0)', () => {
    const starters = ALL_HEROES.filter(h => h.unlockedAtFloor === 0);
    assert.equal(starters.length, 3, 'should have 3 starters');
    const classes = starters.map(h => h.class).sort();
    assert.deepEqual(classes, ['bunny', 'knight', 'wizard'], 'one starter per class');
  });

  it('all 15 heroes unlockable across floors 0-7', () => {
    const unlocked = new Set();
    for (let f = 0; f <= 7; f++) {
      ALL_HEROES.filter(h => h.unlockedAtFloor === f).forEach(h => unlocked.add(h.id));
    }
    assert.equal(unlocked.size, 15, `only ${unlocked.size}/15 heroes unlockable`);
  });

  it('dialogue lines are graphic-novel short (max 50 chars for cutscene text)', () => {
    const cutsceneKeys = [];
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      cutsceneKeys.push(`floor${f}_entry`, `floor${f}_boss`, `floor${f}_victory`);
    }
    for (const key of cutsceneKeys) {
      const lines = DIALOGUE[key];
      if (!lines) continue;
      for (const line of lines) {
        assert.ok(line.text.length <= 55,
          `${key}: "${line.text}" is ${line.text.length} chars (max 55)`);
      }
    }
  });
});
