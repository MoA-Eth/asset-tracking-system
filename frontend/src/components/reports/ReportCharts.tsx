import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Department, ItemWithRelations } from '../../types/asset-management';
import { formatETB } from '../../utils/eth-date';
import { departmentLabel } from '../../utils/department';
import { BarList, BarRow, ColumnChart, Donut } from '../ui/charts';

// Same colours as the dashboard: a colour belongs to what it stands for, never to its rank.
// Checked for colour-blind separation; the pale ones are always paired with a written value.
const UNIT_STATES = [
  { key: 'available' as const, label: 'In store', color: '#0ca30c' },
  { key: 'issued' as const, label: 'Issued', color: '#2a78d6' },
  { key: 'pending' as const, label: 'Awaiting approval', color: '#eda100' },
];
// `short` is used under a column when all six categories share a narrow chart
const CATEGORY_STYLE: Record<string, { label: string; short: string; color: string }> = {
  VEHICLE: { label: 'Vehicles', short: 'Vehicles', color: '#2a78d6' },
  AGRI_MACHINERY: { label: 'Agri. machinery', short: 'Agri.', color: '#eb6834' },
  IT_EQUIPMENT: { label: 'IT equipment', short: 'IT', color: '#1baf7a' },
  OFFICE_FURNITURE: { label: 'Office furniture', short: 'Office', color: '#eda100' },
  LAB_EQUIPMENT: { label: 'Lab equipment', short: 'Lab', color: '#e87ba4' },
  FIELD_GEAR: { label: 'Field gear', short: 'Field', color: '#008300' },
};
const ISSUED_COLOR = '#2a78d6';
const MAX_BARS = 6;

const balanceOf = (item: ItemWithRelations) => item.balance ?? { total: Number(item.quantity) || 1, issued: 0, available: 0, pending: 0 };

/** "1,250,000" → "1.25M", for bar labels */
const compactETB = (value: number): string =>
  value >= 1_000_000 ? `ETB ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M` : value >= 10_000 ? `ETB ${Math.round(value / 1000)}K` : formatETB(value);

const Card: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="text-xs font-bold text-slate-900">{title}</h4>
    <p className="mb-3 text-[11px] text-slate-500">{subtitle}</p>
    <div className="flex flex-1 flex-col justify-center">{children}</div>
  </section>
);

/** Keep the largest rows and fold the rest into "Other", so a long list never becomes a wall of bars */
const topRows = (rows: BarRow[], otherColor: string): BarRow[] => {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_BARS) return sorted;
  const rest = sorted.slice(MAX_BARS - 1);
  return [...sorted.slice(0, MAX_BARS - 1), { key: 'OTHER', label: `Other (${rest.length})`, value: rest.reduce((sum, r) => sum + r.value, 0), color: otherColor }];
};

// ─── The summary shown above the report table ───────────────────────────────

interface ReportChartsProps {
  /** The rows of the report as filtered on screen */
  items: ItemWithRelations[];
  /** Issued records split from a registration, by the registration's id; they carry who holds the issued units */
  splitsByRoot: Map<string, ItemWithRelations[]>;
  departments: Department[];
  /** Units an item counts for in this report (all received, only in store, or only issued) */
  unitsOf: (item: ItemWithRelations) => number;
}

export const ReportCharts: React.FC<ReportChartsProps> = ({ items, splitsByRoot, departments, unitsOf }) => {
  const [open, setOpen] = useState(true);

  const states = useMemo(() => {
    const sums = { available: 0, issued: 0, pending: 0 };
    for (const item of items) {
      const b = balanceOf(item);
      sums.available += b.available;
      sums.issued += b.issued;
      sums.pending += b.pending;
    }
    return UNIT_STATES.map((s) => ({ ...s, value: sums[s.key] }));
  }, [items]);

  const byCategory = useMemo(() => {
    const sums = new Map<string, { value: number; units: number }>();
    for (const item of items) {
      const units = unitsOf(item);
      const cur = sums.get(item.category) ?? { value: 0, units: 0 };
      sums.set(item.category, { value: cur.value + item.unitCostETB * units, units: cur.units + units });
    }
    const rows = [...sums.entries()].map(([category, s]) => ({
      key: category,
      label: CATEGORY_STYLE[category]?.label ?? category.replace(/_/g, ' ').toLowerCase(),
      short: CATEGORY_STYLE[category]?.short,
      color: CATEGORY_STYLE[category]?.color ?? '#94a3b8',
      value: s.value,
      detail: `${s.units.toLocaleString()} units`,
    }));
    return rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  }, [items, unitsOf]);

  const byDirectorate = useMemo(() => {
    const sums = new Map<string, number>();
    const add = (departmentId: string | undefined | null, units: number) => {
      if (units > 0) sums.set(departmentId || 'NONE', (sums.get(departmentId || 'NONE') ?? 0) + units);
    };
    for (const item of items) {
      const splits = splitsByRoot.get(item.id) ?? [];
      // Units issued in part live on split records; units issued whole live on the item itself
      for (const split of splits) if (split.currentCustodianId) add(split.assignedDepartmentId, Number(split.quantity) || 1);
      if (item.currentCustodianId) add(item.assignedDepartmentId, Number(item.quantity) || 1);
    }
    const rows = [...sums.entries()].map(([id, value]) => {
      const dept = departments.find((d) => d.id === id);
      return { key: id, label: dept ? departmentLabel(dept) : 'No directorate recorded', value, color: ISSUED_COLOR };
    });
    return topRows(rows, '#94a3b8');
  }, [items, splitsByRoot, departments]);

  const units = (value: number) => `${value.toLocaleString()} ${value === 1 ? 'unit' : 'units'}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="no-print flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-800 cursor-pointer"
      >
        <span>
          Summary <span className="font-normal text-slate-500">· follows the filters above</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-3 px-3 pb-3 lg:grid-cols-3">
          <Card title="Where the units are" subtitle="Units in this report, by where they are now">
            <Donut segments={states} label="Units by where they are" empty="No units match these filters." />
          </Card>
          <Card title="Value by category" subtitle="Unit cost × units, in ETB, largest first">
            <ColumnChart rows={byCategory} format={compactETB} empty="No value to show for these filters." label="Value by category" />
          </Card>
          <Card title="Issued units by directorate" subtitle={`Who holds what has been issued${byDirectorate.some((r) => r.key === 'OTHER') ? ' · top 5' : ''}`}>
            <BarList rows={byDirectorate} format={units} empty="Nothing in this report is issued." />
          </Card>
        </div>
      )}
    </div>
  );
};
