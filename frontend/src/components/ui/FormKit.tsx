import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, CheckCircle2, Eye, LucideIcon, Paperclip, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import { SlipViewerModal } from './SlipViewerModal';

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
    focus: 'focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700',
    button: 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-500/40',
    dropHover: 'hover:border-emerald-400 hover:bg-emerald-50/40',
    total: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
} as const;

/** Text input / select styling. Pass `mono` for codes and numbers, `invalid` for error states. */
export const inputClass = (accent: FormAccent, opts: { mono?: boolean; align?: 'left' | 'right' | 'center'; invalid?: boolean } = {}) =>
  [
    'w-full h-10 px-3 bg-white rounded-[4px] text-[13px] text-slate-900 placeholder:text-slate-400',
    'focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500',
    opts.invalid
      ? 'border border-rose-500 focus:border-rose-600 focus:ring-1 focus:ring-rose-600 text-slate-900'
      : `border border-slate-300 hover:border-slate-500 ${ACCENT[accent].focus}`,
    opts.mono ? 'font-mono' : '',
    opts.align === 'right' ? 'text-right' : opts.align === 'center' ? 'text-center' : '',
  ].filter(Boolean).join(' ');

export const textareaClass = (accent: FormAccent) =>
  `w-full min-h-[72px] px-3 py-2.5 bg-white border border-slate-300 hover:border-slate-500 rounded-[4px] text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors ${ACCENT[accent].focus}`;

// ─── Quantity input ─────────────────────────────────────────────────────────

interface QuantityInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  value: number;
  onChange: (value: number) => void;
  /** Smallest sensible number (default 0). A smaller one is flagged in red, not changed. */
  min?: number;
  /** Largest sensible number. A bigger one is flagged in red, not changed. */
  max?: number;
}

/**
 * Whole-number input for counts. The user types any number: nothing is capped, rewritten or put back
 * while typing or on leaving the field. An empty field shows the placeholder "0" and counts as 0.
 * A number outside min..max is marked in red, and the form decides what to do about it.
 */
export const QuantityInput: React.FC<QuantityInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  placeholder = '0',
  className,
  ...props
}) => {
  const asText = (n: number) => (n === 0 ? '' : String(n));
  const [draft, setDraft] = useState(asText(value));

  // Follow outside changes (form reset, record loaded) without overwriting what the user is typing
  useEffect(() => {
    setDraft((d) => (d === '' || Number(d) !== value ? asText(value) : d));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    if (digits === '') {
      setDraft('');
      onChange(0);
      return;
    }
    const n = parseInt(digits, 10);
    setDraft(String(n));
    onChange(n);
  };

  const entered = draft === '' ? undefined : Number(draft);
  const outOfRange = entered !== undefined && ((min > 0 && entered < min) || (max !== undefined && entered > max));

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={draft}
      onChange={handleChange}
      aria-invalid={outOfRange || undefined}
      className={className ?? inputClass('emerald', { mono: true, align: 'right', invalid: outOfRange })}
    />
  );
};

// ─── Money input ────────────────────────────────────────────────────────────

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  id?: string;
  accent?: FormAccent;
  invalid?: boolean;
  /** Shown at the right end, e.g. "ETB" */
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes for the input, e.g. a smaller one in a table */
  inputClassName?: string;
  'aria-label'?: string;
}

const MONEY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * An amount that is easy to read: 1,250,000.50 when you are not typing, the plain number while you are.
 * Anything that is not a digit or one decimal point is dropped as it is typed.
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({ value, onChange, onBlur, id, accent = 'emerald', invalid, suffix = 'ETB', placeholder = '0.00', disabled, inputClassName = '', 'aria-label': ariaLabel }) => {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const shown = focused ? text : value ? MONEY_FORMAT.format(value) : '';
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        value={shown}
        onFocus={() => {
          setText(value ? String(value) : '');
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, '').replace(/^(\d*\.\d*).*$/, '$1');
          setText(cleaned);
          const n = parseFloat(cleaned);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={`${inputClass(accent, { mono: true, align: 'right', invalid })} ${suffix ? 'pr-12' : ''} ${inputClassName}`}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-slate-400">{suffix}</span>}
    </div>
  );
};

// ─── Inline errors and keyboard ─────────────────────────────────────────────

/**
 * Shows what is wrong with a field once the user has been in it.
 * `problems` maps a field name to its message (or false when it is fine); call `touch(name)` on blur.
 */
export function useFieldErrors(problems: Record<string, string | false | undefined>) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  return {
    touch: (key: string) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true })),
    error: (key: string): string | undefined => (touched[key] && problems[key] ? (problems[key] as string) : undefined),
  };
}

/** Ctrl+Enter (or ⌘+Enter) submits a form that is complete, from any field in it */
export const submitOnCtrlEnter = (canSubmit: boolean) => (e: React.KeyboardEvent<HTMLFormElement>) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
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
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-slate-500">{subtitle}</p>}
      </div>
      {aside}
      {collapsible && (
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      )}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full bg-slate-50/80 px-4 py-3 cursor-pointer hover:bg-slate-100/70 transition"
        >
          {header}
        </button>
      ) : (
        <div className="bg-slate-50/80 px-4 py-3">{header}</div>
      )}
      {isOpen && <div className="border-t border-slate-200 px-4 py-5">{children}</div>}
    </section>
  );
};

/** Responsive field grid: 1 column on phones, up to `cols` on wider screens. */
export const FieldGrid: React.FC<{ cols?: 2 | 3 | 4; children: React.ReactNode }> = ({ cols = 3, children }) => {
  const colClass = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-5 ${colClass}`}>{children}</div>;
};

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  /** Tailwind col-span classes, e.g. "sm:col-span-2" */
  span?: string;
  htmlFor?: string;
  /** What is wrong with this field, shown under it above the hint */
  error?: string;
  /** Worth a second look but not wrong, e.g. a number that is already used */
  warning?: string;
  children: React.ReactNode;
}

/**
 * A field as an outlined box with its label on the top border (Material style). The label takes the brand color while
 * the field has focus, and red when the field is wrong.
 */
export const Field: React.FC<FieldProps> = ({ label, required, optional, hint, span = '', htmlFor, error, warning, children }) => (
  <div className={`group relative ${span}`}>
    <label
      htmlFor={htmlFor}
      className={`pointer-events-none absolute left-2 top-0 z-[2] max-w-[calc(100%-1rem)] -translate-y-1/2 truncate px-1 text-[11px] font-medium leading-4 transition-colors bg-[linear-gradient(to_bottom,#fff_55%,transparent_55%)] ${
        error ? 'text-rose-700' : 'text-slate-500 group-focus-within:text-emerald-800'
      }`}
    >
      {label}
      {required && <span className="ml-0.5 text-rose-600">*</span>}
    </label>
    {children}
    {error && (
      <p role="alert" className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-rose-700">
        <AlertCircle className="mt-px h-3 w-3 shrink-0" />
        {error}
      </p>
    )}
    {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    {!error && warning && (
      <p role="status" className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-amber-800">
        <AlertCircle className="mt-px h-3 w-3 shrink-0 text-amber-600" />
        {warning}
      </p>
    )}
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
    className={`flex h-10 w-full items-center rounded-[4px] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 ${
      mono ? 'font-mono' : ''
    } ${align === 'right' ? 'justify-end' : ''} ${className}`}
  >
    <span className="truncate">{children}</span>
  </div>
);

/** Highlighted computed total, e.g. quantity × unit price. */
export const TotalValue: React.FC<{ accent: FormAccent; children: React.ReactNode }> = ({ accent, children }) => (
  <div className={`flex h-10 w-full items-center justify-end rounded-[4px] border px-3 font-mono text-[13px] font-semibold ${ACCENT[accent].total}`}>
    {children}
  </div>
);

/** Labelled read-only facts shown as a compact summary row. */
export const SummaryGrid: React.FC<{ items: { label: string; value: React.ReactNode; mono?: boolean }[] }> = ({ items }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-4">
    {items.map((it) => (
      <div key={it.label} className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{it.label}</dt>
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
    <div ref={ref} role="alert" className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 animate-fadeIn">
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
    className={`flex items-start gap-2.5 rounded-md border p-3 text-xs leading-relaxed ${
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
  /** The file just attached, so it can be viewed before it is saved */
  file?: File | null;
  /** The copy already saved with the record, viewed when no new file is attached */
  savedUrl?: string;
  /** What the empty field says, instead of asking for a scanned copy */
  emptyText?: string;
}

export const FileDropField: React.FC<FileDropFieldProps> = ({ label, accent, required, fileName, accept, onChange, hint, file, savedUrl, emptyText }) => {
  const missing = required && !fileName;
  const [viewing, setViewing] = useState(false);
  // A new file is shown over the saved copy it replaces
  const viewable = !!fileName && (!!file || !!savedUrl);
  return (
    <div className="relative">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      <label
        className={`group flex cursor-pointer items-center gap-3 rounded-[4px] border border-dashed px-3 py-2.5 transition-colors ${
          missing ? 'border-amber-400 bg-amber-50/40' : `border-slate-300 bg-white ${ACCENT[accent].dropHover}`
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-slate-100">
          {fileName ? <Paperclip className={`h-4 w-4 ${ACCENT[accent].icon}`} /> : <Upload className="h-4 w-4 text-slate-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${fileName ? 'font-medium text-slate-900' : missing ? 'text-amber-800' : 'text-slate-500'}`}>
            {fileName || (missing ? 'A scanned copy is required' : emptyText ?? 'Click to attach a scanned copy')}
          </span>
          <span className="block text-[11px] text-slate-400">{hint || 'PDF, PNG, JPEG or WEBP · up to 10 MB'}</span>
        </span>
        <span className="shrink-0 rounded-[4px] border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors group-hover:border-slate-400 group-hover:bg-slate-50">
          {fileName ? 'Change' : 'Browse'}
        </span>
        {/* Room for View, which sits beside Change but outside the label so it doesn't open the file picker */}
        {viewable && <span className="w-16 shrink-0" aria-hidden="true" />}
        <input type="file" onChange={onChange} className="hidden" accept={accept} />
      </label>
      {viewable && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          title="Check the attached copy against the fields"
          className="absolute bottom-[13px] right-3 inline-flex items-center gap-1 rounded-[4px] border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
        >
          <Eye className="h-3 w-3" />
          View
        </button>
      )}
      {viewing && <SlipViewerModal file={file ?? undefined} url={file ? undefined : savedUrl} onClose={() => setViewing(false)} />}
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
  /** Required fields still empty: while there are any, Submit stays off and says so */
  missingFields?: string[];
  /** Short line beside the buttons, e.g. why Submit is still off */
  note?: React.ReactNode;
  /** Where a "Still needed" name leads when no field label matches it: name → CSS selector */
  fieldTargets?: Record<string, string>;
}

const fieldKey = (s: string) => s.toLowerCase().replace(/\(optional\)/g, '').replace(/[*():]/g, ' ').replace(/\s+/g, ' ').trim();

/** The control of a field named like "Still needed" names it: by its label or aria-label, else by `targets` */
export function findField(form: HTMLElement, field: string, given: Record<string, string> = {}): HTMLElement | null {
  // The scanned copy is the form's file field, whatever the form calls it
  const targets: Record<string, string> = { 'scanned slip': 'input[type="file"]', 'supporting document': 'input[type="file"]', ...given };
  const named: [string, HTMLElement][] = [];
  form.querySelectorAll('label').forEach((label) => {
    // A label tied to its control, one wrapping it, or else the field's first control after it
    const control = label.htmlFor
      ? form.ownerDocument.getElementById(label.htmlFor)
      : label.querySelector<HTMLElement>('input, select, textarea') ?? label.parentElement?.querySelector<HTMLElement>('input, select, textarea') ?? null;
    if (control) named.push([fieldKey(label.textContent ?? ''), control]);
  });
  form.querySelectorAll<HTMLElement>('input[aria-label], select[aria-label], textarea[aria-label]').forEach((el) => named.push([fieldKey(el.getAttribute('aria-label') ?? ''), el]));
  // "item 2 (unit price)" is item 2's unit price; "item 2" alone is its first cell
  const lineMatch = field.match(/^item (\d+)(?: \((.+)\))?$/i);
  const wanted = [field, ...(lineMatch ? [lineMatch[2] ? `item ${lineMatch[1]} ${lineMatch[2]}` : '', `item ${lineMatch[1]}`] : [])].filter(Boolean).map(fieldKey);
  for (const want of wanted) {
    const selector = Object.entries(targets).find(([name]) => fieldKey(name) === want)?.[1];
    if (selector) return form.querySelector<HTMLElement>(selector);
    // Exact, then a label that goes on ("received date" → "Received date (G.C.)"), then the longest label the name
    // goes on from ("item 2 item code starting with 0 or 1" → "Item 2 item code")
    const longer = named.find(([name]) => name === want) ?? named.find(([name]) => name.startsWith(want));
    if (longer) return longer[1];
    const shorter = named.filter(([name]) => name && want.startsWith(`${name} `)).sort((a, b) => b[0].length - a[0].length)[0];
    if (shorter) return shorter[1];
  }
  // Last, a label naming it in brackets or at the end ("recipient" → "Received by (recipient)")
  const want = fieldKey(field);
  return named.find(([name]) => name.endsWith(` ${want}`))?.[1] ?? null;
}

export const FormFooter: React.FC<FormFooterProps> = ({ accent, submitting, submitLabel, onCancel, onReset, sticky = true, submitDisabled = false, missingFields = [], note: customNote, fieldTargets }) => {
  const incomplete = missingFields.length > 0;
  const note = customNote ?? (incomplete ? 'Fill in all required fields (*) to submit' : undefined);
  const shown = incomplete && !customNote ? missingFields.slice(0, 4) : [];
  const footer = useRef<HTMLDivElement>(null);
  // Each name in "Still needed" takes the person to that field
  const goTo = (field: string) => {
    const form = footer.current?.closest('form');
    if (!form) return;
    const el = findField(form, field, fieldTargets);
    if (!el) return;
    // A hidden control (a file input) is shown through what wraps it
    const visible = el.offsetParent !== null || el.getClientRects().length > 0 ? el : (el.closest('label') as HTMLElement | null) ?? el;
    visible.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    visible.focus({ preventScroll: true });
  };
  return (
  <div
    ref={footer}
    className={`flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur ${
      sticky ? 'sticky -bottom-5 z-10 -mx-6 -mb-5 px-6 shadow-[0_-6px_12px_-8px_rgba(15,23,42,0.18)]' : 'pt-4'
    }`}
  >
    {onReset ? (
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 rounded-[4px] px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </button>
    ) : (
      <span />
    )}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!note && !submitDisabled && !submitting && (
        <span className="hidden text-[11px] text-slate-400 sm:inline">Ctrl + Enter to submit</span>
      )}
      {note && (
        <p id="form-footer-note" className="text-[11px] text-slate-500">
          {note}
          {shown.length > 0 && (
            <span className="block font-medium text-slate-600">
              Still needed:{' '}
              {shown.map((field, i) => (
                <React.Fragment key={field}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => goTo(field)}
                    title={`Go to ${field}`}
                    className="cursor-pointer font-medium text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-2 transition hover:text-emerald-700 hover:decoration-emerald-500"
                  >
                    {field}
                  </button>
                </React.Fragment>
              ))}
              {missingFields.length > 4 && ` and ${missingFields.length - 4} more`}
            </span>
          )}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded-[4px] border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting || submitDisabled || incomplete}
        aria-describedby={note ? 'form-footer-note' : undefined}
        className={`flex items-center gap-2 rounded-[4px] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.12)] transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none focus:outline-none focus-visible:ring-2 cursor-pointer ${ACCENT[accent].button}`}
      >
        {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {submitLabel}
      </button>
    </div>
  </div>
  );
};
