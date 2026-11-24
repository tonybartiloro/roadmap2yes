"use server";

import { revalidatePath } from "next/cache";
import { readSiteUrl } from "@/lib/app-config";
import { emailEnabled, getEmailSender } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { formFields } from "@/features/auth/schemas";
import { GENERIC_FAILURE } from "@/features/auth/messages";
import type { FormState } from "@/features/auth/form-state";
import type { InviteFormState, PartnerActionResult } from "./form-state";
import { INVITE_REVOKED, PARTNER_FAILED, TEMP_CODE_SET } from "./messages";
import {
  emailOnlySchema,
  invitationIdSchema,
  partnerSchema,
  partnerWithCodeSchema,
  temporaryCodeSchema,
} from "./schemas";
import {
  changePendingEmail,
  createPartnerByCode,
  giveTemporaryCode,
  inviteByEmail,
  resendInvite,
  revokeInvite,
  type InviteDeps,
  type ServiceFailure,
} from "./service";
import { generateInviteToken } from "./token";

/**
 * Server actions of the partner invite (plan §4.5, §4.6). The session ALWAYS comes from the cookies;
 * no id of a person is ever taken from the client except the invitation id, which the DB
 * authorizes (RLS + the RPC). Two flavours:
 *  - typed actions (`createPartnerAccount`, `invitePartnerByEmail`): the API the onboarding (T10)
 *    calls in step 2, plain serializable in and out;
 *  - form actions (`...Action`) for Altro > Invito (`useActionState`).
 * Codes are never logged, returned or kept after the call.
 */

function deps(): InviteDeps {
  return {
    emailOn: emailEnabled(),
    sender: getEmailSender(),
    siteUrl: readSiteUrl(),
    newToken: () => generateInviteToken(),
    now: () => new Date(),
  };
}

const INVITE_PATH = "/altro/invito";

function refresh(): void {
  revalidatePath(INVITE_PATH);
}

const formError = (failure: ServiceFailure): FormState => ({
  status: "error",
  message: failure.message,
  ...(failure.field ? { field: { name: failure.field, message: failure.message } } : {}),
});

const invalid = (message = GENERIC_FAILURE): FormState => ({ status: "error", message });

const BAD_EMAIL = "Controlla l'email: non sembra un indirizzo valido.";

// ---------------------------------------------------------------------------------- typed (T10)

/** "Crea l'accesso con un codice ora" (onboarding step 2, Altro > Invito). */
export async function createPartnerAccount(input: {
  email: string;
  code: string;
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
}): Promise<PartnerActionResult> {
  const parsed = partnerWithCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: BAD_EMAIL, field: "email" };
  }
  const result = await createPartnerByCode(await createClient(), parsed.data);
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: result.message }
    : {
        ok: false,
        error: result.error,
        message: result.message,
        ...(result.field ? { field: result.field } : {}),
      };
}

/** "Invita via email" (only with emails on; the link is returned once for "Copia link"). */
export async function invitePartnerByEmail(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
}): Promise<PartnerActionResult> {
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: BAD_EMAIL, field: "email" };
  }
  const result = await inviteByEmail(await createClient(), deps(), parsed.data);
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: result.message, delivery: result.delivery, link: result.link }
    : {
        ok: false,
        error: result.error,
        message: result.message,
        ...(result.field ? { field: result.field } : {}),
      };
}

// ------------------------------------------------------------------------------ forms (Altro)

export async function createPartnerWithCodeAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = partnerWithCodeSchema.safeParse(formFields(formData));
  if (!parsed.success) {
    return { status: "error", message: BAD_EMAIL, field: { name: "email", message: BAD_EMAIL } };
  }
  const result = await createPartnerByCode(await createClient(), parsed.data);
  if (!result.ok) return formError(result);
  refresh();
  return { status: "success", message: result.message };
}

export async function inviteByEmailAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = partnerSchema.safeParse(formFields(formData));
  if (!parsed.success) {
    return { status: "error", message: BAD_EMAIL, field: { name: "email", message: BAD_EMAIL } };
  }
  const result = await inviteByEmail(await createClient(), deps(), parsed.data);
  if (!result.ok) return formError(result);
  refresh();
  return { status: "success", message: result.message, link: result.link };
}

export async function resendInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = invitationIdSchema.safeParse(formFields(formData));
  if (!parsed.success) return invalid(PARTNER_FAILED);
  const result = await resendInvite(await createClient(), deps(), parsed.data.invitationId);
  if (!result.ok) return formError(result);
  refresh();
  return { status: "success", message: result.message, link: result.link };
}

export async function revokeInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = invitationIdSchema.safeParse(formFields(formData));
  if (!parsed.success) return invalid(PARTNER_FAILED);
  const result = await revokeInvite(await createClient(), parsed.data.invitationId);
  if (!result.ok) return formError(result);
  refresh();
  return { status: "success", message: INVITE_REVOKED };
}

export async function changePendingEmailAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = emailOnlySchema.safeParse(formFields(formData));
  if (!parsed.success) {
    return { status: "error", message: BAD_EMAIL, field: { name: "email", message: BAD_EMAIL } };
  }
  const result = await changePendingEmail(await createClient(), deps(), parsed.data.email);
  if (!result.ok) return formError(result);
  refresh();
  return "link" in result
    ? { status: "success", message: result.message, link: result.link }
    : { status: "success", message: result.message };
}

export async function setTemporaryCodeAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = temporaryCodeSchema.safeParse(formFields(formData));
  if (!parsed.success) return invalid(PARTNER_FAILED);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const selfId = claims?.claims?.sub;
  if (!selfId) return invalid("La sessione è scaduta. Entra di nuovo.");
  const { data } = await supabase
    .from("memberships")
    .select("partner_slot")
    .eq("user_id", selfId)
    .limit(1);
  const slot = (data as { partner_slot: string | null }[] | null)?.[0]?.partner_slot;
  if (slot !== "A" && slot !== "B") return invalid(PARTNER_FAILED);

  const result = await giveTemporaryCode(supabase, deps(), {
    selfSlot: slot,
    code: parsed.data.code,
  });
  if (!result.ok) return formError(result);
  refresh();
  return { status: "success", message: TEMP_CODE_SET };
}
