/**
 * Overworld runtime state <-> save (v6) serialization.
 *
 * The 3D hub keeps its own small state record — where the player stands,
 * which portal they last used, which pickups are gone. Saves come from
 * localStorage and can be hand-edited or half-written, so fromSave() must
 * never throw and never emit a partial position: a pos missing one axis
 * would drop the player through the terrain, so anything malformed
 * collapses to the defaults (null pos = spawn fresh at the island spawn).
 * Pure logic — no three/phaser/DOM imports so plain Node can test it.
 */

/** A fresh overworld state: never visited, spawn at the island default. */
export function defaultOverworldState() {
  return { pos: null, yaw: 0, portalId: null, collected: [] };
}

/** True when v is a full finite {x,y,z} point — partial points are invalid. */
function isValidPos(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Coerce to a finite number, else fall back (NaN/Infinity/non-number). */
function toFinite(v, fallback) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : fallback;
}

/**
 * Serialize runtime state to the plain-JSON save.overworld shape.
 * Copies (never aliases) nested data so later mutation of the runtime
 * state can't reach into an already-written save object.
 */
export function toSave(state) {
  const s = (state && typeof state === 'object') ? state : {};
  return {
    pos: isValidPos(s.pos) ? { x: s.pos.x, y: s.pos.y, z: s.pos.z } : null,
    yaw: toFinite(s.yaw, 0),
    portalId: typeof s.portalId === 'string' ? s.portalId : null,
    collected: Array.isArray(s.collected)
      ? s.collected.filter((id) => typeof id === 'string')
      : [],
  };
}

/**
 * Validate save.overworld into a runtime state. Bad or missing data
 * falls back per-field to defaults; never throws.
 */
export function fromSave(saveOverworld) {
  const raw = (saveOverworld && typeof saveOverworld === 'object' && !Array.isArray(saveOverworld))
    ? saveOverworld : {};
  return {
    pos: isValidPos(raw.pos) ? { x: raw.pos.x, y: raw.pos.y, z: raw.pos.z } : null,
    yaw: toFinite(raw.yaw, 0),
    portalId: typeof raw.portalId === 'string' ? raw.portalId : null,
    collected: Array.isArray(raw.collected)
      ? raw.collected.filter((id) => typeof id === 'string')
      : [],
  };
}
