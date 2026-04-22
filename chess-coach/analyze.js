/* ============================================================
   Derive all stats from normalized game records.
   Input: flat array of normalized games (sorted ascending by endTime).
   ============================================================ */

export function analyze(games) {
  return {
    overview:     overview(games),
    byColor:      wdlBy(games, g => g.color),
    byTimeClass:  wdlBy(games, g => g.timeClass),
    byTermination: tallyTermination(games),
    openings:     topOpenings(games, 15),
    ratingSeries: ratingSeries(games),
    activity:     monthlyActivity(games),
  };
}

/* ------------ overview ------------ */

function overview(games) {
  let wins = 0, losses = 0, draws = 0;
  let currentRating = null, peakRating = null;
  let lastEnd = 0;
  for (const g of games) {
    if (g.outcome === 'win')  wins++;
    if (g.outcome === 'loss') losses++;
    if (g.outcome === 'draw') draws++;
    if (g.rated && g.myRating) {
      if (!peakRating || g.myRating > peakRating) peakRating = g.myRating;
      if ((g.endTime || 0) >= lastEnd) {
        lastEnd = g.endTime || 0;
        currentRating = g.myRating;
      }
    }
  }
  const total = games.length;
  return {
    total, wins, losses, draws,
    winPct:  total ? wins  / total : 0,
    lossPct: total ? losses / total : 0,
    drawPct: total ? draws / total : 0,
    currentRating, peakRating,
    firstGame: games[0]?.endTime || null,
    lastGame:  games[games.length - 1]?.endTime || null,
  };
}

/* ------------ W/D/L split by a key ------------ */

function wdlBy(games, keyFn) {
  const map = new Map();
  for (const g of games) {
    const k = keyFn(g) || 'unknown';
    let row = map.get(k);
    if (!row) { row = { key: k, total: 0, w: 0, d: 0, l: 0 }; map.set(k, row); }
    row.total++;
    if (g.outcome === 'win')  row.w++;
    if (g.outcome === 'draw') row.d++;
    if (g.outcome === 'loss') row.l++;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/* ------------ terminations ------------ */

function tallyTermination(games) {
  const counts = new Map();
  for (const g of games) {
    const k = g.termination || 'unknown';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([termination, count]) => ({ termination, count }))
    .sort((a, b) => b.count - a.count);
}

/* ------------ openings ------------ */

function topOpenings(games, limit = 15) {
  const map = new Map();
  for (const g of games) {
    const k = g.openingRoot || 'Unknown';
    let row = map.get(k);
    if (!row) {
      row = { opening: k, total: 0, w: 0, d: 0, l: 0, asWhite: 0, asBlack: 0 };
      map.set(k, row);
    }
    row.total++;
    if (g.outcome === 'win')  row.w++;
    if (g.outcome === 'draw') row.d++;
    if (g.outcome === 'loss') row.l++;
    if (g.color === 'white')  row.asWhite++;
    else                      row.asBlack++;
  }
  const rows = [...map.values()]
    .map(r => ({
      ...r,
      winPct: r.total ? r.w / r.total : 0,
      whitePct: r.total ? r.asWhite / r.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
  return rows.slice(0, limit);
}

/* ------------ rating series, one per time class ------------ */

function ratingSeries(games) {
  const series = {};
  for (const g of games) {
    if (!g.rated || !g.myRating || !g.endTime) continue;
    const tc = g.timeClass || 'other';
    if (!series[tc]) series[tc] = [];
    series[tc].push({ t: g.endTime, r: g.myRating, outcome: g.outcome });
  }
  return series;
}

/* ------------ monthly activity ------------ */

function monthlyActivity(games) {
  const map = new Map();   // key = "YYYY-MM"
  for (const g of games) {
    if (!g.endTime) continue;
    const d = new Date(g.endTime * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let row = map.get(key);
    if (!row) { row = { month: key, total: 0, w: 0, d: 0, l: 0 }; map.set(key, row); }
    row.total++;
    if (g.outcome === 'win')  row.w++;
    if (g.outcome === 'draw') row.d++;
    if (g.outcome === 'loss') row.l++;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/* ------------ formatters (exported for render.js) ------------ */

export const fmt = {
  int:   n => (n ?? 0).toLocaleString('en-US'),
  pct:   x => `${((x || 0) * 100).toFixed(1)}%`,
  pct0:  x => `${Math.round((x || 0) * 100)}%`,
  date:  ts => ts ? new Date(ts * 1000).toLocaleDateString(undefined,
                    { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
  month: ym => {
    if (!ym) return '—';
    const [y, m] = ym.split('-');
    const d = new Date(+y, +m - 1, 1);
    return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' });
  },
};

/** Title-case a termination code like "checkmated" -> "Checkmate". */
export function terminationLabel(code) {
  const map = {
    checkmated: 'Checkmate',
    resigned: 'Resignation',
    timeout: 'Timeout',
    abandoned: 'Abandoned',
    agreed: 'Draw by agreement',
    repetition: 'Draw by repetition',
    stalemate: 'Stalemate',
    insufficient: 'Insufficient material',
    '50move': 'Fifty-move rule',
    timevsinsufficient: 'Timeout vs. insufficient',
    lose: 'Lost',
    win: 'Win',
    unknown: 'Unknown',
  };
  return map[code] || code;
}
