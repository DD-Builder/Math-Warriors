/**
 * Skill mastery tracking — per-operator proficiency based on rolling accuracy.
 *
 * Mastery levels:
 *   Learning   (< 65% accuracy or < 10 attempts)
 *   Practicing (65-84% accuracy, 10+ attempts)
 *   Mastered   (85%+ accuracy, 20+ attempts)
 */

const SKILLS = [
  { id: '+',     label: 'Addition',       floor: 1, standard: '1.OA.6' },
  { id: '-',     label: 'Subtraction',    floor: 2, standard: '2.OA.2' },
  { id: '*',     label: 'Multiplication', floor: 3, standard: '3.OA.7' },
  { id: '/',     label: 'Division',       floor: 4, standard: '3.OA.7' },
  { id: 'frac',  label: 'Fractions',      floor: 5, standard: '4.NF.1' },
  { id: 'geo',   label: 'Geometry',       floor: 6, standard: '3.G.1' },
  { id: 'money', label: 'Money Math',     floor: 7, standard: '2.MD.8' },
  { id: 'word',  label: 'Word Problems',  floor: 8, standard: '4.OA.3' },
];

const WINDOW = 30;

function ensureSkillStats(save) {
  if (!save.skillStats) save.skillStats = {};
  for (const s of SKILLS) {
    if (!save.skillStats[s.id]) {
      save.skillStats[s.id] = { correct: 0, total: 0, recent: [] };
    }
  }
  return save.skillStats;
}

export function recordSkillAnswer(save, operator, correct) {
  const stats = ensureSkillStats(save);
  const key = operator || '+';
  const skill = stats[key];
  if (!skill) return;
  skill.total++;
  if (correct) skill.correct++;
  skill.recent.push(correct ? 1 : 0);
  if (skill.recent.length > WINDOW) skill.recent.shift();
}

export function getSkillMastery(save, skillId) {
  const stats = ensureSkillStats(save);
  const skill = stats[skillId];
  if (!skill || skill.total < 10) return { level: 'learning', accuracy: 0, total: skill?.total || 0 };
  const recent = skill.recent;
  const accuracy = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  if (accuracy >= 0.85 && skill.total >= 20) return { level: 'mastered', accuracy, total: skill.total };
  if (accuracy >= 0.65) return { level: 'practicing', accuracy, total: skill.total };
  return { level: 'learning', accuracy, total: skill.total };
}

export function getAllMastery(save) {
  return SKILLS.map(s => ({
    ...s,
    ...getSkillMastery(save, s.id),
  }));
}

export function getMasteryColor(level) {
  if (level === 'mastered') return 0x40a040;
  if (level === 'practicing') return 0xd0a020;
  return 0xc04040;
}

export function getMasteryLabel(level) {
  if (level === 'mastered') return 'MASTERED';
  if (level === 'practicing') return 'PRACTICING';
  return 'LEARNING';
}
