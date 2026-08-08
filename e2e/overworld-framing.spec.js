/**
 * overworld-framing — THE COMPOSITION, MEASURED ON THE LIVE CAMERA.
 *
 * The art review that produced the two camera profiles made three claims about
 * pixels, and all three are checkable without a human looking at anything:
 *
 *   1. "dist 6.4 / height 3.0 / lookUp 1.15 gives ~16 deg of downward pitch,
 *      which puts 60%+ of every level frame on bare ground and pushes the
 *      horizon off the top edge."
 *   2. the level profile must land the horizon on the upper third instead;
 *   3. and the hero must still read at 20-28% of frame height after it.
 *
 * Every number below comes from `__MW_OVERWORLD.cameraFraming()`, which does
 * not report the authored constants — it PROJECTS the hero's feet, the hero's
 * head and the true horizon through the live camera's own matrices. So it
 * accounts for the eye-floor lift, the boom damping, the orbit the scene is
 * pushing, the speed-opened lens and the aspect the renderer is actually at.
 * If the profile numbers and the frame ever disagree, this spec believes the
 * frame.
 *
 * Floors are opened through OverworldScene._openFloor, which is the same call
 * the portal button lands on — it hydrates the rules, swaps the HUD and
 * RESYNCS THE CAMERA, which the raw app.enterFloor does not. (The proof that
 * the portal chain itself works is level3d-shots.spec.js; this spec is about
 * what the camera does once it is through.)
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'e2e/screenshots/framing';
/** One per theme family: hedge maze, caldera, snow, library interior. */
const FLOORS = [1, 2, 4, 5, 6, 8, 9];

/** A character reads as a character between these two numbers. Below 0.20 he
 *  is scenery in his own game; above 0.28 the room behind him is gone. */
const HERO_MIN = 0.20;
const HERO_MAX = 0.28;

test.setTimeout(20 * 60 * 1000);

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

function seededSave() {
  return {
    version: 1,
    grade: 3,
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    gold: 120,
    potions: 3,
    floors: Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, unlocked: true, complete: false, bestStreak: 0,
    })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: {
      totalBattles: 0, totalCorrect: 0, totalWrong: 0,
      playTimeSec: 0, firstPlayedAt: 1, lastPlayedAt: 1,
    },
  };
}

async function bootOverworld(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    for (let i = 1; i <= 9; i++) localStorage.removeItem(`mw_floor3d_${i}`);
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, seededSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.__MW_OVERWORLD.stats();
    return s.drawCalls > 0 && s.triangles > 0;
  }, null, { timeout: 120_000 });
}

/** Let the boom settle, then read the frame. */
async function framing(page) {
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    window.__MW_OVERWORLD.renderOnce();
    return window.__MW_OVERWORLD.cameraFraming();
  });
}

function report(label, f) {
  console.log(
    `  ${label.padEnd(18)} profile=${f.profile.toFixed(2)}  fov=${f.fov.toFixed(1)}  `
    + `dist=${f.dist.toFixed(2)}  pitch=${f.pitch.toFixed(1)}deg  `
    + `hero=${(f.heroFrac * 100).toFixed(1)}%  horizon=${(f.horizonFrac * 100).toFixed(1)}%  `
    + `blocked=${f.blocked.toFixed(2)}`,
  );
}

test('two camera profiles: the hero reads in both, the horizon only lifts in one', async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootOverworld(page);

  // ── THE ISLAND PROFILE ──────────────────────────────────────────────
  const island = await framing(page);
  report('island', island);
  expect(island.profile, 'the island is not using the level framing').toBe(0);
  expect(island.inFloor).toBe(false);
  expect(island.fov, 'the island keeps its 50 deg lens').toBeCloseTo(50, 0);
  expect(island.heroFrac, `the hero is ${(island.heroFrac * 100).toFixed(1)}% of the island frame`)
    .toBeGreaterThan(HERO_MIN);
  // The island is DELIBERATELY the tighter shot: the composition is in the
  // landscape there, so the eye stays near the hero and the world does the work.
  expect(island.heroFrac).toBeGreaterThan(0.24);

  const results = { island };

  // Collect every floor's framing AND its picture first, then assert. A spec
  // that throws inside the loop takes the screenshot of the failure with it,
  // which is the one image anybody looking at the failure wants.
  for (const floorId of FLOORS) {
    const opened = await page.evaluate((id) => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return s._openFloor(id);
    }, floorId);
    expect(opened, `floor ${floorId} opened`).toBe(true);

    const f = await framing(page);
    report(`floor ${floorId}`, f);
    results[`floor${floorId}`] = f;

    await page.evaluate(() => {
      window.__MW.game.canvas.style.visibility = 'hidden';
      window.__MW_OVERWORLD.renderOnce();
    });
    await page.screenshot({ path: path.join(OUT_DIR, `floor-${floorId}-framing.png`) });
    await page.evaluate(() => { window.__MW.game.canvas.style.visibility = ''; });

    await page.evaluate(() => {
      window.__MW.game.scene.getScene('OverworldScene')._leaveFloor();
    });
    const back = await framing(page);
    expect(back.profile, `leaving floor ${floorId} did not restore the island framing`).toBe(0);
    expect(back.inFloor).toBe(false);
  }

  for (const floorId of FLOORS) {
    const f = results[`floor${floorId}`];
    // ── 1. THE PROFILE SWAPPED, ON THE FIRST FRAME ──
    expect(f.profile, `floor ${floorId} did not take the level framing`).toBe(1);
    expect(f.inFloor).toBe(true);
    // 44 is the authored level lens. It opens — never past 56 — only when a
    // wall has taken boom length away and the hero would otherwise grow out of
    // frame; see fovCrushMax. It must never be the island's 50 by accident.
    expect(f.fov).toBeGreaterThanOrEqual(43.9);
    expect(f.fov, `floor ${floorId} opened past the crush ceiling`).toBeLessThanOrEqual(56.1);
    if (f.dist > 9.3) {
      expect(f.fov, `floor ${floorId} has a full boom but a compensated lens`)
        .toBeCloseTo(44, 0);
    }

    // ── 2. THE HORIZON IS ON THE UPPER THIRD ──
    // Not off the top edge (< 0.10 was the old shot) and not at the middle of
    // the frame either, which would be a landscape photograph rather than a
    // game camera. The band is generous because a level's ground is terraced
    // and the eye floor legitimately moves the horizon a few percent.
    expect(f.horizonFrac,
      `floor ${floorId}: the horizon sits ${(f.horizonFrac * 100).toFixed(1)}% down the frame`)
      .toBeGreaterThan(0.20);
    expect(f.horizonFrac).toBeLessThan(0.42);

    // ── 3. THE HERO STILL READS ──
    expect(f.heroFrac,
      `floor ${floorId}: the hero is ${(f.heroFrac * 100).toFixed(1)}% of frame height`)
      .toBeGreaterThan(HERO_MIN);
    expect(f.heroFrac).toBeLessThan(HERO_MAX);

    // ── 4. AND THE SHOT IS NOT A PLAN VIEW ──
    // squeezeLift used to fire on PROXIMITY, which inside a maze meant always:
    // a 2.6 m lift on a 3 m boom is 40 degrees of pitch. It is now gated on the
    // boom actually walking into architecture, so a resting spawn frame — even
    // one surrounded by hedge — must come in under 20 degrees.
    expect(f.pitch, `floor ${floorId}: the eye is pitched ${f.pitch.toFixed(1)} deg down`)
      .toBeLessThan(20);
    expect(f.pitch).toBeGreaterThan(4);

    // ── 5. AND THE BOOM ACTUALLY GOT ITS LENGTH ──
    // The other way to lose this composition is for the room to crush the
    // boom. It is allowed to — floors 2, 6 and 9 spawn against genuinely tall
    // architecture and the lens compensation is what keeps those framings
    // legal — but a boom crushed below 6 m means the height-aware wall test
    // has stopped working and every level is back to the old shot.
    expect(f.dist, `floor ${floorId}: the boom was crushed to ${f.dist.toFixed(1)} m`)
      .toBeGreaterThan(6.0);
  }

  // The two profiles must actually be two profiles: the level shot is further
  // back, longer in the lens and flatter in the pitch than the island's.
  const lvl = results.floor4;
  expect(lvl.dist, 'the level boom is longer').toBeGreaterThan(island.dist + 1.5);
  expect(lvl.fov, 'the level lens is longer').toBeLessThan(island.fov - 3);
  expect(lvl.pitch, 'the level shot is flatter').toBeLessThan(island.pitch - 2);
  for (const floorId of FLOORS) {
    expect(results[`floor${floorId}`].horizonFrac,
      `floor ${floorId}: the horizon is no lower in frame than the island's`)
      .toBeGreaterThan(island.horizonFrac);
  }

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
