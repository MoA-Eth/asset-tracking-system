import React from 'react';
import { Model21Voucher } from '../../types/asset-management';
import {
  VoucherShell, VoucherDetails, VoucherSignatures, formatVoucherAmount, orDash,
  VOUCHER_TABLE_WRAP, VOUCHER_TABLE, VOUCHER_HEAD_ROW, VOUCHER_TH, VOUCHER_BODY, VOUCHER_TD,
} from './VoucherLayout';

interface Model21PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: Model21Voucher | null;
}

export const Model21PrintModal: React.FC<Model21PrintModalProps> = ({ isOpen, onClose, voucher }) => {
  if (!isOpen || !voucher) return null;

  // Vehicle particulars are recorded once per request, on its first line
  const first = voucher.items[0];
  const hasParticulars = !!first && !!(first.plateNo || first.engineNo || first.accessories?.length || first.tireNos?.length || first.remark);

  return (
    <VoucherShell
      isOpen={isOpen}
      onClose={onClose}
      model="Model 21"
      toolbarTitle="Model 21 Fixed Asset Internal Transfer Form (የንብረት ዝውውር ፎርም)"
      title="Fixed Asset Internal Transfer Form"
      number={voucher.model21No}
      approvalState={voucher.approvalState}
      printedBy={voucher.printedBy}
    >
      <VoucherDetails
        fields={[
          { label: 'From Employee Name', value: voucher.fromEmployeeName },
          { label: 'To Employee Name', value: voucher.toEmployeeName },
          { label: 'From Employee ID', value: voucher.fromEmployeeId, mono: true },
          { label: 'To Employee ID', value: voucher.toEmployeeId, mono: true },
          { label: 'Book', value: voucher.book },
        ]}
      />

      <div className={VOUCHER_TABLE_WRAP}>
        <table className={VOUCHER_TABLE}>
          <thead>
            <tr className={VOUCHER_HEAD_ROW}>
              <th className={`${VOUCHER_TH} text-center w-8`}>S/No.</th>
              <th className={`${VOUCHER_TH} min-w-[130px]`}>Description</th>
              <th className={`${VOUCHER_TH} whitespace-nowrap`}>Tag Number</th>
              <th className={`${VOUCHER_TH} text-center whitespace-nowrap`}>Serial No.</th>
              <th className={`${VOUCHER_TH} text-center whitespace-nowrap`}>Chassis No.</th>
              <th className={`${VOUCHER_TH} text-center w-10`}>UOM</th>
              <th className={`${VOUCHER_TH} text-right w-12`}>Qty</th>
              <th className={`${VOUCHER_TH} text-right whitespace-nowrap`}>Orig. Cost</th>
              <th className={`${VOUCHER_TH} text-right whitespace-nowrap`}>Depreciation</th>
              <th className={`${VOUCHER_TH} text-right whitespace-nowrap`}>Book Value</th>
              <th className={`${VOUCHER_TH} text-center whitespace-nowrap`}>Date</th>
              <th className={`${VOUCHER_TH} min-w-[110px]`}>From Location</th>
              <th className={`${VOUCHER_TH} min-w-[110px]`}>To Location</th>
              <th className={`${VOUCHER_TH} min-w-[70px]`}>Remark</th>
            </tr>
          </thead>
          <tbody className={VOUCHER_BODY}>
            {voucher.items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{item.sNo || idx + 1}</td>
                <td className={`${VOUCHER_TD} font-medium`}>{item.description}</td>
                <td className={`${VOUCHER_TD} font-mono whitespace-nowrap`}>{orDash(item.tagNumber)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{orDash(item.serialNumber)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono`}>{orDash(item.chassisNumber)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono uppercase`}>{item.uom || 'EA'}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{item.unit || 1}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(item.origCost)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono`}>{formatVoucherAmount(item.depreciation)}</td>
                <td className={`${VOUCHER_TD} text-right font-mono font-bold`}>{formatVoucherAmount(item.bookValue)}</td>
                <td className={`${VOUCHER_TD} text-center font-mono whitespace-nowrap`}>{orDash(item.dateGc)}</td>
                <td className={VOUCHER_TD}>{orDash(item.fromLocation)}</td>
                <td className={VOUCHER_TD}>{orDash(item.toLocation)}</td>
                <td className={`${VOUCHER_TD} text-slate-700`}>{orDash(item.remark)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasParticulars && (
        <div className="border border-slate-400 print:border-black p-3 text-[11px] grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            {first.plateNo && (
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-slate-800 min-w-[80px]">Plate No :</span>
                <span className="font-mono font-semibold text-slate-950">{first.plateNo}</span>
              </div>
            )}
            {first.engineNo && (
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-slate-800 min-w-[80px]">Engine No :</span>
                <span className="font-mono font-semibold text-slate-950">{first.engineNo}</span>
              </div>
            )}
            {!!first.accessories?.length && (
              <div className="pt-1">
                <span className="font-bold text-slate-800 block mb-1">Accessories :</span>
                <div className="space-y-0.5">
                  {first.accessories.map((acc, idx) => (
                    <div key={idx} className="flex justify-between max-w-[200px] text-slate-900">
                      <span>{acc.name}</span>
                      <span className="font-mono font-bold">{acc.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            {!!first.tireNos?.length && (
              <>
                <span className="font-bold text-slate-800 block mb-1">Tire Nos :</span>
                <div className="space-y-0.5 font-mono text-slate-900">
                  {first.tireNos.map((tire, idx) => <div key={idx}>{tire}</div>)}
                </div>
              </>
            )}
          </div>
          <div>
            <span className="font-bold text-slate-800 block mb-1">Remark :</span>
            <div className="text-slate-900 leading-relaxed whitespace-pre-line">{first.remark || 'No defects reported.'}</div>
          </div>
        </div>
      )}

      <p className="pt-1 text-slate-900 italic text-[11px]">
        &ldquo;I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.&rdquo;
      </p>

      <VoucherSignatures
        signatories={[
          { label: 'Transferor', name: voucher.fromEmployeeName },
          { label: 'FAMU Accountant', name: voucher.famuAccountantName },
          { label: 'Recipient', name: voucher.toEmployeeName },
        ]}
      />
    </VoucherShell>
  );
};
