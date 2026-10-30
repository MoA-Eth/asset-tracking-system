import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, RefreshCw, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { FormError, FormNotice } from '../ui/FormKit';
import { btn, pill, statusTone, table } from '../ui/theme';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getSystemSettings } from '../../utils/system-settings';
import { formatETB } from '../../utils/eth-date';
import {
  buildModel19Template,
  ImportReceipt,
  readModel19File,
  receiptOk,
  saveWorkbook,
  stockInRequestFor,
  StoreOption,
} from '../../utils/model19-import';

/** What became of a receipt once sent: received (waiting for approval) or refused by the server, and why */
type Sent = { ok: true } | { ok: false; reason: string };

/**
 * Receive several Model 19s from the Excel template. Every receipt and its problems are shown before anything is sent;
 * only receipts without a problem are sent, one by one, as the receive form sends them (each waits for approval).
 */
export const Model19ImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  stores: StoreOption[];
}> = ({ isOpen, onClose, onImported, stores }) => {
  const toast = useToast();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [receipts, setReceipts] = useState<ImportReceipt[] | null>(null);
  const [busy, setBusy] = useState<'reading' | 'sending' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Map<string, Sent>>(new Map());
  // An Excel file carries no scanned slip: with scans required, nothing can be received from it
  const scanRequired = getSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  const keyOf = (r: ImportReceipt) => `${r.model19No}|${r.poNumber}`;
  const reset = () => {
    setFileName('');
    setReceipts(null);
    setError(null);
    setSent(new Map());
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const downloadTemplate = async () => {
    try {
      saveWorkbook(await buildModel19Template(stores), 'model-19-import-template.xlsx');
    } catch {
      toast.error('Template not created', 'Try again.');
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setSent(new Map());
    setBusy('reading');
    try {
      const read = await readModel19File(file, stores);
      if (read.length === 0) throw new Error('No Model 19 lines found. Fill in the "Model 19 lines" sheet (from row 3) and try again.');
      setReceipts(read);
    } catch (e: any) {
      setReceipts(null);
      setError(e?.message || 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const ready = (receipts ?? []).filter(receiptOk);
  const withProblems = (receipts ?? []).length - ready.length;

  const send = async () => {
    if (!receipts || ready.length === 0 || !user?.id) return;
    setBusy('sending');
    const results = new Map<string, Sent>();
    // One by one: a receipt the server refuses (e.g. already received) does not stop the others
    for (const r of ready) {
      try {
        await api.registerStockIn(stockInRequestFor(r, user.id));
        results.set(keyOf(r), { ok: true });
      } catch (e: any) {
        results.set(keyOf(r), { ok: false, reason: e?.message || 'Refused by the server' });
      }
      setSent(new Map(results));
    }
    setBusy(null);
    const received = [...results.values()].filter((x) => x.ok).length;
    const refused = results.size - received;
    if (received > 0) onImported();
    if (refused === 0) toast.success('Model 19s received', `${received} ${received === 1 ? 'receipt is' : 'receipts are'} waiting for approval.`);
    else toast.warning('Some receipts were not received', `${received} received, ${refused} refused: see why below.`);
  };

  const statusOf = (r: ImportReceipt) => {
    const s = sent.get(keyOf(r));
    if (s?.ok) return <span className={`${pill} ${statusTone.approved}`}>Received · waiting for approval</span>;
    if (s && !s.ok) return <span className={`${pill} ${statusTone.rejected}`}>Refused</span>;
    return receiptOk(r) ? <span className={`${pill} ${statusTone.inStore}`}>Ready</span> : <span className={`${pill} ${statusTone.rejected}`}>Not sent: fix the file</span>;
  };

  const done = sent.size > 0 && busy === null;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import Model 19s from Excel" subtitle="Receive several Model 19s at once, from the template" size="xl">
      <div className="space-y-4">
        {scanRequired && (
          <FormNotice icon={AlertTriangle} tone="warn">
            A scanned copy of the slip is required on every receipt (Settings → System), and an Excel file has none. Receive these Model 19s on the
            receive form with their scans, or make the scan optional first.
          </FormNotice>
        )}

        {!receipts && (
          <>
            <FormNotice icon={Info}>
              <p>
                Fill in the template: one row per Model 19 line, with the Model 19's header (No., PO No., date, store…) on every row of it. Rows with
                the same Model 19 No. and PO No. are one receipt, so a file can hold many Model 19s.
              </p>
              <p className="mt-1.5">
                Each receipt is received as on the receive form: it waits for approval, with the same checks. You'll see every receipt, and any
                problem by row, before anything is sent.
              </p>
            </FormNotice>

            <label
              htmlFor="model19-import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"
            >
              {busy === 'reading' ? <RefreshCw className="h-7 w-7 animate-spin text-emerald-700" /> : <FileSpreadsheet className="h-7 w-7 text-emerald-700" />}
              <span className="text-sm font-semibold text-slate-900">{busy === 'reading' ? `Reading ${fileName}…` : 'Choose the filled-in template (.xlsx)'}</span>
              <span className="text-[11px] text-slate-500">The "Model 19 lines" sheet is read.</span>
              <input
                ref={inputRef}
                id="model19-import-file"
                type="file"
                accept=".xlsx"
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>

            <div className="flex justify-between">
              <button type="button" onClick={downloadTemplate} className={btn.row}>
                <Download className={btn.rowIcon} />
                Download template
              </button>
            </div>
          </>
        )}

        <FormError message={error} />

        {receipts && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                <b>{fileName}</b>: {receipts.length} Model 19{receipts.length === 1 ? '' : 's'},{' '}
                {receipts.reduce((n, r) => n + r.lines.length, 0)} lines · <b>{ready.length} ready</b>
                {withProblems > 0 && <span className="text-rose-700"> · {withProblems} with problems (not sent)</span>}
              </p>
              {!done && (
                <button type="button" onClick={reset} disabled={busy !== null} className={btn.row}>
                  <Upload className={btn.rowIcon} />
                  Choose another file
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-left text-xs" aria-label="Model 19s in the file">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-3 py-2">Model 19 No.</th>
                    <th className="px-3 py-2">PO No.</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2 text-right">Lines</th>
                    <th className="px-3 py-2 text-right">Total (ETB)</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipts.map((r) => {
                    const refused = sent.get(keyOf(r));
                    const problems = [...r.problems, ...r.lines.flatMap((l) => l.problems.map((p) => `Row ${l.row}: ${p}`))];
                    return (
                      <tr key={keyOf(r)} className="align-top">
                        <td className="px-3 py-2 font-mono">{r.model19No || '—'}</td>
                        <td className="px-3 py-2 font-mono">{r.poNumber || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.receivedDate || '—'}</td>
                        <td className="px-3 py-2">{r.storeLabel || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.lines.length}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatETB(r.lines.reduce((s, l) => s + l.total, 0))}</td>
                        <td className="px-3 py-2">
                          {statusOf(r)}
                          {problems.length > 0 && (
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-rose-700">
                              {problems.map((p) => <li key={p}>{p}</li>)}
                            </ul>
                          )}
                          {refused && 'reason' in refused && <p className="mt-1 text-[11px] text-rose-700">{refused.reason}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {done ? (
                <>
                  <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {[...sent.values()].filter((x) => x.ok).length} received and waiting for approval.
                  </span>
                  <button type="button" onClick={close} className={btn.primary}>Close</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={close} disabled={busy !== null} className={btn.secondary}>Cancel</button>
                  <button type="button" onClick={send} disabled={busy !== null || ready.length === 0 || scanRequired} className={btn.primary}>
                    {busy === 'sending' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {busy === 'sending' ? `Receiving ${sent.size + 1} of ${ready.length}…` : `Receive ${ready.length} Model 19${ready.length === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
