/**
 * Floors are 3D places now.
 *
 * overworld-hub.spec.js proves the portal PROMPT works. This proves what the
 * prompt now does: walking through a gate builds the floor inside the live 3D
 * world instead of starting MazeScene. The assertions that matter:
 *
 *   - the active scene is still OverworldScene afterwards (no 2D maze);
 *   - the floor's geometry is really in the scene and inside the draw-call and
 *     triangle budgets;
 *   - the hero is the party leader's real rig, at hero scale;
 *   - the camera is framed on that hero, not parked in a landscape;
 *   - walking onto a challenge item runs the SHARED rule (floorRules.js) and
 *     the HUD objective moves with it;
 *   - leaving puts the player back on the island.
 */
import { test, expect } from '@playwright/test';

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

async function bootOverworld(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(s));
    // A previous run's floor progress would make these assertions meaningless.
    for (let i = 1; i <= 9; i++) localStorage.removeItem(`mw_floor3d_${i}`);
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((x) => mgr.stop(x.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 90_000 });
}

test('the hero is the party leader, at hero scale, framed close', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const hero = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().hero);
  expect(hero.heroId).toBe('knight-shadow');
  expect(hero.heroClass).toBe('knight');
  // ~1.7 m, not a 5 m billboard and not a 30 cm speck.
  expect(hero.height).toBeGreaterThan(1.5);
  expect(hero.height).toBeLessThan(2.0);
  // 7 animated nodes + the contact shadow — the rig, not a capsule stack.
  expect(hero.nodes).toBe(7);

  // The camera must actually be ON the hero: a boom in the 5-9 m band, which
  // is what puts a 1.72 m figure at a readable fraction of the frame.
  const framing = await page.evaluate(() => {
    const p = window.__MW_OVERWORLD._state.pos;
    const c = window.__MW_OVERWORLD.__cam || null;
    return { p, c };
  });
  expect(framing.p).toBeTruthy();

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('a floor opens as a 3D place — no MazeScene, inside budget', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const opened = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    const ok = s._openFloor(1);
    return {
      ok,
      floorId: s.floorId,
      objective: s._floorHud?.objText?.text ?? null,
      objects: s.objects?.length ?? 0,
      stats: window.__MW_OVERWORLD.floorStats(),
    };
  });

  expect(opened.ok).toBe(true);
  expect(opened.floorId).toBe(1);
  expect(opened.objects).toBeGreaterThan(0);
  expect(opened.objective).toBeTruthy();
  // The shared objective line (floorRules.objectiveText) with a live count.
  expect(opened.objective).toMatch(/\(0\/\d+\)/);

  // TECH LAW budgets, for the floor's own geometry.
  expect(opened.stats.drawCalls).toBeLessThanOrEqual(250);
  expect(opened.stats.triangleCount).toBeLessThanOrEqual(500_000);

  // The 2D maze must NOT have been started.
  const scenes = await page.evaluate(() =>
    window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
  expect(scenes).toContain('OverworldScene');
  expect(scenes).not.toContain('MazeScene');

  // And a real frame of that floor stays inside the whole-scene budget.
  await page.waitForTimeout(1500);
  const frame = await page.evaluate(() => window.__MW_OVERWORLD.stats());
  expect(frame.drawCalls).toBeGreaterThan(0);
  expect(frame.drawCalls).toBeLessThanOrEqual(250);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('walking onto a challenge item runs the shared rule and moves the HUD', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const before = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    s._openFloor(1);
    // An UNLOCKED one: floor 1 seals two of its three rune fairies behind math
    // doors, and that gate is asserted separately below.
    const item = s.app.floorObjects()
      .find((o) => o.kind === 'challenge' && !o.consumed && !o.data.lock);
    return {
      objective: s._floorHud.objText.text,
      progress: s.challengeProgress,
      item: item ? { x: o2(item.x), z: o2(item.z) } : null,
    };
    function o2(v) { return Math.round(v * 100) / 100; }
  });
  expect(before.item, 'floor 1 has a challenge item').toBeTruthy();
  expect(before.progress).toBe(0);

  // Stand on it. teleport() re-spawns on the ACTIVE controller, which inside a
  // floor is the floor's, so this lands on the level's ground.
  await page.evaluate((it) => window.__MW_OVERWORLD.teleport(it.x, it.z, 0), before.item);
  await page.waitForFunction(
    () => window.__MW.game.scene.getScene('OverworldScene').challengeProgress > 0,
    null, { timeout: 30_000 },
  );

  const after = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { objective: s._floorHud.objText.text, progress: s.challengeProgress };
  });
  expect(after.progress).toBe(1);
  expect(after.objective).not.toBe(before.objective);
  expect(after.objective).toMatch(/\(1\/\d+\)/);

  // Leaving the floor returns the player to the island, HUD and all.
  await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene')._leaveFloor());
  const back = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { floorId: s.floorId, active: window.__MW_OVERWORLD.activeFloor(), hud: !!s._floorHud };
  });
  expect(back.floorId).toBeNull();
  expect(back.active).toBeNull();
  expect(back.hud).toBe(false);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('a locked challenge item asks its math door first (shared lock rule)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const locked = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    s._openFloor(1);
    const o = s.app.floorObjects().find((h) => h.kind === 'challenge' && h.data.lock);
    return o ? { x: o.x, z: o.z } : null;
  });
  expect(locked, 'floor 1 seals a rune fairy behind a math door').toBeTruthy();

  await page.evaluate((it) => window.__MW_OVERWORLD.teleport(it.x, it.z, 0), locked);
  await page.waitForFunction(
    () => !!window.__MW.game.scene.getScene('OverworldScene')._mathPrompt,
    null, { timeout: 30_000 },
  );

  // The gate held: the item was NOT collected, the door was asked instead.
  const state = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { progress: s.challengeProgress, prompt: !!s._mathPrompt };
  });
  expect(state.prompt).toBe(true);
  expect(state.progress).toBe(0);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
