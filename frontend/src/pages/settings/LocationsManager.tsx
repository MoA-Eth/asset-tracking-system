import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Warehouse, Plus, Search, RefreshCw, AlertCircle, Pencil, Ban, RotateCcw, Trash2, Package } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table, pill, statusTone } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Location, LocationInput } from '../../types/asset-management';
import { ActivePill, ConfirmDialog, StatusFilter, StatusTabs, matchesStatus } from './reference-ui';

/**
 * Locations and Stores are one list: a store is a location that receives and issues stock.
 * "locations" shows every place assets are kept; "stores" shows only the stores.
 */
type Mode = 'locations' | 'stores';

const COPY: Record<Mode, { title: string; titleAm: string; description: string; noun: string; add: string; empty: string }> = {
  locations: {
    title: 'Locations',
    titleAm: 'አድራሻዎች',
    description: 'Every site, building and room where assets are kept. Mark a location as a store if it receives and issues stock.',
    noun: 'location',
    add: 'Add location',
    empty: 'No locations yet.',
  },
  stores: {
    title: 'Stores',
    titleAm: 'መጋዘኖች',
    description: 'The stores that receive goods (Stock-In) and issue them (Stock-Out). Only active stores appear in the Stock-In form.',
    noun: 'store',
    add: 'Add store',
    empty: 'No stores yet.',
  },
};

type Confirm = { location: Location; action: 'deactivate' | 'reactivate' | 'delete' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const LocationForm: React.FC<{
  mode: Mode;
  editing: Location | null;
  onCancel: () => void;
  onSaved: (saved: Location) => void;
}> = ({ mode, editing, onCancel, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<LocationInput>({
    siteName: editing?.siteName ?? '',
    building: editing?.building ?? '',
    roomNumber: editing?.roomNumber ?? '',
    isCentralStore: editing ? !!editing.isCentralStore : mode === 'stores',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: 'siteName' | 'building' | 'roomNumber') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = editing ? await api.updateLocation(editing.id, form) : await api.createLocation(form);
      const noun = saved.isCentralStore ? 'Store' : 'Location';
      toast.success(editing ? `${noun} updated` : `${noun} added`, saved.siteName);
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || 'It could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGrid cols={2}>
        <Field label="Site name" required span="sm:col-span-2" htmlFor="loc-site" hint="The name shown in the forms, e.g. Kality or Head office.">
          <input id="loc-site" value={form.siteName} onChange={set('siteName')} className={inputClass('emerald')} placeholder="e.g. Kality" autoFocus />
        </Field>
        <Field label="Building" optional htmlFor="loc-building">
          <input id="loc-building" value={form.building} onChange={set('building')} className={inputClass('emerald')} placeholder="e.g. Kality Depot" />
        </Field>
        <Field label="Room / store number" optional htmlFor="loc-room">
          <input id="loc-room" value={form.roomNumber} onChange={set('roomNumber')} className={inputClass('emerald')} placeholder="e.g. Store-01" />
        </Field>
      </FieldGrid>
      <label htmlFor="loc-is-store" className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input
          id="loc-is-store"
          type="checkbox"
          checked={form.isCentralStore}
          onChange={(e) => setForm((f) => ({ ...f, isCentralStore: e.target.checked }))}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-700"
        />
        <span>
          <span className="block text-xs font-semibold text-slate-900">This is a store</span>
          <span className="block text-[11px] text-slate-500">Stores receive goods on Stock-In and issue them on Stock-Out.</span>
        </span>
      </label>
      <FormError message={error} />
      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={editing ? 'Save changes' : form.isCentralStore ? 'Add store' : 'Add location'}
        onCancel={onCancel}
      />
    </form>
  );
};

export const LocationsManager: React.FC<{ mode: Mode }> = ({ mode }) => {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('references.manage') ?? false;
  const copy = COPY[mode];
  const Icon = mode === 'stores' ? Warehouse : MapPin;

  const [all, setAll] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAll(await api.getLocations({ includeInactive: canManage }));
    } catch (err: any) {
      setError(err.message || `The ${copy.noun}s could not be loaded.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [canManage]);

  // The Stores page lists only locations marked as a store
  const scoped = useMemo(() => (mode === 'stores' ? all.filter((l) => l.isCentralStore) : all), [all, mode]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(
      (l) => matchesStatus(l.isActive, statusFilter) && (!q || [l.siteName, l.building, l.roomNumber].some((v) => (v || '').toLowerCase().includes(q))),
    );
  }, [scoped, search, statusFilter]);
  const activeCount = scoped.filter((l) => l.isActive).length;
  const activeStores = all.filter((l) => l.isCentralStore && l.isActive).length;

  const onSaved = (saved: Location) => {
    setAll((prev) => {
      const next = prev.some((l) => l.id === saved.id) ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved];
      return next.sort((a, b) => a.siteName.localeCompare(b.siteName));
    });
    setFormOpen(false);
    setEditing(null);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { location, action } = confirm;
    const noun = location.isCentralStore ? 'Store' : 'Location';
    setBusy(true);
    try {
      if (action === 'delete') {
        await api.deleteLocation(location.id);
        setAll((prev) => prev.filter((l) => l.id !== location.id));
        toast.success(`${noun} deleted`, location.siteName);
      } else {
        const updated = await api.setLocationActive(location.id, action === 'reactivate');
        setAll((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        toast.success(`${noun} ${updated.isActive ? 'reactivated' : 'deactivated'}`, updated.siteName);
      }
      setConfirm(null);
    } catch (err: any) {
      toast.error(`Could not ${action} ${location.siteName}`, err.message);
    } finally {
      setBusy(false);
    }
  };

  const showType = mode === 'locations';
  const colCount = 3 + (showType ? 1 : 0) + (canManage ? 2 : 0) + 1;

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Icon className="h-5 w-5 text-emerald-700" />
            {copy.title} ({copy.titleAm})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{copy.description}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className={btn.primary}
          >
            <Plus className="h-4 w-4" />
            {copy.add}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            id={`${mode}-search`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by site, building or room…"
            aria-label={`Search ${copy.noun}s`}
            className={table.search}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <StatusTabs value={statusFilter} onChange={setStatusFilter} active={activeCount} inactive={scoped.length - activeCount} />}
          <button
            type="button"
            onClick={load}
            aria-label="Refresh"
            title="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mx-auto max-w-md space-y-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="text-xs text-red-700">{error}</p>
          <button type="button" onClick={load} className={btn.row}>
            <RefreshCw className={btn.rowIcon} /> Try again
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{rows.length}</span> of {scoped.length} {copy.noun}s
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={table.headRow}>
                  <th className="px-4 py-2.5">Site</th>
                  <th className="px-3 py-2.5">Building</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Room / store no.</th>
                  {showType && <th className="px-3 py-2.5">Type</th>}
                  {canManage && <th className="px-3 py-2.5 text-right whitespace-nowrap">Item records in store</th>}
                  <th className="px-3 py-2.5">Status</th>
                  {canManage && (
                    <th className={`px-3 py-2.5 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && all.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-slate-400">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-700" />
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-slate-500">
                      {scoped.length === 0 ? `${copy.empty}${canManage ? ` Add the first one with "${copy.add}".` : ''}` : `No ${copy.noun}s match these filters.`}
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => {
                    const held = l.itemCount ?? 0;
                    const lastStore = !!l.isCentralStore && l.isActive && activeStores <= 1;
                    const noun = l.isCentralStore ? 'store' : 'location';
                    return (
                      <tr key={l.id} className={table.row}>
                        <td className={`px-4 py-2.5 font-semibold ${l.isActive ? 'text-slate-900' : 'text-slate-500'}`}>{l.siteName}</td>
                        <td className="px-3 py-2.5 text-slate-700">{l.building || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2.5 text-slate-700">{l.roomNumber || <span className="text-slate-400">—</span>}</td>
                        {showType && (
                          <td className="px-3 py-2.5">
                            {l.isCentralStore ? (
                              <span className={`${pill} ${statusTone.approved}`}>
                                <Warehouse className="h-3 w-3" />
                                Store
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">Location</span>
                            )}
                          </td>
                        )}
                        {canManage && (
                          <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                            {held > 0 ? (
                              <span className="inline-flex items-center gap-1 text-slate-900">
                                <Package className="h-3 w-3 text-slate-400" />
                                {held}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <ActivePill active={l.isActive} />
                        </td>
                        {canManage && (
                          <td className={`px-3 py-2.5 ${table.actionsCell}`}>
                            <RowActionsMenu
                              label={l.siteName}
                              actions={[
                                {
                                  label: 'Edit',
                                  icon: Pencil,
                                  onClick: () => {
                                    setEditing(l);
                                    setFormOpen(true);
                                  },
                                },
                                {
                                  label: 'Deactivate',
                                  icon: Ban,
                                  onClick: () => setConfirm({ location: l, action: 'deactivate' }),
                                  hidden: !l.isActive,
                                  disabled: held > 0 || lastStore,
                                  reason:
                                    held > 0
                                      ? `Holds ${plural(held, 'item record')} in store. Issue or transfer ${held === 1 ? 'it' : 'them'} first.`
                                      : lastStore
                                        ? 'This is the only active store. Add another store first.'
                                        : undefined,
                                },
                                { label: 'Reactivate', icon: RotateCcw, onClick: () => setConfirm({ location: l, action: 'reactivate' }), hidden: l.isActive },
                                {
                                  label: 'Delete',
                                  icon: Trash2,
                                  onClick: () => setConfirm({ location: l, action: 'delete' }),
                                  disabled: held > 0 || lastStore,
                                  reason: held > 0 ? `In use. A ${noun} with items can only be deactivated.` : lastStore ? 'This is the only active store.' : undefined,
                                },
                              ]}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.siteName}` : copy.add}
        subtitle={mode === 'stores' ? 'A store that receives and issues stock.' : 'A site, building or room where assets are kept.'}
        size="md"
      >
        {formOpen && <LocationForm key={editing?.id ?? 'new'} mode={mode} editing={editing} onCancel={() => setFormOpen(false)} onSaved={onSaved} />}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        title={
          confirm ? `${confirm.action === 'delete' ? 'Delete' : confirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${confirm.location.siteName}?` : ''
        }
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : confirm?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        danger={confirm?.action !== 'reactivate'}
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      >
        {confirm?.action === 'delete'
          ? 'This removes it for good. It only works when no item or request has ever used it; otherwise deactivate it.'
          : confirm?.action === 'deactivate'
            ? 'It will no longer appear in the Stock-In and Transfer forms. Past records keep its name.'
            : 'It will appear in the forms again.'}
      </ConfirmDialog>
    </div>
  );
};
