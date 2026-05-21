/**
 * Save system
 *
 * Wraps localStorage for game progress persistence. Versioned schema
 * so we can migrate old saves forward as the data model evolves.
 *
 * Design decisions:
 *   - One save per device (no slots yet)
 *   - Schema version baked into every save
 *   - Migrations run automatically on load
 *   - Graceful handling of missing/corrupted localStorage
 *   - Pure functions where possible; side effects (read/write)
 *     isolated so tests can stub them
 */

const LEGACY_KEY = 'mathwarriors.save';
const SLOT_PREFIX = 'mathwarriors.save.';
const CURRENT_VERSION = 2;

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
    grade: 3,
    party: [],          // populated at party-select time
    gold: 0,
    potions: 2,
    inventory: [],
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
      // Add xp, level to each party member; add inventory array
      const party = (save.party || []).map(h => ({
        ...h,
        xp: h.xp ?? 0,
        level: h.level ?? 1,
      }));
      return { ...save, party, inventory: save.inventory || [] };
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

  // Always reflect current version
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
    return true;
  } catch (err) {
    console.warn('[save] Failed to write save:', err);
    return false;
  }
}

/** Wipe the save. Used for "new game" and for tests. */
export function clearSave(slot = 1) {
  try {
    getStorage().removeItem(slotKey(slot));
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
export function updateSave(mutator) {
  const save = loadSave();
  mutator(save);
  return writeSave(save);
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

export { CURRENT_VERSION, STORAGE_KEY, LEGACY_KEY, SLOT_PREFIX };
