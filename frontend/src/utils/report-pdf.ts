/**
 * The Reports page's PDF: an A4 landscape document laid out as an official register report. A header band with the
 * report's title, a summary of what it covers, the register table (repeated headings, figures right-aligned, a totals
 * row), the three signatures, and on every page its number, when and by whom it was produced.
 *
 * The built-in PDF font has no Ethiopic letters, so every text here is in Latin script (the E.C. date in English).
 */

export interface ReportPdfInput {
  /** e.g. "Asset Register: All Assets" */
  title: string;
  /** Label and value pairs printed in the summary box: period, category, location, counts, valuation… */
  summary: [string, string][];
  /** Column headings of the register table */
  head: string[];
  /** One row per register line, as text */
  rows: string[][];
  /** The totals row under the table, aligned with the headings ("" leaves a cell empty) */
  totals?: string[];
  /** Columns whose figures are right-aligned (indexes into head) */
  numeric: number[];
  /** Relative widths of the columns; the rest share what is left */
  widths?: Record<number, number>;
  dateGc: string;
  /** In English, e.g. "Tikimt 17, 2019 E.C." */
  dateEc: string;
  preparedBy?: string;
}

const GREEN: [number, number, number] = [10, 63, 36];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];

/** Text the built-in font can draw: Ethiopic and other letters it lacks would come out as garbage */
export const pdfSafe = (text: string): string => text.replace(/[^\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim();

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

/** The header band: the ministry and the system on the left, the title and date on the right */
function drawHeader(doc: Doc, m: number, title: string, dateLine: string) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pw, 54, 'F');
  // The national colours as a thin ribbon under it
  doc.setFillColor(7, 137, 48);
  doc.rect(0, 54, pw / 3, 3, 'F');
  doc.setFillColor(252, 221, 9);
  doc.rect(pw / 3, 54, pw / 3, 3, 'F');
  doc.setFillColor(218, 18, 26);
  doc.rect((pw * 2) / 3, 54, pw / 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', m, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('MINISTRY OF AGRICULTURE', m, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Asset Tracking System', m, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(pdfSafe(title), pw - m, 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(dateLine, pw - m, 45, { align: 'right' });
}

/** Every page: what this is, page X of Y, when and by whom */
function drawFooters(doc: Doc, m: number, dateGc: string, preparedBy?: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.line(m, ph - 26, pw - m, ph - 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Ministry of Agriculture · Asset Tracking System', m, ph - 15);
    doc.text(`Page ${p} of ${pages}`, pw / 2, ph - 15, { align: 'center' });
    const by = preparedBy ? ` by ${pdfSafe(preparedBy)}` : '';
    doc.text(`Produced ${dateGc}${by}`, pw - m, ph - 15, { align: 'right' });
  }
}

/** The report as a PDF file */
export async function buildReportPdf(input: ReportPdfInput): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 28;

  drawHeader(doc, m, input.title, `${pdfSafe(input.dateEc)}  ·  ${input.dateGc} (G.C.)`);

  // ── Summary box: what the report covers, four pairs to a row
  const cols = 4;
  const cellW = (pw - m * 2) / cols;
  const rowsOfSummary = Math.ceil(input.summary.length / cols);
  const boxTop = 70;
  const boxH = rowsOfSummary * 26 + 8;
  doc.setDrawColor(...LINE);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(m, boxTop, pw - m * 2, boxH, 3, 3, 'FD');
  input.summary.forEach(([label, value], i) => {
    const x = m + 10 + (i % cols) * cellW;
    const y = boxTop + 14 + Math.floor(i / cols) * 26;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(label).toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(pdfSafe(value) || '-', cellW - 16)[0] ?? '-', x, y + 11);
  });

  // ── The register table: headings on every page, figures right-aligned, totals at the end
  const columnStyles: Record<number, { halign?: 'right'; cellWidth?: number }> = {};
  for (const i of input.numeric) columnStyles[i] = { ...columnStyles[i], halign: 'right' };
  for (const [i, w] of Object.entries(input.widths ?? {})) columnStyles[Number(i)] = { ...columnStyles[Number(i)], cellWidth: w };
  autoTable(doc, {
    head: [input.head.map(pdfSafe)],
    body: input.rows.map((r) => r.map((c) => pdfSafe(String(c ?? '')))),
    foot: input.totals ? [input.totals.map((c) => pdfSafe(c))] : undefined,
    showFoot: 'lastPage',
    startY: boxTop + boxH + 12,
    theme: 'grid',
    margin: { left: m, right: m, top: 40, bottom: 34 },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3.5, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [236, 242, 238], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles,
    // Headings of numeric columns line up with their figures
    didParseCell: (data) => {
      if ((data.section === 'head' || data.section === 'foot') && input.numeric.includes(data.column.index)) data.cell.styles.halign = 'right';
    },
    // Pages after the first: the report's name above the table
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...GREEN);
        doc.text(`${pdfSafe(input.title)} (continued)`, m, 26);
      }
    },
  });

  // ── Signatures, kept together: on a new page when the last one has no room
  const tableEnd = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  let y = tableEnd + 34;
  if (y + 90 > ph - 34) {
    doc.addPage();
    y = 70;
  }
  const signers = ['Prepared by (Property Administration Officer)', 'Verified by (Store Controller)', 'Approved by (Director, Property Administration)'];
  const sw = (pw - m * 2) / 3;
  signers.forEach((who, i) => {
    const x = m + i * sw;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(who, x + sw / 2, y, { align: 'center' });
    doc.setDrawColor(...MUTED);
    doc.line(x + 24, y + 42, x + sw - 24, y + 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Name, signature and date', x + sw / 2, y + 52, { align: 'center' });
  });

  drawFooters(doc, m, input.dateGc, input.preparedBy);
  return doc.output('blob');
}

export interface RecordPdfInput {
  /** e.g. "Item Record" */
  title: string;
  /** The item code, printed large under the header */
  code: string;
  /** The item's name, beside the code */
  name: string;
  /** e.g. "In store", shown as a tag beside the name */
  status?: string;
  /** Label and value sections: Item, Holding, Model 19 receipt… */
  sections: { title: string; rows: [string, string][] }[];
  /** The history, newest first: date, action, by, from → to, notes */
  history: string[][];
  dateGc: string;
  dateEc: string;
  preparedBy?: string;
}

/** One item's record as a PDF: A4 portrait, its details in labelled sections, then its history */
export async function buildRecordPdf(input: RecordPdfInput): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const m = 36;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;

  drawHeader(doc, m, input.title, `${pdfSafe(input.dateEc)}  ·  ${input.dateGc} (G.C.)`);

  // ── The item: code, name and status
  doc.setFont('courier', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...GREEN);
  doc.text(pdfSafe(input.code), m, 88);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const name = doc.splitTextToSize(pdfSafe(input.name) || '-', pw - m * 2 - 120);
  doc.text(name, m, 106);
  if (input.status) {
    const tag = pdfSafe(input.status).toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const w = doc.getTextWidth(tag) + 14;
    doc.setFillColor(236, 242, 238);
    doc.setDrawColor(...GREEN);
    doc.roundedRect(pw - m - w, 76, w, 16, 3, 3, 'FD');
    doc.setTextColor(...GREEN);
    doc.text(tag, pw - m - w / 2, 87, { align: 'center' });
  }
  let y = 106 + name.length * 13 + 8;

  // ── Each section: a heading bar and label / value rows
  const section = (title: string, head: string[] | null, body: string[][], columnStyles: Record<number, object>) => {
    autoTable(doc, {
      head: [[{ content: pdfSafe(title).toUpperCase(), colSpan: head ? head.length : 2 }], ...(head ? [head.map(pdfSafe)] : [])],
      body: body.map((r) => r.map((c) => pdfSafe(c) || '-')),
      startY: y,
      theme: 'grid',
      margin: { left: m, right: m, top: 40, bottom: 34 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [244, 246, 248], textColor: GREEN, fontStyle: 'bold', fontSize: 8 },
      columnStyles,
      didParseCell: (data) => {
        // The column headings of a table section (the row under its title) in grey
        if (data.section === 'head' && data.row.index === 1) {
          data.cell.styles.textColor = MUTED;
          data.cell.styles.fontSize = 7.5;
        }
      },
    });
    y = lastY() + 14;
  };
  for (const s of input.sections) {
    section(s.title, null, s.rows, { 0: { cellWidth: 150, textColor: MUTED }, 1: { fontStyle: 'bold' } });
  }
  section(
    `History (${input.history.length})`,
    ['Date', 'Action', 'By', 'From / to, notes'],
    input.history.length ? input.history : [['No history recorded.', '', '', '']],
    { 0: { cellWidth: 92, fontSize: 7.5 }, 1: { cellWidth: 110, fontStyle: 'bold' }, 2: { cellWidth: 120 } },
  );

  drawFooters(doc, m, input.dateGc, input.preparedBy);
  return doc.output('blob');
}
