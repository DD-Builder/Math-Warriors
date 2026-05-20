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

const STORAGE_KEY = 'mathwarriors.save';
const CURRENT_VERSION = 2;

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
    floors: [
      { id: 1, unlocked: true,  complete: false, bestStreak: 0 },
      { id: 2, unlocked: false, complete: false, bestStreak: 0 },
      { id: 3, unlocked: false, complete: false, bestStreak: 0 },
      { id: 4, unlocked: false, complete: false, bestStreak: 0 },
      { id: 5, unlocked: false, complete: false, bestStreak: 0 },
    ],
    settings: {
      musicVolume: 0.8,
      sfxVolume: 1.0,
      reducedMotion: false,
    },
    stats: {
      totalBattles: 0,
      totalCorrect: 0,
      totalWrong: 0,
      playTimeSec: 0,
      firstPlayedAt: Date.now(),
      lastPlayedAt: Date.now(),
      tutorialComplete: false,
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

  // Floors array: ensure all 5 floors exist
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
 */
export function loadSave() {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
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
 */
export function writeSave(save) {
  try {
    const normalized = normalize(save);
    normalized.stats.lastPlayedAt = Date.now();
    getStorage().setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn('[save] Failed to write save:', err);
    return false;
  }
}

/** Wipe the save. Used for "new game" and for tests. */
export function clearSave() {
  try {
    getStorage().removeItem(STORAGE_KEY);
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

export { CURRENT_VERSION, STORAGE_KEY };
