/**
 * Tests for diagnostic placement scoring (Upgrade 4).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { scorePlacement, applyPlacement, PLACEMENT_PROBES } from './placement.js';

const R = (skill, grade, correct) => ({ skill, grade, correct });

test('acing every probe places a child near the top', () => {
  const { grade, adaptiveLevel } = scorePlacement(PLACEMENT_PROBES.map(p => R(p.skill, p.grade, true)));
  assert.ok(grade >= 4, `grade ${grade}`);
  assert.ok(adaptiveLevel['+'] >= 3);
});

test('missing everything places a child at the bottom', () => {
  const { grade } = scorePlacement(PLACEMENT_PROBES.map(p => R(p.skill, p.grade, false)));
  assert.ok(grade <= 1, `grade ${grade}`);
});

test('a lucky hard hit cannot leapfrog a missed easy one', () => {
  const { adaptiveLevel } = scorePlacement([R('/', 3, false), R('/', 5, true)]);
  assert.ok(adaptiveLevel['/'] <= 2);
});

test('per-skill differentiation: strong add, weak multiply', () => {
  const { adaptiveLevel } = scorePlacement([R('+', 1, true), R('+', 3, true), R('*', 2, false), R('*', 4, false)]);
  assert.ok(adaptiveLevel['+'] > adaptiveLevel['*']);
});

test('unprobed skills inherit the overall grade', () => {
  const { grade, adaptiveLevel } = scorePlacement([R('+', 3, true), R('-', 3, true)]);
  for (const id of ['frac', 'geo', 'money', 'word']) assert.equal(adaptiveLevel[id], grade);
});

test('applyPlacement writes grade, adaptiveLevel and a done flag', () => {
  const save = {};
  const result = scorePlacement([R('+', 3, true), R('-', 3, true), R('*', 2, true), R('/', 3, false)]);
  applyPlacement(save, result);
  assert.equal(save.grade, result.grade);
  assert.deepEqual(save.adaptiveLevel, result.adaptiveLevel);
  assert.equal(save.placementDone, true);
});

test('empty responses fall back to grade 3', () => {
  assert.equal(scorePlacement([]).grade, 3);
});
