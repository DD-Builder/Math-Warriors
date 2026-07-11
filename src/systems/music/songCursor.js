/**
 * Song timeline math — pure, no Web Audio.
 *
 * A song is sections of bars with per-track patterns (times in beats
 * from the section start). buildTimeline flattens that into one
 * sorted absolute-beat event list; eventsBetween answers "which notes
 * fall inside this beat window", handling loop wrap-around, which is
 * everything a lookahead scheduler needs.
 */

export function beatsToSec(beats, bpm) {
  return (beats * 60) / bpm;
}

export function secToBeats(sec, bpm) {
  return (sec * bpm) / 60;
}

/** Swing: delay off-beat 8th notes by `swing` fraction of a half-beat. */
export function applySwing(beat, swing) {
  if (!swing) return beat;
  const frac = beat % 1;
  if (Math.abs(frac - 0.5) < 1e-6) return beat + swing * 0.5;
  return beat;
}

/**
 * @returns {{
 *   totalBeats, loopStartBeat, bpm, swing,
 *   events: [{trackIdx, beat, note, durBeats, vel}] sorted by beat
 * }}
 */
export function buildTimeline(song) {
  const beatsPerBar = song.beatsPerBar || 4;
  const sections = [];
  let cursor = 0;
  for (const s of song.sections) {
    sections.push({ name: s.name, startBeat: cursor, beats: s.bars * beatsPerBar });
    cursor += s.bars * beatsPerBar;
  }
  const totalBeats = cursor;
  let loopStartBeat = 0;
  if (song.loop === false) loopStartBeat = -1; // one-shot
  else if (typeof song.loop === 'string') {
    const target = sections.find((s) => s.name === song.loop);
    loopStartBeat = target ? target.startBeat : 0;
  }

  const events = [];
  song.tracks.forEach((track, trackIdx) => {
    for (const sec of sections) {
      const pattern = track.patterns?.[sec.name];
      if (!pattern) continue;
      for (const ev of pattern) {
        const beat = applySwing(ev.t, song.swing || 0);
        if (beat >= sec.beats) continue; // pattern must fit its section
        events.push({
          trackIdx,
          beat: sec.startBeat + beat,
          note: ev.n,
          durBeats: ev.d ?? 0.5,
          vel: ev.v ?? 0.8,
        });
      }
    }
  });
  events.sort((a, b) => a.beat - b.beat || a.trackIdx - b.trackIdx);
  return { totalBeats, loopStartBeat, bpm: song.bpm, swing: song.swing || 0, events };
}

/**
 * Events in the half-open window [fromBeat, toBeat) of UNROLLED song
 * time (beats keep counting up across loops). Returns events with an
 * `absBeat` in unrolled time. One-shot songs return nothing past the
 * end.
 */
export function eventsBetween(timeline, fromBeat, toBeat) {
  const out = [];
  const { totalBeats, loopStartBeat, events } = timeline;
  if (toBeat <= fromBeat) return out;
  const loopLen = totalBeats - Math.max(0, loopStartBeat);

  for (let abs = Math.floor(fromBeat); abs < toBeat + 1; abs++) {
    // For every event, its unrolled occurrences are:
    //   first pass: beat b (if b in [0,totalBeats))
    //   loops:      totalBeats + k*loopLen + (b - loopStartBeat) for b >= loopStartBeat
    // Rather than solve per-abs, collect below.
    break;
  }
  // Direct approach: walk occurrences per event (songs are small).
  for (const ev of events) {
    // First pass occurrence
    if (ev.beat >= fromBeat && ev.beat < toBeat) {
      out.push({ ...ev, absBeat: ev.beat });
    }
    // Looped occurrences
    if (loopStartBeat >= 0 && ev.beat >= loopStartBeat && loopLen > 0) {
      // occurrences at totalBeats + k*loopLen + (ev.beat - loopStartBeat), k >= 0
      const base = totalBeats + (ev.beat - loopStartBeat);
      const kMin = Math.max(0, Math.ceil((fromBeat - base) / loopLen));
      for (let k = kMin; ; k++) {
        const b = base + k * loopLen;
        if (b >= toBeat) break;
        if (b >= fromBeat) out.push({ ...ev, absBeat: b });
      }
    }
  }
  out.sort((a, b) => a.absBeat - b.absBeat || a.trackIdx - b.trackIdx);
  return out;
}
