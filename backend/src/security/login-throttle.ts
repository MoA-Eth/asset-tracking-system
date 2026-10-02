import { AppError } from '../errors/app-error';

/**
 * Slows down password guessing. Failed sign-ins are counted per account and per client address;
 * past the limit, further attempts are refused until the window has passed.
 * Counts live in memory, which fits the single server this app runs on.
 */
const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 5;
const ADDRESS_LIMIT = 30;

type Entry = { failures: number; firstAt: number };
const attempts = new Map<string, Entry>();

const live = (key: string, now: number): Entry | undefined => {
  const entry = attempts.get(key);
  if (entry && now - entry.firstAt >= WINDOW_MS) {
    attempts.delete(key);
    return undefined;
  }
  return entry;
};

const accountKey = (username: string) => `account:${username.trim().toLowerCase()}`;
const addressKey = (address: string) => `address:${address}`;

/** Throws 429 when this account or this address has failed too many times recently */
export function assertSignInAllowed(username: string, address: string, now = Date.now()): void {
  const blocked = [
    [live(accountKey(username), now), ACCOUNT_LIMIT],
    [live(addressKey(address), now), ADDRESS_LIMIT],
  ].find(([entry, limit]) => entry && (entry as Entry).failures >= (limit as number)) as [Entry, number] | undefined;
  if (!blocked) return;
  const minutes = Math.max(1, Math.ceil((blocked[0].firstAt + WINDOW_MS - now) / 60000));
  throw new AppError(`Too many failed sign-in attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`, 429);
}

export function recordSignInFailure(username: string, address: string, now = Date.now()): void {
  for (const key of [accountKey(username), addressKey(address)]) {
    const entry = live(key, now);
    if (entry) entry.failures += 1;
    else attempts.set(key, { failures: 1, firstAt: now });
  }
  // Keep the map from growing without bound
  if (attempts.size > 10000) for (const key of attempts.keys()) live(key, now);
}

/** A successful sign-in clears the account's count (the address keeps its own) */
export function recordSignInSuccess(username: string): void {
  attempts.delete(accountKey(username));
}

/** For tests */
export function resetSignInThrottle(): void {
  attempts.clear();
}
