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
