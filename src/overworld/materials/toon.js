/**
 * Papercut toon materials.
 *
 * The whole 3D world obeys the 2D game's palette law (src/config.js PAPER):
 * layered cut paper, shadows that go TEAL — never gray, never black — and no
 * dark outlines anywhere. The workhorse here is a 3-step gradient ramp whose
 * dark texel is itself teal-tinted: MeshToonMaterial multiplies incoming light
 * by the ramp texel, so shaded faces slide toward teal instead of black
 * without any shader patching (SwiftShader-safe, cheap on iPad).
 *
 * On top of that sits `papercutMaterial` / `applyPapercut`, which layer the
 * procedural surfaces from ./textures.js onto that same toon material:
 *
 *   grain          the fibre field multiplies albedo, so a surface has pigment
 *                  density instead of a single flat fill;
 *   tooth          a low-amplitude normal map, which under a THREE-STEP toon
 *                  ramp does something a smooth shader cannot — it breaks the
 *                  ramp's step boundary into a ragged fibrous edge exactly
 *                  where light grazes the surface, and is invisible everywhere
 *                  else. That is the whole trick: cheap in the flat regions,
 *                  hand-cut-looking at every silhouette of light;
 *   roughnessLike  a cavity term driven by the tooth height, tinted with the
 *                  palette's own shadow hue so micro-shading can only ever go
 *                  teal.
 *
 * WHY the normal is perturbed against an ANALYTIC basis instead of a tangent
 * frame: three's tangent-space normal mapping needs either a tangent attribute
 * on every geometry (we have none, and merged/instanced papercut geometry would
 * have to invent one) or `getTangentFrame`, which is built on dFdx/dFdy —
 * banned, because the screenshot harness runs SwiftShader and must match the
 * device pixel for pixel. So the shader builds an orthonormal basis from the
 * interpolated normal with Duff's branch-free construction (pure ALU, no
 * derivatives, no attribute) and offsets within it. For an isotropic tooth the
 * basis orientation is irrelevant, so this is not an approximation of the right
 * answer — it IS the right answer, obtained without the banned instruction.
 *
 * WHY UVs are derived in the shader from position: none of the world's
 * geometry carries UVs (terrain is vertex-coloured, props are merged primitive
 * sinks). Deriving them costs one varying pair and buys the two things the art
 * actually needs — grain that does not stretch on a cliff (a cheap two-axis
 * triplanar blend, weighted by the world normal), and grain that is continuous
 * across the 64 terrain chunk meshes because it is keyed to WORLD space rather
 * than to each chunk's local origin.
 *
 * WHY strengths are baked as GLSL literals rather than uniforms: they never
 * change at runtime, three's program cache keys on `customProgramCacheKey`
 * anyway, and a literal lets the compiler fold whole branches away — a material
 * with `normal: 0` compiles with no tooth fetch at all.
 *
 * Every patch here CHAINS: it preserves any onBeforeCompile already installed
 * (props.js patches wind and pulse before we ever see the material) and folds
 * its own cache key onto the existing one.
 */
import * as THREE from 'three';
import { PAPER } from '../../config.js';
import { paperFiber, paperTooth, cavityTint } from './textures.js';
import { applyAerialFog } from './aerialFog.js';

let _ramp = null;

/** Shared 3-step ramp: shadow texel teal-tinted, mid neutral, lit full. */
export function toonRamp() {
  if (_ramp) return _ramp;
  // RGB per step. Dark step leans teal (multiplying warm sun light by a
  // teal-ish factor = teal-shadowed paper); values chosen so nothing on
  // screen ever drops below ~30% luminance.
  const steps = [
    [0.34, 0.47, 0.47],  // shade — teal lean (from PAPER.shadow hue)
    [0.72, 0.76, 0.74],  // half  — near-neutral, slight cool
    [1.00, 1.00, 1.00],  // lit
  ];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((s, i) => {
    data[i * 4 + 0] = Math.round(s[0] * 255);
    data[i * 4 + 1] = Math.round(s[1] * 255);
    data[i * 4 + 2] = Math.round(s[2] * 255);
    data[i * 4 + 3] = 255;
  });
  _ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  _ramp.minFilter = THREE.NearestFilter;
  _ramp.magFilter = THREE.NearestFilter;
  _ramp.generateMipmaps = false;
  _ramp.needsUpdate = true;
  return _ramp;
}

/**
 * Standard papercut surface. `color` is a PAPER palette int (0xRRGGBB).
 * Optional: { flatShading, vertexColors, transparent, opacity, side }.
 */
export function toonMaterial(color, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonRamp(),
    fog: true,
    ...opts,
  });
  // Every lit surface in the world is born here, so this is the one place the
  // aerial-perspective atmosphere (./aerialFog.js) has to be hooked up for
  // terrain, props, vegetation and the hero to share one sky. Materials built
  // elsewhere (the handful of MeshBasicMaterial banners and the water shader)
  // are swept once at assembly time by applyAerialFogToTree.
  return applyAerialFog(mat);
}

/** Convert a PAPER int to a THREE.Color (convenience for lights/fog/sky). */
export function paperColor(colorInt) {
  return new THREE.Color(colorInt);
}

// ── Papercut surface patch ──────────────────────────────────────────────

/** GLSL float literal (never emits an int — "1" would fail to compile). */
const g = (n) => Number(n).toFixed(5);
const g3 = (v) => `vec3( ${g(v[0])}, ${g(v[1])}, ${g(v[2])} )`;

/**
 * Papercut surface defaults. Every amplitude is small on purpose: the goal is
 * a surface a five-year-old registers as *made of paper*, not a surface they
 * register as *noisy*. If you find yourself raising `grain` past ~0.12 the
 * problem is almost certainly lighting, not texture.
 */
export const PAPERCUT_DEFAULTS = {
  grain: 0.065,        // albedo multiply, +-6.5%
  normal: 0.10,        // tooth normal offset in the tangent plane
  roughnessLike: 0.18, // cavity shading pulled from the tooth height
  scale: 3.0,          // WORLD METRES per texture tile
  triplanar: true,     // blend a top-down and a diagonal side projection
  space: 'world',      // 'world' (static geometry) | 'local' (moving/instanced)
};

// Cavity multiplier, derived from PAPER.shadow — teal-leaning, never grey.
const CAVITY = cavityTint();

/**
 * Build the vertex-shader additions.
 *
 * World space is anchored at `<project_vertex>` so `transformed` is already
 * final (wind patches insert right after `<begin_vertex>`, which runs earlier)
 * and the instance matrix is applied by hand, exactly as three's own
 * `worldpos_vertex` does.
 *
 * Local space deliberately reads the raw `position` attribute instead: a tree
 * that sways or a coin that spins must not have its grain crawl across its own
 * surface, and every instance sharing one grain is invisible where world-space
 * grain would be a swimming artefact.
 */
/**
 * WHY this reads the `normal` ATTRIBUTE and not three's `objectNormal`:
 * `objectNormal` only exists in shaders that included `<beginnormal_vertex>`,
 * which lit materials do unconditionally but MeshBasicMaterial does only
 * `#if defined( USE_ENVMAP ) || defined( USE_SKINNING )` — so patching an
 * unlit material (falling petals, banners) with the same surface produced
 * `'objectNormal' : undeclared identifier` and silently dropped that draw
 * call. `attribute vec3 normal` is declared in EVERY vertex shader three
 * compiles, and for this world's static, unskinned, unmorphed geometry it is
 * the same vector. Geometry with no normal attribute at all reads (0,0,0),
 * which the epsilon below turns into "up" — the right default for a flat card.
 */
function vertexPatch(space) {
  // ONE varying, not two. The projection blend only ever needs how UP-facing
  // the surface is, which is a single number, and this world's normals are
  // flat per facet so computing it per-vertex loses nothing. GLSL ES only
  // guarantees a handful of varying vectors and MeshToonMaterial has already
  // spent several (view position, normal, colour, fog, shadow coords).
  const pars = `
varying vec4 vPaper;   // xyz = grain-space position, w = up-facing weight`;
  const body = space === 'local' ? `
	vPaper = vec4( position, smoothstep( 0.30, 0.82, abs( normalize( normal + vec3( 0.0, 1e-6, 0.0 ) ).y ) ) );` : `
	vec4 mwPaperP = vec4( transformed, 1.0 );
	vec3 mwPaperN = normal;
	#ifdef USE_INSTANCING
		mwPaperP = instanceMatrix * mwPaperP;
		mwPaperN = mat3( instanceMatrix ) * mwPaperN;
	#endif
	// The epsilon keeps normalize() finite for instances parked at scale 0
	// (that is how props.js hides a collected pickup); they rasterise nothing,
	// but a NaN varying is not something to leave lying around.
	mwPaperN = normalize( mat3( modelMatrix ) * mwPaperN + vec3( 0.0, 1e-6, 0.0 ) );
	vPaper = vec4( ( modelMatrix * mwPaperP ).xyz, smoothstep( 0.30, 0.82, abs( mwPaperN.y ) ) );`;
  return { pars, body };
}

/**
 * Layer the procedural paper surfaces onto an existing material.
 *
 * Chains onto whatever onBeforeCompile is already installed, so call order with
 * the wind/pulse patches in props.js does not matter.
 *
 * @param {THREE.Material} material  any lit material with a normal (MeshToon…)
 * @param {object} [opts] see PAPERCUT_DEFAULTS
 * @returns {THREE.Material} the same material, for chaining
 */
export function applyPapercut(material, opts = {}) {
  // Explicit `undefined` must fall back to the default, not clobber it — the
  // papercutMaterial() destructure below hands us undefined for every option
  // the caller left out.
  const o = { ...PAPERCUT_DEFAULTS };
  for (const k of Object.keys(opts)) if (opts[k] !== undefined) o[k] = opts[k];
  const grain = Math.max(0, o.grain);
  const tooth = Math.max(0, o.normal);
  const rough = Math.max(0, o.roughnessLike);
  if (grain <= 0 && tooth <= 0 && rough <= 0) return material;

  const invScale = 1 / (o.scale > 0 ? o.scale : 1);
  const tri = o.triplanar !== false;
  const needTooth = tooth > 0 || rough > 0;
  const { pars: vPars, body: vBody } = vertexPatch(o.space);

  const fiberTex = paperFiber();
  const toothTex = needTooth ? paperTooth() : null;

  // Shared UV derivation. `mwFlat` is 1 on ground-facing paper and 0 on a wall;
  // the side projection is a fixed 45-degree fold rather than a normal-driven
  // one, because a normal-driven projection would jump between the flat facets
  // this world is built from and show a seam on every facet edge.
  const uvBlock = tri ? `
	float mwFlat = vPaper.w;
	vec2 mwUvTop = vPaper.xz * ${g(invScale)};
	vec2 mwUvSide = vec2( ( vPaper.x + vPaper.z ) * 0.70711, vPaper.y ) * ${g(invScale)};` : `
	vec2 mwUvTop = vPaper.xz * ${g(invScale)};`;

  const fetch = (sampler) => (tri
    ? `mix( texture2D( ${sampler}, mwUvSide ).rgb, texture2D( ${sampler}, mwUvTop ).rgb, mwFlat )`
    : `texture2D( ${sampler}, mwUvTop ).rgb`);

  const grainBlock = grain > 0 ? `
	vec3 mwFiber = ${fetch('uPaperFiber')};
	diffuseColor.rgb *= vec3( 1.0 ) + ( mwFiber - 0.5 ) * ${g(2 * grain)};` : '';

  // Duff et al. branch-free orthonormal basis around the shading normal —
  // the derivative-free replacement for a tangent frame (see the header).
  const toothBlock = needTooth ? `
	vec3 mwTooth = ${fetch('uPaperTooth')};${tooth > 0 ? `
	vec2 mwDN = ( mwTooth.xy - 0.5 ) * ${g(2 * tooth)};
	float mwSg = normal.z >= 0.0 ? 1.0 : -1.0;
	float mwA = -1.0 / ( mwSg + normal.z );
	float mwB = normal.x * normal.y * mwA;
	vec3 mwTan = vec3( 1.0 + mwSg * normal.x * normal.x * mwA, mwSg * mwB, -mwSg * normal.x );
	vec3 mwBit = vec3( mwB, mwSg + normal.y * normal.y * mwA, -normal.y );
	normal = normalize( normal + mwTan * mwDN.x + mwBit * mwDN.y );` : ''}${rough > 0 ? `
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ${g3(CAVITY)}, ( 1.0 - mwTooth.z ) * ${g(rough)} );` : ''}` : '';

  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);

    shader.uniforms.uPaperFiber = { value: fiberTex };
    if (toothTex) shader.uniforms.uPaperTooth = { value: toothTex };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${vPars}`)
      .replace('#include <project_vertex>', `${vBody}
	#include <project_vertex>`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uPaperFiber;${toothTex ? `
uniform sampler2D uPaperTooth;` : ''}${vPars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${uvBlock}${grainBlock}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${toothBlock}`);
  };

  material.customProgramCacheKey = () => {
    const prev = prevKey ? prevKey.call(material) : '';
    return `${prev}|mw-paper|${grain}|${tooth}|${rough}|${o.scale}|${tri ? 1 : 0}|${o.space}`;
  };
  material.needsUpdate = true;
  return material;
}

/**
 * A toon material that already wears the paper. Papercut options are consumed
 * here; anything else (vertexColors, side, transparent…) passes through to
 * MeshToonMaterial untouched.
 */
export function papercutMaterial(color, opts = {}) {
  const { grain, normal, roughnessLike, scale, triplanar, space, ...matOpts } = opts;
  const mat = toonMaterial(color, matOpts);
  return applyPapercut(mat, { grain, normal, roughnessLike, scale, triplanar, space });
}

export { PAPER };
