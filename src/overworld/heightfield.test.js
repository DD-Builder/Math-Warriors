import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHeightfield, WORLD } from './heightfield.js';
import { BIOMES, PORTALS, BUILDINGS, COLLECTIBLES, SPAWN, PADS, PATHS, TERRACES, RIDGES, biomeForFloor } from './worldSpec.js';
import { makeRng } from '../systems/rng.js';

// Walkable = solidly above water on a slope gentler than 50 degrees.
const MIN_NY = Math.cos(50 * Math.PI / 180);

describe('heightfield', () => {
  test('deterministic: two instances agree at 50 seeded random points', () => {
    const a = createHeightfield(WORLD.SEED);
    const b = createHeightfield(WORLD.SEED);
    const rng = makeRng(1234);
    for (let i = 0; i < 50; i++) {
      const x = (rng() * 2 - 1) * WORLD.HALF;
      const z = (rng() * 2 - 1) * WORLD.HALF;
      assert.equal(a.sampleHeight(x, z), b.sampleHeight(x, z), `height diverged at (${x},${z})`);
    }
  });

  test('island: high center, water beyond radius 235 on all 16 compass points', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.sampleHeight(0, 0) > 5, `center too low: ${hf.sampleHeight(0, 0)}`);
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const h = hf.sampleHeight(236 * Math.cos(a), 236 * Math.sin(a));
      assert.ok(h < WORLD.WATER_Y, `land above water at edge angle ${k}: ${h}`);
    }
  });

  test('placement audit: every portal, building, collectible and spawn is walkable', () => {
    const hf = createHeightfield(WORLD.SEED);
    const spots = [
      ...PORTALS.map((p) => [p.id, p.x, p.z]),
      ...BUILDINGS.map((b) => [b.id, b.x, b.z]),
      ...COLLECTIBLES.map((c) => [c.id, c.x, c.z]),
      ['spawn', SPAWN.x, SPAWN.z],
    ];
    for (const [id, x, z] of spots) {
      const h = hf.sampleHeight(x, z);
      const ny = hf.sampleNormal(x, z)[1];
      assert.ok(h > WORLD.WATER_Y + 0.4, `${id} at (${x},${z}) is not on dry land: h=${h}`);
      assert.ok(ny > MIN_NY, `${id} at (${x},${z}) is too steep: normal.y=${ny}`);
    }
  });

  test('sampleNormal is unit-length and upward on land', () => {
    const hf = createHeightfield(WORLD.SEED);
    const [nx, ny, nz] = hf.sampleNormal(SPAWN.x, SPAWN.z);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-9);
    assert.ok(ny > 0);
  });

  test('biomeAt: owning id at each biome center, ocean far outside', () => {
    const hf = createHeightfield(WORLD.SEED);
    for (const b of BIOMES) {
      assert.equal(hf.biomeAt(b.center[0], b.center[1]), b.id);
    }
    assert.equal(hf.biomeAt(239, 239), 'ocean');
    assert.equal(hf.biomeAt(-239, -239), 'ocean');
  });

  test('shoreDistance sign flips across the beach', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.shoreDistance(SPAWN.x, SPAWN.z) > 0, 'spawn should be on land');
    assert.ok(hf.shoreDistance(0, 238) < 0, 'open water should be negative');
    // Walking south from the garden, the sign must flip exactly where the
    // terrain crosses the waterline.
    for (let z = 150; z <= 239; z += 1) {
      const d = hf.shoreDistance(0, z);
      const h = hf.sampleHeight(0, z) - WORLD.WATER_Y;
      if (h > 0.01) assert.ok(d > 0, `land at z=${z} but shoreDistance=${d}`);
      if (h < -0.01) assert.ok(d < 0, `water at z=${z} but shoreDistance=${d}`);
    }
  });

  test('worldSpec lookups', () => {
    assert.equal(biomeForFloor(9).id, 'palace');
    assert.equal(biomeForFloor(1).id, 'garden');
    assert.equal(biomeForFloor(99), null);
    assert.equal(COLLECTIBLES.length, 36);
    for (const c of COLLECTIBLES) {
      if (c.kind === 'gold') assert.ok(c.amount >= 15 && c.amount <= 40, c.id);
      else assert.equal(c.amount, 1, c.id);
    }
  });
});

/**
 * Silhouette extent of a landform on one bearing: the furthest radius at which
 * it still stands at `frac` of its summit height. This is the number that
 * decides whether a mesa reads as a shape or as a muffin, so it is the number
 * the asymmetry tests measure.
 */
function extentAt(hf, b, turns, frac) {
  const a = turns * Math.PI * 2;
  const summit = hf.sampleHeight(b.center[0], b.center[1]);
  const cut = summit * frac;
  let out = 0;
  for (let r = 0; r <= b.radius * 1.25; r += 1) {
    const h = hf.sampleHeight(b.center[0] + Math.cos(a) * r, b.center[1] + Math.sin(a) * r);
    if (h >= cut) out = r;
  }
  return out;
}

describe('landform asymmetry', () => {
  // The single most damaging defect the art critique found was that every
  // landform was a 1-D profile swept around a centre, i.e. structurally
  // incapable of being anything but radially symmetric. These tests fail if
  // that ever comes back.
  test('every profile landform is asymmetric in silhouette', () => {
    const hf = createHeightfield(WORLD.SEED);
    for (const b of BIOMES) {
      if (!b.profile) continue;
      let min = Infinity, max = 0;
      for (let k = 0; k < 16; k++) {
        const e = extentAt(hf, b, k / 16, 0.55);
        if (e < min) min = e;
        if (e > max) max = e;
      }
      // A swept profile gives max/min ~ 1.0 (only relief noise separates them).
      assert.ok(max / min > 1.35,
        `${b.id} is near-radially-symmetric: extent ${min.toFixed(0)}..${max.toFixed(0)} m`);
    }
  });

  test('profileAsym keeps the landform landing on the ground it sits in', () => {
    // t**reach fixes both endpoints, so however hard a flank is pushed the
    // profile must still reach zero at the biome radius — no step at the rim.
    const hf = createHeightfield(WORLD.SEED);
    for (const b of BIOMES) {
      if (!b.profileAsym) continue;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        // A discontinuity would show as a jump across the rim itself; a
        // neighbouring ridge or biome shows as a slope either side of it, so
        // the window is deliberately narrow (2 m) rather than generous.
        const rim = b.radius;
        const hIn = hf.sampleHeight(b.center[0] + Math.cos(a) * (rim - 1), b.center[1] + Math.sin(a) * (rim - 1));
        const hOut = hf.sampleHeight(b.center[0] + Math.cos(a) * (rim + 1), b.center[1] + Math.sin(a) * (rim + 1));
        // 8 m across 2 m is a 76-degree face, which the island does contain
        // where a ridge arm crosses a biome rim. A genuine endpoint failure is
        // a whole profile stop tall — tens of metres — so this catches the bug
        // without outlawing steep ground.
        assert.ok(Math.abs(hIn - hOut) < 8,
          `${b.id} steps ${(hIn - hOut).toFixed(1)} m across its own rim on bearing ${k}/12`);
      }
    }
  });

  test('tors exist and none of them buries a pad', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.torCount >= 30, `only ${hf.torCount} mid-ground tors were placed`);
    // A tor over a portal or a coin would be a gameplay bug, and the scatter
    // rejects those positions; if the rejection ever regresses, the pad's
    // levelled ground is the thing that visibly breaks.
    for (const p of PADS) {
      assert.ok(hf.sampleNormal(p.x, p.z)[1] > 0.999,
        `${p.id} is not level: normal.y=${hf.sampleNormal(p.x, p.z)[1]}`);
    }
  });
});

describe('civil layer', () => {
  test('every portal and building stands on dead-level ground', () => {
    const hf = createHeightfield(WORLD.SEED);
    for (const spot of [...PORTALS, ...BUILDINGS]) {
      const y = hf.sampleHeight(spot.x, spot.z);
      // Level across the whole footing, not just at the centre point.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const d = hf.sampleHeight(spot.x + Math.cos(a) * 3.5, spot.z + Math.sin(a) * 3.5);
        assert.ok(Math.abs(d - y) < 0.25,
          `${spot.id} footing is out of level by ${(d - y).toFixed(2)} m`);
      }
    }
  });

  test('the market plaza is a flat plinth with a readable edge', () => {
    const hf = createHeightfield(WORLD.SEED);
    const t = TERRACES.find((x) => x.id === 'market-plaza');
    const level = hf.sampleHeight(t.x, t.z);
    // Flat on top. Not perfectly flat: the main street ramps across the plinth
    // on its way through, which is the point of having a road at all.
    let lo = level, hi = level;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const h = hf.sampleHeight(t.x + Math.cos(a) * t.hx * 0.6, t.z + Math.sin(a) * t.hz * 0.6);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    assert.ok(hi - lo < 1.2, `plaza interior varies by ${(hi - lo).toFixed(2)} m`);
    // ...and a level change that reads from most approaches. It is cut into a
    // slope, so the uphill side is legitimately level with it — the assertion
    // is that most of the perimeter is a step, not all of it.
    let above = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const out = hf.sampleHeight(t.x + Math.cos(a) * (t.hx + t.skirt + 16),
        t.z + Math.sin(a) * (t.hz + t.skirt + 16));
      if (level - out > 0.8) above++;
    }
    assert.ok(above >= 4, `plaza only stands above ${above}/12 of its surroundings`);
  });

  test('paths hold a walkable grade along their whole length', () => {
    const hf = createHeightfield(WORLD.SEED);
    for (const path of PATHS) {
      for (let i = 0; i < path.pts.length - 1; i++) {
        const [ax, az] = path.pts[i];
        const [bx, bz] = path.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(2, Math.round(len));
        let prev = hf.sampleHeight(ax, az);
        for (let k = 1; k <= steps; k++) {
          const u = k / steps;
          const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
          const h = hf.sampleHeight(x, z);
          const grade = Math.abs(h - prev) / (len / steps);
          assert.ok(grade < 1.19, // tan(50 deg) — the controller's wall limit
            `${path.id} exceeds walkable grade (${grade.toFixed(2)}) at u=${(i + u).toFixed(2)}`);
          prev = h;
        }
      }
    }
  });

  test('wearAt marks roads and plazas, and nothing else', () => {
    const hf = createHeightfield(WORLD.SEED);
    assert.ok(hf.wearAt(-155, 3) > 0.4, 'plaza centre is unworn');
    assert.ok(hf.wearAt(PORTALS[0].x, PORTALS[0].z) > 0.4, 'portal apron is unworn');
    // Open ground, well clear of every pad, path and terrace.
    for (const [x, z] of [[60, 90], [-60, -90], [95, 60], [-30, 190]]) {
      assert.equal(hf.wearAt(x, z), 0, `open ground at (${x},${z}) is painted as worn`);
    }
  });

  test('ridge arms taper to nothing at both ends', () => {
    // An arm that stops dead reads as a wall someone left behind; the end
    // taper is what makes it a buttress.
    const hf = createHeightfield(WORLD.SEED);
    for (const rg of RIDGES) {
      const [hx, hz] = rg.pts[0];
      const [tx, tz] = rg.pts[rg.pts.length - 1];
      for (const [px, pz] of [[hx, hz], [tx, tz]]) {
        // Sample just off the tip along the arm's own axis: the crest height
        // must have decayed, not stepped.
        const h = hf.sampleHeight(px, pz);
        let sides = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          sides += hf.sampleHeight(px + Math.cos(a) * rg.width, pz + Math.sin(a) * rg.width);
        }
        assert.ok(Math.abs(h - sides / 8) < rg.height * 0.85,
          `${rg.id} terminates in a step at (${px},${pz})`);
      }
    }
  });
});
