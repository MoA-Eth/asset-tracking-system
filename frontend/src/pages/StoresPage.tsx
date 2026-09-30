import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
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
type ManagementPanel =
  | { kind: 'designate'; locationId: string }
  | { kind: 'edit'; id: string; values: LocationInput }
  | { kind: 'remove'; location: Location };
const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600';
const locationLabel = (location: Location) =>
  `${location.siteName} · ${location.building} · ${location.roomNumber}`;
const valuesFor = (
  location: Location,
  isCentralStore: boolean
): LocationInput => ({
  siteName: location.siteName,
  building: location.building,
  roomNumber: location.roomNumber,
  isCentralStore,
});
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Unable to complete the request. Please try again.';
const statusLabels: Record<ItemStatus, string> = {
  AVAILABLE: 'Available',
  PENDING_STOCK_IN: 'Pending inbound',
  PENDING_STOCK_OUT: 'Pending outbound',
  ISSUED: 'Issued to staff',
  IN_REPAIR: 'In repair',
  UNDER_TRANSFER: 'Under transfer',
  DISPOSED: 'Disposed',
};

export const StoresPage: React.FC<{
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}> = ({ currentRole, onNavigate }) => {
  const canManage = currentRole === UserRole.SYSTEM_ADMIN;
  const canView =
    canManage ||
    [UserRole.DATA_ENCODER, UserRole.DEPARTMENT_HEAD].includes(currentRole);
  const toast = useToast();
  const [data, setData] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetStatus, setAssetStatus] = useState('active');
  const [panel, setPanel] = useState<ManagementPanel | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const mutationPending = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelOpener = useRef<HTMLButtonElement | null>(null);
  const detailOpener = useRef<HTMLButtonElement | null>(null);
  const restorePanelFocus = useRef(false);
  const panelKey = panel
    ? `${panel.kind}:${panel.kind === 'edit' ? panel.id : panel.kind === 'remove' ? panel.location.id : ''}`
    : '';

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
      if (id === requestId.current) setLoadError(errorMessage(error));
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
    if (panelKey) {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [panelKey]);
  useEffect(() => {
    if (selectedId) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [selectedId]);
  useEffect(() => {
    if (restorePanelFocus.current && !panel && !saving) {
      restorePanelFocus.current = false;
      if (panelOpener.current?.isConnected) panelOpener.current.focus();
      else
        headerRef.current
          ?.querySelector<HTMLButtonElement>('[data-designate-store]')
          ?.focus();
    }
  }, [panel, saving]);

  const registry = useMemo(() => {
    const stores = (data?.locations || [])
      .filter((location) => location.isCentralStore)
      .map((location) => {
        const items = (data?.items || []).filter(
          (item) => item.storeLocationId === location.id
        );
        const active = items.filter(
          (item) => item.status !== ItemStatus.DISPOSED
        );
        const available = items.filter(
          (item) => item.status === ItemStatus.AVAILABLE
        );
        const inbound = items.filter(
          (item) => item.status === ItemStatus.PENDING_STOCK_IN
        ).length;
        const outbound = items.filter(
          (item) => item.status === ItemStatus.PENDING_STOCK_OUT
        ).length;
        return {
          location,
          items,
          active,
          available,
          inbound,
          outbound,
          issued: items.filter((item) => item.status === ItemStatus.ISSUED)
            .length,
          availableValue: available.reduce(
            (sum, item) => sum + (item.unitCostETB || 0),
            0
          ),
        };
      });
    const locationIds = new Set(data?.locations.map((location) => location.id));
    const otherIds = new Set(
      data?.locations
        .filter((location) => !location.isCentralStore)
        .map((location) => location.id)
    );
    const availableOutsideStores = (data?.items || []).filter(
      (item) =>
        item.status === ItemStatus.AVAILABLE &&
        otherIds.has(item.storeLocationId)
    ).length;
    const unknownLocations = (data?.items || []).filter(
      (item) =>
        item.status !== ItemStatus.DISPOSED &&
        !locationIds.has(item.storeLocationId)
    ).length;
    return { stores, availableOutsideStores, unknownLocations };
  }, [data]);

  const eligibleLocations = (data?.locations || [])
    .filter((location) => !location.isCentralStore)
    .sort((a, b) => locationLabel(a).localeCompare(locationLabel(b)));
  const visibleStores = registry.stores
    .filter((store) => {
      const matchesText =
        `${locationLabel(store.location)} ${store.location.id}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase());
      return (
        matchesText &&
        (stockFilter === 'all' ||
          (stockFilter === 'available'
            ? store.available.length > 0
            : stockFilter === 'pending'
              ? store.inbound + store.outbound > 0
              : store.available.length === 0))
      );
    })
    .sort((a, b) => {
      const byName = locationLabel(a.location).localeCompare(
        locationLabel(b.location)
      );
      return sort === 'available'
        ? b.available.length - a.available.length || byName
        : sort === 'value'
          ? b.availableValue - a.availableValue || byName
          : byName;
    });
  const selected = registry.stores.find(
    (store) => store.location.id === selectedId
  );
  const filteredAssets = (selected?.items || []).filter((item) => {
    const matchesStatus =
      assetStatus === 'all' ||
      (assetStatus === 'active'
        ? item.status !== ItemStatus.DISPOSED
        : item.status === assetStatus);
    const matchesSearch = [
      item.name,
      item.itemCode,
      item.serialNumber,
      item.ifmisSlipNumber,
      item.currentCustodian?.fullNameEn,
    ].some((value) =>
      value
        ?.toLocaleLowerCase()
        .includes(assetSearch.trim().toLocaleLowerCase())
    );
    return matchesStatus && matchesSearch;
  });
  const disableChanges = loading || saving || !!loadError;

  const openPanel = (next: ManagementPanel, opener: HTMLButtonElement) => {
    panelOpener.current = opener;
    setSaveError(null);
    setPanel(next);
  };
  const closePanel = () => {
    restorePanelFocus.current = true;
    setPanel(null);
    setSaveError(null);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !panel || disableChanges || mutationPending.current)
      return;
    let id: string;
    let values: LocationInput;
    if (panel.kind === 'designate') {
      const location = eligibleLocations.find(
        (location) => location.id === panel.locationId
      );
      if (!location) {
        setSaveError('Select an existing location to designate as a store.');
        return;
      }
      id = location.id;
      values = valuesFor(location, true);
    } else if (panel.kind === 'edit') {
      id = panel.id;
      values = {
        ...panel.values,
        siteName: panel.values.siteName.trim(),
        building: panel.values.building.trim(),
        roomNumber: panel.values.roomNumber.trim(),
        isCentralStore: true,
      };
      if (!values.siteName || !values.building || !values.roomNumber) {
        setSaveError('Site name, building, and room / store are required.');
        return;
      }
    } else {
      id = panel.location.id;
      values = valuesFor(panel.location, false);
    }
    mutationPending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateLocation(id, values);
      setData(
        (previous) =>
          previous && {
            ...previous,
            locations: previous.locations.map((location) =>
              location.id === saved.id ? saved : location
            ),
          }
      );
      if (!saved.isCentralStore && selectedId === saved.id) setSelectedId(null);
      setSearch('');
      setStockFilter('all');
      closePanel();
      toast.success(
        panel.kind === 'designate'
          ? 'Store designated'
          : panel.kind === 'edit'
            ? 'Store details updated'
            : 'Store designation removed',
        locationLabel(saved)
      );
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      mutationPending.current = false;
      setSaving(false);
    }
  };

  if (!canView) return <p role="alert">You do not have access to this page.</p>;

  return (
    <div className="space-y-5 animate-fadeIn">
      <div
        ref={headerRef}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5"
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-700 mb-1.5">
            Reference Data · መጋዘኖች
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-emerald-700" />
            Stores & stock availability
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Designated store locations, ready-to-issue stock, and pending
            movements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={load}
            disabled={loading || saving || !!panel}
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
              data-designate-store
              disabled={disableChanges || !data}
              onClick={(event) =>
                openPanel(
                  { kind: 'designate', locationId: '' },
                  event.currentTarget
                )
              }
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Designate store
            </Button>
          )}
        </div>
      </div>
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap gap-3 items-center text-amber-950"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-48">
            <p className="font-semibold">Unable to load stores</p>
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
        <p role="status" className="text-center text-slate-500 py-16">
          Loading stores and inventory…
        </p>
      )}
      {data && (
        <>
          <div
            aria-label="Store totals"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
          >
            <StatCard
              label="Designated stores"
              value={registry.stores.length}
              subtitle="Central and research-center stores"
              icon={<Warehouse className="h-5 w-5" />}
            />
            <StatCard
              label="Available assets"
              value={registry.stores.reduce(
                (sum, store) => sum + store.available.length,
                0
              )}
              subtitle="Approved stock ready for issue"
              icon={<Package className="h-5 w-5" />}
            />
            <StatCard
              label="Pending review"
              value={registry.stores.reduce(
                (sum, store) => sum + store.inbound + store.outbound,
                0
              )}
              subtitle="Inbound receipts/returns and outbound issues"
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              label="Available stock value"
              value={formatETB(
                registry.stores.reduce(
                  (sum, store) => sum + store.availableValue,
                  0
                )
              )}
              subtitle="Available assets only · ETB"
              valueColor="text-emerald-800"
            />
          </div>

          {canManage && panel && (
            <section
              ref={panelRef}
              tabIndex={-1}
              aria-labelledby="store-management-title"
              className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <h3
                id="store-management-title"
                className="text-lg font-bold text-slate-900"
              >
                {panel.kind === 'designate'
                  ? 'Designate an existing location'
                  : panel.kind === 'edit'
                    ? 'Edit store details'
                    : 'Remove store designation'}
              </h3>
              {saveError && (
                <p
                  role="alert"
                  className="my-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {saveError}
                </p>
              )}
              <form onSubmit={save} className="mt-4 space-y-4">
                {panel.kind === 'designate' &&
                  (eligibleLocations.length ? (
                    <>
                      <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                        <span>Existing location *</span>
                        <select
                          required
                          value={panel.locationId}
                          disabled={saving}
                          onChange={(event) =>
                            setPanel({
                              ...panel,
                              locationId: event.target.value,
                            })
                          }
                          className={fieldClass}
                        >
                          <option value="">Choose a location</option>
                          {eligibleLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {locationLabel(location)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-sm text-slate-500">
                        The selected location will be included in the store
                        register. Its existing asset links are retained.
                      </p>
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p>
                        There are no other locations to designate. Register a
                        location through Locations first.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => onNavigate('settings-locations')}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        Open Locations
                      </Button>
                    </div>
                  ))}
                {panel.kind === 'edit' && (
                  <fieldset
                    disabled={saving}
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
                            value={panel.values[key]}
                            onChange={(event) =>
                              setPanel({
                                ...panel,
                                values: {
                                  ...panel.values,
                                  [key]: event.target.value,
                                },
                              })
                            }
                            className={fieldClass}
                          />
                        </label>
                      )
                    )}
                  </fieldset>
                )}
                {panel.kind === 'remove' && (
                  <p className="text-sm text-slate-600">
                    Remove the store designation for{' '}
                    <strong>{locationLabel(panel.location)}</strong>? This
                    location and all its linked assets will remain in Locations.
                    Its stock will be excluded from store totals. The change
                    will be recorded in the audit log.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(panel.kind !== 'designate' ||
                    eligibleLocations.length > 0) && (
                    <Button
                      type="submit"
                      variant={panel.kind === 'remove' ? 'danger' : 'primary'}
                      isLoading={saving}
                      disabled={loading || !!loadError}
                    >
                      {panel.kind === 'designate'
                        ? 'Save designation'
                        : panel.kind === 'edit'
                          ? 'Save store details'
                          : 'Confirm removal'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={closePanel}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </section>
          )}

          {(registry.availableOutsideStores > 0 ||
            registry.unknownLocations > 0) && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
            >
              {registry.availableOutsideStores > 0 && (
                <p>
                  {registry.availableOutsideStores} available asset(s) are
                  linked to locations without a store designation and are
                  excluded from these store totals.
                </p>
              )}
              {registry.unknownLocations > 0 && (
                <p>
                  {registry.unknownLocations} active asset(s) reference unknown
                  locations and are excluded from these totals.
                </p>
              )}
            </div>
          )}

          <section
            aria-label="Store registry"
            className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
          >
            <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-slate-100">
              <label className="relative flex-1">
                <span className="sr-only">Search stores</span>
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search site, building, room, or ID…"
                  className={`${fieldClass} pl-9`}
                />
              </label>
              <label>
                <span className="sr-only">Stock availability</span>
                <select
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value)}
                  className={fieldClass}
                >
                  <option value="all">All stores</option>
                  <option value="available">Has available stock</option>
                  <option value="empty">No available stock</option>
                  <option value="pending">Has pending review</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Sort stores</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className={fieldClass}
                >
                  <option value="name">Site name: A–Z</option>
                  <option value="available">Most available assets</option>
                  <option value="value">Highest available value</option>
                </select>
              </label>
            </div>
            {visibleStores.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">
                    Designated stores and stock availability
                  </caption>
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="p-4">
                        Store
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Available
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Pending
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Issued
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Available value (ETB)
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleStores.map((store) => (
                      <tr
                        key={store.location.id}
                        className={
                          selectedId === store.location.id
                            ? 'bg-emerald-50/60'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="p-4 min-w-56">
                          <p className="font-bold text-slate-900">
                            {store.location.siteName}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {store.location.building} ·{' '}
                            {store.location.roomNumber}
                          </p>
                          <p className="mt-1 text-[10px] font-mono text-slate-400 break-all">
                            {store.location.id}
                          </p>
                        </td>
                        <td className="p-4 text-right font-bold text-emerald-800 tabular-nums">
                          {store.available.length}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <p>{store.inbound} inbound</p>
                          <p className="mt-1 text-slate-500">
                            {store.outbound} outbound
                          </p>
                        </td>
                        <td className="p-4 text-right tabular-nums">
                          {store.issued}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap font-semibold tabular-nums">
                          {formatETB(store.availableValue)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`View ${store.location.roomNumber} inventory`}
                              onClick={(event) => {
                                detailOpener.current = event.currentTarget;
                                setSelectedId(store.location.id);
                                setAssetSearch('');
                                setAssetStatus('active');
                                if (selectedId === store.location.id)
                                  detailRef.current?.focus();
                              }}
                            >
                              View
                            </Button>
                            {canManage && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Edit ${store.location.roomNumber} store`}
                                  disabled={disableChanges}
                                  onClick={(event) =>
                                    openPanel(
                                      {
                                        kind: 'edit',
                                        id: store.location.id,
                                        values: valuesFor(store.location, true),
                                      },
                                      event.currentTarget
                                    )
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Remove ${store.location.roomNumber} designation`}
                                  disabled={disableChanges}
                                  onClick={(event) =>
                                    openPanel(
                                      {
                                        kind: 'remove',
                                        location: store.location,
                                      },
                                      event.currentTarget
                                    )
                                  }
                                >
                                  <X className="h-4 w-4 text-red-700" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <Warehouse className="h-9 w-9 mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-700">
                  {registry.stores.length
                    ? 'No matching stores'
                    : 'No stores designated'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {registry.stores.length
                    ? 'Try another search or stock filter.'
                    : canManage
                      ? 'Designate an existing location to include it in the store register.'
                      : 'An administrator can designate store locations.'}
                </p>
              </div>
            )}
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              Showing {visibleStores.length} of {registry.stores.length} stores.
              Available totals exclude pending, issued, repair, transfer, and
              disposed assets.
            </p>
          </section>

          {selected && (
            <section
              ref={detailRef}
              tabIndex={-1}
              aria-labelledby="store-inventory-title"
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <div className="flex justify-between gap-3 items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                    Store inventory
                  </p>
                  <h3
                    id="store-inventory-title"
                    className="mt-1 text-lg font-bold text-slate-900"
                  >
                    {selected.location.siteName} ·{' '}
                    {selected.location.roomNumber}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {selected.active.length} active linked assets ·{' '}
                    {selected.available.length} ready for issue. Issued assets
                    remain linked to their recorded store.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Close store inventory"
                  onClick={() => {
                    setSelectedId(null);
                    if (detailOpener.current?.isConnected)
                      detailOpener.current.focus();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 my-4">
                <label className="flex-1">
                  <span className="sr-only">Search store inventory</span>
                  <input
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    placeholder="Search asset, tag, serial, custodian, or IFMIS slip…"
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className="sr-only">Inventory status</span>
                  <select
                    value={assetStatus}
                    onChange={(event) => setAssetStatus(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="active">Active assets</option>
                    <option value="all">All records</option>
                    {Object.values(ItemStatus).map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filteredAssets.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">
                      Assets linked to the selected store
                    </caption>
                    <thead className="bg-slate-50 text-slate-500">
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
                          Recorded value (ETB)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAssets.map((item) => (
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
                    ? 'No assets match this search and status.'
                    : 'No assets are linked to this store.'}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Showing {filteredAssets.length} of {selected.items.length}{' '}
                linked records.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
};
