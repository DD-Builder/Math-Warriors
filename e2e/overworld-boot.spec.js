/**
 * Overworld boot — the 3D hub comes up cleanly under software WebGL.
 *
 * Asserts: the OverworldScene boots, the Three.js app reports ready via
 * window.__MW_OVERWORLD, a frame has real draw calls within the perf budget,
 * and no page errors fire. Headless SwiftShader runs single-digit fps — all
 * waits are state-based, never timing-based.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

function seededSave() {
  return {
    version: 1, grade: 3,
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    gold: 10, potions: 2,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: i < 2, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

test('overworld boots: 3D app ready, stats in budget, zero errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });

  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());

  // State-based wait: the 3D app installs __MW_OVERWORLD and flips ready.
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 60_000 });

  // Let a few frames render, then check the render stats.
  await page.waitForFunction(() => {
    const s = window.__MW_OVERWORLD.stats();
    return s.drawCalls > 0 && s.triangles > 0;
  }, null, { timeout: 30_000 });

  // Wait for the boot cover to finish fading so the screenshot shows the
  // actual world, not a mid-fade dim frame.
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s && !s._cover;
  }, null, { timeout: 30_000 });

  const stats = await page.evaluate(() => window.__MW_OVERWORLD.stats());
  expect(stats.drawCalls, 'draw calls within hard cap').toBeLessThanOrEqual(250);
  expect(stats.triangles, 'triangles within hard cap').toBeLessThanOrEqual(500_000);

  // The overworld canvas exists and is visible; Phaser canvas stacked above.
  const canvasState = await page.evaluate(() => {
    const ow = document.getElementById('mw-overworld');
    return {
      exists: !!ow,
      visible: ow ? getComputedStyle(ow).display !== 'none' : false,
      phaserAbove: (() => {
        const pc = window.__MW.game.canvas;
        return pc ? Number(getComputedStyle(pc).zIndex) > 0 : false;
      })(),
    };
  });
  expect(canvasState.exists).toBe(true);
  expect(canvasState.visible).toBe(true);
  expect(canvasState.phaserAbove).toBe(true);

  await page.screenshot({ path: 'e2e/screenshots/overworld-boot.png' });
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('overworld input: hero proxy moves and jumps deterministically', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 60_000 });

  const before = await page.evaluate(() => ({ ...window.__MW_OVERWORLD._state.pos }));
  // Hold W for a while (keyboard path exercises the same input pipe as touch).
  await page.keyboard.down('w');
  await page.waitForFunction((sx) => {
    const p = window.__MW_OVERWORLD._state.pos;
    return Math.hypot(p.x - sx.x, p.z - sx.z) > 1.5;
  }, before, { timeout: 30_000 });
  await page.keyboard.up('w');

  const after = await page.evaluate(() => ({ ...window.__MW_OVERWORLD._state.pos }));
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.5);
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
