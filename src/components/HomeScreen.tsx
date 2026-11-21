import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Menu,
  MessageSquareText,
  Mic,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AppScreen,
  AppSettings,
  Customer,
  EntryDirection,
  LanguageCode,
  LedgerEntry,
} from '../types/khata';
import {
  filterLedgerEntries,
  type DashboardTotals,
} from '../utils/ledgerLogic';
import { formatINRNumber, formatShortDate } from '../utils/format';
import { LANGUAGES, type TranslationStrings } from '../utils/i18n';
import { CornerLines } from './CornerLines';

interface HomeScreenProps {
  settings: AppSettings;
  totals: DashboardTotals;
  entries: LedgerEntry[];
  customers: Customer[];
  t: TranslationStrings;
  onNavigate: (screen: AppScreen) => void;
  onLanguageChange: (lang: LanguageCode) => void;
  onQuickAddEntry: (direction: EntryDirection) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onUndoEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

/**
 * Screen 1: Home
 * Preserves the dark/lime/lavender/pink bento visual reference with outdoor-legible typography,
 * 3-card Bento grid, today's Indian-formatted stats, quick entry/reports shortcuts,
 * and searchable/filterable recent entries with Edit/Undo/Delete.
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({
  settings,
  totals,
  entries,
  customers,
  t,
  onNavigate,
  onLanguageChange,
  onQuickAddEntry,
  onEditEntry,
  onUndoEntry,
  onDeleteEntry,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [txFilterDir, setTxFilterDir] = useState<'all' | EntryDirection>('all');
  const [txFilterDate, setTxFilterDate] = useState('');

  const filteredEntries = useMemo(
    () =>
      filterLedgerEntries(entries, {
        search: txSearch,
        direction: txFilterDir,
        startDate: txFilterDate || undefined,
        endDate: txFilterDate || undefined,
      }),
    [entries, txSearch, txFilterDir, txFilterDate]
  );

  const hasActiveFilter =
    Boolean(txSearch.trim()) || txFilterDir !== 'all' || Boolean(txFilterDate);

  const visibleEntries =
    showAllEntries || hasActiveFilter
      ? filteredEntries
      : filteredEntries.slice(0, 5);

  const optedInCount = customers.filter((c) => c.remindersOptIn).length;

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] overflow-x-hidden">
      <CornerLines className="absolute top-0 right-0 w-64 h-48 text-[var(--khata-text)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 left-6 w-72 h-72 rounded-full opacity-15 blur-3xl"
        style={{ background: 'var(--khata-accent)' }}
      />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12">
        {/* Top Row: Round menu icon -> Settings, Greeting, Language Selector */}
        <header className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              aria-label={t.settings}
              data-testid="open-settings-btn"
              className="lg:hidden min-h-[48px] min-w-[48px] w-12 h-12 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-transform"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <p className="text-[15px] sm:text-lg font-medium leading-tight">
                {t.namaste}, <span className="font-bold">{settings.shopName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="home-language-select" className="sr-only">
              {t.language}
            </label>
            <select
              id="home-language-select"
              value={settings.language}
              onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
              className="min-h-[44px] px-3 rounded-full bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* AI Disclosure Badge + Main Hero Prompt */}
        <section className="mt-7 mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-medium text-[var(--khata-text-secondary)]">
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#22C55E] shrink-0"
              aria-hidden="true"
            />
            <span>{t.aiVoiceAssistant}</span>
          </div>

          <h1 className="mt-3 text-[32px] sm:text-4xl lg:text-[42px] font-bold tracking-tight leading-[1.12] max-w-xl text-balance">
            {t.homePrompt}
          </h1>
        </section>

        {/* Responsive Desktop Split: Bento + Stats on Left, Recent Entries on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: 3-Card Bento Grid + 3 Stat Chips + Quick Shortcuts */}
          <div className="lg:col-span-6 space-y-5">
            {/* Bento Grid: tall left Lime card + 2 stacked right cards */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => onNavigate('talk')}
                data-testid="bento-talk"
                className="row-span-2 min-h-[216px] sm:min-h-[236px] rounded-[24px] p-5 flex flex-col justify-between text-left transition-transform active:scale-[0.98] hover:brightness-95"
                style={{
                  backgroundColor: 'var(--khata-lime-card)',
                  color: '#0B0B0B',
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="w-11 h-11 rounded-full bg-black/10 flex items-center justify-center">
                    <Mic className="w-5 h-5" />
                  </span>
                  <ArrowUpRight className="w-6 h-6" />
                </div>

                <div>
                  <span className="block text-2xl sm:text-[26px] font-bold leading-tight">
                    {t.talkToKhata}
                  </span>
                  <span className="block text-sm font-medium opacity-80 mt-1">
                    {t.talkSubtitle}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('ledger')}
                data-testid="bento-ledger"
                className="min-h-[102px] rounded-[24px] p-4 sm:p-5 flex flex-col justify-between text-left transition-transform active:scale-[0.98] hover:brightness-95"
                style={{
                  backgroundColor: 'var(--khata-lavender)',
                  color: '#0B0B0B',
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </span>
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <span className="text-lg sm:text-xl font-bold mt-2">
                  {t.ledger}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reminders')}
                data-testid="bento-reminders"
                className="min-h-[102px] rounded-[24px] p-4 sm:p-5 flex flex-col justify-between text-left transition-transform active:scale-[0.98] hover:brightness-95"
                style={{
                  backgroundColor: 'var(--khata-pink)',
                  color: '#0B0B0B',
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </span>
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-2">
                  <span className="text-lg sm:text-xl font-bold">
                    {t.reminders}
                  </span>
                  <span className="text-xs font-semibold opacity-75 tabular-nums">
                    {optedInCount}
                  </span>
                </div>
              </button>
            </div>

            {/* Row of 3 Stat Chips */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-3 sm:p-3.5 flex flex-col justify-between">
                <p className="text-xs font-medium text-[var(--khata-text-secondary)] leading-tight">
                  {t.todayUdhaar}
                </p>
                <p
                  data-testid="stat-today-credit"
                  className="text-lg sm:text-xl font-extrabold tabular-nums mt-1.5"
                  style={{ color: 'var(--khata-credit)' }}
                >
                  ₹{formatINRNumber(totals.todayCredit)}
                </p>
              </div>

              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-3 sm:p-3.5 flex flex-col justify-between">
                <p className="text-xs font-medium text-[var(--khata-text-secondary)] leading-tight">
                  {t.todayPayments}
                </p>
                <p
                  data-testid="stat-today-payments"
                  className="text-lg sm:text-xl font-extrabold tabular-nums mt-1.5"
                  style={{ color: 'var(--khata-payment)' }}
                >
                  ₹{formatINRNumber(totals.todayPayments)}
                </p>
              </div>

              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-3 sm:p-3.5 flex flex-col justify-between">
                <p className="text-xs font-medium text-[var(--khata-text-secondary)] leading-tight">
                  {t.totalOutstanding}
                </p>
                <p
                  data-testid="stat-total-outstanding"
                  className="text-lg sm:text-xl font-extrabold tabular-nums mt-1.5 text-[var(--khata-text)]"
                >
                  ₹{formatINRNumber(totals.totalOutstanding)}
                </p>
              </div>
            </div>

            {/* Quick Action Shortcuts: Add Udhaar, Record Payment, AI Assistant, Reports */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => onQuickAddEntry('credit')}
                data-testid="quick-add-udhaar-btn"
                className="min-h-[46px] px-3 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
                style={{ color: 'var(--khata-credit)' }}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Add Udhaar</span>
              </button>

              <button
                type="button"
                onClick={() => onQuickAddEntry('payment')}
                data-testid="quick-add-payment-btn"
                className="min-h-[46px] px-3 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
                style={{ color: 'var(--khata-payment)' }}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Payment</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('assistant')}
                data-testid="quick-ai-assistant-btn"
                className="min-h-[46px] px-3 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
              >
                <MessageSquareText className="w-4 h-4 shrink-0 text-[var(--khata-lavender)]" />
                <span>AI Chat</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reports')}
                data-testid="quick-reports-btn"
                className="min-h-[46px] px-3 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
              >
                <BarChart3 className="w-4 h-4 shrink-0 text-[var(--khata-accent)]" />
                <span>Reports</span>
              </button>
            </div>
          </div>

          {/* Right Column: Recent Entries + Search & Filter */}
          <section className="lg:col-span-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">{t.recentEntries}</h2>
              {filteredEntries.length > 5 && !hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => setShowAllEntries((prev) => !prev)}
                  className="min-h-[44px] px-3 text-sm font-semibold text-[var(--khata-text-secondary)] hover:text-[var(--khata-text)]"
                >
                  {showAllEntries ? 'Show less' : t.seeAll}
                </button>
              )}
            </div>

            {/* Search & Filter Transactions */}
            {entries.length > 0 && (
              <div className="mb-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--khata-text-secondary)] pointer-events-none" />
                    <input
                      type="search"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Search transactions..."
                      aria-label="Search transactions"
                      data-testid="tx-search-input"
                      className="w-full min-h-[44px] pl-10 pr-3.5 rounded-full bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                    />
                  </div>
                  <input
                    type="date"
                    value={txFilterDate}
                    onChange={(e) => setTxFilterDate(e.target.value)}
                    aria-label="Filter by date"
                    data-testid="tx-date-filter"
                    className="min-h-[44px] px-3.5 rounded-full bg-[var(--khata-surface)] text-[var(--khata-text)] border border-[var(--khata-border)] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {(['all', 'credit', 'payment'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      data-testid={`tx-filter-${dir}`}
                      onClick={() => setTxFilterDir(dir)}
                      className={`min-h-[36px] px-3.5 rounded-full text-xs font-bold transition-colors ${
                        txFilterDir === dir
                          ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                          : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                      }`}
                    >
                      {dir === 'all'
                        ? 'All'
                        : dir === 'credit'
                        ? 'Udhaar'
                        : 'Payments'}
                    </button>
                  ))}
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setTxSearch('');
                        setTxFilterDir('all');
                        setTxFilterDate('');
                      }}
                      className="min-h-[36px] px-3 text-xs font-semibold underline text-[var(--khata-text-secondary)]"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {visibleEntries.length === 0 ? (
              <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 text-center text-[var(--khata-text-secondary)]">
                <p className="text-base">
                  {hasActiveFilter
                    ? 'No matching transactions found.'
                    : t.noEntriesYet}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="recent-entries-list">
                {visibleEntries.map((entry) => {
                  const isPayment = entry.direction === 'payment';
                  const isMenuOpen = openMenuId === entry.id;

                  return (
                    <div
                      key={entry.id}
                      className={`relative rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] px-3.5 sm:px-4 py-3.5 flex items-center justify-between gap-2 ${
                        entry.undone ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: isPayment
                              ? 'var(--khata-lime-card)'
                              : '#FF6B5E',
                            color: '#0B0B0B',
                          }}
                        >
                          {isPayment ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p
                            className={`font-semibold text-base truncate ${
                              entry.undone ? 'line-through' : ''
                            }`}
                          >
                            {entry.customerName}
                          </p>
                          <p className="text-xs sm:text-sm text-[var(--khata-text-secondary)] truncate">
                            {isPayment ? t.paymentReceived : t.creditGiven} ·{' '}
                            {formatShortDate(entry.date, {
                              today: t.today,
                              yesterday: t.yesterday,
                            })}
                            {entry.note ? ` · ${entry.note}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-lg font-extrabold tabular-nums ${
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

                        <button
                          type="button"
                          aria-label={`Actions for ${entry.customerName} ₹${entry.amount}`}
                          aria-expanded={isMenuOpen}
                          onClick={() =>
                            setOpenMenuId(isMenuOpen ? null : entry.id)
                          }
                          className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[var(--khata-text-secondary)] hover:bg-[var(--khata-surface-elevated)]"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>

                      {isMenuOpen && (
                        <div
                          role="menu"
                          className="absolute right-3 top-14 z-30 w-44 rounded-2xl bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] shadow-xl p-1.5 space-y-1"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              onEditEntry(entry);
                            }}
                            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-sm font-medium hover:bg-[var(--khata-surface)] text-left"
                          >
                            <Pencil className="w-4 h-4" />
                            <span>{t.edit}</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              onUndoEntry(entry.id);
                            }}
                            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-sm font-medium hover:bg-[var(--khata-surface)] text-left"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>{entry.undone ? 'Restore' : t.undo}</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              onDeleteEntry(entry.id);
                            }}
                            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2.5 text-sm font-medium text-[#FF6B5E] hover:bg-[var(--khata-surface)] text-left"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>{t.delete}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
