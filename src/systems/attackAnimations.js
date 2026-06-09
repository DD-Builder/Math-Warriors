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
