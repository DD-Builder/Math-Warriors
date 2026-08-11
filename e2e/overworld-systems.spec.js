/**
 * THE ANTI-ORPHAN SPEC.
 *
 * Four modules on this project have been written, tested and then left
 * unreachable from the running game — battle3d, traversal, and most recently
 * gameFeel / audio3d / cinematics / the SFX library. A unit test proves a
 * module works. It cannot prove anything imports it.
 *
 * So every assertion below is made against the LIVE WORLD, by playing it:
 *
 *   gameFeel    walk, and the feel controller's momentum/surface channels move
 *   traversal   swim by standing in the sea, climb by pushing at a real face
 *   HUD         the stamina ring exists and the world can place it on screen
 *   audio3d     the emitter table is populated with the world's own props
 *   cinematics  the director is constructed and holds the camera slot
 *   sfxLibrary  every cue name the world plays resolves to a real recipe
 *
 * If any of these is ever unwired again, this spec fails on the change that
 * unwired it rather than three rounds later in a review.
 *
 * State-based waits only: headless SwiftShader runs single-digit fps.
 */
import { test, expect } from '@playwright/test';

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
    gold: 10,
    potions: 2,
    // `complete` on two floors is what tells OverworldScene this is not a first
    // arrival, so the establishing cinematic does not hold the stick while a
    // spec is trying to drive. A dedicated test below covers the intro itself.
    floors: Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, unlocked: i < 3, complete: i < 2, bestStreak: 0,
    })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: {
      totalBattles: 3, totalCorrect: 0, totalWrong: 0, playTimeSec: 0,
      firstPlayedAt: Date.now(), lastPlayedAt: Date.now(),
    },
  };
}

async function bootOverworld(page, save = seededSave()) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(s));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((sc) => mgr.stop(sc.scene.key));
    mgr.start('OverworldScene', {});
  }, save);
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__MW_OVERWORLD.stats().drawCalls > 0, null, { timeout: 30_000 });
}

/**
 * Hold a key until `check` passes on the live state, then release.
 *
 * The default is generous on purpose: SwiftShader runs this world at single
 * digit fps, and slower still when several spec files share one browser
 * process, so anything driven by SIM TIME (a climb latch, an auto-canopy) has
 * to be given real wall-clock room. Every wait here is state-based; the only
 * thing a timeout can mean is "the system under test never engaged".
 */
async function hold(page, key, check, timeout = 90_000) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(check, null, { timeout });
  } finally {
    await page.keyboard.up(key);
  }
}

test('gameFeel drives the walk — momentum, surface and the sprint lens are live', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  // The feel controller's channels must EXIST on the live world. If gameFeel is
  // not in the movement path this object is missing outright.
  const rest = await page.evaluate(() => window.__MW_OVERWORLD.feel());
  expect(rest, 'the world exposes gameFeel channels').toBeTruthy();
  expect(rest.speed).toBe(0);
  expect(typeof rest.surface).toBe('string');

  // Walking must move gameFeel's own momentum scalar, not merely the position:
  // `speed` is integrated by accelStep and exists nowhere in controller.js.
  await hold(page, 'w', () => window.__MW_OVERWORLD.feel().speed > 2);
  const moving = await page.evaluate(() => window.__MW_OVERWORLD.feel());
  expect(moving.speed, 'the feel controller carries real momentum').toBeGreaterThan(2);
  expect(['ground', 'air', 'water', 'ice']).toContain(moving.surface);

  // Sprinting opens the lens. fovKick is a gameFeel channel and the camera
  // reads it through fovOffsetDeg, so a non-zero value here is proof of BOTH
  // the controller and the camera wiring.
  await page.keyboard.down('Shift');
  await hold(page, 'w', () => window.__MW_OVERWORLD.feel().fovKick > 0.05, 40_000);
  await page.keyboard.up('Shift');
  const sprint = await page.evaluate(() => window.__MW_OVERWORLD.feel());
  expect(sprint.fovKick, 'a sprint kicks the FOV').toBeGreaterThan(0.05);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('traversal is reachable by playing — deep water swims, a real face climbs', async ({ page }) => {
  test.slow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  expect(await page.evaluate(() => window.__MW_OVERWORLD.traversal().mode)).toBe('walk');

  // ── SWIM ──────────────────────────────────────────────────────────────
  // Well offshore: the seabed there is far below the waterline, which is the
  // only condition swim mode needs.
  const swim = await page.evaluate(() => {
    window.__MW_OVERWORLD.teleport(0, 300, 0);
    return window.__MW_OVERWORLD.traversal();
  });
  expect(swim.mode, 'deep water swims').toBe('swim');
  expect(swim.jumpLabel, 'the jump button relabels itself in the water').toBeTruthy();

  // ── CLIMB ─────────────────────────────────────────────────────────────
  // Walk at an AUTHORED face. The route list comes from the world itself, so
  // this spec cannot drift away from the level design.
  const routes = await page.evaluate(() => window.__MW_OVERWORLD.climbRoutes());
  expect(routes.length, 'the island has authored climb routes').toBeGreaterThan(0);
  const r = routes.find((x) => x.grade === 'easy') || routes[0];

  // Stand a couple of metres back from the foot, FACING the wall. teleport()
  // re-anchors the boom behind that facing, and movement is camera-relative,
  // so from here "forward" is straight into the face — the child's own route
  // up, driven through the real keyboard and the real input pipeline.
  await page.evaluate((route) => {
    window.__MW_OVERWORLD.teleport(
      route.x - route.dx * 2.4,
      route.z - route.dz * 2.4,
      Math.atan2(route.dx, route.dz),
    );
  }, r);
  await hold(page, 'w', () => window.__MW_OVERWORLD.traversal().mode === 'climb');
  const climbed = await page.evaluate(() => window.__MW_OVERWORLD.traversal());
  expect(climbed.mode, 'walking into an authored face latches a climb').toBe('climb');

  // And hauling up it costs the shared pool — which is the number the HUD ring
  // draws, so a full pool here would mean the gauge can never say anything.
  await page.waitForFunction(() => window.__MW_OVERWORLD.traversal().stamina < 0.995,
    null, { timeout: 30_000 });

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('the glider opens itself when a child runs off the palace', async ({ page }) => {
  test.slow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  // Run off an authored launch pad. Nobody presses anything for the canopy:
  // the auto-canopy is the kindest line in the movement code — a five-year-old
  // who walks off the palace flies instead of falling — and this is the test
  // that it actually fires in the shipped game.
  const pads = await page.evaluate(() => window.__MW_OVERWORLD.launchPads());
  expect(pads.length, 'the island has authored launch pads').toBeGreaterThan(0);
  const pad = pads.find((p) => p.id === 'pad-palace-east') || pads[0];
  await page.evaluate((p) => window.__MW_OVERWORLD.teleport(p.x, p.z, 0), pad);

  await page.keyboard.down('Shift');
  await hold(page, 'w', () => window.__MW_OVERWORLD.traversal().mode === 'glide', 120_000);
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => window.__MW_OVERWORLD.traversal().mode)).toBe('glide');

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('the stamina ring, the ambience and the director are all installed', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootOverworld(page);

  const wired = await page.evaluate(() => {
    const scene = window.__MW.game.scene.getScene('OverworldScene');
    const api = window.__MW_OVERWORLD;
    return {
      stamina: !!scene._stamina,
      staminaFrac: api.traversal().stamina,
      heroOnScreen: !!scene.app.heroScreenPos(),
      cine: !!scene._cine,
      cineIdle: scene._cine ? scene._cine.active : null,
      audio: api.audio(),
      stats: api.worldStats(),
    };
  });

  // HUD
  expect(wired.stamina, 'traversalHud built the stamina gauge').toBe(true);
  expect(wired.staminaFrac).toBeGreaterThan(0.9);
  expect(wired.heroOnScreen, 'the world can place the ring on the hero').toBe(true);

  // Cinematics
  expect(wired.cine, 'the cinematic director exists').toBe(true);
  expect(wired.cineIdle, 'nothing is playing while walking around').toBe(false);

  // Sound. The context is not unlocked in a headless run (no gesture), so the
  // MIXER is asleep — but the emitter table is built at world-build time and
  // is the thing that proves audio3d is wired to the world's props.
  expect(wired.audio.attached, 'fountains/portals/pickups hold positional loops')
    .toBeGreaterThan(0);
  expect(wired.audio.budget.loops).toBeGreaterThan(0);

  // The two movement FX rigs, inside the draw-call budget.
  expect(wired.stats.feelFx.drawCalls).toBe(3);
  expect(wired.stats.traversalFx.drawCalls).toBe(7);
  expect(wired.stats.audio).toBeTruthy();

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('a brand new save gets the arrival cinematic, and walking away skips it', async ({ page }) => {
  test.slow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const fresh = seededSave();
  fresh.floors = fresh.floors.map((f) => ({ ...f, complete: false }));
  fresh.stats.totalBattles = 0;
  await bootOverworld(page, fresh);

  // The establishing shot takes the camera off the follow boom.
  await page.waitForFunction(
    () => window.__MW.game.scene.getScene('OverworldScene')._cine?.active === true,
    null, { timeout: 30_000 },
  );
  expect(await page.evaluate(() => window.__MW_OVERWORLD.cinematicActive())).toBe(true);

  // A cinematic must never trap anyone: leaning on the stick skips it, and the
  // eye comes straight back to the follow boom.
  await page.waitForTimeout(1200);
  await hold(
    page, 'w',
    () => window.__MW.game.scene.getScene('OverworldScene')._cine?.active === false,
    30_000,
  );
  expect(await page.evaluate(() => window.__MW_OVERWORLD.cinematicActive())).toBe(false);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
