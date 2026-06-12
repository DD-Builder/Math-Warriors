/**
 * Command menu system
 *
 * Defines the FIGHT / MAGIC / GUARD commands and their properties.
 * Grade-gated: K-1 sees only FIGHT + GUARD. MAGIC unlocks at Grade 2.
 *
 * Pure module — no Phaser dependencies.
 */

import { PAPER } from '../config.js';

export const COMMANDS = {
  FIGHT: 'fight',
  MAGIC: 'magic',
  GUARD: 'guard',
};

const COMMAND_CONFIG = {
  [COMMANDS.FIGHT]: {
    label: 'FIGHT',
    icon: '⚔️',    // ⚔️
    targetStars: [2, 3],
    damageMult: 1.0,
    wrongPenalty: 'counter',  // enemy counter-attacks on wrong
    requiresMath: true,
    color: PAPER.teal,
    description: 'Standard attack',
  },
  [COMMANDS.MAGIC]: {
    label: 'MAGIC',
    icon: '✨',           // ✨
    targetStars: [4, 5],
    damageMult: 1.8,
    wrongPenalty: 'fizzle',   // 0 damage, NO counter-attack
    requiresMath: true,
    color: PAPER.lavenderD,
    description: 'Hard math, big damage!',
  },
  [COMMANDS.GUARD]: {
    label: 'GUARD',
    icon: '🛡️',  // 🛡️
    targetStars: null,
    damageMult: 0,
    wrongPenalty: null,
    requiresMath: false,
    color: PAPER.forest,
    description: 'Skip math, take less damage',
    damageReduction: 0.5,     // incoming damage multiplier while guarding
  },
};

/**
 * Returns the commands available for a given grade level.
 * K-1 (grades 0-1): FIGHT + GUARD only
 * Grade 2+: FIGHT + MAGIC + GUARD
 *
 * @param {number} grade - 0-5
 * @returns {string[]}   - Array of COMMANDS values
 */
export function getAvailableCommands(grade) {
  if (grade <= 1) {
    return [COMMANDS.FIGHT, COMMANDS.GUARD];
  }
  return [COMMANDS.FIGHT, COMMANDS.MAGIC, COMMANDS.GUARD];
}

/**
 * Returns the commands available for a specific hero class.
 * Knight: FIGHT + GUARD
 * Wizard: MAGIC + GUARD
 * Bunny: FIGHT + MAGIC + GUARD (MAGIC = heal for bunnies)
 * K-1 override: always FIGHT + GUARD only.
 */
export function getClassCommands(cls, grade) {
  if (grade <= 1) return [COMMANDS.FIGHT, COMMANDS.GUARD];
  if (cls === 'knight') return [COMMANDS.FIGHT, COMMANDS.GUARD];
  if (cls === 'wizard') return [COMMANDS.MAGIC, COMMANDS.GUARD];
  return [COMMANDS.FIGHT, COMMANDS.MAGIC, COMMANDS.GUARD];
}

/**
 * Get the config for a specific command.
 * @param {string} command - One of COMMANDS values
 * @returns {object}
 */
export function getCommandConfig(command) {
  return COMMAND_CONFIG[command] ?? COMMAND_CONFIG[COMMANDS.FIGHT];
}
