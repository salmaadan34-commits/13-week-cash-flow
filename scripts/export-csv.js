// Writes the synthetic sample data in src/engine.js to data/*.csv so it can be reviewed in Excel.
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const write = (name, cols, rows) => {
  fs.writeFileSync(path.join(dir, name), [cols.join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n');
  console.log('Wrote data/' + name, rows.length, 'rows');
};
const usd = (k) => Math.round(k * 1000);

write('ar_aging.csv', ['customer', 'invoice', 'due_date', 'days_past_due', 'bucket', 'balance_usd', 'base_collection_rate'],
  E.AR.map((a) => [a.cust, a.inv, a.due, Math.max(0, a.dpd), E.BUCKETS[a.bucket].label, usd(a.amt), E.BUCKETS[a.bucket].rate]));
write('ap_aging.csv', ['vendor', 'description', 'due_date', 'amount_usd', 'payment_hold'],
  E.AP.map((a) => [a.vendor, a.desc, a.due, usd(a.amt), a.hold ? 'yes' : 'no']));
write('billings_plan.csv', ['billing_date', 'type', 'amount_usd', 'terms_days'],
  E.BILLINGS.map((b) => [b.date, b.type, usd(b.amt), b.terms]));
write('vendor_spend_plan.csv', ['incurred_date', 'amount_usd', 'terms_days'],
  E.SPEND.map((s) => [s.date, usd(s.amt), s.terms]));
const label = Object.fromEntries(E.LINES.map((l) => [l.id, l.label]));
write('fixed_payments.csv', ['date', 'forecast_line', 'description', 'amount_usd'],
  E.FIXED.map((f) => [f.date, label[f.line], f.desc, f.amt == null ? usd(E.COMPANY.basePayroll) : usd(f.amt)]));
write('scenarios.csv', ['scenario', 'collection_rate_pct', 'slippage_days', 'new_billings_vs_plan_pct', 'payroll_per_cycle_usd', 'minimum_cash_usd'],
  Object.values(E.SCENARIOS).map((s) => [s.label, s.collectionRate, s.slip, s.billChange, usd(s.payroll), usd(s.minCash)]));
write('company.csv', ['item', 'value'], [
  ['company', E.COMPANY.name], ['as_of_date', E.COMPANY.asOf], ['opening_cash_usd', usd(E.COMPANY.openingCash)],
  ['revolver_commitment_usd', usd(E.COMPANY.revolver.commitment)], ['revolver_rate_pct', E.COMPANY.revolver.rate],
  ['revolver_increment_usd', usd(E.COMPANY.revolver.increment)], ['revolver_repay_buffer_usd', usd(E.COMPANY.revolver.repayBuffer)],
]);
