import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSong, allSongKeys } from './index.js';
import { noteHz, DRUM_KEYS } from '../theory.js';
import { INSTRUMENT_NAMES } from '../instruments.js';
import { buildTimeline } from '../songCursor.js';
import { BOSS_SONGS } from './bosses.js';

// Every composed piece must be playable data: known instruments,
// parseable notes, patterns that fit their sections, and a timeline
// the scheduler can build. This is the gate that keeps 22 songs of
// note data honest.
describe('song data integrity', () => {
  for (const key of allSongKeys()) {
    test(key, () => {
      const song = getSong(key);
      assert.ok(song.bpm >= 40 && song.bpm <= 220, 'sane bpm');
      assert.ok(song.sections?.length >= 1, 'has sections');
      const beatsPerBar = song.beatsPerBar || 4;
      const sectionBeats = Object.fromEntries(song.sections.map(s => [s.name, s.bars * beatsPerBar]));

      for (const track of song.tracks) {
        assert.ok(INSTRUMENT_NAMES.includes(track.instrument),
          `unknown instrument ${track.instrument}`);
        for (const [secName, pattern] of Object.entries(track.patterns || {})) {
          assert.ok(sectionBeats[secName] != null, `pattern for unknown section ${secName}`);
          for (const ev of pattern) {
            assert.ok(DRUM_KEYS.has(ev.n) || noteHz(ev.n) != null, `unparseable note ${ev.n}`);
            assert.ok(ev.t >= 0 && ev.t < sectionBeats[secName],
              `${track.id}/${secName}: note at beat ${ev.t} outside section (${sectionBeats[secName]} beats)`);
          }
        }
      }
      const tl = buildTimeline(song);
      assert.ok(tl.events.length > 0, 'timeline has events');
    });
  }
});

// ── THE ESCALATION CONTRACT ─────────────────────────────────────────
// The measured failure that started the boss-audio work: the back half
// of the game had the THINNEST music in it — bosses 2, 5 and 8 were
// single-section loops and the finale ran shorter than the floor-1
// waltz. These tests are the guard rail on that regression, because
// "does this piece feel bigger than the last one" is otherwise a thing
// only a human listening in order can catch.
describe('boss score escalation', () => {
  const bars = (s) => s.sections.reduce((n, sec) => n + sec.bars, 0);

  test('every boss has a real form — never a single repeating section', () => {
    BOSS_SONGS.forEach((song, i) => {
      assert.ok(song.sections.length >= 2,
        `boss ${i + 1} has only ${song.sections.length} section(s); a boss theme must develop`);
    });
  });

  test('the back half is not smaller than the front half', () => {
    const front = BOSS_SONGS.slice(0, 4).reduce((n, s) => n + bars(s), 0);
    const back = BOSS_SONGS.slice(4).reduce((n, s) => n + bars(s), 0);
    assert.ok(back / 5 >= front / 4,
      `mean back-half length ${back / 5} bars < front half ${front / 4}`);
  });

  // Bars are a bad measure across tempi (the Paradox runs 24 bars at
  // 66bpm), so "biggest" is held as composed material: sections, tracks
  // and notes. The finale must top every one of them.
  test('the Theorem is the biggest piece in the game', () => {
    const notes = (s) => buildTimeline(s).events.length;
    const theorem = BOSS_SONGS[8];
    const others = BOSS_SONGS.slice(0, 8);
    assert.ok(theorem.sections.length > Math.max(...others.map(s => s.sections.length)),
      'the finale must have the most sections');
    assert.ok(theorem.tracks.length > Math.max(...others.map(s => s.tracks.length)),
      'the finale must have the most tracks');
    const busiest = Math.max(...others.map(notes));
    assert.ok(notes(theorem) > busiest,
      `finale has ${notes(theorem)} notes, another boss has ${busiest}`);
    assert.ok(theorem.sections.length >= 5, 'the finale is a multi-movement piece');
    // The intro must play once and never come back around.
    assert.equal(theorem.loop, 'A');
    // …and its movements must be named in dramatic order.
    assert.deepEqual(theorem.sections.map(s => s.name), ['I', 'A', 'B', 'C', 'D']);
  });

  test('every boss carries phase-2 and phase-3 layers', () => {
    BOSS_SONGS.forEach((song, i) => {
      const layers = new Set(song.tracks.map(t => t.layer ?? 1));
      assert.ok(layers.has(2), `boss ${i + 1} has no layer-2 track — phase 2 would be silent`);
      assert.ok(layers.has(3), `boss ${i + 1} has no layer-3 track — phase 3 would be silent`);
      // …and a core mix that stands on its own at phase 1.
      assert.ok(song.tracks.filter(t => (t.layer ?? 1) === 1).length >= 4,
        `boss ${i + 1} leans too hard on its layers`);
    });
  });

  test('layer tracks are quieter than the core they sit under', () => {
    for (const [i, song] of BOSS_SONGS.entries()) {
      const core = song.tracks.filter(t => (t.layer ?? 1) === 1);
      const loudestCore = Math.max(...core.map(t => t.gain ?? 0.8));
      for (const t of song.tracks.filter(t => (t.layer ?? 1) > 1)) {
        assert.ok((t.gain ?? 0.8) < loudestCore,
          `boss ${i + 1} layer "${t.id}" is louder than its core mix — escalation must add, not shout`);
      }
    }
  });
});
