import { test } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});
test('sim clock advances', async ({ page }) => {
  test.setTimeout(180_000);
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const save = { version:1, grade:3, party:[{id:'knight-shadow',name:'S',hp:52,maxHp:52,xp:0,level:1},{id:'wizard-grandmage',name:'G',hp:38,maxHp:38,xp:0,level:1},{id:'bunny-pepper',name:'P',hp:46,maxHp:46,xp:0,level:1}], gold:10, potions:2,
      overworld:{ v:6, pos:{x:6,y:3,z:158}, yaw:Math.PI },
      floors: Array.from({length:9},(_,i)=>({id:i+1,unlocked:i<3,complete:false,bestStreak:0})),
      settings:{musicVolume:0,sfxVolume:0,reducedMotion:false},
      stats:{totalBattles:0,totalCorrect:0,totalWrong:0,playTimeSec:0,firstPlayedAt:Date.now(),lastPlayedAt:Date.now()} };
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  });
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => ({
      sim: window.__MW_OVERWORLD.stats().simTime,
      cover: !!window.__MW.game.scene.getScene('OverworldScene')?._cover,
    }));
    console.log('SIM', i, JSON.stringify(s));
    if (s.sim > 2) break;
  }
});
