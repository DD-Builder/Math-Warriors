/**
 * Boss spectacle rigs — bespoke signature-special choreography and a
 * cheap arena garnish for each of the nine bosses. PRESENTATION ONLY:
 * every rig is handed precomputed damage and just performs; BattleScene
 * mutates HP in the done() callback. bossPresentation.js stays the single
 * source of truth for cadence, damage and intent — rigs never touch it.
 *
 * Contract (see getBossRig):
 *   arena?(scene, spriteData|null)            one garnish layer; tolerates
 *                                             null (runs before enemy sprites)
 *   entrance?(scene, spriteData, enemy, done) MUST call done() exactly once
 *   special(scene, spriteData, ctx, done)     ctx = { party, heroSprites,
 *                                             perHeroDamage, reducedMotion };
 *                                             MUST call done() exactly once
 *
 * Anti-soft-lock rule: each special schedules all its VFX with
 * time.delayedCall and calls done() from ONE final delayedCall, so it
 * fires exactly once even against synchronous test stubs. BattleScene
 * additionally wraps done() in a watchdog.
 */

import { BOSS_IDS } from '../data/enemies.js';
import { getBossMove, playBossEntrance } from './bossPresentation.js';
import { BATTLE_DEPTH } from '../ui/depths.js';
import { PAPER } from '../config.js';
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
    count: 12, colors: [color, 0xffffff], minDist: 15, maxDist: 45, duration: 350,
  });
}

function shake(scene, ctx, intensity, dur) {
  if (ctx?.reducedMotion) return;
  scene.cameras?.main?.shake?.(dur, intensity);
}

function flash(scene, ctx, overrides) {
  if (ctx?.reducedMotion) return;
  playScreenFlash(scene, overrides);
}

// Schedule the single done() that also restores the body. `ms` is the
// rig's total run time; keep it under the BattleScene watchdog (5s).
function finish(scene, b, ms, done) {
  scene.time.delayedCall(ms, () => { b.restore(); done(); });
}

// ── shared drawing helper for arena garnish ──────────────────────────
function arenaLayer(scene) {
  const g = scene.add.graphics();
  g.setDepth(ARENA_DEPTH);
  if (g.setScrollFactor) g.setScrollFactor(0);
  return g;
}

// ────────────────────────────────────────────────────────────────────
// THE NINE RIGS
// ────────────────────────────────────────────────────────────────────

export const BOSS_RIGS = {
  // 1 — Briarking · THORN STORM: three rows of green cracks march to the
  // hero line, thorns erupting, staggered hits, closing shockwave.
  briarking: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0x2f5a24, 0.5);
      for (let i = 0; i < 5; i++) {
        const x = w * (0.08 + i * 0.21);
        g.fillTriangle(x - 26, h * 0.42, x + 26, h * 0.42, x, h * 0.18);
      }
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('briarking');
      const anchor = heroAnchor(scene, ctx);
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      for (let row = 0; row < 3; row++) {
        scene.time.delayedCall(row * 200, () => {
          const y = anchor.y + 60 - row * 40;
          for (let c = 0; c < 4; c++) {
            const x = scene.scale.width * (0.14 + c * 0.06);
            playGroundCrack(scene, x, y, { color: move.color, lineCount: 3, length: 46, alpha: 0.8 });
          }
        });
      }
      hs.forEach((sprite, i) => {
        scene.time.delayedCall(700 + i * 180, () => strikeHero(scene, sprite, move.color));
      });
      scene.time.delayedCall(1500, () => { playShockwave(scene, anchor.x, anchor.y, { color: move.color, endRadius: 220 }); shake(scene, ctx, 0.01, 260); });
      finish(scene, b, 1900, done);
    },
  },

  // 2 — Pressure · TIDAL CRUSH: a translucent teal wall rises and crests
  // across the party, bubbles rising, hits as it passes each hero.
  pressure: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.lineStyle(4, 0x40a8d0, 0.35);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(w * 0.5, h * (0.7 + i * 0.12), w * 0.5, Math.PI, 0, false);
        g.strokePath();
      }
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('pressure');
      const w = scene.scale.width, h = scene.scale.height;
      const wave = scene.add.rectangle(w / 2, h + 40, w, h * 0.9, move.color, 0.34).setDepth(BATTLE_DEPTH.VFX);
      if (wave.setScrollFactor) wave.setScrollFactor(0);
      scene.tweens.add({ targets: wave, y: h * 0.55, duration: 700, ease: 'Cubic.in',
        onComplete: () => scene.tweens.add({ targets: wave, y: h + 40, alpha: 0, duration: 500, onComplete: () => wave.destroy() }) });
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      hs.forEach((sprite, i) => {
        scene.time.delayedCall(400 + i * 150, () => {
          playSparkBurst(scene, sprite.x, sprite.y, { count: 14, colors: [0x9fe0f0, 0xffffff], gravity: -40, minDist: 10, maxDist: 40 });
          strikeHero(scene, sprite, move.color);
        });
      });
      scene.time.delayedCall(900, () => shake(scene, ctx, 0.009, 300));
      finish(scene, b, 1500, done);
    },
  },

  // 3 — Skywhale · THUNDER DIVE: body launches offscreen, a shadow slides
  // under the party, then it slams down — double shockwave, all hit at once.
  skywhale: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0xffffff, 0.16);
      g.fillEllipse(w * 0.5, h * 0.12, w * 0.8, h * 0.14);
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('skywhale');
      const anchor = heroAnchor(scene, ctx);
      const body = b.body;
      const shadow = scene.add.ellipse(anchor.x, anchor.y + 40, 40, 16, 0x102028, 0.4).setDepth(BATTLE_DEPTH.SHADOWS);
      if (body) {
        scene.tweens.add({ targets: body, y: (b.orig?.y ?? body.y) - scene.scale.height * 0.7, duration: 420, ease: 'Quad.in' });
      }
      scene.tweens.add({ targets: shadow, scaleX: 6, scaleY: 6, duration: 620, ease: 'Quad.in' });
      scene.time.delayedCall(700, () => {
        if (body) { body.x = anchor.x; body.y = anchor.y - 20; }
        if (body) playHitStop(scene, body, { duration: 60 });
        playShockwave(scene, anchor.x, anchor.y, { color: move.color, endRadius: 200 });
        playShockwave(scene, anchor.x, anchor.y, { color: 0xffffff, endRadius: 280, duration: 420 });
        playGroundCrack(scene, anchor.x, anchor.y, { color: move.color, lineCount: 6, length: 80 });
        (ctx.heroSprites?.filter(Boolean) || []).forEach(s => strikeHero(scene, s, move.color));
        shake(scene, ctx, 0.016, 320);
        shadow.destroy();
      });
      finish(scene, b, 1400, done);
    },
  },

  // 4 — Pyroclast · MAGMA BURST: meteors arc down onto each hero with a
  // fiery burst, ember rain after.
  pyroclast: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0xe04808, 0.14);
      g.fillEllipse(w * 0.72, h * 0.4, w * 0.5, h * 0.5);
      g.lineStyle(3, 0xe86828, 0.4);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(w * (0.5 + i * 0.12), h * 0.52); g.lineTo(w * (0.54 + i * 0.12), h * 0.62); g.strokePath(); }
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('pyroclast');
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      const targets = hs.length ? hs.map(s => ({ x: s.x, y: s.y - 10 })) : [{ x: scene.scale.width * 0.3, y: scene.scale.height * 0.6 }];
      targets.forEach((pt, i) => {
        scene.time.delayedCall(i * 160, () => {
          playProjectile(scene, sx, sy - 30, pt.x, pt.y, { color: 0xff6a20, size: 12, speed: 900 });
          scene.time.delayedCall(220, () => {
            playElementalBurst(scene, pt.x, pt.y, { colors: [0xff8030, 0xffd040, move.color] });
            strikeHero(scene, hs[i], move.color);
          });
        });
      });
      scene.time.delayedCall(900, () => { for (let i = 0; i < 10; i++) playSparkBurst(scene, scene.scale.width * (0.15 + Math.random() * 0.6), scene.scale.height * 0.2, { count: 3, colors: [0xff8030, 0xe04808], gravity: 120, minDist: 5, maxDist: 20, duration: 700 }); });
      scene.time.delayedCall(600, () => shake(scene, ctx, 0.012, 280));
      finish(scene, b, 1700, done);
    },
  },

  // 5 — Absolutezero · WHITEOUT: a long icy flash and frost shards from the
  // corners, a beat of stillness, then a simultaneous shatter.
  absolutezero: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0x9cd0e8, 0.3);
      const spikes = [[0, 0], [w, 0]];
      for (const [cx] of spikes) {
        for (let i = 0; i < 4; i++) {
          const x = cx === 0 ? i * 40 : w - i * 40;
          g.fillTriangle(x, 0, x + 20, 0, x + 10, 40 + i * 8);
        }
      }
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('absolutezero');
      const w = scene.scale.width, h = scene.scale.height;
      flash(scene, ctx, { color: 0xdff2ff, alpha: 0.6, duration: 600 });
      const shards = [];
      for (const corner of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const s = scene.add.triangle(corner[0], corner[1], 0, 0, 90, 30, 30, 110, 0xbfe6f5, 0.6).setDepth(BATTLE_DEPTH.VFX);
        if (s.setScrollFactor) s.setScrollFactor(0);
        s.setScale?.(0);
        shards.push(s);
        scene.tweens.add({ targets: s, scaleX: 1, scaleY: 1, duration: 400, ease: 'Quad.out' });
      }
      scene.time.delayedCall(850, () => {
        (ctx.heroSprites?.filter(Boolean) || []).forEach(sp => {
          playSparkBurst(scene, sp.x, sp.y - 20, { count: 16, colors: [0xffffff, 0x9cd0e8], minDist: 20, maxDist: 60 });
          playImpactRing(scene, sp.x, sp.y - 20, { color: 0xbfe6f5, endRadius: 80 });
        });
        shards.forEach(s => scene.tweens.add({ targets: s, alpha: 0, duration: 250, onComplete: () => s.destroy() }));
        shake(scene, ctx, 0.008, 220);
      });
      finish(scene, b, 1500, done);
    },
  },

  // 6 — Theprism · SHATTER RAY: a beam to mid-field refracts into three
  // hue-shifted beams, one per hero, each ringing on impact.
  theprism: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      const cols = [0xb090e8, 0x90c8e8, 0xe8a0d0];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(cols[i], 0.14);
        const x = w * (0.3 + i * 0.2);
        g.fillTriangle(x, h * 0.2, x - 30, h * 0.5, x + 30, h * 0.5);
      }
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const midX = scene.scale.width * 0.5, midY = scene.scale.height * 0.45;
      const cols = [0xb090e8, 0x90d0f0, 0xf0a0d0];
      playBeamTrail(scene, sx, sy, midX, midY, { color: 0xe8e0ff });
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      scene.time.delayedCall(300, () => {
        (hs.length ? hs : [{ x: midX, y: midY }]).forEach((sp, i) => {
          scene.time.delayedCall(i * 120, () => {
            playBeamTrail(scene, midX, midY, sp.x, sp.y, { color: cols[i % 3], trailColor: cols[i % 3] });
            playImpactRing(scene, sp.x, sp.y - 20, { color: cols[i % 3], endRadius: 70 });
          });
        });
      });
      scene.time.delayedCall(700, () => flash(scene, ctx, { color: 0xe8d8ff, alpha: 0.4, duration: 200 }));
      finish(scene, b, 1500, done);
    },
  },

  // 7 — Counterfeiter · COIN AVALANCHE: a ring of coins orbits, then
  // spirals outward to the heroes with gold bursts on each hit.
  counterfeiter: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0xecb964, 0.4);
      for (let i = 0; i < 8; i++) g.fillCircle(w * (0.1 + Math.random() * 0.8), h * (0.42 + Math.random() * 0.06), 5 + Math.random() * 4);
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('counterfeiter');
      const body = b.body;
      const sx = body?.x ?? scene.scale.width * 0.7;
      const sy = body?.y ?? scene.scale.height * 0.3;
      const coins = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const coin = scene.add.circle(sx + Math.cos(a) * 60, sy + Math.sin(a) * 40, 8, move.color).setDepth(BATTLE_DEPTH.VFX);
        if (coin.setStrokeStyle) coin.setStrokeStyle(2, 0xffe8a0, 0.9);
        coins.push(coin);
      }
      const hs = ctx.heroSprites?.filter(Boolean) || [];
      coins.forEach((coin, i) => {
        const tgt = hs.length ? hs[i % hs.length] : { x: scene.scale.width * 0.3, y: scene.scale.height * 0.6 };
        scene.time.delayedCall(400 + i * 60, () => {
          scene.tweens.add({ targets: coin, x: tgt.x, y: tgt.y - 20, duration: 400, ease: 'Cubic.in',
            onComplete: () => { playSparkBurst(scene, coin.x, coin.y, { count: 8, colors: [move.color, 0xffe8a0] }); coin.destroy(); } });
        });
      });
      hs.forEach((sp, i) => scene.time.delayedCall(800 + i * 120, () => strikeHero(scene, sp, move.color)));
      scene.time.delayedCall(900, () => shake(scene, ctx, 0.008, 240));
      finish(scene, b, 1700, done);
    },
  },

  // 8 — Theparadox · INK ECLIPSE: an inky circle swallows the screen, a
  // held beat with two white eyes, hits land in the dark, then it collapses.
  theparadox: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(PAPER.inkTeal, 0.5);
      g.fillTriangle(0, 0, 70, 0, 0, 90);
      g.fillTriangle(w, 0, w - 70, 0, w, 90);
      g.fillTriangle(0, h, 70, h, 0, h - 90);
      g.fillTriangle(w, h, w - 70, h, w, h - 90);
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const body = b.body;
      const cx = body?.x ?? scene.scale.width * 0.7;
      const cy = body?.y ?? scene.scale.height * 0.3;
      const dark = scene.add.circle(cx, cy, 10, PAPER.inkTeal, 0.9).setDepth(BATTLE_DEPTH.VFX + 1);
      if (dark.setScrollFactor) dark.setScrollFactor(0);
      scene.tweens.add({ targets: dark, radius: 1600, duration: 500, ease: 'Cubic.in' });
      const eyeY = scene.scale.height * 0.4;
      const eyes = [scene.add.circle(scene.scale.width * 0.44, eyeY, 12, 0xffffff, 0).setDepth(BATTLE_DEPTH.VFX + 2),
                    scene.add.circle(scene.scale.width * 0.56, eyeY, 12, 0xffffff, 0).setDepth(BATTLE_DEPTH.VFX + 2)];
      scene.time.delayedCall(520, () => eyes.forEach(e => scene.tweens.add({ targets: e, alpha: 1, duration: 200, yoyo: true, hold: 400 })));
      scene.time.delayedCall(700, () => (ctx.heroSprites?.filter(Boolean) || []).forEach(sp => playImpactRing(scene, sp.x, sp.y - 20, { color: 0xffffff, endRadius: 70 })));
      scene.time.delayedCall(1050, () => {
        scene.tweens.add({ targets: dark, radius: 10, alpha: 0, duration: 350, ease: 'Quad.in', onComplete: () => dark.destroy() });
        eyes.forEach(e => e.destroy());
        shake(scene, ctx, 0.01, 260);
      });
      finish(scene, b, 1600, done);
    },
  },

  // 9 — Theorem · PROOF OF RUIN: math glyphs rain down and land with tiny
  // rings, finishing on a shockwave and a violet flash.
  theorem: {
    arena(scene) {
      const g = arenaLayer(scene);
      const w = scene.scale.width, h = scene.scale.height;
      g.fillStyle(0x9070d8, 0.12);
      for (let i = 0; i < 6; i++) g.fillCircle(w * (0.12 + i * 0.15), h * (0.2 + (i % 2) * 0.1), 26);
      return g;
    },
    special(scene, spriteData, ctx, done) {
      const b = beginBody(spriteData);
      const move = getBossMove('theorem');
      const glyphs = ['+', '−', '×', '÷', '=', 'π', 'Σ', '?'];
      const w = scene.scale.width, h = scene.scale.height;
      for (let i = 0; i < 14; i++) {
        scene.time.delayedCall(i * 70, () => {
          const gx = w * (0.12 + Math.random() * 0.76);
          const t = scene.add.text(gx, -30, glyphs[i % glyphs.length], {
            fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontSize: '34px', color: '#b79cf0',
          }).setOrigin(0.5).setDepth(BATTLE_DEPTH.VFX);
          if (t.setScrollFactor) t.setScrollFactor(0);
          const landY = h * (0.4 + Math.random() * 0.2);
          scene.tweens.add({ targets: t, y: landY, angle: (Math.random() - 0.5) * 120, duration: 500, ease: 'Cubic.in',
            onComplete: () => { playImpactRing(scene, t.x, t.y, { color: move.color, endRadius: 34, duration: 220 }); scene.tweens.add({ targets: t, alpha: 0, duration: 260, onComplete: () => t.destroy() }); } });
        });
      }
      (ctx.heroSprites?.filter(Boolean) || []).forEach((sp, i) => scene.time.delayedCall(700 + i * 140, () => strikeHero(scene, sp, move.color)));
      scene.time.delayedCall(1500, () => { playShockwave(scene, w * 0.5, h * 0.5, { color: move.color, endRadius: 240 }); flash(scene, ctx, { color: 0xd8c8f8, alpha: 0.35, duration: 220 }); });
      finish(scene, b, 1900, done);
    },
  },
};

// Generic fallback for any unknown boss id: today's entrance + a plain
// shockwave special. Never leaves the turn hanging.
export const GENERIC_RIG = {
  entrance: playBossEntrance,
  special(scene, spriteData, ctx, done) {
    const b = beginBody(spriteData);
    const anchor = heroAnchor(scene, ctx);
    playShockwave(scene, anchor.x, anchor.y, { color: 0xc04030, endRadius: 200 });
    (ctx.heroSprites?.filter(Boolean) || []).forEach(s => strikeHero(scene, s, 0xc04030));
    shake(scene, ctx, 0.01, 240);
    finish(scene, b, 900, done);
  },
};

/** Rig for a boss id, or the generic fallback for anything unlisted. */
export function getBossRig(bossId) {
  return BOSS_RIGS[bossId] || GENERIC_RIG;
}
