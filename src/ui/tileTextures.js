/**
 * Tile texture factory — uses the ported level engine to pre-render
 * tiles as Phaser textures.
 */

import { renderTileCanvas } from './levelEngine.js';

var REGISTERED = {};

export function ensureTileTextures(scene, floorId, tileSize) {
  // No-op — tiles are registered on-demand in getTileTextureKey
}

export function getTileTextureKey(scene, floorId, tileType, x, y, tileSize) {
  var key = 'lvt-' + floorId + '-' + tileType + '-' + x + '-' + y;
  if (!REGISTERED[key]) {
    var cv = renderTileCanvas(tileType, x, y, tileSize);
    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, cv);
    }
    REGISTERED[key] = true;
  }
  return key;
}
