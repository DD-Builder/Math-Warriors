import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHYS, FIXED_DT, clamp01,
  sphereSubmergedFraction, slabSubmergedFraction, pointSubmergence,
  buoyantForce, buoyShareSum, buoyReach, equilibriumDraught, floats,
  waterLevelAt, windVector, windGust, windForce,
  buildTerrainHeights, heightIndex,
  createFixedStepper, createBodyPool, shapeVolume, shapeReach,
} from './physics.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

describe('tuning contract', () => {
  test('gravity magnitude matches the character controller', async () => {
    // A crate must fall at the same rate as the hero who pushed it. If
    // controller.js ever retunes gravity this test is the thing that notices.
    const { DEFAULT_TUNING } = await import('./controller.js');
    assert.equal(-PHYS.gravity, DEFAULT_TUNING.gravity);
  });

  test('the solver only ever sees 1/60 s', () => {
    assert.equal(PHYS.fixedHz, 60);
    near(FIXED_DT, 1 / 60);
  });
});

describe('submerged fractions', () => {
  test('clamp01', () => {
    assert.equal(clamp01(-3), 0);
    assert.equal(clamp01(0.4), 0.4);
    assert.equal(clamp01(9), 1);
  });

  test('a sphere fully above or fully below the surface', () => {
    assert.equal(sphereSubmergedFraction(5, 1, 0), 0);
    assert.equal(sphereSubmergedFraction(1.0001, 1, 0), 0);
    assert.equal(sphereSubmergedFraction(-5, 1, 0), 1);
    assert.equal(sphereSubmergedFraction(-1, 1, 0), 1);
  });

  test('a sphere centred on the waterline is exactly half under', () => {
    near(sphereSubmergedFraction(0, 1, 0), 0.5);
    near(sphereSubmergedFraction(3, 1, 3), 0.5);
  });

  test('the sphere uses the exact cap volume, not a linear guess', () => {
    // Bottom quarter submerged: d = 0.5r. Cap = d^2(3r-d)/(4r^3)
    //   = 0.25 * 2.5 / 4 = 0.15625, where a linear guess would say 0.25.
    near(sphereSubmergedFraction(0.5, 1, 0), 0.15625);
    assert.ok(sphereSubmergedFraction(0.5, 1, 0) < 0.25);
  });

  test('sphere fraction is monotone as it sinks', () => {
    let prev = -1;
    for (let y = 1.2; y >= -1.2; y -= 0.05) {
      const f = sphereSubmergedFraction(y, 1, 0);
      assert.ok(f >= prev, `not monotone at y=${y}`);
      prev = f;
    }
  });

  test('a slab is linear between its faces', () => {
    near(slabSubmergedFraction(0.5, 0.5, 0), 0);
    near(slabSubmergedFraction(0, 0.5, 0), 0.5);
    near(slabSubmergedFraction(-0.5, 0.5, 0), 1);
    near(slabSubmergedFraction(0.25, 0.5, 0), 0.25);
  });

  test('a degenerate half-height degrades to a step, not a NaN', () => {
    assert.equal(slabSubmergedFraction(-1, 0, 0), 1);
    assert.equal(slabSubmergedFraction(1, 0, 0), 0);
  });
});

describe('buoy points carry a thickness', () => {
  test('a point is half under when its slab straddles the surface', () => {
    near(pointSubmergence(0, 0, 0.9), 0.5);
    near(pointSubmergence(-0.45, 0, 0.9), 1);
    near(pointSubmergence(0.45, 0, 0.9), 0);
  });

  test('THE HEADLINE: a floating body settles at its density ratio', () => {
    // This is the regression guard for the bug that a fixed-width ramp caused.
    // At equilibrium buoyancy == weight, i.e. submergence == density. Solving
    // the slab ramp for that submergence must put the CENTRE at the height
    // Archimedes demands, not at some function of an arbitrary constant.
    for (const [density, halfH] of [[0.55, 0.45], [0.50, 0.07], [0.62, 0.34], [0.10, 0.018]]) {
      const span = halfH * 2;
      // Height at which the slab is exactly `density` submerged:
      const centreY = halfH - density * span;
      near(pointSubmergence(centreY, 0, span), density, 1e-12);
      // ...and that height is the classic answer: bottom sits `density` of the
      // body's own height below the surface.
      near(centreY - (-density * span + halfH), 0, 1e-12);
    }
  });

  test('a 0.55-density crate rides with its centre 4.5 cm under', () => {
    // 0.9 m cube, so 0.495 m of it is wet and the centre is 0.045 m down.
    near(pointSubmergence(-0.045, 0, 0.9), 0.55, 1e-12);
  });
});

describe('buoyant force', () => {
  test('Archimedes: full submersion displaces the whole volume', () => {
    near(buoyantForce(2, 1, 1, 1, -22), 44);
  });

  test('force is positive (upward) for every valid input', () => {
    for (const sub of [0.01, 0.5, 1]) {
      assert.ok(buoyantForce(0.7, 0.25, sub, 1, -22) > 0);
    }
  });

  test('shares split the force and never change the total', () => {
    const whole = buoyantForce(0.7, 1, 1, 1, -22);
    const quarters = 4 * buoyantForce(0.7, 0.25, 1, 1, -22);
    near(whole, quarters, 1e-12);
  });

  test('wood floats and stone sinks', () => {
    assert.equal(floats(0.55), true);   // crate
    assert.equal(floats(0.50), true);   // plank
    assert.equal(floats(0.62), true);   // log
    assert.equal(floats(0.10), true);   // leaf
    assert.equal(floats(2.40), false);  // kerbstone
    assert.equal(floats(1.00), false);  // neutrally buoyant is not floating
    near(equilibriumDraught(0.55), 0.55);
    assert.equal(equilibriumDraught(2.4), 1);
  });

  test('buoy shares sum to one and reach covers the deepest point', () => {
    const plank = [
      [-1.08, 0, -0.22, 0.25, 0.14], [1.08, 0, -0.22, 0.25, 0.14],
      [-1.08, 0, 0.22, 0.25, 0.14], [1.08, 0, 0.22, 0.25, 0.14],
    ];
    near(buoyShareSum(plank), 1, 1e-12);
    // Corner distance plus half its slab.
    near(buoyReach(plank), Math.hypot(1.08, 0, 0.22) + 0.07, 1e-12);
  });
});

describe('water levels', () => {
  const ponds = [{ x: -8, z: 154, radius: 7.5, level: 3.2 }];

  test('open ground is the ocean plane', () => {
    assert.equal(waterLevelAt(0, 0, ponds, 0), 0);
    assert.equal(waterLevelAt(-8, 100, ponds, 0), 0);
  });

  test('inside a pond it is the pond', () => {
    assert.equal(waterLevelAt(-8, 154, ponds, 0), 3.2);
    assert.equal(waterLevelAt(-8 + 7, 154, ponds, 0), 3.2);
  });

  test('the pond query overshoots its radius so a deckled rim still floats', () => {
    // The rendered outline wobbles +-17 %; a hard radius would drop a barrel
    // bobbing at the edge straight through the paper.
    assert.equal(waterLevelAt(-8 + 8.0, 154, ponds, 0), 3.2);
    assert.equal(waterLevelAt(-8 + 9.5, 154, ponds, 0), 0);
  });

  test('a null pond list is legal', () => {
    assert.equal(waterLevelAt(5, 5, null, -1), -1);
  });
});

describe('wind', () => {
  const out = { x: 0, z: 0, gust: 0 };

  test('is deterministic — same time, same vector', () => {
    windVector(12.5, 1, out);
    const a = { ...out };
    windVector(12.5, 1, out);
    assert.deepEqual({ ...out }, a);
  });

  test('scales linearly with the weather, direction unchanged', () => {
    windVector(7, 1, out);
    const one = { ...out };
    windVector(7, 2.1, out);
    near(out.x / one.x, 2.1, 1e-9);
    near(out.z / one.z, 2.1, 1e-9);
  });

  test('gusts breathe around 1 and stay positive', () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 400; t += 0.05) {
      const g = windGust(t);
      lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
    assert.ok(lo > 0.35 && lo < 0.5, `gust floor ${lo}`);
    assert.ok(hi > 1.5 && hi < 1.65, `gust ceiling ${hi}`);
  });

  test('gusts really do cross the leaf-waking threshold', () => {
    // If they never did, the leaves would sleep forever and the weather would
    // stop being visible on the ground.
    let crossings = 0;
    let was = false;
    for (let t = 0; t < 120; t += 1 / 60) {
      const now = windGust(t) >= PHYS.windWakeGust;
      if (now && !was) crossings++;
      was = now;
    }
    assert.ok(crossings >= 8, `only ${crossings} gusts in two minutes`);
  });

  test('wind pushes toward its own speed and never past it', () => {
    // Still leaf in a 5 m/s wind: pushed downwind.
    assert.ok(windForce(5, 0, 1) > 0);
    // Leaf already travelling with the wind: no push at all.
    near(windForce(5, 5, 1), 0);
    // Leaf overtaking the wind: dragged BACK. This is what stops a leaf being
    // accelerated across the island.
    assert.ok(windForce(5, 9, 1) < 0);
  });

  test('a sailless body feels nothing', () => {
    assert.equal(windForce(9, 0, 0), 0);
  });
});

describe('terrain grid', () => {
  test('the buffer is (cells+1)^2 heights', () => {
    const g = buildTerrainHeights(() => 0, { size: 480, cells: 96 });
    assert.equal(g.heights.length, 97 * 97);
    assert.equal(g.nrows, 96);
    assert.equal(g.ncols, 96);
    assert.equal(g.scaleX, 480);
    assert.equal(g.scaleZ, 480);
  });

  test('ROWS RUN ALONG Z AND COLUMNS ALONG X', () => {
    // Rapier's heightfield is a column-major nalgebra matrix whose rows run
    // along Z, which is not what anyone guesses and is invisible on a
    // symmetric test field. Verified empirically against rapier3d-compat
    // 0.19.3 by ray-casting; this pins it so a refactor cannot transpose the
    // island and leave props settling on hills that are not there.
    const g = buildTerrainHeights((x, z) => z, { size: 480, cells: 4, bias: 0 });
    // i indexes Z: walking i must walk the height.
    near(g.heights[heightIndex(0, 0, 4)], -240);
    near(g.heights[heightIndex(4, 0, 4)], 240);
    // j indexes X: walking j must NOT change a height that only depends on z.
    near(g.heights[heightIndex(0, 4, 4)], -240);
  });

  test('a height that depends only on x varies along j', () => {
    const g = buildTerrainHeights((x) => x, { size: 100, cells: 2, bias: 0 });
    near(g.heights[heightIndex(0, 0, 2)], -50);
    near(g.heights[heightIndex(0, 2, 2)], 50);
    near(g.heights[heightIndex(2, 0, 2)], -50);   // unchanged along i
  });

  test('the bias sinks the whole sheet', () => {
    const g = buildTerrainHeights(() => 10, { size: 10, cells: 1, bias: 0.25 });
    for (const h of g.heights) near(h, 9.75);
  });
});

describe('shape measures', () => {
  test('volumes', () => {
    near(shapeVolume({ shape: 'box', hx: 0.45, hy: 0.45, hz: 0.45 }), 0.9 ** 3, 1e-12);
    near(shapeVolume({ shape: 'ball', r: 2 }), (4 / 3) * Math.PI * 8, 1e-12);
    near(shapeVolume({ shape: 'cylinder', r: 1, halfHeight: 2 }), Math.PI * 4, 1e-12);
  });

  test('reach bounds the shape', () => {
    near(shapeReach({ shape: 'ball', r: 0.44 }), 0.44);
    near(shapeReach({ shape: 'cylinder', r: 0.34, halfHeight: 0.95 }), Math.hypot(0.34, 0.95));
    near(shapeReach({ shape: 'box', hx: 1, hy: 2, hz: 2 }), 3);
  });
});

describe('fixed stepper', () => {
  test('accumulates into whole substeps and keeps the remainder', () => {
    const s = createFixedStepper();
    assert.equal(s.advance(0.008), 0);
    assert.equal(s.advance(0.010), 1);          // 0.018 s -> one 1/60 step
    assert.ok(s.pending > 0 && s.pending < FIXED_DT);
  });

  test('a 60 Hz frame is exactly one step, forever', () => {
    const s = createFixedStepper();
    let total = 0;
    for (let i = 0; i < 600; i++) total += s.advance(1 / 60);
    assert.equal(total, 600);
    assert.equal(s.dropped, 0);
  });

  test('a 30 Hz frame is two steps', () => {
    const s = createFixedStepper();
    assert.equal(s.advance(1 / 30), 2);
  });

  test('a backgrounded tab drops time instead of spiralling', () => {
    const s = createFixedStepper();
    assert.equal(s.advance(30), PHYS.maxSubsteps);
    assert.ok(s.dropped > 1700);
    // And the accumulator is reset, so the NEXT frame is normal again.
    assert.equal(s.pending, 0);
    assert.equal(s.advance(1 / 60), 1);
  });

  test('non-positive dt is a no-op — the clock never runs backwards', () => {
    const s = createFixedStepper();
    assert.equal(s.advance(0), 0);
    assert.equal(s.advance(-5), 0);
    assert.equal(s.pending, 0);
  });

  test('alpha is the sub-step remainder for render interpolation', () => {
    const s = createFixedStepper();
    s.advance(FIXED_DT * 1.5);
    near(s.alpha, 0.5, 1e-9);
  });

  test('is a pure function of the dt sequence — no wall clock', () => {
    const seq = [0.004, 0.021, 0.017, 0.033, 0.009, 0.28];
    const run = () => { const s = createFixedStepper(); return seq.map((d) => s.advance(d)); };
    assert.deepEqual(run(), run());
  });
});

describe('body pool', () => {
  test('fills to capacity without evicting', () => {
    const p = createBodyPool(3);
    for (const id of ['a', 'b', 'c']) {
      assert.deepEqual(p.acquire(id), { ok: true, evicted: null, reason: null });
    }
    assert.equal(p.size, 3);
    assert.equal(p.full, true);
  });

  test('the 4th body of a 3-cap pool evicts the OLDEST', () => {
    const p = createBodyPool(3);
    p.acquire('a'); p.acquire('b'); p.acquire('c');
    const r = p.acquire('d');
    assert.equal(r.ok, true);
    assert.equal(r.evicted, 'a');
    assert.equal(p.has('a'), false);
    assert.equal(p.size, 3);
  });

  test('touching a body makes it the newest, so it survives the next eviction', () => {
    const p = createBodyPool(3);
    p.acquire('a'); p.acquire('b'); p.acquire('c');
    p.touch('a');
    assert.equal(p.acquire('d').evicted, 'b');
    assert.equal(p.has('a'), true);
  });

  test('PINNED BODIES ARE NEVER RECYCLED', () => {
    // The sandbox furniture and every puzzle piece is pinned. A pressure-plate
    // puzzle whose crates could be recycled out from under it would silently
    // become unsolvable, which is the worst failure this game can have.
    const p = createBodyPool(3);
    p.acquire('puzzle-1', { pinned: true });
    p.acquire('loose-a');
    p.acquire('loose-b');
    assert.equal(p.acquire('loose-c').evicted, 'loose-a');
    assert.equal(p.has('puzzle-1'), true);
    assert.equal(p.acquire('loose-d').evicted, 'loose-b');
    assert.equal(p.has('puzzle-1'), true);
  });

  test('a pool full of pinned bodies REFUSES rather than breaking its promise', () => {
    const p = createBodyPool(2);
    p.acquire('p1', { pinned: true });
    p.acquire('p2', { pinned: true });
    const r = p.acquire('p3');
    assert.deepEqual(r, { ok: false, evicted: null, reason: 'full-pinned' });
    assert.equal(p.size, 2);
    assert.equal(p.has('p3'), false);
  });

  test('re-acquiring an id refreshes it without double-counting', () => {
    const p = createBodyPool(3);
    p.acquire('a'); p.acquire('b');
    const r = p.acquire('a');
    assert.equal(r.evicted, null);
    assert.equal(p.size, 2);
    // 'a' is now the newest, so 'b' goes first.
    p.acquire('c');
    assert.equal(p.acquire('d').evicted, 'b');
  });

  test('release frees a slot', () => {
    const p = createBodyPool(2);
    p.acquire('a'); p.acquire('b');
    assert.equal(p.release('a'), true);
    assert.equal(p.release('a'), false);
    assert.equal(p.acquire('c').evicted, null);
  });

  test('pinnedCount and oldest report the truth', () => {
    const p = createBodyPool(4);
    p.acquire('a'); p.acquire('p', { pinned: true }); p.acquire('b');
    assert.equal(p.pinnedCount(), 1);
    assert.equal(p.oldest(), 'a');
    p.release('a');
    assert.equal(p.oldest(), 'b');
  });

  test('the default cap is the documented 120', () => {
    assert.equal(createBodyPool().cap, 120);
    assert.equal(PHYS.maxBodies, 120);
  });
});
