/**
 * Papercut sky: gradient dome (+ stars) + sun/moon body + light shafts + one
 * InstancedMesh of cut-paper clouds. Four draw calls for the entire firmament.
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
 * WHY the stars live in the DOME's fragment shader instead of a point cloud:
 * a starfield is the one thing in this world that is genuinely infinitely far
 * away, so it belongs to the surface that already covers the sky — zero extra
 * draw calls, zero geometry, and no parallax bug when the camera moves. The
 * field is a hashed 3D cell grid sampled along the view direction, gated by a
 * `uNight` UNIFORM branch so the whole block is skipped outright during the
 * day (a uniform branch is perfectly coherent — it costs nothing, which
 * matters because the dome covers every pixel and our screenshot harness
 * rasterises on the CPU).
 *
 * WHY the god rays are geometry and not post-processing: post is banned here
 * (see TECH LAW), and radial blur would fight the flat papercut look anyway.
 * A fan of soft additive blades pinned to the key light, sitting 300 m out and
 * depth-TESTED, gets the effect honestly: hills and canopies occlude the
 * blades, so the rays break up exactly where something stands in front of the
 * sun. That is what "shafts through canopy gaps" physically is.
 *
 * WHY the sun and the moon are ONE billboard: timeOfDay's `sunDir` is the KEY
 * LIGHT direction, whatever body is providing it. Cross-fading one quad's
 * disc radius, halo falloff and colour from sun to moon on the `night` field
 * keeps the sky body and the shadow direction in permanent agreement, and
 * costs one draw call instead of two.
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
// Shafts sit well inside the world so terrain and canopy can occlude them.
const SHAFT_DIST = 300;
const SHAFT_SPAN = 210;

// Render ordering inside the opaque pass. Lower draws first.
const ORDER_DOME = -100;
const ORDER_CLOUD = -90;
const ORDER_SUN = -80;    // transparent pass; still ahead of water (0)
const ORDER_SHAFT = -75;  // over the disc, under the clouds' silhouette

// Scratch objects — update() must never allocate.
const _sunDir = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

const lerp = (a, b, u) => a + (b - a) * u;

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
  uniform float uNight;
  uniform float uTime;
  uniform float uStarScale;
  uniform vec3 uStarCool;
  uniform vec3 uStarWarm;
  uniform vec3 uSunDir;
  uniform vec3 uGlowColor;
  uniform float uGlowAmt;
  varying vec3 vDir;

  // Cheap 3D value hash. No texture fetch, no derivatives — identical under
  // SwiftShader and on an iPad, which is the whole reason it is written by
  // hand rather than sampled.
  float mwHash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    // ── Where the three bands actually land ──────────────────────────────
    // These breakpoints were authored against the whole hemisphere and the
    // game never looks at the whole hemisphere. A 50-degree lens held level
    // sees roughly vDir.y in [-0.42, 0.42], so a top band that only arrived
    // at h = 0.86 was a colour NO PLAYER EVER SAW: every frame got the two
    // palest stops and the sky read as one flat wash with a stripe in it.
    // Compressed into the band the camera can actually see, the same three
    // stops become a real top-to-bottom value ramp in frame.
    float h = clamp(vDir.y, -1.0, 1.0);
    float hb = smoothstep(0.02, 0.20, h);
    float ht = smoothstep(0.14, 0.62, h);
    if (uBandStrength > 0.0) {
      float q = 1.0 / uBandCount;
      hb = mix(hb, floor(hb / q + 0.5) * q, uBandStrength);
      ht = mix(ht, floor(ht / q + 0.5) * q, uBandStrength);
    }
    // The dome must equal the fog colour EXACTLY at h = 0, because that is the
    // line fogged terrain and fogged ocean resolve to. It used to have already
    // walked most of the way to uBottom by then, which is what put a hard
    // horizontal seam across every seaward frame — a warm sky sitting on a
    // cool sea with a drawn edge between them. Now the warm band starts just
    // above the waterline and the join itself is one colour.
    vec3 col = mix(uHorizon, uBottom, smoothstep(-0.01, 0.10, h));
    col = mix(col, uMid, hb);
    col = mix(col, uTop, ht);

    // ── Sun-anchored horizon glow ────────────────────────────────────────
    // Without this the dome is three horizontal bands and NOTHING ELSE: a
    // perfectly symmetric backdrop that tells you nothing about where the
    // light is coming from, which is why the horizon kept reading as a dead
    // flat cream strip. Real sky is brightest around the sun and coolest
    // opposite it, and that asymmetry is what lets a viewer orient inside a
    // frame before they have parsed a single object in it.
    //
    // Two lobes, both anchored to the SAME uSunDir the shadows use, so the
    // sky can never disagree with the ground about where the sun is:
    //   - a tight one that puts a hot core right around the disc;
    //   - a very wide one flattened onto the horizon band, which is the
    //     scattering that actually paints a sunrise across a third of the sky.
    float sd = dot(normalize(vDir), normalize(uSunDir));
    float core = pow(max(sd, 0.0), 22.0);
    float wide = pow(max(sd, 0.0), 2.2)
      * (1.0 - smoothstep(0.02, 0.52, h));   // hugs the horizon, not the zenith
    col = mix(col, uGlowColor, clamp((core * 0.55 + wide * 0.45) * uGlowAmt, 0.0, 1.0));

    // ── Stars ────────────────────────────────────────────────────────────
    // One hashed point per occupied cell of a grid laid over the view
    // direction. Uniform branch: costs nothing before dusk.
    if (uNight > 0.004) {
      vec3 sp = vDir * uStarScale;
      vec3 cell = floor(sp);
      vec3 frc = fract(sp);
      float pick = mwHash31(cell);
      vec3 jit = vec3(
        mwHash31(cell + 11.3),
        mwHash31(cell + 27.7),
        mwHash31(cell + 41.1)
      );
      // ~10% of cells hold a star, and the ramp gives them varying magnitude.
      float star = smoothstep(0.855, 0.995, pick)
                 * (1.0 - smoothstep(0.0, 0.21, length(frc - jit)));
      // Slow independent twinkle, a soft galactic band so the field is not
      // uniform, and a fade into the horizon haze.
      float twinkle = 0.62 + 0.38 * sin(uTime * (0.9 + pick * 3.0) + pick * 60.0);
      float band = 0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.34, abs(vDir.y - 0.32 - vDir.x * 0.20)));
      star *= twinkle * band * smoothstep(-0.02, 0.22, h) * uNight * 1.35;
      col += mix(uStarCool, uStarWarm, jit.x) * star;
    }

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

// ── God rays ───────────────────────────────────────────────────────────
// A fan of tapered blades radiating from the key light. uv.x runs ACROSS a
// blade (soft edges), uv.y runs ALONG it (fade in off the disc, fade out at
// the tip); aPhase decorrelates their breathing so the fan never pulses as one.
const SHAFT_VERT = /* glsl */`
  attribute float aPhase;
  varying vec2 vShaftUv;
  varying float vShaftPh;
  void main() {
    vShaftUv = uv;
    vShaftPh = aPhase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vShaftUv;
  varying float vShaftPh;

  void main() {
    float across = abs(vShaftUv.x * 2.0 - 1.0);
    float body = pow(max(0.0, 1.0 - across), 3.4);
    float root = smoothstep(0.0, 0.24, vShaftUv.y);        // off the disc
    float tip = 1.0 - smoothstep(0.14, 0.92, vShaftUv.y);  // into nothing
    float breathe = 0.70 + 0.30 * sin(uTime * 0.37 + vShaftPh * 6.2832);
    // Additive blending multiplies rgb by alpha, so the colour is handed over
    // straight and the whole shaping lives in alpha.
    gl_FragColor = vec4(uColor, body * root * tip * breathe * uStrength);
    #include <colorspace_fragment>
  }
`;

/**
 * Build the shaft fan as ONE geometry: `blades` quads in the z=0 plane,
 * radiating from the origin, each one widening as it goes (a light shaft
 * diverges — parallel-sided beams read as cardboard).
 */
function buildShaftGeometry(rand, blades = 9) {
  const pos = new Float32Array(blades * 6 * 3);
  const uvs = new Float32Array(blades * 6 * 2);
  const phase = new Float32Array(blades * 6);
  let p = 0, t = 0, f = 0;
  const QUV = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  for (let i = 0; i < blades; i++) {
    // Jittered even spread: a perfectly regular fan reads as a logo.
    const th = ((i + rand() * 0.75) / blades) * Math.PI * 2;
    const half = 0.055 + rand() * 0.075;   // angular half-width at the root
    const taper = 1.7 + rand() * 1.4;      // how much it opens by the tip
    const r0 = 0.05 + rand() * 0.06;
    const r1 = 0.50 + rand() * 0.50;
    const ph = rand();
    const at = (r, a) => [Math.cos(th + a) * r, Math.sin(th + a) * r];
    const c = [at(r0, -half), at(r0, half), at(r1, half * taper), at(r1, -half * taper)];
    const quad = [c[0], c[1], c[2], c[0], c[2], c[3]];
    for (let k = 0; k < 6; k++) {
      pos[p++] = quad[k][0]; pos[p++] = quad[k][1]; pos[p++] = 0;
      uvs[t++] = QUV[k][0]; uvs[t++] = QUV[k][1];
      phase[f++] = ph;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return geo;
}

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
      uNight: { value: 0 },
      uTime: { value: 0 },
      // Cell density of the star grid. 58 puts a few hundred stars in a 4:3
      // frame — a sky, not a snowstorm.
      uStarScale: { value: 58 },
      uStarCool: { value: new THREE.Color(PAPER.white) },
      uStarWarm: { value: new THREE.Color(PAPER.gold) },
      uSunDir: { value: new THREE.Vector3(0.55, 0.62, 0.36).normalize() },
      uGlowColor: { value: new THREE.Color(PAPER.gold) },
      uGlowAmt: { value: 0.38 },
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

  // ── Light shafts ───────────────────────────────────────────────────────
  const shaftGeo = buildShaftGeometry(rand);
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PAPER.gold) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // depthTest ON is the point: terrain and canopy occlude the blades, which
    // is what turns a flat fan into rays breaking through what is in front of
    // the light.
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const shafts = new THREE.Mesh(shaftGeo, shaftMat);
  shafts.scale.setScalar(SHAFT_SPAN);
  shafts.renderOrder = ORDER_SHAFT;
  shafts.frustumCulled = false;
  shafts.visible = false;
  group.add(shafts);

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
   * @param {object} frame  a weather-folded lighting frame (see weather.js
   *   createRenderFrame): skyTop/skyMid/skyBottom/fogColor/sunColor as
   *   0xRRGGBB ints, sunDir as [x,y,z], plus night / shaft / cloudTint /
   *   cloudTintAmt drives.
   * @param {number} simTime deterministic seconds from the renderer rig.
   */
  function update(frame, simTime) {
    if (frame) {
      const night = frame.night ?? 0;

      domeMat.uniforms.uTop.value.setHex(frame.skyTop);
      domeMat.uniforms.uMid.value.setHex(frame.skyMid);
      domeMat.uniforms.uBottom.value.setHex(frame.skyBottom);
      domeMat.uniforms.uHorizon.value.setHex(frame.fogColor);
      domeMat.uniforms.uNight.value = night;
      // Thick air eats the stars — rain and mist keep the dome plain.
      domeMat.uniforms.uStarCool.value.setHex(PAPER.white)
        .lerp(_c1.setHex(frame.fogColor), (frame.cloudTintAmt ?? 0) * 1.6);

      _c0.setHex(frame.sunColor);
      // Sun -> moon. The disc shrinks and hardens while the halo pulls in, so
      // one quad reads as a blazing sun at noon and a crisp warm moon at 3am.
      sunMat.uniforms.uGlow.value.copy(_c0);
      // The moon's own paper is WARM even though the light it casts is cool
      // lilac — that contrast is what keeps a kids' night inviting.
      _c2.setHex(PAPER.cream).lerp(_c1.setHex(PAPER.gold), 0.30);
      sunMat.uniforms.uCore.value.setHex(PAPER.white).lerp(_c0, 0.35).lerp(_c2, night);
      sunMat.uniforms.uDiscR.value = lerp(0.17, 0.34, night);
      sunMat.uniforms.uGlowPow.value = lerp(3.2, 5.4, night);
      sunMat.uniforms.uGlowStrength.value = lerp(0.42, 0.26, night);
      sun.scale.setScalar(lerp(120, 62, night));

      const d = frame.sunDir;
      _sunDir.set(d[0], d[1], d[2]).normalize();

      // The dome's glow rides the same direction as the shadows. Its colour is
      // the sun's own paper lifted toward the horizon band so the glow reads as
      // the sky being lit rather than as a second disc painted on it, and its
      // strength falls with the sun's altitude — a low sun scatters through
      // far more air, which is the whole reason a sunset is a sunset.
      domeMat.uniforms.uSunDir.value.copy(_sunDir);
      _c2.setHex(frame.sunColor).lerp(_c1.setHex(frame.skyBottom), 0.34);
      domeMat.uniforms.uGlowColor.value.copy(_c2);
      // Overcast has no sun to glow around; the cloudTint drive already says so.
      domeMat.uniforms.uGlowAmt.value = lerp(0.52, 0.24, Math.min(1, Math.max(0, _sunDir.y / 0.7)))
        * (1 - night * 0.72) * (1 - Math.min(0.85, (frame.cloudTintAmt ?? 0) * 1.1));

      sun.position.copy(_sunDir).multiplyScalar(SUN_DIST);
      sun.lookAt(group.position.x, group.position.y, group.position.z);

      // Shafts share the body's anchor and colour, and die entirely at night
      // and under cloud (the `shaft` drive already carries both).
      const shaft = frame.shaft ?? 0;
      shafts.visible = shaft > 0.004;
      if (shafts.visible) {
        shaftMat.uniforms.uStrength.value = shaft;
        shaftMat.uniforms.uColor.value.setHex(PAPER.white).lerp(_c0, 0.72);
        shafts.position.copy(_sunDir).multiplyScalar(SHAFT_DIST);
        shafts.lookAt(group.position.x, group.position.y, group.position.z);
      }

      // Cloud plies ride the hour: body warms toward the sun, underside keeps
      // a teal lean (papercut law: undersides go teal, never gray). Weather
      // pulls the whole stack toward its tint; night sinks it into the fog so
      // clouds become soft silhouettes rather than glowing paper.
      _c1.setHex(frame.fogColor);
      _c2.setHex(frame.cloudTint ?? frame.fogColor);
      const wt = frame.cloudTintAmt ?? 0;
      cloudMat.uniforms.uBody.value.setHex(PAPER.cream).lerp(_c0, 0.22).lerp(_c2, wt).lerp(_c1, night * 0.88);
      cloudMat.uniforms.uCrest.value.setHex(PAPER.white).lerp(_c0, 0.14).lerp(_c2, wt * 0.7).lerp(_c1, night * 0.80);
      cloudMat.uniforms.uUnder.value.setHex(PAPER.tealL).lerp(_c1, 0.40 + night * 0.55);
      cloudMat.uniforms.uWarm.value.copy(_c1);
    }
    cloudMat.uniforms.uTime.value = simTime;
    domeMat.uniforms.uTime.value = simTime;
    shaftMat.uniforms.uTime.value = simTime;
    // Rigid drift: inward-facing cards stay inward-facing under a Y spin, so
    // the whole sky turns for free with no instance-matrix rebuild.
    clouds.rotation.y = simTime * 0.0045;
    if (camera) group.position.set(camera.position.x, 0, camera.position.z);
  }

  function dispose() {
    group.remove(dome, sun, shafts, clouds);
    domeGeo.dispose();
    domeMat.dispose();
    sunGeo.dispose();
    sunMat.dispose();
    shaftGeo.dispose();
    shaftMat.dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
    clouds.dispose();
  }

  return { group, update, dispose };
}
