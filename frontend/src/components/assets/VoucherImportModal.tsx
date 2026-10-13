import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, Info, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FormError, FormNotice } from '../ui/FormKit';
import { btn, pill, statusTone, table } from '../ui/theme';
import { useToast } from '../../context/ToastContext';
import { buildTextWorkbook } from '../../utils/employee-import';
import { Sheet, SheetField, SheetRow } from '../../utils/sheet-import';
import { CheckedRow } from '../../utils/voucher-imports';
import { SLIP_ACCEPT_ATTR } from '../../utils/slip-upload';

type Outcome = 'ready' | 'error' | 'imported' | 'failed';
const OUTCOME_STYLE: Record<Outcome, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: statusTone.approved },
  error: { label: 'Skipped', tone: statusTone.rejected },
  imported: { label: 'Imported', tone: statusTone.approved },
  failed: { label: 'Not saved', tone: statusTone.rejected },
};

type Row<P> = CheckedRow<P> & { outcome: Outcome; message?: string; savedAs?: string };

export interface VoucherImportProps<K extends string, P> {
  isOpen: boolean;
  onClose: () => void;
  /** Called once anything was saved, so the page reloads */
  onImported: () => void;
  title: string;
  subtitle: string;
  /** What one row becomes: ['receipt', 'receipts'] */
  noun: [string, string];
  /** Heading of the voucher number column in the preview, e.g. "Model 22 No." */
  voucherHeading: string;
  fields: SheetField<K>[];
  /** What the import does, under the list of columns */
  notice: React.ReactNode;
  templateName: string;
  template: string[][];
  read: (file: File) => Promise<Sheet<K>>;
  check: (rows: SheetRow<K>[]) => CheckedRow<P>[];
  /** Saves one row; returns what to show beside it (e.g. the new item code) */
  submit: (payload: P) => Promise<string | undefined>;
  /** False while what the checks need is still loading */
  ready?: boolean;
  maxRows?: number;
  /** When set, a PDF or picture is taken too: it is handed here (e.g. to fill the open form) and the window closes */
  onSlip?: (file: File) => void;
  /** Why spreadsheets can't be imported right now, if they can't */
  sheetsBlocked?: string;
}

/**
 * Many vouchers from one spreadsheet: one row is one voucher, the same as filling in its form once. Every row is
 * checked the way the form checks it, the user sees the result first, then the good rows are saved one by one, each
 * waiting for approval like any other.
 */
export function VoucherImportModal<K extends string, P>({
  isOpen,
  onClose,
  onImported,
  title,
  subtitle,
  noun,
  voucherHeading,
  fields,
  notice,
  templateName,
  template,
  read,
  check,
  submit,
  ready: checksReady = true,
  maxRows = 1000,
  onSlip,
  sheetsBlocked,
}: VoucherImportProps<K, P>) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row<P>[] | null>(null);
  const [busy, setBusy] = useState<'checking' | { done: number; of: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plural = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;

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
    const workbook = buildTextWorkbook(template, 'Import');
    const url = URL.createObjectURL(new Blob([workbook as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // The file's type decides: a spreadsheet is imported; a slip (PDF or picture) goes to the form, if it takes one
    if (!/.(xlsx|xls|csv)$/i.test(file.name)) {
      if (onSlip) {
        onSlip(file);
        reset();
        onClose();
      } else {
        setError('Choose an Excel (.xlsx) or CSV file.');
      }
      return;
    }
    if (sheetsBlocked) return void setError(sheetsBlocked);
    reset();
    setFileName(file.name);
    setBusy('checking');
    try {
      const sheet = await read(file);
      const headings = Object.fromEntries(fields.map((f) => [f.key, f.heading])) as Record<K, string>;
      if (sheet.missing.length > 0) {
        setError(`The sheet is missing these columns: ${sheet.missing.map((c) => headings[c]).join(', ')}. Use the template headings.`);
        return;
      }
      if (sheet.rows.length === 0) return void setError('The sheet has headings but no rows.');
      if (sheet.rows.length > maxRows) return void setError(`The sheet has ${sheet.rows.length} rows; import up to ${maxRows.toLocaleString()} at a time.`);
      setRows(check(sheet.rows).map((c) => ({ ...c, outcome: c.error ? 'error' : 'ready', message: c.error })));
    } catch (err: any) {
      setError(err.message || 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const toSave = rows?.filter((r) => r.outcome === 'ready') ?? [];

  const apply = async () => {
    if (!rows) return;
    const list = [...rows];
    let saved = 0;
    let failed = 0;
    // One at a time, so each gets its own number and a failure stops only its own row
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.outcome !== 'ready' || !r.payload) continue;
      setBusy({ done: saved + failed, of: toSave.length });
      try {
        const savedAs = await submit(r.payload);
        list[i] = { ...r, outcome: 'imported', savedAs };
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
    if (failed === 0) toast.success('Imported', `${plural(saved)} waiting for Team Leader endorsement.`);
    else toast.warning('Imported, with rows not saved', `${saved} imported, ${failed} not saved. The reasons are listed.`);
  };

  // Problems first, so they are seen
  const shown = useMemo(() => {
    const rank: Record<Outcome, number> = { failed: 0, error: 1, ready: 2, imported: 3 };
    return [...(rows ?? [])].sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.sheet.row - b.sheet.row);
  }, [rows]);
  const skipped = rows?.filter((r) => r.outcome === 'error').length ?? 0;
  const imported = rows?.filter((r) => r.outcome === 'imported').length ?? 0;
  const inputId = `import-file-${templateName.replace(/\W+/g, '-')}`;

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} subtitle={subtitle} size="xl">
      <div className="space-y-4">
        {!rows && (
          <>
            <FormNotice icon={Info}>
              <p>One row is one {noun[0]}, the same as filling in its form once. The template has these columns:</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {fields.map((f) => (
                  <span
                    key={f.key}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] ${f.required ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {f.heading}
                    {f.required && ' *'}
                  </span>
                ))}
              </p>
              <p className="mt-1.5">* required. {notice} You'll see a preview before anything is saved.</p>
            </FormNotice>

            <label
              htmlFor={inputId}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"
            >
              {busy === 'checking' ? <RefreshCw className="h-7 w-7 animate-spin text-emerald-700" /> : <FileSpreadsheet className="h-7 w-7 text-emerald-700" />}
              <span className="text-sm font-semibold text-slate-900">{busy === 'checking' ? `Checking ${fileName}…` : onSlip ? 'Choose a slip (PDF or photo) or a spreadsheet (Excel or CSV)' : 'Choose an Excel (.xlsx) or CSV file'}</span>
              <span className="text-[11px] text-slate-500">
                {onSlip ? 'A slip fills in the form; a spreadsheet imports many at once (first sheet, ' : 'The first sheet is read, '}
                up to {maxRows.toLocaleString()} rows{onSlip ? ').' : '.'}
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={onSlip ? `${SLIP_ACCEPT_ATTR},.xlsx,.csv` : '.xlsx,.csv'}
                aria-label="File to import items from"
                className="sr-only"
                disabled={busy !== null || !checksReady}
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
                    <th className="px-3 py-2">{voucherHeading}</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r.sheet.row} className={r.outcome === 'error' || r.outcome === 'failed' ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{r.sheet.row}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${table.code}`}>{r.voucherNo || '—'}</td>
                      <td className="px-3 py-2 text-slate-900">
                        {r.itemLabel || '—'}
                        {r.detail && <span className="block text-[11px] text-slate-500">{r.detail}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.qty || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`${pill} ${OUTCOME_STYLE[r.outcome].tone}`}>{OUTCOME_STYLE[r.outcome].label}</span>
                        {r.savedAs && <span className="ml-2 font-mono text-[11px] text-slate-600">{r.savedAs}</span>}
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
                    : toSave.length > 0
                      ? `${plural(toSave.length)} will be registered.${skipped ? ` ${skipped} ${skipped === 1 ? 'row has' : 'rows have'} problems and will be skipped.` : ''}`
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
                  <button type="button" onClick={apply} disabled={toSave.length === 0 || busy !== null} className={btn.primary}>
                    {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Import {plural(toSave.length)}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
