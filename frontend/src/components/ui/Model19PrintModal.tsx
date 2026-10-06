import React from 'react';
import { Model19Voucher } from '../../types/asset-management';
import {
  VoucherShell, VoucherDetails, VoucherTotals, VoucherSignatures, formatVoucherAmount, orDash,
  VOUCHER_TABLE_WRAP, VOUCHER_TABLE, VOUCHER_HEAD_ROW, VOUCHER_TH, VOUCHER_BODY, VOUCHER_TD,
} from './VoucherLayout';

interface Model19PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: Model19Voucher | null;
}

export const Model19PrintModal: React.FC<Model19PrintModalProps> = ({ isOpen, onClose, voucher }) => {
  if (!isOpen || !voucher) return null;

  const grandTotal = voucher.grandTotal || voucher.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);

  return (
    <VoucherShell
      isOpen={isOpen}
      onClose={onClose}
      model="Model 19"
      toolbarTitle="Model 19 Receiving Report (የዕቃ መረከቢያ ሰነድ)"
      title="Goods Receiving Report"
      number={voucher.invModel19No}
      subheading={voucher.programName || undefined}
      approvalState={voucher.approvalState}
      printedBy={voucher.printedBy}
    >
      <VoucherDetails
        fields={[
          { label: 'PO Number', value: voucher.poNumber, mono: true },
          { label: 'Received Date', value: voucher.receivedDateGc && `${voucher.receivedDateGc}${voucher.receivedDateEc ? ` (${voucher.receivedDateEc} E.C.)` : ''}` },
          { label: 'Transaction Type', value: voucher.transactionType },
          { label: 'Source', value: voucher.source },
          { label: 'Buyer', value: voucher.buyer },
        ]}
      />

      <div className={VOUCHER_TABLE_WRAP}>
        <table className={VOUCHER_TABLE}>
          <thead>
            <tr className={VOUCHER_HEAD_ROW}>
              <th className={`${VOUCHER_TH} text-center w-8`}>S/No.</th>
              <th className={VOUCHER_TH}>Item Code</th>
              <th className={`${VOUCHER_TH} min-w-[140px]`}>Item Description</th>
              <th className={`${VOUCHER_TH} text-center w-10`}>UOM</th>
              <th className={VOUCHER_TH}>Sub Inventory</th>
              <th className={`${VOUCHER_TH} min-w-[110px]`}>Item Category</th>
              <th className={`${VOUCHER_TH} text-center`}>Lot / Batch No.</th>
              <th className={`${VOUCHER_TH} text-center`}>Serial No.</th>
              <th className={`${VOUCHER_TH} !p-0 text-center`}>
                <div className="p-1 border-b border-slate-400 print:border-black">Sequence # of Printed Pad</div>
                <div className="grid grid-cols-2 divide-x divide-slate-400 print:divide-black">
                  <span className="py-0.5 px-1">From</span>
                  <span className="py-0.5 px-1">To</span>
                </div>
              </th>
              <th className={`${VOUCHER_TH} text-right w-12`}>Qty</th>
              <th className={`${VOUCHER_TH} text-right w-20`}>Unit Price</th>
              <th className={`${VOUCHER_TH} text-right w-24`}>Total Amount</th>
              <th className={`${VOUCHER_TH} min-w-[70px]`}>Remark</th>
            </tr>
          </thead>
          <tbody className={VOUCHER_BODY}>
            {voucher.items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{item.sNo || idx + 1}</td>
                <td className={`${VOUCHER_TD} font-mono`}>{orDash(item.itemCode)}</td>
                <td className={`${VOUCHER_TD} font-medium`}>{item.itemDescription}</td>
                <td className={`${VOUCHER_TD} text-center font-mono uppercase`}>{item.uom || 'EA'}</td>
                <td className={VOUCHER_TD}>{orDash(item.subInventory)}</td>
                <td className={VOUCHER_TD}>{orDash(item.itemCategory)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{orDash(item.lotBatchNo)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{orDash(item.serialNo)}</td>
                <td className={`${VOUCHER_TD} !p-0 text-center font-mono`}>
                  <div className="grid grid-cols-2 divide-x divide-slate-300 print:divide-black py-1.5">
                    <span className="px-1 truncate">{orDash(item.printedPadFrom)}</span>
                    <span className="px-1 truncate">{orDash(item.printedPadTo)}</span>
                  </div>
                </td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{item.quantity}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(item.unitPrice)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{formatVoucherAmount(item.totalAmount)}</td>
                <td className={`${VOUCHER_TD} text-slate-700`}>{orDash(item.remark)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <VoucherTotals rows={[{ label: 'Grand Total', value: grandTotal }]} />

      <VoucherSignatures
        signatories={[
          { label: 'Delivered By', name: voucher.deliveredByName },
          { label: 'Received By', name: voucher.receivedByName },
        ]}
      />
    </VoucherShell>
  );
};
