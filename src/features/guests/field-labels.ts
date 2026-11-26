import type { FieldLabels } from "@/components/ConflictDialog";
import {
  CATEGORY_LABELS,
  GUEST_CATEGORIES,
  GUEST_SIDES,
  type GuestCategory,
} from "@/domain/guests";

/**
 * Field to Italian label for the edit-conflict dialog (DES-29). Keys match the `*Fields` of
 * `data.ts`; only fields with a label are compared, internal columns (`version`) never appear.
 */
export const GUEST_FIELD_LABELS: FieldLabels = {
  firstName: "Nome",
  lastName: "Cognome",
  category: "Tipo",
  side: "Lato",
  phone: "Telefono",
  email: "Email",
  notes: "Note",
  groupId: "Gruppo",
  tableId: "Tavolo",
};

export const GROUP_FIELD_LABELS: FieldLabels = { name: "Nome" };

export const TABLE_FIELD_LABELS: FieldLabels = { name: "Nome", capacity: "Posti" };

/** What the formatter needs to turn stored values into words (ids into names, A/B into partners). */
export interface ConflictContext {
  partnerA: string;
  partnerB: string;
  groups: ReadonlyMap<string, string>;
  tables: ReadonlyMap<string, string>;
}

/** Renders a value of the conflict table (types, sides, names of groups and tables). */
export function formatConflictValue(
  field: string,
  value: unknown,
  context?: ConflictContext,
): string {
  if (value === null || value === undefined || value === "") {
    if (field === "side") return "Non indicato";
    if (field === "groupId") return "Senza gruppo";
    if (field === "tableId") return "Senza tavolo";
    return "—";
  }
  if (field === "category" && (GUEST_CATEGORIES as readonly string[]).includes(String(value))) {
    return CATEGORY_LABELS[value as GuestCategory];
  }
  if (field === "side" && (GUEST_SIDES as readonly string[]).includes(String(value))) {
    if (value === "both") return "Entrambi";
    return value === "A" ? (context?.partnerA ?? "A") : (context?.partnerB ?? "B");
  }
  if (field === "groupId") return context?.groups.get(String(value)) ?? "Un gruppo";
  if (field === "tableId") return context?.tables.get(String(value)) ?? "Un tavolo";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return String(value);
}
