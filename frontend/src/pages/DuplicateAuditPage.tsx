import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import { ItemWithRelations, Location, ItemStatus, UserRole } from '../types/asset-management';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatETB } from '../utils/eth-date';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  FileSpreadsheet,
  Layers,
} from 'lucide-react';

export interface MatchedAttribute {
  key: string;
  label: string;
  value: string;
}

export interface DuplicateConflict {
  id: string;
  pendingItem: ItemWithRelations;
  existingItem: ItemWithRelations;
  matchType: 'SERIAL' | 'VOUCHER' | 'STORE_ITEM' | 'DISPOSED' | 'INTRA_PENDING';
  headline: string;
  reason: string;
  matchedAttributes: MatchedAttribute[];
  severity: 'HIGH' | 'MEDIUM';
}

interface DuplicateAuditPageProps {
  onNavigate?: (tab: string) => void;
}

/** Normalized description for reliable duplicate matching regardless of punctuation/spacing */
function normalizeDesc(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[,\-_./\\()[\]{}:;'"!@#$%^&*+=?<>~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidSerial(serial?: string | null): boolean {
  if (!serial) return false;
  const s = serial.trim().toLowerCase();
  return s.length >= 2 && s !== 'n/a' && s !== 'na' && s !== 'none' && s !== '-' && s !== 'nil';
}

export const DuplicateAuditPage: React.FC<DuplicateAuditPageProps> = ({ onNavigate }) => {
  const toast = useToast();
  const { role } = useAuth();

  const isSuperAdmin = role === UserRole.SUPER_ADMIN;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selectedConflictIds, setSelectedConflictIds] = useState<Set<string>>(new Set());
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Active item pending confirmation modal
  const [confirmConflict, setConfirmConflict] = useState<DuplicateConflict | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'SERIAL' | 'VOUCHER' | 'STORE_ITEM' | 'DISPOSED' | 'INTRA_PENDING'>('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, locsRes] = await Promise.all([
        api.getItems(),
        api.getLocations(),
      ]);
      setItems(itemsRes);
      setLocations(locsRes);
    } catch (err: any) {
      toast.error('Failed to load assets', err?.message || 'Could not fetch records.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isSuperAdmin) {
      void fetchData();
    }
  }, [fetchData, isSuperAdmin]);

  // Map store locations for quick lookup
  const storeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      const label = loc.storeName || loc.name || 'Store';
      map.set(loc.id, label);
    }
    return map;
  }, [locations]);

  // Separate pending receive items and existing registered items
  const { pendingItems, existingItems } = useMemo(() => {
    const pending: ItemWithRelations[] = [];
    const existing: ItemWithRelations[] = [];

    for (const it of items) {
      if (it.parentItemId) continue; // skip split child lines

      if (it.status === ItemStatus.PENDING_STOCK_IN) {
        pending.push(it);
      } else if (it.status !== ItemStatus.REJECTED && it.status !== ItemStatus.DRAFT) {
        existing.push(it);
      }
    }
    return { pendingItems: pending, existingItems: existing };
  }, [items]);

  // Detect conflicts between pending items and existing items (or within pending batch)
  const allConflicts = useMemo<DuplicateConflict[]>(() => {
    const list: DuplicateConflict[] = [];

    const buildMatchedAttributes = (
      p: ItemWithRelations,
      e: ItemWithRelations
    ): MatchedAttribute[] => {
      const attrs: MatchedAttribute[] = [];

      if (isValidSerial(p.serialNumber) && isValidSerial(e.serialNumber) && p.serialNumber?.trim().toLowerCase() === e.serialNumber?.trim().toLowerCase()) {
        attrs.push({
          key: 'serial',
          label: 'Serial Number',
          value: p.serialNumber.trim(),
        });
      }

      const pSlip = String(p.ifmisSlipNumber || '').trim();
      const eSlip = String(e.ifmisSlipNumber || '').trim();
      if (pSlip && eSlip && pSlip.toLowerCase() === eSlip.toLowerCase()) {
        attrs.push({
          key: 'voucher',
          label: 'Model 19 Voucher',
          value: `#${pSlip}`,
        });
      }

      const pNorm = normalizeDesc(p.name);
      const eNorm = normalizeDesc(e.name);
      if (pNorm && eNorm && pNorm === eNorm) {
        attrs.push({
          key: 'name',
          label: 'Description',
          value: p.name,
        });
      }

      if (p.storeLocationId && e.storeLocationId && p.storeLocationId === e.storeLocationId) {
        attrs.push({
          key: 'store',
          label: 'Store',
          value: storeMap.get(p.storeLocationId) || 'Same Store',
        });
      }

      if (p.unitCostETB !== undefined && e.unitCostETB !== undefined && Math.abs(p.unitCostETB - e.unitCostETB) < 0.01) {
        attrs.push({
          key: 'cost',
          label: 'Unit Cost',
          value: formatETB(p.unitCostETB),
        });
      }

      return attrs;
    };

    // 1. Cross-check pending imported items against active/existing inventory
    for (const pending of pendingItems) {
      const pendingNormName = normalizeDesc(pending.name);
      const pendingSerial = isValidSerial(pending.serialNumber) ? pending.serialNumber.trim().toLowerCase() : null;
      const pendingVoucher = String(pending.ifmisSlipNumber || '').trim().toLowerCase();
      const isRealVoucher = pendingVoucher && !pendingVoucher.startsWith('pending-') && !pendingVoucher.startsWith('draft-');
      const pendingIfmis = String(pending.itemCode || pending.ifmisTagNumber || '').trim().toLowerCase();

      for (const existing of existingItems) {
        // Condition 1: Non-blank Serial Number match
        const existSerial = isValidSerial(existing.serialNumber) ? existing.serialNumber.trim().toLowerCase() : null;
        if (pendingSerial && existSerial && pendingSerial === existSerial) {
          list.push({
            id: `serial-${pending.id}-${existing.id}`,
            pendingItem: pending,
            existingItem: existing,
            matchType: 'SERIAL',
            headline: 'Duplicate Serial Number',
            reason: `Serial "${pending.serialNumber}" is already registered on asset ${existing.itemCode} in ${storeMap.get(existing.storeLocationId) || 'store'}.`,
            matchedAttributes: buildMatchedAttributes(pending, existing),
            severity: 'HIGH',
          });
          continue;
        }

        // Condition 2: Model 19 Voucher collision
        const existVoucher = String(existing.ifmisSlipNumber || '').trim().toLowerCase();
        if (isRealVoucher && existVoucher && pendingVoucher === existVoucher) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName === existNormName || (pendingIfmis && pendingIfmis === String(existing.itemCode || '').toLowerCase())) {
            list.push({
              id: `voucher-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'VOUCHER',
              headline: 'Model 19 Voucher Collision',
              reason: `Voucher #${pending.ifmisSlipNumber} was already received and registered into inventory (${existing.itemCode}).`,
              matchedAttributes: buildMatchedAttributes(pending, existing),
              severity: 'HIGH',
            });
            continue;
          }
        }

        // Condition 3: Disposed Asset Match
        if (existing.status === ItemStatus.DISPOSED) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName.length >= 3 && pendingNormName === existNormName) {
            list.push({
              id: `disposed-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'DISPOSED',
              headline: 'Collision with Disposed Asset',
              reason: `Matches an asset previously marked as DISPOSED (${existing.itemCode}).`,
              matchedAttributes: buildMatchedAttributes(pending, existing),
              severity: 'HIGH',
            });
            continue;
          }
        }

        // Condition 4: Same Item Description in the Same Store
        if (pending.storeLocationId && existing.storeLocationId && pending.storeLocationId === existing.storeLocationId) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName.length >= 3 && pendingNormName === existNormName) {
            list.push({
              id: `store-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'STORE_ITEM',
              headline: 'Same Item in Same Store',
              reason: `Identical description already exists in ${storeMap.get(pending.storeLocationId) || 'this store'} under ${existing.itemCode}.`,
              matchedAttributes: buildMatchedAttributes(pending, existing),
              severity: 'MEDIUM',
            });
            break;
          }
        }
      }
    }

    // 2. Cross-check pending imported items against each other (intra-batch Excel duplicates)
    for (let i = 0; i < pendingItems.length; i++) {
      const p1 = pendingItems[i];
      const p1Serial = isValidSerial(p1.serialNumber) ? p1.serialNumber.trim().toLowerCase() : null;
      const p1Voucher = String(p1.ifmisSlipNumber || '').trim().toLowerCase();
      const p1NormName = normalizeDesc(p1.name);

      for (let j = i + 1; j < pendingItems.length; j++) {
        const p2 = pendingItems[j];
        const p2Serial = isValidSerial(p2.serialNumber) ? p2.serialNumber.trim().toLowerCase() : null;
        const p2Voucher = String(p2.ifmisSlipNumber || '').trim().toLowerCase();
        const p2NormName = normalizeDesc(p2.name);

        if (p1Serial && p2Serial && p1Serial === p2Serial) {
          list.push({
            id: `pending-dup-serial-${p1.id}-${p2.id}`,
            pendingItem: p2,
            existingItem: p1,
            matchType: 'INTRA_PENDING',
            headline: 'Repeated Serial in Import Batch',
            reason: `Repeated serial "${p1.serialNumber}" across multiple lines in the incoming Excel batch.`,
            matchedAttributes: buildMatchedAttributes(p2, p1),
            severity: 'HIGH',
          });
        } else if (p1Voucher && p2Voucher && p1Voucher === p2Voucher && p1NormName && p1NormName === p2NormName) {
          list.push({
            id: `pending-dup-voucher-${p1.id}-${p2.id}`,
            pendingItem: p2,
            existingItem: p1,
            matchType: 'INTRA_PENDING',
            headline: 'Repeated Item in Same Voucher',
            reason: `Voucher #${p1.ifmisSlipNumber} contains multiple identical lines in the incoming batch.`,
            matchedAttributes: buildMatchedAttributes(p2, p1),
            severity: 'HIGH',
          });
        }
      }
    }

    return list;
  }, [pendingItems, existingItems, storeMap]);

  // Active (non-dismissed) conflicts
  const activeConflicts = useMemo(() => {
    return allConflicts.filter((c) => !dismissedIds.has(c.id));
  }, [allConflicts, dismissedIds]);

  // Filtered conflicts based on user controls
  const filteredConflicts = useMemo(() => {
    return activeConflicts.filter((c) => {
      if (storeFilter !== 'ALL') {
        const matchesPending = c.pendingItem.storeLocationId === storeFilter;
        const matchesExisting = c.existingItem.storeLocationId === storeFilter;
        if (!matchesPending && !matchesExisting) return false;
      }

      if (typeFilter !== 'ALL' && c.matchType !== typeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pName = (c.pendingItem.name || '').toLowerCase();
        const pCode = (c.pendingItem.itemCode || '').toLowerCase();
        const pSlip = (c.pendingItem.ifmisSlipNumber || '').toLowerCase();
        const pSerial = (c.pendingItem.serialNumber || '').toLowerCase();
        const eName = (c.existingItem.name || '').toLowerCase();
        const eCode = (c.existingItem.itemCode || '').toLowerCase();

        return (
          pName.includes(q) ||
          pCode.includes(q) ||
          pSlip.includes(q) ||
          pSerial.includes(q) ||
          eName.includes(q) ||
          eCode.includes(q)
        );
      }

      return true;
    });
  }, [activeConflicts, storeFilter, typeFilter, searchQuery]);

  // Execute deletion of confirmed duplicate pending line
  const executeDelete = async (conflict: DuplicateConflict) => {
    const item = conflict.pendingItem;
    setActionInProgress(conflict.id);
    try {
      await api.deleteItem(item.id);
      toast.success(
        'Duplicate Line Removed',
        `Pending item ${item.itemCode} was removed from Receive Pending.`
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id && i.parentItemId !== item.id));
      setSelectedConflictIds((prev) => {
        const next = new Set(prev);
        next.delete(conflict.id);
        return next;
      });
      setConfirmConflict(null);
    } catch (err: any) {
      toast.error('Deletion Failed', err?.message || 'Could not delete item.');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle batch deletion of all selected duplicates
  const handleDeleteSelected = async () => {
    const toDelete = filteredConflicts.filter((c) => selectedConflictIds.has(c.id));
    if (toDelete.length === 0) return;

    const confirmMsg = `Permanently delete ${toDelete.length} selected duplicate lines from Receive Pending?\n\nExisting inventory in store will NOT be affected.`;
    if (!window.confirm(confirmMsg)) return;

    setActionInProgress('BATCH');
    let successCount = 0;
    const failedCodes: string[] = [];

    for (const conflict of toDelete) {
      try {
        await api.deleteItem(conflict.pendingItem.id);
        successCount++;
        setItems((prev) => prev.filter((i) => i.id !== conflict.pendingItem.id && i.parentItemId !== conflict.pendingItem.id));
      } catch (err) {
        failedCodes.push(conflict.pendingItem.itemCode);
      }
    }

    if (successCount > 0) {
      toast.success('Batch Deletion Completed', `Removed ${successCount} duplicate items.`);
    }
    if (failedCodes.length > 0) {
      toast.error('Some Items Not Deleted', `Could not delete ${failedCodes.length} items.`);
    }

    setSelectedConflictIds(new Set());
    setActionInProgress(null);
  };

  // Dismiss a conflict from view
  const handleDismiss = (conflictId: string) => {
    setDismissedIds((prev) => new Set([...prev, conflictId]));
    setSelectedConflictIds((prev) => {
      const next = new Set(prev);
      next.delete(conflictId);
      return next;
    });
    toast.info('Warning Dismissed', 'Hidden for this session.');
  };

  const toggleSelectAll = () => {
    if (selectedConflictIds.size === filteredConflicts.length) {
      setSelectedConflictIds(new Set());
    } else {
      setSelectedConflictIds(new Set(filteredConflicts.map((c) => c.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedConflictIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Role Gate: Super Admin Only
  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto my-20 bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center">
        <div className="w-12 h-12 mx-auto mb-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
          <ShieldAlert size={24} />
        </div>
        <h2 className="text-base font-bold text-slate-900">Restricted Feature</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          The Duplicate Audit tool is currently restricted to <strong>Super Administrators</strong>.
        </p>
        <div className="mt-5">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Return to Assets</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Return to Assets"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Duplicate Import Audit
              </h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                <ShieldCheck size={12} className="text-emerald-700" />
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and remove duplicate Excel import records currently in <strong>"Receive Pending"</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-600' : ''} />
            <span>Re-scan</span>
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
            >
              <ArrowLeft size={13} />
              <span>Back to Assets</span>
            </button>
          )}
        </div>
      </div>

      {/* Clean Stat Strip */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Scanned Pending:</span>
            <strong className="text-slate-900 font-mono text-sm">{pendingItems.length}</strong>
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Duplicates Detected:</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs ${
              activeConflicts.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {activeConflicts.length}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Safe Items:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs bg-emerald-100 text-emerald-800">
              {Math.max(0, pendingItems.length - activeConflicts.length)}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Stores:</span>
            <strong className="text-slate-900 font-mono">{locations.length}</strong>
          </div>
        </div>

        {/* Batch Delete Trigger if any selected */}
        {selectedConflictIds.size > 0 && (
          <button
            type="button"
            onClick={() => void handleDeleteSelected()}
            disabled={actionInProgress === 'BATCH'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors shadow-xs cursor-pointer"
          >
            <Trash2 size={13} />
            <span>
              {actionInProgress === 'BATCH' ? 'Deleting…' : `Delete Selected (${selectedConflictIds.size})`}
            </span>
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, voucher, serial, or code…"
              className="w-full h-8.5 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:border-emerald-600 focus:outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Store Location Filter */}
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:border-emerald-600 focus:outline-none"
          >
            <option value="ALL">All Stores ({locations.length})</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.storeName || loc.name || 'Store'}
              </option>
            ))}
          </select>

          {/* Match Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:border-emerald-600 focus:outline-none"
          >
            <option value="ALL">All Conflict Types</option>
            <option value="SERIAL">Serial Number Matches</option>
            <option value="VOUCHER">Model 19 Collisions</option>
            <option value="STORE_ITEM">Store & Description Matches</option>
            <option value="DISPOSED">Disposed Asset Matches</option>
            <option value="INTRA_PENDING">Repeated Rows in Excel</option>
          </select>
        </div>

        {/* Select All Toggle */}
        {filteredConflicts.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="h-8.5 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
          >
            {selectedConflictIds.size === filteredConflicts.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Main Conflict Cards List */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <RefreshCw size={24} className="mx-auto text-emerald-600 animate-spin" />
          <p className="mt-3 text-xs font-semibold text-slate-700">Scanning Database for Duplicates…</p>
        </div>
      ) : filteredConflicts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={26} />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {allConflicts.length === 0 ? 'No Duplicates Detected' : 'No Conflicts Match Active Filters'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {allConflicts.length === 0
              ? 'All imported items in Receive Pending are unique and ready to be processed.'
              : 'Try clearing your search query or filters to see all flagged conflicts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredConflicts.map((c) => {
            const isSelected = selectedConflictIds.has(c.id);
            const isDeleting = actionInProgress === c.id;

            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-white transition-all overflow-hidden ${
                  isSelected ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200 shadow-2xs hover:border-slate-300'
                }`}
              >
                {/* Clean Top Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(c.id)}
                      className="h-4 w-4 rounded accent-rose-600 cursor-pointer shrink-0"
                      title="Select for bulk action"
                    />
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                      c.severity === 'HIGH' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      <AlertTriangle size={12} />
                      {c.headline}
                    </span>
                    <span className="text-slate-600 truncate text-[11px]">
                      {c.reason}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleDismiss(c.id)}
                      className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmConflict(c)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <Trash2 size={12} />
                      <span>{isDeleting ? 'Deleting…' : 'Delete Duplicate'}</span>
                    </button>
                  </div>
                </div>

                {/* Matched Attributes Pills (Subtle single row) */}
                {c.matchedAttributes.length > 0 && (
                  <div className="px-4 py-1.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400 font-medium">Overlapping:</span>
                    {c.matchedAttributes.map((attr) => (
                      <span
                        key={attr.key}
                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-medium"
                      >
                        <span className="text-slate-500">{attr.label}:</span>
                        <strong className="font-mono text-slate-900">{attr.value}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {/* Side-by-Side Comparison (Clean, airy layout) */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Left Column: Pending Record to Delete */}
                  <div className="rounded-lg border border-rose-200/80 bg-rose-50/20 p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">
                          Incoming (Receive Pending)
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-500">
                          {c.pendingItem.itemCode}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {c.pendingItem.name}
                      </h4>

                      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400">Model 19:</span>{' '}
                          <strong className="text-slate-800">#{c.pendingItem.ifmisSlipNumber || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Store:</span>{' '}
                          <strong className="text-slate-800">{storeMap.get(c.pendingItem.storeLocationId) || 'Unassigned'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Unit Cost:</span>{' '}
                          <strong className="text-slate-800">{formatETB(c.pendingItem.unitCostETB)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Serial:</span>{' '}
                          <strong className="font-mono text-slate-900 bg-white px-1 py-0.5 rounded border border-slate-200">
                            {c.pendingItem.serialNumber || '—'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Preserved Existing System Record */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          c.existingItem.status === ItemStatus.DISPOSED ? 'text-amber-700' : 'text-emerald-800'
                        }`}>
                          {c.existingItem.status === ItemStatus.DISPOSED
                            ? 'Historical (Disposed Asset)'
                            : 'Existing Asset in Store (Preserved)'}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {c.existingItem.itemCode}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {c.existingItem.name}
                      </h4>

                      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400">Registered On:</span>{' '}
                          <strong className="text-slate-800">#{c.existingItem.ifmisSlipNumber || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Store:</span>{' '}
                          <strong className="text-slate-800">{storeMap.get(c.existingItem.storeLocationId) || 'Store'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Unit Cost:</span>{' '}
                          <strong className="text-slate-800">{formatETB(c.existingItem.unitCostETB)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Serial:</span>{' '}
                          <strong className="font-mono text-slate-900 bg-white px-1 py-0.5 rounded border border-slate-200">
                            {c.existingItem.serialNumber || '—'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Deletion */}
      {confirmConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Trash2 size={16} className="text-rose-600" />
                <span>Delete Duplicate Line</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmConflict(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <p className="leading-relaxed">
                Remove incoming line{' '}
                <strong>"{confirmConflict.pendingItem.name}"</strong> (
                <span className="font-mono font-bold text-slate-900">{confirmConflict.pendingItem.itemCode}</span>) from{' '}
                <strong>Receive Pending</strong>?
              </p>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-[11px]">
                <div>
                  <span className="text-slate-400">Reason:</span>{' '}
                  <span className="font-medium text-slate-800">{confirmConflict.reason}</span>
                </div>
                <div>
                  <span className="text-slate-400">Preserved Store Record:</span>{' '}
                  <strong className="font-mono text-emerald-800">{confirmConflict.existingItem.itemCode}</strong>{' '}
                  ({storeMap.get(confirmConflict.existingItem.storeLocationId) || 'Store'})
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                The existing registered store asset will remain safe and untouched.
              </p>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmConflict(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDelete(confirmConflict)}
                disabled={actionInProgress === confirmConflict.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-700 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Trash2 size={13} />
                <span>{actionInProgress === confirmConflict.id ? 'Deleting…' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
