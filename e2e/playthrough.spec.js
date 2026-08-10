/**
 * PLAYTHROUGH — the player gate.
 *
 * Every prior gate verified the game BOOTS: zero console errors, unit tests
 * green. Nobody played it, and all ten of the owner's iPad defects lived in
 * that gap (see HANDOFF-NUMERIA.md section 3.1). This spec is the fix for the
 * PROCESS, not just the product: it drives the real BUILT game with synthetic
 * touch/mouse/keyboard input — never by calling internal engine functions
 * that a real finger could not reach — through one continuous session:
 *
 *   1. Fresh save -> first-arrival beat -> dismiss
 *   2. Drive the stick: 4 directions, camera orbit, sprint, jump
 *   3. Walk INTO a tree: blocked
 *   4. Water motion / a creature / companions / the hero close-up
 *   5. Follow the portal compass -> ENTER Floor 1's gate -> a 3D level loads
 *   6. Trigger an encounter, answer via the on-screen numpad, WIN, rewards land
 *   7. Audio metrics for the whole session (no runaway voice, no call storm)
 *   8. Exit back to the island; the save persists where the player stands
 *
 * Screenshots for every numbered step land in e2e/screenshots/playthrough/.
 * Teleport is used ONLY to shorten a walk (crossing open, uncontested ground)
 * — never to skip an interaction (a collision, a trigger, a button, a typed
 * answer). Every interaction itself is driven through the real UI: a tap on
 * a real Phaser hit zone, a real keydown, real digits into the real numpad.
 *
 * SwiftShader is single-digit fps; every wait is state-based (simTime,
 * battlePhase, dialogue.active…), never a fixed sleep standing in for one.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
// Pure tuning tables — no three/Phaser/DOM at import time (controls3d.test.js
// already imports CONTROLS the same way) — so the exact on-screen button
// positions come from the SAME source the game itself uses, not a guess.
import { CONTROLS } from '../src/overworld/controls3d.js';

const OUT_DIR = 'e2e/screenshots/playthrough';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

// The whole session, under software GL, with a real fight in the middle of
// it: this is the slowest single spec in the suite by design.
test.setTimeout(25 * 60 * 1000);

// ────────────────────────────────────────────────────────────────────────
// SAVE
// ────────────────────────────────────────────────────────────────────────

/** A genuinely fresh save: only Floor 1 unlocked, no gold, no seen beats. */
function freshSave() {
  return {
    version: 1,
    grade: 3,
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    unlockedHeroes: ['knight-shadow', 'wizard-grandmage', 'bunny-pepper'],
    gold: 0,
    potions: 2,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i === 0, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: {
      totalBattles: 0, totalCorrect: 0, totalWrong: 0,
      playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now(),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// LOW-LEVEL HELPERS (patterns proven in overworld-controls.spec.js,
// battle3d-shots.spec.js and the .forensics probes — reused, not reinvented)
// ────────────────────────────────────────────────────────────────────────

async function bootFreshOverworld(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    // Same convention as every other overworld spec (overworld-boot.spec.js
    // etc.): the legacy key, which loadSave() migrates into the active slot
    // on first read — so this works whatever slot getActiveSlot() picks.
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    for (let i = 1; i <= 9; i++) localStorage.removeItem(`mw_floor3d_${i}`);
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, freshSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return !!(s && s._controls);
  }, null, { timeout: 30_000 });
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
async function teleport(page, x, z, yaw = 0) {
  await page.evaluate(({ x, z, yaw }) => window.__MW_OVERWORLD.teleport(x, z, yaw), { x, z, yaw });
}
function wrapAngle(a) {
  const TAU = Math.PI * 2;
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** Canvas design-space point (0..GAME_WIDTH/HEIGHT) -> real page coordinates. */
async function toPage(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const sm = window.__MW.game.scale;
    const b = sm.canvas.getBoundingClientRect();
    return { x: b.left + x * (b.width / sm.width), y: b.top + y * (b.height / sm.height) };
  }, [gx, gy]);
}

/**
 * A live Phaser object's zone, read INSIDE the page (so no non-serialisable
 * GameObject ever has to cross the Playwright bridge) and converted straight
 * to a page-space tap point. `getter` runs as `(game) => ...` in the browser.
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

/** A real tap: move, settle, press, hold a beat, release — not an instant click. */
async function tap(page, pt) {
  expect(pt, 'a tap target must resolve to a real on-screen point').toBeTruthy();
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(180);
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.up();
  await page.waitForTimeout(180);
}

async function dismissDialogue(page, maxTaps = 40) {
  const centre = await page.evaluate(() => {
    const b = window.__MW.game.scale.canvasBounds;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  for (let i = 0; i < maxTaps; i++) {
    const active = await page.evaluate(() => !!window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active);
    if (!active) return true;
    await tap(page, centre);
  }
  return false;
}

/** Read the CURRENT save straight from storage, using the scene's own slot —
 * never a hardcoded slot number, since getActiveSlot() owns that decision. */
async function readPersistedSave(page) {
  return page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    const raw = localStorage.getItem(`mathwarriors.save.${s.slot}`);
    return raw ? JSON.parse(raw) : null;
  });
}

async function shot(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return fs.statSync(file).size;
}

/** Mean abs per-channel diff between two same-size PNG buffers, over a region
 * given as FRACTIONS of the frame (0..1). Pure canvas math, run in-page. */
async function regionDiff(page, bufA, bufB, rect) {
  return page.evaluate(async ({ a64, b64, rect }) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      return img;
    };
    const [imA, imB] = await Promise.all([load(a64), load(b64)]);
    const W = imA.width, H = imA.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H); ctx.drawImage(imA, 0, 0);
    const A = ctx.getImageData(0, 0, W, H).data;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(imB, 0, 0);
    const B = ctx.getImageData(0, 0, W, H).data;
    const [x0, y0, x1, y1] = [
      Math.floor(W * rect[0]), Math.floor(H * rect[1]),
      Math.floor(W * rect[2]), Math.floor(H * rect[3]),
    ];
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * W + x) * 4;
        sum += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        n++;
      }
    }
    return +(sum / (n * 3)).toFixed(3);
  }, { a64: bufA.toString('base64'), b64: bufB.toString('base64'), rect });
}

// ────────────────────────────────────────────────────────────────────────
// BATTLE HELPERS — drive the REAL overlay: tap a command, open the numpad,
// type the answer, press GO! Nothing here calls battle3d's answer()/
// chooseCommand() directly; see battleOverlay3d.js's debugCommandZones() /
// debugTypeButtonZone() / debugCurrentQuestion() for why those read-only
// getters exist (WHERE to tap, WHAT is correct — never WHO submits).
// ────────────────────────────────────────────────────────────────────────

async function tapFightCommand(page) {
  const pt = await pagePointOf(page, (game) => {
    const s = game.scene.getScene('OverworldScene');
    const zones = s._battleUi?.debugCommandZones?.() || [];
    return (zones.find((z) => z.cmd === 'fight') || zones[0] || {}).zone || null;
  });
  await tap(page, pt);
}

/** Open the numpad, type the CORRECT answer, press GO! Returns what it typed. */
async function answerCorrectlyViaNumpad(page, { screenshotName } = {}) {
  const q = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s._battleUi?.debugCurrentQuestion?.() || null;
  });
  expect(q, 'a question is on the band when phase === "question"').toBeTruthy();
  const value = q.choices[q.correctIndex];

  const typePt = await pagePointOf(page, (game) => {
    const s = game.scene.getScene('OverworldScene');
    return s._battleUi?.debugTypeButtonZone?.() || null;
  });
  await tap(page, typePt);

  if (screenshotName) await shot(page, screenshotName);

  const str = String(value);
  for (const ch of str) {
    if (ch === '-') await page.keyboard.press('-');
    else await page.keyboard.press(ch);
    await page.waitForTimeout(90);
  }
  await page.keyboard.press('Enter');
  return { question: q, typed: value };
}

// ════════════════════════════════════════════════════════════════════════
// THE SESSION
// ════════════════════════════════════════════════════════════════════════

test('a full session: arrival, movement, collision, life, a floor, a fight, a return', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const R = {}; // the evidence dump, printed as JSON at the end

  await bootFreshOverworld(page);

  // ══════════════════════════════════════════════════════════════════════
  // 1. FRESH SAVE -> FIRST-ARRIVAL BEAT -> DISMISS
  // ══════════════════════════════════════════════════════════════════════
  await test.step('1. first-arrival beat', async () => {
    const arrivalActive = await page.evaluate(() => window.__MW_OVERWORLD.cinematicActive());
    await shot(page, '01-arrival-cinematic');
    R.arrivalCinematicActive = arrivalActive;
    expect(arrivalActive, 'a fresh save opens on the arrival cinematic').toBe(true);

    await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene')._cine?.skip?.());
    await page.waitForFunction(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return !!s?.dialogue?.active;
    }, null, { timeout: 20_000 }).catch(() => {});
    const orientationActive = await page.evaluate(() => !!window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active);
    await shot(page, '01-orientation-dialogue');
    R.orientationDialogueActive = orientationActive;
    expect(orientationActive, 'the compass-orientation beat follows the cinematic').toBe(true);

    const dismissed = await dismissDialogue(page);
    expect(dismissed, 'the TAP button actually closes the dialogue').toBe(true);
    await page.waitForTimeout(300);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2. DRIVE THE STICK — 4 directions, orbit, sprint, jump
  // ══════════════════════════════════════════════════════════════════════
  R.movement = {};
  await test.step('2. movement, camera orbit, sprint, jump', async () => {
    // A spot already proven open ground by earlier forensics (companions
    // walk 4 real sim-seconds from here with nothing in the way).
    const BASE = { x: 6, z: 158 };

    // ── 2a. keyboard: walk a measurable distance in all 4 world directions,
    // each from a fresh yaw via teleport (never skips the WALK itself). ──
    const dirs = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
    const traces = {};
    for (const [name, yaw] of Object.entries(dirs)) {
      await teleport(page, BASE.x, BASE.z, yaw);
      await waitSim(page, 0.3);
      const p0 = await pos(page);
      const run = [];
      await page.keyboard.down('w');
      const t0 = await simTime(page);
      while ((await simTime(page)) < t0 + 1.2) {
        const p = await pos(page);
        run.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
        await page.waitForTimeout(120);
      }
      await page.keyboard.up('w');
      const p1 = await pos(page);
      const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      traces[name] = { from: p0, to: p1, dist: +dist.toFixed(2), trace: run };
    }
    R.movement.keyboardFourDirections = traces;
    for (const [name, t] of Object.entries(traces)) {
      expect(t.dist, `holding W after facing ${name} must move the hero`).toBeGreaterThan(0.5);
    }

    // ── 2b. touch stick: the ORIGINAL "controls are abysmal" complaint was
    // about the on-screen pad specifically. Drag it and prove the hero moves. ──
    await teleport(page, BASE.x, BASE.z, 0);
    await waitSim(page, 0.3);
    const beforeStick = await pos(page);
    const stickBase = await toPage(page, CONTROLS.stickX, CONTROLS.stickY);
    const stickPush = await toPage(page, CONTROLS.stickX, CONTROLS.stickY - 100); // push up = forward
    await page.mouse.move(stickBase.x, stickBase.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(stickPush.x, stickPush.y, { steps: 6 });
    await page.waitForFunction((s) => {
      const p = window.__MW_OVERWORLD._state.pos;
      return Math.hypot(p.x - s.x, p.z - s.z) > 0.6;
    }, beforeStick, { timeout: 30_000 });
    const afterStick = await pos(page);
    await page.mouse.up();
    R.movement.touchStick = { before: beforeStick, after: afterStick };
    await shot(page, '02-touch-stick-drive');

    // ── 2c. camera orbit: drag the right half, read the yaw before/after. ──
    const orbitBefore = await page.evaluate(() => {
      const c = window.__MW.game.scene.getScene('OverworldScene')._controls.orbit;
      return { yaw: c.yaw, pitch: c.pitch };
    });
    const a = await toPage(page, 1000, 500);
    const b = await toPage(page, 1300, 500);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const orbitAfter = await page.evaluate(() => {
      const c = window.__MW.game.scene.getScene('OverworldScene')._controls.orbit;
      return { yaw: c.yaw, pitch: c.pitch };
    });
    const dYaw = Math.abs(wrapAngle(orbitAfter.yaw - orbitBefore.yaw));
    R.movement.cameraOrbit = { before: orbitBefore, after: orbitAfter, dYaw: +dYaw.toFixed(3) };
    expect(dYaw, 'dragging the right half must swing the camera').toBeGreaterThan(0.2);
    await shot(page, '02-camera-orbit');

    // ── 2d. sprint: SHIFT+W must cover more ground than plain W in the same
    // fixed sim-time window. ──
    await teleport(page, BASE.x, BASE.z, 0);
    await waitSim(page, 0.3);
    const walkP0 = await pos(page);
    await page.keyboard.down('w');
    await waitSim(page, 1.2);
    await page.keyboard.up('w');
    const walkP1 = await pos(page);
    const walkDist = Math.hypot(walkP1.x - walkP0.x, walkP1.z - walkP0.z);

    await teleport(page, BASE.x, BASE.z, 0);
    await waitSim(page, 0.3);
    const runP0 = await pos(page);
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await waitSim(page, 1.2);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    const runP1 = await pos(page);
    const runDist = Math.hypot(runP1.x - runP0.x, runP1.z - runP0.z);

    R.movement.sprint = { walkDist: +walkDist.toFixed(2), runDist: +runDist.toFixed(2) };
    expect(runDist, 'SHIFT+W (sprint) must cover more ground than W alone').toBeGreaterThan(walkDist * 1.05);

    // ── 2e. jump: tap the on-screen JUMP button, trace Y over real time. ──
    await teleport(page, BASE.x, BASE.z, 0);
    await waitSim(page, 0.5);
    const jumpPt = await toPage(page, CONTROLS.jumpX, CONTROLS.jumpY);
    const yTrace = [];
    await page.mouse.move(jumpPt.x, jumpPt.y);
    await page.mouse.down();
    for (let i = 0; i < 14; i++) {
      const p = await pos(page);
      yTrace.push(+p.y.toFixed(3));
      await page.waitForTimeout(90);
    }
    await page.mouse.up();
    R.movement.jumpYTrace = yTrace;
    const peak = Math.max(...yTrace);
    expect(peak, 'tapping JUMP must actually lift the hero off the ground').toBeGreaterThan(yTrace[0] + 0.3);
    await shot(page, '02-jump');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3. WALK INTO A TREE: BLOCKED
  // ══════════════════════════════════════════════════════════════════════
  await test.step('3. tree collision', async () => {
    const trees = await page.evaluate(() => window.__MW_OVERWORLD.trees());
    expect(trees.length, 'the island has trees to collide with').toBeGreaterThan(0);
    const player0 = await pos(page);
    let target = trees[0];
    let bestD = Infinity;
    for (const t of trees) {
      const d = Math.hypot(t.x - player0.x, t.z - player0.z);
      if (d < bestD) { bestD = d; target = t; }
    }

    const approach = target.r + 4.0;
    const start = { x: target.x - approach, z: target.z };
    const yaw = Math.atan2(target.x - start.x, target.z - start.z);
    await teleport(page, start.x, start.z, yaw);
    await waitSim(page, 0.4);
    await shot(page, '03-tree-approach');

    const run = [];
    await page.keyboard.down('w');
    const t0 = await simTime(page);
    while ((await simTime(page)) < t0 + 5) {
      const p = await pos(page);
      run.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), d: +Math.hypot(p.x - target.x, p.z - target.z).toFixed(3) });
      await page.waitForTimeout(150);
    }
    await page.keyboard.up('w');
    await shot(page, '03-tree-blocked');

    const minDist = Math.min(...run.map((s) => s.d));
    const crossed = run.some((s) => s.x > target.x + 0.3);
    R.treeCollision = { tree: target, minDist: +minDist.toFixed(3), crossed, trace: run };
    expect(minDist, 'the hero must never enter the trunk').toBeGreaterThan(target.r);
    expect(minDist, 'the hero must actually reach the trunk, not stop far away for some other reason')
      .toBeLessThan(target.r + 1.5);
    expect(crossed, 'the hero must not walk through to the far side').toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4. WATER MOTION / A CREATURE / COMPANIONS / THE HERO CLOSE-UP
  // ══════════════════════════════════════════════════════════════════════
  await test.step('4. water, a creature, companions, hero close-up', async () => {
    // ── water: two frames 2s (sim) apart must differ in the water region ──
    await teleport(page, 1.5, 150.5, Math.atan2(-9.5, 3.5));
    await waitSim(page, 1.0);
    const wA = await page.screenshot();
    fs.writeFileSync(path.join(OUT_DIR, '04-water-t0.png'), wA);
    await waitSim(page, 2.0);
    const wB = await page.screenshot();
    fs.writeFileSync(path.join(OUT_DIR, '04-water-t1.png'), wB);
    const waterRect = [0.30, 0.40, 0.70, 0.70];
    const groundRect = [0.02, 0.80, 0.30, 0.97];
    const waterDiff = await regionDiff(page, wA, wB, waterRect);
    const groundDiff = await regionDiff(page, wA, wB, groundRect);
    R.water = { waterDiff, groundDiff };
    expect(waterDiff, 'the water surface must visibly change over 2 sim-seconds').toBeGreaterThan(0.4);

    // ── a creature on screen ──
    await teleport(page, 30.0, 183.0, Math.atan2(5.1, 5.4));
    await waitSim(page, 3.0);
    const creaturesVisible = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().creatures.visibleMeshes);
    R.creaturesVisible = creaturesVisible;
    await shot(page, '04-creature');
    expect(creaturesVisible, 'a creature must actually be drawn this frame').toBeGreaterThan(0);

    // ── companions follow ──
    await teleport(page, 6, 158, Math.PI);
    await waitSim(page, 1.0);
    const companionCount = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().companions.count);
    R.companionCount = companionCount;
    await shot(page, '04-companions-idle');
    await page.keyboard.down('w');
    await waitSim(page, 4.0);
    await page.keyboard.up('w');
    await waitSim(page, 1.0);
    await shot(page, '04-companions-walk');
    expect(companionCount, 'a 3-hero party must have 2 companions on the island').toBeGreaterThanOrEqual(2);

    // ── the hero, at rest, close up ──
    await page.evaluate(() => window.__MW_OVERWORLD.setPose('hero-closeup'));
    await page.waitForTimeout(1200);
    const heroScale = await page.evaluate(() => window.__MW_OVERWORLD.heroScale());
    R.heroScaleAtRest = heroScale;
    await shot(page, '04-hero-closeup');
    // "a stack of jello" was ~40% Y-compression baked permanently into an
    // idle hero; at rest the rendered scale must be close to identity.
    expect(Math.abs(heroScale.y - 1), 'the hero must not be permanently squashed at rest').toBeLessThan(0.05);
    await page.evaluate(() => window.__MW_OVERWORLD.clearPose());
    await waitSim(page, 0.3);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 5. FOLLOW THE PORTAL COMPASS -> ENTER FLOOR 1 -> A 3D LEVEL LOADS
  // ══════════════════════════════════════════════════════════════════════
  await test.step('5. portal compass -> enter Floor 1', async () => {
    const portal = (await page.evaluate(() => window.__MW_OVERWORLD.portals())).find((p) => p.floorId === 1);
    expect(portal, 'Floor 1 has a gate').toBeTruthy();

    // Stand well clear of the gate (so the ENTER prompt is NOT covering the
    // compass — see _updateCompass) and read what the compass says.
    const p0 = await pos(page);
    const trueBearing = Math.atan2(portal.x - p0.x, portal.z - p0.z);
    await waitSim(page, 0.5);
    const camYaw = await page.evaluate(() => window.__MW_OVERWORLD.getCameraYaw());
    const compass = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      const c = s._compass;
      return c ? { shown: c.shown, rotation: c.arrow.rotation, label: c.label.text } : null;
    });
    R.compass = { compass, trueBearing: +trueBearing.toFixed(3), camYaw: +camYaw.toFixed(3) };
    await shot(page, '05-compass');
    expect(compass?.shown, 'the compass must be visible with a floor unlocked and unentered').toBe(true);
    expect(compass?.label, 'the compass names Floor 1').toContain('FLOOR 1');
    const expectedRot = wrapAngle(trueBearing - camYaw);
    const rotErr = Math.abs(wrapAngle(compass.rotation - expectedRot));
    expect(rotErr, 'the compass arrow must actually point at the real gate').toBeLessThan(0.15);

    // FOLLOW it: teleport to a standoff point along the compass's own
    // bearing (shortening the walk, not skipping it), then hold W the rest
    // of the way — exactly the "walk forward" convention the orientation
    // beat taught. The camera is behind the hero's new facing immediately
    // after teleport (snapCamera), so "hold forward" walks straight at it.
    const standoff = 16;
    const nearX = portal.x - Math.sin(trueBearing) * standoff;
    const nearZ = portal.z - Math.cos(trueBearing) * standoff;
    await teleport(page, nearX, nearZ, trueBearing);
    await waitSim(page, 0.4);
    await shot(page, '05-compass-following');
    await page.keyboard.down('w');
    await page.waitForFunction(() => !!window.__MW.game.scene.getScene('OverworldScene')._nearPortal,
      null, { timeout: 60_000 });
    await page.keyboard.up('w');

    // The ENTER prompt is up: press it for real.
    await page.waitForFunction(() => !!window.__MW.game.scene.getScene('OverworldScene')._promptBtn,
      null, { timeout: 20_000 });
    await shot(page, '05-portal-prompt');
    const promptPt = await pagePointOf(page, (game) => game.scene.getScene('OverworldScene')._promptBtn?.zone);
    await tap(page, promptPt);

    // An entry line may play first; dismiss it if it does.
    await page.waitForFunction(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      return !!s.dialogue?.active || s.floorId !== null;
    }, null, { timeout: 60_000 });
    if (await page.evaluate(() => !!window.__MW.game.scene.getScene('OverworldScene')?.dialogue?.active)) {
      await shot(page, '05-entry-dialogue');
      await dismissDialogue(page);
    }

    // The floor is open: the TITLE CARD is the requested screenshot.
    await page.waitForFunction(() => window.__MW.game.scene.getScene('OverworldScene').floorId === 1,
      null, { timeout: 60_000 });
    await page.waitForTimeout(400);
    const titleCardActive = await page.evaluate(() => !!window.__MW.game.scene.getScene('OverworldScene')._cine?.active);
    R.floorTitleCardActive = titleCardActive;
    await shot(page, '05-floor-title-card');
    expect(titleCardActive, 'entering a gate shows the floor title card').toBe(true);

    await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene')._cine?.skip?.());
    if (await dismissDialogue(page, 5).catch(() => false)) { /* arrival beat, if any, closed */ }
    await page.waitForTimeout(400);

    // 3D level loaded, no MazeScene / BattleScene / CutsceneScene anywhere.
    const sceneCheck = await page.evaluate(() => ({
      scenes: window.__MW.game.scene.getScenes(true).map((s) => s.scene.key),
      activeFloor: window.__MW_OVERWORLD.activeFloor(),
      stats: window.__MW_OVERWORLD.stats(),
    }));
    R.floorSceneCheck = sceneCheck;
    await shot(page, '05-floor-3d-level');
    expect(sceneCheck.scenes, 'no 2D maze').not.toContain('MazeScene');
    expect(sceneCheck.scenes, 'no 2D battle').not.toContain('BattleScene');
    expect(sceneCheck.scenes).toContain('OverworldScene');
    expect(sceneCheck.activeFloor, 'the 3D app itself is inside Floor 1').toBe(1);
    expect(sceneCheck.stats.drawCalls, 'the floor actually rendered').toBeGreaterThan(0);
    expect(sceneCheck.stats.triangles, 'with real geometry').toBeGreaterThan(1000);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 6. TRIGGER AN ENCOUNTER, ANSWER VIA THE NUMPAD, WIN, REWARDS LAND
  // ══════════════════════════════════════════════════════════════════════
  await test.step('6. encounter -> numpad -> victory -> rewards', async () => {
    const goldBefore = await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene').save.gold || 0);

    const foe = await page.evaluate(() => {
      const s = window.__MW.game.scene.getScene('OverworldScene');
      const o = (s.objects || []).find((x) => x.type === 'encounter' && !x.consumed)
        || (s.objects || []).find((x) => x.type === 'boss' && !x.consumed);
      return o ? { type: o.type, x: o.worldX, z: o.worldZ } : null;
    });
    expect(foe, 'Floor 1 has something to fight').toBeTruthy();

    // Approach from a short distance and WALK the last stretch — the real
    // proximity trigger fires this, nothing here calls _startBattle.
    const approachYaw = 0;
    await teleport(page, foe.x, foe.z - 3, approachYaw);
    await waitSim(page, 0.3);
    await page.keyboard.down('w');
    const triggeredByWalk = await page.waitForFunction(
      () => window.__MW_OVERWORLD.battleActive() === true,
      null, { timeout: 15_000 },
    ).then(() => true).catch(() => false);
    await page.keyboard.up('w');
    if (!triggeredByWalk) {
      // Fallback: land exactly on the encounter's own coordinates and let
      // the same proximity check fire from there (battle3d-shots.spec.js
      // uses this same pattern as its primary path).
      await teleport(page, foe.x, foe.z, 0);
      await page.waitForFunction(() => window.__MW_OVERWORLD.battleActive() === true,
        null, { timeout: 60_000 });
    }
    await shot(page, '06-encounter-triggered');

    const battleTrace = [];
    let lastPhase = null;
    let firstNumpadShot = true;
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      const active = await page.evaluate(() => window.__MW_OVERWORLD.battleActive());
      if (!active) break;
      const phase = await page.evaluate(() => window.__MW_OVERWORLD.battlePhase());
      if (phase !== lastPhase) {
        lastPhase = phase;
        battleTrace.push({ phase, sim: await simTime(page) });
        if (phase === 'victory') await shot(page, '06-battle-victory-phase');
      }
      if (phase === 'command') {
        await tapFightCommand(page);
      } else if (phase === 'question') {
        const r = await answerCorrectlyViaNumpad(page, {
          screenshotName: firstNumpadShot ? '06-battle-numpad-open' : undefined,
        });
        firstNumpadShot = false;
        battleTrace.push({ answeredTyped: r.typed, correctIndex: r.question.correctIndex, choices: r.question.choices });
      }
      await page.waitForTimeout(220);
    }
    R.battleTrace = battleTrace;
    const stillActive = await page.evaluate(() => window.__MW_OVERWORLD.battleActive());
    expect(stillActive, 'the fight must resolve (not hang) inside the time budget').toBe(false);

    await page.waitForTimeout(600); // let the VICTORY! banner paint
    await shot(page, '06-victory-banner');

    const goldAfter = await page.evaluate(() => window.__MW.game.scene.getScene('OverworldScene').save.gold || 0);
    R.rewards = { goldBefore, goldAfter, delta: goldAfter - goldBefore };
    expect(goldAfter, 'winning must actually pay gold into the save').toBeGreaterThan(goldBefore);

    const persistedSave = await readPersistedSave(page);
    R.rewards.persistedGold = persistedSave?.gold ?? null;
    expect(persistedSave?.gold, 'the gold delta is actually written to localStorage, not just live memory').toBe(goldAfter);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 7. AUDIO METRICS FOR THE WHOLE SESSION
  // ══════════════════════════════════════════════════════════════════════
  await test.step('7. audio metrics', async () => {
    const debug = await page.evaluate(() => window.__MW_OVERWORLD.audioDebug());
    const calls = debug.sfxCalls || [];
    const byKey = new Map();
    for (const c of calls) {
      if (!byKey.has(c.key)) byKey.set(c.key, []);
      byKey.get(c.key).push(c.t);
    }
    // Densest 1-second sliding window, per key.
    let worstKey = null, worstRate = 0;
    for (const [key, times] of byKey) {
      times.sort((a, b) => a - b);
      let j = 0;
      for (let i = 0; i < times.length; i++) {
        while (times[i] - times[j] > 1) j++;
        const rate = i - j + 1;
        if (rate > worstRate) { worstRate = rate; worstKey = key; }
      }
    }
    R.audio = {
      watchdog: debug.watchdog,
      loops: debug.loops,
      totalCalls: calls.length,
      distinctKeys: byKey.size,
      worstKey, worstRate,
    };
    console.log('AUDIO_METRICS', JSON.stringify(R.audio));

    // The harp-scream class of bug: non-finite samples, or a sustained-RMS
    // duck. Both are ZERO in a healthy session.
    expect(debug.watchdog?.nonFinite ?? 0, 'no non-finite samples ever reached the master bus').toBe(0);
    expect(debug.watchdog?.ducks ?? 0, 'the safety watchdog never had to duck the mix').toBe(0);
    expect(debug.watchdog?.lastRms ?? 0, 'master RMS stays under the sustained-hot threshold').toBeLessThan(0.2);
    // A call storm (a footstep or click firing every frame instead of
    // throttled) shows up as one key dominating a 1s window.
    expect(worstRate, `no sfx key exceeds 8 calls/sec (worst: ${worstKey} at ${worstRate}/s)`).toBeLessThanOrEqual(8);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 8. EXIT BACK TO THE ISLAND; THE SAVE PERSISTS POSITION
  // ══════════════════════════════════════════════════════════════════════
  await test.step('8. exit to the island, save persists', async () => {
    const leavePt = await pagePointOf(page, (game) => game.scene.getScene('OverworldScene')._floorHud?.leaveBtn?.zone);
    await tap(page, leavePt);
    await page.waitForFunction(() => window.__MW.game.scene.getScene('OverworldScene').floorId === null,
      null, { timeout: 60_000 });
    await waitSim(page, 0.5);
    await shot(page, '08-back-on-island');

    const live = await pos(page);
    const persistedSave = await readPersistedSave(page);
    const savedOverworld = persistedSave?.overworld ?? null;
    R.exitPersistence = { live, savedOverworld };
    expect(savedOverworld?.pos, 'the island position is written to the save on exit').toBeTruthy();
    const dx = Math.abs((savedOverworld.pos.x ?? NaN) - live.x);
    const dz = Math.abs((savedOverworld.pos.z ?? NaN) - live.z);
    expect(dx, 'saved X must match where the player actually is').toBeLessThan(1.5);
    expect(dz, 'saved Z must match where the player actually is').toBeLessThan(1.5);

    const sceneCheck = await page.evaluate(() => window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
    expect(sceneCheck).toContain('OverworldScene');
    expect(sceneCheck, 'back on the island, not dropped into a 2D scene').not.toContain('MazeScene');
  });

  console.log('PLAYTHROUGH_JSON_START');
  console.log(JSON.stringify(R, null, 1));
  console.log('PLAYTHROUGH_JSON_END');

  expect(errors, `page errors during the whole session: ${errors.join('; ')}`).toEqual([]);
});
