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
 * WHY these eleven: together they cover every surface the renderer owns —
 * terrain silhouette, portal/building props, water + foam, aerial-perspective
 * depth layering, the golden end of the time-of-day curve, grass at eye level,
 * and the three atmospheric states that a still frame cannot infer from a
 * sunny one (night, rain, mist). A pose that shows nothing new is a screenshot
 * nobody reads.
 *
 * `camPos: null` means "use the normal follow camera" (still deterministic,
 * because setPose snaps rather than lerps). `weather` defaults to 'clear' and
 * is applied INSTANTLY by setPose — a cross-fade in flight would make two runs
 * of the same pose different images. Pure data — no three import — so plain
 * Node can lint/inspect this file.
 */

/**
 * @typedef {{ name:string,
 *             playerPos:{x:number,z:number},
 *             yaw:number,
 *             camPos:{x:number,y:number,z:number}|null,
 *             camLook:{x:number,y:number,z:number}|null,
 *             tod:number,
 *             weather?:string }} Pose
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
    // The coastline, framed so the SEA is the subject.
    //
    // Framing here is geometry, not taste. Two earlier versions of this pose
    // failed for opposite reasons: standing on the waterline at 7.5 m squeezed
    // the whole ocean into the top few degrees of frame (and put the eye inside
    // the tree canopy), while backing off to 24 m put 300 m of water in shot —
    // and past ~150 m the aerial fog has dissolved water into sky by design, so
    // most of the frame was haze.
    //
    // The window that works is 15-50 m of water. From 15 m at r = 184 on the
    // 40 deg bearing the pitch is 17 deg, which lays the frame out as: sky
    // above ~120 px, open water and all four depth plies through the middle,
    // the two foam lines at ~670 px, and wet sand across the bottom. The whole
    // visible sea is inside 48 m, i.e. under 15% extinction — it stays teal
    // instead of turning into sky. The Floor 2 arch sits BEHIND the eye on this
    // bearing rather than filling the middle of it.
    //
    // tod 0.15 is the morning keyframe: the sun 35 deg up in the east, which is
    // what puts the reflected glitter band on the water at ~34 deg depression —
    // just above the waterline, in the clear near field. A higher sun throws it
    // off the bottom of the frame; a lower one throws it past the fog wall.
    name: 'tidepool-foam',
    playerPos: { x: 157, z: 132 },
    yaw: 0.87,
    camPos: { x: 141, y: 15, z: 118 },
    camLook: { x: 178, y: 0, z: 149 },
    tod: 0.15,
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
    // Ember Slopes into the low western sun. tod 0.76 is the dusk keyframe:
    // golden-lavender, the sun on the horizon — the last hour before the
    // cycle hands the key light over to the moon. (It was 0.85 while the
    // cycle had only four keys; 0.85 is now twilight.) The hero sits ~25 m
    // down the view axis
    // and 13 deg off it, which clears the Floor 4 arch (6.7 deg half-width at
    // its 40 m range) instead of hiding behind it. Camera and look point drop
    // together so the pitch — and therefore the horizon line — is unchanged.
    name: 'ember-dusk',
    playerPos: { x: 127, z: -130 },
    yaw: -Math.PI * 0.75,
    camPos: { x: 150, y: 22, z: -140 },
    camLook: { x: 80, y: 14, z: -110 },
    tod: 0.76,
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
  {
    // NIGHT. Same establishing framing as spawn-vista so the two can be read
    // side by side — the only variable is the hour. tod 0.93 is between the
    // two night keyframes, i.e. full dark: stars on the dome, a warm moon
    // high, fireflies in the garden grass, and the palace a teal-indigo
    // silhouette. Proof that "night" here never means black.
    name: 'night-vista',
    playerPos: { x: 6, z: 158 },
    yaw: Math.PI,
    camPos: { x: 8, y: 26, z: 182 },
    camLook: { x: 0, y: 12, z: 110 },
    tod: 0.93,
    weather: 'clear',
  },
  {
    // RAIN over the garden at midday: streaks, ground ripples, the palette
    // walked toward deep teal, god rays extinguished, and the fog wall pulled
    // in close. Low and near so the streaks are legible at screenshot scale.
    name: 'garden-rain',
    playerPos: { x: 4, z: 146 },
    yaw: Math.PI,
    camPos: { x: 10, y: 16.5, z: 160 },
    camLook: { x: 0, y: 10, z: 128 },
    tod: 0.30,
    weather: 'rain',
  },
  {
    // MIST at dawn, from far out over the southern water looking back at the
    // island. This is the pose the height-falloff fog exists for, and it only
    // works from OUTSIDE and ABOVE the bank: the eye sits at 46 m, well clear
    // of the mist, so the palace crown and the upper terraces stay crisp while
    // the whole garden basin below ~12 m dissolves into cream. Aerial
    // perspective with no post-processing, and the one frame where the
    // difference between "fog" and "an atmosphere" is unmissable.
    name: 'palace-mist',
    playerPos: { x: 6, z: 158 },
    yaw: Math.PI,
    camPos: { x: 14, y: 46, z: 236 },
    camLook: { x: 0, y: 24, z: 120 },
    tod: 0.04,
    weather: 'mist',
  },
];

/** Names in POSES order — the list the debug API and the beauty spec drive. */
export const POSE_NAMES = POSES.map((p) => p.name);

/** @returns {Pose|null} */
export function poseByName(name) {
  return POSES.find((p) => p.name === name) || null;
}
