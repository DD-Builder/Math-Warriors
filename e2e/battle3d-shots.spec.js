/**
 * battle3d-shots — PROOF, in pixels, that the fight happens IN THE WORLD.
 *
 * The claim being tested is not "a battle started". It is:
 *
 *   THE 2D BattleScene NEVER RUNS.
 *
 * Before this spec existed, walking into a monster inside a 3D floor did a
 * scene transition to the flat sprite battle — the single loudest "two games
 * stapled together" moment in the product. So every assertion below is written
 * to fail LOUDLY if that transition comes back:
 *
 *   · the live Phaser scene list is captured at the instant of the shot and
 *     asserted not to contain 'BattleScene' (nor 'MazeScene', nor 'CutsceneScene');
 *   · OverworldScene is asserted to still own the screen;
 *   · the 3D renderer is asserted to have drawn the captured frame, with real
 *     geometry in it;
 *   · window.__MW_OVERWORLD.battleActive() — which only battle3d can make
 *     true — is asserted true at capture time.
 *
 * And the encounter is entered THROUGH THE GAME. Nothing here calls
 * _startBattle. The hero is teleported onto a monster tile's own world
 * coordinates, read live from the scene's rule objects, and the WORLD's
 * proximity check is what fires onFloorTrigger → _interact → the battle seam.
 * If the seam were still wired to the 2D scene, the same walk would produce a
 * BattleScene and every assertion here would fail.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'e2e/screenshots/level3d';
const MIN_BYTES = 20 * 1024;
const FLOOR = 1;

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

// Software GL, a whole floor built behind a real portal walk, and a fight
// staged on top of it. This is a screenshot rig, not a perf test.
test.setTimeout(20 * 60 * 1000);

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

/** A real tap, with frames between press and release (see level3d-shots). */
async function tap(page, pt) {
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(220);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.up();
  await page.waitForTimeout(220);
}

async function dismissDialogue(page) {
  const centre = await page.evaluate(() => {
    const b = window.__MW.game.scale.canvasBounds;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  for (let i = 0; i < 40; i++) {
    const active = await page.evaluate(() =>
      !!window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active);
    if (!active) return true;
    await tap(page, centre);
  }
  return false;
}

/** Walk into floor `floorId`'s arch and press ENTER, as a child would. */
async function enterFloorThroughPortal(page, floorId) {
  const portal = await page.evaluate(
    (f) => window.__MW_OVERWORLD.portals().find((p) => p.floorId === f) || null, floorId);
  expect(portal, `floor ${floorId} has a gate`).toBeTruthy();

  await page.evaluate((p) => window.__MW_OVERWORLD.teleport(p.x, p.z, 0), portal);
  await page.waitForFunction((id) => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && s._nearPortal?.id === id && !!s._promptBtn;
  }, portal.id, { timeout: 90_000 });

  const pt = await pagePointOf(page, (game) =>
    game.scene.getScene('OverworldScene')._promptBtn.zone);
  await tap(page, pt);

  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && (s.dialogue?.active === true || s.floorId !== null);
  }, null, { timeout: 90_000 });
  await dismissDialogue(page);

  await page.waitForFunction((f) => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!s && s.floorId === f && window.__MW_OVERWORLD.activeFloor() === f;
  }, floorId, { timeout: 120_000 });
  await page.waitForTimeout(1200);
}

function setHudVisible(page, on) {
  return page.evaluate((v) => {
    window.__MW.game.canvas.style.visibility = v ? '' : 'hidden';
  }, on);
}

/**
 * Capture, and record the live scene list at the exact instant of the shot so
 * "the 2D battle is not in this picture" is a fact about THIS image.
 */
async function capture(page, name) {
  const at = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__MW_OVERWORLD.renderOnce();
    return {
      scenes: window.__MW.game.scene.getScenes(true).map((s) => s.scene.key),
      activeFloor: window.__MW_OVERWORLD.activeFloor(),
      battleActive: window.__MW_OVERWORLD.battleActive(),
      battlePhase: window.__MW_OVERWORLD.battlePhase(),
      stats: window.__MW_OVERWORLD.stats(),
    };
  });

  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = fs.statSync(file).size;

  // THE ASSERTION THIS WHOLE SPEC EXISTS FOR.
  expect(at.scenes, `${name}: the 2D BattleScene must NOT be running`).not.toContain('BattleScene');
  expect(at.scenes, `${name}: no 2D maze either`).not.toContain('MazeScene');
  expect(at.scenes, `${name}: no cutscene took the screen`).not.toContain('CutsceneScene');
  expect(at.scenes, `${name}: the overworld still owns the screen`).toContain('OverworldScene');
  expect(at.stats.drawCalls, `${name}: the 3D renderer drew this frame`).toBeGreaterThan(0);
  expect(at.stats.triangles, `${name}: real geometry in frame`).toBeGreaterThan(1000);
  expect(bytes, `${name}: ${bytes} bytes`).toBeGreaterThan(MIN_BYTES);

  console.log(`  ${name.padEnd(22)} ${String(bytes).padStart(7)} B  `
    + `floor=${at.activeFloor}  battle=${at.battlePhase}  draws=${at.stats.drawCalls}`);
  return { bytes, ...at };
}

test('an encounter inside a 3D floor fights IN THE WORLD — BattleScene never starts', async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootOverworld(page);
  await enterFloorThroughPortal(page, FLOOR);

  // ── Where do the monsters stand? Ask the live floor. ──
  const foe = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    const o = (s.objects || []).find((x) => x.type === 'encounter' && !x.consumed)
      || (s.objects || []).find((x) => x.type === 'boss' && !x.consumed);
    return o ? { type: o.type, x: o.worldX, z: o.worldZ } : null;
  });
  expect(foe, `floor ${FLOOR} has something to fight`).toBeTruthy();
  expect(Number.isFinite(foe.x) && Number.isFinite(foe.z),
    'the rule object carries its world position').toBe(true);

  // ── Walk into it. The WORLD's proximity check fires the encounter; this
  //    spec never calls _startBattle. ──
  await page.evaluate((f) => window.__MW_OVERWORLD.teleport(f.x, f.z, 0), foe);

  await page.waitForFunction(() => window.__MW_OVERWORLD.battleActive() === true,
    null, { timeout: 120_000 });

  // The fight is a CAMERA MOVE, not a scene: nothing was started or stopped.
  const duringSweep = await page.evaluate(() =>
    window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
  expect(duringSweep, 'no 2D battle scene was launched').not.toContain('BattleScene');

  // ── Let the sweep land and the question band come up. ──
  await page.waitForFunction(() => {
    const p = window.__MW_OVERWORLD.battlePhase();
    return p === 'command' || p === 'question' || p === 'heroAttack';
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => window.__MW_OVERWORLD.battleState());
  expect(state, 'the fight has rules state').toBeTruthy();
  expect(state.party.length, 'the whole party is on stage').toBeGreaterThan(0);
  expect(state.enemies.length, 'and something to fight').toBeGreaterThan(0);

  // THE SHOT: the 3D battle, with the 2D maths overlay on top of it.
  const shot = await capture(page, 'battle-3d');
  expect(shot.battleActive, 'the battle owns the camera in this frame').toBe(true);
  expect(shot.activeFloor, 'and it is happening inside floor 1').toBe(FLOOR);

  // The same frame without the Phaser layer: the fight itself, in the world.
  await setHudVisible(page, false);
  await capture(page, 'battle-3d-world');
  await setHudVisible(page, true);

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
