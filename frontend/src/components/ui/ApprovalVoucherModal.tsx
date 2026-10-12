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
 * pages print, so an approver reads it the way it will be signed. The item's full record and history stay one click away.
 */
export const ApprovalVoucherModal: React.FC<Props> = ({ approval, onClose }) => {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [showRecord, setShowRecord] = useState(false);

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
          next = { kind: 'model19', voucher: { ...buildModel19Voucher(record, all, printedBy), approvalState: stateOf(approval) } };
        } else if (type === 'STOCK_OUT') {
          const [departments, employees]: [Department[], Employee[]] = await Promise.all([api.getDepartments(), api.getEmployees()]);
          next = { kind: 'model22', voucher: buildModel22Voucher(approval, { item, departments, employees, printedBy }) };
        } else if (type === 'DISPOSAL') {
          const employees: Employee[] = await api.getEmployees();
          next = { kind: 'disposal', voucher: buildDisposalVoucher(approval, { item, employees, printedBy }) };
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

  // The record and its history, when asked for, or when there is no voucher for this request
  if (showRecord || failed) {
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

  const toolbarAction = { label: 'Full record & history', onClick: () => setShowRecord(true) };
  switch (loaded.kind) {
    case 'model19':
      return <Model19PrintModal isOpen onClose={onClose} voucher={loaded.voucher} toolbarAction={toolbarAction} />;
    case 'model22':
      return <Model22PrintModal isOpen onClose={onClose} voucher={loaded.voucher} toolbarAction={toolbarAction} />;
    case 'model21':
      return <Model21PrintModal isOpen onClose={onClose} voucher={loaded.voucher} toolbarAction={toolbarAction} />;
    default:
      return <DisposalPrintModal isOpen onClose={onClose} voucher={loaded.voucher} toolbarAction={toolbarAction} />;
  }
};

/** The banner a voucher shows: pending requests and rejected ones say so, an approved one prints clean */
function stateOf(approval: TransactionApproval): 'PENDING' | 'REJECTED' | undefined {
  if (approval.status === 'PENDING') return 'PENDING';
  if (approval.status === 'REJECTED') return 'REJECTED';
  return undefined;
}
