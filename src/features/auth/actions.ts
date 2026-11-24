"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateAccessCode } from "@/lib/access-code";
import { readSiteUrl } from "@/lib/app-config";
import { displayName } from "@/lib/display-name";
import { emailEnabled, getEmailSender } from "@/lib/email";
import { renderEmailChangedNotice } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/server";
import { classifyDbError } from "@/lib/supabase/errors";
import { changeOwnCode, changeOwnEmail } from "@/features/accounts/admin-ops";
import { ensureBootstrapUser, isBootstrapEmail } from "./bootstrap";
import type { FormState } from "./form-state";
import { clientIp } from "./limiter-keys";
import {
  limitedPasswordLogin,
  createThrowawayClient,
  verifyCurrentCode,
  type LoginOutcome,
} from "./login";
import {
  EMAILS_DIFFER,
  EMAIL_NOT_USABLE,
  GENERIC_FAILURE,
  INVALID_CREDENTIALS,
  RECOVERY_LINK_INVALID,
  RECOVERY_SENT,
  SAME_EMAIL,
  SESSION_EXPIRED,
  UNAVAILABLE,
  WRONG_CURRENT_CODE,
  tooManyAttempts,
} from "./messages";
import { HOME_PATH, resolvePostLogin, type PostLoginUser } from "./post-login";
import {
  changeCodeSchema,
  changeEmailSchema,
  formFields,
  recoveryConfirmSchema,
  recoveryRequestSchema,
  signInSchema,
} from "./schemas";

/**
 * Server actions of access and account (plan §4.3, §4.5, §4.6). Session ALWAYS from the cookies
 * (never an id or token argument), then the DB decides. Errors are neutral; codes are never
 * logged or returned. Redirects after success go through `resolvePostLogin`.
 */

const error = (message: string, field?: { name: string; message: string }): FormState => ({
  status: "error",
  message,
  ...(field ? { field } : {}),
});

function loginFailure(outcome: Exclude<LoginOutcome, { status: "ok" }>): FormState {
  switch (outcome.status) {
    case "blocked":
      return error(tooManyAttempts());
    case "invalid":
      return error(INVALID_CREDENTIALS);
    case "unavailable":
      return error(UNAVAILABLE);
  }
}

async function destinationFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: PostLoginUser,
): Promise<string> {
  const result = await resolvePostLogin(supabase, user);
  // A DB hiccup here is not a login failure: the guards decide on the next request.
  return result.status === "ok" ? result.to : HOME_PATH;
}

// ------------------------------------------------------------------------------------ sign in

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(formFields(formData));
  // A malformed email or an empty code gets the same neutral answer as a wrong one.
  if (!parsed.success) return error(INVALID_CREDENTIALS);
  const { email, code } = parsed.data;

  // The first user is created here when the typed email is the bootstrap one (create-only).
  if (isBootstrapEmail(email)) await ensureBootstrapUser().catch(() => undefined);

  const supabase = await createClient();
  const ip = clientIp(await headers());
  const outcome = await limitedPasswordLogin(supabase.auth, { email, code, ip });
  if (outcome.status !== "ok") return loginFailure(outcome);

  redirect(await destinationFor(supabase, outcome.user));
}

// ----------------------------------------------------------------------------------- sign out

/** "Esci". The drafts of the device are removed by `SignOutButton` (client) just before. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // Offline backend: the cookies are cleared by the client anyway.
  }
  redirect("/accesso");
}

// ---------------------------------------------------------------------------------- recovery

/** "Hai dimenticato il codice?" (only with emails on). Always the same answer: no enumeration. */
export async function requestRecoveryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!emailEnabled()) return error(GENERIC_FAILURE);
  const parsed = recoveryRequestSchema.safeParse(formFields(formData));
  if (!parsed.success) return { status: "success", message: RECOVERY_SENT };
  try {
    // Throwaway client: this request must never create or touch a session cookie.
    await createThrowawayClient().auth.resetPasswordForEmail(parsed.data.email);
  } catch {
    // Same answer whatever happens.
  }
  return { status: "success", message: RECOVERY_SENT };
}

/**
 * `/auth/conferma` (POST): the link only carries the one-time token, the page consumes it here with
 * the NEW code chosen by the person. The session created by the token is fresh, the code is then
 * set through the admin path (§4.8), exactly like a normal change, and the user signs in again.
 */
export async function confirmRecoveryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!emailEnabled()) return error(GENERIC_FAILURE);
  const parsed = recoveryConfirmSchema.safeParse(formFields(formData));
  if (!parsed.success) return error(RECOVERY_LINK_INVALID);
  const { tokenHash, newCode } = parsed.data;

  const early = validateAccessCode(newCode);
  if (!early.ok) return error(early.message, { name: "newCode", message: early.message });

  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (verified.error || !verified.data.user?.email) {
    const kind = verified.error ? classifyDbError(verified.error) : null;
    return error(kind ? UNAVAILABLE : RECOVERY_LINK_INVALID);
  }
  const { user } = verified.data;
  const email = user.email as string;

  const policy = validateAccessCode(newCode, { email });
  if (!policy.ok) {
    await supabase.auth.signOut().catch(() => undefined);
    return error(`${policy.message} Chiedi un nuovo link.`);
  }

  const changed = await changeOwnCode(supabase, user.id, newCode);
  if (!changed.ok) return error(changed.error === "unavailable" ? UNAVAILABLE : GENERIC_FAILURE);

  // The admin update closed every session of the user, this one included: sign in again.
  const relogin = await supabase.auth.signInWithPassword({ email, password: newCode });
  if (relogin.error || !relogin.data.user) redirect("/accesso");
  redirect(await destinationFor(supabase, relogin.data.user));
}

// ------------------------------------------------------------------------------ own account

type Session = { id: string; email: string };

async function currentSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Session | null> {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  const email = data?.claims?.email;
  return id && typeof email === "string" ? { id, email } : null;
}

/** First/last name and label of the signed-in partner: used by the "no personal data" code rule. */
async function ownPerson(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null; label: string | null }> {
  const { data } = await supabase
    .from("wedding_partners")
    .select("first_name,last_name,label")
    .eq("user_id", userId)
    .limit(1);
  const row = (
    data as { first_name: string | null; last_name: string | null; label: string | null }[] | null
  )?.[0];
  return {
    firstName: row?.first_name ?? null,
    lastName: row?.last_name ?? null,
    label: row?.label ?? null,
  };
}

async function checkCurrentCode(email: string, code: string): Promise<FormState | null> {
  const outcome = await verifyCurrentCode({ email, code, ip: clientIp(await headers()) });
  if (outcome.status === "ok") return null;
  if (outcome.status === "invalid") {
    return error(WRONG_CURRENT_CODE, { name: "currentCode", message: WRONG_CURRENT_CODE });
  }
  return loginFailure(outcome);
}

/** Change of the signed-in user's own code (AC56): current code first, same limiter as the login. */
export async function changeCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  const parsed = changeCodeSchema.safeParse(fields);
  if (!parsed.success) return error(GENERIC_FAILURE);
  const { currentCode, newCode } = parsed.data;

  const supabase = await createClient();
  const session = await currentSession(supabase);
  if (!session) return error(SESSION_EXPIRED);

  const person = await ownPerson(supabase, session.id);
  const policy = validateAccessCode(newCode, { email: session.email, ...person });
  if (!policy.ok) return error(policy.message, { name: "newCode", message: policy.message });
  if (newCode === currentCode) {
    const message = "Il nuovo codice deve essere diverso da quello attuale.";
    return error(message, { name: "newCode", message });
  }

  const refused = await checkCurrentCode(session.email, currentCode);
  if (refused) return refused;

  const changed = await changeOwnCode(supabase, session.id, newCode);
  if (!changed.ok) return error(changed.error === "unavailable" ? UNAVAILABLE : GENERIC_FAILURE);

  // The admin update ended the old sessions: a new one with the new code, on the cookie client.
  const relogin = await supabase.auth.signInWithPassword({
    email: session.email,
    password: newCode,
  });
  if (relogin.error || !relogin.data.user) redirect("/accesso");

  if (fields["forced"] === "1") redirect(await destinationFor(supabase, relogin.data.user));
  return { status: "success", message: "Fatto: da ora entri con il nuovo codice." };
}

/** Change of the signed-in user's own login email (AC58): twice, plus the current code. */
export async function changeEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changeEmailSchema.safeParse(formFields(formData));
  if (!parsed.success) {
    return error("Controlla l'email: non sembra un indirizzo valido.", {
      name: "newEmail",
      message: "Controlla l'email: non sembra un indirizzo valido.",
    });
  }
  const { newEmail, newEmailConfirm, currentCode } = parsed.data;
  if (newEmail !== newEmailConfirm) {
    return error(EMAILS_DIFFER, { name: "newEmailConfirm", message: EMAILS_DIFFER });
  }

  const supabase = await createClient();
  const session = await currentSession(supabase);
  if (!session) return error(SESSION_EXPIRED);
  if (newEmail === session.email.trim().toLowerCase()) {
    return error(SAME_EMAIL, { name: "newEmail", message: SAME_EMAIL });
  }

  const refused = await checkCurrentCode(session.email, currentCode);
  if (refused) return refused;

  const person = await ownPerson(supabase, session.id);
  const changed = await changeOwnEmail(supabase, session.id, newEmail);
  if (!changed.ok) {
    if (changed.error === "email_in_use")
      return error(EMAIL_NOT_USABLE, { name: "newEmail", message: EMAIL_NOT_USABLE });
    if (changed.error === "same_email")
      return error(SAME_EMAIL, { name: "newEmail", message: SAME_EMAIL });
    return error(changed.error === "unavailable" ? UNAVAILABLE : GENERIC_FAILURE);
  }

  // Step 3: copy the Auth email to the partner row; `post-login` retries it if this fails.
  await supabase.rpc("sync_my_email").then(
    () => undefined,
    () => undefined,
  );
  // New claims (the JWT still carries the old address until refreshed).
  await supabase.auth.refreshSession().catch(() => undefined);

  if (emailEnabled() && changed.oldEmail) {
    try {
      const rendered = renderEmailChangedNotice({
        recipientName: displayName(person, "a te"),
        loginUrl: `${readSiteUrl()}/accesso`,
      });
      await getEmailSender().send({ to: changed.oldEmail, ...rendered });
    } catch {
      // The notice is best effort: the change itself is done.
    }
  }
  return { status: "success", message: "Fatto: da ora entri con la nuova email." };
}
