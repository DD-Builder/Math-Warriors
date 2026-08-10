import { chromium } from 'playwright-core';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:4173';

function seededSave() {
  return {
    version: 1, grade: 3,
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    gold: 10, potions: 2,
    overworld: { v: 6, pos: { x: 6, y: 3, z: 158 }, yaw: Math.PI },
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/portal|action|ENTER/i.test(m.text())) console.log('CONSOLE:', m.text()); });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(s));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((sc) => mgr.stop(sc.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s && !s._cover;
  }, null, { timeout: 60_000 });

  await page.evaluate(() => window.__MW_OVERWORLD.teleport(10, 137, Math.PI));
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s._promptBtn;
  }, null, { timeout: 60_000 });
  console.log('prompt visible. _nearPortal =', await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s._nearPortal ? { id: s._nearPortal.id, floorId: s._nearPortal.floorId } : null;
  }));

  // Try #1: instant press (what the spec does)
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  let state = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { entering: !!s._entering, dlgActive: !!s.dialogue?.active, floorId: s.floorId };
  });
  console.log('after instant press:', state);

  if (!state.entering && !state.dlgActive && state.floorId == null) {
    // Try #2: explicit down/up with a real hold
    await page.keyboard.down('e');
    await page.waitForTimeout(200);
    await page.keyboard.up('e');
    await page.waitForTimeout(500);
    state = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return { entering: !!s._entering, dlgActive: !!s.dialogue?.active, floorId: s.floorId };
    });
    console.log('after held press:', state);
  }

  if (!state.entering && !state.dlgActive && state.floorId == null) {
    // Try #3: call _doAction directly (bypasses input layer entirely)
    await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      s._doAction();
    });
    await page.waitForTimeout(500);
    state = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return { entering: !!s._entering, dlgActive: !!s.dialogue?.active, floorId: s.floorId };
    });
    console.log('after direct _doAction():', state);
  }

  console.log('pageErrors:', errors);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
