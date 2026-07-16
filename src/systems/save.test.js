/**
 * Unit tests for src/systems/save.js
 *
 * Uses a fake storage adapter so tests don't depend on real localStorage.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDefaultSave,
  loadSave,
  writeSave,
  clearSave,
  updateSave,
  markFloorComplete,
  unlockHeroesForFloor,
  unlockHero,
  isHeroUnlocked,
  listSlots,
  __setStorage,
  CURRENT_VERSION,
  STORAGE_KEY,
  LEGACY_KEY,
  SLOT_PREFIX,
} from './save.js';

// Simple in-memory storage mock
function makeMockStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
    _dump: () => Object.fromEntries(mem),
  };
}

let storage;
beforeEach(() => {
  storage = makeMockStorage();
  __setStorage(storage);
});

// ------------------------------------------------------------------
// DEFAULT SHAPE
// ------------------------------------------------------------------

describe('makeDefaultSave', () => {
  test('returns a fresh object each call', () => {
    const a = makeDefaultSave();
    const b = makeDefaultSave();
    assert.notEqual(a, b);
    a.gold = 999;
    assert.equal(b.gold, 0);
  });

  test('version matches CURRENT_VERSION', () => {
    assert.equal(makeDefaultSave().version, CURRENT_VERSION);
  });

  test('has exactly 9 floors', () => {
    assert.equal(makeDefaultSave().floors.length, 9);
  });

  test('only floor 1 is unlocked initially', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors[0].unlocked, true);
    for (let i = 1; i < 9; i++) {
      assert.equal(save.floors[i].unlocked, false, `floor ${i + 1} should be locked`);
    }
  });

  test('starts with 2 potions', () => {
    assert.equal(makeDefaultSave().potions, 2);
  });

  test('includes settings and stats', () => {
    const save = makeDefaultSave();
    assert.ok(save.settings);
    assert.ok(save.stats);
    assert.equal(typeof save.settings.musicVolume, 'number');
    assert.equal(typeof save.stats.totalBattles, 'number');
  });
});

// ------------------------------------------------------------------
// LOAD / WRITE / CLEAR
// ------------------------------------------------------------------

describe('loadSave', () => {
  test('returns defaults when no save exists', () => {
    const save = loadSave();
    assert.equal(save.version, CURRENT_VERSION);
    assert.equal(save.gold, 0);
  });

  test('returns defaults for corrupted JSON', () => {
    storage.setItem(STORAGE_KEY, 'not json at all');
    const save = loadSave();
    assert.equal(save.version, CURRENT_VERSION);
  });

  test('returns defaults for non-object JSON', () => {
    storage.setItem(STORAGE_KEY, '"just a string"');
    const save = loadSave();
    assert.equal(save.version, CURRENT_VERSION);
  });

  test('returns defaults for null', () => {
    storage.setItem(STORAGE_KEY, 'null');
    const save = loadSave();
    assert.equal(save.version, CURRENT_VERSION);
  });

  test('loads a previously written save', () => {
    const save = makeDefaultSave();
    save.gold = 150;
    save.party = [{ id: 'knight-shadow' }];
    writeSave(save);
    const loaded = loadSave();
    assert.equal(loaded.gold, 150);
    assert.equal(loaded.party[0].id, 'knight-shadow');
  });
});

describe('writeSave', () => {
  test('returns true on success', () => {
    assert.equal(writeSave(makeDefaultSave()), true);
  });

  test('persists to storage', () => {
    const save = makeDefaultSave();
    save.gold = 42;
    writeSave(save);
    const raw = storage.getItem(STORAGE_KEY);
    assert.ok(raw);
    assert.equal(JSON.parse(raw).gold, 42);
  });

  test('updates lastPlayedAt on every write', async () => {
    const save = makeDefaultSave();
    save.stats.lastPlayedAt = 0;
    writeSave(save);
    const loaded = loadSave();
    assert.ok(loaded.stats.lastPlayedAt > 0);
  });

  test('normalizes missing fields before writing', () => {
    const partial = { version: CURRENT_VERSION, gold: 50 };
    writeSave(partial);
    const loaded = loadSave();
    assert.equal(loaded.gold, 50);
    assert.equal(loaded.potions, 2); // filled from defaults
    assert.equal(loaded.floors.length, 9);
  });
});

describe('clearSave', () => {
  test('removes the save from storage', () => {
    writeSave(makeDefaultSave());
    assert.ok(storage.getItem(STORAGE_KEY));
    clearSave();
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });

  test('loadSave after clear returns defaults', () => {
    const save = makeDefaultSave();
    save.gold = 99;
    writeSave(save);
    clearSave();
    const fresh = loadSave();
    assert.equal(fresh.gold, 0);
  });
});

// ------------------------------------------------------------------
// NORMALIZATION
// ------------------------------------------------------------------

describe('normalization', () => {
  test('fills in missing top-level fields', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: CURRENT_VERSION, gold: 25 }));
    const save = loadSave();
    assert.equal(save.gold, 25);
    assert.equal(save.potions, 2);
    assert.ok(save.settings);
    assert.ok(save.stats);
  });

  test('fills in missing floors', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      floors: [{ id: 1, unlocked: true, complete: true, bestStreak: 50 }],
    }));
    const save = loadSave();
    assert.equal(save.floors.length, 9);
    assert.equal(save.floors[0].complete, true);
    assert.equal(save.floors[0].bestStreak, 50);
    assert.equal(save.floors[8].complete, false);
  });

  test('fills in missing settings keys', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      settings: { musicVolume: 0.3 },
    }));
    const save = loadSave();
    assert.equal(save.settings.musicVolume, 0.3);
    assert.equal(save.settings.sfxVolume, 1.0);
  });

  test('drops party entries with null/unknown ids and coerces numeric fields', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      party: [
        { id: null, hp: 50 },                              // null id — dropped
        'not-an-object',                                   // non-object — dropped
        { id: 'no-such-hero', hp: 50 },                    // unresolvable id — dropped
        { id: 'knight-shadow', hp: '30', maxHp: '52', xp: 'garbage', level: null },
      ],
    }));
    const save = loadSave();
    assert.equal(save.party.length, 1);
    assert.equal(save.party[0].id, 'knight-shadow');
    assert.equal(save.party[0].hp, 30);       // coerced from string
    assert.equal(save.party[0].maxHp, 52);    // coerced from string
    assert.equal(save.party[0].xp, 0);        // garbage -> default
    assert.equal(save.party[0].level, 1);     // null -> default
  });

  test('party hp is clamped to maxHp and defaults from hero data', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      party: [{ id: 'bunny-pepper', hp: 9999 }],
    }));
    const save = loadSave();
    assert.equal(save.party.length, 1);
    assert.ok(typeof save.party[0].maxHp === 'number');
    assert.equal(save.party[0].hp, save.party[0].maxHp); // clamped
  });

  test('drops malformed heroEvolution entries, keeps valid ones', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      heroEvolution: {
        'knight-shadow': 'stage2',                         // string value — dropped
        'wizard-stargazer': { stage: 'two', path: null },  // non-number stage — dropped
        'bunny-pepper': { stage: 3, path: 42 },            // non-string path — dropped
        'knight-crusader': { stage: 2 },                   // missing path — normalized to null
        'wizard-toadstool': { stage: 3, path: 'toadstool-plaguemaster' },
      },
    }));
    const save = loadSave();
    assert.deepEqual(save.heroEvolution, {
      'knight-crusader': { stage: 2, path: null },
      'wizard-toadstool': { stage: 3, path: 'toadstool-plaguemaster' },
    });
  });

  test('drops malformed heroBonds entries, keeps valid ones', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      heroBonds: {
        'a|b': 12,                                  // number value — dropped
        'c|d': { battles: 'lots', rank: 'C' },      // non-number battles — dropped
        'e|f': { battles: 8, rank: 3 },             // non-string rank — dropped
        'g|h': { battles: 7, rank: 'C' },
        'i|j': { battles: 2 },                      // missing rank — normalized to null
      },
    }));
    const save = loadSave();
    assert.deepEqual(save.heroBonds, {
      'g|h': { battles: 7, rank: 'C' },
      'i|j': { battles: 2, rank: null },
    });
  });
});

// ------------------------------------------------------------------
// updateSave + markFloorComplete
// ------------------------------------------------------------------

describe('updateSave', () => {
  test('applies mutator and persists', () => {
    updateSave((s) => { s.gold = 100; });
    assert.equal(loadSave().gold, 100);
  });

  test('returns true on success', () => {
    assert.equal(updateSave(() => {}), true);
  });
});

describe('markFloorComplete', () => {
  test('marks the given floor complete', () => {
    const save = makeDefaultSave();
    markFloorComplete(save, 1);
    assert.equal(save.floors[0].complete, true);
  });

  test('unlocks the next floor', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors[1].unlocked, false);
    markFloorComplete(save, 1);
    assert.equal(save.floors[1].unlocked, true);
  });

  test('does not crash on floor 9 (no next floor)', () => {
    const save = makeDefaultSave();
    assert.doesNotThrow(() => markFloorComplete(save, 9));
    assert.equal(save.floors[8].complete, true);
  });

  test('does nothing for unknown floor id', () => {
    const save = makeDefaultSave();
    markFloorComplete(save, 99);
    assert.equal(save.floors[0].complete, false);
  });
});

// ------------------------------------------------------------------
// SAVE SLOTS
// ------------------------------------------------------------------

describe('save slots', () => {
  test('loadSave and writeSave use slot key', () => {
    const save = makeDefaultSave();
    save.gold = 77;
    writeSave(save, 1);
    const raw = storage.getItem(`${SLOT_PREFIX}1`);
    assert.ok(raw);
    assert.equal(JSON.parse(raw).gold, 77);
  });

  test('different slots are independent', () => {
    const s1 = makeDefaultSave();
    s1.gold = 10;
    writeSave(s1, 1);
    const s2 = makeDefaultSave();
    s2.gold = 20;
    writeSave(s2, 2);
    assert.equal(loadSave(1).gold, 10);
    assert.equal(loadSave(2).gold, 20);
  });

  test('clearSave only clears the specified slot', () => {
    writeSave(makeDefaultSave(), 1);
    writeSave(makeDefaultSave(), 2);
    clearSave(1);
    assert.equal(storage.getItem(`${SLOT_PREFIX}1`), null);
    assert.ok(storage.getItem(`${SLOT_PREFIX}2`));
  });

  test('legacy migration: old key migrates to slot 1', () => {
    const legacy = makeDefaultSave();
    legacy.gold = 999;
    storage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const loaded = loadSave(1);
    assert.equal(loaded.gold, 999);
    // Legacy key should be removed after migration
    assert.equal(storage.getItem(LEGACY_KEY), null);
    // Slot 1 key should now exist
    assert.ok(storage.getItem(`${SLOT_PREFIX}1`));
  });

  test('legacy migration does not trigger for slot 2', () => {
    const legacy = makeDefaultSave();
    legacy.gold = 999;
    storage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const loaded = loadSave(2);
    assert.equal(loaded.gold, 0); // default, not migrated
    // Legacy key still exists
    assert.ok(storage.getItem(LEGACY_KEY));
  });
});

describe('Safari private-browsing storage safety', () => {
  // A storage whose every method throws, like Safari Private Browsing.
  function makeThrowingStorage() {
    const err = () => { throw new Error('SecurityError'); };
    return { getItem: err, setItem: err, removeItem: err, clear: err };
  }

  test('listSlots never throws even when storage access throws', () => {
    __setStorage(makeThrowingStorage());
    // This is the exact call TitleScene makes on boot; it must not throw.
    assert.doesNotThrow(() => {
      const slots = listSlots();
      assert.equal(slots.length, 3);
      assert.ok(slots.every(s => s.exists === false));
    });
  });

  test('loadSave / writeSave degrade gracefully when storage throws', () => {
    __setStorage(makeThrowingStorage());
    assert.doesNotThrow(() => {
      const save = loadSave(1);       // returns a fresh default
      assert.ok(save && save.floors);
      writeSave(save, 1);             // returns false, does not throw
    });
  });
});

describe('hero unlock system', () => {
  let storage;
  beforeEach(() => {
    storage = makeMockStorage();
    __setStorage(storage);
  });

  test('default save has exactly 3 starter heroes', () => {
    const save = makeDefaultSave();
    assert.equal(save.unlockedHeroes.length, 3);
    assert.ok(save.unlockedHeroes.includes('knight-shadow'));
    assert.ok(save.unlockedHeroes.includes('wizard-stargazer'));
    assert.ok(save.unlockedHeroes.includes('bunny-pepper'));
  });

  test('isHeroUnlocked returns true for starters, false for locked', () => {
    const save = makeDefaultSave();
    assert.ok(isHeroUnlocked(save, 'knight-shadow'));
    assert.ok(isHeroUnlocked(save, 'wizard-stargazer'));
    assert.ok(isHeroUnlocked(save, 'bunny-pepper'));
    assert.ok(!isHeroUnlocked(save, 'knight-crusader'));
    assert.ok(!isHeroUnlocked(save, 'wizard-toadstool'));
  });

  test('unlockHeroesForFloor unlocks each floor\'s rescues (Crusader on 2, Toadstool on 3)', () => {
    const save = makeDefaultSave();
    const f2 = unlockHeroesForFloor(save, 2);
    assert.ok(f2.some(h => h.id === 'knight-crusader'));
    assert.ok(isHeroUnlocked(save, 'knight-crusader'));
    const f3 = unlockHeroesForFloor(save, 3);
    assert.ok(f3.some(h => h.id === 'wizard-toadstool'));
    assert.ok(isHeroUnlocked(save, 'wizard-toadstool'));
  });

  test('unlockHeroesForFloor does not duplicate', () => {
    const save = makeDefaultSave();
    unlockHeroesForFloor(save, 2);
    const before = save.unlockedHeroes.length;
    unlockHeroesForFloor(save, 2);
    assert.equal(save.unlockedHeroes.length, before);
  });

  test('full unlock progression yields 15 heroes', () => {
    const save = makeDefaultSave();
    for (let f = 1; f <= 9; f++) {
      unlockHeroesForFloor(save, f);
    }
    assert.equal(save.unlockedHeroes.length, 15);
  });

  test('unlockHero unlocks a single hero, idempotent, rejects unknown ids', () => {
    const save = makeDefaultSave();
    assert.equal(unlockHero(save, 'knight-crusader'), true);
    assert.ok(isHeroUnlocked(save, 'knight-crusader'));
    assert.equal(unlockHero(save, 'knight-crusader'), false, 'second unlock is a no-op');
    assert.equal(save.unlockedHeroes.filter(id => id === 'knight-crusader').length, 1);
    assert.equal(unlockHero(save, 'not-a-hero'), false);
    assert.ok(!save.unlockedHeroes.includes('not-a-hero'));
  });

  test('unlockHero does not queue rescue dialogue; safety net skips rescued heroes', () => {
    const save = makeDefaultSave();
    unlockHero(save, 'knight-crusader');           // rescued in-maze (floor 2)
    assert.equal((save.pendingRescueDialogue || []).length, 0,
      'in-maze rescue must not queue the post-boss cutscene');
    const unlocked = unlockHeroesForFloor(save, 2); // boss-victory safety net
    assert.ok(!unlocked.some(h => h.id === 'knight-crusader'),
      'the already-rescued hero is not unlocked again at the boss');
    assert.ok(unlocked.length >= 1, 'the un-rescued floor-2 heroes unlock at the boss');
    assert.ok(!save.pendingRescueDialogue.includes('knight-crusader'),
      'cutscene queue excludes the hero rescued in-maze');
  });

  test('save version is 5', () => {
    assert.equal(CURRENT_VERSION, 5);
  });

  test('v4 slot-keyed equipment migrates to hero-id keys', () => {
    const v4 = {
      version: 4,
      grade: 3,
      party: [
        { id: 'bunny-pepper', name: 'PEPPER', hp: 30, maxHp: 30 },
        { id: 'knight-shadow', name: 'SHADOW', hp: 30, maxHp: 30 },
      ],
      gold: 0,
      equipment: {
        hero0: { weapon: 'iron_sword', armor: null, accessory: null },
        hero1: { weapon: null, armor: 'wooden_shield', accessory: null },
        hero2: { weapon: null, armor: null, accessory: null },
      },
      floors: [],
      settings: {},
      stats: {},
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(v4));
    const loaded = loadSave();
    assert.equal(loaded.version, 5);
    assert.equal(loaded.equipment['bunny-pepper'].weapon, 'iron_sword');
    assert.equal(loaded.equipment['knight-shadow'].armor, 'wooden_shield');
    assert.equal(loaded.equipment.hero0, undefined);
    assert.equal(loaded.equipment.hero2, undefined);
  });

  test('v2 save migrates to v3 with unlockedHeroes', () => {
    const v2 = {
      version: 2,
      grade: 3,
      party: [],
      gold: 100,
      potions: 5,
      inventory: [],
      floors: [
        { id: 1, unlocked: true, complete: true, bestStreak: 5 },
        { id: 2, unlocked: true, complete: true, bestStreak: 3 },
        { id: 3, unlocked: true, complete: false, bestStreak: 0 },
        { id: 4, unlocked: false, complete: false, bestStreak: 0 },
        { id: 5, unlocked: false, complete: false, bestStreak: 0 },
        { id: 6, unlocked: false, complete: false, bestStreak: 0 },
        { id: 7, unlocked: false, complete: false, bestStreak: 0 },
        { id: 8, unlocked: false, complete: false, bestStreak: 0 },
        { id: 9, unlocked: false, complete: false, bestStreak: 0 },
      ],
      settings: {},
      stats: {},
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(v2));
    const loaded = loadSave();
    assert.equal(loaded.version, 5);
    assert.ok(Array.isArray(loaded.unlockedHeroes));
    // Starters + floor-2 unlocks (floors 1 & 2 complete; floor 3 is not, so
    // its rescue Toadstool must NOT be unlocked yet).
    assert.ok(loaded.unlockedHeroes.includes('knight-shadow'));
    assert.ok(loaded.unlockedHeroes.includes('knight-crusader'));   // floor 2
    assert.ok(loaded.unlockedHeroes.includes('bunny-nova'));         // floor 2
    assert.ok(loaded.unlockedHeroes.includes('wizard-spellblade'));  // floor 2
    assert.ok(!loaded.unlockedHeroes.includes('wizard-toadstool'),   // floor 3, incomplete
      'floor-3 rescue not unlocked while floor 3 is incomplete');
    assert.equal(loaded.gold, 100);
  });

  test('markFloorComplete + unlockHeroesForFloor persists via writeSave', () => {
    const save = makeDefaultSave();
    writeSave(save);
    const loaded = loadSave();
    markFloorComplete(loaded, 1);
    unlockHeroesForFloor(loaded, 2);   // Crusader is a floor-2 rescue now
    writeSave(loaded);
    const reloaded = loadSave();
    assert.ok(reloaded.floors[0].complete);
    assert.ok(reloaded.floors[1].unlocked);
    assert.ok(isHeroUnlocked(reloaded, 'knight-crusader'));
  });
});
