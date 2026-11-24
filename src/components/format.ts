import { parsePlainDate, type PlainDate } from "@/lib/dates/plain-date";

export const MONTHS_LONG = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

export const MONTHS_SHORT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
] as const;

/** "3 settembre 2027". */
export function formatLongDate(date: PlainDate): string {
  const { year, month, day } = parsePlainDate(date);
  return `${day} ${MONTHS_LONG[month - 1]} ${year}`;
}

/** "3 set 2027". */
export function formatShortDate(date: PlainDate): string {
  const { year, month, day } = parsePlainDate(date);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** "1 mag" (day and month only). */
export function formatDayMonth(date: PlainDate): string {
  const { month, day } = parsePlainDate(date);
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

/**
 * "€ 1.500,00" from integer cents, without going through floating point. Negative amounts keep
 * the sign in front of the euro sign ("-€ 12,00"); callers should avoid showing negatives.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount must be an integer of cents");
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "-" : ""}€ ${whole},${decimals}`;
}

/** Whole euros when the amount has no cents ("€ 1.200"), else with cents. */
export function formatCentsCompact(cents: number): string {
  return cents % 100 === 0 ? formatCents(cents).replace(/,00$/, "") : formatCents(cents);
}

/** "meno di un minuto", "2 minuti", "1 ora", "3 ore", "1 giorno", "4 giorni". */
export function formatElapsed(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return "meno di un minuto";
  if (minutes < 60) return minutes === 1 ? "1 minuto" : `${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora" : `${hours} ore`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 giorno" : `${days} giorni`;
}

/** Plural helper for Italian counts: `plural(1, "giorno", "giorni")`. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${Math.abs(count) === 1 ? one : many}`;
}
