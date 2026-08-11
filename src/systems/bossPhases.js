/**
 * Boss phase system — the "he's getting serious" layer.
 *
 * WHY: v1 bosses were a single flat state. A child fought the same
 * creature at 100% HP and at 5% HP, so a nine-floor game read as nine
 * reskins of the Briar King and the back half felt WEAKER than the
 * front. A boss now crosses two visible thresholds (60% and 30% HP)
 * and TRANSFORMS at each: new art state, new arena, a faster special
 * cadence, a heavier hit, and a line of dialogue. Escalation has to be
 * legible to a five-year-old, so every transition fires all four
 * channels at once (art + arena + attack pattern + dramatic beat)
 * instead of quietly nudging a number.
 *
 * PURE DATA + PURE FUNCTIONS. No Phaser, no canvas — BattleScene reads
 * this to decide *what* changes; bossRigs.js decides how it looks.
 * Every colour named here is a PAPER token: shadows stay teal-tinted,
 * flashes stay warm. Awe, never horror.
 */

import { PAPER } from '../config.js';

/**
 * HP fractions at which a boss transforms, high → low. Index 0 opens
 * phase 2, index 1 opens phase 3. Kept as data so tests and the
 * question-count fallback in BattleScene agree on one source of truth.
 */
export const PHASE_THRESHOLDS = [0.6, 0.3];

/** Highest phase any boss can reach. Three acts: arrive, commit, finish. */
export const MAX_PHASE = 3;

/**
 * Which phase an HP fraction belongs to (1, 2 or 3).
 * @param {number} hp
 * @param {number} maxHp
 */
export function phaseForHp(hp, maxHp) {
  if (!(maxHp > 0)) return 1;
  const frac = Math.max(0, hp) / maxHp;
  if (frac <= PHASE_THRESHOLDS[1]) return 3;
  if (frac <= PHASE_THRESHOLDS[0]) return 2;
  return 1;
}

/**
 * Fallback pacing: a lucky crit streak can skip a threshold entirely.
 * These are the correct-answer counts at which a phase becomes "due"
 * even if HP never sat inside the band. Without this, a strong party
 * could beat the final boss having seen zero transformations.
 */
export const PHASE_QUESTION_FALLBACK = [7, 13];

/** True when `phase` should have opened by now given answers so far. */
export function phaseDueByQuestions(questionCount, phase) {
  const need = PHASE_QUESTION_FALLBACK[phase - 2];
  return need !== undefined && questionCount >= need;
}

/**
 * Per-phase combat cadence. The special is the boss's whole identity,
 * so escalation means seeing it MORE OFTEN and harder — not a stat
 * nudge the child can't perceive.
 *
 *   phase 1  every 3rd boss turn   70% damage per head  (as shipped)
 *   phase 2  every 2nd boss turn   78% damage per head
 *   phase 3  every 2nd boss turn   88% damage per head + a second wave
 *
 * `waves` is read by the rigs: phase 3 specials replay their payload
 * once more, which is what sells "he is not holding back any more".
 */
export const PHASE_CADENCE = {
  1: { specialEvery: 3, damageMul: 0.70, waves: 1, shakeMul: 1.00, windupMs: 2200 },
  2: { specialEvery: 2, damageMul: 0.78, waves: 1, shakeMul: 1.25, windupMs: 2000 },
  3: { specialEvery: 2, damageMul: 0.88, waves: 2, shakeMul: 1.55, windupMs: 1800 },
};

/** Cadence for a phase, clamped to the table. */
export function phaseCadence(phase) {
  return PHASE_CADENCE[Math.max(1, Math.min(MAX_PHASE, phase | 0))] || PHASE_CADENCE[1];
}

/**
 * Counter reward. Correct answers during the telegraph window charge a
 * guard; the more the child lands, the smaller the incoming special.
 * Never reaches zero — the spectacle must still land, it just stops
 * hurting. Index = sparks (0..3+).
 */
export const COUNTER_MITIGATION = [1.0, 0.75, 0.62, 0.5];

/** Damage multiplier for `sparks` correct answers inside the window. */
export function counterMitigation(sparks) {
  const n = Math.max(0, Math.min(COUNTER_MITIGATION.length - 1, sparks | 0));
  return COUNTER_MITIGATION[n];
}

/**
 * Per-boss transformation table. Each phase entry carries everything
 * the dramatic beat needs:
 *   title  — the banner a child reads ("THE BRIAR CROWN")
 *   line   — what the boss says; playful menace, never frightening
 *   flash  — full-screen wash colour (PAPER token)
 *   aura   — the rim/glow colour the boss gains from here on
 *   tell   — one short phrase describing the new attack pattern, shown
 *            under the title so the escalation is *stated*, not implied
 */
export const BOSS_PHASE_TABLE = {
  briarking: {
    2: { title: 'THE BRIAR CROWN', line: 'You pruned me? Then I shall GROW!', flash: PAPER.sage, aura: PAPER.leaf, tell: 'Thorns come in twos now!' },
    3: { title: 'BLOOM OF THE KING', line: 'Fine! Take my WHOLE garden!', flash: PAPER.peach, aura: PAPER.coral, tell: 'The whole garden at once!' },
  },
  pressure: {
    2: { title: 'THE DEEP OPENS', line: 'Down we go! Deeper! Deeper!', flash: PAPER.sky, aura: PAPER.tealL, tell: 'The basin is flooding!' },
    3: { title: 'FULL FATHOM', line: 'The whole sea is my hat now!', flash: PAPER.tealL, aura: PAPER.teal, tell: 'Two waves, back to back!' },
  },
  skywhale: {
    2: { title: 'STORM SONG', line: 'Hear my song? It has THUNDER in it!', flash: PAPER.sky, aura: PAPER.lavender, tell: 'It dives twice as often!' },
    3: { title: 'THE SKY BREAKS', line: 'Sing louder, little ones! LOUDER!', flash: PAPER.white, aura: PAPER.sky, tell: 'Thunder, then thunder again!' },
  },
  pyroclast: {
    2: { title: 'THE CALDERA CRACKS', line: 'You split my fire? I have MORE!', flash: PAPER.orange, aura: PAPER.coral, tell: 'The floor is cracking open!' },
    3: { title: 'CORE MELTDOWN', line: 'Then take ALL of it at once!', flash: PAPER.gold, aura: PAPER.coralD, tell: 'Two meteor showers!' },
  },
  absolutezero: {
    2: { title: 'THE FROST THRONE', line: 'Chilly? I am only warming up. Ha!', flash: PAPER.white, aura: PAPER.sky, tell: 'Ice pillars close in!' },
    3: { title: 'TRUE ZERO', line: 'Nothing moves now. Nothing but YOU.', flash: PAPER.white, aura: PAPER.tealL, tell: 'A whiteout, then a shatter!' },
  },
  theprism: {
    2: { title: 'SECOND FACET', line: 'Look again! I am many at once!', flash: PAPER.lavender, aura: PAPER.lavender, tell: 'The beam splits five ways!' },
    3: { title: 'TOTAL REFRACTION', line: 'Every angle! Every colour! ALL of me!', flash: PAPER.white, aura: PAPER.lavenderD, tell: 'Every colour fires twice!' },
  },
  counterfeiter: {
    2: { title: 'THE FALSE MINT', line: 'Double or nothing, little counters!', flash: PAPER.gold, aura: PAPER.gold, tell: 'Twice the coins!' },
    3: { title: 'PRICELESS', line: 'I will print until the numbers run out!', flash: PAPER.gold, aura: PAPER.orange, tell: 'A whole coin storm!' },
  },
  theparadox: {
    2: { title: 'THE PAGES TURN', line: 'This story has another chapter!', flash: PAPER.sand, aura: PAPER.tealL, tell: 'The library is storming!' },
    3: { title: 'THE LAST PAGE', line: 'Read me backwards! I dare you!', flash: PAPER.cream, aura: PAPER.teal, tell: 'Two eclipses in one turn!' },
  },
  // The final boss is the only three-ACT fight: each phase renames the
  // creature, because it is being solved rather than beaten.
  theorem: {
    2: { title: 'THE SECOND PROOF', line: 'Your answer was... correct. Again.', flash: PAPER.lavender, aura: PAPER.lavender, tell: 'The proof rewrites itself!' },
    3: { title: 'THE FINAL LINE', line: 'One line remains. Solve me.', flash: PAPER.gold, aura: PAPER.gold, tell: 'Everything, all at once!' },
  },
};

/** Phase flavour for a boss, or a themed default for unlisted ids. */
export function getPhaseBeat(bossId, phase) {
  const row = BOSS_PHASE_TABLE[bossId];
  const beat = row && row[phase];
  if (beat) return beat;
  return {
    title: phase >= 3 ? 'NO HOLDING BACK' : 'GETTING SERIOUS',
    line: phase >= 3 ? 'Now you will see everything!' : 'Oh, you are GOOD. Let us play properly.',
    flash: PAPER.cream,
    aura: PAPER.gold,
    tell: phase >= 3 ? 'Everything, all at once!' : 'It attacks more often!',
  };
}

/**
 * How much bigger the boss reads at each phase. Applied on top of the
 * fitted battle scale, so a boss that already fills its zone only
 * swells a little — the arena and aura carry the rest.
 */
export const PHASE_SCALE = { 1: 1.0, 2: 1.06, 3: 1.12 };

/** Body scale multiplier for a phase. */
export function phaseScale(phase) {
  return PHASE_SCALE[Math.max(1, Math.min(MAX_PHASE, phase | 0))] ?? 1;
}
