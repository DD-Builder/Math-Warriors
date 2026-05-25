/**
 * Hint system — provides step-by-step hints when a player answers incorrectly.
 *
 * Each operator type gets a tailored decomposition strategy that matches
 * how kids are taught to break problems apart mentally.
 */

/**
 * Generate a hint string for a given math problem.
 *
 * @param {string} op - The operator: '+', '-', '*', '/'
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @param {number} answer - The correct answer
 * @returns {string} A step-by-step hint string
 */
export function getHint(op, a, b, answer) {
  if (op === '+') {
    // Addition: round down b to nearest 10 (or simplify) then add remainder
    const roundDown = b >= 10 ? Math.floor(b / 10) * 10 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) {
      return `Break it down: ${a} + ${b} = ${answer}`;
    }
    const partial = a + roundDown;
    return `Break it down: ${a} + ${roundDown} = ${partial}, then + ${remainder} = ${answer}`;
  }

  if (op === '-') {
    // Subtraction: round down b to nearest 5 (or simplify) then subtract remainder
    const roundDown = b >= 5 ? Math.floor(b / 5) * 5 : Math.floor(b / 2) * 2;
    const remainder = b - roundDown;
    if (roundDown === 0 || remainder === 0) {
      return `Count down: ${a} - ${b} = ${answer}`;
    }
    const partial = a - roundDown;
    return `Count down: ${a} - ${roundDown} = ${partial}, then - ${remainder} = ${answer}`;
  }

  if (op === '*') {
    // Multiplication: think of (b-1) groups then add one more
    if (b <= 1) {
      return `Think: ${a} × ${b} = ${answer}`;
    }
    const partial = a * (b - 1);
    return `Think: ${a} × ${b - 1} = ${partial}, plus one more ${a} = ${answer}`;
  }

  if (op === '/') {
    // Division: count up multiples of b until reaching a
    if (b === 0 || answer === 0) {
      return `How many ${b}s fit in ${a}? The answer is ${answer}`;
    }
    const multiples = [];
    for (let i = 1; i <= answer; i++) {
      multiples.push(b * i);
    }
    const countStr = multiples.join(', ');
    return `How many ${b}s fit in ${a}? Count: ${countStr} → ${answer} groups`;
  }

  // For frac/geo/money/word or any other operator type
  return 'Try working through the problem step by step!';
}
