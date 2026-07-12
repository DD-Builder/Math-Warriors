import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSong, allSongKeys } from './index.js';
import { noteHz, DRUM_KEYS } from '../theory.js';
import { INSTRUMENT_NAMES } from '../instruments.js';
import { buildTimeline } from '../songCursor.js';

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
