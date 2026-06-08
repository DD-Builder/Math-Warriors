/**
 * Bond system — tracks hero relationships built through shared battles.
 *
 * Bond Ranks: C (5 battles) -> B (15 battles) -> A (30 battles) -> S (50 battles)
 *
 * Bond data is stored in save.heroBonds:
 *   { 'knight-shadow|wizard-stargazer': { battles: 12, rank: 'B' } }
 *
 * Key is always alphabetically sorted hero IDs joined by '|'.
 */

import { HERO_BONDS, getHeroById } from '../data/heroes.js';

const BOND_THRESHOLDS = { C: 5, B: 15, A: 30, S: 50 };
const RANK_ORDER = ['C', 'B', 'A', 'S'];

// ------------------------------------------------------------------
// KEY HELPERS
// ------------------------------------------------------------------

/**
 * Generate the canonical bond key for two heroes.
 * Always sorted alphabetically so order doesn't matter.
 */
export function bondKey(heroId1, heroId2) {
  return [heroId1, heroId2].sort().join('|');
}

// ------------------------------------------------------------------
// BATTLE RECORDING
// ------------------------------------------------------------------

/**
 * Compute the current rank for a given battle count.
 */
function rankForBattles(battles) {
  if (battles >= BOND_THRESHOLDS.S) return 'S';
  if (battles >= BOND_THRESHOLDS.A) return 'A';
  if (battles >= BOND_THRESHOLDS.B) return 'B';
  if (battles >= BOND_THRESHOLDS.C) return 'C';
  return null;
}

/**
 * Record that heroes fought together in a battle.
 * Call this after each battle with the party's hero IDs.
 * Updates battle counts for all pairs in the party.
 * Returns any newly reached bond ranks for display.
 */
export function recordBattle(save, partyHeroIds) {
  if (!save.heroBonds) save.heroBonds = {};
  if (!Array.isArray(partyHeroIds) || partyHeroIds.length < 2) return [];

  const newRanks = [];

  for (let i = 0; i < partyHeroIds.length; i++) {
    for (let j = i + 1; j < partyHeroIds.length; j++) {
      const key = bondKey(partyHeroIds[i], partyHeroIds[j]);

      if (!save.heroBonds[key]) {
        save.heroBonds[key] = { battles: 0, rank: null };
      }

      const bond = save.heroBonds[key];
      const oldRank = bond.rank;
      bond.battles++;
      const newRank = rankForBattles(bond.battles);
      bond.rank = newRank;

      if (newRank && newRank !== oldRank) {
        newRanks.push({
          heroId1: partyHeroIds[i],
          heroId2: partyHeroIds[j],
          rank: newRank,
          battles: bond.battles,
        });
      }
    }
  }

  return newRanks;
}

// ------------------------------------------------------------------
// BOND QUERIES
// ------------------------------------------------------------------

/**
 * Get the current bond rank between two heroes.
 * Returns null if they haven't fought together enough.
 */
export function getBondRank(save, heroId1, heroId2) {
  const key = bondKey(heroId1, heroId2);
  return save.heroBonds?.[key]?.rank ?? null;
}

/**
 * Get the bond battle count between two heroes.
 */
export function getBondBattles(save, heroId1, heroId2) {
  const key = bondKey(heroId1, heroId2);
  return save.heroBonds?.[key]?.battles ?? 0;
}

// ------------------------------------------------------------------
// STAT BONUSES
// ------------------------------------------------------------------

/**
 * Get the stat bonuses from bonds for a hero in a given party.
 * C: +1 ATK per bonded ally
 * B: +1 ATK, +1 DEF per bonded ally
 * A: +2 ATK, +1 DEF per bonded ally
 * S: +2 ATK, +2 DEF, +5 HP per bonded ally
 */
export function getBondStatBonuses(save, heroId, partyHeroIds) {
  const bonuses = { atk: 0, def: 0, hp: 0 };
  if (!Array.isArray(partyHeroIds)) return bonuses;

  for (const allyId of partyHeroIds) {
    if (allyId === heroId) continue;
    const rank = getBondRank(save, heroId, allyId);
    if (!rank) continue;

    switch (rank) {
      case 'S':
        bonuses.hp += 5;
        bonuses.def += 2;
        bonuses.atk += 2;
        break;
      case 'A':
        bonuses.atk += 2;
        bonuses.def += 1;
        break;
      case 'B':
        bonuses.atk += 1;
        bonuses.def += 1;
        break;
      case 'C':
        bonuses.atk += 1;
        break;
      default:
        break;
    }
  }

  return bonuses;
}

// ------------------------------------------------------------------
// COMBO ATTACKS
// ------------------------------------------------------------------

/**
 * Check if a combo attack is available for the current party.
 * Requires B+ rank between the two heroes in a canonical bond pair.
 * Returns the available combos (from HERO_BONDS data).
 */
export function getAvailableCombos(save, partyHeroIds) {
  if (!Array.isArray(partyHeroIds) || partyHeroIds.length < 2) return [];

  const combos = [];
  for (const bondDef of HERO_BONDS) {
    const [h1, h2] = bondDef.heroes;
    if (!partyHeroIds.includes(h1) || !partyHeroIds.includes(h2)) continue;

    const rank = getBondRank(save, h1, h2);
    if (!rank) continue;

    const rankIdx = RANK_ORDER.indexOf(rank);
    const bIdx = RANK_ORDER.indexOf('B');
    if (rankIdx < bIdx) continue;

    combos.push({
      heroes: bondDef.heroes,
      name: bondDef.name,
      description: bondDef.description,
      combo: bondDef.combo,
      multiplier: bondDef.multiplier || 3,
      rank,
    });
  }

  return combos;
}

// ------------------------------------------------------------------
// DIALOGUE
// ------------------------------------------------------------------

/**
 * Get all bond dialogues available between two heroes at their current rank.
 */
export function getBondDialogues(save, heroId1, heroId2) {
  const rank = getBondRank(save, heroId1, heroId2);
  if (!rank) return [];

  const key = bondKey(heroId1, heroId2);

  // Find the bond definition for this pair
  const bondDef = HERO_BONDS.find(b => {
    const [h1, h2] = b.heroes;
    return bondKey(h1, h2) === key;
  });
  if (!bondDef) return [];

  const dialogueMap = { C: bondDef.dialogueC, B: bondDef.dialogueB, A: bondDef.dialogueA, S: bondDef.dialogueS };

  const rankIdx = RANK_ORDER.indexOf(rank);
  const dialogues = [];
  for (let i = 0; i <= rankIdx; i++) {
    const r = RANK_ORDER[i];
    if (dialogueMap[r]) {
      dialogues.push({ rank: r, text: dialogueMap[r] });
    }
  }

  return dialogues;
}

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------

/**
 * Get a summary of all bonds for a hero (for party select display).
 * Returns array of { partnerId, partnerName, rank, battles, nextRank, battlesNeeded }
 */
export function getHeroBondSummary(save, heroId) {
  if (!save.heroBonds) return [];

  const summaries = [];

  for (const [key, bond] of Object.entries(save.heroBonds)) {
    const [id1, id2] = key.split('|');
    let partnerId = null;
    if (id1 === heroId) partnerId = id2;
    else if (id2 === heroId) partnerId = id1;
    else continue;

    const partner = getHeroById(partnerId);
    const partnerName = partner ? partner.name : partnerId;

    // Determine next rank and battles needed
    let nextRank = null;
    let battlesNeeded = 0;
    const currentRankIdx = bond.rank ? RANK_ORDER.indexOf(bond.rank) : -1;
    if (currentRankIdx < RANK_ORDER.length - 1) {
      nextRank = RANK_ORDER[currentRankIdx + 1];
      battlesNeeded = BOND_THRESHOLDS[nextRank] - bond.battles;
      if (battlesNeeded < 0) battlesNeeded = 0;
    }

    summaries.push({
      partnerId,
      partnerName,
      rank: bond.rank,
      battles: bond.battles,
      nextRank,
      battlesNeeded,
    });
  }

  return summaries;
}
