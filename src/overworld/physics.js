/**
 * The physics toybox — a real rigid-body world under the papercut island.
 *
 * WHY a physics engine at all, when the hero already has a collision world:
 * ./collision.js answers ONE question ("where may these feet be?") and answers
 * it perfectly for a character controller. It cannot answer the question this
 * module exists for, which is "what happens to everything ELSE?" A crate you
 * shove has to slide, tip, and stack; a log has to find the fall line and roll
 * down it; a plank laid over two rocks has to become a see-saw; a barrel
 * dropped in the pond has to bob. Those are not one query, they are a solver,
 * and hand-rolling a solver that a five-year-old can stack three boxes with is
 * strictly harder than adopting one. Rapier is that solver.
 *
 * ── THE DIVISION OF LABOUR ────────────────────────────────────────────────
 * The hero is NOT a Rapier body. controller.js keeps every metre of its tuning
 * (coyote time, step-up, slope limit, the 0.20 s to sprint) because that tuning
 * IS the game feel, and a dynamic capsule would throw all of it away in
 * exchange for physical plausibility nobody asked for. Instead the hero is a
 * KINEMATIC PRESENCE: a position-based kinematic body that pushes props and is
 * never pushed back. Props are dynamic. Terrain is static. That is the whole
 * topology, and it means a Rapier failure can never make the hero unplayable.
 *
 * ── WHY THE PURE MATH IS SEPARATE FROM THE ENGINE ─────────────────────────
 * Everything above `createPhysicsWorld` is plain arithmetic over plain numbers:
 * the buoyancy curve, the wind field, the fixed-step accumulator, the body-pool
 * eviction order, the terrain grid packing. None of it imports Rapier or three,
 * so `physics.test.js` runs it in bare Node in milliseconds and pins the
 * behaviours a screenshot could never catch — that wood floats at 55 % draught
 * and stone does not float at all, that the accumulator never advances on wall
 * clock, that the 121st crate evicts the oldest unpinned one and not a puzzle
 * piece. The Rapier half below is then only PLUMBING: it moves numbers this
 * file already proved into and out of the solver.
 *
 * ── WHY BUOYANCY IS MULTI-POINT ───────────────────────────────────────────
 * A single upward force at the centre of mass floats a body, but it floats it
 * like a bath toy with a magnet in it: no righting moment, no list, no rock. A
 * plank must lie FLAT on the water and see-saw when a child stands on one end;
 * a log must lie on its SIDE and roll; a crate must find a face. All three fall
 * out for free if the displaced volume is split across a handful of buoy points
 * bolted to the body's local frame — each point pushes up only as far as it is
 * itself underwater, so the deep end pushes harder and the body rights itself.
 * Four points on a plank, two on a log, one on a ball. It costs four force
 * applications on a body that is actually in the water, and it is the entire
 * difference between "it floats" and "it feels good", which is what the brief
 * asked for.
 *
 * Each buoy point carries the vertical SPAN of the slice of body it stands for
 * and ramps its lift linearly across it, rather than switching on at the
 * waterline. That is not a smoothing hack, it is the actual displaced volume of
 * that slice, and it is why the settled draught comes out at the density ratio
 * exactly: measured, a 0.55-density crate rests with 0.53 of itself under and a
 * 0.30-density ball with 0.30. A hard switch instead makes a float buzz at
 * 60 Hz forever, and a fixed-width soft ramp floats everything at the wrong
 * waterline — see `pointSubmergence` for the numbers that killed both.
 *
 * ── WHY WIND IS A FIELD AND NOT AN IMPULSE ────────────────────────────────
 * weather.js already publishes a wind SCALE (1.0 clear, 2.1 breezy, 2.6 storm)
 * that drives every blade of grass on the island. A leaf that blew on its own
 * schedule would be the one object in frame disagreeing with the field it is
 * lying in. So the wind here is a deterministic vector field sampled from the
 * SIM clock and multiplied by that same scale: same clock, same sway, one
 * weather. Gusts come from summing two slow incommensurable sines, which reads
 * as "wind" and — unlike noise — is exactly reproducible for the screenshot
 * harness.
 *
 * ── DETERMINISM ───────────────────────────────────────────────────────────
 * No `Date.now`, no `performance.now`, no `Math.random` anywhere in this file.
 * The world advances in whole 1/60 s substeps off an accumulator the caller
 * feeds; a long frame runs more substeps, never a bigger one, and a
 * catastrophically long frame (a backgrounded tab) drops the surplus rather
 * than exploding the solver. Two runs fed the same dt sequence produce the same
 * world.
 *
 * Constraints honoured: three r170 only and imported for math types alone, no
 * post-processing, no depth-texture reads, no fwidth, no allocation in step()
 * beyond what Rapier's own getters do (see `readTransforms`), Rapier itself
 * loaded through a LAZY dynamic import so it never enters the eager bundle,
 * and dispose() frees the Rapier world and every handle taken from it.
 */

// ────────────────────────────────────────────────────────────────────────
// Tuning
// ────────────────────────────────────────────────────────────────────────

/**
 * Every number the toybox runs on. Seeded from the character controller where
 * the two must agree — a crate that falls at a different rate from the hero
 * who pushed it is the single most obvious way to make a world feel fake.
 */
export const PHYS = {
  // ── Solver ──────────────────────────────────────────────────────────────
  /** m/s^2. NEGATIVE here (a vector), positive 22 in controller.js (a rate). */
  gravity: -22,
  /** Substep rate. Fixed, and the only rate the solver ever sees. */
  fixedHz: 60,
  /**
   * Whole substeps one call to step() may run. Four is 66 ms of catch-up:
   * enough to absorb a GC pause or a shader compile, short enough that a tab
   * restored after a minute in the background resumes instead of simulating a
   * minute of physics in one frame and flinging every crate into the sea.
   */
  maxSubsteps: 4,
  /** Rapier velocity-solver iterations. 4 is its default; 6 stacks cleaner. */
  solverIterations: 6,

  // ── Population ──────────────────────────────────────────────────────────
  /** Hard ceiling on simultaneous dynamic bodies. */
  maxBodies: 120,
  /**
   * ── AUTO-SLEEP IS RAPIER'S, AND IT IS LOAD-BEARING ────────────────────────
   * A body that stops moving is parked by the solver: no constraint work, no
   * transform read, no draw-matrix write. That is what makes forty crates
   * affordable — a settled garden costs almost nothing.
   *
   * The thresholds themselves are compile-time constants in the Rust core and
   * are NOT exposed by the JS bindings, so there is no knob here to turn and
   * an invented one would be a lie. What this module DOES control is the thing
   * that was silently defeating them: every field impulse is applied with
   * `wakeUp = false`. Applying buoyancy with `wakeUp = true` — the obvious
   * default — re-arms the sleep timer on every substep, so a perfectly still
   * floating plank never sleeps and forty floating props stay hot forever.
   * (Measured: 5/5 bodies awake after 20 s with `true`, 0/5 with `false`, at
   * identical resting positions.) A sleeping body does not move, so its
   * waterline is preserved exactly; a bump from the hero or a neighbour wakes
   * it through the normal contact path and buoyancy resumes on the next step.
   */

  // ── Terrain ─────────────────────────────────────────────────────────────
  /**
   * Physics terrain cells across the 480 m island. 96 cells = 5 m each, which
   * is ~1/40th of the render mesh's resolution and completely invisible: a
   * crate cares that the hill slopes, not that it has a 12 cm bump on it. The
   * collider is 97 x 97 = 9409 heights, one Float32Array, built once.
   */
  terrainCells: 96,
  /**
   * Metres the physics ground is dropped below the sampled surface. The coarse
   * grid cuts corners off convex ground, so props on a knoll would hover a few
   * centimetres; sinking the whole sheet slightly means the error lands the
   * other way, where a papercut shadow hides it.
   */
  terrainBias: 0.06,

  // ── Fluid ───────────────────────────────────────────────────────────────
  /** Reference density. Anything under 1.0 floats, anything over sinks. */
  fluidDensity: 1.0,
  /** Ocean plane. Ponds carry their own level; see `waterLevelAt`. */
  waterY: 0,
  /**
   * Fallback slab thickness for a buoy point whose spec did not give one.
   * Real bodies always should — see `pointSubmergence`.
   */
  surfaceSoftness: 0.26,
  /** Linear damping added at full submersion. Water is thick. */
  waterLinearDrag: 2.7,
  /** Angular damping added at full submersion — this is what stops the wobble. */
  waterAngularDrag: 3.6,
  /** Damping a body has in air. Small, but it keeps stacks from creeping. */
  airLinearDrag: 0.06,
  airAngularDrag: 0.14,
  /**
   * Extra downward pull on a body whose buoy points are ALL dry but whose
   * centre is under water — i.e. a stone on the bottom. Without it a heavy
   * body rests on the bed with almost no normal force and slides around like
   * it is on ice.
   */
  sunkGrip: 0.55,

  // ── Wind ────────────────────────────────────────────────────────────────
  /** Prevailing bearing, in TURNS. 0.62 blows from the sea toward the market. */
  windBearing: 0.62,
  /** Turns the bearing swings either side of prevailing. */
  windSwingTurns: 0.05,
  /** Hz of that swing. Slow — a wind that changes direction fast reads as bugs. */
  windSwingHz: 0.041,
  /** Hz of the gust envelope, and how deep the gusts cut. */
  windGustHz: 0.19,
  windGustDepth: 0.42,
  /** A second, faster gust ply. Incommensurable with the first on purpose. */
  windFlutterHz: 0.73,
  windFlutterDepth: 0.16,
  /** m/s of air speed at weather wind scale 1.0 (i.e. a clear day). */
  windSpeed: 5.6,
  /**
   * Air density, in the same water-is-1 units every body's density uses.
   *
   * This constant is the whole reason the wind field is safe. `sail` is
   * 0.5 * rho_air * Cd * A — a real drag coefficient — so wind acceleration
   * comes out as (0.5 rho_air Cd A v^2) / (rho_body V), and the mass on the
   * bottom of that fraction is the SAME mass the buoyancy uses. Get the
   * density out of the numerator (treat `sail` as "how windy does this feel")
   * and the units silently stop being units: measured, a leaf's 8.6e-4 of mass
   * against an invented sail of 1.05 produced a 637 m/s velocity change in ONE
   * substep and the solver panicked inside wasm on frame 1. Physical constants
   * are not decoration.
   */
  airDensity: 0.0012,
  /**
   * Hard ceiling on the velocity change any FIELD (buoyancy, wind, bed grip)
   * may impart to a body in one substep, m/s. Nothing physical comes close;
   * this exists so that a bad tuning number degrades into a body that moves
   * oddly rather than into a Rust panic that takes the tab with it. Rapier
   * cannot be restarted after a wasm trap, so this backstop is not optional.
   */
  maxFieldDV: 2.5,
  /**
   * Gust level above which a sleeping leaf is woken. Leaves must be allowed to
   * sleep or forty of them never stop costing solver time; they must also
   * actually blow about, or they are litter. Waking them only on real gusts
   * gets both: the garden is still, then a gust crosses it and the whole drift
   * lifts at once, which is a nicer thing to watch than constant jitter.
   */
  windWakeGust: 0.68,
  /**
   * sail/mass above which a gust is allowed to WAKE a sleeping body.
   *
   * The gust-wake above was written as "any body with a sail", and every kind
   * except the kerbstone has a sail, so in practice it woke the entire toybox
   * on every gust and NOTHING in the garden ever slept — 2 of 49 bodies asleep
   * after fifteen seconds of calm, where the honest number is most of them.
   * Sleep is the thing that makes a hundred bodies affordable, so defeating it
   * by accident is expensive.
   *
   * The separation is not close, which is why a plain threshold is the right
   * tool. Measured sail/mass, in the units this file uses:
   *
   *     leaf  2.0e-1      <- the only body the wind can actually move
   *     plank 9.4e-3
   *     ball  1.6e-3
   *     log   1.5e-3
   *     crate 1.3e-3
   *     stone 0
   *
   * 5e-2 sits in the twenty-fold gap between the leaf and the plank. A body
   * under it is one the wind cannot shift against friction anyway (a crate's
   * wind acceleration is 0.04 m/s^2 against gravity's 22), so leaving it asleep
   * costs nothing visible and saves the solver the whole garden.
   */
  windWakeRatio: 5e-2,
};

/** Seconds per substep. Derived once so no call site can disagree. */
export const FIXED_DT = 1 / PHYS.fixedHz;

// ────────────────────────────────────────────────────────────────────────
// Pure math — no Rapier, no three, no DOM. All of this is unit tested.
// ────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

/** Clamp to 0..1. */
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Fraction of a SPHERE of radius `r` centred at `centerY` that lies below
 * `waterY`. Exact spherical-cap volume, not a linear guess.
 *
 * WHY exact: a ball is the one body whose waterline a child watches closely
 * (it bobs, and it is round, so the eye has a reference), and the linear
 * approximation is 18 % wrong at half draught — a beach ball that sits visibly
 * too low. The closed form costs three multiplies.
 *
 *   cap volume  = pi * d^2 * (3r - d) / 3
 *   sphere      = 4/3 * pi * r^3
 *   fraction    = d^2 * (3r - d) / (4 r^3)
 */
export function sphereSubmergedFraction(centerY, r, waterY) {
  if (!(r > 0)) return centerY < waterY ? 1 : 0;
  const d = waterY - (centerY - r);          // depth of the lowest point
  if (d <= 0) return 0;
  if (d >= 2 * r) return 1;
  return clamp01((d * d * (3 * r - d)) / (4 * r * r * r));
}

/**
 * Fraction of an upright SLAB of half-height `halfH` below `waterY`. Linear,
 * and deliberately so: for a box the exact answer depends on its orientation
 * and is piecewise with kinks at every vertex crossing, and a force whose
 * derivative jumps is exactly what makes a float buzz. The multi-point buoyancy
 * this feeds recovers the orientation behaviour anyway, from geometry rather
 * than from a formula.
 */
export function slabSubmergedFraction(centerY, halfH, waterY) {
  if (!(halfH > 0)) return centerY < waterY ? 1 : 0;
  return clamp01((waterY - (centerY - halfH)) / (2 * halfH));
}

/**
 * How much of one buoy point's slab is displacing, 0..1.
 *
 * ── WHY A POINT HAS A THICKNESS ───────────────────────────────────────────
 * A buoy point is not a point, it is a shorthand for the slice of the body it
 * stands for, and `span` is that slice's vertical thickness with the point at
 * its middle. Ramping over a small fixed constant instead — the obvious first
 * implementation — floats everything, but at the WRONG WATERLINE: with one
 * centre point and a 26 cm ramp, a 90 cm wooden crate reaches equilibrium
 * 14 cm down instead of the 50 cm Archimedes demands, so it rides like a
 * balloon. (Measured, before this was fixed: crate centre settled at -0.138 m
 * where the correct answer is -0.045 m, and a crate that should be half under
 * was showing eight-ninths of itself.) Handing the point the slab it actually
 * represents makes the ramp EXACT rather than approximate, and the settled
 * draught comes out at the density ratio on the nose.
 *
 * Linear, not smoothed. A smoothstep would be C1 at the ends but wrong in the
 * middle, and the middle is where a floating body lives — every draught
 * between 0 and 1 is a real equilibrium some density asks for. The kinks are
 * at fully-dry and fully-under, where a floater never rests, and the fluid
 * damping below covers a body that is briefly slammed through one.
 */
export function pointSubmergence(pointY, waterY, span = PHYS.surfaceSoftness) {
  return slabSubmergedFraction(pointY, span * 0.5, waterY);
}

/**
 * Upward newtons from one buoy point.
 *
 * `volume` is the WHOLE body's displaced volume and `share` is this point's
 * fraction of it (the shares over a body must sum to 1, which
 * `buoyShareSum` exists to let the tests assert).
 *
 * Archimedes: F = rho_fluid * V_displaced * g. Returned POSITIVE = upward,
 * because every caller adds it to +Y and a sign flip here would be a very
 * quiet way to drown the whole garden.
 */
export function buoyantForce(volume, share, submergence, fluidDensity = PHYS.fluidDensity, gravity = PHYS.gravity) {
  return fluidDensity * volume * share * submergence * -gravity;
}

/** Sum of a buoy list's shares — 1 for a well-formed body. */
export function buoyShareSum(buoys) {
  let s = 0;
  for (let i = 0; i < buoys.length; i++) s += buoys[i][3];
  return s;
}

/**
 * Radius, from the body's centre, inside which every buoy point must lie under
 * ANY rotation, plus the surface ramp. The substep uses it as a one-comparison
 * "is this body anywhere near the water" test, so it must never under-report:
 * a body wrongly skipped would sink through the pond.
 */
export function buoyReach(buoys, fallbackSpan = PHYS.surfaceSoftness) {
  let m = 0;
  for (let i = 0; i < buoys.length; i++) {
    const p = buoys[i];
    const d = Math.hypot(p[0], p[1], p[2]) + (p[4] ?? fallbackSpan) * 0.5;
    if (d > m) m = d;
  }
  return m;
}

/**
 * Steady-state draught: the fraction of a free-floating body that ends up
 * under the water, which is just the density ratio. Exists so the tests can
 * state the headline behaviour in the language the brief used — "wood floats,
 * stone sinks" — instead of in newtons.
 *
 * Returns 1 for anything at or over the fluid's density: it is on the bottom.
 */
export function equilibriumDraught(bodyDensity, fluidDensity = PHYS.fluidDensity) {
  if (!(bodyDensity > 0)) return 0;
  return clamp01(bodyDensity / fluidDensity);
}

/** True when a body of this density comes to rest with some of it dry. */
export function floats(bodyDensity, fluidDensity = PHYS.fluidDensity) {
  return bodyDensity > 0 && bodyDensity < fluidDensity;
}

/**
 * Water level at a point: the ocean plane, unless the point is inside an
 * inland pool, in which case that pool's own fitted surface. Ponds are small
 * and few (two on the whole island), so a linear scan beats any structure.
 *
 * `ponds` is the array water.js `resolvePonds` hands back — {x, z, radius,
 * level} — so the physics waterline and the rendered sheet cannot drift apart.
 * Returns -Infinity outside everything only if there is no ocean, which never
 * happens; the ocean is the floor of the query.
 */
export function waterLevelAt(x, z, ponds, oceanY = PHYS.waterY) {
  let best = oceanY;
  if (ponds) {
    for (let i = 0; i < ponds.length; i++) {
      const p = ponds[i];
      const dx = x - p.x;
      const dz = z - p.z;
      // Slight overshoot on the radius: the rendered rim wobbles +-17 % and a
      // barrel bobbing at the edge should not fall through the paper.
      const r = p.radius * 1.18;
      if (dx * dx + dz * dz <= r * r && p.level > best) best = p.level;
    }
  }
  return best;
}

/**
 * Deterministic wind vector at a sim time, in m/s, written into `out`.
 *
 * `windScale` is weather.js's own `wind` field, so a breezy day (2.1) really is
 * twice the push of a clear one and the leaves agree with the grass.
 *
 * `out` is required and reused — this is called every substep for every sailed
 * body's world and must not allocate.
 */
export function windVector(simTime, windScale, out) {
  const bearing = (PHYS.windBearing + Math.sin(simTime * TAU * PHYS.windSwingHz) * PHYS.windSwingTurns) * TAU;
  const gust = windGust(simTime);
  const speed = PHYS.windSpeed * windScale * gust;
  out.x = Math.sin(bearing) * speed;
  out.z = Math.cos(bearing) * speed;
  out.gust = gust;
  return out;
}

/**
 * Gust envelope, 0..1-ish, from two incommensurable sines. Mean ~1, troughs
 * near 0.4, peaks near 1.6. Reproducible, so the beauty harness can shoot a
 * gust by choosing a time rather than by getting lucky.
 */
export function windGust(simTime) {
  const a = Math.sin(simTime * TAU * PHYS.windGustHz);
  const b = Math.sin(simTime * TAU * PHYS.windFlutterHz + 1.7);
  return 1 + a * PHYS.windGustDepth + b * PHYS.windFlutterDepth;
}

/**
 * Newtons of wind on a body, along one horizontal axis.
 *
 * Wind acts on RELATIVE air speed, which is what stops a leaf from being
 * accelerated past the wind itself and shot across the county. `sail` is the
 * drag group 0.5 * rho_air * Cd * A — see `sailOf`, and see PHYS.airDensity
 * for why it must really be that and not a vibe.
 */
export function windForce(windComponent, velComponent, sail) {
  const rel = windComponent - velComponent;
  // Quadratic in relative speed, signed. Real drag, and it means a still leaf
  // starts gently and a fast one is caught hard.
  return sail * rel * Math.abs(rel);
}

/**
 * The drag group for a face of area `area` with drag coefficient `cd`:
 * 0.5 * rho_air * Cd * A. Every `sail` in physicsProps.js is written through
 * this, so the table reads as "how big is it and what shape" — which an author
 * can reason about — rather than as six magic numbers.
 */
export function sailOf(area, cd, airDensity = PHYS.airDensity) {
  return 0.5 * airDensity * cd * area;
}

/**
 * Wind acceleration a body would feel at a given air speed. Not used by the
 * solver — it exists so the tests can assert the thing that actually matters,
 * which is that a leaf is two orders of magnitude more wind-responsive than a
 * plank and that nothing is responsive enough to explode.
 */
export function windAccel(sail, mass, airSpeed) {
  if (!(mass > 0)) return 0;
  return (sail * airSpeed * airSpeed) / mass;
}

/**
 * Pack a terrain sampler into the height buffer Rapier's heightfield collider
 * wants, plus the scale that places it in the world.
 *
 * ── THE INDEXING, WHICH IS NOT WHAT YOU WOULD GUESS ───────────────────────
 * Rapier's heightfield is an nalgebra DMatrix, which is COLUMN-MAJOR, and its
 * rows run along **Z**, not X. Verified empirically against rapier3d-compat
 * 0.19.3 by ray-casting a field whose heights varied with the row index and
 * watching the height change as Z moved and stay flat as X moved. So:
 *
 *     index = i + j * (nrows + 1)      i indexes Z, j indexes X
 *     z     = (i / nrows - 0.5) * scaleZ
 *     x     = (j / ncols - 0.5) * scaleX
 *
 * Getting this transposed produces a world that is subtly, maddeningly wrong —
 * props settle on hills that are not there — and looks fine on any symmetric
 * test. `physics.test.js` pins it with an asymmetric field.
 *
 * @param {(x:number,z:number)=>number} sampleHeight
 * @returns {{heights:Float32Array, nrows:number, ncols:number,
 *            scaleX:number, scaleY:number, scaleZ:number}}
 */
export function buildTerrainHeights(sampleHeight, { size = 480, cells = PHYS.terrainCells, bias = PHYS.terrainBias } = {}) {
  const n = Math.max(1, cells | 0);
  const heights = new Float32Array((n + 1) * (n + 1));
  const half = size / 2;
  const step = size / n;
  for (let j = 0; j <= n; j++) {
    const x = -half + j * step;
    for (let i = 0; i <= n; i++) {
      const z = -half + i * step;
      heights[i + j * (n + 1)] = sampleHeight(x, z) - bias;
    }
  }
  return { heights, nrows: n, ncols: n, scaleX: size, scaleY: 1, scaleZ: size };
}

/** The index law above, exported so the tests can state it once. */
export function heightIndex(i, j, nrows) {
  return i + j * (nrows + 1);
}

/**
 * Fixed-step accumulator.
 *
 * WHY it exists rather than `world.step()` per frame: Rapier integrates at
 * whatever dt you hand it, and a variable dt makes a stack of crates that
 * stands on a 144 Hz monitor fall over on a 30 Hz one. A fixed substep is the
 * only way the same shove produces the same tower twice.
 *
 * WHY it clamps rather than spirals: if a frame took long enough to owe more
 * than `maxSubsteps`, running them all makes the NEXT frame longer, which owes
 * more still. The surplus is dropped and `dropped` counts it, so the caller can
 * see the world briefly running in slow motion instead of the tab dying.
 */
export function createFixedStepper({ dt = FIXED_DT, maxSubsteps = PHYS.maxSubsteps } = {}) {
  let acc = 0;
  let dropped = 0;
  return {
    get dt() { return dt; },
    /** Remainder as a 0..1 fraction of a step — for render interpolation. */
    get alpha() { return acc / dt; },
    get dropped() { return dropped; },
    get pending() { return acc; },
    reset() { acc = 0; },
    /** @returns {number} whole substeps to run now. */
    advance(elapsed) {
      if (!(elapsed > 0)) return 0;
      acc += elapsed;
      let steps = Math.floor(acc / dt);
      if (steps > maxSubsteps) {
        dropped += steps - maxSubsteps;
        steps = maxSubsteps;
        acc = 0;
      } else {
        acc -= steps * dt;
      }
      return steps;
    },
  };
}

/**
 * Fixed-capacity body pool with oldest-first recycling.
 *
 * WHY a cap at all: a child who discovers they can spawn crates WILL spawn
 * crates, and a solver with a thousand of them in it is a slideshow on an iPad.
 * 120 is the measured ceiling at which a full garden still substeps inside its
 * budget on the SwiftShader harness.
 *
 * WHY oldest-first and not nearest-first: recycling the crate furthest from the
 * player sounds better and is worse — the thing you built five minutes ago and
 * walked away from is exactly the thing you come back to. Oldest-first evicts
 * what the player has demonstrably finished with, and it is stable and
 * testable, which nearest-first (a moving target) is not.
 *
 * WHY `pinned`: the sandbox's own forty objects and every puzzle piece are
 * pinned. If a pressure-plate puzzle could have its crates recycled out from
 * under it the puzzle would silently become unsolvable, which is the worst
 * possible failure for a five-year-old. Pinned bodies are never evicted; when
 * the pool is full of nothing but pinned bodies, `acquire` REFUSES rather than
 * breaking its own promise.
 */
export function createBodyPool(cap = PHYS.maxBodies) {
  const limit = Math.max(1, cap | 0);
  /** id -> { id, seq, pinned } in insertion order (Map preserves it). */
  const live = new Map();
  let seq = 0;

  function oldestUnpinned() {
    for (const entry of live.values()) if (!entry.pinned) return entry.id;
    return null;
  }

  return {
    get cap() { return limit; },
    get size() { return live.size; },
    get full() { return live.size >= limit; },
    has(id) { return live.has(id); },
    pinnedCount() {
      let n = 0;
      for (const e of live.values()) if (e.pinned) n++;
      return n;
    },
    /** Oldest evictable id, or null when everything alive is pinned. */
    oldest() { return oldestUnpinned(); },
    /**
     * @returns {{ ok:boolean, evicted:string|null, reason:string|null }}
     *   ok false + reason 'full-pinned' means the caller must not create the
     *   body: there was nothing it was allowed to take.
     */
    acquire(id, { pinned = false } = {}) {
      if (live.has(id)) {
        // Re-acquiring an id refreshes its age; it does not double-count.
        const e = live.get(id);
        live.delete(id);
        e.seq = seq++;
        e.pinned = pinned || e.pinned;
        live.set(id, e);
        return { ok: true, evicted: null, reason: null };
      }
      let evicted = null;
      if (live.size >= limit) {
        evicted = oldestUnpinned();
        if (evicted === null) return { ok: false, evicted: null, reason: 'full-pinned' };
        live.delete(evicted);
      }
      live.set(id, { id, seq: seq++, pinned });
      return { ok: true, evicted, reason: null };
    },
    release(id) { return live.delete(id); },
    /** Bump an id to newest without changing membership. */
    touch(id) {
      const e = live.get(id);
      if (!e) return false;
      live.delete(id);
      e.seq = seq++;
      live.set(id, e);
      return true;
    },
    ids() { return [...live.keys()]; },
    clear() { live.clear(); },
  };
}

/**
 * Volume of a body spec, in cubic metres. Rapier derives mass from density x
 * volume itself, but the buoyancy integrator needs the displaced volume in
 * plain JS every substep, and asking the collider for it would be a wasm call
 * per body per step for a number that never changes.
 */
export function shapeVolume(spec) {
  switch (spec.shape) {
    case 'ball': return (4 / 3) * Math.PI * spec.r * spec.r * spec.r;
    case 'cylinder': return Math.PI * spec.r * spec.r * (spec.halfHeight * 2);
    case 'box':
    default: return 8 * spec.hx * spec.hy * spec.hz;
  }
}

/**
 * Clamp one axis of a field impulse to what `PHYS.maxFieldDV` allows.
 *
 * This is a BACKSTOP, not a model — no correctly tuned field ever reaches it.
 * It exists because Rapier's failure mode for an absurd impulse is a Rust
 * `unreachable` trap inside WebAssembly, and a trapped wasm module cannot be
 * restarted: the physics is gone for the rest of the session and it takes the
 * frame loop with it. A backstop that turns "the tab is dead" into "that leaf
 * moved oddly" is worth one comparison per axis. See PHYS.airDensity for the
 * bug that proved it.
 */
export function clampImpulse(impulse, maxImpulse) {
  if (!(maxImpulse > 0)) return impulse;
  if (impulse > maxImpulse) return maxImpulse;
  if (impulse < -maxImpulse) return -maxImpulse;
  return impulse;
}

/**
 * Bounding-sphere radius of a body spec. The buoyancy early-out is ORed with
 * this so a shape whose buoy list is sparser than its own geometry — a ball
 * carrying one centre point, say — can never be skipped while part of it is
 * genuinely under the surface.
 */
export function shapeReach(spec) {
  switch (spec.shape) {
    case 'ball': return spec.r;
    case 'cylinder': return Math.hypot(spec.r, spec.halfHeight);
    case 'box':
    default: return Math.hypot(spec.hx, spec.hy, spec.hz);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Rapier — everything below here is plumbing over the math above
// ────────────────────────────────────────────────────────────────────────

/**
 * Lazy, memoised Rapier load.
 *
 * The `-compat` build inlines its ~1.5 MB wasm as base64 inside the JS, which
 * is what makes it work under Vite with no asset plumbing — and also what makes
 * it absolutely unacceptable in the eager bundle. This dynamic import is the
 * ONLY reference to the package in the whole tree, so Rollup puts it in a chunk
 * of its own (see the `rapier` entry in vite.config.js manualChunks) that is
 * fetched when the overworld first asks for a toybox and never before.
 *
 * `RAPIER.init()` must complete before any constructor is touched; awaiting the
 * same promise on every call means a hundred callers cost one init.
 */
let _rapierPromise = null;
export function loadRapier() {
  if (!_rapierPromise) {
    _rapierPromise = import('@dimforge/rapier3d-compat')
      .then(async (mod) => {
        const R = mod.default ?? mod;
        await R.init();
        return R;
      })
      .catch((err) => {
        // A failed load must not poison the cache — a retry after a flaky
        // network should be allowed to succeed.
        _rapierPromise = null;
        throw err;
      });
  }
  return _rapierPromise;
}

/** Test seam: drop the memoised module so a suite can re-stub the loader. */
export function __resetRapier() { _rapierPromise = null; }

/** Stride of the transform buffer: position(3) + quaternion(4). */
export const XFORM_STRIDE = 7;

/**
 * Build the physics world.
 *
 * @param {object} opts
 * @param {{sampleHeight:(x:number,z:number)=>number}} opts.heightfield
 * @param {Array<{x:number,z:number,radius:number,level:number}>} [opts.ponds]
 * @param {number} [opts.cap] simultaneous dynamic bodies
 */
export async function createPhysicsWorld({
  heightfield,
  ponds = [],
  cap = PHYS.maxBodies,
  oceanY = PHYS.waterY,
  worldSize = 480,
  terrainCells = PHYS.terrainCells,
} = {}) {
  const RAPIER = await loadRapier();

  const world = new RAPIER.World({ x: 0, y: PHYS.gravity, z: 0 });
  world.integrationParameters.dt = FIXED_DT;
  world.integrationParameters.numSolverIterations = PHYS.solverIterations;

  // ── Static terrain ──────────────────────────────────────────────────────
  // Wrapped rather than passed by reference: a sampler is free to be a method
  // on its own closure object and losing `this` here would silently flatten
  // the island.
  const grid = buildTerrainHeights((x, z) => heightfield.sampleHeight(x, z), { size: worldSize, cells: terrainCells });
  const terrainBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const terrainCollider = world.createCollider(
    RAPIER.ColliderDesc
      .heightfield(grid.nrows, grid.ncols, grid.heights, { x: grid.scaleX, y: grid.scaleY, z: grid.scaleZ })
      .setFriction(0.92)
      .setRestitution(0.02),
    terrainBody,
  );

  // ── Water sensors ───────────────────────────────────────────────────────
  // The ocean is one flat slab under y=oceanY and each pond is a short
  // cylinder at its own level. These are SENSORS — they never push anything.
  // Their job is to be the authoritative statement, inside the physics world,
  // of where water is, so a body's "am I wet" is a narrow-phase fact rather
  // than a guess made by whoever last edited a constant. The buoyancy FORCE is
  // still computed analytically per buoy point (a sensor knows you overlap, not
  // how deep), but a body that is not in a water sensor is skipped outright,
  // which is what keeps the integrator off the other 118 dry crates.
  const waterSensors = [];
  const oceanDepth = 120;
  waterSensors.push(world.createCollider(
    RAPIER.ColliderDesc
      .cuboid(worldSize, oceanDepth, worldSize)
      .setSensor(true)
      .setTranslation(0, oceanY - oceanDepth, 0),
  ));
  for (const p of ponds) {
    const depth = 6;
    waterSensors.push(world.createCollider(
      RAPIER.ColliderDesc
        .cylinder(depth, p.radius * 1.18)
        .setSensor(true)
        .setTranslation(p.x, p.level - depth, p.z),
    ));
  }

  // ── Body registry ───────────────────────────────────────────────────────
  const pool = createBodyPool(cap);
  /** id -> record. Records hold every per-body number the substep needs so the
   *  hot loop never touches a Rapier getter it does not have to. */
  const records = new Map();
  /** Dense array of live records — iterated every substep, so no Map walk. */
  const order = [];
  /** Transform readback, dense by slot. physicsProps reads straight from this. */
  const xforms = new Float32Array(cap * XFORM_STRIDE);
  /** Slot -> id, and the free-slot stack. */
  const slotId = new Array(cap).fill(null);
  const freeSlots = [];
  for (let i = cap - 1; i >= 0; i--) freeSlots.push(i);

  // Scratch. Nothing in step() may allocate; every vector below is reused.
  const _wind = { x: 0, z: 0, gust: 1 };
  const _force = { x: 0, y: 0, z: 0 };
  const _point = { x: 0, y: 0, z: 0 };
  const _torque = { x: 0, y: 0, z: 0 };

  const stepper = createFixedStepper({ dt: FIXED_DT, maxSubsteps: PHYS.maxSubsteps });

  let awake = 0;
  let evictions = 0;
  let disposed = false;

  /** Rotate a local offset by a quaternion into _point, then translate. */
  function localToWorld(qx, qy, qz, qw, lx, ly, lz, tx, ty, tz) {
    // v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    const ix = qy * lz - qz * ly + qw * lx;
    const iy = qz * lx - qx * lz + qw * ly;
    const iz = qx * ly - qy * lx + qw * lz;
    const iw = -qx * lx - qy * ly - qz * lz;
    _point.x = tx + ix * qw + iw * -qx + iy * -qz - iz * -qy;
    _point.y = ty + iy * qw + iw * -qy + iz * -qx - ix * -qz;
    _point.z = tz + iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return _point;
  }

  const SHAPES = {
    box: (d, s) => d.cuboid(s.hx, s.hy, s.hz),
    ball: (d, s) => d.ball(s.r),
    cylinder: (d, s) => d.cylinder(s.halfHeight, s.r),
  };

  /**
   * Create a dynamic body.
   *
   * @param {object} spec
   * @param {string} spec.id           unique; re-adding an id replaces it
   * @param {string} spec.kind         render kind (crate/ball/log/plank/leaf)
   * @param {'box'|'ball'|'cylinder'} spec.shape
   * @param {number} spec.density      < 1 floats, > 1 sinks
   * @param {Array<[number,number,number,number,number?]>} [spec.buoys]
   *   local x, y, z, share of the displaced volume, and the vertical SPAN of
   *   the slice this point stands for (see `pointSubmergence`). Shares must
   *   sum to 1; spans should sum, per vertical column, to the body's height.
   * @param {number} [spec.sail]       wind coupling; 0 for stone
   * @param {boolean} [spec.pinned]    never recycled
   * @returns {object|null} the record, or null when the pool refused
   */
  function addBody(spec) {
    if (disposed) return null;
    const got = pool.acquire(spec.id, { pinned: !!spec.pinned });
    if (!got.ok) return null;
    if (got.evicted) { removeBody(got.evicted); evictions++; }
    if (records.has(spec.id)) removeBody(spec.id, true);

    const slot = freeSlots.pop();
    if (slot === undefined) { pool.release(spec.id); return null; }

    // ── Per-kind damping, and why it is not a global ────────────────────
    // PHYS.airLinearDrag/airAngularDrag are what AIR does to a body. They are
    // not what GRASS does to a ball, and a ball is the body that exposes the
    // difference: with air damping alone a beach ball set down on the meadow's
    // 2 % gradient accelerates for as long as the gradient lasts, and measured
    // on the shipped island three of them had rolled 20-49 m into the sea
    // inside fifteen seconds of dead calm. Rapier has no rolling-resistance
    // term, but angular damping is exactly the right shape for one: it bleeds
    // the spin that a roll is made of, so a ball still rolls beautifully when
    // shoved and still comes to rest on its own, which is what a lawn does.
    // Only the kinds that need it override; see PROP_KINDS in physicsProps.js.
    const linDamp = spec.linDamp ?? PHYS.airLinearDrag;
    const angDamp = spec.angDamp ?? PHYS.airAngularDrag;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spec.x, spec.y, spec.z)
      .setLinearDamping(linDamp)
      .setAngularDamping(angDamp)
      .setCanSleep(true);
    if (spec.rot) {
      // Full quaternion — how a log is laid on its side, since a Rapier
      // cylinder's axis is always local +Y and rolling requires it be tipped.
      desc.setRotation(spec.rot);
    } else if (spec.yaw) {
      const h = spec.yaw * 0.5;
      desc.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
    }
    if (spec.linvel) desc.setLinvel(spec.linvel.x, spec.linvel.y, spec.linvel.z);
    const body = world.createRigidBody(desc);

    const make = SHAPES[spec.shape] || SHAPES.box;
    const cdesc = make(RAPIER.ColliderDesc, spec)
      .setDensity(spec.density)
      .setFriction(spec.friction ?? 0.7)
      .setRestitution(spec.restitution ?? 0.08);
    const collider = world.createCollider(cdesc, body);

    const buoys = spec.buoys && spec.buoys.length ? spec.buoys : [[0, 0, 0, 1]];
    const rec = {
      id: spec.id,
      kind: spec.kind,
      slot,
      body,
      collider,
      volume: shapeVolume(spec),
      // Precomputed so the substep never asks Rapier for a number it can
      // derive, and so the field clamp below has something to clamp against.
      mass: shapeVolume(spec) * spec.density,
      buoys,
      // Worst-case distance from the centre to a wet buoy point, over EVERY
      // orientation — so the "could this body be touching water" early-out is
      // conservative and can never skip a body that is in fact afloat.
      reach: Math.max(buoyReach(buoys), shapeReach(spec)),
      // A single-point ball uses the exact cap formula instead of a slab.
      sphereR: (spec.shape === 'ball' && buoys.length === 1) ? spec.r : 0,
      sail: spec.sail || 0,
      // May a gust wake this body out of sleep? Only for bodies the wind can
      // genuinely move — see PHYS.windWakeRatio.
      windWake: (spec.sail || 0) / (shapeVolume(spec) * spec.density) >= PHYS.windWakeRatio,
      // Lever arm, in metres, for the tumble torque the wind applies. A flat
      // thing in a breeze does not slide, it cartwheels; a crate does not.
      flutter: spec.flutter || 0,
      // Impulse ceiling for the fields — see PHYS.maxFieldDV.
      maxImpulse: shapeVolume(spec) * spec.density * PHYS.maxFieldDV,
      density: spec.density,
      // Kept so the fluid pass can restore a body's OWN dry damping when it
      // leaves the water, rather than flattening it back to the air defaults
      // and quietly turning every ball into a bowling ball the first time one
      // gets wet.
      linDamp,
      angDamp,
      pinned: !!spec.pinned,
      wet: 0,
      wasWet: false,
      // Held so a caller can hand the body back to its owner without a lookup.
      userData: spec.userData ?? null,
    };
    body.userData = rec;
    records.set(spec.id, rec);
    order.push(rec);
    slotId[slot] = spec.id;
    writeXform(rec);
    return rec;
  }

  function removeBody(id, keepPool = false) {
    const rec = records.get(id);
    if (!rec) return false;
    world.removeRigidBody(rec.body);       // takes its colliders with it
    records.delete(id);
    const i = order.indexOf(rec);
    if (i >= 0) order.splice(i, 1);
    slotId[rec.slot] = null;
    freeSlots.push(rec.slot);
    const o = rec.slot * XFORM_STRIDE;
    for (let k = 0; k < XFORM_STRIDE; k++) xforms[o + k] = 0;
    if (!keepPool) pool.release(id);
    return true;
  }

  // ── The hero's kinematic presence ───────────────────────────────────────
  // A position-based kinematic body: it moves exactly where the controller
  // says, it shoves anything dynamic out of its way, and nothing can shove it
  // back. See the header for why the hero is not a dynamic capsule.
  const heroBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -1000, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.55, 0.42).setFriction(0.4).setRestitution(0),
    heroBody,
  );
  function setHero(x, y, z) {
    // +0.97 lifts the capsule's centre so its bottom cap sits at the feet.
    heroBody.setNextKinematicTranslation({ x, y: y + 0.97, z });
  }

  function writeXform(rec) {
    const t = rec.body.translation();
    const q = rec.body.rotation();
    const o = rec.slot * XFORM_STRIDE;
    xforms[o] = t.x; xforms[o + 1] = t.y; xforms[o + 2] = t.z;
    xforms[o + 3] = q.x; xforms[o + 4] = q.y; xforms[o + 5] = q.z; xforms[o + 6] = q.w;
  }

  /**
   * One substep's worth of fluid + wind forces.
   *
   * ── WHY IMPULSES AND NOT FORCES ──────────────────────────────────────────
   * Rapier's `addForce` is PERSISTENT: it accumulates onto the body and stays
   * there every step until `resetForces` is called. Applying buoyancy as a
   * force therefore does not float a crate, it launches it into orbit — the
   * lift from the one step it spent underwater keeps being re-applied for the
   * rest of the session. (Measured: the crate passed 15 km up inside ten
   * seconds.) Every field here is a one-shot `applyImpulse*` of `F * dt`
   * instead, which is the same physics, is self-clearing by construction, and
   * saves the two extra wasm calls a reset would cost per body per substep.
   *
   * Ordered so the common case is cheap: a sleeping body is skipped before
   * anything is read from it, and a dry body costs one water-level lookup and
   * one comparison. Only a body actually touching water pays for the buoy loop.
   */
  function applyFields(simTime, windScale) {
    windVector(simTime, windScale, _wind);
    const gusting = _wind.gust >= PHYS.windWakeGust;
    for (let n = 0; n < order.length; n++) {
      const rec = order[n];
      const body = rec.body;
      const sleeping = body.isSleeping();

      // A gust lifts the drift of leaves that had settled. Only sailed bodies,
      // only on a real gust — see PHYS.windWakeGust.
      if (sleeping && !(gusting && rec.windWake)) continue;
      if (sleeping) body.wakeUp();

      const t = body.translation();
      const level = waterLevelAt(t.x, t.z, ponds, oceanY);

      // ── Buoyancy ────────────────────────────────────────────────────────
      let wet = 0;
      if (t.y - rec.reach < level) {
        const q = body.rotation();
        const buoys = rec.buoys;
        for (let b = 0; b < buoys.length; b++) {
          const p = buoys[b];
          const w = localToWorld(q.x, q.y, q.z, q.w, p[0], p[1], p[2], t.x, t.y, t.z);
          // A ball gets the exact spherical cap; everything else is a slab.
          // See sphereSubmergedFraction for why the ball is worth the extra
          // three multiplies.
          const sub = rec.sphereR > 0
            ? sphereSubmergedFraction(w.y, rec.sphereR, level)
            : pointSubmergence(w.y, level, p[4] ?? PHYS.surfaceSoftness);
          if (sub <= 0) continue;
          wet += sub * p[3];
          _force.x = 0;
          _force.y = clampImpulse(
            buoyantForce(rec.volume, p[3], sub, PHYS.fluidDensity, PHYS.gravity) * FIXED_DT,
            rec.maxImpulse,
          );
          _force.z = 0;
          body.applyImpulseAtPoint(_force, w, false);
        }
      }
      rec.wet = wet;

      // ── Fluid drag ──────────────────────────────────────────────────────
      // Applied as DAMPING rather than as a force: Rapier integrates damping
      // implicitly, so it is unconditionally stable at any magnitude. A drag
      // force big enough to settle a bobbing plank in one second is big enough
      // to overshoot and oscillate if integrated explicitly.
      if (wet > 0) {
        body.setLinearDamping(rec.linDamp + PHYS.waterLinearDrag * wet);
        body.setAngularDamping(rec.angDamp + PHYS.waterAngularDrag * wet);
      } else if (rec.wasWet) {
        body.setLinearDamping(rec.linDamp);
        body.setAngularDamping(rec.angDamp);
      }
      rec.wasWet = wet > 0;

      // ── Wind ────────────────────────────────────────────────────────────
      // Underwater objects are not blown about; `1 - wet` fades the coupling
      // as a leaf lands on the pond instead of switching it off.
      if (rec.sail > 0 && wet < 1) {
        const v = body.linvel();
        const dry = (1 - wet) * FIXED_DT;
        _force.x = clampImpulse(windForce(_wind.x, v.x, rec.sail) * dry, rec.maxImpulse);
        _force.y = 0;
        _force.z = clampImpulse(windForce(_wind.z, v.z, rec.sail) * dry, rec.maxImpulse);
        body.applyImpulse(_force, false);
        // A flat thing in wind does not translate, it TUMBLES. `flutter` is a
        // lever arm in metres: the same push applied off-centre. It is a
        // separate coefficient from `sail` because sail is a real drag group
        // with real units and multiplying a torque by it would make the leaf's
        // spin a function of the air's density, which is nonsense.
        if (rec.flutter > 0) {
          _torque.x = -_force.z * rec.flutter;
          _torque.y = (_force.x - _force.z) * rec.flutter * 0.35;
          _torque.z = _force.x * rec.flutter;
          body.applyTorqueImpulse(_torque, false);
        }
      }

      // ── Bed grip ────────────────────────────────────────────────────────
      // See PHYS.sunkGrip: a sunk stone with almost no net weight left skates.
      if (wet > 0.95 && rec.density > PHYS.fluidDensity) {
        _force.x = 0;
        _force.y = clampImpulse(
          PHYS.gravity * rec.mass * PHYS.sunkGrip * FIXED_DT, rec.maxImpulse,
        );
        _force.z = 0;
        body.applyImpulse(_force, false);
      }
    }
  }

  /**
   * Advance the world. `dt` is the caller's frame time; the solver only ever
   * sees whole 1/60 s substeps.
   *
   * @returns {number} substeps actually run
   */
  function step(dt, { simTime = 0, windScale = 1, hero = null } = {}) {
    if (disposed) return 0;
    const steps = stepper.advance(dt);
    if (hero) setHero(hero.x, hero.y, hero.z);
    for (let s = 0; s < steps; s++) {
      // Each substep gets its own slice of the sim clock so the wind field is
      // continuous, not stepped once per frame.
      applyFields(simTime + s * FIXED_DT, windScale);
      world.step();
    }
    if (steps > 0) readTransforms();
    return steps;
  }

  /**
   * Refresh the transform buffer.
   *
   * WHY once per FRAME and not per substep: the renderer only shows the last
   * one, and each read costs two small objects that Rapier's binding allocates
   * on our behalf (`translation()` / `rotation()` have no out-parameter form).
   * Reading only awake bodies means a settled garden allocates nothing at all,
   * which is the only reason a hundred-body world stays inside the no-garbage
   * rule this codebase runs on.
   */
  function readTransforms() {
    awake = 0;
    for (let n = 0; n < order.length; n++) {
      const rec = order[n];
      if (rec.body.isSleeping()) continue;
      awake++;
      writeXform(rec);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    records.clear();
    order.length = 0;
    pool.clear();
    waterSensors.length = 0;
    world.free();
  }

  return {
    RAPIER,
    world,
    /** Dense [px,py,pz,qx,qy,qz,qw] per slot. Read-only to callers. */
    xforms,
    XFORM_STRIDE,
    addBody,
    removeBody,
    step,
    setHero,
    get(id) { return records.get(id) || null; },
    slotOf(id) { const r = records.get(id); return r ? r.slot : -1; },
    idAt(slot) { return slotId[slot] || null; },
    /** Iterate live records without allocating. */
    forEach(fn) { for (let i = 0; i < order.length; i++) fn(order[i]); },
    /** Wake and shove — used by the hero's kick and by puzzle resets. */
    impulse(id, ix, iy, iz) {
      const rec = records.get(id);
      if (!rec) return false;
      _force.x = ix; _force.y = iy; _force.z = iz;
      rec.body.wakeUp();
      rec.body.applyImpulse(_force, true);
      return true;
    },
    teleport(id, x, y, z) {
      const rec = records.get(id);
      if (!rec) return false;
      _force.x = x; _force.y = y; _force.z = z;
      rec.body.setTranslation(_force, true);
      _force.x = 0; _force.y = 0; _force.z = 0;
      rec.body.setLinvel(_force, true);
      rec.body.setAngvel(_force, true);
      writeXform(rec);
      return true;
    },
    stats() {
      return {
        bodies: order.length,
        awake,
        cap: pool.cap,
        pinned: pool.pinnedCount(),
        evictions,
        dropped: stepper.dropped,
        terrainVerts: grid.heights.length,
        waterSensors: waterSensors.length,
      };
    },
    /** Exposed for the debug overlay and the tests. */
    terrainCollider,
    pool,
    dispose,
  };
}
