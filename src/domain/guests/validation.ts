import { GUEST_CATEGORIES, GUEST_SIDES } from "./types";

export const LIMITS = { name: 80, notes: 500, email: 254, phoneMin: 6, phoneMax: 20 } as const;

// Same rules as the database checks (guests table and core.sql email check).
const PHONE_RE = /^[0-9+()./ -]+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type GuestInput = {
  firstName?: string | null;
  lastName?: string | null;
  category?: string | null;
  side?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type GuestField =
  "firstName" | "lastName" | "category" | "side" | "phone" | "email" | "notes";
export type GuestErrors = Partial<Record<GuestField, string>>;

const trimmed = (v: string | null | undefined) => (v ?? "").trim();

export function validateFirstName(value: string | null | undefined): string | null {
  const v = trimmed(value);
  if (v === "") return "Scrivi il nome.";
  if (v.length > LIMITS.name) return `Il nome può avere al massimo ${LIMITS.name} caratteri.`;
  return null;
}

export function validateLastName(value: string | null | undefined): string | null {
  return trimmed(value).length > LIMITS.name
    ? `Il cognome può avere al massimo ${LIMITS.name} caratteri.`
    : null;
}

/** Optional: empty is valid. */
export function validatePhone(value: string | null | undefined): string | null {
  const v = trimmed(value);
  if (v === "") return null;
  if (!PHONE_RE.test(v)) return "Il telefono può contenere solo cifre, spazi e + ( ) - . /";
  if (v.length < LIMITS.phoneMin || v.length > LIMITS.phoneMax) {
    return `Il telefono deve avere da ${LIMITS.phoneMin} a ${LIMITS.phoneMax} caratteri.`;
  }
  return null;
}

/** Optional: empty is valid. */
export function validateEmail(value: string | null | undefined): string | null {
  const v = trimmed(value);
  if (v === "") return null;
  if (v.length > LIMITS.email || !EMAIL_RE.test(v)) return "Controlla l'email: manca qualcosa.";
  return null;
}

export function validateNotes(value: string | null | undefined): string | null {
  return trimmed(value).length > LIMITS.notes
    ? `Le note possono avere al massimo ${LIMITS.notes} caratteri.`
    : null;
}

/** All field errors at once (empty object = valid). Category and side use the stored values. */
export function validateGuest(input: GuestInput): GuestErrors {
  const errors: GuestErrors = {};
  const set = (field: GuestField, message: string | null) => {
    if (message) errors[field] = message;
  };
  set("firstName", validateFirstName(input.firstName));
  set("lastName", validateLastName(input.lastName));
  set("phone", validatePhone(input.phone));
  set("email", validateEmail(input.email));
  set("notes", validateNotes(input.notes));
  const category = input.category ?? "adult";
  if (!(GUEST_CATEGORIES as readonly string[]).includes(category)) {
    errors.category = "Scegli adulto, bambino o neonato.";
  }
  if (input.side != null && !(GUEST_SIDES as readonly string[]).includes(input.side)) {
    errors.side = "Scegli un lato valido.";
  }
  return errors;
}
