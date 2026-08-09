import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD, VOICE_BUDGET, LOW_BUDGET, CULL_GAIN, STICKY, SHORE_REACH,
  INDOOR_DUCK, INTERIOR_KEEP, WET, BED_IDS, BIOME_BEDS,
  LOOP_VOICES, ONESHOT_VOICES,
  clamp01, smoothstep, approach, distanceGain, rotateByQuat, listenerVectors,
  bedTargets, topBeds, resolveBeds, planVoices, wetTarget, fieldFor, createAudio3D,
} from './audio3d.js';

const EPS = 1e-9;
function close(a, b, tol = 1e-6, msg) {
  assert.ok(Math.abs(a - b) <= tol, msg || `${a} !~= ${b}`);
}

describe('the distance law', () => {
  test('reproduces WebAudio inverse exactly at the reference distance', () => {
    close(distanceGain(FIELD.refDistance), 1);
    close(distanceGain(0), 1, EPS, 'clamped at ref — no gain above 1');
    close(distanceGain(-5), 1);
  });

  test('is monotonically quieter with distance', () => {
    let prev = Infinity;
    for (let d = 0; d <= 300; d += 5) {
      const g = distanceGain(d);
      assert.ok(g <= prev + EPS, `gain rose at ${d} m`);
      prev = g;
    }
  });

  test('freezes at maxDistance instead of dropping to zero', () => {
    const atMax = distanceGain(FIELD.maxDistance);
    close(distanceGain(FIELD.maxDistance * 3), atMax);
    assert.ok(atMax > 0.08, `a clamped cue must still be findable, got ${atMax}`);
  });

  test('a child never loses a cue entirely across the playable world', () => {
    // 480 m island, camera roughly at the middle of it: even a landmark on the
    // far side of a biome has to stay above the cull threshold, or a sound cue
    // stops being a wayfinding tool.
    assert.ok(distanceGain(60) > 0.2, 'mid-range cue too quiet');
    assert.ok(distanceGain(120) > CULL_GAIN * 2, 'long-range cue culled too eagerly');
  });

  test('honours per-emitter overrides (a waterfall carries further)', () => {
    const wf = { refDistance: 22, maxDistance: 220, rolloffFactor: 0.4 };
    assert.ok(distanceGain(120, wf) > distanceGain(120), 'override did not carry');
    close(distanceGain(22, wf), 1);
  });

  test('degenerate specs are clamped, not passed to createPanner', () => {
    // refDistance 0 throws in WebAudio AND makes the gain formula return 0,
    // which would cull an emitter the player is standing inside.
    const f = fieldFor({ refDistance: 0, maxDistance: -5, rolloffFactor: -1 });
    assert.ok(f.refDistance > 0);
    assert.ok(f.maxDistance > f.refDistance);
    assert.ok(f.rolloffFactor >= 0);
    assert.ok(distanceGain(0, { refDistance: 0 }) > 0.9);
    for (const bad of [{}, { refDistance: NaN }, { maxDistance: Infinity }, { rolloffFactor: null }]) {
      const g = distanceGain(30, bad);
      assert.ok(Number.isFinite(g) && g > 0 && g <= 1, JSON.stringify(bad));
    }
  });

  test('the rolloff is gentler than physical inverse-square', () => {
    // rolloffFactor 1 IS the physical law; ours must be softer at every range.
    for (const d of [20, 40, 80, 160]) {
      assert.ok(distanceGain(d) > distanceGain(d, { rolloffFactor: 1 }), `not gentler at ${d}`);
    }
  });
});

describe('listener basis from a camera quaternion', () => {
  test('identity looks down -Z with +Y up', () => {
    const { forward, up } = listenerVectors({ x: 0, y: 0, z: 0, w: 1 });
    forward.forEach((v, i) => close(v, [0, 0, -1][i]));
    up.forEach((v, i) => close(v, [0, 1, 0][i]));
  });

  test('a 90 degree yaw puts the world on the correct side', () => {
    // +90 deg about Y. A camera turned this way looks down world -X, so a
    // sound at +X is now BEHIND-RIGHT, not ahead. Getting the sign wrong here
    // mirrors the entire mix and is invisible in a screenshot.
    const s = Math.sin(Math.PI / 4);
    const { forward, up } = listenerVectors({ x: 0, y: s, z: 0, w: Math.cos(Math.PI / 4) });
    close(forward[0], -1);
    close(forward[1], 0);
    close(forward[2], 0, 1e-9);
    up.forEach((v, i) => close(v, [0, 1, 0][i], 1e-9));
  });

  test('a pitched camera tilts the up vector but keeps the basis orthonormal', () => {
    // 30 deg about X.
    const a = Math.PI / 6;
    const q = { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
    const { forward, up } = listenerVectors(q);
    const dot = forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2];
    close(dot, 0, 1e-9, 'forward and up must stay perpendicular');
    for (const v of [forward, up]) {
      close(Math.hypot(v[0], v[1], v[2]), 1, 1e-9, 'basis vector must stay unit length');
    }
    assert.ok(forward[1] > 0, 'a +X rotation should tilt the look upward');
  });

  test('a garbage quaternion degrades to the identity basis, never NaN', () => {
    const { forward, up } = listenerVectors(null);
    for (const v of [...forward, ...up]) assert.ok(Number.isFinite(v));
    close(forward[2], -1);
  });

  test('rotateByQuat round-trips through a conjugate', () => {
    const a = 0.7;
    const q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
    const qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const [x, y, z] = rotateByQuat(3, -2, 5, q);
    const back = rotateByQuat(x, y, z, qi);
    [3, -2, 5].forEach((v, i) => close(back[i], v, 1e-9));
  });
});

describe('ambient bed mixing', () => {
  test('every biome in the table only names known beds', () => {
    for (const [biome, mix] of Object.entries(BIOME_BEDS)) {
      for (const id of Object.keys(mix)) {
        assert.ok(BED_IDS.includes(id), `${biome} names unknown bed "${id}"`);
        assert.ok(mix[id] > 0 && mix[id] <= 1, `${biome}.${id} out of range`);
      }
    }
  });

  test('every bed id is used by at least one biome', () => {
    const used = new Set();
    for (const mix of Object.values(BIOME_BEDS)) for (const id of Object.keys(mix)) used.add(id);
    for (const id of BED_IDS) assert.ok(used.has(id), `bed "${id}" is dead weight`);
  });

  test('the brief is honoured: the right bed dominates in the right place', () => {
    const loudest = (o) => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
    const far = { shoreDist: 999 };
    assert.equal(loudest(bedTargets({ biome: 'garden', ...far })), 'birds');
    assert.equal(loudest(bedTargets({ biome: 'tidepool', shoreDist: 4 })), 'surf');
    assert.equal(loudest(bedTargets({ biome: 'ember', ...far })), 'roar');
    assert.equal(loudest(bedTargets({ biome: 'sky', ...far })), 'chimes');
    assert.equal(loudest(bedTargets({ biome: 'library', ...far })), 'rustle');
    assert.equal(loudest(bedTargets({ biome: 'market', ...far })), 'murmur');
  });

  test('always returns the full bed set, all finite and in 0..1', () => {
    for (const biome of [...Object.keys(BIOME_BEDS), 'nonsense-biome']) {
      const t = bedTargets({ biome, shoreDist: 30, night: 0.4, wind: 0.6 });
      assert.deepEqual(Object.keys(t).sort(), [...BED_IDS].sort(), biome);
      for (const id of BED_IDS) {
        assert.ok(Number.isFinite(t[id]) && t[id] >= 0 && t[id] <= 1, `${biome}.${id} = ${t[id]}`);
      }
    }
  });

  test('an unknown biome falls back to the garden rather than to silence', () => {
    const t = bedTargets({ biome: 'atlantis', shoreDist: 999 });
    assert.ok(t.birds > 0.5);
  });

  test('surf follows the waterline anywhere on the island, not just the beach', () => {
    // Standing on the frost coast: the biome mix has no surf at all, but the
    // sea is ten metres away and you must hear it.
    const inland = bedTargets({ biome: 'frost', shoreDist: 999 });
    const coast = bedTargets({ biome: 'frost', shoreDist: 10 });
    close(inland.surf, 0);
    assert.ok(coast.surf > 0.6, `coastal surf too quiet: ${coast.surf}`);
  });

  test('surf fades out smoothly over the shore reach and never snaps', () => {
    let prev = Infinity;
    for (let d = 0; d <= SHORE_REACH + 20; d += 2) {
      const s = bedTargets({ biome: 'frost', shoreDist: d }).surf;
      assert.ok(s <= prev + EPS, `surf rose walking inland at ${d} m`);
      assert.ok(Math.abs(s - prev) < 0.2 || prev === Infinity, `surf snapped at ${d} m`);
      prev = s;
    }
    close(prev, 0);
  });

  test('the tidepool biome keeps its surf even standing away from the water', () => {
    assert.ok(bedTargets({ biome: 'tidepool', shoreDist: 999 }).surf > 0.9);
  });

  test('birds sleep at night; wind does not', () => {
    const day = bedTargets({ biome: 'garden', shoreDist: 999, night: 0 });
    const night = bedTargets({ biome: 'garden', shoreDist: 999, night: 1 });
    assert.ok(night.birds < day.birds * 0.25, 'birds should be nearly gone at night');
    assert.ok(night.birds >= 0, 'never negative');
    close(night.wind, day.wind);
  });

  test('weather wind lifts the wind bed and stays clamped', () => {
    const calm = bedTargets({ biome: 'sky', shoreDist: 999, wind: 0 });
    const gale = bedTargets({ biome: 'sky', shoreDist: 999, wind: 1 });
    assert.ok(gale.wind > calm.wind);
    assert.ok(gale.wind <= 1);
  });

  test('indoors ducks the outdoor world but keeps interior character', () => {
    const out = bedTargets({ biome: 'library', shoreDist: 999 });
    const inn = bedTargets({ biome: 'library', shoreDist: 999, indoors: true });
    close(inn.wind, out.wind * INDOOR_DUCK);
    close(inn.rustle, out.rustle * INTERIOR_KEEP.rustle);
    assert.ok(inn.rustle > inn.wind, 'a library interior should still rustle');
  });

  test('indoors never silences everything — a dead mix reads as a bug', () => {
    for (const biome of Object.keys(BIOME_BEDS)) {
      const t = bedTargets({ biome, shoreDist: 999, indoors: true });
      const sum = BED_IDS.reduce((a, id) => a + t[id], 0);
      assert.ok(sum > 0.02, `${biome} goes completely silent indoors`);
    }
  });
});

describe('bed budgeting', () => {
  test('keeps only the loudest few beds', () => {
    const w = { wind: 0.4, birds: 0.9, surf: 0.1, roar: 0.7, chimes: 0.5, rustle: 0, murmur: 0.05 };
    assert.deepEqual(topBeds(w, 3), ['birds', 'roar', 'chimes']);
  });

  test('drops silent beds entirely', () => {
    const w = { wind: 0, birds: 0, surf: 0.0005, roar: 0.5 };
    assert.deepEqual(topBeds(w, 4), ['roar']);
  });

  test('the cap leaves room for a crossfade', () => {
    // Two arriving beds plus one departing has to fit, or a biome edge cuts.
    assert.ok(VOICE_BUDGET.beds >= 3);
    assert.ok(LOW_BUDGET.beds >= 3);
  });

  test('is deterministic when weights tie', () => {
    const w = { wind: 0.5, birds: 0.5, surf: 0.5 };
    assert.deepEqual(topBeds(w, 2), topBeds(w, 2));
    assert.deepEqual(topBeds(w, 2), ['birds', 'surf']);
  });

  test('no real biome mix ever needs more than the budget', () => {
    for (const biome of Object.keys(BIOME_BEDS)) {
      const t = bedTargets({ biome, shoreDist: 12, night: 0.5, wind: 0.5 });
      const active = BED_IDS.filter((id) => t[id] > 0.001);
      // More candidates than slots is fine and expected — this asserts the
      // capped list is never EMPTY, which would be a silent world.
      assert.ok(topBeds(t, VOICE_BUDGET.beds).length > 0, `${biome} has no bed`);
      assert.ok(active.length > 0);
    }
  });
});

describe('the live bed cap', () => {
  const levels = (o) => Object.assign(Object.fromEntries(BED_IDS.map((id) => [id, 0])), o);

  test('wanted beds always get a rig', () => {
    const keep = resolveBeds(levels({}), ['birds', 'wind'], 4);
    assert.ok(keep.has('birds') && keep.has('wind'));
  });

  test('leftover slots go to the loudest bed still fading', () => {
    const keep = resolveBeds(
      levels({ surf: 0.6, roar: 0.2, chimes: 0.05 }), ['birds', 'wind'], 3,
    );
    assert.deepEqual([...keep].sort(), ['birds', 'surf', 'wind']);
  });

  test('never exceeds the cap, however many beds are mid-fade', () => {
    // This is the bug it exists for: crossing four biomes inside a minute
    // used to leave five bed rigs alive because each one needed fifteen
    // seconds to decay past the reclaim floor.
    const keep = resolveBeds(
      levels({ birds: 0.8, wind: 0.7, surf: 0.6, roar: 0.5, chimes: 0.4, rustle: 0.3, murmur: 0.2 }),
      ['murmur', 'rustle'],
      4,
    );
    assert.equal(keep.size, 4);
    assert.ok(keep.has('murmur') && keep.has('rustle'));
  });

  test('a wanted set at the cap force-retires every fading bed', () => {
    const keep = resolveBeds(levels({ surf: 0.9 }), ['a', 'birds', 'wind', 'roar', 'chimes'], 4);
    assert.equal(keep.size, 4);
    assert.ok(!keep.has('surf'));
  });

  test('silent beds never claim a slot', () => {
    const keep = resolveBeds(levels({ surf: 0 }), ['birds'], 4);
    assert.deepEqual([...keep], ['birds']);
  });

  test('accepts a Set or an array for the wanted list', () => {
    const l = levels({ surf: 0.4 });
    assert.deepEqual([...resolveBeds(l, ['birds'], 2)], [...resolveBeds(l, new Set(['birds']), 2)]);
  });

  test('the reserved crossfade slot leaves room for one departing bed', () => {
    // update() selects with (cap - 1) so a dissolve always fits.
    const wanted = topBeds({ birds: 0.9, wind: 0.5, murmur: 0.4, surf: 0.3 }, VOICE_BUDGET.beds - 1);
    const keep = resolveBeds(levels({ roar: 0.5 }), wanted, VOICE_BUDGET.beds);
    assert.ok(keep.has('roar'), 'the departing bed must keep its rig while it fades');
    assert.ok(keep.size <= VOICE_BUDGET.beds);
  });
});

describe('voice planning', () => {
  const c = (id, gain, extra = {}) => ({ id, gain, ...extra });

  test('keeps the loudest candidates up to the budget', () => {
    const { keep, drop } = planVoices(
      [c('far', 0.05), c('near', 0.9), c('mid', 0.4)], 2,
    );
    assert.deepEqual(keep, ['near', 'mid']);
    assert.deepEqual(drop, ['far']);
  });

  test('culls anything under the audibility floor even with slots free', () => {
    const { keep, drop } = planVoices([c('a', 0.001), c('b', 0.002)], 10);
    assert.deepEqual(keep, []);
    assert.deepEqual(drop.sort(), ['a', 'b']);
  });

  test('recycles the OLDEST when scores tie', () => {
    const { keep, drop } = planVoices([
      c('old', 0.5, { age: 30 }),
      c('young', 0.5, { age: 1 }),
    ], 1);
    assert.deepEqual(keep, ['young']);
    assert.deepEqual(drop, ['old']);
  });

  test('priority can outrank raw distance', () => {
    const { keep } = planVoices([
      c('quiet-boss', 0.3, { priority: 4 }),
      c('loud-coin', 0.8),
    ], 1);
    assert.deepEqual(keep, ['quiet-boss']);
  });

  test('a live voice is sticky, so an emitter on the edge does not stutter', () => {
    const live = c('live', 0.30, { live: true });
    const cold = c('cold', 0.34);
    assert.deepEqual(planVoices([live, cold], 1).keep, ['live']);
    // ...but stickiness is a nudge, not a lock: something clearly closer wins.
    assert.deepEqual(planVoices([live, c('closer', 0.9)], 1).keep, ['closer']);
    assert.ok(STICKY > 1 && STICKY < 2, 'stickiness must not become a monopoly');
  });

  test('every candidate lands in exactly one bucket', () => {
    const cands = Array.from({ length: 40 }, (_, i) => c(i, (i % 11) / 10, { age: i }));
    const { keep, drop } = planVoices(cands, VOICE_BUDGET.loops);
    assert.equal(keep.length + drop.length, cands.length);
    assert.equal(new Set([...keep, ...drop]).size, cands.length);
    assert.ok(keep.length <= VOICE_BUDGET.loops);
  });

  test('handles an empty world', () => {
    assert.deepEqual(planVoices([], 8), { keep: [], drop: [] });
  });

  test('the whole island of collectibles fits inside the loop budget', () => {
    // 37 collectibles + 9 portals attached at once. The planner is the only
    // thing standing between that and 46 simultaneous oscillator chains.
    const cands = Array.from({ length: 46 }, (_, i) => c(i, distanceGain(5 + i * 4)));
    const { keep } = planVoices(cands, VOICE_BUDGET.loops);
    assert.equal(keep.length, VOICE_BUDGET.loops);
    assert.deepEqual(keep, cands.slice(0, VOICE_BUDGET.loops).map((x) => x.id));
  });
});

describe('reverb-lite wet level', () => {
  test('outdoors is nearly dry, indoors is a room', () => {
    close(wetTarget({ indoors: false }), WET.dry);
    close(wetTarget({ indoors: true }), WET.wet);
    assert.ok(WET.wet > WET.dry * 3, 'the two states must be clearly different');
    assert.ok(WET.wet < 0.5, 'a K-5 game must never sound like a cathedral');
  });

  test('enclosure blends continuously and overrides the flag', () => {
    close(wetTarget({ enclosure: 0.5 }), (WET.dry + WET.wet) / 2);
    close(wetTarget({ indoors: true, enclosure: 0 }), WET.dry, 1e-9, 'a cave mouth can be dry');
  });

  test('clamps out-of-range enclosure', () => {
    close(wetTarget({ enclosure: 4 }), WET.wet);
    close(wetTarget({ enclosure: -2 }), WET.dry);
  });
});

describe('easing helpers', () => {
  test('approach is frame-rate independent', () => {
    const oneStep = approach(0, 1, 1, 0.5);
    let many = 0;
    for (let i = 0; i < 100; i++) many = approach(many, 1, 0.01, 0.5);
    close(oneStep, many, 1e-6);
  });

  test('approach converges without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 1200; i++) {   // 20 s at 60 fps
      v = approach(v, 1, 1 / 60, 2.6);
      assert.ok(v <= 1 + EPS);
    }
    assert.ok(v > 0.99, `converged only to ${v}`);
  });

  test('a bed crossfade is slow enough to read as a dissolve', () => {
    // After a quarter second at the bed time constant, less than 15% has moved
    // — that is what stops a biome boundary from sounding like a hard cut.
    assert.ok(approach(0, 1, 0.25, 2.6) < 0.15);
  });

  test('degenerate dt and tau are safe', () => {
    close(approach(0.3, 1, 0, 2), 0.3);
    close(approach(0.3, 1, -1, 2), 0.3);
    close(approach(0.3, 1, 0.1, 0), 1);
  });

  test('clamp01 and smoothstep behave at the edges', () => {
    close(clamp01(-5), 0); close(clamp01(5), 1); close(clamp01(0.25), 0.25);
    close(smoothstep(0, 1, -1), 0);
    close(smoothstep(0, 1, 2), 1);
    close(smoothstep(0, 1, 0.5), 0.5);
    close(smoothstep(3, 3, 4), 1, EPS, 'degenerate range must not divide by zero');
  });
});

describe('the module contract', () => {
  test('budgets are sane and the low tier is genuinely lower', () => {
    for (const b of [VOICE_BUDGET, LOW_BUDGET]) {
      for (const k of ['loops', 'oneShots', 'beds']) {
        assert.ok(Number.isInteger(b[k]) && b[k] > 0, `${k} = ${b[k]}`);
      }
    }
    assert.ok(LOW_BUDGET.loops < VOICE_BUDGET.loops);
    assert.ok(LOW_BUDGET.oneShots < VOICE_BUDGET.oneShots);
    assert.ok(VOICE_BUDGET.loops + VOICE_BUDGET.oneShots <= 24, 'iPad voice ceiling');
  });

  test('the panner defaults suit a 480 m world', () => {
    assert.equal(FIELD.distanceModel, 'inverse');
    assert.equal(FIELD.panningModel, 'equalpower', 'HRTF is too costly on iPad');
    assert.ok(FIELD.refDistance >= 6 && FIELD.refDistance <= 16, 'roughly the camera boom');
    assert.ok(FIELD.maxDistance > 120 && FIELD.maxDistance < 480);
    assert.ok(FIELD.rolloffFactor > 0 && FIELD.rolloffFactor < 1, 'must be gentler than physics');
  });

  test('voice names are unique and non-empty', () => {
    for (const list of [LOOP_VOICES, ONESHOT_VOICES]) {
      assert.equal(new Set(list).size, list.length);
      for (const n of list) assert.ok(typeof n === 'string' && n.length);
    }
  });

  test('createAudio3D is inert without a running AudioContext', () => {
    // No window, no AudioContext — exactly the node --test environment, and
    // also exactly the state of an iPad before the first tap. Nothing here may
    // throw and nothing may create a context.
    const a3d = createAudio3D({ camera: null });
    assert.equal(typeof a3d.update, 'function');
    assert.equal(typeof a3d.emit, 'function');
    assert.equal(typeof a3d.attach, 'function');
    assert.equal(typeof a3d.detach, 'function');
    assert.equal(typeof a3d.dispose, 'function');

    a3d.attach('portal-f1', { x: 10, y: 2, z: 140 }, { sound: 'hum' });
    a3d.attach('portal-f1', { x: 10, y: 2, z: 140 }, { sound: 'hum' });  // idempotent
    assert.equal(a3d.emit({ sound: 'coin', x: 0, y: 0, z: 0 }), false);
    a3d.update({ x: 0, y: 3, z: 150 }, { x: 0, y: 0, z: 0, w: 1 }, { dt: 1 / 60 });

    const s = a3d.stats();
    assert.equal(s.ready, false);
    assert.equal(s.attached, 1, 'attachment is recorded even with no audio');
    assert.equal(s.loops, 0);
    assert.equal(s.oneShots, 0);
    assert.deepEqual(s.beds, []);

    a3d.detach('portal-f1');
    assert.equal(a3d.stats().attached, 0);
    a3d.setEnabled(false);
    a3d.dispose();
    a3d.dispose();   // double dispose must be a no-op, not a throw
    a3d.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { dt: 1 / 60 });
  });

  test('update survives missing arguments', () => {
    const a3d = createAudio3D({});
    a3d.update();
    a3d.update(null, null);
    a3d.update({ x: 1, y: 1, z: 1 });
    a3d.dispose();
  });
});
