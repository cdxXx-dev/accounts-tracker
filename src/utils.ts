/** Number of days a trial subscription lasts after registration. */
export const TRIAL_DAYS = 14;
/** Daily quota refresh period in ms. */
export const DAILY_MS = 24 * 60 * 60 * 1000;
/** Weekly quota refresh period in ms. */
export const WEEKLY_MS = 7 * DAILY_MS;

/** Format an ISO datetime as "MM-DD HH:mm". */
export function formatShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** Format an ISO datetime as "YYYY-MM-DD HH:mm". */
export function formatLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/** Convert a value from <input type="datetime-local"> to an ISO string. */
export function localInputToIso(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

/** Convert an ISO string to a value compatible with <input type="datetime-local">. */
export function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/** Expiry datetime = registeredAt + TRIAL_DAYS days. */
export function expiryFromRegistered(registeredIso: string): string {
  const d = new Date(registeredIso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + TRIAL_DAYS * DAILY_MS).toISOString();
}

/** Days left between now and a target ISO timestamp (rounded up, clamped at 0). */
export function daysLeft(targetIso: string, now: Date = new Date()): number {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return 0;
  const diff = target - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAILY_MS);
}

/**
 * Roll a quota reset timestamp forward by `periodMs` until it is strictly in
 * the future. Returns the new reset time and the number of resets that
 * happened. If at least one reset happened, the percent should be set to 100.
 */
export function advanceReset(
  resetIso: string,
  periodMs: number,
  now: Date = new Date()
): { resetAt: string; reset: boolean } {
  const reset = new Date(resetIso).getTime();
  if (Number.isNaN(reset)) return { resetAt: resetIso, reset: false };
  if (reset > now.getTime()) {
    return { resetAt: resetIso, reset: false };
  }
  let next = reset;
  while (next <= now.getTime()) {
    next += periodMs;
  }
  return { resetAt: new Date(next).toISOString(), reset: true };
}
