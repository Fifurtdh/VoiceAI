/**
 * Formats a numeric value using Indian numbering system grouping (e.g. 1,23,456).
 */
export function formatINRNumber(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rounded);
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Formats an amount with the Rupee symbol (e.g. ₹1,23,456).
 */
export function formatINR(value: number): string {
  const prefix = value < 0 ? '-₹' : '₹';
  return `${prefix}${formatINRNumber(Math.abs(value))}`;
}

/**
 * Returns today's local date as YYYY-MM-DD.
 */
export function getTodayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns an ISO date offset by `daysOffset` from today.
 */
export function getOffsetDateISO(daysOffset: number, now: Date = new Date()): string {
  const copy = new Date(now);
  copy.setDate(copy.getDate() + daysOffset);
  return getTodayISO(copy);
}

/**
 * Formats YYYY-MM-DD into a compact human-readable label (e.g., "Today", "Yesterday", "19 Nov").
 */
export function formatShortDate(
  isoDate: string,
  labels: { today: string; yesterday: string } = { today: 'Today', yesterday: 'Yesterday' },
  now: Date = new Date()
): string {
  const today = getTodayISO(now);
  const yesterday = getOffsetDateISO(-1, now);
  if (isoDate === today) return labels.today;
  if (isoDate === yesterday) return labels.yesterday;

  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Extracts last 4 digits of a phone number for safe disambiguation display.
 */
export function getPhoneSuffix(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return digits || '0000';
  return digits.slice(-4);
}
