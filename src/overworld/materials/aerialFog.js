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
import { PAPER } from '../../config.js';

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
  // Haze colour at FULL extinction — the warm-near / cool-far split.
  //
  // uFogLow/uFogHigh are a DIRECTIONAL choice (which way is the eye pointing),
  // and inside a corridor the eye points one way, so both bands collapse to a
  // single flat colour and near haze and far haze become the same paint. That
  // is what dissolved the Infinity Library into one continuous grey-purple
  // mush with no depth in it at all: the shelves three metres away and the
  // stack at the far end were tinted toward the SAME value, so the aerial
  // perspective that was supposed to separate them separated nothing.
  //
  // This is a DISTANCE choice, blended in by the extinction factor itself, so
  // near haze can stay warm while the far end of the same corridor goes cool
  // and recedes. Defaults to uFogLow (setAerialFrame writes both from the same
  // frame colour), which makes the whole term an exact identity on the island.
  uFogFar: { value: new THREE.Color(1, 1, 1) },
  // Forward-scattering tint applied within a tight lobe around the key light.
  uFogSunColor: { value: new THREE.Color(1, 1, 1) },
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  // Extinction at y == uFogBaseY, per metre.
  uFogDensity: { value: 0.0068 },
  // Vertical e-folding rate: density *= exp(-uFogHeightK * (y - uFogBaseY)).
  uFogHeightK: { value: 0.030 },
  uFogBaseY: { value: 0 },
  // Metres of perfectly clear air in front of the eye. Keeps the hero crisp.
  // Deliberately SHORT: at 8 m the whole mid-ground was still unhazed, which
  // is how a mountain vista ended up with far-right trees at the same
  // saturation and value as near ones. Aerial perspective has to start
  // working within the first few metres or it only ever reads at the horizon.
  uFogStart: { value: 4 },
  // How much of the fog's HUE a distant surface adopts before it is mixed
  // toward the fog colour outright. This is the "desaturates with distance"
  // half of aerial perspective — and it is the half that does the work at
  // mid-range, where the extinction term is still small.
  uFogDesat: { value: 0.72 },
  uFogSunAmt: { value: 0.35 },
  // Ceiling on extinction. 1.0 = distant land dissolves fully into sky.
  uFogMax: { value: 1.0 },

  // ── Cloud shadows ───────────────────────────────────────────────────────
  // See CLOUD_SHADOW below. Strength 0 skips the whole block on a uniform
  // branch, which is why the rain state can turn it off for free.
  uCloudShadow: { value: 0 },
  // A MULTIPLIER, not a palette colour, and deliberately NOT run through
  // setFogColor: it is applied in the renderer's output space (the fog chunk
  // runs after <colorspace_fragment>) so it has to be authored there too.
  // Teal-leaning by the same law as the toon ramp's shade texel — red gives up
  // the most, blue the least, so a shadowed patch of meadow moves toward
  // PAPER.shadow rather than toward grey.
  uCloudShadowTint: { value: new THREE.Color(0.66, 0.76, 0.78) },
  uCloudShadowDir: { value: new THREE.Vector2(0.86, 0.51) },
  // 1/metres. ~95 m banks: two or three of them cross a 200 m vista, which is
  // the count that reads as weather rather than as a texture.
  uCloudShadowScale: { value: 0.0105 },
  uCloudShadowTime: { value: 0 },
  // Altitude the deck shadows up to. Nothing at or above this is darkened by
  // it — a cloud may not shadow the crown it is floating beside. Set above the
  // palace summit so the mesa benches DO catch the banks; that breakup is the
  // whole reason a big pale landform stops reading as one flat mass.
  uCloudShadowY: { value: 95 },
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
	uniform vec3 uFogFar;
	uniform vec3 uFogSunColor;
	uniform vec3 uFogSunDir;
	uniform float uFogDensity;
	uniform float uFogHeightK;
	uniform float uFogBaseY;
	uniform float uFogStart;
	uniform float uFogDesat;
	uniform float uFogSunAmt;
	uniform float uFogMax;
	uniform float uCloudShadow;
	uniform vec3 uCloudShadowTint;
	uniform vec2 uCloudShadowDir;
	uniform float uCloudShadowScale;
	uniform float uCloudShadowTime;
	uniform float uCloudShadowY;
	varying vec3 vFogWorld;
#endif`;

/**
 * Scrolling cloud shadows — the cheapest "designed place" cue there is.
 *
 * Odyssey and TotK both lean on these constantly and this world had none: a
 * 200 m meadow lit by one directional light is one unmodulated value however
 * good the grass is, because nothing is breaking the light up. Two octaves of
 * drifting value noise laid over the ground turns that bedsheet into a field
 * with weather moving across it, and it costs one uniform branch.
 *
 * WHY it lives inside the fog chunk rather than in a material patch: this has
 * to reach terrain, props, vegetation, the hero AND the water sheet, which are
 * five material families built by four modules. The fog chunk is the one place
 * every one of them already shares, and it already carries the world position
 * the noise needs — so this is zero extra varyings and zero call-site drift.
 *
 * WHY the darkening is a TEAL-LEANING multiply rather than a neutral one: a
 * neutral multiply walks the ground through grey on its way to black, and grey
 * is the one direction the papercut law forbids outright. uCloudShadowTint
 * gives up far more red than blue, so a shadowed patch of meadow lands in the
 * same colour family the toon ramp puts on the shaded side of everything else.
 *
 * WHY the noise is hand-written and not a texture: identical output under
 * SwiftShader and on the device, no sampler to thread through six material
 * factories, and no derivatives anywhere.
 *
 * The `uCloudShadowY` gate stops the deck shadowing anything that is level
 * with it or above it — a cloud may not darken the palace crown it is
 * floating beside.
 */
const CLOUD_SHADOW = /* glsl */`
		if ( uCloudShadow > 0.001 ) {
			vec2 mwCsP = vFogWorld.xz * uCloudShadowScale + uCloudShadowDir * uCloudShadowTime;
			vec2 mwCsI = floor( mwCsP );
			vec2 mwCsF = fract( mwCsP );
			mwCsF = mwCsF * mwCsF * ( 3.0 - 2.0 * mwCsF );
			vec4 mwCsH = fract( sin( vec4(
				dot( mwCsI, vec2( 127.1, 311.7 ) ),
				dot( mwCsI + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ),
				dot( mwCsI + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ),
				dot( mwCsI + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) )
			) ) * 43758.5453 );
			float mwCs = mix( mix( mwCsH.x, mwCsH.y, mwCsF.x ), mix( mwCsH.z, mwCsH.w, mwCsF.x ), mwCsF.y );
			// Second octave at a different drift so the pattern never tiles
			// visibly and the edges of a bank tear instead of scrolling rigid.
			vec2 mwCsQ = vFogWorld.xz * uCloudShadowScale * 2.7
				- uCloudShadowDir.yx * uCloudShadowTime * 1.6;
			vec2 mwCsJ = floor( mwCsQ );
			vec2 mwCsG = fract( mwCsQ );
			mwCsG = mwCsG * mwCsG * ( 3.0 - 2.0 * mwCsG );
			// Different hash constants, not just a different scale: sharing them
			// would make the two octaves agree wherever their cell indices
			// happened to line up, and an octave that correlates with its own
			// base is a repeating blotch rather than detail.
			vec4 mwCsK = fract( sin( vec4(
				dot( mwCsJ, vec2( 269.5, 183.3 ) ),
				dot( mwCsJ + vec2( 1.0, 0.0 ), vec2( 269.5, 183.3 ) ),
				dot( mwCsJ + vec2( 0.0, 1.0 ), vec2( 269.5, 183.3 ) ),
				dot( mwCsJ + vec2( 1.0, 1.0 ), vec2( 269.5, 183.3 ) )
			) ) * 43758.5453 );
			mwCs += 0.42 * mix( mix( mwCsK.x, mwCsK.y, mwCsG.x ), mix( mwCsK.z, mwCsK.w, mwCsG.x ), mwCsG.y );
			// Threshold into BANKS with soft edges. A smooth noise multiply is
			// a stain; a thresholded one is a cloud passing overhead.
			float mwCsA = smoothstep( 0.52, 0.92, mwCs / 1.42 );
			// Under the deck only, and gone again by the time the surface is
			// deep in the haze — a shadow you cannot resolve is just dirt.
			mwCsA *= 1.0 - smoothstep( uCloudShadowY * 0.72, uCloudShadowY, vFogWorld.y );
			mwCsA *= ( 1.0 - mwFogF ) * uCloudShadow;
			gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * uCloudShadowTint, mwCsA );
		}`;

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
${CLOUD_SHADOW}

		// Directional scattering: horizon band below, sky band above, key
		// light inside a tight forward lobe.
		vec3 mwFogCol = mix( uFogLow, uFogHigh, smoothstep( -0.06, 0.42, mwFogV.y ) );
		// Warm near, cool far. See uFogFar — this is the term that lets a
		// corridor's far end sit at a different value from its near walls
		// when every ray in the frame points the same way.
		mwFogCol = mix( mwFogCol, uFogFar, mwFogF );
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

// ── Per-domain atmosphere ────────────────────────────────────────────────
//
// One atmosphere, nine rooms. The island's numbers are tuned for a 400 m
// vista and they are the ONLY numbers the nine playable floors were ever
// given, which is why the floors came back from review with two opposite
// complaints in the same breath: the Library "dissolves into grey-purple mush
// at mid-range" while the Garden has "effectively none". Both are true. A
// floor is 60–90 m across, so the island's density does almost nothing across
// a Garden — and the Library's own theme colours are all within a hair of the
// haze colour, so what little density there is lands as a flat wash instead of
// as depth.
//
// The fix is not a global dial, because the two failures point in opposite
// directions. It is a table: each domain gets the atmosphere its architecture
// needs, expressed as MULTIPLIERS and OVERRIDES on whatever the hour and the
// weather composed, so time of day still travels through it.
//
//   density  multiplier on the composed fog density
//   start    absolute metres of perfectly clear air (a room is small; the
//            near field has to stay completely untouched or the walls two
//            metres away start hazing)
//   desat    absolute uFogDesat — the hue-swap half of aerial perspective, and
//            the half that does the work at the ranges a floor spans
//   max      extinction ceiling: how far a surface may dissolve. A floor has
//            no sky behind it at eye level, so letting the far wall reach 1.0
//            punches a hole in the room. Nothing indoors goes above ~0.8.
//   far      PAPER int for uFogFar (see the uniform). null keeps it equal to
//            the frame's own fog colour, i.e. no near/far split.
//
// @type {Record<string, {density:number,start:number,desat:number,max:number,far:number|null}>}
export const LEVEL_ATMOSPHERE = {
  // Open, sunlit, green. It needs MORE haze, not less: with none, the far
  // hedges sit at exactly the value of the near ones and the maze is flat.
  garden: { density: 1.55, start: 7, desat: 0.86, max: 0.72, far: PAPER.sage },
  // A drained harbour. Damp air pooling in the streets, going teal with depth.
  ebbport: { density: 1.70, start: 7, desat: 0.84, max: 0.76, far: PAPER.tealD },
  // Actually in the sky. The one domain the island's density is nearly right
  // for, and the one place a far edge SHOULD dissolve.
  sky: { density: 1.30, start: 8, desat: 0.80, max: 0.92, far: PAPER.sky },
  // Warm near, cool far, hard. Floor 4's review note was "orange ground at 97
  // chroma against teal slabs at 22 — two games in one frame"; a warm near
  // haze is what stitches the two families into one room.
  ember: { density: 1.60, start: 7, desat: 0.88, max: 0.78, far: PAPER.coralD },
  frost: { density: 1.75, start: 8, desat: 0.78, max: 0.86, far: PAPER.sky },
  prism: { density: 1.35, start: 7, desat: 0.82, max: 0.78, far: PAPER.lavenderD },
  market: { density: 1.25, start: 7, desat: 0.80, max: 0.70, far: PAPER.coral },
  // THE 40% CUT. The Library was the worst frame in the set for exactly this:
  // a corridor with a designed sightline, thrown away by haze that reached
  // mush before the sightline resolved. Density down hard, ceiling down hard
  // so the far stack stays a stack, and a cool far end against warm near
  // shelves so the corridor has two planes in it instead of one.
  library: { density: 0.60, start: 10, desat: 0.62, max: 0.62, far: PAPER.lavenderD },
  mending: { density: 0.80, start: 9, desat: 0.70, max: 0.66, far: PAPER.lavender },
};

/** The atmosphere for a theme key, or null for the island's own. */
export function levelAtmosphere(key) {
  return LEVEL_ATMOSPHERE[key] || null;
}

// ── Frame wiring ─────────────────────────────────────────────────────────

const _work = new THREE.Color();

/**
 * The domain override currently in force, or null on the island.
 *
 * Held here rather than passed through setAerialFrame's argument because the
 * frame is recomposed by the day/weather clock on its own schedule — the
 * override has to survive every one of those recompositions until the player
 * walks back out of the floor.
 */
let _domain = null;

/**
 * Enter/leave a domain atmosphere. Pass a theme key to adopt that domain's
 * numbers, or null to go back to the island's. Re-pushes immediately from the
 * last composed frame so the change lands on the very next rendered frame
 * rather than at the next hour tick.
 *
 * @param {string|null} key a LEVEL_ATMOSPHERE key, or null
 */
export function setFogDomain(key) {
  _domain = key ? levelAtmosphere(key) : null;
  if (_lastFrame) setAerialFrame(_lastFrame);
}

/** True when a domain atmosphere is in force. */
export function fogDomainActive() {
  return _domain !== null;
}

let _lastFrame = null;

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
  _lastFrame = frame;
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

  // Domain override last, so it wins over the composed frame but still rides
  // whatever the hour and the weather did to the COLOURS. See LEVEL_ATMOSPHERE.
  if (_domain) {
    u.uFogDensity.value = frame.fogDensity * _domain.density;
    u.uFogStart.value = _domain.start;
    u.uFogDesat.value = _domain.desat;
    u.uFogMax.value = Math.min(frame.fogMax, _domain.max);
    if (_domain.far !== null) setFogColor(u.uFogFar.value, _domain.far);
    else u.uFogFar.value.copy(u.uFogLow.value);
  } else {
    // No split on the island: far haze IS near haze, which makes the whole
    // uFogFar term an exact identity there.
    u.uFogFar.value.copy(u.uFogLow.value);
  }

  // Cloud shadows drift DOWNWIND OF THE KEY LIGHT's azimuth, which is what
  // makes them look like they belong to the clouds the sky is actually
  // drawing rather than to a texture someone slid over the ground.
  u.uCloudShadow.value = frame.cloudShadow ?? 0;
  if (u.uCloudShadow.value > 0) {
    const dx = frame.sunDir[0], dz = frame.sunDir[2];
    const len = Math.hypot(dx, dz) || 1;
    u.uCloudShadowDir.value.set(-dx / len, -dz / len);
  }
}

/**
 * Advance the cloud-shadow drift. Separate from setAerialFrame because the
 * lighting frame only recomposes when the hour or the weather moves, and the
 * shadows have to keep travelling on a settled frame.
 *
 * @param {number} simTime deterministic seconds from the renderer rig.
 */
export function setAerialTime(simTime) {
  // Cells per second. uCloudShadowScale puts a cell at ~95 m, so this is a
  // ~5 m/s drift — fast enough to see a bank cross the meadow while a child
  // stands still, slow enough not to strobe.
  FOG_UNIFORMS.uCloudShadowTime.value = simTime * 0.052;
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
