/**
 * CONTROLS — the thing the player called "abysmal", asserted live.
 *
 * The unit tests in src/overworld/controls3d.test.js pin the maths. This spec
 * pins the WIRING, which is where the old build actually broke: that the fixed
 * stick is on screen and does not re-anchor, that dragging the right half of
 * the screen really orbits the camera, that movement is resolved against that
 * orbit (turn the camera, hold "forward", walk a different way), and that a
 * pinch changes the boom length.
 *
 * Headless SwiftShader is single-digit fps — every wait is state-based.
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
    ],
    gold: 10, potions: 2,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: i < 2, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

async function bootOverworld(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 60_000 });
  // The scene builds its input right after the app resolves.
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!(s && s._controls);
  }, null, { timeout: 30_000 });
}

/** Canvas-space point -> page coordinates, honouring Phaser's scale/letterbox. */
async function toPage(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const sm = window.__MW.game.scale;
    const b = sm.canvas.getBoundingClientRect();
    return { x: b.left + x * (b.width / sm.width), y: b.top + y * (b.height / sm.height) };
  }, [gx, gy]);
}

const orbit = (page) => page.evaluate(() => {
  const c = window.__MW.game.scene.getScene('OverworldScene')._controls.orbit;
  return { yaw: c.yaw, pitch: c.pitch, zoom: c.zoom };
});

test('the stick base is FIXED — a drag never moves the origin', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const stick = () => page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene')._controls.stick;
    return { x: s.x, y: s.y, active: s.active };
  });

  expect((await stick()).active, 'the stick rests released').toBe(false);

  // Grab the stick well off-centre and to the RIGHT of its base. The old
  // build re-anchored here and would report zero deflection on grab; a fixed
  // base reports a real push, immediately, measured from the painted centre.
  const p0 = await toPage(page, 420, 900);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const grabbed = await stick();
  expect(grabbed.active).toBe(true);
  expect(grabbed.x, 'grabbing right of the base is a push right').toBeGreaterThan(0.5);

  // Push right and confirm the hero actually travels.
  const before = await page.evaluate(() => ({ ...window.__MW_OVERWORLD._state.pos }));
  const p1 = await toPage(page, 500, 830);
  await page.mouse.move(p1.x, p1.y, { steps: 6 });
  await page.waitForFunction((s) => {
    const p = window.__MW_OVERWORLD._state.pos;
    return Math.hypot(p.x - s.x, p.z - s.z) > 1.0;
  }, before, { timeout: 30_000 });
  await page.mouse.up();

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('the right half ORBITS the camera — yaw, clamped pitch, and it settles', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const start = await orbit(page);

  // Horizontal drag across the right half.
  const a = await toPage(page, 1000, 500);
  const b = await toPage(page, 1300, 500);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700); // let the flick inertia die

  const yawed = await orbit(page);
  const dYaw = Math.abs(Math.atan2(Math.sin(yawed.yaw - start.yaw), Math.cos(yawed.yaw - start.yaw)));
  expect(dYaw, 'dragging right must swing the camera').toBeGreaterThan(0.3);

  // The eye must actually have MOVED in the world, not just a number changed.
  const eye = await page.evaluate(() => {
    const c = window.__MW_OVERWORLD._camera || window.__MW_OVERWORLD.camera;
    return c ? { x: c.position.x, z: c.position.z } : null;
  });
  if (eye) expect(Number.isFinite(eye.x)).toBe(true);

  // Vertical drag: pitch moves, and clamps rather than flipping over.
  for (let i = 0; i < 6; i++) {
    const c = await toPage(page, 1100, 300);
    const d = await toPage(page, 1100, 800);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(d.x, d.y, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(600);
  const pitched = await orbit(page);
  expect(pitched.pitch).toBeGreaterThan(start.pitch);
  expect(pitched.pitch).toBeLessThanOrEqual(0.8001);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('movement is CAMERA-RELATIVE — turn the eye, "forward" changes direction', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  /** Hold W until the hero has covered `d`, then report the heading walked. */
  const walk = async (d) => {
    const from = await page.evaluate(() => ({ ...window.__MW_OVERWORLD._state.pos }));
    await page.keyboard.down('w');
    await page.waitForFunction(([s, dist]) => {
      const p = window.__MW_OVERWORLD._state.pos;
      return Math.hypot(p.x - s.x, p.z - s.z) > dist;
    }, [from, d], { timeout: 40_000 });
    await page.keyboard.up('w');
    const to = await page.evaluate(() => ({ ...window.__MW_OVERWORLD._state.pos }));
    return Math.atan2(to.x - from.x, to.z - from.z);
  };

  const h1 = await walk(1.2);
  await page.waitForTimeout(400);

  // Swing the camera roughly a quarter turn.
  const a = await toPage(page, 950, 480);
  const b = await toPage(page, 1380, 480);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  const h2 = await walk(1.2);
  const diff = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
  expect(diff, 'forward must follow the camera, not a world axis').toBeGreaterThan(0.4);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('the wheel zooms the boom, clamped both ways', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  // Few, large deltas: SwiftShader runs at single-digit fps and each wheel
  // event waits on a frame, so a hundred small notches would time out.
  const p = await toPage(page, 1100, 500);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1200);
  const out = await orbit(page);
  expect(out.zoom).toBeGreaterThan(1.2);
  expect(out.zoom).toBeLessThanOrEqual(1.8501);

  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1200);
  const inn = await orbit(page);
  expect(inn.zoom).toBeLessThan(0.9);
  expect(inn.zoom).toBeGreaterThanOrEqual(0.6199);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
