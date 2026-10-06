import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, CheckCircle2, LucideIcon, Paperclip, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';

/**
 * Shared building blocks for the Stock-In, Stock-Out, Transfer and Return forms,
 * so every voucher form has the same sections, fields, inputs and footer.
 * Class strings are spelled out in full so Tailwind can see them.
 */

/** Forms use the brand green only; status colors live in theme.ts */
export type FormAccent = 'emerald';

const ACCENT = {
  emerald: {
    step: 'bg-emerald-600 text-white',
    icon: 'text-emerald-700',
    focus: 'focus:border-emerald-600 focus:ring-emerald-500/30',
    button: 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-500/40',
    dropHover: 'hover:border-emerald-400 hover:bg-emerald-50/40',
    total: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
} as const;

/** Text input / select styling. Pass `mono` for codes and numbers, `invalid` for error states. */
export const inputClass = (accent: FormAccent, opts: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean } = {}) =>
  [
    'w-full h-9 px-3 bg-white rounded-lg text-[13px] text-slate-900 placeholder:text-slate-400',
    'focus:outline-none focus:ring-2 transition disabled:bg-slate-50 disabled:text-slate-500',
    opts.invalid
      ? 'border border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20 text-slate-900'
      : `border border-slate-300 ${ACCENT[accent].focus}`,
    opts.mono ? 'font-mono' : '',
    opts.align === 'right' ? 'text-right' : opts.align === 'center' ? 'text-center' : '',
  ].filter(Boolean).join(' ');

export const textareaClass = (accent: FormAccent) =>
  `w-full min-h-[72px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${ACCENT[accent].focus}`;

// ─── Quantity input ─────────────────────────────────────────────────────────

interface QuantityInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  value: number;
  onChange: (value: number) => void;
  /** Smallest accepted whole number (default 0) */
  min?: number;
  /** Largest accepted whole number; larger entries are capped while typing */
  max?: number;
}

/**
 * Whole-number input for counts. Keeps its own text so users can clear the
 * field and type a new number; only valid values reach `onChange`. If left
 * empty or below `min`, it falls back to the last valid value on blur.
 */
export const QuantityInput: React.FC<QuantityInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  onBlur,
  className = inputClass('emerald', { mono: true, align: 'right' }),
  ...props
}) => {
  const [draft, setDraft] = useState(String(value));

  // Follow outside changes (form reset, record loaded) without overwriting what the user is typing
  useEffect(() => {
    setDraft((d) => (d !== '' && Number(d) === value ? d : String(value)));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      setDraft('');
      return;
    }
    let n = parseInt(digits, 10);
    if (max !== undefined && n > max) n = max;
    setDraft(String(n));
    if (n >= min) onChange(n);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (draft === '' || Number(draft) < min) setDraft(String(value));
    onBlur?.(e);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
};

// ─── Layout ─────────────────────────────────────────────────────────────────

interface FormSectionProps {
  step: number;
  title: string;
  /** Amharic or explanatory line under the title */
  subtitle?: string;
  icon: LucideIcon;
  accent: FormAccent;
  /** Optional content on the right of the header (e.g. a badge) */
  aside?: React.ReactNode;
  /** Render as a collapsible section */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const FormSection: React.FC<FormSectionProps> = ({
  step,
  title,
  subtitle,
  icon: Icon,
  accent,
  aside,
  collapsible = false,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = !collapsible || open;

  const header = (
    <div className="flex items-center gap-3">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ACCENT[accent].step}`}>
        {step}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Icon className={`h-4 w-4 shrink-0 ${ACCENT[accent].icon}`} />
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {aside}
      {collapsible && (
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      )}
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-50/70 transition"
        >
          {header}
        </button>
      ) : (
        <div className="px-4 py-3">{header}</div>
      )}
      {isOpen && <div className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </section>
  );
};

/** Responsive field grid: 1 column on phones, up to `cols` on wider screens. */
export const FieldGrid: React.FC<{ cols?: 2 | 3 | 4; children: React.ReactNode }> = ({ cols = 3, children }) => {
  const colClass = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-3.5 ${colClass}`}>{children}</div>;
};

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  /** Tailwind col-span classes, e.g. "sm:col-span-2" */
  span?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, required, optional, hint, span = '', htmlFor, children }) => (
  <div className={span}>
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-700">
      {label}
      {required && <span className="ml-0.5 text-rose-600">*</span>}
      {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
  </div>
);

/** Value copied from a record that the user shouldn't edit here. */
export const ReadOnlyValue: React.FC<{
  children: React.ReactNode;
  mono?: boolean;
  align?: 'left' | 'right';
  className?: string;
}> = ({
  children,
  mono,
  align,
  className = '',
}) => (
  <div
    className={`flex h-9 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-700 ${
      mono ? 'font-mono' : ''
    } ${align === 'right' ? 'justify-end' : ''} ${className}`}
  >
    <span className="truncate">{children}</span>
  </div>
);

/** Highlighted computed total, e.g. quantity × unit price. */
export const TotalValue: React.FC<{ accent: FormAccent; children: React.ReactNode }> = ({ accent, children }) => (
  <div className={`flex h-9 w-full items-center justify-end rounded-lg border px-3 font-mono text-[13px] font-semibold ${ACCENT[accent].total}`}>
    {children}
  </div>
);

/** Labelled read-only facts shown as a compact summary row. */
export const SummaryGrid: React.FC<{ items: { label: string; value: React.ReactNode; mono?: boolean }[] }> = ({ items }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-4">
    {items.map((it) => (
      <div key={it.label} className="min-w-0">
        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{it.label}</dt>
        <dd className={`truncate text-[13px] font-medium text-slate-900 ${it.mono ? 'font-mono' : ''}`}>{it.value || '—'}</dd>
      </div>
    ))}
  </dl>
);

// ─── Feedback ───────────────────────────────────────────────────────────────

export const FormError: React.FC<{ message: string | null }> = ({ message }) => {
  const ref = useRef<HTMLDivElement>(null);
  // Forms are long: bring the error into view instead of repeating it in a pop-up
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [message]);
  return message ? (
    <div ref={ref} role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 animate-fadeIn">
      <AlertCircle className="mt-px h-4 w-4 shrink-0 text-rose-600" />
      <span>{message}</span>
    </div>
  ) : null;
};

export const FormNotice: React.FC<{ icon: LucideIcon; tone?: 'info' | 'warn'; children: React.ReactNode }> = ({
  icon: Icon,
  tone = 'info',
  children,
}) => (
  <div
    className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${
      tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'
    }`}
  >
    <Icon className={`mt-px h-4 w-4 shrink-0 ${tone === 'warn' ? 'text-amber-600' : 'text-slate-500'}`} />
    <div>{children}</div>
  </div>
);

// ─── Attachment ─────────────────────────────────────────────────────────────

interface FileDropFieldProps {
  label: string;
  accent: FormAccent;
  required: boolean;
  fileName: string;
  accept: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}

export const FileDropField: React.FC<FileDropFieldProps> = ({ label, accent, required, fileName, accept, onChange, hint }) => {
  const missing = required && !fileName;
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </span>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition ${
          missing ? 'border-amber-400 bg-amber-50/40' : `border-slate-300 bg-white ${ACCENT[accent].dropHover}`
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          {fileName ? <Paperclip className={`h-4 w-4 ${ACCENT[accent].icon}`} /> : <Upload className="h-4 w-4 text-slate-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${fileName ? 'font-medium text-slate-900' : missing ? 'text-amber-800' : 'text-slate-500'}`}>
            {fileName || (missing ? 'A scanned copy is required' : 'Click to attach a scanned copy')}
          </span>
          <span className="block text-[11px] text-slate-400">{hint || 'PDF, PNG, JPEG or WEBP · up to 10 MB'}</span>
        </span>
        <span className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {fileName ? 'Change' : 'Browse'}
        </span>
        <input type="file" onChange={onChange} className="hidden" accept={accept} />
      </label>
    </div>
  );
};

// ─── Footer ─────────────────────────────────────────────────────────────────

interface FormFooterProps {
  accent: FormAccent;
  submitting: boolean;
  submitLabel: string;
  onCancel: () => void;
  onReset?: () => void;
  /** Use inside the Modal body so the actions stay visible while scrolling */
  sticky?: boolean;
  /** Keeps the submit button off, e.g. until every required field is filled */
  submitDisabled?: boolean;
  /** Short line beside the buttons, e.g. why Submit is still off */
  note?: React.ReactNode;
}

export const FormFooter: React.FC<FormFooterProps> = ({ accent, submitting, submitLabel, onCancel, onReset, sticky = true, submitDisabled = false, note }) => (
  <div
    className={`flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white py-3 ${
      sticky ? 'sticky -bottom-5 z-10 -mx-6 -mb-5 px-6' : 'pt-4'
    }`}
  >
    {onReset ? (
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </button>
    ) : (
      <span />
    )}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {note && <p id="form-footer-note" className="text-[11px] text-slate-500">{note}</p>}
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting || submitDisabled}
        aria-describedby={note ? 'form-footer-note' : undefined}
        className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 focus:outline-none focus-visible:ring-2 cursor-pointer ${ACCENT[accent].button}`}
      >
        {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {submitLabel}
      </button>
    </div>
  </div>
);
