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

export function getHint(opOrQuestion, a, b, answer) {
  const q = normalize(opOrQuestion, a, b, answer);
  const special = specialHint(q);
  if (special) return special;
  return arithmeticHint(q.op, q.a, q.b, q.answer);
}

function arithmeticHint(op, a, b, answer) {
  if (op === '+') {
    const roundDown = b >= 10 ? Math.floor(b / 10) * 10 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) return `Break it down: ${a} + ${b} = ${answer}`;
    return `Break it down: ${a} + ${roundDown} = ${a + roundDown}, then + ${remainder} = ${answer}`;
  }
  if (op === '-') {
    const roundDown = b >= 5 ? Math.floor(b / 5) * 5 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) return `Count down: ${a} - ${b} = ${answer}`;
    return `Count down: ${a} - ${roundDown} = ${a - roundDown}, then - ${remainder} = ${answer}`;
  }
  if (op === '*') {
    if (b <= 1) return `Think: ${a} × ${b} = ${answer}`;
    return `Think: ${a} × ${b - 1} = ${a * (b - 1)}, plus one more ${a} = ${answer}`;
  }
  if (op === '/') {
    if (b === 0 || answer === 0) return `How many ${b}s fit in ${a}? The answer is ${answer}`;
    const multiples = [];
    for (let i = 1; i <= answer; i++) multiples.push(b * i);
    return `How many ${b}s fit in ${a}? Count: ${multiples.join(', ')} → ${answer} groups`;
  }
  return `Work through it one step at a time. The answer is ${answer}.`;
}

/** Worked hints for the special concepts. Returns null if not special. */
function specialHint(q) {
  const t = (q.text || '').toLowerCase();

  if (q.op === 'frac' || q.format === 'fraction') {
    if (t.includes('bigger') || t.includes('smaller') || t.includes('which')) {
      return `Same top number? Fewer, BIGGER pieces win — the smaller bottom number is the larger fraction. Answer: ${q.answer}`;
    }
    return `Adding fractions with the same bottom number: add the TOP numbers, keep the bottom the same. Answer: ${q.answer}`;
  }

  if (q.op === 'geo' || q.format === 'geometry') {
    if (t.includes('side')) return `Count the straight edges of the shape one by one, all the way around. Answer: ${q.answer}`;
    if (t.includes('area')) return `Area of a rectangle = length × width (rows × columns of squares). Answer: ${q.answer}`;
    if (t.includes('perimeter')) return `Perimeter = add up ALL the side lengths, going around the outside. Answer: ${q.answer}`;
    return `Look at the shape carefully and count what's asked. Answer: ${q.answer}`;
  }

  if (q.op === 'money' || q.format === 'money') {
    if (t.includes('change')) return `Change = what you PAID − the price. Subtract to find what comes back. Answer: ${q.answer}`;
    if (t.includes('how many')) return `Divide the total by the value of one coin to see how many fit. Answer: ${q.answer}`;
    return `Add up each cost, then subtract from what you paid. Answer: ${q.answer}`;
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
