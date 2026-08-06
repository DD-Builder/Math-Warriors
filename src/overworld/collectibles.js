/**
 * Overworld collectibles — grant-once pickups that write into the save.
 *
 * Pickups are placed deterministically from the world seed, so the only
 * state worth persisting is WHICH ids were taken; the save is the single
 * source of truth (save.overworld.collected). Grants mutate the same
 * save fields the rest of the game reads (save.gold, save.potions) so a
 * shoreline coin is identical to shop/battle gold. The overworld container
 * is created defensively because v5 saves migrated forward have none.
 */

/** Ensure save.overworld exists with the v6 shape; returns it. */
export function ensureOverworld(save) {
  if (!save.overworld || typeof save.overworld !== 'object') {
    save.overworld = { pos: null, yaw: 0, portalId: null, collected: [] };
  }
  if (!Array.isArray(save.overworld.collected)) save.overworld.collected = [];
  return save.overworld;
}

export function isCollected(save, id) {
  const collected = save && save.overworld && save.overworld.collected;
  return Array.isArray(collected) && collected.includes(id);
}

/**
 * Grant a pickup exactly once.
 * @param {object} save mutated in place
 * @param {{id:string, kind:'gold'|'potion', amount:number}} spec
 * @returns {{granted:boolean, already:boolean}}
 */
export function collectItem(save, spec) {
  const ow = ensureOverworld(save);
  if (ow.collected.includes(spec.id)) return { granted: false, already: true };

  const amount = spec.amount || 0;
  if (spec.kind === 'gold') {
    save.gold = (save.gold || 0) + amount;
  } else if (spec.kind === 'potion') {
    save.potions = (save.potions || 0) + amount;
  }
  ow.collected.push(spec.id);
  return { granted: true, already: false };
}
