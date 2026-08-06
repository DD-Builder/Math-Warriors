/**
 * Papercut ocean: one plane, one draw call, depth read from a BAKED shore map.
 *
 * WHY a baked shore-distance texture instead of the usual depth-buffer trick:
 * reading the depth texture is forbidden here (it must render identically under
 * the SwiftShader software GL our screenshot harness uses, and it would cost a
 * second pass we cannot afford on an iPad). But heightfield.shoreDistance() is
 * a pure function, so we sample it ONCE into a 256x256 R8 DataTexture at build
 * time and get better-than-depth-buffer information for free: the shader knows
 * the *signed* distance to the waterline everywhere, which is exactly what the
 * shallow-water ramp and the foam band want. Cost is a one-time ~300ms bake
 * (256*256 shoreDistance calls, 5 sampleHeight each) and 64KB of VRAM.
 *
 * WHY the color ramp is keyed on shore distance rather than view depth: the
 * palette law wants discrete PAPER plies — tealD / teal / tealL / cream — and a
 * distance-keyed ramp puts those band edges at fixed places in the world, so
 * they read as concentric cut-paper rings around the island instead of sliding
 * around as the camera moves.
 *
 * Waves are two summed low-frequency sines at ~0.12 total amplitude: kid-safe
 * calm swell, and small enough that the mesh never pokes through beach sand.
 * Sparkle is a pure hash noise (no texture fetch, no fwidth) gated by a cheap
 * analytic-normal half-vector term so glints only appear toward the sun.
 *
 * Constraints honored: no post-processing, no depth texture, no derivatives,
 * every color from PAPER, no per-frame allocation in update().
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { WORLD } from './worldSpec.js';

const PLANE_SIZE = 600;      // generously past WORLD.SIZE (480) so no edge shows
const PLANE_SEGS = 128;      // 32k tris — enough for a smooth swell, cheap
const SHORE_RES = 256;
const SHORE_RANGE = 40;      // meters encoded either side of the waterline

const _sunDir = new THREE.Vector3();
const _c0 = new THREE.Color();

/**
 * Bake heightfield.shoreDistance() over the plane footprint into an R8 texture.
 * Encoding: 0 => -SHORE_RANGE (deep ocean), 1 => +SHORE_RANGE (inland).
 * The waterline therefore lands at exactly 0.5, so an 8-bit channel still
 * resolves ~0.31m per step near shore — finer than the 2.3m texel spacing,
 * i.e. bilinear filtering, not quantization, is the limiting factor.
 */
function bakeShoreTexture(heightfield, res, half, range) {
  const data = new Uint8Array(res * res);
  const step = (half * 2) / res;
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    const row = j * res;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * step;
      const d = heightfield.shoreDistance(x, z);
      const u = (d + range) / (2 * range);
      data[row + i] = u <= 0 ? 0 : u >= 1 ? 255 : (u * 255) | 0;
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Swell constants are named once and injected so the height and its analytic
// derivative can never drift apart — a mismatch would light the sparkle on
// slopes the surface does not actually have.
const WAVE_DEFS = /* glsl */`
  const vec2 K1 = vec2(0.055, 0.028);
  const vec2 K2 = vec2(-0.021, 0.047);
  const float S1 = 0.55;
  const float S2 = 0.41;
`;

const WATER_VERT = /* glsl */`
  ${WAVE_DEFS}
  uniform float uTime;
  uniform float uWaveAmp;
  uniform vec2 uShoreMin;
  uniform vec2 uShoreSize;

  varying vec2 vShoreUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    vec4 wp = modelMatrix * vec4(p, 1.0);

    float ph1 = dot(wp.xz, K1) + uTime * S1;
    float ph2 = dot(wp.xz, K2) + uTime * S2;
    float h = (sin(ph1) + sin(ph2)) * uWaveAmp;

    // Analytic slope of the same sum — no normal attribute needed, no fwidth.
    vec2 slope = (K1 * cos(ph1) + K2 * cos(ph2)) * uWaveAmp;
    vNormalW = normalize(vec3(-slope.x, 1.0, -slope.y));

    wp.y += h;
    vWorld = wp.xyz;
    vShoreUv = (wp.xz - uShoreMin) / uShoreSize;

    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const WATER_FRAG = /* glsl */`
  uniform sampler2D uShore;
  uniform float uShoreRange;
  uniform float uTime;

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uEdge;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;

  uniform float uFoamWidth;
  uniform float uFoamSwing;
  uniform float uFoamSpeed;
  uniform float uSparkle;
  uniform float uFresnel;
  uniform float uOpacityDeep;
  uniform float uOpacityShallow;

  varying vec2 vShoreUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  #include <fog_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(127.31, 311.7));
    p += dot(p, p + 34.71);
    return fract(p.x * p.y);
  }

  // Smooth value noise over the hash — cheaper than any texture fetch and
  // identical on SwiftShader (no derivatives, no mip selection involved).
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // Signed meters to the waterline: negative = open water, positive = land.
    float sd = texture2D(uShore, vShoreUv).r * (2.0 * uShoreRange) - uShoreRange;

    // Concentric PAPER plies. Band edges are fixed in world space so they read
    // as cut-paper rings around the island, not as a view-dependent gradient.
    vec3 col = mix(uDeep, uMid, smoothstep(-14.0, -4.5, sd));
    col = mix(col, uShallow, smoothstep(-4.5, -1.1, sd));
    col = mix(col, uEdge, smoothstep(-1.1, -0.05, sd));

    // Breathing foam band: one wide swash that swings in and out on time plus
    // a thin standing crest pinned to the waterline. Wobble is world-keyed so
    // the band is not a perfect offset curve all the way around the island.
    float wob = vnoise(vWorld.xz * 0.06 + uTime * 0.03) - 0.5;
    float swash = -0.75 + uFoamSwing * sin(uTime * uFoamSpeed + wob * 5.0);
    float band = 1.0 - smoothstep(0.0, uFoamWidth, abs(sd - swash));
    float crest = 1.0 - smoothstep(0.0, 0.35, abs(sd + 0.12));
    float foam = clamp(band * 0.75 + crest * 0.9, 0.0, 1.0);
    // Foam only exists in water, and lace-edges it with the same hash noise.
    foam *= (1.0 - smoothstep(-0.15, 0.25, sd)) * (0.55 + 0.45 * vnoise(vWorld.xz * 1.6 + uTime * 0.12));
    col = mix(col, uFoam, foam);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    col = mix(col, uSky, fres * uFresnel);

    // Sparkle: scrolled noise threshold, gated by a broad sun half-vector lobe
    // so glints only ever appear on the sunward side. Deliberately sparse.
    vec3 H = normalize(normalize(uSunDir) + V);
    float lobe = pow(clamp(dot(N, H), 0.0, 1.0), 48.0);
    float n = vnoise(vWorld.xz * 0.55 + vec2(uTime * 0.06, uTime * -0.04));
    float glint = smoothstep(0.80, 0.97, n) * lobe;
    col += uSunColor * glint * uSparkle * (1.0 - foam);

    // Shallow water stays see-through so beach sand reads under it; grazing
    // angles go opaque so the horizon is a clean paper edge.
    // smoothstep edges must stay ascending (edge0 > edge1 is undefined in GLSL).
    float a = mix(uOpacityDeep, uOpacityShallow, smoothstep(-8.0, -0.6, sd));
    a = clamp(max(a, fres * 0.9) + foam * 0.5, 0.0, 1.0);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Build the ocean.
 *
 * @param {{ shoreDistance: (x:number,z:number)=>number }} heightfield
 *        from createHeightfield(); only shoreDistance is used, and only once.
 * @param {object} [opts]
 * @param {number} [opts.size]      plane extent, default 600.
 * @param {number} [opts.segments]  grid subdivisions, default 128.
 * @param {number} [opts.y]         surface height, default WORLD.WATER_Y.
 * @param {number} [opts.shoreRes]  bake resolution, default 256.
 * @returns {{ mesh: THREE.Mesh, update: (frame: object, simTime: number) => void, dispose: () => void }}
 */
export function createWater(heightfield, opts = {}) {
  const {
    size = PLANE_SIZE,
    segments = PLANE_SEGS,
    y = WORLD.WATER_Y,
    shoreRes = SHORE_RES,
  } = opts;
  const half = size / 2;

  const shoreTex = bakeShoreTexture(heightfield, shoreRes, half, SHORE_RANGE);

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);   // bake the rotation so world xz == local xz
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');   // shore UV is derived from world position

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uShore: { value: null },
      uShoreRange: { value: SHORE_RANGE },
      uShoreMin: { value: new THREE.Vector2(-half, -half) },
      uShoreSize: { value: new THREE.Vector2(size, size) },
      uTime: { value: 0 },
      uWaveAmp: { value: 0.06 },        // two sines => ~0.12 peak-to-mean swell

      uDeep: { value: new THREE.Color(PAPER.tealD) },
      uMid: { value: new THREE.Color(PAPER.teal) },
      uShallow: { value: new THREE.Color(PAPER.tealL) },
      uEdge: { value: new THREE.Color(PAPER.cream) },
      uFoam: { value: new THREE.Color(PAPER.white) },
      uSky: { value: new THREE.Color(PAPER.sky) },
      uSunColor: { value: new THREE.Color(PAPER.cream) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) },

      uFoamWidth: { value: 0.9 },
      uFoamSwing: { value: 0.5 },
      uFoamSpeed: { value: 0.6 },
      uSparkle: { value: 0.45 },
      uFresnel: { value: 0.42 },
      uOpacityDeep: { value: 0.95 },
      uOpacityShallow: { value: 0.55 },
    },
  ]);
  // UniformsUtils.merge clones values; hand the texture over after the clone.
  uniforms.uShore.value = shoreTex;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    fog: true,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.position.y = y;
  mesh.receiveShadow = false;   // toon shadows on flat water read as dirt
  mesh.castShadow = false;
  mesh.renderOrder = 0;

  /**
   * @param {object} frame  timeOfDay() frame; uses sunDir, sunColor, skyMid.
   * @param {number} simTime deterministic seconds from the renderer rig.
   */
  function update(frame, simTime) {
    if (frame) {
      const d = frame.sunDir;
      _sunDir.set(d[0], d[1], d[2]).normalize();
      uniforms.uSunDir.value.copy(_sunDir);
      uniforms.uSunColor.value.setHex(frame.sunColor);
      uniforms.uSky.value.setHex(frame.skyMid);
      // Water carries the hour without leaving the teal plies: each ply is
      // nudged a fraction toward the sky so dusk water goes lavender-teal,
      // never gray and never black.
      _c0.setHex(frame.skyMid);
      uniforms.uDeep.value.setHex(PAPER.tealD).lerp(_c0, 0.10);
      uniforms.uMid.value.setHex(PAPER.teal).lerp(_c0, 0.12);
      uniforms.uShallow.value.setHex(PAPER.tealL).lerp(_c0, 0.14);
      _c0.setHex(frame.fogColor);
      uniforms.uEdge.value.setHex(PAPER.cream).lerp(_c0, 0.25);
      uniforms.uFoam.value.setHex(PAPER.white).lerp(_c0, 0.15);
    }
    uniforms.uTime.value = simTime;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    shoreTex.dispose();
  }

  return { mesh, update, dispose };
}
