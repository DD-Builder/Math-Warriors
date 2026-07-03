/**
 * Level design contract validator.
 *
 * Every floor must be a REAL level: rectangular, sealed, explorable,
 * with the boss area unreachable until the transform opens it. These
 * tests are the gate that keeps handcrafted (and agent-drafted) maps
 * honest — if a map ships, it plays.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { LEVEL_DEFS, getLevel } from './levels.js';

const WALKABLE = new Set([1, 2, 4]); // F, P, S

function bfs(tiles, sx, sy, passObjects = new Set()) {
  const h = tiles.length, w = tiles[0].length;
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (!WALKABLE.has(tiles[ny][nx]) && !passObjects.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

function applyTransform(tiles, transform) {
  const CODE = { W: 0, F: 1, P: 2, Q: 3, S: 4 };
  const copy = tiles.map(r => [...r]);
  for (const [x, y, t] of transform.tiles) copy[y][x] = CODE[t] ?? 2;
  return copy;
}

for (const idStr of Object.keys(LEVEL_DEFS)) {
  const id = Number(idStr);
  const lv = getLevel(id);

  test(`floor ${id}: grid is rectangular with sealed borders`, () => {
    const w = lv.tiles[0].length;
    for (const row of lv.tiles) assert.equal(row.length, w, 'ragged row');
    for (let x = 0; x < w; x++) {
      assert.equal(lv.tiles[0][x], 0, `open top border at x=${x}`);
      assert.equal(lv.tiles[lv.height - 1][x], 0, `open bottom border at x=${x}`);
    }
    for (let y = 0; y < lv.height; y++) {
      assert.equal(lv.tiles[y][0], 0, `open left border at y=${y}`);
      assert.equal(lv.tiles[y][w - 1], 0, `open right border at y=${y}`);
    }
  });

  test(`floor ${id}: start and all objects sit on walkable tiles`, () => {
    assert.ok(WALKABLE.has(lv.tiles[lv.startY][lv.startX]), 'start not walkable');
    for (const o of lv.objects) {
      assert.ok(o.x >= 0 && o.x < lv.width && o.y >= 0 && o.y < lv.height, `${o.type} out of bounds`);
      assert.ok(WALKABLE.has(lv.tiles[o.y][o.x]), `${o.type} at (${o.x},${o.y}) not on walkable tile`);
    }
  });

  test(`floor ${id}: required objects present`, () => {
    const types = lv.objects.map(o => o.type);
    assert.ok(types.includes('boss'), 'no boss');
    assert.ok(types.includes('golden'), 'no golden chest');
    assert.ok(types.includes('exit'), 'no exit');
    assert.ok(types.filter(t => t === 'encounter').length >= 3, 'fewer than 3 encounters');
    const challengeCount = lv.objects.filter(o =>
      ['fairy', 'valve', 'beacon', 'vent', 'crystal', 'geoshard', 'token', 'page', 'fragment'].includes(o.type)).length;
    assert.ok(challengeCount >= 3, `only ${challengeCount} challenge items`);
    assert.ok(Array.isArray(lv.objective) && lv.objective.length >= 2, 'objective steps missing');
    assert.ok(lv.transform && lv.transform.tiles.length > 0, 'no transform');
  });

  test(`floor ${id}: challenge items reachable BEFORE transform (doors count as passable)`, () => {
    const doors = new Set(lv.objects.filter(o => o.type === 'mathdoor').map(o => `${o.x},${o.y}`));
    const reach = bfs(lv.tiles, lv.startX, lv.startY, doors);
    for (const o of lv.objects) {
      if (['fairy', 'valve', 'beacon', 'vent', 'crystal', 'geoshard', 'token', 'page', 'fragment'].includes(o.type)) {
        assert.ok(reach.has(`${o.x},${o.y}`), `challenge item at (${o.x},${o.y}) unreachable pre-transform`);
      }
    }
  });

  test(`floor ${id}: boss sealed BEFORE transform, open AFTER`, () => {
    const doors = new Set(lv.objects.filter(o => o.type === 'mathdoor').map(o => `${o.x},${o.y}`));
    const boss = lv.objects.find(o => o.type === 'boss');
    const golden = lv.objects.find(o => o.type === 'golden');
    const exit = lv.objects.find(o => o.type === 'exit');

    const before = bfs(lv.tiles, lv.startX, lv.startY, doors);
    assert.ok(!before.has(`${boss.x},${boss.y}`), 'boss reachable before transform — no structural gate!');

    const after = bfs(applyTransform(lv.tiles, lv.transform), lv.startX, lv.startY, doors);
    assert.ok(after.has(`${boss.x},${boss.y}`), 'boss unreachable after transform');
    assert.ok(after.has(`${golden.x},${golden.y}`), 'golden chest unreachable after transform');
    assert.ok(after.has(`${exit.x},${exit.y}`), 'exit unreachable after transform');
  });

  test(`floor ${id}: transform tiles are in bounds and change hazard/wall to walkable`, () => {
    for (const [x, y] of lv.transform.tiles) {
      assert.ok(x > 0 && x < lv.width - 1 && y > 0 && y < lv.height - 1, 'transform tile on border');
      assert.ok(!WALKABLE.has(lv.tiles[y][x]), `transform tile (${x},${y}) was already walkable`);
    }
  });
}
