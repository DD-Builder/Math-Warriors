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

export { SKILLS };

// ────────────────────────────────────────────────────────────────
// ADAPTIVE MASTERY ENGINE (Upgrade 1)
//
// The static grade pick is only a STARTING estimate. From there, each
// skill carries its own effective grade band in save.adaptiveLevel,
// which climbs when the child masters the current level and eases when
// they persistently struggle. Question generation reads THIS per-skill
// grade, so difficulty tracks the individual child per concept.
// ────────────────────────────────────────────────────────────────

const MIN_GRADE = 0;
const MAX_GRADE = 5;

function clampGrade(g) {
  const n = Math.round(Number(g));
  if (Number.isNaN(n)) return 3;
  return Math.max(MIN_GRADE, Math.min(MAX_GRADE, n));
}

/** Map any operator/concept token to a tracked skill id ('mixed' or null). */
function skillIdFor(operator) {
  if (!operator) return null;
  if (operator === 'mixed') return 'mixed';
  return SKILLS.some(s => s.id === operator) ? operator : null;
}

/** Ensure save.adaptiveLevel exists, seeded from the chosen grade. */
export function ensureAdaptiveLevel(save) {
  const base = clampGrade(save.grade ?? 3);
  if (!save.adaptiveLevel) save.adaptiveLevel = {};
  for (const s of SKILLS) {
    if (typeof save.adaptiveLevel[s.id] !== 'number') save.adaptiveLevel[s.id] = base;
  }
  return save.adaptiveLevel;
}

/**
 * Effective grade for a skill/concept, used to size question difficulty.
 * 'mixed' averages the component skills; unknown ops fall back to grade.
 */
export function getAdaptiveGrade(save, operator) {
  const levels = ensureAdaptiveLevel(save);
  const id = skillIdFor(operator);
  if (id === 'mixed') {
    const vals = SKILLS.map(s => levels[s.id]);
    return clampGrade(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  if (id && typeof levels[id] === 'number') return clampGrade(levels[id]);
  return clampGrade(save.grade ?? 3);
}

/**
 * After an answer is recorded, adjust the skill's adaptive level.
 * Returns { changed, direction:'up'|'down', newLevel, skillId, label }
 * so callers can celebrate a promotion (Upgrade 9). Promotion/demotion
 * clears the recent window so the child must re-demonstrate at the new
 * level (prevents rapid oscillation).
 */
export function updateAdaptiveLevel(save, operator) {
  const id = skillIdFor(operator);
  if (!id || id === 'mixed') return { changed: false };
  const levels = ensureAdaptiveLevel(save);
  const stats = ensureSkillStats(save);
  const skill = stats[id];
  if (!skill) return { changed: false };
  const cur = levels[id];
  const m = getSkillMastery(save, id);

  // Promote: mastered the current band with room to grow.
  if (m.level === 'mastered' && cur < MAX_GRADE) {
    levels[id] = cur + 1;
    skill.recent = [];
    return { changed: true, direction: 'up', newLevel: levels[id], skillId: id, label: labelFor(id) };
  }
  // Demote: persistently struggling (enough fresh attempts, low accuracy).
  if (skill.recent.length >= 12 && m.accuracy < 0.45 && cur > MIN_GRADE) {
    levels[id] = cur - 1;
    skill.recent = [];
    return { changed: true, direction: 'down', newLevel: levels[id], skillId: id, label: labelFor(id) };
  }
  return { changed: false };
}

function labelFor(id) {
  const s = SKILLS.find(x => x.id === id);
  return s ? s.label : id;
}

// ────────────────────────────────────────────────────────────────
// MASTERY-DRIVEN PRACTICE LOOP (Upgrade 5)
//
// Feeds mastery data back into the game: the skills a child is weakest
// at get more reps, and a "focus on this" recommendation is surfaced so
// practice is directed where it helps most.
// ────────────────────────────────────────────────────────────────

const MASTERY_RANK = { learning: 0, practicing: 1, mastered: 2 };

/**
 * The skill most in need of practice, restricted to `candidates` (skill
 * ids) when provided. Prefers skills with attempts and low mastery;
 * breaks ties by lower accuracy. Returns null if nothing qualifies.
 */
export function getWeakestSkill(save, candidates = null) {
  const pool = SKILLS.filter(s => !candidates || candidates.includes(s.id));
  let best = null, bestScore = Infinity;
  for (const s of pool) {
    const m = getSkillMastery(save, s.id);
    if (m.total < 3) continue; // not enough signal to call it weak
    if (m.level === 'mastered') continue; // already solid
    const score = MASTERY_RANK[m.level] * 10 + m.accuracy; // lower = weaker
    if (score < bestScore) { bestScore = score; best = { ...s, ...m }; }
  }
  return best;
}

/**
 * A short "focus on X" recommendation, or null if everything looks
 * healthy (or there isn't enough data yet).
 */
export function getPracticeRecommendation(save) {
  const weak = getWeakestSkill(save);
  if (!weak) return null;
  return { skillId: weak.id, label: weak.label, standard: weak.standard, floor: weak.floor, accuracy: weak.accuracy };
}

/**
 * For a floor whose operator is 'mixed', choose which concept to serve:
 * bias toward the weakest component skill a share of the time, otherwise
 * random among the components. Returns an operator id.
 */
export function biasedMixedOperator(save, components, biasChance = 0.45) {
  if (Math.random() < biasChance) {
    const weak = getWeakestSkill(save, components);
    if (weak) return weak.id;
  }
  return components[Math.floor(Math.random() * components.length)];
}
