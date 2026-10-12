/**
 * What a person typed into their last voucher, kept in this browser so the next one starts from it:
 * the book, the store, the transaction type and the voucher number to continue from.
 * Nothing here is required, and it never blocks a form when storage is unavailable.
 */

export type FormMemory = Record<string, string>;

const keyOf = (userId: string | undefined, form: string) => `moa_form_${userId || 'anon'}_${form}`;

export function recallForm(userId: string | undefined, form: string): FormMemory {
  try {
    const raw = window.localStorage.getItem(keyOf(userId, form));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberForm(userId: string | undefined, form: string, values: FormMemory): void {
  try {
    const next = { ...recallForm(userId, form), ...values };
    window.localStorage.setItem(keyOf(userId, form), JSON.stringify(next));
  } catch {
    // Private window or blocked storage: the form works the same, it just starts empty next time
  }
}

/**
 * The voucher number that follows one, keeping its prefix, suffix and zero padding:
 * "0004653/A" -> "0004654/A", "M22-009" -> "M22-010". Nothing when there is no number to count from.
 */
export function nextNumberAfter(last?: string): string | undefined {
  const text = (last ?? '').trim();
  const match = /(\d+)(?!.*\d)/.exec(text);
  if (!match || match[1].length > 15) return undefined;
  const digits = match[1];
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return text.slice(0, match.index) + next + text.slice(match.index + digits.length);
}
