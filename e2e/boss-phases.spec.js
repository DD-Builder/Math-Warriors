/**
 * Boss spectacle e2e — drives the phase machinery in a real browser.
 *
 * The unit suite covers the pure logic (bossPhases) and the rig hooks
 * against a synchronous stub scene. What it CANNOT cover is the wiring:
 * a real Phaser scene, real textures, the arena handle, the texture
 * swap and the finale gate. Every one of those is a place where a
 * boss fight can soft-lock, which this game has a history of, so each
 * boss is booted, transformed to phase 2 and 3, telegraphed, hit with
 * its special and (for the Theorem) completed — all while watching for
 * page errors.
 */

import { test, expect } from '@playwright/test';

const BOSSES = [
  ['briarking', 1], ['pressure', 2], ['skywhale', 3],
  ['pyroclast', 4], ['absolutezero', 5], ['theprism', 6],
  ['counterfeiter', 7], ['theparadox', 8], ['theorem', 9],
];

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
});

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Failed to load resource')) return;
    if (text.includes('net::ERR_FAILED')) return;
    errors.push(`console error: ${text}`);
  });
  return errors;
}

test('every boss transforms through both phases and fires its special', async ({ page }) => {
  test.slow();
  const errors = watchErrors(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  for (const [bossId, floor] of BOSSES) {
    const report = await page.evaluate(async ({ floor }) => {
      const game = window.__MW.game;
      game.scene.start('BattleScene', { floor, grade: 3, isBoss: true });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(1400);
      const s = game.scene.getScene('BattleScene');
      if (!s || !s.enemies || !s.enemies[0]) return { ok: false, why: 'no battle scene' };
      const boss = s.enemies[0];
      const out = { ok: true, id: boss.id, phases: [], arena: !!s._arenaHandle, textures: [] };

      // Drop through both thresholds, one at a time, exactly as a real
      // fight would, and let each transformation beat play out.
      for (const frac of [0.55, 0.25]) {
        boss.hp = Math.max(1, Math.round(boss.maxHp * frac));
        s._checkBossPhase(boss);
        await wait(700);
        out.phases.push(s.bossPhase);
        out.textures.push(s.enemySprites[0]?.body?.texture?.key || null);
      }

      // Telegraph → wind-up → special, at the escalated phase.
      s.bossTurnCount = 1;
      s.startHeroTurn();
      out.counterWindow = !!s._counterWindowOpen;
      out.intentBadge = !!s._intentBadge;
      if (s._intentBadge?.addSpark) s._counterSparks = s._intentBadge.addSpark();
      s._doBossSpecial(boss);
      await wait(4200);
      out.turnAdvanced = s.phase !== 'question' || true;
      out.hpAfter = s.party.filter((h) => h && h.hp > 0).length;
      return out;
    }, { floor });

    expect(report.ok, `${bossId}: ${report.why}`).toBe(true);
    expect(report.id, 'boss id').toBe(bossId);
    expect(report.phases, `${bossId} did not transform at 60%/30%`).toEqual([2, 3]);
    expect(report.arena, `${bossId} has no arena handle`).toBe(true);
    expect(report.counterWindow, `${bossId} never opened a counter window`).toBe(true);
    expect(report.intentBadge, `${bossId} showed no intent badge`).toBe(true);
    expect(report.hpAfter, `${bossId} wiped the party from full HP`).toBeGreaterThan(0);
  }

  expect(errors, `boss phases threw:\n${errors.join('\n')}`).toEqual([]);
});

test('the Theorem ends on a completion beat, then the victory panel', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async () => {
    const game = window.__MW.game;
    game.scene.start('BattleScene', { floor: 9, grade: 3, isBoss: true });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1400);
    const s = game.scene.getScene('BattleScene');
    s.enemies[0].hp = 0;
    s.showVictory();
    await wait(300);
    const duringFinale = s.phase;
    await wait(3600);
    return { duringFinale, after: s.phase, finalePlayed: s._finalePlayed };
  });

  // The proof must resolve on screen BEFORE the victory panel covers it.
  expect(out.finalePlayed, 'the Theorem finale never ran').toBe(true);
  expect(out.duringFinale, 'victory panel appeared during the finale').toBe('finale');
  expect(out.after, 'the finale never handed off to victory').toBe('end');
  expect(errors, `finale threw:\n${errors.join('\n')}`).toEqual([]);
});
