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

  test('has exactly 5 floors', () => {
    assert.equal(makeDefaultSave().floors.length, 5);
  });

  test('only floor 1 is unlocked initially', () => {
    const save = makeDefaultSave();
    assert.equal(save.floors[0].unlocked, true);
    assert.equal(save.floors[1].unlocked, false);
    assert.equal(save.floors[2].unlocked, false);
    assert.equal(save.floors[3].unlocked, false);
    assert.equal(save.floors[4].unlocked, false);
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
    save.party = [{ id: 'test' }];
    writeSave(save);
    const loaded = loadSave();
    assert.equal(loaded.gold, 150);
    assert.equal(loaded.party[0].id, 'test');
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
    assert.equal(loaded.floors.length, 5);
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
    assert.equal(save.floors.length, 5);
    assert.equal(save.floors[0].complete, true);
    assert.equal(save.floors[0].bestStreak, 50);
    assert.equal(save.floors[4].complete, false);
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

  test('does not crash on floor 5 (no next floor)', () => {
    const save = makeDefaultSave();
    assert.doesNotThrow(() => markFloorComplete(save, 5));
    assert.equal(save.floors[4].complete, true);
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
