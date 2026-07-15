/**
 * Math Coach — the pure logic behind the battle's help ladder and the
 * scaffolded second chance. No Phaser here; BattleScene drives the UI.
 *
 * Two independent supports:
 *   • BEFORE answering — a per-question hint ladder (tip → scaffold),
 *     each rung trading some attack power for help.
 *   • AFTER a wrong pick — a one-time 50/50: two wrong buttons dim so
 *     the child gets a real second try (kid-friendly, still teaches).
 */

import { getWhy, getScaffold } from './hints.js';

export const HINT_TIERS = { NONE: 0, TIP: 1, SCAFFOLD: 2 };

const MAX_TIER = HINT_TIERS.SCAFFOLD;

/** Fresh hint state for one question. */
export function createCoachQuestionState() {
  return { tier: HINT_TIERS.NONE };
}

/**
 * Advance the hint ladder one rung and return what to show:
 *   tier 1 → a short strategy tip (getWhy)
 *   tier 2 → the worked scaffold with the answer masked (getScaffold)
 * Returns null once the child has already reached the top rung.
 */
export function takeHint(state, question) {
  if (!state || state.tier >= MAX_TIER) return null;
  state.tier += 1;
  const text = state.tier === HINT_TIERS.TIP ? getWhy(question) : getScaffold(question);
  return { tier: state.tier, text };
}

/** Attack-power multiplier for answering after using hints up to `tier`. */
export function hintDamageMult(tier) {
  if (tier >= HINT_TIERS.SCAFFOLD) return 0.5;
  if (tier === HINT_TIERS.TIP) return 0.75;
  return 1;
}

/**
 * Blend a momentum gain toward its full value based on hint use: no
 * hints earn the full swing, a tip earns 60%, a scaffold 30%. At tier 0
 * this is the identity (returns newM). Result clamped to [0, 1].
 */
export function applyHintMomentum(oldM, newM, tier) {
  const k = tier >= HINT_TIERS.SCAFFOLD ? 0.3 : tier === HINT_TIERS.TIP ? 0.6 : 1;
  const blended = oldM + (newM - oldM) * k;
  return Math.max(0, Math.min(1, blended));
}

/** Attack-power multiplier applied when a wrong answer is rescued on retry. */
export function retryDamageMult() {
  return 0.5;
}

// Parse a choice value to a number for distance math; fraction strings
// like '3/8' become their decimal value so "farthest" is meaningful.
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
    if (m) { const d = Number(m[2]); return d === 0 ? NaN : Number(m[1]) / d; }
    const n = Number(v);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
}

/**
 * May we offer a scaffolded second chance for this wrong answer?
 * No if the child already retried this question, the hard timer
 * auto-answered it, or a consumed button has left too few distractors
 * to carve out a fair 50/50 (we need the pick + two other distractors,
 * so a real distractor stays lit next to the answer).
 */
export function retryEligible(question, ctx = {}) {
  if (ctx.retryUsed) return false;
  if (ctx.timedOut) return false;
  const choices = question?.choices;
  if (!Array.isArray(choices) || choices.length < 4) return false;
  const correct = question.correctIndex;

  let liveDistractors = 0;
  for (let i = 0; i < choices.length; i++) if (i !== correct) liveDistractors++;

  const consumed = ctx.consumedButtonIdx;
  if (consumed != null && consumed !== correct && consumed >= 0 && consumed < choices.length) {
    liveDistractors -= 1;
  }
  // Need the pick + two more distractors so that dimming pick + farthest
  // still leaves one distractor lit beside the answer (a true 50/50).
  return liveDistractors >= 3;
}

/**
 * Which two buttons to dim for the retry: ALWAYS the child's own wrong
 * pick, plus the remaining distractor FARTHEST from the answer (so the
 * lit pair is the answer and the CLOSEST distractor — a genuine choice).
 * Never the correct answer. Fraction strings compare by value; ties go
 * to the lower index.
 */
export function eliminateForRetry(question, pickedIndex) {
  const { choices, correctIndex, answer } = question;
  const ansVal = toNumber(answer);
  let farIdx = -1, farDist = -Infinity;
  for (let i = 0; i < choices.length; i++) {
    if (i === correctIndex || i === pickedIndex) continue;
    const d = Math.abs(toNumber(choices[i]) - ansVal);
    // strict > keeps the FIRST (lowest-index) winner on ties
    if (d > farDist) { farDist = d; farIdx = i; }
  }
  return farIdx === -1 ? [pickedIndex] : [pickedIndex, farIdx];
}
