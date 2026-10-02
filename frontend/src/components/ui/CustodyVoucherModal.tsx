import React from 'react';
import { Printer, X, ShieldCheck, FileCheck, Building2, UserCheck, Barcode, ExternalLink } from 'lucide-react';
import { TransactionApproval, ItemWithRelations } from '../../types/asset-management';
import { formatETB, formatGcToEc } from '../../utils/eth-date';
import { ConditionBadge } from './Badge';
import { useToast } from '../../context/ToastContext';
import { openSlipInNewTab } from '../../utils/slip-upload';

interface CustodyVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  approval?: TransactionApproval | null;
  item?: ItemWithRelations | null;
  voucherType?: 'MODEL_19_STOCK_IN' | 'MODEL_20_STOCK_OUT' | 'MODEL_22_RETURN';
}

export const CustodyVoucherModal: React.FC<CustodyVoucherModalProps> = ({
  isOpen,
  onClose,
  approval,
  item,
  voucherType = 'MODEL_20_STOCK_OUT',
}) => {
  const toast = useToast();
  if (!isOpen || (!approval && !item)) return null;

  const today = new Date().toISOString().split('T')[0];
  const slipNo = approval?.ifmisSlipNumber || item?.ifmisSlipNumber || '—';
  const slipDateGc = approval?.ifmisSlipDateGc || item?.ifmisSlipDateGc || today;
  const slipDateEc = approval?.ifmisSlipDateEc || item?.ifmisSlipDateEc || formatGcToEc(slipDateGc);
  const itemName = approval?.itemName || item?.name || '—';
  const itemCode = approval?.itemCode || item?.itemCode || 'MOA-ASSET-001';
  const serialNo = item?.serialNumber || '—';
  const category = item?.category?.replace(/_/g, ' ') || 'EQUIPMENT';
  const unitCost = item?.unitCostETB || 0;
  // A Stock-Out may issue part of a batch; otherwise the record's own units
  const quantity = Number(approval?.requestDetails?.quantity) || Number(item?.quantity) || approval?.itemUnits || 1;
  const uom = approval?.requestDetails?.uom || item?.uom || approval?.itemUom || 'EA';
  const condition = item?.condition || 'NEW';

  const isReturn = voucherType === 'MODEL_22_RETURN' || approval?.transactionType === 'RETURN';
  const isStockIn = voucherType === 'MODEL_19_STOCK_IN' || approval?.transactionType === 'STOCK_IN';

  const voucherTitle = isStockIn
    ? 'የዕቃ መረከቢያ ሰነድ — ሞዴል 19 (Model 19 GRN)'
    : isReturn
    ? 'የዕቃ መመለሻ ማዘዣ — ሞዴል 22 (Model 22 Store Return)'
    : 'የዕቃ ወጪ ማዘዣ እና መረከቢያ — ሞዴል 20 (Model 20 Issue Voucher)';

  const handlePrint = () => {
    toast.info('Preparing Printout', `Generating statutory handover document for Slip #${slipNo}...`);
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        {/* Modal Action Header (Non-printable controls) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Official MoA Store Handover Certificate</h3>
              <p className="text-[11px] text-slate-300">IFMIS Mirrored Printable Statutory Document</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(approval?.ifmisSlipAttachmentUrl || item?.ifmisSlipAttachmentUrl) && (
              <button
                type="button"
                onClick={() => openSlipInNewTab((approval?.ifmisSlipAttachmentUrl || item?.ifmisSlipAttachmentUrl)!)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-4 h-4 text-emerald-400" />
                View Scanned Slip
              </button>
            )}
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Certificate
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Document Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-900 font-sans print:p-0 print:overflow-visible">
          {/* Official Letterhead */}
          <div className="border-b-2 border-emerald-900 pb-4 text-center relative">
            <div className="flex justify-between items-start mb-2">
              <div className="text-left text-[10px] font-mono text-slate-600">
                <p>Ref No: <span className="font-bold text-slate-900">{slipNo}</span></p>
                <p>Date (G.C.): {slipDateGc}</p>
                <p>Date (E.C.): {slipDateEc}</p>
              </div>
              <div className="text-center flex-1 px-4">
                <h1 className="text-sm sm:text-base font-black uppercase text-emerald-950 tracking-tight">
                  የኢትዮጵያ ፌደራላዊ ዲሞክራሲያዊ ሪፐብሊክ
                </h1>
                <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase mt-0.5">
                  የግብርና ሚኒስቴር • Ministry of Agriculture
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wider">
                  Property Administration & Fixed Asset Division
                </p>
              </div>
              <div className="text-right text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold border border-emerald-300">
                  ORIGINAL COPY
                </span>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-200">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide bg-slate-100 py-1.5 rounded-lg border border-slate-300 inline-block px-6">
                {voucherTitle}
              </h3>
            </div>
          </div>

          {/* Reference Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">IFMIS Slip Number</span>
              <span className="font-mono font-bold text-emerald-800 text-xs">{slipNo}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">{isStockIn ? 'Receiving Store' : 'Issuing Store'}</span>
              <span className="font-semibold text-slate-800">
                {item?.storeLocation
                  ? [item.storeLocation.roomNumber, item.storeLocation.siteName].filter(Boolean).join(' — ')
                  : 'HQ Central Depot'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Voucher Status</span>
              <span className="font-bold text-emerald-700">
                {isStockIn && item?.status === 'PENDING_STOCK_IN' ? 'PENDING APPROVAL' : 'VERIFIED & APPROVED'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Asset Tag Code</span>
              <span className="font-mono font-bold text-slate-900">{itemCode}</span>
            </div>
          </div>

          {/* Asset Specification Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-700" />
              Asset & Specification Particulars (የንብረት ዝርዝር መግለጫ)
            </h4>
            <div className="border border-slate-300 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[560px]">
                <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px] border-b border-slate-300">
                  <tr>
                    <th className="py-2.5 px-3 w-32 whitespace-nowrap">Item Tag Code</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Item Description</th>
                    <th className="py-2.5 px-3 w-28 whitespace-nowrap">Category</th>
                    <th className="py-2.5 px-3 w-28 whitespace-nowrap">Serial No</th>
                    <th className="py-2.5 px-3 w-24 whitespace-nowrap">Condition</th>
                    <th className="py-2.5 px-3 w-20 text-right whitespace-nowrap">Qty</th>
                    <th className="py-2.5 px-3 w-28 text-right whitespace-nowrap">Unit Cost (ETB)</th>
                    <th className="py-2.5 px-3 w-28 text-right whitespace-nowrap">Total (ETB)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="divide-x divide-slate-200">
                    <td className="py-3 px-3 font-mono font-bold text-slate-800 whitespace-nowrap w-32">{itemCode}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900 min-w-[140px]">{itemName}</td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap w-28">{category}</td>
                    <td className="py-3 px-3 font-mono text-slate-800 whitespace-nowrap w-28">{serialNo}</td>
                    <td className="py-3 px-3 whitespace-nowrap w-24">
                      <ConditionBadge condition={condition} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-900 whitespace-nowrap w-20">
                      {quantity} {uom}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap w-28">{formatETB(unitCost)}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap w-28">{formatETB(unitCost * quantity)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Purpose / Remarks */}
          {approval?.purposeOrRemarks && (
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs">
              <span className="font-bold text-amber-900 uppercase text-[10px] block">Requisition Purpose / Justification:</span>
              <p className="text-slate-800 italic mt-0.5">"{approval.purposeOrRemarks}"</p>
            </div>
          )}

          {/* Custody Legal Declaration */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 leading-relaxed">
            <p className="font-bold text-slate-900 mb-1">Custodial Accountability Terms (የንብረት ኃላፊነት መግለጫ):</p>
            <p>
              The recipient acknowledges full physical custody and accountability for the government property listed above.
              Any damage, transfer, or disposal must be officially processed through the Ministry of Agriculture Fixed Asset System (MoA-AMS)
              in compliance with Federal Democratic Republic of Ethiopia property administration directives.
            </p>
          </div>

          {/* Signature & Seal Block */}
          <div className="pt-6 border-t border-slate-300 grid grid-cols-3 gap-4 text-xs font-medium">
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Issued By (Store Keeper):</p>
                <div className="h-10 border-b border-dashed border-slate-400 mt-1 flex items-end pb-1">
                  <span className="font-semibold text-slate-800">
                    {approval?.requestedBy?.fullNameEn || item?.registeredBy?.fullNameEn || '—'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Signature & Date</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Approved By (Dept Head):</p>
                <div className="h-10 border-b border-dashed border-slate-400 mt-1 flex items-end pb-1">
                  <span className="font-semibold text-slate-800">
                    {approval?.reviewedBy?.fullNameEn || item?.approvedBy?.fullNameEn || '—'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Signature & Stamp</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Received By (Recipient Staff):</p>
                <div className="h-10 border-b border-dashed border-slate-400 mt-1 flex items-end pb-1">
                  <span className="font-semibold text-slate-800">
                    {approval?.recipientEmployee?.fullNameEn || item?.currentCustodian?.fullNameEn || '—'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Signature & Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
