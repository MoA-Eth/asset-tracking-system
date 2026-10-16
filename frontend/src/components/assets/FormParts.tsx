import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useSlip, SlipContent } from '../ui/SlipViewerModal';
import { getSlipDisplayName } from '../../utils/slip-upload';

// Pieces the voucher forms (Model 19 receipt, Model 22 issue) share

/** A part of the form: a quiet heading and a rule instead of a card */
export const Part: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section aria-label={title} className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

/**
 * The uploaded slip, shown open under the form as soon as it is chosen, so what was filled in can be checked
 * against it without opening anything. With both files it shows the IFMIS PDF first and can switch to the signed copy;
 * a correction with nothing new shows the copy saved with the record.
 */
export const SlipPreview: React.FC<{ ifmisFile: File | null; signedFile: File | null; savedUrl?: string }> = ({ ifmisFile, signedFile, savedUrl }) => {
  const choices = [
    ifmisFile && { key: 'ifmis', label: 'IFMIS PDF', file: ifmisFile, url: undefined },
    signedFile && { key: 'signed', label: 'Signed copy', file: signedFile, url: undefined },
    !ifmisFile && !signedFile && savedUrl && { key: 'saved', label: 'Saved copy', file: null, url: savedUrl },
  ].filter(Boolean) as { key: string; label: string; file: File | null; url?: string }[];
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const shown = choices.find((c) => c.key === picked) ?? choices[0];
  const state = useSlip(shown?.url, shown?.file);
  if (!shown) return null;
  const fileName = shown.file?.name ?? getSlipDisplayName(shown.url ?? '');
  const tab = (active: boolean) =>
    `rounded-md px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;

  return (
    <Part
      title="Slip preview"
      aside={
        <div className="flex flex-wrap items-center gap-1">
          {choices.length > 1 &&
            choices.map((c) => (
              <button key={c.key} type="button" aria-pressed={c.key === shown.key} onClick={() => setPicked(c.key)} className={tab(c.key === shown.key)}>
                {c.label}
              </button>
            ))}
          {state.status === 'ready' && (
            <a href={state.objectUrl} target="_blank" rel="noopener noreferrer" className={`${tab(false)} inline-flex items-center gap-1`}>
              <ExternalLink className="h-3 w-3" /> New tab
            </a>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} className={`${tab(false)} inline-flex items-center gap-1`}>
            {open ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {open ? 'Hide' : 'Show'}
          </button>
        </div>
      }
    >
      {open ? (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <SlipContent state={state} fileName={fileName} heightClass="h-[75vh]" />
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">{fileName}: hidden.</p>
      )}
    </Part>
  );
};
