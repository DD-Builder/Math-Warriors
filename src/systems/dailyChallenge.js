/**
 * Daily Challenge System
 *
 * Provides a deterministic daily challenge based on today's date.
 * Each day offers a fixed floor, hero class, and hero index so all
 * players get the same challenge. Tracks streaks for bonus rewards.
 */

export function getDailyChallenge() {
  // Use today's date as seed for deterministic daily content
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  // Rotate through floors 1-5
  const floor = (seed % 5) + 1;

  // Pick a fixed hero class based on day
  const classes = ['knight', 'wizard', 'bunny'];
  const cls = classes[seed % 3];

  // Hero index within class (0-4)
  const heroIdx = seed % 5;

  return {
    seed,
    floor,
    heroClass: cls,
    heroIndex: heroIdx,
    timeLimit: 600, // 10 minutes in seconds
    reward: { gold: 50 },
    streakBonus: { gold: 200 }, // 7-day streak bonus
  };
}

export function isDailyChallengeCompleted(save) {
  const today = getDailyChallenge().seed;
  return save.stats.lastDailyChallenge === today;
}

export function markDailyChallengeComplete(save) {
  const today = getDailyChallenge().seed;
  save.stats.lastDailyChallenge = today;

  // Track daily streak
  const yesterday = save.stats.lastDailyDate || 0;
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdaySeed = yesterdayDate.getFullYear() * 10000 + (yesterdayDate.getMonth() + 1) * 100 + yesterdayDate.getDate();

  if (yesterday === yesterdaySeed) {
    save.stats.dailyStreak = (save.stats.dailyStreak || 0) + 1;
  } else {
    save.stats.dailyStreak = 1;
  }
  save.stats.lastDailyDate = today;

  return save.stats.dailyStreak;
}
