/**
 * Seeded pseudo-random number generator.
 *
 * Xorshift32 — small, fast, deterministic, good enough for visual
 * wobble and asset placement. Not cryptographically secure.
 *
 * Three separate copies of this lived in paperUI.js, papercut.js and
 * titleArt.js before we unified them here.
 */
export function makeRng(seed) {
  let s = ((seed ^ 0x9e3779b9) + 0x6c62272e) >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}
