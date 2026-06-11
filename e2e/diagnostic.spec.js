/**
 * Diagnostic spec — drives every scene programmatically and captures
 * the first runtime error each scene throws on create(). Used to audit
 * scene-level breakage after large refactors.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
});

test('every scene creates without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${(err.stack || '').split('\n').slice(0, 5).join('\n')}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Failed to load resource')) return;
    if (text.includes('net::ERR_FAILED')) return;
    if (text.includes('fonts.googleapis.com')) return;
    errors.push(`console: ${text}`);
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Seed a save so scenes that need one don't bail to title
  await page.evaluate(() => {
    const mw = window.__MW;
    if (!mw) return;
    mw.game.registry.set('grade', 3);
    mw.game.registry.set('saveSlot', 0);
  });

  const sceneKeys = await page.evaluate(() => window.__MW ? Object.values(window.__MW.scenes) : []);
  expect(sceneKeys.length).toBeGreaterThan(0);

  const perScene = {};
  for (const key of sceneKeys) {
    if (key === 'BootScene') continue;
    const before = errors.length;
    await page.evaluate((k) => {
      const mw = window.__MW;
      // stop all active scenes, then start the target fresh
      mw.game.scene.getScenes(true).forEach((s) => mw.game.scene.stop(s.scene.key));
      try {
        mw.game.scene.start(k, { floor: 1, grade: 3 });
      } catch (e) {
        console.error('start threw: ' + e.message);
      }
    }, key);
    await page.waitForTimeout(1500);
    const newErrors = errors.slice(before);
    if (newErrors.length) perScene[key] = newErrors;
  }

  console.log('=== PER-SCENE ERRORS ===');
  console.log(JSON.stringify(perScene, null, 2));
  expect(Object.keys(perScene), `Scenes with errors:\n${JSON.stringify(perScene, null, 2)}`).toEqual([]);
});

test('scene transitions survive shutdown (maze→worldmap and friends)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Failed to load resource') || text.includes('net::ERR_FAILED') || text.includes('fonts.googleapis.com')) return;
    errors.push(`console: ${text}`);
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const mw = window.__MW;
    mw.game.registry.set('grade', 3);
    mw.game.registry.set('saveSlot', 0);
  });

  // The transitions players actually hit
  const flows = [
    ['MazeScene', 'WorldMapScene'],
    ['WorldMapScene', 'MazeScene'],
    ['MazeScene', 'BattleScene'],
    ['BattleScene', 'MazeScene'],
    ['PartySelectScene', 'WorldMapScene'],
    ['GalleryScene', 'WorldMapScene'],
    ['CutsceneScene', 'MazeScene'],
    ['BattleScene', 'WorldMapScene'],
    ['TitleScene', 'SaveSlotScene'],
    ['EvolutionScene', 'PartySelectScene'],
  ];

  const failures = {};
  for (const [from, to] of flows) {
    const before = errors.length;
    await page.evaluate(([f, t]) => {
      const mw = window.__MW;
      mw.game.scene.getScenes(true).forEach((s) => mw.game.scene.stop(s.scene.key));
      mw.game.scene.start(f, { floor: 1, grade: 3 });
    }, [from, to]);
    await page.waitForTimeout(1200);
    await page.evaluate(([f, t]) => {
      const mw = window.__MW;
      mw.game.scene.stop(f);
      mw.game.scene.start(t, { floor: 1, grade: 3 });
    }, [from, to]);
    await page.waitForTimeout(1200);

    // Verify the destination scene is actually active and rendering
    const active = await page.evaluate(() => window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
    const newErrors = errors.slice(before);
    if (newErrors.length || !active.includes(to)) {
      failures[`${from}→${to}`] = { errors: newErrors, active };
    }
  }

  console.log('=== TRANSITION FAILURES ===');
  console.log(JSON.stringify(failures, null, 2));
  expect(Object.keys(failures), JSON.stringify(failures, null, 2)).toEqual([]);
});
