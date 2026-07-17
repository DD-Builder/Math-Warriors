/**
 * Regression guard for the signature-secret + caged-hero rendering.
 *
 * PR #29 ("restore the hand-crafted maze art") rewrote levelEngine.js from
 * an older base and silently dropped LV_drawSecretObj (the secret medallion)
 * and LV_drawHeroPrison (the caged hero). The data kept flowing to the engine,
 * so the objects were still THERE — they just rendered as a bare shadow, and
 * the dispatch called two functions that no longer existed. This walks a maze
 * that contains both object kinds; if either draw routine goes missing again,
 * the dispatch throws a ReferenceError and `errors` is non-empty.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

test('secret medallion + caged hero render without error (floor 2)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const save = {
      version: 1, grade: 3,
      party: [{ id: 'knight-shadow', name: 'S', hp: 52, maxHp: 52 }],
      gold: 0, potions: 2,
      floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: true, complete: false, bestStreak: 0 })),
      settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
      stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
    };
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    window.__MW.game.scene.start('MazeScene', { floor: 2 });
  });
  await page.waitForTimeout(1000);
  // Floor 2 (Tidepool Ruins) carries seqmark medallions AND three coral-caged
  // heroes. Walk around the start pocket so fog reveals the nearby secrets and
  // the engine draws both object kinds.
  await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('MazeScene');
    const step = (dx, dy) => { for (let i = 0; i < 40; i++) s.tryMove({ dx, dy }); };
    step(1, 0); step(1, 0); step(1, 0); step(0, -1); step(0, -1);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/secret-floor2.png' });
  expect(errors, `render errors: ${errors.join('; ')}`).toEqual([]);
});
