/**
 * discoveryWiring — the whole discovery stack, assembled, in one call.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Discovery is six modules (discoverySpec, discovery, puzzles, shrines,
 * storyPages, and the save container they share) and the host should not have
 * to know that. index.js is edited by several agents at once and OverworldScene
 * is a 1700-line Phaser bridge; dropping four paragraphs of assembly into
 * either is how modules end up half-wired.
 *
 * So the host gets this, and nothing else:
 *
 *   index.js — two lines
 *       const discovery = createDiscoveryRuntime({ save, hooks });   // near the
 *                                                                    // other systems
 *       discovery.update(player.pos.x, player.pos.z, dt);            // in the tick,
 *                                                                    // beside checkCollectibles()
 *
 *   OverworldScene.js — one hook
 *       onDiscovery: (e) => this._onDiscovery(e),
 *
 * ── EVERY FRAME, CHEAPLY ───────────────────────────────────────────────────
 * `update` runs a proximity scan over 39 records (a squared-distance compare
 * each, no allocation unless something is actually in range) and recomputes the
 * compass on a 6 Hz timer rather than per frame, because the compass is a
 * needle a child reads, not a physics quantity. Nothing in the steady state
 * allocates.
 *
 * ── THE HOST OWNS PRESENTATION, THIS OWNS TRUTH ────────────────────────────
 * This module never touches three, the DOM or the save file's storage. It
 * mutates the save object in memory (that is what a grant IS) and emits events;
 * persisting is the host's call, because the host knows the slot. `onDiscovery`
 * fires with everything the presentation needs and nothing it does not.
 */
import { DISCOVERIES, TRIGGER_RADIUS } from './discoverySpec.js';
import {
  ensureDiscovery, discover, completeTrial, scanProximity, compassHint,
  discoveryProgress, mapMarkers, buffValue, claimMilestones,
} from './discovery.js';
import { pageProgress, collection, closingLine } from './storyPages.js';
import {
  openShrine, stepTrial, askLock, answerLock, shrineReward, isShrineComplete, trialHint,
} from './shrines.js';

/** How often the compass re-aims, in seconds. */
const COMPASS_HZ = 1 / 6;

/**
 * Assemble the discovery runtime.
 *
 * @param {{save:object, hooks?:object, pool?:object[]}} opts
 *   hooks.onDiscovery  ({kind, record, reward, pageSet, milestones}) — an
 *                      arrival beat fired. Play the chime, push the camera,
 *                      flash the reward, then persist.
 *   hooks.onCompass    (hint|null) — the needle changed target or lost one.
 *   hooks.onProgress   (progress) — the meter moved.
 * @returns {object} runtime
 */
export function createDiscoveryRuntime({ save, hooks = {}, pool = DISCOVERIES } = {}) {
  ensureDiscovery(save);

  let compassTimer = 0;
  let lastCompassId = null;
  /** The shrine session in flight, if any. */
  let session = null;

  /**
   * One tick. Call from the movement update with the player's world position.
   * @param {number} x
   * @param {number} z
   * @param {number} dt seconds
   * @returns {number} how many things were discovered this tick (usually 0)
   */
  function update(x, z, dt = 0) {
    let found = 0;
    const hits = scanProximity(save, x, z, { pool });
    for (let i = 0; i < hits.length; i++) {
      const res = discover(save, hits[i].id);
      if (!res.granted) continue;
      found++;
      hooks.onDiscovery?.({
        kind: res.record.kind,
        record: res.record,
        reward: res.reward,
        pageSet: res.pageSet,
        milestones: res.milestones,
      });
    }
    if (found) hooks.onProgress?.(discoveryProgress(save));

    compassTimer -= dt;
    if (compassTimer <= 0) {
      compassTimer = COMPASS_HZ;
      const hint = compassHint(save, x, z, { pool });
      const id = hint ? hint.id : null;
      // Fire on target CHANGE, and while a hidden thing is warming (its heat is
      // the only signal the player has, so it must stay live).
      if (id !== lastCompassId || (hint && !hint.precise)) {
        lastCompassId = id;
        hooks.onCompass?.(hint);
      }
    }
    return found;
  }

  // ── Shrines ──────────────────────────────────────────────────────────────

  /** Begin a shrine session. Returns the session, or null if unknown. */
  function beginShrine(shrineId) {
    session = openShrine(shrineId);
    return session;
  }

  /** Drive the shrine's physical trial. */
  function shrineMove(move) {
    const res = stepTrial(session, move);
    session = res.session;
    return res;
  }

  /**
   * Ask the next maths lock. `generate` must be systems/math.js
   * generateRatedQuestion and `grade` the adaptive grade for this operator —
   * the host passes them in so this module never imports the battle stack.
   */
  function shrineAsk(deps) {
    const res = askLock(session, deps);
    session = res.session;
    return res.question;
  }

  /** Answer the current lock. Pays out and closes the shrine when the last one opens. */
  function shrineAnswer(answer) {
    const res = answerLock(session, answer);
    session = res.session;
    if (!isShrineComplete(session)) return { ...res, payout: null };
    const payout = completeTrial(save, session.shrineId, shrineReward(session));
    if (payout.granted) hooks.onProgress?.(discoveryProgress(save));
    return { ...res, payout };
  }

  /**
   * A landmark puzzle out in the open just got solved. Same payout path as a
   * shrine, minus the maths half — the puzzle IS the whole thing.
   */
  function solveLandmark(puzzleId) {
    const payout = completeTrial(save, puzzleId);
    if (payout.granted) hooks.onProgress?.(discoveryProgress(save));
    return payout;
  }

  return {
    update,
    // Shrines
    beginShrine, shrineMove, shrineAsk, shrineAnswer, trialHint: () => trialHint(session),
    get session() { return session; },
    // Landmarks
    solveLandmark,
    // Reads for the HUD
    progress: () => discoveryProgress(save),
    compass: (x, z) => compassHint(save, x, z, { pool }),
    markers: () => mapMarkers(save),
    pages: () => pageProgress(save),
    journal: () => collection(save),
    closingLine: () => closingLine(save),
    buff: (key) => buffValue(save, key),
    sweepMilestones: () => claimMilestones(save),
    radii: TRIGGER_RADIUS,
  };
}
