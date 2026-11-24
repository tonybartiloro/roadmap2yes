import type { FieldLabels } from "@/components/ConflictDialog";
import { formatShortDate } from "@/components/format";
import { isPlainDate } from "@/lib/dates/plain-date";
import { formatEuro } from "@/lib/money";
import { asKind, asStatus, KIND_LABELS, STATUS_LABELS } from "./model";

/**
 * Field to Italian label for the edit-conflict dialog (design §4.1, DES-29). Only fields with a
 * label are compared; internal columns (`version`) never appear.
 */
export const CATEGORY_FIELD_LABELS: FieldLabels = {
  name: "Nome",
  assignedCents: "Assegnato",
};

export const ITEM_FIELD_LABELS: FieldLabels = {
  description: "Descrizione",
  status: "Stato",
  plannedCents: "Importo previsto",
  agreedCents: "Importo concordato",
};

export const PAYMENT_FIELD_LABELS: FieldLabels = {
  kind: "Tipo",
  amountCents: "Importo",
  dueDate: "Scadenza",
  paid: "Pagato",
  paidOn: "Data del pagamento",
};

/** Renders a value of the conflict table (euros, statuses, dates). */
export function formatConflictValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return field === "assignedCents" ? "Non assegnato" : "—";
  }
  if (field.endsWith("Cents") && typeof value === "number") return formatEuro(value);
  if ((field === "dueDate" || field === "paidOn") && isPlainDate(value)) {
    return formatShortDate(value);
  }
  if (field === "status" && typeof value === "string") return STATUS_LABELS[asStatus(value)];
  if (field === "kind" && typeof value === "string") return KIND_LABELS[asKind(value)];
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return String(value);
}
