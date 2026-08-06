/**
 * Overworld character controller — a pure, deterministic step function over
 * the collision world. step(state, input, dt) never mutates its inputs and
 * keeps no hidden state, so identical input sequences replay to identical
 * states (save/load and tests depend on this). Semi-implicit Euler keeps
 * the jump arc stable at the fixed timesteps the render loop feeds us.
 * Plain-Node importable: no three/phaser/DOM at import time.
 */

export const DEFAULT_TUNING = { speed: 6, runSpeed: 8.5, gravity: 22, jumpV: 8.5, stepUp: 0.5, slopeLimitDeg: 50, turnRate: 10 };

// Body radius against prop colliders. Not in DEFAULT_TUNING because the
// shared tuning contract fixes that object's shape.
export const PLAYER_RADIUS = 0.6;

// Wading drags movement to just under half speed.
const WADE_SPEED_MULT = 0.45;

// Airborne bodies may never clip sideways into terrain above this margin.
const AIR_WALL_EPS = 0.01;

const TAU = Math.PI * 2;

/** Wrap an angle into (-PI, PI] for shortest-arc turning. */
function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/**
 * @param {ReturnType<import('./collision.js').createCollisionWorld>} collisionWorld
 * @param {typeof DEFAULT_TUNING} tuning
 */
export function createController(collisionWorld, tuning = DEFAULT_TUNING) {
  const t = { ...DEFAULT_TUNING, ...tuning };
  const slopeCos = Math.cos((t.slopeLimitDeg * Math.PI) / 180);

  /** Fresh state with feet snapped to the ground under (x, z). */
  function spawnState({ x = 0, z = 0, yaw = 0 } = {}) {
    return {
      pos: { x, y: collisionWorld.groundHeight(x, z), z },
      vel: { x: 0, y: 0, z: 0 },
      yaw,
      grounded: true,
      wading: collisionWorld.isWater(x, z),
    };
  }

  /**
   * Advance one frame. Returns a NEW state object; `state` and `input` are
   * read-only. input: { x, y (world-space move vector, y maps to z),
   * jump, run }.
   */
  function step(state, input, dt) {
    const px = state.pos.x;
    const py = state.pos.y;
    const pz = state.pos.z;
    let yaw = state.yaw;
    let vy = state.vel.y;
    let grounded = state.grounded;

    // Jump consumes groundedness before anything else so the launch frame
    // cannot also snap feet back to the ground.
    if (input.jump && grounded) {
      vy = t.jumpV;
      grounded = false;
    }

    // ── Horizontal intent ──
    const ix = input.x || 0;
    const iz = input.y || 0;
    const mag = Math.hypot(ix, iz);
    let dx = 0;
    let dz = 0;
    let hvx = 0;
    let hvz = 0;
    if (mag > 1e-6) {
      const throttle = Math.min(mag, 1); // analog sticks scale speed, never exceed it
      const wadingNow = grounded && collisionWorld.isWater(px, pz);
      const s = (input.run ? t.runSpeed : t.speed)
        * (wadingNow ? WADE_SPEED_MULT : 1) * throttle;
      const nx = ix / mag;
      const nz = iz / mag;
      hvx = nx * s;
      hvz = nz * s;
      dx = hvx * dt;
      dz = hvz * dt;

      // Face the move direction along the shortest arc, rate-limited.
      const diff = wrapAngle(Math.atan2(nx, nz) - yaw);
      const maxTurn = t.turnRate * dt;
      yaw = wrapAngle(yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));

      // Slope rule: a too-steep destination accepts only the tangent part
      // of the move — kill the uphill component so steep faces act as
      // walls to slide along, never ramps to climb.
      const n = collisionWorld.groundNormal(px + dx, pz + dz);
      if (n[1] < slopeCos) {
        const hl = Math.hypot(n[0], n[2]);
        if (hl > 1e-9) {
          const ux = -n[0] / hl; // horizontal uphill direction
          const uz = -n[2] / hl;
          const up = dx * ux + dz * uz;
          if (up > 0) {
            dx -= up * ux;
            dz -= up * uz;
          }
        }
      }
    }

    // ── Resolve against props + world bounds ──
    let moved = collisionWorld.resolveMove(state.pos, { x: dx, z: dz }, PLAYER_RADIUS);
    let nxp = moved.pos.x;
    let nzp = moved.pos.z;

    // Step-up rule: grounded feet may pop up at most stepUp per frame;
    // anything taller is a wall and the horizontal move is discarded
    // (props still push out even on a discarded move).
    const gyDest = collisionWorld.groundHeight(nxp, nzp);
    const wallStep = grounded
      ? gyDest - py > t.stepUp
      : gyDest > py + AIR_WALL_EPS;
    if (wallStep && (dx !== 0 || dz !== 0)) {
      moved = collisionWorld.resolveMove(state.pos, { x: 0, z: 0 }, PLAYER_RADIUS);
      nxp = moved.pos.x;
      nzp = moved.pos.z;
      hvx = 0;
      hvz = 0;
    }

    // ── Vertical ──
    let ny = py;
    const gy = collisionWorld.groundHeight(nxp, nzp);
    if (grounded) {
      if (gy >= py - t.stepUp) {
        ny = gy; // follow the ground, including step-up snaps
        vy = 0;
      } else {
        grounded = false; // walked off a drop taller than a step
        vy = 0;
      }
    }
    if (!grounded) {
      vy -= t.gravity * dt; // semi-implicit: velocity first, then position
      ny += vy * dt;
      if (ny <= gy) {
        ny = gy; // feet reached ground: land
        vy = 0;
        grounded = true;
      }
    }

    return {
      pos: { x: nxp, y: ny, z: nzp },
      vel: { x: hvx, y: vy, z: hvz },
      yaw,
      grounded,
      wading: grounded && collisionWorld.isWater(nxp, nzp),
    };
  }

  return { spawnState, step };
}
