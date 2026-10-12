/**
 * What a person typed into their last voucher, kept in this browser so the next one starts from it:
 * the book, the store and the transaction type. Voucher numbers are not kept: they come from the slip.
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
