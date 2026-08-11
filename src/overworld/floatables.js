/**
 * floatables — rafts, paper boats and lily pads that bob on the ocean, can be
 * shoved by a swimmer, and can be climbed onto and ridden.
 *
 * ── THE TRICK ──────────────────────────────────────────────────────────────
 * Nothing in controller.js or traversal.js knows what a raft is, and nothing
 * needs to. A collision world is exactly four functions — groundHeight,
 * groundNormal, isWater, resolveMove — so a raft can be expressed as a LOCAL
 * EDIT TO THE GROUND: inside the deck disc, the ground is the deck; the normal
 * is flat; and it is not water. `withFloatables()` returns a wrapped collision
 * world that does that, and every existing rule then falls out for free:
 *
 *   • the walk controller's step-up rule lets you climb the 0.2-0.3 m lip
 *   • walking off the edge is a drop, because the ground goes back down
 *   • the swim exit test (`seabed within swimExitDepth`) fires under a deck,
 *     so swimming into a raft IS the mount — no button, no prompt
 *   • the hero's contact shadow lands on the deck, because it reads groundAt
 *
 * ── WHY THE DECK IS SOLID FROM BELOW ───────────────────────────────────────
 * You cannot dive under a raft. That is a deliberate simplification: a
 * heightfield has one surface per column, and a five-year-old who swims under
 * something and cannot find the way out is a five-year-old who is stuck. A
 * raft you always bump up onto is strictly kinder than a raft you can drown
 * beneath (and there is no drowning, so it would just be confusing).
 *
 * PURITY: the raft SIM is stateful (rafts drift, they are world objects like
 * weather), but every function that the controller calls through is pure, and
 * `serialize()` / `restore()` make the drift part of the save so a reload puts
 * the boats back where the child left them.
 *
 * Plain-Node importable: no three, no DOM.
 */
import { WATER_Y } from './collision.js';

export const FLOAT_TUNING = {
  bobAmp: 0.10,        // m — decks breathe, they do not heave
  bobRate: 1.25,       // rad/s
  tiltAmp: 0.05,       // rad of deck roll, for the FX layer to render
  pushRange: 1.35,     // how far past the deck rim a swimmer's shove reaches
  pushEase: 5.0,       // 1/s the raft accelerates toward the shove speed
  drag: 1.1,           // 1/s the raft bleeds speed once nobody is pushing
  tether: 26,          // m a raft may wander from where it was authored before
                       // it is drawn back. Without this a bored child can push
                       // every boat on the island into one corner and the
                       // authored layout is gone forever.
  tetherPull: 0.55,    // m/s of drift home at the leash, RAMPED with how far
                       // past it the raft is (see the tether block in step()).
                       // A constant pull weaker than `drift` loses to a child
                       // who just keeps swimming, which is exactly the child
                       // who will do it — the ramp guarantees a stalemate at
                       // roughly 1.2x the leash instead of a boat in Norway.
  tetherRamp: 6.0,     // extra pull per leash-length of overshoot. At this
                       // slope the pull matches a 1.2 m/s shove about 20% past
                       // the leash, so the furthest a raft can ever be dragged
                       // is ~31 m from where it was authored.
  minDepth: 1.0,       // a raft never grounds itself: it stops where the water
                       // gets this shallow, which keeps decks reachable
  rimSoft: 0.35,       // m of deck rim that eases down to the water, so the
                       // step onto a raft is a ramp and not a wall
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * Build the raft sim from traversalSpec.FLOATABLES-shaped data.
 *
 * @param {Array<{id,kind,x,z,r,lift,drift}>} specs
 * @param {{groundAt?:(x:number,z:number)=>number, tuning?:object}} [opts]
 *        `groundAt` is the seabed sampler — a raft will not drift into water
 *        shallower than minDepth, so it can never beach itself somewhere the
 *        player then cannot swim to.
 */
export function createFloatables(specs = [], opts = {}) {
  const t = { ...FLOAT_TUNING, ...(opts.tuning || {}) };
  const groundAt = opts.groundAt || (() => -10);

  /**
   * One flat record per raft. Plain numbers only — this is what serialize()
   * writes and what the FX layer reads every frame, and neither wants to chase
   * an object graph.
   */
  const items = specs.map((s, i) => ({
    id: s.id,
    kind: s.kind || 'raft',
    // Where it was authored (the tether anchor) and where it is now.
    homeX: s.x, homeZ: s.z,
    x: s.x, z: s.z,
    vx: 0, vz: 0,
    r: s.r,
    lift: s.lift,
    drift: s.drift ?? 1.2,
    // Phases are seeded from the INDEX, not from Math.random: two runs of the
    // screenshot harness must show the boats at identical angles.
    phase: (i * 2.399963) % (Math.PI * 2),
    // Written every step, read by the FX layer and the collision wrapper.
    deckY: WATER_Y + s.lift,
    tilt: 0,
    ridden: false,
  }));

  let clock = 0;

  /** The raft whose deck disc contains (x, z), or null. Nearest wins. */
  function itemAt(x, z) {
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = x - it.x;
      const dz = z - it.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > it.r * it.r) continue;
      if (d2 < bestD2) { bestD2 = d2; best = it; }
    }
    return best;
  }

  /**
   * Deck height at (x, z), or null off-deck. The outer rimSoft of the disc
   * eases down toward the waterline so the step aboard is a ramp: at the very
   * rim the deck is level with the sea, which the walk controller's step-up
   * rule then walks straight up.
   */
  function deckAt(x, z) {
    const it = itemAt(x, z);
    if (!it) return null;
    const d = Math.hypot(x - it.x, z - it.z);
    const inner = Math.max(0, it.r - t.rimSoft);
    if (d <= inner) return it.deckY;
    const p = (d - inner) / Math.max(1e-6, it.r - inner);
    return WATER_Y + (it.deckY - WATER_Y) * (1 - p * p);
  }

  /**
   * Advance the rafts. `body` is the live traversal state (or any
   * {pos:{x,y,z}}), used for the shove: a swimmer whose head is below a deck
   * and whose body overlaps it pushes it away. Someone standing ON a deck does
   * not push it — otherwise riding a raft would shoot it out from under you.
   */
  function step(dt, body) {
    clock += dt;
    const bx = body?.pos?.x ?? 0;
    const bz = body?.pos?.z ?? 0;
    const by = body?.pos?.y ?? 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      // Bob first: the deck height the rest of the frame will see.
      const s = Math.sin(clock * t.bobRate + it.phase);
      it.deckY = WATER_Y + it.lift + s * t.bobAmp;
      it.tilt = Math.cos(clock * t.bobRate + it.phase) * t.tiltAmp;

      // Is the body aboard? (Feet at or above the deck, inside the disc.)
      const dx = it.x - bx;
      const dz = it.z - bz;
      const d = Math.hypot(dx, dz);
      const aboard = d <= it.r && by >= it.deckY - 0.35;
      it.ridden = aboard;

      // The shove: in range, below the deck, and there is a direction to push.
      let tx = 0;
      let tz = 0;
      if (!aboard && d < it.r + t.pushRange && d > 1e-4 && by < it.deckY) {
        tx = (dx / d) * it.drift;
        tz = (dz / d) * it.drift;
      }
      const ease = Math.min(1, t.pushEase * dt);
      it.vx += (tx - it.vx) * ease;
      it.vz += (tz - it.vz) * ease;
      if (tx === 0 && tz === 0) {
        const k = Math.max(0, 1 - t.drag * dt);
        it.vx *= k;
        it.vz *= k;
      }

      // The tether: past its leash a raft drifts home, gently and always.
      const hx = it.homeX - it.x;
      const hz = it.homeZ - it.z;
      const hd = Math.hypot(hx, hz);
      let px = it.vx;
      let pz = it.vz;
      if (hd > t.tether) {
        const over = (hd - t.tether) / t.tether;
        const pull = t.tetherPull * (1 + t.tetherRamp * over);
        px += (hx / hd) * pull;
        pz += (hz / hd) * pull;
      }

      // Propose the move, then refuse it if the water there is too shallow: a
      // raft that beaches itself is a raft the child can never use again.
      const nx = it.x + px * dt;
      const nz = it.z + pz * dt;
      if (WATER_Y - groundAt(nx, nz) >= t.minDepth) {
        it.x = nx;
        it.z = nz;
      } else {
        it.vx = 0;
        it.vz = 0;
      }
    }
  }

  /** Save payload: enough to put every boat back exactly where it was. */
  function serialize() {
    return {
      clock,
      items: items.map((i) => ({ id: i.id, x: i.x, z: i.z, vx: i.vx, vz: i.vz })),
    };
  }

  /** Restore a save payload. Unknown ids are ignored (the spec may have moved on). */
  function restore(data) {
    if (!data || !Array.isArray(data.items)) return;
    clock = Number.isFinite(data.clock) ? data.clock : 0;
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const rec of data.items) {
      const it = byId.get(rec?.id);
      if (!it) continue;
      if (Number.isFinite(rec.x)) it.x = rec.x;
      if (Number.isFinite(rec.z)) it.z = rec.z;
      if (Number.isFinite(rec.vx)) it.vx = rec.vx;
      if (Number.isFinite(rec.vz)) it.vz = rec.vz;
    }
  }

  return {
    items,
    step,
    deckAt,
    itemAt,
    serialize,
    restore,
    get clock() { return clock; },
    tuning: t,
  };
}

// Flat-up normal, shared: groundNormal() returns arrays and the controller
// only ever reads them, so one frozen instance serves every deck query and the
// hot path allocates nothing.
const UP = Object.freeze([0, 1, 0]);

/**
 * Wrap a collision world so that raft decks are ground.
 *
 * The returned object satisfies the same four-function contract, delegates
 * everything it does not override, and forwards addCollider/removeCollider so
 * the caller can keep using it as THE collision world rather than juggling two.
 *
 * @param {object} collisionWorld the real world (terrain + prop colliders)
 * @param {ReturnType<createFloatables>} floats
 */
export function withFloatables(collisionWorld, floats) {
  if (!floats) return collisionWorld;
  return {
    addCollider(c) { return collisionWorld.addCollider(c); },
    removeCollider(id) { return collisionWorld.removeCollider(id); },
    resolveMove(pos, delta, radius) { return collisionWorld.resolveMove(pos, delta, radius); },

    groundHeight(x, z) {
      const deck = floats.deckAt(x, z);
      const g = collisionWorld.groundHeight(x, z);
      // max(), not "deck wins": a raft that has drifted over a sandbar must not
      // punch a hole in the beach.
      return deck === null || deck < g ? g : deck;
    },

    groundNormal(x, z) {
      const deck = floats.deckAt(x, z);
      if (deck !== null && deck >= collisionWorld.groundHeight(x, z)) return UP;
      return collisionWorld.groundNormal(x, z);
    },

    /** A deck is not water: standing on a boat must not play the wade cycle. */
    isWater(x, z) {
      const deck = floats.deckAt(x, z);
      if (deck !== null && deck > WATER_Y - 0.05) return false;
      return collisionWorld.isWater(x, z);
    },
  };
}

/**
 * 0..1 how much of the deck the body is standing on, for the FX layer's sink
 * and tilt response. 0 when off the raft entirely. Pure.
 */
export function ridingWeight(floats, x, z, y) {
  const it = floats?.itemAt?.(x, z);
  if (!it) return 0;
  if (y < it.deckY - 0.4) return 0;
  const d = Math.hypot(x - it.x, z - it.z);
  return clamp(1 - d / Math.max(1e-6, it.r), 0, 1);
}
