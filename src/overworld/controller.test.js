import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionWorld } from './collision.js';
import { createController, DEFAULT_TUNING, PLAYER_RADIUS } from './controller.js';

// Analytic stub heightfields — flat plane, ramps of known slope, a wall
// step and a below-water basin. No import of the real terrain: these tests
// pin controller physics against exact geometry.
function stubField(height = () => 0, normal = () => [0, 1, 0]) {
  return {
    sampleHeight: height,
    sampleNormal: normal,
    biomeAt: () => 'meadow',
    shoreDistance: () => 10,
    seed: 1,
  };
}

// Dry land sits at y = DRY: ground at exactly WATER_Y reads as water per
// the shared contract (height < WATER_Y + 0.05), so land stubs stay above.
const DRY = 1;

const flat = () => createCollisionWorld(stubField(() => DRY));

// Ramp rising along +x at `deg` for x > 0, flat behind it.
function rampWorld(deg) {
  const rad = (deg * Math.PI) / 180;
  return createCollisionWorld(stubField(
    (x) => DRY + (x > 0 ? x * Math.tan(rad) : 0),
    (x) => (x > 0 ? [-Math.sin(rad), Math.cos(rad), 0] : [0, 1, 0]),
  ));
}

// Vertical step of `h` at x = 3.
const wallWorld = (h) => createCollisionWorld(stubField((x) => (x < 3 ? DRY : DRY + h)));

// Gentle shoreline: dry land for x < 4.75, basin down to -1 as x grows.
const basinWorld = () =>
  createCollisionWorld(stubField((x) => Math.max(-1, Math.min(1, (5 - x) * 0.2))));

function deepFreeze(o) {
  Object.freeze(o);
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return o;
}

const DT = 1 / 60;

describe('controller basics', () => {
  test('spawnState snaps feet to ground and rests on flat ground', () => {
    const c = createController(flat());
    let s = c.spawnState({ x: 1, z: 2, yaw: 0.5 });
    assert.equal(s.pos.y, DRY);
    assert.equal(s.grounded, true);
    assert.equal(s.wading, false);
    for (let i = 0; i < 10; i++) s = c.step(s, { x: 0, y: 0 }, DT);
    assert.deepEqual(s.pos, { x: 1, y: DRY, z: 2 });
    assert.equal(s.grounded, true);
    assert.equal(s.vel.y, 0);
    assert.equal(s.yaw, 0.5); // no movement, no turning
  });

  test('walking N steps at fixed dt covers speed*N*dt within 1e-6', () => {
    const c = createController(flat());
    let s = c.spawnState({ x: 0, z: 0, yaw: 0 });
    const N = 60;
    for (let i = 0; i < N; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(Math.abs(s.pos.x - DEFAULT_TUNING.speed * N * DT) < 1e-6);
    assert.equal(s.pos.z, 0);
  });

  test('run flag uses runSpeed', () => {
    const c = createController(flat());
    let s = c.spawnState({ x: 0, z: 0 });
    const N = 30;
    for (let i = 0; i < N; i++) s = c.step(s, { x: 0, y: 1, run: true }, DT);
    assert.ok(Math.abs(s.pos.z - DEFAULT_TUNING.runSpeed * N * DT) < 1e-6);
  });

  test('yaw turns toward the move direction along the shortest arc', () => {
    const c = createController(flat());
    let s = c.spawnState({ x: 0, z: 0, yaw: 0 });
    s = c.step(s, { x: 1, y: 0 }, DT);
    // rate-limited: one frame turns at most turnRate*dt toward +x (PI/2)
    assert.ok(Math.abs(s.yaw - DEFAULT_TUNING.turnRate * DT) < 1e-9);
    for (let i = 0; i < 60; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(Math.abs(s.yaw - Math.PI / 2) < 1e-9);
    // shortest arc: from +x facing, a -x request turns without winding up
    for (let i = 0; i < 120; i++) s = c.step(s, { x: -1, y: 0 }, DT);
    assert.ok(Math.abs(Math.abs(s.yaw) - Math.PI / 2) < 1e-9);
  });
});

describe('jumping and gravity', () => {
  test('jump apex ~ jumpV^2/(2*gravity) and lands back grounded', () => {
    const dt = 1 / 120;
    const c = createController(flat());
    let s = c.spawnState({ x: 0, z: 0 });
    s = c.step(s, { x: 0, y: 0, jump: true }, dt);
    assert.equal(s.grounded, false);
    let apex = s.pos.y;
    let frames = 0;
    while (!s.grounded && frames++ < 1000) {
      s = c.step(s, { x: 0, y: 0 }, dt);
      apex = Math.max(apex, s.pos.y);
    }
    const ideal = DEFAULT_TUNING.jumpV ** 2 / (2 * DEFAULT_TUNING.gravity);
    assert.ok(Math.abs((apex - DRY) - ideal) / ideal < 0.05, `apex ${apex - DRY} vs ${ideal}`);
    assert.equal(s.grounded, true);
    assert.equal(s.pos.y, DRY);
    assert.equal(s.vel.y, 0);
  });

  test('jump only fires while grounded', () => {
    const c = createController(flat());
    let s = c.spawnState({ x: 0, z: 0 });
    s = c.step(s, { x: 0, y: 0, jump: true }, DT);
    const rising = s.vel.y;
    s = c.step(s, { x: 0, y: 0, jump: true }, DT); // airborne: ignored
    assert.ok(s.vel.y < rising);
  });

  test('walking off a tall ledge goes airborne then lands', () => {
    const c = createController(wallWorld(-3)); // drop of 3 at x = 3
    let s = c.spawnState({ x: 2.5, z: 0 });
    let fell = false;
    for (let i = 0; i < 300; i++) {
      s = c.step(s, { x: 1, y: 0 }, DT);
      if (!s.grounded) fell = true;
    }
    assert.equal(fell, true);
    assert.equal(s.grounded, true);
    assert.equal(s.pos.y, DRY - 3);
  });
});

describe('slopes and steps', () => {
  test('a 30 degree ramp is climbable', () => {
    const c = createController(rampWorld(30));
    let s = c.spawnState({ x: 0, z: 0 });
    for (let i = 0; i < 60; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(s.pos.x > 5.9, `only reached x=${s.pos.x}`);
    assert.ok(Math.abs(s.pos.y - (DRY + s.pos.x * Math.tan(Math.PI / 6))) < 1e-6);
    assert.equal(s.grounded, true);
  });

  test('a 60 degree ramp is not climbable — uphill component slides off', () => {
    const c = createController(rampWorld(60));
    let s = c.spawnState({ x: 1, z: 0 });
    const y0 = s.pos.y;
    for (let i = 0; i < 60; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(Math.abs(s.pos.x - 1) < 1e-9, `climbed to x=${s.pos.x}`);
    assert.ok(Math.abs(s.pos.y - y0) < 1e-9);
    // diagonal input slides along the face: z advances, x does not
    for (let i = 0; i < 60; i++) s = c.step(s, { x: 1, y: 1 }, DT);
    assert.ok(Math.abs(s.pos.x - 1) < 1e-9);
    assert.ok(s.pos.z > 2, `slid only to z=${s.pos.z}`);
  });

  test('a step taller than stepUp blocks like a wall', () => {
    const c = createController(wallWorld(2));
    let s = c.spawnState({ x: 0, z: 0 });
    for (let i = 0; i < 120; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(s.pos.x < 3, `walked through the wall to x=${s.pos.x}`);
    assert.equal(s.pos.y, DRY);
  });

  test('a step within stepUp is walked up', () => {
    const c = createController(wallWorld(0.4));
    let s = c.spawnState({ x: 0, z: 0 });
    for (let i = 0; i < 120; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(s.pos.x > 3);
    assert.equal(s.pos.y, DRY + 0.4);
    assert.equal(s.grounded, true);
  });
});

describe('water', () => {
  test('wading sets the flag and multiplies speed by 0.45', () => {
    const c = createController(basinWorld());
    let s = c.spawnState({ x: 10, z: 0 });
    assert.equal(s.wading, true);
    const before = s.pos.x;
    s = c.step(s, { x: 1, y: 0 }, DT);
    assert.ok(Math.abs((s.pos.x - before) - 0.45 * DEFAULT_TUNING.speed * DT) < 1e-12);
    assert.equal(s.wading, true);
  });

  test('leaving the water clears the wading flag', () => {
    const c = createController(basinWorld());
    let s = c.spawnState({ x: 8, z: 0 });
    assert.equal(s.wading, true);
    for (let i = 0; i < 200; i++) s = c.step(s, { x: -1, y: 0 }, DT);
    assert.ok(s.pos.x < 4.75, `still at x=${s.pos.x}`);
    assert.equal(s.wading, false);
  });
});

describe('colliders through the controller', () => {
  test('cannot end a frame inside a circle collider', () => {
    const world = flat();
    world.addCollider({ id: 'tree', kind: 'circle', x: 4, z: 0, r: 1 });
    const c = createController(world);
    let s = c.spawnState({ x: 0, z: 0 });
    for (let i = 0; i < 120; i++) s = c.step(s, { x: 1, y: 0 }, DT);
    const d = Math.hypot(s.pos.x - 4, s.pos.z);
    assert.ok(d >= 1 + PLAYER_RADIUS - 1e-9, `ended ${d} from prop center`);
  });
});

describe('purity and determinism', () => {
  test('step never mutates its input state (deep-frozen)', () => {
    const c = createController(flat());
    const s = deepFreeze(c.spawnState({ x: 1, z: 2, yaw: 0.3 }));
    const input = deepFreeze({ x: 1, y: 0.5, jump: true, run: true });
    const snapshot = JSON.stringify(s);
    const next = c.step(s, input, DT);
    assert.equal(JSON.stringify(s), snapshot);
    assert.notEqual(next, s);
    assert.notEqual(next.pos, s.pos);
    assert.notEqual(next.vel, s.vel);
  });

  test('identical input sequences produce bitwise-identical states', () => {
    // Mixed sequence over varied terrain: walk, turn, run, jump, idle.
    const inputs = [];
    for (let i = 0; i < 240; i++) {
      inputs.push({
        x: Math.sin(i * 0.1),
        y: Math.cos(i * 0.07),
        jump: i % 53 === 0,
        run: i % 3 === 0,
      });
    }
    const run = () => {
      const world = rampWorld(30);
      world.addCollider({ id: 'p', kind: 'circle', x: 2, z: 1, r: 0.8 });
      const c = createController(world);
      let s = c.spawnState({ x: -2, z: 0, yaw: 1 });
      for (const inp of inputs) s = c.step(s, inp, DT);
      return JSON.stringify(s);
    };
    assert.equal(run(), run());
  });
});
