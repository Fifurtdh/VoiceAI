import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { EntryDirection, LedgerEntry } from '../types/khata';
import {
  fetchAuditLogsApi,
  reverseEntryApi,
  searchTransactionsSmartApi,
  type AuditLogItem,
  type SmartTransactionSearchResponse,
} from '../utils/api';
import { downloadBusinessReportCsv } from '../utils/exportReport';
import { formatINRNumber, formatShortDate } from '../utils/format';

interface HistoryScreenProps {
  shopName: string;
  entries: LedgerEntry[];
  onEditEntry: (entry: LedgerEntry) => void;
  onUndoEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onEntryReversed: (
    reversedEntry: LedgerEntry,
    replacementEntry: LedgerEntry | null
  ) => void;
}

const SMART_SEARCH_EXAMPLES = [
  "Show yesterday's payments",
  'Find transactions above 1,000 rupees',
  'Find all credit transactions this month',
  'Last 5 transactions',
];

/**
 * Feature 5 & 6: Khata History Screen
 * - Natural-language Smart Transaction Search powered by GET /api/entries/search
 * - Direction & Date Range filters + CSV Export
 * - Auditable Reversal / Correction workflow (never silently erases ledger history)
 * - Transparent Audit Log tab showing every financial change
 */
export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  shopName,
  entries,
  onEditEntry,
  onUndoEntry,
  onDeleteEntry,
  onEntryReversed,
}) => {
  const [view, setView] = useState<'transactions' | 'audit'>('transactions');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'all' | EntryDirection>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchResult, setSearchResult] =
    useState<SmartTransactionSearchResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Auditable Reversal Modal state
  const [reversingEntry, setReversingEntry] = useState<LedgerEntry | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [replacementAmount, setReplacementAmount] = useState('');
  const [reverseBusy, setReverseBusy] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchTransactionsSmartApi({
        q: query,
        direction,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setSearchResult(res);
    } catch {
      setSearchResult(null);
    } finally {
      setLoading(false);
    }
  }, [direction, endDate, query, startDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [runSearch, entries]);

  useEffect(() => {
    if (view !== 'audit') return;
    setLoading(true);
    fetchAuditLogsApi(50)
      .then((res) => setAuditLogs(res.logs))
      .catch(() => setAuditLogs([]))
      .finally(() => setLoading(false));
  }, [view, entries]);

  const displayedEntries = searchResult?.entries ?? entries;

  const handleExportCsv = () => {
    downloadBusinessReportCsv({
      shopName,
      period: 'history',
      startDate: startDate || 'all',
      endDate: endDate || new Date().toISOString().slice(0, 10),
      transactions: displayedEntries
        .filter((e) => !e.undone)
        .map((e) => ({
          date: e.date,
          createdAt: e.createdAt,
          customerName: e.customerName,
          direction: e.direction,
          amount: e.amount,
          note: e.note,
        })),
    });
  };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingEntry) return;
    setReverseBusy(true);
    setReverseError(null);
    try {
      const repNum = replacementAmount.trim()
        ? Math.round(Number(replacementAmount))
        : undefined;
      if (repNum !== undefined && (!Number.isFinite(repNum) || repNum <= 0)) {
        setReverseError('Replacement amount must be greater than zero.');
        setReverseBusy(false);
        return;
      }
      const res = await reverseEntryApi(reversingEntry.id, {
        reason: reverseReason.trim() || 'Shopkeeper correction',
        replacementAmount: repNum,
      });
      onEntryReversed(res.reversedEntry, res.replacementEntry);
      setReversingEntry(null);
      setReverseReason('');
      setReplacementAmount('');
    } catch (err) {
      setReverseError(
        err instanceof Error ? err.message : 'Could not reverse transaction.'
      );
    } finally {
      setReverseBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)]">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Khata History
            </h1>
            <p className="text-sm text-[var(--khata-text-secondary)]">
              Smart natural-language transaction search &amp; auditable correction trail
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="history-tab-tx"
              onClick={() => setView('transactions')}
              className={`min-h-[42px] px-4 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 ${
                view === 'transactions'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Transactions</span>
            </button>
            <button
              type="button"
              data-testid="history-tab-audit"
              onClick={() => setView('audit')}
              className={`min-h-[42px] px-4 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 ${
                view === 'audit'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit Log</span>
            </button>
          </div>
        </header>

        {view === 'transactions' ? (
          <>
            {/* Smart Search & Filter Panel */}
            <section className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--khata-text-secondary)] pointer-events-none" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Try: "Show yesterday’s payments" or "above 1,000 rupees"'
                    aria-label="Smart transaction search"
                    data-testid="smart-tx-search-input"
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                  />
                </div>

                <button
                  type="button"
                  data-testid="history-export-csv-btn"
                  onClick={handleExportCsv}
                  className="min-h-[46px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:border-[var(--khata-accent)]"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Example smart queries */}
              <div className="flex flex-wrap gap-1.5">
                {SMART_SEARCH_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setQuery(ex)}
                    className="px-2.5 py-1 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-medium text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {/* Manual filters */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--khata-border)]">
                {(['all', 'credit', 'payment'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setDirection(dir)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold ${
                      direction === dir
                        ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                        : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                    }`}
                  >
                    {dir === 'all' ? 'All' : dir === 'credit' ? 'Udhaar' : 'Payments'}
                  </button>
                ))}

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="From date"
                  className="min-h-[36px] px-2.5 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs"
                />
                <span className="text-xs text-[var(--khata-text-secondary)]">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="To date"
                  className="min-h-[36px] px-2.5 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs"
                />

                {(query || direction !== 'all' || startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setDirection('all');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-xs font-semibold underline text-[var(--khata-text-secondary)] ml-1"
                  >
                    Reset
                  </button>
                )}
              </div>

              {searchResult && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 text-[var(--khata-text-secondary)]">
                  <span data-testid="smart-tx-filter-summary">
                    {searchResult.appliedFilterSummary}
                  </span>
                  <span className="tabular-nums font-bold space-x-3">
                    <span style={{ color: 'var(--khata-credit)' }}>
                      Udhaar: ₹{formatINRNumber(searchResult.totalCredit)}
                    </span>
                    <span style={{ color: 'var(--khata-payment)' }}>
                      Payments: ₹{formatINRNumber(searchResult.totalPayments)}
                    </span>
                  </span>
                </div>
              )}
            </section>

            {/* Transaction Rows */}
            {loading && !searchResult ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--khata-accent)]" />
              </div>
            ) : displayedEntries.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                No transactions match your search or filter.
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="history-entries-list">
                {displayedEntries.map((entry) => {
                  const isPayment = entry.direction === 'payment';
                  const timeStr = new Date(entry.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-[18px] bg-[var(--khata-surface)] border border-[var(--khata-border)] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        entry.undone ? 'opacity-55' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: isPayment
                              ? 'var(--khata-lime-card)'
                              : '#FF6B5E',
                            color: '#0B0B0B',
                          }}
                        >
                          {isPayment ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`font-bold text-sm sm:text-base truncate ${
                              entry.undone ? 'line-through' : ''
                            }`}
                          >
                            {entry.customerName}
                            {entry.undone ? ' (Reversed/Undone)' : ''}
                            {entry.reversalOfId ? ' · Correction Entry' : ''}
                          </p>
                          <p className="text-xs text-[var(--khata-text-secondary)] truncate">
                            {isPayment ? 'Payment Received' : 'Credit (Udhaar)'} ·{' '}
                            {formatShortDate(entry.date)} · {timeStr}
                            {entry.note ? ` · ${entry.note}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <span
                          className={`text-lg font-extrabold tabular-nums mr-1 ${
                            entry.undone ? 'line-through' : ''
                          }`}
                          style={{
                            color: isPayment
                              ? 'var(--khata-payment)'
                              : 'var(--khata-credit)',
                          }}
                        >
                          {isPayment ? '+' : '-'}₹{formatINRNumber(entry.amount)}
                        </span>

                        <div className="flex items-center gap-1">
                          {!entry.undone && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingEntry(entry);
                                setReplacementAmount(String(entry.amount));
                                setReverseReason('');
                                setReverseError(null);
                              }}
                              data-testid={`reverse-entry-${entry.id}`}
                              className="min-h-[36px] px-2.5 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-semibold hover:border-[var(--khata-accent)]"
                            >
                              Reverse / Fix
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditEntry(entry)}
                            aria-label="Edit entry"
                            className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--khata-surface-elevated)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onUndoEntry(entry.id)}
                            aria-label={entry.undone ? 'Restore entry' : 'Undo entry'}
                            className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--khata-surface-elevated)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.id)}
                            aria-label="Delete entry"
                            className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[#FF6B5E]/15 flex items-center justify-center text-[#FF6B5E]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Audit Log Tab */
          <section className="space-y-2.5" data-testid="audit-log-list">
            {loading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--khata-accent)]" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                No audit log events recorded yet. All future entries, edits, reversals, and reminders will appear here.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-[18px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-bold capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-[var(--khata-text-secondary)]">
                      {log.entityType} · {log.entityId}
                      {log.reason ? ` · ${log.reason}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--khata-text-secondary)] tabular-nums shrink-0">
                    {new Date(log.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            )}
          </section>
        )}
      </main>

      {/* Auditable Reversal / Correction Modal */}
      {reversingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reverse or correct transaction"
          data-testid="reverse-entry-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleConfirmReverse}
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 space-y-4 shadow-2xl animate-sheet-up"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Auditable Reversal / Fix</h2>
              <button
                type="button"
                onClick={() => setReversingEntry(null)}
                aria-label="Close"
                className="min-h-[40px] min-w-[40px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] p-3.5 text-sm">
              <p className="font-bold">{reversingEntry.customerName}</p>
              <p className="text-xs text-[var(--khata-text-secondary)]">
                Original:{' '}
                <strong className="tabular-nums text-[var(--khata-text)]">
                  ₹{formatINRNumber(reversingEntry.amount)}
                </strong>{' '}
                ({reversingEntry.direction === 'credit' ? 'Udhaar' : 'Payment'}) on{' '}
                {reversingEntry.date}
              </p>
            </div>

            {reverseError && (
              <p className="text-xs font-semibold text-[#FF6B5E]">{reverseError}</p>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="reverse-replacement-amount"
                  className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
                >
                  Corrected Amount (leave empty to only cancel/reverse)
                </label>
                <input
                  id="reverse-replacement-amount"
                  type="number"
                  min={1}
                  value={replacementAmount}
                  onChange={(e) => setReplacementAmount(e.target.value)}
                  placeholder="Leave blank to just cancel"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm font-bold tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="reverse-reason"
                  className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
                >
                  Reason for Audit Trail
                </label>
                <input
                  id="reverse-reason"
                  type="text"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Entered 500 instead of 450"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm"
                />
              </div>
            </div>

            <p className="text-[11px] text-[var(--khata-text-secondary)]">
              The original transaction stays marked as Reversed in your audit trail — never silently deleted.
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setReversingEntry(null)}
                className="flex-1 min-h-[46px] rounded-xl bg-[var(--khata-surface-elevated)] font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reverseBusy}
                data-testid="confirm-reverse-btn"
                className="flex-1 min-h-[46px] rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm"
              >
                {reverseBusy
                  ? 'Saving...'
                  : replacementAmount.trim()
                  ? 'Reverse & Save Fix'
                  : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
