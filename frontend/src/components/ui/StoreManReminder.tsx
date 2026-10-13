import React, { useEffect, useState } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Store } from '../../types/asset-management';

interface Props {
  /** Goes to Settings → Stores; left out on the Stores page itself */
  onAssign?: () => void;
  /** Stores already loaded by the page, so they are not fetched twice */
  stores?: Store[];
}

/**
 * Tells the people who manage stores which active stores have no store man yet. Work carries on without one,
 * but the vouchers of such a store name nobody, so this keeps the gap visible until it is filled.
 */
export const StoreManReminder: React.FC<Props> = ({ onAssign, stores: given }) => {
  const { user } = useAuth();
  const canManage = user?.permissions?.includes('references.manage') ?? false;
  const [loaded, setLoaded] = useState<Store[] | null>(null);

  useEffect(() => {
    if (!canManage || given) return;
    let cancelled = false;
    api
      .getStores()
      .then((list) => {
        if (!cancelled) setLoaded(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canManage, given]);

  const stores = given ?? loaded;
  if (!canManage || !stores) return null;
  const without = stores.filter((s) => s.isActive !== false && !(s.storeKeepers ?? []).some((k) => k.isActive !== false));
  if (without.length === 0) return null;

  const names = without.slice(0, 3).map((s) => s.name).join(', ') + (without.length > 3 ? ` and ${without.length - 3} more` : '');
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600" />
        <span>
          <strong>
            {without.length === 1 ? '1 store has' : `${without.length} stores have`} no store man assigned
          </strong>{' '}
          ({names}). Their vouchers name no store man until one is added.
        </span>
      </p>
      {onAssign && (
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 transition hover:bg-amber-100 cursor-pointer"
        >
          <UserCheck className="h-3.5 w-3.5" />
          Assign store men
        </button>
      )}
    </div>
  );
};
