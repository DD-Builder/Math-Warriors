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

const SONGS = {
  'music/title': TITLE_SONG,
  'music/map': WORLD_SONG,
  'music/battle': BATTLE_SONG,
  'stinger/victory': VICTORY_STINGER,
  'stinger/defeat': DEFEAT_STINGER,
};

// Until per-floor themes land (M5), floors share the meadow at map
// tempo and bosses share the battle theme — real music everywhere
// from day one, unique pieces arriving floor by floor.
for (let f = 1; f <= 9; f++) {
  SONGS[`music/floor-${f}`] = SONGS[`music/floor-${f}`] || WORLD_SONG;
  SONGS[`music/boss-${f}`] = SONGS[`music/boss-${f}`] || BATTLE_SONG;
}
SONGS['music/boss'] = SONGS['music/boss'] || BATTLE_SONG;

export function getSong(key) { return SONGS[key] || null; }
export function hasSong(key) { return !!SONGS[key]; }
export function registerSong(key, song) { SONGS[key] = song; }
export function allSongKeys() { return Object.keys(SONGS); }
