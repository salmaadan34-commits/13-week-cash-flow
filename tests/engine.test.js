// Run with: npm test   (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

test('every forecast week ties: begin + receipts - disbursements + revolver = end', () => {
  for (const sc of Object.values(E.SCENARIOS)) {
    const S = E.newState(); Object.assign(S.a, sc);
    E.forecast(S).weeks.forEach((w) => assert.ok(w.tie, `week ${w.k} does not tie`));
  }
});

test('base case stays above minimum cash without the revolver', () => {
  const F = E.forecast(E.newState());
  assert.equal(F.weeks.length, 13);
  assert.ok(F.weeks.every((w) => w.end >= 1500 && w.rev === 0));
});

test('downside case draws the revolver to restore minimum cash', () => {
  const S = E.newState(); Object.assign(S.a, E.SCENARIOS.downside);
  const F = E.forecast(S);
  assert.ok(F.weeks.some((w) => w.draw > 0));
  assert.ok(F.weeks.every((w) => w.end >= S.a.minCash - 0.01 || w.rev === E.COMPANY.revolver.commitment));
  assert.ok(F.weeks.every((w) => w.draw % E.COMPANY.revolver.increment === 0));
});

test('closing a week rolls the window and carries actual cash forward', () => {
  const S = E.newState();
  const rec = E.closeWeek(S);
  assert.equal(S.closed.length, 1);
  assert.equal(S.openCash, rec.endCash);
  const F = E.forecast(S);
  assert.equal(F.weeks[0].k, 1);
  assert.equal(F.weeks[0].begin, rec.endCash);
  assert.match(rec.notes.arExisting, /Lumen Street Bank/);
});

test('scheduled items are never counted twice after roll-forward', () => {
  const S = E.newState();
  for (let i = 0; i < 6; i++) E.closeWeek(S);
  const F = E.forecast(S);
  const payrollWeeks = F.weeks.filter((w) => w.lines.payroll > 0).length;
  assert.equal(payrollWeeks, 7); // biweekly over 13 weeks
  assert.equal(E.closeWeek(S), null); // sample bank feed covers six weeks
});
