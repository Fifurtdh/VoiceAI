import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { Customer, EntryDirection, LedgerEntry } from '../types/khata';
import {
  fetchCustomerIntelligenceApi,
  fetchCustomerStatementApi,
  type CustomerIntelligenceItem,
  type CustomerIntelligenceResponse,
  type CustomerSegment,
  type CustomerStatementData,
} from '../utils/api';
import {
  downloadCustomerStatementCsv,
  downloadCustomerStatementPdf,
} from '../utils/exportReport';
import { formatINRNumber, formatShortDate, getPhoneSuffix } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';
import type { CustomerSummary } from '../utils/ledgerLogic';
import { CornerLines } from './CornerLines';
import {
  ConfirmDeleteCustomerModal,
  CustomerModal,
} from './CustomerModal';
import { ReminderSheet } from './ReminderSheet';

interface LedgerScreenProps {
  summaries: CustomerSummary[];
  entries: LedgerEntry[];
  shopName: string;
  t: TranslationStrings;
  onBack: () => void;
  onToggleReminderOptIn: (customerId: string) => void;
  onCreateCustomer: (payload: {
    name: string;
    phone: string;
    tag: string;
    remindersOptIn: boolean;
  }) => Promise<void>;
  onUpdateCustomer: (
    customerId: string,
    payload: {
      name: string;
      phone: string;
      tag: string;
      remindersOptIn: boolean;
    }
  ) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onAddEntryForCustomer: (
    customer: Customer,
    direction: EntryDirection
  ) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onUndoEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

const INSIGHT_FILTERS: Array<{
  id: 'all' | CustomerSegment;
  label: string;
}> = [
  { id: 'all', label: 'All Customers' },
  { id: 'highest_outstanding', label: 'Highest Pending' },
  { id: 'no_recent_payment', label: 'No Payment 30+d' },
  { id: 'regular_payer', label: 'Regular Payers' },
  { id: 'increasing_balance', label: 'Increasing Balance' },
  { id: 'cleared', label: 'Cleared' },
];

const SMART_CUSTOMER_EXAMPLES = [
  'Show customers with more than 500 rupees pending',
  'Who has not paid for 30 days?',
  'Show customers added this month',
];

/**
 * Feature 4: Customers & Customer Intelligence Screen
 * - Natural-language Smart Customer Search powered by GET /api/customers/intelligence
 * - Clickable Customer Intelligence insight filters
 * - Full Customer Profile view backed by GET /api/customers/:id/statement with:
 *   Total Credit, Total Payments, Current Outstanding, Running Balance Ledger with timestamps,
 *   date/search filters, and Downloadable Statement (PDF + CSV)
 */
export const LedgerScreen: React.FC<LedgerScreenProps> = ({
  summaries,
  entries,
  shopName,
  t,
  onBack,
  onToggleReminderOptIn,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onAddEntryForCustomer,
  onEditEntry,
  onUndoEntry,
  onDeleteEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | CustomerSegment>('all');
  const [intelData, setIntelData] = useState<CustomerIntelligenceResponse | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [statement, setStatement] = useState<CustomerStatementData | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [stmtStartDate, setStmtStartDate] = useState('');
  const [stmtEndDate, setStmtEndDate] = useState('');
  const [stmtSearch, setStmtSearch] = useState('');

  const [reminderTarget, setReminderTarget] = useState<{
    customer: Customer;
    balance: number;
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const loadIntelligence = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetchCustomerIntelligenceApi(searchQuery);
      setIntelData(res);
    } catch {
      setIntelData(null);
    } finally {
      setLoadingList(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadIntelligence();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [loadIntelligence, summaries.length, entries.length]);

  const loadStatement = useCallback(async () => {
    if (!selectedCustomerId) {
      setStatement(null);
      return;
    }
    setLoadingStatement(true);
    try {
      const res = await fetchCustomerStatementApi(selectedCustomerId, {
        startDate: stmtStartDate || undefined,
        endDate: stmtEndDate || undefined,
        search: stmtSearch || undefined,
      });
      setStatement(res.statement);
    } catch {
      setStatement(null);
    } finally {
      setLoadingStatement(false);
    }
  }, [selectedCustomerId, stmtEndDate, stmtSearch, stmtStartDate]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement, entries, summaries]);

  const visibleCustomers: CustomerIntelligenceItem[] = (
    intelData?.customers ?? []
  ).filter((c) => {
    if (segmentFilter === 'all') return true;
    return c.segments.includes(segmentFilter);
  });

  const handleBack = () => {
    if (selectedCustomerId) {
      setSelectedCustomerId(null);
    } else {
      onBack();
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] overflow-x-hidden">
      <CornerLines className="absolute top-0 right-0 w-56 h-40 text-[var(--khata-text)]" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 space-y-5">
        {/* Top Bar */}
        <header className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedCustomerId && (
              <button
                type="button"
                onClick={handleBack}
                aria-label={t.back}
                className="lg:hidden min-h-[42px] min-w-[42px] rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold truncate">
                {selectedCustomerId && statement
                  ? statement.customer.name
                  : 'Customers & Insights'}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--khata-text-secondary)] truncate">
                {intelData
                  ? `${intelData.insights.totalCustomers} customers · ₹${formatINRNumber(intelData.insights.totalOutstanding)} pending`
                  : t.ledger}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            data-testid="add-customer-btn"
            className="min-h-[42px] px-3 sm:px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-sm font-bold inline-flex items-center gap-1.5 hover:opacity-95 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              Add<span className="hidden sm:inline"> Customer</span>
            </span>
          </button>
        </header>

        {/* Customer Insights Filter Strip */}
        <section className="flex flex-wrap items-center gap-2">
          {INSIGHT_FILTERS.map((f) => {
            const count =
              f.id === 'all'
                ? intelData?.insights.totalCustomers ?? summaries.length
                : f.id === 'highest_outstanding'
                ? intelData?.insights.highestOutstanding.length ?? 0
                : f.id === 'no_recent_payment'
                ? intelData?.insights.noRecentPayments.length ?? 0
                : f.id === 'regular_payer'
                ? intelData?.insights.regularPayers.length ?? 0
                : f.id === 'increasing_balance'
                ? intelData?.insights.increasingBalances.length ?? 0
                : intelData?.insights.clearedBalances.length ?? 0;

            return (
              <button
                key={f.id}
                type="button"
                data-testid={`customer-segment-${f.id}`}
                onClick={() => setSegmentFilter(f.id)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                  segmentFilter === f.id
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                }`}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Customer List Column */}
          <section
            className={`lg:col-span-5 space-y-3.5 ${
              selectedCustomerId ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Natural-Language Smart Customer Search */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--khata-text-secondary)] pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search or ask: "more than 2,000 pending", "not paid for 30 days"'
                  aria-label="Smart customer search"
                  data-testid="customer-search-input"
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SMART_CUSTOMER_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setSegmentFilter('all');
                      setSearchQuery(ex);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[11px] font-medium text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {intelData && searchQuery.trim() && (
                <p
                  data-testid="customer-smart-filter-summary"
                  className="text-xs font-medium text-[var(--khata-text-secondary)]"
                >
                  {intelData.appliedFilterSummary}
                </p>
              )}
            </div>

            {loadingList && !intelData ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--khata-accent)]" />
              </div>
            ) : visibleCustomers.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 text-center text-[var(--khata-text-secondary)] space-y-3">
                <p className="text-sm">{t.noCustomersFound}</p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="min-h-[40px] px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-xs inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Customer</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="customer-list">
                {visibleCustomers.map((c) => {
                  const isSelected = selectedCustomerId === c.customerId;
                  const owesMoney = c.outstanding > 0;
                  return (
                    <button
                      key={c.customerId}
                      type="button"
                      onClick={() => setSelectedCustomerId(c.customerId)}
                      className={`w-full rounded-[18px] bg-[var(--khata-surface)] border p-4 flex items-center justify-between gap-3 text-left transition-all ${
                        isSelected
                          ? 'border-[var(--khata-accent)] ring-1 ring-[var(--khata-accent)]'
                          : 'border-[var(--khata-border)] hover:border-[var(--khata-text-secondary)]/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                          style={{
                            backgroundColor: c.remindersOptIn
                              ? 'var(--khata-pink)'
                              : 'var(--khata-lavender)',
                            color: '#0B0B0B',
                          }}
                        >
                          {c.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="font-bold text-sm sm:text-base truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-[var(--khata-text-secondary)] truncate">
                            {c.tag ? `${c.tag} · ` : ''}
                            {c.lastTransactionDate
                              ? `Last: ${formatShortDate(c.lastTransactionDate)}`
                              : c.phone
                              ? `••${getPhoneSuffix(c.phone)}`
                              : 'No activity'}
                            {c.daysSinceLastPayment !== null &&
                            c.daysSinceLastPayment >= 30 &&
                            owesMoney
                              ? ` · ${c.daysSinceLastPayment}d overdue`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p
                            className="text-base sm:text-lg font-extrabold tabular-nums"
                            style={{
                              color: owesMoney
                                ? 'var(--khata-credit)'
                                : 'var(--khata-payment)',
                            }}
                          >
                            ₹{formatINRNumber(Math.abs(c.outstanding))}
                          </p>
                          <p className="text-[11px] text-[var(--khata-text-secondary)]">
                            {c.outstanding > 0
                              ? 'Pending'
                              : c.outstanding < 0
                              ? 'Advance'
                              : 'Cleared'}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--khata-text-secondary)]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Enhanced Customer Intelligence Detail Column */}
          <section
            className={`lg:col-span-7 ${
              selectedCustomerId ? 'block' : 'hidden lg:block'
            }`}
          >
            {!selectedCustomerId ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                <p className="text-sm sm:text-base">
                  Select a customer to inspect their complete running-balance statement, total credit vs. payments, monthly activity, and downloadable PDF/CSV statement.
                </p>
              </div>
            ) : loadingStatement && !statement ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--khata-accent)]" />
              </div>
            ) : statement ? (
              <div data-testid="customer-detail" className="space-y-5">
                {/* Profile Header & Totals */}
                <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--khata-text-secondary)]">
                        {statement.summary.outstanding > 0
                          ? t.outstandingBalance
                          : statement.summary.outstanding < 0
                          ? t.advance
                          : t.settled}
                      </p>
                      <p
                        data-testid="customer-total-balance"
                        className="text-3xl sm:text-4xl font-extrabold tabular-nums mt-0.5"
                        style={{
                          color:
                            statement.summary.outstanding > 0
                              ? 'var(--khata-credit)'
                              : 'var(--khata-payment)',
                        }}
                      >
                        ₹{formatINRNumber(Math.abs(statement.summary.outstanding))}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--khata-text-secondary)] mt-1">
                        {statement.customer.phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="w-3.5 h-3.5" />
                            {statement.customer.phone}
                          </span>
                        )}
                        {statement.customer.tag && (
                          <span>{statement.customer.tag}</span>
                        )}
                        {statement.summary.lastTransactionDate && (
                          <span>
                            Last entry:{' '}
                            {formatShortDate(statement.summary.lastTransactionDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingCustomer(statement.customer)}
                        aria-label={`Edit ${statement.customer.name}`}
                        data-testid="edit-customer-btn"
                        className="min-h-[40px] min-w-[40px] rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] flex items-center justify-center"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCustomer(statement.customer)}
                        aria-label={`Delete ${statement.customer.name}`}
                        data-testid="delete-customer-btn"
                        className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FF6B5E]/15 text-[#FF6B5E] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Customer Summary Metrics */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-[var(--khata-surface-elevated)] p-3">
                      <p className="text-[11px] text-[var(--khata-text-secondary)]">
                        Total Credit
                      </p>
                      <p
                        className="text-base font-extrabold tabular-nums mt-0.5"
                        style={{ color: 'var(--khata-credit)' }}
                      >
                        ₹{formatINRNumber(statement.summary.totalCredit)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[var(--khata-surface-elevated)] p-3">
                      <p className="text-[11px] text-[var(--khata-text-secondary)]">
                        Total Paid
                      </p>
                      <p
                        className="text-base font-extrabold tabular-nums mt-0.5"
                        style={{ color: 'var(--khata-payment)' }}
                      >
                        ₹{formatINRNumber(statement.summary.totalPayments)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[var(--khata-surface-elevated)] p-3">
                      <p className="text-[11px] text-[var(--khata-text-secondary)]">
                        Transactions
                      </p>
                      <p className="text-base font-extrabold tabular-nums mt-0.5">
                        {statement.summary.transactionCount}
                      </p>
                    </div>
                  </div>

                  {/* Quick Entry & Statement Download Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      data-testid="customer-add-udhaar-btn"
                      onClick={() =>
                        onAddEntryForCustomer(statement.customer, 'credit')
                      }
                      className="min-h-[42px] px-3 rounded-xl bg-[#FF6B5E] text-[#0B0B0B] font-bold text-xs inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Udhaar</span>
                    </button>

                    <button
                      type="button"
                      data-testid="customer-add-payment-btn"
                      onClick={() =>
                        onAddEntryForCustomer(statement.customer, 'payment')
                      }
                      className="min-h-[42px] px-3 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-xs inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Payment</span>
                    </button>

                    <button
                      type="button"
                      data-testid="customer-statement-pdf-btn"
                      onClick={() =>
                        downloadCustomerStatementPdf({
                          shopName,
                          customerName: statement.customer.name,
                          phone: statement.customer.phone,
                          outstanding: statement.summary.outstanding,
                          totalCredit: statement.summary.totalCredit,
                          totalPayments: statement.summary.totalPayments,
                          entries: statement.entries,
                        })
                      }
                      className="min-h-[42px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] font-semibold text-xs inline-flex items-center justify-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF Stmt</span>
                    </button>

                    <button
                      type="button"
                      data-testid="customer-statement-csv-btn"
                      onClick={() =>
                        downloadCustomerStatementCsv({
                          shopName,
                          customerName: statement.customer.name,
                          entries: statement.entries,
                        })
                      }
                      className="min-h-[42px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] font-semibold text-xs inline-flex items-center justify-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV Stmt</span>
                    </button>
                  </div>

                  {/* Opt-In Toggle + Quick Reminder */}
                  <div className="pt-4 border-t border-[var(--khata-border)] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Bell className="w-4 h-4 text-[var(--khata-text-secondary)]" />
                      <span className="font-semibold">{t.remindersOk}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {statement.customer.remindersOptIn &&
                        statement.summary.outstanding > 0 && (
                          <button
                            type="button"
                            data-testid="send-polite-reminder-btn"
                            onClick={() =>
                              setReminderTarget({
                                customer: statement.customer,
                                balance: statement.summary.outstanding,
                              })
                            }
                            className="min-h-[38px] px-3.5 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-xs inline-flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{t.sendPoliteReminder}</span>
                          </button>
                        )}

                      <button
                        type="button"
                        role="switch"
                        aria-checked={statement.customer.remindersOptIn}
                        aria-label={`${t.remindersOk} for ${statement.customer.name}`}
                        data-testid="reminders-optin-toggle"
                        onClick={() =>
                          onToggleReminderOptIn(statement.customer.id)
                        }
                        className={`min-h-[38px] w-16 px-1 rounded-full flex items-center transition-colors shrink-0 ${
                          statement.customer.remindersOptIn
                            ? 'bg-[var(--khata-accent)] justify-end'
                            : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] justify-start'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-full shadow ${
                            statement.customer.remindersOptIn
                              ? 'bg-[var(--khata-accent-fg)]'
                              : 'bg-[var(--khata-text-secondary)]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Running Balance Ledger + Date/Search Filters */}
                <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold">
                      Running Balance Ledger
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={stmtSearch}
                        onChange={(e) => setStmtSearch(e.target.value)}
                        placeholder="Filter note/amount"
                        className="min-h-[36px] px-3 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs w-36"
                      />
                      <input
                        type="date"
                        value={stmtStartDate}
                        onChange={(e) => setStmtStartDate(e.target.value)}
                        aria-label="Statement start date"
                        className="min-h-[36px] px-2 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs"
                      />
                      <input
                        type="date"
                        value={stmtEndDate}
                        onChange={(e) => setStmtEndDate(e.target.value)}
                        aria-label="Statement end date"
                        className="min-h-[36px] px-2 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs"
                      />
                    </div>
                  </div>

                  {statement.entries.length === 0 ? (
                    <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                      {t.noEntriesYet}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {statement.entries.map((entry) => {
                        const isPayment = entry.direction === 'payment';
                        const timeStr = new Date(entry.createdAt).toLocaleTimeString(
                          'en-IN',
                          { hour: '2-digit', minute: '2-digit' }
                        );
                        const fullEntry: LedgerEntry = {
                          id: entry.id,
                          customerId: statement.customer.id,
                          customerName: statement.customer.name,
                          amount: entry.amount,
                          direction: entry.direction,
                          date: entry.date,
                          createdAt: entry.createdAt,
                          note: entry.note,
                          undone: entry.undone,
                          reversalOfId: entry.reversalOfId,
                        };

                        return (
                          <div
                            key={entry.id}
                            className={`rounded-2xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] p-3.5 flex items-center justify-between gap-2 ${
                              entry.undone ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
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
                                <p className="font-semibold text-sm">
                                  {isPayment ? t.paymentReceived : t.creditGiven}
                                  {entry.undone ? ' (Undone)' : ''}
                                </p>
                                <p className="text-xs text-[var(--khata-text-secondary)] truncate">
                                  {formatShortDate(entry.date, {
                                    today: t.today,
                                    yesterday: t.yesterday,
                                  })}{' '}
                                  · {timeStr}
                                  {entry.note ? ` · ${entry.note}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <p
                                  className={`text-sm sm:text-base font-extrabold tabular-nums ${
                                    entry.undone ? 'line-through' : ''
                                  }`}
                                  style={{
                                    color: isPayment
                                      ? 'var(--khata-payment)'
                                      : 'var(--khata-credit)',
                                  }}
                                >
                                  {isPayment ? '+' : '-'}₹
                                  {formatINRNumber(entry.amount)}
                                </p>
                                <p className="text-[11px] text-[var(--khata-text-secondary)] tabular-nums">
                                  Bal: ₹{formatINRNumber(Math.abs(entry.runningBalance))}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => onEditEntry(fullEntry)}
                                aria-label={`Edit entry ₹${entry.amount}`}
                                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--khata-surface)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onUndoEntry(entry.id)}
                                aria-label={entry.undone ? 'Restore entry' : 'Undo entry'}
                                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--khata-surface)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteEntry(entry.id)}
                                aria-label={`Delete entry ₹${entry.amount}`}
                                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[#FF6B5E]/15 flex items-center justify-center text-[#FF6B5E]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {reminderTarget && (
        <ReminderSheet
          customer={reminderTarget.customer}
          balance={reminderTarget.balance}
          shopName={shopName}
          t={t}
          onClose={() => setReminderTarget(null)}
        />
      )}

      {showAddModal && (
        <CustomerModal
          t={t}
          onSave={onCreateCustomer}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingCustomer && (
        <CustomerModal
          customer={editingCustomer}
          t={t}
          onSave={(payload) => onUpdateCustomer(editingCustomer.id, payload)}
          onClose={() => setEditingCustomer(null)}
        />
      )}

      {deletingCustomer && (
        <ConfirmDeleteCustomerModal
          customerName={deletingCustomer.name}
          t={t}
          onConfirm={async () => {
            await onDeleteCustomer(deletingCustomer.id);
            setDeletingCustomer(null);
            setSelectedCustomerId(null);
          }}
          onCancel={() => setDeletingCustomer(null)}
        />
      )}
    </div>
  );
};
