/**
 * Tests for the persistent spaced-repetition review queue (Upgrade 2).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  reviewKey, tickReview, scheduleReview, nextReview,
  buildReviewQuestion, reviewCount, resetReview,
} from './review.js';

const Q = (a, b, op, answer) => ({ a, b, op, answer, choices: [answer, answer + 1, answer + 2, answer + 3], correctIndex: 0 });

test('reviewKey is stable for the same fact and distinct across facts', () => {
  assert.equal(reviewKey(Q(3, 4, '+', 7)), reviewKey(Q(3, 4, '+', 7)));
  assert.notEqual(reviewKey(Q(3, 4, '+', 7)), reviewKey(Q(4, 3, '+', 7)));
});

test('a missed problem is scheduled due within a question or two', () => {
  const save = {};
  scheduleReview(save, Q(6, 7, '*', 42), false);
  assert.equal(reviewCount(save), 1);
  tickReview(save);
  const due = nextReview(save);
  assert.ok(due);
  assert.equal(due.snap.answer, 42);
});

test('a due item can be rebuilt into a fresh, valid question', () => {
  const save = {};
  scheduleReview(save, Q(6, 7, '*', 42), false);
  tickReview(save);
  const q = buildReviewQuestion(nextReview(save));
  assert.equal(q.choices.length, 4);
  assert.equal(q.choices[q.correctIndex], 42);
  assert.ok(q.isReview);
});

test('correct reviews space the item further out each time', () => {
  const save = {};
  scheduleReview(save, Q(8, 2, '-', 6), false);
  const intervals = [];
  for (let r = 0; r < 3; r++) {
    while (!nextReview(save)) tickReview(save);
    scheduleReview(save, Q(8, 2, '-', 6), true);
    const item = save.problemHistory[0];
    if (item) intervals.push(item.interval);
  }
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], `${intervals}`);
});

test('a well-learned fact is eventually retired from the queue', () => {
  const save = {};
  scheduleReview(save, Q(2, 3, '+', 5), false);
  for (let i = 0; i < 20 && reviewCount(save) > 0; i++) { while (!nextReview(save)) tickReview(save); scheduleReview(save, Q(2, 3, '+', 5), true); }
  assert.equal(reviewCount(save), 0);
});

test('not-yet-due items are not returned by nextReview', () => {
  const save = {};
  scheduleReview(save, Q(5, 5, '+', 10), false);
  while (!nextReview(save)) tickReview(save);
  scheduleReview(save, Q(5, 5, '+', 10), true);
  assert.equal(nextReview(save), null);
});

test('the queue persists on the save (survives a JSON round-trip)', () => {
  const save = {};
  scheduleReview(save, Q(9, 9, '*', 81), false);
  tickReview(save);
  const restored = JSON.parse(JSON.stringify(save));
  assert.equal(reviewCount(restored), 1);
  assert.ok(nextReview(restored));
});

test('resetReview clears the queue and clock', () => {
  const save = {};
  scheduleReview(save, Q(1, 1, '+', 2), false);
  resetReview(save);
  assert.equal(reviewCount(save), 0);
  assert.equal(save.reviewClock, 0);
});

test('a correct answer to an untracked fact does NOT create a queue item', () => {
  const save = {};
  scheduleReview(save, Q(3, 3, '+', 6), true);
  assert.equal(reviewCount(save), 0);
});
