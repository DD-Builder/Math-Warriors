import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source-level invariant: nothing hard-routes to the 2D hub.
 *
 * This exists because of a bug that reached a preview build. The 3D overworld
 * booted perfectly whenever a test started it BY NAME — and every such test
 * passed — while `goHub()` was called from nowhere and all ~14 real routes
 * still pointed at SCENES.WORLD_MAP. The 3D world was unreachable by playing.
 *
 * No behavioural test caught it because they all started the scene directly,
 * which is exactly the step a player cannot take. The property that actually
 * matters is static, so it is asserted statically.
 */
const SCENES_DIR = new URL('../scenes/', import.meta.url).pathname;

// The two hubs themselves legitimately name WORLD_MAP: WorldMapScene declares
// its own key and self-references, and OverworldScene offers a deliberate
// "MAP VIEW" escape hatch plus its no-WebGL fallback.
const ALLOWED = new Set(['WorldMapScene.js', 'OverworldScene.js']);

describe('hub routing', () => {
  test('no scene hard-routes to the 2D WorldMapScene', () => {
    const offenders = [];
    for (const file of readdirSync(SCENES_DIR).filter((f) => f.endsWith('.js'))) {
      if (ALLOWED.has(file)) continue;
      const src = readFileSync(join(SCENES_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (!line.includes('SCENES.WORLD_MAP')) return;
        // `isHubScene(x)` and comments are fine; a bare route is not.
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    assert.deepEqual(offenders, [],
      `these route straight to the 2D hub instead of goHub()/hubSceneKey():\n${offenders.join('\n')}`);
  });

  test('the scenes that leave to a hub actually import the router', () => {
    const missing = [];
    for (const file of ['MazeScene.js', 'BattleScene.js', 'ShopScene.js', 'MasteryScene.js',
                        'GalleryScene.js', 'TowerScene.js', 'PartySelectScene.js',
                        'SaveSlotScene.js', 'CutsceneScene.js', 'TitleScene.js']) {
      const src = readFileSync(join(SCENES_DIR, file), 'utf8');
      if (!src.includes("from '../ui/hubRouter.js'")) missing.push(file);
    }
    assert.deepEqual(missing, [], `these never import the hub router: ${missing.join(', ')}`);
  });
});
