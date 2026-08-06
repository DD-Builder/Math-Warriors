/**
 * Unit tests for src/overworld/state.js — overworld save serialization.
 * The load path must be junk-proof: anything malformed becomes defaults.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { defaultOverworldState, toSave, fromSave } from './state.js';

describe('defaultOverworldState', () => {
  test('returns the fresh-spawn shape', () => {
    assert.deepEqual(defaultOverworldState(), {
      pos: null, yaw: 0, portalId: null, collected: [],
    });
  });

  test('returns a fresh object each call', () => {
    const a = defaultOverworldState();
    const b = defaultOverworldState();
    assert.notEqual(a, b);
    a.collected.push('ow-garden-1');
    assert.equal(b.collected.length, 0);
  });
});

describe('toSave', () => {
  test('serializes a full runtime state to plain JSON', () => {
    const state = {
      pos: { x: 6, y: 2.5, z: 158 },
      yaw: Math.PI,
      portalId: 'portal-f1',
      collected: ['ow-garden-1', 'ow-garden-2'],
    };
    assert.deepEqual(toSave(state), {
      pos: { x: 6, y: 2.5, z: 158 },
      yaw: Math.PI,
      portalId: 'portal-f1',
      collected: ['ow-garden-1', 'ow-garden-2'],
    });
  });

  test('copies pos and collected — no aliasing into the save object', () => {
    const state = { pos: { x: 1, y: 2, z: 3 }, yaw: 0, portalId: null, collected: ['a'] };
    const saved = toSave(state);
    state.pos.x = 999;
    state.collected.push('b');
    assert.equal(saved.pos.x, 1);
    assert.deepEqual(saved.collected, ['a']);
  });

  test('a partial or non-finite pos serializes as null', () => {
    assert.equal(toSave({ pos: { x: 1, y: 2 } }).pos, null);
    assert.equal(toSave({ pos: { x: 1, y: NaN, z: 3 } }).pos, null);
    assert.equal(toSave({ pos: [1, 2, 3] }).pos, null);
  });

  test('junk state serializes to the default shape', () => {
    assert.deepEqual(toSave(null), defaultOverworldState());
    assert.deepEqual(toSave('garbage'), defaultOverworldState());
  });

  test('survives JSON round-trip unchanged', () => {
    const state = { pos: { x: -3, y: 1, z: 7 }, yaw: 1.5, portalId: 'portal-f4', collected: ['ow-ember-1'] };
    const roundTripped = JSON.parse(JSON.stringify(toSave(state)));
    assert.deepEqual(fromSave(roundTripped), state);
  });
});

describe('fromSave', () => {
  test('missing/null input yields defaults, never throws', () => {
    assert.deepEqual(fromSave(undefined), defaultOverworldState());
    assert.deepEqual(fromSave(null), defaultOverworldState());
  });

  test('junk input yields defaults, never throws', () => {
    for (const junk of ['string', 42, true, [1, 2], { pos: 'here', yaw: 'north', portalId: 7, collected: 'all' }]) {
      assert.doesNotThrow(() => fromSave(junk));
      assert.deepEqual(fromSave(junk), defaultOverworldState());
    }
  });

  test('partial pos collapses to null (no half-points into the terrain)', () => {
    assert.equal(fromSave({ pos: { x: 1, z: 3 } }).pos, null);
    assert.equal(fromSave({ pos: { x: 1, y: '2', z: 3 } }).pos, null);
    assert.equal(fromSave({ pos: { x: 1, y: Infinity, z: 3 } }).pos, null);
  });

  test('valid fields survive alongside invalid ones', () => {
    const out = fromSave({
      pos: { x: 10, y: 4, z: -20 },
      yaw: NaN,                       // non-finite — defaults to 0
      portalId: 'portal-f2',
      collected: ['ow-sky-1', 42, null, 'ow-sky-2'],
    });
    assert.deepEqual(out.pos, { x: 10, y: 4, z: -20 });
    assert.equal(out.yaw, 0);
    assert.equal(out.portalId, 'portal-f2');
    assert.deepEqual(out.collected, ['ow-sky-1', 'ow-sky-2']);
  });

  test('does not alias the save object it reads from', () => {
    const saved = { pos: { x: 1, y: 2, z: 3 }, yaw: 0, portalId: null, collected: ['a'] };
    const state = fromSave(saved);
    state.pos.x = 999;
    state.collected.push('b');
    assert.equal(saved.pos.x, 1);
    assert.deepEqual(saved.collected, ['a']);
  });
});
