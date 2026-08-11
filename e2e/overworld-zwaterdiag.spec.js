import { test } from '@playwright/test';

test('water diag', async ({ page }) => {
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text().slice(0, 900)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  });
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => window.__MW_OVERWORLD.setPose('tidepool-foam'));
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const s = window.__MW_OVERWORLD.stats();
    return JSON.stringify(s);
  });
  console.log('STATS', info);
  console.log('LOGS\n' + logs.join('\n---\n'));
});
