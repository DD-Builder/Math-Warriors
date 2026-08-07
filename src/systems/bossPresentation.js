/**
 * Boss battle presentation — entrances, telegraphed specials, intent.
 *
 * v1 bosses were scaled-up mobs. This module gives EVERY boss, in one
 * stroke: a scale-in entrance with a name card, a special-attack
 * cadence (every third boss turn), a telegraphed intent badge shown
 * during the player's turn BEFORE the special lands ("Briar King is
 * preparing THORN STORM!"), and a wind-up animation. Specials hit the
 * whole party at reduced power — spectacle over punishment, tuned for
 * kids. Per-boss signature moves live in BOSS_MOVES; unlisted bosses
 * get a themed default.
 */

import { BATTLE_DEPTH } from '../ui/depths.js';
import { phaseCadence } from './bossPhases.js';
import { PAPER } from '../config.js';

/**
 * Signature special move per boss id: name + colour for the show.
 *
 * ART LAW: these were the last off-palette colours in the boss stack —
 * hand-mixed greens and oranges that the VFX layer then splashed across
 * a papercut stage. Every one is now a PAPER token, so a special reads
 * as the same cut paper as the diorama it lands on.
 */
export const BOSS_MOVES = {
  briarking: { name: 'THORN STORM', color: PAPER.leaf, glyph: '🌿' },
  pressure: { name: 'TIDAL CRUSH', color: PAPER.teal, glyph: '🌊' },
  skywhale: { name: 'THUNDER DIVE', color: PAPER.lavender, glyph: '⚡' },
  pyroclast: { name: 'MAGMA BURST', color: PAPER.coralD, glyph: '🔥' },
  absolutezero: { name: 'WHITEOUT', color: PAPER.sky, glyph: '❄' },
  theprism: { name: 'SHATTER RAY', color: PAPER.lavender, glyph: '💎' },
  counterfeiter: { name: 'COIN AVALANCHE', color: PAPER.gold, glyph: '🪙' },
  theparadox: { name: 'INK ECLIPSE', color: PAPER.inkTeal, glyph: '📖' },
  theorem: { name: 'PROOF OF RUIN', color: PAPER.lavenderD, glyph: '☄' },
};

export function getBossMove(bossId) {
  return BOSS_MOVES[bossId] || { name: 'FURY UNLEASHED', color: PAPER.coralD, glyph: '★' };
}

/**
 * Special cadence, phase-aware. Phase 1 keeps the shipped every-3rd
 * rhythm; a transformed boss fires every 2nd turn, which is the single
 * clearest way a child feels "he's getting serious" without any number
 * on screen changing.
 */
export function isSpecialTurn(bossTurnCount, phase = 1) {
  const every = phaseCadence(phase).specialEvery;
  return bossTurnCount > 0 && bossTurnCount % every === 0;
}

/**
 * The player turn right before a special — the COUNTER WINDOW. Correct
 * answers landed here charge a guard that blunts the incoming special
 * (see counterMitigation), so answering right reads as a parry rather
 * than as bookkeeping.
 */
export function isTelegraphTurn(bossTurnCount, phase = 1) {
  const every = phaseCadence(phase).specialEvery;
  return (bossTurnCount + 1) % every === 0;
}

/** Party-wide special damage: reduced per head so it awes, not slays. */
export function specialDamagePerHero(baseDamage, phase = 1) {
  return Math.max(1, Math.round(baseDamage * phaseCadence(phase).damageMul));
}

/**
 * Boss entrance: the body scales in from nothing with a camera thump,
 * then a name card sweeps through. Calls done() when the stage is set.
 */
export function playBossEntrance(scene, spriteData, enemy, done) {
  const body = spriteData?.body;
  if (!body) { done?.(); return; }
  const targetSX = body.scaleX, targetSY = body.scaleY;
  body.setScale(0.01);
  spriteData.idleTween?.pause();

  scene.tweens.add({
    targets: body,
    scaleX: targetSX,
    scaleY: targetSY,
    duration: 650,
    ease: 'Back.out',
    onComplete: () => {
      scene.cameras.main.shake(180, 0.006);
      spriteData.idleTween?.resume();

      const move = getBossMove(enemy.id);
      const cx = scene.scale.width / 2;
      const card = scene.add.text(cx, 300, enemy.name.toUpperCase(), {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '64px',
        color: '#fff4e0',
        stroke: '#3a1010',
        strokeThickness: 10,
      }).setOrigin(0.5).setDepth(BATTLE_DEPTH.END).setScrollFactor(0).setAlpha(0);
      const sub = scene.add.text(cx, 356, '— BOSS BATTLE —', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
        fontSize: '22px',
        color: '#f0c040',
        stroke: '#3a1010',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(BATTLE_DEPTH.END).setScrollFactor(0).setAlpha(0);
      scene.tweens.add({
        targets: [card, sub],
        alpha: 1,
        duration: 280,
        yoyo: true,
        hold: 900,
        onComplete: () => { card.destroy(); sub.destroy(); done?.(); },
      });
    },
  });
}

/**
 * Intent badge above the boss during the player's turn before a
 * special: a pulsing warning with the move's glyph, plus three counter
 * pips. Each correct answer inside the window lights one pip, so the
 * child can SEE their guard building instead of being told about it.
 */
export function showIntentBadge(scene, spriteData, enemy) {
  const body = spriteData?.body;
  if (!body) return null;
  const move = getBossMove(enemy.id);
  const x = body.x;
  const y = body.y - (body.displayHeight || 300) * 0.5 - 46;
  const badge = scene.add.text(x, y, `⚠ ${move.glyph}`, {
    fontSize: '40px',
  }).setOrigin(0.5).setDepth(BATTLE_DEPTH.INTENT).setScrollFactor(0);
  const pulse = scene.tweens.add({
    targets: badge,
    scaleX: 1.2, scaleY: 1.2,
    duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut',
  });

  // Counter pips — hollow paper discs that fill teal as guards land.
  const pips = [];
  for (let i = 0; i < 3; i++) {
    const p = scene.add.circle(x - 26 + i * 26, y + 34, 8, PAPER.cream, 0.35)
      .setDepth(BATTLE_DEPTH.INTENT);
    p.setStrokeStyle?.(2, PAPER.tealD, 0.8);
    p.setScrollFactor?.(0);
    pips.push(p);
  }
  let lit = 0;
  return {
    /** Light the next pip; returns how many are lit. */
    addSpark() {
      const p = pips[lit];
      lit = Math.min(pips.length, lit + 1);
      if (p) {
        p.setFillStyle?.(PAPER.tealL, 1);
        scene.tweens.add({ targets: p, scaleX: 1.6, scaleY: 1.6, duration: 160, yoyo: true, ease: 'Quad.out' });
      }
      return lit;
    },
    destroy: () => { pulse.stop(); badge.destroy(); pips.forEach(p => p.destroy()); },
  };
}

/**
 * Generic special wind-up for bosses without a bespoke `windup` rig
 * hook: the boss inflates and glows in its move colour while a paper
 * charge ring closes around it. Runs `durationMs` (default 2.2s) so
 * there is a real, readable window between "it is coming" and "it
 * landed" — the beat that makes a correct answer feel like a counter.
 */
export function playBossTelegraph(scene, spriteData, enemy, done, opts = {}) {
  const body = spriteData?.body;
  if (!body) { done?.(); return; }
  const move = getBossMove(enemy.id);
  const total = Math.max(240, opts.durationMs ?? 2200);
  const half = Math.round(total / 2);
  spriteData.idleTween?.pause();
  const osx = body.scaleX, osy = body.scaleY;
  try { body.setTint(move.color); } catch { /* canvas texture */ }

  // Closing charge ring — the tell. Paper-thin, in the move colour.
  const ring = scene.add.circle(body.x, body.y, 20, 0, 0)
    .setDepth(BATTLE_DEPTH.INTENT);
  ring.setStrokeStyle?.(6, move.color, 0.85);
  ring.setScrollFactor?.(0);
  ring.setScale?.(9);
  scene.tweens.add({
    targets: ring, scaleX: 1.2, scaleY: 1.2, alpha: 0.2,
    duration: total, ease: 'Quad.in',
    onComplete: () => ring.destroy(),
  });

  scene.tweens.add({
    targets: body,
    scaleX: osx * 1.18,
    scaleY: osy * 1.18,
    duration: half,
    ease: 'Quad.in',
    yoyo: true,
    onComplete: () => {
      try { body.clearTint(); } catch { /* ignore */ }
      body.setScale(osx, osy);
      scene.cameras.main.shake(220, 0.008);
      spriteData.idleTween?.resume();
      done?.();
    },
  });
}
