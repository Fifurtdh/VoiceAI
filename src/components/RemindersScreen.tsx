import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { AppSettings } from '../types/khata';
import {
  fetchRemindersOverviewApi,
  generateReminderDraftApi,
  saveReminderLogApi,
  updateReminderLogApi,
  type PaymentReminderHistoryItem,
  type ReminderLanguage,
  type ReminderPendingCustomer,
  type RemindersOverviewResponse,
} from '../utils/api';
import { formatINRNumber, formatShortDate } from '../utils/format';

interface RemindersScreenProps {
  settings: AppSettings;
  onToggleReminderOptIn: (customerId: string) => Promise<void> | void;
}

const REMINDER_LANGUAGES: Array<{ code: ReminderLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'hinglish', label: 'Hinglish' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'mr', label: 'मराठी' },
  { code: 'bn', label: 'বাংলা' },
];

/**
 * Feature 3: Smart Payment Reminders
 * - Lists all customers with pending dues, overdue status, last payment date & days overdue
 * - Sorts by Highest Outstanding or Longest Overdue
 * - Generates polite multilingual / AI-polished reminders grounded in verified DB balances
 * - Explicit shopkeeper review/edit before copying or opening WhatsApp (never auto-sends)
 * - Tracks WhatsApp opened, Marked Sent, and manually recorded customer responses in SQLite
 */
export const RemindersScreen: React.FC<RemindersScreenProps> = ({
  settings,
  onToggleReminderOptIn,
}) => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [sortBy, setSortBy] = useState<'amount' | 'overdue'>('amount');
  const [data, setData] = useState<RemindersOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Composer modal state
  const [selectedCustomer, setSelectedCustomer] =
    useState<ReminderPendingCustomer | null>(null);
  const [draftLang, setDraftLang] = useState<ReminderLanguage>(settings.language);
  const [draftMessage, setDraftMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Response editor state in History tab
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemindersOverviewApi(sortBy);
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load payment reminders.'
      );
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const openComposer = async (
    customer: ReminderPendingCustomer,
    lang: ReminderLanguage = settings.language,
    useAiPolish = false
  ) => {
    setSelectedCustomer(customer);
    setDraftLang(lang);
    setGenerating(true);
    setCopied(false);
    try {
      const res = await generateReminderDraftApi({
        customerId: customer.customerId,
        language: lang,
        useAiPolish,
      });
      setDraftMessage(res.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not generate reminder.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!draftMessage.trim()) return;
    try {
      await navigator.clipboard.writeText(draftMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleLogReminder = async (
    status: 'opened_whatsapp' | 'marked_sent',
    channel: 'whatsapp' | 'copy' = 'whatsapp'
  ) => {
    if (!selectedCustomer || !draftMessage.trim()) return;
    setSavingLog(true);
    try {
      await saveReminderLogApi({
        customerId: selectedCustomer.customerId,
        language: draftLang,
        message: draftMessage.trim(),
        channel,
        status,
      });
      await loadOverview();
      if (status === 'marked_sent') {
        setSelectedCustomer(null);
        showToast(`Reminder marked as sent for ${selectedCustomer.name}.`);
      } else {
        showToast(
          `WhatsApp draft opened for ${selectedCustomer.name}. Tap "Mark as Sent" once you send it.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save reminder log.'
      );
    } finally {
      setSavingLog(false);
    }
  };

  const handleSaveCustomerResponse = async (item: PaymentReminderHistoryItem) => {
    if (!responseText.trim()) return;
    try {
      await updateReminderLogApi(item.id, {
        status: 'customer_responded',
        customerResponse: responseText.trim(),
      });
      setRespondingId(null);
      setResponseText('');
      await loadOverview();
      showToast(`Recorded response for ${item.customerName}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save customer response.'
      );
    }
  };

  const handleMarkHistorySent = async (item: PaymentReminderHistoryItem) => {
    try {
      await updateReminderLogApi(item.id, { status: 'marked_sent' });
      await loadOverview();
      showToast(`Marked reminder for ${item.customerName} as sent.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const digits = selectedCustomer
    ? selectedCustomer.phone.replace(/\D/g, '').slice(-10)
    : '';
  const waHref =
    digits.length === 10
      ? `https://wa.me/91${digits}?text=${encodeURIComponent(draftMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(draftMessage)}`;

  return (
    <div className="min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)]">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Payment Reminders
            </h1>
            <p className="text-sm text-[var(--khata-text-secondary)]">
              Polite, shopkeeper-approved reminders grounded in real pending balances
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="reminders-tab-pending"
              onClick={() => setTab('pending')}
              className={`min-h-[42px] px-4 rounded-xl text-sm font-bold transition-colors ${
                tab === 'pending'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
              }`}
            >
              Pending Dues ({data?.summary.pendingCustomerCount ?? 0})
            </button>
            <button
              type="button"
              data-testid="reminders-tab-history"
              onClick={() => setTab('history')}
              className={`min-h-[42px] px-4 rounded-xl text-sm font-bold transition-colors ${
                tab === 'history'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
              }`}
            >
              History ({data?.history.length ?? 0})
            </button>
          </div>
        </header>

        {toast && (
          <div
            role="status"
            className="rounded-xl bg-[var(--khata-payment-bg)] border border-[var(--khata-border)] px-4 py-3 text-sm font-semibold flex items-center gap-2"
            style={{ color: 'var(--khata-payment)' }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#FF6B5E]/15 border border-[#FF6B5E]/30 px-4 py-3 text-sm font-semibold text-[#FF6B5E]"
          >
            {error}
          </div>
        )}

        {/* Summary KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
            <p className="text-xs font-semibold text-[var(--khata-text-secondary)]">
              Total Pending
            </p>
            <p
              className="text-2xl font-extrabold tabular-nums mt-1"
              style={{ color: 'var(--khata-credit)' }}
            >
              ₹{formatINRNumber(data?.summary.totalPendingAmount ?? 0)}
            </p>
          </div>
          <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
            <p className="text-xs font-semibold text-[var(--khata-text-secondary)]">
              Customers with Dues
            </p>
            <p className="text-2xl font-extrabold tabular-nums mt-1">
              {data?.summary.pendingCustomerCount ?? 0}
            </p>
          </div>
          <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
            <p className="text-xs font-semibold text-[var(--khata-text-secondary)]">
              Overdue 30+ Days
            </p>
            <p
              className="text-2xl font-extrabold tabular-nums mt-1"
              style={{ color: 'var(--khata-credit)' }}
            >
              {data?.summary.overdue30dCount ?? 0}
            </p>
          </div>
          <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
            <p className="text-xs font-semibold text-[var(--khata-text-secondary)]">
              Reminders Sent
            </p>
            <p
              className="text-2xl font-extrabold tabular-nums mt-1"
              style={{ color: 'var(--khata-payment)' }}
            >
              {data?.summary.remindersSentCount ?? 0}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--khata-accent)]" />
          </div>
        ) : tab === 'pending' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--khata-text-secondary)]">
                Review and approve every reminder before sending — never sent automatically.
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--khata-text-secondary)] mr-1">
                  Sort by:
                </span>
                <button
                  type="button"
                  data-testid="sort-reminders-amount"
                  onClick={() => setSortBy('amount')}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold ${
                    sortBy === 'amount'
                      ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                      : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                  }`}
                >
                  Highest Pending
                </button>
                <button
                  type="button"
                  data-testid="sort-reminders-overdue"
                  onClick={() => setSortBy('overdue')}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold ${
                    sortBy === 'overdue'
                      ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                      : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                  }`}
                >
                  Longest Overdue
                </button>
              </div>
            </div>

            {!data || data.pendingCustomers.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                No customers have a pending balance right now.
              </div>
            ) : (
              <div className="space-y-3" data-testid="reminders-pending-list">
                {data.pendingCustomers.map((cust) => (
                  <div
                    key={cust.customerId}
                    className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-base truncate">{cust.name}</p>
                        {cust.overdueStatus === 'overdue_30d' && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#FF6B5E]/15 text-[#FF6B5E]">
                            30+ days overdue
                          </span>
                        )}
                        {cust.overdueStatus === 'overdue_14d' && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500">
                            14+ days unpaid
                          </span>
                        )}
                        {!cust.remindersOptIn && (
                          <span className="text-xs font-medium text-[var(--khata-text-secondary)]">
                            · Reminders opted out
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--khata-text-secondary)]">
                        {cust.phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="w-3.5 h-3.5" />
                            {cust.phone}
                          </span>
                        )}
                        <span>
                          Last payment:{' '}
                          {cust.lastPaymentDate
                            ? formatShortDate(cust.lastPaymentDate)
                            : 'None yet'}
                        </span>
                        <span>
                          Last activity:{' '}
                          {cust.lastTransactionDate
                            ? formatShortDate(cust.lastTransactionDate)
                            : '—'}
                        </span>
                        {cust.daysSinceLastPayment !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {cust.daysSinceLastPayment}d since payment
                          </span>
                        )}
                      </div>

                      {cust.recentReminderWarning && (
                        <p className="text-xs font-semibold text-amber-500 inline-flex items-center gap-1.5 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Reminder already sent within the last 24 hours — avoid sending duplicates.
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-left sm:text-right">
                        <p
                          className="text-xl font-extrabold tabular-nums"
                          style={{ color: 'var(--khata-credit)' }}
                        >
                          ₹{formatINRNumber(cust.outstanding)}
                        </p>
                        <p className="text-[11px] text-[var(--khata-text-secondary)]">
                          Pending due
                        </p>
                      </div>

                      {!cust.remindersOptIn ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await onToggleReminderOptIn(cust.customerId);
                            await loadOverview();
                          }}
                          className="min-h-[42px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-bold inline-flex items-center gap-1.5 hover:border-[var(--khata-accent)]"
                        >
                          <Bell className="w-3.5 h-3.5" />
                          <span>Enable Consent</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid={`generate-reminder-${cust.customerId}`}
                          onClick={() => void openComposer(cust)}
                          className="min-h-[42px] px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:opacity-95"
                        >
                          <Send className="w-4 h-4" />
                          <span>Generate Reminder</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Reminder History Tab */
          <section className="space-y-3" data-testid="reminders-history-list">
            {!data || data.history.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-8 text-center text-[var(--khata-text-secondary)]">
                No payment reminders logged yet. Generate and send a reminder from Pending Dues.
              </div>
            ) : (
              data.history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-base">
                        {item.customerName}{' '}
                        <span className="tabular-nums font-extrabold text-sm text-[var(--khata-credit)] ml-1">
                          ₹{formatINRNumber(item.amountDue)}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--khata-text-secondary)]">
                        {new Date(item.createdAt).toLocaleString('en-IN')} · Language:{' '}
                        {item.language.toUpperCase()} · Status:{' '}
                        <strong className="text-[var(--khata-text)]">
                          {item.status === 'marked_sent'
                            ? 'Marked Sent'
                            : item.status === 'opened_whatsapp'
                            ? 'WhatsApp Opened (Unconfirmed)'
                            : item.status === 'customer_responded'
                            ? 'Customer Responded'
                            : 'Draft'}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status === 'opened_whatsapp' && (
                        <button
                          type="button"
                          onClick={() => void handleMarkHistorySent(item)}
                          className="min-h-[36px] px-3 rounded-lg bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-xs font-bold"
                        >
                          Mark as Sent
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRespondingId(respondingId === item.id ? null : item.id);
                          setResponseText(item.customerResponse ?? '');
                        }}
                        className="min-h-[36px] px-3 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          {item.customerResponse ? 'Edit Response' : 'Record Response'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <p className="text-sm rounded-xl bg-[var(--khata-surface-elevated)] p-3 border border-[var(--khata-border)]">
                    {item.message}
                  </p>

                  {item.customerResponse && (
                    <p className="text-xs font-semibold text-[var(--khata-payment)]">
                      Customer response: &ldquo;{item.customerResponse}&rdquo;
                    </p>
                  )}

                  {respondingId === item.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveCustomerResponse(item);
                      }}
                      className="flex flex-col sm:flex-row gap-2 pt-1"
                    >
                      <input
                        type="text"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder='e.g. "Promised to pay ₹500 on Friday"'
                        className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] px-4 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-sm font-bold"
                      >
                        Save Response
                      </button>
                    </form>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </main>

      {/* Reminder Composer Modal */}
      {selectedCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment reminder composer"
          data-testid="reminder-composer-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-lg rounded-t-[24px] sm:rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 sm:p-6 space-y-4 shadow-2xl animate-sheet-up">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  Reminder for {selectedCustomer.name}
                </h2>
                <p className="text-xs text-[var(--khata-text-secondary)]">
                  Verified pending balance:{' '}
                  <strong className="tabular-nums text-[var(--khata-credit)]">
                    ₹{formatINRNumber(selectedCustomer.outstanding)}
                  </strong>
                  {selectedCustomer.phone ? ` · +91 ${selectedCustomer.phone}` : ' · No phone saved'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                aria-label="Close composer"
                className="min-h-[40px] min-w-[40px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedCustomer.recentReminderWarning && (
              <div className="rounded-xl bg-amber-500/15 border border-amber-500/30 px-3.5 py-2.5 text-xs font-semibold text-amber-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  A reminder was already logged within the last 24 hours. Send again only if needed.
                </span>
              </div>
            )}

            {/* Language Selector + AI Polish */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => void openComposer(selectedCustomer, l.code, false)}
                    className={`min-h-[34px] px-2.5 rounded-lg text-xs font-bold ${
                      draftLang === l.code
                        ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                        : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={generating}
                onClick={() => void openComposer(selectedCustomer, draftLang, true)}
                className="min-h-[34px] px-3 rounded-lg bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-bold inline-flex items-center gap-1.5 hover:border-[var(--khata-accent)]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--khata-accent)]" />
                <span>Polish with AI</span>
              </button>
            </div>

            {/* Editable Message Box */}
            <div>
              <label
                htmlFor="reminder-message-editor"
                className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
              >
                Edit message before sending
              </label>
              {generating ? (
                <div className="h-28 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] flex items-center justify-center gap-2 text-sm text-[var(--khata-text-secondary)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--khata-accent)]" />
                  <span>Generating polite reminder...</span>
                </div>
              ) : (
                <textarea
                  id="reminder-message-editor"
                  data-testid="reminder-message-textarea"
                  rows={4}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  className="w-full p-3.5 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                />
              )}
              <p className="text-[11px] text-[var(--khata-text-secondary)] mt-1">
                Opening WhatsApp pre-fills this message for your review. Delivery is only confirmed once you tap Send inside WhatsApp and mark it sent below.
              </p>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <button
                type="button"
                data-testid="reminder-copy-btn"
                onClick={() => void handleCopyDraft()}
                className="min-h-[46px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="reminder-whatsapp-link"
                onClick={() => void handleLogReminder('opened_whatsapp', 'whatsapp')}
                className="min-h-[46px] px-3.5 rounded-xl bg-[#25D366] text-[#0B0B0B] text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95"
              >
                <Send className="w-4 h-4" />
                <span>Open WhatsApp</span>
              </a>

              <button
                type="button"
                disabled={savingLog || !draftMessage.trim()}
                data-testid="reminder-mark-sent-btn"
                onClick={() => void handleLogReminder('marked_sent', 'whatsapp')}
                className="min-h-[46px] px-3.5 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark as Sent</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
