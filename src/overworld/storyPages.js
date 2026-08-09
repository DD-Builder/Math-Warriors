/**
 * storyPages — the twelve papercut pages, as a readable collection.
 *
 * ── THE COLLECTION IS THE STORY ────────────────────────────────────────────
 * Nine of the pages are the Chaos King's proof, which data/story.js already
 * owns as PROOF_FRAGMENTS — one per floor, in order, ending on "Nothing was
 * ever counted alone. + everyone." Three are margin notes in the same hand,
 * much smaller, that nobody was meant to read.
 *
 * Read in floor order the proof is a monster's manifesto. Read WITH the margin
 * notes interleaved it is somebody frightened, checking their own work at three
 * in the morning and not liking the answer. That reframing is the entire payoff
 * of the collection, and it is why the margin notes are the hardest three to
 * reach rather than the easiest.
 *
 * ── WHY THE IMPORT IS DEFENSIVE ────────────────────────────────────────────
 * data/story.js is a 1400-line file that several people edit, and this module
 * must not be the reason the island fails to boot. So PROOF_FRAGMENTS is read
 * through `proofTextFor()`, which validates the shape it got and falls back to
 * the `fallback` string authored next to each page in discoverySpec.js. The
 * fallbacks are kept in sync by a test that asserts they MATCH story.js today —
 * so drift is caught at test time, not hidden at runtime.
 *
 * Plain-Node importable: no three, no phaser, no DOM, no RNG.
 */
import { STORY_PAGES, PAGE_SET_REWARD } from './discoverySpec.js';
import { pagesFound, isClaimed, PAGE_SET_CLAIM } from './discovery.js';
import * as story from '../data/story.js';

/**
 * The proof text for a floor, from story.js when it is well-formed and from the
 * page's own fallback when it is not. Never throws and never returns empty.
 *
 * @param {number|null} floorId
 * @param {string} fallback
 * @returns {string}
 */
export function proofTextFor(floorId, fallback = '') {
  const clean = typeof fallback === 'string' ? fallback : '';
  if (floorId == null) return clean;
  try {
    const list = story && Array.isArray(story.PROOF_FRAGMENTS) ? story.PROOF_FRAGMENTS : null;
    if (!list) return clean;
    const hit = list.find((p) => p && p.floor === floorId);
    if (hit && typeof hit.text === 'string' && hit.text.trim()) return hit.text;
  } catch {
    // story.js is mid-edit or malformed. The island still boots.
  }
  return clean;
}

/** The authored title for a proof page, or a generated one. */
export function proofTitleFor(floorId, order) {
  if (floorId != null) {
    try {
      const list = story && Array.isArray(story.PROOF_FRAGMENTS) ? story.PROOF_FRAGMENTS : null;
      const hit = list && list.find((p) => p && p.floor === floorId);
      if (hit && typeof hit.title === 'string' && hit.title.trim()) return hit.title;
    } catch { /* fall through */ }
  }
  return `Page ${order}`;
}

/**
 * One page, fully resolved: id, where it sits in the reading order, its text,
 * and whether the player has it.
 *
 * @returns {{id:string, order:number, floorId:?number, biome:string,
 *            margin:boolean, hard:boolean, title:string, text:string,
 *            found:boolean}}
 */
export function resolvePage(page, foundIds = []) {
  return {
    id: page.id,
    order: page.order,
    floorId: page.floorId,
    biome: page.biome,
    margin: !!page.margin,
    hard: !!page.hard,
    title: page.margin ? 'A note in the margin' : proofTitleFor(page.floorId, page.order),
    text: page.margin ? (page.fallback || '') : proofTextFor(page.floorId, page.fallback),
    found: foundIds.includes(page.id),
  };
}

/**
 * The whole collection in reading order, with found/missing marked. This is
 * what the journal screen renders — including the pages you do NOT have, as
 * blank torn edges, because a collection you cannot see the shape of is not a
 * collection, it is a surprise.
 */
export function collection(save) {
  const found = pagesFound(save);
  return STORY_PAGES.slice()
    .sort((a, b) => a.order - b.order)
    .map((p) => resolvePage(p, found));
}

/**
 * Just the text the player has actually earned, in order — the proof as it
 * currently reads. Missing pages leave a gap rather than closing up, so the
 * argument visibly has holes in it until it does not.
 *
 * @returns {{lines:{id:string,text:string,margin:boolean}[], gaps:number}}
 */
export function proofSoFar(save) {
  const items = collection(save);
  const lines = [];
  let gaps = 0;
  for (const p of items) {
    if (p.found) lines.push({ id: p.id, text: p.text, margin: p.margin });
    else gaps++;
  }
  return { lines, gaps };
}

/**
 * Collection progress, and the one fact the journal's header turns on: whether
 * the last line has changed yet.
 *
 * @returns {{found:number, total:number, pct:number, margins:number,
 *            complete:boolean, claimed:boolean, reward:object}}
 */
export function pageProgress(save) {
  const items = collection(save);
  const found = items.filter((p) => p.found).length;
  const margins = items.filter((p) => p.found && p.margin).length;
  const total = items.length || 1;
  return {
    found,
    total: items.length,
    pct: Math.max(0, Math.min(1, found / total)),
    margins,
    complete: found === items.length,
    claimed: isClaimed(save, PAGE_SET_CLAIM),
    reward: PAGE_SET_REWARD,
  };
}

/**
 * The closing line of the journal. Three states, and the third only exists
 * because the player went and found three notes that were never part of the
 * argument.
 */
export function closingLine(save) {
  const p = pageProgress(save);
  if (p.complete) return 'Nothing was ever counted alone. + everyone.';
  if (p.margins > 0) return 'He checked it eleven times. He wanted to be wrong.';
  return 'The proof is not finished. Somebody tore it up.';
}
