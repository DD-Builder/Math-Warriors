import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeroAnimationSM, VALID_TRANSITIONS, STATE_DEFS } from './animationStateMachine.js';

function makeMockScene() {
  const tweens = [];
  return {
    tweens: {
      add(cfg) {
        const t = { _cfg: cfg, stopped: false, isPlaying: () => !t.stopped, stop() { t.stopped = true; } };
        tweens.push(t);
        return t;
      },
      killTweensOf() {},
    },
    time: {
      delayedCall(ms, cb) {
        const timer = { _cb: cb, _ms: ms, removed: false, remove() { timer.removed = true; } };
        return timer;
      },
    },
    _tweens: tweens,
  };
}

function makeMockParts() {
  const makePart = () => ({
    x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1, alpha: 1,
    setTint() {}, clearTint() {},
  });
  return { legs: makePart(), torso: makePart(), armL: makePart(), armR: makePart(), weapon: makePart(), head: makePart() };
}

test('can transition from null to idle', () => {
  const sm = new HeroAnimationSM(makeMockParts(), makeMockScene(), 'knight', 'knight-shadow');
  assert.ok(sm.transition('idle'));
  assert.equal(sm.state, 'idle');
});

test('idle creates breathing tween on torso', () => {
  const scene = makeMockScene();
  const sm = new HeroAnimationSM(makeMockParts(), scene, 'knight', 'knight-shadow');
  sm.transition('idle');
  assert.ok(scene._tweens.length > 0);
  assert.ok(scene._tweens.some(t => t._cfg.targets === sm.parts.torso));
});

test('walk → idle resets parts', () => {
  const sm = new HeroAnimationSM(makeMockParts(), makeMockScene(), 'knight', 'knight-shadow');
  sm.transition('walk');
  sm.parts.legs.y = 999;
  sm.transition('idle');
  assert.equal(sm.parts.legs.y, 0);
});

test('cannot transition ko → attack', () => {
  const sm = new HeroAnimationSM(makeMockParts(), makeMockScene(), 'bunny', 'bunny-pepper');
  sm.transition('ko');
  assert.ok(!sm.transition('attack'));
  assert.equal(sm.state, 'ko');
});

test('can transition ko → victory', () => {
  const sm = new HeroAnimationSM(makeMockParts(), makeMockScene(), 'knight', 'knight-shadow');
  sm.transition('ko');
  assert.ok(sm.transition('victory'));
  assert.equal(sm.state, 'victory');
});

test('every state key has a definition and valid transitions', () => {
  for (const key of Object.keys(VALID_TRANSITIONS)) {
    assert.ok(STATE_DEFS[key], `Missing STATE_DEF for ${key}`);
    assert.ok(Array.isArray(VALID_TRANSITIONS[key]), `VALID_TRANSITIONS[${key}] is not array`);
  }
});

test('guard state differs per class', () => {
  const knightScene = makeMockScene();
  const bunnyScene = makeMockScene();
  const kSM = new HeroAnimationSM(makeMockParts(), knightScene, 'knight', 'knight-shadow');
  const bSM = new HeroAnimationSM(makeMockParts(), bunnyScene, 'bunny', 'bunny-pepper');
  kSM.transition('guard');
  bSM.transition('guard');
  const kTweenTargets = knightScene._tweens.map(t => t._cfg.targets);
  const bTweenTargets = bunnyScene._tweens.map(t => t._cfg.targets);
  assert.notDeepEqual(kTweenTargets, bTweenTargets);
});

test('attack slash moves weapon', () => {
  const scene = makeMockScene();
  const parts = makeMockParts();
  const sm = new HeroAnimationSM(parts, scene, 'knight', 'knight-shadow');
  sm.transition('idle');
  sm.transition('attack', { subtype: 'slash' });
  assert.equal(sm.state, 'attack');
  assert.ok(scene._tweens.some(t => {
    const targets = Array.isArray(t._cfg.targets) ? t._cfg.targets : [t._cfg.targets];
    return targets.includes(parts.weapon);
  }));
});

test('hit applies red tint and clears on exit', () => {
  let tinted = false;
  let cleared = false;
  const parts = makeMockParts();
  parts.torso.setTint = () => { tinted = true; };
  parts.torso.clearTint = () => { cleared = true; };
  const sm = new HeroAnimationSM(parts, makeMockScene(), 'wizard', 'wizard-stargazer');
  sm.transition('hit');
  assert.ok(tinted);
  sm.transition('idle');
  assert.ok(cleared);
});

test('ko drops alpha on all parts', () => {
  const scene = makeMockScene();
  const sm = new HeroAnimationSM(makeMockParts(), scene, 'bunny', 'bunny-boulder');
  sm.transition('ko');
  assert.ok(scene._tweens.some(t => t._cfg.alpha === 0.4));
});

test('destroy nulls references', () => {
  const sm = new HeroAnimationSM(makeMockParts(), makeMockScene(), 'knight', 'knight-shadow');
  sm.transition('idle');
  sm.destroy();
  assert.equal(sm.parts, null);
  assert.equal(sm.scene, null);
});

test('visualMods.walkSpeed affects walk animation', () => {
  const scene = makeMockScene();
  const sm = new HeroAnimationSM(makeMockParts(), scene, 'knight', 'knight-shadow');
  sm.visualMods.walkSpeed = 400;
  sm.transition('walk');
  assert.ok(scene._tweens.some(t => t._cfg.duration === 400));
});

test('selection-sway creates gentle rocking on all parts', () => {
  const scene = makeMockScene();
  const sm = new HeroAnimationSM(makeMockParts(), scene, 'wizard', 'wizard-stargazer');
  sm.transition('selection-sway');
  assert.ok(scene._tweens.length >= 6);
});
