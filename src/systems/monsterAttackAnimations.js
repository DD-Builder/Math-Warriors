/**
 * Monster Attack Animation System
 *
 * Provides themed attack animations for all 45 monsters across 9 floors.
 * Each monster has a unique animation that matches its floor's visual theme.
 *
 * Regular monsters: 300-500ms total duration
 * Boss monsters: 500-800ms total duration, multi-phase attacks
 *
 * Floor themes:
 *   1 Garden   — green/nature spore bursts, vine projectiles
 *   2 Tidepool — teal water splashes, ink projectiles, bubble bursts
 *   3 Cloud    — yellow lightning sparks, hail projectiles, wind shockwaves
 *   4 Ember    — orange/red fire sparks, lava projectiles, flame bursts
 *   5 Frozen   — blue/white ice crystals, frost beams, blizzard particles
 *   6 Crystal  — lavender/purple prism beams, light refraction, crystal sparks
 *   7 Market   — gold coin projectiles, scroll bursts, mercantile flash
 *   8 Library  — dark ink projectiles, page flutter, arcane symbols
 *   9 Mending  — rune circles, void particles, arcane beams
 */

import {
  playSparkBurst,
  playImpactRing,
  playProjectile,
  playShockwave,
  playBeamTrail,
  playElementalBurst,
  playScreenFlash,
  playSlashArc,
  playGroundCrack,
  playHitStop,
} from './vfx.js';

// ================================================================
// REGISTRY & DISPATCH
// ================================================================

export const MONSTER_ATTACK_REGISTRY = {};

export function playMonsterAttack(scene, monsterSprite, targetSprite, monsterId, damage, callbacks) {
  const entry = MONSTER_ATTACK_REGISTRY[monsterId];
  if (entry) {
    entry(scene, monsterSprite, targetSprite, damage, callbacks);
  } else {
    defaultMonsterAttack(scene, monsterSprite, targetSprite, damage, callbacks);
  }
}

function defaultMonsterAttack(scene, monsterSprite, targetSprite, damage, callbacks) {
  // Generic attack: projectile -> hit reaction
  const mx = monsterSprite.x, my = monsterSprite.y;
  const tx = targetSprite.x, ty = targetSprite.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0xcccccc, size: 6, speed: 500 }).then(() => {
    playImpactRing(scene, tx, ty, { color: 0xcccccc, endRadius: 40, duration: 250 });
    playSparkBurst(scene, tx, ty, { count: 10, colors: [0xffffff, 0xcccccc], duration: 300 });
    callbacks?.onHit?.();
    scene.time.delayedCall(300, () => { callbacks?.onComplete?.(); });
  });
}

// ================================================================
// FLOOR 1 — The Garden (Addition) — spore / vine / thorn
// Colors: greens, sage, leaf, forest from PAPER palette
// ================================================================

// Sproutling — tiny spore lob: arcs a small green spore at the target
MONSTER_ATTACK_REGISTRY['sproutling'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.25,
    y: my + (ty - my) * 0.25,
    duration: 130,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0x7d9f6d, 0xb7c4a4, 0x9bad87],
        count: 12, maxDist: 30, duration: 300
      });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Thornwall — thorn volley: fires a sharp green projectile then bursts thorns
MONSTER_ATTACK_REGISTRY['thornwall'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x3c6b4f, size: 5, speed: 550 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x3c6b4f, 0x57835f, 0x7d9f6d],
      count: 14, maxDist: 35, duration: 280
    });
    playImpactRing(scene, tx, ty, { color: 0x3c6b4f, endRadius: 35, duration: 250 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// Blossom Fiend — petal storm: sprays pink petals then lunges with a blossom burst
MONSTER_ATTACK_REGISTRY['blossomfiend'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Petal spray wind-up
  playSparkBurst(scene, mx, my, {
    colors: [0xe8a09a, 0xf2bf9a, 0xb7c4a4],
    count: 10, maxDist: 30, duration: 200
  });
  scene.time.delayedCall(150, function() {
    scene.tweens.add({
      targets: ms,
      x: mx + (tx - mx) * 0.4,
      y: my + (ty - my) * 0.4,
      duration: 100,
      yoyo: true,
      ease: 'Back.out',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, {
          colors: [0xe8a09a, 0x9bad87, 0xf2bf9a],
          count: 16, maxDist: 40, duration: 300
        });
        playSlashArc(scene, tx, ty, { color: 0xe8a09a, lineWidth: 4, arcSpread: 60, duration: 250 });
        cb?.onHit?.();
      },
      onComplete: function() {
        cb?.onComplete?.();
      }
    });
  });
};

// Puffshroom — spore cloud: inflates then pops, releasing a toxic spore cloud
MONSTER_ATTACK_REGISTRY['puffshroom'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  // Inflate
  scene.tweens.add({
    targets: ms,
    scaleX: 1.3,
    scaleY: 0.8,
    duration: 120,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playElementalBurst(scene, tx, ty, {
        colors: [0x9bad87, 0xb7c4a4, 0x7d9f6d],
        count: 20, maxDist: 50, duration: 400
      });
      playShockwave(scene, tx, ty, { color: 0x9bad87, endRadius: 45, duration: 300 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Briar King (BOSS) — crown of thorns: vine beam, thorn barrage, ground crack, nature flash
MONSTER_ATTACK_REGISTRY['briarking'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: vine warning beam
  playBeamTrail(scene, mx, my, tx, ty, {
    color: 0x3c6b4f, trailColor: 0x2a5240,
    spread: 15, duration: 200
  });
  // Phase 2: thorn projectile into ground crack
  scene.time.delayedCall(250, function() {
    playProjectile(scene, mx, my, tx, ty, { color: 0x7d9f6d, size: 7, speed: 600 }).then(function() {
      playShockwave(scene, tx, ty, { color: 0x3c6b4f, endRadius: 80, duration: 300 });
      playSparkBurst(scene, tx, ty, {
        colors: [0x7d9f6d, 0xb7c4a4, 0xecb964],
        count: 22, maxDist: 50, duration: 350
      });
      playGroundCrack(scene, tx, ty, {
        lineCount: 5, length: 55, color: 0x3c6b4f,
        alpha: 0.7, lineWidth: 3, duration: 400
      });
      cb?.onHit?.();
    });
  });
  // Phase 3: nature screen flash
  scene.time.delayedCall(580, function() {
    playScreenFlash(scene, { color: 0x3c6b4f, alpha: 0.25, duration: 150 });
  });
  scene.time.delayedCall(750, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 2 — Tidepool Ruins (Subtraction) — water / ink / tentacle
// Colors: teal, deep blue, ink dark from PAPER palette
// ================================================================

// Drifter — jellyfish sting: drifts forward lazily and zaps with teal sparks
MONSTER_ATTACK_REGISTRY['drifter'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.2,
    y: my + (ty - my) * 0.2,
    duration: 160,
    yoyo: true,
    ease: 'Sine.inOut',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0x44888a, 0x7fb3ae, 0xa4c8d8],
        count: 10, maxDist: 35, duration: 350
      });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Gulper — engulf snap: lunges forward with gaping maw, water splash impact ring
MONSTER_ATTACK_REGISTRY['gulper'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.5,
    y: my + (ty - my) * 0.5,
    duration: 100,
    yoyo: true,
    ease: 'Back.out',
    onYoyo: function() {
      playImpactRing(scene, tx, ty, { color: 0x2a6063, endRadius: 40, duration: 250 });
      playSparkBurst(scene, tx, ty, {
        colors: [0x44888a, 0x7fb3ae, 0x2a6063],
        count: 12, maxDist: 30, duration: 280
      });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Inkspitter — ink glob: spits a dark ink projectile that splatters on impact
MONSTER_ATTACK_REGISTRY['inkspitter'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x1f3d3f, size: 7, speed: 500 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x1f3d3f, 0x1f4244, 0x2a6063],
      count: 16, maxDist: 40, duration: 320
    });
    playImpactRing(scene, tx, ty, { color: 0x1f4244, endRadius: 35, duration: 250 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// Abyssal Eel — electric current: fires a teal beam trail that crackles on arrival
MONSTER_ATTACK_REGISTRY['abyssaleel'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playBeamTrail(scene, mx, my, tx, ty, {
    color: 0x7fb3ae, trailColor: 0x2a6063,
    spread: 10, duration: 250
  });
  scene.time.delayedCall(200, function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x7fb3ae, 0xa4c8d8, 0x44888a],
      count: 14, maxDist: 35, duration: 300
    });
    playSlashArc(scene, tx, ty, { color: 0x7fb3ae, lineWidth: 3, arcSpread: 55, duration: 220 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(420, function() {
    cb?.onComplete?.();
  });
};

// The Pressure (BOSS) — crushing depths: water pressure wave from above, tentacle slam, deep flash
MONSTER_ATTACK_REGISTRY['pressure'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: crushing water pressure descending
  playElementalBurst(scene, tx, ty - 40, {
    colors: [0x2a6063, 0x44888a, 0x7fb3ae],
    count: 24, maxDist: 60, duration: 300
  });
  // Phase 2: tentacle slam lunge
  scene.time.delayedCall(200, function() {
    scene.tweens.add({
      targets: ms,
      x: mx + (tx - mx) * 0.45,
      y: my + (ty - my) * 0.45,
      duration: 120,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playShockwave(scene, tx, ty, { color: 0x1f4244, endRadius: 100, duration: 350 });
        playImpactRing(scene, tx, ty, { color: 0x44888a, endRadius: 60, duration: 280 });
        playGroundCrack(scene, tx, ty, {
          lineCount: 4, length: 50, color: 0x2a6063,
          alpha: 0.6, lineWidth: 3, duration: 350
        });
        cb?.onHit?.();
      }
    });
  });
  // Phase 3: deep abyss flash
  scene.time.delayedCall(520, function() {
    playScreenFlash(scene, { color: 0x1f4244, alpha: 0.3, duration: 180 });
  });
  scene.time.delayedCall(720, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 3 — Cloud Maze (Multiplication) — lightning / hail / wind
// Colors: sky, yellow/gold lightning, pale storm hues
// ================================================================

// Stormwing — wing gust: quick lunge with a burst of yellow-white lightning sparks
MONSTER_ATTACK_REGISTRY['stormwing'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.3,
    duration: 100,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0xecb964, 0xfdfbf2, 0xa4c8d8],
        count: 14, maxDist: 35, duration: 280
      });
      playImpactRing(scene, tx, ty, { color: 0xecb964, endRadius: 35, duration: 250 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Hailshot — ice shard volley: fires a hailstone projectile from above
MONSTER_ATTACK_REGISTRY['hailshot'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my - 30, tx, ty, { color: 0xa4c8d8, size: 5, speed: 580 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0xa4c8d8, 0xfdfbf2, 0xf5eedd],
      count: 12, maxDist: 30, duration: 260
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Cyclone Imp — spin attack: spirals toward target with wind shockwave
MONSTER_ATTACK_REGISTRY['cycloneimp'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    angle: 360,
    x: mx + (tx - mx) * 0.45,
    y: my + (ty - my) * 0.45,
    duration: 180,
    yoyo: true,
    ease: 'Cubic.out',
    onYoyo: function() {
      playShockwave(scene, tx, ty, { color: 0xa4c8d8, endRadius: 50, duration: 250 });
      playSlashArc(scene, tx, ty, { color: 0xa4c8d8, lineWidth: 3, arcSpread: 65, duration: 220 });
      cb?.onHit?.();
    },
    onComplete: function() {
      ms.angle = 0;
      cb?.onComplete?.();
    }
  });
};

// Thunderclap — lightning strike: instant flash of lightning sparks and shockwave at target
MONSTER_ATTACK_REGISTRY['thunderclap'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  playSparkBurst(scene, tx, ty, {
    colors: [0xecb964, 0xfdfbf2, 0xffffff],
    count: 18, maxDist: 45, duration: 300
  });
  scene.time.delayedCall(80, function() {
    playShockwave(scene, tx, ty, { color: 0xecb964, endRadius: 70, duration: 280 });
    playHitStop(scene, ts, { duration: 60 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Skywhale (BOSS) — leviathan dive: rises up, dive-bombs target with massive storm impact
MONSTER_ATTACK_REGISTRY['skywhale'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: rise up with wind particles
  playSparkBurst(scene, mx, my, {
    colors: [0xa4c8d8, 0xfdfbf2],
    count: 8, maxDist: 25, duration: 200
  });
  scene.tweens.add({
    targets: ms,
    y: my - 40,
    duration: 200,
    ease: 'Quad.out'
  });
  // Phase 2: dive bomb
  scene.time.delayedCall(220, function() {
    scene.tweens.add({
      targets: ms,
      x: tx,
      y: ty - 20,
      duration: 150,
      ease: 'Quad.in',
      onComplete: function() {
        playShockwave(scene, tx, ty, { color: 0xa4c8d8, endRadius: 120, duration: 350 });
        playImpactRing(scene, tx, ty, { color: 0xecb964, endRadius: 60, duration: 280 });
        playElementalBurst(scene, tx, ty, {
          colors: [0xa4c8d8, 0xecb964, 0xfdfbf2],
          count: 28, maxDist: 60, duration: 400
        });
        playGroundCrack(scene, tx, ty, {
          lineCount: 5, length: 65, color: 0xa4c8d8,
          alpha: 0.6, lineWidth: 3, duration: 400
        });
        playScreenFlash(scene, { color: 0xecb964, alpha: 0.3, duration: 150 });
        cb?.onHit?.();
        // Return to position
        scene.tweens.add({
          targets: ms,
          x: mx, y: my,
          duration: 200,
          ease: 'Sine.out'
        });
      }
    });
  });
  scene.time.delayedCall(750, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 4 — Ember Caves (Division) — fire / lava / ash
// Colors: coral, orange, fire reds from PAPER palette
// ================================================================

// Cindercrab — claw snap: quick pincer lunge with fire sparks
MONSTER_ATTACK_REGISTRY['cindercrab'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.35,
    y: my + (ty - my) * 0.35,
    duration: 110,
    yoyo: true,
    ease: 'Back.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0xe78f6c, 0xe39a4a, 0xd06a4d],
        count: 14, maxDist: 30, duration: 280
      });
      playSlashArc(scene, tx, ty, { color: 0xe78f6c, lineWidth: 4, arcSpread: 50, duration: 220 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Ashwalker — ash cloud: creates an ash haze then lunges through it with fire burst
MONSTER_ATTACK_REGISTRY['ashwalker'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Ash cloud wind-up
  playSparkBurst(scene, mx, my, {
    colors: [0xd9cfb2, 0xe8dec6, 0xf5eedd],
    count: 10, maxDist: 30, duration: 250
  });
  scene.time.delayedCall(120, function() {
    scene.tweens.add({
      targets: ms,
      x: mx + (tx - mx) * 0.4,
      y: my + (ty - my) * 0.4,
      duration: 100,
      yoyo: true,
      ease: 'Quad.in',
      onYoyo: function() {
        playSparkBurst(scene, tx, ty, {
          colors: [0xe78f6c, 0xd06a4d, 0xe39a4a],
          count: 16, maxDist: 35, duration: 300
        });
        cb?.onHit?.();
      },
      onComplete: function() {
        cb?.onComplete?.();
      }
    });
  });
};

// Magma Toad — lava spit: fires a glowing lava glob that splashes on impact
MONSTER_ATTACK_REGISTRY['magmatoad'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0xd06a4d, size: 8, speed: 480 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0xd06a4d, 0xe78f6c, 0xecb964],
      count: 18, maxDist: 40, duration: 320
    });
    playImpactRing(scene, tx, ty, { color: 0xe78f6c, endRadius: 40, duration: 260 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(500, function() {
    cb?.onComplete?.();
  });
};

// Spineshard — spine volley: rapid-fire small lava shard projectile
MONSTER_ATTACK_REGISTRY['spineshard'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0xd06a4d, size: 4, speed: 650 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0xd06a4d, 0xe39a4a],
      count: 10, maxDist: 25, duration: 250
    });
    playHitStop(scene, ts, { duration: 40 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(380, function() {
    cb?.onComplete?.();
  });
};

// Pyroclast (BOSS) — volcanic eruption: eruption at source, lava beam, fire storm, screen flash
MONSTER_ATTACK_REGISTRY['pyroclast'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: eruption at monster position
  playElementalBurst(scene, mx, my - 20, {
    colors: [0xd06a4d, 0xe78f6c, 0xecb964],
    count: 24, maxDist: 50, duration: 300
  });
  // Phase 2: lava flow beam
  scene.time.delayedCall(200, function() {
    playBeamTrail(scene, mx, my, tx, ty, {
      color: 0xd06a4d, trailColor: 0xe39a4a,
      spread: 20, duration: 250
    });
  });
  // Phase 3: fire storm impact with ground cracks
  scene.time.delayedCall(400, function() {
    playShockwave(scene, tx, ty, { color: 0xe78f6c, endRadius: 100, duration: 350 });
    playSparkBurst(scene, tx, ty, {
      colors: [0xd06a4d, 0xe78f6c, 0xecb964],
      count: 24, maxDist: 55, duration: 380
    });
    playGroundCrack(scene, tx, ty, {
      lineCount: 6, length: 60, color: 0xe39a4a,
      alpha: 0.7, lineWidth: 3, duration: 400
    });
    playScreenFlash(scene, { color: 0xd06a4d, alpha: 0.3, duration: 160 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(750, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 5 — Frozen Peak (Fractions) — ice / frost / blizzard
// Colors: tealL, sky, whites, ice blues from PAPER palette
// ================================================================

// Frostbite — frost snap: quick ice shard projectile with crystal burst
MONSTER_ATTACK_REGISTRY['frostbite'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x7fb3ae, size: 5, speed: 560 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x7fb3ae, 0xa4c8d8, 0xfdfbf2],
      count: 12, maxDist: 30, duration: 280
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Icicle Imp — falling icicle: drops a sharp icicle from above with shatter effect
MONSTER_ATTACK_REGISTRY['icicle'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  // Icicle falls from above
  playProjectile(scene, tx, ty - 120, tx, ty, { color: 0xa4c8d8, size: 6, speed: 600 }).then(function() {
    playImpactRing(scene, tx, ty, { color: 0x7fb3ae, endRadius: 35, duration: 250 });
    playSparkBurst(scene, tx, ty, {
      colors: [0xa4c8d8, 0xfdfbf2, 0xf5eedd],
      count: 10, maxDist: 28, duration: 260
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Snowdrift — blizzard gust: gentle push forward with wide blizzard particle burst
MONSTER_ATTACK_REGISTRY['snowdrift'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.2,
    duration: 140,
    yoyo: true,
    ease: 'Sine.inOut',
    onYoyo: function() {
      playElementalBurst(scene, tx, ty, {
        colors: [0xfdfbf2, 0xf5eedd, 0xa4c8d8],
        count: 16, maxDist: 45, duration: 350
      });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Glacial Golem — ice slam: heavy lunge with shockwave and crystal burst
MONSTER_ATTACK_REGISTRY['glacial'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.45,
    y: my + (ty - my) * 0.45,
    duration: 130,
    yoyo: true,
    ease: 'Quad.in',
    onYoyo: function() {
      playShockwave(scene, tx, ty, { color: 0x7fb3ae, endRadius: 55, duration: 280 });
      playSparkBurst(scene, tx, ty, {
        colors: [0x7fb3ae, 0xa4c8d8, 0xfdfbf2],
        count: 14, maxDist: 35, duration: 300
      });
      playHitStop(scene, ts, { duration: 50 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Absolute Zero (BOSS) — deep freeze: frost breath beam, ice storm burst, freeze flash
MONSTER_ATTACK_REGISTRY['absolutezero'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: frost breath beam
  playBeamTrail(scene, mx, my, tx, ty, {
    color: 0x7fb3ae, trailColor: 0x44888a,
    spread: 25, duration: 300
  });
  // Phase 2: ice storm burst
  scene.time.delayedCall(250, function() {
    playElementalBurst(scene, tx, ty, {
      colors: [0x7fb3ae, 0xa4c8d8, 0xfdfbf2],
      count: 30, maxDist: 65, duration: 400
    });
    playShockwave(scene, tx, ty, { color: 0x7fb3ae, endRadius: 90, duration: 320 });
    cb?.onHit?.();
  });
  // Phase 3: freeze flash and impact ring
  scene.time.delayedCall(500, function() {
    playScreenFlash(scene, { color: 0xfdfbf2, alpha: 0.4, duration: 200 });
    playImpactRing(scene, tx, ty, { color: 0xa4c8d8, endRadius: 70, duration: 300 });
    playGroundCrack(scene, tx, ty, {
      lineCount: 5, length: 55, color: 0x7fb3ae,
      alpha: 0.6, lineWidth: 2, duration: 400
    });
  });
  scene.time.delayedCall(750, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 6 — Crystal Caverns (Geometry) — prism / crystal / refraction
// Colors: lavender, lavenderD, purples from PAPER palette
// ================================================================

// Crystal Shard — shard fling: shoots a sharp crystal projectile
MONSTER_ATTACK_REGISTRY['shard'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x9c8fc0, size: 5, speed: 580 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x9c8fc0, 0x7c6fa8, 0xf5eedd],
      count: 10, maxDist: 28, duration: 260
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Geode — crystal burst: inflates and explodes with a prismatic elemental burst
MONSTER_ATTACK_REGISTRY['geode'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    scaleX: 1.2,
    scaleY: 1.2,
    duration: 100,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playElementalBurst(scene, tx, ty, {
        colors: [0x9c8fc0, 0x7c6fa8, 0xe8a09a],
        count: 20, maxDist: 45, duration: 350
      });
      playImpactRing(scene, tx, ty, { color: 0x9c8fc0, endRadius: 45, duration: 260 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Prismling — light split: fires a rainbow-hued beam trail that scatters into prismatic sparks
MONSTER_ATTACK_REGISTRY['prismling'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playBeamTrail(scene, mx, my, tx, ty, {
    color: 0xe8a09a, trailColor: 0x7fb3ae,
    spread: 12, duration: 250
  });
  scene.time.delayedCall(200, function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0xe8a09a, 0x9c8fc0, 0x7fb3ae, 0xecb964],
      count: 16, maxDist: 35, duration: 300
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(420, function() {
    cb?.onComplete?.();
  });
};

// Facet Guardian — mirror bash: heavy crystal-armored lunge with impact ring
MONSTER_ATTACK_REGISTRY['facet'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.4,
    y: my + (ty - my) * 0.4,
    duration: 120,
    yoyo: true,
    ease: 'Quad.in',
    onYoyo: function() {
      playImpactRing(scene, tx, ty, { color: 0x7c6fa8, endRadius: 45, duration: 260 });
      playSparkBurst(scene, tx, ty, {
        colors: [0x7c6fa8, 0x9c8fc0, 0xfdfbf2],
        count: 12, maxDist: 30, duration: 280
      });
      playSlashArc(scene, tx, ty, { color: 0x9c8fc0, lineWidth: 4, arcSpread: 60, duration: 230 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// The Prism (BOSS) — prismatic barrage: three colored beams, crystal storm, rainbow flash
MONSTER_ATTACK_REGISTRY['theprism'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: triple prismatic beams in sequence
  playBeamTrail(scene, mx, my, tx - 20, ty, {
    color: 0xe8a09a, trailColor: 0xd06a4d,
    spread: 8, duration: 200
  });
  scene.time.delayedCall(100, function() {
    playBeamTrail(scene, mx, my, tx, ty, {
      color: 0x9bad87, trailColor: 0x57835f,
      spread: 8, duration: 200
    });
  });
  scene.time.delayedCall(200, function() {
    playBeamTrail(scene, mx, my, tx + 20, ty, {
      color: 0x9c8fc0, trailColor: 0x7c6fa8,
      spread: 8, duration: 200
    });
  });
  // Phase 2: crystal storm at target
  scene.time.delayedCall(350, function() {
    playElementalBurst(scene, tx, ty, {
      colors: [0xe8a09a, 0x9bad87, 0x9c8fc0, 0xecb964, 0xa4c8d8],
      count: 30, maxDist: 60, duration: 400
    });
    playShockwave(scene, tx, ty, { color: 0xfdfbf2, endRadius: 90, duration: 320 });
    playHitStop(scene, ts, { duration: 60 });
    cb?.onHit?.();
  });
  // Phase 3: prismatic flash
  scene.time.delayedCall(550, function() {
    playScreenFlash(scene, { color: 0xfdfbf2, alpha: 0.35, duration: 180 });
  });
  scene.time.delayedCall(750, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 7 — Market Square (Money) — coin / scroll / scales
// Colors: gold, peach, sand, orange from PAPER palette
// ================================================================

// Pickpocket — quick swipe: fast lunge with gold spark scatter
MONSTER_ATTACK_REGISTRY['pickpocket'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.5,
    y: my + (ty - my) * 0.5,
    duration: 90,
    yoyo: true,
    ease: 'Quad.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0xecb964, 0xe39a4a, 0xf2bf9a],
        count: 10, maxDist: 25, duration: 250
      });
      playSlashArc(scene, tx, ty, { color: 0xecb964, lineWidth: 3, arcSpread: 45, duration: 200 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Tax Collector — stamp slam: rises up with authority then slams down with a gold impact
MONSTER_ATTACK_REGISTRY['taxcollector'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Rise with importance
  scene.tweens.add({
    targets: ms,
    y: my - 20,
    duration: 100,
    ease: 'Quad.out',
    onComplete: function() {
      scene.tweens.add({
        targets: ms,
        x: mx + (tx - mx) * 0.3,
        y: my + (ty - my) * 0.3,
        duration: 100,
        yoyo: true,
        ease: 'Quad.in',
        onYoyo: function() {
          playImpactRing(scene, tx, ty, { color: 0xe39a4a, endRadius: 40, duration: 250 });
          playSparkBurst(scene, tx, ty, {
            colors: [0xe39a4a, 0xecb964, 0xf2bf9a],
            count: 12, maxDist: 30, duration: 280
          });
          cb?.onHit?.();
        },
        onComplete: function() {
          cb?.onComplete?.();
        }
      });
    }
  });
};

// Rogue Merchant — scale weight drop: heavy weight projectile from above
MONSTER_ATTACK_REGISTRY['merchant'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  // Weight drops from above
  playProjectile(scene, tx, ty - 100, tx, ty, { color: 0xd9cfb2, size: 8, speed: 520 }).then(function() {
    playImpactRing(scene, tx, ty, { color: 0xd9cfb2, endRadius: 40, duration: 260 });
    playSparkBurst(scene, tx, ty, {
      colors: [0xecb964, 0xe39a4a, 0xd9cfb2],
      count: 10, maxDist: 30, duration: 280
    });
    playGroundCrack(scene, tx, ty, {
      lineCount: 3, length: 35, color: 0xd9cfb2,
      alpha: 0.5, lineWidth: 2, duration: 300
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// Corrupt Banker — vault slam: heavy lunge with gold coin shower and shockwave
MONSTER_ATTACK_REGISTRY['banker'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.4,
    y: my + (ty - my) * 0.4,
    duration: 130,
    yoyo: true,
    ease: 'Quad.in',
    onYoyo: function() {
      playShockwave(scene, tx, ty, { color: 0xd9cfb2, endRadius: 50, duration: 280 });
      playSparkBurst(scene, tx, ty, {
        colors: [0xecb964, 0xe39a4a, 0xf2bf9a],
        count: 18, maxDist: 40, duration: 320
      });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// The Counterfeiter (BOSS) — gold flood: beam of fake gold, coin barrage, mint press shockwave, flash
MONSTER_ATTACK_REGISTRY['counterfeiter'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: gold flood beam
  playBeamTrail(scene, mx, my, tx, ty, {
    color: 0xecb964, trailColor: 0xe39a4a,
    spread: 20, duration: 250
  });
  // Phase 2: coin barrage projectile
  scene.time.delayedCall(200, function() {
    playProjectile(scene, mx, my - 10, tx, ty, { color: 0xecb964, size: 6, speed: 550 }).then(function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0xecb964, 0xe39a4a, 0xf2bf9a],
        count: 24, maxDist: 50, duration: 350
      });
      playGroundCrack(scene, tx, ty, {
        lineCount: 4, length: 45, color: 0xe39a4a,
        alpha: 0.6, lineWidth: 3, duration: 380
      });
      cb?.onHit?.();
    });
  });
  // Phase 3: mint press shockwave and flash
  scene.time.delayedCall(500, function() {
    playShockwave(scene, tx, ty, { color: 0xecb964, endRadius: 80, duration: 300 });
    playScreenFlash(scene, { color: 0xecb964, alpha: 0.25, duration: 150 });
  });
  scene.time.delayedCall(700, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 8 — Infinity Library (Word Problems) — page / ink / riddle
// Colors: sand, cream, dark inks, warm browns from PAPER palette
// ================================================================

// Bookworm — page cut: quick lunge with paper-white spark scatter
MONSTER_ATTACK_REGISTRY['bookworm_e'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.25,
    y: my + (ty - my) * 0.25,
    duration: 130,
    yoyo: true,
    ease: 'Sine.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0xf5eedd, 0xe8dec6, 0xd9cfb2],
        count: 14, maxDist: 35, duration: 300
      });
      playSlashArc(scene, tx, ty, { color: 0xf5eedd, lineWidth: 3, arcSpread: 50, duration: 230 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// Inkblot — ink splatter: fires a dark ink glob projectile that splatters into stains
MONSTER_ATTACK_REGISTRY['inkblot'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x1f3d3f, size: 7, speed: 480 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x1f3d3f, 0x1f4244, 0xd9cfb2],
      count: 16, maxDist: 38, duration: 300
    });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// The Riddler — riddle blast: erupts with question-mark-gold arcane burst at target
MONSTER_ATTACK_REGISTRY['riddler'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  playElementalBurst(scene, tx, ty, {
    colors: [0xecb964, 0xe39a4a, 0xf5eedd],
    count: 18, maxDist: 40, duration: 350
  });
  scene.time.delayedCall(100, function() {
    playImpactRing(scene, tx, ty, { color: 0xecb964, endRadius: 40, duration: 260 });
    playHitStop(scene, ts, { duration: 40 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Dark Archivist — tome slam: heavy book slam lunge with impact ring and page flutter
MONSTER_ATTACK_REGISTRY['archivist'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.4,
    y: my + (ty - my) * 0.4,
    duration: 120,
    yoyo: true,
    ease: 'Quad.in',
    onYoyo: function() {
      playImpactRing(scene, tx, ty, { color: 0xd9cfb2, endRadius: 45, duration: 260 });
      playSparkBurst(scene, tx, ty, {
        colors: [0xf5eedd, 0xe8dec6, 0xd9cfb2],
        count: 20, maxDist: 45, duration: 320
      });
      playShockwave(scene, tx, ty, { color: 0xd9cfb2, endRadius: 50, duration: 280 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// The Paradox (BOSS) — reality warp: distortion sparks, impossible geometry beam, paradox shockwave, flash
MONSTER_ATTACK_REGISTRY['theparadox'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: reality distortion sparks at monster position
  playSparkBurst(scene, mx, my, {
    colors: [0x9c8fc0, 0x7fb3ae, 0xe8a09a],
    count: 16, maxDist: 40, duration: 250
  });
  // Phase 2: impossible geometry beam
  scene.time.delayedCall(200, function() {
    playBeamTrail(scene, mx, my, tx, ty, {
      color: 0x9c8fc0, trailColor: 0x7fb3ae,
      spread: 18, duration: 250
    });
  });
  // Phase 3: paradox shockwave and burst at target
  scene.time.delayedCall(380, function() {
    playElementalBurst(scene, tx, ty, {
      colors: [0x9c8fc0, 0x7fb3ae, 0xe8a09a, 0xfdfbf2],
      count: 28, maxDist: 55, duration: 380
    });
    playShockwave(scene, tx, ty, { color: 0x9c8fc0, endRadius: 100, duration: 350 });
    playGroundCrack(scene, tx, ty, {
      lineCount: 5, length: 55, color: 0x7c6fa8,
      alpha: 0.7, lineWidth: 3, duration: 400
    });
    cb?.onHit?.();
  });
  // Phase 4: paradox flash
  scene.time.delayedCall(580, function() {
    playScreenFlash(scene, { color: 0x9c8fc0, alpha: 0.35, duration: 200 });
  });
  scene.time.delayedCall(780, function() {
    cb?.onComplete?.();
  });
};

// ================================================================
// FLOOR 9 — The Mending Room (Boss Gauntlet) — rune / hex / void
// Colors: lavenderD, deep purples, arcane blues from PAPER palette
// ================================================================

// Runebound — rune circle blast: conjures an arcane ring at target and detonates it
MONSTER_ATTACK_REGISTRY['runebound'] = function(scene, ms, ts, dmg, cb) {
  const tx = ts.x, ty = ts.y;
  // Rune circle appears then detonates
  playImpactRing(scene, tx, ty, { color: 0x7fb3ae, endRadius: 50, strokeWidth: 4, duration: 280 });
  scene.time.delayedCall(80, function() {
    playElementalBurst(scene, tx, ty, {
      colors: [0x7fb3ae, 0x7c6fa8, 0xa4c8d8],
      count: 18, maxDist: 40, duration: 320
    });
    playHitStop(scene, ts, { duration: 40 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(400, function() {
    cb?.onComplete?.();
  });
};

// Hexweave — hex bolt: fires a violet hex projectile that bursts into dark sparks
MONSTER_ATTACK_REGISTRY['hexweave'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0x7c6fa8, size: 6, speed: 540 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0x7c6fa8, 0x9c8fc0, 0x1f3d3f],
      count: 14, maxDist: 35, duration: 300
    });
    playImpactRing(scene, tx, ty, { color: 0x7c6fa8, endRadius: 38, duration: 250 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// Grimoire — arcane page: fires a glowing page projectile with dual impact ring and sparks
MONSTER_ATTACK_REGISTRY['grimoire'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  playProjectile(scene, mx, my, tx, ty, { color: 0xecb964, size: 5, speed: 520 }).then(function() {
    playSparkBurst(scene, tx, ty, {
      colors: [0xecb964, 0xf5eedd, 0x7c6fa8],
      count: 12, maxDist: 30, duration: 280
    });
    playImpactRing(scene, tx, ty, { color: 0xecb964, endRadius: 35, duration: 250 });
    cb?.onHit?.();
  });
  scene.time.delayedCall(450, function() {
    cb?.onComplete?.();
  });
};

// Familiar — shadow pounce: fast aggressive lunge with dark void sparks and slash arc
MONSTER_ATTACK_REGISTRY['familiar'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  scene.tweens.add({
    targets: ms,
    x: mx + (tx - mx) * 0.6,
    y: my + (ty - my) * 0.6,
    duration: 100,
    yoyo: true,
    ease: 'Back.out',
    onYoyo: function() {
      playSparkBurst(scene, tx, ty, {
        colors: [0x1f3d3f, 0x7c6fa8, 0x9c8fc0],
        count: 14, maxDist: 30, duration: 280
      });
      playSlashArc(scene, tx, ty, { color: 0x7c6fa8, lineWidth: 4, arcSpread: 55, duration: 220 });
      playImpactRing(scene, tx, ty, { color: 0x7c6fa8, endRadius: 35, duration: 250 });
      cb?.onHit?.();
    },
    onComplete: function() {
      cb?.onComplete?.();
    }
  });
};

// The Theorem (BOSS) — proof chain: rune circles at source, arcane storm beam, reality crack, arcane flash
MONSTER_ATTACK_REGISTRY['theorem'] = function(scene, ms, ts, dmg, cb) {
  const mx = ms.x, my = ms.y;
  const tx = ts.x, ty = ts.y;
  // Phase 1: theorem proof rune circles at monster
  playImpactRing(scene, mx, my, { color: 0x7fb3ae, endRadius: 40, strokeWidth: 3, duration: 260 });
  playSparkBurst(scene, mx, my, {
    colors: [0x7fb3ae, 0xa4c8d8],
    count: 12, maxDist: 30, duration: 200
  });
  // Phase 2: arcane storm beam
  scene.time.delayedCall(200, function() {
    playBeamTrail(scene, mx, my, tx, ty, {
      color: 0x7c6fa8, trailColor: 0x7fb3ae,
      spread: 22, duration: 280
    });
  });
  // Phase 3: reality crack at target
  scene.time.delayedCall(420, function() {
    playShockwave(scene, tx, ty, { color: 0x7c6fa8, endRadius: 110, duration: 350 });
    playElementalBurst(scene, tx, ty, {
      colors: [0x7c6fa8, 0x7fb3ae, 0xfdfbf2, 0xecb964],
      count: 32, maxDist: 65, duration: 420
    });
    playImpactRing(scene, tx, ty, { color: 0x7fb3ae, endRadius: 70, strokeWidth: 4, duration: 300 });
    playGroundCrack(scene, tx, ty, {
      lineCount: 6, length: 65, color: 0x7c6fa8,
      alpha: 0.7, lineWidth: 3, duration: 450
    });
    playHitStop(scene, ts, { duration: 70 });
    cb?.onHit?.();
  });
  // Phase 4: arcane flash
  scene.time.delayedCall(620, function() {
    playScreenFlash(scene, { color: 0x7c6fa8, alpha: 0.35, duration: 200 });
  });
  scene.time.delayedCall(800, function() {
    cb?.onComplete?.();
  });
};
