/**
 * traversalFx — everything the traversal abilities LOOK like.
 *
 * traversal.js decides what happens; this decides what a child sees when it
 * does. Seven draw calls, all of them merged or instanced, nothing allocated
 * per frame, and every colour out of PAPER:
 *
 *   1. LANDMARKS (merged, static)  paper cairns at the foot of every named
 *      climb, a trail of chalk hand-holds up the face above each one, and a
 *      pole at every launch perch. This is the answer to "how does a child
 *      know that lump is a ladder": someone chalked it.
 *   2. WIND-SOCKS (instanced)      the flags on those poles, streaming.
 *   3. THERMAL RIBBONS (instanced) rising paper chevrons over every vent and
 *      every slab of warm rock, so lift is a thing you can SEE before you fly
 *      into it. A thermal you have to discover by accident is a bug.
 *   4. THE CANOPY (merged)         a three-ply papercut kite that unfolds over
 *      the hero when the glider opens and folds away on touchdown.
 *   5. POPS (instanced)            splash rings, landing dust, chalk puff on a
 *      grab. The one-shot `event` field on the traversal state drives these,
 *      so a replay reproduces every one of them.
 *   6. DECKS (instanced)           the rafts, lilies and paper boats, synced
 *      from the floatables sim.
 *   7. THE UNDERWATER VEIL         a teal wash with moving caustic bands, for
 *      when the head goes under.
 *
 * ── HOW THE CAUSTICS ARE LEGAL ─────────────────────────────────────────────
 * TECH LAW here forbids post-processing, depth-texture reads and fwidth. The
 * veil breaks none of them: it is one ordinary transparent quad drawn last
 * with depthTest off, and its shader is three summed sines of its own screen
 * position. It never reads the framebuffer, never reads depth, and takes no
 * derivatives — it is a painted gel held in front of the lens, which is
 * exactly what a papercut game should use anyway.
 *
 * Build-time allocation is free; update() allocates nothing.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { toonMaterial, paperColor } from './materials/toon.js';
import { applyAerialFog } from './materials/aerialFog.js';
import { sink, stamp, bake, trs, lin, shade } from './geobuild.js';
import { MODES, EVENTS } from './traversal.js';
import { WATER_Y } from './collision.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/** THE tuning table. Every number is a look, not a mechanic. */
export const FX = {
  // ── Chalk trail ──────────────────────────────────────────────────────────
  holdSpacing: 2.2,     // m of RISE between hand-holds. Close enough to read as
                        // a route from the bottom, sparse enough not to be a
                        // dotted line painted on a mountain.
  holdSize: 0.30,       // m
  holdProud: 0.22,      // m the chalk sits out from the rock, so it never
                        // z-fights with the terrain it is drawn on
  holdMax: 26,          // per route — caps the 47 m Palace face at a sane count
  cairnH: 1.5,          // m of stacked paper discs at the foot of a route
  // ── Launch perch ─────────────────────────────────────────────────────────
  poleH: 3.4,
  sockLen: 1.5,
  sockFlap: 2.1,        // rad/s of flutter
  // ── Thermals ─────────────────────────────────────────────────────────────
  ribbonsPer: 5,        // chevrons per column
  ribbonRise: 3.4,      // m/s they climb
  ribbonSize: 1.5,      // m
  ribbonSpin: 0.55,     // rad/s of lazy rotation, so a column reads as turning
  // ── Canopy ───────────────────────────────────────────────────────────────
  canopySpan: 2.9,      // m wide when fully open
  canopyLift: 1.85,     // m above the hero's feet
  canopyOpen: 7.0,      // 1/s of unfold — a snap, then a settle
  canopyBillow: 0.09,   // m of breathing in the sail
  canopyBillowHz: 2.3,
  canopyRoll: 0.55,     // rad of bank per unit of turn rate: the canopy leans
                        // into a turn even though the controller does not
  // ── Pops ─────────────────────────────────────────────────────────────────
  popCount: 20,         // ring buffer size. More than any frame can ever spend.
  popLife: 0.62,        // s
  popRise: 1.5,         // m/s
  // ── Veil ─────────────────────────────────────────────────────────────────
  veilFade: 4.5,        // 1/s in and out of the underwater wash
  veilAlpha: 0.46,      // how much teal at full submersion
  veilBands: 0.30,      // amplitude of the caustic banding
};

/** One-shot pops, by event. `null` means the event draws nothing. */
const POP_FOR = {
  [EVENTS.SPLASH]: { color: PAPER.tealL, size: 1.9, flat: true },
  [EVENTS.TOUCHDOWN]: { color: PAPER.cream, size: 1.5, flat: true },
  [EVENTS.GRAB]: { color: PAPER.white, size: 0.7, flat: false },
  [EVENTS.MANTLE]: { color: PAPER.cream, size: 0.9, flat: false },
  [EVENTS.RESCUE]: { color: PAPER.gold, size: 1.4, flat: false },
  [EVENTS.CANOPY]: { color: PAPER.gold, size: 1.6, flat: false },
  [EVENTS.AUTOCANOPY]: { color: PAPER.gold, size: 1.6, flat: false },
  [EVENTS.THERMAL]: { color: PAPER.orange, size: 1.8, flat: false },
  [EVENTS.SHORE]: { color: PAPER.tealL, size: 1.3, flat: true },
};

// ── Build helpers ─────────────────────────────────────────────────────────

/** A flat papercut disc lying in XZ (a chalk mark, a cairn ply, a ripple). */
function disc(r, segments = 9) {
  return new THREE.CircleGeometry(r, segments).rotateX(-Math.PI / 2);
}

/**
 * Walk a climb route's face and return the world points a chalk hand-hold
 * should sit at: every `holdSpacing` metres of RISE, pushed `holdProud` out of
 * the rock along the route's outward normal.
 *
 * Build-time only, and it is the reason the chalk lands on the real cliff
 * rather than on an artist's guess at where the cliff is.
 */
function chalkTrail(route, groundAt, out = []) {
  const dx = route.dir.x;
  const dz = route.dir.z;
  const baseY = groundAt(route.base.x, route.base.z);
  let next = baseY + FX.holdSpacing;
  // March into the face in small steps; the ground under the march IS the face.
  for (let s = 0.4; s < 90 && out.length < FX.holdMax; s += 0.28) {
    const x = route.base.x + dx * s;
    const z = route.base.z + dz * s;
    const y = groundAt(x, z);
    if (y < next) continue;
    out.push(x - dx * FX.holdProud, y + 0.05, z - dz * FX.holdProud);
    next = y + FX.holdSpacing;
    // The face has topped out if the ground stops climbing over a full stride.
    if (groundAt(x + dx * 2, z + dz * 2) < y + 0.3) break;
  }
  return out;
}

/**
 * Everything static: cairns, chalk, poles. One merged geometry, one draw call,
 * built once and never touched again.
 */
function buildLandmarks(routes, pads, groundAt) {
  const s = sink(false);
  const trail = [];

  for (const r of routes) {
    const rgb = lin(r.hold || PAPER.white);
    // The cairn: three discs of decreasing size, so the foot of a route reads
    // as "somebody stopped here" from a long way off.
    const by = groundAt(r.base.x, r.base.z);
    for (let i = 0; i < 3; i++) {
      const p = i / 2;
      stamp(s, disc(0.62 - p * 0.26, 10),
        trs(r.base.x, by + 0.12 + p * FX.cairnH * 0.5, r.base.z, 0, i * 0.7, 0),
        rgb, 1);
    }
    // A single upright ply behind the cairn: a silhouette, so the marker is
    // visible from the side as well as from above.
    stamp(s, new THREE.PlaneGeometry(0.5, FX.cairnH),
      trs(r.base.x, by + FX.cairnH * 0.5, r.base.z, 0, Math.atan2(r.dir.x, r.dir.z), 0),
      lin(r.hold || PAPER.white, 0.82), 1);

    trail.length = 0;
    chalkTrail(r, groundAt, trail);
    for (let i = 0; i < trail.length; i += 3) {
      // Alternate the marks left and right of the line, the way a real route
      // reads — a straight ladder of dots looks printed, not chalked.
      const side = (i / 3) % 2 === 0 ? 1 : -1;
      const ox = -r.dir.z * side * 0.34;
      const oz = r.dir.x * side * 0.34;
      stamp(s, disc(FX.holdSize, 7),
        trs(trail[i] + ox, trail[i + 1], trail[i + 2] + oz, 0, i * 0.31, 0),
        lin(PAPER.white, 0.98), 1);
    }
  }

  for (const p of pads) {
    const py = groundAt(p.x, p.z);
    stamp(s, new THREE.BoxGeometry(0.13, FX.poleH, 0.13),
      trs(p.x, py + FX.poleH * 0.5, p.z), lin(PAPER.sand), 1);
    // A little paper plinth, so a perch reads as built rather than as a stick.
    stamp(s, disc(0.85, 12), trs(p.x, py + 0.06, p.z), lin(PAPER.creamD), 1);
  }

  return bake(s);
}

// ── The module ────────────────────────────────────────────────────────────

/**
 * @param {{
 *   groundAt: (x:number,z:number)=>number,
 *   routes?: Array<object>, pads?: Array<object>, thermals?: Array<object>,
 *   floatables?: {items:Array<object>}|null,
 *   quality?: 'low'|'high',
 * }} opts
 * @returns {{group: THREE.Group, veil: THREE.Mesh, update: Function,
 *            onEvent: Function, dispose: Function}}
 */
export function createTraversalFx(opts = {}) {
  const groundAt = opts.groundAt || (() => 0);
  const routes = opts.routes || [];
  const pads = opts.pads || [];
  const thermals = opts.thermals || [];
  const floats = opts.floatables || null;
  const lowQ = opts.quality === 'low';

  const group = new THREE.Group();
  group.name = 'traversalFx';
  /** Everything that must be disposed, collected as it is made. */
  const owned = [];
  const keep = (o) => { owned.push(o); return o; };

  // ── 1. Landmarks ────────────────────────────────────────────────────────
  const landGeo = keep(buildLandmarks(routes, pads, groundAt));
  const landMat = keep(toonMaterial(0xffffff, { vertexColors: true }));
  const landMesh = new THREE.Mesh(landGeo, landMat);
  landMesh.castShadow = false;
  landMesh.receiveShadow = false;
  landMesh.frustumCulled = false; // one mesh spanning the island: culling it is
                                  // an all-or-nothing decision and "nothing" is
                                  // a bug the player sees as vanished chalk
  group.add(landMesh);

  // ── 2. Wind-socks ───────────────────────────────────────────────────────
  const sockGeo = keep(new THREE.PlaneGeometry(FX.sockLen, 0.44));
  // Anchor the plane at its left edge so a rotation swings the free end.
  sockGeo.translate(FX.sockLen * 0.5, 0, 0);
  const sockMat = keep(toonMaterial(PAPER.coral, { side: THREE.DoubleSide }));
  const socks = new THREE.InstancedMesh(sockGeo, sockMat, Math.max(1, pads.length));
  socks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  socks.count = pads.length;
  socks.frustumCulled = false;
  group.add(socks);
  const sockBase = pads.map((p) => ({ x: p.x, y: groundAt(p.x, p.z) + FX.poleH - 0.3, z: p.z }));

  // ── 3. Thermal ribbons ──────────────────────────────────────────────────
  const perColumn = lowQ ? 3 : FX.ribbonsPer;
  const ribCount = Math.max(1, thermals.length * perColumn);
  const ribGeo = keep(new THREE.PlaneGeometry(FX.ribbonSize, FX.ribbonSize * 0.42));
  const ribMat = keep(toonMaterial(PAPER.peach, {
    side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  const ribbons = new THREE.InstancedMesh(ribGeo, ribMat, ribCount);
  ribbons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ribbons.count = thermals.length * perColumn;
  ribbons.frustumCulled = false;
  group.add(ribbons);
  // Flat per-ribbon constants, so update() reads arrays and not object graphs.
  const ribCol = new Float32Array(ribbons.count * 5); // x, z, baseY, rise, phase
  for (let i = 0; i < thermals.length; i++) {
    const t = thermals[i];
    const gy = groundAt(t.x, t.z);
    for (let k = 0; k < perColumn; k++) {
      const idx = (i * perColumn + k) * 5;
      const a = (k / perColumn) * TAU;
      ribCol[idx] = t.x + Math.cos(a) * t.r * 0.45;
      ribCol[idx + 1] = t.z + Math.sin(a) * t.r * 0.45;
      ribCol[idx + 2] = Math.max(WATER_Y, gy) + 0.5;
      ribCol[idx + 3] = t.rise;
      ribCol[idx + 4] = (k / perColumn) + i * 0.137;
    }
  }

  // ── 4. The canopy ───────────────────────────────────────────────────────
  // Three plies of one kite: a wide pale sail, a coral under-ply peeking below
  // it, and a gold spine. Merged, so the whole glider is one draw call.
  const canopyGeo = keep((() => {
    const s = sink(false);
    const w = FX.canopySpan;
    stamp(s, new THREE.PlaneGeometry(w, w * 0.42).rotateX(-Math.PI / 2),
      trs(0, 0.10, 0), lin(PAPER.cream), 1);
    stamp(s, new THREE.PlaneGeometry(w * 0.78, w * 0.34).rotateX(-Math.PI / 2),
      trs(0, 0.02, 0.06), lin(PAPER.coral), 1);
    stamp(s, new THREE.BoxGeometry(w * 0.96, 0.06, 0.09), trs(0, 0.16, 0), lin(PAPER.gold), 1);
    // Two risers down to the hero's shoulders: without them the sail floats.
    for (const sx of [-1, 1]) {
      stamp(s, new THREE.BoxGeometry(0.05, 0.9, 0.05),
        trs(sx * w * 0.34, -0.44, 0, 0, 0, sx * 0.22), lin(PAPER.sand), 1);
    }
    return bake(s);
  })());
  const canopyMat = keep(toonMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.visible = false;
  canopy.frustumCulled = false;
  group.add(canopy);
  let canopyOpen = 0;   // 0..1 unfold
  let canopyRoll = 0;
  let lastYaw = 0;

  // ── 5. Pops ─────────────────────────────────────────────────────────────
  const popGeo = keep(disc(1, 12));
  const popMat = keep(toonMaterial(0xffffff, {
    transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
  }));
  const pops = new THREE.InstancedMesh(popGeo, popMat, FX.popCount);
  pops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pops.frustumCulled = false;
  pops.count = FX.popCount;
  group.add(pops);
  // x, y, z, size, life, flat — one flat row per slot, written by onEvent().
  const popData = new Float32Array(FX.popCount * 6);
  const popColor = new THREE.Color();
  let popHead = 0;

  // ── 6. Floating decks ───────────────────────────────────────────────────
  const deckItems = floats?.items || [];
  const deckGeo = keep(disc(1, 14));
  const deckMat = keep(toonMaterial(0xffffff, { vertexColors: false }));
  const decks = new THREE.InstancedMesh(deckGeo, deckMat, Math.max(1, deckItems.length));
  decks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  decks.count = deckItems.length;
  decks.frustumCulled = false;
  if (deckItems.length) {
    const c = new THREE.Color();
    for (let i = 0; i < deckItems.length; i++) {
      const kind = deckItems[i].kind;
      c.setHex(kind === 'lily' ? PAPER.leaf : kind === 'boat' ? PAPER.cream : PAPER.sand,
        THREE.SRGBColorSpace);
      decks.setColorAt(i, c);
    }
    if (decks.instanceColor) decks.instanceColor.needsUpdate = true;
  }
  group.add(decks);

  // ── 7. The underwater veil ──────────────────────────────────────────────
  //
  // A screen-filling quad emitted straight into clip space by the vertex
  // shader — no camera matrices, so it cannot be knocked out of alignment by
  // the follow boom, and no attachment to the camera object for index.js to
  // remember to make. Drawn last, depth off, additive-free plain alpha.
  const veilMat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(PAPER.tealL) },
      uDeep: { value: new THREE.Color(PAPER.tealD) },
      uBands: { value: FX.veilBands },
      uAlpha: { value: FX.veilAlpha },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // position is already a [-1,1] quad: straight to clip space.
        gl_Position = vec4( position.xy, 0.0, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float uAmount;
      uniform float uTime;
      uniform float uBands;
      uniform float uAlpha;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      varying vec2 vUv;

      void main() {
        if ( uAmount <= 0.001 ) discard;

        // Three summed sines at incommensurate angles: the classic cheap
        // caustic. No texture, no derivatives, no framebuffer read — the whole
        // effect is a function of this fragment's own screen position.
        vec2 p = vUv * 9.0;
        float c =
            sin( p.x * 1.00 + p.y * 0.62 + uTime * 1.35 )
          + sin( p.x * 0.61 - p.y * 1.13 - uTime * 0.92 )
          + sin( p.x * 1.47 + p.y * 1.71 + uTime * 0.61 );
        c = c * 0.3333;                       // -> about [-1, 1]
        float caustic = 0.5 + 0.5 * c;
        caustic = caustic * caustic;          // pinch the bright lines thinner

        // Darker toward the edges of the frame: being under water is being
        // inside something, and a flat wash reads as a colour-grade bug.
        vec2 d = vUv - 0.5;
        float vign = 1.0 - 0.85 * dot( d, d );

        vec3 col = mix( uDeep, uShallow, caustic );
        float a = uAlpha * uAmount * ( 1.0 - uBands + uBands * caustic ) * vign;
        gl_FragColor = vec4( col, a );
      }
    `,
  }));
  const veilGeo = keep(new THREE.PlaneGeometry(2, 2));
  const veil = new THREE.Mesh(veilGeo, veilMat);
  veil.frustumCulled = false;
  veil.renderOrder = 10000;
  veil.visible = false;
  group.add(veil);
  let veilAmount = 0;

  // ── Scratch ─────────────────────────────────────────────────────────────
  // One matrix, one quaternion, one euler, two vectors, forever.
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function setInstance(mesh, i, px, py, pz, rx, ry, rz, sx, sy, sz) {
    _p.set(px, py, pz);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }

  /** Park an instance out of sight without shrinking it to a degenerate zero. */
  function hideInstance(mesh, i) {
    setInstance(mesh, i, 0, -9999, 0, 0, 0, 0, 0.001, 0.001, 0.001);
  }

  // ── Events ──────────────────────────────────────────────────────────────

  /**
   * Fire the one-shot for a traversal `event`. Called by the host with the
   * state that carried it, so the pop lands where the thing happened.
   */
  function onEvent(name, state) {
    const spec = POP_FOR[name];
    if (!spec || !state?.pos) return;
    const i = popHead;
    popHead = (popHead + 1) % FX.popCount;
    const o = i * 6;
    popData[o] = state.pos.x;
    popData[o + 1] = spec.flat && name !== EVENTS.GRAB ? WATER_Y + 0.05 : state.pos.y + 0.3;
    if (name === EVENTS.TOUCHDOWN) popData[o + 1] = state.pos.y + 0.05;
    popData[o + 2] = state.pos.z;
    popData[o + 3] = spec.size;
    popData[o + 4] = FX.popLife;
    popData[o + 5] = spec.flat ? 1 : 0;
    popColor.setHex(spec.color, THREE.SRGBColorSpace);
    pops.setColorAt(i, popColor);
    if (pops.instanceColor) pops.instanceColor.needsUpdate = true;
  }

  // ── Frame ───────────────────────────────────────────────────────────────

  /**
   * @param {number} dt   seconds (0 freezes everything, for a frozen pose)
   * @param {object} state the live traversal state
   * @param {number} simT the animation clock (the pose harness pins this)
   */
  function update(dt, state, simT) {
    const d = clamp(dt || 0, 0, 0.05);
    const t = simT || 0;

    // ── Wind-socks ──
    for (let i = 0; i < sockBase.length; i++) {
      const b = sockBase[i];
      const flap = Math.sin(t * FX.sockFlap + i * 1.7);
      setInstance(socks, i, b.x, b.y, b.z,
        flap * 0.22, t * 0.13 + i, 0.18 + flap * 0.12, 1, 1, 1);
    }
    if (sockBase.length) socks.instanceMatrix.needsUpdate = true;

    // ── Thermal ribbons ──
    for (let i = 0; i < ribbons.count; i++) {
      const o = i * 5;
      const rise = ribCol[o + 3];
      // Loop each chevron up its column on its own offset phase.
      const p = ((t * FX.ribbonRise / rise) + ribCol[o + 4]) % 1;
      const y = ribCol[o + 2] + p * rise;
      // Fade in at the bottom, out at the top, via scale — no per-instance
      // alpha attribute needed, and a shrinking chevron reads as "going away".
      const fade = Math.sin(p * Math.PI);
      setInstance(ribbons, i, ribCol[o], y, ribCol[o + 1],
        -Math.PI / 2 + 0.5, t * FX.ribbonSpin + i, 0,
        fade, fade, fade);
    }
    ribbons.instanceMatrix.needsUpdate = true;

    // ── The canopy ──
    const gliding = state?.mode === MODES.GLIDE;
    canopyOpen += ((gliding ? 1 : 0) - canopyOpen) * Math.min(1, FX.canopyOpen * d);
    if (canopyOpen > 0.01) {
      canopy.visible = true;
      const yaw = state?.yaw || 0;
      let dy = yaw - lastYaw;
      if (dy > Math.PI) dy -= TAU; else if (dy < -Math.PI) dy += TAU;
      lastYaw = yaw;
      const turn = d > 1e-6 ? dy / d : 0;
      canopyRoll += (clamp(turn * 0.22, -1, 1) * FX.canopyRoll - canopyRoll)
        * Math.min(1, 6 * d);
      const billow = Math.sin(t * FX.canopyBillowHz * TAU) * FX.canopyBillow * canopyOpen;
      const px = state?.pos?.x || 0;
      const py = (state?.pos?.y || 0) + FX.canopyLift + billow;
      const pz = state?.pos?.z || 0;
      canopy.position.set(px, py, pz);
      canopy.rotation.set(-0.12 * canopyOpen, yaw, canopyRoll);
      // Unfold sideways first, then deepen: a sail catching, not a balloon.
      canopy.scale.set(canopyOpen, 0.35 + 0.65 * canopyOpen, 0.4 + 0.6 * canopyOpen);
    } else {
      canopy.visible = false;
      canopyRoll = 0;
    }

    // ── Pops ──
    for (let i = 0; i < FX.popCount; i++) {
      const o = i * 6;
      const life = popData[o + 4];
      if (life <= 0) { hideInstance(pops, i); continue; }
      const nl = life - d;
      popData[o + 4] = nl > 0 ? nl : 0;
      const age = 1 - clamp(nl / FX.popLife, 0, 1);
      const flat = popData[o + 5] > 0.5;
      // A flat pop is a ripple: it spreads and stays put. A round one is a
      // puff: it rises and shrinks.
      const size = popData[o + 3] * (flat ? 0.4 + age * 1.7 : (1 - age * 0.55));
      const fade = 1 - age;
      const y = popData[o + 1] + (flat ? 0 : age * FX.popRise);
      setInstance(pops, i, popData[o], y, popData[o + 2],
        flat ? 0 : -Math.PI / 2 + 0.4, age * 1.4, 0,
        size * fade, size * fade, size * fade);
    }
    pops.instanceMatrix.needsUpdate = true;

    // ── Decks ──
    for (let i = 0; i < deckItems.length; i++) {
      const it = deckItems[i];
      setInstance(decks, i, it.x, it.deckY, it.z, it.tilt, i * 0.9, it.tilt * 0.7,
        it.r, 1, it.r);
    }
    if (deckItems.length) decks.instanceMatrix.needsUpdate = true;

    // ── The veil ──
    const under = state?.mode === MODES.SWIM ? clamp((state.dive || 0) / 0.9, 0, 1) : 0;
    veilAmount += (under - veilAmount) * Math.min(1, FX.veilFade * d);
    if (veilAmount < 0.004) {
      veil.visible = false;
    } else {
      veil.visible = true;
      veilMat.uniforms.uAmount.value = veilAmount;
      veilMat.uniforms.uTime.value = t;
    }
  }

  function dispose() {
    group.removeFromParent();
    group.clear();
    for (const o of owned) o.dispose?.();
    owned.length = 0;
    socks.dispose();
    ribbons.dispose();
    pops.dispose();
    decks.dispose();
  }

  return {
    group,
    veil,
    canopy,
    update,
    onEvent,
    dispose,
    /** Draw-call budget check, for the perf harness. */
    get drawCalls() { return 7; },
  };
}

/**
 * Sweep the aerial-perspective fog onto anything in this group that was not
 * born from toonMaterial. The veil is DELIBERATELY skipped — a gel held in
 * front of the lens is not in the world, so fogging it would tint the tint.
 */
export function applyFogToTraversalFx(fx) {
  fx?.group?.traverse?.((o) => {
    if (o === fx.veil) return;
    const m = o.material;
    if (m && !m.isShaderMaterial) applyAerialFog(m);
  });
}

/** Exposed for the style contract test: every colour this module can draw. */
export function fxPalette() {
  return [
    PAPER.white, PAPER.cream, PAPER.creamD, PAPER.sand, PAPER.coral,
    PAPER.gold, PAPER.peach, PAPER.orange, PAPER.leaf, PAPER.tealL, PAPER.tealD,
    PAPER.lavender, PAPER.lavenderD, PAPER.rose,
  ];
}

// Re-exported so a consumer can build a colour without importing three here.
export { paperColor, shade };
