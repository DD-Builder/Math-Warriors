/**
 * WHAT KEY IS PLAYING RIGHT NOW.
 *
 * Pure data. The composed songs carry their key only in a comment at
 * the top of each file, which is fine for a human reading floors.js and
 * useless to a victory fanfare that has to resolve in whatever key the
 * player is standing in. This table is the machine-readable version.
 *
 * Everything downstream needs it:
 *   - a victory phrase that cadences in the CURRENT key, not always C
 *   - a biome crossfade that knows how far it is modulating
 *   - a discovery chime that lands on a note the score already contains
 *
 * Keys are transcribed from each song's own header comment; songKeys'
 * test asserts every registered song has an entry, so a new piece
 * cannot quietly fall back to "probably C major".
 */

export const DEFAULT_KEY = { tonic: 'C', mode: 'maj' };

export const SONG_KEYS = {
  'music/title': { tonic: 'C', mode: 'maj' },
  'music/map': { tonic: 'C', mode: 'maj' },
  'music/overworld': { tonic: 'C', mode: 'maj' },
  'music/overworld-calm': { tonic: 'C', mode: 'maj' },
  'music/battle': { tonic: 'A', mode: 'min' },
  'stinger/victory': { tonic: 'C', mode: 'maj' },
  'stinger/defeat': { tonic: 'A', mode: 'min' },

  'music/floor-1': { tonic: 'C', mode: 'maj' },   // Garden of Sums
  'music/floor-2': { tonic: 'A', mode: 'min' },   // The Tide Ledger
  'music/floor-3': { tonic: 'G', mode: 'maj' },   // The Doubling Light
  'music/floor-4': { tonic: 'D', mode: 'min' },   // Emberworks
  'music/floor-5': { tonic: 'F', mode: 'maj' },   // Four Keys of Thaw
  'music/floor-6': { tonic: 'E', mode: 'min' },   // The Shape of Light
  'music/floor-7': { tonic: 'C', mode: 'maj' },   // Penny Lanes
  'music/floor-8': { tonic: 'A', mode: 'min' },   // The Quiet Stacks
  'music/floor-9': { tonic: 'C', mode: 'maj' },   // The Mending Room

  'music/boss-1': { tonic: 'A', mode: 'min' },    // Thorn Waltz
  'music/boss-2': { tonic: 'D', mode: 'min' },    // Fathom King
  'music/boss-3': { tonic: 'E', mode: 'min' },    // Stormbreach
  'music/boss-4': { tonic: 'D', mode: 'min' },    // Magma Heart
  'music/boss-5': { tonic: 'A', mode: 'min' },    // White Silence
  'music/boss-6': { tonic: 'E', mode: 'min' },    // Shatterlight
  'music/boss-7': { tonic: 'A', mode: 'min' },    // The Crooked Fair
  'music/boss-8': { tonic: 'D', mode: 'min' },    // Ink Eclipse
  'music/boss-9': { tonic: 'A', mode: 'min' },    // Q.E.D. (turns to C major)
  'music/boss': { tonic: 'A', mode: 'min' },
};

/** The key a song is in — never null, so callers never branch on it. */
export function keyOf(songKey) {
  return SONG_KEYS[songKey] || DEFAULT_KEY;
}

/**
 * Boss 9 modulates from A minor to C major at its turn, and a victory
 * fanfare fired during the finale should land where the music actually
 * IS. Songs can declare a resolved key for their late sections.
 */
export const RESOLVED_KEYS = {
  'music/boss-9': { tonic: 'C', mode: 'maj' },
};

export function resolvedKeyOf(songKey) {
  return RESOLVED_KEYS[songKey] || keyOf(songKey);
}
