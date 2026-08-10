# Math Warriors 3D — Art Direction (v2: Rounded / Toy)

**Owner decision (2026-08-09):** the 3D game follows the **Super Mario Odyssey**
and **Astro Bot (PS5)** direction for form and lighting. This SUPERSEDES the
"flat papercut slab" construction that governed the first 3D art passes.
The 2D game (Math Warriors Classic) keeps its papercut language untouched.

## References — what we are actually borrowing

**Super Mario Odyssey**
- Form: chunky, ROUNDED masses. Nothing is a slab; every edge has a generous
  bevel or full round. Silhouettes read at a glance from any distance.
- Colour scripting: saturated, high-key, one dominant hue per zone with a
  complementary accent. Depth planes separated by hue/value, not detail.
- Lighting: warm sun key + strong sky fill; shadows are coloured, luminous,
  never muddy.

**Astro Bot**
- Materials: TOY surfaces — soft satin gloss with tight specular highlights,
  like vinyl/ABS plastic toys. Characters and interactables visibly *shinier*
  than the world.
- Bounce light: the ground colour visibly bounces up into objects' undersides.
- Micro-appeal: dense small readable detail (rivets, seams, dots) instead of
  texture noise; squash-and-stretch everywhere, but crisp and critically
  damped — toys are springy, never gelatinous.
- AO: soft, buttery occlusion in every crevice sells the "physical toy" read.

## The rules (agents: these override the old papercut TECH/ART law where they conflict)

1. **ROUNDEDNESS IS LAW.** No raw boxes, cones or hard-extruded prisms in the
   final image. Use rounded-box / capsule / sphere-blended primitives, add
   bevel loops on everything else. Tree canopies are blobby sphere clusters,
   not stacked discs. Walls/cliffs get rounded crowns and filleted corners.
2. **PALETTE:** the PAPER families in `src/config.js` remain the colour DNA of
   the franchise, but saturation/value may lift toward Odyssey brightness.
   Shadows stay COLOURED (the teal family) — never black, never grey. That law
   survives the pivot.
3. **LIGHTING MODEL:**
   - Warm sun key + sky hemisphere as now, PLUS a real ground-bounce term
     (undersides tinted by the local ground colour).
   - Softer, wider shadow penumbra (bigger PCF radius); contact darkening via
     blob AO under every object.
   - A subtle Fresnel rim on characters/creatures/interactables to pop
     silhouettes off the background (no post-processing — do it in-material).
4. **MATERIAL SPLIT:** world surfaces = satin matte; characters, creatures,
   collectibles, interactables = toy gloss (tight specular, low roughness
   feel). The paper-fibre grain is retired on rounded toy surfaces — replace
   with soft 2-3 tone gradients baked into vertex colour and micro-details
   (seams, stitches, dots) modelled or vertex-painted, not noise textures.
5. **ANIMATION FEEL:** springy and critically damped. Squash on landing <=15%,
   recover <300ms, idle breathing <=2% amplitude. Astro-style: crisp, snappy,
   readable — the jello failure mode is the exact opposite of this spec.
6. **SILHOUETTE TEST:** every asset must be identifiable blacked-out. If a
   tree reads as an umbrella or a hero reads as a stack, it fails.

## Still in force (unchanged)
- three r170; no post-processing; no depth-texture reads; no fwidth
  (SwiftShader screenshot parity); instancing/merging; zero per-frame
  allocation; dispose everything; <=250 draw calls, <=500k tris.
- Kind and bright for ages 5-10. Awe, never horror.
- The 2D Classic game and its tests must keep passing untouched.
