import React, { useCallback, useEffect, useState } from 'react';
import { PackageCheck, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { api } from '../api/client';
import { btn, table, statusTone, pill } from '../components/ui/theme';
import { Modal } from '../components/ui/Modal';
import { MyAsset } from '../types/asset-management';

const CATEGORY_LABELS: Record<string, string> = {
  IT_EQUIPMENT: 'IT Equipment & Accessories',
  AGRI_MACHINERY: 'Agricultural Machinery & Supplies',
  LAB_EQUIPMENT: 'Medical & Lab Supplies',
  VEHICLE: 'Vehicles & Transport',
  OFFICE_FURNITURE: 'Office Furniture & Fixtures',
  FIELD_GEAR: 'Field Gear & Uniforms',
};

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New', GOOD: 'Good', FAIR: 'Fair', NEEDS_REPAIR: 'Needs repair', DAMAGED: 'Damaged',
};

/** What is happening to an asset, in the words its holder would use */
const statusOf = (asset: MyAsset): { label: string; tone: string; detail?: string } => {
  if (asset.pendingRequest?.type === 'RETURN') {
    return { label: 'Return pending', tone: statusTone.pending, detail: asset.pendingRequest.stage >= 2 ? 'Waiting for final approval' : 'Waiting for the Team Leader' };
  }
  if (asset.pendingRequest?.type === 'TRANSFER' || asset.status === 'UNDER_TRANSFER') {
    return { label: 'Transfer pending', tone: statusTone.pending, detail: asset.pendingRequest && asset.pendingRequest.stage >= 2 ? 'Waiting for final approval' : 'Waiting for the Team Leader' };
  }
  return { label: 'Assigned to you', tone: statusTone.issued };
};

const units = (asset: MyAsset) => `${asset.quantity} ${asset.uom || 'EA'}`;

/** One labelled line of the details */
const Detail: React.FC<{ label: string; mono?: boolean; children?: React.ReactNode }> = ({ label, mono, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{children || '—'}</dd>
  </div>
);

/** The assets issued to the signed-in employee. Read-only, and about nobody else. */
export const MyAssetsPage: React.FC = () => {
  const [assets, setAssets] = useState<MyAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MyAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await api.getMyAssets());
    } catch (err: any) {
      setError(err?.message || 'Your assets could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const count = assets?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {assets === null
            ? 'Loading the assets assigned to you…'
            : count === 0
              ? ''
              : `${count} ${count === 1 ? 'asset is' : 'assets are'} assigned to you.`}
        </p>
        <button type="button" onClick={load} disabled={loading} className={btn.secondary}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {assets !== null && count === 0 && !error && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <PackageCheck className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Nothing is assigned to you</p>
          <p className="max-w-sm text-xs text-slate-500">
            When the store issues an asset to you, it appears here with its serial number and the slip it was issued on.
          </p>
          <p className="max-w-sm text-xs text-slate-500">
            If you think an asset should be assigned to you, contact the store.
          </p>
        </div>
      )}

      {count > 0 && (
        <>
          {/* Wide screens: one table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-xs">
              <thead>
                <tr className={table.headRow}>
                  <th className="px-3 py-2.5">Asset</th>
                  <th className="px-3 py-2.5">Serial no.</th>
                  <th className="px-3 py-2.5 text-right">Quantity</th>
                  <th className="px-3 py-2.5">Condition</th>
                  <th className="px-3 py-2.5">Assigned on</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets!.map((asset) => {
                  const status = statusOf(asset);
                  return (
                    <tr
                      key={asset.id}
                      tabIndex={0}
                      aria-label={`Open ${asset.itemCode}`}
                      onClick={() => setSelected(asset)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) setSelected(asset);
                      }}
                      className={`${table.row} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500`}
                    >
                      <td className="px-3 py-2.5">
                        <span className="block font-medium text-slate-900">{asset.name}</span>
                        <span className={`block ${table.code}`}>{asset.itemCode}</span>
                        <span className="block text-[10px] text-slate-500">{CATEGORY_LABELS[asset.category] ?? asset.category}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{asset.serialNumber || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">{units(asset)}</td>
                      <td className="px-3 py-2.5 text-slate-700">{CONDITION_LABELS[asset.condition] ?? asset.condition}</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {asset.assignedOnGc ?? '—'}
                        {asset.voucherNo && <span className="block font-mono text-[10px] text-slate-500">{asset.voucherNo}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`${pill} ${status.tone}`}>{status.label}</span>
                        {status.detail && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock className="h-3 w-3" />
                            {status.detail}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: one card each */}
          <ul className="space-y-3 sm:hidden">
            {assets!.map((asset) => {
              const status = statusOf(asset);
              return (
                <li
                  key={asset.id}
                  tabIndex={0}
                  aria-label={`Open ${asset.itemCode}`}
                  onClick={() => setSelected(asset)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) setSelected(asset);
                  }}
                  className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{asset.name}</p>
                      <p className={table.code}>{asset.itemCode}</p>
                    </div>
                    <span className={`${pill} ${status.tone} shrink-0`}>{status.label}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-slate-700">
                    <div><dt className="text-[10px] uppercase text-slate-500">Serial no.</dt><dd className="font-mono">{asset.serialNumber || '—'}</dd></div>
                    <div><dt className="text-[10px] uppercase text-slate-500">Quantity</dt><dd className="font-mono font-semibold">{units(asset)}</dd></div>
                    <div><dt className="text-[10px] uppercase text-slate-500">Condition</dt><dd>{CONDITION_LABELS[asset.condition] ?? asset.condition}</dd></div>
                    <div><dt className="text-[10px] uppercase text-slate-500">Assigned on</dt><dd>{asset.assignedOnGc ?? '—'}</dd></div>
                  </dl>
                  {status.detail && <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><Clock className="h-3 w-3" />{status.detail}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected && (
        <Modal isOpen onClose={() => setSelected(null)} title={selected.name} subtitle={selected.itemCode} size="md">
          {(() => {
            const status = statusOf(selected);
            return (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${pill} ${status.tone}`}>{status.label}</span>
                  {status.detail && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {status.detail}
                    </span>
                  )}
                </div>
                <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4">
                  <Detail label="Item code" mono>{selected.itemCode}</Detail>
                  <Detail label="Serial no." mono>{selected.serialNumber}</Detail>
                  <Detail label="Category">{CATEGORY_LABELS[selected.category] ?? selected.category}</Detail>
                  <Detail label="Condition">{CONDITION_LABELS[selected.condition] ?? selected.condition}</Detail>
                  <Detail label="Quantity" mono>{units(selected)}</Detail>
                  <Detail label="Directorate">{selected.department}</Detail>
                  <Detail label="Issued from">{selected.issuedFrom}</Detail>
                  <Detail label="Assigned on">{selected.assignedOnGc}</Detail>
                  <Detail label="Issue slip no." mono>{selected.voucherNo}</Detail>
                  <Detail label="Purpose">{selected.purpose}</Detail>
                </dl>
                <p className="text-[11px] text-slate-500">
                  You are responsible for this asset while it is assigned to you. If something is wrong with these details, contact the store.
                </p>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};

export default MyAssetsPage;
