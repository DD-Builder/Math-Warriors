/**
 * Cinematic camera poses — the fixed vocabulary the screenshot critique loop
 * shoots against.
 *
 * WHY hand-authored absolute coordinates instead of "orbit the player":
 * an art-direction critique is only actionable if two runs of the same pose
 * are the SAME image. The world is deterministic from WORLD.SEED, so a
 * literal {camPos, camLook, playerPos, tod} triple pins every pixel — no
 * follow-camera lerp, no wall clock, no frame-count dependence. Numbers below
 * were sampled against createHeightfield(WORLD.SEED): each camPos sits above
 * the terrain at its own x/z and each camLook is inside the frustum's vertical
 * half-angle (25 deg at fov 50) of the player, so the hero is always in frame.
 *
 * WHY these eight: together they cover every surface the renderer owns —
 * terrain silhouette, portal/building props, water + foam, fog depth layering,
 * the golden end of the time-of-day curve, and grass at eye level. A pose that
 * shows nothing new is a screenshot nobody reads.
 *
 * `camPos: null` means "use the normal follow camera" (still deterministic,
 * because setPose snaps rather than lerps). Pure data — no three import — so
 * plain Node can lint/inspect this file.
 */

/**
 * @typedef {{ name:string,
 *             playerPos:{x:number,z:number},
 *             yaw:number,
 *             camPos:{x:number,y:number,z:number}|null,
 *             camLook:{x:number,y:number,z:number}|null,
 *             tod:number }} Pose
 */

/** @type {Pose[]} */
export const POSES = [
  {
    // Garden meadow at the spawn, looking down the island's long axis at the
    // Paper Palace summit — the establishing shot. Hero low in frame.
    name: 'spawn-vista',
    playerPos: { x: 6, z: 158 },
    yaw: Math.PI,
    camPos: { x: 8, y: 26, z: 182 },
    camLook: { x: 0, y: 12, z: 110 },
    tod: 0.28,
  },
  {
    // Three-quarter close on the Floor 1 gate: voussoir arc, glowing page,
    // floating banner, hero for scale.
    name: 'garden-portal',
    playerPos: { x: 10, z: 148 },
    yaw: Math.PI,
    camPos: { x: 18, y: 18.5, z: 158 },
    camLook: { x: 10, y: 19.5, z: 141 },
    tod: 0.3,
  },
  {
    // Low over the tidepool shallows. The shoreline crosses ~ (147,147), so
    // the foam band, the shore gradient and open water all share the frame.
    name: 'tidepool-foam',
    playerPos: { x: 144, z: 144 },
    yaw: Math.PI * 0.25,
    camPos: { x: 133, y: 7.5, z: 133 },
    camLook: { x: 152, y: 0.5, z: 152 },
    tod: 0.34,
  },
  {
    // Sky Cliffs, seen from out over the water looking back WEST at the wall.
    //
    // The old framing stood on top and looked down the drop, which worked when
    // the biome was a 30 m dome. It is a table mountain now — a 47 m plateau
    // whose eastern face steps 46 m down to the sea in four bands — and the
    // only way to read that is side-on. From 28 m above open water the lip
    // sits 19 deg above the view axis and the base 23 deg below it, so the
    // whole wall fills the frame; the hero stands on the brink for scale, and
    // the 74 m of air between camera and cliff is exactly the depth range the
    // fog curve is supposed to be tested over.
    name: 'sky-cliff-vista',
    playerPos: { x: 166, z: 0 },
    yaw: Math.PI / 2,
    camPos: { x: 240, y: 28, z: -14 },
    camLook: { x: 176, y: 22, z: 0 },
    tod: 0.28,
  },
  {
    // Ember Slopes into the low western sun. tod 0.85 is the dusk keyframe:
    // golden-lavender, never night. The hero sits ~25 m down the view axis
    // and 13 deg off it, which clears the Floor 4 arch (6.7 deg half-width at
    // its 40 m range) instead of hiding behind it. Camera and look point drop
    // together so the pitch — and therefore the horizon line — is unchanged.
    name: 'ember-dusk',
    playerPos: { x: 127, z: -130 },
    yaw: -Math.PI * 0.75,
    camPos: { x: 150, y: 22, z: -140 },
    camLook: { x: 80, y: 14, z: -110 },
    tod: 0.85,
  },
  {
    // Market Town: shop and gallery both inside the horizontal half-angle
    // (~31 deg at fov 50, 4:3) from this stand-off.
    name: 'market-town',
    playerPos: { x: -136, z: 2 },
    yaw: Math.PI / 2,
    camPos: { x: -108, y: 24, z: 2 },
    camLook: { x: -156, y: 8, z: 0 },
    tod: 0.22,
  },
  {
    // Looking UP the palace flank at the summit and the Floor 9 gate. The
    // only pose with a positive camera pitch — it exists to test silhouette
    // against sky rather than against ground.
    //
    // The hero stands on the second terrace of the mesa (~30 m, a 19 deg
    // bench), not on the old z=30 which the reshaped landform turned into a
    // 72 deg cliff face. From here the frame stacks all four cliff bands
    // between the hero and the crown: summit rim is 12 deg above the view
    // axis, hero 17 deg below, both well inside the 25 deg half-angle, and
    // the sight line to the rim clears the intervening shoulder by ~1.5 m —
    // the crown breaks the horizon exactly where it should.
    name: 'palace-approach',
    playerPos: { x: 0, z: 46 },
    yaw: Math.PI,
    camPos: { x: 11, y: 38, z: 86 },
    camLook: { x: 0, y: 46, z: 14 },
    tod: 0.31,
  },
  {
    // Hero at arm's length in deep garden grass — character read, blob
    // shadow, flower and grass instancing at their true scale.
    name: 'hero-closeup',
    playerPos: { x: 0, z: 150 },
    yaw: 2.4,
    camPos: { x: 3.4, y: 14.4, z: 153.6 },
    camLook: { x: 0, y: 13.2, z: 150 },
    tod: 0.26,
  },
];

/** Names in POSES order — the list the debug API and the beauty spec drive. */
export const POSE_NAMES = POSES.map((p) => p.name);

/** @returns {Pose|null} */
export function poseByName(name) {
  return POSES.find((p) => p.name === name) || null;
}
