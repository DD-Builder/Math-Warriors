/**
 * BOSS SHOTS — one clean portrait of each of the 9 bosses, for the critics.
 *
 * This is a capture spec, not a behaviour spec: boss-phases.spec.js
 * already drives the phase machinery. What this one guarantees is that
 * a human (or an art critic) can look at all nine bosses as the player
 * actually meets them, without clicking through nine floors.
 *
 * HOW IT BOOTS. Via the existing dev entry in BootScene — `?dev=bossN`
 * for floor N — which skips the menus and starts BattleScene with
 * { floor: N, grade: 3, isBoss: true }. That path picks the boss from
 * BattleScene's own FLOOR_BOSS table, so the ids asserted below are the
 * real shipping mapping and this spec fails loudly if it ever drifts.
 *
 * WHEN IT SHOOTS. Not on sprite creation — the staged entrance
 * (dim → reveal → push-in → banner) runs ~3s, during which the boss is
 * a flat inkTeal cutout behind a 34%-alpha scrim, the camera is zoomed,
 * and a name card covers the stage. A shot taken then is a picture of
 * the curtain, not the boss. The entrance's done() calls nextTurn(),
 * which puts the scene in 'question', so waiting for phase 'question'
 * means: colour has flooded in, the scrim is destroyed, the banner has
 * peeled off, the camera is back to zoom 1 and the idle tween is
 * running. That is the frame worth showing.
 *
 * Runs under the '2d' project (Canvas2D, fast) like every other
 * BattleScene spec — it needs no WebGL context.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// floor → boss id, mirroring FLOOR_BOSS in BattleScene.
const BOSSES = [
  [1, 'briarking'], [2, 'pressure'], [3, 'skywhale'],
  [4, 'pyroclast'], [5, 'absolutezero'], [6, 'theprism'],
  [7, 'counterfeiter'], [8, 'theparadox'], [9, 'theorem'],
];

const OUT_DIR = 'e2e/screenshots/bosses';

// A PNG of a real rendered diorama is hundreds of KB; anything at or
// under 20KB means we caught a blank/black frame or a scene that never
// booted. The critics can only critique pixels that exist.
const MIN_BYTES = 20 * 1024;

test.beforeEach(async ({ context }) => {
  // The sandbox can't reach Google Fonts etc; block them so page load
  // never hangs. The game degrades to system fonts.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
});

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test('capture a portrait of all 9 bosses', async ({ page }) => {
  test.slow();

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  const captured = [];

  for (const [floor, bossId] of BOSSES) {
    // Fresh load per boss: each fight gets its own entrance, arena and
    // score, exactly as the player meets it.
    await page.goto(`/?dev=boss${floor}`, { waitUntil: 'domcontentloaded' });

    // 1 — the boss sprite exists and carries a real texture.
    await page.waitForFunction(() => {
      const s = window.__MW?.game?.scene?.getScene('BattleScene');
      return !!(s && s.scene.isActive() && s.enemies?.[0] && s.enemySprites?.[0]?.body);
    }, null, { timeout: 30_000 });

    // 2 — the entrance has fully resolved (see header). The scene opens
    // in 'intro' and only leaves it when the entrance's done() reaches
    // nextTurn, which hands the fight to the hero ('command', then
    // 'question' once an action is picked). Waiting for "no longer
    // intro" is therefore the precise "curtain is down" signal, and
    // BattleScene's 5s watchdog guarantees it arrives even if a beat
    // wedges — so a stuck curtain fails loudly here instead of quietly
    // producing nine screenshots of a scrim.
    await page.waitForFunction(() => {
      const s = window.__MW?.game?.scene?.getScene('BattleScene');
      return !!s && s.phase !== 'intro';
    }, null, { timeout: 30_000 });

    // 3 — let the idle tween settle onto a representative frame.
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('BattleScene');
      return {
        id: s.enemies[0].id,
        name: s.enemies[0].name,
        isBoss: !!s.enemies[0].isBoss,
        zoom: s.cameras.main.zoom,
        texture: s.enemySprites[0]?.body?.texture?.key || null,
      };
    });

    // The dev entry must have produced THIS floor's boss, at rest.
    expect(info.id, `?dev=boss${floor} booted the wrong enemy`).toBe(bossId);
    expect(info.isBoss, `${bossId} did not spawn as a boss`).toBe(true);
    // Camera back to 1 == the push-in released, i.e. no crop in the shot.
    expect(info.zoom, `${bossId} was shot mid push-in`).toBeCloseTo(1, 2);

    const file = path.join(OUT_DIR, `boss-${floor}-${bossId}.png`);
    await page.screenshot({ path: file });

    const bytes = fs.statSync(file).size;
    expect(bytes, `${file} is ${bytes}B — blank or unrendered frame`).toBeGreaterThan(MIN_BYTES);
    captured.push({ file, bytes, name: info.name });
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nBOSS SHOTS (${captured.length}):\n`
    + captured.map((c) => `  ${c.file}  ${(c.bytes / 1024).toFixed(0)}KB  ${c.name}`).join('\n'),
  );

  expect(captured, 'expected exactly 9 boss shots').toHaveLength(9);
  expect(errors, `boss capture threw:\n${errors.join('\n')}`).toEqual([]);
});
