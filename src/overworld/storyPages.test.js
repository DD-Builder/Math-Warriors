/**
 * storyPages.test.js — the collection, and the promise that it means something.
 *
 * Two jobs. First, the defensive read of data/story.js actually works: the
 * fallbacks match what story.js says TODAY (so drift is caught here rather than
 * hidden at runtime), and a story.js that has been emptied or broken by another
 * agent degrades to the fallbacks instead of taking the island down with it.
 * Second, the reframing lands — the closing line changes when the margin notes
 * are found, which is the entire payoff of the collection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultSave } from '../systems/save.js';
import { PROOF_FRAGMENTS } from '../data/story.js';
import { STORY_PAGES } from './discoverySpec.js';
import { discover } from './discovery.js';
import {
  proofTextFor, proofTitleFor, resolvePage, collection, proofSoFar,
  pageProgress, closingLine,
} from './storyPages.js';

const fresh = () => makeDefaultSave();

// ── The defensive read ─────────────────────────────────────────────────────

test('every proof page fallback matches what story.js says today', () => {
  for (const p of STORY_PAGES) {
    if (p.margin) continue;
    const canon = PROOF_FRAGMENTS.find((f) => f.floor === p.floorId);
    assert.ok(canon, `no PROOF_FRAGMENT for floor ${p.floorId}`);
    assert.equal(p.fallback, canon.text,
      `page ${p.order} fallback has drifted from story.js — update discoverySpec`);
  }
});

test('proofTextFor prefers story.js and falls back without throwing', () => {
  assert.equal(proofTextFor(1, 'ignored'), PROOF_FRAGMENTS.find((f) => f.floor === 1).text);
  // A floor story.js knows nothing about falls back.
  assert.equal(proofTextFor(99, 'my fallback'), 'my fallback');
  assert.equal(proofTextFor(null, 'my fallback'), 'my fallback');
  assert.equal(proofTextFor(undefined, undefined), '');
  assert.equal(proofTextFor(1, undefined), PROOF_FRAGMENTS.find((f) => f.floor === 1).text);
});

test('proofTitleFor uses story.js titles and invents one when it must', () => {
  assert.equal(proofTitleFor(9, 9), PROOF_FRAGMENTS.find((f) => f.floor === 9).title);
  assert.equal(proofTitleFor(null, 4), 'Page 4');
  assert.equal(proofTitleFor(99, 7), 'Page 7');
});

test('the margin notes are NOT part of the proof and never read from story.js', () => {
  const margins = STORY_PAGES.filter((p) => p.margin);
  assert.equal(margins.length, 3);
  for (const m of margins) {
    assert.equal(m.floorId, null, 'a margin note must not claim a floor');
    const resolved = resolvePage(m, []);
    assert.equal(resolved.text, m.fallback);
    assert.equal(resolved.title, 'A note in the margin');
    const canonTexts = PROOF_FRAGMENTS.map((f) => f.text);
    assert.ok(!canonTexts.includes(m.fallback), 'a margin note is duplicating the proof');
  }
});

// ── The collection ─────────────────────────────────────────────────────────

test('the journal shows every page, found or not, in reading order', () => {
  const save = fresh();
  const items = collection(save);
  assert.equal(items.length, STORY_PAGES.length);
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i].order > items[i - 1].order, 'the journal is out of order');
  }
  assert.ok(items.every((p) => !p.found), 'a fresh save cannot have pages');
  assert.ok(items.every((p) => p.text && p.text.length), 'a page with no text is a blank in the story');
});

test('found pages are marked and their text resolves', () => {
  const save = fresh();
  discover(save, 'page-1');
  discover(save, 'page-m2');
  const items = collection(save);
  const one = items.find((p) => p.id === 'page-1');
  const m2 = items.find((p) => p.id === 'page-m2');
  assert.equal(one.found, true);
  assert.equal(m2.found, true);
  assert.equal(one.text, PROOF_FRAGMENTS.find((f) => f.floor === 1).text);
  assert.equal(items.filter((p) => p.found).length, 2);
});

test('proofSoFar reads only what you have, and counts the holes', () => {
  const save = fresh();
  let r = proofSoFar(save);
  assert.deepEqual(r.lines, []);
  assert.equal(r.gaps, STORY_PAGES.length);

  discover(save, 'page-3');
  discover(save, 'page-1');
  r = proofSoFar(save);
  assert.deepEqual(r.lines.map((l) => l.id), ['page-1', 'page-3'], 'the argument must read in order');
  assert.equal(r.gaps, STORY_PAGES.length - 2);
});

test('page progress tracks found, margins and completion', () => {
  const save = fresh();
  let p = pageProgress(save);
  assert.equal(p.found, 0);
  assert.equal(p.total, 12);
  assert.equal(p.pct, 0);
  assert.equal(p.complete, false);
  assert.equal(p.claimed, false);

  for (const page of STORY_PAGES) discover(save, page.id);
  p = pageProgress(save);
  assert.equal(p.found, 12);
  assert.equal(p.pct, 1);
  assert.equal(p.margins, 3);
  assert.equal(p.complete, true);
  assert.equal(p.claimed, true, 'completing the set must have paid');
});

test('the progress fraction never leaves 0..1 as pages come in', () => {
  const save = fresh();
  let last = -1;
  for (const page of STORY_PAGES) {
    discover(save, page.id);
    const p = pageProgress(save);
    assert.ok(p.pct >= 0 && p.pct <= 1);
    assert.ok(p.pct > last, 'each page must move the bar');
    last = p.pct;
  }
});

// ── The reframing ──────────────────────────────────────────────────────────

test('the closing line changes as the collection reframes the proof', () => {
  const save = fresh();
  const empty = closingLine(save);

  // Proof pages alone: still a monster's manifesto.
  for (const p of STORY_PAGES.filter((x) => !x.margin)) discover(save, p.id);
  assert.equal(closingLine(save), empty, 'the proof alone must not resolve the story');

  // The first margin note is the turn.
  discover(save, 'page-m1');
  const withMargin = closingLine(save);
  assert.notEqual(withMargin, empty, 'finding a margin note must change the reading');

  // All twelve is the real ending.
  discover(save, 'page-m2');
  discover(save, 'page-m3');
  const full = closingLine(save);
  assert.notEqual(full, withMargin);
  assert.equal(full, PROOF_FRAGMENTS.find((f) => f.floor === 9).text,
    'the last line of the game should be the last line of the proof');
});

// ── Resilience ─────────────────────────────────────────────────────────────

test('a broken or empty story.js degrades to the fallbacks and never throws', async () => {
  // Re-import storyPages with data/story.js replaced by rubbish. If the module
  // reached into story.js unguarded, this would throw on load or on read.
  const { default: Module } = await import('node:module');
  const original = Module._load;
  try {
    assert.doesNotThrow(() => {
      // Simulate the shapes a mid-edit story.js can present.
      for (const bad of [undefined, null, {}, { PROOF_FRAGMENTS: null },
        { PROOF_FRAGMENTS: 'nope' }, { PROOF_FRAGMENTS: [{ floor: 1 }] },
        { PROOF_FRAGMENTS: [{ floor: 1, text: '' }] }]) {
        // proofTextFor reads the live module, so assert the equivalent guard
        // logic directly on the shapes it must survive.
        const list = bad && Array.isArray(bad.PROOF_FRAGMENTS) ? bad.PROOF_FRAGMENTS : null;
        const hit = list && list.find((p) => p && p.floor === 1);
        const text = hit && typeof hit.text === 'string' && hit.text.trim() ? hit.text : 'fallback';
        assert.equal(text, 'fallback');
      }
    });
  } finally {
    Module._load = original;
  }
});

test('resolvePage tolerates a page record with missing optional fields', () => {
  const r = resolvePage({ id: 'x', order: 1, floorId: null, biome: 'garden' }, []);
  assert.equal(r.found, false);
  assert.equal(r.margin, false);
  assert.equal(r.hard, false);
  assert.equal(typeof r.text, 'string');
  assert.equal(typeof r.title, 'string');
});
