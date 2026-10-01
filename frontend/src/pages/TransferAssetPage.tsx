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
  Clock,
  Pencil,
  Lock,
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
  TransactionApproval,
} from '../types/asset-management';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import {
  FormSection,
  FieldGrid,
  Field,
  ReadOnlyValue,
  SummaryGrid,
  FormFooter,
  inputClass,
  textareaClass,
} from '../components/ui/FormKit';
import { Model21PrintModal } from '../components/ui/Model21PrintModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatETB, formatGcToEc } from '../utils/eth-date';

const ITEM_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  [ItemStatus.AVAILABLE]: { label: 'In store', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  [ItemStatus.ISSUED]: { label: 'Issued', className: 'bg-purple-100 text-purple-800 border-purple-300' },
  [ItemStatus.UNDER_TRANSFER]: { label: 'Under transfer', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  [ItemStatus.PENDING_STOCK_IN]: { label: 'Stock-In pending', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  [ItemStatus.PENDING_STOCK_OUT]: { label: 'Stock-Out pending', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  [ItemStatus.DISPOSED]: { label: 'Disposed', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const statusStyleOf = (item: ItemWithRelations) =>
  item.balance && item.balance.issued > 0 && item.balance.available > 0
    ? { label: 'Partly issued', className: 'bg-sky-100 text-sky-800 border-sky-300' }
    : ITEM_STATUS_LABELS[item.status] ?? { label: item.status, className: ITEM_STATUS_LABELS[ItemStatus.UNDER_TRANSFER].className };

/** Units on this record, and how many the registration received when it has been split */
const UnitsCell: React.FC<{ item: ItemWithRelations }> = ({ item }) => (
  <td className="p-3 font-mono text-slate-800 whitespace-nowrap text-right">
    {item.quantity || 1} {item.uom || 'EA'}
    {!item.parentItemId && item.balance && item.balance.total > (item.quantity || 1) && (
      <span className="block text-[10px] text-slate-400">of {item.balance.total} received</span>
    )}
  </td>
);

const REQUEST_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Stock-In',
  STOCK_OUT: 'Stock-Out',
  TRANSFER: 'Transfer',
  RETURN: 'Return',
};

const STAGE_LABELS: Record<number, string> = {
  1: 'Awaiting Team Leader',
  2: 'Awaiting Dept. Head',
};

/** Open request on an item, e.g. "Return · Awaiting Dept. Head" */
const PendingRequestChip: React.FC<{ request: TransactionApproval }> = ({ request }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-300 whitespace-nowrap"
    title="This item already has an open request. A new transfer or return can be submitted once it is approved or rejected."
  >
    <Clock className="w-3 h-3" />
    {REQUEST_TYPE_LABELS[request.transactionType] ?? request.transactionType} · {STAGE_LABELS[request.currentStage] ?? 'Pending'}
  </span>
);

/** Edit for a transfer or return still waiting for the Team Leader; locked once endorsed */
const EditRequestButton: React.FC<{ request: TransactionApproval; onEdit: (request: TransactionApproval) => void }> = ({
  request,
  onEdit,
}) => {
  const label = REQUEST_TYPE_LABELS[request.transactionType]?.toLowerCase() ?? 'request';
  if (request.currentStage === 1) {
    return (
      <button
        onClick={() => onEdit(request)}
        className="px-2.5 py-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-300 hover:border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
        title={`Correct this ${label} request (allowed until the Team Leader endorses it)`}
        aria-label={`Edit ${label} for ${request.itemCode}`}
      >
        <Pencil className="w-3.5 h-3.5 text-amber-700" />
        Edit
      </button>
    );
  }
  return (
    <button
      disabled
      className="px-2.5 py-1 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-not-allowed"
      title={`Locked: the Team Leader has already endorsed this ${label}. To correct it, ask an approver to reject it and submit it again.`}
      aria-label={`Edit ${label} for ${request.itemCode} (locked after Team Leader endorsement)`}
    >
      <Lock className="w-3.5 h-3.5" />
      Edit
    </button>
  );
};

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
  // Open request per item, so a second transfer/return isn't offered while one waits for approval
  const [pendingByItem, setPendingByItem] = useState<Map<string, TransactionApproval>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected item for Return to Store Modal
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);
  // Pending requests being corrected (only before Team Leader endorsement)
  const [editTransfer, setEditTransfer] = useState<TransactionApproval | null>(null);
  const [editReturn, setEditReturn] = useState<TransactionApproval | null>(null);
  const canEdit = currentRole === UserRole.DATA_ENCODER;

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
      const [itemsRes, deptsRes, empsRes, locsRes, approvalsRes] = await Promise.all([
        api.getItems(),
        api.getDepartments(),
        api.getEmployees(),
        api.getLocations(),
        api.getApprovals(),
      ]);
      setItems(itemsRes);
      setPendingByItem(new Map(approvalsRes.filter((a) => a.status === 'PENDING').map((a) => [a.itemId, a])));
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
      setDepreciation(0);
      setBookValue((item.unitCostETB || 0) * (Number(item.quantity) || 1));
      setChassisNumber(item.serialNumber || '');
      setPlateNo('');
      setEngineNo('');
      setTireSerials('');
      setDefectRemark('');
      const vehicle = item.category === 'VEHICLE' || item.category === 'AGRI_MACHINERY';
      setJackQty(vehicle ? 1 : 0);
      setTireWrenchQty(vehicle ? 1 : 0);
      setKeyQty(vehicle ? 2 : 0);
    }
  };

  const resetTransferForm = () => {
    setSelectedItemId('');
    setModel21No('0004386');
    setBook('MOA MC BOOK');
    setTargetEmployeeId('');
    setTargetDepartmentId('');
    setTargetLocationId('');
    setTransferReason('Fixed asset internal custody reassignment');
    setDefectRemark('');
  };

  /** Switching tabs leaves an unfinished correction */
  const switchTab = (tab: 'all' | 'transfer' | 'return') => {
    if (editTransfer) {
      setEditTransfer(null);
      resetTransferForm();
    }
    setActiveSubTab(tab);
  };

  const openEditRequest = (request: TransactionApproval) => {
    const item = items.find((i) => i.id === request.itemId);
    if (!item) {
      toast.error('Item Not Found', `Could not load ${request.itemCode}. Refresh the page and try again.`);
      return;
    }
    if (request.transactionType === 'RETURN') {
      setEditReturn(request);
      setReturnItem(item);
      return;
    }
    const d = request.requestDetails ?? {};
    handleItemSelect(item.id);
    setModel21No(request.ifmisSlipNumber || '');
    setBook(d.book ?? '');
    setTargetEmployeeId(request.recipientEmployeeId ?? '');
    setTargetDepartmentId(request.targetDepartmentId ?? '');
    setTargetLocationId(request.targetLocationId ?? '');
    setTransferReason(d.reason ?? '');
    setDefectRemark(d.remark ?? '');
    if (d.chassisNumber !== undefined) setChassisNumber(d.chassisNumber);
    setPlateNo(d.plateNo ?? '');
    setEngineNo(d.engineNo ?? '');
    if (d.depreciation !== undefined) setDepreciation(d.depreciation);
    if (d.bookValue !== undefined) setBookValue(d.bookValue);
    if (d.accessories) {
      const qty = (name: string) => d.accessories?.find((a) => a.name === name)?.quantity ?? 0;
      setJackQty(qty('jack with handle'));
      setTireWrenchQty(qty('tire wrench'));
      setKeyQty(qty('key'));
    }
    setTireSerials(d.tireNos?.join(', ') ?? '');
    setTransferSuccessMsg(null);
    setEditTransfer(request);
    setActiveSubTab('transfer');
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

    if (editTransfer) {
      try {
        const accessories = [
          { name: 'jack with handle', quantity: jackQty },
          { name: 'tire wrench', quantity: tireWrenchQty },
          { name: 'key', quantity: keyQty },
        ].filter((a) => a.quantity > 0);
        await api.updateTransfer(editTransfer.id, {
          model21No: model21No.trim(),
          toEmployeeId: targetEmployeeId,
          toDepartmentId: targetDepartmentId || undefined,
          toLocationId: targetLocationId || undefined,
          reason: transferReason.trim(),
          book: book.trim() || undefined,
          chassisNumber: chassisNumber.trim() || undefined,
          plateNo: plateNo.trim() || undefined,
          engineNo: engineNo.trim() || undefined,
          accessories,
          tireNos: tireSerials.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
          depreciation,
          bookValue,
          remark: defectRemark.trim() || undefined,
        });
        toast.success('Transfer Updated', `The transfer of ${editTransfer.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        setEditTransfer(null);
        resetTransferForm();
        setActiveSubTab('all');
        fetchData();
      } catch (err: any) {
        toast.error('Transfer Update Failed', err.message || 'Failed to update the transfer.');
      } finally {
        setSubmittingTransfer(false);
      }
      return;
    }

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
        origCost: (selectedItem?.unitCostETB || 0) * (Number(selectedItem?.quantity) || 1),
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
            uom: selectedItem?.uom || 'EA',
            unit: Number(selectedItem?.quantity) || 1,
            origCost: (selectedItem?.unitCostETB || 0) * (Number(selectedItem?.quantity) || 1),
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
    const units = Number(item.quantity) || 1;
    const cost = (item.unitCostETB || 0) * units;

    const voucher: Model21Voucher = {
      model21No: item.ifmisSlipNumber || '0004386',
      fromEmployeeName: custodian?.fullNameEn || '—',
      fromEmployeeId: custodian?.payrollId || '—',
      book: 'MOA MC BOOK',
      toEmployeeName: '—',
      toEmployeeId: '—',
      items: [
        {
          sNo: 1,
          description: item.name,
          tagNumber: item.itemCode,
          serialNumber: item.serialNumber || '',
          chassisNumber: item.serialNumber || undefined,
          uom: item.uom || 'EA',
          unit: units,
          origCost: cost,
          depreciation: 0,
          bookValue: cost,
          dateGc: todayGc,
          dateEc: todayEc,
          fromLocation: loc,
          toLocation: loc,
          remark: '',
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
  const selectedIsVehicleLike =
    selectedItemObj?.category === 'VEHICLE' || selectedItemObj?.category === 'AGRI_MACHINERY';
  const todayGc = new Date().toISOString().split('T')[0];
  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('amber', opts);

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
                (የንብረት ዝውውር እና መመለሻ - ሞዴል 21)
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Model 21 internal transfers between custodians and returns to store.
            </p>
          </div>
        </div>

        {/* Quick Action Navigation Pills */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => switchTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Movements & Returns
          </button>
          <button
            onClick={() => switchTab('transfer')}
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
            onClick={() => switchTab('return')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'return'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Return to Store (Model 21)
          </button>
        </div>
      </div>

      {/* Main Content Sections */}
      {activeSubTab === 'transfer' ? (
        /* ── Model 21 Fixed Asset Internal Transfer Form ──────────────────── */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                {editTransfer ? `Edit transfer · ${editTransfer.itemCode}` : 'New transfer · Model 21'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {editTransfer
                  ? 'You can correct this transfer until the Team Leader endorses it. Each change is recorded in the item history.'
                  : 'Custody moves to the new holder only after the Team Leader endorses and the Department Head approves it.'}
              </p>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            {transferSuccessMsg && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{transferSuccessMsg}</span>
                </div>
                {activeVoucher && (
                  <button
                    onClick={() => setActiveVoucher(activeVoucher)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-800 cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Model 21
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              {/* ── Section 1: Transfer voucher ── */}
              <FormSection step={1} title="Transfer voucher" subtitle="የዝውውር ሰነድ · Model 21 register" icon={FileText} accent="amber">
                <FieldGrid>
                  <Field label="Model 21 No." required>
                    <input
                      type="text"
                      required
                      value={model21No}
                      onChange={(e) => setModel21No(e.target.value)}
                      placeholder="e.g. 0004386"
                      className={`${input({ mono: true })} font-semibold`}
                    />
                  </Field>

                  <Field label="Register book" required>
                    <input
                      type="text"
                      required
                      value={book}
                      onChange={(e) => setBook(e.target.value)}
                      placeholder="e.g. MOA MC BOOK"
                      className={input()}
                    />
                  </Field>

                  <Field
                    label="Transfer date (G.C.)"
                    hint={
                      editTransfer
                        ? `${formatGcToEc(editTransfer.ifmisSlipDateGc)} E.C. · date the transfer was requested`
                        : `${formatGcToEc(todayGc)} E.C. · recorded as today`
                    }
                  >
                    <ReadOnlyValue mono>{editTransfer ? editTransfer.ifmisSlipDateGc : todayGc}</ReadOnlyValue>
                  </Field>
                </FieldGrid>
              </FormSection>

              {/* ── Section 2: Asset ── */}
              <FormSection step={2} title="Asset" subtitle="የሚዛወረው ንብረት" icon={Tag} accent="amber">
                <div className="space-y-3.5">
                  {editTransfer ? (
                    <Field label="Issued asset" hint="The asset can't be changed. To transfer a different asset, ask an approver to reject this request.">
                      <ReadOnlyValue mono>
                        {editTransfer.itemCode} — {editTransfer.itemName}
                      </ReadOnlyValue>
                    </Field>
                  ) : (
                  <Field label="Issued asset" required hint="Only assets currently issued to a custodian are listed.">
                    <select
                      value={selectedItemId}
                      onChange={(e) => handleItemSelect(e.target.value)}
                      className={`${input()} font-medium`}
                      required
                    >
                      <option value="">Choose an asset to transfer…</option>
                      {items
                        .filter((i) => i.status === ItemStatus.ISSUED)
                        .map((item) => {
                          const pending = pendingByItem.get(item.id);
                          return (
                            <option key={item.id} value={item.id} disabled={!!pending}>
                              {item.itemCode} — {item.name} · {item.quantity || 1} {item.uom || 'EA'} ({item.currentCustodian?.fullNameEn || 'assigned'})
                              {pending ? ` — ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}
                            </option>
                          );
                        })}
                    </select>
                  </Field>
                  )}

                  {selectedItemObj && (
                    <SummaryGrid
                      items={[
                        { label: 'Tag number', value: selectedItemObj.itemCode, mono: true },
                        { label: 'Description', value: selectedItemObj.name },
                        { label: 'Current location', value: selectedItemObj.storeLocation?.siteName },
                        {
                          label: `Original cost (${selectedItemObj.quantity || 1} ${selectedItemObj.uom || 'EA'})`,
                          value: formatETB((selectedItemObj.unitCostETB || 0) * (Number(selectedItemObj.quantity) || 1)),
                          mono: true,
                        },
                      ]}
                    />
                  )}

                  <FieldGrid cols={2}>
                    <Field label="Chassis / serial number" optional>
                      <input
                        type="text"
                        placeholder="e.g. JTEBB71JX07008920"
                        value={chassisNumber}
                        onChange={(e) => setChassisNumber(e.target.value)}
                        className={input({ mono: true })}
                      />
                    </Field>

                    <Field label="Accumulated depreciation (ETB)" optional hint={`Net book value: ${formatETB(bookValue)}`}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depreciation}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setDepreciation(val);
                          setBookValue(Math.max(0, (selectedItemObj?.unitCostETB || 0) * (Number(selectedItemObj?.quantity) || 1) - val));
                        }}
                        className={input({ mono: true, align: 'right' })}
                      />
                    </Field>
                  </FieldGrid>
                </div>
              </FormSection>

              {/* ── Section 3: Transfer to ── */}
              <FormSection step={3} title="Transfer to" subtitle="ተረካቢ" icon={UserCheck} accent="amber">
                <div className="space-y-3.5">
                  <FieldGrid cols={2}>
                    <Field label="From (current custodian)">
                      <ReadOnlyValue>
                        {selectedItemObj?.currentCustodian
                          ? `${selectedItemObj.currentCustodian.fullNameEn} (${selectedItemObj.currentCustodian.payrollId})`
                          : 'Select an asset first'}
                      </ReadOnlyValue>
                    </Field>

                    <Field label="To employee" required>
                      <select
                        value={targetEmployeeId}
                        onChange={(e) => setTargetEmployeeId(e.target.value)}
                        className={input()}
                        required
                      >
                        <option value="">Select the new custodian…</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullNameEn} ({emp.payrollId})
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="To directorate" optional hint="Leave blank to keep the current directorate.">
                      <select
                        value={targetDepartmentId}
                        onChange={(e) => setTargetDepartmentId(e.target.value)}
                        className={input()}
                      >
                        <option value="">Keep current directorate</option>
                        {departments.map((dep) => (
                          <option key={dep.id} value={dep.id}>
                            {dep.nameEn} ({dep.code})
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="To location" optional hint="Leave blank to keep the current location.">
                      <select
                        value={targetLocationId}
                        onChange={(e) => setTargetLocationId(e.target.value)}
                        className={input()}
                      >
                        <option value="">Keep current location</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.siteName} {loc.building ? `(${loc.building})` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </FieldGrid>

                  <Field label="Reason for transfer" required>
                    <input
                      type="text"
                      required
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="e.g. Reassigned for field survey work"
                      className={input()}
                    />
                  </Field>

                  <Field label="Defects / remarks" optional>
                    <textarea
                      rows={2}
                      value={defectRemark}
                      onChange={(e) => setDefectRemark(e.target.value)}
                      placeholder="e.g. The right side mirror is missing. Both rear lights are broken."
                      className={textareaClass('amber')}
                    />
                  </Field>
                </div>
              </FormSection>

              {/* ── Section 4: Vehicle & machinery details (optional) ── */}
              <FormSection
                key={selectedIsVehicleLike ? 'vehicle' : 'other'}
                step={4}
                title="Vehicle & machinery details"
                subtitle="Plate, engine, accessories and tires · only for vehicles and machinery"
                icon={Car}
                accent="amber"
                collapsible
                defaultOpen={selectedIsVehicleLike}
              >
                <div className="space-y-3.5">
                  <FieldGrid cols={2}>
                    <Field label="Plate number" optional>
                      <input
                        type="text"
                        placeholder="e.g. 4-23794"
                        value={plateNo}
                        onChange={(e) => setPlateNo(e.target.value)}
                        className={input({ mono: true })}
                      />
                    </Field>

                    <Field label="Engine number" optional>
                      <input
                        type="text"
                        placeholder="e.g. 1HZ-0641864"
                        value={engineNo}
                        onChange={(e) => setEngineNo(e.target.value)}
                        className={input({ mono: true })}
                      />
                    </Field>
                  </FieldGrid>

                  <FieldGrid>
                    <Field label="Jack with handle (qty)">
                      <input
                        type="number"
                        min="0"
                        value={jackQty}
                        onChange={(e) => setJackQty(parseInt(e.target.value) || 0)}
                        className={input({ mono: true, align: 'right' })}
                      />
                    </Field>

                    <Field label="Tire wrench (qty)">
                      <input
                        type="number"
                        min="0"
                        value={tireWrenchQty}
                        onChange={(e) => setTireWrenchQty(parseInt(e.target.value) || 0)}
                        className={input({ mono: true, align: 'right' })}
                      />
                    </Field>

                    <Field label="Keys (qty)">
                      <input
                        type="number"
                        min="0"
                        value={keyQty}
                        onChange={(e) => setKeyQty(parseInt(e.target.value) || 0)}
                        className={input({ mono: true, align: 'right' })}
                      />
                    </Field>
                  </FieldGrid>

                  <Field label="Tire serial numbers" optional hint="Separate with commas or new lines">
                    <input
                      type="text"
                      placeholder="e.g. R240514711, R240504703, YY0219"
                      value={tireSerials}
                      onChange={(e) => setTireSerials(e.target.value)}
                      className={input({ mono: true })}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormFooter
                accent="amber"
                submitting={submittingTransfer}
                submitLabel={editTransfer ? 'Save changes' : 'Submit transfer for approval'}
                onCancel={() => switchTab('all')}
                sticky={false}
              />
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
                  <th className="p-3 w-24 text-right whitespace-nowrap">Qty</th>
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
                      <UnitsCell item={item} />
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
                          {pendingByItem.get(item.id) ? (
                            <>
                              <PendingRequestChip request={pendingByItem.get(item.id)!} />
                              {canEdit && ['TRANSFER', 'RETURN'].includes(pendingByItem.get(item.id)!.transactionType) && (
                                <EditRequestButton request={pendingByItem.get(item.id)!} onEdit={openEditRequest} />
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => setReturnItem(item)}
                              className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Return (M21)
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
                  <th className="p-3 w-24 text-right whitespace-nowrap">Qty</th>
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
                      <UnitsCell item={item} />
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            statusStyleOf(item).className
                          }`}
                        >
                          {statusStyleOf(item).label}
                        </span>
                        {pendingByItem.get(item.id) && <PendingRequestChip request={pendingByItem.get(item.id)!} />}
                      </div>
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
                        {canEdit &&
                          pendingByItem.get(item.id) &&
                          ['TRANSFER', 'RETURN'].includes(pendingByItem.get(item.id)!.transactionType) && (
                            <EditRequestButton request={pendingByItem.get(item.id)!} onEdit={openEditRequest} />
                          )}
                        {item.status === ItemStatus.ISSUED && !pendingByItem.has(item.id) && (
                          <button
                            onClick={() => setReturnItem(item)}
                            className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
                            title="Return to Central Store (Model 21)"
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
          editApproval={editReturn ?? undefined}
          onClose={() => {
            setReturnItem(null);
            setEditReturn(null);
          }}
          onSuccess={(voucher) => {
            setReturnItem(null);
            setEditReturn(null);
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
