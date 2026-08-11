/**
 * Overworld fallback — no WebGL means the 2D World Map stays the hub.
 *
 * The `?mwForceNoWebgl=1` query flag makes hubRouter's probe report false,
 * which is exactly what a Lockdown-Mode Safari or GL-less browser looks
 * like. Starting OverworldScene must route to WorldMapScene with zero
 * errors — this spec is also the permanent regression guard that keeps the
 * 2D hub alive and reachable.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

test('no WebGL → OverworldScene falls back to WorldMapScene', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?mwForceNoWebgl=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });

  await page.evaluate(() => {
    const save = {
      version: 1, grade: 3,
      party: [
        { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
        { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
        { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
      ],
      gold: 0, potions: 2,
      floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i === 0, complete: false, bestStreak: 0 })),
      settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
      stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
    };
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  });

  // The scene must hand off to the World Map on its own.
  await page.waitForFunction(() => {
    const active = window.__MW.game.scene.getScenes(true).map((s) => s.scene.key);
    return active.includes('WorldMapScene') && !active.includes('OverworldScene');
  }, null, { timeout: 30_000 });

  // And three.js must never have loaded (no #mw-overworld canvas).
  const owCanvas = await page.evaluate(() => !!document.getElementById('mw-overworld'));
  expect(owCanvas, 'overworld canvas must not exist on the fallback path').toBe(false);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
