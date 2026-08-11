import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROP_KINDS, PROP_ORDER, SANDBOX, PUZZLES, PUZZLE_HOLD,
  kindFloats, kindVolume, kindMass, bodySpecFor, layQuat, spawnLift,
  bodyInZone, countInZone, evaluatePuzzle, createPuzzleTracker,
  windResponse, LEASH, leashRadius, recallReason,
} from './physicsProps.js';
import { PHYS, buoyShareSum, shapeVolume } from './physics.js';
import { createHeightfield } from './heightfield.js';
import { resolvePonds } from './water.js';
import { WORLD, PADS } from './worldSpec.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

/** Rotate a local vector by a quaternion — the reference three.js does. */
function rotate(q, v) {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

describe('prop kinds', () => {
  test('every kind in PROP_ORDER has a definition and vice versa', () => {
    for (const k of PROP_ORDER) assert.ok(PROP_KINDS[k], `${k} missing`);
    for (const k of Object.keys(PROP_KINDS)) assert.ok(PROP_ORDER.includes(k), `${k} not drawn`);
  });

  test('every kind has well-formed buoy points', () => {
    for (const [name, k] of Object.entries(PROP_KINDS)) {
      assert.ok(k.buoys.length >= 1, `${name} has no buoys`);
      near(buoyShareSum(k.buoys), 1, 1e-12);
      for (const b of k.buoys) {
        assert.equal(b.length >= 4, true, `${name} buoy is malformed`);
        assert.ok(b[3] > 0, `${name} has a zero-share buoy`);
      }
    }
  });

  test('THE HEADLINE: wood floats, stone sinks, and the draughts differ', () => {
    assert.equal(kindFloats('leaf'), true);
    assert.equal(kindFloats('plank'), true);
    assert.equal(kindFloats('crate'), true);
    assert.equal(kindFloats('log'), true);
    assert.equal(kindFloats('ball'), true);
    assert.equal(kindFloats('stone'), false);
    // Four different woods at four visibly different waterlines is the thing
    // that makes buoyancy legible rather than just present.
    const d = ['leaf', 'ball', 'plank', 'crate', 'log'].map((k) => PROP_KINDS[k].density);
    for (let i = 1; i < d.length; i++) {
      assert.ok(d[i] - d[i - 1] > 0.03, `densities ${d[i - 1]} and ${d[i]} are too close to tell apart`);
    }
    assert.ok(PROP_KINDS.stone.density > PHYS.fluidDensity * 2);
  });

  test('the leaf is the wind-catcher by an order of magnitude', () => {
    const leaf = PROP_KINDS.leaf;
    const crate = PROP_KINDS.crate;
    // Acceleration per unit of wind force is sail/mass. That ratio, not the
    // sail alone, is what decides which objects the weather can move.
    const leafResponse = leaf.sail / kindMass('leaf');
    const crateResponse = crate.sail / kindMass('crate');
    assert.ok(leafResponse > crateResponse * 100, `${leafResponse} vs ${crateResponse}`);
    assert.equal(PROP_KINDS.stone.sail, 0);
  });

  test('volumes and masses agree with the shared shape maths', () => {
    for (const [name, k] of Object.entries(PROP_KINDS)) {
      near(kindVolume(name), shapeVolume(k), 1e-12);
      near(kindMass(name), shapeVolume(k) * k.density, 1e-12);
    }
  });

  test('unknown kinds are answered, not thrown at', () => {
    assert.equal(kindFloats('sofa'), false);
    assert.equal(kindVolume('sofa'), 0);
    assert.equal(bodySpecFor({ kind: 'sofa', id: 'x', x: 0, z: 0 }, 0), null);
  });
});

describe('body specs', () => {
  test('a crate is a box, upright, at the height it was given', () => {
    const s = bodySpecFor({ id: 'c', kind: 'crate', x: 3, z: -4, yaw: 0.5 }, 12);
    assert.equal(s.shape, 'box');
    assert.equal(s.hx, 0.45);
    assert.deepEqual([s.x, s.y, s.z], [3, 12, -4]);
    assert.equal(s.yaw, 0.5);
    assert.equal(s.rot, undefined);
    assert.equal(s.pinned, true);
  });

  test('A LOG IS SPAWNED LYING DOWN', () => {
    // Rapier cylinders are axis-aligned to local +Y. A log spawned upright is
    // a bollard, not a toy, and nothing else in the game would notice.
    const s = bodySpecFor({ id: 'l', kind: 'log', x: 0, z: 0, yaw: 0 }, 1);
    assert.ok(s.rot, 'log has no lay-down rotation');
    const axis = rotate(s.rot, [0, 1, 0]);
    near(axis[1], 0, 1e-9);                       // the axis is HORIZONTAL
    near(Math.hypot(axis[0], axis[2]), 1, 1e-9);  // and still a unit vector
  });

  test('a laid body yaws about the world up, so `yaw` means "which way"', () => {
    const a = rotate(layQuat(0), [0, 1, 0]);
    const b = rotate(layQuat(Math.PI / 2), [0, 1, 0]);
    near(a[1], 0, 1e-9);
    near(b[1], 0, 1e-9);
    // A quarter turn of yaw must swing the horizontal axis by a quarter turn.
    const dot = a[0] * b[0] + a[2] * b[2];
    near(dot, 0, 1e-9);
  });

  test('layQuat is a unit quaternion', () => {
    for (const yaw of [0, 0.3, 1.9, -2.4, Math.PI]) {
      const q = layQuat(yaw);
      near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-12);
    }
  });

  test('a ball carries its radius and a plank its half extents', () => {
    const b = bodySpecFor({ id: 'b', kind: 'ball', x: 0, z: 0 }, 0);
    assert.equal(b.r, PROP_KINDS.ball.r);
    assert.equal(b.hx, undefined);
    const p = bodySpecFor({ id: 'p', kind: 'plank', x: 0, z: 0 }, 0);
    assert.equal(p.hx, 1.30);
    assert.equal(p.r, undefined);
  });

  test('spawn lift never buries a body in the ground', () => {
    for (const k of PROP_ORDER) {
      const spec = PROP_KINDS[k];
      const lift = spawnLift(k);
      const halfDown = spec.shape === 'ball' ? spec.r
        : spec.shape === 'cylinder' ? spec.r    // laid on its side
          : spec.hy;
      assert.ok(lift >= halfDown, `${k} spawns ${halfDown - lift} m underground`);
    }
  });
});

describe('the sandbox', () => {
  test('is about forty objects', () => {
    assert.ok(SANDBOX.length >= 38 && SANDBOX.length <= 54, `${SANDBOX.length} objects`);
  });

  test('fits inside the body cap with headroom for play', () => {
    // A child must be able to spawn or throw things without instantly
    // recycling the furniture out from under themselves.
    assert.ok(SANDBOX.length < PHYS.maxBodies * 0.5, `${SANDBOX.length} of ${PHYS.maxBodies}`);
  });

  test('every id is unique', () => {
    const seen = new Set();
    for (const p of SANDBOX) {
      assert.equal(seen.has(p.id), false, `duplicate ${p.id}`);
      seen.add(p.id);
    }
  });

  test('every placement names a real kind', () => {
    for (const p of SANDBOX) assert.ok(PROP_KINDS[p.kind], `${p.id} is a ${p.kind}`);
  });

  test('every placement is inside the island, well clear of the rim', () => {
    for (const p of SANDBOX) {
      assert.ok(Math.abs(p.x) < 230 && Math.abs(p.z) < 230, `${p.id} at ${p.x},${p.z}`);
    }
  });

  test('the objects are CLUSTERED, not sprinkled', () => {
    // One crate is scenery; five crates by a ledge is a question. 12 m is
    // roughly what a camera at this boom distance holds in frame, so the rule
    // is really "you can never see one of these on its own".
    for (const a of SANDBOX) {
      let neighbours = 0;
      for (const b of SANDBOX) {
        if (a === b) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) <= 12) neighbours++;
      }
      assert.ok(neighbours >= 2, `${a.id} is on its own (${neighbours} neighbours)`);
    }
  });

  test('nothing is born inside another object', () => {
    for (let i = 0; i < SANDBOX.length; i++) {
      for (let j = i + 1; j < SANDBOX.length; j++) {
        const a = SANDBOX[i], b = SANDBOX[j];
        // The see-saw is a deliberate stack: a plank resting on a log.
        if (a.lift || b.lift) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        assert.ok(d > 1.2, `${a.id} and ${b.id} overlap at ${d.toFixed(2)} m`);
      }
    }
  });

  test('both places have all the verbs a toybox needs', () => {
    const inGarden = SANDBOX.filter((p) => p.z > 100);
    const inMarket = SANDBOX.filter((p) => p.x < -100);
    for (const [name, set] of [['garden', inGarden], ['market', inMarket]]) {
      const kinds = new Set(set.map((p) => p.kind));
      for (const need of ['crate', 'ball', 'log', 'plank', 'leaf']) {
        assert.ok(kinds.has(need), `${name} has no ${need}`);
      }
    }
    // Together they account for essentially the whole sandbox.
    assert.equal(inGarden.length + inMarket.length, SANDBOX.length);
  });
});

describe('puzzle zones', () => {
  const zone = { id: 'z', kind: 'crate', check: 'in', x: 10, z: 20, r: 2, y0: -0.5, y1: 5 };

  test('inside the cylinder and the height window', () => {
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 10, y: 1, z: 20 }), true);
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 11.9, y: 1, z: 20 }), true);
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 12.1, y: 1, z: 20 }), false);
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 10, y: 6, z: 20 }), false);
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 10, y: -1, z: 20 }), false);
  });

  test('the height window is measured from the GROUND, not from sea level', () => {
    // Authors must never have to know the terrain height, or a heightfield
    // retune silently breaks every puzzle on the island.
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 10, y: 31, z: 20 }, 30), true);
    assert.equal(bodyInZone(zone, { kind: 'crate', x: 10, y: 1, z: 20 }, 30), false);
  });

  test('a zone with a kind refuses everything else', () => {
    assert.equal(bodyInZone(zone, { kind: 'ball', x: 10, y: 1, z: 20 }), false);
  });

  test('a kindless zone takes anything', () => {
    const any = { ...zone, kind: null };
    assert.equal(bodyInZone(any, { kind: 'ball', x: 10, y: 1, z: 20 }), true);
    assert.equal(bodyInZone(any, { kind: 'stone', x: 10, y: 1, z: 20 }), true);
  });

  test('a float zone wants PARTLY wet — not dry, not sunk', () => {
    const f = { ...zone, check: 'float', kind: 'plank' };
    const at = (wet) => bodyInZone(f, { kind: 'plank', x: 10, y: 1, z: 20, wet });
    assert.equal(at(0), false);        // sitting dry on the bank
    assert.equal(at(0.5), true);       // afloat
    assert.equal(at(1), false);        // on the bottom
    assert.equal(at(undefined), false);
  });

  test('countInZone honours an explicit length so a scratch array can be reused', () => {
    const bodies = [
      { kind: 'crate', x: 10, y: 1, z: 20 },
      { kind: 'crate', x: 10.5, y: 2, z: 20 },
      { kind: 'crate', x: 10, y: 3, z: 20 },   // stale entry past `len`
    ];
    assert.equal(countInZone(zone, bodies, 0, 2), 2);
    assert.equal(countInZone(zone, bodies, 0), 3);
  });
});

describe('the authored puzzles', () => {
  test('there are several and they span more than one operation', () => {
    assert.ok(PUZZLES.length >= 5, `${PUZZLES.length} puzzles`);
    const ops = new Set(PUZZLES.map((p) => p.prompt.replace(/[\d\s]/g, '')));
    assert.ok(ops.size >= 3, `only ${[...ops]} — a toybox should not be all addition`);
  });

  test('every prompt actually evaluates to its answer', () => {
    // A signboard that lies to a five-year-old is the worst bug in the file.
    for (const p of PUZZLES) {
      const m = p.prompt.match(/^(\d+)\s*([+\-x])\s*(\d+)$/);
      assert.ok(m, `${p.id}: cannot parse "${p.prompt}"`);
      const a = +m[1], b = +m[3];
      const got = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b;
      assert.equal(got, p.answer, `${p.id}: ${p.prompt} != ${p.answer}`);
    }
  });

  test('the answer is what the world actually counts', () => {
    for (const p of PUZZLES) assert.equal(p.need, p.answer, `${p.id} asks one thing and checks another`);
  });

  test('every answer is inside a K-5 head', () => {
    for (const p of PUZZLES) {
      assert.ok(p.answer >= 1 && p.answer <= 10, `${p.id} needs ${p.answer}`);
    }
  });

  test('every puzzle is solvable with the objects that exist near it', () => {
    for (const p of PUZZLES) {
      for (const z of p.zones) {
        if (!z.kind) continue;
        // Count that kind within 60 m of the zone — the walk a child will make.
        const stock = SANDBOX.filter((s) => s.kind === z.kind
          && Math.hypot(s.x - z.x, s.z - z.z) < 60).length;
        assert.ok(stock >= p.need, `${p.id} needs ${p.need} ${z.kind} but only ${stock} are within reach`);
      }
    }
  });

  test('kindless puzzles have SOMETHING nearby to put on them', () => {
    for (const p of PUZZLES) {
      if (p.zones.some((z) => z.kind)) continue;
      const stock = SANDBOX.filter((s) => Math.hypot(s.x - p.zones[0].x, s.z - p.zones[0].z) < 60).length;
      assert.ok(stock >= p.need, `${p.id} needs ${p.need} objects, ${stock} within reach`);
    }
  });

  test('ids and zone ids are unique', () => {
    const ids = new Set();
    for (const p of PUZZLES) {
      assert.equal(ids.has(p.id), false, `duplicate puzzle ${p.id}`);
      ids.add(p.id);
      const zids = new Set();
      for (const z of p.zones) {
        assert.equal(zids.has(z.id), false, `duplicate zone ${z.id} in ${p.id}`);
        zids.add(z.id);
      }
    }
  });

  test('every `pair` names a zone in the same puzzle', () => {
    for (const p of PUZZLES) {
      for (const z of p.zones) {
        if (!z.pair) continue;
        assert.ok(p.zones.some((o) => o.id === z.pair), `${p.id}/${z.id} pairs with a ghost`);
      }
    }
  });

  test('paired puzzles need an even total, or they cannot be balanced', () => {
    for (const p of PUZZLES) {
      if (!p.zones.some((z) => z.pair)) continue;
      assert.equal(p.need % 2, 0, `${p.id} asks for ${p.need} split evenly across two ends`);
    }
  });
});

describe('puzzle evaluation', () => {
  const rack = PUZZLES.find((p) => p.id === 'phz-garden-logs');
  // Laid where a pushed log actually comes to rest: on the ground, inside the
  // zone's window. Spread a little in x so they are not co-located.
  const logs = (n) => Array.from({ length: n }, (_, i) => ({
    kind: 'log', x: rack.zones[0].x + (i - 1) * 0.7, y: 0.34, z: rack.zones[0].z, wet: 0,
  }));

  test('EXACT count — one too few and one too many both fail', () => {
    // "At least N" teaches "pile everything on". Exact-N means taking one back
    // off, and taking one back off is subtraction happening in their hands.
    assert.equal(evaluatePuzzle(rack, logs(2)).solved, false);
    assert.equal(evaluatePuzzle(rack, logs(3)).solved, true);
    assert.equal(evaluatePuzzle(rack, logs(4)).solved, false);
  });

  test('the wrong kind does not count', () => {
    const wrong = logs(3).map((c) => ({ ...c, kind: 'ball' }));
    assert.equal(evaluatePuzzle(rack, wrong).solved, false);
    assert.equal(evaluatePuzzle(rack, wrong).total, 0);
  });

  test('a paired puzzle needs the SAME number on each side, not just the right total', () => {
    const seesaw = PUZZLES.find((p) => p.zones.some((z) => z.pair));
    const [l, r] = seesaw.zones;
    const at = (zone, n) => Array.from({ length: n }, () => ({
      kind: zone.kind || 'crate', x: zone.x, y: (zone.y0 + zone.y1) / 2, z: zone.z, wet: 0,
    }));
    // Six in total, all on one end: that is a see-saw on the floor.
    assert.equal(evaluatePuzzle(seesaw, at(l, 6)).solved, false);
    assert.equal(evaluatePuzzle(seesaw, [...at(l, 4), ...at(r, 2)]).solved, false);
    assert.equal(evaluatePuzzle(seesaw, [...at(l, 3), ...at(r, 3)]).solved, true);
  });

  test('the ground sampler is consulted per zone', () => {
    const seen = [];
    evaluatePuzzle(rack, logs(3), (x, z) => { seen.push([x, z]); return 0; });
    assert.equal(seen.length, rack.zones.length);
  });

  test('writing into an `out` object gives the same answer as allocating one', () => {
    const out = { solved: false, total: 0, need: 0, counts: [] };
    const a = evaluatePuzzle(rack, logs(3));
    const b = evaluatePuzzle(rack, logs(3), null, 3, out);
    assert.equal(b, out);
    assert.equal(a.solved, b.solved);
    assert.equal(a.total, b.total);
    assert.deepEqual(a.counts, [...b.counts]);
  });
});

describe('puzzle tracker', () => {
  const one = [PUZZLES[0]];
  const zone = one[0].zones[0];
  const right = Array.from({ length: one[0].need }, (_, i) => ({
    kind: zone.kind, x: zone.x + (i - 1) * 0.7, y: (zone.y0 + zone.y1) / 2, z: zone.z, wet: 0,
  }));

  test('a correct arrangement must be HELD before it latches', () => {
    // So a crate rolling through the zone can never steal the solve.
    const t = createPuzzleTracker(one);
    assert.equal(t.step(0.2, right), null);
    assert.equal(t.step(0.2, right), null);
    assert.equal(t.get(one[0].id).solved, false);
    const fired = t.step(0.4, right);
    assert.deepEqual(fired, [one[0].id]);
    assert.equal(t.get(one[0].id).solved, true);
  });

  test('the hold resets the moment the count is wrong again', () => {
    const t = createPuzzleTracker(one);
    t.step(0.6, right);
    assert.equal(t.get(one[0].id).holding > 0, true);
    t.step(0.1, []);
    assert.equal(t.get(one[0].id).holding, 0);
    assert.equal(t.step(0.6, right), null);   // must start the hold over
  });

  test('ONCE SOLVED IT STAYS SOLVED', () => {
    // A child who knocks their own tower over has not un-earned the reward.
    const t = createPuzzleTracker(one);
    t.step(PUZZLE_HOLD + 0.01, right);
    assert.equal(t.get(one[0].id).solved, true);
    for (let i = 0; i < 30; i++) t.step(1 / 6, []);
    assert.equal(t.get(one[0].id).solved, true);
    assert.equal(t.solvedCount(), 1);
  });

  test('it fires exactly once', () => {
    const t = createPuzzleTracker(one);
    assert.deepEqual(t.step(1, right), [one[0].id]);
    assert.equal(t.step(1, right), null);
    assert.equal(t.step(1, right), null);
  });

  test('the common case (nothing solved) returns null, so it never allocates', () => {
    const t = createPuzzleTracker();
    for (let i = 0; i < 20; i++) assert.equal(t.step(1 / 6, []), null);
  });

  test('is deterministic on its dt sequence, with no clock of its own', () => {
    const run = () => {
      const t = createPuzzleTracker(one);
      const seq = [];
      for (const dt of [0.1, 0.2, 0.1, 0.2, 0.2, 0.3]) seq.push(t.step(dt, right));
      return JSON.stringify(seq);
    };
    assert.equal(run(), run());
  });

  test('a save file can be restored', () => {
    const t = createPuzzleTracker();
    t.restore([PUZZLES[0].id, PUZZLES[2].id]);
    assert.equal(t.solvedCount(), 2);
    assert.deepEqual(t.solvedIds().sort(), [PUZZLES[0].id, PUZZLES[2].id].sort());
    t.restore(null);                     // must tolerate a save with no field
    assert.equal(t.solvedCount(), 2);
    t.restore(['not-a-puzzle']);         // and a stale id from an old build
    assert.equal(t.solvedCount(), 2);
  });

  test('progress is reported while the child is part way there', () => {
    const t = createPuzzleTracker(one);
    t.step(1 / 6, right.slice(0, 2));
    const s = t.get(one[0].id);
    assert.equal(s.total, 2);
    assert.equal(s.need, one[0].need);
    assert.equal(s.solved, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The layout, checked against the REAL island
// ─────────────────────────────────────────────────────────────────────────

/**
 * WHY THIS SUITE EXISTS.
 *
 * Every test above this line asks whether the numbers in the tables are
 * self-consistent, and every one of them passed while the sandbox was
 * unplayable. The coordinates had been authored against a mental picture of the
 * island rather than the island, and the heightfield disagreed: six placements
 * were on 35-40 degree slopes, so within twelve seconds of calm the crates had
 * slid off the knoll, three logs had rolled 23-44 m and four balls were in the
 * sea. Three planks and both kerbstones spawned inside puzzle zones and
 * pre-solved two puzzles before the player arrived.
 *
 * A table of coordinates is a claim about terrain. This suite is where that
 * claim is checked, against `createHeightfield(WORLD.SEED)` — the same pure,
 * deterministic function the game builds the world from, which is why it can be
 * done here in milliseconds instead of in a screenshot.
 */
describe('the sandbox, measured against the real heightfield', () => {
  const hf = createHeightfield(WORLD.SEED);
  const H = (x, z) => hf.sampleHeight(x, z);

  /** Gradient magnitude, rise over run. */
  const slopeAt = (x, z, d = 1.2) => Math.hypot(
    (H(x + d, z) - H(x - d, z)) / (2 * d),
    (H(x, z + d) - H(x, z - d)) / (2 * d),
  );
  /** Worst gradient anywhere under a body's footprint, not just at its centre. */
  const footSlope = (x, z, r) => {
    let m = slopeAt(x, z);
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      m = Math.max(m, slopeAt(x + Math.cos(t) * r, z + Math.sin(t) * r));
    }
    return m;
  };
  /** How far downhill a body could get within R metres if it started rolling. */
  const runaway = (x, z, R = 10) => {
    const h0 = H(x, z);
    let d = 0;
    for (let r = 2; r <= R; r += 2) {
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        d = Math.max(d, h0 - H(x + Math.cos(t) * r, z + Math.sin(t) * r));
      }
    }
    return d;
  };

  // Slope a kind can be set down on and still be there a minute later. Derived
  // by simulation, not taste: these are the values at which a 15 s settle in
  // dead calm leaves the object within a couple of metres of where it started.
  const SLOPE_BUDGET = { ball: 0.05, log: 0.09, crate: 0.13, plank: 0.13, leaf: 0.17, stone: 0.17 };
  // Footprint radius the budget is measured over — roughly the object's own size.
  const FOOTPRINT = { ball: 0.9, log: 1.6, crate: 1.1, plank: 1.7, leaf: 0.6, stone: 0.7 };

  test('every placement is on ground its own kind can actually sit on', () => {
    for (const p of SANDBOX) {
      const s = footSlope(p.x, p.z, FOOTPRINT[p.kind]);
      assert.ok(s <= SLOPE_BUDGET[p.kind],
        `${p.id} (${p.kind}) is on a ${s.toFixed(3)} slope at (${p.x}, ${p.z}); ` +
        `budget for a ${p.kind} is ${SLOPE_BUDGET[p.kind]}`);
    }
  });

  test('nothing that ROLLS is parked at the top of a long fall', () => {
    // A ball needs more than a flat square metre — it needs nowhere to go. This
    // is the check that a low local slope is not hiding a hill just off the
    // edge of the footprint, which is exactly how three balls reached the sea.
    // 1.5 m is where simulation puts the line, not where it looks tidy: at or
    // under it a 15 s settle in dead calm leaves the object put, and the
    // placements this rejected when it was written were sitting above 2.5 m
    // (one ball had 3.55 m of fall within 10 m and used the whole of it).
    for (const p of SANDBOX) {
      if (p.kind !== 'ball' && p.kind !== 'log') continue;
      const d = runaway(p.x, p.z, 10);
      assert.ok(d <= 1.5, `${p.id} (${p.kind}) has ${d.toFixed(2)} m of downhill within 10 m`);
    }
  });

  test('nothing is born in the water except the one tutorial leaf', () => {
    // A body that starts afloat is a body the player never saw float. The leaf
    // is the deliberate exception: it is the free demonstration.
    const ponds = resolvePonds(hf);
    for (const p of SANDBOX) {
      const wet = ponds.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= q.radius * 1.25 && q.level > H(p.x, p.z));
      if (p.id === 'phx-g-leaf-5') { assert.ok(wet, 'the tutorial leaf must start ON the pool'); continue; }
      assert.equal(wet, false, `${p.id} spawns in water`);
    }
  });

  test('no placement pre-solves a puzzle it could be counted for', () => {
    // Both kerbstones used to spawn ON the market pressure plate, so the Heavy
    // Door began at 2 of 6 and the child was solving someone else's puzzle.
    for (const p of SANDBOX) {
      for (const puz of PUZZLES) {
        for (const z of puz.zones) {
          if (z.kind && z.kind !== p.kind) continue;   // this zone would ignore it
          const d = Math.hypot(p.x - z.x, p.z - z.z);
          assert.ok(d > z.r, `${p.id} starts inside ${puz.id}/${z.id} (${d.toFixed(2)} m < r ${z.r})`);
        }
      }
    }
  });

  test('no placement is born inside a levelled monument pad', () => {
    for (const p of SANDBOX) {
      for (const pad of PADS) {
        const d = Math.hypot(p.x - pad.x, p.z - pad.z);
        assert.ok(d >= pad.r, `${p.id} is inside ${pad.id} (${d.toFixed(2)} m < r ${pad.r})`);
      }
    }
  });

  test('every puzzle has its answer in stock nearby, plus room to be wrong', () => {
    // Exact-N only teaches subtraction if there is a surplus to subtract FROM.
    for (const p of PUZZLES) {
      const z = p.zones[0];
      const stock = SANDBOX.filter((s) => (z.kind ? s.kind === z.kind : PROP_KINDS[s.kind].density > 0.4)
        && Math.hypot(s.x - z.x, s.z - z.z) < 60).length;
      assert.ok(stock >= p.need, `${p.id} needs ${p.need}, only ${stock} in reach`);
      assert.ok(stock > p.need, `${p.id} has exactly ${stock} candidates for a need of ${p.need} — ` +
        'with no spare, "put them all in" is always right and nothing is learned');
    }
  });
});

describe('every puzzle is solvable with the verbs the hero HAS', () => {
  // controls3d.js gives move, run, jump, action and dive. There is no carry.
  // A puzzle that needs a crate placed on top of another crate cannot be
  // finished, however good the arithmetic is — and one was shipped in this
  // file, on a slope, for a whole round. See the PUZZLES header.
  const CRATE = 0.9;                       // a crate is 0.9 m on a side

  test('no zone counts higher than a pushed object can reach', () => {
    for (const p of PUZZLES) {
      for (const z of p.zones) {
        assert.ok(z.y1 <= CRATE * 3,
          `${p.id}/${z.id} counts up to ${z.y1} m. Nothing above ${(CRATE * 2).toFixed(1)} m ` +
          'can get there by pushing, so this zone is asking for a carry verb.');
      }
    }
  });

  test('the zone floor is below the ground, so a resting body always counts', () => {
    // The physics terrain is a 5 m grid and the render heightfield is not, so a
    // body at rest can sit up to ~1 m below the height an author sampled. A y0
    // of -0.6 was tight enough that crates resting on the ground scored zero.
    for (const p of PUZZLES) {
      for (const z of p.zones) {
        assert.ok(z.y0 <= -0.85,
          `${p.id}/${z.id} has y0 ${z.y0}; the coarse physics grid can rest a body ` +
          'up to 1 m below the sampled ground and it would not be counted');
      }
    }
  });

  test('every puzzle renders a plate a child can aim at', () => {
    for (const p of PUZZLES) {
      if (p.zones[0].check === 'float') continue;   // the pond IS the target
      assert.ok(Array.isArray(p.plates) && p.plates.length === p.zones.length,
        `${p.id} has ${p.plates ? p.plates.length : 0} plates for ${p.zones.length} zones`);
      for (let i = 0; i < p.zones.length; i++) {
        // The dais a child sees and the cylinder the puzzle counts must be the
        // same circle, or the puzzle is lying about where to put things.
        assert.equal(p.plates[i].x, p.zones[i].x, `${p.id} plate ${i} x`);
        assert.equal(p.plates[i].z, p.zones[i].z, `${p.id} plate ${i} z`);
        assert.equal(p.plates[i].r, p.zones[i].r, `${p.id} plate ${i} r`);
      }
    }
  });
});

describe('the leash', () => {
  const home = { x: 100, z: 200 };

  test('a body floating in the sea is drowned, whatever its distance', () => {
    assert.equal(recallReason('crate', home, 100, PHYS.waterY + 0.5, 200), 'drowned');
    assert.equal(recallReason('crate', home, 100, PHYS.waterY + 1.59, 200), 'drowned');
    assert.equal(recallReason('crate', home, 100, PHYS.waterY + 1.61, 200), '');
  });

  test('a body past its kind radius has strayed', () => {
    const r = leashRadius('leaf');
    assert.equal(recallReason('leaf', home, 100 + r - 0.1, 30, 200), '');
    assert.equal(recallReason('leaf', home, 100 + r + 0.1, 30, 200), 'strayed');
  });

  test('a body inside its radius and above water is left alone', () => {
    // The leash must never take a crate a child is still pushing.
    assert.equal(recallReason('crate', home, 120, 30, 220), '');
  });

  test('the radii are generous enough to push something a long way', () => {
    // A leash a child can hit by playing normally reads as the game undoing
    // their work. Every radius is well past a shove.
    for (const kind of PROP_ORDER) {
      assert.ok(leashRadius(kind) >= 26, `${kind} is on a ${leashRadius(kind)} m leash`);
    }
  });

  test('an unknown kind still gets a leash rather than none', () => {
    assert.equal(leashRadius('barrel'), LEASH.defaultRadius);
  });
});

describe('gust wake-up is for leaves and nothing else', () => {
  test('only the leaf clears PHYS.windWakeRatio', () => {
    // Sleep is what makes a hundred bodies affordable. The gate used to be
    // "has a sail", which every kind but the kerbstone does, so the whole
    // toybox was woken on every gust and 2 of 49 bodies slept. See
    // PHYS.windWakeRatio for the measured separation this threshold sits in.
    for (const kind of PROP_ORDER) {
      const ratio = PROP_KINDS[kind].sail / kindMass(kind);
      const wakes = ratio >= PHYS.windWakeRatio;
      assert.equal(wakes, kind === 'leaf',
        `${kind} sail/mass ${ratio.toExponential(2)} vs ratio ${PHYS.windWakeRatio}`);
    }
  });

  test('a leaf is the only thing the wind can actually move', () => {
    // Against gravity's 22 m/s^2, anything under ~1 is scenery.
    assert.ok(windResponse('leaf') > 3, `leaf ${windResponse('leaf')}`);
    for (const kind of ['crate', 'log', 'plank', 'ball', 'stone']) {
      assert.ok(windResponse(kind) < 1, `${kind} ${windResponse(kind)}`);
    }
  });
});

describe('a kindless zone still refuses litter', () => {
  const plate = PUZZLES.find((p) => p.id === 'phz-market-plate');
  const zone = plate.zones[0];
  const at = (kind) => bodyInZone(zone, { kind, x: zone.x, y: 0.4, z: zone.z, wet: 0 });

  test('the Heavy Door takes anything solid', () => {
    for (const kind of ['crate', 'ball', 'log', 'plank', 'stone']) {
      assert.equal(at(kind), true, `${kind} should press the plate`);
    }
  });

  test('but a leaf blown onto it does NOT count', () => {
    // Found by simulation: 60 s of storm put a leaf on the plate, so a correct
    // six-crate solution counted seven and the door silently refused to open.
    assert.equal(at('leaf'), false);
  });

  test('every kindless zone has a density floor', () => {
    for (const p of PUZZLES) {
      for (const z of p.zones) {
        if (z.kind) continue;
        assert.ok(z.minDensity > PROP_KINDS.leaf.density,
          `${p.id}/${z.id} counts anything, including litter`);
      }
    }
  });
});
