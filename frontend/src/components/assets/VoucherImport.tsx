import React from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useStoreKeepers } from '../../hooks/useStoreKeepers';
import { ApprovalStatus, Department, Employee, ItemWithRelations, Location, TransactionApproval } from '../../types/asset-management';
import { checkReceiptRows, readReceiptFile, receiptTemplateRows, RECEIPT_FIELDS } from '../../utils/receipt-import';
import { ImportContext, readSheetFile, templateRows } from '../../utils/sheet-import';
import {
  checkDisposalRows,
  checkIssueRows,
  checkTransferRows,
  DISPOSAL_EXAMPLE,
  DISPOSAL_FIELDS,
  ISSUE_EXAMPLE,
  ISSUE_FIELDS,
  TRANSFER_EXAMPLE,
  TRANSFER_FIELDS,
} from '../../utils/voucher-imports';
import { VoucherImportModal } from './VoucherImportModal';

/** Which voucher a spreadsheet holds; each has its own columns and its own rules about the items it may touch */
export type VoucherImportKind = 'receipt' | 'issue' | 'transfer' | 'disposal';

interface Props {
  kind: VoucherImportKind;
  onClose: () => void;
  onImported: () => void;
  items: ItemWithRelations[];
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  approvals: TransactionApproval[];
}

/** The import for one voucher, opened from the ⋮ menu of that voucher's form */
export const VoucherImport: React.FC<Props> = ({ kind, onClose, onImported, items, employees, departments, locations, approvals }) => {
  const { user } = useAuth();
  const keepers = useStoreKeepers();
  const ctx: ImportContext & { departments: Department[] } = {
    items,
    employees,
    departments,
    locations,
    storeMen: keepers.ofStore,
    pendingItemIds: new Set(approvals.filter((a) => a.status === ApprovalStatus.PENDING).map((a) => a.itemId)),
    today: new Date().toISOString().slice(0, 10),
  };
  const common = { isOpen: true, onClose, onImported, ready: keepers.ready };
  const awaiting = 'Each row waits for Team Leader endorsement and Department Head approval like any other.';

  switch (kind) {
    case 'receipt':
      return (
        <VoucherImportModal
          {...common}
          title="Import Model 19 receipts from Excel"
          subtitle="Register opening stock or many receipts at once"
          noun={['receipt', 'receipts']}
          voucherHeading="Model 19 No."
          fields={RECEIPT_FIELDS}
          notice={`An empty condition is recorded as Good. Imported receipts are marked historical and need no scanned slip. A row whose Model 19 No. and description are already registered is skipped. ${awaiting}`}
          templateName="receipts-template.xlsx"
          template={receiptTemplateRows()}
          read={readReceiptFile}
          check={(rows) =>
            checkReceiptRows(rows, {
              locations,
              storeMen: keepers.ofStore,
              existing: items.filter((i) => !i.parentItemId).map((i) => ({ slipNumber: i.ifmisSlipNumber, name: i.name, itemCode: i.itemCode })),
              today: ctx.today,
            }).map((c) => ({
              ...c,
              voucherNo: c.sheet.slipNumber,
              itemLabel: c.sheet.name,
              detail: c.storeLabel,
              qty: c.payload ? `${c.payload.items?.[0]?.quantity} ${c.payload.items?.[0]?.uom}` : c.sheet.quantity,
            }))
          }
          submit={async (payload) => {
            const res = await api.registerStockIn({ ...payload, registeredById: user!.id });
            return res.items?.[0]?.itemCode ?? res.item?.itemCode;
          }}
        />
      );
    case 'issue':
      return (
        <VoucherImportModal
          {...common}
          title="Import Model 22 issues from Excel"
          subtitle="Issue many items from store at once"
          noun={['issue', 'issues']}
          voucherHeading="Model 22 No."
          fields={ISSUE_FIELDS}
          notice={`Only items in store can be issued, up to the quantity in store. The directorate defaults to the recipient's. ${awaiting}`}
          templateName="model22-issues-template.xlsx"
          template={templateRows(ISSUE_FIELDS, ISSUE_EXAMPLE)}
          read={(file) => readSheetFile(file, ISSUE_FIELDS, 'itemCode')}
          check={(rows) => checkIssueRows(rows, ctx)}
          submit={async (payload) => {
            await api.registerStockOut({ ...payload, registeredById: user!.id });
            return undefined;
          }}
        />
      );
    case 'transfer':
      return (
        <VoucherImportModal
          {...common}
          title="Import Model 21 transfers from Excel"
          subtitle="Move many fixed assets between employees at once"
          noun={['transfer', 'transfers']}
          voucherHeading="Model 21 No."
          fields={TRANSFER_FIELDS}
          notice={`Only fixed assets that are issued to an employee, or still in store, can be transferred; consumables are issued, not transferred. If you fill in From, it must be the employee who holds the asset now. ${awaiting}`}
          templateName="model21-transfers-template.xlsx"
          template={templateRows(TRANSFER_FIELDS, TRANSFER_EXAMPLE)}
          read={(file) => readSheetFile(file, TRANSFER_FIELDS, 'itemCode')}
          check={(rows) => checkTransferRows(rows, ctx)}
          submit={async (payload) => {
            await api.transferItem({ ...payload, performedById: user!.id });
            return undefined;
          }}
        />
      );
    case 'disposal':
      return (
        <VoucherImportModal
          {...common}
          title="Import disposals from Excel"
          subtitle="Request the disposal of many items at once"
          noun={['disposal', 'disposals']}
          voucherHeading="Disposal ref."
          fields={DISPOSAL_FIELDS}
          notice={`Only items in store can be disposed of; an empty quantity disposes of everything in store for that item. ${awaiting}`}
          templateName="disposals-template.xlsx"
          template={templateRows(DISPOSAL_FIELDS, DISPOSAL_EXAMPLE)}
          read={(file) => readSheetFile(file, DISPOSAL_FIELDS, 'itemCode')}
          check={(rows) => checkDisposalRows(rows, ctx)}
          submit={async (payload) => {
            await api.registerDisposal(payload);
            return undefined;
          }}
        />
      );
  }
};
