/**
 * Ground-level atmosphere: rain streaks, rain ripples, and fireflies.
 *
 * Three effects, three draw calls, and not a single per-frame CPU write to a
 * vertex buffer. Everything that moves — a raindrop falling, a ripple ring
 * expanding, a firefly drifting and blinking — is a closed-form function of
 * `uTime` and a per-instance seed, evaluated in the vertex shader. The CPU's
 * only job is to re-anchor the scatter when the player walks out of it.
 *
 * ── WHY InstancedBufferGeometry instead of InstancedMesh ───────────────────
 * InstancedMesh carries a 16-float matrix per instance and expects the CPU to
 * own it. None of these effects has a meaningful per-instance TRANSFORM: rain
 * and fireflies are camera-facing billboards whose orientation is derived in
 * view space, and ripples are flat discs whose only transform is a scalar
 * radius. A vec3 anchor plus a vec2/vec3 seed is 5-6 floats instead of 16, and
 * it removes the temptation to rewrite matrices every frame. Same GPU path —
 * three renders an InstancedBufferGeometry on a plain Mesh with drawArrays
 * instanced, exactly as it does for InstancedMesh.
 *
 * ── WHY billboarding happens in VIEW space, by hand ────────────────────────
 * A rain streak must stay aligned with the direction it is falling (including
 * the wind slant) while still facing the camera. Projecting the fall vector
 * into view space and expanding the quad along its 2D screen direction does
 * both in four instructions, with no per-instance quaternion and no CPU work.
 * Fireflies use the degenerate case of the same trick (expand along the view
 * axes) so they are always perfect round dots.
 *
 * ── WHY the scatter is anchored to a SNAPPED grid ─────────────────────────
 * Ripples and fireflies need real terrain heights, so their positions cost
 * heightfield samples. Re-scattering them around a position snapped to a
 * coarse lattice means (a) the cost is paid once per several metres of walking
 * instead of every frame, and (b) the same player position always produces the
 * same scatter — which is what makes a rain or night screenshot reproducible
 * on SwiftShader and on an iPad.
 *
 * ── WHY density is culled in the shader, not by shrinking `count` ──────────
 * Rain intensity blends continuously (see weather.js). Instances whose seed
 * falls above the current amount push their vertices outside the clip volume,
 * which the rasteriser discards before any fragment work. That keeps the
 * geometry static and lets a fade in/out cost nothing but a uniform write.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth-texture
 * reads, no fwidth/derivatives, every colour from PAPER, zero per-frame
 * allocation, dispose() releases everything.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { WORLD } from './worldSpec.js';

// Rain volume around the eye. Bigger buys nothing: fog and the streak fade
// swallow anything further out.
const RAIN_COUNT = 1900;
const RAIN_RADIUS = 22;
const RAIN_HEIGHT = 26;
// The rain field is world-anchored except for this snap, which keeps it
// centred on the player without the whole volume sliding with the camera.
const RAIN_SNAP = 5;

const RIPPLE_COUNT = 210;
const RIPPLE_SPREAD = 17;
const RIPPLE_MAX_R = 0.42;

const FIREFLY_COUNT = 140;
const FIREFLY_SPREAD = 20;

// Re-scatter the ground-anchored effects when the player leaves this radius.
const ANCHOR_CELL = 6;

const ORDER_RIPPLE = 2;
const ORDER_RAIN = 6;
const ORDER_FIREFLY = 7;

const _c = new THREE.Color();

/** Deterministic PRNG — same scatter on every device, every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Rain ────────────────────────────────────────────────────────────────

const RAIN_VERT = /* glsl */`
  attribute vec3 aCell;   // xz: offset in the volume, y: fall-phase seed
  attribute vec2 aSeed;   // x: speed variance, y: density cull key
  uniform vec3 uOrigin;
  uniform vec3 uFall;     // unit, points DOWN plus the wind slant
  uniform float uTime;
  uniform float uSpeed;
  uniform float uHeight;
  uniform float uLen;
  uniform float uWidth;
  uniform float uAmount;
  uniform float uRadius;
  varying vec2 vRainUv;
  varying float vRainFade;

  void main() {
    if (aSeed.y > uAmount) {
      // Outside the clip volume: discarded before any fragment work.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float travel = mod(aCell.y + uTime * uSpeed * (0.75 + aSeed.x * 0.55), uHeight);
    vec3 wp = uOrigin + vec3(aCell.x, uHeight * 0.60, aCell.z) + uFall * travel;

    vec4 mv = viewMatrix * vec4(wp, 1.0);
    // Screen-space direction of the fall; the quad is expanded along it and
    // across it, so a streak always faces the camera AND leans with the wind.
    vec2 dir = (mat3(viewMatrix) * uFall).xy;
    float dl = length(dir);
    dir = dl > 1e-3 ? dir / dl : vec2(0.0, -1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    mv.xy += dir * (position.y * uLen) + perp * (position.x * uWidth);

    vRainUv = uv;
    // Fade out of the eye's face and into the edge of the volume, so there is
    // never a hard wall of rain or a streak stuck to the lens.
    float edge = length(vec2(aCell.x, aCell.z)) / uRadius;
    vRainFade = smoothstep(1.1, 4.0, length(mv.xyz)) * (1.0 - smoothstep(0.68, 1.0, edge));
    gl_Position = projectionMatrix * mv;
  }
`;

const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vRainUv;
  varying float vRainFade;

  void main() {
    float across = abs(vRainUv.x * 2.0 - 1.0);
    float a = (1.0 - across) * (1.0 - across);
    // Tapered head and tail — a streak is a smear of a drop, not a stick.
    // Brightest at the leading end (uv.y == 1, the direction of travel) and
    // trailing off behind it — the smear a falling drop actually leaves.
    a *= smoothstep(0.0, 0.55, vRainUv.y) * (1.0 - smoothstep(0.84, 1.0, vRainUv.y));
    gl_FragColor = vec4(uColor, a * uOpacity * vRainFade);
    #include <colorspace_fragment>
  }
`;

// ── Ripples ─────────────────────────────────────────────────────────────

const RIPPLE_VERT = /* glsl */`
  attribute vec3 aPos;
  attribute vec2 aSeed;   // x: phase/rate variance, y: density cull key
  uniform float uTime;
  uniform float uRate;
  uniform float uMaxR;
  uniform float uAmount;
  varying vec2 vRipUv;
  varying float vRipK;

  void main() {
    if (aSeed.y > uAmount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float k = fract(uTime * uRate * (0.7 + aSeed.x * 0.7) + aSeed.x);
    vec3 wp = aPos + position * (0.06 + k * uMaxR);
    vRipUv = uv;
    vRipK = k;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const RIPPLE_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vRipUv;
  varying float vRipK;

  void main() {
    float r = length(vRipUv - 0.5) * 2.0;
    float ring = smoothstep(0.48, 0.80, r) * (1.0 - smoothstep(0.86, 1.0, r));
    gl_FragColor = vec4(uColor, ring * (1.0 - vRipK) * uOpacity);
    #include <colorspace_fragment>
  }
`;

// ── Fireflies ───────────────────────────────────────────────────────────

const FLY_VERT = /* glsl */`
  attribute vec3 aPos;
  attribute vec3 aSeed;   // x,y: drift phases, z: size + blink variance
  uniform float uTime;
  uniform float uSize;
  uniform float uAmount;
  varying vec2 vFlyUv;
  varying float vFlyGlow;

  void main() {
    if (aSeed.z > uAmount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    // Lazy lissajous drift: two incommensurate frequencies per axis, so no
    // two fireflies ever trace the same path and none of them loops visibly.
    vec3 wp = aPos + vec3(
      sin(uTime * 0.31 + aSeed.x * 6.2832) * 1.7,
      sin(uTime * 0.47 + aSeed.y * 6.2832) * 0.55,
      cos(uTime * 0.26 + aSeed.x * 4.1) * 1.7
    );
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    mv.xy += position.xy * uSize * (0.7 + aSeed.z * 0.8);

    // Slow soft breathing, mostly dark, so the meadow twinkles rather than
    // glowing. Never a hard blink — this has to be gentle for a 5-year-old.
    float b = sin(uTime * (0.7 + aSeed.z * 1.4) + aSeed.y * 6.2832);
    vFlyGlow = smoothstep(-0.1, 0.85, b);
    vFlyUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLY_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vFlyUv;
  varying float vFlyGlow;

  void main() {
    float d = length(vFlyUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.4);
    gl_FragColor = vec4(uColor, a * vFlyGlow * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** A quad with UVs, wrapped as instanced geometry. */
function instancedQuad(count) {
  const src = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index;
  geo.setAttribute('position', src.getAttribute('position'));
  geo.setAttribute('uv', src.getAttribute('uv'));
  geo.instanceCount = count;
  // Never cull: these live around the camera and their real extent is decided
  // in the vertex shader, so a bounding sphere would be a lie.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  // `src` is deliberately NOT disposed: its attribute objects now belong to
  // `geo`, and BufferGeometry.dispose() would tell the renderer to free the
  // GPU buffers backing them.
  return geo;
}

/** A flat disc with UVs, wrapped as instanced geometry. */
function instancedDisc(count, segments = 14) {
  const src = new THREE.CircleGeometry(1, segments);
  src.rotateX(-Math.PI / 2);   // bake it flat: world xz == local xz
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index;
  geo.setAttribute('position', src.getAttribute('position'));
  geo.setAttribute('uv', src.getAttribute('uv'));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  // See instancedQuad: the attributes are handed over, not copied.
  return geo;
}

/**
 * Build the ground-level atmosphere layer.
 *
 * @param {{ sampleHeight: (x:number,z:number)=>number }} heightfield
 * @param {object} [opts]
 * @param {number} [opts.seed]
 * @param {number} [opts.rainCount]
 * @param {number} [opts.rippleCount]
 * @param {number} [opts.fireflyCount]
 * @returns {{ group: THREE.Group, stats: object,
 *             update: (frame:object, simTime:number, playerPos:object, camera:THREE.Camera) => void,
 *             dispose: () => void }}
 */
export function createAtmosphere(heightfield, opts = {}) {
  const {
    seed = WORLD.SEED,
    rainCount = RAIN_COUNT,
    rippleCount = RIPPLE_COUNT,
    fireflyCount = FIREFLY_COUNT,
  } = opts;

  const group = new THREE.Group();
  group.name = 'atmosphere';
  const rand = mulberry32(seed ^ 0xa17);

  // ── Rain ──────────────────────────────────────────────────────────────
  const rainGeo = instancedQuad(rainCount);
  {
    const cell = new Float32Array(rainCount * 3);
    const sd = new Float32Array(rainCount * 2);
    for (let i = 0; i < rainCount; i++) {
      // sqrt-distributed radius = uniform area density, so the volume does not
      // clump toward the middle.
      const r = Math.sqrt(rand()) * RAIN_RADIUS;
      const a = rand() * Math.PI * 2;
      cell[i * 3 + 0] = Math.cos(a) * r;
      cell[i * 3 + 1] = rand() * RAIN_HEIGHT;
      cell[i * 3 + 2] = Math.sin(a) * r;
      sd[i * 2 + 0] = rand();
      sd[i * 2 + 1] = rand();   // density cull key
    }
    rainGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 3));
    rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 2));
  }
  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uOrigin: { value: new THREE.Vector3() },
      uFall: { value: new THREE.Vector3(0.16, -1, 0.05).normalize() },
      uTime: { value: 0 },
      uSpeed: { value: 17 },
      uHeight: { value: RAIN_HEIGHT },
      uLen: { value: 0.62 },
      uWidth: { value: 0.042 },
      uAmount: { value: 0 },
      uRadius: { value: RAIN_RADIUS },
      // Silver-teal, not grey: rain is lit paper too.
      uColor: { value: new THREE.Color(PAPER.white).lerp(new THREE.Color(PAPER.tealL), 0.42) },
      uOpacity: { value: 0.55 },
    },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const rain = new THREE.Mesh(rainGeo, rainMat);
  rain.name = 'rain';
  rain.frustumCulled = false;
  rain.renderOrder = ORDER_RAIN;
  rain.visible = false;
  group.add(rain);

  // ── Ripples ───────────────────────────────────────────────────────────
  const rippleGeo = instancedDisc(rippleCount);
  const ripplePos = new Float32Array(rippleCount * 3);
  const rippleLattice = new Float32Array(rippleCount * 2);
  {
    const sd = new Float32Array(rippleCount * 2);
    for (let i = 0; i < rippleCount; i++) {
      const r = Math.sqrt(rand()) * RIPPLE_SPREAD;
      const a = rand() * Math.PI * 2;
      rippleLattice[i * 2 + 0] = Math.cos(a) * r;
      rippleLattice[i * 2 + 1] = Math.sin(a) * r;
      sd[i * 2 + 0] = rand();
      sd[i * 2 + 1] = rand();
    }
    rippleGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(ripplePos, 3));
    rippleGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 2));
  }
  const rippleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRate: { value: 1.5 },
      uMaxR: { value: RIPPLE_MAX_R },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(PAPER.white) },
      uOpacity: { value: 0.42 },
    },
    vertexShader: RIPPLE_VERT,
    fragmentShader: RIPPLE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const ripples = new THREE.Mesh(rippleGeo, rippleMat);
  ripples.name = 'rain-ripples';
  ripples.frustumCulled = false;
  ripples.renderOrder = ORDER_RIPPLE;
  ripples.visible = false;
  group.add(ripples);

  // ── Fireflies ─────────────────────────────────────────────────────────
  const flyGeo = instancedQuad(fireflyCount);
  const flyPos = new Float32Array(fireflyCount * 3);
  const flyLattice = new Float32Array(fireflyCount * 3);   // x, z, height offset
  {
    const sd = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i++) {
      const r = Math.sqrt(rand()) * FIREFLY_SPREAD;
      const a = rand() * Math.PI * 2;
      flyLattice[i * 3 + 0] = Math.cos(a) * r;
      flyLattice[i * 3 + 1] = Math.sin(a) * r;
      // Biased low: most fireflies hover in the grass, a few drift up into
      // the branches.
      flyLattice[i * 3 + 2] = 0.5 + rand() * rand() * 3.4;
      sd[i * 3 + 0] = rand();
      sd[i * 3 + 1] = rand();
      sd[i * 3 + 2] = rand();
    }
    flyGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(flyPos, 3));
    flyGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 3));
  }
  const flyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.16 },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(PAPER.gold) },
      uOpacity: { value: 0 },
    },
    vertexShader: FLY_VERT,
    fragmentShader: FLY_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const fireflies = new THREE.Mesh(flyGeo, flyMat);
  fireflies.name = 'fireflies';
  fireflies.frustumCulled = false;
  fireflies.renderOrder = ORDER_FIREFLY;
  fireflies.visible = false;
  group.add(fireflies);

  // ── Ground anchoring ──────────────────────────────────────────────────
  // Snapped so the same player position always yields the same scatter.
  let anchorX = NaN;
  let anchorZ = NaN;

  function reanchor(px, pz) {
    const ax = Math.round(px / ANCHOR_CELL) * ANCHOR_CELL;
    const az = Math.round(pz / ANCHOR_CELL) * ANCHOR_CELL;
    if (ax === anchorX && az === anchorZ) return;
    anchorX = ax;
    anchorZ = az;

    for (let i = 0; i < rippleCount; i++) {
      const x = ax + rippleLattice[i * 2 + 0];
      const z = az + rippleLattice[i * 2 + 1];
      const h = heightfield.sampleHeight(x, z);
      ripplePos[i * 3 + 0] = x;
      // Rain rings sit on whatever surface is up here — beach, bench or sea.
      ripplePos[i * 3 + 1] = (h > WORLD.WATER_Y ? h : WORLD.WATER_Y) + 0.05;
      ripplePos[i * 3 + 2] = z;
    }
    rippleGeo.getAttribute('aPos').needsUpdate = true;

    for (let i = 0; i < fireflyCount; i++) {
      const x = ax + flyLattice[i * 3 + 0];
      const z = az + flyLattice[i * 3 + 1];
      const h = heightfield.sampleHeight(x, z);
      flyPos[i * 3 + 0] = x;
      flyPos[i * 3 + 1] = (h > WORLD.WATER_Y ? h : WORLD.WATER_Y) + flyLattice[i * 3 + 2];
      flyPos[i * 3 + 2] = z;
    }
    flyGeo.getAttribute('aPos').needsUpdate = true;
  }

  /**
   * @param {object} frame   weather-folded lighting frame (rain, night, wind,
   *   fogColor, sunColor).
   * @param {number} simTime deterministic seconds.
   * @param {{x:number,z:number}} playerPos
   * @param {THREE.Camera} camera
   */
  function update(frame, simTime, playerPos, camera) {
    const rainAmt = frame ? (frame.rain ?? 0) : 0;
    const night = frame ? (frame.night ?? 0) : 0;
    const wind = frame ? (frame.wind ?? 1) : 1;

    reanchor(playerPos ? (playerPos.x ?? 0) : 0, playerPos ? (playerPos.z ?? 0) : 0);

    // ── rain ──
    rain.visible = rainAmt > 0.01;
    if (rain.visible) {
      const u = rainMat.uniforms;
      u.uTime.value = simTime;
      u.uAmount.value = rainAmt;
      u.uOpacity.value = 0.26 + rainAmt * 0.26;
      // Harder wind leans the fall and lengthens the streak.
      const slant = 0.20 + wind * 0.13;
      u.uFall.value.set(slant, -1, slant * 0.35).normalize();
      u.uLen.value = 0.42 + wind * 0.075;
      u.uSpeed.value = 14 + wind * 1.6;
      if (camera) {
        u.uOrigin.value.set(
          Math.round(camera.position.x / RAIN_SNAP) * RAIN_SNAP,
          Math.round(camera.position.y / RAIN_SNAP) * RAIN_SNAP - RAIN_HEIGHT * 0.5,
          Math.round(camera.position.z / RAIN_SNAP) * RAIN_SNAP,
        );
      }
      if (frame) {
        // The streaks take the hour's light: silver by day, lilac at night.
        _c.setHex(frame.sunColor);
        u.uColor.value.setHex(PAPER.white).lerp(_c, 0.30)
          .lerp(_c.setHex(PAPER.tealL), 0.34);
      }
    }

    // ── ripples ──
    ripples.visible = rainAmt > 0.01;
    if (ripples.visible) {
      const u = rippleMat.uniforms;
      u.uTime.value = simTime;
      u.uAmount.value = rainAmt;
      u.uOpacity.value = 0.12 + rainAmt * 0.20;
      if (frame) {
        _c.setHex(frame.fogColor);
        u.uColor.value.setHex(PAPER.white).lerp(_c, 0.30);
      }
    }

    // ── fireflies ──
    // They come out at night and hide from the rain, which is both true and
    // exactly the right way to keep two effects from fighting for the frame.
    const flyAmt = Math.max(0, (night - 0.35) / 0.65) * (1 - rainAmt);
    fireflies.visible = flyAmt > 0.02;
    if (fireflies.visible) {
      const u = flyMat.uniforms;
      u.uTime.value = simTime;
      u.uAmount.value = flyAmt;
      u.uOpacity.value = 0.85 * flyAmt;
    }
  }

  function dispose() {
    group.remove(rain, ripples, fireflies);
    rainGeo.dispose();
    rainMat.dispose();
    rippleGeo.dispose();
    rippleMat.dispose();
    flyGeo.dispose();
    flyMat.dispose();
    group.clear();
  }

  const stats = {
    rain: rainCount,
    ripples: rippleCount,
    fireflies: fireflyCount,
    // Worst case, and only when it is actually raining at night — which
    // weather.js makes impossible (fireflies fade out under rain).
    drawCalls: 3,
    triangles: rainCount * 2 + rippleCount * 14 + fireflyCount * 2,
  };

  return { group, stats, update, dispose };
}
