/**
 * floorRules — the rules BOTH front-ends obey.
 *
 * These assertions are written against the behaviour the 2D MazeScene shipped,
 * because that is the contract: the 3D floor must play the same game. Where a
 * test cites a MazeScene line it is quoting the behaviour that was extracted,
 * not describing a new decision.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialProgress, isChallengeType, challengeGoal, nextLockDoor,
  doorQuestionSpec, beyondBossBlocked, bossGate, goldenGate, exitGate,
  advanceChallenge, grantGold, grantChest, grantPotion, useFountain,
  syncPartyToSave, objectiveText, GOLD_PICKUP,
} from './floorRules.js';
import { getFloor } from '../data/floors.js';
import { getLevel } from '../data/levels.js';
import { FLOOR_OPERATORS } from '../data/enemies.js';

describe('initialProgress', () => {
  test('a fresh floor has nothing done', () => {
    assert.deepEqual(initialProgress(), {
      challengeProgress: 0, phase2Progress: 0, phase2Active: false,
      bossDefeated: false, hasKey: false, mazeTransformed: false,
      secretDone: false, secretSeq: 0,
    });
  });
});

describe('challenge types', () => {
  test('every floor 1-9 challenge item type is recognised', () => {
    for (let id = 1; id <= 9; id++) {
      const level = getLevel(id);
      const ch = challengeGoal(getFloor(id));
      const items = level.objects.filter((o) => isChallengeType(o.type));
      assert.ok(items.length >= ch.count,
        `floor ${id}: ${items.length} recognised challenge items for a goal of ${ch.count}`);
    }
  });

  test('non-challenge furniture is not mistaken for a challenge item', () => {
    for (const t of ['chest', 'boss', 'exit', 'golden', 'mathdoor', 'fountain', 'hero']) {
      assert.equal(isChallengeType(t), false, t);
    }
  });

  test('challengeGoal never returns undefined', () => {
    const g = challengeGoal({});
    assert.equal(typeof g.count, 'number');
    assert.ok(g.count > 0);
  });
});

describe('nextLockDoor', () => {
  const objects = [
    { id: 'door-a', type: 'mathdoor', open: false },
    { id: 'door-b', type: 'mathdoor', open: false },
    { id: 'chest-1', type: 'chest' },
  ];

  test('an unlocked object gates on nothing', () => {
    assert.equal(nextLockDoor(objects, { id: 'chest-1' }), null);
  });

  test('a single lock returns that door', () => {
    assert.equal(nextLockDoor(objects, { lock: 'door-a' }).id, 'door-a');
  });

  test('an ordered lock list returns the first door still shut', () => {
    const objs = objects.map((o) => (o.id === 'door-a' ? { ...o, open: true } : o));
    assert.equal(nextLockDoor(objs, { lock: ['door-a', 'door-b'] }).id, 'door-b');
  });

  test('all doors open means the interaction may proceed', () => {
    const objs = objects.map((o) => (o.type === 'mathdoor' ? { ...o, open: true } : o));
    assert.equal(nextLockDoor(objs, { lock: ['door-a', 'door-b'] }), null);
  });

  test('a lock naming a door that does not exist cannot deadlock the floor', () => {
    assert.equal(nextLockDoor(objects, { lock: 'nope' }), null);
  });
});

describe('doorQuestionSpec', () => {
  test("a door's own operator wins over the floor's", () => {
    assert.equal(doorQuestionSpec({ operator: '*' }, 1).operator, '*');
  });

  test("a plain door takes the floor's operator", () => {
    for (let id = 1; id <= 9; id++) {
      assert.equal(doorQuestionSpec({}, id).operator, FLOOR_OPERATORS[id] || '+');
    }
  });

  test('always asks for a 2-3 star question, streakless', () => {
    const s = doorQuestionSpec({}, 3);
    assert.deepEqual(s.targetStars, [2, 3]);
    assert.equal(s.streak, 0);
    assert.equal(s.floor, 3);
  });
});

describe('beyondBossBlocked', () => {
  const objects = [
    { type: 'boss', x: 5, y: 5, consumed: false },
    { type: 'golden', x: 8, y: 5, consumed: false },
    { type: 'exit', x: 9, y: 5 },
  ];

  test('the golden chest and the exit are sealed while the boss lives', () => {
    assert.equal(beyondBossBlocked(objects, false, 8, 5), true);
    assert.equal(beyondBossBlocked(objects, false, 9, 5), true);
  });

  test('ordinary tiles are never blocked', () => {
    assert.equal(beyondBossBlocked(objects, false, 2, 2), false);
  });

  test('a beaten boss seals nothing', () => {
    assert.equal(beyondBossBlocked(objects, true, 8, 5), false);
  });

  test('a consumed boss seals nothing', () => {
    const objs = objects.map((o) => (o.type === 'boss' ? { ...o, consumed: true } : o));
    assert.equal(beyondBossBlocked(objs, false, 8, 5), false);
  });
});

describe('bossGate', () => {
  const floor = { challenge: { count: 3, label: 'RUNE', phase2: { count: 2, label: 'SEAL' } } };

  test('refuses until the challenge is complete', () => {
    const g = bossGate({ challengeProgress: 2 }, floor);
    assert.equal(g.ok, false);
    assert.match(g.message, /CHALLENGE/);
  });

  test('refuses until phase 2 is complete', () => {
    const g = bossGate({ challengeProgress: 3, phase2Progress: 1 }, floor);
    assert.equal(g.ok, false);
    assert.match(g.message, /SEAL/);
  });

  test('accepts once everything is done', () => {
    assert.equal(bossGate({ challengeProgress: 3, phase2Progress: 2 }, floor).ok, true);
  });

  test('a floor with no phase 2 only needs the challenge', () => {
    assert.equal(bossGate({ challengeProgress: 3 }, { challenge: { count: 3 } }).ok, true);
  });
});

describe('golden and exit gates', () => {
  test('the golden chest waits for the boss', () => {
    assert.equal(goldenGate({ bossDefeated: false }).ok, false);
    assert.equal(goldenGate({ bossDefeated: true }).ok, true);
  });

  test('the exit waits for the key', () => {
    assert.equal(exitGate({ hasKey: false }).ok, false);
    assert.equal(exitGate({ hasKey: true }).ok, true);
  });
});

describe('advanceChallenge', () => {
  const floor = {
    challenge: {
      count: 3, label: 'RUNE', verb: 'lit', allDoneMsg: 'The runes blaze!',
      phase2: { count: 2, type: 'crystal', label: 'SHARD', verb: 'set', allDoneMsg: 'Sealed!' },
    },
  };

  test('counts up and reports what is left', () => {
    const p = initialProgress();
    const a = advanceChallenge(p, floor, { type: 'rune' });
    assert.equal(p.challengeProgress, 1);
    assert.equal(a.remaining, 2);
    assert.equal(a.done, false);
    assert.equal(a.message, 'RUNE lit! 2 left');
  });

  test('the last item reports done with the floor message', () => {
    const p = { ...initialProgress(), challengeProgress: 2 };
    const a = advanceChallenge(p, floor, { type: 'rune' });
    assert.equal(a.done, true);
    assert.equal(a.message, 'The runes blaze!');
  });

  test('phase 2 only counts once phase 2 is active AND the type matches', () => {
    const p = { ...initialProgress(), challengeProgress: 3, phase2Active: true };
    const a = advanceChallenge(p, floor, { type: 'crystal' });
    assert.equal(a.phase2, true);
    assert.equal(p.phase2Progress, 1);
    assert.equal(p.challengeProgress, 3, 'phase 1 count is untouched');

    const q = { ...initialProgress(), challengeProgress: 3, phase2Active: false };
    assert.equal(advanceChallenge(q, floor, { type: 'crystal' }).phase2, false);
  });

  test('a staged drain is reported so the caller can open its tiles', () => {
    const p = initialProgress();
    const a = advanceChallenge(p, floor, { type: 'valve', drain: [[1, 2]], drainMessage: 'The tide falls' });
    assert.deepEqual(a.drain, [[1, 2]]);
    assert.equal(a.drainMessage, 'The tide falls');
  });
});

describe('grants', () => {
  test('a plain gold pickup is worth GOLD_PICKUP', () => {
    const save = { gold: 5 };
    assert.equal(grantGold(save), GOLD_PICKUP);
    assert.equal(save.gold, 5 + GOLD_PICKUP);
  });

  test('a chest pays its own loot, defaulting to 10', () => {
    const save = { gold: 0 };
    assert.equal(grantChest(save, { loot: { gold: 42 } }), 42);
    assert.equal(grantChest(save, {}), 10);
    assert.equal(save.gold, 52);
  });

  test('a potion pickup adds one', () => {
    const save = { potions: 2 };
    grantPotion(save);
    assert.equal(save.potions, 3);
  });

  test('grants survive a save missing the field entirely', () => {
    const save = {};
    grantGold(save);
    grantPotion(save);
    assert.equal(save.gold, GOLD_PICKUP);
    assert.equal(save.potions, 1);
  });
});

describe('useFountain', () => {
  test('heals the whole party to full and burns a use', () => {
    const party = [{ hp: 3, maxHp: 10 }, { hp: 8, maxHp: 12 }];
    const obj = { uses: 2 };
    const r = useFountain(party, obj);
    assert.equal(r.ok, true);
    assert.equal(r.healed, 11);
    assert.equal(obj.uses, 1);
    assert.deepEqual(party.map((h) => h.hp), [10, 12]);
  });

  test('a full party still burns a use but says so', () => {
    const r = useFountain([{ hp: 10, maxHp: 10 }], { uses: 1 });
    assert.equal(r.ok, true);
    assert.equal(r.healed, 0);
    assert.match(r.message, /full HP/i);
  });

  test('a depleted fountain refuses without charging a use', () => {
    const obj = { uses: 0 };
    const r = useFountain([{ hp: 1, maxHp: 10 }], obj);
    assert.equal(r.ok, false);
    assert.equal(obj.uses, 0);
  });
});

describe('syncPartyToSave', () => {
  test('writes the canonical hero shape, level and xp included', () => {
    const save = {};
    syncPartyToSave(save, [{ id: 'a', name: 'A', hp: 4, maxHp: 9, xp: 30, level: 3, atk: 99 }]);
    assert.deepEqual(save.party, [{ id: 'a', name: 'A', hp: 4, maxHp: 9, xp: 30, level: 3 }]);
  });

  test('missing level/xp default to 1 and 0', () => {
    const save = {};
    syncPartyToSave(save, [{ id: 'b', name: 'B', hp: 1, maxHp: 1 }]);
    assert.equal(save.party[0].level, 1);
    assert.equal(save.party[0].xp, 0);
  });
});

describe('objectiveText', () => {
  const floor = { challenge: { count: 3, label: 'RUNE', phase2: { count: 2, label: 'SHARD' } } };
  const level = {
    objective: [
      { key: 'challenge', label: 'Light the runes' },
      { key: 'transform', label: 'Cross the new bridge' },
      { key: 'boss', label: 'Face the Rune Tyrant' },
    ],
  };

  test('leads with the challenge and its running count', () => {
    const t = objectiveText({ ...initialProgress(), challengeProgress: 1 }, floor, level);
    assert.equal(t, 'Light the runes  (1/3)');
  });

  test('then phase 2 while it is running', () => {
    const t = objectiveText(
      { ...initialProgress(), challengeProgress: 3, phase2Active: true, phase2Progress: 1 },
      floor, level);
    assert.equal(t, 'SHARD: 1/2');
  });

  test('then the crossing, then the boss', () => {
    const base = { ...initialProgress(), challengeProgress: 3 };
    assert.equal(objectiveText(base, floor, level), 'Cross the new bridge');
    assert.equal(objectiveText({ ...base, mazeTransformed: true }, floor, level), 'Face the Rune Tyrant');
  });

  test('then the treasure, then the exit', () => {
    const base = { ...initialProgress(), challengeProgress: 3, mazeTransformed: true, bossDefeated: true };
    assert.match(objectiveText(base, floor, level), /golden treasure/i);
    assert.match(objectiveText({ ...base, hasKey: true }, floor, level), /exit/i);
  });

  test('a level with no objective steps still says something useful', () => {
    const t = objectiveText(initialProgress(), floor, null);
    assert.match(t, /\(0\/3\)$/);
  });

  test('every shipped floor produces a non-empty objective at every stage', () => {
    for (let id = 1; id <= 9; id++) {
      const f = getFloor(id);
      const lv = getLevel(id);
      const ch = challengeGoal(f);
      const stages = [
        initialProgress(),
        { ...initialProgress(), challengeProgress: ch.count },
        { ...initialProgress(), challengeProgress: ch.count, mazeTransformed: true },
        { ...initialProgress(), challengeProgress: ch.count, mazeTransformed: true, bossDefeated: true },
        { ...initialProgress(), challengeProgress: ch.count, mazeTransformed: true, bossDefeated: true, hasKey: true },
      ];
      for (const s of stages) {
        const t = objectiveText(s, f, lv);
        assert.ok(typeof t === 'string' && t.trim().length > 0, `floor ${id}`);
      }
    }
  });
});
