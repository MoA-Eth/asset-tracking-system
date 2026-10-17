import React from 'react';
import clsx from 'clsx';

// ══════════════════════════════════════════════════════════════════════
// 1. BASE SKELETON PRIMITIVES (LinkedIn-Style)
// ══════════════════════════════════════════════════════════════════════

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Base shimmering block that respects border radius and dimensions.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => (
  <div
    aria-hidden="true"
    className={clsx('skeleton-shimmer rounded-[4px]', className)}
    {...props}
  />
);

/**
 * Multi-line paragraph placeholder with natural LinkedIn-style varying line lengths.
 */
export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
  lineClassName?: string;
}> = ({ lines = 3, className, lineClassName }) => {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3'];
  return (
    <div className={clsx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx('h-3.5', widths[i % widths.length], lineClassName)}
        />
      ))}
    </div>
  );
};

/**
 * Circular or rounded avatar placeholder.
 */
export const SkeletonAvatar: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}> = ({ size = 'md', className }) => {
  const sizeClasses = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
    xl: 'h-14 w-14',
  };
  return (
    <Skeleton
      className={clsx('rounded-full shrink-0', sizeClasses[size], className)}
    />
  );
};

/**
 * Pill-shaped badge / chip placeholder.
 */
export const SkeletonBadge: React.FC<{
  width?: string;
  className?: string;
}> = ({ width = 'w-16', className }) => (
  <Skeleton className={clsx('h-5 rounded-full', width, className)} />
);

/**
 * Button placeholder matching institutional button heights.
 */
export const SkeletonButton: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  width?: string;
  className?: string;
}> = ({ size = 'md', width = 'w-24', className }) => {
  const heightClasses = {
    sm: 'h-7',
    md: 'h-8 sm:h-8.5',
    lg: 'h-10',
  };
  return (
    <Skeleton
      className={clsx('rounded-[4px]', heightClasses[size], width, className)}
    />
  );
};

/**
 * Card container with subtle border matching .moa-card.
 */
export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className, children, ...props }) => (
  <div
    className={clsx(
      'rounded-md border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.06)]',
      className
    )}
    aria-hidden="true"
    {...props}
  >
    {children}
  </div>
);

// ══════════════════════════════════════════════════════════════════════
// 2. COMPOUND PAGE & SECTION SKELETONS
// ══════════════════════════════════════════════════════════════════════

/**
 * Executive Dashboard Skeleton:
 * Mimics header filters, 6 KPI StatCards, 2 Charts, and Recent Activities.
 */
export const DashboardSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading dashboard"
    className="space-y-4 animate-fadeIn"
  >
    <span className="sr-only">Loading dashboard…</span>

    {/* Header / Filter Toolbar Skeleton */}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 border border-slate-200 shadow-xs">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-20 rounded-[4px]" />
      </div>
    </div>

    {/* Top 6 KPI Stat Cards */}
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-2.5 w-14" />
        </SkeletonCard>
      ))}
    </div>

    {/* 2 Main Charts Row */}
    <div className="grid gap-3.5 lg:grid-cols-2">
      {/* Category Breakdown Chart Skeleton */}
      <SkeletonCard className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-7 w-20 rounded-[4px]" />
        </div>
        <div className="space-y-2.5 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Store Distribution Chart Skeleton */}
      <SkeletonCard className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-7 w-20 rounded-[4px]" />
        </div>
        <div className="space-y-2.5 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>

    {/* Recent Activities Section Skeleton */}
    <SkeletonCard className="p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
          >
            <div className="flex items-center gap-3">
              <SkeletonAvatar size="sm" />
              <div className="space-y-1">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </div>
            <SkeletonBadge width="w-20" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  </div>
);

/**
 * Assets Page Table Skeleton:
 * Mimics 8 columns of the institutional asset register table.
 */
export const AssetsTableSkeleton: React.FC<{ rows?: number }> = ({
  rows = 7,
}) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading assets"
    className="overflow-x-auto rounded-b-md"
  >
    <span className="sr-only">Loading assets…</span>
    <table className="w-full text-left text-xs border-collapse">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50">
          <th className="px-3.5 py-2.5 w-32"><Skeleton className="h-3 w-20" /></th>
          <th className="px-3.5 py-2.5 min-w-[200px]"><Skeleton className="h-3 w-32" /></th>
          <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-24" /></th>
          <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-24" /></th>
          <th className="px-3.5 py-2.5 w-28"><Skeleton className="h-3 w-16" /></th>
          <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-28" /></th>
          <th className="px-3.5 py-2.5 w-28 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
          <th className="px-3.5 py-2.5 w-12 text-center"><Skeleton className="h-3 w-6 mx-auto" /></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
            {/* Tag / Code */}
            <td className="px-3.5 py-3">
              <Skeleton className="h-3.5 w-20 font-mono" />
              <Skeleton className="h-2.5 w-14 mt-1" />
            </td>
            {/* Asset Description */}
            <td className="px-3.5 py-3">
              <Skeleton className="h-3.5 w-48" />
              <div className="flex items-center gap-2 mt-1">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </td>
            {/* Category */}
            <td className="px-3.5 py-3">
              <Skeleton className="h-3.5 w-28" />
            </td>
            {/* Store / Location */}
            <td className="px-3.5 py-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-16 mt-1" />
            </td>
            {/* Status */}
            <td className="px-3.5 py-3">
              <SkeletonBadge width={i % 2 === 0 ? 'w-20' : 'w-16'} />
            </td>
            {/* Custody / Holder */}
            <td className="px-3.5 py-3">
              <Skeleton className="h-3.5 w-32" />
            </td>
            {/* Value (ETB) */}
            <td className="px-3.5 py-3 text-right">
              <Skeleton className="h-3.5 w-20 ml-auto" />
            </td>
            {/* Actions */}
            <td className="px-3.5 py-3 text-center">
              <Skeleton className="h-6 w-6 rounded-[4px] mx-auto" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Approvals Page Table / Card Skeleton:
 * Mimics statutory request items awaiting review or authorization.
 */
export const ApprovalsSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading approvals"
    className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10)] border border-slate-200"
  >
    <span className="sr-only">Loading approval requests registry…</span>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-28" /></th>
            <th className="px-3.5 py-2.5 w-28"><Skeleton className="h-3 w-16" /></th>
            <th className="px-3.5 py-2.5 w-44"><Skeleton className="h-3 w-24" /></th>
            <th className="px-3.5 py-2.5 min-w-[200px]"><Skeleton className="h-3 w-36" /></th>
            <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-24" /></th>
            <th className="px-3.5 py-2.5 w-28 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3.5 py-3.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-2.5 w-16 mt-1" />
              </td>
              <td className="px-3.5 py-3.5">
                <SkeletonBadge width="w-20" />
              </td>
              <td className="px-3.5 py-3.5">
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size="xs" />
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              </td>
              <td className="px-3.5 py-3.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-2.5 w-32 mt-1" />
              </td>
              <td className="px-3.5 py-3.5">
                <SkeletonBadge width="w-24" />
              </td>
              <td className="px-3.5 py-3.5 text-right">
                <div className="flex justify-end gap-1.5">
                  <SkeletonButton size="sm" width="w-16" />
                  <SkeletonButton size="sm" width="w-14" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * Audit Log Skeleton:
 * Mimics search bar + audit trail table (Timestamp, Actor, Action, Entity, Changes).
 */
export const AuditLogSkeleton: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading audit log"
    className="space-y-2.5 animate-fadeIn pb-8"
  >
    <span className="sr-only">Loading the audit log…</span>
    <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10)] border border-slate-200">
      {/* Search & Actions Bar Skeleton */}
      <div className="border-b border-slate-200 px-3.5 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <Skeleton className="h-8.5 w-full sm:w-72 rounded-[4px]" />
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Skeleton className="h-8.5 w-28 rounded-[4px]" />
          <Skeleton className="h-8.5 w-24 rounded-[4px]" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-20" /></th>
              <th className="px-3.5 py-2.5 w-44"><Skeleton className="h-3 w-16" /></th>
              <th className="px-3.5 py-2.5 w-32"><Skeleton className="h-3 w-16" /></th>
              <th className="px-3.5 py-2.5 w-40"><Skeleton className="h-3 w-24" /></th>
              <th className="px-3.5 py-2.5 min-w-[240px]"><Skeleton className="h-3 w-20" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-16 mt-1" />
                </td>
                <td className="px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <SkeletonAvatar size="xs" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <SkeletonBadge width="w-24" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-28 font-mono" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-full max-w-sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

/**
 * Reports Page Skeleton:
 * Mimics header tabs, 4 KPI stats cards, category chart, and data table.
 */
export const ReportsSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading reports"
    className="space-y-3.5 animate-fadeIn pb-3"
  >
    <span className="sr-only">Loading asset reports…</span>

    {/* Top Filter & Export Bar Skeleton */}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 border border-slate-200 shadow-xs">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-24 rounded-[4px]" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-[4px]" />
        <Skeleton className="h-8 w-20 rounded-[4px]" />
      </div>
    </div>

    {/* 4 Summary Stat Cards */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="p-3.5 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-2.5 w-16" />
        </SkeletonCard>
      ))}
    </div>

    {/* Table Skeleton */}
    <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10)] border border-slate-200">
      <div className="p-3 border-b border-slate-100 flex items-center justify-between">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-7 w-24 rounded-[4px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3.5 py-2.5 w-28"><Skeleton className="h-3 w-20" /></th>
              <th className="px-3.5 py-2.5 min-w-[180px]"><Skeleton className="h-3 w-24" /></th>
              <th className="px-3.5 py-2.5 w-32"><Skeleton className="h-3 w-20" /></th>
              <th className="px-3.5 py-2.5 w-28"><Skeleton className="h-3 w-16" /></th>
              <th className="px-3.5 py-2.5 w-32"><Skeleton className="h-3 w-20" /></th>
              <th className="px-3.5 py-2.5 w-28 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-20 font-mono" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-2.5 w-24 mt-1" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-28" />
                </td>
                <td className="px-3.5 py-3">
                  <SkeletonBadge width="w-20" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-24" />
                </td>
                <td className="px-3.5 py-3 text-right">
                  <Skeleton className="h-3.5 w-20 ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

/**
 * My Assets Page Skeleton:
 * Mimics desktop table and mobile cards for assigned employee custody items.
 */
export const MyAssetsSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading assigned assets"
    className="space-y-4 animate-fadeIn"
  >
    <span className="sr-only">Loading the assets assigned to you…</span>

    {/* Desktop Table */}
    <div className="rounded-md hidden overflow-hidden bg-white sm:block shadow-[0_1px_3px_rgba(16,24,40,0.10)] border border-slate-200">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3.5 py-2.5"><Skeleton className="h-3 w-20" /></th>
            <th className="px-3.5 py-2.5"><Skeleton className="h-3 w-24" /></th>
            <th className="px-3.5 py-2.5 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
            <th className="px-3.5 py-2.5"><Skeleton className="h-3 w-24" /></th>
            <th className="px-3.5 py-2.5"><Skeleton className="h-3 w-16" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-3.5 py-3">
                <Skeleton className="h-4 w-44 font-medium" />
                <Skeleton className="h-3 w-28 mt-1" />
              </td>
              <td className="px-3.5 py-3">
                <Skeleton className="h-3.5 w-28 font-mono" />
              </td>
              <td className="px-3.5 py-3 text-right">
                <Skeleton className="h-3.5 w-12 ml-auto" />
              </td>
              <td className="px-3.5 py-3">
                <Skeleton className="h-3.5 w-24" />
              </td>
              <td className="px-3.5 py-3">
                <SkeletonBadge width="w-24" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile Cards */}
    <div className="space-y-3 sm:hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="p-3.5 space-y-2.5">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <SkeletonBadge width="w-20" />
          </div>
          <div className="border-t border-slate-100 pt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex justify-between text-xs">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  </div>
);

/**
 * Settings Users (User Accounts) Table Skeleton:
 * Mimics User avatar, Name, Email, Department, Role, Status, and Actions.
 */
export const UsersTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading users"
    className="space-y-3 animate-fadeIn pb-16"
  >
    <span className="sr-only">Loading user accounts…</span>

    {/* Search & Actions Bar Skeleton */}
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-3 rounded-md border border-slate-200 shadow-xs">
      <Skeleton className="h-8.5 w-full sm:w-72 rounded-[4px]" />
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <Skeleton className="h-8.5 w-28 rounded-[4px]" />
        <Skeleton className="h-8.5 w-24 rounded-[4px]" />
      </div>
    </div>

    {/* Table Container Skeleton */}
    <div className="rounded-md bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.10)] border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3.5 py-2.5 w-52"><Skeleton className="h-3 w-28" /></th>
              <th className="px-3.5 py-2.5 w-32"><Skeleton className="h-3 w-20" /></th>
              <th className="px-3.5 py-2.5 min-w-[160px]"><Skeleton className="h-3 w-24" /></th>
              <th className="px-3.5 py-2.5 w-36"><Skeleton className="h-3 w-16" /></th>
              <th className="px-3.5 py-2.5 w-28"><Skeleton className="h-3 w-14" /></th>
              <th className="px-3.5 py-2.5 w-20 text-center"><Skeleton className="h-3 w-12 mx-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <SkeletonAvatar size="sm" />
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-2.5 w-40" />
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-20 font-mono" />
                </td>
                <td className="px-3.5 py-3">
                  <Skeleton className="h-3.5 w-36" />
                </td>
                <td className="px-3.5 py-3">
                  <SkeletonBadge width="w-28" />
                </td>
                <td className="px-3.5 py-3">
                  <SkeletonBadge width="w-16" />
                </td>
                <td className="px-3.5 py-3 text-center">
                  <Skeleton className="h-6 w-6 rounded-[4px] mx-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

/**
 * Employees Registry Table Rows Skeleton:
 * Renders table rows for EmployeesPage (can be rendered inside existing tbody).
 */
export const EmployeesTableRowsSkeleton: React.FC<{
  rows?: number;
  colCount?: number;
}> = ({ rows = 7, colCount = 7 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="hover:bg-slate-50/50">
        <td className="px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <SkeletonAvatar size="sm" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          </div>
        </td>
        <td className="px-3.5 py-3">
          <Skeleton className="h-3.5 w-20 font-mono" />
        </td>
        <td className="px-3.5 py-3">
          <Skeleton className="h-3.5 w-36" />
        </td>
        <td className="px-3.5 py-3">
          <SkeletonBadge width="w-24" />
        </td>
        <td className="px-3.5 py-3">
          <Skeleton className="h-3.5 w-12" />
        </td>
        <td className="px-3.5 py-3">
          <SkeletonBadge width="w-16" />
        </td>
        {colCount > 6 && (
          <td className="px-3.5 py-3 text-right">
            <Skeleton className="h-6 w-6 rounded-[4px] ml-auto" />
          </td>
        )}
      </tr>
    ))}
  </>
);

/**
 * Stores Page Skeleton:
 * Mimics warehouse/store cards in a responsive grid.
 */
export const StoresSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading stores"
    className="grid gap-3 sm:grid-cols-2 animate-fadeIn"
  >
    <span className="sr-only">Loading stores…</span>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-md shrink-0" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20 font-mono" />
            </div>
          </div>
          <SkeletonBadge width="w-16" />
        </div>
        <div className="border-t border-slate-100 pt-2.5 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </SkeletonCard>
    ))}
  </div>
);

/**
 * Organizations Table Rows Skeleton:
 * Renders table rows for OrganizationsPage.
 */
export const OrganizationsTableRowsSkeleton: React.FC<{ rows?: number }> = ({
  rows = 5,
}) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="hover:bg-slate-50/50">
        <td className="px-4 py-3">
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-40 font-medium" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </td>
        <td className="px-4 py-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-28 mt-1" />
        </td>
        <td className="px-4 py-3">
          <SkeletonBadge width="w-16" />
        </td>
        <td className="px-4 py-3 text-right">
          <Skeleton className="h-6 w-6 rounded-[4px] ml-auto" />
        </td>
      </tr>
    ))}
  </>
);

/**
 * Roles Page Skeleton:
 * Mimics 8 role cards in a 2-4 column grid.
 */
export const RolesSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading roles"
    className="space-y-4 animate-fadeIn"
  >
    <span className="sr-only">Loading roles and permission matrix…</span>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonCard key={i} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-7 rounded-md" />
            <SkeletonBadge width="w-20" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-20 rounded-[4px]" />
          </div>
        </SkeletonCard>
      ))}
    </div>
  </div>
);

/**
 * Record Detail Modal Skeleton:
 * Mimics detailed asset record view inside modal.
 */
export const RecordDetailSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading record"
    className="space-y-4 animate-fadeIn p-1"
  >
    <span className="sr-only">Loading record details…</span>

    {/* Header Badges Skeleton */}
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
      <SkeletonBadge width="w-24" />
      <SkeletonBadge width="w-20" />
      <Skeleton className="h-5 w-32 rounded-full" />
    </div>

    {/* 2-Column Key/Value Grid Skeleton */}
    <div className="grid gap-4 md:grid-cols-2">
      <SkeletonCard className="p-4 space-y-2.5">
        <Skeleton className="h-4 w-28 border-b border-slate-100 pb-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between text-xs py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </SkeletonCard>

      <SkeletonCard className="p-4 space-y-2.5">
        <Skeleton className="h-4 w-28 border-b border-slate-100 pb-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between text-xs py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </SkeletonCard>
    </div>

    {/* Lifecycle Timeline Skeleton */}
    <SkeletonCard className="p-4 space-y-3">
      <Skeleton className="h-4 w-36" />
      <div className="space-y-2 pt-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  </div>
);

/**
 * Document Preview Skeleton:
 * Mimics IFMIS document preview inside SlipViewerModal.
 */
export const DocumentSkeleton: React.FC<{ heightClass?: string }> = ({
  heightClass = 'h-[78vh]',
}) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading document"
    className={clsx(
      'w-full rounded-md bg-white p-6 shadow-inner border border-slate-200 flex flex-col items-center justify-between animate-fadeIn',
      heightClass
    )}
  >
    <span className="sr-only">Loading slip…</span>

    {/* Document Header Skeleton */}
    <div className="w-full max-w-lg space-y-3 text-center">
      <Skeleton className="h-10 w-10 rounded-full mx-auto" />
      <Skeleton className="h-4 w-64 mx-auto" />
      <Skeleton className="h-3 w-44 mx-auto" />
      <Skeleton className="h-3 w-32 mx-auto" />
    </div>

    {/* Document Content Lines Skeleton */}
    <div className="w-full max-w-lg space-y-2 my-auto">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-4/5" />
      <div className="h-4" />
      <Skeleton className="h-16 w-full rounded-md" />
      <div className="h-4" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-3/4" />
    </div>

    {/* Document Footer / Stamp Box Skeleton */}
    <div className="w-full max-w-lg flex justify-between items-end pt-4 border-t border-slate-100">
      <div className="space-y-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
      <div className="space-y-1 text-right">
        <Skeleton className="h-3 w-24 ml-auto" />
        <Skeleton className="h-8 w-28 rounded-md ml-auto" />
      </div>
    </div>
  </div>
);
