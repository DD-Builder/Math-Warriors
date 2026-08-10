/**
 * AFTER-PROBE — re-runs the forensic probes from .forensics/world.md against
 * the fixed build. Diagnostic, deleted after the fix pass is proven.
 *
 * Probes:
 *   6  walk into the nearest tree AND a willow — must stop at collider+0.6
 *   7  tree-row screenshot (same framing as 04-tree-row.png)
 *   8  pond pixel-diff at spawn pool + the setPose->freeze(false) leak
 *   4  creatures + companions: spawned, visible, companions track the hero
 */
import { test } from '@playwright/test';
import fs from 'node:fs';

const OUT = '.forensics';

function freshSave() {
  return {
    version: 1, grade: 3,
    party: [
      { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52, xp: 0, level: 1 },
      { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38, xp: 0, level: 1 },
      { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46, xp: 0, level: 1 },
    ],
    gold: 10, potions: 2,
    floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: i < 3, complete: false, bestStreak: 0 })),
    settings: { musicVolume: 0, sfxVolume: 0, reducedMotion: false },
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
  };
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

async function walkAt(page, target, start, seconds = 4) {
  const yaw = Math.atan2(target.x - start.x, target.z - start.z);
  await page.evaluate(({ s, yaw }) => window.__MW_OVERWORLD.teleport(s.x, s.z, yaw), { s: start, yaw });
  await waitSim(page, 0.5);
  const run = [];
  await page.keyboard.down('w');
  const t0 = await simTime(page);
  while ((await simTime(page)) < t0 + seconds) {
    const p = await pos(page);
    run.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), d: +Math.hypot(p.x - target.x, p.z - target.z).toFixed(3) });
    await page.waitForTimeout(150);
  }
  await page.keyboard.up('w');
  return run;
}

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
});

test('after-probe: world fixes', async ({ page }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });
  const R = { pageErrors: [] };
  page.on('pageerror', (e) => R.pageErrors.push(e.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__MW?.game, null, { timeout: 30_000 });
  await page.evaluate((save) => {
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    const mgr = window.__MW.game.scene;
    mgr.getScenes(true).forEach((s) => mgr.stop(s.scene.key));
    mgr.start('OverworldScene', {});
  }, freshSave());
  await page.waitForFunction(() => window.__MW_OVERWORLD?.ready === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.__MW.game.scene.getScene('OverworldScene');
    return s && !s._cover;
  }, null, { timeout: 60_000 });

  // Budgets + population snapshot.
  R.stats = await page.evaluate(() => window.__MW_OVERWORLD.stats());
  R.worldStats = await page.evaluate(() => {
    const w = window.__MW_OVERWORLD.worldStats();
    return { colliders: w.colliders, creatures: w.creatures, companions: w.companions, propsTrees: w.props.trees };
  });

  // ── Defect 6: nearest tree to spawn (broadleaf, from the Node dump) ──
  // tree at (5.30, 155.10) collider r=0.435 -> expected stop 1.035
  const T1 = { x: 5.30, z: 155.10, r: 0.435 };
  const run1 = await walkAt(page, T1, { x: T1.x - 4.0, z: T1.z }, 4);
  R.treeBroadleaf = {
    tree: T1,
    minDist: Math.min(...run1.map((s) => s.d)),
    expectedStop: +(T1.r + 0.6).toFixed(3),
    crossed: run1.some((s) => s.x > T1.x + 0.5),
  };
  await page.screenshot({ path: `${OUT}/after-03-tree-stop.png` });

  // ── Defect 6b: the WILLOW — the species you could walk clean through ──
  // willow at (20.98, 149.83) collider r=1.096 -> expected stop 1.696
  const T2 = { x: 20.98, z: 149.83, r: 1.096 };
  const run2 = await walkAt(page, T2, { x: T2.x - 5.0, z: T2.z }, 4);
  R.treeWillow = {
    tree: T2,
    minDist: Math.min(...run2.map((s) => s.d)),
    expectedStop: +(T2.r + 0.6).toFixed(3),
    crossed: run2.some((s) => s.x > T2.x + 0.5),
  };

  // ── Defect 7: tree row near spawn, same framing as the before shot ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(7.0, 163.5, Math.atan2(0.3, 5.8)));
  await waitSim(page, 1.0);
  await page.screenshot({ path: `${OUT}/after-04-tree-row.png` });

  // ── Defect 4: creatures visible + companions follow ──
  // Companions: walk 12 m, sample companion positions (members are debug-only
  // via worldStats; verify by hero-relative motion of the two follower roots).
  R.companionTrack = await page.evaluate(() => {
    const w = window.__MW_OVERWORLD.worldStats();
    return { count: w.companions.count, classes: w.companions.classes };
  });
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(6, 158, Math.PI));
  await waitSim(page, 1.0);
  await page.screenshot({ path: `${OUT}/after-08-companions-idle.png` });
  await page.keyboard.down('w');
  await waitSim(page, 4.0);
  await page.keyboard.up('w');
  await waitSim(page, 1.0);
  await page.screenshot({ path: `${OUT}/after-09-companions-walk.png` });

  // Nearest hostile creature home (puffshroom-0 at 35.1,188.4 — Node dump) and
  // the bunny meadow (1.3,174.3): stand nearby, let the sim tick, count the
  // creature meshes the frame actually submits.
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(30.0, 183.0, Math.atan2(5.1, 5.4)));
  await waitSim(page, 3.0);
  R.creaturesVisibleAtHome = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().creatures.visibleMeshes);
  await page.screenshot({ path: `${OUT}/after-10-creature.png` });
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(4.5, 170.0, Math.atan2(-3.2, 4.3)));
  await waitSim(page, 2.0);
  R.creaturesVisibleAtMeadow = await page.evaluate(() => window.__MW_OVERWORLD.worldStats().creatures.visibleMeshes);
  await page.screenshot({ path: `${OUT}/after-11-ambient.png` });
  R.pageErrorsSoFar = R.pageErrors.length;

  // ── Defect 8a: pond motion at the spawn pool ──
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(1.5, 150.5, Math.atan2(-9.5, 3.5)));
  await waitSim(page, 1.5);
  const shots = [];
  for (let i = 0; i < 5; i++) {
    const b = await page.screenshot();
    shots.push(b.toString('base64'));
    fs.writeFileSync(`${OUT}/after-07-pond-t${i}.png`, b);
    if (i < 4) await waitSim(page, 1.5);
  }
  R.pond = await page.evaluate(async (b64s) => {
    const imgs = [];
    for (const b of b64s) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b;
      await img.decode();
      imgs.push(img);
    }
    const W = imgs[0].width, H = imgs[0].height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const data = imgs.map((im) => { ctx.clearRect(0, 0, W, H); ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, W, H).data; });
    const region = (x0, y0, x1, y1, a, b) => {
      let sum = 0, nn = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * W + x) * 4;
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        nn++;
      }
      return +(sum / (nn * 3)).toFixed(3);
    };
    const out = [];
    for (let i = 0; i + 1 < data.length; i++) {
      out.push({
        pondMid: region(Math.floor(W * 0.30), Math.floor(H * 0.40), Math.floor(W * 0.70), Math.floor(H * 0.70), data[i], data[i + 1]),
        groundBand: region(Math.floor(W * 0.02), Math.floor(H * 0.80), Math.floor(W * 0.30), Math.floor(H * 0.97), data[i], data[i + 1]),
      });
    }
    return out;
  }, shots);

  // ── Defect 8b: the setPose -> freeze(false) animation-clock leak ──
  // Pose, unfreeze, then check the OCEAN band still marches (before-fix this
  // collapsed to ~0.03).
  await page.evaluate(() => window.__MW_OVERWORLD.setPose(window.__MW_OVERWORLD.POSES[0]));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__MW_OVERWORLD.freeze(false));
  await page.evaluate(() => window.__MW_OVERWORLD.teleport(155, 129, 0.87));
  await waitSim(page, 1.5);
  const seaShots = [];
  for (let i = 0; i < 3; i++) {
    const b = await page.screenshot();
    seaShots.push(b.toString('base64'));
    if (i < 2) await waitSim(page, 2.0);
  }
  R.seaAfterPoseUnfreeze = await page.evaluate(async (b64s) => {
    const imgs = [];
    for (const b of b64s) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b;
      await img.decode();
      imgs.push(img);
    }
    const W = imgs[0].width, H = imgs[0].height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const data = imgs.map((im) => { ctx.clearRect(0, 0, W, H); ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, W, H).data; });
    const region = (x0, y0, x1, y1, a, b) => {
      let sum = 0, nn = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * W + x) * 4;
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        nn++;
      }
      return +(sum / (nn * 3)).toFixed(3);
    };
    const sea = [Math.floor(W * 0.55), Math.floor(H * 0.45), Math.floor(W * 0.95), Math.floor(H * 0.75)];
    return [region(...sea, data[0], data[1]), region(...sea, data[1], data[2])];
  }, seaShots);

  console.log('AFTERPROBE_JSON_START');
  console.log(JSON.stringify(R, null, 1));
  console.log('AFTERPROBE_JSON_END');
});
