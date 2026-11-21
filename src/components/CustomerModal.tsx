import React, { useState } from 'react';
import { Check, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import type { Customer } from '../types/khata';
import type { TranslationStrings } from '../utils/i18n';

interface CustomerModalProps {
  customer?: Customer | null;
  t: TranslationStrings;
  onSave: (payload: {
    name: string;
    phone: string;
    tag: string;
    remindersOptIn: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  customer,
  t,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [tag, setTag] = useState(customer?.tag ?? '');
  const [remindersOptIn, setRemindersOptIn] = useState(
    customer?.remindersOptIn ?? false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter the customer name.');
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && !/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit mobile number or leave it blank.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        phone: digits,
        tag: tag.trim(),
        remindersOptIn,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save customer.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={customer ? 'Edit customer' : 'Add customer'}
      data-testid="customer-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--khata-accent)]" />
            <h2 className="text-xl font-bold">
              {customer ? 'Edit Customer' : 'Add Customer'}
            </h2>
          </div>
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
          <div>
            <label
              htmlFor="cust-modal-name"
              className="block text-sm font-semibold text-[var(--khata-text-secondary)] mb-1"
            >
              Customer Name *
            </label>
            <input
              id="cust-modal-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
              data-testid="customer-name-input"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="cust-modal-phone"
              className="block text-sm font-semibold text-[var(--khata-text-secondary)] mb-1"
            >
              Mobile Number (optional)
            </label>
            <input
              id="cust-modal-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
              }
              placeholder="10-digit mobile number"
              data-testid="customer-phone-input"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="cust-modal-tag"
              className="block text-sm font-semibold text-[var(--khata-text-secondary)] mb-1"
            >
              Shop / Area Note (optional)
            </label>
            <input
              id="cust-modal-tag"
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Near Temple, Dairy Corner"
              data-testid="customer-tag-input"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
            <span className="text-sm font-medium">
              {t.remindersOk}
            </span>
            <input
              type="checkbox"
              checked={remindersOptIn}
              onChange={(e) => setRemindersOptIn(e.target.checked)}
              className="w-5 h-5 accent-[var(--khata-accent)]"
            />
          </label>
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
            data-testid="save-customer-btn"
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

interface ConfirmDeleteCustomerModalProps {
  customerName: string;
  t: TranslationStrings;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ConfirmDeleteCustomerModal: React.FC<
  ConfirmDeleteCustomerModalProps
> = ({ customerName, t, onConfirm, onCancel }) => {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${customerName}`}
      data-testid="delete-customer-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up">
        <h2 className="text-xl font-bold">Delete {customerName}?</h2>
        <p className="text-sm text-[var(--khata-text-secondary)] mt-2">
          This will permanently remove {customerName} and all of their udhaar and payment history from your store ledger.
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[48px] rounded-full bg-[var(--khata-surface-elevated)] font-semibold text-sm"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleConfirm()}
            data-testid="confirm-delete-customer-btn"
            className="flex-1 min-h-[48px] rounded-full bg-[#FF6B5E] text-[#0B0B0B] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>{deleting ? 'Deleting...' : t.delete}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
