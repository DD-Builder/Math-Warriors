/**
 * Overworld beauty pass — one screenshot per named cinematic pose.
 *
 * This spec is a CAMERA, not a judge. It exists so an art-direction critique
 * loop always has the same eight framings of the world to look at; the only
 * hard assertion is "the page threw nothing", because everything else about
 * these images is a judgement call a human (or a critic model) makes.
 *
 * Determinism comes from the world, not from timing: the island is generated
 * from WORLD.SEED, and setPose() places the player AND the camera at literal
 * coordinates, pins the time of day, and freezes the sim clock before
 * rendering. Every wait below is state-based — headless SwiftShader runs at
 * single-digit fps and no wall-clock assumption survives it.
 *
 * The Phaser HUD canvas is hidden (visibility, NOT display — the 3D renderer
 * mirrors that canvas's layout rect) so the frames show the rendered world
 * rather than a joystick.
 */
import { test, expect } from '@playwright/test';

const OUT_DIR = 'e2e/screenshots/overworld';

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
    gold: 120, potions: 3,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: true, complete: i < 2, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

test('overworld beauty: every pose renders to a screenshot', async ({ page }) => {
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

  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const s = window.__MW_OVERWORLD.stats();
    return s.drawCalls > 0 && s.triangles > 0;
  }, null, { timeout: 60_000 });

  const poses = await page.evaluate(() => window.__MW_OVERWORLD.POSES);
  expect(poses.length, 'POSES is populated').toBeGreaterThan(0);

  // Hide the Phaser HUD layer. `visibility` keeps the element's layout box,
  // which the 3D renderer reads to size and position its own canvas.
  await page.evaluate(() => {
    window.__MW.game.canvas.style.visibility = 'hidden';
  });

  for (const name of poses) {
    const placed = await page.evaluate(async (poseName) => {
      const api = window.__MW_OVERWORLD;
      const pose = api.setPose(poseName);
      if (!pose) return null;
      // Two rAF ticks: the frozen loop redraws on each, and the second
      // guarantees the compositor has the first one.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      api.renderOnce();
      return { name: api.getPose(), tod: api.getTimeOfDay() };
    }, name);

    expect(placed, `pose "${name}" was applied`).not.toBeNull();
    expect(placed.name).toBe(name);

    await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
  }

  await page.evaluate(() => {
    window.__MW.game.canvas.style.visibility = '';
    window.__MW_OVERWORLD.clearPose();
  });

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
