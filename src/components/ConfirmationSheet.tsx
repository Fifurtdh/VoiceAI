import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Mic, Pencil, Send, X } from 'lucide-react';
import type { EntryDirection, PendingConfirmation } from '../types/khata';
import type { TranslationStrings } from '../utils/i18n';
import { formatINRNumber, formatShortDate } from '../utils/format';

interface ConfirmationSheetProps {
  pending: PendingConfirmation;
  demoMode?: boolean;
  t: TranslationStrings;
  onConfirm: (finalEntry: PendingConfirmation) => void;
  onVoiceCorrection?: (utterance: string) => void;
  onMicCorrection?: () => void;
  onCancel: () => void;
}

/**
 * Bottom confirmation sheet displayed after parsing a voice or typed entry.
 * Supports live updates from spoken corrections (e.g., "nahi, 430") directly inside the sheet
 * as well as inline manual edit.
 */
export const ConfirmationSheet: React.FC<ConfirmationSheetProps> = ({
  pending,
  demoMode = false,
  t,
  onConfirm,
  onVoiceCorrection,
  onMicCorrection,
  onCancel,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [customerName, setCustomerName] = useState(pending.customerName);
  const [amountStr, setAmountStr] = useState(String(pending.amount));
  const [direction, setDirection] = useState<EntryDirection>(pending.direction);
  const [date, setDate] = useState(pending.date);
  const [correctionText, setCorrectionText] = useState('');

  // Sync live spoken corrections when `pending` updates externally
  useEffect(() => {
    setCustomerName(pending.customerName);
    setAmountStr(String(pending.amount));
    setDirection(pending.direction);
    setDate(pending.date);
  }, [pending]);

  const numericAmount = Math.max(1, Math.round(Number(amountStr) || pending.amount));
  const isPayment = direction === 'payment';

  const handleConfirm = () => {
    onConfirm({
      ...pending,
      customerName: customerName.trim() || pending.customerName,
      amount: numericAmount,
      direction,
      date,
    });
  };

  const handleSubmitCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    const text = correctionText.trim();
    if (!text || !onVoiceCorrection) return;
    setCorrectionText('');
    onVoiceCorrection(text);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm ledger entry"
      data-testid="confirmation-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up">
        <div className="w-10 h-1.5 rounded-full bg-current/20 mx-auto mb-5 sm:hidden" />

        {/* Semantic label pill (never hue alone — icon + explicit label) */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: isPayment
                ? 'var(--khata-payment-bg)'
                : 'var(--khata-credit-bg)',
              color: isPayment ? 'var(--khata-payment)' : 'var(--khata-credit)',
            }}
          >
            {isPayment ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
            <span>{isPayment ? t.paymentReceived : t.creditGiven}</span>
          </span>

          <span className="text-sm text-[var(--khata-text-secondary)]">
            {formatShortDate(date, { today: t.today, yesterday: t.yesterday })}
          </span>
        </div>

        {!isEditing ? (
          <div className="my-4">
            <p className="text-lg font-semibold text-[var(--khata-text-secondary)]">
              {customerName}
            </p>
            <p
              data-testid="confirm-amount"
              className="text-5xl font-extrabold tracking-tight tabular-nums mt-1"
              style={{
                color: isPayment ? 'var(--khata-payment)' : 'var(--khata-credit)',
              }}
            >
              ₹{formatINRNumber(numericAmount)}
            </p>
            {pending.note && (
              <p className="text-sm text-[var(--khata-text-secondary)] mt-2">
                {pending.note}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 my-4">
            <div>
              <label className="block text-xs font-medium text-[var(--khata-text-secondary)] mb-1">
                Customer
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full min-h-[44px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--khata-text-secondary)] mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--khata-text-secondary)] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDirection('credit')}
                className={`min-h-[44px] rounded-full text-sm font-semibold transition-colors ${
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
                className={`min-h-[44px] rounded-full text-sm font-semibold transition-colors ${
                  direction === 'payment'
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
                }`}
              >
                {t.paymentReceived}
              </button>
            </div>
          </div>
        )}

        {/* Live Spoken / Quick Correction Bar directly inside the Confirmation Sheet */}
        {!isEditing && onVoiceCorrection && (
          <div className="mt-4 pt-3 border-t border-[var(--khata-border)] space-y-2.5">
            <form
              onSubmit={handleSubmitCorrection}
              className="flex items-center gap-2"
            >
              {onMicCorrection && (
                <button
                  type="button"
                  onClick={onMicCorrection}
                  aria-label="Speak correction"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-accent)] flex items-center justify-center shrink-0 hover:opacity-90"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <input
                type="text"
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                placeholder='Correct by voice/text: e.g. "nahi, 430"'
                aria-label="Voice or text correction"
                className="flex-1 min-h-[44px] px-3.5 rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
              <button
                type="submit"
                aria-label="Apply correction"
                className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {demoMode && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="demo-correction-btn"
                  onClick={() => onVoiceCorrection('nahi, 430')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-xs font-semibold text-[var(--khata-accent)] hover:opacity-90"
                >
                  Say &ldquo;nahi, 430&rdquo;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action row: Confirm / Edit / Cancel */}
        <div className="flex items-center gap-2.5 mt-5">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.cancel}
            className="min-h-[52px] min-w-[52px] px-4 rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] font-semibold text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-transform"
          >
            <X className="w-4 h-4" />
            <span>{t.cancel}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className="min-h-[52px] px-4 rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] font-semibold text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-transform"
          >
            <Pencil className="w-4 h-4" />
            <span>{t.edit}</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[52px] px-5 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-base flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-transform"
          >
            <Check className="w-5 h-5" />
            <span>{t.confirm}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
