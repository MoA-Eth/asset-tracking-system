import { CreateDisposalRequest, CreateStockOutRequest, CreateTransferRequest, Department, ItemCondition, ItemStatus, ItemType } from '../types/asset-management';
import {
  ImportContext,
  SheetField,
  SheetRow,
  amount,
  dateIn,
  employeeIn,
  itemByCode,
  missingIn,
  normalize,
  statusWords,
  storeManFor,
} from './sheet-import';

/** A checked row: what it will register, or why it is skipped, and what the preview shows */
export interface CheckedRow<P> {
  sheet: { row: number };
  error?: string;
  payload?: P;
  voucherNo: string;
  itemLabel: string;
  /** Where it goes or who gets it */
  detail?: string;
  qty?: string;
}

const text = (v: string) => v.trim() || undefined;

const CONDITIONS: [RegExp, ItemCondition][] = [
  [/^new$/i, ItemCondition.NEW],
  [/^good$/i, ItemCondition.GOOD],
  [/^fair$/i, ItemCondition.FAIR],
  [/^(needs?\s*repair|needs_repair|repair)$/i, ItemCondition.NEEDS_REPAIR],
  [/^damaged$/i, ItemCondition.DAMAGED],
];
const conditionFrom = (t: string) => CONDITIONS.find(([re]) => re.test(t.trim()))?.[1];

/** "MOA-0012 is issued, not in store" */
const wrongStatus = (code: string, status: string, needed: string) => `${code} is ${statusWords[status] ?? status.toLowerCase()}, not ${needed}.`;

/**
 * Runs the checks every voucher shares for the item a row names: it exists, it isn't waiting on another request,
 * and the file doesn't name it twice (the server takes one request per item at a time).
 */
function itemFor(ctx: ImportContext, code: string, seen: Map<string, number>, row: number) {
  const item = itemByCode(ctx, code);
  if (!item) return { error: `No item with code ${code}.` };
  if (ctx.pendingItemIds.has(item.id)) return { error: `${item.itemCode} already has a request waiting for approval.` };
  if (seen.has(item.id)) return { error: `${item.itemCode} is also on row ${seen.get(item.id)}; one request per item at a time.` };
  return { item };
}

// ─── Model 22: issue from store ─────────────────────────────────────────────

export type IssueField = 'model22No' | 'issuedDate' | 'itemCode' | 'quantity' | 'recipient' | 'directorate' | 'purpose' | 'transactionType' | 'storeMan' | 'remark';

export const ISSUE_FIELDS: SheetField<IssueField>[] = [
  { key: 'model22No', heading: 'Model 22 No.', required: true, aliases: ['model 22', 'model 22 no', 'slip no', 'voucher no'] },
  { key: 'issuedDate', heading: 'Issued date', required: true, aliases: ['date', 'issue date'] },
  { key: 'itemCode', heading: 'Item code', required: true, aliases: ['asset code', 'tag number', 'tag no'] },
  { key: 'quantity', heading: 'Quantity', required: true, aliases: ['qty'] },
  { key: 'recipient', heading: 'Recipient (employee ID)', required: true, aliases: ['recipient', 'employee id', 'issued to', 'employee'] },
  { key: 'directorate', heading: 'Directorate', aliases: ['department', 'destination directorate', 'destination'] },
  { key: 'purpose', heading: 'Purpose', required: true, aliases: ['purpose of issue', 'reason'] },
  { key: 'transactionType', heading: 'Transaction type', aliases: [] },
  { key: 'storeMan', heading: 'Issued by (store man)', aliases: ['issued by', 'store man', 'store keeper'] },
  { key: 'remark', heading: 'Remark', aliases: ['remarks', 'note'] },
];

export const ISSUE_EXAMPLE: Record<IssueField, string> = {
  model22No: '0001234',
  issuedDate: '2026-10-01',
  itemCode: 'MOA-0012',
  quantity: '1',
  recipient: '00123456',
  directorate: '',
  purpose: 'For field work',
  transactionType: 'Move Order Issue',
  storeMan: '',
  remark: '',
};

/** Issue: only items in store, up to the quantity in store */
export function checkIssueRows(
  rows: SheetRow<IssueField>[],
  ctx: ImportContext & { departments: Department[] },
): CheckedRow<Omit<CreateStockOutRequest, 'registeredById'>>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = { sheet: r, voucherNo: r.model22No, itemLabel: r.itemCode, qty: r.quantity };
    const fail = (error: string) => ({ ...base, error });
    const missing = missingIn(r, ISSUE_FIELDS);
    if (missing) return fail(missing);
    const when = dateIn(r.issuedDate, 'Issued date', ctx.today);
    if ('error' in when) return fail(when.error);

    const found = itemFor(ctx, r.itemCode, seen, r.row);
    if (!found.item) return fail(found.error!);
    const item = found.item;
    const label = `${item.itemCode} · ${item.name}`;
    if (item.status !== ItemStatus.AVAILABLE) return { ...fail(wrongStatus(item.itemCode, item.status, 'in store')), itemLabel: label };
    const inStore = Number(item.quantity) || 1;
    const quantity = amount(r.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      return { ...fail(`Quantity must be a whole number from 1 to ${inStore} (${item.uom || 'EA'} in store).`), itemLabel: label };
    }

    const recipient = employeeIn(ctx, r.recipient);
    if (!recipient) return { ...fail(`No active employee "${r.recipient}". Use the 8-digit employee ID.`), itemLabel: label };
    const department = r.directorate.trim()
      ? ctx.departments.find((d) => normalize(d.code) === normalize(r.directorate) || normalize(d.nameEn) === normalize(r.directorate))
      : ctx.departments.find((d) => d.id === recipient.departmentId);
    if (!department) {
      return {
        ...fail(r.directorate.trim() ? `No directorate "${r.directorate}".` : `${recipient.fullNameEn} has no directorate; fill in Directorate.`),
        itemLabel: label,
      };
    }
    const man = storeManFor(ctx, item, r.storeMan);
    if ('error' in man) return { ...fail(man.error), itemLabel: label };
    seen.set(item.id, r.row);

    const unitPrice = Number(item.unitCostETB) || 0;
    return {
      ...base,
      itemLabel: label,
      detail: `${recipient.fullNameEn} · ${department.nameEn}`,
      qty: `${quantity} ${item.uom || 'EA'}`,
      payload: {
        itemId: item.id,
        issuedByEmployeeId: man.id,
        recipientType: 'INTERNAL',
        recipientEmployeeId: recipient.id,
        targetDepartmentId: department.id,
        ifmisSlipNumber: r.model22No.trim(),
        ifmisSlipDateGc: when.date,
        purpose: r.purpose.trim(),
        transactionType: text(r.transactionType) ?? 'Move Order Issue',
        destination: department.nameEn,
        quantity,
        unitPrice,
        totalAmount: unitPrice * quantity,
        remark: text(r.remark),
      },
    };
  });
}

// ─── Model 21: transfer between employees ───────────────────────────────────

export type TransferField = 'model21No' | 'transferDate' | 'book' | 'itemCode' | 'fromEmployee' | 'toEmployee' | 'storeMan' | 'remark';

export const TRANSFER_FIELDS: SheetField<TransferField>[] = [
  { key: 'model21No', heading: 'Model 21 No.', required: true, aliases: ['model 21', 'model 21 no', 'voucher no'] },
  { key: 'transferDate', heading: 'Transfer date', required: true, aliases: ['date'] },
  { key: 'book', heading: 'Book', required: true, aliases: ['book no', 'register book'] },
  { key: 'itemCode', heading: 'Item code', required: true, aliases: ['asset code', 'tag number', 'tag no'] },
  { key: 'fromEmployee', heading: 'From (employee ID)', aliases: ['from', 'transferred from', 'current holder'] },
  { key: 'toEmployee', heading: 'To (employee ID)', required: true, aliases: ['to', 'transferred to', 'recipient'] },
  { key: 'storeMan', heading: 'Transferred by (store man)', aliases: ['transferred by', 'store man', 'store keeper'] },
  { key: 'remark', heading: 'Remark', aliases: ['remarks', 'note', 'defects'] },
];

export const TRANSFER_EXAMPLE: Record<TransferField, string> = {
  model21No: '0000567',
  transferDate: '2026-10-01',
  book: '12',
  itemCode: 'MOA-0012',
  fromEmployee: '00123456',
  toEmployee: '00654321',
  storeMan: '',
  remark: '',
};

/** Transfer: fixed assets only, issued to an employee or still in store; consumables are issued, not transferred */
export function checkTransferRows(rows: SheetRow<TransferField>[], ctx: ImportContext): CheckedRow<Omit<CreateTransferRequest, 'performedById'>>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = { sheet: r, voucherNo: r.model21No, itemLabel: r.itemCode, qty: '' };
    const fail = (error: string) => ({ ...base, error });
    const missing = missingIn(r, TRANSFER_FIELDS);
    if (missing) return fail(missing);
    const when = dateIn(r.transferDate, 'Transfer date', ctx.today);
    if ('error' in when) return fail(when.error);

    const found = itemFor(ctx, r.itemCode, seen, r.row);
    if (!found.item) return fail(found.error!);
    const item = found.item;
    const label = `${item.itemCode} · ${item.name}`;
    const withLabel = (error: string) => ({ ...fail(error), itemLabel: label });
    if (item.itemType === ItemType.CONSUMABLE) return withLabel(`${item.itemCode} is a consumable item; consumables are issued, not transferred.`);
    const issued = item.status === ItemStatus.ISSUED;
    if (!issued && item.status !== ItemStatus.AVAILABLE) return withLabel(wrongStatus(item.itemCode, item.status, 'issued or in store'));
    if (issued && item.heldByOrganization) return withLabel(`${item.itemCode} is held by ${item.heldByOrganization}, outside the Ministry.`);

    const holder = issued ? item.currentCustodian : null;
    if (r.fromEmployee.trim()) {
      const from = employeeIn(ctx, r.fromEmployee);
      if (!issued) return withLabel(`${item.itemCode} is in store, not with "${r.fromEmployee}"; leave From empty.`);
      if (!from || from.id !== item.currentCustodianId) {
        return withLabel(`${item.itemCode} is held by ${holder?.fullNameEn ?? 'someone else'}, not "${r.fromEmployee}".`);
      }
    }
    const to = employeeIn(ctx, r.toEmployee);
    if (!to) return withLabel(`No active employee "${r.toEmployee}". Use the 8-digit employee ID.`);
    if (issued && to.id === item.currentCustodianId) return withLabel(`${item.itemCode} is already with ${to.fullNameEn}.`);
    const man = storeManFor(ctx, item, r.storeMan);
    if ('error' in man) return withLabel(man.error);
    seen.set(item.id, r.row);

    return {
      ...base,
      itemLabel: label,
      detail: `${holder?.fullNameEn ?? 'Store'} → ${to.fullNameEn}`,
      qty: `${Number(item.quantity) || 1} ${item.uom || 'EA'}`,
      payload: {
        itemId: item.id,
        toEmployeeId: to.id,
        toDepartmentId: to.departmentId || undefined,
        transferredByEmployeeId: man.id,
        ifmisSlipDateGc: when.date,
        model21No: r.model21No.trim(),
        book: r.book.trim(),
        origCost: (Number(item.unitCostETB) || 0) * (Number(item.quantity) || 1),
        remark: text(r.remark),
      },
    };
  });
}

// ─── Disposal ───────────────────────────────────────────────────────────────

export type DisposalField =
  | 'disposalNo'
  | 'disposalDate'
  | 'itemCode'
  | 'quantity'
  | 'reason'
  | 'condition'
  | 'recipientName'
  | 'proceeds'
  | 'committeeRef'
  | 'storeMan'
  | 'description';

export const DISPOSAL_FIELDS: SheetField<DisposalField>[] = [
  { key: 'disposalNo', heading: 'Disposal reference no.', required: true, aliases: ['disposal no', 'reference no', 'disposal ref', 'disposal reference'] },
  { key: 'disposalDate', heading: 'Disposal date', required: true, aliases: ['date'] },
  { key: 'itemCode', heading: 'Item code', required: true, aliases: ['asset code', 'tag number', 'tag no'] },
  { key: 'quantity', heading: 'Quantity', aliases: ['qty'] },
  { key: 'reason', heading: 'Reason', required: true, aliases: ['reason for disposal'] },
  { key: 'condition', heading: 'Condition', aliases: ['physical condition'] },
  { key: 'recipientName', heading: 'Disposed to', aliases: ['recipient', 'buyer', 'sold to', 'donated to'] },
  { key: 'proceeds', heading: 'Proceeds (ETB)', aliases: ['proceeds', 'sale amount', 'amount received'] },
  { key: 'committeeRef', heading: 'Committee reference', aliases: ['committee', 'committee ref', 'minutes'] },
  { key: 'storeMan', heading: 'Storekeeper (store man)', aliases: ['storekeeper', 'store man', 'store keeper'] },
  { key: 'description', heading: 'Description', aliases: [] },
];

export const DISPOSAL_EXAMPLE: Record<DisposalField, string> = {
  disposalNo: 'DSP-2026-001',
  disposalDate: '2026-10-01',
  itemCode: 'MOA-0012',
  quantity: '',
  reason: 'Damaged beyond repair',
  condition: 'Damaged',
  recipientName: '',
  proceeds: '',
  committeeRef: '',
  storeMan: '',
  description: '',
};

/** Disposal: only items in store, up to the quantity in store (empty quantity disposes of all of it) */
export function checkDisposalRows(rows: SheetRow<DisposalField>[], ctx: ImportContext): CheckedRow<CreateDisposalRequest & { storekeeperEmployeeId?: string }>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = { sheet: r, voucherNo: r.disposalNo, itemLabel: r.itemCode, qty: r.quantity };
    const fail = (error: string) => ({ ...base, error });
    const missing = missingIn(r, DISPOSAL_FIELDS);
    if (missing) return fail(missing);
    const when = dateIn(r.disposalDate, 'Disposal date', ctx.today);
    if ('error' in when) return fail(when.error);

    const found = itemFor(ctx, r.itemCode, seen, r.row);
    if (!found.item) return fail(found.error!);
    const item = found.item;
    const label = `${item.itemCode} · ${item.name}`;
    const withLabel = (error: string) => ({ ...fail(error), itemLabel: label });
    if (item.status !== ItemStatus.AVAILABLE) return withLabel(wrongStatus(item.itemCode, item.status, 'in store'));
    const inStore = Number(item.quantity) || 1;
    const quantity = r.quantity.trim() ? amount(r.quantity) : inStore;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > inStore) {
      return withLabel(`Quantity must be a whole number from 1 to ${inStore} (${item.uom || 'EA'} in store).`);
    }
    const condition = r.condition.trim() ? conditionFrom(r.condition) : undefined;
    if (r.condition.trim() && !condition) return withLabel(`Condition "${r.condition}" must be New, Good, Fair, Needs repair or Damaged.`);
    const proceeds = r.proceeds.trim() ? amount(r.proceeds) : undefined;
    if (proceeds !== undefined && !(proceeds >= 0)) return withLabel('Proceeds must be a number, zero or more.');
    const man = storeManFor(ctx, item, r.storeMan);
    if ('error' in man) return withLabel(man.error);
    seen.set(item.id, r.row);

    return {
      ...base,
      itemLabel: label,
      detail: r.reason.trim(),
      qty: `${quantity} ${item.uom || 'EA'}`,
      payload: {
        itemId: item.id,
        quantity,
        disposalNo: r.disposalNo.trim(),
        disposalDateGc: when.date,
        reason: r.reason.trim(),
        description: text(r.description),
        condition,
        recipientName: text(r.recipientName),
        proceedsETB: proceeds,
        committeeRef: text(r.committeeRef),
        storekeeperEmployeeId: man.id,
      },
    };
  });
}
