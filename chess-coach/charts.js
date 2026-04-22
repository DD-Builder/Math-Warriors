/* ============================================================
   Hand-rolled inline SVG charts.
   No deps. Same aesthetic pattern as the rest of Chronicle.
   ============================================================ */

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

/**
 * Line chart for one rating series.
 * series: [{ t: unixSeconds, r: rating, outcome? }]
 * Returns an SVG string.
 */
export function lineChartSVG(series, { width = 720, height = 220 } = {}) {
  if (!series || series.length === 0) {
    return emptyChart(width, height, 'No rated games in this category.');
  }
  // Sort and derive domains.
  const pts = [...series].sort((a, b) => a.t - b.t);
  const xMin = pts[0].t, xMax = pts[pts.length - 1].t;
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) { if (p.r < yMin) yMin = p.r; if (p.r > yMax) yMax = p.r; }
  if (yMin === yMax) { yMin -= 10; yMax += 10; }
  // Pad Y by 4% for breathing room.
  const yPad = Math.max(10, (yMax - yMin) * 0.04);
  yMin -= yPad; yMax += yPad;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const xScale = t => PAD.left + ((t - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const yScale = r => PAD.top  + innerH - ((r - yMin) / (yMax - yMin)) * innerH;

  // Downsample if very dense: keep at most ~800 points.
  const step = Math.max(1, Math.ceil(pts.length / 800));
  const sampled = pts.filter((_, i) => i % step === 0);

  const path = sampled.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(p.t).toFixed(1)},${yScale(p.r).toFixed(1)}`
  ).join(' ');

  const areaPath = `${path} L${xScale(sampled[sampled.length - 1].t).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${xScale(sampled[0].t).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Y ticks: 5 evenly spaced.
  const yTicks = niceTicks(yMin, yMax, 5);
  const xTicks = timeTicks(xMin, xMax, 6);

  return `
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="rating over time">
  <g class="grid">
    ${yTicks.map(t => `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${yScale(t).toFixed(1)}" y2="${yScale(t).toFixed(1)}"/>`).join('')}
  </g>
  <g class="axis">
    ${yTicks.map(t => `<text x="${PAD.left - 6}" y="${(yScale(t) + 3).toFixed(1)}" text-anchor="end">${Math.round(t)}</text>`).join('')}
    ${xTicks.map(t => `<text x="${xScale(t.t).toFixed(1)}" y="${height - PAD.bottom + 14}" text-anchor="middle">${t.label}</text>`).join('')}
    <line x1="${PAD.left}" x2="${width - PAD.right}" y1="${height - PAD.bottom}" y2="${height - PAD.bottom}"/>
  </g>
  <path class="series-fill" d="${areaPath}"/>
  <path class="series-line" d="${path}"/>
</svg>`;
}

/**
 * Monthly activity bar chart — stacked W/D/L per month.
 * months: [{ month: 'YYYY-MM', total, w, d, l }]
 */
export function stackedBarsSVG(months, { width = 720, height = 220 } = {}) {
  if (!months || months.length === 0) {
    return emptyChart(width, height, 'No activity to plot.');
  }
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const yMax = Math.max(...months.map(m => m.total));
  const yPadded = Math.ceil(yMax * 1.06);
  const yScale = v => PAD.top + innerH - (v / yPadded) * innerH;

  const n = months.length;
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(28, slot * 0.8));
  const yTicks = niceTicks(0, yPadded, 4);

  const xTickEvery = Math.ceil(n / 10);

  const bars = months.map((m, i) => {
    const x = PAD.left + slot * i + (slot - barW) / 2;
    const yW = yScale(m.w);
    const yWD = yScale(m.w + m.d);
    const yWDL = yScale(m.w + m.d + m.l);
    const hW = (PAD.top + innerH) - yW;
    const hD = yW - yWD;
    const hL = yWD - yWDL;
    return `
      <rect class="bar-win"  x="${x.toFixed(1)}" y="${yW.toFixed(1)}"  width="${barW.toFixed(1)}" height="${Math.max(0, hW).toFixed(1)}"/>
      <rect class="bar-draw" x="${x.toFixed(1)}" y="${yWD.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hD).toFixed(1)}"/>
      <rect class="bar-loss" x="${x.toFixed(1)}" y="${yWDL.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hL).toFixed(1)}"/>
    `;
  }).join('');

  const xLabels = months.map((m, i) => {
    if (i % xTickEvery !== 0) return '';
    const cx = PAD.left + slot * i + slot / 2;
    const [y, mo] = m.month.split('-');
    const lbl = `${new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: 'short' })} ${y.slice(2)}`;
    return `<text x="${cx.toFixed(1)}" y="${height - PAD.bottom + 14}" text-anchor="middle">${lbl}</text>`;
  }).join('');

  return `
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="monthly activity">
  <g class="grid">
    ${yTicks.map(t => `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${yScale(t).toFixed(1)}" y2="${yScale(t).toFixed(1)}"/>`).join('')}
  </g>
  <g class="axis">
    ${yTicks.map(t => `<text x="${PAD.left - 6}" y="${(yScale(t) + 3).toFixed(1)}" text-anchor="end">${Math.round(t)}</text>`).join('')}
    ${xLabels}
    <line x1="${PAD.left}" x2="${width - PAD.right}" y1="${height - PAD.bottom}" y2="${height - PAD.bottom}"/>
  </g>
  ${bars}
</svg>`;
}

/* ------------ tick helpers ------------ */

function niceTicks(min, max, count) {
  if (max - min < 1e-9) return [min];
  const step = niceStep((max - min) / count);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const frac = raw / base;
  let nice;
  if (frac < 1.5) nice = 1;
  else if (frac < 3) nice = 2;
  else if (frac < 7) nice = 5;
  else nice = 10;
  return nice * base;
}

function timeTicks(minT, maxT, count) {
  const step = Math.max(1, Math.floor((maxT - minT) / count));
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const t = minT + step * i;
    const d = new Date(t * 1000);
    const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    ticks.push({ t, label });
  }
  return ticks;
}

function emptyChart(w, h, msg) {
  return `
<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${msg}">
  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="label">${msg}</text>
</svg>`;
}
