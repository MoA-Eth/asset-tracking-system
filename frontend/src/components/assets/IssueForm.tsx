import React, { useState, useEffect, useRef } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { StoreManField } from './StoreManField';
import { useStoreKeepers, nameKey } from '../../hooks/useStoreKeepers';
import { recallForm, rememberForm } from '../../utils/form-memory';
import { useSlipRegister, usedMessage } from '../../hooks/useSlipRegister';
import { FieldGrid, Field, FormError, FormNotice, FileDropField, FormFooter, QuantityInput, inputClass, MoneyInput, useFieldErrors, submitOnCtrlEnter } from '../ui/FormKit';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ItemWithRelations, TransactionApproval, Department, Employee, Model22Voucher, Organization } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { departmentLabel } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_ACCEPT_ATTR, getSlipDisplayName } from '../../utils/slip-upload';
import { readPdfPages, rowsToText, isModel19, isModel21, isModel22, isDisposalForm, parseModel22, Model22SlipFields } from '../../utils/slip-reader';
import { Part, SlipPreview } from './FormParts';
import { cellClass, money } from './SlipLines';

// ─── Issue items (Model 22) ──────────────────────────────────────────────────

export interface StockOutFormProps {
  availableItems: ItemWithRelations[];
  departments: Department[];
  employees: Employee[];
  onCancel: () => void;
  onSuccess: (result: TransactionApproval, voucher?: Model22Voucher) => void;
  /** When set, the form corrects this pending request instead of creating a new one */
  editApproval?: TransactionApproval;
  /** The item of the request being corrected (it is not in the available list while pending) */
  editItem?: ItemWithRelations;
  /** Item chosen before the form opened, e.g. from its row in the register */
  initialItemId?: string;
}

/** Splits the stored "purpose (Remark: remark)" text back into its two fields */
const splitPurposeAndRemark = (text: string): { purpose: string; remark: string } => {
  const match = /^([\s\S]*) \(Remark: ([\s\S]*)\)$/.exec(text || '');
  return match ? { purpose: match[1], remark: match[2] } : { purpose: text || '', remark: '' };
};

/** Most stock-outs are move orders, so that is the starting choice */
const DEFAULT_TRANSACTION_TYPE = 'Move Order Issue';
/** Writing the units off through Model 22 instead of handing them to a recipient */
const DISPOSAL_TRANSACTION_TYPE = 'Disposal';
/** The transaction types offered; a Model 22 PDF may add the one it prints */
const TRANSACTION_TYPES = ['Move Order Issue', 'Miscellaneous issue', 'Subinventory Transfer', 'Direct Store Issue', 'Department Assignment', 'Project Allocation'];
/** IFMIS issue vouchers are a page or two; a longer one is read this far */
const MAX_SLIP_PAGES = 30;

/** "Mantegbosh Mirku, Oromia Bureau of Agriculture": the person who signs for an organization, or just the organization */
export const externalReceiverName = (organization: string, contact?: string): string =>
  [contact?.trim(), organization.trim()].filter(Boolean).join(', ');

/** One line of the voucher: a store item and how many of it */
interface IssueRow {
  key: number;
  itemId: string;
  quantity: number;
  /** What the Model 22 PDF printed for this line, to show when no store item matches it */
  slip?: { itemCode?: string; description?: string; quantity?: number; uom?: string; lines: number };
}
let rowKey = 0;
const newRow = (itemId = '', quantity = 0, slip?: IssueRow['slip']): IssueRow => ({ key: ++rowKey, itemId, quantity, slip });

const unitsOf = (item?: ItemWithRelations) => Number(item?.quantity) || 1;
/** "  oromia   bureau " and "Oromia Bureau" are the same organization */
const orgKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
// Items registered before units were recorded count in EA, as on the server
const uomOf = (item?: ItemWithRelations) => item?.uom || 'EA';

export const StockOutForm: React.FC<StockOutFormProps> = ({
  availableItems,
  departments,
  employees,
  onCancel,
  onSuccess,
  editApproval,
  editItem,
  initialItemId,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editApproval;
  const editNotes = splitPurposeAndRemark(editApproval?.purposeOrRemarks ?? '');

  // ── Voucher
  const [model22No, setModel22No] = useState<string>(editApproval?.ifmisSlipNumber ?? '');
  const today = new Date().toISOString().split('T')[0];
  const [issuedDateGc, setIssuedDateGc] = useState<string>(
    editApproval?.ifmisSlipDateGc || editApproval?.createdAtGc?.split('T')[0] || today
  );
  // A new issue starts from the last one this person made; a disposal is never carried over
  const memory = editApproval ? {} : recallForm(user?.id, 'issue');
  const slips = useSlipRegister();
  const [transactionType, setTransactionType] = useState<string>(
    memory.transactionType && memory.transactionType !== DISPOSAL_TRANSACTION_TYPE ? memory.transactionType : DEFAULT_TRANSACTION_TYPE,
  );
  // The issue's transaction type, to go back to when the disposal box is unticked
  const issueType = useRef(transactionType === DISPOSAL_TRANSACTION_TYPE ? DEFAULT_TRANSACTION_TYPE : transactionType);
  useEffect(() => {
    if (transactionType !== DISPOSAL_TRANSACTION_TYPE && transactionType) issueType.current = transactionType;
  }, [transactionType]);
  // A transaction type a Model 22 printed that is not in the usual list
  const [slipType, setSlipType] = useState<string | null>(null);
  const typeOptions = slipType && !TRANSACTION_TYPES.includes(slipType) ? [...TRANSACTION_TYPES, slipType] : TRANSACTION_TYPES;

  // ── Items: one row per line of the Model 22. A correction is its one item, which can't change.
  const startItem = availableItems.find((i) => i.id === initialItemId);
  const [rows, setRows] = useState<IssueRow[]>(() =>
    isEdit
      ? [newRow(editItem?.id ?? '', Number(editApproval?.requestDetails?.quantity) || unitsOf(editItem))]
      // Opened from an item's row: that item, all of it, unless fewer are typed
      : [newRow(startItem?.id ?? '', startItem ? unitsOf(startItem) : 0)],
  );
  const itemOf = (row: IssueRow) => (isEdit ? editItem : availableItems.find((i) => i.id === row.itemId));
  const setRow = (key: number, patch: Partial<IssueRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chooseItem = (key: number, itemId: string) => {
    const item = availableItems.find((i) => i.id === itemId);
    // Everything in store unless the slip said how many
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, itemId, quantity: r.slip?.quantity ?? unitsOf(item) } : r)));
  };
  const [transportationCost, setTransportationCost] = useState<number>(Number(editApproval?.requestDetails?.transportationCost) || 0);

  // ── Recipient
  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>(editApproval?.targetDepartmentId ?? '');
  const [recipientEmployeeId, setRecipientEmployeeId] = useState<string>(editApproval?.recipientEmployeeId ?? '');
  // An employee receives it (internal), or an outside organization from the list (external): one picker for both
  const [recipientType, setRecipientType] = useState<'INTERNAL' | 'EXTERNAL'>(
    editApproval?.requestDetails?.recipientType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL'
  );
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  useEffect(() => {
    api.getOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
  }, []);
  const [organizationId, setOrganizationId] = useState<string>(editApproval?.requestDetails?.organizationId ?? '');
  // The organization's name; a correction of an issue from before the list has only this, until matched below
  const [organizationName, setOrganizationName] = useState<string>(editApproval?.requestDetails?.organizationName ?? '');
  const [contactPerson, setContactPerson] = useState<string>(editApproval?.requestDetails?.contactPerson ?? '');
  // A name on the slip that is no employee, offered as an organization
  const [suggestedOrganization, setSuggestedOrganization] = useState<string | null>(null);
  useEffect(() => {
    if (organizationId || !organizationName) return;
    const listed = organizations.find((o) => orgKey(o.name) === orgKey(organizationName));
    if (listed) setOrganizationId(listed.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations]);
  // A disposal has no recipient and gives its reason; an issue has no purpose (a correction keeps an older one)
  const isDisposal = isEdit ? editApproval?.requestDetails?.disposal === true : transactionType === DISPOSAL_TRANSACTION_TYPE;
  const isExternal = !isDisposal && recipientType === 'EXTERNAL';
  const [purpose, setPurpose] = useState<string>(isEdit ? editNotes.purpose : '');
  // Remark is no longer asked; a correction keeps what an older request has
  const remark = editNotes.remark;

  const handleEmployeeChange = (empId: string) => {
    setRecipientEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp && emp.departmentId) setDestinationDepartmentId(emp.departmentId);
  };
  const chooseOrganization = (org: Organization) => {
    setRecipientType('EXTERNAL');
    setOrganizationId(org.id);
    setOrganizationName(org.name);
    // Its usual signer, unless someone was already typed
    setContactPerson((c) => c.trim() || org.contactPerson || '');
    setSuggestedOrganization(null);
  };
  // "emp:<id>" or "org:<id>" in the picker
  const chooseRecipient = (value: string) => {
    if (value.startsWith('emp:')) {
      setRecipientType('INTERNAL');
      handleEmployeeChange(value.slice(4));
      setSuggestedOrganization(null);
    } else if (value.startsWith('org:')) {
      const org = organizations.find((o) => o.id === value.slice(4));
      if (org) chooseOrganization(org);
    }
  };
  const recipientValue = isExternal
    ? organizationId ? `org:${organizationId}` : organizationName ? 'org:typed' : ''
    : recipientEmployeeId ? `emp:${recipientEmployeeId}` : '';
  // A new organization, added to the list from here so it is spelled the same next time
  const addOrganization = async (name: string) => {
    try {
      const org = await api.createOrganization({ name });
      setOrganizations((os) => [...os, org].sort((a, b) => a.name.localeCompare(b.name)));
      chooseOrganization(org);
      toast.success('Organization added', `${org.name} is in the list now.`);
    } catch (err: any) {
      toast.error("The organization couldn't be added", err.message || 'Server error');
    }
  };

  // ── Who issues it: a store man of the store the items are in (one Model 22 issues from one store)
  const keepers = useStoreKeepers();
  const [issuedById, setIssuedById] = useState('');
  const chosenItems = rows.map(itemOf).filter(Boolean) as ItemWithRelations[];
  const firstItem = chosenItems[0];
  const storeOf = (item: ItemWithRelations) => item.storeLocation?.storeId ?? item.storeLocationId;
  const mixedStores = new Set(chosenItems.map(storeOf)).size > 1;
  const storeMen = keepers.ofLocation(firstItem?.storeLocationId);
  const issuerId = issuedById || (storeMen.length === 1 ? storeMen[0].employeeId : '');
  const issuerName = storeMen.find((k) => k.employeeId === issuerId)?.fullNameEn;

  // ── Files: the IFMIS Model 22 PDF is read to fill in the form; the signed copy is kept as the request's copy
  const [ifmisFile, setIfmisFile] = useState<File | null>(null);
  const [signedFileName, setSignedFileName] = useState<string>(
    editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : ''
  );
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const copyFile = signedFile ?? ifmisFile;
  const [slipNote, setSlipNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const isAttachmentReq = useSystemSettings().slipAttachmentPolicy === 'REQUIRED';

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (itemOf(r)?.unitCostETB || 0), 0);
  const grandTotal = totalAmount + transportationCost;
  const ethDate = formatGcToEc(issuedDateGc);
  const usedNo = slips.findUsed(model22No, ['STOCK_OUT'], editApproval?.id);

  // What each row still needs; the same store item may be on one row only
  const rowMissing = (row: IssueRow, n: number): string | false => {
    const item = itemOf(row);
    if (!item) return `item ${n} (store item)`;
    if (rows.some((r) => r.key !== row.key && r.itemId === row.itemId && rows.indexOf(r) < rows.indexOf(row))) return `item ${n} (already on another row)`;
    const inStore = unitsOf(item);
    if (!(Number.isInteger(row.quantity) && row.quantity >= 1 && row.quantity <= inStore)) return rows.length === 1 ? 'quantity' : `item ${n} (quantity)`;
    return false;
  };

  // Required fields still empty; the request can only be submitted once this is empty
  const missingFields = [
    !model22No.trim() && 'Model 22 No.',
    !issuedDateGc && 'issued date',
    !isEdit && !transactionType && 'transaction type',
    ...rows.map((r, i) => rowMissing(r, i + 1)),
    mixedStores && 'items from one store',
    !isEdit && storeMen.length > 1 && !issuerId && 'issued by (store man)',
    isDisposal && !purpose.trim() && 'reason for disposal',
    !isDisposal && !isExternal && !destinationDepartmentId && 'destination directorate',
    !isDisposal && !(isExternal ? organizationName.trim() : recipientEmployeeId) && 'recipient',
    isAttachmentReq && !signedFileName && 'signed copy',
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({
    model22No: !model22No.trim() && 'Enter the number printed on the Model 22 slip.',
    purpose: isDisposal && !purpose.trim() && 'Say why the units are being written off.',
  });

  const recipientFields = isDisposal
    ? { disposal: true as const }
    : isExternal
    ? { recipientType: 'EXTERNAL' as const, ...(organizationId ? { organizationId } : {}), organizationName: organizationName.trim(), contactPerson: contactPerson.trim() || undefined }
    : { recipientType: 'INTERNAL' as const, recipientEmployeeId, targetDepartmentId: destinationDepartmentId };

  const handleReset = () => {
    setModel22No('');
    setIssuedDateGc(today);
    setTransactionType(DEFAULT_TRANSACTION_TYPE);
    setSlipType(null);
    setRows([newRow()]);
    setTransportationCost(0);
    setDestinationDepartmentId('');
    setRecipientEmployeeId('');
    setIssuedById('');
    setRecipientType('INTERNAL');
    setOrganizationId('');
    setOrganizationName('');
    setContactPerson('');
    setSuggestedOrganization(null);
    setPurpose('');
    setIfmisFile(null);
    setSignedFile(null);
    setSignedFileName('');
    setSlipNote(null);
    setFormError(null);
  };

  // ── Reading a Model 22 PDF
  const latestSlip = useRef<File | null>(null);
  const takeSigned = (file: File) => {
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid Slip File', error);
      return;
    }
    setFormError(null);
    setSignedFile(file);
    setSignedFileName(file.name);
  };
  const scanGiven = (file: File, what: string) => {
    takeSigned(file);
    setSlipNote({ tone: 'info', text: `${what} It is attached below as the signed copy. Nothing was read from it; what was filled in stays.` });
  };

  const fillFromModel22 = (slip: Model22SlipFields) => {
    const filled: string[] = [];
    // Header: what is still empty (or on its starting value) is filled
    if (slip.model22No && !model22No.trim()) {
      setModel22No(slip.model22No);
      filled.push('Model 22 No.');
    }
    if (slip.issuedDate && issuedDateGc === today) {
      setIssuedDateGc(slip.issuedDate);
      filled.push('issued date');
    }
    if (slip.transactionType && !isEdit) {
      const known = typeOptions.find((t) => t.toLowerCase() === slip.transactionType!.toLowerCase());
      if (!known) setSlipType(slip.transactionType);
      setTransactionType(known ?? slip.transactionType);
      filled.push('transaction type');
    }
    if (slip.transportationCost && !transportationCost) {
      setTransportationCost(slip.transportationCost);
      filled.push('transport cost');
    }
    // Recipient: the employee named on the slip, then their directorate; else the destination as a directorate
    const receiver = slip.receivedBy ? employees.find((e) => nameKey(e.fullNameEn) === nameKey(slip.receivedBy!)) : undefined;
    const listed = !receiver && slip.receivedBy ? organizations.find((o) => [o.name, o.shortName].some((n) => n && orgKey(n) === orgKey(slip.receivedBy!))) : undefined;
    if (receiver && !isDisposal) {
      setRecipientType('INTERNAL');
      handleEmployeeChange(receiver.id);
      filled.push('received by');
    } else if (listed && !isDisposal) {
      chooseOrganization(listed);
      filled.push('received by (organization)');
    } else if (slip.receivedBy && !isDisposal) {
      setSuggestedOrganization(slip.receivedBy);
    }
    const destination = slip.destination?.trim().toLowerCase();
    const dept = destination ? departments.find((d) => [d.nameEn, departmentLabel(d)].some((n) => n?.toLowerCase() === destination)) : undefined;
    if (dept && !receiver) {
      setDestinationDepartmentId(dept.id);
      filled.push('destination directorate');
    }

    // Items: lines with the same item code are one row (the store item takes one request), matched to a store item
    // with that IFMIS code and enough in store
    if (!isEdit && slip.lines.length > 0) {
      const groups: NonNullable<IssueRow['slip']>[] = [];
      for (const line of slip.lines) {
        const code = line.itemCode?.trim();
        const same = code ? groups.find((g) => g.itemCode === code) : undefined;
        if (same) {
          same.quantity = (same.quantity ?? 0) + (line.quantity ?? 0);
          same.lines += 1;
        } else groups.push({ itemCode: code, description: line.description, quantity: line.quantity, uom: line.uom, lines: 1 });
      }
      const taken = new Set<string>();
      let matched = 0;
      const next = groups.map((g) => {
        const candidates = availableItems.filter((i) => !taken.has(i.id) && i.ifmisItemCode?.trim() === g.itemCode);
        const pick = candidates.find((i) => unitsOf(i) >= (g.quantity ?? 1)) ?? candidates[0];
        if (pick) {
          taken.add(pick.id);
          matched += 1;
        }
        return newRow(pick?.id ?? '', g.quantity ?? (pick ? unitsOf(pick) : 0), g);
      });
      setRows(next);
      const combined = groups.filter((g) => g.lines > 1);
      filled.push(
        `${slip.lines.length} ${slip.lines.length === 1 ? 'line' : 'lines'} as ${next.length} ${next.length === 1 ? 'row' : 'rows'}` +
          (combined.length ? ` (lines with the same item code are combined: ${combined.map((g) => `${g.lines} × ${g.itemCode}`).join(', ')})` : ''),
      );
      const missing = next.length - matched;
      const notFound = missing > 0 ? ` ${missing} ${missing === 1 ? 'line is' : 'lines are'} not in store under ${missing === 1 ? 'its' : 'their'} item code: choose the store item, or remove the row.` : '';
      const more = slip.vouchers > 1 ? ` This PDF holds ${slip.vouchers} vouchers; only the first was read.` : '';
      setSlipNote({
        tone: missing > 0 || slip.vouchers > 1 ? 'warn' : 'info',
        text: `Filled in from the slip: ${filled.join(', ')}. Check them against the paper before submitting.${notFound}${more}`,
      });
    } else {
      setSlipNote({
        tone: 'info',
        text: filled.length ? `Filled in from the slip: ${filled.join(', ')}. Check them against the paper before submitting.` : 'The slip was read, but every field it covers is already filled in.',
      });
    }
    // The store man who signed, when he works in the items' store
    if (slip.issuedBy) {
      const found = keepers.findByName(slip.issuedBy);
      if (found) setIssuedById(found.keeper.employeeId);
    }
  };

  const takeSlip = (file: File) => {
    const error = validateSlipFile(file);
    if (error) {
      setFormError(error);
      toast.warning('Invalid Slip File', error);
      return;
    }
    setFormError(null);
    latestSlip.current = file;
    // A picture is a scan: only a PDF saved from IFMIS carries text to read
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return scanGiven(file, 'This is a photo or scan.');
    setSlipNote({ tone: 'info', text: 'Reading the slip…' });
    readPdfPages(file, MAX_SLIP_PAGES)
      .then(({ rows: pdfRows, pages, pagesRead }) => {
        if (latestSlip.current !== file) return;
        const text = rowsToText(pdfRows);
        if (!text.trim()) return scanGiven(file, 'This PDF is a scan (it has no text).');
        const other = isModel19(text)
          ? 'a Model 19 receipt. Read it from Receive items (Model 19)'
          : isModel21(text)
            ? 'a Model 21 transfer form. Read it from the transfer form of the asset'
            : isDisposalForm(text)
              ? 'a Fixed Asset Disposal Form (Model 22/B). Read it from the disposal form of the asset'
              : !isModel22(text)
                ? 'not an IFMIS Model 22'
                : undefined;
        if (other) {
          const message = `This is ${other}. The issue form takes only a Model 22, so it was not attached and nothing was filled in.`;
          setSlipNote({ tone: 'warn', text: message });
          toast.warning('Not a Model 22', message);
          return;
        }
        setIfmisFile(file);
        fillFromModel22(parseModel22(pdfRows));
        if (pages > pagesRead) toast.warning('Slip only partly read', `This slip has ${pages} pages; only the first ${pagesRead} were read.`);
      })
      .catch(() => {
        if (latestSlip.current !== file) return;
        setSlipNote({ tone: 'warn', text: "The PDF couldn't be read, so nothing was filled in. If it is the signed scan, attach it under Signed copy." });
      });
  };
  const fileChosen = (take: (file: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) take(file);
  };

  // Opened with an item whose details load late: show its units once known
  useEffect(() => {
    if (!isEdit && startItem && rows.length === 1 && rows[0].itemId === startItem.id && !rows[0].quantity) setRow(rows[0].key, { quantity: unitsOf(startItem) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startItem?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (missingFields.length > 0) {
      const msg = `Still needed: ${missingFields.join(', ')}.`;
      setFormError(msg);
      toast.warning('Not complete', msg);
      return;
    }
    setSubmitting(true);

    if (editApproval) {
      try {
        const slipUrl = signedFile ? (await api.uploadSlip(signedFile)).url : ifmisFile ? (await api.uploadSlip(ifmisFile)).url : undefined;
        const res = await api.updateStockOut(editApproval.id, {
          quantity: rows[0].quantity,
          issuedByEmployeeId: issuedById || undefined,
          ...recipientFields,
          ifmisSlipNumber: model22No.trim(),
          ifmisSlipDateGc: issuedDateGc,
          ifmisSlipAttachmentUrl: slipUrl,
          purpose: purpose.trim() || undefined,
          remark: remark.trim() || undefined,
        });
        toast.success('Issue request updated', `The request for ${editApproval.itemCode} was corrected. It is still waiting for Team Leader endorsement.`);
        onSuccess(res.approval);
      } catch (err: any) {
        setFormError(`Update failed: ${err.message || 'Server error'}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const recipient = employees.find((e) => e.id === recipientEmployeeId);
    const dept = departments.find((d) => d.id === destinationDepartmentId);
    const destination = isDisposal ? 'Disposal (write-off)' : isExternal ? organizationName.trim() : dept ? departmentLabel(dept) : destinationDepartmentId;
    const subInventory = firstItem?.subInventory || firstItem?.storeLocation?.roomNumber || '';

    try {
      const slipUrl = copyFile ? (await api.uploadSlip(copyFile)).url : undefined;
      const shared = {
        issuedByEmployeeId: issuerId || undefined,
        ...recipientFields,
        ifmisSlipNumber: model22No.trim(),
        ifmisSlipDateGc: issuedDateGc,
        ifmisSlipAttachmentUrl: slipUrl,
        purpose: purpose.trim() || undefined,
        registeredById: user?.id || '',
        transactionType,
        destination,
        transportationCost,
      };
      // One row is one request, as before; several rows of one Model 22 go together, all checked before any is saved
      const one = rows.length === 1;
      const single = one ? itemOf(rows[0])! : undefined;
      const result: any = one
        ? await api.registerStockOut({
            ...shared,
            itemId: rows[0].itemId,
            subInventory,
            quantity: rows[0].quantity,
            unitPrice: single?.unitCostETB || 0,
            totalAmount,
          })
        : await api.registerStockOut({ ...shared, itemId: rows[0].itemId, lines: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })) });

      const voucher: Model22Voucher = {
        approvalState: 'PENDING',
        model22No: model22No.trim(),
        issuedDateGc,
        issuedDateEc: ethDate,
        transactionType,
        destination,
        destinationDepartmentId: isDisposal || isExternal ? undefined : destinationDepartmentId,
        subInventory,
        issuedByName: issuerName || user?.fullNameEn || '—',
        receivedByName: isDisposal ? '—' : isExternal ? externalReceiverName(organizationName, contactPerson) : recipient?.fullNameEn || '—',
        receivedByEmployeeId: isDisposal || isExternal ? undefined : recipientEmployeeId,
        disposalReason: isDisposal ? purpose.trim() : undefined,
        items: rows.map((r, i) => {
          const item = itemOf(r)!;
          const unitPrice = item.unitCostETB || 0;
          return {
            sNo: i + 1,
            // The Item column of the IFMIS Model 22 is the IFMIS item code; older records without one show their own code
            itemCode: item.ifmisItemCode || item.itemCode,
            itemDescription: item.name,
            uom: uomOf(item),
            subInventory: item.subInventory || item.storeLocation?.roomNumber || '',
            itemCategory: item.itemCategoryDisplay || item.category?.replace(/_/g, ' ') || '',
            quantity: r.quantity,
            unitPrice,
            totalAmount: unitPrice * r.quantity,
            remark: '',
          };
        }),
        total: totalAmount,
        transportationCost,
        grandTotal,
        printedBy: user?.fullNameEn,
      };

      const count = rows.length;
      toast.success(
        isDisposal ? 'Model 22 Disposal Submitted' : 'Model 22 Issue Voucher Submitted',
        isDisposal
          ? `Disposal (${model22No.trim()}) registered for approval. The units leave the register once it is approved.`
          : `Receipt for Articles Or Property Issued (${model22No.trim()}${count > 1 ? `, ${count} items` : ''}) to ${isExternal ? organizationName.trim() : recipient?.fullNameEn || 'staff'} registered for approval.`
      );
      // A disposal is never carried over to the next issue
      rememberForm(user?.id, 'issue', transactionType !== DISPOSAL_TRANSACTION_TYPE ? { transactionType } : {});
      onSuccess(result?.approval ?? result, voucher);
    } catch (err: any) {
      setFormError(`The issue request could not be saved: ${err.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (opts?: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean }) => inputClass('emerald', opts);
  const optionsFor = (row: IssueRow) => [
    {
      label: 'In store',
      options: availableItems
        // An item on another row is not offered again
        .filter((item) => item.id === row.itemId || !rows.some((r) => r.itemId === item.id))
        .map((item) => ({
          value: item.id,
          label: `${item.itemCode} — ${item.name}`,
          note: `${unitsOf(item)} ${uomOf(item)} in store · ${formatETB(item.unitCostETB)} each${item.ifmisItemCode ? ` · ${item.ifmisItemCode}` : ''}`,
        })),
    },
  ];

  return (
    <form id="stock-out-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(missingFields.length === 0 && !submitting)} className="space-y-6">
      <FormError message={formError} />

      {/* The Model 22 PDF first: it fills in most of what follows */}
      {!isEdit && (
        <div className="space-y-2">
          <FileDropField
            label="IFMIS Model 22 PDF"
            accent="emerald"
            required={false}
            fileName={ifmisFile?.name ?? ''}
            accept={SLIP_ACCEPT_ATTR}
            onChange={fileChosen(takeSlip)}
            file={ifmisFile}
            emptyText="Click to choose the Model 22 PDF saved from IFMIS"
            hint="The form fills itself in from it. The signed, scanned copy goes under Recipient and signatures."
          />
          {slipNote && (
            <FormNotice icon={FileText} tone={slipNote.tone}>
              <span role="status">{slipNote.text}</span>
            </FormNotice>
          )}
        </div>
      )}

      <Part title="Voucher">
        <FieldGrid>
          <Field label="Model 22 No." required htmlFor="stock-out-model22" error={fieldErrors.error('model22No')} warning={usedNo ? usedMessage(model22No, usedNo) : undefined}>
            <input
              id="stock-out-model22"
              type="text"
              required
              placeholder="e.g. 0004653/A Inventory"
              value={model22No}
              onChange={(e) => setModel22No(e.target.value)}
              onBlur={fieldErrors.touch('model22No')}
              autoFocus={!isEdit}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model22No') })} font-semibold`}
            />
          </Field>

          <Field label="Issued date (G.C.)" required hint={`${ethDate} E.C.`} htmlFor="stock-out-date">
            <input id="stock-out-date" type="date" required value={issuedDateGc} onChange={(e) => setIssuedDateGc(e.target.value)} className={input()} />
          </Field>

          {!isEdit && !isDisposal && (
            <Field label="Transaction type" required htmlFor="stock-out-transaction-type">
              <select id="stock-out-transaction-type" required value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
                <option value="" disabled>Select…</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          )}
        </FieldGrid>

        {/* The same Model 22, used to write units off instead of handing them to someone; the disposal form stays for sales and donations */}
        {(!isEdit || isDisposal) && (
        <label
          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition ${
            isDisposal ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
          } ${isEdit ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <input
            id="stock-out-disposal"
            type="checkbox"
            checked={isDisposal}
            disabled={isEdit}
            onChange={(e) => setTransactionType(e.target.checked ? DISPOSAL_TRANSACTION_TYPE : issueType.current)}
            className="mt-0.5 h-4 w-4 accent-rose-700"
          />
          <span>
            <span className="block font-semibold text-slate-800">Use this Model 22 to dispose of the items (write-off)</span>
            <span className="block text-[11px] text-slate-500">
              No recipient: give the reason instead. When approved, the units leave the register as Disposed, and the voucher prints as a disposal.
              {' '}Use the <span className="font-medium">Dispose</span> action instead for a sale or donation that needs the Fixed Asset Disposal Form.
            </span>
          </span>
        </label>
        )}
      </Part>

      <Part title={rows.length > 1 ? `Items (${rows.length})` : 'Items'} aside={<span className="text-[11px] text-slate-500">From one store. Unit and price are as received on Model 19.</span>}>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2 min-w-[260px]">Store item</th>
                  <th className="px-2 py-2 w-16">Unit</th>
                  <th className="px-2 py-2 w-24 text-right">In store</th>
                  <th className="px-2 py-2 w-24 text-right">Qty</th>
                  <th className="px-2 py-2 w-28 text-right">Unit price</th>
                  <th className="px-2 py-2 w-28 text-right">Total</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const n = i + 1;
                  const item = itemOf(row);
                  const inStore = unitsOf(item);
                  const qtyId = n === 1 ? 'issue-quantity' : `issue-quantity-${n}`;
                  const itemId = n === 1 ? 'stock-out-item' : `stock-out-item-${n}`;
                  const overStock = !!item && row.quantity > inStore;
                  return (
                    <tr key={row.key} className="align-top">
                      <td className="px-2 py-1.5 pt-3.5 font-mono text-slate-500">{n}</td>
                      <td className="px-2 py-1.5">
                        {isEdit ? (
                          <p className="pt-2 text-slate-800">
                            <span className="font-mono font-semibold">{editApproval?.itemCode}</span> — {editApproval?.itemName}
                            <span className="block text-[10px] text-slate-500">The item can't be changed. To issue a different item, ask an approver to reject this request.</span>
                          </p>
                        ) : (
                          <>
                            <label htmlFor={itemId} className="sr-only">{n === 1 ? 'Store item' : `Item ${n} store item`}</label>
                            <SearchableSelect
                              id={itemId}
                              value={row.itemId}
                              onChange={(id) => chooseItem(row.key, id)}
                              placeholder={availableItems.length === 0 ? 'No items available in store' : 'Select an item…'}
                              searchPlaceholder="Search by name, code or IFMIS code…"
                              groups={optionsFor(row)}
                            />
                            {row.slip && (
                              <p className={`mt-0.5 text-[10px] ${item ? 'text-slate-500' : 'text-rose-700'}`}>
                                {item ? 'On the slip: ' : 'Not in store under this code: '}
                                <span className="font-mono">{row.slip.itemCode}</span> {row.slip.description}
                                {row.slip.quantity ? ` · ${row.slip.quantity} ${row.slip.uom ?? ''}` : ''}
                                {row.slip.lines > 1 ? ` (${row.slip.lines} lines combined)` : ''}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 font-mono text-slate-700">{item ? uomOf(item) : '—'}</td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? `${inStore} ${uomOf(item)} in store` : '—'}</td>
                      <td className="px-2 py-1.5">
                        <label htmlFor={qtyId} className="sr-only">{n === 1 ? 'Quantity to issue' : `Item ${n} quantity`}</label>
                        <QuantityInput id={qtyId} min={1} max={item ? inStore : undefined} required value={row.quantity} onChange={(q) => setRow(row.key, { quantity: q })} className={cellClass({ align: 'right', mono: true, invalid: overStock })} />
                        {overStock && <p className="mt-0.5 text-right text-[10px] text-rose-700">Only {inStore} {uomOf(item)} in store</p>}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? money(item.unitCostETB || 0) : '—'}</td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? money((item.unitCostETB || 0) * (row.quantity || 0)) : '—'}</td>
                      <td className="px-1 py-1.5 pt-3">
                        {!isEdit && rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                            aria-label={`Remove item ${n}`}
                            title="Don't issue this line"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-3 py-2">
            {!isEdit ? (
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, newRow()])}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span>Total <span className="ml-1 font-mono font-semibold tabular-nums text-slate-900">{money(totalAmount)}</span></span>
              {!isEdit && (
                <label className="inline-flex items-center gap-1.5">
                  Transport cost
                  <span className="w-28">
                    <MoneyInput aria-label="Transport cost (ETB)" suffix="" value={transportationCost} onChange={setTransportationCost} inputClassName="!h-8 !px-2 !text-xs" />
                  </span>
                </label>
              )}
              <span>Grand total <span className="ml-1 font-mono text-sm font-semibold tabular-nums text-slate-900">{money(grandTotal)} ETB</span></span>
            </div>
          </div>
        </div>
        {mixedStores && <p role="alert" className="text-[11px] font-medium text-rose-700">These items are in different stores. One Model 22 issues from one store: issue each store's items on its own.</p>}
      </Part>

      <Part title={isDisposal ? 'Reason and signatures' : 'Recipient and signatures'}>
        <FieldGrid cols={2}>
          {!isDisposal && (
            <>
              <Field
                label="Received by"
                required
                htmlFor="stock-out-recipient"
                hint="An employee, or an outside organization. Type to search; a new organization can be added from here."
              >
                <SearchableSelect
                  id="stock-out-recipient"
                  value={recipientValue}
                  onChange={chooseRecipient}
                  placeholder="Select an employee or organization…"
                  searchPlaceholder="Search a name, employee ID or organization…"
                  groups={[
                    { label: 'Employees', options: employees.map((emp) => ({ value: `emp:${emp.id}`, label: `${emp.fullNameEn} (${emp.payrollId})` })) },
                    {
                      label: 'Organizations',
                      options: [
                        ...organizations.map((o) => ({ value: `org:${o.id}`, label: o.name, note: [o.shortName, o.contactPerson && `contact: ${o.contactPerson}`].filter(Boolean).join(' · ') || undefined })),
                        // An older issue's organization that is not in the list
                        ...(isExternal && !organizationId && organizationName ? [{ value: 'org:typed', label: organizationName, note: 'not in the list' }] : []),
                      ],
                    },
                  ]}
                  onCreate={addOrganization}
                  createLabel={(name) => `Add "${name}" as an organization`}
                />
                {suggestedOrganization && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-amber-800">
                    The slip names “{suggestedOrganization}”, who is not an employee.
                    <button type="button" onClick={() => addOrganization(suggestedOrganization)} className="font-semibold text-emerald-800 underline underline-offset-2 cursor-pointer">
                      Add as an organization
                    </button>
                  </p>
                )}
              </Field>

              {isExternal ? (
                <Field label="Contact person" optional htmlFor="stock-out-contact" hint="The person who signs for the organization.">
                  <input
                    id="stock-out-contact"
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Mantegbosh Mirku"
                    className={input()}
                  />
                </Field>
              ) : (
                <Field label="Destination directorate" required htmlFor="stock-out-directorate">
                  <select id="stock-out-directorate" value={destinationDepartmentId} onChange={(e) => setDestinationDepartmentId(e.target.value)} className={input()} required>
                    <option value="" disabled>Select…</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{departmentLabel(dept)}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          {/* Only a disposal asks why; an issue has no purpose field, as on the IFMIS Model 22 */}
          {isDisposal && (
            <Field label="Reason for disposal" required htmlFor="stock-out-purpose" error={fieldErrors.error('purpose')}>
              <input
                id="stock-out-purpose"
                type="text"
                required
                placeholder="e.g. Expired, damaged beyond repair, used up"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                onBlur={fieldErrors.touch('purpose')}
                className={input({ invalid: !!fieldErrors.error('purpose') })}
              />
            </Field>
          )}

          <StoreManField
            id="stock-out-issued-by"
            label="Issued by (store man)"
            keepers={storeMen}
            ready={keepers.ready}
            storeName={keepers.storeName(firstItem?.storeLocation?.storeId)}
            hasStore={!!firstItem}
            value={issuedById}
            onChange={setIssuedById}
            current={isEdit ? editApproval?.requestDetails?.issuedByName : undefined}
            required={!isEdit}
          />
        </FieldGrid>

        <FileDropField
          label="Signed copy"
          accent="emerald"
          required={isAttachmentReq}
          fileName={signedFileName}
          accept={SLIP_ACCEPT_ATTR}
          onChange={fileChosen(takeSigned)}
          file={signedFile}
          savedUrl={editApproval?.ifmisSlipAttachmentUrl}
          emptyText="Click to attach the signed Model 22, scanned"
          hint={`The IFMIS printout with its signatures, as a scan or photo (PDF, PNG, JPEG or WEBP, up to 10 MB).${isAttachmentReq ? '' : ' Until it is added, the IFMIS PDF is kept as the copy.'}`}
        />
      </Part>

      {/* The slip itself, open under the form, to check what was filled in against it */}
      <SlipPreview ifmisFile={ifmisFile} signedFile={signedFile} savedUrl={editApproval?.ifmisSlipAttachmentUrl} />

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={
          isEdit
            ? 'Save changes'
            : isDisposal
              ? rows.length > 1 ? `Submit disposal of ${rows.length} items for approval` : 'Submit disposal for approval'
              : rows.length > 1 ? `Submit ${rows.length} items for approval` : 'Submit for approval'
        }
        missingFields={missingFields}
        fieldTargets={{ 'signed copy': 'section[aria-label$="and signatures"] input[type="file"]', 'items from one store': '#stock-out-item' }}
        onCancel={onCancel}
        onReset={isEdit ? undefined : handleReset}
      />
    </form>
  );
};

/** Model 22 voucher for an issue request, from the request and its item */
export const buildModel22Voucher = (
  approval: TransactionApproval,
  context: { item?: ItemWithRelations; departments: Department[]; employees: Employee[]; printedBy?: string },
): Model22Voucher => {
  const { item: itemDetails, departments, employees } = context;
  const details = approval.requestDetails ?? {};
  const targetDept = departments.find((d) => d.id === approval.targetDepartmentId);
  const recipient = employees.find((e) => e.id === approval.recipientEmployeeId) || approval.recipientEmployee;
  // Issued to an outside organization: it, and the person who signs for it, take the place of the directorate and employee
  const outside = details.recipientType === 'EXTERNAL' ? details.organizationName : undefined;
  const requester = employees.find((e) => e.id === approval.requestedById) || approval.requestedBy;
  const issuedDateGc = approval.ifmisSlipDateGc || (approval.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0]);
  const unitPrice = itemDetails?.unitCostETB || 0;
  const qty = Number(details.quantity) || Number(itemDetails?.quantity) || 1;
  const totalAmount = unitPrice * qty;
  const transportationCost = Number(details.transportationCost) || 0;
  const subInventory = itemDetails?.subInventory || itemDetails?.storeLocation?.roomNumber || '—';

  return {
    approvalState: approval.status === 'PENDING' ? 'PENDING' : approval.status === 'REJECTED' ? 'REJECTED' : undefined,
    model22No: approval.ifmisSlipNumber || '',
    issuedDateGc,
    issuedDateEc: approval.ifmisSlipDateEc || approval.createdAtEc || formatGcToEc(issuedDateGc),
    // As recorded with the request; older requests were all move orders
    transactionType: details.disposal ? 'Disposal' : details.transactionType || 'Move Order Issue',
    disposalReason: details.disposal ? splitPurposeAndRemark(approval.purposeOrRemarks ?? '').purpose : undefined,
    destination: details.disposal ? 'Disposal (write-off)' : outside || (targetDept ? departmentLabel(targetDept) : '—'),
    destinationDepartmentId: approval.targetDepartmentId,
    subInventory,
    issuedByName: details.issuedByName || requester?.fullNameEn || '—',
    receivedByName: outside ? externalReceiverName(outside, details.contactPerson) : recipient?.fullNameEn || '—',
    receivedByEmployeeId: approval.recipientEmployeeId,
    items: [
      {
        sNo: 1,
        itemCode: itemDetails?.ifmisItemCode || approval.itemCode,
        itemDescription: approval.itemName,
        uom: itemDetails?.uom || 'EA',
        subInventory,
        itemCategory: itemDetails?.itemCategoryDisplay || (itemDetails?.category as string) || '—',
        quantity: qty,
        unitPrice,
        totalAmount,
        // The purpose isn't on the IFMIS Model 22, so the Remark column stays empty as there
        remark: '',
      },
    ],
    total: totalAmount,
    transportationCost,
    grandTotal: totalAmount + transportationCost,
    printedBy: context.printedBy,
  };
};
