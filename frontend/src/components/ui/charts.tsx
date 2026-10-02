import React, { useEffect, useRef, useState } from 'react';

/**
 * The charts shared by the Dashboard and Reports. Drawn in SVG and CSS, no chart library.
 * Colours are passed in by the caller: a colour belongs to what it stands for, never to its position.
 */

export const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="py-8 text-center text-[11px] text-slate-400">{children}</p>;

// ─── Donut: a few parts of a whole ──────────────────────────────────────────

const polar = (cx: number, cy: number, r: number, angle: number) => [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];

/** One ring segment between two angles (radians, clockwise from 12 o'clock) */
const arcPath = (cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) => {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M${x0},${y0}A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${rInner},${rInner} 0 ${large} 0 ${x3},${y3}Z`;
};

export interface DonutSegment {
  key: string;
  label: string;
  color: string;
  value: number;
}

/** Parts of a whole, for up to about six parts; the total sits in the middle and each part carries its number */
export const Donut: React.FC<{ segments: DonutSegment[]; unit?: string; label: string; empty: string }> = ({ segments, unit = 'units', label, empty }) => {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <ChartEmpty>{empty}</ChartEmpty>;

  const size = 148, cx = size / 2, cy = size / 2, rOuter = 68, rInner = 44;
  const shown = segments.filter((s) => s.value > 0);
  // A hairline gap between segments, so neighbours are told apart without relying on colour alone
  const gap = shown.length > 1 ? 0.025 : 0;
  let angle = 0;
  const arcs = shown.map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    angle += sweep;
    return { ...s, a0, a1: Math.max(a1, a0 + 0.001) };
  });
  const focus = segments.find((s) => s.key === hover);
  const percent = (value: number) => `${Math.round((value / total) * 100)}%`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`} className="shrink-0">
        {arcs.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke={arcs[0].color} strokeWidth={rOuter - rInner} />
          </>
        ) : (
          arcs.map((s) => (
            <path
              key={s.key}
              d={arcPath(cx, cy, rOuter, rInner, s.a0, s.a1)}
              fill={s.color}
              opacity={hover && hover !== s.key ? 0.35 : 1}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className="transition-opacity"
            />
          ))
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-900 text-[20px] font-extrabold tabular-nums">
          {(focus ? focus.value : total).toLocaleString()}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" className="fill-slate-500 text-[10px]">
          {focus ? `${focus.label} · ${percent(focus.value)}` : unit}
        </text>
      </svg>

      <ul className="min-w-[130px] space-y-1.5">
        {segments.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 text-[11px] transition-opacity ${hover && hover !== s.key ? 'opacity-50' : ''}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{s.value.toLocaleString()}</span>
            <span className="w-8 text-right tabular-nums text-slate-400">{percent(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ─── Horizontal bars ────────────────────────────────────────────────────────

export interface BarRow {
  key: string;
  label: string;
  /** A one-word name for tight spaces */
  short?: string;
  value: number;
  color: string;
  detail?: string;
}

export const BarList: React.FC<{ rows: BarRow[]; format: (value: number) => string; empty: string }> = ({ rows, format, empty }) => {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0 || max <= 0) return <ChartEmpty>{empty}</ChartEmpty>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${format(r.value)}${r.detail ? ` · ${r.detail}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px]">
            <span className="min-w-0 truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, backgroundColor: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

// ─── Column chart ───────────────────────────────────────────────────────────

/** Rounded-up axis maximum with 4 even steps */
const niceAxis = (max: number) => {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= rough) ?? 10 * mag;
  return { top: step * 4, step };
};

/** Column with a 4px rounded top, square on the baseline */
const columnPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/** Axis ticks are shorter than bar labels: "2.5M", "500K" */
const axisETB = (value: number): string => (value >= 1_000_000 ? `${+(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${+(value / 1000).toFixed(1)}K` : String(Math.round(value)));

/** Upright columns on a value axis, for a handful of short-named categories */
export const ColumnChart: React.FC<{
  rows: BarRow[];
  format: (value: number) => string;
  /** Tick labels on the axis; money by default */
  axisFormat?: (value: number) => string;
  empty: string;
  label: string;
}> = ({ rows, format, axisFormat = axisETB, empty, label }) => {
  const [hover, setHover] = useState<string | null>(null);
  // Draw at the container's real width so text and columns keep their pixel sizes
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(340);
  const hasData = rows.length > 0 && rows.some((r) => r.value > 0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(220, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);
  if (!hasData) return <ChartEmpty>{empty}</ChartEmpty>;

  const H = 190, left = 40, right = 6, top = 18, bottom = 34;
  const plotW = W - left - right, plotH = H - top - bottom;
  const { top: axisTop, step } = niceAxis(Math.max(...rows.map((r) => r.value)));
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);
  const y = (v: number) => top + plotH - (v / axisTop) * plotH;
  const slot = plotW / rows.length;
  const colW = Math.min(44, slot * 0.56);

  return (
    <div ref={boxRef} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}`} className="block max-w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth={1} />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = left + slot * i + slot / 2;
          const h = Math.max(y(0) - y(r.value), r.value > 0 ? 2 : 0);
          // A name of two words goes on two lines, so neighbours never run into each other
          const words = (slot < 62 && r.short ? r.short : r.label).split(' ');
          const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [r.label];
          return (
            <g key={r.key} opacity={hover && hover !== r.key ? 0.4 : 1} className="transition-opacity">
              <path d={columnPath(cx - colW / 2, y(0) - h, colW, h)} fill={r.color} />
              <text x={cx} y={y(0) - h - 5} textAnchor="middle" className="fill-slate-900 text-[10px] font-semibold tabular-nums">
                {format(r.value).replace('ETB ', '')}
              </text>
              {lines.map((line, k) => (
                <text key={k} x={cx} y={H - bottom + 13 + k * 11} textAnchor="middle" className="fill-slate-600 text-[10px]">
                  {line}
                </text>
              ))}
              {/* Hit target: the whole column slot */}
              <rect x={left + slot * i} y={top} width={slot} height={plotH + bottom} fill="transparent" onMouseEnter={() => setHover(r.key)}>
                <title>{`${r.label}: ${format(r.value)}${r.detail ? ` · ${r.detail}` : ''}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
