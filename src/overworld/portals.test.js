import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { routePortal, portalUnlocked } from './portals.js';
import { makeDefaultSave } from '../systems/save.js';
import { SCENES } from '../config.js';
import { DIALOGUE } from '../data/dialogue.js';

function saveWithParty() {
  const save = makeDefaultSave();
  save.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  return save;
}

describe('portalUnlocked', () => {
  test('floor 1 unlocked on default save', () => {
    assert.equal(portalUnlocked(makeDefaultSave(), 1), true);
  });

  test('later floors locked on default save', () => {
    const save = makeDefaultSave();
    for (let id = 2; id <= 9; id++) assert.equal(portalUnlocked(save, id), false);
  });

  test('missing floors entry counts as locked (WorldMapScene !unlocked gate)', () => {
    assert.equal(portalUnlocked({ floors: [] }, 1), false);
    assert.equal(portalUnlocked({}, 1), false);
  });
});

describe('routePortal', () => {
  test('blocks with no-party when party is empty (default save)', () => {
    const route = routePortal({ save: makeDefaultSave(), floorId: 1 });
    assert.deepEqual(route, { block: 'no-party' });
  });

  test('blocks with no-party when party has fewer than 3 (enterFloor semantics)', () => {
    const save = makeDefaultSave();
    save.party = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(routePortal({ save, floorId: 1 }), { block: 'no-party' });
  });

  test('blocks locked floors', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 2 });
    assert.deepEqual(route, { block: 'locked' });
  });

  test('routes to entry cutscene on first visit — payload matches enterFloor', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasMazeState: false });
    assert.equal(route.sceneKey, SCENES.CUTSCENE);
    // enterFloor passes { lines, floorId, nextScene, nextData } — no `key`.
    assert.equal(route.data.lines, DIALOGUE.floor1_entry);
    assert.equal(route.data.floorId, 1);
    assert.equal(route.data.nextScene, SCENES.MAZE);
    assert.deepEqual(route.data.nextData, { floor: 1, fromWorldMap: true });
    assert.equal('key' in route.data, false);
  });

  test('routes straight to maze when a saved maze is in progress', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasMazeState: true });
    assert.deepEqual(route, {
      sceneKey: SCENES.MAZE,
      data: { floor: 1, fromWorldMap: true },
    });
  });

  test('routes straight to maze when entry dialogue is suppressed', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasEntryDialogue: false });
    assert.equal(route.sceneKey, SCENES.MAZE);
    assert.deepEqual(route.data, { floor: 1, fromWorldMap: true });
  });

  test('mode defaults to 2d, so the no-WebGL fallback route is unchanged', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasMazeState: true });
    assert.equal(route.sceneKey, SCENES.MAZE);
    assert.equal(route.target, undefined);
  });

  test('hasEntryDialogue defaults from DIALOGUE, exactly like enterFloor', () => {
    const save = saveWithParty();
    for (let i = 0; i < 9; i++) save.floors[i].unlocked = true;
    for (let id = 1; id <= 9; id++) {
      const lines = DIALOGUE[`floor${id}_entry`];
      const route = routePortal({ save, floorId: id });
      if (lines && lines.length > 0) {
        assert.equal(route.sceneKey, SCENES.CUTSCENE, `floor ${id}`);
      } else {
        assert.equal(route.sceneKey, SCENES.MAZE, `floor ${id}`);
      }
    }
  });
});

/**
 * The 3D door. Walking into a portal with WebGL no longer starts a Phaser
 * scene at all — the floor is BUILT inside the live 3D world — so mode '3d'
 * answers with the floor to build and the lines to play in place. The gates
 * must not move: same party rule, same lock rule, same first-visit rule.
 */
describe('routePortal — mode: 3d', () => {
  test('never routes to MazeScene', () => {
    const save = saveWithParty();
    for (let i = 0; i < 9; i++) save.floors[i].unlocked = true;
    for (let id = 1; id <= 9; id++) {
      const route = routePortal({ save, floorId: id, mode: '3d' });
      assert.equal(route.sceneKey, undefined, `floor ${id} must not carry a scene key`);
      assert.equal(route.target, 'floor3d', `floor ${id}`);
      assert.equal(route.floorId, id);
    }
  });

  test('the party gate is identical to the 2D route', () => {
    assert.deepEqual(
      routePortal({ save: makeDefaultSave(), floorId: 1, mode: '3d' }),
      { block: 'no-party' },
    );
    const two = makeDefaultSave();
    two.party = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(routePortal({ save: two, floorId: 1, mode: '3d' }), { block: 'no-party' });
  });

  test('the lock gate is identical to the 2D route', () => {
    assert.deepEqual(routePortal({ save: saveWithParty(), floorId: 2, mode: '3d' }), { block: 'locked' });
  });

  test('first visit carries the entry lines to play over the 3D world', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasMazeState: false, mode: '3d' });
    assert.equal(route.target, 'floor3d');
    assert.equal(route.lines, DIALOGUE.floor1_entry);
  });

  test('a floor already in progress skips the intro', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasMazeState: true, mode: '3d' });
    assert.deepEqual(route, { target: 'floor3d', floorId: 1, lines: null });
  });

  test('suppressed entry dialogue carries no lines', () => {
    const route = routePortal({ save: saveWithParty(), floorId: 1, hasEntryDialogue: false, mode: '3d' });
    assert.equal(route.lines, null);
  });

  test('both modes agree on every block, on every floor, for every party size', () => {
    for (const size of [0, 2, 3]) {
      const save = makeDefaultSave();
      save.party = Array.from({ length: size }, (_, i) => ({ id: `h${i}` }));
      for (let id = 1; id <= 9; id++) {
        const a = routePortal({ save, floorId: id });
        const b = routePortal({ save, floorId: id, mode: '3d' });
        assert.equal(a.block, b.block, `floor ${id}, party ${size}`);
      }
    }
  });
});
