/**
 * Tests for the adaptive mastery engine (Upgrade 1).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  ensureAdaptiveLevel, getAdaptiveGrade, updateAdaptiveLevel,
  recordSkillAnswer,
} from './mastery.js';

function freshSave(grade = 3) {
  return { grade, skillStats: {}, adaptiveLevel: undefined };
}
function answer(save, op, n, correct) {
  for (let i = 0; i < n; i++) { recordSkillAnswer(save, op, correct); updateAdaptiveLevel(save, op); }
}

test('adaptiveLevel seeds every skill from the chosen grade', () => {
  const levels = ensureAdaptiveLevel(freshSave(2));
  for (const id of ['+', '-', '*', '/', 'frac', 'geo', 'money', 'word']) assert.equal(levels[id], 2);
});

test('getAdaptiveGrade falls back to grade for unknown ops', () => {
  const save = freshSave(4);
  assert.equal(getAdaptiveGrade(save, 'nonsense'), 4);
  assert.equal(getAdaptiveGrade(save, undefined), 4);
});

test("mixed averages the component skills' levels", () => {
  const save = freshSave(3);
  const levels = ensureAdaptiveLevel(save);
  levels['+'] = 5; levels['-'] = 1;
  const g = getAdaptiveGrade(save, 'mixed');
  assert.ok(g >= 2 && g <= 4);
});

test('mastering a skill PROMOTES its adaptive level and resets its window', () => {
  const save = freshSave(1);
  answer(save, '+', 20, true);
  assert.equal(getAdaptiveGrade(save, '+'), 2);
  assert.equal(save.skillStats['+'].recent.length, 0);
  assert.equal(getAdaptiveGrade(save, '-'), 1);
});

test('promotion caps at grade 5', () => {
  const save = freshSave(5);
  answer(save, '*', 30, true);
  assert.equal(getAdaptiveGrade(save, '*'), 5);
});

test('persistent struggling DEMOTES the adaptive level', () => {
  const save = freshSave(3);
  answer(save, '-', 12, false);
  assert.equal(getAdaptiveGrade(save, '-'), 2);
  assert.equal(save.skillStats['-'].recent.length, 0);
});

test('demotion floors at grade 0', () => {
  const save = freshSave(0);
  answer(save, '+', 20, false);
  assert.equal(getAdaptiveGrade(save, '+'), 0);
});

test('mixed performance neither promotes nor thrashes', () => {
  const save = freshSave(3);
  for (let i = 0; i < 24; i++) { recordSkillAnswer(save, '*', i % 2 === 0); updateAdaptiveLevel(save, '*'); }
  const g = getAdaptiveGrade(save, '*');
  assert.ok(g >= 2 && g <= 3);
});

test('updateAdaptiveLevel reports a promotion for the celebration hook', () => {
  const save = freshSave(2);
  let promo = null;
  for (let i = 0; i < 20; i++) { recordSkillAnswer(save, 'frac', true); const r = updateAdaptiveLevel(save, 'frac'); if (r.changed) promo = r; }
  assert.ok(promo);
  assert.equal(promo.direction, 'up');
  assert.equal(promo.skillId, 'frac');
  assert.equal(promo.label, 'Fractions');
});
