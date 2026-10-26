import { getEndorserSignatory, getAuthorizerSignatory } from '../../utils/approver-signatures';
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
import { costOf } from '../../utils/item-cost';
import { departmentLabel, isUnassignedDepartment } from '../../utils/department';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useSystemSettings } from '../../utils/system-settings';
import { validateSlipFile, SLIP_PDF_ACCEPT_ATTR, SLIP_ACCEPT_ATTR, getSlipDisplayName, SCAN_HINT } from '../../utils/slip-upload';
import { readPdfPages, rowsToText, isModel19, isModel21, isModel22, isDisposalForm, parseModel22, Model22SlipFields, withoutAmounts } from '../../utils/slip-reader';
import { Part, SlipPreview } from './FormParts';
import { cellClass, money } from './SlipLines';
import { categoryLabel } from './asset-state';
import { approvalNoteOf } from '../../utils/approval-note';

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
  /** Several items chosen before the form opened (the items of a Model 19 still in store), one row each */
  initialItemIds?: string[];
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
  slip?: { itemCode?: string; description?: string; quantity?: number; uom?: string; lines: number; receipts?: number };
}
let rowKey = 0;
const newRow = (itemId = '', quantity = 0, slip?: IssueRow['slip']): IssueRow => ({ key: ++rowKey, itemId, quantity, slip });

/** Units that can be issued from a record: all in store; issues still waiting for approval hold none */
const unitsOf = (item?: ItemWithRelations) => Number(item?.quantity) || 1;
/** "50 EA in store", and "· 30 on issues waiting for approval" when other requests ask for some */
const stockText = (item: ItemWithRelations) =>
  `${unitsOf(item)} ${uomOf(item)} in store` +
  (item.unitsOnPendingIssues ? ` · ${item.unitsOnPendingIssues} on issues waiting for approval` : '');
/** When a store record was received, to issue the oldest stock first */
const receivedOn = (item: ItemWithRelations) => item.ifmisSlipDateGc || String(item.createdAtGc ?? '');
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
  initialItemIds,
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
  const startItems = (initialItemIds ?? []).map((id) => availableItems.find((i) => i.id === id)).filter(Boolean) as ItemWithRelations[];
  const [rows, setRows] = useState<IssueRow[]>(() =>
    isEdit
      ? [newRow(editItem?.id ?? '', Number(editApproval?.requestDetails?.quantity) || unitsOf(editItem))]
      // Opened from a Model 19: each of its items in store, all of it; rows not issued are removed, fewer typed
      : startItems.length > 0
        ? startItems.map((item) => newRow(item.id, unitsOf(item)))
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
  // A disposal specifies its reason and optionally who it was sold / transferred / donated to; an issue has no purpose (a correction keeps an older one)
  const isDisposal = isEdit ? editApproval?.requestDetails?.disposal === true : transactionType === DISPOSAL_TRANSACTION_TYPE;
  const isExternal = !isDisposal && recipientType === 'EXTERNAL';
  const [disposalRecipient, setDisposalRecipient] = useState<string>(
    editApproval?.requestDetails?.recipientName || (editApproval?.requestDetails?.disposal ? editApproval?.requestDetails?.organizationName : '') || ''
  );
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
  const { slipAttachmentPolicy, showScannedSlipField } = useSystemSettings();
  const isAttachmentReq = slipAttachmentPolicy === 'REQUIRED';

  // Each unit at what it cost, VAT and charges in, as IFMIS issues it
  const totalAmount = Math.round(rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * costOf(itemOf(r)), 0) * 100) / 100;
  const grandTotal = totalAmount + transportationCost;
  const ethDate = formatGcToEc(issuedDateGc);
  const usedNo = slips.findUsed(model22No, ['STOCK_OUT'], editApproval?.id);

  // What each row still needs; the same store item may be on one row only
  const rowMissing = (row: IssueRow, n: number): string | false => {
    const item = itemOf(row);
    if (!item) return `item ${n} (store item)`;
    if (rows.some((r) => r.key !== row.key && r.itemId === row.itemId && rows.indexOf(r) < rows.indexOf(row))) return `item ${n} (already on another row)`;
    const inStore = unitsOf(item);
    if (!(Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= inStore)) return rows.length === 1 ? 'quantity' : `item ${n} (quantity)`;
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
    isAttachmentReq && (showScannedSlipField ? !signedFileName : !(ifmisFile || signedFileName || editApproval?.ifmisSlipAttachmentUrl)) && (showScannedSlipField ? 'signed copy' : 'IFMIS Model 22 PDF'),
  ].filter(Boolean) as string[];

  // A field shows what is wrong with it once the user has been in it
  const fieldErrors = useFieldErrors({});

  const recipientFields = isDisposal
    ? { disposal: true as const, ...(disposalRecipient.trim() ? { recipientName: disposalRecipient.trim() } : {}) }
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
    setDisposalRecipient('');
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
    setSlipNote({
      tone: 'info',
      text: `${what} It is attached ${showScannedSlipField ? 'below as the signed copy' : 'to the request as its copy'}. Nothing was read from it; what was filled in stays. ${SCAN_HINT}`,
    });
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
    } else if (isDisposal) {
      if (slip.receivedBy && !disposalRecipient.trim()) {
        setDisposalRecipient(slip.receivedBy);
        filled.push('sold / transferred / donated to');
      } else if (slip.destination && !['disposal', 'write-off', 'disposal (write-off)'].includes(slip.destination.toLowerCase()) && !disposalRecipient.trim()) {
        setDisposalRecipient(slip.destination);
        filled.push('sold / transferred / donated to');
      }
    }
    const destination = slip.destination?.trim().toLowerCase();
    const dept = destination ? departments.find((d) => [d.nameEn, departmentLabel(d)].some((n) => n?.toLowerCase() === destination)) : undefined;
    if (dept && !receiver && !isDisposal) {
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
      let notInStore = 0;
      const short: string[] = [];
      const spread: string[] = [];
      const next: IssueRow[] = [];
      for (const g of groups) {
        // The same item received on several Model 19s is several store records: the oldest is issued first
        const candidates = availableItems
          .filter((i) => !taken.has(i.id) && !!g.itemCode && i.ifmisItemCode?.trim() === g.itemCode)
          .sort((a, b) => receivedOn(a).localeCompare(receivedOn(b)) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
        if (candidates.length === 0) {
          notInStore += 1;
          next.push(newRow('', g.quantity ?? 0, g));
          continue;
        }
        let need = g.quantity ?? unitsOf(candidates[0]);
        const parts: { item: ItemWithRelations; quantity: number }[] = [];
        for (const c of candidates) {
          if (need <= 0) break;
          const quantity = Math.min(need, unitsOf(c));
          parts.push({ item: c, quantity });
          need -= quantity;
        }
        // More on the slip than in store: the rest stays on the last row, which then shows it is short
        if (need > 0) {
          parts[parts.length - 1].quantity += need;
          short.push(`${g.itemCode} ${g.description ?? ''}: the slip issues ${g.quantity}, only ${(g.quantity ?? 0) - need} in store`.replace(/\s+:/, ':'));
        }
        if (parts.length > 1) spread.push(`${g.itemCode} from ${parts.length} receipts (oldest first)`);
        for (const p of parts) {
          taken.add(p.item.id);
          next.push(newRow(p.item.id, p.quantity, { ...g, receipts: parts.length }));
        }
      }
      setRows(next);
      const combined = groups.filter((g) => g.lines > 1);
      filled.push(
        `${slip.lines.length} ${slip.lines.length === 1 ? 'line' : 'lines'} as ${next.length} ${next.length === 1 ? 'row' : 'rows'}` +
          (combined.length ? ` (lines with the same item code are combined: ${combined.map((g) => `${g.lines} × ${g.itemCode}`).join(', ')})` : ''),
      );
      const missing = notInStore;
      const notFound = missing > 0 ? ` ${missing} ${missing === 1 ? 'line is' : 'lines are'} not in store under ${missing === 1 ? 'its' : 'their'} item code: choose the store item, or remove the row.` : '';
      const spreadNote = spread.length ? ` Taken from more than one receipt: ${spread.join('; ')}.` : '';
      const shortNote = short.length ? ` Not enough in store: ${short.join('; ')}.` : '';
      const more = slip.vouchers > 1 ? ` This PDF holds ${slip.vouchers} vouchers; only the first was read.` : '';
      setSlipNote({
        tone: missing > 0 || short.length > 0 || slip.vouchers > 1 ? 'warn' : 'info',
        text: `Filled in from the slip: ${filled.join(', ')}. Check them against the paper before submitting.${spreadNote}${shortNote}${notFound}${more}`,
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
        fillFromModel22(withoutAmounts.model22(parseModel22(pdfRows)));
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
    const over = rows
      .map((r, i) => ({ r, n: i + 1, it: itemOf(r) }))
      .filter(({ r, it }) => !!it && Number(r.quantity) > unitsOf(it));
    if (over.length > 0) {
      const which = over.map(({ n, it }) => `item ${n}: only ${stockText(it!)}`).join('; ');
      const message = `More than is in store (${which}). Lower the quantity, or add the rest from another receipt of the same item.`;
      setFormError(message);
      toast.warning('Not enough in store', message);
      return;
    }
    const effectiveModel22No = model22No.trim() || `PENDING-ISSUE-${Date.now()}`;
    const effectiveIssuedDate = issuedDateGc || today;
    const effectiveTransactionType = transactionType || DEFAULT_TRANSACTION_TYPE;
    const effectiveRecipientFields = isDisposal
      ? {
          disposal: true as const,
          ...(disposalRecipient.trim() ? { recipientName: disposalRecipient.trim() } : {}),
        }
      : isExternal
      ? {
          recipientType: 'EXTERNAL' as const,
          ...(organizationId ? { organizationId } : {}),
          organizationName: organizationName.trim() || 'Pending Organization',
          contactPerson: contactPerson.trim() || undefined,
        }
      : {
          recipientType: 'INTERNAL' as const,
          recipientEmployeeId: recipientEmployeeId || undefined,
          targetDepartmentId: destinationDepartmentId || undefined,
        };
    const effectiveRows = rows.map((r) => {
      const q = Number(r.quantity);
      return {
        ...r,
        quantity: Number.isFinite(q) && q > 0 ? q : 1,
      };
    });
    setSubmitting(true);

    if (editApproval) {
      try {
        const slipUrl = signedFile ? (await api.uploadSlip(signedFile)).url : ifmisFile ? (await api.uploadSlip(ifmisFile)).url : undefined;
        const res = await api.updateStockOut(editApproval.id, {
          quantity: effectiveRows[0]?.quantity || 1,
          issuedByEmployeeId: issuedById || undefined,
          ...effectiveRecipientFields,
          ifmisSlipNumber: effectiveModel22No,
          ifmisSlipDateGc: effectiveIssuedDate,
          ifmisSlipAttachmentUrl: slipUrl,
          purpose: purpose.trim() || undefined,
          remark: remark.trim() || undefined,
        });
        toast.success('Issue request updated', `The request for ${editApproval.itemCode} was corrected. ${editApproval.status === 'REJECTED' ? 'It went back to the Team Leader for approval.' : 'It is still waiting for Team Leader endorsement.'}`);
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
    const destination = isDisposal
      ? disposalRecipient.trim()
        ? `Disposal: to ${disposalRecipient.trim()}`
        : 'Disposal (write-off)'
      : isExternal
      ? organizationName.trim()
      : dept
      ? departmentLabel(dept)
      : destinationDepartmentId;
    const subInventory = firstItem?.subInventory || firstItem?.storeLocation?.roomNumber || '';

    try {
      const slipUrl = copyFile ? (await api.uploadSlip(copyFile)).url : undefined;
      const shared = {
        issuedByEmployeeId: issuerId || undefined,
        ...effectiveRecipientFields,
        ifmisSlipNumber: effectiveModel22No,
        ifmisSlipDateGc: effectiveIssuedDate,
        ifmisSlipAttachmentUrl: slipUrl,
        purpose: purpose.trim() || undefined,
        registeredById: user?.id || '',
        transactionType: effectiveTransactionType,
        destination,
        transportationCost,
      };
      // One row is one request, as before; several rows of one Model 22 go together, all checked before any is saved
      const one = rows.length === 1;
      const single = one ? itemOf(rows[0])! : undefined;
      const result: any = one
        ? await api.registerStockOut({
            ...shared,
            itemId: effectiveRows[0].itemId,
            subInventory,
            quantity: effectiveRows[0].quantity,
            unitPrice: costOf(single),
            totalAmount,
          })
        : await api.registerStockOut({ ...shared, itemId: rows[0].itemId, lines: effectiveRows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })) });

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
        receivedByName: isDisposal
          ? (disposalRecipient.trim() || '—')
          : isExternal
          ? externalReceiverName(organizationName, contactPerson)
          : recipient?.fullNameEn || '—',
        receivedByEmployeeId: isDisposal || isExternal ? undefined : recipientEmployeeId,
        disposalReason: isDisposal ? purpose.trim() : undefined,
        items: rows.map((r, i) => {
          const item = itemOf(r)!;
          const unitPrice = costOf(item);
          return {
            sNo: i + 1,
            // The Item column of the IFMIS Model 22 is the IFMIS item code; older records without one show their own code
            itemCode: item.ifmisItemCode || item.itemCode,
            itemDescription: item.name,
            uom: uomOf(item),
            subInventory: item.subInventory || item.storeLocation?.roomNumber || '',
            itemCategory: categoryLabel(item),
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
          ? `Disposal (${model22No.trim()}${disposalRecipient.trim() ? ` to ${disposalRecipient.trim()}` : ''}) registered for approval. The units leave the register once it is approved.`
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
          note: `${stockText(item)} · ${formatETB(costOf(item))} each${item.ifmisItemCode ? ` · ${item.ifmisItemCode}` : ''}${item.ifmisSlipNumber ? ` · Model 19 ${item.ifmisSlipNumber}` : ''}`,
        })),
    },
  ];

  return (
    <form id="stock-out-form" onSubmit={handleSubmit} onKeyDown={submitOnCtrlEnter(!submitting)} className="space-y-6">

      <FormError message={formError} />

      {/* The Model 22 PDF: it fills in most of what follows and acts as the attached slip */}
      {(!isEdit || !showScannedSlipField) && (
        <div className="space-y-2">
          <FileDropField
            label="IFMIS Model 22 PDF"
            accent="emerald"
            required={false}
            fileName={ifmisFile?.name ?? (!showScannedSlipField && editApproval?.ifmisSlipAttachmentUrl ? getSlipDisplayName(editApproval.ifmisSlipAttachmentUrl) : '')}
            accept={SLIP_ACCEPT_ATTR}
            onChange={fileChosen(takeSlip)}
            file={ifmisFile}
            savedUrl={!showScannedSlipField ? editApproval?.ifmisSlipAttachmentUrl : undefined}
            emptyText="Click to choose the Model 22 PDF saved from IFMIS, or a photo"
            hint={
              showScannedSlipField
                ? 'The form fills itself in from it. The signed, scanned copy goes under Recipient and signatures.'
                : 'The form fills itself in from it and attaches this PDF directly to the issue request.'
            }
          />
          {slipNote && (
            <FormNotice icon={FileText} tone={slipNote.tone}>
              <span role="status">{slipNote.text}</span>
            </FormNotice>
          )}
        </div>
      )}

      {/* The same Model 22 can write units off instead of handing them to someone; the disposal form stays for sales and donations */}
      <Part
        title="Voucher"
        aside={
          !isEdit || isDisposal ? (
            <label
              title="Record as a disposal on this Model 22: writes the items off, or records who they were sold, transferred, or donated to."
              className={`inline-flex items-center gap-2 text-xs font-medium ${isDisposal ? 'text-rose-800' : 'text-slate-700'} ${isEdit ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <input
                id="stock-out-disposal"
                type="checkbox"
                checked={isDisposal}
                disabled={isEdit}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setTransactionType(checked ? DISPOSAL_TRANSACTION_TYPE : issueType.current);
                  if (checked && !disposalRecipient.trim() && organizationName.trim()) {
                    setDisposalRecipient(organizationName.trim());
                  }
                }}
                className="h-4 w-4 accent-rose-700"
              />
              Mark as disposal
            </label>
          ) : undefined
        }
      >
        <FieldGrid>
          <Field label="Model 22 No." optional htmlFor="stock-out-model22" error={fieldErrors.error('model22No')} warning={usedNo ? usedMessage(model22No, usedNo) : undefined}>
            <input
              id="stock-out-model22"
              type="text"
              placeholder="e.g. 0004653/A Inventory"
              value={model22No}
              onChange={(e) => setModel22No(e.target.value)}
              onBlur={fieldErrors.touch('model22No')}
              autoFocus={!isEdit}
              className={`${input({ mono: true, invalid: !!fieldErrors.error('model22No') })} font-semibold`}
            />
          </Field>

          <Field label="Issued date (G.C.)" optional hint={`${ethDate} E.C.`} htmlFor="stock-out-date">
            <input id="stock-out-date" type="date" value={issuedDateGc} onChange={(e) => setIssuedDateGc(e.target.value)} className={input()} />
          </Field>

          {!isEdit && !isDisposal && (
            <Field label="Transaction type" optional htmlFor="stock-out-transaction-type">
              <select id="stock-out-transaction-type" value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className={input()}>
                <option value="" disabled>Select…</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          )}
        </FieldGrid>

      </Part>

      <Part title={rows.length > 1 ? `Items (${rows.length})` : 'Items'} aside={<span className="text-[11px] text-slate-500">From one store. Unit price is what a unit cost on its Model 19, VAT and charges included, as IFMIS issues it.</span>}>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr className="text-xs font-medium text-slate-600">
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
                                {item && (row.slip.receipts ?? 1) > 1 ? ` · part from Model 19 ${item.ifmisSlipNumber || item.itemCode}` : ''}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 font-mono text-slate-700">{item ? uomOf(item) : '—'}</td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? `${inStore} ${uomOf(item)} in store` : '—'}</td>
                      <td className="px-2 py-1.5">
                        <label htmlFor={qtyId} className="sr-only">{n === 1 ? 'Quantity to issue' : `Item ${n} quantity`}</label>
                        <QuantityInput
                          id={qtyId}
                          min={0.0001}
                          max={item ? inStore : undefined}
                          availableInStore={item ? inStore : undefined}
                          uom={item ? uomOf(item) : undefined}
                          value={row.quantity}
                          onChange={(q) => setRow(row.key, { quantity: q })}
                          className={cellClass({ align: 'right', mono: true, invalid: overStock })}
                        />
                      </td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? money(costOf(item)) : '—'}</td>
                      <td className="px-2 py-1.5 pt-3.5 text-right font-mono tabular-nums text-slate-700">{item ? money(Math.round(costOf(item) * (row.quantity || 0) * 100) / 100) : '—'}</td>
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
              {/* One row in the table's columns: the transport cost field under the Qty field, the grand total under Total */}
              <tfoot className="border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600">
                <tr className="align-middle">
                  <td colSpan={isEdit ? 5 : 3} className="px-2 py-1.5">
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => setRows((rs) => [...rs, newRow()])}
                        className="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add item
                      </button>
                    )}
                  </td>
                  {!isEdit && (
                    <>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <label htmlFor="issue-transport-cost">Transport cost</label>
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput id="issue-transport-cost" aria-label="Transport cost (ETB)" suffix="" value={transportationCost} onChange={setTransportationCost} inputClassName="!px-2.5" />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">Grand total</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="block font-mono text-sm font-semibold tabular-nums text-slate-900">{formatETB(grandTotal)}</span>
                    {transportationCost > 0 && (
                      <span className="block text-[11px] text-slate-500">
                        items {money(totalAmount)} + transport {money(transportationCost)}
                      </span>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
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
                <Field
                  label="Destination directorate"
                  optional
                  htmlFor="stock-out-directorate"
                  warning={
                    isUnassignedDepartment(departments.find((d) => d.id === destinationDepartmentId))
                      ? 'Directorate is unassigned. Go to Settings → Employees to assign their directorate.'
                      : undefined
                  }
                >
                  <select id="stock-out-directorate" value={destinationDepartmentId} onChange={(e) => setDestinationDepartmentId(e.target.value)} className={input()}>
                    <option value="" disabled>Select…</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{departmentLabel(dept)}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          {/* A disposal can be written off, sold, transferred, or donated */}
          {isDisposal && (
            <>
              <Field
                label="Sold / transferred / donated to"
                optional
                htmlFor="stock-out-disposal-recipient"
                hint="The body or person it goes to, as on the form (e.g. buyer, receiving office, or donation beneficiary)"
              >
                <input
                  id="stock-out-disposal-recipient"
                  type="text"
                  list="stock-out-disposal-organizations"
                  placeholder="e.g. East Shawa Zone Agriculture Office / Umer Ahmed"
                  value={disposalRecipient}
                  onChange={(e) => setDisposalRecipient(e.target.value)}
                  className={input()}
                />
                <datalist id="stock-out-disposal-organizations">
                  {organizations.map((org) => (
                    <option key={org.id} value={org.name} />
                  ))}
                </datalist>
              </Field>

              <Field label="Reason for disposal" optional htmlFor="stock-out-purpose" error={fieldErrors.error('purpose')}>
                <input
                  id="stock-out-purpose"
                  type="text"
                  placeholder="e.g. Expired, damaged beyond repair, used up"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  onBlur={fieldErrors.touch('purpose')}
                  className={input({ invalid: !!fieldErrors.error('purpose') })}
                />
              </Field>
            </>
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
            required={false}
          />
        </FieldGrid>

        {showScannedSlipField && (
          <FileDropField
            label="Signed copy"
            accent="emerald"
            required={false}
            fileName={signedFileName}
            accept={SLIP_ACCEPT_ATTR}
            onChange={fileChosen(takeSigned)}
            file={signedFile}
            savedUrl={editApproval?.ifmisSlipAttachmentUrl}
            emptyText="Click to attach the signed Model 22, scanned"
            hint={`The IFMIS printout with its signatures, as a scan or photo (PDF, PNG, JPEG or WEBP, up to 10 MB).${isAttachmentReq ? '' : ' Until it is added, the IFMIS PDF is kept as the copy.'}`}
          />
        )}
      </Part>

      {/* The slip itself, open under the form, to check what was filled in against it */}
      <SlipPreview ifmisFile={ifmisFile} signedFile={signedFile} savedUrl={editApproval?.ifmisSlipAttachmentUrl} />

      <FormFooter
        accent="emerald"
        submitting={submitting}
        submitLabel={
          isEdit
            ? editApproval?.status === 'REJECTED' ? 'Save and resubmit' : 'Save changes'
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

/**
 * The requests printed on one Model 22: those saved with the same Model 22 No. (a voucher's lines are saved together,
 * one request each), in the order they were saved. A rejected line is left off, unless the one being printed is rejected.
 */
export const sameModel22 = (approval: TransactionApproval, requests: TransactionApproval[] = []): TransactionApproval[] => {
  const no = approval.ifmisSlipNumber?.trim().toLowerCase();
  if (!no || approval.status === 'REJECTED') return [approval];
  const lines = requests.filter(
    (r) => r.id === approval.id || (r.transactionType === 'STOCK_OUT' && r.status !== 'REJECTED' && r.ifmisSlipNumber?.trim().toLowerCase() === no),
  );
  if (!lines.some((r) => r.id === approval.id)) lines.push(approval);
  // The list comes newest first and lines of one voucher share a date, so on the same day the later in the list was saved first
  const at = (r: TransactionApproval) => requests.findIndex((x) => x.id === r.id);
  return lines.sort((a, b) => String(a.createdAtGc ?? '').slice(0, 10).localeCompare(String(b.createdAtGc ?? '').slice(0, 10)) || at(b) - at(a));
};

/**
 * Model 22 voucher for an issue request, from the request and its item. Given the other requests (and their items), it
 * lists every line saved on the same voucher, as the original printout did.
 */
export const buildModel22Voucher = (
  approval: TransactionApproval,
  context: { item?: ItemWithRelations; departments: Department[]; employees: Employee[]; printedBy?: string; requests?: TransactionApproval[]; items?: ItemWithRelations[] },
): Model22Voucher => {
  const { item: itemDetails, departments, employees } = context;
  const details = approval.requestDetails ?? {};
  const targetDept = departments.find((d) => d.id === approval.targetDepartmentId);
  const recipient = employees.find((e) => e.id === approval.recipientEmployeeId) || approval.recipientEmployee;
  // Issued to an outside organization: it, and the person who signs for it, take the place of the directorate and employee
  const outside = details.recipientType === 'EXTERNAL' ? details.organizationName : undefined;
  const requester = employees.find((e) => e.id === approval.requestedById) || approval.requestedBy;
  const issuedDateGc = approval.ifmisSlipDateGc || (approval.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0]);
  const subInventory = itemDetails?.subInventory || itemDetails?.storeLocation?.roomNumber || '—';
  const lines = sameModel22(approval, context.requests).map((r, i) => {
    const item = r.id === approval.id ? itemDetails : context.items?.find((x) => x.id === r.itemId);
    const unitPrice = costOf(item);
    const quantity = Number(r.requestDetails?.quantity) || Number(item?.quantity) || 1;
    return {
      sNo: i + 1,
      itemCode: item?.ifmisItemCode || r.itemCode,
      itemDescription: r.itemName,
      uom: item?.uom || 'EA',
      subInventory: item?.subInventory || item?.storeLocation?.roomNumber || subInventory,
      itemCategory: item ? categoryLabel(item) || '—' : '—',
      quantity,
      unitPrice,
      totalAmount: unitPrice * quantity,
      // The purpose isn't on the IFMIS Model 22, so the Remark column stays empty as there
      remark: '',
      transportationCost: Number(r.requestDetails?.transportationCost) || 0,
    };
  });
  const totalAmount = lines.reduce((sum, l) => sum + l.totalAmount, 0);
  // Saved with the voucher's first line
  const transportationCost = lines.reduce((sum, l) => sum + l.transportationCost, 0);

  return {
    approvalState: approval.status === 'PENDING' ? 'PENDING' : approval.status === 'REJECTED' ? 'REJECTED' : approval.status === 'CANCELLED' ? 'CANCELLED' : undefined,
    approvalNote: approvalNoteOf(approval),
    model22No: approval.ifmisSlipNumber || '',
    issuedDateGc,
    issuedDateEc: approval.ifmisSlipDateEc || approval.createdAtEc || formatGcToEc(issuedDateGc),
    // As recorded with the request; older requests were all move orders
    transactionType: details.disposal ? 'Disposal' : details.transactionType || 'Move Order Issue',
    disposalReason: details.disposal ? splitPurposeAndRemark(approval.purposeOrRemarks ?? '').purpose : undefined,
    destination: details.disposal
      ? details.recipientName?.trim()
        ? `Disposal: to ${details.recipientName.trim()}`
        : 'Disposal (write-off)'
      : outside || (targetDept ? departmentLabel(targetDept) : '—'),
    destinationDepartmentId: approval.targetDepartmentId,
    subInventory,
    issuedByName: details.issuedByName || requester?.fullNameEn || '—',
    receivedByName: details.disposal
      ? details.recipientName?.trim() || '—'
      : outside
      ? externalReceiverName(outside, details.contactPerson)
      : recipient?.fullNameEn || '—',
    receivedByEmployeeId: approval.recipientEmployeeId,
    items: lines.map(({ transportationCost: _cost, ...line }) => line),
    total: totalAmount,
    transportationCost,
    grandTotal: totalAmount + transportationCost,
    printedBy: context.printedBy,
    signatories: details.disposal
      ? [
          { label: 'Disposed By', name: details.issuedByName || requester?.fullNameEn || '—' },
          ...(details.recipientName?.trim() ? [{ label: 'Received By', name: details.recipientName.trim() }] : []),
          getEndorserSignatory(approval, { isEndorsed: approval.status === 'APPROVED' || approval.currentStage >= 2 }),
          getAuthorizerSignatory(approval, { isApproved: approval.status === 'APPROVED', totalAmount: totalAmount + transportationCost }),
        ]
      : [
          { label: 'Issued By', name: details.issuedByName || requester?.fullNameEn || '—' },
          { label: 'Received By', name: outside ? externalReceiverName(outside, details.contactPerson) : recipient?.fullNameEn || '—' },
          getEndorserSignatory(approval, { isEndorsed: approval.status === 'APPROVED' || approval.currentStage >= 2 }),
          getAuthorizerSignatory(approval, { isApproved: approval.status === 'APPROVED', totalAmount: totalAmount + transportationCost }),
        ],
  };
};
