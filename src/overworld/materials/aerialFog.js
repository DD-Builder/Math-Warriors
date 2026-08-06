/**
 * Aerial perspective — the single biggest "expensive look" lever in the world.
 *
 * Three's stock fog is a linear ramp on view depth: everything at 300 m is
 * equally hazy whether it is a valley floor or a mountain crown, and the haze
 * is one flat colour no matter which way you look. Real distance reads as
 * distance because of three things this module implements and three.js does
 * not:
 *
 *   1. EXPONENTIAL-SQUARED extinction, so the near field is almost perfectly
 *      clear and the far field falls off a cliff. A linear ramp puts visible
 *      haze on the hero's boots; exp2 does not.
 *
 *   2. HEIGHT FALLOFF. Atmosphere is a fluid: density thins exponentially with
 *      altitude. Integrating that along the view ray analytically (closed form,
 *      one exp) means valleys hold mist while peaks stay crisp — for free, from
 *      the same three numbers. This is the whole reason a Zelda vista reads as
 *      *tall*, and it is what turns our "mist" weather into low fog banks
 *      without a single extra draw call.
 *
 *   3. DIRECTIONAL SCATTERING. The haze takes the sky's colour when you look
 *      up, the horizon's colour when you look out, and the sun's colour when
 *      you look toward the sun. Plus a desaturation pass that keeps a distant
 *      surface's own VALUE while stealing the atmosphere's HUE — that is what
 *      "desaturate with distance" physically is, and doing it as a hue swap
 *      instead of a pull toward grey is what keeps us inside the papercut law.
 *
 * ── WHY the shader chunks are overridden globally ──────────────────────────
 * The alternative is a bespoke onBeforeCompile string surgery per material,
 * and the world has a dozen material families (terrain, props, vegetation,
 * hero, banners, water) built by four different modules. One atmosphere means
 * one model: overriding `fog_pars_vertex` / `fog_vertex` / `fog_pars_fragment`
 * / `fog_fragment` in THREE.ShaderChunk retunes every `fog: true` material in
 * the scene — including water.js, which composes the same chunks by hand into
 * its own ShaderMaterial — with zero call-site drift. `applyAerialFog` then
 * only has to hand each material the SHARED uniform objects; the GLSL is
 * already there.
 *
 * ── WHY the vertex chunk reads `position` and not `transformed` ────────────
 * three's own fog chunk runs after `<project_vertex>` and could use either,
 * but water.js includes `<fog_vertex>` inside a hand-written shader that has
 * no `transformed` at all. `position` + `modelMatrix` (+ `instanceMatrix`) is
 * defined in EVERY vertex shader three compiles, so the chunk stays universal.
 * The cost is that wind sway (centimetres) is not reflected in the fog world
 * position, which is invisible at the ranges fog operates over.
 *
 * ── Colour space ──────────────────────────────────────────────────────────
 * `<fog_fragment>` runs AFTER `<colorspace_fragment>`, i.e. it mixes in the
 * renderer's OUTPUT space. Three converts its own `fogColor` accordingly
 * (`getUnlitUniformColorSpace`), so we do the same in `setFogColor` — a fog
 * colour left in working space would come out visibly dark and desaturated.
 *
 * Constraints honoured: three r170 only, no post-processing, no depth-texture
 * reads, no fwidth/dFdx (SwiftShader must match device pixel for pixel), no
 * per-frame allocation, every colour ultimately from PAPER.
 */
import * as THREE from 'three';

// Relative luminance — used both for the haze hue-swap and to normalise it.
const LUMA = 'vec3( 0.2126, 0.7152, 0.0722 )';

/**
 * Shared uniform objects. Every fogged material in the scene points at THESE
 * objects, so one write per frame relights the entire atmosphere. They are
 * plain `{ value }` records handed over in onBeforeCompile, which happens
 * AFTER three has cloned the material's uniform block — so the sharing
 * survives (UniformsUtils.clone never sees them).
 */
export const FOG_UNIFORMS = {
  // Haze colour looking DOWN/OUT (horizon band) and UP (sky band).
  uFogLow: { value: new THREE.Color(1, 1, 1) },
  uFogHigh: { value: new THREE.Color(1, 1, 1) },
  // Forward-scattering tint applied within a tight lobe around the key light.
  uFogSunColor: { value: new THREE.Color(1, 1, 1) },
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  // Extinction at y == uFogBaseY, per metre.
  uFogDensity: { value: 0.0068 },
  // Vertical e-folding rate: density *= exp(-uFogHeightK * (y - uFogBaseY)).
  uFogHeightK: { value: 0.030 },
  uFogBaseY: { value: 0 },
  // Metres of perfectly clear air in front of the eye. Keeps the hero crisp.
  uFogStart: { value: 8 },
  // How much of the fog's HUE a distant surface adopts before it is mixed
  // toward the fog colour outright. This is the "desaturates with distance"
  // half of aerial perspective.
  uFogDesat: { value: 0.50 },
  uFogSunAmt: { value: 0.35 },
  // Ceiling on extinction. 1.0 = distant land dissolves fully into sky.
  uFogMax: { value: 1.0 },
};

const VERT_PARS = /* glsl */`
#ifdef USE_FOG
	varying vec3 vFogWorld;
#endif`;

const VERT_BODY = /* glsl */`
#ifdef USE_FOG
	vec4 mwFogP = vec4( position, 1.0 );
	#ifdef USE_INSTANCING
		mwFogP = instanceMatrix * mwFogP;
	#endif
	vFogWorld = ( modelMatrix * mwFogP ).xyz;
#endif`;

const FRAG_PARS = /* glsl */`
#ifdef USE_FOG
	uniform vec3 uFogLow;
	uniform vec3 uFogHigh;
	uniform vec3 uFogSunColor;
	uniform vec3 uFogSunDir;
	uniform float uFogDensity;
	uniform float uFogHeightK;
	uniform float uFogBaseY;
	uniform float uFogStart;
	uniform float uFogDesat;
	uniform float uFogSunAmt;
	uniform float uFogMax;
	varying vec3 vFogWorld;
#endif`;

/**
 * Optical depth of an exponentially stratified atmosphere along the eye ray.
 *
 *   rho(y) = D * exp( -K * (y - Y0) )
 *   tau    = integral of rho ds  =  D * exp(-K*(camY-Y0)) * dist * R(K*dy)
 *   R(u)   = (1 - exp(-u)) / u                     [ R(0) = 1 ]
 *
 * R is the mean of exp(-K*t) over the ray's vertical span, and it is the
 * entire trick: looking UP out of the atmosphere it tends to 1/u (thin),
 * looking DOWN into a valley it grows (thick). The |u| < 1e-3 branch is the
 * first-order Taylor expansion, which keeps the horizontal case (dy == 0,
 * the common one) exact instead of 0/0.
 *
 * Extinction is then exp2: 1 - exp(-tau^2).
 */
const FRAG_BODY = /* glsl */`
#ifdef USE_FOG
	{
		vec3 mwFogRay = vFogWorld - cameraPosition;
		float mwFogLen = length( mwFogRay );
		vec3 mwFogV = mwFogRay / max( mwFogLen, 1e-4 );
		float mwFogDist = max( mwFogLen - uFogStart, 0.0 );

		float mwFogU = uFogHeightK * ( vFogWorld.y - cameraPosition.y );
		float mwFogR = abs( mwFogU ) < 1e-3
			? 1.0 - 0.5 * mwFogU
			: ( 1.0 - exp( -mwFogU ) ) / mwFogU;
		// Clamp the camera-altitude term so a camera parked far below sea
		// level (or on a 60 m crown) can never blow the exponential up.
		float mwFogH = clamp( ( cameraPosition.y - uFogBaseY ) * uFogHeightK, -3.0, 12.0 );
		float mwFogTau = uFogDensity * exp( -mwFogH ) * mwFogDist * max( mwFogR, 0.0 );
		float mwFogF = min( 1.0 - exp( -mwFogTau * mwFogTau ), uFogMax );

		// Directional scattering: horizon band below, sky band above, key
		// light inside a tight forward lobe.
		vec3 mwFogCol = mix( uFogLow, uFogHigh, smoothstep( -0.06, 0.42, mwFogV.y ) );
		float mwFogSun = pow( max( dot( mwFogV, uFogSunDir ), 0.0 ), 6.0 ) * uFogSunAmt;
		mwFogCol = mix( mwFogCol, uFogSunColor, mwFogSun );

		// Aerial desaturation done as a HUE SWAP: keep the surface's own
		// brightness, borrow the atmosphere's colour. Pulling toward grey
		// would be the usual trick and would break the palette law.
		float mwSurfL = dot( gl_FragColor.rgb, ${LUMA} );
		float mwFogL = max( dot( mwFogCol, ${LUMA} ), 1e-3 );
		vec3 mwHaze = min( mwFogCol * ( mwSurfL / mwFogL ), vec3( 1.0 ) );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, mwHaze, mwFogF * uFogDesat );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, mwFogCol, mwFogF );
	}
#endif`;

let _installed = false;

/**
 * Swap three's fog chunks for the aerial model. Idempotent, and must run
 * before the first program compiles (importing this module is enough — every
 * material factory in the overworld pulls it in transitively).
 */
export function installAerialFog() {
  if (_installed) return;
  _installed = true;
  THREE.ShaderChunk.fog_pars_vertex = VERT_PARS;
  THREE.ShaderChunk.fog_vertex = VERT_BODY;
  THREE.ShaderChunk.fog_pars_fragment = FRAG_PARS;
  THREE.ShaderChunk.fog_fragment = FRAG_BODY;
}
installAerialFog();

/**
 * Point a material's uniform block at the shared atmosphere.
 *
 * Chains onto any onBeforeCompile already installed (props.js patches wind,
 * toon.js patches paper grain — order must not matter) and is idempotent, so
 * the scene-wide sweep in index.js can safely re-visit a material a factory
 * already handled.
 *
 * @param {THREE.Material} material any material with `fog === true`
 * @returns {THREE.Material} the same material, for chaining
 */
export function applyAerialFog(material) {
  if (!material || material.fog !== true || material.__mwAerialFog) return material;
  material.__mwAerialFog = true;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    for (const key of Object.keys(FOG_UNIFORMS)) shader.uniforms[key] = FOG_UNIFORMS[key];
  };
  // No cache-key change: the GLSL is identical for every material (it lives in
  // the shared chunks), so two materials that differed only by this patch
  // SHOULD still share a program.
  material.needsUpdate = true;
  return material;
}

/** Recursively fog every material under an Object3D. Idempotent. */
export function applyAerialFogToTree(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach(applyAerialFog);
    else applyAerialFog(m);
  });
  return root;
}

// ── Frame wiring ─────────────────────────────────────────────────────────

const _work = new THREE.Color();

/**
 * Write a 0xRRGGBB palette colour into a fog uniform in the renderer's OUTPUT
 * space, mirroring three's own `refreshFogUniforms`. See the header note.
 */
export function setFogColor(target, hex) {
  _work.setHex(hex);
  _work.getRGB(target, THREE.SRGBColorSpace);
  return target;
}

/**
 * Push one composed render frame into the shared atmosphere. Zero allocation.
 *
 * @param {object} frame  a weather-modified timeOfDay frame: fogColor,
 *   skyMid, sunColor, sunDir, fogDensity, fogHeightK, fogBaseY, fogStart,
 *   fogDesat, fogSunAmt, fogMax.
 */
export function setAerialFrame(frame) {
  const u = FOG_UNIFORMS;
  // Low band == the sky dome's own horizon colour, so fogged land and sky meet
  // on exactly one edge with no seam. High band == the mid sky band, which is
  // what a surface seen from below scatters toward.
  setFogColor(u.uFogLow.value, frame.fogColor);
  setFogColor(u.uFogHigh.value, frame.skyMid);
  setFogColor(u.uFogSunColor.value, frame.sunColor);
  const d = frame.sunDir;
  u.uFogSunDir.value.set(d[0], d[1], d[2]);

  u.uFogDensity.value = frame.fogDensity;
  u.uFogHeightK.value = frame.fogHeightK;
  u.uFogBaseY.value = frame.fogBaseY;
  u.uFogStart.value = frame.fogStart;
  u.uFogDesat.value = frame.fogDesat;
  u.uFogSunAmt.value = frame.fogSunAmt;
  u.uFogMax.value = frame.fogMax;
}

/**
 * The GLSL extinction curve, in JS, for tests and for gameplay code that needs
 * to know how visible something is (LOD, prompt ranges). Kept literally in
 * step with FRAG_BODY — if one changes the other must.
 *
 * @returns {number} 0 (clear) .. uFogMax (fully dissolved into the sky)
 */
export function aerialFogFactor(camY, fragY, dist, p = {}) {
  const density = p.density ?? FOG_UNIFORMS.uFogDensity.value;
  const heightK = p.heightK ?? FOG_UNIFORMS.uFogHeightK.value;
  const baseY = p.baseY ?? FOG_UNIFORMS.uFogBaseY.value;
  const start = p.start ?? FOG_UNIFORMS.uFogStart.value;
  const max = p.max ?? FOG_UNIFORMS.uFogMax.value;

  const d = Math.max(dist - start, 0);
  const u = heightK * (fragY - camY);
  const ramp = Math.abs(u) < 1e-3 ? 1 - 0.5 * u : (1 - Math.exp(-u)) / u;
  const h = Math.min(Math.max((camY - baseY) * heightK, -3), 12);
  const tau = density * Math.exp(-h) * d * Math.max(ramp, 0);
  return Math.min(1 - Math.exp(-tau * tau), max);
}
