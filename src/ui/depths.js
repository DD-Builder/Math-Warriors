/**
 * Named depth layers for the battle stage (and shared UI).
 *
 * BattleScene historically sprinkled literal depths (0/11/13/14/20/21/
 * 25/28/50/100/150/200) which made z-order bugs invisible in review —
 * the momentum bar and boss timer both sat at an implicit depth 0
 * behind the depth-20 panels. Every battle display object should take
 * its depth from this table so the stacking order reads as a design,
 * not an accident.
 */
export const BATTLE_DEPTH = {
  BG: 0,             // parallax layers live in 0-8
  THEME_DETAIL: 2,
  GROUND: 10,
  SHADOWS: 11,
  ACTORS: 12,        // perspective pos.depth stays within 12-13
  ACTOR_LABELS: 14,  // nameplates, HP bars
  INDICATOR: 15,
  VFX: 18,
  PANEL_SHADOW: 19,
  PANEL: 20,
  UI: 21,            // bars, labels on panels
  UI_TEXT: 23,
  ANSWER_BTNS: 25,
  COMMAND: 28,
  TIMER: 30,         // question timer must never hide
  INTENT: 32,        // boss intent badge
  TOAST: 50,
  PAUSE: 100,
  HINT: 150,
  END: 200,
};
