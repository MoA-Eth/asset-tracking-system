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

/**
 * The Ministry's "Fixed Asset Disposal Form": public body and recipient above, one line per asset
 * (tag, serial, disposal type, original cost, accumulated depreciation, book value, remark), the recipient's
 * statement, then the signatures. Chassis, engine and declaration numbers are for vehicles and machinery: the
 * system doesn't record them, so those cells are left to write in.
 */
export const DisposalPrintModal: React.FC<DisposalPrintModalProps> = ({ isOpen, onClose, voucher }) => {
  if (!isOpen || !voucher) return null;

  // Original cost less book value is what has been depreciated
  const rows = voucher.items.map((item) => {
    const originalCost = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
    const bookValue = Number(item.bookValue) || 0;
    return { item, originalCost, bookValue, depreciation: Math.max(originalCost - bookValue, 0) };
  });
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);

  return (
    <VoucherShell
      isOpen={isOpen}
      onClose={onClose}
      model="Disposal"
      toolbarTitle="Fixed Asset Disposal Form"
      title="Fixed Asset Disposal Form"
      number={voucher.disposalNo}
      approvalState={voucher.approvalState}
      printedBy={voucher.printedBy}
    >
      {/* The table has twelve columns: print it across the long side of the page */}
      <style>{'@media print { @page { size: A4 landscape; margin: 12mm; } }'}</style>

      <VoucherDetails
        fields={[
          { label: 'Name of Public Body', value: 'Ministry of Agriculture' },
          { label: 'Date', value: voucher.dateGc && `${voucher.dateGc}${voucher.dateEc ? ` (${voucher.dateEc} E.C.)` : ''}` },
          { label: 'Sold / Transferred / Donated to', value: voucher.recipientName },
          { label: 'Committee Decision Ref.', value: voucher.committeeRef, mono: true },
          { label: 'Condition', value: voucher.condition ? CONDITION_LABELS[voucher.condition] ?? voucher.condition : undefined },
          { label: 'Proceeds (ETB)', value: voucher.proceedsETB === undefined ? undefined : formatVoucherAmount(voucher.proceedsETB) },
        ]}
      />

      <div className={VOUCHER_TABLE_WRAP}>
        <table className={VOUCHER_TABLE}>
          <thead>
            <tr className={VOUCHER_HEAD_ROW}>
              <th className={`${VOUCHER_TH} text-center w-8`}>S.No</th>
              <th className={`${VOUCHER_TH} min-w-[130px]`}>Asset Description</th>
              <th className={VOUCHER_TH}>Tag Number</th>
              <th className={VOUCHER_TH}>Serial Number</th>
              <th className={VOUCHER_TH}>Chassis No</th>
              <th className={VOUCHER_TH}>Engine No</th>
              <th className={VOUCHER_TH}>Declaration Number</th>
              <th className={VOUCHER_TH}>Disposal Type</th>
              <th className={`${VOUCHER_TH} text-right`}>Original Cost</th>
              <th className={`${VOUCHER_TH} text-right`}>Accumulated Depreciation</th>
              <th className={`${VOUCHER_TH} text-right`}>Book Value</th>
              <th className={VOUCHER_TH}>Remark</th>
            </tr>
          </thead>
          <tbody className={VOUCHER_BODY}>
            {rows.map(({ item, originalCost, depreciation, bookValue }, idx) => (
              <tr key={`${item.itemCode}-${idx}`}>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{item.sNo || idx + 1}</td>
                <td className={`${VOUCHER_TD} font-medium`}>
                  {item.description}
                  {item.quantity > 1 && (
                    <span className="block text-[9px] font-normal text-slate-600">
                      {item.quantity} {item.uom || 'EA'} @ {formatVoucherAmount(item.unitPrice)}
                    </span>
                  )}
                </td>
                <td className={`${VOUCHER_TD} font-mono`}>{orDash(item.itemCode)}</td>
                <td className={`${VOUCHER_TD} font-mono`}>{orDash(item.serialNo)}</td>
                <td className={VOUCHER_TD}>{' '}</td>
                <td className={VOUCHER_TD}>{' '}</td>
                <td className={VOUCHER_TD}>{' '}</td>
                <td className={`${VOUCHER_TD} uppercase`}>{voucher.reason}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(originalCost)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(depreciation)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{formatVoucherAmount(bookValue)}</td>
                <td className={VOUCHER_TD}>{voucher.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <VoucherTotals
        rows={[
          { label: 'Original Cost', value: sum((r) => r.originalCost) },
          { label: 'Accumulated Depreciation', value: sum((r) => r.depreciation) },
          { label: 'Book Value', value: sum((r) => r.bookValue) },
        ]}
      />

      <p className="text-[11px] font-medium text-slate-900">
        The undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.
      </p>

      <VoucherSignatures
        columns={5}
        signatories={[
          { label: 'Storekeeper', name: voucher.requestedByName },
          { label: 'Endorsed By (Team Leader)', name: voucher.endorsedByName },
          { label: 'Approved By (Department Head)', name: voucher.approvedByName },
          { label: 'FAMU Accountant' },
          { label: "Recipient", name: voucher.recipientName },
        ]}
      />
    </VoucherShell>
  );
};
