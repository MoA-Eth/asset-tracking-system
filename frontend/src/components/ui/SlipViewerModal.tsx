import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, FileX, RefreshCw, X } from 'lucide-react';
import { getSlipDisplayName } from '../../utils/slip-upload';

interface SlipViewerModalProps {
  url: string;
  onClose: () => void;
}

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; kind: 'pdf' | 'image'; objectUrl: string }
  | { status: 'missing' };

/**
 * Previews a scanned IFMIS slip (PDF or image). Sits above other modals (z-60).
 * Records created before real uploads existed point at files that were never
 * stored, so anything that isn't a PDF/image response is shown as "not available".
 */
export const SlipViewerModal: React.FC<SlipViewerModalProps> = ({ url, onClose }) => {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const fileName = getSlipDisplayName(url);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        const contentType = res.headers.get('content-type') || '';
        const kind = contentType.startsWith('application/pdf')
          ? 'pdf'
          : contentType.startsWith('image/')
          ? 'image'
          : null;
        if (!res.ok || !kind) {
          if (!cancelled) setState({ status: 'missing' });
          return;
        }
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setState({ status: 'ready', kind, objectUrl });
      } catch {
        if (!cancelled) setState({ status: 'missing' });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={`IFMIS slip ${fileName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-panel bg-white rounded-2xl min-w-0 w-full max-w-4xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{fileName}</p>
              <p className="text-[10px] text-slate-500">Scanned IFMIS Slip Attachment</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {state.status === 'ready' && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              aria-label="Close slip viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
          {state.status === 'loading' && (
            <div className="flex items-center justify-center py-24 text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
              Loading slip...
            </div>
          )}

          {state.status === 'ready' && state.kind === 'image' && (
            <img src={state.objectUrl} alt={`IFMIS slip ${fileName}`} className="block max-w-full max-h-[78dvh] mx-auto object-contain" />
          )}

          {state.status === 'ready' && state.kind === 'pdf' && (
            <iframe src={state.objectUrl} title={`IFMIS slip ${fileName}`} className="w-full h-[78dvh] border-0 bg-white" />
          )}

          {state.status === 'missing' && (
            <div className="py-20 px-6 text-center space-y-2">
              <FileX className="w-8 h-8 text-amber-600 mx-auto" />
              <p className="text-sm font-bold text-slate-900">Slip file not available</p>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                This request references <span className="font-mono">{fileName}</span>, but the file could not be
                loaded. It was probably recorded before slip uploads were enabled.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
