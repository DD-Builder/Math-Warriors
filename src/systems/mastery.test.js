import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { makeDefaultSave, writeSave, loadSave, __setStorage } from './save.js';
import { recordHintUsed, getSkillHintStats } from './mastery.js';

function makeMockStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
}

beforeEach(() => { __setStorage(makeMockStorage()); });

test('recordHintUsed tallies hints and scaffolds', () => {
  const save = makeDefaultSave();
  recordHintUsed(save, '+', 1);   // tip
  recordHintUsed(save, '+', 2);   // scaffold
  recordHintUsed(save, '*', 1);
  const plus = getSkillHintStats(save, '+');
  assert.equal(plus.hints, 2);
  assert.equal(plus.scaffolds, 1);
  const times = getSkillHintStats(save, '*');
  assert.equal(times.hints, 1);
  assert.equal(times.scaffolds, 0);
});

test('getSkillHintStats defaults to zero for untouched skills', () => {
  const save = makeDefaultSave();
  assert.deepEqual(getSkillHintStats(save, '/'), { hints: 0, scaffolds: 0 });
});

test('hint tallies survive writeSave/loadSave round-trip', () => {
  const save = makeDefaultSave();
  recordHintUsed(save, 'frac', 2);
  recordHintUsed(save, 'frac', 1);
  writeSave(save, 1);
  const loaded = loadSave(1);
  const frac = getSkillHintStats(loaded, 'frac');
  assert.equal(frac.hints, 2);
  assert.equal(frac.scaffolds, 1);
});
