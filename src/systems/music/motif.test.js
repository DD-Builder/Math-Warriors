import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALES, degreeToSemitone, degreeNote, degSeq, diatonicTriad, degProg,
  ROAD_HOOK, ROAD_ANSWER, ROAD_LIFT, ROAD_RETURN, ROAD_THEME, MEADOW_RISE, ROAD_TAG,
  quote, tonicPc, semitonesBetween, transposeEvents, transposeSong, veil, bones,
} from './motif.js';
import { noteHz } from './theory.js';

const names = (evs) => evs.map((e) => e.n);

describe('the degree DSL', () => {
  test('degrees count from 1, and 8 is the octave', () => {
    assert.equal(degreeToSemitone(1), 0);
    assert.equal(degreeToSemitone(5), 7);
    assert.equal(degreeToSemitone(8), 12);
    assert.equal(degreeToSemitone(15), 24, 'two octaves up');
    assert.equal(degreeToSemitone(0), -1, 'degree 0 is the leading tone below');
    assert.equal(degreeToSemitone(-6), -12);
  });

  test('the same degree bends to its mode — this is what makes the motif portable', () => {
    assert.equal(degreeNote(3, 'C4', 'maj'), 'E4');
    assert.equal(degreeNote(3, 'C4', 'min'), 'D#4');    // Eb
    assert.equal(degreeNote(7, 'C4', 'min'), 'A#4');    // natural minor, not harmonic
    assert.equal(degreeNote(3, 'C4', 'maj', -1), 'D#4', 'accidentals still work');
    for (const mode of Object.keys(SCALES)) {
      assert.equal(degreeNote(1, 'D4', mode), 'D4', `${mode} must start on its tonic`);
      assert.equal(degreeNote(8, 'D4', mode), 'D5');
    }
  });

  test('degSeq parses rests, holds and accidentals', () => {
    const s = degSeq('1 . 3~ b7', { tonic: 'C4', step: 0.5, v: 0.9 });
    assert.deepEqual(s.map((e) => [e.n, e.t, e.d]), [
      ['C4', 0, 0.5],
      ['E4', 1, 1],       // one '~' = two steps
      ['A#4', 2, 0.5],
    ]);
    assert.ok(s.every((e) => e.v === 0.9));
  });

  test('extra tildes hold longer, and garbage is silence rather than a crash', () => {
    const s = degSeq('1~~~ 5', { tonic: 'C4', step: 0.5 });
    assert.equal(s[0].d, 2);
    assert.equal(s[1].t, 2);
    assert.deepEqual(degSeq('what ?? 1', { tonic: 'C4' }).map((e) => e.n), ['C4']);
    assert.deepEqual(degSeq('', {}), []);
  });

  test('diatonic triads come out right in both modes', () => {
    assert.deepEqual(diatonicTriad(1, 'C4', 'maj'), ['C4', 'E4', 'G4']);
    assert.deepEqual(diatonicTriad(5, 'C4', 'maj'), ['G4', 'B4', 'D5']);
    assert.deepEqual(diatonicTriad(1, 'A3', 'min'), ['A3', 'C4', 'E4']);
    assert.deepEqual(diatonicTriad(4, 'A3', 'min'), ['D4', 'F4', 'A4']);
  });

  test('degProg lays block chords on the grid', () => {
    const p = degProg([1, 5], { tonic: 'C4', beatsEach: 4 });
    assert.equal(p.length, 6);
    assert.deepEqual(names(p.slice(0, 3)), ['C4', 'E4', 'G4']);
    assert.equal(p[3].t, 4);
  });
});

describe('the main theme', () => {
  test('THE HOOK is six notes and sings sol-do-re-mi-sol-DO', () => {
    const h = quote(ROAD_HOOK, { tonic: 'C4', mode: 'maj', step: 1 });
    assert.deepEqual(names(h), ['G4', 'C5', 'D5', 'E5', 'G5', 'C6']);
    // eight beats, with the two structural notes held
    assert.equal(h[h.length - 1].t + h[h.length - 1].d, 8);
    assert.equal(h[3].d, 2, 'the "mi" is held — that is the hook\'s breath');
    assert.equal(h[5].d, 2, 'and so is the octave it lands on');
  });

  test('the hook contains the original Paper Meadow rise at its peak', () => {
    const hook = names(quote(ROAD_HOOK, { tonic: 'C4' }));
    const rise = names(quote(MEADOW_RISE, { tonic: 'C4' }));
    assert.deepEqual(rise, ['E5', 'G5', 'C6']);
    const at = hook.findIndex((n, i) => rise.every((r, j) => hook[i + j] === r));
    assert.ok(at >= 0, `the new theme must quote the old one; hook was ${hook}`);
  });

  test('the whole theme is 32 beats — four eight-beat phrases', () => {
    const full = quote(ROAD_THEME, { tonic: 'C4', step: 1 });
    const end = Math.max(...full.map((e) => e.t + e.d));
    assert.equal(end, 32);
    for (const [name, figure] of Object.entries({ ROAD_HOOK, ROAD_ANSWER, ROAD_LIFT, ROAD_RETURN })) {
      const evs = quote(figure, { tonic: 'C4', step: 1 });
      assert.equal(Math.max(...evs.map((e) => e.t + e.d)), 8, `${name} is not one phrase long`);
    }
  });

  test('the theme resolves home, and the tag does too', () => {
    const full = quote(ROAD_THEME, { tonic: 'C4', step: 1 });
    assert.equal(full[full.length - 1].n, 'C5', 'the tune must land on its tonic');
    const tag = quote(ROAD_TAG, { tonic: 'C4', step: 1 });
    assert.equal(tag[tag.length - 1].n, 'C5');
  });

  test('it is singable: no leap wider than a fifth, and it stays in one octave-and-a-bit', () => {
    const hz = names(quote(ROAD_THEME, { tonic: 'C4', step: 1 })).map(noteHz);
    for (let i = 1; i < hz.length; i++) {
      const semis = Math.abs(12 * Math.log2(hz[i] / hz[i - 1]));
      assert.ok(semis <= 7.01, `leap of ${semis.toFixed(1)} semitones at note ${i} — a child cannot sing that`);
    }
    const range = 12 * Math.log2(Math.max(...hz) / Math.min(...hz));
    assert.ok(range <= 17,
      `range is ${range.toFixed(1)} semitones — wider than "Over the Rainbow", too wide for a child`);
  });

  test('the same hook renders correctly in every key the game uses', () => {
    for (const [tonic, mode] of [['C', 'maj'], ['G', 'maj'], ['F', 'maj'], ['A', 'min'], ['D', 'min'], ['E', 'min']]) {
      const h = quote(ROAD_HOOK, { tonic: `${tonic}4`, mode, step: 1 });
      assert.equal(h.length, 6);
      assert.ok(h.every((e) => noteHz(e.n) != null), `unparseable note in ${tonic} ${mode}`);
      assert.equal(h[0].n[0], tonic === 'C' ? 'G' : h[0].n[0]);
      // the shape is identical in every key: same interval sequence
      const iv = h.map((e) => noteHz(e.n)).slice(1).map((f, i) => Math.round(12 * Math.log2(f / noteHz(h[i].n))));
      const ref = mode === 'maj' ? [5, 2, 2, 3, 5] : [5, 2, 1, 4, 5];
      assert.deepEqual(iv, ref, `${tonic} ${mode} did not preserve the hook's shape`);
    }
  });
});

describe('transposition', () => {
  test('pitch classes and the SHORT way between keys', () => {
    assert.equal(tonicPc('C'), 0);
    assert.equal(tonicPc('Eb'), 3);
    assert.equal(tonicPc('F#'), 6);
    assert.equal(semitonesBetween('C', 'D'), 2);
    assert.equal(semitonesBetween('C', 'A'), -3, 'down a third, not up a sixth');
    assert.equal(semitonesBetween('C', 'G'), 7 - 12);
    assert.equal(semitonesBetween('A', 'A'), 0);
    for (const a of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      for (const b of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
        const d = semitonesBetween(a, b);
        assert.ok(d >= -5 && d <= 6, `${a}→${b} = ${d}`);
      }
    }
  });

  test('drums survive transposition; pitches move', () => {
    const evs = [{ n: 'C4', t: 0, d: 1, v: 1 }, { n: 'kick', t: 1, d: 0.2, v: 1 }, { n: 'hat', t: 2 }];
    const out = transposeEvents(evs, 3);
    assert.deepEqual(names(out), ['D#4', 'kick', 'hat']);
    assert.deepEqual(names(transposeEvents(evs, 0)), ['C4', 'kick', 'hat']);
  });

  test('transposeSong deep-copies — the original is never mutated', () => {
    const song = {
      bpm: 100, sections: [{ name: 'A', bars: 1 }],
      tracks: [{ id: 'm', instrument: 'musicbox', patterns: { A: [{ n: 'C4', t: 0, d: 1, v: 1 }] } }],
    };
    const up = transposeSong(song, 2);
    assert.equal(up.tracks[0].patterns.A[0].n, 'D4');
    assert.equal(song.tracks[0].patterns.A[0].n, 'C4');
    assert.equal(transposeSong(song, 0), song, 'a no-op transposition is free');
  });
});

describe('voicing helpers', () => {
  test('veil scales velocity and never goes silent or clips', () => {
    const v = veil([{ n: 'C4', v: 0.9 }, { n: 'D4', v: 0.1 }, { n: 'E4' }], 0.5);
    assert.deepEqual(v.map((e) => e.v), [0.45, 0.05, 0.4]);
    assert.ok(veil([{ n: 'C4', v: 1 }], 5)[0].v <= 1);
    assert.ok(veil([{ n: 'C4', v: 0.1 }], 0)[0].v > 0);
  });

  test('bones keeps only the notes the melody leans on', () => {
    const melody = quote(ROAD_HOOK, { tonic: 'C4', step: 1 });
    const skeleton = bones(melody, 2);
    assert.deepEqual(names(skeleton), ['E5', 'C6'], 'the two held notes ARE the hook');
    assert.ok(skeleton.length < melody.length);
  });
});
