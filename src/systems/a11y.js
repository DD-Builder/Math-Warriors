/**
 * Accessibility helpers (Upgrade 10).
 *
 * The standout reach feature is TTS audio read-out of questions via the
 * Web Speech API — it lets pre-readers and dyslexic kids play
 * independently. Everything here degrades gracefully when speech isn't
 * available (SSR/tests/older browsers).
 */

const OP_WORDS = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' };

/** True when the browser can speak. */
export function isSpeechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** Turn a question object into a natural spoken sentence. */
export function questionToSpeech(q) {
  if (!q) return '';
  // Specials (fractions/geometry/money/word) carry a human prompt.
  if (q.text) return q.text.replace(/\s+/g, ' ').trim();
  const op = OP_WORDS[q.op];
  if (op && q.a != null && q.b != null) {
    if (q.format === 'missing') return `what ${op} ${q.b} equals ${q.fullAnswer ?? ''}`.trim();
    return `${q.a} ${op} ${q.b}. What is the answer?`;
  }
  return `The answer is ${q.answer}.`;
}

/** Speak a string, cancelling anything already in progress. */
export function speak(text, opts = {}) {
  if (!isSpeechAvailable() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.95;   // a touch slower for young learners
    u.pitch = opts.pitch ?? 1.05;
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech is a nicety — never break the game over it */ }
}

/** Stop any in-progress speech. */
export function cancelSpeech() {
  if (!isSpeechAvailable()) return;
  try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}

/** Read a battle question aloud, if the child has TTS turned on. */
export function speakQuestion(save, q) {
  if (save?.settings?.ttsEnabled) speak(questionToSpeech(q));
}

/** Whether motion should be reduced — honored across scenes. */
export function prefersReducedMotion(save) {
  return !!save?.settings?.reducedMotion;
}
