import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronRight,
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
import type { CustomerSummary } from '../utils/ledgerLogic';
import { formatINRNumber, formatShortDate, getPhoneSuffix } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';
import { CornerLines } from './CornerLines';
import {
  ConfirmDeleteCustomerModal,
  CustomerModal,
} from './CustomerModal';
import { ReminderSheet } from './ReminderSheet';

interface LedgerScreenProps {
  mode: 'ledger' | 'reminders';
  summaries: CustomerSummary[];
  entries: LedgerEntry[];
  shopName: string;
  t: TranslationStrings;
  onBack: () => void;
  onToggleReminderOptIn: (customerId: string) => void;
  onSwitchToLedger: () => void;
  onOpenReports: () => void;
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

/**
 * Screen 3: Ledger & Reminders
 * - Search bar + Add Customer + customer list with balances
 * - Customer detail view with Edit/Delete Customer, Add Udhaar / Record Payment,
 *   full transaction history (with Edit/Undo/Delete), and Reminders OK opt-in switch
 */
export const LedgerScreen: React.FC<LedgerScreenProps> = ({
  mode,
  summaries,
  entries,
  shopName,
  t,
  onBack,
  onToggleReminderOptIn,
  onSwitchToLedger,
  onOpenReports,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onAddEntryForCustomer,
  onEditEntry,
  onUndoEntry,
  onDeleteEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [reminderTarget, setReminderTarget] = useState<{
    customer: Customer;
    balance: number;
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const filteredSummaries = useMemo(() => {
    const base =
      mode === 'reminders'
        ? summaries.filter((s) => s.customer.remindersOptIn)
        : summaries;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (s) =>
        s.customer.name.toLowerCase().includes(q) ||
        s.customer.phone.includes(q) ||
        (s.customer.tag && s.customer.tag.toLowerCase().includes(q))
    );
  }, [mode, summaries, searchQuery]);

  const activeSummary = useMemo(() => {
    if (!selectedCustomerId) return null;
    return (
      summaries.find((s) => s.customer.id === selectedCustomerId) ?? null
    );
  }, [summaries, selectedCustomerId]);

  const customerHistory = useMemo(() => {
    if (!activeSummary) return [];
    return [...entries]
      .filter((e) => e.customerId === activeSummary.customer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activeSummary, entries]);

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

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12">
        {/* Top Bar */}
        <header className="flex items-center justify-between gap-2.5 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleBack}
              aria-label={t.back}
              className="min-h-[48px] min-w-[48px] w-12 h-12 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0 hover:opacity-90"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold truncate">
              {selectedCustomerId && activeSummary
                ? activeSummary.customer.name
                : mode === 'reminders'
                ? t.optedInCustomers
                : t.ledger}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {mode === 'reminders' && !selectedCustomerId ? (
              <button
                type="button"
                onClick={onSwitchToLedger}
                className="min-h-[44px] px-4 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-sm font-semibold"
              >
                {t.ledger}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onOpenReports}
                  data-testid="ledger-reports-btn"
                  aria-label="Reports"
                  className="min-h-[44px] px-3.5 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                >
                  <BarChart3 className="w-4 h-4 text-[var(--khata-accent)]" />
                  <span className="hidden sm:inline">Reports</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  data-testid="add-customer-btn"
                  className="min-h-[44px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-sm font-bold inline-flex items-center gap-1.5 hover:opacity-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Customer</span>
                </button>
              </>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Customer List Column */}
          <section
            className={`lg:col-span-5 space-y-4 ${
              selectedCustomerId ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--khata-text-secondary)] pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchCustomers}
                aria-label={t.searchCustomers}
                data-testid="customer-search-input"
                className="w-full min-h-[50px] pl-12 pr-4 rounded-full bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>

            {filteredSummaries.length === 0 ? (
              <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 text-center text-[var(--khata-text-secondary)] space-y-3">
                <p className="text-base">
                  {mode === 'reminders'
                    ? t.noOptedInCustomers
                    : t.noCustomersFound}
                </p>
                {mode === 'ledger' && (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="min-h-[44px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add your first customer</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="customer-list">
                {filteredSummaries.map(({ customer, balance, lastEntry }) => {
                  const isSelected = selectedCustomerId === customer.id;
                  const owesMoney = balance > 0;

                  return (
                    <div
                      key={customer.id}
                      className={`rounded-[24px] bg-[var(--khata-surface)] border transition-all ${
                        isSelected
                          ? 'border-[var(--khata-accent)] ring-1 ring-[var(--khata-accent)]'
                          : 'border-[var(--khata-border)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className="w-full min-h-[72px] p-4 flex items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-base shrink-0"
                            style={{
                              backgroundColor: customer.remindersOptIn
                                ? 'var(--khata-pink)'
                                : 'var(--khata-lavender)',
                              color: '#0B0B0B',
                            }}
                          >
                            {customer.name.charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <p className="font-bold text-base truncate">
                              {customer.name}
                            </p>
                            <p className="text-sm text-[var(--khata-text-secondary)] truncate">
                              {customer.tag ? `${customer.tag} · ` : ''}
                              {lastEntry
                                ? formatShortDate(lastEntry.date, {
                                    today: t.today,
                                    yesterday: t.yesterday,
                                  })
                                : customer.phone
                                ? `••${getPhoneSuffix(customer.phone)}`
                                : 'New customer'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p
                              className="text-lg font-extrabold tabular-nums"
                              style={{
                                color: owesMoney
                                  ? 'var(--khata-credit)'
                                  : 'var(--khata-payment)',
                              }}
                            >
                              ₹{formatINRNumber(Math.abs(balance))}
                            </p>
                            <p className="text-xs text-[var(--khata-text-secondary)]">
                              {balance > 0
                                ? t.outstandingBalance
                                : balance < 0
                                ? t.advance
                                : t.settled}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[var(--khata-text-secondary)]" />
                        </div>
                      </button>

                      {mode === 'reminders' && customer.remindersOptIn && (
                        <div className="px-4 pb-4 pt-1 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setReminderTarget({ customer, balance })
                            }
                            className="min-h-[44px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm inline-flex items-center gap-2"
                          >
                            <Send className="w-4 h-4" />
                            <span>{t.sendPoliteReminder}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Customer Detail Column */}
          <section
            className={`lg:col-span-7 ${
              selectedCustomerId ? 'block' : 'hidden lg:block'
            }`}
          >
            {!activeSummary ? (
              <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                <p className="text-base">
                  Select a customer to view full transaction history, record payments, or edit customer details.
                </p>
              </div>
            ) : (
              <div data-testid="customer-detail" className="space-y-5">
                {/* Balance & Customer Actions Card */}
                <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--khata-text-secondary)]">
                        {activeSummary.balance > 0
                          ? t.outstandingBalance
                          : activeSummary.balance < 0
                          ? t.advance
                          : t.settled}
                      </p>
                      <p
                        data-testid="customer-total-balance"
                        className="text-4xl sm:text-5xl font-extrabold tabular-nums mt-1"
                        style={{
                          color:
                            activeSummary.balance > 0
                              ? 'var(--khata-credit)'
                              : 'var(--khata-payment)',
                        }}
                      >
                        ₹{formatINRNumber(Math.abs(activeSummary.balance))}
                      </p>
                      {activeSummary.customer.tag && (
                        <p className="text-xs font-medium text-[var(--khata-text-secondary)] mt-1">
                          {activeSummary.customer.tag}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSummary.customer.phone && (
                        <div className="inline-flex items-center gap-1.5 text-sm text-[var(--khata-text-secondary)] mr-1">
                          <Phone className="w-4 h-4" />
                          <span className="tabular-nums">
                            {activeSummary.customer.phone}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingCustomer(activeSummary.customer)}
                        aria-label={`Edit ${activeSummary.customer.name}`}
                        data-testid="edit-customer-btn"
                        className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] flex items-center justify-center hover:opacity-90"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingCustomer(activeSummary.customer)}
                        aria-label={`Delete ${activeSummary.customer.name}`}
                        data-testid="delete-customer-btn"
                        className="min-h-[44px] min-w-[44px] rounded-full bg-[#FF6B5E]/15 text-[#FF6B5E] flex items-center justify-center hover:bg-[#FF6B5E]/25"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Add Udhaar / Record Payment for this customer */}
                  <div className="grid grid-cols-2 gap-2.5 mt-5">
                    <button
                      type="button"
                      data-testid="customer-add-udhaar-btn"
                      onClick={() =>
                        onAddEntryForCustomer(activeSummary.customer, 'credit')
                      }
                      className="min-h-[46px] px-4 rounded-full bg-[#FF6B5E] text-[#0B0B0B] font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:opacity-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Udhaar</span>
                    </button>

                    <button
                      type="button"
                      data-testid="customer-add-payment-btn"
                      onClick={() =>
                        onAddEntryForCustomer(activeSummary.customer, 'payment')
                      }
                      className="min-h-[46px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:opacity-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Record Payment</span>
                    </button>
                  </div>

                  {/* Per-customer Reminders OK Opt-In Toggle (OFF by default) */}
                  <div className="mt-6 pt-5 border-t border-[var(--khata-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[var(--khata-text-secondary)]" />
                        <span className="font-semibold text-base">
                          {t.remindersOk}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--khata-text-secondary)] mt-1">
                        {t.remindersOffHint}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={activeSummary.customer.remindersOptIn}
                      aria-label={`${t.remindersOk} for ${activeSummary.customer.name}`}
                      data-testid="reminders-optin-toggle"
                      onClick={() =>
                        onToggleReminderOptIn(activeSummary.customer.id)
                      }
                      className={`min-h-[44px] w-20 px-1.5 rounded-full flex items-center transition-colors shrink-0 ${
                        activeSummary.customer.remindersOptIn
                          ? 'bg-[var(--khata-accent)] justify-end'
                          : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] justify-start'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full shadow transition-transform ${
                          activeSummary.customer.remindersOptIn
                            ? 'bg-[var(--khata-accent-fg)]'
                            : 'bg-[var(--khata-text-secondary)]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* "Send polite reminder" button visible ONLY if opted in */}
                  {activeSummary.customer.remindersOptIn && (
                    <div className="mt-4">
                      <button
                        type="button"
                        data-testid="send-polite-reminder-btn"
                        onClick={() =>
                          setReminderTarget({
                            customer: activeSummary.customer,
                            balance: activeSummary.balance,
                          })
                        }
                        className="w-full min-h-[52px] px-5 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-base flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition-transform"
                      >
                        <Send className="w-4 h-4" />
                        <span>{t.sendPoliteReminder}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Transaction History */}
                <div>
                  <h2 className="text-lg font-bold mb-3">
                    {t.transactionHistory}
                  </h2>
                  {customerHistory.length === 0 ? (
                    <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 text-center text-[var(--khata-text-secondary)]">
                      {t.noEntriesYet}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {customerHistory.map((entry) => {
                        const isPayment = entry.direction === 'payment';
                        return (
                          <div
                            key={entry.id}
                            className={`rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 flex items-center justify-between gap-2 ${
                              entry.undone ? 'opacity-50' : ''
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
                                <p className="font-semibold text-base">
                                  {isPayment
                                    ? t.paymentReceived
                                    : t.creditGiven}
                                  {entry.undone ? ' (Undone)' : ''}
                                </p>
                                <p className="text-sm text-[var(--khata-text-secondary)] truncate">
                                  {formatShortDate(entry.date, {
                                    today: t.today,
                                    yesterday: t.yesterday,
                                  })}
                                  {entry.note ? ` · ${entry.note}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
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
                                {isPayment ? '+' : '-'}₹
                                {formatINRNumber(entry.amount)}
                              </span>

                              <button
                                type="button"
                                onClick={() => onEditEntry(entry)}
                                aria-label={`Edit entry ₹${entry.amount}`}
                                className="min-h-[38px] min-w-[38px] rounded-full hover:bg-[var(--khata-surface-elevated)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onUndoEntry(entry.id)}
                                aria-label={
                                  entry.undone ? 'Restore entry' : 'Undo entry'
                                }
                                className="min-h-[38px] min-w-[38px] rounded-full hover:bg-[var(--khata-surface-elevated)] flex items-center justify-center text-[var(--khata-text-secondary)]"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteEntry(entry.id)}
                                aria-label={`Delete entry ₹${entry.amount}`}
                                className="min-h-[38px] min-w-[38px] rounded-full hover:bg-[#FF6B5E]/15 flex items-center justify-center text-[#FF6B5E]"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
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
