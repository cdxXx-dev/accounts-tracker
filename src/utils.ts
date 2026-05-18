/** Number of days a trial subscription lasts after registration. */
export const TRIAL_DAYS = 14;
/** Daily quota refresh period in ms. */
export const DAILY_MS = 24 * 60 * 60 * 1000;
/** Weekly quota refresh period in ms. */
export const WEEKLY_MS = 7 * DAILY_MS;

/**
 * Quota reset schedule: daily at 15:00 NSK (UTC+7), weekly on Sundays at the
 * same time. NSK has no DST so the offset is constant.
 */
const NSK_OFFSET_MS = 7 * 60 * 60 * 1000;
const RESET_HOUR_NSK = 15;

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

/** UTC ms of today's 15:00 NSK boundary, regardless of whether it's past or future. */
function todayDailyBoundaryMs(now: Date): number {
  const nskMs = now.getTime() + NSK_OFFSET_MS;
  const nsk = new Date(nskMs);
  // Build today's 15:00 NSK as if it were UTC...
  const todayResetNskMs = Date.UTC(
    nsk.getUTCFullYear(),
    nsk.getUTCMonth(),
    nsk.getUTCDate(),
    RESET_HOUR_NSK,
    0,
    0
  );
  // ...and convert back to the corresponding UTC moment.
  return todayResetNskMs - NSK_OFFSET_MS;
}

/** Most recent UTC ms that mapped to 15:00 NSK (≤ now). */
export function lastDailyBoundaryMs(now: Date = new Date()): number {
  const today = todayDailyBoundaryMs(now);
  return today <= now.getTime() ? today : today - DAILY_MS;
}

/** Next UTC ms that maps to 15:00 NSK (> now). */
export function nextDailyBoundaryMs(now: Date = new Date()): number {
  const today = todayDailyBoundaryMs(now);
  return today > now.getTime() ? today : today + DAILY_MS;
}

/** Most recent UTC ms that mapped to Sunday 15:00 NSK (≤ now). */
export function lastWeeklyBoundaryMs(now: Date = new Date()): number {
  return nextWeeklyBoundaryMs(now) - WEEKLY_MS;
}

/** Next UTC ms that maps to Sunday 15:00 NSK (> now). */
export function nextWeeklyBoundaryMs(now: Date = new Date()): number {
  const nskMs = now.getTime() + NSK_OFFSET_MS;
  const nsk = new Date(nskMs);
  const todayResetNskMs = Date.UTC(
    nsk.getUTCFullYear(),
    nsk.getUTCMonth(),
    nsk.getUTCDate(),
    RESET_HOUR_NSK,
    0,
    0
  );
  // getUTCDay(): 0 = Sunday. We want next Sunday.
  const nskDow = nsk.getUTCDay();
  const daysToAdd = (7 - nskDow) % 7;
  let candidateNskMs = todayResetNskMs + daysToAdd * DAILY_MS;
  if (candidateNskMs <= nskMs) candidateNskMs += WEEKLY_MS;
  return candidateNskMs - NSK_OFFSET_MS;
}

/**
 * Format a positive duration as a short Russian "Сброс через …" string.
 * Picks the right unit by magnitude (days vs hours vs minutes).
 */
export function formatResetIn(targetMs: number, now: Date = new Date()): string {
  const diff = targetMs - now.getTime();
  if (diff <= 0) return "обновляется…";

  const totalMinutes = Math.floor(diff / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    return `Сброс через ${days} ${dayWord(days)}`;
  }
  if (hours >= 1) {
    return `Сброс через ${hours} ч ${String(minutes).padStart(2, "0")} мин`;
  }
  return `Сброс через ${minutes} мин`;
}

function dayWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дн.";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дн.";
}

/** Compute the bar fill colour: green at 0%, yellow at 50%, red at 100%. */
export function quotaColor(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  // hsl 120 (green) -> 0 (red), linear in percent.
  const hue = 120 - clamped * 1.2;
  return `hsl(${hue.toFixed(0)} 70% 45%)`;
}
