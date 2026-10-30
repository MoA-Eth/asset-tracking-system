import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2, Paperclip, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ItemWithRelations } from '../../types/asset-management';
import { displaySerialNumber } from '../../utils/asset-tag';
import { categoryLabel } from '../assets/asset-state';
import { formatETB, getTodayGcAndEc } from '../../utils/eth-date';
import { buildRecordPdf } from '../../utils/report-pdf';
import { actionText, withRoleNames } from '../../utils/roles';
import { CloseButton } from '../ui/CloseButton';
import { itemStatusOf, itemValuation } from '../ui/RecordDetailModal';
import { SlipViewerModal } from '../ui/SlipViewerModal';
import { useToast } from '../../context/ToastContext';

/** The item record laid out as on paper: the same facts as the detail window, in labelled sections */
export const recordSections = (item: ItemWithRelations): { title: string; rows: [string, string][] }[] => {
  const b = item.balance;
  const units = b ? `${b.total} received · ${b.issued} issued · ${b.available} in store (${item.uom || 'EA'})` : `${item.quantity ?? ''} ${item.uom || 'EA'}`;
  const charges: [string, string][] = item.vatApplicable
    ? [['VAT (15%)', formatETB(Math.round((item.unitCostETB || 0) * (b?.total || item.quantity || 1) * 0.15 * 100) / 100)]]
    : Number(item.additionalCharges) > 0
      ? [['Addl charges', formatETB(Number(item.additionalCharges))]]
      : [];
  return [
    {
      title: 'Item',
      rows: [
        ['Item code', item.itemCode],
        ['Description', item.name],
        ['Category', categoryLabel(item)],
        ['Status', itemStatusOf(item).label],
        ['Units', units],
        ['Unit price', formatETB(item.unitCostETB)],
        ...charges,
        ['Total valuation', formatETB(itemValuation(item))],
        ['Serial number', displaySerialNumber(item.serialNumber) || ''],
      ],
    },
    {
      title: 'Holding',
      rows: [
        ['Store', item.storeLocation?.siteName ?? ''],
        ['Custodian', item.currentCustodian?.fullNameEn || item.heldByOrganization || ''],
        ...(item.heldByContact ? [['Contact person', item.heldByContact] as [string, string]] : []),
        ['Directorate', item.assignedDepartment?.nameEn ?? ''],
      ],
    },
    {
      title: 'Receipt (Model 19)',
      rows: [
        ['Model 19 slip', item.ifmisSlipNumber ?? ''],
        ['Received on', item.ifmisSlipDateEc ? `${item.ifmisSlipDateEc} E.C. (${item.ifmisSlipDateGc})` : ''],
        ['Supplier', item.source ?? ''],
        ['Registered by', item.registeredBy?.fullNameEn ?? ''],
      ],
    },
  ];
};

/** One history step as the record prints it: when, what, by whom, and from/to with notes */
const historyRow = (h: ItemWithRelations['history'][number]) => ({
  date: `${h.dateEc} E.C.`,
  dateGc: h.dateGc,
  action: actionText(h.action),
  by: withRoleNames(h.performedBy ?? ''),
  detail: [h.fromEntity || h.toEntity ? `${h.fromEntity ?? '—'} → ${h.toEntity ?? '—'}` : '', h.notes ?? ''].filter(Boolean).join(' · '),
});

/**
 * An item's record (opened from Reports) as an official document: the page as it prints, on screen,
 * with Download PDF for the same record as a file, and the scanned Model 19 slip when there is one.
 */
export const RecordPdfViewer: React.FC<{ itemId: string; onClose: () => void }> = ({ itemId, onClose }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState<ItemWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const today = getTodayGcAndEc();

  useEffect(() => {
    let active = true;
    api
      .getItemById(itemId)
      .then((loaded) => active && setItem(loaded))
      .catch((err: any) => active && setError(err.message || 'Could not load this record.'));
    return () => {
      active = false;
    };
  }, [itemId]);

  // Escape closes the slip first when it is open over the record
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !slipUrl) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, slipUrl]);

  const download = async () => {
    if (!item || downloading) return;
    setDownloading(true);
    try {
      const blob = await buildRecordPdf({
        title: 'Item Record',
        code: item.itemCode,
        name: item.name,
        status: itemStatusOf(item).label,
        sections: recordSections(item),
        history: (item.history ?? []).map((h) => {
          const r = historyRow(h);
          return [`${r.date}\n${r.dateGc}`, r.action, r.by, r.detail.replace(/→/g, '->').replace(/ · /g, '\n')];
        }),
        dateGc: today.gc,
        dateEc: today.ecFormattedEn,
        preparedBy: user?.fullNameEn,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoA_Item_${item.itemCode}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast.error('PDF Export Failed', err.message || 'Failed to render PDF document.');
    } finally {
      setDownloading(false);
    }
  };

  const status = item ? itemStatusOf(item).label : '';
  const history = (item?.history ?? []).map(historyRow);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn"
        role="dialog"
        aria-modal="true"
        aria-label={`Item record ${item?.itemCode ?? ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white rounded-lg w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
          {/* The window: what this is, its reference, and Download */}
          <div className="flex items-center justify-between gap-3 px-5 pt-4 shrink-0">
            <p className="text-sm font-semibold text-slate-800 truncate">Item · {item?.itemCode ?? '…'}</p>
            <CloseButton onClose={onClose} label="Close record" size="sm" />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-3 pb-4 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-lg bg-moa-green text-white flex items-center justify-center shadow-sm shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="inline-block px-2.5 py-0.5 rounded-full border border-emerald-200 text-[10px] font-bold tracking-[0.18em] text-emerald-800 uppercase">
                  Official record
                </span>
                <h2 className="mt-1 text-lg font-bold text-slate-900 truncate">{item?.name ?? 'Item record'}</h2>
                <p className="text-xs text-slate-500">
                  Reference <span className="font-mono font-semibold text-slate-800">{item?.itemCode ?? '…'}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item?.ifmisSlipAttachmentUrl && (
                <button
                  type="button"
                  onClick={() => setSlipUrl(item.ifmisSlipAttachmentUrl!)}
                  className="px-3 py-2 rounded-md text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Model 19 slip
                </button>
              )}
              <button
                type="button"
                onClick={download}
                disabled={!item || downloading}
                className="px-3.5 py-2 rounded-md text-xs font-semibold text-white bg-moa-green hover:bg-moa-green-hover disabled:opacity-50 flex items-center gap-1.5 cursor-pointer disabled:cursor-default"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download PDF
              </button>
            </div>
          </div>

          {/* The document, as a page on a desk */}
          <div className="flex-1 overflow-auto mx-5 mb-5 rounded-lg border border-slate-200 bg-slate-100 p-3 sm:p-8">
            {error ? (
              <div className="flex items-center gap-2 p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            ) : !item ? (
              <div className="h-[50vh] flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                Loading the record…
              </div>
            ) : (
              <article className="mx-auto max-w-3xl bg-white rounded-md shadow-md overflow-hidden text-slate-800">
                <header className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-10 py-5 bg-emerald-50/70 border-b-[3px] border-moa-green">
                  <div className="flex items-center gap-3">
                    <img src="/moa-logo.png" alt="" className="w-10 h-10 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    <div>
                      <p className="text-[10px] tracking-wider text-slate-500 uppercase">Federal Democratic Republic of Ethiopia</p>
                      <p className="text-base font-bold text-moa-green">Ministry of Agriculture</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] tracking-[0.18em] text-slate-500 uppercase">Item record</p>
                    <p className="text-[11px] text-slate-600">
                      {today.ecFormattedEn} · {today.gc}
                    </p>
                  </div>
                </header>

                <div className="px-6 sm:px-10 py-7 space-y-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-slate-900">{item.name}</h3>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-moa-green">{item.itemCode}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded border border-moa-green/40 bg-emerald-50 text-[10px] font-bold tracking-wider text-moa-green uppercase">
                      {status}
                    </span>
                  </div>

                  {recordSections(item).map((s) => (
                    <section key={s.title}>
                      <h4 className="text-sm font-bold text-slate-900 pb-1.5 mb-1 border-b border-slate-200">{s.title}</h4>
                      <dl className="text-[13px]">
                        {s.rows.map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[minmax(110px,190px)_1fr] gap-3 py-1.5">
                            <dt className="text-slate-500">{label}</dt>
                            <dd className={`font-medium text-slate-900 break-words ${label === 'Item code' || label === 'Model 19 slip' || label === 'Serial number' ? 'font-mono' : ''}`}>
                              {value || '—'}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}

                  <section>
                    <h4 className="text-sm font-bold text-slate-900 pb-1.5 mb-1 border-b border-slate-200">History ({history.length})</h4>
                    {history.length === 0 ? (
                      <p className="py-2 text-[13px] text-slate-400">No history recorded.</p>
                    ) : (
                      <ol className="text-[13px] divide-y divide-slate-100">
                        {history.map((h, i) => (
                          <li key={i} className="grid grid-cols-[minmax(110px,190px)_1fr] gap-3 py-2">
                            <span className="text-slate-500">
                              {h.date}
                              <span className="block text-[11px] font-mono text-slate-400">{h.dateGc}</span>
                            </span>
                            <span>
                              <span className="font-semibold text-slate-900">{h.action}</span>
                              <span className="block text-slate-600">{h.by}</span>
                              {h.detail && <span className="block text-slate-500">{h.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>

                  <footer className="pt-4 border-t border-slate-200 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
                    <span>Ministry of Agriculture · Asset Tracking System</span>
                    <span>
                      Produced {today.gc}
                      {user?.fullNameEn ? ` by ${user.fullNameEn}` : ''}
                    </span>
                  </footer>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
      {slipUrl && <SlipViewerModal url={slipUrl} onClose={() => setSlipUrl(null)} />}
    </>
  );
};
