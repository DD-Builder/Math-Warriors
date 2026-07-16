// Global game constants. Anything that would be a "magic number" elsewhere
// should live here so it can be changed in one place.

// iPad is 4:3. Design for that. Desktop/widescreen gets small side bars
// which is fine — iPad is our primary target.
export const GAME_WIDTH = 1440;
export const GAME_HEIGHT = 1080;

// ── PAPERCUT DIORAMA PALETTE ──────────────────────────────────────
// The entire game is rendered as layered cut paper: muted teal, coral,
// sage and cream, soft teal-tinted shadows between layers, and NO dark
// outlines anywhere. Every color on screen must come from this palette.
export const PAPER = {
  // Papers (light → dark)
  white:    0xfdfbf2,  // white butterflies, petals, highlights
  cream:    0xf5eedd,  // primary paper / sky
  creamD:   0xe8dec6,  // shaded cream
  sand:     0xd9cfb2,  // deep cream / parchment

  // Sage greens (the reference's outer background)
  sage:     0xb0c498,
  sageD:    0x8faa72,
  leaf:     0x6b9b56,

  // Forest greens — richer, more vivid
  forestL:  0x3e8a52,
  forest:   0x28704a,
  forestD:  0x1b5438,

  // Teals — more saturated, vivid
  tealL:    0x5dc4b4,
  teal:     0x2bb3a3,
  tealD:    0x1a7d78,
  inkTeal:  0x143f42,  // deepest teal — replaces black ink

  // Corals & warms
  peach:    0xf2bf9a,
  coral:    0xe78f6c,
  coralD:   0xd06a4d,
  orange:   0xe39a4a,
  gold:     0xecb964,

  // Floral accents
  lavender: 0x9c8fc0,
  lavenderD:0x7c6fa8,
  sky:      0xa4c8d8,
  rose:     0xe8a09a,

  // Layer shadow (use at alpha ~0.3, offset down ~8px)
  shadow:   0x1f3d3f,
};

// Soft drop-shadow parameters shared by every papercut layer
export const PAPER_SHADOW = { color: PAPER.shadow, alpha: 0.30, dx: 0, dy: 8, blur: 10 };

// Legacy color keys, remapped into the papercut palette so every
// existing call site lands in-palette automatically.
export const COLORS = {
  // Paper / ink
  bg:       PAPER.inkTeal,
  paper:    PAPER.cream,
  paperD:   PAPER.creamD,
  ink:      PAPER.inkTeal,
  inkL:     0x4a6b68,

  // Hero class colors
  cobalt:   PAPER.teal,      // Knight — teal
  cobaltL:  PAPER.tealL,
  plum:     PAPER.lavenderD, // Wizard — lavender
  plumL:    0xa89bd0,
  rose:     0xdd7f74,        // Bunny — coral-rose
  roseL:    0xf0a89c,

  // UI accents
  gold:     PAPER.orange,
  goldL:    PAPER.gold,
  scarlet:  0xc05a48,
  scarletL: 0xdd8166,

  // Utility accents
  green:    PAPER.forest,
  greenL:   0x6f9e7e,

};

export const PAPER_CSS = Object.fromEntries(
  Object.entries(PAPER).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
);

export const COLORS_CSS = Object.fromEntries(
  Object.entries(COLORS).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
);

// Scene keys — use these constants, never raw strings, so renames are safe
export const SCENES = {
  BOOT: 'BootScene',
  TITLE: 'TitleScene',
  TUTORIAL: 'TutorialScene',
  GRADE_SELECT: 'GradeSelectScene',
  PLACEMENT: 'PlacementScene',
  PARTY_SELECT: 'PartySelectScene',
  WORLD_MAP: 'WorldMapScene',
  CUTSCENE: 'CutsceneScene',
  MAZE: 'MazeScene',
  BATTLE: 'BattleScene',
  ENDING: 'EndingScene',
  SHOP: 'ShopScene',
  SETTINGS: 'SettingsScene',
  PROGRESS: 'ProgressScene',
  SAVE_SELECT: 'SaveSlotScene',
  MASTERY: 'MasteryScene',
  BOSS_RUSH: 'BossRushScene',
  EVOLUTION: 'EvolutionScene',
  GALLERY: 'GalleryScene',
  TOWER: 'TowerScene',
};

// Safe margin from screen edges (pixels). All UI MUST stay inside this.
// On iPad Safari, about 60px of the viewport is eaten by chrome/toolbar
// depending on orientation and scroll state. We use a generous 40px
// margin so nothing ever gets clipped, plus reserve 100px off the bottom
// to account for Safari's bottom bar. Tune these if you see cutoffs.
export const MARGIN = 40;
export const BOTTOM_SAFE = 120;
export const TOP_SAFE = 60;
export const VERSION = '0.8.6';

export function mazeStateKey(floorId) { return `mazeState_${floorId}`; }
