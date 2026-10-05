import React, { useState, useEffect } from 'react';
import { Search, UserCheck, FileText, Car, Tag } from 'lucide-react';
import { api } from '../../api/client';
import { ItemWithRelations, ItemStatus, Department, Employee, Location, Model21Voucher, TransactionApproval, ApprovalStatus } from '../../types/asset-management';
import { FormSection, FieldGrid, Field, ReadOnlyValue, SummaryGrid, FormFooter, inputClass, textareaClass } from '../ui/FormKit';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { departmentLabel } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { storeLocationLabel } from '../../utils/location';

/** What an open request on an asset is called in the picker */
const REQUEST_TYPE_LABELS: Record<string, string> = {
  STOCK_IN: 'Receipt',
  STOCK_OUT: 'Issue',
  TRANSFER: 'Transfer',
  RETURN: 'Return',
};

const accessoriesOf = (jack: number, wrench: number, keys: number) =>
  [
    { name: 'jack with handle', quantity: jack },
    { name: 'tire wrench', quantity: wrench },
    { name: 'key', quantity: keys },
  ].filter((a) => a.quantity > 0);

const timeNow = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

// ─── Transfer form (inside the pop-up) ──────────────────────────────────────

export interface TransferFormProps {
  items: ItemWithRelations[];
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  /** Open request per item: those items can't be chosen until it is decided */
  pendingByItem: Map<string, TransactionApproval>;
  /** When set, the form corrects this pending transfer instead of creating a new one */
  editTransfer?: TransactionApproval;
  /** Asset chosen before the form opened, e.g. from its row in the register */
  initialItemId?: string;
  /** Inside the asset record the toolbar has Save and Cancel, so the form leaves out its own */
  hideFooter?: boolean;
  /** Tells the toolbar while a save is in progress */
  onSubmittingChange?: (submitting: boolean) => void;
  onCancel: () => void;
  onSaved: (voucher?: Model21Voucher) => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({ items, employees, departments, locations, pendingByItem, editTransfer, initialItemId, hideFooter, onSubmittingChange, onCancel, onSaved }) => {
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
  useEffect(() => {
    onSubmittingChange?.(submitting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

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

  // Opened from an asset's row: start with that asset chosen
  useEffect(() => {
    if (!editTransfer && initialItemId) handleItemSelect(initialItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
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

      {!hideFooter && (
        <FormFooter
          accent="emerald"
          submitting={submitting}
          submitLabel={editTransfer ? 'Save changes' : 'Submit transfer for approval'}
          onCancel={onCancel}
        />
      )}
    </form>
  );
};

/** Model 21 voucher for a transfer or return, rebuilt from what was recorded with the request */
export const buildModel21Voucher = async (
  r: TransactionApproval,
  context: { item?: ItemWithRelations; employees: Employee[]; locations: Location[]; printedBy?: string },
): Promise<Model21Voucher> => {
  const { employees, locations } = context;
  const d = r.requestDetails ?? {};
  let item = context.item;
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
  const storeName = toLocation ? storeLocationLabel(toLocation) : fromLoc || 'Store';
  const todayGc = new Date().toISOString().split('T')[0];
  const requestDateGc = r.ifmisSlipDateGc || String(r.createdAtGc).slice(0, 10);
  return {
    approvalState: r.status === ApprovalStatus.PENDING ? 'PENDING' : r.status === ApprovalStatus.REJECTED ? 'REJECTED' : undefined,
    model21No: r.ifmisSlipNumber || '—',
    fromEmployeeName: fromName,
    fromEmployeeId: fromEmp?.payrollId || '—',
    book: d.book || '—',
    toEmployeeName: toEmp?.fullNameEn || (r.transactionType === 'RETURN' ? storeName : '—'),
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
        dateGc: requestDateGc,
        dateEc: r.ifmisSlipDateEc || formatGcToEc(requestDateGc),
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
    reportTakenBy: context.printedBy || '—',
    reportTakenDate: `${todayGc} @ ${timeNow()}`,
  };
};
