import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';

/** Where a request stands when its voucher is printed; an approved request has no banner */
export type VoucherApprovalState = 'PENDING' | 'REJECTED';

const TEXT: Record<VoucherApprovalState, { title: string; detail: string }> = {
  PENDING: {
    title: 'NOT YET APPROVED · ገና አልጸደቀም',
    detail: 'This request is waiting for the Team Leader and the Department Head. It is not valid as a receipt until both have approved it.',
  },
  REJECTED: {
    title: 'REJECTED · ውድቅ ተደርጓል',
    detail: 'This request was rejected. This copy is for reference only and is not valid as a receipt.',
  },
};

/** Printed at the top of a voucher so a copy made before approval can't pass for an approved one */
export const VoucherStatusBanner: React.FC<{ state?: VoucherApprovalState }> = ({ state }) => {
  if (!state) return null;
  const Icon = state === 'REJECTED' ? XCircle : AlertTriangle;
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-lg border-2 border-dashed px-3.5 py-2.5 print:break-inside-avoid ${
        state === 'REJECTED' ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-amber-500 bg-amber-50 text-amber-900'
      }`}
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="text-xs font-extrabold tracking-wide">{TEXT[state].title}</p>
        <p className="text-[11px] leading-snug">{TEXT[state].detail}</p>
      </div>
    </div>
  );
};
