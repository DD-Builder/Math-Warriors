/**
 * Song registry: logical music keys → composed song data.
 *
 * Keys mirror the AudioManager's SOUNDS registry so scenes keep
 * calling audio.playMusic('music/…') unchanged. Floor and boss keys
 * fall back sensibly until every piece lands: floors fall back to the
 * title-family meadow, bosses to the battle theme.
 */

import { TITLE_SONG } from './title.js';
import { WORLD_SONG } from './world.js';
import { BATTLE_SONG, VICTORY_STINGER, DEFEAT_STINGER } from './battle.js';
import { FLOOR_SONGS } from './floors.js';
import { BOSS_SONGS } from './bosses.js';
import { OVERWORLD_SONG, OVERWORLD_CALM_SONG } from './overworld.js';

const SONGS = {
  'music/title': TITLE_SONG,
  'music/map': WORLD_SONG,
  // The main theme. 'music/overworld' is the adaptive cut (day/night
  // voicings + alert/combat/boss layers); the calm cut is the same tune
  // with the fight stems removed, for menus and the world map.
  'music/overworld': OVERWORLD_SONG,
  'music/overworld-calm': OVERWORLD_CALM_SONG,
  'music/battle': BATTLE_SONG,
  'stinger/victory': VICTORY_STINGER,
  'stinger/defeat': DEFEAT_STINGER,
};

// One composed theme per floor and one unique score per boss.
for (let f = 1; f <= 9; f++) {
  SONGS[`music/floor-${f}`] = FLOOR_SONGS[f - 1];
  SONGS[`music/boss-${f}`] = BOSS_SONGS[f - 1];
}
SONGS['music/boss'] = BOSS_SONGS[8];

export function getSong(key) { return SONGS[key] || null; }
export function hasSong(key) { return !!SONGS[key]; }
export function registerSong(key, song) { SONGS[key] = song; }
export function allSongKeys() { return Object.keys(SONGS); }
