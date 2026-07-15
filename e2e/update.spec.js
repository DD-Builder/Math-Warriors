import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 800, height: 600 } });
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
});

// 1. Stale build → forced hard reload to a cache-busted URL.
test('stale version forces a hard reload', async ({ page }) => {
  await page.route('**/version.json*', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '9.9.9' }) }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // updateCheck should navigate to ?v=9.9.9
  await page.waitForURL(/\?v=9\.9\.9/, { timeout: 8000 });
  expect(page.url()).toContain('v=9.9.9');
});

// 2. Already tried this version (guard set) → no loop, manual button offered.
test('after one failed auto-reload, a manual Update button appears', async ({ page }) => {
  await page.route('**/version.json*', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '9.9.9' }) }));
  await page.addInitScript(() => {
    try { sessionStorage.setItem('mw_update_target', '9.9.9'); } catch (e) {}
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  // Should NOT have reloaded (guard blocks the loop)
  expect(page.url()).not.toContain('v=9.9.9');
  // __MW_UPDATE should report stale + not reloading
  const upd = await page.evaluate(() => window.__MW_UPDATE);
  expect(upd.current).toBe(false);
  expect(upd.reloading).toBe(false);
  expect(upd.latest).toBe('9.9.9');
});
