import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SILENT, INTENSITY, MAX_INTENSITY, CORE_LIFT,
  clampIntensity, toIntensity, daypartWeight, resolveTrackGain, resolveMix, isAudible,
  gridBeats, nextBoundaryBeat, planTransition, planMixChange, planBiomeCrossfade, planKeyBridge,
  daypartFromClock, daypartFromHour, daypartFadeSec,
  createEncouragementWatcher, createCueGate,
} from './adaptive.js';
import { OVERWORLD_SONG } from './songs/overworld.js';

/* ── LAYERS ─────────────────────────────────────────────────────────── */

describe('layer resolution', () => {
  const core = { id: 'pad', gain: 0.5 };
  const alert = { id: 'pulse', gain: 0.34, layer: 2 };
  const combat = { id: 'kit', gain: 0.42, layer: 3 };
  const bossLayer = { id: 'herald', gain: 0.36, layer: 4 };

  test('a stem is silent until its layer is reached, then arrives at its written balance', () => {
    assert.equal(resolveTrackGain(alert, { intensity: 1 }), SILENT);
    assert.equal(resolveTrackGain(alert, { intensity: 2 }), 0.34);
    assert.equal(resolveTrackGain(alert, { intensity: 4 }), 0.34);
    assert.equal(resolveTrackGain(bossLayer, { intensity: 3 }), SILENT);
    assert.equal(resolveTrackGain(bossLayer, { intensity: 4 }), 0.36);
  });

  test('core tracks lean in a little, never shout', () => {
    const calm = resolveTrackGain(core, { intensity: 1 });
    const boss = resolveTrackGain(core, { intensity: 4 });
    assert.equal(calm, 0.5);
    assert.ok(boss > calm, 'the core should lift as things escalate');
    assert.ok(boss / calm < 1.25,
      'the jump must come from stems arriving, not from the mix getting louder');
    // and the lift is monotonic across all four steps
    for (let i = 1; i < CORE_LIFT.length; i++) assert.ok(CORE_LIFT[i] > CORE_LIFT[i - 1]);
  });

  test('`until` makes a voice STEP ASIDE — escalation that only adds gets muddy', () => {
    const daydream = { id: 'ripple', gain: 0.5, until: 2 };
    assert.equal(resolveTrackGain(daydream, { intensity: 1 }), 0.5);
    assert.ok(resolveTrackGain(daydream, { intensity: 2 }) > SILENT);
    assert.equal(resolveTrackGain(daydream, { intensity: 3 }), SILENT, 'harp must clear out for combat');
  });

  test('unknown / out-of-range levels never blow up the mix', () => {
    assert.equal(clampIntensity(0), 1);
    assert.equal(clampIntensity(99), MAX_INTENSITY);
    assert.equal(clampIntensity('nonsense'), 1);
    assert.equal(clampIntensity(2.7), 2);
    assert.equal(toIntensity('combat'), INTENSITY.COMBAT);
    assert.equal(toIntensity('BOSS'), 4);
    assert.equal(toIntensity(2), 2);
    assert.equal(resolveTrackGain(null, {}), SILENT);
  });

  test('boss phases 1/2/3 still mean what they always meant', () => {
    // The boss songs shipped with layer:2 and layer:3 tracks and a phase
    // machine that calls setSongIntensity(1..3). Adding a fourth step
    // must not shift any of those.
    assert.equal(resolveTrackGain(alert, { intensity: 2 }), 0.34);
    assert.equal(resolveTrackGain(combat, { intensity: 3 }), 0.42);
    assert.equal(resolveTrackGain(combat, { intensity: 2 }), SILENT);
  });
});

describe('day / night voicing', () => {
  const day = { id: 'lead-day', gain: 0.78, daypart: 'day' };
  const night = { id: 'lead-night', gain: 0.72, daypart: 'night' };
  const always = { id: 'bass', gain: 0.52 };

  test('voicings trade places, and OVERLAP at dusk', () => {
    assert.equal(daypartWeight('day', 'day'), 1);
    assert.equal(daypartWeight('day', 'night'), 0);
    assert.equal(daypartWeight('night', 'dusk'), 0.5);
    assert.equal(daypartWeight(undefined, 'night'), 1, 'untagged tracks play always');

    assert.equal(resolveTrackGain(day, { daypart: 'night' }), SILENT);
    assert.equal(resolveTrackGain(night, { daypart: 'day' }), SILENT);
    // dusk: both audible, neither at full — the golden hour
    assert.ok(isAudible(day, { daypart: 'dusk' }));
    assert.ok(isAudible(night, { daypart: 'dusk' }));
    assert.ok(resolveTrackGain(day, { daypart: 'dusk' }) < resolveTrackGain(day, { daypart: 'day' }));
  });

  test('the ground under the tune never disappears', () => {
    for (const d of ['day', 'dusk', 'night']) {
      assert.ok(isAudible(always, { daypart: d }), `bass went silent at ${d}`);
    }
  });

  test('clock maps to dayparts, wrapping safely', () => {
    assert.equal(daypartFromClock(0.5), 'day');      // noon
    assert.equal(daypartFromClock(0.0), 'night');    // midnight
    assert.equal(daypartFromClock(0.95), 'night');
    assert.equal(daypartFromClock(0.76), 'dusk');    // evening
    assert.equal(daypartFromClock(0.25), 'dusk');    // dawn reads the same
    assert.equal(daypartFromClock(1.5), 'day');      // wraps to 0.5
    assert.equal(daypartFromClock(-0.5), 'day');
    assert.equal(daypartFromClock(NaN), 'day');
    assert.equal(daypartFromHour(12), 'day');
    assert.equal(daypartFromHour(2), 'night');
    assert.ok(daypartFadeSec('day', 'night') > daypartFadeSec('day', 'dusk'));
    assert.equal(daypartFadeSec('day', 'day'), 0);
  });
});

describe('the overworld theme is actually layered', () => {
  const T = OVERWORLD_SONG.tracks;

  test('every mood sounds different, and none of them is silence', () => {
    const heard = (state) => T.filter((t) => isAudible(t, state)).map((t) => t.id);
    const calmDay = heard({ intensity: 1, daypart: 'day' });
    const alertDay = heard({ intensity: 2, daypart: 'day' });
    const combatDay = heard({ intensity: 3, daypart: 'day' });
    const bossDay = heard({ intensity: 4, daypart: 'day' });
    const calmNight = heard({ intensity: 1, daypart: 'night' });

    for (const [name, set] of Object.entries({ calmDay, alertDay, combatDay, bossDay, calmNight })) {
      assert.ok(set.length >= 3, `${name} has only ${set.length} audible stems`);
    }
    assert.notDeepEqual(calmDay, alertDay);
    assert.notDeepEqual(alertDay, combatDay);
    assert.notDeepEqual(combatDay, bossDay);
    assert.notDeepEqual(calmDay, calmNight, 'night must not sound like day');
  });

  test('escalation adds stems and takes the daydreams away', () => {
    const calm = new Set(OVERWORLD_SONG.tracks.filter((t) => isAudible(t, { intensity: 1, daypart: 'day' })).map((t) => t.id));
    const fight = new Set(OVERWORLD_SONG.tracks.filter((t) => isAudible(t, { intensity: 3, daypart: 'day' })).map((t) => t.id));
    assert.ok(fight.has('drive') && fight.has('kit'), 'combat stems must arrive');
    assert.ok(calm.has('ripple-day') && !fight.has('ripple-day'), 'the harp must step aside');
    assert.ok(fight.has('lead-day'), 'the tune itself never leaves');
  });

  test('the day and night leads never both play at full', () => {
    for (const d of ['day', 'dusk', 'night']) {
      const day = resolveTrackGain(T.find((t) => t.id === 'lead-day'), { daypart: d });
      const night = resolveTrackGain(T.find((t) => t.id === 'lead-night'), { daypart: d });
      assert.ok(day <= 0.79 && night <= 0.73);
      assert.ok(!(day > 0.6 && night > 0.6), `two full leads at ${d} — that is a doubling, not a voicing`);
    }
  });

  test('layer stems sit UNDER the core they join', () => {
    const core = T.filter((t) => (t.layer ?? 1) === 1);
    const loudestCore = Math.max(...core.map((t) => t.gain ?? 0.8));
    for (const t of T.filter((x) => (x.layer ?? 1) > 1)) {
      assert.ok((t.gain ?? 0.8) < loudestCore, `layer "${t.id}" is louder than the core mix`);
    }
  });

  test('resolveMix answers for a whole song at once', () => {
    const mix = resolveMix(T, { intensity: 1, daypart: 'day' });
    assert.equal(mix.length, T.length);
    assert.ok(mix.some((g) => g === SILENT), 'some stems are held back at calm');
    assert.ok(mix.some((g) => g > 0.4), 'and some are playing');
  });
});

/* ── MUSICAL TIME ───────────────────────────────────────────────────── */

describe('transitions land on the grid, never mid-phrase', () => {
  test('gridBeats knows the units', () => {
    assert.equal(gridBeats('immediate', 4), 0);
    assert.equal(gridBeats('beat', 4), 1);
    assert.equal(gridBeats('half', 4), 2);
    assert.equal(gridBeats('bar', 4), 4);
    assert.equal(gridBeats('phrase', 4, 4), 16);
    assert.equal(gridBeats('bar', 3), 3, '3/4 songs exist — the waltz boss');
  });

  test('nextBoundaryBeat finds the next line, with room to actually ramp', () => {
    assert.equal(nextBoundaryBeat(0.1, 4), 4);
    assert.equal(nextBoundaryBeat(4.0, 4), 8, 'a boundary we are already on is too late to aim at');
    assert.equal(nextBoundaryBeat(7.5, 4), 8);
    assert.equal(nextBoundaryBeat(7.9, 4), 12,
      'too close to ramp into — a change scheduled 50ms out is a click, so take the next bar');
    assert.equal(nextBoundaryBeat(7.9, 4, 0), 8, 'with no lead requirement, 8 is still reachable');
    assert.equal(nextBoundaryBeat(5, 0), 5, 'immediate means immediate');
  });

  test('a bar-quantised change waits for the downbeat', () => {
    const p = planTransition({ nowBeat: 5.3, beatsPerBar: 4, bpm: 120, quantize: 'bar' });
    assert.equal(p.atBeat, 8);
    assert.equal(p.quantize, 'bar');
    assert.ok(Math.abs(p.waitSec - (2.7 * 0.5)) < 1e-9);
    assert.equal(p.atBeat % 4, 0, 'must land on a bar line');
  });

  test('dusk can wait for a whole phrase', () => {
    const p = planTransition({ nowBeat: 3, beatsPerBar: 4, bpm: 100, quantize: 'phrase', phraseBars: 4 });
    assert.equal(p.atBeat, 16);
    assert.equal(p.quantize, 'phrase');
  });

  test('a monster lunging at you does NOT wait — the plan downgrades', () => {
    // asked for a phrase, but can only afford one bar of patience
    const p = planTransition({
      nowBeat: 3, beatsPerBar: 4, bpm: 100, quantize: 'phrase', maxWaitBeats: 4,
    });
    assert.ok(p.waitBeats <= 4, `waited ${p.waitBeats} beats with a 4-beat budget`);
    assert.equal(p.atBeat, 4);
    assert.equal(p.quantize, 'bar');
  });

  test('a zero budget collapses all the way to immediate rather than missing the moment', () => {
    const p = planTransition({ nowBeat: 3.1, beatsPerBar: 4, quantize: 'bar', maxWaitBeats: 0 });
    assert.equal(p.quantize, 'immediate');
    assert.equal(p.waitBeats, 0);
  });

  test('fade length is expressed in beats, so it scales with tempo', () => {
    const slow = planTransition({ bpm: 60, fadeBeats: 2 });
    const fast = planTransition({ bpm: 120, fadeBeats: 2 });
    assert.equal(slow.fadeSec, 2);
    assert.equal(fast.fadeSec, 1);
    assert.ok(planTransition({ bpm: 120, fadeBeats: 0 }).fadeSec > 0, 'never a zero-length ramp (that clicks)');
  });

  test('the plan is always reachable: waits are non-negative and land ahead of now', () => {
    for (let b = 0; b < 40; b += 0.37) {
      const p = planTransition({ nowBeat: b, beatsPerBar: 4, quantize: 'bar' });
      assert.ok(p.waitBeats >= 0);
      assert.ok(p.atBeat >= b);
    }
  });
});

describe('the mood change, end to end', () => {
  const at = (plan, id) => plan.changes.find((c) => c.id === id);

  test('walking into a fight brings the riff in, sends the harp away, leaves the tune alone', () => {
    const plan = planMixChange(OVERWORLD_SONG, {
      nowBeat: 13.4,
      from: { intensity: 1, daypart: 'day' },
      to: { intensity: 3, daypart: 'day' },
      quantize: 'bar',
    });
    assert.equal(plan.atBeat, 16, 'and it does all of it on a bar line');
    assert.ok(at(plan, 'drive').arriving && at(plan, 'kit').arriving);
    assert.ok(at(plan, 'ripple-day').leaving, 'the daydreaming harp must clear out');
    assert.ok(!at(plan, 'lead-day').leaving, 'the melody never leaves');
    assert.equal(at(plan, 'herald').to, SILENT, 'the boss layer stays back');
  });

  test('coming back down is the exact inverse — nothing gets stranded', () => {
    const up = planMixChange(OVERWORLD_SONG, {
      from: { intensity: 1, daypart: 'day' }, to: { intensity: 3, daypart: 'day' },
    });
    const down = planMixChange(OVERWORLD_SONG, {
      from: { intensity: 3, daypart: 'day' }, to: { intensity: 1, daypart: 'day' },
    });
    for (const c of up.changes) {
      const back = down.changes[c.index];
      assert.equal(back.to, c.from, `${c.id} did not return to where it started`);
      assert.equal(back.arriving, c.leaving);
      assert.equal(back.leaving, c.arriving);
    }
  });

  test('nightfall swaps the voicing and touches nothing else', () => {
    const plan = planMixChange(OVERWORLD_SONG, {
      from: { intensity: 1, daypart: 'day' },
      to: { intensity: 1, daypart: 'night' },
      quantize: 'phrase',
    });
    const moved = plan.changes.filter((c) => c.changed).map((c) => c.id);
    assert.ok(moved.includes('lead-day') && moved.includes('lead-night'));
    assert.ok(!moved.includes('bass') && !moved.includes('pad'),
      'the ground under the tune must not flinch at dusk');
    assert.equal(plan.atBeat % 16, 0, 'a slow ambient move waits for a phrase');
  });

  test('every target is a legal gain — nothing ever ramps to zero or above unity', () => {
    for (const intensity of [1, 2, 3, 4]) {
      for (const daypart of ['day', 'dusk', 'night']) {
        for (const c of planMixChange(OVERWORLD_SONG, { to: { intensity, daypart } }).changes) {
          assert.ok(c.to >= SILENT, `${c.id} ramps to ${c.to} — exponential ramps cannot reach 0`);
          assert.ok(c.to <= 1, `${c.id} ramps to ${c.to} — that will hit the limiter`);
        }
      }
    }
  });

  test('a song with no tracks produces a plan, not a crash', () => {
    const plan = planMixChange({ bpm: 90 }, { to: { intensity: 2 } });
    assert.deepEqual(plan.changes, []);
    assert.ok(plan.fadeSec > 0);
    assert.deepEqual(planMixChange(null, {}).changes, []);
  });
});

describe('biome crossfade', () => {
  test('overlaps for whole bars, starting on a bar line', () => {
    const p = planBiomeCrossfade({ nowBeat: 2.5, beatsPerBar: 4, fromBpm: 120, toBpm: 96, bars: 2 });
    assert.equal(p.atBeat, 4);
    assert.equal(p.bars, 2);
    // 2 bars at 120bpm = 8 beats = 4 seconds of overlap
    assert.ok(Math.abs(p.fadeOutSec - 4) < 1e-9);
    assert.ok(p.fadeInSec < p.fadeOutSec,
      'the new theme should be established before the old one is gone');
    assert.ok(p.startInSec >= 0);
  });

  test('never waits more than a bar to begin', () => {
    for (let b = 0; b < 20; b += 0.31) {
      const p = planBiomeCrossfade({ nowBeat: b, beatsPerBar: 4, fromBpm: 100 });
      assert.ok(p.waitBeats <= 4.001, `waited ${p.waitBeats} beats to start a crossfade`);
    }
  });
});

describe('staying in key across a biome join', () => {
  test('relative keys share their whole chord — the join is invisible', () => {
    const b = planKeyBridge('C', 'maj', 'A', 'min');
    assert.equal(b.kind, 'common-chord');
    // C-E-G against A-C-E: C and E belong to both chords, so the pad can
    // simply hold them and let the bass decide which key we are in.
    assert.deepEqual(new Set(b.pivots), new Set(['C', 'E']));
    assert.equal(b.shared, 3, 'every note of C major lives in A minor');
    assert.equal(b.semis, -3, 'the short way round, not up a major sixth');
  });

  test('a step away still finds common tones to hold', () => {
    const b = planKeyBridge('C', 'maj', 'D', 'min');   // Garden → Emberworks
    assert.ok(b.pivots.length >= 1);
    assert.ok(['common-chord', 'common-tone'].includes(b.kind));
    assert.equal(b.semis, 2);
  });

  test('a tritone apart has nothing in common, so the bridge LEADS instead', () => {
    const b = planKeyBridge('C', 'maj', 'F#', 'maj');
    assert.equal(b.kind, 'dominant');
    assert.ok(b.pivots.includes('C#'), 'the incoming dominant pulls toward the new key');
    assert.ok(Math.abs(b.semis) <= 6);
  });

  test('the modulation always takes the short way (never more than a tritone)', () => {
    const tonics = ['C', 'D', 'E', 'F', 'G', 'A'];
    for (const a of tonics) for (const c of tonics) {
      const b = planKeyBridge(a, 'maj', c, 'min');
      assert.ok(b.semis >= -5 && b.semis <= 6, `${a}→${c} modulated by ${b.semis}`);
      assert.ok(b.pivots.length >= 1, `${a}→${c} produced no pivot to hold`);
    }
  });
});

/* ── RESTRAINT ──────────────────────────────────────────────────────── */

describe('the score knows when to keep quiet', () => {
  test('warmth arrives after three misses — not one, not two', () => {
    const w = createEncouragementWatcher();
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), 'encourage');
  });

  test('and does not nag on every miss after that', () => {
    const w = createEncouragementWatcher({ threshold: 3, repeatEvery: 3 });
    w.record(false); w.record(false);
    assert.equal(w.record(false), 'encourage');
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), 'encourage', 'still stuck three later: say it once more');
  });

  test('one right answer clears the slate completely', () => {
    const w = createEncouragementWatcher();
    w.record(false); w.record(false);
    assert.equal(w.record(true), null);
    assert.equal(w.streak, 0);
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), null);
    assert.equal(w.record(false), 'encourage', 'the count restarted from the correct answer');
  });

  test('a long correct run never triggers anything', () => {
    const w = createEncouragementWatcher();
    for (let i = 0; i < 50; i++) assert.equal(w.record(true), null);
  });

  test('the only thing it can ever say is encouragement', () => {
    const w = createEncouragementWatcher();
    const said = new Set();
    for (let i = 0; i < 40; i++) said.add(w.record(i % 7 === 0));
    said.delete(null);
    assert.deepEqual([...said], ['encourage']);
  });

  test('reset() forgets a streak when the player leaves the fight', () => {
    const w = createEncouragementWatcher();
    w.record(false); w.record(false);
    w.reset();
    assert.equal(w.streak, 0);
    assert.equal(w.record(false), null);
  });
});

describe('cue gate', () => {
  test('a grove full of secrets chimes once, then again later', () => {
    const g = createCueGate({ minGapMs: 2500 });
    assert.equal(g.allow(1000), true);
    assert.equal(g.allow(1200), false);
    assert.equal(g.allow(3000), false);
    assert.equal(g.allow(3600), true);
  });

  test('reset re-arms it (new scene, new grove)', () => {
    const g = createCueGate({ minGapMs: 2500 });
    g.allow(0);
    assert.equal(g.allow(100), false);
    g.reset();
    assert.equal(g.allow(100), true);
  });
});
