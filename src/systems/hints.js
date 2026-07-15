/**
 * Hint system — worked, teach-y feedback when a child answers wrong.
 *
 * Every concept gets a real decomposition (Upgrade 3): the four
 * arithmetic operators plus fractions, geometry, and money. Word
 * problems already carry an arithmetic op, so they reuse those. The
 * goal is that a wrong answer TEACHES — never just "try again."
 *
 * getHint accepts either a full question object (preferred) or the
 * legacy positional (op, a, b, answer) form for backward compatibility.
 */

function normalize(opOrQuestion, a, b, answer) {
  if (opOrQuestion && typeof opOrQuestion === 'object') {
    const q = opOrQuestion;
    return { op: q.op, a: q.a, b: q.b, answer: q.answer, format: q.format, text: q.text || '' };
  }
  return { op: opOrQuestion, a, b, answer, format: null, text: '' };
}

// Placeholder that marks where the FINAL answer goes in a decomposition
// body. getHint fills it with the answer; getScaffold masks it as '?'.
// Everything else in the body (intermediate sums, multiples) stays put,
// so both share the exact same teaching steps.
const ANSWER_SLOT = '␞';

/**
 * The worked solution ending in the answer, e.g.
 *   "Break it down: 27 + 30 = 57, then + 5 = 60"
 */
export function getHint(opOrQuestion, a, b, answer) {
  const q = normalize(opOrQuestion, a, b, answer);
  const { body, answerText } = hintParts(q);
  return body.replace(ANSWER_SLOT, answerText);
}

/**
 * The SAME decomposition with the final answer masked as '?', e.g.
 *   "Break it down: 27 + 30 = 57, then + 5 = ?"
 * A scaffold shown BEFORE answering — it teaches the steps without
 * giving the result away. Tolerates review-queue questions (same shape).
 */
export function getScaffold(opOrQuestion, a, b, answer) {
  const q = normalize(opOrQuestion, a, b, answer);
  const { body } = hintParts(q);
  return body.replace(ANSWER_SLOT, '?');
}

// Build the decomposition once, as { body, answerText }, so getHint and
// getScaffold render the identical steps and differ only at the result.
function hintParts(q) {
  const special = specialParts(q);
  if (special) return special;
  return arithmeticParts(q.op, q.a, q.b, q.answer);
}

function arithmeticParts(op, a, b, answer) {
  const answerText = String(answer);
  if (op === '+') {
    const roundDown = b >= 10 ? Math.floor(b / 10) * 10 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) return { body: `Break it down: ${a} + ${b} = ${ANSWER_SLOT}`, answerText };
    return { body: `Break it down: ${a} + ${roundDown} = ${a + roundDown}, then + ${remainder} = ${ANSWER_SLOT}`, answerText };
  }
  if (op === '-') {
    const roundDown = b >= 5 ? Math.floor(b / 5) * 5 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) return { body: `Count down: ${a} - ${b} = ${ANSWER_SLOT}`, answerText };
    return { body: `Count down: ${a} - ${roundDown} = ${a - roundDown}, then - ${remainder} = ${ANSWER_SLOT}`, answerText };
  }
  if (op === '*') {
    if (b <= 1) return { body: `Think: ${a} × ${b} = ${ANSWER_SLOT}`, answerText };
    return { body: `Think: ${a} × ${b - 1} = ${a * (b - 1)}, plus one more ${a} = ${ANSWER_SLOT}`, answerText };
  }
  if (op === '/') {
    if (b === 0 || answer === 0) return { body: `How many ${b}s fit in ${a}? The answer is ${ANSWER_SLOT}`, answerText };
    const multiples = [];
    for (let i = 1; i <= answer; i++) multiples.push(b * i);
    return { body: `How many ${b}s fit in ${a}? Count: ${multiples.join(', ')} → ${ANSWER_SLOT} groups`, answerText };
  }
  return { body: `Work through it one step at a time. The answer is ${ANSWER_SLOT}.`, answerText };
}

/** Worked steps for the special concepts. Returns null if not special. */
function specialParts(q) {
  const t = (q.text || '').toLowerCase();
  const answerText = String(q.answer);

  if (q.op === 'frac' || q.format === 'fraction') {
    if (t.includes('bigger') || t.includes('smaller') || t.includes('which')) {
      return { body: `Same top number? Fewer, BIGGER pieces win — the smaller bottom number is the larger fraction. Answer: ${ANSWER_SLOT}`, answerText };
    }
    return { body: `Adding fractions with the same bottom number: add the TOP numbers, keep the bottom the same. Answer: ${ANSWER_SLOT}`, answerText };
  }

  if (q.op === 'geo' || q.format === 'geometry') {
    if (t.includes('side')) return { body: `Count the straight edges of the shape one by one, all the way around. Answer: ${ANSWER_SLOT}`, answerText };
    if (t.includes('area')) return { body: `Area of a rectangle = length × width (rows × columns of squares). Answer: ${ANSWER_SLOT}`, answerText };
    if (t.includes('perimeter')) return { body: `Perimeter = add up ALL the side lengths, going around the outside. Answer: ${ANSWER_SLOT}`, answerText };
    return { body: `Look at the shape carefully and count what's asked. Answer: ${ANSWER_SLOT}`, answerText };
  }

  if (q.op === 'money' || q.format === 'money') {
    if (t.includes('change')) return { body: `Change = what you PAID − the price. Subtract to find what comes back. Answer: ${ANSWER_SLOT}`, answerText };
    if (t.includes('how many')) return { body: `Divide the total by the value of one coin to see how many fit. Answer: ${ANSWER_SLOT}`, answerText };
    return { body: `Add up each cost, then subtract from what you paid. Answer: ${ANSWER_SLOT}`, answerText };
  }

  return null;
}

/**
 * A single short line shown right when a child answers wrong — names
 * the strategy without a full worked solution. Keep it under ~48 chars.
 */
export function getWhy(question) {
  const q = normalize(question);
  if (q.op === 'frac' || q.format === 'fraction') return 'Tip: compare the size of the pieces.';
  if (q.op === 'geo' || q.format === 'geometry') {
    const t = (q.text || '').toLowerCase();
    if (t.includes('area')) return 'Tip: area = length × width.';
    if (t.includes('perimeter')) return 'Tip: add up every side.';
    return 'Tip: count the edges one by one.';
  }
  if (q.op === 'money' || q.format === 'money') return 'Tip: line up the cents and subtract.';
  if (q.op === '+') return 'Tip: add the tens, then the ones.';
  if (q.op === '-') return 'Tip: count down in easy jumps.';
  if (q.op === '*') return 'Tip: skip-count in groups.';
  if (q.op === '/') return 'Tip: how many groups fit?';
  return 'Tip: take it one step at a time.';
}
