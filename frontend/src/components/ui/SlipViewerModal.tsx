import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, FileX, RefreshCw } from 'lucide-react';
import { CloseButton } from './CloseButton';
import { DocumentSkeleton } from './Skeleton';
import { getSlipDisplayName, fetchSlip } from '../../utils/slip-upload';

interface SlipViewerModalProps {
  /** A slip already saved with a record */
  url?: string;
  /** A file just attached in a form, not saved yet */
  file?: File;
  onClose: () => void;
}

export type SlipState =
  | { status: 'loading' }
  | { status: 'ready'; kind: 'pdf' | 'image'; objectUrl: string }
  | { status: 'missing' };

/**
 * A slip (PDF or image) ready to show: a file just attached is shown straight from the browser, a saved one is
 * fetched. Records created before real uploads existed point at files that were never stored, so anything that
 * isn't a PDF/image response is "missing".
 */
export function useSlip(url?: string, file?: File | null): SlipState {
  const [state, setState] = useState<SlipState>({ status: 'loading' });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const release = () => {
      if (objectUrl) URL.revokeObjectURL?.(objectUrl);
    };

    if (file) {
      const kind = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        ? 'pdf'
        : file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)
        ? 'image'
        : null;
      if (!kind) {
        setState({ status: 'missing' });
        return;
      }
      objectUrl = URL.createObjectURL(file);
      setState({ status: 'ready', kind, objectUrl });
      return release;
    }

    if (!url) {
      setState({ status: 'missing' });
      return;
    }
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetchSlip(url);
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
      release();
    };
  }, [url, file]);

  return state;
}

/**
 * How the browser's PDF viewer opens the slip: without its side panel of page thumbnails, the page as wide as the
 * frame. pagemode and zoom are read by Firefox, navpanes and view by Chrome and Edge; each ignores the others.
 */
const PDF_OPEN = '#pagemode=none&navpanes=0&zoom=page-width&view=FitH';

/** The slip itself: the PDF in the browser's own viewer, or the image */
export const SlipContent: React.FC<{ state: SlipState; fileName: string; heightClass?: string }> = ({ state, fileName, heightClass = 'h-[78vh]' }) => (
  <>
    {state.status === 'loading' && (
      <DocumentSkeleton heightClass={heightClass} />
    )}

    {state.status === 'ready' && state.kind === 'image' && (
      <img src={state.objectUrl} alt={`IFMIS slip ${fileName}`} className="block mx-auto object-contain max-h-[78vh]" />
    )}

    {state.status === 'ready' && state.kind === 'pdf' && (
      <iframe src={`${state.objectUrl}${PDF_OPEN}`} title={`IFMIS slip ${fileName}`} className={`w-full border-0 bg-white ${heightClass}`} />
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
  </>
);

/** Previews a scanned IFMIS slip (PDF or image), saved or just attached in a form. Sits above other modals (z-60). */
export const SlipViewerModal: React.FC<SlipViewerModalProps> = ({ url, file, onClose }) => {
  const state = useSlip(url, file);
  const fileName = file?.name ?? getSlipDisplayName(url ?? '');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={`IFMIS slip ${fileName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-md w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{fileName}</p>
              <p className="text-[10px] text-slate-500">{file ? 'Attached, not saved yet' : 'Scanned IFMIS Slip Attachment'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {state.status === 'ready' && (
              <a
                href={state.objectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
            )}
            <CloseButton
              onClose={onClose}
              label="Close slip viewer"
              size="sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100">
          <SlipContent state={state} fileName={fileName} />
        </div>
      </div>
    </div>
  );
};
