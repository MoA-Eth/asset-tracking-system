import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  RotateCcw,
  Search,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Printer,
  FileText,
  Car,
  Tag,
  Clock,
  Pencil,
  Eye,
  Plus,
  CheckCircle2,
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
  TransactionApproval,
  ApprovalStatus,
} from '../types/asset-management';
import { Modal } from '../components/ui/Modal';
import { StatCard } from '../components/ui/StatCard';
import { ReturnToStoreModal } from '../components/ui/ReturnToStoreModal';
import { Pagination, usePagination } from '../components/ui/Pagination';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { RecordDetailModal } from '../components/ui/RecordDetailModal';
import { RefreshButton } from '../components/ui/RefreshButton';
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

const REQUEST_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Receipt',
  STOCK_OUT: 'Issue',
  TRANSFER: 'Transfer',
  RETURN: 'Return',
};

/** Who a pending request is waiting for */
const STAGE_LABELS: Record<number, string> = {
  1: 'With Team Leader',
  2: 'With Dept. Head',
};

type RequestFilter = 'ALL' | ApprovalStatus;
const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: ApprovalStatus.PENDING, label: 'Pending' },
  { value: ApprovalStatus.APPROVED, label: 'Approved' },
  { value: ApprovalStatus.REJECTED, label: 'Rejected' },
];

const RequestStatus: React.FC<{ request: TransactionApproval }> = ({ request }) => {
  if (request.status === ApprovalStatus.PENDING) {
    return (
      <span className={`${pill} ${statusTone.pending}`}>
        <Clock className="h-3 w-3" />
        {STAGE_LABELS[request.currentStage] ?? 'Pending'}
      </span>
    );
  }
  return (
    <span className={`${pill} ${request.status === ApprovalStatus.APPROVED ? statusTone.approved : statusTone.rejected}`}>
      {request.status === ApprovalStatus.APPROVED ? 'Approved' : 'Rejected'}
    </span>
  );
};

const accessoriesOf = (jack: number, wrench: number, keys: number) =>
  [
    { name: 'jack with handle', quantity: jack },
    { name: 'tire wrench', quantity: wrench },
    { name: 'key', quantity: keys },
  ].filter((a) => a.quantity > 0);

const timeNow = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

// ─── Transfer form (inside the pop-up) ──────────────────────────────────────

interface TransferFormProps {
  items: ItemWithRelations[];
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  /** Open request per item: those items can't be chosen until it is decided */
  pendingByItem: Map<string, TransactionApproval>;
  /** When set, the form corrects this pending transfer instead of creating a new one */
  editTransfer?: TransactionApproval;
  onCancel: () => void;
  onSaved: (voucher?: Model21Voucher) => void;
}

const TransferForm: React.FC<TransferFormProps> = ({ items, employees, departments, locations, pendingByItem, editTransfer, onCancel, onSaved }) => {
  const { user } = useAuth();
  const toast = useToast();
  const details = editTransfer?.requestDetails ?? {};
  const editItem = editTransfer ? items.find((i) => i.id === editTransfer.itemId) : undefined;
  const qtyOf = (name: string) => details.accessories?.find((a) => a.name === name)?.quantity ?? 0;

  const [selectedItemId, setSelectedItemId] = useState(editTransfer?.itemId ?? '');
  const [model21No, setModel21No] = useState(editTransfer?.ifmisSlipNumber ?? '');
  const [book, setBook] = useState(details.book ?? '');
  const [targetEmployeeId, setTargetEmployeeId] = useState(editTransfer?.recipientEmployeeId ?? '');
  const [targetDepartmentId, setTargetDepartmentId] = useState(editTransfer?.targetDepartmentId ?? '');
  const [targetLocationId, setTargetLocationId] = useState(editTransfer?.targetLocationId ?? '');
  const [transferReason, setTransferReason] = useState(details.reason ?? '');
  const [chassisNumber, setChassisNumber] = useState(details.chassisNumber ?? editItem?.serialNumber ?? '');
  const [plateNo, setPlateNo] = useState(details.plateNo ?? '');
  const [engineNo, setEngineNo] = useState(details.engineNo ?? '');
  const [depreciation, setDepreciation] = useState<number>(details.depreciation ?? 0);
  const [bookValue, setBookValue] = useState<number>(details.bookValue ?? (editItem ? (editItem.unitCostETB || 0) * (Number(editItem.quantity) || 1) : 0));
  // Accessories start at zero: the encoder enters what was actually handed over
  const [jackQty, setJackQty] = useState(qtyOf('jack with handle'));
  const [tireWrenchQty, setTireWrenchQty] = useState(qtyOf('tire wrench'));
  const [keyQty, setKeyQty] = useState(qtyOf('key'));
  const [tireSerials, setTireSerials] = useState(details.tireNos?.join(', ') ?? '');
  const [defectRemark, setDefectRemark] = useState(details.remark ?? '');
  const [submitting, setSubmitting] = useState(false);

  const selectedItemObj = items.find((i) => i.id === selectedItemId);
  const selectedIsVehicleLike = selectedItemObj?.category === 'VEHICLE' || selectedItemObj?.category === 'AGRI_MACHINERY';
  const todayGc = new Date().toISOString().split('T')[0];
  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center' }) => inputClass('emerald', opts);

  // A newly chosen asset brings its own details
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return void toast.warning('Asset required', 'Choose the asset to transfer.');
    if (!targetEmployeeId) return void toast.warning('Recipient required', 'Choose the employee who receives the asset.');
    if (!model21No.trim()) return void toast.warning('Model 21 number required', 'Enter the number on the Model 21 form.');
    if (!transferReason.trim()) return void toast.warning('Reason required', 'Enter the reason for the transfer.');

    const accessories = accessoriesOf(jackQty, tireWrenchQty, keyQty);
    const tireList = tireSerials.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      if (editTransfer) {
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
          tireNos: tireList,
          depreciation,
          bookValue,
          remark: defectRemark.trim() || undefined,
        });
        toast.success('Transfer updated', `The transfer of ${editTransfer.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSaved();
        return;
      }

      const selectedItem = selectedItemObj;
      const origCost = (selectedItem?.unitCostETB || 0) * (Number(selectedItem?.quantity) || 1);
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
        origCost,
        depreciation,
        bookValue,
        remark: defectRemark.trim() || undefined,
      });

      const fromCustodian = selectedItem?.currentCustodian;
      const targetEmp = employees.find((emp) => emp.id === targetEmployeeId);
      const fromLoc = storeLocationLabel(selectedItem?.storeLocation);
      const toLocObj = locations.find((l) => l.id === targetLocationId);
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
            origCost,
            depreciation,
            bookValue,
            dateGc: todayGc,
            dateEc: formatGcToEc(todayGc),
            fromLocation: fromLoc,
            // No new location chosen: the item stays in the same store
            toLocation: toLocObj ? storeLocationLabel(toLocObj) : fromLoc,
            plateNo: plateNo.trim() || undefined,
            engineNo: engineNo.trim() || undefined,
            accessories: accessories.length > 0 ? accessories : undefined,
            tireNos: tireList.length > 0 ? tireList : undefined,
            remark: defectRemark.trim() || undefined,
          },
        ],
        famuAccountantName: 'FAMU Reviewer',
        reportTakenBy: user?.payrollId || '—',
        reportTakenDate: `${todayGc} @ ${timeNow()}`,
      };
      toast.success(
        'Transfer submitted for approval',
        `${selectedItem?.itemCode || 'The asset'} to ${targetEmp?.fullNameEn || 'the new custodian'}. Custody changes after the Department Head approves it.`,
      );
      onSaved(voucher);
    } catch (err: any) {
      toast.error(editTransfer ? "The transfer couldn't be updated" : 'Transfer failed', err.message || 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
                { label: 'Current location', value: storeLocationLabel(selectedItemObj.storeLocation) },
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
              <select value={targetDepartmentId} onChange={(e) => setTargetDepartmentId(e.target.value)} className={input()}>
                <option value="">Select…</option>
                {departments.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {departmentLabel(dep)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="To location" optional hint="Leave on Select… to keep the current location.">
              <select value={targetLocationId} onChange={(e) => setTargetLocationId(e.target.value)} className={input()}>
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
              <input type="text" placeholder="e.g. 4-23794" value={plateNo} onChange={(e) => setPlateNo(e.target.value)} className={input({ mono: true })} />
            </Field>
            <Field label="Engine number" optional>
              <input type="text" placeholder="e.g. 1HZ-0641864" value={engineNo} onChange={(e) => setEngineNo(e.target.value)} className={input({ mono: true })} />
            </Field>
          </FieldGrid>

          <FieldGrid>
            <Field label="Jack with handle (qty)">
              <input type="number" min="0" value={jackQty} onChange={(e) => setJackQty(parseInt(e.target.value) || 0)} className={input({ mono: true, align: 'right' })} />
            </Field>
            <Field label="Tire wrench (qty)">
              <input type="number" min="0" value={tireWrenchQty} onChange={(e) => setTireWrenchQty(parseInt(e.target.value) || 0)} className={input({ mono: true, align: 'right' })} />
            </Field>
            <Field label="Keys (qty)">
              <input type="number" min="0" value={keyQty} onChange={(e) => setKeyQty(parseInt(e.target.value) || 0)} className={input({ mono: true, align: 'right' })} />
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
        submitting={submitting}
        submitLabel={editTransfer ? 'Save changes' : 'Submit transfer for approval'}
        onCancel={onCancel}
      />
    </form>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

interface TransferAssetPageProps {
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

export const TransferAssetPage: React.FC<TransferAssetPageProps> = ({ currentRole }) => {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = user?.permissions?.includes('transfers.write') ?? currentRole === UserRole.DATA_ENCODER;

  const [items, setItems] = useState<ItemWithRelations[]>([]);
  const [requests, setRequests] = useState<TransactionApproval[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<RequestFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Pop-ups
  const [transferOpen, setTransferOpen] = useState(false);
  const [editTransfer, setEditTransfer] = useState<TransactionApproval | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<ItemWithRelations | null>(null);
  const [editReturn, setEditReturn] = useState<TransactionApproval | null>(null);
  const [viewing, setViewing] = useState<TransactionApproval | null>(null);
  const [activeVoucher, setActiveVoucher] = useState<Model21Voucher | null>(null);

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
      setRequests(approvalsRes);
      setDepartments(deptsRes);
      setEmployees(empsRes);
      setLocations(locsRes);
    } catch (err: any) {
      console.error('Failed to load transfers:', err);
      setError(err.message || 'The transfers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open request per item, so a second transfer or return isn't offered while one waits
  const pendingByItem = useMemo(
    () => new Map(requests.filter((a) => a.status === ApprovalStatus.PENDING).map((a) => [a.itemId, a] as const)),
    [requests],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  // This page's records: Model 21 transfers and returns, newest first
  const model21 = useMemo(
    () =>
      requests
        .filter((a) => a.transactionType === 'TRANSFER' || a.transactionType === 'RETURN')
        .sort((a, b) => String(b.createdAtGc).localeCompare(String(a.createdAtGc))),
    [requests],
  );

  /** Where the asset goes: the new holder for a transfer, the store for a return */
  const destinationOf = (r: TransactionApproval): string => {
    if (r.transactionType === 'TRANSFER') {
      return r.recipientEmployee?.fullNameEn || employees.find((e) => e.id === r.recipientEmployeeId)?.fullNameEn || '—';
    }
    const location = locations.find((l) => l.id === r.targetLocationId);
    return location ? storeLocationLabel(location) : storeLocationLabel(itemById.get(r.itemId)?.storeLocation) || 'Store';
  };

  const shown = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return model21.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (!q) return true;
      return [r.itemName, r.itemCode, r.ifmisSlipNumber, destinationOf(r), r.requestedBy?.fullNameEn].some((v) => (v || '').toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model21, filter, searchTerm, employees, locations, itemById]);
  const pager = usePagination(shown, { resetKey: `${filter}|${searchTerm}` });

  // Summary tiles
  const issuedCount = items.filter((i) => i.status === ItemStatus.ISSUED).length;
  const pendingTransfers = model21.filter((r) => r.transactionType === 'TRANSFER' && r.status === ApprovalStatus.PENDING).length;
  const pendingReturns = model21.filter((r) => r.transactionType === 'RETURN' && r.status === ApprovalStatus.PENDING).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const approvedThisMonth = model21.filter((r) => r.status === ApprovalStatus.APPROVED && String(r.reviewedAtGc || '').startsWith(thisMonth)).length;

  const openNewTransfer = () => {
    setEditTransfer(null);
    setTransferOpen(true);
  };
  const openEdit = (r: TransactionApproval) => {
    if (r.transactionType === 'TRANSFER') {
      setEditTransfer(r);
      setTransferOpen(true);
      return;
    }
    const item = itemById.get(r.itemId);
    if (!item) return void toast.error('Item not found', `Could not load ${r.itemCode}. Refresh the page and try again.`);
    setEditReturn(r);
    setReturnItem(item);
    setReturnOpen(true);
  };
  const closeTransfer = () => {
    setTransferOpen(false);
    setEditTransfer(null);
  };
  const closeReturn = () => {
    setReturnOpen(false);
    setReturnItem(null);
    setEditReturn(null);
  };

  /** Model 21 voucher for a request, rebuilt from what was recorded with it */
  const printRequest = async (r: TransactionApproval) => {
    const d = r.requestDetails ?? {};
    let item = itemById.get(r.itemId);
    let fromName = '—';
    try {
      // The full history says who held the asset when the request was made
      item = (await api.getItemById(r.itemId)) ?? item;
      const requested = item?.history?.find((h) => /_REQUESTED$/.test(h.action) && h.ifmisSlipNumber === r.ifmisSlipNumber);
      fromName = requested?.fromEntity || item?.currentCustodian?.fullNameEn || '—';
    } catch {
      fromName = item?.currentCustodian?.fullNameEn || '—';
    }
    const fromEmp = employees.find((e) => e.fullNameEn === fromName);
    const toEmp =
      r.transactionType === 'TRANSFER'
        ? employees.find((e) => e.id === r.recipientEmployeeId) || r.recipientEmployee
        : employees.find((e) => e.id === d.storeRecipientId);
    const units = Number(item?.quantity) || 1;
    const origCost = d.origCost ?? (item?.unitCostETB || 0) * units;
    const fromLoc = storeLocationLabel(item?.storeLocation);
    const toLocation = locations.find((l) => l.id === r.targetLocationId);
    const todayGc = new Date().toISOString().split('T')[0];
    setActiveVoucher({
      approvalState: r.status === ApprovalStatus.PENDING ? 'PENDING' : r.status === ApprovalStatus.REJECTED ? 'REJECTED' : undefined,
      model21No: r.ifmisSlipNumber || '—',
      fromEmployeeName: fromName,
      fromEmployeeId: fromEmp?.payrollId || '—',
      book: d.book || '—',
      toEmployeeName: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? destinationOf(r) : '—'),
      toEmployeeId: toEmp?.payrollId || '—',
      items: [
        {
          sNo: 1,
          description: r.itemName,
          tagNumber: r.itemCode,
          serialNumber: item?.serialNumber || '',
          chassisNumber: d.chassisNumber || undefined,
          uom: item?.uom || 'EA',
          unit: units,
          origCost,
          depreciation: d.depreciation ?? 0,
          bookValue: d.bookValue ?? origCost,
          dateGc: r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10),
          dateEc: r.ifmisSlipDateEc || formatGcToEc(r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10)),
          fromLocation: fromLoc,
          toLocation: toLocation ? storeLocationLabel(toLocation) : fromLoc,
          plateNo: d.plateNo || undefined,
          engineNo: d.engineNo || undefined,
          accessories: d.accessories && d.accessories.length > 0 ? d.accessories : undefined,
          tireNos: d.tireNos && d.tireNos.length > 0 ? d.tireNos : undefined,
          remark: d.remark || undefined,
        },
      ],
      famuAccountantName: 'FAMU Reviewer',
      reportTakenBy: user?.payrollId || '—',
      reportTakenDate: `${todayGc} @ ${timeNow()}`,
    });
  };

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3 max-w-md mx-auto my-12 animate-fadeIn">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">The transfers could not be loaded</h3>
        <p className="text-xs text-red-700">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn pb-16">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-emerald-700" />
            Transfers — የንብረት ዝውውር (ሞዴል 21)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Move issued assets between custodians, or return them to store, on the Model 21 form.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setReturnOpen(true)} className={btn.secondary}>
              <RotateCcw className="w-4 h-4" />
              Return to store
            </button>
            <button type="button" onClick={openNewTransfer} className={btn.primary}>
              <Plus className="w-4 h-4" />
              New transfer (Model 21)
            </button>
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Issued assets" value={issuedCount} subtitle="With custodians now" icon={<UserCheck className="w-5 h-5" />} />
        <StatCard label="Transfers pending" value={pendingTransfers} subtitle="Waiting for approval" icon={<ArrowRightLeft className="w-5 h-5" />} />
        <StatCard label="Returns pending" value={pendingReturns} subtitle="Waiting for approval" icon={<RotateCcw className="w-5 h-5" />} />
        <StatCard label="Approved this month" value={approvedThisMonth} subtitle="Transfers and returns" icon={<CheckCircle2 className="w-5 h-5" />} />
      </div>

      {/* ── Requests ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Show requests" className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const count = f.value === 'ALL' ? model21.length : model21.filter((r) => r.status === f.value).length;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    filter === f.value ? 'bg-emerald-800 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {f.label} <span className="ml-0.5 opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search transfers"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by asset, slip number or person…"
                className={table.search.replace('pr-8', 'pr-3')}
              />
            </div>
            <RefreshButton onClick={fetchData} loading={loading} label="transfers" />
          </div>
        </div>

        {loading && model21.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
            Loading transfers…
          </div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center space-y-1">
            <ArrowRightLeft className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800">{model21.length === 0 ? 'No transfers or returns yet' : 'No requests match'}</p>
            <p className="text-xs text-slate-500">
              {model21.length === 0
                ? canWrite
                  ? 'Use "New transfer" to move an issued asset to someone else, or "Return to store" to bring it back.'
                  : 'Transfers and returns appear here once they are requested.'
                : 'Try a different filter or search.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className={table.headRow}>
                  <tr>
                    <th className="px-3 py-2.5 w-28 whitespace-nowrap">Date</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Asset</th>
                    <th className="px-3 py-2.5 w-24">Type</th>
                    <th className="px-3 py-2.5 min-w-[150px]">To</th>
                    <th className="px-3 py-2.5 w-32 whitespace-nowrap">Slip no.</th>
                    <th className="px-3 py-2.5 w-36">Status</th>
                    <th className={`px-3 py-2.5 ${table.actionsHead}`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map((r) => {
                    const isReturn = r.transactionType === 'RETURN';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="block font-mono font-semibold text-slate-900">{String(r.createdAtEc || '').split(' ')[0]}</span>
                          <span className="block font-mono text-[10px] text-slate-400">{String(r.createdAtGc || '').slice(0, 10)} G.C.</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block font-medium text-slate-900">{r.itemName}</span>
                          <span className={`block ${table.code}`}>{r.itemCode}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`${pill} ${isReturn ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-purple-50 text-purple-800 border-purple-200'}`}>
                            {isReturn ? <RotateCcw className="h-3 w-3" /> : <ArrowRightLeft className="h-3 w-3" />}
                            {REQUEST_TYPE_LABELS[r.transactionType]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{destinationOf(r)}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">{r.ifmisSlipNumber || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <RequestStatus request={r} />
                        </td>
                        <td className={`px-3 py-2.5 ${table.actionsCell}`}>
                          <RowActionsMenu
                            label={`${r.itemCode} ${REQUEST_TYPE_LABELS[r.transactionType].toLowerCase()}`}
                            actions={[
                              { label: 'View details', icon: Eye, onClick: () => setViewing(r) },
                              {
                                label: `Edit ${REQUEST_TYPE_LABELS[r.transactionType].toLowerCase()}`,
                                icon: Pencil,
                                onClick: () => openEdit(r),
                                hidden: !canWrite || r.status !== ApprovalStatus.PENDING,
                                disabled: r.currentStage === 2,
                                reason: r.currentStage === 2 ? 'The Team Leader has endorsed it. To correct it, ask an approver to reject it.' : undefined,
                              },
                              { label: 'Print Model 21', icon: Printer, onClick: () => printRequest(r) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pager={pager} label="requests" />
          </>
        )}
      </div>

      {/* ── Transfer form ── */}
      <Modal
        isOpen={transferOpen}
        onClose={closeTransfer}
        title={editTransfer ? `Edit transfer · ${editTransfer.itemCode}` : 'New transfer · Model 21'}
        subtitle={
          editTransfer
            ? 'You can correct this transfer until the Team Leader endorses it. Each change is recorded in the item history.'
            : 'Custody moves to the new holder only after the Team Leader endorses and the Department Head approves it.'
        }
        size="xl"
      >
        {editTransfer || items.some((i) => i.status === ItemStatus.ISSUED) ? (
          <TransferForm
            key={editTransfer?.id ?? 'new'}
            items={items}
            employees={employees}
            departments={departments}
            locations={locations}
            pendingByItem={pendingByItem}
            editTransfer={editTransfer ?? undefined}
            onCancel={closeTransfer}
            onSaved={(voucher) => {
              closeTransfer();
              fetchData();
              if (voucher) setActiveVoucher(voucher);
            }}
          />
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            No asset is issued to anyone yet, so there is nothing to transfer.
          </div>
        )}
      </Modal>

      {/* ── Return form: picks the asset first when opened from the button ── */}
      <ReturnToStoreModal
        isOpen={returnOpen}
        item={returnItem}
        assets={items.filter((i) => i.status === ItemStatus.ISSUED)}
        pendingByItem={pendingByItem}
        employees={employees}
        editApproval={editReturn ?? undefined}
        onClose={closeReturn}
        onSuccess={(voucher) => {
          closeReturn();
          fetchData();
          if (voucher) setActiveVoucher(voucher);
        }}
      />

      {viewing && <RecordDetailModal itemId={viewing.itemId} approval={viewing} onClose={() => setViewing(null)} />}

      <Model21PrintModal isOpen={!!activeVoucher} voucher={activeVoucher} onClose={() => setActiveVoucher(null)} />
    </div>
  );
};
