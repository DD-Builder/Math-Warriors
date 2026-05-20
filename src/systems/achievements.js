/**
 * Achievements System (Phase 3.3)
 *
 * Tracks player milestones and unlocks them when conditions are met.
 * Each achievement has a check function that receives the current save
 * state and returns true if the achievement should be unlocked.
 */

export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Win your first battle', check: (s) => (s.stats.totalBattles || 0) >= 1 },
  { id: 'streak_5', name: 'Streak Master', desc: 'Get a 5x streak', check: (s) => (s.stats.bestStreak || 0) >= 5 },
  { id: 'streak_8', name: 'ON FIRE!', desc: 'Get an 8x streak', check: (s) => (s.stats.bestStreak || 0) >= 8 },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat your first boss', check: (s) => s.floors.some(f => f.complete) },
  { id: 'all_floors', name: 'Equation Hunter', desc: 'Beat all 5 floors', check: (s) => s.floors.filter(f => f.complete).length >= 5 },
  { id: 'gold_500', name: 'Gold Hoarder', desc: 'Accumulate 500 gold', check: (s) => (s.stats.totalGold || 0) >= 500 },
  { id: 'level_5', name: 'Seasoned Warrior', desc: 'Reach level 5', check: (s) => s.party.some(h => (h.level || 1) >= 5) },
  { id: 'math_100', name: 'Math Master', desc: 'Answer 100 questions correctly', check: (s) => (s.stats.totalCorrect || 0) >= 100 },
  { id: 'full_party', name: 'Full Party', desc: 'Use all 3 classes', check: (s) => { const cls = new Set(s.party.map(h => h.cls)); return cls.size >= 3; } },
  { id: 'no_damage', name: 'Perfectionist', desc: 'Win a battle without taking damage', check: (s) => !!s.stats.perfectBattle },
];

export function checkAchievements(save) {
  const unlocked = save.stats.achievements || [];
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (!unlocked.includes(ach.id) && ach.check(save)) {
      newlyUnlocked.push(ach);
      unlocked.push(ach.id);
    }
  }
  save.stats.achievements = unlocked;
  return newlyUnlocked;
}
