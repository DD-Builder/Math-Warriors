/**
 * Daily quest system — 3 quests per day, refreshing at midnight.
 * Quests are deterministic from the date seed so all players get the same set.
 */

const QUEST_POOL = [
  { id: 'correct_10',  label: 'Answer 10 questions correctly',   type: 'correct',   target: 10, reward: 15,  tier: 'easy' },
  { id: 'correct_20',  label: 'Answer 20 questions correctly',   type: 'correct',   target: 20, reward: 30,  tier: 'easy' },
  { id: 'win_1',       label: 'Win a battle',                    type: 'wins',      target: 1,  reward: 20,  tier: 'easy' },
  { id: 'win_3',       label: 'Win 3 battles',                   type: 'wins',      target: 3,  reward: 40,  tier: 'medium' },
  { id: 'streak_3',    label: 'Get a 3x streak',                 type: 'streak',    target: 3,  reward: 25,  tier: 'easy' },
  { id: 'streak_5',    label: 'Get a 5x streak',                 type: 'streak',    target: 5,  reward: 50,  tier: 'medium' },
  { id: 'streak_8',    label: 'Get an 8x streak',                type: 'streak',    target: 8,  reward: 80,  tier: 'hard' },
  { id: 'no_potion',   label: 'Win a battle without potions',    type: 'nopotion',  target: 1,  reward: 40,  tier: 'medium' },
  { id: 'perfect',     label: 'Win without taking damage',       type: 'perfect',   target: 1,  reward: 60,  tier: 'hard' },
  { id: 'explore',     label: 'Complete a maze floor',           type: 'floor',     target: 1,  reward: 50,  tier: 'medium' },
  { id: 'gold_50',     label: 'Earn 50 gold',                    type: 'gold',      target: 50, reward: 25,  tier: 'easy' },
  { id: 'super_1',     label: 'Use a super move',                type: 'super',     target: 1,  reward: 35,  tier: 'medium' },
];

function getDaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seededShuffle(arr, seed) {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function getDailyQuests() {
  const seed = getDaySeed();
  const easy = QUEST_POOL.filter(q => q.tier === 'easy');
  const medium = QUEST_POOL.filter(q => q.tier === 'medium');
  const hard = QUEST_POOL.filter(q => q.tier === 'hard');
  const shuffledEasy = seededShuffle(easy, seed);
  const shuffledMedium = seededShuffle(medium, seed + 1);
  const shuffledHard = seededShuffle(hard, seed + 2);
  return [shuffledEasy[0], shuffledMedium[0], shuffledHard[0]];
}

export function getQuestProgress(save) {
  const today = getDaySeed();
  const state = save.questState || {};
  if (state.seed !== today) {
    return { seed: today, quests: getDailyQuests().map(q => ({ id: q.id, progress: 0, claimed: false })) };
  }
  return state;
}

export function updateQuestProgress(save, type, value = 1) {
  const state = getQuestProgress(save);
  const quests = getDailyQuests();
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.quests[i];
    if (!p || p.claimed) continue;
    if (q.type === type) {
      if (type === 'streak' || type === 'gold') {
        p.progress = Math.max(p.progress, value);
      } else {
        p.progress += value;
      }
    }
  }
  save.questState = state;
}

export function claimQuestReward(save, questIndex) {
  const state = getQuestProgress(save);
  const quests = getDailyQuests();
  const p = state.quests[questIndex];
  const q = quests[questIndex];
  if (!p || !q || p.claimed) return 0;
  if (p.progress < q.target) return 0;
  p.claimed = true;
  save.questState = state;
  save.gold = (save.gold || 0) + q.reward;
  return q.reward;
}

export function getLoginReward(save) {
  const today = getDaySeed();
  if (save.lastLoginDay === today) return null;
  save.lastLoginDay = today;

  const yesterday = save.lastLoginDay2 || 0;
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdaySeed = yesterdayDate.getFullYear() * 10000 + (yesterdayDate.getMonth() + 1) * 100 + yesterdayDate.getDate();

  if (yesterday === yesterdaySeed) {
    save.loginStreak = (save.loginStreak || 0) + 1;
  } else {
    save.loginStreak = 1;
  }
  save.lastLoginDay2 = today;

  const day = ((save.loginStreak - 1) % 7) + 1;
  const rewards = [
    { day: 1, type: 'gold', amount: 10, label: '10 Gold' },
    { day: 2, type: 'gold', amount: 15, label: '15 Gold' },
    { day: 3, type: 'potion', amount: 1, label: '1 Potion' },
    { day: 4, type: 'gold', amount: 25, label: '25 Gold' },
    { day: 5, type: 'potion', amount: 2, label: '2 Potions' },
    { day: 6, type: 'gold', amount: 40, label: '40 Gold' },
    { day: 7, type: 'gold', amount: 100, label: '100 Gold!' },
  ];
  const reward = rewards[day - 1];
  if (reward.type === 'gold') save.gold = (save.gold || 0) + reward.amount;
  else if (reward.type === 'potion') save.potions = (save.potions || 0) + reward.amount;
  return { ...reward, streakDay: day, totalStreak: save.loginStreak };
}

export function allQuestsComplete(save) {
  const state = getQuestProgress(save);
  const quests = getDailyQuests();
  return state.quests.every((p, i) => p.claimed || p.progress >= quests[i].target);
}
