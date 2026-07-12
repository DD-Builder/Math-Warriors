/**
 * Tests for accessibility helpers (Upgrade 10) — questionToSpeech is the
 * pure, testable core. speak()/isSpeechAvailable() degrade gracefully
 * where Web Speech isn't present (as in this test runner).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { questionToSpeech, isSpeechAvailable, speak, speakQuestion } from './a11y.js';

test('arithmetic questions speak with operator words', () => {
  assert.equal(questionToSpeech({ op: '+', a: 6, b: 4, answer: 10 }), '6 plus 4. What is the answer?');
  assert.match(questionToSpeech({ op: '-', a: 9, b: 2, answer: 7 }), /minus/);
  assert.match(questionToSpeech({ op: '*', a: 3, b: 5, answer: 15 }), /times/);
  assert.match(questionToSpeech({ op: '/', a: 12, b: 4, answer: 3 }), /divided by/);
});

test('special questions read their human prompt text', () => {
  const q = { op: 'geo', format: 'geometry', text: 'How many sides does a hexagon have?', answer: 6 };
  assert.equal(questionToSpeech(q), 'How many sides does a hexagon have?');
});

test('questionToSpeech is safe on empty/odd input', () => {
  assert.equal(questionToSpeech(null), '');
  assert.match(questionToSpeech({ answer: 42 }), /42/);
});

test('speech APIs are no-ops without a browser (never throw)', () => {
  assert.equal(isSpeechAvailable(), false);
  assert.doesNotThrow(() => speak('hello'));
  assert.doesNotThrow(() => speakQuestion({ settings: { ttsEnabled: true } }, { op: '+', a: 1, b: 1, answer: 2 }));
  assert.doesNotThrow(() => speakQuestion({ settings: { ttsEnabled: false } }, { op: '+', a: 1, b: 1, answer: 2 }));
});
