import React from 'react';
import { Printer, FileText } from 'lucide-react';
import { CloseButton } from './CloseButton';
import { MoaLogo } from './MoaLogo';
import { VoucherStatusBanner, VoucherApprovalState } from './VoucherStatusBanner';

/**
 * The one layout every printed voucher (Model 19, 21, 22) shares, so they read the same on screen and on paper:
 * toolbar, letterhead, details box, table styling, totals, signature lines and footer.
 * Each voucher only supplies its own fields and table columns.
 */

/** Amounts on every voucher: thousands separators and two decimals */
export const formatVoucherAmount = (value: number | string | undefined): string =>
  (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The value to print, or a dash when nothing was recorded */
export const orDash = (value: React.ReactNode): React.ReactNode =>
  value === undefined || value === null || value === '' ? '—' : value;

const printTimestamp = (): string => {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date} @ ${time}`;
};

// Table styling shared by every voucher grid
export const VOUCHER_TABLE_WRAP = 'overflow-x-auto border border-slate-400 print:border-black';
export const VOUCHER_TABLE = 'w-full text-left text-[10px] border-collapse';
export const VOUCHER_HEAD_ROW = 'bg-slate-100 print:bg-slate-200 border-b border-slate-400 print:border-black font-bold text-slate-900';
export const VOUCHER_TH = 'p-1.5 border-r border-slate-400 print:border-black last:border-r-0';
export const VOUCHER_BODY = 'divide-y divide-slate-300 print:divide-black';
export const VOUCHER_TD = 'p-1.5 border-r border-slate-300 print:border-black last:border-r-0';

interface VoucherShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. "Model 19" — used in the toolbar and the print button's label */
  model: string;
  /** Form name in English and Amharic, shown in the toolbar */
  toolbarTitle: string;
  /** Form title printed under the ministry name */
  title: string;
  /** Voucher number printed beside the model in the letterhead */
  number: string;
  /** Optional line under the ministry name, e.g. the program */
  subheading?: string;
  approvalState?: VoucherApprovalState;
  /** Who is printing; shown in the footer */
  printedBy?: string;
  children: React.ReactNode;
}

export const VoucherShell: React.FC<VoucherShellProps> = ({
  isOpen, onClose, model, toolbarTitle, title, number, subheading, approvalState, printedBy, children,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]">
        {/* Toolbar (not printed) */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">{toolbarTitle}</h3>
              <p className="text-[11px] text-slate-300">FDRE Ministry of Agriculture · Asset Tracking System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              aria-label={`Print ${model} / PDF`}
              className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center justify-center cursor-pointer shadow-xs h-8 w-8"
              title="Print Voucher / Save as PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
            <CloseButton onClose={onClose} title="Close Preview" label="Close Preview" tone="dark" />
          </div>
        </div>

        {/* The paper */}
        <div className="p-6 sm:p-10 overflow-y-auto font-sans text-slate-950 bg-white relative print:p-0 print:overflow-visible print:text-black">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0" aria-hidden="true">
            <span className="text-[120px] sm:text-[160px] font-black text-slate-300/15 transform -rotate-25 tracking-[0.2em]">MOA-ATS</span>
          </div>

          <div className="relative z-10 space-y-5 text-xs">
            <VoucherStatusBanner state={approvalState} />

            {/* Letterhead */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-900 pb-3">
              <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                <MoaLogo className="w-14 h-14" />
              </div>
              <div className="text-center flex-1">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">The Federal Democratic Republic of Ethiopia</h1>
                <h2 className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5">Ministry of Agriculture</h2>
                {subheading && <p className="text-xs font-semibold text-slate-700 mt-0.5">{subheading}</p>}
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-wide mt-1 uppercase">{title}</h3>
              </div>
              <div className="text-right shrink-0 min-w-[130px]">
                <div className="font-bold text-xs sm:text-sm text-slate-900">{model}</div>
                <div className="font-bold text-xs text-slate-900 mt-1">
                  No. <span className="font-mono font-black text-slate-950">{orDash(number)}</span>
                </div>
              </div>
            </div>

            {children}

            {/* Footer */}
            <div className="pt-6 border-t border-slate-300 print:border-slate-500 flex items-center justify-between gap-4 text-[9px] text-slate-600 font-mono">
              <p>
                Printed by <span className="font-bold text-slate-800">{orDash(printedBy)}</span> from the MoA Asset Tracking System on {printTimestamp()}
              </p>
              <p className="font-bold shrink-0">Page 1 of 1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface VoucherField {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}

/** Boxed label/value pairs under the letterhead, two to a row */
export const VoucherDetails: React.FC<{ fields: VoucherField[] }> = ({ fields }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 border-l border-t border-slate-400 print:border-black text-[11px]">
    {fields.map((f, i) => (
      <div
        key={f.label}
        // With an odd number of fields the last one spans the row, so the box has no empty half
        className={`flex items-baseline gap-2 p-2 border-r border-b border-slate-400 print:border-black ${
          fields.length % 2 === 1 && i === fields.length - 1 ? 'sm:col-span-2' : ''
        }`}
      >
        <dt className="font-bold text-slate-800 whitespace-nowrap min-w-[130px]">{f.label} :</dt>
        <dd className={`font-semibold text-slate-950 ${f.mono ? 'font-mono' : ''}`}>{orDash(f.value)}</dd>
      </div>
    ))}
  </dl>
);

/** Right-aligned totals box under the table; the last row is the grand total */
export const VoucherTotals: React.FC<{ rows: { label: string; value: number | undefined }[] }> = ({ rows }) => (
  <div className="flex justify-end">
    <div className="w-full sm:w-80 text-[11px] border border-slate-400 print:border-black divide-y divide-slate-300 print:divide-black">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <div key={r.label} className={`flex justify-between px-3 py-1.5 ${last ? 'bg-slate-100 print:bg-transparent' : ''}`}>
            <span className={last ? 'font-extrabold text-slate-900' : 'font-bold text-slate-700'}>{r.label}:</span>
            <span className={`font-mono ${last ? 'font-black text-slate-950' : 'font-bold text-slate-900'}`}>
              {r.value === undefined ? '—' : formatVoucherAmount(r.value)}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/** One column per signatory: role, the recorded name (or a blank line to write it), and a signature line */
export const VoucherSignatures: React.FC<{ signatories: { label: string; name?: string }[] }> = ({ signatories }) => (
  <div className={`pt-6 grid grid-cols-1 gap-8 text-[11px] text-slate-900 ${signatories.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
    {signatories.map((s) => (
      <div key={s.label} className="space-y-3">
        <p className="font-bold">{s.label}</p>
        {/* Fixed-height rows aligned to the line, so a blank name sits level with a filled one */}
        <div className="flex items-end gap-2 h-6">
          <span className="font-semibold whitespace-nowrap">Name :</span>
          <span className="font-medium flex-1 truncate border-b border-slate-500 print:border-black">{s.name || ' '}</span>
        </div>
        <div className="flex items-end gap-2 h-6">
          <span className="font-semibold whitespace-nowrap">Signature :</span>
          <span className="flex-1 border-b border-slate-500 print:border-black">{' '}</span>
        </div>
      </div>
    ))}
  </div>
);
