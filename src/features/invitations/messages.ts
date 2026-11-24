import type { AccountOpError } from "@/features/accounts/admin-ops";
import { EMAIL_NOT_USABLE, SESSION_EXPIRED, UNAVAILABLE } from "@/features/auth/messages";

/** User-facing texts of the partner invite (italiano, "tu"). Errors never echo a code. */

export const PARTNER_FAILED = "Non è riuscito: riprova.";
export const EMAIL_OFF_INVITE =
  "Le email sono disattivate: l'invito per email non c'è. Dai tu il codice di persona.";
export const CODE_CREATED =
  "Fatto: l'accesso è pronto. Consegna il codice di persona: qui non lo rivedrai.";
export const TEMP_CODE_SET =
  "Fatto: il codice temporaneo è pronto. Consegnalo di persona: al prossimo accesso dovrà sceglierne uno suo.";
export const OLD_LINK_NOT_KILLED = "Non sono riuscito a invalidare il vecchio link, riprova.";
export const EMAIL_CHANGED = "Fatto: l'email è cambiata.";
export const INVITE_REVOKED = "Invito revocato.";
export const INVITE_SENT = "Fatto: l'invito è partito.";
export const INVITE_NOT_SENT =
  "L'email non è partita. L'invito è in attesa: copia il link e mandalo tu, oppure riprova con «Invia di nuovo».";

/** Text and (when it belongs to one field) the field, for an operation failure. */
export function failureMessage(error: AccountOpError): { message: string; field?: string } {
  switch (error) {
    case "email_in_use":
      return { message: EMAIL_NOT_USABLE, field: "email" };
    case "same_email":
      return { message: "È la tua stessa email: scrivi quella del tuo partner.", field: "email" };
    case "partner_already_joined":
      return {
        message:
          "Il tuo partner ha già fatto il primo accesso: l'email di accesso può cambiarla solo il tuo partner.",
      };
    case "invitation_pending":
      return {
        message:
          "C'è già un invito in attesa. Revocalo prima, oppure usa «Invia di nuovo» per ripeterlo.",
      };
    case "partner_email_mismatch":
      return { message: "Per cambiare l'email del tuo partner usa «Cambia email»." };
    case "already_accepted":
      return { message: "L'invito è già stato accettato: non si può più annullare." };
    case "no_account":
      return { message: "Il tuo partner non ha ancora un accesso a cui dare un codice." };
    case "unauthenticated":
    case "not_partner":
      return { message: SESSION_EXPIRED };
    case "unavailable":
      return { message: UNAVAILABLE };
    default:
      return { message: PARTNER_FAILED };
  }
}

/** `/invito/[token]` */
export const INVITE_LINK_INVALID =
  "Questo invito non è più valido: è scaduto, è già stato usato o è stato annullato.";
export const INVITE_LINK_ACTION = "Chiedi a chi ti ha invitato di mandarne uno nuovo.";
export const INVITE_USED_HINT = "Se eri tu, entra dal login.";
