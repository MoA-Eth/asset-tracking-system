import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, Pencil, Ban, RotateCcw, AlertCircle, RefreshCw, X } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Organization } from '../../types/asset-management';
import { ActivePill, ConfirmDialog, StatusFilter, matchesStatus } from './reference-ui';
import { FilterPopover, FilterSection, FilterPill } from '../../components/ui/FilterPopover';
import { Skeleton, OrganizationsTableRowsSkeleton } from '../../components/ui/Skeleton';

// ─── Add / edit an organization ─────────────────────────────────────────────

const OrganizationForm: React.FC<{ editing: Organization | null; onCancel: () => void; onSaved: () => void }> = ({ editing, onCancel, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [shortName, setShortName] = useState(editing?.shortName ?? '');
  const [contactPerson, setContactPerson] = useState(editing?.contactPerson ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, shortName, contactPerson };
      const saved = editing ? await api.updateOrganization(editing.id, input) : await api.createOrganization(input);
      toast.success(editing ? 'Organization updated' : 'Organization added', saved.name);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'The organization could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGrid cols={2}>
        <Field label="Organization name" required span="sm:col-span-2" htmlFor="org-name" hint="As it should appear on the Model 22, e.g. Oromia Bureau of Agriculture.">
          <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Oromia Bureau of Agriculture" autoFocus />
        </Field>
        <Field label="Short name" optional htmlFor="org-short" hint="Also found when searching, e.g. Oromia BoA.">
          <input id="org-short" value={shortName} onChange={(e) => setShortName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Oromia BoA" />
        </Field>
        <Field label="Usual contact person" optional htmlFor="org-contact" hint="Offered as the person who signs for it.">
          <input id="org-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Mantegbosh Mirku" />
        </Field>
      </FieldGrid>
      <FormError message={error} />
      <FormFooter accent="emerald" submitting={submitting} submitLabel={editing ? 'Save changes' : 'Add organization'} onCancel={onCancel} sticky={false} />
    </form>
  );
};

// ─── The list ───────────────────────────────────────────────────────────────

/**
 * Outside organizations items are issued to (regional bureaus, projects, NGOs…). One record each, so the name is
 * spelled the same on every issue and their items can be found together. Encoders add them from the issue form;
 * administrators edit and deactivate them here.
 */
export const OrganizationsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('references.manage') ?? false;
  const canAdd = canManage || (user?.permissions?.includes('stock-out.write') ?? false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [editing, setEditing] = useState<{ organization: Organization | null } | null>(null);
  const [confirm, setConfirm] = useState<{ organization: Organization; action: 'deactivate' | 'reactivate' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOrganizations(await api.getOrganizations({ includeInactive: canManage }));
    } catch (err: any) {
      setError(err.message || 'The organizations could not be loaded.');
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
    return organizations.filter(
      (o) => matchesStatus(o.isActive, statusFilter) && (!q || [o.name, o.shortName, o.contactPerson].some((v) => (v || '').toLowerCase().includes(q))),
    );
  }, [organizations, search, statusFilter]);
  const active = organizations.filter((o) => o.isActive).length;

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.setOrganizationActive(confirm.organization.id, confirm.action === 'reactivate');
      toast.success(`Organization ${confirm.action === 'deactivate' ? 'deactivated' : 'reactivated'}`, confirm.organization.name);
      setConfirm(null);
      await load();
    } catch (err: any) {
      toast.error(`Could not ${confirm.action} ${confirm.organization.name}`, err.message);
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
              <div className="flex flex-1 items-center gap-2 max-w-lg min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, short name or contact…"
                    aria-label="Search organizations"
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 hover:border-slate-500 rounded-[4px] text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-colors"
                  />
                </div>
                {canManage && (
                  <FilterPopover
                    label="Filter"
                    ariaLabel="Filter organizations"
                    title="Filters"
                    resetLabel="Reset"
                    activeCount={statusFilter !== 'ACTIVE' ? 1 : 0}
                    onReset={() => setStatusFilter('ACTIVE')}
                    resultCountText={`${shown.length} ${shown.length === 1 ? 'organization' : 'organizations'}`}
                  >
                    <FilterSection label="Status">
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {(
                          [
                            ['ACTIVE', 'Active', active],
                            ['INACTIVE', 'Deactivated', organizations.length - active],
                            ['ALL', 'All', organizations.length],
                          ] as [StatusFilter, string, number][]
                        ).map(([value, label, count]) => (
                          <FilterPill key={value} label={label} count={count} active={statusFilter === value} onClick={() => setStatusFilter(value)} />
                        ))}
                      </div>
                    </FilterSection>
                  </FilterPopover>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canAdd && (
                  <button type="button" onClick={() => setEditing({ organization: null })} className={`${btn.primary} shrink-0`}>
                    <Plus className="h-4 w-4" />
                    <span>Add organization</span>
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
                <span className="font-semibold text-slate-900">{shown.length}</span> of {organizations.length} organizations
              </span>
              <span>{active} active</span>
            </div>
          </div>

          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-28" /></th>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-36" /></th>
                    <th className="px-4 py-1.5"><Skeleton className="h-3 w-16" /></th>
                    {canManage && <th className="px-4 py-1.5 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <OrganizationsTableRowsSkeleton rows={5} />
                </tbody>
              </table>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <Building2 className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              {organizations.length === 0 ? 'No organizations yet. They are added when items are first issued to one.' : 'No organization matches.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className={table.headRow}>
                    <th className="px-4 py-1.5">Organization</th>
                    <th className="px-4 py-1.5">Usual contact person</th>
                    <th className="px-4 py-1.5">Status</th>
                    {canManage && <th className="px-4 py-1.5 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {shown.map((o) => (
                    <tr key={o.id} className={table.row}>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium text-slate-900">{o.name}</span>
                        {o.shortName && <span className="block text-[11px] text-slate-500">{o.shortName}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{o.contactPerson || '—'}</td>
                      <td className="px-4 py-2.5"><ActivePill active={o.isActive} /></td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          <RowActionsMenu
                            label={o.name}
                            actions={[
                              { label: 'Edit organization', icon: Pencil, onClick: () => setEditing({ organization: o }) },
                              { label: 'Deactivate', icon: Ban, onClick: () => setConfirm({ organization: o, action: 'deactivate' }), hidden: !o.isActive },
                              { label: 'Reactivate', icon: RotateCcw, onClick: () => setConfirm({ organization: o, action: 'reactivate' }), hidden: o.isActive },
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
        title={editing?.organization ? `Edit ${editing.organization.name}` : 'Add organization'}
        subtitle="An outside organization items are issued to."
        size="md"
      >
        {editing && (
          <OrganizationForm
            key={editing.organization?.id ?? 'new'}
            editing={editing.organization}
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
        title={confirm ? `${confirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${confirm.organization.name}?` : ''}
        confirmLabel={confirm?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        danger={confirm?.action === 'deactivate'}
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      >
        {confirm?.action === 'deactivate'
          ? 'It will no longer be offered on the issue form. Past issues and the items it holds keep its name.'
          : 'It will be offered on the issue form again.'}
      </ConfirmDialog>
    </div>
  );
};
