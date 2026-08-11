/**
 * level3d-shots — PROOF, in pixels, that a floor is a 3D place now.
 *
 * The other overworld specs assert numbers. This one exists to be LOOKED AT,
 * and its whole value depends on one rule:
 *
 *   THE FLOOR IS ENTERED THROUGH THE GAME.
 *
 * Not `scene.start('MazeScene')`, and not `scene._openFloor(n)` either —
 * _openFloor is downstream of the decision and would happily build a floor the
 * player could never legally reach. Every floor below is entered exactly the
 * way a child enters it:
 *
 *   1. the hero is put on the island and WALKED INTO an arch (teleport to the
 *      gate's own coordinates, read live from the world via api.portals(), so
 *      this spec cannot drift from worldSpec.js);
 *   2. the world's own proximity check notices — nothing here reaches in and
 *      sets it — and fires hooks.onPortalNear, which is what raises
 *      OverworldScene's "ENTER — FLOOR n" button;
 *   3. that button is CLICKED with a real mouse at its real screen position,
 *      which runs _enterPortal() → routePortal() (party gate, lock gate,
 *      entry cutscene) → _openFloor();
 *   4. the entry cutscene that routePortal returns is dismissed by tapping
 *      the dialogue overlay, again with a real mouse;
 *   5. LEAVE is clicked to come back out, so the next floor starts from the
 *      island exactly as the player would.
 *
 * If any link in that chain were broken — if the portal still routed to the 2D
 * maze, if the party gate refused, if the level failed to build — the click
 * would produce no floor and every assertion below would fail. That is the
 * point: these screenshots cannot be produced by a game that falls back to 2D.
 *
 * The Phaser HUD canvas is hidden for the "world" frames (visibility, NOT
 * display — the 3D renderer mirrors that canvas's layout rect) so the image is
 * the rendered floor rather than a joystick; a second frame per floor is taken
 * with the HUD restored, which is what the player actually sees. Both are
 * asserted to be >20KB, and MazeScene is asserted absent from the live scene
 * list at the instant of every capture.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'e2e/screenshots/level3d';
const FLOORS = [1, 4, 8];
const MIN_BYTES = 20 * 1024;

/** Every shot taken, with the scene list that was live when it was taken. */
const shots = [];

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

// Building three separate floors under software GL, each behind a real portal
// walk and a real cutscene, is minutes of work — and it is a screenshot rig,
// not a perf test.
test.setTimeout(20 * 60 * 1000);

function seededSave() {
  return {
    version: 1,
    grade: 3,
    // routePortal's party gate is `length >= 3` — a shorter party would be
    // bounced to PartySelect and no floor would ever open.
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    gold: 120,
    potions: 3,
    // Unlocked, because a locked gate is refused by routePortal — as it should
    // be. This spec proves the door opens, not that the lock is missing.
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

/** Boot the 3D overworld with a save that can legally open every gate. */
async function bootOverworld(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    // A previous run's floor progress would suppress the entry cutscene and
    // silently change which code path this spec exercises.
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

/**
 * Page coordinates of a Phaser game object, so it can be clicked for real.
 * Phaser is in FIT scale mode, so game space and page space differ by
 * `scale.displayScale` about `scale.canvasBounds`.
 */
async function pagePointOf(page, getter) {
  return page.evaluate((src) => {
    const game = window.__MW.game;
    // eslint-disable-next-line no-new-func
    const obj = new Function('game', `return (${src})(game);`)(game);
    if (!obj) return null;
    const b = game.scale.canvasBounds;
    const d = game.scale.displayScale;
    return { x: b.x + obj.x / d.x, y: b.y + obj.y / d.y };
  }, getter.toString());
}

/**
 * A real tap, with FRAMES BETWEEN PRESS AND RELEASE.
 *
 * page.mouse.click() dispatches mousedown and mouseup back to back. Phaser
 * settles pointer state once per game frame, and under software GL this world
 * renders at single-digit fps — so both halves of a click land inside one
 * frame and the button, which fires its handler on pointerUP, never sees a
 * release. A human thumb is never that fast. Neither is this.
 */
async function tap(page, pt) {
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(220);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.up();
  await page.waitForTimeout(220);
}

/**
 * Swing the camera by dragging the RIGHT HALF of the screen — the same gesture
 * controls3d gives the player (createLookInput only owns pointers past
 * GAME_WIDTH * 0.5, and converts drag pixels to yaw at lookScaleX rad/px).
 *
 * The drag is broken into many small steps with a wait between each, because
 * the orbit integrates per FRAME: one giant jump would be a single delta and
 * would also trip the flick cap.
 */
async function dragCamera(page, radians) {
  const geom = await page.evaluate(() => {
    const g = window.__MW.game;
    const b = g.scale.canvasBounds;
    return { bx: b.x, by: b.y, bw: b.width, bh: b.height, dsx: g.scale.displayScale.x };
  });
  // rad -> game px -> page px. lookScaleX is 0.0062 rad per game px.
  const gamePx = radians / 0.0062;
  const pagePx = gamePx / geom.dsx;

  // Start well inside the right half and high enough to clear JUMP/ACTION,
  // which keep their own margin against being panned by mistake.
  const y = geom.by + geom.bh * 0.28;
  const x1 = geom.bx + geom.bw * 0.94;
  const x0 = x1 - pagePx;
  expect(x0, 'the drag stays inside the camera half of the screen')
    .toBeGreaterThan(geom.bx + geom.bw * 0.52);

  await page.mouse.move(x1, y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  const STEPS = 16;
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(x1 + (x0 - x1) * (i / STEPS), y);
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** Wheel the boom all the way in — controls3d clamps it at zoomMin (0.62). */
async function wheelZoomIn(page) {
  const centre = await page.evaluate(() => {
    const b = window.__MW.game.scale.canvasBounds;
    return { x: b.x + b.width * 0.75, y: b.y + b.height * 0.4 };
  });
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
}

/** Tap the dialogue overlay (with a real mouse) until it closes. */
async function dismissDialogue(page) {
  const centre = await page.evaluate(() => {
    const game = window.__MW.game;
    const b = game.scale.canvasBounds;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  for (let i = 0; i < 40; i++) {
    const active = await page.evaluate(() =>
      !!window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active);
    if (!active) return true;
    // Two taps per beat: the first completes the typing, the second advances.
    await tap(page, centre);
  }
  return page.evaluate(() =>
    !window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active);
}

/**
 * Walk into floor `floorId`'s arch and press ENTER. Returns what the game
 * built, or throws if the chain broke anywhere.
 */
async function enterFloorThroughPortal(page, floorId) {
  // ── 1. Where does this floor's gate stand? Ask the live world. ──
  const portal = await page.evaluate(
    (f) => window.__MW_OVERWORLD.portals().find((p) => p.floorId === f) || null,
    floorId,
  );
  expect(portal, `floor ${floorId} has a gate on the island`).toBeTruthy();

  // ── 2. Walk the hero into it. ──
  await page.evaluate((p) => window.__MW_OVERWORLD.teleport(p.x, p.z, 0), portal);

  // ── 3. The WORLD notices, and the scene raises its ENTER button. Nothing
  //       in this spec sets _nearPortal; if proximity were broken this hangs.
  await page.waitForFunction((id) => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && s._nearPortal?.id === id && !!s._promptBtn;
  }, portal.id, { timeout: 90_000 });

  const label = await page.evaluate(() =>
    window.__MW.game.scene.getScene('OverworldScene')._promptBtn.label.text);
  expect(label, 'the gate offers the right floor').toBe(`ENTER — FLOOR ${floorId}`);

  // ── 4. Press it, for real. This is the player's click. ──
  const pt = await pagePointOf(page, (game) =>
    game.scene.getScene('OverworldScene')._promptBtn.zone);
  expect(pt, 'the ENTER button has a screen position').toBeTruthy();
  await tap(page, pt);

  // ── 5. routePortal handed back entry lines; play them out in place. ──
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && (s.dialogue?.active === true || s.floorId !== null);
  }, null, { timeout: 90_000 });
  await dismissDialogue(page);

  // ── 6. The floor is open — as a place, inside this same world. ──
  await page.waitForFunction((f) => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && s.floorId === f && window.__MW_OVERWORLD.activeFloor() === f;
  }, floorId, { timeout: 120_000 });

  // Let the follow camera settle onto the floor's spawn before anyone looks.
  await page.waitForTimeout(1200);

  return page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return {
      floorId: s.floorId,
      objective: s._floorHud?.objText?.text ?? null,
      objects: s.objects?.length ?? 0,
      floorStats: window.__MW_OVERWORLD.floorStats(),
      frame: window.__MW_OVERWORLD.stats(),
      hero: window.__MW_OVERWORLD.worldStats().hero,
    };
  });
}

/** Click LEAVE, the way the player does, and land back on the island. */
async function leaveFloorThroughHud(page) {
  const pt = await pagePointOf(page, (game) =>
    game.scene.getScene('OverworldScene')._floorHud?.leaveBtn?.zone);
  expect(pt, 'the floor HUD offers LEAVE').toBeTruthy();
  await tap(page, pt);
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && s.floorId === null && window.__MW_OVERWORLD.activeFloor() === null;
  }, null, { timeout: 90_000 });
}

/** The live Phaser scene list — the 2D-fallback detector. */
function liveScenes(page) {
  return page.evaluate(() =>
    window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
}

/** Show/hide the Phaser HUD canvas without disturbing its layout rect. */
function setHudVisible(page, on) {
  return page.evaluate((v) => {
    window.__MW.game.canvas.style.visibility = v ? '' : 'hidden';
  }, on);
}

/**
 * Render a settled frame and capture it, recording the live scene list at the
 * instant of the shot so "no 2D maze is in this picture" is a fact about THIS
 * image, not a fact about some earlier moment.
 */
async function capture(page, name, note) {
  const at = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__MW_OVERWORLD.renderOnce();
    return {
      scenes: window.__MW.game.scene.getScenes(true).map((s) => s.scene.key),
      activeFloor: window.__MW_OVERWORLD.activeFloor(),
      stats: window.__MW_OVERWORLD.stats(),
    };
  });

  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  shots.push({ name, file, bytes, note, ...at });

  // Every frame in this folder is a frame of the 3D world.
  expect(at.scenes, `${name}: 2D MazeScene must not be running`).not.toContain('MazeScene');
  expect(at.scenes, `${name}: the overworld owns the screen`).toContain('OverworldScene');
  expect(at.stats.drawCalls, `${name}: the 3D renderer drew this frame`).toBeGreaterThan(0);
  expect(at.stats.triangles, `${name}: real geometry in frame`).toBeGreaterThan(1000);
  expect(bytes, `${name}: ${bytes} bytes — a blank canvas would be tiny`).toBeGreaterThan(MIN_BYTES);
  console.log(`  ${name.padEnd(22)} ${String(bytes).padStart(7)} B  `
    + `floor=${at.activeFloor}  draws=${at.stats.drawCalls}  tris=${at.stats.triangles}`);
  return { bytes, ...at };
}

test('floors 1, 4 and 8 open as 3D places when the player walks through the gate', async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootOverworld(page);

  // Baseline: the island itself, before any gate is touched.
  await setHudVisible(page, false);
  await capture(page, '00-island', 'the hub, before any gate');
  await setHudVisible(page, true);

  for (const floorId of FLOORS) {
    const built = await enterFloorThroughPortal(page, floorId);

    // The floor is real: geometry, rule objects, and the SHARED objective
    // line (floorRules.objectiveText) that the 2D maze reads too.
    expect(built.floorId).toBe(floorId);
    expect(built.objects, `floor ${floorId} has rule objects`).toBeGreaterThan(0);
    expect(built.floorStats, `floor ${floorId} has 3D geometry`).toBeTruthy();
    expect(built.floorStats.triangleCount).toBeGreaterThan(0);
    expect(built.objective, `floor ${floorId} shows an objective`).toBeTruthy();

    // The world frame, HUD hidden.
    await setHudVisible(page, false);
    const shot = await capture(page, `floor-${floorId}-world`, built.objective);
    expect(shot.activeFloor).toBe(floorId);

    // And what the player actually sees, HUD and all.
    await setHudVisible(page, true);
    await capture(page, `floor-${floorId}-hud`, built.objective);

    await leaveFloorThroughHud(page);
  }

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('hero close-up: the real party-leader rig, standing inside a 3D floor', async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootOverworld(page);
  await enterFloorThroughPortal(page, 1);

  // The rig, not a capsule: the party leader's own hero id and class, at human
  // scale, with the seven animated nodes heroRig.js builds.
  const hero = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().hero);
  expect(hero.heroId, 'the hero is the party leader').toBe('knight-shadow');
  expect(hero.heroClass).toBe('knight');
  expect(hero.height).toBeGreaterThan(1.5);
  expect(hero.height).toBeLessThan(2.0);
  expect(hero.nodes, 'seven animated rig nodes').toBe(7);

  // ── Swing the camera round to his face, and pull the boom in. ──
  //
  // Driven as a DRAG and a WHEEL, not by setting the orbit: OverworldScene
  // re-pushes controls3d's orbit into the 3D rig on every frame, so anything
  // written straight to the camera is overwritten on the next tick. This is
  // the player's right-half drag and the player's pinch-zoom.
  const yawBefore = await page.evaluate(() => window.__MW_OVERWORLD.getCameraYaw());
  await dragCamera(page, Math.PI);
  await wheelZoomIn(page);
  // zoomEase is a per-frame ease and this world renders at single-digit fps —
  // give the boom time to actually arrive before looking through it.
  await page.waitForTimeout(4000);

  const cam = await page.evaluate(() => ({
    yaw: window.__MW_OVERWORLD.getCameraYaw(),
    facing: window.__MW_OVERWORLD.getFacing(),
  }));
  // The drag really moved the eye — a static third-person shot would leave it
  // sitting on the hero's facing.
  const swung = Math.abs(Math.atan2(Math.sin(cam.yaw - yawBefore), Math.cos(cam.yaw - yawBefore)));
  expect(swung, 'the drag swung the camera most of a half-turn').toBeGreaterThan(2.0);

  await setHudVisible(page, false);
  const shot = await capture(page, 'hero-closeup', `${hero.heroId} / ${hero.heroClass}`);
  expect(shot.activeFloor, 'the close-up is taken inside floor 1').toBe(1);

  await setHudVisible(page, true);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test.afterAll(() => {
  if (!shots.length) return;
  console.log('\n  ── level3d screenshots ──');
  for (const s of shots) {
    const ok = s.bytes > MIN_BYTES && !s.scenes.includes('MazeScene');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${s.file.padEnd(40)} `
      + `${String(s.bytes).padStart(7)} B  floor=${s.activeFloor}  `
      + `scenes=[${s.scenes.join(',')}]`);
  }
});
