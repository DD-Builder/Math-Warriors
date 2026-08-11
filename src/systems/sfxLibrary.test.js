/**
 * Every sound in the game, built and audited without an AudioContext.
 *
 * The failure this guards against is specific and ugly: a single NaN in
 * a frequency or gain makes AudioParam.setValueAtTime THROW, playSfx
 * swallows the error, and that one sound goes permanently silent with
 * no console noise. On a device, on a Tuesday, six months later. So
 * every registered key gets built here and every number in the plan is
 * checked for finiteness and sane range.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SFX, SFX_KEYS, SFX_ALIASES, SURFACES, SURFACE_NAMES, SURFACE_ALIASES,
  GLIDE_WIND, GAIN_CAP, CLASS_ATTACK,
  buildSfx, checkPlan, hasSfx, resolveSfxKey, resolveSurface, surfaceForTile,
  attackKeyForClass, footstepPlan, landPlan, createChain, degHz,
  setFootstepSurface, getFootstepSurface, resetFootsteps,
} from './sfxLibrary.js';

/** Deterministic stand-in for Math.random so failures are reproducible. */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Option shapes that exercise every conditional branch in the builders.
const OPT_CASES = [
  {},
  { rng: seeded(7) },
  { surface: 'water', run: true, index: 3, rng: seeded(11) },
  { surface: 'nonsense-material', effort: 0.4, index: 0, rng: seeded(3) },
  { weight: 0.3, size: 0.4, chain: 0, streak: 0, rng: seeded(5) },
  { weight: 2, size: 1.6, chain: 5, streak: 8, rng: seeded(9) },
  { weight: 1.45, chain: 12, streak: 14, index: 6, rng: seeded(13) },
];

describe('sfx registry', () => {
  test('every registered key builds a valid, finite plan under every option shape', () => {
    assert.ok(SFX_KEYS.length >= 45, `expected a real library, got ${SFX_KEYS.length} keys`);
    for (const key of SFX_KEYS) {
      for (const opts of OPT_CASES) {
        const plan = buildSfx(key, opts);
        assert.ok(plan, `${key} built nothing`);
        assert.equal(plan.key, key);
        const problems = checkPlan(plan);
        assert.equal(problems.length, 0,
          `${key} ${JSON.stringify(Object.keys(opts))} -> ${problems.join(', ')}`);
      }
    }
  });

  test('every key produces audible layers and a sane duration', () => {
    for (const key of SFX_KEYS) {
      const plan = buildSfx(key, { rng: seeded(21) });
      assert.ok(plan.layers.length >= 1, `${key} has no layers`);
      assert.ok(plan.dur > 0.01 && plan.dur < 6, `${key} dur=${plan.dur}`);
      const loudest = Math.max(...plan.layers.map((l) => l.gain));
      assert.ok(loudest > 0.004, `${key} is effectively silent (peak ${loudest})`);
    }
  });

  test('no plan exceeds the concurrent gain budget once scaled', () => {
    for (const key of SFX_KEYS) {
      const plan = buildSfx(key, { rng: seeded(33) });
      // Recompute the worst simultaneous sum from the FINAL layers.
      let worst = 0;
      for (const a of plan.layers) {
        let sum = 0;
        for (const b of plan.layers) {
          if (b.t <= a.t + 1e-6 && a.t < b.t + b.dur + b.release) sum += b.gain;
        }
        worst = Math.max(worst, sum);
      }
      assert.ok(worst <= GAIN_CAP + 1e-6, `${key} sums to ${worst.toFixed(3)} > ${GAIN_CAP}`);
    }
  });

  test('a deliberately broken builder is caught rather than shipped', () => {
    // Proves checkPlan actually bites — clamping must not launder a NaN.
    const bad = { key: 'x', dur: 1, layers: [{ ...buildSfx('ui/press').layers[0], freq: NaN }] };
    assert.ok(checkPlan(bad).some((p) => p.includes('freq')), 'NaN freq slipped through');
    const neg = { key: 'x', dur: 1, layers: [{ ...buildSfx('ui/press').layers[0], gain: 5 }] };
    assert.ok(checkPlan(neg).some((p) => p.includes('too hot')));
  });

  test('unknown keys return null instead of throwing', () => {
    assert.equal(buildSfx('nope/nothing'), null);
    assert.equal(hasSfx('nope/nothing'), false);
    assert.equal(resolveSfxKey('nope/nothing'), null);
  });

  test('every legacy key still resolves to a real sound', () => {
    for (const [legacy, target] of Object.entries(SFX_ALIASES)) {
      assert.ok(SFX[target], `${legacy} -> ${target} which does not exist`);
      assert.equal(resolveSfxKey(legacy), target);
      assert.ok(checkPlan(buildSfx(legacy)).length === 0);
    }
  });

  test('the sounds the rest of the game already calls all exist', () => {
    const inUse = [
      'ui/click', 'ui/hover', 'ui/confirm', 'ui/back',
      'battle/correct', 'battle/wrong', 'battle/hit', 'battle/hit-hero',
      'battle/hit_hero', 'battle/hit-enemy', 'battle/heal', 'battle/victory',
      'battle/defeat', 'battle/level-up', 'battle/level_up', 'battle/critical',
      'world/chest', 'world/gold', 'world/fairy', 'world/footstep',
      'world/encounter', 'world/floor-complete',
    ];
    for (const k of inUse) assert.ok(hasSfx(k), `${k} is called in-game but not registered`);
  });

  test('the brief is covered: traversal, interaction, combat and UI all present', () => {
    const required = [
      'move/step/grass', 'move/step/stone', 'move/step/sand', 'move/step/water',
      'move/step/snow', 'move/step/wood', 'move/jump', 'move/land',
      'move/land-heavy', 'move/splash', 'move/swim', 'move/climb',
      'move/glider-open',
      'world/chest-open', 'world/coin', 'world/potion', 'world/fountain',
      'world/portal', 'world/door-unlock', 'world/secret', 'world/rescue',
      'combat/attack-knight', 'combat/attack-wizard', 'combat/attack-bunny',
      'combat/impact-light', 'combat/impact-medium', 'combat/impact-heavy',
      'combat/enemy-hurt', 'combat/enemy-defeat', 'combat/boss-phase',
      'combat/victory',
      'ui/press', 'ui/page-turn', 'ui/correct', 'ui/wrong', 'ui/streak',
    ];
    for (const k of required) assert.ok(SFX[k], `missing required sound ${k}`);
  });
});

describe('surfaces', () => {
  test('every surface has a complete palette', () => {
    for (const name of SURFACE_NAMES) {
      const S = SURFACES[name];
      for (const part of ['body', 'grit', 'tail', 'land']) {
        assert.ok(S[part], `${name} missing ${part}`);
      }
      for (const v of [S.gain, S.dur, S.body.freq, S.grit.freq, S.tail.freq, S.land.gain]) {
        assert.ok(Number.isFinite(v) && v > 0, `${name} has a bad number: ${v}`);
      }
    }
  });

  test('every alias points at a real surface', () => {
    for (const [alias, target] of Object.entries(SURFACE_ALIASES)) {
      assert.ok(SURFACES[target], `alias ${alias} -> unknown surface ${target}`);
    }
  });

  test('resolveSurface is total — anything in, a real surface out', () => {
    for (const v of ['PATH', ' Shallows ', 'plank', 'zzz', '', null, undefined, 42]) {
      assert.ok(SURFACES[resolveSurface(v)], `resolveSurface(${String(v)}) failed`);
    }
  });

  test('tile + floor picks the material, not just the tile', () => {
    assert.equal(surfaceForTile(1, 1), 'grass');   // Garden ground
    assert.equal(surfaceForTile(1, 5), 'snow');    // Frozen Peak ground
    assert.equal(surfaceForTile(2, 1), 'stone');   // a garden path
    assert.equal(surfaceForTile(2, 7), 'wood');    // market boardwalk
    assert.equal(surfaceForTile(3, 9), 'water');   // water is water anywhere
    assert.ok(SURFACES[surfaceForTile(1, 99)]);    // unknown floor still works
  });

  test('the current surface is remembered between steps', () => {
    setFootstepSurface('cobble');
    assert.equal(getFootstepSurface(), 'stone');
    setFootstepSurface('grass');
  });
});

describe('footstep variation', () => {
  test('consecutive steps differ in pitch, gain and pan', () => {
    resetFootsteps();
    const rng = seeded(101);
    const steps = [];
    for (let i = 0; i < 14; i++) steps.push(footstepPlan('grass', { index: i, rng }));

    const grit = steps.map((s) => s.find((l) => l.kind === 'noise'));
    const rates = grit.map((l) => l.rate);
    const gains = grit.map((l) => l.gain);
    assert.equal(new Set(rates.map((r) => r.toFixed(6))).size, rates.length,
      'two steps in a row had identical pitch — that is the machine-gun bug');
    assert.equal(new Set(gains.map((g) => g.toFixed(6))).size, gains.length);

    // Feet alternate sides.
    const pans = grit.map((l) => Math.sign(l.pan));
    for (let i = 1; i < pans.length; i++) {
      assert.notEqual(pans[i], pans[i - 1], `steps ${i - 1},${i} came from the same foot`);
    }
  });

  test('the pitch cycle is coprime with the gait — no lock-step every 2 steps', () => {
    // Same rng draw for every index isolates the deterministic cycle.
    const pitchAt = (i) => footstepPlan('stone', { index: i, rng: () => 0.5 })
      .find((l) => l.kind === 'noise').rate;
    const first = pitchAt(0);
    assert.notEqual(pitchAt(2).toFixed(6), first.toFixed(6), 'same foot repeats immediately');
    assert.equal(pitchAt(14).toFixed(6), first.toFixed(6), 'super-period should be 14 steps');
  });

  test('running is shorter, brighter and louder than walking', () => {
    const walk = footstepPlan('sand', { index: 0, rng: () => 0.5 });
    const run = footstepPlan('sand', { index: 0, run: true, rng: () => 0.5 });
    const w = walk.find((l) => l.kind === 'noise');
    const r = run.find((l) => l.kind === 'noise');
    assert.ok(r.dur < w.dur, 'a run step should be shorter');
    assert.ok(r.filter.freq > w.filter.freq, 'a run step should be brighter');
    assert.ok(r.gain > w.gain, 'a run step should be louder');
  });

  test('each surface sounds like itself', () => {
    const grit = (s) => footstepPlan(s, { index: 0, rng: () => 0.5 })
      .find((l) => l.kind === 'noise').filter.freq;
    assert.ok(grit('stone') > grit('grass'), 'stone should be brighter than grass');
    assert.ok(grit('grass') > grit('sand'), 'grass should be brighter than sand');
    assert.ok(grit('cloud') < grit('snow'), 'cloud should be the dullest thing you walk on');
    // Water and snow and wood and crystal each add their own signature voice.
    for (const s of ['water', 'snow', 'wood', 'crystal']) {
      assert.ok(footstepPlan(s, { index: 0, rng: () => 0.5 }).length >= 4,
        `${s} should carry an extra character layer`);
    }
  });

  test('landings are heavier than steps and heavy landings heavier still', () => {
    const peak = (ls) => Math.max(...ls.map((l) => l.gain));
    const step = peak(footstepPlan('stone', { index: 0, rng: () => 0.5 }));
    const soft = peak(landPlan('stone', { index: 0, weight: 1, rng: () => 0.5 }));
    const hard = peak(landPlan('stone', { index: 0, weight: 1.7, rng: () => 0.5 }));
    assert.ok(soft > step, 'a landing must outweigh a step');
    assert.ok(hard > soft, 'a heavy landing must outweigh a normal one');
    assert.ok(landPlan('stone', { index: 0, weight: 1.7, rng: () => 0.5 }).length
      > landPlan('stone', { index: 0, weight: 1, rng: () => 0.5 }).length,
    'a heavy landing should add debris and an exhale');
  });
});

describe('chains', () => {
  test('coins in a row climb, then reset after a gap', () => {
    const c = createChain({ window: 1.1, max: 12 });
    assert.equal(c.next(10), 0);
    assert.equal(c.next(10.3), 1);
    assert.equal(c.next(10.6), 2);
    assert.equal(c.next(30), 0, 'a long gap must start a new run');
    assert.equal(c.peek(), 0);
  });

  test('the chain clamps so a long run never goes shrill', () => {
    const c = createChain({ window: 99, max: 4 });
    for (let i = 0; i < 20; i++) c.next(i * 0.1);
    assert.equal(c.peek(), 4);
  });

  test('each coin in a run is a higher pitch than the last', () => {
    const pitch = (chain) => buildSfx('world/coin', { chain, rng: () => 0.5 }).layers[0].freq;
    let prev = 0;
    for (let n = 0; n <= 9; n++) {
      const f = pitch(n);
      assert.ok(f > prev, `coin ${n} (${f}Hz) did not rise above ${prev}Hz`);
      prev = f;
    }
  });

  test('each streak step rises a scale degree', () => {
    const pitch = (streak) => buildSfx('ui/streak', { streak }).layers[0].freq;
    let prev = 0;
    for (let n = 0; n <= 12; n++) {
      const f = pitch(n);
      assert.ok(f > prev, `streak ${n} did not rise`);
      prev = f;
    }
    // and it stays inside a musical range rather than climbing forever
    assert.ok(pitch(14) < 5000, 'streak pitch must stay listenable');
    assert.equal(pitch(99), pitch(14), 'streak must clamp');
  });

  test('pentatonic degrees are consonant and ordered', () => {
    assert.ok(Math.abs(degHz(0) - 523.25) < 0.01);
    assert.ok(Math.abs(degHz(5) - 1046.5) < 0.5, 'degree 5 should be the octave');
    for (let i = 1; i < 15; i++) assert.ok(degHz(i) > degHz(i - 1));
  });
});

describe('kindness rules', () => {
  test('the wrong-answer sound is soft, dull, and ends by lifting back up', () => {
    const plan = buildSfx('ui/wrong');
    assert.ok(plan.layers.every((l) => l.kind === 'tone'),
      'no noise bursts in the wrong-answer sound');
    assert.ok(plan.layers.every((l) => l.type !== 'sawtooth' && l.type !== 'square'),
      'no harsh waveforms in the wrong-answer sound');
    assert.ok(plan.peak < 0.25, `wrong answer is too loud (${plan.peak})`);

    const correct = buildSfx('ui/correct');
    assert.ok(plan.peak < correct.peak, 'a mistake must never be louder than a success');

    // The last thing you hear must be higher than the note before it.
    const byTime = [...plan.layers].sort((a, b) => a.t - b.t);
    const last = byTime[byTime.length - 1];
    const dipped = byTime.find((l) => l.freqEnd != null);
    assert.ok(last.freq > dipped.freqEnd,
      'the wrong-answer sound must end on a lift, not on the low note');
  });

  test('the correct-answer sound rises', () => {
    const tones = buildSfx('ui/correct').layers
      .filter((l) => l.kind === 'tone').sort((a, b) => a.t - b.t);
    assert.ok(tones[tones.length - 1].freq > tones[0].freq);
    // and it does not simply repeat one note louder
    assert.ok(new Set(tones.map((l) => l.freq)).size >= 3);
  });

  test('nothing in the library is a bare sine beep', () => {
    for (const key of SFX_KEYS) {
      const plan = buildSfx(key, { rng: seeded(77) });
      const layered = plan.layers.length > 1;
      const shaped = plan.layers.some((l) => l.filter || l.fm || l.vib || l.freqEnd != null);
      assert.ok(layered || shaped, `${key} is a single unshaped tone`);
    }
  });
});

describe('class attacks and the wind bed', () => {
  test('every class maps to a sound that exists', () => {
    for (const [cls, key] of Object.entries(CLASS_ATTACK)) {
      assert.ok(SFX[key], `${cls} -> ${key} which does not exist`);
    }
    assert.equal(attackKeyForClass('WIZARD'), 'combat/attack-wizard');
    assert.equal(attackKeyForClass(' Bunny '), 'combat/attack-bunny');
    assert.equal(attackKeyForClass('some-new-class'), 'combat/attack-knight');
    assert.equal(attackKeyForClass(null), 'combat/attack-knight');
  });

  test('the three class attacks are genuinely different sounds', () => {
    const shape = (k) => {
      const p = buildSfx(k, { rng: () => 0.5 });
      return `${p.layers.length}:${p.dur.toFixed(2)}`;
    };
    const shapes = new Set(['combat/attack-knight', 'combat/attack-wizard', 'combat/attack-bunny'].map(shape));
    assert.equal(shapes.size, 3);
    assert.ok(buildSfx('combat/attack-bunny').dur < buildSfx('combat/attack-wizard').dur,
      'the bunny must be the quickest');
  });

  test('impact weight actually changes the weight', () => {
    const low = (k) => Math.min(...buildSfx(k, { rng: () => 0.5 }).layers
      .filter((l) => l.kind === 'tone').map((l) => l.freq));
    assert.ok(low('combat/impact-heavy') < low('combat/impact-medium'));
    assert.ok(low('combat/impact-medium') < low('combat/impact-light'));
  });

  test('glide wind parameters are finite and in range', () => {
    assert.ok(Number.isFinite(GLIDE_WIND.gain) && GLIDE_WIND.gain > 0 && GLIDE_WIND.gain < 0.3);
    assert.ok(GLIDE_WIND.layers.length >= 1);
    for (const L of GLIDE_WIND.layers) {
      for (const f of ['freq', 'freqSpan', 'q', 'rate', 'gain', 'pan', 'lfoRate', 'lfoDepth']) {
        assert.ok(Number.isFinite(L[f]), `glide wind ${f}=${L[f]}`);
      }
      assert.ok(L.freq > 0 && L.freq + L.freqSpan + L.lfoDepth < 20000);
      assert.ok(Math.abs(L.pan) <= 1);
      assert.ok(L.rate > 0);
    }
  });
});
