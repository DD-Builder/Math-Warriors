/* ============================================================
   Chess Chronicle — app entry
   Orchestrates fetch → normalize → analyze → render.
   ============================================================ */

import { archivesUrl, fetchJson, parseArchiveUrl, isCurrentMonth } from './api.js';
import { flattenAll } from './parse.js';
import { analyze } from './analyze.js';
import {
  renderPullQuote, renderOverview, renderRating, renderActivity,
  renderColor, renderTimeClass, renderOpenings, renderTerminations,
  showError, clearError, showProgress, hideProgress, $,
} from './render.js';

const CACHE_PREFIX = 'cc:v1';
const LAST_USER_KEY = 'cc:lastUser';

const state = {
  user: null,
  games: [],
  analysis: null,
};

/* ------------ cache helpers (localStorage for v1; IndexedDB in step 2) ------------ */

const cache = {
  key: (user, yyyy, mm) => `${CACHE_PREFIX}:${user.toLowerCase()}:${yyyy}-${mm}`,
  read(user, yyyy, mm) {
    try {
      const raw = localStorage.getItem(this.key(user, yyyy, mm));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  write(user, yyyy, mm, data) {
    try { localStorage.setItem(this.key(user, yyyy, mm), JSON.stringify(data)); }
    catch (e) { /* quota: silently skip for v1 */ }
  },
  clearUser(user) {
    const prefix = `${CACHE_PREFIX}:${user.toLowerCase()}:`;
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) kill.push(k);
    }
    for (const k of kill) localStorage.removeItem(k);
  },
};

/* ------------ main pipeline ------------ */

async function runFetch(user) {
  clearError();
  state.user = user;
  state.games = [];
  state.analysis = null;
  $('#results').hidden = true;
  showProgress('Fetching archive list…', 2);

  let archiveList;
  try {
    archiveList = await fetchJson(archivesUrl(user));
  } catch (err) {
    hideProgress();
    showError(`Couldn't reach chess.com. ${err.message}`);
    return;
  }
  const urls = archiveList?.archives || [];
  if (!urls.length) {
    hideProgress();
    showError(`No archives found for "${user}". Check the username.`);
    return;
  }

  const months = [];
  const total = urls.length;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const parsed = parseArchiveUrl(url);
    if (!parsed) continue;
    const { yyyy, mm } = parsed;
    const current = isCurrentMonth(url);
    let data = current ? null : cache.read(user, yyyy, mm);
    if (!data) {
      try {
        data = await fetchJson(url);
        cache.write(user, yyyy, mm, data);
      } catch (err) {
        showError(`Skipped ${yyyy}-${mm}: ${err.message}`);
        continue;
      }
    }
    months.push(data);
    const pct = 2 + ((i + 1) / total) * 96;
    showProgress(`Fetching ${yyyy}-${mm} (${i + 1}/${total})`, pct);
  }

  const games = flattenAll(months, user);
  state.games = games;
  state.analysis = analyze(games);

  localStorage.setItem(LAST_USER_KEY, user);
  renderAll();
  hideProgress();
  $('#results').hidden = false;
}

function renderAll() {
  const a = state.analysis;
  if (!a) return;
  renderPullQuote(a.overview);
  renderOverview(a.overview);
  renderRating(a.ratingSeries);
  renderActivity(a.activity);
  renderColor(a.byColor);
  renderTimeClass(a.byTimeClass);
  renderOpenings(a.openings);
  renderTerminations(a.byTermination, a.overview.total);
}

/* ------------ exports ------------ */

function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportCombinedPgn() {
  if (!state.games.length) return;
  const out = state.games.map(g => g.pgn || '').filter(Boolean).join('\n\n');
  download(`${state.user}-games.pgn`, out, 'application/x-chess-pgn');
}

function exportJson() {
  if (!state.analysis) return;
  const payload = {
    user: state.user,
    generated: new Date().toISOString(),
    overview: state.analysis.overview,
    byColor: state.analysis.byColor,
    byTimeClass: state.analysis.byTimeClass,
    byTermination: state.analysis.byTermination,
    openings: state.analysis.openings,
    activity: state.analysis.activity,
  };
  download(`${state.user}-chronicle.json`, JSON.stringify(payload, null, 2), 'application/json');
}

/* ------------ wire up ------------ */

document.addEventListener('DOMContentLoaded', () => {
  const input = $('#username');
  const lastUser = localStorage.getItem(LAST_USER_KEY);
  if (lastUser) input.value = lastUser;

  $('#fetchBtn').addEventListener('click', () => {
    const u = (input.value || '').trim();
    if (!u) { showError('Enter a chess.com username.'); return; }
    runFetch(u).catch(err => {
      hideProgress();
      showError(`Unexpected: ${err.message || err}`);
    });
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#fetchBtn').click();
  });

  $('#clearBtn').addEventListener('click', () => {
    const u = (input.value || '').trim();
    if (!u) return;
    cache.clearUser(u);
    showError(`Cache cleared for ${u}.`);
  });

  $('#exportPgn').addEventListener('click', exportCombinedPgn);
  $('#exportJson').addEventListener('click', exportJson);
});
