import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REALMS, getRealm, REALM_1, REALM_2, REALM_3, REALM_4, REALM_5, REALM_6, REALM_7, REALM_8, REALM_9 } from './realms.js';

const allRealms = [REALM_1, REALM_2, REALM_3, REALM_4, REALM_5, REALM_6, REALM_7, REALM_8, REALM_9];

test('all 9 realms have rooms', () => {
  for (let i = 0; i < 9; i++) {
    const realm = allRealms[i];
    assert.ok(realm, `Realm ${i + 1} is undefined`);
    assert.ok(realm.rooms.length > 0, `Realm ${i + 1} has no rooms`);
  }
});

test('every realm has an entrance room with startX/startY', () => {
  for (const realm of allRealms) {
    const entrance = realm.rooms.find(r => r.id === 'entrance');
    assert.ok(entrance, `${realm.name} has no entrance room`);
    assert.ok(typeof entrance.startX === 'number', `${realm.name} entrance missing startX`);
    assert.ok(typeof entrance.startY === 'number', `${realm.name} entrance missing startY`);
  }
});

test('every exit targetRoom exists within the same realm', () => {
  for (const realm of allRealms) {
    const roomIds = new Set(realm.rooms.map(r => r.id));
    for (const room of realm.rooms) {
      if (!room.exits) continue;
      for (const exit of room.exits) {
        assert.ok(roomIds.has(exit.targetRoom),
          `${realm.name} room "${room.id}" exit points to non-existent room "${exit.targetRoom}"`);
      }
    }
  }
});

test('every room tile grid is rectangular (all rows same width)', () => {
  for (const realm of allRealms) {
    for (const room of realm.rooms) {
      if (!room.tiles || room.tiles.length === 0) continue;
      const width = room.tiles[0].length;
      for (let row = 0; row < room.tiles.length; row++) {
        assert.equal(room.tiles[row].length, width,
          `${realm.name} room "${room.id}" row ${row} has width ${room.tiles[row].length}, expected ${width}`);
      }
    }
  }
});

test('every tile value is valid (0-4)', () => {
  for (const realm of allRealms) {
    for (const room of realm.rooms) {
      if (!room.tiles) continue;
      for (let y = 0; y < room.tiles.length; y++) {
        for (let x = 0; x < room.tiles[y].length; x++) {
          const v = room.tiles[y][x];
          assert.ok(v >= 0 && v <= 4,
            `${realm.name} room "${room.id}" tile (${x},${y}) has invalid value ${v}`);
        }
      }
    }
  }
});

test('entrance startX/startY are within tile bounds and on walkable tiles', () => {
  for (const realm of allRealms) {
    const entrance = realm.rooms.find(r => r.id === 'entrance');
    if (!entrance) continue;
    const h = entrance.tiles.length;
    const w = entrance.tiles[0].length;
    assert.ok(entrance.startX >= 0 && entrance.startX < w,
      `${realm.name} entrance startX ${entrance.startX} out of bounds (width ${w})`);
    assert.ok(entrance.startY >= 0 && entrance.startY < h,
      `${realm.name} entrance startY ${entrance.startY} out of bounds (height ${h})`);
    const tile = entrance.tiles[entrance.startY][entrance.startX];
    assert.ok(tile !== 0, `${realm.name} entrance start position is on a wall tile`);
  }
});

test('every boss room has boss + golden + exit objects', () => {
  for (const realm of allRealms) {
    const bossRoom = realm.rooms.find(r => r.type === 'boss');
    if (!bossRoom) continue;
    const types = (bossRoom.objects || []).map(o => o.type);
    assert.ok(types.includes('boss'), `${realm.name} boss room missing boss object`);
    assert.ok(types.includes('golden'), `${realm.name} boss room missing golden chest`);
    assert.ok(types.includes('exit'), `${realm.name} boss room missing exit`);
  }
});

test('getRealm returns valid realm for floors 1-9', () => {
  for (let i = 1; i <= 9; i++) {
    const realm = getRealm(i);
    assert.ok(realm, `getRealm(${i}) returned falsy`);
    assert.ok(realm.rooms.length > 0, `getRealm(${i}) has no rooms`);
  }
});

test('object coordinates are within tile bounds', () => {
  for (const realm of allRealms) {
    for (const room of realm.rooms) {
      if (!room.tiles || !room.objects) continue;
      const h = room.tiles.length;
      const w = room.tiles[0].length;
      for (const obj of room.objects) {
        assert.ok(obj.x >= 0 && obj.x < w,
          `${realm.name} room "${room.id}" object ${obj.type} x=${obj.x} out of bounds (width ${w})`);
        assert.ok(obj.y >= 0 && obj.y < h,
          `${realm.name} room "${room.id}" object ${obj.type} y=${obj.y} out of bounds (height ${h})`);
      }
    }
  }
});
