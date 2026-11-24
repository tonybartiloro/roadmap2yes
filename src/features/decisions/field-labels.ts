import type { FieldLabels } from "@/components/ConflictDialog";
import { formatEuro } from "@/lib/money";
import { formatShortDate } from "@/components/format";
import { isPlainDate } from "@/lib/dates/plain-date";

/**
 * Field to Italian label for the edit-conflict dialog (design §4.1, DES-29). Only fields with a
 * label are compared; internal columns (`version`, ids) never appear.
 */
export const OPTION_FIELD_LABELS: FieldLabels = {
  title: "Nome",
  comune: "Comune",
  link: "Link",
  costCents: "Costo indicativo",
  pros: "Pro",
  cons: "Contro",
  notes: "Note",
};

/** The option row of a date: only the label and the notes live there. */
export const DATE_OPTION_FIELD_LABELS: FieldLabels = {
  title: "Etichetta",
  notes: "Note",
};

/** The scenario row of a date. */
export const SCENARIO_FIELD_LABELS: FieldLabels = {
  kind: "Tipo",
  dateFrom: "Data o inizio del periodo",
  dateTo: "Fine del periodo",
  locationOptionId: "Collegata a una location",
};

/** Labels of the fields listed in an `option_updated` event payload (DB column names). */
export const EVENT_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: "nome",
  comune: "comune",
  link: "link",
  notes: "note",
  pros: "pro",
  cons: "contro",
  cost_cents: "costo indicativo",
  location_option_id: "location collegata",
  kind: "tipo",
  date_from: "data",
  date_to: "fine del periodo",
};

/** Renders a value of the conflict table (euros, lists, dates). */
export function formatConflictValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "costCents" && typeof value === "number") return formatEuro(value);
  if ((field === "dateFrom" || field === "dateTo") && isPlainDate(value)) {
    return formatShortDate(value);
  }
  if (field === "kind") return value === "period" ? "Periodo" : "Data fissa";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join("; ");
  return String(value);
}
