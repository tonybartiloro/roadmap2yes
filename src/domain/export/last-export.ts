import { diffDays, todayInRome, type PlainDate } from "@/lib/dates/plain-date";

export const EXPORT_REMINDER_DAYS = 30;

export interface LastExport {
  /** `null` = never exported. */
  readonly days: number | null;
  /** "ultimo export: 3 giorni fa" or "Non hai ancora esportato i dati". */
  readonly label: string;
  /** True after 30 days, or when there never was an export (AC42). */
  readonly reminder: boolean;
}

/** `lastExportAt` is the ISO timestamp from `user_wedding_state.last_export_at`. */
export function lastExport(lastExportAt: string | null, today: PlainDate): LastExport {
  if (!lastExportAt) {
    return { days: null, label: "Non hai ancora esportato i dati", reminder: true };
  }
  const days = Math.max(0, diffDays(todayInRome(new Date(lastExportAt)), today));
  const when = days === 0 ? "oggi" : days === 1 ? "1 giorno fa" : `${days} giorni fa`;
  return { days, label: `ultimo export: ${when}`, reminder: days >= EXPORT_REMINDER_DAYS };
}
