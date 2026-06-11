/**
 * Monster Attack Animation System
 *
 * Provides themed attack animations for all 45 monsters across 9 floors.
 * Each monster has a unique animation that matches its floor's visual theme.
 *
 * Regular monsters: 300-500ms total duration, 1-2 VFX calls
 * Boss monsters: 500-800ms total duration, 3-5 VFX calls, multiple phases
 *
 * Uses `var` and `function` keyword for maximum compatibility.
 */

import {
  playSparkBurst,
  playImpactRing,
  playProjectile,
  playShockwave,
  playBeamTrail,
  playScreenFlash,
  playElementalBurst,
} from './vfx.js';

// ================================================================
// DEFAULT ATTACK — fallback for unregistered monsters
// ================================================================

function defaultMonsterAttack(scene, monsterSprite, targetSprite, damage, callbacks) {
  var mx = monsterSprite.x, my = monsterSprite.y;
  var tx = targetSprite.x, ty = targetSprite.y;
  scene.tweens.add({
    targets: monsterSprite,
    x: mx + (tx - mx) * 0.35,
    y: my + (ty - my) * 0.35,
    duration: 150,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, { colors: [0xffffff, 0xcccccc], count: 10, maxDist: 25 });
      callbacks.onHit && callbacks.onHit();
    },
    onComplete: function() {
      callbacks.onComplete && callbacks.onComplete();
    }
  });
}

// ================================================================
// MONSTER ATTACK REGISTRY
// ================================================================

export var MONSTER_ATTACK_REGISTRY = {

  // ────────────────────────────────────────────────
  // FLOOR 1 — Garden (Addition) — spore/vine/thorn
  // ────────────────────────────────────────────────

  sproutling: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.25,
      y: my + (ty - my) * 0.25,
      duration: 130,
      yoyo: true,
      ease: 'Quad.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0x7d9f6d, 0xb7c4a4], count: 12, maxDist: 30 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  thornwall: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0x4a7a3c, size: 5 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0x4a7a3c, 0x6b9d5e], count: 14, maxDist: 35 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  blossomfiend: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playSparkBurst(scene, mx, my, { colors: [0xf0a0c0, 0xe888a0], count: 10, maxDist: 30, duration: 200 });
    scene.time.delayedCall(150, function() {
      scene.tweens.add({
        targets: monsterSprite,
        x: mx + (tx - mx) * 0.4,
        y: my + (ty - my) * 0.4,
        duration: 100,
        yoyo: true,
        ease: 'Back.out',
        onYoyo: function() {
          playSparkBurst(scene, tx, ty, { colors: [0xf0a0c0, 0xc8e070], count: 16, maxDist: 40 });
          callbacks.onHit && callbacks.onHit();
        },
        onComplete: function() {
          callbacks.onComplete && callbacks.onComplete();
        }
      });
    });
  },

  puffshroom: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      scaleX: 1.3,
      scaleY: 0.8,
      duration: 120,
      yoyo: true,
      ease: 'Quad.out',
      onYoyo: function() {
        playElementalBurst(scene, tx, ty, { colors: [0xa8c070, 0x90b048, 0xd0e8a0], count: 20, maxDist: 50, duration: 400 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  briarking: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: vine warning beam
    playBeamTrail(scene, mx, my, tx, ty, { color: 0x3c6b4f, trailColor: 0x2a5240, spread: 15, duration: 200 });
    // Phase 2: thorn barrage
    scene.time.delayedCall(250, function() {
      playProjectile(scene, mx, my, tx, ty, { color: 0x7d9f6d, size: 6 }).then(function() {
        playShockwave(scene, tx, ty, { color: 0x3c6b4f, endRadius: 80 });
        playSparkBurst(scene, tx, ty, { colors: [0x7d9f6d, 0xecb964], count: 20, maxDist: 50 });
        callbacks.onHit && callbacks.onHit();
      });
    });
    // Phase 3: screen flash finale
    scene.time.delayedCall(550, function() {
      playScreenFlash(scene, { color: 0x3c6b4f, alpha: 0.25, duration: 150 });
    });
    scene.time.delayedCall(700, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 2 — Tidepool (Subtraction) — water/ink/tentacle
  // ────────────────────────────────────────────────

  drifter: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.2,
      y: my + (ty - my) * 0.2,
      duration: 160,
      yoyo: true,
      ease: 'Sine.inOut',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0x5588bb, 0x88bbdd], count: 10, maxDist: 35, duration: 350 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  gulper: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.5,
      y: my + (ty - my) * 0.5,
      duration: 100,
      yoyo: true,
      ease: 'Back.out',
      onYoyo: function() {
        playImpactRing(scene, tx, ty, { color: 0x3366aa, endRadius: 40 });
        playSparkBurst(scene, tx, ty, { colors: [0x4477bb, 0x88bbee], count: 12, maxDist: 30 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  inkspitter: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0x1a1a2e, size: 7 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0x1a1a2e, 0x333355, 0x4a4a6e], count: 16, maxDist: 40 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  abyssaleel: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playBeamTrail(scene, mx, my, tx, ty, { color: 0x6699ff, trailColor: 0x3355aa, spread: 10, duration: 250 });
    scene.time.delayedCall(200, function() {
      playSparkBurst(scene, tx, ty, { colors: [0x6699ff, 0xaaccff], count: 14, maxDist: 35 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  pressure: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: crushing water pressure from above
    playElementalBurst(scene, tx, ty - 40, { colors: [0x2244aa, 0x3366cc, 0x88bbee], count: 24, maxDist: 60, duration: 300 });
    // Phase 2: tentacle slam
    scene.time.delayedCall(200, function() {
      scene.tweens.add({
        targets: monsterSprite,
        x: mx + (tx - mx) * 0.45,
        y: my + (ty - my) * 0.45,
        duration: 120,
        yoyo: true,
        ease: 'Quad.in',
        onYoyo: function() {
          playShockwave(scene, tx, ty, { color: 0x2244aa, endRadius: 100 });
          playImpactRing(scene, tx, ty, { color: 0x3366cc, endRadius: 60 });
          callbacks.onHit && callbacks.onHit();
        }
      });
    });
    // Phase 3: deep flash
    scene.time.delayedCall(500, function() {
      playScreenFlash(scene, { color: 0x112255, alpha: 0.3, duration: 180 });
    });
    scene.time.delayedCall(700, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 3 — Cloud (Multiplication) — lightning/hail/wind
  // ────────────────────────────────────────────────

  stormwing: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.3,
      duration: 100,
      yoyo: true,
      ease: 'Quad.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0xf0e868, 0xfff8a0], count: 14, maxDist: 35 });
        playImpactRing(scene, tx, ty, { color: 0xf0e868, endRadius: 35 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  hailshot: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my - 30, tx, ty, { color: 0xc8e8ff, size: 5 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0xc8e8ff, 0xa0c8e8], count: 12, maxDist: 30 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  cycloneimp: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      angle: 360,
      x: mx + (tx - mx) * 0.45,
      y: my + (ty - my) * 0.45,
      duration: 180,
      yoyo: true,
      ease: 'Cubic.out',
      onYoyo: function() {
        playShockwave(scene, tx, ty, { color: 0x88ccaa, endRadius: 50, duration: 250 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        monsterSprite.angle = 0;
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  thunderclap: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    playSparkBurst(scene, tx, ty, { colors: [0xf0e868, 0xfff8a0, 0xffffff], count: 18, maxDist: 45, duration: 300 });
    scene.time.delayedCall(80, function() {
      playShockwave(scene, tx, ty, { color: 0xf0e868, endRadius: 70 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  skywhale: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: rise up
    scene.tweens.add({
      targets: monsterSprite,
      y: my - 40,
      duration: 200,
      ease: 'Quad.out'
    });
    // Phase 2: dive bomb
    scene.time.delayedCall(220, function() {
      scene.tweens.add({
        targets: monsterSprite,
        x: tx,
        y: ty - 20,
        duration: 150,
        ease: 'Quad.in',
        onComplete: function() {
          playShockwave(scene, tx, ty, { color: 0x8888dd, endRadius: 120 });
          playImpactRing(scene, tx, ty, { color: 0xaaaaff, endRadius: 60 });
          playElementalBurst(scene, tx, ty, { colors: [0x8888dd, 0xaaaaff, 0xccccff], count: 28, maxDist: 60 });
          playScreenFlash(scene, { color: 0x8888dd, alpha: 0.3, duration: 150 });
          callbacks.onHit && callbacks.onHit();
          // Return to position
          scene.tweens.add({
            targets: monsterSprite,
            x: mx,
            y: my,
            duration: 200,
            ease: 'Sine.out'
          });
        }
      });
    });
    scene.time.delayedCall(750, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 4 — Ember (Division) — fire/lava/ash
  // ────────────────────────────────────────────────

  cindercrab: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.35,
      y: my + (ty - my) * 0.35,
      duration: 110,
      yoyo: true,
      ease: 'Back.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0xff6622, 0xff9944], count: 14, maxDist: 30 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  ashwalker: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Ash cloud
    playSparkBurst(scene, mx, my, { colors: [0x555555, 0x888888, 0xaaaaaa], count: 10, maxDist: 30, duration: 250 });
    scene.time.delayedCall(120, function() {
      scene.tweens.add({
        targets: monsterSprite,
        x: mx + (tx - mx) * 0.4,
        y: my + (ty - my) * 0.4,
        duration: 100,
        yoyo: true,
        ease: 'Quad.in',
        onYoyo: function() {
          playSparkBurst(scene, tx, ty, { colors: [0xff4400, 0xff8833], count: 16, maxDist: 35 });
          callbacks.onHit && callbacks.onHit();
        },
        onComplete: function() {
          callbacks.onComplete && callbacks.onComplete();
        }
      });
    });
  },

  magmatoad: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0xff4400, size: 8 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0xff4400, 0xff8833, 0xffcc44], count: 18, maxDist: 40 });
      playImpactRing(scene, tx, ty, { color: 0xff6622, endRadius: 40 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(500, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  spineshard: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0xcc4400, size: 4 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0xcc4400, 0xaa3300], count: 10, maxDist: 25 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  pyroclast: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: eruption at monster
    playElementalBurst(scene, mx, my - 20, { colors: [0xff4400, 0xff8833, 0xffcc44], count: 24, maxDist: 50, duration: 300 });
    // Phase 2: lava flow beam
    scene.time.delayedCall(200, function() {
      playBeamTrail(scene, mx, my, tx, ty, { color: 0xff4400, trailColor: 0xcc2200, spread: 20, duration: 250 });
    });
    // Phase 3: fire storm impact
    scene.time.delayedCall(400, function() {
      playShockwave(scene, tx, ty, { color: 0xff6622, endRadius: 100 });
      playSparkBurst(scene, tx, ty, { colors: [0xff4400, 0xff8833, 0xffcc44], count: 24, maxDist: 55 });
      playScreenFlash(scene, { color: 0xff4400, alpha: 0.3, duration: 160 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(750, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 5 — Frozen (Fractions) — ice/frost/blizzard
  // ────────────────────────────────────────────────

  frostbite: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0x88ddff, size: 5 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0x88ddff, 0xccf0ff], count: 12, maxDist: 30 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  icicle: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    // Falling icicle from above
    playProjectile(scene, tx, ty - 120, tx, ty, { color: 0xaaeeff, size: 6 }).then(function() {
      playImpactRing(scene, tx, ty, { color: 0x88ccee, endRadius: 35 });
      playSparkBurst(scene, tx, ty, { colors: [0xaaeeff, 0xccf8ff], count: 10, maxDist: 28 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  snowdrift: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.2,
      duration: 140,
      yoyo: true,
      ease: 'Sine.inOut',
      onYoyo: function() {
        playElementalBurst(scene, tx, ty, { colors: [0xddeeff, 0xffffff, 0xccddee], count: 16, maxDist: 45, duration: 350 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  glacial: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.45,
      y: my + (ty - my) * 0.45,
      duration: 130,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playShockwave(scene, tx, ty, { color: 0x88ccee, endRadius: 55 });
        playSparkBurst(scene, tx, ty, { colors: [0x88ccee, 0xaaeeff], count: 14, maxDist: 35 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  absolutezero: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: frost breath beam
    playBeamTrail(scene, mx, my, tx, ty, { color: 0x88ddff, trailColor: 0x55aacc, spread: 25, duration: 300 });
    // Phase 2: ice storm burst
    scene.time.delayedCall(250, function() {
      playElementalBurst(scene, tx, ty, { colors: [0x88ddff, 0xaaeeff, 0xffffff], count: 30, maxDist: 65, duration: 400 });
      playShockwave(scene, tx, ty, { color: 0x88ddff, endRadius: 90 });
      callbacks.onHit && callbacks.onHit();
    });
    // Phase 3: freeze flash
    scene.time.delayedCall(500, function() {
      playScreenFlash(scene, { color: 0xccf0ff, alpha: 0.4, duration: 200 });
      playImpactRing(scene, tx, ty, { color: 0xaaeeff, endRadius: 70 });
    });
    scene.time.delayedCall(750, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 6 — Crystal (Geometry) — prism/crystal/refraction
  // ────────────────────────────────────────────────

  shard: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0xdd88ff, size: 5 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0xdd88ff, 0xee99ff], count: 10, maxDist: 28 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  geode: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      yoyo: true,
      ease: 'Quad.out',
      onYoyo: function() {
        playElementalBurst(scene, tx, ty, { colors: [0xcc66ee, 0xdd88ff, 0xffaaff], count: 20, maxDist: 45 });
        playImpactRing(scene, tx, ty, { color: 0xcc66ee, endRadius: 45 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  prismling: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playBeamTrail(scene, mx, my, tx, ty, { color: 0xff88cc, trailColor: 0x88ccff, spread: 12, duration: 250 });
    scene.time.delayedCall(200, function() {
      playSparkBurst(scene, tx, ty, { colors: [0xff8888, 0x88ff88, 0x8888ff, 0xffff88], count: 16, maxDist: 35 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(420, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  facet: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.4,
      y: my + (ty - my) * 0.4,
      duration: 120,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playImpactRing(scene, tx, ty, { color: 0xbb77dd, endRadius: 45 });
        playSparkBurst(scene, tx, ty, { colors: [0xbb77dd, 0xdd99ff], count: 12, maxDist: 30 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  theprism: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: prismatic beam barrage (three beams in sequence)
    playBeamTrail(scene, mx, my, tx - 20, ty, { color: 0xff4444, trailColor: 0xcc2222, spread: 8, duration: 200 });
    scene.time.delayedCall(100, function() {
      playBeamTrail(scene, mx, my, tx, ty, { color: 0x44ff44, trailColor: 0x22cc22, spread: 8, duration: 200 });
    });
    scene.time.delayedCall(200, function() {
      playBeamTrail(scene, mx, my, tx + 20, ty, { color: 0x4444ff, trailColor: 0x2222cc, spread: 8, duration: 200 });
    });
    // Phase 2: crystal storm at target
    scene.time.delayedCall(350, function() {
      playElementalBurst(scene, tx, ty, { colors: [0xff8888, 0x88ff88, 0x8888ff, 0xffff88, 0xff88ff], count: 30, maxDist: 60 });
      playShockwave(scene, tx, ty, { color: 0xffffff, endRadius: 90 });
      callbacks.onHit && callbacks.onHit();
    });
    // Phase 3: prismatic flash
    scene.time.delayedCall(550, function() {
      playScreenFlash(scene, { color: 0xffffff, alpha: 0.35, duration: 180 });
    });
    scene.time.delayedCall(750, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 7 — Market (Money) — coin/scroll/scale
  // ────────────────────────────────────────────────

  pickpocket: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.5,
      y: my + (ty - my) * 0.5,
      duration: 90,
      yoyo: true,
      ease: 'Quad.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0xffd700, 0xffec80], count: 10, maxDist: 25 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  taxcollector: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      y: my - 20,
      duration: 100,
      ease: 'Quad.out',
      onComplete: function() {
        scene.tweens.add({
          targets: monsterSprite,
          x: mx + (tx - mx) * 0.3,
          y: my + (ty - my) * 0.3,
          duration: 100,
          yoyo: true,
          ease: 'Quad.in',
          onYoyo: function() {
            playImpactRing(scene, tx, ty, { color: 0xcc8833, endRadius: 40 });
            playSparkBurst(scene, tx, ty, { colors: [0xcc8833, 0xeebb66], count: 12, maxDist: 30 });
            callbacks.onHit && callbacks.onHit();
          },
          onComplete: function() {
            callbacks.onComplete && callbacks.onComplete();
          }
        });
      }
    });
  },

  merchant: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    // Scale weight drop from above
    playProjectile(scene, tx, ty - 100, tx, ty, { color: 0xbb8844, size: 8 }).then(function() {
      playImpactRing(scene, tx, ty, { color: 0xbb8844, endRadius: 40 });
      playSparkBurst(scene, tx, ty, { colors: [0xbb8844, 0xddaa66], count: 10, maxDist: 30 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  banker: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Vault door slam + coin shower
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.4,
      y: my + (ty - my) * 0.4,
      duration: 130,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playShockwave(scene, tx, ty, { color: 0x888888, endRadius: 50 });
        playSparkBurst(scene, tx, ty, { colors: [0xffd700, 0xffec80, 0xddbb33], count: 18, maxDist: 40 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  counterfeiter: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: gold flood beam
    playBeamTrail(scene, mx, my, tx, ty, { color: 0xffd700, trailColor: 0xddbb33, spread: 20, duration: 250 });
    // Phase 2: coin barrage
    scene.time.delayedCall(200, function() {
      playProjectile(scene, mx, my - 10, tx, ty, { color: 0xffd700, size: 5 }).then(function() {
        playSparkBurst(scene, tx, ty, { colors: [0xffd700, 0xffec80, 0xddbb33], count: 24, maxDist: 50 });
        callbacks.onHit && callbacks.onHit();
      });
    });
    // Phase 3: flash
    scene.time.delayedCall(500, function() {
      playShockwave(scene, tx, ty, { color: 0xffd700, endRadius: 80 });
      playScreenFlash(scene, { color: 0xffd700, alpha: 0.25, duration: 150 });
    });
    scene.time.delayedCall(700, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 8 — Library (Word Problems) — page/ink/riddle
  // ────────────────────────────────────────────────

  bookworm_e: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.25,
      y: my + (ty - my) * 0.25,
      duration: 130,
      yoyo: true,
      ease: 'Sine.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0xf5f0e0, 0xe8dcc0], count: 14, maxDist: 35, duration: 300 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  inkblot: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0x222244, size: 7 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0x222244, 0x444466, 0x333355], count: 16, maxDist: 38 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  riddler: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    // Question mark blast: burst at target
    playElementalBurst(scene, tx, ty, { colors: [0xddcc44, 0xffee88, 0xccbb33], count: 18, maxDist: 40, duration: 350 });
    scene.time.delayedCall(100, function() {
      playImpactRing(scene, tx, ty, { color: 0xddcc44, endRadius: 40 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  archivist: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Book slam lunge
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.4,
      y: my + (ty - my) * 0.4,
      duration: 120,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playImpactRing(scene, tx, ty, { color: 0x8b7355, endRadius: 45 });
        playSparkBurst(scene, tx, ty, { colors: [0xf5f0e0, 0xe8dcc0, 0xd0c8a0], count: 20, maxDist: 45 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  theparadox: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: reality warp — distort at monster position
    playSparkBurst(scene, mx, my, { colors: [0x8844cc, 0x44cc88, 0xcc4488], count: 16, maxDist: 40, duration: 250 });
    // Phase 2: impossible geometry burst
    scene.time.delayedCall(200, function() {
      playBeamTrail(scene, mx, my, tx, ty, { color: 0x8844cc, trailColor: 0x44cc88, spread: 18, duration: 250 });
    });
    scene.time.delayedCall(380, function() {
      playElementalBurst(scene, tx, ty, { colors: [0x8844cc, 0x44cc88, 0xcc4488, 0xffffff], count: 28, maxDist: 55 });
      playShockwave(scene, tx, ty, { color: 0x8844cc, endRadius: 100 });
      callbacks.onHit && callbacks.onHit();
    });
    // Phase 3: paradox flash
    scene.time.delayedCall(550, function() {
      playScreenFlash(scene, { color: 0x8844cc, alpha: 0.35, duration: 200 });
    });
    scene.time.delayedCall(780, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  // ────────────────────────────────────────────────
  // FLOOR 9 — Mending (Boss Gauntlet) — rune/hex/void
  // ────────────────────────────────────────────────

  runebound: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var tx = targetSprite.x, ty = targetSprite.y;
    // Rune circle blast
    playImpactRing(scene, tx, ty, { color: 0x44aaff, endRadius: 50, strokeWidth: 4 });
    scene.time.delayedCall(80, function() {
      playElementalBurst(scene, tx, ty, { colors: [0x44aaff, 0x6688cc, 0x88ccff], count: 18, maxDist: 40 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(400, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  hexweave: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0x9944cc, size: 6 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0x9944cc, 0xbb66ee, 0x772299], count: 14, maxDist: 35 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  grimoire: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    playProjectile(scene, mx, my, tx, ty, { color: 0xeedd88, size: 5 }).then(function() {
      playSparkBurst(scene, tx, ty, { colors: [0xeedd88, 0xf5f0e0, 0xddcc66], count: 12, maxDist: 30 });
      playImpactRing(scene, tx, ty, { color: 0xeedd88, endRadius: 35 });
      callbacks.onHit && callbacks.onHit();
    });
    scene.time.delayedCall(450, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },

  familiar: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Shadow pounce — fast lunge
    scene.tweens.add({
      targets: monsterSprite,
      x: mx + (tx - mx) * 0.6,
      y: my + (ty - my) * 0.6,
      duration: 100,
      yoyo: true,
      ease: 'Back.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, { colors: [0x332244, 0x553366, 0x221133], count: 14, maxDist: 30 });
        playImpactRing(scene, tx, ty, { color: 0x553366, endRadius: 35 });
        callbacks.onHit && callbacks.onHit();
      },
      onComplete: function() {
        callbacks.onComplete && callbacks.onComplete();
      }
    });
  },

  theorem: function(scene, monsterSprite, targetSprite, damage, callbacks) {
    var mx = monsterSprite.x, my = monsterSprite.y;
    var tx = targetSprite.x, ty = targetSprite.y;
    // Phase 1: theorem proof chain — rune circles at monster
    playImpactRing(scene, mx, my, { color: 0x44aaff, endRadius: 40, strokeWidth: 3 });
    playSparkBurst(scene, mx, my, { colors: [0x44aaff, 0x88ccff], count: 12, maxDist: 30, duration: 200 });
    // Phase 2: arcane storm beam
    scene.time.delayedCall(200, function() {
      playBeamTrail(scene, mx, my, tx, ty, { color: 0x9944cc, trailColor: 0x44aaff, spread: 22, duration: 280 });
    });
    // Phase 3: reality crack at target
    scene.time.delayedCall(420, function() {
      playShockwave(scene, tx, ty, { color: 0x9944cc, endRadius: 110 });
      playElementalBurst(scene, tx, ty, { colors: [0x9944cc, 0x44aaff, 0xffffff, 0xeedd88], count: 32, maxDist: 65 });
      playImpactRing(scene, tx, ty, { color: 0x44aaff, endRadius: 70, strokeWidth: 4 });
      callbacks.onHit && callbacks.onHit();
    });
    // Phase 4: arcane flash
    scene.time.delayedCall(600, function() {
      playScreenFlash(scene, { color: 0x9944cc, alpha: 0.35, duration: 200 });
    });
    scene.time.delayedCall(800, function() {
      callbacks.onComplete && callbacks.onComplete();
    });
  },
};

// ================================================================
// MAIN DISPATCH FUNCTION
// ================================================================

/**
 * Play a monster's attack animation.
 *
 * @param {Phaser.Scene} scene        - The current Phaser scene.
 * @param {Phaser.GameObjects.Sprite} monsterSprite - The attacking monster's sprite.
 * @param {Phaser.GameObjects.Sprite} targetSprite  - The target hero's sprite.
 * @param {string} monsterId          - The monster's identifier key.
 * @param {number} damage             - The damage value (passed to animation for scaling).
 * @param {Object} callbacks          - { onHit: Function, onComplete: Function }
 */
export function playMonsterAttack(scene, monsterSprite, targetSprite, monsterId, damage, callbacks) {
  var cb = callbacks || {};
  var attackFn = MONSTER_ATTACK_REGISTRY[monsterId] || defaultMonsterAttack;
  attackFn(scene, monsterSprite, targetSprite, damage, cb);
}
