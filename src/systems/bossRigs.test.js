import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_RIGS, GENERIC_RIG, getBossRig } from './bossRigs.js';
import { BOSS_IDS } from '../data/enemies.js';

// ── synchronous stub scene: tweens/timers fire immediately, so a rig's
// done() must land exactly once with no real clock. ──
function makeGO() {
  const go = {
    x: 700, y: 400, scaleX: 1, scaleY: 1, width: 200, height: 200,
    displayWidth: 200, displayHeight: 300, alpha: 1, radius: 10, list: [],
  };
  const self = () => go;
  for (const m of [
    'setDepth', 'setOrigin', 'setScrollFactor', 'setAlpha', 'setScale', 'setTint',
    'clearTint', 'setStrokeStyle', 'setInteractive', 'setPosition', 'setVisible',
    'setAngle', 'setRotation', 'setSize', 'setDisplaySize', 'add', 'on', 'once',
    'fillStyle', 'fillCircle', 'fillRect', 'fillRoundedRect', 'fillTriangle',
    'fillEllipse', 'fillPoints', 'lineStyle', 'strokeCircle', 'strokeRect',
    'beginPath', 'moveTo', 'lineTo', 'closePath', 'strokePath', 'fillPath',
    'arc', 'lineBetween', 'clear', 'slice',
  ]) go[m] = self;
  go.destroy = () => {};
  return go;
}

function makeStubScene(opts = {}) {
  const adder = () => makeGO();
  return {
    reducedMotion: !!opts.reducedMotion,
    scale: { width: 1440, height: 1080 },
    cameras: { main: { width: 1440, height: 1080, shake() {}, flash() {}, zoomTo() {}, setZoom() {} } },
    events: { once() {}, on() {}, off() {} },
    add: {
      circle: adder, rectangle: adder, graphics: adder, text: adder,
      image: adder, zone: adder, triangle: adder, ellipse: adder, star: adder,
      container: () => { const c = makeGO(); c.add = () => c; return c; },
    },
    tweens: {
      add(cfg) { if (cfg && typeof cfg.onComplete === 'function') cfg.onComplete(); return { stop() {}, remove() {} }; },
      addCounter(cfg) { if (cfg && typeof cfg.onUpdate === 'function') cfg.onUpdate({ getValue: () => cfg.to ?? 1 }); if (cfg && typeof cfg.onComplete === 'function') cfg.onComplete(); return { stop() {}, remove() {} }; },
      killTweensOf() {},
    },
    time: {
      delayedCall(_ms, cb) { if (typeof cb === 'function') cb(); return { remove() {} }; },
      addEvent() { return { remove() {} }; },
    },
  };
}

function makeSpriteData() {
  return { body: makeGO(), idleTween: { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } } };
}
function makeCtx(scene, opts = {}) {
  return {
    party: [{}, {}, {}],
    heroSprites: [makeGO(), makeGO(), makeGO()],
    perHeroDamage: [5, 5, 5],
    phase: opts.phase ?? 1,
    move: { name: 'TEST MOVE', color: 0xecb964, glyph: '★' },
    reducedMotion: !!opts.reducedMotion,
  };
}

const PHASES = [1, 2, 3];

describe('boss rig coverage', () => {
  test('every boss id has a rig with a callable special', () => {
    for (const id of BOSS_IDS) {
      const rig = getBossRig(id);
      assert.ok(rig, `no rig for ${id}`);
      assert.equal(typeof rig.special, 'function', `${id} special not callable`);
    }
  });

  test('unknown boss id falls back to the generic rig', () => {
    assert.equal(getBossRig('nope'), GENERIC_RIG);
    assert.equal(typeof getBossRig('nope').special, 'function');
  });
});

describe('specials call done exactly once (anti soft-lock)', () => {
  for (const id of [...BOSS_IDS, 'nope']) {
    test(`${id} special: done once`, () => {
      const scene = makeStubScene();
      const rig = getBossRig(id);
      let calls = 0;
      rig.special(scene, makeSpriteData(), makeCtx(scene), () => { calls++; });
      assert.equal(calls, 1, `${id} called done ${calls} times`);
    });
    test(`${id} special: done once in reduced motion`, () => {
      const scene = makeStubScene({ reducedMotion: true });
      const rig = getBossRig(id);
      let calls = 0;
      rig.special(scene, makeSpriteData(), makeCtx(scene, { reducedMotion: true }), () => { calls++; });
      assert.equal(calls, 1);
    });
  }
});

describe('entrances call done exactly once', () => {
  for (const id of BOSS_IDS) {
    const rig = getBossRig(id);
    if (!rig.entrance) continue;
    test(`${id} entrance: done once`, () => {
      const scene = makeStubScene();
      let calls = 0;
      rig.entrance(scene, makeSpriteData(), { id, name: id }, () => { calls++; });
      assert.equal(calls, 1);
    });
  }
  test('generic entrance: done once', () => {
    const scene = makeStubScene();
    let calls = 0;
    GENERIC_RIG.entrance(scene, makeSpriteData(), { id: 'x', name: 'X' }, () => { calls++; });
    assert.equal(calls, 1);
  });
});

describe('specials survive every phase', () => {
  for (const id of [...BOSS_IDS, 'nope']) {
    for (const phase of PHASES) {
      test(`${id} special: done once in phase ${phase}`, () => {
        const scene = makeStubScene();
        let calls = 0;
        getBossRig(id).special(scene, makeSpriteData(), makeCtx(scene, { phase }), () => { calls++; });
        assert.equal(calls, 1, `${id} phase ${phase} called done ${calls} times`);
      });
    }
  }
});

describe('telegraphed wind-ups', () => {
  for (const id of BOSS_IDS) {
    const rig = getBossRig(id);
    if (!rig.windup) continue;
    for (const phase of PHASES) {
      test(`${id} windup: done once in phase ${phase}`, () => {
        const scene = makeStubScene();
        let calls = 0;
        rig.windup(scene, makeSpriteData(), makeCtx(scene, { phase }), () => { calls++; });
        assert.equal(calls, 1);
      });
    }
    test(`${id} windup: done once in reduced motion`, () => {
      const scene = makeStubScene({ reducedMotion: true });
      let calls = 0;
      rig.windup(scene, makeSpriteData(), makeCtx(scene, { reducedMotion: true }), () => { calls++; });
      assert.equal(calls, 1);
    });
    test(`${id} windup: resumes the idle tween`, () => {
      const scene = makeStubScene();
      const sd = makeSpriteData();
      rig.windup(scene, sd, makeCtx(scene), () => {});
      assert.equal(sd.idleTween.paused, false, 'idle tween left paused');
    });
  }

  // Every boss must telegraph. A special that arrives unannounced is
  // the one thing a child cannot answer, and answering IS the counter.
  test('every boss has a bespoke wind-up', () => {
    for (const id of BOSS_IDS) {
      assert.equal(typeof getBossRig(id).windup, 'function', `${id} has no windup`);
    }
  });
});

describe('arena garnish', () => {
  test('every rig with an arena tolerates null spriteData and does not throw', () => {
    for (const id of BOSS_IDS) {
      const rig = getBossRig(id);
      if (!rig.arena) continue;
      const scene = makeStubScene();
      assert.doesNotThrow(() => rig.arena(scene, null), `${id} arena threw`);
    }
  });

  test('every boss arena transforms and can be torn down', () => {
    for (const id of BOSS_IDS) {
      const rig = getBossRig(id);
      assert.equal(typeof rig.arena, 'function', `${id} has no arena`);
      const scene = makeStubScene();
      const handle = rig.arena(scene, null);
      assert.equal(typeof handle.setPhase, 'function', `${id} arena cannot change phase`);
      assert.equal(typeof handle.destroy, 'function', `${id} arena cannot be destroyed`);
      assert.doesNotThrow(() => { handle.setPhase(2); handle.setPhase(3); handle.destroy(); });
    }
  });

  test('the generic fallback arena is also phase-aware', () => {
    const scene = makeStubScene();
    const handle = GENERIC_RIG.arena(scene, null);
    assert.doesNotThrow(() => { handle.setPhase(3); handle.destroy(); });
  });

  test('idle tween is resumed after the special', () => {
    const scene = makeStubScene();
    const sd = makeSpriteData();
    getBossRig('briarking').special(scene, sd, makeCtx(scene), () => {});
    assert.equal(sd.idleTween.paused, false, 'idle tween left paused');
  });
});

describe('final boss finale', () => {
  test('only the Theorem owns its ending', () => {
    for (const id of BOSS_IDS) {
      const has = typeof getBossRig(id).finale === 'function';
      assert.equal(has, id === 'theorem', `${id} finale presence`);
    }
  });
  test('the finale calls done exactly once', () => {
    const scene = makeStubScene();
    let calls = 0;
    getBossRig('theorem').finale(scene, makeSpriteData(), makeCtx(scene), () => { calls++; });
    assert.equal(calls, 1);
  });
  test('the finale calls done exactly once in reduced motion', () => {
    const scene = makeStubScene({ reducedMotion: true });
    let calls = 0;
    getBossRig('theorem').finale(scene, makeSpriteData(), makeCtx(scene, { reducedMotion: true }), () => { calls++; });
    assert.equal(calls, 1);
  });
  test('the finale survives a missing body (boss already faded out)', () => {
    const scene = makeStubScene();
    let calls = 0;
    assert.doesNotThrow(() => {
      getBossRig('theorem').finale(scene, null, makeCtx(scene), () => { calls++; });
    });
    assert.equal(calls, 1);
  });
});

// ── THE VICTORY BEAT ────────────────────────────────────────────────
// Eight bosses used to share the generic shrink-and-fade, so a whole
// floor's payoff looked like squashing a slime. Every boss now owns an
// ending: `defeat` for the eight, `finale` for the Theorem (which is
// completed rather than destroyed). BattleScene hands control to it and
// waits, so the one non-negotiable is that it always hands control back.
describe('victory beats', () => {
  test('every boss has a defeat cue or a finale', () => {
    for (const id of BOSS_IDS) {
      const rig = getBossRig(id);
      assert.ok(typeof rig.defeat === 'function' || typeof rig.finale === 'function',
        `${id} has no victory beat — its death is the generic fade`);
    }
    assert.equal(typeof GENERIC_RIG.defeat, 'function', 'the fallback rig needs one too');
  });

  test('only the Theorem owns its whole ending', () => {
    const withFinale = BOSS_IDS.filter(id => typeof getBossRig(id).finale === 'function');
    assert.deepEqual(withFinale, ['theorem'],
      'a finale replaces the death beat entirely — it is the final boss privilege');
  });

  for (const id of [...BOSS_IDS, 'nope']) {
    const rig = getBossRig(id);
    const beat = rig.finale || rig.defeat;
    if (!beat) continue;
    test(`${id} victory beat: done once`, () => {
      const scene = makeStubScene();
      let calls = 0;
      beat.call(rig, scene, makeSpriteData(), makeCtx(scene), () => { calls++; });
      assert.equal(calls, 1, `${id} called done ${calls} times`);
    });
    test(`${id} victory beat: done once in reduced motion`, () => {
      const scene = makeStubScene({ reducedMotion: true });
      let calls = 0;
      beat.call(rig, scene, makeSpriteData(), makeCtx(scene, { reducedMotion: true }), () => { calls++; });
      assert.equal(calls, 1);
    });
    // The boss body is mid-death-fade when this runs, so the cue must
    // survive being handed a sprite that is already gone.
    test(`${id} victory beat: survives a missing sprite`, () => {
      const scene = makeStubScene();
      let calls = 0;
      assert.doesNotThrow(() => beat.call(rig, scene, null, makeCtx(scene), () => { calls++; }));
      assert.equal(calls, 1);
    });
  }
});
