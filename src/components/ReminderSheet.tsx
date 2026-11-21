import React, { useState } from 'react';
import { Check, Copy, MessageSquare, Send, X } from 'lucide-react';
import type { Customer } from '../types/khata';
import type { TranslationStrings } from '../utils/i18n';
import { formatINRNumber } from '../utils/format';

interface ReminderSheetProps {
  customer: Customer;
  balance: number;
  shopName: string;
  t: TranslationStrings;
  onClose: () => void;
}

/**
 * Gentle, pressure-free reminder sheet shown only for opted-in customers.
 */
export const ReminderSheet: React.FC<ReminderSheetProps> = ({
  customer,
  balance,
  shopName,
  t,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const amountText = formatINRNumber(Math.max(0, balance));
  const message = t.politeReminderTemplate(customer.name, shopName, amountText);
  const encodedMsg = encodeURIComponent(message);
  const digits = customer.phone.replace(/\D/g, '');
  const waHref = digits
    ? `https://wa.me/91${digits.slice(-10)}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;
  const smsHref = digits
    ? `sms:${digits}?body=${encodedMsg}`
    : `sms:?body=${encodedMsg}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored safely
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.sendPoliteReminder}
      data-testid="reminder-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up">
        <div className="w-10 h-1.5 rounded-full bg-current/20 mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">{t.sendPoliteReminder}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-[20px] bg-[var(--khata-surface-elevated)] p-4 text-base leading-relaxed text-[var(--khata-text)] border border-[var(--khata-border)]">
          {message}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[48px] px-4 rounded-full bg-[var(--khata-surface-elevated)] font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? t.copied : t.copyMessage}</span>
          </button>

          <a
            href={smsHref}
            className="min-h-[48px] px-4 rounded-full bg-[#B8A4F5] text-[#0B0B0B] font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{t.openSms}</span>
          </a>

          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-4 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95"
          >
            <Send className="w-4 h-4" />
            <span>{t.openWhatsApp}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
