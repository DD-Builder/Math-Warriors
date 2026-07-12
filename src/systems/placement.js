/**
 * Diagnostic placement (Upgrade 4).
 *
 * Instead of a parent guessing a grade, a short adaptive warm-up probes
 * the core operators at escalating difficulty and seeds the child's
 * per-skill adaptive level (and an overall starting grade).
 */

export const PLACEMENT_PROBES = [
  { skill: '+', grade: 1 },
  { skill: '-', grade: 1 },
  { skill: '+', grade: 3 },
  { skill: '*', grade: 2 },
  { skill: '-', grade: 3 },
  { skill: '*', grade: 4 },
  { skill: '/', grade: 3 },
  { skill: '/', grade: 5 },
];

const ALL_SKILLS = ['+', '-', '*', '/', 'frac', 'geo', 'money', 'word'];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

/**
 * Turn placement responses into a starting grade + per-skill levels.
 * @param {{skill:string, grade:number, correct:boolean}[]} responses
 */
export function scorePlacement(responses) {
  const bySkill = {};
  for (const r of responses || []) {
    const d = bySkill[r.skill] || (bySkill[r.skill] = { maxPass: null, minFail: null });
    if (r.correct) d.maxPass = Math.max(d.maxPass ?? -1, r.grade);
    else d.minFail = Math.min(d.minFail ?? 99, r.grade);
  }

  const levels = {};
  for (const [skill, d] of Object.entries(bySkill)) {
    let lvl;
    if (d.maxPass != null) {
      lvl = d.maxPass;
      if (d.minFail != null) lvl = Math.min(lvl, d.minFail - 1);
    } else {
      lvl = (d.minFail ?? 1) - 1;
    }
    levels[skill] = clamp(lvl, 0, 5);
  }

  const core = ['+', '-', '*', '/'].map(s => levels[s]).filter(v => v != null);
  const grade = core.length ? clamp(core.reduce((a, b) => a + b, 0) / core.length, 0, 5) : 3;

  const adaptiveLevel = {};
  for (const id of ALL_SKILLS) adaptiveLevel[id] = levels[id] != null ? levels[id] : grade;

  return { grade, adaptiveLevel };
}

/** Apply a placement result to a save. */
export function applyPlacement(save, result) {
  save.grade = result.grade;
  save.adaptiveLevel = { ...result.adaptiveLevel };
  save.placementDone = true;
  return save;
}
