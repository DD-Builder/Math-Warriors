/* ============================================================
   PGN header parsing + chess.com game normalization
   ============================================================ */

/** Parse PGN header tag pairs like [Key "Value"] from a PGN string. */
export function parsePgnHeaders(pgn) {
  const out = {};
  if (!pgn) return out;
  const re = /^\s*\[\s*(\w+)\s+"([^"]*)"\s*\]\s*$/gm;
  let m;
  while ((m = re.exec(pgn)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Human-readable opening name from a chess.com ECOUrl.
 * e.g. https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation
 *   -> "Sicilian Defense Najdorf Variation"
 */
export function openingNameFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (!last) return null;
    return decodeURIComponent(last).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

/** Family-level opening (first two words, cleaned of trailing punctuation). */
export function rootOpening(name) {
  if (!name) return 'Unknown';
  const cleaned = name.replace(/[:,;]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  if (words.length >= 2) return `${words[0]} ${words[1]}`;
  return words[0];
}

/** Win / loss / draw result codes produced by chess.com. */
const DRAW_CODES = new Set([
  'agreed', 'repetition', 'stalemate', 'insufficient',
  '50move', 'timevsinsufficient'
]);

/**
 * Normalize a chess.com game object into a clean record from user POV.
 * Returns null if the game can't be attributed to the user (mismatched username).
 */
export function normalizeGame(raw, user) {
  const userLc = (user || '').toLowerCase();
  const whiteName = raw?.white?.username || '';
  const blackName = raw?.black?.username || '';
  let color;
  if (whiteName.toLowerCase() === userLc) color = 'white';
  else if (blackName.toLowerCase() === userLc) color = 'black';
  else return null;

  const me  = raw[color];
  const opp = raw[color === 'white' ? 'black' : 'white'];

  const outcome = deriveOutcome(me.result, opp.result);
  const termination = deriveTermination(me.result, opp.result, outcome);

  const headers = parsePgnHeaders(raw.pgn || '');
  const eco = headers.ECO || null;
  const ecoUrl = headers.ECOUrl || null;
  const openingFromHeader = headers.Opening || null;
  const opening = openingFromHeader || openingNameFromUrl(ecoUrl) || 'Unknown';
  const openingRoot = rootOpening(opening);

  return {
    url: raw.url,
    endTime: raw.end_time,                 // unix seconds
    timeClass: raw.time_class,             // bullet | blitz | rapid | daily
    timeControl: raw.time_control,
    rated: !!raw.rated,
    rules: raw.rules || 'chess',
    color,
    myRating:  me.rating,
    oppRating: opp.rating,
    oppName: opp.username,
    outcome,                               // win | loss | draw
    termination,                           // e.g. resigned | checkmated | timeout | agreed ...
    eco, ecoUrl,
    opening, openingRoot,
    accuracy:    raw?.accuracies ? raw.accuracies[color] : null,
    oppAccuracy: raw?.accuracies ? raw.accuracies[color === 'white' ? 'black' : 'white'] : null,
    pgn: raw.pgn,
  };
}

function deriveOutcome(myResult, oppResult) {
  if (myResult === 'win') return 'win';
  if (oppResult === 'win') return 'loss';
  if (DRAW_CODES.has(myResult) || DRAW_CODES.has(oppResult)) return 'draw';
  // lose / abandoned / timeout etc. with no opposite 'win' — treat as loss
  return 'loss';
}

function deriveTermination(myResult, oppResult, outcome) {
  // The non-'win' side's code explains HOW the game ended.
  if (outcome === 'win')  return oppResult;
  if (outcome === 'loss') return myResult;
  return myResult;  // draws: either side carries the same draw code
}

/** Flatten an array of per-month responses into one sorted game list. */
export function flattenAll(monthsData, user) {
  const out = [];
  for (const month of monthsData) {
    const games = month?.games || [];
    for (const g of games) {
      const n = normalizeGame(g, user);
      if (n) out.push(n);
    }
  }
  out.sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
  return out;
}
