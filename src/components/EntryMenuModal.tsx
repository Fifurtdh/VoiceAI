import React, { useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import type { EntryDirection, LedgerEntry } from '../types/khata';
import type { TranslationStrings } from '../utils/i18n';

interface EditEntryModalProps {
  entry: LedgerEntry;
  t: TranslationStrings;
  onSave: (
    entryId: string,
    updates: { amount: number; direction: EntryDirection; date: string; note?: string }
  ) => void;
  onClose: () => void;
}

export const EditEntryModal: React.FC<EditEntryModalProps> = ({
  entry,
  t,
  onSave,
  onClose,
}) => {
  const [amountStr, setAmountStr] = useState(String(entry.amount));
  const [direction, setDirection] = useState<EntryDirection>(entry.direction);
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Math.max(1, Math.round(Number(amountStr) || entry.amount));
    onSave(entry.id, {
      amount: numeric,
      direction,
      date,
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${t.edit} ${entry.customerName}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {t.edit} · {entry.customerName}
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

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('credit')}
              className={`min-h-[46px] rounded-full text-sm font-semibold ${
                direction === 'credit'
                  ? 'bg-[#FF6B5E] text-[#0B0B0B]'
                  : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
              }`}
            >
              {t.creditGiven}
            </button>
            <button
              type="button"
              onClick={() => setDirection('payment')}
              className={`min-h-[46px] rounded-full text-sm font-semibold ${
                direction === 'payment'
                  ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                  : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
              }`}
            >
              {t.paymentReceived}
            </button>
          </div>

          <div>
            <label
              htmlFor="edit-entry-amount"
              className="block text-sm text-[var(--khata-text-secondary)] mb-1"
            >
              Amount (₹)
            </label>
            <input
              id="edit-entry-amount"
              type="number"
              min={1}
              required
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="edit-entry-date"
              className="block text-sm text-[var(--khata-text-secondary)] mb-1"
            >
              Date
            </label>
            <input
              id="edit-entry-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="edit-entry-note"
              className="block text-sm text-[var(--khata-text-secondary)] mb-1"
            >
              Note
            </label>
            <input
              id="edit-entry-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Items or payment note"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
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
            className="flex-1 min-h-[48px] rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{t.save}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

interface ConfirmDeleteAllModalProps {
  t: TranslationStrings;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteAllModal: React.FC<ConfirmDeleteAllModalProps> = ({
  t,
  onConfirm,
  onCancel,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.deleteAllConfirmTitle}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up">
        <h2 className="text-xl font-bold">{t.deleteAllConfirmTitle}</h2>
        <p className="text-base text-[var(--khata-text-secondary)] mt-2">
          {t.deleteAllConfirmBody}
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
            onClick={onConfirm}
            className="flex-1 min-h-[48px] rounded-full bg-[#FF6B5E] text-[#0B0B0B] font-bold text-sm flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t.deleteAllData}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
