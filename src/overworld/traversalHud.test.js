/**
 * traversalHud.test.js — the stamina ring's rules.
 *
 * The pure half (describeGauge, easeAlpha, modeChip) is pinned directly. The
 * widget is exercised against a Phaser stub, because the behaviours worth
 * protecting are not "does Phaser draw" but "does the ring appear when it
 * should, disappear when it should, and never allocate or leak".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER } from '../config.js';
import { MODES, DEFAULT_TRAVERSAL_TUNING } from './traversal.js';
import { GAUGE, describeGauge, easeAlpha, modeChip, createStaminaGauge } from './traversalHud.js';

const T = DEFAULT_TRAVERSAL_TUNING;
const st = (o) => ({ mode: MODES.WALK, stamina: T.staminaMax, tired: false, simT: 0, ...o });

// ── describeGauge ─────────────────────────────────────────────────────────

test('a full pool while walking wants nothing on screen', () => {
  const d = describeGauge(st({}), T, {});
  assert.equal(d.wanted, false);
  assert.equal(d.chip, null);
});

test('spending a single point of the pool brings the ring up', () => {
  assert.equal(describeGauge(st({ stamina: T.staminaMax - 0.5 }), T, {}).wanted, true);
});

test('climbing always shows the ring, even on a full pool', () => {
  assert.equal(describeGauge(st({ mode: MODES.CLIMB }), T, {}).wanted, true);
  assert.equal(describeGauge(st({ mode: MODES.MANTLE }), T, {}).wanted, true);
});

test('exhaustion shows the ring even if the pool has topped back up', () => {
  assert.equal(describeGauge(st({ tired: true }), T, {}).wanted, true);
});

test('the arc length is exactly the stamina fraction of the ring', () => {
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const d = describeGauge(st({ stamina: T.staminaMax * f }), T, {});
    const swept = (d.end - d.start) / d.span;
    assert.ok(Math.abs(swept - f) < 1e-9, `${f} of the pool drew ${swept} of the ring`);
  }
});

test('the ring has a readable gap, so it is an arc and not a closed O', () => {
  const d = describeGauge(st({ stamina: 0 }), T, {});
  assert.ok(d.span < Math.PI * 2 - 0.1);
  assert.equal(d.end, d.start, 'an empty pool must draw no arc at all');
});

test('the arc warms gold -> coral -> peach and NEVER goes red', () => {
  const full = describeGauge(st({ stamina: 100 }), T, {});
  const low = describeGauge(st({ stamina: 10 }), T, {});
  const spent = describeGauge(st({ stamina: 0, tired: true }), T, {});
  assert.equal(full.color, PAPER.gold);
  assert.equal(low.color, PAPER.coral);
  assert.equal(spent.color, PAPER.peach);
  // Every colour the gauge can produce must come out of PAPER.
  const palette = new Set(Object.values(PAPER));
  for (const d of [full, low, spent]) {
    assert.ok(palette.has(d.color), `${d.color.toString(16)} is not a PAPER colour`);
    assert.ok(palette.has(d.backColor));
  }
});

test('the low-pool pulse is a gentle breathe, deterministic in the sim clock', () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 400; i++) {
    const d = describeGauge(st({ stamina: 8, simT: i / 60 }), T, {});
    lo = Math.min(lo, d.pulse);
    hi = Math.max(hi, d.pulse);
  }
  assert.ok(hi <= 1.0001 && lo >= 1 - GAUGE.pulseAmp - 1e-9, `pulse ranged ${lo}..${hi}`);
  assert.ok(hi - lo > GAUGE.pulseAmp * 0.9, 'the pulse never actually moved');
  // Same clock, same pulse. Twice.
  const a = describeGauge(st({ stamina: 8, simT: 3.25 }), T, {});
  const b = describeGauge(st({ stamina: 8, simT: 3.25 }), T, {});
  assert.equal(a.pulse, b.pulse);
});

test('a healthy pool does not pulse at all', () => {
  for (let i = 0; i < 60; i++) {
    assert.equal(describeGauge(st({ stamina: 90, simT: i / 60 }), T, {}).pulse, 1);
  }
});

test('describeGauge is total: null, junk and a bare walk state are all fine', () => {
  for (const s of [null, undefined, {}, { mode: 'nonsense' }, { stamina: NaN }]) {
    const d = describeGauge(s, T, {});
    assert.ok(Number.isFinite(d.fraction) && d.fraction >= 0 && d.fraction <= 1);
    assert.ok(Number.isFinite(d.start) && Number.isFinite(d.end));
  }
});

test('describeGauge reuses the out record — no per-frame allocation', () => {
  const out = {};
  assert.equal(describeGauge(st({}), T, out), out);
});

test('modeChip names the traversal modes and stays quiet while walking', () => {
  assert.equal(modeChip(MODES.WALK), null);
  assert.equal(modeChip(MODES.CLIMB), 'CLIMB');
  assert.equal(modeChip(MODES.MANTLE), 'UP!');
  assert.equal(modeChip(MODES.GLIDE), 'GLIDE');
  assert.equal(modeChip(MODES.SWIM), 'SWIM');
  assert.equal(modeChip(undefined), null);
});

// ── easeAlpha ─────────────────────────────────────────────────────────────

test('easeAlpha reaches the same place in the same WALL TIME at any frame rate', () => {
  const ends = [30, 60, 144].map((hz) => {
    let a = 0;
    for (let i = 0; i < hz; i++) a = easeAlpha(a, 1, GAUGE.fadeIn, 1 / hz);
    return a;
  });
  for (const e of ends) assert.ok(Math.abs(e - ends[0]) < 1e-6, `frame-rate dependent: ${ends}`);
});

test('easeAlpha never overshoots and dt = 0 freezes it', () => {
  assert.equal(easeAlpha(0.4, 1, GAUGE.fadeIn, 0), 0.4);
  let a = 0;
  for (let i = 0; i < 600; i++) a = easeAlpha(a, 1, GAUGE.fadeIn, 1 / 60);
  assert.ok(a <= 1 + 1e-9 && a > 0.999);
  let b = 1;
  for (let i = 0; i < 600; i++) b = easeAlpha(b, 0, GAUGE.fadeOut, 1 / 60);
  assert.ok(b >= -1e-9 && b < 0.001);
});

// ── The widget ────────────────────────────────────────────────────────────

/** The smallest thing that looks enough like a Phaser scene. */
function stubScene() {
  const made = [];
  const chain = (extra = {}) => {
    const o = {
      destroyed: false,
      calls: 0,
      setDepth() { return o; },
      setScrollFactor() { return o; },
      setOrigin() { return o; },
      setVisible(v) { o.visible = v; return o; },
      setAlpha(a) { o.alpha = a; return o; },
      setText(t) { o.text = t; return o; },
      setPosition(x, y) { o.x = x; o.y = y; return o; },
      destroy() { o.destroyed = true; },
      ...extra,
    };
    made.push(o);
    return o;
  };
  return {
    made,
    add: {
      graphics: () => chain({
        cleared: 0, strokes: 0,
        clear() { this.cleared++; return this; },
        lineStyle(w, c, a) { this.lastColor = c; this.lastAlpha = a; return this; },
        beginPath() { return this; },
        moveTo() { return this; },
        lineTo() { return this; },
        strokePath() { this.strokes++; return this; },
      }),
      text: () => chain({ text: '', visible: true, alpha: 1 }),
    },
  };
}

test('the widget fades in on a climb and back out once the pool refills', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  assert.equal(g.alpha, 0);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.CLIMB, stamina: 60 }), 1 / 60, 400, 300);
  assert.ok(g.alpha > 0.9, `only faded to ${g.alpha}`);
  // Back on the ground with a full pool: hold, then fade.
  for (let i = 0; i < 240; i++) g.update(st({}), 1 / 60, 400, 300);
  assert.ok(g.alpha < 0.02, `never faded out (${g.alpha})`);
});

test('the full ring holds for a beat before it goes, so the child sees it finish', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.CLIMB, stamina: 60 }), 1 / 60, 400, 300);
  const lit = g.alpha;
  // One frame after the pool is full again it must still be almost fully lit.
  g.update(st({}), 1 / 60, 400, 300);
  assert.ok(g.alpha > lit - 0.02, 'the ring vanished the instant the pool filled');
});

test('a hidden gauge draws nothing, and shows again when asked', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  g.setVisible(false);
  for (let i = 0; i < 60; i++) g.update(st({ mode: MODES.CLIMB, stamina: 50 }), 1 / 60, 0, 0);
  assert.ok(g.alpha < 0.02);
  g.setVisible(true);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.CLIMB, stamina: 50 }), 1 / 60, 0, 0);
  assert.ok(g.alpha > 0.9);
});

test('an invisible gauge clears its graphics instead of leaving a stale ring', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  const gfx = scene.made.filter((o) => typeof o.clear === 'function');
  g.update(st({}), 1 / 60, 400, 300);
  for (const o of gfx) assert.ok(o.cleared > 0, 'a graphics layer was never cleared');
});

test('the mode chip appears with the mode and goes away with it', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  const chip = scene.made.find((o) => 'text' in o);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.GLIDE, stamina: 80 }), 1 / 60, 400, 300);
  assert.equal(chip.text, 'GLIDE');
  assert.equal(chip.visible, true);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.SWIM, stamina: 80 }), 1 / 60, 400, 300);
  assert.equal(chip.text, 'SWIM');
  for (let i = 0; i < 300; i++) g.update(st({}), 1 / 60, 400, 300);
  assert.equal(chip.visible, false);
});

test('the ring follows the hero rather than sitting in a corner', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  const chip = scene.made.find((o) => 'text' in o);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.CLIMB, stamina: 40 }), 1 / 60, 640, 500);
  assert.equal(chip.x, 640);
  assert.ok(chip.y < 500, 'the chip must sit above the feet, not below them');
  for (let i = 0; i < 5; i++) g.update(st({ mode: MODES.CLIMB, stamina: 40 }), 1 / 60, 100, 200);
  assert.equal(chip.x, 100);
});

test('dt = 0 freezes the gauge exactly, which is what a frozen pose needs', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  for (let i = 0; i < 30; i++) g.update(st({ mode: MODES.CLIMB, stamina: 40 }), 1 / 60, 0, 0);
  const a = g.alpha;
  for (let i = 0; i < 10; i++) g.update(st({ mode: MODES.CLIMB, stamina: 40 }), 0, 0, 0);
  assert.equal(g.alpha, a);
});

test('destroy() takes every object it made with it', () => {
  const scene = stubScene();
  const g = createStaminaGauge(scene);
  g.destroy();
  assert.equal(scene.made.length, 4);
  for (const o of scene.made) assert.equal(o.destroyed, true, 'a HUD object leaked');
});
