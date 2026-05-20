/**
 * Equipment System (Phase 3.2)
 *
 * Weapons, armor, and accessories that heroes can equip for stat bonuses.
 * Equipment is purchased in the shop and persisted in the save file.
 *
 * Two views of the data:
 *   - EQUIPMENT_TIERS: tier-based groupings (weapon+armor+accessory per tier)
 *   - EQUIPMENT: flat list of individual items (for backward compat with shop/battle)
 */

export const EQUIPMENT_TIERS = [
  { tier: 'wooden', floor: 1, weapon: { name: 'Wooden Sword', atk: 2 }, armor: { name: 'Leather Vest', def: 2 }, accessory: { name: 'Simple Ring', hp: 5 }, cost: 30 },
  { tier: 'iron', floor: 2, weapon: { name: 'Iron Blade', atk: 4 }, armor: { name: 'Chain Mail', def: 4 }, accessory: { name: 'Silver Band', hp: 10 }, cost: 60 },
  { tier: 'steel', floor: 3, weapon: { name: 'Steel Sword', atk: 6 }, armor: { name: 'Plate Armor', def: 6 }, accessory: { name: 'Gold Pendant', hp: 15 }, cost: 100 },
  { tier: 'mithril', floor: 4, weapon: { name: 'Mithril Edge', atk: 8 }, armor: { name: 'Mithril Plate', def: 8 }, accessory: { name: 'Crystal Charm', hp: 20 }, cost: 150 },
  { tier: 'legendary', floor: 5, weapon: { name: 'Legendary Blade', atk: 12 }, armor: { name: 'Dragon Scale', def: 10 }, accessory: { name: 'Phoenix Feather', hp: 30 }, cost: 250 },
];

export function getAvailableEquipment(highestFloor) {
  return EQUIPMENT_TIERS.filter(t => t.floor <= highestFloor);
}

export function getEquipmentBonuses(equipped) {
  let atk = 0, def = 0, hp = 0;
  if (equipped?.weapon) atk += equipped.weapon.atk || 0;
  if (equipped?.armor) def += equipped.armor.def || 0;
  if (equipped?.accessory) hp += equipped.accessory.hp || 0;
  return { atk, def, hp };
}

// --- Flat item list (backward compat for BattleScene getEquipmentById) ---

export const EQUIPMENT = [
  // Weapons
  { id: 'wooden_sword', name: 'Wooden Sword', slot: 'weapon', atk: 2, cost: 30, floor: 1 },
  { id: 'iron_sword', name: 'Iron Blade', slot: 'weapon', atk: 4, cost: 60, floor: 2 },
  { id: 'steel_sword', name: 'Steel Sword', slot: 'weapon', atk: 6, cost: 100, floor: 3 },
  { id: 'mithril_sword', name: 'Mithril Edge', slot: 'weapon', atk: 8, cost: 150, floor: 4 },
  { id: 'legend_sword', name: 'Legendary Blade', slot: 'weapon', atk: 12, cost: 250, floor: 5 },
  // Armor
  { id: 'wooden_shield', name: 'Leather Vest', slot: 'armor', def: 2, cost: 30, floor: 1 },
  { id: 'iron_armor', name: 'Chain Mail', slot: 'armor', def: 4, cost: 60, floor: 2 },
  { id: 'steel_plate', name: 'Plate Armor', slot: 'armor', def: 6, cost: 100, floor: 3 },
  { id: 'mithril_mail', name: 'Mithril Plate', slot: 'armor', def: 8, cost: 150, floor: 4 },
  { id: 'legend_armor', name: 'Dragon Scale', slot: 'armor', def: 10, cost: 250, floor: 5 },
  // Accessories
  { id: 'health_charm', name: 'Simple Ring', slot: 'accessory', hp: 5, cost: 25, floor: 1 },
  { id: 'vigor_ring', name: 'Silver Band', slot: 'accessory', hp: 10, cost: 50, floor: 2 },
  { id: 'life_amulet', name: 'Gold Pendant', slot: 'accessory', hp: 15, cost: 80, floor: 3 },
  { id: 'heart_crystal', name: 'Crystal Charm', slot: 'accessory', hp: 20, cost: 120, floor: 4 },
  { id: 'soul_gem', name: 'Phoenix Feather', slot: 'accessory', hp: 30, cost: 200, floor: 5 },
];

export function getEquipmentForFloor(maxFloor) {
  return EQUIPMENT.filter(e => e.floor <= maxFloor);
}

export function getEquipmentById(id) {
  return EQUIPMENT.find(e => e.id === id) || null;
}
