import React from 'react';
import { VoucherStatusBanner } from './VoucherStatusBanner';
import { Printer, FileText, CheckCircle2 } from 'lucide-react';
import { CloseButton } from './CloseButton';
import { Model19Voucher, Model19LineItem } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { MoaLogo } from './MoaLogo';

interface Model19PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: Model19Voucher | null;
}

export const Model19PrintModal: React.FC<Model19PrintModalProps> = ({
  isOpen,
  onClose,
  voucher,
}) => {
  if (!isOpen || !voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  const grandTotal = voucher.grandTotal || voucher.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  const now = new Date();
  const printTimestamp = voucher.reportTakenDate || `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} @ ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]">
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Official IFMIS Model 19 Receiving Report (የዕቃ መረከቢያ ሰነድ)
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
              <span>Print Model 19 / PDF</span>
            </button>
            <CloseButton
              onClose={onClose}
              title="Close Preview"
              label="Close Preview"
              tone="dark"
            />
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
            <VoucherStatusBanner state={voucher.approvalState} />
            {/* Top Official Letterhead */}
            <div className="text-center relative pt-1">
              {/* Ministry of Agriculture logo */}
              <div className="flex justify-center mb-2">
                <MoaLogo className="w-14 h-14" />
              </div>

              <h1 className="text-xs sm:text-sm font-semibold tracking-wide text-slate-800">
                The Federal Democratic Republic of Ethiopia
              </h1>
              {voucher.programName && (
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">{voucher.programName}</h2>
              )}
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-950 mt-1 uppercase">
                Print Model19 Report
              </h3>
            </div>

            {/* Document Header Metadata Block (Aligned Right/Grid as in photo) */}
            <div className="flex justify-end pt-2 pb-1">
              <div className="w-full sm:w-auto min-w-[340px] text-xs space-y-1 bg-slate-50/70 print:bg-transparent p-3 rounded-lg border border-slate-200 print:border-none">
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">INV Model 19 No. :</span>
                  <span className="font-mono font-bold text-slate-950">{voucher.invModel19No}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">PO Number :</span>
                  <span className="font-mono font-semibold text-slate-950">{voucher.poNumber || '—'}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Received Date :</span>
                  <span className="font-medium text-slate-950">
                    {voucher.receivedDateGc} {voucher.receivedDateEc ? `(${voucher.receivedDateEc} E.C.)` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Transaction Type :</span>
                  <span className="font-medium text-slate-950">{voucher.transactionType || '—'}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
                  <span className="font-bold text-slate-800 text-right">Source :</span>
                  <span className="font-semibold text-slate-950 uppercase">{voucher.source || '—'}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <span className="font-bold text-slate-800 text-right">Buyer :</span>
                  <span className="font-medium text-slate-950">{voucher.buyer || '—'}</span>
                </div>
              </div>
            </div>

            {/* Official Model 19 Tabular Grid */}
            <div className="overflow-x-auto border border-slate-400 print:border-black rounded-xs">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200 border-b border-slate-400 print:border-black font-bold text-slate-900 text-[10px]">
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center w-8">S/No.</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black">Item Code</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black min-w-[140px]">Item Description</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center w-10">UOM</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black">Sub Inventory</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black min-w-[110px]">Item Category</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center">Lot/ Batch No.</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-center">Serial No.</th>
                    <th className="p-0 border-r border-slate-400 print:border-black text-center">
                      <div className="p-1 border-b border-slate-400 print:border-black">Sequence # of Printed Pad</div>
                      <div className="grid grid-cols-2 divide-x divide-slate-400 print:divide-black">
                        <span className="py-0.5 px-1 text-center">FROM</span>
                        <span className="py-0.5 px-1 text-center">TO</span>
                      </div>
                    </th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-12">Qty</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-16">Unit Price</th>
                    <th className="p-1.5 border-r border-slate-400 print:border-black text-right w-20">Total Amount</th>
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
                        {item.lotBatchNo || ''}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-center font-mono">
                        {item.serialNo || ''}
                      </td>
                      <td className="p-0 border-r border-slate-300 print:border-black text-center font-mono text-[9px]">
                        <div className="grid grid-cols-2 divide-x divide-slate-300 print:divide-black h-full items-center">
                          <span className="py-1 px-1">{item.printedPadFrom || ''}</span>
                          <span className="py-1 px-1">{item.printedPadTo || ''}</span>
                        </div>
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono font-semibold">
                        {item.quantity}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono">
                        {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 border-r border-slate-300 print:border-black text-right font-mono font-bold">
                        {Number(item.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-slate-600 text-[9px]">
                        {item.remark || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 print:border-black font-black bg-slate-50 print:bg-transparent">
                    <td colSpan={11} className="p-2 border-r border-slate-400 print:border-black text-right uppercase text-xs tracking-wider">
                      Grand Total
                    </td>
                    <td className="p-2 border-r border-slate-400 print:border-black text-right font-mono text-xs">
                      {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Official Sign-Off Section */}
            <div className="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs font-semibold">
              <div className="space-y-1">
                <p>Delivered By : Name : <span className="font-mono underline underline-offset-4">{voucher.deliveredByName || '______________________________________'}</span></p>
              </div>
              <div className="space-y-1 sm:text-right">
                <p>Received By : Name : <span className="font-mono underline underline-offset-4">{voucher.receivedByName || '______________________________________'}</span></p>
              </div>
            </div>

            {/* Official Instance Footnote */}
            <div className="pt-8 border-t border-slate-200 print:border-slate-400 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 font-mono">
              <p>
                Report Taken By: <span className="font-semibold text-slate-700">{voucher.reportTakenBy || '—'}</span> on {printTimestamp} from the Asset Tracking System.
              </p>
              <p>Page 1 of 1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
