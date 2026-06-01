/**
 * Attack animation system
 *
 * Extracted from BattleScene and enhanced. Two tiers:
 *   FIGHT: enhanced current animations with hit-pause and better particles (200-400ms)
 *   MAGIC: NEW spectacular per-class animations (900ms)
 *
 * Hit-pause: brief 80ms white tint freeze on the target at moment of impact.
 * This makes hits feel like they LAND — a proven technique from fighting games.
 */

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
}

// ================================================================
// HIT-PAUSE EFFECT
// ================================================================

function hitPause(scene, targetSprite, duration = 80) {
  if (!targetSprite || !targetSprite.body) return;
  const body = targetSprite.body;
  body.setTint(0xffffff);
  scene.time.delayedCall(duration, () => {
    body.clearTint();
  });
}

function screenShake(scene, intensity = 0.008, duration = 120) {
  if (scene.cameras && scene.cameras.main) {
    scene.cameras.main.shake(duration, intensity);
  }
}

function enemyRecoil(scene, targetSprite, magnitude = 6) {
  if (!targetSprite || !targetSprite.body) return;
  const body = targetSprite.body;
  const origX = body.x;
  body.setTint(0xff4444);
  scene.tweens.add({
    targets: body, x: origX + magnitude, duration: 40,
    yoyo: true, repeat: 2, ease: 'Sine.inOut',
    onComplete: () => { body.x = origX; body.clearTint(); },
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

// ================================================================
// KNIGHT
// ================================================================

function playKnightFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;

  scene.tweens.add({
    targets: heroSprite.body,
    x: enemyX - 80,
    duration: 350,
    ease: 'Back.out',
    onComplete: () => {
      hitPause(scene, { body: heroSprite.body }, 80);
      screenShake(scene, 0.008, 120);
      enemyRecoil(scene, targetSprite);
      impactRing(scene, enemyX, enemyY, 0xf0d040);
      sparkBurst(scene, enemyX, enemyY, 24, [0xfff8c0, 0xf0d040, 0xffe060], true);
      // Slash arc
      const slash = scene.add.graphics();
      slash.setDepth(20);
      slash.lineStyle(5, 0xf0e8c0, 0.95);
      slash.beginPath();
      slash.moveTo(enemyX - 40, enemyY - 50);
      const cp1x = enemyX + 30, cp1y = enemyY - 30;
      const cp2x = enemyX + 20, cp2y = enemyY + 40;
      const endX = enemyX - 30, endY = enemyY + 50;
      for (let t = 1; t <= 12; t++) {
        const p = t / 12, ip = 1 - p;
        const sx = ip*ip*ip*(enemyX-40) + 3*ip*ip*p*cp1x + 3*ip*p*p*cp2x + p*p*p*endX;
        const sy = ip*ip*ip*(enemyY-50) + 3*ip*ip*p*cp1y + 3*ip*p*p*cp2y + p*p*p*endY;
        slash.lineTo(sx, sy);
      }
      slash.strokePath();
      scene.tweens.add({ targets: slash, alpha: 0, duration: 300, onComplete: () => slash.destroy() });

      if (cb.onHit) cb.onHit();
      scene.tweens.add({
        targets: heroSprite.body, x: heroSprite.x,
        duration: 250, delay: 80, ease: 'Sine.in',
        onComplete: () => { if (cb.onComplete) cb.onComplete(); },
      });
    },
  });
}

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
    const dim = scene.add.rectangle(720, 540, 1500, 1100, 0x000000, 0.1);
    dim.setDepth(19);

    scene.tweens.add({
      targets: heroSprite.body,
      x: enemyX - 60, scaleX: origSX, scaleY: origSY,
      duration: 200, ease: 'Back.out',
      onComplete: () => {
        // 400-500ms: IMPACT
        heroSprite.body.clearTint();
        hitPause(scene, { body: heroSprite.body }, 80);
        screenShake(scene, 0.015, 200);
        enemyRecoil(scene, targetSprite, 10);

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
        impactRing(scene, enemyX, enemyY, 0xf0d040, 120);
        sparkBurst(scene, enemyX, enemyY, 32, [0xf0d040, 0xfff8c0, 0xf0a020], true);

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
// WIZARD
// ================================================================

function playWizardFight(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;

  const beamStartX = heroSprite.x + 60;
  const beamStartY = heroSprite.y - 40;
  const beamColors = { '+': 0xff6020, '-': 0xf0e020, '*': 0x40c0f0, '/': 0x8040c0 };
  const beamColor = beamColors[op] || 0xff6020;
  const particleColors = {
    '+': [0xff8020, 0xff6020],
    '-': [0xf0e020, 0xffe060],
    '*': [0x80e0ff, 0x40c0f0],
    '/': [0xc080f0, 0x8040c0],
  };

  const beam = scene.add.graphics();
  beam.setDepth(20);
  const angle = Math.atan2(enemyY - beamStartY, enemyX - beamStartX);
  const dist = Math.sqrt((enemyX - beamStartX) ** 2 + (enemyY - beamStartY) ** 2);
  beam.fillStyle(beamColor, 0.8);
  beam.save();
  beam.translateCanvas(beamStartX, beamStartY);
  beam.rotateCanvas(angle);
  beam.fillRect(0, -10, dist, 20);
  beam.restore();

  // Trail particles
  for (let i = 0; i < 15; i++) {
    const t = Math.random();
    const px = beamStartX + (enemyX - beamStartX) * t;
    const py = beamStartY + (enemyY - beamStartY) * t + (Math.random() - 0.5) * 20;
    const fp = scene.add.circle(px, py, 3 + Math.random() * 4, beamColor, 0.6);
    fp.setDepth(20);
    scene.tweens.add({
      targets: fp, y: py - 15 - Math.random() * 15, alpha: 0, scale: 0.3,
      duration: 200 + Math.random() * 150, onComplete: () => fp.destroy(),
    });
  }

  hitPause(scene, { body: heroSprite.body }, 60);
  screenShake(scene, 0.01, 150);
  enemyRecoil(scene, targetSprite, 8);
  impactRing(scene, enemyX, enemyY, beamColor, 60);
  impactRing(scene, enemyX, enemyY, 0xffffff, 90);
  sparkBurst(scene, enemyX, enemyY, 30, particleColors[op] || [beamColor]);

  scene.tweens.add({ targets: beam, alpha: 0, duration: 400, onComplete: () => beam.destroy() });

  if (cb.onHit) cb.onHit();
  scene.time.delayedCall(300, () => { if (cb.onComplete) cb.onComplete(); });
}

function playWizardMagic(scene, heroSprite, targetSprite, enemyX, enemyY, op, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;

  // 0-150ms: Arms raise, magic circle at feet
  const circle = scene.add.graphics();
  circle.setDepth(20);
  circle.lineStyle(2, 0xc080f0, 0.5);
  circle.strokeCircle(heroSprite.x, heroSprite.y + 20, 40);

  const rotTween = scene.tweens.add({
    targets: circle, rotation: Math.PI * 2,
    duration: 800, repeat: 0, ease: 'Linear',
  });

  // Element colors
  const elemColors = {
    '+': { main: 0xff6020, flash: 0xff4010, particles: [0xff8020, 0xf06020, 0xffa040] },
    '-': { main: 0xf0e020, flash: 0xffe040, particles: [0xf0e020, 0xffe060, 0xf0c020] },
    '*': { main: 0x40c0f0, flash: 0x80e0ff, particles: [0x80e0ff, 0x40c0f0, 0xa0e8ff] },
    '/': { main: 0x8040c0, flash: 0xc080f0, particles: [0xc080f0, 0x8040c0, 0x6020a0] },
  };
  const elem = elemColors[op] || elemColors['+'];

  // 150-350ms: Massive elemental effect
  scene.time.delayedCall(150, () => {
    // Large particle stream from wizard to enemy
    for (let i = 0; i < 30; i++) {
      const delay = i * 6;
      scene.time.delayedCall(delay, () => {
        const t = i / 30;
        const px = heroSprite.x + (enemyX - heroSprite.x) * t;
        const py = heroSprite.y - 20 + (enemyY - heroSprite.y) * t;
        const spread = 30;
        const p = scene.add.circle(
          px + (Math.random() - 0.5) * spread,
          py + (Math.random() - 0.5) * spread,
          3 + Math.random() * 4,
          elem.particles[Math.floor(Math.random() * 3)],
          0.7,
        );
        p.setDepth(20);
        scene.tweens.add({
          targets: p,
          x: px + (Math.random() - 0.5) * 20,
          y: py - 10 - Math.random() * 15,
          alpha: 0, scale: 0.2,
          duration: 300 + Math.random() * 200,
          onComplete: () => p.destroy(),
        });
      });
    }
  });

  // 350-550ms: DETONATION at enemy
  scene.time.delayedCall(350, () => {
    // Full-screen element flash
    const flash = scene.add.rectangle(720, 540, 1500, 1100, elem.flash, 0.2);
    flash.setDepth(21);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

    // Big burst
    screenShake(scene, 0.02, 250);
    enemyRecoil(scene, targetSprite, 12);
    sparkBurst(scene, enemyX, enemyY, 50, elem.particles, true);
    impactRing(scene, enemyX, enemyY, elem.main, 150);
    impactRing(scene, enemyX, enemyY, 0xffffff, 200);

    if (cb.onHit) cb.onHit();
  });

  // 550-900ms: Aftermath
  scene.time.delayedCall(550, () => {
    scene.tweens.add({ targets: circle, alpha: 0, duration: 200, onComplete: () => { rotTween.stop(); circle.destroy(); } });
  });

  scene.time.delayedCall(900, () => { if (cb.onComplete) cb.onComplete(); });
}

// ================================================================
// BUNNY
// ================================================================

function playBunnyFight(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;
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
        scene.tweens.add({
          targets: heroSprite.body,
          x: enemyX + off[0], y: origY + off[1],
          duration: 140, ease: 'Linear',
          onComplete: () => {
            // Afterimage
            const ghost = scene.add.circle(heroSprite.body.x, heroSprite.body.y, 20, 0xe86898, 0.25);
            ghost.setDepth(19);
            scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.5, duration: 200, onComplete: () => ghost.destroy() });

            // Pink shockwave per hit
            impactRing(scene, enemyX, enemyY, 0xe86898, 30);
            sparkBurst(scene, enemyX, enemyY, 10, [0xe86898, 0xf090b0]);

            if (hitIndex === 0 && cb.onHit) cb.onHit();

            hitIndex++;
            scene.time.delayedCall(60, doHit);
          },
        });
      };
      doHit();
    },
  });
}

function playBunnyMagic(scene, heroSprite, targetSprite, enemyX, enemyY, result, cb) {
  const origSX = heroSprite.body.scaleX;
  const origSY = heroSprite.body.scaleY;
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
                  // 500-650ms: Afterimages converge
                  scene.time.delayedCall(100, () => {
                    for (const ai of afterimages) {
                      scene.tweens.add({
                        targets: ai, x: enemyX, y: enemyY, alpha: 0.8,
                        duration: 100, ease: 'Cubic.in',
                        onComplete: () => ai.destroy(),
                      });
                    }
                    // 650-750ms: Convergence explosion
                    scene.time.delayedCall(120, () => {
                      const flash = scene.add.rectangle(720, 540, 1500, 1100, 0xe86898, 0.15);
                      flash.setDepth(21);
                      scene.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

                      screenShake(scene, 0.015, 180);
                      enemyRecoil(scene, targetSprite, 8);
                      sparkBurst(scene, enemyX, enemyY, 40, [0xe86898, 0xf090b0, 0xff80c0], true);
                      impactRing(scene, enemyX, enemyY, 0xe86898, 120);

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
            // Afterimage at this position
            const ghost = scene.add.circle(pos.x, pos.y - 20, 18, 0xe86898, 0.3);
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
