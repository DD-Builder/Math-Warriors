import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { noteHz, shift, chord, seq, arp, prog, every } from './theory.js';
import { buildTimeline, eventsBetween, beatsToSec, applySwing } from './songCursor.js';
import { createScheduler } from './scheduler.js';

describe('theory', () => {
  test('noteHz reference pitches', () => {
    assert.equal(noteHz('A4'), 440);
    assert.ok(Math.abs(noteHz('C4') - 261.63) < 0.01);
    assert.ok(Math.abs(noteHz('F#5') - 739.99) < 0.01);
    assert.ok(Math.abs(noteHz('Bb2') - 116.54) < 0.01);
    assert.equal(noteHz('X9'), null);
  });

  test('shift transposes', () => {
    assert.equal(shift('C4', 7), 'G4');
    assert.equal(shift('A4', 3), 'C5');
    assert.equal(shift('C4', -1), 'B3');
  });

  test('chord spellings', () => {
    assert.deepEqual(chord('C4', 'maj'), ['C4', 'E4', 'G4']);
    assert.deepEqual(chord('A3', 'min'), ['A3', 'C4', 'E4']);
    assert.deepEqual(chord('G3', 'dom7'), ['G3', 'B3', 'D4', 'F4']);
  });

  test('seq parses notes, rests, holds', () => {
    const s = seq('E5 . G5 C6~ B5', { step: 0.5, v: 0.9 });
    assert.equal(s.length, 4);
    assert.deepEqual(s[0], { n: 'E5', t: 0, d: 0.5, v: 0.9 });
    assert.equal(s[1].t, 1);            // rest consumed half a beat
    assert.deepEqual(s[2], { n: 'C6', t: 1.5, d: 1, v: 0.9 });
    assert.equal(s[3].t, 2.5);          // hold advanced two steps
  });

  test('arp fills bars', () => {
    const a = arp(chord('C4'), { pattern: [0, 1, 2, 1], step: 0.5, bars: 1, beatsPerBar: 4 });
    assert.equal(a.length, 8);
    assert.equal(a[0].n, 'C4');
    assert.equal(a[3].n, 'E4');
  });

  test('prog lays block chords', () => {
    const p = prog([['C4', 'maj'], ['A3', 'min']], { beatsEach: 4 });
    assert.equal(p.length, 6);
    assert.equal(p[3].t, 4);
  });

  test('every grids percussion', () => {
    assert.equal(every(1, 8, 'hat').length, 8);
  });
});

const song = {
  bpm: 120, beatsPerBar: 4,
  sections: [{ name: 'intro', bars: 1 }, { name: 'A', bars: 2 }],
  loop: 'A',
  tracks: [
    { id: 'm', instrument: 'musicbox', patterns: {
      intro: [{ n: 'C4', t: 0, d: 1, v: 1 }],
      A: [{ n: 'E4', t: 0, d: 1, v: 1 }, { n: 'G4', t: 4, d: 1, v: 1 }],
    } },
  ],
};

describe('songCursor', () => {
  test('timeline totals and loop point', () => {
    const tl = buildTimeline(song);
    assert.equal(tl.totalBeats, 12);
    assert.equal(tl.loopStartBeat, 4);
    assert.equal(tl.events.length, 3);
  });

  test('first-pass window', () => {
    const tl = buildTimeline(song);
    const evs = eventsBetween(tl, 0, 5);
    assert.deepEqual(evs.map(e => [e.note, e.absBeat]), [['C4', 0], ['E4', 4]]);
  });

  test('loop wrap: the A section repeats forever, intro never returns', () => {
    const tl = buildTimeline(song);
    // Unrolled: E4@4, G4@8, then loop of length 8: E4@12, G4@16, E4@20…
    const evs = eventsBetween(tl, 11, 21);
    assert.deepEqual(evs.map(e => [e.note, e.absBeat]),
      [['E4', 12], ['G4', 16], ['E4', 20]]);
    assert.ok(!evs.some(e => e.note === 'C4'), 'intro must not loop');
  });

  test('one-shot songs end', () => {
    const tl = buildTimeline({ ...song, loop: false });
    assert.equal(eventsBetween(tl, 12, 100).length, 0);
  });

  test('swing delays off-beat 8ths only', () => {
    assert.equal(applySwing(1.5, 0.2), 1.6);
    assert.equal(applySwing(1.0, 0.2), 1.0);
  });
});

describe('scheduler', () => {
  test('schedules every event exactly once, in order, ahead of time', () => {
    const tl = buildTimeline(song);
    let now = 100;
    const clock = { now: () => now };
    const got = [];
    let tickFn = null;
    const sched = createScheduler({
      clock,
      onEvent: (when, ev) => got.push({ when: +when.toFixed(3), note: ev.note, absBeat: ev.absBeat }),
      lookaheadSec: 0.12,
      setIntervalFn: (fn) => { tickFn = fn; return 1; },
      clearIntervalFn: () => { tickFn = null; },
    });
    sched.start(tl, 100);
    // advance fake time in 25ms steps for 7 simulated seconds (14 beats)
    for (let ms = 0; ms <= 7000; ms += 25) {
      now = 100 + ms / 1000;
      tickFn && tickFn();
    }
    // Expected in 0..~14.24 beats: C4@0, E4@4, G4@8, E4@12 (loop)
    assert.deepEqual(got.map(g => [g.note, g.absBeat]),
      [['C4', 0], ['E4', 4], ['G4', 8], ['E4', 12]]);
    // no duplicates
    assert.equal(new Set(got.map(g => g.note + g.absBeat)).size, got.length);
    // every event scheduled at its exact musical time (start + beats)
    for (const g of got) {
      assert.ok(Math.abs(g.when - (100 + beatsToSec(g.absBeat, 120))) < 1e-6);
    }
    sched.stop();
  });

  test('resync skips a hidden-tab gap instead of bursting', () => {
    const tl = buildTimeline(song);
    let now = 0;
    const clock = { now: () => now };
    const got = [];
    let tickFn = null;
    const sched = createScheduler({
      clock, onEvent: (w, ev) => got.push(ev.absBeat),
      setIntervalFn: (fn) => { tickFn = fn; return 1; }, clearIntervalFn: () => {},
    });
    sched.start(tl, 0);
    now = 0.1; tickFn();          // schedules beat 0
    now = 30;                     // tab hidden for 30s (= 60 beats)
    sched.resync();
    tickFn();                     // should NOT burst beats 0-60
    const after = got.filter(b => b > 0);
    assert.ok(after.every(b => b >= 60), `burst-scheduled past beats: ${after}`);
  });
});
