import { parsePlainDate, ROME_TIME_ZONE, type PlainDate } from "@/lib/dates/plain-date";

const longDate = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  timeZone: ROME_TIME_ZONE,
});

/** "lunedì 30 novembre" from a calendar date (no time zone shift: formatted as UTC midnight). */
export function formatLongDate(date: PlainDate): string {
  const { year, month, day } = parsePlainDate(date);
  return longDate.format(new Date(Date.UTC(year, month - 1, day)));
}

/** "30 novembre" for an instant, in Europe/Rome. */
export function formatInstantDay(instant: Date): string {
  return shortDate.format(instant);
}

export const MAX_ROWS = 5;

/** First `MAX_ROWS` rows and how many were left out ("e altri N"). */
export function limitRows<T>(rows: readonly T[], max = MAX_ROWS): { shown: T[]; more: number } {
  return { shown: rows.slice(0, max), more: Math.max(0, rows.length - max) };
}
