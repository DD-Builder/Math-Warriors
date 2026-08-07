/**
 * Boss spectacle rigs — bespoke choreography for each of the nine
 * bosses: a transforming ARENA, a telegraphed WIND-UP, a phase-scaled
 * SPECIAL, and (for the final boss only) a FINALE.
 *
 * PRESENTATION ONLY: every rig is handed precomputed damage and just
 * performs; BattleScene mutates HP in the done() callback.
 * bossPresentation.js stays the single source of truth for cadence and
 * damage; bossPhases.js owns the phase thresholds and flavour. Rigs
 * never touch either — they read ctx.phase and put on a show.
 *
 * WHY the rewrite: the shipped rigs were one static garnish plus one
 * fixed animation, so a boss looked identical at 100% and at 5% HP and
 * the back half of the game felt weaker than the front. Every rig now
 * escalates on three axes a five-year-old can see — the arena changes
 * state, the wind-up gets a longer readable tell, and phase 3 specials
 * fire a second wave.
 *
 * Contract (see getBossRig):
 *   arena?(scene, spriteData|null)            returns { destroy(),
 *                                             setPhase(phase) }; tolerates
 *                                             null (runs before enemy sprites)
 *   entrance?(scene, spriteData, enemy, done) MUST call done() exactly once
 *   windup?(scene, spriteData, ctx, done)     2-3s readable tell; MUST call
 *                                             done() exactly once
 *   special(scene, spriteData, ctx, done)     ctx = { party, heroSprites,
 *                                             perHeroDamage, phase, move,
 *                                             reducedMotion };
 *                                             MUST call done() exactly once
 *   finale?(scene, spriteData, ctx, done)     played INSTEAD of a normal
 *                                             death beat; MUST call done()
 *
 * Anti-soft-lock rule: each hook schedules all its VFX with
 * time.delayedCall and calls done() from ONE final delayedCall, so it
 * fires exactly once even against synchronous test stubs. BattleScene
 * additionally wraps every done() in a watchdog.
 *
 * ART LAW: every colour below is a PAPER token. Shadows are teal-tinted
 * (PAPER.shadow / PAPER.inkTeal), never black or grey.
 */

import { getBossMove, playBossEntrance } from './bossPresentation.js';
import { phaseCadence } from './bossPhases.js';
import { BATTLE_DEPTH } from '../ui/depths.js';
import { PAPER, PAPER_CSS } from '../config.js';
import {
  playSparkBurst, playImpactRing, playScreenFlash, playBeamTrail,
  playElementalBurst, playGroundCrack, playProjectile, playShockwave,
  playHitStop,
} from './vfx.js';

const ARENA_DEPTH = BATTLE_DEPTH.THEME_DETAIL; // 2 — behind the actors

// Pause the boss idle so whole-body tweens don't fight it; capture the
// exact resting transform so we can restore it before done().
function beginBody(spriteData) {
  const body = spriteData?.body || null;
  spriteData?.idleTween?.pause?.();
  const orig = body ? { x: body.x, y: body.y, sx: body.scaleX, sy: body.scaleY } : null;
  return {
    body, orig,
    restore() {
      if (body && orig) {
        if (body.setScale) body.setScale(orig.sx, orig.sy);
        if (body.setPosition) body.setPosition(orig.x, orig.y);
        else { body.x = orig.x; body.y = orig.y; }
      }
      spriteData?.idleTween?.resume?.();
    },
  };
}

// Center of the hero line, for aiming ground-level effects.
function heroAnchor(scene, ctx) {
  const hs = ctx?.heroSprites?.filter(Boolean) || [];
  if (hs.length === 0) return { x: scene.scale.width * 0.32, y: scene.scale.height * 0.62 };
  const x = hs.reduce((s, h) => s + (h.x || 0), 0) / hs.length;
  const y = hs.reduce((s, h) => s + (h.y || 0), 0) / hs.length;
  return { x, y };
}

// A per-hero "hit landed" flourish (ring + sparks). Damage is applied by
// BattleScene's done() callback; this is the visual that sells it.
function strikeHero(scene, sprite, color) {
  if (!sprite) return;
  playImpactRing(scene, sprite.x, sprite.y - 20, { color, endRadius: 70, duration: 300 });
  playSparkBurst(scene, sprite.x, sprite.y - 20, {
    count: 12, colors: [color, PAPER.white], minDist: 15, maxDist: 45, duration: 350,
  });
}

/** Phase for a ctx, clamped. Rigs read this constantly. */
function ph(ctx) {
  return Math.max(1, Math.min(3, ctx?.phase || 1));
}

// Camera shake, scaled by phase — phase 3 hits noticeably harder.
function shake(scene, ctx, intensity, dur) {
  if (ctx?.reducedMotion) return;
  scene.cameras?.main?.shake?.(dur, intensity * phaseCadence(ph(ctx)).shakeMul);
}

function flash(scene, ctx, overrides) {
  if (ctx?.reducedMotion) return;
  playScreenFlash(scene, overrides);
}

/**
 * Phase 3 replays a special's payload once more. `fn(waveIndex)` runs
 * at t=0 and again at t=gap when the phase calls for two waves.
 * Returns the extra milliseconds the caller must add to its finish().
 */
function waves(scene, ctx, gap, fn) {
  const n = phaseCadence(ph(ctx)).waves;
  fn(0);
  if (n > 1) scene.time.delayedCall(gap, () => fn(1));
  return n > 1 ? gap : 0;
}

// Schedule the single done() that also restores the body. `ms` is the
// rig's total run time; keep it under the BattleScene watchdog (5s).
function finish(scene, b, ms, done) {
  scene.time.delayedCall(ms, () => { b.restore(); done(); });
}

// Where a defeat cue should be centred: the boss's last position on
// stage (its body is already fading when the cue plays, so we cache
// the coordinates rather than the sprite).
function bossAnchor(scene, spriteData) {
  const b = spriteData?.body;
  return { x: b?.x ?? scene.scale.width * 0.7, y: b?.y ?? scene.scale.height * 0.38 };
}

/**
 * DRIFTING PAPER — the papercut way to say "it came apart".
 *
 * Sparks are the generic videogame answer and they look like fire in
 * every colour. A papercut boss should shed PAPER: real rectangles of
 * PAPER stock that tumble, rise and fade. Every defeat cue below is
 * built from this plus one bespoke idea, which is what keeps nine
 * different endings recognisably the same craft.
 */
function paperDrift(scene, x, y, opts = {}) {
  const {
    count = 14, colors = [PAPER.cream], spread = 220,
    rise = -160, fall = 220, duration = 1200, size = 18,
  } = opts;
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length];
    const sx = x + (Math.random() - 0.5) * spread;
    const sy = y + (Math.random() - 0.5) * spread * 0.5;
    const shard = scene.add.rectangle?.(sx, sy, size + (i % 3) * 6, size * 0.7 + (i % 2) * 5, c, 0.95);
    if (!shard) return;
    shard.setDepth?.(BATTLE_DEPTH.VFX);
    shard.setScrollFactor?.(0);
    shard.setAngle?.(Math.random() * 360);
    scene.tweens.add({
      targets: shard,
      x: sx + (Math.random() - 0.5) * spread,
      y: sy + rise + Math.random() * fall,
      angle: (shard.angle || 0) + (Math.random() - 0.5) * 540,
      alpha: 0,
      duration: duration + Math.random() * 400,
      ease: 'Sine.out',
      onComplete: () => shard.destroy?.(),
    });
  }
}

/**
 * THE VICTORY BEAT — every boss now has its own two seconds of ending.
 *
 * WHY: eight of the nine bosses shared one death, the shared kill path's
 * shrink-and-fade, so the moment a child had been working toward for a
 * whole floor looked exactly like squashing a slime. A defeat cue is
 * cheap drama with a huge payoff: it states, wordlessly, what beating
 * this particular creature MEANT — the garden lets go, the deep lets
 * go, the forge cools, the ink lifts.
 *
 * Contract mirrors the other hooks: `paint(at, rm)` fires immediately
 * with the boss's last position, done() lands from ONE delayedCall so
 * a synchronous test scene still sees it exactly once, and a throwing
 * cue can never eat a win.
 */
function defeatRig(scene, spriteData, ctx, done, ms, paint) {
  const rm = !!ctx?.reducedMotion;
  try { spriteData?.idleTween?.stop?.(); } catch { /* already gone */ }
  const at = bossAnchor(scene, spriteData);
  try { paint(at, rm); } catch { /* presentation only — never eat a win */ }
  scene.time.delayedCall(rm ? 260 : ms, () => done());
}

// ── shared drawing helper for arena garnish ──────────────────────────
function arenaLayer(scene) {
  const g = scene.add.graphics();
  g.setDepth(ARENA_DEPTH);
  if (g.setScrollFactor) g.setScrollFactor(0);
  return g;
}

/**
 * Build a three-state arena. `build(g, phase, w, h)` draws the layer
 * for that phase; layers 2 and 3 start invisible and fade in when the
 * boss transforms, so the stage physically changes under the fight
 * (the basin floods, the caldera cracks, the library storms) without
 * any per-frame cost.
 */
function arenaRig(scene, build) {
  const w = scene.scale.width, h = scene.scale.height;
  const layers = [];
  for (let p = 1; p <= 3; p++) {
    const g = arenaLayer(scene);
    try { build(g, p, w, h); } catch { /* presentation only — never break a battle */ }
    if (p > 1 && g.setAlpha) g.setAlpha(0);
    layers.push(g);
  }
  return {
    setPhase(phase) {
      for (let p = 2; p <= 3; p++) {
        if (phase < p) continue;
        const g = layers[p - 1];
        if (g) scene.tweens.add({ targets: g, alpha: 1, duration: 900, ease: 'Quad.out' });
      }
    },
    destroy() { layers.forEach(g => g.destroy?.()); },
  };
}

/**
 * Shared wind-up scaffolding: the boss swells for the phase's full
 * wind-up window (2.2s in phase 1, tightening to 1.8s once it is
 * enraged) while `tell(scene, ctx, beat, body)` paints three count-in
 * beats. Three beats, not one — a child needs to see the attack coming
 * long enough to choose to answer, which is what turns a correct answer
 * into a counter.
 */
function windupRig(scene, spriteData, ctx, done, tell) {
  const b = beginBody(spriteData);
  const body = b.body;
  const cad = phaseCadence(ph(ctx));
  const rm = !!ctx?.reducedMotion;
  const total = rm ? 900 : cad.windupMs;
  const beats = rm ? 1 : 3;

  if (body && b.orig) {
    scene.tweens.add({
      targets: body,
      scaleX: b.orig.sx * 1.16, scaleY: b.orig.sy * 1.16,
      duration: total, ease: 'Sine.inOut',
    });
  }
  for (let i = 0; i < beats; i++) {
    scene.time.delayedCall(Math.round((total * (i + 1)) / (beats + 1)), () => {
      try { tell(scene, ctx, i, body); } catch { /* presentation only */ }
    });
  }
  scene.time.delayedCall(total, () => {
    shake(scene, ctx, 0.007, 220);
    b.restore();
    done();
  });
}

/** A wind-up beat that pulses a coloured ring around the boss. */
function tellRing(scene, body, color, beat, opts = {}) {
  const x = body?.x ?? scene.scale.width * 0.7;
  const y = body?.y ?? scene.scale.height * 0.35;
  playImpactRing(scene, x, y, {
    color,
    endRadius: (opts.radius || 120) + beat * 40,
    duration: 420,
  });
}

// ────────────────────────────────────────────────────────────────────
// THE NINE RIGS
// ────────────────────────────────────────────────────────────────────

export const BOSS_RIGS = {
  // 1 — Briarking · THORN STORM
  // ARENA: a hedge of thorns → a briar wall rises → the garden blooms.
  briarking: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.forest, 0.5);
          for (let i = 0; i < 5; i++) {
            const x = w * (0.08 + i * 0.21);
            g.fillTriangle(x - 26, h * 0.42, x + 26, h * 0.42, x, h * 0.18);
          }
        } else if (p === 2) {
          // The briar wall climbs out of the floor.
          g.fillStyle(PAPER.forestD, 0.55);
          for (let i = 0; i < 9; i++) {
            const x = w * (0.04 + i * 0.115);
            g.fillTriangle(x - 34, h, x + 34, h, x, h * 0.52);
          }
          g.lineStyle(5, PAPER.leaf, 0.5);
          for (let i = 0; i < 6; i++) {
            g.beginPath();
            g.moveTo(w * (0.1 + i * 0.16), 0);
            g.lineTo(w * (0.14 + i * 0.16), h * 0.3);
            g.strokePath();
          }
        } else {
          // Full bloom — the king spends his whole garden at once.
          for (let i = 0; i < 14; i++) {
            g.fillStyle(i % 2 ? PAPER.rose : PAPER.peach, 0.42);
            g.fillCircle(w * (0.05 + (i * 0.071) % 0.92), h * (0.12 + (i % 5) * 0.11), 20 + (i % 4) * 8);
          }
          g.fillStyle(PAPER.coral, 0.3);
          g.fillCircle(w * 0.5, h * 0.24, 90);
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // Thorns push up around the boss, one row per beat.
        const x = body?.x ?? s.scale.width * 0.7;
        const y = body?.y ?? s.scale.height * 0.4;
        for (let i = 0; i < 4; i++) {
          playGroundCrack(s, x - 90 + i * 60, y + 90, {
            color: PAPER.forestL, lineCount: 2, length: 30 + beat * 14, alpha: 0.85,
          });
        }
        tellRing(s, body, PAPER.leaf, beat);
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('briarking');
      const anchor = heroAnchor(scene, ctx);
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const rows = 2 + ph(ctx);            // 3 rows → 5 rows by phase 3
      const extra = waves(scene, ctx, 800, () => {
        for (let row = 0; row < rows; row++) {
          scene.time.delayedCall(row * 150, () => {
            const y = anchor.y + 60 - row * 34;
            for (let c = 0; c < 4; c++) {
              const x = scene.scale.width * (0.14 + c * 0.06);
              playGroundCrack(scene, x, y, { color: move.color, lineCount: 3, length: 46, alpha: 0.8 });
            }
          });
        }
        hs.forEach((sprite, i) => {
          scene.time.delayedCall(600 + i * 160, () => strikeHero(scene, sprite, move.color));
        });
      });
      scene.time.delayedCall(1400 + extra, () => {
        playShockwave(scene, anchor.x, anchor.y, { color: move.color, endRadius: 220 + ph(ctx) * 40 });
        shake(scene, ctx, 0.01, 260);
      });
      finish(scene, b, 1800 + extra, done);
    },
    // VICTORY: THE GARDEN LETS GO. The crown comes apart into leaves,
    // and the garden it had been strangling blooms in its place.
    defeat(scene, spriteData, ctx, done) {
      defeatRig(scene, spriteData, ctx, done, 1500, (at, rm) => {
        const w = scene.scale.width, h = scene.scale.height;
        playImpactRing(scene, at.x, at.y - 30, { color: PAPER.leaf, endRadius: 210, duration: 620 });
        paperDrift(scene, at.x, at.y - 40, {
          count: rm ? 6 : 20, colors: [PAPER.leaf, PAPER.sage, PAPER.forestL],
          rise: -230, duration: 1300,
        });
        scene.time.delayedCall(rm ? 0 : 430, () => {
          paperDrift(scene, w * 0.5, h * 0.64, {
            count: rm ? 6 : 20, colors: [PAPER.rose, PAPER.peach, PAPER.white],
            spread: w * 0.72, rise: -280, duration: 1400, size: 14,
          });
          flash(scene, ctx, { color: PAPER.peach, alpha: 0.24, duration: 700 });
        });
      });
    },
  },

  // 2 — Pressure · TIDAL CRUSH
  // ARENA: wave rings → the Deep Basin floods → full fathom, light shafts.
  pressure: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.lineStyle(4, PAPER.tealL, 0.35);
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.arc(w * 0.5, h * (0.7 + i * 0.12), w * 0.5, Math.PI, 0, false);
            g.strokePath();
          }
        } else if (p === 2) {
          // The basin takes on water — a translucent teal shelf.
          g.fillStyle(PAPER.teal, 0.26);
          g.fillRect(0, h * 0.68, w, h * 0.32);
          g.fillStyle(PAPER.tealL, 0.22);
          for (let i = 0; i < 10; i++) g.fillCircle(w * (0.05 + i * 0.1), h * (0.72 + (i % 3) * 0.07), 9 + (i % 4) * 5);
        } else {
          // Full fathom: the water reaches mid-screen and the light bends.
          g.fillStyle(PAPER.tealD, 0.3);
          g.fillRect(0, h * 0.42, w, h * 0.58);
          g.fillStyle(PAPER.sky, 0.16);
          for (let i = 0; i < 5; i++) {
            const x = w * (0.1 + i * 0.2);
            g.fillTriangle(x - 10, 0, x + 10, 0, x + 70, h * 0.6);
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The water pulls back before the crest — rising bubbles.
        const w = s.scale.width, h = s.scale.height;
        for (let i = 0; i < 6; i++) {
          playSparkBurst(s, w * (0.1 + i * 0.14), h * 0.86, {
            count: 4, colors: [PAPER.tealL, PAPER.white], gravity: -140,
            minDist: 8, maxDist: 30 + beat * 14, duration: 620,
          });
        }
        tellRing(s, body, PAPER.tealL, beat, { radius: 140 });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('pressure');
      const w = scene.scale.width, h = scene.scale.height;
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const crest = 0.6 - ph(ctx) * 0.05;   // the wall rises higher each phase
      const extra = waves(scene, ctx, 900, (wave) => {
        const wall = scene.add.rectangle(w / 2, h + 40, w, h * 0.9, move.color, 0.34).setDepth(BATTLE_DEPTH.VFX);
        if (wall.setScrollFactor) wall.setScrollFactor(0);
        scene.tweens.add({
          targets: wall, y: h * crest, duration: 640, ease: 'Cubic.in',
          onComplete: () => scene.tweens.add({
            targets: wall, y: h + 40, alpha: 0, duration: 460, onComplete: () => wall.destroy(),
          }),
        });
        hs.forEach((sprite, i) => {
          scene.time.delayedCall(380 + i * 140, () => {
            playSparkBurst(scene, sprite.x, sprite.y, {
              count: 14, colors: [PAPER.sky, PAPER.white], gravity: -40, minDist: 10, maxDist: 40,
            });
            if (wave === 0) strikeHero(scene, sprite, move.color);
          });
        });
      });
      scene.time.delayedCall(850, () => shake(scene, ctx, 0.009, 300));
      finish(scene, b, 1500 + extra, done);
    },
    // VICTORY: THE DEEP LETS GO. Everything it was holding down rushes
    // up at once — a column of bubbles — and the water line drains off
    // the bottom of the stage.
    defeat(scene, spriteData, ctx, done) {
      defeatRig(scene, spriteData, ctx, done, 1500, (at, rm) => {
        const w = scene.scale.width, h = scene.scale.height;
        const n = rm ? 8 : 26;
        for (let i = 0; i < n; i++) {
          scene.time.delayedCall(i * 34, () => {
            const bx = at.x + (Math.random() - 0.5) * 300;
            const bub = scene.add.circle?.(bx, h * 0.78, 6 + Math.random() * 16, PAPER.tealL, 0.6);
            if (!bub) return;
            bub.setDepth?.(BATTLE_DEPTH.VFX);
            bub.setScrollFactor?.(0);
            scene.tweens.add({
              targets: bub, y: h * 0.06, alpha: 0,
              duration: 900 + Math.random() * 700, ease: 'Sine.out',
              onComplete: () => bub.destroy?.(),
            });
          });
        }
        // The flood recedes: a teal sheet slides off the bottom edge.
        const tide = scene.add.rectangle?.(w / 2, h * 0.8, w, h * 0.5, PAPER.teal, 0.3);
        tide?.setDepth?.(BATTLE_DEPTH.THEME_DETAIL);
        tide?.setScrollFactor?.(0);
        if (tide) {
          scene.tweens.add({
            targets: tide, y: h * 1.5, alpha: 0, duration: rm ? 260 : 1300,
            ease: 'Quad.in', onComplete: () => tide.destroy?.(),
          });
        }
        playImpactRing(scene, at.x, at.y, { color: PAPER.tealL, endRadius: 260, duration: 800 });
      });
    },
  },

  // 3 — Skywhale · THUNDER DIVE
  // ARENA: a cloud band → a storm bank with bolts → the sky breaks open.
  skywhale: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.white, 0.16);
          g.fillEllipse(w * 0.5, h * 0.12, w * 0.8, h * 0.14);
        } else if (p === 2) {
          g.fillStyle(PAPER.sky, 0.3);
          g.fillEllipse(w * 0.32, h * 0.14, w * 0.6, h * 0.2);
          g.fillEllipse(w * 0.74, h * 0.1, w * 0.5, h * 0.16);
          g.lineStyle(5, PAPER.lavender, 0.55);
          for (let i = 0; i < 4; i++) {
            const x = w * (0.16 + i * 0.22);
            g.beginPath(); g.moveTo(x, h * 0.2); g.lineTo(x - 16, h * 0.32);
            g.lineTo(x + 6, h * 0.32); g.lineTo(x - 12, h * 0.46); g.strokePath();
          }
        } else {
          // The sky breaks: a lattice of bolts and driving rain.
          g.lineStyle(4, PAPER.white, 0.5);
          for (let i = 0; i < 9; i++) {
            const x = w * (0.05 + i * 0.11);
            g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 18, h * 0.22);
            g.lineTo(x + 8, h * 0.22); g.lineTo(x - 14, h * 0.5); g.strokePath();
          }
          g.lineStyle(2, PAPER.sky, 0.32);
          for (let i = 0; i < 26; i++) {
            const x = w * ((i * 0.0393) % 1);
            g.beginPath(); g.moveTo(x, h * 0.1); g.lineTo(x - 14, h * 0.9); g.strokePath();
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // A shadow gathers under the party — the dive is coming.
        const anchor = heroAnchor(s, c);
        playImpactRing(s, anchor.x, anchor.y + 30, {
          color: PAPER.lavender, endRadius: 60 + beat * 45, duration: 500,
        });
        if (body) playSparkBurst(s, body.x, body.y, {
          count: 6, colors: [PAPER.white, PAPER.sky], minDist: 20, maxDist: 60, duration: 420,
        });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('skywhale');
      const anchor = heroAnchor(scene, ctx);
      const body = b.body;
      const shadow = scene.add.ellipse(anchor.x, anchor.y + 40, 40, 16, PAPER.shadow, 0.4).setDepth(BATTLE_DEPTH.SHADOWS);
      if (body && b.orig) {
        scene.tweens.add({ targets: body, y: b.orig.y - scene.scale.height * 0.7, duration: 420, ease: 'Quad.in' });
      }
      scene.tweens.add({ targets: shadow, scaleX: 6, scaleY: 6, duration: 620, ease: 'Quad.in' });
      const extra = waves(scene, ctx, 750, (wave) => {
        scene.time.delayedCall(700, () => {
          if (body) { body.x = anchor.x; body.y = anchor.y - 20; playHitStop(scene, body, { duration: 60 }); }
          playShockwave(scene, anchor.x, anchor.y, { color: move.color, endRadius: 200 + ph(ctx) * 30 });
          playShockwave(scene, anchor.x, anchor.y, { color: PAPER.white, endRadius: 280, duration: 420 });
          playGroundCrack(scene, anchor.x, anchor.y, { color: move.color, lineCount: 6, length: 80 });
          if (wave === 0) (ctx.heroSprites?.filter(Boolean) || []).forEach(s => strikeHero(scene, s, move.color));
          shake(scene, ctx, 0.016, 320);
          shadow.destroy();
        });
      });
      finish(scene, b, 1400 + extra, done);
    },
    // VICTORY: THE STORM CLEARS. The thunderhead pulls apart and a warm
    // gold shaft of sun opens through the gap — the sky handed back.
    defeat(scene, spriteData, ctx, done) {
      defeatRig(scene, spriteData, ctx, done, 1600, (at, rm) => {
        const w = scene.scale.width, h = scene.scale.height;
        // Cloud banks slide apart to the wings.
        for (const dir of [-1, 1]) {
          const cloud = scene.add.ellipse?.(w * 0.5, h * 0.22, w * 0.55, h * 0.3, PAPER.sky, 0.5);
          if (!cloud) break;
          cloud.setDepth?.(BATTLE_DEPTH.THEME_DETAIL);
          cloud.setScrollFactor?.(0);
          scene.tweens.add({
            targets: cloud, x: w * 0.5 + dir * w * 0.75, alpha: 0,
            duration: rm ? 260 : 1300, ease: 'Sine.inOut',
            onComplete: () => cloud.destroy?.(),
          });
        }
        // The sunbeam through the gap: a warm wedge, widening.
        scene.time.delayedCall(rm ? 0 : 420, () => {
          const beam = scene.add.triangle?.(w * 0.5, h * 0.1, 0, 0, -60, h * 0.8, 60, h * 0.8, PAPER.gold, 0.3);
          if (beam) {
            beam.setDepth?.(BATTLE_DEPTH.THEME_DETAIL);
            beam.setScrollFactor?.(0);
            scene.tweens.add({
              targets: beam, scaleX: 4, alpha: 0, duration: rm ? 240 : 1200,
              ease: 'Quad.out', onComplete: () => beam.destroy?.(),
            });
          }
          flash(scene, ctx, { color: PAPER.cream, alpha: 0.28, duration: 700 });
        });
        paperDrift(scene, at.x, at.y, {
          count: rm ? 6 : 16, colors: [PAPER.white, PAPER.sky, PAPER.lavender],
          rise: -120, fall: 320, duration: 1400,
        });
      });
    },
  },

  // 4 — Pyroclast · MAGMA BURST
  // ARENA: a warm glow → the caldera cracks → lava fountains.
  pyroclast: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.coralD, 0.14);
          g.fillEllipse(w * 0.72, h * 0.4, w * 0.5, h * 0.5);
          g.lineStyle(3, PAPER.coral, 0.4);
          for (let i = 0; i < 4; i++) {
            g.beginPath(); g.moveTo(w * (0.5 + i * 0.12), h * 0.52);
            g.lineTo(w * (0.54 + i * 0.12), h * 0.62); g.strokePath();
          }
        } else if (p === 2) {
          // The floor splits — glowing veins across the whole caldera.
          g.lineStyle(7, PAPER.orange, 0.5);
          for (let i = 0; i < 6; i++) {
            const x = w * (0.05 + i * 0.17);
            g.beginPath(); g.moveTo(x, h);
            g.lineTo(x + 40, h * 0.82); g.lineTo(x + 10, h * 0.68); g.strokePath();
          }
          g.fillStyle(PAPER.gold, 0.16);
          g.fillRect(0, h * 0.86, w, h * 0.14);
        } else {
          // Meltdown: fountains of paper flame along the back wall.
          for (let i = 0; i < 7; i++) {
            const x = w * (0.07 + i * 0.14);
            g.fillStyle(PAPER.coralD, 0.4);
            g.fillTriangle(x - 34, h, x + 34, h, x, h * 0.34);
            g.fillStyle(PAPER.orange, 0.42);
            g.fillTriangle(x - 20, h, x + 20, h, x, h * 0.46);
            g.fillStyle(PAPER.gold, 0.4);
            g.fillTriangle(x - 9, h, x + 9, h, x, h * 0.58);
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The sky above the party reddens where the meteors will land.
        const hs = c?.heroSprites?.filter(Boolean) || [];
        (hs.length ? hs : [{ x: s.scale.width * 0.3, y: s.scale.height * 0.6 }]).forEach((sp) => {
          playImpactRing(s, sp.x, sp.y + 20, {
            color: PAPER.orange, endRadius: 40 + beat * 26, duration: 460,
          });
        });
        if (body) playElementalBurst(s, body.x, body.y, { colors: [PAPER.gold, PAPER.coral] });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('pyroclast');
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const targets = hs.length ? hs.map(s => ({ x: s.x, y: s.y - 10 })) : [{ x: scene.scale.width * 0.3, y: scene.scale.height * 0.6 }];
      const extra = waves(scene, ctx, 850, (wave) => {
        targets.forEach((pt, i) => {
          scene.time.delayedCall(i * 150, () => {
            playProjectile(scene, sx, sy - 30, pt.x, pt.y, { color: PAPER.coral, size: 12, speed: 900 });
            scene.time.delayedCall(220, () => {
              playElementalBurst(scene, pt.x, pt.y, { colors: [PAPER.orange, PAPER.gold, move.color] });
              if (wave === 0) strikeHero(scene, hs[i], move.color);
            });
          });
        });
      });
      scene.time.delayedCall(850, () => {
        for (let i = 0; i < 10 + ph(ctx) * 4; i++) {
          playSparkBurst(scene, scene.scale.width * (0.15 + Math.random() * 0.6), scene.scale.height * 0.2, {
            count: 3, colors: [PAPER.orange, PAPER.coralD], gravity: 120, minDist: 5, maxDist: 20, duration: 700,
          });
        }
      });
      scene.time.delayedCall(600, () => shake(scene, ctx, 0.012, 280));
      finish(scene, b, 1700 + extra, done);
    },
    // VICTORY: THE FORGE COOLS. Embers rain down and go out, the coral
    // glow drains to sand, and the last of the heat curls off as steam.
    defeat(scene, spriteData, ctx, done) {
      defeatRig(scene, spriteData, ctx, done, 1600, (at, rm) => {
        const w = scene.scale.width, h = scene.scale.height;
        // Falling embers — the only cue here that goes DOWN, because
        // this is a fire being put out rather than something taking off.
        paperDrift(scene, at.x, at.y - 60, {
          count: rm ? 8 : 22, colors: [PAPER.coralD, PAPER.orange, PAPER.gold],
          spread: 320, rise: 80, fall: 300, duration: 1300, size: 12,
        });
        // The caldera glow drains away to cold paper.
        const glow = scene.add.ellipse?.(w * 0.62, h * 0.55, w * 0.8, h * 0.5, PAPER.coralD, 0.22);
        if (glow) {
          glow.setDepth?.(BATTLE_DEPTH.THEME_DETAIL);
          glow.setScrollFactor?.(0);
          scene.tweens.add({
            targets: glow, alpha: 0, duration: rm ? 260 : 1500, ease: 'Quad.out',
            onComplete: () => glow.destroy?.(),
          });
        }
        // …and steam rises off it, pale and slow.
        scene.time.delayedCall(rm ? 0 : 500, () => {
          paperDrift(scene, w * 0.55, h * 0.6, {
            count: rm ? 4 : 14, colors: [PAPER.cream, PAPER.sand, PAPER.white],
            spread: w * 0.5, rise: -300, fall: 60, duration: 1500, size: 22,
          });
        });
      });
    },
  },

  // 5 — Absolutezero · WHITEOUT
  // ARENA: corner frost → ice pillars close in → true zero, frozen air.
  absolutezero: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.sky, 0.3);
          for (const cx of [0, w]) {
            for (let i = 0; i < 4; i++) {
              const x = cx === 0 ? i * 40 : w - i * 40;
              g.fillTriangle(x, 0, x + 20, 0, x + 10, 40 + i * 8);
            }
          }
        } else if (p === 2) {
          // Pillars grow out of the floor and narrow the arena.
          g.fillStyle(PAPER.sky, 0.34);
          for (let i = 0; i < 6; i++) {
            const x = w * (0.03 + i * 0.19);
            g.fillTriangle(x - 30, h, x + 30, h, x, h * 0.38);
          }
          g.fillStyle(PAPER.white, 0.24);
          for (let i = 0; i < 6; i++) {
            const x = w * (0.03 + i * 0.19);
            g.fillTriangle(x - 12, h, x + 12, h, x, h * 0.5);
          }
        } else {
          // True zero: the air itself freezes into sheets.
          g.fillStyle(PAPER.white, 0.2);
          g.fillRect(0, 0, w, h);
          g.lineStyle(3, PAPER.tealL, 0.4);
          for (let i = 0; i < 8; i++) {
            const r = 60 + i * 70;
            g.beginPath(); g.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2); g.strokePath();
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The screen frosts from the edges inward, one beat at a time.
        if (!c?.reducedMotion) {
          playScreenFlash(s, { color: PAPER.white, alpha: 0.16 + beat * 0.08, duration: 400 });
        }
        tellRing(s, body, PAPER.sky, beat, { radius: 100 });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const w = scene.scale.width, h = scene.scale.height;
      flash(scene, ctx, { color: PAPER.white, alpha: 0.55, duration: 600 });
      const shards = [];
      for (const corner of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const s = scene.add.triangle(corner[0], corner[1], 0, 0, 90, 30, 30, 110, PAPER.sky, 0.6).setDepth(BATTLE_DEPTH.VFX);
        if (s.setScrollFactor) s.setScrollFactor(0);
        s.setScale?.(0);
        shards.push(s);
        scene.tweens.add({ targets: s, scaleX: 1, scaleY: 1, duration: 400, ease: 'Quad.out' });
      }
      const extra = waves(scene, ctx, 700, (wave) => {
        scene.time.delayedCall(800, () => {
          (ctx.heroSprites?.filter(Boolean) || []).forEach(sp => {
            playSparkBurst(scene, sp.x, sp.y - 20, { count: 16, colors: [PAPER.white, PAPER.sky], minDist: 20, maxDist: 60 });
            playImpactRing(scene, sp.x, sp.y - 20, { color: PAPER.sky, endRadius: 80 });
            if (wave === 1) strikeHero(scene, sp, PAPER.tealL);
          });
          if (wave === 0) shards.forEach(s => scene.tweens.add({ targets: s, alpha: 0, duration: 250, onComplete: () => s.destroy() }));
          shake(scene, ctx, 0.008, 220);
        });
      });
      finish(scene, b, 1500 + extra, done);
    },
  },

  // 6 — Theprism · SHATTER RAY
  // ARENA: three light shafts → a ring of mirror facets → total refraction.
  theprism: {
    arena(scene) {
      const cols = [PAPER.lavender, PAPER.sky, PAPER.rose];
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          for (let i = 0; i < 3; i++) {
            g.fillStyle(cols[i], 0.14);
            const x = w * (0.3 + i * 0.2);
            g.fillTriangle(x, h * 0.2, x - 30, h * 0.5, x + 30, h * 0.5);
          }
        } else if (p === 2) {
          // Mirrors ring the arena — the boss is suddenly everywhere.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const x = w * 0.5 + Math.cos(a) * w * 0.38;
            const y = h * 0.44 + Math.sin(a) * h * 0.3;
            g.fillStyle(cols[i % 3], 0.26);
            g.fillTriangle(x, y - 46, x - 30, y + 34, x + 30, y + 34);
          }
        } else {
          // Total refraction — a full spectrum fan from the boss's stand.
          for (let i = 0; i < 12; i++) {
            g.fillStyle(cols[i % 3], 0.18);
            const x = w * (0.02 + i * 0.085);
            g.fillTriangle(w * 0.72, h * 0.28, x, h, x + w * 0.09, h);
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The boss gathers white light before it splits it.
        const x = body?.x ?? s.scale.width * 0.7;
        const y = body?.y ?? s.scale.height * 0.35;
        playSparkBurst(s, x, y, {
          count: 10, colors: [PAPER.white, PAPER.lavender], minDist: 70 - beat * 20, maxDist: 110 - beat * 30, duration: 460,
        });
        tellRing(s, body, [PAPER.lavender, PAPER.sky, PAPER.rose][beat % 3], beat, { radius: 110 });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const midX = scene.scale.width * 0.5, midY = scene.scale.height * 0.45;
      const cols = [PAPER.lavender, PAPER.sky, PAPER.rose, PAPER.tealL, PAPER.gold];
      const beams = ph(ctx) >= 2 ? 5 : 3;      // the beam splits wider each phase
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const extra = waves(scene, ctx, 800, (wave) => {
        playBeamTrail(scene, sx, sy, midX, midY, { color: PAPER.white });
        scene.time.delayedCall(260, () => {
          for (let i = 0; i < beams; i++) {
            const sp = hs.length ? hs[i % hs.length] : { x: midX, y: midY };
            scene.time.delayedCall(i * 100, () => {
              playBeamTrail(scene, midX, midY, sp.x, sp.y, { color: cols[i % cols.length], trailColor: cols[i % cols.length] });
              playImpactRing(scene, sp.x, sp.y - 20, { color: cols[i % cols.length], endRadius: 70 });
              if (wave === 0 && i < hs.length) strikeHero(scene, sp, cols[i % cols.length]);
            });
          }
        });
      });
      scene.time.delayedCall(700, () => flash(scene, ctx, { color: PAPER.white, alpha: 0.4, duration: 200 }));
      finish(scene, b, 1500 + extra, done);
    },
  },

  // 7 — Counterfeiter · COIN AVALANCHE
  // ARENA: loose coins → a coin tide and hanging scales → a coin storm.
  counterfeiter: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.gold, 0.4);
          for (let i = 0; i < 8; i++) g.fillCircle(w * (0.1 + i * 0.107), h * (0.42 + (i % 3) * 0.02), 5 + (i % 4) * 3);
        } else if (p === 2) {
          // The floor is paved in false coin.
          g.fillStyle(PAPER.gold, 0.34);
          for (let i = 0; i < 40; i++) {
            g.fillCircle(w * ((i * 0.0611) % 1), h * (0.8 + ((i * 7) % 10) * 0.019), 9 + (i % 4) * 4);
          }
          g.lineStyle(5, PAPER.orange, 0.45);
          g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h * 0.16); g.strokePath();
          g.beginPath(); g.moveTo(w * 0.3, h * 0.16); g.lineTo(w * 0.7, h * 0.16); g.strokePath();
        } else {
          // Priceless: columns of coin pour from ceiling to floor.
          for (let i = 0; i < 9; i++) {
            const x = w * (0.05 + i * 0.108);
            g.fillStyle(PAPER.gold, 0.24);
            g.fillRect(x - 22, 0, 44, h);
            g.fillStyle(PAPER.orange, 0.3);
            for (let j = 0; j < 7; j++) g.fillCircle(x, h * (0.06 + j * 0.14), 12);
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // Coins orbit tighter and tighter — the tell is the sound of money.
        const x = body?.x ?? s.scale.width * 0.7;
        const y = body?.y ?? s.scale.height * 0.35;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + beat;
          playSparkBurst(s, x + Math.cos(a) * (90 - beat * 22), y + Math.sin(a) * (60 - beat * 14), {
            count: 3, colors: [PAPER.gold, PAPER.white], minDist: 4, maxDist: 16, duration: 420,
          });
        }
        tellRing(s, body, PAPER.gold, beat, { radius: 100 });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('counterfeiter');
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const count = 6 + ph(ctx) * 4;          // 10 coins → 18 by phase 3
      const extra = waves(scene, ctx, 900, (wave) => {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const coin = scene.add.circle(sx + Math.cos(a) * 60, sy + Math.sin(a) * 40, 8, move.color).setDepth(BATTLE_DEPTH.VFX);
          if (coin.setStrokeStyle) coin.setStrokeStyle(2, PAPER.white, 0.9);
          const tgt = hs.length ? hs[i % hs.length] : { x: scene.scale.width * 0.3, y: scene.scale.height * 0.6 };
          scene.time.delayedCall(300 + i * 45, () => {
            scene.tweens.add({
              targets: coin, x: tgt.x, y: tgt.y - 20, duration: 380, ease: 'Cubic.in',
              onComplete: () => {
                playSparkBurst(scene, coin.x, coin.y, { count: 8, colors: [move.color, PAPER.white] });
                coin.destroy();
              },
            });
          });
        }
        if (wave === 0) hs.forEach((sp, i) => scene.time.delayedCall(750 + i * 110, () => strikeHero(scene, sp, move.color)));
      });
      scene.time.delayedCall(900, () => shake(scene, ctx, 0.008, 240));
      finish(scene, b, 1700 + extra, done);
    },
  },

  // 8 — Theparadox · INK ECLIPSE
  // ARENA: torn corners → a storm of loose pages → the library inverts.
  theparadox: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.inkTeal, 0.5);
          g.fillTriangle(0, 0, 70, 0, 0, 90);
          g.fillTriangle(w, 0, w - 70, 0, w, 90);
          g.fillTriangle(0, h, 70, h, 0, h - 90);
          g.fillTriangle(w, h, w - 70, h, w, h - 90);
        } else if (p === 2) {
          // Pages tear loose and fill the air.
          for (let i = 0; i < 26; i++) {
            const x = w * ((i * 0.0793) % 1);
            const y = h * (0.06 + ((i * 13) % 17) * 0.052);
            g.fillStyle(i % 3 ? PAPER.cream : PAPER.sand, 0.42);
            g.fillTriangle(x, y, x + 34, y - 12, x + 28, y + 26);
          }
        } else {
          // The last page: shelves stand upside down around a page vortex.
          g.fillStyle(PAPER.sand, 0.3);
          for (let i = 0; i < 5; i++) g.fillRect(w * (0.04 + i * 0.2), 0, w * 0.13, h * 0.34);
          for (let i = 0; i < 5; i++) g.fillRect(w * (0.14 + i * 0.2), h * 0.72, w * 0.13, h * 0.28);
          g.lineStyle(4, PAPER.tealL, 0.4);
          for (let i = 1; i <= 5; i++) {
            g.beginPath(); g.arc(w * 0.5, h * 0.48, i * 58, 0, Math.PI * 2); g.strokePath();
          }
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The light drains toward the boss before the eclipse.
        const x = body?.x ?? s.scale.width * 0.7;
        const y = body?.y ?? s.scale.height * 0.35;
        playImpactRing(s, x, y, { color: PAPER.tealL, endRadius: 180 - beat * 45, duration: 480 });
        playSparkBurst(s, x, y, {
          count: 8, colors: [PAPER.cream, PAPER.sand], minDist: 60 - beat * 16, maxDist: 100 - beat * 26, duration: 460,
        });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const body = b.body;
      const cx = body?.x ?? scene.scale.width * 0.7;
      const cy = body?.y ?? scene.scale.height * 0.3;
      const extra = waves(scene, ctx, 950, (wave) => {
        // Teal ink, never black — the eclipse must read as deep water,
        // not as a lights-out scare.
        const dark = scene.add.circle(cx, cy, 10, PAPER.inkTeal, 0.9).setDepth(BATTLE_DEPTH.VFX + 1);
        if (dark.setScrollFactor) dark.setScrollFactor(0);
        scene.tweens.add({ targets: dark, radius: 1600, duration: 480, ease: 'Cubic.in' });
        const eyeY = scene.scale.height * 0.4;
        const eyes = [
          scene.add.circle(scene.scale.width * 0.44, eyeY, 12, PAPER.white, 0).setDepth(BATTLE_DEPTH.VFX + 2),
          scene.add.circle(scene.scale.width * 0.56, eyeY, 12, PAPER.white, 0).setDepth(BATTLE_DEPTH.VFX + 2),
        ];
        scene.time.delayedCall(500, () => eyes.forEach(e => scene.tweens.add({ targets: e, alpha: 1, duration: 200, yoyo: true, hold: 380 })));
        scene.time.delayedCall(680, () => (ctx.heroSprites?.filter(Boolean) || []).forEach(sp => {
          playImpactRing(scene, sp.x, sp.y - 20, { color: PAPER.white, endRadius: 70 });
          if (wave === 0) strikeHero(scene, sp, PAPER.tealL);
        }));
        scene.time.delayedCall(1000, () => {
          scene.tweens.add({ targets: dark, radius: 10, alpha: 0, duration: 340, ease: 'Quad.in', onComplete: () => dark.destroy() });
          eyes.forEach(e => e.destroy());
          shake(scene, ctx, 0.01, 260);
        });
      });
      finish(scene, b, 1600 + extra, done);
    },
  },

  // 9 — Theorem · PROOF OF RUIN — the game's final and biggest rig.
  // ARENA: floating solids → a proof lattice → a constellation of
  // solved glyphs. The only rig with a FINALE: the Theorem is not
  // destroyed, it is COMPLETED.
  theorem: {
    arena(scene) {
      return arenaRig(scene, (g, p, w, h) => {
        if (p === 1) {
          g.fillStyle(PAPER.lavender, 0.14);
          for (let i = 0; i < 6; i++) g.fillCircle(w * (0.12 + i * 0.15), h * (0.2 + (i % 2) * 0.1), 26);
        } else if (p === 2) {
          // The proof writes itself across the room: a ruled lattice.
          g.lineStyle(2, PAPER.lavender, 0.34);
          for (let i = 0; i <= 12; i++) {
            const x = (w / 12) * i;
            g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.strokePath();
          }
          for (let i = 0; i <= 8; i++) {
            const y = (h / 8) * i;
            g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
          }
          g.fillStyle(PAPER.lavenderD, 0.16);
          for (let i = 0; i < 10; i++) g.fillCircle(w * (0.06 + i * 0.098), h * (0.16 + (i % 4) * 0.2), 34);
        } else {
          // The final line: everything the child has solved, hanging in
          // the air as warm paper stars around one unfinished circle.
          for (let i = 0; i < 30; i++) {
            g.fillStyle(i % 3 === 0 ? PAPER.gold : PAPER.lavender, 0.34);
            const x = w * ((i * 0.0673) % 1);
            const y = h * (0.05 + ((i * 11) % 19) * 0.048);
            g.fillCircle(x, y, 5 + (i % 4) * 3);
          }
          g.lineStyle(8, PAPER.gold, 0.42);
          g.beginPath(); g.arc(w * 0.5, h * 0.44, Math.min(w, h) * 0.32, 0.5, Math.PI * 2); g.strokePath();
          g.fillStyle(PAPER.cream, 0.12);
          g.fillCircle(w * 0.5, h * 0.44, Math.min(w, h) * 0.3);
        }
      });
    },
    windup(scene, spriteData, ctx, done) {
      windupRig(scene, spriteData, ctx, done, (s, c, beat, body) => {
        // The Theorem states its premise: three glyphs drop into place
        // above the party, one per beat, like a proof being written.
        const w = s.scale.width, h = s.scale.height;
        const glyphs = ['∀', '⇒', '∎'];
        const t = s.add.text(w * (0.3 + beat * 0.2), h * 0.24, glyphs[beat % 3], {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
          fontSize: '58px',
          color: PAPER_CSS.gold,
        });
        t.setOrigin?.(0.5);
        t.setDepth?.(BATTLE_DEPTH.VFX);
        t.setScrollFactor?.(0);
        s.tweens.add({ targets: t, alpha: 0, y: h * 0.3, duration: 700, onComplete: () => t.destroy() });
        tellRing(s, body, PAPER.gold, beat, { radius: 130 });
      });
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('theorem');
      const glyphs = ['+', '−', '×', '÷', '=', 'π', 'Σ', '?'];
      const w = scene.scale.width, h = scene.scale.height;
      const rain = 10 + ph(ctx) * 6;          // 16 glyphs → 28 by phase 3
      const extra = waves(scene, ctx, 950, (wave) => {
        for (let i = 0; i < rain; i++) {
          scene.time.delayedCall(i * 55, () => {
            const gx = w * (0.12 + Math.random() * 0.76);
            const t = scene.add.text(gx, -30, glyphs[i % glyphs.length], {
              fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '34px', color: PAPER_CSS.lavender,
            });
            t.setOrigin?.(0.5);
            t.setDepth?.(BATTLE_DEPTH.VFX);
            if (t.setScrollFactor) t.setScrollFactor(0);
            const landY = h * (0.4 + Math.random() * 0.2);
            scene.tweens.add({
              targets: t, y: landY, angle: (Math.random() - 0.5) * 120, duration: 480, ease: 'Cubic.in',
              onComplete: () => {
                playImpactRing(scene, t.x, t.y, { color: move.color, endRadius: 34, duration: 220 });
                scene.tweens.add({ targets: t, alpha: 0, duration: 260, onComplete: () => t.destroy() });
              },
            });
          });
        }
        if (wave === 0) {
          (ctx.heroSprites?.filter(Boolean) || []).forEach((sp, i) =>
            scene.time.delayedCall(650 + i * 130, () => strikeHero(scene, sp, move.color)));
        }
      });
      scene.time.delayedCall(1400 + extra, () => {
        playShockwave(scene, w * 0.5, h * 0.5, { color: move.color, endRadius: 240 + ph(ctx) * 50 });
        flash(scene, ctx, { color: PAPER.lavender, alpha: 0.35, duration: 220 });
      });
      finish(scene, b, 1900 + extra, done);
    },

    /**
     * THE FINAL BEAT — completion, not destruction.
     *
     * Every other boss ends with a burst and a fade. The Theorem is a
     * question the child has just answered, so it must RESOLVE: the
     * glyphs it has been throwing all fight converge, settle into one
     * line, and close with ∎ over a warm cream sunrise. Nothing
     * shatters. Nothing goes dark. The last image of the game is a
     * finished proof, not a corpse.
     */
    finale(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const body = b.body;
      const w = scene.scale.width, h = scene.scale.height;
      const cx = body?.x ?? w * 0.7;
      const cy = body?.y ?? h * 0.35;
      const midX = w * 0.5, midY = h * 0.42;
      const rm = !!ctx?.reducedMotion;

      // 1. The room goes quiet and warm — cream, never a blackout.
      if (!rm) playScreenFlash(scene, { color: PAPER.cream, alpha: 0.5, duration: 900 });

      // 2. The scattered proof gathers itself into one line.
      const marks = ['+', '−', '×', '÷', 'π', 'Σ', '?', '='];
      marks.forEach((m, i) => {
        scene.time.delayedCall(120 + i * 90, () => {
          const a = (i / marks.length) * Math.PI * 2;
          const t = scene.add.text(cx + Math.cos(a) * 260, cy + Math.sin(a) * 180, m, {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '46px', color: PAPER_CSS.lavender,
          });
          t.setOrigin?.(0.5);
          t.setDepth?.(BATTLE_DEPTH.VFX);
          t.setScrollFactor?.(0);
          scene.tweens.add({
            targets: t,
            x: midX - 130 + i * 34, y: midY,
            alpha: 0.9, duration: 900, ease: 'Cubic.inOut',
            onComplete: () => scene.tweens.add({
              targets: t, alpha: 0, duration: 500, onComplete: () => t.destroy(),
            }),
          });
        });
      });

      // 3. The unfinished circle in the arena closes.
      scene.time.delayedCall(1150, () => {
        playShockwave(scene, midX, midY, { color: PAPER.gold, endRadius: 420, duration: 900 });
        playImpactRing(scene, midX, midY, { color: PAPER.cream, endRadius: 300, duration: 700 });
      });

      // 4. Q.E.D. — the proof signs itself off.
      scene.time.delayedCall(1400, () => {
        const qed = scene.add.text(midX, midY, '∎', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '120px', color: PAPER_CSS.gold,
        });
        qed.setOrigin?.(0.5);
        qed.setDepth?.(BATTLE_DEPTH.END);
        qed.setScrollFactor?.(0);
        qed.setAlpha?.(0);
        scene.tweens.add({ targets: qed, alpha: 1, scaleX: 1.2, scaleY: 1.2, duration: 500, ease: 'Back.out' });
        const cap = scene.add.text(midX, midY + 110, 'SOLVED', {
          fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '40px', color: PAPER_CSS.teal,
        });
        cap.setOrigin?.(0.5);
        cap.setDepth?.(BATTLE_DEPTH.END);
        cap.setScrollFactor?.(0);
        scene.time.delayedCall(1100, () => { qed.destroy(); cap.destroy(); });
        for (let i = 0; i < 10; i++) {
          playSparkBurst(scene, midX, midY, {
            count: 6, colors: [PAPER.gold, PAPER.cream, PAPER.tealL],
            minDist: 60, maxDist: 260, duration: 1100, gravity: -20,
          });
        }
      });

      scene.time.delayedCall(rm ? 900 : 2700, () => { b.restore(); done(); });
    },
  },
};

// Generic fallback for any unknown boss id: today's entrance + a plain
// shockwave special. Never leaves the turn hanging.
export const GENERIC_RIG = {
  entrance: playBossEntrance,
  arena(scene) {
    return arenaRig(scene, (g, p, w, h) => {
      if (p === 1) return;
      g.fillStyle(p === 2 ? PAPER.sand : PAPER.gold, 0.14);
      g.fillRect(0, h * (p === 2 ? 0.8 : 0.62), w, h);
    });
  },
  special(scene, spriteData, ctx, done) {
    const b = beginBody(spriteData);
    const anchor = heroAnchor(scene, ctx);
    const extra = waves(scene, ctx, 500, (wave) => {
      playShockwave(scene, anchor.x, anchor.y, { color: PAPER.coralD, endRadius: 200 });
      if (wave === 0) (ctx.heroSprites?.filter(Boolean) || []).forEach(s => strikeHero(scene, s, PAPER.coralD));
    });
    shake(scene, ctx, 0.01, 240);
    finish(scene, b, 900 + extra, done);
  },
};

/** Rig for a boss id, or the generic fallback for anything unlisted. */
export function getBossRig(bossId) {
  return BOSS_RIGS[bossId] || GENERIC_RIG;
}
