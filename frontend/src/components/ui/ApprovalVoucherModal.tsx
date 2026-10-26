import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Department,
  Employee,
  ItemWithRelations,
  Location,
  Model19Voucher,
  Model21Voucher,
  Model22Voucher,
  DisposalVoucher,
  TransactionApproval,
} from '../../types/asset-management';
import { buildModel19Voucher } from '../assets/ReceiptForm';
import { buildModel22Voucher } from '../assets/IssueForm';
import { buildModel21Voucher } from '../assets/TransferForm';
import { buildDisposalVoucher } from '../assets/DisposalForm';
import { Model19PrintModal } from './Model19PrintModal';
import { Model22PrintModal } from './Model22PrintModal';
import { Model21PrintModal } from './Model21PrintModal';
import { DisposalPrintModal } from './DisposalPrintModal';
import { RecordDetailModal } from './RecordDetailModal';
import { Modal } from './Modal';

type Loaded =
  | { kind: 'model19'; voucher: Model19Voucher }
  | { kind: 'model22'; voucher: Model22Voucher }
  | { kind: 'model21'; voucher: Model21Voucher }
  | { kind: 'disposal'; voucher: DisposalVoucher };

interface Props {
  approval: TransactionApproval;
  onClose: () => void;
}

/**
 * A request shown as the voucher it belongs to (Model 19, 22, 21 or the disposal form), the same paper the other
 * pages print, so an approver reads it the way it will be signed. When no voucher can be built, the item's record is shown.
 */
export const ApprovalVoucherModal: React.FC<Props> = ({ approval, onClose }) => {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const printedBy = user?.fullNameEn;
        const item: ItemWithRelations | undefined = await api.getItemById(approval.itemId).catch(() => undefined);
        const type = approval.transactionType;
        let next: Loaded;
        if (type === 'STOCK_IN') {
          // A slip lists every item registered on it, so the whole list is needed
          const all: ItemWithRelations[] = await api.getItems();
          const record = item ?? all.find((i) => i.id === approval.itemId);
          if (!record) throw new Error('item not found');
          next = { kind: 'model19', voucher: { ...buildModel19Voucher(record, all, printedBy, approval), approvalState: stateOf(approval) } };
        } else if (type === 'STOCK_OUT') {
          // The other lines of the same Model 22 are printed with it
          const [departments, employees, requests, items]: [Department[], Employee[], TransactionApproval[], ItemWithRelations[]] = await Promise.all([
            api.getDepartments(),
            api.getEmployees(),
            api.getApprovals().catch(() => []),
            api.getItems().catch(() => []),
          ]);
          next = { kind: 'model22', voucher: buildModel22Voucher(approval, { item, departments, employees, printedBy, requests, items }) };
        } else if (type === 'DISPOSAL') {
          // The other assets filed on the same disposal form are printed with it
          const [employees, requests, items]: [Employee[], TransactionApproval[], ItemWithRelations[]] = await Promise.all([
            api.getEmployees(),
            api.getApprovals().catch(() => []),
            api.getItems().catch(() => []),
          ]);
          next = { kind: 'disposal', voucher: buildDisposalVoucher(approval, { item, employees, printedBy, requests, items }) };
        } else if (type === 'TRANSFER' || type === 'RETURN') {
          const [employees, locations]: [Employee[], Location[]] = await Promise.all([api.getEmployees(), api.getLocations()]);
          next = { kind: 'model21', voucher: await buildModel21Voucher(approval, { item, employees, locations, printedBy }) };
        } else {
          throw new Error('no voucher for this request');
        }
        if (!cancelled) setLoaded(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval.id]);

  // No voucher could be built for this request: show the item's record instead
  if (failed) {
    return <RecordDetailModal itemId={approval.itemId} approval={approval} onClose={onClose} />;
  }

  if (!loaded) {
    return (
      <Modal isOpen onClose={onClose} title="Opening the voucher…" size="sm">
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading
        </div>
      </Modal>
    );
  }

  switch (loaded.kind) {
    case 'model19':
      return <Model19PrintModal isOpen onClose={onClose} voucher={loaded.voucher} />;
    case 'model22':
      return <Model22PrintModal isOpen onClose={onClose} voucher={loaded.voucher} />;
    case 'model21':
      return <Model21PrintModal isOpen onClose={onClose} voucher={loaded.voucher} />;
    default:
      return <DisposalPrintModal isOpen onClose={onClose} voucher={loaded.voucher} />;
  }
};

/** The banner a voucher shows: pending requests and rejected ones say so, an approved one prints clean */
function stateOf(approval: TransactionApproval): 'PENDING' | 'REJECTED' | 'CANCELLED' | undefined {
  if (approval.status === 'PENDING') return 'PENDING';
  if (approval.status === 'CANCELLED') return 'CANCELLED';
  if (approval.status === 'REJECTED') return 'REJECTED';
  return undefined;
}
