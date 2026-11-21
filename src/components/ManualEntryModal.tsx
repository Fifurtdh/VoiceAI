import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, X } from 'lucide-react';
import type {
  Customer,
  EntryDirection,
  PendingConfirmation,
} from '../types/khata';
import { getTodayISO } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';

interface ManualEntryModalProps {
  customers: Customer[];
  initialDirection?: EntryDirection;
  initialCustomer?: Customer | null;
  t: TranslationStrings;
  onSave: (pending: PendingConfirmation) => Promise<void>;
  onClose: () => void;
}

/**
 * Clean modal for manual Udhaar Given or Payment Received entry from Dashboard or Customer Detail.
 */
export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  customers,
  initialDirection = 'credit',
  initialCustomer = null,
  t,
  onSave,
  onClose,
}) => {
  const [direction, setDirection] = useState<EntryDirection>(initialDirection);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomer?.id ?? ''
  );
  const [customerName, setCustomerName] = useState(
    initialCustomer?.name ?? ''
  );
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setError('Please enter or select a customer name.');
      return;
    }

    const numeric = Math.round(Number(amountStr));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        customerId: selectedCustomerId || undefined,
        customerName: trimmedName,
        amount: numeric,
        direction,
        date,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save entry.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add ledger entry"
      data-testid="manual-entry-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {direction === 'payment' ? 'Record Payment' : 'Add Udhaar'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-[#FF6B5E]/15 border border-[#FF6B5E]/30 px-4 py-2.5 text-sm font-semibold text-[#FF6B5E]"
          >
            {error}
          </div>
        )}

        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('credit')}
              data-testid="manual-dir-credit"
              className={`min-h-[46px] rounded-full text-sm font-bold inline-flex items-center justify-center gap-1.5 ${
                direction === 'credit'
                  ? 'bg-[#FF6B5E] text-[#0B0B0B]'
                  : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>{t.creditGiven}</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection('payment')}
              data-testid="manual-dir-payment"
              className={`min-h-[46px] rounded-full text-sm font-bold inline-flex items-center justify-center gap-1.5 ${
                direction === 'payment'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>{t.paymentReceived}</span>
            </button>
          </div>

          {customers.length > 0 && !initialCustomer && (
            <div>
              <label
                htmlFor="manual-existing-customer"
                className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
              >
                Existing Customer (or type new below)
              </label>
              <select
                id="manual-existing-customer"
                value={selectedCustomerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              >
                <option value="">-- New or select customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.tag ? ` (${c.tag})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="manual-customer-name"
              className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
            >
              Customer Name *
            </label>
            <input
              id="manual-customer-name"
              type="text"
              required
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (selectedCustomerId) setSelectedCustomerId('');
              }}
              placeholder="e.g. Ramesh Patel"
              data-testid="manual-customer-input"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="manual-amount"
                className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
              >
                Amount (₹) *
              </label>
              <input
                id="manual-amount"
                type="number"
                min={1}
                required
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="340"
                data-testid="manual-amount-input"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="manual-date"
                className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
              >
                Date
              </label>
              <input
                id="manual-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[48px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-note"
              className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
            >
              Note (optional)
            </label>
            <input
              id="manual-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Sugar & atta, UPI payment"
              data-testid="manual-note-input"
              className="w-full min-h-[46px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-full bg-[var(--khata-surface-elevated)] font-semibold text-sm"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={saving}
            data-testid="manual-save-btn"
            className="flex-1 min-h-[48px] rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : t.save}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
