import React, { useRef } from 'react';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import { Model21Voucher } from '../../types/asset-management';

interface Model21PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: Model21Voucher | null;
}

export const Model21PrintModal: React.FC<Model21PrintModalProps> = ({
  isOpen,
  onClose,
  voucher,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  const reportTakenBy = voucher.reportTakenBy || '—';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  const printTimestamp = voucher.reportTakenDate || `${dateStr} @ ${timeStr}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]">
        {/* Top Action Toolbar (Hidden during actual paper printing) */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Official Model 21 Fixed Asset Internal Transfer Form (የንብረት ዝውውር ፎርም)
              </h3>
              <p className="text-[11px] text-slate-300">
                FDRE Ministry of Agriculture Standard Fixed Asset Internal Transfer Form
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
              <span>Print Model 21 / PDF</span>
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

        {/* Printable Paper Canvas (Styled to replicate Ethiopian Government physical voucher) */}
        <div
          ref={printAreaRef}
          className="p-6 sm:p-10 overflow-y-auto font-sans text-slate-950 bg-white relative print:p-0 print:overflow-visible print:text-black"
        >
          {/* Subtle Watermark for authenticity */}
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0"
          >
            <span className="text-[120px] sm:text-[160px] font-black text-slate-300/15 transform -rotate-25 tracking-[0.2em]">
              MOA-AMS
            </span>
          </div>

          <div className="relative z-10 space-y-4 text-xs">
            {/* ── Document Top Header ── */}
            <div className="flex items-start justify-between border-b border-slate-900 pb-3">
              {/* Left: Ethiopian National Emblem */}
              <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-14 h-14 text-slate-800" fill="currentColor">
                  {/* Outer circle */}
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  {/* Radiant rays ring */}
                  <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                  {/* National Star with central rays */}
                  <path
                    d="M 50 16 L 58 38 L 82 38 L 63 52 L 70 75 L 50 61 L 30 75 L 37 52 L 18 38 L 42 38 Z"
                    fill="currentColor"
                  />
                  <circle cx="50" cy="48" r="8" fill="white" />
                  <path d="M 50 42 L 50 54 M 44 48 L 56 48" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>

              {/* Center: Official Ministry Headings */}
              <div className="text-center flex-1 px-4">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  The Federal Democratic Republic of Ethiopia
                </h1>
                <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight mt-0.5">
                  Ministry of Agriculture
                </h2>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-700 tracking-wide mt-0.5 uppercase">
                  Fixed Asset Internal Transfer Form
                </h3>
              </div>

              {/* Right: Model 21 & Number */}
              <div className="text-right shrink-0 min-w-[130px]">
                <div className="font-bold text-xs sm:text-sm text-slate-900">
                  Model/21
                </div>
                <div className="font-bold text-xs text-slate-900 mt-1">
                  Model # <span className="font-mono text-slate-950 font-black">{voucher.model21No}</span>
                </div>
              </div>
            </div>

            {/* ── Employee Transfer Box (Header Information) ── */}
            <div className="border border-slate-900 divide-y divide-slate-900 text-[11px] font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-900">
                <div className="p-2 flex items-center gap-2">
                  <span className="font-bold text-slate-900 whitespace-nowrap min-w-[130px]">From Employee Name :</span>
                  <span className="font-semibold text-slate-950 truncate">{voucher.fromEmployeeName || '—'}</span>
                </div>
                <div className="p-2 flex items-center gap-2">
                  <span className="font-bold text-slate-900 whitespace-nowrap min-w-[40px]">To :</span>
                  <span className="font-semibold text-slate-950 truncate">{voucher.toEmployeeName || '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-900">
                <div className="p-2 flex items-center gap-2">
                  <span className="font-bold text-slate-900 whitespace-nowrap min-w-[130px]">From Employee ID :</span>
                  <span className="font-mono font-semibold text-slate-950">{voucher.fromEmployeeId || '—'}</span>
                </div>
                <div className="p-2 flex items-center gap-2">
                  <span className="font-bold text-slate-900 whitespace-nowrap min-w-[40px]">To :</span>
                  <span className="font-mono font-semibold text-slate-950">{voucher.toEmployeeId || '—'}</span>
                </div>
              </div>

              <div className="p-2 flex items-center gap-2">
                <span className="font-bold text-slate-900 whitespace-nowrap min-w-[130px]">Book :</span>
                <span className="font-semibold text-slate-950">{voucher.book || 'MOA MC BOOK'}</span>
              </div>
            </div>

            {/* ── Main Tabular Grid ── */}
            <div className="overflow-x-auto border border-slate-900">
              <table className="w-full text-left text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200 border-b border-slate-900 font-bold text-slate-900">
                    <th className="p-1.5 border-r border-slate-900 text-center w-7">#</th>
                    <th className="p-1.5 border-r border-slate-900 min-w-[130px]">Description</th>
                    <th className="p-1.5 border-r border-slate-900 whitespace-nowrap">Tag Number</th>
                    <th className="p-1.5 border-r border-slate-900 text-center whitespace-nowrap">Serial Number</th>
                    <th className="p-1.5 border-r border-slate-900 text-center whitespace-nowrap">Chassis Number</th>
                    <th className="p-1.5 border-r border-slate-900 text-center w-8">UOM</th>
                    <th className="p-1.5 border-r border-slate-900 text-center w-8">Unit</th>
                    <th className="p-1.5 border-r border-slate-900 text-right whitespace-nowrap">Orig. Cost</th>
                    <th className="p-1.5 border-r border-slate-900 text-right whitespace-nowrap">Depreciation</th>
                    <th className="p-1.5 border-r border-slate-900 text-right whitespace-nowrap">Book Value</th>
                    <th className="p-1.5 border-r border-slate-900 text-center whitespace-nowrap">Date</th>
                    <th className="p-1.5 border-r border-slate-900 min-w-[110px]">From Location</th>
                    <th className="p-1.5 border-r border-slate-900 min-w-[110px]">To Location</th>
                    <th className="p-1.5 text-center w-10">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-[10px]">
                  {voucher.items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-1.5 border-r border-slate-900 text-center font-mono">{item.sNo || idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-900 font-medium">{item.description}</td>
                      <td className="p-1.5 border-r border-slate-900 font-mono font-bold whitespace-nowrap">{item.tagNumber}</td>
                      <td className="p-1.5 border-r border-slate-900 font-mono text-center">{item.serialNumber || '—'}</td>
                      <td className="p-1.5 border-r border-slate-900 font-mono text-center">{item.chassisNumber || '—'}</td>
                      <td className="p-1.5 border-r border-slate-900 text-center font-mono uppercase">{item.uom || 'EA'}</td>
                      <td className="p-1.5 border-r border-slate-900 text-center font-mono font-bold">{item.unit || 1}</td>
                      <td className="p-1.5 border-r border-slate-900 text-right font-mono">
                        {Number(item.origCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 border-r border-slate-900 text-right font-mono">
                        {Number(item.depreciation).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 border-r border-slate-900 text-right font-mono font-bold">
                        {Number(item.bookValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 border-r border-slate-900 text-center font-mono whitespace-nowrap">{item.dateGc}</td>
                      <td className="p-1.5 border-r border-slate-900">{item.fromLocation || 'Central Store'}</td>
                      <td className="p-1.5 border-r border-slate-900">{item.toLocation || 'Regional Directorate'}</td>
                      <td className="p-1.5 text-center text-slate-600 italic">{item.remark || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Technical Specifications & Vehicle/Asset Particulars (Matching photo lower table) ── */}
            {voucher.items.some((i) => i.plateNo || i.engineNo || (i.accessories && i.accessories.length > 0) || (i.tireNos && i.tireNos.length > 0) || i.remark) && (
              <div className="border border-slate-900 p-3 bg-slate-50/50 print:bg-transparent text-[10px] grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Column 1: Plate No, Engine No, Accessories */}
                <div className="space-y-1.5">
                  {voucher.items[0]?.plateNo && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 min-w-[70px]">Plate No</span>
                      <span className="font-mono font-bold text-slate-950">{voucher.items[0].plateNo}</span>
                    </div>
                  )}
                  {voucher.items[0]?.engineNo && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 min-w-[70px]">Engine No</span>
                      <span className="font-mono font-semibold text-slate-950">{voucher.items[0].engineNo}</span>
                    </div>
                  )}
                  {voucher.items[0]?.accessories && voucher.items[0].accessories.length > 0 && (
                    <div className="pt-1">
                      <span className="font-bold text-slate-900 block mb-1">Accessory</span>
                      <div className="space-y-0.5">
                        {voucher.items[0].accessories.map((acc, idx) => (
                          <div key={idx} className="flex justify-between max-w-[200px] text-slate-800">
                            <span>{acc.name}</span>
                            <span className="font-mono font-bold">{acc.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 2: Tire numbers */}
                <div>
                  {voucher.items[0]?.tireNos && voucher.items[0].tireNos.length > 0 && (
                    <div>
                      <span className="font-bold text-slate-900 block mb-1">tire no</span>
                      <div className="space-y-0.5 font-mono text-slate-800">
                        {voucher.items[0].tireNos.map((tire, idx) => (
                          <div key={idx}>{tire}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 3: Remarks / Defect notes */}
                <div>
                  <span className="font-bold text-slate-900 block mb-1">Remark</span>
                  <div className="text-slate-800 italic leading-relaxed whitespace-pre-line">
                    {voucher.items[0]?.remark || 'No defects reported.'}
                  </div>
                </div>
              </div>
            )}

            {/* ── Recipient Certification Statement ── */}
            <div className="pt-2 text-slate-900 font-serif italic text-[11px]">
              &ldquo;I the undersigned recipient, hereby, certify that I have correctly counted and received the items listed above.&rdquo;
            </div>

            {/* ── Tripartite Signatures Block (Transferor, FAMU Accountant, Recipient) ── */}
            <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-[10px]">
              {/* Transferor */}
              <div className="space-y-2">
                <span className="font-bold text-slate-900 block">Transferor Name and Signature</span>
                <span className="font-medium text-slate-800 block truncate">
                  {voucher.fromEmployeeName || '____________________'}
                </span>
                <div className="border-b border-slate-900 pt-6"></div>
              </div>

              {/* FAMU Accountant */}
              <div className="space-y-2">
                <span className="font-bold text-slate-900 block">FAMU Accountant Name and Signature</span>
                <span className="font-medium text-slate-800 block">
                  {voucher.famuAccountantName || '____________________'}
                </span>
                <div className="border-b border-slate-900 pt-6"></div>
              </div>

              {/* Recipient */}
              <div className="space-y-2">
                <span className="font-bold text-slate-900 block">Recipient&apos;s Name and Signature</span>
                <span className="font-medium text-slate-800 block truncate">
                  {voucher.toEmployeeName || '____________________'}
                </span>
                <div className="border-b border-slate-900 pt-6 relative">
                  <div className="absolute right-2 bottom-1 transform -rotate-6 font-serif italic text-blue-900 text-xs opacity-75 print:opacity-100">
                    {voucher.toEmployeeName ? `✓ ${voucher.toEmployeeName.split(',')[0]}` : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer Instance Notice ── */}
            <div className="pt-6 border-t border-slate-400 flex items-center justify-between text-[9px] text-slate-600 font-mono">
              <p>
                Report Taken By: <span className="font-bold text-slate-800">{reportTakenBy}</span> on {printTimestamp}
              </p>
              <p className="font-bold">Page 1 of 1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
