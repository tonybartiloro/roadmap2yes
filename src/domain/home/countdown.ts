import { diffDays, todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import type { ResolvedReference } from "@/domain/timeline/reference";

export type Countdown =
  /** No reference at all: "Data da decidere" (AC26). */
  | { readonly kind: "none" }
  | {
      readonly kind: "definitive" | "provisional";
      readonly date: PlainDate;
      /** Negative once the date has passed. */
      readonly days: number;
      /** Whole weeks (`floor(days / 7)`), "284 giorni (40 settimane)". */
      readonly weeks: number;
      readonly phase: "upcoming" | "today" | "past";
    };

/**
 * Countdown for the Home (AC26). `today` is a calendar date; use `countdownAt(reference, now)` at
 * the edges to derive it in Europe/Rome (23:30 UTC the evening before is already the next day
 * in Rome).
 */
export function countdown(reference: ResolvedReference | null, today: PlainDate): Countdown {
  if (!reference) return { kind: "none" };
  const days = diffDays(today, reference.date);
  return {
    kind: reference.status,
    date: reference.date,
    days,
    weeks: days >= 0 ? Math.floor(days / 7) : -Math.floor(-days / 7),
    phase: days > 0 ? "upcoming" : days === 0 ? "today" : "past",
  };
}

export function countdownAt(reference: ResolvedReference | null, now: Date): Countdown {
  return countdown(reference, todayInRome(now));
}
