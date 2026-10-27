import React, { useEffect } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { CloseButton } from '../ui/CloseButton';
import { SlipContent, useSlip } from '../ui/SlipViewerModal';

interface ReportPdfViewerProps {
  /** The PDF; while it is null the viewer says it is being prepared */
  file: File | null;
  title: string;
  subtitle?: string;
  /** Why the PDF could not be made, shown instead of it */
  error?: string | null;
  /** More buttons beside Download, e.g. the scanned Model 19 slip */
  actions?: React.ReactNode;
  onClose: () => void;
}

/** The PDF's pages: kept apart so the slip reader only starts once there is a file */
const Pages: React.FC<{ file: File }> = ({ file }) => {
  const state = useSlip(undefined, file);
  return <SlipContent state={state} fileName={file.name} what="Report" heightClass="h-[82vh]" />;
};

/**
 * A report shown as the PDF it is: the formatted pages on screen (the browser's own viewer, with its print button,
 * or pages the app draws on a phone), with Download for the file itself.
 */
export const ReportPdfViewer: React.FC<ReportPdfViewerProps> = ({ file, title, subtitle, error, actions, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-md w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{title}</p>
              {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {actions}
            <button
              type="button"
              onClick={download}
              disabled={!file}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-moa-green hover:bg-moa-green-hover disabled:opacity-50 flex items-center gap-1.5 cursor-pointer disabled:cursor-default"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
            <CloseButton onClose={onClose} label="Close report" size="sm" />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100">
          {error ? (
            <div className="m-4 flex items-center gap-2 p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          ) : file ? (
            <Pages file={file} />
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              Preparing the PDF…
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
