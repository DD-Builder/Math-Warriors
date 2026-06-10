/**
 * Attack animation system
 *
 * Extracted from BattleScene and enhanced. Two tiers:
 *   FIGHT: enhanced current animations with hit-pause and better particles (200-400ms)
 *   MAGIC: NEW spectacular per-class animations (900ms)
 *   SUPER: per-hero ultimate attacks (800-1200ms)
 *
 * The ATTACK_REGISTRY maps each hero ID to personalized fight/magic/super
 * animations. The dispatch functions (playFightAnimation, playMagicAnimation)
 * check the registry first and fall through to class-based defaults.
 *
 * Hit-pause: brief 80ms white tint freeze on the target at moment of impact.
 * This makes hits feel like they LAND — a proven technique from fighting games.
 */

import {
  playSparkBurst,
  playImpactRing,
  playSlashArc,
  playScreenFlash,
  playBeamTrail,
  playElementalBurst,
  playGroundCrack,
  playProjectile,
  playShockwave,
  playHitStop,
} from './vfx.js';

// ================================================================
// ATTACK REGISTRY — per-hero personalized attacks
// ================================================================

export const ATTACK_REGISTRY = {
  // ────────────────────────────────────────────────
  // KNIGHTS
  // ────────────────────────────────────────────────

  'knight-shadow': {
    // Shadow-step dash — teleport flash, dark slash arcs
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Teleport flash at hero origin
      playScreenFlash(scene, { color: 0x1a0a30, alpha: 0.3, duration: 100 });
      // Blink to enemy
      scene.time.delayedCall(80, () => {
        if (hero.body) hero.body.setAlpha(0);
        // Dark afterimage at origin
        playSparkBurst(scene, hero.x, hero.y, { count: 8, colors: [0x2a1050, 0x4020a0], minDist: 10, maxDist: 30, duration: 200 });
        scene.time.delayedCall(100, () => {
          if (hero.body) { hero.body.setAlpha(1); hero.body.x = ex - 60; }
          playSlashArc(scene, ex, ey, { color: 0x3a1080, lineWidth: 6, alpha: 0.9, duration: 250 });
          scene.time.delayedCall(30, () => {
            playSlashArc(scene, ex, ey, { color: 0x6030c0, lineWidth: 4, alpha: 0.7, arcSpread: 70, duration: 250 });
          });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0x6030c0, endRadius: 50 });
          playSparkBurst(scene, ex, ey, { count: 18, colors: [0x6030c0, 0x3a1080, 0x201060] });
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 200, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        });
      });
    },
    // Dark slash arcs with void pull
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Dark energy converge on hero
      playSparkBurst(scene, hero.x, hero.y - 30, { count: 12, colors: [0x2a1050, 0x4020a0], minDist: 40, maxDist: 70, duration: 200, gravity: -20 });
      scene.time.delayedCall(200, () => {
        // Shadow step flash
        playScreenFlash(scene, { color: 0x1a0a30, alpha: 0.4, duration: 120 });
        if (hero.body) hero.body.setAlpha(0);
        scene.time.delayedCall(80, () => {
          if (hero.body) { hero.body.setAlpha(1); hero.body.x = ex - 50; }
          // Triple dark slash staggered
          for (let i = 0; i < 3; i++) {
            scene.time.delayedCall(i * 80, () => {
              playSlashArc(scene, ex + (i - 1) * 15, ey, { color: 0x6030c0, lineWidth: 5 + i, alpha: 0.9 - i * 0.1, duration: 280 });
              playSparkBurst(scene, ex, ey, { count: 10, colors: [0x6030c0, 0x3a1080] });
            });
          }
          scene.time.delayedCall(240, () => {
            hitPause(scene, { body: hero.body }, 80);
            playImpactRing(scene, ex, ey, { color: 0x4020a0, endRadius: 100 });
            playShockwave(scene, ex, ey, { color: 0x6030c0, endRadius: 140 });
            scene.cameras.main.shake(150, 0.012);
            enemyHitReaction(scene, target, result.modifiedDamage);
            cb.onHit?.();
            scene.tweens.add({
              targets: hero.body, x: hero.x, duration: 200, delay: 100, ease: 'Sine.in',
              onComplete: () => cb.onComplete?.(),
            });
          });
        });
      });
    },
    // Shadow clone burst
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-300ms: 3 shadow clones appear
      playScreenFlash(scene, { color: 0x0a0020, alpha: 0.35, duration: 200 });
      const clonePositions = [
        { x: ex - 80, y: ey - 40 }, { x: ex + 60, y: ey - 30 }, { x: ex - 20, y: ey + 40 },
      ];
      clonePositions.forEach((pos, i) => {
        scene.time.delayedCall(i * 80, () => {
          playSparkBurst(scene, pos.x, pos.y, { count: 6, colors: [0x2a1050, 0x6030c0], duration: 300 });
        });
      });
      scene.time.delayedCall(300, () => {
        // 300-700ms: All clones slash simultaneously
        for (let i = 0; i < 5; i++) {
          scene.time.delayedCall(i * 60, () => {
            playSlashArc(scene, ex + (Math.random() - 0.5) * 30, ey + (Math.random() - 0.5) * 20, {
              color: i < 3 ? 0x6030c0 : 0x9050f0, lineWidth: 5 + i, alpha: 0.9, duration: 250,
            });
            playSparkBurst(scene, ex, ey, { count: 8, colors: [0x6030c0, 0x9050f0, 0x2a1050] });
          });
        }
        scene.time.delayedCall(350, () => {
          // Final dark detonation
          playScreenFlash(scene, { color: 0x4020a0, alpha: 0.4, duration: 200 });
          playShockwave(scene, ex, ey, { color: 0x6030c0, endRadius: 160, strokeWidth: 5 });
          playImpactRing(scene, ex, ey, { color: 0x9050f0, endRadius: 120 });
          playElementalBurst(scene, ex, ey, { count: 40, colors: [0x6030c0, 0x9050f0, 0x2a1050, 0x4020a0] });
          scene.cameras.main.shake(200, 0.02);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(300, () => cb.onComplete?.());
        });
      });
    },
  },

  'knight-crusader': {
    // Cross-pattern slash with holy sparks
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 70, duration: 300, ease: 'Back.out',
        onComplete: () => {
          // Cross slash: two arcs forming an X
          playSlashArc(scene, ex, ey, { color: 0xf0e060, lineWidth: 5, alpha: 0.95, duration: 280 });
          scene.time.delayedCall(40, () => {
            playSlashArc(scene, ex, ey, { color: 0xfff8a0, lineWidth: 4, alpha: 0.8, arcSpread: 75, duration: 280 });
          });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xf0e060, endRadius: 55 });
          playSparkBurst(scene, ex, ey, { count: 28, colors: [0xfff8a0, 0xf0e060, 0xffd040] });
          scene.cameras.main.shake(120, 0.008);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 250, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Holy light beam from above
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-300ms: Pillar of light charges from above
      playBeamTrail(scene, ex, ey - 300, ex, ey, { color: 0xfff8a0, trailColor: 0xf0e060, particleCount: 50, width: 30, duration: 300 });
      playSparkBurst(scene, hero.x, hero.y - 30, { count: 8, colors: [0xf0e060, 0xfff8a0], duration: 300 });
      scene.time.delayedCall(300, () => {
        // 300-600ms: Light pillar strikes
        playScreenFlash(scene, { color: 0xfff8a0, alpha: 0.4, duration: 200 });
        playImpactRing(scene, ex, ey, { color: 0xf0e060, endRadius: 100 });
        playShockwave(scene, ex, ey, { color: 0xfff8a0, endRadius: 130 });
        playElementalBurst(scene, ex, ey, { count: 40, colors: [0xf0e060, 0xfff8a0, 0xffd040] });
        scene.cameras.main.shake(180, 0.015);
        hitPause(scene, { body: hero.body }, 80);
        enemyHitReaction(scene, target, result.modifiedDamage);
        cb.onHit?.();
        scene.time.delayedCall(300, () => cb.onComplete?.());
      });
    },
    // Golden shockwave
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-300ms: Hero charges with golden glow
      if (hero.body) hero.body.setTint(0xffd040);
      playSparkBurst(scene, hero.x, hero.y - 20, { count: 12, colors: [0xffd040, 0xfff8a0], minDist: 50, maxDist: 80, duration: 250, gravity: -15 });
      scene.time.delayedCall(300, () => {
        if (hero.body) hero.body.clearTint();
        scene.tweens.add({
          targets: hero.body, x: ex - 60, duration: 200, ease: 'Back.out',
          onComplete: () => {
            // Cross slash pattern
            for (let i = 0; i < 4; i++) {
              scene.time.delayedCall(i * 50, () => {
                playSlashArc(scene, ex + (i - 2) * 10, ey, { color: 0xffd040, lineWidth: 6 + i, alpha: 0.9, duration: 300 });
              });
            }
            scene.time.delayedCall(200, () => {
              // Golden shockwave detonation
              playScreenFlash(scene, { color: 0xffd040, alpha: 0.45, duration: 250 });
              playShockwave(scene, ex, ey, { color: 0xffd040, endRadius: 180, strokeWidth: 6 });
              playImpactRing(scene, ex, ey, { color: 0xfff8a0, endRadius: 140 });
              playElementalBurst(scene, ex, ey, { count: 50, colors: [0xffd040, 0xfff8a0, 0xf0c020, 0xffffff] });
              playGroundCrack(scene, ex, ey + 20, { color: 0xffd040, length: 80, lineCount: 6 });
              scene.cameras.main.shake(250, 0.025);
              hitPause(scene, { body: hero.body }, 80);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 250, delay: 150, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
            });
          },
        });
      });
    },
  },

  'knight-paladin': {
    // Staff thrust with light trail
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 60, duration: 300, ease: 'Back.out',
        onComplete: () => {
          playBeamTrail(scene, hero.x, hero.y, ex, ey, { color: 0xf0f0ff, trailColor: 0xa0c0f0, particleCount: 20, duration: 200 });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xc0d8f0, endRadius: 50 });
          playSparkBurst(scene, ex, ey, { count: 22, colors: [0xf0f0ff, 0xc0d8f0, 0xa0c0f0] });
          scene.cameras.main.shake(100, 0.006);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 250, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Shield bash shockwave
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Shield glow charge
      playSparkBurst(scene, hero.x + 20, hero.y - 10, { count: 10, colors: [0xc0d8f0, 0xf0f0ff], minDist: 30, maxDist: 60, duration: 200, gravity: -10 });
      scene.time.delayedCall(200, () => {
        // 200-500ms: Charge forward with shield bash
        scene.tweens.add({
          targets: hero.body, x: ex - 50, duration: 200, ease: 'Back.out',
          onComplete: () => {
            hitPause(scene, { body: hero.body }, 80);
            playScreenFlash(scene, { color: 0xc0d8f0, alpha: 0.3, duration: 150 });
            playShockwave(scene, ex, ey, { color: 0xc0d8f0, endRadius: 130, strokeWidth: 5 });
            playImpactRing(scene, ex, ey, { color: 0xf0f0ff, endRadius: 90 });
            playElementalBurst(scene, ex, ey, { count: 35, colors: [0xf0f0ff, 0xc0d8f0, 0xa0c0f0] });
            scene.cameras.main.shake(180, 0.014);
            enemyHitReaction(scene, target, result.modifiedDamage);
            cb.onHit?.();
            scene.tweens.add({
              targets: hero.body, x: hero.x, duration: 200, delay: 150, ease: 'Sine.in',
              onComplete: () => cb.onComplete?.(),
            });
          },
        });
      });
    },
    // Divine judgment pillar
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-400ms: Raise shield, divine energy gathering
      if (hero.body) hero.body.setTint(0xf0f0ff);
      playSparkBurst(scene, hero.x, hero.y - 20, { count: 16, colors: [0xf0f0ff, 0xa0c0f0], minDist: 50, maxDist: 90, duration: 350, gravity: -20 });
      scene.time.delayedCall(400, () => {
        if (hero.body) hero.body.clearTint();
        // 400-700ms: Divine pillar descends on enemy
        playBeamTrail(scene, ex, ey - 350, ex, ey, { color: 0xf0f0ff, trailColor: 0xc0d8f0, particleCount: 60, width: 40, duration: 300 });
        scene.time.delayedCall(300, () => {
          // 700-1000ms: Massive holy detonation
          playScreenFlash(scene, { color: 0xffffff, alpha: 0.5, duration: 250 });
          playShockwave(scene, ex, ey, { color: 0xf0f0ff, endRadius: 180, strokeWidth: 6 });
          playImpactRing(scene, ex, ey, { color: 0xc0d8f0, endRadius: 150 });
          scene.time.delayedCall(60, () => playImpactRing(scene, ex, ey, { color: 0xa0c0f0, endRadius: 200 }));
          playElementalBurst(scene, ex, ey, { count: 55, colors: [0xf0f0ff, 0xc0d8f0, 0xa0c0f0, 0xffffff] });
          playGroundCrack(scene, ex, ey + 20, { color: 0xc0d8f0, length: 70, lineCount: 5 });
          scene.cameras.main.shake(250, 0.025);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(300, () => cb.onComplete?.());
        });
      });
    },
  },

  'knight-berserker': {
    // Wild axe swings — multiple slash arcs
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 70, duration: 280, ease: 'Back.out',
        onComplete: () => {
          // 3 rapid wild slashes
          for (let i = 0; i < 3; i++) {
            scene.time.delayedCall(i * 50, () => {
              const ox = (Math.random() - 0.5) * 20;
              const oy = (Math.random() - 0.5) * 20;
              playSlashArc(scene, ex + ox, ey + oy, { color: 0xff4020, lineWidth: 5 + i, alpha: 0.9, duration: 250 });
            });
          }
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xff4020, endRadius: 55 });
          playSparkBurst(scene, ex, ey, { count: 30, colors: [0xff4020, 0xff6030, 0xffa040] });
          scene.cameras.main.shake(140, 0.01);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 250, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Rage flame burst
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Rage buildup (red tint, shake)
      if (hero.body) hero.body.setTint(0xff2020);
      playSparkBurst(scene, hero.x, hero.y, { count: 14, colors: [0xff4020, 0xff6030], minDist: 20, maxDist: 50, duration: 200 });
      scene.time.delayedCall(200, () => {
        if (hero.body) hero.body.clearTint();
        // 200-450ms: Berserk charge
        scene.tweens.add({
          targets: hero.body, x: ex - 50, duration: 200, ease: 'Quad.out',
          onComplete: () => {
            // 450-700ms: Flaming slashes
            for (let i = 0; i < 5; i++) {
              scene.time.delayedCall(i * 40, () => {
                playSlashArc(scene, ex + (Math.random() - 0.5) * 25, ey + (Math.random() - 0.5) * 20, {
                  color: i % 2 === 0 ? 0xff4020 : 0xff8040, lineWidth: 4 + i, alpha: 0.85, duration: 260,
                });
              });
            }
            scene.time.delayedCall(200, () => {
              hitPause(scene, { body: hero.body }, 80);
              playScreenFlash(scene, { color: 0xff2020, alpha: 0.3, duration: 180 });
              playImpactRing(scene, ex, ey, { color: 0xff4020, endRadius: 100 });
              playElementalBurst(scene, ex, ey, { count: 40, colors: [0xff4020, 0xff6030, 0xffa040, 0xffcc30] });
              scene.cameras.main.shake(200, 0.018);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 200, delay: 150, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
            });
          },
        });
      });
    },
    // Ground-shatter smash
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-350ms: Rage charge (body grows, red glow)
      if (hero.body) {
        hero.body.setTint(0xff2020);
        const osx = hero.body.scaleX, osy = hero.body.scaleY;
        scene.tweens.add({ targets: hero.body, scaleX: osx * 1.15, scaleY: osy * 1.15, duration: 350, ease: 'Cubic.in' });
      }
      playSparkBurst(scene, hero.x, hero.y, { count: 16, colors: [0xff2020, 0xff4020], minDist: 40, maxDist: 80, duration: 300, gravity: -20 });
      scene.time.delayedCall(350, () => {
        if (hero.body) hero.body.clearTint();
        // 350-600ms: Leap and slam
        scene.tweens.add({
          targets: hero.body, x: ex - 40, y: hero.y - 80, duration: 150, ease: 'Quad.out',
          onComplete: () => {
            scene.tweens.add({
              targets: hero.body, y: hero.y, duration: 100, ease: 'Quad.in',
              onComplete: () => {
                // 600-1000ms: Ground shatter impact
                playScreenFlash(scene, { color: 0xff4020, alpha: 0.45, duration: 250 });
                playGroundCrack(scene, ex, ey + 20, { color: 0xff4020, length: 100, lineCount: 8, lineWidth: 4 });
                playShockwave(scene, ex, ey, { color: 0xff4020, endRadius: 200, strokeWidth: 6 });
                playImpactRing(scene, ex, ey, { color: 0xffa040, endRadius: 150 });
                playElementalBurst(scene, ex, ey, { count: 55, colors: [0xff4020, 0xff6030, 0xffa040, 0xffcc30] });
                scene.cameras.main.shake(300, 0.03);
                hitPause(scene, { body: hero.body }, 80);
                enemyHitReaction(scene, target, result.modifiedDamage);
                cb.onHit?.();
                if (hero.body) {
                  const osx2 = hero.body.scaleX / 1.15, osy2 = hero.body.scaleY / 1.15;
                  scene.tweens.add({ targets: hero.body, scaleX: osx2, scaleY: osy2, duration: 100 });
                }
                scene.tweens.add({
                  targets: hero.body, x: hero.x, duration: 250, delay: 150, ease: 'Sine.in',
                  onComplete: () => cb.onComplete?.(),
                });
              },
            });
          },
        });
      });
    },
  },

  'knight-greathelm': {
    // Precision great-sword strike
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Slow deliberate advance
      scene.tweens.add({
        targets: hero.body, x: ex - 80, duration: 380, ease: 'Sine.out',
        onComplete: () => {
          // Single massive slash arc
          playSlashArc(scene, ex, ey, { color: 0xd0d8e0, lineWidth: 8, alpha: 0.95, arcSpread: 100, duration: 300 });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xd0d8e0, endRadius: 60, strokeWidth: 4 });
          playSparkBurst(scene, ex, ey, { count: 25, colors: [0xd0d8e0, 0xf0f0f0, 0xa0a8b0] });
          scene.cameras.main.shake(120, 0.008);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 280, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Blade beam projectile
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-250ms: Sword wind-up
      playSlashArc(scene, hero.x + 30, hero.y - 20, { color: 0xd0d8e0, lineWidth: 6, alpha: 0.8, duration: 250 });
      scene.time.delayedCall(250, () => {
        // 250-550ms: Blade beam projectile
        playProjectile(scene, hero.x + 50, hero.y - 20, ex, ey, { size: 12, color: 0xd0d8e0, speed: 700 }).then(() => {
          playScreenFlash(scene, { color: 0xd0d8e0, alpha: 0.3, duration: 180 });
          playImpactRing(scene, ex, ey, { color: 0xd0d8e0, endRadius: 90 });
          playShockwave(scene, ex, ey, { color: 0xf0f0f0, endRadius: 120 });
          playElementalBurst(scene, ex, ey, { count: 35, colors: [0xd0d8e0, 0xf0f0f0, 0xa0a8b0] });
          scene.cameras.main.shake(180, 0.015);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(200, () => cb.onComplete?.());
        });
      });
    },
    // Earthquake shockwave
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-350ms: Raise great-sword skyward
      if (hero.body) hero.body.setTint(0xd0d8e0);
      playSparkBurst(scene, hero.x, hero.y - 40, { count: 14, colors: [0xd0d8e0, 0xf0f0f0], minDist: 40, maxDist: 70, duration: 300, gravity: -25 });
      scene.time.delayedCall(350, () => {
        if (hero.body) hero.body.clearTint();
        // 350-600ms: Leap and strike
        scene.tweens.add({
          targets: hero.body, x: ex - 50, y: hero.y - 60, duration: 150, ease: 'Quad.out',
          onComplete: () => {
            scene.tweens.add({
              targets: hero.body, y: hero.y, duration: 100, ease: 'Quad.in',
              onComplete: () => {
                // 600-1000ms: Earthquake
                playScreenFlash(scene, { color: 0xffffff, alpha: 0.45, duration: 250 });
                playSlashArc(scene, ex, ey, { color: 0xd0d8e0, lineWidth: 10, alpha: 0.95, arcSpread: 120, duration: 350 });
                playGroundCrack(scene, ex, ey + 20, { color: 0x8a7a60, length: 110, lineCount: 8, lineWidth: 4 });
                playShockwave(scene, ex, ey, { color: 0xd0d8e0, endRadius: 200, strokeWidth: 6 });
                scene.time.delayedCall(80, () => playShockwave(scene, ex, ey, { color: 0xa0a8b0, endRadius: 250, strokeWidth: 4 }));
                playElementalBurst(scene, ex, ey, { count: 50, colors: [0xd0d8e0, 0xa0a8b0, 0x8a7a60, 0xf0f0f0] });
                scene.cameras.main.shake(350, 0.03);
                hitPause(scene, { body: hero.body }, 80);
                enemyHitReaction(scene, target, result.modifiedDamage);
                cb.onHit?.();
                scene.tweens.add({
                  targets: hero.body, x: hero.x, duration: 280, delay: 150, ease: 'Sine.in',
                  onComplete: () => cb.onComplete?.(),
                });
              },
            });
          },
        });
      });
    },
  },

  // ────────────────────────────────────────────────
  // WIZARDS
  // ────────────────────────────────────────────────

  'wizard-stargazer': {
    // Star projectile
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Charge orb
      playSparkBurst(scene, hero.x + 30, hero.y - 30, { count: 8, colors: [0xffe880, 0xfff8c0], duration: 200 });
      scene.time.delayedCall(100, () => {
        playProjectile(scene, hero.x + 40, hero.y - 30, ex, ey, { size: 10, color: 0xffe880, speed: 650 }).then(() => {
          hitPause(scene, { body: hero.body }, 60);
          playImpactRing(scene, ex, ey, { color: 0xffe880, endRadius: 55 });
          playSparkBurst(scene, ex, ey, { count: 24, colors: [0xffe880, 0xfff8c0, 0xf0d040] });
          scene.cameras.main.shake(100, 0.006);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(150, () => cb.onComplete?.());
        });
      });
    },
    // Constellation beam
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Star points appear in constellation pattern
      const starPositions = [
        { x: hero.x + 50, y: hero.y - 80 }, { x: hero.x + 100, y: hero.y - 40 },
        { x: hero.x + 80, y: hero.y + 20 }, { x: (hero.x + ex) / 2, y: hero.y - 60 },
      ];
      starPositions.forEach((pos, i) => {
        scene.time.delayedCall(i * 50, () => {
          playSparkBurst(scene, pos.x, pos.y, { count: 5, colors: [0xffe880, 0xfff8c0], minDist: 5, maxDist: 15, duration: 400 });
        });
      });
      scene.time.delayedCall(250, () => {
        // 250-550ms: Constellation beam fires
        playBeamTrail(scene, hero.x + 50, hero.y - 50, ex, ey, { color: 0xffe880, trailColor: 0xf0d040, particleCount: 55, width: 25, duration: 350 });
        scene.time.delayedCall(300, () => {
          playScreenFlash(scene, { color: 0xffe880, alpha: 0.35, duration: 200 });
          playImpactRing(scene, ex, ey, { color: 0xffe880, endRadius: 100 });
          playShockwave(scene, ex, ey, { color: 0xfff8c0, endRadius: 130 });
          playElementalBurst(scene, ex, ey, { count: 40, colors: [0xffe880, 0xfff8c0, 0xf0d040] });
          scene.cameras.main.shake(180, 0.015);
          hitPause(scene, { body: hero.body }, 60);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(250, () => cb.onComplete?.());
        });
      });
    },
    // Cosmic collapse — galaxy implodes
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-400ms: Cosmic energy swirls around enemy
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const dist = 100 + Math.random() * 50;
        scene.time.delayedCall(i * 15, () => {
          playSparkBurst(scene, ex + Math.cos(angle) * dist, ey + Math.sin(angle) * dist, {
            count: 3, colors: [0xffe880, 0x8060c0, 0xfff8c0], minDist: 5, maxDist: 15, duration: 350,
          });
        });
      }
      scene.time.delayedCall(400, () => {
        // 400-700ms: Galaxy implodes — particles pull inward
        playSparkBurst(scene, ex, ey, { count: 30, colors: [0x4020a0, 0x8060c0], minDist: 80, maxDist: 150, duration: 300, gravity: -40 });
        playScreenFlash(scene, { color: 0x200840, alpha: 0.4, duration: 300 });
        scene.time.delayedCall(300, () => {
          // 700-1100ms: Supernova explosion
          playScreenFlash(scene, { color: 0xffffff, alpha: 0.55, duration: 250 });
          playShockwave(scene, ex, ey, { color: 0xffe880, endRadius: 200, strokeWidth: 6 });
          scene.time.delayedCall(60, () => playShockwave(scene, ex, ey, { color: 0x8060c0, endRadius: 250, strokeWidth: 4 }));
          playImpactRing(scene, ex, ey, { color: 0xfff8c0, endRadius: 160 });
          playElementalBurst(scene, ex, ey, { count: 60, colors: [0xffe880, 0xfff8c0, 0x8060c0, 0x4020a0, 0xffffff] });
          scene.cameras.main.shake(300, 0.03);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(350, () => cb.onComplete?.());
        });
      });
    },
  },

  'wizard-toadstool': {
    // Poison spore cloud
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      playSparkBurst(scene, hero.x + 30, hero.y - 20, { count: 6, colors: [0x60c040, 0x80d060], duration: 200 });
      scene.time.delayedCall(100, () => {
        playProjectile(scene, hero.x + 40, hero.y - 20, ex, ey, { size: 8, color: 0x60c040, speed: 550 }).then(() => {
          hitPause(scene, { body: hero.body }, 60);
          // Spore cloud: lots of green/purple sparks
          playSparkBurst(scene, ex, ey, { count: 28, colors: [0x60c040, 0x80d060, 0xa040c0], minDist: 15, maxDist: 45, duration: 500 });
          playImpactRing(scene, ex, ey, { color: 0x60c040, endRadius: 50 });
          scene.cameras.main.shake(80, 0.005);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(200, () => cb.onComplete?.());
        });
      });
    },
    // Mushroom bomb projectile
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Brew charges
      playSparkBurst(scene, hero.x + 20, hero.y - 30, { count: 10, colors: [0x60c040, 0xa040c0], duration: 200 });
      scene.time.delayedCall(200, () => {
        // 200-500ms: Arcing mushroom bomb
        playProjectile(scene, hero.x + 40, hero.y - 30, ex, ey - 20, { size: 14, color: 0xa040c0, speed: 500 }).then(() => {
          // 500-800ms: Toxic explosion
          playScreenFlash(scene, { color: 0x60c040, alpha: 0.3, duration: 200 });
          playImpactRing(scene, ex, ey, { color: 0x60c040, endRadius: 90 });
          playShockwave(scene, ex, ey, { color: 0xa040c0, endRadius: 120 });
          playElementalBurst(scene, ex, ey, { count: 45, colors: [0x60c040, 0x80d060, 0xa040c0, 0xc060e0] });
          scene.cameras.main.shake(160, 0.012);
          hitPause(scene, { body: hero.body }, 60);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(200, () => cb.onComplete?.());
        });
      });
    },
    // Toxic fog burst
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-350ms: Spores converge from all directions
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 80 + Math.random() * 40;
        scene.time.delayedCall(i * 20, () => {
          playSparkBurst(scene, ex + Math.cos(angle) * dist, ey + Math.sin(angle) * dist, {
            count: 3, colors: [0x60c040, 0xa040c0], minDist: 5, maxDist: 15, duration: 300,
          });
        });
      }
      scene.time.delayedCall(350, () => {
        // 350-600ms: 3 mushroom bombs explode in sequence
        for (let i = 0; i < 3; i++) {
          scene.time.delayedCall(i * 80, () => {
            const ox = (i - 1) * 30;
            playImpactRing(scene, ex + ox, ey, { color: 0x60c040, endRadius: 70 + i * 20 });
            playSparkBurst(scene, ex + ox, ey, { count: 15, colors: [0x60c040, 0x80d060, 0xa040c0] });
          });
        }
        scene.time.delayedCall(280, () => {
          // 630-1000ms: Massive toxic fog detonation
          playScreenFlash(scene, { color: 0x60c040, alpha: 0.45, duration: 250 });
          playShockwave(scene, ex, ey, { color: 0x60c040, endRadius: 180, strokeWidth: 6 });
          playImpactRing(scene, ex, ey, { color: 0xa040c0, endRadius: 150 });
          playElementalBurst(scene, ex, ey, { count: 55, colors: [0x60c040, 0x80d060, 0xa040c0, 0xc060e0, 0x40a020] });
          scene.cameras.main.shake(250, 0.025);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(350, () => cb.onComplete?.());
        });
      });
    },
  },

  'wizard-spellblade': {
    // Magic-infused slash
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 70, duration: 300, ease: 'Back.out',
        onComplete: () => {
          playSlashArc(scene, ex, ey, { color: 0x60a0f0, lineWidth: 6, alpha: 0.9, duration: 280 });
          playSparkBurst(scene, ex, ey, { count: 20, colors: [0x60a0f0, 0xa0d0ff, 0x4080d0] });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0x60a0f0, endRadius: 50 });
          scene.cameras.main.shake(100, 0.006);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 250, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Spell beam
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Arcane charge at blade
      playSparkBurst(scene, hero.x + 40, hero.y - 20, { count: 10, colors: [0x60a0f0, 0xa0d0ff], duration: 200 });
      scene.time.delayedCall(200, () => {
        // 200-500ms: Spell beam fires
        playBeamTrail(scene, hero.x + 50, hero.y - 20, ex, ey, { color: 0x60a0f0, trailColor: 0x4080d0, particleCount: 50, width: 22, duration: 300 });
        scene.time.delayedCall(300, () => {
          playScreenFlash(scene, { color: 0x60a0f0, alpha: 0.35, duration: 200 });
          playImpactRing(scene, ex, ey, { color: 0x60a0f0, endRadius: 90 });
          playSlashArc(scene, ex, ey, { color: 0xa0d0ff, lineWidth: 5, alpha: 0.8, duration: 280 });
          playElementalBurst(scene, ex, ey, { count: 38, colors: [0x60a0f0, 0xa0d0ff, 0x4080d0] });
          scene.cameras.main.shake(160, 0.012);
          hitPause(scene, { body: hero.body }, 60);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(250, () => cb.onComplete?.());
        });
      });
    },
    // Arcane detonation
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-300ms: Charge blade with arcane energy
      if (hero.body) hero.body.setTint(0x60a0f0);
      playSparkBurst(scene, hero.x, hero.y - 20, { count: 14, colors: [0x60a0f0, 0xa0d0ff], minDist: 40, maxDist: 80, duration: 300, gravity: -20 });
      scene.time.delayedCall(300, () => {
        if (hero.body) hero.body.clearTint();
        // 300-550ms: Dash and slash
        scene.tweens.add({
          targets: hero.body, x: ex - 50, duration: 200, ease: 'Back.out',
          onComplete: () => {
            // 550-850ms: Triple slash + beam detonation
            for (let i = 0; i < 3; i++) {
              scene.time.delayedCall(i * 60, () => {
                playSlashArc(scene, ex + (i - 1) * 12, ey, { color: 0x60a0f0, lineWidth: 6 + i * 2, alpha: 0.9, duration: 280 });
              });
            }
            scene.time.delayedCall(200, () => {
              playScreenFlash(scene, { color: 0x60a0f0, alpha: 0.5, duration: 250 });
              playShockwave(scene, ex, ey, { color: 0x60a0f0, endRadius: 170, strokeWidth: 5 });
              playImpactRing(scene, ex, ey, { color: 0xa0d0ff, endRadius: 130 });
              playElementalBurst(scene, ex, ey, { count: 50, colors: [0x60a0f0, 0xa0d0ff, 0x4080d0, 0xffffff] });
              scene.cameras.main.shake(250, 0.025);
              hitPause(scene, { body: hero.body }, 80);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 250, delay: 150, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
            });
          },
        });
      });
    },
  },

  'wizard-bookworm': {
    // Book-page projectile volley
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Fire 3 page projectiles in quick succession
      let completed = 0;
      const totalProjectiles = 3;
      for (let i = 0; i < totalProjectiles; i++) {
        scene.time.delayedCall(i * 70, () => {
          const oy = (i - 1) * 20;
          playProjectile(scene, hero.x + 40, hero.y - 20 + oy, ex, ey, { size: 6, color: 0xf0e8c0, speed: 700 }).then(() => {
            playSparkBurst(scene, ex, ey, { count: 6, colors: [0xf0e8c0, 0xc0a860] });
            completed++;
            if (completed === totalProjectiles) {
              hitPause(scene, { body: hero.body }, 60);
              playImpactRing(scene, ex, ey, { color: 0xf0e8c0, endRadius: 50 });
              playSparkBurst(scene, ex, ey, { count: 18, colors: [0xf0e8c0, 0xc0a860, 0xe0d0a0] });
              scene.cameras.main.shake(100, 0.006);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.time.delayedCall(150, () => cb.onComplete?.());
            }
          });
        });
      }
    },
    // Knowledge beam
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-250ms: Book pages swirl around hero
      playSparkBurst(scene, hero.x, hero.y - 20, { count: 14, colors: [0xf0e8c0, 0xc0a860], minDist: 30, maxDist: 60, duration: 250 });
      scene.time.delayedCall(250, () => {
        // 250-550ms: Knowledge beam
        playBeamTrail(scene, hero.x + 40, hero.y - 25, ex, ey, { color: 0xf0e8c0, trailColor: 0xc0a860, particleCount: 50, width: 25, duration: 300 });
        scene.time.delayedCall(300, () => {
          playScreenFlash(scene, { color: 0xf0e8c0, alpha: 0.35, duration: 200 });
          playImpactRing(scene, ex, ey, { color: 0xf0e8c0, endRadius: 95 });
          playShockwave(scene, ex, ey, { color: 0xc0a860, endRadius: 120 });
          playElementalBurst(scene, ex, ey, { count: 40, colors: [0xf0e8c0, 0xc0a860, 0xe0d0a0] });
          scene.cameras.main.shake(160, 0.012);
          hitPause(scene, { body: hero.body }, 60);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(250, () => cb.onComplete?.());
        });
      });
    },
    // Library storm — books swirl
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-400ms: Books swirl in a vortex around hero
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        scene.time.delayedCall(i * 20, () => {
          const r = 60 + Math.random() * 30;
          playSparkBurst(scene, hero.x + Math.cos(angle) * r, hero.y - 20 + Math.sin(angle) * r, {
            count: 3, colors: [0xf0e8c0, 0xc0a860], minDist: 5, maxDist: 15, duration: 350,
          });
        });
      }
      scene.time.delayedCall(400, () => {
        // 400-700ms: Book volley barrage
        for (let i = 0; i < 5; i++) {
          scene.time.delayedCall(i * 50, () => {
            const oy = (Math.random() - 0.5) * 40;
            playProjectile(scene, hero.x + 40, hero.y - 20 + oy, ex + (Math.random() - 0.5) * 20, ey + (Math.random() - 0.5) * 20, { size: 8, color: 0xf0e8c0, speed: 800 });
          });
        }
        scene.time.delayedCall(350, () => {
          // 750-1100ms: Knowledge explosion
          playScreenFlash(scene, { color: 0xf0e8c0, alpha: 0.45, duration: 250 });
          playShockwave(scene, ex, ey, { color: 0xf0e8c0, endRadius: 180, strokeWidth: 5 });
          playImpactRing(scene, ex, ey, { color: 0xc0a860, endRadius: 140 });
          playElementalBurst(scene, ex, ey, { count: 55, colors: [0xf0e8c0, 0xc0a860, 0xe0d0a0, 0xffffff] });
          scene.cameras.main.shake(250, 0.025);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(300, () => cb.onComplete?.());
        });
      });
    },
  },

  'wizard-grandmage': {
    // Arcane bolt
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Charge orb
      playSparkBurst(scene, hero.x + 30, hero.y - 30, { count: 8, colors: [0xc080f0, 0x8040c0], duration: 200 });
      scene.time.delayedCall(100, () => {
        playProjectile(scene, hero.x + 40, hero.y - 30, ex, ey, { size: 10, color: 0xc080f0, speed: 700 }).then(() => {
          hitPause(scene, { body: hero.body }, 60);
          playImpactRing(scene, ex, ey, { color: 0xc080f0, endRadius: 55 });
          playSparkBurst(scene, ex, ey, { count: 26, colors: [0xc080f0, 0x8040c0, 0x6020a0] });
          scene.cameras.main.shake(100, 0.006);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(150, () => cb.onComplete?.());
        });
      });
    },
    // Triple elemental beam
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const beamColors = [
        { color: 0xff6020, trail: 0xff4010 }, // fire
        { color: 0x40c0f0, trail: 0x2090c0 }, // ice
        { color: 0xf0e020, trail: 0xd0c010 }, // lightning
      ];
      // 0-300ms: 3 beams fire staggered
      beamColors.forEach((bc, i) => {
        scene.time.delayedCall(i * 80, () => {
          const oy = (i - 1) * 25;
          playBeamTrail(scene, hero.x + 50, hero.y - 30 + oy, ex, ey, {
            color: bc.color, trailColor: bc.trail, particleCount: 30, width: 18, duration: 250,
          });
        });
      });
      scene.time.delayedCall(450, () => {
        // 450-800ms: Combined elemental detonation
        playScreenFlash(scene, { color: 0xffffff, alpha: 0.4, duration: 200 });
        playImpactRing(scene, ex, ey, { color: 0xff6020, endRadius: 80 });
        scene.time.delayedCall(40, () => playImpactRing(scene, ex, ey, { color: 0x40c0f0, endRadius: 110 }));
        scene.time.delayedCall(80, () => playImpactRing(scene, ex, ey, { color: 0xf0e020, endRadius: 140 }));
        playElementalBurst(scene, ex, ey, { count: 45, colors: [0xff6020, 0x40c0f0, 0xf0e020, 0xffffff] });
        scene.cameras.main.shake(200, 0.018);
        hitPause(scene, { body: hero.body }, 60);
        enemyHitReaction(scene, target, result.modifiedDamage);
        cb.onHit?.();
        scene.time.delayedCall(250, () => cb.onComplete?.());
      });
    },
    // Supernova explosion
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-400ms: Gather all elements
      if (hero.body) hero.body.setTint(0xc080f0);
      const elemColors = [0xff6020, 0x40c0f0, 0xf0e020, 0xc080f0];
      elemColors.forEach((c, i) => {
        scene.time.delayedCall(i * 80, () => {
          playSparkBurst(scene, hero.x, hero.y - 30, { count: 8, colors: [c, 0xffffff], minDist: 50, maxDist: 90, duration: 300, gravity: -20 });
        });
      });
      scene.time.delayedCall(400, () => {
        if (hero.body) hero.body.clearTint();
        // 400-700ms: Triple beam barrage
        elemColors.forEach((c, i) => {
          scene.time.delayedCall(i * 60, () => {
            playBeamTrail(scene, hero.x + 50, hero.y - 30 + (i - 1.5) * 20, ex, ey, {
              color: c, trailColor: c, particleCount: 25, width: 18, duration: 250,
            });
          });
        });
        scene.time.delayedCall(350, () => {
          // 750-1100ms: Supernova
          playScreenFlash(scene, { color: 0xffffff, alpha: 0.55, duration: 300 });
          playShockwave(scene, ex, ey, { color: 0xc080f0, endRadius: 200, strokeWidth: 6 });
          scene.time.delayedCall(60, () => playShockwave(scene, ex, ey, { color: 0xff6020, endRadius: 250, strokeWidth: 4 }));
          playImpactRing(scene, ex, ey, { color: 0xffffff, endRadius: 160 });
          playElementalBurst(scene, ex, ey, { count: 65, colors: [0xff6020, 0x40c0f0, 0xf0e020, 0xc080f0, 0xffffff] });
          playGroundCrack(scene, ex, ey + 20, { color: 0xc080f0, length: 80, lineCount: 6 });
          scene.cameras.main.shake(350, 0.035);
          hitPause(scene, { body: hero.body }, 80);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(350, () => cb.onComplete?.());
        });
      });
    },
  },

  // ────────────────────────────────────────────────
  // BUNNIES
  // ────────────────────────────────────────────────

  'bunny-pepper': {
    // Rapid 3-jab
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 50, duration: 80, ease: 'Quad.out',
        onComplete: () => {
          let jab = 0;
          const doJab = () => {
            if (jab >= 3) {
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 200, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
              return;
            }
            const ox = (jab - 1) * 15;
            playSparkBurst(scene, ex + ox, ey, { count: 8, colors: [0xe86898, 0xf090b0], duration: 200 });
            if (jab === 2) {
              hitPause(scene, { body: hero.body }, 80);
              playImpactRing(scene, ex, ey, { color: 0xe86898, endRadius: 45 });
              scene.cameras.main.shake(80, 0.005);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
            }
            jab++;
            scene.time.delayedCall(60, doJab);
          };
          doJab();
        },
      });
    },
    // Spinning kick with afterimages
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-100ms: Dash in
      scene.tweens.add({
        targets: hero.body, x: ex - 40, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          // 100-500ms: 5-hit spinning combo with afterimages
          let hit = 0;
          const positions = [
            { x: ex - 25, y: ey - 25 }, { x: ex + 25, y: ey - 10 },
            { x: ex - 15, y: ey + 20 }, { x: ex + 15, y: ey - 15 },
            { x: ex, y: ey },
          ];
          const doSpin = () => {
            if (hit >= 5) {
              // Backflip away
              scene.tweens.add({
                targets: hero.body, x: hero.x + 50, y: origY - 60, duration: 80, ease: 'Quad.out',
                onComplete: () => {
                  scene.tweens.add({
                    targets: hero.body, x: hero.x, y: origY, duration: 100, ease: 'Quad.in',
                    onComplete: () => {
                      // Final convergence burst
                      scene.time.delayedCall(80, () => {
                        playScreenFlash(scene, { color: 0xe86898, alpha: 0.3, duration: 150 });
                        playShockwave(scene, ex, ey, { color: 0xe86898, endRadius: 130 });
                        playElementalBurst(scene, ex, ey, { count: 40, colors: [0xe86898, 0xf090b0, 0xff80c0] });
                        scene.cameras.main.shake(120, 0.01);
                        hitPause(scene, { body: hero.body }, 80);
                        enemyHitReaction(scene, target, result.modifiedDamage);
                        cb.onHit?.();
                        scene.time.delayedCall(200, () => cb.onComplete?.());
                      });
                    },
                  });
                },
              });
              return;
            }
            const pos = positions[hit];
            scene.tweens.add({
              targets: hero.body, x: pos.x, y: pos.y - 20, duration: 50, ease: 'Linear',
              onComplete: () => {
                // Afterimage
                playSparkBurst(scene, pos.x, pos.y - 20, { count: 4, colors: [0xe86898], minDist: 5, maxDist: 15, duration: 200 });
                playSparkBurst(scene, ex, ey, { count: 6, colors: [0xe86898, 0xf090b0] });
                hit++;
                scene.time.delayedCall(20, doSpin);
              },
            });
          };
          doSpin();
        },
      });
    },
    // Feral frenzy — 10-hit combo flash
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-80ms: Dash in
      scene.tweens.add({
        targets: hero.body, x: ex - 40, duration: 80, ease: 'Quad.out',
        onComplete: () => {
          // 80-580ms: 10-hit rapid combo
          let hit = 0;
          const doFrenzy = () => {
            if (hit >= 10) {
              // Backflip
              scene.tweens.add({
                targets: hero.body, x: hero.x + 60, y: origY - 80, duration: 80, ease: 'Quad.out',
                onComplete: () => {
                  scene.tweens.add({
                    targets: hero.body, x: hero.x, y: origY, duration: 100, ease: 'Quad.in',
                    onComplete: () => {
                      scene.time.delayedCall(80, () => {
                        playScreenFlash(scene, { color: 0xff80c0, alpha: 0.45, duration: 200 });
                        playShockwave(scene, ex, ey, { color: 0xe86898, endRadius: 170, strokeWidth: 5 });
                        playImpactRing(scene, ex, ey, { color: 0xff80c0, endRadius: 140 });
                        playElementalBurst(scene, ex, ey, { count: 55, colors: [0xe86898, 0xf090b0, 0xff80c0] });
                        scene.cameras.main.shake(200, 0.025);
                        hitPause(scene, { body: hero.body }, 80);
                        enemyHitReaction(scene, target, result.modifiedDamage);
                        cb.onHit?.();
                        scene.time.delayedCall(300, () => cb.onComplete?.());
                      });
                    },
                  });
                },
              });
              return;
            }
            const ox = (Math.random() - 0.5) * 50;
            const oy = (Math.random() - 0.5) * 40;
            scene.tweens.add({
              targets: hero.body, x: ex + ox, y: origY + oy - 20, duration: 30, ease: 'Linear',
              onComplete: () => {
                playSparkBurst(scene, ex, ey, { count: 5, colors: [0xe86898, 0xf090b0] });
                if (hit % 3 === 2) playImpactRing(scene, ex, ey, { color: 0xe86898, endRadius: 30 + hit * 3 });
                hit++;
                scene.time.delayedCall(15, doFrenzy);
              },
            });
          };
          doFrenzy();
        },
      });
    },
  },

  'bunny-nova': {
    // Sparkle punch
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 50, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          playSparkBurst(scene, ex, ey, { count: 22, colors: [0xffe880, 0xfff8c0, 0xf0d040] });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xffe880, endRadius: 45 });
          playScreenFlash(scene, { color: 0xfff8c0, alpha: 0.2, duration: 100 });
          scene.cameras.main.shake(80, 0.005);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 200, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Star burst combo
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-100ms: Dash in
      scene.tweens.add({
        targets: hero.body, x: ex - 40, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          // 100-400ms: 4-hit sparkle combo
          let hit = 0;
          const positions = [
            { x: ex - 20, y: ey - 25 }, { x: ex + 20, y: ey - 10 },
            { x: ex - 10, y: ey + 15 }, { x: ex, y: ey },
          ];
          const doHit = () => {
            if (hit >= 4) {
              // 400-700ms: Star burst finale
              scene.time.delayedCall(80, () => {
                playScreenFlash(scene, { color: 0xffe880, alpha: 0.35, duration: 200 });
                playShockwave(scene, ex, ey, { color: 0xffe880, endRadius: 120 });
                playImpactRing(scene, ex, ey, { color: 0xfff8c0, endRadius: 90 });
                playElementalBurst(scene, ex, ey, { count: 40, colors: [0xffe880, 0xfff8c0, 0xf0d040] });
                scene.cameras.main.shake(150, 0.012);
                hitPause(scene, { body: hero.body }, 80);
                enemyHitReaction(scene, target, result.modifiedDamage);
                cb.onHit?.();
                scene.tweens.add({
                  targets: hero.body, x: hero.x, y: origY, duration: 200, delay: 100, ease: 'Sine.in',
                  onComplete: () => cb.onComplete?.(),
                });
              });
              return;
            }
            const pos = positions[hit];
            scene.tweens.add({
              targets: hero.body, x: pos.x, y: pos.y - 20, duration: 50, ease: 'Linear',
              onComplete: () => {
                playSparkBurst(scene, ex, ey, { count: 8, colors: [0xffe880, 0xfff8c0] });
                playImpactRing(scene, ex, ey, { color: 0xffe880, endRadius: 25 + hit * 8 });
                hit++;
                scene.time.delayedCall(30, doHit);
              },
            });
          };
          doHit();
        },
      });
    },
    // Nova explosion — screen-wide flash
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-100ms: Dash in
      scene.tweens.add({
        targets: hero.body, x: ex - 35, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          // 100-500ms: 6-hit sparkle rapid combo
          let hit = 0;
          const doCombo = () => {
            if (hit >= 6) {
              // 500-700ms: Backflip
              scene.tweens.add({
                targets: hero.body, x: hero.x + 50, y: origY - 70, duration: 80, ease: 'Quad.out',
                onComplete: () => {
                  scene.tweens.add({
                    targets: hero.body, x: hero.x, y: origY, duration: 100, ease: 'Quad.in',
                    onComplete: () => {
                      // 700-1100ms: Nova explosion
                      scene.time.delayedCall(100, () => {
                        playScreenFlash(scene, { color: 0xffffff, alpha: 0.6, duration: 300 });
                        scene.time.delayedCall(80, () => playScreenFlash(scene, { color: 0xffe880, alpha: 0.4, duration: 200 }));
                        playShockwave(scene, ex, ey, { color: 0xffe880, endRadius: 200, strokeWidth: 6 });
                        scene.time.delayedCall(60, () => playShockwave(scene, ex, ey, { color: 0xfff8c0, endRadius: 260, strokeWidth: 4 }));
                        playImpactRing(scene, ex, ey, { color: 0xffffff, endRadius: 170 });
                        playElementalBurst(scene, ex, ey, { count: 60, colors: [0xffe880, 0xfff8c0, 0xf0d040, 0xffffff] });
                        scene.cameras.main.shake(300, 0.03);
                        hitPause(scene, { body: hero.body }, 80);
                        enemyHitReaction(scene, target, result.modifiedDamage);
                        cb.onHit?.();
                        scene.time.delayedCall(350, () => cb.onComplete?.());
                      });
                    },
                  });
                },
              });
              return;
            }
            const ox = (Math.random() - 0.5) * 40;
            const oy = (Math.random() - 0.5) * 30;
            scene.tweens.add({
              targets: hero.body, x: ex + ox, y: origY + oy - 20, duration: 40, ease: 'Linear',
              onComplete: () => {
                playSparkBurst(scene, ex, ey, { count: 6, colors: [0xffe880, 0xfff8c0] });
                if (hit % 2 === 1) playImpactRing(scene, ex, ey, { color: 0xffe880, endRadius: 30 + hit * 5 });
                hit++;
                scene.time.delayedCall(25, doCombo);
              },
            });
          };
          doCombo();
        },
      });
    },
  },

  'bunny-boulder': {
    // Heavy slam
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // Slow heavy approach
      scene.tweens.add({
        targets: hero.body, x: ex - 60, duration: 350, ease: 'Sine.out',
        onComplete: () => {
          playSlashArc(scene, ex, ey, { color: 0x8a7a60, lineWidth: 7, alpha: 0.9, duration: 300 });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0x8a7a60, endRadius: 55, strokeWidth: 4 });
          playSparkBurst(scene, ex, ey, { count: 20, colors: [0x8a7a60, 0xa09070, 0xc0b090] });
          playGroundCrack(scene, ex, ey + 20, { color: 0x8a7a60, length: 40, lineCount: 3 });
          scene.cameras.main.shake(120, 0.008);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 300, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Ground pound shockwave
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-200ms: Jump up
      scene.tweens.add({
        targets: hero.body, x: ex - 30, y: hero.y - 80, duration: 200, ease: 'Quad.out',
        onComplete: () => {
          // 200-350ms: Slam down
          scene.tweens.add({
            targets: hero.body, y: hero.y, duration: 150, ease: 'Quad.in',
            onComplete: () => {
              // 350-700ms: Ground pound impact
              playScreenFlash(scene, { color: 0x8a7a60, alpha: 0.3, duration: 200 });
              playShockwave(scene, ex, ey, { color: 0x8a7a60, endRadius: 140, strokeWidth: 5 });
              playImpactRing(scene, ex, ey, { color: 0xa09070, endRadius: 100 });
              playGroundCrack(scene, ex, ey + 20, { color: 0x8a7a60, length: 70, lineCount: 6 });
              playElementalBurst(scene, ex, ey, { count: 35, colors: [0x8a7a60, 0xa09070, 0xc0b090] });
              scene.cameras.main.shake(200, 0.018);
              hitPause(scene, { body: hero.body }, 80);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 250, delay: 150, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
            },
          });
        },
      });
    },
    // Seismic strike — ground cracks + screen shake
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-350ms: Charge with earth energy
      if (hero.body) hero.body.setTint(0x8a7a60);
      playSparkBurst(scene, hero.x, hero.y, { count: 14, colors: [0x8a7a60, 0xa09070], minDist: 40, maxDist: 80, duration: 300, gravity: -15 });
      scene.time.delayedCall(350, () => {
        if (hero.body) hero.body.clearTint();
        // 350-550ms: Massive leap
        scene.tweens.add({
          targets: hero.body, x: ex - 20, y: hero.y - 120, duration: 150, ease: 'Quad.out',
          onComplete: () => {
            // 550-700ms: Seismic slam
            scene.tweens.add({
              targets: hero.body, y: hero.y, duration: 100, ease: 'Quad.in',
              onComplete: () => {
                // 700-1100ms: Earthquake detonation
                playScreenFlash(scene, { color: 0xffffff, alpha: 0.45, duration: 250 });
                playGroundCrack(scene, ex, ey + 20, { color: 0x8a7a60, length: 120, lineCount: 10, lineWidth: 4 });
                playShockwave(scene, ex, ey, { color: 0x8a7a60, endRadius: 200, strokeWidth: 6 });
                scene.time.delayedCall(80, () => playShockwave(scene, ex, ey, { color: 0xa09070, endRadius: 260, strokeWidth: 4 }));
                playImpactRing(scene, ex, ey, { color: 0xc0b090, endRadius: 160 });
                playElementalBurst(scene, ex, ey, { count: 55, colors: [0x8a7a60, 0xa09070, 0xc0b090, 0x6a5a40] });
                scene.cameras.main.shake(400, 0.035);
                hitPause(scene, { body: hero.body }, 80);
                enemyHitReaction(scene, target, result.modifiedDamage);
                cb.onHit?.();
                scene.tweens.add({
                  targets: hero.body, x: hero.x, duration: 300, delay: 150, ease: 'Sine.in',
                  onComplete: () => cb.onComplete?.(),
                });
              },
            });
          },
        });
      });
    },
  },

  'bunny-blaze': {
    // Fire punch with trail
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 50, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          playBeamTrail(scene, hero.x, hero.y, ex, ey, { color: 0xff6020, trailColor: 0xff4010, particleCount: 15, width: 15, duration: 200 });
          playSparkBurst(scene, ex, ey, { count: 22, colors: [0xff6020, 0xff8040, 0xffa060] });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xff6020, endRadius: 50 });
          scene.cameras.main.shake(80, 0.005);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 200, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Flame kick combo
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-100ms: Dash in
      scene.tweens.add({
        targets: hero.body, x: ex - 40, duration: 100, ease: 'Quad.out',
        onComplete: () => {
          // 100-450ms: 4-hit flame combo
          let hit = 0;
          const positions = [
            { x: ex - 20, y: ey - 20 }, { x: ex + 15, y: ey },
            { x: ex - 10, y: ey + 15 }, { x: ex, y: ey - 10 },
          ];
          const doFlameHit = () => {
            if (hit >= 4) {
              // 450-750ms: Fire burst finale
              scene.time.delayedCall(80, () => {
                playScreenFlash(scene, { color: 0xff4010, alpha: 0.35, duration: 200 });
                playShockwave(scene, ex, ey, { color: 0xff6020, endRadius: 120 });
                playImpactRing(scene, ex, ey, { color: 0xff8040, endRadius: 90 });
                playElementalBurst(scene, ex, ey, { count: 40, colors: [0xff6020, 0xff8040, 0xffa060, 0xffcc30] });
                scene.cameras.main.shake(150, 0.012);
                hitPause(scene, { body: hero.body }, 80);
                enemyHitReaction(scene, target, result.modifiedDamage);
                cb.onHit?.();
                scene.tweens.add({
                  targets: hero.body, x: hero.x, y: origY, duration: 200, delay: 100, ease: 'Sine.in',
                  onComplete: () => cb.onComplete?.(),
                });
              });
              return;
            }
            const pos = positions[hit];
            scene.tweens.add({
              targets: hero.body, x: pos.x, y: pos.y - 20, duration: 50, ease: 'Linear',
              onComplete: () => {
                playSparkBurst(scene, ex, ey, { count: 8, colors: [0xff6020, 0xff8040] });
                playBeamTrail(scene, pos.x, pos.y - 20, ex, ey, { color: 0xff6020, trailColor: 0xff4010, particleCount: 8, width: 10, duration: 150 });
                hit++;
                scene.time.delayedCall(30, doFlameHit);
              },
            });
          };
          doFlameHit();
        },
      });
    },
    // Inferno burst — fire particles
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      const origY = hero.y;
      // 0-300ms: Flame aura charge
      if (hero.body) hero.body.setTint(0xff4010);
      playSparkBurst(scene, hero.x, hero.y, { count: 16, colors: [0xff6020, 0xff4010], minDist: 30, maxDist: 70, duration: 300 });
      scene.time.delayedCall(300, () => {
        if (hero.body) hero.body.clearTint();
        // 300-400ms: Dash
        scene.tweens.add({
          targets: hero.body, x: ex - 35, duration: 80, ease: 'Quad.out',
          onComplete: () => {
            // 400-700ms: 8-hit flame frenzy
            let hit = 0;
            const doInferno = () => {
              if (hit >= 8) {
                scene.tweens.add({
                  targets: hero.body, x: hero.x + 50, y: origY - 70, duration: 80, ease: 'Quad.out',
                  onComplete: () => {
                    scene.tweens.add({
                      targets: hero.body, x: hero.x, y: origY, duration: 100, ease: 'Quad.in',
                      onComplete: () => {
                        // 800-1100ms: Inferno explosion
                        scene.time.delayedCall(80, () => {
                          playScreenFlash(scene, { color: 0xff4010, alpha: 0.5, duration: 250 });
                          playShockwave(scene, ex, ey, { color: 0xff6020, endRadius: 180, strokeWidth: 6 });
                          playImpactRing(scene, ex, ey, { color: 0xffa060, endRadius: 150 });
                          playElementalBurst(scene, ex, ey, { count: 55, colors: [0xff6020, 0xff8040, 0xffa060, 0xffcc30, 0xff4010] });
                          scene.cameras.main.shake(250, 0.025);
                          hitPause(scene, { body: hero.body }, 80);
                          enemyHitReaction(scene, target, result.modifiedDamage);
                          cb.onHit?.();
                          scene.time.delayedCall(300, () => cb.onComplete?.());
                        });
                      },
                    });
                  },
                });
                return;
              }
              const ox = (Math.random() - 0.5) * 40;
              const oy = (Math.random() - 0.5) * 30;
              scene.tweens.add({
                targets: hero.body, x: ex + ox, y: origY + oy - 20, duration: 30, ease: 'Linear',
                onComplete: () => {
                  playSparkBurst(scene, ex, ey, { count: 6, colors: [0xff6020, 0xff8040] });
                  playBeamTrail(scene, hero.body.x, hero.body.y, ex, ey, { color: 0xff6020, trailColor: 0xff4010, particleCount: 6, width: 8, duration: 120 });
                  hit++;
                  scene.time.delayedCall(15, doInferno);
                },
              });
            };
            doInferno();
          },
        });
      });
    },
  },

  'bunny-duchess': {
    // Royal palm strike
    fight(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      scene.tweens.add({
        targets: hero.body, x: ex - 55, duration: 280, ease: 'Back.out',
        onComplete: () => {
          playSparkBurst(scene, ex, ey, { count: 22, colors: [0xf0d040, 0xfff8c0, 0xe0c030] });
          hitPause(scene, { body: hero.body }, 80);
          playImpactRing(scene, ex, ey, { color: 0xf0d040, endRadius: 50 });
          playScreenFlash(scene, { color: 0xf0d040, alpha: 0.15, duration: 100 });
          scene.cameras.main.shake(100, 0.006);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.tweens.add({
            targets: hero.body, x: hero.x, duration: 250, delay: 80, ease: 'Sine.in',
            onComplete: () => cb.onComplete?.(),
          });
        },
      });
    },
    // Crown throw projectile
    magic(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-150ms: Wind-up
      playSparkBurst(scene, hero.x + 20, hero.y - 40, { count: 8, colors: [0xf0d040, 0xfff8c0], duration: 150 });
      scene.time.delayedCall(150, () => {
        // 150-450ms: Crown projectile
        playProjectile(scene, hero.x + 40, hero.y - 30, ex, ey, { size: 10, color: 0xf0d040, speed: 600 }).then(() => {
          // 450-750ms: Royal impact
          playScreenFlash(scene, { color: 0xf0d040, alpha: 0.3, duration: 200 });
          playImpactRing(scene, ex, ey, { color: 0xf0d040, endRadius: 90 });
          playShockwave(scene, ex, ey, { color: 0xfff8c0, endRadius: 120 });
          playElementalBurst(scene, ex, ey, { count: 38, colors: [0xf0d040, 0xfff8c0, 0xe0c030] });
          scene.cameras.main.shake(150, 0.012);
          hitPause(scene, { body: hero.body }, 60);
          enemyHitReaction(scene, target, result.modifiedDamage);
          cb.onHit?.();
          scene.time.delayedCall(200, () => cb.onComplete?.());
        });
      });
    },
    // Royal decree shockwave
    super(scene, hero, target, result, cb) {
      const ex = target.x, ey = target.y;
      // 0-350ms: Royal energy gathers — crown glows
      if (hero.body) hero.body.setTint(0xf0d040);
      playSparkBurst(scene, hero.x, hero.y - 40, { count: 16, colors: [0xf0d040, 0xfff8c0], minDist: 40, maxDist: 80, duration: 300, gravity: -25 });
      scene.time.delayedCall(350, () => {
        if (hero.body) hero.body.clearTint();
        // 350-550ms: Royal charge
        scene.tweens.add({
          targets: hero.body, x: ex - 45, duration: 150, ease: 'Back.out',
          onComplete: () => {
            // 550-700ms: Royal palm + crown combo
            playSlashArc(scene, ex, ey, { color: 0xf0d040, lineWidth: 7, alpha: 0.9, duration: 300 });
            scene.time.delayedCall(50, () => {
              playSlashArc(scene, ex, ey, { color: 0xfff8c0, lineWidth: 5, alpha: 0.8, arcSpread: 90, duration: 300 });
            });
            scene.time.delayedCall(150, () => {
              // 700-1100ms: Royal decree detonation
              playScreenFlash(scene, { color: 0xf0d040, alpha: 0.5, duration: 250 });
              playShockwave(scene, ex, ey, { color: 0xf0d040, endRadius: 190, strokeWidth: 6 });
              scene.time.delayedCall(60, () => playShockwave(scene, ex, ey, { color: 0xfff8c0, endRadius: 240, strokeWidth: 4 }));
              playImpactRing(scene, ex, ey, { color: 0xe0c030, endRadius: 150 });
              playElementalBurst(scene, ex, ey, { count: 55, colors: [0xf0d040, 0xfff8c0, 0xe0c030, 0xffffff] });
              scene.cameras.main.shake(280, 0.028);
              hitPause(scene, { body: hero.body }, 80);
              enemyHitReaction(scene, target, result.modifiedDamage);
              cb.onHit?.();
              scene.tweens.add({
                targets: hero.body, x: hero.x, duration: 250, delay: 150, ease: 'Sine.in',
                onComplete: () => cb.onComplete?.(),
              });
            });
          },
        });
      });
    },
  },
};

// ================================================================
// DISPATCH FUNCTIONS — check ATTACK_REGISTRY, fall through to class defaults
// ================================================================

/**
 * Play a FIGHT-tier attack animation (enhanced standard attack).
 * ~200-400ms, same timing as before but with hit-pause and better particles.
 *
 * @param {Phaser.Scene} scene
 * @param {object} heroSprite - Hero sprite group { body, x, y }
 * @param {object} targetSprite - Enemy sprite group { body, x, y }
 * @param {string} cls - 'knight', 'wizard', or 'bunny'
 * @param {string} op - Operator for wizard beam type: '+', '-', '*', '/'
 * @param {object} result - Damage result
 * @param {object} callbacks - { onHit, onComplete }
 */
export function playFightAnimation(scene, heroSprite, targetSprite, cls, op, result, callbacks = {}) {
  // Check per-hero registry first
  const heroId = heroSprite.hero?.id || heroSprite.heroId;
  if (heroId && ATTACK_REGISTRY[heroId]?.fight) {
    return ATTACK_REGISTRY[heroId].fight(scene, heroSprite, targetSprite, result, callbacks);
  }

  const enemyX = targetSprite.x;
  const enemyY = targetSprite.y;

  if (cls === 'knight') {
    playKnightFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, callbacks);
  } else if (cls === 'wizard') {
    playWizardFight(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, callbacks);
  } else if (cls === 'bunny') {
    playBunnyFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, callbacks);
  }
}

/**
 * Play a MAGIC-tier attack animation (spectacular, 900ms).
 *
 * @param {Phaser.Scene} scene
 * @param {object} heroSprite
 * @param {object} targetSprite
 * @param {string} cls
 * @param {string} op - Operator (for wizard element selection)
 * @param {object} result
 * @param {object} callbacks - { onHit, onComplete }
 */
export function playMagicAnimation(scene, heroSprite, targetSprite, cls, op, result, callbacks = {}) {
  // Check per-hero registry first
  const heroId = heroSprite.hero?.id || heroSprite.heroId;
  if (heroId && ATTACK_REGISTRY[heroId]?.magic) {
    return ATTACK_REGISTRY[heroId].magic(scene, heroSprite, targetSprite, result, callbacks);
  }

  const enemyX = targetSprite.x;
  const enemyY = targetSprite.y;

  if (cls === 'knight') {
    playKnightMagic(scene, heroSprite, targetSprite, enemyX, enemyY, result, callbacks);
  } else if (cls === 'wizard') {
    playWizardMagic(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, callbacks);
  } else if (cls === 'bunny') {
    playBunnyMagic(scene, heroSprite, targetSprite, enemyX, enemyY, result, callbacks);
  }
}

/**
 * Play a fizzle animation (MAGIC wrong answer — sparkles poof out).
 */
export function playFizzleAnimation(scene, heroSprite) {
  const hx = heroSprite.x;
  const hy = heroSprite.y - 40;
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 25;
    const sp = scene.add.circle(hx, hy, 3 + Math.random() * 3, 0xc080f0, 0.7);
    sp.setDepth(20);
    scene.tweens.add({
      targets: sp,
      x: hx + Math.cos(angle) * dist,
      y: hy + Math.sin(angle) * dist,
      alpha: 0, scale: 0.15,
      duration: 450 + Math.random() * 200,
      onComplete: () => sp.destroy(),
    });
  }

  // Red screen tint flash
  const W = 1500, H = 1100;
  const cx = 720, cy = 540;
  const redTint = scene.add.rectangle(cx, cy, W, H, 0xff0000, 0.08).setDepth(25);
  scene.tweens.add({
    targets: redTint,
    alpha: 0,
    duration: 150,
    onComplete: () => redTint.destroy(),
  });

  // Hero recoil
  if (heroSprite.body) {
    scene.tweens.add({
      targets: heroSprite.body,
      x: heroSprite.body.x - 10,
      duration: 80,
      yoyo: true,
    });
  }

  // "FIZZLE!" floating text
  const fizzleText = scene.add.text(hx, hy - 10, 'FIZZLE!', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '28px',
    fontStyle: 'bold',
    color: '#c080f0',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(30);
  scene.tweens.add({
    targets: fizzleText,
    y: hy - 60,
    alpha: 0,
    duration: 700,
    ease: 'Cubic.out',
    onComplete: () => fizzleText.destroy(),
  });
}

/**
 * Play a knight SUPER move animation — gold charge + oversized slash.
 * ~1000ms total.
 */
export function playKnightSuper(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origSX = heroSprite.body ? heroSprite.body.scaleX : 1;
  const origSY = heroSprite.body ? heroSprite.body.scaleY : 1;

  // 0-300ms: Gold glow charge + scale up
  if (heroSprite.body) {
    heroSprite.body.setTint(0xffd040);
    scene.tweens.add({
      targets: heroSprite.body,
      scaleX: origSX * 1.1,
      scaleY: origSY * 1.1,
      duration: 300,
      ease: 'Cubic.in',
    });
  }

  // 300-550ms: Lunge to enemy (fast 250ms)
  scene.time.delayedCall(300, () => {
    if (heroSprite.body) {
      heroSprite.body.clearTint();
      scene.tweens.add({
        targets: heroSprite.body,
        x: enemyX - 60,
        scaleX: origSX,
        scaleY: origSY,
        duration: 250,
        ease: 'Back.out',
        onComplete: () => {
          // 550ms: IMPACT
          hitPause(scene, { body: heroSprite.body }, 80);

          // Screen shake (stronger than normal: 0.02 vs 0.008)
          scene.cameras.main.shake(180, 0.02);

          // White flash
          const whiteFlash = scene.add.rectangle(enemyX, enemyY, 140, 160, 0xffffff, 0.6);
          whiteFlash.setDepth(21);
          scene.tweens.add({ targets: whiteFlash, alpha: 0, duration: 120, onComplete: () => whiteFlash.destroy() });

          // Impact ring — 80px (vs 50px normal)
          impactRing(scene, enemyX, enemyY, 0xffd040, 80);

          // 40 golden sparks (vs 32 normal)
          for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 25 + Math.random() * 50;
            const size = 4 + Math.random() * 3;
            const sparkColor = Math.random() > 0.5 ? 0xfff8c0 : 0xffd040;
            const sp = scene.add.circle(enemyX, enemyY, size, sparkColor);
            sp.setDepth(20);
            scene.tweens.add({
              targets: sp,
              x: enemyX + Math.cos(angle) * dist,
              y: enemyY + Math.sin(angle) * dist + 15,
              alpha: 0, scale: 0.3,
              duration: 350 + Math.random() * 200,
              ease: 'Cubic.out',
              onComplete: () => sp.destroy(),
            });
          }

          // Oversized slash arcs (2x width/radius)
          const slash1 = drawSlashArc(scene, enemyX, enemyY, 8, 0xf0e8c0, 0.95, 0, 0);
          scene.tweens.add({ targets: slash1, alpha: 0, duration: 300, onComplete: () => slash1.destroy() });

          scene.time.delayedCall(30, () => {
            const slash2 = drawSlashArc(scene, enemyX, enemyY, 10, 0xffe880, 0.85, 10, -6);
            scene.tweens.add({ targets: slash2, alpha: 0, duration: 300, onComplete: () => slash2.destroy() });
          });

          scene.time.delayedCall(60, () => {
            const slash3 = drawSlashArc(scene, enemyX, enemyY, 12, 0xffd040, 0.75, -10, 10);
            scene.tweens.add({ targets: slash3, alpha: 0, duration: 300, onComplete: () => slash3.destroy() });
          });

          // Enemy hit reaction
          enemyHitReaction(scene, targetSprite, result.modifiedDamage);

          if (cb.onHit) cb.onHit();

          // Return home
          scene.tweens.add({
            targets: heroSprite.body,
            x: heroSprite.x,
            duration: 250,
            delay: 100,
            ease: 'Sine.in',
            onComplete: () => { if (cb.onComplete) cb.onComplete(); },
          });
        },
      });
    } else {
      if (cb.onHit) cb.onHit();
      if (cb.onComplete) cb.onComplete();
    }
  });
}

/**
 * Play a bunny SUPER move animation — dash + 5-hit rapid combo + convergence explosion.
 * ~1200ms total.
 */
export function playBunnySuper(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origY = heroSprite.y;

  // 0-100ms: Dash to enemy
  scene.tweens.add({
    targets: heroSprite.body,
    x: enemyX - 50,
    duration: 100,
    ease: 'Quad.out',
    onComplete: () => {
      // 100-600ms: 5-hit rapid combo
      let hit = 0;
      const positions = [
        { x: enemyX - 30, y: enemyY - 30 },
        { x: enemyX + 30, y: enemyY - 10 },
        { x: enemyX - 20, y: enemyY + 20 },
        { x: enemyX + 20, y: enemyY - 20 },
        { x: enemyX, y: enemyY },
      ];
      const afterimages = [];

      const doHit = () => {
        if (hit >= 5) {
          // 600-800ms: Backflip away
          scene.tweens.add({
            targets: heroSprite.body,
            x: heroSprite.x + 60, y: origY - 80,
            duration: 100, ease: 'Quad.out',
            onComplete: () => {
              scene.tweens.add({
                targets: heroSprite.body,
                x: heroSprite.x, y: origY,
                duration: 100, ease: 'Quad.in',
                onComplete: () => {
                  // 800-1000ms: Afterimages converge
                  scene.time.delayedCall(50, () => {
                    for (const ai of afterimages) {
                      scene.tweens.add({
                        targets: ai, x: enemyX, y: enemyY, alpha: 0.8,
                        duration: 100, ease: 'Cubic.in',
                        onComplete: () => ai.destroy(),
                      });
                    }

                    // 1000-1200ms: Convergence explosion (bigger than normal)
                    scene.time.delayedCall(120, () => {
                      const flash = scene.add.rectangle(720, 540, 1500, 1100, 0xe86898, 0.3);
                      flash.setDepth(21);
                      scene.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

                      // 35 particles on final burst
                      sparkBurst(scene, enemyX, enemyY, 35, [0xe86898, 0xf090b0, 0xff80c0], true);

                      impactRing(scene, enemyX, enemyY, 0xe86898, 120);
                      scene.cameras.main.shake(150, 0.012);

                      enemyHitReaction(scene, targetSprite, result.modifiedDamage);

                      if (cb.onHit) cb.onHit();

                      scene.time.delayedCall(150, () => {
                        if (cb.onComplete) cb.onComplete();
                      });
                    });
                  });
                },
              });
            },
          });
          return;
        }

        const pos = positions[hit];
        const isLastHit = hit === 4;

        // Speed lines
        for (let sl = 0; sl < 4; sl++) {
          const lineY = origY + (pos.y - enemyY) + (Math.random() - 0.5) * 30;
          const lineX = (heroSprite.body ? heroSprite.body.x : heroSprite.x) - 10 - sl * 12;
          const speedLine = scene.add.graphics();
          speedLine.setDepth(19);
          speedLine.lineStyle(1.5, 0xffffff, 0.4);
          speedLine.beginPath();
          speedLine.moveTo(lineX, lineY);
          speedLine.lineTo(lineX - 25 - Math.random() * 15, lineY);
          speedLine.strokePath();
          scene.tweens.add({ targets: speedLine, alpha: 0, duration: 100, onComplete: () => speedLine.destroy() });
        }

        scene.tweens.add({
          targets: heroSprite.body,
          x: pos.x, y: pos.y - 20,
          duration: 60, ease: 'Linear',
          onComplete: () => {
            // Afterimage
            const ghost = scene.add.circle(pos.x, pos.y - 20, 22, 0xe86898, 0.5);
            ghost.setDepth(19);
            afterimages.push(ghost);

            // Per-hit spark burst
            const sparkCount = isLastHit ? 20 : 8;
            sparkBurst(scene, enemyX, enemyY, sparkCount, [0xe86898, 0xf090b0, 0xff80c0]);

            // Per-hit impact burst
            const burst = scene.add.circle(enemyX, enemyY, 5, 0xe86898, 0.7);
            burst.setDepth(20);
            scene.tweens.add({
              targets: burst, radius: isLastHit ? 35 : 20, alpha: 0,
              duration: 100, ease: 'Cubic.out',
              onComplete: () => burst.destroy(),
            });

            impactRing(scene, enemyX, enemyY, 0xe86898, isLastHit ? 50 : 25);

            if (isLastHit) {
              scene.cameras.main.shake(80, 0.005);
            }

            hit++;
            scene.time.delayedCall(40, doHit);
          },
        });
      };
      doHit();
    },
  });
}

/**
 * Play a wizard SUPER move animation — 3 staggered orbs + magic circle + explosion.
 * ~1100ms total.
 */
export function playWizardSuper(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const orbColors = [0x8040c0, 0xc080f0, 0x6020a0];
  const heroX = heroSprite.x;
  const heroY = heroSprite.y - 30;

  // 0-300ms: 3 staggered magic orbs fire toward enemy
  for (let i = 0; i < 3; i++) {
    scene.time.delayedCall(i * 100, () => {
      const offsetY = (i - 1) * 30;
      const orb = scene.add.circle(heroX + 40, heroY + offsetY, 12, orbColors[i], 0.9);
      orb.setDepth(20);

      // Orb glow
      const glow = scene.add.circle(heroX + 40, heroY + offsetY, 20, orbColors[i], 0.3);
      glow.setDepth(19);

      scene.tweens.add({
        targets: [orb, glow],
        x: enemyX,
        y: enemyY,
        duration: 300,
        ease: 'Cubic.in',
        onComplete: () => {
          orb.destroy();
          glow.destroy();

          // Small spark burst per orb hit
          sparkBurst(scene, enemyX, enemyY, 8, [orbColors[i], 0xffffff]);
          impactRing(scene, enemyX, enemyY, orbColors[i], 40);
        },
      });
    });
  }

  // 300-500ms: Magic circle under enemy
  scene.time.delayedCall(300, () => {
    const mcGfx = scene.add.graphics();
    mcGfx.setDepth(19);
    mcGfx.lineStyle(3, 0xc080f0, 0.7);
    mcGfx.strokeCircle(enemyX, enemyY + 30, 70);
    mcGfx.lineStyle(2, 0x8040c0, 0.5);
    mcGfx.strokeCircle(enemyX, enemyY + 30, 50);
    mcGfx.lineStyle(1, 0xffffff, 0.3);
    mcGfx.strokeCircle(enemyX, enemyY + 30, 30);

    scene.tweens.add({
      targets: mcGfx,
      rotation: Math.PI * 2,
      duration: 600,
      ease: 'Linear',
    });

    // 500-700ms: All 3 orbs arrived — BIG detonation
    scene.time.delayedCall(200, () => {
      // Flash
      const flash = scene.add.rectangle(720, 540, 1500, 1100, 0xc080f0, 0.3);
      flash.setDepth(21);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

      // Heavy screen shake
      scene.cameras.main.shake(200, 0.018);

      // 30-particle explosion
      sparkBurst(scene, enemyX, enemyY, 30, [0xc080f0, 0x8040c0, 0x6020a0, 0xffffff], true);

      // Large impact ring
      impactRing(scene, enemyX, enemyY, 0xc080f0, 100);
      scene.time.delayedCall(50, () => impactRing(scene, enemyX, enemyY, 0x8040c0, 150));

      // Enemy hit reaction
      enemyHitReaction(scene, targetSprite, result.modifiedDamage);

      if (cb.onHit) cb.onHit();

      // Fade magic circle
      scene.tweens.add({
        targets: mcGfx, alpha: 0, duration: 300, delay: 100,
        onComplete: () => mcGfx.destroy(),
      });

      // 700-1100ms: Settle
      scene.time.delayedCall(400, () => {
        if (cb.onComplete) cb.onComplete();
      });
    });
  });
}

// ================================================================
// SHARED HELPERS
// ================================================================

function hitPause(scene, targetSprite, duration = 80) {
  if (!targetSprite || !targetSprite.body) return;
  const body = targetSprite.body;
  body.setTint(0xffffff);
  scene.time.delayedCall(duration, () => {
    if (body && body.clearTint) body.clearTint();
  });
}

function impactRing(scene, x, y, color = 0xffffff, maxRadius = 50) {
  const ring = scene.add.circle(x, y, 5, color, 0);
  ring.setStrokeStyle(3, color, 0.6);
  ring.setDepth(20);
  scene.tweens.add({
    targets: ring,
    radius: maxRadius,
    alpha: 0,
    duration: 250,
    ease: 'Cubic.out',
    onComplete: () => ring.destroy(),
  });
}

function sparkBurst(scene, x, y, count, colors, gravity = false) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 35;
    const size = 2 + Math.random() * 4;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const sp = scene.add.circle(x, y, size, color);
    sp.setDepth(20);
    const tx = x + Math.cos(angle) * dist;
    let ty = y + Math.sin(angle) * dist;
    if (gravity) ty += 15;
    scene.tweens.add({
      targets: sp,
      x: tx, y: ty,
      alpha: 0,
      scale: 0.3,
      duration: 350 + Math.random() * 200,
      ease: 'Cubic.out',
      onComplete: () => sp.destroy(),
    });
  }
}

/**
 * Universal enemy hit reaction — red tint, knockback shake, floating damage number.
 * Called on every attack type at the moment of impact.
 */
function enemyHitReaction(scene, targetSprite, damage) {
  if (!targetSprite || !targetSprite.body) return;
  const enemy = targetSprite.body;
  const ex = targetSprite.x;
  const ey = targetSprite.y;

  // 1. Red tint — clear after 150ms
  if (enemy.setTint) enemy.setTint(0xff4444);
  scene.time.delayedCall(150, () => {
    if (enemy && enemy.clearTint) enemy.clearTint();
  });

  // 2. Knockback shake
  scene.tweens.add({
    targets: enemy,
    x: ex + 5,
    duration: 40,
    yoyo: true,
    repeat: 2,
    onComplete: () => { if (enemy) enemy.x = ex; },
  });

  // 3. Floating damage number
  if (typeof damage === 'number' && damage > 0) {
    const dmgText = scene.add.text(ex, ey - 30, `-${damage}`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30);
    scene.tweens.add({
      targets: dmgText,
      y: ey - 90,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.out',
      onComplete: () => dmgText.destroy(),
    });
  }
}

/**
 * Draw a bezier slash arc and return the graphics object.
 */
function drawSlashArc(scene, enemyX, enemyY, lineWidth, color, alpha, offsetX, offsetY) {
  const slash = scene.add.graphics();
  slash.setDepth(20);
  slash.lineStyle(lineWidth, color, alpha);
  slash.beginPath();
  const startX = enemyX - 40 + offsetX;
  const startY = enemyY - 50 + offsetY;
  slash.moveTo(startX, startY);
  const cp1x = enemyX + 30 + offsetX, cp1y = enemyY - 30 + offsetY;
  const cp2x = enemyX + 20 + offsetX, cp2y = enemyY + 40 + offsetY;
  const endX = enemyX - 30 + offsetX, endY = enemyY + 50 + offsetY;
  for (let t = 1; t <= 12; t++) {
    const p = t / 12, ip = 1 - p;
    const sx = ip * ip * ip * startX + 3 * ip * ip * p * cp1x + 3 * ip * p * p * cp2x + p * p * p * endX;
    const sy = ip * ip * ip * startY + 3 * ip * ip * p * cp1y + 3 * ip * p * p * cp2y + p * p * p * endY;
    slash.lineTo(sx, sy);
  }
  slash.strokePath();
  return slash;
}

// ================================================================
// KNIGHT FIGHT — dramatic melee slash
// ================================================================

function playKnightFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  // Afterimage trail: 3 fading ghosts spawned along the charge path
  for (let g = 0; g < 3; g++) {
    scene.time.delayedCall(60 + g * 80, () => {
      const body = heroSprite.body;
      if (!body) return;
      let ghost;
      if (body.texture && body.texture.key && body.texture.key !== '__MISSING') {
        ghost = scene.add.image(body.x, body.y, body.texture.key)
          .setScale(body.scaleX, body.scaleY)
          .setAlpha(0.35)
          .setTint(0x88aaff)
          .setDepth((body.depth || 10) - 1);
      } else {
        ghost = scene.add.ellipse(body.x, body.y, 70, 100, 0x88aaff, 0.25)
          .setDepth((body.depth || 10) - 1);
      }
      scene.tweens.add({
        targets: ghost, alpha: 0, duration: 250,
        onComplete: () => ghost.destroy(),
      });
    });
  }

  scene.tweens.add({
    targets: heroSprite.body,
    x: enemyX - 80,
    duration: 350,
    ease: 'Back.out',
    onComplete: () => {
      hitPause(scene, { body: heroSprite.body }, 80);

      // Screen shake on impact
      scene.cameras.main.shake(120, 0.008);

      // Bright white flash overlay on the enemy
      const whiteFlash = scene.add.rectangle(enemyX, enemyY, 100, 120, 0xffffff, 0.5);
      whiteFlash.setDepth(21);
      scene.tweens.add({ targets: whiteFlash, alpha: 0, duration: 100, onComplete: () => whiteFlash.destroy() });

      // Impact ring
      impactRing(scene, enemyX, enemyY, 0xf0d040);

      // 30+ larger sparks (4-6px radius)
      for (let i = 0; i < 32; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 40;
        const size = 4 + Math.random() * 2;
        const sparkColor = Math.random() > 0.5 ? 0xfff8c0 : 0xf0d040;
        const sp = scene.add.circle(enemyX, enemyY, size, sparkColor);
        sp.setDepth(20);
        scene.tweens.add({
          targets: sp,
          x: enemyX + Math.cos(angle) * dist,
          y: enemyY + Math.sin(angle) * dist + 15,
          alpha: 0, scale: 0.3,
          duration: 350 + Math.random() * 200,
          ease: 'Cubic.out',
          onComplete: () => sp.destroy(),
        });
      }

      // 3 overlapping slash arcs (small, medium, large) staggered 30ms
      const slash1 = drawSlashArc(scene, enemyX, enemyY, 4, 0xf0e8c0, 0.95, 0, 0);
      scene.tweens.add({ targets: slash1, alpha: 0, duration: 300, onComplete: () => slash1.destroy() });

      scene.time.delayedCall(30, () => {
        const slash2 = drawSlashArc(scene, enemyX, enemyY, 5, 0xffe880, 0.85, 5, -3);
        scene.tweens.add({ targets: slash2, alpha: 0, duration: 300, onComplete: () => slash2.destroy() });
      });

      scene.time.delayedCall(60, () => {
        const slash3 = drawSlashArc(scene, enemyX, enemyY, 6, 0xffd040, 0.75, -5, 5);
        scene.tweens.add({ targets: slash3, alpha: 0, duration: 300, onComplete: () => slash3.destroy() });
      });

      // Weapon trail glow — thick golden line along the arc path
      const glow = scene.add.graphics();
      glow.setDepth(20);
      glow.lineStyle(8, 0xf0d040, 0.6);
      glow.beginPath();
      glow.moveTo(enemyX - 40, enemyY - 50);
      const cp1x = enemyX + 30, cp1y = enemyY - 30;
      const cp2x = enemyX + 20, cp2y = enemyY + 40;
      const gEndX = enemyX - 30, gEndY = enemyY + 50;
      for (let t = 1; t <= 12; t++) {
        const p = t / 12, ip = 1 - p;
        const sx = ip * ip * ip * (enemyX - 40) + 3 * ip * ip * p * cp1x + 3 * ip * p * p * cp2x + p * p * p * gEndX;
        const sy = ip * ip * ip * (enemyY - 50) + 3 * ip * ip * p * cp1y + 3 * ip * p * p * cp2y + p * p * p * gEndY;
        glow.lineTo(sx, sy);
      }
      glow.strokePath();
      scene.tweens.add({ targets: glow, alpha: 0, duration: 250, onComplete: () => glow.destroy() });

      // Enemy hit reaction (red tint, knockback, damage number)
      enemyHitReaction(scene, targetSprite, result.modifiedDamage);

      if (cb.onHit) cb.onHit();
      scene.tweens.add({
        targets: heroSprite.body, x: heroSprite.x,
        duration: 250, delay: 80, ease: 'Sine.in',
        onComplete: () => { if (cb.onComplete) cb.onComplete(); },
      });
    },
  });
}

// ================================================================
// KNIGHT MAGIC — charged power strike
// ================================================================

function playKnightMagic(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;

  // 0-200ms: Hero charges (gold tint, energy converges)
  heroSprite.body.setTint(0xffee80);
  scene.tweens.add({ targets: heroSprite.body, scaleX: origSX * 1.15, scaleY: origSY * 1.15, duration: 200, ease: 'Cubic.in' });

  // Converging energy particles
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const startDist = 60;
    const ep = scene.add.circle(
      heroSprite.x + Math.cos(angle) * startDist,
      heroSprite.y + Math.sin(angle) * startDist,
      3, 0xf0d040, 0.7,
    );
    ep.setDepth(20);
    scene.tweens.add({
      targets: ep,
      x: heroSprite.x, y: heroSprite.y - 30,
      alpha: 0, duration: 200, ease: 'Cubic.in',
      onComplete: () => ep.destroy(),
    });
  }

  // 200-400ms: Lunge with screen dim
  scene.time.delayedCall(200, () => {
    const dim = scene.add.rectangle(720, 540, 1500, 1100, 0x1f3d3f, 0.1);
    dim.setDepth(19);

    scene.tweens.add({
      targets: heroSprite.body,
      x: enemyX - 60, scaleX: origSX, scaleY: origSY,
      duration: 200, ease: 'Back.out',
      onComplete: () => {
        // 400-500ms: IMPACT
        heroSprite.body.clearTint();
        hitPause(scene, { body: heroSprite.body }, 80);

        // Golden flash
        const flash = scene.add.rectangle(720, 540, 1500, 1100, 0xf0d040, 0.25);
        flash.setDepth(21);
        scene.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

        // Ground crack lines
        for (let i = 0; i < 4; i++) {
          const crackAngle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
          const crack = scene.add.graphics();
          crack.setDepth(20);
          crack.lineStyle(2, 0x3a2410, 0.6);
          crack.beginPath();
          crack.moveTo(enemyX, enemyY + 20);
          const len = 30 + Math.random() * 40;
          crack.lineTo(enemyX + Math.cos(crackAngle) * len, enemyY + 20 + Math.sin(crackAngle) * len * 0.3);
          crack.strokePath();
          scene.tweens.add({ targets: crack, alpha: 0, duration: 500, delay: 200, onComplete: () => crack.destroy() });
        }

        // 500-700ms: Shockwave ring + particles
        scene.cameras.main.shake(180, 0.012);
        impactRing(scene, enemyX, enemyY, 0xf0d040, 120);
        sparkBurst(scene, enemyX, enemyY, 32, [0xf0d040, 0xfff8c0, 0xf0a020], true);

        // Enemy hit reaction
        enemyHitReaction(scene, targetSprite, result.modifiedDamage);

        if (cb.onHit) cb.onHit();

        // 700-900ms: Return
        scene.tweens.add({ targets: dim, alpha: 0, duration: 200, onComplete: () => dim.destroy() });
        scene.tweens.add({
          targets: heroSprite.body, x: heroSprite.x,
          duration: 200, delay: 200, ease: 'Sine.in',
          onComplete: () => { if (cb.onComplete) cb.onComplete(); },
        });
      },
    });
  });
}

// ================================================================
// WIZARD FIGHT — elemental beam with charge phase
// ================================================================

function playWizardFight(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, cb) {
  const beamStartX = heroSprite.x + 60;
  const beamStartY = heroSprite.y - 40;
  const beamColors = { '+': 0xff6020, '-': 0xf0e020, '*': 0x40c0f0, '/': 0x8040c0 };
  const beamColor = beamColors[op] || 0xff6020;
  const beamEdgeColors = { '+': 0xff8040, '-': 0xfff080, '*': 0x80e0ff, '/': 0xc080f0 };
  const beamEdgeColor = beamEdgeColors[op] || 0xff8040;
  const particleColors = {
    '+': [0xff8020, 0xff6020, 0xffa040],
    '-': [0xf0e020, 0xffe060, 0xffffff],
    '*': [0x80e0ff, 0x40c0f0, 0xa0e8ff],
    '/': [0xc080f0, 0x8040c0, 0x6020a0],
  };
  const screenTintColors = { '+': 0xff4020, '-': 0xf0e020, '*': 0x40c0f0, '/': 0x6020a0 };
  const screenTintColor = screenTintColors[op] || 0xff4020;

  // CHARGE PHASE (200ms): growing circle of light at wizard position
  const chargeCircle = scene.add.circle(heroSprite.x, heroSprite.y - 20, 10, beamColor, 0.5);
  chargeCircle.setDepth(20);
  scene.tweens.add({
    targets: chargeCircle,
    radius: 40,
    alpha: 0.8,
    duration: 200,
    ease: 'Cubic.out',
    onComplete: () => {
      scene.tweens.add({ targets: chargeCircle, alpha: 0, scale: 0.3, duration: 150, onComplete: () => chargeCircle.destroy() });
    },
  });

  // Fire beam after charge
  scene.time.delayedCall(200, () => {
    const beam = scene.add.graphics();
    beam.setDepth(20);
    const angle = Math.atan2(enemyY - beamStartY, enemyX - beamStartX);
    const dist = Math.sqrt((enemyX - beamStartX) ** 2 + (enemyY - beamStartY) ** 2);

    // WIDE beam (25px) with bright white core and colored edges
    beam.save();
    beam.translateCanvas(beamStartX, beamStartY);
    beam.rotateCanvas(angle);
    beam.fillStyle(beamEdgeColor, 0.5);
    beam.fillRect(0, -14, dist, 28);
    beam.fillStyle(beamColor, 0.85);
    beam.fillRect(0, -10, dist, 20);
    beam.fillStyle(0xffffff, 0.7);
    beam.fillRect(0, -4, dist, 8);
    beam.restore();

    // Element-specific trail particles
    const trailCount = op === '-' ? 10 : 20;
    for (let i = 0; i < trailCount; i++) {
      const t = Math.random();
      const px = beamStartX + (enemyX - beamStartX) * t;
      const py = beamStartY + (enemyY - beamStartY) * t + (Math.random() - 0.5) * 30;
      const fp = scene.add.circle(px, py, 3 + Math.random() * 5, beamColor, 0.7);
      fp.setDepth(20);
      const yDrift = op === '+' ? py - 20 - Math.random() * 20 : py + (Math.random() - 0.5) * 30;
      scene.tweens.add({
        targets: fp, y: yDrift, alpha: 0, scale: 0.3,
        duration: 200 + Math.random() * 200, onComplete: () => fp.destroy(),
      });
    }

    // Lightning: jagged bolt overlay
    if (op === '-') {
      const bolt = scene.add.graphics();
      bolt.setDepth(21);
      bolt.lineStyle(3, 0xffffff, 0.9);
      bolt.beginPath();
      bolt.moveTo(beamStartX, beamStartY);
      const segs = 6 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= segs; i++) {
        const st = i / segs;
        const lx = beamStartX + (enemyX - beamStartX) * st;
        const ly = beamStartY + (enemyY - beamStartY) * st;
        const offsetY = (i < segs) ? (Math.random() - 0.5) * 50 : 0;
        bolt.lineTo(lx, ly + offsetY);
      }
      bolt.strokePath();
      scene.tweens.add({ targets: bolt, alpha: 0, duration: 200, onComplete: () => bolt.destroy() });

      // White flash for lightning
      const lFlash = scene.add.rectangle(720, 540, 1500, 1100, 0xffffff, 0.35);
      lFlash.setDepth(21);
      scene.tweens.add({ targets: lFlash, alpha: 0, duration: 80, onComplete: () => lFlash.destroy() });
    }

    // Void: inward-pulling particles
    if (op === '/') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const d = 50 + Math.random() * 30;
        const dp = scene.add.circle(enemyX + Math.cos(a) * d, enemyY + Math.sin(a) * d, 4, 0x4020a0, 0.8);
        dp.setDepth(20);
        scene.tweens.add({
          targets: dp, x: enemyX, y: enemyY, alpha: 0, scale: 0.2,
          duration: 300, onComplete: () => dp.destroy(),
        });
      }
    }

    // Ice: crystalline particle burst
    if (op === '*') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const d = 25 + Math.random() * 20;
        const iceP = scene.add.circle(enemyX, enemyY, 3 + Math.random() * 3, 0xa0e8ff, 0.8);
        iceP.setDepth(20);
        scene.tweens.add({
          targets: iceP, x: enemyX + Math.cos(a) * d, y: enemyY + Math.sin(a) * d,
          alpha: 0, duration: 300, onComplete: () => iceP.destroy(),
        });
      }
    }

    hitPause(scene, { body: heroSprite.body }, 60);

    // 3 expanding impact rings staggered 50ms
    impactRing(scene, enemyX, enemyY, beamColor, 40);
    scene.time.delayedCall(50, () => impactRing(scene, enemyX, enemyY, beamColor, 80));
    scene.time.delayedCall(100, () => impactRing(scene, enemyX, enemyY, beamColor, 120));

    // Screen tint matching element
    const tint = scene.add.rectangle(720, 540, 1500, 1100, screenTintColor, 0.15);
    tint.setDepth(21);
    scene.tweens.add({ targets: tint, alpha: 0, duration: 200, onComplete: () => tint.destroy() });

    // Screen shake
    scene.cameras.main.shake(150, 0.01);

    // 35+ particle explosion at enemy
    sparkBurst(scene, enemyX, enemyY, 36, particleColors[op] || [beamColor], true);

    // Enemy hit reaction (red tint, knockback, damage number)
    enemyHitReaction(scene, targetSprite, result.modifiedDamage);

    scene.tweens.add({ targets: beam, alpha: 0, duration: 400, onComplete: () => beam.destroy() });

    if (cb.onHit) cb.onHit();
    scene.time.delayedCall(300, () => { if (cb.onComplete) cb.onComplete(); });
  });
}

// ================================================================
// WIZARD MAGIC — spectacular elemental spell
// ================================================================

function playWizardMagic(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;

  // Element colors
  const elemColors = {
    '+': { main: 0xff6020, flash: 0xff4010, particles: [0xff8020, 0xf06020, 0xffa040] },
    '-': { main: 0xf0e020, flash: 0xffe040, particles: [0xf0e020, 0xffe060, 0xf0c020] },
    '*': { main: 0x40c0f0, flash: 0x80e0ff, particles: [0x80e0ff, 0x40c0f0, 0xa0e8ff] },
    '/': { main: 0x8040c0, flash: 0xc080f0, particles: [0xc080f0, 0x8040c0, 0x6020a0] },
  };
  const elem = elemColors[op] || elemColors['+'];

  // 0-150ms: Large magic circle with counter-rotating rings and inner glow
  const mcx = heroSprite.x, mcy = heroSprite.y + 20;
  const innerGlow = scene.add.circle(mcx, mcy, 50, elem.main, 0.2);
  innerGlow.setDepth(19);
  scene.tweens.add({ targets: innerGlow, radius: 90, alpha: 0.35, duration: 300, yoyo: true, onComplete: () => innerGlow.destroy() });

  const circle1 = scene.add.graphics();
  circle1.setDepth(20);
  circle1.lineStyle(3, elem.main, 0.7);
  circle1.strokeCircle(mcx, mcy, 80);
  circle1.lineStyle(2, elem.main, 0.4);
  circle1.strokeCircle(mcx, mcy, 60);
  circle1.lineStyle(1, 0xffffff, 0.3);
  circle1.strokeCircle(mcx, mcy, 40);

  const circle2 = scene.add.graphics();
  circle2.setDepth(20);
  circle2.lineStyle(3, elem.particles[1], 0.6);
  circle2.strokeCircle(mcx, mcy, 95);
  circle2.lineStyle(1, elem.particles[0], 0.3);
  circle2.strokeCircle(mcx, mcy, 105);

  const rotTween1 = scene.tweens.add({
    targets: circle1, rotation: Math.PI * 2,
    duration: 800, repeat: 0, ease: 'Linear',
  });
  const rotTween2 = scene.tweens.add({
    targets: circle2, rotation: -Math.PI * 2,
    duration: 800, repeat: 0, ease: 'Linear',
  });

  // 150-350ms: Massive particle stream — 65 particles
  scene.time.delayedCall(150, () => {
    for (let i = 0; i < 65; i++) {
      const delay = i * 3;
      scene.time.delayedCall(delay, () => {
        const t = i / 65;
        const px = heroSprite.x + (enemyX - heroSprite.x) * t;
        const py = heroSprite.y - 20 + (enemyY - heroSprite.y) * t;
        const spread = 45;
        const p = scene.add.circle(
          px + (Math.random() - 0.5) * spread,
          py + (Math.random() - 0.5) * spread,
          5 + Math.random() * 7,
          elem.particles[Math.floor(Math.random() * 3)],
          0.8,
        );
        p.setDepth(20);
        scene.tweens.add({
          targets: p,
          x: px + (Math.random() - 0.5) * 25,
          y: py - 12 - Math.random() * 18,
          alpha: 0, scale: 0.2,
          duration: 300 + Math.random() * 200,
          onComplete: () => p.destroy(),
        });
      });
    }
  });

  // 350-550ms: DETONATION at enemy
  scene.time.delayedCall(350, () => {
    // Full-screen flash — BRIGHT
    const flash = scene.add.rectangle(720, 540, 1500, 1100, elem.flash, 0.35);
    flash.setDepth(21);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

    // Second white flash for extra punch
    const whiteFlash = scene.add.rectangle(720, 540, 1500, 1100, 0xffffff, 0.2);
    whiteFlash.setDepth(22);
    scene.tweens.add({ targets: whiteFlash, alpha: 0, duration: 150, onComplete: () => whiteFlash.destroy() });

    // Heavy screen shake
    scene.cameras.main.shake(250, 0.02);

    // Triple impact rings — massive
    impactRing(scene, enemyX, enemyY, 0xffffff, 120);
    impactRing(scene, enemyX, enemyY, elem.main, 200);
    scene.time.delayedCall(60, () => impactRing(scene, enemyX, enemyY, elem.main, 280));

    // 70 burst particles
    sparkBurst(scene, enemyX, enemyY, 70, elem.particles, true);

    // Enemy knockback — brief y-offset pushed back 15px
    if (targetSprite && targetSprite.body) {
      const origEY = targetSprite.body.y;
      scene.tweens.add({
        targets: targetSprite.body,
        y: origEY - 15,
        duration: 100,
        yoyo: true,
        ease: 'Sine.out',
        onComplete: () => { if (targetSprite.body) targetSprite.body.y = origEY; },
      });
    }

    // Enemy hit reaction
    enemyHitReaction(scene, targetSprite, result.modifiedDamage);

    if (cb.onHit) cb.onHit();
  });

  // 550-900ms: Aftermath — lingering sparkles. The magic circles
  // persist ~200ms past impact before fading so the spell "lands".
  scene.time.delayedCall(550, () => {
    scene.tweens.add({
      targets: circle1, alpha: 0, duration: 300, delay: 200,
      onComplete: () => { rotTween1.stop(); circle1.destroy(); },
    });
    scene.tweens.add({
      targets: circle2, alpha: 0, duration: 300, delay: 200,
      onComplete: () => { rotTween2.stop(); circle2.destroy(); },
    });

    // 6-8 lingering sparkles drifting downward over 800ms
    for (let i = 0; i < 8; i++) {
      const sx = enemyX + (Math.random() - 0.5) * 60;
      const sy = enemyY - 20 + (Math.random() - 0.5) * 30;
      const sparkle = scene.add.circle(sx, sy, 2 + Math.random() * 2, elem.particles[Math.floor(Math.random() * 3)], 0.6);
      sparkle.setDepth(20);
      scene.tweens.add({
        targets: sparkle,
        y: sy + 40 + Math.random() * 30,
        alpha: 0,
        duration: 800,
        delay: i * 50,
        ease: 'Sine.out',
        onComplete: () => sparkle.destroy(),
      });
    }
  });

  scene.time.delayedCall(900, () => { if (cb.onComplete) cb.onComplete(); });
}

// ================================================================
// BUNNY FIGHT — multi-hit martial arts combo
// ================================================================

function playBunnyFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origY = heroSprite.y;
  const hitCount = result.hitCount || 2;

  // Dash to enemy
  scene.tweens.add({
    targets: heroSprite.body,
    x: enemyX - 50,
    duration: 100,
    ease: 'Quad.out',
    onComplete: () => {
      let hitIndex = 0;
      const doHit = () => {
        if (hitIndex >= hitCount) {
          // Return
          scene.tweens.add({
            targets: heroSprite.body, x: heroSprite.x, y: origY,
            duration: 250, ease: 'Sine.in',
            onComplete: () => { if (cb.onComplete) cb.onComplete(); },
          });
          return;
        }

        const offsets = [[-30, 0], [30, 0], [0, -20]];
        const off = offsets[hitIndex % 3];
        const isLastHit = hitIndex === hitCount - 1;

        // Speed lines during each dash (3-4 horizontal lines behind the bunny)
        for (let sl = 0; sl < 4; sl++) {
          const lineY = origY + off[1] + (Math.random() - 0.5) * 30;
          const lineX = heroSprite.body.x - 10 - sl * 12;
          const speedLine = scene.add.graphics();
          speedLine.setDepth(19);
          speedLine.lineStyle(1.5, 0xffffff, 0.4);
          speedLine.beginPath();
          speedLine.moveTo(lineX, lineY);
          speedLine.lineTo(lineX - 25 - Math.random() * 15, lineY);
          speedLine.strokePath();
          scene.tweens.add({ targets: speedLine, alpha: 0, duration: 100, onComplete: () => speedLine.destroy() });
        }

        scene.tweens.add({
          targets: heroSprite.body,
          x: enemyX + off[0], y: origY + off[1],
          duration: 140, ease: 'Linear',
          onComplete: () => {
            // Afterimage
            const ghost = scene.add.circle(heroSprite.body.x, heroSprite.body.y, 20, 0xe86898, 0.25);
            ghost.setDepth(19);
            scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.5, duration: 200, onComplete: () => ghost.destroy() });

            // Per-hit impact burst (pink circle expanding and fading)
            const burst = scene.add.circle(enemyX, enemyY, 5, 0xe86898, 0.7);
            burst.setDepth(20);
            scene.tweens.add({
              targets: burst, radius: isLastHit ? 35 : 20, alpha: 0,
              duration: 100, ease: 'Cubic.out',
              onComplete: () => burst.destroy(),
            });

            // White flash on enemy per hit
            const hitFlashRect = scene.add.rectangle(enemyX, enemyY, 80, 100, 0xffffff, 0.3);
            hitFlashRect.setDepth(21);
            scene.tweens.add({ targets: hitFlashRect, alpha: 0, duration: 60, onComplete: () => hitFlashRect.destroy() });

            // More sparks per hit: 18 (last hit 25)
            const sparkCount = isLastHit ? 25 : 18;
            sparkBurst(scene, enemyX, enemyY, sparkCount, [0xe86898, 0xf090b0, 0xff80c0]);

            // Impact ring per hit (last hit bigger)
            impactRing(scene, enemyX, enemyY, 0xe86898, isLastHit ? 50 : 30);

            // Final hit emphasis
            if (isLastHit) {
              scene.cameras.main.shake(100, 0.006);
              impactRing(scene, enemyX, enemyY, 0xff80c0, 70);
            }

            if (hitIndex === 0 && cb.onHit) cb.onHit();

            // Enemy hit reaction on first hit
            if (hitIndex === 0) {
              enemyHitReaction(scene, targetSprite, result.modifiedDamage);
            }

            hitIndex++;
            scene.time.delayedCall(60, doHit);
          },
        });
      };
      doHit();
    },
  });
}

// ================================================================
// BUNNY MAGIC — rapid 5-hit combo with afterimage convergence
// ================================================================

function playBunnyMagic(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origY = heroSprite.y;

  // 0-100ms: Dash to enemy
  scene.tweens.add({
    targets: heroSprite.body,
    x: enemyX - 40,
    duration: 100,
    ease: 'Quad.out',
    onComplete: () => {
      // 100-300ms: 5-hit rapid combo
      let hit = 0;
      const positions = [
        { x: enemyX - 30, y: enemyY - 30 },
        { x: enemyX + 30, y: enemyY - 10 },
        { x: enemyX - 20, y: enemyY + 20 },
        { x: enemyX + 20, y: enemyY - 20 },
        { x: enemyX, y: enemyY },
      ];
      const afterimages = [];

      const doComboHit = () => {
        if (hit >= 5) {
          // 300-500ms: Backflip away
          scene.tweens.add({
            targets: heroSprite.body,
            x: heroSprite.x + 60, y: origY - 80,
            duration: 100, ease: 'Quad.out',
            onComplete: () => {
              scene.tweens.add({
                targets: heroSprite.body,
                x: heroSprite.x, y: origY,
                duration: 100, ease: 'Quad.in',
                onComplete: () => {
                  // 500-650ms: Trail lines + afterimages converge
                  scene.time.delayedCall(100, () => {
                    // Trail lines connecting afterimage positions
                    if (afterimages.length >= 2) {
                      const trailGfx = scene.add.graphics();
                      trailGfx.setDepth(19);
                      trailGfx.lineStyle(1.5, 0xe86898, 0.3);
                      trailGfx.beginPath();
                      trailGfx.moveTo(afterimages[0].x, afterimages[0].y);
                      for (let ai = 1; ai < afterimages.length; ai++) {
                        trailGfx.lineTo(afterimages[ai].x, afterimages[ai].y);
                      }
                      trailGfx.strokePath();
                      scene.tweens.add({ targets: trailGfx, alpha: 0, duration: 200, onComplete: () => trailGfx.destroy() });
                    }

                    for (const ai of afterimages) {
                      scene.tweens.add({
                        targets: ai, x: enemyX, y: enemyY, alpha: 0.8,
                        duration: 100, ease: 'Cubic.in',
                        onComplete: () => ai.destroy(),
                      });
                    }
                    // 650-750ms: Convergence explosion
                    scene.time.delayedCall(120, () => {
                      // Flash BRIGHTER (0.25 alpha)
                      const flash = scene.add.rectangle(720, 540, 1500, 1100, 0xe86898, 0.25);
                      flash.setDepth(21);
                      scene.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

                      // 45 particles (up from 24)
                      sparkBurst(scene, enemyX, enemyY, 45, [0xe86898, 0xf090b0, 0xff80c0], true);

                      // Impact ring — 120px (up from 80px)
                      impactRing(scene, enemyX, enemyY, 0xe86898, 120);

                      // Screen shake on final explosion
                      scene.cameras.main.shake(120, 0.008);

                      // Enemy hit reaction
                      enemyHitReaction(scene, targetSprite, result.modifiedDamage);

                      if (cb.onHit) cb.onHit();

                      // 750-900ms: Settle
                      scene.time.delayedCall(150, () => {
                        if (cb.onComplete) cb.onComplete();
                      });
                    });
                  });
                },
              });
            },
          });
          return;
        }

        const pos = positions[hit];
        scene.tweens.add({
          targets: heroSprite.body,
          x: pos.x, y: pos.y - 20,
          duration: 35, ease: 'Linear',
          onComplete: () => {
            // Afterimage — larger and more visible (radius 22, alpha 0.5)
            const ghost = scene.add.circle(pos.x, pos.y - 20, 22, 0xe86898, 0.5);
            ghost.setDepth(19);
            afterimages.push(ghost);

            sparkBurst(scene, enemyX, enemyY, 6, [0xe86898]);

            hit++;
            scene.time.delayedCall(10, doComboHit);
          },
        });
      };
      doComboHit();
    },
  });
}
