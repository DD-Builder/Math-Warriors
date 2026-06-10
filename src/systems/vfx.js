/**
 * VFX template framework for attack animations and effects.
 *
 * Replaces hand-rolled particle loops with reusable, composable templates.
 * Every VFX object auto-destroys and is tracked for scene-shutdown cleanup.
 */

// ──────────────────────────────────────────────────────────────
// TEMPLATE DEFINITIONS
// ──────────────────────────────────────────────────────────────

export const VFX_TEMPLATES = {
  sparkBurst: {
    count: 24,
    colors: [0xfff8c0, 0xf0d040],
    minSize: 3, maxSize: 6,
    minDist: 20, maxDist: 45,
    duration: 400, durationSpread: 200,
    gravity: 0, fadeScale: 0.2,
    ease: 'Cubic.out', depth: 20,
  },
  impactRing: {
    startRadius: 5, endRadius: 60,
    strokeWidth: 3, color: 0xffffff,
    alpha: 0.7, duration: 280,
    ease: 'Cubic.out', depth: 20,
  },
  slashArc: {
    lineWidth: 5, color: 0xf0e8c0, alpha: 0.9,
    duration: 280, arcSpread: 80,
    depth: 20,
  },
  screenFlash: {
    color: 0xffffff, alpha: 0.35,
    duration: 180, ease: 'Quad.out',
    depth: 100,
  },
  beamTrail: {
    particleCount: 40, width: 20,
    color: 0x88ccff, trailColor: 0x4488cc,
    speed: 800, duration: 400,
    spread: 30, depth: 19,
  },
  elementalBurst: {
    count: 36,
    colors: [0x88ccff, 0xffffff],
    minSize: 3, maxSize: 7,
    minDist: 30, maxDist: 70,
    duration: 500, durationSpread: 200,
    gravity: 0, fadeScale: 0.15,
    ease: 'Cubic.out', depth: 20,
  },
  groundCrack: {
    lineCount: 4, length: 60,
    color: 0xf0d040, alpha: 0.7,
    lineWidth: 3, duration: 400,
    depth: 19,
  },
  projectile: {
    size: 8, color: 0xffffff,
    trailCount: 6, trailSpacing: 4,
    speed: 600, depth: 21,
  },
  shockwave: {
    startRadius: 10, endRadius: 120,
    strokeWidth: 4, color: 0xffffff,
    alpha: 0.5, duration: 350,
    ease: 'Quad.out', depth: 20,
  },
  hitStop: {
    duration: 50,
  },
};

// ──────────────────────────────────────────────────────────────
// TRACKING / CLEANUP
// ──────────────────────────────────────────────────────────────

const _sceneTrackers = new WeakMap();

function getTracker(scene) {
  if (!_sceneTrackers.has(scene)) {
    const objs = new Set();
    _sceneTrackers.set(scene, objs);
    scene.events.once('shutdown', () => {
      objs.forEach(o => { if (o && o.destroy) o.destroy(); });
      objs.clear();
      _sceneTrackers.delete(scene);
    });
  }
  return _sceneTrackers.get(scene);
}

function track(scene, obj) {
  getTracker(scene).add(obj);
  return obj;
}

function untrack(scene, obj) {
  const t = _sceneTrackers.get(scene);
  if (t) t.delete(obj);
}

function trackDestroy(scene, obj) {
  untrack(scene, obj);
  if (obj && obj.destroy) obj.destroy();
}

// ──────────────────────────────────────────────────────────────
// PLAY FUNCTIONS
// ──────────────────────────────────────────────────────────────

export function playSparkBurst(scene, x, y, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.sparkBurst, ...overrides };
  for (let i = 0; i < cfg.count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = cfg.minDist + Math.random() * (cfg.maxDist - cfg.minDist);
    const size = cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize);
    const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    const sp = scene.add.circle(x, y, size, color);
    sp.setDepth(cfg.depth);
    track(scene, sp);
    const tx = x + Math.cos(angle) * dist;
    let ty = y + Math.sin(angle) * dist;
    if (cfg.gravity) ty += cfg.gravity;
    scene.tweens.add({
      targets: sp, x: tx, y: ty,
      alpha: 0, scale: cfg.fadeScale,
      duration: cfg.duration + Math.random() * cfg.durationSpread,
      ease: cfg.ease,
      onComplete: () => trackDestroy(scene, sp),
    });
  }
}

export function playImpactRing(scene, x, y, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.impactRing, ...overrides };
  const ring = scene.add.circle(x, y, cfg.startRadius, cfg.color, 0);
  ring.setStrokeStyle(cfg.strokeWidth, cfg.color, cfg.alpha);
  ring.setDepth(cfg.depth);
  track(scene, ring);
  scene.tweens.add({
    targets: ring, radius: cfg.endRadius, alpha: 0,
    duration: cfg.duration, ease: cfg.ease,
    onComplete: () => trackDestroy(scene, ring),
  });
  return ring;
}

export function playSlashArc(scene, x, y, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.slashArc, ...overrides };
  const slash = scene.add.graphics();
  slash.setDepth(cfg.depth);
  track(scene, slash);
  slash.lineStyle(cfg.lineWidth, cfg.color, cfg.alpha);
  slash.beginPath();
  const spread = cfg.arcSpread;
  const startX = x - spread * 0.5, startY = y - spread * 0.6;
  slash.moveTo(startX, startY);
  const cp1x = x + spread * 0.35, cp1y = y - spread * 0.35;
  const cp2x = x + spread * 0.25, cp2y = y + spread * 0.5;
  const endX = x - spread * 0.35, endY = y + spread * 0.6;
  for (let t = 1; t <= 12; t++) {
    const p = t / 12, ip = 1 - p;
    slash.lineTo(
      ip * ip * ip * startX + 3 * ip * ip * p * cp1x + 3 * ip * p * p * cp2x + p * p * p * endX,
      ip * ip * ip * startY + 3 * ip * ip * p * cp1y + 3 * ip * p * p * cp2y + p * p * p * endY
    );
  }
  slash.strokePath();
  scene.tweens.add({
    targets: slash, alpha: 0,
    duration: cfg.duration, ease: 'Quad.out',
    onComplete: () => trackDestroy(scene, slash),
  });
  return slash;
}

export function playScreenFlash(scene, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.screenFlash, ...overrides };
  const w = scene.cameras.main.width;
  const h = scene.cameras.main.height;
  const flash = scene.add.rectangle(w / 2, h / 2, w, h, cfg.color, cfg.alpha);
  flash.setDepth(cfg.depth);
  flash.setScrollFactor(0);
  track(scene, flash);
  scene.tweens.add({
    targets: flash, alpha: 0,
    duration: cfg.duration, ease: cfg.ease,
    onComplete: () => trackDestroy(scene, flash),
  });
  return flash;
}

export function playBeamTrail(scene, fromX, fromY, toX, toY, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.beamTrail, ...overrides };
  const dx = toX - fromX, dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  const nx = dx / dist, ny = dy / dist;
  const perpX = -ny, perpY = nx;

  for (let i = 0; i < cfg.particleCount; i++) {
    const t = i / cfg.particleCount;
    const px = fromX + dx * t + (Math.random() - 0.5) * cfg.spread * perpX;
    const py = fromY + dy * t + (Math.random() - 0.5) * cfg.spread * perpY;
    const size = 2 + Math.random() * 4;
    const color = Math.random() > 0.4 ? cfg.color : cfg.trailColor;
    const p = scene.add.circle(px, py, size, color, 0.8);
    p.setDepth(cfg.depth);
    track(scene, p);
    scene.tweens.add({
      targets: p,
      x: px + nx * 20, y: py + ny * 20,
      alpha: 0, scale: 0.2,
      duration: cfg.duration * (0.5 + Math.random() * 0.5),
      delay: t * cfg.duration * 0.3,
      ease: 'Cubic.out',
      onComplete: () => trackDestroy(scene, p),
    });
  }
}

export function playElementalBurst(scene, x, y, overrides = {}) {
  playSparkBurst(scene, x, y, { ...VFX_TEMPLATES.elementalBurst, ...overrides });
}

export function playGroundCrack(scene, x, y, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.groundCrack, ...overrides };
  for (let i = 0; i < cfg.lineCount; i++) {
    const angle = (i / cfg.lineCount) * Math.PI * 2 + Math.random() * 0.5;
    const gfx = scene.add.graphics();
    gfx.setDepth(cfg.depth);
    track(scene, gfx);
    gfx.lineStyle(cfg.lineWidth, cfg.color, cfg.alpha);
    gfx.beginPath();
    gfx.moveTo(x, y);
    let cx = x, cy = y;
    const segs = 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < segs; s++) {
      const segLen = cfg.length / segs;
      cx += Math.cos(angle + (Math.random() - 0.5) * 0.8) * segLen;
      cy += Math.sin(angle + (Math.random() - 0.5) * 0.8) * segLen;
      gfx.lineTo(cx, cy);
    }
    gfx.strokePath();
    scene.tweens.add({
      targets: gfx, alpha: 0,
      duration: cfg.duration, delay: 100,
      ease: 'Quad.in',
      onComplete: () => trackDestroy(scene, gfx),
    });
  }
}

export function playProjectile(scene, fromX, fromY, toX, toY, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.projectile, ...overrides };
  const dx = toX - fromX, dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  const duration = (dist / cfg.speed) * 1000;

  const proj = scene.add.circle(fromX, fromY, cfg.size, cfg.color);
  proj.setDepth(cfg.depth);
  track(scene, proj);

  const trail = [];
  const trailInterval = scene.time.addEvent({
    delay: 20,
    repeat: -1,
    callback: () => {
      const t = scene.add.circle(proj.x, proj.y, cfg.size * 0.5, cfg.color, 0.4);
      t.setDepth(cfg.depth - 1);
      track(scene, t);
      trail.push(t);
      scene.tweens.add({
        targets: t, alpha: 0, scale: 0.1,
        duration: 200,
        onComplete: () => trackDestroy(scene, t),
      });
      if (trail.length > cfg.trailCount * 3) {
        const old = trail.shift();
        trackDestroy(scene, old);
      }
    },
  });

  return new Promise(resolve => {
    scene.tweens.add({
      targets: proj, x: toX, y: toY,
      duration,
      ease: 'Quad.in',
      onComplete: () => {
        trailInterval.remove(false);
        trackDestroy(scene, proj);
        trail.forEach(t => trackDestroy(scene, t));
        resolve({ x: toX, y: toY });
      },
    });
  });
}

export function playShockwave(scene, x, y, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.shockwave, ...overrides };
  const ring = scene.add.circle(x, y, cfg.startRadius, cfg.color, 0);
  ring.setStrokeStyle(cfg.strokeWidth, cfg.color, cfg.alpha);
  ring.setDepth(cfg.depth);
  track(scene, ring);
  scene.tweens.add({
    targets: ring, radius: cfg.endRadius, alpha: 0,
    duration: cfg.duration, ease: cfg.ease,
    onComplete: () => trackDestroy(scene, ring),
  });
  return ring;
}

export function playHitStop(scene, target, overrides = {}) {
  const cfg = { ...VFX_TEMPLATES.hitStop, ...overrides };
  const body = target.body || target;
  if (body && body.setTint) body.setTint(0xffffff);
  return new Promise(resolve => {
    scene.time.delayedCall(cfg.duration, () => {
      if (body && body.clearTint) body.clearTint();
      resolve();
    });
  });
}

// ──────────────────────────────────────────────────────────────
// COMPOSER — sequence multiple VFX with relative timing
// ──────────────────────────────────────────────────────────────

/**
 * Compose a sequence of VFX calls with delays.
 *
 * steps: [{ fn, args, delay (ms from start) }]
 * Returns a Promise that resolves when all steps complete.
 */
export function composeVFX(scene, steps) {
  return new Promise(resolve => {
    let remaining = steps.length;
    if (remaining === 0) { resolve(); return; }
    const done = () => { remaining--; if (remaining <= 0) resolve(); };
    steps.forEach(step => {
      scene.time.delayedCall(step.delay || 0, () => {
        const result = step.fn(scene, ...step.args);
        if (result && typeof result.then === 'function') {
          result.then(done);
        } else {
          done();
        }
      });
    });
  });
}

/**
 * Convenience: play VFX by template name string.
 */
const PLAY_FNS = {
  sparkBurst: playSparkBurst,
  impactRing: playImpactRing,
  slashArc: playSlashArc,
  screenFlash: playScreenFlash,
  beamTrail: playBeamTrail,
  elementalBurst: playElementalBurst,
  groundCrack: playGroundCrack,
  projectile: playProjectile,
  shockwave: playShockwave,
  hitStop: playHitStop,
};

export function playVFX(scene, templateName, x, y, overrides = {}) {
  const fn = PLAY_FNS[templateName];
  if (!fn) return;
  return fn(scene, x, y, overrides);
}
