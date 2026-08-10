/**
 * Re-run of .forensics/controls.md's probes against the CURRENT build, to
 * measure before/after. Standalone Playwright script (not a gate spec).
 */
import { chromium } from 'playwright-core';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:4173';

function freshSave(partySize = 3) {
  const heroes = [
    { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
    { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
    { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
  ].slice(0, partySize);
  return {
    version: 1, grade: 3,
    party: heroes,
    gold: 10, potions: 2,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

async function boot(page, save) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((s) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(s));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((sc) => mgr.stop(sc.scene.key));
    mgr.start('OverworldScene', {});
  }, save);
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s && !s._cover;
  }, null, { timeout: 60_000 });
  // Skip first-arrival cinematic if it's blocking, and freeze at a known spot.
  await page.evaluate(() => window.__MW_OVERWORLD.freeze?.(false));
}

async function simTime(page) { return page.evaluate(() => window.__MW_OVERWORLD.stats().simTime); }
async function waitSim(page, seconds, timeoutMs = 120_000) {
  const t0 = await simTime(page);
  await page.waitForFunction((t) => window.__MW_OVERWORLD.stats().simTime >= t, t0 + seconds, { timeout: timeoutMs });
}
async function pos(page) {
  return page.evaluate(() => { const p = window.__MW_OVERWORLD._state.pos; return { x: p.x, y: p.y, z: p.z }; });
}
async function yaw(page) {
  return page.evaluate(() => window.__MW_OVERWORLD._state.camYaw ?? window.__MW_OVERWORLD.stats().camYaw ?? null);
}
async function teleport(page, x, z, facing = 0) {
  await page.evaluate(([x, z, facing]) => window.__MW_OVERWORLD.teleport(x, z, facing), [x, z, facing]);
  await page.waitForTimeout(50);
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cw: c.width, ch: c.height };
  });
}

const results = {};

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  // ── PROBE 1: left stick drag 4 directions, drift after release ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, freshSave(3));
    const rect = await canvasRect(page);
    const sx = rect.x + rect.w * (250 / 1440);
    const sy = rect.y + rect.h * (830 / 960);

    const dirs = {
      UP: [0, -80], DOWN: [0, 80], LEFT: [-80, 0], RIGHT: [80, 0],
    };
    const distances = {};
    for (const [name, [dx, dy]] of Object.entries(dirs)) {
      await teleport(page, 0, 0, 0);
      await page.waitForTimeout(100);
      const p0 = await pos(page);
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + dx, sy + dy, { steps: 5 });
      await waitSim(page, 3);
      const p1 = await pos(page);
      await page.mouse.up();
      const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      distances[name] = d;
      await page.waitForTimeout(50);
    }
    results.stickDistances = distances;

    // Direction correctness (UP)
    await teleport(page, 0, 0, 0);
    await page.waitForTimeout(100);
    const p0 = await pos(page);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx, sy - 80, { steps: 5 });
    await waitSim(page, 2);
    const p1 = await pos(page);
    const camYaw0 = await yaw(page);
    const heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    results.directionCheck = { heading, camYaw: camYaw0, p0, p1 };

    // Drift after release
    await waitSim(page, 0.2);
    const pRel = await pos(page);
    await page.mouse.up();
    await waitSim(page, 1.5);
    const pStop = await pos(page);
    results.driftAfterRelease = Math.hypot(pStop.x - pRel.x, pStop.z - pRel.z);

    results.pageErrorsPhase1 = errors;
    await page.close();
  }

  // ── PROBE 2: right-half drag camera yaw + no player movement ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await boot(page, freshSave(3));
    const rect = await canvasRect(page);
    await teleport(page, 0, 0, 0);
    await page.waitForTimeout(100);
    const yaw0 = await yaw(page);
    const p0 = await pos(page);
    const startX = rect.x + rect.w * (1000 / 1440);
    const startY = rect.y + rect.h * (500 / 960);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 400 * (rect.w / 1440), startY, { steps: 20 });
    await waitSim(page, 1.0);
    await page.mouse.up();
    await waitSim(page, 0.3);
    const yaw1 = await yaw(page);
    const p1 = await pos(page);
    results.rightDragYawDelta = yaw1 - yaw0;
    results.rightDragPlayerMoved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    await page.close();
  }

  // ── PROBE 3: multi-touch stick + camera + jump simultaneously (CDP) ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await boot(page, freshSave(3));
    const client = await page.context().newCDPSession(page);
    const rect = await canvasRect(page);
    const stickX = rect.x + rect.w * (250 / 1440);
    const stickY = rect.y + rect.h * (830 / 960);
    const lookX0 = rect.x + rect.w * (1000 / 1440);
    const lookY = rect.y + rect.h * (500 / 960);
    const jumpX = rect.x + rect.w * ((1440 - 190) / 1440);
    const jumpY = rect.y + rect.h * ((960 - 210) / 960);

    await teleport(page, 0, 0, 0);
    await page.waitForTimeout(100);
    const p0 = await pos(page);
    const yaw0 = await yaw(page);

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: stickX, y: stickY, id: 1 },
        { x: lookX0, y: lookY, id: 2 },
      ],
    });
    await page.waitForTimeout(80);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: stickX, y: stickY - 80, id: 1 },
        { x: lookX0 - 200, y: lookY, id: 2 },
      ],
    });
    await page.waitForTimeout(80);
    // add jump touch (3rd finger)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: stickX, y: stickY - 80, id: 1 },
        { x: lookX0 - 200, y: lookY, id: 2 },
        { x: jumpX, y: jumpY, id: 3 },
      ],
    });
    const yBefore = (await pos(page)).y;
    await waitSim(page, 0.8);
    const yAfterJumpStart = (await pos(page)).y;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [
        { x: stickX, y: stickY - 80, id: 1 },
        { x: lookX0 - 200, y: lookY, id: 2 },
      ],
    });
    await waitSim(page, 0.5);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const p1 = await pos(page);
    const yaw1 = await yaw(page);
    results.multiTouch = {
      moved: Math.hypot(p1.x - p0.x, p1.z - p0.z),
      camYawDelta: yaw1 - yaw0,
      jumpRise: yAfterJumpStart - yBefore,
    };
    await page.close();
  }

  // ── PROBE 4: jump tap vs hold ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await boot(page, freshSave(3));
    const rect = await canvasRect(page);
    const jumpX = rect.x + rect.w * ((1440 - 190) / 1440);
    const jumpY = rect.y + rect.h * ((960 - 210) / 960);

    // tap
    await teleport(page, 0, 0, 0);
    await page.waitForTimeout(150);
    let maxY = (await pos(page)).y;
    await page.mouse.move(jumpX, jumpY);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.up();
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(80);
      const y = (await pos(page)).y;
      if (y > maxY) maxY = y;
    }
    const tapApex = maxY - (await pos(page)).y >= 0 ? maxY : maxY;
    const baseY = 0; // spawn height offset unknown; use relative apex from before jump
    results.jumpTapApex = maxY;

    // hold
    await teleport(page, 0, 0, 0);
    await page.waitForTimeout(150);
    const yStart = (await pos(page)).y;
    let maxY2 = yStart;
    await page.mouse.move(jumpX, jumpY);
    await page.mouse.down();
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(60);
      const y = (await pos(page)).y;
      if (y > maxY2) maxY2 = y;
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    results.jumpHoldApexRel = maxY2 - yStart;
    results.jumpTapApexRel = results.jumpTapApex - yStart;
    await page.close();
  }

  // ── PROBE 5: keyboard parity ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await boot(page, freshSave(3));
    const keys = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft'];
    const kb = {};
    for (const key of keys) {
      await teleport(page, 0, 0, 0);
      await page.waitForTimeout(100);
      const p0 = await pos(page);
      await page.keyboard.down(key);
      await waitSim(page, 1.5);
      const p1 = await pos(page);
      await page.keyboard.up(key);
      kb[key] = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      await page.waitForTimeout(50);
    }
    results.keyboardParity = kb;
    await page.close();
  }

  // ── PROBE 6: ACTION button label + ability button presence/firing ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await boot(page, freshSave(3));
    const near = await page.evaluate(() => window.__MW_OVERWORLD.getNearPortal?.());
    const kind = await page.evaluate(() => window.__MW_OVERWORLD.getNearActionKind?.());
    results.debugApiSurface = { hasGetNearPortal: typeof near !== 'undefined', hasGetNearActionKind: kind !== undefined || kind === null, near, kind };

    // Teleport near portal-f1 to trigger ACTION label
    const worldSpec = await page.evaluate(() => {
      try { return window.__MW_OVERWORLD._state?.portals || null; } catch { return null; }
    });
    results.worldSpecPortalsProbe = worldSpec;
    await page.close();
  }

  // ── PROBE 7: portal discovery flow + compass presence + ENTER ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, freshSave(3));
    // spawn
    const spawn = await pos(page);
    results.spawnPos = spawn;
    // compass hint presence
    await page.waitForTimeout(300);
    const compassVisible = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return !!(s && s._compass && s._compass.shown);
    });
    results.compassVisibleAtSpawn = compassVisible;
    const discHint = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return s ? s._discHint : undefined;
    });
    results.discHintAtSpawn = discHint;
    await page.close();
    results.pageErrorsPhase7 = errors;
  }

  // ── PROBE 8: ENTER flow with party < 3 (should NOT crash) ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, freshSave(1));
    // find nearest portal via debug api, teleport onto it, call _enterPortal via scene
    const portalPos = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      // find nearest portal from world spec
      return window.__MW_OVERWORLD.getNearPortal ? null : null;
    });
    // teleport to known portal-f1 coordinate from worldSpec.js (10,140)
    await teleport(page, 10, 140, 0);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return { entering: !!s._entering, hasNearPortal: !!s._nearPortal };
    });
    await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      s._enterPortal();
    });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return { entering: !!s._entering, sceneActive: window.__MW.game.scene.isActive('OverworldScene') };
    });
    results.enterWithSmallParty = { before, after, pageErrors: errors };
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
