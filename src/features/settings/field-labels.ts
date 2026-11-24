import type { FieldLabels } from "@/components/ConflictDialog";
import { GUEST_BAND_LABELS, RITE_LABELS, isGuestBand } from "@/features/onboarding/model";
import { isRiteKey } from "./model";

/**
 * Field to Italian label for the edit-conflict dialog (design §4.1). Only fields with a label are
 * compared; internal columns (`version`) never appear.
 */
export const SETTINGS_FIELD_LABELS: FieldLabels = {
  rite: "Rito",
  guestBand: "Invitati",
  styleLabel: "Stile",
  styleNote: "Nota sullo stile",
  region: "Regione",
  comune: "Comune",
};

export const PERSON_FIELD_LABELS: FieldLabels = {
  firstName: "Nome",
  lastName: "Cognome",
  label: "Etichetta",
};

export function formatSettingsValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "rite" && isRiteKey(value)) return RITE_LABELS[value];
  if (field === "guestBand" && isGuestBand(value)) return GUEST_BAND_LABELS[value];
  return String(value);
}
