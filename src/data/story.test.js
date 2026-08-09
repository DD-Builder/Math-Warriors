/**
 * Story contract tests.
 *
 * The story is DATA, so it can be validated like data: every floor has
 * its three beats, every hero has a distinct voice, every boss lands a
 * theme, and no line is long enough to overflow DialogueOverlay.
 */
import { test } from 'node:test';
import assert from 'node:assert';

import {
  STORY_ARC, FLOOR_BEATS, FLOOR_BIOME, FLOOR_GUIDE, PROOF_FRAGMENTS,
  HERO_VOICES, BOSS_VOICE, BOSS_ORDER, PARTY_BANTER, SOLO_BANTER,
  PAIR_BANTER, COMP_BANTER, MAX_LINE_CHARS, BANTER_COUNT,
  getArcBeat, getFloorBeat, getProofFragment, proofSoFar, biomeForFloor,
  getHeroVoice, getHeroLines, getSignatureLines, pickHeroLine,
  getPerspectiveLines, getBossVoice, getBossLine,
  availableBanter, resolveBanter, pickBanter, banterMatches,
  heroDisplayName, getRecap,
} from './story.js';
import { ALL_HEROES } from './heroes.js';
import { BOSS_IDS } from './enemies.js';
import { DIALOGUE } from './dialogue.js';

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PHASES = ['arrival', 'midpoint', 'departure'];

// ── helpers ──────────────────────────────────────────────────────

function everyLine() {
  const out = [];
  for (const f of FLOORS) {
    for (const p of PHASES) {
      for (const l of getFloorBeat(f, p)) out.push({ where: `floor${f}.${p}`, ...l });
    }
  }
  for (const [id, v] of Object.entries(BOSS_VOICE)) {
    out.push({ where: `boss.${id}.prefight`, speaker: v.name, text: v.prefight });
    out.push({ where: `boss.${id}.defeat`, speaker: v.name, text: v.defeat });
  }
  for (const [id, v] of Object.entries(HERO_VOICES)) {
    for (const cat of ['battle', 'rescue', 'idle']) {
      for (const t of v.lines[cat]) out.push({ where: `hero.${id}.${cat}`, speaker: v.name, text: t });
    }
    out.push({ where: `hero.${id}.perspective`, speaker: v.name, text: v.perspective });
  }
  for (const e of PARTY_BANTER) {
    for (const l of e.lines) out.push({ where: `banter.${e.id}`, speaker: l.who || l.whoClass, text: l.text });
  }
  return out;
}

// ── the arc ──────────────────────────────────────────────────────

test('arc: nine beats, one per floor, in order', () => {
  assert.equal(STORY_ARC.length, 9);
  assert.deepEqual(STORY_ARC.map(b => b.floor), FLOORS);
  for (const b of STORY_ARC) {
    for (const k of ['title', 'stake', 'discovery', 'turn']) {
      assert.ok(b[k] && b[k].length > 10, `floor ${b.floor} missing ${k}`);
      assert.ok(b[k].length <= MAX_LINE_CHARS, `floor ${b.floor} ${k} too long: ${b[k].length}`);
    }
  }
});

test('arc: getArcBeat resolves every floor and nothing else', () => {
  for (const f of FLOORS) assert.equal(getArcBeat(f).floor, f);
  assert.equal(getArcBeat(99), null);
});

test('arc: stakes rise — the finale names the Theorem, not the Chaos King', () => {
  assert.match(STORY_ARC[8].stake, /Theorem/);
  // the emotional turn: completion, not destruction
  assert.match(STORY_ARC[8].turn, /completes/i);
  assert.doesNotMatch(STORY_ARC[8].turn, /destroy|kill|erase him\b/i);
});

// ── per-floor beats ──────────────────────────────────────────────

test('beats: every floor has arrival, midpoint and departure', () => {
  for (const f of FLOORS) {
    for (const p of PHASES) {
      const lines = getFloorBeat(f, p);
      assert.ok(lines.length >= 3, `floor ${f} ${p} has only ${lines.length} lines`);
      for (const l of lines) {
        assert.ok(l.speaker, `floor ${f} ${p}: line with no speaker`);
        assert.ok(l.text, `floor ${f} ${p}: line with no text`);
      }
    }
  }
});

test('beats: getFloorBeat returns copies, not the live arrays', () => {
  const a = getFloorBeat(1, 'arrival');
  a.push({ speaker: 'X', text: 'y' });
  assert.notEqual(getFloorBeat(1, 'arrival').length, a.length);
  assert.deepEqual(getFloorBeat(99, 'arrival'), []);
  assert.deepEqual(getFloorBeat(1, 'nope'), []);
});

test("beats: each floor's guide actually speaks on that floor", () => {
  for (const f of FLOORS) {
    const speakers = new Set(PHASES.flatMap(p => getFloorBeat(f, p).map(l => l.speaker)));
    assert.ok(speakers.has(FLOOR_GUIDE[f]), `floor ${f}: guide ${FLOOR_GUIDE[f]} never speaks`);
  }
});

test('beats: the floor-8 midpoint reveals the first-draft truth', () => {
  const text = getFloorBeat(8, 'midpoint').map(l => l.text).join(' ');
  assert.match(text, /FIRST DRAFT/);
  assert.match(text, /does not add up/);
});

test('beats: the floor-9 departure completes rather than destroys', () => {
  const text = getFloorBeat(9, 'departure').map(l => l.text).join(' ');
  assert.match(text, /counted alone/);
  assert.match(text, /I add up/);
});

// ── the proof ────────────────────────────────────────────────────

test('proof: one fragment per floor, and the last line answers the first', () => {
  assert.equal(PROOF_FRAGMENTS.length, 9);
  assert.deepEqual(PROOF_FRAGMENTS.map(p => p.floor), FLOORS);
  assert.match(getProofFragment(1).text, /Let the world be W/);
  assert.match(getProofFragment(9).text, /everyone/);
  assert.equal(getProofFragment(42), null);
  for (const p of PROOF_FRAGMENTS) {
    assert.ok(p.text.length <= MAX_LINE_CHARS, `${p.title} too long`);
  }
});

test('proof: proofSoFar reveals progressively', () => {
  assert.equal(proofSoFar(0).length, 0);
  assert.equal(proofSoFar(4).length, 4);
  assert.equal(proofSoFar(9).length, 9);
});

// ── biomes ───────────────────────────────────────────────────────

test('biomes: every floor maps to a distinct biome', () => {
  const seen = new Set();
  for (const f of FLOORS) {
    const b = biomeForFloor(f);
    assert.ok(b, `floor ${f} has no biome`);
    assert.ok(!seen.has(b), `duplicate biome ${b}`);
    seen.add(b);
  }
  assert.equal(Object.keys(FLOOR_BIOME).length, 9);
});

// ── hero voices ──────────────────────────────────────────────────

test('voices: all 15 heroes have a voice, and no strays', () => {
  assert.equal(Object.keys(HERO_VOICES).length, 15);
  assert.equal(ALL_HEROES.length, 15);
  for (const h of ALL_HEROES) {
    const v = getHeroVoice(h.id);
    assert.ok(v, `${h.id} has no voice`);
    assert.equal(v.name, h.name, `${h.id} voice name drifted from roster`);
  }
  for (const id of Object.keys(HERO_VOICES)) {
    assert.ok(ALL_HEROES.some(h => h.id === id), `voice for unknown hero ${id}`);
  }
});

test('voices: each hero has direction, a tic, a perspective and 3-5 signature lines', () => {
  for (const [id, v] of Object.entries(HERO_VOICES)) {
    assert.ok(v.voice.length > 20, `${id}: voice direction too thin`);
    assert.ok(v.tic.length > 10, `${id}: no verbal tic`);
    assert.ok(v.perspective.length > 10, `${id}: no floor-9 perspective`);
    const sig = getSignatureLines(id);
    assert.ok(sig.length >= 3 && sig.length <= 6, `${id}: ${sig.length} signature lines`);
    assert.ok(getHeroLines(id, 'battle').length >= 2, `${id}: needs battle lines`);
    assert.ok(getHeroLines(id, 'rescue').length >= 1, `${id}: needs a rescue line`);
    assert.ok(getHeroLines(id, 'idle').length >= 2, `${id}: needs idle banter`);
  }
});

test('voices: every signature line is unique across the whole roster', () => {
  const seen = new Map();
  for (const id of Object.keys(HERO_VOICES)) {
    for (const line of getSignatureLines(id)) {
      assert.ok(!seen.has(line), `duplicate line ${line} (${id} and ${seen.get(line)})`);
      seen.set(line, id);
    }
  }
});

test('voices: distinctive tics survive — Shadow trails off, Berserker shouts', () => {
  assert.ok(getSignatureLines('knight-shadow').every(l => l.includes('...')));
  const zerk = getSignatureLines('knight-berserker').join(' ');
  assert.match(zerk, /[A-Z]{4,}/);
  assert.ok(getSignatureLines('bunny-boulder').every(l => l.replace(/[^ ]/g, '').length <= 4),
    'Boulder should speak in very short sentences');
});

test('voices: pickHeroLine is deterministic with an index and wraps safely', () => {
  const lines = getHeroLines('bunny-nova', 'battle');
  assert.equal(pickHeroLine('bunny-nova', 'battle', 0), lines[0]);
  assert.equal(pickHeroLine('bunny-nova', 'battle', lines.length), lines[0]);
  assert.equal(pickHeroLine('bunny-nova', 'battle', -1), lines[lines.length - 1]);
  assert.equal(pickHeroLine('nobody', 'battle', 0), null);
  assert.equal(pickHeroLine('bunny-nova', 'nope', 0), null);
});

test('voices: getHeroLines returns copies', () => {
  const a = getHeroLines('bunny-pepper', 'idle');
  a.length = 0;
  assert.ok(getHeroLines('bunny-pepper', 'idle').length > 0);
});

test('voices: perspectives assemble in party order', () => {
  const party = ['knight-shadow', 'bunny-nova', 'nope'];
  const lines = getPerspectiveLines(party);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].speaker, 'Shadow');
  assert.equal(lines[1].speaker, 'Nova');
  assert.deepEqual(getPerspectiveLines(), []);
});

// ── bosses ───────────────────────────────────────────────────────

test('bosses: all nine have a theme, a pre-fight line and a defeat line', () => {
  assert.deepEqual(BOSS_ORDER, BOSS_IDS);
  for (const id of BOSS_IDS) {
    const v = getBossVoice(id);
    assert.ok(v, `${id} has no voice`);
    assert.ok(v.theme.length > 15, `${id}: no theme`);
    assert.ok(v.prefight.length > 15, `${id}: no pre-fight line`);
    assert.ok(v.defeat.length > 10, `${id}: no defeat line`);
    assert.ok(v.floor >= 1 && v.floor <= 9);
  }
  assert.equal(getBossVoice('nope'), null);
});

test('bosses: defeat lines turn, they do not gloat or humiliate', () => {
  for (const id of BOSS_IDS) {
    const d = getBossVoice(id).defeat.toLowerCase();
    assert.doesNotMatch(d, /\b(die|dead|destroyed|kill)\b/, `${id}: too grim for K-5`);
  }
  // the finale lands the whole thesis
  assert.match(getBossVoice('theorem').defeat, /COUNTED/);
});

test('bosses: getBossLine yields overlay-ready lines with the boss sprite', () => {
  const [line] = getBossLine('briarking', 'prefight');
  assert.equal(line.speaker, 'Briar King');
  assert.equal(line.sprite, 'briarking');
  assert.equal(line.side, 'right');
  assert.deepEqual(getBossLine('nope', 'prefight'), []);
  assert.deepEqual(getBossLine('briarking', 'nope'), []);
});

// ── party banter ─────────────────────────────────────────────────

test('banter: a healthy library exists and every id is unique', () => {
  assert.ok(BANTER_COUNT >= 90, `only ${BANTER_COUNT} banter entries`);
  assert.equal(PARTY_BANTER.length, SOLO_BANTER.length + PAIR_BANTER.length + COMP_BANTER.length);
  const ids = new Set();
  for (const e of PARTY_BANTER) {
    assert.ok(!ids.has(e.id), `duplicate banter id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.lines.length >= 1, `${e.id}: no lines`);
  }
});

test('banter: every requirement names a real hero and a real biome', () => {
  const heroIds = new Set(ALL_HEROES.map(h => h.id));
  const biomes = new Set([...Object.values(FLOOR_BIOME), 'any']);
  for (const e of PARTY_BANTER) {
    assert.ok(biomes.has(e.biome), `${e.id}: unknown biome ${e.biome}`);
    for (const id of e.requires || []) assert.ok(heroIds.has(id), `${e.id}: unknown hero ${id}`);
    for (const l of e.lines) {
      if (l.who) assert.ok(heroIds.has(l.who), `${e.id}: unknown speaker ${l.who}`);
      if (l.who && e.requires) assert.ok(e.requires.includes(l.who), `${e.id}: ${l.who} not required`);
      if (l.whoClass) assert.ok(e.classes?.[l.whoClass], `${e.id}: class ${l.whoClass} not required`);
    }
  }
});

test('banter: every biome has something to say for a plausible party', () => {
  const full = ALL_HEROES.map(h => h.id);
  for (const biome of Object.values(FLOOR_BIOME)) {
    const pool = availableBanter(full, biome);
    assert.ok(pool.length >= 8, `biome ${biome} only has ${pool.length} exchanges`);
  }
});

test('banter: every hero can speak in at least three exchanges', () => {
  const full = ALL_HEROES.map(h => h.id);
  for (const h of ALL_HEROES) {
    const n = PARTY_BANTER.filter(e => (e.requires || []).includes(h.id)).length;
    assert.ok(n >= 3, `${h.id} only appears in ${n} banter entries`);
  }
  // sanity: the full party in every biome can hear a lot
  assert.ok(availableBanter(full, 'mending').length >= 15);
});

test('banter: requirements gate correctly', () => {
  const entry = PARTY_BANTER.find(e => e.id === 'p_pepper_boulder');
  assert.ok(banterMatches(entry, ['bunny-pepper', 'bunny-boulder'], 'garden'));
  assert.ok(!banterMatches(entry, ['bunny-pepper'], 'garden'));
  const gardenOnly = PARTY_BANTER.find(e => e.id === 's_garden_pepper');
  assert.ok(banterMatches(gardenOnly, ['bunny-pepper'], 'garden'));
  assert.ok(!banterMatches(gardenOnly, ['bunny-pepper'], 'frost'));
});

test('banter: composition banter fires on party shape and finds a speaker', () => {
  const knights = ['knight-shadow', 'knight-crusader', 'knight-paladin'];
  const picked = availableBanter(knights, 'any').map(e => e.id);
  assert.ok(picked.includes('c_three_knights'));
  const entry = COMP_BANTER.find(e => e.id === 'c_three_knights');
  const lines = resolveBanter(entry, knights);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].speaker, 'Shadow');
  // and does NOT fire for a mixed party
  assert.ok(!availableBanter(['knight-shadow', 'bunny-nova', 'wizard-bookworm'], 'any')
    .map(e => e.id).includes('c_three_knights'));
});

test('banter: balanced-party banter resolves one speaker per class', () => {
  const mixed = ['knight-paladin', 'wizard-toadstool', 'bunny-boulder'];
  const entry = COMP_BANTER.find(e => e.id === 'c_balanced');
  assert.ok(banterMatches(entry, mixed, 'any'));
  const lines = resolveBanter(entry, mixed);
  assert.deepEqual(lines.map(l => l.speaker), ['Paladin', 'Boulder']);
});

test('banter: resolveBanter produces DialogueOverlay-shaped lines', () => {
  const entry = PARTY_BANTER.find(e => e.id === 'p_shadow_nova');
  const lines = resolveBanter(entry, ['knight-shadow', 'bunny-nova']);
  assert.equal(lines.length, 3);
  for (const l of lines) {
    assert.equal(typeof l.speaker, 'string');
    assert.equal(typeof l.text, 'string');
  }
  assert.equal(lines[0].speaker, 'Nova');
});

test('banter: pickBanter is deterministic by index and respects exclusions', () => {
  const party = ['bunny-pepper', 'bunny-boulder'];
  const a = pickBanter(party, 'garden', { index: 0 });
  const b = pickBanter(party, 'garden', { index: 0 });
  assert.deepEqual(a, b);
  const excluded = pickBanter(party, 'garden', { index: 0, exclude: [a.id] });
  assert.notEqual(excluded?.id, a.id);
  assert.equal(pickBanter([], 'garden'), null);
  assert.equal(pickBanter(null, 'nowhere'), null);
});

test('banter: pickBanter never repeats until the pool is exhausted', () => {
  const party = ALL_HEROES.map(h => h.id);
  const seen = new Set();
  let pick = pickBanter(party, 'sky', { index: 0, exclude: seen });
  let guard = 0;
  while (pick && guard++ < 500) {
    assert.ok(!seen.has(pick.id));
    seen.add(pick.id);
    pick = pickBanter(party, 'sky', { index: 0, exclude: seen });
  }
  assert.ok(seen.size >= 8);
});

test('banter: display names come from the live roster', () => {
  assert.equal(heroDisplayName('knight-greathelm'), 'Great Helm');
  assert.equal(heroDisplayName('mystery'), 'mystery');
});

// ── recap ────────────────────────────────────────────────────────

test('recap: works from a cold start and from mid-run', () => {
  const fresh = getRecap(0);
  assert.equal(fresh.length, 1);
  const mid = getRecap(4);
  assert.ok(mid.length >= 2);
  assert.match(mid[0].text, /The Anvil That Went Cold/);
  const end = getRecap(9);
  assert.equal(end.length, 2, 'no floor 10 to tease');
  for (const l of [...fresh, ...mid, ...end]) {
    assert.ok(l.text.length <= MAX_LINE_CHARS, `recap line too long: ${l.text}`);
  }
});

// ── presentation contract ────────────────────────────────────────

test('presentation: no line overflows the dialogue bubble', () => {
  const bad = everyLine().filter(l => l.text.length > MAX_LINE_CHARS);
  assert.deepEqual(bad.map(l => `${l.where}: (${l.text.length}) ${l.text}`), []);
});

test('presentation: nothing scary, nothing preachy', () => {
  const banned = /\b(kill|dead|blood|die|hate you|stupid|dumb)\b/i;
  for (const l of everyLine()) {
    assert.doesNotMatch(l.text, banned, `${l.where}: "${l.text}"`);
  }
});

test('presentation: no empty or whitespace-only text anywhere', () => {
  for (const l of everyLine()) assert.ok(l.text.trim().length > 0, l.where);
});

// ── dialogue.js integration ──────────────────────────────────────

test('dialogue: the story beats are published as DIALOGUE keys', () => {
  for (const f of FLOORS) {
    assert.deepEqual(DIALOGUE[`floor${f}_arrival`], getFloorBeat(f, 'arrival'));
    assert.deepEqual(DIALOGUE[`floor${f}_midpoint`], getFloorBeat(f, 'midpoint'));
    assert.deepEqual(DIALOGUE[`floor${f}_departure`], getFloorBeat(f, 'departure'));
    assert.ok(DIALOGUE[`floor${f}_boss_defeat`]?.length, `floor ${f} boss defeat missing`);
  }
});

test('dialogue: existing keys are untouched (extend, never break)', () => {
  const legacy = [
    'game_intro', 'world_map_intro', 'first_battle', 'hero_unlock',
    'mid_floor_encourage', 'phase2_start', 'game_ending', 'fairy_freed',
    'all_fairies_freed', 'floor1_entry', 'floor9_victory', 'floor9_boss',
    'floor1_boss_half', 'floor9_boss_quarter', 'floor5_defeat',
    'floor1_phase1_done', 'floor9_phase2_done',
  ];
  for (const k of legacy) {
    assert.ok(Array.isArray(DIALOGUE[k]) && DIALOGUE[k].length > 0, `lost dialogue key ${k}`);
  }
  assert.match(DIALOGUE.floor1_entry[0].text, /Welcome to the Garden/);
});
