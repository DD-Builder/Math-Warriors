import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getLevel, TILE_CODE } from './levels.js';
import { EQUIPMENT_TIERS } from '../systems/equipment.js';

/**
 * Signature-secret contracts: every floor has ONE unique secret, its
 * geometry is real (in-bounds, interactables on walkable tiles, the
 * opened passage actually opens sealed tiles), and its rewards land
 * inside the space it opens.
 */

const KINDS = ['push', 'sequence', 'donation', 'zerodoor', 'lorepage'];
const SECRET_OBJ_TYPES = ['statue', 'plate', 'seqmark', 'donation', 'zerodoor', 'lorepage'];
const VALID_TIERS = EQUIPMENT_TIERS.map((t) => t.tier);
const WALKABLE = new Set([TILE_CODE.F, TILE_CODE.P]);

describe('signature secrets', () => {
  const kinds = [];
  for (let f = 1; f <= 9; f++) {
    const level = getLevel(f);
    const sec = level.secret;

    test(`floor ${f} has a well-formed secret`, () => {
      assert.ok(sec, `floor ${f} missing secret`);
      assert.ok(KINDS.includes(sec.kind), `unknown kind ${sec.kind}`);
      assert.ok(typeof sec.message === 'string' && sec.message.length > 0);
      kinds.push(sec.kind);

      const H = level.tiles.length, W = level.tiles[0].length;
      const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

      // interactable objects exist on walkable tiles
      const secretObjs = level.objects.filter((o) => SECRET_OBJ_TYPES.includes(o.type));
      assert.ok(secretObjs.length >= 1, 'no secret objects placed');
      for (const o of secretObjs) {
        assert.ok(inb(o.x, o.y), `${o.type} out of bounds`);
        assert.ok(WALKABLE.has(level.tiles[o.y][o.x]),
          `${o.type} at ${o.x},${o.y} not on walkable tile`);
      }

      if (sec.kind === 'push') {
        assert.ok(sec.plate && inb(sec.plate.x, sec.plate.y), 'push secret needs a plate');
        assert.ok(level.objects.some((o) => o.type === 'statue'), 'push secret needs a statue');
      }
      if (sec.kind === 'sequence') {
        const marks = level.objects.filter((o) => o.type === 'seqmark');
        assert.ok(marks.length >= 3, 'sequence needs at least 3 marks');
        if (sec.order !== 'any') {
          const idxs = marks.map((m) => m.seqIdx).sort((a, b) => a - b);
          assert.deepEqual(idxs, marks.map((_, i) => i), 'seqIdx must be 0..n-1');
        }
      }
      if (sec.kind === 'donation') {
        assert.ok(sec.amount > 0 && sec.amount <= 100, 'donation amount sane');
      }

      // opened tiles target SEALED tiles (walls/water/secret), never
      // already-walkable floor — a secret must actually open something
      for (const [x, y, t] of sec.open || []) {
        assert.ok(inb(x, y), 'open tile out of bounds');
        assert.ok(!WALKABLE.has(level.tiles[y][x]),
          `open tile ${x},${y} was already walkable`);
        assert.ok(t in TILE_CODE, `bad open code ${t}`);
      }

      // rewards land inside the opened space
      const openSet = new Set((sec.open || []).map(([x, y]) => `${x},${y}`));
      for (const r of sec.rewards || []) {
        assert.ok(['chest', 'gearkit'].includes(r.type), `bad reward ${r.type}`);
        assert.ok(openSet.has(`${r.x},${r.y}`),
          `reward at ${r.x},${r.y} not inside opened tiles`);
        if (r.type === 'gearkit') assert.ok(VALID_TIERS.includes(r.tier), `bad tier ${r.tier}`);
        if (r.type === 'chest') assert.ok(r.gold > 0);
      }
    });
  }

  test('at least four distinct secret mechanics across the nine floors', () => {
    assert.ok(new Set(kinds).size >= 4, `only ${new Set(kinds).size} kinds`);
  });
});
