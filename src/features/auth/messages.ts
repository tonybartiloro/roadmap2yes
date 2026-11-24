import { readLoginLimits } from "@/lib/app-config";

/**
 * User-facing texts of access and account (italiano, "tu"). Errors are NEUTRAL: the same text for an
 * unknown email and a wrong code, and for a blocked attempt whatever the email (AC2, D49).
 */
export const INVALID_CREDENTIALS = "Email o codice non corretti.";

export function tooManyAttempts(lockMinutes = readLoginLimits().lockMinutes): string {
  return `Troppi tentativi. Riprova tra ${lockMinutes} minuti.`;
}

export const UNAVAILABLE = "Adesso non riesco a collegarmi. Riprova tra poco.";
export const GENERIC_FAILURE = "Non è andata a buon fine. Riprova.";
export const WRONG_CURRENT_CODE = "Il codice attuale non è corretto.";
export const EMAIL_NOT_USABLE = "Questa email non si può usare.";
export const SAME_EMAIL = "Questa è già la tua email di accesso.";
export const EMAILS_DIFFER = "Le due email non coincidono.";
export const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo.";
export const RECOVERY_SENT =
  "Se questo indirizzo può entrare, ti abbiamo mandato un link per scegliere un nuovo codice.";
export const RECOVERY_LINK_INVALID = "Il link è scaduto o è già stato usato. Chiedine uno nuovo.";
