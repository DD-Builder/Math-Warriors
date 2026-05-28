/**
 * Difficulty rating system
 *
 * Rates math questions on a 1-5 star scale based on operator complexity,
 * operand size relative to grade range, and format. Stars drive damage
 * multipliers: harder problems reward more damage.
 *
 * Pure module — no Phaser dependencies, no circular imports.
 */

export const DIFFICULTY_MULTIPLIERS = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.3,
  5: 1.6,
};

// Grade max operands (mirrors GRADE_TABLE in math.js — kept separate to avoid circular import)
const GRADE_MAX = { 0: 5, 1: 8, 2: 15, 3: 40, 4: 80, 5: 120 };

const OP_WEIGHT = { '+': 1, '-': 2, '*': 3, '/': 4 };

/**
 * Rate a question's difficulty on a 1-5 star scale.
 *
 * @param {object} question - A question object from generateQuestion()
 * @param {number} grade    - Player's grade level (0-5)
 * @returns {number}        - Star rating 1-5
 */
export function rateQuestion(question, grade) {
  if (question.format && question.format !== 'standard' && question.format !== 'missing') {
    if (question.format === 'fraction') return 4;
    if (question.format === 'geometry') return 3;
    if (question.format === 'money') return 3;
    if (question.format === 'word') return 4;
    return 3;
  }

  let score = 0;

  score += (OP_WEIGHT[question.op] ?? 1) - 1;

  const gradeMax = GRADE_MAX[grade] ?? 40;
  const maxOperand = Math.max(Math.abs(question.a), Math.abs(question.b));
  const sizeRatio = maxOperand / gradeMax;
  if (sizeRatio > 0.75) score += 3;
  else if (sizeRatio > 0.50) score += 2;
  else if (sizeRatio > 0.25) score += 1;

  if (question.format === 'missing') score += 2;

  const answer = typeof question.answer === 'number' ? question.answer : 0;
  if (answer > 50) score += 1;

  if (score <= 1) return 1;
  if (score <= 2) return 2;
  if (score <= 4) return 3;
  if (score <= 6) return 4;
  return 5;
}

/**
 * Get the damage multiplier for a given star rating.
 * @param {number} stars - 1-5 star rating
 * @returns {number}
 */
export function getDifficultyMultiplier(stars) {
  return DIFFICULTY_MULTIPLIERS[stars] ?? 1.0;
}
