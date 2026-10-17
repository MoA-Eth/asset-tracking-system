import React, { useEffect, useMemo, useState } from 'react';
import { Warehouse, MapPin, Plus, Search, RefreshCw, AlertCircle, Pencil, Ban, RotateCcw, Trash2, Package, UserCheck, X } from 'lucide-react';
import { api } from '../../api/client';
import { btn, table } from '../../components/ui/theme';
import { Modal } from '../../components/ui/Modal';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Field, FieldGrid, FormError, FormFooter, inputClass } from '../../components/ui/FormKit';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Employee, Location, Store } from '../../types/asset-management';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { StoreManReminder } from '../../components/ui/StoreManReminder';
import { ActivePill, ConfirmDialog, StatusFilter, matchesStatus } from './reference-ui';
import { FilterPopover, FilterSection, FilterPill } from '../../components/ui/FilterPopover';
import { SortableHeader, SortDirection } from '../../components/ui/SortableHeader';
import { StoresSkeleton } from '../../components/ui/Skeleton';

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
        <Field label="Store name" required span="sm:col-span-2" htmlFor="store-name" hint="Shown in the receive and transfer forms, e.g. Kality.">
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
/**
 * The store men of one store: employees named on its vouchers and offered in its forms. They need no sign-in.
 * A store with nobody can't receive, issue, dispose or take returns, so that is said plainly.
 */
const StoreMen: React.FC<{ store: Store; canManage: boolean; employees: Employee[]; onChanged: (store: Store) => void }> = ({
  store,
  canManage,
  employees,
  onChanged,
}) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState('');
  const men = (store.storeKeepers ?? []).filter((k) => k.isActive !== false);

  const save = async (ids: string[], done: string) => {
    setSaving(true);
    try {
      const updated = await api.setStoreKeepers(store.id, ids);
      onChanged(updated);
      toast.success('Store men updated', done);
    } catch (err: any) {
      toast.error('Not saved', err?.message || 'The store men could not be saved.');
    } finally {
      setSaving(false);
      setPicked('');
    }
  };

  const options = employees
    .filter((e) => e.isActive !== false && !men.some((k) => k.employeeId === e.id))
    .map((e) => ({ value: e.id, label: `${e.fullNameEn} (${e.payrollId})` }));

  return (
    <div className="border-b border-slate-200 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
          <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
          Store men
        </span>
        {men.map((k) => (
          <span key={k.employeeId} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-2 font-medium text-emerald-900">
            {k.fullNameEn}
            <span className="font-mono text-[10px] text-emerald-700/70">{k.payrollId}</span>
            {canManage && (
              <button
                type="button"
                disabled={saving}
                aria-label={`Remove ${k.fullNameEn} as a store man of ${store.name}`}
                onClick={() => save(men.filter((m) => m.employeeId !== k.employeeId).map((m) => m.employeeId), `${k.fullNameEn} is no longer a store man of ${store.name}.`)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-200 cursor-pointer disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {men.length === 0 && (
          <span className="text-amber-800">
            None assigned yet: this store's vouchers name no store man until one is added.
          </span>
        )}
      </div>

      {canManage && store.isActive && (
        <div className="mt-2 max-w-sm">
          <SearchableSelect
            id={`store-man-${store.id}`}
            value={picked}
            onChange={(id) => id && save([...men.map((m) => m.employeeId), id], `Added as a store man of ${store.name}.`)}
            placeholder="Add a store man…"
            searchPlaceholder="Search by name or employee ID…"
            groups={[{ label: 'Employees', options }]}
          />
        </div>
      )}
    </div>
  );
};

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
  // The staff register: who can be made a store man
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    if (canManage) api.getEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [canManage]);

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

  type LocationSortColumn = 'name' | 'items' | 'status';
  const [locSortColumn, setLocSortColumn] = useState<LocationSortColumn>('name');
  const [locSortDirection, setLocSortDirection] = useState<SortDirection>('asc');

  const handleLocSort = (colKey: string) => {
    const col = colKey as LocationSortColumn;
    if (locSortColumn === col) {
      setLocSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setLocSortColumn(col);
      setLocSortDirection(col === 'items' ? 'desc' : 'asc');
    }
  };

  const sortLocations = (locations: Location[]) => {
    return [...locations].sort((a, b) => {
      let diff = 0;
      if (locSortColumn === 'name') {
        diff = a.name.localeCompare(b.name);
      } else if (locSortColumn === 'items') {
        diff = (a.itemCount ?? 0) - (b.itemCount ?? 0);
      } else if (locSortColumn === 'status') {
        diff = a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
      }
      return locSortDirection === 'asc' ? diff : -diff;
    });
  };

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
    <div className="space-y-3 animate-fadeIn pb-16">
      {/* Stores that still need a store man, for whoever can assign one */}
      <StoreManReminder stores={stores ?? undefined} />

      {/* ── Toolbar Card: Search + Filter on left, Action button on right ── */}
      <div className="rounded-md bg-white p-3 sm:px-4 sm:py-3 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 max-w-lg min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="store-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by store, address or location…"
                aria-label="Search stores and locations"
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 hover:border-slate-500 rounded-[4px] text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-colors"
              />
            </div>
            {canManage && (
              <FilterPopover
                label="Filter"
                ariaLabel="Filter stores"
                title="Filters"
                resetLabel="Reset"
                activeCount={statusFilter !== 'ACTIVE' ? 1 : 0}
                onReset={() => setStatusFilter('ACTIVE')}
                resultCountText={`${shown.length} ${shown.length === 1 ? 'store' : 'stores'}`}
              >
                <FilterSection label="Store Status">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {(
                      [
                        ['ACTIVE', 'Active', activeStores.length],
                        ['INACTIVE', 'Deactivated', stores.length - activeStores.length],
                        ['ALL', 'All', stores.length],
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
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <button
                type="button"
                onClick={() => setEditing({ kind: 'store', store: null })}
                className={`${btn.primary} shrink-0`}
              >
                <Plus className="h-4 w-4" />
                <span>Add store</span>
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {statusFilter !== 'ACTIVE' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 mt-2.5">
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

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 mt-2.5">
          <span>
            <span className="font-semibold text-slate-900">{shown.length}</span> of {stores.length} stores
          </span>
          <span>{usableLocations} active locations</span>
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
        <StoresSkeleton count={4} />
      ) : shown.length === 0 ? (
        <div className="rounded-md bg-white p-10 text-center text-xs text-slate-500 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
          {stores.length === 0 ? (
            `No stores yet.${canManage ? ' Add the first one with "Add store".' : ''}`
          ) : (
            <div className="space-y-1.5">
              <p>No stores match these filters.</p>
              {(statusFilter !== 'ACTIVE' || search) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ACTIVE');
                    setSearch('');
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((store) => {
            const held = store.itemCount ?? 0;
            const onlyPlace = store.isActive && usableLocations - store.locations.filter((l) => l.isActive).length === 0;
            return (
              <section key={store.id} aria-label={store.name} className="rounded-md overflow-hidden bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.06)]">
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

                {/* Who keeps it */}
                <StoreMen
                  store={store}
                  canManage={canManage}
                  employees={employees}
                  onChanged={(updated) => setStores((all) => all.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
                />

                {/* Its locations */}
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className={table.headRow}>
                      <SortableHeader
                        label="Location"
                        columnKey="name"
                        currentSortColumn={locSortColumn}
                        currentSortDirection={locSortDirection}
                        onSort={handleLocSort}
                        thClassName="px-4 py-1.5 pl-16"
                      />
                      {canManage && (
                        <SortableHeader
                          label="Item records in store"
                          columnKey="items"
                          currentSortColumn={locSortColumn}
                          currentSortDirection={locSortDirection}
                          onSort={handleLocSort}
                          align="right"
                          thClassName="px-3 py-1.5 text-right whitespace-nowrap"
                        />
                      )}
                      <SortableHeader
                        label="Status"
                        columnKey="status"
                        currentSortColumn={locSortColumn}
                        currentSortDirection={locSortDirection}
                        onSort={handleLocSort}
                        thClassName="px-3 py-1.5 w-32"
                      />
                      {canManage && (
                        <th className={`px-3 py-1.5 ${table.actionsHead}`}>
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortLocations(store.locations).map((l) => {
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
                            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
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
                ? 'The store and all its locations will no longer appear in the Receiving and Transfers forms. Past records keep their names.'
                : 'It will no longer appear in the Receiving and Transfers forms. Past records keep its name.'
              : 'It will appear in the forms again.'}
      </ConfirmDialog>
    </div>
  );
};
