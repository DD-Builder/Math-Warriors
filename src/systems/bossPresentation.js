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

/** Signature special move per boss id: name + colors for the show. */
export const BOSS_MOVES = {
  briarking: { name: 'THORN STORM', color: 0x4a8830, glyph: '🌿' },
  pressure: { name: 'TIDAL CRUSH', color: 0x40a8d0, glyph: '🌊' },
  skywhale: { name: 'THUNDER DIVE', color: 0x8090c0, glyph: '⚡' },
  pyroclast: { name: 'MAGMA BURST', color: 0xe04808, glyph: '🔥' },
  absolutezero: { name: 'WHITEOUT', color: 0x9cd0e8, glyph: '❄' },
  theprism: { name: 'SHATTER RAY', color: 0xb090e8, glyph: '💎' },
  counterfeiter: { name: 'COIN AVALANCHE', color: 0xecb964, glyph: '🪙' },
  theparadox: { name: 'INK ECLIPSE', color: 0x1f3d3f, glyph: '📖' },
  theorem: { name: 'PROOF OF RUIN', color: 0x9070d8, glyph: '☄' },
};

export function getBossMove(bossId) {
  return BOSS_MOVES[bossId] || { name: 'FURY UNLEASHED', color: 0xc04030, glyph: '★' };
}

/** Every 3rd boss turn is the special (turns 3, 6, 9…). */
export function isSpecialTurn(bossTurnCount) {
  return bossTurnCount > 0 && bossTurnCount % 3 === 0;
}

/** The player turn right before a special should show the warning. */
export function isTelegraphTurn(bossTurnCount) {
  return (bossTurnCount + 1) % 3 === 0;
}

/** Party-wide special damage: reduced per head so it awes, not slays. */
export function specialDamagePerHero(baseDamage) {
  return Math.max(1, Math.round(baseDamage * 0.7));
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
 * special: a pulsing warning with the move's glyph.
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
  return { destroy: () => { pulse.stop(); badge.destroy(); } };
}

/**
 * Special wind-up: the boss inflates and glows in its move color for
 * ~500ms, then done() fires the actual multi-hit.
 */
export function playBossTelegraph(scene, spriteData, enemy, done) {
  const body = spriteData?.body;
  if (!body) { done?.(); return; }
  const move = getBossMove(enemy.id);
  spriteData.idleTween?.pause();
  const osx = body.scaleX, osy = body.scaleY;
  try { body.setTint(move.color); } catch { /* canvas texture */ }
  scene.tweens.add({
    targets: body,
    scaleX: osx * 1.18,
    scaleY: osy * 1.18,
    duration: 480,
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
