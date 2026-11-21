import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  Download,
  FileText,
  Loader2,
  Printer,
  Share2,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import type { Customer, LedgerEntry } from '../types/khata';
import {
  fetchEnhancedReportApi,
  type EnhancedReportData,
} from '../utils/api';
import {
  downloadBusinessReportCsv,
  downloadBusinessReportPdf,
  shareReportText,
} from '../utils/exportReport';
import { formatINRNumber, formatShortDate, getTodayISO } from '../utils/format';
import type { TranslationStrings } from '../utils/i18n';
import type { ReportPeriodType } from '../utils/ledgerLogic';
import { CornerLines } from './CornerLines';

interface ReportsScreenProps {
  shopName: string;
  customers: Customer[];
  entries: LedgerEntry[];
  t: TranslationStrings;
  onBack: () => void;
}

const PERIOD_OPTIONS: Array<{ id: ReportPeriodType; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom Range' },
];

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const isUp = delta > 0;
  const isFlat = delta === 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums"
      style={{
        color: isFlat
          ? 'var(--khata-text-secondary)'
          : isUp
          ? 'var(--khata-payment)'
          : 'var(--khata-credit)',
      }}
    >
      {!isFlat &&
        (isUp ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        ))}
      <span>
        {delta > 0 ? '+' : ''}
        {delta}% vs prev
      </span>
    </span>
  );
}

/**
 * Responsive zero-dependency SVG Credit vs Payment Bar Chart driven 100% by real DB data.
 */
const ActivityBarChart: React.FC<{
  series: EnhancedReportData['dailySeries'];
}> = ({ series }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const visible = series.slice(-14); // Show up to 14 crisp bars cleanly
  const maxVal = Math.max(
    1,
    ...visible.map((d) => Math.max(d.credit, d.payment))
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-[var(--khata-text-secondary)] py-8 text-center">
        No activity recorded in this period yet.
      </p>
    );
  }

  const hovered = hoverIdx !== null ? visible[hoverIdx] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--khata-credit)' }}
            />
            Credit (Udhaar)
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--khata-payment)' }}
            />
            Payments Collected
          </span>
        </div>

        {hovered && (
          <span className="tabular-nums font-bold text-[var(--khata-text)]">
            {hovered.label}: Udhaar ₹{formatINRNumber(hovered.credit)} · Paid ₹
            {formatINRNumber(hovered.payment)}
          </span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${Math.max(340, visible.length * 46)} 180`}
          className="w-full h-[185px] min-w-[300px]"
          role="img"
          aria-label="Credit vs payment activity chart"
        >
          {/* Baseline gridlines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = 148 - frac * 124;
            return (
              <line
                key={frac}
                x1="8"
                x2={Math.max(340, visible.length * 46) - 8}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.09"
                strokeDasharray="3 3"
              />
            );
          })}

          {visible.map((d, idx) => {
            const xBase = 16 + idx * 44;
            const creditH = Math.max(d.credit > 0 ? 4 : 0, (d.credit / maxVal) * 122);
            const payH = Math.max(d.payment > 0 ? 4 : 0, (d.payment / maxVal) * 122);
            const isHovered = hoverIdx === idx;

            return (
              <g
                key={d.date}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => setHoverIdx(isHovered ? null : idx)}
                className="cursor-pointer"
              >
                <rect
                  x={xBase - 3}
                  y={16}
                  width={36}
                  height={138}
                  rx={6}
                  fill="currentColor"
                  fillOpacity={isHovered ? 0.07 : 0}
                />
                <rect
                  x={xBase}
                  y={148 - creditH}
                  width={13}
                  height={creditH}
                  rx={3}
                  style={{ fill: 'var(--khata-credit)' }}
                />
                <rect
                  x={xBase + 16}
                  y={148 - payH}
                  width={13}
                  height={payH}
                  rx={3}
                  style={{ fill: 'var(--khata-payment)' }}
                />
                <text
                  x={xBase + 14}
                  y={166}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="currentColor"
                  fillOpacity="0.65"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

/**
 * Responsive SVG Collection Trend Line Chart for Weekly / Monthly trends.
 */
const CollectionTrendChart: React.FC<{
  series: EnhancedReportData['dailySeries'];
}> = ({ series }) => {
  if (series.length < 2) {
    return (
      <p className="text-sm text-[var(--khata-text-secondary)] py-6 text-center">
        Switch to Weekly or Monthly to view multi-day collection trends.
      </p>
    );
  }

  const width = 460;
  const height = 160;
  const padX = 24;
  const padY = 18;
  const maxVal = Math.max(
    1,
    ...series.map((d) => Math.max(d.payment, d.credit))
  );

  const buildPoints = (key: 'payment' | 'credit') =>
    series
      .map((d, idx) => {
        const x =
          padX +
          (idx / Math.max(1, series.length - 1)) * (width - padX * 2);
        const y = height - 28 - (d[key] / maxVal) * (height - 28 - padY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[165px]"
      role="img"
      aria-label="Collection and credit trend line chart"
    >
      <polyline
        fill="none"
        stroke="var(--khata-credit)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.7"
        points={buildPoints('credit')}
      />
      <polyline
        fill="none"
        stroke="var(--khata-payment)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={buildPoints('payment')}
      />
      {series.map((d, idx) => {
        const showLabel =
          idx === 0 ||
          idx === series.length - 1 ||
          idx === Math.floor(series.length / 2);
        const x =
          padX +
          (idx / Math.max(1, series.length - 1)) * (width - padX * 2);
        const yPay = height - 28 - (d.payment / maxVal) * (height - 28 - padY);
        return (
          <g key={d.date}>
            <circle
              cx={x}
              cy={yPay}
              r={series.length <= 10 ? 3.5 : 2}
              style={{ fill: 'var(--khata-payment)' }}
            />
            {showLabel && (
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.65"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Feature 2: Enhanced Business Reports & Visual Analytics Screen
 * Backed by GET /api/reports/enhanced with PDF/CSV export, Print, and Share.
 */
export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  shopName,
  customers,
  entries,
  t,
  onBack,
}) => {
  const [period, setPeriod] = useState<ReportPeriodType>('weekly');
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [report, setReport] = useState<EnhancedReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchEnhancedReportApi({
      period,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
    })
      .then((res) => {
        if (active) setReport(res.report);
      })
      .catch(() => {
        if (active) setReport(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period, startDate, endDate, customers.length, entries.length]);

  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.id === period)?.label ?? 'Business';

  const handleDownloadPdf = () => {
    if (!report) return;
    downloadBusinessReportPdf({
      shopName,
      periodLabel,
      startDate: report.startDate,
      endDate: report.endDate,
      totalCredit: report.totalCredit,
      totalPayments: report.totalPayments,
      totalOutstanding: report.totalOutstanding,
      entryCount: report.entryCount,
      newCustomersAdded: report.newCustomersAdded,
      transactions: report.transactions,
    });
    setShareNotice('PDF report downloaded');
    window.setTimeout(() => setShareNotice(null), 2500);
  };

  const handleExportCsv = () => {
    if (!report) return;
    downloadBusinessReportCsv({
      shopName,
      period: report.period,
      startDate: report.startDate,
      endDate: report.endDate,
      transactions: report.transactions,
    });
    setShareNotice('CSV exported');
    window.setTimeout(() => setShareNotice(null), 2500);
  };

  const handleShare = async () => {
    if (!report) return;
    const summaryText = `${shopName} — ${periodLabel} Report (${report.startDate} to ${report.endDate})\nUdhaar Given: ₹${formatINRNumber(report.totalCredit)} (${report.creditCount} entries)\nPayments Collected: ₹${formatINRNumber(report.totalPayments)} (${report.paymentCount} entries)\nTotal Outstanding: ₹${formatINRNumber(report.totalOutstanding)}\nNew Customers Added: ${report.newCustomersAdded}`;
    const outcome = await shareReportText({
      title: `${shopName} ${periodLabel} Report`,
      text: summaryText,
    });
    setShareNotice(
      outcome === 'shared'
        ? 'Report shared'
        : outcome === 'copied'
        ? 'Report summary copied to clipboard'
        : 'Could not share report'
    );
    window.setTimeout(() => setShareNotice(null), 2800);
  };

  const maxTopOutstanding = Math.max(
    1,
    ...(report?.topCustomersByOutstanding.map((c) => c.outstanding) ?? [1])
  );

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] overflow-x-hidden">
      <CornerLines className="absolute top-0 right-0 w-56 h-40 text-[var(--khata-text)] print:hidden" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 space-y-6">
        {/* Top Bar + Export Actions */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label={t.back}
              data-testid="reports-back-btn"
              className="lg:hidden min-h-[44px] min-w-[44px] rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0 print:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Business Reports
              </h1>
              <p className="text-xs sm:text-sm text-[var(--khata-text-secondary)]">
                {shopName} ·{' '}
                {report
                  ? report.startDate === report.endDate
                    ? formatShortDate(report.startDate, {
                        today: t.today,
                        yesterday: t.yesterday,
                      })
                    : `${report.startDate} to ${report.endDate}`
                  : 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              disabled={!report}
              data-testid="report-download-pdf-btn"
              onClick={handleDownloadPdf}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              disabled={!report}
              data-testid="report-export-csv-btn"
              onClick={handleExportCsv}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:border-[var(--khata-accent)] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              disabled={!report}
              data-testid="report-print-btn"
              onClick={() => window.print()}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:border-[var(--khata-accent)] disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              disabled={!report}
              data-testid="report-share-btn"
              onClick={() => void handleShare()}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--khata-surface)] border border-[var(--khata-border)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:border-[var(--khata-accent)] disabled:opacity-50"
            >
              {shareNotice ? (
                <Check className="w-4 h-4 text-[var(--khata-payment)]" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </header>

        {shareNotice && (
          <p
            role="status"
            data-testid="report-export-status"
            className="text-xs font-bold text-[var(--khata-payment)]"
          >
            {shareNotice}
          </p>
        )}

        {/* Period Switcher Tabs */}
        <section className="space-y-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`report-tab-${opt.id}`}
                onClick={() => setPeriod(opt.id)}
                className={`min-h-[42px] px-4 rounded-xl text-sm font-bold transition-colors ${
                  period === opt.id
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface)] border border-[var(--khata-border)] text-[var(--khata-text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {loading && (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--khata-accent)] ml-2" />
            )}
          </div>

          {period === 'custom' && (
            <div className="rounded-[18px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm"
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
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {!report ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--khata-accent)]" />
          </div>
        ) : (
          <>
            {/* Key Accounting Metric Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
                  <span>Udhaar Given</span>
                  <ArrowUpRight className="w-4 h-4 text-[#FF6B5E]" />
                </div>
                <p
                  data-testid="report-total-credit"
                  className="text-2xl font-extrabold tabular-nums mt-1.5"
                  style={{ color: 'var(--khata-credit)' }}
                >
                  ₹{formatINRNumber(report.totalCredit)}
                </p>
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[11px] text-[var(--khata-text-secondary)]">
                    {report.creditCount} entries
                  </span>
                  <DeltaBadge delta={report.previousPeriod.creditDeltaPercent} />
                </div>
              </div>

              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
                  <span>Payments Collected</span>
                  <ArrowDownLeft className="w-4 h-4 text-[var(--khata-payment)]" />
                </div>
                <p
                  data-testid="report-total-payments"
                  className="text-2xl font-extrabold tabular-nums mt-1.5"
                  style={{ color: 'var(--khata-payment)' }}
                >
                  ₹{formatINRNumber(report.totalPayments)}
                </p>
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[11px] text-[var(--khata-text-secondary)]">
                    {report.paymentCount} entries
                  </span>
                  <DeltaBadge delta={report.previousPeriod.paymentDeltaPercent} />
                </div>
              </div>

              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
                  <span>Total Outstanding</span>
                  <BarChart3 className="w-4 h-4 text-[var(--khata-lavender)]" />
                </div>
                <p
                  data-testid="report-total-outstanding"
                  className="text-2xl font-extrabold tabular-nums mt-1.5"
                >
                  ₹{formatINRNumber(report.totalOutstanding)}
                </p>
                <p className="text-[11px] text-[var(--khata-text-secondary)] mt-1">
                  Unpaid balance across shop
                </p>
              </div>

              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
                  <span>Transactions</span>
                </div>
                <p className="text-2xl font-extrabold tabular-nums mt-1.5">
                  {report.entryCount}
                </p>
                <p className="text-[11px] text-[var(--khata-text-secondary)] mt-1">
                  {report.activeCustomersInPeriod} active customers
                </p>
              </div>

              <div className="col-span-2 lg:col-span-1 rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--khata-text-secondary)]">
                  <span>New Customers</span>
                  <UserPlus className="w-4 h-4 text-[var(--khata-accent)]" />
                </div>
                <p className="text-2xl font-extrabold tabular-nums mt-1.5">
                  {report.newCustomersAdded}
                </p>
                <p className="text-[11px] text-[var(--khata-text-secondary)] mt-1">
                  Added in this period
                </p>
              </div>
            </section>

            {/* Visual Analytics Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div
                data-testid="report-bar-chart"
                className="lg:col-span-7 rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5"
              >
                <h2 className="text-base font-bold mb-3">
                  Credit vs. Payment Activity
                </h2>
                <ActivityBarChart series={report.dailySeries} />
              </div>

              <div
                data-testid="report-trend-chart"
                className="lg:col-span-5 rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-bold">Collection Trend</h2>
                  <span className="text-[11px] text-[var(--khata-text-secondary)]">
                    Prev period: ₹{formatINRNumber(report.previousPeriod.totalPayments)}
                  </span>
                </div>
                <CollectionTrendChart series={report.dailySeries} />
              </div>
            </section>

            {/* Customer Rankings & Increasing Balances */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Top Customers by Outstanding */}
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
                <h2 className="text-base font-bold mb-3">
                  Top Pending Customers
                </h2>
                {report.topCustomersByOutstanding.length === 0 ? (
                  <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                    All customer balances are settled.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {report.topCustomersByOutstanding.map((c) => {
                      const pct = Math.max(
                        8,
                        Math.round((c.outstanding / maxTopOutstanding) * 100)
                      );
                      return (
                        <div key={c.customerId} className="space-y-1">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="font-semibold truncate">
                              {c.customerName}
                            </span>
                            <span
                              className="font-extrabold tabular-nums shrink-0"
                              style={{ color: 'var(--khata-credit)' }}
                            >
                              ₹{formatINRNumber(c.outstanding)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--khata-surface-elevated)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: 'var(--khata-credit)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Customers by Credit in Period */}
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
                <h2 className="text-base font-bold mb-3">
                  Top Credit in Period
                </h2>
                {report.topCustomersByCredit.length === 0 ? (
                  <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                    No credit entries in this period.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {report.topCustomersByCredit.map((c) => (
                      <div
                        key={c.customerId}
                        className="rounded-xl bg-[var(--khata-surface-elevated)] px-3.5 py-2.5 flex items-center justify-between gap-2"
                      >
                        <p className="text-sm font-semibold truncate">
                          {c.customerName}
                        </p>
                        <div className="text-right tabular-nums text-xs font-bold shrink-0">
                          <p style={{ color: 'var(--khata-credit)' }}>
                            Udhaar ₹{formatINRNumber(c.credit)}
                          </p>
                          <p style={{ color: 'var(--khata-payment)' }}>
                            Paid ₹{formatINRNumber(c.payment)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Increasing Balances */}
              <div className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
                <h2 className="text-base font-bold mb-3">
                  Increasing Balances
                </h2>
                {report.increasingBalanceCustomers.length === 0 ? (
                  <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                    No customers increased their pending balance in this period.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {report.increasingBalanceCustomers.map((c) => (
                      <div
                        key={c.customerId}
                        className="rounded-xl bg-[var(--khata-surface-elevated)] px-3.5 py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {c.customerName}
                          </p>
                          <p className="text-[11px] text-[var(--khata-text-secondary)]">
                            Total pending: ₹{formatINRNumber(c.currentOutstanding)}
                          </p>
                        </div>
                        <span
                          className="text-xs font-extrabold tabular-nums shrink-0"
                          style={{ color: 'var(--khata-credit)' }}
                        >
                          +₹{formatINRNumber(c.periodNetIncrease)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Day-by-Day Table */}
            <section className="rounded-[20px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
              <h2 className="text-base font-bold mb-3">Day-by-Day Summary</h2>
              {report.dailyBreakdown.length === 0 ? (
                <p className="text-sm text-[var(--khata-text-secondary)] py-4 text-center">
                  No transactions recorded in this date range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-[var(--khata-border)] text-xs text-[var(--khata-text-secondary)]">
                        <th className="py-2 pr-4 font-semibold">Date</th>
                        <th className="py-2 px-3 font-semibold">Transactions</th>
                        <th className="py-2 px-3 font-semibold text-right">
                          Udhaar Given
                        </th>
                        <th className="py-2 pl-3 font-semibold text-right">
                          Payments Collected
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.dailyBreakdown.map((day) => (
                        <tr
                          key={day.date}
                          className="border-b last:border-b-0 border-[var(--khata-border)]"
                        >
                          <td className="py-2.5 pr-4 font-semibold">
                            {formatShortDate(day.date, {
                              today: t.today,
                              yesterday: t.yesterday,
                            })}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-[var(--khata-text-secondary)]">
                            {day.count}
                          </td>
                          <td
                            className="py-2.5 px-3 text-right font-bold tabular-nums"
                            style={{ color: 'var(--khata-credit)' }}
                          >
                            -₹{formatINRNumber(day.credit)}
                          </td>
                          <td
                            className="py-2.5 pl-3 text-right font-bold tabular-nums"
                            style={{ color: 'var(--khata-payment)' }}
                          >
                            +₹{formatINRNumber(day.payment)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Accounting Accuracy Disclaimer */}
            <p className="text-xs text-[var(--khata-text-secondary)]">
              {report.accountingNote}
            </p>
          </>
        )}
      </main>
    </div>
  );
};
