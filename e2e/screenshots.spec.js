/**
 * Screenshot capture for each major scene.
 *
 * Not strictly a "test" — it just walks the game through its scenes
 * and saves a PNG of each one. Useful as proof-of-life and for
 * reviewing visual state without spinning up a browser manually.
 */

import { test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
});

// Seed a save so WorldMap has something to render
async function seedSave(page) {
  await page.evaluate(() => {
    const save = {
      version: 1,
      grade: 3,
      party: [
        { id: 'knight-shadow',    name: 'Shadow',    hp: 52, maxHp: 52 },
        { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38 },
        { id: 'bunny-pepper',     name: 'Pepper',    hp: 46, maxHp: 46 },
      ],
      gold: 25,
      potions: 2,
      floors: [
        { id: 1, unlocked: true,  complete: true,  bestStreak: 5 },
        { id: 2, unlocked: true,  complete: false, bestStreak: 0 },
        { id: 3, unlocked: false, complete: false, bestStreak: 0 },
        { id: 4, unlocked: false, complete: false, bestStreak: 0 },
        { id: 5, unlocked: false, complete: false, bestStreak: 0 },
      ],
      settings: { musicVolume: 0.8, sfxVolume: 1.0, reducedMotion: false },
      stats: {
        totalBattles: 1, totalCorrect: 5, totalWrong: 1, playTimeSec: 60,
        firstPlayedAt: Date.now(), lastPlayedAt: Date.now(),
      },
    };
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
  });
}

test('capture all scene screenshots', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/screenshots/01-title-new-game.png' });

  await seedSave(page);

  // Reload so TitleScene sees the save and shows CONTINUE
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/screenshots/02-title-with-save.png' });

  // Party select
  await page.evaluate(() => window.__MW.game.scene.start('PartySelectScene', { grade: 3 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e/screenshots/03-party-select-knights.png' });

  // World map
  await page.evaluate(() => window.__MW.game.scene.start('WorldMapScene'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e/screenshots/04-world-map.png' });

  // Maze (Floor 1)
  await page.evaluate(() => window.__MW.game.scene.start('MazeScene', { floor: 1 }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'e2e/screenshots/05-maze-start.png' });

  // Maze after exploring a bit
  await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('MazeScene');
    // Reveal more of the maze
    for (let y = 1; y < 14; y++) {
      for (let x = 1; x < 14; x++) {
        s.revealFog(x, y, 0);
      }
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/06-maze-revealed.png' });

  // Battle
  await page.evaluate(() => window.__MW.game.scene.start('BattleScene', { floor: 1, grade: 3 }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screenshots/07-battle.png' });
});
