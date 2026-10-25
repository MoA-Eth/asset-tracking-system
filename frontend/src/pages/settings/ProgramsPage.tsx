import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Search, Pencil, Ban, RotateCcw, Trash2, AlertCircle, X } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Program } from '../../types/asset-management';
import { ActivePill, ConfirmDialog, StatusFilter, matchesStatus } from './reference-ui';
import { FilterPopover, FilterSection, FilterPill } from '../../components/ui/FilterPopover';
import { Skeleton } from '../../components/ui/Skeleton';

// ─── Add / edit a program or project ───────────────────────────────────────

const ProgramForm: React.FC<{
  editing: Program | null;
  onCancel: () => void;
  onSaved: () => void;
}> = ({ editing, onCancel, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
      };
      const saved = editing
        ? await api.updateProgram(editing.id, input)
        : await api.createProgram(input);
      toast.success(editing ? 'Program updated' : 'Program added', saved.name);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'The program could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGrid cols={2}>
        <Field
          label="Program / project name"
          required
          span="sm:col-span-2"
          htmlFor="program-name"
          hint="As it appears on Model 19 vouchers and asset records, e.g. Food System Resilience Program (FSRP)."
        >
          <input
            id="program-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass('emerald')}
            placeholder="e.g. Food System Resilience Program (FSRP)"
            autoFocus
          />
        </Field>
        <Field
          label="Code / abbreviation"
          optional
          htmlFor="program-code"
          hint="Short code or acronym, e.g. FSRP."
        >
          <input
            id="program-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass('emerald')}
            placeholder="e.g. FSRP"
          />
        </Field>
        <Field
          label="Description / donor"
          optional
          span="sm:col-span-2"
          htmlFor="program-desc"
          hint="Scope, partner, or notes about this program or project."
        >
          <textarea
            id="program-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass('emerald')}
            placeholder="e.g. World Bank supported food security resilience project"
          />
        </Field>
      </FieldGrid>
      <FormError message={error} />
      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={editing ? 'Save changes' : 'Add program'}
        onCancel={onCancel}
        sticky={false}
      />
    </form>
  );
};

// ─── The list ───────────────────────────────────────────────────────────────

/**
 * Ministry programs and projects goods are received for (e.g. PSNP, FSRP, AGP).
 * Administered here and offered across receipt and asset pickers.
 */
export const ProgramsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('references.manage') ?? false;
  const canAdd = canManage || (user?.permissions?.includes('stock-in.write') ?? false);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [editing, setEditing] = useState<{ program: Program | null } | null>(null);
  const [confirm, setConfirm] = useState<{
    program: Program;
    action: 'deactivate' | 'reactivate' | 'delete';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPrograms(await api.getPrograms({ includeInactive: canManage }));
    } catch (err: any) {
      setError(err.message || 'The programs could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return programs.filter(
      (p) =>
        matchesStatus(p.isActive, statusFilter) &&
        (!q ||
          [p.name, p.code, p.description].some((v) =>
            (v || '').toLowerCase().includes(q)
          ))
    );
  }, [programs, search, statusFilter]);

  const active = programs.filter((p) => p.isActive).length;

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'delete') {
        await api.deleteProgram(confirm.program.id);
        toast.success('Program deleted', confirm.program.name);
      } else {
        await api.setProgramStatus(confirm.program.id, confirm.action === 'reactivate');
        toast.success(
          `Program ${confirm.action === 'deactivate' ? 'deactivated' : 'reactivated'}`,
          confirm.program.name
        );
      }
      setConfirm(null);
      await load();
    } catch (err: any) {
      toast.error(
        `Could not ${confirm.action} ${confirm.program.name}`,
        err.message || 'Action failed'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-16">
      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : (
        <div className="rounded-md overflow-hidden bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
          {/* Table Card Header: Search + Filter on left, Action button on right */}
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by program name, code or description…"
                  aria-label="Search programs"
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 hover:border-slate-500 rounded-[4px] text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
                {canManage && (
                  <FilterPopover
                    label="Filter"
                    ariaLabel="Filter programs"
                    title="Filters"
                    resetLabel="Reset"
                    activeCount={statusFilter !== 'ACTIVE' ? 1 : 0}
                    onReset={() => setStatusFilter('ACTIVE')}
                    resultCountText={`${shown.length} ${shown.length === 1 ? 'program' : 'programs'}`}
                  >
                    <FilterSection label="Status">
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {(
                          [
                            ['ACTIVE', 'Active', active],
                            ['INACTIVE', 'Deactivated', programs.length - active],
                            ['ALL', 'All', programs.length],
                          ] as [StatusFilter, string, number][]
                        ).map(([value, label, count]) => (
                          <FilterPill
                            key={value}
                            label={label}
                            count={count}
                            active={statusFilter === value}
                            onClick={() => setStatusFilter(value)}
                          />
                        ))}
                      </div>
                    </FilterSection>
                  </FilterPopover>
                )}
                {canAdd && (
                  <button
                    type="button"
                    onClick={() => setEditing({ program: null })}
                    className={`${btn.primary} shrink-0`}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add program</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active filter chips */}
            {statusFilter !== 'ACTIVE' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-medium text-slate-500">Active filters:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                  <span>Status: {statusFilter === 'INACTIVE' ? 'Deactivated' : 'All'}</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ACTIVE')}
                    className="hover:text-emerald-950 p-0.5 rounded hover:bg-emerald-100 cursor-pointer"
                    aria-label="Remove status filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 underline cursor-pointer ml-1"
                >
                  Clear all
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>
                <span className="font-semibold text-slate-900">{shown.length}</span> of {programs.length} programs & projects
              </span>
              <span>{active} active</span>
            </div>
          </div>

          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-40" /></th>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-20" /></th>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-36" /></th>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-16" /></th>
                    {canManage && <th className="px-4 py-1.5 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <Skeleton className="h-3.5 w-48 font-medium" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-3.5 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-3.5 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <Skeleton className="h-7 w-7 rounded ml-auto" />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <Briefcase className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              {programs.length === 0
                ? 'No programs or projects yet. Add one to offer it on receipts.'
                : 'No program matches the search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-4 py-1.5">Program / Project</th>
                    <th className="px-4 py-1.5">Code</th>
                    <th className="px-4 py-1.5">Description</th>
                    <th className="px-4 py-1.5">Status</th>
                    {canManage && <th className="px-4 py-1.5 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {shown.map((p) => (
                    <tr key={p.id} className={table.row}>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium text-slate-900">{p.name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {p.code ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {p.code}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                        {p.description || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <ActivePill active={p.isActive} />
                      </td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          <RowActionsMenu
                            label={p.name}
                            actions={[
                              {
                                label: 'Edit program',
                                icon: Pencil,
                                onClick: () => setEditing({ program: p }),
                              },
                              {
                                label: 'Deactivate',
                                icon: Ban,
                                onClick: () => setConfirm({ program: p, action: 'deactivate' }),
                                hidden: !p.isActive,
                              },
                              {
                                label: 'Reactivate',
                                icon: RotateCcw,
                                onClick: () => setConfirm({ program: p, action: 'reactivate' }),
                                hidden: p.isActive,
                              },
                              {
                                label: 'Delete program',
                                icon: Trash2,
                                onClick: () => setConfirm({ program: p, action: 'delete' }),
                              },
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.program ? `Edit ${editing.program.name}` : 'Add program / project'}
        subtitle="Ministry program or project goods are received for."
        size="md"
      >
        {editing && (
          <ProgramForm
            key={editing.program?.id ?? 'new'}
            editing={editing.program}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        title={
          confirm
            ? confirm.action === 'delete'
              ? `Delete ${confirm.program.name}?`
              : `${confirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${confirm.program.name}?`
            : ''
        }
        confirmLabel={
          confirm?.action === 'delete'
            ? 'Delete program'
            : confirm?.action === 'deactivate'
            ? 'Deactivate'
            : 'Reactivate'
        }
        danger={confirm?.action === 'deactivate' || confirm?.action === 'delete'}
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      >
        {confirm?.action === 'delete'
          ? 'This will permanently remove this program from the directory. Past item records keep whatever name was saved on them.'
          : confirm?.action === 'deactivate'
          ? 'It will no longer appear in program pickers on receipt forms. Existing asset records keep its name.'
          : 'It will be offered on receipt forms again.'}
      </ConfirmDialog>
    </div>
  );
};
