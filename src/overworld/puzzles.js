/**
 * puzzles — the five environmental puzzle state machines, as pure reducers.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────────
 * The 3D island can be walked, climbed, glided and swum, and until now the
 * only thing at the end of any of that was a coin. A coin is not a reason to
 * go somewhere; it is a receipt for having gone. What makes an open world a
 * TOYBOX is that the world itself asks you questions with its shape — light
 * these in the right order, stand on the plates that make eight, one of these
 * six statues is not like the others — and answers you with a click, a chime
 * and a door.
 *
 * Every puzzle in here is readable WITHOUT TEXT. That is the hard constraint
 * and it is why the vocabulary is so small: pips carved on a stone, a pan that
 * tilts, a beam that grows one mirror at a time. A five-year-old who cannot
 * read the word "ascending" can absolutely see that the brazier with two dots
 * lit before the brazier with five dots, and that the world was pleased.
 *
 * ── SHAPE OF THE CONTRACT ──────────────────────────────────────────────────
 * A puzzle is a SPEC (pure authored data, lives in discoverySpec.js) plus a
 * STATE (small plain JSON, lives in the runtime and can be dropped at any
 * time — puzzles deliberately do not persist mid-solve; only the SOLVED fact
 * does, in the discovery meter). The only way state moves is:
 *
 *     const { state, event } = stepPuzzle(spec, state, move);
 *
 * `stepPuzzle` never mutates its arguments and never allocates when the move
 * is a no-op, so the runtime can call it straight off a collision trigger.
 * Every returned event is one of EVENTS below, which is what the FX and audio
 * layers switch on — they never inspect state shape.
 *
 * ── THE KINDNESS RULES ─────────────────────────────────────────────────────
 * These are for ages 5-10 and awe is the target, never frustration:
 *
 *   - No puzzle can be put into an unwinnable state. Every reject is
 *     recoverable, and `reset` is always one move away.
 *   - `sum` and `balance` cannot be failed at all — you step off the plate,
 *     you lift the crate. Wrong is a position, not a verdict.
 *   - `order` and `mirror` do reset on a wrong input, because the reset IS the
 *     feedback (the lights go out together, which reads as "not that"), but
 *     they count resets so the FX layer can soften after the third one.
 *   - `hintFor()` always returns the next correct move. The compass only asks
 *     for it after the player has genuinely struggled (see NUDGE_AFTER), which
 *     is the difference between a nudge and hand-holding.
 *
 * Plain-Node importable: no three, no phaser, no DOM, no RNG.
 */

/** Every puzzle kind the world speaks. */
export const PUZZLE_KINDS = ['order', 'sum', 'oddOne', 'balance', 'mirror'];

/**
 * Events a step can emit. Presentation switches on these and nothing else.
 *
 *   accept  a correct input landed — light it, click it
 *   reject  a wrong input landed — the soft "no", plus a reset on order/mirror
 *   toggle  a reversible input flipped (a plate, a lifted crate). Not a verdict
 *   solve   the last correct input landed. The door, the chime, the reward
 *   reset   state returned to the start, by the player or by a reject
 *   noop    the move meant nothing here (unknown id, already-solved puzzle)
 */
export const EVENTS = {
  ACCEPT: 'accept',
  REJECT: 'reject',
  TOGGLE: 'toggle',
  SOLVE: 'solve',
  RESET: 'reset',
  NOOP: 'noop',
};

/**
 * How many wrong inputs (or reversible fumbles) a child gets before the world
 * is allowed to lean in and glow the next correct thing. Tuned high enough
 * that a player who is thinking is never interrupted, low enough that a player
 * who is stuck never has to leave.
 */
export const NUDGE_AFTER = 3;

// ── Spec construction & validation ─────────────────────────────────────────

/**
 * Normalise an authored puzzle spec. Authors write the interesting half; this
 * fills the mechanical half so every consumer can assume a full record.
 * Returns a NEW object; the input is never mutated.
 */
export function normalizePuzzle(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const kind = PUZZLE_KINDS.includes(s.kind) ? s.kind : 'sum';
  const out = { ...s, kind };
  if (kind === 'order') out.nodes = (s.nodes || []).map((n) => ({ ...n }));
  if (kind === 'sum') out.plates = (s.plates || []).map((p) => ({ ...p }));
  if (kind === 'oddOne') out.items = (s.items || []).map((i) => ({ ...i }));
  if (kind === 'balance') out.weights = (s.weights || []).map((w) => ({ ...w }));
  if (kind === 'mirror') {
    out.facings = s.facings || 4;
    out.mirrors = (s.mirrors || []).map((m) => ({ ...m }));
  }
  return out;
}

/**
 * Structural check, used by the spec test and by nothing at runtime.
 * @returns {string[]} problems, empty when the spec is sound
 */
export function validatePuzzle(spec) {
  const problems = [];
  const s = normalizePuzzle(spec);
  if (!PUZZLE_KINDS.includes(spec?.kind)) problems.push(`unknown kind ${spec?.kind}`);

  const ids = (s.nodes || s.plates || s.items || s.weights || s.mirrors || []).map((e) => e.id);
  if (ids.length < 2) problems.push('a puzzle needs at least two pieces');
  if (new Set(ids).size !== ids.length) problems.push('duplicate piece id');
  for (const id of ids) if (typeof id !== 'string' || !id) problems.push('piece with no id');

  if (s.kind === 'order') {
    const vals = s.nodes.map((n) => n.value);
    if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) problems.push('order node without a numeric value');
    if (new Set(vals).size !== vals.length) problems.push('order values must be distinct — ties make the order unreadable');
  }
  if (s.kind === 'sum') {
    if (typeof s.target !== 'number' || s.target <= 0) problems.push('sum needs a positive target');
    const vals = s.plates.map((p) => p.value);
    if (vals.some((v) => typeof v !== 'number' || v <= 0)) problems.push('sum plates need positive values');
    // Same BigInt guard as `balance` below: only ask subsetReaches about whole
    // positive numbers, or the authoring check throws instead of reporting.
    if (Number.isInteger(s.target) && s.target > 0 && vals.every((v) => Number.isInteger(v) && v > 0)) {
      if (!subsetReaches(vals, s.target)) problems.push(`sum target ${s.target} is unreachable from the plates`);
    }
  }
  if (s.kind === 'oddOne') {
    if (!s.items.some((i) => i.id === s.oddId)) problems.push('oddOne has no odd item');
    const traits = s.items.filter((i) => i.id !== s.oddId).map((i) => i.trait);
    if (new Set(traits).size !== 1) problems.push('oddOne decoys must all share one trait');
    const odd = s.items.find((i) => i.id === s.oddId);
    if (odd && traits.includes(odd.trait)) problems.push('the odd item shares the decoy trait');
  }
  if (s.kind === 'balance') {
    const vals = s.weights.map((w) => w.value);
    if (vals.some((v) => typeof v !== 'number' || v <= 0)) problems.push('balance weights must be positive');
    const total = vals.reduce((a, b) => a + b, 0);
    const halvable = total % 2 === 0;
    if (!halvable) problems.push('balance total is odd — the pans can never level');
    // Only ask the subset solver a question it can answer. subsetReaches works
    // in BigInt shifts, so a half-integer target (odd total) or a fractional
    // weight makes it THROW — and an authoring guard that crashes on bad data
    // instead of reporting it is worse than no guard at all.
    if (halvable && vals.every((v) => Number.isInteger(v) && v > 0)) {
      if (!subsetReaches(vals, total / 2)) problems.push('balance cannot be split into two equal pans');
    }
  }
  if (s.kind === 'mirror') {
    for (const m of s.mirrors) {
      if (!Number.isInteger(m.solution) || m.solution < 0 || m.solution >= s.facings) {
        problems.push(`mirror ${m.id} solution outside 0..${s.facings - 1}`);
      }
      const start = m.start ?? 0;
      if (!Number.isInteger(start) || start < 0 || start >= s.facings) problems.push(`mirror ${m.id} start outside 0..${s.facings - 1}`);
      if (start === m.solution) problems.push(`mirror ${m.id} starts already solved`);
    }
  }
  return problems;
}

/**
 * A subset of `items` summing to exactly `target`, chosen to AGREE as much as
 * possible with where the pieces already are.
 *
 * `inSet` are ids currently in the subset's position (pressed plates, crates in
 * the left pan); `outSet` are ids currently in the complement's position
 * (crates in the right pan). A piece that is in neither — an unpressed plate, a
 * crate still on the ground — agrees with nothing and will always be asked to
 * move, which is correct.
 *
 * Scoring agreement over BOTH sides is what makes the hint sequence terminate.
 * Each hint moves one disagreeing piece into agreement, so the best achievable
 * agreement rises by at least one every step and is bounded by the piece count;
 * scoring only one side lets the chosen subset flip between two equally good
 * partitions and the player is sent back and forth forever.
 *
 * Exhaustive over subsets, which is correct and instant at authored sizes: the
 * largest puzzle here has six pieces, so 64 combinations.
 *
 * @returns {?Set<string>} ids in the subset, or null when target is unreachable
 */
function bestSubset(items, target, inSet = [], outSet = []) {
  const inS = inSet instanceof Set ? inSet : new Set(inSet);
  const outS = outSet instanceof Set ? outSet : new Set(outSet);
  const n = items.length;
  if (n > 20) return null; // guard: this is not a solver for arbitrary data
  let best = null;
  let bestScore = -Infinity;
  for (let mask = 0; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += items[i].value;
    if (sum !== target) continue;
    let agree = 0;
    let size = 0;
    for (let i = 0; i < n; i++) {
      const id = items[i].id;
      if (mask & (1 << i)) { size++; if (inS.has(id)) agree++; }
      else if (outS.has(id)) agree++;
    }
    // Agreement dominates; a short route is only the tie-break, because fewer
    // stones to run between is kinder but never worth undoing correct work.
    const score = agree * 100 - size;
    if (score > bestScore) { bestScore = score; best = mask; }
  }
  if (best === null) return null;
  const out = new Set();
  for (let i = 0; i < n; i++) if (best & (1 << i)) out.add(items[i].id);
  return out;
}

/** Subset-sum over small positive integer sets. Authoring guard, not hot. */
function subsetReaches(values, target) {
  let reach = 1n; // bitset: bit k set means "k is reachable"
  for (const v of values) reach |= reach << BigInt(v);
  return ((reach >> BigInt(target)) & 1n) === 1n;
}

// ── State ──────────────────────────────────────────────────────────────────

/**
 * A fresh state for `spec`. Small, plain JSON, safe to throw away — the world
 * remembers that a puzzle was SOLVED (discovery meter), never how far into it
 * you were, because a half-solved brazier row that survives a save reload is
 * a puzzle a child cannot re-experience.
 */
export function initPuzzle(spec) {
  const s = normalizePuzzle(spec);
  switch (s.kind) {
    case 'order':
      return { kind: 'order', lit: [], resets: 0, wrongs: 0, solved: false };
    case 'sum':
      return { kind: 'sum', on: [], sum: 0, resets: 0, wrongs: 0, solved: false };
    case 'oddOne':
      return { kind: 'oddOne', tried: [], resets: 0, wrongs: 0, solved: false };
    case 'balance':
      return { kind: 'balance', left: [], right: [], resets: 0, wrongs: 0, solved: false };
    case 'mirror':
      return { kind: 'mirror', facings: s.mirrors.map((m) => m.start ?? 0), resets: 0, wrongs: 0, solved: false };
    default:
      return { kind: s.kind, resets: 0, wrongs: 0, solved: false };
  }
}

/** True when this state is the finished state for its spec. */
export function isSolved(spec, state) {
  return !!(state && state.solved);
}

/**
 * How far in the player is, for a progress ring that never lies.
 * @returns {{done:number, total:number, pct:number}}
 */
export function puzzleProgress(spec, state) {
  const s = normalizePuzzle(spec);
  let done = 0;
  let total = 1;
  switch (s.kind) {
    case 'order':
      total = s.nodes.length;
      done = state?.lit?.length || 0;
      break;
    case 'sum':
      total = s.target;
      done = Math.min(state?.sum || 0, s.target);
      break;
    case 'oddOne':
      total = 1;
      done = state?.solved ? 1 : 0;
      break;
    case 'balance': {
      total = s.weights.length;
      done = (state?.left?.length || 0) + (state?.right?.length || 0);
      break;
    }
    case 'mirror':
      total = s.mirrors.length;
      done = beamReach(s, state);
      break;
    default:
      done = state?.solved ? 1 : 0;
  }
  if (total <= 0) total = 1;
  return { done, total, pct: Math.max(0, Math.min(1, done / total)) };
}

/**
 * How many mirrors the beam currently reaches — the PREFIX of correctly
 * facing mirrors from the source. This is why a mirror puzzle feels alive:
 * turning the first one right makes the beam visibly jump one stone forward,
 * and turning it wrong pulls the whole beam back to the source.
 */
export function beamReach(spec, state) {
  const s = normalizePuzzle(spec);
  const f = state?.facings || [];
  let n = 0;
  for (let i = 0; i < s.mirrors.length; i++) {
    if (f[i] === s.mirrors[i].solution) n++;
    else break;
  }
  return n;
}

/** Pan totals and the tilt (-1 left-heavy .. +1 right-heavy) for the balance. */
export function balanceReading(spec, state) {
  const s = normalizePuzzle(spec);
  const val = (id) => s.weights.find((w) => w.id === id)?.value || 0;
  const left = (state?.left || []).reduce((a, id) => a + val(id), 0);
  const right = (state?.right || []).reduce((a, id) => a + val(id), 0);
  const span = left + right;
  const placed = (state?.left?.length || 0) + (state?.right?.length || 0);
  return {
    left, right, placed, total: s.weights.length,
    tilt: span > 0 ? (right - left) / span : 0,
    level: left === right && placed === s.weights.length,
  };
}

/** The plate ids currently pressed and the running sum. */
export function sumReading(spec, state) {
  const s = normalizePuzzle(spec);
  const sum = state?.sum || 0;
  return { sum, target: s.target, over: sum > s.target, exact: sum === s.target };
}

// ── The reducer ────────────────────────────────────────────────────────────

/**
 * Apply one move. Pure: returns `{ state, event }` where `state` is the SAME
 * object reference when nothing changed (so the caller can cheaply skip
 * re-rendering) and a new object otherwise.
 *
 * Moves by kind:
 *   order   { type:'activate', id }
 *   sum     { type:'toggle', id } | { type:'press', id } | { type:'release', id }
 *   oddOne  { type:'pick', id }
 *   balance { type:'place', id, pan:'left'|'right' } | { type:'lift', id }
 *   mirror  { type:'rotate', id, dir?: +1|-1 }
 *   any     { type:'reset' }
 */
export function stepPuzzle(spec, state, move) {
  const s = normalizePuzzle(spec);
  if (!state || !move || typeof move.type !== 'string') return { state, event: EVENTS.NOOP };
  if (move.type === 'reset') {
    const fresh = initPuzzle(s);
    fresh.resets = (state.resets || 0) + 1;
    fresh.wrongs = state.wrongs || 0;
    return { state: fresh, event: EVENTS.RESET };
  }
  if (state.solved) return { state, event: EVENTS.NOOP };

  switch (s.kind) {
    case 'order': return stepOrder(s, state, move);
    case 'sum': return stepSum(s, state, move);
    case 'oddOne': return stepOddOne(s, state, move);
    case 'balance': return stepBalance(s, state, move);
    case 'mirror': return stepMirror(s, state, move);
    default: return { state, event: EVENTS.NOOP };
  }
}

function stepOrder(s, state, move) {
  if (move.type !== 'activate') return { state, event: EVENTS.NOOP };
  const node = s.nodes.find((n) => n.id === move.id);
  if (!node) return { state, event: EVENTS.NOOP };
  if (state.lit.includes(node.id)) return { state, event: EVENTS.NOOP };

  // The next node the sequence wants: the smallest value not yet lit.
  const remaining = s.nodes.filter((n) => !state.lit.includes(n.id));
  const want = remaining.reduce((a, b) => (b.value < a.value ? b : a));
  if (node.id !== want.id) {
    // Wrong stone. Everything goes out together — that IS the feedback, and
    // it is the only thing in here that resets, because a partially lit row
    // with a mistake buried in it is unreadable to a child.
    return {
      state: { ...state, lit: [], wrongs: (state.wrongs || 0) + 1, resets: (state.resets || 0) + 1 },
      event: EVENTS.REJECT,
    };
  }
  const lit = [...state.lit, node.id];
  const solved = lit.length === s.nodes.length;
  return { state: { ...state, lit, solved }, event: solved ? EVENTS.SOLVE : EVENTS.ACCEPT };
}

function stepSum(s, state, move) {
  const plate = s.plates.find((p) => p.id === move.id);
  if (!plate) return { state, event: EVENTS.NOOP };
  const isOn = state.on.includes(plate.id);
  let on;
  if (move.type === 'press') { if (isOn) return { state, event: EVENTS.NOOP }; on = [...state.on, plate.id]; }
  else if (move.type === 'release') { if (!isOn) return { state, event: EVENTS.NOOP }; on = state.on.filter((id) => id !== plate.id); }
  else if (move.type === 'toggle') { on = isOn ? state.on.filter((id) => id !== plate.id) : [...state.on, plate.id]; }
  else return { state, event: EVENTS.NOOP };

  const sum = on.reduce((a, id) => a + (s.plates.find((p) => p.id === id)?.value || 0), 0);
  const solved = sum === s.target;
  // Standing on too many plates is not a failure — it is a reading. `wrongs`
  // only ticks when the player has gone PAST the target, which is the moment
  // a nudge would actually help.
  const wrongs = (state.wrongs || 0) + (!solved && sum > s.target && sum !== state.sum ? 1 : 0);
  return { state: { ...state, on, sum, wrongs, solved }, event: solved ? EVENTS.SOLVE : EVENTS.TOGGLE };
}

function stepOddOne(s, state, move) {
  if (move.type !== 'pick') return { state, event: EVENTS.NOOP };
  const item = s.items.find((i) => i.id === move.id);
  if (!item) return { state, event: EVENTS.NOOP };
  if (item.id === s.oddId) {
    return { state: { ...state, solved: true }, event: EVENTS.SOLVE };
  }
  if (state.tried.includes(item.id)) return { state, event: EVENTS.NOOP };
  // Wrong statue stays marked so the child can see what they have ruled out.
  // Nothing resets: elimination IS the puzzle.
  return {
    state: { ...state, tried: [...state.tried, item.id], wrongs: (state.wrongs || 0) + 1 },
    event: EVENTS.REJECT,
  };
}

function stepBalance(s, state, move) {
  const w = s.weights.find((x) => x.id === move.id);
  if (!w) return { state, event: EVENTS.NOOP };
  const inLeft = state.left.includes(w.id);
  const inRight = state.right.includes(w.id);

  if (move.type === 'lift') {
    if (!inLeft && !inRight) return { state, event: EVENTS.NOOP };
    return {
      state: { ...state, left: state.left.filter((id) => id !== w.id), right: state.right.filter((id) => id !== w.id) },
      event: EVENTS.TOGGLE,
    };
  }
  if (move.type !== 'place') return { state, event: EVENTS.NOOP };
  const pan = move.pan === 'right' ? 'right' : 'left';
  if ((pan === 'left' && inLeft) || (pan === 'right' && inRight)) return { state, event: EVENTS.NOOP };

  const left = pan === 'left'
    ? [...state.left.filter((id) => id !== w.id), w.id]
    : state.left.filter((id) => id !== w.id);
  const right = pan === 'right'
    ? [...state.right.filter((id) => id !== w.id), w.id]
    : state.right.filter((id) => id !== w.id);

  const next = { ...state, left, right };
  const reading = balanceReading(s, next);
  if (reading.level) return { state: { ...next, solved: true }, event: EVENTS.SOLVE };
  // A full-but-unlevel scale is the one balance state worth counting as a
  // fumble: everything is placed and it still is not even.
  const full = reading.placed === s.weights.length;
  if (full) next.wrongs = (state.wrongs || 0) + 1;
  return { state: next, event: EVENTS.TOGGLE };
}

function stepMirror(s, state, move) {
  if (move.type !== 'rotate') return { state, event: EVENTS.NOOP };
  const idx = s.mirrors.findIndex((m) => m.id === move.id);
  if (idx < 0) return { state, event: EVENTS.NOOP };
  const dir = move.dir === -1 ? -1 : 1;
  const facings = state.facings.slice();
  facings[idx] = (facings[idx] + dir + s.facings) % s.facings;

  const next = { ...state, facings };
  const reach = beamReach(s, next);
  const solved = reach === s.mirrors.length;
  if (solved) return { state: { ...next, solved: true }, event: EVENTS.SOLVE };

  // Turning a mirror the beam already passes through breaks the chain behind
  // it. That is not punished — the beam simply shortens, visibly — but it does
  // count, so a child spinning at random gets offered a hand eventually.
  const before = beamReach(s, state);
  const event = reach > before ? EVENTS.ACCEPT : reach < before ? EVENTS.REJECT : EVENTS.TOGGLE;
  if (event !== EVENTS.ACCEPT) next.wrongs = (state.wrongs || 0) + 1;
  return { state: next, event };
}

// ── The nudge ──────────────────────────────────────────────────────────────

/**
 * The next correct move, or null when solved. Never lies and never solves the
 * puzzle for the player — it names ONE piece.
 *
 * @returns {null | {id:string, move:object, why:string}}
 */
export function hintFor(spec, state) {
  const s = normalizePuzzle(spec);
  if (!state || state.solved) return null;
  switch (s.kind) {
    case 'order': {
      const remaining = s.nodes.filter((n) => !state.lit.includes(n.id));
      if (!remaining.length) return null;
      const want = remaining.reduce((a, b) => (b.value < a.value ? b : a));
      return { id: want.id, move: { type: 'activate', id: want.id }, why: 'lowest-unlit' };
    }
    case 'sum': {
      if (state.sum === s.target) return null;
      // Aim at a REAL solution rather than greedily grabbing the biggest plate
      // that fits. Greedy livelocks: with plates 1,3,5,6 and a target of 8 it
      // presses 6, presses 1, releases 6, presses 6 ... forever, and a child
      // following the glow never gets there. `bestSubset` picks an actual
      // subset that sums to the target and overlaps what is already pressed as
      // much as possible, so every hint strictly reduces the number of plates
      // in the wrong position and the sequence always terminates.
      const off = s.plates.filter((p) => !state.on.includes(p.id)).map((p) => p.id);
      const goal = bestSubset(s.plates, s.target, state.on, off);
      if (!goal) return null;
      // Step OFF wrong plates first: it is the move that can never overshoot,
      // and standing on a plate you must leave is the commonest way to be stuck.
      for (const id of state.on) {
        if (!goal.has(id)) return { id, move: { type: 'release', id }, why: 'step-off' };
      }
      for (const p of s.plates) {
        if (goal.has(p.id) && !state.on.includes(p.id)) {
          return { id: p.id, move: { type: 'press', id: p.id }, why: 'step-on' };
        }
      }
      return null;
    }
    case 'oddOne':
      return { id: s.oddId, move: { type: 'pick', id: s.oddId }, why: 'the-odd-one' };
    case 'balance': {
      const total = s.weights.reduce((a, w) => a + w.value, 0);
      if (total % 2 !== 0) return null;
      // Aim at a REAL partition, for the same reason `sum` does. Filling the
      // lighter pan with the biggest crate that fits is greedy and livelocks:
      // with crates 2,3,4,5,6 it loads to 9 v 9 with the 2 left over, then
      // lifts it, then loads it again, forever. `bestSubset` names one pan's
      // exact contents up front and every hint moves one crate to the side it
      // finally belongs on, so the number of misplaced crates strictly falls.
      const goal = bestSubset(s.weights, total / 2, state.left, state.right);
      if (!goal) return null;
      for (const w of s.weights) {
        const wantLeft = goal.has(w.id);
        const onLeft = state.left.includes(w.id);
        const onRight = state.right.includes(w.id);
        if (wantLeft && !onLeft) {
          return { id: w.id, move: { type: 'place', id: w.id, pan: 'left' }, why: 'belongs-left' };
        }
        if (!wantLeft && !onRight) {
          return { id: w.id, move: { type: 'place', id: w.id, pan: 'right' }, why: 'belongs-right' };
        }
      }
      return null;
    }
    case 'mirror': {
      const i = beamReach(s, state);
      if (i >= s.mirrors.length) return null;
      const m = s.mirrors[i];
      const cur = state.facings[i];
      // Shortest way round the dial, so the hint arrow always points the
      // cheapest direction rather than the "correct" one.
      const fwd = (m.solution - cur + s.facings) % s.facings;
      const dir = fwd <= s.facings - fwd ? 1 : -1;
      return { id: m.id, move: { type: 'rotate', id: m.id, dir }, why: 'next-mirror' };
    }
    default:
      return null;
  }
}

/**
 * Should the world lean in yet? True once the player has fumbled enough that
 * a glow on one piece is a kindness rather than an interruption.
 */
export function shouldNudge(state, after = NUDGE_AFTER) {
  return !!state && !state.solved && (state.wrongs || 0) >= after;
}

/**
 * How many maths locks a shrine's trial has earned. Solving the physical half
 * is what BUYS the questions — the trial's difficulty is converted directly
 * into how much maths the shrine asks for, so the two halves are one design
 * rather than a puzzle with a quiz stapled to it.
 */
export function trialTokens(spec, state) {
  const s = normalizePuzzle(spec);
  if (!state?.solved) return 0;
  const size = (s.nodes || s.plates || s.items || s.weights || s.mirrors || []).length;
  const base = size >= 6 ? 3 : size >= 4 ? 2 : 1;
  // A clean solve is worth one more question — and one more reward tier. This
  // is the only place skill changes the economy, and it can only ever ADD.
  return (state.resets || 0) === 0 && (state.wrongs || 0) === 0 ? base + 1 : base;
}
