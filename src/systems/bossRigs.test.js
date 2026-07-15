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
    reducedMotion: !!opts.reducedMotion,
  };
}

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

describe('arena garnish', () => {
  test('every rig with an arena tolerates null spriteData and does not throw', () => {
    for (const id of BOSS_IDS) {
      const rig = getBossRig(id);
      if (!rig.arena) continue;
      const scene = makeStubScene();
      assert.doesNotThrow(() => rig.arena(scene, null), `${id} arena threw`);
    }
  });

  test('idle tween is resumed after the special', () => {
    const scene = makeStubScene();
    const sd = makeSpriteData();
    getBossRig('briarking').special(scene, sd, makeCtx(scene), () => {});
    assert.equal(sd.idleTween.paused, false, 'idle tween left paused');
  });
});
