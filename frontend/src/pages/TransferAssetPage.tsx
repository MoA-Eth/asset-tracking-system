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
  Eye,
} from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
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
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu, RowAction } from '../components/ui/RowActionsMenu';
import { RecordDetailModal } from '../components/ui/RecordDetailModal';
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
import { departmentLabel } from '../utils/department';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { storeLocationLabel } from '../utils/location';

const ITEM_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  [ItemStatus.AVAILABLE]: { label: 'In store', className: statusTone.inStore },
  [ItemStatus.ISSUED]: { label: 'Issued', className: statusTone.issued },
  [ItemStatus.UNDER_TRANSFER]: { label: 'Under transfer', className: statusTone.pending },
  [ItemStatus.PENDING_STOCK_IN]: { label: 'Stock-In pending', className: statusTone.pending },
  [ItemStatus.PENDING_STOCK_OUT]: { label: 'Stock-Out pending', className: statusTone.pending },
  [ItemStatus.DISPOSED]: { label: 'Disposed', className: statusTone.neutral },
};

const statusStyleOf = (item: ItemWithRelations) =>
  item.balance && item.balance.issued > 0 && item.balance.available > 0
    ? { label: 'Partly issued', className: statusTone.partly }
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
    className={`${pill} ${statusTone.pending}`}
    title="This item already has an open request. A new transfer or return can be submitted once it is approved or rejected."
  >
    <Clock className="w-3 h-3" />
    {REQUEST_TYPE_LABELS[request.transactionType] ?? request.transactionType} · {STAGE_LABELS[request.currentStage] ?? 'Pending'}
  </span>
);

/** Edit for a transfer or return still waiting for the Team Leader; locked once endorsed */
/** Edit action for a pending transfer / return; locked once the Team Leader has endorsed it */
const editRequestAction = (request: TransactionApproval | undefined, onEdit: (request: TransactionApproval) => void, allowed: boolean): RowAction => ({
  label: `Edit ${REQUEST_TYPE_LABELS[request?.transactionType ?? '']?.toLowerCase() ?? 'request'}`,
  icon: Pencil,
  onClick: () => request && onEdit(request),
  hidden: !allowed || !request || !['TRANSFER', 'RETURN'].includes(request.transactionType),
  disabled: request?.currentStage === 2,
  reason: request?.currentStage === 2 ? 'The Team Leader has endorsed it. To correct it, ask an approver to reject it.' : undefined,
});

interface TransferAssetPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const TransferAssetPage: React.FC<TransferAssetPageProps> = ({
  currentRole,
  onNavigate,
}) => {
  const { user } = useAuth();
  const canWrite = user?.permissions?.includes('transfers.write') ?? (currentRole === UserRole.DATA_ENCODER);
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'transfer' | 'return'>('all');

  useEffect(() => {
    if (!canWrite && activeSubTab !== 'all') {
      setActiveSubTab('all');
    }
  }, [canWrite, activeSubTab]);
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
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const canEdit = currentRole === UserRole.DATA_ENCODER;

  // Model 21 Printable Voucher Modal State
  const [activeVoucher, setActiveVoucher] = useState<Model21Voucher | null>(null);

  // Model 21 Transfer Form State
  const [selectedItemId, setSelectedItemId] = useState('');
  const [model21No, setModel21No] = useState('');
  const [book, setBook] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [targetLocationId, setTargetLocationId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  
  // Technical / Vehicle Details (Model 21 document particulars)
  const [chassisNumber, setChassisNumber] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [engineNo, setEngineNo] = useState('');
  const [depreciation, setDepreciation] = useState<number>(0);
  const [bookValue, setBookValue] = useState<number>(0);
  // Accessories start at zero: the encoder enters what was actually handed over
  const [jackQty, setJackQty] = useState(0);
  const [tireWrenchQty, setTireWrenchQty] = useState(0);
  const [keyQty, setKeyQty] = useState(0);
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
      setJackQty(0);
      setTireWrenchQty(0);
      setKeyQty(0);
    }
  };

  const resetTransferForm = () => {
    setSelectedItemId('');
    setModel21No('');
    setBook('');
    setTargetEmployeeId('');
    setTargetDepartmentId('');
    setTargetLocationId('');
    setTransferReason('');
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
    if (!model21No.trim()) {
      toast.warning('Voucher Required', 'Please enter the Model 21 voucher number.');
      return;
    }
    if (!transferReason.trim()) {
      toast.warning('Reason Required', 'Please enter the reason for the transfer.');
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
      const fromLoc = storeLocationLabel(selectedItem?.storeLocation);
      const toLocObj = locations.find((l) => l.id === targetLocationId);
      // No new location chosen: the item stays in the same store
      const toLoc = toLocObj ? storeLocationLabel(toLocObj) : fromLoc;
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
        reason: transferReason.trim(),
        performedById: user?.id || '',
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
        approvalState: 'PENDING',
        model21No: model21No.trim(),
        fromEmployeeName: fromCustodian?.fullNameEn || '—',
        fromEmployeeId: fromCustodian?.payrollId || '—',
        book: book.trim() || '—',
        toEmployeeName: targetEmp?.fullNameEn || '—',
        toEmployeeId: targetEmp?.payrollId || '—',
        items: [
          {
            sNo: 1,
            description: selectedItem?.name || '—',
            tagNumber: selectedItem?.itemCode || '—',
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
        reportTakenBy: user?.payrollId || '—',
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
      setTransferReason('');
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
    const loc = storeLocationLabel(item.storeLocation);
    const units = Number(item.quantity) || 1;
    const cost = (item.unitCostETB || 0) * units;

    const voucher: Model21Voucher = {
      approvalState: pendingByItem.get(item.id) ? 'PENDING' : undefined,
      model21No: item.ifmisSlipNumber || '—',
      fromEmployeeName: custodian?.fullNameEn || '—',
      fromEmployeeId: custodian?.payrollId || '—',
      book: '—',
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
      reportTakenBy: user?.payrollId || '—',
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
  const ledgerPager = usePagination(filteredItems, { resetKey: `${searchTerm}|${activeSubTab}` });
  const issuedItems = items.filter((i) => i.status === ItemStatus.ISSUED);
  const issuedPager = usePagination(issuedItems, { resetKey: activeSubTab });

  const selectedItemObj = items.find((i) => i.id === selectedItemId);
  const selectedIsVehicleLike =
    selectedItemObj?.category === 'VEHICLE' || selectedItemObj?.category === 'AGRI_MACHINERY';
  const todayGc = new Date().toISOString().split('T')[0];
  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-md">
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
          {canWrite && (
            <>
              <button
                onClick={() => switchTab('transfer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'transfer'
                    ? btn.tabActive
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
                    ? btn.tabActive
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Return to Store (Model 21)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Sections */}
      {activeSubTab === 'transfer' ? (
        /* ── Model 21 Fixed Asset Internal Transfer Form ──────────────────── */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <ArrowRightLeft className="h-5 w-5 text-emerald-600" />
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
              <FormSection step={1} title="Transfer voucher" subtitle="የዝውውር ሰነድ · Model 21 register" icon={FileText} accent="emerald">
                <FieldGrid>
                  <Field label="Model 21 No." required>
                    <input
                      type="text"
                      required
                      value={model21No}
                      onChange={(e) => setModel21No(e.target.value)}
                      placeholder="Number on the Model 21 form"
                      className={`${input({ mono: true })} font-semibold`}
                    />
                  </Field>

                  <Field label="Register book" required>
                    <input
                      type="text"
                      required
                      value={book}
                      onChange={(e) => setBook(e.target.value)}
                      placeholder="Book the form comes from"
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
              <FormSection step={2} title="Asset" subtitle="የሚዛወረው ንብረት" icon={Tag} accent="emerald">
                <div className="space-y-3.5">
                  {editTransfer ? (
                    <Field label="Issued asset" hint="The asset can't be changed. To transfer a different asset, ask an approver to reject this request.">
                      <ReadOnlyValue mono>
                        {editTransfer.itemCode} — {editTransfer.itemName}
                      </ReadOnlyValue>
                    </Field>
                  ) : (
                  <Field label="Issued asset" required htmlFor="transfer-item" hint="Only assets currently issued to a custodian are listed. Type a name, code or custodian to find one.">
                    <SearchableSelect
                      id="transfer-item"
                      value={selectedItemId}
                      onChange={handleItemSelect}
                      placeholder="Select an asset…"
                      searchPlaceholder="Search by name, code or custodian…"
                      groups={[
                        {
                          label: 'Issued assets',
                          options: items
                            .filter((i) => i.status === ItemStatus.ISSUED)
                            .map((item) => {
                              const pending = pendingByItem.get(item.id);
                              return {
                                value: item.id,
                                label: `${item.itemCode} — ${item.name}`,
                                note: `${item.quantity || 1} ${item.uom || 'EA'} · ${item.currentCustodian?.fullNameEn || 'assigned'}${pending ? ` · ${REQUEST_TYPE_LABELS[pending.transactionType] ?? 'request'} pending` : ''}`,
                                disabled: !!pending,
                              };
                            }),
                        },
                      ]}
                    />
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
              <FormSection step={3} title="Transfer to" subtitle="ተረካቢ" icon={UserCheck} accent="emerald">
                <div className="space-y-3.5">
                  <FieldGrid cols={2}>
                    <Field label="From (current custodian)">
                      <ReadOnlyValue>
                        {selectedItemObj?.currentCustodian
                          ? `${selectedItemObj.currentCustodian.fullNameEn} (${selectedItemObj.currentCustodian.payrollId})`
                          : 'Select an asset first'}
                      </ReadOnlyValue>
                    </Field>

                    <Field label="To employee" required htmlFor="transfer-recipient" hint="Type a name or employee ID.">
                      <SearchableSelect
                        id="transfer-recipient"
                        value={targetEmployeeId}
                        onChange={setTargetEmployeeId}
                        placeholder="Select an employee…"
                        searchPlaceholder="Search by name or employee ID…"
                        groups={[
                          {
                            label: 'Employees',
                            options: employees.map((emp) => ({
                              value: emp.id,
                              label: `${emp.fullNameEn} (${emp.payrollId})`,
                              // The person who holds it can't also receive it
                              disabled: emp.id === selectedItemObj?.currentCustodianId,
                              note: emp.id === selectedItemObj?.currentCustodianId ? 'holds this asset now' : undefined,
                            })),
                          },
                        ]}
                      />
                    </Field>

                    <Field label="To directorate" optional hint="Leave on Select… to keep the current directorate.">
                      <select
                        value={targetDepartmentId}
                        onChange={(e) => setTargetDepartmentId(e.target.value)}
                        className={input()}
                      >
                        <option value="">Select…</option>
                        {departments.map((dep) => (
                          <option key={dep.id} value={dep.id}>
                            {departmentLabel(dep)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="To location" optional hint="Leave on Select… to keep the current location.">
                      <select
                        value={targetLocationId}
                        onChange={(e) => setTargetLocationId(e.target.value)}
                        className={input()}
                      >
                        <option value="">Select…</option>
                        {[...new Map(locations.map((loc) => [loc.storeId, loc.storeName])).entries()].map(([storeId, storeName]) => (
                          <optgroup key={storeId} label={storeName}>
                            {locations
                              .filter((loc) => loc.storeId === storeId)
                              .map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {storeName} · {loc.name}
                                </option>
                              ))}
                          </optgroup>
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
                      className={textareaClass('emerald')}
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
                accent="emerald"
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
                accent="emerald"
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
                <RotateCcw className="w-5 h-5 text-emerald-700" />
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
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-600 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className={table.headRow}>
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Description</th>
                  <th className="p-3 w-24 text-right whitespace-nowrap">Qty</th>
                  <th className="p-3 min-w-[150px]">Current Custodian</th>
                  <th className="p-3 w-32">Location</th>
                  <th className={`p-3 ${table.actionsHead}`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {issuedPager.pageItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className={`p-3 ${table.code} whitespace-nowrap`}>{item.itemCode}</td>
                      <td className="p-3 text-slate-800">{item.name}</td>
                      <UnitsCell item={item} />
                      <td className="p-3 text-slate-700">
                        {item.currentCustodian?.fullNameEn || '—'}
                      </td>
                      <td className="p-3 text-slate-600">{storeLocationLabel(item.storeLocation)}</td>
                      <td className={`p-3 ${table.actionsCell}`}>
                        <div className="flex items-center justify-end gap-2">
                          {pendingByItem.get(item.id) && <PendingRequestChip request={pendingByItem.get(item.id)!} />}
                          <RowActionsMenu
                            label={item.itemCode}
                            actions={[
                              { label: 'View details', icon: Eye, onClick: () => setViewingItemId(item.id) },
                              editRequestAction(pendingByItem.get(item.id), openEditRequest, canWrite),
                              { label: 'Print Model 21', icon: Printer, onClick: () => handlePrintModel21(item), hidden: !item.currentCustodianId },
                              {
                                label: 'Return to store',
                                icon: RotateCcw,
                                onClick: () => setReturnItem(item),
                                hidden: !canWrite || pendingByItem.has(item.id),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <Pagination pager={issuedPager} label="issued assets" />
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
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-600 w-64"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs min-w-[840px]">
              <thead className={table.headRow}>
                <tr>
                  <th className="p-3 w-36 whitespace-nowrap">Asset Code</th>
                  <th className="p-3 min-w-[180px]">Item Name</th>
                  <th className="p-3 w-24 text-right whitespace-nowrap">Qty</th>
                  <th className="p-3 w-32 whitespace-nowrap">Current Status</th>
                  <th className="p-3 min-w-[160px]">Custodian / Department</th>
                  <th className="p-3 w-32">Store Location</th>
                  <th className={`p-3 ${table.actionsHead}`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium">
                {ledgerPager.pageItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className={`p-3 ${table.code} whitespace-nowrap`}>{item.itemCode}</td>
                    <td className="p-3 text-slate-800">{item.name}</td>
                      <UnitsCell item={item} />
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`${pill} ${
                            statusStyleOf(item).className
                          }`}
                        >
                          {statusStyleOf(item).label}
                        </span>
                        {pendingByItem.get(item.id) && <PendingRequestChip request={pendingByItem.get(item.id)!} />}
                      </div>
                    </td>
                    <td className="p-3 text-slate-700">
                      {item.currentCustodian?.fullNameEn || item.assignedDepartment?.nameEn || 'In store'}
                    </td>
                    <td className="p-3 text-slate-600">{storeLocationLabel(item.storeLocation)}</td>
                    <td className={`p-3 ${table.actionsCell}`}>
                      <RowActionsMenu
                        label={item.itemCode}
                        actions={[
                          { label: 'View details', icon: Eye, onClick: () => setViewingItemId(item.id) },
                          editRequestAction(pendingByItem.get(item.id), openEditRequest, canEdit),
                          { label: 'Print Model 21', icon: Printer, onClick: () => handlePrintModel21(item), hidden: !item.currentCustodianId },
                          {
                            label: 'Return to store',
                            icon: RotateCcw,
                            onClick: () => setReturnItem(item),
                            hidden: item.status !== ItemStatus.ISSUED || pendingByItem.has(item.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pager={ledgerPager} label="assets" />
          </div>
        </div>
      )}

      {viewingItemId && <RecordDetailModal itemId={viewingItemId} onClose={() => setViewingItemId(null)} />}

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
