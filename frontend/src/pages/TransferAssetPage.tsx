import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  RotateCcw,
  Search,
  RefreshCw,
  Building2,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Send,
  Printer,
  FileText,
  Car,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api/client';
import {
  ItemWithRelations,
  ItemStatus,
  UserRole,
  Department,
  Employee,
  Location,
  Model21Voucher,
  Model21LineItem,
} from '../types/asset-management';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { Model21PrintModal } from '../components/ui/Model21PrintModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatETB, formatGcToEc } from '../utils/eth-date';

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
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected item for Return to Store Modal
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);

  // Model 21 Printable Voucher Modal State
  const [activeVoucher, setActiveVoucher] = useState<Model21Voucher | null>(null);

  // Model 21 Transfer Form State
  const [selectedItemId, setSelectedItemId] = useState('');
  const [model21No, setModel21No] = useState('0004386');
  const [book, setBook] = useState('MOA MC BOOK');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [targetLocationId, setTargetLocationId] = useState('');
  const [transferReason, setTransferReason] = useState('Fixed asset internal custody reassignment');
  
  // Technical / Vehicle Details (Model 21 document particulars)
  const [chassisNumber, setChassisNumber] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [engineNo, setEngineNo] = useState('');
  const [depreciation, setDepreciation] = useState<number>(0);
  const [bookValue, setBookValue] = useState<number>(0);
  const [jackQty, setJackQty] = useState(1);
  const [tireWrenchQty, setTireWrenchQty] = useState(1);
  const [keyQty, setKeyQty] = useState(2);
  const [tireSerials, setTireSerials] = useState('');
  const [defectRemark, setDefectRemark] = useState('');

  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, deptsRes, empsRes, locsRes] = await Promise.all([
        api.getItems(),
        api.getDepartments(),
        api.getEmployees(),
        api.getLocations(),
      ]);
      setItems(itemsRes);
      setDepartments(deptsRes);
      setEmployees(empsRes);
      setLocations(locsRes);
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

  // When selected item changes, auto-populate technical & valuation details
  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      const cost = item.unitCostETB || 0;
      setDepreciation(cost);
      setBookValue(0);
      setChassisNumber(item.serialNumber ? `CH-${item.serialNumber}` : '');
      if (item.category === 'VEHICLE') {
        setPlateNo('4-23794');
        setEngineNo('1HZ-0641864');
        setTireSerials('R240514711, R240504703, R240504594, R240504595, YY0219');
        setDefectRemark('The right side mirror is missing.\nBoth rear lights are broken.');
      } else {
        setPlateNo('');
        setEngineNo('');
        setTireSerials('');
        setDefectRemark(item.notes || '');
      }
    }
  };

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
      const fromCustodian = selectedItem?.currentCustodian;
      const targetEmp = employees.find((e) => e.id === targetEmployeeId);
      const fromLoc = selectedItem?.storeLocation?.siteName || 'Central Store';
      const toLocObj = locations.find((l) => l.id === targetLocationId);
      const toLoc = toLocObj ? toLocObj.siteName : 'Regional Directorate';
      const todayGc = new Date().toISOString().split('T')[0];
      const todayEc = formatGcToEc(todayGc);

      const accessories = [
        { name: 'jack with handle', quantity: jackQty },
        { name: 'tire wrench', quantity: tireWrenchQty },
        { name: 'key', quantity: keyQty },
      ].filter((a) => a.quantity > 0);

      const tireList = tireSerials
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      await api.transferItem({
        itemId: selectedItemId,
        toEmployeeId: targetEmployeeId,
        toDepartmentId: targetDepartmentId || undefined,
        toLocationId: targetLocationId || undefined,
        reason: transferReason || 'Official custody reassignment',
        performedById: user?.id || employees[0]?.id || '',
        model21No: model21No.trim(),
        book: book.trim(),
        chassisNumber: chassisNumber.trim() || undefined,
        plateNo: plateNo.trim() || undefined,
        engineNo: engineNo.trim() || undefined,
        accessories,
        tireNos: tireList,
        origCost: selectedItem?.unitCostETB,
        depreciation,
        bookValue,
        remark: defectRemark.trim() || undefined,
      });

      const voucher: Model21Voucher = {
        model21No: model21No.trim(),
        fromEmployeeName: fromCustodian?.fullNameEn || 'Store Custodian',
        fromEmployeeId: fromCustodian?.payrollId || '110895',
        book: book.trim() || 'MOA MC BOOK',
        toEmployeeName: targetEmp?.fullNameEn || 'Recipient Staff',
        toEmployeeId: targetEmp?.payrollId || '109856',
        items: [
          {
            sNo: 1,
            description: selectedItem?.name || 'Asset Item',
            tagNumber: selectedItem?.itemCode || 'TAG-001',
            serialNumber: selectedItem?.serialNumber || '',
            chassisNumber: chassisNumber.trim() || undefined,
            uom: 'EA',
            unit: 1,
            origCost: selectedItem?.unitCostETB || 0,
            depreciation,
            bookValue,
            dateGc: todayGc,
            dateEc: todayEc,
            fromLocation: fromLoc,
            toLocation: toLoc,
            plateNo: plateNo.trim() || undefined,
            engineNo: engineNo.trim() || undefined,
            accessories: accessories.length > 0 ? accessories : undefined,
            tireNos: tireList.length > 0 ? tireList : undefined,
            remark: defectRemark.trim() || undefined,
          },
        ],
        famuAccountantName: 'FAMU Reviewer',
        reportTakenBy: user?.payrollId || 'lidlyats',
        reportTakenDate: `${todayGc} @ ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`,
      };

      const msg = `Model 21 transfer of ${selectedItem?.itemCode || selectedItemId} to ${targetEmp?.fullNameEn || 'new custodian'} submitted for Team Leader endorsement. Custody changes after Stage 2 approval.`;
      setTransferSuccessMsg(msg);
      toast.success('Transfer Submitted for Approval', msg);
      setActiveVoucher(voucher);

      // Reset form
      setSelectedItemId('');
      setTargetEmployeeId('');
      setTargetDepartmentId('');
      setTargetLocationId('');
      setTransferReason('Fixed asset internal custody reassignment');
      fetchData();
    } catch (err: any) {
      const errMsg = err.message || 'Failed to process transfer.';
      toast.error('Transfer Failed', errMsg);
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handlePrintModel21 = (item: ItemWithRelations) => {
    const todayGc = new Date().toISOString().split('T')[0];
    const todayEc = formatGcToEc(todayGc);
    const custodian = item.currentCustodian;
    const loc = item.storeLocation?.siteName || 'MoA Gurd Sholla';
    const cost = item.unitCostETB || 0;

    const voucher: Model21Voucher = {
      model21No: item.ifmisSlipNumber || '0004386',
      fromEmployeeName: custodian?.fullNameEn || 'Mekonnen, Abayneh Belachew',
      fromEmployeeId: custodian?.payrollId || '110895',
      book: 'MOA MC BOOK',
      toEmployeeName: 'Ayele, Marta Mekete',
      toEmployeeId: '109856',
      items: [
        {
          sNo: 1,
          description: item.name,
          tagNumber: item.itemCode,
          serialNumber: item.serialNumber || '',
          chassisNumber: item.serialNumber ? `JTEBB71J${item.serialNumber}` : 'JTEBB71JX07008920',
          uom: 'EA',
          unit: 1,
          origCost: cost,
          depreciation: cost,
          bookValue: 0,
          dateGc: todayGc,
          dateEc: todayEc,
          fromLocation: loc,
          toLocation: loc,
          plateNo: item.category === 'VEHICLE' ? '4-23794' : undefined,
          engineNo: item.category === 'VEHICLE' ? '1HZ-0641864' : undefined,
          accessories: item.category === 'VEHICLE' ? [
            { name: 'jack with handle', quantity: 1 },
            { name: 'tire wrench', quantity: 1 },
            { name: 'key', quantity: 2 },
          ] : undefined,
          tireNos: item.category === 'VEHICLE' ? [
            'R240514711', 'R240504703', 'R240504594', 'R240504595', 'YY0219'
          ] : undefined,
          remark: item.notes || 'The right side mirror is missing.\nBoth rear lights are broken.',
        },
      ],
      famuAccountantName: 'FAMU Reviewer',
      reportTakenBy: user?.payrollId || 'lidlyats',
      reportTakenDate: `${todayGc} @ ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`,
    };
    setActiveVoucher(voucher);
  };

  const filteredItems = items.filter((item) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (item.itemCode || '').toLowerCase().includes(q) ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.serialNumber || '').toLowerCase().includes(q) ||
      (item.ifmisSlipNumber || '').toLowerCase().includes(q) ||
      (item.currentCustodian?.fullNameEn || '').toLowerCase().includes(q) ||
      (item.assignedDepartment?.nameEn || '').toLowerCase().includes(q);

    if (activeSubTab === 'transfer' || activeSubTab === 'return') {
      return matchesSearch && item.status === ItemStatus.ISSUED;
    }
    return matchesSearch;
  });

  const selectedItemObj = items.find((i) => i.id === selectedItemId);

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
              Fixed Asset Internal Transfer & Return
              <span className="text-xs font-normal text-emerald-800 font-amharic">
                (የንብረት ዝውውር - ሞዴል 21 እና መመለሻ - ሞዴል 22)
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Official FDRE Ministry of Agriculture Model 21 Internal Transfer Vouchers and Model 22 Store Returns.
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
            Transfer Form (Model 21)
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
        /* ── Model 21 Fixed Asset Internal Transfer Form ──────────────────── */
        <div className="space-y-5">
          <div className="p-6 rounded-2xl bg-white border border-slate-300 shadow-xs space-y-6">
            {/* Form Top Title Box */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                  Model 21 • የንብረት ዝውውር ፎርም
                </span>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mt-1">
                  <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                  Fixed Asset Internal Transfer Form (Model/21)
                </h2>
                <p className="text-xs text-slate-500">
                  The Federal Democratic Republic of Ethiopia • Ministry of Agriculture
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Document Designation</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">Model/21</span>
                </div>
              </div>
            </div>

            {transferSuccessMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-semibold flex items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{transferSuccessMsg}</span>
                </div>
                {activeVoucher && (
                  <button
                    onClick={() => setActiveVoucher(activeVoucher)}
                    className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Model 21
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-6 text-xs">
              {/* ── Document Metadata & Header Block (Matching Photo) ── */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-4">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-700" />
                  1. Document Reference & Register Book
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Model # (Transfer Slip No.) *
                    </label>
                    <input
                      type="text"
                      required
                      value={model21No}
                      onChange={(e) => setModel21No(e.target.value)}
                      placeholder="e.g. 0004386"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-amber-950 focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Book (Register Category) *
                    </label>
                    <input
                      type="text"
                      required
                      value={book}
                      onChange={(e) => setBook(e.target.value)}
                      placeholder="e.g. MOA MC BOOK / Fixed Asset Book"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Transfer Date (G.C.)
                    </label>
                    <input
                      type="date"
                      value={new Date().toISOString().split('T')[0]}
                      readOnly
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* ── Asset Selection & Particulars (Matching photo grid) ── */}
              <div className="p-4 rounded-xl bg-white border border-slate-300 space-y-4 shadow-2xs">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-700" />
                  2. Transferred Asset Particulars
                </h3>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Select Issued Asset to Transfer *
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => handleItemSelect(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-600"
                    required
                  >
                    <option value="">-- Choose Issued Asset to Transfer --</option>
                    {items
                      .filter((i) => i.status === ItemStatus.ISSUED)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.itemCode} — {item.name} (Current Custodian: {item.currentCustodian?.fullNameEn || 'Assigned'})
                        </option>
                      ))}
                  </select>
                </div>

                {selectedItemObj && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Tag Number</span>
                      <span className="font-mono font-bold text-amber-950">{selectedItemObj.itemCode}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Description</span>
                      <span className="font-bold text-slate-900 truncate block">{selectedItemObj.name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Orig. Cost (ETB)</span>
                      <span className="font-mono font-bold text-slate-900">{formatETB(selectedItemObj.unitCostETB)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Current Location</span>
                      <span className="font-semibold text-slate-800">{selectedItemObj.storeLocation?.siteName || 'Head office'}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Chassis Number</label>
                    <input
                      type="text"
                      placeholder="e.g. JTEBB71JX07008920"
                      value={chassisNumber}
                      onChange={(e) => setChassisNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Accumulated Depreciation (ETB)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={depreciation}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setDepreciation(val);
                        setBookValue(Math.max(0, (selectedItemObj?.unitCostETB || 0) - val));
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-right focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Net Book Value (ETB)</label>
                    <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono font-bold text-right text-slate-900">
                      {formatETB(bookValue)}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── From / To Custodians & Locations (Matching Photo Box) ── */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-4">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                  3. From / To Custodians & Locations
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* From Box */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-300 space-y-3">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block border-b pb-1.5">
                      From (Current Custodian)
                    </span>
                    <div>
                      <span className="text-[10px] text-slate-500 block">From Employee Name</span>
                      <span className="font-bold text-slate-900 block text-xs">
                        {selectedItemObj?.currentCustodian?.fullNameEn || 'Central Store Custodian'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">From Employee ID</span>
                      <span className="font-mono font-bold text-slate-700 block text-xs">
                        {selectedItemObj?.currentCustodian?.payrollId || '110895'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">From Location</span>
                      <span className="font-semibold text-slate-800 block text-xs">
                        {selectedItemObj?.storeLocation?.siteName || 'MoA Gurd Sholla (Central Store)'}
                      </span>
                    </div>
                  </div>

                  {/* To Box */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-300 space-y-3">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block border-b pb-1.5">
                      To (Recipient Custodian)
                    </span>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        To Employee Name & ID *
                      </label>
                      <select
                        value={targetEmployeeId}
                        onChange={(e) => setTargetEmployeeId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-600"
                        required
                      >
                        <option value="">-- Select Recipient Employee --</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullNameEn} (ID: {emp.payrollId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        To Directorate / Department
                      </label>
                      <select
                        value={targetDepartmentId}
                        onChange={(e) => setTargetDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                      >
                        <option value="">-- Select Target Directorate --</option>
                        {departments.map((dep) => (
                          <option key={dep.id} value={dep.id}>
                            {dep.nameEn} ({dep.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        To Physical Location
                      </label>
                      <select
                        value={targetLocationId}
                        onChange={(e) => setTargetLocationId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                      >
                        <option value="">-- Same Location / Select New Location --</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.siteName} {loc.building ? `(${loc.building})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Vehicle / Equipment Special Particulars (Matching photo lower block) ── */}
              <div className="p-4 rounded-xl bg-white border border-slate-300 space-y-4 shadow-2xs">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-amber-700" />
                  4. Vehicle / Machinery Accessories & Defect Remarks (Photo Fields)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Plate Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 4-23794"
                      value={plateNo}
                      onChange={(e) => setPlateNo(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Engine Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 1HZ-0641864"
                      value={engineNo}
                      onChange={(e) => setEngineNo(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Jack with Handle (Qty)</label>
                    <input
                      type="number"
                      min="0"
                      value={jackQty}
                      onChange={(e) => setJackQty(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-center focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Tire Wrench (Qty)</label>
                    <input
                      type="number"
                      min="0"
                      value={tireWrenchQty}
                      onChange={(e) => setTireWrenchQty(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-center focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Key (Qty)</label>
                    <input
                      type="number"
                      min="0"
                      value={keyQty}
                      onChange={(e) => setKeyQty(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-center focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Tire Numbers (comma or newline separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. R240514711, R240504703, R240504594, R240504595, YY0219"
                    value={tireSerials}
                    onChange={(e) => setTireSerials(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Remark / Defect Summary *
                  </label>
                  <textarea
                    rows={2}
                    value={defectRemark}
                    onChange={(e) => setDefectRemark(e.target.value)}
                    placeholder="e.g. The right side mirror is missing. Both rear lights are broken."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-200">
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
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shadow-md active:scale-95"
                >
                  {submittingTransfer ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Submit Model 21 Transfer for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : activeSubTab === 'return' ? (
        /* ── Return to Store Table / Selection ────────────────────────────── */
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-teal-700" />
                Model 21 Store Asset Returns (የዕቃ መመለሻ መረከቢያ)
              </h2>
              <p className="text-xs text-slate-500">
                Select an active issued item below to process Model 21 return and clear custodian liability.
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
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Description</th>
                  <th className="p-3 min-w-[150px]">Current Custodian</th>
                  <th className="p-3 w-32">Location</th>
                  <th className="p-3 w-48 text-right whitespace-nowrap">Actions</th>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePrintModel21(item)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-300 hover:border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                            title="Print Model 21 Transfer / Return Voucher"
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-700" />
                            <span>Print M21</span>
                          </button>
                          <button
                            onClick={() => setReturnItem(item)}
                            className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Return (M21)
                          </button>
                        </div>
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
                Complete inventory tracking ledger for Model 21 custody transfers, store returns, and relocations.
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
            <table className="w-full text-left text-xs min-w-[840px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Name</th>
                  <th className="p-3 w-32 whitespace-nowrap">Current Status</th>
                  <th className="p-3 min-w-[160px]">Custodian / Department</th>
                  <th className="p-3 w-32">Store Location</th>
                  <th className="p-3 w-48 text-right whitespace-nowrap">Voucher Actions</th>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePrintModel21(item)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-300 hover:border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                          title="Print Official Model 21 Internal Transfer Form"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-700" />
                          <span>Print M21</span>
                        </button>
                        {item.status === ItemStatus.ISSUED && (
                          <button
                            onClick={() => setReturnItem(item)}
                            className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
                            title="Return to Central Store (Model 22)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model 21 Printable Voucher Modal */}
      <Model21PrintModal
        isOpen={!!activeVoucher}
        voucher={activeVoucher}
        onClose={() => setActiveVoucher(null)}
      />

      {/* Model 21 / 22 Return Modal */}
      {returnItem && (
        <ReturnToStoreModal
          isOpen={!!returnItem}
          item={returnItem}
          employees={employees}
          onClose={() => setReturnItem(null)}
          onSuccess={(voucher) => {
            setReturnItem(null);
            fetchData();
            if (voucher) {
              setActiveVoucher(voucher);
            }
          }}
        />
      )}
    </div>
  );
};
