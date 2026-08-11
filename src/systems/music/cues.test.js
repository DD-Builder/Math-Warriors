import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoveryCue, victoryPhrase, encouragementCue, floorFanfare, keyBridgeCue,
  relativeMajor, CUE_BUILDERS,
} from './cues.js';
import { INSTRUMENT_NAMES } from './instruments.js';
import { noteHz, DRUM_KEYS } from './theory.js';
import { buildTimeline } from './songCursor.js';
import { tonicPc, semitonesBetween } from './motif.js';
import { planKeyBridge } from './adaptive.js';
import { SONG_KEYS } from './songKeys.js';
import { allSongKeys } from './songs/index.js';

const KEYS_IN_PLAY = [
  ['C', 'maj'], ['G', 'maj'], ['F', 'maj'],
  ['A', 'min'], ['D', 'min'], ['E', 'min'],
];

/** Same integrity contract songs.test.js holds the composed pieces to. */
function assertPlayable(song, label) {
  assert.ok(song.bpm >= 40 && song.bpm <= 220, `${label}: sane bpm`);
  assert.equal(song.loop, false, `${label}: a cue must be one-shot or it will loop forever`);
  const beatsPerBar = song.beatsPerBar || 4;
  const sectionBeats = Object.fromEntries(song.sections.map((s) => [s.name, s.bars * beatsPerBar]));
  let notes = 0;
  for (const track of song.tracks) {
    assert.ok(INSTRUMENT_NAMES.includes(track.instrument), `${label}: unknown instrument ${track.instrument}`);
    for (const [sec, pattern] of Object.entries(track.patterns || {})) {
      assert.ok(sectionBeats[sec] != null, `${label}: pattern for unknown section ${sec}`);
      for (const ev of pattern) {
        assert.ok(DRUM_KEYS.has(ev.n) || noteHz(ev.n) != null, `${label}: unparseable note ${ev.n}`);
        assert.ok(ev.t >= 0 && ev.t < sectionBeats[sec],
          `${label}: ${track.id} note at beat ${ev.t} outside its ${sectionBeats[sec]}-beat section`);
        notes++;
      }
    }
  }
  assert.ok(notes > 0, `${label}: silent cue`);
  assert.ok(buildTimeline(song).events.length > 0, `${label}: empty timeline`);
}

describe('every cue is playable data, in every key the game uses', () => {
  for (const [name, build] of Object.entries(CUE_BUILDERS)) {
    for (const [tonic, mode] of KEYS_IN_PLAY) {
      test(`${name} in ${tonic} ${mode}`, () => {
        assertPlayable(build({ tonic, mode }), `${name}/${tonic}${mode}`);
      });
    }
  }

  test('a cue built with no arguments still works (defensive default: C major)', () => {
    for (const build of Object.values(CUE_BUILDERS)) assertPlayable(build(), 'default');
  });
});

describe('cues are short enough to live inside gameplay', () => {
  const secs = (song) => (buildTimeline(song).totalBeats * 60) / song.bpm;

  test('a discovery chime is a sparkle, not an event', () => {
    const s = secs(discoveryCue({ tonic: 'C', mode: 'maj' }));
    assert.ok(s < 2.5, `discovery runs ${s.toFixed(1)}s — too long to fire on a collectible`);
  });

  test('the victory phrase resolves in about four seconds', () => {
    const s = secs(victoryPhrase({ tonic: 'C', mode: 'maj' }));
    assert.ok(s > 2 && s < 6, `victory runs ${s.toFixed(1)}s`);
  });

  test('the floor fanfare is the biggest cue — it says the whole tune', () => {
    const fan = floorFanfare({ tonic: 'C', mode: 'maj' });
    const others = [discoveryCue({}), victoryPhrase({}), encouragementCue({})];
    const notes = (s) => buildTimeline(s).events.length;
    assert.ok(notes(fan) > Math.max(...others.map(notes)));
    assert.ok(fan.tracks.length > Math.max(...others.map((s) => s.tracks.length)));
    assert.ok(secs(fan) < 10, 'still a fanfare, not a movement');
  });
});

describe('the victory phrase resolves the CURRENT key', () => {
  for (const [tonic, mode] of KEYS_IN_PLAY) {
    test(`lands on the tonic of ${tonic} ${mode}`, () => {
      const song = victoryPhrase({ tonic, mode });
      const lead = song.tracks.find((t) => t.id === 'lead').patterns.A;
      const last = lead[lead.length - 1];
      assert.equal(last.n.replace(/\d+$/, ''), tonic, `ended on ${last.n}, not the tonic`);
      assert.ok(last.d >= 1.5, 'the last note should be held — that is what "resolved" sounds like');
      // and the bass says the same thing underneath
      const bass = song.tracks.find((t) => t.id === 'bass').patterns.A;
      assert.equal(bass[bass.length - 1].n.replace(/\d+$/, ''), tonic);
    });
  }

  test('it is not just the C major fanfare pitched about — it is in the key', () => {
    const c = victoryPhrase({ tonic: 'C', mode: 'maj' });
    const d = victoryPhrase({ tonic: 'D', mode: 'min' });
    const pitch = (s) => s.tracks.find((t) => t.id === 'lead').patterns.A.map((e) => noteHz(e.n));
    const iv = (hz) => hz.slice(1).map((f, i) => Math.round(12 * Math.log2(f / hz[i])));
    assert.notDeepEqual(iv(pitch(c)), iv(pitch(d)),
      'a minor key must produce a minor-mode phrase, not a transposed major one');
  });
});

describe('the encouragement cue is kind, by construction', () => {
  test('never any percussion — no clock, no pressure', () => {
    for (const [tonic, mode] of KEYS_IN_PLAY) {
      const song = encouragementCue({ tonic, mode });
      assert.ok(!song.tracks.some((t) => t.instrument === 'perc'),
        `${tonic} ${mode}: percussion under "you're doing fine" reads as a countdown`);
    }
  });

  test('a minor biome gets its RELATIVE MAJOR — the same notes, heard warmly', () => {
    assert.equal(relativeMajor('A'), 'C');
    assert.equal(relativeMajor('D'), 'F');
    assert.equal(relativeMajor('E'), 'G');
    const inAminor = encouragementCue({ tonic: 'A', mode: 'min' });
    const inCmajor = encouragementCue({ tonic: 'C', mode: 'maj' });
    const notes = (s) => s.tracks.find((t) => t.id === 'hand').patterns.A.map((e) => e.n);
    assert.deepEqual(notes(inAminor), notes(inCmajor),
      'the Tide Ledger is in A minor; kindness arrives in C major, which is the same seven notes');
  });

  test('it is quiet — it must never sound like an alarm', () => {
    const song = encouragementCue({ tonic: 'C', mode: 'maj' });
    assert.ok(song.gain <= 0.75);
    assert.ok(song.duck >= 0.4, 'it should not shove the score out of the way');
    const loudest = Math.max(...song.tracks.flatMap((t) =>
      Object.values(t.patterns).flat().map((e) => e.v ?? 0.8)));
    assert.ok(loudest <= 0.7, `loudest note is ${loudest} — too assertive for reassurance`);
  });

  test('it ends open, on the third — "go on", not "the end"', () => {
    const hand = encouragementCue({ tonic: 'C', mode: 'maj' }).tracks
      .find((t) => t.id === 'hand').patterns.A;
    assert.equal(hand[hand.length - 1].n, 'E5');
  });
});

describe('every cue quotes the main theme somewhere', () => {
  test('discovery is the Paper Meadow rise; the fanfare is the whole hook', () => {
    const disc = discoveryCue({ tonic: 'C', mode: 'maj' }).tracks
      .find((t) => t.id === 'chime').patterns.A.map((e) => e.n);
    assert.deepEqual(disc, ['E5', 'G5', 'C6']);

    const fan = floorFanfare({ tonic: 'C', mode: 'maj' }).tracks
      .find((t) => t.id === 'theme').patterns.A.map((e) => e.n);
    assert.deepEqual(fan.slice(0, 6), ['G4', 'C5', 'D5', 'E5', 'G5', 'C6'], 'the hook, plainly stated');
  });

  test('and it transposes with the key', () => {
    const disc = discoveryCue({ tonic: 'G', mode: 'maj' }).tracks
      .find((t) => t.id === 'chime').patterns.A.map((e) => e.n);
    assert.deepEqual(disc, ['B5', 'D6', 'G6']);
  });
});

describe('the key bridge', () => {
  test('holds exactly the tones planKeyBridge chose', () => {
    const plan = planKeyBridge('C', 'maj', 'A', 'min');
    const cue = keyBridgeCue(plan.pivots, { bars: 2 });
    const held = cue.tracks.find((t) => t.id === 'hold').patterns.A.map((e) => e.n.replace(/\d+$/, ''));
    assert.deepEqual(held, plan.pivots);
    assertPlayable(cue, 'bridge');
  });

  test('it does not duck the score — it lives INSIDE the crossfade', () => {
    assert.equal(keyBridgeCue(['C', 'E']).duck, 1);
    assert.ok(keyBridgeCue(['C', 'E']).gain < 0.7, 'a bridge is a bed, not an event');
  });

  test('it survives an empty pivot list rather than producing silence', () => {
    assertPlayable(keyBridgeCue([], { bars: 1 }), 'empty pivots');
    assertPlayable(keyBridgeCue(null), 'null pivots');
  });

  test('the pad sustains for the whole bridge — that is the point of it', () => {
    const cue = keyBridgeCue(['C', 'E', 'G'], { bars: 3 });
    for (const e of cue.tracks[0].patterns.A) assert.equal(e.d, 12);
  });
});

describe('the key table covers the whole score', () => {
  test('every registered song declares its key', () => {
    for (const key of allSongKeys()) {
      assert.ok(SONG_KEYS[key], `${key} has no entry in songKeys.js — cues would default to C major`);
      assert.ok(['maj', 'min'].includes(SONG_KEYS[key].mode), `${key} has an odd mode`);
      assert.ok(tonicPc(SONG_KEYS[key].tonic) >= 0);
    }
  });

  test('no floor-to-floor move needs more than a tritone of modulation', () => {
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        const d = semitonesBetween(SONG_KEYS[`music/floor-${a}`].tonic, SONG_KEYS[`music/floor-${b}`].tonic);
        assert.ok(Math.abs(d) <= 6, `floor ${a} → ${b} modulates by ${d}`);
      }
    }
  });

  test('every adjacent floor pair has something to hold across the join', () => {
    for (let f = 1; f < 9; f++) {
      const from = SONG_KEYS[`music/floor-${f}`];
      const to = SONG_KEYS[`music/floor-${f + 1}`];
      const b = planKeyBridge(from.tonic, from.mode, to.tonic, to.mode);
      assert.ok(b.pivots.length >= 1, `floor ${f} → ${f + 1} has no pivot`);
      assert.notEqual(b.kind, 'dominant',
        `floor ${f} → ${f + 1} shares no tones at all — the walk between realms would jolt`);
    }
  });
});
