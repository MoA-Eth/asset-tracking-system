import React, { useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, Info } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { FormError, FormNotice } from '../../components/ui/FormKit';
import { btn, pill, statusTone, table } from '../../components/ui/theme';
import { useToast } from '../../context/ToastContext';
import { EmployeeImportAction, EmployeeImportResult } from '../../types/asset-management';
import { COLUMN_LABELS, EMPLOYEE_FIELDS, buildTextWorkbook, employeeTemplateRows, readEmployeeFile, EmployeeSheetRow } from '../../utils/employee-import';

const ACTION_STYLE: Record<EmployeeImportAction, { label: string; tone: string }> = {
  create: { label: 'New', tone: statusTone.approved },
  update: { label: 'Update', tone: statusTone.issued },
  unchanged: { label: 'No change', tone: statusTone.neutral },
  error: { label: 'Skipped', tone: statusTone.rejected },
};

// Problems first, then new, updated and unchanged rows
const ORDER: EmployeeImportAction[] = ['error', 'create', 'update', 'unchanged'];

export const EmployeeImportModal: React.FC<{ isOpen: boolean; onClose: () => void; onImported: () => void }> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<EmployeeSheetRow[]>([]);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmployeeImportAction | 'ALL'>('ALL');

  const reset = () => {
    setFileName('');
    setRows([]);
    setResult(null);
    setError(null);
    setFilter('ALL');
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    // An .xlsx with text cells, so employee IDs keep their leading zeros
    const workbook = buildTextWorkbook(employeeTemplateRows());
    const url = URL.createObjectURL(new Blob([workbook as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy('checking');
    try {
      const sheet = await readEmployeeFile(file);
      if (sheet.missing.length > 0) {
        setError(
          sheet.columns.length === 0
            ? 'No employee ID heading (የሰራተኛ መለያ ቁጥር) was found in the first 10 rows. Use the template headings.'
            : `The sheet is missing these columns: ${sheet.missing.map((c) => COLUMN_LABELS[c]).join(', ')}.`,
        );
        return;
      }
      if (sheet.rows.length === 0) {
        setError('The sheet has headings but no employee rows.');
        return;
      }
      setRows(sheet.rows);
      setResult(await api.importEmployees(sheet.rows, false));
    } catch (err: any) {
      setError(err.message || 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy('importing');
    setError(null);
    try {
      const done = await api.importEmployees(rows, true);
      const depts = done.newDepartments.length;
      toast.success('Employees imported', `${done.counts.create} added, ${done.counts.update} updated${depts ? `, ${depts} ${depts === 1 ? 'department' : 'departments'} created` : ''}`);
      onImported();
      close();
    } catch (err: any) {
      setError(err.message || 'The import failed. Nothing was saved.');
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    if (!result) return [];
    const list = filter === 'ALL' ? result.rows : result.rows.filter((r) => r.action === filter);
    return [...list].sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action) || a.row - b.row);
  }, [result, filter]);

  const toSave = result ? result.counts.create + result.counts.update : 0;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import employees from Excel" subtitle="Add or update staff from an HR spreadsheet" size="xl">
      <div className="space-y-4">
        {!result && (
          <>
            <FormNotice icon={Info}>
              <p>The template has the same fields as the Add employee form, with HR's headings:</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {EMPLOYEE_FIELDS.map((f) => (
                  <span
                    key={f.key}
                    title={f.label}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] ${f.required ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {f.heading}
                    {f.required && ' *'}
                  </span>
                ))}
              </p>
              <p className="mt-1.5">
                * required. Other columns in HR's file (row number, salary, step…) are ignored. Staff are matched by employee ID:
                new ones are added, existing ones are updated, and empty cells keep what is saved. Departments that don't exist
                yet are created. You'll see a preview before anything is saved.
              </p>
            </FormNotice>

            <label
              htmlFor="employee-import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"
            >
              {busy === 'checking' ? (
                <RefreshCw className="h-7 w-7 animate-spin text-emerald-700" />
              ) : (
                <FileSpreadsheet className="h-7 w-7 text-emerald-700" />
              )}
              <span className="text-sm font-semibold text-slate-900">
                {busy === 'checking' ? `Checking ${fileName}…` : 'Choose an Excel (.xlsx) or CSV file'}
              </span>
              <span className="text-[11px] text-slate-500">The first sheet is read. Up to 5,000 employees per file.</span>
              <input
                ref={inputRef}
                id="employee-import-file"
                type="file"
                accept=".xlsx,.csv"
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

        {result && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5 text-emerald-700" />
                <span className="font-semibold text-slate-900">{fileName}</span> · {result.rows.length} rows
              </p>
              <div role="group" aria-label="Show rows" className="flex flex-wrap gap-1.5">
                {(['ALL', ...ORDER] as const).map((a) => {
                  const count = a === 'ALL' ? result.rows.length : result.counts[a];
                  const label = a === 'ALL' ? 'All' : ACTION_STYLE[a].label;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={filter === a}
                      onClick={() => setFilter(a)}
                      disabled={count === 0 && a !== 'ALL'}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer disabled:cursor-default disabled:opacity-40 ${
                        filter === a ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {label} <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {result.newDepartments.length > 0 && (
              <FormNotice icon={Building2}>
                <b>
                  {result.newDepartments.length} new {result.newDepartments.length === 1 ? 'department' : 'departments'}
                </b>{' '}
                will be created from the file: {result.newDepartments.slice(0, 6).join(' · ')}
                {result.newDepartments.length > 6 && ` · and ${result.newDepartments.length - 6} more`}
              </FormNotice>
            )}

            <div className="max-h-[22rem] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-[1]">
                  <tr className={table.headRow}>
                    <th className="px-3 py-2 w-14 text-right">Row</th>
                    <th className="px-3 py-2">Employee ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={`${r.row}-${r.payrollId}`} className={r.action === 'error' ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{r.row}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${table.code}`}>{r.payrollId || '—'}</td>
                      <td className="px-3 py-2 text-slate-900">{r.fullNameEn || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{r.department || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`${pill} ${ACTION_STYLE[r.action].tone}`}>{ACTION_STYLE[r.action].label}</span>
                        {r.message && <span className="ml-2 text-[11px] text-red-700">{r.message}</span>}
                        {r.changes && <span className="ml-2 text-[11px] text-slate-500">{r.changes.join(', ')}</span>}
                        {r.inactive && <span className="ml-2 text-[11px] text-slate-400">(deactivated)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-600">
                {toSave > 0 ? (
                  <>
                    <b className="text-slate-900">{result.counts.create}</b> will be added and <b className="text-slate-900">{result.counts.update}</b> updated.
                  </>
                ) : (
                  'Nothing to save: every row is unchanged or has a problem.'
                )}
                {result.counts.error > 0 && ` ${result.counts.error} ${result.counts.error === 1 ? 'row has' : 'rows have'} problems and will be skipped.`}
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
                <button type="button" onClick={apply} disabled={toSave === 0 || busy !== null} className={btn.primary}>
                  {busy === 'importing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Import {toSave} {toSave === 1 ? 'employee' : 'employees'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
