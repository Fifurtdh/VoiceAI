import { formatINRNumber } from './format';

/**
 * Clean CSV & valid PDF export + share utilities for Voice Khata reports and customer statements.
 * Generates genuine, standards-compliant PDF binary bytes (PDF 1.4 Type1 Helvetica) with zero external
 * dependencies, and UTF-8 BOM CSV files so Hindi/Kannada/regional names open cleanly in Excel.
 */

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  // UTF-8 BOM ensures Excel renders Devanagari/Kannada names cleanly
  return `\uFEFF${lines.join('\r\n')}`;
}

export function triggerBlobDownload(
  content: string | Uint8Array,
  filename: string,
  mimeType: string
): void {
  const blobPart: BlobPart =
    content instanceof Uint8Array
      ? content.slice().buffer
      : content;
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Sanitizes text to printable Latin-1 for built-in PDF Helvetica font
 * (replaces ₹ with "Rs." and strips unsupported glyphs cleanly).
 */
function pdfSafeText(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .trim();
}

export interface PdfReportInput {
  shopName: string;
  title: string;
  periodLabel: string;
  generatedAt: string;
  summaryLines: Array<{ label: string; value: string }>;
  tableHeaders: string[];
  tableRows: string[][];
  footerNote?: string;
}

/**
 * Builds a clean, multi-page PDF 1.4 binary document with shop header, summary block, and tabular ledger rows.
 */
export function buildSimplePdfBytes(input: PdfReportInput): Uint8Array {
  const pageWidth = 595; // A4 pt
  const pageHeight = 842;
  const marginX = 44;
  const maxLinesPerPage = 44;

  const lines: Array<{ text: string; size: number; bold?: boolean; gap?: number }> = [
    { text: input.shopName, size: 17, bold: true, gap: 22 },
    { text: `${input.title}  |  ${input.periodLabel}`, size: 11, bold: true, gap: 16 },
    { text: `Generated: ${input.generatedAt}`, size: 9, gap: 18 },
    { text: '------------------------------------------------------------------------------------', size: 9, gap: 14 },
  ];

  for (const s of input.summaryLines) {
    lines.push({
      text: `${s.label}: ${s.value}`,
      size: 10.5,
      bold: true,
      gap: 15,
    });
  }

  lines.push({
    text: '------------------------------------------------------------------------------------',
    size: 9,
    gap: 16,
  });

  if (input.tableHeaders.length > 0) {
    lines.push({
      text: input.tableHeaders.join('   |   '),
      size: 9.5,
      bold: true,
      gap: 15,
    });
    for (const row of input.tableRows.slice(0, 140)) {
      lines.push({
        text: row.join('   |   ').slice(0, 96),
        size: 8.8,
        gap: 13.5,
      });
    }
  }

  if (input.footerNote) {
    lines.push({ text: '', size: 8, gap: 12 });
    lines.push({ text: input.footerNote.slice(0, 96), size: 8, gap: 12 });
  }

  // Paginate lines cleanly
  const pages: Array<typeof lines> = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push([]);

  // Build PDF objects:
  // 1: Catalog, 2: Pages, 3: Helvetica Regular, 4: Helvetica Bold,
  // then for each page: content stream + page object
  const objects: string[] = [];
  const pageObjNumbers: number[] = [];

  // Placeholder slots 1..4
  objects.push('');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  for (let p = 0; p < pages.length; p++) {
    const pageLines = pages[p];
    let y = pageHeight - 54;
    const cmds: string[] = ['BT'];
    for (const ln of pageLines) {
      const fontRef = ln.bold ? '/F2' : '/F1';
      cmds.push(`${fontRef} ${ln.size} Tf`);
      cmds.push(`1 0 0 1 ${marginX} ${y.toFixed(1)} Tm`);
      cmds.push(`(${pdfSafeText(ln.text)}) Tj`);
      y -= ln.gap ?? 14;
    }
    cmds.push(`/F1 8 Tf 1 0 0 1 ${marginX} 28 Tm (Voice Khata - Page ${p + 1} of ${pages.length}) Tj`);
    cmds.push('ET');

    const streamStr = cmds.join('\n');
    const contentObjNum = objects.length + 1;
    objects.push(
      `<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream`
    );

    const pageObjNum = objects.length + 1;
    pageObjNumbers.push(pageObjNum);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`
    );
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNumbers.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function downloadBusinessReportCsv(params: {
  shopName: string;
  period: string;
  startDate: string;
  endDate: string;
  transactions: Array<{
    date: string;
    createdAt: string;
    customerName: string;
    direction: 'credit' | 'payment';
    amount: number;
    note?: string;
  }>;
}): void {
  const csv = buildCsvContent(
    ['Date', 'Time', 'Customer', 'Type', 'Amount (INR)', 'Note'],
    params.transactions.map((t) => [
      t.date,
      new Date(t.createdAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      t.customerName,
      t.direction === 'credit' ? 'Credit (Udhaar)' : 'Payment Received',
      t.amount,
      t.note || '',
    ])
  );
  const safeShop = params.shopName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  triggerBlobDownload(
    csv,
    `${safeShop}_${params.period}_${params.startDate}_to_${params.endDate}.csv`,
    'text/csv;charset=utf-8'
  );
}

export function downloadBusinessReportPdf(params: {
  shopName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalCredit: number;
  totalPayments: number;
  totalOutstanding: number;
  entryCount: number;
  newCustomersAdded: number;
  transactions: Array<{
    date: string;
    customerName: string;
    direction: 'credit' | 'payment';
    amount: number;
    note?: string;
  }>;
}): void {
  const bytes = buildSimplePdfBytes({
    shopName: params.shopName,
    title: `${params.periodLabel} Business Report`,
    periodLabel:
      params.startDate === params.endDate
        ? params.startDate
        : `${params.startDate} to ${params.endDate}`,
    generatedAt: new Date().toLocaleString('en-IN'),
    summaryLines: [
      { label: 'Total Credit (Udhaar) Given', value: `Rs. ${formatINRNumber(params.totalCredit)}` },
      { label: 'Total Payments Collected', value: `Rs. ${formatINRNumber(params.totalPayments)}` },
      { label: 'Total Pending Outstanding', value: `Rs. ${formatINRNumber(params.totalOutstanding)}` },
      { label: 'Transactions in Period', value: String(params.entryCount) },
      { label: 'New Customers Added', value: String(params.newCustomersAdded) },
    ],
    tableHeaders: ['Date', 'Customer', 'Type', 'Amount', 'Note'],
    tableRows: params.transactions.map((t) => [
      t.date,
      t.customerName,
      t.direction === 'credit' ? 'Udhaar' : 'Payment',
      `Rs. ${formatINRNumber(t.amount)}`,
      t.note || '-',
    ]),
    footerNote:
      'Note: Credit, payments, and outstanding balances are tracked separately. Profit is not calculated.',
  });
  const safeShop = params.shopName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  triggerBlobDownload(
    bytes,
    `${safeShop}_${params.periodLabel.toLowerCase()}_report_${params.endDate}.pdf`,
    'application/pdf'
  );
}

export function downloadCustomerStatementCsv(params: {
  shopName: string;
  customerName: string;
  entries: Array<{
    date: string;
    createdAt: string;
    direction: 'credit' | 'payment';
    amount: number;
    runningBalance: number;
    note?: string;
    undone?: boolean;
  }>;
}): void {
  const csv = buildCsvContent(
    ['Date', 'Time', 'Type', 'Amount (INR)', 'Running Balance (INR)', 'Status', 'Note'],
    params.entries.map((e) => [
      e.date,
      new Date(e.createdAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      e.direction === 'credit' ? 'Credit (Udhaar)' : 'Payment Received',
      e.amount,
      e.runningBalance,
      e.undone ? 'Reversed/Undone' : 'Active',
      e.note || '',
    ])
  );
  const safeName = params.customerName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  triggerBlobDownload(
    csv,
    `${safeName}_khata_statement.csv`,
    'text/csv;charset=utf-8'
  );
}

export function downloadCustomerStatementPdf(params: {
  shopName: string;
  customerName: string;
  phone: string;
  outstanding: number;
  totalCredit: number;
  totalPayments: number;
  entries: Array<{
    date: string;
    direction: 'credit' | 'payment';
    amount: number;
    runningBalance: number;
    note?: string;
    undone?: boolean;
  }>;
}): void {
  const bytes = buildSimplePdfBytes({
    shopName: params.shopName,
    title: `Customer Khata Statement - ${params.customerName}`,
    periodLabel: params.phone ? `Phone: ${params.phone}` : 'Complete Statement',
    generatedAt: new Date().toLocaleString('en-IN'),
    summaryLines: [
      { label: 'Current Outstanding Balance', value: `Rs. ${formatINRNumber(Math.max(0, params.outstanding))}` },
      { label: 'Total Credit Given', value: `Rs. ${formatINRNumber(params.totalCredit)}` },
      { label: 'Total Payments Received', value: `Rs. ${formatINRNumber(params.totalPayments)}` },
    ],
    tableHeaders: ['Date', 'Type', 'Amount', 'Running Bal', 'Note'],
    tableRows: params.entries
      .filter((e) => !e.undone)
      .map((e) => [
        e.date,
        e.direction === 'credit' ? 'Udhaar' : 'Payment',
        `Rs. ${formatINRNumber(e.amount)}`,
        `Rs. ${formatINRNumber(e.runningBalance)}`,
        e.note || '-',
      ]),
  });
  const safeName = params.customerName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  triggerBlobDownload(
    bytes,
    `${safeName}_khata_statement.pdf`,
    'application/pdf'
  );
}

export async function shareReportText(params: {
  title: string;
  text: string;
}): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: params.title, text: params.text });
      return 'shared';
    }
  } catch {
    // User cancelled or share unavailable — fall through to clipboard copy
  }
  try {
    await navigator.clipboard.writeText(params.text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
