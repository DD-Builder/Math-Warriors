/**
 * Tests for mistake-aware feedback (Upgrade 3).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { getHint, getWhy } from './hints.js';

test('arithmetic hints decompose the problem and include the answer', () => {
  assert.match(getHint({ op: '+', a: 27, b: 8, answer: 35 }), /35/);
  assert.match(getHint({ op: '-', a: 42, b: 17, answer: 25 }), /25/);
  assert.match(getHint({ op: '*', a: 6, b: 7, answer: 42 }), /42/);
  assert.match(getHint({ op: '/', a: 24, b: 6, answer: 4 }), /4 groups|→ 4/);
});

test('fraction hints are concept-specific, not the generic fallback', () => {
  const compare = getHint({ op: 'frac', format: 'fraction', text: 'Which is bigger: 1/2 or 1/4?', answer: '1/2' });
  assert.match(compare, /pieces|bottom/i);
  assert.doesNotMatch(compare, /step by step/i);
  const add = getHint({ op: 'frac', format: 'fraction', text: 'What is 1/5 + 2/5?', answer: '3/5' });
  assert.match(add, /top numbers|same/i);
});

test('geometry hints match sides/area/perimeter', () => {
  assert.match(getHint({ op: 'geo', format: 'geometry', text: 'How many sides does a hexagon have?', answer: 6 }), /edge|count/i);
  assert.match(getHint({ op: 'geo', format: 'geometry', text: 'Area of a 4 by 5 rectangle?', answer: 20 }), /length × width/i);
  assert.match(getHint({ op: 'geo', format: 'geometry', text: 'Perimeter of the square?', answer: 16 }), /side/i);
});

test('money hints match change vs counting coins', () => {
  assert.match(getHint({ op: 'money', format: 'money', text: 'You pay $1.00 ... Change = ? cents', answer: 45 }), /paid|price|subtract/i);
  assert.match(getHint({ op: 'money', format: 'money', text: 'How many nickels in 20 cents?', answer: 4 }), /divide|value/i);
});

test('no concept falls through to the bare generic fallback', () => {
  for (const q of [
    { op: 'frac', format: 'fraction', text: 'add', answer: '2/3' },
    { op: 'geo', format: 'geometry', text: 'sides', answer: 3 },
    { op: 'money', format: 'money', text: 'change', answer: 5 },
  ]) assert.doesNotMatch(getHint(q), /^Try working through/);
});

test('legacy positional signature still works', () => {
  assert.match(getHint('+', 2, 3, 5), /5/);
});

test('getWhy returns a short concept tip', () => {
  for (const q of [{ op: '+' }, { op: '-' }, { op: '*' }, { op: '/' }, { op: 'frac' }, { op: 'geo', text: 'area' }, { op: 'money' }]) {
    const why = getWhy(q);
    assert.ok(why.length > 0 && why.length <= 48, `"${why}"`);
    assert.match(why, /Tip:/);
  }
});
