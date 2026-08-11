/**
 * VERIFY PROBE — re-runs the controls/UX forensic's measurements against the
 * fixed build (throwaway; deleted after the numbers are recorded).
 * Drives the REAL built game with synthetic input; all assertions on SIM state.
 */
import { test, expect } from '@playwright/test';

function seededSave(partyCount = 3) {
  const party = [
    { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
    { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
    { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
  ].slice(0, partyCount);
  return {
    version: 1, grade: 3, party,
    gold: 10, potions: 2,
    overworld: { v: 6, pos: { x: 6, y: 3, z: 158 }, yaw: Math.PI },   // NOT first arrival
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
}

async function boot(page, save) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 60_000 });
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
}

async function simTime(page) {
  return page.evaluate(() => window.__MW_OVERWORLD.stats().simTime);
}
async function waitSim(page, seconds) {
  const t0 = await simTime(page);
  await page.waitForFunction((t) => window.__MW_OVERWORLD.stats().simTime >= t, t0 + seconds, { timeout: 180_000 });
}
async function pos(page) {
  return page.evaluate(() => {
    const p = window.__MW_OVERWORLD._state.pos;
    return { x: p.x, y: p.y, z: p.z };
  });
}
/** game px -> css px on the Phaser canvas (FIT scaled). */
async function toCss(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const c = window.__MW.game.canvas;
    const r = c.getBoundingClientRect();
    return { x: r.x + (x / 1440) * r.width, y: r.y + (y / 1080) * r.height };
  }, [gx, gy]);
}
async function dragGame(page, from, to, steps = 10, holdMs = 0) {
  const a = await toCss(page, from[0], from[1]);
  const b = await toCss(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await page.waitForTimeout(30);
  }
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

test('controls + wayfinding verification', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const R = {};

  await boot(page, seededSave(3));
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(0, 100, 0));
  await waitSim(page, 0.5);

  // ── 1. Camera drag heat: 400 game-px right-half horizontal drag ──
  const yaw0 = await page.evaluate(() => window.__MW_OVERWORLD.getCameraYaw());
  await dragGame(page, [860, 420], [1260, 420], 12);
  await waitSim(page, 0.8);   // let the flick coast die
  const yaw1 = await page.evaluate(() => window.__MW_OVERWORLD.getCameraYaw());
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  R.dragYawRad = Math.abs(wrap(yaw1 - yaw0));
  R.dragYawDeg = (R.dragYawRad * 180) / Math.PI;

  // ── 2. Right-half drag must NOT move the player ──
  const pA = await pos(page);
  await dragGame(page, [900, 300], [1300, 640], 10);
  await waitSim(page, 0.5);
  const pB = await pos(page);
  R.lookLeakM = Math.hypot(pB.x - pA.x, pB.z - pA.z);

  // ── 3. Stick release drift ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(0, 100, 0));
  await waitSim(page, 0.3);
  {
    const a = await toCss(page, 250, 830);
    const b = await toCss(page, 250, 690);   // full "up" deflection
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await waitSim(page, 3.0);
    const before = await pos(page);
    await page.mouse.up();
    await waitSim(page, 1.5);
    const after = await pos(page);
    R.releaseDriftM = Math.hypot(after.x - before.x, after.z - before.z);
    R.stickRunM3s = Math.hypot(before.x - 0, before.z - 100);
  }

  // ── 4. DEAD ZONE: a left-half drag OFF the stick disc must move the player ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(0, 100, 0));
  await waitSim(page, 0.3);
  {
    const a = await toCss(page, 430, 470);   // outside the 330 px capture disc
    const b = await toCss(page, 430, 330);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await waitSim(page, 2.0);
    await page.mouse.up();
    const p2 = await pos(page);
    R.floatStickM = Math.hypot(p2.x - 0, p2.z - 100);
  }

  // ── 5. Jump tap vs hold (JUMP button, variable height) ──
  async function peakY(holdMs) {
    await page.evaluate(() => window.__MW_OVERWORLD.teleport(0, 100, 0));
    await waitSim(page, 0.4);
    const y0 = (await pos(page)).y;
    const j = await toCss(page, 1250, 870);
    await page.mouse.move(j.x, j.y);
    await page.mouse.down();
    if (holdMs) await page.waitForTimeout(holdMs);
    await page.mouse.up();
    let peak = 0;
    const t0 = await simTime(page);
    for (;;) {
      const t = await simTime(page);
      const y = (await pos(page)).y;
      peak = Math.max(peak, y - y0);
      if (t - t0 > 1.6) break;
      await page.waitForTimeout(60);
    }
    return peak;
  }
  R.jumpTapM = await peakY(0);
  R.jumpHoldM = await peakY(1100);

  // ── 6. Keyboard parity: W for 1.5 sim-s ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(0, 100, 0));
  await waitSim(page, 0.3);
  await page.keyboard.down('w');
  await waitSim(page, 1.5);
  await page.keyboard.up('w');
  const pw = await pos(page);
  R.keyboardWM = Math.hypot(pw.x - 0, pw.z - 100);

  // ── 7. The verb surface: visible interactive objects at spawn ──
  R.interactive = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s.children.list
      .filter((o) => o.input && o.input.enabled && o.visible)
      .map((o) => `${o.type}@${Math.round(o.x)},${Math.round(o.y)}`);
  });

  // ── 8. Ability + swap fire end to end ──
  R.chipBefore = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s.app.abilityChip();
  });
  R.statsBefore = await page.evaluate(() => window.__MW_OVERWORLD.abilityStats());
  await page.keyboard.press('q');
  await waitSim(page, 0.3);
  R.afterSwap = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { chip: s.app.abilityChip(), party: s.app.partyChips().map((c) => ({ id: c.id, active: c.active })) };
  });
  await page.keyboard.press('f');
  await waitSim(page, 0.4);
  R.afterAbility = await page.evaluate(() => window.__MW_OVERWORLD.abilityStats());

  // ── 9. Compass HUD ──
  R.compass = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return { text: s._compass?.label?.text, shown: s._compass?.shown, rot: s._compass?.arrow?.rotation };
  });

  // ── 10. Beacon screenshot from spawn area ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(6, 158, Math.PI));
  await waitSim(page, 1.0);
  await page.screenshot({ path: '.forensics/verify-beacons.png' });

  // ── 11. Portal end-to-end: prompt -> E -> dialogue -> floor opens ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(10, 137, Math.PI));
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s._promptBtn;
  }, null, { timeout: 60_000 });
  R.nearPortalApi = await page.evaluate(() => window.__MW_OVERWORLD.getNearPortal());
  R.nearActionKind = await page.evaluate(() => window.__MW_OVERWORLD.getNearActionKind());
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s.dialogue?.active || s.floorId === 1;
  }, null, { timeout: 60_000 });
  // Tap through the entry dialogue (tap-anywhere advances).
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return s.floorId === 1;
    });
    if (done) break;
    const c = await toCss(page, 720, 540);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(350);
  }
  await page.waitForFunction(() => window.__MW_OVERWORLD.activeFloor() === 1, null, { timeout: 60_000 });
  R.floorOpened = await page.evaluate(() => ({
    floor: window.__MW_OVERWORLD.activeFloor(),
    stats: window.__MW_OVERWORLD.stats(),
  }));

  R.pageErrors = errors;
  console.log(`VERIFY-RESULT ${JSON.stringify(R, null, 1)}`);

  expect(R.dragYawDeg).toBeLessThan(90);            // was 179°
  expect(R.dragYawDeg).toBeGreaterThan(25);         // still turns usefully
  expect(R.lookLeakM).toBeLessThan(0.3);            // look never moves the hero
  expect(R.releaseDriftM).toBeLessThan(1.0);        // was 1.57 m
  expect(R.floatStickM).toBeGreaterThan(3);         // was 0 (dead zone)
  expect(R.jumpHoldM).toBeGreaterThan(R.jumpTapM * 1.3);
  expect(R.keyboardWM).toBeGreaterThan(6);
  expect(R.chipBefore?.verb).toBeTruthy();          // ability chip exists
  expect(R.afterSwap.party.filter((c) => c.active)[0].id).not.toBe('knight-shadow');
  expect(R.compass.shown).toBe(true);
  expect(R.compass.text).toMatch(/FLOOR \d+ · \d+m/);
  expect(R.nearActionKind).toBe('portal');
  expect(R.floorOpened.floor).toBe(1);
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('ENTER with a small party redirects instead of crashing', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await boot(page, seededSave(1));
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(10, 137, Math.PI));
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s._promptBtn;
  }, null, { timeout: 60_000 });
  await page.keyboard.press('e');
  // The fix: a flash, then a guarded transition to Party Select. No throw.
  await page.waitForFunction(
    () => window.__MW.game.scene.isActive('PartySelectScene'),
    null, { timeout: 30_000 },
  );
  console.log(`VERIFY-NOPARTY ${JSON.stringify({ redirected: true, pageErrors: errors })}`);
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});
