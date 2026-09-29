import React, { useState, useEffect, useCallback } from 'react';
import {
  PackagePlus,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Eye,
  Clock,
  XCircle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/ui/Modal';
import { AssetCategory, ItemStatus, ItemCondition, ItemWithRelations, Location, Employee, UserRole } from '../types/asset-management';
import { formatETB } from '../utils/eth-date';
import { getSystemSettings } from '../utils/system-settings';
import { ConditionBadge } from '../components/ui/Badge';

interface StockInPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  mode?: 'stock-in' | 'return';
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  [ItemStatus.PENDING_STOCK_IN]: {
    label: 'Pending Approval',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  [ItemStatus.AVAILABLE]: {
    label: 'Available (In Store)',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [ItemStatus.PENDING_STOCK_OUT]: {
    label: 'Pending Stock-Out',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  [ItemStatus.ISSUED]: {
    label: 'Issued (In-Use)',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  [ItemStatus.IN_REPAIR]: {
    label: 'In-Repair / Maintenance',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
};

const StatusBadge: React.FC<{ status: ItemStatus }> = ({ status }) => {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.className}`}>
      {style.label}
    </span>
  );
};

// ─── Stock-In Form (inside modal) ───────────────────────────────────────────

interface StockInFormProps {
  locations: Location[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: any) => void;
}

const StockInForm: React.FC<StockInFormProps> = ({ locations, employees, onCancel, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>(AssetCategory.IT_EQUIPMENT);
  const [serialNumber, setSerialNumber] = useState('');
  const [unitCostETB, setUnitCostETB] = useState<number>(0);
  const [condition, setCondition] = useState<ItemCondition>(ItemCondition.NEW);
  const [storeLocationId, setStoreLocationId] = useState(locations[0]?.id ?? '');
  const [ifmisSlipNumber, setIfmisSlipNumber] = useState('');
  const [ifmisSlipDateGc, setIfmisSlipDateGc] = useState(new Date().toISOString().split('T')[0]);
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const policy = getSystemSettings().historicalDataAttachmentPolicy;
  const isAttachmentRequired = policy === 'REQUIRED';

  const handleReset = () => {
    setName('');
    setCategory(AssetCategory.IT_EQUIPMENT);
    setSerialNumber('');
    setUnitCostETB(0);
    setCondition(ItemCondition.NEW);
    setStoreLocationId(locations[0]?.id ?? '');
    setIfmisSlipNumber('');
    setIfmisSlipDateGc(new Date().toISOString().split('T')[0]);
    setAttachmentFileName('');
    setNotes('');
    setFormError(null);
  };

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachmentFileName(e.target.files[0].name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Please provide the asset name and description.');
      return;
    }
    if (!ifmisSlipNumber.trim()) {
      setFormError('IFMIS Slip / Voucher Number is mandatory.');
      return;
    }

    if (isAttachmentRequired && !attachmentFileName) {
      setFormError('System Policy configured in Settings requires a scanned IFMIS slip attachment.');
      return;
    }

    setSubmitting(true);
    const encoder = employees.find((emp) => emp.role === UserRole.DATA_ENCODER) || employees[0];

    try {
      const res = await api.registerStockIn({
        name,
        category,
        serialNumber,
        unitCostETB,
        condition,
        storeLocationId,
        ifmisSlipNumber: ifmisSlipNumber.trim(),
        ifmisSlipDateGc,
        ifmisSlipAttachmentUrl: attachmentFileName ? `/slips/${attachmentFileName}` : undefined,
        isHistoricalData: policy === 'OPTIONAL',
        registeredById: encoder.id,
        notes,
      });
      onSuccess(res);
    } catch (err: any) {
      setFormError(`Stock-In failed: ${err.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500';

  return (
    <form id="stock-in-form" onSubmit={handleSubmit} className="space-y-4">
      {/* Inline Form Error Alert */}
      {formError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Workflow Banner */}
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2">
        <FileText className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-900 leading-relaxed">
          <strong>Approval Rule:</strong> Registered items stay{' '}
          <span className="text-amber-800 bg-amber-100 px-1 rounded font-bold font-mono">PENDING</span> until the
          Department Head reviews and approves.
        </p>
      </div>

      {/* Section 1 — IFMIS Slip */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            1. IFMIS Receiving Reference — የዕቃ መረከቢያ (ሞዴል 19)
          </h3>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
            isAttachmentRequired
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
          }`}>
            Attachment Policy: {isAttachmentRequired ? 'Mandatory File Upload' : 'Optional File Upload'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              IFMIS / Model 19 Slip No. *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. M19-IFMIS-GRN-2024-0994"
              value={ifmisSlipNumber}
              onChange={(e) => setIfmisSlipNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Slip Date (G.C.) *</label>
            <input
              type="date"
              required
              value={ifmisSlipDateGc}
              onChange={(e) => setIfmisSlipDateGc(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Receiving Store Location *</label>
            <select
              value={storeLocationId}
              onChange={(e) => setStoreLocationId(e.target.value)}
              className={inputClass}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.roomNumber} — {loc.siteName}
                </option>
              ))}
            </select>
          </div>
          {/* Attachment */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Attach Scanned Slip {isAttachmentRequired ? '*' : <span className="text-slate-400 font-normal">(Optional per System Settings)</span>}
            </label>
            <div className={`flex items-center gap-2 p-2.5 rounded-xl border border-dashed bg-white ${
              isAttachmentRequired && !attachmentFileName
                ? 'border-amber-400'
                : 'border-slate-300'
            }`}>
              <Upload className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-xs text-slate-600 flex-1 truncate">
                {attachmentFileName || (
                  <span className={isAttachmentRequired ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                    {isAttachmentRequired ? 'Required — upload scanned slip' : 'No file chosen (Optional)'}
                  </span>
                )}
              </span>
              <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold cursor-pointer transition">
                Browse
                <input type="file" onChange={handleSimulateUpload} className="hidden" accept="image/*,application/pdf" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 — Asset Particulars */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">2. Asset / Item Specifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Item Name & Full Specification *</label>
            <input
              type="text"
              required
              placeholder="e.g. Massey Ferguson MF-385 4WD Tractor 85HP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className={inputClass}
            >
              {Object.values(AssetCategory).map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Serial Number</label>
            <input
              type="text"
              placeholder="e.g. SN-MF-89210"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Condition *</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as ItemCondition)}
              className={inputClass}
            >
              <option value={ItemCondition.NEW}>Brand New</option>
              <option value={ItemCondition.GOOD}>Good / Functional</option>
              <option value={ItemCondition.FAIR}>Fair / Minor Wear</option>
              <option value={ItemCondition.NEEDS_REPAIR}>Needs Technical Repair</option>
              <option value={ItemCondition.DAMAGED}>Damaged / Defective</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Cost (ETB) *</label>
            <input
              type="number"
              min="0"
              step="any"
              required
              placeholder="0.00"
              value={unitCostETB || ''}
              onChange={(e) => setUnitCostETB(parseFloat(e.target.value) || 0)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Donor Project</label>
            <input
              type="text"
              placeholder="e.g. World Bank FSRP"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          Reset Form
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Register Item & Submit for Approval
          </button>
        </div>
      </div>
    </form>
  );
};

// ─── Items Table ─────────────────────────────────────────────────────────────

type SortField = 'itemCode' | 'name' | 'category' | 'ifmisSlipNumber' | 'unitCostETB' | 'status';

interface ItemsTableProps {
  items: ItemWithRelations[];
  onRefresh: () => void;
  refreshing: boolean;
  onNavigate: (tab: string) => void;
}

const ItemsTable: React.FC<ItemsTableProps> = ({ items, onRefresh, refreshing, onNavigate }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('itemCode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-700 font-bold shrink-0" />
    );
  };

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.itemCode.toLowerCase().includes(search.toLowerCase()) ||
      (item.ifmisSlipNumber ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    let valA: any = a[sortField] ?? '';
    let valB: any = b[sortField] ?? '';

    if (sortField === 'unitCostETB') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, code or IFMIS slip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs">
          {search ? 'No items match your search.' : 'No items registered yet. Click "Register New Item" to begin.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th
                  onClick={() => handleSort('itemCode')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item Code</span>
                    {renderSortIcon('itemCode')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Name</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('category')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hidden md:table-cell hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ifmisSlipNumber')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hidden lg:table-cell hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ሞዴል 19 / IFMIS Slip</span>
                    {renderSortIcon('ifmisSlipNumber')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('unitCostETB')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hidden lg:table-cell hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Unit Cost</span>
                    {renderSortIcon('unitCostETB')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">{item.itemCode}</td>
                  <td className="px-3 py-2.5 text-slate-900 font-medium max-w-[180px] truncate">{item.name}</td>
                  <td className="px-3 py-2.5 text-slate-600 hidden md:table-cell">
                    {item.category.replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-700 hidden lg:table-cell">{item.ifmisSlipNumber || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-700 hidden lg:table-cell">
                    {formatETB(item.unitCostETB)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval nudge */}
      {items.some((i) => i.status === ItemStatus.PENDING_STOCK_IN) && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Some items are pending Department Head approval. Go to{' '}
            <button
              onClick={() => onNavigate('approvals')}
              className="font-bold underline cursor-pointer hover:no-underline"
            >
              Approvals Queue
            </button>{' '}
            to track status.
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const StockInPage: React.FC<StockInPageProps> = ({ currentRole, onNavigate, mode = 'stock-in' }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<any | null>(null);

  const getHeaderConfig = () => {
    if (mode === 'return') {
      return {
        badge: 'Store Return Workflow • የዕቃ መመለሻ መረከቢያ (ሞዴል 22)',
        title: 'Return to Store Registration (የዕቃ መመለሻ መረከቢያ - ሞዴል 22)',
        subtitle: 'Receive returned assets back into central store inventory following official IFMIS Model 22 Return Slips.',
        buttonLabel: '+ Record Return (Model 22)',
      };
    }
    return {
      badge: 'Inbound Store Receipt • የዕቃ መረከቢያ (ሞዴል 19)',
      title: 'Stock-In — የዕቃ መረከቢያ (ሞዴል 19)',
      subtitle: 'Register incoming goods into store using IFMIS Model 19 receiving vouchers.',
      buttonLabel: 'Register New Item',
    };
  };

  const headerConfig = getHeaderConfig();

  const initData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [locs, emps, allItems] = await Promise.all([
        api.getLocations(),
        api.getEmployees(),
        api.getItems(),
      ]);
      setLocations(locs);
      setEmployees(emps);
      setItems(allItems);
    } catch (err: any) {
      console.error('Failed to load stock-in data:', err);
      setError(err.message || 'Failed to load store parameters and inventory items.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    initData();
  }, [initData]);

  const handleSuccess = (result: any) => {
    setLastRegistered(result);
    setIsModalOpen(false);
    initData(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
        Loading store parameters...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Data Connection Error</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button
          onClick={() => initData()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
              {headerConfig.badge}
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              IFMIS Slip → Data Encoder → Dept Head Approval
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-700" />
            {headerConfig.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {headerConfig.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            {headerConfig.buttonLabel}
          </button>
        </div>
      </div>

      {/* ── Last Registration Banner ── */}
      {lastRegistered && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-emerald-900">Stock-In Successfully Registered!</p>
            <p className="text-slate-700 mt-0.5">
              <span className="font-mono font-bold text-emerald-800">{lastRegistered.item?.itemCode}</span>{' '}
              — {lastRegistered.item?.name} is now pending Department Head approval.
            </p>
          </div>
          <button
            onClick={() => setLastRegistered(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Items Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            Registered Items ({items.length})
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.PENDING_STOCK_IN).length} Pending
            </span>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.AVAILABLE).length} Available
            </span>
            <span className="bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.ISSUED).length} In-Use
            </span>
            <span className="bg-purple-100 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
              {items.filter((i) => i.status === ItemStatus.IN_REPAIR).length} In Repair
            </span>
          </div>
        </div>
        <ItemsTable items={items} onRefresh={() => initData(true)} refreshing={refreshing} onNavigate={onNavigate} />
      </div>

      {/* ── Stock-In Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Stock-In"
        subtitle="Record goods received from IFMIS inbound delivery slip"
        accentColor="emerald"
        size="xl"
      >
        {locations.length > 0 && employees.length > 0 ? (
          <StockInForm
            locations={locations}
            employees={employees}
            onCancel={() => setIsModalOpen(false)}
            onSuccess={handleSuccess}
          />
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            Failed to load reference data. Please reload the page.
          </div>
        )}
      </Modal>
    </div>
  );
};
