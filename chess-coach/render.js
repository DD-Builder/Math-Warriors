/* ============================================================
   Render analysis result into DOM sections.
   ============================================================ */

import { fmt, terminationLabel } from './analyze.js';
import { lineChartSVG, stackedBarsSVG } from './charts.js';

export function $(sel, root = document) { return root.querySelector(sel); }

/* ------------ pull quote ------------ */

export function renderPullQuote(ov) {
  const el = $('#pullQuote');
  if (!ov.total) { el.textContent = ''; return; }
  const pct = fmt.pct(ov.winPct);
  el.innerHTML = `A <b>${pct}</b> win rate across <b>${fmt.int(ov.total)}</b> rated and casual games.`;
}

/* ------------ overview grid ------------ */

export function renderOverview(ov) {
  const el = $('#overview');
  el.innerHTML = `
    <div class="overview-grid">
      ${statCard('Games', fmt.int(ov.total), ov.firstGame ? `since ${fmt.date(ov.firstGame)}` : '')}
      ${statCard('Wins',   fmt.int(ov.wins),   fmt.pct(ov.winPct),  'win')}
      ${statCard('Losses', fmt.int(ov.losses), fmt.pct(ov.lossPct), 'loss')}
      ${statCard('Draws',  fmt.int(ov.draws),  fmt.pct(ov.drawPct), 'draw')}
      ${statCard('Current rating', ov.currentRating ? fmt.int(ov.currentRating) : '—', ov.lastGame ? `as of ${fmt.date(ov.lastGame)}` : '')}
      ${statCard('Peak rating',    ov.peakRating    ? fmt.int(ov.peakRating)    : '—', '')}
    </div>`;
}

function statCard(label, value, sub = '', cls = '') {
  return `
    <div class="stat ${cls}">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
      ${sub ? `<span class="stat-sub">${sub}</span>` : ''}
    </div>`;
}

/* ------------ rating chart w/ tabs ------------ */

export function renderRating(ratingSeries) {
  const tabs = $('#ratingTabs');
  const chart = $('#ratingChart');
  const keys = Object.keys(ratingSeries).filter(k => (ratingSeries[k] || []).length > 0);
  if (keys.length === 0) {
    tabs.innerHTML = '';
    chart.innerHTML = lineChartSVG([]);
    return;
  }
  const preferred = ['rapid', 'blitz', 'bullet', 'daily'];
  keys.sort((a, b) => {
    const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
  let active = keys[0];

  const paint = () => {
    tabs.innerHTML = keys.map(k =>
      `<button class="tab" role="tab" aria-selected="${k === active}" data-k="${k}">
         ${k} <span class="count">${ratingSeries[k].length}</span>
       </button>`
    ).join('');
    chart.innerHTML = lineChartSVG(ratingSeries[active]);
    for (const btn of tabs.querySelectorAll('.tab')) {
      btn.addEventListener('click', () => { active = btn.dataset.k; paint(); });
    }
  };
  paint();
}

/* ------------ activity chart ------------ */

export function renderActivity(activity) {
  $('#activityChart').innerHTML = stackedBarsSVG(activity);
}

/* ------------ by color ------------ */

export function renderColor(byColor) {
  const el = $('#colorPanel');
  el.innerHTML = `
    <p class="eyebrow">Figure III</p>
    <h2 class="section-title">By color</h2>
    ${byColor.map(r => barRow(r.key === 'white' ? 'White' : 'Black', r)).join('')}
  `;
}

/* ------------ by time class ------------ */

export function renderTimeClass(byTimeClass) {
  const el = $('#timeClassPanel');
  el.innerHTML = `
    <p class="eyebrow">Figure IV</p>
    <h2 class="section-title">By time class</h2>
    ${byTimeClass.map(r => barRow(capitalize(r.key), r)).join('')}
  `;
}

function barRow(label, r) {
  const total = r.total || 1;
  const wPct = (r.w / total) * 100;
  const dPct = (r.d / total) * 100;
  const lPct = (r.l / total) * 100;
  return `
    <div class="bar-row">
      <div class="label">
        <span>${label}</span>
        <span class="meta">${r.w}W · ${r.d}D · ${r.l}L <b style="color:var(--ink)">${fmt.pct0(r.w / total)}</b></span>
      </div>
      <div class="bar-stack" aria-label="${label}: ${r.w} wins, ${r.d} draws, ${r.l} losses">
        <div class="w" style="width:${wPct.toFixed(2)}%"></div>
        <div class="d" style="width:${dPct.toFixed(2)}%"></div>
        <div class="l" style="width:${lPct.toFixed(2)}%"></div>
      </div>
    </div>`;
}

/* ------------ openings table ------------ */

export function renderOpenings(openings) {
  const el = $('#openingsSection');
  if (!openings.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <p class="eyebrow">Ledger I</p>
    <h2 class="section-title">Most-played openings</h2>
    <table class="ledger">
      <thead>
        <tr>
          <th>Opening</th>
          <th class="num">Games</th>
          <th class="num">Win %</th>
          <th>W–D–L</th>
          <th class="num">% as White</th>
        </tr>
      </thead>
      <tbody>
        ${openings.map(r => `
          <tr>
            <td class="opening-name">${escape(r.opening)}</td>
            <td class="num">${fmt.int(r.total)}</td>
            <td class="num">${fmt.pct(r.winPct)}</td>
            <td class="wdl"><b class="w">${r.w}</b>–<b class="d">${r.d}</b>–<b class="l">${r.l}</b></td>
            <td class="num">${fmt.pct0(r.whitePct)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ------------ terminations ------------ */

export function renderTerminations(terminations, total) {
  const el = $('#terminationsSection');
  if (!terminations.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <p class="eyebrow">Ledger II</p>
    <h2 class="section-title">How games ended</h2>
    <table class="ledger">
      <thead>
        <tr>
          <th>Termination</th>
          <th class="num">Count</th>
          <th class="num">Share</th>
        </tr>
      </thead>
      <tbody>
        ${terminations.map(r => `
          <tr>
            <td>${escape(terminationLabel(r.termination))}</td>
            <td class="num">${fmt.int(r.count)}</td>
            <td class="num">${fmt.pct(r.count / (total || 1))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ------------ utilities ------------ */

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------ error + progress ------------ */

export function showError(msg) {
  const el = $('#errorHost');
  el.hidden = false;
  el.textContent = msg;
}

export function clearError() {
  const el = $('#errorHost');
  el.hidden = true;
  el.textContent = '';
}

export function showProgress(label, pct) {
  const section = $('#progress');
  section.hidden = false;
  $('#progressLabel').textContent = label;
  $('#progressFill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

export function hideProgress() { $('#progress').hidden = true; }
