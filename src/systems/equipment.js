/**
 * Equipment System (Phase 3.2)
 *
 * Weapons, armor, and accessories that heroes can equip for stat bonuses.
 * Equipment is purchased in the shop and persisted in the save file
 * (save.equipment.heroN stores item IDs per slot).
 *
 * TIER_DEFS below is the single source of truth. Both public views are
 * derived from it:
 *   - EQUIPMENT_TIERS: tier-based groupings (weapon+armor+accessory per tier)
 *   - EQUIPMENT: flat list of individual items (BattleScene uses getEquipmentById)
 */

const TIER_DEFS = [
  {
    tier: 'wooden', floor: 1,
    weapon:    { id: 'wooden_sword',   name: 'Wooden Sword',    atk: 2,  cost: 30 },
    armor:     { id: 'wooden_shield',  name: 'Leather Vest',    def: 2,  cost: 30 },
    accessory: { id: 'health_charm',   name: 'Simple Ring',     hp: 5,   cost: 25 },
  },
  {
    tier: 'iron', floor: 2,
    weapon:    { id: 'iron_sword',     name: 'Iron Blade',      atk: 4,  cost: 60 },
    armor:     { id: 'iron_armor',     name: 'Chain Mail',      def: 4,  cost: 60 },
    accessory: { id: 'vigor_ring',     name: 'Silver Band',     hp: 10,  cost: 50 },
  },
  {
    tier: 'steel', floor: 3,
    weapon:    { id: 'steel_sword',    name: 'Steel Sword',     atk: 6,  cost: 100 },
    armor:     { id: 'steel_plate',    name: 'Plate Armor',     def: 6,  cost: 100 },
    accessory: { id: 'life_amulet',    name: 'Gold Pendant',    hp: 15,  cost: 80 },
  },
  {
    tier: 'mithril', floor: 4,
    weapon:    { id: 'mithril_sword',  name: 'Mithril Edge',    atk: 8,  cost: 150 },
    armor:     { id: 'mithril_mail',   name: 'Mithril Plate',   def: 8,  cost: 150 },
    accessory: { id: 'heart_crystal',  name: 'Crystal Charm',   hp: 20,  cost: 120 },
  },
  {
    tier: 'legendary', floor: 5,
    weapon:    { id: 'legend_sword',   name: 'Legendary Blade', atk: 12, cost: 250 },
    armor:     { id: 'legend_armor',   name: 'Dragon Scale',    def: 10, cost: 250 },
    accessory: { id: 'soul_gem',       name: 'Phoenix Feather', hp: 30,  cost: 200 },
  },
];

// --- Derived view 1: tier groupings (tier cost = weapon/armor cost) ---

export const EQUIPMENT_TIERS = TIER_DEFS.map(t => ({
  tier: t.tier,
  floor: t.floor,
  weapon: { ...t.weapon },
  armor: { ...t.armor },
  accessory: { ...t.accessory },
  cost: t.weapon.cost,
  setCost: t.weapon.cost + t.armor.cost + t.accessory.cost,
}));

// --- Derived view 2: flat item list (BattleScene getEquipmentById) ---

const EQUIPMENT = TIER_DEFS.flatMap(t => [
  { ...t.weapon,    slot: 'weapon',    floor: t.floor, tier: t.tier },
  { ...t.armor,     slot: 'armor',     floor: t.floor, tier: t.tier },
  { ...t.accessory, slot: 'accessory', floor: t.floor, tier: t.tier },
]);

export function getEquipmentById(id) {
  return EQUIPMENT.find(e => e.id === id) || null;
}
