import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, Info, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { FormError, FormNotice } from '../ui/FormKit';
import { btn, pill, statusTone, table } from '../ui/theme';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { ItemWithRelations, Location } from '../../types/asset-management';
import { buildTextWorkbook } from '../../utils/employee-import';
import { formatETB } from '../../utils/eth-date';
import { CheckedReceiptRow, RECEIPT_FIELDS, RECEIPT_HEADINGS, checkReceiptRows, readReceiptFile, receiptTemplateRows } from '../../utils/receipt-import';

type Outcome = 'ready' | 'error' | 'imported' | 'failed';
const OUTCOME_STYLE: Record<Outcome, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: statusTone.approved },
  error: { label: 'Skipped', tone: statusTone.rejected },
  imported: { label: 'Imported', tone: statusTone.approved },
  failed: { label: 'Not saved', tone: statusTone.rejected },
};

type Row = CheckedReceiptRow & { outcome: Outcome; message?: string; itemCode?: string };

/**
 * Receipts from a spreadsheet: one row is one receipt line, the same as one "Receive items" form. Each row is
 * checked the way the form checks it, previewed, then registered as a historical receipt that waits for approval.
 */
export const ReceiptImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  locations: Location[];
  items: ItemWithRelations[];
}> = ({ isOpen, onClose, onImported, locations, items }) => {
  const toast = useToast();
  const { user } = useAuth();
  const keepers = useStoreKeepers();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<'checking' | { done: number; of: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFileName('');
    setRows(null);
    setError(null);
    setFinished(false);
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const workbook = buildTextWorkbook(receiptTemplateRows(), 'Receipts');
    const url = URL.createObjectURL(new Blob([workbook as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipts-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy('checking');
    try {
      const sheet = await readReceiptFile(file);
      if (sheet.missing.length > 0) {
        setError(`The sheet is missing these columns: ${sheet.missing.map((c) => RECEIPT_HEADINGS[c]).join(', ')}. Use the template headings.`);
        return;
      }
      if (sheet.rows.length === 0) {
        setError('The sheet has headings but no receipt rows.');
        return;
      }
      if (sheet.rows.length > 1000) {
        setError(`The sheet has ${sheet.rows.length} rows; import up to 1,000 at a time.`);
        return;
      }
      const checked = checkReceiptRows(sheet.rows, {
        locations,
        storeMen: keepers.ofStore,
        existing: items.filter((i) => !i.parentItemId).map((i) => ({ slipNumber: i.ifmisSlipNumber, name: i.name, itemCode: i.itemCode })),
        today: new Date().toISOString().slice(0, 10),
      });
      setRows(checked.map((c) => ({ ...c, outcome: c.error ? 'error' : 'ready', message: c.error })));
    } catch (err: any) {
      setError(err.message || 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const ready = rows?.filter((r) => r.outcome === 'ready') ?? [];

  const apply = async () => {
    if (!rows || !user) return;
    const list = [...rows];
    let saved = 0;
    let failed = 0;
    // One at a time, so each receipt gets its own number and a failure stops only its own row
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.outcome !== 'ready' || !r.payload) continue;
      setBusy({ done: saved + failed, of: ready.length });
      try {
        const res = await api.registerStockIn({ ...r.payload, registeredById: user.id });
        list[i] = { ...r, outcome: 'imported', itemCode: res.items?.[0]?.itemCode ?? res.item?.itemCode };
        saved++;
      } catch (err: any) {
        list[i] = { ...r, outcome: 'failed', message: err.message || 'The server refused this row.' };
        failed++;
      }
      setRows([...list]);
    }
    setBusy(null);
    setFinished(true);
    if (saved > 0) onImported();
    if (failed === 0) {
      toast.success('Receipts imported', `${saved} ${saved === 1 ? 'receipt is' : 'receipts are'} waiting for Team Leader endorsement.`);
    } else {
      toast.warning('Imported, with rows not saved', `${saved} imported, ${failed} not saved. The reasons are listed.`);
    }
  };

  // Problems first, so they are seen
  const shown = useMemo(() => {
    const rank: Record<Outcome, number> = { failed: 0, error: 1, ready: 2, imported: 3 };
    return [...(rows ?? [])].sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.sheet.row - b.sheet.row);
  }, [rows]);
  const skipped = rows?.filter((r) => r.outcome === 'error').length ?? 0;
  const imported = rows?.filter((r) => r.outcome === 'imported').length ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import Model 19 receipts from Excel" subtitle="Register opening stock or many receipts at once" size="xl">
      <div className="space-y-4">
        {!rows && (
          <>
            <FormNotice icon={Info}>
              <p>One row is one receipt line, the same as one Receive items form. The template has these columns:</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {RECEIPT_FIELDS.map((f) => (
                  <span
                    key={f.key}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] ${f.required ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {f.heading}
                    {f.required && ' *'}
                  </span>
                ))}
              </p>
              <p className="mt-1.5">
                * required. An empty condition is recorded as Good. Imported receipts are marked historical, need no scanned slip, and wait
                for Team Leader endorsement and Department Head approval like any other receipt. You'll see a preview before anything is saved.
              </p>
            </FormNotice>

            <label
              htmlFor="receipt-import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"
            >
              {busy === 'checking' ? <RefreshCw className="h-7 w-7 animate-spin text-emerald-700" /> : <FileSpreadsheet className="h-7 w-7 text-emerald-700" />}
              <span className="text-sm font-semibold text-slate-900">{busy === 'checking' ? `Checking ${fileName}…` : 'Choose an Excel (.xlsx) or CSV file'}</span>
              <span className="text-[11px] text-slate-500">The first sheet is read. Up to 1,000 rows per file.</span>
              <input
                ref={inputRef}
                id="receipt-import-file"
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                disabled={busy !== null || !keepers.ready}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>

            <button type="button" onClick={downloadTemplate} className={btn.row}>
              <Download className={btn.rowIcon} />
              Download template
            </button>
          </>
        )}

        <FormError message={error} />

        {rows && (
          <>
            <p className="text-xs text-slate-600">
              <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5 text-emerald-700" />
              <span className="font-semibold text-slate-900">{fileName}</span> · {rows.length} rows
            </p>

            {finished && rows.some((r) => r.outcome === 'failed') && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Some rows were not saved and are listed first with the reason. Correct them in the file and import it again; rows already imported are
                  recognised and skipped.
                </span>
              </div>
            )}

            <div className="max-h-[22rem] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-[1]">
                  <tr className={table.headRow}>
                    <th className="px-3 py-2 w-14 text-right">Row</th>
                    <th className="px-3 py-2">Model 19 No.</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r.sheet.row} className={r.outcome === 'error' || r.outcome === 'failed' ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{r.sheet.row}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${table.code}`}>{r.sheet.slipNumber || '—'}</td>
                      <td className="px-3 py-2 text-slate-900">
                        {r.sheet.name || '—'}
                        {r.storeLabel && <span className="block text-[11px] text-slate-500">{r.storeLabel}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.payload?.items?.[0]?.quantity ?? r.sheet.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.payload ? formatETB(r.payload.unitCostETB) : r.sheet.unitPrice}</td>
                      <td className="px-3 py-2">
                        <span className={`${pill} ${OUTCOME_STYLE[r.outcome].tone}`}>{OUTCOME_STYLE[r.outcome].label}</span>
                        {r.itemCode && <span className="ml-2 font-mono text-[11px] text-slate-600">{r.itemCode}</span>}
                        {r.message && <span className="ml-2 text-[11px] text-red-700">{r.message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-600">
                {typeof busy === 'object' && busy
                  ? `Importing ${busy.done + 1} of ${busy.of}…`
                  : finished
                    ? `${imported} imported. They wait for Team Leader endorsement.`
                    : ready.length > 0
                      ? `${ready.length} ${ready.length === 1 ? 'receipt' : 'receipts'} will be registered.${skipped ? ` ${skipped} ${skipped === 1 ? 'row has' : 'rows have'} problems and will be skipped.` : ''}`
                      : 'Nothing to import: every row has a problem.'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Choose another file
                </button>
                {finished ? (
                  <button type="button" onClick={close} className={btn.primary}>
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </button>
                ) : (
                  <button type="button" onClick={apply} disabled={ready.length === 0 || busy !== null} className={btn.primary}>
                    {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Import {ready.length} {ready.length === 1 ? 'receipt' : 'receipts'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
