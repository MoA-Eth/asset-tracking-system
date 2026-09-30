import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  RotateCcw,
  Search,
  RefreshCw,
  FileCheck2,
  Building2,
  UserCheck,
  Package,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { api } from '../api/client';
import {
  ItemWithRelations,
  ItemStatus,
  UserRole,
  Department,
  Employee,
} from '../types/asset-management';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface TransferAssetPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const TransferAssetPage: React.FC<TransferAssetPageProps> = ({
  currentRole,
  onNavigate,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'transfer' | 'return'>('all');
  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected item for Return to Store Modal
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);

  // Transfer Form State
  const [selectedItemId, setSelectedItemId] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, deptsRes, empsRes] = await Promise.all([
        api.getItems(),
        api.getDepartments(),
        api.getEmployees(),
      ]);
      setItems(itemsRes);
      setDepartments(deptsRes);
      setEmployees(empsRes);
    } catch (err: any) {
      console.error('Failed to load transfer asset data:', err);
      setError(err.message || 'Failed to load assets for transfer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      toast.warning('Asset Required', 'Please select an asset to transfer.');
      return;
    }
    if (!targetEmployeeId) {
      toast.warning('Recipient Required', 'Please select a recipient employee.');
      return;
    }
    setSubmittingTransfer(true);
    setTransferSuccessMsg(null);
    try {
      const selectedItem = items.find((i) => i.id === selectedItemId);
      const targetEmp = employees.find((e) => e.id === targetEmployeeId);

      await api.transferItem({
        itemId: selectedItemId,
        toEmployeeId: targetEmployeeId,
        toDepartmentId: targetDepartmentId || undefined,
        reason: transferReason || 'Official custody reassignment',
        performedById: user?.id || employees[0]?.id || '',
      });

      const msg = `Asset ${selectedItem?.itemCode || selectedItemId} transferred to ${targetEmp?.fullNameEn || 'new custodian'}.`;
      setTransferSuccessMsg(msg);
      toast.success('Custody Handover Completed', msg);
      setSelectedItemId('');
      setTargetEmployeeId('');
      setTargetDepartmentId('');
      setTransferReason('');
      fetchData();
    } catch (err: any) {
      const errMsg = err.message || 'Failed to process transfer.';
      toast.error('Transfer Failed', errMsg);
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.currentCustodian?.fullNameEn || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (activeSubTab === 'transfer' || activeSubTab === 'return') {
      return matchesSearch && item.status === ItemStatus.ISSUED;
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shadow-md">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Transfer Asset
              <span className="text-xs font-normal text-emerald-800 font-amharic">
                (የንብረት ዝውውር እና የዕቃ መመለሻ መረከቢያ - ሞዴል 22)
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Unified custody transfer, regional store relocation, and Model 22 store return vouchers.
            </p>
          </div>
        </div>

        {/* Quick Action Navigation Pills */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Movements & Returns
          </button>
          <button
            onClick={() => setActiveSubTab('transfer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'transfer'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Transfer Custody
          </button>
          <button
            onClick={() => setActiveSubTab('return')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'return'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Return to Store (Model 22)
          </button>
        </div>
      </div>

      {/* Main Content Sections */}
      {activeSubTab === 'transfer' ? (
        /* ── Transfer Custody Form ────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                Initiate Custody Transfer (የንብረት ዝውውር)
              </h2>
              <span className="text-xs text-slate-400 font-mono">Transfer Request</span>
            </div>

            {transferSuccessMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{transferSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Select Active Issued Asset *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                  required
                >
                  <option value="">-- Choose Issued Asset --</option>
                  {items
                    .filter((i) => i.status === ItemStatus.ISSUED)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemCode} - {item.name} (Custodian:{' '}
                        {item.currentCustodian?.fullNameEn || 'Assigned'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    New Target Custodian / Employee
                  </label>
                  <select
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                  >
                    <option value="">-- Select Recipient Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullNameEn} ({emp.payrollId})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Target Directorate / Department
                  </label>
                  <select
                    value={targetDepartmentId}
                    onChange={(e) => setTargetDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                  >
                    <option value="">-- Select Target Directorate --</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.nameEn} ({dep.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reason for Transfer & Remarks
                </label>
                <textarea
                  rows={3}
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Specify official reasons for custody transfer..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('all')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTransfer}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {submittingTransfer ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Submit Transfer Request
                </button>
              </div>
            </form>
          </div>

          <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
            <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              Transfer Guidelines
            </h3>
            <p className="text-xs text-amber-900 leading-relaxed">
              Custody transfers reassign asset liability directly from one employee or department to another without returning the item to central store stock.
            </p>
            <ul className="text-xs text-amber-900/90 space-y-1.5 list-disc list-inside font-medium">
              <li>Requires Directorate Head approval sign-off.</li>
              <li>Updates custodian record upon approval.</li>
              <li>Generates an inter-departmental Transfer Slip.</li>
            </ul>
          </div>
        </div>
      ) : activeSubTab === 'return' ? (
        /* ── Return to Store Table / Selection ────────────────────────────── */
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-teal-700" />
                Model 22 Store Asset Returns (የዕቃ መመለሻ መረከቢያ)
              </h2>
              <p className="text-xs text-slate-500">
                Select an active issued item below to process Model 22 return and clear custodian liability.
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search issued items..."
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-teal-600 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Description</th>
                  <th className="p-3 min-w-[150px]">Current Custodian</th>
                  <th className="p-3 w-32">Location</th>
                  <th className="p-3 w-36 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {items
                  .filter((i) => i.status === ItemStatus.ISSUED)
                  .map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">{item.itemCode}</td>
                      <td className="p-3 text-slate-800">{item.name}</td>
                      <td className="p-3 text-slate-700">
                        {item.currentCustodian?.fullNameEn || 'Assigned Staff'}
                      </td>
                      <td className="p-3 text-slate-600">{item.storeLocation?.siteName || 'Head office'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setReturnItem(item)}
                          className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Return Model 22
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── All Movements & Returns Ledger ────────────────────────────────── */
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Transfer & Return Ledger</h2>
              <p className="text-xs text-slate-500">
                Complete inventory tracking ledger for custody transfers, store returns, and relocations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search ledger..."
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600 w-64"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Name</th>
                  <th className="p-3 w-32 whitespace-nowrap">Current Status</th>
                  <th className="p-3 min-w-[160px]">Custodian / Department</th>
                  <th className="p-3 w-32">Store Location</th>
                  <th className="p-3 w-32 text-right whitespace-nowrap">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">{item.itemCode}</td>
                    <td className="p-3 text-slate-800">{item.name}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          item.status === ItemStatus.AVAILABLE
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : item.status === ItemStatus.ISSUED
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">
                      {item.currentCustodian?.fullNameEn || item.assignedDepartment?.nameEn || 'Store Stock'}
                    </td>
                    <td className="p-3 text-slate-600">{item.storeLocation?.siteName || 'Head office'}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {item.status === ItemStatus.ISSUED ? (
                        <button
                          onClick={() => setReturnItem(item)}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Return
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">In Store</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model 22 Return Modal */}
      {returnItem && (
        <ReturnToStoreModal
          isOpen={!!returnItem}
          item={returnItem}
          employees={employees}
          onClose={() => setReturnItem(null)}
          onSuccess={() => {
            setReturnItem(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
};
