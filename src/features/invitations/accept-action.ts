"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeInviteToken } from "@/features/accounts/admin-ops";
import type { FormState } from "@/features/auth/form-state";
import { clientIp } from "@/features/auth/limiter-keys";
import { limitedPasswordLogin } from "@/features/auth/login";
import {
  GENERIC_FAILURE,
  INVALID_CREDENTIALS,
  UNAVAILABLE,
  tooManyAttempts,
} from "@/features/auth/messages";
import { HOME_PATH, resolvePostLogin } from "@/features/auth/post-login";
import { formFields } from "@/features/auth/schemas";
import { validateAccessCode } from "@/lib/access-code";
import { createClient } from "@/lib/supabase/server";
import { INVITE_LINK_INVALID } from "./messages";
import { acceptInviteSchema } from "./schemas";
import { hashInviteToken, isTokenShape } from "./token";

/**
 * `/invito/[token]` (POST, no session; plan §4.5.2, §4.8): B chooses their code. The link is read
 * by GET without consuming anything; the effect happens here. Order: `invitation_by_token` (DB,
 * secret key) → `updateUserById(user_id, { password })` → sign in (same limiter as the login) →
 * `accept_pending_invitation` through `resolvePostLogin`. The link is single use because the
 * acceptance makes the invitation (and the never-signed-in account) no longer reusable; until then
 * a failure leaves the link valid and repeating converges. The token is never logged.
 */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = acceptInviteSchema.safeParse(formFields(formData));
  if (!parsed.success || !isTokenShape(parsed.data.token)) {
    return { status: "error", message: INVITE_LINK_INVALID };
  }
  const { token, code } = parsed.data;

  // Quick, specific answer before touching anything (the policy that needs the email runs after).
  const early = validateAccessCode(code);
  if (!early.ok) {
    return {
      status: "error",
      message: early.message,
      field: { name: "code", message: early.message },
    };
  }

  const consumed = await consumeInviteToken(hashInviteToken(token), code, (email) => {
    const policy = validateAccessCode(code, { email });
    return policy.ok ? null : policy.message;
  });
  if (!consumed.ok) {
    switch (consumed.error) {
      case "invalid_link":
        return { status: "error", message: INVITE_LINK_INVALID };
      case "policy":
        return {
          status: "error",
          message: consumed.message,
          field: { name: "code", message: consumed.message },
        };
      case "unavailable":
        return { status: "error", message: UNAVAILABLE };
      default:
        return { status: "error", message: GENERIC_FAILURE };
    }
  }

  const supabase = await createClient();
  const ip = clientIp(await headers());
  const outcome = await limitedPasswordLogin(supabase.auth, { email: consumed.email, code, ip });
  if (outcome.status === "blocked") return { status: "error", message: tooManyAttempts() };
  if (outcome.status === "unavailable") return { status: "error", message: UNAVAILABLE };
  if (outcome.status !== "ok") return { status: "error", message: INVALID_CREDENTIALS };

  const destination = await resolvePostLogin(supabase, outcome.user);
  redirect(destination.status === "ok" ? destination.to : HOME_PATH);
}
