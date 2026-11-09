import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileEdit, FileSpreadsheet, Info, RefreshCw, Upload, XCircle } from 'lucide-react';
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

/** What became of a receipt once sent: received (waiting for approval), saved as draft, or refused by the server, and why */
type Sent = { ok: true; isDraft?: boolean } | { ok: false; reason: string };

export interface ImportDuplicateConflict {
  row: number;
  itemName: string;
  unitCostETB: number;
  matchType: 'DISPOSED' | 'AVAILABLE';
  existingItemCode: string;
  existingItemName: string;
  existingStatus: string;
  storeName?: string;
  disposedDate?: string;
  action: 'AUTO_EXCLUDED' | 'PROMPT_USER';
  message: string;
}

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
  const [originalReceipts, setOriginalReceipts] = useState<ImportReceipt[] | null>(null);
  const [receipts, setReceipts] = useState<ImportReceipt[] | null>(null);
  const [busy, setBusy] = useState<'reading' | 'sending' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Map<string, Sent>>(new Map());
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  // Duplicate resolution state
  const [conflicts, setConflicts] = useState<ImportDuplicateConflict[]>([]);
  const [decisions, setDecisions] = useState<Map<number, 'DISCARD' | 'FORCE_NEW'>>(new Map());
  const [showConflictReview, setShowConflictReview] = useState(false);
  const [hasAppliedDecisions, setHasAppliedDecisions] = useState(false);

  // An Excel file carries no scanned slip: with scans required, nothing can be received from it
  const scanRequired = getSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  const keyOf = (r: ImportReceipt) => `${r.model19No}|${r.poNumber}`;
  const reset = () => {
    setFileName('');
    setOriginalReceipts(null);
    setReceipts(null);
    setConflicts([]);
    setDecisions(new Map());
    setShowConflictReview(false);
    setHasAppliedDecisions(false);
    setError(null);
    setSent(new Map());
    setAllowDuplicates(false);
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
    setConflicts([]);
    setDecisions(new Map());
    setShowConflictReview(false);
    setHasAppliedDecisions(false);

    if (file.name?.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      setOriginalReceipts(null);
      setReceipts(null);
      setError('Please upload an Excel workbook (.xlsx). CSV files are not supported for Model 19 bulk import.');
      return;
    }

    setBusy('reading');
    try {
      const read = await readModel19File(file, stores);
      if (read.length === 0) throw new Error('No Model 19 lines found. Fill in the "Model 19 lines" sheet (from row 3) and try again.');
      setOriginalReceipts(read);
      setReceipts(read);

      // Pre-flight duplicate check against database records
      const linesToCheck: Array<{ row: number; name: string; unitCostETB: number; storeLocationId?: string }> = [];
      for (const r of read) {
        for (const l of r.lines) {
          linesToCheck.push({
            row: l.row,
            name: l.name,
            unitCostETB: l.unitPrice,
            storeLocationId: r.storeLocationId,
          });
        }
      }

      if (linesToCheck.length > 0) {
        try {
          const dupRes = await api.checkImportDuplicates(linesToCheck);
          if (dupRes && dupRes.totalDetected > 0) {
            setConflicts(dupRes.conflicts);
            const initDecisions = new Map<number, 'DISCARD' | 'FORCE_NEW'>();
            for (const c of dupRes.conflicts) {
              if (c.matchType === 'AVAILABLE') {
                initDecisions.set(c.row, 'DISCARD');
              }
            }
            setDecisions(initDecisions);
            setShowConflictReview(true);
          }
        } catch (dupErr) {
          console.warn('Duplicate pre-check skipped:', dupErr);
        }
      }
    } catch (e: any) {
      setOriginalReceipts(null);
      setReceipts(null);
      setError(e?.message || 'The file could not be read. Please use the official Excel (.xlsx) template.');
    } finally {
      setBusy(null);
    }
  };

  const applyResolutions = (activeDecisions: Map<number, 'DISCARD' | 'FORCE_NEW'> = decisions) => {
    if (!originalReceipts) return;
    const excludedRows = new Set<number>();
    let hasForceNew = false;
    for (const c of conflicts) {
      if (c.matchType === 'DISPOSED') {
        excludedRows.add(c.row);
      } else {
        const dec = activeDecisions.get(c.row) || 'DISCARD';
        if (dec === 'DISCARD') {
          excludedRows.add(c.row);
        } else {
          hasForceNew = true;
        }
      }
    }

    const filtered = originalReceipts
      .map((r) => ({
        ...r,
        lines: r.lines.filter((l) => !excludedRows.has(l.row)),
      }))
      .filter((r) => r.lines.length > 0);

    if (hasForceNew) {
      setAllowDuplicates(true);
    }
    setReceipts(filtered);
    setHasAppliedDecisions(true);
    setShowConflictReview(false);
  };

  const ready = (receipts ?? []).filter(receiptOk);
  const withProblems = (receipts ?? []).length - ready.length;
  const disposedCount = conflicts.filter((c) => c.matchType === 'DISPOSED').length;
  const availableCount = conflicts.filter((c) => c.matchType === 'AVAILABLE').length;

  const excludedRowsCount = conflicts.filter((c) => c.matchType === 'DISPOSED' || decisions.get(c.row) === 'DISCARD').length;

  const send = async (asDraft = false) => {
    if (!receipts || ready.length === 0 || !user?.id) return;
    setBusy('sending');
    const results = new Map<string, Sent>();
    // One by one: a receipt the server refuses (e.g. already received) does not stop the others
    for (const r of ready) {
      try {
        await api.registerStockIn({
          ...stockInRequestFor(r, user.id),
          action: asDraft ? 'SAVE_AS_DRAFT' : 'SUBMIT_FOR_APPROVAL',
          isDraft: asDraft,
          allowDuplicate: allowDuplicates,
        });
        results.set(keyOf(r), { ok: true, isDraft: asDraft });
      } catch (e: any) {
        results.set(keyOf(r), { ok: false, reason: e?.message || 'Refused by the server' });
      }
      setSent(new Map(results));
    }
    setBusy(null);
    const received = [...results.values()].filter((x) => x.ok).length;
    const refused = results.size - received;
    if (received > 0) onImported();
    if (refused === 0) {
      if (asDraft) {
        toast.success('Model 19 drafts saved', `${received} ${received === 1 ? 'draft is' : 'drafts are'} saved in Drafts.`);
      } else {
        toast.success('Model 19s received', `${received} ${received === 1 ? 'receipt is' : 'receipts are'} waiting for approval.`);
      }
    } else {
      toast.warning('Some receipts were not processed', `${received} processed, ${refused} refused: see why below.`);
    }
  };

  const statusOf = (r: ImportReceipt) => {
    const s = sent.get(keyOf(r));
    if (s?.ok) {
      return s.isDraft ? (
        <span className={`${pill} bg-slate-100 text-slate-700 border border-slate-300 font-medium`}>Saved in Drafts 📝</span>
      ) : (
        <span className={`${pill} ${statusTone.approved}`}>Received · waiting for approval</span>
      );
    }
    if (s && !s.ok) return <span className={`${pill} ${statusTone.rejected}`}>Refused</span>;
    return receiptOk(r) ? <span className={`${pill} ${statusTone.inStore}`}>Ready</span> : <span className={`${pill} ${statusTone.rejected}`}>Not sent: fix the file</span>;
  };

  const done = sent.size > 0 && busy === null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      onBack={close}
      breadcrumbs={[
        { label: 'Assets Register', onClick: close },
        { label: 'Import Model 19s' },
      ]}
      title="Import Model 19s from Excel"
      subtitle="Receive several Model 19s at once, from the template"
      size="xl"
    >
      <div className="space-y-4">
        {scanRequired && (
          <FormNotice icon={AlertTriangle} tone="warn">
            A scanned copy of the slip is required on every receipt (Settings → System). You can click <strong>Save as Drafts</strong> to import these rows into ATS now and attach their signed scans later, or make scans optional first before submitting directly for approval.
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
              <span className="text-[11px] text-slate-500">Excel format (.xlsx) only. The "Model 19 lines" sheet is read directly.</span>
              <input
                ref={inputRef}
                id="model19-import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>

            <div className="flex justify-between">
              <button type="button" onClick={downloadTemplate} className={btn.row}>
                <Download className={btn.rowIcon} />
                Download template (.xlsx)
              </button>
            </div>
          </>
        )}

        <FormError message={error} />

        {receipts && showConflictReview && (
          <div className="space-y-4">
            {/* Top Amber Banner matching user mockup */}
            <div className="rounded-lg border border-amber-300 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="font-medium">
                  <strong className="font-bold">{conflicts.length} Potential Duplicates Found.</strong> The items below might already be registered in {conflicts.find((c) => c.storeName)?.storeName || 'the store'}. Please review and choose what to do:
                </span>
              </div>
            </div>

            {availableCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs shadow-2xs">
                <span className="font-medium text-slate-700">
                  Do this for all {availableCount} items:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Map(decisions);
                      conflicts.filter((c) => c.matchType === 'AVAILABLE').forEach((c) => next.set(c.row, 'DISCARD'));
                      setDecisions(next);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 transition"
                  >
                    Discard All ({availableCount}) (Don't import)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Map(decisions);
                      conflicts.filter((c) => c.matchType === 'AVAILABLE').forEach((c) => next.set(c.row, 'FORCE_NEW'));
                      setDecisions(next);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 transition"
                  >
                    Import All as New ({availableCount}) (Additional items)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyResolutions(decisions)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 hover:bg-emerald-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition"
                    title="Apply current decisions and continue to preview immediately"
                  >
                    <span>Resolve Automatically</span>
                  </button>
                </div>
              </div>
            )}

            <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
              {conflicts.map((c) => {
                const isDisposed = c.matchType === 'DISPOSED';
                const currentDecision = decisions.get(c.row) || 'DISCARD';

                return (
                  <div
                    key={c.row}
                    className={`rounded-lg border p-4 transition-all shadow-2xs ${
                      isDisposed
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Header with row title and match badge */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <span className="text-xs font-bold text-slate-900">
                        Row {c.row}: {c.itemName} ({formatETB(c.unitCostETB)})
                      </span>
                      {isDisposed ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200">
                          <XCircle className="h-3 w-3 text-rose-600" />
                          Auto-Excluded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900 border border-amber-200">
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          Matches existing {c.existingItemCode} in {c.storeName || 'Store'}
                        </span>
                      )}
                    </div>

                    <div className="pt-3">
                      {isDisposed ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-rose-900">
                            ❌ Matches DISPOSED Asset {c.existingItemCode} ({c.disposedDate ? `Disposed ${c.disposedDate}` : 'Disposed'})
                          </p>
                          <p className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 rounded px-2.5 py-1 inline-block border border-rose-200">
                            [Auto-Excluded - Cannot import disposed item]
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Government asset disposal regulations strictly prohibit re-registering previously disposed items. This row will be excluded from the import batch.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Option 1: Duplicate (Discard) */}
                          <label
                            className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                              currentDecision === 'DISCARD'
                                ? 'border-slate-900 bg-slate-50/60 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`conflict-decision-${c.row}`}
                              checked={currentDecision === 'DISCARD'}
                              aria-label={`This is a duplicate (Already registered) - Skip row ${c.row}`}
                              onChange={() => {
                                const next = new Map(decisions);
                                next.set(c.row, 'DISCARD');
                                setDecisions(next);
                              }}
                              className="mt-0.5 h-4 w-4 text-slate-900 focus:ring-slate-900 border-slate-300"
                            />
                            <div className="flex-1">
                              <div className="text-xs font-bold text-slate-900">
                                This is a duplicate (Already registered)
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Skip this row; do not import.
                              </div>
                            </div>
                          </label>

                          {/* Option 2: Force New Unit */}
                          <label
                            className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                              currentDecision === 'FORCE_NEW'
                                ? 'border-slate-900 bg-slate-50/60 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`conflict-decision-${c.row}`}
                              checked={currentDecision === 'FORCE_NEW'}
                              aria-label={`This is a new, separate unit - Import row ${c.row}`}
                              onChange={() => {
                                const next = new Map(decisions);
                                next.set(c.row, 'FORCE_NEW');
                                setDecisions(next);
                              }}
                              className="mt-0.5 h-4 w-4 text-slate-900 focus:ring-slate-900 border-slate-300"
                            />
                            <div className="flex-1">
                              <div className="text-xs font-bold text-slate-900">
                                This is a new, separate unit
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Import it with a new asset ID.
                              </div>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-600 font-medium">
                <b>{disposedCount}</b> excluded ·{' '}
                <b>{conflicts.filter((c) => c.matchType === 'AVAILABLE' && (decisions.get(c.row) || 'DISCARD') === 'DISCARD').length}</b> to discard ·{' '}
                <b>{conflicts.filter((c) => c.matchType === 'AVAILABLE' && decisions.get(c.row) === 'FORCE_NEW').length}</b> to import as new
              </span>
              <div className="flex items-center gap-2">
                {hasAppliedDecisions && (
                  <button
                    type="button"
                    onClick={() => setShowConflictReview(false)}
                    className={btn.secondary}
                  >
                    Cancel / Back to Preview
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => applyResolutions(decisions)}
                  className="rounded-md bg-emerald-800 hover:bg-emerald-900 px-5 py-2 text-xs font-bold text-white shadow-xs transition"
                >
                  Apply Resolutions & Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {receipts && !showConflictReview && (
          <>
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <span>
                    <b>⚠️ {conflicts.length} duplicate conflicts evaluated:</b>{' '}
                    {disposedCount > 0 && `${disposedCount} disposed asset(s) auto-excluded, `}
                    {conflicts.filter((c) => c.matchType === 'AVAILABLE' && (decisions.get(c.row) || 'DISCARD') === 'DISCARD').length} re-count row(s) discarded,{' '}
                    {conflicts.filter((c) => c.matchType === 'AVAILABLE' && decisions.get(c.row) === 'FORCE_NEW').length} forced as new.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConflictReview(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded shadow-sm transition"
                >
                  Review Duplicates ({conflicts.length})
                </button>
              </div>
            )}

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
                        <td className="px-3 py-2 font-mono">
                          <div>{r.model19No || '—'}</div>
                          {r.isHistoricalData && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200 mt-0.5 whitespace-nowrap">
                              ቆጠራ · Count
                            </span>
                          )}
                        </td>
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
                  <label className="mr-auto inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowDuplicates}
                      onChange={(e) => setAllowDuplicates(e.target.checked)}
                      disabled={busy !== null}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span>Allow registration if items match existing assets in store</span>
                  </label>
                  <button type="button" onClick={close} disabled={busy !== null} className={btn.secondary}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => send(true)}
                    disabled={busy !== null || ready.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-[4px] border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'sending' ? <RefreshCw className="h-4 w-4 animate-spin text-slate-500" /> : <FileEdit className="h-4 w-4 text-slate-500" />}
                    {busy === 'sending' ? 'Saving drafts…' : `Save ${ready.length} as Draft${ready.length === 1 ? '' : 's'}`}
                  </button>
                  <button type="button" onClick={() => send(false)} disabled={busy !== null || ready.length === 0 || scanRequired} className={btn.primary}>
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
