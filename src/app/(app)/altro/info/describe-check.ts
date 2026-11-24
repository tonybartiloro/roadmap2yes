import { formatLongDate } from "@/components/format";
import { diffDays, todayInRome } from "@/lib/dates/plain-date";

const ROME = "Europe/Rome";

/** "oggi alle 06:12", "ieri alle 06:12" or "3 dicembre 2026 alle 06:12", in Rome time. */
export function describeCheck(at: Date, now: Date): string {
  const time = new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  const day = todayInRome(at);
  const gap = diffDays(day, todayInRome(now));
  const when = gap === 0 ? "oggi" : gap === 1 ? "ieri" : formatLongDate(day);
  return `${when} alle ${time}`;
}

/** Text of the "Ultimo controllo" row; `null` = no run yet or not readable. */
export function checkLabel(at: Date | null, now: Date): string {
  return at ? describeCheck(at, now) : "ancora nessuno";
}
