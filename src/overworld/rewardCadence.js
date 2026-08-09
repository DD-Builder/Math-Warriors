/**
 * rewardCadence — where the island gives you nothing, and what to put there.
 *
 * ── THE MEASUREMENT, NOT THE OPINION ───────────────────────────────────────
 * "The island feels empty in places" is an opinion. This module turns it into
 * a number: sample every walkable square metre, measure the distance to the
 * nearest authored thing, and count how much ground is further away than a
 * child will walk without a reason.
 *
 * Run against the shipped island (161 authored points — 9 portals, 36 pickups,
 * 3 buildings, 9 shrines, 10 grottos, 8 landmark puzzles, 12 story pages, 51
 * toybox bodies, 5 physics puzzles), over 4651 walkable cells:
 *
 *     r   0- 19    38 cells   mean gap  6 m    0% dead
 *     r  20- 39    80 cells   mean gap 13 m    0% dead
 *     r  40- 59   162 cells   mean gap 28 m   47% dead
 *     r  60- 79   326 cells   mean gap 43 m   91% dead   <-- THE DOUGHNUT
 *     r  80- 99   427 cells   mean gap 38 m   78% dead   <-- THE DOUGHNUT
 *     r 100-119   501 cells   mean gap 25 m   31% dead
 *     r 120-139   574 cells   mean gap 16 m    7% dead
 *     r 140-159   673 cells   mean gap 14 m   10% dead
 *     r 160-179   728 cells   mean gap 16 m   13% dead
 *     r 180-199   875 cells   mean gap 25 m   34% dead   <-- THE OUTER SHORE
 *     r 200-219   267 cells   mean gap 35 m   62% dead   <-- THE OUTER SHORE
 *
 *     33% of all walkable ground is >= 30 m from ANY authored thing.
 *
 * The shape of the problem is not "the island is empty" — the biome rings at
 * r 120-180 are dense and good. It is TWO SPECIFIC HOLES:
 *
 *   THE DOUGHNUT (r 60-100). The annulus between the palace mesa's foot and
 *     the inner edge of the biome ring. It is 753 cells — 16% of the island —
 *     and 84% of it is dead. Worse, it is not optional ground: it is the ring
 *     road. Every trip between two neighbouring biomes, and every trip to the
 *     palace, crosses it. Measured worst points sit 50-64 m from anything,
 *     which at the walk speed of 6 m/s is 17-21 s of holding forward with the
 *     world giving back nothing at all — and the biome-to-biome crossing goes
 *     through two of them back to back, so the real number a child feels is
 *     35-45 s.
 *
 *   THE OUTER SHORE (r > 180). Beach and headland outside the biome rings.
 *     Less serious — nobody has to go there — but it is where a curious child
 *     goes FIRST, because the edge of a world is interesting, and it is the
 *     one part of the island that punishes curiosity.
 *
 * ── FOUR KINDS OF FILL, AND WHY NOT JUST MORE COINS ────────────────────────
 * The lazy fix is to scatter forty more coins. That fixes the metric and not
 * the feeling: a coin is the same event every time, and forty of them is one
 * event repeated. The fills below are four DIFFERENT promises, so a crossing
 * gives a child a varied little rhythm rather than a slot machine:
 *
 *   vista      a framed look. The camera steps off the hero for 2 s and shows
 *              them where they are going. Costs nothing, is the single best
 *              thing an open world does, and the doughnut is where it belongs
 *              because the doughnut is exactly the ground you can see FROM.
 *   trail      a run of coins that goes SOMEWHERE — every trail below ends at
 *              a real destination, so following it teaches the route. A coin
 *              trail into a blank field is a bribe; a coin trail into a shrine
 *              is a signpost a five-year-old will actually read.
 *   banter     the party says something about where they are. The scene
 *              already has pickBanter on a walking TIMER, which makes the
 *              party comment on nothing in particular; giving it PLACES turns
 *              the same lines into observations.
 *   ping       the "something is near" chirp, at the range where a child could
 *              plausibly turn and find it. Cheapest of the four, and the one
 *              that turns dead ground into a corridor with an exit.
 *
 * ── SHAPE ──────────────────────────────────────────────────────────────────
 * Pure and self-contained. It owns its own pickups and does its own proximity
 * scan (the same squared-compare loop discovery.js runs, over 40 records), so
 * it needs no change to props.js and no change to worldSpec — one line in the
 * host's tick and the whole cadence layer is live. Nothing here allocates in
 * the steady state.
 */
import { PAPER } from '../config.js';

// ───────────────────────────────────────────────────────────────────────────
// THE AUDIT
// ───────────────────────────────────────────────────────────────────────────

/** Walk speed, m/s — controller.js DEFAULT_TUNING.speed. The clock of the audit. */
export const WALK_SPEED = 6;

/**
 * Seconds of walking with no reward before the ground counts as dead.
 *
 * Five is the number the brief asks about ("30-60 s of walking yields
 * nothing"), halved, because the audit measures a RADIUS and a child crossing
 * dead ground walks in and out again — a 30 m gap is 10 s of approach and
 * 10 s of departure with nothing in between.
 */
export const DEAD_SECONDS = 5;
/** ...as metres. */
export const DEAD_RADIUS = DEAD_SECONDS * WALK_SPEED;

/**
 * Measure the island.
 *
 * @param {object} opts
 *   points     [{x, z}] everything authored. The caller assembles this,
 *              because which specs exist is the caller's business and this
 *              module must not hard-import a file that is still in flight.
 *   heightAt   (x, z) => y
 *   slopeAt    (x, z) => degrees   (optional; unwalkable ground is skipped)
 *   step       grid resolution, metres (default 5)
 *   extent     half-size of the sampled square (default 200)
 *   waterY     ground at or below this is sea (default 1.2 — beach counts as
 *              sea for this purpose; nobody walks the surf line for fun)
 *   maxSlope   degrees above which ground is a cliff, not a route (default 45)
 * @returns {{cells:number, dead:number, deadFraction:number,
 *            bands:Array, worst:Array, meanGap:number}}
 */
export function auditCadence({
  points = [],
  heightAt,
  slopeAt = null,
  step = 5,
  extent = 200,
  waterY = 1.2,
  maxSlope = 45,
  deadRadius = DEAD_RADIUS,
  bandWidth = 20,
  worstCount = 14,
  worstSpacing = 40,
} = {}) {
  if (typeof heightAt !== 'function') throw new TypeError('auditCadence needs heightAt');
  const cells = [];
  for (let x = -extent; x <= extent; x += step) {
    for (let z = -extent; z <= extent; z += step) {
      const y = heightAt(x, z);
      if (!(y > waterY)) continue;
      if (slopeAt && slopeAt(x, z) > maxSlope) continue;
      cells.push({ x, z, y, gap: nearestGap(points, x, z) });
    }
  }
  const dead = cells.filter((c) => c.gap >= deadRadius);
  const bands = [];
  const byBand = new Map();
  for (const c of cells) {
    const b = Math.floor(Math.hypot(c.x, c.z) / bandWidth) * bandWidth;
    let rec = byBand.get(b);
    if (!rec) { rec = { r0: b, r1: b + bandWidth - 1, cells: 0, sum: 0, dead: 0 }; byBand.set(b, rec); bands.push(rec); }
    rec.cells++;
    rec.sum += c.gap;
    if (c.gap >= deadRadius) rec.dead++;
  }
  bands.sort((a, b) => a.r0 - b.r0);
  for (const b of bands) {
    b.meanGap = b.sum / b.cells;
    b.deadFraction = b.dead / b.cells;
    delete b.sum;
  }

  // Worst offenders, thinned so the list is fourteen PLACES and not fourteen
  // samples of the same field.
  const sorted = cells.slice().sort((a, b) => b.gap - a.gap);
  const worst = [];
  for (const c of sorted) {
    if (c.gap < deadRadius) break;
    if (worst.every((w) => Math.hypot(w.x - c.x, w.z - c.z) > worstSpacing)) {
      worst.push({ x: c.x, z: c.z, y: c.y, gap: c.gap, seconds: c.gap / WALK_SPEED });
    }
    if (worst.length >= worstCount) break;
  }

  return {
    cells: cells.length,
    dead: dead.length,
    deadFraction: cells.length ? dead.length / cells.length : 0,
    meanGap: cells.length ? cells.reduce((a, c) => a + c.gap, 0) / cells.length : 0,
    bands,
    worst,
  };
}

/** Distance from (x, z) to the nearest authored point. Infinity if there are none. */
export function nearestGap(points, x, z) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = p.x - x;
    const dz = p.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/**
 * Flatten the world's specs into the flat {x, z, kind} list the audit wants.
 *
 * Everything is optional. Pass what exists; a spec that has not landed yet is
 * simply absent from the count, and the audit still runs.
 */
export function collectPoints({
  portals = [], collectibles = [], buildings = [], shrines = [], grottos = [],
  landmarks = [], pages = [], toys = [], puzzles = [], extra = [],
} = {}) {
  const out = [];
  const at = (o) => (o.at ? o.at : o);
  const push = (list, kind, get = at) => {
    for (const o of list || []) {
      const p = get(o);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z, kind, id: o.id });
    }
  };
  push(portals, 'portal');
  push(collectibles, 'pickup');
  push(buildings, 'building');
  push(shrines, 'shrine');
  push(grottos, 'grotto');
  push(landmarks, 'landmark');
  push(pages, 'page');
  push(toys, 'toy');
  push(puzzles, 'puzzle', (p) => (p.zones && p.zones[0]) || p.sign || p);
  for (const e of extra) if (e) out.push({ x: e.x, z: e.z, kind: e.kind || 'extra', id: e.id });
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// THE FILLS
// ───────────────────────────────────────────────────────────────────────────

export const FILL_KINDS = Object.freeze(['vista', 'trail', 'banter', 'ping']);

/**
 * Every fill, sited against the audit above.
 *
 * ── HOW THE COORDINATES WERE CHOSEN ────────────────────────────────────────
 * Not by taste. For each of the eight compass sectors, the ground between
 * r 62 and r 104 was sampled at 2 m and 3-degree resolution, scored for
 * PROMINENCE (height above the mean of a 22 m ring — i.e. can you see from
 * here) and for GAP (distance to the nearest authored thing), and the winner
 * of each was taken. Sectors whose winner had real prominence got a vista;
 * the flat ones got a trail or banter instead, because a "vista" on ground
 * with 1 m of prominence is a lie the child can see through immediately.
 *
 * Measured prominence, in metres, for the eight sector winners:
 *   ember 13.1 | frost 7.2 | library 5.8 | sky 5.5 |
 *   garden 2.4 | crystal 2.0 | tidepool 1.1 | market -1.0
 *
 * So: four vistas, and the other four sectors get the cheaper fills.
 *
 * FIELDS
 *   id       stable; the save records which have fired
 *   kind     one of FILL_KINDS
 *   at       {x, z}
 *   radius   metres at which it fires
 *   once     true for a one-shot (a vista is a reveal; a banter line is not)
 *   payload  kind-specific:
 *     vista  {look:{x,z}, name, line, gold, dwell} — where the camera turns to,
 *            what the guide says, what it pays, how long it holds
 *     trail  {to:{x,z}, coins, amount} — the trail is generated toward `to`
 *     banter {topic} — a hint to the scene's existing banter picker
 *     ping   {toward:{x,z}, line} — "there is something over there"
 */
export const CADENCE_FILLS = Object.freeze([
  // ── THE DOUGHNUT, r 60-100 — the ring road ───────────────────────────────
  {
    id: 'vista-ember-shoulder', kind: 'vista', once: true,
    at: { x: 43, z: -47 }, radius: 13,
    payload: {
      look: { x: 125, z: -125 }, name: 'The Ember Shoulder',
      line: 'From up here you can see it breathing. Orange, all the way down.',
      gold: 40, dwell: 2.2, tint: PAPER.orange,
    },
  },
  {
    id: 'vista-frost-saddle', kind: 'vista', once: true,
    at: { x: -3, z: -66 }, radius: 13,
    payload: {
      look: { x: 0, z: -160 }, name: 'The Frost Saddle',
      line: 'White the whole way. Whatever fell up there has not moved since.',
      gold: 40, dwell: 2.2, tint: PAPER.tealL,
    },
  },
  {
    id: 'vista-library-step', kind: 'vista', once: true,
    at: { x: -60, z: 49 }, radius: 13,
    payload: {
      look: { x: -125, z: 125 }, name: 'The Reading Step',
      line: 'Count the shelves going down. I never can.',
      gold: 40, dwell: 2.2, tint: PAPER.sand,
    },
  },
  {
    id: 'vista-sky-knuckle', kind: 'vista', once: true,
    at: { x: 96, z: -30 }, radius: 13,
    payload: {
      look: { x: 160, z: 0 }, name: 'The Knuckle',
      line: 'Somebody cut the sky into steps and then walked away.',
      gold: 40, dwell: 2.2, tint: PAPER.sky,
    },
  },

  // ── The four flat sectors: trails and talk ───────────────────────────────
  // Every trail ENDS somewhere real, so following it is learning the route.
  {
    id: 'trail-palace-road', kind: 'trail', once: true,
    at: { x: 23, z: 75 }, radius: 16,
    // Up the palace road to the foot of the spiral ramp.
    payload: { to: { x: 1, z: 58 }, coins: 7, amount: 15 },
  },
  {
    id: 'trail-tidepool-cut', kind: 'trail', once: true,
    at: { x: 49, z: 66 }, radius: 16,
    // Out along the shoulder toward the tidepool shrine's approach.
    payload: { to: { x: 111, z: 82 }, coins: 8, amount: 15 },
  },
  {
    id: 'trail-crystal-draw', kind: 'trail', once: true,
    at: { x: -35, z: -65 }, radius: 16,
    // Down the draw toward the crystal grotto.
    payload: { to: { x: -76, z: -112 }, coins: 8, amount: 15 },
  },
  {
    id: 'trail-market-lane', kind: 'trail', once: true,
    at: { x: -70, z: -18 }, radius: 16,
    // Into the top of the market's main street.
    payload: { to: { x: -106, z: 34 }, coins: 8, amount: 15 },
  },

  // ── Banter: the party notices the ring road ──────────────────────────────
  {
    id: 'banter-doughnut-north', kind: 'banter', once: false,
    at: { x: 0, z: 74 }, radius: 18, cooldown: 90,
    payload: { topic: 'palace' },
  },
  {
    id: 'banter-doughnut-west', kind: 'banter', once: false,
    at: { x: -71, z: -22 }, radius: 18, cooldown: 90,
    payload: { topic: 'market' },
  },
  {
    id: 'banter-doughnut-east', kind: 'banter', once: false,
    at: { x: 86, z: 4 }, radius: 18, cooldown: 90,
    payload: { topic: 'sky' },
  },
  {
    id: 'banter-doughnut-south', kind: 'banter', once: false,
    at: { x: -21, z: -69 }, radius: 18, cooldown: 90,
    payload: { topic: 'frost' },
  },

  // ── THE OUTER SHORE, r > 180 — rewarding curiosity ───────────────────────
  {
    id: 'ping-north-shore', kind: 'ping', once: true,
    at: { x: 80, z: 185 }, radius: 22,
    payload: { toward: { x: 152, z: 147 }, line: 'Something out on the stacks.' },
  },
  {
    id: 'ping-south-shore', kind: 'ping', once: true,
    at: { x: 65, z: -195 }, radius: 22,
    payload: { toward: { x: 82.8, z: -139.3 }, line: 'Warm air, coming off the shore.' },
  },
  {
    id: 'ping-west-shore', kind: 'ping', once: true,
    at: { x: -190, z: 80 }, radius: 22,
    payload: { toward: { x: -149.6, z: -15.9 }, line: 'Lantern light, back inland.' },
  },
  {
    id: 'ping-southwest-shore', kind: 'ping', once: true,
    at: { x: -185, z: -95 }, radius: 22,
    payload: { toward: { x: -115.1, z: -75.2 }, line: 'A shrine bell, a long way off.' },
  },
]);

/** Fills of one kind. */
export function fillsOfKind(kind, fills = CADENCE_FILLS) {
  return fills.filter((f) => f.kind === kind);
}

/**
 * Turn every 'trail' fill into real pickup records.
 *
 * Shape is exactly worldSpec.COLLECTIBLES's — {id, kind, x, z, amount} — so a
 * host that would rather put them in the props pass can merge them there with
 * mergeCollectibles() and nothing else changes. The runtime below can also
 * serve them itself, which is the zero-diff option.
 *
 * The coins are laid on a shallow ARC rather than a straight line: a straight
 * line of coins reads as a fence, a curve reads as a path, and the curve is
 * what makes a child follow it round a shoulder they cannot see past.
 */
export function trailCollectibles(fills = CADENCE_FILLS, { bow = 0.14 } = {}) {
  const out = [];
  for (const f of fills) {
    if (f.kind !== 'trail') continue;
    const { to, coins, amount } = f.payload;
    const dx = to.x - f.at.x;
    const dz = to.z - f.at.z;
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular, for the bow.
    const px = -dz / len;
    const pz = dx / len;
    for (let i = 0; i < coins; i++) {
      const t = (i + 1) / (coins + 1);
      const arc = Math.sin(t * Math.PI) * len * bow;
      out.push({
        id: `${f.id}-${i + 1}`,
        kind: 'gold',
        x: +(f.at.x + dx * t + px * arc).toFixed(2),
        z: +(f.at.z + dz * t + pz * arc).toFixed(2),
        amount,
        trail: f.id,
      });
    }
  }
  return out;
}

/** All the coin-trail pickups, precomputed. */
export const CADENCE_COLLECTIBLES = Object.freeze(trailCollectibles());

/** Additive, idempotent merge into an existing collectible list. */
export function mergeCollectibles(base = []) {
  const out = Array.isArray(base) ? base.slice() : [];
  const seen = new Set(out.map((c) => c && c.id));
  for (const c of CADENCE_COLLECTIBLES) if (!seen.has(c.id)) { out.push(c); seen.add(c.id); }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// THE RUNTIME
// ───────────────────────────────────────────────────────────────────────────

/** How often the proximity scan runs, seconds. 8 Hz is far more than enough. */
const SCAN_HZ = 1 / 8;

/**
 * Fire the fills as the player walks.
 *
 * @param {object} opts
 *   save    one-shot fills are recorded on save.overworld.cadence
 *   hooks   onVista(fill, payload)   turn the camera, pay the gold, say the line
 *           onTrail(fill, coins)     light the trail up (they are already live)
 *           onBanter(fill, topic)    ask the scene's banter picker for a line
 *           onPing(fill, payload)    chirp, and point the compass
 *           onCoin({id, amount})     a trail coin was walked over
 *   fills   override the table (tests)
 *   coins   override the pickups (tests, or a host serving them from props.js)
 */
export function createCadenceRuntime({
  save = null, hooks = {}, fills = CADENCE_FILLS, coins = CADENCE_COLLECTIBLES,
  pickupRadius = 2.6, serveCoins = true,
} = {}) {
  const ledger = ensureCadence(save);
  let scanT = 0;
  /** id -> seconds until this repeatable fill may fire again. */
  const cooldowns = new Map();
  /** Fills the player is standing inside right now, so one entry fires once. */
  const inside = new Set();
  /** Live trail coins, filtered by what the save already has. */
  const live = coins.filter((c) => ledger.coins.indexOf(c.id) < 0);

  function ensureCadence(s) {
    if (!s) return { seen: [], coins: [] };
    if (!s.overworld) s.overworld = {};
    if (!s.overworld.cadence) s.overworld.cadence = { seen: [], coins: [] };
    const c = s.overworld.cadence;
    if (!Array.isArray(c.seen)) c.seen = [];
    if (!Array.isArray(c.coins)) c.coins = [];
    return c;
  }

  function fire(f) {
    const p = f.payload || {};
    switch (f.kind) {
      case 'vista': hooks.onVista?.(f, p); break;
      case 'trail': hooks.onTrail?.(f, live.filter((c) => c.trail === f.id)); break;
      case 'banter': hooks.onBanter?.(f, p.topic); break;
      case 'ping': hooks.onPing?.(f, p); break;
      default: break;
    }
    if (f.once && ledger.seen.indexOf(f.id) < 0) ledger.seen.push(f.id);
    if (f.cooldown > 0) cooldowns.set(f.id, f.cooldown);
  }

  /**
   * One tick. Same contract as discoveryWiring's update: position and dt.
   * @returns {number} how many fills fired this tick (usually 0)
   */
  function update(x, z, dt = 0) {
    for (const [id, t] of cooldowns) {
      const left = t - dt;
      if (left <= 0) cooldowns.delete(id);
      else cooldowns.set(id, left);
    }

    // Trail coins run every tick — a coin you walked over must vanish now, not
    // an eighth of a second from now.
    if (serveCoins) {
      for (let i = live.length - 1; i >= 0; i--) {
        const c = live[i];
        const dx = c.x - x;
        const dz = c.z - z;
        if (dx * dx + dz * dz > pickupRadius * pickupRadius) continue;
        live.splice(i, 1);
        ledger.coins.push(c.id);
        hooks.onCoin?.({ id: c.id, kind: c.kind, amount: c.amount, x: c.x, z: c.z, trail: c.trail });
      }
    }

    scanT -= dt;
    if (scanT > 0) return 0;
    scanT = SCAN_HZ;

    let fired = 0;
    for (const f of fills) {
      const dx = f.at.x - x;
      const dz = f.at.z - z;
      const within = dx * dx + dz * dz <= f.radius * f.radius;
      if (!within) { inside.delete(f.id); continue; }
      if (inside.has(f.id)) continue;
      inside.add(f.id);
      if (f.once && ledger.seen.indexOf(f.id) >= 0) continue;
      if (cooldowns.has(f.id)) continue;
      fire(f);
      fired++;
    }
    return fired;
  }

  return {
    update,
    /** Live trail coins, for a host that wants to draw them itself. */
    get coins() { return live; },
    /** How much of the cadence layer the player has met, 0..1. */
    progress() {
      const once = fills.filter((f) => f.once);
      if (!once.length) return 1;
      return once.filter((f) => ledger.seen.indexOf(f.id) >= 0).length / once.length;
    },
    seen(id) { return ledger.seen.indexOf(id) >= 0; },
    /** A new game, or the settings' "show me the sights again". */
    reset() {
      ledger.seen.length = 0;
      ledger.coins.length = 0;
      inside.clear();
      cooldowns.clear();
      live.length = 0;
      for (const c of coins) live.push(c);
    },
  };
}
