/**
 * Persistent spaced-repetition review queue (Upgrade 2).
 *
 * The old spaced-rep lived in a module-global array that vanished on
 * reload and silently bled across floors. This replaces it with an
 * SM-2-style queue stored ON THE SAVE (save.problemHistory), so a fact
 * a child missed on Tuesday genuinely comes back on Thursday.
 *
 * Each item carries an ease factor and an interval; a miss resets it to
 * "due almost immediately," a correct review pushes it further out until
 * it's learned and retired. Scheduling is measured in a monotonic review
 * clock (one tick per question shown) rather than wall-clock, so it works
 * the same across sessions and pauses.
 */

import { generateDistractors } from './math.js';

const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 2.7;
const LEARNED_INTERVAL = 40; // once an item spaces this far out, retire it
const MAX_QUEUE = 60;

/** Stable identity for a problem/fact. */
export function reviewKey(q) {
  if (!q) return '';
  if (typeof q.answer === 'number' && q.op && q.a != null && q.b != null) {
    return `${q.op}:${q.a}:${q.b}`;
  }
  return `${q.op || q.format || 'x'}:${(q.text || String(q.answer)).slice(0, 48)}`;
}

function ensure(save) {
  if (!Array.isArray(save.problemHistory)) save.problemHistory = [];
  if (typeof save.reviewClock !== 'number') save.reviewClock = 0;
  return save.problemHistory;
}

/** Advance the review clock — call once per question presented. */
export function tickReview(save) {
  ensure(save);
  save.reviewClock++;
}

/**
 * Update the schedule for a problem after it's answered.
 * Wrong → schedule it back very soon; right → space it out (or retire).
 */
export function scheduleReview(save, q, correct) {
  const queue = ensure(save);
  const key = reviewKey(q);
  if (!key) return;
  let item = queue.find(it => it.key === key);

  if (!correct) {
    const snap = {
      op: q.op, a: q.a, b: q.b, answer: q.answer,
      format: q.format, text: q.text,
      choices: Array.isArray(q.choices) ? q.choices.slice() : undefined,
    };
    if (item) {
      item.ease = Math.max(MIN_EASE, item.ease - 0.2);
      item.interval = 1;
      item.reps = 0;
      item.lapses = (item.lapses || 0) + 1;
      item.due = save.reviewClock + 1;
      item.snap = snap;
    } else {
      queue.push({ key, ease: START_EASE, interval: 1, reps: 0, lapses: 1, due: save.reviewClock + 1, snap });
      if (queue.length > MAX_QUEUE) queue.shift();
    }
    return;
  }

  if (!item) return; // correct answer to an untracked fact — nothing to schedule
  item.reps = (item.reps || 0) + 1;
  item.interval = item.reps === 1 ? 2 : item.reps === 2 ? 4 : Math.round(item.interval * item.ease);
  item.ease = Math.min(MAX_EASE, item.ease + 0.1);
  item.due = save.reviewClock + item.interval;
  if (item.interval >= LEARNED_INTERVAL) {
    const i = queue.indexOf(item);
    if (i >= 0) queue.splice(i, 1); // learned — retire it
  }
}

/** The most-overdue item due now, or null. */
export function nextReview(save) {
  const queue = ensure(save);
  let best = null;
  for (const it of queue) {
    if (it.due <= save.reviewClock) {
      if (!best || it.due < best.due) best = it;
    }
  }
  return best;
}

/** How many items are currently scheduled. */
export function reviewCount(save) {
  return ensure(save).length;
}

/** Rebuild a full, freshly-shuffled question from a scheduled item. */
export function buildReviewQuestion(item) {
  const s = item.snap;
  let choices;
  if (typeof s.answer === 'number') {
    choices = shuffle([s.answer, ...generateDistractors(s.answer)]);
  } else if (Array.isArray(s.choices) && s.choices.length === 4) {
    choices = shuffle(s.choices.slice());
  } else {
    choices = shuffle([s.answer, s.answer + 1, s.answer + 2, s.answer + 3]);
  }
  const correctIndex = choices.indexOf(s.answer);
  return {
    a: s.a, b: s.b, op: s.op, answer: s.answer,
    format: s.format, text: s.text,
    choices, correctIndex,
    isReview: true,
  };
}

/** Clear the queue (new game / explicit reset). */
export function resetReview(save) {
  save.problemHistory = [];
  save.reviewClock = 0;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
