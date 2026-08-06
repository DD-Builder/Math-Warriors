/**
 * Overworld hub wiring — the gameplay bridge between the 3D app and Phaser.
 *
 * overworld-boot.spec.js proves the world renders; overworld-beauty.spec.js
 * proves it looks like something. This proves it PLAYS: standing in a gate
 * raises the ENTER prompt, walking over a pickup grants it into the same
 * save fields the rest of the game reads, and saveMazeState() persists the
 * v6 overworld snapshot to the real slot key.
 *
 * teleport() is used instead of driving the joystick because the point here
 * is the trigger wiring, not the controller (controller.test.js owns that),
 * and headless SwiftShader would spend a minute walking 40 metres.
 */
import { test, expect } from '@playwright/test';

const SLOT_KEY = 'mathwarriors.save.1';

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
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: true, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: 1, lastPlayedAt: 1 },
  };
}

test('overworld hub: portal prompt, pickup grant, save snapshot', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(s));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((x) => mgr.stop(x.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 90_000 });

  // ── Portal proximity raises the prompt (portal-f1 stands at 10,140) ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(10, 142, Math.PI));
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s._nearPortal && !!s._promptBtn;
  }, null, { timeout: 30_000 });

  const prompt = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { floorId: s._nearPortal.floorId, label: s._promptBtn.label.text };
  });
  expect(prompt.floorId).toBe(1);
  expect(prompt.label).toContain('FLOOR 1');

  // ── Pickup grants into save.gold and clears the prompt on leaving ──
  // ow-garden-1 is 20 gold at (-20, 135).
  const before = await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene').save.gold);
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(-20, 135, 0));
  await page.waitForFunction(
    (g) => window.__MW.game.scene.getScene('OverworldScene').save.gold > g,
    before, { timeout: 30_000 },
  );

  const afterPickup = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { gold: s.save.gold, chip: s._goldChip.label.text, prompt: !!s._promptBtn };
  });
  expect(afterPickup.gold).toBe(before + 20);
  expect(afterPickup.chip).toBe(String(before + 20));
  expect(afterPickup.prompt, 'prompt cleared once out of portal range').toBe(false);

  // ── saveMazeState writes the v6 snapshot to the real slot key ──
  const persisted = await page.evaluate((key) => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    s.saveMazeState();
    return JSON.parse(localStorage.getItem(key));
  }, SLOT_KEY);

  expect(persisted.gold).toBe(before + 20);
  expect(persisted.overworld.pos).not.toBeNull();
  expect(persisted.overworld.pos.x).toBeCloseTo(-20, 1);
  expect(persisted.overworld.pos.z).toBeCloseTo(135, 1);
  expect(persisted.overworld.collected).toContain('ow-garden-1');

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
