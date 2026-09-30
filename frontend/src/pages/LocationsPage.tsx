import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { Button, StatCard, StatusBadge } from '../components/ui';
import { useToast } from '../context/ToastContext';
import {
  ItemStatus,
  ItemWithRelations,
  Location,
  LocationInput,
  UserRole,
} from '../types/asset-management';
import { formatETB } from '../utils/eth-date';

interface Registry {
  locations: Location[];
  items: ItemWithRelations[];
}
interface Editor {
  id?: string;
  values: LocationInput;
}
const emptyLocation: LocationInput = {
  siteName: '',
  building: '',
  roomNumber: '',
  isCentralStore: false,
};
const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600';
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed. Please try again.';

export const LocationsPage: React.FC<{ currentRole: UserRole }> = ({
  currentRole,
}) => {
  const canManage = currentRole === UserRole.SYSTEM_ADMIN;
  const canView =
    canManage ||
    [UserRole.DATA_ENCODER, UserRole.DEPARTMENT_HEAD].includes(currentRole);
  const toast = useToast();
  const [data, setData] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const mutationPending = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  const addButtonRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [locations, items] = await Promise.all([
        api.getLocations(),
        api.getItems(),
      ]);
      if (id === requestId.current) setData({ locations, items });
    } catch (error) {
      if (id === requestId.current) setLoadError(messageOf(error));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (editor || deleteTarget) {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [editor?.id, !!editor, deleteTarget?.id]);
  useEffect(() => {
    if (selectedId) {
      detailsRef.current?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [selectedId]);
  useEffect(() => {
    if (restoreFocus.current && !editor && !deleteTarget && !busy) {
      restoreFocus.current = false;
      if (openerRef.current?.isConnected) openerRef.current.focus();
      else
        addButtonRef.current
          ?.querySelector<HTMLButtonElement>('[data-add-location]')
          ?.focus();
    }
  }, [editor, deleteTarget, busy]);

  const registry = useMemo(() => {
    const rows = (data?.locations || []).map((location) => {
      const items = (data?.items || []).filter(
        (item) => item.storeLocationId === location.id
      );
      const active = items.filter(
        (item) => item.status !== ItemStatus.DISPOSED
      );
      return {
        location,
        items,
        active,
        available: active.filter((item) => item.status === ItemStatus.AVAILABLE)
          .length,
        value: active.reduce(
          (total, item) => total + (item.unitCostETB || 0),
          0
        ),
      };
    });
    const locationIds = new Set(data?.locations.map((location) => location.id));
    const unlinked = (data?.items || []).filter(
      (item) =>
        item.status !== ItemStatus.DISPOSED &&
        !locationIds.has(item.storeLocationId)
    );
    return { rows, unlinked };
  }, [data]);

  const visibleRows = registry.rows
    .filter(({ location }) => {
      const text = [
        location.siteName,
        location.building,
        location.roomNumber,
        location.id,
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        text.includes(search.trim().toLocaleLowerCase()) &&
        (type === 'all' ||
          (type === 'central'
            ? location.isCentralStore
            : !location.isCentralStore))
      );
    })
    .sort((a, b) => {
      if (sort === 'assets')
        return (
          b.active.length - a.active.length ||
          a.location.siteName.localeCompare(b.location.siteName)
        );
      if (sort === 'value')
        return (
          b.value - a.value ||
          a.location.siteName.localeCompare(b.location.siteName)
        );
      return (
        a.location.siteName.localeCompare(b.location.siteName) ||
        a.location.building.localeCompare(b.location.building) ||
        a.location.roomNumber.localeCompare(b.location.roomNumber)
      );
    });
  const selected = registry.rows.find((row) => row.location.id === selectedId);
  const selectedAssets = (selected?.items || []).filter((item) =>
    [
      item.name,
      item.itemCode,
      item.serialNumber,
      item.ifmisSlipNumber,
      item.currentCustodian?.fullNameEn,
    ].some((value) =>
      value
        ?.toLocaleLowerCase()
        .includes(assetSearch.trim().toLocaleLowerCase())
    )
  );
  const mutationsDisabled = busy || loading || !!loadError;

  const openEditor = (opener: HTMLButtonElement, location?: Location) => {
    openerRef.current = opener;
    setFormError(null);
    setDeleteTarget(null);
    setEditor({
      id: location?.id,
      values: location
        ? {
            siteName: location.siteName,
            building: location.building,
            roomNumber: location.roomNumber,
            isCentralStore: !!location.isCentralStore,
          }
        : { ...emptyLocation },
    });
  };
  const closePanel = () => {
    restoreFocus.current = true;
    setEditor(null);
    setDeleteTarget(null);
    setFormError(null);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !editor || mutationsDisabled || mutationPending.current)
      return;
    const payload = {
      ...editor.values,
      siteName: editor.values.siteName.trim(),
      building: editor.values.building.trim(),
      roomNumber: editor.values.roomNumber.trim(),
    };
    if (!payload.siteName || !payload.building || !payload.roomNumber) {
      setFormError('Site name, building, and room / store are required.');
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const saved = editor.id
        ? await api.updateLocation(editor.id, payload)
        : await api.createLocation(payload);
      setData(
        (previous) =>
          previous && {
            ...previous,
            locations: [
              ...previous.locations.filter(
                (location) => location.id !== saved.id
              ),
              saved,
            ],
          }
      );
      setSearch('');
      setType('all');
      closePanel();
      toast.success(
        editor.id ? 'Location updated' : 'Location added',
        `${saved.siteName} · ${saved.roomNumber}`
      );
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
      mutationPending.current = false;
    }
  };
  const remove = async () => {
    if (
      !canManage ||
      !deleteTarget ||
      mutationsDisabled ||
      mutationPending.current
    )
      return;
    mutationPending.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await api.deleteLocation(deleteTarget.id);
      setData(
        (previous) =>
          previous && {
            ...previous,
            locations: previous.locations.filter(
              (location) => location.id !== deleteTarget.id
            ),
          }
      );
      if (selectedId === deleteTarget.id) setSelectedId(null);
      closePanel();
      toast.success(
        'Location deleted',
        'The change has been recorded in the audit log.'
      );
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
      mutationPending.current = false;
    }
  };

  if (!canView) return <p role="alert">You do not have access to this page.</p>;

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1.5">
            Reference Data · ቦታዎች
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-emerald-700" />
            Locations & asset placement
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sites, buildings, and rooms linked to the asset register.
          </p>
        </div>
        <div ref={addButtonRef} className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={load}
            disabled={loading || busy || !!editor || !!deleteTarget}
            leftIcon={
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            }
          >
            Refresh
          </Button>
          {canManage && (
            <Button
              data-add-location
              onClick={(event) => openEditor(event.currentTarget)}
              disabled={mutationsDisabled || !data}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Add location
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-48">
            <p className="font-semibold">Unable to load locations</p>
            <p className="text-sm mt-1">
              {loadError} {data && 'Showing the last loaded data.'}
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            Retry
          </Button>
        </div>
      )}
      {loading && !data && (
        <p role="status" className="py-16 text-center text-slate-500">
          Loading locations and linked assets…
        </p>
      )}

      {data && (
        <>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
            aria-label="Location totals"
          >
            <StatCard
              label="Locations"
              value={data.locations.length}
              subtitle="Registered sites and rooms"
              icon={<MapPin className="h-5 w-5" />}
            />
            <StatCard
              label="Central stores"
              value={
                data.locations.filter((location) => location.isCentralStore)
                  .length
              }
              subtitle="Designated central storage"
              icon={<Warehouse className="h-5 w-5" />}
            />
            <StatCard
              label="Linked active assets"
              value={registry.rows.reduce(
                (sum, row) => sum + row.active.length,
                0
              )}
              subtitle="Includes assigned and pending assets"
              icon={<Package className="h-5 w-5" />}
            />
            <StatCard
              label="Recorded value"
              value={formatETB(
                registry.rows.reduce((sum, row) => sum + row.value, 0)
              )}
              subtitle="Active linked assets · ETB"
              valueColor="text-emerald-800"
            />
          </div>

          {canManage && (editor || deleteTarget) && (
            <section
              ref={panelRef}
              tabIndex={-1}
              aria-labelledby="location-editor-title"
              className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <h3
                id="location-editor-title"
                className="text-lg font-bold text-slate-900"
              >
                {editor
                  ? editor.id
                    ? 'Edit location'
                    : 'Add location'
                  : 'Delete unused location'}
              </h3>
              {formError && (
                <p
                  role="alert"
                  className="my-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800"
                >
                  {formError}
                </p>
              )}
              {editor ? (
                <form onSubmit={save} className="mt-4 space-y-4">
                  <fieldset
                    disabled={busy}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    {(['siteName', 'building', 'roomNumber'] as const).map(
                      (key) => (
                        <label
                          key={key}
                          className="text-xs font-bold text-slate-700 space-y-1.5"
                        >
                          <span>
                            {key === 'siteName'
                              ? 'Site name'
                              : key === 'building'
                                ? 'Building'
                                : 'Room / store'}{' '}
                            *
                          </span>
                          <input
                            required
                            maxLength={key === 'siteName' ? 150 : 100}
                            value={editor.values[key]}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                values: {
                                  ...editor.values,
                                  [key]: event.target.value,
                                },
                              })
                            }
                            className={fieldClass}
                          />
                        </label>
                      )
                    )}
                    <label className="md:col-span-3 flex gap-2 items-center text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editor.values.isCentralStore}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              isCentralStore: event.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 accent-emerald-700"
                      />
                      Designated central store
                    </label>
                  </fieldset>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      isLoading={busy}
                      disabled={!!loadError}
                    >
                      Save location
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closePanel}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Delete{' '}
                    <strong>
                      {deleteTarget!.siteName} · {deleteTarget!.building} ·{' '}
                      {deleteTarget!.roomNumber}
                    </strong>
                    ? This removes it from location selections. Its audit
                    history will be retained.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="danger"
                      onClick={remove}
                      isLoading={busy}
                      disabled={!!loadError}
                    >
                      Confirm deletion
                    </Button>
                    <Button
                      variant="outline"
                      onClick={closePanel}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {registry.unlinked.length > 0 && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {registry.unlinked.length} active asset(s) reference an unknown
              location and are excluded from these totals.
            </p>
          )}

          <section
            aria-label="Location registry"
            className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
          >
            <div className="p-4 flex flex-col md:flex-row gap-3 border-b border-slate-100">
              <label className="relative flex-1">
                <span className="sr-only">Search locations</span>
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search site, building, room, or ID…"
                  className={`${fieldClass} pl-9`}
                />
              </label>
              <label>
                <span className="sr-only">Location type</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className={fieldClass}
                >
                  <option value="all">All location types</option>
                  <option value="central">Central stores</option>
                  <option value="other">Other locations</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Sort locations</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className={fieldClass}
                >
                  <option value="name">Site name: A–Z</option>
                  <option value="assets">Most active assets</option>
                  <option value="value">Highest value</option>
                </select>
              </label>
            </div>
            {visibleRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">
                    Registered locations, asset totals, and available actions
                  </caption>
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Site & room
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Type
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Active assets
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Available
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Value (ETB)
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map(
                      ({ location, items, active, available, value }) => (
                        <tr
                          key={location.id}
                          className={
                            selectedId === location.id
                              ? 'bg-emerald-50/60'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="px-4 py-4 min-w-56">
                            <p className="font-bold text-slate-900">
                              {location.siteName}
                            </p>
                            <p className="text-slate-500 mt-1">
                              {location.building} · {location.roomNumber}
                            </p>
                            <p className="mt-1 text-[10px] font-mono text-slate-400 break-all">
                              {location.id}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-block rounded-full px-2.5 py-1 font-semibold whitespace-nowrap ${location.isCentralStore ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                            >
                              {location.isCentralStore
                                ? 'Central store'
                                : 'Other location'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold tabular-nums">
                            {active.length}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {available}
                          </td>
                          <td className="px-4 py-4 text-right font-semibold whitespace-nowrap tabular-nums">
                            {formatETB(value)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-1.5 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`View ${location.roomNumber} assets`}
                                onClick={(event) => {
                                  openerRef.current = event.currentTarget;
                                  setSelectedId(location.id);
                                  setAssetSearch('');
                                }}
                              >
                                View
                              </Button>
                              {canManage && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Edit ${location.roomNumber}`}
                                    disabled={mutationsDisabled}
                                    onClick={(event) =>
                                      openEditor(event.currentTarget, location)
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Delete ${location.roomNumber}`}
                                    title={
                                      items.length
                                        ? 'Linked asset records prevent deletion, including disposed assets.'
                                        : 'Delete unused location'
                                    }
                                    disabled={
                                      mutationsDisabled || items.length > 0
                                    }
                                    onClick={(event) => {
                                      openerRef.current = event.currentTarget;
                                      setEditor(null);
                                      setFormError(null);
                                      setDeleteTarget(location);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-700" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <MapPin className="h-9 w-9 mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-700">
                  {data.locations.length
                    ? 'No matching locations'
                    : 'No locations registered'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.locations.length
                    ? 'Try another search or location type.'
                    : canManage
                      ? 'Add a site, building, and room to start the registry.'
                      : 'Locations will appear here when an administrator adds them.'}
                </p>
              </div>
            )}
            <p className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              Showing {visibleRows.length} of {data.locations.length} locations.
              Active totals exclude disposed assets; available counts show stock
              ready for issue.
            </p>
          </section>

          {selected && (
            <section
              ref={detailsRef}
              tabIndex={-1}
              aria-labelledby="location-details-title"
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                    Linked asset register
                  </p>
                  <h3
                    id="location-details-title"
                    className="text-lg font-bold text-slate-900 mt-1"
                  >
                    {selected.location.siteName} ·{' '}
                    {selected.location.roomNumber}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {selected.location.building} · {selected.items.length} total
                    records, including disposed assets
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Close location details"
                  onClick={() => {
                    setSelectedId(null);
                    openerRef.current?.focus();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <label className="block mt-4 mb-3">
                <span className="sr-only">Search linked assets</span>
                <input
                  value={assetSearch}
                  onChange={(event) => setAssetSearch(event.target.value)}
                  className={fieldClass}
                  placeholder="Search asset, tag, serial, custodian, or IFMIS slip…"
                />
              </label>
              {selectedAssets.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-500 bg-slate-50">
                      <tr>
                        <th scope="col" className="p-3">
                          Asset / tag
                        </th>
                        <th scope="col" className="p-3">
                          Status
                        </th>
                        <th scope="col" className="p-3">
                          Custodian
                        </th>
                        <th scope="col" className="p-3">
                          IFMIS slip
                        </th>
                        <th scope="col" className="p-3 text-right">
                          Value (ETB)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedAssets.map((item) => (
                        <tr key={item.id}>
                          <td className="p-3">
                            <p className="font-semibold text-slate-900">
                              {item.name}
                            </p>
                            <p className="font-mono text-slate-500 mt-1">
                              {item.itemCode}
                            </p>
                          </td>
                          <td className="p-3">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="p-3">
                            {item.currentCustodian?.fullNameEn || 'Unassigned'}
                          </td>
                          <td className="p-3 font-mono">
                            {item.ifmisSlipNumber || '—'}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            {formatETB(item.unitCostETB)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  {selected.items.length
                    ? 'No matching assets.'
                    : 'No assets are linked to this location.'}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
