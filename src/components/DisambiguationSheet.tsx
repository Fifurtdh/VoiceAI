import React from 'react';
import { ChevronRight, Phone, X } from 'lucide-react';
import type { DisambiguationOption, DisambiguationState } from '../types/khata';
import type { TranslationStrings } from '../utils/i18n';
import { formatINR } from '../utils/format';

interface DisambiguationSheetProps {
  state: DisambiguationState;
  t: TranslationStrings;
  onSelect: (option: DisambiguationOption) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

/**
 * Disambiguation sheet shown when multiple customers share a spoken name
 * (e.g. two customers named "Ramesh"). Renders large tappable buttons with
 * phone suffix and last transaction hint.
 */
export const DisambiguationSheet: React.FC<DisambiguationSheetProps> = ({
  state,
  t,
  onSelect,
  onCreateNew,
  onCancel,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.whichCustomer}
      data-testid="disambiguation-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] p-6 shadow-2xl animate-sheet-up">
        <div className="w-10 h-1.5 rounded-full bg-current/20 mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold">{t.whichCustomer}</h2>
            <p className="text-sm text-[var(--khata-text-secondary)] mt-1">
              {state.question}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.cancel}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center text-[var(--khata-text)] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {state.options.map((option) => (
            <button
              key={option.customerId}
              type="button"
              onClick={() => onSelect(option)}
              className="w-full min-h-[68px] p-4 rounded-[20px] bg-[var(--khata-surface-elevated)] hover:ring-2 hover:ring-[var(--khata-accent)] text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base truncate">
                    {option.customerName}
                  </span>
                  {option.tag && (
                    <span className="text-xs text-[var(--khata-text-secondary)]">
                      · {option.tag}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--khata-text-secondary)] mt-1">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="tabular-nums">••{option.phoneSuffix}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{option.lastTxSummary}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold tabular-nums">
                  {formatINR(option.balance)}
                </span>
                <ChevronRight className="w-5 h-5 text-[var(--khata-text-secondary)]" />
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={onCreateNew}
            className="w-full min-h-[48px] px-4 rounded-full border border-[var(--khata-border)] text-sm font-semibold text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)] transition-colors"
          >
            + Add new &ldquo;{state.pending.customerName}&rdquo;
          </button>
        </div>
      </div>
    </div>
  );
};
