import React, { useEffect, useMemo, useState } from 'react';
import { Warehouse, MapPin, Plus, Search, RefreshCw, AlertCircle, Pencil, Ban, RotateCcw, Trash2, Package } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Location, Store } from '../../types/asset-management';
import { ActivePill, ConfirmDialog, StatusFilter, StatusTabs, matchesStatus } from './reference-ui';
import { RefreshButton } from '../../components/ui/RefreshButton';

/** What the add / edit window is working on */
type Editing =
  | { kind: 'store'; store: Store | null }
  | { kind: 'location'; store: Store; location: Location | null };

type Confirm =
  | { kind: 'store'; store: Store; action: 'deactivate' | 'reactivate' | 'delete' }
  | { kind: 'location'; store: Store; location: Location; action: 'deactivate' | 'reactivate' | 'delete' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ACTION_LABEL = { deactivate: 'Deactivate', reactivate: 'Reactivate', delete: 'Delete' } as const;

// ─── Add / edit a store ─────────────────────────────────────────────────────

const StoreForm: React.FC<{ editing: Store | null; onCancel: () => void; onSaved: () => void }> = ({ editing, onCancel, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [locationName, setLocationName] = useState('Main store');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = editing ? await api.updateStore(editing.id, { name, address }) : await api.createStore({ name, address, locationName });
      toast.success(editing ? 'Store updated' : 'Store added', saved.name);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'The store could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGrid cols={2}>
        <Field label="Store name" required span="sm:col-span-2" htmlFor="store-name" hint="Shown in the Stock-In and Transfer forms, e.g. Kality.">
          <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Kality" autoFocus />
        </Field>
        <Field label="Building / address" optional span="sm:col-span-2" htmlFor="store-address">
          <input id="store-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Kality Depot" />
        </Field>
        {!editing && (
          <Field label="First location" required span="sm:col-span-2" htmlFor="store-first-location" hint="A room, section or shelf inside the store. You can add more afterwards.">
            <input id="store-first-location" value={locationName} onChange={(e) => setLocationName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Store-01" />
          </Field>
        )}
      </FieldGrid>
      <FormError message={error} />
      <FormFooter accent="emerald" submitting={submitting} submitLabel={editing ? 'Save changes' : 'Add store'} onCancel={onCancel} />
    </form>
  );
};

// ─── Add / rename a location inside a store ─────────────────────────────────

const LocationForm: React.FC<{ store: Store; editing: Location | null; onCancel: () => void; onSaved: () => void }> = ({
  store,
  editing,
  onCancel,
  onSaved,
}) => {
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = editing ? await api.updateLocation(editing.id, { name }) : await api.createLocation(store.id, { name });
      toast.success(editing ? 'Location renamed' : 'Location added', `${store.name} · ${saved.name}`);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'The location could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Location name" required htmlFor="location-name" hint={`A room, section or shelf inside ${store.name}.`}>
        <input id="location-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass('emerald')} placeholder="e.g. Shelf A" autoFocus />
      </Field>
      <FormError message={error} />
      <FormFooter accent="emerald" submitting={submitting} submitLabel={editing ? 'Save changes' : 'Add location'} onCancel={onCancel} />
    </form>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

/** Stores and the locations inside them */
export const StoresPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('references.manage') ?? false;

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStores(await api.getStores({ includeInactive: canManage }));
    } catch (err: any) {
      setError(err.message || 'The stores could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [canManage]);

  // A search matches the store, or any location inside it
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter(
      (s) =>
        matchesStatus(s.isActive, statusFilter) &&
        (!q || [s.name, s.address, ...s.locations.map((l) => l.name)].some((v) => (v || '').toLowerCase().includes(q))),
    );
  }, [stores, search, statusFilter]);

  const activeStores = stores.filter((s) => s.isActive);
  // Places stock can be received into right now
  const usableLocations = activeStores.reduce((n, s) => n + s.locations.filter((l) => l.isActive).length, 0);

  const afterSave = () => {
    setEditing(null);
    load();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const name = confirm.kind === 'store' ? confirm.store.name : `${confirm.store.name} · ${confirm.location.name}`;
    const noun = confirm.kind === 'store' ? 'Store' : 'Location';
    setBusy(true);
    try {
      if (confirm.kind === 'store') {
        if (confirm.action === 'delete') await api.deleteStore(confirm.store.id);
        else await api.setStoreActive(confirm.store.id, confirm.action === 'reactivate');
      } else if (confirm.action === 'delete') await api.deleteLocation(confirm.location.id);
      else await api.setLocationActive(confirm.location.id, confirm.action === 'reactivate');
      toast.success(`${noun} ${confirm.action === 'delete' ? 'deleted' : confirm.action === 'deactivate' ? 'deactivated' : 'reactivated'}`, name);
      setConfirm(null);
      await load();
    } catch (err: any) {
      toast.error(`Could not ${confirm.action} ${name}`, err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Warehouse className="h-5 w-5 text-emerald-700" />
            Stores (መጋዘኖች)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each store receives and issues stock, and has one or more locations inside it (rooms, sections, shelves). Stock-In picks a store, then a location.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditing({ kind: 'store', store: null })} className={btn.primary}>
            <Plus className="h-4 w-4" />
            Add store
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            id="store-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by store, address or location…"
            aria-label="Search stores and locations"
            className={table.search}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <StatusTabs value={statusFilter} onChange={setStatusFilter} active={activeStores.length} inactive={stores.length - activeStores.length} />}
          <RefreshButton onClick={load} loading={loading} label="stores" />
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
      ) : loading && stores.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-700" />
          Loading stores…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
          {stores.length === 0 ? `No stores yet.${canManage ? ' Add the first one with "Add store".' : ''}` : 'No stores match these filters.'}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((store) => {
            const held = store.itemCount ?? 0;
            const onlyPlace = store.isActive && usableLocations - store.locations.filter((l) => l.isActive).length === 0;
            return (
              <section key={store.id} aria-label={store.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                {/* Store */}
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                    <Warehouse className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-bold ${store.isActive ? 'text-slate-900' : 'text-slate-500'}`}>{store.name}</h3>
                    <p className="text-[11px] text-slate-500">
                      {[store.address, plural(store.locations.length, 'location'), canManage ? `${plural(held, 'item record')} in store` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ActivePill active={store.isActive} />
                  {canManage && (
                    <>
                      <button type="button" onClick={() => setEditing({ kind: 'location', store, location: null })} className={btn.row}>
                        <Plus className={btn.rowIcon} />
                        Add location
                      </button>
                      <RowActionsMenu
                        label={store.name}
                        actions={[
                          { label: 'Edit store', icon: Pencil, onClick: () => setEditing({ kind: 'store', store }) },
                          {
                            label: 'Deactivate store',
                            icon: Ban,
                            onClick: () => setConfirm({ kind: 'store', store, action: 'deactivate' }),
                            hidden: !store.isActive,
                            disabled: held > 0 || onlyPlace,
                            reason:
                              held > 0
                                ? `Holds ${plural(held, 'item record')} in store. Issue or transfer ${held === 1 ? 'it' : 'them'} first.`
                                : onlyPlace
                                  ? 'This is the only store that can receive stock. Add another first.'
                                  : undefined,
                          },
                          { label: 'Reactivate store', icon: RotateCcw, onClick: () => setConfirm({ kind: 'store', store, action: 'reactivate' }), hidden: store.isActive },
                          {
                            label: 'Delete store',
                            icon: Trash2,
                            onClick: () => setConfirm({ kind: 'store', store, action: 'delete' }),
                            disabled: held > 0 || onlyPlace,
                            reason: held > 0 ? 'In use. A store with items can only be deactivated.' : onlyPlace ? 'This is the only store that can receive stock.' : undefined,
                          },
                        ]}
                      />
                    </>
                  )}
                </div>

                {/* Its locations */}
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={table.headRow}>
                      <th className="px-4 py-2 pl-16">Location</th>
                      {canManage && <th className="px-3 py-2 text-right whitespace-nowrap">Item records in store</th>}
                      <th className="px-3 py-2 w-32">Status</th>
                      {canManage && (
                        <th className={`px-3 py-2 ${table.actionsHead}`}>
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {store.locations.map((l) => {
                      const here = l.itemCount ?? 0;
                      const lastHere = store.locations.length === 1;
                      const lastUsable = store.isActive && l.isActive && usableLocations <= 1;
                      return (
                        <tr key={l.id} className={table.row}>
                          <td className={`px-4 py-2.5 pl-16 font-medium ${l.isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                            <span className="inline-flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {l.name}
                            </span>
                          </td>
                          {canManage && (
                            <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                              {here > 0 ? (
                                <span className="inline-flex items-center gap-1 text-slate-900">
                                  <Package className="h-3 w-3 text-slate-400" />
                                  {here}
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
                                label={`${store.name} ${l.name}`}
                                actions={[
                                  { label: 'Rename', icon: Pencil, onClick: () => setEditing({ kind: 'location', store, location: l }) },
                                  {
                                    label: 'Deactivate',
                                    icon: Ban,
                                    onClick: () => setConfirm({ kind: 'location', store, location: l, action: 'deactivate' }),
                                    hidden: !l.isActive,
                                    disabled: here > 0 || lastUsable,
                                    reason:
                                      here > 0
                                        ? `Holds ${plural(here, 'item record')}. Issue or transfer ${here === 1 ? 'it' : 'them'} first.`
                                        : lastUsable
                                          ? 'This is the only place left to receive stock.'
                                          : undefined,
                                  },
                                  { label: 'Reactivate', icon: RotateCcw, onClick: () => setConfirm({ kind: 'location', store, location: l, action: 'reactivate' }), hidden: l.isActive },
                                  {
                                    label: 'Delete',
                                    icon: Trash2,
                                    onClick: () => setConfirm({ kind: 'location', store, location: l, action: 'delete' }),
                                    disabled: here > 0 || lastHere,
                                    reason: here > 0 ? 'In use. A location with items can only be deactivated.' : lastHere ? "A store keeps at least one location. Delete the store instead." : undefined,
                                  },
                                ]}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={
          !editing
            ? ''
            : editing.kind === 'store'
              ? editing.store
                ? `Edit ${editing.store.name}`
                : 'Add store'
              : editing.location
                ? `Rename ${editing.location.name}`
                : `Add location to ${editing.store.name}`
        }
        subtitle={editing?.kind === 'store' ? 'A store receives and issues stock.' : 'A room, section or shelf inside the store.'}
        size="md"
      >
        {editing?.kind === 'store' && <StoreForm key={editing.store?.id ?? 'new'} editing={editing.store} onCancel={() => setEditing(null)} onSaved={afterSave} />}
        {editing?.kind === 'location' && (
          <LocationForm key={editing.location?.id ?? `new-${editing.store.id}`} store={editing.store} editing={editing.location} onCancel={() => setEditing(null)} onSaved={afterSave} />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirm ? `${ACTION_LABEL[confirm.action]} ${confirm.kind === 'store' ? confirm.store.name : confirm.location.name}?` : ''}
        confirmLabel={confirm ? ACTION_LABEL[confirm.action] : ''}
        danger={confirm?.action !== 'reactivate'}
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      >
        {!confirm
          ? ''
          : confirm.action === 'delete'
            ? confirm.kind === 'store'
              ? 'This removes the store and its locations for good. It only works when no item or request has ever used them; otherwise deactivate it.'
              : 'This removes the location for good. It only works when no item or request has ever used it; otherwise deactivate it.'
            : confirm.action === 'deactivate'
              ? confirm.kind === 'store'
                ? 'The store and all its locations will no longer appear in the Stock-In and Transfer forms. Past records keep their names.'
                : 'It will no longer appear in the Stock-In and Transfer forms. Past records keep its name.'
              : 'It will appear in the forms again.'}
      </ConfirmDialog>
    </div>
  );
};
