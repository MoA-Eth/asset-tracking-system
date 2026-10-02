import React from 'react';
import { Printer, X, FileText } from 'lucide-react';
import { Model22Voucher, Model22LineItem } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { MoaLogo } from './MoaLogo';

interface Model22PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: Model22Voucher | null;
}

export const Model22PrintModal: React.FC<Model22PrintModalProps> = ({
  isOpen,
  onClose,
  voucher,
}) => {
  if (!isOpen || !voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  const total = voucher.total || voucher.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  const transportationCost = Number(voucher.transportationCost) || 0;
  const grandTotal = voucher.grandTotal || (total + transportationCost);

  const now = new Date();
  const printTimestamp = voucher.reportPrintedDate ||
    `${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} @ ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`;
  const printedBy = voucher.reportPrintedBy || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]">
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Official IFMIS Model 22 Issue Voucher (የዕቃ ወጪ ማዘዣ እና መረከቢያ)
              </h3>
              <p className="text-[11px] text-slate-300">
                Mirrored Ethiopian Federal Ministry of Agriculture Standard Document
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print Voucher / Save as PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Print Model 22 / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Paper Container */}
        <div className="p-6 sm:p-10 overflow-y-auto font-sans text-slate-950 bg-white relative print:p-0 print:overflow-visible print:text-black">
          {/* Authentic IFMIS Background Watermark */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0"
            aria-hidden="true"
          >
            <span className="text-[130px] sm:text-[180px] font-black text-slate-300/20 transform -rotate-25 tracking-[0.25em]">
              IFMIS
            </span>
          </div>

          <div className="relative z-10 space-y-6">
            {/* Ministry of Agriculture logo */}
            <div className="flex justify-center">
              <MoaLogo className="w-14 h-14" />
            </div>

            {/* Top Official Dark Banner (Exact match to provided photo) */}
            <div className="bg-[#4b5563] text-white py-3 px-4 text-center rounded-xs shadow-xs print:bg-[#4b5563] print:text-white">
              <h1 className="text-xs sm:text-sm font-semibold tracking-wide uppercase">
                The Federal Democratic Republic of Ethiopia
              </h1>
              <h2 className="text-xs sm:text-sm font-bold mt-0.5 uppercase">
                Ministry of Agriculture
              </h2>
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight mt-0.5">
                Receipt For Articles Or Property Issued
              </h3>
            </div>

            {/* Document Header Metadata Block (Aligned Right as in photo) */}
            <div className="flex justify-end pt-1 pb-1">
              <div className="w-full sm:w-auto min-w-[360px] text-xs space-y-1 bg-slate-50/70 print:bg-transparent p-3 rounded-lg border border-slate-200 print:border-none font-medium">
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Model 22 No. :</span>
                  <span className="font-mono font-bold text-slate-950">{voucher.model22No}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Issued Date :</span>
                  <span className="text-slate-950">
                    {voucher.issuedDateGc} {voucher.issuedDateEc ? `(${voucher.issuedDateEc} E.C.)` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Transaction Type :</span>
                  <span className="font-semibold text-slate-950">{voucher.transactionType || 'Move Order Issue'}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Destination :</span>
                  <span className="font-semibold text-slate-950">{voucher.destination || '—'}</span>
                </div>
              </div>
            </div>

            {/* Official Model 22 Tabular Grid (Matching photo columns) */}
            <div className="overflow-x-auto border border-slate-400 print:border-black rounded-xs">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200 border-b border-slate-400 print:border-black font-bold text-slate-900 text-[10px]">
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center w-8">S/No.</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black">Item</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black min-w-[140px]">Item Description</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center w-10">UOM</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black">Sub Inventory</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black min-w-[110px]">Item Category</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center">Lot / Batch No.</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center">Serial</th>
                    <th className="p-0 border-r border-slate-400 print:border-black text-center">
                      <div className="p-1 border-b border-slate-400 print:border-black">Sequence # Printed Pad</div>
                      <div className="grid grid-cols-2 divide-x divide-slate-400 print:divide-black">
                        <span className="py-0.5 px-1 text-center">From</span>
                        <span className="py-0.5 px-1 text-center">To</span>
                      </div>
                    </th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-10">Qty</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-20">Unit Price</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-24">Total Amount</th>
                    <th className="p-1.5 text-left min-w-[70px]">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 print:divide-black text-[10px]">
                  {voucher.items.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-center font-mono">
                        {item.sNo || idx + 1}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black font-mono">
                        {item.itemCode || '—'}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black font-medium">
                        {item.itemDescription}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-center font-mono uppercase">
                        {item.uom || 'EA'}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black font-medium">
                        {item.subInventory || '—'}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black">
                        {item.itemCategory || '—'}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-center font-mono">
                        {item.lotBatchNo || '—'}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-center font-mono">
                        {item.serialNo || '—'}
                      </td>
                      <td className="p-0 border-r border-slate-300 print:border-black text-center font-mono text-[9px]">
                        <div className="grid grid-cols-2 divide-x divide-slate-300 print:divide-black py-1.5">
                          <span className="px-1 truncate">{item.printedPadFrom || '—'}</span>
                          <span className="px-1 truncate">{item.printedPadTo || '—'}</span>
                        </div>
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono font-bold">
                        {item.quantity}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono">
                        {Number(item.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono font-bold">
                        {Number(item.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                      </td>
                      <td className="p-1.5 text-slate-700 italic">
                        {item.remark || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary Block (Right-aligned under Qty/Price/Total) */}
            <div className="flex justify-end pt-1">
              <div className="w-full sm:w-80 text-[11px] border border-slate-400 print:border-black bg-slate-50/50 print:bg-transparent font-medium divide-y divide-slate-300 print:divide-black">
                <div className="flex justify-between px-3 py-1.5">
                  <span className="font-bold text-slate-700">Total:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {total.toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                  </span>
                </div>
                <div className="flex justify-between px-3 py-1.5">
                  <span className="font-bold text-slate-700">Transportation Cost:</span>
                  <span className="font-mono text-slate-800">
                    {transportationCost > 0 ? transportationCost.toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 }) : '—'}
                  </span>
                </div>
                <div className="flex justify-between px-3 py-1.5 bg-slate-100 print:bg-transparent">
                  <span className="font-extrabold text-slate-900">Grand Total:</span>
                  <span className="font-mono font-black text-slate-950">
                    {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Signatures & Execution Section (Two Columns as in photo) */}
            <div className="pt-10 grid grid-cols-1 sm:grid-cols-2 gap-12 text-xs text-slate-900">
              {/* Issued By */}
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold whitespace-nowrap min-w-[110px]">Issued By : Name :</span>
                  <span className="font-medium flex-1 pb-1 border-b border-slate-400 print:border-black">
                    {voucher.issuedByName || '____________________'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold whitespace-nowrap min-w-[110px]">Signature :</span>
                  <span className="flex-1 pb-1 border-b border-slate-400 print:border-black">
                    &nbsp;
                  </span>
                </div>
              </div>

              {/* Received By */}
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold whitespace-nowrap min-w-[120px]">Received By : Name :</span>
                  <span className="font-medium flex-1 pb-1 border-b border-slate-400 print:border-black">
                    {voucher.receivedByName || '____________________'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold whitespace-nowrap min-w-[120px]">Signature :</span>
                  <span className="flex-1 pb-1 border-b border-slate-400 print:border-black">
                    &nbsp;
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Footer Notice (Authentic IFMIS Database Instance Note) */}
            <div className="pt-8 border-t border-slate-200 print:border-slate-400 flex items-center justify-between text-[9px] text-slate-500 font-mono">
              <p>
                Report printed by <span className="font-bold text-slate-700">{printedBy}</span> from &quot;ifmisdb3&quot; instance on {printTimestamp}
              </p>
              <p className="font-bold">Page 1 of 1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
