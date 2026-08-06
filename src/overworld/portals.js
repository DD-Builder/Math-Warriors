/**
 * Portal routing — pure mirror of WorldMapScene.enterFloor.
 *
 * The 3D overworld launches floors through portals instead of map nodes,
 * but the destination MUST match the 2D map exactly (same party gate, same
 * entry-cutscene rule, same scene payloads) or the two entrances would
 * drift apart as the game evolves. This module owns that decision as pure
 * data so it can be unit-tested; the scene layer only reads registry /
 * localStorage for hasMazeState and calls transitionTo with the result.
 *
 * Semantics copied from enterFloor (src/scenes/WorldMapScene.js):
 *   - party gate is `save.party.length >= 3`, not merely non-empty;
 *   - cutscene payload is { lines, floorId, nextScene, nextData } — the
 *     CutsceneScene consumes the dialogue lines directly, there is no
 *     `key` field;
 *   - a saved maze-in-progress skips the entry cutscene.
 * Lock gating mirrors the map's node gate (`!saved.unlocked` ⇒ locked),
 * which enterFloor itself never re-checks because locked nodes are not
 * clickable.
 */
import { SCENES } from '../config.js';
import { DIALOGUE } from '../data/dialogue.js';

/**
 * WorldMapScene treats a falsy `unlocked` as locked (`const locked =
 * !saved.unlocked`), so a missing floors entry is locked, not open.
 */
export function portalUnlocked(save, floorId) {
  return !!(save && save.floors && save.floors[floorId - 1] && save.floors[floorId - 1].unlocked);
}

/**
 * Decide where a portal sends the player.
 * @param {object} args
 * @param {object} args.save
 * @param {number} args.floorId 1-based floor id
 * @param {boolean} [args.hasMazeState] saved maze-in-progress (registry or
 *   localStorage — the impure lookup stays in the caller)
 * @param {boolean} [args.hasEntryDialogue] override; defaults to whether
 *   DIALOGUE has non-empty floor<N>_entry lines, exactly like enterFloor
 * @returns {{block:string}|{sceneKey:string, data:object}}
 */
export function routePortal({ save, floorId, hasMazeState = false, hasEntryDialogue }) {
  const haveParty = !!(save && save.party && save.party.length >= 3);
  if (!haveParty) return { block: 'no-party' };
  if (!portalUnlocked(save, floorId)) return { block: 'locked' };

  const lines = DIALOGUE[`floor${floorId}_entry`];
  const hasLines = !!(lines && lines.length > 0);
  // An explicit hasEntryDialogue:true still needs real lines to show —
  // CutsceneScene cannot render an empty script.
  const wantsCutscene = (hasEntryDialogue === undefined ? hasLines : hasEntryDialogue) && hasLines;
  if (wantsCutscene && !hasMazeState) {
    return {
      sceneKey: SCENES.CUTSCENE,
      data: {
        lines,
        floorId,
        nextScene: SCENES.MAZE,
        nextData: { floor: floorId, fromWorldMap: true },
      },
    };
  }
  return { sceneKey: SCENES.MAZE, data: { floor: floorId, fromWorldMap: true } };
}
