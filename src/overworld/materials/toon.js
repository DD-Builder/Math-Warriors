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
import { paperFiber, paperTooth, paperMottle, cavityTint } from './textures.js';
import { applyAerialFog } from './aerialFog.js';

let _ramp = null;

/**
 * Shared 3-step ramp: shadow texel teal-tinted, mid neutral, lit full.
 *
 * ── Why these numbers and not gentler ones ────────────────────────────────
 * MeshToonMaterial routes only DIRECT light through this ramp; the hemisphere
 * fill is added flat afterwards. So the shade texel and the hemi intensity in
 * timeOfDay.js are the same dial seen from two ends, and both used to be set
 * far too kind: shade at (0.34,0.47,0.47) under a 0.65 fill meant a fully
 * shadowed daylight surface never fell below roughly 55% of a lit one. At that
 * ratio nothing in the frame has FORM — every object is its own flat local
 * colour with a faint cool tint down one side, which is precisely the note the
 * art directors kept returning.
 *
 * Odyssey and TotK both commit to a hard light/shade split: the shadow side of
 * a cliff is a different colour family, not a cooler version of the lit side.
 * The shade texel below drops to ~30% luma to buy that split, and it drops
 * ANISOTROPICALLY — red loses most, blue least — so the shaded side does not
 * merely darken, it walks into the teal that PAPER.shadow already declares as
 * this world's stand-in for black. Darkening toward grey would be the ordinary
 * move and it is the one the palette law forbids outright.
 *
 * The mid step comes down with it. Leaving it near 0.75 would put a bright
 * plateau across most of the terminator and re-flatten everything the shade
 * step just bought.
 *
 * ── WHY THE MID STEP IS NEUTRAL AND THE SHADE STEP IS NOT ─────────────────
 * The mid texel used to be (0.56, 0.63, 0.65) — the same anisotropic teal lean
 * as the shade texel, just weaker. That is wrong, and it was measured as
 * wrong: the Infinity Library's ground is PAPER.creamD, a warm paper with 34
 * points of chroma, and it came back off the screen at CHROMA 2.6. Literal
 * greyscale. Nothing in the theme table is grey; the ramp made it grey.
 *
 * The arithmetic is unforgiving. A big up-facing plane under a middling sun
 * lands on the MID step and stays there across the whole frame, and a mid step
 * that gives up 9% more red than blue is a per-channel multiply that cancels
 * exactly the warm bias that made the paper warm. (232,222,198) x
 * (0.56,0.63,0.65) = (130,140,129): the paper has been turned inside out — red
 * now sits BELOW blue — for no reason anyone asked for.
 *
 * So the lean lives on the SHADE step alone, which is the step the palette law
 * is actually about, and the mid step below is neutral to within a rounding
 * error at the SAME luma (0.6165 either way). The value ladder is untouched;
 * only the hue distortion in the half-lit band is gone. A surface half in
 * light keeps its own colour, which is what "half in light" should mean.
 *
 * ── AND WHY THE COLOUR IN IT WAS NOT REACHING THE SCREEN ──────────────────
 * All of the above was written against a shader that never read it. three's
 * `gradientmap_pars_fragment` samples the ramp as
 *
 *     return vec3( texture2D( gradientMap, coord ).r );
 *
 * — the RED CHANNEL, splatted to grey. Green and blue are thrown away, so the
 * texel below shaded at a flat 0.22 GREY: not teal, and at 22% luma rather
 * than the 30% the numbers were chosen for. Every "the shade side should be a
 * different colour family" note above described an intent the GPU was never
 * given. `installToonRampRGB()` below is the one-word fix that makes this
 * table mean what it says.
 */
export const TOON_RAMP_STEPS = Object.freeze([
  Object.freeze([0.22, 0.32, 0.36]),  // shade — hard teal lean, ~30% luma
  Object.freeze([0.60, 0.62, 0.63]),  // half  — a real step, and hue-NEUTRAL
  Object.freeze([1.00, 1.00, 1.00]),  // lit
]);

/**
 * Make three sample the WHOLE ramp texel instead of only its red channel.
 *
 * Swaps one chunk, exactly as materials/aerialFog.js swaps the fog chunks and
 * for the same reason: `getGradientIrradiance` is called from inside
 * `RE_Direct_Toon`, which is itself inside a chunk, so there is no per-material
 * seam to patch — and the fix must reach every toon material in the game,
 * including any built outside toonMaterial().
 *
 * Idempotent, and importing this module is enough to install it. The `#else`
 * branch (no gradient map, and therefore `fwidth`) is left byte-identical: no
 * material in this world takes it, and rewriting a path nothing compiles would
 * be change for its own sake.
 *
 * @returns {boolean} false if three's chunk no longer has the anchor
 */
let _rampRGBInstalled = false;
export function installToonRampRGB() {
  if (_rampRGBInstalled) return true;
  const chunk = THREE.ShaderChunk.gradientmap_pars_fragment;
  const greyscale = 'return vec3( texture2D( gradientMap, coord ).r );';
  if (!chunk.includes(greyscale)) return false;
  THREE.ShaderChunk.gradientmap_pars_fragment =
    chunk.replace(greyscale, 'return texture2D( gradientMap, coord ).rgb;');
  _rampRGBInstalled = true;
  return true;
}
installToonRampRGB();

/** True once the ramp is being sampled in full colour. */
export function toonRampIsRGB() {
  return _rampRGBInstalled;
}

export function toonRamp() {
  if (_ramp) return _ramp;
  const steps = TOON_RAMP_STEPS;
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
  //
  // The shadow floor rides along for the same reason: a cast shadow is a
  // PALETTE fact, not a per-object decision, and the only way it can be
  // enforced world-wide is to install it where every lit surface is born. See
  // the SHADOW_FLOOR section for what three does without it.
  return applyShadowFloor(applyAerialFog(mat));
}

/** Convert a PAPER int to a THREE.Color (convenience for lights/fog/sky). */
export function paperColor(colorInt) {
  return new THREE.Color(colorInt);
}

// ── Papercut surface patch ──────────────────────────────────────────────

/** GLSL float literal (never emits an int — "1" would fail to compile). */
const g = (n) => Number(n).toFixed(5);
const g3 = (v) => `vec3( ${g(v[0])}, ${g(v[1])}, ${g(v[2])} )`;

// ── Shadow floor ────────────────────────────────────────────────────────
//
// THE BUG THIS SECTION EXISTS TO FIX, stated exactly.
//
// MeshToonMaterial routes DIRECT light through the gradient ramp above:
// `getGradientIrradiance(dotNL) * directLight.color`. That is the only thing
// the teal shade texel touches. The CAST-SHADOW term is applied one step
// earlier and one step outside it — three's `lights_fragment_begin` does
//
//     directLight.color *= receiveShadow ? getShadow( ... ) : 1.0;
//
// so a pixel the shadow map says is occluded has `directLight.color == 0` and
// the ramp is multiplied by nothing. The ramp NEVER SEES a cast shadow. What
// remains is the hemisphere fill alone, which is a straight per-channel
// multiply against the surface albedo — so a cast shadow can only ever be
// "this surface, but darker", never "this surface, but teal". Measured on the
// shipped frames: lit forest ground rgb(41,99,56), the hero's cast shadow on
// it rgb(5,34,17) — 12% of the lit value and still GREEN. That is the
// near-black shadow, and no amount of ramp tuning could have reached it.
//
// (The ramp had a second, independent problem of its own — three was sampling
// only its RED channel — which is fixed by installToonRampRGB() above. The two
// are separate bugs with the same symptom, and fixing either alone leaves
// near-black shade in the frame: the greyscale fetch flattened every SHADED
// face, this one flattened every OCCLUDED one.)
//
// The fix is two moves, both anchored on the shadow scalar:
//
//   1. FLOOR, APPLIED AS A MIN. The occluded direct term becomes
//
//          min( ramp(dotNL), mix( SHADOW_FLOOR, vec3(1), shadow ) )
//
//      The floor is the RAMP'S OWN SHADE TEXEL, deliberately and not by
//      coincidence: it makes "the sun is behind this face" and "something is
//      standing between this face and the sun" land on the SAME step of the
//      same three-step ramp. One shade value in the whole world.
//
//      And it is min(), not a multiply, which matters more than it looks. A
//      face already turned away from the sun receives no direct light for
//      GEOMETRIC reasons; an occluder in front of it adds no new information
//      and must not darken it a second time. Multiplying would square the
//      shade step — 0.30 x 0.30 = 9% of key on every north face that also
//      happens to lie in a shadow, which is the near-black the art directors
//      flagged, arriving by a second route. With min() the direct term can
//      never fall below SHADOW_FLOOR for ANY combination of facing and
//      occlusion, which is exactly the guarantee the palette law wants and
//      exactly what toon.test.js asserts.
//
//   2. HUE. A floor alone still only darkens — the palette law asks for teal.
//      So the shadowed fraction of the pixel is mixed toward PAPER.shadow's
//      CHROMA at its own luminance. Luminance-preserving on purpose: step 1
//      already owns how dark a shadow is, and folding brightness into the hue
//      move would make the two dials fight. The mix is driven by the shadow
//      mask, so a surface in open sun is never touched.
//
// Both patches are directional-light only. This world's rig is two
// directionals plus a hemisphere (see overworld/index.js) and there is no
// point or spot light anywhere in it; patching their branches would be dead
// GLSL that still has to compile.

/** Rec.709 luma weights — the same ones the ramp's own test measures with. */
export const LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** 0xRRGGBB -> linear-light [r,g,b]. */
function linearOf(hex) {
  return [16, 8, 0].map((s) => srgbToLinear((((hex >> s) & 0xff) / 255)));
}

const lumaOf = (c) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/**
 * How much of the key light a fully occluded surface keeps, per channel.
 *
 * This IS `TOON_RAMP_STEPS[0]` — see the note above. Aliased rather than
 * copied so the two can never drift apart.
 */
export const SHADOW_FLOOR = TOON_RAMP_STEPS[0];

/** Relative luma of the floor. The palette law's "never near-black" number. */
export const SHADOW_FLOOR_LUMA = lumaOf(SHADOW_FLOOR);

/**
 * PAPER.shadow's chroma, normalised to unit luminance.
 *
 * Multiplying a pixel's own luminance by this yields PAPER.shadow's HUE at
 * that pixel's brightness, which is what makes the mix in step 2 a pure hue
 * rotation. Normalising against luma (not against the max channel) is what
 * keeps it neutral in value: `dot(LUMA, SHADOW_CHROMA) == 1` by construction.
 */
export const SHADOW_CHROMA = (() => {
  const lin = linearOf(PAPER.shadow);
  const L = lumaOf(lin);
  return Object.freeze(lin.map((c) => c / L));
})();

/**
 * How far a fully shadowed pixel travels toward that hue.
 *
 * At 1.0 every shadow in the world would be the same teal regardless of what
 * paper it fell on, which is a flat sticker. At 0 it is the old albedo-tinted
 * grey. Just over half keeps the surface's own identity legible while making
 * the shadow unmistakably a COOLER FAMILY than the lit paper next to it —
 * warm sand goes teal-grey, forest green goes teal-green.
 *
 * Raised from 0.45 because the measured frames said 0.45 was not reaching the
 * screen: the hero's cast shadow on the Library floor came out `#6f7675`,
 * CHROMA 1 — neutral grey, the one thing the palette law forbids by name. Two
 * things ate it. (1) The lean was only ever applied to the CAST-shadow mask,
 * so a face merely turned away from the sun — most of the shaded pixels in any
 * frame — got no hue move at all and simply went dark. (2) Whatever chroma did
 * survive was then mixed toward the fog colour twice by aerialFog. Both are
 * fixed below and here; the lean has to carry the tint far enough that it is
 * still teal after the atmosphere has had its share.
 */
export const SHADOW_LEAN = 0.55;

/**
 * How dark a pixel's key term must get before the teal rotation starts.
 *
 * Without a knee the rotation is linear in darkness, and linear is too eager:
 * the ramp's MID step sits at 0.617 relative luma, so a merely half-lit
 * surface — most of the ground in most frames — would be dragged a fifth of
 * the way to teal for no reason. That is the same failure as the old
 * anisotropic mid texel, arriving by a different route, and it is exactly what
 * turns a warm cream floor into a grey one.
 *
 * At 0.55 the knee sits just under the mid step, so:
 *   half-lit  (0.617) -> no rotation at all, the paper keeps its own hue;
 *   shade side (0.302) -> ~0.24, a clear cool family shift;
 *   fully occluded (0) -> the full SHADOW_LEAN.
 *
 * smoothstep rather than a clamp so there is no visible edge where the
 * rotation switches on across a curved surface.
 */
export const SHADE_KNEE = 0.55;

/**
 * three's directional cast-shadow line, patched.
 *
 * Built once at module load from `THREE.ShaderChunk.lights_fragment_begin`
 * because the line lives INSIDE a chunk, and three does not expand `#include`
 * until after onBeforeCompile has run — there is nothing to string-replace in
 * the shader we are handed. `null` if three's chunk no longer contains the
 * anchor; `shadowFloorPatchIsLive()` reports that and toon.test.js fails on
 * it, so a three upgrade cannot silently drop the whole thing.
 *
 * The two scratch floats are declared OUTSIDE the light loop on purpose:
 * WebGLProgram unrolls `#pragma unroll_loop_start` by repeating the body with
 * no enclosing braces, so a `float` declared inside would be redeclared once
 * per light and fail to compile the moment the rig has two directionals — and
 * it has exactly two. The vec3s below live in a nested block, which unrolling
 * repeats intact and which therefore gets a fresh scope per light.
 *
 * `toon` builds the min() form, which needs `getGradientIrradiance` (declared
 * by gradientmap_pars_fragment, present in every toon shader). `plain` is the
 * fallback for a lit material with no ramp: same floor, applied as a straight
 * mix, since with no ramp there is no second darkening to guard against.
 */
/**
 * Fade the cast shadow out at the rim of the shadow camera's own footprint.
 *
 * THE ARTEFACT THIS REMOVES, quoted from review: "a shadow slab with straight
 * vertical edges slicing the entire midground with no caster in frame". There
 * was no caster because there was no shadow — that edge is the BOUNDARY OF THE
 * SHADOW MAP. The rig sizes one ortho box around the player (see fitShadow in
 * overworld/index.js) and everything past it is simply not in the depth
 * texture, so three's `getShadow` returns 1.0 and every shadow in the frame
 * stops dead along a perfectly straight line. On an open vista that line runs
 * across the whole picture and reads as a rendering fault, because it is one.
 *
 * The honest fixes are cascades (four times the shadow cost, and the seams
 * move rather than disappear) or a box big enough to cover the draw distance
 * (which would put a shadow texel at 40 cm and lose every contact shadow in
 * the game). The cheap and correct one is to stop the boundary being a step:
 * ramp the shadow term back to "unshadowed" over the last 8% of the box, so
 * distant shadows fade out over several metres instead of being guillotined.
 * Nobody has ever noticed a shadow 55 m away getting lighter; everybody
 * noticed the straight line.
 *
 * Costs one divide and a smoothstep per shadowed light, no texture fetch, no
 * derivative. Written in its own block so loop unrolling gives it fresh scope
 * per light.
 */
const SHADOW_EDGE_FADE = `
		{
			vec3 mwSc = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
			vec2 mwSe = abs( mwSc.xy - 0.5 );
			mwShadow = mix( 1.0, mwShadow,
				1.0 - smoothstep( 0.42, 0.50, max( mwSe.x, mwSe.y ) ) );
		}`;

function buildLightsBegin(toon) {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const head = 'directLight.color *= ';
  const anchor = `${head}( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[`;
  const at = chunk.indexOf(anchor);
  if (at < 0) return null;
  const end = chunk.indexOf(';', at);
  if (end < 0) return null;
  const shadowExpr = chunk.slice(at + head.length, end);   // the whole ternary
  // Rescale the light so the ramp downstream lands on exactly `mwWant`. The
  // max() only guards a divide by zero that the three-step ramp cannot
  // actually produce (its darkest texel is SHADOW_FLOOR).
  const apply = toon ? `
		{
			vec3 mwRamp = getGradientIrradiance( geometryNormal, directLight.direction );
			vec3 mwWant = min( mwRamp, mix( ${g3(SHADOW_FLOOR)}, vec3( 1.0 ), mwShadow ) );
			mwShadeMask = min( mwShadeMask, dot( mwWant, ${g3(LUMA)} ) );
			directLight.color *= mwWant / max( mwRamp, vec3( 0.001 ) );
		}` : `
		mwShadeMask = min( mwShadeMask, mwShadow );
		directLight.color *= mix( ${g3(SHADOW_FLOOR)}, vec3( 1.0 ), mwShadow );`;
  const patched = `mwShadow = ${shadowExpr};${SHADOW_EDGE_FADE}
		mwShadowMask = min( mwShadowMask, mwShadow );${apply}`;
  return `float mwShadowMask = 1.0;
	float mwShadeMask = 1.0;
	float mwShadow = 1.0;
${chunk.slice(0, at)}${patched}${chunk.slice(end + 1)}`;
}

const LIGHTS_BEGIN_TOON = buildLightsBegin(true);
const LIGHTS_BEGIN_PLAIN = buildLightsBegin(false);

/** True when the shadow-floor patch found its anchor in this build of three. */
export function shadowFloorPatchIsLive() {
  return LIGHTS_BEGIN_TOON !== null;
}

/**
 * The teal hue rotation, applied to whatever fraction of the pixel is DARK —
 * from a cast shadow, from facing away from the sun, or from both.
 *
 * It used to ride `mwShadowMask` alone, i.e. cast shadows only. That is half
 * the shaded pixels in a frame at best, and it left the OTHER half — every
 * north-facing hedge flank, every underside, the whole terminator — being
 * darkened by a multiply and nothing else. A multiply toward a dark texel
 * scales chroma with luma, so those pixels desaturate as they darken: that is
 * exactly how a shaded surface arrives at neutral grey without any one number
 * in the palette ever being grey. Driving the rotation from `mwShadeMask` (the
 * key term that actually survived, whatever killed it) makes the shade side
 * land ON the teal shadow paper BY CONSTRUCTION, at any albedo — which is the
 * palette law expressed as a property of the shader instead of as a hope about
 * the theme tables.
 *
 * Luminance-preserving, as before: SHADOW_FLOOR owns how dark, this owns what
 * hue, and the two dials must not fight.
 */
const SHADOW_TINT_BLOCK = `
	{
		float mwSd = ( 1.0 - smoothstep( 0.0, ${g(SHADE_KNEE)},
			min( mwShadowMask, mwShadeMask ) ) ) * ${g(SHADOW_LEAN)};
		float mwSl = dot( outgoingLight, ${g3(LUMA)} );
		outgoingLight = mix( outgoingLight, mwSl * ${g3(SHADOW_CHROMA)}, mwSd );
	}
`;

/**
 * Give a LIT material the teal shadow floor.
 *
 * Applied by `toonMaterial()` to every surface the world builds, so the island,
 * the nine 3D floors, the props and the hero all share one shadow. Chains onto
 * any onBeforeCompile already installed.
 *
 * Silently no-ops on a shader with no lighting chunk (an unlit banner reaching
 * this by accident) rather than emitting a reference to an undeclared
 * `mwShadowMask`.
 *
 * @param {THREE.Material} material
 * @returns {THREE.Material} the same material, for chaining
 */
export function applyShadowFloor(material) {
  if (!LIGHTS_BEGIN_TOON) return material;
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')) return;
    const ramped = shader.fragmentShader.includes('#include <gradientmap_pars_fragment>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_begin>', ramped ? LIGHTS_BEGIN_TOON : LIGHTS_BEGIN_PLAIN)
      .replace('#include <opaque_fragment>', `${SHADOW_TINT_BLOCK}	#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => {
    const prev = prevKey ? prevKey.call(material) : '';
    return `${prev}|mw-shadowfloor|${SHADOW_FLOOR.join(',')}|${SHADOW_LEAN}`;
  };
  material.needsUpdate = true;
  return material;
}

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
  // ── MACRO layer (off by default; one extra fetch when enabled) ──────────
  // `grain` works at arm's length and is invisible at ten metres by design
  // (see textures.js on why the fibre's low frequencies are kept weak). That
  // leaves every big surface — a 9 m gate, a market roof, a building wall —
  // one flat fill at exactly the distance the establishing shots are taken
  // from. `macro` is the answer: a soft ~14 m patina that swings both value
  // AND hue, so a wall changes colour across itself.
  macro: 0,
  macroScale: 14,      // WORLD METRES per macro tile
  // Sun-bleach: up-facing paper is faded by the light, tucked-under paper
  // holds the palette's teal cavity. A free directional read on any form,
  // driven by the up-facing weight the vertex patch already computes.
  bleach: 0,
  // ── FORM (baked value structure) ────────────────────────────────────────
  // See FORM_UP/FORM_DOWN. Off by default: a surface that is one big
  // up-facing plane (the ground) gains nothing from it but a brightness
  // change, so it is opted into per material by the things that have volume.
  form: 0,
};

/**
 * How much an up-facing face is lifted, and a down-facing one dropped, at
 * `form: 1`.
 *
 * THE DEFECT THIS EXISTS TO FIX, measured: on `hero-closeup.png` the hedge's
 * sun-facing TOP plane read L=55 and its shadow-side FRONT face read L=59.
 * The top was DARKER than the front. A form whose crown is not the brightest
 * thing on it is not a form — it is a flat shape — and that single ratio is
 * why nine floors of layered paper geometry read as stacked crates.
 *
 * The cause is not a bug, it is the rig: a three-step toon ramp only knows
 * NdotL, and at this world's sun elevation a hedge top and a hedge south face
 * land on the SAME step. The ramp cannot separate them and no amount of light
 * tuning will make it, because the information is not in the light.
 *
 * So the form is baked into the ALBEDO, keyed to the face normal — which is
 * what "layered cut paper" means in the first place: the cut edge catches the
 * sky, the tucked-under ply does not, and a papercut diorama shows you that
 * whether or not anyone has aimed a lamp at it. Odyssey's Steam Gardens hedge
 * runs roughly 2x crown-to-face; with the light doing its share these numbers
 * put us in that country instead of at 0.93.
 *
 * Being albedo, it survives into shade and into cast shadow, which is the
 * point: the hedge in the shadow of the next hedge still has a top.
 */
export const FORM_UP = 0.28;
export const FORM_DOWN = 0.20;

// Cavity multiplier, derived from PAPER.shadow — teal-leaning, never grey.
const CAVITY = cavityTint();

// Sun-bleach pair. UNDER is a gentler cavity (the same teal family, pulled
// most of the way back to white) applied to paper that faces sideways or down;
// OVER is a faint warm lift on paper that faces the sky. Both are MULTIPLIERS
// straddling 1.0, so the pair costs one mix and can never leave the palette:
// the darkening can only go teal and the lightening can only go cream.
const UNDER = cavityTint(0.90, 0.96);
const OVER = [1.030, 1.022, 1.006];

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
  //
  // `w` is SIGNED: its magnitude is the old up-facing weight (the triplanar
  // blend and the bleach pair take abs() and are byte-for-byte unchanged), and
  // its sign says whether the paper faces the sky or the ground. That sign is
  // the whole input to the FORM term, and carrying it here costs nothing —
  // still one varying, still no extra instruction in the common case.
  const pars = `
varying vec4 vPaper;   // xyz = grain-space position, w = SIGNED up-facing weight`;
  const body = space === 'local' ? `
	float mwPaperY = normalize( normal + vec3( 0.0, 1e-6, 0.0 ) ).y;
	vPaper = vec4( position, smoothstep( 0.30, 0.82, abs( mwPaperY ) ) * ( mwPaperY < 0.0 ? -1.0 : 1.0 ) );` : `
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
	vPaper = vec4( ( modelMatrix * mwPaperP ).xyz,
		smoothstep( 0.30, 0.82, abs( mwPaperN.y ) ) * ( mwPaperN.y < 0.0 ? -1.0 : 1.0 ) );`;
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
  const macro = Math.max(0, o.macro);
  const bleach = Math.max(0, o.bleach);
  const form = Math.max(0, o.form);
  if (grain <= 0 && tooth <= 0 && rough <= 0 && macro <= 0 && bleach <= 0 && form <= 0) {
    return material;
  }

  const invScale = 1 / (o.scale > 0 ? o.scale : 1);
  const invMacro = 1 / (o.macroScale > 0 ? o.macroScale : 1);
  const tri = o.triplanar !== false;
  const needTooth = tooth > 0 || rough > 0;
  const { pars: vPars, body: vBody } = vertexPatch(o.space);

  const fiberTex = grain > 0 ? paperFiber() : null;
  const toothTex = needTooth ? paperTooth() : null;
  const mottleTex = macro > 0 ? paperMottle() : null;

  // Shared UV derivation. `mwFlat` is 1 on ground-facing paper and 0 on a wall;
  // the side projection is a fixed 45-degree fold rather than a normal-driven
  // one, because a normal-driven projection would jump between the flat facets
  // this world is built from and show a seam on every facet edge.
  const uvBlock = `
	float mwFlat = abs( vPaper.w );
	vec2 mwUvTop = vPaper.xz * ${g(invScale)};${tri ? `
	vec2 mwUvSide = vec2( ( vPaper.x + vPaper.z ) * 0.70711, vPaper.y ) * ${g(invScale)};` : ''}`;

  const fetch = (sampler) => (tri
    ? `mix( texture2D( ${sampler}, mwUvSide ).rgb, texture2D( ${sampler}, mwUvTop ).rgb, mwFlat )`
    : `texture2D( ${sampler}, mwUvTop ).rgb`);

  const grainBlock = grain > 0 ? `
	vec3 mwFiber = ${fetch('uPaperFiber')};
	diffuseColor.rgb *= vec3( 1.0 ) + ( mwFiber - 0.5 ) * ${g(2 * grain)};` : '';

  // MACRO patina. One top-down fetch only — a triplanar blend at a 14 m tile
  // buys nothing (the features are metres across, so stretching one down a
  // wall is invisible) and would double the cost of the layer.
  const macroBlock = macro > 0 ? `
	vec3 mwMac = texture2D( uPaperMottle, vPaper.xz * ${g(invMacro)} ).rgb;
	diffuseColor.rgb *= vec3( 1.0 ) + ( mwMac - 0.5 ) * ${g(2 * macro)};` : '';

  // Sun-bleach. `mwFlat` is 1 on paper facing the sky and 0 on a wall, so this
  // is a free ambient-direction cue: tops fade warm, flanks and undersides
  // hold the teal cavity. It is NOT lighting — it survives into shadow, which
  // is exactly what makes a form read when the key light is behind it.
  const bleachBlock = bleach > 0 ? `
	diffuseColor.rgb *= mix( mix( vec3( 1.0 ), ${g3(UNDER)}, ${g(bleach)} ),
	                         mix( vec3( 1.0 ), ${g3(OVER)}, ${g(bleach)} ), mwFlat );` : '';

  // FORM. One mad(), no fetch, no branch: the sunlit cut edge on top of a ply
  // is lifted, the tucked-under face is dropped, and everything vertical is
  // left exactly as authored so the theme tables still mean what they say.
  // See FORM_UP for the measurement that made this necessary.
  const formBlock = form > 0 ? `
	diffuseColor.rgb *= 1.0 + max( vPaper.w, 0.0 ) * ${g(form * FORM_UP)}
		- max( -vPaper.w, 0.0 ) * ${g(form * FORM_DOWN)};` : '';

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

    if (fiberTex) shader.uniforms.uPaperFiber = { value: fiberTex };
    if (toothTex) shader.uniforms.uPaperTooth = { value: toothTex };
    if (mottleTex) shader.uniforms.uPaperMottle = { value: mottleTex };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${vPars}`)
      .replace('#include <project_vertex>', `${vBody}
	#include <project_vertex>`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${fiberTex ? `
uniform sampler2D uPaperFiber;` : ''}${toothTex ? `
uniform sampler2D uPaperTooth;` : ''}${mottleTex ? `
uniform sampler2D uPaperMottle;` : ''}${vPars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${uvBlock}${macroBlock}${grainBlock}${bleachBlock}${formBlock}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${toothBlock}`);
  };

  material.customProgramCacheKey = () => {
    const prev = prevKey ? prevKey.call(material) : '';
    return `${prev}|mw-paper|${grain}|${tooth}|${rough}|${o.scale}|${tri ? 1 : 0}|${o.space}`
      + `|${macro}|${o.macroScale}|${bleach}|${form}`;
  };
  material.needsUpdate = true;
  return material;
}

// ── Rim light ───────────────────────────────────────────────────────────

/**
 * Shared rim-light uniforms. One object, so a time-of-day pass can walk the rim
 * from cream at noon to peach at golden hour with a single write and every
 * rimmed surface follows.
 */
export const RIM_UNIFORMS = {
  uRimColor: { value: new THREE.Color().setHex(PAPER.cream, THREE.SRGBColorSpace) },
  uRimStrength: { value: 1 },
};

/**
 * Fresnel rim, for the HERO and nothing else.
 *
 * Odyssey has a hard rule the art directors called out by name: Mario is
 * always value-separated from his backdrop. Ours was not — a mid-teal knight
 * on mid-green grass at effectively equal luma, which is a character that
 * disappears into the one frame that exists to show him off. The honest fixes
 * are a backdrop you cannot control or an outline the palette law forbids; the
 * third is a rim, and a rim is what Nintendo actually uses.
 *
 * It is additive on `outgoingLight`, AFTER the toon ramp, so it survives into
 * shade — which is the whole point: the hero standing in a tree's shadow is
 * exactly when he most needs an edge. The colour is a PAPER colour and the
 * strength is small, so the rim reads as light catching a paper edge rather
 * than as a sci-fi glow.
 *
 * Gated by the VIEW-space normal's y, softly, so the strongest rim lands on
 * up-and-outward facing edges (shoulders, crown, the top of the head) and the
 * boots keep only a third of it. View space is the right space here despite
 * sounding wrong: the boom camera is near-level, so view-up and world-up are
 * within a few degrees, and it costs no varying at all.
 *
 * @param {THREE.Material} material a lit material with a normal + vViewPosition
 * @param {{strength?:number, power?:number}} [opts]
 */
export function applyRimLight(material, opts = {}) {
  const strength = opts.strength ?? 0.35;
  const power = opts.power ?? 3.0;
  const floor = opts.floor ?? 0.34;   // rim kept on down-facing paper
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    shader.uniforms.uRimColor = RIM_UNIFORMS.uRimColor;
    shader.uniforms.uRimStrength = RIM_UNIFORMS.uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;`)
      .replace('#include <opaque_fragment>', `
	{
		vec3 mwRimV = normalize( vViewPosition );
		float mwRim = pow( 1.0 - clamp( dot( normal, mwRimV ), 0.0, 1.0 ), ${g(power)} );
		mwRim *= mix( ${g(floor)}, 1.0, smoothstep( -0.30, 0.30, normal.y ) );
		outgoingLight += uRimColor * ( mwRim * ${g(strength)} * uRimStrength );
	}
	#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => {
    const prev = prevKey ? prevKey.call(material) : '';
    return `${prev}|mw-rim|${strength}|${power}|${floor}`;
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
  const {
    grain, normal, roughnessLike, scale, triplanar, space, macro, macroScale, bleach, form,
    ...matOpts
  } = opts;
  const mat = toonMaterial(color, matOpts);
  return applyPapercut(mat, {
    grain, normal, roughnessLike, scale, triplanar, space, macro, macroScale, bleach, form,
  });
}

export { PAPER };
