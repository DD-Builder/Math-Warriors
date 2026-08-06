/**
 * Papercut water — the ocean around the island, plus inland pools.
 *
 * This is a star feature, so it is built like one: a single hand-written
 * ShaderMaterial that produces layered cut-paper depth plies, a swash band that
 * follows the real coastline, a second run-up line that advances and retreats,
 * analytic wave crests with crest foam, papercut sun glitter, and a fake
 * refraction that reads as sand-through-water — all inside the tech law (three
 * r170 only, no post-processing, no depth-texture reads, no fwidth).
 *
 * ── WHY a baked shore/bed texture instead of the usual depth-buffer trick ────
 * Reading the depth texture is forbidden (SwiftShader parity for the
 * screenshot harness, plus a second pass we cannot afford on an iPad). But
 * heightfield.sampleHeight() is a pure function, so we bake ONE RGBA8 texture
 * at build time that is strictly better than a depth buffer:
 *
 *   A   signed distance to the waterline, in metres (negative = open water).
 *   RGB the seabed / beach colour at that texel, in LINEAR working space.
 *
 * The alpha channel is what every shoreline effect keys on — depth plies, both
 * foam lines, wave taper — so all of them follow the *actual* coast contour
 * rather than a circle or a screen-space guess. The RGB channel is the
 * refraction: instead of sampling the scene we blend the water toward the bed
 * colour it is standing on, which is what "you can see the sand through it"
 * physically is. One fetch, both jobs.
 *
 * The bake is 512x512 over a 512 m footprint (1 m/texel) and costs ONE
 * sampleHeight per texel — the shore gradient comes from the grid's own
 * neighbours instead of five extra samples per texel. That is 262 k samples,
 * i.e. *cheaper* than the 256x256 shoreDistance() bake it replaces while
 * carrying four times the shoreline precision. Outside the footprint
 * clamp-to-edge yields deep ocean, which is exactly right.
 *
 * ── WHY the ocean is a polar disc, not a plane ──────────────────────────────
 * A uniform grid spends its vertices where nothing happens (open water) and
 * starves the only place that needs them (the coastal band, where the water
 * sheet physically slides up the sand during run-up). A disc with rings graded
 * so ~70% of them land between r=135 and r=245 gives ~1.3 m spacing exactly at
 * the waterline for 28 k triangles — a quarter of what an equivalent plane
 * would cost, with three times the resolution where it shows.
 *
 * ── WHY the wave field is evaluated twice ───────────────────────────────────
 * The vertex shader displaces with the two long swells only (100 m+
 * wavelengths, well sampled by the mesh). The fragment shader re-evaluates the
 * full five-wave sum analytically to get the surface normal, the crest mask and
 * the glitter — detail at 12-27 m wavelengths that the mesh could never carry.
 * Both share ONE set of GLSL wave constants (MW_WAVES) so the geometry and the
 * shading can never drift apart. The slope is the analytic derivative of the
 * same sum: no fwidth, no normal attribute, no derivative instructions at all.
 *
 * ── Palette law ─────────────────────────────────────────────────────────────
 * Every colour resolves from PAPER: tealD -> teal -> tealL -> cream plies,
 * white foam, cream glitter, sand/tealD seabed. Nothing is darkened toward
 * black or grey; the only shading is a teal-family tint.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth reads, no
 * derivative tricks, no per-frame allocation in update(), dispose() releases
 * every geometry, material and texture this module creates.
 */
import * as THREE from 'three';
import { PAPER } from '../config.js';
import { WORLD } from './worldSpec.js';
import { papercutMaterial } from './materials/toon.js';
import { paperFiber } from './materials/textures.js';

// ── Ocean footprint ─────────────────────────────────────────────────────
//
// The disc RIDES THE CAMERA in x/z, exactly as the sky dome does, and that is
// not an optimisation — it is the only way the sea has a horizon. A world-fixed
// sheet has a rim, and from a beach at r=184 the rim of a 340 m sheet sits 156 m
// away, which is 5.5 deg BELOW the true horizon and only ~67% hazed: a visible
// teal band that stops in mid-air with sky above it. Following the camera pins
// the rim at a constant 440 m, where the fog is total (extinction > 0.99) and
// the seam is 2 deg below a horizon nobody can find.
//
// 440 also has to clear two other contracts: it must stay inside the camera far
// plane (600) and INSIDE the sky dome, which is itself camera-following at 480.
const DISC_RADIUS = 440;
const DISC_SPOKES = 128;
const DISC_RINGS = 112;
// Rings are graded by distance FROM THE CAMERA, which is where the detail is
// needed: whatever the eye is near, the run-up sheet and the wave silhouette
// want ~1.3 m spacing, and everything past 200 m is inside the haze.
const NEAR_END = 90;
const MID_END = 200;
const RING_FRAC_NEAR = 0.62;
const RING_FRAC_MID = 0.20;

// ── Baked shore/bed texture ─────────────────────────────────────────────
const SHORE_RES = 512;
const SHORE_SPAN = 512;      // metres covered by the bake, centred on origin
const SHORE_RANGE = 30;      // metres either side of the waterline encoded in A
const SHORE_GRAD_STEP = 2;   // texels used for the shore gradient (2 m)
const SEABED_DEPTH = 9;      // matches terrainMesh's seabed ramp
const SEABED_MIX = 0.65;

// ── Inland pools ────────────────────────────────────────────────────────
// Authored sites, verified against the shipped heightfield: each is the
// flattest patch of its biome, so the fitted surface never has to sit more
// than about a metre above the ground it covers. `radius` is the mean deckle
// radius; the real outline wobbles +-17% around it.
export const POND_SITES = [
  // Garden: 15 m off the spawn point and dead on the establishing shot's view
  // axis, so the first thing a five-year-old sees has something in the middle
  // distance that catches the sky.
  { id: 'garden-pool', biome: 'garden', x: -8, z: 154, radius: 7.5, seed: 0x51a7 },
  // Library: a spring on the flat shelf above the canyon rim.
  { id: 'library-pool', biome: 'library', x: -95, z: 139, radius: 4.5, seed: 0x2c9f },
];
// Relief a paper bank can swallow before it starts to read as a retaining wall.
const POND_MAX_SPAN = 2.2;
const POND_SPOKES = 72;
// Ring parameter stops. Extra density near the rim, where every ply edge and
// the foam lace live.
const POND_RINGS = [0, 0.34, 0.62, 0.82, 0.94, 1.0];
const POND_RIM_WOBBLE = 0.17;
const POND_SKIRT_DROP = 0.55;   // how far the bank skirt sinks below the ground

const _sunDir = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** Integer hash -> [0,1). Local copy: the heightfield's noise stream is its own. */
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** PAPER int -> linear working-space rgb triple (what the shader mixes in). */
function linearRGB(hex) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

// ────────────────────────────────────────────────────────────────────────
// Bake
// ────────────────────────────────────────────────────────────────────────

/**
 * Bake the shore field and the seabed colour into one RGBA8 texture.
 *
 * @returns {{ texture: THREE.DataTexture, sd: Float32Array, res: number,
 *             min: number, span: number }}
 *          `sd` is the raw signed distance grid, kept only long enough for the
 *          ocean geometry to read its per-vertex taper out of it.
 */
function bakeShoreField(heightfield, res, span, waterY) {
  const { sampleHeight } = heightfield;
  const half = span / 2;
  const step = span / res;
  const h = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    const row = j * res;
    for (let i = 0; i < res; i++) {
      h[row + i] = sampleHeight(-half + (i + 0.5) * step, z) - waterY;
    }
  }

  // Signed distance ≈ height / |gradient|, the same first-order estimate
  // heightfield.shoreDistance() makes — but read off the grid we already have.
  // A two-texel (4 m) central difference, not one: at 1 m spacing the
  // single-texel gradient carries enough relief noise to make the foam contour
  // fizz, and the foam band is the one thing that must read as a clean cut.
  const sd = new Float32Array(res * res);
  const e = SHORE_GRAD_STEP;
  const inv2e = 1 / (2 * e * step);
  const cl = (v) => (v < 0 ? 0 : v > res - 1 ? res - 1 : v);
  for (let j = 0; j < res; j++) {
    const row = j * res;
    const rowU = cl(j - e) * res;
    const rowD = cl(j + e) * res;
    for (let i = 0; i < res; i++) {
      const gx = (h[row + cl(i + e)] - h[row + cl(i - e)]) * inv2e;
      const gz = (h[rowD + i] - h[rowU + i]) * inv2e;
      const g = Math.max(0.05, Math.sqrt(gx * gx + gz * gz));
      sd[row + i] = h[row + i] / g;
    }
  }

  // RGB: the bed the water stands on. Sand in the shallows fading to deep teal
  // as the shelf drops away — the same two papers terrainMesh paints the
  // submerged shelf with, so water and land agree about the seabed.
  const SAND = linearRGB(PAPER.sand);
  const DEEP = linearRGB(PAPER.tealD);
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    const row = j * res;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * step;
      const t = smoothstep(0, SEABED_DEPTH, -h[row + i]) * SEABED_MIX;
      // Low-frequency mottle so the bed is paper, not a flat fill.
      const mot = 1 + (valueNoise(x * 0.055, z * 0.055, 0x1d7b) - 0.5) * 0.13;
      const o = (row + i) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (SAND[c] + (DEEP[c] - SAND[c]) * t) * mot;
        data[o + c] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
      }
      const u = (sd[row + i] + SHORE_RANGE) / (2 * SHORE_RANGE);
      data[o + 3] = u <= 0 ? 0 : u >= 1 ? 255 : (u * 255 + 0.5) | 0;
    }
  }

  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'water-shore-bed';
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { texture: tex, sd, res, min: -half, span };
}

/** Bilinear read out of the raw signed-distance grid, in metres. */
function sampleSd(field, x, z) {
  const { sd, res, min, span } = field;
  const fx = ((x - min) / span) * res - 0.5;
  const fz = ((z - min) / span) * res - 0.5;
  const cl = (v) => (v < 0 ? 0 : v > res - 1 ? res - 1 : v);
  const i0 = Math.floor(fx), j0 = Math.floor(fz);
  const tx = fx - i0, tz = fz - j0;
  const i1 = cl(i0 + 1), j1 = cl(j0 + 1);
  const a = sd[cl(j0) * res + cl(i0)], b = sd[cl(j0) * res + i1];
  const c = sd[j1 * res + cl(i0)], d = sd[j1 * res + i1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

// ────────────────────────────────────────────────────────────────────────
// GLSL
// ────────────────────────────────────────────────────────────────────────

/**
 * The wave field, shared verbatim by both stages.
 *
 * Each wave is `vec4( kx, kz, relativeAmplitude, speed )`; k is a wave VECTOR
 * in radians per metre, so |k| fixes the wavelength and its direction fixes the
 * heading. The first two are the swell (102 m and 122 m) and are the only ones
 * the geometry carries; the last three are shading detail (27 m, 22 m, 12 m).
 *
 * `sharp` crest-shapes a wave by squaring its raised sine: peaks narrow,
 * troughs broaden — the cheap stand-in for a Gerstner wave that needs no
 * horizontal displacement (and therefore can never shove the water sheet
 * sideways onto dry land). Its exact derivative is carried along in the same
 * call so the analytic slope can never disagree with the height.
 */
const WAVE_GLSL = /* glsl */`
  const vec4 MW_W0 = vec4( 0.0550,  0.0280, 1.000, 0.55);
  const vec4 MW_W1 = vec4(-0.0210,  0.0470, 0.820, 0.41);
  const vec4 MW_W2 = vec4( 0.1900, -0.1050, 0.260, 1.05);
  const vec4 MW_W3 = vec4(-0.1550, -0.2250, 0.190, 1.35);
  const vec4 MW_W4 = vec4( 0.4300,  0.2950, 0.075, 2.00);

  void mwWave(vec4 w, vec2 p, float t, float amp, float sharp,
              inout float h, inout vec2 grad) {
    float ph = dot(p, w.xy) + t * w.w;
    float s = sin(ph);
    float c = cos(ph);
    float u = s * 0.5 + 0.5;
    float val = mix(s, 2.0 * u * u - 1.0, sharp);
    float dv  = mix(c, 2.0 * u * c, sharp);
    float a = w.z * amp;
    h += a * val;
    grad += w.xy * (a * dv);
  }

  // The two long swells — everything the mesh is dense enough to carry.
  float mwSwell(vec2 p, float t, float amp, inout vec2 grad) {
    float h = 0.0;
    mwWave(MW_W0, p, t, amp, 1.0, h, grad);
    mwWave(MW_W1, p, t, amp, 1.0, h, grad);
    return h;
  }
`;

/**
 * Run-up phase shaping, shared by both stages so the foam line and the water
 * sheet that carries it move as one thing.
 *
 * A wave runs UP the beach fast and drains back slowly. A sine would give the
 * same time to both and read as breathing; this gives 22% of the cycle to the
 * rush and the remaining two thirds to the drain.
 */
const RUNUP_GLSL = /* glsl */`
  float mwRunup(float t, float speed, float jitter) {
    float rp = fract(t * speed + jitter);
    float adv = smoothstep(0.0, 0.22, rp);
    float ret = smoothstep(0.34, 1.0, rp);
    return adv * (1.0 - ret);
  }
`;

const NOISE_GLSL = /* glsl */`
  float mwHash21(vec2 p) {
    p = fract(p * vec2(127.31, 311.7));
    p += dot(p, p + 34.71);
    return fract(p.x * p.y);
  }

  // Smooth value noise over the hash: no texture fetch, no mip selection, no
  // derivatives — bit-identical on SwiftShader and on the iPad.
  float mwNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = mwHash21(i);
    float b = mwHash21(i + vec2(1.0, 0.0));
    float c = mwHash21(i + vec2(0.0, 1.0));
    float d = mwHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`;

const WATER_VERT = /* glsl */`
  ${WAVE_GLSL}
  ${RUNUP_GLSL}

  #ifdef MW_SHORE_TEX
    // Vertex texture fetch, not a baked attribute: the ocean mesh slides with
    // the camera, so a vertex's world position — and therefore its distance to
    // the coast — changes every frame. One LOD-0 fetch from a mip-less texture
    // is the whole cost, and WebGL2 guarantees 16 vertex texture units.
    uniform sampler2D uShore;
    uniform float uShoreRange;
    uniform vec2 uShoreMin;
    uniform vec2 uShoreSize;
  #else
    // A pool never moves, so its rim distance is baked straight into the fan.
    attribute float aShore;
  #endif

  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uRunupSpeed;
  uniform float uRunupLift;
  uniform float uTaperIn;
  uniform float uTaperOut;

  varying vec3 vWorld;
  varying float vShore;

  #include <fog_pars_vertex>

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 P = wp.xz;
    #ifdef MW_SHORE_TEX
      float sd = texture2D(uShore, (P - uShoreMin) / uShoreSize).a
        * (2.0 * uShoreRange) - uShoreRange;
    #else
      float sd = aShore;
    #endif
    vShore = sd;

    // Swell dies as the water shoals: a full-amplitude swell at the waterline
    // would saw the beach in half every cycle.
    float taper = 1.0 - smoothstep(uTaperOut, uTaperIn, sd);

    vec2 grad = vec2(0.0);
    float h = mwSwell(P, uTime, uWaveAmp * taper, grad);

    // Run-up: the whole sheet slides up the sand and drains back. This is what
    // makes the second foam line read as WATER moving rather than as a texture
    // scrolling, and it is only affordable because the disc puts its vertices
    // exactly here (see the header).
    float shaped = mwRunup(uTime, uRunupSpeed, 0.0);
    float nearShore = 1.0 - smoothstep(0.0, 5.0, abs(sd + 1.0));
    h += uRunupLift * shaped * nearShore * (1.0 - smoothstep(0.4, 1.2, sd));

    wp.y += h;
    vWorld = wp.xyz;

    gl_Position = projectionMatrix * viewMatrix * wp;

    #include <fog_vertex>
  }
`;

const WATER_FRAG = /* glsl */`
  ${WAVE_GLSL}
  ${RUNUP_GLSL}
  ${NOISE_GLSL}

  #ifdef MW_SHORE_TEX
    uniform sampler2D uShore;
    uniform float uShoreRange;
    uniform vec2 uShoreMin;
    uniform vec2 uShoreSize;
  #else
    uniform vec3 uBedDeep;
    uniform vec3 uBedShallow;
  #endif

  uniform sampler2D uFiber;
  uniform float uFiberScale;
  uniform float uFiberAmt;

  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uDetailAmp;
  uniform float uWaveTotal;
  uniform float uTaperIn;
  uniform float uTaperOut;

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uEdge;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunUp;

  uniform vec3 uPly;          // shore distances of the three ply edges
  uniform float uPlyBlend;    // half-width of a ply transition (metres)
  uniform float uPlyTear;     // contour wander, metres
  uniform float uLip;         // brightness of the cut-paper edge highlight
  uniform float uLipWidth;

  uniform float uFoamCenter;
  uniform float uFoamWidth;
  uniform float uFoamSwing;
  uniform float uFoamSpeed;
  uniform float uRunupSpeed;
  uniform float uRunupOut;
  uniform float uRunupIn;
  uniform float uRunupWidth;

  uniform float uCrest;
  uniform vec2 uCrestSlope;
  uniform float uGlitter;
  uniform float uGlitterScale;
  uniform float uFresnel;
  uniform float uRefract;
  uniform float uRefractWobble;
  uniform float uOpacityDeep;
  uniform float uOpacityShallow;

  varying vec3 vWorld;
  varying float vShore;

  #include <fog_pars_fragment>

  void main() {
    vec2 P = vWorld.xz;

    // ── Wave field, re-evaluated at full detail ──────────────────────────
    // The mesh only carries the two swells; the normal, the crest mask and the
    // glitter all want the 12-27 m ripples too, and analytically re-summing
    // five sines is far cheaper than the geometry that would carry them.
    float taperGuess = 1.0 - smoothstep(uTaperOut, uTaperIn, vShore);
    vec2 grad = vec2(0.0);
    float h = mwSwell(P, uTime, uWaveAmp * taperGuess, grad);
    mwWave(MW_W2, P, uTime, uDetailAmp * taperGuess, 0.35, h, grad);
    mwWave(MW_W3, P, uTime, uDetailAmp * taperGuess, 0.35, h, grad);
    mwWave(MW_W4, P, uTime, uDetailAmp * taperGuess, 0.0,  h, grad);

    // ── Shore field + seabed colour ──────────────────────────────────────
    // Refraction-lite: displace the LOOKUP by the wave slope. Nothing is
    // sampled from the framebuffer or the depth buffer — the bed colour comes
    // out of the bake — but the bed wobbles with the waves the way it does
    // through real water, and so do the foam contours riding on the same sd.
    vec2 wob = grad * uRefractWobble;
    #ifdef MW_SHORE_TEX
      vec4 S = texture2D(uShore, (P + wob - uShoreMin) / uShoreSize);
      float sd = S.a * (2.0 * uShoreRange) - uShoreRange;
      vec3 bed = S.rgb;
    #else
      // A pool has no bake: its shore distance is the geometry's own distance
      // in from the deckle rim, and the same wave slope shifts it so the plies
      // and the foam ripple instead of sitting still.
      float sd = vShore + dot(wob, vec2(0.7071, 0.7071));
      vec3 bed = mix(uBedDeep, uBedShallow, smoothstep(uPly.x, 0.0, sd));
    #endif

    // ── Depth plies ──────────────────────────────────────────────────────
    // Four papers, their edges pinned to fixed shore distances so they read as
    // concentric cut-paper rings around the island rather than a gradient that
    // slides when the camera moves. The boundary is torn, not machined: a
    // low-frequency noise offset before quantising is the deckle edge.
    float tear = (mwNoise(P * 0.085) - 0.5) * uPlyTear
      + (mwNoise(P * 0.31) - 0.5) * uPlyTear * 0.35;
    float sdT = sd + tear;
    float w = uPlyBlend;
    vec3 col = uDeep;
    col = mix(col, uMid,     smoothstep(uPly.x - w, uPly.x + w, sdT));
    col = mix(col, uShallow, smoothstep(uPly.y - w, uPly.y + w, sdT));
    col = mix(col, uEdge,    smoothstep(uPly.z - w, uPly.z + w, sdT));

    // Cut-paper lift: a hairline of the lighter sheet along every ply edge, as
    // if each layer were floating a millimetre above the one below it.
    float lip = (1.0 - smoothstep(0.0, uLipWidth, abs(sdT - uPly.x)))
      + (1.0 - smoothstep(0.0, uLipWidth, abs(sdT - uPly.y)))
      + (1.0 - smoothstep(0.0, uLipWidth, abs(sdT - uPly.z)));
    col = mix(col, uFoam, clamp(lip, 0.0, 1.0) * uLip);

    // Sand through water: the shallower it gets, the more the bed shows.
    float shal = smoothstep(uPly.x, 0.0, sd);
    col = mix(col, bed, shal * shal * uRefract);

    // ── Foam ─────────────────────────────────────────────────────────────
    float wobble = mwNoise(P * 0.055 + uTime * 0.02) - 0.5;

    // 1. Swash band: a wide breathing belt of white that sits offshore and
    //    surges in. Its centre is world-keyed noise, so it is not a perfect
    //    offset curve of the coastline all the way around the island.
    float swash = uFoamCenter + uFoamSwing * sin(uTime * uFoamSpeed + wobble * 5.0);
    float band = 1.0 - smoothstep(0.0, uFoamWidth, abs(sdT - swash));

    // 2. Standing lip: the thin permanent crest exactly on the waterline.
    float lipLine = 1.0 - smoothstep(0.0, uRunupWidth * 1.4, abs(sdT + 0.10));

    // 3. Run-up line: the second, inner foam edge. It rushes up the sand and
    //    drains back on the same clock the vertex shader lifts the sheet with,
    //    and it drags a thin wet sheet behind it.
    float shaped = mwRunup(uTime, uRunupSpeed, wobble * 0.30);
    float ru = mix(uRunupOut, uRunupIn, shaped);
    float runLine = 1.0 - smoothstep(0.0, uRunupWidth, abs(sdT - ru));
    float trail = (1.0 - smoothstep(0.0, 2.4, ru - sdT))
      * (1.0 - smoothstep(0.0, 0.25, sdT - ru));

    float foam = band * 0.62 + lipLine * 0.80 + runLine * 0.95 + trail * 0.30 * shaped;
    // Foam belongs to water. It may climb a little way past the waterline —
    // that is precisely what the lifted sheet is for — then it is gone.
    foam *= 1.0 - smoothstep(0.55, 1.35, sd);
    // Lace the edge so the band is torn paper, not an airbrush.
    foam *= 0.42 + 0.58 * mwNoise(P * 1.55 + uTime * 0.11);
    foam = clamp(foam, 0.0, 1.0);

    // 4. Crest foam: where the analytic slope is steep AND the surface is near
    //    the top of its travel, i.e. exactly on the face of a breaking wave.
    //    Computed from the wave functions themselves — no fwidth, no depth.
    float slope = length(grad);
    float hN = h / max(uWaveTotal, 1e-4);
    float crest = smoothstep(uCrestSlope.x, uCrestSlope.y, slope)
      * smoothstep(0.05, 0.55, hN);
    crest = smoothstep(0.22, 0.58, crest * (0.55 + 0.60 * mwNoise(P * 0.5 + uTime * 0.16)));
    crest *= 1.0 - smoothstep(-6.0, -1.0, sd);   // inshore, the swash owns it
    foam = clamp(foam + crest * uCrest, 0.0, 1.0);

    col = mix(col, uFoam, foam);

    // ── Sky, glitter ─────────────────────────────────────────────────────
    vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    col = mix(col, uSky, fres * uFresnel * (1.0 - foam));

    // Papercut sun glitter. A smooth specular smear is the one thing water
    // must not do here, so the sparkle is a lattice of HARD little diamonds,
    // each with its own size and its own on/off blink, multiplied by the
    // half-vector lobe — which is what confines them to a band running from
    // the sun toward the eye.
    vec3 H = normalize(normalize(uSunDir) + V);
    float lobe = pow(max(dot(N, H), 0.0), 26.0);
    vec2 gp = P * uGlitterScale + vec2(uTime * 0.25, uTime * -0.16);
    vec2 cid = floor(gp);
    vec2 gf = fract(gp) - 0.5;
    float r1 = mwHash21(cid);
    float r2 = mwHash21(cid + vec2(17.3, 5.1));
    float sz = 0.09 + 0.20 * r1;
    float dia = abs(gf.x) + abs(gf.y);
    float spark = 1.0 - smoothstep(sz * 0.7, sz, dia);
    float blink = step(0.52, fract(r2 + uTime * (0.55 + 0.9 * r1)));
    col += uSunColor * spark * blink * lobe * uGlitter * uSunUp * (1.0 - foam);

    // ── Paper ────────────────────────────────────────────────────────────
    // The world's fibre field, projected top-down and keyed to WORLD metres so
    // it is continuous with the terrain's own grain across the waterline.
    vec3 fib = texture2D(uFiber, P * uFiberScale).rgb;
    col *= 1.0 + (fib - vec3(0.5)) * uFiberAmt;

    // ── Alpha ────────────────────────────────────────────────────────────
    // Shallows stay see-through so the real beach shows under the sheet;
    // grazing angles and foam go opaque so the horizon is a clean paper edge.
    // smoothstep edges must stay ascending — edge0 > edge1 is undefined GLSL.
    float a = mix(uOpacityDeep, uOpacityShallow, smoothstep(uPly.x, -0.6, sd));
    a = clamp(max(a, fres * 0.85) + foam * 0.55, 0.0, 1.0);
    a *= 1.0 - smoothstep(0.5, 1.3, sd);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ────────────────────────────────────────────────────────────────────────
// Geometry
// ────────────────────────────────────────────────────────────────────────

/**
 * Ocean disc: rings graded fine near the eye, coarse out toward the haze.
 *
 * The spokes wrap by re-using each ring's first vertex, so the seam is exact
 * and the jitter that breaks the polar grid cannot open it. Nothing here is
 * world-anchored — the mesh rides the camera, and every world-space quantity
 * (shore distance, wave phase, foam) is looked up from the world position the
 * vertex happens to land on.
 */
function buildOceanDisc() {
  const radii = new Float64Array(DISC_RINGS + 1);
  const nNear = Math.round(DISC_RINGS * RING_FRAC_NEAR);
  const nMid = Math.round(DISC_RINGS * RING_FRAC_MID);
  const nFar = DISC_RINGS - nNear - nMid;
  let k = 0;
  for (let i = 0; i < nNear; i++) radii[k++] = (NEAR_END * i) / nNear;
  for (let i = 0; i < nMid; i++) radii[k++] = NEAR_END + ((MID_END - NEAR_END) * i) / nMid;
  for (let i = 0; i <= nFar; i++) radii[k++] = MID_END + ((DISC_RADIUS - MID_END) * i) / nFar;

  const S = DISC_SPOKES;
  const R = DISC_RINGS;
  const vertCount = 1 + R * S;              // centre + one loop per ring
  const pos = new Float32Array(vertCount * 3);

  pos[0] = 0; pos[1] = 0; pos[2] = 0;

  const dTheta = (Math.PI * 2) / S;
  for (let r = 1; r <= R; r++) {
    const rad = radii[r];
    // Local spacing sets the jitter budget; the outermost ring stays exact so
    // the horizon rim is a clean circle.
    const spanR = (radii[Math.min(R, r + 1)] - radii[r - 1]) * 0.5;
    const amp = r === R ? 0 : 0.3;
    for (let s = 0; s < S; s++) {
      const v = 1 + (r - 1) * S + s;
      const jr = (hash2(r, s, 0x51ed) - 0.5) * 2 * amp * spanR;
      const jt = (hash2(r, s, 0x2f13) - 0.5) * 2 * amp * dTheta;
      const th = s * dTheta + jt;
      const rr = rad + jr;
      pos[v * 3] = Math.cos(th) * rr;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = Math.sin(th) * rr;
    }
  }

  const triCount = S + (R - 1) * S * 2;
  const idx = new Uint32Array(triCount * 3);
  let t = 0;
  for (let s = 0; s < S; s++) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % S);
    idx[t++] = 0; idx[t++] = a; idx[t++] = b;
  }
  for (let r = 1; r < R; r++) {
    const base0 = 1 + (r - 1) * S;
    const base1 = 1 + r * S;
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S;
      const a = base0 + s, b = base0 + s1, c = base1 + s, d = base1 + s1;
      idx[t++] = a; idx[t++] = c; idx[t++] = d;
      idx[t++] = a; idx[t++] = d; idx[t++] = b;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = DISC_RADIUS + 4;   // waves lift past the plane
  return { geo, triangleCount: triCount };
}

/**
 * Deckle outline radius at a bearing. Three harmonics with hashed phases: a
 * closed, smooth, obviously hand-cut curve — a pond must never be a circle.
 */
function rimRadius(radius, theta, seed) {
  const p1 = hash2(1, 0, seed) * Math.PI * 2;
  const p2 = hash2(2, 0, seed) * Math.PI * 2;
  const p3 = hash2(3, 0, seed) * Math.PI * 2;
  const v = 0.56 * Math.sin(3 * theta + p1)
    + 0.30 * Math.sin(5 * theta + p2)
    + 0.14 * Math.sin(8 * theta + p3);
  return radius * (1 + POND_RIM_WOBBLE * v);
}

/**
 * Fit a pool to the ground: its surface must clear the highest point it
 * covers, or terrain would poke through the sheet.
 *
 * Returns null when the site is too broken to hold water quietly (more than
 * `maxSpan` of relief), which is the honest answer for most of this island —
 * better no pond than a paper tank sunk into a hillside.
 */
function fitPond(heightfield, site, maxSpan) {
  const { sampleHeight } = heightfield;
  const R = site.radius * 1.25;
  let lo = Infinity, hi = -Infinity;
  const N = 28;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = site.x - R + ((i + 0.5) * 2 * R) / N;
      const z = site.z - R + ((j + 0.5) * 2 * R) / N;
      const dx = x - site.x, dz = z - site.z;
      if (dx * dx + dz * dz > R * R) continue;
      const h = sampleHeight(x, z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (!(hi > lo) || hi - lo > maxSpan) return null;
  if (lo < WORLD.WATER_Y + 1) return null;    // not an inland pool
  return { ...site, level: hi + 0.06, floor: lo, span: hi - lo };
}

/**
 * Which authored pools this terrain can actually hold, with their fitted
 * surface heights. Pure, deterministic and cheap (~1.5 k height samples), so
 * scattering code can call it to punch its clearings without building — or
 * even importing the geometry of — the water itself.
 *
 * @returns {Array<{id:string, biome:string, x:number, z:number, radius:number,
 *                  level:number, floor:number, span:number}>}
 */
export function resolvePonds(heightfield) {
  const out = [];
  for (const site of POND_SITES) {
    const fit = fitPond(heightfield, site, POND_MAX_SPAN);
    if (fit) out.push(fit);
  }
  return out;
}

/** Pool surface: a deckle-edged fan whose aShore is the distance in from the rim. */
function buildPondSurface(pond) {
  const S = POND_SPOKES;
  const rings = POND_RINGS;
  const nR = rings.length;
  const vertCount = 1 + (nR - 1) * S;
  const pos = new Float32Array(vertCount * 3);
  const shore = new Float32Array(vertCount);
  pos[0] = 0; pos[1] = 0; pos[2] = 0;
  shore[0] = -pond.radius;

  const dTheta = (Math.PI * 2) / S;
  for (let r = 1; r < nR; r++) {
    const tR = rings[r];
    for (let s = 0; s < S; s++) {
      const th = s * dTheta;
      const rk = rimRadius(pond.radius, th, pond.seed);
      const v = 1 + (r - 1) * S + s;
      pos[v * 3] = Math.cos(th) * rk * tR;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = Math.sin(th) * rk * tR;
      shore[v] = -(1 - tR) * rk;
    }
  }

  const triCount = S + (nR - 2) * S * 2;
  const idx = new Uint16Array(triCount * 3);
  let t = 0;
  for (let s = 0; s < S; s++) {
    idx[t++] = 0; idx[t++] = 1 + s; idx[t++] = 1 + ((s + 1) % S);
  }
  for (let r = 1; r < nR - 1; r++) {
    const b0 = 1 + (r - 1) * S, b1 = 1 + r * S;
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S;
      idx[t++] = b0 + s; idx[t++] = b1 + s; idx[t++] = b1 + s1;
      idx[t++] = b0 + s; idx[t++] = b1 + s1; idx[t++] = b0 + s1;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, triangleCount: triCount };
}

/**
 * Pool bank: a skirt of paper hanging from the waterline down past the ground.
 *
 * Without it the sheet's edge is a hard cut floating over the grass wherever
 * the ground dips. The skirt's bottom edge follows the real terrain and then
 * sinks half a metre further, so the seam is always buried; its top is damp
 * sand and its bottom is the teal-family shadow the papercut law asks for.
 */
function buildPondBank(heightfield, pond) {
  const S = POND_SPOKES;
  const pos = new Float32Array(S * 2 * 3);
  const col = new Float32Array(S * 2 * 3);
  const TOP = linearRGB(PAPER.creamD);
  const BOT = linearRGB(PAPER.tealD);
  const MID = [
    TOP[0] + (BOT[0] - TOP[0]) * 0.45,
    TOP[1] + (BOT[1] - TOP[1]) * 0.45,
    TOP[2] + (BOT[2] - TOP[2]) * 0.45,
  ];
  const dTheta = (Math.PI * 2) / S;
  for (let s = 0; s < S; s++) {
    const th = s * dTheta;
    const rk = rimRadius(pond.radius, th, pond.seed);
    const cx = Math.cos(th), cz = Math.sin(th);
    // Top ring: the damp lip, a hair under the waterline so the sheet's own
    // edge never shows as a cut.
    const a = s * 3;
    pos[a] = cx * rk;
    pos[a + 1] = -0.04;
    pos[a + 2] = cz * rk;
    col[a] = TOP[0] * 0.35 + MID[0] * 0.65;
    col[a + 1] = TOP[1] * 0.35 + MID[1] * 0.65;
    col[a + 2] = TOP[2] * 0.35 + MID[2] * 0.65;

    // Bottom ring: flared outward and sunk below the real ground, so the seam
    // between paper and terrain is buried whichever way the ground falls.
    const ox = pond.x + cx * (rk + 0.5), oz = pond.z + cz * (rk + 0.5);
    const ground = heightfield.sampleHeight(ox, oz);
    const b = (S + s) * 3;
    pos[b] = cx * (rk + 0.5);
    pos[b + 1] = Math.min(ground, pond.level) - pond.level - POND_SKIRT_DROP;
    pos[b + 2] = cz * (rk + 0.5);
    col[b] = BOT[0]; col[b + 1] = BOT[1]; col[b + 2] = BOT[2];
  }

  const idx = new Uint16Array(S * 6);
  let t = 0;
  for (let s = 0; s < S; s++) {
    const s1 = (s + 1) % S;
    const a = s, b = s1, c = S + s, d = S + s1;
    idx[t++] = a; idx[t++] = c; idx[t++] = d;
    idx[t++] = a; idx[t++] = d; idx[t++] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, triangleCount: S * 2 };
}

// ────────────────────────────────────────────────────────────────────────
// Material
// ────────────────────────────────────────────────────────────────────────

/** Ocean tuning. Distances are METRES OF SHORE DISTANCE, negative seaward. */
const OCEAN = {
  waveAmp: 0.26,
  detailAmp: 1.35,
  taperIn: -1.2,       // swell is fully damped by here
  taperOut: -11.0,     // and fully alive by here
  ply: [-13.0, -5.5, -1.6],
  plyBlend: 0.55,
  plyTear: 1.15,
  lip: 0.16,
  lipWidth: 0.42,
  foamCenter: -1.05,
  foamWidth: 1.05,
  foamSwing: 0.62,
  foamSpeed: 0.55,
  runupSpeed: 0.17,
  runupOut: -2.6,
  runupIn: 0.62,
  runupWidth: 0.30,
  runupLift: 0.24,
  crest: 0.85,
  crestSlope: [0.13, 0.30],
  glitter: 1.15,
  glitterScale: 0.42,
  fresnel: 0.40,
  refract: 0.42,
  refractWobble: 2.6,
  opacityDeep: 0.96,
  opacityShallow: 0.52,
  fiberScale: 1 / 3.2,
  fiberAmt: 0.13,
};

/** Pool tuning: everything smaller, calmer and keyed to the pool's own radius. */
function pondTuning(radius) {
  const R = radius;
  return {
    waveAmp: 0.018,
    detailAmp: 0.10,
    taperIn: -0.25,
    taperOut: -R * 0.55,
    ply: [-R * 0.72, -R * 0.38, -R * 0.13],
    plyBlend: R * 0.055,
    plyTear: R * 0.045,
    lip: 0.20,
    lipWidth: R * 0.035,
    foamCenter: -R * 0.10,
    foamWidth: R * 0.055,
    foamSwing: R * 0.030,
    foamSpeed: 0.42,
    runupSpeed: 0.13,
    runupOut: -R * 0.12,
    runupIn: -R * 0.012,
    runupWidth: R * 0.022,
    runupLift: 0.012,
    crest: 0.35,
    crestSlope: [0.04, 0.12],
    glitter: 0.75,
    glitterScale: 0.95,
    fresnel: 0.52,
    refract: 0.55,
    refractWobble: 0.35,
    opacityDeep: 0.80,
    opacityShallow: 0.40,
    fiberScale: 1 / 1.6,
    fiberAmt: 0.16,
  };
}

/**
 * One water surface material. `shoreTex` present => the ocean path (shore
 * distance and bed colour both read from the bake); absent => the pool path
 * (shore distance from the geometry, bed colour from two uniforms).
 */
function waterMaterial(tuning, shoreTex, fiberTex, bedDeep, bedShallow) {
  const t = tuning;
  const uniforms = Object.assign(
    THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    {
      uTime: { value: 0 },
      uFiber: { value: fiberTex },
      uFiberScale: { value: t.fiberScale },
      uFiberAmt: { value: t.fiberAmt },

      uWaveAmp: { value: t.waveAmp },
      uDetailAmp: { value: t.detailAmp },
      uWaveTotal: { value: 1.82 * t.waveAmp + 0.525 * t.detailAmp },
      uTaperIn: { value: t.taperIn },
      uTaperOut: { value: t.taperOut },

      uDeep: { value: new THREE.Color(PAPER.tealD) },
      uMid: { value: new THREE.Color(PAPER.teal) },
      uShallow: { value: new THREE.Color(PAPER.tealL) },
      uEdge: { value: new THREE.Color(PAPER.cream) },
      uFoam: { value: new THREE.Color(PAPER.white) },
      uSky: { value: new THREE.Color(PAPER.sky) },
      uSunColor: { value: new THREE.Color(PAPER.cream) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      uSunUp: { value: 1 },

      uPly: { value: new THREE.Vector3(t.ply[0], t.ply[1], t.ply[2]) },
      uPlyBlend: { value: t.plyBlend },
      uPlyTear: { value: t.plyTear },
      uLip: { value: t.lip },
      uLipWidth: { value: t.lipWidth },

      uFoamCenter: { value: t.foamCenter },
      uFoamWidth: { value: t.foamWidth },
      uFoamSwing: { value: t.foamSwing },
      uFoamSpeed: { value: t.foamSpeed },
      uRunupSpeed: { value: t.runupSpeed },
      uRunupOut: { value: t.runupOut },
      uRunupIn: { value: t.runupIn },
      uRunupWidth: { value: t.runupWidth },
      uRunupLift: { value: t.runupLift },

      uCrest: { value: t.crest },
      uCrestSlope: { value: new THREE.Vector2(t.crestSlope[0], t.crestSlope[1]) },
      uGlitter: { value: t.glitter },
      uGlitterScale: { value: t.glitterScale },
      uFresnel: { value: t.fresnel },
      uRefract: { value: t.refract },
      uRefractWobble: { value: t.refractWobble },
      uOpacityDeep: { value: t.opacityDeep },
      uOpacityShallow: { value: t.opacityShallow },
    },
  );

  const defines = {};
  if (shoreTex) {
    defines.MW_SHORE_TEX = '';
    uniforms.uShore = { value: shoreTex };
    uniforms.uShoreRange = { value: SHORE_RANGE };
    uniforms.uShoreMin = { value: new THREE.Vector2(-SHORE_SPAN / 2, -SHORE_SPAN / 2) };
    uniforms.uShoreSize = { value: new THREE.Vector2(SHORE_SPAN, SHORE_SPAN) };
  } else {
    uniforms.uBedDeep = { value: new THREE.Color(bedDeep) };
    uniforms.uBedShallow = { value: new THREE.Color(bedShallow) };
  }

  return new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    fog: true,
    toneMapped: false,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Public
// ────────────────────────────────────────────────────────────────────────

/**
 * Build the ocean and any inland pools that the terrain can actually hold.
 *
 * @param {{ sampleHeight: (x:number,z:number)=>number }} heightfield
 *        from createHeightfield(). Sampled ~270 k times, once, at build.
 * @param {object} [opts]
 * @param {number} [opts.y]         ocean surface height, default WORLD.WATER_Y.
 * @param {number} [opts.shoreRes]  bake resolution, default 512.
 * @param {boolean} [opts.ponds]    build inland pools, default true.
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, ocean: THREE.Mesh,
 *             ponds: Array<object>, stats: object,
 *             update: (frame: object, simTime: number) => void,
 *             dispose: () => void }}
 */
export function createWater(heightfield, opts = {}) {
  const {
    y = WORLD.WATER_Y,
    shoreRes = SHORE_RES,
    ponds: wantPonds = true,
    camera = null,
  } = opts;

  const field = bakeShoreField(heightfield, shoreRes, SHORE_SPAN, y);
  const fiber = paperFiber();

  const group = new THREE.Group();
  group.name = 'water';

  // ── Ocean ──
  const disc = buildOceanDisc();
  const oceanMat = waterMaterial(OCEAN, field.texture, fiber);
  const ocean = new THREE.Mesh(disc.geo, oceanMat);
  ocean.name = 'ocean';
  ocean.position.y = y;
  ocean.receiveShadow = false;   // toon shadows on flat water read as dirt
  ocean.castShadow = false;
  ocean.renderOrder = 0;
  // The disc rides the camera, so it moves — but only ever in x/z, and only
  // from update(). matrixAutoUpdate stays off and update() rebuilds the matrix
  // itself; three would otherwise redo it for every one of the scene's meshes.
  ocean.matrixAutoUpdate = false;
  ocean.updateMatrix();
  group.add(ocean);

  // ── Inland pools ──
  const geometries = [disc.geo];
  const materials = [oceanMat];
  const uniformSets = [oceanMat.uniforms];
  const ponds = [];
  let triangleCount = disc.triangleCount;

  if (wantPonds) {
    // Bank paper is shared by every pool: one material, one draw call each.
    let bankMat = null;
    for (const fit of resolvePonds(heightfield)) {
      const surf = buildPondSurface(fit);
      const tune = pondTuning(fit.radius);
      const mat = waterMaterial(tune, null, fiber, PAPER.sageD, PAPER.sand);
      const mesh = new THREE.Mesh(surf.geo, mat);
      mesh.name = `pond-${fit.id}`;
      mesh.position.set(fit.x, fit.level, fit.z);
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      mesh.renderOrder = 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);

      if (!bankMat) {
        bankMat = papercutMaterial(0xffffff, {
          vertexColors: true,
          grain: 0.10,
          normal: 0.12,
          roughnessLike: 0.20,
          scale: 1.4,
          triplanar: true,
          space: 'local',
          side: THREE.DoubleSide,
        });
        materials.push(bankMat);
      }
      const bank = buildPondBank(heightfield, fit);
      const bankMesh = new THREE.Mesh(bank.geo, bankMat);
      bankMesh.name = `pond-bank-${fit.id}`;
      bankMesh.position.set(fit.x, fit.level, fit.z);
      bankMesh.receiveShadow = true;
      bankMesh.castShadow = false;
      bankMesh.matrixAutoUpdate = false;
      bankMesh.updateMatrix();
      group.add(bankMesh);

      geometries.push(surf.geo, bank.geo);
      materials.push(mat);
      uniformSets.push(mat.uniforms);
      triangleCount += surf.triangleCount + bank.triangleCount;
      ponds.push({
        id: fit.id, biome: fit.biome, x: fit.x, z: fit.z,
        radius: fit.radius, level: fit.level, mesh, bank: bankMesh,
      });
    }
  }

  const nSets = uniformSets.length;
  const stats = {
    drawCalls: group.children.length,
    triangleCount,
    pondCount: ponds.length,
    shoreTextureBytes: shoreRes * shoreRes * 4,
  };

  /**
   * Push one lighting frame into every water surface. Zero allocation.
   *
   * @param {object} frame   a timeOfDay()/weather frame: sunDir, sunColor,
   *   skyMid, fogColor, and optionally sunIntensity and night.
   * @param {number} simTime deterministic seconds from the renderer rig.
   */
  function update(frame, simTime) {
    // Keep the sea centred under the eye so its rim stays out at 440 m, buried
    // in the haze. Deliberately NOT snapped to a grid: every world-space
    // quantity the shader uses (wave phase, shore distance, foam, glitter) is
    // sampled at the vertex's world position, so sliding the tessellation
    // changes only where the surface is SAMPLED, never where it is. Snapping
    // would swap continuous sub-pixel error for a periodic jump.
    if (camera) {
      const p = camera.position;
      if (ocean.position.x !== p.x || ocean.position.z !== p.z) {
        ocean.position.x = p.x;
        ocean.position.z = p.z;
        ocean.updateMatrix();
        ocean.updateMatrixWorld(true);
      }
    }
    if (frame) {
      const d = frame.sunDir;
      _sunDir.set(d[0], d[1], d[2]).normalize();
      // Water carries the hour without ever leaving the teal plies: each ply
      // is nudged a fraction toward the sky, so dusk water goes lavender-teal
      // and never grey, never black.
      _c0.setHex(frame.skyMid);
      _c1.setHex(frame.fogColor);
      const up = Math.max(0, Math.min(1,
        (frame.sunIntensity ?? 1) * (1 - (frame.night ?? 0) * 0.8)));
      for (let i = 0; i < nSets; i++) {
        const u = uniformSets[i];
        u.uSunDir.value.copy(_sunDir);
        u.uSunColor.value.setHex(frame.sunColor);
        u.uSky.value.setHex(frame.skyMid);
        u.uSunUp.value = up;
        u.uDeep.value.setHex(PAPER.tealD).lerp(_c0, 0.10);
        u.uMid.value.setHex(PAPER.teal).lerp(_c0, 0.12);
        u.uShallow.value.setHex(PAPER.tealL).lerp(_c0, 0.14);
        u.uEdge.value.setHex(PAPER.cream).lerp(_c1, 0.25);
        u.uFoam.value.setHex(PAPER.white).lerp(_c1, 0.15);
      }
    }
    for (let i = 0; i < nSets; i++) uniformSets[i].uTime.value = simTime;
  }

  function dispose() {
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    field.texture.dispose();
    group.clear();
    ponds.length = 0;
  }

  return { group, mesh: group, ocean, ponds, stats, update, dispose };
}
