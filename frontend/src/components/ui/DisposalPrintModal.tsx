import React from 'react';
import { DisposalVoucher } from '../../types/asset-management';
import {
  VoucherShell, VoucherDetails, VoucherTotals, VoucherSignatures, formatVoucherAmount, orDash,
  VOUCHER_TABLE_WRAP, VOUCHER_TABLE, VOUCHER_HEAD_ROW, VOUCHER_TH, VOUCHER_BODY, VOUCHER_TD,
} from './VoucherLayout';

interface DisposalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: DisposalVoucher | null;
}

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New', GOOD: 'Good', FAIR: 'Fair', NEEDS_REPAIR: 'Needs repair', DAMAGED: 'Damaged',
};

/** Printed record of a disposal request, signed by whoever requested, endorsed and approved it */
export const DisposalPrintModal: React.FC<DisposalPrintModalProps> = ({ isOpen, onClose, voucher }) => {
  if (!isOpen || !voucher) return null;

  const bookValue = voucher.items.reduce((sum, item) => sum + (Number(item.bookValue) || 0), 0);

  return (
    <VoucherShell
      isOpen={isOpen}
      onClose={onClose}
      model="Disposal"
      toolbarTitle="Asset Disposal Voucher (የንብረት ማስወገጃ ሰነድ)"
      title="Asset Disposal Certificate"
      number={voucher.disposalNo}
      approvalState={voucher.approvalState}
      printedBy={voucher.printedBy}
    >
      <VoucherDetails
        fields={[
          { label: 'Disposal Date', value: voucher.dateGc && `${voucher.dateGc}${voucher.dateEc ? ` (${voucher.dateEc} E.C.)` : ''}` },
          { label: 'Reason', value: voucher.reason },
          { label: 'Condition', value: voucher.condition ? CONDITION_LABELS[voucher.condition] ?? voucher.condition : undefined },
          { label: 'Disposed To', value: voucher.recipientName },
          { label: 'Committee Decision Ref.', value: voucher.committeeRef, mono: true },
          { label: 'Justification', value: voucher.description },
        ]}
      />

      <div className={VOUCHER_TABLE_WRAP}>
        <table className={VOUCHER_TABLE}>
          <thead>
            <tr className={VOUCHER_HEAD_ROW}>
              <th className={`${VOUCHER_TH} text-center w-8`}>S/No.</th>
              <th className={VOUCHER_TH}>Item Code</th>
              <th className={`${VOUCHER_TH} min-w-[160px]`}>Item Description</th>
              <th className={`${VOUCHER_TH} text-center`}>Serial No.</th>
              <th className={`${VOUCHER_TH} text-center w-10`}>UOM</th>
              <th className={`${VOUCHER_TH} text-right w-12`}>Qty</th>
              <th className={`${VOUCHER_TH} text-right w-24`}>Unit Price</th>
              <th className={`${VOUCHER_TH} text-right w-24`}>Book Value</th>
            </tr>
          </thead>
          <tbody className={VOUCHER_BODY}>
            {voucher.items.map((item, idx) => (
              <tr key={`${item.itemCode}-${idx}`}>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{item.sNo || idx + 1}</td>
                <td className={`${VOUCHER_TD} font-mono`}>{orDash(item.itemCode)}</td>
                <td className={`${VOUCHER_TD} font-medium`}>{item.description}</td>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{orDash(item.serialNo)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono uppercase`}>{item.uom || 'EA'}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{item.quantity}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(item.unitPrice)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{formatVoucherAmount(item.bookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <VoucherTotals
        rows={[
          { label: 'Proceeds (ETB)', value: voucher.proceedsETB },
          { label: 'Book Value Written Off', value: bookValue },
        ]}
      />

      <VoucherSignatures
        signatories={[
          { label: 'Requested By (Store)', name: voucher.requestedByName },
          { label: 'Endorsed By (Team Leader)', name: voucher.endorsedByName },
          { label: 'Approved By (Department Head)', name: voucher.approvedByName },
          ...(voucher.recipientName ? [{ label: 'Received By', name: voucher.recipientName }] : []),
        ]}
      />
    </VoucherShell>
  );
};
