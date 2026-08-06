/**
 * Papercut sky: gradient dome + soft sun + one InstancedMesh of cut-paper clouds.
 *
 * WHY a hand-rolled dome instead of scene.background: the time-of-day rig
 * (./timeOfDay.js) hands us three PAPER-derived stops per frame, and a flat
 * clear color throws away the vertical band structure that makes the world
 * read as layered paper. A shader dome costs one draw call and lets the
 * horizon band blend into scene fog so land, water and sky share one edge.
 *
 * WHY the clouds are vertical inward-facing cards on a ring, not billboards:
 * the group tracks the camera in x/z, so a card whose normal points at the
 * ring center always faces the viewer without any per-vertex billboard math
 * or per-frame matrix rebuilds. Drift is a slow rigid Y rotation of the whole
 * InstancedMesh plus a hashed per-instance bob in the vertex shader — zero
 * allocations in update().
 *
 * WHY every sky material is opaque-with-depthWrite-off rather than
 * transparent: three sorts `transparent` materials into a pass that runs
 * AFTER opaque geometry, which would let the sky paint over terrain. Opaque +
 * negative renderOrder guarantees the sky is laid down first and everything
 * else covers it. Only the sun glow needs real blending, and it keeps
 * depthTest on so hills and clouds occlude it correctly.
 *
 * Constraints honored: no post-processing, no depth-texture reads, no fwidth,
 * every color derives from PAPER, shadows/undersides go teal never gray.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';

// Dome must sit inside the scene camera far plane (600 in index.js).
const SKY_RADIUS = 480;
const SUN_DIST = 360;

// Render ordering inside the opaque pass. Lower draws first.
const ORDER_DOME = -100;
const ORDER_CLOUD = -90;
const ORDER_SUN = -80;   // transparent pass; still ahead of water (0)

// Scratch objects — update() must never allocate.
const _sunDir = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

/** Deterministic PRNG so the cloudscape is identical across sessions/devices. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cut-paper cloud silhouette: the star-shaped hull of a row of overlapping
 * circles, sampled as a closed polyline. Star-shaped (max ray exit per angle)
 * on purpose — it drops the pinched concavities a true union would keep, which
 * is what makes the shape read as scissor-cut paper rather than fluff.
 * Output is normalized to |y| <= 1 so instance scale is the only size control.
 */
function buildCloudShape(rand, segments = 56) {
  const lobes = 5;
  const cx = [], cy = [], cr = [];
  let cursor = 0;
  for (let i = 0; i < lobes; i++) {
    // Middle lobes tallest — gives the classic cumulus hump silhouette.
    const bell = 1 - Math.abs(i - (lobes - 1) / 2) / ((lobes - 1) / 2);
    const r = 0.34 + bell * 0.34 + rand() * 0.14;
    cursor += i === 0 ? 0 : r * 0.86;
    cx.push(cursor);
    cy.push(r * 0.68 + rand() * 0.14);
    cr.push(r);
    cursor += r * 0.86;
  }
  // Recenter horizontally.
  const midX = (cx[0] + cx[cx.length - 1]) * 0.5;
  for (let i = 0; i < lobes; i++) cx[i] -= midX;

  // Ray origin sits low in the body so downward rays exit almost immediately
  // and the underside comes out near-flat, like a paper cloud sitting on a line.
  let topMax = 0;
  for (let i = 0; i < lobes; i++) topMax = Math.max(topMax, cy[i] + cr[i]);
  const ox = 0, oy = topMax * 0.34;

  const pts = [];
  let maxY = 1e-6;
  for (let s = 0; s < segments; s++) {
    const th = (s / segments) * Math.PI * 2;
    const dx = Math.cos(th), dy = Math.sin(th);
    let t = 0;
    for (let i = 0; i < lobes; i++) {
      const ax = cx[i] - ox, ay = cy[i] - oy;
      const b = dx * ax + dy * ay;
      const c = ax * ax + ay * ay - cr[i] * cr[i];
      const disc = b * b - c;
      if (disc <= 0) continue;
      const hit = b + Math.sqrt(disc);
      if (hit > t) t = hit;
    }
    if (t <= 0) t = 0.2;
    let px = ox + dx * t;
    let py = oy + dy * t;
    // Soft-flatten everything below the ray origin instead of hard-clamping:
    // a hard clamp makes collinear bottom points and can break triangulation.
    if (py < oy) py = oy + (py - oy) * 0.34;
    pts.push(px, py);
    if (Math.abs(py) > maxY) maxY = Math.abs(py);
  }

  const shape = new THREE.Shape();
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] / maxY, y = pts[i + 1] / maxY;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

const DOME_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Three stacked PAPER bands plus a fog-colored skirt below the horizon so the
// dome meets fogged terrain/water without a seam. uBands posterizes the ramp
// very lightly: enough to suggest torn paper strata, not enough to stair-step.
const DOME_FRAG = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uHorizon;
  uniform float uBandStrength;
  uniform float uBandCount;
  varying vec3 vDir;

  void main() {
    float h = clamp(vDir.y, -1.0, 1.0);
    float hb = smoothstep(0.00, 0.26, h);
    float ht = smoothstep(0.24, 0.86, h);
    if (uBandStrength > 0.0) {
      float q = 1.0 / uBandCount;
      hb = mix(hb, floor(hb / q + 0.5) * q, uBandStrength);
      ht = mix(ht, floor(ht / q + 0.5) * q, uBandStrength);
    }
    vec3 col = mix(uHorizon, uBottom, smoothstep(-0.22, 0.0, h));
    col = mix(col, uMid, hb);
    col = mix(col, uTop, ht);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const SUN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Warm paper sun: a soft-edged core disc on a wide falloff halo. Deliberately
// no ring/streak/ghost geometry — a lens flare would read as photographic.
const SUN_FRAG = /* glsl */`
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uDiscR;
  uniform float uGlowPow;
  uniform float uGlowStrength;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float disc = 1.0 - smoothstep(uDiscR * 0.82, uDiscR, d);
    float halo = pow(max(0.0, 1.0 - d), uGlowPow);
    vec3 col = mix(uGlow, uCore, disc);
    float a = clamp(disc + halo * uGlowStrength, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

// aSeed: x,y = silhouette warp phases, z = bob phase, w = tint amount.
// The warp harmonics are integer multiples of the polar angle so the shape
// stays continuous across the +-PI seam.
const CLOUD_VERT = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uBob;
  varying float vY;
  varying float vTint;

  void main() {
    float ang = atan(position.y, position.x);
    float warp = 1.0
      + 0.13 * sin(ang * 3.0 + aSeed.x * 6.2832)
      + 0.08 * sin(ang * 5.0 + aSeed.y * 6.2832);
    vec3 p = vec3(position.xy * warp, 0.0);
    p.y += uBob * sin(uTime * 0.31 + aSeed.z * 6.2832);
    vY = position.y;
    vTint = aSeed.w;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;

// Three flat plies bottom-to-top with one crisp step between the upper two:
// that hard edge is the whole trick that sells "stacked paper" without any
// outline or gradient shading.
const CLOUD_FRAG = /* glsl */`
  uniform vec3 uUnder;
  uniform vec3 uBody;
  uniform vec3 uCrest;
  uniform vec3 uWarm;
  varying float vY;
  varying float vTint;

  void main() {
    float u = clamp(vY * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uUnder, uBody, smoothstep(0.04, 0.46, u));
    col = mix(col, uCrest, smoothstep(0.68, 0.73, u) * 0.85);
    col = mix(col, uWarm, vTint * 0.35);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Build the sky.
 *
 * @param {object} [opts]
 * @param {THREE.Camera} [opts.camera]  tracked in x/z so the dome never clips.
 * @param {number} [opts.seed]          cloudscape determinism.
 * @param {number} [opts.cloudCount]    default 40.
 * @param {number} [opts.radius]        dome radius; keep < camera.far.
 * @param {number} [opts.bandStrength]  0..1 papercut posterize on the gradient.
 * @returns {{ group: THREE.Group, update: (frame: object, simTime: number) => void, dispose: () => void }}
 */
export function createSky(opts = {}) {
  const {
    camera = null,
    seed = 20260717,
    cloudCount = 40,
    radius = SKY_RADIUS,
    bandStrength = 0.22,
  } = opts;

  const group = new THREE.Group();
  group.name = 'sky';
  const rand = mulberry32(seed ^ 0x5eed);

  // ── Gradient dome ──────────────────────────────────────────────────────
  const domeGeo = new THREE.SphereGeometry(radius, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(PAPER.sky) },
      uMid: { value: new THREE.Color(PAPER.sky) },
      uBottom: { value: new THREE.Color(PAPER.cream) },
      uHorizon: { value: new THREE.Color(PAPER.cream) },
      uBandStrength: { value: bandStrength },
      uBandCount: { value: 7 },
    },
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = ORDER_DOME;
  dome.frustumCulled = false;
  group.add(dome);

  // ── Sun disc + halo ────────────────────────────────────────────────────
  const sunGeo = new THREE.PlaneGeometry(1, 1);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(PAPER.white) },
      uGlow: { value: new THREE.Color(PAPER.gold) },
      uDiscR: { value: 0.17 },
      uGlowPow: { value: 3.2 },
      uGlowStrength: { value: 0.42 },
      uOpacity: { value: 0.9 },
    },
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.scale.setScalar(120);
  sun.renderOrder = ORDER_SUN;
  sun.frustumCulled = false;
  group.add(sun);

  // ── Clouds: one geometry, one draw call, per-instance silhouette warp ──
  const cloudGeo = new THREE.ShapeGeometry(buildCloudShape(rand));
  const seeds = new Float32Array(cloudCount * 4);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBob: { value: 0.045 },
      uUnder: { value: new THREE.Color(PAPER.tealL) },
      uBody: { value: new THREE.Color(PAPER.cream) },
      uCrest: { value: new THREE.Color(PAPER.white) },
      uWarm: { value: new THREE.Color(PAPER.peach) },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  clouds.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  clouds.renderOrder = ORDER_CLOUD;
  clouds.frustumCulled = false;

  {
    // Bake instance transforms once: ring position + inward facing + scale.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < cloudCount; i++) {
      // Jittered even azimuth spread avoids clumps and bald patches.
      const az = ((i + rand() * 0.7) / cloudCount) * Math.PI * 2;
      const ring = 190 + rand() * 210;
      const w = 26 + rand() * rand() * 66;   // biased small, a few giants
      const h = w * (0.30 + rand() * 0.18);
      // Floor above the palace summit (~55m) so no cloud card ever clips terrain.
      pos.set(Math.sin(az) * ring, 62 + rand() * 105, Math.cos(az) * ring);
      // Face the ring center (== camera x/z), with a touch of roll for life.
      e.set(0, Math.atan2(-pos.x, -pos.z), (rand() - 0.5) * 0.10);
      q.setFromEuler(e);
      scl.set(rand() < 0.5 ? -w : w, h, 1);
      clouds.setMatrixAt(i, m.compose(pos, q, scl));
      seeds[i * 4 + 0] = rand();
      seeds[i * 4 + 1] = rand();
      seeds[i * 4 + 2] = rand();
      seeds[i * 4 + 3] = rand() * rand();   // most clouds cool, a few warmed
    }
    clouds.instanceMatrix.needsUpdate = true;
  }
  cloudGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  group.add(clouds);

  /**
   * @param {object} frame  timeOfDay() frame: skyTop/skyMid/skyBottom/fogColor/
   *                        sunColor as 0xRRGGBB ints, sunDir as [x,y,z].
   * @param {number} simTime deterministic seconds from the renderer rig.
   */
  function update(frame, simTime) {
    if (frame) {
      domeMat.uniforms.uTop.value.setHex(frame.skyTop);
      domeMat.uniforms.uMid.value.setHex(frame.skyMid);
      domeMat.uniforms.uBottom.value.setHex(frame.skyBottom);
      domeMat.uniforms.uHorizon.value.setHex(frame.fogColor);

      // Sun core stays near-white paper; the halo carries the hour's warmth.
      _c0.setHex(frame.sunColor);
      sunMat.uniforms.uGlow.value.copy(_c0);
      sunMat.uniforms.uCore.value.setHex(PAPER.white).lerp(_c0, 0.35);

      const d = frame.sunDir;
      _sunDir.set(d[0], d[1], d[2]).normalize();
      sun.position.copy(_sunDir).multiplyScalar(SUN_DIST);
      sun.lookAt(group.position.x, group.position.y, group.position.z);

      // Cloud plies ride the hour: body warms toward the sun, underside keeps
      // a teal lean (papercut law: undersides go teal, never gray).
      _c1.setHex(frame.fogColor);
      cloudMat.uniforms.uBody.value.setHex(PAPER.cream).lerp(_c0, 0.22);
      cloudMat.uniforms.uCrest.value.setHex(PAPER.white).lerp(_c0, 0.14);
      cloudMat.uniforms.uUnder.value.setHex(PAPER.tealL).lerp(_c1, 0.40);
      cloudMat.uniforms.uWarm.value.copy(_c1);
    }
    cloudMat.uniforms.uTime.value = simTime;
    // Rigid drift: inward-facing cards stay inward-facing under a Y spin, so
    // the whole sky turns for free with no instance-matrix rebuild.
    clouds.rotation.y = simTime * 0.0045;
    if (camera) group.position.set(camera.position.x, 0, camera.position.z);
  }

  function dispose() {
    group.remove(dome, sun, clouds);
    domeGeo.dispose();
    domeMat.dispose();
    sunGeo.dispose();
    sunMat.dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
    clouds.dispose();
  }

  return { group, update, dispose };
}
