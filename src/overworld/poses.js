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
    // Sky Cliffs summit (~30 m) looking east off the drop to the sea. Tests
    // fog layering and aerial perspective across the whole depth range.
    name: 'sky-cliff-vista',
    playerPos: { x: 158, z: 0 },
    yaw: -Math.PI / 2,
    camPos: { x: 130, y: 48, z: 14 },
    camLook: { x: 196, y: 2, z: -6 },
    tod: 0.28,
  },
  {
    // Ember Slopes into the low western sun. tod 0.85 is the dusk keyframe:
    // golden-lavender, never night.
    name: 'ember-dusk',
    playerPos: { x: 122, z: -122 },
    yaw: -Math.PI * 0.75,
    camPos: { x: 150, y: 28, z: -140 },
    camLook: { x: 80, y: 20, z: -110 },
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
    name: 'palace-approach',
    playerPos: { x: 0, z: 30 },
    yaw: Math.PI,
    camPos: { x: 4, y: 38, z: 70 },
    camLook: { x: 0, y: 46, z: 2 },
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
