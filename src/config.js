// Global game constants. Anything that would be a "magic number" elsewhere
// should live here so it can be changed in one place.

// iPad is 4:3. Design for that. Desktop/widescreen gets small side bars
// which is fine — iPad is our primary target.
export const GAME_WIDTH = 1440;
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
  cobaltL:  0x5a7ab8,
  plum:     0x5a1878,  // Wizard
  plumL:    0x9050c8,
  rose:     0xc02860,  // Bunny
  roseL:    0xe060a0,

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
  GRADE_SELECT: 'GradeSelectScene',
  PARTY_SELECT: 'PartySelectScene',
  WORLD_MAP: 'WorldMapScene',
  MAZE: 'MazeScene',
  BATTLE: 'BattleScene',
  SETTINGS: 'SettingsScene',
};

// Safe margin from screen edges (pixels). All UI MUST stay inside this.
// On iPad Safari, about 60px of the viewport is eaten by chrome/toolbar
// depending on orientation and scroll state. We use a generous 40px
// margin so nothing ever gets clipped, plus reserve 100px off the bottom
// to account for Safari's bottom bar. Tune these if you see cutoffs.
export const MARGIN = 40;
export const BOTTOM_SAFE = 120;
export const TOP_SAFE = 60;
export const VERSION = '0.5.0';
