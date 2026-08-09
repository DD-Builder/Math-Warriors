/**
 * abilityFx — the visible half of abilities.js, progression.js and
 * rewardCadence.js. Four pools, four draw calls, nothing allocated per frame.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * A verb you cannot see is a bug report. Three of the four things this module
 * draws are not decoration:
 *
 *   the TELEGRAPH  is how a child knows the shove is aimed at THAT crate and
 *                  not the one behind it. Without it, aiming is guesswork and
 *                  a missed shove reads as a broken button.
 *   the TETHER     is how a levitated crate reads as HELD rather than stuck.
 *   the BURST      is the entire visible content of a level-up. progression.js
 *                  decides that one happened; if nothing draws it, the module
 *                  is an elaborate way of doing nothing — which is exactly the
 *                  failure this project keeps repeating.
 *   the TRAIL      is the coin run rewardCadence lays across the dead ring
 *                  road. Its whole job is to be visible from further away than
 *                  it is, which is why the coins are big, upright and gold.
 *
 * ── HOW IT STAYS INSIDE THE BUDGET ─────────────────────────────────────────
 * One InstancedMesh for every paper shard in flight (bursts AND the reward
 * flight share the pool, because they are the same object doing two jobs), one
 * for the coins, one ring, one tether quad. Four draw calls, ~2.2k triangles
 * at full tilt. No post-processing, no depth reads, no fwidth — the shards are
 * OPAQUE and SHRINK instead of fading, which is battle3d's trick and the
 * reason none of this needs sorting.
 *
 * The shard motion is battle3d's own burstPose/burstDir, imported rather than
 * re-derived: the papercut burst already exists and looks right, and a second
 * implementation would drift away from the first inside a month.
 *
 * ── COLOUR ─────────────────────────────────────────────────────────────────
 * Every colour arrives from PAPER through the caller. Nothing in here picks a
 * colour of its own except the coin (PAPER.gold) and the tether (the wizard's
 * lavender), and both come from the shared palette. No black, no grey; the
 * telegraph ring's dark half is inkTeal, which is the papercut law's stand-in
 * for ink.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { toonMaterial, applyPapercut } from './materials/toon.js';
import { burstPose } from './battle3d.js';

/** Ceiling on shards in flight. A full floor-complete uses ~48 of them. */
export const SHARD_CAP = 160;
/** Ceiling on visible trail coins. rewardCadence authors 31. */
export const COIN_CAP = 64;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _pose = { x: 0, y: 0, z: 0, spin: 0, scale: 1, alive: true };

/** A torn paper rectangle, 1 x 1, centred, facing +z. Two triangles. */
function shardGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.name = 'abl-shard';
  return g;
}

/** A coin: a squat 9-sided disc, standing up. Papercut, so it is a cut-out. */
function coinGeometry() {
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 9);
  g.rotateX(Math.PI / 2);
  g.name = 'abl-coin';
  return g;
}

/** The telegraph: a flat annulus laid on the ground under the target. */
function ringGeometry() {
  const g = new THREE.RingGeometry(0.62, 0.86, 28);
  g.rotateX(-Math.PI / 2);
  g.name = 'abl-ring';
  return g;
}

/**
 * Build the FX layer.
 *
 * @param {object} opts
 *   groundAt(x, z) -> y   so a coin and a ring sit ON the ground
 *   castShadow            coins cast; shards never do (160 shadow casters for
 *                         a 1 s effect is a shadow pass nobody asked for)
 */
export function createAbilityFx({ groundAt = null, castShadow = true } = {}) {
  const group = new THREE.Group();
  group.name = 'ability-fx';
  const geometries = [];
  const materials = [];

  // One material for the shards and the coins: instance colour carries the
  // difference, so two pools share one program and one paper surface.
  const mat = toonMaterial(0xffffff, { side: THREE.DoubleSide });
  applyPapercut(mat, { grain: 0.10, normal: 0.12, roughnessLike: 0.18, scale: 0.5, space: 'local', bleach: 0.20 });
  materials.push(mat);

  // ── Shards ──────────────────────────────────────────────────────────────
  const shardGeo = shardGeometry();
  geometries.push(shardGeo);
  const shards = new THREE.InstancedMesh(shardGeo, mat, SHARD_CAP);
  shards.name = 'abl-shards';
  shards.frustumCulled = false;
  shards.castShadow = false;
  shards.receiveShadow = false;
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < SHARD_CAP; i++) {
    shards.setMatrixAt(i, ZERO);
    shards.setColorAt(i, _c.set(PAPER.cream));
  }
  shards.instanceMatrix.needsUpdate = true;
  group.add(shards);

  /**
   * The pool. Two kinds share it:
   *   'burst'  ballistic paper out of a point (battle3d's burstPose)
   *   'fly'    a reward arcing from a world point to a screen-ish target
   * Every field is written on spawn and never allocated again.
   */
  const pool = [];
  for (let i = 0; i < SHARD_CAP; i++) {
    pool.push({
      live: false, kind: 'burst', t: 0, life: 1, i: 0, n: 1, power: 1,
      ox: 0, oy: 0, oz: 0, tx: 0, ty: 0, tz: 0, size: 0.18, delay: 0,
      r: 1, g: 1, b: 1, done: null,
    });
  }
  let cursor = 0;
  function take() {
    for (let k = 0; k < SHARD_CAP; k++) {
      const s = pool[cursor];
      cursor = (cursor + 1) % SHARD_CAP;
      if (!s.live) return s;
    }
    return null;          // saturated: drop it. A dropped shard is invisible;
                          // a grown pool is a frame hitch.
  }

  // ── Coins ───────────────────────────────────────────────────────────────
  const coinGeo = coinGeometry();
  geometries.push(coinGeo);
  const coins = new THREE.InstancedMesh(coinGeo, mat, COIN_CAP);
  coins.name = 'abl-coins';
  coins.castShadow = castShadow;
  coins.receiveShadow = true;
  coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < COIN_CAP; i++) {
    coins.setMatrixAt(i, ZERO);
    coins.setColorAt(i, _c.set(PAPER.gold));
  }
  coins.instanceMatrix.needsUpdate = true;
  group.add(coins);
  /** id -> slot, so a collected coin can be collapsed by name. */
  const coinSlot = new Map();
  const coinRec = [];
  let coinUsed = 0;

  // ── Telegraph ring ──────────────────────────────────────────────────────
  const ringGeo = ringGeometry();
  geometries.push(ringGeo);
  const ringMat = toonMaterial(PAPER.teal, { side: THREE.DoubleSide });
  materials.push(ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.name = 'abl-telegraph';
  ring.visible = false;
  ring.frustumCulled = false;
  group.add(ring);
  const ringState = { x: 0, y: 0, z: 0, t: 0, r: 1, on: false };

  // ── Carry tether ────────────────────────────────────────────────────────
  // A single paper ribbon between the wizard's hands and the held thing. Not
  // a line: a LINE is one pixel wide on a phone and vanishes. This is a quad
  // that is stretched and aimed each frame.
  const tetherGeo = new THREE.PlaneGeometry(1, 1);
  tetherGeo.translate(0, 0.5, 0);         // pivot at the bottom edge
  geometries.push(tetherGeo);
  const tetherMat = toonMaterial(PAPER.lavender, { side: THREE.DoubleSide });
  materials.push(tetherMat);
  const tether = new THREE.Mesh(tetherGeo, tetherMat);
  tether.name = 'abl-tether';
  tether.visible = false;
  tether.frustumCulled = false;
  group.add(tether);

  // ────────────────────────────────────────────────────────────────────────
  // Spawning
  // ────────────────────────────────────────────────────────────────────────

  /**
   * A papercut burst at a world point.
   *
   * @param {number} x @param {number} y @param {number} z
   * @param {{count?:number, power?:number, life?:number, tint?:number,
   *          size?:number}} [spec] — progression.MOMENT_STYLE.burst fits this
   *          shape exactly, which is the whole point.
   */
  function burst(x, y, z, spec = {}) {
    // `??` and not `||`: a count of 0 is a legal request for silence, and a
    // count of 0 falling back to 16 is a burst nobody asked for.
    const n = Math.min(SHARD_CAP, spec.count ?? 16);
    if (n <= 0) return 0;
    const life = spec.life ?? 1.0;
    const power = spec.power == null ? 1 : spec.power;
    const tint = spec.tint == null ? PAPER.cream : spec.tint;
    for (let i = 0; i < n; i++) {
      const s = take();
      if (!s) break;
      s.live = true;
      s.kind = 'burst';
      s.t = 0;
      s.life = life;
      s.i = i;
      s.n = n;
      s.power = power;
      s.ox = x; s.oy = y; s.oz = z;
      s.delay = 0;
      s.size = (spec.size ?? 0.17) + (i % 4) * 0.03;
      // Every third shard is cream, so a coloured burst still reads as PAPER
      // and not as a coloured light. battle3d does the same and for the same
      // reason: one hue is a particle system, two is a torn sheet.
      _c.set(i % 3 === 0 ? PAPER.cream : tint);
      s.r = _c.r; s.g = _c.g; s.b = _c.b;
      s.done = null;
    }
    return n;
  }

  /**
   * A reward flying from a world point to a target point.
   *
   * `flight` is progression.rewardFlight()'s output, unmodified: each entry
   * carries its own `at` delay, so the stagger authored there is the stagger
   * seen here and neither side has to know about the other's timing.
   *
   * @param {{x,y,z}} from
   * @param {{x,y,z}} to     where the HUD chip is, in world space. The host
   *                         gets this by unprojecting the chip; a good enough
   *                         stand-in is a point above and behind the camera.
   * @param {Array} flight
   * @param {(item)=>void} [onArrive] fires per reward as it lands
   */
  function flyRewards(from, to, flight, onArrive = null) {
    let n = 0;
    for (const item of flight) {
      const s = take();
      if (!s) break;
      s.live = true;
      s.kind = 'fly';
      s.t = 0;
      s.life = 0.85;
      s.delay = item.at || 0;
      s.ox = from.x; s.oy = from.y; s.oz = from.z;
      s.tx = to.x; s.ty = to.y; s.tz = to.z;
      s.size = item.kind === 'gold' ? 0.30 : 0.38;
      _c.set(item.tint || PAPER.gold);
      s.r = _c.r; s.g = _c.g; s.b = _c.b;
      s.done = onArrive ? () => onArrive(item) : null;
      n++;
    }
    return n;
  }

  /** Show the aim ring under a target, or hide it. Call every frame. */
  function aim(target, tint = PAPER.teal, radius = 1) {
    if (!target) { ringState.on = false; ring.visible = false; return; }
    ringState.on = true;
    ringState.x = target.x;
    ringState.z = target.z;
    ringState.y = groundAt ? groundAt(target.x, target.z) : (target.y || 0);
    ringState.r = radius;
    ringMat.color.set(tint);
    ring.visible = true;
  }

  /** Draw the carry ribbon between two world points, or hide it. */
  function setTether(from, to, tint = PAPER.lavender) {
    if (!from || !to) { tether.visible = false; return; }
    tetherMat.color.set(tint);
    tether.visible = true;
    _v.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _v.length() || 1e-4;
    tether.position.set(from.x, from.y, from.z);
    // Aim the quad's +y along the span.
    _q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, _v.divideScalar(len));
    tether.quaternion.copy(_q);
    tether.scale.set(0.10, len, 1);
  }

  // ── Coins ───────────────────────────────────────────────────────────────

  /** Place the trail coins. Call once, with rewardCadence's live coin list. */
  function setCoins(list) {
    coinSlot.clear();
    coinRec.length = 0;
    coinUsed = 0;
    for (const c of list || []) {
      if (coinUsed >= COIN_CAP) break;
      const slot = coinUsed++;
      const y = (groundAt ? groundAt(c.x, c.z) : 0) + 0.75;
      coinSlot.set(c.id, slot);
      coinRec.push({ id: c.id, x: c.x, y, z: c.z, phase: (slot * 0.7) % (Math.PI * 2) });
    }
    for (let i = coinUsed; i < COIN_CAP; i++) coins.setMatrixAt(i, ZERO);
    coins.instanceMatrix.needsUpdate = true;
  }

  /** A coin was walked over: pop it and collapse the instance. */
  function takeCoin(id) {
    const slot = coinSlot.get(id);
    if (slot == null) return false;
    const rec = coinRec[slot];
    if (rec) burst(rec.x, rec.y, rec.z, { count: 7, power: 0.5, life: 0.6, tint: PAPER.gold, size: 0.10 });
    coinSlot.delete(id);
    if (rec) rec.gone = true;
    coins.setMatrixAt(slot, ZERO);
    coins.instanceMatrix.needsUpdate = true;
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // The frame
  // ────────────────────────────────────────────────────────────────────────

  let clock = 0;

  /**
   * @param {number} dt seconds
   * @param {number} [camYaw] so shards face the lens. Paper has no thickness;
   *   a shard edge-on is a shard that vanished.
   */
  function update(dt, camYaw = 0) {
    clock += dt;

    // ── shards ──
    let dirty = false;
    for (let i = 0; i < SHARD_CAP; i++) {
      const s = pool[i];
      if (!s.live) continue;
      dirty = true;
      if (s.delay > 0) {
        s.delay -= dt;
        shards.setMatrixAt(i, ZERO);
        continue;
      }
      s.t += dt;
      if (s.kind === 'burst') {
        burstPose(s.i, s.n, s.t, s.life, s.power, _pose);
        if (!_pose.alive) { s.live = false; shards.setMatrixAt(i, ZERO); continue; }
        _v.set(s.ox + _pose.x, s.oy + _pose.y, s.oz + _pose.z);
        _e.set(_pose.spin * 0.6, camYaw, _pose.spin);
        _q.setFromEuler(_e);
        const sc = s.size * _pose.scale;
        _s.set(sc, sc, sc);
      } else {
        const u = Math.min(1, s.t / s.life);
        if (u >= 1) {
          s.live = false;
          shards.setMatrixAt(i, ZERO);
          if (s.done) { const f = s.done; s.done = null; f(); }
          continue;
        }
        // Ease-in: a reward that starts fast reads as a bullet. It should
        // hesitate, then go.
        const e = u * u * (3 - 2 * u);
        // ...and arc, because a straight line between two points is a laser.
        const lift = Math.sin(u * Math.PI) * 1.9;
        _v.set(
          s.ox + (s.tx - s.ox) * e,
          s.oy + (s.ty - s.oy) * e + lift,
          s.oz + (s.tz - s.oz) * e,
        );
        _e.set(0, camYaw, s.t * 9);
        _q.setFromEuler(_e);
        // Grows on the way out, shrinks into the chip.
        const sc = s.size * (0.5 + 0.9 * Math.sin(u * Math.PI));
        _s.set(sc, sc, sc);
      }
      _m.compose(_v, _q, _s);
      shards.setMatrixAt(i, _m);
      shards.setColorAt(i, _c.setRGB(s.r, s.g, s.b));
    }
    if (dirty) {
      shards.instanceMatrix.needsUpdate = true;
      if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
    }

    // ── the aim ring: a slow breathe, so it reads as live and not as decal ──
    if (ringState.on) {
      const pulse = 1 + Math.sin(clock * 6.5) * 0.06;
      ring.position.set(ringState.x, ringState.y + 0.05, ringState.z);
      const r = ringState.r * pulse;
      ring.scale.set(r, 1, r);
    }

    // ── the coins: bob and turn, so a gold disc on grass catches the eye ──
    if (coinUsed > 0) {
      for (let i = 0; i < coinUsed; i++) {
        const c = coinRec[i];
        if (!c || c.gone) continue;
        _v.set(c.x, c.y + Math.sin(clock * 2.2 + c.phase) * 0.10, c.z);
        _e.set(0, clock * 1.7 + c.phase, 0);
        _q.setFromEuler(_e);
        _s.set(1, 1, 1);
        _m.compose(_v, _q, _s);
        coins.setMatrixAt(i, _m);
      }
      coins.instanceMatrix.needsUpdate = true;
    }
  }

  /** Everything off. A context loss, a floor entry, a cinematic. */
  function reset() {
    for (const s of pool) { s.live = false; s.done = null; }
    for (let i = 0; i < SHARD_CAP; i++) shards.setMatrixAt(i, ZERO);
    shards.instanceMatrix.needsUpdate = true;
    ring.visible = false;
    ringState.on = false;
    tether.visible = false;
  }

  const stats = {
    drawCalls: 4,
    shardCap: SHARD_CAP,
    coinCap: COIN_CAP,
    get live() { return pool.reduce((a, s) => a + (s.live ? 1 : 0), 0); },
    get coins() { return coinSlot.size; },
  };

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.clear();
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    geometries.length = 0;
    materials.length = 0;
    coinSlot.clear();
    coinRec.length = 0;
  }

  return {
    group, stats,
    burst, flyRewards, aim, setTether, setCoins, takeCoin,
    update, reset, dispose,
  };
}

/**
 * ── WIRING NOTES ───────────────────────────────────────────────────────────
 * Do not wire this by hand — abilityWiring.js already does, and it is one
 * call. These notes exist so the next reader knows what it is doing.
 *
 *   scene.add(fx.group)            BEFORE applyAerialFogToTree(scene), so the
 *                                  paper picks up the same atmosphere as the
 *                                  rest of the world.
 *   fx.update(heroDt, camera.rotation.y)   in draw(), beside travFx.update
 *   fx.dispose()                   in dispose()
 *
 * Four draw calls, <= 2.2k triangles at full tilt, no post-processing, no
 * depth reads, no fwidth. The shard material is opaque and the shards SHRINK
 * rather than fade, so nothing here needs sorting and the screenshot harness
 * on SwiftShader renders it identically to a device.
 */
