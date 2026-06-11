/**
 * Runtime audit spec — exercises real gameplay flows headless:
 *   a. BattleScene boot on every floor 1-9 (errors + screenshots)
 *   b. Full answer/turn loops on floors 1, 5, 6 with hang detection
 *   c. MazeScene movement via keyboard
 *   d. WorldMapScene all 3 screens
 *   e. Title screenshot
 *
 * Findings are reported via console.log so the audit output survives
 * even when assertions fail.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
});

function attachErrorCollector(page) {
  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}\n${(err.stack || '').split('\n').slice(0, 6).join('\n')}`);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'warning' && /force.?unlock|deadlock|stuck/i.test(text)) {
      errors.push(`console warn (unlock safety net fired): ${text}`);
      return;
    }
    if (msg.type() !== 'error') return;
    if (text.includes('Failed to load resource')) return;
    if (text.includes('net::ERR_FAILED')) return;
    if (text.includes('fonts.googleapis.com')) return;
    errors.push(`console error: ${text}`);
  });
  return errors;
}

async function boot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const hasMW = await page.evaluate(() => !!(window.__MW && window.__MW.game));
  expect(hasMW, '__MW.game should be exposed').toBe(true);
}

async function seedSave(page) {
  await page.evaluate(() => {
    const save = {
      version: 1, grade: 3,
      party: [
        { id: 'knight-shadow', name: 'Shadow', hp: 52, maxHp: 52 },
        { id: 'wizard-grandmage', name: 'Grand Mage', hp: 38, maxHp: 38 },
        { id: 'bunny-pepper', name: 'Pepper', hp: 46, maxHp: 46 },
      ],
      gold: 50, potions: 2,
      floors: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, unlocked: true, complete: false, bestStreak: 0 })),
      settings: { musicVolume: 0.8, sfxVolume: 1.0, reducedMotion: false },
      stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0, playTimeSec: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now() },
    };
    // Legacy key migrates to slot 1 on first loadSave()
    localStorage.setItem('mathwarriors.save', JSON.stringify(save));
    localStorage.setItem('mathwarriors.save.1', JSON.stringify(save));
  });
}

async function stopAllAndStart(page, key, data) {
  await page.evaluate(([k, d]) => {
    const mw = window.__MW;
    mw.game.scene.getScenes(true).forEach((s) => mw.game.scene.stop(s.scene.key));
    mw.game.scene.start(k, d);
  }, [key, data]);
}

function battleState(page) {
  return page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('BattleScene');
    if (!s) return null;
    return {
      phase: s.phase,
      locked: s.locked,
      answerProcessing: !!s._answerProcessing,
      turnWho: s.currentTurn?.who ?? null,
      heroIndex: s.currentTurn?.heroIndex ?? null,
      hasQuestion: !!s.currentQuestion,
      enemiesAlive: (s.enemies || []).filter((e) => e.hp > 0).length,
      partyAlive: (s.party || []).filter((h) => h.hp > 0).length,
    };
  });
}

/**
 * Poll scene.phase every 500ms for up to timeoutMs until predicate(state)
 * is true. Returns { ok, last, samples } — samples is the trace, used to
 * report exact hang states.
 */
async function waitForBattle(page, predicate, timeoutMs = 10000) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await battleState(page);
    samples.push({ t: Date.now() - start, ...st });
    if (st && predicate(st)) return { ok: true, last: st, samples };
    await page.waitForTimeout(500);
  }
  const last = samples[samples.length - 1] || null;
  return { ok: false, last, samples };
}

// ------------------------------------------------------------------
// a. BATTLE FLOW: floors 1-9
// ------------------------------------------------------------------
test('battle flow: floors 1-9 boot without errors', async ({ page }) => {
  const errors = attachErrorCollector(page);
  await boot(page);
  await seedSave(page);

  const perFloor = {};
  for (let floor = 1; floor <= 9; floor++) {
    const before = errors.length;
    await stopAllAndStart(page, 'BattleScene', { floor, grade: 3 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `e2e/screenshots/audit-battle-f${floor}.png` });
    const active = await page.evaluate(() => window.__MW.game.scene.getScenes(true).map((s) => s.scene.key));
    const newErrors = errors.slice(before);
    if (newErrors.length || !active.includes('BattleScene')) {
      perFloor[floor] = { errors: newErrors, active };
    }
  }

  console.log('=== BATTLE FLOOR ERRORS ===');
  console.log(JSON.stringify(perFloor, null, 2));
  expect(Object.keys(perFloor), `floors with errors:\n${JSON.stringify(perFloor, null, 2)}`).toEqual([]);
});

// ------------------------------------------------------------------
// b. ANSWER LOOP with hang detection (floors 1, 5, 6)
// ------------------------------------------------------------------
for (const floor of [1, 5, 6]) {
  test(`answer loop: floor ${floor} — 3 full turns, no hangs`, async ({ page }) => {
    const errors = attachErrorCollector(page);
    await boot(page);
    await seedSave(page);

    await stopAllAndStart(page, 'BattleScene', { floor, grade: 3 });
    await page.waitForTimeout(2000);

    const hangs = [];
    let turnsCompleted = 0;

    for (let turn = 0; turn < 3; turn++) {
      // 1. Wait for a hero command phase (rides through enemy turns)
      const cmdWait = await waitForBattle(
        page,
        (st) => st.phase === 'end' || (st.phase === 'command' && !st.locked),
        12000
      );
      if (!cmdWait.ok) {
        hangs.push({
          where: `turn ${turn + 1}: waiting for command phase`,
          stuckState: cmdWait.last,
          trace: cmdWait.samples.slice(-6),
        });
        break;
      }
      if (cmdWait.last.phase === 'end') break; // battle over (victory/defeat)

      // 2. Pick FIGHT (every class has it)
      await page.evaluate(() => {
        const s = window.__MW.game.scene.getScene('BattleScene');
        const cmd = (s.commandButtons && s.commandButtons.find((b) => b.cmd)?.cmd) || 'fight';
        s.selectCommand(cmd);
      });

      // 3. Wait for the question to appear
      const qWait = await waitForBattle(
        page,
        (st) => st.phase === 'question' && st.hasQuestion && !st.locked,
        10000
      );
      if (!qWait.ok) {
        hangs.push({
          where: `turn ${turn + 1}: waiting for question after selectCommand`,
          stuckState: qWait.last,
          trace: qWait.samples.slice(-6),
        });
        break;
      }

      // 4. Answer correctly
      await page.evaluate(() => {
        const s = window.__MW.game.scene.getScene('BattleScene');
        s.onAnswer(s.currentQuestion.correctIndex);
      });

      // 5. Wait for the turn (incl. enemy turn) to resolve back to a
      //    new command phase or battle end. This is where freeze bugs
      //    historically live (locked never released, phase stuck on
      //    'enemy' or 'question').
      const resolveWait = await waitForBattle(
        page,
        (st) => st.phase === 'end' || (st.phase === 'command' && !st.locked),
        12000
      );
      if (!resolveWait.ok) {
        hangs.push({
          where: `turn ${turn + 1}: after correct answer, waiting for next command phase / end`,
          stuckState: resolveWait.last,
          trace: resolveWait.samples.slice(-8),
        });
        break;
      }
      turnsCompleted++;
      if (resolveWait.last.phase === 'end') break;
    }

    const finalState = await battleState(page);
    console.log(`=== FLOOR ${floor} ANSWER LOOP ===`);
    console.log(JSON.stringify({ turnsCompleted, finalState, hangs, errors }, null, 2));
    await page.screenshot({ path: `e2e/screenshots/audit-answerloop-f${floor}.png` });

    expect(hangs, `HANGS detected on floor ${floor}:\n${JSON.stringify(hangs, null, 2)}`).toEqual([]);
    expect(errors, `errors during answer loop floor ${floor}:\n${errors.join('\n')}`).toEqual([]);
  });
}

// ------------------------------------------------------------------
// c. MAZE: movement via keyboard
// ------------------------------------------------------------------
test('maze: floor 1 keyboard movement', async ({ page }) => {
  const errors = attachErrorCollector(page);
  await boot(page);
  await seedSave(page);

  await stopAllAndStart(page, 'MazeScene', { floor: 1, grade: 3 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/screenshots/audit-maze-before.png' });

  const before = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('MazeScene');
    return s ? { x: s.playerX, y: s.playerY } : null;
  });

  // Click canvas to ensure keyboard focus, then mash arrows for ~2s
  await page.locator('canvas').first().click({ position: { x: 640, y: 400 } });
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  for (const key of keys) {
    await page.keyboard.press(key, { delay: 50 });
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: 'e2e/screenshots/audit-maze-after.png' });

  const after = await page.evaluate(() => {
    const s = window.__MW.game.scene.getScene('MazeScene');
    return s ? { x: s.playerX, y: s.playerY } : null;
  });

  console.log('=== MAZE MOVEMENT ===');
  console.log(JSON.stringify({ before, after, errors }, null, 2));

  expect(before, 'MazeScene should exist').not.toBeNull();
  const moved = before.x !== after.x || before.y !== after.y;
  console.log(`player moved: ${moved}`);
  expect(errors, `maze errors:\n${errors.join('\n')}`).toEqual([]);
});

// ------------------------------------------------------------------
// d. WORLD MAP: all 3 screens
// ------------------------------------------------------------------
test('world map: 3 screens render without errors', async ({ page }) => {
  const errors = attachErrorCollector(page);
  await boot(page);
  await seedSave(page);

  await stopAllAndStart(page, 'WorldMapScene', { grade: 3 });
  await page.waitForTimeout(2000);

  for (const [i, scrollX] of [0, 1440, 2880].entries()) {
    await page.evaluate((sx) => {
      const s = window.__MW.game.scene.getScene('WorldMapScene');
      s.cameras.main.scrollX = sx;
    }, scrollX);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `e2e/screenshots/audit-worldmap-s${i}.png` });
  }

  console.log('=== WORLD MAP ===');
  console.log(JSON.stringify({ errors }, null, 2));
  expect(errors, `world map errors:\n${errors.join('\n')}`).toEqual([]);
});

// ------------------------------------------------------------------
// e. TITLE
// ------------------------------------------------------------------
test('title screen renders', async ({ page }) => {
  const errors = attachErrorCollector(page);
  await boot(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/audit-title.png' });
  expect(errors, `title errors:\n${errors.join('\n')}`).toEqual([]);
});
