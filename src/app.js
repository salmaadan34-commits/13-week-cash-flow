/* UI for the 13-week cash flow forecast. Depends on window.CashEngine (engine.js). */
(function () {
  'use strict';
  const E = window.CashEngine;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let S = E.newState();
  let LOG = [];
  let varSel = null;
  let logAll = false;
  let lastF = null;

  const FIELDS = [
    { key: 'collectionRate', label: 'Collection rate, current AR', unit: '%', min: 70, max: 100, step: 0.5, hint: 'Share of current invoices expected to collect. Older aging buckets scale with it (1–30 days 95%, 31–60 85%, 61–90 60%, 90+ 25% at base).' },
    { key: 'slip', label: 'Collection slippage', unit: 'days', min: 0, max: 45, step: 1, hint: 'Days customers pay after the due date. Raising it pushes receipts into later weeks.' },
    { key: 'billChange', label: 'New billings vs plan', unit: '%', min: -40, max: 20, step: 1, hint: 'Applies to subscription and usage invoices not yet issued.' },
    { key: 'payroll', label: 'Payroll per cycle', unit: '$000s', min: 500, max: 1200, step: 5, hint: 'Gross pay plus employer taxes, paid every other Friday.' },
    { key: 'minCash', label: 'Minimum cash balance', unit: '$000s', min: 0, max: 4000, step: 50, hint: 'Treasury policy floor. The revolver draws to keep cash at or above it.' },
  ];

  // ---------- formatting ----------
  const f0 = (v) => { if (Math.abs(v) < 0.5) return '–'; const s = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? `(${s})` : s; };
  const fk = (v) => (v < 0 ? '–' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US') + 'k';
  const fm = (v) => (v < 0 ? '–' : '') + '$' + (Math.abs(v) / 1000).toFixed(2) + 'M';
  const fd = (ms, o) => new Date(ms).toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric', timeZone: 'UTC' }, o || {}));
  const fdLong = (ms) => fd(ms, { weekday: 'short', year: 'numeric' });
  const stamp = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function log(what, detail) { LOG.unshift({ t: stamp(), what, detail }); }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function scenarioOf(a) {
    for (const [id, sc] of Object.entries(E.SCENARIOS)) {
      if (FIELDS.every((f) => sc[f.key] === a[f.key])) return id;
    }
    return 'custom';
  }

  // ---------- render ----------
  function renderAll() {
    const F = E.forecast(S); lastF = F;
    renderHeader(F); renderAlert(F); renderKpis(F); renderChart(F); renderTable(F);
    renderFields(); renderVariance(); renderSources(F); renderControls(F); renderLog();
  }

  function asOfMs() { return S.closed.length ? S.closed[S.closed.length - 1].date : E.AS_OF; }

  function renderHeader(F) {
    S.scenario = scenarioOf(S.a);
    $('sc-base').setAttribute('aria-pressed', S.scenario === 'base');
    $('sc-downside').setAttribute('aria-pressed', S.scenario === 'downside');
    $('sc-custom').hidden = S.scenario !== 'custom';
    const chip = $('scenario-chip');
    chip.textContent = S.scenario === 'custom' ? 'Custom scenario' : E.SCENARIOS[S.scenario].label + ' scenario';
    chip.className = 'chip ' + (S.scenario === 'base' ? '' : 'warn');
    $('asof').textContent = 'As of ' + fdLong(asOfMs());
    const btn = $('btn-close');
    if (S.closed.length >= E.BANK.length) { btn.disabled = true; btn.textContent = 'Sample bank feed covers six weeks'; }
    else { btn.disabled = false; btn.textContent = 'Close week ending ' + fd(F.weeks[0].date) + ' and roll forward'; }
    $('btn-reset').disabled = S.closed.length === 0 && S.scenario === 'base' && LOG.length <= 2;
    const r = F.r;
    $('table-sub').textContent = `Forecast weeks F1 to F13, ${fd(F.weeks[0].date - 6 * E.DAY)} to ${fd(F.weeks[12].date)}${r ? `, after ${r} week${r > 1 ? 's' : ''} closed to actual` : ''}. USD thousands.`;
  }

  function trough(F) { return F.weeks.reduce((m, w) => (w.end < m.end ? w : m), F.weeks[0]); }

  function renderAlert(F) {
    const el = $('alert'); const a = S.a;
    const breach = F.weeks.filter((w) => w.belowPre);
    const short = F.weeks.filter((w) => w.short);
    const peak = Math.max(...F.weeks.map((w) => w.rev));
    let cls = 'ok', html;
    if (short.length) {
      const w = short[0];
      cls = 'bad';
      html = `<strong>Liquidity gap: the revolver is fully drawn and cash still falls ${fk(a.minCash - w.end)} below the ${fk(a.minCash)} minimum in the week ending ${fd(w.date)}.</strong> Options: delay discretionary vendor payments, accelerate collections on the largest open invoices, or seek a temporary increase in the facility.`;
    } else if (breach.length) {
      const w = breach[0];
      const endRev = F.weeks[12].rev;
      cls = 'warn';
      html = `<strong>Cash drops below the ${fk(a.minCash)} minimum in the week ending ${fd(w.date)} (${fk(w.pre)} before financing).</strong> The revolver covers it in ${breach.length} of 13 weeks, peaking at ${fk(peak)} drawn, with ${endRev > 0 ? `${fk(endRev)} still outstanding at week 13` : 'the balance fully repaid by week 13'}.`;
    } else {
      const t = trough(F);
      html = `<strong>Cash stays above the ${fk(a.minCash)} minimum in all 13 weeks.</strong> Tightest week ends ${fd(t.date)} at ${fk(t.end)}, ${fk(t.end - a.minCash)} of headroom. No revolver draw needed.`;
    }
    el.className = 'alert ' + cls;
    el.innerHTML = `<span class="dot" aria-hidden="true"></span><p>${html}</p>`;
  }

  function renderKpis(F) {
    const t = trough(F);
    const peak = Math.max(...F.weeks.map((w) => w.rev));
    const peakW = F.weeks.find((w) => w.rev === peak);
    const net = F.weeks.reduce((s, w) => s + w.net, 0);
    const k = [
      { l: 'Opening cash', v: fm(S.openCash), s: 'Bank balance ' + fd(asOfMs()) + (S.openRev ? `, revolver ${fk(S.openRev)} drawn` : '') },
      { l: 'Lowest ending cash', v: fm(t.end), s: 'Week ending ' + fd(t.date) + (t.belowPre ? ' after revolver draw' : '') },
      { l: 'Peak revolver balance', v: peak ? fm(peak) : '$0', s: peak ? `Week ending ${fd(peakW.date)}, ${fm(E.COMPANY.revolver.commitment - peak)} undrawn` : `$${E.COMPANY.revolver.commitment / 1000}M facility undrawn` },
      { l: '13-week net cash flow', v: fm(net), s: `Receipts ${fm(F.weeks.reduce((s, w) => s + w.receipts, 0))}, disbursements ${fm(F.weeks.reduce((s, w) => s + w.disb, 0))}` },
    ];
    $('kpis').innerHTML = k.map((x) => `<div class="kpi"><span class="eyebrow">${x.l}</span><span class="v">${x.v}</span><span class="s">${esc(x.s)}</span></div>`).join('');
  }

  // ---------- chart ----------
  function renderChart(F) {
    const box = $('chart');
    const W = Math.max(300, box.clientWidth || 800);
    const narrow = W < 560;
    const H = narrow ? 230 : 280;
    const m = { l: narrow ? 40 : 52, r: 10, t: 22, b: 30 };
    const pts = [
      ...S.closed.map((c) => ({ date: c.date, end: c.endCash, pre: null, draw: c.draw, rev: c.rev, actual: true })),
      ...F.weeks.map((w) => ({ date: w.date, end: w.end, pre: w.pre, draw: w.draw, rev: w.rev, actual: false, belowPre: w.belowPre })),
    ];
    const vals = pts.flatMap((p) => [p.end, p.pre == null ? p.end : p.pre, S.a.minCash]);
    const top = Math.ceil(Math.max(...vals) * 1.08 / 1000) * 1000;
    const bot = Math.min(0, Math.floor(Math.min(...vals) / 1000) * 1000);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / pts.length;
    const x = (i) => m.l + band * i + band / 2;
    const y = (v) => m.t + ih * (1 - (v - bot) / (top - bot));
    const step = top - bot > 6000 ? 2000 : 1000;
    let g = '';
    for (let v = bot; v <= top + 1; v += step) {
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      g += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v === 0 ? '0' : '$' + (v / 1000) + 'M'}</text>`;
    }
    const bw = Math.max(4, band * 0.62);
    let bars = '', labels = '', hits = '';
    const every = band < 34 ? 2 : 1;
    pts.forEach((p, i) => {
      const yy = y(Math.max(p.end, bot)), y0 = y(Math.max(0, bot));
      const h = Math.max(1, Math.abs(y0 - y(p.end)));
      const fill = p.actual ? 'var(--actual)' : 'var(--accent)';
      bars += `<rect x="${x(i) - bw / 2}" y="${p.end >= 0 ? yy : y0}" width="${bw}" height="${h}" rx="2" fill="${fill}"${!p.actual && p.draw > 0 ? ' opacity="0.78"' : ''}/>`;
      if (p.draw > 0) bars += `<text x="${x(i)}" y="${Math.min(y(p.end), y(p.pre == null ? p.end : p.pre)) - 6}" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--warn)">+${p.draw}</text>`;
      if (i % every === 0 || i === pts.length - 1) labels += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="${narrow ? 10 : 11}" fill="${p.actual ? 'var(--muted)' : 'var(--ink-2)'}">${fd(p.date)}</text>`;
      hits += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
    });
    // cash before revolver line (forecast weeks only)
    const fpts = pts.map((p, i) => ({ p, i })).filter((o) => !o.p.actual);
    const preLine = fpts.map((o, j) => `${j ? 'L' : 'M'}${x(o.i)},${y(o.p.pre)}`).join('');
    const preDots = fpts.filter((o) => o.p.belowPre).map((o) => `<circle cx="${x(o.i)}" cy="${y(o.p.pre)}" r="3.5" fill="var(--warn)"/>`).join('');
    const minY = y(S.a.minCash);
    const minLine = `<line x1="${m.l}" x2="${W - m.r}" y1="${minY}" y2="${minY}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - m.r}" y="${minY - 5}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--bad)">Min ${fk(S.a.minCash)}</text>`;
    let divider = '';
    if (S.closed.length) {
      const dx = m.l + band * S.closed.length;
      divider = `<line x1="${dx}" x2="${dx}" y1="${m.t - 14}" y2="${m.t + ih}" stroke="var(--line-strong)" stroke-dasharray="3 3"/><text x="${dx - 4}" y="${m.t - 6}" text-anchor="end" font-size="10.5" fill="var(--muted)">Actual</text><text x="${dx + 4}" y="${m.t - 6}" font-size="10.5" fill="var(--muted)">Forecast</text>`;
    }
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ending cash by week against the minimum cash line">${g}${divider}${bars}<path d="${preLine}" fill="none" stroke="var(--warn)" stroke-width="1.75" stroke-linejoin="round"/>${preDots}${minLine}${labels}<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)"/>${hits}</svg>`;
    const show = (i) => {
      const p = pts[i];
      $('readout').innerHTML = `<b>${p.actual ? 'Actual' : 'Forecast'}, week ending ${fd(p.date)}:</b> ending cash ${fk(p.end)}` +
        (p.pre != null && p.draw ? `, ${fk(p.pre)} before a ${fk(p.draw)} revolver ${p.draw > 0 ? 'draw' : 'repayment'}` : '') +
        `, revolver balance ${fk(p.rev)}`;
    };
    box.querySelectorAll('.hit').forEach((r) => {
      r.addEventListener('pointerenter', () => show(+r.dataset.i));
      r.addEventListener('click', () => show(+r.dataset.i));
    });
    box.querySelector('svg').addEventListener('pointerleave', defaultReadout);
    defaultReadout();
    function defaultReadout() {
      const t = trough(F);
      $('readout').innerHTML = `<b>Low point:</b> ${fk(t.end)} in the week ending ${fd(t.date)}. Hover or tap a week for detail.`;
    }
  }

  // ---------- table ----------
  function tableModel(F) {
    const W = F.weeks; const rows = [];
    const sum = (fn) => W.reduce((s, w) => s + fn(w), 0);
    const row = (label, cls, fn, totFn, cellCls) => rows.push({ label, cls, cells: W.map(fn), tot: totFn ? totFn() : null, cellCls });
    rows.push({ label: 'Receipts', cls: 'sec' });
    E.LINES.filter((l) => l.sec === 'in').forEach((l) => row(l.label, '', (w) => w.lines[l.id], () => sum((w) => w.lines[l.id])));
    row('Total receipts', 'sub', (w) => w.receipts, () => sum((w) => w.receipts));
    rows.push({ label: 'Disbursements', cls: 'sec' });
    E.LINES.filter((l) => l.sec === 'out').forEach((l) => row(l.label, '', (w) => w.lines[l.id], () => sum((w) => w.lines[l.id])));
    row('Total disbursements', 'sub', (w) => w.disb, () => sum((w) => w.disb));
    row('Net cash flow', 'net', (w) => w.net, () => sum((w) => w.net));
    rows.push({ label: 'Cash and liquidity', cls: 'sec' });
    row('Beginning cash', 'memo', (w) => w.begin, () => W[0].begin);
    row('Net cash flow', '', (w) => w.net, () => sum((w) => w.net));
    row('Revolver draw / (repayment)', '', (w) => w.draw, () => sum((w) => w.draw), (v) => (v > 0 ? 'draw' : ''));
    row('Ending cash', 'end', (w) => w.end, () => W[12].end);
    row('Minimum cash', 'memo', () => S.a.minCash, () => S.a.minCash);
    row('Headroom over minimum', 'memo', (w) => w.end - S.a.minCash, () => W[12].end - S.a.minCash, (v) => (v < -0.5 ? 'neg-head' : ''));
    rows.push({ label: `Revolver ($${E.COMPANY.revolver.commitment / 1000}.0M facility)`, cls: 'sec' });
    row('Revolver balance', 'memo', (w) => w.rev, () => W[12].rev);
    row('Availability', 'memo', (w) => w.avail, () => W[12].avail);
    rows.push({ label: 'Cash proof (begin + receipts − disbursements ± revolver = end)', cls: 'check', cells: W.map((w) => w.tie), tot: W.every((w) => w.tie) });
    return rows;
  }

  function renderTable(F) {
    const rows = tableModel(F);
    let h = '<table class="cf"><thead><tr><th scope="col">USD 000s</th>';
    F.weeks.forEach((w, i) => { h += `<th scope="col"${w.belowPre ? ' class="flag" title="Below minimum before revolver"' : ''}><span class="wk">F${i + 1}${w.belowPre ? ' ▲' : ''}</span><span class="dt">${fd(w.date)}</span></th>`; });
    h += '<th scope="col" class="tot"><span class="wk">13 weeks</span><span class="dt">Total</span></th></tr></thead><tbody>';
    rows.forEach((r) => {
      if (r.cls === 'sec') { h += `<tr class="sec"><td colspan="15">${esc(r.label)}</td></tr>`; return; }
      if (r.cls === 'check') {
        h += `<tr class="memo"><td>${esc(r.label)}</td>` + r.cells.map((ok) => `<td class="${ok ? 'ok' : 'fail'}">${ok ? '✓' : '✗'}</td>`).join('') + `<td class="tot ${r.tot ? 'ok' : 'fail'}">${r.tot ? 'Ties' : 'Error'}</td></tr>`;
        return;
      }
      h += `<tr class="${r.cls}"><th scope="row" style="font-weight:inherit">${esc(r.label)}</th>` + r.cells.map((v) => `<td class="${r.cellCls ? r.cellCls(v) : ''}">${f0(v)}</td>`).join('') + `<td class="tot">${r.tot == null ? '' : f0(r.tot)}</td></tr>`;
    });
    h += '</tbody></table>';
    $('table').innerHTML = h;
  }

  function tableTsv() {
    const F = lastF; const rows = tableModel(F);
    const head = ['USD 000s', ...F.weeks.map((w, i) => `F${i + 1} ${E.iso(w.date)}`), '13-week total'];
    const lines = [head.join('\t')];
    rows.forEach((r) => {
      if (r.cls === 'sec') lines.push(r.label);
      else if (r.cls === 'check') lines.push([r.label, ...r.cells.map((ok) => (ok ? 'Ties' : 'Error')), r.tot ? 'Ties' : 'Error'].join('\t'));
      else lines.push([r.label, ...r.cells.map((v) => Math.round(v)), r.tot == null ? '' : Math.round(r.tot)].join('\t'));
    });
    return lines.join('\n');
  }

  // ---------- assumptions ----------
  function renderFields() {
    const base = E.SCENARIOS.base;
    const host = $('fields');
    if (!host.dataset.built) {
      host.innerHTML = FIELDS.map((f) => `<div class="field"><label for="as-${f.key}">${f.label}</label><div class="inp"><input id="as-${f.key}" type="number" inputmode="decimal" min="${f.min}" max="${f.max}" step="${f.step}" data-key="${f.key}"><span>${f.unit}</span></div><p class="hint" id="hint-${f.key}"></p></div>`).join('');
      host.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', onFieldChange));
      host.dataset.built = '1';
    }
    let changed = false;
    FIELDS.forEach((f) => {
      const inp = $('as-' + f.key);
      if (document.activeElement !== inp) inp.value = S.a[f.key];
      const diff = S.a[f.key] !== base[f.key];
      changed = changed || diff;
      inp.classList.toggle('changed', diff);
      $('hint-' + f.key).textContent = `Base ${base[f.key]}${f.unit === '%' ? '%' : ' ' + f.unit}. ${f.hint}`;
    });
    $('assump-chip').hidden = !changed;
  }

  function onFieldChange(e) {
    const inp = e.target; const f = FIELDS.find((x) => x.key === inp.dataset.key);
    let v = parseFloat(inp.value);
    if (!isFinite(v)) { inp.value = S.a[f.key]; toast('Enter a number for ' + f.label.toLowerCase()); return; }
    const clamped = Math.min(f.max, Math.max(f.min, v));
    if (clamped !== v) toast(`${f.label} kept within ${f.min} to ${f.max}`);
    v = clamped;
    const old = S.a[f.key];
    if (v === old) { inp.value = v; return; }
    S.a[f.key] = v;
    log(`${f.label} changed`, `${old} → ${v} ${f.unit}`);
    renderAll();
  }

  function setScenario(id) {
    if (scenarioOf(S.a) === id) return;
    const sc = E.SCENARIOS[id];
    FIELDS.forEach((f) => { S.a[f.key] = sc[f.key]; });
    log(`Scenario set to ${sc.label}`, FIELDS.map((f) => `${f.label} ${sc[f.key]}${f.unit === '%' ? '%' : ' ' + f.unit}`).join('; '));
    renderAll();
  }

  // ---------- variance ----------
  function renderVariance() {
    const host = $('variance');
    if (!S.closed.length) {
      $('var-sub').textContent = 'Closed weeks compare bank actuals with the forecast';
      host.innerHTML = `<div class="empty"><p><b>No weeks closed yet.</b> Closing a week loads its simulated bank activity, freezes the forecast for that week, compares each line, then rolls the 13-week window forward by one week.</p><button type="button" class="btn primary" id="btn-close-2">Close week ending ${fd(lastF.weeks[0].date)}</button></div>`;
      $('btn-close-2').addEventListener('click', doClose);
      return;
    }
    if (varSel == null || varSel >= S.closed.length) varSel = S.closed.length - 1;
    const c = S.closed[varSel];
    const rec = S.closed.reduce((a, x) => ({ fc: a.fc + x.fcReceipts, err: a.err + E.LINES.filter((l) => l.sec === 'in').reduce((s, l) => s + Math.abs(x.act[l.id] - x.fc[l.id]), 0) }), { fc: 0, err: 0 });
    const acc = rec.fc ? Math.max(0, 1 - rec.err / rec.fc) : 1;
    $('var-sub').textContent = `Receipts accuracy ${(acc * 100).toFixed(1)}% across ${S.closed.length} closed week${S.closed.length > 1 ? 's' : ''}`;
    const rows = [];
    const line = (label, fc, act, sign, note, cls) => {
      const v = sign * (act - fc);
      const pct = Math.abs(fc) > 0.5 ? v / Math.abs(fc) : null;
      const flag = Math.abs(v) >= 25 && (pct == null || Math.abs(pct) >= 0.1);
      rows.push(`<tr class="${cls || ''}"><td>${esc(label)}</td><td>${f0(fc)}</td><td>${f0(act)}</td><td class="${Math.abs(v) < 0.5 ? '' : v > 0 ? 'fav' : 'unfav'}">${f0(v)}</td><td>${pct == null ? '–' : (pct * 100).toFixed(1) + '%'}</td><td class="note">${flag ? '<span class="chip warn">Review</span> ' : ''}${esc(note || '')}</td></tr>`);
    };
    E.LINES.forEach((l) => {
      if (Math.abs(c.fc[l.id]) < 0.5 && Math.abs(c.act[l.id]) < 0.5) return;
      line(l.label, c.fc[l.id], c.act[l.id], l.sec === 'in' ? 1 : -1, c.notes[l.id]);
    });
    line('Total receipts', c.fcReceipts, c.receipts, 1, '', 'sub');
    line('Total disbursements', c.fcDisb, c.disb, -1, '', 'sub');
    line('Revolver draw / (repayment)', c.fcDraw, c.draw, 1, '', '');
    line('Ending cash', c.fcEnd, c.endCash, 1, 'Becomes opening cash for the rolled forecast', 'sub');
    host.innerHTML = `<div class="weeks" role="group" aria-label="Closed week">${S.closed.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === varSel}">Wk ending ${fd(x.date)}</button>`).join('')}</div>
      <div class="table-scroll"><table class="var"><thead><tr><th>USD 000s</th><th>Forecast</th><th>Actual</th><th>Fav / (unfav)</th><th>%</th><th class="note">Explanation</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="hint">Forecast is the version that stood when the week was closed. Lines over $25k and 10% are flagged for review. Closed weeks are frozen and can't be edited.</p>`;
    host.querySelectorAll('.weeks button').forEach((b) => b.addEventListener('click', () => { varSel = +b.dataset.i; renderVariance(); }));
  }

  // ---------- sources ----------
  function renderSources(F) {
    const host = $('sources');
    const open = Array.from(host.querySelectorAll('details')).map((d) => d.open);
    const weekOf = (k) => (k >= F.r && k < F.r + 13 ? `F${k - F.r + 1} · ${fd(E.weekEnd(k))}` : k >= F.r + 13 ? 'Beyond week 13' : fd(E.weekEnd(k)));
    // AR
    const bk = Object.keys(E.BUCKETS).map((b) => {
      const inv = S.ar.filter((x) => x.bucket === b);
      return { b, n: inv.length, amt: inv.reduce((s, x) => s + x.amt, 0) };
    });
    const arTotal = E.AR.reduce((s, x) => s + x.amt, 0);
    const arRows = S.ar.map((inv) => {
      let status, exp = '', amt = '';
      if (inv.paid != null) status = `<span class="chip good">Collected ${fd(E.weekEnd(inv.paid))}</span>`;
      else if (inv.reserved != null) status = '<span class="chip bad">Removed, bad-debt review</span>';
      else {
        const k = Math.max(E.arExpectedWeek(inv, S.a), F.r);
        exp = weekOf(k); amt = f0(inv.amt * E.rateFor(inv.bucket, S.a));
        status = inv.reWeek != null ? '<span class="chip warn">New date confirmed</span>' : inv.bucket === 'b4' ? '<span class="chip bad">At risk</span>' : '<span class="chip">Open</span>';
      }
      return `<tr><td>${esc(inv.cust)}</td><td>${inv.inv}</td><td>${fd(E.D(inv.due))}</td><td class="r">${inv.dpd > 0 ? inv.dpd : '–'}</td><td>${E.BUCKETS[inv.bucket].label}</td><td class="r">${f0(inv.amt)}</td><td>${exp}</td><td class="r">${amt}</td><td>${status}</td></tr>`;
    }).join('');
    // AP
    const apRows = S.ap.map((inv) => {
      let status, wk = '';
      if (inv.paid != null) status = `<span class="chip good">Paid ${fd(E.weekEnd(inv.paid))}</span>`;
      else {
        const k = Math.max(inv.reWeek != null ? inv.reWeek : E.wkOf(E.D(inv.due)), F.r);
        wk = weekOf(k);
        status = inv.reWeek != null ? '<span class="chip warn">On hold, disputed</span>' : E.D(inv.due) < E.AS_OF ? '<span class="chip warn">Past due</span>' : '<span class="chip">Open</span>';
      }
      return `<tr><td>${esc(inv.vendor)}</td><td>${esc(inv.desc)}</td><td>${fd(E.D(inv.due))}</td><td class="r">${f0(inv.amt)}</td><td>${wk}</td><td>${status}</td></tr>`;
    }).join('');
    const apTotal = E.AP.reduce((s, x) => s + x.amt, 0);
    // Schedule within window
    const lo = F.r, hi = F.r + 12;
    const inWin = (d) => { const k = E.wkOf(E.D(d)); return k >= lo && k <= hi; };
    const lineLabel = Object.fromEntries(E.LINES.map((l) => [l.id, l.label]));
    const sched = E.FIXED.filter((f) => inWin(f.date)).map((f) => ({ date: f.date, item: f.desc, line: lineLabel[f.line], amt: f.amt == null ? S.a.payroll : f.amt }))
      .concat(E.BILLINGS.filter((b) => b.type === 'Subscription' && inWin(b.date)).map((b) => ({ date: b.date, item: `Subscription billing, collected net ${b.terms} + slippage`, line: 'Billing (not cash)', amt: b.amt * (1 + S.a.billChange / 100) })))
      .sort((p, q) => p.date.localeCompare(q.date));
    const schedRows = sched.map((s) => `<tr><td>${fd(E.D(s.date), { weekday: 'short' })}</td><td>${esc(s.item)}</td><td>${esc(s.line)}</td><td class="r">${f0(s.amt)}</td></tr>`).join('');

    host.innerHTML = `
      <details class="src"><summary>AR aging <span class="chip">${E.AR.length} invoices · ${fk(arTotal)}</span><span class="muted" style="font-weight:400">as of Nov 13, 2026</span></summary><div class="inner">
        <div class="buckets">${bk.map((x) => `<div class="bucket"><span class="eyebrow">${E.BUCKETS[x.b].label}</span><b>${fk(x.amt)}</b><span class="hint">${x.n} inv · collect ${(E.rateFor(x.b, S.a) * 100).toFixed(1)}%</span></div>`).join('')}</div>
        <div class="table-scroll"><table class="src"><thead><tr><th>Customer</th><th>Invoice</th><th>Due</th><th class="r">Days past due</th><th>Bucket</th><th class="r">Balance</th><th>Expected week</th><th class="r">Forecast</th><th>Status</th></tr></thead><tbody>${arRows}</tbody></table></div>
        <p class="hint">Current invoices are expected on the due date plus slippage. Past-due invoices are expected after a lag by bucket (0, 14, 28 or 49 days) plus slippage, at the bucket's collection rate.</p>
      </div></details>
      <details class="src"><summary>AP aging <span class="chip">${E.AP.length} invoices · ${fk(apTotal)}</span><span class="muted" style="font-weight:400">paid in the Thursday run of the due week</span></summary><div class="inner">
        <div class="table-scroll"><table class="src"><thead><tr><th>Vendor</th><th>Description</th><th>Due</th><th class="r">Amount</th><th>Payment week</th><th>Status</th></tr></thead><tbody>${apRows}</tbody></table></div>
        <p class="hint">Vendor spend not yet invoiced runs at ${fk(E.SPEND[0].amt)} a week and is paid net ${E.SPEND[0].terms}.</p>
      </div></details>
      <details class="src"><summary>Payroll, debt and fixed payments <span class="chip">${sched.length} items in window</span></summary><div class="inner">
        <div class="table-scroll"><table class="src"><thead><tr><th>Date</th><th>Item</th><th>Forecast line</th><th class="r">Amount</th></tr></thead><tbody>${schedRows}</tbody></table></div>
        <p class="hint">Usage and services billings of ${fk(E.BILLINGS.find((b) => b.type !== 'Subscription').amt)} are invoiced every Monday, net 30. Term loan ${fk(97.5)} a month; revolver ${fm(E.COMPANY.revolver.commitment)} at ${E.COMPANY.revolver.rate}%.</p>
      </div></details>`;
    host.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
  }

  // ---------- controls ----------
  function renderControls(F) {
    const ties = F.weeks.filter((w) => w.tie).length;
    const c = [
      { h: 'Synthetic data only', chip: ['info', 'Demo'], p: 'Every company, customer, vendor and figure is invented. No real ledger or bank data is loaded.' },
      { h: 'Source data locked', chip: ['good', 'On'], p: 'AR aging, AP aging, payroll calendar and debt schedule are read-only. Only the five labelled assumptions can change.' },
      { h: 'Assumptions log', chip: ['good', `${LOG.length} entries`], p: 'Every assumption change, scenario switch, roll-forward and reset is time-stamped below for review.' },
      { h: 'Cash proof', chip: [ties === 13 ? 'good' : 'bad', `${ties} of 13 tie`], p: 'Each week proves beginning cash plus receipts less disbursements plus or minus revolver equals ending cash.' },
      { h: 'Closed weeks frozen', chip: ['good', `${S.closed.length} closed`], p: 'Once a week is closed, its actuals and the forecast it is measured against cannot be edited.' },
      { h: 'Liquidity policy', chip: ['good', 'Documented'], p: `Minimum cash ${fk(S.a.minCash)}. Revolver draws, repayments and the ${fm(E.COMPANY.revolver.commitment)} cap follow one written rule, shown under the table.` },
    ];
    $('controls').innerHTML = c.map((x) => `<div class="control"><div class="h"><h3>${x.h}</h3><span class="chip ${x.chip[0]}">${x.chip[1]}</span></div><p>${x.p}</p></div>`).join('');
  }

  function renderLog() {
    const list = logAll ? LOG : LOG.slice(0, 8);
    $('log').innerHTML = list.map((e) => `<li><time>${esc(e.t)}</time><div><b>${esc(e.what)}</b><div class="d">${esc(e.detail)}</div></div></li>`).join('');
    const b = $('btn-log');
    b.hidden = LOG.length <= 8;
    b.textContent = logAll ? 'Show fewer' : `Show all ${LOG.length}`;
  }

  // ---------- actions ----------
  function doClose() {
    const rec = E.closeWeek(S);
    if (!rec) return;
    varSel = S.closed.length - 1;
    const v = rec.endCash - rec.fcEnd;
    log(`Closed week ending ${fd(rec.date)}`, `Bank actuals loaded. Ending cash ${fk(rec.endCash)} vs forecast ${fk(rec.fcEnd)} (${v >= 0 ? '+' : '–'}${fk(Math.abs(v))}). Window rolled to week ending ${fd(E.weekEnd(rec.k + 13))}.`);
    renderAll();
    toast(`Week ending ${fd(rec.date)} closed and forecast rolled forward`);
  }

  function doReset() {
    const keep = S.a;
    S = E.newState(); varSel = null;
    LOG = []; seedLog();
    if (scenarioOf(keep) !== 'base') log('Reset', 'Closed weeks cleared and assumptions returned to base');
    renderAll();
    toast('Reset to the Nov 13 forecast');
  }

  function seedLog() {
    log('Forecast prepared', 'Built from AR aging, AP aging, payroll calendar and debt schedule as of Nov 13, 2026 (synthetic). Opening cash ' + fk(E.COMPANY.openingCash) + '.');
    log('Scenario set to Base', 'Collection rate 98%, slippage 3 days, billings on plan, payroll $835k per cycle, minimum cash $1,500k');
  }

  $('seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-sc]'); if (b) setScenario(b.dataset.sc); });
  $('btn-close').addEventListener('click', doClose);
  $('btn-reset').addEventListener('click', doReset);
  $('btn-log').addEventListener('click', () => { logAll = !logAll; renderLog(); });
  $('btn-copy').addEventListener('click', () => {
    const text = tableTsv();
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? 'Copied. Paste into Excel or Sheets.' : 'Copy is blocked here. Select the table and copy it instead.');
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast('Copied. Paste into Excel or Sheets.'), fallback);
    } catch (err) { fallback(); }
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => lastF && renderChart(lastF), 120); });

  seedLog();
  renderAll();
})();
