/*
 * 13-week direct-method cash flow forecast engine.
 * All amounts are USD thousands. All sample data is synthetic.
 * Works in the browser (window.CashEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const DAY = 864e5;
  const D = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  // Forecast weeks run Saturday to Friday ("week ending Friday").
  const START = D('2026-11-14');
  const AS_OF = D('2026-11-13');
  const wkOf = (ms) => Math.floor((ms - START) / (7 * DAY));
  const weekEnd = (k) => START + (7 * k + 6) * DAY;
  const WINDOW = 13;

  const COMPANY = {
    name: 'Halden Systems, Inc.',
    blurb: 'Fictional B2B SaaS company, about 140 employees',
    asOf: '2026-11-13',
    openingCash: 4750,
    revolver: { commitment: 4000, rate: 7.25, increment: 250, repayBuffer: 1000, opening: 0 },
    basePayroll: 835,
  };

  const SCENARIOS = {
    base:     { label: 'Base',     collectionRate: 98, slip: 3,  billChange: 0,  payroll: 835, minCash: 1500 },
    downside: { label: 'Downside', collectionRate: 93, slip: 14, billChange: -8, payroll: 835, minCash: 1500 },
  };

  const LINES = [
    { id: 'arExisting', label: 'Collections: AR aging', sec: 'in' },
    { id: 'arNew',      label: 'Collections: new billings', sec: 'in' },
    { id: 'otherIn',    label: 'Interest income', sec: 'in' },
    { id: 'payroll',    label: 'Payroll & payroll taxes', sec: 'out' },
    { id: 'bonus',      label: 'Annual bonus', sec: 'out' },
    { id: 'benefits',   label: 'Benefits & 401(k)', sec: 'out' },
    { id: 'apExisting', label: 'Vendors: AP aging', sec: 'out' },
    { id: 'apSpend',    label: 'Vendors: forecast spend', sec: 'out' },
    { id: 'rent',       label: 'Rent', sec: 'out' },
    { id: 'debt',       label: 'Term loan P&I', sec: 'out' },
    { id: 'taxes',      label: 'Sales/use & franchise tax', sec: 'out' },
    { id: 'capex',      label: 'Capital expenditures', sec: 'out' },
    { id: 'revInt',     label: 'Revolver interest', sec: 'out' },
  ];

  // AR aging as of Fri Nov 13, 2026. truePay drives the simulated bank feed only;
  // the forecast never reads it.
  const AR = [
    ['AR01', 'Alder & Finch Retail',      'INV-24117', '2026-11-16', 412.5,  '2026-11-20'],
    ['AR02', 'Bluewater Freight',         'INV-24121', '2026-11-19', 286.0,  '2026-11-24'],
    ['AR03', 'Cedar Ridge Clinics',       'INV-24130', '2026-11-27', 198.4,  '2026-12-08'],
    ['AR04', 'Kestrel Aerospace',         'INV-24133', '2026-12-02', 365.0,  '2026-12-03'],
    ['AR05', 'Foxglove Insurance',        'INV-24140', '2026-12-04', 241.75, '2026-12-09'],
    ['AR06', 'Harbor Lane Hotels',        'INV-24144', '2026-12-07', 154.2,  '2026-12-22'],
    ['AR07', 'Granite Peak Credit Union', 'INV-24152', '2026-12-10', 318.9,  '2026-12-15'],
    ['AR08', 'Ironleaf Foods',            'INV-24155', '2026-12-11', 97.3,   '2026-12-11'],
    ['AR09', 'Juniper Unified Schools',   'INV-24161', '2026-12-14', 132.6,  '2027-01-08'],
    ['AR10', 'Driftline Media',           'INV-24168', '2026-11-18', 88.45,  '2026-11-18'],
    ['AR11', 'Everhart Manufacturing',    'INV-24062', '2026-10-30', 214.8,  '2026-11-19'],
    ['AR12', 'Lumen Street Bank',         'INV-24071', '2026-11-02', 176.4,  '2026-11-26'],
    ['AR13', 'Driftline Media',           'INV-24079', '2026-11-06', 92.15,  '2026-12-01'],
    ['AR14', 'Marlow Dental Group',       'INV-24085', '2026-11-09', 118.6,  '2026-11-17'],
    ['AR15', 'Juniper Unified Schools',   'INV-23991', '2026-10-05', 146.3,  '2027-01-08'],
    ['AR16', 'Northgate Property Mgmt',   'INV-24003', '2026-10-12', 87.9,   '2026-12-10'],
    ['AR17', 'Harbor Lane Hotels',        'INV-24010', '2026-09-28', 61.2,   '2026-12-22'],
    ['AR18', 'Orchard & Vine Hospitality','INV-23902', '2026-09-04', 71.8,   null],
    ['AR19', 'Pinecrest Logistics',       'INV-23915', '2026-08-25', 42.35,  '2026-12-29'],
    ['AR20', 'Quarry Hill Builders',      'INV-23810', '2026-07-20', 58.6,   null],
    ['AR21', 'Redfern Studios',           'INV-23797', '2026-06-30', 19.75,  null],
  ].map(([id, cust, inv, due, amt, truePay]) => {
    const dpd = Math.round((AS_OF - D(due)) / DAY);
    const bucket = dpd <= 0 ? 'cur' : dpd <= 30 ? 'b1' : dpd <= 60 ? 'b2' : dpd <= 90 ? 'b3' : 'b4';
    return { id, cust, inv, due, amt, truePay, dpd, bucket };
  });

  const BUCKETS = {
    cur: { label: 'Current',  rate: 0.98, lag: null },
    b1:  { label: '1–30',     rate: 0.95, lag: 0 },
    b2:  { label: '31–60',    rate: 0.85, lag: 14 },
    b3:  { label: '61–90',    rate: 0.60, lag: 28 },
    b4:  { label: '90+',      rate: 0.25, lag: 49 },
  };

  // AP aging as of Fri Nov 13, 2026. Paid in the Thursday run of the week the invoice is due.
  const AP = [
    ['AP01', 'Northbeam Cloud',          'Oct hosting usage',            '2026-11-19', 186.4, false],
    ['AP02', 'Sable & Pike LLP',         'Legal: commercial contracts',  '2026-11-10', 42.75, false],
    ['AP03', 'Tidewater Staffing',       'Contract engineers, Oct',      '2026-11-26', 96.3,  false],
    ['AP04', 'Quillstone Software',      'CRM licences, annual',         '2026-12-01', 74.8,  false],
    ['AP05', 'Meridian Facilities',      'Office services',              '2026-11-30', 18.2,  false],
    ['AP06', 'Copperleaf Marketing',     'Q4 campaign retainer',         '2026-12-04', 61.5,  true],
    ['AP07', 'Northbeam Cloud',          'Nov committed spend',          '2026-12-18', 192.0, false],
    ['AP08', 'Tidewater Staffing',       'Contract engineers, Nov',      '2026-12-10', 98.75, false],
    ['AP09', 'Brightwell Insurance',     'D&O premium instalment',       '2026-12-15', 54.6,  false],
    ['AP10', 'Vantage Data Feeds',       'Market data subscription',     '2026-12-03', 33.9,  false],
    ['AP11', 'Kinsey & Rowe CPAs',       'Audit progress billing',       '2026-12-21', 38.0,  false],
    ['AP12', 'Halcyon Travel',           'Team travel',                  '2026-11-23', 21.45, false],
    ['AP13', 'Fieldstone Telecom',       'Phones and circuits',          '2026-11-25', 12.8,  false],
    ['AP14', 'Orbitline Security',       'SOC 2 tooling',                '2026-12-28', 46.2,  false],
  ].map(([id, vendor, desc, due, amt, hold]) => ({ id, vendor, desc, due, amt, hold }));

  function mondays(from, to) { const out = []; for (let t = D(from); t <= D(to); t += 7 * DAY) out.push(iso(t)); return out; }

  // New billings: monthly subscription invoices on the 1st plus weekly usage/services invoices. Net 30.
  const BILLINGS = [
    ...[['2026-12-01', 1720], ['2027-01-01', 2950], ['2027-02-01', 1790], ['2027-03-01', 1760]]
      .map(([date, amt]) => ({ id: 'SUB-' + date, type: 'Subscription', date, amt, terms: 30 })),
    ...mondays('2026-11-16', '2027-03-22').map((date) => ({ id: 'SVC-' + date, type: 'Usage & services', date, amt: 105, terms: 30 })),
  ];

  // Vendor spend not yet invoiced: weekly run-rate, paid net 30.
  const SPEND = mondays('2026-11-16', '2027-03-22').map((date) => ({ id: 'SPD-' + date, date, amt: 158, terms: 30 }));

  const PAYROLL_DATES = ['2026-11-20', '2026-12-04', '2026-12-18', '2026-12-31', '2027-01-15', '2027-01-29', '2027-02-12', '2027-02-26', '2027-03-12', '2027-03-26'];
  const FIXED = [
    ...PAYROLL_DATES.map((d) => ({ id: 'PAY-' + d, line: 'payroll', date: d, desc: 'Biweekly payroll', amt: null })),
    { id: 'BON-2027-01-29', line: 'bonus', date: '2027-01-29', desc: '2026 annual bonus', amt: 520 },
    ...['2026-12-01', '2026-12-31', '2027-02-01', '2027-03-01'].map((d) => ({ id: 'BEN-' + d, line: 'benefits', date: d, desc: 'Health premiums and 401(k) match', amt: 91 })),
    ...['2026-12-01', '2027-01-04', '2027-02-01', '2027-03-01'].map((d) => ({ id: 'RNT-' + d, line: 'rent', date: d, desc: 'HQ lease', amt: 138 })),
    ...['2026-11-16', '2026-12-15', '2027-01-15', '2027-02-16', '2027-03-15'].map((d) => ({ id: 'DBT-' + d, line: 'debt', date: d, desc: 'Term loan principal and interest', amt: 97.5 })),
    { id: 'TAX-2027-01-20', line: 'taxes', date: '2027-01-20', desc: 'Q4 sales/use and annual franchise tax', amt: 64 },
    { id: 'CPX-2026-12-10', line: 'capex', date: '2026-12-10', desc: 'Laptop refresh', amt: 48 },
    { id: 'CPX-2027-01-12', line: 'capex', date: '2027-01-12', desc: 'Office network upgrade', amt: 36 },
    ...[['2026-11-30', 6.2], ['2026-12-31', 5.8], ['2027-01-29', 5.1], ['2027-02-26', 4.4], ['2027-03-31', 4.0]]
      .map(([d, a]) => ({ id: 'INT-' + d, line: 'otherIn', date: d, desc: 'Money market interest', amt: a })),
  ];

  // Simulated bank activity for six closable weeks (synthetic).
  const BANK = [
    { payF: 1.004, payNote: 'Overtime for year-end support coverage', unplanned: { amt: 22.4, desc: 'Unplanned recruiter placement fee' } },
    { },
    { payF: 1.011, payNote: 'Two new hires added to the Dec 4 cycle', unplanned: { amt: 8.9, desc: 'Unplanned trade-show deposit' } },
    { unplanned: { amt: 15.6, desc: 'Unplanned contractor overage' } },
    { payF: 0.997, payNote: 'One leaver processed mid-cycle', spendF: 1.06, spendNote: 'Hosting usage ran above run-rate' },
    { arNewF: 0.95, arNewNote: 'Two usage customers short-paid', spendF: 0.97, spendNote: 'Contractor hours below plan', unplanned: { amt: 11.2, desc: 'Unplanned legal retainer top-up' } },
  ];
  const TRUE_NEW_RATE = 0.975;

  const zeroLines = () => Object.fromEntries(LINES.map((l) => [l.id, 0]));
  const sumSec = (lines, sec) => LINES.filter((l) => l.sec === sec).reduce((s, l) => s + lines[l.id], 0);

  function rateFor(bucket, a) { return Math.min(1, BUCKETS[bucket].rate * a.collectionRate / 98); }

  function arExpectedWeek(inv, a) {
    if (inv.reWeek != null) return inv.reWeek;
    if (inv.bucket === 'cur') return wkOf(D(inv.due) + a.slip * DAY);
    return wkOf(AS_OF + (BUCKETS[inv.bucket].lag + a.slip) * DAY);
  }

  function newState() {
    return {
      a: { ...SCENARIOS.base },
      scenario: 'base',
      ar: AR.map((x) => ({ ...x, paid: null, reWeek: null, reserved: null })),
      ap: AP.map((x) => ({ ...x, paid: null, reWeek: null })),
      settled: {},
      closed: [],
      openCash: COMPANY.openingCash,
      openRev: COMPANY.revolver.opening,
    };
  }

  function forecast(S) {
    const a = S.a, r = S.closed.length, R = COMPANY.revolver;
    const weeks = [];
    for (let i = 0; i < WINDOW; i++) weeks.push({ k: r + i, date: weekEnd(r + i), lines: zeroLines(), items: [] });
    const add = (k, line, amt, ref) => {
      k = Math.max(k, r);
      const i = k - r;
      if (i < WINDOW) { weeks[i].lines[line] += amt; weeks[i].items.push({ line, amt, ref }); }
    };

    S.ar.forEach((inv) => { if (inv.paid == null && inv.reserved == null) add(arExpectedWeek(inv, a), 'arExisting', inv.amt * rateFor(inv.bucket, a), { kind: 'ar', inv }); });
    BILLINGS.forEach((b) => {
      if (S.settled[b.id]) return;
      add(wkOf(D(b.date) + (b.terms + a.slip) * DAY), 'arNew', b.amt * (1 + a.billChange / 100) * rateFor('cur', a), { kind: 'bill', b });
    });
    S.ap.forEach((inv) => { if (inv.paid == null) add(inv.reWeek != null ? inv.reWeek : wkOf(D(inv.due)), 'apExisting', inv.amt, { kind: 'ap', inv }); });
    SPEND.forEach((s) => { if (!S.settled[s.id]) add(wkOf(D(s.date) + s.terms * DAY), 'apSpend', s.amt, { kind: 'spend', s }); });
    FIXED.forEach((f) => { if (!S.settled[f.id]) add(wkOf(D(f.date)), f.line, f.amt == null ? a.payroll : f.amt, { kind: 'fixed', f }); });

    let cash = S.openCash, rev = S.openRev;
    weeks.forEach((w) => {
      w.lines.revInt = rev * R.rate / 100 / 52;
      w.begin = cash;
      w.receipts = sumSec(w.lines, 'in');
      w.disb = sumSec(w.lines, 'out');
      w.net = w.receipts - w.disb;
      w.pre = cash + w.net;
      w.draw = revolverMove(w.pre, rev, a.minCash);
      rev += w.draw;
      cash = w.pre + w.draw;
      w.end = cash; w.rev = rev; w.avail = R.commitment - rev;
      w.short = w.end < a.minCash - 0.005;
      w.belowPre = w.pre < a.minCash - 0.005;
      w.tie = Math.abs(w.begin + w.receipts - w.disb + w.draw - w.end) < 0.001;
    });
    return { weeks, r };
  }

  function revolverMove(pre, rev, minCash) {
    const R = COMPANY.revolver;
    if (pre < minCash) {
      const need = Math.ceil((minCash - pre) / R.increment - 1e-9) * R.increment;
      return Math.min(need, R.commitment - rev);
    }
    if (rev > 0 && pre > minCash + R.repayBuffer) {
      return -Math.min(rev, Math.floor((pre - minCash - R.repayBuffer) / R.increment) * R.increment);
    }
    return 0;
  }

  // Close the first open week: load its simulated bank activity, freeze forecast vs actual, roll the window.
  function closeWeek(S) {
    const c = S.closed.length;
    if (c >= BANK.length) return null;
    const bank = BANK[c];
    const F = forecast(S);
    const w = F.weeks[0], k = w.k;
    const act = zeroLines();
    const notes = {};
    const late = [], early = [], reserved = [];

    S.ar.forEach((inv) => {
      if (inv.paid != null || inv.reserved != null) return;
      const fk = Math.max(arExpectedWeek(inv, S.a), k);
      const tk = inv.truePay ? wkOf(D(inv.truePay)) : Infinity;
      if (tk <= k) { act.arExisting += inv.amt; inv.paid = k; if (fk > k) early.push(inv); }
      else if (fk === k) {
        // Collections team follow-up: a confirmed date moves the invoice; no commitment removes it from the forecast.
        if (inv.truePay) { inv.reWeek = tk; late.push(inv); }
        else { inv.reserved = k; reserved.push(inv); }
      }
    });
    const nm = (l) => l.map((i) => `${i.cust} ${fmtK(i.amt)}`).join(', ');
    const arN = [];
    if (late.length) arN.push('Slipped, customer confirmed a new date: ' + late.map((i) => `${i.cust} ${fmtK(i.amt)} (week ending ${fmtD(weekEnd(i.reWeek))})`).join(', '));
    if (reserved.length) arN.push('No payment commitment, removed from forecast for bad-debt review: ' + nm(reserved));
    if (early.length) arN.push('Paid early: ' + nm(early));
    if (arN.length) notes.arExisting = arN.join('. ');

    const holds = [];
    w.items.forEach(({ line, amt, ref }) => {
      if (ref.kind === 'bill') { S.settled[ref.b.id] = true; act.arNew += ref.b.amt * TRUE_NEW_RATE * (bank.arNewF || 1); }
      else if (ref.kind === 'spend') { S.settled[ref.s.id] = true; act.apSpend += amt * (bank.spendF || 1); }
      else if (ref.kind === 'fixed') {
        S.settled[ref.f.id] = true;
        act[line] += line === 'payroll' ? COMPANY.basePayroll * (bank.payF || 1) : amt;
      } else if (ref.kind === 'ap') {
        if (ref.inv.hold && ref.inv.reWeek == null) { ref.inv.reWeek = k + 2; holds.push(ref.inv); }
        else { act.apExisting += amt; ref.inv.paid = k; }
      }
    });
    const apN = [];
    if (holds.length) apN.push(holds.map((i) => `${i.vendor} ${fmtK(i.amt)} on hold pending a billing dispute`).join('; '));
    if (bank.unplanned) { act.apExisting += bank.unplanned.amt; apN.push(`${bank.unplanned.desc} ${fmtK(bank.unplanned.amt)}`); }
    if (apN.length) notes.apExisting = apN.join('. ');
    if (bank.payNote && w.lines.payroll) notes.payroll = bank.payNote;
    if (w.lines.arNew) notes.arNew = bank.arNewNote || 'Collected at about 97.5% of billings';
    if (bank.spendNote && w.lines.apSpend) notes.apSpend = bank.spendNote;

    act.revInt = S.openRev * COMPANY.revolver.rate / 100 / 52;
    const receipts = sumSec(act, 'in'), disb = sumSec(act, 'out');
    const pre = S.openCash + receipts - disb;
    const draw = revolverMove(pre, S.openRev, S.a.minCash);
    const rev = S.openRev + draw;
    const rec = {
      k, date: weekEnd(k), fc: { ...w.lines }, act, notes,
      fcReceipts: w.receipts, fcDisb: w.disb, fcDraw: w.draw, fcEnd: w.end,
      begin: S.openCash, receipts, disb, draw, endCash: pre + draw, rev,
    };
    S.closed.push(rec);
    S.openCash = rec.endCash; S.openRev = rev;
    return rec;
  }

  function fmtD(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function fmtK(v) { return '$' + Math.round(v).toLocaleString('en-US') + 'k'; }

  const API = {
    DAY, D, iso, START, AS_OF, wkOf, weekEnd, WINDOW,
    COMPANY, SCENARIOS, LINES, AR, AP, BUCKETS, BILLINGS, SPEND, FIXED, BANK,
    newState, forecast, closeWeek, rateFor, arExpectedWeek, sumSec, fmtK,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CashEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
