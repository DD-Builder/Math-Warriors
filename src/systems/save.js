/**
 * Save system — 3-slot save with metadata previews.
 *
 * Wraps localStorage for game progress persistence. Versioned schema
 * so we can migrate old saves forward as the data model evolves.
 */

import { ALL_HEROES } from '../data/heroes.js';

const LEGACY_KEY = 'mathwarriors.save';
const SLOT_PREFIX = 'mathwarriors.save.';
const META_KEY = 'mathwarriors.slots';
const CURRENT_VERSION = 4;
const MAX_SLOTS = 3;

const STARTER_HEROES = ['knight-shadow', 'wizard-stargazer', 'bunny-pepper'];

/** Build the storage key for a given slot number (default 1). */
function slotKey(slot = 1) {
  return `${SLOT_PREFIX}${slot}`;
}

// Public alias so tests/consumers can reference the active key
const STORAGE_KEY = slotKey(1);

// ------------------------------------------------------------------
// DEFAULT SAVE SHAPE
// ------------------------------------------------------------------
// This is what a brand-new save looks like. Any field here that's
// missing from a loaded save gets filled in by `normalize`.

export function makeDefaultSave() {
  return {
    version: CURRENT_VERSION,
    slotName: null,
    grade: 3,
    party: [],
    gold: 0,
    potions: 2,
    inventory: [],
    unlockedHeroes: [...STARTER_HEROES],
    equipment: {
      hero0: { weapon: null, armor: null, accessory: null },
      hero1: { weapon: null, armor: null, accessory: null },
      hero2: { weapon: null, armor: null, accessory: null },
    },
    floors: [
      { id: 1, unlocked: true,  complete: false, bestStreak: 0 },
      { id: 2, unlocked: false, complete: false, bestStreak: 0 },
      { id: 3, unlocked: false, complete: false, bestStreak: 0 },
      { id: 4, unlocked: false, complete: false, bestStreak: 0 },
      { id: 5, unlocked: false, complete: false, bestStreak: 0 },
      { id: 6, unlocked: false, complete: false, bestStreak: 0 },
      { id: 7, unlocked: false, complete: false, bestStreak: 0 },
      { id: 8, unlocked: false, complete: false, bestStreak: 0 },
      { id: 9, unlocked: false, complete: false, bestStreak: 0 },
    ],
    heroEvolution: {},
    heroBonds: {},
    pendingRescueDialogue: [],
    settings: {
      musicVolume: 0.8,
      sfxVolume: 1.0,
      reducedMotion: false,
      colorblindMode: false,
      sessionTimer: 0,
    },
    problemHistory: [],
    stats: {
      totalBattles: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalGold: 0,
      bestStreak: 0,
      perfectBattle: false,
      achievements: [],
      playTimeSec: 0,
      firstPlayedAt: Date.now(),
      lastPlayedAt: Date.now(),
      tutorialComplete: false,
      lastDailyChallenge: 0,
      lastDailyDate: 0,
      dailyStreak: 0,
    },
  };
}

// ------------------------------------------------------------------
// MIGRATIONS
// ------------------------------------------------------------------
// Each migration takes a save at version N and returns a save at
// version N+1. They run in order, so a v0 save can be brought all
// the way up to current by walking the chain.
//
// IMPORTANT: never rename an existing version's migration. Always
// add a new one at the end.

const MIGRATIONS = [
  {
    from: 1, to: 2,
    migrate: (save) => {
      const party = (save.party || []).map(h => ({
        ...h,
        xp: h.xp ?? 0,
        level: h.level ?? 1,
      }));
      return { ...save, party, inventory: save.inventory || [] };
    },
  },
  {
    from: 2, to: 3,
    migrate: (save) => {
      const unlocked = [...STARTER_HEROES];
      const floors = save.floors || [];
      for (const f of floors) {
        if (!f || typeof f.id !== 'number' || !f.complete) continue;
        if (f.complete) {
          const heroesForFloor = getHeroesUnlockedAtFloor(f.id);
          for (const h of heroesForFloor) {
            if (!unlocked.includes(h.id)) unlocked.push(h.id);
          }
        }
      }
      return { ...save, unlockedHeroes: unlocked };
    },
  },
  {
    from: 3, to: 4,
    migrate: (save) => {
      return {
        ...save,
        heroEvolution: save.heroEvolution || {},
        heroBonds: save.heroBonds || {},
      };
    },
  },
];

/**
 * Bring a loaded save up to the current version by walking migrations.
 * Returns the migrated save.
 */
function migrate(save) {
  let current = save;
  while (current.version < CURRENT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current.version);
    if (!step) {
      // No migration path — fall back to defaults and preserve what we can
      console.warn(`[save] No migration from v${current.version}, resetting to defaults`);
      return makeDefaultSave();
    }
    current = step.migrate(current);
    current.version = step.to;
  }
  return current;
}

// ------------------------------------------------------------------
// NORMALIZATION
// ------------------------------------------------------------------
// Ensures a loaded save has every field in the default shape. If
// someone hand-edits their save or we ship a bad write, this prevents
// undefined crashes downstream.

function normalize(save) {
  const def = makeDefaultSave();
  const out = { ...def, ...save };

  // Deep-normalize nested objects
  out.settings = { ...def.settings, ...(save.settings || {}) };
  out.stats    = { ...def.stats,    ...(save.stats    || {}) };

  // Ensure problemHistory is an array
  if (!Array.isArray(out.problemHistory)) {
    out.problemHistory = [];
  }

  // Ensure equipment object is well-formed
  const defEquip = def.equipment;
  if (!out.equipment || typeof out.equipment !== 'object') {
    out.equipment = { ...defEquip };
  } else {
    for (const key of ['hero0', 'hero1', 'hero2']) {
      if (!out.equipment[key] || typeof out.equipment[key] !== 'object') {
        out.equipment[key] = { ...defEquip[key] };
      } else {
        out.equipment[key] = { ...defEquip[key], ...out.equipment[key] };
      }
    }
  }

  // Floors array: ensure all 9 floors exist
  const floors = Array.isArray(save.floors) ? save.floors : [];
  out.floors = def.floors.map((defFloor) => {
    const existing = floors.find((f) => f && f.id === defFloor.id);
    return existing ? { ...defFloor, ...existing } : defFloor;
  });

  // Ensure unlockedHeroes is present
  if (!Array.isArray(out.unlockedHeroes)) {
    out.unlockedHeroes = [...STARTER_HEROES];
  }

  // Ensure heroEvolution and heroBonds are objects
  if (!out.heroEvolution || typeof out.heroEvolution !== 'object') {
    out.heroEvolution = {};
  }
  if (!out.heroBonds || typeof out.heroBonds !== 'object') {
    out.heroBonds = {};
  }
  if (!Array.isArray(out.pendingRescueDialogue)) {
    out.pendingRescueDialogue = [];
  }

  out.version = CURRENT_VERSION;

  return out;
}

// ------------------------------------------------------------------
// STORAGE ADAPTER
// ------------------------------------------------------------------
// Wraps the real localStorage so we can inject a mock in tests.
// Falls back to an in-memory Map if localStorage is unavailable
// (private browsing, server-side rendering, etc).

let _storage = null;

function getStorage() {
  if (_storage) return _storage;
  if (typeof localStorage !== 'undefined') {
    _storage = localStorage;
    return _storage;
  }
  // In-memory fallback
  const mem = new Map();
  _storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
  return _storage;
}

/** FOR TESTS ONLY: inject a custom storage adapter. */
export function __setStorage(storage) {
  _storage = storage;
}

// ------------------------------------------------------------------
// PUBLIC API
// ------------------------------------------------------------------

/**
 * Load the save from storage. If no save exists or the save is
 * corrupted, returns a fresh default save (but does NOT write it).
 *
 * @param {number} slot  Save slot number (default 1)
 */
export function loadSave(slot = 1) {
  try {
    const key = slotKey(slot);
    let raw = getStorage().getItem(key);

    // Backward-compatible migration: if the slot key doesn't exist but
    // the legacy key does, migrate once.
    if (!raw && slot === 1) {
      const legacy = getStorage().getItem(LEGACY_KEY);
      if (legacy) {
        // Copy legacy save into slot 1 and remove the old key
        getStorage().setItem(key, legacy);
        getStorage().removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }

    if (!raw) return makeDefaultSave();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return makeDefaultSave();
    const migrated = migrate(parsed);
    return normalize(migrated);
  } catch (err) {
    console.warn('[save] Failed to load save, starting fresh:', err);
    return makeDefaultSave();
  }
}

/**
 * Write the save to storage. Returns true on success, false on failure
 * (e.g., quota exceeded, private browsing blocking writes).
 *
 * @param {object} save  The save object to persist
 * @param {number} slot  Save slot number (default 1)
 */
export function writeSave(save, slot = 1) {
  try {
    const normalized = normalize(save);
    normalized.stats.lastPlayedAt = Date.now();
    getStorage().setItem(slotKey(slot), JSON.stringify(normalized));
    updateSlotMeta(slot, normalized);
    return true;
  } catch (err) {
    console.warn('[save] Failed to write save:', err);
    return false;
  }
}

export function clearSave(slot = 1) {
  try {
    getStorage().removeItem(slotKey(slot));
    clearSlotMeta(slot);
    return true;
  } catch (err) {
    console.warn('[save] Failed to clear save:', err);
    return false;
  }
}

/**
 * Convenience: load, mutate via callback, and write. Call as:
 *
 *   updateSave((save) => {
 *     save.gold += 10;
 *     save.stats.totalCorrect++;
 *   });
 */
export function updateSave(mutator, slot = 1) {
  const save = loadSave(slot);
  mutator(save);
  return writeSave(save, slot);
}

/** Mark a floor complete and unlock the next one. */
export function markFloorComplete(save, floorId) {
  const floor = save.floors.find((f) => f.id === floorId);
  if (!floor) return save;
  floor.complete = true;
  const next = save.floors.find((f) => f.id === floorId + 1);
  if (next) next.unlocked = true;
  return save;
}

function getHeroesUnlockedAtFloor(floorId) {
  return ALL_HEROES.filter(h => h.unlockedAtFloor === floorId);
}

export function unlockHeroesForFloor(save, floorId) {
  const heroes = getHeroesUnlockedAtFloor(floorId);
  const newlyUnlocked = [];
  for (const h of heroes) {
    if (!save.unlockedHeroes.includes(h.id)) {
      save.unlockedHeroes.push(h.id);
      newlyUnlocked.push(h);
    }
  }
  // Track rescued hero IDs so the UI can display rescue dialogue
  if (newlyUnlocked.length > 0) {
    if (!Array.isArray(save.pendingRescueDialogue)) {
      save.pendingRescueDialogue = [];
    }
    save.pendingRescueDialogue = newlyUnlocked.map(h => h.id);
  }
  return newlyUnlocked;
}

/**
 * Consume and return the pending rescue hero IDs, clearing them from save.
 * Returns an array of hero ID strings, or empty array if none pending.
 */
export function consumePendingRescues(save) {
  const pending = Array.isArray(save.pendingRescueDialogue)
    ? [...save.pendingRescueDialogue]
    : [];
  save.pendingRescueDialogue = [];
  return pending;
}

export function isHeroUnlocked(save, heroId) {
  return Array.isArray(save.unlockedHeroes) && save.unlockedHeroes.includes(heroId);
}

// ------------------------------------------------------------------
// SLOT METADATA
// ------------------------------------------------------------------

function emptyMeta(slot) {
  return { slot, name: null, grade: null, partyNames: [], floorsComplete: 0, gold: 0, lastPlayed: 0 };
}

function loadAllMeta() {
  try {
    const raw = getStorage().getItem(META_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === MAX_SLOTS) return arr;
    }
  } catch (e) { /* ignore */ }
  return [emptyMeta(1), emptyMeta(2), emptyMeta(3)];
}

function saveAllMeta(meta) {
  try { getStorage().setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
}

function updateSlotMeta(slot, save) {
  const meta = loadAllMeta();
  const floorsComplete = (save.floors || []).filter(f => f && f.complete).length;
  const partyNames = (save.party || []).map(h => h?.name || '').filter(Boolean);
  meta[slot - 1] = {
    slot,
    name: save.slotName || null,
    grade: save.grade ?? null,
    partyNames,
    floorsComplete,
    gold: save.gold || 0,
    lastPlayed: save.stats?.lastPlayedAt || Date.now(),
  };
  saveAllMeta(meta);
}

function clearSlotMeta(slot) {
  const meta = loadAllMeta();
  meta[slot - 1] = emptyMeta(slot);
  saveAllMeta(meta);
}

export function listSlots() {
  const meta = loadAllMeta();
  for (let i = 0; i < MAX_SLOTS; i++) {
    const key = slotKey(i + 1);
    const hasData = !!getStorage().getItem(key);
    if (hasData && !meta[i].lastPlayed) {
      const save = loadSave(i + 1);
      updateSlotMeta(i + 1, save);
      meta[i] = loadAllMeta()[i];
    }
    meta[i].exists = hasData;
  }
  return meta;
}

export function renameSlot(slot, name) {
  const save = loadSave(slot);
  save.slotName = name;
  writeSave(save, slot);
}

export function getActiveSlot(scene) {
  return scene?.registry?.get('activeSlot') || 1;
}

export { CURRENT_VERSION, STORAGE_KEY, LEGACY_KEY, SLOT_PREFIX, MAX_SLOTS };
