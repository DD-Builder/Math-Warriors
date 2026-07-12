import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { numpadReducer, numpadValue, NUMPAD_MAX_LEN } from './numpad.js';

const type = (keys, opts) => keys.split('').reduce(
  (s, k) => numpadReducer(s, k, opts), { value: '' });

describe('numpadReducer', () => {
  test('types digits', () => {
    assert.equal(type('42').value, '42');
  });

  test('collapses leading zero', () => {
    assert.equal(type('07').value, '7');
    assert.equal(type('0').value, '0');
  });

  test('caps length', () => {
    assert.equal(type('123456789').value.length, NUMPAD_MAX_LEN);
  });

  test('backspace and clear', () => {
    let s = type('42');
    s = numpadReducer(s, 'back');
    assert.equal(s.value, '4');
    s = numpadReducer(s, 'clear');
    assert.equal(s.value, '');
    assert.equal(numpadReducer(s, 'back').value, '', 'backspace on empty is safe');
  });

  test('minus only when allowed, toggles', () => {
    let s = numpadReducer({ value: '5' }, 'minus');
    assert.equal(s.value, '5', 'minus ignored by default');
    s = numpadReducer({ value: '5' }, 'minus', { allowMinus: true });
    assert.equal(s.value, '-5');
    s = numpadReducer(s, 'minus', { allowMinus: true });
    assert.equal(s.value, '5');
  });

  test('unknown keys are ignored', () => {
    assert.equal(numpadReducer({ value: '3' }, 'x').value, '3');
  });
});

describe('numpadValue', () => {
  test('parses, null while empty or bare minus', () => {
    assert.equal(numpadValue({ value: '42' }), 42);
    assert.equal(numpadValue({ value: '-7' }), -7);
    assert.equal(numpadValue({ value: '' }), null);
    assert.equal(numpadValue({ value: '-' }), null);
  });
});
