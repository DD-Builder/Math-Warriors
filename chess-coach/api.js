/* ============================================================
   chess.com public API — fetch with JSONP fallback
   Serial access is unlimited; parallel is rate-limited.
   ============================================================ */

const BASE = 'https://api.chess.com/pub';

export function archivesUrl(user) {
  return `${BASE}/player/${encodeURIComponent(user.toLowerCase())}/games/archives`;
}

export function profileUrl(user) {
  return `${BASE}/player/${encodeURIComponent(user.toLowerCase())}`;
}

/**
 * Extract {yyyy, mm} from a month archive URL like
 * https://api.chess.com/pub/player/foo/games/2024/03
 */
export function parseArchiveUrl(url) {
  const m = url.match(/\/games\/(\d{4})\/(\d{2})(?:\/pgn)?$/);
  if (!m) return null;
  return { yyyy: m[1], mm: m[2] };
}

/** Is this archive URL the current (still-mutating) month? */
export function isCurrentMonth(url, now = new Date()) {
  const p = parseArchiveUrl(url);
  if (!p) return false;
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return p.yyyy === String(y) && p.mm === m;
}

/** fetch() with JSONP fallback for null-origin / blocked contexts. */
export async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.json();
  } catch (err) {
    // CORS failures appear as TypeError in Safari; fall through to JSONP.
    try {
      return await fetchJsonp(url);
    } catch (jsonpErr) {
      const msg = `${err?.message || err} (JSONP fallback: ${jsonpErr?.message || jsonpErr})`;
      throw new Error(msg);
    }
  }
}

function fetchJsonp(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const cb = 'ccjsonp_' + Math.random().toString(36).slice(2, 10);
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('JSONP timeout')); }
    }, timeoutMs);

    window[cb] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    script.onerror = () => {
      clearTimeout(timer);
      if (!done) { cleanup(); reject(new Error('JSONP script error')); }
    };
    document.head.appendChild(script);
  });
}
