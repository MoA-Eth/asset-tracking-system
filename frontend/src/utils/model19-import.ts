/**
 * Receiving many Model 19s at once from an Excel template. One row per Model 19 line, with the Model 19's header
 * (number, PO, date, store…) on each row; rows with the same Model 19 No. and PO number are one receipt. Each receipt
 * is sent as the receive form sends it: a stock-in request waiting for approval, with the same server checks.
 *
 * Separate from reading Model 19 PDFs (slip-reader): nothing here changes how a PDF is read.
 */
import { AssetCategory, CreateStockInRequest, ItemCondition, ItemType } from '../types/asset-management';
import { CATEGORY_FROM_IFMIS, COMMON_CATEGORIES, COMMON_UOMS, TRANSACTION_TYPES, itemTypeFromIfmisCode, provisionFromSlip } from '../components/assets/receipt-options';

/** The template's columns, in order, as their headers read */
export const TEMPLATE_COLUMNS = [
  'Model 19 No.',
  'PO No.',
  'Received Date (G.C.)',
  'Transaction Type',
  'Source / Supplier',
  'Buyer',
  'Program / Project',
  'Receiving Store',
  'Delivered By',
  'IFMIS Item Code',
  'Item Description',
  'UoM',
  'Category',
  'Item Type',
  'Quantity',
  'Unit Price (ETB)',
  'VAT 15%',
  'Remark',
  'Is Count Data?',
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];

const SHEET = 'Model 19 lines';
const EXAMPLE_MARK = 'e.g.';
const EARLIEST_YEAR = 2000;

export interface StoreOption {
  id: string;
  label: string;
}

export interface ImportLine {
  /** The row on the sheet, for pointing at problems */
  row: number;
  ifmisItemCode: string;
  name: string;
  uom: string;
  category?: AssetCategory;
  categoryLabel: string;
  itemType?: ItemType;
  quantity: number;
  unitPrice: number;
  vat: boolean;
  remark: string;
  /** Quantity × unit price, VAT added when it applies */
  total: number;
  isHistoricalData?: boolean;
  problems: string[];
}

export interface ImportReceipt {
  model19No: string;
  poNumber: string;
  receivedDate: string;
  transactionType: string;
  source: string;
  buyer: string;
  programName: string;
  storeLocationId?: string;
  storeLabel: string;
  deliveredBy: string;
  lines: ImportLine[];
  isHistoricalData?: boolean;
  /** Problems with the receipt as a whole (its header), each naming its row */
  problems: string[];
}

/** A receipt can be sent when neither it nor any of its lines has a problem */
export const receiptOk = (r: ImportReceipt) => r.problems.length === 0 && r.lines.every((l) => l.problems.length === 0);

const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
  }
  return String(v).trim();
};
const number = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = text(v).replace(/,/g, '').replace(/\s+/g, '');
  return s === '' ? NaN : Number(s);
};

/** A date as Excel gives it (a date, a serial number, or text in YYYY-MM-DD or DD/MM/YYYY), as YYYY-MM-DD */
export const toIsoDate = (v: unknown): string | undefined => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return ymd(new Date(Date.UTC(1899, 11, 30) + v * 864e5));
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return undefined;
};

const categoryOf = (label: string): AssetCategory | undefined => {
  const l = label.trim().toLowerCase();
  if (!l) return undefined;
  const byLabel = COMMON_CATEGORIES.find((c) => c.label.toLowerCase() === l || c.value.toLowerCase() === l.replace(/[\s&/]+/g, '_'));
  if (byLabel) return byLabel.value;
  // An IFMIS category name, e.g. "Medical Supplies & Related Accessories"
  return CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(label))?.[1];
};

const typeOf = (label: string, code: string): ItemType | undefined => {
  const l = label.trim().toLowerCase();
  if (/^fixed/.test(l)) return ItemType.FIXED;
  if (/^consum/.test(l)) return ItemType.CONSUMABLE;
  return itemTypeFromIfmisCode(code);
};

/** Reads the template's rows into receipts, checking each as the receive form would before sending */
export function receiptsFromRows(
  rows: { row: number; get: (c: Column) => unknown }[],
  stores: StoreOption[],
  today = new Date(),
): ImportReceipt[] {
  const byKey = new Map<string, ImportReceipt>();
  const todayIso = toIsoDate(today)!;
  for (const r of rows) {
    const no = text(r.get('Model 19 No.'));
    const line = {
      code: text(r.get('IFMIS Item Code')),
      name: text(r.get('Item Description')),
    };
    // Blank rows, and the template's example row, are skipped
    if (!no && !line.name && !line.code) continue;
    if (no.toLowerCase().startsWith(EXAMPLE_MARK)) continue;

    const po = text(r.get('PO No.'));
    const key = `${no.toLowerCase()}|${po.toLowerCase()}`;
    const date = toIsoDate(r.get('Received Date (G.C.)'));
    const storeLabel = text(r.get('Receiving Store'));
    const normalizeStore = (s: string) => s.replace(/[\s\-_·\.\/]+/g, ' ').trim().toLowerCase();
    const normStoreLabel = normalizeStore(storeLabel);
    const countVal = text(r.get('Is Count Data?' as Column)) || text(r.get('Physical Count?' as any)) || text(r.get('Physical Count (ቆጠራ)' as any)) || text(r.get('Count Data?' as any));
    const isCount = /^(y|yes|true|1|✓|አዎ)$/i.test(countVal) || no.toLowerCase().startsWith('count-') || no.toLowerCase().startsWith('ቆጠራ');
    const store =
      stores.find((s) => {
        const normS = normalizeStore(s.label);
        if (normS === normStoreLabel || s.id.toLowerCase() === storeLabel.trim().toLowerCase()) return true;
        const sTokens = new Set(normS.split(' ').filter(Boolean));
        const inputTokens = new Set(normStoreLabel.split(' ').filter(Boolean));
        if (sTokens.size > 0 && inputTokens.size > 0 && [...inputTokens].every((t) => sTokens.has(t)) && [...sTokens].every((t) => inputTokens.has(t))) {
          return true;
        }
        return false;
      }) ||
      (normStoreLabel
        ? stores.find((s) => {
            const normS = normalizeStore(s.label);
            const inputTokens = normStoreLabel.split(' ').filter((t) => t.length >= 3);
            return (inputTokens.length > 0 && inputTokens.every((t) => normS.includes(t))) || normS.includes(normStoreLabel);
          })
        : undefined);
    const header = {
      receivedDate: date ?? '',
      transactionType: text(r.get('Transaction Type')) || (po ? 'PO Receipt' : 'Donation / Grant Receipt'),
      source: text(r.get('Source / Supplier')),
      buyer: text(r.get('Buyer')),
      programName: text(r.get('Program / Project')),
      storeLabel,
      deliveredBy: text(r.get('Delivered By')),
    };

    let receipt = byKey.get(key);
    if (!receipt) {
      receipt = { model19No: no, poNumber: po, ...header, storeLocationId: store?.id, isHistoricalData: isCount, lines: [], problems: [] };
      const p = receipt.problems;
      if (!no) p.push(`Row ${r.row}: Model 19 No. is missing.`);
      if (!date) p.push(`Row ${r.row}: Received date is missing or not a date (use YYYY-MM-DD).`);
      else if (Number(date.slice(0, 4)) < EARLIEST_YEAR) p.push(`Row ${r.row}: Received date ${date} is before ${EARLIEST_YEAR}: check the year.`);
      else if (date > todayIso) p.push(`Row ${r.row}: Received date ${date} is in the future.`);
      if (!storeLabel) p.push(`Row ${r.row}: Receiving store is missing.`);
      else if (!store) p.push(`Row ${r.row}: Receiving store "${storeLabel}" is not a store in the system. Choose one from the list.`);
      if (!TRANSACTION_TYPES.includes(header.transactionType)) p.push(`Row ${r.row}: Transaction type "${header.transactionType}" is not one of the list.`);
      byKey.set(key, receipt);
    } else {
      // The header is the Model 19's: the same on every line of it
      for (const [field, label] of [['receivedDate', 'Received date'], ['storeLabel', 'Receiving store'], ['source', 'Source / supplier'], ['transactionType', 'Transaction type']] as const) {
        if (header[field] && receipt[field] && header[field].toLowerCase() !== receipt[field].toLowerCase()) {
          receipt.problems.push(`Row ${r.row}: ${label} "${header[field]}" differs from the first line of Model 19 ${no} ("${receipt[field]}").`);
        }
      }
    }

    const quantity = number(r.get('Quantity'));
    const unitPrice = number(r.get('Unit Price (ETB)'));
    const categoryLabel = text(r.get('Category'));
    const category = categoryOf(categoryLabel);
    const itemType = typeOf(text(r.get('Item Type')), line.code);
    const vat = /^(y|yes|true|1|✓)$/i.test(text(r.get('VAT 15%')));
    const problems: string[] = [];
    if (!line.name) problems.push('Item description is missing.');
    if (!Number.isFinite(quantity) || quantity <= 0) problems.push('Quantity must be a number above 0.');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) problems.push('Unit price must be a number (0 or more).');
    if (!category) problems.push(categoryLabel ? `Category "${categoryLabel}" is not one of the list.` : 'Category is missing.');
    if (!itemType) problems.push('Item type is missing: write Fixed asset or Consumable, or give the IFMIS item code.');

    // Intra-receipt duplicate row check: detect when this line duplicates an earlier row on the same Model 19
    const normName = line.name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const prevMatch = receipt.lines.find((prev) => {
      const prevNorm = prev.name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      const sameName = Boolean(normName && prevNorm && normName === prevNorm);
      const sameCodeAndPrice = Boolean(
        line.code && prev.ifmisItemCode &&
        line.code.trim().toLowerCase() === prev.ifmisItemCode.trim().toLowerCase() &&
        Number.isFinite(unitPrice) && Number.isFinite(prev.unitPrice) &&
        unitPrice > 0 && Math.abs(unitPrice - prev.unitPrice) < 0.005
      );
      return sameName || sameCodeAndPrice;
    });
    if (prevMatch) {
      problems.push(`Duplicates item on Row ${prevMatch.row} ("${prevMatch.name}"). Increase quantity on Row ${prevMatch.row} instead of adding a duplicate row.`);
    }
    const base = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0;
    receipt.lines.push({
      row: r.row,
      ifmisItemCode: line.code,
      name: line.name,
      uom: (text(r.get('UoM')) || 'EA').toUpperCase(),
      category,
      categoryLabel: COMMON_CATEGORIES.find((c) => c.value === category)?.label ?? categoryLabel,
      itemType,
      quantity,
      unitPrice,
      vat,
      remark: text(r.get('Remark')),
      isHistoricalData: isCount,
      total: round2(base + (vat ? round2(base * 0.15) : 0)),
      problems,
    });
  }
  return [...byKey.values()];
}

/** The receive request for one receipt, as the receive form builds it */
export function stockInRequestFor(receipt: ImportReceipt, registeredById: string): CreateStockInRequest {
  const items = receipt.lines.map((l) => ({
    ifmisItemCode: l.ifmisItemCode || undefined,
    name: l.name,
    category: l.category,
    itemType: l.itemType,
    serialNumber: '',
    unitCostETB: l.unitPrice,
    condition: ItemCondition.NEW,
    uom: l.uom,
    itemCategoryDisplay: l.categoryLabel,
    quantity: l.quantity,
    totalAmount: l.total,
    vatApplicable: l.vat,
    additionalCharges: 0,
    remark: l.remark || undefined,
  }));
  const provisionType = provisionFromSlip(receipt.poNumber);
  const donation = provisionType === 'DONATION';
  const first = items[0];
  return {
    ...first,
    category: first.category as AssetCategory,
    serialNumber: '',
    storeLocationId: receipt.storeLocationId!,
    ifmisSlipNumber: receipt.model19No,
    ifmisSlipDateGc: receipt.receivedDate,
    isHistoricalData: Boolean(receipt.isHistoricalData),
    registeredById,
    notes: first.remark,
    provisionType,
    poNumber: donation ? undefined : receipt.poNumber || undefined,
    transactionType: receipt.transactionType,
    source: receipt.source || undefined,
    donor: donation ? receipt.source || undefined : undefined,
    buyer: donation ? undefined : receipt.buyer || undefined,
    programName: receipt.programName || undefined,
    deliveredBy: receipt.deliveredBy || undefined,
    items,
  };
}

/** Reads an uploaded template (.xlsx) into receipts */
export async function readModel19File(file: File, stores: StoreOption[]): Promise<ImportReceipt[]> {
  if (file?.name?.toLowerCase().endsWith('.csv') || file?.type === 'text/csv') {
    throw new Error('CSV files are not supported for Model 19 bulk import. Please use the Excel (.xlsx) template.');
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('This file is not a valid Excel workbook (.xlsx). Please use the official Excel template.');
  }
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheet to read.');
  // Columns found by their header, so a column moved or added in Excel still reads
  const head = ws.getRow(1);
  const at = new Map<string, number>();
  head.eachCell((c, i) => at.set(text(c.value).toLowerCase(), i));
  const missing = ['Model 19 No.', 'Received Date (G.C.)', 'Receiving Store', 'Item Description', 'Quantity', 'Unit Price (ETB)'].filter((c) => !at.has(c.toLowerCase()));
  if (missing.length) throw new Error(`This is not the Model 19 template: column${missing.length > 1 ? 's' : ''} ${missing.join(', ')} not found. Download the Excel template and use it.`);
  const rows: { row: number; get: (c: Column) => unknown }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    rows.push({ row: n, get: (c) => { const i = at.get(c.toLowerCase()); return i ? r.getCell(i).value : undefined; } });
  });
  return receiptsFromRows(rows, stores);
}

/** The template to fill in: the lines sheet (with an example row and lists to choose from) */
export async function buildModel19Template(stores: StoreOption[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const font = { name: 'Arial', size: 10 };
  const headFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0A3F24' } };
  const exampleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF1F5F9' } };
  const exampleFont = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };

  const sheet = wb.addWorksheet(SHEET, { views: [{ showGridLines: true, state: 'frozen', ySplit: 1, xSplit: 0 }] });
  const lists = wb.addWorksheet('Lists');
  lists.state = 'hidden';

  // Lists to choose from (kept on their own hidden sheet)
  const listColumns: [string, string[]][] = [
    ['Transaction Type', TRANSACTION_TYPES],
    ['Receiving Store', stores.map((s) => s.label)],
    ['Category', COMMON_CATEGORIES.map((c) => c.label)],
    ['Item Type', ['Fixed asset', 'Consumable']],
    ['UoM', COMMON_UOMS.map((u: { value: string } | string) => (typeof u === 'string' ? u : u.value))],
    ['VAT 15%', ['Yes', 'No']],
    ['Is Count Data?', ['Yes', 'No']],
  ];
  listColumns.forEach(([name, values], i) => {
    const c = i + 1;
    lists.getCell(1, c).value = name;
    lists.getCell(1, c).font = { ...font, bold: true };
    values.forEach((v, j) => { lists.getCell(j + 2, c).value = v; });
    lists.getColumn(c).width = 34;
  });
  const listRange = (name: string) => {
    const i = listColumns.findIndex(([n]) => n === name);
    const col = String.fromCharCode(65 + i);
    return `Lists!$${col}$2:$${col}$${Math.max(listColumns[i][1].length + 1, 2)}`;
  };

  // The lines sheet
  const head = sheet.addRow([...TEMPLATE_COLUMNS]);
  head.eachCell((c) => { c.font = headFont; c.fill = headFill; c.alignment = { wrapText: true, vertical: 'middle' }; });
  head.height = 30;
  const widths: Partial<Record<Column, number>> = {
    'Model 19 No.': 18,
    'PO No.': 14,
    'Received Date (G.C.)': 22,
    'Transaction Type': 22,
    'Source / Supplier': 28,
    Buyer: 20,
    'Program / Project': 26,
    'Receiving Store': 34,
    'Delivered By': 20,
    'IFMIS Item Code': 20,
    'Item Description': 36,
    UoM: 12,
    Category: 32,
    'Item Type': 16,
    Quantity: 14,
    'Unit Price (ETB)': 18,
    'VAT 15%': 12,
    Remark: 26,
    'Is Count Data?': 18,
  };
  TEMPLATE_COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = widths[c] ?? 16; });

  // One example (in slate; starts with "e.g." so it is never imported)
  const example: Record<Column, string | number> = {
    'Model 19 No.': `${EXAMPLE_MARK} 0000014`,
    'PO No.': '193',
    'Received Date (G.C.)': '2026-03-26',
    'Transaction Type': 'PO Receipt',
    'Source / Supplier': 'Ethio Telecom',
    Buyer: 'Abduselam Ali',
    'Program / Project': 'PACT',
    'Receiving Store': stores[0]?.label ?? 'Saris-Development · Saris',
    'Delivered By': 'Abduselam Ali',
    'IFMIS Item Code': '305101101.0086',
    'Item Description': 'Lap Top Computer',
    UoM: 'EA',
    Category: COMMON_CATEGORIES[0].label,
    'Item Type': 'Fixed asset',
    Quantity: 32,
    'Unit Price (ETB)': 204158.79,
    'VAT 15%': 'Yes',
    Remark: '',
    'Is Count Data?': 'No',
  };
  const ex = sheet.addRow(TEMPLATE_COLUMNS.map((c) => example[c]));
  ex.height = 24;
  ex.eachCell((c) => {
    c.font = exampleFont;
    c.fill = exampleFill;
    c.border = thinBorder;
    c.alignment = { vertical: 'middle' };
  });

  // Room for 500 lines, clean white cells with subtle borders and data validation
  const validation = (name: string) => ({ type: 'list' as const, allowBlank: true, formulae: [listRange(name)], showErrorMessage: true, errorTitle: name, error: `Choose a ${name.toLowerCase()} from the list` });
  for (let r = 3; r <= 502; r++) {
    const row = sheet.getRow(r);
    row.height = 22;
    TEMPLATE_COLUMNS.forEach((c, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.font = font;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle' };
      if (listColumns.some(([n]) => n === c)) cell.dataValidation = validation(c);
      if (c === 'Received Date (G.C.)') cell.numFmt = 'yyyy-mm-dd';
      if (c === 'Quantity' || c === 'Unit Price (ETB)') cell.numFmt = '#,##0.00';
    });
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Saves a workbook buffer as a file */
export function saveWorkbook(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
