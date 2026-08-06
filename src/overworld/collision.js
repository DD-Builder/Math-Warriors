/**
 * Overworld collision world — pure horizontal collision resolution over the
 * island heightfield. Lives in src/overworld/ so it must stay plain-Node
 * importable: no three/phaser/DOM at import time, which keeps it testable
 * and deterministic. The controller proposes moves; this module answers
 * where feet can actually be in x/z after circle-prop push-out and world
 * bounds clamping. Vertical motion is the controller's job.
 */

// Shared world contract: seamless island SIZE x SIZE centered on the
// origin, ocean plane at WATER_Y.
export const SIZE = 480;
export const HALF = SIZE / 2;
export const WATER_Y = 0;

// Bodies stay this far inside the world rim so the follow camera never
// looks past the edge of the island diorama.
const EDGE_MARGIN = 2;

// Ground this close under the ocean plane still reads as water; the slack
// keeps the shoreline flag stable against heightfield sampling noise.
const WATER_EPS = 0.05;

/**
 * @param {{ sampleHeight:(x:number,z:number)=>number,
 *           sampleNormal:(x:number,z:number)=>number[] }} heightfield
 */
export function createCollisionWorld(heightfield) {
  /** @type {Map<string, {id:string, kind:string, x:number, z:number, r:number}>} */
  const colliders = new Map();

  return {
    addCollider(c) { colliders.set(c.id, c); },
    removeCollider(id) { colliders.delete(id); },
    groundHeight(x, z) { return heightfield.sampleHeight(x, z); },
    groundNormal(x, z) { return heightfield.sampleNormal(x, z); },
    isWater(x, z) { return heightfield.sampleHeight(x, z) < WATER_Y + WATER_EPS; },

    /**
     * Apply a horizontal delta, then push the body radially out of every
     * overlapping circle collider and clamp to world bounds. Push-out is
     * radial (not swept) because props are sparse and deltas are one frame
     * of walking — a body can never end a frame inside a prop.
     */
    resolveMove(pos, delta, radius) {
      let x = pos.x + (delta.x || 0);
      let z = pos.z + (delta.z || 0);
      let blocked = false;

      for (const c of colliders.values()) {
        if (c.kind !== 'circle') continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-9) {
          // Dead-center overlap has no push direction; eject along +x.
          x = c.x + min;
        } else {
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
        }
        blocked = true;
      }

      const lim = HALF - EDGE_MARGIN;
      if (x < -lim) { x = -lim; blocked = true; }
      else if (x > lim) { x = lim; blocked = true; }
      if (z < -lim) { z = -lim; blocked = true; }
      else if (z > lim) { z = lim; blocked = true; }

      return { pos: { x, y: pos.y, z }, blocked };
    },
  };
}
