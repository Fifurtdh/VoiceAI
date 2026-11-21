import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitConfirmedEntry,
  computeCustomerBalance,
  computeDashboardTotals,
  computeLedgerReport,
  createSampleSeedData,
  deleteLedgerEntry,
  filterLedgerEntries,
  toggleUndoLedgerEntry,
  updateLedgerEntry,
} from './ledgerLogic';

test('seed data includes 6 synthetic customers with two named Ramesh', () => {
  const seed = createSampleSeedData(new Date(2026, 10, 21));
  assert.equal(seed.customers.length, 6);
  const rameshes = seed.customers.filter((c) => c.name.toLowerCase().includes('ramesh'));
  assert.equal(rameshes.length, 2);
});

test('computeCustomerBalance and computeDashboardTotals calculate accurately', () => {
  const ref = new Date(2026, 10, 21);
  const seed = createSampleSeedData(ref);
  // Ramesh Patel has +340 credit
  assert.equal(computeCustomerBalance('cust-ramesh-p', seed.entries), 340);
  // Sita Devi has +650 credit and -200 payment = 450
  assert.equal(computeCustomerBalance('cust-sita', seed.entries), 450);

  const totals = computeDashboardTotals(seed.customers, seed.entries, '2026-11-21');
  assert.equal(totals.todayCredit, 340);
  assert.equal(totals.todayPayments, 200);
  assert.equal(totals.totalOutstanding, 340 + 580 + 450 + 1250 + (790 - 420) + 185);
});

test('commitConfirmedEntry creates new customer with remindersOptIn=false by default', () => {
  const state = { customers: [], entries: [] };
  const result = commitConfirmedEntry(state, {
    customerName: 'Vikram Singh',
    amount: 500,
    direction: 'credit',
    date: '2026-11-21',
  });
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].remindersOptIn, false);
  assert.equal(result.entries.length, 1);
  assert.equal(computeCustomerBalance(result.customers[0].id, result.entries), 500);
});

test('updateLedgerEntry, toggleUndoLedgerEntry, and deleteLedgerEntry mutate balances cleanly', () => {
  const state = createSampleSeedData(new Date(2026, 10, 21));
  const updated = updateLedgerEntry(state.entries, 'ent-1', { amount: 430 });
  assert.equal(computeCustomerBalance('cust-ramesh-p', updated), 430);

  const undone = toggleUndoLedgerEntry(updated, 'ent-1');
  assert.equal(computeCustomerBalance('cust-ramesh-p', undone), 0);

  const restored = toggleUndoLedgerEntry(undone, 'ent-1');
  assert.equal(computeCustomerBalance('cust-ramesh-p', restored), 430);

  const deleted = deleteLedgerEntry(restored, 'ent-1');
  assert.equal(deleted.length, state.entries.length - 1);
  assert.equal(computeCustomerBalance('cust-ramesh-p', deleted), 0);
});

test('filterLedgerEntries and computeLedgerReport aggregate daily, weekly, and custom ranges accurately', () => {
  const ref = new Date(2026, 10, 21);
  const seed = createSampleSeedData(ref);

  const paymentsOnly = filterLedgerEntries(seed.entries, {
    direction: 'payment',
    search: 'sita',
  });
  assert.equal(paymentsOnly.length, 1);
  assert.equal(paymentsOnly[0].amount, 200);

  const daily = computeLedgerReport(seed.customers, seed.entries, { period: 'daily' }, ref);
  assert.equal(daily.totalCredit, 340);
  assert.equal(daily.totalPayments, 200);
  assert.equal(daily.entryCount, 2);

  const weekly = computeLedgerReport(seed.customers, seed.entries, { period: 'weekly' }, ref);
  assert.equal(weekly.totalCredit, 340 + 1250 + 580 + 650 + 790 + 185);
  assert.equal(weekly.totalPayments, 200 + 420);
  assert.equal(weekly.entryCount, 8);
});
