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
  Building2,
  Package,
  Layers,
  Sparkles,
  ExternalLink,
  Check,
  X,
  FileSpreadsheet,
  HelpCircle,
  ShieldCheck,
  ArrowRight,
  Info,
} from 'lucide-react';

export interface MatchedAttribute {
  key: string;
  label: string;
  pendingValue: string;
  existingValue: string;
  note?: string;
}

export interface DuplicateConflict {
  id: string;
  pendingItem: ItemWithRelations;
  existingItem: ItemWithRelations;
  matchType: 'SERIAL' | 'VOUCHER' | 'STORE_ITEM' | 'DISPOSED' | 'INTRA_PENDING';
  headline: string;
  reason: string;
  matchedAttributes: MatchedAttribute[];
  suggestedAction: {
    recommendedItemToDeleteId: string;
    explanation: string;
  };
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

    // Helper to extract overlapping attributes between two records
    const buildMatchedAttributes = (
      p: ItemWithRelations,
      e: ItemWithRelations,
      primaryType: string
    ): MatchedAttribute[] => {
      const attrs: MatchedAttribute[] = [];

      // 1. Serial Number
      if (isValidSerial(p.serialNumber) && isValidSerial(e.serialNumber) && p.serialNumber?.trim().toLowerCase() === e.serialNumber?.trim().toLowerCase()) {
        attrs.push({
          key: 'serial',
          label: 'Serial Number',
          pendingValue: p.serialNumber.trim(),
          existingValue: e.serialNumber.trim(),
          note: 'Exact match',
        });
      }

      // 2. Model 19 Voucher
      const pSlip = String(p.ifmisSlipNumber || '').trim();
      const eSlip = String(e.ifmisSlipNumber || '').trim();
      if (pSlip && eSlip && pSlip.toLowerCase() === eSlip.toLowerCase()) {
        attrs.push({
          key: 'voucher',
          label: 'Model 19 Voucher #',
          pendingValue: `#${pSlip}`,
          existingValue: `#${eSlip}`,
          note: 'Identical voucher number',
        });
      }

      // 3. Item Description / Name
      const pNorm = normalizeDesc(p.name);
      const eNorm = normalizeDesc(e.name);
      if (pNorm && eNorm && pNorm === eNorm) {
        attrs.push({
          key: 'name',
          label: 'Item Description',
          pendingValue: p.name,
          existingValue: e.name,
          note: 'Normalized match',
        });
      }

      // 4. Store Location
      if (p.storeLocationId && e.storeLocationId && p.storeLocationId === e.storeLocationId) {
        const storeLabel = storeMap.get(p.storeLocationId) || 'Store';
        attrs.push({
          key: 'store',
          label: 'Store Location',
          pendingValue: storeLabel,
          existingValue: storeLabel,
          note: 'Same store location',
        });
      }

      // 5. Unit Cost (if identical)
      if (p.unitCostETB !== undefined && e.unitCostETB !== undefined && Math.abs(p.unitCostETB - e.unitCostETB) < 0.01) {
        attrs.push({
          key: 'cost',
          label: 'Unit Cost',
          pendingValue: formatETB(p.unitCostETB),
          existingValue: formatETB(e.unitCostETB),
          note: 'Same unit cost',
        });
      }

      // 6. IFMIS Code / Tag
      const pCode = String(p.itemCode || p.ifmisTagNumber || '').trim().toLowerCase();
      const eCode = String(e.itemCode || e.ifmisTagNumber || '').trim().toLowerCase();
      if (pCode && eCode && pCode === eCode) {
        attrs.push({
          key: 'ifmis',
          label: 'IFMIS Code / Tag',
          pendingValue: p.itemCode || p.ifmisTagNumber || '',
          existingValue: e.itemCode || e.ifmisTagNumber || '',
          note: 'Matching item/tag code',
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
          const matchedAttrs = buildMatchedAttributes(pending, existing, 'SERIAL');
          list.push({
            id: `serial-${pending.id}-${existing.id}`,
            pendingItem: pending,
            existingItem: existing,
            matchType: 'SERIAL',
            headline: `Exact Serial Number Collision ("${pending.serialNumber}")`,
            reason: `Incoming pending item "${pending.name}" has the identical serial number as registered asset "${existing.itemCode}" in ${storeMap.get(existing.storeLocationId) || 'store'}.`,
            matchedAttributes: matchedAttrs,
            suggestedAction: {
              recommendedItemToDeleteId: pending.id,
              explanation: `Delete this incoming pending row (${pending.itemCode}) to prevent duplicate serial registration. The existing registered asset (${existing.itemCode}) will remain intact.`,
            },
            severity: 'HIGH',
          });
          continue; // best match found for this pending item
        }

        // Condition 2: Model 19 Voucher collision (same voucher number already registered in store)
        const existVoucher = String(existing.ifmisSlipNumber || '').trim().toLowerCase();
        if (isRealVoucher && existVoucher && pendingVoucher === existVoucher) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName === existNormName || (pendingIfmis && pendingIfmis === String(existing.itemCode || '').toLowerCase())) {
            const matchedAttrs = buildMatchedAttributes(pending, existing, 'VOUCHER');
            list.push({
              id: `voucher-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'VOUCHER',
              headline: `Model 19 Voucher #${pending.ifmisSlipNumber} Already Registered`,
              reason: `Voucher #${pending.ifmisSlipNumber} was already received and registered into inventory under ${existing.itemCode}.`,
              matchedAttributes: matchedAttrs,
              suggestedAction: {
                recommendedItemToDeleteId: pending.id,
                explanation: `Delete this pending line (${pending.itemCode}) because Voucher #${pending.ifmisSlipNumber} has already been registered in the system.`,
              },
              severity: 'HIGH',
            });
            continue;
          }
        }

        // Condition 3: Disposed Asset Match
        if (existing.status === ItemStatus.DISPOSED) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName.length >= 3 && pendingNormName === existNormName) {
            const matchedAttrs = buildMatchedAttributes(pending, existing, 'DISPOSED');
            list.push({
              id: `disposed-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'DISPOSED',
              headline: `Collision with Previously DISPOSED Asset (${existing.itemCode})`,
              reason: `Item description matches an asset previously disposed/written off. Verify whether this is a re-acquisition or a redundant record.`,
              matchedAttributes: matchedAttrs,
              suggestedAction: {
                recommendedItemToDeleteId: pending.id,
                explanation: `If this is an accidental re-import of an old disposed record, delete this pending item. If it is genuinely a new asset, dismiss this warning.`,
              },
              severity: 'HIGH',
            });
            continue;
          }
        }

        // Condition 4: Same Item Description in the Same Store
        if (pending.storeLocationId && existing.storeLocationId && pending.storeLocationId === existing.storeLocationId) {
          const existNormName = normalizeDesc(existing.name);
          if (pendingNormName.length >= 3 && pendingNormName === existNormName) {
            const matchedAttrs = buildMatchedAttributes(pending, existing, 'STORE_ITEM');
            list.push({
              id: `store-${pending.id}-${existing.id}`,
              pendingItem: pending,
              existingItem: existing,
              matchType: 'STORE_ITEM',
              headline: `Identical Description & Store Collision (${storeMap.get(pending.storeLocationId) || 'Store'})`,
              reason: `An asset with the identical description is already recorded in ${storeMap.get(pending.storeLocationId) || 'this store'} under ${existing.itemCode}.`,
              matchedAttributes: matchedAttrs,
              suggestedAction: {
                recommendedItemToDeleteId: pending.id,
                explanation: `Remove this pending line if it was accidentally imported a second time. The existing store record remains safe.`,
              },
              severity: 'MEDIUM',
            });
            break; // found match in same store
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
          const matchedAttrs = buildMatchedAttributes(p2, p1, 'INTRA_PENDING');
          list.push({
            id: `pending-dup-serial-${p1.id}-${p2.id}`,
            pendingItem: p2,
            existingItem: p1,
            matchType: 'INTRA_PENDING',
            headline: `Repeated Serial "${p1.serialNumber}" Inside Excel Import Batch`,
            reason: `The newly imported batch contains multiple pending rows with the same serial number.`,
            matchedAttributes: matchedAttrs,
            suggestedAction: {
              recommendedItemToDeleteId: p2.id,
              explanation: `Delete the duplicate pending row (${p2.itemCode}) and keep the first pending row (${p1.itemCode}).`,
            },
            severity: 'HIGH',
          });
        } else if (p1Voucher && p2Voucher && p1Voucher === p2Voucher && p1NormName && p1NormName === p2NormName) {
          const matchedAttrs = buildMatchedAttributes(p2, p1, 'INTRA_PENDING');
          list.push({
            id: `pending-dup-voucher-${p1.id}-${p2.id}`,
            pendingItem: p2,
            existingItem: p1,
            matchType: 'INTRA_PENDING',
            headline: `Repeated Line in Same Imported Voucher #${p1.ifmisSlipNumber}`,
            reason: `Voucher #${p1.ifmisSlipNumber} contains multiple identical item entries in the imported batch.`,
            matchedAttributes: matchedAttrs,
            suggestedAction: {
              recommendedItemToDeleteId: p2.id,
              explanation: `Delete the duplicate pending row (${p2.itemCode}) to prevent double-counting.`,
            },
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
      // Store filter
      if (storeFilter !== 'ALL') {
        const matchesPending = c.pendingItem.storeLocationId === storeFilter;
        const matchesExisting = c.existingItem.storeLocationId === storeFilter;
        if (!matchesPending && !matchesExisting) return false;
      }

      // Type filter
      if (typeFilter !== 'ALL' && c.matchType !== typeFilter) {
        return false;
      }

      // Search query
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
        `Pending item ${item.itemCode} was deleted from Receive Pending. Store record ${conflict.existingItem.itemCode} was preserved.`
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id && i.parentItemId !== item.id));
      setSelectedConflictIds((prev) => {
        const next = new Set(prev);
        next.delete(conflict.id);
        return next;
      });
      setConfirmConflict(null);
    } catch (err: any) {
      toast.error('Deletion Failed', err?.message || 'Could not delete item. Super Admin role required.');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle batch deletion of all selected duplicates
  const handleDeleteSelected = async () => {
    const toDelete = filteredConflicts.filter((c) => selectedConflictIds.has(c.id));
    if (toDelete.length === 0) return;

    const confirmMsg = `Are you sure you want to delete ${toDelete.length} selected duplicate line item(s) from Receive Pending?\n\nExisting inventory records in store will NOT be affected.`;
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
      toast.success('Batch Deletion Completed', `Successfully deleted ${successCount} duplicate item(s) from Receive Pending.`);
    }
    if (failedCodes.length > 0) {
      toast.error('Some Items Not Deleted', `Could not delete ${failedCodes.length} items (${failedCodes.slice(0, 3).join(', ')}).`);
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
    toast.info('Conflict Dismissed', 'Warning hidden for this session.');
  };

  // Select all / deselect all
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
      <div className="max-w-xl mx-auto my-16 bg-white rounded-2xl border border-rose-200 p-8 shadow-xs text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Restricted Diagnostic Feature</h2>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          The <strong>Import Duplicate Audit Screen</strong> is currently available to <strong>Super Administrators</strong> only to safely detect and resolve duplicate Excel import records.
        </p>
        <div className="mt-6">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-xs"
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
    <div className="space-y-4 pb-12">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Return to Assets"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                Import Duplicate Audit
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300">
                <ShieldCheck size={11} className="text-emerald-700" />
                Super Admin Diagnostic
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cross-referencing newly imported items in <strong>"Receive Pending"</strong> status against registered store inventory.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-600' : ''} />
            <span>Re-scan Database</span>
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors cursor-pointer shadow-xs"
            >
              <ArrowLeft size={14} />
              <span>Back to Assets</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Pending Items Scanned
          </span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-slate-900 block tabular-nums">
            {pendingItems.length}
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Waiting for reception</span>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-800 block">
            Duplicates Detected
          </span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-rose-700 block tabular-nums">
            {activeConflicts.length}
          </span>
          <span className="text-[11px] text-rose-700/80 mt-0.5 block">Matching registered records</span>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 block">
            Unique / Safe Items
          </span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-emerald-700 block tabular-nums">
            {Math.max(0, pendingItems.length - activeConflicts.length)}
          </span>
          <span className="text-[11px] text-emerald-700/80 mt-0.5 block">Clear to receive</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Stores Evaluated
          </span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-slate-900 block tabular-nums">
            {locations.length}
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Active store locations</span>
        </div>
      </div>

      {/* Filter and Bulk Action Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Bar */}
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, voucher, code, serial…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Store Location Filter */}
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:border-emerald-600 focus:outline-none"
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
            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:border-emerald-600 focus:outline-none"
          >
            <option value="ALL">All Conflict Types</option>
            <option value="SERIAL">Exact Serial Matches</option>
            <option value="VOUCHER">Model 19 Voucher Collisions</option>
            <option value="STORE_ITEM">Store & Description Matches</option>
            <option value="DISPOSED">Matches Disposed Asset</option>
            <option value="INTRA_PENDING">Repeated Rows in Excel</option>
          </select>
        </div>

        {/* Bulk Action Controls */}
        {filteredConflicts.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {selectedConflictIds.size === filteredConflicts.length ? 'Deselect All' : 'Select All'}
            </button>

            {selectedConflictIds.size > 0 && (
              <button
                type="button"
                onClick={() => void handleDeleteSelected()}
                disabled={actionInProgress === 'BATCH'}
                className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Trash2 size={14} />
                <span>
                  {actionInProgress === 'BATCH' ? 'Deleting…' : `Delete Selected Duplicates (${selectedConflictIds.size})`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Conflict Cards List */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <RefreshCw size={28} className="mx-auto text-emerald-600 animate-spin" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Scanning Database for Duplicates…</p>
          <p className="mt-1 text-xs text-slate-500">Cross-checking all items in Receive Pending against active inventory.</p>
        </div>
      ) : filteredConflicts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">
            {allConflicts.length === 0 ? 'No Duplicates Detected' : 'No Matching Conflicts with Current Filters'}
          </h3>
          <p className="mt-1 max-w-md mx-auto text-xs text-slate-600 leading-relaxed">
            {allConflicts.length === 0
              ? 'All imported items currently in "Receive Pending" status are distinct from existing store inventory.'
              : 'Try clearing your search query or filters to see all flagged conflicts.'}
          </p>
          {onNavigate && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => onNavigate('assets')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Return to Assets</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-600 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>Showing {filteredConflicts.length} potential duplicate conflict(s):</span>
            <span className="text-slate-500 font-normal">
              Click <strong>"Agree & Delete from Pending"</strong> on any card to remove only the imported pending record.
            </span>
          </div>

          {filteredConflicts.map((c) => {
            const isSelected = selectedConflictIds.has(c.id);
            const isDeleting = actionInProgress === c.id;

            return (
              <div
                key={c.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isSelected ? 'border-rose-400 bg-rose-50/20 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Header Strip with Reason & Severity */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50/90 border-b border-slate-200 text-xs">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(c.id)}
                      className="h-4 w-4 rounded accent-rose-600 cursor-pointer"
                      title="Select for bulk deletion"
                    />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${
                        c.severity === 'HIGH'
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      <AlertTriangle size={13} className={c.severity === 'HIGH' ? 'text-rose-700' : 'text-amber-700'} />
                      <span>{c.headline}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDismiss(c.id)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2.5 py-1 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer"
                      title="Dismiss warning for this session"
                    >
                      Dismiss Warning
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmConflict(c)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <Trash2 size={13} />
                      <span>{isDeleting ? 'Deleting…' : 'Agree & Delete from Pending'}</span>
                    </button>
                  </div>
                </div>

                {/* Conflict Explanation & Matched Attributes Pills */}
                <div className="px-4 py-3 bg-amber-50/30 border-b border-amber-100 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-slate-700">
                    <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Why this was detected:</strong> {c.reason}
                    </p>
                  </div>

                  {/* Overlapping Attributes Badges */}
                  {c.matchedAttributes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                        Duplicated Attributes:
                      </span>
                      {c.matchedAttributes.map((attr) => (
                        <span
                          key={attr.key}
                          className="inline-flex items-center gap-1 rounded-md bg-white border border-amber-200 px-2 py-0.5 text-[11px] text-slate-800 shadow-2xs"
                        >
                          <span className="font-semibold text-slate-600">{attr.label}:</span>
                          <span className="font-mono font-bold text-rose-700">{attr.pendingValue}</span>
                          {attr.note && <span className="text-[10px] text-slate-400 italic">({attr.note})</span>}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Suggested Action Bar */}
                  <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/80 px-3 py-2 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-emerald-800">💡 Suggested Action:</span>
                      <span className="text-emerald-900">{c.suggestedAction.explanation}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmConflict(c)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-800 underline underline-offset-2 shrink-0 cursor-pointer"
                    >
                      Delete Incoming Line
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>

                {/* Side-by-Side Comparison Grid */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Newly Imported Pending Item (Proposed for Removal) */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/20 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-900 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        ⚠️ Pending Import (Suggested to Delete)
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600">
                        {c.pendingItem.itemCode}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        {c.pendingItem.name}
                      </h4>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400">Model 19 Voucher:</span>{' '}
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
                          <span className="text-slate-400">Quantity:</span>{' '}
                          <strong className="text-slate-800">{c.pendingItem.quantity ?? 1}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-rose-100 text-xs text-slate-600 flex items-center justify-between">
                      <span>
                        Serial:{' '}
                        <strong className={c.matchType === 'SERIAL' ? 'text-rose-700 font-mono bg-rose-100 px-1 py-0.5 rounded' : 'font-mono'}>
                          {c.pendingItem.serialNumber || '—'}
                        </strong>
                      </span>
                      <span>
                        IFMIS Tag: <span className="font-mono text-slate-700">{c.pendingItem.ifmisTagNumber || c.pendingItem.itemCode || '—'}</span>
                      </span>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmConflict(c)}
                        disabled={isDeleting}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        <Trash2 size={13} />
                        <span>Confirm & Delete from Receive Pending</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Existing Registered Item (Kept Safe) */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          c.existingItem.status === ItemStatus.DISPOSED
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : c.existingItem.status === ItemStatus.AVAILABLE
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : 'bg-blue-100 text-blue-900 border border-blue-200'
                        }`}
                      >
                        <Check size={11} className="text-emerald-700" />
                        {c.existingItem.status === ItemStatus.AVAILABLE
                          ? '✅ Registered Asset in Store (Kept Safe)'
                          : c.existingItem.status === ItemStatus.DISPOSED
                          ? '⚠️ Historical Disposed Asset'
                          : `✅ ${c.existingItem.status} (Kept Safe)`}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {c.existingItem.itemCode}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        {c.existingItem.name}
                      </h4>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
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
                          <span className="text-slate-400">Status:</span>{' '}
                          <strong className="text-slate-800">{c.existingItem.status}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-100 text-xs text-slate-600 flex items-center justify-between">
                      <span>
                        Serial:{' '}
                        <strong className={c.matchType === 'SERIAL' ? 'text-rose-700 font-mono bg-rose-100 px-1 py-0.5 rounded' : 'font-mono'}>
                          {c.existingItem.serialNumber || '—'}
                        </strong>
                      </span>
                      <span>
                        IFMIS Tag: <span className="font-mono text-slate-700">{c.existingItem.ifmisTagNumber || '—'}</span>
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-center p-2 rounded-lg bg-emerald-100/60 text-emerald-900 text-[11px] font-medium">
                      <span>🛡️ Safe · This record will NOT be deleted or modified.</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Individual Deletion */}
      {confirmConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                <AlertTriangle size={18} className="text-rose-600" />
                <span>Confirm Duplicate Deletion from Receive Pending</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmConflict(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                You are about to remove duplicate imported pending item{' '}
                <strong>"{confirmConflict.pendingItem.name}"</strong> (Item Code:{' '}
                <span className="font-mono font-bold text-slate-900">{confirmConflict.pendingItem.itemCode}</span>) from{' '}
                <strong>Receive Pending</strong>.
              </p>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Audit Summary:
                </div>
                <div>
                  <span className="text-slate-500">Why flagged:</span>{' '}
                  <span className="font-semibold text-slate-900">{confirmConflict.reason}</span>
                </div>
                <div>
                  <span className="text-slate-500">Incoming Record (to be deleted):</span>{' '}
                  <span className="font-semibold text-rose-700 font-mono">{confirmConflict.pendingItem.itemCode}</span>{' '}
                  on Model 19 #{confirmConflict.pendingItem.ifmisSlipNumber || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Existing System Record (preserved):</span>{' '}
                  <span className="font-semibold text-emerald-800 font-mono">{confirmConflict.existingItem.itemCode}</span>{' '}
                  in {storeMap.get(confirmConflict.existingItem.storeLocationId) || 'Store'}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Note: This only deletes this incoming line from the pending import. No registered store inventory or approved vouchers will be modified.
              </p>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmConflict(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDelete(confirmConflict)}
                disabled={actionInProgress === confirmConflict.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-700 text-xs font-semibold text-white hover:bg-rose-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Trash2 size={14} />
                <span>{actionInProgress === confirmConflict.id ? 'Deleting…' : 'Yes, Delete from Pending'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
