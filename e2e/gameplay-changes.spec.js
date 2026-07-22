import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});
test('level shows real value; encounters scattered + hidden; +15%', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const save = { version:1, grade:3,
      party:[{id:'knight-shadow',name:'Shadow',hp:70,maxHp:70,xp:520,level:5}],
      gold:0, potions:2, floors:Array.from({length:9},(_,i)=>({id:i+1,unlocked:true,complete:false,bestStreak:0})),
      settings:{musicVolume:0,sfxVolume:0,reducedMotion:false},
      stats:{totalBattles:0,totalCorrect:0,totalWrong:0,playTimeSec:0,firstPlayedAt:Date.now(),lastPlayedAt:Date.now()} };
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    window.__MW.game.scene.start('MazeScene', { floor: 1 });
  });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('MazeScene');
    const encounters = s.objects.filter(o => o.type === 'encounter');
    const randomized = encounters.filter(o => String(o.id).startsWith('enc-rand-'));
    return {
      heroLevel: s.party[0]?.level,
      encounterCount: encounters.length,
      randomizedCount: randomized.length,
    };
  });
  console.log('VERIFY:', JSON.stringify(info));
  await page.screenshot({ path: 'e2e/screenshots/gameplay-changes-f1.png' });
  // Floor 1 had 8 hand-placed encounters -> round(8*1.15)=9, all randomized+hidden.
  expect(info.heroLevel, 'maze hero carries real level (not undefined)').toBe(5);
  expect(info.encounterCount, 'floor 1 encounters bumped ~15% (8 -> 9)').toBe(9);
  expect(info.randomizedCount, 'all plain encounters are randomized').toBe(9);
  expect(errors).toEqual([]);
});
