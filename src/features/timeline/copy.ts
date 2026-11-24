import { diffDays, type PlainDate } from "@/lib/dates/plain-date";
import { formatShortDate, plural } from "@/components/format";

/** Italian copy of the Percorso (design §7.1: informal "tu"). One place, so tests can pin it. */
export const COPY = {
  title: "Percorso",
  emptyTasksTitle: "Ancora nessun compito. Aggiungi il primo.",
  adessoEmpty: "Per ora niente di urgente.",
  recoverTone: "Di solito si fa prima, ma hai ancora tempo.",
  noDeadline: "Senza scadenza",
  reviewBadge: "Da rivedere",
  reviewOk: "Va bene così",
  reopenedBanner: "Data riaperta: scadenze calcolate sull'ultima data scelta.",
  nearestExplanation: "Il più vicino: lo usiamo per non farti arrivare tardi.",
  decisionTakenExplanation: "La data è scelta: per cambiare le scadenze riapri la scelta.",
  noScenario:
    "Nessuna data scelta: i compiti legati alla data compaiono appena aggiungi uno scenario.",
  addFirstScenario: "Aggiungi il primo scenario",
  chooseDate: "Scegli questa data",
  setReference: "Imposta come riferimento",
  previewExit: "Esci",
  previewIdle: "Nulla è salvato",
  undo: "Annulla",
} as const;

/** Undo toasts stay at least 8 s (AC31, design §8). */
export const UNDO_TOAST_MS = 10_000;

/** "tra 3 settimane", "domani", "2 settimane fa": exact date goes in a tooltip and for screen readers. */
export function relativeDue(due: PlainDate, today: PlainDate): string {
  const days = diffDays(today, due);
  if (days === 0) return "oggi";
  if (days === 1) return "domani";
  if (days === -1) return "ieri";
  const abs = Math.abs(days);
  let amount: string;
  if (abs < 14) amount = plural(abs, "giorno", "giorni");
  else if (abs < 60) amount = plural(Math.round(abs / 7), "settimana", "settimane");
  else if (abs < 700) amount = plural(Math.round(abs / 30), "mese", "mesi");
  else amount = plural(Math.round(abs / 365), "anno", "anni");
  return days > 0 ? `tra ${amount}` : `${amount} fa`;
}

/** "tra 3 settimane (12 mar 2027)": for screen readers and the title attribute. */
export function dueExactText(due: PlainDate, today: PlainDate): string {
  return `${relativeDue(due, today)} (${formatShortDate(due)})`;
}
