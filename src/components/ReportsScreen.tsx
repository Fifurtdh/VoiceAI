import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Loader2,
} from 'lucide-react';
import type { Customer, LedgerEntry } from '../types/khata';
import { fetchReportsApi } from '../utils/api';
import { formatINRNumber, formatShortDate, getTodayISO } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';
import {
  computeLedgerReport,
  type LedgerReportSummary,
  type ReportPeriodType,
} from '../utils/ledgerLogic';
import { CornerLines } from './CornerLines';

interface ReportsScreenProps {
  customers: Customer[];
  entries: LedgerEntry[];
  t: TranslationStrings;
  onBack: () => void;
}

const PERIOD_OPTIONS: Array<{ id: ReportPeriodType; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Date Filter' },
];

/**
 * Daily, Weekly, Monthly, and Custom Date-Range Khata Reports screen.
 * Uses server-computed store-scoped aggregates from GET /api/reports.
 */
export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  customers,
  entries,
  t,
  onBack,
}) => {
  const [period, setPeriod] = useState<ReportPeriodType>('daily');
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [report, setReport] = useState<LedgerReportSummary>(() =>
    computeLedgerReport(customers, entries, { period: 'daily' })
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReportsApi({
      period,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
    })
      .then((res) => {
        if (active) setReport(res.report);
      })
      .catch(() => {
        if (active) {
          setReport(
            computeLedgerReport(customers, entries, {
              period,
              startDate: period === 'custom' ? startDate : undefined,
              endDate: period === 'custom' ? endDate : undefined,
            })
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period, startDate, endDate, customers, entries]);

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] overflow-x-hidden">
      <CornerLines className="absolute top-0 right-0 w-56 h-40 text-[var(--khata-text)]" />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12">
        <header className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label={t.back}
              data-testid="reports-back-btn"
              className="min-h-[48px] min-w-[48px] w-12 h-12 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0 hover:opacity-90"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
              <p className="text-xs sm:text-sm text-[var(--khata-text-secondary)]">
                {report.startDate === report.endDate
                  ? formatShortDate(report.startDate, {
                      today: t.today,
                      yesterday: t.yesterday,
                    })
                  : `${report.startDate} to ${report.endDate}`}
              </p>
            </div>
          </div>

          {loading && (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--khata-accent)] shrink-0" />
          )}
        </header>

        {/* Period Switcher Tabs */}
        <section className="mb-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`report-tab-${opt.id}`}
                onClick={() => setPeriod(opt.id)}
                className={`min-h-[44px] px-4 rounded-full text-sm font-bold transition-colors ${
                  period === opt.id
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="report-start-date"
                  className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
                >
                  From Date
                </label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--khata-text-secondary)] shrink-0" />
                  <input
                    id="report-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="report-start-date"
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="report-end-date"
                  className="block text-xs font-semibold text-[var(--khata-text-secondary)] mb-1"
                >
                  To Date
                </label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--khata-text-secondary)] shrink-0" />
                  <input
                    id="report-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="report-end-date"
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Key Metric Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
              <span>Udhaar Given</span>
              <ArrowUpRight className="w-4 h-4 text-[#FF6B5E]" />
            </div>
            <p
              data-testid="report-total-credit"
              className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-2"
              style={{ color: 'var(--khata-credit)' }}
            >
              ₹{formatINRNumber(report.totalCredit)}
            </p>
            <p className="text-xs text-[var(--khata-text-secondary)] mt-1">
              {report.creditCount} {report.creditCount === 1 ? 'entry' : 'entries'}
            </p>
          </div>

          <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
              <span>Payments Received</span>
              <ArrowDownLeft className="w-4 h-4 text-[var(--khata-payment)]" />
            </div>
            <p
              data-testid="report-total-payments"
              className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-2"
              style={{ color: 'var(--khata-payment)' }}
            >
              ₹{formatINRNumber(report.totalPayments)}
            </p>
            <p className="text-xs text-[var(--khata-text-secondary)] mt-1">
              {report.paymentCount} {report.paymentCount === 1 ? 'entry' : 'entries'}
            </p>
          </div>

          <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
              <span>Net Change</span>
              <BarChart3 className="w-4 h-4 text-[var(--khata-lavender)]" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-2">
              {report.netChange > 0 ? '+' : report.netChange < 0 ? '-' : ''}₹
              {formatINRNumber(Math.abs(report.netChange))}
            </p>
            <p className="text-xs text-[var(--khata-text-secondary)] mt-1">
              {report.netChange >= 0 ? 'More udhaar given' : 'Net recovered'}
            </p>
          </div>

          <div className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
              <span>{t.totalOutstanding}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-2">
              ₹{formatINRNumber(report.totalOutstanding)}
            </p>
            <p className="text-xs text-[var(--khata-text-secondary)] mt-1">
              Across {customers.length} {customers.length === 1 ? 'customer' : 'customers'}
            </p>
          </div>
        </section>

        {/* Breakdown Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
            <h2 className="text-lg font-bold mb-3">Day-by-Day Summary</h2>
            {report.dailyBreakdown.length === 0 ? (
              <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                No transactions recorded in this date range.
              </p>
            ) : (
              <div className="space-y-2.5">
                {report.dailyBreakdown.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-2xl bg-[var(--khata-surface-elevated)] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {formatShortDate(day.date, {
                          today: t.today,
                          yesterday: t.yesterday,
                        })}
                      </p>
                      <p className="text-xs text-[var(--khata-text-secondary)]">
                        {day.count} {day.count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                    <div className="text-right tabular-nums text-sm font-bold space-y-0.5">
                      <p style={{ color: 'var(--khata-credit)' }}>
                        -₹{formatINRNumber(day.credit)}
                      </p>
                      <p style={{ color: 'var(--khata-payment)' }}>
                        +₹{formatINRNumber(day.payment)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
            <h2 className="text-lg font-bold mb-3">Customer Activity</h2>
            {report.customerBreakdown.length === 0 ? (
              <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                No customer activity in this period.
              </p>
            ) : (
              <div className="space-y-2.5">
                {report.customerBreakdown.map((row) => (
                  <div
                    key={row.customerId}
                    className="rounded-2xl bg-[var(--khata-surface-elevated)] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <p className="font-semibold text-sm truncate">
                      {row.customerName}
                    </p>
                    <div className="flex items-center gap-4 tabular-nums text-sm font-bold shrink-0">
                      <span style={{ color: 'var(--khata-credit)' }}>
                        -₹{formatINRNumber(row.credit)}
                      </span>
                      <span style={{ color: 'var(--khata-payment)' }}>
                        +₹{formatINRNumber(row.payment)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
