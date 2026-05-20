/**
 * Equipment System (Phase 3.2)
 *
 * Weapons, armor, and accessories that heroes can equip for stat bonuses.
 * Equipment is purchased in the shop and persisted in the save file.
 */

export const EQUIPMENT = [
  // Weapons
  { id: 'wooden_sword', name: 'Wooden Sword', slot: 'weapon', atk: 2, cost: 30, floor: 1 },
  { id: 'iron_sword', name: 'Iron Sword', slot: 'weapon', atk: 4, cost: 60, floor: 2 },
  { id: 'steel_sword', name: 'Steel Blade', slot: 'weapon', atk: 6, cost: 100, floor: 3 },
  { id: 'mithril_sword', name: 'Mithril Edge', slot: 'weapon', atk: 8, cost: 150, floor: 4 },
  { id: 'legend_sword', name: 'Legendary Blade', slot: 'weapon', atk: 12, cost: 250, floor: 5 },
  // Armor
  { id: 'wooden_shield', name: 'Wooden Shield', slot: 'armor', def: 2, cost: 30, floor: 1 },
  { id: 'iron_armor', name: 'Iron Armor', slot: 'armor', def: 4, cost: 60, floor: 2 },
  { id: 'steel_plate', name: 'Steel Plate', slot: 'armor', def: 6, cost: 100, floor: 3 },
  { id: 'mithril_mail', name: 'Mithril Mail', slot: 'armor', def: 8, cost: 150, floor: 4 },
  { id: 'legend_armor', name: 'Legendary Armor', slot: 'armor', def: 10, cost: 250, floor: 5 },
  // Accessories
  { id: 'health_charm', name: 'Health Charm', slot: 'accessory', hp: 5, cost: 25, floor: 1 },
  { id: 'vigor_ring', name: 'Vigor Ring', slot: 'accessory', hp: 10, cost: 50, floor: 2 },
  { id: 'life_amulet', name: 'Life Amulet', slot: 'accessory', hp: 15, cost: 80, floor: 3 },
  { id: 'heart_crystal', name: 'Heart Crystal', slot: 'accessory', hp: 20, cost: 120, floor: 4 },
  { id: 'soul_gem', name: 'Soul Gem', slot: 'accessory', hp: 30, cost: 200, floor: 5 },
];

export function getEquipmentForFloor(maxFloor) {
  return EQUIPMENT.filter(e => e.floor <= maxFloor);
}

export function getEquipmentById(id) {
  return EQUIPMENT.find(e => e.id === id) || null;
}
