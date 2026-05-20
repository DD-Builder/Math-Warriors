/**
 * Hero Active Abilities (Phase 3.1)
 *
 * Each hero class has two unique abilities they can activate during
 * battle. Abilities cost the hero's turn (except buff-type abilities
 * like Mana Surge and Fury Combo which enhance the next answer).
 *
 * Cooldowns are tracked per-hero in BattleScene.abilityCooldowns.
 */

export const HERO_ABILITIES = {
  knight: [
    { id: 'shield_bash', name: 'Shield Bash', desc: 'Reduce next enemy damage by 50%', cooldown: 3 },
    { id: 'rally', name: 'Rally', desc: 'All heroes gain +2 ATK for 3 turns', cooldown: 4 },
  ],
  wizard: [
    { id: 'arcane_heal', name: 'Arcane Heal', desc: 'Heal weakest ally 20 HP', cooldown: 3 },
    { id: 'mana_surge', name: 'Mana Surge', desc: 'Next correct answer deals 2x damage', cooldown: 4 },
  ],
  bunny: [
    { id: 'dodge_roll', name: 'Dodge Roll', desc: '60% chance to dodge next attack', cooldown: 3 },
    { id: 'fury_combo', name: 'Fury Combo', desc: 'Next 2 attacks deal 1.5x each', cooldown: 4 },
  ],
};

export function getAbilitiesForClass(cls) {
  return HERO_ABILITIES[cls] || [];
}
