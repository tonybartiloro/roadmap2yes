import { addDays, parsePlainDate, type PlainDate } from "@/lib/dates/plain-date";

/**
 * Batch keys and calendar helpers of the daily job (plan §7). The `batch_key` is the idempotency
 * key of the ledger (`notification_log`) AND the provider `Idempotency-Key`, so it contains only a
 * user uuid and a date: no email, no name.
 */

/** ISO weekday of a plain date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: PlainDate): number {
  const { year, month, day } = parsePlainDate(date);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** ISO 8601 week of a plain date, e.g. `2027-W01` (2027-01-01 belongs to `2026-W53`). */
export function isoWeekKey(date: PlainDate): string {
  // The week belongs to the year of its Thursday.
  const thursday = addDays(date, 4 - isoWeekday(date));
  const { year } = parsePlainDate(thursday);
  const start = Date.UTC(year, 0, 1);
  const { month, day } = parsePlainDate(thursday);
  const dayOfYear = Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000) + 1;
  const week = Math.floor((dayOfYear - 1) / 7) + 1;
  return `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
}

/** One reminder email per user per day (D38). */
export function reminderBatchKey(userId: string, today: PlainDate): string {
  return `reminder:${userId}:${today}`;
}

/** One digest per user per ISO week (D41). */
export function digestBatchKey(userId: string, today: PlainDate): string {
  return `digest:${userId}:${isoWeekKey(today)}`;
}

/**
 * The digest is due on Monday, with catch-up on Tuesday and Wednesday if Monday's run did not
 * deliver it (D41, AC51). The once-per-week guarantee comes from `digestBatchKey` + the claim.
 */
export function isDigestWindow(today: PlainDate): boolean {
  return isoWeekday(today) <= 3;
}
