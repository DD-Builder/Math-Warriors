/**
 * shrines — the three-beat shrine session, as a pure state machine.
 *
 * ── THE SHAPE OF A SHRINE ──────────────────────────────────────────────────
 * One per biome, and always the same three beats in the same order, so a child
 * who did the Garden shrine understands the Palace shrine before the door opens:
 *
 *   1. THE TRIAL   A physical puzzle in the shrine's little room — the same
 *                  five state machines the open-world landmarks use
 *                  (puzzles.js). Nothing is asked, nothing is typed.
 *   2. THE LOCKS   Solving the trial BUYS questions. `trialTokens` converts how
 *                  cleanly you solved it into how many locks there are, and each
 *                  lock is one question on this floor's operator.
 *   3. THE REWARD  Gold plus a permanent buff, paid once, by discovery.js.
 *
 * The two halves are one design rather than a puzzle with a quiz stapled on:
 * the physical half sets the PRICE of the maths half. A clean solve buys an
 * extra question and an extra reward tier — the only place in the whole
 * discovery economy where skill changes the payout, and it can only ever add.
 *
 * ── ONE QUESTION GENERATOR ─────────────────────────────────────────────────
 * `systems/math.js generateRatedQuestion` is the only maths source in this
 * game, and this file does not become the second one. It is called with the
 * floor's operator (from the same FLOOR_OPERATORS table the 2D maze reads) and
 * the player's adaptive grade for that operator, exactly the way MazeScene and
 * OverworldScene already call it for doors. The generator is INJECTED so the
 * tests can drive the machine deterministically without stubbing a module.
 *
 * ── KINDNESS ───────────────────────────────────────────────────────────────
 * A wrong answer never closes a shrine. It re-asks — a new question on the same
 * operator — and counts a miss, and after `MERCY_AFTER` misses the shrine drops
 * a lock rather than the child. A shrine cannot be failed; it can only be left,
 * and it is exactly where you left it when you come back.
 *
 * Plain-Node importable: no three, no phaser, no DOM. The RNG lives entirely
 * inside the injected generator.
 */
import { shrineById, shrineOperator, shrineTrial } from './discoverySpec.js';
import { initPuzzle, stepPuzzle, trialTokens, hintFor, shouldNudge, EVENTS } from './puzzles.js';

/** Where a shrine session currently is. */
export const PHASES = { TRIAL: 'trial', LOCKS: 'locks', DONE: 'done' };

/**
 * Wrong answers before the shrine forgives a lock. Deliberately generous: the
 * shrine's job is to make a child feel clever, and a five-year-old who has
 * missed three division questions in a row has stopped feeling clever.
 */
export const MERCY_AFTER = 3;

/**
 * Open a shrine. Pure — returns a fresh session; nothing is written to the save
 * until `applyReward` at the end.
 *
 * @param {string|object} shrine id or record
 * @returns {?object} session, or null for an unknown shrine
 */
export function openShrine(shrine) {
  const s = typeof shrine === 'string' ? shrineById(shrine) : shrine;
  if (!s) return null;
  const spec = shrineTrial(s);
  return {
    shrineId: s.id,
    phase: PHASES.TRIAL,
    operator: shrineOperator(s),
    floorId: s.floorId,
    trialSpec: spec,
    trial: initPuzzle(spec),
    tokens: 0,
    opened: 0,        // locks answered correctly
    misses: 0,        // wrong answers against the CURRENT lock
    totalMisses: 0,
    clean: false,     // trial solved with no resets and no wrongs
    question: null,
  };
}

/**
 * Drive the physical half. `move` is a puzzles.js move; the returned event is a
 * puzzles.js EVENT, so the FX layer switches on the same vocabulary it already
 * uses for the open-world landmarks.
 *
 * @returns {{session:object, event:string, tokens:number}} `session` is the
 *          SAME reference when nothing changed.
 */
export function stepTrial(session, move) {
  if (!session || session.phase !== PHASES.TRIAL) {
    return { session, event: EVENTS.NOOP, tokens: session?.tokens || 0 };
  }
  const { state, event } = stepPuzzle(session.trialSpec, session.trial, move);
  if (state === session.trial) return { session, event, tokens: session.tokens };

  const next = { ...session, trial: state };
  if (event === EVENTS.SOLVE) {
    next.tokens = trialTokens(session.trialSpec, state);
    next.clean = (state.resets || 0) === 0 && (state.wrongs || 0) === 0;
    next.phase = next.tokens > 0 ? PHASES.LOCKS : PHASES.DONE;
  }
  return { session: next, event, tokens: next.tokens };
}

/** The next correct physical move, once the player has genuinely struggled. */
export function trialHint(session) {
  if (!session || session.phase !== PHASES.TRIAL) return null;
  if (!shouldNudge(session.trial)) return null;
  return hintFor(session.trialSpec, session.trial);
}

/**
 * Ask the next lock. Calls the ONE question generator with this floor's
 * operator and the player's adaptive grade for it.
 *
 * @param {object} session
 * @param {object} deps `{ generate, grade }` — `generate` is
 *        systems/math.js generateRatedQuestion (injected so tests are
 *        deterministic), `grade` the adaptive grade for this operator.
 * @returns {{session:object, question:?object}}
 */
export function askLock(session, deps = {}) {
  if (!session || session.phase !== PHASES.LOCKS) return { session, question: null };
  const generate = deps.generate;
  if (typeof generate !== 'function') return { session, question: null };

  const question = generate({
    operator: session.operator,
    floor: session.floorId,
    // Later locks lean harder, the same way a streak does in battle. The
    // shrine is a small climb, not a flat wall.
    streak: session.opened,
    targetStars: session.opened >= 2 ? [3, 4] : [2, 3],
    grade: deps.grade,
  });
  // NOTE: `misses` is deliberately NOT reset here. A wrong answer re-asks the
  // same lock with a fresh question, and zeroing the count on every ask would
  // mean MERCY_AFTER could never be reached — the mercy rule would be dead code
  // and a child could be stuck at a shrine door forever. `answerLock` clears it
  // when a lock actually opens, which is the only moment a new lock begins.
  return { session: { ...session, question }, question };
}

/**
 * Does this answer match the question?
 *
 * Not every floor's answer is a number. `generateRatedQuestion` returns numeric
 * answers for +, -, *, /, mixed, geo, money and word — but FRACTION questions
 * (floor 8, which is exactly the Shrine of the Unfinished Shelf) answer with a
 * STRING like "2/3". A strict numeric compare rejects every correct fraction
 * answer, which would leave that shrine openable only by running out the mercy
 * counter three times per lock.
 *
 * So: numbers compare as numbers, everything else compares as trimmed text,
 * and a numeric string matches a numeric answer.
 */
export function matchesAnswer(question, answer) {
  if (!question) return false;
  const expected = question.answer;
  if (answer == null) return false;
  // An empty box is not an answer. Number('') is 0, so without this a child who
  // submits nothing would be "correct" on every question whose answer is zero.
  if (typeof answer === 'string' && answer.trim() === '') return false;

  if (typeof expected === 'number') {
    const given = typeof answer === 'string' ? Number(answer.trim()) : answer;
    return typeof given === 'number' && Number.isFinite(given) && given === expected;
  }
  const norm = (v) => String(v).trim().toLowerCase().replace(/\s+/g, '');
  if (typeof expected === 'string') {
    if (norm(answer) === norm(expected)) return true;
    // "0.5" answering "1/2" is still right, when both sides are readable.
    const asNum = Number(String(answer).trim());
    const expNum = Number(expected);
    return Number.isFinite(asNum) && Number.isFinite(expNum) && asNum === expNum;
  }
  return false;
}

/**
 * Answer the current lock.
 *
 * Correct opens it. Wrong re-asks (the caller calls `askLock` again) and counts
 * a miss; on the MERCY_AFTER'th miss the lock opens anyway, flagged `mercy` so
 * the presentation can be gentle about it rather than triumphant.
 *
 * @returns {{session:object, correct:boolean, mercy:boolean, done:boolean}}
 */
export function answerLock(session, answer) {
  if (!session || session.phase !== PHASES.LOCKS || !session.question) {
    return { session, correct: false, mercy: false, done: false };
  }
  const correct = matchesAnswer(session.question, answer);

  if (correct) {
    const opened = session.opened + 1;
    const done = opened >= session.tokens;
    return {
      session: { ...session, opened, misses: 0, question: null, phase: done ? PHASES.DONE : PHASES.LOCKS },
      correct: true, mercy: false, done,
    };
  }

  const misses = session.misses + 1;
  const totalMisses = session.totalMisses + 1;
  if (misses >= MERCY_AFTER) {
    const opened = session.opened + 1;
    const done = opened >= session.tokens;
    return {
      session: { ...session, opened, misses: 0, totalMisses, question: null, phase: done ? PHASES.DONE : PHASES.LOCKS },
      correct: false, mercy: true, done,
    };
  }
  return {
    session: { ...session, misses, totalMisses, question: null },
    correct: false, mercy: false, done: false,
  };
}

/** Progress through the shrine as a whole, for the door's opening rings. */
export function shrineProgress(session) {
  if (!session) return { phase: PHASES.TRIAL, done: 0, total: 1, pct: 0 };
  if (session.phase === PHASES.TRIAL) return { phase: PHASES.TRIAL, done: 0, total: 1, pct: 0 };
  const total = Math.max(1, session.tokens);
  const done = Math.min(session.opened, total);
  return { phase: session.phase, done, total, pct: done / total };
}

/** True once every lock is open and the reward is owed. */
export function isShrineComplete(session) {
  return !!session && session.phase === PHASES.DONE && session.opened >= session.tokens;
}

/**
 * What this run of the shrine is worth. The base reward, plus the clean-solve
 * bonus — which is additive gold only, never a second buff, so a child who
 * fumbled the trial still gets the permanent thing that matters.
 *
 * @returns {?object} a reward block for discovery.js `completeTrial`
 */
export function shrineReward(session) {
  if (!isShrineComplete(session)) return null;
  const s = shrineById(session.shrineId);
  if (!s) return null;
  const base = s.reward || {};
  const bonus = session.clean ? Math.round((base.gold || 0) * 0.25) : 0;
  return { ...base, gold: (base.gold || 0) + bonus };
}
