/**
 * Unit tests for src/systems/bonds.js
 *
 * Rank thresholds: C at 5 battles, B at 15, A at 30, S at 50.
 * Saves are hand-built; no randomness anywhere in the bond system.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bondKey,
  recordBattle,
  getBondRank,
  getBondBattles,
  getBondStatBonuses,
  getAvailableCombos,
  getBondDialogues,
  getHeroBondSummary,
} from './systems/bonds.js';
import { HERO_BONDS } from './data/heroes.js';

const A = 'knight-shadow';
const B = 'wizard-stargazer'; // A|B is the 'Eclipse' bond pair in HERO_BONDS
const C = 'bunny-pepper';

/** Build a save with explicit bond entries: { [key]: { battles, rank } } */
function saveWithBonds(bonds = {}) {
  return { heroBonds: bonds };
}

// ------------------------------------------------------------------
// bondKey
// ------------------------------------------------------------------

describe('bondKey', () => {
  test('is order-independent', () => {
    assert.equal(bondKey(A, B), bondKey(B, A));
  });

  test('joins sorted ids with a pipe', () => {
    assert.equal(bondKey('b-hero', 'a-hero'), 'a-hero|b-hero');
  });
});

// ------------------------------------------------------------------
// recordBattle
// ------------------------------------------------------------------

describe('recordBattle', () => {
  test('increments battle counts for every pair in a 3-hero party', () => {
    const save = {};
    recordBattle(save, [A, B, C]);

    assert.equal(getBondBattles(save, A, B), 1);
    assert.equal(getBondBattles(save, A, C), 1);
    assert.equal(getBondBattles(save, B, C), 1);
    assert.equal(Object.keys(save.heroBonds).length, 3);
  });

  test('parties smaller than 2 record nothing', () => {
    const save = {};
    assert.deepEqual(recordBattle(save, [A]), []);
    assert.deepEqual(recordBattle(save, []), []);
    assert.deepEqual(recordBattle(save, null), []);
    assert.deepEqual(save.heroBonds ?? {}, {});
  });

  test('rank thresholds hit C/B/A/S at exactly 5/15/30/50 battles', () => {
    const save = {};
    const expected = { 5: 'C', 15: 'B', 30: 'A', 50: 'S' };
    for (let battle = 1; battle <= 50; battle++) {
      const newRanks = recordBattle(save, [A, B]);
      if (expected[battle]) {
        assert.equal(newRanks.length, 1, `battle ${battle} should announce a rank`);
        assert.equal(newRanks[0].rank, expected[battle]);
        assert.equal(newRanks[0].battles, battle);
        assert.equal(getBondRank(save, A, B), expected[battle]);
      } else {
        assert.deepEqual(newRanks, [], `battle ${battle} should not announce a rank`);
      }
    }
    assert.equal(getBondBattles(save, A, B), 50);
    assert.equal(getBondRank(save, A, B), 'S');
  });

  test('a newly reached rank is returned exactly once', () => {
    const save = {};
    let announcements = 0;
    for (let i = 0; i < 12; i++) {
      announcements += recordBattle(save, [A, B]).length;
    }
    assert.equal(announcements, 1); // only the C announcement at battle 5
  });

  test('rank-up entries identify the hero pair', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 4, rank: null } });
    const newRanks = recordBattle(save, [A, B]);
    assert.equal(newRanks.length, 1);
    assert.equal(bondKey(newRanks[0].heroId1, newRanks[0].heroId2), bondKey(A, B));
    assert.equal(newRanks[0].rank, 'C');
  });
});

// ------------------------------------------------------------------
// getBondStatBonuses
// ------------------------------------------------------------------

describe('getBondStatBonuses', () => {
  test('C rank: +1 ATK only', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 5, rank: 'C' } });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B]), { atk: 1, def: 0, hp: 0 });
  });

  test('B rank: +1 ATK, +1 DEF', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 15, rank: 'B' } });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B]), { atk: 1, def: 1, hp: 0 });
  });

  test('A rank: +2 ATK, +1 DEF', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 30, rank: 'A' } });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B]), { atk: 2, def: 1, hp: 0 });
  });

  test('S rank: +2 ATK, +2 DEF, +5 HP', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 50, rank: 'S' } });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B]), { atk: 2, def: 2, hp: 5 });
  });

  test('bonuses accumulate across multiple bonded allies', () => {
    const save = saveWithBonds({
      [bondKey(A, B)]: { battles: 50, rank: 'S' },
      [bondKey(A, C)]: { battles: 15, rank: 'B' },
    });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B, C]), { atk: 3, def: 3, hp: 5 });
  });

  test('heroes not in the party contribute nothing', () => {
    const save = saveWithBonds({
      [bondKey(A, B)]: { battles: 50, rank: 'S' }, // B is bonded but absent
    });
    assert.deepEqual(getBondStatBonuses(save, A, [A, C]), { atk: 0, def: 0, hp: 0 });
  });

  test('no bond or null rank yields zero bonuses', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 3, rank: null } });
    assert.deepEqual(getBondStatBonuses(save, A, [A, B]), { atk: 0, def: 0, hp: 0 });
    assert.deepEqual(getBondStatBonuses({}, A, [A, B]), { atk: 0, def: 0, hp: 0 });
  });

  test('non-array party yields zero bonuses', () => {
    assert.deepEqual(getBondStatBonuses({}, A, null), { atk: 0, def: 0, hp: 0 });
  });
});

// ------------------------------------------------------------------
// getAvailableCombos
// ------------------------------------------------------------------

describe('getAvailableCombos', () => {
  test('requires rank B or higher', () => {
    const cRank = saveWithBonds({ [bondKey(A, B)]: { battles: 5, rank: 'C' } });
    assert.deepEqual(getAvailableCombos(cRank, [A, B]), []);

    const bRank = saveWithBonds({ [bondKey(A, B)]: { battles: 15, rank: 'B' } });
    const combos = getAvailableCombos(bRank, [A, B]);
    assert.equal(combos.length, 1);
    assert.equal(combos[0].name, 'Eclipse');
    assert.equal(combos[0].rank, 'B');
    assert.equal(combos[0].multiplier, 4);
  });

  test('A and S ranks also unlock the combo', () => {
    for (const rank of ['A', 'S']) {
      const save = saveWithBonds({ [bondKey(A, B)]: { battles: 50, rank } });
      assert.equal(getAvailableCombos(save, [A, B]).length, 1, `rank ${rank}`);
    }
  });

  test('both heroes must be present in the party', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 50, rank: 'S' } });
    assert.deepEqual(getAvailableCombos(save, [A, C]), []);
    assert.deepEqual(getAvailableCombos(save, [B]), []);
  });

  test('returns every qualifying combo for a full party', () => {
    // A|B = Eclipse, A|C = Ghost Pepper — both are defined bond pairs
    const save = saveWithBonds({
      [bondKey(A, B)]: { battles: 15, rank: 'B' },
      [bondKey(A, C)]: { battles: 30, rank: 'A' },
      [bondKey(B, C)]: { battles: 50, rank: 'S' }, // no combo data for this pair
    });
    const combos = getAvailableCombos(save, [A, B, C]);
    const names = combos.map((c) => c.name).sort();
    assert.deepEqual(names, ['Eclipse', 'Ghost Pepper']);
  });

  test('no bond data means no combos', () => {
    assert.deepEqual(getAvailableCombos({}, [A, B]), []);
  });
});

// ------------------------------------------------------------------
// getBondDialogues
// ------------------------------------------------------------------

describe('getBondDialogues', () => {
  const bondDef = HERO_BONDS.find((b) => bondKey(...b.heroes) === bondKey(A, B));

  test('the Eclipse pair has dialogue authored for all four ranks', () => {
    assert.ok(bondDef.dialogueC && bondDef.dialogueB && bondDef.dialogueA && bondDef.dialogueS);
  });

  test('returns C dialogue at rank C', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 5, rank: 'C' } });
    const d = getBondDialogues(save, A, B);
    assert.equal(d.length, 1);
    assert.equal(d[0].rank, 'C');
    assert.deepEqual(d[0].text, bondDef.dialogueC);
  });

  test('dialogue is cumulative: rank B returns C then B', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 15, rank: 'B' } });
    const d = getBondDialogues(save, A, B);
    assert.deepEqual(d.map((x) => x.rank), ['C', 'B']);
    assert.deepEqual(d[1].text, bondDef.dialogueB);
  });

  test('rank S returns all authored ranks in C,B,A,S order', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 50, rank: 'S' } });
    const d = getBondDialogues(save, A, B);
    assert.deepEqual(d.map((x) => x.rank), ['C', 'B', 'A', 'S']);
    assert.deepEqual(d.at(-1).text, bondDef.dialogueS);
  });

  test('argument order does not matter', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 30, rank: 'A' } });
    assert.deepEqual(getBondDialogues(save, A, B), getBondDialogues(save, B, A));
  });

  test('no rank yet means no dialogue', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 3, rank: null } });
    assert.deepEqual(getBondDialogues(save, A, B), []);
  });

  test('ranked pair without authored bond data returns empty', () => {
    // knight-shadow|knight-crusader has no HERO_BONDS entry
    const save = saveWithBonds({ [bondKey(A, 'knight-crusader')]: { battles: 50, rank: 'S' } });
    assert.deepEqual(getBondDialogues(save, A, 'knight-crusader'), []);
  });
});

// ------------------------------------------------------------------
// getHeroBondSummary (bonus coverage)
// ------------------------------------------------------------------

describe('getHeroBondSummary', () => {
  test('reports partner, rank, and battles needed to next rank', () => {
    const save = saveWithBonds({
      [bondKey(A, B)]: { battles: 7, rank: 'C' },
      [bondKey(B, C)]: { battles: 2, rank: null }, // does not involve A
    });
    const summary = getHeroBondSummary(save, A);
    assert.equal(summary.length, 1);
    assert.equal(summary[0].partnerId, B);
    assert.equal(summary[0].rank, 'C');
    assert.equal(summary[0].nextRank, 'B');
    assert.equal(summary[0].battlesNeeded, 8); // 15 - 7
  });

  test('S rank has no next rank', () => {
    const save = saveWithBonds({ [bondKey(A, B)]: { battles: 50, rank: 'S' } });
    const summary = getHeroBondSummary(save, A);
    assert.equal(summary[0].nextRank, null);
  });
});
