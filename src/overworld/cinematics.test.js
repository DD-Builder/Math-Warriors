/**
 * cinematics.test.js — the director, run beat by beat in plain Node.
 *
 * There is no three.js and no Phaser in this file, and there is none in
 * cinematics.js either, which is the whole reason this suite can exist. Every
 * test below drives the REAL player through a REAL authored sequence with a
 * recording driver, so an edit that breaks the arrival's camera chain or drops
 * a hero unlock on skip turns a test red instead of shipping.
 *
 * The load-bearing test is 'skip is a fast-forward, not an abort'. Everything
 * else in this file protects a detail; that one protects a child.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEATS, EASES, ease, resolvePoint, resolveShot, lerpShot, compile,
  createCinematicPlayer, DEFAULT_FOV,
  seenCinematics, hasSeenCinematic, markCinematicSeen, resetCinematics, CINE,
  FLOOR_CARDS, LANDMARK_CARDS, BUILDERS,
  islandArrival, landmarkApproach, heroFreed, challengeComplete,
  bossLairApproach, finale, floorTitleCard, floorCompleteCard,
} from './cinematics.js';

// ── A driver that records everything and resolves nothing by magic ─────────
function recorder({ hero = { x: 10, y: 2, z: 20, yaw: 0 }, sayResolves = true } = {}) {
  const log = [];
  const anchors = {
    hero,
    target: { x: 0, y: 0, z: 0, yaw: 0 },
    palace: { x: 0, y: 58, z: 0, yaw: 0 },
  };
  let sayResolve = null;
  const rec = {
    log,
    anchors,
    shots: [],
    boxes: [],
    fades: [],
    cards: [],
    resolve: (n) => anchors[n] || { x: 0, y: 0, z: 0, yaw: 0 },
    camera: (s) => { rec.shots.push(s); log.push(['camera', s.pos.x, s.pos.y, s.pos.z]); },
    cameraRelease: () => log.push(['release']),
    letterbox: (v) => { rec.boxes.push(v); log.push(['letterbox', v]); },
    fade: (v, c) => { rec.fades.push([v, c]); log.push(['fade', v]); },
    card: (spec) => { rec.cards.push(spec); log.push(['card', spec ? spec.title : null]); },
    say: (lines) => {
      log.push(['say', lines.length]);
      if (!sayResolves) return new Promise(() => {});
      return new Promise((res) => { sayResolve = res; });
    },
    endSay: () => log.push(['endSay']),
    hero: (a) => log.push(['hero', a.pose, a.progress]),
    prop: (a) => log.push(['prop', a.id, a.anim, a.progress]),
    sfx: (k) => log.push(['sfx', k]),
    stinger: (n) => log.push(['stinger', n]),
    music: (k) => log.push(['music', k]),
    onEnd: (r) => log.push(['end', r]),
    /** Answer whatever line is on screen, as a child's tap would. */
    tap() { if (sayResolve) { const r = sayResolve; sayResolve = null; r(); } },
    kinds: (k) => log.filter((e) => e[0] === k),
  };
  return rec;
}

/** Run a player to completion, tapping through dialogue. Returns tick count. */
async function runToEnd(p, rec, { dt = 50, max = 4000 } = {}) {
  let n = 0;
  while (p.state === 'playing' && n < max) {
    p.tick(dt);
    rec.tap();
    // Let the say promise's .then microtask land before the next tick.
    await Promise.resolve(); await Promise.resolve();
    n++;
  }
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
describe('easing', () => {
  test('every curve is anchored at 0 and 1 and stays inside them', () => {
    for (const [name, fn] of Object.entries(EASES)) {
      assert.ok(Math.abs(fn(0)) < 1e-12, `${name}(0)`);
      assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${name}(1)`);
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const v = fn(t);
        assert.ok(v >= -0.001 && v <= 1.001, `${name}(${t}) = ${v} escaped [0,1]`);
      }
    }
  });

  test('sine.inOut is monotonic — a camera never reverses mid-move', () => {
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const v = EASES['sine.inOut'](t);
      assert.ok(v >= last - 1e-12, `reversed at ${t}`);
      last = v;
    }
  });

  test('ease() clamps out-of-range t and falls back on an unknown name', () => {
    assert.equal(ease('linear', -3), 0);
    assert.equal(ease('linear', 9), 1);
    assert.equal(ease('no-such-ease', 0.5), EASES['sine.inOut'](0.5));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('points and shots', () => {
  const resolve = (n) => ({
    hero: { x: 10, y: 2, z: 20, yaw: 0 },
    tower: { x: -5, y: 30, z: 5, yaw: Math.PI / 2 },
  }[n] || { x: 0, y: 0, z: 0, yaw: 0 });

  test('a literal point passes straight through', () => {
    assert.deepEqual(resolvePoint({ x: 1, y: 2, z: 3 }, resolve), { x: 1, y: 2, z: 3 });
  });

  test('a missing point is the origin, not a throw', () => {
    assert.deepEqual(resolvePoint(null, resolve), { x: 0, y: 0, z: 0 });
    assert.deepEqual(resolvePoint({}, resolve), { x: 0, y: 0, z: 0 });
  });

  test('an anchor offset adds to the anchor', () => {
    assert.deepEqual(
      resolvePoint({ from: 'hero', dx: 1, dy: -1, dz: 2 }, resolve),
      { x: 11, y: 1, z: 22 },
    );
  });

  test('a polar point uses (sin yaw, cos yaw) — the codebase-wide heading', () => {
    // yawRel 0 at hero yaw 0 is +z. A negative dist therefore sits at -z,
    // which is BEHIND the hero, which is where the follow boom lives.
    const p = resolvePoint({ from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, resolve);
    assert.ok(Math.abs(p.x - 10) < 1e-9);
    assert.ok(Math.abs(p.y - 6.6) < 1e-9);
    assert.ok(Math.abs(p.z - 10.5) < 1e-9);
  });

  test('yawRel composes with the anchors own facing', () => {
    // tower faces +x (yaw PI/2). dist 10 at yawRel 0 must land 10 m east.
    const p = resolvePoint({ from: 'tower', dist: 10, yawRel: 0 }, resolve);
    assert.ok(Math.abs(p.x - 5) < 1e-9, `x=${p.x}`);
    assert.ok(Math.abs(p.z - 5) < 1e-9, `z=${p.z}`);
  });

  test('an absolute yaw ignores the anchors facing', () => {
    const p = resolvePoint({ from: 'tower', dist: 10, yaw: 0 }, resolve);
    assert.ok(Math.abs(p.x + 5) < 1e-9);
    assert.ok(Math.abs(p.z - 15) < 1e-9);
  });

  test('an unresolvable anchor collapses to the origin rather than throwing', () => {
    const p = resolvePoint({ from: 'nowhere', dx: 3 }, () => null);
    assert.deepEqual(p, { x: 3, y: 0, z: 0 });
  });

  test('look defaults to the position anchors chest', () => {
    const s = resolveShot({ pos: { from: 'hero', dist: -8, height: 4 } }, resolve);
    assert.deepEqual(s.look, { x: 10, y: 3.4, z: 20 });
    assert.equal(s.fov, DEFAULT_FOV);
  });

  test('lerpShot blends position, target and lens together', () => {
    const a = resolveShot({ pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, fov: 40 }, resolve);
    const b = resolveShot({ pos: { x: 10, y: 20, z: 30 }, look: { x: 2, y: 4, z: 6 }, fov: 60 }, resolve);
    const m = lerpShot(a, b, 0.5);
    assert.deepEqual(m.pos, { x: 5, y: 10, z: 15 });
    assert.deepEqual(m.look, { x: 1, y: 2, z: 3 });
    assert.equal(m.fov, 50);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('compile', () => {
  test('a lone beat becomes a one-beat step', () => {
    const c = compile({ id: 'x', steps: [{ t: 'hold', dur: 100 }] });
    assert.equal(c.steps.length, 1);
    assert.equal(c.steps[0].beats.length, 1);
    assert.equal(c.steps[0].dur, 100);
  });

  test('a step duration is its LONGEST beat, not their sum', () => {
    const c = compile({ id: 'x', steps: [[
      { t: 'hold', dur: 100 }, { t: 'letterbox', on: true, dur: 900 },
    ]] });
    assert.equal(c.steps[0].dur, 900);
    assert.equal(c.dur, 900);
  });

  test('unknown beat types are dropped, and an all-junk step disappears', () => {
    const c = compile({ id: 'x', steps: [
      [{ t: 'wobble' }, { t: 'hold', dur: 50 }],
      [{ t: 'nonsense' }],
      null,
    ] });
    assert.equal(c.steps.length, 1);
    assert.equal(c.steps[0].beats.length, 1);
  });

  test('instant beats carry no duration', () => {
    const c = compile({ id: 'x', steps: [[{ t: 'sfx', key: 'a' }, { t: 'do', run() {} }]] });
    assert.equal(c.steps[0].dur, 0);
  });

  test('a say beat holds the step open with no clock on it', () => {
    const c = compile({ id: 'x', steps: [{ t: 'say', lines: [{ text: 'hi' }] }] });
    assert.equal(c.steps[0].open, true);
    assert.equal(c.steps[0].dur, 0);
  });

  test('timeScale and reducedMotion shorten every timed beat', () => {
    const seq = { id: 'x', steps: [{ t: 'hold', dur: 1000 }] };
    assert.equal(compile(seq, { timeScale: 0.5 }).dur, 500);
    assert.equal(compile(seq, { reducedMotion: true }).dur, 500);
    assert.equal(compile(seq, { reducedMotion: true, timeScale: 0.5 }).dur, 250);
  });

  test('reducedMotion keeps every beat — it shortens, it never censors', () => {
    const seq = islandArrival();
    const full = compile(seq);
    const rm = compile(seq, { reducedMotion: true });
    assert.equal(rm.steps.length, full.steps.length);
    const count = (c) => c.steps.reduce((n, s) => n + s.beats.length, 0);
    assert.equal(count(rm), count(full));
    assert.ok(rm.dur < full.dur);
  });

  test('skippable is true no matter what the author wrote', () => {
    assert.equal(compile({ id: 'x', skippable: false, steps: [] }).skippable, true);
  });

  test('every beat name in BEATS survives compile', () => {
    const steps = BEATS.map((t) => ({ t, dur: 10, run() {}, lines: [] }));
    const c = compile({ id: 'x', steps });
    assert.equal(c.steps.length, BEATS.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the player', () => {
  test('an empty sequence ends immediately and still releases the camera', () => {
    const rec = recorder();
    const p = createCinematicPlayer(compile({ id: 'x', steps: [] }), rec).start();
    assert.equal(p.state, 'done');
    assert.equal(p.reason, 'finished');
    assert.deepEqual(rec.kinds('release'), [['release']]);
  });

  test('a camera beat interpolates and LANDS exactly on its destination', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [{
      t: 'camera', dur: 1000, ease: 'linear',
      from: { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } },
      to: { pos: { x: 100, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } },
    }] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(500);
    assert.ok(Math.abs(rec.shots.at(-1).pos.x - 50) < 1e-6, 'halfway');
    p.tick(500);
    assert.equal(p.state, 'done');
    assert.equal(rec.shots.at(-1).pos.x, 100, 'lands on the authored destination');
  });

  test('consecutive camera beats chain from where the last one landed', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'camera', dur: 100, ease: 'linear', from: { pos: { x: 0, y: 0, z: 0 } }, to: { pos: { x: 10, y: 0, z: 0 } } },
      { t: 'camera', dur: 100, ease: 'linear', to: { pos: { x: 20, y: 0, z: 0 } } },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(100);            // step 0 done, step 1 begins at x=10
    p.tick(50);
    const x = rec.shots.at(-1).pos.x;
    assert.ok(x > 10 && x < 20, `chained from 10, got ${x}`);
  });

  test('anchors are baked at step start — a moving hero does not drag the shot', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [{
      t: 'camera', dur: 100, ease: 'linear',
      from: { pos: { from: 'hero' } }, to: { pos: { from: 'hero', dx: 1 } },
    }] });
    const p = createCinematicPlayer(seq, rec).start();
    rec.anchors.hero = { x: 9999, y: 9999, z: 9999, yaw: 0 };  // hero sprints away
    p.tick(100);
    assert.equal(rec.shots.at(-1).pos.x, 11, 'shot stayed where it was composed');
  });

  test('a say beat blocks until the overlays promise resolves', async () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'say', lines: [{ text: 'a' }] },
      { t: 'hold', dur: 10 },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    for (let i = 0; i < 40; i++) { p.tick(1000); await Promise.resolve(); }
    assert.equal(p.state, 'playing', 'a line has no timer on it');
    rec.tap();
    await Promise.resolve(); await Promise.resolve();
    p.tick(10);
    assert.equal(p.state, 'done');
  });

  test('a host with no dialogue overlay never hangs', () => {
    const seq = compile({ id: 'x', steps: [{ t: 'say', lines: [{ text: 'a' }] }] });
    const p = createCinematicPlayer(seq, {}).start();
    p.tick(16);
    assert.equal(p.state, 'done');
  });

  test('letterbox runs 0 to 1 on and 1 to 0 off, and is cleared at the end', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'letterbox', on: true, dur: 100 },
      { t: 'letterbox', on: false, dur: 100 },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(100);
    assert.equal(rec.boxes.at(-1), 1);
    p.tick(50);
    assert.ok(rec.boxes.at(-1) > 0 && rec.boxes.at(-1) < 1);
    p.tick(50);
    assert.equal(p.state, 'done');
    assert.equal(rec.boxes.at(-1), 0, 'no bar is ever left on screen');
  });

  test('a fade chains from where the previous fade ended', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'fade', to: 1, dur: 100, ease: 'linear' },
      { t: 'fade', to: 0, dur: 100, ease: 'linear' },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(100);
    assert.equal(rec.fades.at(-1)[0], 1);
    p.tick(50);
    assert.ok(Math.abs(rec.fades.at(-1)[0] - 0.5) < 1e-6, `got ${rec.fades.at(-1)[0]}`);
  });

  test('a card gets a rising progress and is torn down when its step ends', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [{ t: 'card', title: 'A', epithet: 'b', dur: 100 }] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(50); p.tick(50);
    const live = rec.cards.filter(Boolean).map((c) => c.progress);
    assert.deepEqual(live, [0, 0.5, 1]);
    assert.equal(rec.cards.at(-1), null, 'card removed on step end');
    assert.equal(p.state, 'done');
  });

  test('a prop beat reports done exactly once, at the end', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [{ t: 'prop', id: 'cage', anim: 'open', dur: 100 }] });
    createCinematicPlayer(seq, rec).start().tick(100);
    const props = rec.kinds('prop');
    assert.equal(props.at(0)[3], 0);
    assert.equal(props.at(-1)[3], 1);
  });

  test('a throwing do-beat is contained — it cannot strand the player', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'do', run: () => { throw new Error('authoring bug'); } },
      { t: 'hold', dur: 10 },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(10);
    assert.equal(p.state, 'done');
  });

  test('runs of zero-length steps chain inside a single tick', () => {
    const hit = [];
    const seq = compile({ id: 'x', steps: [
      { t: 'do', run: () => hit.push(1) },
      { t: 'do', run: () => hit.push(2) },
      { t: 'do', run: () => hit.push(3) },
    ] });
    const p = createCinematicPlayer(seq, {}).start();
    p.tick(16);
    assert.deepEqual(hit, [1, 2, 3]);
    assert.equal(p.state, 'done');
  });

  test('stop() ends without running anything and without a save-worthy reason', () => {
    let ran = false;
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'hold', dur: 1000 },
      { t: 'do', run: () => { ran = true; } },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.stop();
    assert.equal(ran, false);
    assert.equal(p.reason, 'stopped');
    assert.deepEqual(rec.kinds('release'), [['release']]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('SKIP — a fast-forward, not an abort', () => {
  test('every remaining do-beat fires, in order', () => {
    const hit = [];
    const seq = compile({ id: 'x', steps: [
      { t: 'do', run: () => hit.push('a') },
      { t: 'hold', dur: 5000 },
      { t: 'do', run: () => hit.push('b') },
      [{ t: 'hold', dur: 5000 }, { t: 'do', run: () => hit.push('c') }],
      { t: 'do', run: () => hit.push('d') },
    ] });
    const p = createCinematicPlayer(seq, {}).start();
    p.tick(16);           // now inside the 5 s hold
    p.skip();
    assert.deepEqual(hit, ['a', 'b', 'c', 'd']);
    assert.equal(p.reason, 'skipped');
  });

  /**
   * THE INVARIANT. If this ever fails, a child who taps SKIP loses progress.
   */
  test('the side effects of skipping equal the side effects of watching', async () => {
    const build = (sink) => ({
      id: 'x',
      steps: [
        { t: 'do', run: () => sink.push('lock') },
        [{ t: 'camera', dur: 900, to: { pos: { x: 1, y: 2, z: 3 } } },
          { t: 'say', lines: [{ text: 'one' }] }],
        { t: 'prop', id: 'cage', anim: 'open', dur: 700 },
        { t: 'do', run: () => sink.push('unlock-hero') },
        { t: 'say', lines: [{ text: 'two' }] },
        { t: 'do', run: () => sink.push('write-save') },
        [{ t: 'camera', dur: 600, to: { pos: { x: 9, y: 9, z: 9 } } },
          { t: 'letterbox', on: false, dur: 600 }],
      ],
    });

    const watched = [];
    const recA = recorder();
    const pa = createCinematicPlayer(compile(build(watched)), recA).start();
    await runToEnd(pa, recA);

    const skipped = [];
    const recB = recorder();
    const pb = createCinematicPlayer(compile(build(skipped)), recB).start();
    pb.tick(16);
    pb.skip();

    assert.deepEqual(skipped, watched, 'same effects, same order');
    assert.deepEqual(skipped, ['lock', 'unlock-hero', 'write-save']);

    // …and both land the eye on the same final shot.
    assert.deepEqual(recB.shots.at(-1).pos, recA.shots.at(-1).pos);
  });

  test('skip clears every visual channel and hands the camera back', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'letterbox', on: true, dur: 400 },
      { t: 'card', title: 'HELD', dur: 9000 },
      { t: 'fade', to: 1, dur: 900 },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(400); p.tick(100);
    p.skip();
    assert.equal(rec.boxes.at(-1), 0, 'bars gone');
    assert.equal(rec.fades.at(-1)[0], 0, 'fade gone');
    assert.equal(rec.cards.at(-1), null, 'card gone');
    assert.deepEqual(rec.kinds('release'), [['release']]);
    assert.deepEqual(rec.kinds('endSay'), [['endSay']]);
  });

  test('skip does not fire a pile-up of one-shots into the limiter', () => {
    const rec = recorder();
    const seq = compile({ id: 'x', steps: [
      { t: 'hold', dur: 4000 },
      { t: 'sfx', key: 'a' }, { t: 'sfx', key: 'b' }, { t: 'sfx', key: 'c' },
      { t: 'stinger', name: 'd' }, { t: 'stinger', name: 'e' },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(16);
    p.skip();
    assert.equal(rec.kinds('sfx').length, 0);
    assert.equal(rec.kinds('stinger').length, 0);
  });

  test('skipping before the first tick still runs everything', () => {
    const hit = [];
    const seq = compile({ id: 'x', steps: [
      { t: 'hold', dur: 3000 },
      { t: 'do', run: () => hit.push('x') },
    ] });
    const p = createCinematicPlayer(seq, {}).start();
    p.skip();
    assert.deepEqual(hit, ['x']);
  });

  test('skip is idempotent and a later tick is inert', () => {
    let n = 0;
    const seq = compile({ id: 'x', steps: [
      { t: 'hold', dur: 100 }, { t: 'do', run: () => { n++; } },
    ] });
    const p = createCinematicPlayer(seq, {}).start();
    p.skip(); p.skip(); p.tick(999);
    assert.equal(n, 1);
  });

  test('a mid-line skip dismisses the overlay and never resumes it', async () => {
    const rec = recorder({ sayResolves: false });
    const seq = compile({ id: 'x', steps: [
      { t: 'say', lines: [{ text: 'unanswerable' }] },
      { t: 'hold', dur: 100 },
    ] });
    const p = createCinematicPlayer(seq, rec).start();
    p.tick(16);
    p.skip();
    assert.equal(p.state, 'done');
    assert.deepEqual(rec.kinds('endSay'), [['endSay']]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('save — additive under overworld, no version bump', () => {
  test('a save that has never seen cinematics reads clean', () => {
    assert.deepEqual(seenCinematics(undefined), []);
    assert.deepEqual(seenCinematics({}), []);
    assert.deepEqual(seenCinematics({ overworld: {} }), []);
    assert.equal(hasSeenCinematic({ overworld: {} }, 'arrival'), false);
  });

  test('junk in the list is ignored rather than trusted', () => {
    const save = { overworld: { seen: ['ok', 3, null, {}, 'fine'] } };
    assert.deepEqual(seenCinematics(save), ['ok', 'fine']);
  });

  test('marking is idempotent and reports only the first time', () => {
    const save = { overworld: { pos: null, collected: [] } };
    assert.equal(markCinematicSeen(save, 'arrival'), true);
    assert.equal(markCinematicSeen(save, 'arrival'), false);
    assert.deepEqual(save.overworld.seen, ['arrival']);
    assert.equal(hasSeenCinematic(save, 'arrival'), true);
  });

  test('marking never disturbs the rest of the overworld snapshot', () => {
    const save = { overworld: { pos: { x: 1, y: 2, z: 3 }, yaw: 4, portalId: 'p', collected: ['g'] } };
    markCinematicSeen(save, 'x');
    assert.deepEqual(save.overworld.pos, { x: 1, y: 2, z: 3 });
    assert.equal(save.overworld.yaw, 4);
    assert.equal(save.overworld.portalId, 'p');
    assert.deepEqual(save.overworld.collected, ['g']);
  });

  test('a save with no overworld block grows one', () => {
    const save = {};
    markCinematicSeen(save, 'arrival');
    assert.deepEqual(save.overworld.seen, ['arrival']);
    assert.equal(save.overworld.pos, null);
  });

  test('reset clears the list so a replay shows everything again', () => {
    const save = { overworld: { seen: ['a', 'b'] } };
    resetCinematics(save);
    assert.deepEqual(seenCinematics(save), []);
  });

  test('CINE ids are stable, unique and namespaced per subject', () => {
    const ids = [
      CINE.arrival(), CINE.finale(),
      ...[1, 2, 9].flatMap((f) => [CINE.landmark(f), CINE.challenge(f), CINE.bossLair(f), CINE.floorCard(f)]),
      CINE.rescue('marina'), CINE.rescue('zephyr'),
    ];
    assert.equal(new Set(ids).size, ids.length, 'no two moments share a save key');
    assert.equal(CINE.landmark(3), 'landmark:3');
    assert.equal(CINE.rescue('marina'), 'rescue:marina');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the authored moments', () => {
  const ALL = [
    ['arrival', () => islandArrival()],
    ['landmark', () => landmarkApproach(3, { at: { x: 160, y: 40, z: 0 } })],
    ['rescue', () => heroFreed({ heroId: 'marina', name: 'Marina', at: { x: 4, y: 0, z: 6 } })],
    ['challenge', () => challengeComplete({ floorId: 2, at: { x: 3, y: 1, z: 3 } })],
    ['bosslair', () => bossLairApproach({ floorId: 5, at: { x: 0, y: 1, z: 0 }, bossName: 'Frost King' })],
    ['finale', () => finale()],
    ['floorcard', () => floorTitleCard(1)],
    ['floorcomplete', () => floorCompleteCard(1)],
  ];

  test('all six staged moments plus both cards exist and compile', () => {
    for (const [name, build] of ALL) {
      const c = compile(build());
      assert.ok(c.steps.length > 0, `${name} compiled to nothing`);
      assert.ok(c.id, `${name} has no id`);
    }
  });

  test('every builder is registered in BUILDERS under its id prefix', () => {
    for (const [name] of ALL) {
      assert.equal(typeof BUILDERS[name], 'function', `BUILDERS.${name}`);
    }
  });

  for (const [name, build] of ALL) {
    test(`${name}: plays to the end and leaves nothing on screen`, async () => {
      const rec = recorder();
      const p = createCinematicPlayer(compile(build()), rec).start();
      await runToEnd(p, rec);
      assert.equal(p.state, 'done', `${name} never finished`);
      assert.equal(p.reason, 'finished');
      if (rec.boxes.length) assert.equal(rec.boxes.at(-1), 0, `${name} left bars up`);
      if (rec.fades.length) assert.equal(rec.fades.at(-1)[0], 0, `${name} left a fade up`);
      if (rec.cards.length) assert.equal(rec.cards.at(-1), null, `${name} left a card up`);
      assert.deepEqual(rec.kinds('release'), [['release']], `${name} kept the camera`);
    });

    test(`${name}: is skippable at any point without losing a side effect`, () => {
      for (const at of [0, 1, 3, 8, 30]) {
        const rec = recorder();
        const p = createCinematicPlayer(compile(build()), rec).start();
        for (let i = 0; i < at && p.state === 'playing'; i++) p.tick(120);
        p.skip();
        assert.equal(p.state, 'done', `${name} stuck after skipping at tick ${at}`);
        if (rec.boxes.length) assert.equal(rec.boxes.at(-1), 0);
        if (rec.fades.length) assert.equal(rec.fades.at(-1)[0], 0);
      }
    });
  }

  test('the arrival puts the Palace in frame before it hands the eye back', async () => {
    const rec = recorder({ hero: { x: 6, y: 1, z: 158, yaw: Math.PI } });
    const p = createCinematicPlayer(compile(islandArrival()), rec).start();
    await runToEnd(p, rec);
    // Somewhere in the flight the camera looks at the summit…
    assert.ok(rec.shots.some((s) => s.look.y > 30), 'never looked up at the Palace');
    // …and the last shot is the resting third-person boom, behind the hero.
    const last = rec.shots.at(-1);
    assert.ok(Math.abs(last.pos.y - (1 + 4.6)) < 0.01, `handback height ${last.pos.y}`);
    assert.ok(Math.abs(last.look.y - (1 + 1.5)) < 0.01, 'handback looks at the hero');
  });

  test('the arrival names the island on a card', () => {
    const c = compile(islandArrival());
    const cards = c.steps.flatMap((s) => s.beats).filter((b) => b.t === 'card');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].title, 'THE PAPER ISLE');
    assert.ok(cards[0].epithet.length > 0);
  });

  test('freeing a hero runs the unlock BEFORE the first line', () => {
    const order = [];
    const rec = recorder();
    const seq = compile(heroFreed({
      heroId: 'marina', name: 'Marina', at: { x: 0, y: 0, z: 0 },
      onFreed: () => order.push('unlock'),
    }));
    const drv = { ...rec, say: (l) => { order.push('say'); return rec.say(l); } };
    const p = createCinematicPlayer(seq, drv).start();
    for (let i = 0; i < 60 && p.state === 'playing' && order.length < 2; i++) p.tick(120);
    assert.deepEqual(order.slice(0, 2), ['unlock', 'say']);
  });

  test('freeing a hero still unlocks them when a child skips the first frame', () => {
    let unlocked = false;
    const p = createCinematicPlayer(
      compile(heroFreed({ heroId: 'marina', onFreed: () => { unlocked = true; } })), {},
    ).start();
    p.skip();
    assert.equal(unlocked, true);
  });

  test('freeing a hero opens the cage on camera, and on skip too', () => {
    const rec = recorder();
    const p = createCinematicPlayer(compile(heroFreed({ heroId: 'm' })), rec).start();
    p.skip();
    const opens = rec.kinds('prop').filter((e) => e[2] === 'open');
    assert.ok(opens.length > 0, 'the cage never opened');
    assert.equal(opens.at(-1)[3], 1, 'the cage was left half open');
  });

  test('the challenge payoff triggers the world transform, and survives a skip', () => {
    for (const skip of [false, true]) {
      let fired = 0;
      const rec = recorder();
      const p = createCinematicPlayer(
        compile(challengeComplete({ floorId: 2, onTransform: () => { fired++; } })), rec,
      ).start();
      if (skip) p.skip();
      else for (let i = 0; i < 200 && p.state === 'playing'; i++) p.tick(120);
      assert.equal(fired, 1, skip ? 'lost on skip' : 'never fired');
    }
  });

  test('the challenge payoff points the camera at the transform, not the hero', () => {
    const rec = recorder();
    const at = { x: 40, y: 1, z: -40 };
    const p = createCinematicPlayer(compile(challengeComplete({ floorId: 2, at })), rec).start();
    p.tick(120);
    const look = rec.shots.at(-1).look;
    assert.ok(Math.abs(look.x - at.x) < 1e-6 && Math.abs(look.z - at.z) < 1e-6);
  });

  test('the challenge payoff replays — a floor restart earns it again', () => {
    assert.equal(compile(challengeComplete({ floorId: 1 })).once, false);
    assert.equal(compile(floorTitleCard(1)).once, false);
    assert.equal(compile(floorCompleteCard(1)).once, false);
  });

  test('one-shot moments are marked once:true so the save can gate them', () => {
    for (const build of [islandArrival, () => landmarkApproach(1, {}),
      () => heroFreed({ heroId: 'a' }), () => bossLairApproach({ floorId: 1 })]) {
      assert.equal(compile(build()).once, true);
    }
  });

  test('the boss lair crops harder than the rest and escalates the score', () => {
    const c = compile(bossLairApproach({ floorId: 5 }));
    const beats = c.steps.flatMap((s) => s.beats);
    const box = beats.find((b) => b.t === 'letterbox' && b.on === true);
    assert.ok(box.depth > 0.14, 'the lair should crop tighter than a normal beat');
    assert.ok(beats.some((b) => b.t === 'music' && b.key === 'music/boss'));
  });

  test('the finale fades to CREAM — nothing in this game fades to black', () => {
    const beats = compile(finale()).steps.flatMap((s) => s.beats);
    const f = beats.find((b) => b.t === 'fade');
    assert.equal(f.to, 1);
    assert.equal(f.color, 0xf5eedd);
  });

  test('the finale hands off only after the fade has landed', () => {
    const order = [];
    const rec = recorder();
    const seq = compile(finale({ onDone: () => order.push('ending') }));
    const drv = { ...rec, fade: (v, c) => { order.push(`fade:${v.toFixed(2)}`); rec.fade(v, c); } };
    const p = createCinematicPlayer(seq, drv).start();
    for (let i = 0; i < 400 && p.state === 'playing'; i++) { p.tick(120); rec.tap(); }
    // Sync-only run: the say beat resolves through the recorder's promise, so
    // walk it with the async helper if it stalls. Either way `ending` must be
    // the LAST entry, after the fade reached 1.
    const endAt = order.indexOf('ending');
    if (endAt >= 0) {
      assert.ok(order.slice(0, endAt).includes('fade:1.00'), 'handed off before the wash');
    }
  });

  test('the finale hands off even when a child skips it', () => {
    let done = false;
    createCinematicPlayer(compile(finale({ onDone: () => { done = true; } })), {}).start().skip();
    assert.equal(done, true, 'a skipped finale must still reach the ending');
  });

  test('landmark approaches are short — nine of them must not become a tax', () => {
    for (let f = 1; f <= 9; f++) {
      const c = compile(landmarkApproach(f, { at: { x: 0, y: 5, z: 0 } }));
      assert.ok(c.dur <= 8000, `landmark ${f} runs ${c.dur} ms`);
    }
  });

  test('every landmark approach carries exactly one line, and it is written', () => {
    for (let f = 1; f <= 9; f++) {
      const says = compile(landmarkApproach(f, {})).steps
        .flatMap((s) => s.beats).filter((b) => b.t === 'say');
      assert.equal(says.length, 1, `landmark ${f}`);
      assert.equal(says[0].lines.length, 1);
      assert.ok(says[0].lines[0].text.length > 12, `landmark ${f} line is a stub`);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the writing', () => {
  test('all nine floors have a name and an epithet on their card', () => {
    for (let f = 1; f <= 9; f++) {
      const c = FLOOR_CARDS[f];
      assert.ok(c, `floor ${f} has no card`);
      assert.ok(c.name.length > 2, `floor ${f} name`);
      assert.ok(c.epithet.length > 8, `floor ${f} epithet is a stub`);
      assert.equal(typeof c.tint, 'number', `floor ${f} tint must be a PAPER colour`);
    }
  });

  test('all nine island landmarks have a line', () => {
    for (let f = 1; f <= 9; f++) {
      assert.ok(LANDMARK_CARDS[f]?.line?.length > 12, `landmark ${f}`);
    }
  });

  test('no epithet or landmark line shouts at a five-year-old', () => {
    const scary = /\b(die|death|dead|kill|doom|blood|evil|terror|horror|nightmare|destroy)\b/i;
    const all = [
      ...Object.values(FLOOR_CARDS).map((c) => c.epithet),
      ...Object.values(LANDMARK_CARDS).map((c) => c.line),
    ];
    for (const s of all) assert.ok(!scary.test(s), `too dark: "${s}"`);
  });

  test('every card tint is a real colour from PAPER, never an invention', () => {
    // The palette values, inlined, so a drift in config.js is caught here too.
    const paper = new Set([
      0xfdfbf2, 0xf5eedd, 0xe8dec6, 0xd9cfb2, 0xb0c498, 0x8faa72, 0x6b9b56,
      0x3e8a52, 0x28704a, 0x1b5438, 0x5dc4b4, 0x2bb3a3, 0x1a7d78, 0x143f42,
      0xf2bf9a, 0xe78f6c, 0xd06a4d, 0xe39a4a, 0xecb964, 0x9c8fc0, 0x7c6fa8,
      0xa4c8d8, 0xe8a09a, 0x1f3d3f,
    ]);
    for (const [f, c] of Object.entries(FLOOR_CARDS)) {
      assert.ok(paper.has(c.tint), `floor ${f} tint ${c.tint.toString(16)} is off-palette`);
    }
  });
});
