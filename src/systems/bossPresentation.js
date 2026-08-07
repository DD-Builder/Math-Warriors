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
import { PAPER, PAPER_CSS } from '../config.js';

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
 * The line UNDER the name on the entrance banner.
 *
 * WHY: every boss used to be announced as "— BOSS BATTLE —", which
 * told a child nothing and made nine different creatures share one
 * introduction. An epithet is the cheapest possible characterisation:
 * two seconds of reading turns "Pyroclast" into someone who lives in a
 * mountain. Kept short enough to fit one banner line at 26px, and
 * warm — these are grand titles, not threats. Awe, never horror.
 */
export const BOSS_EPITHETS = {
  briarking: 'KEEPER OF THE OVERGROWN GARDEN',
  pressure: 'CROWNED KING OF THE DEEP',
  skywhale: 'SINGER IN THE THUNDERHEADS',
  pyroclast: 'HEART OF THE SLEEPING MOUNTAIN',
  absolutezero: 'THE STILLNESS THAT WAITS',
  theprism: 'EVERY COLOUR AT ONCE',
  counterfeiter: 'MASTER OF THE CROOKED FAIR',
  theparadox: 'THE BOOK THAT READS ITSELF',
  theorem: 'THE LAST QUESTION',
};

/** Epithet for a boss id, or a neutral banner line for anything else. */
export function getBossEpithet(bossId) {
  return BOSS_EPITHETS[bossId] || 'A CHALLENGER APPEARS';
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
 * Build the entrance NAME CARD as real cut paper.
 *
 * ART LAW, applied literally: the banner is three stacked layers with
 * visible paper edges — a teal drop-shadow offset 9px down, a cream
 * body with swallow-tail notches cut into both ends, and a gold rule
 * scored inside it. No dark outline anywhere; the text's "ink" is
 * PAPER.inkTeal, the palette's sanctioned replacement for black (the
 * shipped card used a hand-mixed brown-black, the last off-palette
 * colour in the entrance path).
 *
 * Returned as one container so the whole banner sweeps as a single
 * sheet of paper rather than as text that happens to have a box.
 *
 * @returns {object|null} a Phaser container, or null if the scene
 *   cannot build one (kept null-safe: an entrance must never throw).
 */
function buildNameBanner(scene, enemy) {
  const w = scene.scale.width;
  const cx = w / 2;
  const bannerW = Math.min(w * 0.82, 980);
  const bannerH = 176;
  const half = bannerW / 2;
  const notch = 46;   // depth of the swallow-tail cut at each end

  const box = scene.add.container?.(cx, scene.scale.height * 0.34);
  if (!box) return null;
  box.setDepth?.(BATTLE_DEPTH.END);
  box.setScrollFactor?.(0);

  // The cut outline: a rectangle with a triangular bite out of each end.
  const outline = (inset) => [
    { x: -half + inset, y: -bannerH / 2 + inset },
    { x: half - inset, y: -bannerH / 2 + inset },
    { x: half - notch - inset, y: 0 },
    { x: half - inset, y: bannerH / 2 - inset },
    { x: -half + inset, y: bannerH / 2 - inset },
    { x: -half + notch + inset, y: 0 },
  ];

  // Layer 1 — the soft teal drop-shadow between paper and stage.
  const shadow = scene.add.graphics();
  shadow.fillStyle(PAPER.shadow, 0.3);
  shadow.fillPoints(outline(0).map(p => ({ x: p.x, y: p.y + 9 })), true);

  // Layer 2 — the banner itself, cream paper.
  const sheet = scene.add.graphics();
  sheet.fillStyle(PAPER.cream, 1);
  sheet.fillPoints(outline(0), true);
  // Layer 3 — a sand under-strip along the bottom edge, so the sheet
  // reads as having thickness rather than as a flat fill.
  sheet.fillStyle(PAPER.sand, 0.55);
  sheet.fillRect(-half + 10, bannerH / 2 - 16, bannerW - 20, 10);
  // Layer 4 — the scored gold rule, inset like a cut border.
  const rule = scene.add.graphics();
  rule.lineStyle(4, PAPER.gold, 0.9);
  rule.strokeRect(-half + 22, -bannerH / 2 + 20, bannerW - 44, bannerH - 40);

  const name = scene.add.text(0, -22, String(enemy?.name || 'BOSS').toUpperCase(), {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '64px',
    color: PAPER_CSS.inkTeal,
    stroke: PAPER_CSS.cream,
    strokeThickness: 6,
  });
  name.setOrigin?.(0.5);
  const epithet = scene.add.text(0, 40, getBossEpithet(enemy?.id), {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '25px',
    color: PAPER_CSS.tealD,
  });
  epithet.setOrigin?.(0.5);

  box.add?.([shadow, sheet, rule, name, epithet]);
  return box;
}

/**
 * BOSS ENTRANCE — a three-beat curtain instead of a pop-in.
 *
 * WHY the rewrite: the shipped entrance scaled the boss up in 650ms and
 * flashed two lines of text. Nine bosses shared one three-second beat
 * that read the same on floor 1 and floor 9, which is the presentation
 * half of the "bosses go downhill" problem. The new beat is staged:
 *
 *   1. THE STAGE DIMS — a teal-tinted scrim (never black) drops the
 *      diorama back so one silhouette owns the screen.
 *   2. THE SLOW REVEAL — the boss rises as a flat inkTeal paper cutout
 *      and COLOUR FLOODS IN at the top of the swell, which is the
 *      papercut equivalent of a lights-up. Slower than before (950ms,
 *      Back.out) so there is something to watch.
 *   3. THE PUSH-IN — the camera eases to 1.12 across the reveal and
 *      settles back to 1.0 on the thump, so the room leans toward the
 *      boss instead of cutting to it.
 *   4. THE BANNER — a real papercut name card sweeps in from the left
 *      carrying the boss's name AND its epithet, holds, and peels off
 *      to the right.
 *
 * Anti-soft-lock: every element is scheduled independently and done()
 * fires from ONE delayedCall, so it lands exactly once even against a
 * synchronous test scene.
 */
export function playBossEntrance(scene, spriteData, enemy, done) {
  const body = spriteData?.body;
  if (!body) { done?.(); return; }
  const rm = !!scene.reducedMotion;
  const cam = scene.cameras?.main;

  // Beat timings (ms from t0). Reduced motion collapses to a still card.
  const REVEAL = rm ? 200 : 950;
  const CARD_IN = REVEAL + (rm ? 0 : 260);
  const CARD_HOLD = rm ? 700 : 1400;
  const CARD_OUT = CARD_IN + CARD_HOLD;
  const TOTAL = CARD_OUT + (rm ? 100 : 420);

  const targetSX = body.scaleX, targetSY = body.scaleY;
  body.setScale(0.02);
  spriteData.idleTween?.pause?.();

  // 1 — the stage dims. PAPER.inkTeal, not black: the diorama goes to
  // deep teal shadow the way a papercut scene does, and stays warm.
  const scrim = scene.add.rectangle?.(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height, PAPER.inkTeal, 0,
  );
  scrim?.setDepth?.(BATTLE_DEPTH.END - 1);
  scrim?.setScrollFactor?.(0);
  if (scrim) scene.tweens.add({ targets: scrim, alpha: 0.34, duration: rm ? 120 : 300, ease: 'Quad.out' });

  // 2 — the slow reveal: a flat cutout that colours in at the summit.
  try { body.setTint?.(PAPER.inkTeal); } catch { /* canvas texture */ }
  scene.tweens.add({
    targets: body,
    scaleX: targetSX, scaleY: targetSY,
    duration: REVEAL,
    ease: rm ? 'Quad.out' : 'Back.out',
  });

  // 3 — the push-in, and its release on the thump.
  if (!rm) {
    try { cam?.zoomTo?.(1.12, REVEAL, 'Sine.inOut'); } catch { /* no zoom on this camera */ }
    scene.time.delayedCall(REVEAL, () => {
      try { cam?.zoomTo?.(1, 520, 'Sine.out'); } catch { /* ignore */ }
    });
  }
  scene.time.delayedCall(REVEAL, () => {
    try { body.clearTint?.(); } catch { /* ignore */ }
    if (!rm) cam?.shake?.(220, 0.007);
    spriteData.idleTween?.resume?.();
  });

  // 4 — the banner sweeps in, holds, peels away.
  const banner = (() => {
    try { return buildNameBanner(scene, enemy); } catch { return null; }
  })();
  if (banner) {
    const restX = banner.x ?? scene.scale.width / 2;
    const offL = restX - scene.scale.width;
    const offR = restX + scene.scale.width;
    banner.setAlpha?.(0);
    scene.time.delayedCall(CARD_IN, () => {
      banner.setPosition?.(rm ? restX : offL, banner.y);
      banner.setAlpha?.(1);
      if (!rm) {
        scene.tweens.add({
          targets: banner, x: restX, duration: 420, ease: 'Back.out',
        });
      }
    });
    scene.time.delayedCall(CARD_OUT, () => {
      if (rm) { banner.destroy?.(); return; }
      scene.tweens.add({
        targets: banner, x: offR, alpha: 0, duration: 400, ease: 'Quad.in',
        onComplete: () => banner.destroy?.(),
      });
    });
  }
  if (scrim) {
    scene.time.delayedCall(CARD_OUT, () => {
      scene.tweens.add({
        targets: scrim, alpha: 0, duration: rm ? 100 : 380,
        onComplete: () => scrim.destroy?.(),
      });
    });
  }

  // The single done(). Everything above is fire-and-forget.
  scene.time.delayedCall(TOTAL, () => {
    try { banner?.destroy?.(); } catch { /* already gone */ }
    try { scrim?.destroy?.(); } catch { /* already gone */ }
    try { cam?.setZoom?.(1); } catch { /* ignore */ }
    done?.();
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
