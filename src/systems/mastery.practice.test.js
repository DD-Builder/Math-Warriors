/**
 * Tests for the mastery-driven practice loop (Upgrade 5).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { recordSkillAnswer, getWeakestSkill, getPracticeRecommendation, biasedMixedOperator } from './mastery.js';

function withSkill(save, id, correctCount, wrongCount) {
  for (let i = 0; i < correctCount; i++) recordSkillAnswer(save, id, true);
  for (let i = 0; i < wrongCount; i++) recordSkillAnswer(save, id, false);
}

test('getWeakestSkill picks the lowest-mastery skill with enough signal', () => {
  const save = { skillStats: {} };
  withSkill(save, '+', 18, 2);  // strong
  withSkill(save, '-', 5, 10);  // weak
  const weak = getWeakestSkill(save);
  assert.equal(weak.id, '-');
});

test('getWeakestSkill ignores skills with too little data', () => {
  const save = { skillStats: {} };
  withSkill(save, '*', 0, 1); // 1 attempt — below signal threshold
  assert.equal(getWeakestSkill(save), null);
});

test('mastered skills are never recommended for practice', () => {
  const save = { skillStats: {} };
  withSkill(save, '+', 25, 0); // mastered
  assert.equal(getPracticeRecommendation(save), null);
});

test('getPracticeRecommendation returns label + standard for the weak skill', () => {
  const save = { skillStats: {} };
  withSkill(save, '/', 3, 12);
  const rec = getPracticeRecommendation(save);
  assert.equal(rec.skillId, '/');
  assert.equal(rec.label, 'Division');
  assert.ok(rec.standard);
});

test('biasedMixedOperator returns a valid component operator', () => {
  const save = { skillStats: {} };
  withSkill(save, '-', 3, 12);
  const comps = ['+', '-', '*', '/'];
  for (let i = 0; i < 20; i++) assert.ok(comps.includes(biasedMixedOperator(save, comps)));
});

test('biasedMixedOperator favors the weakest skill when biasChance = 1', () => {
  const save = { skillStats: {} };
  withSkill(save, '+', 18, 2);
  withSkill(save, '*', 2, 13); // weakest
  let mult = 0;
  for (let i = 0; i < 40; i++) if (biasedMixedOperator(save, ['+', '-', '*', '/'], 1) === '*') mult++;
  assert.ok(mult >= 30, `expected mostly * , got ${mult}/40`);
});
