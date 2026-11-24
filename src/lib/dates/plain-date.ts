/**
 * Date-only arithmetic (plan §5, AC28). A `PlainDate` is a `YYYY-MM-DD` string: no time, no zone.
 *
 * All calculations use integer civil-calendar math (`Date.UTC` as a day counter), never the local
 * zone, so results never depend on `TZ` or on daylight-saving changes. The same rule is
 * implemented in SQL (`private.add_date_offset`, T8) and both are checked against
 * `tests/fixtures/date-offset-vectors.json`.
 */
export type PlainDate = string;

/** Offset BEFORE the reference date: positive = before, negative = after. All fields optional. */
export interface DateOffset {
  readonly months?: number;
  readonly weeks?: number;
  readonly days?: number;
}

export const ROME_TIME_ZONE = "Europe/Rome";

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface Ymd {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== "string") return false;
  const m = PLAIN_DATE_RE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parsePlainDate(value: PlainDate): Ymd {
  if (!isPlainDate(value)) throw new RangeError(`Invalid plain date: ${String(value)}`);
  const m = PLAIN_DATE_RE.exec(value)!;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatPlainDate({ year, month, day }: Ymd): PlainDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toDayNumber(date: PlainDate): number {
  const { year, month, day } = parsePlainDate(date);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromDayNumber(days: number): PlainDate {
  const d = new Date(days * MS_PER_DAY);
  return formatPlainDate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

/** Adds (or subtracts, if negative) calendar days. */
export function addDays(date: PlainDate, days: number): PlainDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Adds calendar months, clamping to the last day of the target month (31 Aug − 2 m = 30 Jun). */
export function addMonths(date: PlainDate, months: number): PlainDate {
  const { year, month, day } = parsePlainDate(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (((total % 12) + 12) % 12) + 1;
  return formatPlainDate({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) });
}

/**
 * Due date for a milestone offset: months FIRST (with end-of-month clamp), THEN weeks and days.
 * Positive offsets move BEFORE the reference, negative ones AFTER it.
 * 2 m + 2 w before 2027-08-31 → 2027-06-30 → 2027-06-16 (weeks first would give 2027-06-17).
 */
export function applyOffset(reference: PlainDate, offset: DateOffset): PlainDate {
  const { months = 0, weeks = 0, days = 0 } = offset;
  return addDays(addMonths(reference, -months), -(weeks * 7 + days));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: PlainDate, to: PlainDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function comparePlainDates(a: PlainDate, b: PlainDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "Today" as a calendar date in Europe/Rome for the given instant (plan §1.1, AC26). */
export function todayInRome(now: Date): PlainDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
