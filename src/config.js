// Global game constants. Anything that would be a "magic number" elsewhere
// should live here so it can be changed in one place.

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export const COLORS = {
  // Paper / ink (carried over from the prototype's intended palette)
  bg:       0x0a0604,
  paper:    0xf0e4cc,
  paperD:   0xddd0b0,
  ink:      0x1a0e04,
  inkL:     0x4a3420,

  // Hero class colors
  cobalt:   0x2e4e88,  // Knight
  plum:     0x5a1878,  // Wizard
  rose:     0xc02860,  // Bunny

  // UI accents
  gold:     0xc07818,
  goldL:    0xe8a030,
  scarlet:  0x9c2020,
  scarletL: 0xc83030,

  // Floor mood
  green:    0x2a5c1e,
  greenL:   0x4a9830,
};

export const COLORS_CSS = Object.fromEntries(
  Object.entries(COLORS).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
);

// Scene keys — use these constants, never raw strings, so renames are safe
export const SCENES = {
  BOOT: 'BootScene',
  TITLE: 'TitleScene',
  // Coming in v0.2+
  GRADE_SELECT: 'GradeSelectScene',
  PARTY_SELECT: 'PartySelectScene',
  WORLD_MAP: 'WorldMapScene',
  MAZE: 'MazeScene',
  BATTLE: 'BattleScene',
};

// Version shown on title screen. Bump this on every meaningful change.
export const VERSION = '0.1.0';
